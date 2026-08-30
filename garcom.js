window.activeComandas = [];
window.pendingShowBill = false;
window.newComandasMap = new Map();
// Parse timestamps stored as UTC in DB
function parseUtc(s) { if (!s) return Date.now(); const t = s.includes('T') ? s : s + 'Z'; const d = new Date(t); return isNaN(d.getTime()) ? Date.now() : d.getTime(); }
const HOST = window.location.hostname;
const socket = io({ query: { token: localStorage.getItem('chef_token'), restaurante_id: localStorage.getItem('restaurante_id') || '1' } });
window.socket = socket;
if (typeof initChefTz === 'function') initChefTz(socket);

socket.on('tenant_atualizado', (data) => {
  if (data && data.restaurante_id) {
    localStorage.setItem('restaurante_id', data.restaurante_id);
  }
  if (data && data.token) {
    localStorage.setItem('chef_token', data.token);
  }
  socket.disconnect();
  socket.io.opts.query = { token: data.token, restaurante_id: String(data.restaurante_id) };
  socket.connect();
});

socket.on('connect', () => {
  if (loggedUser) {
    socket.emit('get_mesas');
    socket.emit('get_produtos');
    socket.emit('get_esteira', loggedUser.nome);
  }
});

function escHtml(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function escJs(t){try{return JSON.stringify(String(t==null?'':t)).replace(/</g,'\\x3C').replace(/>/g,'\\x3E').replace(/"/g,'&quot;').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}catch(e){return '""';}}


let allMesas = [];
let allPedidos = [];
let cart = [];
let tableGroupCache = {};
let longPressTimer = null; // Used in UI for tables
let isHomePressFired = false;
let homePressTimeout = null;
/* Restaura mesa ativa e carrinho da última sessão */
try {
  const lastMesa = localStorage.getItem('chef_last_mesa');
  if (lastMesa) { currentTable = lastMesa; cart = JSON.parse(localStorage.getItem('chef_cart_' + lastMesa) || '[]'); if (!Array.isArray(cart)) cart = []; }
} catch(e) { cart = []; }

document.addEventListener('DOMContentLoaded', () => {
  const btnHome = document.getElementById('btn-home');
  if (btnHome) {
    const handleHomeStart = (e) => {
      isHomePressFired = false;
      homePressTimeout = setTimeout(() => {
        isHomePressFired = true;
        window.location.href = '/index.html';
      }, 2000);
    };
    
    const handleHomeEnd = (e) => {
      if (homePressTimeout) {
        clearTimeout(homePressTimeout);
        homePressTimeout = null;
      }
      if (!isHomePressFired) {
        if (typeof showView === 'function') {
          showView('tables', 'Comanda Mobile');
        }
      }
      if (e && e.cancelable) e.preventDefault();
    };

    btnHome.addEventListener('mousedown', handleHomeStart);
    btnHome.addEventListener('touchstart', handleHomeStart, { passive: true });
    btnHome.addEventListener('mouseup', handleHomeEnd);
    btnHome.addEventListener('touchend', handleHomeEnd);
  }
});
let TABS = [];
let MENU = [];
let MESAS = [];
let CONFIGS = {};
let currentTable = '';
let currentTab = '';

const contasSolicitadas = new Set();
let selectedProduct = null;
let selectedQty = 1;
let selectedAddons = new Set();
let loggedUser = null;

// --- Bill Logic Variables ---
let billItems = [];
let billSplitCount = 1;
let billSelectedItems = new Map(); // id -> fraction (0 to 1)
let billCurrentMode = 'pessoas'; // 'pessoas' or 'itens'
let billActionValue = 0;
let billSelectedIdsForFinalize = []; // FULL items selected


// --- Routing ---
window.showView = (id, titleText, pushToHistory = true) => {
  if (!id || id === 'home' || id === 'mesas') id = 'tables';
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById(`view-${id}`) || document.getElementById('view-tables');
  if (targetView) targetView.classList.add('active');
  if (document.getElementById('header-title')) document.getElementById('header-title').innerText = titleText || 'Chef Garçom';
  
  if (pushToHistory) {
    history.pushState({ view: id, title: titleText }, '', '');
  }

  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (id === 'tables' && document.getElementById('nav-mesas')) document.getElementById('nav-mesas').classList.add('active');
  if (id === 'esteira' && document.getElementById('nav-esteira')) document.getElementById('nav-esteira').classList.add('active');
  if (id === 'atalhos') {
    const navAtalhos = document.getElementById('nav-atalhos');
    if (navAtalhos) navAtalhos.classList.add('active');
    if (typeof window.carregarAtalhosGarcom === 'function') window.carregarAtalhosGarcom();
  }

  const bottomNav = document.querySelector('.bottom-nav');
  if (bottomNav) {
    if (id === 'tables' || id === 'esteira' || id === 'atalhos') {
      bottomNav.style.display = 'flex';
    } else {
      bottomNav.style.display = 'none';
    }
  }
};

window.addEventListener('popstate', (e) => {
  if (e.state && e.state.view) {
    showView(e.state.view, e.state.title, false);
  }
});

// --- Toast ---
function showToast(msg, bg = '#3ab55b') {
  const toast = document.getElementById('toast');
  toast.innerText = msg;
  toast.style.background = bg;
  toast.classList.add('show');
  toast.style.display = 'block';
  setTimeout(() => { toast.classList.remove('show'); toast.style.display = 'none'; }, 2500);
}

// --- Login Logic ---
let loginMode = 'usuario';
const btnModeUsuario = document.getElementById('btn-mode-usuario');
const btnModePin = document.getElementById('btn-mode-pin');
const formUsuario = document.getElementById('login-form-usuario');
const formPin = document.getElementById('login-form-pin');

if (btnModeUsuario) btnModeUsuario.addEventListener('click', () => {
  loginMode = 'usuario';
  btnModeUsuario.style.background = 'white'; btnModeUsuario.style.color = '#7c3aed'; btnModeUsuario.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
  btnModePin.style.background = 'transparent'; btnModePin.style.color = '#6b7280'; btnModePin.style.boxShadow = 'none';
  formUsuario.style.display = 'block'; formPin.style.display = 'none';
});
if (btnModePin) btnModePin.addEventListener('click', () => {
  loginMode = 'pin';
  btnModePin.style.background = 'white'; btnModePin.style.color = '#7c3aed'; btnModePin.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
  btnModeUsuario.style.background = 'transparent'; btnModeUsuario.style.color = '#6b7280'; btnModeUsuario.style.boxShadow = 'none';
  formPin.style.display = 'block'; formUsuario.style.display = 'none';
  document.getElementById('input-pin').focus();
});

const inputPinEl = document.getElementById('input-pin');
if (inputPinEl) {
  let pinAutoTimer = null;
  inputPinEl.addEventListener('input', () => {
    const val = inputPinEl.value.trim();
    clearTimeout(pinAutoTimer);
    if (val.length >= 4) {
      pinAutoTimer = setTimeout(() => {
        const btn = document.getElementById('btn-login');
        if (btn) btn.click();
      }, 50);
    }
  });
  inputPinEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const btn = document.getElementById('btn-login');
      if (btn) btn.click();
    }
  });
}

document.getElementById('btn-login').onclick = () => {
  try {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
    }
  } catch(e) {}

  if (loginMode === 'pin') {
    const pin = document.getElementById('input-pin').value.trim();
    if (!pin) return showToast('Informe o PIN', '#fc4b15');
    socket.emit('login_por_pin', { pin });
  } else {
    const usuario = document.getElementById('input-usuario').value;
    const senha = document.getElementById('input-senha').value;
    if (!usuario || !senha) return showToast('Preencha os campos', '#fc4b15');
    socket.emit('login_funcionario', { usuario, senha });
  }
};

document.getElementById('btn-logout').onclick = () => {
    localStorage.removeItem('chef_credentials');
    localStorage.removeItem('chef_session');
    localStorage.removeItem('logged_user');
    window.location.href = '/painel-funcionario.html';
  };

window.garantirTelaCheia = function() {
  try {
    const isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    if (!isFs) {
      const doc = document.documentElement;
      const rfs = doc.requestFullscreen || doc.webkitRequestFullscreen || doc.mozRequestFullScreen || doc.msRequestFullscreen;
      if (rfs) {
        const res = rfs.call(doc);
        if (res && typeof res.catch === 'function') res.catch(() => {});
      }
    }
  } catch (e) {}
};

// Engaja tela cheia em qualquer interação do usuário
['click', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, () => {
    window.garantirTelaCheia();
  }, { passive: true });
});

const btnFullscreenEl = document.getElementById('btn-fullscreen');
if (btnFullscreenEl) {
  btnFullscreenEl.onclick = async (e) => {
    e.stopPropagation();
    const doc = document.documentElement;
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    
    if (!isFullscreen) {
      window.garantirTelaCheia();
    } else {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        else if (document.msExitFullscreen) await document.msExitFullscreen();
      } catch (err) {}
    }
  };
}

const handleFullscreenChange = () => {
  const icon = document.querySelector('#btn-fullscreen i');
  if (!icon) return;
  const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
  if (isFullscreen) {
    icon.className = 'ph ph-corners-in';
  } else {
    icon.className = 'ph ph-corners-out';
  }
};
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);
document.addEventListener('MSFullscreenChange', handleFullscreenChange);

socket.on('login_success', (user) => {
  loggedUser = user;
  if (user.restaurante_id) localStorage.setItem('restaurante_id', user.restaurante_id);
  if (typeof initTracking === 'function') initTracking(user.id);
  /* Home, Colaborador e Logout sempre visíveis para todos os cargos */
  if(document.getElementById('btn-home')) document.getElementById('btn-home').style.display = 'block';
  if(document.getElementById('btn-colaborador')) document.getElementById('btn-colaborador').style.display = 'block';
  if(document.getElementById('btn-logout')) document.getElementById('btn-logout').style.display = 'block';
  document.getElementById('btn-fullscreen').style.display = 'block';
  showToast(`Bem vindo, ${user.nome}!`);
  showView('tables', 'Comanda Mobile');
  socket.emit('get_mesas');
  socket.emit('get_produtos');
  socket.emit('get_esteira', loggedUser.nome);

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
});

// (Segurança) Armazena apenas o token de sessão (sem senha) para reautenticação automática.
socket.on('login_token', (token) => {
  if (!token || !loggedUser) return;
  try {
    localStorage.setItem('chef_session', JSON.stringify({ token, usuario: loggedUser.usuario, cargo: loggedUser.cargo, nome: loggedUser.nome, id: loggedUser.id }));
  } catch (e) { }
});

socket.on('login_error', (msg) => {
  localStorage.removeItem('chef_credentials');
  localStorage.removeItem('chef_session');
  showToast(msg, '#fc4b15');
  showView('login', 'Acesso Garçom');
});

// --- IA Notification Queue (prevents overlap & stacking) ---
window._iaNotifQueue = [];
window._iaNotifActive = false;

function processIaNotifQueue() {
  if (window._iaNotifActive || window._iaNotifQueue.length === 0) return;
  window._iaNotifActive = true;
  var item = window._iaNotifQueue.shift();
  item.createFn();
  setTimeout(function() {
    window._iaNotifActive = false;
    processIaNotifQueue();
  }, item.duration);
}

function queueIaNotif(createFn, duration) {
  window._iaNotifQueue.push({ createFn: createFn, duration: duration || 8000 });
  processIaNotifQueue();
}

function createIaOverlay(msg, bg, buttonsHtml, duration) {
  var wrapper = document.createElement("div");
  wrapper.className = "ia-notificacao";
  wrapper.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding-top:60px;pointer-events:auto;zoom:1;-webkit-zoom:1;";
  wrapper.innerHTML = '<div style="background:' + bg + ';color:white;padding:14px 20px;border-radius:12px;max-width:90%;width:360px;box-shadow:0 4px 16px rgba(0,0,0,0.3);animation:slideToast 0.3s ease-out;pointer-events:auto;zoom:1;-webkit-zoom:1;">' + msg + (buttonsHtml ? '<div style="display:flex;gap:8px;margin-top:10px;">' + buttonsHtml + '</div>' : '') + '</div>';
  document.body.appendChild(wrapper);
  var removeFn = function() { if (wrapper.parentElement) wrapper.remove(); };
  wrapper.addEventListener("click", function(e) { if (e.target === wrapper) removeFn(); });
  setTimeout(removeFn, duration);
  return wrapper;
}

// --- IA: Sugestao de refill de bebida ---
socket.on("ia_sugestao_garcom", (data) => {
  var tipo = data.tipo, mesa = data.mesa, produto = data.produto, minutos = data.minutos, mensagem = data.mensagem;
  if (tipo === "refill_bebida") {
    showToast(mensagem, "#3b82f6");
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("🍺 Refill sugerido", { body: mensagem, icon: "/favicon.ico" });
    }
    queueIaNotif(function() {
      createIaOverlay(
        '<div style="font-weight:700;font-size:14px;margin-bottom:6px;">🍺 Oferecer nova bebida?</div>' +
        '<div style="font-size:13px;">' + escHtml(mensagem) + '</div>',
        "#3b82f6",
        '<button data-action="refill-sim" data-mesa="' + escHtml(mesa) + '" data-produto="' + escHtml(produto) + '" style="flex:1;padding:10px;background:#22c55e;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;">Sim, vou oferecer</button>' +
        '<button data-action="dismiss" style="flex:1;padding:10px;background:#64748b;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;">Agora não</button>',
        30000
      );
    });
  }
});

socket.on("ia_sugestao_garcom_aceita", (data) => {
  showToast(data.mensagem, "#22c55e");
});

// --- IA: Manobra - Solicitacao de entrada cortesia ---
socket.on("ia_manobra_aceita", (data) => {
  var pedidoId = data.pedidoId, mesa = data.mesa, produto = data.produto, minutos = data.minutos, mensagem = data.mensagem;
  showToast(mensagem, "#ff6b35");
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("🔥 Manobra - Entrada cortesia", { body: mensagem, icon: "/favicon.ico", requireInteraction: true });
  }
  queueIaNotif(function() {
    createIaOverlay(
      '<div style="font-weight:700;font-size:14px;margin-bottom:6px;">🔥 Oferecer entrada cortesia</div>' +
      '<div style="font-size:13px;">' + escHtml(mensagem) + '</div>',
      "#ff6b35",
      '<button data-action="manobra-sim" data-pedido-id="' + escHtml(pedidoId) + '" data-mesa="' + escHtml(mesa) + '" data-produto="' + escHtml(produto) + '" style="flex:1;padding:10px;background:#22c55e;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;">Vou oferecer entrada</button>' +
      '<button data-action="manobra-nao" data-pedido-id="' + escHtml(pedidoId) + '" data-mesa="' + escHtml(mesa) + '" data-produto="' + escHtml(produto) + '" style="flex:1;padding:10px;background:#64748b;color:white;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;">Cliente recusou</button>',
      30000
    );
  });
});

socket.on("ia_manobra_executada", (data) => {
  showToast(data.mensagem, "#22c55e");
});

// --- IA: Event delegation for popup buttons (fixes zoom/touch issues) ---
document.addEventListener("click", function(e) {
  var btn = e.target.closest("[data-action]");
  if (!btn) return;
  var action = btn.getAttribute("data-action");
  var wrapper = btn.closest(".ia-notificacao");

  if (action === "refill-sim") {
    window.socket.emit("ia_resposta_sugestao", {
      tipo: "refill_bebida",
      mesa: btn.getAttribute("data-mesa"),
      produto: btn.getAttribute("data-produto"),
      resposta: "sim"
    });
    if (wrapper) wrapper.remove();
  } else if (action === "manobra-sim") {
    window.socket.emit("ia_manobra_executar", {
      pedidoId: parseInt(btn.getAttribute("data-pedido-id")),
      mesa: btn.getAttribute("data-mesa"),
      produto: btn.getAttribute("data-produto"),
      resposta: "sim"
    });
    if (wrapper) wrapper.remove();
  } else if (action === "manobra-nao") {
    window.socket.emit("ia_manobra_executar", {
      pedidoId: parseInt(btn.getAttribute("data-pedido-id")),
      mesa: btn.getAttribute("data-mesa"),
      produto: btn.getAttribute("data-produto"),
      resposta: "nao"
    });
    if (wrapper) wrapper.remove();
  } else if (action === "dismiss") {
    var dismissData = {
      tipo: btn.getAttribute("data-action"),
      mesa: btn.getAttribute("data-mesa") || "",
      produto: btn.getAttribute("data-produto") || "",
      pedidoId: btn.getAttribute("data-pedido-id") || "",
      texto: "",
      criadoEm: Date.now()
    };
    var notifText = wrapper ? wrapper.textContent.trim() : "";
    dismissData.texto = notifText.substring(0, 120);
    try {
      var chave = "chef_pendentes_" + (loggedUser ? loggedUser.nome : "local");
      var lista = JSON.parse(localStorage.getItem(chave) || "[]");
      if (!Array.isArray(lista)) lista = [];
      lista.unshift(dismissData);
      if (lista.length > 20) lista = lista.slice(0, 20);
      localStorage.setItem(chave, JSON.stringify(lista));
    } catch(e) {}
    if (wrapper) wrapper.remove();
  }
});
// Auto Login (via token de sessão — nunca pela senha)
window.addEventListener('DOMContentLoaded', () => {
  localStorage.removeItem('chef_credentials');
  const savedSession = localStorage.getItem('chef_session');
  if (savedSession) {
    try {
      const sess = JSON.parse(savedSession);
      if (sess.token) {
        socket.emit('login_funcionario_token', sess.token);
        return;
      }
    } catch(e){}
  }
  
  // Se não tem sessão salva, vai pro painel do funcionário (novo portal de entrada)
  window.location.href = '/painel-funcionario.html';
});

// --- Data Fetching ---
socket.on('mesas_atualizadas', (mesas) => {
  MESAS = mesas;
  renderTables();
});

/* Delta: servidor envia apenas a mesa que mudou (otimização de rede) */
socket.on('mesa_delta', (mesa) => {
  if (!mesa || !Array.isArray(MESAS)) return;
  const idx = MESAS.findIndex(m => m.id === mesa.id || m.nome === mesa.nome);
  if (idx === -1) { socket.emit('get_mesas'); return; }
  MESAS[idx] = { ...MESAS[idx], ...mesa };
  renderTables();
});

socket.on('configuracoes_atualizadas', fetchConfigs);

async function fetchConfigs() {
  try {
    const res = await fetch('/api/config?restaurante_id=' + encodeURIComponent(localStorage.getItem('restaurante_id') || '1'));
    CONFIGS = await res.json();
    if (MENU.length > 0) reorderTabs();
  } catch (e) {
    console.error(e);
  }
}
fetchConfigs();

function reorderTabs() {
  let rawTabs = [...new Set(MENU.map(m => m.category))];
  
  if (CONFIGS && CONFIGS.ordem_categorias) {
    try {
      const order = JSON.parse(CONFIGS.ordem_categorias);
      TABS = rawTabs.sort((a, b) => {
        let idxA = order.indexOf(a);
        let idxB = order.indexOf(b);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
      });
      // Forçar "Mais Pedidos" para primeiro se existir
      if (TABS.includes('Mais Pedidos')) {
        TABS = ['Mais Pedidos', ...TABS.filter(t => t !== 'Mais Pedidos')];
      }
    } catch(e) {
      TABS = rawTabs;
    }
  } else {
    TABS = rawTabs;
    if (TABS.includes('Mais Pedidos')) {
      TABS = ['Mais Pedidos', ...TABS.filter(t => t !== 'Mais Pedidos')];
    }
  }

  if (TABS.length > 0 && !TABS.includes(currentTab)) {
    currentTab = TABS[0];
  }
  if (document.getElementById('view-menu').classList.contains('active')) {
    renderMenu();
  }
}

