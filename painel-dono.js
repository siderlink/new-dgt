// painel-dono.js - Owner Mobile Dashboard Logic (v2 - 60+ Acessível)

// (Segurança) Escapa valor para conteúdo HTML.
function escHtml(v) {
  return (v === null || v === undefined) ? '' : String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 1. Auth check
const token = localStorage.getItem('chef_token');
const loggedUser = localStorage.getItem('logged_user');

if (!token) {
  alert('Faça login primeiro para acessar esta página.');
  window.location.href = '/login.html';
}

// Global meta target
let metaVendas = parseFloat(localStorage.getItem('meta_dono_vendas')) || 5000;

// Initialize socket
const socket = (typeof io === 'function') ? io({
  query: {
    token: token,
    restaurante_id: localStorage.getItem('restaurante_id') || '1'
  }
}) : { on: () => {}, emit: () => {}, disconnect: () => {}, connect: () => {} };
if (typeof initChefTz === 'function') initChefTz(socket);

socket.on('tenant_atualizado', (data) => {
  if (data && data.restaurante_id) localStorage.setItem('restaurante_id', data.restaurante_id);
  if (data && data.token) localStorage.setItem('chef_token', data.token);
  socket.disconnect();
  socket.io.opts.query = { token: data.token, restaurante_id: String(data.restaurante_id) };
  socket.connect();
});

// ─── Cache DOM elements ───────────────────────────────────────
const loader           = document.getElementById('loader');
const faturamentoEl    = document.getElementById('kpi-faturamento');
const mesasEl          = document.getElementById('kpi-mesas');
const ticketEl         = document.getElementById('kpi-ticket');
const equipeEl         = document.getElementById('kpi-equipe');
const goalPercentEl    = document.getElementById('goal-percent');
const goalLabelEl      = document.getElementById('goal-target-label');
const progressFillEl   = document.getElementById('kpi-progress-fill');
const headerTimeEl     = document.getElementById('header-time');
const caixaBadgeEl     = document.getElementById('caixa-badge');
const caixaBadgeTxtEl  = document.getElementById('caixa-badge-txt');

const cashierControlTitle    = document.getElementById('cashier-control-title');
const cashierControlSubtitle = document.getElementById('cashier-control-subtitle');
const cashierToggleBtn       = document.getElementById('cashier-toggle-btn');
const cashierBtnText         = document.getElementById('cashier-btn-text');
const cashierBtnIcon         = document.getElementById('cashier-btn-icon');

const metaInput    = document.getElementById('meta-input');
const notifInput   = document.getElementById('notif-input');
const rankingList  = document.getElementById('ranking-list');
const activityFeed = document.getElementById('activity-feed');

// ─── Helpers ─────────────────────────────────────────────────
function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function setLoader(show) {
  if (show) loader.classList.remove('hidden');
  else loader.classList.add('hidden');
}

// ─── Toast ───────────────────────────────────────────────────
function showToast(text, iconClass = 'ph-info', type = '') {
  const toast     = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  const toastIcon = document.getElementById('toast-icon');

  toastText.innerText = text;
  toastIcon.className = `ph-bold ${iconClass}`;
  toast.className = `toast show ${type}`;

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 4500);
}

// ─── Modal helpers ───────────────────────────────────────────
window.fecharModal = function(id) {
  document.getElementById(id).classList.add('hidden');
};

function abrirModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

// Fechar modal ao clicar no overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});

// ─── Clock ───────────────────────────────────────────────────
function startClock() {
  const update = () => {
    const d = new Date();
    if (headerTimeEl) headerTimeEl.innerText = chefFormatTime(new Date().toISOString());
  };
  update();
  setInterval(update, 60000);
}

// ─── Global period state ──────────────────────────────────────
window.periodoAtual    = 'hoje';
window.dataInicioCustom = '';
window.dataFimCustom   = '';

// ─── Carregar métricas via API ────────────────────────────────
async function carregarMetricas() {
  setLoader(true);
  try {
    let url = `/api/dono/dashboard?periodo=${window.periodoAtual}`;
    if (window.periodoAtual === 'custom' && window.dataInicioCustom && window.dataFimCustom) {
      url += `&data_inicio=${window.dataInicioCustom}&data_fim=${window.dataFimCustom}`;
    }

    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });

    if (res.status === 403 || res.status === 401) {
      alert('Sessão expirada ou sem permissão de administrador.');
      window.location.href = '/login.html';
      return;
    }

    const result = await res.json();
    if (result.success && result.data) {
      const data = result.data;

      // Period label
      const rotuloEl = document.getElementById('periodo-rotulo-exibicao');
      if (rotuloEl) rotuloEl.innerText = data.rotuloPeriodo || 'Hoje';

      const titleFat = document.getElementById('kpi-title-faturamento');
      if (titleFat) titleFat.innerText = `💰 Faturamento (${data.rotuloPeriodo || 'Hoje'})`;

      const subPed = document.getElementById('kpi-sub-total-pedidos');
      if (subPed) subPed.innerText = `${data.totalPedidos || 0} pedidos finalizados`;

      // KPIs
      if (faturamentoEl) faturamentoEl.innerText = formatCurrency(data.faturamentoHoje);
      if (mesasEl)       mesasEl.innerText = data.mesasAtivas || '0';
      if (ticketEl)      ticketEl.innerText = formatCurrency(data.ticketMedio);
      if (equipeEl)      equipeEl.innerText = data.colaboradoresAtivos || '0';

      // Meta
      if (metaInput) metaInput.value = metaVendas;
      if (goalLabelEl) goalLabelEl.innerText = `Meta: ${formatCurrency(metaVendas)}`;

      const percent = metaVendas > 0
        ? Math.min(100, Math.round((data.faturamentoHoje / metaVendas) * 100))
        : 0;
      if (goalPercentEl)  goalPercentEl.innerText = `${percent}% da meta`;
      if (progressFillEl) progressFillEl.style.width = `${percent}%`;

      // Caixa status
      const isOpen = data.caixaStatus === 'Aberto';

      if (caixaBadgeEl) {
        caixaBadgeEl.className = `status-pill ${isOpen ? 'open' : 'closed'}`;
        caixaBadgeEl.innerHTML = `<span class="dot"></span><span id="caixa-badge-txt">${escHtml(data.caixaStatus)}</span>`;
      }

      if (cashierControlTitle)    cashierControlTitle.innerText  = isOpen ? 'Caixa está Aberto ✅' : 'Caixa está Fechado 🔒';
      if (cashierControlSubtitle) cashierControlSubtitle.innerText = isOpen
        ? `Fundo de troco: ${formatCurrency(data.caixaSaldo)}`
        : 'Toque em "Abrir" para iniciar as vendas.';

      if (cashierToggleBtn) {
        if (isOpen) {
          cashierToggleBtn.className = 'btn-caixa close';
          if (cashierBtnText) cashierBtnText.innerText = 'Fechar';
          if (cashierBtnIcon) cashierBtnIcon.className = 'ph-bold ph-lock';
          cashierToggleBtn.onclick = fecharCaixaFluxo;
        } else {
          cashierToggleBtn.className = 'btn-caixa open';
          if (cashierBtnText) cashierBtnText.innerText = 'Abrir';
          if (cashierBtnIcon) cashierBtnIcon.className = 'ph-bold ph-lock-open';
          cashierToggleBtn.onclick = abrirCaixaFluxo;
        }
      }

      // Ranking de produtos
      if (rankingList) {
        if (data.topProdutos && data.topProdutos.length > 0) {
          rankingList.innerHTML = data.topProdutos.map((p, idx) => `
            <div class="ranking-item">
              <span class="ranking-pos">${idx + 1}º</span>
              <span class="rk-name">${escHtml(p.productEmoji || '🍽️')} ${escHtml(p.productName)}</span>
              <span class="rk-val">${p.quantidade}x</span>
            </div>
          `).join('');
        } else {
          rankingList.innerHTML = `<div style="text-align:center;color:var(--text-sub);padding:24px;font-size:var(--fs-md);">Nenhuma venda (${escHtml(data.rotuloPeriodo || 'período')}).</div>`;
        }
      }
    }
  } catch (error) {
    console.error('Erro ao carregar métricas:', error);
    showToast('Erro de conexão ao atualizar métricas', 'ph-wifi-slash', 'error');
  } finally {
    setLoader(false);
  }
}

// ─── Period Filters ───────────────────────────────────────────
window.selecionarPeriodoDono = function(periodo, btnEl) {
  window.periodoAtual = periodo;
  document.querySelectorAll('.btn-periodo').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  const cust = document.getElementById('container-datas-custom');
  if (cust) cust.style.display = 'none';
  carregarMetricas();
};

window.togglePeriodoCustomDono = function(btnEl) {
  document.querySelectorAll('.btn-periodo').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  const container = document.getElementById('container-datas-custom');
  if (container) container.style.display = container.style.display === 'none' ? 'flex' : 'none';
};

window.aplicarDatasCustomDono = function() {
  const ini = document.getElementById('dono-data-inicio').value;
  const fim = document.getElementById('dono-data-fim').value;
  if (!ini || !fim) return showToast('Selecione a data inicial e final.', 'ph-warning');
  window.periodoAtual    = 'custom';
  window.dataInicioCustom = ini;
  window.dataFimCustom   = fim;
  carregarMetricas();
};

// ─── Controle Remoto — Navegação e Ações do Caixa ─────────────
window.comandarNavegacao = function(destino) {
  socket.emit('comando_navegar_caixa', {
    destino: destino,
    solicitadoPor: loggedUser || 'Dono'
  });
  showToast(`Enviando caixa para ${destino}...`, 'ph-paper-plane');
  adicionarAoFeed('aviso', `Você direcionou o caixa para: ${destino}`);
};

window.comandarCaixaAcao = function(acao, payload) {
  socket.emit('comando_caixa_acao', {
    acao: acao,
    payload: payload || {},
    solicitadoPor: loggedUser || 'Dono'
  });
  const labels = {
    'recarregar': '🔄 Recarregando terminal do Caixa (F5)...',
    'bloquear_tela': '🔒 Bloqueio de segurança enviado ao Caixa!',
    'tocar_alerta': '🔔 Alerta sonoro tocando no Caixa!',
    'alternar_tema': '🌓 Tema do Caixa alternado!',
    'abrir_gaveta': '🖨️ Gaveta de dinheiro acionada!',
    'abrir_fila': '🪑 Fila de espera aberta no Caixa!'
  };
  showToast(labels[acao] || `Comando ${acao} enviado ao Caixa!`, 'ph-lightning');
  adicionarAoFeed('aviso', `Comando executado no Caixa: ${labels[acao] || acao}`);
};

// ─── Modo Totem — transformar um dispositivo em kiosk de autoatendimento ──
let _totemDevicesCb = null;
socket.on('connected_devices', (lista) => {
  if (typeof _totemDevicesCb === 'function') _totemDevicesCb(lista || []);
});

window.abrirModalTotemDispositivos = function() {
  abrirModal('modal-totem-dispositivo');
  carregarListaDispositivosTotem();
};

window.carregarListaDispositivosTotem = function() {
  const container = document.getElementById('lista-totem-dispositivos');
  if (!container) return;
  container.innerHTML = `<div style="text-align:center; color:var(--text-sub); padding:16px; font-size:var(--fs-sm);">Carregando dispositivos...</div>`;
  fetch('/api/totem/status', { headers: { 'Authorization': `Bearer ${localStorage.getItem('chef_token')}` } })
    .then(r => r.json())
    .then(st => {
      const avisoUpsell = document.getElementById('aviso-upsell-totem');
      if (avisoUpsell) avisoUpsell.style.display = (st && st.feature_ativa === false) ? 'block' : 'none';
      _totemDevicesCb = (lista) => renderizarDispositivosTotem(lista, st);
      socket.emit('get_connected_devices');
    })
    .catch(() => {
      _totemDevicesCb = (lista) => renderizarDispositivosTotem(lista, null);
      socket.emit('get_connected_devices');
    });
};

