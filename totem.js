/* Chef Cozinha — Módulo Totem de Autoatendimento (kiosk)
   Fluxo: tela inicial personalizável -> catálogo -> carrinho -> caixa/Pix.
   Bloqueio kiosk: o cliente NUNCA sai pelo botão voltar; o máximo que alcança
   é a tela inicial. Somente o dono libera o dispositivo pelo Painel do Dono. */
(function () {
  'use strict';

  if (sessionStorage.getItem('totem_liberado') === '1') {
    sessionStorage.removeItem('totem_liberado');
    window.location.replace('/index.html');
    return;
  }

  var params = new URLSearchParams(window.location.search);
  var restauranteId = params.get('restaurante_id') || localStorage.getItem('restaurante_id') || '1';
  try { localStorage.setItem('restaurante_id', String(restauranteId)); } catch (e) { }

  var TOTEM_MESA = 'Totem 1';
  var IDLE_TIMEOUT_MIN = 45;
  var PERS = null;
  var SECOES = null;
  var SCREENSAVER = { enabled: false, segundos: 20, slides: [] };
  var STATUS = null;
  var PRODUTOS = [];
  var CATEGORIAS = [];
  var CAT_ATIVA = '__TODOS__';
  var CARRINHO = [];
  var ITEMAtual = null;
  var ITEM_QTD = 1;
  var ultimoPedidoId = null;
  var aguardandoPix = false;
  var idleDeadline = 0;
  var idleTimer = null;
  var CLIENTE_IDENTIFICADO = null;

  var $ = function (id) { return document.getElementById(id); };

  var socket = io({ query: { restaurante_id: String(restauranteId) } });

  /* ═══════════ BLOQUEIO KIOSK ═══════════ */

  (function instalarBlindagemHistorico() {
    var marcar = function () { try { history.pushState({ totem: Date.now() }, '', window.location.href); } catch (e) { } };
    marcar(); marcar(); marcar();
    window.addEventListener('popstate', function () {
      fecharTodosOverlays();
      esconderScreensaver();
      mostrarHome();
      marcar();
    });
  })();

  var _engolindoProximoClique = false;
  document.addEventListener('click', function (e) {
    if (_engolindoProximoClique) {
      e.stopPropagation();
      e.preventDefault();
      _engolindoProximoClique = false;
    }
  }, true);

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });
  document.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();
    if (window.scrollY <= 0 && e.touches && e.touches.length === 1) {
      var area = document.getElementById('products-area');
      if (area && !area.contains(e.target)) e.preventDefault();
    }
  }, { passive: false });

  ['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(function (ev) {
    document.addEventListener(ev, reiniciarInatividade, { passive: true });
  });

  socket.on('connect', function () {
    socket.emit('registrar_sessao', { nome: 'Autoatendimento (Totem)', cargo: 'Totem' });
    socket.emit('cliente_na_mesa', TOTEM_MESA);
    carregarStatus();
  });

  socket.on('connect_error', function () {
    exibirDesativado('Sem conexão com o servidor', 'Verifique a rede Wi-Fi do totem e aguarde. A tela volta sozinha quando a conexão retornar.');
  });

  /* O totem IGNORA comandos globais de navegação (navegar_para):
     nenhum broadcast pode tirar o cliente daqui. A saída é única e exclusiva
     pelo evento totem_liberado, disparado quando o dono libera o dispositivo. */
  socket.on('navegar_para', function () { });

  socket.on('ir_para_totem', function () {
    carregarStatus();
  });

  socket.on('totem_liberado', function () {
    try { sessionStorage.setItem('totem_liberado', '1'); } catch (e) { }
    window.location.replace('/index.html');
  });

  /* ═══════════ ROTAÇÃO REMOTA (só o dono aciona) ═══════════
     Única rotação de tela do sistema: alternância retrato ⇄ paisagem via
     API nativa (exige fullscreen). Sem hack CSS — se o dispositivo não
     suportar, apenas avisa e mantém a orientação atual. */
  var _totemPaisagem = true; // totem nasce em paisagem (lock no 1º toque)

  function totemAvisoSistema(msg) {
    var antigo = document.getElementById('totem-aviso-rotacao');
    if (antigo) antigo.remove();
    var t = document.createElement('div');
    t.id = 'totem-aviso-rotacao';
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);' +
      'z-index:2147483647;background:rgba(15,23,42,0.92);color:#fff;padding:12px 20px;' +
      'border-radius:12px;font-size:14px;font-weight:700;font-family:sans-serif;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.35);max-width:90vw;text-align:center;';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4000);
  }

  function totemAlternarOrientacao() {
    _totemPaisagem = !_totemPaisagem;
    var alvo = _totemPaisagem ? 'landscape' : 'portrait';
    var rotulo = _totemPaisagem ? 'paisagem' : 'retrato';

    var travar = function () {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock(alvo).then(function () {
          totemAvisoSistema('Tela do totem em modo ' + rotulo + ' (comando do dono).');
        }).catch(function () {
          totemAvisoSistema('Este dispositivo não permitiu girar para ' + rotulo + '.');
          _totemPaisagem = !_totemPaisagem;
        });
      } else {
        totemAvisoSistema('Este dispositivo não suporta trava de orientação.');
        _totemPaisagem = !_totemPaisagem;
      }
    };

    // A trava exige tela cheia — o totem já pede no primeiro toque,
    // mas garantimos aqui caso ainda não esteja.
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().then(travar).catch(travar);
    } else {
      travar();
    }
  }

  socket.on('totem_rotacionar', function () {
    totemAlternarOrientacao();
  });

  socket.on('configuracoes_atualizadas', function () {
    carregarStatus();
  });

  /* ═══════════ STATUS DO MÓDULO ═══════════ */

  function carregarStatus() {
    fetch('/api/totem/status?restaurante_id=' + encodeURIComponent(restauranteId))
      .then(function (r) { return r.json(); })
      .then(function (st) {
        STATUS = st;
        if (!st || !st.ativo) {
          if (st && st.feature_ativa === false) {
            exibirDesativado('Serviço não contratado', 'O módulo Totem de Autoatendimento não está ativo para este estabelecimento. Procure o responsável ou fale com o suporte Chef Cozinha.');
          } else {
            exibirDesativado('Autoatendimento indisponível', 'O totem está desativado neste momento.\nPor favor, chame um atendente.');
          }
        } else {
          aplicarStatus(st);
          ocultarDesativado();
          aplicarPersonalizacao(st.personalizacao);
        }
      })
      .catch(function () { });
  }

  function aplicarStatus(st) {
    TOTEM_MESA = st.mesa || 'Totem 1';
    IDLE_TIMEOUT_MIN = parseInt(st.idle_timeout_min, 10) > 0 ? parseInt(st.idle_timeout_min, 10) : 45;
    var lbl = $('totem-mesa-label');
    if (lbl) lbl.textContent = TOTEM_MESA;
    socket.emit('cliente_na_mesa', TOTEM_MESA);
  }

  function exibirDesativado(titulo, desc) {
    var scr = $('disabled-screen');
    if (!scr) return;
    $('disabled-title').textContent = titulo || 'Autoatendimento indisponível';
    $('disabled-desc').innerHTML = String(desc || '').replace(/\n/g, '<br/>');
    scr.style.display = 'flex';
    esconderScreensaver(true);
    $('totem-home').classList.remove('visible');
    $('category-bar').style.display = 'none';
    $('products-area').style.display = 'none';
    $('cart-bar').style.display = 'none';
    document.querySelector('.app-header').style.display = 'none';
    fecharTodosOverlays();
    pararInatividade();
  }

  function ocultarDesativado() {
    $('disabled-screen').style.display = 'none';
    $('category-bar').style.display = 'flex';
    $('products-area').style.display = 'block';
    document.querySelector('.app-header').style.display = 'flex';
    if (!$('totem-home').classList.contains('visible')) iniciarInatividade();
  }

  /* ═══════════ PERSONALIZAÇÃO DA TELA INICIAL ═══════════ */

  function aplicarPersonalizacao(p) {
    if (!p) return;
    PERS = p;
    SECOES = p.secoes || {};
    SCREENSAVER = p.screensaver || { enabled: false, segundos: 20, slides: [] };
    document.documentElement.style.setProperty('--primary', p.cor || '#fc4b15');
    var home = $('totem-home');
    home.classList.remove('layout-classico', 'layout-split', 'layout-minimal', 'layout-vitrine');
    home.classList.add('layout-' + (p.layout || 'classico'));
    var tipo = p.fundo_tipo || 'gradiente';
    var valor = p.fundo_valor || '#0f172a,#293548';
    if (tipo === 'cor') {
      home.style.background = valor.split(',')[0].trim();
    } else if (tipo === 'imagem') {
      home.style.background = '#0f172a url("' + valor.trim() + '") center/cover no-repeat';
    } else {
      var partes = valor.split(',').map(function (s) { return s.trim(); });
      home.style.background = 'linear-gradient(135deg, ' + (partes[0] || '#0f172a') + ' 0%, ' + (partes[1] || '#293548') + ' 100%)';
    }
    $('home-titulo').textContent = p.titulo || 'Bem-vindo!';
    $('home-subtitulo').textContent = p.subtitulo || '';
    var logo = $('home-logo-img');
    if (p.logo) {
      logo.src = p.logo;
      logo.style.display = 'block';
      $('home-icon-fallback').style.display = 'none';
    } else {
      logo.style.display = 'none';
      $('home-icon-fallback').style.display = 'block';
    }
    if (home.classList.contains('layout-vitrine') && !p.logo) {
      $('home-icon-fallback').style.display = 'block';
    }
    var h1 = document.querySelector('#restaurant-name');
    if (h1 && p.titulo) h1.innerHTML = p.titulo + ' <small>' + TOTEM_MESA + '</small>';
    renderSecoesHome();
  }

  /* ═══════════ SEÇÕES DA TELA INICIAL ═══════════ */

  function produtosDestaque() {
    var destaques = PRODUTOS.filter(function (p) { return p.categoria === 'Mais Pedidos' && p.originalId; });
    if (!destaques.length) destaques = PRODUTOS.slice(0, 8);
    return destaques.slice(0, 8);
  }

  function renderSecoesHome() {
    if (!SECOES) SECOES = {};
    var sec = SECOES;
    var temDestaquesBloco = false;

    if (sec.destaques !== false && PRODUTOS.length) {
      var lista = produtosDestaque();
      var row = $('sec-destaques-row');
      row.innerHTML = '';
      lista.forEach(function (p) {
        var c = document.createElement('div');
        c.className = 'mini-card';
        c.innerHTML =
          '<span class="mc-emoji">' + (p.emoji || '&#127869;&#65039;') + '</span>' +
          '<span class="mc-nome">' + esc(p.nome) + '</span>' +
          '<span class="mc-preco">R$ ' + (parseFloat(p.preco) || 0).toFixed(2).replace('.', ',') + '</span>';
        c.onclick = function (ev) {
          ev.stopPropagation();
          esconderHomeECatalogo();
          abrirItem(p);
        };
        row.appendChild(c);
      });
      if (lista.length) {
        $('sec-destaques-bloco').style.display = 'block';
        temDestaquesBloco = true;
      }
    }
    if (!temDestaquesBloco) $('sec-destaques-bloco').style.display = 'none';

    var card = sec.card || {};
    var temCard = !!(card.titulo || card.texto || card.imagem || card.emoji);
    var cc = $('card-custom');
    if (temCard) {
      cc.onclick = function (ev) {
        ev.stopPropagation();
        esconderHomeECatalogo();
        if (card.categoria && CATEGORIAS.indexOf(card.categoria) !== -1) {
          CAT_ATIVA = card.categoria;
          renderCategorias();
          renderProdutos();
        }
      };
      $('cc-titulo').textContent = card.titulo || '';
      $('cc-titulo').style.display = card.titulo ? 'block' : 'none';
      $('cc-texto').textContent = card.texto || '';
      $('cc-texto').style.display = card.texto ? 'block' : 'none';
      $('cc-emoji').textContent = card.emoji || '';
      $('cc-emoji').style.display = card.emoji ? 'inline' : 'none';
      var img = $('cc-imagem');
      if (card.imagem) { img.src = card.imagem; img.style.display = 'block'; }
      else img.style.display = 'none';
      cc.style.display = 'block';
    } else {
      cc.style.display = 'none';
    }

    if (sec.categorias !== false && CATEGORIAS.length) {
      var wrap = $('sec-categorias');
      wrap.innerHTML = '';
      CATEGORIAS.forEach(function (c) {
        var b = document.createElement('button');
        b.className = 'cat-bolha';
        b.textContent = c;
        b.onclick = function (ev) {
          ev.stopPropagation();
          CAT_ATIVA = c;
          renderCategorias();
          renderProdutos();
          esconderHomeECatalogo();
        };
        wrap.appendChild(b);
      });
      $('sec-categorias-bloco').style.display = 'block';
    } else {
      $('sec-categorias-bloco').style.display = 'none';
    }
  }

  /* ═══════════ PROTETOR DE TELA (slides no tempo ocioso) ═══════════ */

  var _ssAtivo = false;
  var _ssIdx = 0;
  var _ssCiclo = null;
  var _ssBgFlip = false;
  var _ultimaAtividade = Date.now();

  function slidesValidos() {
    return (SCREENSAVER.slides || []).filter(function (s) { return s && (s.imagem || s.titulo); });
  }

  function podeAbrirScreensaver() {
    if (!SCREENSAVER.enabled || !slidesValidos().length) return false;
    if (!STATUS || !STATUS.ativo) return false;
    if ($('disabled-screen').style.display === 'flex') return false;
    var overlays = ['cart-overlay', 'item-overlay', 'status-overlay'];
    for (var i = 0; i < overlays.length; i++) {
      if ($(overlays[i]).style.display === 'flex') return false;
    }
    if (CARRINHO.length) return false;
    return true;
  }

  function mostrarSlide(idx) {
    var slides = slidesValidos();
    if (!slides.length) return;
    _ssIdx = ((idx % slides.length) + slides.length) % slides.length;
    var s = slides[_ssIdx];
    var entra = $(_ssBgFlip ? 'ss-bg-b' : 'ss-bg-a');
    var sai = $(_ssBgFlip ? 'ss-bg-a' : 'ss-bg-b');
    _ssBgFlip = !_ssBgFlip;
    if (s.imagem) {
      entra.style.backgroundImage = 'url("' + s.imagem + '")';
    } else {
      entra.style.backgroundImage = 'none';
      entra.style.background = 'linear-gradient(135deg, #1e293b, #0f172a)';
    }
    entra.style.opacity = '1';
    sai.style.opacity = '0';
    $('slide-titulo').textContent = s.titulo || '';
    $('slide-subtitulo').textContent = s.subtitulo || '';
    var dots = $('slide-dots');
    dots.innerHTML = '';
    if (slides.length > 1) {
      slides.forEach(function (_, i) {
        var d = document.createElement('span');
        d.className = 'dot' + (i === _ssIdx ? ' on' : '');
        dots.appendChild(d);
      });
    } else {
      dots.innerHTML = '';
    }
  }

  function abrirScreensaver() {
    if (!podeAbrirScreensaver()) return;
    _ssAtivo = true;
    $('totem-screensaver').classList.add('visible');
    mostrarSlide(0);
    if (_ssCiclo) clearInterval(_ssCiclo);
    _ssCiclo = setInterval(function () {
      if (!_ssAtivo) return clearInterval(_ssCiclo);
      mostrarSlide(_ssIdx + 1);
    }, 7000);
  }

  function esconderScreensaver(imediato) {
    if (!_ssAtivo && !imediato) return;
    _ssAtivo = false;
    if (_ssCiclo) { clearInterval(_ssCiclo); _ssCiclo = null; }
    $('totem-screensaver').classList.remove('visible');
    if (!imediato) _engolindoProximoClique = true;
  }

  setInterval(function () {
    var ociosoMs = Date.now() - _ultimaAtividade;
    if (_ssAtivo) {
      if (ociosoMs < 1500 && !_engolindoProximoClique) esconderScreensaver();
      return;
    }
    if (ociosoMs >= SCREENSAVER.segundos * 1000) abrirScreensaver();
  }, 1000);

  $('totem-screensaver').addEventListener('click', function () {
    _ultimaAtividade = Date.now();
    esconderScreensaver();
  });

  /* ═══════════ CARDÁPIO ═══════════ */

  socket.emit('get_produtos');
  socket.on('produtos_atualizados', function (prods) {
    PRODUTOS = (prods || []).filter(function (p) {
      return (p.categoria !== 'Mais Pedidos' || p.originalId) &&
        (p.visibilidade === 'todos' || p.visibilidade === undefined || p.visibilidade === null);
    });
    var cats = [];
    PRODUTOS.forEach(function (p) {
      var c = p.categoria || 'Outros';
      if (cats.indexOf(c) === -1) cats.push(c);
    });
    CATEGORIAS = cats;
    renderCategorias();
    renderProdutos();
    renderSecoesHome();
  });

  function renderCategorias() {
    var bar = $('category-bar');
    bar.innerHTML = '';
    var chipAll = document.createElement('button');
    chipAll.className = 'cat-chip' + (CAT_ATIVA === '__TODOS__' ? ' active' : '');
    chipAll.textContent = 'Tudo';
    chipAll.onclick = function () { CAT_ATIVA = '__TODOS__'; renderCategorias(); renderProdutos(); };
    bar.appendChild(chipAll);
    CATEGORIAS.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'cat-chip' + (CAT_ATIVA === c ? ' active' : '');
      b.textContent = c;
      b.onclick = function () { CAT_ATIVA = c; renderCategorias(); renderProdutos(); };
      bar.appendChild(b);
    });
  }

  function renderProdutos() {
    var grid = $('products-grid');
    grid.innerHTML = '';
    var lista = CAT_ATIVA === '__TODOS__' ? PRODUTOS : PRODUTOS.filter(function (p) { return (p.categoria || 'Outros') === CAT_ATIVA; });
    if (!lista.length) {
      grid.innerHTML = '<div class="empty-msg"><i class="ph ph-hamburger" style="font-size:44px;"></i><br/>Nenhum produto disponível no momento.</div>';
      return;
    }
    lista.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'prod-card';
      var preco = parseFloat(p.preco) || 0;
      card.innerHTML =
        '<div class="prod-emoji">' + (p.emoji || '&#127869;&#65039;') + '</div>' +
        '<div class="prod-name">' + esc(p.nome) + '</div>' +
        '<div class="prod-price">R$ ' + preco.toFixed(2).replace('.', ',') + '</div>';
      card.onclick = function () { abrirItem(p); };
      grid.appendChild(card);
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ═══════════ ITEM ═══════════ */

  function abrirItem(p) {
    ITEMAtual = { id: p.id, nome: p.nome, emoji: p.emoji || '', preco: parseFloat(p.preco) || 0, sector: p.setor || p.sector || '' };
    ITEM_QTD = 1;
    $('item-emoji').textContent = ITEMAtual.emoji || '\u{1F37D}\uFE0F';
    $('item-name').textContent = ITEMAtual.nome;
    atualizarPrecoItem();
    $('item-obs').value = '';
    $('item-overlay').style.display = 'flex';
  }

  function atualizarPrecoItem() {
    $('item-price').textContent = 'R$ ' + (ITEMAtual.preco * ITEM_QTD).toFixed(2).replace('.', ',');
    $('item-qty').textContent = ITEM_QTD;
  }

  window.totemItemQty = function (delta) {
    ITEM_QTD = Math.max(1, ITEM_QTD + delta);
    atualizarPrecoItem();
  };

  window.totemCloseItem = function () {
    $('item-overlay').style.display = 'none';
  };

  window.totemAddItem = function () {
    var obs = $('item-obs').value.trim();
    var existente = CARRINHO.find(function (c) { return c.id === ITEMAtual.id && (c.obs || '') === obs; });
    if (existente) {
      existente.quantity += ITEM_QTD;
    } else {
      CARRINHO.push({
        id: ITEMAtual.id,
        productName: ITEMAtual.nome,
        productEmoji: ITEMAtual.emoji,
        preco: ITEMAtual.preco,
        sector: ITEMAtual.sector,
        quantity: ITEM_QTD,
        obs: obs
      });
    }
    $('item-overlay').style.display = 'none';
    atualizarBarraCarrinho();
  };

  /* ═══════════ CARRINHO ═══════════ */

  function carrinhoTotal() {
    return CARRINHO.reduce(function (acc, c) { return acc + c.preco * c.quantity; }, 0);
  }

  function carrinhoQtd() {
    return CARRINHO.reduce(function (acc, c) { return acc + c.quantity; }, 0);
  }

  function atualizarBarraCarrinho() {
    var bar = $('cart-bar');
    if (!CARRINHO.length) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    $('cart-count').textContent = carrinhoQtd();
    $('cart-total').textContent = 'R$ ' + carrinhoTotal().toFixed(2).replace('.', ',');
  }

  window.totemOpenCart = function () {
    var lista = $('cart-items-list');
    lista.innerHTML = '';
    if (!CARRINHO.length) lista.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:24px 0;">Seu carrinho está vazio.</div>';
    CARRINHO.forEach(function (c, idx) {
      var div = document.createElement('div');
      div.className = 'cart-item';
      div.innerHTML =
        '<div style="font-size:30px;">' + (c.productEmoji || '&#127869;&#65039;') + '</div>' +
        '<div class="cart-item-info">' +
        '<div class="cart-item-name">' + esc(c.productName) + '</div>' +
        (c.obs ? '<div class="cart-item-sub">Obs: ' + esc(c.obs) + '</div>' : '') +
        '<div class="cart-item-sub">R$ ' + c.preco.toFixed(2).replace('.', ',') + ' un.</div>' +
        '</div>' +
        '<button class="qty-btn" data-a="-" data-i="' + idx + '">&minus;</button>' +
        '<span class="cart-item-qty">' + c.quantity + '</span>' +
        '<button class="qty-btn" data-a="+" data-i="' + idx + '">+</button>' +
        '<button class="qty-btn" data-a="x" data-i="' + idx + '" style="border-color:#fecaca;color:#dc2626;">&times;</button>';
      lista.appendChild(div);
    });
    lista.querySelectorAll('.qty-btn').forEach(function (b) {
      b.onclick = function () {
        var i = parseInt(b.dataset.i, 10);
        var a = b.dataset.a;
        if (a === '-') CARRINHO[i].quantity = Math.max(0, CARRINHO[i].quantity - 1);
        if (a === '+') CARRINHO[i].quantity += 1;
        if (a === 'x') CARRINHO[i].quantity = 0;
        if (CARRINHO[i].quantity === 0) CARRINHO.splice(i, 1);
        atualizarBarraCarrinho();
        window.totemOpenCart();
      };
    });
    $('cart-sheet-total').textContent = 'R$ ' + carrinhoTotal().toFixed(2).replace('.', ',');
    $('cart-overlay').style.display = 'flex';
  };

  window.totemCloseCart = function () {
    $('cart-overlay').style.display = 'none';
  };

  /* ═══════════ CHECKOUT (caixa ou Pix) ═══════════ */

  var CONFIGS = {};

  fetch('/api/config?restaurante_id=' + encodeURIComponent(restauranteId))
    .then(function (r) { return r.json(); })
    .then(function (cfgs) { CONFIGS = cfgs || {}; })
    .catch(function () { });

  window.totemCheckout = function () {
    if (!CARRINHO.length) return;
    var fluxoPix = CONFIGS.qr_order_flow === 'pix';
    var temChave = (CONFIGS.qr_pix_key || '').trim() !== '';
    aguardandoPix = false;
    $('pix-box').style.display = 'none';
    $('status-spinner').style.display = 'block';
    $('status-icon').innerHTML = '<i class="ph ph-clock"></i>';
    $('status-btn-close').style.display = 'none';
    $('status-btn-pix').style.display = 'none';
    $('status-order-num').innerHTML = '';

    if (fluxoPix && temChave) {
      var total = carrinhoTotal();
      var chave = CONFIGS.qr_pix_key.trim();
      $('status-spinner').style.display = 'none';
      $('status-title').textContent = 'Pagamento via Pix';
      $('status-desc').textContent = 'Faça o pagamento abaixo para enviar seu pedido à cozinha.';
      $('pix-total-text').textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
      var copiaCola = '00020101021226840014BR.GOV.BCB.PIX0114' + chave + '5204000053039865405' + total.toFixed(2) + '5802BR5915CHEFCOZINHABENE6008BRASILIA62070503***6304';
      $('pix-key-text').textContent = copiaCola;
      $('pix-qr-img').src = '/api/qr?restaurante_id=' + encodeURIComponent(restauranteId) + '&size=150&data=' + encodeURIComponent(copiaCola);
      $('pix-box').style.display = 'block';
      $('status-btn-pix').style.display = 'inline-block';
    } else {
      $('status-title').textContent = 'Enviando pedido';
      $('status-desc').textContent = 'Enviando suas informações para o caixa do estabelecimento...';
      enviarPedido(false, '');
    }
    $('status-overlay').style.display = 'flex';
  };

  window.totemConfirmPix = function () {
    $('pix-box').style.display = 'none';
    $('status-btn-pix').style.display = 'none';
    $('status-spinner').style.display = 'block';
    $('status-title').textContent = 'Verificando pagamento';
    $('status-desc').textContent = 'Avisamos o caixa que o Pix foi pago. Aguardando confirmação...';
    aguardandoPix = true;
    enviarPedido(true, (CONFIGS.qr_pix_key || '').trim());
  };

  function enviarPedido(pagoPix, chavePix) {
    var itens = CARRINHO.map(function (c) {
      return {
        id: c.id,
        productName: c.productName,
        productEmoji: c.productEmoji,
        quantity: c.quantity,
        total: c.preco.toFixed(2),
        sector: c.sector,
        observations: c.obs || ''
      };
    });
    var nomeFinal = CLIENTE_IDENTIFICADO ? CLIENTE_IDENTIFICADO.nome : ('Cliente ' + TOTEM_MESA);
    socket.emit('criar_pedido_qr', {
      mesa: TOTEM_MESA,
      cliente_nome: nomeFinal,
      itens: itens,
      valor_total: carrinhoTotal(),
      pago_pix: !!pagoPix,
      chave_pix: chavePix || '',
      cliente_id: CLIENTE_IDENTIFICADO ? CLIENTE_IDENTIFICADO.id : null,
      is_fila: false,
      origem: 'totem'
    });
  }

  /* ═══════════ IDENTIFICAÇÃO DO CLIENTE / MANUTENÇÃO POR QR CODE ═══════════ */

  function atualizarBadgeClienteTotem() {
    var badge = $('totem-cliente-badge');
    var nomeEl = $('totem-cliente-nome');
    var scanBtn = $('btn-totem-scan-header');
    if (!badge || !nomeEl) return;

    if (CLIENTE_IDENTIFICADO) {
      nomeEl.textContent = CLIENTE_IDENTIFICADO.nome;
      badge.style.display = 'inline-flex';
      if (scanBtn) scanBtn.style.display = 'none';
    } else {
      badge.style.display = 'none';
      if (scanBtn) scanBtn.style.display = 'inline-flex';
    }
  }

  window.totemLogoutCliente = function(e) {
    if (e) e.stopPropagation();
    CLIENTE_IDENTIFICADO = null;
    atualizarBadgeClienteTotem();
  };

  window.totemAbrirScannerCliente = function() {
    if (!window.ChefQR) {
      alert('Módulo de QR Code carregando. Tente novamente em alguns segundos.');
      return;
    }
    window.ChefQR.abrirScanner({
      title: 'Identificar Cliente no Totem',
      subtitle: 'Aponte o QR Code do seu aplicativo ou comanda digital para a câmera',
      onScan: async function(decodedText) {
        await window.totemProcessarQr(decodedText);
      }
    });
  };

  window.totemProcessarQr = async function(texto) {
    // 1. Verifica se é crachá de funcionário para desbloqueio/manutenção
    if (texto.startsWith('CHEF-COLAB:') || texto.startsWith('COLAB-')) {
      try {
        var resColab = await fetch('/api/auth/qr-login-colaborador', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrcode_token: texto, estacao: 'Totem de Autoatendimento' })
        });
        var dataColab = await resColab.json();
        if (dataColab && dataColab.success) {
          alert('Acesso Colaborador: ' + dataColab.funcionario.nome + ' (' + dataColab.funcionario.cargo + ') autorizado!');
          return true;
        }
      } catch(e) {}
    }

    // 2. Valida cliente
    try {
      var res = await fetch('/api/auth/qr-identificar-cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrcode_token: texto, restaurante_id: restauranteId })
      });
      var data = await res.json();
      if (data && data.success && data.cliente) {
        CLIENTE_IDENTIFICADO = data.cliente;
        atualizarBadgeClienteTotem();
        esconderHomeECatalogo();
        alert('Bem-vindo(a), ' + data.cliente.nome + '! Seu pedido será associado à sua conta.');
        return true;
      } else {
        alert((data && data.error) || 'Código QR não reconhecido.');
        return false;
      }
    } catch(e) {
      alert('Erro de conexão ao identificar o cliente.');
      return false;
    }
  };

  // Leitor USB / Bip Global no Totem
  var totemUsbBuf = '';
  var totemUsbTimer = null;
  window.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      if (totemUsbBuf.length >= 5) {
        window.totemProcessarQr(totemUsbBuf);
      }
      totemUsbBuf = '';
    } else if (e.key && e.key.length === 1) {
      totemUsbBuf += e.key;
      clearTimeout(totemUsbTimer);
      totemUsbTimer = setTimeout(function() { totemUsbBuf = ''; }, 300);
    }
  });

  socket.on('criar_pedido_qr_resposta', function (res) {
    if (res && res.success) {
      ultimoPedidoId = res.id;
      $('status-spinner').style.display = 'none';
      $('status-title').textContent = 'Pedido enviado!';
      $('status-desc').textContent = 'Aguardando a confirmação do caixa...';
    } else {
      $('status-spinner').style.display = 'none';
      $('status-icon').innerHTML = '<i class="ph ph-warning-circle" style="color:#ef4444;"></i>';
      $('status-title').textContent = 'Não foi possível enviar';
      $('status-desc').textContent = (res && res.error) || 'Tente novamente em instantes.';
      $('status-btn-close').textContent = 'Voltar ao início';
      $('status-btn-close').style.display = 'inline-block';
    }
  });

  socket.on('pedido_qr_atualizado', function (upd) {
    if (!upd || upd.id != ultimoPedidoId) return;
    if (upd.status === 'Aprovado') {
      $('pix-box').style.display = 'none';
      $('status-spinner').style.display = 'none';
      $('status-icon').innerHTML = '<i class="ph ph-check-circle" style="color:#22c55e;"></i>';
      $('status-title').textContent = aguardandoPix ? 'Pagamento confirmado!' : 'Pedido confirmado!';
      $('status-desc').textContent = 'Seu pedido foi enviado para a preparação. Retire no balcão quando chamar seu número.';
      $('status-order-num').innerHTML = '<span class="order-number"><i class="ph ph-receipt"></i> Pedido #' + upd.id + '</span>';
      $('status-btn-close').textContent = 'Fazer novo pedido';
      $('status-btn-close').style.display = 'inline-block';
      CARRINHO = [];
      atualizarBarraCarrinho();
      ultimoPedidoId = null;
      aguardandoPix = false;
    } else if (upd.status === 'Recusado') {
      $('pix-box').style.display = 'none';
      $('status-spinner').style.display = 'none';
      $('status-icon').innerHTML = '<i class="ph ph-x-circle" style="color:#ef4444;"></i>';
      $('status-title').textContent = 'Pedido recusado';
      $('status-desc').textContent = 'O caixa recusou este pedido. Fale com um atendente.';
      $('status-btn-close').textContent = 'Voltar ao início';
      $('status-btn-close').style.display = 'inline-block';
      ultimoPedidoId = null;
      aguardandoPix = false;
    }
  });

  /* ═══════════ RESETS E OVERLAYS ═══════════ */

  function fecharTodosOverlays() {
    ['cart-overlay', 'item-overlay', 'status-overlay'].forEach(function (id) {
      var el = $(id);
      if (el) el.style.display = 'none';
    });
  }

  window.totemReset = function () {
    CARRINHO = [];
    atualizarBarraCarrinho();
    fecharTodosOverlays();
    mostrarHome();
  };

  function mostrarHome() {
    _ultimaAtividade = Date.now();
    $('totem-home').classList.add('visible');
    pararInatividade();
  }

  function esconderHomeECatalogo() {
    $('totem-home').classList.remove('visible');
    iniciarInatividade();
  }

  $('totem-home').addEventListener('click', esconderHomeECatalogo);

  /* ═══════════ INATIVIDADE (barra inferior) ═══════════ */

  function iniciarInatividade() {
    pararInatividade();
    reiniciarInatividade();
  }

  function pararInatividade() {
    if (idleTimer) clearInterval(idleTimer);
    idleTimer = null;
    $('idle-progress').style.width = '0%';
  }

  function reiniciarInatividade() {
    _ultimaAtividade = Date.now();
    if (!STATUS || !STATUS.ativo) return;
    if ($('totem-home').classList.contains('visible')) return;
    var duracaoMs = IDLE_TIMEOUT_MIN * 60 * 1000;
    idleDeadline = Date.now() + duracaoMs;
    if (!idleTimer) {
      idleTimer = setInterval(function () {
        var restante = idleDeadline - Date.now();
        if (restante <= 0) {
          window.totemReset();
          return;
        }
        $('idle-progress').style.width = ((restante / duracaoMs) * 100).toFixed(1) + '%';
      }, 1000);
    }
  }

  /* ═══════════ BOOT ═══════════ */

  mostrarHome();
  carregarStatus();

  (function pedirFullscreenNoPrimeiroToque() {
    var entrar = function () {
      var el = document.documentElement;
      var rq = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (rq) { try { rq.call(el); } catch (e) { } }
      if (screen.orientation && screen.orientation.lock) {
        try { screen.orientation.lock('landscape').catch(function () { }); } catch (e) { }
      }
      document.removeEventListener('click', entrar);
      document.removeEventListener('touchstart', entrar);
    };
    document.addEventListener('click', entrar);
    document.addEventListener('touchstart', entrar);
  })();
})();