socket.on('produtos_atualizados', (produtos) => {
  MENU = produtos
    .filter(p => p.status !== 'inativo' && p.visibilidade !== 'caixa' && p.visibilidade !== 'invisivel')
    .map(p => ({
    id: p.id,
    originalId: p.originalId,
    category: p.categoria,
    name: p.nome,
    emoji: p.emoji || '🍽️',
    price: Number(p.preco),
    sector: p.setor || 'Cozinha 1',
    hasAddons: p.hasAddons === 1 || p.hasAddons === 'true' || p.hasAddons === true
  }));
  
  reorderTabs();
});

// --- CONTEXT MENU (MANTER PRESSIONADO) ---
let garcomLongPressFiredAt = 0;

function garcomWasLongPress() {
  return (Date.now() - garcomLongPressFiredAt) < 500;
}

function showGarcomContextMenu(x, y, items) {
  hideGarcomContextMenu();
  let menu = document.getElementById('garcom-context-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'garcom-context-menu';
    document.body.appendChild(menu);
  }

  const isDark = document.body.classList.contains('dark-mode');
  menu.style.cssText = `display:none; position:fixed; z-index:10050; background:${isDark ? '#1a1f2e' : '#ffffff'}; border-radius:16px; box-shadow:0 16px 40px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.1); border:1px solid ${isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0'}; min-width:240px; max-width:300px; overflow:hidden; padding:6px; user-select:none; font-family:inherit; color:${isDark ? '#f8fafc' : '#0f172a'};`;

  const borderSub = isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9';
  const textMuted = isDark ? '#94a3b8' : '#334155';
  const hoverBg = isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9';

  menu.innerHTML = items.map((it, i) => {
    if (it.sep) return `<div style="border-top:1px solid ${borderSub}; margin:4px 0;"></div>`;
    return `<button data-idx="${i}" style="width:100%; text-align:left; padding:10px 12px; background:none; border:none; border-radius:8px; font-size:13.5px; font-weight:600; color:${it.color || textMuted}; cursor:pointer; display:flex; align-items:center; gap:10px; transition:0.15s;"
                    onmouseenter="this.style.background='${hoverBg}'" onmouseleave="this.style.background='none'">
      <i class="ph ${it.icon || 'ph-circle'}" style="color:${it.color || textMuted}; font-size:18px;"></i> ${it.label}
    </button>`;
  }).join('');

  const menuW = 260;
  const menuH = Math.min(items.length, 12) * 44 + 12;
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - menuW - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - menuH - 8)) + 'px';
  menu.style.display = 'block';

  menu.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = items[+btn.dataset.idx];
      hideGarcomContextMenu();
      if (item && item.callback) item.callback();
    });
  });

  setTimeout(() => {
    const close = (e) => {
      if (e.target && menu.contains(e.target)) return;
      if (Date.now() - garcomLongPressFiredAt < 700) return;
      hideGarcomContextMenu();
      document.removeEventListener('touchstart', close);
      document.removeEventListener('click', close);
      document.removeEventListener('scroll', close, true);
    };
    document.addEventListener('touchstart', close, { passive: true });
    document.addEventListener('click', close);
    document.addEventListener('scroll', close, true);
  }, 50);
}

function hideGarcomContextMenu() {
  const menu = document.getElementById('garcom-context-menu');
  if (menu) menu.style.display = 'none';
}

function bindLongPressDelegated(containerEl, targetSelector, handler, duration = 450) {
  if (!containerEl || containerEl._garcomLpBound) return;
  containerEl._garcomLpBound = true;
  let timer = null;
  let startX = 0, startY = 0;
  const start = (e) => {
    if (e.target && e.target.closest && e.target.closest('button')) return;
    const el = (e.target && e.target.closest) ? e.target.closest(targetSelector) : null;
    if (!el || !containerEl.contains(el)) return;
    const t = (e.touches && e.touches[0]) || e;
    startX = t.clientX;
    startY = t.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      garcomLongPressFiredAt = Date.now();
      handler(el, t.clientX, t.clientY, e);
    }, duration);
  };
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const move = (e) => {
    if (!timer) return;
    const t = (e.touches && e.touches[0]) || e;
    if (Math.abs(t.clientX - startX) > 12 || Math.abs(t.clientY - startY) > 12) {
      clearTimeout(timer);
      timer = null;
    }
  };
  containerEl.addEventListener('touchstart', start, { passive: true });
  containerEl.addEventListener('touchend', cancel);
  containerEl.addEventListener('touchmove', move, { passive: true });
  containerEl.addEventListener('touchcancel', cancel);
  containerEl.addEventListener('mousedown', start);
  containerEl.addEventListener('mousemove', move);
  containerEl.addEventListener('mouseup', cancel);
  containerEl.addEventListener('mouseleave', cancel);

  containerEl.addEventListener('contextmenu', (e) => {
    if (e.target && e.target.closest && e.target.closest('button')) return;
    const el = (e.target && e.target.closest) ? e.target.closest(targetSelector) : null;
    if (!el || !containerEl.contains(el)) return;
    e.preventDefault();
    if (Date.now() - garcomLongPressFiredAt < 700) return;
    const t = (e.touches && e.touches[0]) || e;
    garcomLongPressFiredAt = Date.now();
    handler(el, t.clientX, t.clientY, e);
  }, { passive: false });
}

function garcomOperador() {
  return loggedUser ? (loggedUser.nome || 'Garçom') : 'Garçom';
}

let pickMesaCallback = null;
function openPickMesaModal(title, excludeName, cb) {
  pickMesaCallback = cb;
  const modal = document.getElementById('pick-mesa-modal');
  if (!modal) return;
  document.getElementById('pick-mesa-title').innerText = title;
  const list = document.getElementById('pick-mesa-list');
  const others = MESAS.filter(m => m.nome !== excludeName);
  if (others.length === 0) {
    list.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:24px 8px; font-weight:600;">Nenhuma outra mesa disponível.</div>';
  } else {
    list.innerHTML = others.map((m, i) => {
      const isOcupada = m.status === 'Ocupada';
      const isReservada = m.status === 'Reservada';
      const color = isOcupada ? '#dc2626' : (isReservada ? '#2563eb' : '#16a34a');
      const label = isOcupada ? 'Ocupada' : (isReservada ? 'Reservada' : 'Livre');
      return `<button data-idx="${i}" style="width:100%; display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer;">
        <span style="font-weight:800; font-size:16px; color:#0f172a;">${escHtml(m.nome)}</span>
        <span style="font-size:12px; font-weight:700; color:${color};">${label}</span>
      </button>`;
    }).join('');
    list.querySelectorAll('button[data-idx]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mesa = others[+btn.dataset.idx];
        const cb = pickMesaCallback;
        window.closePickMesaModal();
        if (mesa && cb) cb(mesa.nome);
      });
    });
  }
  modal.style.display = 'flex';
}

window.closePickMesaModal = () => {
  pickMesaCallback = null;
  const modal = document.getElementById('pick-mesa-modal');
  if (modal) modal.style.display = 'none';
};

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

window.openTableContextMenu = (mesa, x, y) => {
  const isReserved = mesa.status === 'Reservada';
  const isOccupied = mesa.status === 'Ocupada';
  const items = [];

  items.push({
    label: 'Ver Conta Parcial',
    icon: 'ph-receipt',
    color: '#fc4b15',
    callback: () => {
      window.pendingShowBill = true;
      currentTable = mesa.nome;
      localStorage.setItem('chef_last_mesa', currentTable);
      socket.emit('get_itens_mesa', mesa.nome);
    }
  });

  items.push({
    label: 'Pedir Conta',
    icon: 'ph-calculator',
    color: '#f2a900',
    callback: () => {
      if (confirm('Solicitar fechamento da mesa no caixa?')) {
        socket.emit('alerta_pedir_conta', mesa.nome);
        showToast('Fechamento solicitado!', '#f2c94c');
      }
    }
  });

  if (isReserved) {
    items.push({
      label: 'Cancelar Reserva',
      icon: 'ph-calendar-x',
      color: '#ef4444',
      callback: () => {
        if (confirm('Cancelar a reserva e liberar a mesa?')) {
          socket.emit('cancelar_reserva', { mesaName: mesa.nome });
          showToast('Reserva cancelada', '#ef4444');
        }
      }
    });
  } else {
    items.push({
      label: 'Reservar Mesa',
      icon: 'ph-calendar-check',
      color: '#3b82f6',
      callback: () => {
        const obs = prompt(`Reservar a mesa ${mesa.nome}.\nCliente / observação:`);
        if (obs === null) return;
        socket.emit('reservar_mesa', {
          mesaName: mesa.nome,
          observacao: JSON.stringify({ cliente: obs, data: '', obs })
        });
        showToast(`Mesa ${mesa.nome} reservada!`);
      }
    });
  }

  items.push({
    label: 'Atribuir Cliente à Mesa',
    icon: 'ph-user-plus',
    color: '#0ea5e9',
    callback: () => window.openAssignClientModal(mesa)
  });

  items.push({ sep: true });

  items.push({
    label: 'Juntar Mesas',
    icon: 'ph-link-simple',
    color: '#8b5cf6',
    callback: () => {
      openPickMesaModal(`Juntar a mesa ${mesa.nome} com:`, mesa.nome, (target) => {
        if (confirm(`Juntar a mesa ${mesa.nome} com a ${target}?`)) {
          socket.emit('juntar_mesas', { mesaA: mesa.nome, mesaB: target, operador: garcomOperador() });
          showToast(`Mesas ${mesa.nome} e ${target} unidas`);
        }
      });
    }
  });

  items.push({
    label: 'Transferir Itens',
    icon: 'ph-arrows-left-right',
    color: '#f97316',
    callback: () => {
      openPickMesaModal(`Mover itens da mesa ${mesa.nome} para:`, mesa.nome, (target) => {
        if (confirm(`Mover TODOS os itens da mesa ${mesa.nome} para a ${target}? (mesa ficará livre)`)) {
          socket.emit('transferir_mesas_itens', { mesaA: mesa.nome, mesaB: target, operador: garcomOperador() });
          showToast(`Itens movidos para a ${target}`);
        }
      });
    }
  });

  if (isOccupied) {
    items.push({
      label: 'Transferir Mesa',
      icon: 'ph-swap',
      color: '#ef4444',
      callback: () => {
        openPickMesaModal(`Transferir a ocupação da mesa ${mesa.nome} para:`, mesa.nome, (target) => {
          if (confirm(`Transferir a ocupação da mesa ${mesa.nome} para a ${target}?`)) {
            socket.emit('transferir_mesa', { mesaAtual: mesa.nome, novaMesa: target, operador: garcomOperador() });
            showToast(`Mesa transferida para a ${target}`);
          }
        });
      }
    });
  }

  showGarcomContextMenu(x, y, items);
};

window.openBillItemContextMenu = (item, x, y) => {
  const isPaid = item.status === 'Pago';
  const fraction = billSelectedItems.get(item.id) || 0;
  const items = [];

  if (!isPaid) {
    items.push({
      label: fraction === 0.5 ? 'Voltar ao Total' : 'Rachar Metade',
      icon: 'ph-scissors',
      color: '#8b5cf6',
      callback: () => splitItemFraction(item.id)
    });
    items.push({
      label: fraction > 0 ? 'Desmarcar da Seleção' : 'Selecionar p/ Pagamento',
      icon: 'ph-check-square-offset',
      color: '#fc4b15',
      callback: () => toggleBillItem(item.id)
    });
    items.push({
      label: 'Marcar como Entregue',
      icon: 'ph-check-circle',
      color: '#16a34a',
      callback: () => {
        socket.emit('marcar_entregue', { id: item.id, userName: garcomOperador() });
        socket.emit('get_itens_mesa', currentTable);
        showToast('Item marcado como entregue!', '#16a34a');
      }
    });
  }

  items.push({
    label: 'Mover para Comanda',
    icon: 'ph-user',
    color: '#3b82f6',
    callback: () => {
      const nome = prompt('Digite o nome da comanda (deixe vazio para consumo da mesa):');
      if (nome === null) return;
      socket.emit('atribuir_comanda_item', { itemId: item.id, comandaName: nome.trim() || null, operador: garcomOperador() });
      socket.emit('get_itens_mesa', currentTable);
      showToast('Item movido para comanda');
    }
  });

  items.push({
    label: 'Transferir p/ Outra Mesa',
    icon: 'ph-arrows-left-right',
    color: '#f97316',
    callback: () => {
      openPickMesaModal('Transferir este item para:', currentTable, (target) => {
        if (confirm(`Transferir este item para a ${target}?`)) {
          socket.emit('transferir_item', { itemId: item.id, novaMesa: target, operador: garcomOperador() });
          showToast(`Item transferido para a ${target}`);
        }
      });
    }
  });

  if (!isPaid) {
    items.push({ sep: true });
    items.push({
      label: 'Estornar / Remover Item',
      icon: 'ph-trash',
      color: '#ef4444',
      callback: () => {
        if (confirm('Remover este item da conta da mesa?\nAção exige senha de gerente no caixa e não pode ser desfeita.')) {
          socket.emit('remover_item_pedido', {
            orderId: item.id,
            mesaName: currentTable,
            usuario: garcomOperador(),
            motivo: 'Removido pelo garçom (Comanda Mobile)'
          });
          showToast('Item removido!', '#ef4444');
        }
      }
    });
  }

  showGarcomContextMenu(x, y, items);
};

window.openProductContextMenu = (prod, x, y) => {
  showGarcomContextMenu(x, y, [
    {
      label: 'Ver Detalhes',
      icon: 'ph-eye',
      color: '#3b82f6',
      callback: () => openDetails(prod.id)
    },
    {
      label: 'Adicionar 1 ao Pedido',
      icon: 'ph-plus-circle',
      color: '#16a34a',
      callback: () => addDirectToCart(prod.id)
    }
  ]);
};

// --- ATRIBUIR CLIENTE À MESA ---
window.openAssignClientModal = (mesa) => {
  window._assignClientMesa = mesa.nome;
  document.getElementById('assign-client-table').innerText = mesa.nome;
  document.getElementById('assign-client-name').value = '';
  document.getElementById('assign-client-phone').value = '';
  document.getElementById('assign-client-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('assign-client-name').focus(), 100);
};

window.closeAssignClientModal = () => {
  document.getElementById('assign-client-modal').style.display = 'none';
  window._assignClientMesa = null;
};

window.submitAssignClient = () => {
  const mesa = window._assignClientMesa;
  const nome = document.getElementById('assign-client-name').value.trim();
  const telefone = document.getElementById('assign-client-phone').value.trim();
  if (!mesa) return;
  if (!nome) {
    alert('Digite o nome do cliente.');
    return;
  }
  socket.emit('cliente_entrou_mesa', { mesa, cliente: { id: null, nome, telefone } });
  showToast(`Cliente ${nome} atribuído à mesa ${mesa}`);
  window.closeAssignClientModal();
};

// --- BIND DE MANTER PRESSIONADO ---
document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('tables-grid');
  if (grid) bindLongPressDelegated(grid, '.table-card', (el, x, y) => {
    const idx = [...grid.children].indexOf(el);
    const mesa = MESAS[idx];
    if (mesa) window.openTableContextMenu(mesa, x, y);
  });

  const billList = document.getElementById('bill-items-list');
  if (billList) bindLongPressDelegated(billList, '.bill-item-row', (el, x, y) => {
    const id = el.getAttribute('data-item-id');
    const item = billItems.find(i => String(i.id) === String(id));
    if (item) window.openBillItemContextMenu(item, x, y);
  });

  const pessoasList = document.getElementById('bill-pessoas-items-list');
  if (pessoasList) bindLongPressDelegated(pessoasList, '[data-item-id]', (el, x, y) => {
    const id = el.getAttribute('data-item-id');
    const item = billItems.find(i => String(i.id) === String(id));
    if (item) window.openBillItemContextMenu(item, x, y);
  });

  const menuList = document.getElementById('menu-list');
  if (menuList) bindLongPressDelegated(menuList, '.menu-item', (el, x, y) => {
    const id = el.getAttribute('data-menu-id');
    const prod = MENU.find(m => String(m.id) === String(id));
    if (prod) window.openProductContextMenu(prod, x, y);
  });
});

// --- Tables Logic ---
function renderTables() {
  const grid = document.getElementById('tables-grid');
  const empty = document.getElementById('tables-empty');
  grid.innerHTML = '';
  
  if (MESAS.length === 0) {
    grid.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  grid.style.display = '';
  if (empty) empty.style.display = 'none';

  // ─── APLICAR ORDENAÇÃO SALVA ───
  let mesasOrdenadas = [...MESAS];
  const sortType = (function() { try { return localStorage.getItem('garcom_mesa_sort') || 'nome'; } catch(e) { return 'nome'; } })();
  if (sortType === 'status') {
    const ordem = { 'Ocupada': 0, 'Reservada': 1, 'Disponível': 2, 'Livre': 2 };
    mesasOrdenadas.sort((a, b) => (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9));
  } else if (sortType === 'valor') {
    mesasOrdenadas.sort((a, b) => (b._total || 0) - (a._total || 0));
  } else {
    // padrão: nome numérico
    mesasOrdenadas.sort((a, b) => {
      const na = parseInt((a.nome || '').replace(/\D/g, '')) || 0;
      const nb = parseInt((b.nome || '').replace(/\D/g, '')) || 0;
      return na !== nb ? na - nb : (a.nome || '').localeCompare(b.nome || '');
    });
  }
  // Aplicar layout salvo
  const layout = (function() { try { return localStorage.getItem('garcom_mesa_layout') || 'auto'; } catch(e) { return 'auto'; } })();
  if (layout === 'list') grid.style.gridTemplateColumns = '1fr';
  else if (layout === 'compacto') grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
  else grid.style.gridTemplateColumns = 'repeat(2, 1fr)';

  mesasOrdenadas.forEach(mesa => {
    const card = document.createElement('div');
    card.className = 'table-card';
    if (mesa.status === 'Ocupada') card.classList.add('ocupada');
    if (mesa.status === 'Reservada') card.classList.add('reservada');
    
    card.style.position = 'relative';
    
    let cartIndicator = '';
    try {
      const savedCartStr = localStorage.getItem(`chef_cart_${mesa.nome}`);
      if (savedCartStr) {
        const savedCart = JSON.parse(savedCartStr);
        if (Array.isArray(savedCart) && savedCart.length > 0) {
          const badgeCount = savedCart.reduce((sum, i) => sum + i.quantity, 0);
          cartIndicator = `<div class="cart-badge">${badgeCount} <i class="ph ph-shopping-cart"></i></div>`;
        }
      }
    } catch(e){}

    if (contasSolicitadas.has(mesa.nome)) {
      cartIndicator += `<div class="bill-requested-icon" title="Conta Solicitada"><i class="ph ph-receipt"></i></div>`;
    }

    card.innerHTML = `
      ${cartIndicator}
      <i class="ph ph-armchair"></i>
      <span>${escHtml(mesa.nome)}</span>
    `;
    card.onclick = () => {
      if (garcomWasLongPress()) return;
      currentTable = mesa.nome;
      localStorage.setItem('chef_last_mesa', currentTable);
      if (mesa.status === 'Ocupada' || mesa.status === 'Reservada') {
        openTableOptions(mesa);
      } else {
        loadCart(mesa.nome);
        showView('menu', `Pedido: ${mesa.nome}`);
        renderMenu();
      }
    };
    grid.appendChild(card);
  });

  // Atualizar seletor visual
  const sel = document.getElementById('select-garcom-mesa-sort');
  if (sel && sel.value !== sortType) sel.value = sortType;
}

function loadCart(mesaName) {
  try {
    const saved = localStorage.getItem(`chef_cart_${mesaName}`);
    cart = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(cart)) cart = [];
  } catch(e) { cart = []; }
  updateCartBadge();
}