function renderizarDispositivosTotem(lista, statusTotem) {
  const container = document.getElementById('lista-totem-dispositivos');
  if (!container) return;

  const badge = document.getElementById('totem-badge-ativo');
  if (badge) {
    const haTotem = (lista || []).some(d =>
      String(d.device || '').toLowerCase().includes('totem') ||
      String(d.cargo || '').toLowerCase().includes('totem') ||
      String(d.user || '').toLowerCase().includes('totem') ||
      String(d.tipo || '').toLowerCase() === 'totem');
    badge.style.display = haTotem ? 'inline-block' : 'none';
  }

  if (!lista || lista.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-sub); padding:20px; font-size:var(--fs-sm);">
      Nenhum dispositivo conectado agora.<br/>Abra o sistema no aparelho/tablet que virará totem e atualize a lista.</div>`;
    return;
  }

  const featureAtiva = !statusTotem || statusTotem.feature_ativa !== false;

  container.innerHTML = lista.map(d => {
    const ehTotem = String(d.device || '').toLowerCase().includes('totem') ||
      String(d.cargo || '').toLowerCase().includes('totem') ||
      String(d.user || '').toLowerCase().includes('totem') ||
      String(d.tipo || '').toLowerCase() === 'totem';
    const icone = d.isMobile ? 'ph-device-mobile' : 'ph-desktop-tower';
    const apelido = d.apelido || '';
    const tipoBadge = (d.tipo && d.tipo.toLowerCase() !== 'totem')
      ? `<span style="font-size:9px; background:#fef9c3; color:#a16207; padding:1px 7px; border-radius:10px; font-weight:800; text-transform:uppercase; margin-left:5px;">${escHtml(d.tipo)}</span>` : '';
    return `
      <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid var(--border); border-radius:12px; background:var(--bg);">
        <i class="ph-bold ${icone}" style="font-size:20px; color:${ehTotem ? '#0ea5e9' : 'var(--text-sub)'};"></i>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:800; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${apelido ? escHtml(apelido) + tipoBadge + ` <span style="font-weight:400; color:var(--text-sub); font-size:10.5px;">(${escHtml(d.model || d.browser || '')})</span>` : escHtml(d.model || d.browser || 'Dispositivo')}${ehTotem ? ' <span style="font-size:9px; background:#e0f2fe; color:#0369a1; padding:1px 7px; border-radius:10px; font-weight:800;">TOTEM</span>' : ''}</div>
          <div style="font-size:10.5px; color:var(--text-sub);">${escHtml(d.user || 'Visitante')} • ${escHtml(d.os || '')} • ${escHtml(d.tempoConectadoStr || '')}${d.serial ? ` • <span title="Serial do terminal">${escHtml(d.serial)}</span>` : ''}</div>
        </div>
        ${ehTotem
          ? `<button onclick="donoRotacionarTotem('${d.id}')" title="Alternar retrato/paisagem remotamente" style="padding:8px 10px; border:none; border-radius:10px; background:#6366f1; color:#fff; font-weight:800; font-size:11px; cursor:pointer; display:flex; align-items:center; gap:5px;"><i class="ph-bold ph-frame-corners"></i> Girar</button>
             <button onclick="donoLiberarTotem('${d.id}')" style="padding:8px 12px; border:none; border-radius:10px; background:#f59e0b; color:#fff; font-weight:800; font-size:11px; cursor:pointer; display:flex; align-items:center; gap:5px;"><i class="ph-bold ph-lock-open"></i> Liberar</button>`
          : `<button onclick="donoAtivarTotem('${d.id}')" ${featureAtiva ? '' : 'disabled style="opacity:0.5;"'} style="padding:8px 12px; border:none; border-radius:10px; background:#0ea5e9; color:#fff; font-weight:800; font-size:11px; cursor:pointer; display:flex; align-items:center; gap:5px;"><i class="ph-bold ph-monitor-play"></i> Virar Totem</button>`}
      </div>`;
  }).join('');

  if (!featureAtiva) {
    container.insertAdjacentHTML('beforeend',
      `<div id="aviso-upsell-totem" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.35); color:#ef4444; padding:10px 12px; border-radius:12px; font-size:11.5px; line-height:1.5; margin-top:4px;">
        <strong>Upsell não contratado:</strong> o módulo Totem de Autoatendimento não está ativo neste plano.
        Fale com o suporte Chef Cozinha para contratar.
      </div>`);
  }
}

window.donoAtivarTotem = function(deviceId) {
  socket.emit('dono_ativar_totem_dispositivo', { device_id: deviceId });
  showToast('Direcionando dispositivo ao Modo Totem...', 'ph-monitor-play');
  adicionarAoFeed('aviso', 'Você ativou o Modo Totem em um dispositivo.');
};

window.donoLiberarTotem = function(deviceId) {
  socket.emit('dono_liberar_totem_dispositivo', { device_id: deviceId });
  showToast('Liberando dispositivo do Modo Totem...', 'ph-lock-open');
  adicionarAoFeed('aviso', 'Você liberou um dispositivo do Modo Totem.');
};

// Rotação da tela do totem — exclusiva do controle remoto do dono
window.donoRotacionarTotem = function(deviceId) {
  socket.emit('dono_rotacionar_totem_dispositivo', { device_id: deviceId });
  showToast('Alternando orientação da tela do totem...', 'ph-frame-corners');
  adicionarAoFeed('aviso', 'Você alternou a orientação de um totem.');
};

// ─── Controle Remoto de Cada Colaborador ───────────────────────
let _cachedFuncionariosRemoto = [];

window.renderizarListaFuncionariosRemoto = function(funcs) {
  const container = document.getElementById('lista-controle-colaboradores');
  if (!container) return;

  const lista = Array.isArray(funcs) ? funcs : [];
  if (lista.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-sub); padding:20px; font-size:var(--fs-sm);">Nenhum colaborador cadastrado.</div>`;
    return;
  }

  container.innerHTML = lista.map(f => {
    const nome = escHtml(f.nome || 'Colaborador');
    const cargo = escHtml(f.cargo || 'Equipe');
    const tel = f.telefone ? escHtml(f.telefone) : '';
    const inicial = (f.nome || 'C').charAt(0).toUpperCase();

    return `
      <div class="colab-card colab-card-click" id="colab-card-${f.id}" role="button" tabindex="0"
           onclick="abrirModalFuncoesColaborador(${f.id})"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();abrirModalFuncoesColaborador(${f.id});}"
           title="Abrir funções remotas de ${nome}">
        <div class="colab-user">
          <div class="colab-avatar">
            ${inicial}
            <div class="colab-status-dot online" title="Status: Conectado / Ativo"></div>
          </div>
          <div class="colab-info">
            <strong>${nome}</strong>
            <span><i class="ph ph-identification-card"></i> ${cargo}${tel ? ` • ${tel}` : ''}</span>
          </div>
        </div>
        <i class="ph-bold ph-caret-right colab-chevron"></i>
      </div>
    `;
  }).join('');
};

// ─── Modal de Funções do Colaborador ───────────────────────────
window.abrirModalFuncoesColaborador = function(id) {
  const f = _cachedFuncionariosRemoto.find(x => String(x.id) === String(id));
  if (!f) return;
  const alvoId = document.getElementById('funcoes-colab-target-id');
  if (!alvoId) return;
  alvoId.value = f.id;
  document.getElementById('funcoes-colab-nome').textContent = f.nome || 'Colaborador';
  document.getElementById('funcoes-colab-cargo').textContent =
    `${f.cargo || 'Equipe'}${f.telefone ? ' • ' + f.telefone : ''}`;
  document.getElementById('funcoes-colab-avatar').innerHTML =
    `${escHtml((f.nome || 'C').charAt(0).toUpperCase())}<div class="colab-status-dot online" title="Status: Conectado / Ativo"></div>`;
  abrirModal('modal-funcoes-colaborador');
};

window.executarAcaoColaborador = function(acao) {
  const id = document.getElementById('funcoes-colab-target-id').value;
  const f = _cachedFuncionariosRemoto.find(x => String(x.id) === String(id));
  if (!f) return;
  const nome = f.nome || 'Colaborador';
  fecharModal('modal-funcoes-colaborador');

  switch (acao) {
    case 'mensagem':   abrirModalMsgColaborador(f.id, nome); break;
    case 'chamar':     chamarColaboradorVibrar(f.id, nome); break;
    case 'direcionar': abrirModalDirecionarApp(f.id, nome); break;
    case 'ponto':      baterPontoColaborador(f.id, nome); break;
    case 'pagamento':  abrirModalRhDonoComColab(f.id, 'pagamento'); break;
    case 'folga':      abrirModalRhDonoComColab(f.id, 'folga'); break;
    case 'logout':     desconectarSessaoColaborador(f.id, nome); break;
    case 'zap': {
      const tel = String(f.telefone || '').replace(/\D/g, '');
      if (tel.length >= 10) {
        window.open('https://wa.me/55' + tel, '_blank');
      } else {
        showToast('Sem telefone cadastrado — enviando alerta sonoro.', 'ph-speaker-high', 'info');
        chamarColaboradorVibrar(f.id, nome);
      }
      break;
    }
  }
};

// ─── Seletor de Layout do Painel (3 opções configuráveis) ──────
window.definirLayoutDono = function(layout) {
  const permitidos = ['compacto', 'confortavel', 'dashboard'];
  if (!permitidos.includes(layout)) layout = 'confortavel';
  try { localStorage.setItem('dono_layout', layout); } catch (e) { }
  document.body.setAttribute('data-layout-dono', layout);
  document.querySelectorAll('.ls-btn[data-ls-layout]').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-ls-layout') === layout);
  });
};

(function restaurarLayoutDono() {
  let salvo = 'confortavel';
  try { salvo = localStorage.getItem('dono_layout') || 'confortavel'; } catch (e) { }
  definirLayoutDono(salvo);
})();

window.carregarFuncionariosControleRemoto = async function() {
  const container = document.getElementById('lista-controle-colaboradores');
  if (!container) return;

  if (socket && typeof socket.emit === 'function') {
    socket.emit('get_funcionarios');
  }

  try {
    const res = await fetch('/api/funcionarios', { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) {
      const funcs = await res.json();
      if (Array.isArray(funcs)) {
        _cachedFuncionariosRemoto = funcs;
        renderizarListaFuncionariosRemoto(funcs);
        return;
      }
    }
  } catch (err) {
    console.warn('Erro ao buscar funcionarios via HTTP, aguardando socket...', err);
  }
};

window.abrirModalMsgColaborador = function(id, nome) {
  document.getElementById('msg-colab-target-id').value = id;
  document.getElementById('msg-colab-target-nome').value = nome;
  document.getElementById('msg-colab-texto').value = '';
  abrirModal('modal-msg-colaborador');
};

window.confirmarEnviarMsgColaborador = function() {
  const id = document.getElementById('msg-colab-target-id').value;
  const nome = document.getElementById('msg-colab-target-nome').value;
  const texto = document.getElementById('msg-colab-texto').value.trim();

  if (!texto) {
    showToast('Digite a mensagem a ser enviada.', 'ph-warning', 'error');
    return;
  }

  socket.emit('comando_colaborador_acao', {
    funcionario_id: id,
    funcionario_nome: nome,
    acao: 'mensagem_direta',
    payload: { texto: texto },
    solicitadoPor: loggedUser || 'Dono'
  });

  fecharModal('modal-msg-colaborador');
  showToast(`Mensagem enviada para o celular de ${nome}!`, 'ph-paper-plane-tilt');
  adicionarAoFeed('aviso', `Você enviou uma mensagem para ${nome}: "${texto}"`);
};

window.chamarColaboradorVibrar = function(id, nome) {
  socket.emit('comando_colaborador_acao', {
    funcionario_id: id,
    funcionario_nome: nome,
    acao: 'chamar_vibrar',
    payload: { mensagem: 'Chamada prioritária do Dono!' },
    solicitadoPor: loggedUser || 'Dono'
  });

  showToast(`🚨 Alerta vibratório disparado para ${nome}!`, 'ph-bell-ringing');
  adicionarAoFeed('aviso', `Você chamou a atenção de ${nome} com alerta e vibração.`);
};

window.abrirModalDirecionarApp = function(id, nome) {
  document.getElementById('direcionar-colab-target-id').value = id;
  document.getElementById('direcionar-colab-target-nome').value = nome;
  abrirModal('modal-direcionar-colaborador');
};

window.confirmarDirecionarApp = function(view) {
  const id = document.getElementById('direcionar-colab-target-id').value;
  const nome = document.getElementById('direcionar-colab-target-nome').value;

  socket.emit('comando_colaborador_acao', {
    funcionario_id: id,
    funcionario_nome: nome,
    acao: 'redirecionar_view',
    payload: { view: view },
    solicitadoPor: loggedUser || 'Dono'
  });

  fecharModal('modal-direcionar-colaborador');
  showToast(`Tela do app de ${nome} direcionada para ${view}!`, 'ph-device-mobile');
  adicionarAoFeed('aviso', `Você direcionou o app de ${nome} para: ${view}`);
};

window.baterPontoColaborador = async function(id, nome) {
  if (!confirm(`Deseja registrar batida de ponto agora para ${nome}?`)) return;

  try {
    const res = await fetch('/api/ponto/bater', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ funcionario_id: id, tipo: 'MANUAL_DONO', operador: loggedUser || 'Dono' })
    });
    const d = await res.json();
    if (d.success || d.ok) {
      showToast(`Ponto registrado com sucesso para ${nome}!`, 'ph-clock');
      adicionarAoFeed('rh', `Ponto manual registrado para ${nome}.`);
    } else {
      showToast(`Ponto registrado para ${nome}!`, 'ph-clock');
    }
  } catch(e) {
    showToast(`Ponto registrado para ${nome}!`, 'ph-clock');
  }
};

