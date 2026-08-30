
// ─── MODAL DE ESCOLHA DE ESTAÇÃO DE TRABALHO (QUANDO HÁ MÚLTIPLAS PERMISSÕES / PROPRIETÁRIO) ───
window.abrirModalEscolhaEstacao = function(data) {
  let modal = document.getElementById('modal-escolha-estacao');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-escolha-estacao';
    modal.style.cssText = 'position:fixed; inset:0; z-index:10000; background:rgba(15,23,42,0.7); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:16px;';
    document.body.appendChild(modal);
  }

  const estacoes = data.estacoes || ['gestao', 'caixa', 'garcom', 'cozinha', 'configuracoes', 'delivery'];
  const nomeColab = data.nome || 'Proprietário';
  const isDono = data.is_dono || data.role === 'dono' || data.role === 'admin';

  const estacoesConfig = {
    gestao: { titulo: 'Painel do Dono & Gestão', sub: 'Relatórios, Faturamento e Métricas DRE', icone: 'ph-crown', cor: '#a855f7', url: '/painel-dono.html' },
    caixa: { titulo: 'Terminal de Caixa (PDV Master)', sub: 'Operação de Caixa, Fechamento e Pagamentos', icone: 'ph-desktop', cor: '#3b82f6', url: '/index.html' },
    garcom: { titulo: 'Salão de Mesas & App Garçom', sub: 'Atendimento, Comandas e Pedidos no Salão', icone: 'ph-fork-knife', cor: '#fc4b15', url: '/garcom.html' },
    cozinha: { titulo: 'KDS Cozinha & Bar', sub: 'Fila de Pedidos e Controle de Produção', icone: 'ph-fire', cor: '#10b981', url: '/fila-pedidos.html' },
    configuracoes: { titulo: 'Configurações & Cardápio', sub: 'Cadastros, Módulos, Impressoras e RH', icone: 'ph-gear', cor: '#0284c7', url: '/configuracoes.html' },
    delivery: { titulo: 'Hub de Entregas & Delivery', sub: 'Rastreio de Motoboys e Expedição', icone: 'ph-moped', cor: '#f59e0b', url: '/hub-delivery.html' }
  };

  let cardsHtml = '';
  estacoes.forEach(est => {
    const cfg = estacoesConfig[est];
    if (cfg) {
      cardsHtml += `
        <button type="button" onclick="window.selecionarEstacaoTrabalho('${cfg.url}', '${est}')" style="display:flex; align-items:center; gap:16px; width:100%; padding:14px 16px; background:#ffffff; border:1.5px solid #e2e8f0; border-radius:16px; cursor:pointer; text-align:left; transition:all 0.15s; margin-bottom:8px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
          <div style="width:46px; height:46px; border-radius:14px; background:${cfg.cor}18; color:${cfg.cor}; display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">
            <i class="ph-bold ${cfg.icone}"></i>
          </div>
          <div style="flex:1; min-width:0;">
            <strong style="display:block; font-size:15px; color:#0f172a; margin-bottom:2px;">${cfg.titulo}</strong>
            <span style="font-size:12px; color:#64748b;">${cfg.sub}</span>
          </div>
          <i class="ph-bold ph-arrow-right" style="color:#94a3b8; font-size:18px;"></i>
        </button>
      `;
    }
  });

  const headerBadge = isDono 
    ? `<div style="width:56px; height:56px; border-radius:18px; background:rgba(168,85,247,0.12); color:#a855f7; display:flex; align-items:center; justify-content:center; font-size:30px; margin:0 auto 14px;"><i class="ph-bold ph-crown"></i></div>`
    : `<div style="width:56px; height:56px; border-radius:18px; background:rgba(37,99,235,0.12); color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:30px; margin:0 auto 14px;"><i class="ph-bold ph-identification-badge"></i></div>`;

  const subTexto = isDono 
    ? 'Acesso Master Validado. Escolha qual setor deseja operar agora:' 
    : 'Selecione a estação de trabalho autorizada para seu turno:';

  modal.innerHTML = `
    <div style="background:#ffffff; border-radius:24px; padding:26px 22px; width:100%; max-width:480px; box-shadow:0 24px 60px rgba(0,0,0,0.3); text-align:center; box-sizing:border-box;">
      ${headerBadge}
      <h2 style="font-size:21px; font-weight:800; color:#0f172a; margin-bottom:4px;">Olá, ${nomeColab}!</h2>
      <p style="color:#64748b; font-size:13px; margin-bottom:18px;">${subTexto}</p>
      
      <div style="display:flex; flex-direction:column; gap:2px; max-height:58vh; overflow-y:auto; padding-right:2px;">
        ${cardsHtml}
      </div>

      <button onclick="document.getElementById('modal-escolha-estacao').style.display='none'" style="margin-top:14px; background:transparent; border:none; color:#94a3b8; font-weight:700; font-size:13px; cursor:pointer;">
        Voltar ao Login
      </button>
    </div>
  `;
  modal.style.display = 'flex';
};