function saveCart(mesaName) {
  try {
    if (Array.isArray(cart) && cart.length > 0) {
      localStorage.setItem(`chef_cart_${mesaName}`, JSON.stringify(cart));
    } else {
      localStorage.removeItem(`chef_cart_${mesaName}`);
    }
  } catch(e) { console.error('Erro ao salvar', e); }
}

window.openTableOptions = (mesa) => {
  currentTable = mesa.nome;
  localStorage.setItem('chef_last_mesa', currentTable);
  window.pendingShowBill = false;
  socket.emit('get_itens_mesa', mesa.nome);
  document.getElementById('options-table-name').innerText = mesa.nome;
  showView('table-options', 'Opções da Mesa');
  
  document.getElementById('btn-opt-add').onclick = () => {
    loadCart(mesa.nome);
    showView('menu', `Pedido: ${mesa.nome}`);
    renderMenu();
  };

  document.getElementById('btn-opt-qr').onclick = () => {
    startQRScanner(mesa.nome);
  };
  
  document.getElementById('btn-opt-view').onclick = () => {
    window.pendingShowBill = true;
    socket.emit('get_itens_mesa', mesa.nome);
  };
  
  document.getElementById('btn-opt-bill').onclick = () => {
    if(confirm('Solicitar fechamento da mesa no caixa?')) {
      socket.emit('alerta_pedir_conta', mesa.nome);
      showToast('Fechamento solicitado!', '#f2c94c');
      showView('tables', 'Comanda Mobile');
    }
  };

  const btnMostrarCliente = document.getElementById('btn-opt-mostrar-cliente');
  if (btnMostrarCliente) {
    btnMostrarCliente.onclick = () => {
      window.open('conta-cliente.html?mesa=' + encodeURIComponent(mesa.nome), '_blank');
    };
  }
};

socket.on('toque_pedir_conta', (mesaName) => {
  contasSolicitadas.add(mesaName);
  renderTables();
  showToast(`Conta solicitada: ${mesaName}`, '#f2c94c');
});

socket.on('sync_mesas_fechando', (list) => {
  contasSolicitadas.clear();
  list.forEach(m => contasSolicitadas.add(m));
  renderTables();
});

socket.on('itens_mesa_recebidos', (data) => {
  if (data.mesaName !== currentTable) return;
  const newItems = data.items.map(i => ({ ...i, totalVal: Number(i.total.replace(',','.')) }));
  window.activeComandas = [...new Set(newItems.map(i => i.mesa_comanda).filter(Boolean))];
  
  const isAlreadyInBill = document.getElementById('view-bill').classList.contains('active');
  billItems = newItems;
  
  if (isAlreadyInBill) {
    for (const [id, fraction] of billSelectedItems.entries()) {
      const found = billItems.find(i => i.id === id);
      if (!found || found.status === 'Pago') {
        billSelectedItems.delete(id);
      }
    }
    renderBillView();
  } else if (window.pendingShowBill) {
    window.pendingShowBill = false;
    billSplitCount = 1;
    billSelectedItems.clear();
    document.getElementById('bill-split-count').innerText = '1';
    document.getElementById('bill-service-fee').checked = true;
    document.getElementById('bill-table-name').innerText = currentTable;
    switchBillTab('pessoas');
    renderBillView();
    showView('bill', 'Conta Parcial');
  } else {
    // Just update items in background, do not redirect
  }
});

// --- Bill Logic Functions ---
function getBillGrossTotal() {
  return billItems.reduce((acc, curr) => (curr.totalVal >= 0) ? acc + curr.totalVal : acc, 0);
}

function getBillSubtotal() {
  return billItems.reduce((acc, curr) => (curr.totalVal >= 0 && curr.status !== 'Pago') ? acc + curr.totalVal : acc, 0);
}

function getBillPaymentsTotal() {
  return billItems.reduce((acc, curr) => {
    if (curr.totalVal < 0) {
      const name = curr.productName || '';
      if (name.toLowerCase().includes('comanda')) {
        return acc;
      }
      return acc + Math.abs(curr.totalVal);
    }
    return acc;
  }, 0);
}

function getBillMultiplier() {
  return document.getElementById('bill-service-fee').checked ? 1.1 : 1.0;
}

window.renderBillView = () => {
  const consumedSubtotal = getBillSubtotal();
  const grossSubtotal = getBillGrossTotal();
  const multiplier = getBillMultiplier();
  const serviceFee = consumedSubtotal * (multiplier - 1.0);
  const totalPayments = getBillPaymentsTotal();
  const grandTotal = Math.max(0, consumedSubtotal + serviceFee - totalPayments);
  const totalDaMesa = grossSubtotal * multiplier;

  document.getElementById('bill-subtotal').innerText = `R$ ${totalDaMesa.toFixed(2).replace('.',',')}`;
  document.getElementById('bill-grand-total').innerText = `R$ ${grandTotal.toFixed(2).replace('.',',')}`;

  if (billCurrentMode === 'pessoas') {
    billActionValue = grandTotal / billSplitCount;
    document.getElementById('bill-split-value').innerText = `R$ ${billActionValue.toFixed(2).replace('.',',')}`;
    billSelectedIdsForFinalize = []; // We don't finalize items in this mode
    if (typeof renderBillPessoasItems === 'function') renderBillPessoasItems();
  } else {
    let selSubtotal = 0;
    billSelectedIdsForFinalize = [];
    billItems.forEach(item => {
      if (item.totalVal >= 0 && billSelectedItems.has(item.id)) {
        const fraction = billSelectedItems.get(item.id);
        selSubtotal += item.totalVal * fraction;
        if (fraction === 1) billSelectedIdsForFinalize.push(item.id);
      }
    });
    billActionValue = selSubtotal * multiplier;
    document.getElementById('bill-selected-count').innerText = `R$ ${billActionValue.toFixed(2).replace('.',',')}`;
    renderBillItemsList();
  }

  document.getElementById('bill-action-value').innerText = `R$ ${billActionValue.toFixed(2).replace('.',',')}`;
};

function renderBillPessoasItems() {
  const list = document.getElementById('bill-pessoas-items-list');
  if(!list) return;
  const multiplier = getBillMultiplier();
  if (billItems.length === 0) {
    list.innerHTML = '<div style="text-align: center; color: #888; font-size: 14px; padding: 12px;">Nenhum item.</div>';
    return;
  }
  
  const consumed = billItems.filter(i => i.totalVal >= 0);
  const payments = billItems.filter(i => i.totalVal < 0);

  // Group consumed items: shared vs by comanda
  const sharedGroup = consumed.filter(i => !i.mesa_comanda || i.mesa_comanda.trim() === '');
  const comandaGroups = {};
  consumed.forEach(i => {
    const cName = i.mesa_comanda ? i.mesa_comanda.trim() : '';
    if (cName !== '') {
      if (!comandaGroups[cName]) comandaGroups[cName] = [];
      comandaGroups[cName].push(i);
    }
  });

  let html = '';

  const renderGroupHTML = (title, items, isShared) => {
    if (items.length === 0) return '';
    const headerColor = isShared ? '#7f8c8d' : '#fc4b15';
    const icon = isShared ? 'ph-squares-four' : 'ph-user';
    
    let groupHtml = `
      <div style="font-weight: 700; color: ${headerColor}; font-size: 13px; margin-top: 16px; margin-bottom: 8px; border-bottom: 2px solid ${isShared ? '#bdc3c7' : '#ffd5c2'}; padding-bottom: 4px; display: flex; align-items: center; gap: 6px; text-transform: uppercase;">
        <i class="ph ${icon}"></i> ${title}
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
    `;
    
    groupHtml += items.map(item => {
      const finalVal = item.totalVal * multiplier;
      const isPaid = item.status === 'Pago';
      return `
        <div data-item-id="${item.id}" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0; ${isPaid ? 'opacity: 0.5;' : ''}">
          <div style="font-size: 14px; color: #333; ${isPaid ? 'text-decoration: line-through;' : ''}">
            <span style="font-weight: 600;">${item.quantity}x</span> ${item.productEmoji || '🍽️'} ${item.productName}
            ${isPaid ? '<span style="color:#3ab55b; font-size:12px; margin-left:4px;">(Pago)</span>' : ''}
          </div>
          <div style="font-size: 14px; font-weight: 600; color: #666;">R$ ${finalVal.toFixed(2).replace('.', ',')}</div>
        </div>
      `;
    }).join('');
    
    groupHtml += `</div>`;
    return groupHtml;
  };

  html += renderGroupHTML('Consumo da Mesa (Compartilhado)', sharedGroup, true);
  
  Object.keys(comandaGroups).forEach(cName => {
    html += renderGroupHTML(`Comanda: ${cName}`, comandaGroups[cName], false);
  });

  if (payments.length > 0) {
    html += `<div style="margin-top: 20px; padding-top: 15px; border-top: 2px dashed #fc4b15;">
      <strong style="color: #fc4b15; font-size: 18px; text-transform: uppercase;">Pagamentos Já Realizados:</strong>
    </div>`;
    html += payments.map(item => {
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #fff0eb; border-radius: 8px; margin-top: 8px; border: 1px solid #fc4b15;">
          <div style="font-size: 18px; color: #fc4b15; font-weight: bold;"><i class="ph ph-money"></i> ${item.productName}</div>
          <div style="font-size: 18px; font-weight: 900; color: #fc4b15;">- R$ ${Math.abs(item.totalVal).toFixed(2).replace('.', ',')}</div>
        </div>
      `;
    }).join('');
  }
  if(typeof morphdom !== 'undefined') morphdom(list, '<div>'+html+'</div>', {childrenOnly:true}); else list.innerHTML = html;
}

function renderBillItemsList() {
  const list = document.getElementById('bill-items-list');
  const multiplier = getBillMultiplier();
  
  if (billItems.length === 0) {
    list.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">Nenhum item em andamento.</div>';
    return;
  }

  const consumed = billItems.filter(i => i.totalVal >= 0);
  const payments = billItems.filter(i => i.totalVal < 0);

  // Group consumed items: shared vs by comanda
  const sharedGroup = consumed.filter(i => !i.mesa_comanda || i.mesa_comanda.trim() === '');
  const comandaGroups = {};
  consumed.forEach(i => {
    const cName = i.mesa_comanda ? i.mesa_comanda.trim() : '';
    if (cName !== '') {
      if (!comandaGroups[cName]) comandaGroups[cName] = [];
      comandaGroups[cName].push(i);
    }
  });

  let html = '';

  const renderGroupHTML = (title, items, isShared) => {
    if (items.length === 0) return '';
    const headerColor = isShared ? '#7f8c8d' : '#fc4b15';
    
    let groupHtml = `
      <div style="font-weight: 700; color: ${headerColor}; font-size: 13px; margin-top: 16px; margin-bottom: 8px; border-bottom: 2px solid ${isShared ? '#bdc3c7' : '#ffd5c2'}; padding-bottom: 4px; display: flex; align-items: center; gap: 6px; text-transform: uppercase; grid-column: 1 / -1;">
        <i class="ph ${isShared ? 'ph-squares-four' : 'ph-user'}"></i> ${title}
      </div>
    `;
    
    groupHtml += items.map(item => {
      const isPaid = item.status === 'Pago';
      const fraction = billSelectedItems.get(item.id) || 0;
      const isSelected = fraction > 0 && !isPaid;
      const finalVal = item.totalVal * multiplier;
      
      return `
        <div class="bill-item-row ${isSelected ? 'selected' : ''}" data-item-id="${item.id}" style="${isPaid ? 'opacity: 0.6; background: #f0f0f0;' : ''}" onclick="${isPaid ? '' : `if(!garcomWasLongPress()) toggleBillItem(${item.id});`}">
          <div class="checkbox">${isPaid ? '<i class="ph ph-check-circle" style="color:#3ab55b; font-size:16px;"></i>' : (isSelected ? (fraction === 1 ? '<i class="ph ph-check"></i>' : '<span style="font-size:10px;">1/2</span>') : '')}</div>
          <div style="flex:1; ${isPaid ? 'text-decoration: line-through;' : ''}">
            <div style="font-weight:600; color:#333;">${item.quantity}x ${item.productEmoji || '🍽️'} ${item.productName} ${isPaid ? '<span style="color:#3ab55b; font-size:12px; margin-left:8px;">(Pago)</span>' : ''}</div>
            <div style="font-size:14px; color:#666;">Total: R$ ${finalVal.toFixed(2).replace('.',',')}</div>
          </div>
          ${!isPaid ? `<button class="btn-split-item" title="Dividir / Fracionar em Comandas" onclick="event.stopPropagation(); window.abrirModalFracionarItem(${item.id})"><i class="ph-bold ph-scissors"></i> Dividir</button> <button style="display:none;" class="btn-split-item-old ${fraction === 0.5 ? 'active' : ''}" onclick="event.stopPropagation(); splitItemFraction(${item.id})">
            ${fraction === 0.5 ? 'Metade' : 'Rachar Meio'}
          </button>` : ''}
        </div>
      `;
    }).join('');
    
    return groupHtml;
  };

  html += renderGroupHTML('Consumo da Mesa (Compartilhado)', sharedGroup, true);
  
  Object.keys(comandaGroups).forEach(cName => {
    html += renderGroupHTML(`Comanda: ${cName}`, comandaGroups[cName], false);
  });

  if (payments.length > 0) {
    html += `<div style="margin-top: 20px; padding-top: 15px; border-top: 2px dashed #fc4b15; grid-column: 1 / -1;">
      <strong style="color: #fc4b15; font-size: 18px; text-transform: uppercase;">Pagamentos Já Realizados:</strong>
      <div style="font-size: 14px; color: #888;">O valor restante já está sendo calculado para fechar a conta.</div>
    </div>`;
    html += payments.map(item => {
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: #fff0eb; border-radius: 8px; margin-top: 8px; border: 1px solid #fc4b15; grid-column: 1 / -1;">
          <div style="font-size: 18px; color: #fc4b15; font-weight: bold;"><i class="ph ph-money"></i> ${item.productName}</div>
          <div style="font-size: 18px; font-weight: 900; color: #fc4b15;">- R$ ${Math.abs(item.totalVal).toFixed(2).replace('.', ',')}</div>
        </div>
      `;
    }).join('');
  }
  if(typeof morphdom !== 'undefined') morphdom(list, '<div>'+html+'</div>', {childrenOnly:true}); else list.innerHTML = html;
}

window.toggleBillItem = (id) => {
  if (billSelectedItems.has(id)) {
    billSelectedItems.delete(id);
  } else {
    billSelectedItems.set(id, 1); // Select 100%
  }
  renderBillView();
};

window.splitItemFraction = (id) => {
  if (billSelectedItems.get(id) === 1) {
    billSelectedItems.set(id, 0.5); // Half
  } else if (billSelectedItems.get(id) === 0.5) {
    billSelectedItems.set(id, 1); // Back to full
  }
  renderBillView();
};

window.switchBillTab = (tab) => {
  billCurrentMode = tab;
  document.querySelectorAll('.bill-tab').forEach(t => {
    t.classList.remove('active');
    t.style.background = 'transparent'; t.style.color = '#666';
  });
  document.getElementById(`tab-bill-${tab}`).classList.add('active');
  document.getElementById(`tab-bill-${tab}`).style.color = '#fc4b15';
  
  document.querySelectorAll('.bill-content').forEach(c => c.style.display = 'none');
  document.getElementById(`bill-content-${tab}`).style.display = 'block';
  
  renderBillView();
};

window.changeSplitCount = (dir) => {
  billSplitCount += dir;
  if (billSplitCount < 1) billSplitCount = 1;
  document.getElementById('bill-split-count').innerText = billSplitCount;
  renderBillView();
};

window.toggleServiceFee = () => {
  const cb = document.getElementById('bill-service-fee');
  cb.checked = !cb.checked;
  const icon = document.getElementById('icon-service');
  if (cb.checked) {
    icon.classList.remove('ph');
    icon.classList.add('ph-fill');
    icon.style.color = '#fc4b15';
    showToast('Taxa de 10% adicionada', '#fc4b15');
  } else {
    icon.classList.remove('ph-fill');
    icon.classList.add('ph');
    icon.style.color = '#ccc';
    showToast('Taxa de 10% removida', '#888');
  }
  renderBillView();
};

window.updateCustomPaymentValue = (val) => {
  if (val === undefined || val === null) return;
  let num = parseFloat(String(val).replace(',', '.'));
  if (!isNaN(num) && num >= 0) billActionValue = num;
};

// --- Payment Modal ---
window.openPaymentModal = () => {
  const inputEl = document.getElementById('payment-input-value');
  if (inputEl && inputEl.value) {
    let num = parseFloat(String(inputEl.value).replace(',', '.'));
    if (!isNaN(num) && num > 0) billActionValue = num;
  }

  if (billActionValue <= 0) return alert('O valor a receber deve ser maior que zero!');
  
  const consumedSubtotal = getBillSubtotal();
  const grossSubtotal = getBillGrossTotal();
  const multiplier = getBillMultiplier();
  const serviceFee = consumedSubtotal * (multiplier - 1.0);
  const totalPayments = getBillPaymentsTotal();
  const grandTotal = Math.max(0, consumedSubtotal + serviceFee - totalPayments);
  
  if (billActionValue > grandTotal + 0.05) {
    alert(`Atenção: O saldo restante da mesa é apenas R$ ${grandTotal.toFixed(2).replace('.',',')}. O valor a pagar será ajustado para o restante da conta.`);
    billActionValue = grandTotal;
  }
  
  if (inputEl) inputEl.value = billActionValue.toFixed(2).replace('.',',');
  document.getElementById('payment-modal').style.display = 'flex';
};

window.closePaymentModal = () => {
  document.getElementById('payment-modal').style.display = 'none';
};

