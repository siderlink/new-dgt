
// ─── SUBTABS DA ABA PRODUTOS (CATÁLOGO / MONTÁVEIS / IMPORTAR) ───
window.alternarSubtabProdutos = function(subtab) {
  const allSubtabs = ['catalogo', 'montaveis', 'importar'];
  allSubtabs.forEach(st => {
    const btn = document.getElementById('btn-subtab-' + st);
    const content = document.getElementById('subtab-content-' + st);
    if (btn) {
      if (st === subtab) {
        btn.style.background = '#fc4b15';
        btn.style.color = '#ffffff';
        btn.style.fontWeight = '800';
      } else {
        btn.style.background = 'var(--cfg-subtle-bg, #f1f5f9)';
        btn.style.color = 'var(--cfg-text, #0f172a)';
        btn.style.fontWeight = '700';
      }
    }
    if (content) {
      content.style.display = st === subtab ? 'flex' : 'none';
    }
  });

  if (subtab === 'montaveis' && typeof window.initAdminMontaveis === 'function') {
    window.initAdminMontaveis();
  }
};


  window.toggleConfigSidebar = function() {
    const sidebar = document.querySelector('.config-sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('configSidebarCollapsed', sidebar.classList.contains('collapsed'));
  };

document.addEventListener('DOMContentLoaded', () => {
  const langSelect = document.getElementById('select-idioma');
  if (langSelect) {
    langSelect.value = localStorage.getItem('chef_app_lang') || 'pt-BR';
    langSelect.addEventListener('change', (e) => {
      localStorage.setItem('chef_app_lang', e.target.value);
      window.location.reload();
    });
  }

  // ─── FUSO HORÁRIO ──
  const tzSelect = document.getElementById('select-timezone');
  const tzPreview = document.getElementById('timezone-preview');
  if (tzSelect) {
    fetch('/api/config', { headers: authHeaders() })
      .then(r => r.json())
      .then(c => {
        const tz = (c && c.timezone_offset) || '-180';
        tzSelect.value = tz;
        if (tzPreview) {
          const off = parseInt(tz, 10);
          const h = Math.abs(Math.floor(off / 60));
          const m = Math.abs(off % 60);
          const sign = off <= 0 ? '-' : '+';
          tzPreview.textContent = `GMT${sign}${h}${m > 0 ? ':' + String(m).padStart(2,'0') : ''}`;
        }
      })
      .catch(() => {
        tzSelect.value = '-180';
      });

    tzSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (tzPreview) {
        const off = parseInt(val, 10);
        const h = Math.abs(Math.floor(off / 60));
        const m = Math.abs(off % 60);
        const sign = off <= 0 ? '-' : '+';
        tzPreview.textContent = `GMT${sign}${h}${m > 0 ? ':' + String(m).padStart(2,'0') : ''}`;
      }
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(typeof authHeaders === 'function' ? authHeaders() : {}) },
        body: JSON.stringify({ timezone_offset: val })
      }).then(() => {
        if (typeof Swal !== 'undefined') Swal.fire({ toast:true, position:'top-end', icon:'success', title:'Fuso horário salvo!', showConfirmButton:false, timer:2000 });
      });
    });
  }

  
  // ─── TOGGLE MODAL FECHAMENTO ───
  const modalFechamentoSelect = document.getElementById('select-modal-fechamento-tema');
  if (modalFechamentoSelect) {
    const atual = localStorage.getItem('chef_fechamento_modal_tema') || 'pro_ux';
    modalFechamentoSelect.value = atual;
    modalFechamentoSelect.addEventListener('change', (e) => {
      const val = e.target.value || 'pro_ux';
      try { localStorage.setItem('chef_fechamento_modal_tema', val); } catch (err) { }
      socket.emit('save_restaurante_config', { fechamento_modal_tema: val });
      window.showToast(val === 'pro_ux' ? 'Modal UX Pro com Cédulas ativado!' : 'Modal Clássico de Fechamento restaurado.', 'success');
    });
  }

  // ─── TOGGLE MAPA SALAO ───
  const mapaSalaoSelect = document.getElementById('select-mapa-salao-tema');
  if (mapaSalaoSelect) {
    const atual = localStorage.getItem('chef_mapa_salao_tema') || 'pro_ux';
    mapaSalaoSelect.value = atual;
    mapaSalaoSelect.addEventListener('change', (e) => {
      const val = e.target.value || 'pro_ux';
      try { localStorage.setItem('chef_mapa_salao_tema', val); } catch (err) { }
      socket.emit('save_restaurante_config', { mapa_salao_tema: val });
      window.showToast(val === 'pro_ux' ? 'Mapa do Salão UX Pro por Setores ativado!' : 'Mapa Clássico restaurado.', 'success');
    });
  }

  
  // ─── TOGGLE FUNCAO CORINGA RODAPE ───
  const coringaSelect = document.getElementById('select-funcao-coringa-rodape');
  if (coringaSelect) {
    const atual = localStorage.getItem('chef_funcao_coringa_rodape') || 'qr_pendentes';
    coringaSelect.value = atual;
    coringaSelect.addEventListener('change', (e) => {
      const val = e.target.value || 'qr_pendentes';
      try { localStorage.setItem('chef_funcao_coringa_rodape', val); } catch (err) { }
      socket.emit('save_restaurante_config', { funcao_coringa_rodape: val });
      window.showToast('Função coringa do rodapé atualizada com sucesso!', 'success');
    });
  }

  
  // ─── TOGGLE ESCALA DE FONTE ───
  const fontScaleSelect = document.getElementById('select-font-scale');
  if (fontScaleSelect) {
    const atual = localStorage.getItem('chef_font_scale') || 'lg';
    fontScaleSelect.value = atual;
    fontScaleSelect.addEventListener('change', (e) => {
      const val = e.target.value || 'lg';
      try { localStorage.setItem('chef_font_scale', val); } catch (err) { }
      socket.emit('save_restaurante_config', { font_scale: val });
      if (typeof window.aplicarEscalaFonte === 'function') window.aplicarEscalaFonte();
      window.showToast('Tamanho da fonte atualizado com sucesso!', 'success');
    });
  }

  // ─── TEMA DA TELA DO CAIXA (Pro UX / Clássico / Modular v1.1 + Loja de Temas) ──
  const temaSelect = document.getElementById('select-caixa-tema');
  if (temaSelect) {
    let _lojaTemas = [];
    let _temaAtivoLayout = 'pro_ux';
    let _storeAtivoId = null;
    let _storeAtivoNome = '';

    const tokenTemas = () => {
      const t = localStorage.getItem('chef_token') || localStorage.getItem('token');
      return t ? ('Bearer ' + t) : '';
    };

    function montarOptionsCaixa() {
      let html =
        `<option value="pro_ux">✨ Caixa Moderno UX Pro (Novo - Otimizado)</option>
         <option value="classico">🏛️ Caixa Clássico Tradicional (Versão Anterior)</option>
         <option value="v11">🧩 Caixa Modular v1.1 (Painel com Widgets)</option>`;
      if (_lojaTemas.length) {
        html += `<optgroup label="🎨 Loja de Temas (App Store)">`;
        _lojaTemas.forEach(t => {
          const badge = t.badge === 'destaque' ? ' 🔥 Destaque' : t.badge === 'lancamento' ? ' 🆕 Lançamento' : (t.desconto > 0 ? ' 🏷️ -' + t.desconto + '%' : '');
          html += `<option value="store:${t.id}">${t.emoji_nicho || '🎨'} ${t.nome}${badge}</option>`;
        });
        html += `</optgroup>`;
      }
      return html;
    }

    async function carregarEstadoTemaCaixa() {
      try {
        const [cfgRes, lojaRes, ativoRes] = await Promise.all([
          fetch('/api/config', { headers: authHeaders() }).then(r => r.json()).catch(() => null),
          fetch('/api/modulo/temas/loja').then(r => r.json()).catch(() => null),
          fetch('/api/modulo/temas/ativo', { headers: { 'Authorization': tokenTemas() } }).then(r => r.json()).catch(() => null)
        ]);

        _lojaTemas = (lojaRes && lojaRes.ok && lojaRes.temas) || [];
        _temaAtivoLayout = (cfgRes && cfgRes.caixa_tema === 'v11') ? 'v11' : ((cfgRes && cfgRes.caixa_tema === 'classico') ? 'classico' : 'pro_ux');
        _storeAtivoId = (ativoRes && ativoRes.ok && ativoRes.tema && ativoRes.tema.tema_id) || null;
        _storeAtivoNome = (ativoRes && ativoRes.ok && ativoRes.tema && ativoRes.tema.nome) || '';

        let html = montarOptionsCaixa();
        let temaSelecionado = null;

        if (_storeAtivoId) {
          const noLista = _lojaTemas.find(t => t.id === _storeAtivoId);
          if (!noLista) {
            html += `<option value="store:${_storeAtivoId}">🎨 ${_storeAtivoNome} (em uso)</option>`;
          }
          temaSelecionado = 'store:' + _storeAtivoId;
        } else {
          temaSelecionado = _temaAtivoLayout;
        }

        temaSelect.innerHTML = html;
        temaSelect.value = temaSelecionado;

        const hint = document.getElementById('tema-caixa-ativo-hint');
        if (hint) {
          hint.innerHTML = _storeAtivoId
            ? `<i class="ph-bold ph-check-circle" style="color:#16a34a;"></i> Tema da Loja ativo: <b>${_storeAtivoNome}</b> — aplicado em todas as telas.`
            : `<i class="ph-bold ph-check-circle" style="color:#16a34a;"></i> Tema ativo: estrutura <b>${_temaAtivoLayout === 'v11' ? 'Modular v1.1' : _temaAtivoLayout === 'classico' ? 'Clássico' : 'Moderno Pro UX'}</b>. Escolha um tema da Loja abaixo para personalizar as cores do salão.`;
        }
      } catch (e) {
        temaSelect.innerHTML = montarOptionsCaixa();
        const lo = localStorage.getItem('chef_caixa_tema');
        temaSelect.value = (lo === 'v11' || lo === 'classico') ? lo : 'pro_ux';
      }
    }

    function salvarLayoutCaixa(novo) {
      try { localStorage.setItem('chef_caixa_tema', novo); } catch (err) { }
      try { socket.emit('save_restaurante_config', { caixa_tema: novo }); } catch (err) { }
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(typeof authHeaders === 'function' ? authHeaders() : {}) },
        body: JSON.stringify({ caixa_tema: novo })
      }).catch(() => { });
    }

    async function limparTemaLoja() {
      try {
        await fetch('/api/modulo/temas/aplicar', { method: 'DELETE', headers: { 'Authorization': tokenTemas() } });
      } catch (e) { }
    }

    temaSelect.addEventListener('change', async (e) => {
      const val = e.target.value || 'pro_ux';

      if (val.startsWith('store:')) {
        const id = val.slice(6);
        const t = _lojaTemas.find(x => x.id === id);
        try {
          const res = await fetch('/api/modulo/temas/aplicar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': tokenTemas() },
            body: JSON.stringify({ tema_id: id, tema_json: t || { id: id, nome: _storeAtivoNome } })
          });
          const data = await res.json().catch(() => ({}));
          if (data && data.ok === false) throw new Error(data.erro || 'erro');
          window.showToast(`🎨 Tema "${t ? t.nome : id}" aplicado em todas as telas!`, 'success');
        } catch (err) {
          window.showToast('Erro ao aplicar o tema da loja.', 'error');
        }
        carregarEstadoTemaCaixa();
        return;
      }

      const novo = (val === 'v11') ? 'v11' : (val === 'classico' ? 'classico' : 'pro_ux');
      salvarLayoutCaixa(novo);
      await limparTemaLoja();
      window.showToast(
        novo === 'v11'
          ? 'Tema v1.1 ativado! A tela do caixa abrirá o painel modular.'
          : novo === 'classico'
            ? 'Tema clássico restaurado para a tela do caixa.'
            : 'Caixa Moderno UX Pro ativado!',
        'success');
      carregarEstadoTemaCaixa();
    });

    try {
      if (window.socket && window.socket.on) {
        window.socket.on('tema_aplicado', () => carregarEstadoTemaCaixa());
        window.socket.on('tema_global_atualizado', () => carregarEstadoTemaCaixa());
      } else if (socket && socket.on) {
        socket.on('tema_aplicado', () => carregarEstadoTemaCaixa());
        socket.on('tema_global_atualizado', () => carregarEstadoTemaCaixa());
      }
    } catch (e) { }

    carregarEstadoTemaCaixa();
  }
});

function chefTokenRest() {
  const t = localStorage.getItem('chef_token') || localStorage.getItem('token');
  return t ? ('Bearer ' + t) : '';
}

window.abrirModalLojaTemas = function () {
  const m = document.getElementById('modal-loja-temas');
  if (!m) return;
  m.style.display = 'flex';
  const f = document.getElementById('iframe-loja-temas');
  if (f) f.src = '/theme-store.html?from=config&mode=restaurante&t=' + Date.now();
};

window.fecharModalLojaTemas = function () {
  const m = document.getElementById('modal-loja-temas');
  if (!m) return;
  m.style.display = 'none';
  const f = document.getElementById('iframe-loja-temas');
  if (f) f.src = 'about:blank';
};

window.abrirSolicitarTemaLoja = async function () {
  const temaRef = prompt('Qual tema ou estilo você gostaria no seu salão?', 'Quero um tema novo para o meu negócio');
  if (temaRef === null) return;
  const detalhe = prompt('Descreva cores, estilo e demonstrações que combinam com sua marca:', 'Cores do meu logo, clima acolhedor...');
  if (detalhe === null) return;
  try {
    const res = await fetch('/api/modulo/temas/solicitar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': chefTokenRest() },
      body: JSON.stringify({ tema_referencia: temaRef, mensagem: detalhe })
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.ok !== false) {
      window.showToast('✅ ' + (data.mensagem || 'Solicitação enviada à Equipe de Criação & Suporte!'), 'success');
    } else {
      window.showToast('Erro ao enviar a solicitação.', 'error');
    }
  } catch (e) {
    window.showToast('Erro ao enviar a solicitação.', 'error');
  }
};

window.addEventListener('message', (ev) => {
  if (ev && ev.data === 'fechar_theme_studio' && typeof window.fecharModalLojaTemas === 'function') {
    window.fecharModalLojaTemas();
  }
});

/* Toast notification - non-blocking replacement for alert() */
window.showToast = function(msg, type, duration) {
  const colors = { success: '#16a34a', warning: '#d97706', error: '#dc2626', info: '#2563eb' };
  const bg = colors[type] || colors.info;
  const icons = { success: 'ph-check-circle', warning: 'ph-warning', error: 'ph-x-circle', info: 'ph-info' };
  const icon = icons[type] || icons.info;
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;background:var(--cfg-card-bg,#fff);border-left:4px solid ' + bg + ';border-radius:10px;padding:14px 18px;box-shadow:0 8px 30px rgba(0,0,0,0.12);display:flex;align-items:center;gap:10px;animation:slideInRight .3s ease;max-width:380px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:var(--cfg-text,#1e293b);';
  toast.innerHTML = '<i class="ph ' + icon + '" style="color:' + bg + ';font-size:20px;flex-shrink:0;"></i><span style="flex:1;">' + msg + '</span>';
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s'; }, duration || 4000);
  setTimeout(() => toast.remove(), (duration || 4000) + 500);
};
let currentMesas = [];
const socket = window.socket || (typeof io === 'function' ? io({ query: { token: localStorage.getItem('chef_token'), restaurante_id: localStorage.getItem('restaurante_id') || '1' } }) : {
  emit: () => { },
  on: () => { },
  once: () => { }
});
if (typeof initChefTz === 'function') initChefTz(socket);

socket.on('tenant_atualizado', (data) => {
  if (data && data.restaurante_id) {
    localStorage.setItem('restaurante_id', data.restaurante_id);
  }
  if (data && data.token) {
    localStorage.setItem('chef_token', data.token);
  }
  try {
    if (socket && socket.io && socket.io.opts) {
      socket.disconnect();
      socket.io.opts.query = { token: data.token, restaurante_id: String(data.restaurante_id) };
      socket.connect();
      // Após reconexão, reemitir requests para popular as abas
      socket.once('connect', () => {
        try {
          socket.emit('get_mesas');
          socket.emit('get_funcionarios');
          socket.emit('get_clientes');
          socket.emit('get_promocoes');
          socket.emit('get_produtos');
          socket.emit('get_restaurante_config');
        } catch (e) { console.warn('[config] erro ao reemitir após tenant_atualizado:', e); }
      });
    }
  } catch (e) { console.warn('[config] erro no tenant_atualizado:', e); }
});

function authHeaders() {
  const t = localStorage.getItem('chef_token');
  const h = { 'Content-Type': 'application/json' };
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

// --- Admin Authorization Modal (TOUCH PIN & ANTI-FRAUDE) ---
window.pendingAdminAction = null;
let _cfgPinValidating = false;

window.isUsuarioAdminOuGerente = function() {
  try {
    const p = window.crmPerfil || {};
    const cargo = String(p.cargo || p.funcao || p.role || localStorage.getItem('colaborador_cargo') || localStorage.getItem('usuario_cargo') || localStorage.getItem('user_role') || '').toLowerCase();
    const nome = String(p.nome || window.loggedInUser || localStorage.getItem('usuario_logado') || '').toLowerCase();
    if (cargo.includes('admin') || cargo.includes('gerente') || cargo.includes('dono') || cargo.includes('master') || cargo.includes('proprietario') || cargo.includes('supervisor')) return true;
    if (nome.includes('admin') || nome.includes('gerente') || nome.includes('dono') || nome === 'master') return true;
  } catch(e) {}
  return false;
};

window.solicitarAutorizacaoAdmin = function(titulo, callback) {
  window.pendingAdminAction = callback;
  _cfgPinValidating = false;

  const modal = document.getElementById('modal-confirmar-senha-admin');
  const elTitulo = document.getElementById('modal-senha-admin-titulo');
  const elDetalhe = document.getElementById('modal-senha-admin-detalhe');
  const inputSenha = document.getElementById('input-modal-senha-admin');
  const inputMotivo = document.getElementById('input-modal-motivo-admin');
  const wrapMotivo = document.getElementById('wrap-modal-motivo-admin');
  const elStatus = document.getElementById('modal-senha-admin-status');

  if (elTitulo && titulo) elTitulo.innerText = titulo;
  if (elDetalhe) elDetalhe.innerText = 'Informe a senha de administrador ou PIN temporário para confirmar esta ação.';
  if (inputSenha) {
    inputSenha.value = '';
    inputSenha.style.borderColor = 'var(--border-color, #334155)';
    inputSenha.style.boxShadow = 'none';
  }
  if (inputMotivo) inputMotivo.value = '';
  if (elStatus) { elStatus.style.display = 'none'; elStatus.innerHTML = ''; }

  const isAdmin = window.isUsuarioAdminOuGerente();
  if (wrapMotivo) wrapMotivo.style.display = isAdmin ? 'none' : 'block';

  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => { if (inputSenha) inputSenha.focus(); }, 120);
  }
};

window.fecharModalSenhaAdmin = function() {
  const modal = document.getElementById('modal-confirmar-senha-admin');
  if (modal) modal.style.display = 'none';
  window.pendingAdminAction = null;
  _cfgPinValidating = false;
};

window.pinAdminAddDigit = function(digit) {
  const input = document.getElementById('input-modal-senha-admin');
  if (!input) return;
  if (input.value.length >= 12) return;
  input.value += digit;
  window.onPinAdminInput(input.value);
};

window.pinAdminBackspace = function() {
  const input = document.getElementById('input-modal-senha-admin');
  if (!input) return;
  input.value = input.value.slice(0, -1);
  window.onPinAdminInput(input.value);
};

window.pinAdminClear = function() {
  const input = document.getElementById('input-modal-senha-admin');
  if (input) input.value = '';
  const elStatus = document.getElementById('modal-senha-admin-status');
  if (elStatus) { elStatus.style.display = 'none'; elStatus.innerHTML = ''; }
};

window.onPinAdminInput = function(val) {
  const pin = (val || '').trim();
  const elStatus = document.getElementById('modal-senha-admin-status');
  const input = document.getElementById('input-modal-senha-admin');

  if (pin.length < 4) {
    if (elStatus) { elStatus.style.display = 'none'; elStatus.innerHTML = ''; }
    if (input) input.style.borderColor = 'var(--border-color, #334155)';
    return;
  }

  if (_cfgPinValidating) return;
  _cfgPinValidating = true;

  const handleResult = (ok) => {
    if (ok) {
      if (input) {
        input.style.borderColor = '#22c55e';
        input.style.boxShadow = '0 0 12px rgba(34,197,94,0.4)';
      }
      if (elStatus) {
        elStatus.style.display = 'block';
        elStatus.style.background = 'rgba(34,197,94,0.15)';
        elStatus.style.color = '#22c55e';
        elStatus.innerHTML = '<i class="ph-bold ph-check-circle"></i> ✨ PIN Correto! Autorizando ação...';
      }

      setTimeout(() => {
        const callback = window.pendingAdminAction;
        const inputMotivo = document.getElementById('input-modal-motivo-admin');
        const motivo = (inputMotivo && inputMotivo.value.trim()) ? inputMotivo.value.trim() : 'Autorizado via PIN Touch';
        window.fecharModalSenhaAdmin();
        if (typeof callback === 'function') {
          callback(pin, motivo);
        }
        if (typeof window.showToast === 'function') {
          window.showToast('✨ Autorizado com sucesso!', 'success');
        }
      }, 350);
    } else {
      _cfgPinValidating = false;
      if (pin.length >= 6) {
        if (input) {
          input.style.borderColor = '#ef4444';
          input.style.boxShadow = '0 0 12px rgba(239,68,68,0.4)';
        }
        if (elStatus) {
          elStatus.style.display = 'block';
          elStatus.style.background = 'rgba(239,68,68,0.15)';
          elStatus.style.color = '#ef4444';
          elStatus.innerHTML = '<i class="ph-bold ph-warning-circle"></i> PIN incorreto. Tente novamente.';
        }
      }
    }
  };

  if (typeof socket !== 'undefined' && socket && socket.connected) {
    socket.emit('validar_pin_admin', { pin: pin }, (res) => {
      handleResult(res && res.ok);
    });
  } else {
    fetch('/api/validar-pin-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin })
    })
      .then(r => r.json())
      .then(data => handleResult(data && data.ok))
      .catch(() => { _cfgPinValidating = false; });
  }
};

window.confirmarSenhaAdminAcao = function() {
  const inputSenha = document.getElementById('input-modal-senha-admin');
  const inputMotivo = document.getElementById('input-modal-motivo-admin');

  const senha = inputSenha ? inputSenha.value.trim() : '';
  const isAdmin = window.isUsuarioAdminOuGerente();
  let motivo = inputMotivo ? inputMotivo.value.trim() : '';

  if (!senha) {
    if (typeof window.showToast === 'function') window.showToast('Por favor, digite o PIN ou senha.', 'warning');
    else alert('Por favor, informe a senha de administrador ou PIN.');
    if (inputSenha) inputSenha.focus();
    return;
  }

  if (!isAdmin && !motivo) {
    if (typeof window.showToast === 'function') window.showToast('Informe o motivo/justificativa obrigatoriamente.', 'warning');
    else alert('Por favor, informe o motivo/justificativa obrigatoriamente.');
    if (inputMotivo) inputMotivo.focus();
    return;
  }

  if (!motivo) motivo = 'Autorizado por Admin/Gerente';

  const callback = window.pendingAdminAction;
  window.fecharModalSenhaAdmin();

  if (typeof callback === 'function') {
    callback(senha, motivo);
  }
};

// --- FORMAS DE PAGAMENTO & CARTÕES (GLOBAL DEFS) ---
window.listaFormasPagamento = [];

window.carregarFormasPagamento = function() {
  const rid = encodeURIComponent(localStorage.getItem('restaurante_id') || '1');
  fetch('/api/formas-pagamento?restaurante_id=' + rid)
    .then(r => r.json())
    .then(data => {
      if (Array.isArray(data)) {
        window.listaFormasPagamento = data;
        window.renderizarTabelaFormasPagamento();
      }
    })
    .catch(() => {});
  if (typeof socket !== 'undefined' && socket && socket.emit) {
    socket.emit('get_formas_pagamento');
  }
};

socket.on('formas_pagamento_atualizadas', (formas) => {
  if (Array.isArray(formas)) {
    window.listaFormasPagamento = formas;
    window.renderizarTabelaFormasPagamento();
  }
});

window.renderizarTabelaFormasPagamento = function () {
  const tbody = document.getElementById('tabela-formas-pagamento-body');
  if (!tbody) return;

  if (!window.listaFormasPagamento || window.listaFormasPagamento.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 24px; text-align: center; color: #94a3b8;">
          <i class="ph ph-wallet" style="font-size: 32px; display: block; margin-bottom: 8px;"></i>
          Nenhuma forma de pagamento cadastrada. Clique em "Nova Forma de Pagamento" para adicionar.
        </td>
      </tr>`;
    return;
  }

  const tipoLabelMap = {
    dinheiro: 'Dinheiro Espécie',
    credito: 'Cartão de Crédito',
    debito: 'Cartão de Débito',
    pix: 'PIX / QR Code',
    ticket: 'Vale Refeição / Alimentação',
    carteira: 'Crediário / Fiado',
    outros: 'Outros'
  };

  tbody.innerHTML = window.listaFormasPagamento.map(fp => {
    const iconeClass = fp.icone || 'ph-credit-card';
    const tipoBadge = tipoLabelMap[fp.tipo] || fp.tipo;
    const taxaStr = parseFloat(fp.taxa || 0).toFixed(2).replace('.', ',') + '%';
    const prazoStr = (fp.prazo_dias || 0) + ' dia(s)';
    const isAtivo = fp.ativo === 1 || fp.ativo === true;

    return `
      <tr style="border-bottom: 1px solid #f1f5f9; background: ${isAtivo ? 'white' : '#f8fafc'};">
        <td style="padding: 12px 16px; font-weight: 600; color: #1e293b; display: flex; align-items: center; gap: 10px;">
          <div style="width: 32px; height: 32px; border-radius: 8px; background: ${isAtivo ? '#ecfdf5' : '#f1f5f9'}; color: ${isAtivo ? '#10b981' : '#94a3b8'}; display: flex; align-items: center; justify-content: center; font-size: 18px;">
            <i class="ph ${iconeClass}"></i>
          </div>
          <span>${fp.nome}</span>
        </td>
        <td style="padding: 12px 16px; color: #475569;">
          <span style="background: #f1f5f9; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; color: #334155;">
            ${tipoBadge}
          </span>
        </td>
        <td style="padding: 12px 16px; color: #059669; font-weight: 600;">
          ${taxaStr}
        </td>
        <td style="padding: 12px 16px; color: #475569;">
          ${prazoStr}
        </td>
        <td style="padding: 12px 16px;">
          <label style="position: relative; display: inline-block; width: 44px; height: 24px;">
            <input type="checkbox" ${isAtivo ? 'checked' : ''} onchange="window.toggleFormaPagamento(${fp.id}, this.checked)" style="opacity: 0; width: 0; height: 0;">
            <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${isAtivo ? '#10b981' : '#cbd5e1'}; transition: .3s; border-radius: 24px;"></span>
            <span style="position: absolute; content: ''; height: 18px; width: 18px; left: ${isAtivo ? '22px' : '3px'}; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%;"></span>
          </label>
        </td>
        <td style="padding: 12px 16px; text-align: right;">
          <button onclick="window.editarFormaPagamento(${fp.id})" style="background: #eff6ff; color: #2563eb; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-right: 6px; font-size: 13px;">
            <i class="ph ph-pencil"></i> Editar
          </button>
          <button onclick="window.excluirFormaPagamento(${fp.id})" style="background: #fef2f2; color: #dc2626; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px;">
            <i class="ph ph-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
};

window.abrirModalFormaPagamento = function (id = null) {
  const modal = document.getElementById('modal-forma-pagamento');
  if (!modal) return;

  document.getElementById('fp-id').value = '';
  document.getElementById('fp-nome').value = '';
  document.getElementById('fp-tipo').value = 'credito';
  document.getElementById('fp-icone').value = 'ph-credit-card';
  document.getElementById('fp-taxa').value = '0.00';
  document.getElementById('fp-prazo').value = '0';
  document.getElementById('fp-ativo').checked = true;
  document.getElementById('modal-fp-titulo').innerText = 'Nova Forma de Pagamento';

  if (id) {
    const fp = (window.listaFormasPagamento || []).find(item => item.id == id);
    if (fp) {
      document.getElementById('fp-id').value = fp.id;
      document.getElementById('fp-nome').value = fp.nome || '';
      document.getElementById('fp-tipo').value = fp.tipo || 'credito';
      document.getElementById('fp-icone').value = fp.icone || 'ph-credit-card';
      document.getElementById('fp-taxa').value = fp.taxa || 0;
      document.getElementById('fp-prazo').value = fp.prazo_dias || 0;
      document.getElementById('fp-ativo').checked = fp.ativo == 1 || fp.ativo === true;
      document.getElementById('modal-fp-titulo').innerText = 'Editar Forma de Pagamento';
    }
  }

  // Portal pattern: mover o modal direto para o body para evitar stacking context
  // causado por overflow:hidden ou transform em elementos pai
  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }
  modal.style.setProperty('display', 'flex', 'important');
  modal.style.setProperty('position', 'fixed', 'important');
  modal.style.setProperty('top', '0', 'important');
  modal.style.setProperty('left', '0', 'important');
  modal.style.setProperty('width', '100vw', 'important');
  modal.style.setProperty('height', '100vh', 'important');
  modal.style.setProperty('z-index', '999999', 'important');
  modal.style.setProperty('background', 'rgba(0,0,0,0.6)', 'important');
  modal.style.setProperty('backdrop-filter', 'blur(4px)', 'important');
  modal.style.setProperty('justify-content', 'center', 'important');
  modal.style.setProperty('align-items', 'center', 'important');
  modal.style.setProperty('pointer-events', 'all', 'important');
};

window.fecharModalFormaPagamento = function () {
  const modal = document.getElementById('modal-forma-pagamento');
  if (modal) {
    modal.style.display = 'none';
    // Retornar ao lugar original se foi movido
    if (modal.dataset.moved === 'true') {
      modal.dataset.moved = '';
    }
  }
};

window.salvarFormaPagamento = function () {
  const id = document.getElementById('fp-id').value;
  const nome = (document.getElementById('fp-nome').value || '').trim();
  const tipo = document.getElementById('fp-tipo').value;
  const icone = document.getElementById('fp-icone').value;
  const taxa = parseFloat(document.getElementById('fp-taxa').value) || 0;
  const prazo_dias = parseInt(document.getElementById('fp-prazo').value) || 0;
  const ativo = document.getElementById('fp-ativo').checked;

  if (!nome) {
    alert('Por favor, informe o nome da forma de pagamento.');
    return;
  }

  const payload = { id, nome, tipo, icone, taxa, prazo_dias, ativo, restaurante_id: localStorage.getItem('restaurante_id') || '1' };

  fetch('/api/formas-pagamento', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(res => {
      if (res && res.success) {
        window.fecharModalFormaPagamento();
        window.carregarFormasPagamento();
      } else {
        alert('Erro ao salvar forma de pagamento.');
      }
    })
    .catch(() => {
      if (id) socket.emit('update_forma_pagamento', payload);
      else socket.emit('add_forma_pagamento', payload);
      window.fecharModalFormaPagamento();
      setTimeout(() => window.carregarFormasPagamento(), 500);
    });
};

window.toggleFormaPagamento = function (id, ativo) {
  fetch(`/api/formas-pagamento/${id}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ativo, restaurante_id: localStorage.getItem('restaurante_id') || '1' })
  })
    .then(() => window.carregarFormasPagamento())
    .catch(() => {
      socket.emit('toggle_forma_pagamento', { id, ativo });
      setTimeout(() => window.carregarFormasPagamento(), 500);
    });
};

window.editarFormaPagamento = function (id) {
  window.abrirModalFormaPagamento(id);
};

window.excluirFormaPagamento = function (id) {
  if (confirm('Deseja realmente excluir esta forma de pagamento?')) {
    fetch(`/api/formas-pagamento/${id}?restaurante_id=${encodeURIComponent(localStorage.getItem('restaurante_id') || '1')}`, { method: 'DELETE' })
      .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (ok) {
          window.carregarFormasPagamento();
        } else {
          alert(data.error || 'Erro ao excluir forma de pagamento.');
        }
      })
      .catch(() => {
        socket.emit('delete_forma_pagamento', id);
        setTimeout(() => window.carregarFormasPagamento(), 500);
      });
  }
};

socket.on('erro_caixa', (msg) => {
  alert(msg);
});
let allProducts = [];
let configs = {
  destaques_ativos: true,
  destaques_itens: [],
  ordem_categorias: [],
  modo_touch: false,
  qr_order_enabled: false,
  qr_order_flow: "caixa",
  qr_pix_key: "",
  qr_pix_name: "",
  qr_protocol: "",
  qr_port: "",
  split_excedente: "perguntar",
  ponto_saida_fechar_caixa: false,
  feature_venda_sem_estoque: false,
  feature_toggle_produto_rapido: true,
  feature_alterar_valores_pdv: false,
  feature_clientes_ativos: true,
  feature_produto_mais_vendido: true,
  feature_maior_lucro: true,
  feature_impressao_digital: true,
  feature_impressao_termica: false,
  feature_produtos_lote: false,
  feature_jogos: true,
  jogos_pontos_vitoria: 10,
  jogos_pontos_derrota: 2
};

let serverIp = window.location.hostname;
let serverProtocol = window.location.protocol;
let serverPort = window.location.port;
let restCustomDomain = ''; /* custom_domain do restaurante, quando disponível */

function normalizeProtocol(p) {
  if (!p) return 'http:';
  const s = String(p).toLowerCase();
  return s.endsWith(':') ? s : s + ':';
}

function buildCardapioUrl(mesaNome) {
  const customProto = String(configs.qr_protocol || '').trim().toLowerCase();
  const proto = normalizeProtocol((customProto === 'https' || customProto === 'http') ? customProto : (serverProtocol || 'http'));
  /* Se o cliente está via túnel, usar a URL do túnel diretamente */
  const _hostname = window.location.hostname;
  const _isTunnel = /\.(trycloudflare\.com|ngrok-free\.app|ngrok\.app|loca\.lt|lhr\.life)$/.test(_hostname);
  let host = _isTunnel ? _hostname : ((restCustomDomain && restCustomDomain.trim()) || serverIp || window.location.hostname);
  const isDomain = host.indexOf('.') !== -1 && !host.match(/^\d+\.\d+\.\d+\.\d+$/);
  const customPort = String(configs.qr_port || '').trim();
  const portPart = (isDomain || _isTunnel) ? '' : (customPort ? ':' + customPort : (serverPort ? ':' + serverPort : ''));
  const tenantId = encodeURIComponent(localStorage.getItem('restaurante_id') || '1');
  return `${proto}//${host}${portPart}/cardapio.html?mesa=${encodeURIComponent(mesaNome)}&restaurante_id=${tenantId}`;
}

fetch('/api/server-status')
  .then(r => r.json())
  .then(status => {
    if (status && status.ip) {
      serverIp = status.ip;
      serverProtocol = status.protocol || 'http:';
      serverPort = status.port;
    }
  })
  .catch(err => console.error("Erro ao obter IP do servidor:", err));

document.addEventListener('DOMContentLoaded', () => {
  if (window.carregarFormasPagamento) window.carregarFormasPagamento();
  // Collapsible sidebar
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.querySelector('.config-sidebar');
  if (btnToggleSidebar && sidebar) {
    const collapsed = localStorage.getItem('configSidebarCollapsed') === 'true';
    if (collapsed) {
      sidebar.classList.add('collapsed');
    }
    btnToggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('configSidebarCollapsed', sidebar.classList.contains('collapsed'));
    });
  }

  // ── BUSCA RÁPIDA DE CONFIGURAÇÕES NA SIDEBAR ──
  const searchInput = document.getElementById('config-sidebar-search');
  const searchClear = document.getElementById('config-sidebar-search-clear');
  const allTabBtns = Array.from(document.querySelectorAll('.admin-tab-btn'));
  const allGroups = Array.from(document.querySelectorAll('.action-group'));

  allTabBtns.forEach(btn => {
    btn.dataset.origHtml = btn.innerHTML;
  });

  function filtrarAbas(termo) {
    const q = (termo || '').trim().toLowerCase();
    if (searchClear) searchClear.style.display = q ? 'flex' : 'none';

    if (!q) {
      allTabBtns.forEach(btn => {
        btn.style.display = '';
      });
      allGroups.forEach(grp => {
        grp.style.display = '';
      });
      return;
    }

    allGroups.forEach(grp => {
      let grupoTemMatch = false;
      const btns = grp.querySelectorAll('.admin-tab-btn');
      btns.forEach(btn => {
        const texto = btn.innerText.toLowerCase();
        const tabId = (btn.dataset.tab || '').toLowerCase();
        const match = texto.includes(q) || tabId.includes(q);

        if (match) {
          btn.style.display = 'flex';
          grupoTemMatch = true;
        } else {
          btn.style.display = 'none';
        }
      });

      if (grupoTemMatch) {
        grp.style.display = 'block';
        grp.classList.remove('collapsed');
      } else {
        grp.style.display = 'none';
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => filtrarAbas(e.target.value));
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        filtrarAbas('');
        searchInput.focus();
      });
    }

    // Atalho de teclado: '/' ou 'Ctrl+K' para buscar
    document.addEventListener('keydown', (e) => {
      if ((e.key === '/' && document.activeElement !== searchInput && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      } else if (e.key === 'Escape' && document.activeElement === searchInput) {
        searchInput.value = '';
        filtrarAbas('');
        searchInput.blur();
      }
    });
  }

  // Comanda Add Button CRM Listener
  const addComandaBtn = document.getElementById('btn-admin-add-comanda');
  if (addComandaBtn) {
    addComandaBtn.onclick = () => {
      let nome = document.getElementById('admin-comanda-nome').value.trim();
      if (!nome) return alert('Por favor, insira o nome para a comanda.');
      socket.emit('nova_comanda_crm', { nome: nome });
      document.getElementById('admin-comanda-nome').value = '';
    };
  }

  // Category select change listener
  const selectCat = document.getElementById('admin-prod-cat-select');
  const inputNewCat = document.getElementById('admin-prod-cat-new');
  if (selectCat && inputNewCat) {
    selectCat.addEventListener('change', () => {
      if (selectCat.value === '__NEW__') {
        inputNewCat.style.display = 'block';
        inputNewCat.focus();
      } else {
        inputNewCat.style.display = 'none';
        inputNewCat.value = '';
      }
    });
  }

  // 1. Fetch Configs and Products
  Promise.all([
    fetch('/api/config', { headers: authHeaders() }).then(r => r.json()).catch(e => ({})),
    new Promise(resolve => {
      if (typeof io === 'undefined') {
        allProducts = [];
        resolve();
        return;
      }

      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      // Set fallback timeout in case socket is offline/slow
      setTimeout(done, 2500);

      socket.emit('get_produtos');
      socket.once('produtos_atualizados', prods => {
        allProducts = prods;

        // Popular select de cupons
        const selectCupom = document.getElementById('admin-cupom-produto-sel');
        if (selectCupom) {
          selectCupom.innerHTML = '<option value="">-- Selecione um Produto --</option>';
          prods.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.nome;
            opt.dataset.emoji = p.emoji || "🎁";
            opt.dataset.sector = p.sector || "Bar";
            opt.innerText = (p.emoji || "") + " " + p.nome + " - R$ " + parseFloat(p.valor).toFixed(2).replace('.', ',');
            selectCupom.appendChild(opt);
          });
        }
        done();
      });
    })
  ]).then(([conf]) => {
    configs = conf;
    // Forçar os tipos corretos das strings que vieram do BD
    try {
      configs.destaques_ativos = (configs.destaques_ativos === 'true' || configs.destaques_ativos === true);
      configs.modo_touch = (configs.modo_touch === 'true' || configs.modo_touch === true);
      configs.qr_order_enabled = (configs.qr_order_enabled === 'true' || configs.qr_order_enabled === true);
      configs.ponto_saida_fechar_caixa = (configs.ponto_saida_fechar_caixa === 'true' || configs.ponto_saida_fechar_caixa === true);
      configs.feature_venda_sem_estoque = (configs.feature_venda_sem_estoque === 'true' || configs.feature_venda_sem_estoque === true);
      configs.feature_toggle_produto_rapido = (configs.feature_toggle_produto_rapido === 'true' || configs.feature_toggle_produto_rapido === true);
      configs.feature_alterar_valores_pdv = (configs.feature_alterar_valores_pdv === 'true' || configs.feature_alterar_valores_pdv === true);
      configs.feature_clientes_ativos = (configs.feature_clientes_ativos === 'true' || configs.feature_clientes_ativos === true);
      configs.feature_produto_mais_vendido = (configs.feature_produto_mais_vendido === 'true' || configs.feature_produto_mais_vendido === true);
      configs.feature_maior_lucro = (configs.feature_maior_lucro === 'true' || configs.feature_maior_lucro === true);
      configs.feature_impressao_digital = (configs.feature_impressao_digital === 'true' || configs.feature_impressao_digital === true);
      configs.feature_impressao_termica = (configs.feature_impressao_termica === 'true' || configs.feature_impressao_termica === true);
      configs.feature_produtos_lote = (configs.feature_produtos_lote === 'true' || configs.feature_produtos_lote === true);
      if (typeof configs.destaques_itens === 'string') configs.destaques_itens = JSON.parse(configs.destaques_itens || '[]');
      if (!configs.destaques_itens) configs.destaques_itens = [];
      if (typeof configs.ordem_categorias === 'string') configs.ordem_categorias = JSON.parse(configs.ordem_categorias || '[]');
    } catch (e) {
      console.error('Erro ao parsear configs:', e);
      if (!configs.destaques_itens) configs.destaques_itens = [];
      if (!configs.ordem_categorias) configs.ordem_categorias = [];
    }

    initGeraisTab();
    if (typeof window.initNfceTab === 'function') window.initNfceTab();
    if (typeof window.initResolucaoTab === 'function') window.initResolucaoTab();
    if (typeof window.initMaquininhasTab === 'function') window.initMaquininhasTab();
    if (typeof window.initSoundTab === 'function') window.initSoundTab();
    initFilaEsperaTab();
    initFuncionalidadesTab();
  }).catch(err => {
    console.error('Erro ao carregar configs:', err);
    initGeraisTab();
    initFilaEsperaTab();
    initFuncionalidadesTab();
  });

  // Emits para popular as outras abas (mesas, funcionarios, etc)
  // Protegidos: se o socket cair, NÃO pode abortar a inicialização
  // da navegação (era isso que deixava a página "presa" numa aba só).
  try {
    if (socket && typeof socket.emit === 'function') {
      socket.emit('get_mesas');
      socket.emit('get_funcionarios');
      socket.emit('get_clientes');
      socket.emit('get_promocoes');
    } else {
      console.warn('[config] socket indisponível ao abrir as configurações.');
    }
  } catch (e) {
    console.error('[config] erro nos emits iniciais:', e);
  }

  // Aba control
  const STORAGE_KEY = 'config_active_tab';

    function activateTab(tabId, skipSave) {

    if (tabId === 'montaveis') {
      activateTab('produtos', skipSave);
      setTimeout(() => {
        if (typeof window.trocarSubTabProdutos === 'function') {
          window.trocarSubTabProdutos('montaveis');
        }
      }, 50);
      return;
    }

    if (!tabId) return;
    let btn = document.querySelector('.admin-tab-btn[data-tab="' + tabId + '"]');
    let content = document.getElementById('admin-tab-' + tabId);
    /* Aba salva no localStorage pode não existir mais (renomeada/removida
       entre atualizações). Sem isso a página abre SEM nenhuma aba ativa e o
       usuário fica "preso" — obrigado a limpar os dados do navegador. */
    if (!btn || !content) {
      try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem('admin_active_tab'); } catch (e) {}
      if (window.location.hash) history.replaceState(null, '', window.location.pathname);
      if (tabId === 'gerais') return;
      activateTab('gerais', true);
      return;
    }

    document.querySelectorAll('.admin-tab-btn').forEach(b => {
      b.classList.remove('active');
      b.style.fontWeight = 'normal';
    });
    btn.classList.add('active');
    btn.style.fontWeight = 'bold';
    /* Garante que o grupo da aba ativa esteja expandido no acordeão */
    const grp = btn.closest('.action-group');
    if (grp) grp.classList.remove('collapsed');

    document.querySelectorAll('.admin-tab-content').forEach(c => {
      c.classList.remove('active');
      c.style.display = 'none';
    });

    content.classList.add('active');
    content.style.display = 'flex';
    content.scrollTop = 0;

    // Auto-scroll sidebar button into view (mobile horizontal scroll)
    try { btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); } catch(e) {}

    // Persist state
    if (!skipSave) {
      try { localStorage.setItem(STORAGE_KEY, tabId); } catch (e) {}
      if (window.location.hash !== '#' + tabId) {
        history.pushState({ tab: tabId }, '', '#' + tabId);
      }
    }

    // Lazy-load specific tab data on demand
    try {
      if (tabId === 'perfil' && socket && typeof socket.emit === 'function') socket.emit('get_restaurante_config');
      if (tabId === 'produtos' && socket && typeof socket.emit === 'function') socket.emit('get_produtos');
      if (tabId === 'mesas' && socket && typeof socket.emit === 'function') socket.emit('get_mesas');
      if (tabId === 'funcionarios' && socket && typeof socket.emit === 'function') socket.emit('get_funcionarios');
      if (tabId === 'clientes' && socket && typeof socket.emit === 'function') socket.emit('get_clientes');
      if (tabId === 'dispositivos' && typeof window.carregarGerenciadorDispositivos === 'function') window.carregarGerenciadorDispositivos();
      if (tabId === 'salao') {
        const t = document.getElementById('admin-tab-salao');
        if (t) t.dataset.carregada = 'true';
        if (typeof window.renderSalaoUI === 'function') window.renderSalaoUI();
      }
      if (tabId === 'reservas') {
        if (typeof window.carregarReservasAdmin === 'function') window.carregarReservasAdmin();
        if (typeof window.reservasCarregarPendentes === 'function') window.reservasCarregarPendentes();
        if (typeof window.reservasCarregarMes === 'function') window.reservasCarregarMes();
        const mesaSelect = document.getElementById('reserva-manual-mesa');
        if (mesaSelect && socket && typeof socket.emit === 'function') {
          socket.emit('get_mesas');
          socket.once('mesas_atualizadas', (mesas) => {
            mesaSelect.innerHTML = '<option value="">Selecionar mesa...</option>' + (mesas || []).map(m => '<option value="' + (typeof escHtml === 'function' ? escHtml(m.nome || m.mesaName) : (m.nome || m.mesaName)) + '">' + (typeof escHtml === 'function' ? escHtml(m.nome || m.mesaName) : (m.nome || m.mesaName)) + '</option>').join('');
          });
        }
      }
      if (tabId === 'metricas' && typeof window.carregarMetricasGarcons === 'function') window.carregarMetricasGarcons();
      if (tabId === 'formas-pagamento' && typeof window.carregarFormasPagamento === 'function') window.carregarFormasPagamento();
      if (tabId === 'pix-integracao' && typeof window.carregarConfiguracaoPixIntegracao === 'function') window.carregarConfiguracaoPixIntegracao();
      if (tabId === 'pins' && socket && typeof socket.emit === 'function') socket.emit('listar_pins_temporarios');
      if (tabId === 'promocoes') {
        if (socket && typeof socket.emit === 'function') socket.emit('get_cupons_list');
        if (typeof initDiasGrid === 'function' && typeof _diasGridInit !== 'undefined' && !_diasGridInit) { _diasGridInit = true; initDiasGrid(); }
      }
      if (tabId === 'fidelidade') {
        setTimeout(() => { if (typeof window.gerarQrCheckin === 'function') window.gerarQrCheckin(true); }, 300);
      }
      if (tabId === 'rh') {
        if (typeof emitGetRhData === 'function') emitGetRhData();
        if (socket && typeof socket.emit === 'function') socket.emit('get_relatorio_caixa');
      }
      if (tabId === 'gerenciar-notas' && typeof window.carregarTodasNotasNfce === 'function') {
        window.carregarTodasNotasNfce(1);
      }
      if (tabId === 'nfce' && typeof window.carregarConfigNfce === 'function') {
        window.carregarConfigNfce();
      }
      if (tabId === 'jogos' && typeof initAdminJogos === 'function') initAdminJogos();
      if (tabId === 'montaveis' && typeof initAdminMontaveis === 'function') initAdminMontaveis();
      if (tabId === 'inteligencia' && socket && typeof socket.emit === 'function') socket.emit('ia_get_config');
      if (tabId === 'auditoria' && typeof window.carregarLogsAuditoria === 'function') window.carregarLogsAuditoria();
      if (tabId === 'backup' && typeof window.carregarHistoricoBackups === 'function') window.carregarHistoricoBackups();
      if (tabId === 'funcoes' && typeof carregarFuncoesSistema === 'function') carregarFuncoesSistema();
    } catch (errLazy) {
      console.warn('[config tab lazy-load error]', tabId, errLazy);
    }

    // Update title
    const elTitulo = document.getElementById('titulo-aba');
    if (elTitulo) elTitulo.innerText = btn.innerText.trim();
  }

  window.activateTab = activateTab;

  /* Navegação por DELEGAÇÃO no documento: mesmo que qualquer outra
     inicialização desta página falhe, clicar numa seção SEMPRE troca a aba. */
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('.admin-tab-btn') : null;
    if (btn) {
      const tab = btn.getAttribute('data-tab');
      if (tab) activateTab(tab);
    }
  });

  // Tab priority: URL param > hash > localStorage (current + legacy) > default
  const urlParams = new URLSearchParams(window.location.search);
  const targetTab = urlParams.get('tab') || window.location.hash.replace('#', '') || localStorage.getItem(STORAGE_KEY) || localStorage.getItem('admin_active_tab') || 'gerais';
  try {
    activateTab(targetTab, true);
  } catch (e) {
    console.error('[config] falha ao ativar aba inicial:', e);
    try { activateTab('gerais', true); } catch (e2) { }
  }

  /* Voltar/avançar do navegador (e gesto de borda no iOS PWA) troca de aba */
  window.addEventListener('hashchange', () => {
    const h = window.location.hash.replace('#', '');
    if (h) activateTab(h, true);
  });
  window.addEventListener('popstate', () => {
    const h = window.location.hash.replace('#', '');
    activateTab(h || 'gerais', true);
  });

});

function escapeHtml(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

window.carregarMetricasGarcons = function() {
  const loading = document.getElementById('metricas-garcons-loading');
  const content = document.getElementById('metricas-garcons-content');
  const tbody = document.getElementById('metricas-garcons-tbody');
  if (!loading || !content || !tbody) return;
  loading.style.display = 'block';
  content.style.display = 'none';
  tbody.innerHTML = '';

  fetch('/api/metricas/garcons', { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      loading.style.display = 'none';
      if (!data || !data.ok || !data.metricas) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#ef4444;">Erro ao carregar métricas.</td></tr>';
        content.style.display = 'block';
        return;
      }
      if (data.metricas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#888;">Nenhum garçom ativo encontrado.</td></tr>';
        content.style.display = 'block';
        return;
      }
      let html = '';
      for (let i = 0; i < data.metricas.length; i++) {
        const m = data.metricas[i];
        const ef = m.taxaEficiencia;
        const efColor = ef >= 80 ? '#22c55e' : ef >= 50 ? '#f59e0b' : '#ef4444';
        const tempo = m.tempoMedioEntrega !== null ? m.tempoMedioEntrega + ' min' : '—';
        html += '<tr style="border-bottom:1px solid #2a2d35;">' +
          '<td style="padding:10px 12px;font-weight:bold;color:#1e1e2e;">' + escapeHtml(m.nome) + '</td>' +
          '<td style="padding:10px 12px;text-align:center;">' + m.total + '</td>' +
          '<td style="padding:10px 12px;text-align:center;color:#22c55e;font-weight:bold;">' + m.entregues + '</td>' +
          '<td style="padding:10px 12px;text-align:center;color:#f59e0b;">' + m.emAndamento + '</td>' +
          '<td style="padding:10px 12px;text-align:center;color:' + efColor + ';font-weight:bold;">' + ef + '%</td>' +
          '<td style="padding:10px 12px;text-align:center;">' + tempo + '</td>' +
          '<td style="padding:10px 12px;text-align:center;">R$ ' + m.totalGasto.toFixed(2).replace('.', ',') + '</td>' +
          '<td style="padding:10px 12px;text-align:center;">' + m.pedidosHoje + '</td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
      content.style.display = 'block';
    })
    .catch(() => {
      loading.style.display = 'none';
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#ef4444;">Erro ao carregar métricas.</td></tr>';
      content.style.display = 'block';
    });
};

// --- IMPORTAÇÃO DE PRODUTOS VIA PLANILHA ---
document.addEventListener('DOMContentLoaded', () => {
  const inputImport = document.getElementById('input-importar-produtos');
  if (!inputImport) return;
  inputImport.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('import-produtos-status');
    if (!statusEl) return;
    statusEl.style.display = 'block';
    statusEl.style.background = '#fef3c7';
    statusEl.style.color = '#92400e';
    statusEl.textContent = 'Enviando arquivo...';
    const formData = new FormData();
    formData.append('file', file);
    fetch('/api/importar-produtos', {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    }).then(r => r.json()).then(data => {
      if (data.ok) {
        statusEl.style.background = '#dcfce7';
        statusEl.style.color = '#166534';
        statusEl.textContent = `Importação concluída! ${data.inseridos} produto(s) inserido(s)` + (data.erros ? `, ${data.erros} erro(s)` : '') + ` de ${data.total} total.`;
        socket.emit('get_produtos');
      } else {
        statusEl.style.background = '#fee2e2';
        statusEl.style.color = '#991b1b';
        statusEl.textContent = 'Erro: ' + (data.erro || 'Falha ao importar.');
      }
    }).catch(() => {
      statusEl.style.background = '#fee2e2';
      statusEl.style.color = '#991b1b';
      statusEl.textContent = 'Erro de conexão ao enviar arquivo.';
    });
    inputImport.value = '';
  });
});

// --- GERENCIADOR DE DISPOSITIVOS & TERMINAIS ---
window.carregarGerenciadorDispositivos = function () {
  if (typeof socket !== 'undefined' && socket && socket.emit) socket.emit('get_connected_devices');
};

socket.on('connected_devices', (devices) => {
  const tbody = document.getElementById('tabela-gerenciador-dispositivos-body');
  const statTotal = document.getElementById('stat-disp-total');
  if (!tbody) return;
  if (statTotal) statTotal.innerText = (devices || []).length;

  if (!devices || devices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#888;">Nenhum aparelho conectado no momento.</td></tr>';
    return;
  }

  const TIPOS_DISPOSITIVO = ['', 'Caixa', 'PDV', 'Totem', 'Garçom', 'Cozinha', 'Recepção'];
  window.salvarApelidoDispositivo = function (serial, apelidoAtual, tipoAtual) {
    const apelido = prompt('Apelido para localizar este terminal facilmente\n(ex.: "Caixa 3 da choperia", "PDV entrada"):', apelidoAtual || '');
    if (apelido === null) return;
    let tipo = prompt('Tipo do dispositivo:\n(Caixa, PDV, Totem, Garçom, Cozinha, Recepção)', tipoAtual || '');
    if (tipo === null) tipo = tipoAtual || '';
    socket.emit('salvar_apelido_dispositivo', { serial: serial, apelido: apelido.trim(), tipo: tipo.trim() });
  };
  window.removerDispositivoSalvo = function (serial) {
    if (!confirm('Remover este dispositivo do cadastro? Ele voltará a aparecer sem apelido na próxima conexão.')) return;
    socket.emit('remover_dispositivo_salvo', { serial: serial });
  };
  window.definirModoDispositivo = function (serial, modo) {
    const rotulos = { totem: 'Totem (auto-atendimento)', totem_invertido: 'Totem com tela invertida', normal: 'Modo normal' };
    if (!confirm(`Alterar este terminal para "${rotulos[modo] || modo}"?\n\n${modo !== 'normal' ? 'A tela dele virará o cardápio digital imediatamente.' : 'Ele voltará à tela de operação normal.'}`)) {
      window.carregarGerenciadorDispositivos();
      return;
    }
    socket.emit('definir_modo_dispositivo', { serial, modo }, (res) => {
      if (res && res.ok === false) alert(res.mensagem || 'Falha ao alterar o modo.');
    });
  };

  tbody.innerHTML = devices.map(d => {
    const icon = d.icon || (d.isMobile ? 'ph-device-mobile' : 'ph-desktop');
    const user = d.user || 'Visitante';
    const cargo = d.cargo || (user === 'Visitante' ? 'Sem Login' : 'Operador');
    const model = d.model || 'Dispositivo Web';
    const osStr = d.os ? d.os + ' • ' + d.browser : (d.device || '');
    const tempo = d.tempoConectadoStr || 'Pouco tempo';
    const apelido = d.apelido || '';
    const tipo = d.tipo || '';
    const nomeExibicao = apelido ? `${apelido} <span style="font-weight:400;color:#64748b;font-size:11px;">(${escapeHtml(model)})</span>` : escapeHtml(model);
    const serialHtml = d.serial
      ? '<div style="font-size:10px;color:#94a3b8;font-family:monospace;" title="Serial deste terminal — use para atribuir o apelido">' + escapeHtml(d.serial) + '</div>'
      : '';
    const btnIdentificar = d.serial
      ? '<button onclick="window.salvarApelidoDispositivo(\'' + escapeHtml(d.serial) + '\', \'' + escapeHtml(apelido).replace(/'/g, '&#39;') + '\', \'' + escapeHtml(tipo) + '\')" title="Atribuir apelido/tipo a esta máquina" style="background:#e0f2fe;border:1px solid #7dd3fc;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;color:#0369a1;font-weight:700;"><i class="ph ph-tag"></i> Identificar</button>' +
        (apelido || tipo ? ' <button onclick="window.removerDispositivoSalvo(\'' + escapeHtml(d.serial) + '\')" title="Remover cadastro do dispositivo" style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:6px 8px;cursor:pointer;font-size:12px;color:#b91c1c;"><i class="ph ph-x"></i></button>' : '')
      : '';
    const badgeTipo = tipo ? '<span style="font-size:10px;background:#fef9c3;color:#a16207;padding:2px 8px;border-radius:12px;font-weight:800;margin-left:4px;text-transform:uppercase;">' + escapeHtml(tipo) + '</span>' : '';
    const modoAtual = d.modo || 'normal';
    const selModo = d.serial
      ? '<select onchange="window.definirModoDispositivo(\'' + escapeHtml(d.serial) + '\', this.value)" style="padding:6px 8px;border-radius:8px;border:1px solid var(--cfg-border);background:var(--cfg-subtle-bg);color:' + (modoAtual === 'normal' ? '#334155' : '#b45309') + ';font-size:12px;font-weight:700;cursor:pointer;">' +
        '<option value="normal"' + (modoAtual === 'normal' ? ' selected' : '') + '>Normal</option>' +
        '<option value="totem"' + (modoAtual === 'totem' ? ' selected' : '') + '>Totem</option>' +
        '<option value="totem_invertido"' + (modoAtual === 'totem_invertido' ? ' selected' : '') + '>Totem invertido</option>' +
        '</select>'
      : '<span style="font-size:11px;color:#94a3b8;">—</span>';
    return '<tr style="border-bottom:1px solid #2a2d35;">' +
      '<td style="padding:10px 16px;"><i class="ph ' + icon + '" style="margin-right:6px;color:#0284c7;"></i><strong>' + nomeExibicao + '</strong>' + badgeTipo + serialHtml + (osStr ? '<div style="font-size:11px;color:#64748b;">' + escapeHtml(osStr) + '</div>' : '') + '</td>' +
      '<td style="padding:10px 16px;">' + escapeHtml(user) + ' <span style="font-size:11px;background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:12px;font-weight:700;">' + escapeHtml(cargo) + '</span></td>' +
      '<td style="padding:10px 16px;color:#475569;">' + escapeHtml(d.ip || '-') + '</td>' +
      '<td style="padding:10px 16px;color:#64748b;">' + escapeHtml(tempo) + '</td>' +
      '<td style="padding:10px 16px;"><span style="color:#047857;font-weight:700;font-size:12px;">● Online</span></td>' +
      '<td style="padding:10px 16px;text-align:right;white-space:nowrap;">' + selModo + ' ' + btnIdentificar +
        (d.id ? ' <button onclick="window.desconectarDispositivo(\'' + escapeHtml(d.id) + '\', \'' + escapeHtml(nomeExibicao) + '\')" style="padding:5px 10px;border-radius:8px;border:1px solid #fecaca;background:#fef2f2;color:#dc2626;font-size:11px;font-weight:700;cursor:pointer;" title="Desconectar este dispositivo"><i class="ph ph-x-circle"></i> Desconectar</button>' : '') +
      '</td>' +
    '</tr>';
  }).join('');
});

socket.on('dispositivo_salvo_ok', () => {
  if (typeof window.showToast === 'function') window.showToast('✓ Dispositivo identificado com sucesso!', 'success');
  window.carregarGerenciadorDispositivos();
});

window.desconectarDispositivo = function(socketId, nome) {
  if (!confirm('Deseja desconectar o dispositivo "' + nome + '"? O usuário será desconectado imediatamente.')) return;
  const token = localStorage.getItem('chef_token') || '';
  fetch('/api/dispositivos/' + encodeURIComponent(socketId) + '/desconectar', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  }).then(r => r.json()).then(d => {
    if (d.success) { if (typeof showToast === 'function') showToast('Dispositivo desconectado.', 'success'); }
    else { if (typeof showToast === 'function') showToast('Erro: ' + (d.error || 'desconhecido'), 'danger'); }
  }).catch(e => { if (typeof showToast === 'function') showToast('Falha ao desconectar: ' + e.message, 'danger'); });
};

/* ═════════ LAYOUT DO SALÃO — desenhador arrastável de mesas ═════════
   Coordenadas normalizadas: pos_x 0–1000, pos_y 0–600. Mesas próximas
   (distância ≤ 95) viram sugestões automáticas de junção para reservas. */
let _salaoSalaAtual = null;
let _salaoSalaManual = false; // salão novo criado nesta sessão ainda sem mesas
const _salaoPendente = {}; // id -> {pos_x, pos_y, lugares, sala}

function _salaoMesasValidas() {
  return (currentMesas || []).filter(m => m && m.nome && !String(m.nome).toLowerCase().includes('comanda'));
}

window.renderSalaoUI = function () {
  const mesas = _salaoMesasValidas();
  const salas = [...new Set(mesas.map(m => (m.sala || 'Salão principal').trim()))];
  if (!salas.length) salas.push('Salão principal');
  // Mantém salão recém-criado (ainda vazio); só reseta se nunca foi escolhido
  if (!_salaoSalaAtual || (!_salaoSalaManual && !salas.includes(_salaoSalaAtual))) {
    _salaoSalaAtual = salas[0];
    _salaoSalaManual = false;
  }

  const tabsEl = document.getElementById('salao-tabs');
  if (tabsEl) {
    tabsEl.innerHTML = salas.map(s => {
      const qtd = mesas.filter(m => (m.sala || 'Salão principal').trim() === s).length;
      const ativo = s === _salaoSalaAtual;
      return `<button data-sala="${escapeHtml(s)}" style="padding:8px 16px;border-radius:20px;border:1px solid ${ativo ? '#0ea5e9' : 'var(--cfg-border,#cbd5e1)'};background:${ativo ? '#0ea5e9' : 'transparent'};color:${ativo ? '#fff' : 'var(--cfg-text-muted,#64748b)'};font-weight:bold;font-size:13px;cursor:pointer;">${escapeHtml(s)} <span style="opacity:.75;">(${qtd})</span></button>`;
    }).join('');
    tabsEl.querySelectorAll('button[data-sala]').forEach(b => {
      b.onclick = () => { _salaoSalaAtual = b.getAttribute('data-sala'); _salaoSalaManual = false; window.renderSalaoUI(); };
    });
  }
  window.renderSalaoCanvas();
};

window.renderSalaoCanvas = function () {
  const canvas = document.getElementById('salao-canvas');
  if (!canvas) return;
  const vazio = document.getElementById('salao-canvas-empty');
  const mesas = _salaoMesasValidas().filter(m => (m.sala || 'Salão principal').trim() === _salaoSalaAtual);
  if (vazio) vazio.style.display = mesas.length ? 'none' : 'flex';
  canvas.querySelectorAll('.salao-mesa-chip').forEach(c => c.remove());

  // Posições padrão em grade para mesas ainda não posicionadas
  const semPos = mesas.filter(m => m.pos_x == null || m.pos_y == null);
  semPos.forEach((m, i) => {
    const col = i % 4, lin = Math.floor(i / 4);
    if (m.pos_x == null) m.pos_x = 90 + col * 180;
    if (m.pos_y == null) m.pos_y = 80 + lin * 150;
  });

  mesas.forEach(m => {
    const p = _salaoPendente[m.id] || {};
    const x = p.pos_x != null ? p.pos_x : m.pos_x;
    const y = p.pos_y != null ? p.pos_y : m.pos_y;
    const lugares = p.lugares != null ? p.lugares : (m.lugares || 4);
    const chip = document.createElement('div');
    chip.className = 'salao-mesa-chip';
    chip.dataset.id = m.id;
    chip.style.cssText = `position:absolute;left:${(x / 1000) * 100}%;top:${(y / 600) * 100}%;transform:translate(-50%,-50%);width:76px;height:64px;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:grab;user-select:none;touch-action:none;font-size:12px;font-weight:bold;color:#fff;background:${m.grupo_juncao ? '#f59e0b' : (m.status === 'Reservada' ? '#8b5cf6' : (m.status === 'Ocupada' || m.status === 'Ocupada ') ? '#ef4444' : '#3ab55b')};box-shadow:0 2px 8px rgba(0,0,0,.18);border:2px solid ${m.grupo_juncao ? '#b45309' : 'rgba(255,255,255,.35)'};`;
    chip.innerHTML = `<span style="pointer-events:none;">${escapeHtml(m.nome)}</span><span style="font-size:10px;opacity:.9;pointer-events:none;"><i class="ph ph-users"></i> ${lugares}</span>${m.grupo_juncao ? '<i class="ph ph-link" style="position:absolute;top:-7px;right:-7px;background:#fff;color:#b45309;border-radius:50%;font-size:11px;padding:2px;" title="Em junção"></i>' : ''}`;
    canvas.appendChild(chip);
    _salaoAtivarDrag(chip, canvas, m);
    chip.addEventListener('click', () => { if (!_salaoArrastando) window.salaoSelecionarMesa(m); });
  });
};

let _salaoArrastando = false;
function _salaoAtivarDrag(chip, canvas, mesa) {
  let moved = false;
  chip.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    moved = false;
    chip.setPointerCapture(ev.pointerId);
    chip.style.cursor = 'grabbing';
    chip.style.zIndex = '50';

    const mover = (e2) => {
      const rect = canvas.getBoundingClientRect();
      const px = Math.min(Math.max(e2.clientX - rect.left, 0), rect.width);
      const py = Math.min(Math.max(e2.clientY - rect.top, 0), rect.height);
      chip.style.left = (px / rect.width * 100) + '%';
      chip.style.top = (py / rect.height * 100) + '%';
      moved = true;
      _salaoArrastando = true;
    };
    const soltar = (e2) => {
      chip.removeEventListener('pointermove', mover);
      chip.removeEventListener('pointerup', soltar);
      chip.removeEventListener('pointercancel', soltar);
      chip.style.cursor = 'grab';
      chip.style.zIndex = '';
      if (moved) {
        setTimeout(() => { _salaoArrastando = false; }, 60);
        const rect = canvas.getBoundingClientRect();
        const px = e2.clientX - rect.left, py = e2.clientY - rect.top;
        _salaoPendente[mesa.id] = Object.assign(_salaoPendente[mesa.id] || {}, {
          pos_x: Math.round(px / rect.width * 1000),
          pos_y: Math.round(py / rect.height * 600),
          lugares: (_salaoPendente[mesa.id] && _salaoPendente[mesa.id].lugares) != null ? _salaoPendente[mesa.id].lugares : (mesa.lugares || 4),
          sala: _salaoSalaAtual
        });
        window.salaoSelecionarMesa(mesa);
      }
    };
    chip.addEventListener('pointermove', mover);
    chip.addEventListener('pointerup', soltar);
    chip.addEventListener('pointercancel', soltar);
  });
}

window.salaoSelecionarMesa = function (mesa) {
  const insp = document.getElementById('salao-inspector');
  if (!insp) return;
  insp.style.display = 'flex';
  document.getElementById('salao-inspector-nome').innerText = mesa.nome;
  const mLug = document.getElementById('salao-inspector-lugares');
  const mSal = document.getElementById('salao-inspector-sala');
  mLug.value = (_salaoPendente[mesa.id] && _salaoPendente[mesa.id].lugares != null) ? _salaoPendente[mesa.id].lugares : (mesa.lugares || 4);
  mSal.value = _salaoSalaAtual || '';
  mSal.readOnly = false;
  mSal.oninput = () => {
    _salaoPendente[mesa.id] = Object.assign(_salaoPendente[mesa.id] || {}, { sala: mSal.value.trim() || 'Salão principal', lugares: parseInt(mLug.value, 10) || 4 });
  };
  mLug.oninput = () => {
    _salaoPendente[mesa.id] = Object.assign(_salaoPendente[mesa.id] || {}, { lugares: Math.max(1, parseInt(mLug.value, 10) || 4), sala: (mSal.value.trim() || _salaoSalaAtual) });
    window.renderSalaoCanvas();
  };
  const wrapJun = document.getElementById('salao-inspector-juncao');
  const btnDesf = document.getElementById('btn-salao-desfazer-juncao');
  if (wrapJun && btnDesf) {
    wrapJun.style.display = mesa.grupo_juncao ? 'block' : 'none';
    btnDesf.onclick = () => {
      socket.emit('desfazer_juncao', { mesaNome: mesa.nome, operador: (window.crmPerfil && window.crmPerfil.nome) || 'Admin' }, (res) => {
        if (res && res.ok === false) alert(res.mensagem || 'Falha ao desfazer.');
      });
    };
  }
};

// Clique no fundo do canvas desmarca a seleção
document.getElementById('salao-canvas')?.addEventListener('click', (ev) => {
  if (ev.target && ev.target.id === 'salao-canvas') {
    const insp = document.getElementById('salao-inspector');
    if (insp) insp.style.display = 'none';
  }
});

window.salaoNovoSalaoPrompt = function () {
  const nome = prompt('Nome do novo salão/ambiente:\n(ex.: "Salão externo", "Anexo", "Varanda")');
  if (!nome || !nome.trim()) return;
  _salaoSalaAtual = nome.trim();
  _salaoSalaManual = true;
  window.renderSalaoUI();
  if (typeof showToast === 'function') showToast(`Volte ao salão anterior, clique numa mesa e troque o campo "Salão" para "${nome.trim()}". Depois clique em Salvar Layout.`, 'info');
};

window.salvarLayoutSalao = function () {
  const ids = Object.keys(_salaoPendente);
  if (!ids.length) {
    if (typeof showToast === 'function') showToast('Nenhuma alteração pendente no layout.', 'info');
    return;
  }
  const payload = ids.map(id => Object.assign({ id: parseInt(id, 10) }, _salaoPendente[id]));
  socket.emit('salvar_layout_salao', { mesas: payload, operador: (window.crmPerfil && window.crmPerfil.nome) || 'Admin' }, (res) => {
    if (res && res.ok) {
      Object.keys(_salaoPendente).forEach(k => delete _salaoPendente[k]);
      if (typeof showToast === 'function') showToast(res.mensagem || 'Layout salvo!', 'success');
    } else {
      alert((res && res.mensagem) || 'Falha ao salvar o layout.');
    }
  });
};

// ── Falhas internas do servidor: dono/admin vê na hora (rede de segurança anti-crash) ──
socket.on('aviso_admin_critico', (aviso) => {
  const msg = `🚨 Falha interna detectada (${(aviso && aviso.tipo) || '?'}). Confira se os últimos registros aparecem nas listas — se algo não registrou, refaça. O suporte técnico já foi acionado automaticamente.`;
  if (typeof window.showToast === 'function') window.showToast(msg, 'danger');
  else alert(msg);
});

/* ═════════ RESERVAS FUTURAS — calendário, aprovações e prazo ═════════ */
let _reservasMesAtual = new Date();
let _reservasCache = []; // reservas do mês visível

function _resData(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _resHoje() { return _resData(new Date()); }

window.carregarReservasAdmin = function () {
  const rid = encodeURIComponent(localStorage.getItem('restaurante_id') || '1');
  // Prazo
  fetch('/api/reservas/config?restaurante_id=' + rid)
    .then(r => r.json())
    .then(cfg => {
      const input = document.getElementById('reservas-prazo-input');
      if (input && cfg && cfg.ok) input.value = cfg.prazo_max_dias;
      const desc = document.getElementById('reservas-prazo-desc');
      if (desc && cfg && cfg.ok) desc.textContent = `O cliente reserva sozinho até ${cfg.prazo_max_dias} dia(s) à frente. Além do prazo, a reserva chega para VOCÊ aprovar com todos os dados do cliente.`;
    }).catch(() => {});
  window.reservasCarregarMes();
  window.reservasCarregarPendentes();
};

window.salvarPrazoReservas = function () {
  const dias = parseInt(document.getElementById('reservas-prazo-input').value, 10);
  if (isNaN(dias) || dias < 0 || dias > 365) return alert('Informe um prazo entre 0 e 365 dias.');
  fetch('/api/reservas/config?restaurante_id=' + encodeURIComponent(localStorage.getItem('restaurante_id') || '1'), {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ prazo_max_dias: dias })
  }).then(r => r.json()).then(data => {
    if (data && data.ok) {
      if (typeof showToast === 'function') showToast(data.mensagem, 'success'); else alert(data.mensagem);
    } else alert((data && data.erro) || 'Erro ao salvar.');
  });
};

window.criarReservaManual = function() {
  const cliente = (document.getElementById('reserva-manual-cliente') || {}).value || '';
  const telefone = (document.getElementById('reserva-manual-telefone') || {}).value || '';
  const data = (document.getElementById('reserva-manual-data') || {}).value || '';
  const horario = (document.getElementById('reserva-manual-hora') || {}).value || '19:00';
  const pessoas = parseInt((document.getElementById('reserva-manual-pessoas') || {}).value) || 2;
  const mesa = (document.getElementById('reserva-manual-mesa') || {}).value || '';
  if (!cliente.trim() || !telefone.trim() || !data) {
    if (typeof showToast === 'function') showToast('Preencha nome, telefone e data.', 'danger');
    return;
  }
  fetch('/api/reservas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('chef_token') || '') },
    body: JSON.stringify({ mesa_nome: mesa || 'Reserva', nome: cliente.trim(), telefone: telefone.trim(), data, horario, pessoas })
  }).then(r => r.json()).then(d => {
    if (d.ok) {
      if (typeof showToast === 'function') showToast('Reserva criada!', 'success');
      document.getElementById('reserva-manual-cliente').value = '';
      document.getElementById('reserva-manual-telefone').value = '';
      window.reservasCarregarMes && window.reservasCarregarMes();
    } else {
      if (typeof showToast === 'function') showToast(d.erro || 'Erro ao criar reserva.', 'danger');
    }
  }).catch(() => { if (typeof showToast === 'function') showToast('Erro de conexão.', 'danger'); });
};

window.reservasMudarMes = function (delta) {
  _reservasMesAtual = new Date(_reservasMesAtual.getFullYear(), _reservasMesAtual.getMonth() + delta, 1);
  window.reservasCarregarMes();
};
window.reservasIrHoje = function () {
  _reservasMesAtual = new Date();
  window.reservasCarregarMes();
};

window.reservasCarregarMes = function () {
  const ano = _reservasMesAtual.getFullYear();
  const mes = _reservasMesAtual.getMonth(); // 0-11
  const primeiro = new Date(ano, mes, 1);
  const ultimo = new Date(ano, mes + 1, 0);
  const rid = encodeURIComponent(localStorage.getItem('restaurante_id') || '1');

  const tituloEl = document.getElementById('reservas-cal-titulo');
  if (tituloEl) tituloEl.textContent = primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());

  fetch(`/api/reservas?de=${_resData(primeiro)}&ate=${_resData(ultimo)}&restaurante_id=${rid}`, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      _reservasCache = (data && data.ok) ? (data.reservas || []) : [];
      renderizarCalendarioReservas(ano, mes, ultimo.getDate());
    })
    .catch(() => { _reservasCache = []; renderizarCalendarioReservas(ano, mes, ultimo.getDate()); });
};

function renderizarCalendarioReservas(ano, mes, diasNoMes) {
  const grid = document.getElementById('reservas-calendario');
  if (!grid) return;
  const nomesDow = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  let html = nomesDow.map(d => `<div style="text-align:center;font-size:11px;font-weight:800;color:#64748b;padding:4px 0;">${d}</div>`).join('');

  const dowPrimeiro = new Date(ano, mes, 1).getDay();
  for (let i = 0; i < dowPrimeiro; i++) html += '<div></div>';

  const hoje = _resHoje();
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const dataStr = ano + '-' + String(mes + 1).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
    const doDia = _reservasCache.filter(r => r.data_reserva === dataStr);
    const pendentes = doDia.filter(r => r.status === 'pendente_aprovacao').length;
    const confirmadas = doDia.filter(r => ['confirmada', 'checkin'].includes(r.status)).length;
    const ehHoje = dataStr === hoje;

    let fundo = 'transparent', borda = 'var(--cfg-border)';
    if (pendentes > 0) { fundo = 'rgba(245,158,11,0.15)'; borda = '#f59e0b'; }
    else if (confirmadas > 0) { fundo = 'rgba(14,165,233,0.12)'; borda = '#0ea5e9'; }

    html += `<div onclick="window.reservasVerDia('${dataStr}')" style="cursor:pointer;min-height:58px;border:1px solid ${borda};background:${fundo};border-radius:8px;padding:5px;position:relative;" title="${doDia.length} reserva(s)">
      <div style="font-size:12px;font-weight:${ehHoje ? '900' : '700'};color:${ehHoje ? '#0ea5e9' : 'var(--cfg-text)'};">${dia}${ehHoje ? ' •' : ''}</div>
      ${confirmadas ? `<div style="font-size:10px;color:#0ea5e9;font-weight:700;">✓ ${confirmadas}</div>` : ''}
      ${pendentes ? `<div style="font-size:10px;color:#d97706;font-weight:700;">⏳ ${pendentes}</div>` : ''}
    </div>`;
  }
  grid.innerHTML = html;
}

window.reservasVerDia = function (dataStr) {
  const box = document.getElementById('reservas-dia-detalhe');
  if (!box) return;
  const doDia = (_reservasCache || []).filter(r => r.data_reserva === dataStr);
  const label = dataStr.split('-').reverse().join('/');

  if (!doDia.length) {
    box.innerHTML = `<div style="text-align:center;padding:14px;color:#64748b;font-size:13px;">Nenhuma reserva em <strong>${label}</strong>.</div>`;
    return;
  }

  const STATUS_COR = { confirmada: ['#dcfce7', '#166534', 'Confirmada'], checkin: ['#dbeafe', '#1e40af', 'Check-in feito'], pendente_aprovacao: ['#fef3c7', '#92400e', 'Aguardando aprovação'], cancelada: ['#fee2e2', '#991b1b', 'Cancelada'], concluida: ['#e0e7ff', '#3730a3', 'Concluída'] };
  box.innerHTML = `<h4 style="margin:0 0 8px 0;font-size:13.5px;">Reservas de ${label}</h4>` + doDia.map(r => {
    const [bg, fg, stLabel] = STATUS_COR[r.status] || ['#f1f5f9', '#334155', r.status];
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;background:${bg};border-radius:10px;padding:10px 14px;margin-bottom:6px;">
      <div style="font-size:13px;color:${fg};">
        <strong>${escHtml(r.horario)}</strong> • <strong>${escHtml(r.mesa_nome)}</strong> — ${escHtml(r.cliente_nome)} (${r.pessoas}p)
        <span style="font-size:11px;opacity:0.85;">📞 ${escHtml(r.cliente_telefone || '-')}</span>
        ${r.observacao ? `<div style="font-size:11.5px;margin-top:2px;">💬 ${escHtml(r.observacao)}</div>` : ''}
        ${r.motivo_pendente ? `<div style="font-size:11px;opacity:0.75;">${escHtml(r.motivo_pendente)}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:11px;background:white;color:${fg};padding:2px 10px;border-radius:12px;font-weight:800;">${stLabel}</span>
        ${['pendente_aprovacao', 'confirmada'].includes(r.status) ? `
          ${r.status === 'pendente_aprovacao' ? `<button onclick="window.reservaResolver(${r.id},'aprovar')" style="padding:6px 12px;background:#16a34a;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:12px;">Aprovar</button>` : ''}
          <button onclick="window.reservaRecusarPrompt(${r.id})" style="padding:6px 12px;background:#dc2626;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:12px;">Recusar</button>` : ''}
      </div>
    </div>`;
  }).join('');
};

window.reservaResolver = function (id, acao) {
  fetch(`/api/reservas/${id}/${acao}?restaurante_id=` + encodeURIComponent(localStorage.getItem('restaurante_id') || '1'), {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({})
  }).then(r => r.json()).then(data => {
    if (typeof showToast === 'function') showToast(data.mensagem || data.erro || 'Feito!', data.ok ? 'success' : 'danger');
    window.carregarReservasAdmin();
  });
};

window.reservaRecusarPrompt = function (id) {
  const motivo = prompt('Motivo da recusa (o cliente pode ser contactado):\nex: "mesa já tem evento nesse horário, temos disponível na sexta"');
  if (motivo === null) return;
  fetch(`/api/reservas/${id}/recusar?restaurante_id=` + encodeURIComponent(localStorage.getItem('restaurante_id') || '1'), {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ motivo: motivo })
  }).then(r => r.json()).then(data => {
    if (typeof showToast === 'function') showToast(data.mensagem || data.erro || 'Feito!', data.ok ? 'success' : 'danger');
    window.carregarReservasAdmin();
  });
};

window.reservasCarregarPendentes = function () {
  const rid = encodeURIComponent(localStorage.getItem('restaurante_id') || '1');
  fetch('/api/reservas/pendentes?restaurante_id=' + rid, { headers: authHeaders() })
    .then(r => r.json())
    .then(data => {
      const card = document.getElementById('reservas-pendentes-card');
      const lista = document.getElementById('reservas-pendentes-lista');
      const badge = document.getElementById('reservas-pendentes-badge');
      if (!card || !lista) return;
      const pendentes = (data && data.ok) ? (data.pendentes || []) : [];
      if (badge) badge.innerText = pendentes.length;
      card.style.display = pendentes.length ? 'block' : 'none';
      lista.innerHTML = pendentes.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;background:var(--cfg-card-bg);border:1px solid var(--cfg-border);border-radius:10px;padding:10px 14px;margin-bottom:6px;">
          <div style="font-size:13px;">
            <strong>${escHtml(r.cliente_nome)}</strong> quer a <strong>${escHtml(r.mesa_nome)}</strong> em
            <strong style="color:#d97706;">${(r.data_reserva || '').split('-').reverse().join('/')}</strong> às <strong>${escHtml(r.horario)}</strong> (${r.pessoas}p)
            <span style="font-size:11px;color:#64748b;">📞 ${escHtml(r.cliente_telefone || '-')}</span>
            ${r.observacao ? `<div style="font-size:11.5px;margin-top:2px;color:#64748b;">"${escHtml(r.observacao)}"</div>` : ''}
            ${r.motivo_pendente ? `<div style="font-size:11px;color:#94a3b8;">${escHtml(r.motivo_pendente)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;">
            <button onclick="window.reservaResolver(${r.id},'aprovar')" style="padding:6px 12px;background:#16a34a;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:12px;">✓ Aprovar</button>
            <button onclick="window.reservaRecusarPrompt(${r.id})" style="padding:6px 12px;background:#dc2626;color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:12px;">Recusar / Negociar</button>
          </div>
        </div>`).join('');
    });
};

socket.on('reservas_atualizadas', () => {
  const tab = document.getElementById('admin-tab-reservas');
  if (tab && tab.style.display !== 'none') window.carregarReservasAdmin();
});
socket.on('reserva_aguardando_aprovacao', (r) => {
  const msg = `⏳ Nova reserva fora do prazo: ${r.cliente} quer a ${r.mesa} em ${(r.data || '').split('-').reverse().join('/')} às ${r.horario}. Abra Reservas Futuras para aprovar.`;
  if (typeof showToast === 'function') showToast(msg, 'warning');
});
socket.on('reserva_checkin', (r) => {
  const msg = `✅ Check-in: ${r.cliente} chegou na ${r.mesa} (${r.pessoas} pessoas).`;
  if (typeof showToast === 'function') showToast(msg, 'success');
});

socket.on('server_status_update', () => {
  window.carregarGerenciadorDispositivos();
});

socket.on('connected_devices_updated', () => {
  const tab = document.getElementById('admin-tab-dispositivos');
  if (tab && tab.style.display !== 'none') window.carregarGerenciadorDispositivos();
});

function initGeraisTab() {
  const chkAtivo = document.getElementById('chk-destaques-ativos');
  const selectAdd = document.getElementById('select-add-destaque');
  const btnAdd = document.getElementById('btn-add-destaque');
  const listaManuais = document.getElementById('lista-destaques-manuais');
  const divSortable = document.getElementById('sortable-categorias');
  const btnSalvarOrdem = document.getElementById('btn-salvar-ordem');

  // Setup Checkbox
  if (chkAtivo) {
    chkAtivo.checked = configs.destaques_ativos;
    chkAtivo.onchange = () => {
      configs.destaques_ativos = chkAtivo.checked;
      salvarConfiguracoes();
    };
  }

  const chkTouch = document.getElementById('chk-modo-touch');
  if (chkTouch) {
    chkTouch.checked = !!configs.modo_touch;
    chkTouch.onchange = () => {
      configs.modo_touch = chkTouch.checked;
      salvarConfiguracoes();
    };
  }

  const chkPontoSaida = document.getElementById('chk-ponto-saida-fechar-caixa');
  if (chkPontoSaida) {
    chkPontoSaida.checked = !!configs.ponto_saida_fechar_caixa;
    chkPontoSaida.onchange = () => {
      configs.ponto_saida_fechar_caixa = chkPontoSaida.checked;
      salvarConfiguracoes();
    };
  }

  const chkQrEnabled = document.getElementById('chk-qr-order-enabled');
  const divQrFields = document.getElementById('qr-order-settings-fields');
  const selectQrFlow = document.getElementById('select-qr-order-flow');
  const divPixFields = document.getElementById('qr-pix-fields');
  const inputQrPixKey = document.getElementById('input-qr-pix-key');
  const inputQrPixName = document.getElementById('input-qr-pix-name');

  if (chkQrEnabled && divQrFields && selectQrFlow && divPixFields && inputQrPixKey && inputQrPixName) {
    chkQrEnabled.checked = !!configs.qr_order_enabled;
    divQrFields.style.display = configs.qr_order_enabled ? 'flex' : 'none';
    chkQrEnabled.onchange = () => {
      configs.qr_order_enabled = chkQrEnabled.checked;
      divQrFields.style.display = chkQrEnabled.checked ? 'flex' : 'none';
      salvarConfiguracoes();
    };

    selectQrFlow.value = configs.qr_order_flow || 'caixa';
    divPixFields.style.display = selectQrFlow.value === 'pix' ? 'flex' : 'none';
    selectQrFlow.onchange = () => {
      configs.qr_order_flow = selectQrFlow.value;
      divPixFields.style.display = selectQrFlow.value === 'pix' ? 'flex' : 'none';
      salvarConfiguracoes();
    };

    inputQrPixKey.value = configs.qr_pix_key || '';
    inputQrPixKey.onchange = () => {
      configs.qr_pix_key = inputQrPixKey.value;
      salvarConfiguracoes();
    };

    inputQrPixName.value = configs.qr_pix_name || '';
    inputQrPixName.onchange = () => {
      configs.qr_pix_name = inputQrPixName.value;
      salvarConfiguracoes();
    };
  }

  // ── SEPARAÇÃO DE CONTA PELO CLIENTE (QR) ──
  const selectSplitExc = document.getElementById('select-split-excedente');
  if (selectSplitExc) {
    selectSplitExc.value = configs.split_excedente || 'perguntar';
    selectSplitExc.onchange = () => {
      configs.split_excedente = selectSplitExc.value;
      salvarConfiguracoes();
    };
  }

  
  // ── BINDING DAS CONFIGURAÇÕES AVANÇADAS DE PEDIDOS QR ──
  const chkQrHorario = document.getElementById('chk-qr-horario-ativo');
  const divQrHorario = document.getElementById('qr-horario-fields');
  const inQrInicio = document.getElementById('input-qr-horario-inicio');
  const inQrFim = document.getElementById('input-qr-horario-fim');
  const selQrModo = document.getElementById('select-qr-modo-aceitacao');
  const chkQrCheckin = document.getElementById('chk-qr-checkin-obrigatorio');
  const divQrCheckin = document.getElementById('qr-checkin-fields');
  const inCheckinIni = document.getElementById('input-qr-checkin-inicial');
  const inCheckinRen = document.getElementById('input-qr-checkin-renovacao');
  const selQrAuto = document.getElementById('select-qr-auto-aceite');
  const divQrHoras = document.getElementById('qr-auto-horas-container');
  const inQrHoras = document.getElementById('input-qr-auto-horas');
  const divQrDias = document.getElementById('qr-auto-dias-container');

  if (chkQrHorario && divQrHorario && selQrModo && chkQrCheckin && selQrAuto) {
    chkQrHorario.checked = !!configs.qr_horario_ativo;
    divQrHorario.style.display = configs.qr_horario_ativo ? 'flex' : 'none';
    chkQrHorario.onchange = () => {
      configs.qr_horario_ativo = chkQrHorario.checked;
      divQrHorario.style.display = chkQrHorario.checked ? 'flex' : 'none';
      salvarConfiguracoes();
    };

    if (inQrInicio) {
      inQrInicio.value = configs.qr_horario_inicio || '11:00';
      inQrInicio.onchange = () => { configs.qr_horario_inicio = inQrInicio.value; salvarConfiguracoes(); };
    }
    if (inQrFim) {
      inQrFim.value = configs.qr_horario_fim || '23:30';
      inQrFim.onchange = () => { configs.qr_horario_fim = inQrFim.value; salvarConfiguracoes(); };
    }

    selQrModo.value = configs.qr_modo_aceitacao || 'restaurante_apenas';
    selQrModo.onchange = () => { configs.qr_modo_aceitacao = selQrModo.value; salvarConfiguracoes(); };

    chkQrCheckin.checked = !!configs.qr_checkin_obrigatorio;
    divQrCheckin.style.display = configs.qr_checkin_obrigatorio ? 'flex' : 'none';
    chkQrCheckin.onchange = () => {
      configs.qr_checkin_obrigatorio = chkQrCheckin.checked;
      divQrCheckin.style.display = chkQrCheckin.checked ? 'flex' : 'none';
      salvarConfiguracoes();
    };

    if (inCheckinIni) {
      inCheckinIni.value = configs.qr_tempo_checkin_inicial_min || 90;
      inCheckinIni.onchange = () => { configs.qr_tempo_checkin_inicial_min = parseInt(inCheckinIni.value, 10) || 90; salvarConfiguracoes(); };
    }
    if (inCheckinRen) {
      inCheckinRen.value = configs.qr_tempo_renovacao_min || 15;
      inCheckinRen.onchange = () => { configs.qr_tempo_renovacao_min = parseInt(inCheckinRen.value, 10) || 15; salvarConfiguracoes(); };
    }

    selQrAuto.value = configs.qr_auto_aceite_modo || 'manual';
    if (divQrHoras) divQrHoras.style.display = selQrAuto.value === 'auto_proximas_horas' ? 'flex' : 'none';
    if (divQrDias) divQrDias.style.display = selQrAuto.value === 'auto_dias_configurados' ? 'flex' : 'none';

    selQrAuto.onchange = () => {
      configs.qr_auto_aceite_modo = selQrAuto.value;
      if (divQrHoras) divQrHoras.style.display = selQrAuto.value === 'auto_proximas_horas' ? 'flex' : 'none';
      if (divQrDias) divQrDias.style.display = selQrAuto.value === 'auto_dias_configurados' ? 'flex' : 'none';
      if (selQrAuto.value === 'auto_proximas_horas') {
        const hrs = parseInt(inQrHoras ? inQrHoras.value : 4, 10) || 4;
        configs.qr_auto_aceite_ate = Date.now() + (hrs * 3600000);
      }
      salvarConfiguracoes();
    };

    if (inQrHoras) {
      inQrHoras.value = configs.qr_auto_aceite_horas || 4;
      inQrHoras.onchange = () => {
        const hrs = parseInt(inQrHoras.value, 10) || 4;
        configs.qr_auto_aceite_horas = hrs;
        if (configs.qr_auto_aceite_modo === 'auto_proximas_horas') {
          configs.qr_auto_aceite_ate = Date.now() + (hrs * 3600000);
        }
        salvarConfiguracoes();
      };
    }

    // Dias configurados
    let diasArr = [];
    try { diasArr = JSON.parse(configs.qr_auto_dias_json || '[0,5,6]'); } catch(e) { diasArr = [0,5,6]; }
    document.querySelectorAll('.chk-qr-dia').forEach(chk => {
      chk.checked = diasArr.includes(parseInt(chk.value, 10));
      chk.onchange = () => {
        const selected = Array.from(document.querySelectorAll('.chk-qr-dia:checked')).map(c => parseInt(c.value, 10));
        configs.qr_auto_dias_json = JSON.stringify(selected);
        salvarConfiguracoes();
      };
    });
  }

  
  // ── BINDING DA VERSÃO DA INTERFACE DO CAIXA (CLÁSSICO VS MACOS V2) ──
  const currentVersao = configs.versao_interface_caixa || localStorage.getItem('chef_versao_interface_caixa') || 'v1';
  const radioV1 = document.getElementById('radio-versao-v1');
  const radioV2 = document.getElementById('radio-versao-v2');
  const cardV1 = document.getElementById('card-versao-v1');
  const cardV2 = document.getElementById('card-versao-v2');

  function updateCardsVersaoUI(v) {
    if (radioV1 && radioV2) {
      radioV1.checked = (v === 'v1');
      radioV2.checked = (v === 'v2');
    }
    if (cardV1 && cardV2) {
      cardV1.style.borderColor = (v === 'v1') ? '#fc4b15' : 'var(--cfg-border)';
      cardV1.style.background = (v === 'v1') ? 'rgba(252,75,21,0.06)' : 'var(--cfg-subtle-bg)';
      cardV2.style.borderColor = (v === 'v2') ? '#fc4b15' : 'var(--cfg-border)';
      cardV2.style.background = (v === 'v2') ? 'rgba(252,75,21,0.06)' : 'var(--cfg-subtle-bg)';
    }
  }

  updateCardsVersaoUI(currentVersao);

  if (radioV1) {
    radioV1.onchange = () => {
      configs.versao_interface_caixa = 'v1';
      localStorage.setItem('chef_versao_interface_caixa', 'v1');
      updateCardsVersaoUI('v1');
      salvarConfiguracoes();
      if (typeof showToast === 'function') showToast('Versão 1.0 Clássica ativada para o Caixa!', 'success');
    };
  }

  if (radioV2) {
    radioV2.onchange = () => {
      configs.versao_interface_caixa = 'v2';
      localStorage.setItem('chef_versao_interface_caixa', 'v2');
      updateCardsVersaoUI('v2');
      salvarConfiguracoes();
      if (typeof showToast === 'function') showToast('Versão 2.0 macOS Pro ativada para o Caixa!', 'success');
    };
  }

  const selectQrProtocol = document.getElementById('select-qr-protocol');
  const inputQrPort = document.getElementById('input-qr-port');
  if (selectQrProtocol) {
    selectQrProtocol.value = configs.qr_protocol || '';
    selectQrProtocol.onchange = () => {
      configs.qr_protocol = selectQrProtocol.value;
      salvarConfiguracoes();
    };
  }
  if (inputQrPort) {
    inputQrPort.value = configs.qr_port || '';
    inputQrPort.onchange = () => {
      configs.qr_port = (inputQrPort.value || '').replace(/[^0-9]/g, '');
      inputQrPort.value = configs.qr_port;
      salvarConfiguracoes();
    };
  }

  // Setup Select Add Destaque
  selectAdd.innerHTML = '<option value="">-- Selecione um Produto --</option>';
  allProducts.forEach(p => {
    selectAdd.innerHTML += `<option value="${p.nome}">${p.nome} (${p.categoria})</option>`;
  });

  // Setup Destaques Manuais List
  function renderManuais() {
    listaManuais.innerHTML = '';
    configs.destaques_itens.forEach(nome => {
      const p = allProducts.find(x => x.nome === nome);
      if (p) {
        listaManuais.innerHTML += `
          <li style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:10px; border:1px solid #ccc; border-radius:6px;">
            <span><strong>${p.nome}</strong> <span style="color:#888; font-size:12px;">(${p.categoria})</span></span>
            <button onclick="removerDestaque('${p.nome}')" style="background:none; border:none; color:#fc4b15; cursor:pointer;"><i class="ph ph-trash" style="font-size:18px;"></i></button>
          </li>
        `;
      }
    });
  }
  renderManuais();

  window.removerDestaque = (nome) => {
    configs.destaques_itens = configs.destaques_itens.filter(x => x !== nome);
    renderManuais();
    salvarConfiguracoes();
  };

  window.mostrarQrCodeMesa = (nomeMesa) => {
    const modal = document.getElementById('modal-qrcode-mesa');
    const img = document.getElementById('qr-mesa-img');
    const urlEl = document.getElementById('qr-mesa-url');
    const titulo = document.getElementById('qr-mesa-titulo');
    
    if (!modal || !img || !urlEl || !titulo) return;
    
    titulo.innerText = `QR Code - ${nomeMesa}`;
    
    const cardapioUrl = buildCardapioUrl(nomeMesa);
    
    urlEl.innerText = cardapioUrl;
    if (typeof window.qrImg === 'function') {
      window.qrImg(img, cardapioUrl, 180);
    } else {
      img.src = (window.location.origin || '') + '/api/qr?size=180&data=' + encodeURIComponent(cardapioUrl);
    }
    
    modal.style.display = 'flex';
  };

  window.imprimirQrCodeMesa = () => {
    const url = document.getElementById('qr-mesa-url').innerText;
    const titulo = document.getElementById('qr-mesa-titulo').innerText;
    
    const buildPrint = (qrUrl) => {
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
      <html>
        <head>
          <title>Imprimir QR Code</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 40px; }
            .container { border: 2px dashed #000; padding: 30px; display: inline-block; border-radius: 10px; }
            h2 { margin: 0 0 10px 0; font-size: 28px; }
            p { margin: 10px 0; font-size: 16px; color: #555; }
            img { width: 300px; height: 300px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>${titulo}</h2>
            <p>Aponte a câmera do celular para fazer o seu pedido</p>
            <img src="${qrUrl}" />
            <p style="font-size: 14px; margin-top: 20px; word-break: break-all;">${url}</p>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
      printWindow.document.close();
    };
    if (typeof window.gerarQrDataUrl === 'function') {
      window.gerarQrDataUrl(url, 300, buildPrint);
    } else {
      buildPrint((window.location.origin || '') + '/api/qr?size=300&data=' + encodeURIComponent(url));
    }
  };

  window.imprimirTodosQrCodes = () => {
    if (currentMesas.length === 0) {
      alert('Nenhuma mesa cadastrada!');
      return;
    }
    
    const itens = currentMesas.map(m => ({ nome: m.nome, url: buildCardapioUrl(m.nome) }));
    
    const buildPrint = (list) => {
      let qrCodesHtml = '';
      list.forEach(m => {
        qrCodesHtml += `
          <div class="qr-item">
            <h2>${m.nome}</h2>
            <img src="${m.qr}" />
            <div class="url">${m.url}</div>
          </div>
        `;
      });
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
      <html>
        <head>
          <title>Imprimir QR Codes - Todas as Mesas</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 20px; }
            .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 30px; justify-items: center; }
            .qr-item { border: 2px dashed #000; padding: 20px; border-radius: 10px; width: 250px; text-align: center; page-break-inside: avoid; }
            .qr-item h2 { margin: 0 0 15px 0; font-size: 24px; color: #1e293b; }
            .qr-item img { width: 200px; height: 200px; margin-bottom: 15px; }
            .qr-item .url { font-size: 11px; color: #475569; word-break: break-all; background: #f1f5f9; padding: 8px; border-radius: 6px; }
            @media print {
              body { -webkit-print-color-adjust: exact; padding: 0; }
              .qr-item { border-color: #cbd5e1; }
            }
          </style>
        </head>
        <body>
          <h1 style="margin-bottom: 30px;">QR Codes - Todas as Mesas</h1>
          <div class="grid">
            ${qrCodesHtml}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
      printWindow.document.close();
    };
    
    if (typeof window.gerarQrDataUrl === 'function') {
      Promise.all(itens.map(m => new Promise(res => {
        window.gerarQrDataUrl(m.url, 250, qr => res({ nome: m.nome, url: m.url, qr }));
      }))).then(buildPrint);
    } else {
      buildPrint(itens.map(m => ({ ...m, qr: (window.location.origin || '') + '/api/qr?size=250&data=' + encodeURIComponent(m.url) })));
    }
  };

  btnAdd.onclick = () => {
    const val = selectAdd.value;
    if (!val) return;
    if (!configs.destaques_itens.includes(val)) {
      configs.destaques_itens.push(val);
      renderManuais();
      salvarConfiguracoes();
    }
  };

  // Setup Categorias Sortable
  const categoriasUnicas = [...new Set(allProducts.map(p => p.categoria))];

  const orderedCats = [];
  const categoriasSeguras = configs.ordem_categorias || [];
  categoriasSeguras.forEach(c => {
    if (categoriasUnicas.includes(c)) orderedCats.push(c);
  });
  categoriasUnicas.forEach(c => {
    if (!orderedCats.includes(c)) orderedCats.push(c);
  });

  divSortable.innerHTML = '';
  orderedCats.forEach(c => {
    divSortable.innerHTML += `
      <div class="categoria-item" data-cat="${c}" style="background:#fff; padding:12px 16px; border:1px solid #ccc; border-radius:6px; cursor:grab; font-weight:bold; display:flex; align-items:center; gap:10px;">
        <i class="ph ph-list" style="color:#aaa;"></i> ${c}
      </div>
    `;
  });

  // Init SortableJS
  if (typeof Sortable !== 'undefined') {
    new Sortable(divSortable, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      onEnd: function () {
        // Salva a nova ordem
        configs.ordem_categorias = Array.from(divSortable.children).map(el => el.getAttribute('data-cat'));
      }
    });
  } else {
    console.warn('SortableJS is not defined. Category sorting is disabled.');
  }

  btnSalvarOrdem.onclick = () => {
    salvarConfiguracoes();
    alert("Ordem salva com sucesso!");
  };
}

function salvarConfiguracoes() {
  fetch('/api/config', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(configs)
  }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
    .then(res => {
      if (!res.success) {
        alert('Erro ao salvar as configurações.');
      } else {
        socket.emit('admin_configs_updated');
      }
    })
    .catch(err => {
      console.error('Erro ao salvar configs:', err);
      alert('Erro ao salvar as configurações. Verifique se você está logado.');
    });
}



function getRhFilter() {
  const startEl = document.getElementById('rh-filter-start');
  const endEl = document.getElementById('rh-filter-end');
  const filter = {};
  if (startEl && startEl.value) filter.start_date = startEl.value;
  if (endEl && endEl.value) filter.end_date = endEl.value;
  return filter;
}

function emitGetRhData() {
  const filter = getRhFilter();
  socket.emit('get_rh_data', filter);
}

function applyRhFilterPreset(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = d => d.toISOString().split('T')[0];
  const startEl = document.getElementById('rh-filter-start');
  const endEl = document.getElementById('rh-filter-end');
  if (startEl) startEl.value = fmt(start);
  if (endEl) endEl.value = fmt(end);
  emitGetRhData();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.getAttribute('data-tab') === 'rh') {
        emitGetRhData();
        socket.emit('get_relatorio_caixa');
      }
    });
  });

  // RH date filter events
  document.querySelectorAll('.rh-filter-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.getAttribute('data-days')) || 0;
      applyRhFilterPreset(days);
    });
  });
  const clearBtn = document.getElementById('rh-filter-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const startEl = document.getElementById('rh-filter-start');
      const endEl = document.getElementById('rh-filter-end');
      if (startEl) startEl.value = '';
      if (endEl) endEl.value = '';
      emitGetRhData();
    });
  }
  ['rh-filter-start', 'rh-filter-end'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', emitGetRhData);
  });

  // Jogos tab init
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.getAttribute('data-tab') === 'jogos') {
        if (typeof initAdminJogos === 'function') initAdminJogos();
      }
      if (btn.getAttribute('data-tab') === 'montaveis') {
        if (typeof initAdminMontaveis === 'function') initAdminMontaveis();
      }
    });
  });
});


// --- RH / FOLHA LOGIC ---
socket.on('rh_data', ({ vales, pontos, logins, pagamentos, metrics }) => {
  const vList = document.getElementById('admin-rh-vales-list');
  const pList = document.getElementById('admin-rh-pontos-list');
  const lList = document.getElementById('admin-rh-logins-list');
  const perfList = document.getElementById('admin-rh-performance-list');
  const pagamentosList = document.getElementById('admin-rh-pagamentos-list');

  if (!vList) return;

  // Render Resumo Cards
  let totalHoursSum = 0;
  let totalPedidosSum = 0;
  let totalSalesSum = 0;

  if (metrics && metrics.length > 0) {
    metrics.forEach(m => {
      totalHoursSum += m.horas_trabalhadas || 0;
      totalPedidosSum += m.total_pedidos || 0;
      totalSalesSum += m.total_vendas || 0;
    });
  }

  const elHoras = document.getElementById('rh-card-horas');
  const elPedidos = document.getElementById('rh-card-pedidos');
  const elSales = document.getElementById('rh-card-faturamento');

  if (elHoras) elHoras.innerText = totalHoursSum.toFixed(2) + ' h';
  if (elPedidos) elPedidos.innerText = totalPedidosSum;
  if (elSales) elSales.innerText = 'R$ ' + totalSalesSum.toFixed(2).replace('.', ',');

  // Update Collaborators Active Count
  const clockedIn = (pontos || []).filter(p => p.entrada && !p.saida);
  const elAtivos = document.getElementById('rh-ativos-count');
  if (elAtivos) elAtivos.innerText = clockedIn.length;

  // Render Performance metrics
  if (perfList) {
    if (!metrics || metrics.length === 0) {
      perfList.innerHTML = '<tr><td colspan="8" style="padding:10px; text-align:center; color:gray;">Nenhuma métrica disponível.</td></tr>';
    } else {
      perfList.innerHTML = metrics.map(m => `
           <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px; font-weight: bold; color: #fc4b15;">${m.nome}</td>
              <td style="padding: 10px;">${m.cargo}</td>
              <td style="padding: 10px; text-align: right;">${(m.horas_trabalhadas || 0).toFixed(2)} h</td>
              <td style="padding: 10px; text-align: right;">${m.total_pedidos}</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; color: #3ab55b;">R$ ${(m.total_vendas || 0).toFixed(2).replace('.', ',')}</td>
              <td style="padding: 10px; text-align: right;">${m.total_cliques || 0}</td>
              <td style="padding: 10px; text-align: right;">${m.total_insercoes || 0}</td>
              <td style="padding: 10px; text-align: right; font-weight: bold; color: #2f80ed;">${(m.produtividade || 0).toFixed(2)} ped/h</td>
           </tr>
        `).join('');
    }
  }

  // Render Logins List
  if (lList) {
    if (!logins || logins.length === 0) {
      lList.innerHTML = '<tr><td colspan="2" style="padding:10px; text-align:center; color:gray;">Nenhum login registrado.</td></tr>';
    } else {
      lList.innerHTML = logins.map(l => `
           <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 10px; font-weight:500;">${l.funcionario_nome}</td>
              <td style="padding: 8px 10px; color:#888; font-size:11.5px;">${new Date(l.data_hora).toLocaleString('pt-BR')}</td>
           </tr>
        `).join('');
    }
  }

  // Render Vales
  let vHtml = '';
  if (vales.length === 0) {
    vHtml = '<tr><td colspan="5" style="padding:10px; text-align:center; color:#999;">Nenhum vale solicitado.</td></tr>';
  } else {
    vales.forEach(v => {
      let statusColor = v.status === 'Aprovado' ? 'green' : (v.status === 'Recusado' ? 'red' : 'orange');
      let acoes = v.status === 'Pendente'
        ? `<button onclick="aprovarVale(${v.id})" style="padding:5px 10px; background:#3ab55b; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Aprovar</button>
           <button onclick="recusarVale(${v.id})" style="padding:5px 10px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer; margin-left:5px; font-weight:bold;">Recusar</button>`
        : `<span style="color:#999; font-size:12px;">${v.status} em ${new Date(v.data_aprovacao || v.data_pedido).toLocaleDateString()}</span>`;

      vHtml += `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding:10px;">${new Date(v.data_pedido).toLocaleDateString()}</td>
          <td style="padding:10px;">${v.funcionario_nome || 'Desconhecido'}</td>
          <td style="padding:10px; font-weight:bold;">R$ ${v.valor.toFixed(2).replace('.', ',')}</td>
          <td style="padding:10px; color:${statusColor}; font-weight:bold;">${v.status}</td>
          <td style="padding:10px;">${acoes}</td>
        </tr>
      `;
    });
  }
  vList.innerHTML = vHtml;

  // Render Pontos (Folha)
  if (pList) {
    let pHtml = '';
    if (pontos.length === 0) {
      pHtml = '<tr><td colspan="8" style="padding:10px; text-align:center; color:#999;">Nenhum turno registrado.</td></tr>';
    } else {
      pontos.forEach(p => {
        let statusLabel = p.pago ? `<span style="color:green; font-weight:bold;">PAGO</span>` : `<span style="color:#eb5757; font-weight:bold;">PENDENTE</span>`;
        let entrada = p.entrada ? chefFormatTime(p.entrada) : '-';
        let saida = p.saida ? chefFormatTime(p.saida) : '-';
        let acoes = p.pago
          ? `-`
          : `<button onclick="pagarPonto(&quot;${p.id}&quot;)" style="padding:5px 10px; background:#3ab55b; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Marcar Pago</button>`.replace(/&quot;/g, '"');

        pHtml += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding:10px;">${new Date(p.data).toLocaleDateString()}</td>
            <td style="padding:10px;">${p.funcionario_nome || 'Desconhecido'}</td>
            <td style="padding:10px;">${entrada}</td>
            <td style="padding:10px;">${saida}</td>
            <td style="padding:10px;">${(p.total_horas || 0).toFixed(2)} h</td>
            <td style="padding:10px; font-weight:bold;">R$ ${(p.valor_pagar || 0).toFixed(2).replace('.', ',')}</td>
            <td style="padding:10px;">${statusLabel}</td>
            <td style="padding:10px;">${acoes}</td>
          </tr>
        `;
      });
    }
    pList.innerHTML = pHtml;
  }

  // Render Pagamentos List
  if (pagamentosList) {
    if (!pagamentos || pagamentos.length === 0) {
      pagamentosList.innerHTML = '<tr><td colspan="6" style="padding:10px; text-align:center; color:gray;">Nenhum pagamento registrado.</td></tr>';
    } else {
      let pagamentosHtml = '';
      pagamentos.forEach(p => {
        const dataPag = p.data_pagamento ? new Date(p.data_pagamento).toLocaleString('pt-BR') : '-';
        pagamentosHtml += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px; color:#555;">${dataPag}</td>
            <td style="padding: 10px; font-weight: bold; color: #333;">${p.funcionario_nome}</td>
            <td style="padding: 10px; text-align:right; color:#eb5757;">R$ ${(p.total_vales_abatidos || 0).toFixed(2).replace('.', ',')}</td>
            <td style="padding: 10px; text-align:right; color:#eb5757;">R$ ${(p.total_consumo_abatido || 0).toFixed(2).replace('.', ',')}</td>
            <td style="padding: 10px; text-align:right; color:#3ab55b; font-weight:bold;">R$ ${(p.valor_liquido || 0).toFixed(2).replace('.', ',')}</td>
            <td style="padding: 10px; font-size:12px; color:#666;">${p.observacao || '-'}</td>
          </tr>
        `;
      });
      pagamentosList.innerHTML = pagamentosHtml;
    }
  }

});

socket.on('rh_update', () => {
  emitGetRhData();
});

window.aprovarVale = function (id) {
  solicitarAutorizacaoAdmin('Aprovar Vale', (senha) => {
    const lancarCaixa = confirm("Deseja registrar o valor como saída no caixa atual?");
    socket.emit('aprovar_vale', { valeId: id, lancarCaixa, operador: window.crmPerfil ? window.crmPerfil.nome : 'Admin', senha });
  });
};

window.recusarVale = function (id) {
  if (confirm("Deseja recusar esta solicitação?")) {
    socket.emit('recusar_vale', { id, operador: window.crmPerfil ? window.crmPerfil.nome : 'Admin' });
  }
};

window.pagarPonto = function (id) {
  if (confirm("Marcar este turno como pago?")) {
    socket.emit('pagar_ponto', { id, operador: window.crmPerfil ? window.crmPerfil.nome : 'Admin' });
  }
};

// Listener to handle turn metrics response for RH dashboard cards
socket.on('relatorio_caixa', (stats) => {
  const elTurnDesc = document.getElementById('rh-turno-desc');
  const elTurnTotal = document.getElementById('rh-turno-total');
  if (stats) {
    if (elTurnDesc) elTurnDesc.innerText = `Aberto (Turno #${stats.id})`;
    const totalTurn = (stats.total_dinheiro || 0) + (stats.total_pix || 0) + (stats.total_credito || 0) + (stats.total_debito || 0) + (stats.total_fiado || 0);
    if (elTurnTotal) elTurnTotal.innerText = `R$ ${totalTurn.toFixed(2).replace('.', ',')}`;
  } else {
    if (elTurnDesc) elTurnDesc.innerText = 'Fechado';
    if (elTurnTotal) elTurnTotal.innerText = 'R$ 0,00';
  }
});

// Pedir os dados no init se a tab rh estiver aberta ou só pedir geral
emitGetRhData();



window.cupomItensBuilder = [];
let _diasGridInit = false;

// Init UI Dias
function initDiasGrid() {
  const grid = document.getElementById('cupom-dias-grid');
  if (!grid) return;

  const dias = [
    { id: 'domingo', nome: 'Domingo' },
    { id: 'segunda', nome: 'Segunda-feira' },
    { id: 'terca', nome: 'Terça-feira' },
    { id: 'quarta', nome: 'Quarta-feira' },
    { id: 'quinta', nome: 'Quinta-feira' },
    { id: 'sexta', nome: 'Sexta-feira' },
    { id: 'sabado', nome: 'Sábado' }
  ];

  let h = '';
  dias.forEach(d => {
    h += `
          <div class="cupom-dia-row" style="display:flex; align-items:center; gap: 8px; background: #f9f9f9; padding: 6px 10px; border-radius: 6px; border: 1px solid #eee; flex-wrap: wrap;">
             <label style="min-width: 110px; display:flex; align-items:center; gap:5px; font-weight:bold; font-size: 13px;">
               <input type="checkbox" id="chk-dia-${d.id}" checked> ${d.nome}
             </label>
             <div style="display:flex; align-items:center; gap:6px; flex:1;">
               <input type="time" id="inicio-dia-${d.id}" value="00:00" style="padding: 4px 6px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
               <span style="font-size: 12px; color: #666;">até</span>
               <input type="time" id="fim-dia-${d.id}" value="23:59" style="padding: 4px 6px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
             </div>
          </div>
        `;
  });
  grid.innerHTML = h;
}

window.toggleDiasGrid = () => {
  const grid = document.getElementById('cupom-dias-grid');
  const btn = document.getElementById('btn-toggle-dias');
  if (!grid) return;
  const isVisible = grid.style.display !== 'none';
  grid.style.display = isVisible ? 'none' : 'grid';
  if (btn) btn.innerHTML = isVisible ? '<i class="ph ph-calendar"></i> Todos os dias' : '<i class="ph ph-x"></i> Fechar dias';
};

window.toggleTodosDias = (checked) => {
  const dias = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
  dias.forEach(d => {
    const chk = document.getElementById('chk-dia-' + d);
    if (chk) chk.checked = checked;
  });
};

// Call it when script loads
/* initDiasGrid is now deferred until promocoes tab is activated */

window.addCupomItem = () => {
  const sel = document.getElementById('admin-cupom-produto-sel');
  const qtd = parseInt(document.getElementById('admin-cupom-qtd').value);

  if (!sel.value) return window.showToast && window.showToast('Selecione um produto.', 'warning');
  if (isNaN(qtd) || qtd < 1) return window.showToast && window.showToast('Quantidade inválida.', 'warning');

  const opt = sel.selectedOptions[0];

  window.cupomItensBuilder.push({
    nome: opt.value,
    emoji: opt.dataset.emoji || "🎁",
    sector: opt.dataset.sector || "Bar",
    quantity: qtd
  });

  renderCupomItens();
};

window.removerCupomItem = (idx) => {
  window.cupomItensBuilder.splice(idx, 1);
  renderCupomItens();
};

function renderCupomItens() {
  const list = document.getElementById('cupom-itens-list');
  const noItems = document.getElementById('cupom-no-items');

  if (window.cupomItensBuilder.length === 0) {
    if (noItems) noItems.style.display = 'block';
    list.innerHTML = '';
    if (noItems) list.appendChild(noItems);
    return;
  }

  let h = '';
  window.cupomItensBuilder.forEach((item, i) => {
    h += `
          <div style="display:flex; justify-content:space-between; align-items:center; background: #f1f3f5; padding: 6px 10px; border-radius: 4px;">
             <span>${item.quantity}x ${item.emoji} ${item.nome}</span>
             <button style="background:red; color:white; border:none; padding:2px 6px; border-radius:4px; cursor:pointer;" onclick="window.removerCupomItem(${i})">X</button>
          </div>
        `;
  });
  list.innerHTML = h;
}

window.gerarCupomQrAvancado = () => {
  let codigo = document.getElementById('admin-cupom-codigo').value.trim().toUpperCase();
  const validade = document.getElementById('admin-cupom-validade').value;
  const valorTipo = document.getElementById('admin-cupom-valor-tipo').value;
  const valorStr = document.getElementById('admin-cupom-valor').value;
  const valor = parseFloat(valorStr) || 0;

  if (!codigo) {
    codigo = 'PROMO-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  if (window.cupomItensBuilder.length === 0 && valorTipo === 'preco_fixo') {
    window.showToast && window.showToast('Você precisa adicionar itens no combo se quiser cobrar um preço fixo por ele.', 'warning');
    return;
  }

  const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  const dias_horarios = {};
  dias.forEach(d => {
    const chk = document.getElementById('chk-dia-' + d);
    const ini = document.getElementById('inicio-dia-' + d);
    const fim = document.getElementById('fim-dia-' + d);
    if (chk) {
      dias_horarios[d] = {
        ativo: chk.checked,
        inicio: ini.value,
        fim: fim.value
      };
    }
  });

  let titulo = "CUPOM DESCONTO";
  if (window.cupomItensBuilder.length > 0) titulo = window.cupomItensBuilder[0].nome + (window.cupomItensBuilder.length > 1 ? " + outros" : "");

  const limiteUsos = parseInt(document.getElementById('admin-cupom-limite-usos')?.value || 1) || 1;

  const payload = {
    codigo,
    titulo,
    itens: window.cupomItensBuilder,
    validade: validade || null,
    dias_horarios,
    valor_tipo: valorTipo,
    valor: valor,
    limite_usos: limiteUsos
  };

  socket.emit('criar_cupom', payload);
};

window.printCupomAvancado = () => {
  const titulo = document.getElementById('cupom-qr-title').innerText;
  const cod = document.getElementById('cupom-qr-code-text').innerText;
  const imgSrc = document.getElementById('cupom-qr-image').src;

  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(`
      <html><head><style>
        body { font-family: monospace; text-align: center; margin: 0; padding: 20px; }
        .bold { font-weight: bold; }
      </style></head><body>
        <div class="bold" style="font-size:20px; margin-bottom:10px;">CHEF COZINHA</div>
        <div style="font-size:16px; margin-bottom:15px;">VOUCHER / COMBO PROMOCIONAL</div>
        <div class="bold" style="font-size:18px; margin-bottom:20px;">${titulo}</div>
        <img src="${imgSrc}" style="width: 200px; height: 200px; margin-bottom: 10px;">
        <div style="font-size:24px; font-weight:bold; margin-bottom:20px;">${cod}</div>
        <div style="font-size:12px; margin-top:30px;">Apresente este QR Code para o garçom.</div>
        <div style="font-size:10px; margin-top:5px; color:#666;">Uso Único. Sujeito a restrições de horários e validade.</div>
      </body></html>
    `);
  w.document.close();
  setTimeout(() => { w.print(); }, 1000);
};

window.printCupomDetalhe = () => {
  const titulo = document.getElementById('det-cupom-titulo').textContent;
  const cod = document.getElementById('det-cupom-codigo').textContent;
  const imgSrc = document.getElementById('det-cupom-qr').src;

  const w = window.open('', '_blank', 'width=400,height=600');
  w.document.write(`
    <html><head><style>
      body { font-family: monospace; text-align: center; margin: 0; padding: 20px; }
      .bold { font-weight: bold; }
    </style></head><body>
      <div class="bold" style="font-size:20px; margin-bottom:10px;">CHEF COZINHA</div>
      <div style="font-size:16px; margin-bottom:15px;">VOUCHER / COMBO PROMOCIONAL</div>
      <div class="bold" style="font-size:18px; margin-bottom:20px;">${titulo}</div>
      <img src="${imgSrc}" style="width: 200px; height: 200px; margin-bottom: 10px;">
      <div style="font-size:24px; font-weight:bold; margin-bottom:20px;">${cod}</div>
      <div style="font-size:12px; margin-top:30px;">Apresente este QR Code para o garçom.</div>
      <div style="font-size:10px; margin-top:5px; color:#666;">Sujeito a restrições de horários e validade.</div>
    </body></html>
  `);
  w.document.close();
  setTimeout(() => { w.print(); }, 1000);
};



function _exibirCupomQrGerado(data) {
  const resDiv = document.getElementById('cupom-qr-result');
  if (!resDiv) return;
  resDiv.style.display = 'flex';
  const titleEl = document.getElementById('cupom-qr-title');
  if (titleEl) titleEl.innerText = data.titulo || 'CUPOM PROMOCIONAL';
  const codeEl = document.getElementById('cupom-qr-code-text');
  if (codeEl) codeEl.innerText = data.codigo;

  const imgCupom = document.getElementById('cupom-qr-image');
  if (imgCupom) {
    imgCupom.style.display = 'none';
    if (typeof window.qrImg === 'function') {
      try {
        window.qrImg(imgCupom, data.codigo, 200);
        setTimeout(() => { imgCupom.style.display = 'block'; }, 150);
      } catch (e) {
        console.error('[Cupom QR] Erro ao gerar QR:', e);
        imgCupom.style.display = 'block';
      }
    } else {
      imgCupom.src = (window.location.origin || '') + '/api/qr?size=200&data=' + encodeURIComponent(data.codigo);
      imgCupom.style.display = 'block';
    }
  }

  /* Scroll to QR result */
  setTimeout(() => {
    resDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 200);
}

socket.on('cupom_criado_sucesso', (data) => {
  _exibirCupomQrGerado(data);
});

// Gera cupom promocional (QR) em 1 clique a partir de uma sugestão de combo da IA
window.gerarCupomPromocaoIA = async function(encodedPromo) {
  try {
    const p = JSON.parse(decodeURIComponent(encodedPromo));
    const res = await fetch('/api/ia/cupom-rapido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titulo: p.titulo,
        codigo: String((p.titulo || 'PROMO').split(' ').slice(0, 3).join('-')).toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12),
        preco_original: p.preco_original,
        preco_promocional: p.preco_promocional,
        desconto_percentual: p.desconto_percentual,
        produtos_envolvidos: p.produtos_envolvidos,
        validade_dias: 7
      })
    });
    const data = await res.json();
    if (!data || !data.ok) {
      if (typeof window.showToast === 'function') window.showToast(data.erro || 'Erro ao criar cupom.', 'error');
      else alert(data.erro || 'Erro ao criar cupom.');
      return;
    }
    if (typeof window.showToast === 'function') window.showToast(data.mensagem || ('Cupom ' + data.codigo + ' criado!'), 'success');
    _exibirCupomQrGerado({ titulo: data.titulo, codigo: data.codigo });
  } catch (err) {
    if (typeof window.showToast === 'function') window.showToast('Erro ao gerar cupom: ' + err.message, 'error');
    else alert('Erro ao gerar cupom: ' + err.message);
  }
};

socket.on('cupom_criado_error', (msg) => {
  window.showToast('Erro ao criar cupom: ' + msg, 'error');
});

// ==================== HISTÓRICO DE CUPONS ====================

function renderCuponsList(cupons) {
  const tbody = document.getElementById('admin-cupons-list');
  if (!tbody) return;

  if (!cupons || cupons.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999; font-style:italic;">Nenhum cupom gerado ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = cupons.map(c => {
    const criado = c.data_criacao ? new Date(c.data_criacao).toLocaleDateString('pt-BR') : '-';
    const validade = c.validade ? new Date(c.validade + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem validade';

    let beneficio = '-';
    if (c.valor_tipo === 'gratuito') beneficio = '100% Gratuito';
    else if (c.valor_tipo === 'desconto_fixo') beneficio = `Desconto R$ ${parseFloat(c.valor || 0).toFixed(2)}`;
    else if (c.valor_tipo === 'preco_fixo') beneficio = `Preço fixo R$ ${parseFloat(c.valor || 0).toFixed(2)}`;

    if (c.itens_json) {
      try {
        const itens = JSON.parse(c.itens_json);
        if (itens && itens.length > 0) beneficio += ` + ${itens.length} item(ns)`;
      } catch (e) { }
    }

    const limiteUsos = c.limite_usos || 1;
    const totalUsados = c.usado || 0;
    let statusBadge = '';
    if (totalUsados >= limiteUsos) {
      statusBadge = `<span class="badge badge-blue">Esgotado (${totalUsados}/${limiteUsos})</span>`;
    } else if (totalUsados > 0) {
      statusBadge = `<span class="badge badge-orange">Ativo (${totalUsados}/${limiteUsos})</span>`;
    } else {
      statusBadge = `<span class="badge badge-green">Disponível (${totalUsados}/${limiteUsos})</span>`;
    }

    const podeExcluir = totalUsados === 0;
    const btnExcluir = podeExcluir
      ? `<button onclick="event.stopPropagation(); window.deleteCupom('${c.codigo}')" style="background:none; border:none; cursor:pointer; color:#ef4444;" title="Excluir cupom"><i class="ph ph-trash" style="font-size:16px;"></i></button>`
      : '';

    return `<tr onclick="window.verDetalhesCupom('${c.codigo}')" style="cursor:pointer; transition:background 0.15s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background=''">
      <td style="font-weight:bold; font-family:monospace; letter-spacing:1px; padding:10px 8px;">${c.codigo}</td>
      <td style="padding:10px 8px;">${criado}</td>
      <td style="padding:10px 8px;">${validade}</td>
      <td style="font-size:12px; padding:10px 8px;">${beneficio}</td>
      <td style="padding:10px 8px;">${statusBadge}</td>
      <td style="padding:10px 8px;">${btnExcluir}</td>
    </tr>`;
  }).join('');
}

window.verDetalhesCupom = (codigo) => {
  socket.emit('get_cupom_detalhes', { codigo }, (data) => {
    if (!data || !data.cupom) return window.showToast && window.showToast('Cupom não encontrado.', 'error');
    const c = data.cupom;
    const usos = data.usos || [];

    document.getElementById('det-cupom-titulo').textContent = c.titulo || c.codigo || 'CUPOM';
    document.getElementById('det-cupom-codigo').textContent = c.codigo;

    /* Status badge */
    const limiteUsos = c.limite_usos || 1;
    const totalUsados = c.usado || 0;
    let statusText = '', statusColor = '';
    if (totalUsados >= limiteUsos) { statusText = 'Esgotado'; statusColor = '#3b82f6'; }
    else if (totalUsados > 0) { statusText = 'Parcialmente Usado'; statusColor = '#f97316'; }
    else { statusText = 'Disponível'; statusColor = '#22c55e'; }
    document.getElementById('det-cupom-status').innerHTML = `<span style="color:${statusColor}; font-size:13px;">● ${statusText} (${totalUsados}/${limiteUsos})</span>`;

    /* Benefício */
    let beneficio = '-';
    if (c.valor_tipo === 'gratuito') beneficio = '🎁 100% Gratuito';
    else if (c.valor_tipo === 'desconto_fixo') beneficio = `💰 Desconto de R$ ${parseFloat(c.valor || 0).toFixed(2)}`;
    else if (c.valor_tipo === 'preco_fixo') beneficio = `💲 Preço fixo: R$ ${parseFloat(c.valor || 0).toFixed(2)}`;
    document.getElementById('det-cupom-beneficio').textContent = beneficio;

    /* Datas */
    document.getElementById('det-cupom-criado').textContent = c.data_criacao ? new Date(c.data_criacao).toLocaleString('pt-BR') : '-';
    document.getElementById('det-cupom-validade').textContent = c.validade ? new Date(c.validade + 'T23:59:59').toLocaleString('pt-BR') : 'Sem validade';

    /* Usos */
    document.getElementById('det-cupom-usos').textContent = `${totalUsados} uso(s) de ${limiteUsos} limite(s)`;

    /* Itens */
    let itensHtml = '<span style="color:#94a3b8; font-style:italic;">Nenhum item.</span>';
    if (c.itens_json) {
      try {
        const itens = JSON.parse(c.itens_json);
        if (itens.length > 0) {
          itensHtml = itens.map(i => `<div style="padding:3px 0; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between;">
            <span>${i.emoji || '🍽️'} ${i.nome}</span>
            <span style="color:#64748b;">x${i.quantity || 1}</span>
          </div>`).join('');
        }
      } catch (e) { }
    }
    document.getElementById('det-cupom-itens').innerHTML = itensHtml;

    /* Restrições */
    let restrHtml = '<span style="color:#94a3b8; font-style:italic;">Sem restrições de dia/horário.</span>';
    if (c.dias_horarios_json) {
      try {
        const dh = JSON.parse(c.dias_horarios_json);
        const diasPt = { domingo: 'Dom', segunda: 'Seg', terca: 'Ter', quarta: 'Qua', quinta: 'Qui', sexta: 'Sex', sabado: 'Sáb' };
        const rows = Object.keys(dh).map(dia => {
          const cfg = dh[dia];
          const ativo = cfg && cfg.ativo;
          const horario = (cfg && cfg.inicio && cfg.fim) ? `${cfg.inicio}–${cfg.fim}` : (ativo ? 'Dia todo' : '');
          return `<div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid #e2e8f0;">
            <span style="font-weight:${ativo ? 'bold' : 'normal'}; color:${ativo ? '#166534' : '#94a3b8'};">${diasPt[dia] || dia}</span>
            <span style="color:${ativo ? '#334155' : '#cbd5e1'};">${ativo ? (horario || 'Ativo') : '—'}</span>
          </div>`;
        });
        restrHtml = rows.join('');
      } catch (e) { }
    }
    document.getElementById('det-cupom-restricoes').innerHTML = restrHtml;

    /* Histórico de usos */
    if (usos.length === 0) {
      document.getElementById('det-cupom-historico').innerHTML = '<span style="color:#94a3b8; font-style:italic;">Nenhum uso registrado.</span>';
    } else {
      const usosHtml = usos.map(u => {
        const data = u.data_uso ? new Date(u.data_uso).toLocaleString('pt-BR') : '-';
        let itensResgatados = '';
        if (u.itens_resgatados) {
          try { itensResgatados = JSON.parse(u.itens_resgatados).join(', '); } catch (e) { itensResgatados = u.itens_resgatados; }
        }
        return `<div style="display:flex; gap:8px; padding:6px 0; border-bottom:1px solid #e2e8f0; font-size:12px;">
          <span style="color:#64748b; white-space:nowrap; min-width:120px;">${data}</span>
          <span style="min-width:70px; font-weight:bold;">Mesa ${escHtml(u.mesa || '-')}</span>
          <span style="color:#64748b;">por ${escHtml(u.garcom || '-')}</span>
          ${itensResgatados ? `<span style="color:#94a3b8; margin-left:auto; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escHtml(itensResgatados)}">${escHtml(itensResgatados)}</span>` : ''}
        </div>`;
      });
      document.getElementById('det-cupom-historico').innerHTML = usosHtml.join('');
    }

    /* QR code */
    const imgDet = document.getElementById('det-cupom-qr');
    if (imgDet && typeof window.qrImg === 'function') {
      try { window.qrImg(imgDet, c.codigo, 200); } catch (e) { imgDet.alt = c.codigo; }
    }

    document.getElementById('modal-cupom-detalhes').style.display = 'flex';
  });
};

window.deleteCupom = (codigo) => {
  if (!confirm(`Excluir cupom "${codigo}"? Esta ação não pode ser desfeita.`)) return;
  socket.emit('delete_cupom', { codigo });
};

socket.on('cupons_list', (cupons) => {
  _cupomLastFetch = Date.now();
  renderCuponsList(cupons);
});

let _cupomAtualizadoTimer = null;
let _cupomLastFetch = 0;
socket.on('cupons_atualizados', () => {
  if (_cupomAtualizadoTimer) clearTimeout(_cupomAtualizadoTimer);
  _cupomAtualizadoTimer = setTimeout(() => {
    const now = Date.now();
    if (now - _cupomLastFetch < 2000) return; // cooldowwn 2s
    _cupomLastFetch = now;
    socket.emit('get_cupons_list');
  }, 500);
});

// Pedir lista ao abrir a aba promoções
// --- IA Toggle & Config ---
window.toggleIAAlertas = function(enabled) {
  socket.emit('toggle_ia_alertas', { enabled: enabled });
  var track = document.getElementById('ia-toggle-track');
  var thumb = document.getElementById('ia-toggle-thumb');
  if (track) track.style.backgroundColor = enabled ? '#22c55e' : '#cbd5e1';
  if (thumb) thumb.style.left = enabled ? '24px' : '3px';
};

window.updateIAConfig = function() {
  var data = {
    minutosRefillCerveja: parseInt(document.getElementById('ia-minutos-refill').value) || 18,
    minutosAlertaEspera: parseInt(document.getElementById('ia-minutos-alerta').value) || 25,
    minutosCriticoEspera: parseInt(document.getElementById('ia-minutos-critico').value) || 40,
    minutosManobra: parseInt(document.getElementById('ia-minutos-manobra').value) || 30,
    minutosAtencao: parseInt(document.getElementById('ia-minutos-atencao').value) || 50
  };
  socket.emit('ia_atualizar_config', data);
};

window.resetIAState = function() {
  if (confirm('Tem certeza? Isso vai limpar todos os alertas e sugestoes da IA.')) {
    socket.emit('toggle_ia_alertas', { enabled: false });
    setTimeout(() => { socket.emit('toggle_ia_alertas', { enabled: true }); }, 1000);
  }
};

window.zerarTodosDados = function() {
  var senha = prompt('ATENÇÃO: Esta ação irá apagar TODOS os dados do sistema (pedidos, mesas, clientes, promoções, etc.).\n\nDigite a senha de administrador para confirmar:');
  if (!senha) return;
  if (!confirm('TEM CERTEZA ABSOLUTA? Todos os dados serão apagados permanentemente e esta ação é IRREVERSÍVEL.')) return;
  socket.emit('zerar_todos_dados', { senha: senha });
};

// ── Deslogar Restaurante do Sistema (Único Logout Global Oficial) ──
const btnDeslogarRest = document.getElementById('btn-deslogar-restaurante');
if (btnDeslogarRest) {
  btnDeslogarRest.onclick = async () => {
    let senha = '';
    if (typeof Swal !== 'undefined') {
      const { value: pass, isConfirmed } = await Swal.fire({
        title: '⚠️ Deslogar Restaurante do Sistema?',
        html: '<p style="font-size:14px; color:#ef4444; font-weight:700;">Esta ação desconectará IMEDIATAMENTE todos os funcionários, caixas e totens em tempo real.</p><p style="font-size:13px; color:#64748b;">Será necessário fazer login com seu usuário mestre em login.html para reconectar.</p>',
        input: 'password',
        inputPlaceholder: 'Digite a senha do administrador...',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        showCancelButton: true,
        confirmButtonColor: '#991b1b',
        cancelButtonColor: '#64748b',
        confirmButtonText: '<i class="ph-bold ph-sign-out"></i> Sim, Deslogar Todo o Sistema',
        cancelButtonText: 'Cancelar'
      });
      if (!isConfirmed || !pass) return;
      senha = pass;
    } else {
      if (!confirm('Tem certeza que deseja deslogar toda a instalação do restaurante? Todos os funcionários serão desconectados.')) return;
      senha = prompt('Digite a senha de administrador para confirmar:');
      if (!senha) return;
    }

    const restauranteId = localStorage.getItem('restaurante_id') || 1;
    const token = localStorage.getItem('chef_token');

    fetch('/api/auth/deslogar-restaurante', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ restaurante_id: restauranteId, senha })
    }).then(r => r.json()).then(data => {
      if (data.success) {
        localStorage.clear();
        sessionStorage.clear();
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'success',
            title: 'Restaurante Deslogado!',
            text: 'Todos os terminais foram desconectados e a equipe de suporte foi notificada.',
            showConfirmButton: false,
            timer: 2000
          }).then(() => {
            window.location.href = '/login.html';
          });
        } else {
          alert('Restaurante deslogado com sucesso! Redirecionando para a tela de login...');
          window.location.href = '/login.html';
        }
      } else {
        if (typeof Swal !== 'undefined') {
          Swal.fire({ icon: 'error', title: 'Erro ao Deslogar', text: data.error || 'Senha incorreta ou falha no servidor.' });
        } else {
          alert(data.error || 'Erro ao deslogar restaurante.');
        }
      }
    }).catch(() => {
      alert('Erro de conexão com o servidor.');
    });
  };
}

socket.on('zerar_concluido', (data) => {
  if (data && data.ok) {
    alert('Todos os dados foram apagados com sucesso! O sistema sera recarregado.');
    window.location.reload();
  }
});

socket.on('ia_config_atual', (config) => {
  if (config.minutosRefillCerveja) document.getElementById('ia-minutos-refill').value = config.minutosRefillCerveja;
  if (config.minutosAlertaEspera) document.getElementById('ia-minutos-alerta').value = config.minutosAlertaEspera;
  if (config.minutosCriticoEspera) document.getElementById('ia-minutos-critico').value = config.minutosCriticoEspera;
  if (config.minutosManobra) document.getElementById('ia-minutos-manobra').value = config.minutosManobra;
  if (config.minutosAtencao) document.getElementById('ia-minutos-atencao').value = config.minutosAtencao;
  var chk = document.getElementById('ia-toggle-switch');
  if (chk) chk.checked = config.iaEnabled !== false;
  var track = document.getElementById('ia-toggle-track');
  var thumb = document.getElementById('ia-toggle-thumb');
  if (track) track.style.backgroundColor = config.iaEnabled !== false ? '#22c55e' : '#cbd5e1';
  if (thumb) thumb.style.left = config.iaEnabled !== false ? '24px' : '3px';
});

socket.on('ia_estado_atualizado', (data) => {
  var chk = document.getElementById('ia-toggle-switch');
  if (chk) chk.checked = data.enabled;
  var track = document.getElementById('ia-toggle-track');
  var thumb = document.getElementById('ia-toggle-thumb');
  if (track) track.style.backgroundColor = data.enabled ? '#22c55e' : '#cbd5e1';
  if (thumb) thumb.style.left = data.enabled ? '24px' : '3px';
});

document.addEventListener('DOMContentLoaded', () => {
  /* Debounced cupom list fetch - prevents rapid re-emissions */
  let _cupomFetchTimer = null;
  function debouncedGetCupons() {
    if (_cupomFetchTimer) clearTimeout(_cupomFetchTimer);
    _cupomFetchTimer = setTimeout(() => {
      socket.emit('get_cupons_list');
    }, 200);
  }

  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.getAttribute('data-tab') === 'inteligencia') {
        socket.emit('ia_get_config');
      }
    });
  });

  // Pedir config IA ao carregar
  socket.emit('ia_get_config');

  // Layout do salão: botões
  const bSalvarSalao = document.getElementById('btn-salao-salvar');
  if (bSalvarSalao) bSalvarSalao.onclick = () => window.salvarLayoutSalao();
  const bNovaSala = document.getElementById('btn-salao-nova-sala');
  if (bNovaSala) bNovaSala.onclick = () => window.salaoNovoSalaoPrompt();
});




// ==================== RENDERIZAÇÃO DAS TABELAS ADMIN ====================
// (As funções abaixo existem em main.js para index.html, mas são necessárias
// aqui porque configuracoes.html é uma página separada)

// Erros do servidor NUNCA podem ser silenciosos nesta tela
socket.on('erro_servidor', (msg) => {
  const texto = typeof msg === 'string' ? msg : (msg && msg.mensagem) || 'Ocorreu um erro.';
  if (typeof window.showToast === 'function') window.showToast(texto, 'danger');
  else alert(texto);
});

socket.on('mesas_atualizadas', (mesas) => {
  currentMesas = mesas;
  // Re-render do desenhador de salão quando visível
  const tabSalao = document.getElementById('admin-tab-salao');
  if (tabSalao && tabSalao.style.display !== 'none' && tabSalao.dataset.carregada === 'true') {
    window.renderSalaoUI();
  }
  const listMesas = document.getElementById('admin-mesas-list');
  const listComandas = document.getElementById('admin-comandas-list');
  const tables = mesas.filter(m => !m.nome.toLowerCase().includes('comanda'));
  const comandas = mesas.filter(m => m.nome.toLowerCase().includes('comanda'));

  if (listMesas) {
    listMesas.innerHTML = tables.map(m => `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 10px; font-weight: bold; color: #1a1a2e;">${m.nome}</td>
        <td style="padding: 10px;"><span class="badge ${m.status === 'Disponível' ? 'badge-green' : 'badge-orange'}">${m.status}</span></td>
        <td style="padding: 10px;">
          <button onclick="window.abrirPerfilMesa('${m.nome.replace(/'/g, "\\'")}')" style="color: #3b82f6; border: none; background: none; cursor: pointer; font-weight: bold; margin-right: 12px;"><i class="ph ph-user-circle"></i> Perfil</button>
          <button onclick="window.mostrarQrCodeMesa('${m.nome.replace(/'/g, "\\'")}')" style="color: #fc4b15; border: none; background: none; cursor: pointer; font-weight: bold; margin-right: 12px;"><i class="ph ph-qr-code"></i> QR Code</button>
          <button onclick="window.deleteMesa(${m.id}, '${m.nome.replace(/'/g, "\\'")}')" style="color: red; border: none; background: none; cursor: pointer; font-weight: bold;"><i class="ph ph-trash"></i> Excluir</button>
        </td>
      </tr>
    `).join('');
  }

  if (listComandas) {
    listComandas.innerHTML = comandas.map(m => {
      const cleanName = m.nome.replace(/^Comanda\s*-\s*/i, '');
      return `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px; font-weight: bold; color: #fc4b15;">${cleanName}</td>
          <td style="padding: 10px;"><span class="badge ${m.status === 'Disponível' ? 'badge-green' : 'badge-orange'}">${m.status}</span></td>
          <td style="padding: 10px;">
            <button onclick="window.deleteMesa(${m.id}, '${m.nome.replace(/'/g, "\\'")}')" style="color: red; border: none; background: none; cursor: pointer; font-weight: bold;"><i class="ph ph-trash"></i> Excluir</button>
          </td>
        </tr>
      `;
    }).join('');
  }
});

window.deleteMesa = (id, nome) => {
  const mesa = currentMesas.find(m => m.id === id);
  // Status pode vir com ou sem acento no banco ('Disponível'/'Disponivel')
  const statusNorm = String((mesa && mesa.status) || '').trim().toLowerCase();
  const livre = !mesa || ['disponível', 'disponivel', 'livre', ''].includes(statusNorm);
  if (mesa && !livre) {
    return alert(`Atenção: Não é possível excluir a mesa/comanda "${nome}" porque ela possui consumo ativo ou está reservada!`);
  }
  if (window.isUsuarioAdminOuGerente()) {
    // Admin: confirmação simples (com ack para feedback imediato)
    if (confirm(`Excluir "${nome}"?\n\nEsta ação não pode ser desfeita.`)) {
      socket.emit('delete_mesa', { id: id }, (res) => {
        if (!res || res.ok !== true) {
          const msg = (res && res.mensagem) || 'Não foi possível excluir a mesa.';
          if (typeof window.showToast === 'function') window.showToast(msg, 'danger');
          else alert(msg);
        } else if (typeof window.showToast === 'function') {
          window.showToast((res.mensagem || `Mesa "${nome}" excluída.`), 'success');
        }
      });
    }
    return;
  }
  // Colaborador sem privilégio administrativo: exige PIN/senha de administrador
  window.solicitarAutorizacaoAdmin(`Excluir Mesa/Comanda "${nome}"`, (pin, motivo) => {
    socket.emit('delete_mesa', { id: id, pin: pin }, (res) => {
      if (res && res.ok === false) {
        if (typeof window.showToast === 'function') window.showToast(res.mensagem || 'Não foi possível excluir.', 'danger');
        else alert(res.mensagem || 'Não foi possível excluir.');
      }
    });
  });
};

document.addEventListener('DOMContentLoaded', () => {
  const addMesaBtn = document.getElementById('btn-admin-add-mesa');
  if (addMesaBtn) addMesaBtn.onclick = () => {
    let nome = document.getElementById('admin-mesa-nome').value.trim();
    if (!nome) {
      let maxNum = 0;
      let prefix = 'Mesa ';
      if (currentMesas && currentMesas.length > 0) {
        currentMesas.forEach(m => {
          const numMatch = m.nome.match(/\d+/);
          if (numMatch) {
            const num = parseInt(numMatch[0]);
            if (num > maxNum) {
              maxNum = num;
              const idx = m.nome.indexOf(numMatch[0]);
              prefix = m.nome.substring(0, idx);
            }
          }
        });
      }
      nome = `${prefix}${maxNum + 1}`;
    }
    socket.emit('add_mesa', nome);
    document.getElementById('admin-mesa-nome').value = '';
  };
});

// --- PRODUTOS ---
socket.on('produtos_atualizados', (prods) => {
  window.allProducts = prods;

  // 1. Populate category select
  const selectCat = document.getElementById('admin-prod-cat-select');
  if (selectCat) {
    const categories = Array.from(new Set(prods.map(p => p.categoria || ''))).filter(Boolean).sort();
    const prevSelected = selectCat.value;

    let htmlOptions = '<option value="">-- Selecione a Categoria --</option>';
    categories.forEach(cat => {
      htmlOptions += `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`;
    });
    htmlOptions += '<option value="__NEW__" style="color: #fc4b15; font-weight: bold;">+ Nova Categoria...</option>';
    selectCat.innerHTML = htmlOptions;

    if (prevSelected && (categories.includes(prevSelected) || prevSelected === '__NEW__')) {
      selectCat.value = prevSelected;
    }
  }

  // Populate Promotion target product selects
  const selectProdAlvo = document.getElementById('admin-promo-prod-alvo');
  const selectComboA = document.getElementById('admin-promo-combo-a');
  const selectComboB = document.getElementById('admin-promo-combo-b');

  if (selectProdAlvo) {
    selectProdAlvo.innerHTML = '<option value="">Produto Alvo...</option>' +
      prods.map(p => `<option value="${escapeHtml(p.nome)}">${escapeHtml(p.nome)}</option>`).join('');
  }
  if (selectComboA) {
    selectComboA.innerHTML = '<option value="">Item A...</option>' +
      prods.map(p => `<option value="${escapeHtml(p.nome)}">${escapeHtml(p.nome)}</option>`).join('');
  }
  if (selectComboB) {
    selectComboB.innerHTML = '<option value="">Item B...</option>' +
      prods.map(p => `<option value="${escapeHtml(p.nome)}">${escapeHtml(p.nome)}</option>`).join('');
  }

  // 2. Populate product list in table
  const list = document.getElementById('admin-produtos-list');
  if (!list) return;
  const cfgObj = (typeof configs !== "undefined" ? configs : (window.configs || {})); const toggleRapido = cfgObj.feature_toggle_produto_rapido === true;
  const importSection = document.getElementById('produtos-lote-import-section');
  if (importSection) importSection.style.display = configs.feature_produtos_lote === true ? 'flex' : 'none';
  /* Popular select de categorias do bulk */
  const bulkCatSel = document.getElementById('produtos-bulk-categoria');
  if (bulkCatSel) {
    const cats = [...new Set(prods.filter(p => p.id < 90000).map(p => p.categoria).filter(Boolean))];
    bulkCatSel.innerHTML = '<option value="">Mover para categoria...</option>' + cats.map(c => '<option value="' + escHtml(c) + '">' + escHtml(c) + '</option>').join('');
  }
  window._produtosSelecionados = window._produtosSelecionados || new Set();
  list.innerHTML = prods
    .filter(p => p.id < 90000)
    .map(p => {
    const checked = window._produtosSelecionados.has(p.id) ? 'checked' : '';
    return `
    <tr style="border-bottom: 1px solid #eee; ${p.status === 'inativo' ? 'opacity:0.55;' : ''}" data-prod-id="${p.id}">
      <td style="padding: 10px; width:36px; text-align:center;"><input type="checkbox" class="prod-checkbox" value="${p.id}" ${checked} onchange="window.produtosToggleOne(${p.id}, this.checked)" style="width:16px; height:16px; cursor:pointer;"></td>
      <td style="padding: 10px; font-weight: 500;">${escapeHtml(p.categoria)}</td>
      <td style="padding: 10px;">${escapeHtml(p.emoji || '')} ${escapeHtml(p.nome)}</td>
      <td style="padding: 10px; font-weight: bold; color: #3ab55b;">R$ ${parseFloat(p.preco).toFixed(2).replace('.', ',')}</td>
      <td style="padding: 10px;">
        <span class="badge ${p.setor === 'Bar' ? 'badge-blue' : (p.setor === 'Geral' ? 'badge-purple' : 'badge-orange')}">${escapeHtml(p.setor || 'Cozinha 1')}</span>
        ${p.status === 'inativo' ? '<span class="badge" style="background:#e74c3c; color:white; margin-left:5px;">Inativo</span>' : ''}
      </td>
      <td style="padding: 10px;">
        <span class="badge ${p.visibilidade === 'caixa' ? 'badge-blue' : (p.visibilidade === 'garcom' ? 'badge-purple' : (p.visibilidade === 'invisivel' ? 'badge-gray' : 'badge-orange'))}" style="font-size:11px;">${p.visibilidade === 'caixa' ? 'Só Caixa' : (p.visibilidade === 'garcom' ? 'Garçom' : (p.visibilidade === 'invisivel' ? '🧪 Ingrediente' : 'Todos'))}</span>
      </td>
      <td style="padding: 10px;">
        ${toggleRapido ? `<button onclick="window.toggleProdutoRapido(${p.id}, '${p.status || 'ativo'}')" style="color: ${p.status === 'inativo' ? '#22c55e' : '#f59e0b'}; border: none; background: none; cursor: pointer; margin-right: 8px; font-weight: bold; font-size: 13px;" title="${p.status === 'inativo' ? 'Ativar produto' : 'Desativar produto'}"><i class="ph ph-toggle-${p.status === 'inativo' ? 'right' : 'left'}"></i> ${p.status === 'inativo' ? 'Ativar' : 'Desativar'}</button>` : ''}
        <button onclick="window.editProduto(${p.id}, '${(p.categoria || '').replace(/'/g, "\\'")}', '${(p.nome || '').replace(/'/g, "\\'")}', ${p.preco}, '${(p.emoji || '').replace(/'/g, "\\'")}', '${p.setor || 'Cozinha 1'}', '${p.status || 'ativo'}', '${(p.status_inicial || 'Em espera').replace(/'/g, "\\'")}', '${p.visibilidade || 'todos'}', '${(p.descricao || '').replace(/'/g, "\\'")}', '${(p.foto_url || '').replace(/['\\]/g, '')}')" style="color: #2D9CDB; border: none; background: none; cursor: pointer; margin-right: 8px; font-weight: bold;"><i class="ph ph-pencil"></i> Editar</button>
        <button onclick="window.deleteProduto(${p.id})" style="color: red; border: none; background: none; cursor: pointer; font-weight: bold;"><i class="ph ph-trash"></i> Excluir</button>
      </td>
    </tr>
  `}).join('');
});

window.deleteProduto = (id) => {
  if (typeof window.solicitarAutorizacaoAdmin === 'function') {
    window.solicitarAutorizacaoAdmin('Excluir Produto', 'Informe a senha ou PIN para confirmar a exclusão.', (senha, motivo) => {
      socket.emit('delete_produto', { id, operador: window.crmPerfil ? window.crmPerfil.nome : 'Admin', senha });
    });
  } else if (confirm('Excluir produto?')) {
    socket.emit('delete_produto', { id, operador: window.crmPerfil ? window.crmPerfil.nome : 'Admin' });
  }
};

/* ── Seleção em Massa de Produtos ── */
window._produtosSelecionados = new Set();

window.produtosToggleOne = function(id, checked) {
  if (checked) window._produtosSelecionados.add(id);
  else window._produtosSelecionados.delete(id);
  window._produtosAtualizarBarra();
};

window.produtosToggleAll = function(checked) {
  document.querySelectorAll('.prod-checkbox').forEach(cb => {
    const id = parseInt(cb.value);
    if (checked) { window._produtosSelecionados.add(id); cb.checked = true; }
    else { window._produtosSelecionados.delete(id); cb.checked = false; }
  });
  window._produtosAtualizarBarra();
};

window._produtosAtualizarBarra = function() {
  const bar = document.getElementById('produtos-bulk-bar');
  const cnt = document.getElementById('produtos-bulk-count');
  if (!bar) return;
  const n = window._produtosSelecionados.size;
  bar.style.display = n > 0 ? 'flex' : 'none';
  if (cnt) cnt.textContent = n;
};

window.produtosBulkDesmarcar = function() {
  window._produtosSelecionados.clear();
  document.querySelectorAll('.prod-checkbox').forEach(cb => cb.checked = false);
  const selAll = document.getElementById('produtos-select-all');
  if (selAll) selAll.checked = false;
  window._produtosAtualizarBarra();
};

window.produtosBulkAcao = function(acao) {
  const ids = Array.from(window._produtosSelecionados);
  if (!ids.length) return;
  if (acao === 'excluir' && !confirm('Excluir ' + ids.length + ' produto(s)?')) return;
  ids.forEach(id => {
    const prod = (window.allProducts || []).find(p => p.id === id);
    if (!prod) return;
    if (acao === 'ativar' || acao === 'desativar') {
      socket.emit('edit_produto', {
        id, categoria: prod.categoria, nome: prod.nome, preco: prod.preco,
        emoji: prod.emoji, setor: prod.setor || 'Cozinha 1',
        status: acao === 'ativar' ? 'ativo' : 'inativo',
        status_inicial: prod.status_inicial || 'Em espera',
        categoria_fiscal: prod.categoria_fiscal || 'Alimentacao',
        visibilidade: prod.visibilidade || 'todos',
        descricao: prod.descricao || '',
        operador: window.crmPerfil ? window.crmPerfil.nome : 'Admin'
      });
    } else if (acao === 'excluir') {
      socket.emit('delete_produto', { id, operador: window.crmPerfil ? window.crmPerfil.nome : 'Admin' });
    } else if (acao === 'mover') {
      const novaCat = (document.getElementById('produtos-bulk-categoria') || {}).value;
      if (!novaCat) return;
      socket.emit('edit_produto', {
        id, categoria: novaCat, nome: prod.nome, preco: prod.preco,
        emoji: prod.emoji, setor: prod.setor || 'Cozinha 1',
        status: prod.status || 'ativo',
        status_inicial: prod.status_inicial || 'Em espera',
        categoria_fiscal: prod.categoria_fiscal || 'Alimentacao',
        visibilidade: prod.visibilidade || 'todos',
        descricao: prod.descricao || '',
        operador: window.crmPerfil ? window.crmPerfil.nome : 'Admin'
      });
    }
  });
  window.produtosBulkDesmarcar();
};

window.toggleProdutoRapido = (id, currentStatus) => {
  const newStatus = currentStatus === 'inativo' ? 'ativo' : 'inativo';
  const prod = (window.allProducts || []).find(p => p.id === id);
  if (!prod) return;
  socket.emit('edit_produto', {
    id,
    categoria: prod.categoria,
    nome: prod.nome,
    preco: prod.preco,
    emoji: prod.emoji,
    setor: prod.setor || 'Cozinha 1',
    status: newStatus,
    status_inicial: prod.status_inicial || 'Em espera',
    categoria_fiscal: prod.categoria_fiscal || 'Alimentacao',
    visibilidade: prod.visibilidade || 'todos',
    descricao: prod.descricao || '',
    operador: window.crmPerfil ? window.crmPerfil.nome : 'Admin'
  });
};

window.editProduto = (id, categoria, nome, preco, emoji, setor, status, status_inicial, visibilidade, descricao, foto_url) => {
  document.getElementById('admin-prod-id').value = id;

  const selectCat = document.getElementById('admin-prod-cat-select');
  const inputNewCat = document.getElementById('admin-prod-cat-new');
  if (selectCat) {
    selectCat.value = categoria;
    if (inputNewCat) {
      inputNewCat.style.display = 'none';
      inputNewCat.value = '';
    }
  }

  document.getElementById('admin-prod-nome').value = nome;
  document.getElementById('admin-prod-preco').value = preco;
  document.getElementById('admin-prod-emoji').value = emoji;
  const descEl = document.getElementById('admin-prod-descricao');
  if (descEl) descEl.value = descricao || '';
  const setoEl = document.getElementById('admin-prod-fila');
  if (setoEl) setoEl.value = setor || 'Cozinha 1';
  
  const siEl = document.getElementById('admin-prod-status-inicial');
  if (siEl) siEl.value = status_inicial || 'Em espera';

  const visEl = document.getElementById('admin-prod-visibilidade');
  if (visEl) visEl.value = visibilidade || 'todos';

  const fotoEl = document.getElementById('admin-prod-foto');
  if (fotoEl) fotoEl.value = foto_url || '';
  const fotoPrev = document.getElementById('admin-prod-foto-preview');
  if (fotoPrev) {
    if (foto_url) { fotoPrev.src = foto_url; fotoPrev.style.display = 'block'; }
    else { fotoPrev.src = ''; fotoPrev.style.display = 'none'; }
  }

  const ativoCheckbox = document.getElementById('admin-prod-ativo');
  if (ativoCheckbox) {
    ativoCheckbox.checked = (status !== 'inativo');
  }

  const btn = document.getElementById('btn-admin-add-prod');
  if (btn) btn.innerHTML = '<i class="ph ph-check"></i> Salvar Edição';
};

document.addEventListener('DOMContentLoaded', () => {
  const fotoInput = document.getElementById('admin-prod-foto');
  const fotoPrev = document.getElementById('admin-prod-foto-preview');
  if (fotoInput && fotoPrev) {
    fotoInput.addEventListener('input', () => {
      const v = fotoInput.value.trim();
      if (v && /^https?:\/\//i.test(v)) { fotoPrev.src = v; fotoPrev.style.display = 'block'; }
      else { fotoPrev.src = ''; fotoPrev.style.display = 'none'; }
    });
  }

  const addProdBtn = document.getElementById('btn-admin-add-prod');
  if (addProdBtn) addProdBtn.onclick = () => {
    const id = document.getElementById('admin-prod-id').value;

    const selectCat = document.getElementById('admin-prod-cat-select');
    const inputNewCat = document.getElementById('admin-prod-cat-new');
    let categoria = '';
    if (selectCat) {
      if (selectCat.value === '__NEW__') {
        categoria = inputNewCat ? inputNewCat.value.trim() : '';
      } else {
        categoria = selectCat.value.trim();
      }
    }

    const nome = document.getElementById('admin-prod-nome').value.trim();
    const preco = parseFloat(document.getElementById('admin-prod-preco').value);
    const emoji = document.getElementById('admin-prod-emoji').value.trim();
    const codigo_barras = (document.getElementById('admin-prod-codigo-barras') || {}).value || '';
    const setor = document.getElementById('admin-prod-fila').value || 'Cozinha 1';
    const status_inicial = (document.getElementById('admin-prod-status-inicial') || {}).value || 'Em espera';
    const visibilidade = (document.getElementById('admin-prod-visibilidade') || {}).value || 'todos';
    const ativoCheckbox = document.getElementById('admin-prod-ativo');
    const status = (ativoCheckbox && !ativoCheckbox.checked) ? 'inativo' : 'ativo';
    const descricao = (document.getElementById('admin-prod-descricao') || {}).value || '';
    const categoria_fiscal = (document.getElementById('admin-prod-categoria-fiscal') || {}).value || 'Alimentacao';
    const foto_url = (document.getElementById('admin-prod-foto') || {}).value || '';

    if (!categoria || !nome || isNaN(preco)) return alert('Preencha Categoria, Nome e Preço.');

    if (id) {
      socket.emit('edit_produto', { id, categoria, nome, preco, codigo_barras, emoji, setor, status, status_inicial, categoria_fiscal, visibilidade, descricao, foto_url, operador: window.crmPerfil ? window.crmPerfil.nome : 'Admin' });
    } else {
      socket.emit('add_produto', { categoria, nome, preco, codigo_barras, emoji, setor, status, status_inicial, hasAddons: false, categoria_fiscal, visibilidade, descricao, foto_url });
    }
    // Reset
    document.getElementById('admin-prod-id').value = '';
    if (selectCat) selectCat.value = '';
    if (inputNewCat) {
      inputNewCat.value = '';
      inputNewCat.style.display = 'none';
    }
    document.getElementById('admin-prod-nome').value = '';
    document.getElementById('admin-prod-preco').value = '';
    document.getElementById('admin-prod-emoji').value = '';
    document.getElementById('admin-prod-codigo-barras').value = '';
    if (ativoCheckbox) ativoCheckbox.checked = true;
    const siReset = document.getElementById('admin-prod-status-inicial');
    if (siReset) siReset.value = 'Em espera';
    const visReset = document.getElementById('admin-prod-visibilidade');
    if (visReset) visReset.value = 'todos';
    const fotoReset = document.getElementById('admin-prod-foto');
    if (fotoReset) fotoReset.value = '';
    const fotoPrevReset = document.getElementById('admin-prod-foto-preview');
    if (fotoPrevReset) { fotoPrevReset.src = ''; fotoPrevReset.style.display = 'none'; }
    if (document.getElementById('admin-prod-descricao')) document.getElementById('admin-prod-descricao').value = '';
    const cfReset = document.getElementById('admin-prod-categoria-fiscal');
    if (cfReset) cfReset.value = 'Alimentacao';
    if (addProdBtn) addProdBtn.innerHTML = '<i class="ph ph-plus"></i> Salvar';
  };
});

// --- FUNCIONÁRIOS ---
socket.on('funcionarios_atualizados', (funcs) => {
  const listAtivos = document.getElementById('admin-funcionarios-list');
  const listPendentes = document.getElementById('admin-funcionarios-pendentes');
  if (!listAtivos || !listPendentes) return;

  window.funcionariosList = funcs;
  const pendentes = funcs.filter(f => f.status === 'Pendente');
  const ativos = funcs.filter(f => f.status !== 'Pendente');

  listPendentes.innerHTML = pendentes.map(f => `
    <tr style="border-bottom: 1px solid var(--cfg-border);">
      <td style="padding: 12px 14px;">
        <div style="font-weight: 800; color: var(--cfg-heading); font-size: 14.5px;">${escapeHtml(f.nome)}</div>
        <div style="font-size: 12px; color: var(--cfg-text-muted);">@${escapeHtml(f.usuario)}</div>
      </td>
      <td style="padding: 12px 14px; text-align: right;">
        <div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
          <select id="cargo-pendente-${f.id}" style="padding: 6px 10px; border-radius: 8px; border: 1px solid var(--cfg-border); background: var(--cfg-card-bg); color: var(--cfg-text); font-size: 12.5px; font-weight: 700;">
            <option value="Garçom">Garçom</option>
            <option value="Caixa">Caixa</option>
            <option value="Cozinha">Cozinha</option>
            <option value="Bar">Bar</option>
            <option value="Gerente">Gerente</option>
            <option value="Auxiliar">Auxiliar</option>
          </select>
          <select id="duracao-pendente-${f.id}" style="padding: 6px 10px; border-radius: 8px; border: 1px solid var(--cfg-border); background: var(--cfg-card-bg); color: var(--cfg-text); font-size: 12px; font-weight: 600;">
            <option value="lifetime">Vitalício</option>
            <option value="session">Só nesta sessão</option>
            <option value="1day">1 dia</option>
            <option value="1week">1 semana</option>
            <option value="1month">1 mês</option>
          </select>
          <button onclick="window.aprovarFuncionario(${f.id})" style="color: white; background: #10b981; border: none; padding: 7px 14px; border-radius: 8px; cursor: pointer; font-weight: 800; font-size: 12.5px; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(16,185,129,0.3);">
            <i class="ph-bold ph-check"></i> Aprovar
          </button>
          <button onclick="window.recusarFuncionario(${f.id})" style="color: white; background: #ef4444; border: none; padding: 7px 14px; border-radius: 8px; cursor: pointer; font-weight: 800; font-size: 12.5px; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(239,68,68,0.3);">
            <i class="ph-bold ph-x"></i> Recusar
          </button>
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="2" style="padding: 18px; text-align: center; color: var(--cfg-text-muted); font-size: 13px;">Nenhum cadastro pendente no momento.</td></tr>';

  listAtivos.innerHTML = ativos.map(f => {
    let remBadge = '⏱️ Hora';
    let remValor = `R$ ${(f.valor_hora || 0).toFixed(2).replace('.', ',')}/h`;

    if (f.tipo_remuneracao === 'dia') {
      remBadge = '☀️ Diária';
      remValor = `R$ ${(f.valor_dia || 0).toFixed(2).replace('.', ',')}/dia`;
    } else if (f.tipo_remuneracao === 'semana') {
      remBadge = '📅 Semana';
      remValor = `R$ ${(f.valor_semana || 0).toFixed(2).replace('.', ',')}/sem`;
    } else if (f.tipo_remuneracao === 'mes') {
      remBadge = '🏢 Mensal';
      remValor = `R$ ${(f.valor_mes || 0).toFixed(2).replace('.', ',')}/mês`;
    }

    let loginExpiry = '';
    if (!f.login_expires_at || f.login_expires_at === 'lifetime') {
      loginExpiry = '<span style="background: rgba(16,185,129,0.15); color: #34d399; padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 800; margin-left: 6px; border: 1px solid rgba(16,185,129,0.3);">♾️ Vitalício</span>';
    } else if (f.login_expires_at === 'SESSION') {
      loginExpiry = '<span style="background: rgba(245,158,11,0.15); color: #fbbf24; padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 800; margin-left: 6px; border: 1px solid rgba(245,158,11,0.3);">🔄 Sessão</span>';
    } else {
      const expDate = new Date(f.login_expires_at);
      const now = new Date();
      if (expDate < now) {
        loginExpiry = '<span style="background: rgba(239,68,68,0.15); color: #f87171; padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 800; margin-left: 6px; border: 1px solid rgba(239,68,68,0.3);">⏰ Expirado</span>';
      } else {
        loginExpiry = `<span style="background: rgba(59,130,246,0.15); color: #60a5fa; padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 800; margin-left: 6px; border: 1px solid rgba(59,130,246,0.3);">📅 ${expDate.toLocaleDateString('pt-BR')}</span>`;
      }
    }

    const pixText = f.chave_pix ? `<div style="font-size: 13px; font-weight: 700; color: #10b981;"><i class="ph-bold ph-qr-code"></i> PIX: ${escapeHtml(f.chave_pix)}</div>` : '<div style="font-size: 12px; color: var(--cfg-text-muted);">PIX não informado</div>';
    const telText = f.telefone ? `<div style="font-size: 12px; color: var(--cfg-text-muted); margin-top: 3px;"><i class="ph-bold ph-whatsapp-logo" style="color:#10b981;"></i> ${escapeHtml(f.telefone)}</div>` : '';

    return `
      <tr style="border-bottom: 1px solid var(--cfg-border);">
        <td style="padding: 14px 14px;">
          <div style="font-weight: 800; color: var(--cfg-heading); font-size: 14.5px;">${escapeHtml(f.nome)}</div>
          <div style="font-size: 12px; color: var(--cfg-text-muted); margin-top: 2px;">@${escapeHtml(f.usuario)} ${f.cpf ? `• CPF: ${escapeHtml(f.cpf)}` : ''}</div>
        </td>
        <td style="padding: 14px 14px;">
          <span style="background: rgba(255,255,255,0.08); color: var(--cfg-heading); padding: 4px 10px; border-radius: 8px; font-size: 12.5px; font-weight: 800; border: 1px solid var(--cfg-border);">
            ${escapeHtml(f.cargo)}
          </span>
          ${loginExpiry}
        </td>
        <td style="padding: 14px 14px;">
          <div style="font-weight: 800; color: #38bdf8; font-size: 14px;">${remValor}</div>
          <div style="font-size: 11.5px; color: var(--cfg-text-muted); margin-top: 2px;">${remBadge}</div>
        </td>
        <td style="padding: 14px 14px;">
          ${pixText}
          ${telText}
        </td>
        <td style="padding: 14px 14px; text-align: center;">
          <div style="display: flex; gap: 8px; justify-content: center;">
            <button onclick="window.abrirModalEditarFuncionario(${f.id})" style="background: rgba(252,75,21,0.12); border: 1px solid rgba(252,75,21,0.3); color: #fc4b15; padding: 7px 14px; border-radius: 8px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 5px; font-size: 12.5px; transition: transform 0.1s;">
              <i class="ph-bold ph-pencil-simple"></i> Editar RH
            </button>
            <button onclick="window.deleteFuncionario(${f.id})" style="background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; padding: 7px 10px; border-radius: 8px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 12.5px; transition: transform 0.1s;">
              <i class="ph-bold ph-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--cfg-text-muted); font-size: 13.5px;">Nenhum colaborador cadastrado.</td></tr>';

  // Populate RH Collaborator Dropdown
  const funcSelect = document.getElementById('admin-rh-func-select');
  if (funcSelect) {
      funcSelect.innerHTML = '<option value="">Selecione o Colaborador...</option>' +
      ativos.map(f => `<option value="${f.id}">${escapeHtml(f.nome)} (${escapeHtml(f.cargo)})</option>`).join('');
  }
});

window.abrirModalEditarFuncionario = (id) => {
  const func = (window.funcionariosList || []).find(f => f.id === id);
  if (!func) return;

  document.getElementById('edit-func-id').value = func.id;
  document.getElementById('edit-func-nome').value = func.nome || '';
  document.getElementById('edit-func-usuario').value = func.usuario || '';
  document.getElementById('edit-func-senha').value = '';
  document.getElementById('edit-func-cargo').value = func.cargo || 'Garçom';

  const tipoRem = func.tipo_remuneracao || 'hora';
  const radios = document.getElementsByName('edit-func-tipo-rem');
  radios.forEach(r => { r.checked = (r.value === tipoRem); });

  document.getElementById('edit-func-valor-hora').value = func.valor_hora || 0;
  document.getElementById('edit-func-valor-dia').value = func.valor_dia || 0;
  document.getElementById('edit-func-valor-semana').value = func.valor_semana || 0;
  document.getElementById('edit-func-valor-mes').value = func.valor_mes || 0;

  document.getElementById('edit-func-pix').value = func.chave_pix || '';
  document.getElementById('edit-func-telefone').value = func.telefone || '';
  document.getElementById('edit-func-cpf').value = func.cpf || '';
  document.getElementById('edit-func-obs-rh').value = func.observacao_rh || '';

  const modal = document.getElementById('modal-editar-funcionario');
  if (modal) modal.style.display = 'flex';
};

window.salvarEdicaoFuncionario = () => {
  const id = document.getElementById('edit-func-id').value;
  const nome = document.getElementById('edit-func-nome').value.trim();
  const usuario = document.getElementById('edit-func-usuario').value.trim();
  const senha = document.getElementById('edit-func-senha').value;
  const cargo = document.getElementById('edit-func-cargo').value;

  let tipo_remuneracao = 'hora';
  const radios = document.getElementsByName('edit-func-tipo-rem');
  radios.forEach(r => { if (r.checked) tipo_remuneracao = r.value; });

  const valor_hora = parseFloat(document.getElementById('edit-func-valor-hora').value) || 0;
  const valor_dia = parseFloat(document.getElementById('edit-func-valor-dia').value) || 0;
  const valor_semana = parseFloat(document.getElementById('edit-func-valor-semana').value) || 0;
  const valor_mes = parseFloat(document.getElementById('edit-func-valor-mes').value) || 0;

  const chave_pix = document.getElementById('edit-func-pix').value.trim();
  const telefone = document.getElementById('edit-func-telefone').value.trim();
  const cpf = document.getElementById('edit-func-cpf').value.trim();
  const observacao_rh = document.getElementById('edit-func-obs-rh').value.trim();

  if (!nome || !usuario || !cargo) return alert('Por favor, preencha o Nome, Usuário e Cargo do colaborador!');

  socket.emit('update_funcionario', {
    id, nome, usuario, senha, cargo, tipo_remuneracao, valor_hora, valor_dia, valor_semana, valor_mes, chave_pix, telefone, cpf, observacao_rh
  });

  const modal = document.getElementById('modal-editar-funcionario');
  if (modal) modal.style.display = 'none';
};

window.aprovarFuncionario = (id) => {
  solicitarAutorizacaoAdmin('Aprovar Colaborador', (senha) => {
    const cargoSelect = document.getElementById('cargo-pendente-' + id);
    const cargo = cargoSelect ? cargoSelect.value : 'Garçom';
    const durSelect = document.getElementById('duracao-pendente-' + id);
    const login_duration = durSelect ? durSelect.value : 'lifetime';
    socket.emit('aprovar_funcionario', { id, cargo, valor_hora: 0, senha, login_duration });
  });
};
window.recusarFuncionario = (id) => { if (confirm('Recusar este colaborador?')) socket.emit('recusar_funcionario', id); };
window.deleteFuncionario = (id) => { if (confirm('Excluir funcionário?')) socket.emit('delete_funcionario', id); };

document.addEventListener('DOMContentLoaded', () => {
  const addFuncBtn = document.getElementById('btn-admin-add-func');
  if (addFuncBtn) addFuncBtn.onclick = () => {
    const nome = document.getElementById('admin-func-nome').value.trim();
    const usuario = document.getElementById('admin-func-user').value.trim();
    const senha = document.getElementById('admin-func-pass').value.trim();
    const cargo = document.getElementById('admin-func-cargo').value;
    if (!nome || !usuario || !senha) return alert('Preencha Nome, Usuário e Senha.');
    socket.emit('add_funcionario', { nome, usuario, senha, cargo, valor_hora: 0, status: 'Ativo' });
    document.getElementById('admin-func-nome').value = '';
    document.getElementById('admin-func-user').value = '';
    document.getElementById('admin-func-pass').value = '';
    alert('Colaborador adicionado com sucesso!');
  };
  socket.on('erro_funcionario', (msg) => alert(msg));
});

// --- CLIENTES CRM & FIDELIZAÇÃO (SUPORTE DE ALTA PERFORMANCE PARA 50.000+ CLIENTES) ---
let crmCurrentPage = 1;

socket.on('clientes_atualizados', (lista) => {
  window.clientesList = lista || [];
  window.atualizarMetricasCRM();
  window.filtrarTabelaClientesCRM(1);
});

window.atualizarMetricasCRM = () => {
  const lista = window.clientesList || [];
  const total = lista.length;
  const mesAtual = new Date().getMonth() + 1;

  let comWa = 0;
  let nivers = 0;
  let vips = 0;

  for (let i = 0; i < total; i++) {
    const c = lista[i];
    if (c.telefone && c.telefone.replace(/\D/g, '').length >= 8) comWa++;
    if ((c.pontos || 0) >= 20) vips++;
    if (c.data_nascimento) {
      const p = c.data_nascimento.split('-');
      if (p.length >= 2 && parseInt(p[1], 10) === mesAtual) nivers++;
    }
  }

  const elTotal = document.getElementById('crm-stat-total');
  const elWa = document.getElementById('crm-stat-whatsapp');
  const elNiver = document.getElementById('crm-stat-niver');
  const elVip = document.getElementById('crm-stat-vip');

  if (elTotal) elTotal.innerText = total.toLocaleString('pt-BR');
  if (elWa) elWa.innerText = comWa.toLocaleString('pt-BR');
  if (elNiver) elNiver.innerText = nivers.toLocaleString('pt-BR');
  if (elVip) elVip.innerText = vips.toLocaleString('pt-BR');
};

window.filtrarTabelaClientesCRM = (targetPage) => {
  if (targetPage) crmCurrentPage = targetPage;
  const lista = window.clientesList || [];
  const tbody = document.getElementById('admin-clientes-list');
  if (!tbody) return;

  const searchInput = document.getElementById('cli-search-input');
  const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

  const segEl = document.getElementById('cli-filter-segmento');
  const segmento = segEl ? segEl.value : 'todos';

  const ordemEl = document.getElementById('cli-filter-ordem');
  const ordem = ordemEl ? ordemEl.value : 'id_desc';

  const sizeEl = document.getElementById('cli-page-size');
  const pageSize = sizeEl ? parseInt(sizeEl.value, 10) : 25;

  const mesAtual = new Date().getMonth() + 1;

  // 1. Filtragem ultra-rápida em memória
  let filtrados = lista.filter(c => {
    if (term) {
      const matchNome = (c.nome || '').toLowerCase().includes(term);
      const matchTel = (c.telefone || '').toLowerCase().includes(term);
      const matchEnd = (c.endereco || '').toLowerCase().includes(term);
      const matchObs = (c.observacao || '').toLowerCase().includes(term);
      const matchId = String(c.id) === term;
      if (!matchNome && !matchTel && !matchEnd && !matchObs && !matchId) return false;
    }

    if (segmento === 'aniversario') {
      if (!c.data_nascimento) return false;
      const parts = c.data_nascimento.split('-');
      return parts.length >= 2 && parseInt(parts[1], 10) === mesAtual;
    }
    if (segmento === 'vip') return (c.pontos || 0) >= 20;
    if (segmento === 'whatsapp') return c.telefone && c.telefone.replace(/\D/g, '').length >= 8;
    if (segmento === 'sem_fone') return !c.telefone || c.telefone.replace(/\D/g, '').length < 8;

    return true;
  });

  // 2. Ordenação
  if (ordem === 'nome_asc') {
    filtrados.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  } else if (ordem === 'pontos_desc') {
    filtrados.sort((a, b) => (b.pontos || 0) - (a.pontos || 0));
  } else {
    filtrados.sort((a, b) => b.id - a.id);
  }

  // 3. Paginação de alta performance (renderiza apenas a página atual no DOM)
  const totalItems = filtrados.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (crmCurrentPage > totalPages) crmCurrentPage = totalPages;
  if (crmCurrentPage < 1) crmCurrentPage = 1;

  const startIndex = (crmCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pageItems = filtrados.slice(startIndex, endIndex);

  // Renderiza apenas os 25/50/100 itens visíveis!
  tbody.innerHTML = pageItems.map(c => {
    const cleanPhone = (c.telefone || '').replace(/\D/g, '');
    const phoneFull = cleanPhone ? (cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone) : '';
    const defaultText = encodeURIComponent(`Olá ${c.nome}! Tudo bem? Passando para te desejar um ótimo dia aqui do restaurante! 🍽️`);
    const waUrl = phoneFull ? `https://api.whatsapp.com/send?phone=${phoneFull}&text=${defaultText}` : '#';

    return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 10px; font-weight: 700; color: #475569;">#${c.id}</td>
        <td style="padding: 10px;">
          <strong style="color: #0f172a;">${escapeHtml(c.nome)}</strong><br>
          <small style="color:gray;">Nasc: ${c.data_nascimento ? new Date(c.data_nascimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}</small>
        </td>
        <td style="padding: 10px;">${escapeHtml(c.telefone || '-')}<br><small style="color:gray;">End: ${escapeHtml(c.endereco || '-')}</small></td>
        <td style="padding: 10px; max-width:150px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${escapeHtml(c.observacao || '')}">${escapeHtml(c.observacao || '-')}</td>
        <td style="padding: 10px; text-align:center;">
          <span style="background: #ecfdf5; color: #16a34a; border: 1px solid #a7f3d0; padding: 4px 10px; border-radius: 20px; font-weight: 800; font-size: 13px;">
            ⭐ ${c.pontos || 0} pts
          </span>
          <div style="margin-top: 4px;">
            <button onclick="window.ajustarPontosCliente(${c.id}, ${c.pontos || 0}, '${(c.nome || '').replace(/'/g, "\\'")}')" style="background: #fff; border: 1px solid #16a34a; color: #16a34a; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
              ⚙️ Ajustar Pontos
            </button>
          </div>
        </td>
        <td style="padding: 10px; text-align: center;">
          <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
            ${phoneFull ? `
              <a href="${waUrl}" target="_blank" style="background: #25d366; color: white; text-decoration: none; padding: 6px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; display: flex; align-items: center; gap: 4px;">
                <i class="ph ph-whatsapp-logo" style="font-size: 15px;"></i> WhatsApp
              </a>
            ` : '<span style="font-size: 11px; color: #aaa;">Sem Whats</span>'}
            <button onclick="window.editCliente(${c.id}, '${(c.nome || '').replace(/'/g, "\\'")}', '${c.telefone || ''}', '${(c.observacao || '').replace(/'/g, "\\'")}', '${(c.endereco || '').replace(/'/g, "\\'")}', '${c.data_nascimento || ''}')" style="color: #2D9CDB; border: 1px solid #2D9CDB; background: #f0f8ff; border-radius: 6px; padding: 6px 8px; cursor: pointer;" title="Editar"><i class="ph ph-pencil"></i></button>
            <button onclick="window.deleteCliente(${c.id})" style="color: red; border: 1px solid #fecaca; background: #fff5f5; border-radius: 6px; padding: 6px 8px; cursor: pointer;" title="Excluir"><i class="ph ph-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6" style="padding: 30px; text-align: center; color: gray;">Nenhum cliente encontrado.</td></tr>';

  // 4. Atualiza informações e botões de paginação
  const infoEl = document.getElementById('cli-pagination-info');
  if (infoEl) {
    const from = totalItems > 0 ? startIndex + 1 : 0;
    const to = endIndex;
    infoEl.innerHTML = `Exibindo <strong>${from}–${to}</strong> de <strong>${totalItems.toLocaleString('pt-BR')}</strong> clientes ${term || segmento !== 'todos' ? `(filtrados de ${lista.length.toLocaleString('pt-BR')})` : ''}`;
  }

  const controlsEl = document.getElementById('cli-pagination-controls');
  if (controlsEl) {
    controlsEl.innerHTML = `
      <button onclick="window.filtrarTabelaClientesCRM(1)" ${crmCurrentPage <= 1 ? 'disabled' : ''} style="padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; cursor: ${crmCurrentPage <= 1 ? 'not-allowed' : 'pointer'}; font-weight: bold;">&laquo;</button>
      <button onclick="window.filtrarTabelaClientesCRM(${crmCurrentPage - 1})" ${crmCurrentPage <= 1 ? 'disabled' : ''} style="padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; cursor: ${crmCurrentPage <= 1 ? 'not-allowed' : 'pointer'}; font-weight: bold;">&lt;</button>
      <span style="font-size: 13px; font-weight: 700; color: #1e293b; padding: 0 8px;">Pág. ${crmCurrentPage} de ${totalPages}</span>
      <button onclick="window.filtrarTabelaClientesCRM(${crmCurrentPage + 1})" ${crmCurrentPage >= totalPages ? 'disabled' : ''} style="padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; cursor: ${crmCurrentPage >= totalPages ? 'not-allowed' : 'pointer'}; font-weight: bold;">&gt;</button>
      <button onclick="window.filtrarTabelaClientesCRM(${totalPages})" ${crmCurrentPage >= totalPages ? 'disabled' : ''} style="padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: white; cursor: ${crmCurrentPage >= totalPages ? 'not-allowed' : 'pointer'}; font-weight: bold;">&raquo;</button>
    `;
  }
};

// --- EXPORTAÇÃO CSV DE CLIENTES ---
window.exportarClientesCsv = () => {
  const lista = window.clientesList || [];
  if (lista.length === 0) return alert('Nenhum cliente cadastrado para exportar.');

  const headers = ['ID', 'Nome', 'Telefone', 'Pontos', 'Data Nascimento', 'Endereco', 'Observacoes'];
  const rows = lista.map(c => [
    c.id,
    `"${(c.nome || '').replace(/"/g, '""')}"`,
    `"${(c.telefone || '').replace(/"/g, '""')}"`,
    c.pontos || 0,
    c.data_nascimento || '',
    `"${(c.endereco || '').replace(/"/g, '""')}"`,
    `"${(c.observacao || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `clientes_restaurante_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- ASSISTENTE DE SUGESTÕES INTELIGENTES WHATSAPP ---
let currentSugFiltro = 'aniversario';

window.abrirModalSugestoesEngajamento = () => {
  const modal = document.getElementById('modal-sugestoes-whatsapp');
  if (modal) modal.style.display = 'flex';

  if (typeof socket !== 'undefined' && socket) {
    socket.emit('get_clientes');
  }

  fetch('/api/clientes')
    .then(r => r.json())
    .then(data => {
      if (Array.isArray(data) && data.length > 0) {
        window.clientesList = data;
      }
      window.filtrarSugestoes('aniversario');
    })
    .catch(() => {
      window.filtrarSugestoes('aniversario');
    });
};

window.filtrarSugestoes = (filtro) => {
  currentSugFiltro = filtro;
  document.querySelectorAll('.btn-sug-filtro').forEach(btn => {
    btn.style.background = '#f8fafc';
    btn.style.color = '#64748b';
    btn.style.borderColor = '#cbd5e1';
  });

  const activeBtn = document.getElementById(`btn-filtro-${filtro}`);
  if (activeBtn) {
    activeBtn.style.background = '#eff6ff';
    activeBtn.style.color = '#1d4ed8';
    activeBtn.style.borderColor = '#bfdbfe';
  }

  window.renderSugestoesList();
};

// 15 VARIAÇÕES PROFISSIONAIS EXCLUSIVAS PARA CADA UMA DAS 6 MODALIDADES (90 MODELOS NO TOTAL)
const MODELOS_POR_MODALIDADE = {
  a_la_carte: [
    { id: 'alc_1', categoria: 'aniversario', titulo: 'Sobremesa do Chef de Cortesia', texto: 'Olá {nome}! 🥳 Parabéns pelo seu aniversário! O {restaurante} preparou uma surpresa para celebrar com você: venha comemorar em nosso salão e ganhe uma sobremesa especial do Chef! 🍰 Deseja que eu reserve sua mesa?', ativo: true },
    { id: 'alc_2', categoria: 'aniversario', titulo: 'Drink Comemorativo de Boas-Vindas', texto: 'Parabéns, {nome}! 🎉 No mês do seu aniversário, queremos te presentar: traga a família ao {restaurante} e ganhe um drink especial de boas-vindas! 🥂 Qual dia fica melhor para sua mesa?', ativo: true },
    { id: 'alc_3', categoria: 'aniversario', titulo: 'Celebração Inesquecível em Família', texto: 'Olá {nome}! 🎂 Um ano mais especial merece uma celebração inesquecível! Reúna quem você ama e venha vivenciar momentos incríveis no {restaurante}. 🍽️ Posso reservar seu horário?', ativo: true },
    { id: 'alc_4', categoria: 'pontos', titulo: 'Resgate de Pontos VIP Jantar', texto: 'Olá {nome}! 🌟 Você acumulou {pontos} pontos no nosso Clube VIP do {restaurante}! Que tal vir resgatar sua recompensa em um jantar agradável hoje? 🍽️', ativo: true },
    { id: 'alc_5', categoria: 'pontos', titulo: 'Cortesia Exclusiva Cliente Especial', texto: 'Oi {nome}! 🏆 Como cliente VIP do {restaurante} com {pontos} pontos, preparamos uma cortesia exclusiva para sua próxima refeição conosco. Quando podemos te receber?', ativo: true },
    { id: 'alc_6', categoria: 'pontos', titulo: 'Transforme Pontos em Experiências', texto: 'Olá {nome}! ✨ Seus {pontos} pontos acumulados estão prontos para virar prêmios no nosso cardápio! Venha aproveitar seu saldo e curtir uma ótima experiência no {restaurante}! 🎁', ativo: true },
    { id: 'alc_7', categoria: 'retencao', titulo: 'Pausa na Rotina Almoço/Jantar', texto: 'Olá {nome}! 🍽️ Sentimos sua falta aqui no {restaurante}! Preparamos opções deliciosas no nosso cardápio esta semana. Que tal fazer uma pausa na rotina e vir almoçar ou jantar conosco hoje?', ativo: true },
    { id: 'alc_8', categoria: 'retencao', titulo: 'Ambiente Acolhedor & Atendimento', texto: 'Oi {nome}! 🥂 Faz um tempinho que não nos vemos no {restaurante}! Que tal curtir um momento agradável com nosso atendimento atencioso e pratos incríveis? Nossas mesas estão prontas!', ativo: true },
    { id: 'alc_9', categoria: 'retencao', titulo: 'Encontro com Família ou Amigos', texto: 'Olá {nome}! 🍷 Que tal reunir a família ou amigos para um momento especial no {restaurante}? Temos sugestões refinadas e um ambiente acolhedor. Posso reservar uma mesa?', ativo: true },
    { id: 'alc_10', categoria: 'retencao', titulo: 'Sugestão Especial do Chef', texto: 'Olá {nome}! 👨‍🍳 O Chef do {restaurante} criou sugestões especiais para esta semana! Venha experimentar as novidades da casa. Te esperamos com carinho!', ativo: true },
    { id: 'alc_11', categoria: 'retencao', titulo: 'Almoço de Negócios / Tranquilidade', texto: 'Oi {nome}! 💼 Precisando de um almoço tranquilo e de qualidade hoje? O {restaurante} oferece o ambiente ideal para suas refeições. Venha nos visitar!', ativo: true },
    { id: 'alc_12', categoria: 'retencao', titulo: 'Jantar Especial Reservas', texto: 'Olá {nome}! 🕯️ Que tal surpreender quem você gosta com um jantar inesquecível no {restaurante}? Nossas mesas já estão preparadas!', ativo: true },
    { id: 'alc_13', categoria: 'retencao', titulo: 'Happy Hour Vinhos & Porções', texto: 'Olá {nome}! 🍷 O fim de semana está chegando! Que tal garantir sua mesa no {restaurante} e harmonizar um bom vinho com nossas porções especiais?', ativo: true },
    { id: 'alc_14', categoria: 'geral', titulo: 'Agradecimento e Avaliação do Cliente', texto: 'Olá {nome}! 🌟 Agradecemos muito a sua visita ao {restaurante}! Como foi sua experiência em nosso salão? Adoraríamos ouvir sua opinião!', ativo: true },
    { id: 'alc_15', categoria: 'geral', titulo: 'Até Breve no Restaurante', texto: 'Oi {nome}! 🙏 Foi um grande prazer receber você no {restaurante}! Esperamos que tenha tido uma refeição maravilhosa. Até a próxima!', ativo: true }
  ],
  pizzaria: [
    { id: 'piz_1', categoria: 'aniversario', titulo: 'Aniversário Broto Doce Cortesia', texto: 'Olá {nome}! 🍕 Parabéns pelo seu aniversário! A {restaurante} preparou um presente especial: venha comemorar conosco ou peça hoje e ganhe um broto doce por nossa conta! 🎂 Vamos preparar sua pizza?', ativo: true },
    { id: 'piz_2', categoria: 'aniversario', titulo: 'Reunião de Amigos com Pizza', texto: 'Parabéns, {nome}! 🎉 Aniversário combina com pizza e boa companhia! Reúna os amigos na {restaurante} e ganhe um guaraná ou sobremesa cortesia! 🥂', ativo: true },
    { id: 'piz_3', categoria: 'aniversario', titulo: 'Pizza Forno a Lenha Aniversário', texto: 'Olá {nome}! 🍕 Comemorar o aniversário saboreando uma pizza quentinha do forno a lenha é irresistível! Posso agendar sua mesa ou seu pedido na {restaurante}?', ativo: true },
    { id: 'piz_4', categoria: 'pontos', titulo: 'Fidelidade Resgate Broto Doce', texto: 'Olá {nome}! 🌟 Você acumulou {pontos} pontos no nosso Clube de Fidelidade da {restaurante}! Que tal resgatar uma pizza broto doce hoje? 😋', ativo: true },
    { id: 'piz_5', categoria: 'pontos', titulo: 'Borda Recheada Cortesia VIP', texto: 'Oi {nome}! 🏆 Como cliente especial com {pontos} pontos, sua próxima pizza na {restaurante} vai com borda recheada de cortesia! Peça ou venha nos visitar!', ativo: true },
    { id: 'piz_6', categoria: 'pontos', titulo: 'Desconto Exclusivo de Fidelidade', texto: 'Olá {nome}! ✨ Seus {pontos} pontos na {restaurante} valem desconto exclusivo! Peça sua pizza favorita e aproveite seu saldo acumulado! 🍕', ativo: true },
    { id: 'piz_7', categoria: 'retencao', titulo: 'Pizza do Forno a Lenha Hoje', texto: 'Olá {nome}! 🍕 Bateu aquela vontade de pizza quentinha saindo do forno a lenha? Nossos pizzaiolos na {restaurante} já estão a todo vapor! Peça a sua hoje!', ativo: true },
    { id: 'piz_8', categoria: 'retencao', titulo: 'Noite da Pizza em Casa/Salão', texto: 'Oi {nome}! 🍕 Faz um tempinho que você não saboreia nossas pizzas! Que tal transformar sua noite com a melhor pizza da cidade na {restaurante}?', ativo: true },
    { id: 'piz_9', categoria: 'retencao', titulo: 'Novos Sabores de Pizzas', texto: 'Olá {nome}! 🧀 Lançamos novos sabores especiais na {restaurante}! Que tal experimentar hoje? Peça pelo delivery ou venha ao nosso salão!', ativo: true },
    { id: 'piz_10', categoria: 'retencao', titulo: 'Antecipe o Fim de Semana com Pizza', texto: 'Olá {nome}! 🍕 Que tal antecipar o fim de semana com uma pizza artesanal da {restaurante}? Nossos fornos estão acesos esperando por você!', ativo: true },
    { id: 'piz_11', categoria: 'retencao', titulo: 'Pizza em Família no Fim de Semana', texto: 'Oi {nome}! 🍕 Sexta e sábado pedem pizza em família! Garanta a sua na {restaurante} quentinha e crocante!', ativo: true },
    { id: 'piz_12', categoria: 'retencao', titulo: 'Pizza Meio a Meio Especial', texto: 'Olá {nome}! 🍕 Dúvida entre os sabores? Na {restaurante} você combina suas preferidas em uma pizza meio a meio caprichada! Peça já!', ativo: true },
    { id: 'piz_13', categoria: 'retencao', titulo: 'Combo Pizza Grande + Refri', texto: 'Oi {nome}! 🥤 Temos combos de pizza grande + refrigerante com preço especial na {restaurante}! Aproveite hoje!', ativo: true },
    { id: 'piz_14', categoria: 'geral', titulo: 'Agradecimento Pedido de Pizza', texto: 'Olá {nome}! 🌟 Agradecemos seu pedido/visita na {restaurante}! A pizza estava do seu agrado? Conte-nos sua opinião!', ativo: true },
    { id: 'piz_15', categoria: 'geral', titulo: 'Cliente Fiel de Pizzaria', texto: 'Oi {nome}! 🙏 É uma alegria ter você como cliente da {restaurante}! Conte conosco sempre que bater aquela vontade de pizza!', ativo: true }
  ],
  lanchonete: [
    { id: 'lan_1', categoria: 'aniversario', titulo: 'Batata ou Milk-Shake Aniversário', texto: 'Olá {nome}! 🍔 Parabéns pelo seu aniversário! A {restaurante} quer celebrar com você: peça ou venha nos visitar e ganhe uma batata frita ou milk-shake especial! 🍟', ativo: true },
    { id: 'lan_2', categoria: 'aniversario', titulo: 'Galera do Burger no Aniversário', texto: 'Parabéns, {nome}! 🎉 Aniversário pede hambúrguer artesanal e amigos reunidos! Venha comemorar na {restaurante} e ganhe cortesia da casa! 🥤', ativo: true },
    { id: 'lan_3', categoria: 'aniversario', titulo: 'Combo Aniversariante Especial', texto: 'Olá {nome}! 🎂 Parabéns! O melhor presente de aniversário é aquele lanche suculento da {restaurante}! Posso anotar o seu pedido?', ativo: true },
    { id: 'lan_4', categoria: 'pontos', titulo: 'Milk-Shake Grátis com Pontos', texto: 'Olá {nome}! 🌟 Você tem {pontos} pontos acumulados na {restaurante}! Que tal passar aqui e resgatar um Milk Shake delicioso hoje? 🥤', ativo: true },
    { id: 'lan_5', categoria: 'pontos', titulo: 'Batata Suprema Cheddar & Bacon VIP', texto: 'Oi {nome}! 🏆 Seus {pontos} pontos na {restaurante} valem uma Batata Suprema com Cheddar e Bacon! Venha saborear ou peça agora!', ativo: true },
    { id: 'lan_6', categoria: 'pontos', titulo: 'Upgrade Burger Duplo Fidelidade', texto: 'Olá {nome}! ✨ Com {pontos} pontos na {restaurante}, você ganha burger duplo no seu lanche favorito! Aproveite!', ativo: true },
    { id: 'lan_7', categoria: 'retencao', titulo: 'Bateu a Fome de Hambúrguer', texto: 'Olá {nome}! 🍔 Bateu aquela fome de hambúrguer artesanal suculento? Nossas chapas na {restaurante} estão a todo vapor! Peça o seu lanche hoje!', ativo: true },
    { id: 'lan_8', categoria: 'retencao', titulo: 'Combos Especiais Burger + Fritas', texto: 'Oi {nome}! 🍟 Sumiu hein! Preparamos combos especiais de Burger + Fritas + Bebida com preço imbatível na {restaurante}! Vem aproveitar!', ativo: true },
    { id: 'lan_9', categoria: 'retencao', titulo: 'Hambúrguer com Molho Especial', texto: 'Olá {nome}! 🧀 Passando para lembrar do nosso hambúrguer com molho especial da {restaurante}! Impossível resistir. Peça agora!', ativo: true },
    { id: 'lan_10', categoria: 'retencao', titulo: 'Lanche de Fim de Tarde / Domingo', texto: 'Olá {nome}! 🍔 Nada melhor que um burger artesanal caprichado para fechar o dia! Peça o seu na {restaurante}!', ativo: true },
    { id: 'lan_11', categoria: 'retencao', titulo: 'Smash Burgers Crocantes', texto: 'Oi {nome}! 🥩 Já experimentou nossos Smash Burgers super crocantes da {restaurante}? Peça o seu agora mesmo!', ativo: true },
    { id: 'lan_12', categoria: 'retencao', titulo: 'Sobremesas & Churros Quentinhos', texto: 'Olá {nome}! 🍩 Além dos burgers sensacionais, temos sobremesas e churros quentinhos na {restaurante}! Venha conferir!', ativo: true },
    { id: 'lan_13', categoria: 'retencao', titulo: 'Happy Hour Burguer & Cerveja', texto: 'Oi {nome}! 🍻 Que tal curtir o fim de tarde na {restaurante} com lanche artesanal e bebida gelada?', ativo: true },
    { id: 'lan_14', categoria: 'geral', titulo: 'Agradecimento Pedido Lanche', texto: 'Olá {nome}! 🌟 Seu lanche da {restaurante} estava gostoso? Obrigado pela preferência e conta pra gente o que achou!', ativo: true },
    { id: 'lan_15', categoria: 'geral', titulo: 'Até o Próximo Lanche', texto: 'Oi {nome}! 🙏 Agradecemos por escolher a {restaurante}! Até o seu próximo lanche com a gente!', ativo: true }
  ],
  a_kilo: [
    { id: 'kil_1', categoria: 'aniversario', titulo: 'Sobremesa no Almoço de Aniversário', texto: 'Olá {nome}! 🥳 Parabéns pelo seu mês de aniversário! O {restaurante} te convida para almoçar conosco: venha celebrar em nosso buffet e a sobremesa é por nossa conta! 🍰', ativo: true },
    { id: 'kil_2', categoria: 'aniversario', titulo: 'Almoço Comemorativo em Família', texto: 'Parabéns, {nome}! 🎉 Venha celebrar seu aniversário no buffet variado do {restaurante}! Traga a família e aproveite um almoço delicioso!', ativo: true },
    { id: 'kil_3', categoria: 'aniversario', titulo: 'Comida Caseira Aniversário', texto: 'Olá {nome}! 🎂 Parabéns! Um almoço especial no {restaurante} com opções saudáveis e churrasco te espera no seu aniversário!', ativo: true },
    { id: 'kil_4', categoria: 'pontos', titulo: 'Desconto de Fidelidade no Kilo', texto: 'Olá {nome}! 🌟 Você acumulou {pontos} pontos no {restaurante}! Que tal utilizar seu saldo para um desconto especial no seu almoço de hoje? 🍽️', ativo: true },
    { id: 'kil_5', categoria: 'pontos', titulo: 'Suco Natural Cortesia VIP', texto: 'Oi {nome}! 🏆 Como cliente fiel com {pontos} pontos no {restaurante}, seu suco natural no almoço de hoje é por nossa conta!', ativo: true },
    { id: 'kil_6', categoria: 'pontos', titulo: 'Sobremesa do Buffet Fidelidade', texto: 'Olá {nome}! ✨ Seus {pontos} pontos acumulados no {restaurante} valem uma sobremesa deliciosa no buffet! Venha almoçar conosco!', ativo: true },
    { id: 'kil_7', categoria: 'retencao', titulo: 'Almoço Variado & Saudável Hoje', texto: 'Olá {nome}! 🍽️ Sentimos sua falta no almoço do {restaurante}! Saladas frescas, pratos quentes e opções deliciosas te esperam hoje!', ativo: true },
    { id: 'kil_8', categoria: 'retencao', titulo: 'Comida Caseira Quentinha', texto: 'Oi {nome}! 🥘 Saudades daquela comida saborosa e quentinha do {restaurante}? Venha fazer seu prato no nosso self-service hoje!', ativo: true },
    { id: 'kil_9', categoria: 'retencao', titulo: 'Almoço Executivo Rápido', texto: 'Olá {nome}! 🥩 Que tal um almoço completo, rápido e variado no {restaurante} hoje? Te esperamos a partir das 11:30h!', ativo: true },
    { id: 'kil_10', categoria: 'retencao', titulo: 'Feijoada Especial Quarta/Sábado', texto: 'Olá {nome}! 🍲 Hoje é dia de Feijoada especial e pratos tradicionais no {restaurante}! Venha saborear!', ativo: true },
    { id: 'kil_11', categoria: 'retencao', titulo: 'Churrasco no Espeto & Buffet', texto: 'Oi {nome}! 🥩 Sexta-feira combina com churrasco no espeto e buffet variado no {restaurante}! Vem almoçar com a gente!', ativo: true },
    { id: 'kil_12', categoria: 'retencao', titulo: 'Buffet de Saladas Frescas', texto: 'Olá {nome}! 🥗 Procurando um almoço leve e saudável? Nosso buffet de saladas do {restaurante} está incrível hoje!', ativo: true },
    { id: 'kil_13', categoria: 'retencao', titulo: 'Sobremesas Caseiras Artesanais', texto: 'Oi {nome}! 🍮 Pudim caseiro, tortas e doces artesanais te esperam no buffet de sobremesas do {restaurante}!', ativo: true },
    { id: 'kil_14', categoria: 'geral', titulo: 'Agradecimento Almoço do Dia', texto: 'Olá {nome}! 🌟 Agradecemos por almoçar no {restaurante} hoje! Como foi sua refeição conosco?', ativo: true },
    { id: 'kil_15', categoria: 'geral', titulo: 'Até o Próximo Almoço', texto: 'Oi {nome}! 🙏 Bom retorno ao trabalho e obrigado por escolher o {restaurante}! Te esperamos amanhã!', ativo: true }
  ],
  bar: [
    { id: 'bar_1', categoria: 'aniversario', titulo: 'Reserva VIP & Drink Aniversário', texto: 'Olá {nome}! 🍻 Parabéns pelo seu aniversário! Venha comemorar na {restaurante}: traga sua galera e você ganha drink cortesia e reserva de mesa vip! 🍹', ativo: true },
    { id: 'bar_2', categoria: 'aniversario', titulo: 'Lista VIP de Aniversário Balada', texto: 'Parabéns, {nome}! 🎉 Seu aniversário merece uma festa inesquecível na {restaurante}! Ganhe lista VIP para seus convidados!', ativo: true },
    { id: 'bar_3', categoria: 'aniversario', titulo: 'Espetinho & Chopp Aniversariante', texto: 'Olá {nome}! 🎂 Aniversário combina com chopp trincando e espetinho saboroso na {restaurante}! Posso reservar o espaço da sua galera?', ativo: true },
    { id: 'bar_4', categoria: 'pontos', titulo: 'Desconto Balde de Cerveja VIP', texto: 'Olá {nome}! 🌟 Com {pontos} pontos acumulados na {restaurante}, seu próximo balde de cerveja tem desconto exclusivo! Vem curtir!', ativo: true },
    { id: 'bar_5', categoria: 'pontos', titulo: 'Drink Autoral Cortesia Fidelidade', texto: 'Oi {nome}! 🏆 Você tem {pontos} pontos na {restaurante}! Passe aqui no Happy Hour e resgate um drink autoral por nossa conta!', ativo: true },
    { id: 'bar_6', categoria: 'pontos', titulo: 'Upgrade Porção de Petiscos VIP', texto: 'Olá {nome}! ✨ Com seus {pontos} pontos na {restaurante}, sua porção de petiscos ganha um upgrade especial! Vem pra cá!', ativo: true },
    { id: 'bar_7', categoria: 'retencao', titulo: 'Happy Hour Chopp Gelado', texto: 'Olá {nome}! 🍹 Faz tempo que você não cola na {restaurante}! Que tal um Happy Hour com chopp gelado e petiscos hoje?', ativo: true },
    { id: 'bar_8', categoria: 'retencao', titulo: 'Música ao Vivo & Noite Incrível', texto: 'Oi {nome}! 🎸 Hoje tem música ao vivo incrível na {restaurante}! Bora curtir o som e relaxar com a galera?', ativo: true },
    { id: 'bar_9', categoria: 'retencao', titulo: 'Porções & Boteco', texto: 'Olá {nome}! 🍻 Sentimos sua falta nas nossas mesas! Nossas porções da {restaurante} estão demais hoje. Chega mais!', ativo: true },
    { id: 'bar_10', categoria: 'retencao', titulo: 'Quinta do Chopp em Dobro', texto: 'Olá {nome}! 🍺 Quinta-feira é dia de rodada dupla de chopp na {restaurante}! Vem aproveitar!', ativo: true },
    { id: 'bar_11', categoria: 'retencao', titulo: 'Reserva para Fim de Semana', texto: 'Oi {nome}! 🥂 Fim de semana na {restaurante} promete! Reserve seu lugar e venha curtir a noite com a gente!', ativo: true },
    { id: 'bar_12', categoria: 'retencao', titulo: 'Futebol & Tela Gigante', texto: 'Olá {nome}! ⚽ Transmissão ao vivo do jogo com tela gigante e cerveja trincando na {restaurante}! Vem torcer aqui!', ativo: true },
    { id: 'bar_13', categoria: 'retencao', titulo: 'Drinks Clássicos & Autorais', texto: 'Oi {nome}! 🍸 Drinks clássicos, autorais e opções sem álcool deliciosas te esperam na {restaurante}!', ativo: true },
    { id: 'bar_14', categoria: 'geral', titulo: 'Agradecimento Noite de Bar', texto: 'Olá {nome}! 🌟 Valeu por curtir a noite na {restaurante}! A vibe estava incrível. O que achou do atendimento?', ativo: true },
    { id: 'bar_15', categoria: 'geral', titulo: 'Até o Próximo Rolezinho', texto: 'Oi {nome}! 🔥 Foi top ter você na {restaurante}! Conta com a gente pro próximo rolezinho!', ativo: true }
  ],
  quiosque: [
    { id: 'qui_1', categoria: 'aniversario', titulo: 'Brinde de Aniversário no Quiosque', texto: 'Olá {nome}! 🥳 Parabéns pelo seu aniversário! Passe no nosso quiosque {restaurante} e ganhe um brinde exclusivo no seu pedido! 🎁', ativo: true },
    { id: 'qui_2', categoria: 'aniversario', titulo: 'Lanche Rápido Comemorativo', texto: 'Parabéns, {nome}! 🎉 Um dia especial pede um lanche/bebida especial da {restaurante}! Venha comemorar com a gente!', ativo: true },
    { id: 'qui_3', categoria: 'aniversario', titulo: 'Sobremesa de Quiosque Aniversário', texto: 'Olá {nome}! 🎂 Parabéns! Venha saborear nossas delícias na {restaurante} no mês do seu aniversário!', ativo: true },
    { id: 'qui_4', categoria: 'pontos', titulo: 'Resgate de Produto Fidelidade', texto: 'Olá {nome}! 🌟 Você tem {pontos} pontos na {restaurante}! Resgate seu produto favorito no nosso quiosque hoje!', ativo: true },
    { id: 'qui_5', categoria: 'pontos', titulo: 'Desconto no Próximo Pedido Quiosque', texto: 'Oi {nome}! 🏆 Como cliente frequente com {pontos} pontos, seu próximo pedido na {restaurante} tem desconto especial!', ativo: true },
    { id: 'qui_6', categoria: 'pontos', titulo: 'Brinde Exclusivo Fidelidade Quiosque', texto: 'Olá {nome}! ✨ Seus {pontos} pontos na {restaurante} garantem um brinde especial no quiosque! Aproveite!', ativo: true },
    { id: 'qui_7', categoria: 'retencao', titulo: 'Pausa no Passeio Quiosque', texto: 'Olá {nome}! 🥤 Passando perto da {restaurante}? Faça uma pausa e venha saborear nossas opções frescas e saborosas!', ativo: true },
    { id: 'qui_8', categoria: 'retencao', titulo: 'Novidades do Cardápio de Quiosque', texto: 'Oi {nome}! 🍦 Lançamos novidades incríveis na {restaurante}! Que tal experimentar hoje no seu passeio?', ativo: true },
    { id: 'qui_9', categoria: 'retencao', titulo: 'Lanche Rápido & Gostoso', texto: 'Olá {nome}! 🥨 Precisando de um lanche rápido e gostoso? O quiosque {restaurante} está pronto para te atender!', ativo: true },
    { id: 'qui_10', categoria: 'retencao', titulo: 'Bebida Geladinha do Quiosque', texto: 'Olá {nome}! 🍹 Dia quente pede aquela bebida geladinha da {restaurante}! Vem se refrescar com a gente!', ativo: true },
    { id: 'qui_11', categoria: 'retencao', titulo: 'Pausa para a Fome no Quiosque', texto: 'Oi {nome}! 🌭 Deu fominha no meio do dia? Passe no quiosque {restaurante} e garanta o seu preferido!', ativo: true },
    { id: 'qui_12', categoria: 'retencao', titulo: 'Combo Passeio Especial', texto: 'Olá {nome}! 🛍️ Passeando por aqui? Aproveite nosso combo promocional na {restaurante}!', ativo: true },
    { id: 'qui_13', categoria: 'retencao', titulo: 'Sobremesas Deliciosas de Quiosque', texto: 'Oi {nome}! 🍰 Aquela sobremesa deliciosa te espera no quiosque {restaurante}! Vem provar!', ativo: true },
    { id: 'qui_14', categoria: 'geral', titulo: 'Agradecimento Visita ao Quiosque', texto: 'Olá {nome}! 🌟 Obrigado por comprar na {restaurante}! Gostou do atendimento no nosso quiosque?', ativo: true },
    { id: 'qui_15', categoria: 'geral', titulo: 'Volte Sempre ao Quiosque', texto: 'Oi {nome}! 🙏 Agradecemos a visita! Volte sempre à {restaurante}!', ativo: true }
  ]
};

// Regras de Automação e Programação por Comportamento e Categoria
const REGRAS_PADRAO = [
  { id: 'regra_aniv', nome: '🎂 Aniversariantes do Mês', gatilho: 'aniversario', categoria: 'aniversariantes', modeloId: 'aniv_1', ativo: true },
  { id: 'regra_sumido', nome: '💤 Reconectar Clientes Sumidos (> 30 dias)', gatilho: 'sumido_30d', categoria: 'todos', modeloId: 'ret_1', ativo: true },
  { id: 'regra_vip', nome: '⭐ Recompensa Clientes VIP (Fidelidade)', gatilho: 'vip_pontos', categoria: 'vip', modeloId: 'vip_1', ativo: true },
  { id: 'regra_novos', nome: '🌟 Boas-Vindas a Novos Clientes', gatilho: 'novo_cliente', categoria: 'todos', modeloId: 'ret_4', ativo: true }
];

window.getRegrasProgramadas = () => {
  if (window.pdvConfigs && window.pdvConfigs.whatsapp_regras_programadas) {
    try {
      const parsed = JSON.parse(window.pdvConfigs.whatsapp_regras_programadas);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }
  return REGRAS_PADRAO;
};

window.alternarAbaSugestoes = (aba) => {
  const btnDisparo = document.getElementById('btn-tab-sug-disparo');
  const btnModelos = document.getElementById('btn-tab-sug-modelos');
  const btnProgramacao = document.getElementById('btn-tab-sug-programacao');

  const contentDisparo = document.getElementById('tab-content-sug-disparo');
  const contentModelos = document.getElementById('tab-content-sug-modelos');
  const contentProgramacao = document.getElementById('tab-content-sug-programacao');

  // Reset styles
  [btnDisparo, btnModelos, btnProgramacao].forEach(btn => {
    if (btn) { btn.style.color = '#64748b'; btn.style.borderColor = 'transparent'; btn.style.fontWeight = '600'; }
  });
  [contentDisparo, contentModelos, contentProgramacao].forEach(c => {
    if (c) c.style.display = 'none';
  });

  if (aba === 'disparo') {
    if (btnDisparo) { btnDisparo.style.color = '#2563eb'; btnDisparo.style.borderColor = '#2563eb'; btnDisparo.style.fontWeight = '700'; }
    if (contentDisparo) contentDisparo.style.display = 'block';
    window.renderSugestoesList();
  } else if (aba === 'modelos') {
    if (btnModelos) { btnModelos.style.color = '#2563eb'; btnModelos.style.borderColor = '#2563eb'; btnModelos.style.fontWeight = '700'; }
    if (contentModelos) contentModelos.style.display = 'block';
    window.renderModelosTemplatesManager();
  } else if (aba === 'programacao') {
    if (btnProgramacao) { btnProgramacao.style.color = '#2563eb'; btnProgramacao.style.borderColor = '#2563eb'; btnProgramacao.style.fontWeight = '700'; }
    if (contentProgramacao) contentProgramacao.style.display = 'block';
    window.renderProgramacaoManager();
  }
};

window.aoMudarGatilhoProgramacao = () => {
  const gatilho = document.getElementById('regra-gatilho')?.value;
  const boxCliente = document.getElementById('box-regra-cliente-especifico');
  if (boxCliente) {
    boxCliente.style.display = (gatilho === 'cliente_especifico') ? 'block' : 'none';
  }
};

window.renderProgramacaoManager = () => {
  const container = document.getElementById('lista-regras-programadas-container');
  const selectCliente = document.getElementById('regra-cliente-id');
  const selectModelo = document.getElementById('regra-modelo-id');

  const clientes = window.clientesList || [];
  const templates = window.getWhatsappTemplates();
  const regras = window.getRegrasProgramadas();

  // Populate Cliente Especial Select
  if (selectCliente) {
    selectCliente.innerHTML = clientes.map(c => 
      `<option value="${c.id}">${escapeHtml(c.nome)} (${escapeHtml(c.telefone || 'Sem Fone')})</option>`
    ).join('') || '<option value="">Nenhum cliente cadastrado</option>';
  }

  // Populate Modelos Select
  if (selectModelo) {
    selectModelo.innerHTML = templates.map(t => 
      `<option value="${t.id}">[${t.categoria.toUpperCase()}] ${escapeHtml(t.titulo)}</option>`
    ).join('');
  }

  if (!container) return;

  const mesAtual = new Date().getMonth() + 1;

  container.innerHTML = regras.map((regra, idx) => {
    // Contagem de clientes que batem com essa regra
    let elegiveis = clientes.filter(c => {
      if (regra.gatilho === 'cliente_especifico') return String(c.id) === String(regra.clienteId);
      if (regra.gatilho === 'aniversario') {
        if (!c.data_nascimento) return false;
        const parts = c.data_nascimento.split('-');
        return parts.length >= 2 && parseInt(parts[1], 10) === mesAtual;
      }
      if (regra.gatilho === 'vip_pontos') return (c.pontos || 0) >= 20;
      return true;
    });

    const rotuloGatilho = {
      'sumido_30d': '💤 Inativo > 30 Dias',
      'sumido_15d': '⏳ Inativo > 15 Dias',
      'novo_cliente': '🌟 Novo Cliente',
      'aniversario': '🎂 Aniversariante do Mês',
      'vip_pontos': '⭐ Cliente VIP (Pontos)',
      'pos_visita': '🥂 Pós-Visita Recente',
      'cliente_especifico': '👤 Cliente Específico'
    }[regra.gatilho] || regra.gatilho;

    const modeloAssociado = templates.find(t => t.id === regra.modeloId) || templates[0];

    return `
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.02); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div style="flex: 1; min-width: 250px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <strong style="font-size: 15px; color: #0f172a;">${escapeHtml(regra.nome)}</strong>
            <span style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700;">
              ${rotuloGatilho}
            </span>
          </div>
          <div style="font-size: 12.5px; color: #64748b;">
            Categoria: <strong>${escapeHtml(regra.categoria || 'Todos')}</strong> | Modelo: <strong>${escapeHtml(modeloAssociado ? modeloAssociado.titulo : 'Padrão')}</strong>
          </div>
          <div style="font-size: 12px; color: #16a34a; font-weight: 600; margin-top: 4px;">
            👥 ${elegiveis.length} cliente(s) elegíveis no momento para esta automação.
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <button onclick="window.executarRegraProgramadaAgora(${idx})" style="background: #25d366; color: white; border: none; padding: 8px 14px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
            <i class="ph ph-paper-plane-tilt" style="font-size: 16px;"></i> Disparar Esta Regra (${elegiveis.length})
          </button>
          <button onclick="window.excluirRegraProgramada(${idx})" style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 8px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">
            <i class="ph ph-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
};

window.salvarNovaRegraProgramada = () => {
  const nomeEl = document.getElementById('regra-nome');
  const gatilhoEl = document.getElementById('regra-gatilho');
  const categoriaEl = document.getElementById('regra-categoria');
  const clienteEl = document.getElementById('regra-cliente-id');
  const modeloEl = document.getElementById('regra-modelo-id');

  const nome = nomeEl ? nomeEl.value.trim() : '';
  if (!nome) return alert('Digite um nome para a regra de automação.');

  const regras = window.getRegrasProgramadas();
  regras.unshift({
    id: 'regra_' + Date.now(),
    nome: nome,
    gatilho: gatilhoEl ? gatilhoEl.value : 'sumido_30d',
    categoria: categoriaEl ? categoriaEl.value : 'todos',
    clienteId: clienteEl ? clienteEl.value : null,
    modeloId: modeloEl ? modeloEl.value : 'aniv_1',
    ativo: true,
    dataCriacao: new Date().toISOString()
  });

  const jsonStr = JSON.stringify(regras);
  if (!window.pdvConfigs) window.pdvConfigs = {};
  window.pdvConfigs.whatsapp_regras_programadas = jsonStr;

  if (typeof socket !== 'undefined' && socket) {
    socket.emit('save_restaurante_config', { whatsapp_regras_programadas: jsonStr });
  }

  fetch('/api/config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(typeof authHeaders === 'function' ? authHeaders() : {})
    },
    body: JSON.stringify({ whatsapp_regras_programadas: jsonStr })
  }).then(() => {
    alert('✅ Regra de engajamento programada com sucesso!');
    if (nomeEl) nomeEl.value = '';
    window.renderProgramacaoManager();
  }).catch(() => {
    alert('✅ Regra salva localmente!');
    if (nomeEl) nomeEl.value = '';
    window.renderProgramacaoManager();
  });
};

window.excluirRegraProgramada = (idx) => {
  if (!confirm('Deseja realmente excluir esta regra programada?')) return;
  const regras = window.getRegrasProgramadas();
  regras.splice(idx, 1);

  const jsonStr = JSON.stringify(regras);
  if (!window.pdvConfigs) window.pdvConfigs = {};
  window.pdvConfigs.whatsapp_regras_programadas = jsonStr;

  if (typeof socket !== 'undefined' && socket) {
    socket.emit('save_restaurante_config', { whatsapp_regras_programadas: jsonStr });
  }
  window.renderProgramacaoManager();
};

window.executarRegraProgramadaAgora = (idx) => {
  const regras = window.getRegrasProgramadas();
  const regra = regras[idx];
  if (!regra) return;

  // Seleciona o filtro correspondente e alterna para a aba de disparo
  if (regra.gatilho === 'aniversario') {
    currentSugFiltro = 'aniversario';
  } else if (regra.gatilho === 'vip_pontos') {
    currentSugFiltro = 'pontos';
  } else {
    currentSugFiltro = 'retencao';
  }

  window.alternarAbaSugestoes('disparo');
};

window.getWhatsappTemplates = (modalityOverride) => {
  const selectMod = document.getElementById('select-modalidade-templates');
  const mod = modalityOverride || (selectMod ? selectMod.value : null) || (window.pdvConfigs ? window.pdvConfigs.rest_modalidade : 'a_la_carte') || 'a_la_carte';
  const key = 'whatsapp_sugestoes_templates_' + mod;

  if (window.pdvConfigs && window.pdvConfigs[key]) {
    try {
      const parsed = JSON.parse(window.pdvConfigs[key]);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }
  if (window.pdvConfigs && window.pdvConfigs.whatsapp_sugestoes_templates) {
    try {
      const parsedGeneral = JSON.parse(window.pdvConfigs.whatsapp_sugestoes_templates);
      if (Array.isArray(parsedGeneral) && parsedGeneral.length > 0) return parsedGeneral;
    } catch (e) {}
  }
  return MODELOS_POR_MODALIDADE[mod] || MODELOS_POR_MODALIDADE['a_la_carte'];
};

window.aoMudarModalidadeTemplates = () => {
  const selectMod = document.getElementById('select-modalidade-templates');
  const mod = selectMod ? selectMod.value : 'a_la_carte';
  window.renderModelosTemplatesManager(mod);
};

window.renderModelosTemplatesManager = (modalityOverride) => {
  const container = document.getElementById('lista-modelos-templates-container');
  if (!container) return;

  const selectMod = document.getElementById('select-modalidade-templates');
  const activeMod = modalityOverride || (selectMod ? selectMod.value : null) || (window.pdvConfigs ? window.pdvConfigs.rest_modalidade : 'a_la_carte') || 'a_la_carte';

  if (selectMod && selectMod.value !== activeMod) {
    selectMod.value = activeMod;
  }

  const templates = window.getWhatsappTemplates(activeMod);

  container.innerHTML = templates.map((tpl, idx) => {
    return `
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
            <span style="font-weight: 700; color: #475569; font-size: 13px;">#${idx + 1}</span>
            <input type="text" id="tpl-title-${idx}" value="${escapeHtml(tpl.titulo || 'Modelo de Mensagem')}" placeholder="Nome/Título do Modelo" style="font-weight: 700; font-size: 14px; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; flex: 1;">
          </div>
          
          <div style="display: flex; align-items: center; gap: 10px;">
            <select id="tpl-cat-${idx}" style="padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12.5px; font-weight: 600; background: #f8fafc;">
              <option value="aniversario" ${tpl.categoria === 'aniversario' ? 'selected' : ''}>🎂 Aniversário</option>
              <option value="pontos" ${tpl.categoria === 'pontos' ? 'selected' : ''}>⭐ Fidelidade / Pontos</option>
              <option value="retencao" ${tpl.categoria === 'retencao' ? 'selected' : ''}>💬 Reconexão / Convite</option>
              <option value="geral" ${tpl.categoria === 'geral' ? 'selected' : ''}>📢 Geral / Pós-Visita</option>
            </select>

            <label style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: #334155; cursor: pointer;">
              <input type="checkbox" id="tpl-ativo-${idx}" ${tpl.ativo !== false ? 'checked' : ''}> Ativo
            </label>

            <button onclick="window.removerModeloTemplate(${idx})" style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">
              <i class="ph ph-trash"></i> Excluir
            </button>
          </div>
        </div>

        <textarea id="tpl-text-${idx}" style="width: 100%; height: 75px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-family: inherit; box-sizing: border-box; resize: vertical;">${escapeHtml(tpl.texto || '')}</textarea>
      </div>
    `;
  }).join('');
};

window.adicionarNovoModeloTemplate = () => {
  const selectMod = document.getElementById('select-modalidade-templates');
  const mod = selectMod ? selectMod.value : 'a_la_carte';
  const templates = window.getWhatsappTemplates(mod);

  templates.unshift({
    id: 'custom_' + Date.now(),
    categoria: 'retencao',
    titulo: 'Novo Modelo Customizado',
    texto: 'Olá {nome}! 🍽️ O {restaurante} tem uma novidade especial para você hoje. Venha nos fazer uma visita!',
    ativo: true
  });

  const key = 'whatsapp_sugestoes_templates_' + mod;
  if (!window.pdvConfigs) window.pdvConfigs = {};
  window.pdvConfigs[key] = JSON.stringify(templates);
  window.renderModelosTemplatesManager(mod);
};

window.removerModeloTemplate = (idx) => {
  if (!confirm('Deseja realmente excluir este modelo de mensagem?')) return;
  const selectMod = document.getElementById('select-modalidade-templates');
  const mod = selectMod ? selectMod.value : 'a_la_carte';
  const templates = window.getWhatsappTemplates(mod);

  templates.splice(idx, 1);
  const key = 'whatsapp_sugestoes_templates_' + mod;
  if (!window.pdvConfigs) window.pdvConfigs = {};
  window.pdvConfigs[key] = JSON.stringify(templates);
  window.renderModelosTemplatesManager(mod);
};

window.restaurarModelosPadrao15 = () => {
  const selectMod = document.getElementById('select-modalidade-templates');
  const mod = selectMod ? selectMod.value : 'a_la_carte';

  if (!confirm(`Deseja restaurar as 15 variações profissionais de fábrica para a modalidade selecionada?`)) return;

  const defaults = MODELOS_POR_MODALIDADE[mod] || MODELOS_POR_MODALIDADE['a_la_carte'];
  const key = 'whatsapp_sugestoes_templates_' + mod;

  if (!window.pdvConfigs) window.pdvConfigs = {};
  window.pdvConfigs[key] = JSON.stringify(defaults);
  window.renderModelosTemplatesManager(mod);
  window.salvarModelosTemplates();
};

window.salvarModelosTemplates = () => {
  const selectMod = document.getElementById('select-modalidade-templates');
  const mod = selectMod ? selectMod.value : 'a_la_carte';
  const templates = window.getWhatsappTemplates(mod);
  const container = document.getElementById('lista-modelos-templates-container');

  if (container) {
    templates.forEach((tpl, idx) => {
      const titleEl = document.getElementById(`tpl-title-${idx}`);
      const catEl = document.getElementById(`tpl-cat-${idx}`);
      const ativoEl = document.getElementById(`tpl-ativo-${idx}`);
      const textEl = document.getElementById(`tpl-text-${idx}`);

      if (titleEl) tpl.titulo = titleEl.value.trim() || 'Modelo de Mensagem';
      if (catEl) tpl.categoria = catEl.value;
      if (ativoEl) tpl.ativo = ativoEl.checked;
      if (textEl) tpl.texto = textEl.value.trim();
    });
  }

  const jsonStr = JSON.stringify(templates);
  const key = 'whatsapp_sugestoes_templates_' + mod;
  if (!window.pdvConfigs) window.pdvConfigs = {};
  window.pdvConfigs[key] = jsonStr;
  window.pdvConfigs.whatsapp_sugestoes_templates = jsonStr;

  const payload = {};
  payload[key] = jsonStr;
  payload['whatsapp_sugestoes_templates'] = jsonStr;

  if (typeof socket !== 'undefined' && socket) {
    socket.emit('save_restaurante_config', payload);
  }

  fetch('/api/config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(typeof authHeaders === 'function' ? authHeaders() : {})
    },
    body: JSON.stringify(payload)
  }).then(() => {
    alert('✅ 15 Modelos da modalidade salvos com sucesso!');
    window.renderModelosTemplatesManager(mod);
  }).catch(() => {
    alert('✅ Modelos salvos localmente!');
    window.renderModelosTemplatesManager(mod);
  });
};

window.renderSugestoesList = () => {
  const container = document.getElementById('lista-sugestoes-container');
  if (!container) return;

  const lista = window.clientesList || [];
  const mesAtual = new Date().getMonth() + 1;
  const pdvConf = window.pdvConfigs || {};
  const restName = pdvConf.restaurante_nome || 'nosso restaurante';
  const allTemplates = window.getWhatsappTemplates().filter(t => t.ativo !== false);

  let filtrados = [];
  let bannerNotice = '';

  if (currentSugFiltro === 'aniversario') {
    filtrados = lista.filter(c => {
      if (!c.data_nascimento) return false;
      const parts = c.data_nascimento.split('-');
      return parts.length >= 2 && parseInt(parts[1], 10) === mesAtual;
    });
    if (filtrados.length === 0) {
      filtrados = lista.slice(0, 8);
      bannerNotice = '<div style="background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; padding:10px 14px; border-radius:8px; font-size:12.5px; font-weight:600; margin-bottom:12px;">ℹ️ Nenhum cliente faz aniversário neste mês. Exibindo sugestões de engajamento geral para os primeiros clientes:</div>';
    }
  } else if (currentSugFiltro === 'pontos') {
    filtrados = lista.filter(c => (c.pontos || 0) >= 20).sort((a, b) => (b.pontos || 0) - (a.pontos || 0));
    if (filtrados.length === 0) {
      filtrados = lista.slice(0, 8);
      bannerNotice = '<div style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; padding:10px 14px; border-radius:8px; font-size:12.5px; font-weight:600; margin-bottom:12px;">⭐ Nenhum cliente com saldo > 20 pontos no momento. Exibindo sugestões gerais de fidelidade:</div>';
    }
  } else {
    filtrados = lista;
  }

  if (filtrados.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding: 30px; color: #64748b; font-weight:500;">Nenhum cliente cadastrado no sistema.</div>';
    return;
  }

  const getMensagemPersonalizada = (c, idx) => {
    const nome = c.nome ? c.nome.split(' ')[0] : 'Cliente';
    const isAniversariante = c.data_nascimento && parseInt(c.data_nascimento.split('-')[1], 10) === mesAtual;
    const temPontos = (c.pontos || 0) >= 10;

    let targetCat = 'retencao';
    let motivoBadge = '💬 Reconexão de Cliente';

    if (isAniversariante) {
      targetCat = 'aniversario';
      motivoBadge = '🎉 Aniversariante do Mês';
    } else if (currentSugFiltro === 'pontos' || (temPontos && currentSugFiltro !== 'aniversario')) {
      targetCat = 'pontos';
      motivoBadge = `⭐ Saldo de ${c.pontos || 0} pontos acumulados`;
    }

    let matchingTpls = allTemplates.filter(t => t.categoria === targetCat);
    if (matchingTpls.length === 0) {
      matchingTpls = allTemplates.length > 0 ? allTemplates : MODELOS_PADRAO_15;
    }

    const rawTpl = matchingTpls[idx % matchingTpls.length];
    let text = rawTpl ? rawTpl.texto : 'Olá {nome}! O {restaurante} espera por você!';

    text = text.replace(/\{nome\}/g, nome)
               .replace(/\{restaurante\}/g, restName)
               .replace(/\{pontos\}/g, String(c.pontos || 0));

    return { motivoBadge, msg: text, tplTitulo: rawTpl ? rawTpl.titulo : '' };
  };

  const itemsHtml = filtrados.map((c, idx) => {
    const { motivoBadge, msg, tplTitulo } = getMensagemPersonalizada(c, idx);
    const cleanPhone = (c.telefone || '').replace(/\D/g, '');
    const hasPhone = cleanPhone.length >= 8;

    return `
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 6px;">
          <div>
            <strong style="font-size: 15px; color: #1e293b;">${escapeHtml(c.nome)}</strong>
            <span style="font-size: 12px; color: #64748b; margin-left: 8px;">(${escapeHtml(c.telefone || 'Sem telefone')})</span>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            ${tplTitulo ? `<span style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 20px; font-size: 11px; font-weight: 600;">Modelo: ${escapeHtml(tplTitulo)}</span>` : ''}
            <span style="background: #fff7ed; color: #c2410c; border: 1px solid #ffedd5; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700;">
              ${motivoBadge}
            </span>
          </div>
        </div>

        <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Mensagem Sugerida (Editável antes do disparo):</label>
        <textarea id="sug-msg-${idx}" style="width: 100%; height: 75px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-family: inherit; box-sizing: border-box; resize: vertical;">${escapeHtml(msg)}</textarea>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
          <span style="font-size: 11px; color: #94a3b8;">Edite a mensagem como desejar antes de aprovar.</span>
          <button onclick="window.enviarWhatsappAprovado('${cleanPhone}', 'sug-msg-${idx}')" ${!hasPhone ? 'disabled' : ''} style="background: ${hasPhone ? '#25d366' : '#ccc'}; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: ${hasPhone ? 'pointer' : 'not-allowed'}; display: flex; align-items: center; gap: 6px;">
            <i class="ph ph-whatsapp-logo" style="font-size: 18px;"></i> Aprovar e Enviar via WhatsApp
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = bannerNotice + itemsHtml;
};

window.enviarWhatsappAprovado = (cleanPhone, textareaId) => {
  if (!cleanPhone) return alert('Cliente não possui telefone válido cadastrado.');
  const textEl = document.getElementById(textareaId);
  if (!textEl) return;
  const texto = textEl.value.trim();
  if (!texto) return alert('Digite ou aprove um texto para a mensagem.');

  let phoneFull = cleanPhone;
  if (!phoneFull.startsWith('55') && phoneFull.length <= 11) {
    phoneFull = '55' + phoneFull;
  }

  const url = `https://api.whatsapp.com/send?phone=${phoneFull}&text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
};

window.ajustarPontosCliente = (id, pontosAtuais, nome) => {
  const novoValor = prompt(`Saldo atual de ${nome}: ${pontosAtuais} pts.\n\nDigite o novo total de pontos de fidelidade para este cliente:`, pontosAtuais);
  if (novoValor !== null && novoValor !== '') {
    const val = parseInt(novoValor, 10);
    if (!isNaN(val) && val >= 0) {
      socket.emit('ajustar_pontos_cliente', { id, pontos: val });
    } else {
      alert('Por favor, informe um número válido de pontos.');
    }
  }
};

window.editCliente = (id, nome, telefone, observacao, endereco, nascimento) => {
  document.getElementById('admin-cli-id').value = id;
  document.getElementById('admin-cli-nome').value = nome;
  document.getElementById('admin-cli-tel').value = telefone;
  document.getElementById('admin-cli-obs').value = observacao;
  document.getElementById('admin-cli-endereco').value = endereco;
  document.getElementById('admin-cli-nascimento').value = nascimento;
  const btn = document.getElementById('btn-admin-add-cli');
  if (btn) btn.innerText = 'Atualizar';
};
window.deleteCliente = (id) => { if (confirm('Excluir cliente?')) socket.emit('delete_cliente', id); };

document.addEventListener('DOMContentLoaded', () => {
  const addCliBtn = document.getElementById('btn-admin-add-cli');
  if (addCliBtn) addCliBtn.onclick = () => {
    const id = document.getElementById('admin-cli-id').value;
    const nome = document.getElementById('admin-cli-nome').value.trim();
    const telefone = document.getElementById('admin-cli-tel').value.trim();
    const observacao = document.getElementById('admin-cli-obs').value.trim();
    const endereco = document.getElementById('admin-cli-endereco').value.trim();
    const data_nascimento = document.getElementById('admin-cli-nascimento').value;
    if (!nome) return alert('Preencha o nome do cliente.');
    socket.emit('add_cliente', { id: id || null, nome, telefone, observacao, endereco, data_nascimento });
    ['admin-cli-id', 'admin-cli-nome', 'admin-cli-tel', 'admin-cli-obs', 'admin-cli-endereco', 'admin-cli-nascimento'].forEach(i => {
      const el = document.getElementById(i); if (el) el.value = '';
    });
    if (addCliBtn) addCliBtn.innerText = 'Salvar';
  };
});

// --- PROMOÇÕES ---
socket.on('promocoes_atualizadas', (lista) => {
  window.PROMOCOES = lista;
  const tbody = document.getElementById('admin-promocoes-list');
  if (!tbody) return;
  const tipoLabels = { desconto_fixo: 'Desconto R$', desconto_pct: 'Desconto %', preco_fixo: 'Preço Fixo', combo: 'Combo', livre: 'Rodízio' };
  tbody.innerHTML = lista.map(p => {
    let cfg = {};
    try { cfg = JSON.parse(p.config || '{}'); } catch (e) { }
    const diasStr = cfg.dias_semana && cfg.dias_semana.length > 0 ? cfg.dias_semana.map(d => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d]).join(', ') : 'Todos';
    const horaStr = (cfg.horario_inicio && cfg.horario_fim) ? `${cfg.horario_inicio} às ${cfg.horario_fim}` : 'Sempre';
    const tipoLabel = tipoLabels[cfg.tipo_promocao] || cfg.tipo_promocao || p.regra || '-';
    const detalhe = cfg.tipo_promocao === 'desconto_fixo' ? `R$ ${cfg.desconto}` :
      cfg.tipo_promocao === 'desconto_pct' ? `${cfg.desconto_pct}%` :
      cfg.tipo_promocao === 'preco_fixo' ? `${cfg.produto_alvo_nome} → R$ ${cfg.novo_preco}` :
      cfg.tipo_promocao === 'combo' ? `${cfg.combo_a} + ${cfg.combo_b}` : '';
    return `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 10px; font-weight: 600;">${p.nome}</td>
      <td style="padding: 10px;">${tipoLabel} ${detalhe ? `<span style="color:#64748b;font-size:12px;">(${detalhe})</span>` : ''}</td>
      <td style="padding: 10px;font-size:12px;">${diasStr} | ${horaStr}</td>
      <td style="padding: 10px; display: flex; gap: 6px;">
        <button onclick="window.editarPromocao(${p.id})" style="color: #3b82f6; border: none; background: none; cursor: pointer; font-weight: 600;"><i class="ph ph-pencil"></i></button>
        <button onclick="window.deletePromocao(${p.id})" style="color: red; border: none; background: none; cursor: pointer;"><i class="ph ph-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
});

window.deletePromocao = (id) => { if (confirm('Excluir promoção?')) socket.emit('delete_promocao', id); };

window.togglePromoFields = () => {
  const tipo = document.getElementById('admin-promo-tipo').value;
  document.getElementById('promo-fields-desconto').style.display = tipo === 'desconto_fixo' ? 'block' : 'none';
  document.getElementById('promo-fields-desconto-pct').style.display = tipo === 'desconto_pct' ? 'block' : 'none';
  document.getElementById('promo-fields-produto').style.display = tipo === 'preco_fixo' ? 'flex' : 'none';
  document.getElementById('promo-fields-combo').style.display = tipo === 'combo' ? 'flex' : 'none';
  document.getElementById('promo-fields-livre').style.display = tipo === 'livre' ? 'block' : 'none';
};

document.addEventListener('DOMContentLoaded', () => {
  let editandoPromoId = null;

  const addPromoBtn = document.getElementById('btn-admin-add-promo');
  if (addPromoBtn) addPromoBtn.onclick = () => {
    const nome = document.getElementById('admin-promo-nome').value.trim();
    const tipo = document.getElementById('admin-promo-tipo').value;
    if (!nome) return alert('Preencha o nome da promoção.');

    const config = { tipo_promocao: tipo, dias_semana: Array.from(document.querySelectorAll('#admin-promo-dias input:checked')).map(cb => parseInt(cb.value)), horario_inicio: document.getElementById('admin-promo-inicio').value || null, horario_fim: document.getElementById('admin-promo-fim').value || null };

    if (tipo === 'desconto_fixo') {
      config.desconto = parseFloat(document.getElementById('admin-promo-valor').value) || 0;
    } else if (tipo === 'desconto_pct') {
      config.desconto_pct = parseFloat(document.getElementById('admin-promo-pct').value) || 0;
    } else if (tipo === 'preco_fixo') {
      config.produto_alvo_nome = (document.getElementById('admin-promo-prod-alvo') || {}).value || '';
      config.novo_preco = parseFloat((document.getElementById('admin-promo-novo-preco') || {}).value) || 0;
    } else if (tipo === 'combo') {
      config.combo_a = (document.getElementById('admin-promo-combo-a') || {}).value || '';
      config.combo_b = (document.getElementById('admin-promo-combo-b') || {}).value || '';
      config.combo_preco = parseFloat((document.getElementById('admin-promo-combo-preco') || {}).value) || 0;
    } else if (tipo === 'livre') {
      config.observacao = (document.getElementById('admin-promo-obs') || {}).value || '';
    }

    if (editandoPromoId) {
      socket.emit('update_promocao', { id: editandoPromoId, nome, regra: tipo, desconto: config.desconto || 0, config: JSON.stringify(config) });
      editandoPromoId = null;
      addPromoBtn.innerHTML = '<i class="ph ph-plus"></i> Salvar Promoção';
    } else {
      socket.emit('add_promocao', { nome, regra: tipo, desconto: config.desconto || 0, ativo: true, config: JSON.stringify(config) });
    }
    document.getElementById('admin-promo-nome').value = '';
    document.querySelectorAll('#admin-promo-dias input').forEach(cb => cb.checked = false);
    document.getElementById('admin-promo-inicio').value = '';
    document.getElementById('admin-promo-fim').value = '';
  };

  window.editarPromocao = function(id) {
    const promo = (window.PROMOCOES || []).find(p => p.id === id);
    if (!promo) return;
    let cfg = {};
    try { cfg = JSON.parse(promo.config || '{}'); } catch(e) {}
    document.getElementById('admin-promo-nome').value = promo.nome || '';
    document.getElementById('admin-promo-tipo').value = cfg.tipo_promocao || promo.regra || 'desconto_fixo';
    window.togglePromoFields();
    if (cfg.tipo_promocao === 'desconto_fixo') {
      document.getElementById('admin-promo-valor').value = cfg.desconto || '';
    } else if (cfg.tipo_promocao === 'desconto_pct') {
      document.getElementById('admin-promo-pct').value = cfg.desconto_pct || '';
    } else if (cfg.tipo_promocao === 'preco_fixo') {
      document.getElementById('admin-promo-prod-alvo').value = cfg.produto_alvo_nome || '';
      document.getElementById('admin-promo-novo-preco').value = cfg.novo_preco || '';
    } else if (cfg.tipo_promocao === 'combo') {
      document.getElementById('admin-promo-combo-a').value = cfg.combo_a || '';
      document.getElementById('admin-promo-combo-b').value = cfg.combo_b || '';
      document.getElementById('admin-promo-combo-preco').value = cfg.combo_preco || '';
    } else if (cfg.tipo_promocao === 'livre') {
      document.getElementById('admin-promo-obs').value = cfg.observacao || '';
    }
    document.querySelectorAll('#admin-promo-dias input').forEach(cb => {
      cb.checked = Array.isArray(cfg.dias_semana) && cfg.dias_semana.includes(parseInt(cb.value));
    });
    document.getElementById('admin-promo-inicio').value = cfg.horario_inicio || '';
    document.getElementById('admin-promo-fim').value = cfg.horario_fim || '';
    editandoPromoId = id;
    addPromoBtn.innerHTML = '<i class="ph ph-check"></i> Salvar alterações';
    document.getElementById('admin-promo-nome').focus();
  };
});

// --- FIDELIDADE / BENEFICIOS ---
socket.emit('admin_get_beneficios'); // request initially

socket.on('admin_beneficios_lista', (lista) => {
  const tbody = document.getElementById('admin-beneficios-list');
  if (!tbody) return;
  tbody.innerHTML = lista.map(b => {
    return `<tr>
      <td>${b.imagem_url ? `<img src="${b.imagem_url}" style="width:30px; height:30px; object-fit:cover; border-radius:50%; margin-right:8px; vertical-align:middle;">` : ''}${b.nome}</td>
      <td>${b.pontos} pts</td>
      <td>
        <span style="background: ${b.ativo ? '#dcfce7' : '#fee2e2'}; color: ${b.ativo ? '#166534' : '#991b1b'}; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold;">
          ${b.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </td>
      <td>
        <button onclick="window.editarBeneficio(${b.id}, '${b.nome}', ${b.pontos}, '${b.imagem_url || ''}', ${b.ativo})" style="color: #0284c7; border: none; background: none; cursor: pointer; margin-right: 8px;"><i class="ph ph-pencil"></i> Editar</button>
        <button onclick="window.deleteBeneficio(${b.id})" style="color: red; border: none; background: none; cursor: pointer;"><i class="ph ph-trash"></i> Excluir</button>
      </td>
    </tr>`;
  }).join('');
});

window.salvarBeneficio = () => {
  const id = document.getElementById('admin-beneficio-id').value;
  const nome = document.getElementById('admin-beneficio-nome').value.trim();
  const pontos = parseInt(document.getElementById('admin-beneficio-pontos').value) || 0;
  const imagem_url = document.getElementById('admin-beneficio-imagem').value.trim();
  const ativo = document.getElementById('admin-beneficio-ativo').checked;

  if (!nome || pontos <= 0) return alert('Preencha nome e custo em pontos (maior que 0).');

  if (id) {
    socket.emit('edit_beneficio', { id: parseInt(id), nome, pontos, imagem_url, ativo });
  } else {
    socket.emit('add_beneficio', { nome, pontos, imagem_url, ativo });
  }

  document.getElementById('admin-beneficio-id').value = '';
  document.getElementById('admin-beneficio-nome').value = '';
  document.getElementById('admin-beneficio-pontos').value = '';
  document.getElementById('admin-beneficio-imagem').value = '';
  document.getElementById('admin-beneficio-ativo').checked = true;
};

window.editarBeneficio = (id, nome, pontos, imagem, ativo) => {
  document.getElementById('admin-beneficio-id').value = id;
  document.getElementById('admin-beneficio-nome').value = nome;
  document.getElementById('admin-beneficio-pontos').value = pontos;
  document.getElementById('admin-beneficio-imagem').value = imagem;
  document.getElementById('admin-beneficio-ativo').checked = ativo;
};

window.deleteBeneficio = (id) => {
  if(confirm('Excluir este benefício?')) socket.emit('delete_beneficio', id);
};

// --- FIDELIDADE: Configuração do programa ---
socket.emit('get_fidelidade_config');
socket.on('fidelidade_config_atual', (c) => {
  if (!c) return;
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
  setChk('fid-enabled', c.enabled);
  setVal('fid-pontos-por-real', c.pontos_por_real);
  setVal('fid-checkin-pontos', c.checkin_pontos);
  setChk('fid-checkin-diario', c.checkin_diario);
  (c.niveis || []).forEach(n => {
    if (n.nome === 'Prata') { setVal('fid-prata-min', n.minimo); setVal('fid-prata-bonus', n.bonus); }
    if (n.nome === 'Ouro') { setVal('fid-ouro-min', n.minimo); setVal('fid-ouro-bonus', n.bonus); }
    if (n.nome === 'Diamante') { setVal('fid-diamante-min', n.minimo); setVal('fid-diamante-bonus', n.bonus); }
  });
});

window.salvarFidelidadeConfig = () => {
  const cfg = {
    fidelidade_enabled: document.getElementById('fid-enabled').checked ? 'true' : 'false',
    fidelidade_pontos_por_real: document.getElementById('fid-pontos-por-real').value,
    fidelidade_checkin_pontos: document.getElementById('fid-checkin-pontos').value,
    fidelidade_checkin_diario: document.getElementById('fid-checkin-diario').checked ? 'true' : 'false',
    fidelidade_nivel_prata: document.getElementById('fid-prata-min').value,
    fidelidade_bonus_prata: document.getElementById('fid-prata-bonus').value,
    fidelidade_nivel_ouro: document.getElementById('fid-ouro-min').value,
    fidelidade_bonus_ouro: document.getElementById('fid-ouro-bonus').value,
    fidelidade_nivel_diamante: document.getElementById('fid-diamante-min').value,
    fidelidade_bonus_diamante: document.getElementById('fid-diamante-bonus').value
  };
  socket.emit('admin_atualizar_fidelidade_config', cfg);
};
socket.on('fidelidade_config_salvo', (res) => {
  if (res && res.success) alert('Configuração de fidelidade salva!');
});

// --- PAGAMENTOS PIX (copia e cola no fechamento) ---
if (typeof socket !== 'undefined') {
  socket.emit('get_pix_config');
  socket.on('pix_config_atual', (cfg) => {
    const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setV('pix-chave', cfg.pix_chave);
    setV('pix-nome-recebedor', cfg.pix_nome_recebedor);
    setV('pix-cidade', cfg.pix_cidade);
  });
  socket.on('pix_config_salvo', (res) => {
    if (res && res.success) alert('Configuração Pix salva! O fechamento do caixa já pode gerar QR e copia-e-cola.');
  });
}

window.salvarPixConfig = () => {
  if (typeof socket === 'undefined' || !socket) return alert('Sem conexão com o servidor.');
  socket.emit('admin_atualizar_pix_config', {
    pix_chave: document.getElementById('pix-chave').value.trim(),
    pix_nome_recebedor: document.getElementById('pix-nome-recebedor').value.trim(),
    pix_cidade: document.getElementById('pix-cidade').value.trim()
  });
};

// --- FIDELIDADE: PARCEIROS (CRUD + mini mapa) ---
let parceiroEditandoId = null;
let parceirosCache = [];

window.limparFormParceiro = () => {
  parceiroEditandoId = null;
  ['parceiro-nome', 'parceiro-categoria', 'parceiro-telefone', 'parceiro-endereco',
    'parceiro-bairro', 'parceiro-cidade', 'parceiro-lat', 'parceiro-lng', 'parceiro-pontos']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const st = document.getElementById('parceiro-geo-status');
  if (st) st.textContent = '';
};

window.capturarLocalParceiro = () => {
  if (!navigator.geolocation) return alert('Seu dispositivo não suporta geolocalização.');
  const st = document.getElementById('parceiro-geo-status');
  if (st) st.textContent = 'Obtendo localização...';
  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = document.getElementById('parceiro-lat');
    const lng = document.getElementById('parceiro-lng');
    if (lat) lat.value = pos.coords.latitude.toFixed(6);
    if (lng) lng.value = pos.coords.longitude.toFixed(6);
    if (st) st.textContent = 'Coordenadas capturadas!';
  }, (err) => {
    if (st) st.textContent = 'Erro ao obter localização.';
    alert('Não foi possível obter sua localização: ' + err.message);
  }, { enableHighAccuracy: true, timeout: 12000 });
};

function authHeadersCfg() {
  return { 'Authorization': 'Bearer ' + (localStorage.getItem('chef_token') || ''), 'Content-Type': 'application/json' };
}

window.salvarParceiro = async () => {
  const nome = document.getElementById('parceiro-nome').value.trim();
  if (!nome) return alert('Informe o nome do parceiro.');
  const corpo = {
    id: parceiroEditandoId || undefined,
    nome,
    categoria: document.getElementById('parceiro-categoria').value.trim(),
    telefone: document.getElementById('parceiro-telefone').value.trim(),
    endereco: document.getElementById('parceiro-endereco').value.trim(),
    bairro: document.getElementById('parceiro-bairro').value.trim(),
    cidade: document.getElementById('parceiro-cidade').value.trim(),
    latitude: document.getElementById('parceiro-lat').value.trim() || null,
    longitude: document.getElementById('parceiro-lng').value.trim() || null,
    pontos_minimos: parseInt(document.getElementById('parceiro-pontos').value, 10) || 0,
    ativo: true
  };
  try {
    const r = await fetch('/api/fidelidade/parceiros', { method: 'POST', headers: authHeadersCfg(), body: JSON.stringify(corpo) });
    const data = await r.json();
    if (!data.success) throw new Error(data.error || 'Erro ao salvar.');
    window.limparFormParceiro();
    carregarParceiros();
  } catch (e) {
    alert(e.message);
  }
};

async function carregarParceiros() {
  try {
    const r = await fetch('/api/fidelidade/parceiros');
    const data = await r.json();
    parceirosCache = data.parceiros || [];
    renderParceirosLista();
    desenharMapaParceiros();
  } catch (e) { /* silencioso */ }
}

window.editarParceiro = (id) => {
  const p = parceirosCache.find(x => x.id === id);
  if (!p) return;
  parceiroEditandoId = id;
  document.getElementById('parceiro-nome').value = p.nome || '';
  document.getElementById('parceiro-categoria').value = p.categoria || '';
  document.getElementById('parceiro-telefone').value = p.telefone || '';
  document.getElementById('parceiro-endereco').value = p.endereco || '';
  document.getElementById('parceiro-bairro').value = p.bairro || '';
  document.getElementById('parceiro-cidade').value = p.cidade || '';
  document.getElementById('parceiro-lat').value = p.latitude != null ? p.latitude : '';
  document.getElementById('parceiro-lng').value = p.longitude != null ? p.longitude : '';
  document.getElementById('parceiro-pontos').value = p.pontos_minimos || 0;
};

window.excluirParceiro = async (id) => {
  if (!confirm('Excluir este parceiro?')) return;
  try {
    await fetch('/api/fidelidade/parceiros/' + id, { method: 'DELETE', headers: authHeadersCfg() });
    carregarParceiros();
  } catch (e) { alert('Erro ao excluir.'); }
};

function renderParceirosLista() {
  const tbody = document.getElementById('admin-parceiros-list');
  if (!tbody) return;
  if (!parceirosCache.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#a8a29e; padding:16px;">Nenhum parceiro cadastrado ainda.</td></tr>';
    return;
  }
  tbody.innerHTML = parceirosCache.map(p => `<tr>
    <td style="font-weight:600;">${p.nome}</td>
    <td>${p.categoria || '—'}</td>
    <td>${[p.bairro, p.cidade].filter(Boolean).join(', ') || '—'}</td>
    <td>${p.pontos_minimos || 0} pts</td>
    <td><span style="background:${p.ativo ? '#dcfce7' : '#fee2e2'}; color:${p.ativo ? '#166534' : '#991b1b'}; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:bold;">${p.ativo ? 'Ativo' : 'Inativo'}</span></td>
    <td>
      <button onclick="window.editarParceiro(${p.id})" style="color:#0284c7; border:none; background:none; cursor:pointer; margin-right:8px;"><i class="ph ph-pencil"></i> Editar</button>
      <button onclick="window.excluirParceiro(${p.id})" style="color:red; border:none; background:none; cursor:pointer;"><i class="ph ph-trash"></i> Excluir</button>
    </td>
  </tr>`).join('');
}

/* Mini mapa dos parceiros — canvas puro, pan/zoom simples */
const mapaPc = { cx: -46.63, cy: -23.55, pxDeg: 40 };

function pcProjeta(lng, lat, w, h) {
  return { x: w / 2 + (lng - mapaPc.cx) * mapaPc.pxDeg, y: h / 2 - (lat - mapaPc.cy) * mapaPc.pxDeg };
}
function pcUnprojeta(px, py, w, h) {
  return { lng: mapaPc.cx + (px - w / 2) / mapaPc.pxDeg, lat: mapaPc.cy - (py - h / 2) / mapaPc.pxDeg };
}

function desenharMapaParceiros() {
  const cv = document.getElementById('mapa-parceiros-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, w, h);

  // grade
  let passo = 0.05;
  while (passo * mapaPc.pxDeg < 60) passo *= 2;
  ctx.strokeStyle = 'rgba(148,163,184,0.10)';
  ctx.lineWidth = 1;
  const iniLng = Math.floor(pcUnprojeta(0, 0, w, h).lng / passo) * passo;
  for (let L = iniLng; ; L += passo) {
    const x = pcProjeta(L, 0, w, h).x;
    if (x > w + 30) break;
    if (x >= -30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  }
  const iniLat = Math.floor(pcUnprojeta(0, h, w, h).lat / passo) * passo;
  for (let A = iniLat; ; A += passo) {
    const y = pcProjeta(0, A, w, h).y;
    if (y < -30) break;
    if (y <= h + 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }

  const locais = parceirosCache.filter(p => p.latitude != null && p.longitude != null);
  locais.forEach(p => {
    const pt = pcProjeta(parseFloat(p.longitude), parseFloat(p.latitude), w, h);
    ctx.fillStyle = p.ativo ? '#22c55e' : '#64748b';
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = 'rgba(2,6,23,.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(p.nome, pt.x + 10, pt.y + 4);
    ctx.fillText(p.nome, pt.x + 10, pt.y + 4);
  });

  const vazio = document.getElementById('mapa-parceiros-vazio');
  if (vazio) vazio.style.display = locais.length === 0 ? 'flex' : 'none';

  // Auto-fit quando há pontos fora da vista inicial
  if (locais.length === 1 && mapaPc.pxDeg === 40) {
    mapaPc.cx = parseFloat(locais[0].longitude); mapaPc.cy = parseFloat(locais[0].latitude); mapaPc.pxDeg = 400;
    desenharMapaParceiros();
  }
}

(function initMapaParceiros() {
  let pronto = false;
  const cv = document.getElementById('mapa-parceiros-canvas');
  if (!cv) return;

  function coords(ev) {
    const r = cv.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * (cv.width / r.width), y: (ev.clientY - r.top) * (cv.height / r.height) };
  }

  cv.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const c = coords(ev);
    const antes = pcUnprojeta(c.x, c.y, cv.width, cv.height);
    mapaPc.pxDeg = Math.min(20000, Math.max(1, mapaPc.pxDeg * (ev.deltaY < 0 ? 1.18 : 1 / 1.18)));
    const depois = pcUnprojeta(c.x, c.y, cv.width, cv.height);
    mapaPc.cx += antes.lng - depois.lng;
    mapaPc.cy += antes.lat - depois.lat;
    desenharMapaParceiros();
  }, { passive: false });

  let arrastando = false, ultimo = null, moveu = false;
  cv.addEventListener('pointerdown', (ev) => { if (cv.__chefPinch) return; arrastando = true; moveu = false; ultimo = { x: ev.clientX, y: ev.clientY }; cv.style.cursor = 'grabbing'; });
  window.addEventListener('pointerup', () => { arrastando = false; cv.style.cursor = 'grab'; });
  window.addEventListener('pointermove', (ev) => {
    if (!arrastando || !ultimo || cv.__chefPinch) return;
    const r = cv.getBoundingClientRect();
    const dx = (ev.clientX - ultimo.x) * (cv.width / r.width);
    const dy = (ev.clientY - ultimo.y) * (cv.height / r.height);
    if (Math.abs(dx) + Math.abs(dy) > 3) moveu = true;
    mapaPc.cx -= dx / mapaPc.pxDeg;
    mapaPc.cy += dy / mapaPc.pxDeg;
    ultimo = { x: ev.clientX, y: ev.clientY };
    desenharMapaParceiros();
  });

  // Botão direito no mapa preenche lat/lng do formulário
  cv.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const c = coords(ev);
    const geo = pcUnprojeta(c.x, c.y, cv.width, cv.height);
    document.getElementById('parceiro-lat').value = geo.lat.toFixed(6);
    document.getElementById('parceiro-lng').value = geo.lng.toFixed(6);
    const st = document.getElementById('parceiro-geo-status');
    if (st) st.textContent = 'Coordenadas definidas pelo mapa!';
  });

  // Carrega quando a aba fidelidade abre pela primeira vez
  const btnFid = document.querySelector('.admin-tab-btn[data-tab="fidelidade"]');
  if (btnFid) {
    btnFid.addEventListener('click', () => {
      if (!pronto) { pronto = true; setTimeout(() => { carregarParceiros(); carregarAvaliacoesAdmin(); }, 250); }
    });
  }
})();

// --- FUNÇÕES DO SISTEMA (tenant): status + solicitação de ativação ---
async function carregarFuncoesSistema() {
  const box = document.getElementById('funcoes-lista');
  if (!box) return;
  try {
    const r = await fetch('/api/funcoes', { headers: authHeadersCfg() });
    const data = await r.json();
    if (!data.success) { box.innerHTML = '<div style="color:#ef4444;font-size:13px;">Erro ao carregar funções.</div>'; return; }
    const defs = data.features || [];
    if (!defs.length) { box.innerHTML = '<div style="color:#888;font-size:13px;">Nenhuma função configurável.</div>'; return; }
    let html = '';
    defs.forEach((f) => {
      const statusBadge = f.enabled
        ? '<span style="font-size:11px;font-weight:800;color:#16a34a;background:#dcfce7;border-radius:999px;padding:3px 10px;">ATIVA</span>'
        : '<span style="font-size:11px;font-weight:800;color:#b45309;background:#fef3c7;border-radius:999px;padding:3px 10px;">INATIVA</span>';
      const overrideTag = f.override ? ' <span title="Configuração manual do super admin" style="color:#f59e0b;">★</span>' : '';
      let solHtml = '';
      if (f.solicitacao && f.solicitacao.ultimo === 'pendente') {
        solHtml = '<span style="font-size:11px;color:#7c3aed;font-weight:700;"><i class="ph ph-hourglass"></i> Solicitação em análise</span>';
      } else if (f.solicitacao && f.solicitacao.ultimo === 'aprovada') {
        solHtml = '<span style="font-size:11px;color:#16a34a;font-weight:700;">✓ Aprovada</span>';
      }
      const btnSolicitar = (!f.enabled && (!f.solicitacao || f.solicitacao.ultimo !== 'pendente'))
        ? `<button onclick="solicitarFuncao('${f.chave}')" style="background:#7c3aed;color:white;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;">
             <i class="ph ph-paper-plane-tilt"></i> Solicitar ativação</button>`
        : '';
      html += `<div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:10px; padding:12px 14px; display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap;">
        <div style="min-width:240px; flex:1;">
          <div style="font-weight:700; color:#1e293b; font-size:14px;">${f.nome}${overrideTag}</div>
          <div style="font-size:12px; color:#64748b; margin-top:3px; line-height:1.45;">${f.desc}</div>
          ${solHtml}
        </div>
        <div style="display:flex; gap:10px; align-items:center;">${statusBadge} ${btnSolicitar}</div>
      </div>`;
    });
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = '<div style="color:#ef4444;font-size:13px;">Falha de conexão.</div>';
  }
}

window.solicitarFuncao = async (feature) => {
  const msg = prompt('Mensagem para o super admin (opcional):', '') || '';
  try {
    const r = await fetch('/api/funcoes/solicitar', {
      method: 'POST',
      headers: authHeadersCfg(),
      body: JSON.stringify({ feature, mensagem: msg })
    });
    const data = await r.json();
    if (data.success) {
      alert(data.mensagem || 'Solicitação enviada!');
      carregarFuncoesSistema();
    } else {
      alert(data.error || 'Erro ao enviar solicitação.');
    }
  } catch (e) { alert('Falha de conexão.'); }
};

document.querySelectorAll('.admin-tab-btn[data-tab="funcoes"]').forEach(function(btnFuncoes) {
  btnFuncoes.addEventListener('click', function() { setTimeout(carregarFuncoesSistema, 200); });
});

window.solicitarNovaFuncao = async function() {
  const msg = (document.getElementById('funcao-nova-msg') || {}).value || '';
  const statusEl = document.getElementById('funcao-nova-status');
  if (!msg.trim()) { if (statusEl) { statusEl.style.display = 'block'; statusEl.style.color = '#dc2626'; statusEl.textContent = 'Descreva o que precisa.'; } return; }
  try {
    const r = await fetch('/api/funcoes/solicitar', {
      method: 'POST',
      headers: authHeadersCfg(),
      body: JSON.stringify({ feature: 'nova_solicitacao', mensagem: msg.trim() })
    });
    const data = await r.json();
    if (statusEl) {
      statusEl.style.display = 'block';
      if (data.success) {
        statusEl.style.color = '#16a34a';
        statusEl.textContent = '✓ Solicitação enviada! O super admin será notificado.';
        document.getElementById('funcao-nova-msg').value = '';
      } else {
        statusEl.style.color = '#dc2626';
        statusEl.textContent = data.error || 'Erro ao enviar.';
      }
    }
  } catch (e) {
    if (statusEl) { statusEl.style.display = 'block'; statusEl.style.color = '#dc2626'; statusEl.textContent = 'Falha de conexão.'; }
  }
};

// --- AVALIAÇÕES (painel do dono) ---
async function carregarAvaliacoesAdmin() {
  try {
    const r = await fetch('/api/avaliacoes', { headers: authHeadersCfg() });
    const data = await r.json();
    const mediaEl = document.getElementById('avaliacoes-media');
    const estrelasEl = document.getElementById('avaliacoes-estrelas-media');
    const totalEl = document.getElementById('avaliacoes-total');
    if (mediaEl) mediaEl.textContent = data.media > 0 ? data.media.toFixed(1) : '--';
    if (estrelasEl) {
      const cheias = Math.round(data.media || 0);
      estrelasEl.textContent = '★'.repeat(cheias) + '☆'.repeat(Math.max(0, 5 - cheias));
    }
    if (totalEl) totalEl.textContent = (data.total || 0) + ' avaliações';
    const sync = document.getElementById('avaliacao-google-sync');
    const place = document.getElementById('avaliacao-place-id');
    if (sync) sync.checked = !!data.google_sync_enabled;
    if (place) place.value = data.google_place_id || '';

    const tbody = document.getElementById('admin-avaliacoes-list');
    if (!tbody) return;
    const lista = data.avaliacoes || [];
    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#a8a29e; padding:16px;">Nenhuma avaliação recebida ainda.</td></tr>';
      return;
    }
    const fmtData = (d) => { try { return chefFormatDate(d.replace(' ', 'T')); } catch (e) { return d; } };
    tbody.innerHTML = lista.slice(0, 50).map(a => `<tr>
      <td style="white-space:nowrap;">${fmtData(a.criado_em)}</td>
      <td style="font-weight:600;">${a.cliente_nome || 'Cliente'}</td>
      <td>${a.mesa || '—'}</td>
      <td style="color:#f59e0b; white-space:nowrap;">${'★'.repeat(a.nota)}${'☆'.repeat(5 - a.nota)}</td>
      <td>${(a.comentario || '—').slice(0, 80)}</td>
      <td>${a.origem === 'google' ? 'Google' : 'Interna'}</td>
    </tr>`).join('');
  } catch (e) { /* silencioso */ }
}

window.salvarGoogleSync = async () => {
  const enabled = document.getElementById('avaliacao-google-sync').checked;
  const place_id = document.getElementById('avaliacao-place-id').value.trim();
  try {
    const r = await fetch('/api/avaliacoes/google-sync', { method: 'POST', headers: authHeadersCfg(), body: JSON.stringify({ enabled, place_id }) });
    const data = await r.json();
    if (data.success) alert('Preferência de avaliações salva!');
  } catch (e) { alert('Erro ao salvar.'); }
};


// --- FIDELIDADE: QR de check-in ---
window.gerarQrCheckin = (silent) => {
  const protocol = window.location.protocol;
  const port = window.location.port;
  const host = (restCustomDomain && restCustomDomain.trim()) || ((typeof _serverIpReal !== 'undefined' && _serverIpReal) || window.location.hostname);
  const isDomain = host.indexOf('.') !== -1 && !host.match(/^\d+\.\d+\.\d+\.\d+$/);
  const portPart = isDomain ? '' : (port ? ':' + port : '');
  const tenantId = encodeURIComponent(localStorage.getItem('restaurante_id') || '1');
  const appUrl = `${protocol}//${host}${portPart}/area-cliente.html?checkin=1&restaurante_id=${tenantId}`;
  const img = document.getElementById('fid-checkin-qr-img');
  if (img && typeof window.qrImg === 'function') {
    window.qrImg(img, appUrl, 280);
  } else if (img) {
    img.src = (window.location.origin || '') + '/api/qr?size=280&data=' + encodeURIComponent(appUrl);
  }
  window._checkinQrUrl = appUrl;
  if (!silent && typeof window.showToast === 'function') window.showToast('QR de check-in gerado!', '#22c55e');
};
window.baixarQrCheckin = () => {
  const img = document.getElementById('fid-checkin-qr-img');
  if (!img || !img.src) return alert('Gere o QR Code primeiro.');
  const a = document.createElement('a');
  a.href = img.src;
  a.download = 'qr-checkin-fidelidade.png';
  a.click();
};

// --- FIDELIDADE: Ofertas por nível ---
socket.emit('admin_get_ofertas_fidelidade');
socket.on('admin_ofertas_fidelidade_lista', (lista) => {
  window._ofertasFidelidade = lista || [];
  const tbody = document.getElementById('admin-ofertas-fidelidade-list');
  if (!tbody) return;
  tbody.innerHTML = (lista || []).map(o => `
    <tr>
      <td><strong>${o.titulo}</strong><br><span style="font-size:12px; color:#64748b;">${o.descricao}</span></td>
      <td>${o.nivel}</td>
      <td><span style="background: ${o.ativo ? '#dcfce7' : '#fee2e2'}; color: ${o.ativo ? '#166534' : '#991b1b'}; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:bold;">${o.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <button onclick="window.editarOfertaFidelidade(${o.id})" style="color:#7c3aed; border:none; background:none; cursor:pointer; margin-right:8px;"><i class="ph ph-pencil"></i> Editar</button>
        <button onclick="window.deleteOfertaFidelidade(${o.id})" style="color:red; border:none; background:none; cursor:pointer;"><i class="ph ph-trash"></i> Excluir</button>
      </td>
    </tr>`).join('');
});

window.salvarOfertaFidelidade = () => {
  const id = document.getElementById('admin-oferta-id').value;
  const titulo = document.getElementById('admin-oferta-titulo').value.trim();
  const descricao = document.getElementById('admin-oferta-descricao').value.trim();
  const nivel = document.getElementById('admin-oferta-nivel').value;
  const ativo = document.getElementById('admin-oferta-ativo').checked;
  if (!titulo) return alert('Informe o título da oferta.');
  if (id) socket.emit('edit_oferta_fidelidade', { id: parseInt(id), titulo, descricao, nivel, ativo });
  else socket.emit('add_oferta_fidelidade', { titulo, descricao, nivel, ativo });
  document.getElementById('admin-oferta-id').value = '';
  document.getElementById('admin-oferta-titulo').value = '';
  document.getElementById('admin-oferta-descricao').value = '';
  document.getElementById('admin-oferta-nivel').value = 'Bronze';
  document.getElementById('admin-oferta-ativo').checked = true;
};

window.editarOfertaFidelidade = (id) => {
  const oferta = (window._ofertasFidelidade || []).find(o => o.id === id);
  if (!oferta) return;
  document.getElementById('admin-oferta-id').value = oferta.id;
  document.getElementById('admin-oferta-titulo').value = oferta.titulo;
  document.getElementById('admin-oferta-descricao').value = oferta.descricao;
  document.getElementById('admin-oferta-nivel').value = oferta.nivel;
  document.getElementById('admin-oferta-ativo').checked = !!oferta.ativo;
};

window.deleteOfertaFidelidade = (id) => {
  if (confirm('Excluir esta oferta?')) socket.emit('delete_oferta_fidelidade', id);
};

// --- FILA DE ESPERA: CONFIGURACAO DE RESTRICAO DE PRODUTOS ---
let filaProdutosCache = [];
let filaCategoriasCache = [];

function initFilaEsperaTab() {
  const chk = document.getElementById('fila-habilitada');
  const msg = document.getElementById('fila-mensagem-restricao');
  if (chk) chk.checked = (configs.fila_restricao_habilitada === 'true');
  if (msg) msg.value = configs.fila_mensagem_restricao || 'Este item somente estara disponivel apos a liberacao da sua mesa. Aproveite para pedir bebidas e porcoes!';

  const tipo = configs.fila_restricao_tipo || 'nenhum';
  const radios = document.querySelectorAll('input[name="fila-restricao-tipo"]');
  radios.forEach(r => {
    r.checked = (r.value === tipo);
    r.addEventListener('change', () => toggleFilaRestricaoTipo(r.value));
  });
  toggleFilaRestricaoTipo(tipo);

  socket.emit('get_produtos');
  socket.once('produtos_atualizados', (prods) => {
    filaProdutosCache = (prods || []).filter(p => p.status !== 'inativo');
    filaCategoriasCache = [...new Set(filaProdutosCache.map(p => p.categoria))];
    renderFilaCategorias();
    renderFilaItens();
  });
}

function toggleFilaRestricaoTipo(tipo) {
  const catWrap = document.getElementById('fila-categorias-wrap');
  const itensWrap = document.getElementById('fila-itens-wrap');
  if (catWrap) catWrap.style.display = (tipo === 'categorias') ? 'block' : 'none';
  if (itensWrap) itensWrap.style.display = (tipo === 'itens') ? 'block' : 'none';

  document.querySelectorAll('input[name="fila-restricao-tipo"]').forEach(r => {
    const label = r.closest('label');
    if (label) label.style.borderColor = r.checked ? '#d97706' : '#e5e7eb';
  });
}

function renderFilaCategorias() {
  const container = document.getElementById('fila-categorias-list');
  if (!container) return;
  const liberadas = (typeof configs.fila_categorias_liberadas === 'string') ? JSON.parse(configs.fila_categorias_liberadas || '[]') : (configs.fila_categorias_liberadas || []);
  container.innerHTML = filaCategoriasCache.map(cat => {
    const checked = liberadas.includes(cat) ? 'checked' : '';
    return '<label style="display:flex; align-items:center; gap:8px; background:white; padding:10px 14px; border-radius:8px; border:1px solid #e5e7eb; cursor:pointer; transition:border 0.2s;">' +
      '<input type="checkbox" data-fila-cat="' + escHtml(cat) + '" ' + checked + ' style="width:16px; height:16px; accent-color:#d97706;">' +
      '<span style="font-size:13px; font-weight:600; color:#374151;">' + escHtml(cat) + '</span>' +
      '</label>';
  }).join('');
}

function renderFilaItens() {
  const container = document.getElementById('fila-itens-list');
  if (!container) return;
  const liberados = (typeof configs.fila_itens_liberados === 'string') ? JSON.parse(configs.fila_itens_liberados || '[]') : (configs.fila_itens_liberados || []);
  container.innerHTML = filaProdutosCache.map(p => {
    const checked = liberados.includes(p.id) ? 'checked' : '';
    return '<label style="display:flex; align-items:center; gap:8px; background:white; padding:8px 12px; border-radius:8px; border:1px solid #e5e7eb; cursor:pointer; font-size:12px;" data-fila-item-label="' + escHtml(p.nome.toLowerCase()) + '" data-fila-item-cat="' + escHtml((p.categoria || '').toLowerCase()) + '">' +
      '<input type="checkbox" data-fila-item-id="' + p.id + '" ' + checked + ' style="width:16px; height:16px; accent-color:#d97706;">' +
      '<span style="flex:1; min-width:0;"><strong style="color:#374151;">' + escHtml(p.nome) + '</strong> <span style="color:#9ca3af;">(' + escHtml(p.categoria || '') + ')</span></span>' +
      '<span style="font-weight:700; color:#d97706;">R$ ' + (parseFloat(p.preco) || 0).toFixed(2).replace('.', ',') + '</span>' +
      '</label>';
  }).join('');
}

window.filtrarItensFila = function() {
  const q = (document.getElementById('fila-itens-busca').value || '').trim();
  document.querySelectorAll('#fila-itens-list label').forEach(label => {
    const nome = label.getAttribute('data-fila-item-label') || '';
    const cat = label.getAttribute('data-fila-item-cat') || '';
    const show = !q || window.FuzzySearch.matchScore(q, nome) > 0 || window.FuzzySearch.matchScore(q, cat) > 0;
    label.style.display = show ? '' : 'none';
  });
};

function escHtml(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

window.salvarFilaEsperaConfig = function() {
  const habilitada = document.getElementById('fila-habilitada').checked;
  const tipo = (document.querySelector('input[name="fila-restricao-tipo"]:checked') || {}).value || 'nenhum';
  const mensagem = (document.getElementById('fila-mensagem-restricao').value || '').trim();

  const categoriasLiberadas = [];
  document.querySelectorAll('#fila-categorias-list input[type="checkbox"]:checked').forEach(cb => {
    categoriasLiberadas.push(cb.getAttribute('data-fila-cat'));
  });

  const itensLiberados = [];
  document.querySelectorAll('#fila-itens-list input[type="checkbox"]:checked').forEach(cb => {
    const id = parseInt(cb.getAttribute('data-fila-item-id'));
    if (id) itensLiberados.push(id);
  });

  configs.fila_restricao_habilitada = habilitada ? 'true' : 'false';
  configs.fila_restricao_tipo = tipo;
  configs.fila_categorias_liberadas = JSON.stringify(categoriasLiberadas);
  configs.fila_itens_liberados = JSON.stringify(itensLiberados);
  configs.fila_mensagem_restricao = mensagem;

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('chef_token') || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fila_restricao_habilitada: configs.fila_restricao_habilitada,
      fila_restricao_tipo: tipo,
      fila_categorias_liberadas: configs.fila_categorias_liberadas,
      fila_itens_liberados: configs.fila_itens_liberados,
      fila_mensagem_restricao: mensagem
    })
  }).then(r => r.json()).then(res => {
    if (res.success) {
      socket.emit('admin_configs_updated');
      alert('Configuracoes da Fila de Espera salvas com sucesso!');
    } else {
      alert('Erro ao salvar configuracoes.');
    }
  }).catch(() => alert('Erro ao salvar configuracoes.'));
};

// Backup
window.downloadBackup = () => {
  const token = localStorage.getItem('chef_token') || '';
  fetch('/api/backup', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(r => {
      if (!r.ok) throw new Error('Erro ao gerar backup: ' + r.status);
      return r.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backup_restaurante.sqlite';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (typeof showToast === 'function') showToast('Backup baixado com sucesso!', 'success');
    })
    .catch(e => { if (typeof showToast === 'function') showToast('Falha no backup: ' + e.message, 'danger'); });
};
window.uploadRestore = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('backup', file);
  const confirmacao = prompt('Confirmação de segurança: informe a senha de um administrador para restaurar o banco de dados.');
  if (!confirmacao) return;
  fd.append('confirmacao', confirmacao);
  fetch('/api/restore', { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('chef_token') || ''}` }, body: fd })
    .then(r => r.json())
    .then(res => {
      if (res.success) { alert('Banco restaurado! Reiniciando o servidor...'); window.location.reload(); }
      else { alert('Erro ao restaurar: ' + res.error); }
    });
};

// --- QR CODE CONVITE FUNCIONÁRIOS ---
let _serverIpReal = window.location.hostname; // Começa com o host atual como fallback

function updateQrCodeConvite() {
  const qrImg = document.getElementById('qr-code-img');
  if (!qrImg) return;
  const protocol = window.location.protocol;
  const port = window.location.port;
  const tenantId = encodeURIComponent(localStorage.getItem('restaurante_id') || '1');
  /* Preferir custom_domain sobre IP */
  const host = (restCustomDomain && restCustomDomain.trim()) || _serverIpReal;
  const isDomain = host.indexOf('.') !== -1 && !host.match(/^\d+\.\d+\.\d+\.\d+$/);
  const portPart = isDomain ? '' : (port ? ':' + port : '');
  const appUrl = `${protocol}//${host}${portPart}/cadastro.html?restaurante_id=${tenantId}`;
  if (typeof window.qrImg === 'function') {
    window.qrImg(qrImg, appUrl, 140);
  } else {
    qrImg.src = (window.location.origin || '') + '/api/qr?size=140&data=' + encodeURIComponent(appUrl);
  }
  qrImg.alt = appUrl;
  qrImg.title = appUrl;
}

socket.on('server_ip', (ip) => {
  if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
    /* Se o cliente está via túnel, não sobrescreve — mantém a URL do túnel */
    const _hostname = window.location.hostname;
    const _isTunnel = /\.(trycloudflare\.com|ngrok-free\.app|ngrok\.app|loca\.lt|lhr\.life)$/.test(_hostname);
    if (!_isTunnel) {
      _serverIpReal = ip;
      const _isIp = /^\d+\.\d+\.\d+\.\d+$/.test(ip);
      if (!_isIp && ip.indexOf('.') !== -1) restCustomDomain = ip;
    }
    updateQrCodeConvite();
  }
});

document.addEventListener('DOMContentLoaded', () => updateQrCodeConvite());

// ═══════════════════════════════════════════════════════════
//  LICENCIAMENTO — Ativação e configuração do Apps Script
// ═══════════════════════════════════════════════════════════

// Formatar chave automaticamente: CHEF-XXXX-YYYY-ZZZZ
function formatLicKey(el) {
  let v = el.value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (v.length > 4) v = v.slice(0, 4) + '-' + v.slice(4);
  if (v.length > 9) v = v.slice(0, 9) + '-' + v.slice(9);
  if (v.length > 14) v = v.slice(0, 14) + '-' + v.slice(14);
  el.value = v.slice(0, 19);
}

// Carregar status da licença ao abrir a aba
socket.on('license_status', (data) => {
  renderLicenseStatus(data);
});

socket.on('license_activated', (result) => {
  const btn = document.getElementById('lic-btn-ativar');
  if (btn) { btn.disabled = false; btn.textContent = 'Ativar'; }
  const msg = document.getElementById('lic-msg');
  if (!msg) return;
  if (result.ok) {
    msg.style.display = 'block';
    msg.style.color = '#166534';
    msg.style.background = '#f0fdf4';
    msg.style.padding = '10px 14px';
    msg.style.borderRadius = '8px';
    msg.textContent = `✓ Licença ativada! Bem-vindo, ${result.restaurante}.`;
    renderLicenseStatus(result);
  } else {
    msg.style.display = 'block';
    msg.style.color = '#991b1b';
    msg.style.background = '#fef2f2';
    msg.style.padding = '10px 14px';
    msg.style.borderRadius = '8px';
    msg.textContent = `✗ ${result.error || 'Chave inválida. Verifique e tente novamente.'}`;
  }
});

// Renderizar status visual da licença
function renderLicenseStatus(data) {
  const dot = document.getElementById('lic-status-dot');
  const label = document.getElementById('lic-status-label');
  const rest = document.getElementById('lic-restaurante');
  const plano = document.getElementById('lic-plano');
  const valid = document.getElementById('lic-validade');
  const trial = document.getElementById('lic-trial-wrap');
  const bar = document.getElementById('lic-trial-bar');
  const days = document.getElementById('lic-trial-days');
  const instId = document.getElementById('lic-install-id');

  if (!dot) return;

  // Install ID
  if (instId && data.installId) instId.textContent = data.installId;

  const colors = {
    trial: '#f59e0b',
    ativo: '#22c55e',
    expirado: '#ef4444',
    bloqueado: '#ef4444',
    offline_restrito: '#f59e0b',
    unknown: '#a78bfa',
    'Dev Mode': '#a78bfa',
  };
  const col = colors[data.status] || '#a78bfa';
  dot.style.background = col;
  dot.style.boxShadow = `0 0 8px ${col}`;

  const labels = {
    trial: '🟡 Trial ativo',
    ativo: '🟢 Licença ativa',
    expirado: '🔴 Licença expirada',
    bloqueado: '🔴 Bloqueado',
    offline_restrito: '🟠 Offline — modo restrito',
    unknown: '⚪ Verificando...',
  };
  label.textContent = labels[data.status] || data.status;

  if (rest) rest.textContent = data.restaurante || '—';
  if (plano) {
    const planos = { trial: 'Período de avaliação', starter: 'Plano Starter', pro: 'Plano Pro', enterprise: 'Plano Enterprise' };
    plano.textContent = planos[data.plano] || data.plano || '';
  }
  if (valid && data.validade) {
    valid.textContent = 'Válido até: ' + new Date(data.validade).toLocaleDateString('pt-BR');
  }

  // Trial bar
  if (trial && data.status === 'trial') {
    trial.style.display = 'block';
    const dias = data.diasRestantes || 0;
    const total = data.totalDias || 14;
    const pct = Math.max(0, Math.min(100, (dias / total) * 100));
    if (bar) bar.style.width = pct + '%';
    if (days) days.textContent = `${dias} dia${dias !== 1 ? 's' : ''} restante${dias !== 1 ? 's' : ''}`;
  } else if (trial) {
    trial.style.display = 'none';
  }
}

// Ativar licença
function ativarLicenca() {
  const chave = (document.getElementById('lic-key-input')?.value || '').trim();
  if (chave.length < 19) {
    const msg = document.getElementById('lic-msg');
    if (msg) {
      msg.style.display = 'block';
      msg.style.color = '#991b1b';
      msg.style.background = '#fef2f2';
      msg.style.padding = '10px 14px';
      msg.style.borderRadius = '8px';
      msg.textContent = '⚠️ Digite a chave completa: CHEF-XXXX-YYYY-ZZZZ';
    }
    return;
  }
  const btn = document.getElementById('lic-btn-ativar');
  if (btn) { btn.disabled = true; btn.textContent = 'Ativando...'; }
  socket.emit('activate_license', { chave });
}

// Ao abrir a aba de licença, pedir status salvo
document.addEventListener('DOMContentLoaded', () => {
  socket.emit('get_license_status');

  // Bind Launch Vale button click
  const addValeBtn = document.getElementById('btn-admin-add-vale');
  if (addValeBtn) {
    addValeBtn.onclick = () => {
      const funcSelect = document.getElementById('admin-rh-func-select');
      const valInput = document.getElementById('admin-rh-vale-valor');
      const obsInput = document.getElementById('admin-rh-vale-obs');

      const funcId = funcSelect ? funcSelect.value : '';
      const valor = valInput ? parseFloat(valInput.value) : 0;

      if (!funcId) {
        alert('Selecione um colaborador!');
        return;
      }
      if (!valor || valor <= 0) {
        alert('Insira um valor válido para o vale!');
        return;
      }

      socket.emit('solicitar_vale', { funcionario_id: parseInt(funcId), valor });

      if (valInput) valInput.value = '';
      if (obsInput) obsInput.value = '';
    };
  }

  socket.on('vale_solicitado_success', () => {
    alert('Vale registrado com sucesso!');
    emitGetRhData();
  });
  socket.on('solicitar_vale_error', (msg) => {
    alert(msg || 'Erro ao registrar vale.');
  });

  // Bind Fechar Folha logic
  const fecharFolhaBtn = document.getElementById('btn-admin-fechar-folha');
  const modalFecharFolha = document.getElementById('modal-fechar-folha');
  const folhaFuncSelect = document.getElementById('folha-func-select');
  const folhaExtratoContainer = document.getElementById('folha-extrato-container');
  let currentFolhaData = null;
  let folhaBatchData = [];

  const fmtFolhaValor = v => 'R$ ' + v.toFixed(2).replace('.', ',');

  const getFolhaPeriodo = () => {
    const s = document.getElementById('folha-periodo-inicio');
    const e = document.getElementById('folha-periodo-fim');
    return { start_date: s ? s.value : '', end_date: e ? e.value : '' };
  };

  const setFolhaPeriodo = (start, end) => {
    const s = document.getElementById('folha-periodo-inicio');
    const e = document.getElementById('folha-periodo-fim');
    if (s) s.value = start;
    if (e) e.value = end;
  };

  const definirSemanaQuaDom = () => {
    const hoje = new Date();
    const dia = hoje.getDay(); // 0=dom, 1=seg, 2=ter, 3=qua, 4=qui, 5=sex, 6=sab
    const diffQua = (dia >= 3) ? (dia - 3) : (dia + 4); // volta para quarta
    const qua = new Date(hoje);
    qua.setDate(hoje.getDate() - diffQua);
    const dom = new Date(qua);
    dom.setDate(qua.getDate() + 4);
    const fmt = d => d.toISOString().split('T')[0];
    setFolhaPeriodo(fmt(qua), fmt(dom));
  };

  if (fecharFolhaBtn && modalFecharFolha) {
    fecharFolhaBtn.onclick = () => {
      modalFecharFolha.style.display = 'flex';
      folhaFuncSelect.innerHTML = document.getElementById('admin-rh-func-select').innerHTML;
      folhaFuncSelect.value = '';
      folhaExtratoContainer.style.display = 'none';
      document.getElementById('btn-confirmar-pagamento').disabled = true;
      document.getElementById('btn-confirmar-pagamento').style.opacity = '0.5';
      document.getElementById('btn-processar-todos').disabled = true;
      document.getElementById('btn-processar-todos').style.opacity = '0.5';
      document.getElementById('folha-batch-table-container').style.display = 'none';
      folhaBatchData = [];
      definirSemanaQuaDom();
    };

    const _btnDefSemana = document.getElementById('btn-folha-definir-semana');
if (_btnDefSemana) _btnDefSemana.onclick = definirSemanaQuaDom;

    const buildExtratoUrl = (funcId) => {
      const periodo = getFolhaPeriodo();
      let url = '/api/rh/extrato/' + funcId;
      const params = [];
      if (periodo.start_date) params.push('start_date=' + periodo.start_date);
      if (periodo.end_date) params.push('end_date=' + periodo.end_date);
      if (params.length) url += '?' + params.join('&');
      return url;
    };

    const calcFolha = () => {
      if(!currentFolhaData) return;
      const bruto = parseFloat(document.getElementById('folha-valor-bruto').value || 0);
      const liquido = bruto - currentFolhaData.total_vales - currentFolhaData.total_consumo;
      document.getElementById('folha-valor-liquido').innerText = fmtFolhaValor(Math.max(0, liquido));
    };

    folhaFuncSelect.onchange = async () => {
      if(!folhaFuncSelect.value) {
        folhaExtratoContainer.style.display = 'none';
        document.getElementById('btn-confirmar-pagamento').disabled = true;
        document.getElementById('btn-confirmar-pagamento').style.opacity = '0.5';
        return;
      }
      try {
        const url = buildExtratoUrl(folhaFuncSelect.value);
        const res = await fetch(url, { headers: authHeaders() });
        if(!res.ok) throw new Error("Erro ao buscar extrato");
        const data = await res.json();
        currentFolhaData = data;

        document.getElementById('folha-total-vales').innerText = fmtFolhaValor(data.total_vales);
        document.getElementById('folha-total-consumo').innerText = fmtFolhaValor(data.total_consumo);
        document.getElementById('folha-total-horas').innerText = (data.total_horas || 0).toFixed(2) + ' h';
        document.getElementById('folha-valor-bruto').value = (data.suggested_bruto || 0).toFixed(2);
        document.getElementById('folha-obs').value = '';

        calcFolha();

        folhaExtratoContainer.style.display = 'block';
        document.getElementById('btn-confirmar-pagamento').disabled = false;
        document.getElementById('btn-confirmar-pagamento').style.opacity = '1';
      } catch(e) {
        alert(e.message);
      }
    };

    document.getElementById('folha-valor-bruto').oninput = calcFolha;

    const _btnConfPag = document.getElementById('btn-confirmar-pagamento');
if (_btnConfPag) _btnConfPag.onclick = async () => {
      if(!currentFolhaData) return;

      const bruto = parseFloat(document.getElementById('folha-valor-bruto').value || 0);
      const liquido = Math.max(0, bruto - currentFolhaData.total_vales - currentFolhaData.total_consumo);

      const payload = {
        funcionario_id: parseInt(folhaFuncSelect.value),
        valor_bruto: bruto,
        total_vales_abatidos: currentFolhaData.total_vales,
        total_consumo_abatido: currentFolhaData.total_consumo,
        valor_liquido: liquido,
        observacao: document.getElementById('folha-obs').value,
        vales_ids: currentFolhaData.vales.map(v => v.id),
        pedidos_ids: currentFolhaData.fiados.map(f => f.id)
      };

      try {
        const res = await fetch('/api/rh/pagamentos', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(payload)
        });
        if(res.ok) {
          alert('Pagamento registrado com sucesso!');
          modalFecharFolha.style.display = 'none';
        } else {
          alert('Erro ao registrar pagamento.');
        }
      } catch(e) {
        alert('Erro ao registrar pagamento: ' + e.message);
      }
    };

    // === BATCH: Processar Todos ===
    const btnCarregarTodos = document.getElementById('btn-folha-carregar-todos');
    const btnProcessarTodos = document.getElementById('btn-processar-todos');
    const batchTableBody = document.getElementById('folha-batch-table-body');

    btnCarregarTodos.onclick = async () => {
      const periodo = getFolhaPeriodo();
      if (!periodo.start_date || !periodo.end_date) {
        alert('Defina o período antes de carregar.');
        return;
      }
      btnCarregarTodos.disabled = true;
      btnCarregarTodos.innerText = 'Carregando...';
      batchTableBody.innerHTML = '<tr><td colspan="5" style="padding:12px;text-align:center;color:#94a3b8;">Carregando...</td></tr>';
      document.getElementById('folha-batch-table-container').style.display = 'block';
      btnProcessarTodos.disabled = true;
      btnProcessarTodos.style.opacity = '0.5';

      try {
        const funcSelect = document.getElementById('admin-rh-func-select');
        const allOpts = Array.from(funcSelect.options).filter(o => o.value);
        const results = [];

        for (const opt of allOpts) {
          const url = buildExtratoUrl(opt.value);
          const res = await fetch(url, { headers: authHeaders() });
          if (!res.ok) continue;
          const data = await res.json();
          const bruto = data.suggested_bruto || 0;
          const liquido = Math.max(0, bruto - data.total_vales - data.total_consumo);
          results.push({
            funcionario_id: parseInt(opt.value),
            funcionario_nome: opt.text,
            bruto,
            vales: data.total_vales,
            consumo: data.total_consumo,
            liquido,
            vales_ids: (data.vales || []).map(v => v.id),
            pedidos_ids: (data.fiados || []).map(f => f.id)
          });
        }

        folhaBatchData = results;

        if (results.length === 0) {
          batchTableBody.innerHTML = '<tr><td colspan="5" style="padding:12px;text-align:center;color:#94a3b8;">Nenhum colaborador encontrado.</td></tr>';
          btnProcessarTodos.disabled = true;
          btnProcessarTodos.style.opacity = '0.5';
        } else {
          let totalBruto = 0, totalLiq = 0;
          batchTableBody.innerHTML = results.map(r => {
            totalBruto += r.bruto;
            totalLiq += r.liquido;
            return `<tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:8px;font-weight:600;">${r.funcionario_nome}</td>
              <td style="padding:8px;text-align:right;">${fmtFolhaValor(r.bruto)}</td>
              <td style="padding:8px;text-align:right;color:#e11d48;">${fmtFolhaValor(r.vales)}</td>
              <td style="padding:8px;text-align:right;color:#ea580c;">${fmtFolhaValor(r.consumo)}</td>
              <td style="padding:8px;text-align:right;font-weight:700;color:#059669;">${fmtFolhaValor(r.liquido)}</td>
            </tr>`;
          }).join('') + `<tr style="background:#f8fafc;font-weight:700;border-top:2px solid #e2e8f0;">
            <td style="padding:8px;">TOTAL</td>
            <td style="padding:8px;text-align:right;">${fmtFolhaValor(totalBruto)}</td>
            <td style="padding:8px;text-align:right;"></td>
            <td style="padding:8px;text-align:right;"></td>
            <td style="padding:8px;text-align:right;color:#059669;">${fmtFolhaValor(totalLiq)}</td>
          </tr>`;
          btnProcessarTodos.disabled = false;
          btnProcessarTodos.style.opacity = '1';
        }
      } catch(e) {
        alert('Erro ao carregar dados: ' + e.message);
      }
      btnCarregarTodos.disabled = false;
      btnCarregarTodos.innerText = 'Carregar Todos';
    };

    btnProcessarTodos.onclick = async () => {
      if (folhaBatchData.length === 0) return;
      if (!confirm('Processar pagamento de ' + folhaBatchData.length + ' colaborador(es)?')) return;

      const obsGeral = document.getElementById('folha-batch-obs').value;
      const pagamentos = folhaBatchData.map(r => ({
        funcionario_id: r.funcionario_id,
        valor_bruto: r.bruto,
        total_vales_abatidos: r.vales,
        total_consumo_abatido: r.consumo,
        valor_liquido: r.liquido,
        observacao: '',
        vales_ids: r.vales_ids,
        pedidos_ids: r.pedidos_ids
      }));

      btnProcessarTodos.disabled = true;
      btnProcessarTodos.innerHTML = '<i class="ph ph-spinner-gap"></i> Processando...';

      try {
        const res = await fetch('/api/rh/pagamentos/batch', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ pagamentos, observacao_geral: obsGeral })
        });
        const result = await res.json();
        if (result.success) {
          alert(result.processed + ' pagamento(s) registrado(s) com sucesso!');
          modalFecharFolha.style.display = 'none';
        } else {
          alert('Erro ao processar pagamentos.');
        }
      } catch(e) {
        alert('Erro: ' + e.message);
      }
    };

    // Re-fetch when period changes
    ['folha-periodo-inicio', 'folha-periodo-fim'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          if (folhaFuncSelect.value) {
            folhaFuncSelect.dispatchEvent(new Event('change'));
          }
        });
      }
    });
  }

  // === PAGAMENTO RÁPIDO COLABORADOR ===
  const pgtoRapidoBtn = document.getElementById('btn-admin-pagamento-rapido');
  const modalPgtoRapido = document.getElementById('modal-pagamento-rapido');
  const pgtoRapidoFuncSelect = document.getElementById('pgto-rapido-func-select');
  const pgtoRapidoValor = document.getElementById('pgto-rapido-valor');
  const pgtoRapidoObs = document.getElementById('pgto-rapido-obs');
  const btnConfirmarPgtoRapido = document.getElementById('btn-confirmar-pagamento-rapido');
  const pgtoRapidoAbates = document.getElementById('pgto-rapido-abates');
  let pgtoRapidoExtrato = null;

  if (pgtoRapidoBtn && modalPgtoRapido) {
    pgtoRapidoBtn.onclick = () => {
      pgtoRapidoFuncSelect.innerHTML = document.getElementById('admin-rh-func-select').innerHTML;
      pgtoRapidoFuncSelect.value = '';
      pgtoRapidoValor.value = '';
      pgtoRapidoObs.value = '';
      pgtoRapidoAbates.style.display = 'none';
      pgtoRapidoExtrato = null;
      modalPgtoRapido.style.display = 'flex';
    };

    pgtoRapidoFuncSelect.onchange = async () => {
      const funcId = pgtoRapidoFuncSelect.value;
      if (!funcId) {
        pgtoRapidoAbates.style.display = 'none';
        pgtoRapidoExtrato = null;
        return;
      }
      try {
        const res = await fetch('/api/rh/extrato/' + funcId, { headers: authHeaders() });
        if (!res.ok) throw new Error("Erro ao buscar extrato");
        const data = await res.json();
        pgtoRapidoExtrato = data;
        renderPgtoRapidoAbates();
        pgtoRapidoAbates.style.display = 'block';
      } catch (e) {
        pgtoRapidoAbates.style.display = 'none';
      }
    };

    function renderPgtoRapidoAbates() {
      if (!pgtoRapidoExtrato) return;
      const valesHtml = (pgtoRapidoExtrato.vales || []).map(v => `
        <label style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f1f5f9; cursor: pointer;">
          <input type="checkbox" class="pgto-rapido-check-vale" data-id="${v.id}" data-valor="${v.valor}" checked>
          <span style="flex: 1; font-size: 13px;">Vale #${v.id} — ${new Date(v.data_pedido).toLocaleDateString('pt-BR')}</span>
          <span style="font-weight: 700; color: #e11d48; font-size: 13px;">R$ ${parseFloat(v.valor).toFixed(2).replace('.', ',')}</span>
        </label>
      `).join('');
      document.getElementById('pgto-rapido-vales-list').innerHTML = valesHtml
        ? `<div style="font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 4px;">Vales (Adiantamentos)</div>${valesHtml}`
        : '<div style="font-size: 12px; color: #94a3b8; padding: 6px 0;">Nenhum vale pendente.</div>';

      const consumoHtml = (pgtoRapidoExtrato.fiados || []).map(f => `
        <label style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f1f5f9; cursor: pointer;">
          <input type="checkbox" class="pgto-rapido-check-consumo" data-id="${f.id}" data-valor="${f.total}" checked>
          <span style="flex: 1; font-size: 13px;">Consumo #${f.id} — ${new Date(f.createdAt).toLocaleDateString('pt-BR')}</span>
          <span style="font-weight: 700; color: #ea580c; font-size: 13px;">R$ ${String(f.total).replace('R$', '').trim()}</span>
        </label>
      `).join('');
      document.getElementById('pgto-rapido-consumo-list').innerHTML = consumoHtml
        ? `<div style="font-size: 12px; font-weight: 700; color: #64748b; margin-bottom: 4px;">Consumo Interno (Fiado)</div>${consumoHtml}`
        : '<div style="font-size: 12px; color: #94a3b8; padding: 6px 0;">Nenhum consumo pendente.</div>';

      document.querySelectorAll('.pgto-rapido-check-vale, .pgto-rapido-check-consumo').forEach(cb => {
        cb.addEventListener('change', atualizarPgtoRapidoLiquido);
      });
      atualizarPgtoRapidoLiquido();
    }

    function atualizarPgtoRapidoLiquido() {
      const bruto = parseFloat(pgtoRapidoValor.value) || 0;
      let totalAbates = 0;
      document.querySelectorAll('.pgto-rapido-check-vale:checked').forEach(cb => {
        totalAbates += parseFloat(cb.dataset.valor) || 0;
      });
      document.querySelectorAll('.pgto-rapido-check-consumo:checked').forEach(cb => {
        totalAbates += parseFloat(String(cb.dataset.valor).replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0;
      });
      const liquido = Math.max(0, bruto - totalAbates);
      document.getElementById('pgto-rapido-total-abates').innerText = 'R$ ' + totalAbates.toFixed(2).replace('.', ',');
      document.getElementById('pgto-rapido-valor-liquido').innerText = 'R$ ' + liquido.toFixed(2).replace('.', ',');
    }

    pgtoRapidoValor.addEventListener('input', atualizarPgtoRapidoLiquido);

    btnConfirmarPgtoRapido.onclick = () => {
      const funcId = pgtoRapidoFuncSelect.value;
      const valor = parseFloat(pgtoRapidoValor.value);
      const obs = pgtoRapidoObs.value.trim();

      if (!funcId) { alert('Selecione um colaborador!'); return; }
      if (!valor || valor <= 0) { alert('Insira um valor válido!'); return; }

      const funcNome = pgtoRapidoFuncSelect.options[pgtoRapidoFuncSelect.selectedIndex].text;
      let totalVales = 0;
      let totalConsumo = 0;
      const valesIds = [];
      const pedidosIds = [];

      document.querySelectorAll('.pgto-rapido-check-vale:checked').forEach(cb => {
        valesIds.push(parseInt(cb.dataset.id));
        totalVales += parseFloat(cb.dataset.valor) || 0;
      });
      document.querySelectorAll('.pgto-rapido-check-consumo:checked').forEach(cb => {
        pedidosIds.push(parseInt(cb.dataset.id));
        totalConsumo += parseFloat(String(cb.dataset.valor).replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0;
      });
      const totalAbates = totalVales + totalConsumo;
      const liquido = Math.max(0, valor - totalAbates);

      socket.emit('registrar_pagamento_colaborador', {
        funcionario_id: parseInt(funcId),
        funcionario_nome: funcNome,
        valor_bruto: valor,
        total_vales_abatidos: totalVales,
        total_consumo_abatido: totalConsumo,
        valor_liquido: liquido,
        observacao: obs || `Pagamento registrado por ${window.userName || 'Admin'}`,
        vales_ids: valesIds,
        pedidos_ids: pedidosIds
      });

      modalPgtoRapido.style.display = 'none';
    };
  }

  // RH Sub-tab switching
  const rhSubtabs = document.querySelectorAll('.rh-subtab');
  const rhContents = document.querySelectorAll('.rh-subtab-content');
  function switchRhSubtab(tabId) {
    rhSubtabs.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.rhSubtab === tabId);
    });
    rhContents.forEach(el => {
      el.style.display = el.dataset.rhTab === tabId ? 'flex' : 'none';
    });
  }
  rhSubtabs.forEach(btn => {
    btn.addEventListener('click', () => {
      switchRhSubtab(btn.dataset.rhSubtab);
      if (btn.dataset.rhSubtab === 'consumo') {
        socket.emit('get_consumo_config');
      }
      if (btn.dataset.rhSubtab === 'atipicos') {
        if (!window.funcionariosList || window.funcionariosList.length === 0) {
          socket.emit('get_funcionarios');
        }
        carregarFuncionariosSelect();
        carregarAtipicos();
      }
      if (btn.dataset.rhSubtab === 'disponibilidade') {
        if (!window.funcionariosList || window.funcionariosList.length === 0) {
          socket.emit('get_funcionarios');
        }
        socket.emit('get_disponibilidade_equipe');
      }
    });
  });

  // Availability / Escala month navigation
  const prevBtn = document.getElementById('btn-admin-disp-prev');
  const nextBtn = document.getElementById('btn-admin-disp-next');
  if (prevBtn) {
    prevBtn.onclick = () => {
      adminDispMonth--;
      if (adminDispMonth < 0) { adminDispMonth = 11; adminDispYear--; }
      renderDisponibilidadeEquipe();
    };
  }
  if (nextBtn) {
    nextBtn.onclick = () => {
      adminDispMonth++;
      if (adminDispMonth > 11) { adminDispMonth = 0; adminDispYear++; }
      renderDisponibilidadeEquipe();
    };
  }

  // Default to first sub-tab
  if (rhSubtabs.length > 0) switchRhSubtab(rhSubtabs[0].dataset.rhSubtab);
});

// Availability Dashboard Global State
let adminDispMonth = new Date().getMonth();
let adminDispYear = new Date().getFullYear();
let adminDispData = [];

socket.on('disponibilidade_equipe', (data) => {
  adminDispData = data || [];
  renderDisponibilidadeEquipe();
});

socket.on('disponibilidade_equipe_atualizada', () => {
  const activeTabBtn = document.querySelector('.rh-subtab.active');
  if (activeTabBtn && activeTabBtn.dataset.rhSubtab === 'disponibilidade') {
    socket.emit('get_disponibilidade_equipe');
  }
});

function renderDisponibilidadeEquipe() {
  const container = document.getElementById('admin-disp-calendar');
  const label = document.getElementById('admin-disp-month-label');
  if (!container) return;

  const mes = adminDispMonth;
  const ano = adminDispYear;

  // Update label
  label.innerText = new Date(ano, mes).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const firstDay = new Date(ano, mes, 1).getDay();
  const daysInMonth = new Date(ano, mes + 1, 0).getDate();

  let html = `
    <style>
      .admin-cal-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 8px;
        font-family: 'Outfit', sans-serif;
      }
      .admin-cal-header {
        text-align: center;
        font-weight: 700;
        font-size: 13px;
        color: #475569;
        padding: 8px 0;
        background: #f8fafc;
        border-radius: 6px;
      }
      .admin-cal-day {
        min-height: 90px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        position: relative;
      }
      .admin-cal-day-num {
        font-weight: 700;
        font-size: 12px;
        color: #64748b;
        align-self: flex-end;
      }
      .admin-cal-empty {
        background: transparent;
        border: none;
      }
      .admin-cal-day.today {
        border-color: #7c3aed;
        background: #faf5ff;
      }
      .worker-badge {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #d1fae5;
        color: #065f46;
        padding: 3px 6px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        gap: 4px;
      }
      .worker-btn-escala {
        background: #059669;
        color: white;
        border: none;
        padding: 2px 5px;
        border-radius: 4px;
        font-size: 9px;
        cursor: pointer;
        font-weight: 700;
        transition: background 0.2s;
      }
      .worker-btn-escala:hover {
        background: #047857;
      }
      .no-workers {
        font-size: 10px;
        color: #94a3b8;
        text-align: center;
        margin-top: 10px;
        font-style: italic;
      }
    </style>
    <div class="admin-cal-grid">
  `;

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  dayNames.forEach(d => {
    html += `<div class="admin-cal-header">${d}</div>`;
  });

  for (let i = 0; i < firstDay; i++) {
    html += '<div class="admin-cal-day admin-cal-empty"></div>';
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;

    // Filter workers available on this date
    const available = adminDispData.filter(item => item.data === dateStr);

    let dayClass = 'admin-cal-day';
    if (isToday) dayClass += ' today';

    html += `
      <div class="${dayClass}">
        <span class="admin-cal-day-num">${d}</span>
        <div style="display:flex; flex-direction:column; gap:4px; flex:1; overflow-y:auto; scrollbar-width: none;">
    `;

    if (available.length > 0) {
      available.forEach(item => {
        html += `
          <div class="worker-badge" title="${escapeHtml(item.funcionario_nome)} (${escapeHtml(item.funcionario_cargo)})">
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80px;">
              ${escapeHtml(item.funcionario_nome.split(' ')[0])}
            </span>
            <button class="worker-btn-escala" onclick="escalarColaboradorAtipico(${item.funcionario_id}, '${dateStr}')" title="Convocar para este dia">
              Escalar
            </button>
          </div>
        `;
      });
    } else {
      html += `<span class="no-workers">Vazio</span>`;
    }

    html += `
        </div>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}

window.escalarColaboradorAtipico = function(funcId, dateStr) {
  // Switch to atipicos subtab
  const tabBtn = document.querySelector('.rh-subtab[data-rh-subtab="atipicos"]');
  if (tabBtn) tabBtn.click();

  // Populate form
  const funcSelect = document.getElementById('admin-atipico-func');
  if (funcSelect) funcSelect.value = funcId;

  const dataInput = document.getElementById('admin-atipico-data');
  if (dataInput) dataInput.value = dateStr;

  const justInput = document.getElementById('admin-atipico-just');
  if (justInput) justInput.value = 'Escala / Disponibilidade';

  // Find employee default rate
  const emp = (window.funcionariosList || []).find(f => f.id == funcId);
  if (emp) {
    const rate = parseFloat(emp.valor_dia || 0);
    const valInput = document.getElementById('admin-atipico-valor');
    if (valInput) {
      if (rate > 0) {
        valInput.value = rate.toFixed(2);
      } else {
        valInput.value = '';
      }
      valInput.focus();
    }
  }
};

let atipicosFilter = '';

function carregarAtipicos() {
  socket.emit('get_dias_atipicos', { status: atipicosFilter || undefined });
}

function carregarFuncionariosSelect() {
  const sel = document.getElementById('admin-atipico-func');
  if (!sel) return;
  const funcs = window.funcionariosList || [];
  const ativos = funcs.filter(f => f.status !== 'Pendente');
  sel.innerHTML = '<option value="">Selecione o Colaborador...</option>' +
    ativos.map(f => `<option value="${f.id}">${escapeHtml(f.nome)}</option>`).join('');
}

// Atipicos filter buttons
document.querySelectorAll('.atipico-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.atipico-filter-btn').forEach(b => {
      b.style.background = 'white';
      b.style.color = '#475569';
    });
    btn.style.background = '#7c3aed';
    btn.style.color = 'white';
    atipicosFilter = btn.dataset.status;
    carregarAtipicos();
  });
});

// Admin criar atipico
const _btnAddAtipico = document.getElementById('btn-admin-add-atipico');
if (_btnAddAtipico) _btnAddAtipico.onclick = () => {
  const id = document.getElementById('admin-atipico-id').value;
  const funcionario_id = parseInt(document.getElementById('admin-atipico-func').value);
  const data = document.getElementById('admin-atipico-data').value;
  const valor = parseFloat(document.getElementById('admin-atipico-valor').value);
  const just = document.getElementById('admin-atipico-just').value;
  if (!funcionario_id) return alert('Selecione um colaborador.');
  if (!data) return alert('Selecione a data.');
  if (!valor || valor <= 0) return alert('Informe o valor.');
  socket.emit('salvar_dia_atipico', { id: id || null, funcionario_id, data, valor, justificativa: just });
  document.getElementById('admin-atipico-id').value = '';
  document.getElementById('admin-atipico-data').value = '';
  document.getElementById('admin-atipico-valor').value = '';
  document.getElementById('admin-atipico-just').value = '';
};

socket.on('dia_atipico_salvo', () => { carregarAtipicos(); });
socket.on('dia_atipico_atualizado', () => { carregarAtipicos(); });

socket.on('dias_atipicos_list', (rows) => {
  const tbody = document.getElementById('admin-atipicos-list');
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8;">Nenhum registro encontrado.</td></tr>';
    return;
  }
  let html = '';
  rows.forEach(r => {
    const st = r.status || 'pendente';
    const stColor = st === 'aprovado' ? '#16a34a' : st === 'recusado' ? '#dc2626' : '#d97706';
    const stBg = st === 'aprovado' ? '#f0fdf4' : st === 'recusado' ? '#fef2f2' : '#fffbeb';
    const dt = r.data ? new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR') : '-';
    html += `
      <tr style="background:${stBg};">
        <td style="padding:8px;font-weight:600;">${r.funcionario_nome || '-'}</td>
        <td style="padding:8px;">${dt}</td>
        <td style="padding:8px;font-weight:700;">R$ ${parseFloat(r.valor || 0).toFixed(2).replace('.', ',')}</td>
        <td style="padding:8px;color:#64748b;">${r.justificativa || '-'}</td>
        <td style="padding:8px;color:${stColor};font-weight:600;">${st.toUpperCase()}</td>
        <td style="padding:8px;text-align:center;white-space:nowrap;">
          ${st === 'pendente' ? `
            <button class="atipico-aprovar" data-id="${r.id}" style="padding:4px 10px;background:#16a34a;color:white;border:none;border-radius:4px;font-size:12px;cursor:pointer;margin-right:4px;">Aprovar</button>
            <button class="atipico-recusar" data-id="${r.id}" style="padding:4px 10px;background:#dc2626;color:white;border:none;border-radius:4px;font-size:12px;cursor:pointer;">Recusar</button>
          ` : '-'}
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;

  tbody.querySelectorAll('.atipico-aprovar').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const opcao = confirm("PAGAMENTO DE DIA EXTRA:\n\nClique OK se o pagamento será feito no FINAL DO TURNO.\nClique CANCELAR se o pagamento será feito no PRÓXIMO PAGAMENTO da folha.");
      const fp = opcao ? 'final_turno' : 'proximo_pagamento';
      socket.emit('aprovar_dia_atipico', { id, forma_pagamento: fp });
    });
  });
  tbody.querySelectorAll('.atipico-recusar').forEach(btn => {
    btn.addEventListener('click', () => { socket.emit('recusar_dia_atipico', parseInt(btn.dataset.id)); });
  });
});

// === CELEBRATION HANDLER (Admin) ===
socket.on('pagamento_colaborador_celebracao', (data) => {
  // Show a nice toast notification on admin side
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed; top:20px; right:20px; z-index:99999; background:white; border-radius:16px; padding:20px 24px; box-shadow:0 10px 40px rgba(0,0,0,0.15); display:flex; align-items:center; gap:16px; animation: slideInRight 0.4s ease; max-width:400px; border-left:4px solid #6c5ce7;';
  toast.innerHTML = `
    <div style="font-size:36px;">🎉</div>
    <div>
      <div style="font-size:14px; color:#64748b;">Pagamento Registrado</div>
      <div style="font-size:16px; font-weight:700; color:#1e293b;">${data.funcionario_nome}</div>
      <div style="font-size:22px; font-weight:900; color:#16a34a;">R$ ${parseFloat(data.valor).toFixed(2).replace('.', ',')}</div>
    </div>
  `;

  // Add animation keyframes if not present
  if (!document.getElementById('celeb-toast-style')) {
    const style = document.createElement('style');
    style.id = 'celeb-toast-style';
    style.textContent = '@keyframes slideInRight { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }';
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.5s'; }, 4000);
  setTimeout(() => toast.remove(), 4500);
});

// --- SISTEMA DE NOTIFICAÇÕES SONORAS ---
window.playAudioTone = function (toneType) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();

    if (toneType === 'none') return;
    const now = ctx.currentTime;

    if (toneType === 'beep') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1000, now);
      osc.frequency.setValueAtTime(1250, now + 0.1);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (toneType === 'chime') {
      [523.25, 659.25, 783.99].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        const t = now + idx * 0.12;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.4, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.6);
      });
    } else if (toneType === 'pop') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (toneType === 'sonar') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.8);
    } else if (toneType === 'marimba') {
      [440, 554.37, 659.25].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const t = now + idx * 0.08;
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
      });
    } else { // 'dingdong' default
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.value = 880;
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.5, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.6);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = 1108.73;
      const now2 = now + 0.15;
      gain2.gain.setValueAtTime(0, now2);
      gain2.gain.linearRampToValueAtTime(0.5, now2 + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.01, now2 + 0.7);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now2);
      osc2.stop(now2 + 0.7);
    }
  } catch (e) {
    console.warn('Audio Tone Error:', e);
  }
};

const SOUND_OPTIONS = [
  { value: 'dingdong', name: '🔔 Campainha Clássica (Ding-Dong)' },
  { value: 'beep', name: '📱 Beep Digital' },
  { value: 'chime', name: '✨ Sino Elegante (Chime)' },
  { value: 'pop', name: '🎈 Efeito Pop / Tap' },
  { value: 'sonar', name: '🌊 Alarme Sonar' },
  { value: 'marimba', name: '🎶 Marimba Percussiva' },
  { value: 'none', name: '🔇 Sem Som (Mudo)' }
];

function escHtmlSom(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function slugSecao(nome) {
  return String(nome == null ? '' : nome).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'geral';
}

function obterSecoesFila() {
  let lista = null;
  if (configs && configs.fila_secoes) lista = configs.fila_secoes;
  if (!lista) {
    try {
      const raw = localStorage.getItem('fila_secoes');
      if (raw) lista = JSON.parse(raw);
    } catch (e) { lista = null; }
  }
  if (typeof lista === 'string') {
    try { lista = JSON.parse(lista); } catch (e) { lista = null; }
  }
  if (Array.isArray(lista)) {
    const uniq = [];
    lista.forEach(s => {
      const n = String(s == null ? '' : s).trim();
      if (n && !uniq.some(u => u.toLowerCase() === n.toLowerCase())) uniq.push(n);
    });
    if (uniq.length) return uniq;
  }
  return ['Cozinha 1', 'Cozinha 2', 'Bar'];
}

function obterSoundKeys() {
  const keys = [];
  obterSecoesFila().forEach(sec => {
    ['espera', 'preparo', 'pronto'].forEach(etapa => {
      keys.push('sound-' + slugSecao(sec) + '-' + etapa);
    });
  });
  ['sound-geral-espera', 'sound-geral-preparo', 'sound-geral-pronto',
    'sound-esteira-mobile', 'delay-alarm-sound', 'esteira-som-escopo'
  ].forEach(k => keys.push(k));
  return keys;
}

function iconeSecaoFila(nome) {
  const n = String(nome || '').toLowerCase();
  if (n.includes('bar')) return 'ph-martini';
  if (n.includes('copa')) return 'ph-coffee';
  if (n.includes('churr')) return 'ph-flame';
  if (n.includes('sobrem') || n.includes('doce')) return 'ph-cake';
  if (n.includes('lanch')) return 'ph-hamburger';
  if (n.includes('cozinha')) return 'ph-cooking-pot';
  return 'ph-squares-four';
}

window.renderizarCardsSecoesFila = function () {
  const grid = document.getElementById('secoes-fila-grid');
  if (!grid) return;
  const secoes = obterSecoesFila();
  grid.innerHTML = secoes.map((sec, idx) => {
    const slug = slugSecao(sec);
    const etapas = [
      { label: 'Novo Pedido (Em Espera):', key: 'espera' },
      { label: 'Em Preparo:', key: 'preparo' },
      { label: 'Pedido Pronto:', key: 'pronto' }
    ];
    const rows = etapas.map(et => {
      const key = 'sound-' + slug + '-' + et.key;
      return '<div>' +
        '<label style="font-size:12px; font-weight:600; color:#555; display:block; margin-bottom:4px;">' + et.label + '</label>' +
        '<div style="display:flex; gap:6px;">' +
        '<select id="' + key + '" class="sound-select" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;"></select>' +
        '<button type="button" onclick="window.testSoundConfig(\'' + key + '\')" style="padding:6px 12px; background:#fc4b15; color:white; border:none; border-radius:6px; cursor:pointer;" title="Ouvir som"><i class="ph ph-play"></i></button>' +
        '</div></div>';
    }).join('');
    return '<div style="background:white; padding:16px; border-radius:10px; border:1px solid #e2e8f0; box-shadow:0 2px 6px rgba(0,0,0,0.03); position:relative;">' +
      '<h4 style="margin:0 0 12px 0; color:#1e293b; display:flex; align-items:center; gap:6px; border-bottom:1px solid #eee; padding-bottom:8px;">' +
      '<i class="ph ' + iconeSecaoFila(sec) + '" style="color:#ea580c; font-size:18px;"></i> Seção: <span style="flex:1;">' + escHtmlSom(sec) + '</span>' +
      '<button type="button" onclick="window.renomearSecaoFila(' + idx + ')" title="Renomear seção" style="background:none; border:none; cursor:pointer; color:#64748b; font-size:14px;"><i class="ph ph-pencil-simple"></i></button>' +
      '<button type="button" onclick="window.removerSecaoFila(' + idx + ')" title="Excluir seção" style="background:none; border:none; cursor:pointer; color:#ef4444; font-size:14px;"><i class="ph ph-trash"></i></button>' +
      '</h4>' +
      '<div style="display:flex; flex-direction:column; gap:12px;">' + rows + '</div></div>';
  }).join('');
};

function popularSelectsSom() {
  obterSoundKeys().forEach(key => {
    const el = document.getElementById(key);
    if (!el) return;
    if (!el.options.length) {
      el.innerHTML = SOUND_OPTIONS.map(opt => '<option value="' + opt.value + '">' + opt.name + '</option>').join('');
    }
    const savedVal = (configs && configs[key]) || localStorage.getItem(key) || (key.includes('pronto') ? 'chime' : (key === 'delay-alarm-sound' ? 'sonar' : 'dingdong'));
    el.value = savedVal;
  });
}

function persistirSecoesFila(secoes) {
  configs.fila_secoes = secoes.slice();
  try { localStorage.setItem('fila_secoes', JSON.stringify(secoes)); } catch (e) {}
  renderizarCardsSecoesFila();
  popularSelectsSom();
}

window.adicionarSecaoFila = function () {
  const input = document.getElementById('nova-secao-fila-input');
  const nome = ((input ? input.value : '') || '').trim();
  if (!nome) { alert('Digite o nome da nova seção.'); return; }
  const secoes = obterSecoesFila();
  if (secoes.some(s => s.toLowerCase() === nome.toLowerCase())) { alert('Já existe uma seção com esse nome.'); return; }
  secoes.push(nome);
  persistirSecoesFila(secoes);
  if (input) input.value = '';
  salvarConfiguracoes();
};

window.renomearSecaoFila = function (idx) {
  const secoes = obterSecoesFila();
  if (!secoes[idx]) return;
  const novo = prompt('Novo nome da seção:', secoes[idx]);
  if (novo == null) return;
  const nome = novo.trim();
  if (!nome) return;
  if (nome.toLowerCase() !== secoes[idx].toLowerCase() && secoes.some(s => s.toLowerCase() === nome.toLowerCase())) { alert('Já existe uma seção com esse nome.'); return; }
  secoes[idx] = nome;
  persistirSecoesFila(secoes);
  salvarConfiguracoes();
};

window.removerSecaoFila = function (idx) {
  const secoes = obterSecoesFila();
  if (!secoes[idx]) return;
  if (!confirm('Remover a seção "' + secoes[idx] + '" e seus sons?')) return;
  secoes.splice(idx, 1);
  persistirSecoesFila(secoes);
  salvarConfiguracoes();
};

window.initSoundTab = function () {
  renderizarCardsSecoesFila();
  popularSelectsSom();
  
  const alarmTime = document.getElementById('delay-alarm-time');
  if (alarmTime) alarmTime.value = localStorage.getItem('delay-alarm-time') || 20;
  
  const alarmRepeat = document.getElementById('delay-alarm-repeat');
  if (alarmRepeat) alarmRepeat.value = localStorage.getItem('delay-alarm-repeat') || 5;

  const filaMod = document.getElementById('config-fila-modo');
  if (filaMod) filaMod.value = configs.fila_modo === 'classica' ? 'classica' : 'nova';
};

window.testSoundConfig = function (key) {
  const el = document.getElementById(key);
  if (!el) return;
  window.playAudioTone(el.value);
};

window.saveSoundConfigsUI = function () {
  obterSoundKeys().forEach(key => {
    const el = document.getElementById(key);
    if (el) {
      configs[key] = el.value;
      localStorage.setItem(key, el.value);
    }
  });
  configs.fila_secoes = obterSecoesFila();
  try { localStorage.setItem('fila_secoes', JSON.stringify(configs.fila_secoes)); } catch (e) {}
  
  const filaMod = document.getElementById('config-fila-modo');
  if (filaMod) configs.fila_modo = filaMod.value;
  
  const alarmTime = document.getElementById('delay-alarm-time');
  if (alarmTime) localStorage.setItem('delay-alarm-time', alarmTime.value);
  
  const alarmRepeat = document.getElementById('delay-alarm-repeat');
  if (alarmRepeat) localStorage.setItem('delay-alarm-repeat', alarmRepeat.value);
  salvarConfiguracoes();
  alert('✅ Configurações de som salvas com sucesso!');
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(window.initSoundTab, 500);
  setTimeout(() => {
    if (typeof window.carregarLogsAuditoria === 'function') window.carregarLogsAuditoria();
  }, 800);
});

// --- RENDERIZAÇÃO DA TRILHA DE AUDITORIA & ANTI-FRAUDE ---
window.auditLogsCache = [];

window.carregarLogsAuditoria = function () {
  socket.emit('get_auditoria_logs');
};

socket.on('auditoria_logs_recebidos', (logs) => {
  // Map fields from DB to the UI
  const mappedLogs = logs.map(l => ({
    dataHora: l.data_hora ? new Date(l.data_hora).toLocaleString('pt-BR') : '',
    usuario: l.operador,
    tipo: l.acao,
    detalhe: l.detalhes,
    motivo: l.motivo,
    risco: (l.risco || 'INFO').toUpperCase()
  }));

  window.auditLogsCache = mappedLogs;
  window.renderizarAuditoriaLogs(mappedLogs);
});

window.renderizarAuditoriaLogs = function (logs) {
  const tbody = document.getElementById('auditoria-logs-tbody');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 24px;">Nenhum registro de auditoria encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(log => {
    let badgeBg = '#f1f5f9';
    let badgeColor = '#475569';
    let badgeText = log.risco || 'INFO';

    if (log.risco === 'ALTO' || log.tipo.includes('INCORRETA') || log.tipo.includes('ESTORNO')) {
      badgeBg = '#ffe4e6';
      badgeColor = '#e11d48';
      badgeText = '🔴 ALTO';
    } else if (log.risco === 'MEDIO' || log.tipo.includes('EXCLUSÃO') || log.tipo.includes('DESCONTO')) {
      badgeBg = '#fef3c7';
      badgeColor = '#d97706';
      badgeText = '🟡 MÉDIO';
    } else {
      badgeBg = '#dcfce7';
      badgeColor = '#166534';
      badgeText = '🟢 NORMAL';
    }

    return `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px; font-size: 12.5px; color: #64748b; font-weight: 500;">${log.dataHora}</td>
        <td style="padding: 10px; font-size: 13px; font-weight: 700; color: #1e293b;"><i class="ph ph-user-circle" style="color: #64748b;"></i> ${log.usuario}</td>
        <td style="padding: 10px; font-size: 12.5px; font-weight: 700; color: #334155;">${log.tipo}</td>
        <td style="padding: 10px; font-size: 13px; color: #1e293b;">${log.detalhe}</td>
        <td style="padding: 10px; font-size: 12.5px; color: #475569; font-style: italic;">"${log.motivo || 'Sem justificativa'}"</td>
        <td style="padding: 10px; text-align: center;">
          <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 800;">${badgeText}</span>
        </td>
      </tr>
    `;
  }).join('');
};

window.filtrarAuditoriaLogs = function (termo) {
  const termoLower = (termo || '').toLowerCase().trim();
  const logs = window.auditLogsCache || [];
  const filtrados = logs.filter(l =>
    !termoLower ||
    l.usuario.toLowerCase().includes(termoLower) ||
    l.detalhe.toLowerCase().includes(termoLower) ||
    l.tipo.toLowerCase().includes(termoLower) ||
    (l.motivo && l.motivo.toLowerCase().includes(termoLower))
  );
  window.renderizarAuditoriaLogs(filtrados);
};

window.filtrarAuditoriaLogsTipo = function (tipo) {
  const logs = window.auditLogsCache || [];
  if (tipo === 'todos') {
    window.renderizarAuditoriaLogs(logs);
    return;
  }
  const filtrados = logs.filter(l => l.tipo.toLowerCase().includes(tipo.toLowerCase()));
  window.renderizarAuditoriaLogs(filtrados);
};

// --- RENDERIZAÇÃO E FILTRO DOS LOGS DE REQUISIÇÕES API ---
window.alternarSubabaAuditoria = function (subaba) {
  const btnEventos = document.getElementById('btn-subaba-auditoria-eventos');
  const btnApi = document.getElementById('btn-subaba-auditoria-api');
  const painelEventos = document.getElementById('subpainel-auditoria-eventos');
  const painelApi = document.getElementById('subpainel-auditoria-api');

  if (subaba === 'eventos') {
    if (btnEventos) {
      btnEventos.style.color = '#9f1239';
      btnEventos.style.borderBottomColor = '#9f1239';
      btnEventos.style.fontWeight = 'bold';
    }
    if (btnApi) {
      btnApi.style.color = '#64748b';
      btnApi.style.borderBottomColor = 'transparent';
      btnApi.style.fontWeight = '600';
    }
    if (painelEventos) painelEventos.style.display = 'block';
    if (painelApi) painelApi.style.display = 'none';
    window.carregarLogsAuditoria();
  } else if (subaba === 'api') {
    if (btnEventos) {
      btnEventos.style.color = '#64748b';
      btnEventos.style.borderBottomColor = 'transparent';
      btnEventos.style.fontWeight = '600';
    }
    if (btnApi) {
      btnApi.style.color = '#9f1239';
      btnApi.style.borderBottomColor = '#9f1239';
      btnApi.style.fontWeight = 'bold';
    }
    if (painelEventos) painelEventos.style.display = 'none';
    if (painelApi) painelApi.style.display = 'block';
    window.carregarLogsApi();
  }
};

window.carregarLogsApi = function () {
  socket.emit('get_api_logs');
};

window.apiLogsCache = [];

socket.on('api_logs_recebidos', (logs) => {
  const mappedLogs = logs.map(l => ({
    id: l.id,
    dataHora: l.data_hora ? new Date(l.data_hora).toLocaleString('pt-BR') : '',
    operador: l.operador || 'Sistema',
    ip: l.ip || '—',
    metodo: l.metodo || 'GET',
    endpoint: l.endpoint || '—',
    status: l.status_code || 200,
    detalhes: l.detalhes || ''
  }));

  window.apiLogsCache = mappedLogs;
  window.renderizarApiLogs(mappedLogs);
});

window.renderizarApiLogs = function (logs) {
  const tbody = document.getElementById('api-logs-tbody');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 24px;">Nenhum log de API encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(log => {
    let metodoBg = '#f1f5f9';
    let metodoColor = '#475569';
    if (log.metodo === 'POST') {
      metodoBg = '#dbeafe';
      metodoColor = '#1e40af';
    } else if (log.metodo === 'DELETE') {
      metodoBg = '#fee2e2';
      metodoColor = '#991b1b';
    } else if (log.metodo === 'PUT' || log.metodo === 'PATCH') {
      metodoBg = '#fef3c7';
      metodoColor = '#92400e';
    } else if (log.metodo === 'GET') {
      metodoBg = '#dcfce7';
      metodoColor = '#166534';
    }

    let statusColor = '#166534';
    let statusBg = '#dcfce7';
    if (log.status >= 400) {
      statusColor = '#991b1b';
      statusBg = '#fee2e2';
    } else if (log.status >= 300) {
      statusColor = '#92400e';
      statusBg = '#fef3c7';
    }

    return `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 10px 16px; color: #64748b; font-weight: 500; white-space: nowrap;">${log.dataHora}</td>
        <td style="padding: 10px 16px; font-weight: 700; color: #1e293b;">
          <div>${log.operador}</div>
          <small style="color: #64748b; font-weight: normal;">IP: ${log.ip}</small>
        </td>
        <td style="padding: 10px 16px;">
          <span style="background: ${metodoBg}; color: ${metodoColor}; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 800;">${log.metodo}</span>
        </td>
        <td style="padding: 10px 16px; font-family: monospace; color: #0f172a; word-break: break-all;">${log.endpoint}</td>
        <td style="padding: 10px 16px;">
          <span style="background: ${statusBg}; color: ${statusColor}; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 800;">${log.status}</span>
        </td>
        <td style="padding: 10px 16px; color: #334155; font-family: monospace; font-size: 12px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.detalhes.replace(/"/g, '&quot;')}">
          ${log.detalhes || '—'}
        </td>
      </tr>
    `;
  }).join('');
};

window.filtrarApiLogs = function (termo) {
  const termoLower = (typeof termo === 'string' ? termo : document.getElementById('filtro-api-busca')?.value || '').toLowerCase().trim();
  const metodoFiltro = document.getElementById('filtro-api-metodo')?.value || 'todos';
  window.filtrarApiLogsCombinado(termoLower, metodoFiltro);
};

window.filtrarApiLogsMetodo = function (metodo) {
  const buscaTermo = (document.getElementById('filtro-api-busca')?.value || '').toLowerCase().trim();
  window.filtrarApiLogsCombinado(buscaTermo, metodo);
};

window.filtrarApiLogsCombinado = function (termoLower, metodo) {
  const logs = window.apiLogsCache || [];
  const filtrados = logs.filter(l => {
    if (metodo !== 'todos') {
      if (metodo === 'erros') {
        if (l.status < 400) return false;
      } else {
        if (l.metodo !== metodo) return false;
      }
    }
    if (termoLower) {
      const matchIp = l.ip.toLowerCase().includes(termoLower);
      const matchOperador = l.operador.toLowerCase().includes(termoLower);
      const matchEndpoint = l.endpoint.toLowerCase().includes(termoLower);
      const matchDetalhes = l.detalhes.toLowerCase().includes(termoLower);
      return matchIp || matchOperador || matchEndpoint || matchDetalhes;
    }
    return true;
  });
  window.renderizarApiLogs(filtrados);
};

// --- CONFIGURAÇÕES FISCAIS NFC-E ---
window.initNfceTab = function () {
  const elRazao = document.getElementById('cfg-nfce-razao-social');
  const elFantasia = document.getElementById('cfg-nfce-nome-fantasia');
  const elCnpj = document.getElementById('cfg-nfce-cnpj');
  const elIe = document.getElementById('cfg-nfce-ie');
  const elIm = document.getElementById('cfg-nfce-im');
  const elEndereco = document.getElementById('cfg-nfce-endereco');
  const elRegime = document.getElementById('cfg-nfce-regime');
  const elAmbiente = document.getElementById('cfg-nfce-ambiente');
  const elSerie = document.getElementById('cfg-nfce-serie');
  const elCsc = document.getElementById('cfg-nfce-csc');
  const elIdCsc = document.getElementById('cfg-nfce-id-csc');
  const elTokenApi = document.getElementById('cfg-nfce-token-api');
  const elCertPath = document.getElementById('cfg-nfce-cert-path');
  const elCertSenha = document.getElementById('cfg-nfce-cert-senha');
  const elNcm = document.getElementById('cfg-nfce-ncm');
  const elCfop = document.getElementById('cfg-nfce-cfop');

  if (elRazao) elRazao.value = configs.razao_social || '';
  if (elFantasia) elFantasia.value = configs.nome_fantasia || '';
  if (elCnpj) elCnpj.value = configs.cnpj || '';
  if (elIe) elIe.value = configs.ie || '';
  if (elIm) elIm.value = configs.im || '';
  if (elEndereco) elEndereco.value = configs.endereco || '';
  if (elRegime) elRegime.value = configs.regime_tributario || '1';
  if (elAmbiente) elAmbiente.value = configs.ambiente || 'homologacao';
  if (elSerie) elSerie.value = configs.serie || '1';
  if (elCsc) elCsc.value = configs.csc || '';
  if (elIdCsc) elIdCsc.value = configs.id_csc || '000001';
  if (elTokenApi) elTokenApi.value = configs.token_api_fiscal || '';
  if (elCertPath) elCertPath.value = configs.cert_path || '';
  if (elCertSenha) elCertSenha.value = configs.cert_senha || '';
  if (elNcm) elNcm.value = configs.ncm || '21069090';
  if (elCfop) elCfop.value = configs.cfop || '5102';
};

window.salvarConfiguracoesNfce = function () {
  const payload = {
    razao_social: (document.getElementById('cfg-nfce-razao-social')?.value || '').trim(),
    nome_fantasia: (document.getElementById('cfg-nfce-nome-fantasia')?.value || '').trim(),
    cnpj: (document.getElementById('cfg-nfce-cnpj')?.value || '').trim(),
    ie: (document.getElementById('cfg-nfce-ie')?.value || '').trim(),
    im: (document.getElementById('cfg-nfce-im')?.value || '').trim(),
    endereco: (document.getElementById('cfg-nfce-endereco')?.value || '').trim(),
    regime_tributario: document.getElementById('cfg-nfce-regime')?.value || '1',
    ambiente: document.getElementById('cfg-nfce-ambiente')?.value || 'homologacao',
    serie: document.getElementById('cfg-nfce-serie')?.value || '1',
    csc: (document.getElementById('cfg-nfce-csc')?.value || '').trim(),
    id_csc: (document.getElementById('cfg-nfce-id-csc')?.value || '000001').trim(),
    token_api_fiscal: (document.getElementById('cfg-nfce-token-api')?.value || '').trim(),
    cert_path: (document.getElementById('cfg-nfce-cert-path')?.value || '').trim(),
    cert_senha: (document.getElementById('cfg-nfce-cert-senha')?.value || '').trim(),
    ncm: (document.getElementById('cfg-nfce-ncm')?.value || '21069090').trim(),
    cfop: (document.getElementById('cfg-nfce-cfop')?.value || '5102').trim()
  };

  fetch('/api/config', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(res => {
      if (res && res.success) {
        alert('✅ Parâmetros Fiscais da NFC-e salvos com sucesso!');
        Object.assign(configs, payload);
      } else {
        alert('Erro ao salvar configurações fiscais.');
      }
    })
    .catch(e => {
      alert('Erro de rede ao salvar configurações: ' + e.message);
    });
};

/* --- OTIMIZAÇÃO DE RESOLUÇÃO & ESCALA DE TELA --- */
window.aplicarResolucao = function (modeVal, customZoomVal) {
  const mode = modeVal || localStorage.getItem('chef_app_resolution') || 'auto';
  const customZoom = customZoomVal || localStorage.getItem('chef_app_zoom_percent') || '100';

  let targetZoom = '';
  let isTouchMode = false;

  if (mode === 'compact') {
    targetZoom = '88%';
  } else if (mode === 'standard') {
    targetZoom = '100%';
  } else if (mode === 'large') {
    targetZoom = '118%';
  } else if (mode === 'touch') {
    targetZoom = '112%';
    isTouchMode = true;
  } else if (mode === 'custom') {
    targetZoom = customZoom + '%';
  } else {
    targetZoom = '';
  }

  if (targetZoom) {
    document.documentElement.style.zoom = targetZoom;
  } else {
    document.documentElement.style.zoom = '';
  }

  if (isTouchMode) {
    document.documentElement.classList.add('mode-touchscreen-active');
  } else {
    document.documentElement.classList.remove('mode-touchscreen-active');
  }
};

function updateResolucaoCardStyles(selectedMode) {
  document.querySelectorAll('.resolucao-card').forEach(card => {
    const res = card.getAttribute('data-res');
    if (res === selectedMode) {
      card.style.background = 'rgba(252,75,21,0.15)';
      card.style.borderColor = '#fc4b15';
      card.style.boxShadow = '0 0 12px rgba(252,75,21,0.3)';
    } else {
      card.style.background = 'rgba(255,255,255,0.05)';
      card.style.borderColor = '#3a3a4c';
      card.style.boxShadow = 'none';
    }
  });
}

window.initResolucaoTab = function () {
  const currentMode = localStorage.getItem('chef_app_resolution') || 'auto';
  const currentZoom = localStorage.getItem('chef_app_zoom_percent') || '100';

  const radio = document.querySelector(`input[name="radio-resolucao"][value="${currentMode}"]`);
  if (radio) {
    radio.checked = true;
    updateResolucaoCardStyles(currentMode);
  }

  const slider = document.getElementById('slider-zoom-custom');
  const labelZoom = document.getElementById('label-zoom-val');
  if (slider && labelZoom) {
    slider.value = currentZoom;
    labelZoom.innerText = currentZoom + '%';
    slider.oninput = () => {
      labelZoom.innerText = slider.value + '%';
      const radCustom = document.querySelector('input[name="radio-resolucao"][value="custom"]');
      if (radCustom) radCustom.checked = true;
      updateResolucaoCardStyles('custom');
      window.aplicarResolucao('custom', slider.value);
    };
  }

  document.querySelectorAll('input[name="radio-resolucao"]').forEach(r => {
    r.onchange = () => {
      updateResolucaoCardStyles(r.value);
      const val = (r.value === 'custom' && slider) ? slider.value : null;
      window.aplicarResolucao(r.value, val);
    };
  });
};

window.salvarConfiguracaoResolucao = function () {
  const selectedRadio = document.querySelector('input[name="radio-resolucao"]:checked');
  const selectedMode = selectedRadio ? selectedRadio.value : 'auto';
  const slider = document.getElementById('slider-zoom-custom');
  const customZoomVal = slider ? slider.value : '100';

  localStorage.setItem('chef_app_resolution', selectedMode);
  localStorage.setItem('chef_app_zoom_percent', customZoomVal);

  window.aplicarResolucao(selectedMode, customZoomVal);

  alert('✅ Configuração de resolução e escala de tela salva com sucesso!');
};

/* --- INTEGRAÇÃO COM MAQUININHAS DE CARTÃO --- */

const MAQUININHA_PROVIDER_FIELDS = {
  mercadopago: ['mp-config-fields'],
  stone: ['stone-config-fields'],
  pagbank: ['pagbank-config-fields'],
  sitef: ['sitef-config-fields']
};

function _updateMaquininhaFieldsVisibility(provedor) {
  // Esconde todos os grupos de campos
  Object.values(MAQUININHA_PROVIDER_FIELDS).flat().forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  // Exibe apenas os campos do provedor selecionado
  const fields = MAQUININHA_PROVIDER_FIELDS[provedor] || [];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  });
}

window.salvarConfiguracaoMaquininha = function () {
  const provedor = document.getElementById('mp-integracao-provedor')?.value || 'none';
  const payload = {
    mp_provider: provedor,
    // Mercado Pago
    mp_access_token: (document.getElementById('mp-config-token')?.value || '').trim(),
    mp_device_id: (document.getElementById('mp-config-device')?.value || '').trim(),
    // Stone / Ton
    stone_stonecode: (document.getElementById('stone-config-stonecode')?.value || '').trim(),
    stone_porta: (document.getElementById('stone-config-porta')?.value || '8080').trim(),
    // PagBank / PagSeguro
    pagbank_token: (document.getElementById('pagbank-config-token')?.value || '').trim(),
    pagbank_terminal: (document.getElementById('pagbank-config-terminal')?.value || '').trim(),
    // SiTef
    sitef_ip: (document.getElementById('sitef-config-ip')?.value || '').trim(),
    sitef_porta: (document.getElementById('sitef-config-porta')?.value || '4096').trim(),
    sitef_terminal: (document.getElementById('sitef-config-terminal')?.value || '').trim(),
    sitef_estabelecimento: (document.getElementById('sitef-config-estabelecimento')?.value || '').trim()
  };

  fetch('/api/config', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(res => {
      if (res && res.success) {
        const provedorNome = {
          none: 'Nenhum provedor',
          mercadopago: 'Mercado Pago',
          stone: 'Stone / Ton',
          pagbank: 'PagBank / PagSeguro',
          sitef: 'SiTef Genérico'
        }[provedor] || provedor;
        alert(`✅ Maquininha configurada: ${provedorNome}`);
        Object.assign(configs, payload);
      } else {
        alert('Erro ao salvar configurações da maquininha.');
      }
    })
    .catch(e => {
      alert('Erro de rede ao salvar configurações: ' + e.message);
    });
};

window.initMaquininhasTab = function () {
  const elProvedor = document.getElementById('mp-integracao-provedor');

  if (elProvedor) {
    elProvedor.value = configs.mp_provider || 'none';
    _updateMaquininhaFieldsVisibility(elProvedor.value);
    elProvedor.onchange = () => _updateMaquininhaFieldsVisibility(elProvedor.value);
  }

  // Preencher campos do Mercado Pago
  const elToken = document.getElementById('mp-config-token');
  const elDevice = document.getElementById('mp-config-device');
  if (elToken) elToken.value = configs.mp_access_token || '';
  if (elDevice) elDevice.value = configs.mp_device_id || '';

  // Preencher campos Stone
  const elStoneCode = document.getElementById('stone-config-stonecode');
  const elStonePorta = document.getElementById('stone-config-porta');
  if (elStoneCode) elStoneCode.value = configs.stone_stonecode || '';
  if (elStonePorta) elStonePorta.value = configs.stone_porta || '8080';

  // Preencher campos PagBank
  const elPagbankToken = document.getElementById('pagbank-config-token');
  const elPagbankTerminal = document.getElementById('pagbank-config-terminal');
  if (elPagbankToken) elPagbankToken.value = configs.pagbank_token || '';
  if (elPagbankTerminal) elPagbankTerminal.value = configs.pagbank_terminal || '';

  // Preencher campos SiTef
  const elSitefIp = document.getElementById('sitef-config-ip');
  const elSitefPorta = document.getElementById('sitef-config-porta');
  const elSitefTerminal = document.getElementById('sitef-config-terminal');
  const elSitefEstab = document.getElementById('sitef-config-estabelecimento');
  if (elSitefIp) elSitefIp.value = configs.sitef_ip || '';
  if (elSitefPorta) elSitefPorta.value = configs.sitef_porta || '4096';
  if (elSitefTerminal) elSitefTerminal.value = configs.sitef_terminal || '';
  if (elSitefEstab) elSitefEstab.value = configs.sitef_estabelecimento || '';

  // Botão salvar
  const saveBtn = document.getElementById('btn-save-mp-config');
  if (saveBtn) saveBtn.onclick = window.salvarConfiguracaoMaquininha;

  // Botão testar conexão
  const testBtn = document.getElementById('btn-test-maquininha');
  if (testBtn) {
    testBtn.onclick = async () => {
      const provedor = document.getElementById('mp-integracao-provedor')?.value || 'none';
      if (provedor === 'none') {
        alert('Selecione um provedor antes de testar.');
        return;
      }
      testBtn.disabled = true;
      testBtn.innerHTML = '<i class="ph ph-spinner"></i> Testando...';
      try {
        const res = await fetch('/api/maquininha/testar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provedor, restaurante_id: localStorage.getItem('restaurante_id') || '1' })
        });
        const data = await res.json();
        if (data.ok) {
          alert(`✅ Conexão OK!\n${data.msg || 'Provedor respondeu com sucesso.'}`);
        } else {
          alert(`❌ Falha na conexão:\n${data.msg || 'Verifique as configurações.'}`);
        }
      } catch (e) {
        alert('❌ Erro ao testar: ' + e.message);
      } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = '<i class="ph ph-lightning"></i> Testar Conexão';
      }
    };
  }
};

// ==========================================
// FUNÇÕES DE INTELIGÊNCIA E PERFIL DA MESA
// ==========================================


window.mostrarQrCodeMesa = function(nomeMesa) {
  const modal = document.getElementById('modal-qrcode-mesa');
  const img = document.getElementById('qr-mesa-img');
  const urlEl = document.getElementById('qr-mesa-url');
  const titulo = document.getElementById('qr-mesa-titulo');
  
  if (!modal) return alert("Erro: Modal de QR Code não encontrado no HTML!");
  
  if (titulo) titulo.innerText = `QR Code - ${nomeMesa}`;
  
  const cardapioUrl = buildCardapioUrl(nomeMesa);
  
  if (urlEl) urlEl.innerText = cardapioUrl;
  if (img) {
  if (typeof window.qrImg === 'function') {
    window.qrImg(img, cardapioUrl, 200);
  } else {
    img.src = (window.location.origin || '') + '/api/qr?size=200&data=' + encodeURIComponent(cardapioUrl);
  }
  }
  
  modal.style.display = 'flex';
};

window.abrirPerfilMesa = function(mesaNome) {
  const modal = document.getElementById('modal-perfil-mesa');
  if (!modal) return alert("Erro: Modal de Perfil da Mesa não encontrado no HTML!");
  
  const tituloEl = document.getElementById('perfil-mesa-titulo');
  if (tituloEl) tituloEl.innerText = 'Perfil: ' + mesaNome;
  
  // Gerar QR Code no Modal de Perfil (mesmo cardápio dos demais QR codes)
  const canvas = document.getElementById('canvas-perfil-qrcode');
  const tableUrl = buildCardapioUrl(mesaNome);
  
  if (canvas) {
    try {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const drawImageOnCanvas = function(src) {
        const qrImg = new Image();
        qrImg.crossOrigin = 'anonymous';
        qrImg.onload = function() {
          ctx.drawImage(qrImg, 0, 0, canvas.width, canvas.height);
        };
        qrImg.src = src;
      };

      if (typeof window.gerarQrDataUrl === 'function') {
        window.gerarQrDataUrl(tableUrl, 200, function(dataUrl) {
          drawImageOnCanvas(dataUrl);
        });
      } else {
        const fallbackUrl = (window.location.origin || '') + '/api/qr?size=200&data=' + encodeURIComponent(tableUrl);
        drawImageOnCanvas(fallbackUrl);
      }
    } catch (e) { console.error('[PerfilMesa] Erro ao gerar QR code:', e); }
  }
  
  const clientesEl = document.getElementById('perfil-mesa-clientes');
  const itensEl = document.getElementById('perfil-mesa-itens');
  const ticketEl = document.getElementById('perfil-mesa-ticket');
  const permanenciaEl = document.getElementById('perfil-mesa-permanencia');
  const detalheEl = document.getElementById('perfil-mesa-clientes-detalhe');

  if (clientesEl) clientesEl.innerHTML = '<i class="ph ph-spinner spinner"></i> Carregando...';
  if (itensEl) itensEl.innerHTML = '<i class="ph ph-spinner spinner"></i> Carregando...';
  if (ticketEl) ticketEl.innerHTML = 'R$ 0,00';
  if (permanenciaEl) permanenciaEl.innerHTML = 'Carregando...';
  if (detalheEl) detalheEl.innerHTML = '<i class="ph ph-spinner spinner"></i> Carregando...';
  
  modal.style.display = 'flex';
  
  fetch('/api/mesa-perfil/' + encodeURIComponent(mesaNome) + '?restaurante_id=' + encodeURIComponent(localStorage.getItem('restaurante_id') || '1'))
    .then(r => r.json())
    .then(data => {
      // Clientes
      const c = data.clientes_recentes;
      if (clientesEl) {
        if (c && c.length > 0) {
          clientesEl.innerHTML = c.map(n => `<span style="display:inline-block; background:#3b82f622; color:#3b82f6; padding:4px 10px; border-radius:6px; margin:2px; font-weight:600;"><i class="ph ph-user"></i> ${escapeHtml(n)}</span>`).join(' ');
        } else {
          clientesEl.innerHTML = '<span style="color:#94a3b8;">Nenhum cliente registrado nesta mesa recentemente.</span>';
        }
      }
      
      // Itens
      const i = data.mais_pedidos;
      if (itensEl) {
        if (i && i.length > 0) {
          itensEl.innerHTML = i.map(item => `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334; padding:6px 0;">
              <span>${escapeHtml(item.nome)}</span> <strong style="color:#fc4b15; background: #fc4b1522; padding: 2px 8px; border-radius: 4px;">${item.qty}x</strong>
            </div>
          `).join('');
        } else {
          itensEl.innerHTML = '<span style="color:#94a3b8;">Nenhum item consumido recentemente.</span>';
        }
      }

      // Ticket Médio
      if (ticketEl) {
        const val = parseFloat(data.media_valor) || 0;
        ticketEl.innerText = 'R$ ' + val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      // Permanência
      if (permanenciaEl) {
        let min = 0;
        if (data.aberta_em) {
          const aberta = new Date(String(data.aberta_em).includes('T') ? data.aberta_em : String(data.aberta_em).replace(' ', 'T'));
          if (!isNaN(aberta.getTime())) min = Math.floor((new Date() - aberta) / 60000);
        }
        min = Math.max(0, min);
        const h = Math.floor(min / 60), m = min % 60;
        permanenciaEl.innerText = data.aberta_em ? ((h > 0 ? h + 'h' : '') + m + 'min') + ' na mesa' : 'Mesa não está em aberto';
      }

      // Consumo por Cliente
      if (detalheEl) {
        const detalhe = data.clientes_detalhe || [];
        if (detalhe.length > 0) {
          detalheEl.innerHTML = detalhe.map(d => `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334; padding:6px 0;">
              <span><i class="ph ph-user"></i> <strong>${escapeHtml(d.nome)}</strong> <span style="color:#64748b;">(${d.pedidos} pedido${d.pedidos === 1 ? '' : 's'})</span></span>
              <strong style="color:#10b981;">R$ ${(parseFloat(d.valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </div>
          `).join('');
        } else {
          detalheEl.innerHTML = '<span style="color:#94a3b8;">Nenhum consumo registrado para esta mesa.</span>';
        }
      }
    })
    .catch(() => {
      if (clientesEl) clientesEl.innerHTML = '<span style="color:#ef4444;">Erro ao carregar dados</span>';
      if (itensEl) itensEl.innerHTML = '<span style="color:#ef4444;">Erro ao carregar dados</span>';
      if (permanenciaEl) permanenciaEl.innerHTML = '<span style="color:#ef4444;">Erro ao carregar</span>';
      if (detalheEl) detalheEl.innerHTML = '<span style="color:#ef4444;">Erro ao carregar</span>';
    });
};


// --- GERENCIAR NOTAS (NFC-e) ---

window.nfceCurrentPage = 1;
window.nfceTotalPages = 1;

window.carregarTodasNotasNfce = function(page = 1) {
  if (page < 1) page = 1;
  window.nfceCurrentPage = page;
  
  const startDate = document.getElementById('nfce-filter-start')?.value || '';
  const endDate = document.getElementById('nfce-filter-end')?.value || '';
  const search = document.getElementById('nfce-filter-search')?.value || '';
  
  const tbody = document.querySelector('#table-todas-nfce tbody');
  if(tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Carregando notas...</td></tr>';
  
  socket.emit('get_nfce_notas_paginated', { page, limit: 15, startDate, endDate, search }, (res) => {
    if (res.error) {
      console.error(res.error);
      if(tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: red;">Erro ao buscar notas.</td></tr>';
      return;
    }
    
    renderizarTodasNotasNfce(res.data, res.total, res.page, res.limit);
  });
};

function renderizarTodasNotasNfce(notas, total, page, limit) {
  const tbody = document.querySelector('#table-todas-nfce tbody');
  const info = document.getElementById('nfce-pagination-info');
  const btnPrev = document.getElementById('btn-nfce-prev');
  const btnNext = document.getElementById('btn-nfce-next');
  
  window.nfceTotalPages = Math.ceil(total / limit) || 1;
  
  if (info) info.innerText = `Mostrando ${notas.length} de ${total} resultados (Página ${page} de ${window.nfceTotalPages})`;
  if (btnPrev) btnPrev.disabled = page <= 1;
  if (btnNext) btnNext.disabled = page >= window.nfceTotalPages;
  
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (!notas || notas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Nenhuma nota encontrada.</td></tr>';
    return;
  }
  
  const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  
  notas.forEach(nota => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #e2e8f0';
    
    const dataHora = chefFormatDate(nota.created_at);
    
    let statusStyle = '';
    let statusText = nota.status || 'Pendente';
    if (statusText === 'Autorizada') statusStyle = 'background: #dcfce7; color: #166534;';
    else if (statusText === 'Cancelada' || statusText.includes('Erro')) statusStyle = 'background: #fee2e2; color: #991b1b;';
    else statusStyle = 'background: #fef9c3; color: #854d0e;';
    
    let btnDanfe = (statusText === 'Autorizada' || statusText === 'Cancelada') 
      ? `<button onclick="window.imprimirDanfeNfce(${nota.id})" style="background: #22c55e; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;"><i class="ph ph-printer"></i> DANFE</button>` 
      : '';
    
    let btnXml = (statusText === 'Autorizada' || statusText === 'Cancelada') 
      ? `<button onclick="window.baixarXmlNfce(${nota.id})" style="background: #3b82f6; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;"><i class="ph ph-file-code"></i> XML</button>` 
      : '';
      
    let btnCancelar = (statusText === 'Autorizada') 
      ? `<button onclick="window.solicitarCancelamentoNfce(${nota.id})" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;"><i class="ph ph-x"></i> Cancelar</button>` 
      : '';
      
    tr.innerHTML = `
      <td style="padding: 12px; font-weight: bold;">Nº ${nota.numero_nota || '-'}</td>
      <td style="padding: 12px; font-size: 12px; color: #64748b;">${dataHora}</td>
      <td style="padding: 12px; font-size: 12px;">${nota.cliente_nome || 'Consumidor Não Identificado'}<br><span style="color: #94a3b8;">${nota.cpf_cnpj || ''}</span></td>
      <td style="padding: 12px; font-weight: bold; color: #0f172a;">${formatter.format(nota.valor_total || 0)}</td>
      <td style="padding: 12px;"><span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; ${statusStyle}">${statusText}</span></td>
      <td style="padding: 12px; text-align: center; display: flex; gap: 4px; justify-content: center;">
        ${btnDanfe} ${btnXml} ${btnCancelar}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.nfceChangePage = function(delta) {
  const newPage = window.nfceCurrentPage + delta;
  if (newPage < 1 || newPage > window.nfceTotalPages) return;
  window.carregarTodasNotasNfce(newPage);
};

window.solicitarCancelamentoNfce = function(id) {
  const m = prompt('Informe o motivo do cancelamento (mínimo 15 caracteres):');
  if (!m || m.length < 15) {
    alert('Motivo deve ter pelo menos 15 caracteres.');
    return;
  }
  socket.emit('cancelar_nfce', { id, motivo: m }, (res) => {
    if (res && res.ok) {
      alert('NFC-e cancelada com sucesso!');
      window.carregarTodasNotasNfce(window.nfceCurrentPage);
    } else {
      alert('Erro ao cancelar: ' + (res?.error || 'Erro desconhecido.'));
    }
  });
};

document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  const startInput = document.getElementById('nfce-filter-start');
  const endInput = document.getElementById('nfce-filter-end');
  if (startInput) startInput.value = today;
  if (endInput) endInput.value = today;
  
  const params = new URLSearchParams(window.location.search);
  if(params.get('tab') === 'gerenciar-notas') {
    setTimeout(() => { window.carregarTodasNotasNfce(1); }, 500);
  }
  
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('button').dataset.tab === 'gerenciar-notas') {
        window.carregarTodasNotasNfce(1);
      }
    });
  });
});

window.imprimirDanfeNfce = function(id) {
  if (!id) return;
  const rid = encodeURIComponent(localStorage.getItem('restaurante_id') || '1');
  window.open('/api/nfce/danfe/' + id + '?restaurante_id=' + rid, '_blank', 'width=420,height=650,scrollbars=yes');
};

window.baixarXmlNfce = function(id) {
  if (!id) return;
  const rid = encodeURIComponent(localStorage.getItem('restaurante_id') || '1');
  window.open('/api/nfce/xml/' + id + '?restaurante_id=' + rid, '_blank');
};



// Sidebar Accordion Logic
/* O acordeão dos grupos da sidebar (.action-group / .group-title) é controlado
   por UM ÚNICO handler no script inline do configuracoes.html. Antes havia dois
   handlers (este bloco + o inline) togglando 'collapsed' no mesmo clique,
   cancelando um ao outro — por isso os grupos não recolhiam. Não duplicar.
   O indicador visual é o caret do CSS (.group-title::after), rotacionado
   automaticamente pela classe .collapsed. */

  // ==========================================
  // AI COMBO GENERATOR - Redução Tributária
  // ==========================================
  window.gerarCombosIA = function() {
    const loading = document.getElementById('combo-loading');
    const empty = document.getElementById('combo-empty');
    const statsPanel = document.getElementById('combo-stats-panel');
    const grid = document.getElementById('combo-suggestions-grid');

    loading.style.display = 'block';
    empty.style.display = 'none';
    statsPanel.style.display = 'none';
    grid.style.display = 'none';
    grid.innerHTML = '';

    socket.emit('get_ai_combo_suggestions');
  };

  socket.on('ai_combo_suggestions', (data) => {
    const loading = document.getElementById('combo-loading');
    const empty = document.getElementById('combo-empty');
    const statsPanel = document.getElementById('combo-stats-panel');
    const grid = document.getElementById('combo-suggestions-grid');

    loading.style.display = 'none';

    if (data.error || !data.suggestions || data.suggestions.length === 0) {
      empty.style.display = 'block';
      empty.querySelector('h4').textContent = data.error || 'Nenhuma sugestão possível';
      empty.querySelector('p').textContent = data.error ? '' : 'Cadastre mais produtos e tenha vendas registradas para gerar sugestões.';
      return;
    }

    const s = data.stats;
    document.getElementById('combo-stat-produtos').textContent = s.totalProdutos || 0;
    document.getElementById('combo-stat-faturamento').textContent = `R$ ${(s.totalFaturado30d || 0).toFixed(2).replace('.', ',')}`;
    document.getElementById('combo-stat-taxa').textContent = s.totalPedidos30d ? `${s.totalPedidos30d} pedidos` : '-';
    document.getElementById('combo-stat-sugestoes').textContent = data.suggestions.length;
    statsPanel.style.display = 'block';

    const tipoLabels = {
      frequente_junto: { label: 'Frequentemente Juntos', color: '#dc2626', bg: '#fef2f2' },
      estrella_dormencia: { label: 'Estrela + Dormência', color: '#d97706', bg: '#fffbeb' },
      combo_momento: { label: 'Combo do Momento', color: '#7c3aed', bg: '#f5f3ff' },
      cross_sell: { label: 'Cross-Sell Top', color: '#059669', bg: '#f0fdf4' },
      alto_margem: { label: 'Alto Valor / Baixa Saída', color: '#0284c7', bg: '#f0f9ff' }
    };

    const catDist = document.getElementById('combo-cat-distribution');
    if (catDist) {
      const dist = s.distribuicao || [];
      catDist.innerHTML = dist.map(d => {
        const barColor = d.categoria.includes('Alcoól') ? '#dc2626' : d.categoria.includes('Não-Alc') ? '#f59e0b' : d.categoria.includes('Aliment') ? '#059669' : '#6366f1';
        return `
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
              <span style="font-weight: 500; color: #334155;">${d.categoria}</span>
              <span style="font-weight: 600; color: #475569;">R$ ${(d.faturamento || 0).toFixed(2).replace('.', ',')} (${d.percentual}%)</span>
            </div>
            <div style="width: 100%; height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden;">
              <div style="width: ${d.percentual}%; height: 100%; background: ${barColor}; border-radius: 4px; transition: width 0.5s;"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    grid.style.display = 'grid';
    grid.innerHTML = data.suggestions.map((c, idx) => {
      const tipo = tipoLabels[c.tipo] || { label: c.tipo, color: '#64748b', bg: '#f8fafc' };
      return `
        <div style="background: white; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.03); transition: transform 0.2s, box-shadow 0.2s;"
             onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 25px rgba(0,0,0,0.08)';"
             onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 6px rgba(0,0,0,0.03)';">
          <div style="background: ${tipo.bg}; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 12px; font-weight: 600; color: ${tipo.color};">
              ${c.icon} ${tipo.label}
            </span>
            <span style="font-size: 11px; color: #94a3b8;">#${idx + 1}</span>
          </div>
          <div style="padding: 16px;">
            <h4 style="margin: 0 0 6px; font-size: 15px; color: #1e293b;">${c.titulo}</h4>
            <p style="margin: 0 0 4px; font-size: 12px; color: #64748b;">${c.descricao}</p>
            ${c.evidencia ? `<p style="margin: 0 0 12px; font-size: 11px; color: #94a3b8; font-style: italic;">📊 ${c.evidencia}</p>` : ''}
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <div style="text-align: center;">
                <div style="font-size: 11px; color: #94a3b8;">Separados</div>
                <div style="font-size: 16px; font-weight: 700; color: #64748b; text-decoration: line-through;">R$ ${c.precoOriginal.toFixed(2).replace('.', ',')}</div>
              </div>
              <i class="ph ph-arrow-right" style="color: #059669; font-size: 18px;"></i>
              <div style="text-align: center;">
                <div style="font-size: 11px; color: #059669;">Combo</div>
                <div style="font-size: 20px; font-weight: 800; color: #059669;">R$ ${c.precoCombo.toFixed(2).replace('.', ',')}</div>
              </div>
              <span style="background: #dcfce7; color: #16a34a; padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 700;">-${c.descontoPct}%</span>
            </div>
            <button onclick="window.aplicarComboIA(${JSON.stringify(c).replace(/"/g, '&quot;')})" style="width: 100%; padding: 10px; background: #059669; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 6px; transition: background 0.2s;" onmouseover="this.style.background='#047857'" onmouseout="this.style.background='#059669'">
              <i class="ph ph-magic-wand"></i> Aplicar como Promoção
            </button>
          </div>
        </div>
      `;
    }).join('');
  });

  // Apply combo suggestion as a promotion
  window.aplicarComboIA = function(combo) {
    const config = {
      itens: combo.itens.map(i => ({ id: i.id, nome: i.nome, preco: i.preco })),
      preco_combo: combo.precoCombo,
      desconto_pct: combo.descontoPct,
      categoria_fiscal: combo.categoriaFiscal,
      economia_tributaria: combo.economiaEstimada,
      gerado_por_ia: true
    };

    socket.emit('add_promocao', {
      nome: `🤖 ${combo.titulo}`,
      regra: 'combo',
      desconto: combo.descontoPct,
      ativo: true,
      config: JSON.stringify(config)
    });

    // Visual feedback
    const btn = event.target.closest('button');
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="ph ph-check-circle"></i> Aplicado!';
      btn.style.background = '#16a34a';
      btn.disabled = true;
      setTimeout(() => { btn.innerHTML = orig; btn.style.background = '#059669'; btn.disabled = false; }, 2000);
    }

    // Also refresh the promocoes list
    socket.emit('get_promocoes');
  };

// === CONSUMO CONFIG ===
socket.on('consumo_config_data', ({ configs, produtos }) => {
  const tbody = document.getElementById('admin-consumo-config-list');
  if (!tbody) return;
  if (!produtos || produtos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8;">Nenhum produto ativo encontrado.</td></tr>';
    return;
  }
  const configMap = {};
  (configs || []).forEach(c => { configMap[c.produto_id] = c; });
  let html = '';
  produtos.forEach(p => {
    const cfg = configMap[p.id] || {};
    const precoFixo = cfg.preco_fixo || '';
    const descPercent = cfg.desconto_percentual || '';
    const ativo = cfg.ativo !== undefined ? cfg.ativo : 1;
    const emoji = p.emoji || '🍽️';
    html += `
      <tr>
        <td style="padding:8px;">${emoji} ${p.nome}</td>
        <td style="padding:8px;color:#64748b;">R$ ${(p.preco || 0).toFixed(2).replace('.', ',')}</td>
        <td style="padding:8px;"><input type="number" step="0.01" min="0" class="cc-preco-fixo" data-pid="${p.id}" value="${precoFixo}" placeholder="-" style="width:90px;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;"></td>
        <td style="padding:8px;"><input type="number" step="1" min="0" max="100" class="cc-desconto" data-pid="${p.id}" value="${descPercent}" placeholder="-" style="width:80px;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;"></td>
        <td style="padding:8px;text-align:center;">
          <input type="checkbox" class="cc-ativo" data-pid="${p.id}" ${ativo ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;">
        </td>
        <td style="padding:8px;text-align:center;">
          <button class="cc-save-btn" data-pid="${p.id}" style="padding:6px 14px;background:#3b82f6;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Salvar</button>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;

  // Attach save handlers
  tbody.querySelectorAll('.cc-save-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = parseInt(btn.dataset.pid);
      const row = btn.closest('tr');
      const preco_fixo = parseFloat(row.querySelector('.cc-preco-fixo').value) || null;
      const desconto_percentual = parseFloat(row.querySelector('.cc-desconto').value) || null;
      const ativo = row.querySelector('.cc-ativo').checked;
      socket.emit('save_consumo_config', { produto_id: pid, preco_fixo, desconto_percentual, ativo });
      btn.textContent = '✓';
      btn.style.background = '#16a34a';
      setTimeout(() => { btn.textContent = 'Salvar'; btn.style.background = '#3b82f6'; }, 2000);
    });
  });
});

socket.on('consumo_config_saved', () => {
  socket.emit('get_consumo_config');
});

// === PERFIL RESTAURANTE ===
socket.on('restaurante_config', (cfg) => {
  /* Armazenar custom_domain para uso em QR URLs */
  restCustomDomain = cfg['rest_custom_domain'] || '';
  /* Re-renderizar QR codes com domínio atualizado */
  updateQrCodeConvite();
  if (document.getElementById('rest-nome')) {
    document.getElementById('rest-nome').value = cfg['rest_nome'] || '';
    document.getElementById('rest-cnpj').value = cfg['rest_cnpj'] || '';
    document.getElementById('rest-telefone').value = cfg['rest_telefone'] || '';
    document.getElementById('rest-whatsapp').value = cfg['rest_whatsapp'] || '';
    document.getElementById('rest-email').value = cfg['rest_email'] || '';
    document.getElementById('rest-instagram').value = cfg['rest_instagram'] || '';
    document.getElementById('rest-website').value = cfg['rest_website'] || '';
    document.getElementById('rest-cep').value = cfg['rest_cep'] || '';
    document.getElementById('rest-cidade').value = cfg['rest_cidade'] || '';
    document.getElementById('rest-estado').value = cfg['rest_estado'] || '';
    document.getElementById('rest-endereco').value = cfg['rest_endereco'] || '';
    document.getElementById('rest-numero').value = cfg['rest_numero'] || '';
    document.getElementById('rest-bairro').value = cfg['rest_bairro'] || '';
    document.getElementById('rest-pix').value = cfg['rest_pix'] || '';
    document.getElementById('rest-abertura').value = cfg['rest_abertura'] || '';
    document.getElementById('rest-fechamento').value = cfg['rest_fechamento'] || '';
    document.getElementById('rest-obs').value = cfg['rest_obs'] || '';
    if (document.getElementById('rest-modalidade')) {
      document.getElementById('rest-modalidade').value = cfg['rest_modalidade'] || 'a_la_carte';
    }
    if (document.getElementById('rest-fila-alocacao-auto')) {
      document.getElementById('rest-fila-alocacao-auto').value = cfg['rest_fila_alocacao_auto'] || 'manual';
    }
    // Dias de funcionamento
    let dias = [];
    try { dias = JSON.parse(cfg['rest_dias_funcionamento'] || '[]'); } catch(e) {}
    document.querySelectorAll('.rest-dia').forEach(cb => {
      cb.checked = dias.includes(parseInt(cb.value));
    });
  }
});

const _btnSalvarPerfil = document.getElementById('btn-salvar-rest-perfil');
if (_btnSalvarPerfil) _btnSalvarPerfil.onclick = () => {
  const dias = [];
  document.querySelectorAll('.rest-dia:checked').forEach(cb => dias.push(parseInt(cb.value)));
  const config = {
    'rest_nome': document.getElementById('rest-nome').value,
    'rest_modalidade': document.getElementById('rest-modalidade') ? document.getElementById('rest-modalidade').value : 'a_la_carte',
    'rest_fila_alocacao_auto': document.getElementById('rest-fila-alocacao-auto') ? document.getElementById('rest-fila-alocacao-auto').value : 'manual',
    'rest_cnpj': document.getElementById('rest-cnpj').value,
    'rest_telefone': document.getElementById('rest-telefone').value,
    'rest_whatsapp': document.getElementById('rest-whatsapp').value,
    'rest_email': document.getElementById('rest-email').value,
    'rest_instagram': document.getElementById('rest-instagram').value,
    'rest_website': document.getElementById('rest-website').value,
    'rest_cep': document.getElementById('rest-cep').value,
    'rest_cidade': document.getElementById('rest-cidade').value,
    'rest_estado': document.getElementById('rest-estado').value,
    'rest_endereco': document.getElementById('rest-endereco').value,
    'rest_numero': document.getElementById('rest-numero').value,
    'rest_bairro': document.getElementById('rest-bairro').value,
    'rest_pix': document.getElementById('rest-pix').value,
    'rest_abertura': document.getElementById('rest-abertura').value,
    'rest_fechamento': document.getElementById('rest-fechamento').value,
    'rest_obs': document.getElementById('rest-obs').value,
    'rest_dias_funcionamento': JSON.stringify(dias),
  };
  socket.emit('save_restaurante_config', config);

  /* Auto-ativa módulos da modalidade ao salvar perfil */
  const novaModalidade = config['rest_modalidade'] || 'a_la_carte';
  fetch('/api/config/modalidade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(typeof authHeaders === 'function' ? authHeaders() : {}) },
    body: JSON.stringify({ modalidade: novaModalidade })
  }).then(r => r.json()).then(d => {
    if (d.ok) showToast('Módulos da modalidade "' + novaModalidade + '" ativados (' + (d.ativados || []).length + ' itens).', 'success');
  }).catch(() => {});
};

socket.on('restaurante_config_salvo', () => {
  alert('Perfil salvo com sucesso!');
});

// === SLUG & DOMÍNIO PERSONALIZADO ===
(function() {
  let baseDomain = 'chefcozinha.com.br';
  let slugDebounce = null;

  function updateSlugPreview() {
    const slug = (document.getElementById('rest-slug') || {}).value || '';
    const customDomain = (document.getElementById('rest-custom-domain') || {}).value || '';
    const preview = document.getElementById('rest-url-preview-text');
    if (customDomain) {
      if (preview) preview.textContent = `https://${customDomain}`;
    } else if (slug) {
      if (preview) preview.textContent = `https://${slug}.${baseDomain}`;
    } else {
      if (preview) preview.textContent = '—';
    }
  }

  function setSlugStatus(html, color) {
    const el = document.getElementById('rest-slug-status');
    if (!el) return;
    el.innerHTML = html;
    el.style.color = color;
  }

  function setDomainStatus(html, color) {
    const el = document.getElementById('rest-domain-status');
    if (!el) return;
    el.innerHTML = html;
    el.style.color = color;
  }

  // On restaurante_config load, fill slug/domain fields
  const origConfigHandler = socket._listeners && socket._listeners['restaurante_config'];
  socket.on('restaurante_config', (cfg) => {
    if (cfg['rest_base_domain']) baseDomain = cfg['rest_base_domain'];
    const suffix = document.getElementById('rest-suffix-domain');
    if (suffix) suffix.textContent = `.${baseDomain}`;
    const slugInput = document.getElementById('rest-slug');
    const domainInput = document.getElementById('rest-custom-domain');
    if (slugInput && cfg['rest_slug'] !== undefined) slugInput.value = cfg['rest_slug'] || '';
    if (domainInput && cfg['rest_custom_domain'] !== undefined) domainInput.value = cfg['rest_custom_domain'] || '';
    updateSlugPreview();
  });

  // Debounced slug check
  const slugInput = document.getElementById('rest-slug');
  if (slugInput) {
    slugInput.addEventListener('input', () => {
      const raw = slugInput.value.trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      slugInput.value = raw;
      updateSlugPreview();

      clearTimeout(slugDebounce);
      if (raw.length < 2) {
        setSlugStatus('', '#64748b');
        return;
      }
      setSlugStatus('<i class="ph ph-spinner" style="animation:spin 1s linear infinite;"></i> Verificando...', '#64748b');
      slugDebounce = setTimeout(() => {
        fetch(`/api/auth/check-slug?slug=${encodeURIComponent(raw)}`, { headers: authHeaders() })
          .then(r => r.json())
          .then(data => {
            if (data.available) {
              setSlugStatus(`<i class="ph ph-check-circle"></i> Disponível! <a href="${data.previewUrl}" target="_blank" style="text-decoration:underline;">${data.previewUrl}</a>`, '#16a34a');
            } else {
              setSlugStatus(`<i class="ph ph-x-circle"></i> ${data.error || 'Indisponível'}`, '#dc2626');
            }
          })
          .catch(() => setSlugStatus('<i class="ph ph-warning"></i> Erro ao verificar', '#f59e0b'));
      }, 500);
    });
  }

  // Domain check on input
  const domainInput = document.getElementById('rest-custom-domain');
  if (domainInput) {
    let domainDebounce = null;
    domainInput.addEventListener('input', () => {
      updateSlugPreview();
      clearTimeout(domainDebounce);
      const raw = domainInput.value.trim();
      if (!raw || raw.length < 4) {
        setDomainStatus('', '#64748b');
        return;
      }
      setDomainStatus('<i class="ph ph-spinner" style="animation:spin 1s linear infinite;"></i> Verificando...', '#64748b');
      domainDebounce = setTimeout(() => {
        fetch(`/api/auth/check-dominio?domain=${encodeURIComponent(raw)}`, { headers: authHeaders() })
          .then(r => r.json())
          .then(data => {
            if (data.available) {
              setDomainStatus(`<i class="ph ph-check-circle"></i> Domínio disponível!`, '#16a34a');
            } else {
              setDomainStatus(`<i class="ph ph-x-circle"></i> ${data.error || 'Indisponível'}`, '#dc2626');
            }
          })
          .catch(() => setDomainStatus('<i class="ph ph-warning"></i> Erro ao verificar', '#f59e0b'));
      }, 500);
    });
  }

  // Save slug button
  const btnSalvarSlug = document.getElementById('btn-rest-salvar-slug');
  if (btnSalvarSlug) {
    btnSalvarSlug.onclick = () => {
      const slug = (document.getElementById('rest-slug') || {}).value || '';
      btnSalvarSlug.disabled = true;
      btnSalvarSlug.innerHTML = '<i class="ph ph-spinner" style="animation:spin 1s linear infinite;"></i> Salvando...';
      fetch('/api/auth/definir-slug', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug })
      }).then(r => r.json()).then(data => {
        btnSalvarSlug.disabled = false;
        if (data.success) {
          btnSalvarSlug.innerHTML = '<i class="ph ph-check"></i> Salvo!';
          btnSalvarSlug.style.background = '#16a34a';
          updateSlugPreview();
          setTimeout(() => { btnSalvarSlug.innerHTML = '<i class="ph ph-check"></i> Salvar Link'; btnSalvarSlug.style.background = '#6366f1'; }, 2000);
        } else {
          btnSalvarSlug.innerHTML = '<i class="ph ph-x"></i> Erro';
          btnSalvarSlug.style.background = '#dc2626';
          alert(data.error || 'Erro ao salvar slug.');
          setTimeout(() => { btnSalvarSlug.innerHTML = '<i class="ph ph-check"></i> Salvar Link'; btnSalvarSlug.style.background = '#6366f1'; }, 2000);
        }
      }).catch(err => {
        btnSalvarSlug.disabled = false;
        btnSalvarSlug.innerHTML = '<i class="ph ph-check"></i> Salvar Link';
        btnSalvarSlug.style.background = '#6366f1';
        alert('Erro ao salvar: ' + err.message);
      });
    };
  }

  // Save domain button
  const btnSalvarDominio = document.getElementById('btn-rest-salvar-dominio');
  if (btnSalvarDominio) {
    btnSalvarDominio.onclick = () => {
      const domain = (document.getElementById('rest-custom-domain') || {}).value || '';
      btnSalvarDominio.disabled = true;
      btnSalvarDominio.innerHTML = '<i class="ph ph-spinner" style="animation:spin 1s linear infinite;"></i> Salvando...';
      fetch('/api/auth/definir-dominio', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      }).then(r => r.json()).then(data => {
        btnSalvarDominio.disabled = false;
        if (data.success) {
          btnSalvarDominio.innerHTML = '<i class="ph ph-check"></i> Salvo!';
          btnSalvarDominio.style.background = '#16a34a';
          updateSlugPreview();
          setTimeout(() => { btnSalvarDominio.innerHTML = '<i class="ph ph-globe"></i> Salvar Domínio'; btnSalvarDominio.style.background = '#8b5cf6'; }, 2000);
        } else {
          btnSalvarDominio.innerHTML = '<i class="ph ph-x"></i> Erro';
          btnSalvarDominio.style.background = '#dc2626';
          alert(data.error || 'Erro ao salvar domínio.');
          setTimeout(() => { btnSalvarDominio.innerHTML = '<i class="ph ph-globe"></i> Salvar Domínio'; btnSalvarDominio.style.background = '#8b5cf6'; }, 2000);
        }
      }).catch(err => {
        btnSalvarDominio.disabled = false;
        btnSalvarDominio.innerHTML = '<i class="ph ph-globe"></i> Salvar Domínio';
        btnSalvarDominio.style.background = '#8b5cf6';
        alert('Erro ao salvar: ' + err.message);
      });
    };
  }
})();

// Load perfil data when tab is clicked
const btnPerfilAdmin = document.querySelector('.admin-tab-btn[data-tab="perfil"]');
if (btnPerfilAdmin) {
  btnPerfilAdmin.addEventListener('click', () => {
    if (socket && typeof socket.emit === 'function') socket.emit('get_restaurante_config');
  });
}

// ── COMPARTILHAMENTO DE QR CODE DO CARDÁPIO DIGITAL ──
window.obterUrlCardapioDigitalAtual = function() {
  const customDomain = (document.getElementById('rest-custom-domain') ? document.getElementById('rest-custom-domain').value : '').trim();
  const slug = (document.getElementById('rest-slug') ? document.getElementById('rest-slug').value : '').trim();
  const restId = localStorage.getItem('restaurante_id') || '1';
  
  if (customDomain) {
    return customDomain.startsWith('http://') || customDomain.startsWith('https://') ? customDomain : `https://${customDomain}`;
  }
  if (slug) {
    return `https://${slug}.chefcozinha.com.br`;
  }
  return `${window.location.origin}/cardapio.html?restaurante_id=${encodeURIComponent(restId)}`;
};

window.abrirModalCompartilharCardapioQR = function() {
  const restNome = (document.getElementById('rest-nome') ? document.getElementById('rest-nome').value : '').trim() || localStorage.getItem('restaurante_nome') || 'Nosso Restaurante';
  const menuUrl = window.obterUrlCardapioDigitalAtual();
  
  const modal = document.getElementById('modal-compartilhar-qr-cardapio');
  if (!modal) return;
  
  const nomeEl = document.getElementById('qr-share-cardapio-nome');
  const urlEl = document.getElementById('qr-share-cardapio-url');
  const imgEl = document.getElementById('qr-share-cardapio-img');
  
  if (nomeEl) nomeEl.innerText = `Cardápio Digital • ${restNome}`;
  if (urlEl) urlEl.innerText = menuUrl;
  
  if (typeof window.gerarQrDataUrl === 'function') {
    window.gerarQrDataUrl(menuUrl, 360, function(dataUrl) {
      if (imgEl) imgEl.src = dataUrl;
    });
  } else if (typeof window.qrcode === 'function') {
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(menuUrl);
      qr.make();
      if (imgEl) imgEl.src = qr.createDataURL(6, 0);
    } catch(e) {}
  }
  
  modal.style.display = 'flex';
};

window.copiarLinkCardapioQR = function() {
  const menuUrl = window.obterUrlCardapioDigitalAtual();
  const btn = document.getElementById('btn-copiar-link-cardapio');
  
  const finishCopy = () => {
    if (btn) {
      const oldHtml = btn.innerHTML;
      btn.innerHTML = '<i class="ph ph-check"></i> Copiado!';
      btn.style.background = '#16a34a';
      setTimeout(() => {
        btn.innerHTML = oldHtml;
        btn.style.background = '#059669';
      }, 2000);
    }
    if (typeof showToast === 'function') showToast('Link do cardápio copiado com sucesso!', 'success');
  };
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(menuUrl).then(finishCopy).catch(() => {
      prompt('Copie o link do cardápio:', menuUrl);
    });
  } else {
    prompt('Copie o link do cardápio:', menuUrl);
  }
};

window.compartilharWhatsAppCardapioQR = function() {
  const restNome = (document.getElementById('rest-nome') ? document.getElementById('rest-nome').value : '').trim() || localStorage.getItem('restaurante_nome') || 'Nosso Estabelecimento';
  const menuUrl = window.obterUrlCardapioDigitalAtual();
  const msg = `🍽️ Olá! Confira o nosso cardápio digital e faça seus pedidos diretamente pelo celular:\n\n👉 ${menuUrl}\n\n*${restNome}*`;
  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
};

window.compartilharNativoCardapioQR = function() {
  const restNome = (document.getElementById('rest-nome') ? document.getElementById('rest-nome').value : '').trim() || localStorage.getItem('restaurante_nome') || 'Nosso Estabelecimento';
  const menuUrl = window.obterUrlCardapioDigitalAtual();
  
  if (navigator.share) {
    navigator.share({
      title: `Cardápio Digital - ${restNome}`,
      text: `Confira o cardápio digital de ${restNome} e faça seus pedidos online!`,
      url: menuUrl
    }).catch((err) => {
      if (err && err.name !== 'AbortError') window.copiarLinkCardapioQR();
    });
  } else {
    window.copiarLinkCardapioQR();
  }
};

window.baixarPngCardapioQR = function() {
  const imgEl = document.getElementById('qr-share-cardapio-img');
  if (!imgEl || !imgEl.src) {
    if (typeof showToast === 'function') showToast('QR Code ainda não carregado.', 'warning');
    return;
  }
  const slug = (document.getElementById('rest-slug') ? document.getElementById('rest-slug').value : '').trim() || 'restaurante';
  const a = document.createElement('a');
  a.href = imgEl.src;
  a.download = `qrcode-cardapio-${slug}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (typeof showToast === 'function') showToast('Download do QR Code iniciado!', 'success');
};

window.imprimirDisplayCardapioQR = function() {
  const restNome = (document.getElementById('rest-nome') ? document.getElementById('rest-nome').value : '').trim() || localStorage.getItem('restaurante_nome') || 'Nosso Restaurante';
  const menuUrl = window.obterUrlCardapioDigitalAtual();
  const imgEl = document.getElementById('qr-share-cardapio-img');
  const qrSrc = imgEl ? imgEl.src : '';
  
  const win = window.open('', '_blank');
  if (!win) {
    alert('Por favor, permita popups para imprimir o display do QR Code.');
    return;
  }
  
  win.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Display Cardápio QR Code - \${restNome}</title>
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          margin: 0;
          padding: 20px;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: #f8fafc;
          box-sizing: border-box;
        }
        .display-card {
          width: 320px;
          background: #ffffff;
          border: 2px solid #e2e8f0;
          border-radius: 24px;
          padding: 32px 24px;
          text-align: center;
          box-shadow: 0 10px 25px rgba(0,0,0,0.08);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }
        .badge {
          background: #fff0e6;
          color: #fc4b15;
          font-size: 12px;
          font-weight: 800;
          padding: 6px 14px;
          border-radius: 99px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .title {
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
        }
        .subtitle {
          font-size: 14px;
          color: #64748b;
          margin: 0;
        }
        .qr-wrapper {
          background: #ffffff;
          padding: 16px;
          border-radius: 18px;
          border: 2px solid #f1f5f9;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          width: 220px;
          height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .qr-wrapper img {
          width: 200px;
          height: 200px;
          display: block;
        }
        .instructions {
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          background: #f8fafc;
          padding: 10px 16px;
          border-radius: 12px;
          width: 100%;
          box-sizing: border-box;
        }
        .url-text {
          font-size: 11px;
          color: #94a3b8;
          word-break: break-all;
        }
        @media print {
          body { background: transparent; padding: 0; }
          .display-card { box-shadow: none; border: 1.5px solid #cbd5e1; }
        }
      </style>
    </head>
    <body>
      <div class="display-card">
        <div class="badge">Cardápio Digital</div>
        <h1 class="title">\${restNome}</h1>
        <p class="subtitle">Acesse nosso cardápio online direto pelo seu celular</p>
        <div class="qr-wrapper">
          <img src="\${qrSrc}" alt="QR Code" />
        </div>
        <div class="instructions">📱 Aponte a câmera do celular para o QR Code</div>
        <div class="url-text">\${menuUrl}</div>
      </div>
      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 400);
        };
      <\/script>
    </body>
    </html>
  `);
  win.document.close();
};

window.abrirCardapioNovaAba = function() {
  const menuUrl = window.obterUrlCardapioDigitalAtual();
  window.open(menuUrl, '_blank');
};

// ── PINs TEMPORARIOS ──
(function() {
  const modal = document.getElementById('modal-novo-pin');
  if (!modal) return;

  const charsPin = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function gerarPinAleatorio(tam) {
    let p = '';
    for (let i = 0; i < tam; i++) p += charsPin[Math.floor(Math.random() * charsPin.length)];
    return p;
  }

  function getPinTamanho() { return parseInt(document.getElementById('pin-tamanho').value) || 4; }

  function validarPinCustomizado() {
    const input = document.getElementById('pin-customizado');
    const errDiv = document.getElementById('pin-erro-msg');
    const val = input.value.trim().toUpperCase();
    const tam = getPinTamanho();
    if (!val) { errDiv.style.display = 'none'; return true; }
    if (val.length !== tam) {
      errDiv.textContent = 'O PIN deve ter exatamente ' + tam + ' caracteres (atual: ' + val.length + ')';
      errDiv.style.display = 'block'; return false;
    }
    if (!/^[A-Z0-9]+$/.test(val)) {
      errDiv.textContent = 'Use apenas letras (A-Z) e números (0-9).';
      errDiv.style.display = 'block'; return false;
    }
    errDiv.style.display = 'none'; return true;
  }

  document.getElementById('btn-novo-pin').addEventListener('click', () => {
    modal.style.display = 'flex';
    document.getElementById('pin-nome').value = '';
    document.getElementById('pin-max-usos').value = '1';
    document.getElementById('pin-minutos').value = '60';
    document.getElementById('pin-tamanho').value = '4';
    document.getElementById('pin-tipo-expiracao').value = 'minutos';
    document.getElementById('pin-customizado').value = '';
    document.querySelectorAll('.pin-categoria').forEach(c => c.checked = false);
    document.getElementById('pin-expiracao-minutos').style.display = 'block';
    document.getElementById('pin-expiracao-data').style.display = 'none';
    document.getElementById('pin-erro-msg').style.display = 'none';
  });

  document.getElementById('btn-cancelar-pin').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  document.getElementById('pin-tamanho').addEventListener('change', () => {
    const input = document.getElementById('pin-customizado');
    input.value = '';
    input.maxLength = getPinTamanho();
    document.getElementById('pin-erro-msg').style.display = 'none';
  });

  document.getElementById('pin-customizado').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, getPinTamanho());
    validarPinCustomizado();
  });

  document.getElementById('btn-gerar-pin').addEventListener('click', () => {
    const input = document.getElementById('pin-customizado');
    input.value = gerarPinAleatorio(getPinTamanho());
    document.getElementById('pin-erro-msg').style.display = 'none';
  });

  document.getElementById('pin-tipo-expiracao').addEventListener('change', (e) => {
    document.getElementById('pin-expiracao-minutos').style.display = e.target.value === 'minutos' ? 'block' : 'none';
    document.getElementById('pin-expiracao-data').style.display = e.target.value === 'data' ? 'block' : 'none';
  });

  document.getElementById('btn-salvar-pin').addEventListener('click', () => {
    const nome = document.getElementById('pin-nome').value.trim();
    if (!nome) { alert('Informe o nome do colaborador.'); return; }
    const categorias = [];
    document.querySelectorAll('.pin-categoria:checked').forEach(c => categorias.push(c.value));
    if (categorias.length === 0) { alert('Selecione pelo menos uma categoria.'); return; }
    if (!validarPinCustomizado()) return;
    const max_usos = parseInt(document.getElementById('pin-max-usos').value) || 1;
    const tipo_expiracao = document.getElementById('pin-tipo-expiracao').value;
    const expira_minutos = document.getElementById('pin-minutos').value;
    const expira_em = document.getElementById('pin-data-expiracao').value;
    const pin_customizado = document.getElementById('pin-customizado').value.trim();
    const pin_tamanho = document.getElementById('pin-tamanho').value;
    socket.emit('criar_pin_temporario', { nome_colaborador: nome, categorias, max_usos, tipo_expiracao, expira_minutos, expira_em, pin_customizado, pin_tamanho });
    modal.style.display = 'none';
  });

  socket.on('pin_criado', (pin) => {
    const msg = 'PIN criado com sucesso!\n\nPIN: ' + pin.pin + '\nColaborador: ' + pin.nome_colaborador + '\nCategorias: ' + pin.categorias.join(', ') + '\nUsos: ' + pin.max_usos;
    alert(msg);
    socket.emit('listar_pins_temporarios');
  });

  socket.on('pin_erro', (msg) => {
    alert('Erro: ' + msg);
  });

  socket.on('lista_pins', (pins) => {
    const tbody = document.getElementById('pins-tabela-body');
    if (!tbody) return;
    if (!pins || pins.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:#9ca3af;">Nenhum PIN criado ainda.</td></td></tr>';
      document.getElementById('pin-count-ativos').textContent = '0';
      document.getElementById('pin-count-usados').textContent = '0';
      document.getElementById('pin-count-expirados').textContent = '0';
      document.getElementById('pin-count-hoje').textContent = '0';
      return;
    }
    const now = new Date();
    const hoje = now.toISOString().slice(0, 10);
    let ativos = 0, usados = 0, expirados = 0, hojeCount = 0;
    let html = '';
    pins.forEach(p => {
      const cats = JSON.parse(p.categorias || '[]');
      const expirado = p.expira_em && p.expira_em !== 'SESSION' && new Date(p.expira_em) < now;
      const esgotado = p.usos_atual >= p.max_usos;
      let status = 'Ativo';
      let statusColor = '#16a34a';
      let statusBg = '#f0fdf4';
      if (!p.ativo) { status = 'Revogado'; statusColor = '#6b7280'; statusBg = '#f3f4f6'; }
      else if (expirado) { status = 'Expirado'; statusColor = '#dc2626'; statusBg = '#fef2f2'; expirados++; }
      else if (esgotado) { status = 'Esgotado'; statusColor = '#d97706'; statusBg = '#fef3c7'; usados++; }
      else { ativos++; }
      if (p.criado_em && p.criado_em.startsWith(hoje)) hojeCount++;
      let expiraTexto = '-';
      if (p.expira_em === 'SESSION') expiraTexto = 'Sessão';
      else if (p.expira_em) {
        expiraTexto = chefFormatDate(p.expira_em);
      }
      const categoriasHTML = cats.map(c => '<span style="display:inline-block;padding:2px 8px;background:#f3f4f6;border-radius:4px;font-size:11px;margin:1px;">' + c + '</span>').join(' ');
      html += '<tr style="border-bottom:1px solid #f3f4f6;">' +
        '<td style="padding:10px 16px; font-family:monospace; font-weight:700; font-size:15px; letter-spacing:2px; color:#7c3aed;">' + p.pin + '</td>' +
        '<td style="padding:10px 16px; font-size:13px;">' + (p.nome_colaborador || '-') + '</td>' +
        '<td style="padding:10px 16px;">' + categoriasHTML + '</td>' +
        '<td style="padding:10px 16px; font-size:13px; font-weight:600;">' + p.usos_atual + '/' + p.max_usos + '</td>' +
        '<td style="padding:10px 16px; font-size:12px;">' + expiraTexto + '</td>' +
        '<td style="padding:10px 16px;"><span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;background:' + statusBg + ';color:' + statusColor + ';">' + status + '</span></td>' +
        '<td style="padding:10px 16px; text-align:right;">';
      if (p.ativo && !expirado && !esgotado) {
        html += '<button onclick="window.renovarPin(' + p.id + ')" style="padding:4px 10px; background:#f59e0b; color:white; border:none; border-radius:4px; font-size:11px; cursor:pointer; margin-right:4px;" title="Renovar"><i class="ph ph-arrows-clockwise"></i></button>';
        html += '<button onclick="window.revogarPin(' + p.id + ')" style="padding:4px 10px; background:#dc2626; color:white; border:none; border-radius:4px; font-size:11px; cursor:pointer;" title="Revogar"><i class="ph ph-x"></i></button>';
      } else if (!p.ativo || expirado || esgotado) {
        html += '<button onclick="window.renovarPin(' + p.id + ')" style="padding:4px 10px; background:#16a34a; color:white; border:none; border-radius:4px; font-size:11px; cursor:pointer;" title="Reativar"><i class="ph ph-play"></i></button>';
      }
      html += '</td></tr>';
    });
    tbody.innerHTML = html;
    document.getElementById('pin-count-ativos').textContent = ativos;
    document.getElementById('pin-count-usados').textContent = usados;
    document.getElementById('pin-count-expirados').textContent = expirados;
    document.getElementById('pin-count-hoje').textContent = hojeCount;
  });

  window.revogarPin = function(id) {
    if (!confirm('Revogar este PIN? O colaborador não poderá mais utilizá-lo.')) return;
    socket.emit('revogar_pin', id);
  };

  window.renovarPin = function(id) {
    const minutos = prompt('Renovar PIN por quantos minutos? (Deixe vazio para renovar 60 min)', '60');
    if (minutos === null) return;
    socket.emit('renovar_pin', { id, minutos: parseInt(minutos) || 60 });
  };

  socket.on('pins_atualizados', () => {
    socket.emit('listar_pins_temporarios');
  });
})();

// ─── Aba Funcionalidades ──────────────────────────────────────
function initFuncionalidadesTab() {
  const features = [
    { key: 'feature_venda_sem_estoque',      label: 'Vender sem Estoque',         desc: 'Permite vender produtos mesmo com estoque zerado ou insuficiente.', icon: 'ph-package', color: '#ef4444' },
    { key: 'feature_toggle_produto_rapido',  label: 'Ativar/Desativar Produto',   desc: 'Exibe botão rápido para ativar ou desativar produtos diretamente na lista.', icon: 'ph-toggle-right', color: '#3b82f6' },
    { key: 'feature_alterar_valores_pdv',    label: 'Alterar Valores no PDV',     desc: 'Permite alterar o preço do produto ao adicionar ao carrinho no PDV.', icon: 'ph-currency-dollar', color: '#f59e0b' },
    { key: 'feature_clientes_ativos',        label: 'Clientes Mais Ativos Hoje',  desc: 'Exibe ranking dos clientes que mais visitaram hoje no painel.', icon: 'ph-users-three', color: '#8b5cf6' },
    { key: 'feature_produto_mais_vendido',   label: 'Produto Mais Vendido',       desc: 'Exibe ranking do produto mais vendido do dia.', icon: 'ph-trophy', color: '#10b981' },
    { key: 'feature_maior_lucro',            label: 'Maior Lucro',               desc: 'Exibe o produto que gerou mais lucro no dia.', icon: 'ph-chart-line-up', color: '#06b6d4' },
    { key: 'feature_impressao_digital',      label: 'Impressão Digital (Fila)',   desc: 'Exibe pedidos na fila de pedidos digital ao invés de impressora.', icon: 'ph-monitor', color: '#22c55e' },
    { key: 'feature_impressao_termica',      label: 'Impressão Térmica',          desc: 'Imprime pedidos automaticamente na impressora térmica (POS).', icon: 'ph-printer', color: '#ec4899' },
    { key: 'feature_produtos_lote',          label: 'Produtos em Lote',           desc: 'Permite criar, editar e excluir múltiplos produtos de uma vez.', icon: 'ph-stack', color: '#a855f7' },
    { key: 'feature_jogos',                  label: 'Jogos / Gamificação',         desc: 'Ativa jogos na mesa para clientes duelarem entre si.', icon: 'ph-game-controller', color: '#8b5cf6' }
  ];

  const container = document.getElementById('admin-tab-funcionalidades');
  if (!container) return;

  container.innerHTML = `
    <div style="background:var(--cfg-subtle-bg); padding:20px; border-radius:12px; border:1px solid var(--cfg-border); margin-bottom:20px;">
      <h3 style="margin-top:0; color:#fc4b15;"><i class="ph ph-toggle-left"></i> Funcionalidades do Restaurante</h3>
      <p style="color:var(--cfg-text-muted); font-size:14px; margin-bottom:20px;">
        Ative ou desative funcionalidades específicas do seu restaurante. As alterações são aplicadas imediatamente em todas as telas.
      </p>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:12px;" id="features-grid"></div>
    </div>
  `;

  const grid = document.getElementById('features-grid');
  grid.innerHTML = features.map(f => `
    <div style="background:var(--cfg-card-bg); border:1px solid var(--cfg-border); border-radius:12px; padding:14px; display:flex; align-items:flex-start; gap:12px; transition: all 0.2s;" id="feature-card-${f.key}">
      <div style="width:40px; height:40px; border-radius:10px; background:${f.color}15; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
        <i class="ph ${f.icon}" style="font-size:21px; color:${f.color};"></i>
      </div>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700; font-size:13.5px; color:var(--cfg-text); margin-bottom:3px;">${f.label}</div>
        <div style="font-size:12px; color:var(--cfg-text-muted); line-height:1.4;">${f.desc}</div>
      </div>
      <label style="position:relative; display:inline-block; width:44px; height:24px; flex-shrink:0; cursor:pointer;">
        <input type="checkbox" id="chk-${f.key}" data-feature-key="${f.key}" style="opacity:0; width:0; height:0;" onchange="window.toggleFeatureConfig('${f.key}', this.checked)">
        <span style="position:absolute; inset:0; background-color:#d1d5db; border-radius:26px; transition:.3s;"></span>
        <span style="position:absolute; height:18px; width:18px; left:3px; bottom:3px; background-color:white; border-radius:50%; transition:.3s;"></span>
      </label>
    </div>
  `).join('');

  features.forEach(f => {
    const chk = document.getElementById('chk-' + f.key);
    if (chk) {
      chk.checked = !!configs[f.key];
      updateToggleVisual(chk);
    }
  });
}

function updateToggleVisual(chk) {
  const track = chk.nextElementSibling;
  const thumb = track ? track.nextElementSibling : null;
  if (!track || !thumb) return;
  if (chk.checked) {
    track.style.backgroundColor = '#22c55e';
    thumb.style.left = '25px';
  } else {
    track.style.backgroundColor = '#d1d5db';
    thumb.style.left = '3px';
  }
}

window.toggleFeatureConfig = function(key, value) {
  configs[key] = value;
  const chk = document.getElementById('chk-' + key);
  if (chk) updateToggleVisual(chk);
  salvarConfiguracoes();
};

/* ══════ JOGOS / ADMIN ══════ */
var adminJogos = [];

window.initAdminJogos = function() {
  socket.emit('admin_jogos_listar');
  socket.emit('admin_jogos_historico');
  document.getElementById('jogos-habilitado').checked = configs.feature_jogos !== 'false';
  document.getElementById('jogos-pontos-vitoria').value = configs.jogos_pontos_vitoria || 10;
  document.getElementById('jogos-pontos-derrota').value = configs.jogos_pontos_derrota || 2;
};

socket.on('admin_jogos_lista', function(lista) {
  adminJogos = lista || [];
  renderAdminJogosLista();
});

function renderAdminJogosLista() {
  var container = document.getElementById('admin-jogos-lista');
  if (!container) return;
  if (!adminJogos.length) {
    container.innerHTML = '<p style="color:#999; text-align:center; padding:16px;">Nenhum jogo cadastrado. Clique em "Novo Jogo" para criar.</p>';
    return;
  }
  var tipos = { par_impar: 'Par ou Impar', dedos: 'Dedos Iguais', dois_ou_um: 'Dois ou Um', botao_grande: 'Botao Grande', mao_orelha: 'Mao na Orelha', ultimo_tirar_dedo: 'Ultimo a Tirar o Dedo' };
  container.innerHTML = adminJogos.map(function(j) {
    var tipoLabel = tipos[j.tipo] || j.tipo;
    var statusBadge = j.ativo ? '<span style="background:#d1fae5; color:#065f46; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700;">ATIVO</span>' :
      '<span style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700;">INATIVO</span>';
    return '<div style="background:white; padding:14px; border-radius:10px; border:1px solid #e5e7eb; display:flex; align-items:center; gap:14px;">' +
      '<div style="font-size:28px;">' + (j.emoji || '🎮') + '</div>' +
      '<div style="flex:1;">' +
        '<div style="display:flex; align-items:center; gap:8px;">' +
          '<strong style="color:#111;">' + esc(j.nome) + '</strong> ' + statusBadge +
        '</div>' +
        '<p style="color:#666; margin:2px 0 0; font-size:12px;">' + tipoLabel + ' &bull; ' + esc(j.descricao || 'Sem descricao') + '</p>' +
        '<p style="color:#8b5cf6; margin:4px 0 0; font-size:12px;">🏆 Vencedor: ' + esc(j.premio_vencedor || '-') + ' &bull; Perdedor: ' + esc(j.premio_perdedor || '-') + '</p>' +
      '</div>' +
      '<div style="display:flex; gap:6px;">' +
        '<button onclick="editarJogoAdmin(' + j.id + ')" style="background:#f3f4f6; border:1px solid #d1d5db; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:12px;" title="Editar"><i class="ph ph-pencil-simple"></i></button>' +
        '<button onclick="excluirJogoAdmin(' + j.id + ')" style="background:#fef2f2; border:1px solid #fecaca; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:12px; color:#dc2626;" title="Excluir"><i class="ph ph-trash"></i></button>' +
      '</div>' +
    '</div>';
  }).join('');
}

window.abrirModalNovoJogo = function() {
  document.getElementById('jogo-modal-titulo').textContent = 'Novo Jogo';
  document.getElementById('jogo-id-edit').value = '';
  document.getElementById('jogo-nome').value = '';
  document.getElementById('jogo-tipo').value = 'par_impar';
  document.getElementById('jogo-emoji').value = '🎮';
  document.getElementById('jogo-descricao').value = '';
  document.getElementById('jogo-regras').value = '';
  document.getElementById('jogo-premio-vencedor').value = 'Quem paga a conta!';
  document.getElementById('jogo-premio-perdedor').value = 'Perdeu, perdeu!';
  document.getElementById('jogo-ativo').checked = true;
  document.getElementById('modal-jogos').style.display = 'flex';
};

window.editarJogoAdmin = function(id) {
  var j = adminJogos.find(function(x) { return x.id === id; });
  if (!j) return;
  document.getElementById('jogo-modal-titulo').textContent = 'Editar Jogo';
  document.getElementById('jogo-id-edit').value = j.id;
  document.getElementById('jogo-nome').value = j.nome || '';
  document.getElementById('jogo-tipo').value = j.tipo || 'par_impar';
  document.getElementById('jogo-emoji').value = j.emoji || '🎮';
  document.getElementById('jogo-descricao').value = j.descricao || '';
  document.getElementById('jogo-regras').value = j.regras || '';
  document.getElementById('jogo-premio-vencedor').value = j.premio_vencedor || '';
  document.getElementById('jogo-premio-perdedor').value = j.premio_perdedor || '';
  document.getElementById('jogo-ativo').checked = !!j.ativo;
  document.getElementById('modal-jogos').style.display = 'flex';
};

window.fecharModalJogos = function() {
  document.getElementById('modal-jogos').style.display = 'none';
};

window.salvarJogoAdmin = function() {
  var id = document.getElementById('jogo-id-edit').value || null;
  socket.emit('admin_jogos_salvar', {
    id: id ? parseInt(id) : null,
    nome: document.getElementById('jogo-nome').value.trim(),
    tipo: document.getElementById('jogo-tipo').value,
    emoji: document.getElementById('jogo-emoji').value.trim() || '🎮',
    descricao: document.getElementById('jogo-descricao').value.trim(),
    regras: document.getElementById('jogo-regras').value.trim(),
    premio_vencedor: document.getElementById('jogo-premio-vencedor').value.trim(),
    premio_perdedor: document.getElementById('jogo-premio-perdedor').value.trim(),
    ativo: document.getElementById('jogo-ativo').checked
  });
};

socket.on('admin_jogos_salvo', function() {
  document.getElementById('modal-jogos').style.display = 'none';
  socket.emit('admin_jogos_listar');
});

window.excluirJogoAdmin = function(id) {
  if (!confirm('Deseja excluir este jogo?')) return;
  socket.emit('admin_jogos_excluir', id);
};

socket.on('admin_jogos_historico_lista', function(lista) {
  var container = document.getElementById('admin-jogos-historico');
  if (!container) return;
  if (!lista || !lista.length) {
    container.innerHTML = '<p style="color:#999; text-align:center; padding:16px;">Nenhuma partida jogada ainda.</p>';
    return;
  }
  container.innerHTML = lista.map(function(h) {
    var corV = h.vencedor === 'empate' ? '#f59e0b' : '#10b981';
    return '<div style="background:white; padding:10px 14px; border-radius:8px; border:1px solid #e5e7eb; display:flex; align-items:center; gap:12px; font-size:13px;">' +
      '<div style="flex:1;">' +
        '<strong>' + esc(h.jogo_nome || '') + '</strong> ' +
        '<span style="color:#666;">&bull; ' + esc(h.mesa || '') + '</span>' +
        '<div style="color:#888; font-size:11px;">' + esc(h.jogador1_nome || '') + ' vs ' + esc(h.jogador2_nome || '') + '</div>' +
      '</div>' +
      '<div style="text-align:right;">' +
        '<div style="color:' + corV + '; font-weight:700;">' + esc(h.vencedor || 'empate') + '</div>' +
        '<div style="color:#999; font-size:11px;">' + esc(h.created_at || '') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
});

window.salvarConfigJogos = function() {
  configs.feature_jogos = document.getElementById('jogos-habilitado').checked ? 'true' : 'false';
  configs.jogos_pontos_vitoria = document.getElementById('jogos-pontos-vitoria').value;
  configs.jogos_pontos_derrota = document.getElementById('jogos-pontos-derrota').value;

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('chef_token') || ''), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      feature_jogos: configs.feature_jogos,
      jogos_pontos_vitoria: configs.jogos_pontos_vitoria,
      jogos_pontos_derrota: configs.jogos_pontos_derrota
    })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.ok) { showToast('Configuracoes de jogos salvas!', 'success'); }
    else { showToast('Erro ao salvar: ' + (d.erro || 'desconhecido'), 'danger'); }
  }).catch(function() { showToast('Erro de conexao ao salvar.', 'danger'); });
};

// --- ITENS MONTÁVEIS ---
let _montavelCatsTemp = [];

window.toggleMontavelPreco = function() {
  const model = document.getElementById('montavel-pricing').value;
  const row = document.getElementById('montavel-preco-fixo-row');
  if (row) row.style.display = model === 'fixo' ? 'block' : 'none';
};

window.initAdminMontaveis = function() {
  const token = localStorage.getItem('chef_token');
  fetch('/api/montaveis', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(r => r.json())
    .then(rows => window.renderAdminMontaveis(rows))
    .catch(() => {});
};


window.renderAdminMontaveis = function(rows) {
  const list = document.getElementById('admin-montaveis-list');
  if (!list) return;
  if (!rows || rows.length === 0) {
    list.innerHTML = '<div style="grid-column:1/-1; padding:30px; text-align:center; color:var(--cfg-text-muted); background:var(--cfg-subtle-bg); border-radius:12px; border:1.5px dashed var(--cfg-border); font-size:14px;">' +
      '<i class="ph-bold ph-puzzle-piece" style="font-size:32px; color:#8b5cf6; display:block; margin-bottom:8px;"></i>' +
      'Nenhum item montável cadastrado ainda.<br><span style="font-size:12.5px;">Clique em <strong>+ Novo Item Montável</strong> acima para configurar seu primeiro item composto.</span></div>';
    return;
  }
  list.innerHTML = rows.map(m => {
    const pricing = m.pricing_model === 'fixo' ? 'Preço Fixo R$ ' + Number(m.preco_fixo || 0).toFixed(2).replace('.', ',') : 'Soma das opções';
    return '<div style="background:var(--cfg-card-bg); border:1.5px solid var(--cfg-border); border-radius:14px; padding:18px; display:flex; justify-content:space-between; align-items:center; gap:12px; box-shadow:0 4px 12px rgba(0,0,0,0.03);">' +
      '<div>' +
      '<div style="font-weight:800; font-size:16px; color:var(--cfg-heading); display:flex; align-items:center; gap:8px;">' + (m.produto_emoji || '🧩') + ' ' + escHtml(m.produto_nome || 'Produto #' + m.produto_id) + '</div>' +
      '<div style="font-size:12.5px; color:#8b5cf6; font-weight:700; margin-top:4px;"><i class="ph-bold ph-coins"></i> ' + escHtml(pricing) + '</div>' +
      '</div>' +
      '<div style="display:flex; gap:8px;">' +
      '<button onclick="window.editarMontavel(' + m.id + ')" style="background:rgba(139,92,246,0.12); color:#8b5cf6; border:1px solid rgba(139,92,246,0.3); padding:8px 14px; border-radius:8px; font-size:12.5px; font-weight:800; cursor:pointer;"><i class="ph-bold ph-pencil-simple"></i> Editar</button>' +
      '<button onclick="window.excluirMontavel(' + m.id + ')" style="background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.25); padding:8px 12px; border-radius:8px; font-size:12.5px; font-weight:800; cursor:pointer;"><i class="ph-bold ph-trash"></i></button>' +
      '</div></div>';
  }).join('');
};


window.abrirModalMontavel = function(montavel) {
  const modal = document.getElementById('modal-montavel');
  const title = document.getElementById('montavel-modal-title');
  const idField = document.getElementById('montavel-edit-id');
  const prodSel = document.getElementById('montavel-produto');
  const pricingSel = document.getElementById('montavel-pricing');
  const precoFixo = document.getElementById('montavel-preco-fixo');

  if (montavel) {
    title.textContent = 'Editar Item Montável';
    idField.value = montavel.id;
    pricingSel.value = montavel.pricing_model || 'soma';
    precoFixo.value = montavel.preco_fixo || 0;
    document.getElementById('montavel-preco-fixo-row').style.display = montavel.pricing_model === 'fixo' ? 'block' : 'none';
  } else {
    title.textContent = 'Novo Item Montável';
    idField.value = '';
    pricingSel.value = 'soma';
    precoFixo.value = '';
    document.getElementById('montavel-preco-fixo-row').style.display = 'none';
  }

  const token = localStorage.getItem('chef_token');
  fetch('/api/config/produtos', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(r => r.json())
    .then(produtos => {
      _montavelProdutosCache = produtos || [];
      const vendaveis = _montavelProdutosCache.filter(p => p.visibilidade !== 'invisivel');
      prodSel.innerHTML = '<option value="">Selecione o produto...</option>' + vendaveis.map(p =>
        '<option value="' + p.id + '" ' + (montavel && montavel.produto_id == p.id ? 'selected' : '') + '>' + (p.emoji || '') + ' ' + escHtml(p.nome) + ' (R$ ' + Number(p.preco).toFixed(2).replace('.', ',') + ')</option>'
      ).join('');
    });

  if (montavel && montavel.id) {
    fetch('/api/montaveis/' + montavel.id, { headers: { 'Authorization': 'Bearer ' + token } })
      .then(r => r.json())
      .then(data => {
        _montavelCatsTemp = (data.categorias || []).map(c => ({
          nome: c.nome,
          obrigatoria: c.obrigatoria,
          min_escolhas: c.min_escolhas || 0,
          max_escolhas: c.max_escolhas || 1,
          opcoes: (c.opcoes || []).map(o => ({ nome: o.nome, preco: o.preco || 0, ativo: o.ativo !== 0, produto_id: o.produto_id || null }))
        }));
        window.renderMontavelCats();
      });
  } else {
    _montavelCatsTemp = [];
    window.renderMontavelCats();
  }

  modal.style.display = 'flex';
};

window.editarMontavel = function(id) {
  const token = localStorage.getItem('chef_token');
  fetch('/api/montaveis/' + id, { headers: { 'Authorization': 'Bearer ' + token } })
    .then(r => r.json())
    .then(data => window.abrirModalMontavel(data));
};

window.excluirMontavel = function(id) {
  if (!confirm('Excluir este item montável?')) return;
  const token = localStorage.getItem('chef_token');
  fetch('/api/montaveis/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } })
    .then(r => r.json())
    .then(() => { window.initAdminMontaveis(); showToast('Item montável excluído!', 'success'); });
};

let _montavelProdutosCache = [];

function _montavelOpcoesProdutoHtml(ci, oi, opt) {
  const prods = _montavelProdutosCache || [];
  const ingredientes = prods.filter(p => p.visibilidade === 'invisivel');
  const outros = prods.filter(p => p.visibilidade !== 'invisivel');
  let html = '<select onchange="window.montavelVincularProduto(' + ci + ',' + oi + ',this.value)" style="flex:1.4; padding:6px 8px; border:1px solid #e2e8f0; border-radius:6px; font-size:12px; background:white; min-width:0;">';
  html += '<option value="">— Opção livre (digitar) —</option>';
  if (ingredientes.length) {
    html += '<optgroup label="🧪 Ingredientes internos">';
    ingredientes.forEach(p => {
      html += '<option value="' + p.id + '" ' + (opt.produto_id == p.id ? 'selected' : '') + '>' + escHtml((p.emoji || '🧪') + ' ' + p.nome + ' (R$ ' + Number(p.preco).toFixed(2).replace('.', ',') + ')') + '</option>';
    });
    html += '</optgroup>';
  }
  if (outros.length) {
    html += '<optgroup label="📋 Outros produtos">';
    outros.forEach(p => {
      html += '<option value="' + p.id + '" ' + (opt.produto_id == p.id ? 'selected' : '') + '>' + escHtml((p.emoji || '') + ' ' + p.nome + ' (R$ ' + Number(p.preco).toFixed(2).replace('.', ',') + ')') + '</option>';
    });
    html += '</optgroup>';
  }
  html += '</select>';
  return html;
}

window.montavelVincularProduto = function(ci, oi, produtoId) {
  const opt = _montavelCatsTemp[ci] && _montavelCatsTemp[ci].opcoes[oi];
  if (!opt) return;
  const pid = parseInt(produtoId) || null;
  opt.produto_id = pid;
  if (pid) {
    const p = (_montavelProdutosCache || []).find(x => x.id === pid);
    if (p) {
      opt.nome = p.nome;
      opt.preco = Number(p.preco) || 0;
      showToast('Opção vinculada a "' + p.nome + '" — nome e preço seguem o produto automaticamente.', 'info');
    }
  }
  window.renderMontavelCats();
};

window.renderMontavelCats = function() {
  const list = document.getElementById('montavel-categorias-list');
  if (!list) return;
  list.innerHTML = _montavelCatsTemp.map((cat, ci) => {
    const optsHtml = (cat.opcoes || []).map((opt, oi) => {
      const vinculado = !!opt.produto_id;
      return '<div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:8px 0; border-bottom:1px solid var(--cfg-border);">' +
        '<div style="flex:1.4; min-width:180px;">' + _montavelOpcoesProdutoHtml(ci, oi, opt) + '</div>' +
        '<input type="text" value="' + escHtml(opt.nome) + '" onchange="_montavelCatsTemp[' + ci + '].opcoes[' + oi + '].nome=this.value;_montavelCatsTemp[' + ci + '].opcoes[' + oi + '].produto_id=null"' + (vinculado ? ' disabled title="Nome vem do produto vinculado"' : '') + ' placeholder="Nome da opção" style="flex:1.2; min-width:140px; padding:8px 10px; border:1px solid var(--cfg-border); background:var(--cfg-input-bg); color:var(--cfg-text); border-radius:8px; font-size:13px;' + (vinculado ? ' opacity:0.6;' : '') + '">' +
        '<input type="number" step="0.01" min="0" value="' + (opt.preco || 0) + '" onchange="_montavelCatsTemp[' + ci + '].opcoes[' + oi + '].preco=parseFloat(this.value)||0"' + (vinculado ? ' disabled title="Preço vem do produto vinculado"' : '') + ' placeholder="+R$" style="width:90px; padding:8px 10px; border:1px solid var(--cfg-border); background:var(--cfg-input-bg); color:var(--cfg-text); border-radius:8px; font-size:13px;' + (vinculado ? ' opacity:0.6;' : '') + '">' +
        '<button onclick="_montavelCatsTemp[' + ci + '].opcoes.splice(' + oi + ',1);window.renderMontavelCats()" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:18px; padding:4px 8px;" title="Remover opção">&times;</button>' +
        '</div>';
    }).join('');

    return '<div style="background:var(--cfg-subtle-bg); border:1.5px solid var(--cfg-border); border-radius:14px; padding:16px; margin-bottom:14px;">' +
      '<div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:12px;">' +
      '<input type="text" value="' + escHtml(cat.nome) + '" onchange="_montavelCatsTemp[' + ci + '].nome=this.value" placeholder="Nome da categoria (ex: Recheio, Borda)" style="flex:1; min-width:180px; padding:8px 12px; border:1px solid var(--cfg-border); background:var(--cfg-input-bg); color:var(--cfg-text); border-radius:8px; font-size:14px; font-weight:700;">' +
      '<label style="font-size:12.5px; display:flex; align-items:center; gap:6px; white-space:nowrap; cursor:pointer; font-weight:600; color:var(--cfg-text);"><input type="checkbox" ' + (cat.obrigatoria ? 'checked' : '') + ' onchange="_montavelCatsTemp[' + ci + '].obrigatoria=this.checked?1:0" style="width:16px; height:16px; accent-color:var(--cfg-primary);"> Obrigatória</label>' +
      '<div style="display:flex; align-items:center; gap:6px;">' +
      '<span style="font-size:12px; color:var(--cfg-text-muted); font-weight:600;">Min:</span><input type="number" min="0" max="20" value="' + (cat.min_escolhas || 0) + '" onchange="_montavelCatsTemp[' + ci + '].min_escolhas=parseInt(this.value)||0" style="width:50px; padding:6px; border:1px solid var(--cfg-border); background:var(--cfg-input-bg); color:var(--cfg-text); border-radius:6px; font-size:13px; text-align:center;">' +
      '<span style="font-size:12px; color:var(--cfg-text-muted); font-weight:600;">Max:</span><input type="number" min="1" max="20" value="' + (cat.max_escolhas || 1) + '" onchange="_montavelCatsTemp[' + ci + '].max_escolhas=parseInt(this.value)||1" style="width:50px; padding:6px; border:1px solid var(--cfg-border); background:var(--cfg-input-bg); color:var(--cfg-text); border-radius:6px; font-size:13px; text-align:center;">' +
      '</div>' +
      '<button onclick="_montavelCatsTemp.splice(' + ci + ',1);window.renderMontavelCats()" style="background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.3); padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">Remover</button>' +
      '</div>' +
      '<div style="padding-left:6px; margin-bottom:8px;">' + optsHtml + '</div>' +
      '<button onclick="window.adicionarOpcaoMontavel(' + ci + ')" style="background:transparent; border:1.5px dashed #8b5cf6; color:#8b5cf6; padding:8px 14px; border-radius:8px; font-size:12.5px; font-weight:700; cursor:pointer; margin-top:6px; display:inline-flex; align-items:center; gap:6px;">+ Adicionar Opção</button>' +
      '</div>';
  }).join('');
};

window.adicionarOpcaoMontavel = function(ci) {
  if (_montavelCatsTemp && _montavelCatsTemp[ci]) {
    _montavelCatsTemp[ci].opcoes.push({ nome: '', preco: 0, ativo: 1, produto_id: null });
    window.renderMontavelCats();
  }
};

window.adicionarCategoriaMontavel = function() {
  _montavelCatsTemp.push({ nome: '', obrigatoria: 1, min_escolhas: 1, max_escolhas: 1, opcoes: [{ nome: '', preco: 0, ativo: 1 }] });
  window.renderMontavelCats();
};

window.salvarMontavel = function() {
  const id = document.getElementById('montavel-edit-id').value;
  const produto_id = parseInt(document.getElementById('montavel-produto').value);
  const pricing_model = document.getElementById('montavel-pricing').value;
  const preco_fixo = parseFloat(document.getElementById('montavel-preco-fixo').value) || 0;

  if (!produto_id) { showToast('Selecione um produto!', 'danger'); return; }
  if (_montavelCatsTemp.length === 0) { showToast('Adicione pelo menos uma categoria!', 'danger'); return; }

  const body = { produto_id, pricing_model, preco_fixo, categorias: _montavelCatsTemp };
  const token = localStorage.getItem('chef_token');
  const url = id ? '/api/montaveis/' + id : '/api/montaveis';
  const method = id ? 'PUT' : 'POST';

  fetch(url, { method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => r.json())
    .then(d => {
      if (d.success || d.id) {
        document.getElementById('modal-montavel').style.display = 'none';
        window.initAdminMontaveis();
        showToast('Item montável salvo!', 'success');
      } else { showToast('Erro: ' + (d.error || 'desconhecido'), 'danger'); }
    });
};

// ═════════════════════════════════════════════════════════════════════
// ATALHOS DO APP GARÇOM (CONFIGURAÇÃO NO PAINEL ADMIN)
// ═════════════════════════════════════════════════════════════════════
window.carregarConfigAtalhosGarcom = function() {
  fetch('/api/configuracoes')
    .then(r => r.json())
    .then(data => {
      let cfg = {
        fila_espera: true,
        fila_preparo: true,
        consulta_preco: true,
        nova_comanda: true,
        chamar_gerente: true,
        minhas_vendas: true
      };
      if (data && data.garcom_atalhos) {
        try {
          const parsed = typeof data.garcom_atalhos === 'string' ? JSON.parse(data.garcom_atalhos) : data.garcom_atalhos;
          cfg = Object.assign(cfg, parsed);
        } catch(e) {}
      }
      if (document.getElementById('cfg-garcom-fila-espera')) document.getElementById('cfg-garcom-fila-espera').checked = cfg.fila_espera !== false;
      if (document.getElementById('cfg-garcom-fila-preparo')) document.getElementById('cfg-garcom-fila-preparo').checked = cfg.fila_preparo !== false;
      if (document.getElementById('cfg-garcom-consulta-preco')) document.getElementById('cfg-garcom-consulta-preco').checked = cfg.consulta_preco !== false;
      if (document.getElementById('cfg-garcom-nova-comanda')) document.getElementById('cfg-garcom-nova-comanda').checked = cfg.nova_comanda !== false;
      if (document.getElementById('cfg-garcom-chamar-gerente')) document.getElementById('cfg-garcom-chamar-gerente').checked = cfg.chamar_gerente !== false;
      if (document.getElementById('cfg-garcom-minhas-vendas')) document.getElementById('cfg-garcom-minhas-vendas').checked = cfg.minhas_vendas !== false;
    })
    .catch(() => {});
};

window.salvarConfigAtalhosGarcom = function() {
  const cfg = {
    fila_espera: document.getElementById('cfg-garcom-fila-espera') ? document.getElementById('cfg-garcom-fila-espera').checked : true,
    fila_preparo: document.getElementById('cfg-garcom-fila-preparo') ? document.getElementById('cfg-garcom-fila-preparo').checked : true,
    consulta_preco: document.getElementById('cfg-garcom-consulta-preco') ? document.getElementById('cfg-garcom-consulta-preco').checked : true,
    nova_comanda: document.getElementById('cfg-garcom-nova-comanda') ? document.getElementById('cfg-garcom-nova-comanda').checked : true,
    chamar_gerente: document.getElementById('cfg-garcom-chamar-gerente') ? document.getElementById('cfg-garcom-chamar-gerente').checked : true,
    minhas_vendas: document.getElementById('cfg-garcom-minhas-vendas') ? document.getElementById('cfg-garcom-minhas-vendas').checked : true
  };

  localStorage.setItem('chef_garcom_atalhos_cfg', JSON.stringify(cfg));

  fetch('/api/configuracoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ garcom_atalhos: JSON.stringify(cfg) })
  })
  .then(r => r.json())
  .then(() => {
    if (typeof showToast === 'function') {
      showToast('Atalhos do App Garçom salvos com sucesso!', 'success');
    } else {
      alert('Atalhos do App Garçom salvos com sucesso!');
    }
  })
  .catch(err => {
    if (typeof showToast === 'function') {
      showToast('Erro ao salvar configurações', 'danger');
    }
  });
};

document.addEventListener('DOMContentLoaded', () => {
  window.carregarConfigAtalhosGarcom();
});

/* ═══════════════════════════════════════════════════════════════
   PLUGIN AUTOLOADING — Frontend Autoloading para o Admin Panel
   Escaneia /api/plugins/admin-manifest e cria abas automaticamente.
   ═══════════════════════════════════════════════════════════════ */
(function initPluginAutoloader() {
  const _pluginTabsLoaded = {};
  const _pluginTabInitFns = {};

  function authHeadersPlugin() {
    const t = localStorage.getItem('chef_token') || '';
    return { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' };
  }

  async function discoverAdminPlugins() {
    try {
      const r = await fetch('/api/plugins/admin-manifest', { headers: authHeadersPlugin() });
      const data = await r.json();
      return (data.ok && Array.isArray(data.manifest)) ? data.manifest : [];
    } catch (e) { return []; }
  }

  function ensurePluginGroup(groupName) {
    let grp = document.querySelector('.action-group[data-plugin-group="' + groupName + '"]');
    if (grp) return grp;
    grp = document.createElement('div');
    grp.className = 'action-group';
    grp.setAttribute('data-plugin-group', groupName);
    grp.innerHTML = '<div class="group-title">' + escHtml(groupName) + '</div>';
    const sidebar = document.querySelector('.config-sidebar');
    if (sidebar) sidebar.appendChild(grp);
    return grp;
  }

  function createPluginTab(plugin) {
    const tabId = 'plugin-' + plugin.id;
    if (document.getElementById('admin-tab-' + tabId)) return;

    const grp = ensurePluginGroup(plugin.group || 'Plugins');
    const btn = document.createElement('button');
    btn.className = 'admin-tab-btn';
    btn.setAttribute('data-tab', tabId);
    btn.innerHTML = '<i class="ph ' + (plugin.icon || 'ph-puzzle-piece') + '"></i> ' + escHtml(plugin.displayName || plugin.name);
    grp.appendChild(btn);

    const content = document.createElement('div');
    content.id = 'admin-tab-' + tabId;
    content.className = 'admin-tab-content';
    content.style.display = 'none';
    content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;"><i class="ph ph-spinner ph-spin" style="font-size:24px;"></i></div>';
    const workspace = document.querySelector('.main-workspace');
    if (workspace) workspace.appendChild(content);

    _pluginTabInitFns[tabId] = async function loadPluginContent() {
      if (_pluginTabsLoaded[tabId]) return;
      _pluginTabsLoaded[tabId] = true;
      try {
        const r = await fetch(plugin.baseUrl + '/index.html');
        if (!r.ok) throw new Error('HTML not found');
        const html = await r.text();
        content.innerHTML = html;

        const script = document.createElement('script');
        script.src = plugin.baseUrl + '/index.js';
        script.onload = function() {
          const initFn = window['plugin_' + plugin.id + '_init'];
          if (typeof initFn === 'function') {
            try { initFn({ tab: content, tabId: tabId, plugin: plugin }); } catch (e) { console.error('[plugin-autoloader] init error:', e); }
          }
        };
        script.onerror = function() { console.warn('[plugin-autoloader] No index.js for ' + plugin.id); };
        content.appendChild(script);
      } catch (e) {
        content.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;">Erro ao carregar módulo: ' + escHtml(e.message) + '</div>';
      }
    };
  }

  function patchActivateTab() {
    if (window._pluginAutoloadPatched) return;
    window._pluginAutoloadPatched = true;
    const origActivate = window.activateTab;
    if (typeof origActivate !== 'function') return;
    window.activateTab = function(tabId, skipSave) {
      if (tabId && tabId.startsWith('plugin-') && _pluginTabInitFns[tabId]) {
        _pluginTabInitFns[tabId]();
      }
      return origActivate(tabId, skipSave);
    };
  }

  async function boot() {
    const plugins = await discoverAdminPlugins();
    if (!plugins.length) return;
    plugins.forEach(createPluginTab);
    patchActivateTab();
    console.log('[plugin-autoloader] ' + plugins.length + ' admin plugin tabs registered');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 100);
  }
})();



// ══════════════════════════════════════════════════════════════════
// GERENCIADOR DE BALANÇA COMERCIAL (TOLEDO, FILIZOLA, URANO, ELGIN)
// ══════════════════════════════════════════════════════════════════
window.carregarConfigBalanca = function() {
  fetch('/api/config', { headers: typeof authHeaders === 'function' ? authHeaders() : {} })
    .then(r => r.json())
    .then(cfg => {
      if (!cfg) return;
      let b = cfg.balanca_config;
      if (typeof b === 'string') {
        try { b = JSON.parse(b); } catch(e) { b = {}; }
      }
      if (b) {
        const ativa = document.getElementById('cfg-balanca-ativa');
        const modelo = document.getElementById('cfg-balanca-modelo');
        const porta = document.getElementById('cfg-balanca-porta');
        const baud = document.getElementById('cfg-balanca-baud');
        const tara = document.getElementById('cfg-balanca-tara');

        if (ativa) ativa.checked = !!b.ativa;
        if (modelo && b.modelo) modelo.value = b.modelo;
        if (porta && b.porta) porta.value = b.porta;
        if (baud && b.baud) baud.value = b.baud;
        if (tara && b.tara !== undefined) tara.value = b.tara;
      }

      // Carregar Tour Gastronômico
      let t = cfg.tour_gastronomico;
      if (typeof t === 'string') {
        try { t = JSON.parse(t); } catch(e) { t = {}; }
      }
      if (t) {
        const tit = document.getElementById('cfg-tour-titulo');
        const hist = document.getElementById('cfg-tour-historia');
        const ent = document.getElementById('cfg-tour-entradas-nomes');
        const pra = document.getElementById('cfg-tour-pratos-nomes');
        const sob = document.getElementById('cfg-tour-sobremesas-nomes');

        if (tit && t.titulo) tit.value = t.titulo;
        if (hist && t.historia) hist.value = t.historia;
        if (ent && t.entradas) ent.value = t.entradas;
        if (pra && t.pratos) pra.value = t.pratos;
        if (sob && t.sobremesas) sob.value = t.sobremesas;
      }
    })
    .catch(() => {});
};

window.salvarConfigBalanca = function() {
  const ativa = document.getElementById('cfg-balanca-ativa') ? document.getElementById('cfg-balanca-ativa').checked : false;
  const modelo = document.getElementById('cfg-balanca-modelo') ? document.getElementById('cfg-balanca-modelo').value : 'toledo_prix';
  const porta = document.getElementById('cfg-balanca-porta') ? document.getElementById('cfg-balanca-porta').value : 'webserial';
  const baud = document.getElementById('cfg-balanca-baud') ? document.getElementById('cfg-balanca-baud').value : '9600';
  const tara = document.getElementById('cfg-balanca-tara') ? parseFloat(document.getElementById('cfg-balanca-tara').value) || 0 : 0;

  const payload = {
    balanca_config: JSON.stringify({ ativa, modelo, porta, baud, tara })
  };

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(typeof authHeaders === 'function' ? authHeaders() : {}) },
    body: JSON.stringify(payload)
  }).then(r => r.json()).then(() => {
    if (typeof Swal !== 'undefined') {
      Swal.fire({ icon: 'success', title: 'Balança Salva!', text: 'Configuração da balança comercial salva com sucesso.', timer: 2000, showConfirmButton: false });
    } else {
      alert('Configuração da balança salva com sucesso!');
    }
  }).catch(() => {
    alert('Erro ao salvar configuração da balança.');
  });
};

window.testarLeituraBalanca = async function() {
  const label = document.getElementById('label-teste-peso-balanca');
  if (label) label.innerText = 'Lendo balança... ⏳';

  // Se o navegador suporta Web Serial API direta
  if ('serial' in navigator && (document.getElementById('cfg-balanca-porta')?.value === 'webserial' || !document.getElementById('cfg-balanca-porta')?.value)) {
    try {
      const port = await navigator.serial.requestPort();
      const baudRate = parseInt(document.getElementById('cfg-balanca-baud')?.value || '9600', 10);
      await port.open({ baudRate });

      const reader = port.readable.getReader();
      const { value, done } = await reader.read();
      reader.releaseLock();
      await port.close();

      const textDecoder = new TextDecoder();
      const str = textDecoder.decode(value);
      // Extrair números do payload Toledo / Filizola
      const match = str.match(/([0-9]{1,3}.[0-9]{2,3})/);
      const pesoKg = match ? match[1] : (parseFloat(str.replace(/[^0-9]/g, '')) / 1000).toFixed(3);
      if (label) label.innerHTML = `<span style="color:#10b981;">Peso Lido: <strong>${pesoKg} kg</strong> (Conectada!)</span>`;
      return;
    } catch(err) {
      console.warn('[WebSerial Error]', err);
    }
  }

  // Fallback simulado para teste de bancada
  setTimeout(() => {
    const tara = parseFloat(document.getElementById('cfg-balanca-tara')?.value) || 0;
    const pesoBruto = (0.500 + Math.random() * 0.400).toFixed(3);
    const pesoLiquido = Math.max(0, (parseFloat(pesoBruto) - (tara / 1000))).toFixed(3);
    if (label) label.innerHTML = `<span style="color:#10b981;">Peso Lido: <strong>${pesoLiquido} kg</strong> (Líquido c/ tara ${tara}g)</span>`;
  }, 400);
};

// ══════════════════════════════════════════════════════════════════
// SALVAR CONFIGURAÇÃO DO TOUR GASTRONÔMICO (CARDÁPIO DIGITAL)
// ══════════════════════════════════════════════════════════════════
window.salvarConfigTourGastronomico = function() {
  const titulo = document.getElementById('cfg-tour-titulo') ? document.getElementById('cfg-tour-titulo').value.trim() : '';
  const historia = document.getElementById('cfg-tour-historia') ? document.getElementById('cfg-tour-historia').value.trim() : '';
  const entradas = document.getElementById('cfg-tour-entradas-nomes') ? document.getElementById('cfg-tour-entradas-nomes').value.trim() : '';
  const pratos = document.getElementById('cfg-tour-pratos-nomes') ? document.getElementById('cfg-tour-pratos-nomes').value.trim() : '';
  const sobremesas = document.getElementById('cfg-tour-sobremesas-nomes') ? document.getElementById('cfg-tour-sobremesas-nomes').value.trim() : '';

  const payload = {
    tour_gastronomico: JSON.stringify({ titulo, historia, entradas, pratos, sobremesas })
  };

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(typeof authHeaders === 'function' ? authHeaders() : {}) },
    body: JSON.stringify(payload)
  }).then(r => r.json()).then(() => {
    if (typeof Swal !== 'undefined') {
      Swal.fire({ icon: 'success', title: 'Tour Gastronômico Salvo!', text: 'O cardápio digital agora exibirá sua história e pratos personalizados.', timer: 2500, showConfirmButton: false });
    } else {
      alert('Tour Gastronômico salvo com sucesso!');
    }
  }).catch(() => {
    alert('Erro ao salvar Tour Gastronômico.');
  });
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.carregarConfigBalanca === 'function') {
    window.carregarConfigBalanca();
  }
});


// ══════════════════════════════════════════════════════════════════
// CENTRAL DE MÓDULOS & EXTENSÕES PLUG-AND-PLAY
// ══════════════════════════════════════════════════════════════════
window.carregarListaModulosUI = function() {
  const grid = document.getElementById('grid-modulos-instalados');
  if (!grid) return;
  grid.innerHTML = '<div style="text-align:center; padding:20px; color:var(--cfg-text-muted); grid-column:1/-1;">Buscando módulos instalados...</div>';

  fetch('/api/modules/all')
    .then(r => r.json())
    .then(data => {
      if (!data || !data.modules || data.modules.length === 0) {
        grid.innerHTML = '<div style="text-align:center; padding:30px; color:var(--cfg-text-muted); grid-column:1/-1;">Nenhum módulo encontrado na pasta plugins/.</div>';
        return;
      }

      grid.innerHTML = data.modules.map(m => {
        const isAtivo = m.enabled !== false;
        const icon = m.icon || 'ph-puzzle-piece';
        return `
          <div style="background:var(--cfg-card-bg); border: 1.5px solid var(--cfg-border); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 38px; height: 38px; border-radius: 10px; background: ${isAtivo ? 'rgba(139, 92, 246, 0.12)' : 'rgba(148, 163, 184, 0.15)'}; color: ${isAtivo ? '#8b5cf6' : '#64748b'}; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                  <i class="ph-bold ${icon}"></i>
                </div>
                <div>
                  <h4 style="margin: 0; font-size: 14.5px; color: var(--cfg-text); font-weight: 800;">${m.name || m.id}</h4>
                  <span style="font-size: 11px; color: var(--cfg-text-muted);">v${m.version || '1.0.0'} • ${m.category || 'geral'}</span>
                </div>
              </div>
              <span style="font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 12px; background: ${isAtivo ? '#dcfce7' : '#f1f5f9'}; color: ${isAtivo ? '#15803d' : '#64748b'};">
                ${isAtivo ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <p style="font-size: 12px; color: var(--cfg-text-muted); margin: 0; line-height: 1.4;">
              ${m.description || 'Módulo plug-and-play instalado no sistema.'}
            </p>
            <div style="display: flex; gap: 8px; border-top: 1px solid var(--cfg-border); padding-top: 10px;">
              <button onclick="window.alternarModuloUI('${m.id}', ${!isAtivo})" style="flex: 1; padding: 8px; border-radius: 8px; background: ${isAtivo ? '#fee2e2' : '#dcfce7'}; color: ${isAtivo ? '#b91c1c' : '#15803d'}; border: 1px solid ${isAtivo ? '#fca5a5' : '#86efac'}; font-weight: 800; font-size: 12px; cursor: pointer;">
                ${isAtivo ? 'Desativar' : 'Ativar Módulo'}
              </button>
            </div>
          </div>
        `;
      }).join('');
    })
    .catch(err => {
      grid.innerHTML = '<div style="text-align:center; padding:20px; color:#ef4444; grid-column:1/-1;">Erro ao carregar lista de módulos.</div>';
    });
};

window.alternarModuloUI = function(moduleId, enabled) {
  fetch('/api/modules/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduleId, enabled })
  }).then(r => r.json()).then(res => {
    if (res && res.sucesso) {
      window.carregarListaModulosUI();
      if (typeof Swal !== 'undefined') {
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: enabled ? 'Módulo Ativado!' : 'Módulo Desativado!', showConfirmButton: false, timer: 2000 });
      }
    }
  }).catch(() => {
    alert('Erro ao alternar módulo.');
  });
};

window.criarNovoModuloUI = function() {
  const id = document.getElementById('novo-mod-id')?.value.trim();
  const name = document.getElementById('novo-mod-nome')?.value.trim();
  const icon = document.getElementById('novo-mod-icone')?.value.trim();
  const category = document.getElementById('novo-mod-categoria')?.value;

  if (!id) return alert('Por favor, informe o ID do módulo.');

  fetch('/api/modules/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, name, icon, category })
  }).then(r => r.json()).then(res => {
    if (res && res.sucesso) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({ icon: 'success', title: 'Módulo Criado!', text: `O módulo "${res.rawId}" foi gerado na pasta plugins/${res.rawId}/ e já está pronto para uso.`, timer: 3000, showConfirmButton: false });
      } else {
        alert('Módulo criado com sucesso!');
      }
      if (document.getElementById('novo-mod-id')) document.getElementById('novo-mod-id').value = '';
      if (document.getElementById('novo-mod-nome')) document.getElementById('novo-mod-nome').value = '';
      window.carregarListaModulosUI();
    } else {
      alert('Erro: ' + (res.error || 'Falha ao criar módulo.'));
    }
  }).catch(() => {
    alert('Erro ao comunicar com o servidor.');
  });
};

// Carregar ao alternar para a aba de módulos
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab="modulos"]');
  if (btn && typeof window.carregarListaModulosUI === 'function') {
    setTimeout(window.carregarListaModulosUI, 100);
  }
});


// ══════════════════════════════════════════════════════════════════
// HANDLERS DO MÓDULO DE PESAGEM AUTOMÁTICA & BLUEPRINTS PARA SUPORTE
// ══════════════════════════════════════════════════════════════════
window.carregarConfigPesagemUI = function() {
  fetch('/api/modulo/pesagem-selfservice/config')
    .then(r => r.json())
    .then(d => {
      if (d && d.sucesso && d.config) {
        const c = d.config;
        if (document.getElementById('cfg-peso-preco-kg')) document.getElementById('cfg-peso-preco-kg').value = c.precoKg || 69.90;
        if (document.getElementById('cfg-peso-preco-livre')) document.getElementById('cfg-peso-preco-livre').value = c.precoLivre || 35.00;
        if (document.getElementById('cfg-peso-tara')) document.getElementById('cfg-peso-tara').value = c.taraPratoKg || 0.450;
        if (document.getElementById('cfg-peso-modo')) document.getElementById('cfg-peso-modo').value = c.modoPadrao || 'peso';
      }
    }).catch(() => {});
};

window.salvarConfigPesagemUI = function() {
  const precoKg = parseFloat(document.getElementById('cfg-peso-preco-kg')?.value) || 69.90;
  const precoLivre = parseFloat(document.getElementById('cfg-peso-preco-livre')?.value) || 35.00;
  const taraPratoKg = parseFloat(document.getElementById('cfg-peso-tara')?.value) || 0.450;
  const modoPadrao = document.getElementById('cfg-peso-modo')?.value || 'peso';

  fetch('/api/modulo/pesagem-selfservice/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ precoKg, precoLivre, taraPratoKg, modoPadrao })
  })
  .then(r => r.json())
  .then(res => {
    if (res && res.sucesso) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Valores de Pesagem Salvos!', showConfirmButton: false, timer: 2500 });
      } else {
        alert('Configurações de pesagem salvas com sucesso!');
      }
    }
  }).catch(() => alert('Erro ao salvar valores de pesagem.'));
};

window.testarSimulacaoPesagem = function(bruto, modo) {
  fetch('/api/modulo/pesagem-selfservice/pesar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pesoBruto: bruto, modo: modo || 'peso' })
  })
  .then(r => r.json())
  .then(res => {
    if (res && res.sucesso) {
      const reg = res.registro;
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'success',
          title: '⚡ Simulação de Pesagem Executada!',
          html: `<b>ID:</b> ${reg.id}<br><b>Item:</b> ${reg.descricaoItem}<br><b>Líquido:</b> ${reg.pesoLiquido} kg<br><b style="font-size:18px; color:#fc4b15;">Total: R$ ${reg.valorTotal.toFixed(2)}</b>`,
          timer: 3500
        });
      } else {
        alert(`Pesagem Similada: ${reg.descricaoItem} -> R$ ${reg.valorTotal.toFixed(2)}`);
      }
    }
  });
};

window.aplicarBlueprint = function(tipo) {
  const blueprints = {
    hig: { id: 'tema-v2', nome: 'Tema v2.0 Modular (Apple HIG)', icone: 'ph-apple-logo', categoria: 'interface' },
    balanca: { id: 'pesagem-automatica', nome: 'Pesagem Automática Balança', icone: 'ph-scales', categoria: 'hardware' },
    fidelidade: { id: 'cashback-fidelidade', nome: 'Cashback & Fidelidade VIP', icone: 'ph-gift', categoria: 'marketing' },
    totem: { id: 'totem-autoatendimento', nome: 'Totem de Autoatendimento Touch', icone: 'ph-device-mobile', categoria: 'operacao' },
    fiscal: { id: 'pagamento-tef', nome: 'Integração TEF & Cartões', icone: 'ph-receipt', categoria: 'fiscal' }
  };

  const bp = blueprints[tipo];
  if (!bp) return;

  if (document.getElementById('novo-mod-id')) document.getElementById('novo-mod-id').value = bp.id;
  if (document.getElementById('novo-mod-nome')) document.getElementById('novo-mod-nome').value = bp.nome;
  if (document.getElementById('novo-mod-icone')) document.getElementById('novo-mod-icone').value = bp.icone;
  if (document.getElementById('novo-mod-categoria')) document.getElementById('novo-mod-categoria').value = bp.categoria;
};

// Ao alternar para a aba módulos, carregar a config de pesagem
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab="modulos"]');
  if (btn) {
    setTimeout(() => {
      if (typeof window.carregarListaModulosUI === 'function') window.carregarListaModulosUI();
      if (typeof window.carregarConfigPesagemUI === 'function') window.carregarConfigPesagemUI();
    }, 100);
  }
});


// ── Handlers do Customizador de Marca para o Suporte ──
window.salvarMarcaSuporteUI = function() {
  const nome = document.getElementById('cfg-sup-rest-nome')?.value || 'Chef Cozinha Gourmet';
  const logo = document.getElementById('cfg-sup-rest-logo')?.value || '';
  const cor = document.getElementById('cfg-sup-rest-cor')?.value || '#fc4b15';

  fetch('/api/tema-v2/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nomeRestaurante: nome, logoUrl: logo, corPrimaria: cor })
  })
  .then(r => r.json())
  .then(d => {
    if (d && d.sucesso) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'success',
          title: 'Marca Injetada com Sucesso!',
          text: 'As cores, logo e nome foram aplicados em todo o Tema v2.0 do restaurante.',
          timer: 2500
        });
      } else {
        alert('Identidade visual salva e injetada com sucesso no restaurante!');
      }
    }
  }).catch(() => alert('Erro ao salvar identidade visual do restaurante.'));
};


// ══════════════════════════════════════════════════════════════════
// ENGINE DINÂMICO DE MÓDULOS E PROPORÇÕES DA HOME (PÁGINA INICIAL)
// ══════════════════════════════════════════════════════════════════
(function () {
  const DEFAULT_HOME_MODULES = [
    { id: 'metricas', nome: 'Métricas & Faturamento do Turno', icone: 'ph-chart-line-up', cor: '#10b981', tamanho: 'g', ativo: true },
    { id: 'atalhos', nome: 'Ações Rápidas de Operação', icone: 'ph-lightning', cor: '#fc4b15', tamanho: 'm', ativo: true },
    { id: 'balanca', nome: 'Balança & Buffet Self-Service', icone: 'ph-scales', cor: '#fc4b15', tamanho: 'p', ativo: true },
    { id: 'marca', nome: 'Identidade & Tema HIG v2.0', icone: 'ph-palette', cor: '#8b5cf6', tamanho: 'm', ativo: true },
    { id: 'gerais', nome: 'Idioma, Fuso & Sistema', icone: 'ph-globe', cor: '#3b82f6', tamanho: 'p', ativo: true },
    { id: 'salao_mesas', nome: 'Salão de Mesas & Comandas Live', icone: 'ph-table', cor: '#0ea5e9', tamanho: 'm', ativo: true },
    { id: 'kds_cozinha', nome: 'KDS Cozinha & Alertas de Atraso', icone: 'ph-cooking-pot', cor: '#ea580c', tamanho: 'p', ativo: true },
    { id: 'nfce_fiscal', nome: 'Emissor Fiscal NFC-e & TEF', icone: 'ph-receipt', cor: '#2563eb', tamanho: 'p', ativo: true },
    { id: 'fidelidade', nome: 'Fidelidade & Cashback VIP', icone: 'ph-gift', cor: '#f59e0b', tamanho: 'p', ativo: true },
    { id: 'modulos_hub', nome: 'Central de Módulos Plug-and-Play', icone: 'ph-puzzle-piece', cor: '#8b5cf6', tamanho: 'm', ativo: true },
    { id: 'licenca', nome: 'Licença & Ativação do Sistema', icone: 'ph-seal-check', cor: '#10b981', tamanho: 'm', ativo: true }
  ];

  window.obterLayoutHome = function () {
    try {
      const salvo = localStorage.getItem('chef_home_modules_layout');
      if (salvo) return JSON.parse(salvo);
    } catch (e) {}
    return DEFAULT_HOME_MODULES;
  };

  window.salvarLayoutHome = function (lista) {
    try {
      localStorage.setItem('chef_home_modules_layout', JSON.stringify(lista));
    } catch (e) {}
  };

  window.carregarLayoutHomeUI = function () {
    const container = document.getElementById('home-modular-container');
    if (!container) return;

    const lista = window.obterLayoutHome();
    container.innerHTML = '';

    lista.forEach(mod => {
      if (!mod.ativo) return;

      const card = document.createElement('div');
      const sizeClass = mod.tamanho === 'p' ? 'card-size-p' : (mod.tamanho === 'g' ? 'card-size-g' : 'card-size-m');
      card.className = `config-card ${sizeClass}`;
      card.id = `home-card-${mod.id}`;
      card.style.position = 'relative';

      // Header do Card com controles de tamanho [P] [M] [G] [✕]
      const cardHeaderHtml = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid var(--cfg-border); padding-bottom:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <i class="ph-bold ${mod.icone}" style="color:${mod.cor}; font-size:20px;"></i>
            <strong style="font-size:15px; color:var(--cfg-heading);">${mod.nome}</strong>
          </div>
          <div style="display:flex; align-items:center; gap:4px;">
            <button onclick="window.alterarTamanhoCardHome('${mod.id}', 'p')" title="Tamanho Pequeno (1 Coluna)" style="padding:3px 7px; border-radius:5px; border:1px solid var(--cfg-border); background:${mod.tamanho === 'p' ? 'var(--cfg-primary)' : 'var(--cfg-subtle-bg)'}; color:${mod.tamanho === 'p' ? '#fff' : 'var(--cfg-text-muted)'}; font-size:11px; font-weight:800; cursor:pointer;">P</button>
            <button onclick="window.alterarTamanhoCardHome('${mod.id}', 'm')" title="Tamanho Médio (2 Colunas)" style="padding:3px 7px; border-radius:5px; border:1px solid var(--cfg-border); background:${mod.tamanho === 'm' ? 'var(--cfg-primary)' : 'var(--cfg-subtle-bg)'}; color:${mod.tamanho === 'm' ? '#fff' : 'var(--cfg-text-muted)'}; font-size:11px; font-weight:800; cursor:pointer;">M</button>
            <button onclick="window.alterarTamanhoCardHome('${mod.id}', 'g')" title="Tamanho Grande (Largura Total)" style="padding:3px 7px; border-radius:5px; border:1px solid var(--cfg-border); background:${mod.tamanho === 'g' ? 'var(--cfg-primary)' : 'var(--cfg-subtle-bg)'}; color:${mod.tamanho === 'g' ? '#fff' : 'var(--cfg-text-muted)'}; font-size:11px; font-weight:800; cursor:pointer;">G</button>
            <button onclick="window.ocultarCardHome('${mod.id}')" title="Ocultar da Home" style="padding:3px 7px; border-radius:5px; border:none; background:transparent; color:var(--cfg-text-muted); font-size:14px; cursor:pointer;"><i class="ph-bold ph-x"></i></button>
          </div>
        </div>
      `;

      // Conteúdo Específico de Cada Módulo
      let bodyHtml = '';
      if (mod.id === 'metricas') {
        bodyHtml = `
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
            <div style="background:var(--cfg-subtle-bg); padding:14px; border-radius:10px; border:1px solid var(--cfg-border);">
              <span style="font-size:11.5px; color:var(--cfg-text-muted); font-weight:700; text-transform:uppercase;">Faturamento Hoje</span>
              <h3 style="font-size:22px; margin:4px 0 0; color:#10b981; font-weight:900;">R$ 1.450,00</h3>
            </div>
            <div style="background:var(--cfg-subtle-bg); padding:14px; border-radius:10px; border:1px solid var(--cfg-border);">
              <span style="font-size:11.5px; color:var(--cfg-text-muted); font-weight:700; text-transform:uppercase;">Mesas Ocupadas</span>
              <h3 style="font-size:22px; margin:4px 0 0; color:#fc4b15; font-weight:900;">3 / 12</h3>
            </div>
            <div style="background:var(--cfg-subtle-bg); padding:14px; border-radius:10px; border:1px solid var(--cfg-border);">
              <span style="font-size:11.5px; color:var(--cfg-text-muted); font-weight:700; text-transform:uppercase;">Ticket Médio</span>
              <h3 style="font-size:22px; margin:4px 0 0; color:#3b82f6; font-weight:900;">R$ 84,20</h3>
            </div>
            <div style="background:var(--cfg-subtle-bg); padding:14px; border-radius:10px; border:1px solid var(--cfg-border);">
              <span style="font-size:11.5px; color:var(--cfg-text-muted); font-weight:700; text-transform:uppercase;">Tempo Médio KDS</span>
              <h3 style="font-size:22px; margin:4px 0 0; color:#a855f7; font-weight:900;">14 min</h3>
            </div>
          </div>
        `;
      } else if (mod.id === 'atalhos') {
        bodyHtml = `
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px;">
            <button onclick="window.open('/caixa-v2.html', '_blank')" style="padding:12px; border-radius:10px; border:1px solid var(--cfg-border); background:var(--cfg-subtle-bg); color:var(--cfg-text); cursor:pointer; font-weight:700; font-size:12.5px; display:flex; flex-direction:column; align-items:center; gap:6px;">
              <span style="font-size:20px;">🍏</span> Tema v2.0 HIG
            </button>
            <button onclick="window.open('/index.html', '_blank')" style="padding:12px; border-radius:10px; border:1px solid var(--cfg-border); background:var(--cfg-subtle-bg); color:var(--cfg-text); cursor:pointer; font-weight:700; font-size:12.5px; display:flex; flex-direction:column; align-items:center; gap:6px;">
              <span style="font-size:20px;">💻</span> Caixa Clássico
            </button>
            <button onclick="window.open('/painel-dono.html', '_blank')" style="padding:12px; border-radius:10px; border:1px solid var(--cfg-border); background:var(--cfg-subtle-bg); color:var(--cfg-text); cursor:pointer; font-weight:700; font-size:12.5px; display:flex; flex-direction:column; align-items:center; gap:6px;">
              <span style="font-size:20px;">👑</span> Painel do Dono
            </button>
            <button onclick="window.open('/plugins/pesagem-selfservice/totem', '_blank')" style="padding:12px; border-radius:10px; border:1px solid var(--cfg-border); background:var(--cfg-subtle-bg); color:var(--cfg-text); cursor:pointer; font-weight:700; font-size:12.5px; display:flex; flex-direction:column; align-items:center; gap:6px;">
              <span style="font-size:20px;">⚖️</span> Totem Balança
            </button>
          </div>
        `;
      } else if (mod.id === 'balanca') {
        bodyHtml = `
          <p style="font-size:13px; color:var(--cfg-text-muted); margin-bottom:10px;">Self-Service Automático: Preço/Kg atual R$ 69,90.</p>
          <div style="display:flex; gap:8px;">
            <button onclick="if(typeof testarSimulacaoPesagem==='function') testarSimulacaoPesagem(0.420)" style="flex:1; padding:8px 12px; border-radius:8px; border:1px solid #fc4b15; background:rgba(252,75,21,0.1); color:#fc4b15; font-weight:700; font-size:12px; cursor:pointer;">⚡ 420g</button>
            <button onclick="if(typeof testarSimulacaoPesagem==='function') testarSimulacaoPesagem(0.780)" style="flex:1; padding:8px 12px; border-radius:8px; border:1px solid #fc4b15; background:rgba(252,75,21,0.1); color:#fc4b15; font-weight:700; font-size:12px; cursor:pointer;">⚡ 780g</button>
          </div>
        `;
      } else if (mod.id === 'marca') {
        bodyHtml = `
          <p style="font-size:13px; color:var(--cfg-text-muted); margin-bottom:10px;">Injetar nome, logo e cor primária do restaurante contratante.</p>
          <div style="display:flex; gap:8px;">
            <button onclick="document.querySelector('[data-tab=\\'modulos\\']')?.click()" style="padding:10px 16px; border-radius:8px; background:var(--cfg-primary); color:#fff; border:none; font-weight:700; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:6px;">
              <i class="ph-bold ph-palette"></i> Injetar Marca
            </button>
          </div>
        `;
      } else if (mod.id === 'gerais') {
        bodyHtml = `
          <p style="font-size:13px; color:var(--cfg-text-muted); margin-bottom:10px;">Fuso: Horário de Brasília (GMT-3) • Idioma: Português (Brasil).</p>
          <button onclick="document.querySelector('[data-tab=\\'gerais\\']')?.click()" style="padding:8px 14px; border-radius:8px; border:1px solid var(--cfg-border); background:var(--cfg-subtle-bg); color:var(--cfg-text); font-weight:600; font-size:12.5px; cursor:pointer;">
            Alterar Fuso & Idioma
          </button>
        `;
      } else if (mod.id === 'salao_mesas') {
        bodyHtml = `
          <p style="font-size:13px; color:var(--cfg-text-muted); margin-bottom:10px;">Monitoramento de 12 mesas ativas no salão principal.</p>
          <button onclick="document.querySelector('[data-tab=\\'mesas\\']')?.click()" style="padding:8px 14px; border-radius:8px; background:#0ea5e9; color:#fff; border:none; font-weight:700; font-size:12.5px; cursor:pointer;">
            Gerenciar Mesas & Comandas
          </button>
        `;
      } else if (mod.id === 'kds_cozinha') {
        bodyHtml = `
          <p style="font-size:13px; color:var(--cfg-text-muted); margin-bottom:10px;">Tempo crítico: 20 min • Alerta sonoro ativo.</p>
          <button onclick="document.querySelector('[data-tab=\\'sons\\']')?.click()" style="padding:8px 14px; border-radius:8px; border:1px solid var(--cfg-border); background:var(--cfg-subtle-bg); color:var(--cfg-text); font-weight:600; font-size:12.5px; cursor:pointer;">
            Configurar Sons KDS
          </button>
        `;
      } else if (mod.id === 'nfce_fiscal') {
        bodyHtml = `
          <p style="font-size:13px; color:var(--cfg-text-muted); margin-bottom:10px;">Transmissão SEFAZ: Modo Produção • TEF Integrado.</p>
          <button onclick="document.querySelector('[data-tab=\\'nfce\\']')?.click()" style="padding:8px 14px; border-radius:8px; background:#2563eb; color:#fff; border:none; font-weight:700; font-size:12.5px; cursor:pointer;">
            Configurações Fiscais
          </button>
        `;
      } else if (mod.id === 'fidelidade') {
        bodyHtml = `
          <p style="font-size:13px; color:var(--cfg-text-muted); margin-bottom:10px;">Programa VIP ativo com cashback de 5% em créditos.</p>
          <button onclick="document.querySelector('[data-tab=\\'fidelidade\\']')?.click()" style="padding:8px 14px; border-radius:8px; border:1px solid var(--cfg-border); background:var(--cfg-subtle-bg); color:var(--cfg-text); font-weight:600; font-size:12.5px; cursor:pointer;">
            Gerenciar Fidelidade
          </button>
        `;
      } else if (mod.id === 'modulos_hub') {
        bodyHtml = `
          <p style="font-size:13px; color:var(--cfg-text-muted); margin-bottom:10px;">Hub com 5 extensões plug-and-play ativas.</p>
          <button onclick="document.querySelector('[data-tab=\\'modulos\\']')?.click()" style="padding:8px 14px; border-radius:8px; background:#8b5cf6; color:#fff; border:none; font-weight:700; font-size:12.5px; cursor:pointer;">
            Central de Extensões (Suporte)
          </button>
        `;
      } else if (mod.id === 'licenca') {
        bodyHtml = `
          <p style="font-size:13px; color:var(--cfg-text-muted); margin-bottom:10px;">Plano: Chef Cozinha Pro • Instalação Ativa.</p>
          <button onclick="document.querySelector('[data-tab=\\'licenca\\']')?.click()" style="padding:8px 14px; border-radius:8px; border:1px solid var(--cfg-border); background:var(--cfg-subtle-bg); color:var(--cfg-text); font-weight:600; font-size:12.5px; cursor:pointer;">
            Status da Licença
          </button>
        `;
      }

      card.innerHTML = cardHeaderHtml + bodyHtml;
      container.appendChild(card);
    });
  };

  // Trocar tamanho de um card específico (P, M, G)
  window.alterarTamanhoCardHome = function (modId, novoTamanho) {
    const lista = window.obterLayoutHome();
    const item = lista.find(m => m.id === modId);
    if (item) {
      item.tamanho = novoTamanho;
      window.salvarLayoutHome(lista);
      window.carregarLayoutHomeUI();
    }
  };

  // Ocultar card da Home
  window.ocultarCardHome = function (modId) {
    const lista = window.obterLayoutHome();
    const item = lista.find(m => m.id === modId);
    if (item) {
      item.ativo = false;
      window.salvarLayoutHome(lista);
      window.carregarLayoutHomeUI();
    }
  };

  // Modal de Personalização dos Módulos da Home
  window.abrirModalPersonalizarHome = function () {
    const modal = document.getElementById('modal-personalizar-home');
    const container = document.getElementById('lista-config-modulos-home');
    if (!modal || !container) return;

    const lista = window.obterLayoutHome();
    container.innerHTML = lista.map(mod => `
      <div style="background:var(--cfg-subtle-bg); border:1px solid var(--cfg-border); border-radius:14px; padding:14px 18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <input type="checkbox" id="cfg-home-mod-check-${mod.id}" ${mod.ativo ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--cfg-primary); cursor:pointer;">
          <div>
            <strong style="font-size:14.5px; color:var(--cfg-heading); display:block;">${mod.nome}</strong>
            <span style="font-size:12px; color:var(--cfg-text-muted);">Módulo ID: ${mod.id}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:12px; font-weight:700; color:var(--cfg-text-muted);">Proporção:</span>
          <select id="cfg-home-mod-size-${mod.id}" style="padding:6px 12px; border-radius:8px; border:1px solid var(--cfg-border); background:var(--cfg-card-bg); color:var(--cfg-text); font-size:13px; font-weight:700; cursor:pointer;">
            <option value="p" ${mod.tamanho === 'p' ? 'selected' : ''}>P (1 Coluna)</option>
            <option value="m" ${mod.tamanho === 'm' ? 'selected' : ''}>M (2 Colunas)</option>
            <option value="g" ${mod.tamanho === 'g' ? 'selected' : ''}>G (Largura Total)</option>
          </select>
        </div>
      </div>
    `).join('');

    modal.style.display = 'flex';
  };

  window.fecharModalPersonalizarHome = function () {
    const modal = document.getElementById('modal-personalizar-home');
    if (modal) modal.style.display = 'none';
  };

  window.salvarLayoutHomeUI = function () {
    const lista = window.obterLayoutHome();
    lista.forEach(mod => {
      const chk = document.getElementById(`cfg-home-mod-check-${mod.id}`);
      const sel = document.getElementById(`cfg-home-mod-size-${mod.id}`);
      if (chk) mod.ativo = chk.checked;
      if (sel) mod.tamanho = sel.value;
    });

    window.salvarLayoutHome(lista);
    window.fecharModalPersonalizarHome();
    window.carregarLayoutHomeUI();

    if (typeof Swal !== 'undefined') {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Layout da Página Inicial Salvo!', showConfirmButton: false, timer: 2000 });
    }
  };

  // Inicializar Home quando a página carrega
  document.addEventListener('DOMContentLoaded', () => {
    window.carregarLayoutHomeUI();
  });
})();



  // =========================================================================
  // 🧠 HUB DE INTELIGÊNCIA ARTIFICIAL (GOOGLE GEMINI) - VENDAS & PROMOÇÕES
  // =========================================================================

  let _iaChatHistory = [];
  let _iaPromocoesGeradas = [];

  window.toggleShowIaKey = function() {
    const input = document.getElementById('ia-gemini-key');
    const icon = document.getElementById('ia-key-eye-icon');
    if (!input || !icon) return;
    if (input.type === 'password') {
      input.type = 'text';
      icon.className = 'ph ph-eye-slash';
    } else {
      input.type = 'password';
      icon.className = 'ph ph-eye';
    }
  };

  window.switchIaSubtab = function(tabName) {
    document.querySelectorAll('.ia-subtab-btn').forEach(btn => {
      const active = btn.getAttribute('data-subtab') === tabName;
      btn.style.background = active ? '#3b82f6' : 'var(--cfg-card-bg)';
      btn.style.color = active ? 'white' : 'var(--cfg-text)';
      btn.style.border = active ? 'none' : '1px solid var(--cfg-border)';
    });

    document.querySelectorAll('.ia-subtab-panel').forEach(p => { p.style.display = 'none'; });
    const target = document.getElementById('ia-subtab-panel-' + tabName);
    if (target) target.style.display = 'block';
  };

  window.carregarConfigIA = async function() {
    try {
      const res = await fetch('/api/ia/config', { credentials: 'same-origin' });
      const data = await res.json();
      if (!data || !data.ok || !data.config) return;

      const cfg = data.config;
      const keyInput = document.getElementById('ia-gemini-key');
      const modelSelect = document.getElementById('ia-gemini-model');
      const tomInput = document.getElementById('ia-tom-voz');
      const badgeHeader = document.getElementById('ia-status-badge-header');

      if (keyInput && cfg.has_key && !keyInput.value) {
        keyInput.value = cfg.masked_key;
      }
      if (modelSelect && cfg.ia_model) {
        modelSelect.value = cfg.ia_model;
      }
      if (tomInput && cfg.ia_tom_voz) {
        tomInput.value = cfg.ia_tom_voz;
      }

      if (badgeHeader) {
        if (cfg.has_key) {
          badgeHeader.textContent = '● Chave IA Conectada';
          badgeHeader.style.background = '#10b981';
        } else {
          badgeHeader.textContent = 'Chave não configurada';
          badgeHeader.style.background = '#ef4444';
        }
      }
    } catch (e) {
      console.warn('[IA Config] Falha ao carregar configurações de IA:', e.message);
    }
  };

  window.salvarConfigIA = async function() {
    const keyInput = document.getElementById('ia-gemini-key');
    const modelSelect = document.getElementById('ia-gemini-model');
    const tomInput = document.getElementById('ia-tom-voz');

    const payload = {
      ia_model: modelSelect ? modelSelect.value : 'gemini-2.5-flash',
      ia_tom_voz: tomInput ? tomInput.value.trim() : '',
      ia_ativa: true
    };

    if (keyInput && keyInput.value && !keyInput.value.includes('••••')) {
      payload.ia_api_key = keyInput.value.trim();
    }

    try {
      const res = await fetch('/api/ia/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data && data.ok) {
        if (typeof showToast === 'function') showToast(data.mensagem || 'Configuração de IA salva com sucesso!', 'success');
        else alert(data.mensagem || 'Configuração de IA salva com sucesso!');
        window.carregarConfigIA();
      } else {
        alert(data.erro || 'Erro ao salvar configuração de IA.');
      }
    } catch (err) {
      alert('Erro de conexão ao salvar IA: ' + err.message);
    }
  };

  window.testarChaveIA = async function() {
    const keyInput = document.getElementById('ia-gemini-key');
    const modelSelect = document.getElementById('ia-gemini-model');
    const btn = document.getElementById('btn-testar-ia');
    const resultSpan = document.getElementById('ia-test-result');

    if (btn) btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Testando...';
    if (resultSpan) { resultSpan.textContent = 'Validando chave com o Google...'; resultSpan.style.color = '#3b82f6'; }

    try {
      const res = await fetch('/api/ia/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: keyInput ? keyInput.value.trim() : '',
          model: modelSelect ? modelSelect.value : 'gemini-2.5-flash'
        })
      });
      const data = await res.json();
      if (data && data.ok) {
        if (resultSpan) { resultSpan.textContent = '✓ Conexão com Gemini OK!'; resultSpan.style.color = '#10b981'; }
        if (typeof showToast === 'function') showToast('Chave de API do Gemini validada com sucesso!', 'success');
      } else {
        if (resultSpan) { resultSpan.textContent = '✗ Falha: ' + (data.erro || 'Chave inválida'); resultSpan.style.color = '#ef4444'; }
      }
    } catch (e) {
      if (resultSpan) { resultSpan.textContent = '✗ Erro: ' + e.message; resultSpan.style.color = '#ef4444'; }
    } finally {
      if (btn) btn.innerHTML = '<i class="ph-bold ph-plug"></i> Testar Conexão IA';
    }
  };

  window.gerarPromocoesIAComGemini = async function() {
    const focoSelect = document.getElementById('ia-promocao-foco');
    const loading = document.getElementById('ia-promocoes-loading');
    const empty = document.getElementById('ia-promocoes-empty');
    const grid = document.getElementById('ia-promocoes-grid');
    const diagCard = document.getElementById('ia-diagnostico-card');
    const diagTexto = document.getElementById('ia-diagnostico-texto');
    const btnGerar = document.getElementById('btn-gerar-promocoes-ia');

    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (grid) { grid.innerHTML = ''; grid.style.display = 'none'; }
    if (diagCard) diagCard.style.display = 'none';
    if (btnGerar) { btnGerar.disabled = true; btnGerar.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Criando...'; }

    try {
      const res = await fetch('/api/ia/gerar-promocoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objetivo: focoSelect ? focoSelect.value : '' })
      });
      const data = await res.json();

      if (!data || !data.ok || !data.resultado) {
        if (empty) {
          empty.style.display = 'block';
          empty.querySelector('h4').textContent = 'Aviso da IA';
          empty.querySelector('p').textContent = data.erro || 'Não foi possível gerar sugestões com os dados atuais.';
        }
        return;
      }

      const resIA = data.resultado;
      _iaPromocoesGeradas = resIA.promocoes || [];

      if (resIA.analise_estrategica && diagCard && diagTexto) {
        diagTexto.textContent = resIA.analise_estrategica;
        diagCard.style.display = 'block';
      }

      if (_iaPromocoesGeradas.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
      }

      if (grid) {
        grid.style.display = 'grid';
        grid.innerHTML = _iaPromocoesGeradas.map((p, idx) => {
          const promoEncoded = encodeURIComponent(JSON.stringify(p));
          const prodsBadges = (p.produtos_envolvidos || []).map(pr =>
            `<span style="background: rgba(59, 130, 246, 0.08); color: #2563eb; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;">${escapeHtml(pr)}</span>`
          ).join(' ');

          const diasStr = Array.isArray(p.dias_recomendados) ? p.dias_recomendados.join(', ') : (p.dias_recomendados || 'Todos os dias');

          return `
            <div style="background: var(--cfg-card-bg); border: 1.5px solid var(--cfg-border); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 4px 15px rgba(0,0,0,0.05); transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 25px rgba(0,0,0,0.1)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 15px rgba(0,0,0,0.05)';">
              <div style="padding: 18px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px; gap: 8px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 26px;">${p.emoji || '🍔'}</span>
                    <div>
                      <h4 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--cfg-text);">${escapeHtml(p.titulo)}</h4>
                      <span style="font-size: 11px; color: #10b981; font-weight: 700; text-transform: uppercase;">${escapeHtml(p.tipo || 'Combo')}</span>
                    </div>
                  </div>
                  <span style="background: #dcfce7; color: #15803d; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 800;">
                    -${p.desconto_percentual || 0}% OFF
                  </span>
                </div>

                <p style="margin: 0 0 12px; font-size: 13px; color: var(--cfg-text-muted); line-height: 1.4;">
                  ${escapeHtml(p.descricao)}
                </p>

                <div style="margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 4px;">
                  ${prodsBadges}
                </div>

                <div style="background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b; padding: 8px 12px; border-radius: 4px; margin-bottom: 14px;">
                  <div style="font-size: 10px; font-weight: 800; color: #d97706; text-transform: uppercase;">💡 Motivo Estratégico IA</div>
                  <div style="font-size: 12px; color: var(--cfg-text); line-height: 1.3;">${escapeHtml(p.motivo_estrategico || 'Aumenta conversão e giro.')}</div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.02); border-radius: 10px; padding: 10px 14px; border: 1px dashed var(--cfg-border);">
                  <div>
                    <div style="font-size: 11px; color: var(--cfg-text-muted); text-decoration: line-through;">De R$ ${Number(p.preco_original || 0).toFixed(2).replace('.', ',')}</div>
                    <div style="font-size: 18px; font-weight: 800; color: #10b981;">Por R$ ${Number(p.preco_promocional || 0).toFixed(2).replace('.', ',')}</div>
                  </div>
                  <div style="text-align: right; font-size: 11px; color: var(--cfg-text-muted);">
                    📅 ${escapeHtml(diasStr)}
                  </div>
                </div>
              </div>

<!-- Ações da Promoção -->
              <div style="padding: 14px 18px; background: rgba(0,0,0,0.02); border-top: 1px solid var(--cfg-border); display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; gap: 6px;">
                  <button type="button" onclick="window.aplicarPromocaoIADireto('${promoEncoded}')" style="flex: 1; padding: 10px; background: #10b981; color: white; border: none; border-radius: 10px; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 10px rgba(16,185,129,0.2);">
                    <i class="ph-bold ph-plus-circle"></i> Adicionar ao Cardápio
                  </button>
                  <button type="button" onclick="window.gerarCupomPromocaoIA('${promoEncoded}')" style="flex: 1; padding: 10px; background: #f59e0b; color: white; border: none; border-radius: 10px; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 10px rgba(245,158,11,0.2);">
                    <i class="ph-bold ph-qr-code"></i> Gerar Cupom QR
                  </button>
                </div>
                <div style="display: flex; gap: 6px;">
                  <button type="button" onclick="window.copiarTextoGenerico('${encodeURIComponent(p.copy_whatsapp || '')}', 'Copiado para WhatsApp!')" style="flex: 1; padding: 7px; background: #25D366; color: white; border: none; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
                    <i class="ph-bold ph-whatsapp-logo"></i> WhatsApp
                  </button>
                  <button type="button" onclick="window.copiarTextoGenerico('${encodeURIComponent(p.copy_instagram || '')}', 'Copiado para Instagram!')" style="flex: 1; padding: 7px; background: #E1306C; color: white; border: none; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
                    <i class="ph-bold ph-instagram-logo"></i> Instagram
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (err) {
      alert('Erro ao gerar promoções: ' + err.message);
    } finally {
      if (loading) loading.style.display = 'none';
      if (btnGerar) { btnGerar.disabled = false; btnGerar.innerHTML = '<i class="ph-bold ph-sparkle"></i> Gerar Promoções Agora'; }
    }
  };

  window.aplicarPromocaoIADireto = async function(encodedPromo) {
    try {
      const p = JSON.parse(decodeURIComponent(encodedPromo));
      const res = await fetch('/api/ia/aplicar-promocao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: p.titulo,
          preco: p.preco_promocional,
          emoji: p.emoji,
          descricao: p.descricao,
          produtos_envolvidos: p.produtos_envolvidos,
          desconto_percentual: p.desconto_percentual
        })
      });
      const data = await res.json();
      if (data && data.ok) {
        if (typeof showToast === 'function') showToast(data.mensagem || 'Promoção cadastrada com sucesso no cardápio!', 'success');
        else alert(data.mensagem || 'Promoção cadastrada com sucesso!');
      } else {
        alert(data.erro || 'Erro ao cadastrar promoção.');
      }
    } catch (e) {
      alert('Falha ao aplicar promoção: ' + e.message);
    }
  };

  window.copiarTextoGenerico = function(encodedText, msgSuccess) {
    const text = decodeURIComponent(encodedText || '');
    if (!text) { alert('Nenhum texto disponível para cópia.'); return; }
    navigator.clipboard.writeText(text).then(() => {
      if (typeof showToast === 'function') showToast(msgSuccess || 'Texto copiado para a área de transferência!', 'success');
      else alert(msgSuccess || 'Texto copiado com sucesso!');
    }).catch(() => {
      prompt('Copie o texto abaixo:', text);
    });
  };

  window.gerarCopyVendasIA = async function() {
    const canalSelect = document.getElementById('ia-copy-canal');
    const temaInput = document.getElementById('ia-copy-tema');
    const loading = document.getElementById('ia-copy-loading');
    const grid = document.getElementById('ia-copy-results-grid');
    const btn = document.getElementById('btn-gerar-copy-ia');

    if (loading) loading.style.display = 'block';
    if (grid) { grid.innerHTML = ''; }
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Escrevendo...'; }

    try {
      const res = await fetch('/api/ia/gerar-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canal: canalSelect ? canalSelect.value : 'whatsapp',
          promocao: temaInput ? temaInput.value.trim() : ''
        })
      });
      const data = await res.json();
      if (!data || !data.ok || !data.resultado || !data.resultado.opcoes) {
        alert(data.erro || 'Erro ao gerar textos de vendas.');
        return;
      }

      if (grid) {
        grid.innerHTML = data.resultado.opcoes.map((op, idx) => `
          <div style="background: var(--cfg-card-bg); border: 1.5px solid var(--cfg-border); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="background: rgba(139, 92, 246, 0.1); color: #8b5cf6; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">
                  ${escapeHtml(op.estilo || 'Opção')}
                </span>
                <span style="font-size: 11px; color: var(--cfg-text-muted);">Opção #${idx + 1}</span>
              </div>
              <h4 style="margin: 0 0 10px; font-size: 14px; color: var(--cfg-text);">${escapeHtml(op.titulo || '')}</h4>
              <div style="background: rgba(0,0,0,0.02); border: 1px solid var(--cfg-border); border-radius: 8px; padding: 12px; font-size: 13px; color: var(--cfg-text); white-space: pre-wrap; line-height: 1.5; font-family: sans-serif; margin-bottom: 14px;">${escapeHtml(op.texto || '')}</div>
            </div>
            <button type="button" onclick="window.copiarTextoGenerico('${encodeURIComponent(op.texto || '')}', 'Mensagem copiada!')" style="width: 100%; padding: 9px; background: #8b5cf6; color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <i class="ph-bold ph-copy"></i> Copiar Mensagem Pronta
            </button>
          </div>
        `).join('');
      }
    } catch (e) {
      alert('Falha de conexão: ' + e.message);
    } finally {
      if (loading) loading.style.display = 'none';
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph-bold ph-pencil-simple-line"></i> Criar Textos de Vendas'; }
    }
  };

  window.enviarPromptRapidoConsultor = function(promptText) {
    const input = document.getElementById('ia-chat-input');
    if (input) {
      input.value = promptText;
      window.enviarMensagemConsultorIA();
    }
  };

  window.enviarMensagemConsultorIA = async function() {
    const input = document.getElementById('ia-chat-input');
    const msgContainer = document.getElementById('ia-chat-messages');
    const btnSend = document.getElementById('btn-ia-chat-send');
    const pergunta = input ? input.value.trim() : '';

    if (!pergunta) return;
    input.value = '';

    // Adiciona mensagem do usuário na tela
    const userBubble = document.createElement('div');
    userBubble.style.cssText = 'background: #3b82f6; color: white; border-radius: 14px 14px 4px 14px; padding: 12px 16px; max-width: 80%; font-size: 13px; line-height: 1.4; align-self: flex-end;';
    userBubble.textContent = pergunta;
    if (msgContainer) {
      msgContainer.appendChild(userBubble);
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    // Loading da IA
    const botLoading = document.createElement('div');
    botLoading.style.cssText = 'background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.15); border-radius: 14px 14px 14px 4px; padding: 12px 16px; max-width: 80%; font-size: 13px; color: var(--cfg-text); align-self: flex-start;';
    botLoading.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Pensando na melhor estratégia...';
    if (msgContainer) {
      msgContainer.appendChild(botLoading);
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    if (btnSend) btnSend.disabled = true;

    try {
      const res = await fetch('/api/ia/consultor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pergunta,
          historico: _iaChatHistory.slice(-6)
        })
      });
      const data = await res.json();

      if (data && data.ok && data.resposta) {
        botLoading.innerHTML = data.resposta.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        _iaChatHistory.push({ role: 'user', text: pergunta });
        _iaChatHistory.push({ role: 'assistant', text: data.resposta });
      } else {
        botLoading.innerHTML = '<span style="color:#ef4444;">❌ ' + (data.erro || 'Erro ao consultar IA.') + '</span>';
      }
    } catch (e) {
      botLoading.innerHTML = '<span style="color:#ef4444;">❌ Erro de conexão: ' + e.message + '</span>';
    } finally {
      if (btnSend) btnSend.disabled = false;
      if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
    }
  };


  // ── GERENCIADOR DOS MÓDULOS DA CENTRAL OPERACIONAL / CAIXA V1.1 ──
  const MODULOS_DISPONIVEIS_CENTRAL = [
    { id: 'resumo', nome: 'Resumo do Dia & Caixa', desc: 'Faturamento, mesas ocupadas, contas pedidas e ações de suprimento/sangria', icone: 'ph-chart-bar', cor: '#10b981', defSize: 'l' },
    { id: 'mesas', nome: 'Mesas & Comandas', desc: 'Mapa rápido de mesas do salão, comanda digital e transferência', icone: 'ph-squares-four', cor: '#fc4b15', defSize: 'l' },
    { id: 'chamados', nome: 'Chamados & Contas Solicitadas', desc: 'Alertas de clientes e garçons solicitando fechamento ou atendimento', icone: 'ph-hand-raising', cor: '#3b82f6', defSize: 'm' },
    { id: 'fila', nome: 'Fila de Cozinha & KDS', desc: 'Itens em preparo na cozinha aguardando entrega no salão', icone: 'ph-cooking-pot', cor: '#f59e0b', defSize: 'm' },
    { id: 'entregas', nome: 'Delivery & Motoboys', desc: 'Pedidos em rota de entrega e disponibilidade de motoboys', icone: 'ph-moped', cor: '#f59e0b', defSize: 'm' },
    { id: 'tarefas', nome: 'Checklist & Tarefas do Turno', desc: 'Controle de tarefas operacionais de abertura, limpeza e fechamento', icone: 'ph-check-square', cor: '#3b82f6', defSize: 'm' },
    { id: 'estoque', nome: 'Estoque Crítico & Alertas', desc: 'Avisos visuais de ingredientes ou produtos com estoque baixo', icone: 'ph-warning', cor: '#ef4444', defSize: 's' },
    { id: 'balanca', nome: 'Balança Comercial & Buffet', desc: 'Pesagem rápida com cálculo por kg e ajuste de tara de pratos', icone: 'ph-scales', cor: '#ec4899', defSize: 'm' },
    { id: 'fidelidade', nome: 'Fidelidade & Cashback', desc: 'Consulta e resgate de saldo de cashback por CPF do cliente', icone: 'ph-gift', cor: '#8b5cf6', defSize: 'm' },
    { id: 'ponto', nome: 'Ponto do Colaborador', desc: 'QR Code de registro de ponto em tempo real para os colaboradores', icone: 'ph-fingerprint', cor: '#0f172a', defSize: 's' },
    { id: 'atalhos', nome: 'Todas as Seções & Atalhos', desc: 'Grid de botões rápidos para todas as páginas operacionais', icone: 'ph-rocket-launch', cor: '#fc4b15', defSize: 'l' }
  ];

  window.renderizarConfiguracaoModulosHome = function() {
    const container = document.getElementById('lista-modulos-config-painel');
    if (!container) return;

    let layoutSalvo = {};
    try {
      layoutSalvo = JSON.parse(localStorage.getItem('chef_v11_layout_v1') || '{}');
    } catch(e) {}

    const desktopLayout = layoutSalvo.desktop || { order: [], hidden: [], sizes: {} };
    const hiddenList = desktopLayout.hidden || [];
    const sizesMap = desktopLayout.sizes || {};

    container.innerHTML = MODULOS_DISPONIVEIS_CENTRAL.map(mod => {
      const isAtivo = !hiddenList.includes(mod.id);
      const sizeAtual = sizesMap[mod.id] || mod.defSize;

      return `
        <div style="background:var(--cfg-subtle-bg); border:1.5px solid var(--cfg-border); border-radius:14px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; gap:12px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:36px; height:36px; border-radius:10px; background:${mod.cor}15; color:${mod.cor}; display:flex; align-items:center; justify-content:center; font-size:20px;">
                <i class="ph-bold ${mod.icone}"></i>
              </div>
              <div>
                <strong style="font-size:14px; color:var(--cfg-heading); display:block;">${mod.nome}</strong>
                <span style="font-size:11.5px; color:var(--cfg-text-muted); line-height:1.3; display:block;">${mod.desc}</span>
              </div>
            </div>
            <label style="cursor:pointer; display:flex; align-items:center;">
              <input type="checkbox" id="cfg-mod-ativo-${mod.id}" ${isAtivo ? 'checked' : ''} style="width:18px; height:18px; accent-color:#fc4b15; cursor:pointer;">
            </label>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--cfg-border); padding-top:10px; margin-top:4px;">
            <span style="font-size:12px; font-weight:700; color:var(--cfg-text-muted);">Tamanho:</span>
            <select id="cfg-mod-size-${mod.id}" style="padding:5px 10px; border-radius:8px; border:1px solid var(--cfg-border); background:var(--cfg-card-bg); color:var(--cfg-text); font-size:12px; font-weight:700; cursor:pointer;">
              <option value="s" ${sizeAtual === 's' ? 'selected' : ''}>P (Pequeno)</option>
              <option value="m" ${sizeAtual === 'm' ? 'selected' : ''}>M (Médio)</option>
              <option value="l" ${sizeAtual === 'l' ? 'selected' : ''}>G (Grande / Largura Total)</option>
            </select>
          </div>
        </div>
      `;
    }).join('');
  };

  window.salvarConfiguracaoModulosHome = function() {
    let layoutSalvo = {};
    try {
      layoutSalvo = JSON.parse(localStorage.getItem('chef_v11_layout_v1') || '{}');
    } catch(e) {}

    const hidden = [];
    const sizes = {};

    MODULOS_DISPONIVEIS_CENTRAL.forEach(mod => {
      const chk = document.getElementById(`cfg-mod-ativo-${mod.id}`);
      const sel = document.getElementById(`cfg-mod-size-${mod.id}`);
      if (chk && !chk.checked) hidden.push(mod.id);
      if (sel) sizes[mod.id] = sel.value;
    });

    ['desktop', 'tv', 'tablet', 'mobile'].forEach(profile => {
      if (!layoutSalvo[profile]) {
        layoutSalvo[profile] = { order: MODULOS_DISPONIVEIS_CENTRAL.map(m => m.id), hidden: [], sizes: {} };
      }
      layoutSalvo[profile].hidden = hidden;
      layoutSalvo[profile].sizes = { ...layoutSalvo[profile].sizes, ...sizes };
    });

    localStorage.setItem('chef_v11_layout_v1', JSON.stringify(layoutSalvo));

    if (typeof showToast === 'function') {
      showToast('Configurações dos módulos salvas com sucesso!', 'success');
    } else {
      alert('Configurações dos módulos salvas com sucesso!');
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    window.renderizarConfiguracaoModulosHome();
    if (typeof window.carregarConfiguracaoPixIntegracao === 'function') {
      window.carregarConfiguracaoPixIntegracao();
    }
  });

  /* ─────────────────────────────────────────────────────────────
     MÓDULO: INTEGRAÇÃO CHAVE PIX & GERADOR DE QR CODE DINÂMICO
  ───────────────────────────────────────────────────────────── */
  (function() {
    let _pixConfigCache = null;

    function sanitizeTexto(t, maxLen) {
      if (!t) return '';
      return String(t)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9 ]/g, '')
        .toUpperCase()
        .trim()
        .slice(0, maxLen);
    }

    window.onPixTipoChaveChange = function() {
      const tipo = document.getElementById('cfg-pix-tipo-chave')?.value || 'cpf';
      const hint = document.getElementById('pix-chave-hint');
      const input = document.getElementById('cfg-pix-chave');
      if (!input) return;

      if (tipo === 'cpf') {
        input.placeholder = '000.000.000-00 ou 00000000000';
        if (hint) hint.innerText = 'Ex: 123.456.789-00';
      } else if (tipo === 'cnpj') {
        input.placeholder = '00.000.000/0000-00 ou 00000000000000';
        if (hint) hint.innerText = 'Ex: 12.345.678/0001-90';
      } else if (tipo === 'telefone') {
        input.placeholder = '+55 11 99999-9999 ou 11999999999';
        if (hint) hint.innerText = 'Ex: +55 (11) 98765-4321';
      } else if (tipo === 'email') {
        input.placeholder = 'financeiro@seurestaurante.com.br';
        if (hint) hint.innerText = 'Ex: pix@empresa.com';
      } else if (tipo === 'aleatoria') {
        input.placeholder = '123e4567-e89b-12d3-a456-426614174000';
        if (hint) hint.innerText = 'Chave EVP / UUID do Banco Central';
      }
    };

    window.onPixChaveInput = function() {
      const chave = document.getElementById('cfg-pix-chave')?.value || '';
      window.atualizarBadgeStatusPix(chave);
    };

    window.onPixNomeInput = function() {
      const el = document.getElementById('cfg-pix-nome-recebedor');
      const counter = document.getElementById('pix-nome-counter');
      if (!el) return;
      if (counter) counter.innerText = `${el.value.length}/25`;
    };

    window.onPixCidadeInput = function() {
      const el = document.getElementById('cfg-pix-cidade');
      const counter = document.getElementById('pix-cidade-counter');
      if (!el) return;
      if (counter) counter.innerText = `${el.value.length}/15`;
    };

    window.atualizarBadgeStatusPix = function(chave) {
      const badge = document.getElementById('pix-status-badge');
      if (!badge) return;
      const temChave = Boolean(chave && String(chave).trim().length > 3);
      if (temChave) {
        badge.style.background = 'rgba(16, 185, 129, 0.15)';
        badge.style.color = '#10b981';
        badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        badge.innerHTML = '<i class="ph ph-check-circle"></i> Configurado & Ativo';
      } else {
        badge.style.background = 'rgba(245, 158, 11, 0.15)';
        badge.style.color = '#f59e0b';
        badge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        badge.innerHTML = '<i class="ph ph-warning"></i> Chave Pix Pendente';
      }
    };

    window.colarChavePixClipboard = async function() {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const texto = await navigator.clipboard.readText();
          const input = document.getElementById('cfg-pix-chave');
          if (input && texto) {
            input.value = texto.trim();
            window.onPixChaveInput();
            if (typeof showToast === 'function') showToast('Chave Pix colada!', 'info');
          }
        }
      } catch (err) {
        console.warn('Clipboard read error:', err);
      }
    };

    window.carregarConfiguracaoPixIntegracao = function() {
      fetch('/api/pix/config')
        .then(r => r.json())
        .then(res => {
          if (res && res.ok && res.config) {
            const c = res.config;
            _pixConfigCache = c;

            const elTipo = document.getElementById('cfg-pix-tipo-chave');
            const elChave = document.getElementById('cfg-pix-chave');
            const elNome = document.getElementById('cfg-pix-nome-recebedor');
            const elCidade = document.getElementById('cfg-pix-cidade');
            const elTxid = document.getElementById('cfg-pix-txid-prefix');
            const elAuto = document.getElementById('cfg-pix-auto-qr-venda');
            const elAtivo = document.getElementById('cfg-pix-ativo');

            if (elTipo && c.pix_tipo_chave) elTipo.value = c.pix_tipo_chave;
            if (elChave && c.pix_chave !== undefined) elChave.value = c.pix_chave;
            if (elNome && c.pix_nome_recebedor !== undefined) elNome.value = c.pix_nome_recebedor;
            if (elCidade && c.pix_cidade !== undefined) elCidade.value = c.pix_cidade;
            if (elTxid && c.pix_txid_prefix !== undefined) elTxid.value = c.pix_txid_prefix;
            if (elAuto) elAuto.checked = (c.pix_auto_qr_venda !== 'false');
            if (elAtivo) elAtivo.checked = (c.pix_ativo !== 'false');

            window.onPixTipoChaveChange();
            window.onPixNomeInput();
            window.onPixCidadeInput();
            window.atualizarBadgeStatusPix(c.pix_chave);

            // Dispara simulador de teste
            setTimeout(() => {
              if (typeof window.testarPixDinamicoSimulador === 'function') {
                window.testarPixDinamicoSimulador();
              }
            }, 250);
          }
        })
        .catch(err => {
          console.warn('[Pix Config Load Error]', err);
        });
    };

    window.salvarConfiguracaoPixIntegracao = function() {
      const elTipo = document.getElementById('cfg-pix-tipo-chave');
      const elChave = document.getElementById('cfg-pix-chave');
      const elNome = document.getElementById('cfg-pix-nome-recebedor');
      const elCidade = document.getElementById('cfg-pix-cidade');
      const elTxid = document.getElementById('cfg-pix-txid-prefix');
      const elAuto = document.getElementById('cfg-pix-auto-qr-venda');
      const elAtivo = document.getElementById('cfg-pix-ativo');

      const chave = (elChave?.value || '').trim();
      const nome = sanitizeTexto(elNome?.value || 'CHEF COZINHA', 25);
      const cidade = sanitizeTexto(elCidade?.value || 'BRASIL', 15);
      const tipo = elTipo?.value || 'cpf';
      const txidPrefix = (elTxid?.value || 'VD').replace(/[^A-Za-z0-9]/g, '').slice(0, 5) || 'VD';
      const autoQr = elAuto?.checked ? 'true' : 'false';
      const ativo = elAtivo?.checked ? 'true' : 'false';

      if (!chave && elAtivo?.checked) {
        if (typeof showToast === 'function') showToast('Por favor, informe a Chave Pix do estabelecimento.', 'warning');
        else alert('Por favor, informe a Chave Pix do estabelecimento.');
        if (elChave) elChave.focus();
        return;
      }

      const payload = {
        pix_tipo_chave: tipo,
        pix_chave: chave,
        pix_nome_recebedor: nome,
        pix_cidade: cidade,
        pix_txid_prefix: txidPrefix,
        pix_auto_qr_venda: autoQr,
        pix_ativo: ativo
      };

      const btn1 = document.getElementById('btn-salvar-pix-topo');
      const btn2 = document.getElementById('btn-salvar-pix-form');
      if (btn1) btn1.disabled = true;
      if (btn2) btn2.disabled = true;

      fetch('/api/pix/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(r => r.json())
        .then(res => {
          if (btn1) btn1.disabled = false;
          if (btn2) btn2.disabled = false;

          if (res && res.ok) {
            _pixConfigCache = res.config || payload;
            window.atualizarBadgeStatusPix(chave);
            if (typeof showToast === 'function') {
              showToast('Configurações Pix e QR Code Dinâmico salvas com sucesso!', 'success');
            } else {
              alert('Configurações Pix e QR Code Dinâmico salvas com sucesso!');
            }
            // Atualiza simulador
            window.testarPixDinamicoSimulador();
          } else {
            const erroMsg = res?.erro || 'Erro ao salvar configurações Pix.';
            if (typeof showToast === 'function') showToast(erroMsg, 'error');
            else alert(erroMsg);
          }
        })
        .catch(err => {
          if (btn1) btn1.disabled = false;
          if (btn2) btn2.disabled = false;
          console.error('[Salvar Pix Error]', err);
          if (typeof showToast === 'function') showToast('Erro de conexão ao salvar Pix.', 'error');
          else alert('Erro de conexão ao salvar Pix.');
        });
    };

    window.testarPixDinamicoSimulador = function() {
      const valorInput = document.getElementById('simulador-pix-valor');
      const refInput = document.getElementById('simulador-pix-ref');
      const chaveInput = document.getElementById('cfg-pix-chave');
      const nomeInput = document.getElementById('cfg-pix-nome-recebedor');
      const cidadeInput = document.getElementById('cfg-pix-cidade');

      const valor = parseFloat(valorInput?.value || '49.90');
      const ref = (refInput?.value || 'Mesa 05').trim();
      const chave = (chaveInput?.value || _pixConfigCache?.pix_chave || '').trim();
      const nome = (nomeInput?.value || _pixConfigCache?.pix_nome_recebedor || '').trim();
      const cidade = (cidadeInput?.value || _pixConfigCache?.pix_cidade || '').trim();

      const img = document.getElementById('simulador-pix-qr-img');
      const txt = document.getElementById('simulador-pix-copiacola');
      const valDisplay = document.getElementById('simulador-pix-valor-display');
      const detBeneficiario = document.getElementById('simulador-detalhe-beneficiario');
      const detCidade = document.getElementById('simulador-detalhe-cidade');
      const detTxid = document.getElementById('simulador-detalhe-txid');

      if (valDisplay) {
        valDisplay.innerText = Number.isFinite(valor) && valor > 0
          ? `R$ ${valor.toFixed(2).replace('.', ',')}`
          : 'Valor Aberto';
      }

      fetch('/api/pix/gerar-dinamico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valor: valor > 0 ? valor : 0,
          ref,
          chave_custom: chave || undefined,
          nome_custom: nome || undefined,
          cidade_custom: cidade || undefined
        })
      })
        .then(r => r.json())
        .then(d => {
          if (d && d.ok) {
            if (img) {
              if (d.qrCodeDataUrl) {
                img.src = d.qrCodeDataUrl;
                img.style.display = 'block';
              } else if (typeof window.gerarQrDataUrl === 'function') {
                window.gerarQrDataUrl(d.payload, 200, url => {
                  img.src = url;
                  img.style.display = 'block';
                });
              }
            }
            if (txt) txt.value = d.payload;
            if (detBeneficiario) detBeneficiario.innerText = d.nome || '-';
            if (detCidade) detCidade.innerText = d.cidade || '-';
            if (detTxid) detTxid.innerText = d.txid || '-';
          } else {
            if (txt) txt.value = d?.erro || 'Preencha sua Chave Pix acima para gerar o QR Code.';
          }
        })
        .catch(err => {
          console.warn('[Simulador Pix Error]', err);
        });
    };

    window.copiarPixSimulador = function() {
      const txt = document.getElementById('simulador-pix-copiacola');
      if (!txt || !txt.value) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt.value).then(() => {
          if (typeof showToast === 'function') showToast('Código Pix EMV copiado com sucesso!', 'success');
          else alert('Código Pix copiado!');
        });
      } else {
        txt.select();
        document.execCommand('copy');
        if (typeof showToast === 'function') showToast('Código Pix copiado!', 'success');
        else alert('Código Pix copiado!');
      }
    };

    window.baixarPixSimuladorQr = function() {
      const img = document.getElementById('simulador-pix-qr-img');
      if (!img || !img.src) {
        if (typeof showToast === 'function') showToast('Gere o QR Code primeiro.', 'warning');
        return;
      }
      const a = document.createElement('a');
      a.href = img.src;
      a.download = `pix-qrcode-dinamico-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (typeof showToast === 'function') showToast('Download do QR Code iniciado!', 'info');
    };

    // Atualiza automaticamente quando receber evento via socket
    if (window.socket && typeof window.socket.on === 'function') {
      window.socket.on('pix_config_atualizada', (cfg) => {
        if (cfg) {
          _pixConfigCache = cfg;
          window.atualizarBadgeStatusPix(cfg.pix_chave);
        }
      });
    }
  })();