window.desconectarSessaoColaborador = function(id, nome) {
  if (!confirm(`Tem certeza que deseja encerrar remotamente a sessão de ${nome}? O app será desconectado.`)) return;

  socket.emit('comando_colaborador_acao', {
    funcionario_id: id,
    funcionario_nome: nome,
    acao: 'desconectar_sessao',
    payload: {},
    solicitadoPor: loggedUser || 'Dono'
  });

  showToast(`Sessão de ${nome} desconectada com sucesso!`, 'ph-sign-out');
  adicionarAoFeed('aviso', `Você encerrou a sessão remota de ${nome}.`);
};

window.abrirModalRhDonoComColab = async function(id, aba) {
  await window.carregarFuncionariosRhDono();
  const select = document.getElementById('select-rh-funcionario');
  if (select) select.value = id;
  alternarAbaRhDono(aba || 'pagamento');
  abrirModal('modal-rh-dono');
};

// ─── Caixa Abrir / Fechar — com modais ───────────────────────
function abrirCaixaFluxo() {
  const input = document.getElementById('fundo-troco-input');
  if (input) input.value = '100,00';
  abrirModal('modal-abrir-caixa');
  setTimeout(() => { if (input) { input.focus(); input.select(); } }, 100);
}

function fecharCaixaFluxo() {
  const input = document.getElementById('saldo-final-input');
  if (input) input.value = '0,00';
  abrirModal('modal-fechar-caixa');
  setTimeout(() => { if (input) { input.focus(); input.select(); } }, 100);
}

window.confirmarAbrirCaixa = function() {
  const input = document.getElementById('fundo-troco-input');
  let raw = input ? input.value : '100.00';
  if (!raw || !String(raw).trim()) raw = '0';
  const fundo = parseFloat(String(raw).replace(',', '.'));
  const fundoFinal = (isNaN(fundo) || fundo < 0) ? 0 : fundo;

  fecharModal('modal-abrir-caixa');
  setLoader(true);

  const op = loggedUser || 'Dono';

  if (typeof socket !== 'undefined' && socket && socket.connected) {
    socket.emit('abrir_caixa', {
      operador: op,
      fundo_troco: fundoFinal
    });
  }

  fetch('/api/caixa/abrir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ operador: op, fundo_troco: fundoFinal })
  })
  .then(r => r.json())
  .then(data => {
    setLoader(false);
    if (data && data.success) {
      showToast('✅ Caixa aberto com sucesso!', 'ph-lock-open', 'success');
      carregarMetricas();
    }
  })
  .catch(() => {
    setLoader(false);
    carregarMetricas();
  });
};

window.confirmarFecharCaixa = function() {
  const input = document.getElementById('saldo-final-input');
  let raw = input ? input.value : '0';
  if (!raw || !String(raw).trim()) raw = '0';
  const saldo = parseFloat(String(raw).replace(',', '.'));
  const saldoFinal = (isNaN(saldo) || saldo < 0) ? 0 : saldo;

  fecharModal('modal-fechar-caixa');
  setLoader(true);

  const op = loggedUser || 'Dono';

  if (typeof socket !== 'undefined' && socket && socket.connected) {
    socket.emit('fechar_caixa', {
      operador: op,
      saldo_final: saldoFinal,
      force: true
    });
  }

  fetch('/api/caixa/fechar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ operador: op, saldo_final: saldoFinal })
  })
  .then(r => r.json())
  .then(data => {
    setLoader(false);
    if (data && data.success) {
      showToast('🔒 Caixa fechado com sucesso!', 'ph-lock-key', 'success');
      carregarMetricas();
    }
  })
  .catch(() => {
    setLoader(false);
    carregarMetricas();
  });
};

// ─── RH: Gerenciar equipe ─────────────────────────────────────
window.carregarFuncionariosRhDono = async function() {
  const select = document.getElementById('select-rh-funcionario');
  if (!select) return;
  try {
    const res  = await fetch('/api/funcionarios', { headers: { 'Authorization': `Bearer ${token}` } });
    const funcs = await res.json();
    if (Array.isArray(funcs) && funcs.length > 0) {
      select.innerHTML = funcs.map(f =>
        `<option value="${f.id}">${escHtml(f.nome)} (${escHtml(f.cargo || 'Colaborador')})</option>`
      ).join('');
    } else {
      select.innerHTML = `<option value="">Nenhum funcionário encontrado</option>`;
    }
  } catch (e) {
    select.innerHTML = `<option value="">Erro ao carregar</option>`;
  }
};

window.abrirModalRhDono = function() {
  window.carregarFuncionariosRhDono();
  alternarAbaRhDono('pagamento');
  abrirModal('modal-rh-dono');
};

window.alternarAbaRhDono = function(aba) {
  ['pagamento', 'falta', 'folga'].forEach(a => {
    const btn = document.getElementById(`tab-rh-btn-${a}`);
    const panel = document.getElementById(`aba-rh-${a}`);
    if (btn) btn.className = `rh-tab ${a === aba ? 'active' : ''}`;
    if (panel) panel.style.display = a === aba ? 'block' : 'none';
  });
};

window.salvarPagamentoDono = function() {
  const funcId = document.getElementById('select-rh-funcionario').value;
  const val    = parseFloat(document.getElementById('rh-pagamento-valor').value);
  const forma  = document.getElementById('rh-pagamento-forma').value;
  const obs    = document.getElementById('rh-pagamento-obs').value;

  if (!funcId || isNaN(val) || val <= 0) {
    showToast('Selecione o colaborador e informe um valor válido.', 'ph-warning', 'error');
    return;
  }

  socket.emit('dono_registrar_pagamento', {
    funcionario_id: funcId, valor: val,
    forma_pagamento: forma, observacao: obs,
    operador: loggedUser || 'Dono'
  });

  fecharModal('modal-rh-dono');
  document.getElementById('rh-pagamento-valor').value = '';
  showToast('Pagamento enviado, aguarde confirmação...', 'ph-hourglass');
};

window.salvarAbonoFaltaDono = function() {
  const funcId    = document.getElementById('select-rh-funcionario').value;
  const dataFalta = document.getElementById('rh-falta-data').value;
  const justif    = document.getElementById('rh-falta-justificativa').value;
  const remun     = document.getElementById('rh-falta-remunerada').checked;

  if (!funcId || !dataFalta || !justif) {
    showToast('Preencha a data da falta e o motivo.', 'ph-warning', 'error');
    return;
  }

  socket.emit('dono_abonar_falta', {
    funcionario_id: funcId, data_falta: dataFalta,
    justificativa: justif, remunerado: remun,
    operador: loggedUser || 'Dono'
  });

  fecharModal('modal-rh-dono');
  document.getElementById('rh-falta-data').value = '';
  document.getElementById('rh-falta-justificativa').value = '';
  showToast('Falta enviada, aguarde confirmação...', 'ph-hourglass');
};

window.salvarFolgaDono = function() {
  const funcId = document.getElementById('select-rh-funcionario').value;
  const ini    = document.getElementById('rh-folga-inicio').value;
  const fim    = document.getElementById('rh-folga-fim').value;
  const tipo   = document.getElementById('rh-folga-tipo').value;
  const obs    = document.getElementById('rh-folga-obs').value;

  if (!funcId || !ini) {
    showToast('Selecione o colaborador e a data da folga.', 'ph-warning', 'error');
    return;
  }

  socket.emit('dono_conceder_folga', {
    funcionario_id: funcId, data_inicio: ini,
    data_fim: fim || ini, tipo_folga: tipo,
    observacao: obs, operador: loggedUser || 'Dono'
  });

  fecharModal('modal-rh-dono');
  document.getElementById('rh-folga-inicio').value = '';
  showToast('Folga enviada, aguarde confirmação...', 'ph-hourglass');
};

// ─── Meta de vendas ───────────────────────────────────────────
window.salvarMeta = function() {
  const val = parseFloat(metaInput.value);
  if (isNaN(val) || val <= 0) {
    showToast('Insira um valor de meta válido.', 'ph-warning', 'error');
    return;
  }
  metaVendas = val;
  localStorage.setItem('meta_dono_vendas', val);
  carregarMetricas();
  showToast('Meta diária salva com sucesso!', 'ph-check-circle', 'success');
};

// ─── Enviar aviso para equipe ─────────────────────────────────
window.notificarEquipe = function() {
  const text = notifInput.value.trim();
  if (!text) {
    showToast('Digite o aviso antes de enviar.', 'ph-warning', 'error');
    return;
  }
  socket.emit('enviar_notificacao_equipe', { texto: text });
  notifInput.value = '';
  showToast('Aviso enviado para a equipe!', 'ph-paper-plane', 'success');
  adicionarAoFeed('aviso', `Você enviou: "${text}"`);
};

// ─── Feed de Atividade ────────────────────────────────────────
function adicionarAoFeed(tipo, texto) {
  const now = chefFormatTime(new Date().toISOString());

  let icon = 'ph-info', colorClass = 'blue';
  if (tipo === 'venda')  { icon = 'ph-currency-dollar'; colorClass = 'green'; }
  else if (tipo === 'aviso') { icon = 'ph-megaphone';   colorClass = 'purple'; }
  else if (tipo === 'ponto') { icon = 'ph-user-check';  colorClass = 'blue'; }

  if (activityFeed && activityFeed.innerText.includes('Aguardando atividades')) {
    activityFeed.innerHTML = '';
  }

  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `
    <div class="feed-icon ${colorClass}">
      <i class="ph-fill ${icon}"></i>
    </div>
    <div>
      <div class="feed-text">${texto}</div>
      <div class="feed-time">${now}</div>
    </div>
  `;

  if (activityFeed) activityFeed.prepend(item);
  while (activityFeed && activityFeed.children.length > 15) activityFeed.lastChild.remove();
}

// ─── Ranking accordion ───────────────────────────────────────
window.toggleRanking = function() {
  const body    = document.getElementById('ranking-body');
  const chevron = document.getElementById('ranking-chevron');
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  if (chevron) chevron.classList.toggle('open', isOpen);
};

// ─── Logout ───────────────────────────────────────────────────
window.efetuarLogout = function() {
  if (confirm('Deseja sair do painel do dono?')) {
    localStorage.removeItem('chef_token');
    localStorage.removeItem('chef_credentials');
    window.location.href = '/login.html';
  }
};

// ─── Socket listeners ────────────────────────────────────────
socket.on('connect', () => {
  adicionarAoFeed('feed', 'Painel do Dono conectado ao servidor');
});

socket.on('estado_caixa', () => carregarMetricas());
socket.on('caixa_aberto_sucesso', () => {
  showToast('✅ Caixa aberto com sucesso!', 'ph-lock-open', 'success');
  carregarMetricas();
});
socket.on('erro_caixa', (msg) => {
  setLoader(false);
  showToast(`Erro ao abrir caixa: ${msg}`, 'ph-warning', 'error');
});
socket.on('erro_fechar_caixa', (data) => {
  setLoader(false);
  showToast(`Erro ao fechar caixa: ${data && data.msg || data}`, 'ph-warning', 'error');
});
socket.on('atualizacao_caixa', () => {
  if (window.periodoAtual === 'hoje') carregarMetricas();
});
socket.on('financeiro_atualizado', () => {
  if (window.periodoAtual === 'hoje') carregarMetricas();
});
socket.on('pedido_novo', (pedido) => {
  carregarMetricas();
  adicionarAoFeed('venda', `Novo pedido de ${pedido.userName} (${pedido.localName}): ${pedido.productName}`);
});
socket.on('pedido_adicionado', (pedido) => {
  carregarMetricas();
  adicionarAoFeed('venda', `${pedido.quantity}x ${pedido.productName} na ${pedido.localName}`);
});
socket.on('status_atualizado', (pedido) => {
  carregarMetricas();
  adicionarAoFeed('venda', `${pedido.productName} (${pedido.localName}) → ${pedido.status}`);
});
socket.on('rh_update', () => {
  carregarMetricas();
  carregarFuncionariosControleRemoto();
  adicionarAoFeed('ponto', 'Informações de colaboradores atualizadas!');
});
socket.on('funcionarios_atualizados', (funcs) => {
  if (Array.isArray(funcs)) {
    _cachedFuncionariosRemoto = funcs;
    renderizarListaFuncionariosRemoto(funcs);
  }
});
socket.on('alerta_desconto_financeiro', (data) => {
  carregarMetricas();
  if (data && data.valor) {
    adicionarAoFeed('venda', `⚠️ Desconto R$${parseFloat(data.valor).toFixed(2)} por ${data.operador} em ${data.localName}`);
  }
});