window.processPayment = (method) => {
  const inputEl = document.getElementById('payment-input-value');
  if (inputEl && inputEl.value) {
    let num = parseFloat(String(inputEl.value).replace(',', '.'));
    if (!isNaN(num) && num > 0) billActionValue = num;
  }

  if (!billActionValue || billActionValue <= 0) {
    return alert('O valor a receber deve ser maior que zero!');
  }

  if (method === 'Dinheiro') {
    const mod10 = billActionValue % 10;
    const mod5 = billActionValue % 5;
    let ajudaText = '';
    if (mod5 > 0 && mod5 < 5) ajudaText += `\n- Dar +R$ ${mod5.toFixed(2).replace('.',',')} -> troco arredonda!`;
    if (mod10 !== mod5 && mod10 > 0) ajudaText += `\n- Dar +R$ ${mod10.toFixed(2).replace('.',',')} -> troco arredonda!`;

    const inputVal = prompt(`O valor a cobrar é R$ ${billActionValue.toFixed(2).replace('.', ',')}.${ajudaText}\n\nQuanto o cliente entregou em dinheiro? (Deixe em branco se foi o valor exato)`);
    if (inputVal === null) return; // Cancelou
    
    if (inputVal.trim() !== '') {
      const valorRecebido = parseFloat(inputVal.replace(',', '.'));
      if (isNaN(valorRecebido) || valorRecebido < billActionValue) {
         alert('Atenção: O valor entregue pelo cliente é menor que o valor a ser cobrado!');
         return;
      }
      
      const troco = valorRecebido - billActionValue;
      if (troco > 0) {
         if (confirm(`TROCO: R$ ${troco.toFixed(2).replace('.', ',')}\n\nO cliente deseja deixar esse troco como Caixinha / Gorjeta para os funcionários?`)) {
            socket.emit('movimentacao_caixa', {
               tipo: 'Entrada',
               valor: troco,
               forma_pagamento: method,
               descricao: `Caixinha / Gorjeta: ${currentTable}`
            });
            if (typeof trackInsertion === 'function') trackInsertion();
            alert(`✅ Caixinha de R$ ${troco.toFixed(2).replace('.',',')} registrada no caixa! Processando o pagamento principal...`);
         } else {
            alert(`✅ COBRANÇA APROVADA!\n\nDEVOLVA DE TROCO: R$ ${troco.toFixed(2).replace('.', ',')}`);
         }
      }
    }
  } else {
    if (!confirm(`Confirmar recebimento de R$ ${billActionValue.toFixed(2).replace('.', ',')} no ${method}?`)) return;
  }
  
  const paymentObj = { metodo: method, valor: billActionValue };
  
  const consumedSubtotal = getBillSubtotal();
  const grossSubtotal = getBillGrossTotal();
  const multiplier = getBillMultiplier();
  const serviceFee = consumedSubtotal * (multiplier - 1.0);
  const totalPayments = getBillPaymentsTotal();
  const grandTotal = Math.max(0, consumedSubtotal + serviceFee - totalPayments);
  const isFullTable = Math.abs(billActionValue - grandTotal) < 0.05;

  if (isFullTable) {
    const chkEmitir = document.getElementById('mobile-payment-emitir-nfce');
    const inputCpf = document.getElementById('mobile-payment-cpf-cnpj');
    socket.emit('finalizar_mesa', {
      mesaName: currentTable,
      payments: [paymentObj],
      totalValue: billActionValue,
      emitirNfce: chkEmitir ? chkEmitir.checked : true,
      cpfCnpj: inputCpf ? inputCpf.value.trim() : ''
    });
    if (typeof trackInsertion === 'function') trackInsertion();
    showToast('Mesa fechada com sucesso!');
    closePaymentModal();
    showView('tables', 'Comanda Mobile');
    return;
  }
  
  // Se for "Por Itens" e selecionou itens inteiros: a gente pode mandar pro servidor finalizar_parcial_mesa!
  if (billCurrentMode === 'itens' && billSelectedIdsForFinalize.length > 0) {
    // E se houver outros que foram rachados no meio? Os marcados pela metade no podem ser finalizados (o valor cobrado vai cobrir eles na gaveta)
    // Ento lanamos o recebimento e finalizamos s os itens inteiros!
    socket.emit('finalizar_parcial_mesa', {
      mesaName: currentTable,
      pedidoIds: billSelectedIdsForFinalize,
      payments: [paymentObj]
    });
    if (typeof trackInsertion === 'function') trackInsertion();
  } else {
    // movimentacao_caixa REMOVED — pagamento_parcial_valor already inserts into movimentacoes via socket-financeiro.js
    const billFeeChk = document.getElementById('bill-service-fee');
    socket.emit('pagamento_parcial_valor', {
      mesaName: currentTable,
      valor: billActionValue,
      metodo: method,
      comTaxa: billFeeChk ? billFeeChk.checked : true,
      userName: loggedUser ? loggedUser.nome : 'Sistema'
    });
    if (typeof trackInsertion === 'function') trackInsertion();
  }
  
  showToast(`R$ ${billActionValue.toFixed(2)} recebido com sucesso!`);
  closePaymentModal();
  socket.emit('get_itens_mesa', currentTable); // refresh items list
};

// --- Menu Logic ---
window.scrollToActiveTab = function() {
  const tabsContainer = document.getElementById('menu-tabs');
  if (!tabsContainer) return;
  setTimeout(() => {
    const activeTab = tabsContainer.querySelector('.tab.active');
    if (!activeTab) return;
    const containerWidth = tabsContainer.clientWidth;
    const tabLeft = activeTab.offsetLeft;
    const tabWidth = activeTab.offsetWidth;
    const targetScrollLeft = tabLeft - (containerWidth / 2) + (tabWidth / 2);
    tabsContainer.scrollTo({
      left: Math.max(0, targetScrollLeft),
      behavior: 'smooth'
    });
  }, 30);
};

window.renderMenu = function renderMenu() {
  const tabsContainer = document.getElementById('menu-tabs');
  tabsContainer.innerHTML = TABS.map(tab => `
    <div class="tab ${tab === currentTab ? 'active' : ''}" onclick="selectTab('${tab}')">${tab}</div>
  `).join('');
  window.scrollToActiveTab();

  const listContainer = document.getElementById('menu-list');
  const emptyMenu = document.getElementById('menu-empty');
  const query = window.garcomSearchQuery || '';
  let filtered = [];
  if (query.trim() !== '') {
    filtered = window.FuzzySearch.filter(MENU, query.trim(), (m) => [m.name, m.category || '']);
  } else {
    filtered = MENU.filter(m => m.category === currentTab);
  }
  
  if (filtered.length === 0) {
    listContainer.innerHTML = '';
    if (emptyMenu) emptyMenu.style.display = 'block';
    return;
  }
  if (emptyMenu) emptyMenu.style.display = 'none';
  
  listContainer.innerHTML = filtered.map(item => `
    <div class="menu-item" data-menu-id="${item.id}" onclick="if(!garcomWasLongPress()) openDetails(${item.id})">
      <div class="img-box">${escHtml(item.emoji)}</div>
      <div class="menu-item-info">
        <div class="menu-item-name">${escHtml(item.name)}</div>
        <div class="menu-item-price">R$ ${item.price.toFixed(2).replace('.', ',')}</div>
      </div>
    </div>
  `).join('');
}

window.selectTab = (tab) => {
  currentTab = tab;
  const searchInput = document.getElementById('garcom-search-product');
  if (searchInput && searchInput.value) {
    searchInput.value = '';
    window.garcomSearchQuery = '';
    const clearBtn = document.getElementById('garcom-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
  }
  renderMenu();
};

window.openDetails = (id) => {
  selectedProduct = MENU.find(m => m.id === id);
  selectedQty = 1;
  selectedAddons.clear();
  
  document.getElementById('detail-img').innerText = selectedProduct.emoji;
  document.getElementById('detail-name').innerText = selectedProduct.name;
  document.getElementById('detail-qty').innerText = selectedQty;
  document.getElementById('detail-obs').value = '';
  
  const addonsSec = document.getElementById('detail-addons');
  addonsSec.style.display = 'none';
  
  renderSuggestions(selectedProduct);
  updateDetailPrice();
  fetchGarcomMontavel(selectedProduct.id);
  showView('details', 'Detalhes do Item');
};

window.addDirectToCart = (id) => {
  const prod = MENU.find(m => m.id === id);
  if (!prod) return;
  cart.push({
    productName: prod.name,
    productEmoji: prod.emoji,
    sector: prod.sector,
    quantity: 1,
    obs: '',
    addons: [],
    total: prod.price,
    status: 'Recebido',
    localName: currentTable,
    userName: loggedUser.nome,
    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    createdAt: Date.now()
  });
  saveCart(currentTable);
  updateCartBadge();
  showToast(`${prod.name} adicionado ao carrinho!`, '#3ab55b');
};

function renderSuggestions(product) {
  const sugSection = document.getElementById('detail-suggestions');
  const sugList = document.getElementById('sugestoes-list');
  
  let pool = MENU.filter(m => m.category !== product.category);
  
  if (!product.category.toLowerCase().includes('bebida')) {
     const bebidas = pool.filter(m => m.category.toLowerCase().includes('bebida'));
     if (bebidas.length > 0) pool = bebidas;
  }
  
  pool = pool.sort(() => 0.5 - Math.random()).slice(0, 4); // Show up to 4 items
  
  if (pool.length === 0) {
    sugSection.style.display = 'none';
    return;
  }
  
  sugSection.style.display = 'block';
  sugList.innerHTML = pool.map(item => `
    <div class="suggestion-card">
      <div class="sug-img">${item.emoji}</div>
      <div class="sug-name" title="${item.name}">${item.name}</div>
      <div class="sug-price">R$ ${item.price.toFixed(2).replace('.', ',')}</div>
      <button onclick="addDirectToCart(${item.id})" style="margin-top:8px; width:100%; padding:6px; background:#eaf8ef; color:#3ab55b; border:1px solid #3ab55b; border-radius:6px; font-weight:bold; cursor:pointer;">+ Adicionar</button>
    </div>
  `).join('');
}

document.getElementById('btn-plus').onclick = () => { selectedQty++; document.getElementById('detail-qty').innerText = selectedQty; updateDetailPrice(); };
document.getElementById('btn-minus').onclick = () => { if(selectedQty > 1) { selectedQty--; document.getElementById('detail-qty').innerText = selectedQty; updateDetailPrice(); } };

function updateDetailPrice() {
  document.getElementById('detail-unit-price').innerText = `R$ ${selectedProduct.price.toFixed(2).replace('.', ',')}`;
  document.getElementById('detail-total-price').innerText = `R$ ${(selectedProduct.price * selectedQty).toFixed(2).replace('.', ',')}`;
}

let _compsAtuais = [];
let _garcomMontavelConfig = null;

function renderGarcomMontavelUI() {
  const section = document.getElementById('detail-comps-section');
  const catsContainer = document.getElementById('detail-montavel-cats');
  const precoEl = document.getElementById('detail-montavel-preco');
  const hiddenInput = document.getElementById('detail-composicoes-json');
  if (!section || !_garcomMontavelConfig) { if (section) section.style.display = 'none'; return; }
  section.style.display = 'block';
  _compsAtuais = _garcomMontavelConfig.categorias.map(() => []);

  catsContainer.innerHTML = _garcomMontavelConfig.categorias.map((cat, ci) => {
    const isSingle = cat.max_escolhas === 1;
    const optsHtml = cat.opcoes.map((opt, oi) => {
      const inputType = isSingle ? 'radio' : 'checkbox';
      const inputName = 'gmontavel-' + ci;
      return '<label style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:white;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:12px;">' +
        '<input type="' + inputType + '" name="' + inputName + '" value="' + oi + '" onchange="window.onGarcomMontavelSelect(' + ci + ',' + oi + ',' + isSingle + ')">' +
        '<span style="flex:1;">' + escHtml(opt.nome) + '</span>' +
        (opt.preco > 0 ? '<span style="color:#3b82f6;font-weight:700;font-size:11px;">+R$' + opt.preco.toFixed(2).replace('.', ',') + '</span>' : '') +
        '</label>';
    }).join('');

    return '<div style="margin-bottom:8px;">' +
      '<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:3px;">' + escHtml(cat.nome) +
      (cat.obrigatoria ? ' <span style="color:#dc2626;">*</span>' : '') +
      (cat.max_escolhas > 1 ? ' <span style="color:#94a3b8;font-weight:400;">(até ' + cat.max_escolhas + ')</span>' : '') +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:3px;">' + optsHtml + '</div>' +
      '</div>';
  }).join('');

  updateGarcomMontavelPrice();
  if (hiddenInput) hiddenInput.value = JSON.stringify(_compsAtuais);
}

window.onGarcomMontavelSelect = (catIdx, optIdx, isSingle) => {
  if (isSingle) { _compsAtuais[catIdx] = [optIdx]; }
  else {
    const arr = _compsAtuais[catIdx];
    const pos = arr.indexOf(optIdx);
    if (pos >= 0) arr.splice(pos, 1);
    else { const max = _garcomMontavelConfig.categorias[catIdx].max_escolhas || 1; if (arr.length < max) arr.push(optIdx); }
  }
  updateGarcomMontavelPrice();
  const hiddenInput = document.getElementById('detail-composicoes-json');
  if (hiddenInput) hiddenInput.value = JSON.stringify(_compsAtuais);
};

function updateGarcomMontavelPrice() {
  const precoEl = document.getElementById('detail-montavel-preco');
  if (!precoEl || !_garcomMontavelConfig || !selectedProduct) return;
  let total = _garcomMontavelConfig.pricing_model === 'fixo' ? _garcomMontavelConfig.preco_fixo : selectedProduct.price;
  if (_garcomMontavelConfig.pricing_model === 'soma') {
    _garcomMontavelConfig.categorias.forEach((cat, ci) => {
      (_compsAtuais[ci] || []).forEach(oi => { if (cat.opcoes[oi]) total += cat.opcoes[oi].preco || 0; });
    });
  }
  precoEl.textContent = 'Total: R$ ' + (total * selectedQty).toFixed(2).replace('.', ',');
  precoEl.dataset.unitPrice = total;
}

function fetchGarcomMontavel(productId) {
  _garcomMontavelConfig = null;
  _compsAtuais = [];
  const section = document.getElementById('detail-comps-section');
  if (section) section.style.display = 'none';
  fetch('/api/montaveis/produto/' + productId, { headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('chef_token') || '') } })
    .then(r => r.json())
    .then(cfg => { if (cfg && cfg.id) { _garcomMontavelConfig = cfg; renderGarcomMontavelUI(); } })
    .catch(() => {});
}

document.getElementById('btn-add-to-cart').onclick = () => {
  const rawComps = JSON.parse(document.getElementById('detail-composicoes-json') ? (document.getElementById('detail-composicoes-json').value || '[]') : '[]');
  let composicoes = [];
  let unitPrice = selectedProduct.price;

  if (_garcomMontavelConfig) {
    _garcomMontavelConfig.categorias.forEach((cat, ci) => {
      (rawComps[ci] || []).forEach(oi => {
        const opt = cat.opcoes[oi];
        if (opt) composicoes.push({ categoria: cat.nome, opcao: opt.nome, preco: opt.preco || 0 });
      });
    });
    const precoEl = document.getElementById('detail-montavel-preco');
    unitPrice = precoEl && precoEl.dataset.unitPrice ? parseFloat(precoEl.dataset.unitPrice) : unitPrice;
  } else {
    composicoes = rawComps;
  }

  cart.push({
    productName: selectedProduct.name,
    productEmoji: selectedProduct.emoji,
    sector: selectedProduct.sector,
    quantity: selectedQty,
    obs: document.getElementById('detail-obs').value,
    composicoes: composicoes,
    total: unitPrice * selectedQty,
    status: 'Recebido',
    localName: currentTable,
    userName: loggedUser.nome,
    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    addons: []
  });
  _compsAtuais = [];
  _garcomMontavelConfig = null;
  const obsField = document.getElementById('detail-obs');
  if (obsField) obsField.value = '';
  const compsSection = document.getElementById('detail-comps-section');
  if (compsSection) compsSection.style.display = 'none';
  saveCart(currentTable);
  updateCartBadge();
  showView('menu', `Pedido: ${currentTable}`);
};

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (cart.length > 0) {
    badge.style.display = 'flex';
    badge.innerText = cart.length;
  } else {
    badge.style.display = 'none';
  }
}

document.getElementById('fab-cart').onclick = () => {
  if (cart.length === 0) return alert('Carrinho vazio!');
  renderCart();
  showView('cart', 'Revisar Pedido');
};

