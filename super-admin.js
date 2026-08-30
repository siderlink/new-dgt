/**
 * super-admin.js — Painel de Super Admin do Chef Cozinha (Modo Local)
 * Gerencia restaurantes, usuários, clientes, servidor, logs, configurações e terminal.
 */

var localToken = '';
var restaurantesData = [];
var usuariosData = [];
var clientesData = [];
var isLocalMode = false;

/* ═══ INACTIVITY TIMEOUT ═══ */
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos
let inactivityTimer = null;
const INACTIVITY_EVENTS = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart', 'wheel'];
let _inactivityHandlers = [];

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(logout, INACTIVITY_TIMEOUT_MS);
}

function startInactivityMonitor() {
  stopInactivityMonitor();
  INACTIVITY_EVENTS.forEach(function(ev) {
    var handler = resetInactivityTimer;
    window.addEventListener(ev, handler);
    _inactivityHandlers.push({ ev: ev, handler: handler });
  });
  resetInactivityTimer();
}

function stopInactivityMonitor() {
  clearTimeout(inactivityTimer);
  for (var i = 0; i < _inactivityHandlers.length; i++) {
    window.removeEventListener(_inactivityHandlers[i].ev, _inactivityHandlers[i].handler);
  }
  _inactivityHandlers = [];
}

/* ═══ TOAST ═══ */
function showToast(text, type) {
  var t = document.getElementById('toast');
  var icon = document.getElementById('toast-icon');
  var txt = document.getElementById('toast-text');
  if (!t) return;
  txt.textContent = text;
  var icons = { info: 'fa-circle-info', success: 'fa-circle-check', danger: 'fa-circle-xmark', warning: 'fa-triangle-exclamation' };
  icon.className = 'fa-solid ' + (icons[type] || icons.info);
  t.className = 'toast active toast-' + (type || 'info');
  setTimeout(function() { t.className = 'toast'; }, 4000);
}

/* ═══ AUTH ═══ */
function authHeaders() {
  return { 'Content-Type': 'application/json', 'x-super-admin-token': localToken };
}

function apiGet(url, cb) {
  var x = new XMLHttpRequest();
  x.open('GET', url, true);
  x.setRequestHeader('x-super-admin-token', localToken);
  x.onreadystatechange = function() {
    if (x.readyState === 4) {
      try { cb(null, JSON.parse(x.responseText)); }
      catch(e) { cb(e, null); }
    }
  };
  x.onerror = function() { cb(new Error('Erro de rede'), null); };
  x.send(null);
}

function apiPost(url, data, cb) {
  var x = new XMLHttpRequest();
  x.open('POST', url, true);
  x.setRequestHeader('Content-Type', 'application/json');
  x.setRequestHeader('x-super-admin-token', localToken);
  x.onreadystatechange = function() {
    if (x.readyState === 4) {
      try { cb(null, JSON.parse(x.responseText)); }
      catch(e) { cb(e, null); }
    }
  };
  x.onerror = function() { cb(new Error('Erro de rede'), null); };
  x.send(JSON.stringify(data));
}

function apiPut(url, data, cb) {
  var x = new XMLHttpRequest();
  x.open('PUT', url, true);
  x.setRequestHeader('Content-Type', 'application/json');
  x.setRequestHeader('x-super-admin-token', localToken);
  x.onreadystatechange = function() {
    if (x.readyState === 4) {
      try { cb(null, JSON.parse(x.responseText)); }
      catch(e) { cb(e, null); }
    }
  };
  x.onerror = function() { cb(new Error('Erro de rede'), null); };
  x.send(JSON.stringify(data));
}

function apiDelete(url, dataOrCb, maybeCb) {
  var data = (typeof dataOrCb === 'function') ? null : dataOrCb;
  var cb = (typeof dataOrCb === 'function') ? dataOrCb : (maybeCb || function(){});
  var x = new XMLHttpRequest();
  x.open('DELETE', url, true);
  if (data) {
    x.setRequestHeader('Content-Type', 'application/json');
  }
  x.setRequestHeader('x-super-admin-token', localToken);
  x.onreadystatechange = function() {
    if (x.readyState === 4) {
      try { cb(null, JSON.parse(x.responseText)); }
      catch(e) { cb(e, null); }
    }
  };
  x.onerror = function() { cb(new Error('Erro de rede'), null); };
  x.send(data ? JSON.stringify(data) : null);
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
var escHtml = escapeHtml;

/* ═══ LOGIN & CARREGAMENTO DINÂMICO DO PAINEL ═══ */
function loginLocal() {
  var senhaInput = document.getElementById('local-senha');
  var senha = senhaInput ? senhaInput.value.trim() : '';
  if (!senha) { showToast('Informe a senha de administrador!', 'warning'); return; }

  var x = new XMLHttpRequest();
  x.open('POST', '/api/super/login-local', true);
  x.setRequestHeader('Content-Type', 'application/json');
  x.onreadystatechange = function() {
    if (x.readyState === 4) {
      try {
        var data = JSON.parse(x.responseText);
        if (data.ok) {
          localToken = data.token || '';
          localStorage.setItem('chef_super_admin_local_token', data.token);
          entrarNoPainel(true);
        } else {
          showToast(data.erro || 'Erro ao realizar login.', 'danger');
        }
      } catch(e) {
        showToast('Falha na conexão com o servidor.', 'danger');
      }
    }
  };
  x.send(JSON.stringify({ senha: senha }));
}

function entrarNoPainel(isExplicitLogin) {
  var headers = {};
  if (localToken) headers['x-super-admin-token'] = localToken;

  fetch('/api/super/panel-template', { credentials: 'same-origin', headers: headers })
    .then(function(res) {
      if (res.ok) return res.text();
      throw new Error('Acesso não autorizado.');
    })
    .then(function(html) {
      carregarEExibirPainel(html);
      if (isExplicitLogin) showToast('Acesso liberado!', 'success');
    })
    .catch(function(err) {
      if (isExplicitLogin) showToast(err.message || 'Sessão expirada ou não autorizada.', 'danger');
      exibirTelaLogin();
    });
}

function carregarEExibirPainel(html) {
  isLocalMode = true;
  var root = document.getElementById('admin-panel-root');
  if (root) root.innerHTML = html;

  var loginContainer = document.getElementById('login-container');
  if (loginContainer) loginContainer.style.display = 'none';

  var adminPanel = document.getElementById('admin-panel');
  if (adminPanel) adminPanel.style.display = 'grid';
  document.body.style.alignItems = 'stretch';

  initAdminPanelUI();

  var targetTab = window.location.hash ? window.location.hash.replace('#', '') : (localStorage.getItem('super_admin_tab') || 'sec-dash');
  if (!document.getElementById(targetTab)) targetTab = 'sec-dash';

  switchTab(targetTab);
  startInactivityMonitor();
  initSuperAdminSockets();
}

function exibirTelaLogin() {
  isLocalMode = false;
  var root = document.getElementById('admin-panel-root');
  if (root) root.innerHTML = '';

  var loginContainer = document.getElementById('login-container');
  if (loginContainer) loginContainer.style.display = 'flex';

  var earlyStyle = document.getElementById('early-tab-style');
  if (earlyStyle && earlyStyle.parentNode) earlyStyle.parentNode.removeChild(earlyStyle);
}

var _superAdminSocket = null;
function initSuperAdminSockets() {
  if (typeof io === 'undefined') return;
  if (_superAdminSocket) return; // já inicializado
  try {
    _superAdminSocket = io();
    // Sala exclusiva de monitoramento de cadastros ao vivo
    _superAdminSocket.emit('entrar_super_admin');

    _superAdminSocket.on('super_cadastro_digitando', function(data) {
      console.log('⌨️ [SuperAdmin] Restaurante digitando o cadastro:', data);
      saMonitorAoVivo(data);
    });

    _superAdminSocket.on('super_cadastro_concluido', function(data) {
      console.log('✅ [SuperAdmin] Cadastro concluído:', data);
      saCadastroConcluido(data);
    });

    _superAdminSocket.on('novo_cadastro_saas', function(data) {
      console.log('🔔 [SuperAdmin] Novo cadastro SaaS recebido em tempo real:', data);
      tocarNotificacaoSom();
      exibirAlertaNovoCadastro(data);
      
      // Se estiver na aba de restaurantes ou dashboard, atualiza imediatamente
      var secRest = document.getElementById('sec-restaurantes');
      var secDash = document.getElementById('sec-dash');
      if (secRest && secRest.classList.contains('active')) {
        carregarRestaurantes();
      }
      if (secDash && secDash.classList.contains('active')) {
        carregarDashboard();
      }
    });

    _superAdminSocket.on('alerta_impostor_super_admin', function(data) {
      console.log('🚨 [SuperAdmin] Alerta de Impostor recebido:', data);
      tocarNotificacaoSom();
      showToast('🚨 TENTATIVA DE IMPOSTOR: ' + (data.email || '') + ' no ' + (data.restaurante_nome || ''), 'danger');
      exibirAlertaImpostor(data);
    });

    _superAdminSocket.on('sistema_hot_swapped', function(data) {
      console.log('🚀 [SuperAdmin] Deploy Hot Swap recebido:', data);
      tocarNotificacaoSom();
      showToast('🚀 Deploy realizado! Commit: ' + (data.hash || '') + '. ' + (data.mensagem || ''), 'success');
      var tbody = document.getElementById('commits-tbody');
      if (tbody) {
        var bannerHtml = '<tr><td colspan="5" style="text-align:center;background:rgba(34,197,94,0.15);padding:12px;border-radius:8px;color:#22c55e;font-weight:600;">' +
          '✅ Deploy Hot Swap aplicado — Commit: ' + esc(data.hash || '') + ' às ' + esc(data.data || '') +
          '<br><small style="color:var(--text-muted);font-weight:400;">Módulos recarregados: ' + (data.reload_result || []).map(function(r){ return r.modulo; }).join(', ') + '</small></td></tr>';
        tbody.insertAdjacentHTML('afterbegin', bannerHtml);
      }
    });

    _superAdminSocket.on('plugin_atualizado', function(data) {
      console.log('🔌 [SuperAdmin] Plugin atualizado:', data);
    });

    _superAdminSocket.on('modulo_global_atualizado', function(data) {
      console.log('🔌 [SuperAdmin] Módulo global atualizado:', data);
      carregarModulos();
    });

    _superAdminSocket.on('modulo_tenant_atualizado', function(data) {
      console.log('🔌 [SuperAdmin] Módulo tenant atualizado:', data);
    });
  } catch (e) {
    console.error('Erro ao conectar socket super-admin:', e);
  }
}

function exibirAlertaImpostor(data) {
  var alertBox = document.getElementById('impostor-live-alert');
  if (!alertBox) {
    alertBox = document.createElement('div');
    alertBox.id = 'impostor-live-alert';
    alertBox.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;max-width:420px;background:rgba(239,68,68,0.95);border:2px solid #ef4444;border-radius:16px;box-shadow:0 20px 40px rgba(239,68,68,0.4);backdrop-filter:blur(12px);padding:20px;color:#ffffff;font-family:inherit;animation:slideInRight 0.4s ease;';
    document.body.appendChild(alertBox);
  }

  var restNome = esc(data.restaurante_nome || 'Restaurante');
  var userEmail = esc(data.email || 'Não informado');
  var userCargo = esc(data.cargo || 'Não informado');
  var userIp = esc(data.ip || 'Desconhecido');

  alertBox.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:18px;">🕵️‍♂️</div>
        <div>
          <h4 style="margin:0;font-size:16px;font-weight:700;">Alerta de Impostor!</h4>
          <span style="font-size:12px;opacity:0.8;">Tentativa sem permissão no Painel do Dono</span>
        </div>
      </div>
      <button onclick="document.getElementById('impostor-live-alert').style.display='none'" style="background:none;border:none;color:white;font-size:18px;cursor:pointer;opacity:0.7;">&times;</button>
    </div>
    <div style="font-size:13px;background:rgba(0,0,0,0.2);padding:12px;border-radius:10px;margin-bottom:12px;line-height:1.4;">
      <div><strong>Restaurante:</strong> ${restNome}</div>
      <div><strong>Colaborador:</strong> ${userEmail} (${userCargo})</div>
      <div><strong>IP:</strong> ${userIp}</div>
    </div>
    <div style="display:flex;gap:8px;">
      <button onclick="document.getElementById('impostor-live-alert').style.display='none'; switchTab('sec-usuarios');" style="flex:1;padding:8px;border:none;border-radius:8px;background:white;color:#ef4444;font-weight:700;font-size:12px;cursor:pointer;">
        Gerenciar Usuários
      </button>
    </div>
  `;
  alertBox.style.display = 'block';
}

function tocarNotificacaoSom() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch(e) {}
}

function exibirAlertaNovoCadastro(data) {
  var alertBox = document.getElementById('saas-live-alert');
  if (!alertBox) {
    alertBox = document.createElement('div');
    alertBox.id = 'saas-live-alert';
    alertBox.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;max-width:380px;background:rgba(15,23,42,0.95);border:2px solid #fc4b15;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,0.6);backdrop-filter:blur(12px);padding:18px 20px;color:#f8fafc;font-family:inherit;animation:slideInRight 0.4s ease;';
    document.body.appendChild(alertBox);
  }

  var restNome = esc(data.restauranteNome || 'Novo Restaurante');
  var dono = esc(data.nome || 'Não informado');
  var tel = esc(data.telefone || 'Não informado');
  var email = esc(data.email || 'Não informado');

  alertBox.innerHTML = 
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="width:36px;height:36px;border-radius:10px;background:rgba(252,75,21,0.2);color:#fc4b15;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">' +
          '<i class="fa-solid fa-bell"></i>' +
        '</div>' +
        '<div>' +
          '<div style="font-weight:700;font-size:14px;color:#fff;">Novo Cadastro Iniciado!</div>' +
          '<div style="font-size:12px;color:#94a3b8;">Etapa 2 (Equipe) em andamento</div>' +
        '</div>' +
      '</div>' +
      '<button onclick="this.closest(\'#saas-live-alert\').style.display=\'none\'" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;padding:0;"><i class="fa-solid fa-xmark"></i></button>' +
    '</div>' +
    '<div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:10px 12px;font-size:13px;display:flex;flex-direction:column;gap:6px;">' +
      '<div><strong style="color:#fdba74;">🏪 Restaurante:</strong> ' + restNome + '</div>' +
      '<div><strong style="color:#93c5fd;">👤 Dono:</strong> ' + dono + '</div>' +
      '<div><strong style="color:#86efac;">📱 WhatsApp:</strong> ' + tel + '</div>' +
      '<div><strong style="color:#cbd5e1;">✉️ E-mail:</strong> ' + email + '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px;">' +
      '<button onclick="switchTab(\'sec-restaurantes\');document.getElementById(\'saas-live-alert\').style.display=\'none\';" style="flex:1;padding:8px 12px;background:#fc4b15;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">Ver Restaurantes</button>' +
      '<button onclick="document.getElementById(\'saas-live-alert\').style.display=\'none\';" style="padding:8px 12px;background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:8px;font-size:12px;cursor:pointer;">Fechar</button>' +
    '</div>';

  alertBox.style.display = 'block';

  showToast('🔔 Novo cadastro: ' + restNome + ' (' + dono + ')', 'info');
}

function logout() {
  stopInactivityMonitor();
  try { apiPost('/api/super/logout', {}, function() {}); } catch(e) {}
  localStorage.removeItem('chef_super_admin_local_token');
  localToken = '';
  isLocalMode = false;
  document.getElementById('login-container').style.display = 'flex';
  document.getElementById('admin-panel').style.display = 'none';
  document.body.style.alignItems = 'center';
}

/* ═══ CLIENTES ═══ */
function carregarClientes() {
  var tbody = document.getElementById('clientes-tbody');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Carregando clientes...</td></tr>';
  
  apiGet('/api/super/clientes', function(err, data) {
    if (err || !data || !data.ok) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444;">Erro ao carregar clientes.</td></tr>';
      return;
    }
    clientesData = data.clientes || [];
    renderClientes();
    popularFiltroRestaurantesClientes();
  });
}

function renderClientes() {
  var search = (document.getElementById('clientes-search').value || '').toLowerCase();
  var filterRest = document.getElementById('clientes-filter-rest').value;
  // Filtros inteligentes
  var fEndereco = ((document.getElementById('cli-f-endereco') || {}).value || '').toLowerCase();
  var fBairro = ((document.getElementById('cli-f-bairro') || {}).value || '').toLowerCase();
  var fCidade = ((document.getElementById('cli-f-cidade') || {}).value || '').toLowerCase();
  var fValor = parseFloat((document.getElementById('cli-f-valor') || {}).value) || 0;
  var fData = (document.getElementById('cli-f-data') || {}).value || '';
  var fNivel = (document.getElementById('cli-f-nivel') || {}).value || '';
  var fDisp = (document.getElementById('cli-f-dispositivo') || {}).value || '';
  popularFiltroDispositivosClientes();
  var filtered = [];
  for (var i = 0; i < clientesData.length; i++) {
    var c = clientesData[i];
    if (search && c.nome.toLowerCase().indexOf(search) === -1 && (c.telefone || '').indexOf(search) === -1) continue;
    if (filterRest && String(c.restaurante_id) !== filterRest) continue;
    if (fEndereco && (c.endereco || '').toLowerCase().indexOf(fEndereco) === -1) continue;
    if (fBairro && (c.bairro || '').toLowerCase().indexOf(fBairro) === -1) continue;
    if (fCidade && (c.cidade || '').toLowerCase().indexOf(fCidade) === -1) continue;
    if (fValor && (parseFloat(c.total_gasto) || 0) < fValor) continue;
    if (fNivel && String(c.nivel || 'Bronze') !== fNivel) continue;
    if (fDisp && (c.dispositivo || '') !== fDisp) continue;
    if (fData) {
      var dUlt = c.ultimo_checkin ? new Date(String(c.ultimo_checkin).replace(' ', 'T')) : null;
      if (!dUlt || isNaN(dUlt.getTime())) continue; // sem visita registrada não entra no filtro por data
      if (dUlt.toISOString().slice(0, 10) < fData) continue;
    }
    filtered.push(c);
  }
  var tbody = document.getElementById('clientes-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Nenhum cliente encontrado.</td></tr>';
    return;
  }
  var html = '';
  for (var j = 0; j < filtered.length; j++) {
    var c2 = filtered[j];
    var extraInfo = [];
    if (c2.cidade || c2.bairro) extraInfo.push('<span><i class="fa-solid fa-location-dot" style="color:#ef4444;width:12px;"></i> ' + esc([c2.cidade, c2.bairro].filter(Boolean).join(' · ')) + '</span>');
    if (c2.dispositivo) extraInfo.push('<span><i class="fa-solid fa-mobile-screen" style="color:#a78bfa;width:12px;"></i> ' + esc(c2.dispositivo) + '</span>');
    html += '<tr>' +
      '<td><div style="font-weight:600;color:white;">' + esc(c2.nome) + '</div>' +
      (extraInfo.length ? '<div style="margin-top:3px;font-size:0.72rem;color:var(--text-muted);display:flex;flex-direction:column;gap:2px;">' + extraInfo.join('') + '</div>' : '') + '</td>' +
      '<td>' + esc(c2.telefone || '—') + '</td>' +
      '<td><small>' + esc(c2.restaurante_nome || '—') + '</small></td>' +
      '<td style="text-align:center;"><span class="badge badge-plano">' + (c2.pontos || 0) + '</span></td>' +
      '<td>R$ ' + formatMoney(c2.total_gasto || 0) + '</td>' +
      '<td style="text-align:center;">' + (c2.total_pedidos || 0) + '</td>' +
      '<td><button class="btn-row-action edit-action" onclick="abrirPerfilCliente(' + c2.id + ',' + c2.restaurante_id + ')" title="Ver perfil completo"><i class="fa-solid fa-user"></i></button></td>' +
      '</tr>';
  }
  tbody.innerHTML = html;
}

// Popula o select de dispositivos dos clientes com valores existentes
function popularFiltroDispositivosClientes() {
  var sel = document.getElementById('cli-f-dispositivo');
  if (!sel) return;
  var atual = sel.value;
  var vistos = {};
  var opts = '<option value="">Todo dispositivo</option>';
  for (var i = 0; i < clientesData.length; i++) {
    var d = clientesData[i].dispositivo;
    if (d && !vistos[d]) { vistos[d] = true; opts += '<option value="' + esc(d) + '">' + esc(d) + '</option>'; }
  }
  sel.innerHTML = opts;
  sel.value = atual;
}

function popularFiltroRestaurantesClientes() {
  var select = document.getElementById('clientes-filter-rest');
  if (!select) return;
  var currentVal = select.value;
  var seen = {};
  select.innerHTML = '<option value="">Todos os Restaurantes</option>';
  for (var i = 0; i < clientesData.length; i++) {
    var c = clientesData[i];
    if (!seen[c.restaurante_id]) {
      seen[c.restaurante_id] = true;
      var opt = document.createElement('option');
      opt.value = c.restaurante_id;
      opt.textContent = c.restaurante_nome || 'Restaurante #' + c.restaurante_id;
      select.appendChild(opt);
    }
  }
  select.value = currentVal;
}

function abrirPerfilCliente(clienteId, restauranteId) {
  var body = document.getElementById('perfil-cliente-body');
  body.innerHTML = '<div style="text-align:center;padding:30px;color:#888;">Carregando perfil...</div>';
  document.getElementById('modal-perfil-cliente').classList.add('active');
  
  apiGet('/api/super/clientes/' + clienteId + '?restaurante_id=' + restauranteId, function(err, data) {
    if (err || !data || !data.ok) {
      body.innerHTML = '<div style="text-align:center;padding:30px;color:#ef4444;">Erro ao carregar perfil do cliente.</div>';
      return;
    }
    var c = data.cliente;
    var html = '';
    
    // Card de informações pessoais
    html += '<div class="stats-grid" style="margin-bottom:1.5rem;">';
    html += '<div class="stat-card active-card"><div class="stat-icon"><i class="fa-solid fa-user"></i></div><div class="stat-meta"><span>Nome</span><h3>' + esc(c.nome) + '</h3></div></div>';
    html += '<div class="stat-card trial-card"><div class="stat-icon"><i class="fa-solid fa-phone"></i></div><div class="stat-meta"><span>Telefone</span><h3 style="font-size:1.1rem;">' + esc(c.telefone || '—') + '</h3></div></div>';
    html += '<div class="stat-card blocked-card"><div class="stat-icon"><i class="fa-solid fa-location-dot"></i></div><div class="stat-meta"><span>Endereço</span><h3 style="font-size:1.1rem;">' + esc(c.endereco || '—') + '</h3></div></div>';
    html += '<div class="stat-card expired-card"><div class="stat-icon"><i class="fa-solid fa-cake-candles"></i></div><div class="stat-meta"><span>Data Nasc.</span><h3 style="font-size:1.1rem;">' + (c.data_nascimento || '—') + '</h3></div></div>';
    html += '<div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-star" style="color:#f59e0b;"></i></div><div class="stat-meta"><span>Pontos Fidelidade</span><h3>' + (c.pontos || 0) + '</h3></div></div>';
    html += '<div class="stat-card active-card"><div class="stat-icon"><i class="fa-solid fa-coins" style="color:#10b981;"></i></div><div class="stat-meta"><span>Total Gasto</span><h3>R$ ' + formatMoney(c.total_gasto || 0) + '</h3></div></div>';
    html += '<div class="stat-card trial-card"><div class="stat-icon"><i class="fa-solid fa-receipt" style="color:#3b82f6;"></i></div><div class="stat-meta"><span>Total Pedidos</span><h3>' + (c.total_pedidos || 0) + '</h3></div></div>';
    html += '<div class="stat-card expired-card"><div class="stat-icon"><i class="fa-solid fa-clock"></i></div><div class="stat-meta"><span>Última Visita</span><h3 style="font-size:1rem;">' + (c.ultima_visita ? new Date(c.ultima_visita).toLocaleDateString('pt-BR') : '—') + '</h3></div></div>';
    html += '</div>';
    
    // Observação
    if (c.observacao) {
      html += '<div class="info-banner" style="margin-bottom:1rem;"><i class="fa-solid fa-note-sticky"></i><div class="info-banner-content"><p>' + esc(c.observacao) + '</p></div></div>';
    }
    
    // Histórico de pedidos
    html += '<h4 style="margin-bottom:0.8rem;"><i class="fa-solid fa-clock-rotate-left"></i> Últimos Pedidos</h4>';
    if (!c.pedidos || c.pedidos.length === 0) {
      html += '<p style="color:var(--text-muted);text-align:center;padding:20px;">Nenhum pedido encontrado.</p>';
    } else {
      html += '<div style="overflow-x:auto;max-height:300px;overflow-y:auto;"><table class="custom-table"><thead><tr>' +
        '<th>#</th><th>Produto</th><th>Qtd</th><th>Total</th><th>Status</th><th>Mesa</th><th>Data</th>' +
        '</tr></thead><tbody>';
      for (var i = 0; i < Math.min(c.pedidos.length, 50); i++) {
        var p = c.pedidos[i];
        var statusColors = { 'Finalizado': '#22c55e', 'Pago': '#22c55e', 'Entregue': '#3b82f6', 'Em preparo': '#f59e0b', 'Cancelado': '#ef4444' };
        var sc = statusColors[p.status] || '#888';
        html += '<tr>' +
          '<td><small>#' + p.id + '</small></td>' +
          '<td>' + esc(p.productName || '—') + '</td>' +
          '<td style="text-align:center;">' + (p.quantity || 0) + '</td>' +
          '<td>R$ ' + (parseFloat(String(p.total).replace(',', '.')) || 0).toFixed(2).replace('.', ',') + '</td>' +
          '<td style="color:' + sc + ';">' + esc(p.status) + '</td>' +
          '<td>' + esc(p.localName || '—') + '</td>' +
          '<td><small>' + (p.createdAt ? new Date(p.createdAt).toLocaleString('pt-BR') : '—') + '</small></td>' +
          '</tr>';
      }
      html += '</tbody></table></div>';
    }
    
    body.innerHTML = html;
  });
}

/* ═══ LOGIN MODE TOGGLE ═══ */
function setLoginMode(mode) {
  var tabLocal = document.getElementById('tab-local');
  var tabCloud = document.getElementById('tab-cloud');
  var loginLocal = document.getElementById('login-local');
  var loginCloud = document.getElementById('login-cloud');

  if (mode === 'local') {
    if (tabLocal) tabLocal.classList.add('active');
    if (tabCloud) tabCloud.classList.remove('active');
    if (loginLocal) loginLocal.style.display = 'block';
    if (loginCloud) loginCloud.style.display = 'none';
  } else {
    if (tabCloud) tabCloud.classList.add('active');
    if (tabLocal) tabLocal.classList.remove('active');
    if (loginLocal) loginLocal.style.display = 'none';
    if (loginCloud) loginCloud.style.display = 'block';
  }
}
window.setLoginMode = setLoginMode;

/* ═══ NAVEGAÇÃO ═══ */
function switchTab(targetId) {
  var items = document.querySelectorAll('.menu-item');
  var sections = document.querySelectorAll('.content-section');
  var titles = {
    'sec-dash': ['Dashboard', 'Visão geral do ecossistema Chef Cozinha'],
    'sec-bi': ['BI / Franquias', 'Comparativo de desempenho entre restaurantes'],
    'sec-restaurantes': ['Restaurantes', 'Gerencie todos os restaurantes da plataforma'],
    'sec-usuarios': ['Usuários', 'Gerencie todos os usuários do sistema'],
    'sec-servidor': ['Servidor', 'Status, backup e manutenção do servidor'],
    'sec-mensagens': ['Mensagens', 'Envie atualizações e avisos para todos os restaurantes'],
    'sec-logs': ['Logs do Sistema', 'Auditoria e logs de requisições API'],
    'sec-config': ['Configurações', 'Configurações globais da plataforma'],
    'sec-funcoes': ['Funções', 'Gerencie funcionalidades habilitadas por restaurante'],
    'sec-features-restaurante': ['Features Restaurante', 'Configure funcionalidades operacionais por restaurante'],
    'sec-dominios': ['Domínios', 'Configure subdomínios e domínios próprios por restaurante'],
    'sec-capacidade': ['Pico & Capacidade', 'Métricas de uso do servidor e capacidade'],
    'sec-mapa': ['Mapa de Restaurantes', 'Restaurantes conectados em tempo real, agrupados por cidade'],
    'sec-load-control': ['Controle de Carga', 'Chave de operação, fila durável de pedidos e circuit breaker automático'],
    'sec-licencas': ['Licenças & Telemetria', 'Chaves de ativação e telemetria dos estabelecimentos'],
    'sec-recuperar-acesso': ['Recuperar Acesso', 'Redefina email e senha de clientes'],
    'sec-clientes': ['Clientes', 'Perfil completo de todos os clientes da plataforma'],
    'sec-suporte': ['Equipe de Suporte', 'Funcionários que prestam suporte aos restaurantes'],
    'sec-terminal': ['Terminal', 'Execute comandos no servidor local'],
    'sec-instancias': ['Instâncias On-Premise', 'Gerencie instalações locais conectadas ao servidor'],
    'sec-tarefas': ['Tarefas de Suporte', 'Acompanhe e atribua demandas para a equipe de suporte'],
    'sec-site-vendas': ['Site de Vendas', 'Edite conteúdo, planos, gateways e configurações da landing page'],
    'sec-afiliados': ['Afiliados & Parceiros', 'Gerenciamento completo da rede de revenda, cadastros e comissões'],
    'sec-seguranca-waf': ['Segurança & WAF', 'Firewall, proteção Anti-DDoS, Rate Limiter e bloqueio de IPs'],
    'sec-deploy-updates': ['Deploy & Atualizações', 'Gerenciamento de versões Git e Hot Swap sem quedas'],
    'sec-plugins-modulos': ['Módulos do Sistema', 'Controle global + per-restaurante de todos os módulos'],
    'sec-tema-custom': ['Aparência & Tema Global', 'Estúdio de personalização de cores, botões, fontes e marcas'],
    'sec-supabase': ['Supabase', 'Conexão guiada ao banco em nuvem: backup, sync e relatórios centralizados'],
    'sec-alterar-senha': ['Alterar Senha', 'Atualize a senha de acesso ao painel super admin'],
    'sec-infra-cloud': ['Infraestrutura Cloud', 'Backup remoto R2, Redis cache, backups agendados e alertas de crash'],
    'sec-tuneis': ['Túneis & Fallback', 'Túneis de acesso externo: Cloudflare, ngrok, Localtunnel, localhost.run'],
    'sec-image-providers': ['Provedores de Imagem', 'Pool de upload de imagens: ImgBB, Cloudinary, Imgur, Custom']
  };

  for (var i = 0; i < items.length; i++) {
    var alvo = items[i].getAttribute('data-target') === targetId;
    items[i].classList.toggle('active', alvo);
  }
  for (var j = 0; j < sections.length; j++) {
    sections[j].classList.toggle('active', sections[j].id === targetId);
  }

  /* Acordeão: abre a categoria da aba ativa e recolhe as demais */
  var itemAtivo = document.querySelector('.menu-item.active');
  if (itemAtivo) {
    var catAtiva = itemAtivo.closest('.menu-categoria');
    if (catAtiva && !catAtiva.classList.contains('aberta')) {
      document.querySelectorAll('.menu-categoria.aberta').forEach(function(c) { c.classList.remove('aberta'); });
      catAtiva.classList.add('aberta');
    }
  }

  /* Persistir aba atual */
  try { 
    localStorage.setItem('super_admin_tab', targetId); 
    if (window.location.hash !== '#' + targetId) {
      history.replaceState(null, null, '#' + targetId);
    }
  } catch(e) {}
  
  /* Atualizar item ativo no bottom nav mobile */
  var mobNavItems = document.querySelectorAll('.mob-nav-item');
  mobNavItems.forEach(function(btn) {
    var isTarget = btn.getAttribute('data-target') === targetId;
    btn.classList.toggle('active', isTarget);
  });

  var earlyStyle = document.getElementById('early-tab-style');
  if (earlyStyle) earlyStyle.remove();

  /* Fechar sidebar no mobile */
  var sidebar = document.querySelector('.sidebar');
  var overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');

  var t = titles[targetId] || ['', ''];
  var titleEl = document.getElementById('panel-title');
  var subTitleEl = document.getElementById('panel-subtitle');
  if (titleEl) titleEl.textContent = t[0];
  if (subTitleEl) subTitleEl.textContent = t[1];

  window.carregarChavesOffline = function () {
    fetch('/api/super/chaves', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        const lista = document.getElementById('chaves-offline-lista');
        if (!lista) return;
        const chaves = d.chaves || [];
        if (!chaves.length) {
          lista.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem; padding:6px 4px;">Nenhuma chave emitida. Gere uma chave informando o servidor de destino.</p>';
          return;
        }
        const statusCor = { ativa: '#22c55e', usada: '#94a3b8', revogada: '#ef4444' };
        lista.innerHTML = '<div style="overflow-x:auto;"><table style="width:100%; font-size:0.78rem; border-collapse:collapse;">' +
          '<tr style="color:var(--text-muted); text-align:left;">' + ['Chave', 'Servidor', 'Status', 'Restaurante', 'Criada', 'Usada em', ''].map(h => `<th style="padding:6px 8px; font-weight:600;">${h}</th>`).join('') + '</tr>' +
          chaves.map(c => `
            <tr style="border-top:1px solid var(--border);">
              <td style="padding:7px 8px; font-family:monospace; user-select:all;">${c.chave}</td>
              <td style="padding:7px 8px;">${c.servidor_node || '-'}</td>
              <td style="padding:7px 8px;"><span style="background:${statusCor[c.status] || '#94a3b8'}22; color:${statusCor[c.status] || '#94a3b8'}; font-weight:700; padding:2px 10px; border-radius:10px; text-transform:uppercase; font-size:0.68rem;">${c.status}</span></td>
              <td style="padding:7px 8px;">${c.restaurante_nome || '-'}</td>
              <td style="padding:7px 8px; white-space:nowrap;">${c.criada_em || '-'}</td>
              <td style="padding:7px 8px; white-space:nowrap;">${c.usada_em || '-'}</td>
              <td style="padding:7px 8px;">${c.status === 'ativa' ? `<button onclick="revogarChaveOffline(${c.id})" title="Revogar" style="color:#ef4444; background:none; border:none; cursor:pointer;"><i class="fa-solid fa-ban"></i></button>` : ''}</td>
            </tr>`).join('') +
          '</table></div>';
      })
      .catch(() => {});
  };

  window.gerarChaveOffline = function () {
    const input = document.getElementById('chave-servidor');
    const servidor = input ? input.value.trim() : '';
    if (!servidor) return alert('Informe o servidor/nó de destino da chave.');
    fetch('/api/super/chaves', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ servidor_node: servidor })
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          if (input) input.value = '';
          carregarChavesOffline();
          alert('✅ Chave gerada:\n\n' + d.chave + '\n\nEnvie ao cliente para usar no cadastro — ele entrará no servidor "' + d.servidor_node + '" com modo Offline-First.');
        } else alert(d.erro || 'Erro ao gerar chave.');
      })
      .catch(() => alert('Erro de conexão.'));
  };

  window.revogarChaveOffline = function (id) {
    if (!confirm('Revogar esta chave? Ela não poderá mais ser usada.')) return;
    fetch('/api/super/chaves/' + id + '/revogar', {
      method: 'POST',
      headers: authHeaders()
    })
      .then(r => r.json())
      .then(d => { if (!d.ok) alert(d.erro || 'Erro.'); carregarChavesOffline(); })
      .catch(() => {});
  };


  if (targetId === 'sec-dash') carregarDashboard();
  else if (targetId === 'sec-bi') carregarBiFranquias();
  else if (targetId === 'sec-restaurantes') { carregarRestaurantes(); carregarChavesOffline(); }
  else if (targetId === 'sec-usuarios') carregarUsuarios();
  else if (targetId === 'sec-servidor') { carregarServidor(); carregarCerts(); }
  else if (targetId === 'sec-mensagens') carregarMensagens();
  else if (targetId === 'sec-tema-custom') { carregarTemaCustomGlobal(); carregarTemasLista(); }
  else if (targetId === 'sec-logs') carregarLogs(0);
  else if (targetId === 'sec-config') carregarConfig();
  else if (targetId === 'sec-licencas') carregarLicencas();
   else if (targetId === 'sec-clientes') carregarClientes();
   else if (targetId === 'sec-suporte') carregarSuporte();
   else if (targetId === 'sec-funcoes') { renderFuncoes(); carregarSolicitacoesFeatures(); }
   else if (targetId === 'sec-features-restaurante') renderFeaturesRestaurante();
   else if (targetId === 'sec-dominios') renderDominios();
   else if (targetId === 'sec-capacidade') renderCapacidade();
   else if (targetId === 'sec-mapa') renderMapa();
   else if (targetId === 'sec-load-control') renderLoadControl();
   else if (targetId === 'sec-terminal') { resetInactivityTimer(); popularAlvosTerminal(); }
   else if (targetId === 'sec-instancias') carregarInstancias();
   else if (targetId === 'sec-recuperar-acesso') carregarUsuariosRecovery();
   else if (targetId === 'sec-tarefas') { if (typeof carregarTarefas === 'function') carregarTarefas(); }
   else if (targetId === 'sec-site-vendas') carregarSiteVendas();
   else if (targetId === 'sec-afiliados') carregarAfiliados();
   else if (targetId === 'sec-seguranca-waf') carregarConfigSeguranca();
   else if (targetId === 'sec-deploy-updates') { carregarCommitsGit(); carregarGitStatus(); }
   else if (targetId === 'sec-plugins-modulos') carregarPlugins();
   else if (targetId === 'sec-supabase') carregarSupabase();
   else if (targetId === 'sec-infra-cloud') carregarInfraCloud();
   else if (targetId === 'sec-tuneis') carregarTuneis();
   else if (targetId === 'sec-image-providers') carregarImageProviders();
   else if (targetId === 'sec-notificacoes') carregarCentralNotificacoes();
}

/* ═══ SUPABASE — ASSISTENTE GUIADO ═══ */
function carregarSupabase() {
  apiGet('/api/super/supabase-config', function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao carregar configuração do Supabase.', 'error'); return; }
    var c = data.config || {};
    document.getElementById('supabase-url').value = c.url || '';
    document.getElementById('supabase-anon-key').value = c.anon_key || '';
    document.getElementById('supabase-service-key').value = '';
    document.getElementById('supabase-service-key').placeholder = c.service_role_key ? '•••••••••• (salva) — digite para substituir' : '••••••••••••••••';
    document.getElementById('supabase-enabled').checked = c.enabled === 'true';
    atualizarBadgeSupabase(c.enabled === 'true');
  });
}

function atualizarBadgeSupabase(ativo) {
  var badge = document.getElementById('supabase-status-badge');
  if (!badge) return;
  badge.style.display = ativo ? 'inline-block' : 'none';
}

window.testarSupabase = function() {
  var url = document.getElementById('supabase-url').value.trim();
  var anon = document.getElementById('supabase-anon-key').value.trim();
  var box = document.getElementById('supabase-test-resultado');
  box.style.display = 'block';
  box.style.background = 'rgba(59,130,246,0.12)';
  box.style.color = '#93c5fd';
  box.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testando conexão...';
  apiPost('/api/super/supabase-test', { url: url, anon_key: anon }, function(err, data) {
    if (err || !data || !data.ok) {
      var erro = data ? data.erro : (err || 'Erro de conexão');
      box.style.background = 'rgba(239,68,68,0.12)';
      box.style.color = '#fca5a5';
      box.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Falha: ' + escapeHtml(String(erro));
      return;
    }
    box.style.background = 'rgba(34,197,94,0.12)';
    box.style.color = '#86efac';
    box.innerHTML = '<i class="fa-solid fa-circle-check"></i> Conexão estabelecida! Agora salve a configuração.';
  });
};

window.salvarSupabase = function() {
  var url = document.getElementById('supabase-url').value.trim();
  var anon = document.getElementById('supabase-anon-key').value.trim();
  var service = document.getElementById('supabase-service-key').value.trim();
  var enabled = document.getElementById('supabase-enabled').checked;
  if (!url || !anon) { showToast('URL e Anon Key são obrigatórios.', 'warning'); return; }
  apiPost('/api/super/supabase-config', { url: url, anon_key: anon, service_role_key: service, enabled: enabled }, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao salvar: ' + (data ? data.erro : err), 'error'); return; }
    showToast('Configuração do Supabase salva!', 'success');
    atualizarBadgeSupabase(enabled);
    document.getElementById('supabase-service-key').value = '';
    document.getElementById('supabase-service-key').placeholder = service ? '•••••••••• (salva) — digite para substituir' : '••••••••••••••••';
  });
};

/* ═══ DEPLOY ZERO-DOWNTIME & COMMITS ═══ */
function corDotCommit(status) {
  if (status === 'estavel') return '#22c55e';
  if (status === 'quebrado') return '#ef4444';
  return '#64748b';
}

window.carregarCommitsGit = function() {
  apiGet('/api/super/commits', function(err, data) {
    var tbody = document.getElementById('commits-tbody');
    if (!tbody) return;
    if (err || !data || !data.ok) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:20px;">Falha ao carregar commits: ' + (data ? data.erro : 'Erro de conexão') + '</td></tr>';
      return;
    }
    var list = data.commits || [];
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhum commit encontrado no histórico.</td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var dotTitle = c.status === 'estavel' ? 'Versão estável' : (c.status === 'quebrado' ? 'Quebrado (problema reportado)' : 'Sem marcação');
      var notaInput = '<input id="commit-nota-' + escapeHtml(c.hash) + '" type="text" value="' + escapeHtml(c.nota || '') + '" placeholder="Nota rápida..." ' +
        'style="width:100%;margin-top:6px;padding:5px 8px;border-radius:8px;border:1px solid var(--border-color);background:rgba(255,255,255,0.06);color:var(--text-primary);font-size:11.5px;" ' +
        'onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}" onchange="salvarCommitNota(\'' + escapeHtml(c.hash) + '\', this.value)" />';
      html += '<tr>' +
        '<td><code style="background:rgba(255,255,255,0.1);padding:4px 8px;border-radius:6px;color:#a855f7;">' + escapeHtml(c.hash) + '</code></td>' +
        '<td style="font-weight:600;color:white;">' + escapeHtml(c.mensagem) + notaInput + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<div style="display:flex;align-items:center;gap:7px;">' +
            '<span id="commit-dot-' + escapeHtml(c.hash) + '" title="' + dotTitle + '" style="width:12px;height:12px;border-radius:50%;flex-shrink:0;display:inline-block;background:' + corDotCommit(c.status) + ';box-shadow:0 0 6px ' + corDotCommit(c.status) + '66;"></span>' +
            '<button title="Marcar como estável" onclick="marcarCommitStatus(\'' + escapeHtml(c.hash) + '\',\'estavel\')" style="padding:3px 9px;border-radius:6px;border:1px solid #22c55e;background:' + (c.status === 'estavel' ? '#22c55e' : 'transparent') + ';color:' + (c.status === 'estavel' ? '#fff' : '#22c55e') + ';cursor:pointer;font-size:11px;font-weight:700;">✓ Estável</button>' +
            '<button title="Marcar como quebrado" onclick="marcarCommitStatus(\'' + escapeHtml(c.hash) + '\',\'quebrado\')" style="padding:3px 9px;border-radius:6px;border:1px solid #ef4444;background:' + (c.status === 'quebrado' ? '#ef4444' : 'transparent') + ';color:' + (c.status === 'quebrado' ? '#fff' : '#ef4444') + ';cursor:pointer;font-size:11px;font-weight:700;">✕ Quebrado</button>' +
          '</div>' +
        '</td>' +
        '<td><small style="color:var(--text-muted);">' + escapeHtml(c.autor) + '</small></td>' +
        '<td><small style="color:var(--text-muted);">' + escapeHtml(c.data) + '</small></td>' +
        '<td>' +
          '<div style="display:flex;flex-direction:column;gap:5px;">' +
            '<button class="btn-action btn-primary-action" style="padding:4px 10px;font-size:0.8rem;background:#22c55e;" onclick="efetuarDeployHotSwap(\'' + escapeHtml(c.hash) + '\')">' +
              '<i class="fa-solid fa-rocket"></i> Completo' +
            '</button>' +
            '<button class="btn-action" style="padding:4px 10px;font-size:0.78rem;background:rgba(56,189,248,0.15);color:#7dd3fc;border:1px solid rgba(56,189,248,0.35);" onclick="efetuarDeployParcial(\'' + escapeHtml(c.hash) + '\')" title="Aplica só este commit, sem reiniciar o servidor">' +
              '<i class="fa-solid fa-bolt"></i> Parcial (hot swap)' +
            '</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }
    tbody.innerHTML = html;
  });
};

window.marcarCommitStatus = function(hash, status) {
  apiPost('/api/super/commits/meta', { hash: hash, status: status }, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao marcar commit: ' + (data ? data.erro : 'Erro de conexão'), 'danger');
      return;
    }
    showToast(status === 'estavel' ? 'Commit marcado como versão estável ✓' : 'Commit marcado como quebrado ✕', status === 'estavel' ? 'success' : 'warning');
    carregarCommitsGit();
  });
};

window.salvarCommitNota = function(hash, nota) {
  apiPost('/api/super/commits/meta', { hash: hash, nota: nota }, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao salvar nota: ' + (data ? data.erro : 'Erro de conexão'), 'danger');
      return;
    }
    showToast('Nota salva.', 'success');
  });
};

window.efetuarDeployHotSwap = function(hash) {
  if (!confirm('Deseja aplicar o deploy em tempo de execução (Zero-Downtime Hot Swap) para o commit ' + hash + '?')) return;
  apiPost('/api/super/deploy-commit', { hash: hash }, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao realizar deploy: ' + (data ? data.erro : 'Erro de conexão'), 'danger');
      return;
    }
    showToast(data.mensagem || 'Deploy Zero-Downtime realizado com sucesso!', 'success');
    carregarCommitsGit();
  });
};

/* ═══ GIT: CONEXÃO, PULL & AUTO-DEPLOY ═══ */
function gitResultado(html, tipo) {
  var box = document.getElementById('git-op-resultado');
  if (!box) return;
  box.style.display = 'block';
  var bg = tipo === 'erro' ? 'rgba(239,68,68,0.12)' : (tipo === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(59,130,246,0.12)');
  var cor = tipo === 'erro' ? '#fca5a5' : (tipo === 'ok' ? '#86efac' : '#93c5fd');
  box.style.background = bg;
  box.style.color = cor;
  box.innerHTML = html;
}

window.carregarGitStatus = function() {
  apiGet('/api/super/git/status', function(err, data) {
    var linha = document.getElementById('git-status-linha');
    if (!linha) return;
    if (err || !data || !data.ok) { linha.innerHTML = '<span style="color:#f87171;">Não foi possível ler o status Git.</span>'; return; }
    var conectado = data.conectado;
    linha.innerHTML =
      '<i class="fa-solid ' + (conectado ? 'fa-circle-check" style="color:#22c55e;' : 'fa-circle-xmark" style="color:#f87171;') + '"></i> '
      + (conectado ? 'Conectado' : 'Sem remote configurado')
      + ' · Branch: <strong style="color:#e2e8f0;">' + escapeHtml(data.branch) + '</strong>'
      + (conectado ? ' · <small style="font-family:monospace;">' + escapeHtml(data.remote_url) + '</small>' : '')
      + (data.behind != null && data.behind > 0 ? ' · <strong style="color:#fbbf24;">' + data.behind + ' commit(s) atrás do remoto</strong>' : '')
      + (data.auto_deploy && data.auto_deploy.enabled ? ' · <span style="color:#34d399;">auto-deploy ON (' + data.auto_deploy.intervalo_min + ' min)</span>' : '');
    var input = document.getElementById('git-remote-url');
    if (input && data.remote_url && !input.value) input.value = data.remote_url;
    var chk = document.getElementById('git-auto-enabled');
    var sel = document.getElementById('git-auto-intervalo');
    if (chk && data.auto_deploy) chk.checked = !!data.auto_deploy.enabled;
    if (sel && data.auto_deploy) sel.value = String(data.auto_deploy.intervalo_min || 30);
  });
};

window.conectarGit = function() {
  var url = document.getElementById('git-remote-url').value.trim();
  if (!url) { showToast('Informe a URL ou caminho de rede.', 'warning'); return; }
  gitResultado('<i class="fa-solid fa-spinner fa-spin"></i> Conectando ao repositório...', '');
  apiPost('/api/super/git/conectar', { url: url }, function(err, data) {
    if (err || !data || !data.ok) { gitResultado('✕ ' + escapeHtml(data ? data.erro : 'Erro de conexão'), 'erro'); return; }
    gitResultado('<i class="fa-solid fa-circle-check"></i> ' + escapeHtml(data.mensagem), 'ok');
    carregarGitStatus();
  });
};

window.buscarCommitsRemotos = function() {
  gitResultado('<i class="fa-solid fa-spinner fa-spin"></i> Buscando novidades no remoto...', '');
  apiPost('/api/super/git/fetch', {}, function(err, data) {
    if (err || !data || !data.ok) { gitResultado('✕ ' + escapeHtml(data ? data.erro : 'Erro de conexão'), 'erro'); return; }
    gitResultado('<i class="fa-solid fa-circle-info"></i> ' + escapeHtml(data.mensagem), 'info');
    carregarGitStatus();
  });
};

window.puxarAtualizacoes = function() {
  gitResultado('<i class="fa-solid fa-spinner fa-spin"></i> Puxando commits...', '');
  apiPost('/api/super/git/pull', {}, function(err, data) {
    if (err || !data || !data.ok) { gitResultado('✕ ' + escapeHtml(data ? data.erro : 'Erro de conexão'), 'erro'); return; }
    gitResultado('<i class="fa-solid fa-circle-check"></i> ' + escapeHtml(data.mensagem), 'ok');
    carregarGitStatus();
    carregarCommitsGit();
  });
};

window.salvarAutoDeployGit = function() {
  var enabled = document.getElementById('git-auto-enabled').checked;
  var intervalo = parseInt(document.getElementById('git-auto-intervalo').value, 10) || 30;
  apiPost('/api/super/git/auto-deploy', { enabled: enabled, intervalo_min: intervalo }, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao salvar auto-deploy.', 'danger'); return; }
    showToast(data.mensagem || 'Auto-deploy configurado!', 'success');
    carregarGitStatus();
  });
};

window.efetuarDeployParcial = function(hash) {
  if (!confirm('Aplicar SOMENTE os arquivos deste commit?\n\n• Front-end (telas): entra no ar na hora, SEM reiniciar.\n• Backend: será aplicado e avisado que precisa de reinício.')) return;
  apiPost('/api/super/git/deploy-parcial', { hash: hash }, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro no deploy parcial: ' + (data ? data.erro : 'Erro de conexão'), 'danger');
      return;
    }
    showToast(data.mensagem || 'Deploy parcial aplicado!', 'success');
    carregarCommitsGit();
  });
};

window._modulosView = 'cards';
window._modulosData = [];
window._modulosOverrides = {};
window._restaurantes = [];

window.setModulosView = function(view) {
  window._modulosView = view;
  document.getElementById('modulos-cards-view').style.display = view === 'cards' ? '' : 'none';
  document.getElementById('modulos-matrix-view').style.display = view === 'matrix' ? '' : 'none';
  document.getElementById('btn-view-cards').className = 'btn-action' + (view === 'cards' ? ' active' : '');
  document.getElementById('btn-view-cards').style.background = view === 'cards' ? '#a855f7' : 'var(--bg-card)';
  document.getElementById('btn-view-cards').style.color = view === 'cards' ? 'white' : 'var(--text-primary)';
  document.getElementById('btn-view-matrix').className = 'btn-action' + (view === 'matrix' ? ' active' : '');
  document.getElementById('btn-view-matrix').style.background = view === 'matrix' ? '#a855f7' : 'var(--bg-card)';
  document.getElementById('btn-view-matrix').style.color = view === 'matrix' ? 'white' : 'var(--text-primary)';
  if (view === 'matrix') carregarMatrizModulos();
};

window.filtrarModulos = function(q) {
  var cards = document.querySelectorAll('#modulos-grid > div');
  var lower = (q || '').toLowerCase();
  cards.forEach(function(card) {
    var text = (card.textContent || '').toLowerCase();
    card.style.display = text.indexOf(lower) !== -1 ? '' : 'none';
  });
};

window.toggleModuloGlobal = function(moduloId, btn) {
  var isActive = btn.dataset.ativo === '1';
  apiPost('/api/super/modulos/global', { modulo_id: moduloId, ativo: !isActive }, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro: ' + (data ? data.erro : 'Conexão'), 'danger');
      return;
    }
    btn.dataset.ativo = (!isActive) ? '1' : '0';
    btn.textContent = (!isActive) ? 'Ativo' : 'Inativo';
    btn.className = 'badge ' + (!isActive ? 'badge-ativo' : 'badge-bloqueado');
    showToast(moduloId + ' ' + (!isActive ? 'ativado' : 'desativado') + ' globalmente.', 'success');
  });
};

window.toggleModuloTenant = function(restauranteId, moduloId, checked) {
  apiPost('/api/super/modulos/tenant', { restaurante_id: restauranteId, modulo_id: moduloId, ativo: checked }, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao alterar módulo: ' + (data ? data.erro : 'Conexão'), 'danger');
      return;
    }
    showToast(moduloId + (checked ? ' ativado' : ' desativado') + ' para Restaurante #' + restauranteId, 'success');
  });
};

function carregarModulos() {
  apiGet('/api/super/modulos', function(err, data) {
    if (err || !data || !data.ok) return;
    window._modulosData = data.modulos || [];
    window._modulosOverrides = data.overrides || {};
    renderizarModulosCards();
  });
}

function carregarRestaurantesModulos(cb) {
  apiGet('/api/super/restaurantes', function(err, data) {
    if (!err && data && data.ok) {
      window._restaurantes = (data.restaurantes || []).filter(function(r) { return r.ativo !== 0; });
    }
    if (cb) cb();
  });
}

function renderizarModulosCards() {
  var grid = document.getElementById('modulos-grid');
  if (!grid) return;
  var modulos = window._modulosData;
  var html = '';
  modulos.forEach(function(m) {
    var tipoLabel = m.tipo === 'system' ? 'Sistema' : m.tipo === 'plugin' ? 'Plugin' : m.tipo === 'segment' ? 'Segmento' : 'Feature';
    var tipoColor = m.tipo === 'system' ? '#6b7280' : m.tipo === 'plugin' ? '#a855f7' : m.tipo === 'segment' ? '#f59e0b' : '#3b82f6';
    var ativoBadge = m.ativo_global ? '<span class="badge badge-ativo" id="mod-status-' + m.modulo_id + '">Ativo</span>'
      : '<span class="badge badge-bloqueado" id="mod-status-' + m.modulo_id + '">Inativo</span>';
    var obrigTag = m.obrigatorios ? ' <span style="font-size:0.7rem;color:#ef4444;">(obrigatório)</span>' : '';
    var toggleBtn = m.obrigatorios ? ''
      : '<button class="btn-action" style="width:100%;background:' + tipoColor + ';color:white;margin-top:8px;" '
        + 'onclick="toggleModuloGlobal(\'' + m.modulo_id + '\', this)" '
        + 'data-ativo="' + (m.ativo_global ? '1' : '0') + '">'
        + '<i class="fa-solid fa-sliders"></i> ' + (m.ativo_global ? 'Ativo' : 'Inativo') + '</button>';
    html += '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:1.2rem;display:flex;flex-direction:column;justify-content:space-between;" data-modulo="' + m.modulo_id + '">'
      + '<div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      + '<i class="fa-solid ' + (m.icone || 'fa-puzzle-piece') + '" style="font-size:22px;color:' + tipoColor + ';"></i>'
      + '<span style="font-size:0.7rem;padding:3px 8px;border-radius:8px;background:' + tipoColor + '22;color:' + tipoColor + ';">' + tipoLabel + '</span>'
      + '</div>'
      + '<h4 style="margin:0 0 4px 0;font-size:1rem;">' + (m.nome || m.modulo_id) + obrigTag + '</h4>'
      + '<p style="font-size:0.8rem;color:var(--text-muted);margin:0;">' + (m.descricao || '') + '</p>'
      + '</div>'
      + toggleBtn
      + '</div>';
  });
  grid.innerHTML = html;
}

function carregarMatrizModulos() {
  carregarRestaurantesModulos(function() {
    var modulos = window._modulosData.filter(function(m) { return !m.obrigatorios; });
    var restaurantes = window._restaurantes;
    var overrides = window._modulosOverrides;

    // Header
    var header = document.getElementById('modulos-matrix-header');
    var headerHtml = '<th style="text-align:left;padding:10px;position:sticky;left:0;background:var(--bg-card);z-index:2;min-width:180px;">Restaurante</th>';
    modulos.forEach(function(m) {
      headerHtml += '<th style="padding:10px;text-align:center;min-width:90px;white-space:nowrap;">'
        + '<i class="fa-solid ' + (m.icone || 'fa-puzzle-piece') + '" style="color:' + (m.tipo === 'plugin' ? '#a855f7' : m.tipo === 'segment' ? '#f59e0b' : '#3b82f6') + ';"></i><br>'
        + '<span style="font-size:0.75rem;">' + m.nome + '</span></th>';
    });
    header.innerHTML = headerHtml;

    // Body
    var body = document.getElementById('modulos-matrix-body');
    var bodyHtml = '';
    restaurantes.forEach(function(r) {
      bodyHtml += '<tr>';
      bodyHtml += '<td style="padding:8px 10px;border-bottom:1px solid var(--border-color);position:sticky;left:0;background:var(--bg-card);z-index:1;font-weight:500;">'
        + (r.nome || 'Restaurante #' + r.id) + '</td>';
      modulos.forEach(function(m) {
        var over = overrides[r.id] && overrides[r.id][m.modulo_id];
        var isOn = over !== undefined ? over === 1 : m.ativo_global === 1;
        var hasOverride = over !== undefined;
        var label = isOn ? '✓' : '✕';
        var color = isOn ? '#22c55e' : '#ef4444';
        var style = 'cursor:pointer;padding:6px 12px;border-radius:8px;border:none;font-size:0.9rem;font-weight:600;'
          + 'background:' + color + '18;color:' + color + ';transition:all 0.2s;';
        bodyHtml += '<td style="padding:6px;text-align:center;border-bottom:1px solid var(--border-color);">';
        bodyHtml += '<button style="' + style + '" onclick="toggleModuloTenant(' + r.id + ',\'' + m.modulo_id + '\',' + !isOn + ')">';
        bodyHtml += label + (hasOverride ? '<span style="font-size:0.6rem;">*</span>' : '');
        bodyHtml += '</button></td>';
      });
      bodyHtml += '</tr>';
    });
    body.innerHTML = bodyHtml;
  });
}

window.carregarPlugins = carregarModulos;

/* ═══ DASHBOARD ═══ */
function carregarDashboard() {
  apiGet('/api/super/dashboard-stats', function(err, data) {
    if (err || !data || !data.ok) return;
    var s = data.stats;
    setText('stat-ativas', s.ativas || 0);
    setText('stat-trials', s.trials || 0);
    setText('stat-expiradas', s.expiradas || 0);
    setText('stat-bloqueadas', s.bloqueadas || 0);

    var vendasEl = document.getElementById('stat-vendas-locais');
    var usersEl = document.getElementById('stat-usuarios-locais');
    if (vendasEl) {
      vendasEl.textContent = 'R$ ' + formatMoney(s.totalSales || 0);
      document.getElementById('card-local-sales').style.display = '';
    }
    if (usersEl) {
      usersEl.textContent = s.usuarios || 0;
      document.getElementById('card-local-users').style.display = '';
    }
  });

  apiGet('/api/super/restaurantes', function(err, data) {
    if (err || !data || !data.ok) return;
    var tbody = document.getElementById('recent-installations-table');
    if (!tbody) return;
    var tbodyEl = tbody.querySelector('tbody') || tbody;
    var rows = (data.clients || []).slice(0, 6);
    if (rows.length === 0) {
      tbodyEl.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Nenhum restaurante registrado.</td></tr>';
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      html += '<tr>';
      html += '<td><div style="font-weight:600;color:white;">' + esc(r.restaurante) + '</div><small style="color:var(--text-muted);">ID: ' + r.id + '</small></td>';
      html += '<td><span class="badge badge-' + r.status + '">' + r.status + '</span></td>';
      html += '<td><small>' + esc(r.ip || 'Local') + '</small></td>';
      html += '<td><small style="font-family:monospace;">' + esc(r.versao || '--') + '</small></td>';
      html += '<td><small>' + (r.ultimaVer ? new Date(r.ultimaVer).toLocaleDateString('pt-BR') : '--') + '</small></td>';
      html += '</tr>';
    }
    tbodyEl.innerHTML = html;
  });
}

/* ═══ BI / FRANQUIAS ═══ */
function carregarBiFranquias() {
  var sel = document.getElementById('bi-periodo');
  var dias = (sel && sel.value) || '30';
  apiGet('/api/super/bi-franquias?dias=' + dias, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao carregar BI', 'danger');
      setText('bi-total-vendas', '--');
      setText('bi-total-pedidos', '--');
      setText('bi-ticket-medio', '--');
      setText('bi-qtd-rest', '--');
      var tbody = document.getElementById('bi-ranking-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Nenhum dado disponível.</td></tr>';
      return;
    }
    setText('bi-total-vendas', 'R$ ' + formatMoney(data.total_vendas || 0));
    setText('bi-total-pedidos', data.total_pedidos || 0);
    setText('bi-ticket-medio', 'R$ ' + formatMoney(data.ticket_medio_geral || 0));
    setText('bi-qtd-rest', data.qtd_restaurantes || 0);

    var ranking = data.ranking || [];
    var tbody = document.getElementById('bi-ranking-tbody');
    if (!tbody) return;
    if (ranking.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Sem vendas no período selecionado.</td></tr>';
      return;
    }
    var html = '';
    var max = ranking[0] ? ranking[0].total_vendas : 0;
    for (var i = 0; i < ranking.length; i++) {
      var r = ranking[i];
      var pct = max > 0 ? Math.round((r.total_vendas / max) * 100) : 0;
      var pctGeral = data.total_vendas > 0 ? ((r.total_vendas / data.total_vendas) * 100).toFixed(1) : '0.0';
      html += '<tr>';
      html += '<td><strong>' + (i + 1) + '</strong></td>';
      html += '<td><div style="font-weight:600;color:white;">' + esc(r.nome) + '</div><small style="color:var(--text-muted);">ID: ' + r.id + '</small></td>';
      html += '<td style="font-weight:700;color:#4ade80;">R$ ' + formatMoney(r.total_vendas) + '</td>';
      html += '<td>' + r.pedidos + '</td>';
      html += '<td>R$ ' + formatMoney(r.ticket_medio) + '</td>';
      html += '<td>';
      html += '<div style="background:rgba(255,255,255,.08);border-radius:6px;height:10px;overflow:hidden;">';
      html += '<div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#4ade80,#22d3ee);"></div>';
      html += '</div>';
      html += '<small style="color:var(--text-muted);">' + pctGeral + '% do total</small>';
      html += '</td>';
      html += '<td><button class="btn-action" style="padding:.4rem .7rem;font-size:11px;" onclick="toggleBiDetalhe(' + escJs(r.id) + ')"><i class="fa-solid fa-chart-simple"></i> Detalhes</button></td>';
      html += '</tr>';

      html += '<tr id="bi-detalhe-' + r.id + '" style="display:none;background:rgba(255,255,255,.03);">';
      html += '<td colspan="7" style="padding:1rem;">';
      html += '<div style="display:flex;flex-wrap:wrap;gap:2rem;">';

      html += '<div style="flex:1;min-width:260px;">';
      html += '<h4 style="font-family:\'Outfit\',sans-serif;margin-bottom:.6rem;color:#22d3ee;">Vendas por dia</h4>';
      var maxDia = 1;
      for (var d = 0; d < r.vendas_por_dia.length; d++) if (parseFloat(r.vendas_por_dia[d].total) > maxDia) maxDia = parseFloat(r.vendas_por_dia[d].total);
      var diasHtml = '';
      for (var d2 = 0; d2 < r.vendas_por_dia.length; d2++) {
        var vd = r.vendas_por_dia[d2];
        var p = maxDia > 0 ? Math.round((parseFloat(vd.total) / maxDia) * 100) : 0;
        var label = vd.dia ? vd.dia.slice(5) : '';
        diasHtml += '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem;">';
        diasHtml += '<small style="width:50px;color:var(--text-muted);">' + esc(label) + '</small>';
        diasHtml += '<div style="flex:1;background:rgba(255,255,255,.08);border-radius:4px;height:8px;overflow:hidden;">';
        diasHtml += '<div style="width:' + Math.max(2, p) + '%;height:100%;background:linear-gradient(90deg,#22d3ee,#818cf8);"></div>';
        diasHtml += '</div>';
        diasHtml += '<small style="width:80px;text-align:right;color:white;">R$ ' + formatMoney(parseFloat(vd.total)) + '</small>';
        diasHtml += '</div>';
      }
      html += diasHtml || '<small style="color:var(--text-muted);">Sem dados</small>';
      html += '</div>';

      html += '<div style="flex:1;min-width:220px;">';
      html += '<h4 style="font-family:\'Outfit\',sans-serif;margin-bottom:.6rem;color:#22d3ee;">Top Produtos</h4>';
      var topHtml = '';
      for (var t = 0; t < r.top_produtos.length; t++) {
        var tp = r.top_produtos[t];
        topHtml += '<div style="display:flex;justify-content:space-between;padding:.25rem 0;border-bottom:1px solid rgba(255,255,255,.05);">';
        topHtml += '<small style="color:white;">' + esc(tp.nome) + ' <span style="color:var(--text-muted);">×' + tp.qtd + '</span></small>';
        topHtml += '<small style="color:#4ade80;">R$ ' + formatMoney(parseFloat(tp.total)) + '</small>';
        topHtml += '</div>';
      }
      html += topHtml || '<small style="color:var(--text-muted);">Sem dados</small>';
      html += '</div>';

      html += '<div style="flex:1;min-width:180px;">';
      html += '<h4 style="font-family:\'Outfit\',sans-serif;margin-bottom:.6rem;color:#22d3ee;">Por Setor</h4>';
      var setHtml = '';
      for (var s = 0; s < r.setores.length; s++) {
        var st = r.setores[s];
        setHtml += '<div style="display:flex;justify-content:space-between;padding:.25rem 0;border-bottom:1px solid rgba(255,255,255,.05);">';
        setHtml += '<small style="color:white;">' + esc(st.setor || 'Geral') + '</small>';
        setHtml += '<small style="color:#4ade80;">R$ ' + formatMoney(parseFloat(st.total)) + '</small>';
        setHtml += '</div>';
      }
      html += setHtml || '<small style="color:var(--text-muted);">Sem dados</small>';
      html += '</div>';

      html += '</div>';
      html += '</td>';
      html += '</tr>';
    }
    tbody.innerHTML = html;
  });
}

function toggleBiDetalhe(id) {
  var tr = document.getElementById('bi-detalhe-' + id);
  if (tr) tr.style.display = tr.style.display === 'none' ? 'table-row' : 'none';
}

document.addEventListener('DOMContentLoaded', function() {
  var sel = document.getElementById('bi-periodo');
  if (sel) sel.addEventListener('change', carregarBiFranquias);
  var btn = document.getElementById('btn-bi-atualizar');
  if (btn) btn.addEventListener('click', carregarBiFranquias);
});

/* ═══ RESTAURANTES ═══ */
function carregarRestaurantes() {
  apiGet('/api/super/restaurantes', function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao carregar restaurantes', 'danger');
      return;
    }
    restaurantesData = data.clients || [];
    renderRestaurantes();
    popularAlvosTerminal();
  });
}

// Popula o select de dispositivos com os valores existentes na base
function popularFiltroDispositivosRestaurantes() {
  var sel = document.getElementById('rest-f-dispositivo');
  if (!sel) return;
  var atual = sel.value;
  var vistos = {};
  var opts = '<option value="">Todo dispositivo</option>';
  for (var i = 0; i < restaurantesData.length; i++) {
    var d = restaurantesData[i].dispositivo_ultimo;
    if (d && !vistos[d]) { vistos[d] = true; opts += '<option value="' + esc(d) + '">' + esc(d) + '</option>'; }
  }
  sel.innerHTML = opts;
  sel.value = atual;
}

function renderRestaurantes() {
  var search = (document.getElementById('rest-search').value || '').toLowerCase();
  var filter = document.getElementById('rest-filter-status').value;
  // Filtros inteligentes
  var fDe = (document.getElementById('rest-f-de') || {}).value || '';
  var fAte = (document.getElementById('rest-f-ate') || {}).value || '';
  var fEndereco = ((document.getElementById('rest-f-endereco') || {}).value || '').toLowerCase();
  var fBairro = ((document.getElementById('rest-f-bairro') || {}).value || '').toLowerCase();
  var fCidade = ((document.getElementById('rest-f-cidade') || {}).value || '').toLowerCase();
  var fValor = parseFloat((document.getElementById('rest-f-valor') || {}).value) || 0;
  var fPlano = (document.getElementById('rest-f-plano') || {}).value || '';
  var fDisp = (document.getElementById('rest-f-dispositivo') || {}).value || '';
  popularFiltroDispositivosRestaurantes();

  var filtered = [];
  for (var i = 0; i < restaurantesData.length; i++) {
    var r = restaurantesData[i];
    if (search && r.restaurante.toLowerCase().indexOf(search) === -1 && String(r.id).indexOf(search) === -1 && (r.dono_nome || '').toLowerCase().indexOf(search) === -1 && (r.telefone || '').indexOf(search) === -1) continue;
    if (filter && r.status !== filter) continue;
    // Inteligência
    if (fPlano && String(r.plano || '').toLowerCase() !== fPlano) continue;
    if (fEndereco && (r.endereco || '').toLowerCase().indexOf(fEndereco) === -1) continue;
    if (fBairro && (r.bairro || '').toLowerCase().indexOf(fBairro) === -1) continue;
    if (fCidade && (r.cidade || '').toLowerCase().indexOf(fCidade) === -1) continue;
    if (fValor && (parseFloat(r.vendas_total) || 0) < fValor) continue;
    if (fDisp && (r.dispositivo_ultimo || '') !== fDisp) continue;
    if (fDe || fAte) {
      var dCad = r.ultimaVer ? new Date(String(r.ultimaVer).replace(' ', 'T')) : null;
      if (!dCad || isNaN(dCad.getTime())) continue;
      var dia = dCad.toISOString().slice(0, 10);
      if (fDe && dia < fDe) continue;
      if (fAte && dia > fAte) continue;
    }
    filtered.push(r);
  }
  var tbody = document.getElementById('restaurantes-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Nenhum restaurante encontrado.</td></tr>';
    return;
  }
  var html = '';
  for (var j = 0; j < filtered.length; j++) {
    var r2 = filtered[j];
    var donoInfo = '';
    if (r2.dono_nome || r2.telefone || r2.dono_email || r2.cidade || r2.dispositivo_ultimo) {
      donoInfo = '<div style="margin-top:4px;font-size:0.78rem;color:var(--text-muted);display:flex;flex-direction:column;gap:2px;">' +
        (r2.dono_nome ? '<span><i class="fa-solid fa-user" style="color:var(--primary);width:14px;"></i> ' + esc(r2.dono_nome) + '</span>' : '') +
        (r2.telefone ? '<span><i class="fa-solid fa-phone" style="color:#10b981;width:14px;"></i> ' + esc(r2.telefone) + '</span>' : '') +
        (r2.dono_email ? '<span><i class="fa-solid fa-envelope" style="color:#60a5fa;width:14px;"></i> ' + esc(r2.dono_email) + '</span>' : '') +
        ((r2.cidade || r2.bairro) ? '<span><i class="fa-solid fa-location-dot" style="color:#ef4444;width:14px;"></i> ' + esc([r2.cidade, r2.bairro].filter(Boolean).join(' · ')) + '</span>' : '') +
        (r2.dispositivo_ultimo ? '<span><i class="fa-solid fa-mobile-screen" style="color:#a78bfa;width:14px;"></i> ' + esc(r2.dispositivo_ultimo) + '</span>' : '') +
        '</div>';
    }

    html += '<tr>';
    html += '<td><small style="font-family:monospace;">#' + r2.id + '</small></td>';
    html += '<td><div style="font-weight:600;color:white;">' + esc(r2.restaurante) + '</div>' + donoInfo + (r2.login_mode === 'single' ? '<div><span class="badge badge-plano" style="background:#7c3aed;color:#fff;">login único</span></div>' : '') + '</td>';
    html += '<td><span class="badge badge-plano">' + esc(r2.plano) + '</span></td>';
    html += '<td><span class="badge badge-' + r2.status + '">' + r2.status + '</span></td>';
    html += '<td style="text-align:center;">';
    html += '<button class="btn-row-action" onclick="verEquipe(' + r2.id + ',' + escJs(r2.restaurante) + ')" title="Ver equipe" style="color:#3b82f6;font-size:0.85rem;gap:4px;">';
    html += '<i class="fa-solid fa-users"></i> <span>' + (r2.total_funcionarios || 0) + '</span>';
    html += '</button></td>';
    html += '<td><small>' + (r2.ultimaVer ? new Date(r2.ultimaVer).toLocaleDateString('pt-BR') : '--') + '</small></td>';
    html += '<td>';
    html += '<div class="row-actions">';
    html += '<button class="btn-row-action edit-action" onclick="editarRestaurante(' + r2.id + ')" title="Editar"><i class="fa-regular fa-pen-to-square"></i></button>';
    html += '<button class="btn-row-action block-action" onclick="toggleBloquearRest(' + r2.id + ',' + escJs(r2.status) + ')" title="' + (r2.status === 'bloqueado' ? 'Reativar' : 'Bloquear') + '"><i class="fa-solid ' + (r2.status === 'bloqueado' ? 'fa-unlock' : 'fa-ban') + '"></i></button>';
    html += '<button class="btn-row-action delete-action" onclick="excluirRestaurante(' + r2.id + ',' + escJs(r2.restaurante) + ')" title="Excluir"><i class="fa-regular fa-trash-can"></i></button>';
    html += '</div></td></tr>';
  }
  tbody.innerHTML = html;
}

function editarRestaurante(id) {
  var r = null;
  for (var i = 0; i < restaurantesData.length; i++) {
    if (String(restaurantesData[i].id) === String(id)) { r = restaurantesData[i]; break; }
  }
  if (!r) return;
  document.getElementById('edit-id').value = r.id;
  document.getElementById('edit-restaurante').value = r.restaurante;
  document.getElementById('edit-status').value = r.status;
  document.getElementById('edit-plano').value = (r.plano || '').toLowerCase();
  document.getElementById('edit-loginmode').value = (r.login_mode || 'multi');
  document.getElementById('modal-edit-client').classList.add('active');
}

function toggleBloquearRest(id, status) {
  var novoStatus = status === 'bloqueado' ? 'ativo' : 'bloqueado';
  var msg = status === 'bloqueado' ? 'Reativar este restaurante?' : 'Bloquear este restaurante?';
  if (!confirm(msg)) return;
  apiPost('/api/super/atualizar-restaurante', { id: id, fields: { status: novoStatus } }, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro: ' + (data ? data.erro : 'desconhecido'), 'danger'); return; }
    showToast('Restaurante atualizado!', 'success');
    carregarRestaurantes();
  });
}

function excluirRestaurante(id, nome) {
  if (!confirm('Excluir o restaurante "' + nome + '"? Todos os dados serão removidos!')) return;
  apiDelete('/api/super/restaurante/' + id, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao excluir', 'danger'); return; }
    showToast('Restaurante excluído.', 'success');
    carregarRestaurantes();
  });
}

/* ═══ WIZARD SETUP INICIAL ═══ */
var _wizardFeatures = [];
var _wizardPlanFeatures = {};

function criarRestauranteCompleto() {
  var nome = document.getElementById('new-rest-nome').value.trim();
  if (!nome) { showToast('Informe o nome do restaurante!', 'warning'); mostrarPassoWizard(2); return; }
  
  var email = document.getElementById('new-rest-email').value.trim();
  var senha = document.getElementById('new-rest-senha').value;
  var adminNome = document.getElementById('new-rest-admin-nome').value.trim();
  
  if (email && (!senha || senha.length < 4)) { showToast('Senha do admin deve ter no mínimo 4 caracteres!', 'warning'); mostrarPassoWizard(3); return; }
  
  // Plano selecionado
  var planoRadio = document.querySelector('input[name="new-rest-plano"]:checked');
  var licenca = planoRadio ? planoRadio.value : 'premium';
  
  // Chave de ativação
  var chave = document.getElementById('new-rest-chave').value.trim();
  
  // Módulos selecionados
  var modulosSelecionados = {};
  var checkboxes = document.querySelectorAll('.module-toggle');
  for (var i = 0; i < checkboxes.length; i++) {
    if (checkboxes[i].checked) {
      modulosSelecionados[checkboxes[i].getAttribute('data-feature')] = true;
    }
  }
  
  // Configurações iniciais
  var config_iniciais = {};
  var taxaEntrega = parseFloat(document.getElementById('new-rest-taxa-entrega').value);
  if (!isNaN(taxaEntrega) && taxaEntrega > 0) config_iniciais.taxa_entrega = taxaEntrega;
  var whatsapp = document.getElementById('new-rest-whatsapp').value.trim();
  if (whatsapp) config_iniciais.whatsapp = whatsapp;
  var abertura = document.getElementById('new-rest-abertura').value;
  var fechamento = document.getElementById('new-rest-fechamento').value;
  if (abertura) config_iniciais.horario_abertura = abertura;
  if (fechamento) config_iniciais.horario_fechamento = fechamento;
  
  // Equipe inicial
  var funcionarios_iniciais = [];
  var rows = document.querySelectorAll('.initial-team-row');
  for (var j = 0; j < rows.length; j++) {
    var fNome = rows[j].querySelector('.team-nome').value.trim();
    if (fNome) {
      funcionarios_iniciais.push({
        nome: fNome,
        cargo: rows[j].querySelector('.team-cargo').value || 'garcom',
        valor_hora: parseFloat(rows[j].querySelector('.team-valor').value) || 0
      });
    }
  }
  
  var payload = {
    nome: nome,
    slug: document.getElementById('new-rest-slug') ? document.getElementById('new-rest-slug').value.trim() : undefined,
    custom_domain: document.getElementById('new-rest-custom-domain') ? document.getElementById('new-rest-custom-domain').value.trim() : undefined,
    licenca: licenca,
    ativo: true,
    chave_ativacao: chave || undefined,
    email: email || undefined,
    senha: senha || undefined,
    admin_nome: adminNome || undefined,
    telefone: document.getElementById('new-rest-telefone').value.trim() || undefined,
    endereco: document.getElementById('new-rest-endereco').value.trim() || undefined,
    cnpj: document.getElementById('new-rest-cnpj').value.trim() || undefined,
    config_iniciais: Object.keys(config_iniciais).length > 0 ? config_iniciais : undefined,
    funcionarios_iniciais: funcionarios_iniciais.length > 0 ? funcionarios_iniciais : undefined,
    features: Object.keys(modulosSelecionados).length > 0 ? modulosSelecionados : undefined
  };
  
  // Desabilitar botão
  var btnCriar = document.getElementById('btn-criar-restaurante-completo');
  if (btnCriar) { btnCriar.disabled = true; btnCriar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Criando...'; }
  
  apiPost('/api/super/criar-restaurante-completo', payload, function(err, data) {
    if (btnCriar) { btnCriar.disabled = false; btnCriar.innerHTML = '<i class="fa-solid fa-rocket"></i> Criar Restaurante'; }
    if (err || !data || !data.ok) { showToast('Erro: ' + (data ? data.erro : 'desconhecido'), 'danger'); return; }
    var msg = data.mensagem || 'Restaurante criado com sucesso!';
    if (data.alertas && data.alertas.length > 0) msg += '\n' + data.alertas.join(' | ');
    showToast(msg, 'success');
    document.getElementById('modal-novo-rest').classList.remove('active');
    limparWizard();
    mostrarPassoWizard(1);
    carregarRestaurantes();
    if (typeof renderDominios === 'function') renderDominios();
  });
}

function limparWizard() {
  document.getElementById('new-rest-nome').value = '';
  if (document.getElementById('new-rest-slug')) document.getElementById('new-rest-slug').value = '';
  if (document.getElementById('new-rest-custom-domain')) document.getElementById('new-rest-custom-domain').value = '';
  var wPrev = document.getElementById('wizard-domain-preview');
  if (wPrev) wPrev.style.display = 'none';
  document.getElementById('new-rest-cnpj').value = '';
  document.getElementById('new-rest-telefone').value = '';
  document.getElementById('new-rest-endereco').value = '';
  document.getElementById('new-rest-email').value = '';
  document.getElementById('new-rest-senha').value = '';
  document.getElementById('new-rest-admin-nome').value = '';
  document.getElementById('new-rest-chave').value = '';
  document.getElementById('new-rest-taxa-entrega').value = '0';
  document.getElementById('new-rest-whatsapp').value = '';
  document.getElementById('new-rest-abertura').value = '08:00';
  document.getElementById('new-rest-fechamento').value = '22:00';
  var cs = document.getElementById('chave-status');
  if (cs) cs.style.display = 'none';
  // Reset plano to premium
  var radios = document.querySelectorAll('input[name="new-rest-plano"]');
  for (var i = 0; i < radios.length; i++) {
    radios[i].checked = radios[i].value === 'premium';
    var card = radios[i].nextElementSibling;
    if (card) {
      if (radios[i].value === 'premium') {
        card.style.borderColor = '#c084fc';
        card.style.background = 'rgba(139,92,246,0.08)';
      } else {
        card.style.borderColor = 'var(--border-color)';
        card.style.background = 'transparent';
      }
    }
  }
  // Reset team list
  var teamContainer = document.getElementById('initial-team-list');
  if (teamContainer) {
    teamContainer.innerHTML = '<div class="initial-team-row" style="display:flex;gap:0.5rem;margin-bottom:0.5rem;align-items:end;">' +
      '<div style="flex:2;"><input type="text" class="team-nome" placeholder="Nome do funcionário" style="width:100%;padding:0.5rem 0.7rem;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-size:0.85rem;"></div>' +
      '<div style="flex:1;"><select class="team-cargo" style="width:100%;padding:0.5rem 0.7rem;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-size:0.85rem;"><option value="garcom">Garçom</option><option value="cozinha">Cozinha</option><option value="caixa">Caixa</option><option value="admin">Gerente/Admin</option></select></div>' +
      '<div style="flex:1;"><input type="number" class="team-valor" placeholder="Valor/hora" value="0" step="0.50" style="width:100%;padding:0.5rem 0.7rem;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-size:0.85rem;"></div>' +
      '<button class="btn-row-action remove-team-row" style="flex-shrink:0;" title="Remover"><i class="fa-solid fa-xmark"></i></button></div>';
  }
}

// Wizard navigation
var _wizardStep = 1;
var _wizardTotal = 5;

function mostrarPassoWizard(passo) {
  _wizardStep = passo;
  // Update step indicators
  var steps = document.querySelectorAll('.wizard-step');
  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    var stepNum = parseInt(s.getAttribute('data-step'));
    if (stepNum === passo) {
      s.style.background = 'rgba(252,75,21,0.15)';
      s.style.color = '#fc4b15';
      s.style.fontWeight = '600';
    } else if (stepNum < passo) {
      s.style.background = 'rgba(16,185,129,0.08)';
      s.style.color = '#34d399';
      s.style.fontWeight = '500';
    } else {
      s.style.background = 'transparent';
      s.style.color = '#888';
      s.style.fontWeight = '400';
    }
  }
  // Show/hide panels
  var panels = document.querySelectorAll('.wizard-panel');
  for (var j = 0; j < panels.length; j++) {
    panels[j].style.display = parseInt(panels[j].getAttribute('data-step')) === passo ? 'block' : 'none';
  }
  // Buttons
  document.getElementById('btn-wizard-prev').style.display = passo > 1 ? 'inline-flex' : 'none';
  if (passo < _wizardTotal) {
    document.getElementById('btn-wizard-next').style.display = 'inline-flex';
    document.getElementById('btn-criar-restaurante-completo').style.display = 'none';
  } else {
    document.getElementById('btn-wizard-next').style.display = 'none';
    document.getElementById('btn-criar-restaurante-completo').style.display = 'inline-flex';
  }
  // Load modules on step 4
  if (passo === 4) carregarModulosWizard();
}

function proximoPassoWizard() {
  // Validate step 2 (nome obrigatório)
  if (_wizardStep === 2) {
    var nome = document.getElementById('new-rest-nome').value.trim();
    if (!nome) { showToast('Informe o nome do restaurante!', 'warning'); return; }
  }
  if (_wizardStep < _wizardTotal) mostrarPassoWizard(_wizardStep + 1);
}

function passoAnteriorWizard() {
  if (_wizardStep > 1) mostrarPassoWizard(_wizardStep - 1);
}

function carregarModulosWizard() {
  var grid = document.getElementById('modules-grid');
  if (!grid) return;
  
  // Features definitions
  var features = [
    { chave: 'tempo_real', nome: 'Tempo Real (Sockets)', desc: 'Dashboards, cozinha e fila em tempo real', icon: 'fa-bolt', color: '#f59e0b' },
    { chave: 'ifood', nome: 'Integração iFood', desc: 'Poller de pedidos do iFood', icon: 'fa-truck', color: '#ef4444' },
    { chave: 'cardapio', nome: 'Cardápio QR', desc: 'Cardápio digital por QR code', icon: 'fa-qrcode', color: '#10b981' },
    { chave: 'bi', nome: 'BI / Financeiro', desc: 'Relatórios e indicadores', icon: 'fa-chart-line', color: '#3b82f6' },
    { chave: 'delivery', nome: 'Delivery / Entregas', desc: 'Gestão de entregas', icon: 'fa-motorcycle', color: '#8b5cf6' },
    { chave: 'fidelidade', nome: 'Fidelidade / Pontos', desc: 'Programa de pontos', icon: 'fa-star', color: '#f59e0b' },
    { chave: 'nfce', nome: 'NFC-e', desc: 'Nota fiscal eletrônica', icon: 'fa-file-invoice', color: '#06b6d4' },
    { chave: 'telemetria', nome: 'Telemetria / Hub', desc: 'Sincronização com hub', icon: 'fa-satellite-dish', color: '#8b5cf6' }
  ];
  
  // Get current plan
  var planoRadio = document.querySelector('input[name="new-rest-plano"]:checked');
  var plano = planoRadio ? planoRadio.value : 'premium';
  
  var planDefaults = {
    trial: { tempo_real: false, ifood: false, cardapio: true, bi: false, delivery: false, fidelidade: false, nfce: false, telemetria: false },
    pro: { tempo_real: true, ifood: true, cardapio: true, bi: true, delivery: true, fidelidade: false, nfce: true, telemetria: true },
    premium: { tempo_real: true, ifood: true, cardapio: true, bi: true, delivery: true, fidelidade: true, nfce: true, telemetria: true }
  };
  var defaults = planDefaults[plano] || planDefaults.premium;
  
  var html = '';
  for (var i = 0; i < features.length; i++) {
    var f = features[i];
    var available = defaults[f.chave];
    var checked = available;
    html += '<label style="cursor:pointer;display:block;">' +
      '<input type="checkbox" class="module-toggle" data-feature="' + f.chave + '" ' + (checked ? 'checked' : '') + ' ' + (!available ? 'disabled' : '') + ' style="display:none;">' +
      '<div class="module-card" style="padding:0.8rem;border:1px solid ' + (available ? 'var(--border-color)' : 'rgba(239,68,68,0.15)') + ';border-radius:10px;transition:all 0.2s;' + (!available ? 'opacity:0.5;' : 'cursor:pointer;') + '" ' + (available ? 'onmouseover="this.style.borderColor=\'' + f.color + '\'" onmouseout="this.style.borderColor=\'var(--border-color)\'"' : '') + '>' +
        '<div style="display:flex;align-items:center;gap:0.6rem;">' +
          '<div style="width:32px;height:32px;border-radius:8px;background:' + f.color + '15;display:flex;align-items:center;justify-content:center;">' +
            '<i class="fa-solid ' + f.icon + '" style="color:' + f.color + ';font-size:0.85rem;"></i>' +
          '</div>' +
          '<div style="flex:1;">' +
            '<div style="font-weight:600;color:white;font-size:0.85rem;">' + f.nome + '</div>' +
            '<div style="font-size:0.72rem;color:var(--text-muted);">' + f.desc + '</div>' +
          '</div>' +
          '<div style="width:18px;height:18px;border:2px solid ' + (available ? f.color : '#666') + ';border-radius:4px;display:flex;align-items:center;justify-content:center;transition:all 0.2s;" class="module-check" data-feature="' + f.chave + '">' +
            (checked ? '<i class="fa-solid fa-check" style="font-size:10px;color:white;"></i>' : '') +
          '</div>' +
        '</div>' +
        (!available ? '<div style="font-size:0.68rem;color:var(--danger);margin-top:0.4rem;"><i class="fa-solid fa-lock"></i> Indisponível no plano ' + plano.toUpperCase() + '</div>' : '') +
      '</div>' +
    '</label>';
  }
  grid.innerHTML = html;
  
  // Toggle check marks
  var toggles = grid.querySelectorAll('.module-toggle');
  for (var t = 0; t < toggles.length; t++) {
    toggles[t].addEventListener('change', function() {
      var feature = this.getAttribute('data-feature');
      var checkDiv = grid.querySelector('.module-check[data-feature="' + feature + '"]');
      var card = this.nextElementSibling;
      if (this.checked) {
        if (checkDiv) checkDiv.innerHTML = '<i class="fa-solid fa-check" style="font-size:10px;color:white;"></i>';
        if (card) card.style.borderColor = 'var(--success)';
      } else {
        if (checkDiv) checkDiv.innerHTML = '';
        if (card) card.style.borderColor = 'var(--border-color)';
      }
    });
  }
  
  // Plano radio change → reload modules
  var radios = document.querySelectorAll('input[name="new-rest-plano"]');
  for (var r = 0; r < radios.length; r++) {
    radios[r].addEventListener('change', function() {
      // Update card styles
      var allCards = document.querySelectorAll('.plano-card');
      for (var c = 0; c < allCards.length; c++) {
        allCards[c].style.borderColor = 'var(--border-color)';
        allCards[c].style.background = 'transparent';
      }
      var selectedCard = this.nextElementSibling;
      if (selectedCard) {
        var colors = { trial: 'var(--warning)', pro: 'var(--info)', premium: '#c084fc' };
        selectedCard.style.borderColor = colors[this.value] || 'var(--primary)';
        selectedCard.style.background = (colors[this.value] || 'var(--primary)') + '11';
      }
      // If on step 4, reload modules
      if (_wizardStep === 4) carregarModulosWizard();
    });
  }
}

/* ═══ EQUIPE / FUNCIONÁRIOS ═══ */
function verEquipe(restauranteId, restauranteNome) {
  var body = document.getElementById('equipe-body');
  body.innerHTML = '<div style="text-align:center;padding:30px;color:#888;">Carregando equipe de <strong>' + esc(restauranteNome) + '</strong>...</div>';
  document.getElementById('modal-equipe').classList.add('active');
  
  // Carrega funcionários e métricas em paralelo
  var funcsData = [];
  var metricasData = [];
  var loaded = 0;
  
  function finalizar() {
    if (loaded < 2) return;
    var html = '<div style="margin-bottom:1rem;color:var(--text-muted);font-size:0.85rem;"><strong style="color:white;">' + esc(restauranteNome) + '</strong> — ' + funcsData.length + ' funcionário(s)</div>';
    
    // Tabela de funcionários
    html += '<h4 style="margin-bottom:0.6rem;"><i class="fa-solid fa-users"></i> Colaboradores</h4>';
    if (funcsData.length === 0) {
      html += '<p style="color:#888;text-align:center;padding:10px;">Nenhum funcionário cadastrado.</p>';
    } else {
      html += '<div style="overflow-x:auto;max-height:250px;overflow-y:auto;margin-bottom:1.5rem;"><table class="custom-table"><thead><tr>' +
        '<th>Nome</th><th>Cargo</th><th>Status</th><th>Valor Hora</th><th>CPF</th><th>Telefone</th>' +
        '</tr></thead><tbody>';
      for (var i = 0; i < funcsData.length; i++) {
        var f = funcsData[i];
        var statusColor = f.status === 'Ativo' ? '#22c55e' : (f.status === 'Pendente' ? '#f59e0b' : '#ef4444');
        html += '<tr>' +
          '<td style="font-weight:600;color:white;">' + esc(f.nome) + '</td>' +
          '<td>' + esc(f.cargo || '—') + '</td>' +
          '<td style="color:' + statusColor + ';">' + esc(f.status) + '</td>' +
          '<td>R$ ' + (f.valor_hora || 0).toFixed(2).replace('.', ',') + '</td>' +
          '<td>' + esc(f.cpf || '—') + '</td>' +
          '<td>' + esc(f.telefone || '—') + '</td>' +
          '</tr>';
      }
      html += '</tbody></table></div>';
    }
    
    // Métricas de desempenho
    html += '<h4 style="margin-bottom:0.6rem;"><i class="fa-solid fa-chart-simple"></i> Métricas de Desempenho</h4>';
    if (metricasData.length === 0) {
      html += '<p style="color:#888;text-align:center;padding:10px;">Nenhum dado de desempenho disponível.</p>';
    } else {
      html += '<div style="overflow-x:auto;max-height:300px;overflow-y:auto;"><table class="custom-table"><thead><tr>' +
        '<th>Garçom</th><th>Total Pedidos</th><th>Entregues</th><th>Em Andamento</th><th>Eficiência</th><th>Tempo Médio</th><th>Total Gasto</th><th>Hoje</th>' +
        '</tr></thead><tbody>';
      for (var j = 0; j < metricasData.length; j++) {
        var m = metricasData[j];
        var ef = m.taxaEficiencia;
        var efColor = ef >= 80 ? '#22c55e' : ef >= 50 ? '#f59e0b' : '#ef4444';
        var tempo = m.tempoMedioEntrega !== null ? m.tempoMedioEntrega + ' min' : '—';
        html += '<tr>' +
          '<td style="font-weight:600;color:white;">' + esc(m.nome) + '</td>' +
          '<td style="text-align:center;">' + m.total + '</td>' +
          '<td style="text-align:center;color:#22c55e;font-weight:bold;">' + m.entregues + '</td>' +
          '<td style="text-align:center;color:#f59e0b;">' + m.emAndamento + '</td>' +
          '<td style="text-align:center;color:' + efColor + ';font-weight:bold;">' + ef + '%</td>' +
          '<td style="text-align:center;">' + tempo + '</td>' +
          '<td style="text-align:center;">R$ ' + m.totalGasto.toFixed(2).replace('.', ',') + '</td>' +
          '<td style="text-align:center;">' + m.pedidosHoje + '</td>' +
          '</tr>';
      }
      html += '</tbody></table></div>';
    }
    
    body.innerHTML = html;
  }
  
  apiGet('/api/super/restaurantes/' + restauranteId + '/funcionarios', function(err, data) {
    loaded++;
    if (!err && data && data.ok) funcsData = data.funcionarios || [];
    finalizar();
  });
  
  apiGet('/api/super/metricas/garcons?restaurante_id=' + restauranteId, function(err, data) {
    loaded++;
    if (!err && data && data.ok) metricasData = data.metricas || [];
    finalizar();
  });
}

/* ═══ USUÁRIOS ═══ */
function carregarUsuarios() {
  var x = new XMLHttpRequest();
  x.open('GET', '/api/super/usuarios', true);
  x.setRequestHeader('x-super-admin-token', localToken);
  x.onreadystatechange = function() {
    if (x.readyState === 4) {
      try {
        var data = JSON.parse(x.responseText);
        if (data.ok) {
          usuariosData = data.usuarios || [];
          renderUsuarios();
        } else {
          showToast('Erro ao carregar usuários', 'danger');
        }
      } catch(e) { showToast('Erro de conexão', 'danger'); }
    }
  };
  x.send(null);
}

function renderUsuarios() {
  var search = (document.getElementById('user-search').value || '').toLowerCase();
  var filter = document.getElementById('user-filter-role').value;
  var filtered = [];
  for (var i = 0; i < usuariosData.length; i++) {
    var u = usuariosData[i];
    if (search && u.username.toLowerCase().indexOf(search) === -1) continue;
    if (filter && u.role !== filter) continue;
    filtered.push(u);
  }
  var tbody = document.getElementById('usuarios-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Nenhum usuário encontrado.</td></tr>';
    return;
  }
  var html = '';
  for (var j = 0; j < filtered.length; j++) {
    var u2 = filtered[j];
    var badgeClass = u2.ativo ? 'badge-ativo' : 'badge-bloqueado';
    var badgeText = u2.ativo ? 'Ativo' : 'Inativo';
    html += '<tr>';
    html += '<td><small style="font-family:monospace;">#' + u2.id + '</small></td>';
    html += '<td><div style="font-weight:600;color:white;">' + esc(u2.username) + '</div></td>';
    html += '<td><small>ID ' + u2.restaurante_id + '</small></td>';
    html += '<td><span class="badge badge-plano">' + esc(u2.role) + '</span></td>';
    html += '<td><span class="badge ' + badgeClass + '">' + badgeText + '</span></td>';
    html += '<td><small>' + (u2.data_cadastro ? new Date(u2.data_cadastro).toLocaleDateString('pt-BR') : '--') + '</small></td>';
    html += '<td><div class="row-actions">';
    html += '<button class="btn-row-action edit-action" onclick="resetarUsuario(' + u2.id + ')" title="Redefinir senha"><i class="fa-solid fa-key"></i></button>';
    if (u2.ativo) {
      html += '<button class="btn-row-action block-action" onclick="alternarStatusUsuario(' + u2.id + ',\'' + escapeHtml(u2.username) + '\', false)" title="Desativar Acesso"><i class="fa-solid fa-ban"></i> Desativar</button>';
    } else {
      html += '<button class="btn-row-action edit-action" style="background:#22c55e;color:white;" onclick="alternarStatusUsuario(' + u2.id + ',\'' + escapeHtml(u2.username) + '\', true)" title="Reativar Acesso"><i class="fa-solid fa-check"></i> Reativar</button>';
    }
    html += '</div></td></tr>';
  }
  tbody.innerHTML = html;
}

window.alternarStatusUsuario = function(id, username, novoStatus) {
  var acao = novoStatus ? 'reativar' : 'desativar';
  if (!confirm('Deseja realmente ' + acao + ' o acesso do usuário "' + username + '"?')) return;
  apiPut('/api/super/usuario/' + id + '/status', { ativo: novoStatus }, function(err, data) {
    if (err || !data || !data.ok) { showToast(err || (data ? data.erro : 'Erro ao alterar status'), 'danger'); return; }
    showToast(data.mensagem || 'Status do usuário alterado!', 'success');
    carregarUsuarios();
  });
};

function resetarUsuario(id) {
  var novaSenha = prompt('Nova senha para o usuário #' + id + ':');
  if (!novaSenha || novaSenha.length < 4) { showToast('Senha muito curta.', 'warning'); return; }
  apiPost('/api/super/reset-credenciais', { userId: id, novaSenha: novaSenha }, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro: ' + (data ? data.erro : 'desconhecido'), 'danger'); return; }
    showToast('Senha redefinida com sucesso!', 'success');
    carregarUsuarios();
  });
}

function desativarUsuario(id, username) {
  alternarStatusUsuario(id, username, false);
}

function criarUsuarioNovo() {
  var email = document.getElementById('new-user-email').value.trim();
  var senha = document.getElementById('new-user-senha').value;
  var restId = document.getElementById('new-user-rest-id').value;
  if (!email || !senha) { showToast('Preencha email e senha!', 'warning'); return; }
  apiPost('/api/super/criar-usuario', { email: email, senha: senha, restauranteId: parseInt(restId) || 1 }, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro: ' + (data ? data.erro : 'desconhecido'), 'danger'); return; }
    showToast('Usuário criado com sucesso!', 'success');
    document.getElementById('modal-novo-user').classList.remove('active');
    document.getElementById('new-user-email').value = '';
    document.getElementById('new-user-senha').value = '';
    carregarUsuarios();
  });
}

/* ═══ MENSAGENS / BROADCAST ═══ */
function enviarMensagem() {
  var titulo = (document.getElementById('msg-titulo').value || '').trim();
  var corpo = (document.getElementById('msg-corpo').value || '').trim();
  var tipo = document.getElementById('msg-tipo').value;
  if (!titulo || !corpo) { showToast('Preencha título e mensagem.', 'error'); return; }
  if (!confirm('Enviar esta mensagem para TODOS os restaurantes ativos?')) return;
  apiPost('/api/super/mensagens', { titulo: titulo, corpo: corpo, tipo: tipo }, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao enviar: ' + (data ? data.erro : err), 'error'); return; }
    showToast('Mensagem enviada para todos os restaurantes!', 'success');
    document.getElementById('msg-titulo').value = '';
    document.getElementById('msg-corpo').value = '';
    document.getElementById('msg-tipo').value = 'aviso';
    carregarMensagens();
  });
}

function carregarMensagens() {
  apiGet('/api/super/mensagens', function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao carregar mensagens.', 'error'); return; }
    var tbody = document.getElementById('mensagens-table-body');
    if (!tbody) return;
    var msgs = data.mensagens || [];
    var totalR = data.totalRestaurantes || 0;
    if (!msgs.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Nenhuma mensagem enviada ainda.</td></tr>';
      return;
    }
    var tipoLabels = { aviso: 'Aviso', atualizacao: 'Atualização', manutencao: 'Manutenção', urgente: 'Urgente' };
    var tipoCores = { aviso: '#3b82f6', atualizacao: '#10b981', manutencao: '#f59e0b', urgente: '#ef4444' };
    var html = '';
    msgs.forEach(function(m) {
      var lidas = m.lidas || 0;
      var cor = tipoCores[m.tipo] || '#6b7280';
      var tipoLabel = tipoLabels[m.tipo] || m.tipo;
      var dataFormatada = m.criado_em ? new Date(m.criado_em).toLocaleString('pt-BR') : '-';
      var msgCurta = (m.corpo || '').length > 80 ? m.corpo.substring(0, 80) + '...' : (m.corpo || '');
      html += '<tr>';
      html += '<td>' + m.id + '</td>';
      html += '<td><span style="display:inline-block;padding:0.2rem 0.6rem;border-radius:100px;font-size:0.78rem;font-weight:600;background:' + cor + '22;color:' + cor + ';">' + tipoLabel + '</span></td>';
      html += '<td><strong>' + escapeHtml(m.titulo || '') + '</strong></td>';
      html += '<td style="max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + escapeHtml(m.corpo || '') + '">' + escapeHtml(msgCurta) + '</td>';
      html += '<td style="white-space:nowrap;">' + dataFormatada + '</td>';
      html += '<td>' + lidas + '/' + totalR + '</td>';
      html += '<td><div style="display:flex;gap:0.4rem;">';
      html += '<button class="btn-row-action" title="Reenviar" onclick="reenviarMensagem(' + m.id + ')"><i class="fa-solid fa-rotate-right"></i></button>';
      html += '<button class="btn-row-action" style="color:var(--danger);" title="Deletar" onclick="deletarMensagem(' + m.id + ')"><i class="fa-solid fa-trash"></i></button>';
      html += '</div></td></tr>';
    });
    tbody.innerHTML = html;
  });
}

function reenviarMensagem(id) {
  if (!confirm('Reenviar esta mensagem para todos os restaurantes?')) return;
  apiPost('/api/super/mensagens/' + id + '/reenviar', {}, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao reenviar.', 'error'); return; }
    showToast('Mensagem reenviada com sucesso!', 'success');
  });
}

function deletarMensagem(id) {
  if (!confirm('Tem certeza que deseja deletar esta mensagem?')) return;
  apiDelete('/api/super/mensagens/' + id, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao deletar.', 'error'); return; }
    showToast('Mensagem deletada.', 'success');
    carregarMensagens();
  });
}

/* ═══ SERVIDOR ═══ */
function carregarServidor() {
  apiGet('/api/super/server-status', function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao carregar status do servidor', 'danger');
      return;
    }
    var s = data.status;
    var uptimeMin = Math.floor(s.uptime / 60);
    var uptimeHrs = Math.floor(uptimeMin / 60);
    var uptimeDias = Math.floor(uptimeHrs / 24);
    var uptimeTxt = '';
    if (uptimeDias > 0) uptimeTxt = uptimeDias + 'd ' + (uptimeHrs % 24) + 'h';
    else if (uptimeHrs > 0) uptimeTxt = uptimeHrs + 'h ' + (uptimeMin % 60) + 'min';
    else uptimeTxt = uptimeMin + ' min';

    setText('srv-uptime', uptimeTxt);
    setText('srv-memoria', formatBytes(s.memoria.heapUsed));
    setText('srv-bancos', s.disco.arquivos_banco + ' arquivos');
    setText('srv-disco', formatBytes(s.disco.tamanho_total));

    var platIcon = s.plataforma === 'win32' ? '🪟 Windows' : (s.plataforma === 'darwin' ? '🍎 macOS' : '🐧 Linux');
    var extra = platIcon + ' (' + (s.arch || 'x64') + (s.cpus ? ', ' + s.cpus + ' CPUs' : '') + ') | Node.js ' + s.node + ' | PID ' + s.pid;
    extra += ' | Host: ' + (s.hostname || 'local');
    extra += ' | RSS: ' + formatBytes(s.memoria.rss);
    extra += ' | Heap Total: ' + formatBytes(s.memoria.heapTotal);
    setText('srv-info-extra', extra);
  });
  carregarBaseDomain();
}

function carregarBaseDomain() {
  apiGet('/api/super/config', function(err, data) {
    if (!err && data && data.ok && data.config) {
      var el = document.getElementById('super-base-domain');
      if (el) el.value = data.config.base_domain || '';
    }
  });
}

function criarBackup() {
  if (!confirm('Criar backup de todos os bancos de dados?')) return;
  apiPost('/api/super/backup', {}, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao criar backup', 'danger'); return; }
    showToast('Backup criado! ' + (data.arquivos ? data.arquivos.length + ' arquivos' : ''), 'success');
  });
}

/* ═══ CERTIFICADOS SSL (.pfx) ═══ */
function carregarCerts() {
  apiGet('/api/super/certs', function(err, data) {
    var statusEl = document.getElementById('cert-status');
    var tbody = document.getElementById('cert-tbody');
    if (err || !data || !data.ok) {
      if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">Não foi possível carregar os certificados.</span>';
      return;
    }
    var isHttps = data.isHttps;
    var ativo = data.ativo;
    if (statusEl) {
      var modo = isHttps ? '<span style="color:#34d399; font-weight:700;">HTTPS ativo</span>' : '<span style="color:#f59e0b; font-weight:700;">HTTP (sem certificado)</span>';
      var certInfo = ativo ? ' | Certificado ativo: <b>' + escapeHtml(ativo) + '</b>' : '';
      var reiniciar = data.reiniciarNecessario ? ' | <span style="color:#f59e0b;">Reinicie o servidor para aplicar o certificado</span>' : '';
      statusEl.innerHTML = 'Protocolo: ' + modo + certInfo + reiniciar;
    }
    if (!tbody) return;
    if (!data.certs || data.certs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">Nenhum certificado na pasta certs/. Envie um .pfx acima.</td></tr>';
      return;
    }
    tbody.innerHTML = data.certs.map(function(c) {
      var size = c.size >= 1048576 ? (c.size / 1048576).toFixed(1) + ' MB' : (c.size / 1024).toFixed(1) + ' KB';
      var isAtivo = ativo === c.file;
      var statusHtml = isAtivo
        ? '<span style="color:#34d399; font-weight:700;"><i class="fa-solid fa-circle-check"></i> Ativo</span>'
        : '<span style="color:var(--text-muted);">Inativo</span>';
      var acoes = '';
      if (!isAtivo) {
        acoes += '<button class="btn-row-action" style="color:#34d399;" onclick="ativarCertificado(\'' + c.file.replace(/'/g, '') + '\')"><i class="fa-solid fa-play"></i> Ativar</button>';
      }
      acoes += '<button class="btn-row-action" style="color:#ef4444;" onclick="removerCertificado(\'' + c.file.replace(/'/g, '') + '\')"><i class="fa-solid fa-trash"></i></button>';
      return '<tr>' +
        '<td style="font-weight:600;color:var(--text-primary);">' + escapeHtml(c.file) + '</td>' +
        '<td>' + size + '</td>' +
        '<td>' + statusHtml + '</td>' +
        '<td><div class="row-actions">' + acoes + '</div></td>' +
        '</tr>';
    }).join('');
  });
}

function enviarCertificado() {
  var input = document.getElementById('cert-file-input');
  var pass = document.getElementById('cert-pass-input');
  if (!input || !input.files || input.files.length === 0) {
    showToast('Selecione um arquivo .pfx/.p12', 'warning');
    return;
  }
  var file = input.files[0];
  if (!/\.(pfx|p12)$/i.test(file.name)) {
    showToast('Apenas arquivos .pfx ou .p12', 'warning');
    return;
  }
  var fd = new FormData();
  fd.append('cert', file);
  if (pass && pass.value.trim()) fd.append('passphrase', pass.value.trim());
  var x = new XMLHttpRequest();
  x.open('POST', '/api/super/certs/upload', true);
  x.setRequestHeader('x-super-admin-token', localToken);
  x.onreadystatechange = function() {
    if (x.readyState === 4) {
      var data = {};
      try { data = JSON.parse(x.responseText); } catch (e) { }
      if (data.ok) {
        showToast('Certificado enviado!', 'success');
        input.value = '';
        if (pass) pass.value = '';
        carregarCerts();
      } else {
        showToast(data.erro || 'Erro ao enviar certificado.', 'danger');
      }
    }
  };
  x.onerror = function() { showToast('Falha de conexão com o servidor.', 'danger'); };
  x.send(fd);
}

function ativarCertificado(file) {
  var pass = document.getElementById('cert-pass-input');
  var passphrase = (pass && pass.value && pass.value.trim()) ? pass.value.trim() : '';
  if (!confirm('Ativar o certificado ' + file + '? A troca é aplicada ao vivo se o servidor já estiver HTTPS.')) return;
  apiPost('/api/super/certs/ativar', { file: file, passphrase: passphrase }, function(err, data) {
    if (err || !data || !data.ok) {
      showToast((data && data.erro) || 'Erro ao ativar certificado.', 'danger');
      return;
    }
    if (data.applied) {
      showToast('Certificado ativado ao vivo!', 'success');
    } else {
      showToast('Certificado ativado. Reinicie o servidor para aplicar (servidor em HTTP).', 'warning');
    }
    if (pass) pass.value = '';
    carregarCerts();
  });
}

function removerCertificado(file) {
  if (!confirm('Remover o certificado ' + file + '?')) return;
  apiDelete('/api/super/certs/' + encodeURIComponent(file), function(err, data) {
    if (err || !data || !data.ok) {
      showToast((data && data.erro) || 'Erro ao remover certificado.', 'danger');
      return;
    }
    showToast('Certificado removido.', 'success');
    carregarCerts();
  });
}

/* ═══ LOGS ═══ */
var logsPage = 0;
var logsPerPage = 50;

function carregarLogs(page) {
  logsPage = page || 0;
  var search = (document.getElementById('logs-search-input').value || '').trim();
  var tipo = document.getElementById('logs-tipo-filter').value || 'api';
  var url = '/api/super/logs-sistema?tipo=' + tipo + '&limit=' + logsPerPage + '&offset=' + (logsPage * logsPerPage);
  if (search) url += '&search=' + encodeURIComponent(search);

  apiGet(url, function(err, data) {
    if (err || !data || !data.ok) return;
    var thead = document.getElementById('logs-table-header');
    var tbody = document.getElementById('logs-table-body');
    if (tipo === 'api') {
      thead.innerHTML = '<th>ID</th><th>Data/Hora</th><th>Operador</th><th>IP</th><th>Endpoint</th><th>Status</th><th>Detalhes</th>';
    } else {
      thead.innerHTML = '<th>ID</th><th>Data/Hora</th><th>Operador</th><th>Ação</th><th>Detalhes</th><th>Motivo</th><th>IP</th>';
    }
    var rows = data.rows || [];
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Nenhum log encontrado.</td></tr>';
    } else {
      var html = '';
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        html += '<tr>';
        html += '<td><small>#' + r.id + '</small></td>';
        html += '<td><small>' + (r.data_hora || r.criado_em || '--') + '</small></td>';
        html += '<td><small>' + esc(r.operador || '--') + '</small></td>';
        if (tipo === 'api') {
          html += '<td><small>' + esc(r.ip || '--') + '</small></td>';
          html += '<td><small style="font-family:monospace;">' + esc(r.endpoint || '--') + '</small></td>';
          html += '<td><small>' + (r.status_code || '--') + '</small></td>';
          html += '<td><small>' + esc(r.detalhes || '--') + '</small></td>';
        } else {
          html += '<td><small>' + esc(r.acao || '--') + '</small></td>';
          html += '<td><small>' + esc(r.detalhes || '--') + '</small></td>';
          html += '<td><small>' + esc(r.motivo || '--') + '</small></td>';
          html += '<td><small>' + esc(r.ip || '--') + '</small></td>';
        }
        html += '</tr>';
      }
      tbody.innerHTML = html;
    }
    var total = data.total || 0;
    var start = logsPage * logsPerPage + 1;
    var end = Math.min((logsPage + 1) * logsPerPage, total);
    setText('logs-pagination-info', 'Mostrando ' + start + '-' + end + ' de ' + total);
  });
}

/* ═══ CONFIGURAÇÕES ═══ */
function carregarConfig() {
  apiGet('/api/super/config-global', function(err, data) {
    if (err || !data || !data.ok) return;
    var c = data.configs || {};
    document.getElementById('cfg-update-ver').value = c.updateVer || '';
    document.getElementById('cfg-update-url').value = c.updateUrl || '';
    document.getElementById('cfg-update-msg').value = c.updateMsg || '';
    document.getElementById('cfg-whatsapp').value = c.whatsappSuporte || '';
    document.getElementById('cfg-email-suporte').value = c.emailSuporte || '';
  });
}

function salvarConfig() {
  var payload = {
    updateVer: document.getElementById('cfg-update-ver').value.trim(),
    updateUrl: document.getElementById('cfg-update-url').value.trim(),
    updateMsg: document.getElementById('cfg-update-msg').value.trim(),
    whatsappSuporte: document.getElementById('cfg-whatsapp').value.trim(),
    emailSuporte: document.getElementById('cfg-email-suporte').value.trim()
  };
  apiPost('/api/super/config-global', payload, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao salvar configurações', 'danger'); return; }
    showToast('Configurações salvas com sucesso!', 'success');
  });
}

/* ═══ RECUPERAR ACESSO (existente) ═══ */
var recoveryUsersData = [];

function carregarUsuariosRecovery() {
  var x = new XMLHttpRequest();
  x.open('GET', '/api/super/usuarios', true);
  x.setRequestHeader('x-super-admin-token', localToken);
  x.onreadystatechange = function() {
    if (x.readyState === 4) {
      try {
        var data = JSON.parse(x.responseText);
        if (data.ok) {
          recoveryUsersData = data.usuarios || [];
          renderRecoveryTable(recoveryUsersData);
          popularSelectRecovery(recoveryUsersData);
          showToast(recoveryUsersData.length + ' usuário(s) carregado(s)!', 'success');
        }
      } catch(e) { showToast('Falha ao carregar.', 'danger'); }
    }
  };
  x.send(null);
}

function renderRecoveryTable(users) {
  var search = (document.getElementById('recovery-search-input').value || '').toLowerCase();
  var filtered = [];
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (search && u.username.toLowerCase().indexOf(search) === -1 && String(u.restaurante_id).indexOf(search) === -1) continue;
    filtered.push(u);
  }
  var tbody = document.getElementById('recovery-users-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty-state"><i class="fa-solid fa-user-slash"></i><span>Nenhum usuário encontrado.</span></td></tr>';
    return;
  }
  var html = '';
  for (var j = 0; j < filtered.length; j++) {
    var u2 = filtered[j];
    var badge = u2.ativo ? 'badge-ativo' : 'badge-bloqueado';
    var text = u2.ativo ? 'Ativo' : 'Inativo';
    html += '<tr>';
    html += '<td><code style="font-size:0.8rem;opacity:0.7;">#' + u2.id + '</code></td>';
    html += '<td><div style="font-weight:600;color:white;font-size:0.88rem;">' + esc(u2.username) + '</div></td>';
    html += '<td><span style="color:var(--text-muted);font-size:0.82rem;">ID ' + u2.restaurante_id + '</span></td>';
    html += '<td><span class="badge badge-plano">' + u2.role + '</span></td>';
    html += '<td><span class="badge ' + badge + '">' + text + '</span></td>';
    html += '<td><div class="row-actions">';
    html += '<button class="btn-row-action select-action" onclick="selecionarUsuarioRecovery(' + u2.id + ')" title="Selecionar"><i class="fa-solid fa-pen-to-square"></i></button>';
    if (u2.ativo) {
      html += '<button class="btn-row-action deactivate-action" onclick="desativarUsuarioRecovery(' + u2.id + ',' + escJs(u2.username) + ')" title="Desativar"><i class="fa-solid fa-ban"></i></button>';
    }
    html += '</div></td></tr>';
  }
  tbody.innerHTML = html;
}

function popularSelectRecovery(users) {
  var sel = document.getElementById('reset-usuario-select');
  sel.innerHTML = '<option value="">-- Selecione um usuario --</option>';
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (!u.ativo) continue;
    var opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = '#' + u.id + ' -- ' + u.username + ' (Rest. ' + u.restaurante_id + ')';
    sel.appendChild(opt);
  }
}

function selecionarUsuarioRecovery(id) {
  document.getElementById('reset-usuario-select').value = id;
  document.getElementById('reset-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function desativarUsuarioRecovery(id, username) {
  if (!confirm('Desativar "' + username + '"?')) return;
  apiDelete('/api/super/usuario/' + id, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro', 'danger'); return; }
    showToast('Usuário desativado.', 'success');
    carregarUsuariosRecovery();
  });
}

function resetarCredenciais() {
  var userId = document.getElementById('reset-usuario-select').value;
  var novoEmail = document.getElementById('reset-novo-email').value.trim();
  var novaSenha = document.getElementById('reset-nova-senha').value;
  if (!userId) { showToast('Selecione um usuário!', 'warning'); return; }
  if (!novoEmail && !novaSenha) { showToast('Informe email e/ou senha!', 'warning'); return; }
  apiPost('/api/super/reset-credenciais', { userId: parseInt(userId), novoEmail: novoEmail || undefined, novaSenha: novaSenha || undefined }, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro: ' + (data ? data.erro : 'desconhecido'), 'danger'); return; }
    showToast('Credenciais redefinidas!', 'success');
    document.getElementById('reset-novo-email').value = '';
    document.getElementById('reset-nova-senha').value = '';
    carregarUsuariosRecovery();
  });
}

/* ═══ HELPERS ═══ */
function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// (Segurança) Escapa valor para string JS dentro de atributo HTML (aspas como entidade).
function escJs(v) {
  if (v === null || v === undefined) v = '';
  return JSON.stringify(String(v)).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function formatMoney(val) {
  return val.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/* ═══ TERMINAL ═══ */
var _cmdHistory = [];
var _cmdHistoryIndex = -1;

function popularAlvosTerminal() {
  var select = document.getElementById('exec-target');
  if (!select) return;
  if (!restaurantesData || restaurantesData.length === 0) {
    apiGet('/api/super/restaurantes', function(err, data) {
      if (!err && data && data.ok && Array.isArray(data.restaurantes)) {
        restaurantesData = data.restaurantes;
        renderAlvosSelect(select);
      }
    });
  } else {
    renderAlvosSelect(select);
  }
}

function renderAlvosSelect(select) {
  var val = select.value;
  select.innerHTML = '<option value="">Todas as instalações (local)</option>';
  for (var i = 0; i < (restaurantesData || []).length; i++) {
    var r = restaurantesData[i];
    var opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = '#' + r.id + ' — ' + (r.restaurante || r.nome || 'Restaurante');
    select.appendChild(opt);
  }
  if (val) select.value = val;
}

function executarComando() {
  var input = document.getElementById('exec-input');
  var output = document.getElementById('exec-output');
  var btnExec = document.getElementById('btn-exec');
  var comando = (input ? input.value : '').trim();
  if (!comando) { showToast('Digite um comando para executar.', 'warning'); return; }

  var target = document.getElementById('exec-target') ? document.getElementById('exec-target').value : '';

  if (output) {
    output.textContent = '$ ' + comando + '\n\n⏳ Executando comando no servidor local...';
  }

  if (btnExec) {
    btnExec.disabled = true;
    btnExec.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Executando...';
  }

  // Adicionar ao histórico
  if (_cmdHistory[_cmdHistory.length - 1] !== comando) {
    _cmdHistory.push(comando);
  }
  _cmdHistoryIndex = _cmdHistory.length;

  apiPost('/api/super/exec', { command: comando, restaurante_id: target ? parseInt(target) : null }, function(err, data) {
    if (btnExec) {
      btnExec.disabled = false;
      btnExec.innerHTML = '<i class="fa-solid fa-play"></i> Executar';
    }
    if (!output) return;

    if (err) {
      output.textContent = '$ ' + comando + '\n\n❌ Erro de conexão ou rede: ' + (err.message || 'Falha ao contatar o servidor.');
      return;
    }

    if (!data || !data.ok) {
      var msgErro = (data && (data.erro || data.error || data.stderr)) || 'Erro ao executar o comando.';
      output.textContent = '$ ' + comando + '\n\n❌ Falha na execução:\n' + msgErro + (data && data.exitCode !== undefined ? '\n\nExit code: ' + data.exitCode : '');
      return;
    }

    var texto = '$ ' + comando + '\n\n';
    if (data.stdout) texto += data.stdout;
    if (data.stderr) texto += (data.stdout ? '\n' : '') + '[STDERR]\n' + data.stderr;
    if (!data.stdout && !data.stderr) texto += '[Comando executado com sucesso sem saída de texto]';
    texto += '\n\n✓ Exit code: ' + (data.exitCode !== undefined ? data.exitCode : 0);
    output.textContent = texto;
    output.scrollTop = output.scrollHeight;
  });
}

function limparOutput() {
  document.getElementById('exec-output').textContent = 'Output limpo. Digite um comando e clique em Executar.';
}

/* ═══ EQUIPE DE SUPORTE ═══ */
var suporteData = [];

function carregarSuporte() {
  var tbody = document.getElementById('suporte-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Carregando equipe de suporte...</td></tr>';
  apiGet('/api/super/equipe', function(err, data) {
    if (err || !data || !data.ok) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#ef4444;">Erro ao carregar equipe.</td></tr>';
      return;
    }
    suporteData = data.equipe || [];
    renderSuporte();
  });
}

function renderSuporte() {
  var tbody = document.getElementById('suporte-tbody');
  if (!tbody) return;
  var search = (document.getElementById('suporte-search').value || '').toLowerCase();
  var filter = document.getElementById('suporte-filter-status').value;
  var filtered = [];
  for (var i = 0; i < suporteData.length; i++) {
    var s = suporteData[i];
    if (search && s.nome.toLowerCase().indexOf(search) === -1 && (s.email || '').toLowerCase().indexOf(search) === -1) continue;
    if (filter && s.status !== filter) continue;
    filtered.push(s);
  }
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Nenhum membro encontrado.</td></tr>';
    return;
  }
  var html = '';
  for (var j = 0; j < filtered.length; j++) {
    var s2 = filtered[j];
    var statusColors = { disponivel: '#22c55e', ocupado: '#f59e0b', offline: '#ef4444' };
    var statusLabels = { disponivel: 'Disponível', ocupado: 'Ocupado', offline: 'Offline' };
    var sc = statusColors[s2.status] || '#888';
    var sl = statusLabels[s2.status] || s2.status;
    html += '<tr>' +
      '<td style="padding:10px 12px;font-weight:600;color:white;">' + esc(s2.nome) + '</td>' +
      '<td style="padding:10px 12px;">' + esc(s2.email) + '</td>' +
      '<td style="padding:10px 12px;text-align:center;">' + esc(s2.telefone || '—') + '</td>' +
      '<td style="padding:10px 12px;text-align:center;">' + esc(s2.cargo) + '</td>' +
      '<td style="padding:10px 12px;text-align:center;">' + esc(s2.especialidade) + '</td>' +
      '<td style="padding:10px 12px;text-align:center;color:' + sc + ';font-weight:bold;">' + sl + '</td>' +
      '<td style="padding:10px 12px;text-align:center;"><small>' + (s2.data_cadastro ? new Date(s2.data_cadastro).toLocaleDateString('pt-BR') : '—') + '</small></td>' +
      '<td style="padding:10px 12px;text-align:center;"><div class="row-actions">' +
      '<button class="btn-row-action edit-action" onclick="editarSuporte(' + s2.id + ')" title="Editar"><i class="fa-regular fa-pen-to-square"></i></button>' +
      '<button class="btn-row-action block-action" onclick="atribuirRestaurantes(' + s2.id + ',' + escJs(s2.nome) + ')" title="Atribuir restaurantes"><i class="fa-solid fa-link"></i></button>' +
      '<button class="btn-row-action delete-action" onclick="excluirSuporte(' + s2.id + ',' + escJs(s2.nome) + ')" title="Remover"><i class="fa-regular fa-trash-can"></i></button>' +
      '</div></td></tr>';
  }
  tbody.innerHTML = html;
}

function abrirModalSuporte(membro) {
  document.getElementById('modal-suporte-title').textContent = membro ? 'Editar Membro' : 'Novo Membro da Equipe';
  document.getElementById('suporte-edit-id').value = membro ? membro.id : '';
  document.getElementById('suporte-nome').value = membro ? membro.nome : '';
  document.getElementById('suporte-email').value = membro ? membro.email : '';
  document.getElementById('suporte-telefone').value = membro ? (membro.telefone || '') : '';
  document.getElementById('suporte-senha').value = '';
  document.getElementById('suporte-cargo').value = membro ? (membro.cargo || 'Suporte N1') : 'Suporte N1';
  document.getElementById('suporte-especialidade').value = membro ? (membro.especialidade || 'Remoto') : 'Remoto';
  // Status field only visible when editing
  document.getElementById('suporte-status-group').style.display = membro ? 'block' : 'none';
  document.getElementById('suporte-status').value = membro ? (membro.status || 'disponivel') : 'disponivel';
  document.getElementById('modal-suporte').classList.add('active');
}
window.abrirModalNovoSuporte = function() { abrirModalSuporte(null); };
window.abrirModalSuporte = abrirModalSuporte;

function editarSuporte(id) {
  for (var i = 0; i < suporteData.length; i++) {
    if (suporteData[i].id === id) { abrirModalSuporte(suporteData[i]); return; }
  }
  showToast('Membro não encontrado.', 'warning');
}

function salvarSuporte() {
  var id = document.getElementById('suporte-edit-id').value;
  var nome = document.getElementById('suporte-nome').value.trim();
  var email = document.getElementById('suporte-email').value.trim();
  var telefone = document.getElementById('suporte-telefone').value.trim();
  var senha = document.getElementById('suporte-senha').value;
  var cargo = document.getElementById('suporte-cargo').value;
  var especialidade = document.getElementById('suporte-especialidade').value;
  if (!nome || !email) { showToast('Nome e email são obrigatórios!', 'warning'); return; }
  if (!id && (!senha || senha.length < 4)) { showToast('Senha deve ter no mínimo 4 caracteres!', 'warning'); return; }
  
  var payload = { nome: nome, email: email, telefone: telefone, cargo: cargo, especialidade: especialidade };
  if (senha) payload.senha = senha;
  
  if (id) {
    payload.status = document.getElementById('suporte-status').value;
    apiPut('/api/super/equipe/' + id, payload, function(err, data) {
      if (err || !data || !data.ok) { showToast('Erro ao atualizar: ' + (data ? data.erro : err), 'danger'); return; }
      showToast('Membro atualizado!', 'success');
      document.getElementById('modal-suporte').classList.remove('active');
      carregarSuporte();
    });
  } else {
    apiPost('/api/super/equipe', payload, function(err, data) {
      if (err || !data || !data.ok) { showToast('Erro ao criar: ' + (data ? data.erro : err), 'danger'); return; }
      showToast('Membro cadastrado!', 'success');
      document.getElementById('modal-suporte').classList.remove('active');
      carregarSuporte();
    });
  }
}

function excluirSuporte(id, nome) {
  if (!confirm('Remover "' + nome + '" da equipe de suporte?')) return;
  apiDelete('/api/super/equipe/' + id, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao remover', 'danger'); return; }
    showToast('Membro removido.', 'success');
    carregarSuporte();
  });
}

// Atribuição de restaurantes
var _suporteRestId = null;

function atribuirRestaurantes(id, nome) {
  _suporteRestId = id;
  document.getElementById('modal-suporte-rest-title').textContent = 'Restaurantes — ' + nome;
  document.getElementById('suporte-rest-id').value = id;
  document.getElementById('suporte-rest-info').textContent = 'Selecione os restaurantes que ' + nome + ' atenderá.';
  document.getElementById('modal-suporte-restaurantes').classList.add('active');
  carregarAtribuicoes();
}

function carregarAtribuicoes() {
  var list = document.getElementById('suporte-rest-list');
  if (!list) return;
  list.innerHTML = '<div style="text-align:center;padding:20px;color:#888;">Carregando...</div>';
  
  // Carrega restaurantes e atribuições atuais
  apiGet('/api/super/restaurantes', function(err, dataRest) {
    if (err || !dataRest || !dataRest.ok) {
      list.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;">Erro ao carregar restaurantes.</div>';
      return;
    }
    var restaurantes = dataRest.clients || [];
    if (_suporteRestId) {
      apiGet('/api/super/equipe/' + _suporteRestId + '/restaurantes', function(err, dataAttr) {
        if (err || !dataAttr || !dataAttr.ok) {
          list.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;">Erro ao carregar atribuições.</div>';
          return;
        }
        var atribuicoes = dataAttr.atribuicoes || [];
        renderAtribuicoes(restaurantes, atribuicoes);
      });
    } else {
      renderAtribuicoes(restaurantes, []);
    }
  });
}

function renderAtribuicoes(restaurantes, atribuicoes) {
  var list = document.getElementById('suporte-rest-list');
  if (!list) return;
  var search = (document.getElementById('suporte-rest-search').value || '').toLowerCase();
  var attrMap = {};
  for (var i = 0; i < atribuicoes.length; i++) {
    attrMap[atribuicoes[i].restaurante_id] = atribuicoes[i];
  }
  var html = '';
  for (var j = 0; j < restaurantes.length; j++) {
    var r = restaurantes[j];
    if (search && r.restaurante.toLowerCase().indexOf(search) === -1) continue;
    var isAssigned = !!attrMap[r.id];
    html += '<label style="display:flex;align-items:center;gap:0.8rem;padding:0.6rem 0.8rem;border-radius:6px;cursor:pointer;' +
      (isAssigned ? 'background:rgba(34,197,94,0.1);' : '') + '" ' +
      'onmouseover="this.style.background=\'var(--bg-tertiary)\'" onmouseout="this.style.background=\'' + (isAssigned ? 'rgba(34,197,94,0.1)' : 'transparent') + '\'">' +
      '<input type="checkbox" class="suporte-rest-check" value="' + r.id + '" ' + (isAssigned ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:#22c55e;">' +
      '<span style="color:white;font-weight:500;">' + esc(r.restaurante) + '</span>' +
      '<span style="color:#888;font-size:0.8rem;margin-left:auto;">#' + r.id + '</span>' +
      '</label>';
  }
  if (!html) html = '<div style="text-align:center;padding:20px;color:#888;">Nenhum restaurante encontrado.</div>';
  list.innerHTML = html;
}

function salvarAtribuicoes() {
  var id = _suporteRestId;
  if (!id) { showToast('Erro: ID não definido.', 'danger'); return; }
  var checks = document.querySelectorAll('.suporte-rest-check');
  var selected = [];
  for (var i = 0; i < checks.length; i++) {
    if (checks[i].checked) selected.push(parseInt(checks[i].value));
  }
  apiPost('/api/super/equipe/' + id + '/restaurantes', { restaurante_ids: selected }, function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao salvar: ' + (data ? data.erro : err), 'danger'); return; }
    showToast('Atribuições salvas!', 'success');
    document.getElementById('modal-suporte-restaurantes').classList.remove('active');
    carregarSuporte();
  });
}

/* ═══ INICIALIZAÇÃO & UI DINÂMICA ═══ */
function initAdminPanelUI() {
  /* Logout */
  var btnSair = document.getElementById('btn-sair');
  if (btnSair) btnSair.addEventListener('click', logout);

  /* Acordeão de categorias da sidebar */
  document.querySelectorAll('.cat-header').forEach(function(h) {
    h.addEventListener('click', function() {
      var cat = h.closest('.menu-categoria');
      var jaAberta = cat.classList.contains('aberta');
      document.querySelectorAll('.menu-categoria.aberta').forEach(function(c) { c.classList.remove('aberta'); });
      if (!jaAberta) cat.classList.add('aberta');
    });
  });

  /* Sidebar nav */
  var menuItems = document.querySelectorAll('.menu-item');
  for (var i = 0; i < menuItems.length; i++) {
    menuItems[i].addEventListener('click', function() {
      switchTab(this.getAttribute('data-target'));
    });
  }

  /* Hamburger menu (mobile) */
  var btnHamburger = document.getElementById('btn-hamburger');
  var sidebar = document.querySelector('.sidebar');
  var sidebarOverlay = document.getElementById('sidebar-overlay');
  if (btnHamburger && sidebar) {
    btnHamburger.addEventListener('click', function() {
      sidebar.classList.toggle('open');
      if (sidebarOverlay) sidebarOverlay.classList.toggle('open');
    });
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', function() {
      if (sidebar) sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('open');
    });
  }

  /* Refresh / Sync */
  var btnRefresh = document.getElementById('btn-refresh-data');
  if (btnRefresh) btnRefresh.addEventListener('click', function() { switchTab('sec-dash'); });

  /* Restaurantes */
  var btnNovoRest = document.getElementById('btn-novo-restaurante');
  if (btnNovoRest) btnNovoRest.addEventListener('click', function() { document.getElementById('modal-novo-rest').classList.add('active'); mostrarPassoWizard(1); });
  var btnCriarRest = document.getElementById('btn-criar-restaurante-completo');
  if (btnCriarRest) btnCriarRest.addEventListener('click', criarRestauranteCompleto);
  var btnWizardNext = document.getElementById('btn-wizard-next');
  if (btnWizardNext) btnWizardNext.addEventListener('click', proximoPassoWizard);
  var btnWizardPrev = document.getElementById('btn-wizard-prev');
  if (btnWizardPrev) btnWizardPrev.addEventListener('click', passoAnteriorWizard);

  // Add team row
  var btnAddTeam = document.getElementById('btn-add-team-row');
  if (btnAddTeam) btnAddTeam.addEventListener('click', function() {
    var container = document.getElementById('initial-team-list');
    if (!container) return;
    var row = document.createElement('div');
    row.className = 'initial-team-row';
    row.style.cssText = 'display:flex;gap:0.5rem;margin-bottom:0.5rem;align-items:end;';
    row.innerHTML = '<div style="flex:2;"><input type="text" class="team-nome" placeholder="Nome" style="width:100%;padding:0.5rem 0.7rem;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-size:0.85rem;"></div>' +
      '<div style="flex:1;"><input type="text" class="team-cargo" placeholder="Cargo" value="Garçom" style="width:100%;padding:0.5rem 0.7rem;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-size:0.85rem;"></div>' +
      '<div style="flex:1;"><input type="number" class="team-valor" placeholder="Valor hora" value="0" step="0.50" style="width:100%;padding:0.5rem 0.7rem;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-size:0.85rem;"></div>' +
      '<button class="btn-row-action remove-team-row" style="flex-shrink:0;" title="Remover"><i class="fa-solid fa-xmark"></i></button>';
    container.appendChild(row);
    row.querySelector('.remove-team-row').addEventListener('click', function() { row.remove(); });
  });

  /* Usuários */
  var btnNovoUser = document.getElementById('btn-novo-usuario');
  if (btnNovoUser) btnNovoUser.addEventListener('click', function() { document.getElementById('modal-novo-user').classList.add('active'); });
  var btnCriarUser = document.getElementById('btn-criar-usuario-novo');
  if (btnCriarUser) btnCriarUser.addEventListener('click', criarUsuarioNovo);
  var userSearch = document.getElementById('user-search');
  if (userSearch) userSearch.addEventListener('input', renderUsuarios);
  var userFilter = document.getElementById('user-filter-role');
  if (userFilter) userFilter.addEventListener('change', renderUsuarios);

  /* Equipe de Suporte */
  var btnNovoSuporte = document.getElementById('btn-novo-suporte');
  if (btnNovoSuporte) btnNovoSuporte.addEventListener('click', function() { abrirModalSuporte(null); });
  var btnSalvarSuporte = document.getElementById('btn-salvar-suporte');
  if (btnSalvarSuporte) btnSalvarSuporte.addEventListener('click', salvarSuporte);
  var suporteSearch = document.getElementById('suporte-search');
  if (suporteSearch) suporteSearch.addEventListener('input', renderSuporte);
  var suporteFilter = document.getElementById('suporte-filter-status');
  if (suporteFilter) suporteFilter.addEventListener('change', renderSuporte);
  var suporteRestSearch = document.getElementById('suporte-rest-search');
  if (suporteRestSearch) suporteRestSearch.addEventListener('input', function() {
    apiGet('/api/super/restaurantes', function(err, data) {
      if (!err && data && data.ok && _suporteRestId) {
        apiGet('/api/super/equipe/' + _suporteRestId + '/restaurantes', function(err2, data2) {
          renderAtribuicoes((data.clients || []), (data2 && data2.ok ? data2.atribuicoes || [] : []));
        });
      }
    });
  });
  var btnSalvarAtrib = document.getElementById('btn-salvar-atribuicoes');
  if (btnSalvarAtrib) btnSalvarAtrib.addEventListener('click', salvarAtribuicoes);

  /* Servidor */
  var btnRefreshServer = document.getElementById('btn-refresh-server');
  if (btnRefreshServer) btnRefreshServer.addEventListener('click', carregarServidor);
  var btnBackup = document.getElementById('btn-backup');
  if (btnBackup) btnBackup.addEventListener('click', criarBackup);

  /* BASE_DOMAIN save */
  var btnSaveDomain = document.getElementById('btn-save-base-domain');
  if (btnSaveDomain) btnSaveDomain.addEventListener('click', function() {
    var val = (document.getElementById('super-base-domain').value || '').trim();
    var statusEl = document.getElementById('base-domain-status');
    apiPost('/api/super/config', { base_domain: val }, function(err, data) {
      if (!statusEl) return;
      statusEl.style.display = 'block';
      if (err || !data || !data.ok) {
        statusEl.style.background = 'rgba(239,68,68,0.15)';
        statusEl.style.color = '#ef4444';
        statusEl.textContent = 'Erro ao salvar.';
      } else {
        statusEl.style.background = 'rgba(16,185,129,0.15)';
        statusEl.style.color = '#34d399';
        statusEl.textContent = 'Domínio base salvo com sucesso!';
      }
      setTimeout(function() { statusEl.style.display = 'none'; }, 4000);
    });
  });

  /* Logs */
  var btnRefreshLogs = document.getElementById('btn-refresh-logs');
  if (btnRefreshLogs) btnRefreshLogs.addEventListener('click', function() { carregarLogs(0); });
  var logsSearch = document.getElementById('logs-search-input');
  if (logsSearch) logsSearch.addEventListener('input', function() { carregarLogs(0); });
  var logsTipo = document.getElementById('logs-tipo-filter');
  if (logsTipo) logsTipo.addEventListener('change', function() { carregarLogs(0); });
  var btnLogsPrev = document.getElementById('btn-logs-prev');
  if (btnLogsPrev) btnLogsPrev.addEventListener('click', function() { if (logsPage > 0) carregarLogs(logsPage - 1); });
  var btnLogsNext = document.getElementById('btn-logs-next');
  if (btnLogsNext) btnLogsNext.addEventListener('click', function() { carregarLogs(logsPage + 1); });

  /* Mensagens */
  var btnEnviarMsg = document.getElementById('btn-enviar-msg');
  if (btnEnviarMsg) btnEnviarMsg.addEventListener('click', enviarMensagem);
  var btnLimparMsg = document.getElementById('btn-limpar-msg');
  if (btnLimparMsg) btnLimparMsg.addEventListener('click', function() {
    document.getElementById('msg-titulo').value = '';
    document.getElementById('msg-corpo').value = '';
    document.getElementById('msg-tipo').value = 'aviso';
  });
  var btnRefreshMsg = document.getElementById('btn-refresh-mensagens');
  if (btnRefreshMsg) btnRefreshMsg.addEventListener('click', carregarMensagens);

  /* Config */
  var btnSaveConfig = document.getElementById('btn-save-config');
  if (btnSaveConfig) btnSaveConfig.addEventListener('click', salvarConfig);

  /* Recuperar Acesso */
  var btnLoadUsers = document.getElementById('btn-load-users');
  if (btnLoadUsers) btnLoadUsers.addEventListener('click', carregarUsuariosRecovery);
  var btnRefreshUsuarios = document.getElementById('btn-refresh-usuarios');
  if (btnRefreshUsuarios) btnRefreshUsuarios.addEventListener('click', carregarUsuariosRecovery);
  var btnResetCreds = document.getElementById('btn-reset-credenciais');
  if (btnResetCreds) btnResetCreds.addEventListener('click', resetarCredenciais);
  var recoverySearch = document.getElementById('recovery-search-input');
  if (recoverySearch) recoverySearch.addEventListener('input', function() { renderRecoveryTable(recoveryUsersData); });
  var resetSelect = document.getElementById('reset-usuario-select');
  if (resetSelect) resetSelect.addEventListener('change', function() {
    var preview = document.getElementById('selected-user-preview');
    if (!this.value) { if (preview) preview.style.display = 'none'; return; }
    var user = null;
    for (var i = 0; i < recoveryUsersData.length; i++) {
      if (String(recoveryUsersData[i].id) === this.value) { user = recoveryUsersData[i]; break; }
    }
    if (user && preview) {
      document.getElementById('preview-email').textContent = user.username;
      document.getElementById('preview-meta').textContent = 'Restaurante ID ' + user.restaurante_id + ' | ' + user.role;
      document.getElementById('preview-badge').textContent = user.ativo ? 'Ativo' : 'Inativo';
      document.getElementById('preview-badge').className = 'badge ' + (user.ativo ? 'badge-ativo' : 'badge-bloqueado');
      preview.style.display = 'flex';
    }
  });

  /* Modal close handlers & Backdrop click */
  document.addEventListener('click', function(e) {
    // Clicar fora do modal (no backdrop)
    if (e.target.classList && e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('active');
      if (e.target.style.display && e.target.style.display !== 'none') {
        e.target.style.display = 'none';
      }
    }
    // Botão de fechar (X) ou botões de Cancelar/Fechar
    if (e.target.closest('.modal-close') || e.target.closest('.btn-cancelar') || (e.target.tagName === 'BUTTON' && (e.target.textContent.trim().toLowerCase() === 'cancelar' || e.target.textContent.trim().toLowerCase() === 'fechar') && e.target.closest('.modal-overlay, .modal'))) {
      var modal = e.target.closest('.modal-overlay, .modal');
      if (modal) {
        modal.classList.remove('active');
        if (modal.style.display && modal.style.display !== 'none') {
          modal.style.display = 'none';
        }
      }
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active, .modal-overlay[style*="display: flex"], .modal-overlay[style*="display: block"], .modal.active').forEach(function(m) {
        m.classList.remove('active');
        if (m.style.display && m.style.display !== 'none') m.style.display = 'none';
      });
    }
  });

  /* Edit modal save */
  var btnSaveEdit = document.getElementById('btn-save-edit');
  if (btnSaveEdit) btnSaveEdit.addEventListener('click', function() {
    var id = document.getElementById('edit-id').value;
    var fields = {
      restaurante: document.getElementById('edit-restaurante').value.trim(),
      status: document.getElementById('edit-status').value,
      plano: document.getElementById('edit-plano').value,
      login_mode: document.getElementById('edit-loginmode').value
    };
    if (!fields.restaurante) { showToast('Nome obrigatório!', 'warning'); return; }
    apiPost('/api/super/atualizar-restaurante', { id: parseInt(id), fields: fields }, function(err, data) {
      if (err || !data || !data.ok) { showToast('Erro ao salvar', 'danger'); return; }
      showToast('Restaurante atualizado!', 'success');
      document.getElementById('modal-edit-client').classList.remove('active');
      carregarRestaurantes();
    });
  });

  /* Login tabs */
  var tabLocal = document.getElementById('tab-local');
  var tabCloud = document.getElementById('tab-cloud');
  if (tabLocal) tabLocal.addEventListener('click', function() {
    setLoginMode('local');
  });
  if (tabCloud) tabCloud.addEventListener('click', function() {
    setLoginMode('cloud');
  });

  /* Login cloud */
  var btnEntrar = document.getElementById('btn-entrar');
  if (btnEntrar) btnEntrar.addEventListener('click', function() {
    showToast('Modo cloud indisponível. Use o login local.', 'warning');
  });

  /* Header - Nova Licença (vai para aba de gerar licença) */
  var btnHeaderNewKey = document.getElementById('btn-header-new-key');
  if (btnHeaderNewKey) btnHeaderNewKey.addEventListener('click', function() {
    switchTab('sec-licencas');
    setTimeout(function() {
      var inp = document.getElementById('lic-restaurante-nome');
      if (inp) {
        inp.focus();
        inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
  });

  /* ═══ MOBILE: Drawer Sidebar & Bottom Navigation ═══ */
  document.addEventListener('click', function(e) {
    // Abrir/fechar drawer via hambúrguer ou botão 'Menu' no bottom nav
    var btnHam = e.target.closest ? e.target.closest('#btn-hamburger, #btn-mobile-more') : null;
    if (btnHam) {
      e.preventDefault();
      var sb = document.querySelector('.sidebar');
      var ov = document.getElementById('sidebar-overlay');
      if (sb) sb.classList.toggle('open');
      if (ov) ov.classList.toggle('open');
      return;
    }

    // Fechar ao clicar no overlay escuro
    var ovClick = e.target.closest ? e.target.closest('#sidebar-overlay') : null;
    if (ovClick) {
      e.preventDefault();
      var sb2 = document.querySelector('.sidebar');
      var ov2 = document.getElementById('sidebar-overlay');
      if (sb2) sb2.classList.remove('open');
      if (ov2) ov2.classList.remove('open');
      return;
    }

    // Trocar aba via bottom nav
    var mobItem = e.target.closest ? e.target.closest('.mob-nav-item[data-target]') : null;
    if (mobItem) {
      e.preventDefault();
      var tgt = mobItem.getAttribute('data-target');
      if (tgt) {
        switchTab(tgt);
        var mainEl = document.querySelector('.main-content');
        if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
  });

  /* Toggle senha recovery */
  var toggleSenha = document.getElementById('toggle-nova-senha');
  if (toggleSenha) toggleSenha.addEventListener('click', function() {
    var input = document.getElementById('reset-nova-senha');
    if (!input) return;
    var isText = input.type === 'text';
    input.type = isText ? 'password' : 'text';
    toggleSenha.querySelector('i').className = isText ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
  });

  /* Força de senha recovery */
  var inputNovaSenha = document.getElementById('reset-nova-senha');
  if (inputNovaSenha) inputNovaSenha.addEventListener('input', function() {
    var val = this.value;
    var strengthEl = document.getElementById('senha-strength');
    var barEl = document.getElementById('strength-bar');
    var labelEl = document.getElementById('strength-label');
    if (!val) { if (strengthEl) strengthEl.style.display = 'none'; return; }
    if (strengthEl) strengthEl.style.display = 'flex';
    var score = 0;
    if (val.length >= 6) score++;
    if (val.length >= 10) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^a-zA-Z0-9]/.test(val)) score++;
    var configs = [
      { label: 'Muito fraca', color: '#ef4444', width: '15%' },
      { label: 'Fraca', color: '#ef4444', width: '30%' },
      { label: 'Razoável', color: '#f59e0b', width: '55%' },
      { label: 'Boa', color: '#10b981', width: '75%' },
      { label: 'Forte', color: '#10b981', width: '90%' },
      { label: 'Excelente', color: '#3b82f6', width: '100%' }
    ];
    var cfg = configs[Math.min(score, 5)];
    if (barEl) { barEl.style.setProperty('--strength-width', cfg.width); barEl.style.setProperty('--strength-color', cfg.color); }
    if (labelEl) { labelEl.textContent = cfg.label; labelEl.style.color = cfg.color; }
  });

  /* Criar usuário (recuperação antiga) */
  var btnCriarUsuarioOld = document.getElementById('btn-criar-usuario');
  if (btnCriarUsuarioOld) btnCriarUsuarioOld.addEventListener('click', function() {
    var email = document.getElementById('novo-user-email').value.trim();
    var senha = document.getElementById('novo-user-senha').value;
    var restId = document.getElementById('novo-user-restaurante-id').value;
    if (!email || !senha) { showToast('Preencha email e senha!', 'warning'); return; }
    apiPost('/api/super/criar-usuario', { email: email, senha: senha, restauranteId: parseInt(restId) || 1 }, function(err, data) {
      if (err || !data || !data.ok) { showToast('Erro: ' + (data ? data.erro : 'desconhecido'), 'danger'); return; }
      showToast('Usuário criado com sucesso!', 'success');
      document.getElementById('novo-user-email').value = '';
      document.getElementById('novo-user-senha').value = '';
      carregarUsuariosRecovery();
    });
  });

  /* Enter no input de senha do login */
  var inputSenhaLogin = document.getElementById('local-senha');
  if (inputSenhaLogin) inputSenhaLogin.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') loginLocal();
  });

  /* Enter na senha admin recovery */
  var inputAdminSenha = document.getElementById('recovery-admin-senha');
  if (inputAdminSenha) inputAdminSenha.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') carregarUsuariosRecovery();
  });

  /* ═══ CLIENTES ═══ */
  var btnRefreshClientes = document.getElementById('btn-refresh-clientes');
  if (btnRefreshClientes) btnRefreshClientes.addEventListener('click', carregarClientes);
  var clientesSearch = document.getElementById('clientes-search');
  if (clientesSearch) clientesSearch.addEventListener('input', renderClientes);
  var clientesFilterRest = document.getElementById('clientes-filter-rest');
  if (clientesFilterRest) clientesFilterRest.addEventListener('change', renderClientes);

  /* ═══ TERMINAL ═══ */
  var btnExec = document.getElementById('btn-exec');
  if (btnExec) btnExec.addEventListener('click', executarComando);
  var execInput = document.getElementById('exec-input');
  if (execInput) execInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') executarComando();
    if (e.key === 'ArrowUp') {
      if (_cmdHistoryIndex > 0) {
        _cmdHistoryIndex--;
        this.value = _cmdHistory[_cmdHistoryIndex];
      }
      e.preventDefault();
    }
    if (e.key === 'ArrowDown') {
      if (_cmdHistoryIndex < _cmdHistory.length - 1) {
        _cmdHistoryIndex++;
        this.value = _cmdHistory[_cmdHistoryIndex];
      } else {
        _cmdHistoryIndex = _cmdHistory.length;
        this.value = '';
      }
      e.preventDefault();
    }
  });
  var btnClearOutput = document.getElementById('btn-clear-output');
  if (btnClearOutput) btnClearOutput.addEventListener('click', limparOutput);
  var btnRefreshTargets = document.getElementById('btn-refresh-targets');
  if (btnRefreshTargets) btnRefreshTargets.addEventListener('click', popularAlvosTerminal);

  /* Quick commands */
  var quickBtns = document.querySelectorAll('#quick-commands .quick-cmd');
  for (var qi = 0; qi < quickBtns.length; qi++) {
    quickBtns[qi].addEventListener('click', function(e) {
      var cmd = this.getAttribute('data-cmd');
      if (!cmd) return;
      var input = document.getElementById('exec-input');
      if (!input) return;
      if (e.altKey) {
        // Alt+Click: executa direto
        input.value = cmd;
        executarComando();
      } else {
        // Click normal: preenche o input
        input.value = cmd;
        input.focus();
      }
    });
  }

}

/* ═══ TAREFAS E AVISOS DE SUPORTE (SUPER ADMIN) ═══ */
window.abrirModalNovaTaskSuporte = function() {
  var modal = document.getElementById('modal-nova-task-suporte');
  if (!modal) return;
  
  var selectSuporte = document.getElementById('task-suporte-id');
  selectSuporte.innerHTML = '<option value="">Selecione o atendente de suporte...</option>';
  var list = (typeof suporteData !== 'undefined' && Array.isArray(suporteData)) ? suporteData : [];
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    selectSuporte.innerHTML += '<option value="' + s.id + '">' + escapeHtml(s.nome) + ' (' + escapeHtml(s.cargo || 'Atendente') + ')</option>';
  }
  
  var selectRest = document.getElementById('task-restaurante-id');
  selectRest.innerHTML = '<option value="">Nenhum / Geral</option>';
  apiGet('/api/super/restaurantes', function(err, data) {
    if (!err && data && data.ok) {
      var rList = data.restaurantes || data.clients || [];
      for (var j = 0; j < rList.length; j++) {
        var r = rList[j];
        selectRest.innerHTML += '<option value="' + r.id + '">' + escapeHtml(r.nome || r.restaurante) + ' (#' + r.id + ')</option>';
      }
    }
  });

  document.getElementById('task-tipo').value = '';
  document.getElementById('task-descricao').value = '';
  document.getElementById('task-pontos').value = '10';
  modal.classList.add('active');
  modal.style.display = 'flex';
};

window.fecharModalNovaTaskSuporte = function() {
  var modal = document.getElementById('modal-nova-task-suporte');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
};

window.salvarTaskSuporte = function() {
  var suporteId = document.getElementById('task-suporte-id').value;
  var restId = document.getElementById('task-restaurante-id').value;
  var tipo = document.getElementById('task-tipo').value.trim();
  var descricao = document.getElementById('task-descricao').value.trim();
  var pontos = parseInt(document.getElementById('task-pontos').value) || 10;

  if (!suporteId) { alert('Selecione um atendente de suporte.'); return; }
  if (!tipo) { alert('Digite um título ou tipo para a task.'); return; }
  if (!descricao) { alert('Digite a descrição detalhada da task.'); return; }

  apiPost('/api/super/equipe/tasks', {
    suporte_id: parseInt(suporteId),
    restaurante_id: restId ? parseInt(restId) : null,
    tipo: tipo,
    descricao: descricao,
    pontos: pontos
  }, function(err, data) {
    if (err || !data || !data.ok) {
      alert(err || (data && data.erro) || 'Erro ao criar task.');
      return;
    }
    showToast(data.mensagem || 'Task atribuída com sucesso!', 'success');
    fecharModalNovaTaskSuporte();
  });
};

window.abrirModalEnviarAvisoSuporte = function() {
  var modal = document.getElementById('modal-enviar-aviso-suporte');
  if (!modal) return;

  document.getElementById('aviso-destino-tipo').value = 'todos';
  document.getElementById('aviso-titulo').value = '';
  document.getElementById('aviso-tipo').value = 'aviso';
  document.getElementById('aviso-corpo').value = '';
  toggleSelecaoSuporteAviso();

  var listDiv = document.getElementById('lista-checkbox-suporte');
  var h = '';
  var list = (typeof suporteData !== 'undefined' && Array.isArray(suporteData)) ? suporteData : [];
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    h += '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:white;cursor:pointer;">' +
      '<input type="checkbox" class="check-suporte-aviso" value="' + s.id + '"> ' + escapeHtml(s.nome) + ' (' + escapeHtml(s.email) + ')' +
      '</label>';
  }
  listDiv.innerHTML = h || '<div style="color:#888;font-size:12px;">Nenhum atendente cadastrado.</div>';

  modal.classList.add('active');
  modal.style.display = 'flex';
};

window.toggleSelecaoSuporteAviso = function() {
  var tipo = document.getElementById('aviso-destino-tipo').value;
  var container = document.getElementById('container-selecao-suporte');
  if (container) container.style.display = (tipo === 'selecionados') ? 'block' : 'none';
};

window.fecharModalEnviarAvisoSuporte = function() {
  var modal = document.getElementById('modal-enviar-aviso-suporte');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
};

window.enviarAvisoSuporte = function() {
  var destinoTipo = document.getElementById('aviso-destino-tipo').value;
  var titulo = document.getElementById('aviso-titulo').value.trim();
  var tipo = document.getElementById('aviso-tipo').value;
  var corpo = document.getElementById('aviso-corpo').value.trim();

  if (!titulo) { alert('Digite o título do aviso.'); return; }
  if (!corpo) { alert('Digite a mensagem do aviso.'); return; }

  var suporteIds = [];
  if (destinoTipo === 'selecionados') {
    var checks = document.querySelectorAll('.check-suporte-aviso:checked');
    checks.forEach(function(c) { suporteIds.push(parseInt(c.value)); });
    if (suporteIds.length === 0) {
      alert('Selecione pelo menos um atendente de suporte.');
      return;
    }
  }

  apiPost('/api/super/equipe/avisos', {
    destino: destinoTipo,
    suporte_ids: suporteIds,
    titulo: titulo,
    tipo: tipo,
    corpo: corpo
  }, function(err, data) {
    if (err || !data || !data.ok) {
      alert(err || (data && data.erro) || 'Erro ao enviar aviso.');
      return;
    }
    showToast(data.mensagem || 'Aviso transmitido com sucesso!', 'success');
    fecharModalEnviarAvisoSuporte();
  });
};

window.abrirModalCriarMissaoSurpresa = function() {
  var modal = document.getElementById('modal-criar-missao-surpresa');
  if (!modal) return;
  document.getElementById('missao-titulo').value = '';
  document.getElementById('missao-meta').value = '5';
  document.getElementById('missao-recompensa').value = '1000';
  document.getElementById('missao-limite').value = '';
  document.getElementById('missao-descricao').value = '';
  modal.classList.add('active');
  modal.style.display = 'flex';
};

window.fecharModalCriarMissaoSurpresa = function() {
  var modal = document.getElementById('modal-criar-missao-surpresa');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
};

window.salvarMissaoSurpresa = function() {
  var titulo = document.getElementById('missao-titulo').value.trim();
  var meta = parseInt(document.getElementById('missao-meta').value) || 1;
  var recompensa = parseFloat(document.getElementById('missao-recompensa').value) || 0;
  var limite = document.getElementById('missao-limite').value.trim();
  var desc = document.getElementById('missao-descricao').value.trim();

  if (!titulo || !recompensa) {
    alert('Preencha o título e o valor da bonificação.');
    return;
  }

  apiPost('/api/super/missoes', {
    titulo: titulo,
    meta_qtd: meta,
    recompensa_valor: recompensa,
    data_limite: limite,
    descricao: desc
  }, function(err, data) {
    if (err || !data || !data.ok) {
      alert(err || (data && data.erro) || 'Erro ao lançar missão.');
      return;
    }
    showToast(data.mensagem || 'Promoção surpresa lançada!', 'success');
    fecharModalCriarMissaoSurpresa();
  });
};

document.addEventListener('DOMContentLoaded', function() {
  /* Login screen event listeners */
  var btnLogin = document.getElementById('btn-entrar-local');
  if (btnLogin) btnLogin.addEventListener('click', loginLocal);

  var senhaInput = document.getElementById('local-senha');
  if (senhaInput) {
    senhaInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        loginLocal();
      }
    });
  }

  var tabLocal = document.getElementById('tab-local');
  var tabCloud = document.getElementById('tab-cloud');
  if (tabLocal) tabLocal.addEventListener('click', function() { setLoginMode('local'); });
  if (tabCloud) tabCloud.addEventListener('click', function() { setLoginMode('cloud'); });

  var btnEntrar = document.getElementById('btn-entrar');
  if (btnEntrar) btnEntrar.addEventListener('click', function() {
    showToast('Modo cloud indisponível. Use o login local.', 'warning');
  });

  /* Global removal delegation */
  document.addEventListener('click', function(e) {
    if (e.target.closest('.remove-team-row')) {
      var row = e.target.closest('.initial-team-row');
      if (row) row.remove();
    }
  });

  /* Auto-autenticação ao carregar a página */
  var savedToken = localStorage.getItem('chef_super_admin_local_token');
  if (savedToken) localToken = savedToken;

  entrarNoPainel(false);
});

  /* ═══ LICENÇAS & TELEMETRIA ═══ */
  window.carregarLicencas = function() {
    carregarChaves();
    carregarTelemetria();
  };

  function carregarChaves() {
    apiGet('/api/super/licencas', function(err, data) {
      var tbody = document.getElementById('licencas-tbody');
      if (!tbody) return;
      if (err || !data || !data.ok) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#ef4444;padding:20px;">Erro ao carregar chaves.</td></tr>';
        return;
      }
      var lic = data.licencas || [];
      if (lic.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhuma chave gerada ainda.</td></tr>';
        return;
      }
      var html = '';
      for (var i = 0; i < lic.length; i++) {
        var l = lic[i];
        var stColor = l.status === 'usada' ? '#22c55e' : l.status === 'revogada' ? '#ef4444' : l.status === 'expirada' ? '#f59e0b' : '#3b82f6';
        var stLabel = l.status === 'usada' ? 'Usada' : l.status === 'revogada' ? 'Revogada' : l.status === 'expirada' ? 'Expirada' : 'Disponível';
        html += '<tr>' +
          '<td style="font-family:monospace;font-weight:700;color:#60a5fa;">' + escapeHtml(l.chave) + '</td>' +
          '<td>' + escapeHtml(l.restaurante_nome) + '</td>' +
          '<td>' + escapeHtml((l.plano || 'premium').toUpperCase()) + '</td>' +
          '<td>' + escapeHtml(l.validade || '—') + (l.dias ? ' (' + l.dias + 'd)' : '') + '</td>' +
          '<td style="color:' + stColor + ';font-weight:600;">' + stLabel + '</td>' +
          '<td>' + escapeHtml(l.usada_por || '—') + '</td>' +
          '<td>' + escapeHtml(l.usada_em || '—') + '</td>' +
          '<td>' +
            '<button class="btn-row-action" onclick="copiarChaveTxt(' + escJs(l.chave) + ')" title="Copiar"><i class="fa-solid fa-copy"></i></button>' +
            (l.status !== 'revogada' ? '<button class="btn-row-action danger-action" onclick="revogarChave(' + l.id + ')" title="Revogar"><i class="fa-solid fa-ban"></i></button>' : '') +
          '</td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
    });
  }

  window.gerarChave = function() {
    var nomeInp = document.getElementById('lic-restaurante-nome');
    var nome = (nomeInp ? nomeInp.value : '').trim();
    var plano = document.getElementById('lic-plano') ? document.getElementById('lic-plano').value : 'premium';
    var dias = parseInt(document.getElementById('lic-dias') ? document.getElementById('lic-dias').value : 365) || 365;
    var maxDisp = parseInt(document.getElementById('lic-maxdisp') ? document.getElementById('lic-maxdisp').value : 0) || 0;
    var obs = (document.getElementById('lic-obs') ? document.getElementById('lic-obs').value : '').trim();

    if (!nome) {
      showToast('Por favor, informe o nome do restaurante para a licença.', 'warning');
      if (nomeInp) nomeInp.focus();
      return;
    }

    apiPost('/api/super/licencas/gerar', { restaurante_nome: nome, plano: plano, dias: dias, max_dispositivos: maxDisp, obs: obs }, function(err, data) {
      if (err || !data || !data.ok) {
        showToast(data && data.erro ? data.erro : 'Erro ao gerar chave', 'danger');
        return;
      }
      var box = document.getElementById('lic-result');
      var keyEl = document.getElementById('lic-result-key');
      if (box && keyEl && data.licenca) {
        keyEl.innerText = data.licenca.chave;
        box.style.display = 'block';
      }
      showToast('Chave gerada com sucesso: ' + (data.licenca ? data.licenca.chave : ''), 'success');
      carregarChaves();
    });
  };

  window.copiarChave = function(elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    navigator.clipboard.writeText(el.innerText.trim()).then(function() {
      showToast('Chave copiada!', 'success');
    });
  };

  window.copiarChaveTxt = function(chave) {
    navigator.clipboard.writeText(chave).then(function() {
      showToast('Chave copiada!', 'success');
    });
  };

  window.revogarChave = function(id) {
    if (!confirm('Revogar esta chave? A ativação feita com ela será bloqueada na próxima validação.')) return;
    apiPost('/api/super/licencas/' + id + '/revogar', {}, function(err, data) {
      if (err || !data || !data.ok) { showToast('Erro ao revogar', 'danger'); return; }
      showToast('Chave revogada.', 'success');
      carregarChaves();
    });
  };

  window.carregarTelemetria = function() {
    apiGet('/api/super/telemetria', function(err, data) {
      var tbody = document.getElementById('telemetria-tbody');
      var cards = document.getElementById('telemetria-cards');
      if (!tbody || !cards) return;
      if (err || !data || !data.ok) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#ef4444;padding:20px;">Erro ao carregar telemetria.</td></tr>';
        return;
      }
      var rows = data.telemetria || [];
      var lucroTotal = 0, online = 0, vendasHoje = 0, funcTotal = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        lucroTotal += parseFloat(r.lucro || 0);
        if (r.online == 1) online++;
        vendasHoje += parseFloat(r.vendas_hoje || 0);
        funcTotal += parseInt(r.funcionarios_ativos || 0);
      }
      cards.innerHTML = statCard('Estabelecimentos', rows.length, '#3b82f6') + statCard('Online agora', online, '#22c55e') + statCard('Vendas hoje', 'R$ ' + vendasHoje.toFixed(2).replace('.', ','), '#f59e0b') + statCard('Lucro est. total', 'R$ ' + lucroTotal.toFixed(2).replace('.', ','), '#22c55e') + statCard('Funcionários', funcTotal, '#a78bfa');
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--text-muted);padding:20px;">Sem telemetria ainda. As instalações enviam dados automaticamente.</td></tr>';
        return;
      }
      var html = '';
      for (var j = 0; j < rows.length; j++) {
        var t = rows[j];
        var statusCell = t.online == 1 ? '<span style="color:#22c55e;font-weight:600;">● Online</span>' : '<span style="color:#ef4444;">● Offline</span>';
        var lucro = parseFloat(t.lucro || 0);
        var lucroColor = lucro >= 0 ? '#22c55e' : '#ef4444';
        var tempoUso = t.tempo_uso_min > 60 ? Math.round(t.tempo_uso_min / 60) + 'h' : (t.tempo_uso_min || 0) + 'min';
        html += '<tr>' +
          '<td style="font-weight:600;color:white;">' + escapeHtml(t.nome_restaurante || t.rest_nome || '—') +
            (t.admin_login ? '<br><span style="font-size:11px;color:var(--text-muted);">' + escapeHtml(t.admin_login) + '</span>' : '') +
            (t.chave_ativacao ? '<br><span style="font-size:11px;color:#f59e0b;">' + escapeHtml(t.chave_ativacao) + '</span>' : '') +
          '</td>' +
          '<td>' + statusCell + '<br><span style="font-size:11px;color:var(--text-muted);">' + escapeHtml(t.ultima_atividade || '—') + '</span></td>' +
          '<td>R$ ' + parseFloat(t.vendas_hoje || 0).toFixed(2).replace('.', ',') + '</td>' +
          '<td>R$ ' + parseFloat(t.vendas_total || 0).toFixed(2).replace('.', ',') + '</td>' +
          '<td>' + (t.pedidos_total || 0) + '</td>' +
          '<td>' + (t.funcionarios_ativos || 0) + '</td>' +
          '<td>' + (t.produtos_total || 0) + '</td>' +
          '<td>' + (t.mesas_total || 0) + '</td>' +
          '<td>' + (t.dispositivos || 0) + '</td>' +
          '<td>' + tempoUso + '</td>' +
          '<td style="color:' + lucroColor + ';font-weight:600;">R$ ' + lucro.toFixed(2).replace('.', ',') + '</td>' +
          '<td>' + (t.disco_mb || 0) + ' MB</td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
    });
  };

  function statCard(label, value, color) {
    return '<div style="background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:10px;padding:12px;text-align:center;">' +
      '<div style="font-size:1.25rem;font-weight:700;color:' + color + ';">' + value + '</div>' +
      '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">' + label + '</div></div>';
  }

  /* ═══ APPS SCRIPT & SHEETS — Configuração do servidor de licenças (super admin apenas) ═══ */
  window.salvarConfigSuperLicenca = function() {
    var g = function(id) { return document.getElementById(id); };
    var scriptUrl = (g('super-cfg-script-url') ? g('super-cfg-script-url').value : '').trim();
    var sheetId = (g('super-cfg-sheet-id') ? g('super-cfg-sheet-id').value : '').trim();
    var trialDias = parseInt(g('super-cfg-trial-dias') ? g('super-cfg-trial-dias').value : 14, 10) || 14;
    var modoOffline = g('super-cfg-modo-offline') ? g('super-cfg-modo-offline').checked : false;
    if (_superAdminSocket) {
      _superAdminSocket.emit('save_license_config', { scriptUrl: scriptUrl, sheetId: sheetId, trialDias: trialDias, modoOffline: modoOffline });
    } else {
      showToast('Socket não disponível. Recarregue o painel.', 'warning');
    }
  };

  window.testarConexaoSuperScript = function() {
    if (_superAdminSocket) _superAdminSocket.emit('test_license_connection');
    else showToast('Socket não disponível. Recarregue o painel.', 'warning');
  };

  function _superCfgMsg(tipo, texto) {
    var el = document.getElementById('super-cfg-msg');
    if (!el) return;
    el.style.display = 'block';
    el.style.padding = '12px 16px';
    el.style.borderRadius = '8px';
    el.style.fontWeight = '600';
    el.style.color = tipo === 'success' ? '#34d399' : '#f87171';
    el.style.background = tipo === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
    el.style.border = '1px solid ' + (tipo === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)');
    el.textContent = texto;
    setTimeout(function() { el.style.display = 'none'; }, 7000);
  }

  if (_superAdminSocket) {
    _superAdminSocket.on('license_config_loaded', function(cfg) {
      if (!cfg || !document.getElementById('super-cfg-script-url')) return;
      if (cfg.scriptUrl) document.getElementById('super-cfg-script-url').value = cfg.scriptUrl;
      if (cfg.sheetId) document.getElementById('super-cfg-sheet-id').value = cfg.sheetId;
      if (cfg.trialDias) document.getElementById('super-cfg-trial-dias').value = cfg.trialDias;
      var chk = document.getElementById('super-cfg-modo-offline');
      if (chk) chk.checked = !!cfg.modoOffline;
    });
    _superAdminSocket.on('license_config_saved', function(res) {
      _superCfgMsg(res && res.ok ? 'success' : 'error', res && res.ok ? '✓ Configurações salvas com sucesso!' : '✗ Erro ao salvar: ' + (res ? res.error : 'Sem resposta'));
    });
    _superAdminSocket.on('license_test_result', function(res) {
      if (res && res.ok) _superCfgMsg('success', '✓ Conexão OK! Resposta: ' + JSON.stringify(res.data));
      else _superCfgMsg('error', '✗ Falha na conexão: ' + (res ? res.error : 'Sem resposta'));
    });

    // Ao abrir a seção Licenças, carrega a configuração salva do Apps Script
    document.body.addEventListener('click', function(e) {
      var t = e && e.target;
      while (t && t !== document.body) {
        if (t.classList && t.classList.contains('menu-item') && t.getAttribute('data-target') === 'sec-licencas') {
          _superAdminSocket.emit('get_license_config');
          setTimeout(function() { _superAdminSocket.emit('get_license_config'); }, 1500);
          break;
        }
        t = t.parentNode;
      }
    });
  }

  /* ═══ RENDER FUNÇÕES ═══ */
  var _featuresDef = [];
  var _featurePlans = {};

  window.renderFuncoes = function() {
    apiGet('/api/super/features', function(err, data) {
      var tbody = document.getElementById('func-tbody');
      if (!tbody) return;
      if (err || !data || !data.ok) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:20px;">Erro ao carregar funções: ' + (err ? err.message : (data ? data.erro : 'Sem resposta')) + '</td></tr>';
        return;
      }
      _featuresDef = data.features || [];
      _featurePlans = data.planos || {};
      var tenants = data.tenants || [];
      var searchVal = (document.getElementById('func-search') ? document.getElementById('func-search').value : '').toLowerCase();
      if (searchVal) {
        tenants = tenants.filter(function(t) { return (t.nome || '').toLowerCase().indexOf(searchVal) !== -1; });
      }
      if (tenants.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhum restaurante encontrado.</td></tr>';
        return;
      }
      var html = '';
      for (var i = 0; i < tenants.length; i++) {
        var t = tenants[i];
        var planoColor = t.plano === 'trial' ? '#f59e0b' : (t.plano === 'pro' ? '#3b82f6' : '#c084fc');
        var statusBadge = t.ativo ? '<span class="badge badge-ativo">Ativo</span>' : '<span class="badge badge-bloqueado">Inativo</span>';
        var featureChips = '';
        for (var f = 0; f < _featuresDef.length; f++) {
          var feat = _featuresDef[f];
          var enabled = t.features && t.features[feat.chave];
          var chipBg = enabled ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.1)';
          var chipColor = enabled ? '#34d399' : '#f87171';
          var chipBorder = enabled ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.2)';
          var isOverride = t.overrides && t.overrides.hasOwnProperty(feat.chave);
          var overrideTag = isOverride ? ' <span style="font-size:9px;color:#fbbf24;" title="Override manual">*</span>' : '';
          featureChips += '<span style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:600;background:' + chipBg + ';color:' + chipColor + ';border:1px solid ' + chipBorder + ';margin:2px;cursor:pointer;" ' +
            'onclick="toggleFeature(' + t.id + ',\'' + feat.chave + '\',' + !enabled + ')" ' +
            'title="' + escapeHtml(feat.desc) + '">' +
            escapeHtml(feat.nome) + overrideTag + '</span>';
        }
        html += '<tr>' +
          '<td style="font-weight:600;">' + t.id + '</td>' +
          '<td style="font-weight:600;color:white;">' + escapeHtml(t.nome) + '</td>' +
          '<td><span class="badge badge-plano" style="background:rgba(139,92,246,0.12);color:' + planoColor + ';border:1px solid ' + planoColor + '33;">' + (t.plano || 'premium').toUpperCase() + '</span></td>' +
          '<td>' + statusBadge + '</td>' +
          '<td>' + featureChips + '</td>' +
          '<td>' +
            '<div class="row-actions">' +
              '<button class="btn-row-action edit-action" onclick="resetFeatures(' + t.id + ')" title="Resetar para padrão do plano"><i class="fa-solid fa-rotate-left"></i></button>' +
            '</div>' +
          '</td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
    });
  };

  window.toggleFeature = function(restId, feature, enabled) {
    apiPost('/api/super/features', { restaurante_id: restId, feature: feature, enabled: enabled }, function(err, data) {
      if (err || !data || !data.ok) {
        showToast('Erro ao alterar função: ' + (err ? err.message : (data ? data.erro : 'Falha')), 'danger');
        return;
      }
      showToast('Função ' + (enabled ? 'ativada' : 'desativada') + ' com sucesso!', 'success');
      renderFuncoes();
    });
  };

  window.resetFeatures = function(restId) {
    if (!confirm('Resetar todas as funções deste restaurante para os padrões do plano?')) return;
    apiPost('/api/super/features', { restaurante_id: restId, reset: true }, function(err, data) {
      if (err || !data || !data.ok) {
        showToast('Erro ao resetar funções: ' + (err ? err.message : (data ? data.erro : 'Falha')), 'danger');
        return;
      }
      showToast('Funções resetadas com sucesso!', 'success');
      renderFuncoes();
    });
  };

  var funcSearch = document.getElementById('func-search');
  if (funcSearch) {
    funcSearch.addEventListener('input', function() { renderFuncoes(); });
  }

  /* ═══ SOLICITAÇÕES DE FUNÇÕES ═══ */
  window.carregarSolicitacoesFeatures = function() {
    var box = document.getElementById('solicitacoes-features-body');
    if (!box) return;
    apiGet('/api/super/solicitacoes-features', function(err, data) {
      if (err || !data || !data.ok) { box.innerHTML = '<span style="color:var(--danger);">Erro ao carregar solicitações.</span>'; return; }
      var lista = data.solicitacoes || [];
      if (!lista.length) { box.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#22c55e;"></i> Nenhuma solicitação registrada.'; return; }
      var nomeFeature = function(chave) {
        for (var i = 0; i < (_featuresDef || []).length; i++) {
          if (_featuresDef[i].chave === chave) return _featuresDef[i].nome;
        }
        return chave;
      };
      var html = '<div style="display:flex;flex-direction:column;gap:10px;">';
      lista.forEach(function(s) {
        var pendente = s.status === 'pendente';
        var corBorda = pendente ? 'rgba(168,85,247,0.35)' : 'rgba(100,116,139,0.25)';
        var fundo = pendente ? 'rgba(168,85,247,0.06)' : 'rgba(0,0,0,0.15)';
        html += '<div style="border:1px solid ' + corBorda + ';background:' + fundo + ';border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;">'
          + '<div style="min-width:220px;">'
          + '<strong style="color:#e2e8f0;">#' + s.restaurante_id + ' · ' + escapeHtml(s.restaurante_nome || ('Restaurante ' + s.restaurante_id)) + '</strong>'
          + ' <span class="badge badge-plano" style="margin-left:6px;">' + escapeHtml(nomeFeature(s.feature)) + '</span>'
          + (pendente ? ' <span class="badge badge-ativo">pendente</span>' : (s.status === 'aprovada' ? ' <span style="font-size:11px;color:#34d399;">✓ aprovada</span>' : ' <span style="font-size:11px;color:#f87171;">✕ recusada</span>'))
          + (s.mensagem ? '<div style="margin-top:6px;color:var(--text-muted);font-size:0.8rem;">“' + escapeHtml(s.mensagem) + '”</div>' : '')
          + '<div style="margin-top:4px;font-size:0.72rem;color:var(--text-muted);">' + escapeHtml(s.criado_em || '') + '</div>'
          + '</div>'
          + (pendente
            ? '<div style="display:flex;gap:8px;">'
              + '<button class="btn-action" style="background:#22c55e;color:white;padding:0.45rem 0.9rem;" onclick="resolverSolicitacaoFeature(' + s.id + ',\'aprovar\')"><i class="fa-solid fa-check"></i> Aprovar</button>'
              + '<button class="btn-action" style="background:#ef4444;color:white;padding:0.45rem 0.9rem;" onclick="resolverSolicitacaoFeature(' + s.id + ',\'recusar\')"><i class="fa-solid fa-xmark"></i> Recusar</button>'
              + '</div>'
            : '')
          + '</div>';
      });
      box.innerHTML = html + '</div>';
    });
  };

  window.resolverSolicitacaoFeature = function(id, acao) {
    apiPost('/api/super/solicitacoes-features/' + acao, { id: id }, function(err, data) {
      if (err || !data || !data.ok) { showToast('Erro ao resolver solicitação.', 'error'); return; }
      showToast(data.mensagem || 'Solicitação resolvida!', 'success');
      carregarSolicitacoesFeatures();
    });
  };
  var btnRefreshFunc = document.getElementById('btn-refresh-func');
  if (btnRefreshFunc) {
    btnRefreshFunc.addEventListener('click', function() { renderFuncoes(); });
  }

  /* ═══ RENDER CAPACIDADE ═══ */
  window.renderCapacidade = function() {
    apiGet('/api/super/capacidade', function(err, data) {
      if (err || !data || !data.ok) {
        showToast('Erro ao carregar capacidade: ' + (err ? err.message : (data ? data.erro : 'Sem resposta')), 'danger');
        return;
      }
      var srv = data.server || {};
      var cap = data.capacidade || {};
      var heatmap = data.heatmap || [];
      var tenants = data.tenants || [];

      // Stats
      setTextById('cap-ram-total', (srv.totalRamMB || 0) + ' MB');
      setTextById('cap-ram-used', (srv.usedRamMB || 0) + ' MB');
      setTextById('cap-sockets', srv.socketsAtivos || 0);
      setTextById('cap-tenants', (srv.tenantsAtivos || 0) + '/' + (srv.tenantsTotal || 0));

      // Capacidade
      setTextById('cap-max-tenants', cap.maxTenants || 0);
      setTextById('cap-restantes', cap.restantes || 0);
      setTextById('cap-percentual', (cap.percentual || 0) + '%');
      setTextById('cap-ram-tenant', (cap.ramPorTenantMB || 80) + ' MB');

      // Barra de progresso
      var bar = document.getElementById('cap-bar');
      var barLabel = document.getElementById('cap-bar-label');
      if (bar) {
        var pct = Math.min(100, cap.percentual || 0);
        bar.style.width = pct + '%';
        if (pct > 80) {
          bar.style.background = 'linear-gradient(90deg,var(--warning),var(--danger))';
        } else if (pct > 50) {
          bar.style.background = 'linear-gradient(90deg,var(--success),var(--warning))';
        } else {
          bar.style.background = 'linear-gradient(90deg,var(--success),var(--info))';
        }
      }
      if (barLabel) barLabel.textContent = (cap.percentual || 0) + '%';

      // Modelo realista
      var modelo = cap.modelo || {};
      setTextById('cap-modelo-fonte', modelo.baseadoEmPicos ? 'Picos reais 7d' : 'Estimativa RAM');
      setTextById('cap-sok-max', modelo.capSockets != null ? modelo.capSockets : '--');
      setTextById('cap-uso-sok', modelo.percentualSockets != null ? '(' + modelo.percentualSockets + '% em uso)' : '');
      setTextById('cap-pico-simul', modelo.picoSimultaneo != null ? modelo.picoSimultaneo + ' sockets' : '--');
      setTextById('cap-custo-sok', modelo.custoSocketMB != null ? modelo.custoSocketMB + ' MB' + (modelo.custoSocketAuto ? ' (auto)' : ' (fixo)') : '--');
      setTextById('cap-media-pico', modelo.mediaPicoPorTenant != null ? modelo.mediaPicoPorTenant + ' sockets' : '--');
      var exp = document.getElementById('cap-modelo-explicacao');
      if (exp) {
        if (modelo.baseadoEmPicos) {
          exp.textContent = 'Soma dos picos históricos: ' + (modelo.picoSoma7d || 0) + ' sockets em ' + (modelo.tenantsComPico || 0) +
            ' tenants → pico simultâneo estimado com fator ' + ((modelo.fatorSimultaneidade || 0.7) * 100) +
            '%. Base do processo: ' + (modelo.ramBaseMB || 0) + ' MB de ' + (modelo.ramUtilMB || 0) + ' MB úteis.';
        } else {
          exp.textContent = 'Ainda sem histórico suficiente (mín. 3 tenants com picos registrados). Estimativa teórica: ' +
            (cap.teoricoMaxTenants || '--') + ' tenants a ' + (cap.ramPorTenantMB || 80) + ' MB. Os picos reais alimentarão este modelo automaticamente.';
        }
      }

      // Heatmap
      renderHeatmap(heatmap);

      // Tabela tenants
      var tbody = document.getElementById('cap-tenants-tbody');
      if (tbody) {
        if (tenants.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Nenhum tenant encontrado.</td></tr>';
          return;
        }
        var html = '';
        var sorted = tenants.slice().sort(function(a, b) { return (b.sockets || 0) - (a.sockets || 0); });
        for (var i = 0; i < sorted.length; i++) {
          var t = sorted[i];
          var statusBadge = t.ativo ? '<span class="badge badge-ativo">Ativo</span>' : '<span class="badge badge-bloqueado">Inativo</span>';
          var socketsPct = srv.socketsAtivos > 0 ? Math.round((t.sockets / srv.socketsAtivos) * 100) : 0;
          var barColor = t.sockets > 50 ? 'var(--danger)' : (t.sockets > 20 ? 'var(--warning)' : 'var(--success)');
          html += '<tr>' +
            '<td style="font-weight:600;">' + t.id + '</td>' +
            '<td style="font-weight:600;color:white;">' + escapeHtml(t.nome) + '</td>' +
            '<td><span class="badge badge-plano">' + (t.licenca || 'premium').toUpperCase() + '</span></td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<div style="flex:1;background:rgba(0,0,0,0.3);border-radius:100px;height:8px;overflow:hidden;">' +
                  '<div style="height:100%;width:' + Math.max(2, socketsPct) + '%;background:' + barColor + ';border-radius:100px;transition:width 0.4s;"></div>' +
                '</div>' +
                '<span style="font-weight:700;min-width:30px;text-align:right;color:white;">' + (t.sockets || 0) + '</span>' +
              '</div>' +
            '</td>' +
            '<td style="color:var(--text-muted);">' + (t.hora !== null && t.hora !== undefined ? t.hora + ':00' : '—') + '</td>' +
          '</tr>';
        }
        tbody.innerHTML = html;
      }
    });
  };

  function renderHeatmap(data) {
    var container = document.getElementById('cap-heatmap');
    if (!container) return;
    if (!data || data.length === 0) {
      container.innerHTML = '<div style="width:100%;text-align:center;color:var(--text-muted);padding:20px;">Sem dados de heatmap</div>';
      return;
    }
    var maxSockets = 1;
    for (var i = 0; i < data.length; i++) {
      if (data[i].sockets > maxSockets) maxSockets = data[i].sockets;
    }
    var html = '';
    for (var j = 0; j < data.length; j++) {
      var d = data[j];
      var intensity = maxSockets > 0 ? d.sockets / maxSockets : 0;
      var r = Math.round(59 + (239 - 59) * intensity);
      var g = Math.round(130 + (68 - 130) * intensity);
      var b = Math.round(246 + (68 - 246) * intensity);
      var bgColor = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.15 + intensity * 0.7) + ')';
      var height = Math.max(8, intensity * 100);
      var label = d.hora + ':00 (' + d.sockets + ')';
      html += '<div style="flex:1;background:' + bgColor + ';border-radius:4px 4px 0 0;height:' + height + '%;min-width:20px;position:relative;transition:height 0.4s;cursor:pointer;" title="' + label + '">' +
        '<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:9px;color:var(--text-muted);white-space:nowrap;">' + d.sockets + '</div>' +
        '</div>';
    }
    container.innerHTML = html;
  }

  function setTextById(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  var btnRefreshCap = document.getElementById('btn-refresh-cap');
  if (btnRefreshCap) {
    btnRefreshCap.addEventListener('click', function() { renderCapacidade(); });
  }

  /* ═══ MAPA DE RESTAURANTES CONECTADOS (canvas puro, sem CDN) ═══ */
  var _mapaPontos = [];
  var _mapaSel = null;
  var _mapaView = { cx: -50, cy: -12, pxDeg: 8 }; // centro lng/lat + escala px por grau
  var _mapaArrastando = false;
  var _mapaUltimo = null;
  var _mapaMoveu = false;

  function mapaProjeta(p, w, h) {
    return {
      x: w / 2 + (p.longitude - _mapaView.cx) * _mapaView.pxDeg,
      y: h / 2 - (p.latitude - _mapaView.cy) * _mapaView.pxDeg
    };
  }

  function mapaUnprojeta(px, py, w, h) {
    return {
      longitude: _mapaView.cx + (px - w / 2) / _mapaView.pxDeg,
      latitude: _mapaView.cy - (py - h / 2) / _mapaView.pxDeg
    };
  }

  function desenharMapa() {
    var cv = document.getElementById('mapa-canvas');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);

    // Fundo
    var bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b1220');
    bg.addColorStop(1, '#101a30');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Grade de coordenadas com passo adaptativo
    var passo = 0.5;
    while (passo * _mapaView.pxDeg < 70) passo *= 2;
    ctx.strokeStyle = 'rgba(148,163,184,0.10)';
    ctx.lineWidth = 1;
    ctx.font = '9px sans-serif';
    ctx.fillStyle = 'rgba(148,163,184,0.35)';
    var iniLng = Math.floor(mapaUnprojeta(0, 0, w, h).longitude / passo) * passo;
    for (var L = iniLng; ; L += passo) {
      var x = mapaProjeta({ longitude: L, latitude: 0 }, w, h).x;
      if (x > w + 40) break;
      if (x >= -40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        if (_mapaView.pxDeg > 14) ctx.fillText(L.toFixed(passo < 1 ? 1 : 0), x + 3, h - 6);
      }
    }
    var iniLat = Math.floor(mapaUnprojeta(0, h, w, h).latitude / passo) * passo;
    for (var A = iniLat; ; A += passo) {
      var y = mapaProjeta({ longitude: 0, latitude: A }, w, h).y;
      if (y < -40) break;
      if (y <= h + 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        if (_mapaView.pxDeg > 14) ctx.fillText(A.toFixed(passo < 1 ? 1 : 0), 4, y - 4);
      }
    }

    // Pins
    var comLocal = _mapaPontos.filter(function(p) { return p.temLocal; });
    comLocal.forEach(function(p) {
      var pt = mapaProjeta(p, w, h);
      if (pt.x < -20 || pt.x > w + 20 || pt.y < -20 || pt.y > h + 20) return;
      var raio = p.online ? 7 : 5;
      var cor = !p.ativo ? '#64748b' : (p.online ? '#22c55e' : '#f59e0b');

      // halo
      ctx.fillStyle = p.online ? 'rgba(34,197,94,0.22)' : 'rgba(245,158,11,0.15)';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, raio * 2.6, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = cor;
      ctx.strokeStyle = p.id === _mapaSel ? '#ffffff' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth = p.id === _mapaSel ? 3 : 1.5;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, raio, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // Nome quando zoom suficiente ou selecionado
      if ((_mapaView.pxDeg > 26 || p.id === _mapaSel) && p.nome) {
        ctx.font = 'bold 11px Outfit, sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = 'rgba(2,6,23,0.85)';
        ctx.lineWidth = 3;
        var tx = pt.x + raio + 5, ty = pt.y + 4;
        ctx.strokeText(p.nome, tx, ty);
        ctx.fillText(p.nome, tx, ty);
      }
    });

    var vazio = document.getElementById('mapa-vazio');
    if (vazio) vazio.style.display = comLocal.length === 0 ? 'flex' : 'none';
  }

  window.alternarSubtabMapa = function (tab) {
    var liveCont = document.getElementById('subtab-mapa-live-container');
    var restCont = document.getElementById('subtab-mapa-restaurantes-container');
    var btnLive = document.getElementById('btn-subtab-mapa-live');
    var btnRest = document.getElementById('btn-subtab-mapa-restaurantes');

    if (tab === 'live') {
      if (liveCont) liveCont.style.display = 'block';
      if (restCont) restCont.style.display = 'none';
      if (btnLive) btnLive.classList.add('active');
      if (btnRest) btnRest.classList.remove('active');
      if (!window.liveGeoMapInstance && typeof LiveGeoMap !== 'undefined') {
        var root = document.getElementById('live-geo-map-root');
        if (root) window.liveGeoMapInstance = new LiveGeoMap('live-geo-map-root');
      } else if (window.liveGeoMapInstance && window.liveGeoMapInstance.resizeCanvases) {
        setTimeout(function () { window.liveGeoMapInstance.resizeCanvases(); }, 60);
      }
    } else {
      if (liveCont) liveCont.style.display = 'none';
      if (restCont) restCont.style.display = 'block';
      if (btnRest) btnRest.classList.add('active');
      if (btnLive) btnLive.classList.remove('active');
      window.renderMapa();
    }
  };

  window.renderMapa = function() {
    if (!window.liveGeoMapInstance && typeof LiveGeoMap !== 'undefined') {
      var root = document.getElementById('live-geo-map-root');
      if (root) window.liveGeoMapInstance = new LiveGeoMap('live-geo-map-root');
    } else if (window.liveGeoMapInstance && window.liveGeoMapInstance.resizeCanvases) {
      setTimeout(function () { window.liveGeoMapInstance.resizeCanvases(); }, 60);
    }
    apiGet('/api/super/mapa', function(err, data) {
      if (err || !data || !data.ok) {
        showToast('Erro ao carregar mapa: ' + (err ? err.message : (data ? data.erro : 'Sem resposta')), 'danger');
        return;
      }
      _mapaPontos = data.pontos || [];
      var st = data.stats || {};
      setTextById('mapa-online', (st.online || 0) + '/' + (st.total || 0));
      setTextById('mapa-com-local', (st.comLocal || 0) + '/' + (st.total || 0));
      setTextById('mapa-cidades', (st.cidades || []).length);
      var vendas = 0;
      _mapaPontos.forEach(function(p) { vendas += (p.vendas_hoje || 0); });
      setTextById('mapa-vendas-hoje', formatMoney(vendas));

      var badge = document.getElementById('mapa-online-badge');
      if (badge) {
        badge.style.display = st.online > 0 ? 'inline-block' : 'none';
        badge.textContent = st.online || 0;
      }

      // Auto-fit nos pontos com localização
      var locais = _mapaPontos.filter(function(p) { return p.temLocal; });
      if (locais.length === 1) {
        _mapaView.cx = locais[0].longitude; _mapaView.cy = locais[0].latitude;
        _mapaView.pxDeg = 120;
      } else if (locais.length > 1) {
        var minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        locais.forEach(function(p) {
          minLat = Math.min(minLat, p.latitude); maxLat = Math.max(maxLat, p.latitude);
          minLng = Math.min(minLng, p.longitude); maxLng = Math.max(maxLng, p.longitude);
        });
        var cv = document.getElementById('mapa-canvas');
        var w = cv ? cv.width : 900, h = cv ? cv.height : 560;
        _mapaView.cx = (minLng + maxLng) / 2;
        _mapaView.cy = (minLat + maxLat) / 2;
        var spanX = Math.max(maxLng - minLng, 0.02), spanY = Math.max(maxLat - minLat, 0.02);
        _mapaView.pxDeg = Math.min((w * 0.75) / spanX, (h * 0.75) / spanY);
      }

      renderMapaCidades(st.cidades || []);
      desenharMapa();
    });
  };

  function renderMapaCidades(cidades) {
    var box = document.getElementById('mapa-lista-cidades');
    if (!box) return;
    if (!cidades.length) {
      box.innerHTML = '<span style="color:var(--text-muted);font-size:0.75rem;">Nenhuma cidade registrada ainda.</span>';
      return;
    }
    var html = '';
    cidades.forEach(function(c) {
      html += '<div style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.25);border-radius:10px;padding:9px 12px;">' +
        '<span style="font-size:0.78rem;font-weight:600;color:#e2e8f0;"><i class="fa-solid fa-city" style="color:var(--text-muted);margin-right:6px;"></i>' + escapeHtml(c.nome) + '</span>' +
        '<span class="badge badge-plano">' + c.total + '</span></div>';
    });
    box.innerHTML = html;
  }

  function mostrarDetalhePin(id) {
    var p = _mapaPontos.find(function(x) { return x.id === id; });
    var box = document.getElementById('mapa-detalhe');
    if (!p || !box) return;
    _mapaSel = id;
    box.style.display = 'block';
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">' +
        '<h4 style="font-family:\'Outfit\',sans-serif;margin:0;color:white;"><i class="fa-solid fa-store" style="color:var(--primary);margin-right:8px;"></i>' + escapeHtml(p.nome) + ' <span class="badge badge-plano" style="margin-left:8px;">#' + p.id + ' · ' + String(p.licenca).toUpperCase() + '</span></h4>' +
        '<button onclick="document.getElementById(\'mapa-detalhe\').style.display=\'none\';window.__mapaDeselecionar();" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;">✕</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem;font-size:0.78rem;">' +
        '<div><span style="color:var(--text-muted);">Status:</span> ' + (p.online ? '<span class="badge badge-ativo">Online</span>' : '<span class="badge badge-bloqueado">Offline</span>') + '</div>' +
        '<div><span style="color:var(--text-muted);">Sockets:</span> <strong style="color:#fff;">' + p.sockets + '</strong></div>' +
        '<div><span style="color:var(--text-muted);">Comandas abertas:</span> <strong style="color:#fff;">' + p.comandas_abertas + '</strong></div>' +
        '<div><span style="color:var(--text-muted);">Garçons online:</span> <strong style="color:#fff;">' + p.garcons_online + '</strong></div>' +
        '<div><span style="color:var(--text-muted);">Vendas hoje:</span> <strong style="color:#fff;">' + formatMoney(p.vendas_hoje) + '</strong></div>' +
        '<div><span style="color:var(--text-muted);">Local:</span> <strong style="color:#fff;">' + escapeHtml([p.bairro, p.cidade].filter(Boolean).join(', ') || '—') + '</strong></div>' +
        '<div><span style="color:var(--text-muted);">Coordenadas:</span> <strong style="color:#fff;">' + (p.temLocal ? p.latitude.toFixed(5) + ', ' + p.longitude.toFixed(5) : '—') + '</strong></div>' +
        '<div><span style="color:var(--text-muted);">Última atividade:</span> <strong style="color:#fff;">' + escapeHtml(p.ultima_atividade || '—') + '</strong></div>' +
      '</div>';
    desenharMapa();
  }

  window.__mapaDeselecionar = function() { _mapaSel = null; desenharMapa(); };

  (function initMapaEventos() {
    var cv = document.getElementById('mapa-canvas');
    if (!cv) return;

    function coordsDoEvento(ev) {
      var r = cv.getBoundingClientRect();
      return {
        x: (ev.clientX - r.left) * (cv.width / r.width),
        y: (ev.clientY - r.top) * (cv.height / r.height),
        escalaX: cv.width / r.width
      };
    }

    cv.addEventListener('wheel', function(ev) {
      ev.preventDefault();
      var c = coordsDoEvento(ev);
      var antes = mapaUnprojeta(c.x, c.y, cv.width, cv.height);
      var fator = ev.deltaY < 0 ? 1.18 : 1 / 1.18;
      var novo = Math.min(40000, Math.max(1.5, _mapaView.pxDeg * fator));
      _mapaView.pxDeg = novo;
      var depois = mapaUnprojeta(c.x, c.y, cv.width, cv.height);
      _mapaView.cx += antes.longitude - depois.longitude;
      _mapaView.cy += antes.latitude - depois.latitude;
      desenharMapa();
    }, { passive: false });

    cv.addEventListener('pointerdown', function(ev) {
      if (cv.__chefPinch) return;
      _mapaArrastando = true; _mapaMoveu = false;
      _mapaUltimo = { x: ev.clientX, y: ev.clientY };
      cv.style.cursor = 'grabbing';
      try { cv.setPointerCapture(ev.pointerId); } catch (e) {}
    });

    cv.addEventListener('pointermove', function(ev) {
      var tip = document.getElementById('mapa-tooltip');
      if (_mapaArrastando && _mapaUltimo && ev.buttons && !cv.__chefPinch) {
        var r = cv.getBoundingClientRect();
        var dx = (ev.clientX - _mapaUltimo.x) * (cv.width / r.width);
        var dy = (ev.clientY - _mapaUltimo.y) * (cv.height / r.height);
        if (Math.abs(dx) + Math.abs(dy) > 3) _mapaMoveu = true;
        _mapaView.cx -= dx / _mapaView.pxDeg;
        _mapaView.cy += dy / _mapaView.pxDeg;
        _mapaUltimo = { x: ev.clientX, y: ev.clientY };
        desenharMapa();
        if (tip) tip.style.display = 'none';
        return;
      }
      // Hover: pin mais próximo dentro do raio
      var c = coordsDoEvento(ev);
      var melhor = null, melhorD = 16 * 16;
      _mapaPontos.forEach(function(p) {
        if (!p.temLocal) return;
        var pt = mapaProjeta(p, cv.width, cv.height);
        var d = (pt.x - c.x) * (pt.x - c.x) + (pt.y - c.y) * (pt.y - c.y);
        if (d < melhorD) { melhorD = d; melhor = { p: p, pt: pt }; }
      });
      if (melhor && tip) {
        var m = melhor.p;
        tip.innerHTML = '<strong style="color:#fff;">' + escapeHtml(m.nome) + '</strong><br>' +
          '<span style="color:' + (m.online ? '#22c55e' : '#f59e0b') + ';font-weight:700;">● ' + (m.online ? 'Online' : 'Offline') + '</span>' +
          (m.cidade ? ' · ' + escapeHtml(m.cidade) : '') +
          '<br><span style="color:#94a3b8;">' + m.sockets + ' sockets · ' + formatMoney(m.vendas_hoje) + ' hoje</span>';
        tip.style.display = 'block';
        var rect = cv.getBoundingClientRect();
        var hostRect = cv.parentElement.getBoundingClientRect();
        tip.style.left = Math.min(rect.width - 150, Math.max(0, melhor.pt.x / (cv.width / rect.width) + (hostRect.left - hostRect.left))) + 'px';
        tip.style.top = Math.max(0, melhor.pt.y / (cv.height / rect.height) - 54) + 'px';
      } else if (tip) {
        tip.style.display = 'none';
      }
    });

    cv.addEventListener('pointerup', function(ev) {
      _mapaArrastando = false;
      cv.style.cursor = 'grab';
      if (!_mapaMoveu) {
        var c = coordsDoEvento(ev);
        var melhor = null, melhorD = 16 * 16;
        _mapaPontos.forEach(function(p) {
          if (!p.temLocal) return;
          var pt = mapaProjeta(p, cv.width, cv.height);
          var d = (pt.x - c.x) * (pt.x - c.x) + (pt.y - c.y) * (pt.y - c.y);
          if (d < melhorD) { melhorD = d; melhor = p; }
        });
        if (melhor) mostrarDetalhePin(melhor.id);
      }
    });

    cv.addEventListener('pointerleave', function() {
      _mapaArrastando = false;
      cv.style.cursor = 'grab';
      var tip = document.getElementById('mapa-tooltip');
      if (tip) tip.style.display = 'none';
    });

    var btn = document.getElementById('btn-refresh-mapa');
    if (btn) btn.addEventListener('click', renderMapa);
  })();


  /* ═══ CONTROLE DE CARGA (CHAVE SUPER ADMIN) ═══ */
  var _lcAutoTimer = null;

  function lcModoLabel(m) {
    return { normal: 'Normal', evento: 'Evento / Pico', spool: 'Fila Durável', manutencao: 'Manutenção' }[m] || m;
  }

  window.renderLoadControl = function(keepSilent) {
    apiGet('/api/super/load-control', function(err, data) {
      if (err || !data || !data.ok) {
        if (!keepSilent) showToast('Erro ao carregar controle de carga: ' + (err ? err.message : (data ? data.erro : 'Sem resposta')), 'danger');
        return;
      }
      var c = data.controle || {};
      var m = data.metricas || {};

      // Modo efetivo + cores do cartão principal
      var modo = c.modo_efetivo || 'normal';
      var modoEl = document.getElementById('lc-modo-atual');
      if (modoEl) {
        var label = lcModoLabel(modo);
        if (c.auto_ativo && modo === 'spool' && (c.modo_base || '') !== 'spool') label += ' (auto)';
        modoEl.textContent = label;
      }
      var cardModo = document.getElementById('lc-card-modo');
      if (cardModo) {
        var icon = cardModo.querySelector('.stat-icon');
        var cor = { normal: 'var(--success)', evento: 'var(--info)', spool: 'var(--warning)', manutencao: 'var(--danger)' }[modo] || 'var(--primary)';
        var fundo = { normal: 'rgba(16,185,129,0.15)', evento: 'rgba(59,130,246,0.15)', spool: 'rgba(245,158,11,0.15)', manutencao: 'rgba(239,68,68,0.15)' }[modo] || '';
        cardModo.style.boxShadow = '0 0 18px ' + cor + '33';
        cardModo.style.borderColor = cor;
        if (icon) { icon.style.background = fundo; icon.style.color = cor; }
      }

      // Destaca botão do modo BASE ativo
      var btns = document.querySelectorAll('.lc-modo-btn');
      for (var i = 0; i < btns.length; i++) {
        var ativo = btns[i].getAttribute('data-modo') === (c.modo_base || 'normal');
        btns[i].style.borderColor = ativo ? 'var(--primary)' : 'var(--border-color)';
        btns[i].style.background = ativo ? 'rgba(99,102,241,0.12)' : 'rgba(0,0,0,0.2)';
      }

      // Badge AUTO no menu + banner
      var badge = document.getElementById('lc-menu-badge');
      var banner = document.getElementById('lc-auto-badge');
      var autoOn = !!c.auto_ativo;
      if (badge) badge.style.display = autoOn ? '' : 'none';
      if (banner) banner.style.display = autoOn ? '' : 'none';

      // Métricas principais
      setTextById('lc-pedidos-min', String(m.chegadas_min || 0));
      setTextById('lc-lag', (m.event_loop_lag_ms || 0) + ' ms');
      var filaTxt = String((m.tenants_com_fila || []).length);
      setTextById('lc-fila', filaTxt);

      // Janela recente
      setTextById('lc-m-aceitos', String(m.aceitos_min || 0));
      setTextById('lc-m-enfileirados', String(m.enfileirados_min || 0));
      setTextById('lc-m-processados', String(m.processados_min || 0));
      setTextById('lc-m-recusados', String(m.recusados_min || 0));
      setTextById('lc-m-lagmax', (m.event_loop_lag_max_ms_5min || 0) + ' ms');
      setTextById('lc-m-rss', (m.rss_mb || 0) + ' MB');

      // Balanceamento por restaurante
      renderTenantsBalanceamento(data.tenants || []);

      // Limiar de alta demanda (só atualiza campos não editados)
      var sp = c.spike || {};
      var inpSpike = document.getElementById('lc-spike-threshold');
      if (inpSpike && !inpSpike.dataset.touched) inpSpike.value = sp.limite !== undefined ? sp.limite : 30;
      var inpCd = document.getElementById('lc-spike-cooldown');
      if (inpCd && !inpCd.dataset.touched) inpCd.value = sp.cooldownMin !== undefined ? sp.cooldownMin : 45;

      // Formulário do breaker (só atualiza campos não editados pelo usuário)
      var chk = document.getElementById('lc-auto-enabled');
      if (chk && !chk.dataset.touched) chk.checked = !!c.auto_enabled;
      var lim = c.limites || {};
      var mapIn = { 'lc-lag-threshold': 'lagThresholdMs', 'lc-sustained': 'sustainedMs', 'lc-recovery-lag': 'recoveryLagMs', 'lc-recovery-sustained': 'recoverySustainedMs', 'lc-max-rss': 'maxRssMB' };
      Object.keys(mapIn).forEach(function(id) {
        var inp = document.getElementById(id);
        if (inp && !inp.dataset.touched) inp.value = lim[mapIn[id]] !== undefined ? lim[mapIn[id]] : '';
      });
    });
  };

  window.girarChaveLoadControl = function(modo) {
    var confirmar = {
      manutencao: 'Bloquear NOVOS pedidos em TODOS os restaurantes? Os operadores verão aviso de manutenção.',
      spool: 'Ativar Fila Durável? Pedidos serão aceitos e processados em background (nenhum pedido é perdido).',
      evento: 'Ativar modo Evento/Pico? Push notifications e broadcasts extras serão desligados.',
      normal: 'Voltar à operação NORMAL?'
    };
    if (!confirm(confirmar[modo] || 'Confirmar mudança de modo?')) return;
    apiPost('/api/super/load-control', { baseMode: modo }, function(err, data) {
      if (err || !data || !data.ok) {
        showToast('Falha ao girar a chave: ' + (err ? err.message : (data ? data.erro : 'Sem resposta')), 'danger');
        return;
      }
      showToast('Chave alterada para: ' + lcModoLabel(modo), 'success');
      renderLoadControl(true);
    });
  };

  var DIAS_SEMANA_LC = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' };

  function renderTenantsBalanceamento(tenants) {
    var tbody = document.getElementById('lc-tenants-tbody');
    if (!tbody) return;
    if (!tenants.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="color: var(--text-muted);">Nenhum restaurante cadastrado.</td></tr>';
      return;
    }
    var html = '';
    tenants.forEach(function(t) {
      var pico = t.pico_cadastrado || {};
      var diasTxt = (pico.dias || []).map(function(d) { return DIAS_SEMANA_LC[d] || d; }).join(', ');
      var picoTxt = diasTxt ? (diasTxt + (pico.inicio ? ' · ' + pico.inicio + '–' + (pico.fim || '?') : '')) : '<span style="color: var(--text-muted);">—</span>';
      var corPpm = t.pedidos_min >= 30 ? 'var(--danger)' : (t.pedidos_min >= 10 ? 'var(--warning)' : 'var(--text-muted)');
      var evTxt = t.eventos_ativos > 0
        ? '<span style="color: var(--warning); font-weight: 600;">🎉 ' + t.eventos_ativos + '</span>'
        : '<span style="color: var(--text-muted);">—</span>';
      var sel = '<select class="form-select form-select-sm lc-tenant-override" data-rid="' + t.id + '" style="min-width: 120px;">' +
        '<option value=""' + (!t.override ? ' selected' : '') + '>🌐 Global</option>' +
        '<option value="normal"' + (t.override === 'normal' ? ' selected' : '') + '>Normal</option>' +
        '<option value="evento"' + (t.override === 'evento' ? ' selected' : '') + '>Evento</option>' +
        '<option value="spool"' + (t.override === 'spool' ? ' selected' : '') + '>Fila</option>' +
        '</select>';
      html += '<tr>' +
        '<td>' + escHtml(t.nome || ('#' + t.id)) + (!t.ativo ? ' <span style="color: var(--text-muted); font-size: 0.75rem;">(inativo)</span>' : '') + '</td>' +
        '<td style="font-weight: 700; color: ' + corPpm + ';">' + t.pedidos_min + '/min</td>' +
        '<td>' + picoTxt + '</td>' +
        '<td style="text-align: center;">' + evTxt + '</td>' +
        '<td><span style="font-size: 0.78rem; padding: 2px 8px; border-radius: 999px; background: rgba(99,102,241,0.15);">' + lcModoLabel(t.modo_efetivo) + '</span></td>' +
        '<td>' + sel + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  }

  window.salvarOverrideTenantLC = function(restauranteId, modo) {
    apiPost('/api/super/load-control/tenant', { restaurante_id: restauranteId, modo: modo || null }, function(err, data) {
      if (err || !data || !data.ok) {
        showToast('Falha ao aplicar modo ao restaurante: ' + (err ? err.message : (data ? data.erro : 'Sem resposta')), 'danger');
        return;
      }
      showToast(modo ? ('Restaurante #' + restauranteId + ' em modo: ' + lcModoLabel(modo)) : ('Restaurante #' + restauranteId + ' voltou ao modo global.'), 'success');
      renderLoadControl(true);
    });
  };

  window.salvarConfigLoadControl = function() {
    var payload = {
      autoEnabled: !!(document.getElementById('lc-auto-enabled') || {}).checked,
      lagThresholdMs: parseInt((document.getElementById('lc-lag-threshold') || {}).value, 10),
      sustainedMs: parseInt((document.getElementById('lc-sustained') || {}).value, 10),
      recoveryLagMs: parseInt((document.getElementById('lc-recovery-lag') || {}).value, 10),
      recoverySustainedMs: parseInt((document.getElementById('lc-recovery-sustained') || {}).value, 10),
      maxRssMB: parseInt((document.getElementById('lc-max-rss') || {}).value, 10)
    };
    Object.keys(payload).forEach(function(k) { if (isNaN(payload[k])) delete payload[k]; });
    apiPost('/api/super/load-control', payload, function(err, data) {
      if (err || !data || !data.ok) {
        showToast('Falha ao salvar: ' + (err ? err.message : (data ? data.erro : 'Sem resposta')), 'danger');
        return;
      }
      showToast('Proteção automática atualizada!', 'success');
      renderLoadControl(true);
    });
  };

  window.salvarSpikeLoadControl = function() {
    var payload = {
      spikeThreshold: parseInt((document.getElementById('lc-spike-threshold') || {}).value, 10),
      spikeCooldownMin: parseInt((document.getElementById('lc-spike-cooldown') || {}).value, 10)
    };
    Object.keys(payload).forEach(function(k) { if (isNaN(payload[k])) delete payload[k]; });
    if (!Object.keys(payload).length) return;
    apiPost('/api/super/load-control', payload, function(err, data) {
      if (err || !data || !data.ok) {
        showToast('Falha ao salvar limiar: ' + (err ? err.message : (data ? data.erro : 'Sem resposta')), 'danger');
        return;
      }
      showToast('Limiar de alta demanda atualizado!', 'success');
      renderLoadControl(true);
    });
  };

  (function setupLoadControlEvents() {
    var grid = document.getElementById('lc-modos-grid');
    if (grid) {
      grid.addEventListener('click', function(ev) {
        var btn = ev.target.closest ? ev.target.closest('.lc-modo-btn') : null;
        if (btn) girarChaveLoadControl(btn.getAttribute('data-modo'));
      });
    }
    var btnSave = document.getElementById('btn-lc-save');
    if (btnSave) btnSave.addEventListener('click', salvarConfigLoadControl);
    var btnRef = document.getElementById('btn-lc-refresh');
    if (btnRef) btnRef.addEventListener('click', function() { renderLoadControl(true); });
    var tbTenants = document.getElementById('lc-tenants-tbody');
    if (tbTenants) {
      tbTenants.addEventListener('change', function(ev) {
        var sel = ev.target.closest ? ev.target.closest('.lc-tenant-override') : null;
        if (sel) salvarOverrideTenantLC(sel.getAttribute('data-rid'), sel.value || null);
      });
    }
    var btnSpike = document.getElementById('btn-lc-spike-save');
    if (btnSpike) btnSpike.addEventListener('click', salvarSpikeLoadControl);
    ['lc-spike-threshold', 'lc-spike-cooldown'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', function() { el.dataset.touched = '1'; });
    });
    ['lc-auto-enabled', 'lc-lag-threshold', 'lc-sustained', 'lc-recovery-lag', 'lc-recovery-sustained', 'lc-max-rss'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', function() { el.dataset.touched = '1'; });
    });
    var chkAR = document.getElementById('lc-autorefresh');
    if (chkAR) {
      chkAR.addEventListener('change', function() {
        if (_lcAutoTimer) { clearInterval(_lcAutoTimer); _lcAutoTimer = null; }
        if (chkAR.checked) startLcAuto();
      });
    }
    function startLcAuto() {
      _lcAutoTimer = setInterval(function() {
        var sec = document.getElementById('sec-load-control');
        if (sec && sec.className.indexOf('active') !== -1) renderLoadControl(true);
      }, 5000);
    }
    startLcAuto();
  })();


  /* ═══ RENDER DOMÍNIOS & GERENCIAMENTO DE SUBDOMÍNIOS ═══ */
  var _baseDomain = 'chefcozinha.com.br';

  window.slugifyString = function(str) {
    if (!str) return '';
    return str
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 35);
  };

  function updateBaseDomainUI(newBase) {
    if (!newBase) return;
    _baseDomain = newBase.trim().toLowerCase();
    var suffixEls = [document.getElementById('dom-base-suffix'), document.getElementById('inst-base-suffix'), document.getElementById('wizard-base-suffix')];
    suffixEls.forEach(function(el) {
      if (el) el.textContent = '.' + _baseDomain;
    });
    var baseInput = document.getElementById('cfg-base-domain-input');
    if (baseInput && !baseInput.matches(':focus')) baseInput.value = _baseDomain;
    var basePreview = document.getElementById('dom-metric-base-preview');
    if (basePreview) basePreview.textContent = _baseDomain;
  }

  window.renderDominios = function() {
    apiGet('/api/super/dominios', function(err, data) {
      var tbody = document.getElementById('dom-tbody');
      var select = document.getElementById('dom-tenant-select');
      if (!tbody) return;
      if (err || !data || !data.ok) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--danger);padding:20px;">Erro ao carregar domínios: ' + (err ? err.message : (data ? data.erro : 'Sem resposta')) + '</td></tr>';
        return;
      }
      _baseDomain = data.baseDomain || 'chefcozinha.com.br';
      updateBaseDomainUI(_baseDomain);

      var allTenants = data.tenants || [];

      // Update metrics
      var metricTotal = document.getElementById('dom-metric-total');
      var metricSubdoms = document.getElementById('dom-metric-subdoms');
      var metricCustom = document.getElementById('dom-metric-custom');
      if (metricTotal) metricTotal.textContent = allTenants.length;
      if (metricSubdoms) metricSubdoms.textContent = allTenants.filter(function(t) { return t.slug && t.slug.trim(); }).length;
      if (metricCustom) metricCustom.textContent = allTenants.filter(function(t) { return t.custom_domain && t.custom_domain.trim(); }).length;

      // Populate select
      if (select) {
        var currentVal = select.value;
        select.innerHTML = '<option value="">Selecione um restaurante...</option>';
        for (var s = 0; s < allTenants.length; s++) {
          var t = allTenants[s];
          var opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = '#' + t.id + ' — ' + (t.nome || 'Sem nome') + (t.slug ? ' (' + t.slug + ')' : ' [sem subdomínio]');
          select.appendChild(opt);
        }
        if (currentVal) select.value = currentVal;
      }

      // Filter
      var tenants = allTenants;
      var searchVal = (document.getElementById('dom-search') ? document.getElementById('dom-search').value : '').toLowerCase().trim();
      if (searchVal) {
        tenants = tenants.filter(function(t) {
          return (String(t.id) === searchVal) ||
                 (t.nome || '').toLowerCase().indexOf(searchVal) !== -1 ||
                 (t.slug || '').toLowerCase().indexOf(searchVal) !== -1 ||
                 (t.custom_domain || '').toLowerCase().indexOf(searchVal) !== -1;
        });
      }

      if (tenants.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;"><i class="fa-solid fa-inbox" style="font-size:1.5rem;display:block;margin-bottom:0.5rem;"></i>Nenhuma instância encontrada para o filtro.</td></tr>';
        return;
      }

      var html = '';
      for (var i = 0; i < tenants.length; i++) {
        var item = tenants[i];
        var slugUrl = item.slug ? 'https://' + item.slug + '.' + _baseDomain : '';
        var customUrl = item.custom_domain ? 'https://' + item.custom_domain : '';

        var slugDisplay = item.slug
          ? '<div style="display:flex;align-items:center;gap:0.4rem;">' +
              '<code style="background:rgba(16,185,129,0.12);color:#34d399;padding:3px 7px;border-radius:6px;font-size:0.84rem;font-weight:600;">' + escapeHtml(item.slug) + '</code>' +
              '<button type="button" class="btn-row-action" style="padding:2px 6px;font-size:0.75rem;" onclick="copyDomainUrl(\'' + escapeHtml(slugUrl) + '\')" title="Copiar URL Completa"><i class="fa-solid fa-copy"></i></button>' +
            '</div>'
          : '<span style="color:var(--text-muted);font-style:italic;font-size:0.82rem;">Não configurado</span>';

        var urlLinkDisplay = item.slug
          ? '<a href="' + slugUrl + '" target="_blank" rel="noopener noreferrer" style="color:var(--info);text-decoration:none;display:inline-flex;align-items:center;gap:0.35rem;font-size:0.82rem;font-family:monospace;">' +
              '<i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.75rem;"></i>' + escapeHtml(slugUrl) +
            '</a>'
          : '<span style="color:var(--text-muted);">—</span>';

        var customDisplay = item.custom_domain
          ? '<div style="display:flex;align-items:center;gap:0.4rem;">' +
              '<code style="background:rgba(168,85,247,0.12);color:#c084fc;padding:3px 7px;border-radius:6px;font-size:0.84rem;">' + escapeHtml(item.custom_domain) + '</code>' +
              '<a href="' + customUrl + '" target="_blank" class="btn-row-action" style="padding:2px 6px;font-size:0.75rem;color:#c084fc;text-decoration:none;" title="Abrir Domínio"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>' +
            '</div>'
          : '<span style="color:var(--text-muted);">—</span>';

        var statusBadge = item.ativo ? '<span class="badge badge-ativo"><i class="fa-solid fa-circle-check"></i> Ativo</span>' : '<span class="badge badge-bloqueado">Inativo</span>';

        html += '<tr>' +
          '<td style="font-weight:700;color:var(--text-muted);">' + item.id + '</td>' +
          '<td>' +
            '<div style="font-weight:600;color:white;font-size:0.92rem;">' + escapeHtml(item.nome || 'Sem nome') + '</div>' +
            '<div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Plano: ' + escapeHtml(item.licenca || 'trial') + '</div>' +
          '</td>' +
          '<td>' + slugDisplay + '</td>' +
          '<td>' + urlLinkDisplay + '</td>' +
          '<td>' + customDisplay + '</td>' +
          '<td>' + statusBadge + '</td>' +
          '<td>' +
            '<div class="row-actions" style="justify-content:flex-end;">' +
              (item.slug ? '<a href="' + slugUrl + '" target="_blank" class="btn-row-action" title="Abrir Instância"><i class="fa-solid fa-globe" style="color:var(--success);"></i></a>' : '') +
              '<button class="btn-row-action edit-action" onclick="editDomain(' + item.id + ',\'' + escapeHtml(item.slug || '') + '\',\'' + escapeHtml(item.custom_domain || '') + '\')" title="Editar Subdomínio"><i class="fa-solid fa-pen"></i></button>' +
              '<button class="btn-row-action delete-action" onclick="deleteDomain(' + item.id + ')" title="Remover Domínios"><i class="fa-solid fa-trash"></i></button>' +
            '</div>' +
          '</td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
    });
  };

  window.editDomain = function(id, slug, customDomain) {
    var select = document.getElementById('dom-tenant-select');
    var slugInput = document.getElementById('dom-slug');
    var customInput = document.getElementById('dom-custom');
    if (select) select.value = id;
    if (slugInput) slugInput.value = slug || '';
    if (customInput) customInput.value = customDomain || '';
    updateDomFormPreview();
    if (slugInput) slugInput.focus();
    var banner = document.getElementById('sec-dominios');
    if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function updateDomFormPreview() {
    var slugInput = document.getElementById('dom-slug');
    var previewBanner = document.getElementById('dom-preview-banner');
    var previewText = document.getElementById('dom-preview-url-text');
    var slug = (slugInput ? slugInput.value : '').trim();
    if (slug && previewBanner && previewText) {
      previewBanner.style.display = 'block';
      previewText.textContent = 'https://' + slug + '.' + _baseDomain;
    } else if (previewBanner) {
      previewBanner.style.display = 'none';
    }
  }

  window.copyDomainUrl = function(url) {
    if (!url) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function() {
        showToast('URL copiada para a área de transferência: ' + url, 'success');
      }).catch(function() {
        showToast('URL: ' + url, 'info');
      });
    } else {
      showToast('URL: ' + url, 'info');
    }
  };

  window.deleteDomain = function(restId) {
    if (!confirm('Tem certeza que deseja desvincular o subdomínio e domínio próprio desta instância (ID ' + restId + ')?')) return;
    apiDelete('/api/super/dominios', { restaurante_id: restId }, function(err, data) {
      if (err || !data || !data.ok) {
        showToast('Erro ao remover domínios: ' + (err ? err.message : (data ? data.erro : 'Falha')), 'danger');
        return;
      }
      showToast('Subdomínio e domínios desvinculados com sucesso!', 'success');
      renderDominios();
    });
  };

  // Salvar Domínio no form inline
  var btnSalvarDom = document.getElementById('btn-salvar-dom');
  if (btnSalvarDom) {
    btnSalvarDom.addEventListener('click', function() {
      var select = document.getElementById('dom-tenant-select');
      var slugInput = document.getElementById('dom-slug');
      var customInput = document.getElementById('dom-custom');
      var tenantId = select ? parseInt(select.value, 10) : 0;
      if (!tenantId) {
        showToast('Selecione uma instância/restaurante para associar.', 'warning');
        if (select) select.focus();
        return;
      }
      var cleanSlug = (slugInput ? slugInput.value : '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      var cleanCustom = (customInput ? customInput.value : '').trim().toLowerCase();

      var payload = {
        restaurante_id: tenantId,
        slug: cleanSlug,
        custom_domain: cleanCustom
      };

      btnSalvarDom.disabled = true;
      btnSalvarDom.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Salvando...</span>';

      apiPost('/api/super/dominios', payload, function(err, data) {
        btnSalvarDom.disabled = false;
        btnSalvarDom.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>Salvar Domínio</span>';
        if (err || !data || !data.ok) {
          showToast('Erro ao salvar domínio: ' + (err ? err.message : (data ? data.erro : 'Falha')), 'danger');
          return;
        }
        var targetUrl = cleanSlug ? 'https://' + cleanSlug + '.' + _baseDomain : (cleanCustom ? 'https://' + cleanCustom : '');
        showToast('Domínio configurado com sucesso! ' + (targetUrl ? 'Rota ativa: ' + targetUrl : ''), 'success');
        renderDominios();
      });
    });
  }

  // Gerar slug do restaurante selecionado
  var btnAutoSlugForm = document.getElementById('btn-auto-slug-form');
  if (btnAutoSlugForm) {
    btnAutoSlugForm.addEventListener('click', function() {
      var select = document.getElementById('dom-tenant-select');
      if (!select || !select.value) {
        showToast('Selecione um restaurante primeiro.', 'warning');
        return;
      }
      var selectedText = select.options[select.selectedIndex].text;
      var rawName = selectedText.split('—')[1] || selectedText;
      rawName = rawName.split('(')[0].split('[')[0].trim();
      var slug = window.slugifyString(rawName);
      var slugInput = document.getElementById('dom-slug');
      if (slugInput) {
        slugInput.value = slug;
        updateDomFormPreview();
      }
    });
  }

  var domSlugInput = document.getElementById('dom-slug');
  if (domSlugInput) {
    domSlugInput.addEventListener('input', function() {
      this.value = this.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      updateDomFormPreview();
    });
  }

  // Salvar Domínio Base da Plataforma
  var btnSalvarBaseDomain = document.getElementById('btn-salvar-base-domain');
  if (btnSalvarBaseDomain) {
    btnSalvarBaseDomain.addEventListener('click', function() {
      var input = document.getElementById('cfg-base-domain-input');
      var val = (input ? input.value : '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!val || val.length < 3) {
        showToast('Informe um domínio base válido (ex: chefcozinha.com.br).', 'warning');
        return;
      }
      btnSalvarBaseDomain.disabled = true;
      btnSalvarBaseDomain.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
      apiPost('/api/super/dominios/base-domain', { base_domain: val }, function(err, data) {
        btnSalvarBaseDomain.disabled = false;
        btnSalvarBaseDomain.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>Salvar Domínio Base</span>';
        if (err || !data || !data.ok) {
          showToast('Erro ao atualizar domínio base: ' + (err ? err.message : (data ? data.erro : 'Falha')), 'danger');
          return;
        }
        showToast('Domínio base da plataforma atualizado para: ' + val, 'success');
        updateBaseDomainUI(val);
        renderDominios();
      });
    });
  }

  // Diagnóstico de Domínios
  var btnDiagnosticoDom = document.getElementById('btn-diagnostico-dom');
  if (btnDiagnosticoDom) {
    btnDiagnosticoDom.addEventListener('click', function() {
      btnDiagnosticoDom.disabled = true;
      btnDiagnosticoDom.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Testando...';
      apiGet('/api/super/dominios/diagnostico', function(err, data) {
        btnDiagnosticoDom.disabled = false;
        btnDiagnosticoDom.innerHTML = '<i class="fa-solid fa-stethoscope"></i> <span>Diagnóstico</span>';
        if (err || !data || !data.ok) {
          showToast('Erro ao executar diagnóstico: ' + (err ? err.message : 'Falha'), 'danger');
          return;
        }
        var m = data.metricas || {};
        var msg = 'Diagnóstico Concluído:\n' +
                  '• Total de Instâncias: ' + (m.total_instancias || 0) + '\n' +
                  '• Com Subdomínio: ' + (m.com_subdominio || 0) + '\n' +
                  '• Com Domínio Próprio: ' + (m.com_dominio_proprio || 0) + '\n' +
                  '• Sem Domínio: ' + (m.sem_dominio || 0) + '\n' +
                  '• Domínio Base Ativo: ' + (data.baseDomain || _baseDomain);
        showToast(msg, 'success');
        renderDominios();
      });
    });
  }

  // Abrir Modal de Nova Instância com Subdomínio
  var btnAbrirModalNovaInst = document.getElementById('btn-abrir-modal-nova-instancia-dom');
  if (btnAbrirModalNovaInst) {
    btnAbrirModalNovaInst.addEventListener('click', function() {
      var modal = document.getElementById('modal-nova-instancia-dom');
      if (!modal) return;
      document.getElementById('inst-nome').value = '';
      document.getElementById('inst-slug').value = '';
      document.getElementById('inst-custom-domain').value = '';
      document.getElementById('inst-admin-email').value = '';
      document.getElementById('inst-admin-senha').value = 'admin123';
      document.getElementById('inst-telefone').value = '';
      updateInstPreview('');
      modal.classList.add('active');
      setTimeout(function() {
        var inp = document.getElementById('inst-nome');
        if (inp) inp.focus();
      }, 100);
    });
  }

  function updateInstPreview(slug) {
    var preview = document.getElementById('inst-url-preview');
    if (!preview) return;
    var clean = (slug || document.getElementById('inst-slug').value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (clean) {
      preview.textContent = 'https://' + clean + '.' + _baseDomain;
      preview.style.color = '#34d399';
    } else {
      preview.textContent = 'https://[subdominio].' + _baseDomain;
      preview.style.color = 'var(--text-muted)';
    }
  }

  var instNomeInput = document.getElementById('inst-nome');
  if (instNomeInput) {
    instNomeInput.addEventListener('input', function() {
      var autoSlug = window.slugifyString(this.value);
      var slugField = document.getElementById('inst-slug');
      if (slugField) {
        slugField.value = autoSlug;
        updateInstPreview(autoSlug);
      }
      var emailField = document.getElementById('inst-admin-email');
      if (emailField && (!emailField.value || emailField.value.indexOf('@') !== -1)) {
        if (autoSlug) emailField.value = 'admin@' + autoSlug + '.com';
      }
    });
  }

  var instSlugInput = document.getElementById('inst-slug');
  if (instSlugInput) {
    instSlugInput.addEventListener('input', function() {
      this.value = this.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      updateInstPreview(this.value);
    });
  }

  var btnInstGerarSlug = document.getElementById('btn-inst-gerar-slug');
  if (btnInstGerarSlug) {
    btnInstGerarSlug.addEventListener('click', function() {
      var nome = (document.getElementById('inst-nome') ? document.getElementById('inst-nome').value : '').trim();
      var slug = window.slugifyString(nome || 'restaurante-' + Math.floor(Math.random()*1000));
      var slugField = document.getElementById('inst-slug');
      if (slugField) {
        slugField.value = slug;
        updateInstPreview(slug);
      }
    });
  }

  // Salvar Nova Instância com Subdomínio
  var btnSalvarNovaInst = document.getElementById('btn-salvar-nova-instancia-dom');
  if (btnSalvarNovaInst) {
    btnSalvarNovaInst.addEventListener('click', function() {
      var nome = (document.getElementById('inst-nome') ? document.getElementById('inst-nome').value : '').trim();
      var slug = (document.getElementById('inst-slug') ? document.getElementById('inst-slug').value : '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      var customDomain = (document.getElementById('inst-custom-domain') ? document.getElementById('inst-custom-domain').value : '').trim().toLowerCase();
      var adminEmail = (document.getElementById('inst-admin-email') ? document.getElementById('inst-admin-email').value : '').trim();
      var adminSenha = (document.getElementById('inst-admin-senha') ? document.getElementById('inst-admin-senha').value : '').trim();
      var plano = document.getElementById('inst-plano') ? document.getElementById('inst-plano').value : 'premium';
      var telefone = (document.getElementById('inst-telefone') ? document.getElementById('inst-telefone').value : '').trim();

      if (!nome) {
        showToast('Informe o nome da nova instância/restaurante.', 'warning');
        document.getElementById('inst-nome').focus();
        return;
      }
      if (!slug) {
        slug = window.slugifyString(nome);
        if (document.getElementById('inst-slug')) document.getElementById('inst-slug').value = slug;
      }
      if (!slug || slug.length < 2) {
        showToast('Informe um subdomínio válido com pelo menos 2 caracteres.', 'warning');
        if (document.getElementById('inst-slug')) document.getElementById('inst-slug').focus();
        return;
      }

      var payload = {
        nome: nome,
        slug: slug,
        custom_domain: customDomain || undefined,
        licenca: plano,
        admin_email: adminEmail || undefined,
        admin_senha: adminSenha || 'admin123',
        admin_nome: 'Administrador ' + nome,
        telefone: telefone || undefined,
        ativo: true
      };

      btnSalvarNovaInst.disabled = true;
      btnSalvarNovaInst.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Criando banco e provisionando subdomínio...</span>';

      apiPost('/api/super/dominios/criar-instancia', payload, function(err, data) {
        btnSalvarNovaInst.disabled = false;
        btnSalvarNovaInst.innerHTML = '<i class="fa-solid fa-rocket"></i> <span>Criar Instância & Provisionar Subdomínio</span>';
        if (err || !data || !data.ok) {
          showToast('Erro ao criar instância: ' + (err ? err.message : (data ? data.erro : 'Falha')), 'danger');
          return;
        }
        var modal = document.getElementById('modal-nova-instancia-dom');
        if (modal) modal.classList.remove('active');

        var directUrl = data.subdomain_url || ('https://' + slug + '.' + _baseDomain);
        showToast('Instância #' + data.id + ' ("' + nome + '") criada com sucesso no subdomínio: ' + slug + '\nURL: ' + directUrl, 'success');

        renderDominios();
        if (typeof carregarRestaurantes === 'function') carregarRestaurantes();
      });
    });
  }

  // Auto-slug in the 5-step wizard
  var newRestNome = document.getElementById('new-rest-nome');
  if (newRestNome) {
    newRestNome.addEventListener('input', function() {
      var slugInput = document.getElementById('new-rest-slug');
      var previewBox = document.getElementById('wizard-domain-preview');
      var previewUrl = document.getElementById('wizard-domain-preview-url');
      if (slugInput) {
        var generated = window.slugifyString(this.value);
        slugInput.value = generated;
        if (generated && previewBox && previewUrl) {
          previewBox.style.display = 'block';
          previewUrl.textContent = 'https://' + generated + '.' + _baseDomain;
        } else if (previewBox) {
          previewBox.style.display = 'none';
        }
      }
    });
  }

  var newRestSlug = document.getElementById('new-rest-slug');
  if (newRestSlug) {
    newRestSlug.addEventListener('input', function() {
      this.value = this.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      var previewBox = document.getElementById('wizard-domain-preview');
      var previewUrl = document.getElementById('wizard-domain-preview-url');
      if (this.value && previewBox && previewUrl) {
        previewBox.style.display = 'block';
        previewUrl.textContent = 'https://' + this.value + '.' + _baseDomain;
      } else if (previewBox) {
        previewBox.style.display = 'none';
      }
    });
  }

  var btnRefreshDom = document.getElementById('btn-refresh-dom');
  if (btnRefreshDom) {
    btnRefreshDom.addEventListener('click', function() { renderDominios(); });
  }
  var domSearch = document.getElementById('dom-search');
  if (domSearch) {
    domSearch.addEventListener('input', function() { renderDominios(); });
  }
  var domTenantSelect = document.getElementById('dom-tenant-select');
  if (domTenantSelect) {
    domTenantSelect.addEventListener('change', function() {
      apiGet('/api/super/dominios', function(err, data) {
        if (err || !data || !data.ok) return;
        var found = (data.tenants || []).find(function(t) { return t.id === parseInt(domTenantSelect.value, 10); });
        if (found) {
          var slugInput = document.getElementById('dom-slug');
          var customInput = document.getElementById('dom-custom');
          if (slugInput) slugInput.value = found.slug || '';
          if (customInput) customInput.value = found.custom_domain || '';
          updateDomFormPreview();
        }
      });
    });
  }

  /* ═══ INSTÂNCIAS ON-PREMISE ═══ */
  window.carregarInstancias = function() {
    apiGet('/api/super/instances', function(err, data) {
      if (err || !data || !data.ok) return;
      renderInstancias(data.instances || []);
    });
    apiGet('/api/super/servers', function(err, data) {
      if (!err && data && data.ok) renderServidoresHub(data.servers || [], data.strategy);
    });
    apiGet('/api/super/sync-queue', function(err, data) {
      var box = document.getElementById('sync-queue-body');
      if (!box) return;
      if (err || !data || !data.ok) { box.innerHTML = '<span style="color:var(--danger);">Erro ao carregar fila.</span>'; return; }
      var itens = data.queue || [];
      if (!itens.length) { box.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#22c55e;"></i> Fila vazia — tudo sincronizado.'; return; }
      var h = '<div style="display:flex;flex-direction:column;gap:8px;">';
      itens.forEach(function(f) {
        h += '<div style="border:1px solid rgba(245,158,11,0.25);background:rgba(245,158,11,0.06);border-radius:8px;padding:8px 10px;">'
          + '<strong style="color:#fbbf24;">' + escapeHtml(f.message_type || 'item') + '</strong>'
          + ' — <span>' + escapeHtml(f.status || 'pending') + '</span>'
          + ' <small style="color:var(--text-muted);">inst. ' + escapeHtml(String(f.instance_id || '?')).substring(0, 12) + '</small>'
          + (f.created_at ? ' <small style="color:var(--text-muted);">(' + timeAgo(f.created_at) + ')</small>' : '')
          + '</div>';
      });
      box.innerHTML = h + '</div>';
    });
    apiGet('/api/super/sync-conflicts', function(err, data) {
      var box = document.getElementById('sync-conflicts-body');
      if (!box) return;
      if (err || !data || !data.ok) { box.innerHTML = '<span style="color:var(--danger);">Erro ao carregar conflitos.</span>'; return; }
      var conflitos = data.conflicts || [];
      if (!conflitos.length) { box.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#22c55e;"></i> Nenhum conflito registrado.'; return; }
      var h2 = '<div style="display:flex;flex-direction:column;gap:8px;">';
      conflitos.forEach(function(c) {
        h2 += '<div style="border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.07);border-radius:8px;padding:8px 10px;">'
          + '<strong style="color:#fca5a5;">' + escapeHtml(c.table_name || 'registro') + '</strong>'
          + (c.record_id != null ? ' #' + escapeHtml(String(c.record_id)) : '')
          + (c.resolution ? '<br><small>Resolução: ' + escapeHtml(c.resolution) + '</small>' : '')
          + (c.resolved_at ? '<br><small style="color:var(--text-muted);">' + escapeHtml(c.resolved_at) + '</small>' : '')
          + '</div>';
      });
      box.innerHTML = h2 + '</div>';
    });
  };

  var serversHubCache = [];

  function renderServidoresHub(servers, strategy) {
    serversHubCache = servers || [];
    var sel = document.getElementById('lb-strategy');
    if (sel && strategy) sel.value = strategy;
    var tbody = document.getElementById('servers-tbody');
    if (!tbody) return;
    if (!servers.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1.2rem;color:var(--text-muted);">Nenhum servidor adicional — tudo rodando neste nó.</td></tr>';
      return;
    }
    var html = '';
    servers.forEach(function(s) {
      html += '<tr>';
      html += '<td><strong>' + escapeHtml(s.nome || '') + '</strong></td>';
      html += '<td><small style="font-family:monospace;">' + escapeHtml((s.url || '') + (s.porta ? ':' + s.porta : '')) + '</small></td>';
      html += '<td>' + (s.peso || 1) + '</td>';
      html += '<td id="srv-status-' + escapeHtml(s.id) + '"><span style="color:#64748b;"><i class="fa-solid fa-clock"></i> —</span></td>';
      html += '<td><div style="display:flex;gap:0.4rem;">'
        + '<button class="btn-row-action" onclick="testarServidorHub(\'' + escapeHtml(s.id) + '\')" title="Testar conexão" style="color:#22c55e;"><i class="fa-solid fa-vial"></i></button> '
        + '<button class="btn-row-action" onclick="removerServidorHub(\'' + escapeHtml(s.id) + '\', \'' + escapeHtml(s.nome || '') + '\')" title="Remover" style="color:var(--danger);"><i class="fa-solid fa-trash"></i></button>'
        + '</div></td></tr>';
    });
    tbody.innerHTML = html;
  }

  window.adicionarServidorHub = function() {
    var nome = prompt('Nome do servidor:', 'Nó 2');
    if (!nome) return;
    var url = prompt('URL base (ex: http://192.168.0.10):', '');
    if (!url) return;
    var porta = prompt('Porta (opcional):', '');
    var peso = prompt('Peso no balanceamento (1-10):', '1') || '1';
    apiPost('/api/super/servers', { nome: nome, url: url, porta: porta, peso: peso }, function(err, data) {
      if (err || !data || !data.ok) { showToast('Erro: ' + (data ? data.erro : err), 'error'); return; }
      showToast('Servidor adicionado!', 'success');
      renderServidoresHub(data.servers || [], null);
    });
  };

  window.testarServidorHub = function(id) {
    var srv = null;
    for (var i = 0; i < serversHubCache.length; i++) {
      if (serversHubCache[i].id === id) { srv = serversHubCache[i]; break; }
    }
    var cel = document.getElementById('srv-status-' + id);
    if (!srv) { if (cel) cel.innerHTML = '<span style="color:#ef4444;">não encontrado</span>'; return; }
    if (cel) cel.innerHTML = '<span style="color:#93c5fd;"><i class="fa-solid fa-spinner fa-spin"></i> testando...</span>';
    apiPost('/api/super/servers/test', { url: srv.url, porta: srv.porta }, function(err, data) {
      if (!cel) return;
      if (err || !data || !data.ok) {
        cel.innerHTML = '<span style="color:#ef4444;"><i class="fa-solid fa-circle-xmark"></i> offline</span>';
        return;
      }
      cel.innerHTML = '<span style="color:#22c55e;"><i class="fa-solid fa-circle-check"></i> online' + (data.latencia ? ' (' + data.latencia + ')' : '') + '</span>';
    });
  };

  window.removerServidorHub = function(id, nome) {
    if (!confirm('Remover o servidor "' + nome + '"?')) return;
    var x = new XMLHttpRequest();
    x.open('DELETE', '/api/super/servers', true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.setRequestHeader('x-super-admin-token', localToken);
    x.onreadystatechange = function() {
      if (x.readyState !== 4) return;
      var data = null;
      try { data = JSON.parse(x.responseText); } catch(e) {}
      if (!data || !data.ok) { showToast('Erro ao remover.', 'error'); return; }
      showToast('Servidor removido.', 'success');
      carregarInstancias();
    };
    x.send(JSON.stringify({ id: id }));
  };

  window.salvarStrategyServidores = function() {
    var sel = document.getElementById('lb-strategy');
    if (!sel) return;
    apiPost('/api/super/servers/strategy', { strategy: sel.value }, function(err, data) {
      if (err || !data || !data.ok) { showToast('Erro ao salvar estratégia.', 'error'); return; }
      showToast('Estratégia de balanceamento salva!', 'success');
    });
  };

  function renderInstancias(instances) {
    var total = instances.length;
    var online = instances.filter(function(i) { return i.status === 'online'; }).length;
    var offline = instances.filter(function(i) { return i.status === 'offline'; }).length;
    var pendingBadge = document.getElementById('offline-count-badge');

    document.getElementById('inst-total').textContent = total;
    document.getElementById('inst-online').textContent = online;
    document.getElementById('inst-offline').textContent = offline;

    if (pendingBadge) {
      if (offline > 0) {
        pendingBadge.style.display = 'inline';
        pendingBadge.textContent = offline;
      } else {
        pendingBadge.style.display = 'none';
      }
    }

    var tbody = document.getElementById('instances-table-body');
    if (!instances.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);">Nenhuma instância on-premise registrada.</td></tr>';
      document.getElementById('inst-pending').textContent = '0';
      return;
    }

    var pendingCount = 0;
    var html = '';
    instances.forEach(function(inst) {
      var statusColor = inst.status === 'online' ? '#00c853' : inst.status === 'deactivated' ? '#ffc107' : '#ff5252';
      var statusIcon = inst.status === 'online' ? 'fa-circle-check' : inst.status === 'deactivated' ? 'fa-circle-pause' : 'fa-circle-xmark';
      var lastHb = inst.last_heartbeat_at ? timeAgo(inst.last_heartbeat_at) : 'Nunca';
      var lastSync = inst.last_sync_at ? timeAgo(inst.last_sync_at) : 'Nunca';

      html += '<tr>';
      html += '<td><strong>' + escHtml(inst.instance_name || 'Sem nome') + '</strong><br><small style="color:var(--text-muted);">' + escHtml(inst.instance_id || '').substring(0, 12) + '...</small></td>';
      html += '<td><span style="color:' + statusColor + ';font-weight:600;"><i class="fa-solid ' + statusIcon + '"></i> ' + escHtml(inst.status || 'unknown') + '</span></td>';
      html += '<td>' + escHtml(inst.software_version || '-') + '</td>';
      html += '<td><small>' + escHtml(lastHb) + '</small></td>';
      html += '<td><small>' + escHtml(lastSync) + '</small></td>';
      html += '<td>';
      html += '<button class="btn-row-action" onclick="detalharInstancia(\'' + escHtml(inst.instance_id) + '\')" title="Detalhes"><i class="fa-solid fa-eye"></i></button> ';
      html += '<button class="btn-row-action" onclick="enviarComandoInstancia(\'' + escHtml(inst.instance_id) + '\', \'force_sync\')" title="Forçar Sync" style="color:#2196f3;"><i class="fa-solid fa-rotate"></i></button> ';
      if (inst.status !== 'deactivated') {
        html += '<button class="btn-row-action" onclick="enviarComandoInstancia(\'' + escHtml(inst.instance_id) + '\', \'deactivate\')" title="Desativar" style="color:#ff5252;"><i class="fa-solid fa-power-off"></i></button>';
      } else {
        html += '<button class="btn-row-action" onclick="enviarComandoInstancia(\'' + escHtml(inst.instance_id) + '\', \'reactivate\')" title="Reativar" style="color:#00c853;"><i class="fa-solid fa-power-off"></i></button>';
      }
      html += '</td>';
      html += '</tr>';
    });
    tbody.innerHTML = html;
    document.getElementById('inst-pending').textContent = pendingCount || '0';
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '-';
    var now = new Date();
    var then = new Date(dateStr);
    var diffMs = now - then;
    var mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return mins + 'min atrás';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h atrás';
    var days = Math.floor(hours / 24);
    return days + 'd atrás';
  }

  window.detalharInstancia = function(instanceId) {
    apiGet('/api/super/instances/' + encodeURIComponent(instanceId), function(err, data) {
      if (err || !data || !data.ok) return alert('Erro ao carregar detalhes da instância.');
      var inst = data.instance;
      var commands = data.commands || [];
      var conflicts = data.conflicts || [];

      var html = '<div style="max-height:60vh;overflow-y:auto;">';
      html += '<h3 style="margin-bottom:1rem;">' + escHtml(inst.instance_name || 'Instância') + '</h3>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-bottom:1rem;">';
      html += '<div><strong>ID:</strong> <small>' + escHtml(inst.instance_id) + '</small></div>';
      html += '<div><strong>Status:</strong> ' + escHtml(inst.status) + '</div>';
      html += '<div><strong>Versão:</strong> ' + escHtml(inst.software_version || '-') + '</div>';
      html += '<div><strong>Tenant ID:</strong> ' + (inst.tenant_id || '-') + '</div>';
      html += '<div><strong>IP:</strong> ' + escHtml(inst.ip_address || '-') + '</div>';
      html += '<div><strong>OS:</strong> ' + escHtml(inst.os_info || '-') + '</div>';
      html += '<div><strong>Registrado:</strong> ' + escHtml(inst.registered_at || '-') + '</div>';
      html += '<div><strong>Último Heartbeat:</strong> ' + escHtml(inst.last_heartbeat_at || '-') + '</div>';
      html += '</div>';

      html += '<div style="margin-bottom:1rem;">';
      html += '<button class="btn-action btn-primary-action" onclick="enviarComandoInstancia(\'' + escHtml(inst.instance_id) + '\', \'get_status\')" style="margin-right:0.5rem;"><i class="fa-solid fa-circle-info"></i> Status Remoto</button>';
      html += '<button class="btn-action" onclick="enviarComandoInstancia(\'' + escHtml(inst.instance_id) + '\', \'force_sync\')" style="margin-right:0.5rem;"><i class="fa-solid fa-rotate"></i> Forçar Sync</button>';
      html += '<button class="btn-action" onclick="enviarComandoInstancia(\'' + escHtml(inst.instance_id) + '\', \'restart\')" style="margin-right:0.5rem;color:#ffc107;"><i class="fa-solid fa-rotate-right"></i> Reiniciar</button>';
      html += '<button class="btn-action" onclick="pushConfigInstancia(\'' + escHtml(inst.instance_id) + '\')" style="margin-right:0.5rem;"><i class="fa-solid fa-paper-plane"></i> Push Config</button>';
      html += '</div>';

      if (commands.length) {
        html += '<h4 style="margin:1rem 0 0.5rem;">Últimos Comandos</h4>';
        html += '<table class="custom-table" style="font-size:0.8rem;"><thead><tr><th>Comando</th><th>Status</th><th>Emitido</th><th>Resultado</th></tr></thead><tbody>';
        commands.forEach(function(c) {
          var sColor = c.status === 'completed' ? '#00c853' : c.status === 'failed' ? '#ff5252' : '#ffc107';
          html += '<tr>';
          html += '<td>' + escHtml(c.command) + '</td>';
          html += '<td style="color:' + sColor + ';">' + escHtml(c.status) + '</td>';
          html += '<td><small>' + escHtml(c.issued_at || '-') + '</small></td>';
          html += '<td><small>' + escHtml((c.result || '').substring(0, 80)) + '</small></td>';
          html += '</tr>';
        });
        html += '</tbody></table>';
      }

      if (conflicts.length) {
        html += '<h4 style="margin:1rem 0 0.5rem;">Conflitos de Sync</h4>';
        html += '<table class="custom-table" style="font-size:0.8rem;"><thead><tr><th>Tabela</th><th>Registro</th><th>Resolução</th><th>Data</th></tr></thead><tbody>';
        conflicts.forEach(function(c) {
          html += '<tr>';
          html += '<td>' + escHtml(c.table_name) + '</td>';
          html += '<td>' + (c.record_id || '-') + '</td>';
          html += '<td>' + escHtml(c.resolution || '-') + '</td>';
          html += '<td><small>' + escHtml(c.resolved_at || '-') + '</small></td>';
          html += '</tr>';
        });
        html += '</tbody></table>';
      }

      html += '</div>';

      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.display = 'flex';
      overlay.innerHTML = '<div class="modal-content" style="max-width:700px;"><div class="modal-header"><h3>Detalhes da Instância</h3><button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body" style="padding:1.5rem;">' + html + '</div></div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    });
  };

  window.enviarComandoInstancia = function(instanceId, command) {
    var confirmMsg = {
      'deactivate': 'Tem certeza que deseja DESATIVAR esta instância?',
      'restart': 'Tem certeza que deseja REINICIAR esta instância?',
      'force_sync': 'Forçar sincronização imediata?',
      'get_status': 'Solicitar status remoto?'
    };
    if (confirmMsg[command] && !confirm(confirmMsg[command])) return;

    var params = {};
    if (command === 'send_message') {
      params = { title: 'Aviso do Admin', body: 'Mensagem do super admin', type: 'info' };
    }

    apiPost('/api/super/remote-command', { instance_id: instanceId, command: command, params: params }, function(err, data) {
      if (err || !data || !data.ok) return alert('Erro ao enviar comando: ' + (data ? data.error : err));
      alert('Comando enviado! ID: ' + data.command_id);
      carregarInstancias();
    });
  };

  window.pushConfigInstancia = function(instanceId) {
    var configStr = prompt('Configs JSON (chave: valor):', '{"restaurant_status": "ativo"}');
    if (!configStr) return;
    try {
      var configs = JSON.parse(configStr);
      apiPost('/api/super/push-config', { instance_id: instanceId, configs: configs }, function(err, data) {
        if (err || !data || !data.ok) return alert('Erro ao enviar config: ' + (data ? data.error : err));
        alert('Config push enviado! ID: ' + data.command_id);
      });
    } catch (e) {
      alert('JSON inválido: ' + e.message);
    }
  };

  var btnRefreshInstances = document.getElementById('btn-refresh-instances');
  if (btnRefreshInstances) {
    btnRefreshInstances.addEventListener('click', function() { carregarInstancias(); });
  }

  /* Supabase wizard */
  var btnSbTest = document.getElementById('btn-supabase-testar');
  var btnSbSave = document.getElementById('btn-supabase-salvar');
  if (btnSbTest) btnSbTest.addEventListener('click', function() { window.testarSupabase(); });
  if (btnSbSave) btnSbSave.addEventListener('click', function() { window.salvarSupabase(); });



/* ═══════════════════════════════════════════════════════════════════════ */
/* ═══ SITE DE VENDAS — CMS COMPLETO ═══════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════ */

var siteVendasConfigs = {};

var SITE_CONFIG_DEFAULTS = {
  site_hero_titulo: 'O Sistema Mais Rápido para Restaurantes, Bares e Pizzarias',
  site_hero_destaque: 'Que Nunca Fica Fora do Ar',
  site_hero_subtitulo: 'Diga adeus a lentidões, pedidos perdidos e travamentos no caixa. PDV ultra-rápido Offline-First, Monitor da Cozinha (KDS), Comanda Mobile ilimitada e Trava Antifraude em uma plataforma moderna e intuitiva.',
  site_hero_badge: 'Sistema Offline-First & Garçom Mobile Ilimitado',
  site_banner_texto: '🔥 Vagas promocionais com 14 Dias Grátis & Atendimento VIP liberadas!',
  site_banner_link_texto: 'Garantir Minha Vaga Grátis →',
  site_cta_principal: 'Começar Teste de 14 Dias Grátis',
  site_cta_secundario: 'Ver Sistema em Ação',
  site_footer_texto: '© 2026 Chef Cozinha. Todos os direitos reservados. Sistema Inteligente para Gestão Gastronômica.',
  site_stats: [
    { valor: '+40%', label: 'Rapidez no Giro de Mesas' },
    { valor: '0', label: 'Erros de Pagamento no Caixa' },
    { valor: '100%', label: 'Atalhos F1-F12 Personalizáveis' },
    { valor: 'Offline', label: 'Não Para se a Internet Cair' }
  ],
  site_faq: [
    { pergunta: 'Preciso de internet para o sistema funcionar?', resposta: 'Não! O Chef Cozinha opera com tecnologia Offline-First com sincronização automática no momento em que a conexão for restabelecida.' },
    { pergunta: 'Quantos garçons e dispositivos posso cadastrar?', resposta: 'Ilimitados! Não cobramos por ponto adicional ou quantidade de celulares conectados.' },
    { pergunta: 'Como funciona o teste grátis?', resposta: 'Você tem 14 dias de acesso completo sem necessidade de cadastrar cartão de crédito.' },
    { pergunta: 'O sistema imprime comprovante e comanda na cozinha?', resposta: 'Sim! Suporta impressoras térmicas (58mm e 80mm) USB, Rede e Bluetooth, além do monitor KDS digital na tela.' },
    { pergunta: 'Consigo migrar meus dados de outro sistema?', resposta: 'Sim! Nossa equipe de suporte faz a importação completa do seu cardápio e clientes sem custo.' }
  ],
  site_planos: [
    { id: 'starter', nome: 'Starter / Lanchonete', desc: 'Ideal para pequenos estabelecimentos e balcão.', preco: 89, features: ['1 Ponto de Caixa (PDV)', 'Módulo Balcão e Delivery', 'Atalhos Teclado F1-F12', 'Trava de Segurança no Caixa', 'Suporte Humanizado'], popular: false, cta: 'Assinar Plano Starter', ativo: true },
    { id: 'profissional', nome: 'Profissional', desc: 'Para restaurantes, bares e pizzarias completas.', preco: 149, features: ['Tudo do plano Starter', 'Fila da Cozinha Dinâmica (KDS)', 'Garçom Mobile (Ilimitados)', 'Ponto Digital via QR Code', 'Relatórios Antifraude & Auditoria', 'Até 3 Caixas Simultâneos'], popular: true, cta: 'Começar 14 Dias Grátis', ativo: true },
    { id: 'enterprise', nome: 'Enterprise / Redes', desc: 'Para grandes operações e redes de restaurantes.', preco: 299, features: ['Tudo do plano Profissional', 'Múltiplas Lojas / Unidades', 'Painel DRE & Curva ABC Avançada', 'Suporte Prioritário 24/7 VIP', 'Treinamento da Equipe incluso', 'Caixas e Usuários Ilimitados'], popular: false, cta: 'Falar com Consultor B2B', ativo: true }
  ],
  site_gateways: {
    asaas_api_key: '',
    asaas_tipo_cobranca: 'PIX',
    asaas_sandbox: false,
    asaas_ativo: false,
    mp_access_token: '',
    mp_public_key: '',
    mp_ativo: false,
    gateway_padrao: 'asaas'
  },
  site_seo_titulo: 'Chef Cozinha — O Sistema Mais Rápido e Completo para Restaurantes e Bares',
  site_seo_descricao: 'Chef Cozinha: Sistema de gestão definitivo para restaurantes, bares, lanchonetes e pizzarias. PDV ultra-rápido Offline-First, KDS Cozinha, Garçom Mobile ilimitado, Trava Antifraude e Ponto Digital. Teste 14 dias grátis sem cartão!',
  site_seo_keywords: 'sistema para restaurantes, sistema para bares, pdv restaurante, kds monitor de cozinha, comanda mobile garcom, ponto digital qr code, sistema de caixa restaurante, comanda eletronica, gestao de pizzaria',
  site_seo_og_imagem: 'https://appchef.up.railway.app/icons/icon-512.png',
  site_seo_og_titulo: 'Chef Cozinha — PDV, KDS e Comanda Mobile',
  site_seo_og_descricao: 'PDV ultra-rápido Offline-First, KDS Cozinha, Garçom Mobile ilimitado, Trava Antifraude e Ponto Digital. Teste 14 dias grátis!',
  site_seo_robots: 'index, follow',
  site_seo_autor: 'Chef Cozinha',
  site_seo_locale: 'pt_BR',
  site_design_fonte: 'Outfit',
  site_design_tema: 'flame',
  site_design_logo_tempo: 0.8,
  site_design_letras_tempo: 1.2,
  site_design_anim_estilo: 'explosion',
  site_consultor_whatsapp: '5511999999999',
  site_consultor_mensagem: 'Olá! Gostaria de saber mais sobre o Chef Cozinha e iniciar o teste grátis.'
};

function getSiteCfg(k) {
  if (siteVendasConfigs && siteVendasConfigs[k] !== undefined && siteVendasConfigs[k] !== null && siteVendasConfigs[k] !== '') {
    return siteVendasConfigs[k];
  }
  return SITE_CONFIG_DEFAULTS[k] !== undefined ? SITE_CONFIG_DEFAULTS[k] : '';
}

function carregarSiteVendas() {
  apiGet('/api/super/config-global', function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao carregar configurações do site.', 'danger');
    siteVendasConfigs = {};
    var cfgs = data.configs || {};
    Object.keys(cfgs).forEach(function(k) {
      if (k.indexOf('site_') === 0) {
        try { siteVendasConfigs[k] = JSON.parse(cfgs[k]); } catch(e) { siteVendasConfigs[k] = cfgs[k]; }
      }
    });
    var savedSub = localStorage.getItem('super_admin_subtab_site_vendas') || 'sv-tab-conteudo';
    renderSiteVendasTab(savedSub);
  });
}

function renderSiteVendasTab(tabId) {
  try { localStorage.setItem('super_admin_subtab_site_vendas', tabId); } catch(e) {}
  var tabs = document.querySelectorAll('.sv-tab-btn');
  var panels = document.querySelectorAll('.sv-tab-panel');
  for (var i = 0; i < tabs.length; i++) {
    var isActive = tabs[i].getAttribute('data-sv-tab') === tabId;
    tabs[i].classList.toggle('active', isActive);
    tabs[i].style.background = isActive ? 'var(--primary, #fc4b15)' : 'transparent';
    tabs[i].style.color = isActive ? '#fff' : 'var(--text-muted, #94a3b8)';
    tabs[i].style.fontWeight = '600';
    tabs[i].style.borderRadius = '8px';
    tabs[i].style.padding = '10px 16px';
    tabs[i].style.border = 'none';
    tabs[i].style.cursor = 'pointer';
  }
  for (var j = 0; j < panels.length; j++) {
    panels[j].style.display = panels[j].id === tabId ? 'block' : 'none';
  }
  if (tabId === 'sv-tab-conteudo') populateSiteConteudo();
  else if (tabId === 'sv-tab-planos') populateSitePlanos();
  else if (tabId === 'sv-tab-gateways') populateSiteGateways();
  else if (tabId === 'sv-tab-tracking') populateSiteTracking();
  else if (tabId === 'sv-tab-consultor') populateSiteConsultor();
  else if (tabId === 'sv-tab-aparencia') populateSiteAparencia();
  else if (tabId === 'sv-tab-blocos') populateSiteBlocos();
  else if (tabId === 'sv-tab-seo') populateSiteSEO();
}

function populateSiteAparencia() {
  setVal('sv-design-fonte', getSiteCfg('site_design_fonte'));
  setVal('sv-design-tema', getSiteCfg('site_design_tema'));
  setVal('sv-design-logo-tempo', getSiteCfg('site_design_logo_tempo'));
  setVal('sv-design-letras-tempo', getSiteCfg('site_design_letras_tempo'));
  setVal('sv-design-anim-estilo', getSiteCfg('site_design_anim_estilo'));
}

function salvarSiteDesign() {
  var configs = {};
  configs.site_design_fonte = document.getElementById('sv-design-fonte').value;
  configs.site_design_tema = document.getElementById('sv-design-tema').value;
  configs.site_design_logo_tempo = parseFloat(document.getElementById('sv-design-logo-tempo').value) || 0.8;
  configs.site_design_letras_tempo = parseFloat(document.getElementById('sv-design-letras-tempo').value) || 1.2;
  configs.site_design_anim_estilo = document.getElementById('sv-design-anim-estilo').value;

  apiPost('/api/super/config-global', configs, function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao salvar aparência.', 'danger');
    showToast('Aparência e Animações salvas com sucesso!', 'success');
    Object.keys(configs).forEach(function(k) {
      siteVendasConfigs[k] = configs[k];
    });
  });
}

/* ── CONTEÚDO ──────────────────────────────────── */
function populateSiteConteudo() {
  setVal('sv-hero-titulo', getSiteCfg('site_hero_titulo'));
  setVal('sv-hero-destaque', getSiteCfg('site_hero_destaque'));
  setVal('sv-hero-subtitulo', getSiteCfg('site_hero_subtitulo'));
  setVal('sv-hero-badge', getSiteCfg('site_hero_badge'));
  setVal('sv-banner-texto', getSiteCfg('site_banner_texto'));
  setVal('sv-banner-link', getSiteCfg('site_banner_link_texto'));
  setVal('sv-cta-principal', getSiteCfg('site_cta_principal'));
  setVal('sv-cta-secundario', getSiteCfg('site_cta_secundario'));
  setVal('sv-footer-texto', getSiteCfg('site_footer_texto'));

  // Stats
  var stats = getSiteCfg('site_stats');
  if (!Array.isArray(stats) || stats.length === 0) stats = SITE_CONFIG_DEFAULTS.site_stats;
  for (var i = 0; i < 4; i++) {
    var s = stats[i] || {valor:'',label:''};
    setVal('sv-stat-valor-' + i, s.valor || '');
    setVal('sv-stat-label-' + i, s.label || '');
  }

  // FAQ
  var faq = getSiteCfg('site_faq');
  if (!Array.isArray(faq) || faq.length === 0) faq = SITE_CONFIG_DEFAULTS.site_faq;
  renderFaqEditor(faq);
}

function setVal(id, v) {
  var el = document.getElementById(id);
  if (el) el.value = v;
}

function salvarSiteConteudo() {
  var configs = {};
  configs.site_hero_titulo = document.getElementById('sv-hero-titulo').value;
  configs.site_hero_destaque = document.getElementById('sv-hero-destaque').value;
  configs.site_hero_subtitulo = document.getElementById('sv-hero-subtitulo').value;
  configs.site_hero_badge = document.getElementById('sv-hero-badge').value;
  configs.site_banner_texto = document.getElementById('sv-banner-texto').value;
  configs.site_banner_link_texto = document.getElementById('sv-banner-link').value;
  configs.site_cta_principal = document.getElementById('sv-cta-principal').value;
  configs.site_cta_secundario = document.getElementById('sv-cta-secundario').value;
  configs.site_footer_texto = document.getElementById('sv-footer-texto').value;

  // Stats
  var stats = [];
  for (var i = 0; i < 4; i++) {
    stats.push({
      valor: document.getElementById('sv-stat-valor-' + i).value,
      label: document.getElementById('sv-stat-label-' + i).value
    });
  }
  configs.site_stats = JSON.stringify(stats);

  // FAQ
  var faqItems = document.querySelectorAll('.sv-faq-item');
  var faq = [];
  for (var j = 0; j < faqItems.length; j++) {
    var pergunta = faqItems[j].querySelector('.sv-faq-pergunta').value.trim();
    var resposta = faqItems[j].querySelector('.sv-faq-resposta').value.trim();
    if (pergunta) faq.push({ pergunta: pergunta, resposta: resposta });
  }
  configs.site_faq = JSON.stringify(faq);

  apiPost('/api/super/config-global', configs, function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao salvar conteúdo.', 'danger');
    showToast('Conteúdo do site atualizado!', 'success');
    Object.keys(configs).forEach(function(k) {
      try { siteVendasConfigs[k] = JSON.parse(configs[k]); } catch(e) { siteVendasConfigs[k] = configs[k]; }
    });
  });
}

function renderFaqEditor(faqList) {
  var container = document.getElementById('sv-faq-container');
  if (!container) return;
  container.innerHTML = '';
  (faqList || []).forEach(function(item, idx) {
    container.innerHTML += '<div class="sv-faq-item" style="background:rgba(0,0,0,0.2);border:1px solid var(--border-color);border-radius:12px;padding:14px;margin-bottom:10px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><strong style="font-size:13px;color:var(--text-muted);">FAQ #' + (idx + 1) + '</strong>' +
      '<button type="button" onclick="this.closest(\'.sv-faq-item\').remove()" style="background:rgba(239,68,68,0.15);color:#ef4444;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;"><i class="fa-solid fa-trash"></i></button></div>' +
      '<input class="sv-faq-pergunta" value="' + escHtml(item.pergunta || '') + '" placeholder="Pergunta" style="width:100%;padding:8px 12px;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:#fff;font-size:13px;margin-bottom:6px;outline:none;">' +
      '<textarea class="sv-faq-resposta" placeholder="Resposta" rows="2" style="width:100%;padding:8px 12px;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:#fff;font-size:13px;resize:vertical;outline:none;">' + escHtml(item.resposta || '') + '</textarea>' +
      '</div>';
  });
}

function adicionarFaq() {
  var container = document.getElementById('sv-faq-container');
  if (!container) return;
  var idx = container.querySelectorAll('.sv-faq-item').length;
  var div = document.createElement('div');
  div.className = 'sv-faq-item';
  div.style.cssText = 'background:rgba(0,0,0,0.2);border:1px solid var(--border-color);border-radius:12px;padding:14px;margin-bottom:10px;';
  div.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><strong style="font-size:13px;color:var(--text-muted);">FAQ #' + (idx + 1) + '</strong>' +
    '<button type="button" onclick="this.closest(\'.sv-faq-item\').remove()" style="background:rgba(239,68,68,0.15);color:#ef4444;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;"><i class="fa-solid fa-trash"></i></button></div>' +
    '<input class="sv-faq-pergunta" value="" placeholder="Pergunta" style="width:100%;padding:8px 12px;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:#fff;font-size:13px;margin-bottom:6px;outline:none;">' +
    '<textarea class="sv-faq-resposta" placeholder="Resposta" rows="2" style="width:100%;padding:8px 12px;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:#fff;font-size:13px;resize:vertical;outline:none;"></textarea>';
  container.appendChild(div);
}

/* ── BLOCOS DA LANDING PAGE (arrastar / adicionar / ocultar / excluir) ── */
var SV_BLOCOS_CAT = {
  banner:          { label: 'Banner Promocional (topo)',      icon: 'fa-bullhorn' },
  header:          { label: 'Menu / Navegação',               icon: 'fa-bars' },
  hero:            { label: 'Hero — Título, CTAs e Stats',    icon: 'fa-rocket' },
  demonstracao:    { label: 'Showcase / Demonstração (Telas)', icon: 'fa-display' },
  'como-funciona': { label: 'Como Funciona (3 Passos)',       icon: 'fa-list-check' },
  funcionalidades: { label: 'Funcionalidades & Recursos',     icon: 'fa-wand-magic-sparkles' },
  comparativo:     { label: 'Comparativo de Recursos',        icon: 'fa-scale-balanced' },
  calculadora:     { label: 'Calculadora ROI / Economia',     icon: 'fa-calculator' },
  depoimentos:     { label: 'Depoimentos / Prova Social',     icon: 'fa-comments' },
  planos:          { label: 'Planos & Preços',                icon: 'fa-tags' },
  faq:             { label: 'FAQ — Dúvidas Frequentes',       icon: 'fa-circle-question' },
  'cta-final':     { label: 'CTA Final (Chamada p/ Ação)',    icon: 'fa-bullseye' },
  rodape:          { label: 'Rodapé / Footer',                icon: 'fa-copyright' }
};
var SV_BLOCOS_DEFAULT = ['banner', 'header', 'hero', 'demonstracao', 'como-funciona', 'funcionalidades', 'comparativo', 'calculadora', 'depoimentos', 'planos', 'faq', 'cta-final', 'rodape'];

var _blocosTemp = [];

function getBlocosAtuais() {
  var b = siteVendasConfigs.site_blocos;
  if (Array.isArray(b) && b.length) {
    return b.filter(function(x) { return x && x.tipo; })
      .map(function(x) { return { tipo: String(x.tipo), ativo: x.ativo !== false }; });
  }
  return SV_BLOCOS_DEFAULT.map(function(t) { return { tipo: t, ativo: true }; });
}

function populateSiteBlocos() {
  renderBlocosEditor(getBlocosAtuais());
}

function renderBlocosEditor(blocos) {
  _blocosTemp = blocos.slice();
  var container = document.getElementById('sv-blocos-container');
  if (!container) return;

  var html = '';
  _blocosTemp.forEach(function(b, idx) {
    var meta = SV_BLOCOS_CAT[b.tipo] || { label: b.tipo, icon: 'fa-file-lines' };
    var visivel = b.ativo !== false;
    html += '<div class="sv-bloco-item" draggable="true" data-idx="' + idx + '"' +
      ' style="display:flex;align-items:center;gap:12px;background:' + (visivel ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.35)') +
      ';border:1px solid var(--border-color);border-radius:12px;padding:10px 14px;margin-bottom:8px;cursor:grab;' +
      (visivel ? '' : 'opacity:0.55;') + '">' +
      '<i class="fa-solid fa-grip-vertical" style="color:#666;font-size:14px;"></i>' +
      '<span style="width:34px;height:34px;border-radius:9px;background:rgba(252,75,21,0.15);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:14px;"><i class="fa-solid ' + meta.icon + '"></i></span>' +
      '<div style="flex:1;min-width:0;"><strong style="font-size:13px;color:#fff;display:block;">' + escHtml(meta.label) + '</strong>' +
      '<small style="color:#888;font-size:11px;">' + (visivel ? 'Visível no site' : 'Oculto') + '</small></div>' +
      '<label style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--text-muted);cursor:pointer;">Visível<input type="checkbox"' + (visivel ? ' checked' : '') +
      ' onchange="toggleBloco(' + idx + ', this.checked)" style="accent-color:var(--success);"></label>' +
      '<button type="button" onclick="excluirBloco(' + idx + ')" title="Excluir bloco"' +
      ' style="background:rgba(239,68,68,0.15);color:#ef4444;border:none;border-radius:7px;padding:6px 10px;cursor:pointer;font-size:12px;"><i class="fa-solid fa-trash"></i></button>' +
      '</div>';
  });
  if (!html) html = '<p style="color:#888;font-size:13px;padding:16px;text-align:center;">Nenhum bloco. Adicione um abaixo.</p>';
  container.innerHTML = html;

  var sel = document.getElementById('sv-blocos-add-tipo');
  if (sel) {
    var presentes = {};
    _blocosTemp.forEach(function(b) { presentes[b.tipo] = true; });
    sel.innerHTML = '<option value="">Adicionar bloco…</option>' +
      Object.keys(SV_BLOCOS_CAT).filter(function(t) { return !presentes[t]; })
        .map(function(t) { return '<option value="' + t + '">' + escHtml(SV_BLOCOS_CAT[t].label) + '</option>'; })
        .join('');
  }
  bindBlocosDnd(container);
}

function bindBlocosDnd(container) {
  if (!container || container._dndBound) return;
  if (typeof Sortable === 'undefined') {
    bindBlocosNativeDnd(container);
    return;
  }
  container._dndBound = true;

  new Sortable(container, {
    animation: 150,
    handle: '.fa-grip-vertical',
    ghostClass: 'sortable-ghost',
    dragClass: 'sortable-drag',
    onStart: function (evt) {
      evt.item.style.opacity = '0.4';
    },
    onEnd: function (evt) {
      var oldIdx = evt.oldIndex;
      var newIdx = evt.newIndex;
      if (oldIdx === newIdx) return;
      var arr = _blocosTemp.slice();
      var moved = arr.splice(oldIdx, 1)[0];
      arr.splice(newIdx, 0, moved);
      renderBlocosEditor(arr);
      showToast('Bloco movido! Clique em Salvar Layout para publicar.', 'info');
    }
  });
}

function bindBlocosNativeDnd(container) {
  if (!container || container._dndBound) return;
  container._dndBound = true;
  var dragIdx = null;

  container.ondragstart = function(e) {
    var item = e.target.closest ? e.target.closest('.sv-bloco-item') : null;
    if (!item) return;
    dragIdx = parseInt(item.getAttribute('data-idx'), 10);
    item.style.opacity = '0.4';
    try { e.dataTransfer.setData('text/plain', String(dragIdx)); } catch (err) { }
    try { e.dataTransfer.effectAllowed = 'move'; } catch (err) { }
  };

  container.ondragend = function() {
    dragIdx = null;
    Array.prototype.forEach.call(container.querySelectorAll('.sv-bloco-item'), function(el) {
      el.style.opacity = el.querySelector('input[type="checkbox"]').checked ? '' : '0.55';
      el.style.borderTopColor = '';
    });
  };

  container.ondragover = function(e) {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch (err) { }
    var item = e.target.closest ? e.target.closest('.sv-bloco-item') : null;
    Array.prototype.forEach.call(container.querySelectorAll('.sv-bloco-item'), function(el) { el.style.borderTopColor = ''; });
    if (item && dragIdx !== null && parseInt(item.getAttribute('data-idx'), 10) !== dragIdx) {
      item.style.borderTopColor = '#fc4b15';
      item.style.borderTopWidth = '2px';
    }
  };

  container.ondrop = function(e) {
    e.preventDefault();
    var item = e.target.closest ? e.target.closest('.sv-bloco-item') : null;
    if (!item || dragIdx === null) return;
    var alvo = parseInt(item.getAttribute('data-idx'), 10);
    if (alvo === dragIdx || isNaN(alvo)) return;
    var arr = _blocosTemp.slice();
    var moved = arr.splice(dragIdx, 1)[0];
    arr.splice(alvo, 0, moved);
    renderBlocosEditor(arr);
    showToast('Bloco movido! Clique em Salvar Layout para publicar.', 'info');
  };
}

window.toggleBloco = function(idx, checked) {
  if (_blocosTemp[idx]) _blocosTemp[idx].ativo = !!checked;
};

window.excluirBloco = function(idx) {
  var arr = _blocosTemp.slice();
  arr.splice(idx, 1);
  renderBlocosEditor(arr);
};

window.adicionarBlocoSel = function() {
  var sel = document.getElementById('sv-blocos-add-tipo');
  if (!sel || !sel.value || !SV_BLOCOS_CAT[sel.value]) return showToast('Escolha um tipo de bloco para adicionar.', 'warning');
  var arr = _blocosTemp.length ? _blocosTemp.slice() : getBlocosAtuais();
  arr.push({ tipo: sel.value, ativo: true });
  renderBlocosEditor(arr);
  showToast('Bloco adicionado ao final da página.', 'success');
};

function salvarSiteBlocos() {
  var arr = (_blocosTemp.length ? _blocosTemp : getBlocosAtuais()).map(function(b) {
    return { tipo: b.tipo, ativo: b.ativo !== false };
  });
  
  apiPost('/api/super/config-global', { site_blocos: JSON.stringify(arr) }, function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao salvar layout.', 'danger');
    siteVendasConfigs.site_blocos = arr;
    showToast('Layout e ordem publicados com sucesso!', 'success');
  });
}

/* ── SEO DO SITE DE VENDAS ─────────────────────────── */
function populateSiteSEO() {
  setVal('sv-seo-titulo', getSiteCfg('site_seo_titulo'));
  setVal('sv-seo-descricao', getSiteCfg('site_seo_descricao'));
  setVal('sv-seo-keywords', getSiteCfg('site_seo_keywords'));
  setVal('sv-seo-og-imagem', getSiteCfg('site_seo_og_imagem'));
  setVal('sv-seo-og-titulo', getSiteCfg('site_seo_og_titulo'));
  setVal('sv-seo-og-descricao', getSiteCfg('site_seo_og_descricao'));
  setVal('sv-seo-robots', getSiteCfg('site_seo_robots') || 'index, follow');
  setVal('sv-seo-autor', getSiteCfg('site_seo_autor'));
  setVal('sv-seo-locale', getSiteCfg('site_seo_locale') || 'pt_BR');
  atualizarContadoresSEO();
}

function atualizarContadoresSEO() {
  var t = document.getElementById('sv-seo-titulo');
  var d = document.getElementById('sv-seo-descricao');
  var ct = document.getElementById('sv-seo-titulo-count');
  var cd = document.getElementById('sv-seo-descricao-count');
  if (t && ct) {
    ct.textContent = t.value.length + '/60 recomendado';
    ct.style.color = t.value.length > 60 ? '#f59e0b' : '#777';
  }
  if (d && cd) {
    cd.textContent = d.value.length + '/155 recomendado';
    cd.style.color = d.value.length > 155 ? '#f59e0b' : '#777';
  }
}

document.addEventListener('input', function(e) {
  if (e.target && (e.target.id === 'sv-seo-titulo' || e.target.id === 'sv-seo-descricao')) atualizarContadoresSEO();
});

function salvarSiteSEO() {
  var configs = {
    site_seo_titulo: document.getElementById('sv-seo-titulo').value.trim(),
    site_seo_descricao: document.getElementById('sv-seo-descricao').value.trim(),
    site_seo_keywords: document.getElementById('sv-seo-keywords').value.trim(),
    site_seo_og_imagem: document.getElementById('sv-seo-og-imagem').value.trim(),
    site_seo_og_titulo: document.getElementById('sv-seo-og-titulo').value.trim(),
    site_seo_og_descricao: document.getElementById('sv-seo-og-descricao').value.trim(),
    site_seo_robots: document.getElementById('sv-seo-robots').value,
    site_seo_autor: document.getElementById('sv-seo-autor').value.trim(),
    site_seo_locale: document.getElementById('sv-seo-locale').value || 'pt_BR'
  };
  apiPost('/api/super/config-global', configs, function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao salvar SEO.', 'danger');
    Object.keys(configs).forEach(function(k) { siteVendasConfigs[k] = configs[k]; });
    showToast('SEO salvo! Google e redes sociais usarão os novos dados.', 'success');
  });
}

/* ── PLANOS ──────────────────────────────────── */
function populateSitePlanos() {
  var planos = getSiteCfg('site_planos');
  if (!Array.isArray(planos) || planos.length === 0) {
    planos = SITE_CONFIG_DEFAULTS.site_planos;
  }
  renderPlanosEditor(planos);
}

function renderPlanosEditor(planos) {
  var container = document.getElementById('sv-planos-container');
  if (!container) return;
  container.innerHTML = '';
  (planos || []).forEach(function(plano, idx) {
    var featuresStr = (plano.features || []).join('\n');
    container.innerHTML += '<div class="sv-plano-item" data-plano-idx="' + idx + '" style="background:rgba(0,0,0,0.2);border:1px solid ' + (plano.popular ? 'var(--primary)' : 'var(--border-color)') + ';border-radius:16px;padding:20px;margin-bottom:16px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          (plano.popular ? '<span style="background:var(--primary);color:#fff;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;">POPULAR</span>' : '') +
          '<strong style="font-size:16px;">' + escHtml(plano.nome || 'Novo Plano') + '</strong>' +
        '</div>' +
        '<div style="display:flex;gap:6px;">' +
          '<button type="button" onclick="removerPlano(' + idx + ')" style="background:rgba(239,68,68,0.15);color:#ef4444;border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;"><i class="fa-solid fa-trash"></i></button>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
        '<div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">ID (slug)</label><input class="sv-plano-id" value="' + escHtml(plano.id || '') + '" style="width:100%;padding:8px 12px;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:#fff;font-size:13px;outline:none;"></div>' +
        '<div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">Nome</label><input class="sv-plano-nome" value="' + escHtml(plano.nome || '') + '" style="width:100%;padding:8px 12px;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:#fff;font-size:13px;outline:none;"></div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">' +
        '<div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">Preço (R$)</label><input type="number" class="sv-plano-preco" value="' + (plano.preco || 0) + '" style="width:100%;padding:8px 12px;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:#fff;font-size:13px;outline:none;"></div>' +
        '<div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">Popular?</label><select class="sv-plano-popular" style="width:100%;padding:8px 12px;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:#fff;font-size:13px;outline:none;"><option value="false"' + (!plano.popular ? ' selected' : '') + '>Não</option><option value="true"' + (plano.popular ? ' selected' : '') + '>Sim</option></select></div>' +
        '<div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">Ativo?</label><select class="sv-plano-ativo" style="width:100%;padding:8px 12px;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:#fff;font-size:13px;outline:none;"><option value="true"' + (plano.ativo !== false ? ' selected' : '') + '>Sim</option><option value="false"' + (plano.ativo === false ? ' selected' : '') + '>Não</option></select></div>' +
      '</div>' +
      '<div style="margin-bottom:10px;"><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">Descrição</label><input class="sv-plano-desc" value="' + escHtml(plano.desc || '') + '" style="width:100%;padding:8px 12px;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:#fff;font-size:13px;outline:none;"></div>' +
      '<div style="margin-bottom:10px;"><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">Texto do Botão CTA</label><input class="sv-plano-cta" value="' + escHtml(plano.cta || '') + '" style="width:100%;padding:8px 12px;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:#fff;font-size:13px;outline:none;"></div>' +
      '<div><label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px;">Features (1 por linha)</label><textarea class="sv-plano-features" rows="4" style="width:100%;padding:8px 12px;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:#fff;font-size:13px;resize:vertical;outline:none;">' + escHtml(featuresStr) + '</textarea></div>' +
      '</div>';
  });
}

function adicionarPlano() {
  var container = document.getElementById('sv-planos-container');
  if (!container) return;
  var planos = coletarPlanos();
  planos.push({ id: 'novo-plano-' + Date.now(), nome: 'Novo Plano', desc: '', preco: 99, features: ['Feature 1'], popular: false, cta: 'Assinar Plano', ativo: true });
  renderPlanosEditor(planos);
}

function removerPlano(idx) {
  var planos = coletarPlanos();
  planos.splice(idx, 1);
  renderPlanosEditor(planos);
}

function coletarPlanos() {
  var items = document.querySelectorAll('.sv-plano-item');
  var planos = [];
  for (var i = 0; i < items.length; i++) {
    planos.push({
      id: items[i].querySelector('.sv-plano-id').value.trim(),
      nome: items[i].querySelector('.sv-plano-nome').value.trim(),
      desc: items[i].querySelector('.sv-plano-desc').value.trim(),
      preco: parseFloat(items[i].querySelector('.sv-plano-preco').value) || 0,
      features: items[i].querySelector('.sv-plano-features').value.split('\n').map(function(l) { return l.trim(); }).filter(Boolean),
      popular: items[i].querySelector('.sv-plano-popular').value === 'true',
      cta: items[i].querySelector('.sv-plano-cta').value.trim(),
      ativo: items[i].querySelector('.sv-plano-ativo').value !== 'false'
    });
  }
  return planos;
}

function salvarSitePlanos() {
  var planos = coletarPlanos();
  var configs = { site_planos: JSON.stringify(planos) };
  apiPost('/api/super/config-global', configs, function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao salvar planos.', 'danger');
    siteVendasConfigs.site_planos = planos;
    showToast('Planos atualizados com sucesso!', 'success');
  });
}

/* ── GATEWAYS ──────────────────────────────────── */
function populateSiteGateways() {
  var gw = getSiteCfg('site_gateways') || SITE_CONFIG_DEFAULTS.site_gateways;
  setVal('sv-gw-asaas-key', gw.asaas_api_key || '');
  setVal('sv-gw-asaas-tipo', gw.asaas_tipo_cobranca || 'PIX');
  var asaasSandbox = document.getElementById('sv-gw-asaas-sandbox');
  if (asaasSandbox) asaasSandbox.checked = !!gw.asaas_sandbox;
  var asaasAtivo = document.getElementById('sv-gw-asaas-ativo');
  if (asaasAtivo) asaasAtivo.checked = !!gw.asaas_ativo;

  setVal('sv-gw-mp-token', gw.mp_access_token || '');
  setVal('sv-gw-mp-public', gw.mp_public_key || '');
  var mpAtivo = document.getElementById('sv-gw-mp-ativo');
  if (mpAtivo) mpAtivo.checked = !!gw.mp_ativo;

  setVal('sv-gw-padrao', gw.gateway_padrao || 'asaas');
}

function salvarSiteGateways() {
  var gw = {
    asaas_api_key: document.getElementById('sv-gw-asaas-key').value.trim(),
    asaas_tipo_cobranca: document.getElementById('sv-gw-asaas-tipo').value,
    asaas_sandbox: document.getElementById('sv-gw-asaas-sandbox').checked,
    asaas_ativo: document.getElementById('sv-gw-asaas-ativo').checked,
    mp_access_token: document.getElementById('sv-gw-mp-token').value.trim(),
    mp_public_key: document.getElementById('sv-gw-mp-public').value.trim(),
    mp_ativo: document.getElementById('sv-gw-mp-ativo').checked,
    gateway_padrao: document.getElementById('sv-gw-padrao').value
  };
  var configs = { site_gateways: JSON.stringify(gw) };
  apiPost('/api/super/config-global', configs, function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao salvar gateways.', 'danger');
    siteVendasConfigs.site_gateways = gw;
    showToast('Gateways de pagamento salvos!', 'success');
  });
}

/* ── TRACKING & PIXELS ─────────────────────────── */
function populateSiteTracking() {
  apiGet('/api/public/tracking-config', function(err, data) {
    if (err || !data || !data.ok) return;
    var cfg = data.config || {};
    setVal('tracking-gtag-site', cfg.gtag_site || '');
    setVal('tracking-gtag-cardapio', cfg.gtag_cardapio || '');
    setVal('tracking-gtag-colaborador', cfg.gtag_colaborador || '');
    setVal('tracking-gtag-home', cfg.gtag_home || '');

    setVal('tracking-pixel-site', cfg.pixel_site || '');
    setVal('tracking-pixel-cardapio', cfg.pixel_cardapio || '');
    setVal('tracking-pixel-colaborador', cfg.pixel_colaborador || '');
    setVal('tracking-pixel-home', cfg.pixel_home || '');
  });
}

function salvarTrackingConfig() {
  var cfg = {
    gtag_site: document.getElementById('tracking-gtag-site').value.trim(),
    gtag_cardapio: document.getElementById('tracking-gtag-cardapio').value.trim(),
    gtag_colaborador: document.getElementById('tracking-gtag-colaborador').value.trim(),
    gtag_home: document.getElementById('tracking-gtag-home').value.trim(),

    pixel_site: document.getElementById('tracking-pixel-site').value.trim(),
    pixel_cardapio: document.getElementById('tracking-pixel-cardapio').value.trim(),
    pixel_colaborador: document.getElementById('tracking-pixel-colaborador').value.trim(),
    pixel_home: document.getElementById('tracking-pixel-home').value.trim()
  };

  apiPost('/api/super/tracking-config', cfg, function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao salvar pixels.', 'danger');
    showToast('Configurações de GTAG e Meta Pixel salvas com sucesso!', 'success');
  });
}

function gerarCopyAnuncio() {
  var cat = document.getElementById('ad-target-category').value;
  apiPost('/api/super/anuncios/gerar-copy', { categoria: cat }, function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao gerar texto de anúncio.', 'danger');
    var copy = data.copy;
    document.getElementById('ad-res-titulo').textContent = copy.titulo;
    document.getElementById('ad-res-subtitulo').textContent = copy.subtitulo;
    document.getElementById('ad-res-texto').textContent = copy.texto;
    document.getElementById('ad-res-cta').textContent = copy.call_to_action + ' (' + copy.link + ')';
    document.getElementById('ad-copy-result').style.display = 'block';
    showToast('Anuncio gerado para ' + cat.toUpperCase() + '!', 'success');
  });
}

function exportarAudienciaCSV() {
  var cat = document.getElementById('ad-target-category').value;
  apiGet('/api/super/anuncios/audiencia-export?categoria=' + encodeURIComponent(cat), function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao exportar audiência.', 'danger');
    var list = data.dados || [];
    if (list.length === 0) return showToast('Nenhum contato encontrado para esta categoria.', 'warning');

    var csvContent = "data:text/csv;charset=utf-8,Nome,Email,Telefone,Tipo\n";
    list.forEach(function(r) {
      var nome = (r.nome || '').replace(/,/g, '');
      var email = (r.email || '').replace(/,/g, '');
      var tel = (r.telefone || '').replace(/,/g, '');
      var tipo = (r.tipo || '').replace(/,/g, '');
      csvContent += [nome, email, tel, tipo].join(",") + "\n";
    });

    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "audiencia_meta_google_" + cat + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exportados ' + list.length + ' contatos em CSV!', 'success');
  });
}

function copiarTextoAnuncio() {
  var t = document.getElementById('ad-res-titulo').textContent + "\n\n" +
          document.getElementById('ad-res-subtitulo').textContent + "\n\n" +
          document.getElementById('ad-res-texto').textContent + "\n\n" +
          "CTA: " + document.getElementById('ad-res-cta').textContent;
  navigator.clipboard.writeText(t).then(function() {
    showToast('Texto do anúncio copiado!', 'success');
  });
}

/* ── CONSULTOR ──────────────────────────────────── */
function populateSiteConsultor() {
  setVal('sv-consultor-whatsapp', getSiteCfg('site_consultor_whatsapp'));
  setVal('sv-consultor-mensagem', getSiteCfg('site_consultor_mensagem'));
}

function salvarSiteConsultor() {
  var configs = {
    site_consultor_whatsapp: document.getElementById('sv-consultor-whatsapp').value.trim(),
    site_consultor_mensagem: document.getElementById('sv-consultor-mensagem').value.trim()
  };
  apiPost('/api/super/config-global', configs, function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao salvar dados do consultor.', 'danger');
    siteVendasConfigs.site_consultor_whatsapp = configs.site_consultor_whatsapp;
    siteVendasConfigs.site_consultor_mensagem = configs.site_consultor_mensagem;
    showToast('Dados do consultor atualizados!', 'success');
  });
}


/* ═══════════════════════════════════════════════════════════════════════ */
/* ═══ AFILIADOS & PARCEIROS — GERENCIAMENTO & MÉTRICAS ════════════════ */
/* ═══════════════════════════════════════════════════════════════════════ */

var afiliadosData = [];

function carregarAfiliados() {
  var tbody = document.getElementById('afil-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Carregando lista de afiliados...</td></tr>';
  }

  apiGet('/api/super/afiliados', function(err, data) {
    if (err || !data || !data.ok) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--danger);">Erro ao carregar afiliados.</td></tr>';
      return;
    }
    afiliadosData = data.afiliados || [];
    renderAfiliados();
  });
}

function renderAfiliados() {
  var search = (document.getElementById('afil-search') ? document.getElementById('afil-search').value : '').toLowerCase().trim();
  var filtered = [];

  for (var i = 0; i < afiliadosData.length; i++) {
    var a = afiliadosData[i];
    if (search) {
      var matchNome = (a.nome || '').toLowerCase().indexOf(search) !== -1;
      var matchEmail = (a.email || '').toLowerCase().indexOf(search) !== -1;
      var matchCod = (a.codigo_ref || '').toLowerCase().indexOf(search) !== -1;
      if (!matchNome && !matchEmail && !matchCod) continue;
    }
    filtered.push(a);
  }

  // Atualizar cards de métricas
  var totalVendas = 0, totalFaturado = 0, totalComissoes = 0;
  afiliadosData.forEach(function(item) {
    totalVendas += (item.total_vendas || 0);
    totalFaturado += (item.total_faturado || 0);
    totalComissoes += (item.total_comissoes || 0);
  });

  setTextById('afil-stat-total', afiliadosData.length);
  setTextById('afil-stat-vendas', totalVendas);
  setTextById('afil-stat-faturamento', 'R$ ' + formatMoney(totalFaturado));
  setTextById('afil-stat-comissoes', 'R$ ' + formatMoney(totalComissoes));

  var tbody = document.getElementById('afil-tbody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--text-muted);">Nenhum afiliado cadastrado ou encontrado.</td></tr>';
    return;
  }

  var html = '';
  for (var j = 0; j < filtered.length; j++) {
    var af = filtered[j];
    var statusBadge = af.status === 'ativo' 
      ? '<span class="badge badge-ativo">Ativo</span>' 
      : '<span class="badge badge-bloqueado">Inativo</span>';

    html += '<tr>' +
      '<td><code style="font-size:12px; opacity:0.7;">#' + af.id + '</code></td>' +
      '<td>' +
        '<div style="font-weight:700; color:#fff;">' + esc(af.nome) + '</div>' +
        '<div style="font-size:12px; color:var(--text-muted);">' + esc(af.email) + (af.telefone ? ' • ' + esc(af.telefone) : '') + '</div>' +
      '</td>' +
      '<td><code style="background:rgba(255,87,34,0.15); color:var(--primary); padding:3px 8px; border-radius:6px; font-weight:700; font-size:13px;">' + esc(af.codigo_ref) + '</code></td>' +
      '<td><strong style="color:#fdba74;">' + (af.comissao_percentual || 10) + '%</strong></td>' +
      '<td style="text-align:center; font-weight:700; color:#fff;">' + (af.total_vendas || 0) + '</td>' +
      '<td>R$ ' + formatMoney(af.total_faturado || 0) + '</td>' +
      '<td style="color:var(--success); font-weight:700;">R$ ' + formatMoney(af.total_comissoes || 0) + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' +
        '<div class="row-actions">' +
          '<button class="btn-row-action select-action" onclick="verMetricasAfiliado(' + af.id + ')" title="Ver Métricas / Vendas"><i class="fa-solid fa-chart-line"></i></button>' +
          '<button class="btn-row-action edit-action" onclick="editarAfiliado(' + af.id + ')" title="Editar Afiliado"><i class="fa-regular fa-pen-to-square"></i></button>' +
          '<button class="btn-row-action delete-action" onclick="excluirAfiliado(' + af.id + ', ' + escJs(af.nome) + ')" title="Excluir Afiliado"><i class="fa-regular fa-trash-can"></i></button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }

  tbody.innerHTML = html;
}

function filtrarTabelaAfiliados() {
  renderAfiliados();
}

function abrirModalNovoAfiliado() {
  document.getElementById('modal-afiliado-title').textContent = 'Novo Afiliado / Parceiro';
  document.getElementById('afil-edit-id').value = '';
  document.getElementById('afil-nome').value = '';
  document.getElementById('afil-email').value = '';
  document.getElementById('afil-telefone').value = '';
  document.getElementById('afil-codigo').value = '';
  document.getElementById('afil-comissao').value = '10';
  document.getElementById('afil-pix').value = '';
  document.getElementById('afil-senha').value = '';
  document.getElementById('modal-afiliado').classList.add('active');
}

function fecharModalAfiliado() {
  document.getElementById('modal-afiliado').classList.remove('active');
}

function editarAfiliado(id) {
  var af = afiliadosData.find(function(item) { return item.id === id; });
  if (!af) return showToast('Afiliado não encontrado.', 'warning');

  document.getElementById('modal-afiliado-title').textContent = 'Editar Afiliado';
  document.getElementById('afil-edit-id').value = af.id;
  document.getElementById('afil-nome').value = af.nome || '';
  document.getElementById('afil-email').value = af.email || '';
  document.getElementById('afil-telefone').value = af.telefone || '';
  document.getElementById('afil-codigo').value = af.codigo_ref || '';
  document.getElementById('afil-comissao').value = af.comissao_percentual || 10;
  document.getElementById('afil-pix').value = af.chave_pix || '';
  document.getElementById('afil-senha').value = '';
  document.getElementById('modal-afiliado').classList.add('active');
}

function salvarAfiliado() {
  var id = document.getElementById('afil-edit-id').value;
  var nome = document.getElementById('afil-nome').value.trim();
  var email = document.getElementById('afil-email').value.trim();
  var telefone = document.getElementById('afil-telefone').value.trim();
  var codigo_ref = document.getElementById('afil-codigo').value.trim().toUpperCase();
  var comissao_percentual = parseFloat(document.getElementById('afil-comissao').value) || 10;
  var chave_pix = document.getElementById('afil-pix').value.trim();
  var senha = document.getElementById('afil-senha').value;

  if (!nome || !email || !codigo_ref) {
    showToast('Nome, E-mail e Código de Referência são obrigatórios!', 'warning');
    return;
  }

  var payload = {
    nome: nome,
    email: email,
    telefone: telefone,
    codigo_ref: codigo_ref,
    comissao_percentual: comissao_percentual,
    chave_pix: chave_pix,
    senha: senha
  };

  if (id) {
    apiPut('/api/super/afiliados/' + id, payload, function(err, data) {
      if (err || !data || !data.ok) return showToast('Erro ao salvar: ' + (data ? data.erro : 'Falha na requisição'), 'danger');
      showToast('Afiliado atualizado com sucesso!', 'success');
      fecharModalAfiliado();
      carregarAfiliados();
    });
  } else {
    apiPost('/api/super/afiliados', payload, function(err, data) {
      if (err || !data || !data.ok) return showToast('Erro ao cadastrar: ' + (data ? data.erro : 'Falha na requisição'), 'danger');
      showToast('Afiliado criado com sucesso!', 'success');
      fecharModalAfiliado();
      carregarAfiliados();
    });
  }
}

function excluirAfiliado(id, nome) {
  if (!confirm('Tem certeza que deseja excluir o afiliado "' + nome + '"?')) return;

  apiDelete('/api/super/afiliados/' + id, function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao excluir afiliado.', 'danger');
    showToast('Afiliado removido!', 'success');
    carregarAfiliados();
  });
}

function verMetricasAfiliado(id) {
  apiGet('/api/super/afiliados/' + id + '/metricas', function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao carregar métricas.', 'danger');

    var af = data.afiliado;
    var vendas = data.vendas || [];

    document.getElementById('modal-afil-detalhes-title').textContent = 'Métricas — ' + af.nome + ' (' + af.codigo_ref + ')';

    var headerHTML = '<div>' +
        '<strong style="font-size:16px; color:#fff;">' + esc(af.nome) + '</strong><br>' +
        '<small style="color:var(--text-muted);">' + esc(af.email) + ' | PIX: ' + esc(af.chave_pix || 'Não cadastrada') + '</small>' +
      '</div>' +
      '<div>' +
        '<span style="background:rgba(255,87,34,0.15); color:var(--primary); padding:6px 12px; border-radius:8px; font-weight:700; font-size:14px;">Comissão: ' + (af.comissao_percentual || 10) + '%</span>' +
      '</div>';

    document.getElementById('afil-detalhes-header').innerHTML = headerHTML;

    var tbody = document.getElementById('afil-detalhes-vendas-tbody');
    if (vendas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">Nenhuma venda registrada para este afiliado ainda.</td></tr>';
    } else {
      var html = '';
      vendas.forEach(function(v) {
        var statusClr = v.status === 'pago' ? 'var(--success)' : 'var(--warning)';
        html += '<tr>' +
          '<td>' + (v.created_at ? new Date(v.created_at).toLocaleDateString('pt-BR') : '—') + '</td>' +
          '<td><strong style="color:#fff;">' + esc(v.restaurante_nome || '—') + '</strong></td>' +
          '<td><span class="badge badge-plano">' + esc(v.plano || 'SaaS') + '</span></td>' +
          '<td>R$ ' + formatMoney(v.valor_venda || 0) + '</td>' +
          '<td style="color:var(--success); font-weight:bold;">R$ ' + formatMoney(v.comissao_valor || 0) + '</td>' +
          '<td><span style="color:' + statusClr + '; font-weight:bold; font-size:12px; text-transform:uppercase;">' + esc(v.status) + '</span></td>' +
        '</tr>';
      });
      tbody.innerHTML = html;
    }

    document.getElementById('modal-afiliado-detalhes').classList.add('active');
  });
}

function fecharModalAfiliadoDetalhes() {
  document.getElementById('modal-afiliado-detalhes').classList.remove('active');
}

/* ═══════════════════════════════════════════════════════════════════════ */
/* ═══ CENTRAL DE SEGURANÇA, WAF & ANTI-DDOS ═══════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════ */

var wafCurrentConfig = {
  enabled: true,
  max_reqs_per_minute: 300,
  block_sqli_xss: true,
  headers_enabled: true,
  blacklist_ips: []
};

function carregarConfigSeguranca() {
  apiGet('/api/super/waf-config', function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao carregar regras de segurança.', 'danger');
    wafCurrentConfig = data.config || wafCurrentConfig;
    
    var enabledEl = document.getElementById('waf-enabled');
    if (enabledEl) enabledEl.checked = !!wafCurrentConfig.enabled;

    var maxReqsEl = document.getElementById('waf-max-reqs');
    if (maxReqsEl) maxReqsEl.value = wafCurrentConfig.max_reqs_per_minute || 300;

    var sqliEl = document.getElementById('waf-block-sql-xss');
    if (sqliEl) sqliEl.checked = !!wafCurrentConfig.block_sqli_xss;

    var headersEl = document.getElementById('waf-headers-enabled');
    if (headersEl) headersEl.checked = !!wafCurrentConfig.headers_enabled;

    var statusEl = document.getElementById('waf-stat-status');
    if (statusEl) {
      statusEl.textContent = wafCurrentConfig.enabled ? 'ATIVO' : 'DESATIVADO';
      statusEl.style.color = wafCurrentConfig.enabled ? 'var(--success)' : '#ef4444';
    }

    var limitEl = document.getElementById('waf-stat-limit');
    if (limitEl) limitEl.textContent = (wafCurrentConfig.max_reqs_per_minute || 300) + ' / min';

    renderBlacklistUI(wafCurrentConfig.blacklist_ips || []);
    carregarWafLogs();
  });
}

function renderBlacklistUI(ips) {
  var container = document.getElementById('waf-blacklist-container');
  var countEl = document.getElementById('waf-stat-blocked');
  if (countEl) countEl.textContent = ips.length;

  if (!container) return;
  if (!ips || ips.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:10px;">Nenhum IP bloqueado manualmente.</div>';
    return;
  }

  var html = '';
  ips.forEach(function(ip) {
    html += '<div style="display:flex; justify-content:space-between; align-items:center; padding:4px 8px; border-bottom:1px solid rgba(255,255,255,0.05);">' +
      '<span style="color:#ef4444; font-weight:700;">' + esc(ip) + '</span>' +
      '<button onclick="removerIpBlacklist(\'' + esc(ip) + '\')" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:12px;" title="Remover Bloqueio"><i class="fa-solid fa-trash"></i></button>' +
    '</div>';
  });
  container.innerHTML = html;
}

function salvarConfigSeguranca() {
  var enabled = document.getElementById('waf-enabled').checked;
  var maxReqs = parseInt(document.getElementById('waf-max-reqs').value) || 300;
  var sqli = document.getElementById('waf-block-sql-xss').checked;
  var headers = document.getElementById('waf-headers-enabled').checked;

  wafCurrentConfig.enabled = enabled;
  wafCurrentConfig.max_reqs_per_minute = maxReqs;
  wafCurrentConfig.block_sqli_xss = sqli;
  wafCurrentConfig.headers_enabled = headers;

  apiPost('/api/super/waf-config', wafCurrentConfig, function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao salvar regras WAF.', 'danger');
    showToast('Configurações de segurança e WAF atualizadas!', 'success');
    carregarConfigSeguranca();
  });
}

function adicionarIpBlacklist() {
  var input = document.getElementById('waf-new-ip');
  var ip = (input.value || '').trim();
  if (!ip) return showToast('Digite um endereço IP válido.', 'warning');

  if (!wafCurrentConfig.blacklist_ips) wafCurrentConfig.blacklist_ips = [];
  if (wafCurrentConfig.blacklist_ips.indexOf(ip) !== -1) {
    return showToast('Este IP já está na lista negra.', 'warning');
  }

  wafCurrentConfig.blacklist_ips.push(ip);
  input.value = '';

  apiPost('/api/super/waf-config', wafCurrentConfig, function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao adicionar IP.', 'danger');
    showToast('IP ' + ip + ' bloqueado com sucesso!', 'success');
    carregarConfigSeguranca();
  });
}

function removerIpBlacklist(ip) {
  if (!confirm('Desbloquear o IP ' + ip + '?')) return;
  if (!wafCurrentConfig.blacklist_ips) return;
  
  wafCurrentConfig.blacklist_ips = wafCurrentConfig.blacklist_ips.filter(function(i) { return i !== ip; });

  apiPost('/api/super/waf-config', wafCurrentConfig, function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao remover IP.', 'danger');
    showToast('IP ' + ip + ' desbloqueado!', 'success');
    carregarConfigSeguranca();
  });
}

function carregarWafLogs() {
  apiGet('/api/super/waf-logs', function(err, data) {
    var tbody = document.getElementById('waf-logs-tbody');
    if (!tbody) return;
    if (err || !data || !data.ok || !data.logs || data.logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">Nenhum ataque ou bloqueio registrado recentemente.</td></tr>';
      return;
    }

    var html = '';
    data.logs.forEach(function(l) {
      var d = l.data ? new Date(l.data).toLocaleTimeString('pt-BR') : '—';
      html += '<tr>' +
        '<td>' + d + '</td>' +
        '<td style="color:#ef4444; font-weight:bold; font-family:monospace;">' + esc(l.ip) + '</td>' +
        '<td><span class="badge badge-plano">' + esc(l.metodo) + '</span></td>' +
        '<td style="color:#fff; font-size:12px;">' + esc(l.endpoint) + '</td>' +
        '<td style="color:var(--warning); font-size:12px; font-weight:600;">' + esc(l.motivo) + '</td>' +
      '</tr>';
    });
    tbody.innerHTML = html;
  });
}

/* ═══ GESTÃO & METRICAS DA EQUIPE DE SUPORTE NO SUPER-ADMIN ═══ */
window.carregarSuporte = function() {
  apiGet('/api/super/equipe', function(err, data) {
    var tbody = document.getElementById('suporte-tbody');
    if (!tbody) return;
    if (err || !data || !data.ok || !data.equipe || data.equipe.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhum membro na equipe de suporte cadastrado.</td></tr>';
      return;
    }

    suporteData = data.equipe; // Atualiza variável global para modals de Task e Avisos

    var searchVal = (document.getElementById('suporte-search') ? document.getElementById('suporte-search').value : '').toLowerCase();
    var filterStatus = document.getElementById('suporte-filter-status') ? document.getElementById('suporte-filter-status').value : '';

    var equipeFiltrada = data.equipe.filter(function(m) {
      var matchSearch = !searchVal || (m.nome || '').toLowerCase().indexOf(searchVal) !== -1 || (m.email || '').toLowerCase().indexOf(searchVal) !== -1 || (m.cpf_cnpj || '').toLowerCase().indexOf(searchVal) !== -1;
      var stAp = m.status_aprovacao || 'aprovado';
      var matchStatus = !filterStatus || stAp === filterStatus;
      return matchSearch && matchStatus;
    });

    if (equipeFiltrada.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhum colaborador encontrado com os filtros selecionados.</td></tr>';
      return;
    }

    var html = '';
    equipeFiltrada.forEach(function(m) {
      var stColor = m.status === 'disponivel' ? '#22c55e' : (m.status === 'ocupado' ? '#f59e0b' : '#ef4444');
      var stAp = m.status_aprovacao || 'aprovado';
      var badgeAp = stAp === 'aprovado' ? '<span style="background:#22c55e22;color:#22c55e;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:bold;">🟢 APROVADO</span>' :
        (stAp === 'pendente' ? '<span style="background:#f59e0b22;color:#f59e0b;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:bold;">🟡 PENDENTE</span>' :
        '<span style="background:#ef444422;color:#ef4444;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:bold;">🔴 RECUSADO</span>');

      html += '<tr>' +
        '<td style="padding:10px 12px;font-weight:600;color:white;">' + esc(m.nome) + '<br><small style="color:#888;">Nível ' + (m.nivel || 1) + ' (' + (m.xp || 0) + ' XP)</small> ' + badgeAp + '</td>' +
        '<td style="padding:10px 12px;color:#ccc;">' + esc(m.email) + '<br><small style="color:#888;">CPF/CNPJ: ' + esc(m.cpf_cnpj || '—') + '</small></td>' +
        '<td style="padding:10px 12px;text-align:center;color:#ccc;">' + esc(m.telefone || '—') + '<br><small style="color:#888;">PIX: ' + esc(m.pix_chave || '—') + '</small></td>' +
        '<td style="padding:10px 12px;text-align:center;color:#3b82f6;font-weight:600;">' + esc(m.cargo || 'Atendente') + '</td>' +
        '<td style="padding:10px 12px;text-align:center;color:#888;">' + esc(m.especialidade || 'Geral') + '</td>' +
        '<td style="padding:10px 12px;text-align:center;"><span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:' + stColor + '22;color:' + stColor + ';border:1px solid ' + stColor + '44;">' + esc((m.status || 'disponivel').toUpperCase()) + '</span></td>' +
        '<td style="padding:10px 12px;text-align:center;color:#888;font-size:11px;">' + (m.data_cadastro ? new Date(m.data_cadastro).toLocaleDateString('pt-BR') : '—') + '</td>' +
        '<td style="padding:10px 12px;text-align:center;white-space:nowrap;">' +
          '<button class="btn-action" style="padding:4px 8px;font-size:11px;background:#22c55e;color:white;margin-right:4px;" onclick="abrirModalMetaComissao(' + m.id + ',\'' + escapeHtml(m.nome) + '\',' + (m.comissao_padrao || 10) + ',' + (m.meta_vendas_mes || 5) + ',' + (m.bonificacao_meta || 200) + ')" title="Metas e Comissões"><i class="fa-solid fa-sliders"></i></button>' +
          (stAp === 'pendente' ? 
            '<button class="btn-action" style="padding:4px 8px;font-size:11px;background:#3b82f6;color:white;margin-right:4px;" onclick="alterarStatusAprovacaoSuporte(' + m.id + ',\'aprovado\')" title="Aprovar Cadastro"><i class="fa-solid fa-check"></i> Aprovar</button>' +
            '<button class="btn-action" style="padding:4px 8px;font-size:11px;background:#ef4444;color:white;" onclick="alterarStatusAprovacaoSuporte(' + m.id + ',\'recusado\')" title="Recusar Cadastro"><i class="fa-solid fa-xmark"></i> Recusar</button>' :
            (stAp === 'aprovado' ? '<button class="btn-action" style="padding:4px 8px;font-size:11px;background:#f59e0b;color:white;" onclick="alterarStatusAprovacaoSuporte(' + m.id + ',\'recusado\')" title="Suspender"><i class="fa-solid fa-ban"></i> Suspender</button>' :
            '<button class="btn-action" style="padding:4px 8px;font-size:11px;background:#3b82f6;color:white;" onclick="alterarStatusAprovacaoSuporte(' + m.id + ',\'aprovado\')" title="Reativar"><i class="fa-solid fa-check"></i> Reativar</button>')) +
        '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  });

  carregarMetricasComerciaisSuporte();
};

window.alterarStatusAprovacaoSuporte = function(id, novoStatus) {
  if (!confirm('Deseja realmente alterar o status de aprovação do colaborador para "' + novoStatus.toUpperCase() + '"?')) return;
  apiPut('/api/super/suporte/' + id + '/status-aprovacao', { status_aprovacao: novoStatus }, function(err, data) {
    if (err || !data || !data.ok) return showToast(err || (data && data.erro) || 'Erro ao alterar status.', 'danger');
    showToast(data.mensagem || 'Status de aprovação alterado com sucesso!', 'success');
    carregarSuporte();
  });
};

window.carregarAuditLogsSuporte = function() {
  document.getElementById('modal-audit-logs').classList.add('active');
  apiGet('/api/super/suporte/audit-logs', function(err, data) {
    var tbody = document.getElementById('audit-logs-tbody');
    if (!tbody) return;
    if (err || !data || !data.ok || !data.logs || data.logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#888;">Nenhum registro de auditoria encontrado.</td></tr>';
      return;
    }
    var html = '';
    data.logs.forEach(function(l) {
      var d = l.data_acao ? new Date(l.data_acao).toLocaleString('pt-BR') : '—';
      html += '<tr>' +
        '<td style="color:#888;white-space:nowrap;">' + d + '</td>' +
        '<td style="color:white;font-weight:bold;">' + escapeHtml(l.suporte_nome || '—') + ' <small style="color:#888;">(#' + (l.suporte_id || 'sys') + ')</small></td>' +
        '<td style="color:#fc4b15;font-weight:600;">' + escapeHtml(l.acao) + '</td>' +
        '<td style="color:#ccc;">' + escapeHtml(l.detalhes || '') + '</td>' +
        '<td style="text-align:center;color:#3b82f6;font-family:monospace;">' + escapeHtml(l.ip || '127.0.0.1') + '</td>' +
        '</tr>';
    });
    tbody.innerHTML = html;
  });
};

window.fecharModalAuditLogs = function() {
  document.getElementById('modal-audit-logs').classList.remove('active');
};

window.abrirModalMetaComissao = function(id, nome, comissao, meta, bonus) {
  document.getElementById('edit-vendedor-id').value = id;
  document.getElementById('edit-vendedor-nome').textContent = nome;
  document.getElementById('edit-vendedor-comissao').value = comissao || 10;
  document.getElementById('edit-vendedor-meta').value = meta || 5;
  document.getElementById('edit-vendedor-bonus').value = bonus || 200;
  document.getElementById('modal-editar-meta-comissao').classList.add('active');
};

window.fecharModalMetaComissao = function() {
  document.getElementById('modal-editar-meta-comissao').classList.remove('active');
};

window.salvarMetasComissaoVendedor = function() {
  var id = parseInt(document.getElementById('edit-vendedor-id').value);
  var comissao = parseFloat(document.getElementById('edit-vendedor-comissao').value);
  var meta = parseInt(document.getElementById('edit-vendedor-meta').value);
  var bonus = parseFloat(document.getElementById('edit-vendedor-bonus').value);

  if (!id) return;

  apiPut('/api/super/suporte/' + id + '/metas-comissao', {
    comissao_padrao: comissao,
    meta_vendas_mes: meta,
    bonificacao_meta: bonus
  }, function(err, data) {
    if (err || !data || !data.ok) return showToast('Erro ao atualizar metas e comissões.', 'danger');
    showToast(data.mensagem || 'Metas e comissão atualizadas com sucesso!', 'success');
    fecharModalMetaComissao();
    carregarSuporte();
  });
};

window.carregarMetricasComerciaisSuporte = function() {
  var inicio = document.getElementById('comercial-filtro-inicio') ? document.getElementById('comercial-filtro-inicio').value : '';
  var fim = document.getElementById('comercial-filtro-fim') ? document.getElementById('comercial-filtro-fim').value : '';

  var query = [];
  if (inicio) query.push('inicio=' + encodeURIComponent(inicio));
  if (fim) query.push('fim=' + encodeURIComponent(fim));
  var url = '/api/super/suporte/metricas-vendas' + (query.length ? '?' + query.join('&') : '');

  apiGet(url, function(err, data) {
    if (err || !data || !data.ok) return;

    var res = data.resumo || {};
    if (document.getElementById('metric-comercial-contatos')) document.getElementById('metric-comercial-contatos').textContent = res.totalContatos || 0;
    if (document.getElementById('metric-comercial-fechados')) document.getElementById('metric-comercial-fechados').textContent = res.totalFechados || 0;
    if (document.getElementById('metric-comercial-conversao')) document.getElementById('metric-comercial-conversao').textContent = res.taxaConversao || '0%';
    if (document.getElementById('metric-comercial-faturamento')) document.getElementById('metric-comercial-faturamento').textContent = 'R$ ' + parseFloat(res.totalFaturamento || 0).toFixed(2);

    // Render Fatores Decisivos
    var containerFatores = document.getElementById('container-fatores-decisao');
    if (containerFatores) {
      var fatoresLabels = {
        facilidade_interface: 'Interface / Facilidade de Uso',
        pedido_qrcode: 'Cardápio QR Code na Mesa',
        controle_financeiro: 'Controle Financeiro Automático',
        integracao_ifood: 'Integração iFood & Entregas',
        suporte_humanizado: 'Suporte Técnico Humanizado',
        preco_competitivo: 'Custo-Benefício / Preço',
        estabilidade_offline: 'Modo Offline e Estabilidade',
        outro: 'Outros Motivos'
      };
      var fat = data.fatoresDecisao || {};
      var keysF = Object.keys(fat);
      if (keysF.length === 0) {
        containerFatores.innerHTML = '<span style="color:#888;font-size:12px;">Nenhum fator registrado ainda.</span>';
      } else {
        var htmlF = '';
        keysF.forEach(function(k) {
          var label = fatoresLabels[k] || k;
          var count = fat[k];
          htmlF += '<div style="display:flex;justify-content:space-between;align-items:center;background:#161a2b;padding:8px 12px;border-radius:8px;">' +
            '<span><i class="fa-solid fa-check" style="color:#22c55e;margin-right:6px;"></i> ' + esc(label) + '</span>' +
            '<span style="font-weight:bold;color:#22c55e;">' + count + ' vendas</span>' +
            '</div>';
        });
        containerFatores.innerHTML = htmlF;
      }
    }

    // Render Objeções e Motivos de Perda
    var containerObj = document.getElementById('container-objecoes');
    if (containerObj) {
      var obj = data.objecoes || {};
      var keysO = Object.keys(obj);
      if (keysO.length === 0) {
        containerObj.innerHTML = '<span style="color:#888;font-size:12px;">Nenhuma objeção registrada.</span>';
      } else {
        var htmlO = '';
        keysO.forEach(function(k) {
          var count = obj[k];
          htmlO += '<div style="background:#161a2b;padding:8px 12px;border-radius:8px;">' +
            '<strong style="color:#f59e0b;">' + count + 'x citado:</strong> ' + esc(k) +
            '</div>';
        });
        containerObj.innerHTML = htmlO;
      }
    }

    // Render Tabela de Vendas
    var tbody = document.getElementById('comercial-vendas-tbody');
    if (tbody) {
      var vendas = data.vendas || [];
      if (vendas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;padding:20px;">Nenhuma negociação registrada no período.</td></tr>';
        return;
      }
      var htmlV = '';
      vendas.forEach(function(v) {
        var stColor = v.status_venda === 'fechado' ? '#22c55e' : (v.status_venda === 'negociacao' ? '#f59e0b' : '#ef4444');
        htmlV += '<tr style="border-bottom:1px solid #1f2438;">' +
          '<td style="padding:8px;color:#fc4b15;font-weight:600;">' + esc(v.suporte_nome || 'Suporte #' + v.suporte_id) + '</td>' +
          '<td style="padding:8px;color:white;font-weight:bold;">' + esc(v.restaurante_nome) + '<br><small style="color:#888;">' + esc(v.chave_ativacao) + '</small></td>' +
          '<td style="padding:8px;color:#ccc;">' + esc(v.contato_nome || '—') + '<br><small style="color:#888;">' + esc(v.contato_telefone || '') + '</small></td>' +
          '<td style="padding:8px;text-align:center;"><span style="color:#f59e0b;font-weight:bold;">' + esc(v.plano.toUpperCase()) + '</span><br><small style="color:#888;">R$ ' + parseFloat(v.valor_venda || 0).toFixed(2) + '</small></td>' +
          '<td style="padding:8px;text-align:center;"><span style="background:#22c55e22;color:#22c55e;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold;">' + esc(v.fator_decisao || '—') + '</span></td>' +
          '<td style="padding:8px;color:#ccc;"><small><strong>Objeção:</strong> ' + esc(v.objeção_nao_fecho || 'Nenhuma') + '<br><strong>Onboarding:</strong> ' + esc(v.ajudas_usabilidade || 'Nenhuma') + '</small></td>' +
          '<td style="padding:8px;text-align:center;color:#888;">' + (v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR') : '—') + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = htmlV;
    }
  });
};

/* ═══ RENDER FEATURES POR RESTAURANTE ═══ */
var _restFeatureDefs = [
  { key: 'feature_venda_sem_estoque',      label: 'Vender sem Estoque',     icon: 'fa-box-open',     color: '#ef4444' },
  { key: 'feature_toggle_produto_rapido',  label: 'Toggle Produto Rápido', icon: 'fa-toggle-on',    color: '#3b82f6' },
  { key: 'feature_alterar_valores_pdv',    label: 'Alterar Valores PDV',   icon: 'fa-dollar-sign',  color: '#f59e0b' },
  { key: 'feature_clientes_ativos',        label: 'Clientes Ativos Hoje',  icon: 'fa-users',        color: '#8b5cf6' },
  { key: 'feature_produto_mais_vendido',   label: 'Produto Mais Vendido',  icon: 'fa-trophy',       color: '#10b981' },
  { key: 'feature_maior_lucro',            label: 'Maior Lucro',           icon: 'fa-chart-line',   color: '#06b6d4' },
  { key: 'feature_impressao_digital',      label: 'Impressão Digital',     icon: 'fa-desktop',      color: '#22c55e' },
  { key: 'feature_impressao_termica',      label: 'Impressão Térmica',     icon: 'fa-print',        color: '#ec4899' },
  { key: 'feature_produtos_lote',          label: 'Produtos em Lote',      icon: 'fa-layer-group',  color: '#a855f7' }
];

window.renderFeaturesRestaurante = function() {
  apiGet('/api/super/features', function(err, data) {
    if (err || !data || !data.ok) {
      var tbody = document.getElementById('rest-feat-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--danger);padding:20px;">Erro ao carregar restaurantes.</td></tr>';
      return;
    }
    var tenants = data.tenants || [];
    var searchVal = (document.getElementById('rest-feat-search') ? document.getElementById('rest-feat-search').value : '').toLowerCase();
    if (searchVal) {
      tenants = tenants.filter(function(t) { return (t.nome || '').toLowerCase().indexOf(searchVal) !== -1; });
    }
    if (tenants.length === 0) {
      var tbody = document.getElementById('rest-feat-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhum restaurante encontrado.</td></tr>';
      return;
    }

    var tbody = document.getElementById('rest-feat-tbody');
    var html = '';
    for (var i = 0; i < tenants.length; i++) {
      var t = tenants[i];
      html += '<tr>';
      html += '<td style="font-weight:600;">' + t.id + '</td>';
      html += '<td style="font-weight:600;color:white;">' + escapeHtml(t.nome) + '</td>';
      html += '<td id="rest-feat-chips-' + t.id + '"><span style="color:var(--text-muted);font-size:0.8rem;">Carregando...</span></td>';
      html += '</tr>';
    }
    tbody.innerHTML = html;

    for (var j = 0; j < tenants.length; j++) {
      loadRestFeatures(tenants[j].id);
    }
  });
};

function loadRestFeatures(restId) {
  apiGet('/api/super/restaurant-features/' + restId, function(err, data) {
    var container = document.getElementById('rest-feat-chips-' + restId);
    if (!container) return;
    if (err || !data || !data.ok) {
      container.innerHTML = '<span style="color:var(--danger);font-size:0.8rem;">Erro ao carregar</span>';
      return;
    }
    var features = data.features || {};
    var html = '';
    for (var i = 0; i < _restFeatureDefs.length; i++) {
      var f = _restFeatureDefs[i];
      var enabled = features[f.key] === 'true';
      var chipBg = enabled ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.1)';
      var chipColor = enabled ? '#34d399' : '#f87171';
      var chipBorder = enabled ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.2)';
      html += '<span style="display:inline-block;padding:3px 10px;border-radius:100px;font-size:0.72rem;font-weight:600;background:' + chipBg + ';color:' + chipColor + ';border:1px solid ' + chipBorder + ';margin:2px;cursor:pointer;" ' +
        'onclick="toggleRestFeature(' + restId + ',\'' + f.key + '\',' + !enabled + ')" ' +
        'title="' + escapeHtml(f.label) + '">' +
        '<i class="fa-solid ' + f.icon + '" style="margin-right:3px;"></i>' + escapeHtml(f.label) + '</span>';
    }
    container.innerHTML = html;
  });
}

window.toggleRestFeature = function(restId, key, value) {
  apiPost('/api/super/restaurant-features', { restaurante_id: restId, feature: key, value: value }, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao alterar feature: ' + (err ? err.message : (data ? data.erro : 'Falha')), 'danger');
      return;
    }
    showToast('Feature ' + (value ? 'ativada' : 'desativada') + ' com sucesso!', 'success');
    loadRestFeatures(restId);
  });
};

var restFeatSearch = document.getElementById('rest-feat-search');
if (restFeatSearch) {
  restFeatSearch.addEventListener('input', function() { renderFeaturesRestaurante(); });
}
var btnRefreshRestFeat = document.getElementById('btn-refresh-rest-feat');
if (btnRefreshRestFeat) {
  btnRefreshRestFeat.addEventListener('click', function() { renderFeaturesRestaurante(); });
}

/* ══════════════════════════════════════════════════════════════════
   ESTÚDIO DE PERSONALIZAÇÃO GLOBAL DE TEMAS (SUPER ADMIN)
   ══════════════════════════════════════════════════════════════════ */

var _TAMANHOS_PADRAO = {
  fontSizeScale: '1',
  btnScale: '1',
  cardPadY: '10px',
  cardPadX: '12px',
  modalWidth: 'none',
  modalPosition: 'center'
};

var _PRESETS_TEMA = {
  chef_orange: {
    primary: '#fc4b15',
    primaryHover: '#e03e0a',
    bgHeader: '#1a1a2e',
    textHeader: '#ffffff',
    bgSidebar: '#1e1e2e',
    textSidebar: '#c3c3d5',
    bgColor: '#0f172a',
    bgCard: '#1e293b',
    textPrimary: '#f8fafc',
    textSecondary: '#a8b3c5',
    borderColor: '#334155',
    btnPrimaryBg: '#fc4b15',
    btnPrimaryText: '#ffffff',
    fontBody: 'Inter',
    fontHeading: 'Outfit',
    borderRadius: '14px',
    modo: 'escuro'
  },
  midnight_dark: {
    primary: '#ff5722',
    primaryHover: '#f4511e',
    bgHeader: '#0b0f19',
    textHeader: '#fbbf24',
    bgSidebar: '#111827',
    textSidebar: '#9ca3af',
    bgColor: '#070a12',
    bgCard: '#111827',
    textPrimary: '#f3f4f6',
    textSecondary: '#9ca3af',
    borderColor: '#374151',
    btnPrimaryBg: '#ff5722',
    btnPrimaryText: '#ffffff',
    fontBody: 'Roboto',
    fontHeading: 'Poppins',
    borderRadius: '12px',
    modo: 'escuro'
  },
  emerald_green: {
    primary: '#10b981',
    primaryHover: '#059669',
    bgHeader: '#064e3b',
    textHeader: '#ffffff',
    bgSidebar: '#032c22',
    textSidebar: '#6ee7b7',
    bgColor: '#022c22',
    bgCard: '#064e3b',
    textPrimary: '#ecfdf5',
    textSecondary: '#99f6e4',
    borderColor: '#0f766e',
    btnPrimaryBg: '#10b981',
    btnPrimaryText: '#ffffff',
    fontBody: 'Open Sans',
    fontHeading: 'Montserrat',
    borderRadius: '16px',
    modo: 'escuro'
  },
  royal_purple: {
    primary: '#8b5cf6',
    primaryHover: '#7c3aed',
    bgHeader: '#17132b',
    textHeader: '#d8b4fe',
    bgSidebar: '#1e1b4b',
    textSidebar: '#a5b4fc',
    bgColor: '#0c0918',
    bgCard: '#1e1b4b',
    textPrimary: '#f5f3ff',
    textSecondary: '#c7bffd',
    borderColor: '#4c46a8',
    btnPrimaryBg: '#8b5cf6',
    btnPrimaryText: '#ffffff',
    fontBody: 'Inter',
    fontHeading: 'Space Grotesk',
    borderRadius: '14px',
    modo: 'escuro'
  },
  nordic_light: {
    primary: '#2563eb',
    primaryHover: '#1d4ed8',
    bgHeader: '#ffffff',
    textHeader: '#1e293b',
    bgSidebar: '#f8fafc',
    textSidebar: '#475569',
    bgColor: '#f1f5f9',
    bgCard: '#ffffff',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    borderColor: '#dbe3ec',
    btnPrimaryBg: '#2563eb',
    btnPrimaryText: '#ffffff',
    fontBody: 'Inter',
    fontHeading: 'Montserrat',
    borderRadius: '8px',
    modo: 'claro'
  },
  ocean_blue: {
    primary: '#06b6d4',
    primaryHover: '#0891b2',
    bgHeader: '#1e3a8a',
    textHeader: '#ffffff',
    bgSidebar: '#101a38',
    textSidebar: '#94a3b8',
    bgColor: '#0b132b',
    bgCard: '#1c2541',
    textPrimary: '#f0f9ff',
    textSecondary: '#9fc5d8',
    borderColor: '#3a506b',
    btnPrimaryBg: '#06b6d4',
    btnPrimaryText: '#04202b',
    fontBody: 'Poppins',
    fontHeading: 'Outfit',
    borderRadius: '14px',
    modo: 'escuro'
  },
  sunset_light: {
    primary: '#ea580c',
    primaryHover: '#c2410c',
    bgHeader: '#fff7ed',
    textHeader: '#7c2d12',
    bgSidebar: '#fffbeb',
    textSidebar: '#92400e',
    bgColor: '#fff7ed',
    bgCard: '#ffffff',
    textPrimary: '#431407',
    textSecondary: '#9a3412',
    borderColor: '#fbd8b0',
    btnPrimaryBg: '#ea580c',
    btnPrimaryText: '#ffffff',
    fontBody: 'Nunito',
    fontHeading: 'Poppins',
    borderRadius: '16px',
    modo: 'claro'
  },
  rose_dark: {
    primary: '#f43f5e',
    primaryHover: '#e11d48',
    bgHeader: '#1c0d13',
    textHeader: '#fda4af',
    bgSidebar: '#180a10',
    textSidebar: '#f9a8d4',
    bgColor: '#120709',
    bgCard: '#241019',
    textPrimary: '#fff1f2',
    textSecondary: '#fda4af',
    borderColor: '#582436',
    btnPrimaryBg: '#f43f5e',
    btnPrimaryText: '#ffffff',
    fontBody: 'Inter',
    fontHeading: 'Playfair Display',
    borderRadius: '18px',
    modo: 'escuro'
  }
};

window.obterConfigTemaDosInputs = function() {
  var cardSize = (document.getElementById('theme-card-size') || {}).value || 'normal';
  var cardMap = { compacto: ['8px', '10px'], normal: ['10px', '12px'], espacoso: ['16px', '20px'] };
  var cm = cardMap[cardSize] || cardMap.normal;
  var coringaAtivo = document.getElementById('theme-coringa-enabled');
  return {
    primary: document.getElementById('theme-primary')?.value || '#fc4b15',
    primaryHover: document.getElementById('theme-primary-hover')?.value || '#e03e0a',
    bgHeader: document.getElementById('theme-bg-header')?.value || '#1a1a2e',
    textHeader: document.getElementById('theme-text-header')?.value || '#ffffff',
    bgSidebar: document.getElementById('theme-bg-sidebar')?.value || '#1e1e2e',
    textSidebar: document.getElementById('theme-text-sidebar')?.value || '#a1a1aa',
    bgColor: document.getElementById('theme-bg-color')?.value || '#0f172a',
    bgCard: document.getElementById('theme-bg-card')?.value || '#1e293b',
    textPrimary: document.getElementById('theme-text-primary')?.value || '#f8fafc',
    textSecondary: document.getElementById('theme-text-secondary')?.value || '#94a3b8',
    borderColor: document.getElementById('theme-border-color')?.value || '#334155',
    btnPrimaryBg: document.getElementById('theme-btn-bg')?.value || '#fc4b15',
    btnPrimaryText: '#ffffff',
    fontBody: document.getElementById('theme-font-body')?.value || 'Inter',
    fontHeading: document.getElementById('theme-font-heading')?.value || 'Outfit',
    borderRadius: document.getElementById('theme-border-radius')?.value || '14px',
    fontSizeScale: (document.getElementById('theme-fs-scale') || {}).value || '1',
    btnScale: (document.getElementById('theme-btn-scale') || {}).value || '1',
    cardPadY: cm[0],
    cardPadX: cm[1],
    modalWidth: (document.getElementById('theme-modal-width') || {}).value || 'none',
    modalPosition: (document.getElementById('theme-modal-pos') || {}).value || 'center',
    coringa: {
      enabled: !coringaAtivo || coringaAtivo.checked,
      icon: (document.getElementById('theme-coringa-icon') || {}).value || '',
      action: (document.getElementById('theme-coringa-action') || {}).value || 'url',
      target: (document.getElementById('theme-coringa-target') || {}).value || '',
      position: (document.getElementById('theme-coringa-position') || {}).value || 'float-br',
      color: (document.getElementById('theme-coringa-color') || {}).value || '#ffffff',
      bg: (document.getElementById('theme-coringa-bg') || {}).value || '#1e293b',
      title: (document.getElementById('theme-coringa-title') || {}).value || 'Atalho personalizado'
    }
  };
};

function _preencherInputsTema(t) {
  var set = function(id, v) { var el = document.getElementById(id); if (el && typeof v !== 'undefined' && v !== null) el.value = v; };
  set('theme-primary', t.primary); set('theme-primary-hover', t.primaryHover);
  set('theme-bg-header', t.bgHeader); set('theme-text-header', t.textHeader);
  set('theme-bg-sidebar', t.bgSidebar); set('theme-text-sidebar', t.textSidebar);
  set('theme-bg-color', t.bgColor); set('theme-bg-card', t.bgCard);
  set('theme-text-primary', t.textPrimary); set('theme-text-secondary', t.textSecondary);
  set('theme-border-color', t.borderColor); set('theme-btn-bg', t.btnPrimaryBg);
  set('theme-font-body', t.fontBody); set('theme-font-heading', t.fontHeading);
  set('theme-border-radius', t.borderRadius);
  set('theme-fs-scale', t.fontSizeScale || '1');
  set('theme-btn-scale', t.btnScale || '1');
  var cardKey = 'normal';
  if (t.cardPadY === '8px') cardKey = 'compacto';
  else if (t.cardPadY === '16px') cardKey = 'espacoso';
  set('theme-card-size', cardKey);
  set('theme-modal-width', t.modalWidth || 'none');
  set('theme-modal-pos', t.modalPosition || 'center');
  var c = t.coringa || {};
  var chk = document.getElementById('theme-coringa-enabled');
  if (chk) chk.checked = c.enabled !== false;
  set('theme-coringa-icon', c.icon || '');
  set('theme-coringa-action', c.action || 'url');
  set('theme-coringa-target', c.target || '');
  set('theme-coringa-position', c.position || 'float-br');
  set('theme-coringa-color', c.color || '#ffffff');
  set('theme-coringa-bg', c.bg || '#1e293b');
  set('theme-coringa-title', c.title || 'Atalho personalizado');
}

window.atualizarLivePreviewTema = function() {
  var cfg = window.obterConfigTemaDosInputs();
  
  var header = document.getElementById('prev-header');
  if (header) { header.style.background = cfg.bgHeader; header.style.color = cfg.textHeader; }

  var sidebar = document.getElementById('prev-sidebar');
  if (sidebar) { sidebar.style.background = cfg.bgSidebar; }

  var sideItem1 = document.getElementById('prev-side-item1');
  if (sideItem1) { sideItem1.style.color = cfg.textSidebar; }
  var sideItem2 = document.getElementById('prev-side-item2');
  var sideItem3 = document.getElementById('prev-side-item3');
  if (sideItem2) { sideItem2.style.color = cfg.textSidebar; }
  if (sideItem3) { sideItem3.style.color = cfg.textSidebar; }

  var main = document.getElementById('prev-main');
  if (main) { main.style.background = cfg.bgColor; main.style.fontSize = (parseFloat(cfg.fontSizeScale || '1') * 100) + '%'; }

  var card1 = document.getElementById('prev-card1');
  var card2 = document.getElementById('prev-card2');
  if (card1) { card1.style.background = cfg.bgCard; card1.style.borderColor = cfg.borderColor; card1.style.borderRadius = cfg.borderRadius; card1.style.padding = cfg.cardPadY + ' ' + cfg.cardPadX; }
  if (card2) { card2.style.background = cfg.bgCard; card2.style.borderColor = cfg.borderColor; card2.style.borderRadius = cfg.borderRadius; card2.style.padding = cfg.cardPadY + ' ' + cfg.cardPadX; }

  var title = document.getElementById('prev-card-title');
  if (title) { title.style.color = cfg.textPrimary; title.style.fontFamily = cfg.fontHeading + ', sans-serif'; }

  var desc = document.getElementById('prev-card-desc');
  if (desc) { desc.style.color = cfg.textSecondary; desc.style.fontFamily = cfg.fontBody + ', sans-serif'; }

  var price = document.getElementById('prev-price');
  if (price) { price.style.color = cfg.primary; }

  var btn = document.getElementById('prev-btn');
  if (btn) {
    btn.style.background = cfg.btnPrimaryBg;
    btn.style.color = cfg.btnPrimaryText;
    btn.style.borderRadius = cfg.borderRadius;
    var bs = parseFloat(cfg.btnScale || '1');
    btn.style.minHeight = Math.round(30 * bs) + 'px';
    btn.style.fontSize = '';
  }

  var totalText = document.getElementById('prev-total-text');
  if (totalText) { totalText.style.color = cfg.textPrimary; }

  /* Preview do ícone coringa no cabeçalho do mockup */
  var prevCor = document.getElementById('prev-coringa');
  if (prevCor) {
    if (cfg.coringa && cfg.coringa.enabled && cfg.coringa.icon) {
      prevCor.style.display = 'inline-flex';
      prevCor.innerHTML = '<i class="' + cfg.coringa.icon + '" style="color:' + cfg.coringa.color + ';"></i>';
      prevCor.style.background = cfg.coringa.bg;
      var posTxt = { 'topbar-left': 'Barra · esquerda', 'topbar-right': 'Barra · direita', 'float-br': 'Canto inf. direito', 'float-bl': 'Canto inf. esquerdo' };
      prevCor.title = 'Coringa: ' + (posTxt[cfg.coringa.position] || cfg.coringa.position);
    } else {
      prevCor.style.display = 'none';
    }
  }

  if (window.ChefTheme && typeof window.ChefTheme.applyCustom === 'function') {
    window.ChefTheme.applyCustom(cfg);
  }
};

window.aplicarPresetTema = function(key) {
  var preset = _PRESETS_TEMA[key];
  if (!preset) return;

  var completo = Object.assign({}, preset, _TAMANHOS_PADRAO);
  _preencherInputsTema(completo);

  window.atualizarCampoCoringa();
  window.atualizarLivePreviewTema();
  showToast('Preset "' + key + '" carregado! Clique em "Salvar" para aplicar em todo o sistema.', 'info');
};

window.atualizarCampoCoringa = function() {
  var a = (document.getElementById('theme-coringa-action') || {}).value;
  var w = document.getElementById('wrap-coringa-target');
  if (!w) return;
  if (a === 'tema' || a === 'fila' || a === 'recarregar') {
    w.style.display = 'none';
  } else {
    w.style.display = 'block';
    var lbl = document.getElementById('lbl-coringa-target');
    if (lbl) lbl.textContent = (a === 'js') ? 'Código JavaScript a executar' : 'URL ou página interna (ex.: /garcom.html)';
  }
};

window.salvarTemaCustomGlobal = function() {
  var cfg = window.obterConfigTemaDosInputs();
  var scope = 'global';
  var tenantId = null;
  var tenantIds = null;
  var radios = document.querySelectorAll('input[name="theme-scope"]');
  radios.forEach(function(r) { if (r.checked) scope = r.value; });
  if (scope === 'tenant') {
    tenantId = document.getElementById('theme-scope-tenant') ? document.getElementById('theme-scope-tenant').value : '';
    if (!tenantId) { showToast('Selecione um restaurante.', 'danger'); return; }
    tenantId = parseInt(tenantId);
  }
  var body = { theme: cfg, alvo: scope };
  if (scope === 'tenant') body.restaurante_id = tenantId;
  apiPost('/api/super/theme-custom', body, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao salvar tema customizado: ' + (err ? err.message : (data ? data.erro : 'Falha')), 'danger');
      return;
    }
    var msg = scope === 'global' ? '✨ Tema Global salvo e propagado!' : '✨ Tema do restaurante #' + tenantId + ' salvo!';
    showToast(msg, 'success');
  });
};

window.restaurarTemaPadraoGlobal = function() {
  window.aplicarPresetTema('chef_orange');
  window.salvarTemaCustomGlobal();
};

/* ═════════ TEMAS MULTI-VERSÃO 1.x — CLARO + ESCURO ═════════ */
var _temasCache = [];
var _temaEdicao = null; // { id, versao, nome, modo }

window.carregarTemasLista = function() {
  fetch('/api/super/temas')
    .then(function(res) { return res.json(); })
    .then(function(data) {
      var box = document.getElementById('temas-lista');
      if (!box) return;
      if (!data || !data.ok) { box.innerHTML = '<div style="color:#f87171;font-size:0.85rem;">Erro ao carregar temas.</div>'; return; }
      _temasCache = data.temas || [];
      if (!_temasCache.length) {
        box.innerHTML = '<div style="text-align:center;padding:12px;color:#94a3b8;font-size:0.85rem;">Nenhum tema ainda. Clique em "Criar Tema".</div>';
        return;
      }
      box.innerHTML = _temasCache.map(function(t) {
        var ativo = !!t.ativo;
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;background:' + (ativo ? 'rgba(236,72,153,0.10)' : 'rgba(255,255,255,0.03)') + ';border:1px solid ' + (ativo ? '#ec4899' : 'rgba(255,255,255,0.08)') + ';border-radius:12px;padding:10px 14px;">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
            '<span style="background:' + (ativo ? '#ec4899' : '#475569') + ';color:white;font-weight:800;font-size:0.72rem;padding:2px 10px;border-radius:12px;">v' + t.versao + '</span>' +
            '<strong style="font-size:0.88rem;">' + esc(t.nome || 'Sem nome') + '</strong>' +
            (ativo ? '<span style="color:#34d399;font-size:0.75rem;font-weight:700;"><i class="fa-solid fa-circle-check"></i> ATIVO</span>' : '') +
            '<span style="font-size:0.72rem;color:#94a3b8;">☀️✓ claro · 🌙' + (t.cfg_escuro && Object.keys(t.cfg_escuro).length ? '✓' : ' vazio') + ' escuro</span>' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button onclick="editarTema(' + t.id + ')" style="padding:6px 14px;background:#334155;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.78rem;"><i class="fa-solid fa-pen"></i> Editar</button>' +
            (!ativo ? '<button onclick="ativarTema(' + t.id + ')" style="padding:6px 14px;background:#16a34a;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.78rem;"><i class="fa-solid fa-power-off"></i> Ativar</button>' : '') +
            '<button onclick="delegarTemaSuporte(' + t.id + ')" style="padding:6px 14px;background:#0ea5e9;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.78rem;" title="Envia este tema como tarefa para o suporte finalizar"><i class="fa-solid fa-headset"></i></button>' +
            (!ativo ? '<button onclick="excluirTema(' + t.id + ')" style="padding:6px 12px;background:#7f1d1d;color:white;border:none;border-radius:8px;cursor:pointer;font-size:0.78rem;"><i class="fa-solid fa-trash"></i></button>' : '') +
          '</div>' +
        '</div>';
      }).join('');
    })
    .catch(function() {});
};

window.criarNovoTema = function() {
  var nome = prompt('Nome do novo tema:\nex.: "Tema Festa Junina", "Clean Profissional"', 'Novo Tema');
  if (nome === null) return;
  apiPost('/api/super/temas', { nome: nome }, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao criar tema: ' + (err ? err.message : (data ? data.erro : 'Falha')), 'danger');
      return;
    }
    showToast(data.mensagem || 'Tema criado!', 'success');
    window.carregarTemasLista();
    if (data.id) window.editarTema(data.id);
  });
};

function _atualizarBotoesModoTema() {
  var bC = document.getElementById('btn-modo-claro');
  var bE = document.getElementById('btn-modo-escuro');
  if (!bC || !bE || !_temaEdicao) return;
  var noClaro = _temaEdicao.modo === 'claro';
  bC.style.background = noClaro ? '#fbbf24' : 'rgba(255,255,255,0.08)';
  bC.style.color = noClaro ? '#1e293b' : '#94a3b8';
  bE.style.background = !noClaro ? '#818cf8' : 'rgba(255,255,255,0.08)';
  bE.style.color = !noClaro ? '#1e293b' : '#94a3b8';
  var titulo = document.getElementById('tema-editor-titulo');
  if (titulo) titulo.textContent = '✏️ Editando: v' + _temaEdicao.versao + ' "' + (_temaEdicao.nome || '') + '" — Modo ' + (noClaro ? 'CLARO ☀️' : 'ESCURO 🌙');
}

window.editarTema = function(id) {
  var t = _temasCache.find(function(x) { return x.id === id; });
  if (!t) { showToast('Recarregue a lista de temas.', 'warning'); return; }
  _temaEdicao = { id: t.id, versao: t.versao, nome: t.nome, modo: 'claro', cfgClaro: t.cfg_claro || {}, cfgEscuro: t.cfg_escuro || {} };
  var barra = document.getElementById('tema-editor-barra');
  if (barra) barra.style.display = 'block';
  _preencherInputsTema(Object.assign({}, _temaEdicao.cfgClaro));
  window.atualizarCampoCoringa();
  window.atualizarLivePreviewTema();
  _atualizarBotoesModoTema();
  showToast('Editando v' + t.versao + '. Ajuste o CLARO, depois troque para ESCURO e salve cada modo.', 'info');
};

window.trocarModoEdicaoTema = function(modo) {
  if (!_temaEdicao || modo === _temaEdicao.modo) return;
  // Guarda o que está no formulário antes de trocar (sem salvar — só mantém em edição)
  var atual = window.obterConfigTemaDosInputs();
  if (_temaEdicao.modo === 'claro') _temaEdicao.cfgClaro = atual; else _temaEdicao.cfgEscuro = atual;
  _temaEdicao.modo = modo;
  _preencherInputsTema(Object.assign({}, modo === 'claro' ? _temaEdicao.cfgClaro : _temaEdicao.cfgEscuro));
  window.atualizarCampoCoringa();
  window.atualizarLivePreviewTema();
  _atualizarBotoesModoTema();
};

window.salvarModoTemaAtual = function() {
  if (!_temaEdicao) return;
  var cfg = window.obterConfigTemaDosInputs();
  var corpo = {};
  if (_temaEdicao.modo === 'claro') corpo.cfg_claro = cfg; else corpo.cfg_escuro = cfg;
  apiPost('/api/super/temas/' + _temaEdicao.id, corpo, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao salvar: ' + (err ? err.message : (data ? data.erro : 'Falha')), 'danger');
      return;
    }
    showToast('✨ Modo ' + _temaEdicao.modo.toUpperCase() + ' do tema v' + _temaEdicao.versao + ' salvo!' + (data.mensagem && data.mensagem.indexOf('ATIVO') >= 0 ? ' Já está rodando nos terminais.' : ''), 'success');
    window.carregarTemasLista();
  });
};
// O botão principal "Salvar e Aplicar Globalmente" também salva no tema em edição quando houver
(function() {
  var salvarOriginal = window.salvarTemaCustomGlobal;
  window.salvarTemaCustomGlobal = function() {
    if (_temaEdicao) { window.salvarModoTemaAtual(); return; }
    salvarOriginal();
  };
})();

window.ativarTema = function(id) {
  var t = _temasCache.find(function(x) { return x.id === id; });
  apiPost('/api/super/temas/' + id + '/ativar', {}, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao ativar: ' + (err ? err.message : (data ? data.erro : 'Falha')), 'danger');
      return;
    }
    showToast(data.mensagem || 'Tema ativado!', 'success');
    window.carregarTemasLista();
    if (t) { _preencherInputsTema(Object.assign({}, t.cfg_claro)); window.atualizarLivePreviewTema(); }
  });
};

window.excluirTema = function(id) {
  var t = _temasCache.find(function(x) { return x.id === id; });
  if (!t) return;
  if (!confirm('Excluir o tema v' + t.versao + ' ("' + (t.nome || '') + '")? Essa ação não pode ser desfeita.')) return;
  // XHR direto: há duas definições de apiDelete neste arquivo — a última não envia corpo e esta rota precisa de token via header apenas
  var xhr = new XMLHttpRequest();
  xhr.open('DELETE', '/api/super/temas/' + id, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  var tok = localStorage.getItem('super_admin_token') || '';
  if (tok) xhr.setRequestHeader('Authorization', 'Bearer ' + tok);
  xhr.onload = function() {
    try {
      var d = JSON.parse(xhr.responseText);
      showToast(d.mensagem || d.erro || 'Feito!', d.ok ? 'success' : 'danger');
      if (d.ok && _temaEdicao && _temaEdicao.id === id) {
        _temaEdicao = null;
        var barra = document.getElementById('tema-editor-barra');
        if (barra) barra.style.display = 'none';
      }
      window.carregarTemasLista();
    } catch (e) { showToast('Erro ao excluir tema.', 'danger'); }
  };
  xhr.send(JSON.stringify({}));
};

window.delegarTemaSuporte = function(id) {
  var t = _temasCache.find(function(x) { return x.id === id; });
  if (!t) return;
  var obs = prompt('Instruções para o suporte sobre o tema v' + t.versao + ' ("' + (t.nome || '') + '"):\nex.: "ajustar contraste do texto dos cards", "combinar com a logo nova"', '');
  if (obs === null) return;
  apiPost('/api/super/delegar-suporte', {
    tipo: 'design_tema',
    descricao: '🎨 DESIGN DE TEMA v' + t.versao + ' "' + (t.nome || 'sem nome') + '" — Ajustar paleta claro+escuro. Instruções do admin: ' + (obs.trim() || '(nenhuma observação específica)'),
    pontos: 25
  }, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao delegar: ' + (err ? err.message : (data ? data.erro : 'Falha')), 'danger');
      return;
    }
    showToast(data.mensagem || 'Delegado ao suporte!', 'success');
  });
};

/* ═════════ DELEGAÇÃO GENÉRICA DE PENDÊNCIAS AO SUPORTE ═════════ */
window.abrirModalDelegarSuporte = function() {
  var m = document.getElementById('modal-delegar-suporte');
  if (!m) { showToast('Modal de delegação não encontrado nesta versão do painel.', 'warning'); return; }
  m.style.display = 'flex';
};

window.fecharModalDelegarSuporte = function() {
  var m = document.getElementById('modal-delegar-suporte');
  if (m) m.style.display = 'none';
};

window.enviarDelegacaoSuporte = function() {
  var descricao = (document.getElementById('deleg-descricao') || {}).value || '';
  if (!descricao.trim()) { showToast('Descreva a pendência a delegar.', 'warning'); return; }
  var btn = document.getElementById('btn-enviar-delegacao');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';
  apiPost('/api/super/delegar-suporte', {
    tipo: (document.getElementById('deleg-tipo') || {}).value,
    descricao: descricao,
    restaurante_id: parseInt((document.getElementById('deleg-restaurante-id') || {}).value, 10) || null,
    pontos: parseInt((document.getElementById('deleg-pontos') || {}).value, 10) || 20
  }, function(err, data) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar à fila do Suporte';
    if (err || !data || !data.ok) {
      showToast('Erro ao delegar: ' + (err ? err.message : (data ? data.erro : 'Falha')), 'danger');
      return;
    }
    showToast(data.mensagem || 'Delegado!', 'success');
    window.fecharModalDelegarSuporte();
    var d = document.getElementById('deleg-descricao');
    if (d) d.value = '';
  });
};

window.carregarTemaCustomGlobal = function() {
  fetch('/api/public/theme')
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data && data.ok && data.theme) {
        _preencherInputsTema(Object.assign({}, data.theme));
        window.atualizarCampoCoringa();
        window.atualizarLivePreviewTema();
      }
    })
    .catch(function() {});
  /* Preencher dropdown de tenants para escopo */
  var sel = document.getElementById('theme-scope-tenant');
  if (sel && sel.options.length <= 1) {
    fetch('/api/super/restaurantes', { headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('super_token') || '') } })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d && d.ok && Array.isArray(d.restaurantes)) {
          sel.innerHTML = '<option value="">Selecione um restaurante...</option>' +
            d.restaurantes.map(function(r) { return '<option value="' + r.id + '">' + esc(r.nome || r.name || '#' + r.id) + '</option>'; }).join('');
        }
      }).catch(function() {});
  }
  /* Toggle do select de tenant */
  var radios = document.querySelectorAll('input[name="theme-scope"]');
  radios.forEach(function(r) {
    r.addEventListener('change', function() {
      if (sel) sel.style.display = r.value === 'tenant' && r.checked ? 'inline-block' : 'none';
    });
  });
};

// ─── ALTERAR SENHA SUPER ADMIN ───
function initAlterarSenha() {
  var inputNova = document.getElementById('senha-nova-input');
  var fill = document.getElementById('forca-senha-fill');
  var txt = document.getElementById('forca-senha-txt');
  if (!inputNova || !fill) return;

  inputNova.addEventListener('input', function() {
    var v = inputNova.value;
    var pontos = 0;
    if (v.length >= 8) pontos++;
    if (v.length >= 12) pontos++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) pontos++;
    if (/[0-9]/.test(v)) pontos++;
    if (/[^a-zA-Z0-9]/.test(v)) pontos++;
    var pct = Math.min(100, pontos * 20);
    fill.style.width = pct + '%';
    if (pontos <= 2) { fill.style.background = '#ef4444'; txt.textContent = v ? 'Senha fraca — adicione maiúsculas, números ou símbolos.' : 'Use letras maiúsculas, minúsculas, números e símbolos.'; }
    else if (pontos === 3) { fill.style.background = '#f59e0b'; txt.textContent = 'Senha média.'; }
    else { fill.style.background = '#22c55e'; txt.textContent = 'Senha forte.'; }
  });

  var btn = document.getElementById('btn-alterar-senha');
  if (!btn) return;
  btn.addEventListener('click', async function() {
    var atual = document.getElementById('senha-atual-input').value;
    var nova = document.getElementById('senha-nova-input').value;
    var conf = document.getElementById('senha-confirma-input').value;
    if (!atual || !nova) { showToast('Preencha a senha atual e a nova senha.', 'warning'); return; }
    if (nova.length < 8) { showToast('A nova senha deve ter pelo menos 8 caracteres.', 'warning'); return; }
    if (nova !== conf) { showToast('As senhas não coincidem.', 'danger'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Salvando...';
    apiPost('/api/super/alterar-senha', { senha_atual: atual, nova_senha: nova }, function(err, r) {
      if (!err && r && r.ok) {
        showToast(r.mensagem || 'Senha alterada com sucesso!', 'success');
        document.getElementById('senha-atual-input').value = '';
        document.getElementById('senha-nova-input').value = '';
        document.getElementById('senha-confirma-input').value = '';
        fill.style.width = '0%';
        txt.textContent = 'Use letras maiúsculas, minúsculas, números e símbolos.';
      } else {
        showToast((r && r.erro) || 'Erro ao alterar senha.', 'danger');
      }
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-key"></i> Salvar Nova Senha';
    });
  });
}
document.addEventListener('DOMContentLoaded', initAlterarSenha);

/* ═══════════════════════════════════════════════════════════════════
   MONITOR DE CADASTROS AO VIVO + CENTRAL DE NOTIFICAÇÕES (Super Admin)
   - Popup em tempo real enquanto o restaurante preenche o cadastro
   - Telemetria: localização, dispositivo, bateria e wifi
   - Central com todos os cards; celebração proporcional aos novos
   ═══════════════════════════════════════════════════════════════════ */
var _saNotifs = [];
try { _saNotifs = JSON.parse(localStorage.getItem('sa_notif_cadastros_v2') || '[]'); } catch (e) { _saNotifs = []; }
if (!Array.isArray(_saNotifs)) _saNotifs = [];

function _saSalvarNotifs() {
  try {
    localStorage.setItem('sa_notif_cadastros_v2', JSON.stringify(_saNotifs.slice(0, 100)));
  } catch (e) { }
}

function _saContarNaoVistos() {
  return _saNotifs.filter(function (n) { return !n.visto; }).length;
}

function _saAtualizarBadge() {
  var badge = document.getElementById('sa-notif-badge');
  if (!badge) return;
  var n = _saContarNaoVistos();
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.style.display = n > 0 ? 'flex' : 'none';
}

function _saUpsertNotif(item) {
  var i = _saNotifs.findIndex(function (n) { return n.sessao_id === item.sessao_id; });
  if (i >= 0) _saNotifs[i] = Object.assign(_saNotifs[i], item);
  else _saNotifs.unshift(item);
  _saSalvarNotifs();
  _saAtualizarBadge();
}

/* ── Formatação ── */
function saFmtLocalizacao(loc) {
  if (!loc || loc.lat == null) return '';
  var url = 'https://www.google.com/maps?q=' + loc.lat + ',' + (loc.lng || '');
  return '<a href="' + url + '" target="_blank" rel="noopener" style="color:#60a5fa;text-decoration:underline;">📍 Ver no mapa</a>' +
    '<span style="color:#94a3b8;font-size:11px;"> (' + loc.lat + ', ' + (loc.lng || '') + ')' + (loc.precisao ? ' ±' + loc.precisao + 'm' : '') + '</span>';
}

function saFmtTempoRelativo(dataStr) {
  try {
    var t = new Date(String(dataStr || '').replace(' ', 'T')).getTime();
    if (isNaN(t)) return dataStr || '';
    var mins = Math.floor((Date.now() - t) / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return mins + ' min atrás';
    var h = Math.floor(mins / 60);
    if (h < 24) return h + 'h atrás';
    return Math.floor(h / 24) + 'd atrás';
  } catch (e) { return ''; }
}

function saHtmlTelemetria(n) {
  var linhas = [];
  if (n.dispositivo) linhas.push('📱 ' + esc(n.dispositivo));
  if (n.bateria && n.bateria !== 'indisponível') linhas.push('🔋 Bateria: ' + esc(n.bateria));
  if (n.rede) linhas.push('📶 ' + esc(n.rede));
  if (n.ip) linhas.push('🌐 IP: ' + esc(n.ip));
  var htmlLoc = saFmtLocalizacao(n.localizacao);
  if (htmlLoc) linhas.push(htmlLoc);
  return linhas.join('<br>');
}

function saCamposChips(campos) {
  if (!campos || typeof campos !== 'object') return '';
  return Object.keys(campos).map(function (k) {
    var v = String(campos[k] == null ? '' : campos[k]).slice(0, 40);
    var rotulo = k.replace(/_/g, ' ');
    return '<span style="display:inline-block;background:rgba(252,75,21,0.15);border:1px solid rgba(252,75,21,0.4);color:#fdba74;border-radius:20px;padding:2px 10px;font-size:11px;margin:2px;">' +
      esc(rotulo) + ': <strong style="color:#fff;">' + esc(v) + '</strong></span>';
  }).join('');
}

function saEtapaLabel(etapa) {
  if (etapa === 'concluido') return '✅ Cadastro concluído!';
  if (String(etapa).indexOf('2') === 0) return '⌨️ Etapa 2 — montando a equipe…';
  return '⌨️ Etapa 1 — preenchendo os dados…';
}

/* ── POPUP AO VIVO: aparece assim que o restaurante começa a digitar ── */
function saMonitorAoVivo(data) {
  if (!data || !data.sessao_id) return;
  _saUpsertNotif({
    sessao_id: data.sessao_id,
    etapa: data.etapa,
    campos: data.campos,
    dispositivo: data.dispositivo,
    bateria: data.bateria,
    rede: data.rede,
    localizacao: data.localizacao,
    ip: data.ip,
    status: 'digitando',
    atualizado_em: new Date().toLocaleString('pt-BR')
  });

  var stack = document.getElementById('sa-monitor-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'sa-monitor-stack';
    stack.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:999997;display:flex;flex-direction:column;gap:10px;max-width:400px;width:calc(100vw - 40px);font-family:inherit;';
    document.body.appendChild(stack);
  }

  var cardId = 'sa-monitor-' + data.sessao_id;
  var card = document.getElementById(cardId);
  if (!card) {
    card = document.createElement('div');
    card.id = cardId;
    card.style.cssText =
      'background:rgba(15,23,42,0.97);border:2px solid #fc4b15;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,0.6);' +
      'padding:14px 16px;color:#f8fafc;animation:slideInRight 0.4s ease;';
    card.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">' +
      '<div style="width:34px;height:34px;border-radius:10px;background:rgba(252,75,21,0.2);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;">🍳</div>' +
      '<div style="flex:1;"><div style="font-weight:800;font-size:13.5px;color:#fdba74;">Novo restaurante se cadastrando AGORA!</div>' +
      '<div class="sa-m-etapa" style="font-size:11.5px;color:#94a3b8;"></div></div>' +
      '<button title="Fechar" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;">&times;</button>' +
      '</div>' +
      '<div class="sa-m-campos" style="margin-bottom:8px;line-height:1.6;"></div>' +
      '<div class="sa-m-telemetria" style="background:rgba(255,255,255,0.05);border-radius:10px;padding:8px 10px;font-size:12px;color:#cbd5e1;line-height:1.65;"></div>';
    card.querySelector('button').onclick = function () { card.remove(); };
    stack.appendChild(card);
    // Some sozinho após 45s sem atualização
    card._timer = setTimeout(function () { card.remove(); }, 45000);
  }
  clearTimeout(card._timer);
  card._timer = setTimeout(function () { card.remove(); }, 45000);

  card.querySelector('.sa-m-etapa').textContent = saEtapaLabel(data.etapa);
  card.querySelector('.sa-m-campos').innerHTML = saCamposChips(data.campos);
  card.querySelector('.sa-m-telemetria').innerHTML = saHtmlTelemetria(data);
  tocarNotificacaoSom();
}

/* ── CADASTRO CONCLUÍDO ── */
function saCadastroConcluido(data) {
  var sessao = data.sessao_id || ('done-' + Date.now());
  var campos = {};
  try { campos = typeof data.campos_json === 'string' ? JSON.parse(data.campos_json) : (data.campos || {}); } catch (e) { }
  var nomeRest = (campos.restaurante_nome) || (data.restauranteNome || 'Restaurante');
  _saUpsertNotif({
    sessao_id: sessao,
    etapa: 'concluido',
    campos: campos,
    dispositivo: data.dispositivo,
    bateria: data.bateria,
    rede: data.rede,
    localizacao: (typeof data.localizacao === 'string' ? (function () { try { return JSON.parse(data.localizacao); } catch (e) { return null; } })() : data.localizacao),
    ip: data.ip,
    status: 'concluido',
    visto: false,
    atualizado_em: new Date().toLocaleString('pt-BR'),
    nome: nomeRest
  });
  // Fecha o card "digitando" correspondente
  var cardAntigo = document.getElementById('sa-monitor-' + sessao);
  if (cardAntigo) cardAntigo.remove();
  showToast('🎉 Novo restaurante cadastrado: ' + nomeRest + '!', 'success');
  saCentralRenderLista();
  _saCentralCelebrar();
}

/* ── Celebração proporcional à quantidade de novos restaurantes ── */
function _saCentralCelebrar(forcar) {
  var novos = _saNotifs.filter(function (n) { return n.status === 'concluido' && !n.visto; }).length;
  if (novos <= 0 && !forcar) return;
  var explosoes = Math.max(1, Math.min(16, novos * 2));
  if (typeof window.chefChuvaEstrelas === 'function') {
    window.chefChuvaEstrelas({ explosoes: explosoes });
  }
  tocarNotificacaoSom();
  showToast('🎉 ' + (novos > 0 ? novos + ' novo(s) restaurante(s)' : 'Boas notícias esperando') + ' — bem-vindos ao Chef Cozinha!', 'success');
}

/* ── CENTRAL DE NOTIFICAÇÕES (sininho + painel) ── */
function saCentralInjetar() {
  if (document.getElementById('sa-notif-bell')) return;

  var bell = document.createElement('button');
  bell.id = 'sa-notif-bell';
  bell.title = 'Central de Notificações';
  bell.style.cssText =
    'position:fixed;top:18px;right:66px;z-index:999998;width:38px;height:38px;border-radius:12px;' +
    'background:var(--bg-card,#1e293b);border:1.5px solid var(--border-color,#334155);cursor:pointer;' +
    'display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--text-main,#f8fafc);box-shadow:0 2px 6px rgba(0,0,0,0.15);';
  bell.innerHTML = '🔔<span id="sa-notif-badge" style="display:none;position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;border-radius:9px;background:#ef4444;color:#fff;font-size:10.5px;font-weight:800;align-items:center;justify-content:center;padding:0 4px;">0</span>';
  bell.onclick = saCentralToggle;
  document.body.appendChild(bell);

  var painel = document.createElement('div');
  painel.id = 'sa-notif-painel';
  painel.style.cssText =
    'display:none;position:fixed;top:64px;right:66px;z-index:999998;width:min(430px, calc(100vw - 32px));max-height:72vh;' +
    'overflow-y:auto;background:rgba(15,23,42,0.98);border:1.5px solid #334155;border-radius:16px;' +
    'box-shadow:0 24px 70px rgba(0,0,0,0.55);padding:14px;color:#f8fafc;font-family:inherit;';
  document.body.appendChild(painel);

  // Carrega histórico recente do servidor
  apiGet('/api/super/cadastros-monitor?horas=48', function (err, d) {
    if (err || !d || !Array.isArray(d.cadastros)) return;
    d.cadastros.forEach(function (row) {
      var campos = {};
      try { campos = JSON.parse(row.campos_json || '{}'); } catch (e) { }
      var loc = null;
      try { loc = row.localizacao ? JSON.parse(row.localizacao) : null; } catch (e) { }
      _saUpsertNotif({
        sessao_id: row.sessao_id,
        etapa: row.etapa,
        campos: campos,
        dispositivo: row.dispositivo,
        bateria: row.bateria,
        rede: row.rede,
        localizacao: loc,
        ip: row.ip,
        status: row.status,
        atualizado_em: row.atualizado_em
      });
    });
    saCentralRenderLista();
  });

  saCentralRenderLista();
}

function saCentralToggle() {
  var painel = document.getElementById('sa-notif-painel');
  if (!painel) return;
  var abrindo = painel.style.display !== 'block';
  painel.style.display = abrindo ? 'block' : 'none';
  if (abrindo) {
    var naoVistos = _saNotifs.filter(function (n) { return !n.visto; }).length;
    _saNotifs.forEach(function (n) { n.visto = true; });
    _saSalvarNotifs();
    _saAtualizarBadge();
    saCentralRenderLista();
    if (naoVistos > 0) _saCentralCelebrar(true);
  }
}

function saCentralRenderLista() {
  var painel = document.getElementById('sa-notif-painel');
  if (!painel || painel.style.display === 'none') { _saAtualizarBadge(); return; }
  if (!_saNotifs.length) {
    painel.innerHTML = '<div style="text-align:center;padding:30px 10px;color:#94a3b8;font-size:13px;">🔔 Nenhum cadastro nas últimas 48h.<br>Quando um restaurante começar a se cadastrar, você verá aqui em tempo real!</div>';
    return;
  }
  var html = '<div style="font-weight:800;font-size:14px;margin-bottom:10px;">🔔 Cadastros recentes <span style="color:#94a3b8;font-weight:400;font-size:12px;">(últimas 48h)</span></div>';
  _saNotifs.slice(0, 50).forEach(function (n) {
    var concluido = n.status === 'concluido' || n.etapa === 'concluido';
    var borda = concluido ? '#22c55e' : '#fc4b15';
    var nome = (n.campos && n.campos.restaurante_nome) || n.nome || 'Restaurante (sem nome ainda)';
    html +=
      '<div style="background:rgba(255,255,255,0.04);border-left:4px solid ' + borda + ';border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:12.5px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
      '<strong style="color:' + (concluido ? '#86efac' : '#fdba74') + ';font-size:13px;">' + (concluido ? '✅ ' : '') + esc(nome) + '</strong>' +
      '<span style="color:#64748b;font-size:11px;">' + esc(saFmtTempoRelativo(n.atualizado_em)) + '</span>' +
      '</div>' +
      '<div style="margin-bottom:5px;">' + (saCamposChips(n.campos) || '<em style="color:#64748b;">Aguardando preenchimento…</em>') + '</div>' +
      '<div style="color:#cbd5e1;line-height:1.6;font-size:11.5px;">' + saHtmlTelemetria(n) + '</div>' +
      '</div>';
  });
  painel.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════
// INFRAESTRUTURA CLOUD — R2, Redis, Backups, Alertas
// ═══════════════════════════════════════════════════════════════════

function carregarInfraCloud() {
  apiGet('/api/super/infra-cloud', function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao carregar configs cloud.', 'error'); return; }
    var c = data.config || {};

    // Preenche campos R2
    var r2id = document.getElementById('r2-account-id');
    var r2b = document.getElementById('r2-bucket');
    var r2ak = document.getElementById('r2-access-key');
    var r2sk = document.getElementById('r2-secret-key');
    if (r2id) r2id.value = c.r2_account_id || '';
    if (r2b) r2b.value = c.r2_bucket || '';
    if (r2ak) r2ak.value = c.r2_access_key || '';
    if (r2sk) r2sk.value = c.r2_secret_key || '';

    // Stats
    var r2s = document.getElementById('r2-status');
    if (r2s) r2s.textContent = (c.r2_account_id && c.r2_bucket) ? 'Configurado' : 'Desconectado';
    var badge = document.getElementById('infra-cloud-badge');
    if (badge && c.r2_account_id) { badge.style.display = ''; badge.textContent = 'R2 ✓'; }

    // Preenche campos Redis
    var rh = document.getElementById('redis-host');
    var rp = document.getElementById('redis-port');
    var rpw = document.getElementById('redis-password');
    var rpx = document.getElementById('redis-prefix');
    var ren = document.getElementById('redis-enabled');
    if (rh) rh.value = c.redis_host || '127.0.0.1';
    if (rp) rp.value = c.redis_port || '6379';
    if (rpw) rpw.value = c.redis_password || '';
    if (rpx) rpx.value = c.redis_prefix || 'chef:';
    if (ren) ren.checked = c.redis_enabled === '1';
    var rediss = document.getElementById('redis-status');
    if (rediss) rediss.textContent = c.redis_enabled === '1' ? 'Ativado' : 'Desativado';

    // Backups agendados
    var bf = document.getElementById('backup-freq');
    var br = document.getElementById('backup-retention');
    var bd = document.getElementById('backup-dest');
    if (bf) bf.value = c.backup_frequency || '24h';
    if (br) br.value = c.backup_retention_days || '30';
    if (bd) bd.value = c.backup_destination || 'local';
    var bss = document.getElementById('backup-schedule-status');
    if (bss) bss.textContent = (c.backup_frequency && c.backup_frequency !== 'manual') ? c.backup_frequency : 'Manual';

    // Alertas crash
    var cc = document.getElementById('crash-channel');
    var cw = document.getElementById('crash-webhook-url');
    if (cc) cc.value = c.crash_alert_channel || 'none';
    if (cw) cw.value = c.crash_alert_webhook || '';
    var cas = document.getElementById('crash-alert-status');
    if (cas) cas.textContent = (c.crash_alert_channel && c.crash_alert_channel !== 'none') ? 'Ativados' : 'Inativos';

    // Carrega backups R2 e histórico
    carregarR2Backups();
    carregarBackupHistory();
    carregarCrashHistory();
  });
}

function carregarR2Backups() {
  apiGet('/api/super/infra-cloud/r2/backups', function(err, data) {
    var el = document.getElementById('r2-backups-list');
    if (!el) return;
    if (err || !data || !data.ok || !data.backups || data.backups.length === 0) {
      el.innerHTML = '<div style="font-size:0.85rem;color:var(--text-muted);">Nenhum backup no R2 ainda.</div>';
      return;
    }
    var html = '<table class="custom-table" style="width:100%;font-size:0.85rem;"><thead><tr><th>Arquivo</th><th>Tamanho</th><th>Ações</th></tr></thead><tbody>';
    data.backups.forEach(function(b) {
      var sizeStr = b.size ? (Math.round(b.size / 1024 / 1024 * 10) / 10 + ' MB') : '—';
      html += '<tr><td>' + esc(b.name) + '</td><td>' + sizeStr + '</td><td><a href="#" style="color:var(--primary);" onclick="downloadR2Backup(\'' + esc(b.name) + '\');return false;">Download</a></td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  });
}

function carregarBackupHistory() {
  apiGet('/api/super/infra-cloud/backup-history', function(err, data) {
    var el = document.getElementById('backup-history');
    if (!el) return;
    if (err || !data || !data.ok || !data.history || data.history.length === 0) {
      el.innerHTML = '<div style="font-size:0.85rem;color:var(--text-muted);">Nenhum backup local encontrado.</div>';
      return;
    }
    var html = '<table class="custom-table" style="width:100%;font-size:0.85rem;"><thead><tr><th>Arquivo</th><th>Tamanho</th><th>Data</th></tr></thead><tbody>';
    data.history.forEach(function(h) {
      var d = new Date(h.data);
      html += '<tr><td>' + esc(h.nome) + '</td><td>' + h.tamanho + ' KB</td><td>' + d.toLocaleString('pt-BR') + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  });
}

function carregarCrashHistory() {
  apiGet('/api/super/infra-cloud/crash-history', function(err, data) {
    var el = document.getElementById('crash-history');
    if (!el) return;
    if (err || !data || !data.ok || !data.history || data.history.length === 0) {
      el.innerHTML = 'Nenhum crash registrado recentemente.';
      return;
    }
    var html = '';
    data.history.forEach(function(c) {
      html += '<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
        '<span style="color:#f59e0b;font-weight:600;">' + esc(c.data) + '</span> — ' +
        '<span style="color:#94a3b8;">' + esc(c.detalhe).slice(0, 200) + '</span></div>';
    });
    el.innerHTML = html;
  });
}

// Event listeners — R2
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    var btnSaveR2 = document.getElementById('btn-r2-save');
    if (btnSaveR2) btnSaveR2.addEventListener('click', function() {
      var payload = {
        account_id: document.getElementById('r2-account-id').value.trim(),
        bucket: document.getElementById('r2-bucket').value.trim(),
        access_key: document.getElementById('r2-access-key').value.trim(),
        secret_key: document.getElementById('r2-secret-key').value.trim()
      };
      if (!payload.account_id || !payload.bucket || !payload.access_key || !payload.secret_key) {
        showToast('Preencha todos os campos do R2.', 'error'); return;
      }
      apiPost('/api/super/infra-cloud/r2', payload, function(err, data) {
        if (err || !data || !data.ok) { showToast(data ? data.erro : 'Erro ao salvar.', 'error'); return; }
        showToast('Config R2 salva! Testando conexão...', 'success');
        apiPost('/api/super/infra-cloud/r2/test', {}, function(e2, d2) {
          var fb = document.getElementById('r2-feedback');
          if (d2 && d2.ok) {
            if (fb) { fb.style.color = '#86efac'; fb.textContent = '✓ ' + d2.mensagem; }
            document.getElementById('r2-status').textContent = 'Conectado';
            var badge = document.getElementById('infra-cloud-badge');
            if (badge) { badge.style.display = ''; badge.textContent = 'R2 ✓'; }
          } else {
            if (fb) { fb.style.color = '#fca5a5'; fb.textContent = '✗ ' + (d2 ? d2.erro : 'Erro'); }
          }
        });
      });
    });

    var btnR2Backup = document.getElementById('btn-r2-backup-now');
    if (btnR2Backup) btnR2Backup.addEventListener('click', function() {
      var fb = document.getElementById('r2-feedback');
      if (fb) { fb.style.color = '#94a3b8'; fb.textContent = 'Enviando backups para R2...'; }
      apiPost('/api/super/infra-cloud/r2/backup', {}, function(err, data) {
        if (err || !data || !data.ok) {
          if (fb) { fb.style.color = '#fca5a5'; fb.textContent = '✗ ' + (data ? data.erro : 'Erro'); }
        } else {
          if (fb) { fb.style.color = '#86efac'; fb.textContent = '✓ ' + data.mensagem; }
          carregarR2Backups();
        }
      });
    });

    // Redis
    var btnSaveRedis = document.getElementById('btn-redis-save');
    if (btnSaveRedis) btnSaveRedis.addEventListener('click', function() {
      var payload = {
        host: document.getElementById('redis-host').value.trim(),
        port: parseInt(document.getElementById('redis-port').value, 10),
        password: document.getElementById('redis-password').value,
        prefix: document.getElementById('redis-prefix').value.trim(),
        enabled: document.getElementById('redis-enabled').checked
      };
      apiPost('/api/super/infra-cloud/redis', payload, function(err, data) {
        if (err || !data || !data.ok) { showToast(data ? data.erro : 'Erro ao salvar.', 'error'); return; }
        showToast('Config Redis salva! Testando...', 'success');
        apiPost('/api/super/infra-cloud/redis/test', {}, function(e2, d2) {
          var fb = document.getElementById('redis-feedback');
          if (d2 && d2.ok) {
            if (fb) { fb.style.color = '#86efac'; fb.textContent = '✓ ' + d2.mensagem; }
            document.getElementById('redis-status').textContent = 'Ativado';
            var ri = document.getElementById('redis-info');
            if (ri) { ri.style.display = 'none'; }
          } else {
            if (fb) { fb.style.color = '#fca5a5'; fb.textContent = '✗ ' + (d2 ? d2.erro : 'Erro'); }
            document.getElementById('redis-enabled').checked = false;
            var ri2 = document.getElementById('redis-info');
            if (ri2) {
              ri2.style.display = 'block';
              ri2.textContent = (d2 ? d2.erro : 'Redis indisponível') + '. Cache desativado.';
            }
          }
        });
      });
    });

    // Backup schedule
    var btnSaveBackup = document.getElementById('btn-backup-schedule-save');
    if (btnSaveBackup) btnSaveBackup.addEventListener('click', function() {
      var payload = {
        frequency: document.getElementById('backup-freq').value,
        retention_days: parseInt(document.getElementById('backup-retention').value, 10),
        destination: document.getElementById('backup-dest').value
      };
      apiPost('/api/super/infra-cloud/backup-schedule', payload, function(err, data) {
        var fb = document.getElementById('backup-schedule-feedback');
        if (err || !data || !data.ok) {
          if (fb) { fb.style.color = '#fca5a5'; fb.textContent = '✗ ' + (data ? data.erro : 'Erro'); }
        } else {
          if (fb) { fb.style.color = '#86efac'; fb.textContent = '✓ ' + data.mensagem; }
          document.getElementById('backup-schedule-status').textContent = payload.frequency !== 'manual' ? payload.frequency : 'Manual';
        }
      });
    });

    // Crash alerts
    var btnSaveCrash = document.getElementById('btn-crash-alert-save');
    if (btnSaveCrash) btnSaveCrash.addEventListener('click', function() {
      var payload = {
        channel: document.getElementById('crash-channel').value,
        webhook_url: document.getElementById('crash-webhook-url').value.trim()
      };
      apiPost('/api/super/infra-cloud/crash-alerts', payload, function(err, data) {
        var fb = document.getElementById('crash-alert-feedback');
        if (err || !data || !data.ok) {
          if (fb) { fb.style.color = '#fca5a5'; fb.textContent = '✗ ' + (data ? data.erro : 'Erro'); }
        } else {
          if (fb) { fb.style.color = '#86efac'; fb.textContent = '✓ ' + data.mensagem; }
          document.getElementById('crash-alert-status').textContent = payload.channel !== 'none' ? 'Ativados' : 'Inativos';
        }
      });
    });

    var btnTestCrash = document.getElementById('btn-crash-alert-test');
    if (btnTestCrash) btnTestCrash.addEventListener('click', function() {
      apiPost('/api/super/infra-cloud/crash-alerts/test', {}, function(err, data) {
        var fb = document.getElementById('crash-alert-feedback');
        if (err || !data || !data.ok) {
          if (fb) { fb.style.color = '#fca5a5'; fb.textContent = '✗ ' + (data ? data.erro : 'Erro'); }
        } else {
          if (fb) { fb.style.color = '#86efac'; fb.textContent = '✓ ' + data.mensagem; }
          showToast('Alerta teste enviado!', 'success');
        }
      });
    });
  });
})();

function downloadR2Backup(filename) {
  showToast('Download de ' + filename + ' — funcionalidade em desenvolvimento.', 'info');
}

// ═══════════════════════════════════════════════════════════════════
// TÚNEIS & FALLBACK
// ═══════════════════════════════════════════════════════════════════

function carregarTuneis() {
  apiGet('/api/super/tuneis/status', function(err, data) {
    if (err || !data || !data.ok) { showToast('Erro ao carregar status dos túneis.', 'error'); return; }
    var g = data.global || {};
    var tunnels = data.tunnels || [];

    // Config global
    var gp = document.getElementById('tunel-global-port');
    var gm = document.getElementById('tunel-global-mode');
    var gpr = document.getElementById('tunel-global-priority');
    if (gp) gp.value = g.port || 8080;
    if (gm) gm.value = g.mode || 'manual';
    if (gpr) gpr.value = g.priority || '1';

    // Stats
    var activeCount = tunnels.filter(function(t) { return t.status === 'running'; }).length;
    var asEl = document.getElementById('tuneis-ativos-count');
    if (asEl) asEl.textContent = activeCount;
    var ptEl = document.getElementById('tuneis-porta');
    if (ptEl) ptEl.textContent = g.port || 8080;
    var asBadge = document.getElementById('tuneis-autostart');
    if (asBadge) asBadge.textContent = g.mode === 'auto' ? 'Ligado' : 'Desligado';
    var badge = document.getElementById('tuneis-badge');
    if (badge) { badge.style.display = activeCount > 0 ? '' : 'none'; badge.textContent = activeCount; }

    // Porta no info banner
    var ps = document.getElementById('tunel-porta-servidor');
    if (ps) ps.textContent = g.port || 8080;

    // Para cada túnel, preenche campos e status
    var mapPrefix = { 'cloudflare': 'cf', 'ngrok': 'ngrok', 'localtunnel': 'lt', 'localhost.run': 'lhr' };
    tunnels.forEach(function(t) {
      var p = mapPrefix[t.name] || t.name;
      var badge = document.getElementById(p + '-tunnel-status-badge');
      var toggle = document.getElementById(p + '-tunnel-enabled');
      var urlEl = document.getElementById(p + '-tunnel-url');

      if (badge) {
        var colors = { running: '#10b981', starting: '#f59e0b', stopped: '#6b7280', error: '#ef4444' };
        var labels = { running: 'Rodando', starting: 'Iniciando...', stopped: 'Desligado', error: 'Erro' };
        badge.style.background = colors[t.status] || '#374151';
        badge.style.color = '#fff';
        badge.textContent = labels[t.status] || t.status;
      }
      if (toggle) toggle.checked = t.status === 'running' || t.status === 'starting';
      if (urlEl) {
        if (t.url) { urlEl.style.display = 'block'; urlEl.textContent = '🌐 ' + t.url; }
        else { urlEl.style.display = 'none'; }
      }

      // Preenche campos de config
      var cfg = t.config || {};
      if (t.name === 'cloudflare') {
        var ctk = document.getElementById('cf-tunnel-token');
        var csd = document.getElementById('cf-tunnel-subdomain');
        if (ctk) ctk.value = cfg.token || '';
        if (csd) csd.value = cfg.subdomain || '';
      } else if (t.name === 'ngrok') {
        var ntk = document.getElementById('ngrok-tunnel-token');
        var ndm = document.getElementById('ngrok-tunnel-domain');
        if (ntk) ntk.value = cfg.token || '';
        if (ndm) ndm.value = cfg.domain || '';
      } else if (t.name === 'localtunnel') {
        var lsd = document.getElementById('lt-tunnel-subdomain');
        var lau = document.getElementById('lt-tunnel-auth');
        if (lsd) lsd.value = cfg.subdomain || '';
        if (lau) lau.value = cfg.auth || '0';
      } else if (t.name === 'localhost.run') {
        var lkey = document.getElementById('lhr-tunnel-key');
        var lssl = document.getElementById('lhr-tunnel-ssl');
        if (lkey) lkey.value = cfg.sshkey || '';
        if (lssl) lssl.value = cfg.ssl || '443';
      }
    });

    // Carrega logs
    carregarTuneisLogs();
  });
}

function carregarTuneisLogs() {
  apiGet('/api/super/tuneis/logs', function(err, data) {
    var el = document.getElementById('tuneis-log');
    if (!el) return;
    if (err || !data || !data.ok || !data.logs || data.logs.length === 0) {
      el.innerHTML = 'Nenhuma atividade registrada.';
      return;
    }
    el.innerHTML = data.logs.map(function(l) { return '<div style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.03);">' + esc(l) + '</div>'; }).join('');
    el.scrollTop = el.scrollHeight;
  });
}

function salvarTunnelConfig(name) {
  var config = {};
  if (name === 'cloudflare') {
    config = {
      token: document.getElementById('cf-tunnel-token').value.trim(),
      subdomain: document.getElementById('cf-tunnel-subdomain').value.trim()
    };
  } else if (name === 'ngrok') {
    config = {
      token: document.getElementById('ngrok-tunnel-token').value.trim(),
      domain: document.getElementById('ngrok-tunnel-domain').value.trim()
    };
  } else if (name === 'localtunnel') {
    config = {
      subdomain: document.getElementById('lt-tunnel-subdomain').value.trim(),
      auth: document.getElementById('lt-tunnel-auth').value
    };
  } else if (name === 'localhost.run') {
    config = {
      sshkey: document.getElementById('lhr-tunnel-key').value.trim(),
      ssl: document.getElementById('lhr-tunnel-ssl').value
    };
  }
  apiPost('/api/super/tuneis/config/' + name, config, function(err, data) {
    var pfx = { 'cloudflare': 'cf', 'ngrok': 'ngrok', 'localtunnel': 'lt', 'localhost.run': 'lhr' };
    var fb = document.getElementById((pfx[name] || name) + '-tunnel-feedback');
    if (err || !data || !data.ok) {
      if (fb) { fb.style.color = '#fca5a5'; fb.textContent = '✗ ' + (data ? data.erro : 'Erro'); }
    } else {
      if (fb) { fb.style.color = '#86efac'; fb.textContent = '✓ ' + data.mensagem; }
    }
  });
}

function testarTunnel(name) {
  var pfx = { 'cloudflare': 'cf', 'ngrok': 'ngrok', 'localtunnel': 'lt', 'localhost.run': 'lhr' };
  var fb = document.getElementById((pfx[name] || name) + '-tunnel-feedback');
  if (fb) { fb.style.color = '#94a3b8'; fb.textContent = 'Iniciando ' + name + '...'; }
  apiPost('/api/super/tuneis/start/' + name, {}, function(err, data) {
    if (err || !data || !data.ok) {
      if (fb) { fb.style.color = '#fca5a5'; fb.textContent = '✗ ' + (data ? data.erro : 'Erro'); }
    } else {
      if (fb) { fb.style.color = '#86efac'; fb.textContent = '✓ ' + data.mensagem; }
      // Polling de status por 20s para capturar URL
      var attempts = 0;
      var poll = setInterval(function() {
        attempts++;
        apiGet('/api/super/tuneis/status', function(e2, d2) {
          if (d2 && d2.ok && d2.tunnels) {
            var t = d2.tunnels.find(function(t) { return t.name === name; });
            if (t && t.url) {
              clearInterval(poll);
              carregarTuneis();
            }
          }
        });
        if (attempts >= 10) { clearInterval(poll); carregarTuneis(); }
      }, 2000);
    }
  });
}

function pararTunnel(name) {
  apiPost('/api/super/tuneis/stop/' + name, {}, function(err, data) {
    carregarTuneis();
  });
}

// Event listeners — Tuneis
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    var btnSaveGlobal = document.getElementById('btn-tunel-global-save');
    if (btnSaveGlobal) btnSaveGlobal.addEventListener('click', function() {
      var payload = {
        port: parseInt(document.getElementById('tunel-global-port').value, 10),
        mode: document.getElementById('tunel-global-mode').value,
        priority: document.getElementById('tunel-global-priority').value
      };
      apiPost('/api/super/tuneis/config-global', payload, function(err, data) {
        var fb = document.getElementById('tunel-global-feedback');
        if (err || !data || !data.ok) {
          if (fb) { fb.style.color = '#fca5a5'; fb.textContent = '✗ ' + (data ? data.erro : 'Erro'); }
        } else {
          if (fb) { fb.style.color = '#86efac'; fb.textContent = '✓ ' + data.mensagem; }
          document.getElementById('tuneis-porta').textContent = payload.port;
          document.getElementById('tuneis-autostart').textContent = payload.mode === 'auto' ? 'Ligado' : 'Desligado';
        }
      });
    });

    // Toggle handlers
    document.querySelectorAll('.tunnel-toggle').forEach(function(toggle) {
      toggle.addEventListener('change', function() {
        var name = this.getAttribute('data-tunnel');
        if (this.checked) {
          testarTunnel(name);
        } else {
          pararTunnel(name);
        }
      });
    });
  });
})();

/* ═══════════════════════════════════════════════════════════════
   PROVEDORES DE IMAGEM — Pool com round-robin
   ═══════════════════════════════════════════════════════════════ */

var _imgProviders = [];
var _imgPresets = {};

var IMGPROV_PRESET_INFO = {
  imgbb: { nome: 'ImgBB', icon: 'fa-solid fa-image', color: '#3b82f6', desc: 'Upload grátis, 32MB, sem limite diário. API Key do imgbb.com/api.', fields: ['api_key'] },
  cloudinary: { nome: 'Cloudinary', icon: 'fa-solid fa-cloud', color: '#8b5cf6', desc: '25GB grátis, CDN global, transformação de imagens. Precisa cloud_name + api_key.', fields: ['cloud_name', 'api_key', 'api_secret'] },
  imgur: { nome: 'Imgur', icon: 'fa-brands fa-imgur', color: '#10b981', desc: '1250 uploads/dia grátis. Client-ID do imgur.com/account/settings/apps.', fields: ['api_key'] },
  custom: { nome: 'Custom', icon: 'fa-solid fa-code', color: '#f59e0b', desc: 'Endpoint personalizado. Configure URL, headers e body manualmente.', fields: [] }
};

function carregarImageProviders() {
  apiGet('/api/super/image-providers', function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao carregar provedores de imagem.', 'error');
      return;
    }
    _imgProviders = data.providers || [];
    _imgPresets = data.presets || {};
    renderImgProvPresets();
    renderImgProvList();
    updateImgProvStats();
  });
}

function renderImgProvPresets() {
  var grid = document.getElementById('imgprov-presets-grid');
  if (!grid) return;
  var html = '';
  Object.keys(IMGPROV_PRESET_INFO).forEach(function(key) {
    if (key === 'custom') return;
    var info = IMGPROV_PRESET_INFO[key];
    var already = _imgProviders.some(function(p) { return p.type === key && p.ativo !== false; });
    html += '<div style="background:rgba(0,0,0,0.2);border:1px solid var(--border-color);border-radius:10px;padding:1rem;cursor:pointer;transition:all .2s;" ' +
      'onmouseover="this.style.borderColor=\'' + info.color + '\'" onmouseout="this.style.borderColor=\'var(--border-color)\'" ' +
      'onclick="abrirModalPresetProvider(\'' + key + '\')">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
      '<i class="' + info.icon + '" style="color:' + info.color + ';font-size:1.1rem;"></i>' +
      '<strong style="font-size:0.9rem;">' + info.nome + '</strong>' +
      (already ? '<span style="margin-left:auto;font-size:0.65rem;background:#10b981;color:#fff;padding:2px 6px;border-radius:99px;">ATIVO</span>' : '') +
      '</div>' +
      '<p style="font-size:0.75rem;color:var(--text-muted);line-height:1.4;">' + info.desc + '</p>' +
      '</div>';
  });
  grid.innerHTML = html;
}

function renderImgProvList() {
  var container = document.getElementById('imgprov-list');
  if (!container) return;
  if (_imgProviders.length === 0) {
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);text-align:center;padding:20px;">Nenhum provedor configurado. Adicione via Setup Automático ou Manual.</p>';
    return;
  }
  var html = '';
  _imgProviders.forEach(function(p, idx) {
    var presetInfo = IMGPROV_PRESET_INFO[p.type] || IMGPROV_PRESET_INFO.custom;
    var isActive = p.ativo !== false;
    var badgeColor = isActive ? '#10b981' : '#64748b';
    var badgeText = isActive ? 'Ativo' : 'Inativo';
    var usage = parseInt(p.usage_count || '0');
    html += '<div class="imgprov-card" draggable="true" data-idx="' + idx + '" ' +
      'style="background:rgba(0,0,0,0.2);border:1px solid var(--border-color);border-radius:10px;padding:1rem;display:flex;align-items:center;gap:12px;cursor:grab;transition:all .2s;" ' +
      'ondragstart="event.dataTransfer.setData(\'text/plain\',' + idx + ')" ondragover="event.preventDefault()" ' +
      'ondrop="event.preventDefault();reorderImgProv(parseInt(event.dataTransfer.getData(\'text/plain\')),' + idx + ')">' +
      '<div style="font-size:1.2rem;color:#64748b;cursor:grab;" title="Arrastar para reordenar"><i class="fa-solid fa-grip-vertical"></i></div>' +
      '<div style="width:40px;height:40px;border-radius:10px;background:' + presetInfo.color + '22;display:flex;align-items:center;justify-content:center;">' +
      '<i class="' + presetInfo.icon + '" style="color:' + presetInfo.color + ';"></i></div>' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
      '<strong style="font-size:0.9rem;">' + escapeHtml(p.nome || presetInfo.nome) + '</strong>' +
      '<span style="font-size:0.6rem;padding:2px 6px;border-radius:99px;background:' + badgeColor + '22;color:' + badgeColor + ';font-weight:600;">' + badgeText + '</span>' +
      '<span style="font-size:0.6rem;padding:2px 6px;border-radius:99px;background:rgba(255,255,255,0.05);color:#94a3b8;">#' + (idx + 1) + '</span>' +
      '</div>' +
      '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">' + escapeHtml(p.upload_url || 'N/A').substring(0, 50) + '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
      '<span style="font-size:0.7rem;color:#94a3b8;">' + usage + ' uploads</span>' +
      '<button onclick="testarImgProvider(\'' + p.id + '\')" title="Testar" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border-color);background:rgba(0,0,0,0.2);color:#3b82f6;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.8rem;"><i class="fa-solid fa-vial"></i></button>' +
      '<button onclick="toggleImgProvider(\'' + p.id + '\')" title="' + (isActive ? 'Desativar' : 'Ativar') + '" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border-color);background:rgba(0,0,0,0.2);color:' + (isActive ? '#f59e0b' : '#10b981') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.8rem;"><i class="fa-solid fa-toggle-' + (isActive ? 'on' : 'off') + '"></i></button>' +
      '<button onclick="editarImgProvider(\'' + p.id + '\')" title="Editar" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border-color);background:rgba(0,0,0,0.2);color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.8rem;"><i class="fa-solid fa-pen"></i></button>' +
      '<button onclick="removerImgProvider(\'' + p.id + '\')" title="Remover" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--border-color);background:rgba(0,0,0,0.2);color:#ef4444;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.8rem;"><i class="fa-solid fa-trash"></i></button>' +
      '</div></div>';
  });
  container.innerHTML = html;
}

function updateImgProvStats() {
  var active = _imgProviders.filter(function(p) { return p.ativo !== false; }).length;
  var total = _imgProviders.reduce(function(s, p) { return s + parseInt(p.usage_count || '0'); }, 0);
  var el1 = document.getElementById('imgprov-ativos-count');
  var el2 = document.getElementById('imgprov-total-uploads');
  var el3 = document.getElementById('imgprov-fallback-status');
  var badge = document.getElementById('image-providers-badge');
  if (el1) el1.textContent = active;
  if (el2) el2.textContent = total;
  if (el3) el3.textContent = active >= 2 ? 'OK' : (active === 1 ? 'Único' : 'Nenhum');
  if (badge) { badge.style.display = active > 0 ? '' : 'none'; badge.textContent = active; }
}

function abrirModalPresetProvider(type) {
  var info = IMGPROV_PRESET_INFO[type];
  if (!info) return;
  var modal = document.getElementById('modal-imgprov-preset');
  var title = document.getElementById('modal-imgprov-preset-title');
  var desc = document.getElementById('modal-imgprov-preset-desc');
  var fields = document.getElementById('modal-imgprov-preset-fields');
  var saveBtn = document.getElementById('modal-imgprov-preset-save');

  title.textContent = 'Adicionar ' + info.nome;
  desc.textContent = info.desc;

  var fieldsHtml = '<div style="display:grid;gap:0.75rem;">';
  fieldsHtml += '<div><label style="font-size:0.8rem;color:var(--text-muted);">Nome deste provedor</label>' +
    '<input id="preset-nome" type="text" value="' + info.nome + '" style="width:100%;padding:0.55rem 0.75rem;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-size:0.85rem;margin-top:0.25rem;"></div>';

  info.fields.forEach(function(f) {
    var label = f === 'api_key' ? 'API Key' : f === 'cloud_name' ? 'Cloud Name' : f === 'api_secret' ? 'API Secret' : f;
    var isSecret = f.includes('secret') || f.includes('key');
    fieldsHtml += '<div><label style="font-size:0.8rem;color:var(--text-muted);">' + label + ' *</label>' +
      '<input id="preset-' + f + '" type="' + (isSecret ? 'password' : 'text') + '" placeholder="' + label + '" ' +
      'style="width:100%;padding:0.55rem 0.75rem;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-size:0.85rem;margin-top:0.25rem;"></div>';
  });
  fieldsHtml += '</div>';
  fields.innerHTML = fieldsHtml;

  modal.style.display = 'flex';

  saveBtn.onclick = function() {
    var nome = document.getElementById('preset-nome').value.trim() || info.nome;
    var config = {};
    info.fields.forEach(function(f) {
      config[f] = (document.getElementById('preset-' + f).value || '').trim();
    });

    var preset = _imgPresets[type] || {};
    var provider = {
      id: 'prov_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      nome: nome,
      type: type,
      upload_url: preset.upload_url || '',
      method: preset.method || 'POST',
      content_type: preset.content_type || 'application/x-www-form-urlencoded',
      headers_template: preset.headers_template || {},
      body_template: preset.body_template || '',
      response_url_path: preset.response_url_path || '',
      max_size_mb: preset.max_size_mb || 10,
      config: config,
      ativo: true,
      priority: _imgProviders.length,
      usage_count: 0,
      created_at: new Date().toISOString()
    };

    _imgProviders.push(provider);
    saveImgProviders(function(ok) {
      modal.style.display = 'none';
      if (ok) {
        showToast(nome + ' adicionado com sucesso!', 'success');
        carregarImageProviders();
      }
    });
  };
}

function abrirModalNovoProvider() {
  document.getElementById('modal-imgprov-manual').style.display = 'flex';
  document.getElementById('manual-nome').value = '';
  document.getElementById('manual-apikey').value = '';
  document.getElementById('manual-upload-url').value = '';
  document.getElementById('manual-method').value = 'POST';
  document.getElementById('manual-content-type').value = 'application/x-www-form-urlencoded';
  document.getElementById('manual-body').value = '';
  document.getElementById('manual-response-path').value = 'url';
  document.getElementById('manual-maxsize').value = '10';
}

function salvarProviderManual() {
  var nome = document.getElementById('manual-nome').value.trim();
  var apiKey = document.getElementById('manual-apikey').value.trim();
  var uploadUrl = document.getElementById('manual-upload-url').value.trim();
  var method = document.getElementById('manual-method').value;
  var contentType = document.getElementById('manual-content-type').value;
  var body = document.getElementById('manual-body').value.trim();
  var responsePath = document.getElementById('manual-response-path').value.trim();
  var maxSize = parseInt(document.getElementById('manual-maxsize').value) || 10;

  if (!nome || !uploadUrl) {
    showToast('Nome e URL de Upload são obrigatórios.', 'error');
    return;
  }

  var provider = {
    id: 'prov_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    nome: nome,
    type: 'custom',
    upload_url: uploadUrl,
    method: method,
    content_type: contentType,
    headers_template: apiKey ? { 'Authorization': 'Bearer ' + apiKey } : {},
    body_template: body || 'image={base64}',
    response_url_path: responsePath || 'url',
    max_size_mb: maxSize,
    config: { api_key: apiKey },
    ativo: true,
    priority: _imgProviders.length,
    usage_count: 0,
    created_at: new Date().toISOString()
  };

  _imgProviders.push(provider);
  saveImgProviders(function(ok) {
    document.getElementById('modal-imgprov-manual').style.display = 'none';
    if (ok) {
      showToast(nome + ' adicionado com sucesso!', 'success');
      carregarImageProviders();
    }
  });
}

function editarImgProvider(id) {
  var provider = _imgProviders.find(function(p) { return p.id === id; });
  if (!provider) return;
  var modal = document.getElementById('modal-imgprov-edit');
  var nameEl = document.getElementById('edit-imgprov-name');
  var fields = document.getElementById('modal-imgprov-edit-fields');
  var saveBtn = document.getElementById('modal-imgprov-edit-save');

  nameEl.textContent = 'Editando: ' + provider.nome;

  var html = '<div style="grid-column:1/-1;"><label style="font-size:0.8rem;color:var(--text-muted);">Nome</label>' +
    '<input id="edit-nome" type="text" value="' + escapeHtml(provider.nome) + '" style="width:100%;padding:0.55rem 0.75rem;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-size:0.85rem;margin-top:0.25rem;"></div>' +
    '<div style="grid-column:1/-1;"><label style="font-size:0.8rem;color:var(--text-muted);">API Key</label>' +
    '<input id="edit-apikey" type="password" value="' + escapeHtml(provider.config?.api_key || '') + '" placeholder="••••••" style="width:100%;padding:0.55rem 0.75rem;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-size:0.85rem;margin-top:0.25rem;"></div>' +
    '<div style="grid-column:1/-1;"><label style="font-size:0.8rem;color:var(--text-muted);">URL de Upload</label>' +
    '<input id="edit-url" type="url" value="' + escapeHtml(provider.upload_url) + '" style="width:100%;padding:0.55rem 0.75rem;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-size:0.85rem;margin-top:0.25rem;"></div>' +
    '<div><label style="font-size:0.8rem;color:var(--text-muted);">Método</label>' +
    '<select id="edit-method" style="width:100%;padding:0.55rem 0.75rem;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-size:0.85rem;margin-top:0.25rem;">' +
    '<option value="POST"' + (provider.method === 'POST' ? ' selected' : '') + '>POST</option>' +
    '<option value="PUT"' + (provider.method === 'PUT' ? ' selected' : '') + '>PUT</option></select></div>' +
    '<div><label style="font-size:0.8rem;color:var(--text-muted);">Content-Type</label>' +
    '<select id="edit-content-type" style="width:100%;padding:0.55rem 0.75rem;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-size:0.85rem;margin-top:0.25rem;">' +
    '<option value="application/x-www-form-urlencoded"' + (provider.content_type === 'application/x-www-form-urlencoded' ? ' selected' : '') + '>x-www-form-urlencoded</option>' +
    '<option value="application/json"' + (provider.content_type === 'application/json' ? ' selected' : '') + '>JSON</option>' +
    '<option value="multipart/form-data"' + (provider.content_type === 'multipart/form-data' ? ' selected' : '') + '>multipart/form-data</option></select></div>' +
    '<div style="grid-column:1/-1;"><label style="font-size:0.8rem;color:var(--text-muted);">Body Template</label>' +
    '<input id="edit-body" type="text" value="' + escapeHtml(provider.body_template) + '" style="width:100%;padding:0.55rem 0.75rem;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-size:0.85rem;margin-top:0.25rem;"></div>' +
    '<div style="grid-column:1/-1;"><label style="font-size:0.8rem;color:var(--text-muted);">Response URL Path</label>' +
    '<input id="edit-response-path" type="text" value="' + escapeHtml(provider.response_url_path) + '" style="width:100%;padding:0.55rem 0.75rem;background:rgba(0,0,0,0.25);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-size:0.85rem;margin-top:0.25rem;"></div>';
  fields.innerHTML = html;
  modal.style.display = 'flex';

  saveBtn.onclick = function() {
    provider.nome = document.getElementById('edit-nome').value.trim() || provider.nome;
    var newKey = document.getElementById('edit-apikey').value.trim();
    if (newKey) provider.config = Object.assign({}, provider.config, { api_key: newKey });
    provider.upload_url = document.getElementById('edit-url').value.trim();
    provider.method = document.getElementById('edit-method').value;
    provider.content_type = document.getElementById('edit-content-type').value;
    provider.body_template = document.getElementById('edit-body').value.trim();
    provider.response_url_path = document.getElementById('edit-response-path').value.trim();

    saveImgProviders(function(ok) {
      modal.style.display = 'none';
      if (ok) {
        showToast('Provedor atualizado!', 'success');
        carregarImageProviders();
      }
    });
  };
}

function toggleImgProvider(id) {
  var provider = _imgProviders.find(function(p) { return p.id === id; });
  if (!provider) return;
  provider.ativo = provider.ativo === false ? true : false;
  saveImgProviders(function(ok) {
    if (ok) {
      showToast(provider.nome + (provider.ativo ? ' ativado' : ' desativado') + '.', 'success');
      carregarImageProviders();
    }
  });
}

function removerImgProvider(id) {
  if (!confirm('Remover este provedor permanentemente?')) return;
  _imgProviders = _imgProviders.filter(function(p) { return p.id !== id; });
  saveImgProviders(function(ok) {
    if (ok) {
      showToast('Provedor removido.', 'success');
      carregarImageProviders();
    }
  });
}

function testarImgProvider(id) {
  showToast('Testando upload...', 'info');
  apiPost('/api/super/image-providers/test/' + id, {}, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Falha no teste: ' + (data ? data.erro : 'Erro de rede'), 'error');
    } else {
      showToast('✓ ' + data.provider + ': Upload OK!', 'success');
    }
  });
}

function reorderImgProv(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  var item = _imgProviders.splice(fromIdx, 1)[0];
  _imgProviders.splice(toIdx, 0, item);
  _imgProviders.forEach(function(p, i) { p.priority = i; });
  saveImgProviders(function(ok) {
    if (ok) {
      renderImgProvList();
      showToast('Ordem atualizada.', 'success');
    }
  });
}

function saveImgProviders(cb) {
  apiPost('/api/super/image-providers', { providers: _imgProviders }, function(err, data) {
    if (err || !data || !data.ok) {
      showToast('Erro ao salvar: ' + (data ? data.erro : 'Erro de rede'), 'error');
      if (cb) cb(false);
    } else {
      if (cb) cb(true);
    }
  });
}

// Injeta a central logo após o login (quando os sockets iniciam)
var _saCentralOriginalInit = initSuperAdminSockets;
initSuperAdminSockets = function () {
  _saCentralOriginalInit.apply(this, arguments);
  setTimeout(saCentralInjetar, 300);
};

/* ═══════════════════════════════════════════════════════════════
   SISTEMA DE TAREFAS — Super Admin Painel
   ═══════════════════════════════════════════════════════════════ */
(function() {
  const _tarefasState = { filtro: '', tarefas: [], equipe: [], restaurantes: [] };

  function authHeaders() {
    const t = localStorage.getItem('super_admin_token') || sessionStorage.getItem('super_admin_token') || localStorage.getItem('chef_super_admin_local_token') || localStorage.getItem('super_token') || (typeof localToken !== 'undefined' ? localToken : '') || '';
    return { 'Authorization': 'Bearer ' + t, 'x-super-admin-token': t, 'Content-Type': 'application/json' };
  }

  function esc(str) {
    const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML;
  }

  function prioridadeBadge(p) {
    const colors = { urgente: '#dc2626', alta: '#f59e0b', normal: '#3b82f6', baixa: '#94a3b8' };
    return '<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;color:#fff;background:' + (colors[p] || '#6b7280') + ';text-transform:uppercase;">' + esc(p || 'normal') + '</span>';
  }

  function statusBadge(s) {
    const colors = { pendente: '#f59e0b', atribuida: '#3b82f6', em_andamento: '#8b5cf6', concluida: '#10b981', cancelada: '#6b7280', aviso: '#f59e0b' };
    const labels = { pendente: 'Pendente', atribuida: 'Atribuída', em_andamento: 'Em Andamento', concluida: 'Concluída', cancelada: 'Cancelada', aviso: 'Pendente' };
    return '<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;color:#fff;background:' + (colors[s] || '#6b7280') + ';">' + (labels[s] || s) + '</span>';
  }

  async function carregarTarefas() {
    try {
      const params = _tarefasState.filtro ? '?status=' + _tarefasState.filtro : '';
      const [tRes, sRes] = await Promise.all([
        fetch('/api/super/tarefas' + params, { headers: authHeaders(), credentials: 'include' }).then(r => r.json()),
        fetch('/api/super/tarefas/stats', { headers: authHeaders(), credentials: 'include' }).then(r => r.json())
      ]);
      if (tRes && tRes.ok) _tarefasState.tarefas = tRes.tarefas || [];
      if (sRes && sRes.ok && sRes.stats) {
        const s = sRes.stats;
        const el = (id) => document.getElementById(id);
        if (el('tarefa-stat-pendente')) el('tarefa-stat-pendente').textContent = s.pendente || 0;
        if (el('tarefa-stat-atribuida')) el('tarefa-stat-atribuida').textContent = s.atribuida || 0;
        if (el('tarefa-stat-em_andamento')) el('tarefa-stat-em_andamento').textContent = s.em_andamento || 0;
        if (el('tarefa-stat-concluida')) el('tarefa-stat-concluida').textContent = s.concluida || 0;
        const pendingTotal = (s.pendente || 0) + (s.atribuida || 0);
        const badge = document.getElementById('tarefas-badge');
        if (badge) { badge.style.display = pendingTotal > 0 ? 'inline' : 'none'; badge.textContent = pendingTotal; }
      }
      renderizarTarefas();
    } catch (e) { console.error('[Tarefas] Erro:', e); }
  }
  window.carregarTarefas = carregarTarefas;

  function renderizarTarefas() {
    const box = document.getElementById('tarefas-lista');
    if (!box) return;
    const tarefas = _tarefasState.tarefas;
    if (!tarefas || !tarefas.length) { box.innerHTML = '<div style="text-align:center;padding:40px;color:#999;"><i class="fa-solid fa-check-circle" style="font-size:32px;color:#10b981;display:block;margin-bottom:12px;"></i>Nenhuma tarefa encontrada.</div>'; return; }
    box.innerHTML = tarefas.map(t => {
      const dataCriacao = (t.criado_em || t.criada_em) ? new Date(t.criado_em || t.criada_em).toLocaleDateString('pt-BR') + ' ' + new Date(t.criado_em || t.criada_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
      const dataConcl = t.concluido_em ? new Date(t.concluido_em).toLocaleDateString('pt-BR') : '';
      return '<div style="background:var(--card-bg,#1e293b); border:1px solid var(--border,#334155); border-radius:12px; padding:14px 18px; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">' +
        '<div style="flex:1; min-width:200px;">' +
          '<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">' +
            prioridadeBadge(t.prioridade) + statusBadge(t.status) +
            '<span style="font-size:11px;color:#94a3b8;background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;">' + esc(t.categoria || 'geral') + '</span>' +
          '</div>' +
          '<div style="font-weight:700; color:var(--text,#f8fafc); font-size:14px; margin-bottom:4px;">' + esc(t.titulo) + '</div>' +
          (t.descricao ? '<div style="font-size:12.5px; color:#cbd5e1; line-height:1.4; white-space:pre-wrap; word-break:break-word;">' + esc(t.descricao) + '</div>' : '') +
          '<div style="font-size:11px; color:#64748b; margin-top:6px; display:flex; gap:12px; flex-wrap:wrap;">' +
            '<span><i class="fa-solid fa-clock"></i> ' + dataCriacao + '</span>' +
            (t.atribuido_a ? '<span style="color:#60a5fa;"><i class="fa-solid fa-user"></i> ' + esc(t.atribuido_a) + '</span>' : '') +
            (t.restaurante_id ? '<span><i class="fa-solid fa-store"></i> #' + t.restaurante_id + '</span>' : '') +
            (dataConcl ? '<span style="color:#10b981;"><i class="fa-solid fa-check"></i> ' + dataConcl + '</span>' : '') +
          '</div>' +
          (t.resposta ? '<div style="margin-top:8px;padding:8px 12px;background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); border-radius:8px; font-size:12px; color:#10b981;"><strong>Resposta:</strong> ' + esc(t.resposta) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex; gap:6px; flex-shrink:0; align-items:center;">' +
          (t.status !== 'concluida' && t.status !== 'cancelada' ?
            '<select onchange="superAdmin.moverTarefa(' + t.id + ', this.value)" style="padding:5px 8px; border:1px solid var(--border); border-radius:6px; font-size:11px; background:var(--input-bg,#0f172a); color:var(--text); min-height:30px;">' +
              '<option value="">Mover...</option>' +
              '<option value="atribuida"' + (t.status === 'atribuida' ? ' selected' : '') + '>Atribuída</option>' +
              '<option value="em_andamento"' + (t.status === 'em_andamento' ? ' selected' : '') + '>Em Andamento</option>' +
              '<option value="concluida">Concluída</option>' +
              '<option value="cancelada">Cancelada</option>' +
            '</select>' : '') +
          '<button onclick="superAdmin.excluirTarefa(' + t.id + ')" title="Excluir" style="padding:5px 10px; background:rgba(220,38,38,0.1); color:#dc2626; border:1px solid rgba(220,38,38,0.2); border-radius:6px; cursor:pointer; font-size:12px;"><i class="fa-solid fa-trash"></i></button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  async function carregarEquipeRestaurantes() {
    try {
      const [eRes, rRes] = await Promise.all([
        fetch('/api/super/equipe', { headers: authHeaders(), credentials: 'include' }).then(r => r.json()),
        fetch('/api/super/restaurantes', { headers: authHeaders(), credentials: 'include' }).then(r => r.json())
      ]);
      if (eRes.ok && Array.isArray(eRes.equipe)) _tarefasState.equipe = eRes.equipe;
      if (rRes.ok && Array.isArray(rRes.restaurantes)) _tarefasState.restaurantes = rRes.restaurantes;
    } catch (e) { /* ok */ }
  }

  function popularSelectsTarefa() {
    const selAtb = document.getElementById('tarefa-atribuido');
    const selRest = document.getElementById('tarefa-restaurante');
    if (selAtb) {
      selAtb.innerHTML = '<option value="">Não atribuir ainda</option>' +
        _tarefasState.equipe.map(e => '<option value="' + esc(e.nome || e.name || '') + '">' + esc(e.nome || e.name || '') + '</option>').join('');
    }
    if (selRest) {
      selRest.innerHTML = '<option value="">Nenhum</option>' +
        _tarefasState.restaurantes.map(r => '<option value="' + r.id + '">' + esc(r.nome || r.name || '#' + r.id) + '</option>').join('');
    }
  }

  window.superAdmin = window.superAdmin || {};

  window.superAdmin.abrirModalTarefa = function(tarefa) {
    popularSelectsTarefa();
    const modal = document.getElementById('modal-tarefa');
    if (tarefa) {
      document.getElementById('tarefa-modal-title').textContent = 'Editar Tarefa';
      document.getElementById('tarefa-edit-id').value = tarefa.id;
      document.getElementById('tarefa-titulo').value = tarefa.titulo || '';
      document.getElementById('tarefa-descricao').value = tarefa.descricao || '';
      document.getElementById('tarefa-prioridade').value = tarefa.prioridade || 'normal';
      document.getElementById('tarefa-categoria').value = tarefa.categoria || 'geral';
      document.getElementById('tarefa-atribuido').value = tarefa.atribuido_a || '';
      document.getElementById('tarefa-restaurante').value = tarefa.restaurante_id || '';
    } else {
      document.getElementById('tarefa-modal-title').textContent = 'Nova Tarefa';
      document.getElementById('tarefa-edit-id').value = '';
      document.getElementById('tarefa-titulo').value = '';
      document.getElementById('tarefa-descricao').value = '';
      document.getElementById('tarefa-prioridade').value = 'normal';
      document.getElementById('tarefa-categoria').value = 'geral';
      document.getElementById('tarefa-atribuido').value = '';
      document.getElementById('tarefa-restaurante').value = '';
    }
    modal.style.display = 'flex';
  };

  window.superAdmin.salvarTarefa = async function() {
    const id = document.getElementById('tarefa-edit-id').value;
    const titulo = document.getElementById('tarefa-titulo').value.trim();
    if (!titulo) { alert('Título é obrigatório.'); return; }
    const body = {
      titulo,
      descricao: document.getElementById('tarefa-descricao').value.trim(),
      prioridade: document.getElementById('tarefa-prioridade').value,
      categoria: document.getElementById('tarefa-categoria').value,
      atribuido_a: document.getElementById('tarefa-atribuido').value,
      restaurante_id: document.getElementById('tarefa-restaurante').value || null
    };
    try {
      const url = id ? '/api/super/tarefas/' + id : '/api/super/tarefas';
      const method = id ? 'PATCH' : 'POST';
      const r = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
      const data = await r.json();
      if (data.ok) {
        document.getElementById('modal-tarefa').style.display = 'none';
        carregarTarefas();
      } else { alert(data.erro || 'Erro ao salvar.'); }
    } catch (e) { alert('Falha de conexão.'); }
  };

  window.superAdmin.moverTarefa = async function(id, novoStatus) {
    if (!novoStatus) return;
    try {
      await fetch('/api/super/tarefas/' + id, {
        method: 'PATCH', headers: authHeaders(),
        body: JSON.stringify({ status: novoStatus })
      });
      carregarTarefas();
    } catch (e) { /* ok */ }
  };

  window.superAdmin.excluirTarefa = async function(id) {
    if (!confirm('Excluir esta tarefa?')) return;
    try {
      await fetch('/api/super/tarefas/' + id, { method: 'DELETE', headers: authHeaders() });
      carregarTarefas();
    } catch (e) { /* ok */ }
  };

  window.superAdmin.filtrarTarefas = function(filtro) {
    _tarefasState.filtro = filtro;
    document.querySelectorAll('.tarefa-filtro-btn').forEach(b => {
      b.style.background = 'var(--card-bg)';
      b.style.color = 'var(--text)';
    });
    event.target.style.background = 'var(--primary)';
    event.target.style.color = '#fff';
    carregarTarefas();
  };

  /* Auto-load quando a seção é aberta */
  const origShow = window.showSection;
  if (typeof origShow === 'function') {
    window.showSection = function(sectionId) {
      origShow(sectionId);
      if (sectionId === 'sec-tarefas') carregarTarefas();
    };
  }
  /* Fallback: MutationObserver no menu */
  document.addEventListener('click', (e) => {
    const mi = e.target.closest('.menu-item[data-target="sec-tarefas"]');
    if (mi) setTimeout(carregarTarefas, 200);
  });

  /* Socket: atualizar em tempo real */
  if (typeof io !== 'undefined') {
    io.on('tarefa_nova', () => { if (document.getElementById('sec-tarefas')?.classList.contains('active')) carregarTarefas(); });
    io.on('tarefa_atualizada', () => { if (document.getElementById('sec-tarefas')?.classList.contains('active')) carregarTarefas(); });
    io.on('tarefa_removida', () => { if (document.getElementById('sec-tarefas')?.classList.contains('active')) carregarTarefas(); });
  }

  /* Pre-carregar equipe e restaurantes */
  setTimeout(carregarEquipeRestaurantes, 2000);
})();

/* ═══════════════════════════════════════════════════════════════
   SUPER ADMIN — PLUGIN AUTOLOADER
   Plugins com admin/ + manifest.json aparecem como abas no painel
   ═══════════════════════════════════════════════════════════════ */
(function() {
  const _pluginTabsLoaded = {};
  const _pluginTabInitFns = {};

  function superAuthHeaders() {
    return { 'Authorization': 'Bearer ' + (localStorage.getItem('super_token') || ''), 'Content-Type': 'application/json' };
  }

  function escPlugin(str) {
    const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML;
  }

  async function discoverSuperAdminPlugins() {
    try {
      const r = await fetch('/api/plugins/admin-manifest', { headers: superAuthHeaders() });
      const data = await r.json();
      return (data.ok && Array.isArray(data.manifest)) ? data.manifest : [];
    } catch (e) { return []; }
  }

  function findPluginsCategory() {
    /* Find or create a "Plugins" menu category in the sidebar */
    let cat = document.querySelector('.menu-categoria[data-cat="plugin-dynamic"]');
    if (cat) return cat;
    cat = document.createElement('div');
    cat.className = 'menu-categoria';
    cat.setAttribute('data-cat', 'plugin-dynamic');
    cat.innerHTML = '<div class="cat-header"><i class="fa-solid fa-puzzle-piece"></i><span>Plugins Instalados</span><i class="fa-solid fa-chevron-down cat-seta"></i></div><div class="cat-itens"></div>';
    const sidebar = document.querySelector('.super-admin-sidebar') || document.querySelector('.sidebar') || document.querySelector('.super-sidebar');
    if (sidebar) {
      sidebar.appendChild(cat);
      /* Make category header collapsible */
      const hdr = cat.querySelector('.cat-header');
      if (hdr) {
        hdr.style.cursor = 'pointer';
        hdr.addEventListener('click', function() {
          const itens = cat.querySelector('.cat-itens');
          if (itens) itens.style.display = itens.style.display === 'none' ? 'block' : 'none';
          const seta = cat.querySelector('.cat-seta');
          if (seta) seta.style.transform = itens && itens.style.display === 'none' ? 'rotate(-90deg)' : '';
        });
      }
    }
    return cat;
  }

  function createSuperAdminPluginTab(plugin) {
    const tabId = 'sec-plugin-' + plugin.id;
    const sectionId = tabId;

    /* Check if already exists */
    if (document.getElementById(sectionId)) return;

    /* 1. Create sidebar menu item */
    const cat = findPluginsCategory();
    const itens = cat.querySelector('.cat-itens');
    if (itens) {
      const mi = document.createElement('div');
      mi.className = 'menu-item';
      mi.setAttribute('data-target', sectionId);
      mi.innerHTML = '<i class="fa-solid fa-puzzle-piece"></i><span>' + escPlugin(plugin.displayName || plugin.name) + '</span>';
      mi.addEventListener('click', function() {
        /* Activate tab */
        document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
        mi.classList.add('active');
        document.querySelectorAll('.content-section').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
        const sec = document.getElementById(sectionId);
        if (sec) { sec.classList.add('active'); sec.style.display = 'block'; }
        loadPluginSection(plugin, sec);
      });
      itens.appendChild(mi);
    }

    /* 2. Create content section */
    const sec = document.createElement('div');
    sec.id = sectionId;
    sec.className = 'content-section';
    sec.style.display = 'none';
    sec.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:300px;color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin" style="font-size:24px;"></i></div>';
    /* Insert before terminal section or at end */
    const terminal = document.getElementById('sec-terminal');
    if (terminal && terminal.parentNode) {
      terminal.parentNode.insertBefore(sec, terminal);
    } else {
      const contentArea = document.querySelector('.main-content') || document.querySelector('.content-area');
      if (contentArea) contentArea.appendChild(sec);
    }
  }

  async function loadPluginSection(plugin, sec) {
    if (_pluginTabsLoaded[plugin.id]) return;
    _pluginTabsLoaded[plugin.id] = true;
    try {
      const r = await fetch(plugin.baseUrl + '/index.html');
      if (!r.ok) throw new Error('HTML not found');
      const html = await r.text();
      sec.innerHTML = html;

      const script = document.createElement('script');
      script.src = plugin.baseUrl + '/index.js';
      script.onload = function() {
        const initFn = window['plugin_' + plugin.id + '_init'];
        if (typeof initFn === 'function') {
          try { initFn({ tab: sec, tabId: plugin.id, plugin: plugin }); } catch (e) { console.error('[super-admin-plugin] init error:', e); }
        }
      };
      script.onerror = function() { console.warn('[super-admin-plugin] No index.js for ' + plugin.id); };
      sec.appendChild(script);
    } catch (e) {
      sec.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;">Erro ao carregar plugin: ' + escPlugin(e.message) + '</div>';
    }
  }

  async function boot() {
    const plugins = await discoverSuperAdminPlugins();
    if (!plugins.length) return;
    plugins.forEach(createSuperAdminPluginTab);
    console.log('[super-admin-plugin-autoloader] ' + plugins.length + ' plugin tabs registered');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(boot, 500); });
  } else {
    setTimeout(boot, 500);
  }
})();


// ══════════════════════════════════════════════════════════════════
// CONTROLADOR CLIENTE: SYNCCHEFF INVIOLÁVEL & AUDITORIA DE SCRIPTS
// ══════════════════════════════════════════════════════════════════
(function () {
  window.alternarAbaSyncCheff = function (aba) {
    const abas = ['nos', 'validador', 'gerador', 'logs'];
    abas.forEach(a => {
      const el = document.getElementById('synccheff-subtab-' + a);
      const btn = document.getElementById('btn-tab-synccheff-a');
      if (el) el.style.display = a === aba ? 'block' : 'none';
      const b = document.getElementById('btn-tab-synccheff-' + a);
      if (b) {
        if (a === aba) {
          b.style.background = '#10b981';
          b.style.color = '#fff';
          b.style.border = 'none';
        } else {
          b.style.background = 'var(--bg-card)';
          b.style.color = 'var(--text-main)';
          b.style.border = '1px solid var(--border-color)';
        }
      }
    });
  };

  window.carregarSyncCheffStatus = function () {
    const token = localStorage.getItem('super_admin_token') || sessionStorage.getItem('super_admin_token');
    fetch('/api/super/synccheff/status', {
      headers: {
        'Content-Type': 'application/json',
        'x-super-admin-token': token || ''
      }
    })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;

      // KPIs
      const k = data.kpis || {};
      const elStatus = document.getElementById('synccheff-kpi-status');
      const elNodes = document.getElementById('synccheff-kpi-nodes');
      const elViolacoes = document.getElementById('synccheff-kpi-violacoes');
      const badge = document.getElementById('synccheff-shield-badge');

      if (elStatus) {
        if (k.violados > 0) {
          elStatus.innerHTML = '<span style="color:#ef4444;">⚠️ VIOLAÇÃO DETECTADA (' + k.violados + ')</span>';
          if (badge) { badge.style.background = '#ef4444'; badge.innerText = k.violados + ' ALERTA'; }
        } else {
          elStatus.innerHTML = '<span style="color:#10b981;">🛡️ 100% INVIOLÁVEL</span>';
          if (badge) { badge.style.background = '#10b981'; badge.innerText = '100% OK'; }
        }
      }

      if (elNodes) elNodes.innerText = (k.total_nos || 0) + ' Restaurantes';
      if (elViolacoes) {
        elViolacoes.innerText = (k.violados || 0) + ' Bloqueios';
        elViolacoes.style.color = k.violados > 0 ? '#ef4444' : '#10b981';
      }

      // Tabela de Nós
      const tbody = document.getElementById('synccheff-nodes-table-body');
      if (tbody) {
        if (!data.nodes || data.nodes.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">Nenhum nó de restaurante sincronizado ainda. Crie ou ative um script em "Gerador de Script Assinado".</td></tr>';
        } else {
          tbody.innerHTML = data.nodes.map(n => {
            const isInviolado = n.status === 'inviolado';
            const statusBadge = isInviolado
              ? '<span style="background:rgba(16,185,129,0.15); color:#10b981; padding:4px 10px; border-radius:6px; font-weight:800; font-size:12px; display:inline-flex; align-items:center; gap:5px;"><i class="fa-solid fa-check-double"></i> INVIOLADO</span>'
              : '<span style="background:rgba(239,68,68,0.15); color:#ef4444; padding:4px 10px; border-radius:6px; font-weight:800; font-size:12px; display:inline-flex; align-items:center; gap:5px;"><i class="fa-solid fa-triangle-exclamation"></i> VIOLADO / ADULTERADO</span>';

            const ultimoSync = n.ultimo_sync ? new Date(n.ultimo_sync).toLocaleString('pt-BR') : 'Nunca';

            return `
              <tr style="border-bottom:1px solid var(--border-color); ${!isInviolado ? 'background:rgba(239,68,68,0.05);' : ''}">
                <td style="padding:12px; font-weight:700;">
                  <div>#${n.restaurante_id} — ${n.restaurante_nome_real || n.nome_restaurante || 'Restaurante ' + n.restaurante_id}</div>
                </td>
                <td style="padding:12px;">${statusBadge}</td>
                <td style="padding:12px; font-family:monospace; font-size:12px;">${n.versao_script || 'v2.4-e2ee'}</td>
                <td style="padding:12px; color:var(--text-muted); font-size:12.5px;">${ultimoSync}</td>
                <td style="padding:12px; font-weight:700;">${n.total_syncs || 0}</td>
                <td style="padding:12px; font-family:monospace; font-size:12px;">${n.ip_origem || '127.0.0.1'}</td>
                <td style="padding:12px; text-align:right;">
                  ${!isInviolado ? `<button onclick="window.redefinirStatusViolacao(${n.restaurante_id})" style="padding:5px 10px; background:#10b981; color:#fff; border:none; border-radius:6px; font-weight:700; font-size:11.5px; cursor:pointer; margin-right:6px;"><i class="fa-solid fa-shield"></i> Limpar Alerta</button>` : ''}
                  <button onclick="window.prepararGeradorSyncParaRestaurante(${n.restaurante_id}, '${(n.restaurante_nome_real || n.nome_restaurante || '').replace(/'/g, "\\'")}')" style="padding:5px 10px; background:var(--bg-dark); border:1px solid var(--border-color); color:var(--text-main); border-radius:6px; font-weight:700; font-size:11.5px; cursor:pointer;"><i class="fa-solid fa-code"></i> Gerar Script</button>
                </td>
              </tr>
            `;
          }).join('');
        }
      }

      // Logs de Auditoria
      const logsContainer = document.getElementById('synccheff-logs-container');
      if (logsContainer) {
        if (!data.logs || data.logs.length === 0) {
          logsContainer.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Nenhum registro de segurança recente.</div>';
        } else {
          logsContainer.innerHTML = data.logs.map(l => {
            const isCritico = l.nivel_alerta === 'critico';
            const isWarning = l.nivel_alerta === 'warning';
            const cor = isCritico ? '#ef4444' : (isWarning ? '#f59e0b' : '#10b981');
            const bg = isCritico ? 'rgba(239,68,68,0.1)' : (isWarning ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.06)');

            return `
              <div style="background:${bg}; border:1px solid ${cor}; border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div style="display:flex; align-items:center; gap:10px;">
                  <i class="fa-solid ${isCritico ? 'fa-triangle-exclamation' : (isWarning ? 'fa-circle-exclamation' : 'fa-circle-check')}" style="color:${cor}; font-size:16px;"></i>
                  <div>
                    <strong style="font-size:13.5px; color:var(--text-main);">[${l.tipo_evento.toUpperCase()}] — Restaurante #${l.restaurante_id} (${l.restaurante_nome || 'Nó'})</strong>
                    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">${l.detalhes}</div>
                  </div>
                </div>
                <div style="text-align:right;">
                  <span style="font-size:11.5px; color:var(--text-muted); display:block;">IP: ${l.ip || '127.0.0.1'}</span>
                  <span style="font-size:11.5px; font-weight:700; color:var(--text-main);">${new Date(l.data_registro).toLocaleString('pt-BR')}</span>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    })
    .catch(() => {});
  };

  window.validarScriptInviolavelSuper = function () {
    const input = document.getElementById('synccheff-input-script');
    const resultDiv = document.getElementById('synccheff-validador-result');
    if (!input || !resultDiv) return;

    const codigo = input.value.trim();
    if (!codigo) {
      alert('Cole o script para auditar!');
      return;
    }

    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Auditando hash criptográfico contra Master Root Key...</div>';

    const token = localStorage.getItem('super_admin_token') || sessionStorage.getItem('super_admin_token');
    fetch('/api/super/synccheff/validar-script', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-super-admin-token': token || ''
      },
      body: JSON.stringify({ script: codigo })
    })
    .then(r => r.json())
    .then(res => {
      if (!res.ok) {
        resultDiv.innerHTML = '<div style="padding:16px; background:rgba(239,68,68,0.1); border:1px solid #ef4444; border-radius:10px; color:#ef4444; font-weight:700;">Erro na auditoria: ' + (res.erro || 'Falha ao processar') + '</div>';
        return;
      }

      if (res.inviolado) {
        resultDiv.innerHTML = `
          <div style="background:rgba(16,185,129,0.1); border:2px solid #10b981; border-radius:12px; padding:20px;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
              <i class="fa-solid fa-shield-check" style="color:#10b981; font-size:24px;"></i>
              <h4 style="margin:0; font-size:18px; color:#10b981; font-weight:900;">VEREDITO: 100% INVIOLADO &amp; AUTÊNTICO</h4>
            </div>
            <p style="font-size:13.5px; color:var(--text-main); margin:0 0 12px;">${res.detalhes}</p>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:10px; font-size:12px;">
              <div style="background:var(--bg-card); padding:10px; border-radius:8px; border:1px solid var(--border-color);">
                <strong>Checksum SHA-256 Calculado:</strong>
                <div style="font-family:monospace; color:#10b981; word-break:break-all; margin-top:3px;">${res.hash_calculado}</div>
              </div>
              <div style="background:var(--bg-card); padding:10px; border-radius:8px; border:1px solid var(--border-color);">
                <strong>Assinatura Digital Super Admin:</strong>
                <div style="font-family:monospace; color:#8b5cf6; word-break:break-all; margin-top:3px;">${res.assinatura_oficial || 'HMAC-SHA512-VERIFIED'}</div>
              </div>
            </div>
          </div>
        `;
      } else {
        resultDiv.innerHTML = `
          <div style="background:rgba(239,68,68,0.12); border:2px solid #ef4444; border-radius:12px; padding:20px;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
              <i class="fa-solid fa-triangle-exclamation" style="color:#ef4444; font-size:24px;"></i>
              <h4 style="margin:0; font-size:18px; color:#ef4444; font-weight:900;">ALERTA CRÍTICO: CÓDIGO VIOLADO / ADULTERADO!</h4>
            </div>
            <p style="font-size:13.5px; color:var(--text-main); margin:0 0 12px;">${res.detalhes || 'O código fornecido foi alterado e difere da versão mestre oficial assinada.'}</p>
            <div style="background:var(--bg-card); padding:12px; border-radius:8px; border:1px solid #ef4444; font-size:12px;">
              <strong style="color:#ef4444;">Hash do Script Submetido:</strong>
              <div style="font-family:monospace; color:#ef4444; word-break:break-all; margin:3px 0 8px;">${res.hash_calculado}</div>
              <strong style="color:#10b981;">Hash Mestre Oficial Esperado:</strong>
              <div style="font-family:monospace; color:#10b981; word-break:break-all; margin-top:3px;">${res.hash_oficial}</div>
            </div>
          </div>
        `;
      }
    })
    .catch(err => {
      resultDiv.innerHTML = '<div style="padding:16px; background:rgba(239,68,68,0.1); border:1px solid #ef4444; border-radius:10px; color:#ef4444;">Erro de conexão com o validador: ' + err.message + '</div>';
    });
  };

  window.prepararGeradorSyncParaRestaurante = function (restId, restNome) {
    window.alternarAbaSyncCheff('gerador');
    const inputId = document.getElementById('synccheff-gen-rest-id');
    const inputNome = document.getElementById('synccheff-gen-rest-nome');
    if (inputId) inputId.value = restId;
    if (inputNome) inputNome.value = restNome || ('Restaurante #' + restId);
    window.gerarScriptOficialSyncCheff();
  };

  window.gerarScriptOficialSyncCheff = function () {
    const inputId = document.getElementById('synccheff-gen-rest-id');
    const inputNome = document.getElementById('synccheff-gen-rest-nome');
    const container = document.getElementById('synccheff-gen-output-container');
    const codeEl = document.getElementById('synccheff-gen-code');

    const restId = inputId ? inputId.value : '1';
    const restNome = inputNome ? inputNome.value : 'Restaurante';

    const token = localStorage.getItem('super_admin_token') || sessionStorage.getItem('super_admin_token');
    fetch('/api/super/synccheff/gerar-script', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-super-admin-token': token || ''
      },
      body: JSON.stringify({ restaurante_id: restId, restaurante_nome: restNome })
    })
    .then(r => r.json())
    .then(res => {
      if (res.ok && container && codeEl) {
        container.style.display = 'block';
        codeEl.textContent = res.codigo;
      }
    });
  };

  window.copiarCodigoSyncCheff = function () {
    const codeEl = document.getElementById('synccheff-gen-code');
    if (!codeEl) return;
    navigator.clipboard.writeText(codeEl.textContent).then(() => {
      alert('Código oficial do SyncCheff copiado para a área de transferência!');
    });
  };

  window.redefinirStatusViolacao = function (restauranteId) {
    if (!confirm('Redefinir status de segurança do restaurante #' + restauranteId + ' para INVIOLADO?')) return;
    const token = localStorage.getItem('super_admin_token') || sessionStorage.getItem('super_admin_token');
    fetch('/api/super/synccheff/redefinir-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-super-admin-token': token || ''
      },
      body: JSON.stringify({ restaurante_id: restauranteId })
    })
    .then(r => r.json())
    .then(res => {
      if (res.ok) {
        alert('Status redefinido com sucesso!');
        window.carregarSyncCheffStatus();
      }
    });
  };

  // Carregar status quando a aba for clicada
  document.addEventListener('click', (e) => {
    if (e.target.closest('#menu-item-synccheff') || e.target.closest('[data-target="sec-synccheff"]')) {
      setTimeout(() => window.carregarSyncCheffStatus(), 100);
    }
  });

  // Listener de Alerta em Tempo Real via Socket
  try {
    const synccheffSocket = (typeof _superAdminSocket !== 'undefined' && _superAdminSocket) || (typeof window !== 'undefined' && window.superAdminSocket) || (typeof window !== 'undefined' && window.socket) || (typeof io !== 'undefined' ? io() : null);
    if (synccheffSocket && synccheffSocket.on) {
      synccheffSocket.on('synccheff_alerta_violacao', (alerta) => {
        window.carregarSyncCheffStatus();
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'error',
            title: '🚨 ALERTA DE SEGURANÇA SYNCCHEFF',
            html: '<b>Violação Detectada no Restaurante #' + alerta.restaurante_id + '</b><br>' + alerta.motivo,
            confirmButtonColor: '#ef4444'
          });
        }
      });
    }
  } catch(e) {}
})();


// ─── CONTROLE DO VITE DEV SERVER (SUPER-ADMIN) ───
window.atualizarStatusViteDevServer = function () {
  fetch('/api/super/vite/status')
    .then(r => r.json())
    .then(data => {
      const badge = document.getElementById('badge-vite-status');
      const inputPort = document.getElementById('input-super-vite-port');
      const linkOpen = document.getElementById('link-super-vite-open');

      if (inputPort && data.port) inputPort.value = data.port;
      if (linkOpen && data.url) linkOpen.href = data.url;

      if (badge) {
        if (data.running) {
          badge.innerHTML = `<span style="color:#10b981;">●</span> Rodando na porta ${data.port}`;
          badge.style.background = 'rgba(16,185,129,0.12)';
          badge.style.color = '#065f46';
        } else {
          badge.innerHTML = `<span style="color:#ef4444;">●</span> Desligado / Parado`;
          badge.style.background = 'rgba(239,68,68,0.12)';
          badge.style.color = '#991b1b';
        }
      }
    })
    .catch(() => {});
};

window.controlarViteDevServer = function (action) {
  const port = document.getElementById('input-super-vite-port') ? document.getElementById('input-super-vite-port').value : 5173;
  if (typeof showToast === 'function') showToast('Processando comando do Vite...', 'info');

  fetch('/api/super/vite/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: action, port: parseInt(port) || 5173 })
  })
    .then(r => r.json())
    .then(res => {
      if (res.ok) {
        if (typeof showToast === 'function') showToast(res.message || 'Comando executado com sucesso!', 'success');
        setTimeout(window.atualizarStatusViteDevServer, 1200);
      } else {
        if (typeof showToast === 'function') showToast('Erro: ' + (res.error || 'Falha ao controlar Vite'), 'danger');
      }
    })
    .catch(err => {
      if (typeof showToast === 'function') showToast('Erro de comunicação: ' + err.message, 'danger');
    });
};

setInterval(window.atualizarStatusViteDevServer, 5000);
setTimeout(window.atualizarStatusViteDevServer, 1000);


// ─── MOTOR DE MAPA DE CALOR & TELEMETRIA DE CLIQUES (SUPER-ADMIN) ───
window.carregarMetricasHeatmap = function () {
  const restSelect = document.getElementById('filtro-heatmap-restaurante');
  const colabSelect = document.getElementById('filtro-heatmap-colaborador');
  const periodoSelect = document.getElementById('filtro-heatmap-periodo');

  const restId = restSelect ? restSelect.value : 'todos';
  const colab = colabSelect ? colabSelect.value : 'todos';
  const periodo = periodoSelect ? periodoSelect.value : '7dias';

  fetch(`/api/super/metricas/heatmap-clicks?restaurante_id=${encodeURIComponent(restId)}&colaborador=${encodeURIComponent(colab)}&periodo=${encodeURIComponent(periodo)}`)
    .then(r => r.json())
    .then(data => {
      if (!data || !data.ok) return;

      // 1. Atualizar KPIs
      const stats = data.stats || {};
      const kpiCliques = document.getElementById('kpi-total-cliques');
      const kpiTempo = document.getElementById('kpi-tempo-medio');
      const kpiColabs = document.getElementById('kpi-total-colaboradores');
      const kpiRests = document.getElementById('kpi-total-restaurantes');

      if (kpiCliques) kpiCliques.innerText = Number(stats.total_cliques || 0).toLocaleString();
      if (kpiTempo) {
        const seg = ((stats.media_tempo_ms || 0) / 1000).toFixed(1);
        kpiTempo.innerText = seg + 's';
      }
      if (kpiColabs) kpiColabs.innerText = Number(stats.total_colaboradores || 0).toLocaleString();
      if (kpiRests) kpiRests.innerText = Number(stats.total_restaurantes || 0).toLocaleString();

      // 2. Preencher Selects de Filtros (se vazios)
      if (restSelect && restSelect.children.length <= 1 && data.restaurantes) {
        data.restaurantes.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.restaurante_id;
          opt.innerText = '🏢 ' + (r.restaurante_nome || ('Restaurante ' + r.restaurante_id));
          restSelect.appendChild(opt);
        });
      }

      if (colabSelect && colabSelect.children.length <= 1 && data.colaboradores) {
        data.colaboradores.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.colaborador_nome;
          opt.innerText = '👤 ' + c.colaborador_nome + (c.colaborador_cargo ? (' (' + c.colaborador_cargo + ')') : '');
          colabSelect.appendChild(opt);
        });
      }

      // 3. Renderizar Pontos no Canvas do Heatmap
      const layer = document.getElementById('heatmap-points-layer');
      if (layer) {
        layer.innerHTML = '';
        const points = data.heatmapPoints || [];
        const maxPeso = points.reduce((m, p) => Math.max(m, p.peso || 1), 1);

        points.forEach(p => {
          const dot = document.createElement('div');
          const intensity = Math.min((p.peso / maxPeso), 1);
          const size = 18 + Math.round(intensity * 32);

          let cor = 'rgba(59, 130, 246, 0.4)'; // Azul (baixa)
          if (intensity > 0.6) cor = 'rgba(239, 68, 68, 0.85)'; // Vermelho (alta)
          else if (intensity > 0.3) cor = 'rgba(245, 158, 11, 0.7)'; // Amarelo (média)

          dot.style.position = 'absolute';
          dot.style.left = p.x + '%';
          dot.style.top = p.y + '%';
          dot.style.width = size + 'px';
          dot.style.height = size + 'px';
          dot.style.borderRadius = '50%';
          dot.style.background = cor;
          dot.style.filter = 'blur(' + Math.round(size / 3) + 'px)';
          dot.style.transform = 'translate(-50%, -50%)';
          dot.style.pointerEvents = 'none';
          layer.appendChild(dot);
        });
      }

      // 4. Renderizar Ranking de Funções
      const rankingContainer = document.getElementById('ranking-funcoes-lista');
      if (rankingContainer) {
        rankingContainer.innerHTML = '';
        const funcs = data.topFuncoes || [];
        if (funcs.length === 0) {
          rankingContainer.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:13px; margin:30px 0;">Nenhum clique registrado no período selecionado.</p>';
          return;
        }

        const maxCliques = funcs[0].cliques || 1;
        funcs.forEach((f, idx) => {
          const pct = Math.round((f.cliques / maxCliques) * 100);
          const row = document.createElement('div');
          row.style.background = '#f8fafc';
          row.style.borderRadius = '10px';
          row.style.padding = '10px 12px';
          row.style.border = '1px solid #e2e8f0';

          row.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="width:20px; height:20px; border-radius:50%; background:#fc4b15; color:white; font-size:11px; font-weight:800; display:flex; align-items:center; justify-content:center;">${idx + 1}</span>
                <strong style="font-size:13px; color:#0f172a;">${f.funcao_nome}</strong>
              </div>
              <div style="text-align:right;">
                <strong style="font-size:13px; color:#fc4b15;">${f.cliques.toLocaleString()} cliques</strong>
                <span style="display:block; font-size:11px; color:#64748b;">${f.colaboradores} usuários • ${f.media_segundos}s</span>
              </div>
            </div>
            <div style="width:100%; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, #fc4b15, #f59e0b); border-radius:3px;"></div>
            </div>
          `;
          rankingContainer.appendChild(row);
        });
      }
    })
    .catch(() => {});
};

// Carregamento automático ao entrar na aba
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (typeof window.carregarMetricasHeatmap === 'function') {
      window.carregarMetricasHeatmap();
    }
  }, 1500);
});
