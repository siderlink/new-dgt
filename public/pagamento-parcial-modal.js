/**
 * pagamento-parcial-modal.js — Modal de Divisão e Pagamento Parcial com Desagrupamento de Itens
 *
 * Dados vêm de ordersData (sincronizado via window.ordersData pelo main.js).
 * Suporta atualização em tempo real: window.atualizarModalPagamentoParcialDesagrupado()
 * re-renderiza o modal aberto quando um pagamento chega de outro operador.
 */
(function (window) {
  'use strict';

  window._itensParciaisMesa = [];
  window._mesaPagamentoParcial = null;

  function _fontePedidos() {
    var src = window.ordersData;
    if (!Array.isArray(src) && typeof ordersData !== 'undefined') src = ordersData;
    if (!Array.isArray(src)) src = window.pedidosData;
    return Array.isArray(src) ? src : [];
  }

  function _montarItensParciais(nomeMesa) {
    var pedidosMesa = _fontePedidos().filter(function (p) {
      return (p.localName === nomeMesa || p.mesa_grupo === nomeMesa) &&
        p.status !== 'Finalizado' && p.status !== 'Cancelado';
    });

    var itensDesagrupados = [];
    pedidosMesa.forEach(function (p) {
      var qtd = parseInt(p.quantity, 10) || 1;
      var totalNum = parseFloat(String(p.total).replace(',', '.')) || 0;
      var valorUnit = qtd > 0 ? (totalNum / qtd) : totalNum;
      var isPago = p.status === 'Pago' || totalNum < 0;

      for (var i = 1; i <= qtd; i++) {
        itensDesagrupados.push({
          id: p.id,
          subId: p.id + '_' + i,
          productName: p.productName,
          productEmoji: p.productEmoji || '🍽️',
          valorUnit: valorUnit,
          isPago: isPago,
          status: p.status,
          mesa_comanda: p.mesa_comanda || null
        });
      }
    });

    return itensDesagrupados;
  }

  function _renderItensParciais() {
    var nomeMesa = window._mesaPagamentoParcial;
    var container = document.getElementById('lista-itens-desagrupados-container');
    if (!nomeMesa || !container) return;

    // Preserva os itens que o usuário já tinha marcado antes do re-render
    var subIdsMarcados = {};
    var chksAntigos = document.querySelectorAll('.chk-item-parcial:checked:not(:disabled)');
    for (var i = 0; i < chksAntigos.length; i++) {
      var c = chksAntigos[i];
      if (c.dataset.subId) subIdsMarcados[c.dataset.subId] = true;
    }

    var itens = _montarItensParciais(nomeMesa);
    window._itensParciaisMesa = itens;

    var totalNaoPago = itens.filter(function (i) { return !i.isPago && i.valorUnit > 0; })
      .reduce(function (sum, i) { return sum + i.valorUnit; }, 0);

    var restanteEl = document.getElementById('label-restante-pgto-parcial');
    if (restanteEl) {
      restanteEl.innerHTML = '<strong>R$ ' + totalNaoPago.toFixed(2).replace('.', ',') + '</strong>';
    }

    container.innerHTML = itens.length === 0
      ? '<p style="text-align:center; color:#94a3b8; font-size:13px; margin:20px 0;">Nenhum item em aberto nesta mesa.</p>'
      : itens.map(function (item, idx) {
          var preChecked = (subIdsMarcados[item.subId] && !item.isPago) ? 'checked' : '';
          return `
            <label style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-radius:12px; border:1px solid ${item.isPago ? '#d1fae5' : '#e2e8f0'}; background:${item.isPago ? 'rgba(16,185,129,0.05)' : '#f8fafc'}; opacity:${item.isPago ? '0.6' : '1'}; cursor:${item.isPago ? 'default' : 'pointer'};">
              <div style="display:flex; align-items:center; gap:10px;">
                <input type="checkbox" class="chk-item-parcial" data-idx="${idx}" data-subid="${item.subId}" data-valor="${item.valorUnit}" ${item.isPago ? 'disabled checked' : ''} ${preChecked} onchange="window.calcularTotalParcialSelecionado()" style="width:18px; height:18px; accent-color:#10b981; cursor:pointer;">
                <div>
                  <span style="font-size:13px; font-weight:700; ${item.isPago ? 'text-decoration:line-through;' : ''}">${item.productEmoji} ${item.productName}</span>
                  ${item.mesa_comanda ? `<span style="display:block; font-size:10.5px; color:#8b5cf6;">👤 Comanda: ${item.mesa_comanda}</span>` : ''}
                </div>
              </div>
              <div style="text-align:right;">
                <strong style="font-size:13px; color:${item.isPago ? '#10b981' : '#0f172a'};">R$ ${item.valorUnit.toFixed(2).replace('.', ',')}</strong>
                ${item.isPago ? '<span style="display:block; font-size:10px; font-weight:800; color:#10b981;">(PAGO)</span>' : ''}
              </div>
            </label>
          `;
        }).join('');

    window.calcularTotalParcialSelecionado();
  }

  window.atualizarModalPagamentoParcialDesagrupado = function () {
    var modal = document.getElementById('modal-pagamento-parcial-desagrupado');
    if (modal && modal.style.display !== 'none') {
      _renderItensParciais();
    }
  };

  function _toast(msg, tipo) {
    try {
      if (typeof showToastIA === 'function') showToastIA(msg, tipo === 'warning' ? '#f59e0b' : '#10b981');
      else if (typeof window.showToast === 'function') window.showToast(msg, tipo === 'warning' ? 'warning' : 'success');
    } catch (e) { }
  }

  window.abrirModalPagamentoParcialDesagrupado = function (nomeMesa) {
    if (!nomeMesa && window.mesaAtual) {
      nomeMesa = window.mesaAtual.mesaName || window.mesaAtual.nome || window.mesaAtual;
    }
    if (!nomeMesa) {
      _toast('Selecione uma mesa primeiro.', 'warning');
      return;
    }

    window._mesaPagamentoParcial = nomeMesa;

    var modal = document.getElementById('modal-pagamento-parcial-desagrupado');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-pagamento-parcial-desagrupado';
      modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px; animation:fadeIn 0.2s ease;';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:var(--bg-card, #ffffff); border-radius:24px; max-width:480px; width:100%; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.1); color:var(--text-primary, #0f172a);">
        <!-- CABEÇALHO -->
        <div style="padding:18px 20px; border-bottom:1px solid var(--border-color, #e2e8f0); display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:38px; height:38px; border-radius:10px; background:#ecfdf5; color:#10b981; display:flex; align-items:center; justify-content:center; font-size:20px;">
              <i class="ph-bold ph-currency-dollar"></i>
            </div>
            <div>
              <h3 style="margin:0; font-size:17px; font-weight:800;">Pagamento Parcial & Divisão</h3>
              <span id="label-restante-pgto-parcial" style="font-size:12px; color:var(--text-secondary, #64748b);">${nomeMesa} • Restante: <strong>R$ 0,00</strong></span>
            </div>
          </div>
          <button type="button" onclick="document.getElementById('modal-pagamento-parcial-desagrupado').style.display='none'" style="background:#f1f5f9; border:none; width:34px; height:34px; border-radius:50%; color:#64748b; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center;">&times;</button>
        </div>

        <!-- LISTA DE ITENS DESAGRUPADOS -->
        <div style="padding:16px 20px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:12px; font-weight:700; color:var(--text-secondary, #64748b); text-transform:uppercase;">Selecione os itens a pagar:</span>
            <button type="button" onclick="window.selecionarTodosItensParciais(true)" style="background:transparent; border:none; color:#fc4b15; font-size:11.5px; font-weight:700; cursor:pointer;">Marcar Todos</button>
          </div>

          <div id="lista-itens-desagrupados-container" style="display:flex; flex-direction:column; gap:6px;"></div>
        </div>

        <!-- TOTAL SELECIONADO & FORMA DE PAGAMENTO -->
        <div style="padding:16px 20px; background:var(--bg-main, #f8fafc); border-top:1px solid var(--border-color, #e2e8f0); display:flex; flex-direction:column; gap:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:13px; font-weight:700; color:var(--text-secondary, #64748b);">Total a Pagar Agora:</span>
            <span id="label-total-parcial-selecionado" style="font-size:18px; font-weight:800; color:#10b981;">R$ 0,00</span>
          </div>

          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
            <button type="button" class="btn-pgto-parcial-metodo active" data-metodo="Dinheiro" onclick="window.setMetodoPgtoParcial('Dinheiro', this)" style="padding:8px; border-radius:8px; border:1px solid #10b981; background:#10b981; color:white; font-size:12px; font-weight:700; cursor:pointer;">💵 Dinheiro</button>
            <button type="button" class="btn-pgto-parcial-metodo" data-metodo="Débito" onclick="window.setMetodoPgtoParcial('Débito', this)" style="padding:8px; border-radius:8px; border:1px solid #cbd5e1; background:white; color:#334155; font-size:12px; font-weight:700; cursor:pointer;">💳 Débito</button>
            <button type="button" class="btn-pgto-parcial-metodo" data-metodo="Crédito" onclick="window.setMetodoPgtoParcial('Crédito', this)" style="padding:8px; border-radius:8px; border:1px solid #cbd5e1; background:white; color:#334155; font-size:12px; font-weight:700; cursor:pointer;">💳 Crédito</button>
            <button type="button" class="btn-pgto-parcial-metodo" data-metodo="PIX" onclick="window.setMetodoPgtoParcial('PIX', this)" style="padding:8px; border-radius:8px; border:1px solid #cbd5e1; background:white; color:#334155; font-size:12px; font-weight:700; cursor:pointer;">⚡ PIX</button>
          </div>

          <button type="button" onclick="window.confirmarPagamentoParcialSelecionado()" style="background:#10b981; color:white; border:none; padding:14px; border-radius:12px; font-weight:800; font-size:14.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 14px rgba(16,185,129,0.3);">
            <i class="ph-bold ph-check-circle"></i> Confirmar Pagamento Parcial
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    window._metodoPgtoParcialSelecionado = 'Dinheiro';
    _renderItensParciais();
  };

  window.setMetodoPgtoParcial = function (metodo, btn) {
    window._metodoPgtoParcialSelecionado = metodo;
    document.querySelectorAll('.btn-pgto-parcial-metodo').forEach(function (b) {
      b.style.background = 'white';
      b.style.color = '#334155';
      b.style.borderColor = '#cbd5e1';
    });
    if (btn) {
      btn.style.background = '#10b981';
      btn.style.color = 'white';
      btn.style.borderColor = '#10b981';
    }
  };

  window.selecionarTodosItensParciais = function (marcar) {
    document.querySelectorAll('.chk-item-parcial:not(:disabled)').forEach(function (chk) {
      chk.checked = marcar;
    });
    window.calcularTotalParcialSelecionado();
  };

  window.calcularTotalParcialSelecionado = function () {
    var total = 0;
    document.querySelectorAll('.chk-item-parcial:checked:not(:disabled)').forEach(function (chk) {
      total += parseFloat(chk.dataset.valor) || 0;
    });
    var label = document.getElementById('label-total-parcial-selecionado');
    if (label) label.innerText = 'R$ ' + total.toFixed(2).replace('.', ',');
    window._totalParcialCalculado = total;
  };

  window.confirmarPagamentoParcialSelecionado = function () {
    var total = window._totalParcialCalculado || 0;
    if (total <= 0) {
      _toast('Selecione pelo menos um item para pagar.', 'warning');
      return;
    }

    var metodo = window._metodoPgtoParcialSelecionado || 'Dinheiro';
    var nomeMesa = window._mesaPagamentoParcial;
    var selecionados = [];

    document.querySelectorAll('.chk-item-parcial:checked:not(:disabled)').forEach(function (chk) {
      var idx = parseInt(chk.dataset.idx, 10);
      var item = window._itensParciaisMesa[idx];
      if (item) selecionados.push(item);
    });

    // Emite o pagamento de cada item selecionado para o backend
    var s = (typeof socket !== 'undefined' && socket) || (typeof window !== 'undefined' && window.socket);
    selecionados.forEach(function (item) {
      if (s && typeof s.emit === 'function') {
        s.emit('pagar_fracao_item_garcom', {
          itemId: item.id,
          valor: item.valorUnit,
          metodo: metodo,
          mesaName: nomeMesa,
          operador: localStorage.getItem('chef_operador_nome') || 'Caixa'
        });
      }
    });

    var modal = document.getElementById('modal-pagamento-parcial-desagrupado');
    if (modal) modal.style.display = 'none';

    _toast(`💰 Pagamento Parcial de R$ ${total.toFixed(2).replace('.', ',')} (${metodo}) registrado com sucesso!`);
  };

})(window);