function renderCart() {
  const list = document.getElementById('cart-list');
  let total = 0;
  list.innerHTML = cart.map((item, idx) => {
    total += item.total;
    const allComandas = [...new Set([
      ...(window.activeComandas || []),
      ...(window.newComandasMap ? Array.from(window.newComandasMap.keys()) : [])
    ])];
    
    return `
      <div class="cart-item" style="padding: 16px; background: #fff; border: 1px solid #eee; border-radius: 12px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
        <div style="display:flex; justify-content:space-between; margin-bottom: 6px; align-items: center;">
          <strong style="font-size: 16px; color: #333;">${item.quantity}x ${item.productName}</strong>
          <strong style="color: #fc4b15; font-size: 16px;">R$ ${item.total.toFixed(2).replace('.',',')}</strong>
        </div>
        ${item.obs ? `<div style="font-size: 13px; color: #777; margin-bottom: 8px; background: #f9f9f9; padding: 6px 10px; border-radius: 6px; border-left: 3px solid #ddd;">Obs: ${item.obs}</div>` : ''}
        ${item.composicoes && item.composicoes.length > 0 ? `<div style="font-size: 12px; color: #1e40af; margin-bottom: 8px; background: #dbeafe; padding: 6px 10px; border-radius: 6px; border-left: 3px solid #3b82f6; font-weight: 600;">Monte: ${item.composicoes.map(c => typeof c === 'object' ? c.categoria + ': ' + c.opcao : c).join(' | ')}</div>` : ''}
        
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #eee;">
          <span style="font-size: 13px; color: #666; font-weight: 500;">Comanda/Cliente:</span>
          <select onchange="window.changeItemComanda(${idx}, this.value)" style="padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; outline: none; background: #fff; color: #333; font-weight: 500; max-width: 180px;">
            <option value="">Mesa (Compartilhado)</option>
            ${allComandas.map(c => `<option value="${c}" ${item.mesa_comanda === c ? 'selected' : ''}>${c}</option>`).join('')}
            <option value="__NEW__" style="color: #fc4b15; font-weight: bold;">+ Nova Comanda...</option>
          </select>
        </div>
        
        <div style="text-align: right; margin-top: 10px;">
          <button onclick="removeFromCart(${idx})" style="background: none; border: none; color: #999; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-weight: 500;"><i class="ph ph-trash"></i> Remover</button>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('cart-total-value').innerText = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

window.removeFromCart = (idx) => {
  cart.splice(idx, 1);
  saveCart(currentTable);
  updateCartBadge();
  if (cart.length === 0) showView('menu', `Pedido: ${currentTable}`);
  else renderCart();
};

document.getElementById('btn-send-order').onclick = () => {
  if (cart.length === 0) return alert('Carrinho vazio!');
  
  const orderComandaInput = document.getElementById('order-comanda') ? document.getElementById('order-comanda').value.trim() : '';

  cart.forEach(item => {
    const comandaName = item.mesa_comanda || orderComandaInput;
    const phone = comandaName ? (window.newComandasMap ? window.newComandasMap.get(comandaName) : '') : '';
    const emitItem = {
      ...item,
      observations: item.obs || item.observations || '',
      composicoes: item.composicoes || [],
      total: item.total.toFixed(2).replace('.', ','),
      mesa_comanda: comandaName,
      cliente_telefone: phone || ''
    };
    /* Offline-first (upsell): sem internet, grava no dispositivo e sincroniza depois */
    if (window.ChefOfflineQueue && window.ChefOfflineQueue.habilitado() && !navigator.onLine) {
      window.ChefOfflineQueue.add(emitItem).then(() => {
        window.ChefOfflineQueue.agendarSyncNativo();
        if (window.showToast) window.showToast('📶 Sem internet — pedido salvo e será enviado sozinho.', 'warning');
      }).catch(() => {});
    } else {
      socket.emit('novo_pedido', emitItem);
    }
  });
  if (typeof trackInsertion === 'function') trackInsertion();
  cart = [];
  window.newComandasMap = new Map();
  if (document.getElementById('order-comanda')) {
    document.getElementById('order-comanda').value = '';
  }
  saveCart(currentTable);
  updateCartBadge();
  showToast('Pedido enviado com sucesso!');
  showView('tables', 'Comanda Mobile');
};

// --- Esteira ---
let prontosAnterioresIds = [];
const chamadasReclamadas = new Map();

socket.on('pedidos_atualizados', () => {
  if (loggedUser) socket.emit('get_esteira', loggedUser.nome);
  if (currentTable && document.getElementById('view-bill').classList.contains('active')) {
    socket.emit('get_itens_mesa', currentTable);
  }
});

socket.on('esteira_atualizada', (pedidos) => {
  const esteira = document.getElementById('esteira-list');
  const prontos = pedidos;
  const novosIds = prontos.map(p => p.id);
  const idsNovos = novosIds.filter(id => !prontosAnterioresIds.includes(id));
  prontosAnterioresIds = novosIds;

  const badge = document.getElementById('esteira-badge');
  if (badge) {
    badge.style.display = (prontos.length > 0) ? 'block' : 'none';
  }

  var pendentes = [];
  try {
    var chave = "chef_pendentes_" + (loggedUser ? loggedUser.nome : "local");
    pendentes = JSON.parse(localStorage.getItem(chave) || "[]");
    if (!Array.isArray(pendentes)) pendentes = [];
  } catch(e) { pendentes = []; }

  var html = '';

  if (pendentes.length > 0) {
    html += '<div style="font-size:12px;font-weight:800;color:#b45309;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:6px;"><i class="ph ph-clock"></i> Atividades Pendentes</div>';
    html += pendentes.map(function(p, idx) {
      var tempo = Math.floor((Date.now() - (p.criadoEm || 0)) / 60000);
      var tempoTxt = tempo < 1 ? 'agora' : tempo + 'min';
      return '<div style="background:#fffbeb;border:1px solid #fde68a;padding:12px;border-radius:10px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">' +
        '<div style="flex:1;font-size:13px;color:#92400e;font-weight:600;">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><i class="ph ph-clock" style="color:#b45309;"></i> ' + tempoTxt + '</div>' +
          '<div style="font-size:12px;color:#78716c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">' + (p.texto || 'Atividade pendente') + '</div>' +
        '</div>' +
        '<button onclick="window.marcarPendenteResolvido(' + idx + ')" style="background:#22c55e;color:white;border:none;padding:8px 12px;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px;white-space:nowrap;">Feito</button>' +
      '</div>';
    }).join('');
  }

  if (prontos.length === 0 && pendentes.length === 0) {
    esteira.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">Nenhum pedido pronto.</div>';
    return;
  }

  if (prontos.length > 0) {
    if (pendentes.length > 0) {
      html += '<div style="font-size:12px;font-weight:800;color:#15803d;margin:12px 0 8px;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:6px;"><i class="ph ph-check-circle"></i> Prontos para Entrega</div>';
    }
    html += prontos.map(p => {
      const isPdv = p.tipo === 'pdv';
      const isChamada = p.userName === 'Chamada';
      const isCalled = !!(p.garcom_call) || isChamada;
      const borderColor = isPdv ? '#f97316' : (isCalled ? '#8b5cf6' : '#3ab55b');
      const icon = isPdv ? 'ph-hand-waving' : (isCalled ? 'ph-bell-ringing' : 'ph-table');
      const iconColor = isPdv ? '#f97316' : (isCalled ? '#8b5cf6' : '#fc4b15');
      const locationLabel = isPdv ? `📋 ${p.localName}` : (isChamada ? `🔔 ${p.localName}` : p.localName);
      const isNew = idsNovos.includes(p.id);
      const blinkClass = isNew ? (isChamada ? 'pronto-blink-orange' : 'pronto-blink') : '';
      const claimedBy = isPdv ? p.targetGarcom : (isChamada ? chamadasReclamadas.get(p.id) : null);

      let tempoPronto = '';
      if (p.prontoEm) {
        const diffSec = Math.floor((Date.now() - new Date(p.prontoEm).getTime()) / 1000);
        if (diffSec < 60) tempoPronto = `${diffSec}s`;
        else if (diffSec < 3600) tempoPronto = `${Math.floor(diffSec / 60)}min`;
        else tempoPronto = `${Math.floor(diffSec / 3600)}h${Math.floor((diffSec % 3600) / 60)}m`;
      } else if (p.createdAt) {
        const diffSec = Math.floor((Date.now() - parseUtc(p.createdAt)) / 1000);
        if (diffSec < 60) tempoPronto = `${diffSec}s`;
        else if (diffSec < 3600) tempoPronto = `${Math.floor(diffSec / 60)}min`;
        else tempoPronto = `${Math.floor(diffSec / 3600)}h${Math.floor((diffSec % 3600) / 60)}m`;
      }

      // For QR code chamada calls accepted by this waiter: hide the card immediately (no "Entregar" step)
      if (isChamada && chamadasReclamadas.get(p.id) === loggedUser?.nome) return '';

      let btnHtml = '';
      if (isPdv) {
        if (!p.targetGarcom) {
          btnHtml = `<button onclick="aceitarChamadoPdv(${escJs(p.localName)})" style="background:#f97316;color:white;border:none;padding:12px 18px;border-radius:10px;font-weight:bold;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="ph ph-arrow-right" style="font-size:18px;"></i> IR</button>`;
        } else if (p.targetGarcom === loggedUser?.nome) {
          btnHtml = `<button onclick="marcarEntregue('${p.id}')" style="background:#16a34a;color:white;border:none;padding:12px 18px;border-radius:10px;font-weight:bold;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="ph ph-check-circle" style="font-size:18px;"></i> Entregar</button>`;
        } else {
          btnHtml = `<div style="background:#fef3c7;color:#92400e;border:none;padding:8px 12px;border-radius:10px;font-size:12px;font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:4px;"><i class="ph ph-user-check"></i> ${p.targetGarcom}</div>`;
        }
      } else if (isChamada && claimedBy && claimedBy !== loggedUser?.nome) {
        // Another waiter already accepted this QR call
        btnHtml = `<div style="background:#fef3c7;color:#92400e;border:none;padding:8px 12px;border-radius:10px;font-size:12px;font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:4px;"><i class="ph ph-user-check"></i> ${claimedBy}</div>`;
      } else if (isChamada) {
        // QR code waiter call — "IR" disappears card immediately (no Entregar step)
        btnHtml = `<button onclick="irChamadaQR(${p.id}, ${escJs(p.localName || '')})" style="background:#8b5cf6;color:white;border:none;padding:12px 18px;border-radius:10px;font-weight:bold;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="ph ph-arrow-right" style="font-size:18px;"></i> IR</button>`;
      } else if (isCalled) {
        // Regular garcom_call — Buscar flow (keeps Entregar step)
        btnHtml = `<button onclick="buscarChamada(${p.id}, ${escJs(p.productName || '')}, ${escJs(p.localName || '')})" style="background:#8b5cf6;color:white;border:none;padding:12px 18px;border-radius:10px;font-weight:bold;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="ph ph-walk" style="font-size:18px;"></i> Buscar</button>`;
      } else {
        btnHtml = `<button onclick="marcarEntregue(${p.id})" style="background:${borderColor};color:white;border:none;padding:12px 18px;border-radius:10px;font-weight:bold;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="ph ph-check-circle" style="font-size:18px;"></i> Entregar</button>`;
      }

      const cardBg = isCalled ? '#7c3aed' : (isPdv ? '#fff7ed' : 'white');
      const textColor = isCalled ? 'white' : '#1e293b';
      const subTextColor = isCalled ? '#e9d5ff' : '#475569';
      const tagBg = isCalled ? 'rgba(255,255,255,0.2)' : (isPdv ? '#fff5f0' : '#fff5f0');
      const tagColor = isCalled ? 'white' : '#fc4b15';

      return `
    <div data-id="${p.id}" class="${blinkClass}" style="background: ${cardBg}; padding: 16px; border-radius: 12px; margin-bottom: 12px; border-left: 5px solid ${borderColor}; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <div>
        <div style="font-size: 18px; font-weight: 800; color: ${textColor}; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
          <i class="ph ${icon}" style="color: ${iconColor};"></i>
          <span>${locationLabel}</span>
          ${p.mesa_comanda ? `<span style="background: ${tagBg}; color: ${tagColor}; border: 1px solid ${isCalled ? 'rgba(255,255,255,0.3)' : '#ffcca8'}; padding: 2px 8px; border-radius: 8px; font-size: 14px; font-weight: 700;">(${escHtml(p.mesa_comanda)})</span>` : ''}
          ${isNew ? `<span style="background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Novo</span>` : ''}
          ${claimedBy && claimedBy !== loggedUser?.nome ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;">👤 ${escHtml(claimedBy)}</span>` : ''}
        </div>
        <div style="color: ${subTextColor}; font-size: 15px; font-weight: 600;">${p.quantity}x ${escHtml(p.productEmoji || '')} ${escHtml(p.productName)}</div>
        ${tempoPronto ? `<div style="color: ${isCalled ? '#fbbf24' : (isChamada ? '#c2410c' : '#15803d')}; font-size: 12px; font-weight: 700; margin-top: 4px; display: flex; align-items: center; gap: 4px;"><i class="ph ph-clock"></i> Pronto há ${tempoPronto}</div>` : ''}
        ${(() => {
          if (p.prontoEm && p.createdAt) {
            const prepSec = Math.floor((parseUtc(p.prontoEm) - parseUtc(p.createdAt)) / 1000);
            if (prepSec > 0) {
              let tempoPrep = '';
              if (prepSec < 60) tempoPrep = `${prepSec}s`;
              else if (prepSec < 3600) tempoPrep = `${Math.floor(prepSec / 60)}min${prepSec % 60 ? ' ' + (prepSec % 60) + 's' : ''}`;
              else tempoPrep = `${Math.floor(prepSec / 3600)}h${Math.floor((prepSec % 3600) / 60)}min`;
              return `<div style="color: ${isCalled ? '#e9d5ff' : (isPdv ? '#c2410c' : '#1d4ed8')}; font-size: 11px; font-weight: 600; margin-top: 2px; display: flex; align-items: center; gap: 4px;"><i class="ph ph-stopwatch"></i> Preparo: ${tempoPrep}</div>`;
            }
          }
          return '';
        })()}
      </div>
      ${btnHtml}
    </div>
  `;
    }).join('');
  }

  esteira.innerHTML = html;
});

window.marcarEntregue = (id) => {
  if(!loggedUser) return;
  socket.emit('marcar_entregue', { id, userName: loggedUser.nome });
};

window.aceitarChamadoPdv = (localName) => {
  if(!loggedUser) return;
  socket.emit('garcom_aceitou_chamado', { localName, garcomNome: loggedUser.nome });
};

window.buscarChamada = (pedidoId, productName, localName) => {
  if(!loggedUser) return;
  chamadasReclamadas.set(pedidoId, loggedUser.nome);
  socket.emit('garcom_buscando', { pedidoId, garcomNome: loggedUser.nome, localName, productName });
  showToast(`✅ Indo buscar ${productName} - ${localName}`, '#8b5cf6');
};

// For QR code chamada calls: IR button makes card vanish immediately
window.irChamadaQR = (pedidoId, localName) => {
  if (!loggedUser) return;
  chamadasReclamadas.set(pedidoId, loggedUser.nome); // hides card on next render
  socket.emit('garcom_buscando', { pedidoId, garcomNome: loggedUser.nome, localName, productName: 'Chamado' });
  showToast(`✅ Indo até ${localName}`, '#8b5cf6');
  // Immediately request fresh esteira so card disappears right away
  socket.emit('get_esteira', loggedUser.nome);
};

window.marcarPendenteResolvido = (idx) => {
  try {
    var chave = "chef_pendentes_" + (loggedUser ? loggedUser.nome : "local");
    var lista = JSON.parse(localStorage.getItem(chave) || "[]");
    if (Array.isArray(lista) && idx >= 0 && idx < lista.length) {
      lista.splice(idx, 1);
      localStorage.setItem(chave, JSON.stringify(lista));
    }
    if (loggedUser) socket.emit('get_esteira', loggedUser.nome);
  } catch(e) {}
};

document.getElementById('nav-mesas').onclick = () => showView('tables', 'Comanda Mobile');
document.getElementById('nav-esteira').onclick = () => showView('esteira', 'Prontos para Entrega');
const navAtalhosBtn = document.getElementById('nav-atalhos');
if (navAtalhosBtn) {
  navAtalhosBtn.onclick = () => showView('atalhos', 'Atalhos Rápidos');
}

// --- QR CODE SCANNER LOGIC ---
let html5QrCode = null;
let qrScanning = false;

window.startQRScanner = (mesaName) => {
  if (qrScanning) return;
  qrScanning = true;

  const modal = document.getElementById('qr-modal');
  const readerEl = document.getElementById('qr-reader');
  if (!modal || !readerEl) {
    qrScanning = false;
    return;
  }

  if (typeof Html5Qrcode === 'undefined') {
    showToast('Leitor de QR indisponivel (biblioteca nao carregada).', '#e74c3c');
    qrScanning = false;
    return;
  }

  // Always destroy previous instance to avoid stale state
  if (html5QrCode) {
    try { html5QrCode.clear(); } catch (e) {}
    html5QrCode = null;
  }

  modal.style.display = 'flex';

  // Wait for DOM to render the modal before starting camera
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        html5QrCode = new Html5Qrcode("qr-reader");
      } catch (e) {
        console.error("Erro ao criar Html5Qrcode:", e);
        modal.style.display = 'none';
        qrScanning = false;
        showToast('Erro ao inicializar leitor QR.', '#e74c3c');
        return;
      }

      html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        (decodedText) => {
          qrScanning = false;
          window.closeQRScanner();
          const codigoLimpo = String(decodedText || '').trim().replace(/[\r\n]/g, '');
          if (!codigoLimpo) {
            showToast('QR Code vazio ou invalido.', '#e74c3c');
            return;
          }
          socket.emit('validar_cupom', {
            mesaName: mesaName,
            codigo: codigoLimpo,
            userName: loggedUser ? loggedUser.nome : 'Garcom'
          });
          showToast('Validando cupom...', '#f2c94c');
        },
        () => {}
      ).catch((err) => {
        console.error("Erro ao iniciar camera:", err);
        modal.style.display = 'none';
        qrScanning = false;
        showToast('Nao foi possivel abrir a camera. Verifique as permissoes.', '#e74c3c');
      });
    });
  });
};

window.closeQRScanner = () => {
  qrScanning = false;
  if (html5QrCode) {
    try {
      html5QrCode.stop().then(() => {
        try { html5QrCode.clear(); } catch (e) {}
        html5QrCode = null;
      }).catch(() => {
        try { html5QrCode.clear(); } catch (e) {}
        html5QrCode = null;
      });
    } catch (e) {
      html5QrCode = null;
    }
  }
  document.getElementById('qr-modal').style.display = 'none';
};

socket.on('cupom_sucesso', (data) => {
  showToast(data.mensagem || 'Cupom aplicado!', '#3ab55b');
  playDing();
  const inp = document.getElementById('cupom-manual-input');
  if (inp) inp.value = '';
  showView('tables', 'Comanda Mobile');
});

socket.on('cupom_invalido', (data) => {
  showToast(data.error || 'Cupom inválido', '#e74c3c');
  const inp = document.getElementById('cupom-manual-input');
  if (inp) { inp.value = ''; inp.focus(); }
});

// ── Cupom manual: valida ao digitar último caractere ──
(function() {
  let _mesaName = null;
  const origStartQR = window.startQRScanner;
  window.startQRScanner = function(mesaName) {
    _mesaName = mesaName;
    if (origStartQR) origStartQR(mesaName);
  };
  document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('cupom-manual-input');
    if (!inp) return;
    inp.addEventListener('input', () => {
      const val = inp.value.trim().toUpperCase();
      if (val.length >= 4) {
        socket.emit('validar_cupom', {
          mesaName: _mesaName,
          codigo: val,
          userName: loggedUser ? loggedUser.nome : 'Garcom'
        });
        showToast('Validando cupom...', '#f2c94c');
      }
    });
  });
})();

socket.on('pedido_pronto', (pedido) => {
  if (loggedUser) {
    const escopo = localStorage.getItem('esteira-som-escopo') || (CONFIGS && CONFIGS['esteira-som-escopo']) || 'todos';
    const isOwnOrder = pedido.userName === loggedUser.nome;
    const shouldPlaySound = (escopo === 'todos') || isOwnOrder;

    const comandaLabel = pedido.mesa_comanda ? ` - (${pedido.mesa_comanda})` : '';

    if (shouldPlaySound) {
      showToast(`🔔 PEDIDO PRONTO! ${pedido.quantity || 1}x ${pedido.productName || 'Item'} (${pedido.localName}${comandaLabel})`, '#22c55e');
      if (typeof playChamarGarcom === 'function') playChamarGarcom();
      if (typeof playDing === 'function') playDing();
    }
    socket.emit('get_esteira', loggedUser.nome);

    const bellBtn = document.getElementById('nav-esteira');
    if (bellBtn && shouldPlaySound) {
      const bellIcon = bellBtn.querySelector('i');
      if (bellIcon) {
        bellIcon.classList.remove('bell-shake');
        void bellIcon.offsetWidth;
        bellIcon.classList.add('bell-shake');
        bellIcon.addEventListener('animationend', () => bellIcon.classList.remove('bell-shake'), { once: true });
      }
    }
    const badge = document.getElementById('esteira-badge') || document.getElementById('prontos-badge');
    if (badge) {
      badge.style.display = 'block';
      badge.classList.remove('badge-glow');
      void badge.offsetWidth;
      badge.classList.add('badge-glow');
      badge.addEventListener('animationend', () => badge.classList.remove('badge-glow'), { once: true });
    }

    if (shouldPlaySound && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('🔔 Pedido Pronto!', {
        body: `${pedido.quantity || 1}x ${pedido.productName} - ${pedido.localName}${comandaLabel}`,
        tag: `pronto-${pedido.id}`,
        requireInteraction: true
      });
    }
  }
});

let activeAcceptModal = null;

function showAcceptNotification(data) {
  const existing = document.getElementById('garcom-accept-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'garcom-accept-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:200000;';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const box = document.createElement('div');
  box.style.cssText = 'background:white;border-radius:20px;padding:28px;max-width:360px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:modalPop 0.2s ease;';

  box.innerHTML = `
    <div style="font-size:48px;margin-bottom:8px;"><i class="ph ph-hand-waving"></i></div>
    <h3 style="font-size:18px;font-weight:800;margin-bottom:4px;">Chamado na Mesa</h3>
    <p style="font-size:14px;color:#64748b;margin-bottom:4px;">${escHtml(data.localName)}</p>
    ${data.clienteNome ? '<p style="font-size:13px;color:#d97706;font-weight:700;margin-bottom:4px;"><i class="ph ph-user"></i> ' + escHtml(data.clienteNome) + '</p>' : ''}
    <p style="font-size:13px;color:#94a3b8;margin-bottom:20px;">Cliente chamou o garçom</p>
    <div style="display:flex;gap:10px;">
      <button id="btn-recusar-chamado" style="flex:1;padding:12px;border-radius:12px;border:2px solid #e2e8f0;background:white;font-weight:700;font-size:14px;cursor:pointer;color:#64748b;">Recusar</button>
      <button id="btn-aceitar-chamado" style="flex:1;padding:12px;border-radius:12px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:white;font-weight:700;font-size:14px;cursor:pointer;">Aceitar</button>
    </div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById('btn-aceitar-chamado').onclick = () => {
    socket.emit('garcom_aceitou_chamado', { localName: data.localName, garcomNome: loggedUser.nome });
    showToast(`Você aceitou o chamado de ${data.localName}`, '#10b981');
    overlay.remove();
    activeAcceptModal = null;
  };
  document.getElementById('btn-recusar-chamado').onclick = () => {
    overlay.remove();
    activeAcceptModal = null;
  };
  activeAcceptModal = overlay;
}

socket.on('notificacao_garcom', (data) => {
  if (!loggedUser) return;

  const badge = document.getElementById('esteira-badge');
  if (badge) {
    badge.style.display = 'block';
    badge.classList.remove('badge-glow');
    void badge.offsetWidth;
    badge.classList.add('badge-glow');
    badge.addEventListener('animationend', () => badge.classList.remove('badge-glow'), { once: true });
  }

  const bellBtn = document.getElementById('nav-esteira');
  if (bellBtn) {
    const bellIcon = bellBtn.querySelector('i');
    if (bellIcon) {
      bellIcon.classList.remove('bell-shake');
      void bellIcon.offsetWidth;
      bellIcon.classList.add('bell-shake');
      bellIcon.addEventListener('animationend', () => bellIcon.classList.remove('bell-shake'), { once: true });
    }
  }

  if (data.userName === 'Chamada') {
    showAcceptNotification(data);
  }

  const clienteLabel = data.clienteNome ? ` — ${data.clienteNome}` : '';
  const msg = `🔔 ${data.quantity}x ${data.productName} - ${data.localName}${clienteLabel} aguardando retirada!`;
  showToast(msg, '#8b5cf6');
  playChamarGarcom();

  if ('Notification' in window) {
    const sendNotif = () => {
      new Notification('🔔 Garçom Chamado!', {
        body: `${data.quantity}x ${data.productName} - ${data.localName}${data.clienteNome ? ' (' + data.clienteNome + ')' : ''}`,
        tag: `chamar-${data.id}`,
        requireInteraction: true
      });
    };
    if (Notification.permission === 'granted') {
      sendNotif();
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(perm => { if (perm === 'granted') sendNotif(); });
    }
  }
});

socket.on('garcom_buscando', ({ pedidoId, garcomNome, localName, productName }) => {
  if (!loggedUser) return;
  chamadasReclamadas.set(pedidoId, garcomNome);
  if (garcomNome === loggedUser.nome) {
    showToast(`✅ Você está buscando ${productName} - ${localName}`, '#16a34a');
  } else {
    showToast(`👨‍🍳 ${garcomNome} está indo buscar ${productName} - ${localName}`, '#8b5cf6');
  }
  socket.emit('get_esteira', loggedUser.nome);
});

socket.on('status_atualizado', () => {
  if (loggedUser) socket.emit('get_esteira', loggedUser.nome);
  if (currentTable && document.getElementById('view-bill').classList.contains('active')) {
    socket.emit('get_itens_mesa', currentTable);
  }
});

socket.on('validacao_pedido_necessaria', ({ id, mesa, mesa_origem, cliente_nome }) => {
  playDing();
  showToast(`⚠️ Validação: ${cliente_nome} trocou de mesa (${mesa_origem || '?'} → ${mesa}). Verifique!`, '#f59e0b');
  if (loggedUser) socket.emit('get_esteira', loggedUser.nome);
});

// --- ÁUDIO E VIBRAÇÃO ---
let audioCtx = null;

function initGarcomAudio() {
  try {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {
    console.log("Audio init failed", e);
  }
}

// iOS/Safari só libera o áudio após um gesto do usuário — desbloquear no 1º toque
['click', 'touchstart', 'pointerdown', 'keydown'].forEach(evt => {
  window.addEventListener(evt, initGarcomAudio, { passive: true });
});

function playDing() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }

    const toneType = localStorage.getItem('sound-esteira-mobile') || (CONFIGS && CONFIGS['sound-esteira-mobile']) || 'pop';
    if (typeof window.playAudioTone === 'function') {
      window.playAudioTone(toneType);
      return;
    }

    initGarcomAudio();
    if (!audioCtx) return;

    createChime(880, 0);       // A5
    createChime(1108.73, 0.15); // C#6
  } catch (e) {
    console.log("Audio/Vibration not supported or blocked by browser.", e);
  }
}