// Confirmações de ações do dono
socket.on('dono_acao_concluida', (data) => {
  showToast(data.mensagem || 'Ação registrada com sucesso!', 'ph-check-circle', 'success');
  carregarMetricas();
  adicionarAoFeed('aviso', data.mensagem || 'Ação registrada com sucesso!');
});
socket.on('dono_acao_erro', (data) => {
  showToast(data.mensagem || 'Erro ao executar ação.', 'ph-warning', 'error');
});

// ─── Alta Demanda: "Uau, seu negócio está bombando!" ─────────────
let _modalDemandaAberto = false;

function mostrarCelebracaoDemanda(data) {
  if (_modalDemandaAberto) return;
  _modalDemandaAberto = true;
  const ppm = (data && data.pedidos_por_minuto) || '';
  const overlay = document.createElement('div');
  overlay.id = 'modal-demanda-alta';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,10,20,0.75);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem;';
  overlay.innerHTML = `
    <div style="background:linear-gradient(160deg,#1e1b4b,#312e81);border:1px solid rgba(250,204,21,0.4);border-radius:24px;max-width:420px;width:100%;padding:2rem;text-align:center;color:#fff;font-family:inherit;box-shadow:0 25px 80px rgba(0,0,0,0.6);">
      <div style="font-size:3.5rem;line-height:1;margin-bottom:0.5rem;">🎉</div>
      <h2 style="font-size:1.5rem;font-weight:800;margin:0 0 0.35rem;background:linear-gradient(90deg,#facc15,#fb923c);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">Uau, seu negócio está bombando!</h2>
      <p style="font-size:0.85rem;color:#c7d2fe;margin:0 0 1.25rem;">
        ${ppm ? `Detectamos <strong style="color:#fff;">${ppm} pedidos por minuto</strong> por aqui. ` : ''}Você está tendo algum evento específico hoje?
      </p>
      <div style="display:flex;flex-direction:column;gap:0.6rem;">
        <button id="btn-evento-sim" style="background:linear-gradient(90deg,#f59e0b,#f97316);border:none;border-radius:12px;padding:0.8rem;color:#fff;font-weight:700;font-size:0.9rem;cursor:pointer;">🎉 Sim, é um evento!</button>
        <input id="input-evento-desc" type="text" placeholder="Ex.: Festa, show, happy hour..." maxlength="200"
          style="display:none;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:0.65rem 0.8rem;color:#fff;font-size:0.85rem;">
        <input id="input-evento-horas" type="number" min="1" max="72" value="4" placeholder="Duração (horas)"
          style="display:none;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:0.65rem 0.8rem;color:#fff;font-size:0.85rem;">
        <button id="btn-evento-confirmar" style="display:none;background:var(--primary,#6366f1);border:none;border-radius:12px;padding:0.8rem;color:#fff;font-weight:700;font-size:0.9rem;cursor:pointer;">Confirmar evento</button>
        <button id="btn-evento-nao" style="background:transparent;border:1px solid rgba(255,255,255,0.25);border-radius:12px;padding:0.7rem;color:#c7d2fe;font-size:0.85rem;cursor:pointer;">Não, só movimento mesmo 😄</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const inputDesc = overlay.querySelector('#input-evento-desc');
  const inputHoras = overlay.querySelector('#input-evento-horas');
  const btnConfirmar = overlay.querySelector('#btn-evento-confirmar');
  const btnSim = overlay.querySelector('#btn-evento-sim');
  const btnNao = overlay.querySelector('#btn-evento-nao');

  btnSim.addEventListener('click', () => {
    btnSim.style.display = 'none';
    inputDesc.style.display = 'block';
    inputHoras.style.display = 'block';
    btnConfirmar.style.display = 'block';
    inputDesc.focus();
  });

  btnConfirmar.addEventListener('click', async () => {
    const descricao = inputDesc.value.trim();
    const duracao_horas = parseFloat(inputHoras.value) || 4;
    btnConfirmar.disabled = true;
    try {
      await fetch('/api/evento-pico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('chef_token') || '') },
        body: JSON.stringify({ descricao, duracao_horas })
      });
      adicionarAoFeed('aviso', '🎉 Evento declarado! Sistema otimizado para o pico.');
    } catch (e) { }
    fechar();
  });

  btnNao.addEventListener('click', () => fechar());
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) fechar(); });

  function fechar() {
    _modalDemandaAberto = false;
    overlay.remove();
  }
}

socket.on('demanda_alta', (data) => {
  mostrarCelebracaoDemanda(data);
});

// ─── Inicialização ────────────────────────────────────────────
window.onload = () => {
  startClock();
  carregarMetricas();
  carregarFuncionalidades();
  carregarFuncionariosControleRemoto();
};
startClock();
carregarMetricas();
carregarFuncionariosControleRemoto();

// ─── Funcionalidades (Feature Toggles) ────────────────────────
const FEATURE_DEFS = [
  { key: 'feature_venda_sem_estoque',      label: 'Vender sem Estoque',       desc: 'Vender com estoque zerado',  emoji: '📦', icon: 'ph-bold ph-package',         color: '#ef4444' },
  { key: 'feature_toggle_produto_rapido',  label: 'Toggle Produto Rápido',   desc: 'Ativar/desativar na lista',  emoji: '⚡', icon: 'ph-bold ph-toggle-right',    color: '#3b82f6' },
  { key: 'feature_alterar_valores_pdv',    label: 'Alterar Valores PDV',     desc: 'Mudar preço no carrinho',    emoji: '💲', icon: 'ph-bold ph-currency-dollar', color: '#f59e0b' },
  { key: 'feature_clientes_ativos',        label: 'Clientes Ativos Hoje',    desc: 'Ranking de clientes',        emoji: '👥', icon: 'ph-bold ph-users-three',     color: '#8b5cf6' },
  { key: 'feature_produto_mais_vendido',   label: 'Mais Vendido',            desc: 'Produto campeão do dia',     emoji: '🏆', icon: 'ph-bold ph-trophy',          color: '#10b981' },
  { key: 'feature_maior_lucro',            label: 'Maior Lucro',             desc: 'Produto mais lucrativo',     emoji: '📈', icon: 'ph-bold ph-chart-line-up',   color: '#06b6d4' },
  { key: 'feature_impressao_digital',      label: 'Impressão Digital',       desc: 'Pedidos na fila digital',    emoji: '🖥️', icon: 'ph-bold ph-monitor',         color: '#22c55e' },
  { key: 'feature_impressao_termica',      label: 'Impressão Térmica',       desc: 'Imprimir na termica',        emoji: '🖨️', icon: 'ph-bold ph-printer',         color: '#ec4899' },
  { key: 'feature_produtos_lote',          label: 'Produtos em Lote',        desc: 'Gestão em massa',            emoji: '📚', icon: 'ph-bold ph-stack',           color: '#a855f7' }
];

async function carregarFuncionalidades() {
  try {
    const res = await fetch('/api/config', { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) return;
    const cfgs = await res.json();
    const grid = document.getElementById('features-grid-dono');
    if (!grid) return;

    grid.innerHTML = FEATURE_DEFS.map(f => {
      const val = cfgs[f.key] === 'true' || cfgs[f.key] === true;
      return `
        <div class="feature-card ${val ? 'active' : ''}" id="fc-${f.key}">
          <div class="feature-icon" style="background:${f.color}18; display:flex; align-items:center; justify-content:center; font-size:22px; width:44px; height:44px; border-radius:12px; flex-shrink:0;">
            <span>${f.emoji || '✨'}</span>
          </div>
          <div class="feature-info">
            <div class="feature-name">${f.label}</div>
            <div class="feature-desc">${f.desc}</div>
          </div>
          <label class="feature-toggle">
            <input type="checkbox" ${val ? 'checked' : ''} onchange="window.toggleFeatureDono('${f.key}', this.checked)">
            <span class="track"></span>
            <span class="thumb"></span>
          </label>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('Erro ao carregar funcionalidades:', e);
  }
}

window.toggleFeatureDono = async function(key, value) {
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: String(value) })
    });
    const card = document.getElementById('fc-' + key);
    if (card) card.classList.toggle('active', value);
    showToast(`${value ? 'Funcionalidade ativada' : 'Funcionalidade desativada'}`, 'ph-check-circle', 'success');
  } catch (e) {
    showToast('Erro ao salvar funcionalidade', 'ph-warning', 'error');
  }
};


// ── Reportar Problema → Suporte ─────────────────────────────
let _relatoPrioridade = 'media';

window.abrirModalRelato = function() {
  var m = document.getElementById('modal-relato');
  if (!m) return;
  m.style.display = 'flex';
  var fb = document.getElementById('relato-feedback');
  if (fb) fb.style.display = 'none';
};

window.fecharModalRelato = function() {
  var m = document.getElementById('modal-relato');
  if (m) m.style.display = 'none';
};

window.selecionarPrioridade = function(pri, btn) {
  _relatoPrioridade = pri;
  document.querySelectorAll('.relato-pri').forEach(function(b) { b.classList.remove('ativa'); });
  if (btn) btn.classList.add('ativa');
};

window.enviarRelato = async function() {
  var titulo = document.getElementById('relato-titulo');
  var descricao = document.getElementById('relato-descricao');
  var categoria = document.getElementById('relato-categoria');
  var feedback = document.getElementById('relato-feedback');
  var botao = document.getElementById('btn-enviar-relato');
  if (!titulo || !descricao || !botao) return;

  var mostrarFeedback = function(msg, tipo) {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.className = 'relato-feedback ' + tipo;
    feedback.style.display = 'block';
  };

  if (!titulo.value.trim() || !descricao.value.trim()) {
    mostrarFeedback('Preencha o título e a descrição do problema.', 'erro');
    return;
  }

  botao.disabled = true;
  try {
    const res = await fetch('/api/dono/reportar-problema', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: titulo.value.trim(), descricao: descricao.value.trim(), categoria: categoria ? categoria.value : 'outro', prioridade: _relatoPrioridade })
    });
    const data = await res.json();
    if (data && data.ok) {
      mostrarFeedback(data.mensagem || 'Relato enviado com sucesso!', 'sucesso');
      titulo.value = '';
      descricao.value = '';
      setTimeout(function() { fecharModalRelato(); }, 2200);
      showToast('Relato enviado ao suporte', 'ph-lifebuoy', 'success');
    } else {
      mostrarFeedback((data && data.erro) || 'Não foi possível enviar o relato.', 'erro');
    }
  } catch (e) {
    mostrarFeedback('Erro de conexão. Tente novamente.', 'erro');
  }
  botao.disabled = false;
};

// ═════════════════════════════════════════════════════════════════════
// 🎟️ GESTÃO DE CUPONS QR DE PROMOÇÃO & DESEMPENHO (PAINEL DO DONO)
// ═════════════════════════════════════════════════════════════════════
let _cuponsDonoCache = [];
let _cupomFlyerAtual = null;

// Helper: Gera HTML do QR Code (usando qrcode-generator ou SVG/Canvas)
function gerarQrCodeHtml(text, size = 160) {
  try {
    if (typeof window.qrcode === 'function') {
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createImgTag(Math.max(3, Math.floor(size / 33)), 0);
    }
  } catch (e) {
    console.warn('[QR Helper] Fallback gerando QR:', e);
  }
  // Fallback seguro usando API de imagem rápida
  const encoded = encodeURIComponent(text);
  return `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&margin=2" alt="QR Code" style="width:${size}px; height:${size}px; border-radius:8px;" />`;
}

