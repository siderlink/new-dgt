// auth.js
(function() {
  const path = window.location.pathname.toLowerCase();
  
  // Páginas públicas que não exigem login
  const publicPages = [
    'login.html',
    'registro.html',
    'ativacao.html',
    'cardapio.html',
    'conta-cliente.html',
    'area-cliente.html',
    'site-vendas.html',
    'totem.html',
    'fila-lite.html',
    'garcom-lite.html'
  ];
  if (publicPages.some(p => path.includes(p))) {
    return;
  }

  const token = localStorage.getItem('chef_token');
  let credsStr = localStorage.getItem('chef_session') || localStorage.getItem('chef_credentials') || localStorage.getItem('chef_app_creds');
  
  // Se tem token mas não tem creds, criar creds padrão a partir do token
  if (token && !credsStr) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const role = payload.role || 'admin';
      const defaultCreds = { cargo: role, role: role, restaurante_id: payload.restaurante_id || 1 };
      localStorage.setItem('chef_credentials', JSON.stringify(defaultCreds));
      credsStr = JSON.stringify(defaultCreds);
    } catch(e) {}
  }

  if (!token && !credsStr) {
    window.location.href = '/login.html';
    return;
  }
  
  try {
    const creds = JSON.parse(credsStr || '{}');
    const cargo = (creds.cargo || creds.funcao || creds.role || 'admin').toLowerCase();
    
    // Auth logic based on role
    const isGarcom = cargo === 'garçom' || cargo === 'garcom';
    const isCozinha = ['cozinha', 'copa', 'bar'].includes(cargo);
    const isAdmin = ['admin', 'administrador', 'gerente', 'caixa'].includes(cargo);
    const isStrictAdmin = ['admin', 'administrador', 'gerente'].includes(cargo);
    
    // If accessing config or dashboard, needs strict admin
    if ((path.includes('configuracoes.html') || path.includes('dashboard.html') || path.includes('totem-config.html')) && !isStrictAdmin) {
      if (isGarcom) window.location.href = '/garcom.html';
      else if (isCozinha) window.location.href = '/fila-pedidos.html';
      else window.location.href = '/index.html';
      return;
    }
    
    // If accessing index.html (Caixa), needs Admin or Caixa
    if (path.includes('index.html') && !isAdmin) {
      if (isGarcom) window.location.href = '/garcom.html';
      else if (isCozinha) window.location.href = '/fila-pedidos.html';
      else window.location.href = '/login.html';
      return;
    }
    
    // If garçom tries to access fila-pedidos
    if (path.includes('fila-pedidos.html') && isGarcom) {
      window.location.href = '/garcom.html';
      return;
    }
    
  } catch (e) {
    window.location.href = '/login.html';
  }
})();

// Registrar auditoria de navegação de páginas automaticamente
try {
  const s = (typeof socket !== 'undefined' && socket) || (typeof window !== 'undefined' && window.socket);
  if (s && typeof s.emit === 'function') {
    const currentPath = window.location.pathname || 'index.html';
    const pageTitle = document.title || 'Módulo do Sistema';
    s.emit('registrar_acesso_pagina', { pagina: currentPath, titulo: pageTitle, autorizado: true });
  }
} catch (e) {}


// Ouvinte global para forçar logout de todos os funcionários quando o restaurante é deslogado
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof io !== 'undefined' || typeof socket !== 'undefined') {
      const s = window.socket || (typeof io === 'function' ? io() : null);
      if (s && s.on) {
        s.on('forcar_logout_global', function(data) {
          const myRestId = localStorage.getItem('restaurante_id') || (localStorage.getItem('chef_credentials') ? JSON.parse(localStorage.getItem('chef_credentials')).restaurante_id : null);
          if (!data || !data.restaurante_id || String(data.restaurante_id) === String(myRestId)) {
            localStorage.clear();
            sessionStorage.clear();
            alert(data?.motivo || 'A sessão do restaurante foi encerrada pelo administrador. Faça login novamente.');
            window.location.href = '/login.html';
          }
        });

        s.on('forcar_logout_duplicado', function(data) {
          const creds = localStorage.getItem('chef_credentials') ? JSON.parse(localStorage.getItem('chef_credentials')) : {};
          const myUser = creds.usuario || creds.nome || '';
          const myUserId = localStorage.getItem('usuario_id') || creds.id || '';
          
          if (!data || (data.usuario_id && String(data.usuario_id) === String(myUserId)) || (data.usuario && String(data.usuario).toLowerCase() === String(myUser).toLowerCase())) {
            localStorage.clear();
            sessionStorage.clear();
            alert(data?.motivo || 'Esta conta foi conectada em outro dispositivo. Esta sessão foi finalizada.');
            window.location.href = '/login.html';
          }
        });
      }
    }
  });
}