function createChime(freq, delay) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  
  const now = audioCtx.currentTime + delay;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start(now);
  osc.stop(now + 1);
}

function playChamarGarcom() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([300, 150, 300, 150, 300]);
    }
    initGarcomAudio();
    if (!audioCtx) return;
    createChime(1046.5, 0);
    createChime(1318.5, 0.12);
    createChime(1568, 0.24);
    createChime(1318.5, 0.45);
    createChime(1046.5, 0.57);
  } catch (e) {
    console.log("Audio/Vibration not supported.", e);
  }
}

setInterval(() => {
  if (loggedUser && document.getElementById('view-esteira') && document.getElementById('view-esteira').classList.contains('active')) {
    socket.emit('get_esteira', loggedUser.nome);
  }
}, 30000);

// --- NAVEGAÇÃO POR GESTOS (SWIPE) ---
let touchStartX = 0;
let touchEndX = 0;
let touchStartY = 0;
let touchEndY = 0;

document.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', e => {
  touchEndX = e.changedTouches[0].screenX;
  touchEndY = e.changedTouches[0].screenY;
  handleSwipe();
}, { passive: true });

function handleSwipe() {
  const diffX = touchStartX - touchEndX;
  const diffY = touchStartY - touchEndY;
  
  // Ignora se for mais um scroll vertical do que um swipe horizontal
  if (Math.abs(diffY) > Math.abs(diffX)) return;
  // Limiar mínimo de swipe (50px)
  if (Math.abs(diffX) < 50) return;
  
  const activeView = document.querySelector('.view.active');
  if (!activeView) return;
  
  const currentViewId = activeView.id;
  
  // Navegação horizontal por swipe entre Atalhos (esquerda), Mesas (centro) e Esteira (direita)
  if (currentViewId === 'view-tables') {
    if (diffX > 0) {
      // Arrasto para a Esquerda -> Abre a Esteira
      showView('esteira', 'Prontos para Entrega');
    } else if (diffX < 0) {
      // Arrasto para a Direita -> Abre os Atalhos Rápidos
      showView('atalhos', 'Atalhos Rápidos');
    }
  } else if (currentViewId === 'view-atalhos' && diffX > 0) {
    // Arrasto para a Esquerda -> Volta para as Mesas
    showView('tables', 'Comanda Mobile');
  } else if (currentViewId === 'view-esteira' && diffX < 0) {
    // Arrasto para a Direita -> Volta para as Mesas
    showView('tables', 'Comanda Mobile');
  } else if (currentViewId === 'view-menu') {
    // Navegação pelas abas de categorias do Cardápio
    const currentIndex = TABS.indexOf(currentTab);
    if (currentIndex === -1) return;
    
    if (diffX > 0 && currentIndex < TABS.length - 1) {
      // Swipe Esquerda -> Próxima categoria
      window.selectTab(TABS[currentIndex + 1]);
    } else if (diffX < 0 && currentIndex > 0) {
      // Swipe Direita -> Categoria anterior
      window.selectTab(TABS[currentIndex - 1]);
    }
  }
}



// --- INDIVIDUAL COMANDAS HELPERS ---
window.openNewComandaModal = () => {
  document.getElementById('new-comanda-modal').style.display = 'flex';
  document.getElementById('new-comanda-name').value = '';
  document.getElementById('new-comanda-phone').value = '';
  var hist = document.getElementById('cliente-historico');
  if (hist) { hist.style.display = 'none'; hist.innerHTML = ''; }

  // Preencher seletor de mesas
  const _sel = document.getElementById('new-comanda-mesa');
  if (_sel) {
    _sel.innerHTML = '<option value="">-- Sem mesa (comanda avulsa) --</option>';
    const _mesaAtual = (typeof currentTable !== 'undefined' ? currentTable : '') || '';
    ((typeof MESAS !== 'undefined' ? MESAS : [])).forEach(function(m) {
      const opt = document.createElement('option');
      opt.value = m.nome;
      const st = m.status === 'Ocupada' ? ' (Ocupada)' : m.status === 'Reservada' ? ' (Reservada)' : ' (Livre)';
      opt.textContent = m.nome + st;
      if (m.nome === _mesaAtual) opt.selected = true;
      _sel.appendChild(opt);
    });
  }
  setTimeout(function() { document.getElementById('new-comanda-name').focus(); }, 150);
};

window.closeNewComandaModal = () => {
  document.getElementById('new-comanda-modal').style.display = 'none';
  window.pendingComandaItemIdx = null;
};

window.submitNewComanda = () => {
  const name = document.getElementById('new-comanda-name').value.trim();
  const phone = document.getElementById('new-comanda-phone').value.trim();
  
  if (!name) {
    alert('Por favor, digite o nome do cliente.');
    return;
  }
  if (!phone) {
    alert('Por favor, digite o telefone (necessário para remarketing).');
    return;
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) {
    alert('Por favor, digite um telefone válido.');
    return;
  }
  
  window.newComandasMap = window.newComandasMap || new Map();
  window.newComandasMap.set(name, phone);
  
  if (window.pendingComandaItemIdx !== null && window.pendingComandaItemIdx !== undefined) {
    cart[window.pendingComandaItemIdx].mesa_comanda = name;
    saveCart(currentTable);
  }
  
  // Verificar mesa selecionada
  const _mesaSel = document.getElementById('new-comanda-mesa');
  const _mesaEscolhida = _mesaSel ? _mesaSel.value.trim() : '';

  if (window.pendingComandaItemIdx !== null && window.pendingComandaItemIdx !== undefined) {
    if (_mesaEscolhida && typeof currentTable !== 'undefined') currentTable = _mesaEscolhida;
    window.closeNewComandaModal();
    if (typeof renderCart === 'function') renderCart();
  } else if (_mesaEscolhida) {
    currentTable = _mesaEscolhida;
    try { localStorage.setItem('chef_last_mesa', currentTable); } catch(e) {}
    if (typeof loadCart === 'function') loadCart(_mesaEscolhida);
    window.closeNewComandaModal();
    if (typeof showView === 'function') showView('menu', 'Pedido: ' + _mesaEscolhida);
    if (typeof renderMenu === 'function') renderMenu();
    if (typeof showToast === 'function') showToast('Comanda aberta: ' + name + ' — ' + _mesaEscolhida, '#10b981');
  } else {
    window.closeNewComandaModal();
    if (typeof showToast === 'function') showToast('Comanda criada: ' + name, '#6366f1');
  }
};

window.changeItemComanda = (idx, value) => {
  if (value === '__NEW__') {
    window.pendingComandaItemIdx = idx;
    window.openNewComandaModal();
    renderCart();
  } else {
    cart[idx].mesa_comanda = value || null;
    saveCart(currentTable);
  }
};

// Auto-fill name when existing client's phone matches
document.addEventListener('DOMContentLoaded', () => {
  const phoneInput = document.getElementById('new-comanda-phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
      const val = e.target.value;
      const digits = val.replace(/\D/g, '');
      if (digits.length >= 8) {
        socket.emit('buscar_cliente_telefone', digits);
      }
    });
  }
});

socket.on('cliente_telefone_encontrado', (data) => {
  const phoneInput = document.getElementById('new-comanda-phone');
  if (phoneInput) {
    const digits = phoneInput.value.replace(/\D/g, '');
    if (digits === data.telefone && data.nome) {
      document.getElementById('new-comanda-name').value = data.nome;
      const nameInput = document.getElementById('new-comanda-name');
      nameInput.style.borderColor = '#3ab55b';
      setTimeout(() => { nameInput.style.borderColor = '#ddd'; }, 1500);
      socket.emit('buscar_historico_cliente', { nome: data.nome, telefone: data.telefone });
    }
  }
});

socket.on('historico_cliente', (data) => {
  var container = document.getElementById('cliente-historico');
  if (!container) return;
  if (!data.historico || data.historico.length === 0) {
    container.innerHTML = '<div style="padding:8px 0;color:#999;font-size:12px;">Nenhum pedido anterior encontrado.</div>';
    container.style.display = 'block';
    return;
  }
  var html = '<div style="padding:8px 0;"><div style="font-size:11px;font-weight:800;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;"><i class="ph ph-clock-counter-clockwise"></i> Últimos pedidos:</div>';
  data.historico.forEach(function(p) {
    var tempo = p.createdAt ? chefFormatDate(p.createdAt) : '';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:12px;">' +
      '<div><span style="font-weight:700;">' + (p.productEmoji || '') + ' ' + p.productName + '</span> <span style="color:#94a3b8;">x' + p.quantity + '</span></div>' +
      '<div style="display:flex;align-items:center;gap:8px;color:#94a3b8;"><span>' + tempo + '</span><span style="color:#16a34a;font-weight:700;">R$ ' + parseFloat(p.total || 0).toFixed(2).replace('.', ',') + '</span></div>' +
    '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
  container.style.display = 'block';
});
window.longPressTimer = null;
window.startLongPress = (e) => {
  window.longPressTimer = setTimeout(() => {
    window.longPressTimer = null;
    window.location.href = '/index.html';
  }, 2000);
};
window.cancelLongPress = (e) => {
  if (window.longPressTimer) {
    clearTimeout(window.longPressTimer);
    window.longPressTimer = null;
  }
};
window.endLongPress = (e) => {
  if (window.longPressTimer) {
    clearTimeout(window.longPressTimer);
    window.longPressTimer = null;
    if (typeof showView === 'function') {
      showView('tables', 'Comanda Mobile');
      if (typeof renderTables === 'function') renderTables();
    }
  }
};

// --- Dark Mode Logic ---
document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  if (!themeToggleBtn) return;

  // Restaurar preferência salva (padrão: claro)
  const savedTheme = localStorage.getItem('chef_garcom_theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggleBtn.innerHTML = '<i class="ph ph-sun"></i>';
  } else {
    document.body.classList.remove('dark-mode');
    themeToggleBtn.innerHTML = '<i class="ph ph-moon"></i>';
  }

  themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('chef_garcom_theme', isDark ? 'dark' : 'light');
    themeToggleBtn.innerHTML = isDark
      ? '<i class="ph ph-sun"></i>'
      : '<i class="ph ph-moon"></i>';
  });
});

// ═════════════════════════════════════════════════════════════════════
// ⚡ CONTROLADOR DE ATALHOS RÁPIDOS DO APP GARÇOM (MOBILE)
// ═════════════════════════════════════════════════════════════════════

let cachedFilaEspera = [];
let cachedPedidosPreparo = [];
let filtroPreparoAtual = 'todos';
let buscaPreparoQuery = '';

// 1. Aplicação das Configurações de Atalhos Ativos
window.applyAtalhosConfig = function() {
  let atalhosCfg = {
    fila_espera: true,
    fila_preparo: true,
    consulta_preco: true,
    nova_comanda: true,
    chamar_gerente: true,
    minhas_vendas: true
  };

  try {
    if (CONFIGS && CONFIGS.garcom_atalhos) {
      const parsed = typeof CONFIGS.garcom_atalhos === 'string' ? JSON.parse(CONFIGS.garcom_atalhos) : CONFIGS.garcom_atalhos;
      atalhosCfg = Object.assign(atalhosCfg, parsed);
    } else {
      const local = localStorage.getItem('chef_garcom_atalhos_cfg');
      if (local) atalhosCfg = Object.assign(atalhosCfg, JSON.parse(local));
    }
  } catch (e) {}

  const mapCards = {
    'fila_espera': 'card-atalho-fila-espera',
    'fila_preparo': 'card-atalho-fila-preparo',
    'consulta_preco': 'card-atalho-consulta-preco',
    'nova_comanda': 'card-atalho-nova-comanda',
    'chamar_gerente': 'card-atalho-chamar-gerente',
    'minhas_vendas': 'card-atalho-minhas-vendas'
  };

  Object.keys(mapCards).forEach(key => {
    const el = document.getElementById(mapCards[key]);
    if (el) {
      el.style.display = atalhosCfg[key] === false ? 'none' : 'flex';
    }
  });
};

window.carregarAtalhosGarcom = function() {
  window.applyAtalhosConfig();
  if (typeof socket !== 'undefined' && socket) {
    socket.emit('get_fila_espera');
    socket.emit('get_pedidos');
  }
};

// ── 🪑 2. FILA DE ESPERA POR MESAS ──
window.abrirFilaEsperaGarcom = function() {
  const modal = document.getElementById('modal-fila-espera-garcom');
  if (!modal) return;
  modal.style.display = 'flex';
  if (typeof socket !== 'undefined' && socket) socket.emit('get_fila_espera');
};

window.fecharFilaEsperaGarcom = function() {
  const modal = document.getElementById('modal-fila-espera-garcom');
  if (modal) modal.style.display = 'none';
};

window.abrirModalAddFila = function() {
  const modal = document.getElementById('modal-add-fila-garcom');
  if (modal) {
    document.getElementById('add-fila-nome').value = '';
    document.getElementById('add-fila-pessoas').value = '2';
    document.getElementById('add-fila-telefone').value = '';
    document.getElementById('add-fila-obs').value = '';
    modal.style.display = 'flex';
    setTimeout(() => {
      const inp = document.getElementById('add-fila-nome');
      if (inp) inp.focus();
    }, 150);
  }
};

window.fecharModalAddFila = function() {
  const modal = document.getElementById('modal-add-fila-garcom');
  if (modal) modal.style.display = 'none';
};

window.salvarNovoFilaEspera = function() {
  const nome = (document.getElementById('add-fila-nome').value || '').trim();
  const pessoas = parseInt(document.getElementById('add-fila-pessoas').value || '2', 10);
  const telefone = (document.getElementById('add-fila-telefone').value || '').trim();
  const obs = (document.getElementById('add-fila-obs').value || '').trim();

  if (!nome) {
    showToast('Informe o nome do cliente', '#fc4b15');
    return;
  }

  if (typeof socket !== 'undefined' && socket) {
    socket.emit('adicionar_fila_espera', {
      cliente_nome: nome,
      cliente_telefone: telefone,
      pessoas: pessoas,
      mesa_preferida: obs,
      observacao: obs
    });
  }

  window.fecharModalAddFila();
  showToast(`✨ ${nome} adicionado à fila!`, '#3ab55b');
};

