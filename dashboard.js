const socket = io({ query: { token: localStorage.getItem('chef_token'), restaurante_id: localStorage.getItem('restaurante_id') || '1' } });

socket.on('tenant_atualizado', (data) => {
  if (data && data.restaurante_id) localStorage.setItem('restaurante_id', data.restaurante_id);
  if (data && data.token) localStorage.setItem('chef_token', data.token);
  socket.disconnect();
  socket.io.opts.query = { token: data.token, restaurante_id: String(data.restaurante_id) };
  socket.connect();
});

// --- SIDEBAR TOGGLE (hambúrguer) ---
const menuIcon = document.querySelector('.menu-icon');
const sidebar = document.querySelector('.sidebar');
if (menuIcon && sidebar) {
  menuIcon.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });
}

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

socket.on('connect', () => {
  socket.emit('get_dashboard_stats');
});

socket.on('dashboard_stats_result', (stats) => {
  if (!stats) return;
  // KPIs
  document.getElementById('dash-fat-hoje').innerText = formatCurrency(stats.faturamentoHoje);
  document.getElementById('dash-fat-mensal').innerText = formatCurrency(stats.faturamentoMensal);
  document.getElementById('dash-pedidos-hoje').innerText = stats.pedidosHoje || 0;
  document.getElementById('dash-ticket-medio').innerText = formatCurrency(stats.ticketMedio);

  // Top Clientes
  const topClientesTbody = document.getElementById('lista-top-clientes');
  if (topClientesTbody) {
    if (!stats.topClientes || stats.topClientes.length === 0) {
      topClientesTbody.innerHTML = '<tr><td colspan="3" style="padding:16px;text-align:center;color:#94a3b8;">Nenhum cliente encontrado.</td></tr>';
    } else {
      topClientesTbody.innerHTML = stats.topClientes.map(c => `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px;">${c.nome || 'N/I'}</td>
          <td style="padding: 10px;">${c.pedidos || 0}</td>
          <td style="padding: 10px;">${formatCurrency(c.gasto)}</td>
        </tr>
      `).join('');
    }
  }

  // Common chart options
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, boxWidth: 8 } },
      tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', padding: 10, cornerRadius: 8, displayColors: false }
    },
    animation: { duration: 800, easing: 'easeOutQuart' }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, boxWidth: 8 } },
      tooltip: { backgroundColor: 'rgba(15,23,42,0.9)', padding: 10, cornerRadius: 8, displayColors: false }
    },
    animation: { duration: 800, easing: 'easeOutQuart' }
  };

  const emptyMsg = (canvasId, msg) => {
    const el = document.getElementById(canvasId);
    if (el) {
      const parent = el.parentElement;
      if (parent && !parent.querySelector('.empty-chart-msg')) {
        const p = document.createElement('p');
        p.className = 'empty-chart-msg';
        p.style.cssText = 'text-align:center;color:#94a3b8;font-size:13px;padding:40px 0 0;';
        p.textContent = msg;
        parent.appendChild(p);
      }
    }
  };

  // Se o Chart.js não carregou (ex.: offline antes da atualização local),
  // não quebra a página: apenas mostra mensagem nos gráficos.
  if (typeof Chart === 'undefined') {
    ['chart-vendas-dias', 'chart-receitas-despesas', 'chart-produtos', 'chart-categorias', 'chart-pagamentos', 'chart-entregadores'].forEach(id => {
      emptyMsg(id, 'Gráficos indisponíveis (biblioteca não carregada).');
    });
    return;
  }

  // Vendas por dia (Bar Chart)
  const ctxVendasDias = document.getElementById('chart-vendas-dias');
  if (ctxVendasDias && stats.vendasDias && stats.vendasDias.length > 0) {
    new Chart(ctxVendasDias, {
      type: 'bar',
      data: {
        labels: stats.vendasDias.map(d => d.d.split('-').reverse().join('/')),
        datasets: [{
          label: 'Faturamento (R$)',
          data: stats.vendasDias.map(d => d.total),
          backgroundColor: '#3ab55b',
          borderRadius: 6
        }]
      },
      options: { ...commonOptions, plugins: { ...commonOptions.plugins, title: { display: true, text: 'Vendas por Dia (Últimos 7 Dias)', font: { size: 15, weight: 'bold' }, color: '#1e293b' }, legend: { display: false } } }
    });
  } else { emptyMsg('chart-vendas-dias', 'Sem dados de vendas no período.'); }

  // Receitas vs Despesas (Doughnut Chart)
  const ctxRecDesp = document.getElementById('chart-receitas-despesas');
  if (ctxRecDesp && stats.receitasDespesas && stats.receitasDespesas.length > 0) {
    new Chart(ctxRecDesp, {
      type: 'doughnut',
      data: {
        labels: stats.receitasDespesas.map(d => d.tipo === 'Entrada' ? 'Receitas' : 'Despesas'),
        datasets: [{
          data: stats.receitasDespesas.map(d => d.total),
          backgroundColor: ['#3ab55b', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: doughnutOptions
    });
  } else { emptyMsg('chart-receitas-despesas', 'Sem dados financeiros no período.'); }

  // Produtos mais vendidos (Horizontal Bar Chart)
  const ctxProd = document.getElementById('chart-produtos');
  if (ctxProd && stats.produtosPopulares && stats.produtosPopulares.length > 0) {
    new Chart(ctxProd, {
      type: 'bar',
      data: {
        labels: stats.produtosPopulares.map(p => p.productName),
        datasets: [{
          label: 'Qtd. Vendida',
          data: stats.produtosPopulares.map(p => p.qty),
          backgroundColor: ['#6c5ce7', '#0984e3', '#00b894', '#fdcb6e', '#e84393'],
          borderRadius: 6
        }]
      },
      options: { ...commonOptions, indexAxis: 'y', plugins: { ...commonOptions.plugins, title: { display: true, text: 'Produtos Mais Vendidos', font: { size: 15, weight: 'bold' }, color: '#1e293b' }, legend: { display: false } } }
    });
  } else { emptyMsg('chart-produtos', 'Nenhum produto vendido no período.'); }

  // Categorias (Pie Chart)
  const ctxCat = document.getElementById('chart-categorias');
  if (ctxCat && stats.categoriasPopulares && stats.categoriasPopulares.length > 0) {
    new Chart(ctxCat, {
      type: 'pie',
      data: {
        labels: stats.categoriasPopulares.map(c => c.categoria),
        datasets: [{
          data: stats.categoriasPopulares.map(c => c.qty),
          backgroundColor: ['#fdcb6e', '#00b894', '#0984e3', '#d63031', '#e84393'],
          borderWidth: 0
        }]
      },
      options: { ...doughnutOptions, cutout: 0, plugins: { ...doughnutOptions.plugins, title: { display: true, text: 'Categorias Mais Vendidas', font: { size: 15, weight: 'bold' }, color: '#1e293b' } } }
    });
  } else { emptyMsg('chart-categorias', 'Sem dados de categorias.'); }

  // Formas de Pagamento (Doughnut Chart)
  const ctxPag = document.getElementById('chart-pagamentos');
  if (ctxPag && stats.formasPagamento && stats.formasPagamento.length > 0) {
    new Chart(ctxPag, {
      type: 'doughnut',
      data: {
        labels: stats.formasPagamento.map(f => f.forma_pagamento || 'Desconhecido'),
        datasets: [{
          data: stats.formasPagamento.map(f => f.qty),
          backgroundColor: ['#00cec9', '#ffeaa7', '#ff7675', '#a29bfe', '#dfe6e9'],
          borderWidth: 0
        }]
      },
      options: { ...doughnutOptions, plugins: { ...doughnutOptions.plugins, title: { display: true, text: 'Formas de Pagamento', font: { size: 15, weight: 'bold' }, color: '#1e293b' } } }
    });
  } else { emptyMsg('chart-pagamentos', 'Sem dados de pagamentos.'); }

  // Entregadores (Bar Chart)
  const ctxEnt = document.getElementById('chart-entregadores');
  if (ctxEnt && stats.entregadores && stats.entregadores.length > 0) {
    new Chart(ctxEnt, {
      type: 'bar',
      data: {
        labels: stats.entregadores.map(e => e.entregador),
        datasets: [{
          label: 'Qtd. Entregas',
          data: stats.entregadores.map(e => e.entregas),
          backgroundColor: '#fd79a8',
          borderRadius: 6
        }]
      },
      options: { ...commonOptions, plugins: { ...commonOptions.plugins, title: { display: true, text: 'Entregas por Entregador', font: { size: 15, weight: 'bold' }, color: '#1e293b' }, legend: { display: false } } }
    });
  } else { emptyMsg('chart-entregadores', 'Sem dados de entregadores.'); }
});

// ── COMPARTILHAMENTO DE QR CODE DO CARDÁPIO DIGITAL NO DASHBOARD ──
window.obterUrlCardapioDigitalAtual = function() {
  const restId = localStorage.getItem('restaurante_id') || '1';
  const customDomain = localStorage.getItem('restaurante_custom_domain') || '';
  const slug = localStorage.getItem('restaurante_slug') || '';
  
  if (customDomain) {
    return customDomain.startsWith('http://') || customDomain.startsWith('https://') ? customDomain : `https://${customDomain}`;
  }
  if (slug) {
    return `https://${slug}.chefcozinha.com.br`;
  }
  return `${window.location.origin}/cardapio.html?restaurante_id=${encodeURIComponent(restId)}`;
};

window.abrirModalCompartilharCardapioQR = function() {
  const restNome = localStorage.getItem('restaurante_nome') || 'Nosso Restaurante';
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
  const restNome = localStorage.getItem('restaurante_nome') || 'Nosso Estabelecimento';
  const menuUrl = window.obterUrlCardapioDigitalAtual();
  const msg = `🍽️ Olá! Confira o nosso cardápio digital e faça seus pedidos diretamente pelo celular:\n\n👉 ${menuUrl}\n\n*${restNome}*`;
  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
};

window.compartilharNativoCardapioQR = function() {
  const restNome = localStorage.getItem('restaurante_nome') || 'Nosso Estabelecimento';
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
  const slug = localStorage.getItem('restaurante_slug') || 'restaurante';
  const a = document.createElement('a');
  a.href = imgEl.src;
  a.download = `qrcode-cardapio-${slug}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

window.imprimirDisplayCardapioQR = function() {
  const restNome = localStorage.getItem('restaurante_nome') || 'Nosso Restaurante';
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