window.selecionarEstacaoTrabalho = function(url, estacaoNome) {
  localStorage.setItem('chef_estacao_atual', estacaoNome);
  window.location.href = url;
};


window.preencherLoginOwner = function(email, senha) {
  window.setTipoPerfil('owner');
  const userEl = document.getElementById('username');
  const passEl = document.getElementById('password');
  if (userEl) userEl.value = email;
  if (passEl) passEl.value = senha;
  attemptOwnerLogin();
};

window.preencherPinColaborador = function(pin) {
  window.setTipoPerfil('colaborador');
  window.setModoColaborador('pin');
  const pinEl = document.getElementById('colab-pin-input');
  if (pinEl) {
    pinEl.value = pin;
    attemptColaboradorLogin();
  }
};

let _tipoPerfil = 'owner'; // 'owner' ou 'colaborador'
let _modoColaborador = 'pin'; // 'pin' ou 'user'
let _loginResAtual = null;

window.setTipoPerfil = function(tipo) {
  _tipoPerfil = tipo;
  const btnOwner = document.getElementById('tab-login-owner');
  const btnColab = document.getElementById('tab-login-colaborador');
  const formOwner = document.getElementById('form-owner-side');
  const formColab = document.getElementById('form-colaborador-side');
  const title = document.getElementById('login-title');
  const subtitle = document.getElementById('login-subtitle');

  if (tipo === 'owner') {
    if (btnOwner) { btnOwner.style.background = 'var(--primary)'; btnOwner.style.color = 'white'; btnOwner.style.fontWeight = '800'; }
    if (btnColab) { btnColab.style.background = 'transparent'; btnColab.style.color = 'var(--text-muted)'; btnColab.style.fontWeight = '700'; }
    if (formOwner) formOwner.style.display = 'block';
    if (formColab) formColab.style.display = 'none';
    if (title) title.innerText = 'Painel do Proprietário';
    if (subtitle) subtitle.innerText = 'Acesse a gestão, relatórios e controle financeiro.';
  } else {
    if (btnOwner) { btnOwner.style.background = 'transparent'; btnOwner.style.color = 'var(--text-muted)'; btnOwner.style.fontWeight = '700'; }
    if (btnColab) { btnColab.style.background = '#2563eb'; btnColab.style.color = 'white'; btnColab.style.fontWeight = '800'; }
    if (formOwner) formOwner.style.display = 'none';
    if (formColab) formColab.style.display = 'block';
    if (title) title.innerText = 'Acesso do Colaborador';
    if (subtitle) subtitle.innerText = 'Digite seu PIN ou usuário para abrir suas rotas operacionais.';
    ensureLoginSocket();
  }
};

window.setModoColaborador = function(modo) {
  _modoColaborador = modo;
  const btnPin = document.getElementById('btn-colab-mode-pin');
  const btnUser = document.getElementById('btn-colab-mode-user');
  const pinBox = document.getElementById('colab-pin-box');
  const userBox = document.getElementById('colab-user-box');

  if (modo === 'pin') {
    if (btnPin) { btnPin.style.background = 'rgba(37,99,235,0.12)'; btnPin.style.color = '#2563eb'; btnPin.style.borderColor = 'rgba(37,99,235,0.3)'; }
    if (btnUser) { btnUser.style.background = '#f1f5f9'; btnUser.style.color = '#64748b'; btnUser.style.borderColor = '#e2e8f0'; }
    if (pinBox) pinBox.style.display = 'block';
    if (userBox) userBox.style.display = 'none';
    document.getElementById('colab-pin-input')?.focus();
  } else {
    if (btnPin) { btnPin.style.background = '#f1f5f9'; btnPin.style.color = '#64748b'; btnPin.style.borderColor = '#e2e8f0'; }
    if (btnUser) { btnUser.style.background = 'rgba(37,99,235,0.12)'; btnUser.style.color = '#2563eb'; btnUser.style.borderColor = 'rgba(37,99,235,0.3)'; }
    if (pinBox) pinBox.style.display = 'none';
    if (userBox) userBox.style.display = 'block';
    document.getElementById('colab-user-input')?.focus();
  }
};