window.renderFilaEsperaGarcom = function(rows) {
  cachedFilaEspera = rows || [];
  const badgeCard = document.getElementById('atalho-fila-espera-badge');
  if (badgeCard) {
    badgeCard.innerText = `${cachedFilaEspera.length} grupo${cachedFilaEspera.length === 1 ? '' : 's'} aguardando`;
  }
  const labelCount = document.getElementById('label-fila-espera-count');
  if (labelCount) {
    labelCount.innerText = `${cachedFilaEspera.length} grupo${cachedFilaEspera.length === 1 ? '' : 's'} aguardando`;
  }

  const container = document.getElementById('lista-fila-espera-garcom');
  if (!container) return;

  if (cachedFilaEspera.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 40px 10px; font-size: 14px;"><i class="ph ph-armchair" style="font-size: 40px; display: block; margin-bottom: 8px;"></i>Nenhum cliente na fila de espera</div>';
    return;
  }

  container.innerHTML = cachedFilaEspera.map((item, idx) => {
    let diffMin = 0;
    if (item.criado_em) {
      const diffMs = Date.now() - new Date(item.criado_em).getTime();
      diffMin = Math.max(0, Math.floor(diffMs / 60000));
    }

    const obsText = item.mesa_preferida || item.observacao || '';
    const telClean = (item.cliente_telefone || '').replace(/\D/g, '');

    return `
      <div style="background: var(--g-app-bg, #f8fafc); border: 1.5px solid var(--g-border, #e2e8f0); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 30px; height: 30px; border-radius: 50%; background: #2563eb; color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;">
              ${idx + 1}º
            </div>
            <div>
              <strong style="font-size: 15px; color: var(--g-text, #0f172a); display: block;">${item.cliente_nome}</strong>
              <span style="font-size: 12px; color: var(--g-text-muted, #64748b);">
                <i class="ph ph-users"></i> ${item.pessoas || 2} pessoas ${obsText ? `• <em>${obsText}</em>` : ''}
              </span>
            </div>
          </div>
          <span style="font-size: 11.5px; font-weight: 700; background: ${diffMin >= 20 ? '#fee2e2' : '#f1f5f9'}; color: ${diffMin >= 20 ? '#dc2626' : '#475569'}; padding: 4px 8px; border-radius: 8px;">
            <i class="ph ph-clock"></i> Há ${diffMin} min
          </span>
        </div>

        <div style="display: flex; gap: 8px; border-top: 1px dashed var(--g-border, #cbd5e1); padding-top: 10px;">
          <button onclick="window.acomodarClienteFilaDirect(${item.id})" style="flex: 2; padding: 10px; border-radius: 10px; border: none; background: #16a34a; color: white; font-weight: 800; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <i class="ph-bold ph-check"></i> Acomodar na Mesa
          </button>
          ${telClean ? `
            <button onclick="window.open('https://wa.me/55${telClean}?text=' + encodeURIComponent('Olá ${item.cliente_nome}, sua mesa no restaurante está pronta! Pode se dirigir à recepção.'), '_blank')" style="padding: 10px 14px; border-radius: 10px; border: 1.5px solid #bbf7d0; background: #f0fdf4; color: #166534; font-weight: 700; font-size: 13px; cursor: pointer;" title="Notificar WhatsApp">
              <i class="ph-bold ph-whatsapp-logo" style="font-size: 16px;"></i>
            </button>
          ` : ''}
          <button onclick="window.removerFilaEsperaDirect(${item.id}, '${item.cliente_nome}')" style="padding: 10px 14px; border-radius: 10px; border: 1.5px solid #fecaca; background: #fef2f2; color: #dc2626; font-weight: 700; font-size: 13px; cursor: pointer;" title="Remover da Fila">
            <i class="ph ph-trash" style="font-size: 16px;"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
};

window.acomodarClienteFilaDirect = function(filaId) {
  if (typeof window.openPickMesaModal === 'function') {
    window.openPickMesaModal((mesaNome) => {
      if (typeof socket !== 'undefined' && socket) {
        socket.emit('acomodar_cliente_fila', { id: filaId, mesa: mesaNome });
      }
      window.fecharFilaEsperaGarcom();
      showToast(`✨ Cliente acomodado na ${mesaNome}!`, '#3ab55b');
    });
  }
};

window.removerFilaEsperaDirect = function(id, nome) {
  if (confirm(`Deseja remover ${nome} da fila de espera?`)) {
    if (typeof socket !== 'undefined' && socket) {
      socket.emit('remover_fila_espera', id);
    }
    showToast(`${nome} removido da fila`, '#64748b');
  }
};

if (typeof socket !== 'undefined' && socket) {
  socket.on('fila_espera_atualizada', (rows) => {
    window.renderFilaEsperaGarcom(rows);
  });
}

// ── 🍳 3. FILA DE PREPARO / STATUS DA COZINHA (KDS) ──
window.abrirFilaPreparoGarcom = function() {
  const modal = document.getElementById('modal-fila-preparo-garcom');
  if (!modal) return;
  modal.style.display = 'flex';
  if (typeof socket !== 'undefined' && socket) socket.emit('get_pedidos');
};

window.fecharFilaPreparoGarcom = function() {
  const modal = document.getElementById('modal-fila-preparo-garcom');
  if (modal) modal.style.display = 'none';
};

window.setFiltroPreparo = function(tipo) {
  filtroPreparoAtual = tipo;
  document.querySelectorAll('.filtro-preparo-btn').forEach(btn => {
    btn.style.background = 'white';
    btn.style.color = '#64748b';
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`filtro-prep-${tipo}`);
  if (activeBtn) {
    activeBtn.style.background = '#fc4b15';
    activeBtn.style.color = 'white';
    activeBtn.classList.add('active');
  }
  window.renderFilaPreparoGarcom();
};

window.filtrarFilaPreparoGarcom = function(val) {
  buscaPreparoQuery = (val || '').toLowerCase().trim();
  window.renderFilaPreparoGarcom();
};

window.renderFilaPreparoGarcom = function(pedidos) {
  if (pedidos) cachedPedidosPreparo = pedidos;
  const container = document.getElementById('lista-fila-preparo-garcom');
  if (!container) return;

  const total = cachedPedidosPreparo.length;
  const pendentes = cachedPedidosPreparo.filter(p => !p.status || p.status.toLowerCase() === 'pendente' || p.status.toLowerCase() === 'aguardando' || p.status.toLowerCase() === 'na fila').length;
  const preparando = cachedPedidosPreparo.filter(p => p.status && p.status.toLowerCase().includes('prepar')).length;
  const prontos = cachedPedidosPreparo.filter(p => p.status && p.status.toLowerCase() === 'pronto').length;

  if (document.getElementById('count-prep-todos')) document.getElementById('count-prep-todos').innerText = total;
  if (document.getElementById('count-prep-pendente')) document.getElementById('count-prep-pendente').innerText = pendentes;
  if (document.getElementById('count-prep-preparando')) document.getElementById('count-prep-preparando').innerText = preparando;
  if (document.getElementById('count-prep-pronto')) document.getElementById('count-prep-pronto').innerText = prontos;

  const badgeCard = document.getElementById('atalho-fila-preparo-badge');
  if (badgeCard) {
    badgeCard.innerText = `${preparando} em preparo • ${prontos} prontos`;
  }

  let filtrados = cachedPedidosPreparo.filter(p => {
    const st = (p.status || 'pendente').toLowerCase();
    if (filtroPreparoAtual === 'pendente') return st === 'pendente' || st === 'aguardando' || st === 'na fila';
    if (filtroPreparoAtual === 'preparando') return st.includes('prepar');
    if (filtroPreparoAtual === 'pronto') return st === 'pronto';
    return true;
  });

  if (buscaPreparoQuery) {
    filtrados = filtrados.filter(p => {
      const mesa = String(p.mesa || '').toLowerCase();
      const item = String(p.productName || p.produto_nome || p.item || '').toLowerCase();
      const obs = String(p.observacao || p.obs || '').toLowerCase();
      return mesa.includes(buscaPreparoQuery) || item.includes(buscaPreparoQuery) || obs.includes(buscaPreparoQuery);
    });
  }

  if (filtrados.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 40px 10px; font-size: 14px;"><i class="ph ph-check-circle" style="font-size: 40px; display: block; margin-bottom: 8px; color: #16a34a;"></i>Nenhum pedido neste filtro</div>';
    return;
  }

  container.innerHTML = filtrados.map(p => {
    let diffMin = 0;
    if (p.createdAt) {
      const diffMs = Date.now() - parseUtc(p.createdAt);
      diffMin = Math.max(0, Math.floor(diffMs / 60000));
    }

    const st = (p.status || 'Pendente');
    let stColor = '#eab308'; // amarelo
    let stBg = '#fefce8';
    let stBorder = '#fef08a';
    let stIcon = 'ph-clock';

    if (st.toLowerCase().includes('prepar')) {
      stColor = '#2563eb'; stBg = '#eff6ff'; stBorder = '#bfdbfe'; stIcon = 'ph-cooking-pot';
    } else if (st.toLowerCase() === 'pronto') {
      stColor = '#16a34a'; stBg = '#f0fdf4'; stBorder = '#bbf7d0'; stIcon = 'ph-check-circle';
    }

    const prodNome = p.productName || p.produto_nome || p.item || 'Item';
    const prodEmoji = p.productEmoji || p.emoji || '🍽️';
    const qtd = p.quantity || p.quantidade || 1;
    const obs = p.observacao || p.obs || '';

    return `
      <div style="background: var(--g-card-bg, #ffffff); border: 1.5px solid var(--g-border, #e2e8f0); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 13px; font-weight: 800; background: #0f172a; color: white; padding: 3px 8px; border-radius: 8px;">${p.localName || p.mesa_grupo || p.mesa || p.mesa_comanda || 'Mesa ?'}</span>
            ${p.garcom ? `<span style="font-size: 11.5px; color: var(--g-text-muted, #64748b);">por <strong>${p.garcom}</strong></span>` : ''}
          </div>
          <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 800; padding: 4px 10px; border-radius: 12px; background: ${stBg}; color: ${stColor}; border: 1px solid ${stBorder};">
            <i class="ph-bold ${stIcon}"></i> ${st}
          </span>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 2px;">
          <div style="font-size: 15px; font-weight: 700; color: var(--g-text, #0f172a);">
            <span style="margin-right: 4px;">${prodEmoji}</span> ${qtd}x ${prodNome}
          </div>
          <span style="font-size: 12px; font-weight: 700; color: ${diffMin >= 20 ? '#dc2626' : '#64748b'};">
            <i class="ph ph-timer"></i> ${diffMin} min atrás
          </span>
        </div>

        ${obs ? `<div style="font-size: 12px; color: #ea580c; background: #fff7ed; padding: 6px 10px; border-radius: 8px; border-left: 3px solid #f97316;"><strong>Obs:</strong> ${obs}</div>` : ''}
      </div>
    `;
  }).join('');
};

if (typeof socket !== 'undefined' && socket) {
  socket.on('pedidos_atualizados', (pedidos) => {
    window.renderFilaPreparoGarcom(pedidos);
  });
}

// ── 🔍 4. CONSULTA RÁPIDA DE PREÇO E ESTOQUE ──
window.abrirConsultaPrecoGarcom = function() {
  const modal = document.getElementById('modal-consulta-preco-garcom');
  if (!modal) return;
  modal.style.display = 'flex';
  const inp = document.getElementById('input-busca-consulta-preco');
  if (inp) {
    inp.value = '';
    setTimeout(() => inp.focus(), 150);
  }
  window.filtrarConsultaPreco('');
};

window.fecharConsultaPrecoGarcom = function() {
  const modal = document.getElementById('modal-consulta-preco-garcom');
  if (modal) modal.style.display = 'none';
};

window.filtrarConsultaPreco = function(query) {
  const q = (query || '').toLowerCase().trim();
  const container = document.getElementById('lista-consulta-preco-garcom');
  if (!container) return;

  // MENU usa campos: name, category, emoji, price (mapeados do socket produtos_atualizados)
  const prods = (typeof MENU !== 'undefined' && Array.isArray(MENU)) ? MENU : [];

  if (prods.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 30px; font-size: 14px;"><i class="ph ph-spinner" style="font-size:28px;display:block;margin-bottom:8px;"></i>Carregando cardápio...</div>';
    // Solicita produtos ao servidor se MENU estiver vazio
    if (typeof socket !== 'undefined' && socket) socket.emit('get_produtos');
    return;
  }

  let filtrados = prods;
  if (q) {
    filtrados = prods.filter(p => {
      // MENU usa 'name' e 'category' (não 'nome'/'categoria')
      const n = (p.name || p.nome || '').toLowerCase();
      const c = (p.category || p.categoria || '').toLowerCase();
      const d = (p.descricao || p.description || '').toLowerCase();
      return n.includes(q) || c.includes(q) || d.includes(q);
    });
  }

  if (filtrados.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 30px; font-size: 14px;">Nenhum item encontrado</div>';
    return;
  }

  container.innerHTML = filtrados.slice(0, 60).map(p => {
    const nome = p.name || p.nome || 'Item';
    const categoria = p.category || p.categoria || 'Geral';
    const preco = parseFloat(p.price || p.preco || 0).toFixed(2).replace('.', ',');
    const emoji = p.emoji || '🍽️';
    const imgHtml = p.imagem
      ? `<img src="${p.imagem}" style="width: 44px; height: 44px; border-radius: 12px; object-fit: cover;">`
      : `<div style="width: 44px; height: 44px; border-radius: 12px; background: rgba(252,75,21,0.1); color: #fc4b15; display: flex; align-items: center; justify-content: center; font-size: 24px;">${emoji}</div>`;

    return `
      <div style="background: var(--g-app-bg, #f8fafc); border: 1px solid var(--g-border, #e2e8f0); border-radius: 14px; padding: 10px 12px; display: flex; align-items: center; gap: 12px;">
        ${imgHtml}
        <div style="flex: 1; min-width: 0;">
          <strong style="font-size: 14px; color: var(--g-text, #0f172a); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${nome}</strong>
          <span style="font-size: 11.5px; color: var(--g-text-muted, #64748b);">${categoria}</span>
        </div>
        <div style="text-align: right;">
          <strong style="font-size: 15px; color: #fc4b15;">R$ ${preco}</strong>
        </div>
      </div>
    `;
  }).join('');
};

// ── 🛎️ 5. CHAMAR GERENTE / SUPORTE ──
window.chamarGerenteGarcom = function() {
  if (confirm('Deseja enviar um chamado urgente para o Gerente / Caixa?')) {
    const nomeGarcom = (typeof loggedUser !== 'undefined' && loggedUser && loggedUser.nome) ? loggedUser.nome : 'Garçom';
    if (typeof socket !== 'undefined' && socket) {
      socket.emit('chamar_garcom_salao', {
        tipo: 'gerente',
        origem: 'app_garcom',
        solicitante: nomeGarcom,
        mensagem: `🚨 O colaborador ${nomeGarcom} solicitou a presença do Gerente no salão!`
      });
    }
    showToast('🚨 Chamado enviado com sucesso ao Gerente!', '#3ab55b');
  }
};

// ── 📊 6. MINHAS VENDAS HOJE ──
window.abrirMinhasVendasGarcom = function() {
  const modal = document.getElementById('modal-minhas-vendas-garcom');
  if (!modal) return;
  modal.style.display = 'flex';

  const nomeGarcom = (typeof loggedUser !== 'undefined' && loggedUser && loggedUser.nome) ? loggedUser.nome.toLowerCase() : '';
  const labelTurno = document.getElementById('label-garcom-vendas-turno');
  if (labelTurno && loggedUser && loggedUser.nome) {
    labelTurno.innerText = `Turno de ${loggedUser.nome}`;
  }

  // Calcula pelas comandas/pedidos disponíveis
  let totalVendido = 0;
  let totalItens = 0;
  let totalPedidos = 0;

  if (Array.isArray(cachedPedidosPreparo)) {
    cachedPedidosPreparo.forEach(p => {
      if (p.garcom && p.garcom.toLowerCase() === nomeGarcom) {
        totalPedidos++;
        totalItens += (p.quantity || 1);
        totalVendido += parseFloat(p.total || (p.preco * (p.quantity || 1)) || 0);
      }
    });
  }

  const comissao = totalVendido * 0.10;

  if (document.getElementById('garcom-stat-total-vendido')) {
    document.getElementById('garcom-stat-total-vendido').innerText = `R$ ${totalVendido.toFixed(2).replace('.', ',')}`;
  }
  if (document.getElementById('garcom-stat-comissao')) {
    document.getElementById('garcom-stat-comissao').innerText = `R$ ${comissao.toFixed(2).replace('.', ',')}`;
  }
  if (document.getElementById('garcom-stat-pedidos-count')) {
    document.getElementById('garcom-stat-pedidos-count').innerText = totalPedidos;
  }
  if (document.getElementById('garcom-stat-itens-count')) {
    document.getElementById('garcom-stat-itens-count').innerText = totalItens;
  }
};

window.fecharMinhasVendasGarcom = function() {
  const modal = document.getElementById('modal-minhas-vendas-garcom');
  if (modal) modal.style.display = 'none';
};

// ═════════════════════════════════════════════════════════════════════
// 📡 CONTROLE REMOTO DO COLABORADOR (RECEBE COMANDOS DO DONO)
// ═════════════════════════════════════════════════════════════════════
if (typeof socket !== 'undefined' && socket) {
  socket.on('comando_colaborador_acao', function(data) {
    if (!data) return;
    const { funcionario_id, funcionario_nome, acao, payload, solicitadoPor } = data;

    const currentId = (loggedUser && (loggedUser.id || loggedUser.funcionario_id));
    const currentNome = (loggedUser && (loggedUser.nome || loggedUser.name || '')).toLowerCase().trim();
    const targetNome = (funcionario_nome || '').toLowerCase().trim();

    const isMe = (funcionario_id && currentId && String(funcionario_id) === String(currentId)) ||
                 (targetNome && currentNome && (currentNome === targetNome || currentNome.includes(targetNome) || targetNome.includes(currentNome)));

    if (!isMe && funcionario_id !== 'todos') return;

    if (acao === 'mensagem_direta') {
      const texto = (payload && payload.texto) || 'Mensagem do Dono';
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]); } catch(e) {}
      alert(`📢 MENSAGEM DO DONO (${solicitadoPor || 'Administração'}):\n\n${texto}`);
    } else if (acao === 'chamar_vibrar') {
      try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 600]); } catch(e) {}
      if (typeof showToast === 'function') {
        showToast(`🚨 ${solicitadoPor || 'O Dono'} está chamando você imediatamente!`, '#e11d48');
      } else {
        alert(`🚨 ${solicitadoPor || 'O Dono'} está chamando você imediatamente!`);
      }
    } else if (acao === 'redirecionar_view') {
      const targetView = (payload && payload.view) || 'tables';
      if (typeof showView === 'function') {
        const titles = { 'tables': 'Comanda Mobile', 'esteira': 'Prontos para Entrega', 'atalhos': 'Atalhos Rápidos' };
        showView(targetView, titles[targetView] || 'Chef Garçom');
        if (typeof showToast === 'function') showToast(`📡 Tela direcionada para ${targetView} pelo Dono`, '#3b82f6');
      }
    } else if (acao === 'desconectar_sessao') {
      alert(`🔒 Sua sessão foi encerrada remotamente por ${solicitadoPor || 'Dono'}.`);
      try {
        localStorage.removeItem('chef_garcom_usuario');
        localStorage.removeItem('chef_garcom_pin');
        sessionStorage.clear();
      } catch(e) {}
      window.location.reload();
    }
  });
}





// ══════════════════════════════════════════════════════════════════
// QR CODE DA MESA (GARÇOM MOBILE)
// ══════════════════════════════════════════════════════════════════
window.exibirQrCodeMesaGarcom = function(nomeMesa) {
  if (!nomeMesa) nomeMesa = currentTable || 'Mesa';
  const modal = document.getElementById('modal-qr-mesa-garcom');
  const titulo = document.getElementById('qr-mesa-titulo');
  const container = document.getElementById('qr-mesa-container');
  if (!modal || !container) return;

  if (titulo) titulo.innerText = nomeMesa.startsWith('Mesa') ? nomeMesa : `Mesa ${nomeMesa}`;

  const proto = window.location.protocol;
  const host = window.location.host;
  const restauranteId = localStorage.getItem('restaurante_id') || '1';
  const urlCardapio = `${proto}//${host}/cardapio.html?mesa=${encodeURIComponent(nomeMesa)}&restaurante_id=${encodeURIComponent(restauranteId)}`;
  window._qrMesaAtualUrl = urlCardapio;

  container.innerHTML = '<div style="color:#64748b; font-size:13px; font-weight:600;"><i class="ph ph-spinner-gap" style="animation:spin 1s infinite;"></i> Gerando QR Code...</div>';
  modal.style.display = 'flex';

  setTimeout(() => {
    try {
      if (typeof window.qrcode === 'function') {
        const qr = window.qrcode(0, 'M');
        qr.addData(urlCardapio);
        qr.make();
        const dataUrl = qr.createDataURL(6, 0);
        container.innerHTML = `<img src="${dataUrl}" alt="QR Code Mesa" style="width:220px; height:220px; border-radius:8px; display:block;">`;
        return;
      }
    } catch(e) {
      console.warn('[QR Garçom] Falha ao usar qrcode lib:', e);
    }

    // Fallback via API rápida / canvas
    const imgApi = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(urlCardapio)}`;
    container.innerHTML = `<img src="${imgApi}" alt="QR Code Mesa" style="width:220px; height:220px; border-radius:8px; display:block;" onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\'padding:20px; color:#ef4444; font-weight:bold;\'>Erro ao gerar QR Code offline</div>';">`;
  }, 50);
};

window.fecharQrCodeMesaGarcom = function() {
  const modal = document.getElementById('modal-qr-mesa-garcom');
  if (modal) modal.style.display = 'none';
};

window.copiarLinkCardapioMesa = function() {
  if (!window._qrMesaAtualUrl) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(window._qrMesaAtualUrl).then(() => {
      showToast('Link do cardápio copiado!', '#0284c7');
    }).catch(() => {
      prompt('Copie o link abaixo:', window._qrMesaAtualUrl);
    });
  } else {
    prompt('Copie o link abaixo:', window._qrMesaAtualUrl);
  }
};