// 1. Carregar lista de cupons e métricas
window.carregarCuponsDono = async function() {
  const grid = document.getElementById('grid-cupons-dono');
  if (!grid) return;

  try {
    const res = await fetch('/api/cupons', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const list = await res.json();
    _cuponsDonoCache = Array.isArray(list) ? list : (list.list || []);

    // Atualizar KPIs rápidos
    let totalUsos = 0;
    let ativosCount = 0;

    _cuponsDonoCache.forEach(c => {
      const usos = parseInt(c.total_usos, 10) || 0;
      totalUsos += usos;
      const limite = parseInt(c.limite_usos, 10) || 0;
      const esgotado = (limite > 0 && usos >= limite);
      let expirado = false;
      if (c.validade) {
        const valDate = new Date(c.validade + 'T23:59:59');
        if (new Date() > valDate) expirado = true;
      }
      if (!esgotado && !expirado) ativosCount++;
    });

    const elAtivos = document.getElementById('kpi-cupons-ativos');
    const elUsos = document.getElementById('kpi-cupons-usos');
    const elVendas = document.getElementById('kpi-cupons-vendas');

    if (elAtivos) elAtivos.innerText = ativosCount;
    if (elUsos) elUsos.innerText = totalUsos;
    if (elVendas) elVendas.innerText = formatCurrency(totalUsos * 45); // Estimativa de giro médio

    if (_cuponsDonoCache.length === 0) {
      grid.innerHTML = `
        <div style="background:var(--card); border:1.5px dashed var(--border); border-radius:14px; padding:28px 16px; text-align:center;">
          <div style="font-size:32px; margin-bottom:8px;">🎟️</div>
          <strong style="display:block; font-size:var(--fs-md); margin-bottom:4px;">Nenhum cupom promocional ativo</strong>
          <span style="display:block; font-size:var(--fs-xs); color:var(--text-sub); margin-bottom:16px;">Crie seu primeiro cupom QR para atrair mais clientes e aumentar suas vendas!</span>
          <button class="btn-primary" onclick="abrirModalCriarCupom()" style="margin:0 auto; padding:10px 18px; font-size:var(--fs-sm);">
            <i class="ph-bold ph-plus"></i> Criar Primeiro Cupom
          </button>
        </div>`;
      return;
    }

    grid.innerHTML = _cuponsDonoCache.map(c => {
      const usos = parseInt(c.total_usos, 10) || 0;
      const limite = parseInt(c.limite_usos, 10) || 0;
      const esgotado = (limite > 0 && usos >= limite);
      let expirado = false;
      if (c.validade) {
        const valDate = new Date(c.validade + 'T23:59:59');
        if (new Date() > valDate) expirado = true;
      }

      let statusBadge = `<span style="background:rgba(16,185,129,0.15); color:var(--green); padding:4px 8px; border-radius:8px; font-size:11px; font-weight:800;">ATIVO</span>`;
      if (esgotado) statusBadge = `<span style="background:rgba(239,68,68,0.15); color:#ef4444; padding:4px 8px; border-radius:8px; font-size:11px; font-weight:800;">ESGOTADO</span>`;
      else if (expirado) statusBadge = `<span style="background:rgba(245,158,11,0.15); color:#f59e0b; padding:4px 8px; border-radius:8px; font-size:11px; font-weight:800;">EXPIRADO</span>`;

      const valorTxt = (c.valor_tipo === 'desconto_fixo')
        ? `R$ ${parseFloat(c.valor || 0).toFixed(2).replace('.', ',')} OFF`
        : `${c.valor || 0}% OFF`;

      const qrPayload = `RESGATE:${c.codigo}`;
      const qrThumb = gerarQrCodeHtml(qrPayload, 64);
      const limiteTxt = limite > 0 ? `${usos}/${limite} resgates` : `${usos} resgates (Ilimitado)`;
      const pctUso = limite > 0 ? Math.min(100, Math.round((usos / limite) * 100)) : (usos > 0 ? 100 : 0);

      return `
        <div class="colab-card" style="padding:16px; display:flex; flex-direction:column; gap:12px; border:1px solid var(--border); border-radius:14px; background:var(--card);">
          <div style="display:flex; gap:12px; align-items:center;">
            <!-- Miniatura QR -->
            <div onclick='window.abrirModalExportarQr(${JSON.stringify(c).replace(/'/g, "&apos;")})' style="cursor:pointer; background:#ffffff; padding:6px; border-radius:10px; border:1px solid #e2e8f0; display:flex; align-items:center; justify-content:center; flex-shrink:0;" title="Clique para ampliar/imprimir QR Code">
              ${qrThumb}
            </div>

            <!-- Dados do Cupom -->
            <div style="flex:1; min-width:0;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:6px;">
                <span style="font-weight:900; font-size:var(--fs-md); color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(c.titulo || c.codigo)}</span>
                ${statusBadge}
              </div>

              <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                <span style="background:rgba(252,75,21,0.12); color:var(--primary); font-weight:900; font-size:12.5px; padding:2px 8px; border-radius:6px; letter-spacing:0.5px;">${escHtml(c.codigo)}</span>
                <span style="font-weight:800; font-size:12px; color:var(--green);">${valorTxt}</span>
              </div>

              <!-- Barra de Progresso de Usos -->
              <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-sub); margin-bottom:4px;">
                <span>${limiteTxt}</span>
                ${c.validade ? `<span>Val: ${c.validade.split('-').reverse().join('/')}</span>` : `<span>Sem validade</span>`}
              </div>
              <div style="width:100%; height:6px; background:var(--border); border-radius:10px; overflow:hidden;">
                <div style="width:${pctUso}%; height:100%; background:${esgotado ? '#ef4444' : 'var(--primary)'}; border-radius:10px; transition:width 0.3s ease;"></div>
              </div>
            </div>
          </div>

          <!-- Botões de Ação -->
          <div style="display:grid; grid-template-columns: 2fr 2fr 1fr; gap:8px; border-top:1px solid var(--border); padding-top:10px; margin-top:2px;">
            <button class="colab-action-btn" onclick='window.abrirModalExportarQr(${JSON.stringify(c).replace(/'/g, "&apos;")})' style="padding:10px 8px; flex-direction:row; gap:6px; justify-content:center;">
              <i class="ph-bold ph-printer" style="font-size:16px; color:var(--primary);"></i>
              <span style="font-weight:800; font-size:11.5px;">Plaquinha / QR</span>
            </button>
            <button class="colab-action-btn" onclick="window.abrirModalDesempenhoCupom('${escHtml(c.codigo)}')" style="padding:10px 8px; flex-direction:row; gap:6px; justify-content:center;">
              <i class="ph-bold ph-chart-line-up" style="font-size:16px; color:var(--blue);"></i>
              <span style="font-weight:800; font-size:11.5px;">Desempenho</span>
            </button>
            <button class="colab-action-btn" onclick="window.excluirCupomDono('${escHtml(c.codigo)}')" style="padding:10px 8px; flex-direction:row; gap:6px; justify-content:center; color:#ef4444;" title="Excluir cupom">
              <i class="ph-bold ph-trash" style="font-size:16px; color:#ef4444;"></i>
            </button>
          </div>
        </div>`;
    }).join('');

  } catch (e) {
    console.error('Erro ao carregar cupons:', e);
    grid.innerHTML = `<div style="text-align:center; color:#ef4444; padding:16px;">Erro ao carregar cupons.</div>`;
  }
};

// 2. Modal Criar Cupom
window.abrirModalCriarCupom = function() {
  document.getElementById('cupom-codigo').value = '';
  document.getElementById('cupom-titulo').value = '';
  document.getElementById('cupom-valor').value = '';
  document.getElementById('cupom-limite').value = '0';
  document.getElementById('cupom-validade').value = '';
  window.gerarCodigoCupomRandom();
  abrirModal('modal-criar-cupom');
};

window.gerarCodigoCupomRandom = function() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PROMO';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  document.getElementById('cupom-codigo').value = code;
};

window.salvarNovoCupom = async function() {
  const codigo = document.getElementById('cupom-codigo').value.trim().toUpperCase();
  const titulo = document.getElementById('cupom-titulo').value.trim();
  const tipo = document.getElementById('cupom-tipo').value;
  const valor = parseFloat(document.getElementById('cupom-valor').value);
  const limite = parseInt(document.getElementById('cupom-limite').value, 10) || 0;
  const validade = document.getElementById('cupom-validade').value || null;

  if (!codigo) {
    showToast('Informe o código do cupom.', 'ph-warning', 'error');
    return;
  }
  if (isNaN(valor) || valor <= 0) {
    showToast('Informe o valor do desconto válido.', 'ph-warning', 'error');
    return;
  }

  try {
    const res = await fetch('/api/cupons', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        codigo,
        titulo: titulo || codigo,
        valor_tipo: tipo,
        valor: valor,
        limite_usos: limite,
        validade: validade
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      fecharModal('modal-criar-cupom');
      showToast(`🎟️ Cupom ${codigo} criado com sucesso!`, 'ph-check-circle', 'success');
      window.carregarCuponsDono();
    } else {
      showToast(data.error || 'Erro ao criar cupom.', 'ph-warning', 'error');
    }
  } catch (e) {
    showToast('Erro de conexão ao criar cupom.', 'ph-warning', 'error');
  }
};

// 3. Modal Exportar / Imprimir Plaquinha de Mesa QR
window.abrirModalExportarQr = function(cupom) {
  _cupomFlyerAtual = cupom;
  if (!cupom) return;

  const restNome = localStorage.getItem('restaurante_nome') || 'CHEF RESTAURANTE';
  const elRest = document.getElementById('qr-flyer-restaurante');
  const elTitulo = document.getElementById('qr-flyer-titulo');
  const elBadge = document.getElementById('qr-flyer-badge');
  const elRegras = document.getElementById('qr-flyer-regras');
  const elWrapper = document.getElementById('qr-flyer-canvas-wrapper');

  if (elRest) elRest.innerText = restNome.toUpperCase();
  if (elTitulo) elTitulo.innerText = (cupom.titulo || 'PROMOÇÃO ESPECIAL').toUpperCase();

  const valorTxt = (cupom.valor_tipo === 'desconto_fixo')
    ? `R$ ${parseFloat(cupom.valor || 0).toFixed(2).replace('.', ',')} OFF`
    : `${cupom.valor || 0}% OFF`;

  if (elBadge) elBadge.innerText = `${cupom.codigo} • ${valorTxt}`;
  if (elRegras) {
    const valTxt = cupom.validade ? `Válido até ${cupom.validade.split('-').reverse().join('/')}` : 'Por tempo limitado';
    elRegras.innerText = `Aponte a câmera do seu celular no QR Code • ${valTxt}`;
  }

  // Gerar QR grande de alta definição
  const qrPayload = `RESGATE:${cupom.codigo}`;
  if (elWrapper) {
    elWrapper.innerHTML = gerarQrCodeHtml(qrPayload, 200);
  }

  abrirModal('modal-exportar-qr');
};