function vibrar(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms || 10); } catch (e) {}
}

// ─── LOGIN DO OWNER / PROPRIETÁRIO ───
window.attemptOwnerLogin = async function() {
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const errorMsg = document.getElementById('error-msg');
  const btnSubmit = document.getElementById('btn-submit');

  const email = usernameInput.value.trim();
  const senha = passwordInput.value.trim();
  if (!email || !senha) {
    errorMsg.innerText = 'Preencha usuário/e-mail e senha!';
    errorMsg.style.display = 'block';
    return;
  }

  errorMsg.style.display = 'none';
  btnSubmit.innerText = 'Autenticando...';
  btnSubmit.disabled = true;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    const res = await response.json();

    if (res.success) {
      const estacoesDono = res.estacoes || ['gestao', 'caixa', 'garcom', 'cozinha', 'configuracoes', 'delivery'];
      
      localStorage.setItem('chef_token', res.token);
      localStorage.setItem('restaurante_id', String(res.restaurante_id || 1));
      localStorage.setItem('usuario_role', res.role || 'dono');
      localStorage.setItem('colaborador_cargo', res.role || 'dono');
      localStorage.setItem('usuario_logado', res.nome || 'Proprietário Master');
      localStorage.setItem('chef_operador_nome', res.nome || 'Proprietário Master');
      localStorage.setItem('chef_operador_cargo', res.role || 'dono');
      localStorage.setItem('chef_is_dono', 'true');
      localStorage.setItem('chef_permissoes_estacoes', JSON.stringify(estacoesDono));
      localStorage.setItem('chef_credentials', JSON.stringify({
        id: res.id || null,
        cargo: res.role || 'dono',
        role: res.role || 'dono',
        nome: res.nome || 'Proprietário Master',
        is_dono: true,
        estacoes: estacoesDono
      }));

      vibrar([10, 40, 10]);

      // Proprietário tem acesso a todas as estações: abre direto o seletor de setor
      btnSubmit.innerText = 'Acesso Liberado!';
      window.abrirModalEscolhaEstacao({
        nome: res.nome || 'Proprietário',
        is_dono: true,
        role: res.role || 'dono',
        estacoes: estacoesDono
      });
      return;
    } else {
      errorMsg.innerText = res.error || 'PIN ou credencial inválida.';
      errorMsg.style.display = 'block';
      btnSubmit.innerText = 'Validar e Entrar';
      btnSubmit.disabled = false;
    }
  } catch (err) {
    errorMsg.innerText = 'Erro ao conectar no servidor.';
    errorMsg.style.display = 'block';
    btnSubmit.innerText = 'Validar e Entrar';
    btnSubmit.disabled = false;
  }
};

let loginSocket = null;

