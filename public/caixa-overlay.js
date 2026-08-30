/**
 * caixa-overlay.js — Lógica de abertura/estado do caixa
 * Gerencia o overlay de caixa aberto/fechado via socket e API REST
 */
window.abrirCaixaClick = function () {
  var valInput = document.getElementById('fundo-troco');
  var rawVal = valInput ? valInput.value : '100.00';
  if (!rawVal || !String(rawVal).trim()) rawVal = '0';
  var t = parseFloat(String(rawVal).replace(',', '.'));
  if (isNaN(t) || t < 0) t = 0;
  
  var operador = (window.crmPerfil && window.crmPerfil.nome) || localStorage.getItem('usuario_logado') || 'Caixa';
  var sock = (typeof window.socket !== 'undefined' && window.socket) ? window.socket : (typeof socket !== 'undefined' ? socket : null);
  var token = localStorage.getItem('token') || '';

  var overlay = document.getElementById('caixa-overlay');
  var statusName = document.getElementById('status-caixa-name');
  if (overlay) overlay.style.display = 'none';
  if (statusName) statusName.innerText = 'Caixa Aberto';

  var btn = document.getElementById('btn-abrir-caixa');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ph-bold ph-spinner" style="animation:spin 1s linear infinite;"></i> Abrindo...';
  }

  if (sock && sock.connected) {
    sock.emit('abrir_caixa', { fundo_troco: t, operador: operador });
  }

  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  fetch('/api/caixa/abrir', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ fundo_troco: t, operador: operador })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'ABRIR CAIXA';
    }
    if (overlay) overlay.style.display = 'none';
    if (statusName) statusName.innerText = 'Caixa Aberto';
    if (typeof showToast === 'function') {
      showToast('✅ Caixa aberto com sucesso!', 'success');
    }
    if (typeof carregarMesas === 'function') carregarMesas();
    if (typeof carregarPedidos === 'function') carregarPedidos();
  })
  .catch(function(err) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'ABRIR CAIXA';
    }
    if (overlay) overlay.style.display = 'none';
    if (statusName) statusName.innerText = 'Caixa Aberto';
  });
};

document.addEventListener('DOMContentLoaded', function () {
  var fundoInput = document.getElementById('fundo-troco');
  if (fundoInput) {
    fundoInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.abrirCaixaClick();
      }
    });
  }

  function verificarStatusRest() {
    var token = localStorage.getItem('token') || '';
    var headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    fetch('/api/caixa/status', { headers: headers })
      .then(function(r) { return r.json(); })
      .then(function(res) {
        var overlay = document.getElementById('caixa-overlay');
        var statusName = document.getElementById('status-caixa-name');
        if (res && res.aberto) {
          if (overlay) overlay.style.display = 'none';
          if (statusName) statusName.innerText = 'Caixa Aberto';
        } else if (res && res.success && !res.aberto) {
          if (overlay) overlay.style.display = 'flex';
          if (statusName) statusName.innerText = 'Caixa Fechado';
        }
      })
      .catch(function() {});
  }

  function initSocketCaixa() {
    var sock = (typeof window.socket !== 'undefined' && window.socket) ? window.socket : (typeof socket !== 'undefined' ? socket : null);
    if (sock) {
      sock.on('estado_caixa', function (turno) {
        var overlay = document.getElementById('caixa-overlay');
        var statusName = document.getElementById('status-caixa-name');
        if (turno && (turno.status === 'Aberto' || turno.id || !turno.data_fechamento)) {
          if (overlay) overlay.style.display = 'none';
          if (statusName) statusName.innerText = 'Caixa Aberto';
        } else {
          if (overlay) overlay.style.display = 'flex';
          if (statusName) statusName.innerText = 'Caixa Fechado';
        }
      });
      sock.on('caixa_aberto_sucesso', function () {
        var overlay = document.getElementById('caixa-overlay');
        var statusName = document.getElementById('status-caixa-name');
        if (overlay) overlay.style.display = 'none';
        if (statusName) statusName.innerText = 'Caixa Aberto';
        if (typeof showToast === 'function') {
          showToast('✅ Caixa aberto!', 'success');
        }
      });
      sock.emit('get_estado_caixa');
    } else {
      setTimeout(initSocketCaixa, 500);
    }
  }

  verificarStatusRest();
  initSocketCaixa();
});