window.abrirCardapioMesaDireto = function() {
  if (window._qrMesaAtualUrl) {
    window.open(window._qrMesaAtualUrl, '_blank');
  }
};

// ══════════════════════════════════════════════════════════════════
// ADICIONAR ITEM RÁPIDO NA CONTA DA MESA (GARÇOM MOBILE)
// ══════════════════════════════════════════════════════════════════
let _categoriaItemRapidoAtiva = 'Todos';

window.abrirAdicionarItemRapidoGarcom = function() {
  if (!currentTable) {
    showToast('Nenhuma mesa selecionada', '#ef4444');
    return;
  }
  const modal = document.getElementById('modal-add-item-rapido-garcom');
  const sub = document.getElementById('add-rapido-mesa-sub');
  const inputBusca = document.getElementById('input-busca-item-rapido');
  if (!modal) return;

  if (sub) sub.innerText = `Lançar item direto na ${currentTable.startsWith('Mesa') ? currentTable : 'Mesa ' + currentTable}`;
  if (inputBusca) inputBusca.value = '';

  _categoriaItemRapidoAtiva = 'Todos';
  renderizarCategoriasItensRapidos();
  renderizarListaItensRapidos();

  modal.style.display = 'flex';
  setTimeout(() => { if (inputBusca) inputBusca.focus(); }, 150);
};

window.fecharAdicionarItemRapidoGarcom = function() {
  const modal = document.getElementById('modal-add-item-rapido-garcom');
  if (modal) modal.style.display = 'none';
};

function renderizarCategoriasItensRapidos() {
  const container = document.getElementById('chips-categorias-item-rapido');
  if (!container) return;

  const categorias = ['Todos', ...new Set(MENU.map(m => m.category).filter(Boolean))];
  container.innerHTML = categorias.map(cat => `
    <button onclick="window.selecionarCategoriaItemRapido('${escJs(cat)}')" class="chip-cat-rapido ${cat === _categoriaItemRapidoAtiva ? 'active' : ''}" style="padding:6px 14px; border-radius:20px; border:1px solid ${cat === _categoriaItemRapidoAtiva ? '#2563eb' : '#cbd5e1'}; background:${cat === _categoriaItemRapidoAtiva ? '#2563eb' : '#f1f5f9'}; color:${cat === _categoriaItemRapidoAtiva ? '#ffffff' : '#475569'}; font-size:12.5px; font-weight:700; white-space:nowrap; cursor:pointer; flex-shrink:0;">
      ${escHtml(cat)}
    </button>
  `).join('');
}

window.selecionarCategoriaItemRapido = function(cat) {
  _categoriaItemRapidoAtiva = cat;
  renderizarCategoriasItensRapidos();
  renderizarListaItensRapidos();
};

window.filtrarItensRapidosGarcom = function() {
  renderizarListaItensRapidos();
};

function renderizarListaItensRapidos() {
  const container = document.getElementById('lista-produtos-item-rapido');
  const inputBusca = document.getElementById('input-busca-item-rapido');
  if (!container) return;

  const busca = inputBusca ? inputBusca.value.trim().toLowerCase() : '';
  let filtrados = MENU.filter(p => {
    if (_categoriaItemRapidoAtiva !== 'Todos' && p.category !== _categoriaItemRapidoAtiva) return false;
    if (busca && !p.name.toLowerCase().includes(busca) && !(p.category || '').toLowerCase().includes(busca)) return false;
    return true;
  });

  if (filtrados.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px 10px; color:#94a3b8; font-weight:600; font-size:13.5px;"><i class="ph ph-magnifying-glass" style="font-size:32px; display:block; margin-bottom:6px;"></i>Nenhum produto encontrado.</div>';
    return;
  }

  container.innerHTML = filtrados.map(p => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; box-shadow:0 2px 5px rgba(0,0,0,0.02);">
      <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
        <span style="font-size:22px; flex-shrink:0;">${escHtml(p.emoji || '🍽️')}</span>
        <div style="min-width:0; flex:1;">
          <div style="font-weight:700; font-size:14px; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(p.name)}</div>
          <div style="font-size:12.5px; font-weight:800; color:#16a34a;">R$ ${p.price.toFixed(2).replace('.', ',')}</div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
        <button onclick="window.lancarItemRapidoDireto(${p.id}, 1)" style="padding:8px 12px; border-radius:10px; background:#10b981; border:none; color:white; font-weight:800; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(16,185,129,0.25);">
          <i class="ph-bold ph-plus"></i> 1x
        </button>
        <button onclick="window.lancarItemRapidoDireto(${p.id}, 2)" style="padding:8px 10px; border-radius:10px; background:#f1f5f9; border:1px solid #cbd5e1; color:#334155; font-weight:800; font-size:12.5px; cursor:pointer;">
          +2x
        </button>
      </div>
    </div>
  `).join('');
}

window.lancarItemRapidoDireto = function(prodId, qtd = 1) {
  const prod = MENU.find(p => p.id === prodId);
  if (!prod) return;
  if (!currentTable) {
    showToast('Nenhuma mesa ativa', '#ef4444');
    return;
  }

  const emitItem = {
    productName: prod.name,
    productEmoji: prod.emoji || '🍽️',
    sector: prod.sector || 'Cozinha 1',
    quantity: qtd,
    observations: 'Adicionado na conferência',
    composicoes: [],
    total: (prod.price * qtd).toFixed(2).replace('.', ','),
    mesa_comanda: '',
    localName: currentTable,
    userName: loggedUser ? loggedUser.nome : 'Garçom',
    status: 'Pendente',
    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    createdAt: Date.now()
  };

  socket.emit('novo_pedido', emitItem);
  if (typeof trackInsertion === 'function') trackInsertion();

  showToast(`✓ ${qtd}x ${prod.name} adicionado à ${currentTable}!`, '#10b981');
  
  // Atualizar itens da mesa imediatamente
  setTimeout(() => {
    socket.emit('get_itens_mesa', currentTable);
  }, 200);
};


// ─── MODAL DE DIVISÃO / FRACIONAMENTO DE ITENS NA COMANDA MOBILE ───
window._itemEmFracionamento = null;

window.abrirModalFracionarItem = function (itemId) {
  const item = billItems.find(i => i.id === itemId);
  if (!item) return;

  window._itemEmFracionamento = item;

  let modal = document.getElementById('modal-fracionar-item-mobile');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-fracionar-item-mobile';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); z-index:999999; display:flex; align-items:flex-end; justify-content:center; padding:0;';
    document.body.appendChild(modal);
  }

  const multiplier = typeof getBillMultiplier === 'function' ? getBillMultiplier() : 1.0;
  const valorTotal = (parseFloat(String(item.total).replace(',', '.')) || 0) * multiplier;

  modal.innerHTML = `
    <div style="background:#ffffff; border-top-left-radius:24px; border-top-right-radius:24px; max-width:500px; width:100%; padding:20px; color:#1e293b; box-shadow:0 -10px 40px rgba(0,0,0,0.3); max-height:85vh; overflow-y:auto; animation:slideUp 0.3s ease;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:36px; height:36px; border-radius:10px; background:#fff7ed; color:#fc4b15; display:flex; align-items:center; justify-content:center; font-size:18px;">
            <i class="ph-bold ph-scissors"></i>
          </div>
          <div>
            <h4 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">Dividir / Fracionar Item</h4>
            <span style="font-size:12px; color:#64748b;">${item.productEmoji || '🍽️'} ${item.productName} (R$ ${valorTotal.toFixed(2).replace('.', ',')})</span>
          </div>
        </div>
        <button onclick="document.getElementById('modal-fracionar-item-mobile').style.display='none'" style="background:#f1f5f9; border:none; width:32px; height:32px; border-radius:50%; color:#64748b; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center;">&times;</button>
      </div>

      <div style="margin-bottom:16px;">
        <label style="font-size:12.5px; font-weight:700; color:#475569; display:block; margin-bottom:8px;">Escolha a quantidade de frações:</label>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
          <button type="button" onclick="window._gerarFracoesItem(2)" style="background:#fc4b15; color:white; border:none; padding:10px; border-radius:10px; font-weight:700; font-size:13px; cursor:pointer;">
            1/2 (2 Partes)
          </button>
          <button type="button" onclick="window._gerarFracoesItem(3)" style="background:#f8fafc; color:#334155; border:1px solid #cbd5e1; padding:10px; border-radius:10px; font-weight:700; font-size:13px; cursor:pointer;">
            1/3 (3 Partes)
          </button>
          <button type="button" onclick="window._gerarFracoesItem(4)" style="background:#f8fafc; color:#334155; border:1px solid #cbd5e1; padding:10px; border-radius:10px; font-weight:700; font-size:13px; cursor:pointer;">
            1/4 (4 Partes)
          </button>
        </div>
      </div>

      <div id="lista-fracoes-container" style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
        <!-- Injetado dinamicamente -->
      </div>

      <div style="display:flex; gap:10px;">
        <button type="button" onclick="window._confirmarFracionamentoItem()" style="flex:1; background:#10b981; color:white; border:none; padding:14px; border-radius:12px; font-weight:800; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
          <i class="ph-bold ph-check"></i> Salvar Divisão nas Comandas
        </button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
  window._gerarFracoesItem(2);
};

window._gerarFracoesItem = function (qtd) {
  const item = window._itemEmFracionamento;
  if (!item) return;

  const multiplier = typeof getBillMultiplier === 'function' ? getBillMultiplier() : 1.0;
  const valorTotal = (parseFloat(String(item.total).replace(',', '.')) || 0) * multiplier;
  const valorPorParte = valorTotal / qtd;
  const comandasDisponiveis = window.activeComandas || [];

  let html = '';
  for (let i = 1; i <= qtd; i++) {
    const fracaoTxt = '1/' + qtd;
    html += `
      <div style="background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:800; font-size:13px; color:#0f172a; display:flex; align-items:center; gap:6px;">
            <span style="background:#fc4b15; color:white; font-size:10px; padding:2px 6px; border-radius:6px;">${fracaoTxt}</span>
            Parte ${i}
          </span>
          <span style="font-weight:800; font-size:14px; color:#10b981;">R$ ${valorPorParte.toFixed(2).replace('.', ',')}</span>
        </div>

        <div style="display:flex; gap:6px; align-items:center;">
          <select class="select-comanda-fracao" data-fracao="${fracaoTxt}" data-valor="${valorPorParte}" style="flex:1; padding:8px 10px; border-radius:8px; border:1px solid #cbd5e1; font-size:12.5px; background:white; outline:none;">
            <option value="">👤 Consumo Geral da Mesa</option>
            ${comandasDisponiveis.map(c => `<option value="${c}">👤 Comanda: ${c}</option>`).join('')}
            <option value="__nova__">➕ Criar Nova Comanda...</option>
          </select>

          <button type="button" onclick="window._pagarFracaoDiretoMobile(${item.id}, ${valorPorParte}, '${fracaoTxt}')" style="background:#e0f2fe; border:1px solid #bae6fd; color:#0369a1; padding:8px 12px; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer; display:flex; align-items:center; gap:4px; white-space:nowrap;">
            <i class="ph-bold ph-credit-card"></i> Pagar Fração
          </button>
        </div>
      </div>
    `;
  }

  const container = document.getElementById('lista-fracoes-container');
  if (container) container.innerHTML = html;
};

window._confirmarFracionamentoItem = function () {
  const item = window._itemEmFracionamento;
  if (!item) return;

  const selects = document.querySelectorAll('.select-comanda-fracao');
  const fracoes = [];

  selects.forEach((sel) => {
    let comanda = sel.value;
    if (comanda === '__nova__') {
      const nova = prompt('Digite o nome da nova comanda para esta fração:');
      comanda = nova && nova.trim() ? nova.trim() : null;
    }
    fracoes.push({
      fracao: sel.dataset.fracao,
      valor: parseFloat(sel.dataset.valor) || 0,
      comanda: comanda
    });
  });

  socket.emit('dividir_item_fracoes', {
    itemId: item.id,
    fracoes: fracoes,
    mesaName: currentTable,
    operador: typeof garcomOperador === 'function' ? garcomOperador() : 'Garçom'
  });

  const modal = document.getElementById('modal-fracionar-item-mobile');
  if (modal) modal.style.display = 'none';
  if (typeof showToast === 'function') showToast('✂️ Item fracionado com sucesso!', 'success');
};

window._pagarFracaoDiretoMobile = function (itemId, valor, fracaoTxt) {
  const metodo = prompt('Selecione o método de pagamento:\n1 - Dinheiro\n2 - Cartão de Crédito\n3 - Cartão de Débito\n4 - PIX', '1');
  if (!metodo) return;

  let metodoStr = 'Dinheiro';
  if (metodo === '2' || metodo.toLowerCase().includes('crédito') || metodo.toLowerCase().includes('credito')) metodoStr = 'Cartão de Crédito';
  else if (metodo === '3' || metodo.toLowerCase().includes('débito') || metodo.toLowerCase().includes('debito')) metodoStr = 'Cartão de Débito';
  else if (metodo === '4' || metodo.toLowerCase().includes('pix')) metodoStr = 'PIX';

  socket.emit('pagar_fracao_item_garcom', {
    itemId: itemId,
    valor: valor,
    metodo: metodoStr,
    mesaName: currentTable,
    operador: typeof garcomOperador === 'function' ? garcomOperador() : 'Garçom'
  });

  const modal = document.getElementById('modal-fracionar-item-mobile');
  if (modal) modal.style.display = 'none';
  if (typeof showToast === 'function') showToast(`💳 Pagamento de ${fracaoTxt} (${metodoStr}) registrado!`, 'success');
};


// ─── GERENCIAMENTO DE ORDENAÇÃO E LAYOUT DE MESAS (GARÇOM MOBILE) ───
window.mudarOrdenacaoMesas = function (tipo) {
  try { localStorage.setItem('garcom_mesa_sort', tipo); } catch(e){}
  renderTables();
};

window.mudarLayoutMesas = function (layout) {
  try { localStorage.setItem('garcom_mesa_layout', layout); } catch(e){}
  
  document.querySelectorAll('.btn-layout-mesa').forEach(b => {
    b.classList.remove('active');
    b.style.background = 'transparent';
    b.style.color = 'var(--text-secondary, #64748b)';
  });

  const btnAtivo = document.getElementById('btn-layout-' + layout);
  if (btnAtivo) {
    btnAtivo.classList.add('active');
    btnAtivo.style.background = '#fc4b15';
    btnAtivo.style.color = '#ffffff';
  }

  const grid = document.getElementById('tables-grid');
  if (grid) {
    grid.className = '';
    if (layout === 'grid-3') {
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    } else if (layout === 'list') {
      grid.style.gridTemplateColumns = '1fr';
    } else {
      grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    }
  }
};

window.mostrarQrMesaCliente = function () {
  const mesaNome = currentTable || 'Mesa';
  const modal = document.getElementById('modal-qr-mesa-cliente');
  const titleEl = document.getElementById('modal-qr-mesa-title');
  const containerEl = document.getElementById('modal-qr-mesa-code-container');

  if (titleEl) titleEl.innerText = mesaNome;
  
  const clienteUrl = window.location.origin + '/conta-cliente.html?mesa=' + encodeURIComponent(mesaNome);
  window._clienteUrlAtual = clienteUrl;

  if (containerEl) {
    containerEl.innerHTML = '';
    if (typeof qrcode !== 'undefined') {
      try {
        const qr = qrcode(0, 'M');
        qr.addData(clienteUrl);
        qr.make();
        containerEl.innerHTML = qr.createImgTag(5, 8);
      } catch(e) {
        containerEl.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(clienteUrl)}" style="width:180px;height:180px;" alt="QR Code">`;
      }
    } else {
      containerEl.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(clienteUrl)}" style="width:180px;height:180px;" alt="QR Code">`;
    }
  }

  if (modal) modal.style.display = 'flex';
};

window.abrirLinkClienteDireto = function () {
  if (window._clienteUrlAtual) {
    window.open(window._clienteUrlAtual, '_blank');
  }
};