function ensureLoginSocket() {
  if (!loginSocket && typeof io !== 'undefined') {
    loginSocket = io();
    
    loginSocket.on('login_success', (res) => {
      const cargo = (res.cargo || '').toLowerCase();
      let estacoes = [];
      if (cargo === 'garçom' || cargo === 'garcom' || cargo === 'atendente') {
        estacoes = ['garcom'];
      } else if (['cozinha', 'copa', 'bar', 'kds'].includes(cargo)) {
        estacoes = ['cozinha'];
      } else if (cargo === 'caixa' || cargo === 'financeiro') {
        estacoes = ['caixa'];
      } else if (['admin', 'administrador', 'gerente', 'supervisor'].includes(cargo)) {
        estacoes = ['caixa', 'garcom', 'cozinha', 'configuracoes', 'delivery'];
      } else {
        estacoes = ['garcom', 'cozinha'];
      }

      const tempToken = localStorage.getItem('temp_login_token') || '';
      localStorage.setItem('chef_token', tempToken);
      localStorage.setItem('restaurante_id', String(res.restaurante_id || 1));
      localStorage.setItem('usuario_role', res.cargo || 'garcom');
      localStorage.setItem('colaborador_cargo', res.cargo || 'garcom');
      localStorage.setItem('usuario_logado', res.nome || 'Colaborador');
      localStorage.setItem('chef_is_dono', 'false');
      
      const payload = {
        id: res.id || null,
        nome: res.nome || 'Colaborador',
        cargo: res.cargo || 'Garçom',
        is_dono: false,
        estacoes: estacoes,
        token: tempToken
      };
      
      localStorage.setItem('chef_credentials', JSON.stringify(payload));
      localStorage.setItem('chef_session', JSON.stringify({
        token: tempToken,
        usuario: res.usuario || '',
        cargo: res.cargo || '',
        nome: res.nome || '',
        id: res.id || ''
      }));
      
      const btnSubmit = document.getElementById('btn-submit-colaborador');
      if (btnSubmit) {
        btnSubmit.innerText = 'Validar e Entrar';
        btnSubmit.disabled = false;
      }
      
      if (estacoes.length === 1) {
        const estacoesConfig = {
          garcom: '/garcom.html',
          cozinha: '/fila-pedidos.html',
          caixa: '/index.html',
          configuracoes: '/configuracoes.html',
          delivery: '/hub-delivery.html'
        };
        const targetUrl = estacoesConfig[estacoes[0]] || '/painel-funcionario.html';
        window.selecionarEstacaoTrabalho(targetUrl, estacoes[0]);
      } else {
        abrirModalEscolhaEstacao(payload);
      }
    });

    loginSocket.on('login_token', (token) => {
      localStorage.setItem('temp_login_token', token);
    });

    loginSocket.on('login_error', (msg) => {
      const errorMsg = document.getElementById('error-msg-colaborador');
      if (errorMsg) {
        errorMsg.innerText = msg;
        errorMsg.style.display = 'block';
      }
      const btnSubmit = document.getElementById('btn-submit-colaborador');
      if (btnSubmit) {
        btnSubmit.innerText = 'Validar e Entrar';
        btnSubmit.disabled = false;
      }
    });
  }
}

window.attemptColaboradorLogin = function() {
  ensureLoginSocket();
  const errorMsg = document.getElementById('error-msg-colaborador');
  if (errorMsg) errorMsg.style.display = 'none';
  
  const btnSubmit = document.getElementById('btn-submit-colaborador');
  
  if (_modoColaborador === 'pin') {
    const pin = (document.getElementById('colab-pin-input')?.value || '').trim();
    if (!pin) {
      if (errorMsg) { errorMsg.innerText = 'Digite seu PIN!'; errorMsg.style.display = 'block'; }
      return;
    }
    if (btnSubmit) { btnSubmit.innerText = 'Validando...'; btnSubmit.disabled = true; }
    loginSocket.emit('login_por_pin', { pin });
  } else {
    const usuario = (document.getElementById('colab-user-input')?.value || '').trim();
    const senha = (document.getElementById('colab-pass-input')?.value || '').trim();
    if (!usuario || !senha) {
      if (errorMsg) { errorMsg.innerText = 'Preencha usuário e senha!'; errorMsg.style.display = 'block'; }
      return;
    }
    if (btnSubmit) { btnSubmit.innerText = 'Validando...'; btnSubmit.disabled = true; }
    loginSocket.emit('login_funcionario', { usuario, senha });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ensureLoginSocket();

  document.getElementById('password')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') attemptOwnerLogin();
  });
  document.getElementById('email')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('password')?.focus();
  });

  const pinInput = document.getElementById('colab-pin-input');
  if (pinInput) {
    let pinDebounce = null;
    pinInput.addEventListener('input', () => {
      const val = (pinInput.value || '').trim();
      const errorMsg = document.getElementById('error-msg-colaborador');
      if (errorMsg) errorMsg.style.display = 'none';

      clearTimeout(pinDebounce);
      // Validação instantânea no último caractere digitado (>= 4 caracteres como g123, c123, f123, a123)
      if (val.length >= 4) {
        pinDebounce = setTimeout(() => {
          attemptColaboradorLogin();
        }, 50);
      }
    });
    pinInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') attemptColaboradorLogin();
    });
  }

  document.getElementById('colab-pass-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') attemptColaboradorLogin();
  });
});