// 4. Imprimir Plaquinha (Display de Mesa)
window.imprimirFlyerMesa = function() {
  const flyer = document.getElementById('flyer-impressao-mesa');
  if (!flyer) return;

  const printWindow = window.open('', '_blank', 'width=600,height=700');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Plaquinha QR - ${_cupomFlyerAtual ? _cupomFlyerAtual.codigo : 'Cupom'}</title>
      <style>
        body { margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; background: #fff; }
        .flyer-box { border: 2.5px solid #0f172a; border-radius: 20px; padding: 32px 24px; text-align: center; max-width: 380px; width: 100%; box-sizing: border-box; }
        h1 { margin: 0 0 6px 0; font-size: 24px; font-weight: 900; }
        .sub { font-size: 14px; color: #475569; margin-bottom: 20px; }
        .qr-box { padding: 16px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 16px; display: inline-block; margin-bottom: 20px; }
        .code-badge { background: #0f172a; color: #fff; padding: 8px 24px; border-radius: 30px; font-size: 20px; font-weight: 900; letter-spacing: 2px; display: inline-block; margin-bottom: 12px; }
        .rules { font-size: 11px; color: #94a3b8; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="flyer-box">
        <div style="font-size:12px; font-weight:900; letter-spacing:2px; color:#fc4b15; margin-bottom:6px;">${(localStorage.getItem('restaurante_nome') || 'CHEF RESTAURANTE').toUpperCase()}</div>
        <h1>${(_cupomFlyerAtual ? _cupomFlyerAtual.titulo || _cupomFlyerAtual.codigo : 'PROMOÇÃO').toUpperCase()}</h1>
        <div class="sub">Aponte a câmera do seu celular para ganhar seu desconto exclusivo!</div>
        <div class="qr-box">
          ${document.getElementById('qr-flyer-canvas-wrapper').innerHTML}
        </div>
        <div>
          <div class="code-badge">${_cupomFlyerAtual ? _cupomFlyerAtual.codigo : 'PROMO'}</div>
        </div>
        <div class="rules">Apresente ao garçom ou use no cardápio digital • ${_cupomFlyerAtual && _cupomFlyerAtual.validade ? 'Válido até ' + _cupomFlyerAtual.validade.split('-').reverse().join('/') : 'Promoção por tempo limitado'}</div>
      </div>
      <script>
        window.onload = function() { window.print(); window.close(); };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

// 5. Baixar Imagem PNG do QR Code
window.baixarQrPng = function() {
  if (!_cupomFlyerAtual) return;
  const qrImg = document.querySelector('#qr-flyer-canvas-wrapper img');
  if (qrImg && qrImg.src) {
    const a = document.createElement('a');
    a.href = qrImg.src;
    a.download = `qr-cupom-${_cupomFlyerAtual.codigo}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('📥 Imagem do QR Code baixada com sucesso!', 'ph-check-circle', 'success');
  } else {
    showToast('Não foi possível gerar a imagem PNG.', 'ph-warning', 'error');
  }
};

// 6. Compartilhar no WhatsApp
window.compartilharQrWhatsApp = function() {
  if (!_cupomFlyerAtual) return;
  const restNome = localStorage.getItem('restaurante_nome') || 'nosso restaurante';
  const valorTxt = (_cupomFlyerAtual.valor_tipo === 'desconto_fixo')
    ? `R$ ${parseFloat(_cupomFlyerAtual.valor || 0).toFixed(2).replace('.', ',')} de desconto`
    : `${_cupomFlyerAtual.valor || 0}% de desconto`;

  const msg = `🎉 *PROMOÇÃO EXCLUSIVA - ${restNome.toUpperCase()}* 🎉\n\n` +
    `Olá! Preparamos um presente especial para você:\n` +
    `🎁 *${_cupomFlyerAtual.titulo || 'Super Desconto'}*\n` +
    `💰 Ganhe *${valorTxt}* no seu pedido!\n\n` +
    `🎟️ Use o código do cupom: *${_cupomFlyerAtual.codigo}*\n` +
    `👉 Ou escaneie o QR Code na nossa mesa quando nos visitar!\n\n` +
    `Te esperamos! 😋`;

  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
};

// 7. Modal Desempenho do Cupom
window.abrirModalDesempenhoCupom = async function(codigo) {
  const elTitulo = document.getElementById('desempenho-cupom-titulo');
  const elCodigo = document.getElementById('desempenho-cupom-codigo');
  const elBadge = document.getElementById('desempenho-cupom-badge');
  const elTotalUsos = document.getElementById('desempenho-total-usos');
  const elUltimo = document.getElementById('desempenho-ultimo-resgate');
  const listaHistorico = document.getElementById('lista-historico-usos-cupom');

  if (elTitulo) elTitulo.innerText = 'Carregando...';
  if (elCodigo) elCodigo.innerText = codigo;
  if (listaHistorico) listaHistorico.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-sub);">Buscando histórico...</div>`;

  abrirModal('modal-desempenho-cupom');

  try {
    const res = await fetch(`/api/cupons/${codigo}/desempenho`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const cupom = data.cupom;
    const usos = data.usos || [];

    if (elTitulo) elTitulo.innerText = cupom.titulo || cupom.codigo;
    if (elCodigo) elCodigo.innerText = `CÓDIGO: ${cupom.codigo}`;

    const valorTxt = (cupom.valor_tipo === 'desconto_fixo')
      ? `R$ ${parseFloat(cupom.valor || 0).toFixed(2).replace('.', ',')} OFF`
      : `${cupom.valor || 0}% OFF`;
    if (elBadge) elBadge.innerText = valorTxt;

    if (elTotalUsos) elTotalUsos.innerText = data.total_usos || 0;
    if (elUltimo) {
      elUltimo.innerText = usos.length > 0 ? new Date(usos[0].data_uso).toLocaleString('pt-BR') : 'Nenhum uso';
    }

    if (usos.length === 0) {
      listaHistorico.innerHTML = `<div style="text-align:center; color:var(--text-sub); padding:16px; font-size:var(--fs-sm);">Nenhum cliente resgatou este cupom ainda.</div>`;
    } else {
      listaHistorico.innerHTML = usos.map(u => `
        <div style="background:var(--bg); padding:12px; border-radius:10px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
          <div>
            <strong style="color:var(--text); display:block;">${escHtml(u.cliente_nome || 'Cliente na Mesa')} (${escHtml(u.mesa || 'Mesa')})</strong>
            <span style="color:var(--text-sub); font-size:11px;">Atendido por: ${escHtml(u.garcom || 'Garçom')}</span>
          </div>
          <div style="text-align:right;">
            <span style="color:var(--green); font-weight:800; display:block;">Resgatado</span>
            <span style="color:var(--text-sub); font-size:10px;">${chefFormatDate(u.data_uso)}</span>
          </div>
        </div>
      `).join('');
    }

  } catch (e) {
    if (listaHistorico) listaHistorico.innerHTML = `<div style="text-align:center; color:#ef4444; padding:16px;">Erro ao carregar desempenho.</div>`;
  }
};

// 8. Excluir Cupom
window.excluirCupomDono = async function(codigo) {
  if (!confirm(`Tem certeza que deseja excluir o cupom ${codigo}?`)) return;

  try {
    const res = await fetch(`/api/cupons/${codigo}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      showToast(`🗑️ Cupom ${codigo} excluído.`, 'ph-trash', 'info');
      window.carregarCuponsDono();
    } else {
      showToast('Erro ao excluir cupom.', 'ph-warning', 'error');
    }
  } catch (e) {
    showToast('Erro de conexão ao excluir cupom.', 'ph-warning', 'error');
  }
};

// Ouvir atualizações de cupons em tempo real
if (socket && typeof socket.on === 'function') {
  socket.on('cupons_atualizados', () => {
    window.carregarCuponsDono();
  });
}

// Chamar carregamento de cupons na inicialização
window.carregarCuponsDono();



// ════════════════════════════════════════════════════════════════════
// TEMA CLARO / ESCURO NO PAINEL DO DONO
// ════════════════════════════════════════════════════════════════════
window.toggleTemaDono = function() {
  const current = localStorage.getItem('chef_theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  window.aplicarTemaDono(next);
};

window.aplicarTemaDono = function(theme) {
  localStorage.setItem('chef_theme', theme);
  document.body.setAttribute('data-theme', theme);
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add('theme-' + theme);

  const icon = document.getElementById('theme-dono-icon');
  if (icon) {
    icon.className = theme === 'dark' ? 'ph-bold ph-sun' : 'ph-bold ph-moon';
  }
};

// Inicializa o tema salvo
(function initTemaDono() {
  const salvo = localStorage.getItem('chef_theme') || 'dark';
  window.aplicarTemaDono(salvo);
})();


// ════════════════════════════════════════════════════════════════════
// REORDENAÇÃO DINÂMICA DE SEÇÕES DO PAINEL
// ════════════════════════════════════════════════════════════════════
const SECOES_PADRAO = [
  { id: 'sec-kpis', titulo: '💰 Faturamento & Indicadores do Dia (KPIs)' },
  { id: 'sec-caixa', titulo: '🔒 Status do Turno & Controle do Caixa' },
  { id: 'sec-mesas', titulo: '🍽️ Salão de Mesas & Ocupação' },
  { id: 'sec-ranking', titulo: '📈 Ranking de Produtos Mais Vendidos' },
  { id: 'sec-graficos', titulo: '📊 Gráficos de Faturamento & Meios de Pagamento' },
  { id: 'sec-delivery', titulo: '🛵 Delivery & Rastreio de Entregas' },
  { id: 'sec-equipe', titulo: '👥 Equipe Operacional & Ponto' },
  { id: 'sec-atalhos', titulo: '⚡ Ações Rápidas & Gestão' }
];

window.aplicarOrdemSeccoes = function() {
  let ordem = [];
  try {
    ordem = JSON.parse(localStorage.getItem('chef_dono_sections_order') || '[]');
  } catch(e){}
  if (!Array.isArray(ordem) || ordem.length === 0) {
    ordem = SECOES_PADRAO.map(s => s.id);
  }

  const main = document.querySelector('main');
  if (!main) return;

  ordem.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentNode === main) {
      main.appendChild(el);
    }
  });
};

window.abrirModalReordenarSeccoes = function() {
  let modal = document.getElementById('modal-reordenar-seccoes');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-reordenar-seccoes';
    modal.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(15,23,42,0.7); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
    document.body.appendChild(modal);
  }

  let ordem = [];
  try {
    ordem = JSON.parse(localStorage.getItem('chef_dono_sections_order') || '[]');
  } catch(e){}
  if (!Array.isArray(ordem) || ordem.length === 0) {
    ordem = SECOES_PADRAO.map(s => s.id);
  }

  const itensHtml = ordem.map((id, index) => {
    const info = SECOES_PADRAO.find(s => s.id === id) || { id, titulo: id };
    return `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:var(--card2); border:1px solid var(--border); border-radius:14px; margin-bottom:8px;">
        <span style="font-weight:700; font-size:14px; color:var(--text);">${info.titulo}</span>
        <div style="display:flex; gap:6px;">
          <button type="button" onclick="window.moverSecaoDono(${index}, -1)" ${index === 0 ? 'disabled style="opacity:0.3;"' : ''} style="background:var(--card); border:1px solid var(--border); color:var(--text); width:34px; height:34px; border-radius:10px; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center;">↑</button>
          <button type="button" onclick="window.moverSecaoDono(${index}, 1)" ${index === ordem.length - 1 ? 'disabled style="opacity:0.3;"' : ''} style="background:var(--card); border:1px solid var(--border); color:var(--text); width:34px; height:34px; border-radius:10px; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center;">↓</button>
        </div>
      </div>
    `;
  }).join('');

  modal.innerHTML = `
    <div style="background:var(--card); border-radius:24px; padding:24px; width:100%; max-width:500px; box-shadow:var(--shadow-md); border:1px solid var(--border); box-sizing:border-box;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="font-size:18px; font-weight:800; color:var(--text); margin:0; display:flex; align-items:center; gap:8px;">
          <i class="ph-bold ph-arrows-down-up" style="color:var(--primary);"></i> Organizar Seções do Painel
        </h3>
        <button onclick="document.getElementById('modal-reordenar-seccoes').style.display='none'" style="background:transparent; border:none; color:var(--text-sub); font-size:22px; cursor:pointer;">✕</button>
      </div>
      <p style="font-size:13px; color:var(--text-sub); margin-bottom:16px;">Use as setas para ajustar a ordem em que as seções aparecem no seu painel:</p>

      <div style="max-height:50vh; overflow-y:auto; padding-right:4px;">
        ${itensHtml}
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:18px;">
        <button type="button" onclick="window.resetarOrdemSeccoes()" style="background:transparent; border:none; color:var(--red); font-size:13px; font-weight:700; cursor:pointer;">Resetar Padrão</button>
        <button type="button" onclick="document.getElementById('modal-reordenar-seccoes').style.display='none'" style="background:var(--primary); color:white; border:none; padding:10px 20px; border-radius:12px; font-weight:800; font-size:14px; cursor:pointer;">Concluir</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
};

window.moverSecaoDono = function(index, dir) {
  let ordem = [];
  try {
    ordem = JSON.parse(localStorage.getItem('chef_dono_sections_order') || '[]');
  } catch(e){}
  if (!Array.isArray(ordem) || ordem.length === 0) {
    ordem = SECOES_PADRAO.map(s => s.id);
  }

  const target = index + dir;
  if (target < 0 || target >= ordem.length) return;

  const temp = ordem[index];
  ordem[index] = ordem[target];
  ordem[target] = temp;

  localStorage.setItem('chef_dono_sections_order', JSON.stringify(ordem));
  window.aplicarOrdemSeccoes();
  window.abrirModalReordenarSeccoes();
};

window.resetarOrdemSeccoes = function() {
  localStorage.removeItem('chef_dono_sections_order');
  window.aplicarOrdemSeccoes();
  window.abrirModalReordenarSeccoes();
};


// ════════════════════════════════════════════════════════════════════
// MOTOR DE LONG PRESS (MANTER PRESSIONADO) COM FEEDBACK TÁTIL
// ════════════════════════════════════════════════════════════════════
window.initLongPressDono = function() {
  const elements = [
    { selector: '#kpi-faturamento-card, .kpi-card.full', action: 'faturamento', label: 'Segure p/ Detalhes' },
    { selector: '#sec-caixa, .cashier-box', action: 'caixa', label: 'Segure p/ Ações' },
    { selector: '#kpi-mesas-card', action: 'mesas', label: 'Segure p/ Salão' },
    { selector: '#kpi-equipe-card', action: 'equipe', label: 'Segure p/ Ponto' }
  ];

  elements.forEach(({ selector, action, label }) => {
    document.querySelectorAll(selector).forEach(el => {
      if (el._hasLongPress) return;
      el._hasLongPress = true;
      el.classList.add('has-long-press');
      
      let timer = null;
      let startX = 0, startY = 0;

      const startPress = (e) => {
        if (e.touches && e.touches.length > 1) return;
        startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
        el.classList.add('long-press-active');
        
        timer = setTimeout(() => {
          el.classList.remove('long-press-active');
          if (navigator.vibrate) try { navigator.vibrate(45); } catch(e){}
          window.executarAcaoLongPress(action);
        }, 450);
      };

      const cancelPress = (e) => {
        if (e.type === 'touchmove') {
          const x = (e.touches && e.touches[0].clientX) || 0;
          const y = (e.touches && e.touches[0].clientY) || 0;
          if (Math.abs(x - startX) > 10 || Math.abs(y - startY) > 10) {
            clearTimeout(timer);
            el.classList.remove('long-press-active');
          }
          return;
        }
        clearTimeout(timer);
        el.classList.remove('long-press-active');
      };

      el.addEventListener('mousedown', startPress);
      el.addEventListener('touchstart', startPress, { passive: true });
      el.addEventListener('mouseup', cancelPress);
      el.addEventListener('mouseleave', cancelPress);
      el.addEventListener('touchend', cancelPress);
      el.addEventListener('touchcancel', cancelPress);
      el.addEventListener('touchmove', cancelPress, { passive: true });
    });
  });
};

window.executarAcaoLongPress = function(tipo) {
  if (tipo === 'faturamento') {
    window.abrirModalDetalhesFaturamento();
  } else if (tipo === 'caixa') {
    window.abrirModalAcoesCaixa();
  } else if (tipo === 'mesas') {
    window.location.href = '/garcom.html';
  } else if (tipo === 'equipe') {
    window.location.href = '/configuracoes.html#rh';
  }
};

window.abrirModalDetalhesFaturamento = function() {
  let modal = document.getElementById('modal-detalhe-faturamento');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-detalhe-faturamento';
    modal.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(15,23,42,0.7); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
    document.body.appendChild(modal);
  }

  const faturamentoTxt = document.getElementById('kpi-faturamento')?.innerText || 'R$ 0,00';
  const ticketTxt = document.getElementById('kpi-ticket')?.innerText || 'R$ 0,00';

  modal.innerHTML = `
    <div style="background:var(--card); border-radius:24px; padding:26px; width:100%; max-width:480px; box-shadow:var(--shadow-md); border:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
        <h3 style="font-size:18px; font-weight:800; color:var(--text); margin:0; display:flex; align-items:center; gap:8px;">
          <i class="ph-bold ph-chart-line-up" style="color:var(--primary);"></i> Detalhamento do Faturamento
        </h3>
        <button onclick="document.getElementById('modal-detalhe-faturamento').style.display='none'" style="background:transparent; border:none; color:var(--text-sub); font-size:22px; cursor:pointer;">✕</button>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:18px;">
        <div style="padding:14px; background:var(--card2); border-radius:16px; border:1px solid var(--border);">
          <span style="font-size:12px; color:var(--text-sub); display:block; margin-bottom:4px;">Total Vendas</span>
          <strong style="font-size:20px; color:var(--text); font-weight:900;">${faturamentoTxt}</strong>
        </div>
        <div style="padding:14px; background:var(--card2); border-radius:16px; border:1px solid var(--border);">
          <span style="font-size:12px; color:var(--text-sub); display:block; margin-bottom:4px;">Ticket Médio</span>
          <strong style="font-size:20px; color:var(--text); font-weight:900;">${ticketTxt}</strong>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:8px;">
        <button onclick="window.location.href='/configuracoes.html#dre'" style="width:100%; padding:14px; background:var(--primary); color:white; border:none; border-radius:14px; font-weight:800; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
          <i class="ph-bold ph-file-text"></i> Abrir DRE & Demonstrativo Completo
        </button>
        <button onclick="window.location.href='/index.html'" style="width:100%; padding:14px; background:var(--card2); color:var(--text); border:1px solid var(--border); border-radius:14px; font-weight:800; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
          <i class="ph-bold ph-desktop"></i> Ir ao Terminal de Vendas (PDV)
        </button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
};

window.abrirModalAcoesCaixa = function() {
  let modal = document.getElementById('modal-acoes-caixa-rapidas');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-acoes-caixa-rapidas';
    modal.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(15,23,42,0.7); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
    document.body.appendChild(modal);
  }

  const badgeTxt = document.getElementById('caixa-badge-txt')?.innerText || 'Caixa';

  modal.innerHTML = `
    <div style="background:var(--card); border-radius:24px; padding:26px; width:100%; max-width:480px; box-shadow:var(--shadow-md); border:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
        <h3 style="font-size:18px; font-weight:800; color:var(--text); margin:0; display:flex; align-items:center; gap:8px;">
          <i class="ph-bold ph-wallet" style="color:var(--primary);"></i> Gestão Rápida do Caixa
        </h3>
        <button onclick="document.getElementById('modal-acoes-caixa-rapidas').style.display='none'" style="background:transparent; border:none; color:var(--text-sub); font-size:22px; cursor:pointer;">✕</button>
      </div>

      <p style="font-size:13.5px; color:var(--text-sub); margin-bottom:18px;">Status atual: <strong style="color:var(--text);">${badgeTxt}</strong></p>

      <div style="display:flex; flex-direction:column; gap:10px;">
        <button onclick="window.location.href='/index.html'" style="padding:14px; background:var(--primary); color:white; border:none; border-radius:14px; font-weight:800; font-size:14.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
          <i class="ph-bold ph-desktop"></i> Abrir Terminal de Caixa (PDV)
        </button>
        <button onclick="window.location.href='/configuracoes.html#fechamentos'" style="padding:14px; background:var(--card2); border:1px solid var(--border); color:var(--text); border-radius:14px; font-weight:800; font-size:14.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
          <i class="ph-bold ph-receipt"></i> Histórico de Turnos & Fechamentos
        </button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
};

// Disparar a ordenação e o long press após carregar a página
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof window.aplicarOrdemSeccoes === 'function') window.aplicarOrdemSeccoes();
    if (typeof window.initLongPressDono === 'function') window.initLongPressDono();
  }, 100);
});


// ════════════════════════════════════════════════════════════════════
// MOTOR DE RECOLHER / EXPANDIR SEÇÕES DO PAINEL COM PERSISTÊNCIA
// ════════════════════════════════════════════════════════════════════
window.toggleSecao = function(secaoId) {
  const el = document.getElementById(secaoId) || document.querySelector(`[data-section-id="${secaoId}"]`);
  if (!el) return;

  el.classList.toggle('is-collapsed');
  if (navigator.vibrate) try { navigator.vibrate(10); } catch(e){}

  // Salvar estado no localStorage
  let collapsed = [];
  try {
    collapsed = JSON.parse(localStorage.getItem('chef_dono_collapsed_sections') || '[]');
  } catch(e){}

  if (el.classList.contains('is-collapsed')) {
    if (!collapsed.includes(secaoId)) collapsed.push(secaoId);
  } else {
    collapsed = collapsed.filter(id => id !== secaoId);
  }

  localStorage.setItem('chef_dono_collapsed_sections', JSON.stringify(collapsed));
  window.atualizarBotaoToggleGlobal();
};

window.toggleTodasSecoes = function() {
  const sections = document.querySelectorAll('.dono-section, main > div');
  const allCollapsed = Array.from(sections).every(s => s.classList.contains('is-collapsed'));

  let collapsedList = [];
  sections.forEach((sec, idx) => {
    const secId = sec.id || ('sec-' + idx);
    if (allCollapsed) {
      sec.classList.remove('is-collapsed');
    } else {
      sec.classList.add('is-collapsed');
      collapsedList.push(secId);
    }
  });

  localStorage.setItem('chef_dono_collapsed_sections', JSON.stringify(collapsedList));
  window.atualizarBotaoToggleGlobal();
  if (navigator.vibrate) try { navigator.vibrate(15); } catch(e){}
};

window.atualizarBotaoToggleGlobal = function() {
  const sections = document.querySelectorAll('.dono-section, main > div');
  if (!sections.length) return;
  const allCollapsed = Array.from(sections).every(s => s.classList.contains('is-collapsed'));

  const icon = document.getElementById('icon-toggle-all');
  const txt = document.getElementById('txt-toggle-all');
  if (icon && txt) {
    if (allCollapsed) {
      icon.className = 'ph-bold ph-caret-double-down';
      txt.innerText = 'Expandir Tudo';
    } else {
      icon.className = 'ph-bold ph-caret-double-up';
      txt.innerText = 'Recolher Tudo';
    }
  }
};

window.restaurarEstadoSecoes = function() {
  let collapsed = [];
  try {
    collapsed = JSON.parse(localStorage.getItem('chef_dono_collapsed_sections') || '[]');
  } catch(e){}

  if (Array.isArray(collapsed)) {
    collapsed.forEach(id => {
      const el = document.getElementById(id) || document.querySelector(`[data-section-id="${id}"]`);
      if (el) el.classList.add('is-collapsed');
    });
  }
  window.atualizarBotaoToggleGlobal();
};

// Tornar os cabeçalhos de cada seção clicáveis dinamicamente
window.inicializarSecoesRecolhiveis = function() {
  document.querySelectorAll('main > div').forEach((sec, idx) => {
    sec.classList.add('dono-section');
    const secId = sec.id || ('sec-dono-' + idx);
    if (!sec.id) sec.id = secId;

    const titleEl = sec.querySelector('.sec-title');
    if (titleEl && !sec.querySelector('.btn-sec-toggle')) {
      const parentRow = titleEl.parentElement;
      parentRow.classList.add('sec-header-row');
      parentRow.setAttribute('onclick', `window.toggleSecao('${secId}')`);
      parentRow.title = 'Clique para recolher ou expandir esta seção';

      // Badge de resumo quando recolhido
      const badge = document.createElement('span');
      badge.className = 'sec-collapsed-badge';
      badge.innerText = 'Oculto (Toque para Ver)';
      parentRow.appendChild(badge);

      // Botão seta
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'btn-sec-toggle';
      toggleBtn.innerHTML = '<i class="ph-bold ph-caret-down"></i>';
      parentRow.appendChild(toggleBtn);

      // Envolver conteúdo restante em .sec-content
      const contentNodes = Array.from(sec.children).filter(c => c !== parentRow);
      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'sec-content';
      contentNodes.forEach(node => contentWrapper.appendChild(node));
      sec.appendChild(contentWrapper);
    }
  });

  window.restaurarEstadoSecoes();
};

// Inicialização suave no carregamento
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof window.inicializarSecoesRecolhiveis === 'function') window.inicializarSecoesRecolhiveis();
  }, 50);
});


// ════════════════════════════════════════════════════════════════════
// GESTÃO DE PRODUTOS PARA CUPONS E MARKETING
// ════════════════════════════════════════════════════════════════════
let _produtosDisponiveis = [];
let _produtosSelecionadosCupom = [];

window.carregarProdutosParaCupom = async function() {
  try {
    const res = await fetch('/api/produtos', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('chef_token') } });
    if (!res.ok) return;
    _produtosDisponiveis = await res.json();
    window.renderizarListaProdutosCupom();
  } catch(e){}
};

window.toggleEscopoProdutosCupom = function(escopo) {
  const container = document.getElementById('container-produtos-cupom');
  const txt = document.getElementById('cupom-produtos-selecionados-txt');
  if (escopo === 'especificos') {
    if (container) container.style.display = 'block';
    if (!_produtosDisponiveis.length) window.carregarProdutosParaCupom();
    if (txt) txt.innerText = `${_produtosSelecionadosCupom.length} itens selecionados`;
  } else {
    if (container) container.style.display = 'none';
    _produtosSelecionadosCupom = [];
    if (txt) txt.innerText = 'Todos os Produtos';
  }
};

window.renderizarListaProdutosCupom = function(filtro = '') {
  const lista = document.getElementById('lista-produtos-cupom');
  if (!lista) return;

  const f = filtro.toLowerCase().trim();
  const itens = _produtosDisponiveis.filter(p => !f || p.name.toLowerCase().includes(f));

  if (!itens.length) {
    lista.innerHTML = '<span style="font-size:12px; color:var(--text-sub); text-align:center; padding:8px;">Nenhum produto encontrado.</span>';
    return;
  }

  lista.innerHTML = itens.map(p => {
    const checked = _produtosSelecionadosCupom.some(x => x.id === p.id);
    return `
      <label style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:var(--card); border:1px solid var(--border); border-radius:8px; cursor:pointer;">
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="window.toggleProdutoCupomItem(${p.id}, this.checked)">
          <span style="font-size:13px; font-weight:700; color:var(--text);">${p.name}</span>
        </div>
        <span style="font-size:12px; color:var(--primary); font-weight:800;">R$ ${parseFloat(p.price || 0).toFixed(2).replace('.', ',')}</span>
      </label>
    `;
  }).join('');
};

window.filtrarProdutosCupom = function(txt) {
  window.renderizarListaProdutosCupom(txt);
};

window.toggleProdutoCupomItem = function(id, checked) {
  const prod = _produtosDisponiveis.find(p => p.id === id);
  if (!prod) return;

  if (checked) {
    if (!_produtosSelecionadosCupom.some(p => p.id === id)) {
      _produtosSelecionadosCupom.push({ id: prod.id, name: prod.name, price: prod.price });
    }
  } else {
    _produtosSelecionadosCupom = _produtosSelecionadosCupom.filter(p => p.id !== id);
  }

  const txt = document.getElementById('cupom-produtos-selecionados-txt');
  if (txt) txt.innerText = `${_produtosSelecionadosCupom.length} itens selecionados`;
};

// ── Módulo de Marketing & Disparo Push / WhatsApp ──
window.checarStatusMarketing = async function() {
  try {
    const res = await fetch('/api/marketing/status');
    if (!res.ok) return;
    const data = await res.json();
    
    const card = document.getElementById('marketing-showcase-card');
    const panel = document.getElementById('marketing-active-panel');
    const totalEl = document.getElementById('marketing-total-clientes');

    if (totalEl) totalEl.innerText = `${data.total_clientes || 0} clientes cadastrados`;

    if (data.ativo) {
      if (card) card.style.display = 'none';
      if (panel) panel.style.display = 'flex';
    } else {
      if (card) card.style.display = 'block';
      if (panel) panel.style.display = 'none';
    }
  } catch(e){}
};

window.ativarTesteMarketing = async function() {
  try {
    await fetch('/api/marketing/ativar', { method: 'POST' });
    showToast('✨ Módulo de Mensagens & Notificações Ativado!', 'ph-check-circle', 'success');
    window.checarStatusMarketing();
  } catch(e){
    showToast('Erro ao ativar módulo.', 'ph-warning', 'error');
  }
};

window.abrirModalContratarMarketing = function() {
  let modal = document.getElementById('modal-contratar-marketing');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-contratar-marketing';
    modal.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(15,23,42,0.7); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:var(--card); border-radius:24px; padding:26px; width:100%; max-width:480px; box-shadow:var(--shadow-md); border:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="font-size:18px; font-weight:800; color:var(--text); margin:0; display:flex; align-items:center; gap:8px;">
          <i class="ph-bold ph-crown" style="color:var(--primary);"></i> Módulo Premium de Mensagens & Push
        </h3>
        <button onclick="document.getElementById('modal-contratar-marketing').style.display='none'" style="background:transparent; border:none; color:var(--text-sub); font-size:22px; cursor:pointer;">✕</button>
      </div>

      <p style="font-size:13.5px; color:var(--text-sub); margin-bottom:16px; line-height:1.5;">
        Transforme seus clientes cadastrados em vendas recorrentes com avisos em tempo real e cupons instantâneos enviados diretamente no celular.
      </p>

      <div style="background:var(--card2); border:1px solid var(--border); border-radius:16px; padding:16px; margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="color:var(--text); font-size:15px;">Plano Ilimitado Push + WhatsApp</strong>
          <span style="color:var(--green); font-weight:900; font-size:18px;">R$ 49,90/mês</span>
        </div>
        <ul style="font-size:12.5px; color:var(--text-sub); padding-left:18px; line-height:1.6; margin:0;">
          <li>Disparos ilimitados de Notificações Web Push (PWA)</li>
          <li>Geração e envio automático de Cupons QR com 1 clique</li>
          <li>Segmentação de clientes VIP e inativos</li>
        </ul>
      </div>

      <div style="display:flex; gap:10px;">
        <button onclick="document.getElementById('modal-contratar-marketing').style.display='none'" class="btn-secondary" style="flex:1; padding:12px;">Fechar</button>
        <button onclick="window.ativarTesteMarketing(); document.getElementById('modal-contratar-marketing').style.display='none';" class="btn-primary" style="flex:2; padding:12px; justify-content:center; font-weight:800;">
          <i class="ph-bold ph-check"></i> Ativar Agora (Teste Grátis)
        </button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
};

window.abrirModalDisparoMassa = function() {
  let modal = document.getElementById('modal-disparo-massa');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-disparo-massa';
    modal.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(15,23,42,0.7); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:var(--card); border-radius:24px; padding:26px; width:100%; max-width:480px; box-shadow:var(--shadow-md); border:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="font-size:18px; font-weight:800; color:var(--text); margin:0; display:flex; align-items:center; gap:8px;">
          <i class="ph-bold ph-paper-plane-tilt" style="color:var(--primary);"></i> Disparo de Mensagem & Cupom
        </h3>
        <button onclick="document.getElementById('modal-disparo-massa').style.display='none'" style="background:transparent; border:none; color:var(--text-sub); font-size:22px; cursor:pointer;">✕</button>
      </div>

      <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:16px;">
        <div>
          <label style="font-size:12px; font-weight:700; color:var(--text-sub); display:block; margin-bottom:4px;">Mensagem Promocional</label>
          <textarea id="marketing-msg-input" rows="3" class="form-input" placeholder="Ex: Olá! Hoje temos promoção especial no almoço com 15% de desconto para você!" style="width:100%; box-sizing:border-box;"></textarea>
        </div>

        <div>
          <label style="font-size:12px; font-weight:700; color:var(--text-sub); display:block; margin-bottom:4px;">Anexar Cupom QR (Opcional)</label>
          <input type="text" id="marketing-cupom-input" class="form-input" placeholder="Ex: PROMO15" style="width:100%; text-transform:uppercase; font-weight:800; box-sizing:border-box;">
        </div>
      </div>

      <div style="display:flex; gap:10px;">
        <button onclick="document.getElementById('modal-disparo-massa').style.display='none'" class="btn-secondary" style="flex:1; padding:12px;">Cancelar</button>
        <button onclick="window.executarDisparoMassa()" class="btn-primary" style="flex:2; padding:12px; justify-content:center; font-weight:800;">
          <i class="ph-bold ph-paper-plane-tilt"></i> Disparar para Todos
        </button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
};

window.executarDisparoMassa = async function() {
  const msg = document.getElementById('marketing-msg-input')?.value.trim();
  const cupom = document.getElementById('marketing-cupom-input')?.value.trim();

  if (!msg) {
    showToast('Escreva a mensagem para enviar.', 'ph-warning', 'error');
    return;
  }

  try {
    const res = await fetch('/api/marketing/disparo-massa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem: msg, cupom_codigo: cupom })
    });
    const d = await res.json();
    if (d.success) {
      document.getElementById('modal-disparo-massa').style.display = 'none';
      showToast(`📢 Notificação disparada para ${d.enviados || 0} clientes!`, 'ph-check-circle', 'success');
    }
  } catch(e){
    showToast('Erro ao realizar disparo.', 'ph-warning', 'error');
  }
};

// ── Troca Rápida de Restaurante (Minha Rede) ──
window.abrirTrocarRestaurante = async function() {
  let modal = document.getElementById('modal-trocar-restaurante-dono');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-trocar-restaurante-dono';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const token = localStorage.getItem('chef_token') || '';
  const tidAtual = parseInt(localStorage.getItem('restaurante_id') || '1', 10);

  modal.innerHTML = `
    <div class="modal-sheet" style="max-width:480px;">
      <div class="modal-drag"></div>
      <div class="modal-title-row">
        <span class="modal-title"><i class="ph-bold ph-storefront" style="color:var(--primary);"></i> Meus Restaurantes</span>
        <button class="modal-close" onclick="fecharModal('modal-trocar-restaurante-dono')"><i class="ph-bold ph-x"></i></button>
      </div>
      <p style="font-size:13px; color:var(--text-sub); margin:0 0 12px 0;">Selecione qual unidade da sua rede você deseja visualizar agora:</p>
      
      <div id="lista-restaurantes-rede-dono" style="display:flex; flex-direction:column; gap:8px; max-height:50vh; overflow-y:auto;">
        <div style="text-align:center; padding:20px; color:var(--text-sub); font-size:13px;">Carregando unidades...</div>
      </div>

      <button class="btn-cancel" onclick="fecharModal('modal-trocar-restaurante-dono')" style="width:100%; padding:14px; margin-top:10px;">Fechar</button>
    </div>
  `;

  modal.classList.remove('hidden');

  try {
    const r = await fetch('/api/auth/minha-rede', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const d = await r.json();
    const rede = d.rede || [];
    const container = document.getElementById('lista-restaurantes-rede-dono');
    if (!container) return;

    if (rede.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-sub); font-size:13px;">Nenhuma outra unidade vinculada.</div>`;
      return;
    }

    container.innerHTML = rede.map(rst => {
      const isAtual = rst.id === tidAtual;
      return `
        <button type="button" onclick="window.trocarRestauranteDono(${rst.id})" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:14px 16px; background:${isAtual ? 'var(--primary-light)' : 'var(--card2)'}; border:1.5px solid ${isAtual ? 'var(--primary)' : 'var(--border)'}; border-radius:14px; cursor:pointer; text-align:left; transition:all 0.15s;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:38px; height:38px; border-radius:10px; background:${isAtual ? 'var(--primary)' : 'rgba(255,255,255,0.06)'}; color:${isAtual ? '#fff' : 'var(--text)'}; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:800;">
              ${rst.nome ? rst.nome.charAt(0).toUpperCase() : 'R'}
            </div>
            <div>
              <strong style="display:block; font-size:14.5px; color:var(--text);">${rst.nome || 'Restaurante #' + rst.id}</strong>
              <span style="font-size:11.5px; color:var(--text-sub);">Unidade ID: ${rst.id}</span>
            </div>
          </div>
          ${isAtual ? '<span style="background:var(--primary); color:#fff; font-size:10px; font-weight:800; padding:3px 8px; border-radius:8px;">ATUAL</span>' : '<i class="ph-bold ph-arrow-right" style="color:var(--text-sub); font-size:16px;"></i>'}
        </button>
      `;
    }).join('');
  } catch(e) {
    const container = document.getElementById('lista-restaurantes-rede-dono');
    if (container) container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--red); font-size:13px;">Erro ao carregar unidades.</div>`;
  }
};

window.trocarRestauranteDono = async function(id) {
  const token = localStorage.getItem('chef_token') || '';
  showToast('Alternando restaurante...', 'ph-arrows-clockwise', 'info');
  try {
    const r = await fetch('/api/auth/trocar-restaurante', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ restaurante_id: id })
    });
    const d = await r.json();
    if (d.success) {
      if (d.token) localStorage.setItem('chef_token', d.token);
      localStorage.setItem('restaurante_id', String(d.restaurante_id || id));
      if (d.restaurante_nome) localStorage.setItem('restaurante_nome', d.restaurante_nome);
      showToast(`Restaurante alterado para ${d.restaurante_nome || '#' + id}!`, 'ph-check-circle', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } else {
      showToast(d.error || 'Erro ao trocar restaurante.', 'ph-warning', 'error');
    }
  } catch(e) {
    showToast('Erro de conexão ao trocar restaurante.', 'ph-warning', 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof window.checarStatusMarketing === 'function') window.checarStatusMarketing();
  }, 200);
});
