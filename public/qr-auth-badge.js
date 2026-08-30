/**
 * CHEF COZINHA - Módulo de Acesso e Liberação por QR Code & Crachás
 * Suporte a:
 * 1. Crachá Digital & Físico para Colaboradores (Login instantâneo no PDV, Caixa e Totem)
 * 2. Identificação e Login de Clientes por QR Code (Totem e App do Garçom)
 * 3. Scanner por Câmera (Html5Qrcode / BarcodeDetector / Canvas) + Leitor Físico USB / Bip
 */

(function(window) {
  'use strict';

  const ChefQR = {
    _scannerInstance: null,
    _bipBuffer: '',
    _bipTimer: null,

    // Formata o payload padronizado
    formatarPayloadColaborador: function(func) {
      if (!func) return '';
      const token = func.qr_token || ('COLAB-' + func.id);
      return `CHEF-COLAB:${func.id}:${token}`;
    },

    formatarPayloadCliente: function(cli) {
      if (!cli) return '';
      const token = cli.qr_token || ('CLI-' + (cli.id || cli.telefone));
      return `CHEF-CLI:${cli.id || 0}:${token}`;
    },

    // Gera o SVG / DataURL do QR Code usando qrcode-generator ou fallback
    gerarQRCodeDataUrl: function(texto, tamanho = 200) {
      if (window.qrcode) {
        try {
          const qr = window.qrcode(0, 'M');
          qr.addData(texto);
          qr.make();
          return qr.createDataURL(6, 4);
        } catch(e) {
          console.warn('Erro ao gerar via window.qrcode:', e);
        }
      }
      if (typeof window.gerarQrCodeDataUrl === 'function') {
        try {
          return window.gerarQrCodeDataUrl(texto, tamanho);
        } catch(e) {}
      }
      // Fallback seguro via SVG inline Data URI
      return `https://api.qrserver.com/v1/create-qr-code/?size=${tamanho}x${tamanho}&data=${encodeURIComponent(texto)}`;
    },

    // Retorna as cores temáticas por cargo
    getCargoStyle: function(cargo) {
      const c = String(cargo || '').toLowerCase();
      if (c.includes('gerente') || c.includes('adm')) {
        return { bg: 'linear-gradient(135deg, #059669, #10b981)', text: '#ffffff', tag: 'Gerência / Adm' };
      }
      if (c.includes('caixa')) {
        return { bg: 'linear-gradient(135deg, #2563eb, #3b82f6)', text: '#ffffff', tag: 'Operador de Caixa' };
      }
      if (c.includes('garçom') || c.includes('garcom') || c.includes('atendente')) {
        return { bg: 'linear-gradient(135deg, #ea580c, #f97316)', text: '#ffffff', tag: 'Atendimento & Salão' };
      }
      if (c.includes('cozinha') || c.includes('chef') || c.includes('pizzaiolo')) {
        return { bg: 'linear-gradient(135deg, #dc2626, #ef4444)', text: '#ffffff', tag: 'Cozinha & Preparo' };
      }
      if (c.includes('bar')) {
        return { bg: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', text: '#ffffff', tag: 'Bar & Bebidas' };
      }
      if (c.includes('entrega') || c.includes('motoboy')) {
        return { bg: 'linear-gradient(135deg, #0891b2, #06b6d4)', text: '#ffffff', tag: 'Logística & Entrega' };
      }
      return { bg: 'linear-gradient(135deg, #4b5563, #6b7280)', text: '#ffffff', tag: cargo || 'Colaborador' };
    },

    // Modal de Exibição do Crachá Digital do Colaborador
    abrirModalMeuCracha: function(colab, restConfig = {}) {
      if (!colab) return;
      const restNome = restConfig.rest_nome || localStorage.getItem('chef_restaurante_nome') || 'Chef Cozinha';
      const payload = this.formatarPayloadColaborador(colab);
      const qrDataUrl = this.gerarQRCodeDataUrl(payload, 220);
      const cargoStyle = this.getCargoStyle(colab.cargo);
      const iniciais = (colab.nome || 'C').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

      let modalEl = document.getElementById('modal-cracha-colaborador');
      if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'modal-cracha-colaborador';
        modalEl.className = 'chef-qr-modal-overlay';
        document.body.appendChild(modalEl);
      }

      modalEl.innerHTML = `
        <div class="chef-qr-modal-box">
          <div class="chef-qr-modal-header">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="width:34px; height:34px; border-radius:10px; background:#fc4b15; color:#fff; display:flex; align-items:center; justify-content:center; font-size:18px;">
                <i class="ph-bold ph-identification-badge"></i>
              </div>
              <h3 style="margin:0; font-size:17px; font-weight:800; color:#0f172a;">Crachá Digital & Acesso Rápido</h3>
            </div>
            <button onclick="document.getElementById('modal-cracha-colaborador').style.display='none'" style="background:#f1f5f9; border:none; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:16px; color:#64748b;">✕</button>
          </div>

          <p style="font-size:13px; color:#64748b; margin:0 0 16px 0; line-height:1.4;">
            Apresente este QR Code na câmera do <strong>PDV, Caixa ou Totem</strong> para autenticar sua estação de trabalho em 1 segundo.
          </p>

          <!-- CARTÃO DO CRACHÁ EM ALTA FIDELIDADE -->
          <div class="badge-card-container" id="printable-badge-card" style="background:#ffffff; border-radius:20px; box-shadow:0 12px 30px rgba(0,0,0,0.12); border:1px solid #e2e8f0; overflow:hidden; width:100%; max-width:340px; margin:0 auto; text-align:center; position:relative;">
            <!-- Header do crachá -->
            <div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#ffffff; padding:16px 14px 12px; position:relative;">
              <div style="font-size:11px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; color:#94a3b8;">CRACHÁ DE IDENTIFICAÇÃO</div>
              <div style="font-size:16px; font-weight:800; margin-top:2px; color:#fff;">${this._esc(restNome)}</div>
              <div style="position:absolute; top:12px; right:14px; width:8px; height:8px; border-radius:50%; background:#22c55e; box-shadow:0 0 8px #22c55e;"></div>
            </div>

            <!-- Corpo do crachá -->
            <div style="padding:18px 20px 20px;">
              <!-- Avatar -->
              <div style="width:68px; height:68px; border-radius:50%; background:${cargoStyle.bg}; color:#fff; font-size:24px; font-weight:800; display:flex; align-items:center; justify-content:center; margin:-36px auto 10px; border:4px solid #ffffff; box-shadow:0 6px 16px rgba(0,0,0,0.12);">
                ${iniciais}
              </div>

              <div style="font-size:18px; font-weight:800; color:#0f172a; margin-bottom:4px;">
                ${this._esc(colab.nome)}
              </div>

              <div style="display:inline-block; padding:4px 12px; border-radius:999px; background:${cargoStyle.bg}; color:${cargoStyle.text}; font-size:12px; font-weight:700; margin-bottom:14px;">
                ${this._esc(colab.cargo || 'Colaborador')}
              </div>

              <!-- Imagem QR Code -->
              <div style="background:#f8fafc; border:2px solid #e2e8f0; border-radius:16px; padding:12px; display:inline-block; margin-bottom:10px;">
                <img src="${qrDataUrl}" alt="QR Code Crachá" style="width:160px; height:160px; display:block; image-rendering:pixelated;">
              </div>

              <div style="font-size:11px; font-family:monospace; font-weight:700; color:#64748b; letter-spacing:1px;">
                CÓD: ${this._esc(colab.qr_token || ('COLAB-' + colab.id))}
              </div>
              <div style="font-size:10.5px; color:#94a3b8; margin-top:6px;">
                ID #${String(colab.id).padStart(4, '0')} • ACESSO SEGURO
              </div>
            </div>
          </div>

          <!-- AÇÕES DO MODAL -->
          <div style="display:flex; gap:10px; margin-top:20px;">
            <button onclick="window.ChefQR.imprimirCrachaIndividual(${JSON.stringify(colab).replace(/"/g, '&quot;')}, '${this._esc(restNome)}')" class="btn-chef-qr-print" style="flex:1; padding:12px 14px; background:#0f172a; color:#fff; border:none; border-radius:12px; font-weight:700; font-size:13.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
              <i class="ph-bold ph-printer"></i> Imprimir Crachá
            </button>
            <button onclick="document.getElementById('modal-cracha-colaborador').style.display='none'" style="padding:12px 18px; background:#f1f5f9; color:#475569; border:none; border-radius:12px; font-weight:700; font-size:13.5px; cursor:pointer;">
              Fechar
            </button>
          </div>
        </div>
      `;

      modalEl.style.display = 'flex';
    },

    // Impressão individual em formato padrão PVC (85x54mm)
    imprimirCrachaIndividual: function(colab, restNome) {
      const payload = this.formatarPayloadColaborador(colab);
      const qrDataUrl = this.gerarQRCodeDataUrl(payload, 260);
      const cargoStyle = this.getCargoStyle(colab.cargo);
      const iniciais = (colab.nome || 'C').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

      const printWin = window.open('', '_blank', 'width=800,height=600');
      if (!printWin) {
        alert('Por favor, autorize a abertura de popups para imprimir o crachá.');
        return;
      }

      printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Crachá - ${this._esc(colab.nome)}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            * { box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; margin: 0; padding: 0; }
            body { background: #f1f5f9; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
            .dica-corte { font-size: 13px; color: #64748b; margin-bottom: 20px; text-align: center; }
            .badge-wrapper {
              width: 85mm; height: 120mm; background: #ffffff; border: 1.5px dashed #94a3b8; border-radius: 12px;
              display: flex; flex-direction: column; overflow: hidden; page-break-inside: avoid; position: relative;
              box-shadow: 0 4px 15px rgba(0,0,0,0.06);
            }
            .badge-header { background: #0f172a; color: #ffffff; padding: 12px 10px; text-align: center; }
            .badge-header .sub { font-size: 8pt; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; font-weight: 700; }
            .badge-header .rest { font-size: 11pt; font-weight: 800; margin-top: 2px; }
            .badge-body { flex: 1; padding: 12px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; }
            .avatar { width: 52px; height: 52px; border-radius: 50%; background: ${cargoStyle.bg}; color: #fff; font-size: 18px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-top: -24px; border: 3px solid #fff; }
            .nome { font-size: 12pt; font-weight: 800; color: #0f172a; margin-top: 6px; }
            .cargo { display: inline-block; padding: 3px 10px; border-radius: 999px; background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5pt; font-weight: 700; color: #334155; margin-top: 4px; }
            .qr-box { background: #fff; border: 1.5px solid #0f172a; border-radius: 10px; padding: 6px; margin: 8px 0; }
            .qr-box img { width: 140px; height: 140px; display: block; image-rendering: pixelated; }
            .badge-footer { font-size: 7.5pt; color: #64748b; font-family: monospace; font-weight: 700; border-top: 1px solid #e2e8f0; width: 100%; padding-top: 6px; text-align: center; }
            @media print {
              body { background: #ffffff; padding: 0; }
              .no-print { display: none; }
              .badge-wrapper { border: 1px dashed #64748b; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="no-print dica-corte">
            <button onclick="window.print()" style="padding:10px 24px; background:#fc4b15; color:#fff; font-weight:800; border:none; border-radius:8px; cursor:pointer; font-size:14px; margin-bottom:12px;">🖨️ Imprimir Agora</button>
            <p>Imprima em papel cartão ou sulfite e insira no crachá de identificação.</p>
          </div>
          <div class="badge-wrapper">
            <div class="badge-header">
              <div class="sub">CRACHÁ DE IDENTIFICAÇÃO</div>
              <div class="rest">${this._esc(restNome)}</div>
            </div>
            <div class="badge-body">
              <div class="avatar">${iniciais}</div>
              <div>
                <div class="nome">${this._esc(colab.nome)}</div>
                <div class="cargo">${this._esc(colab.cargo || 'Colaborador')}</div>
              </div>
              <div class="qr-box">
                <img src="${qrDataUrl}" alt="QR Code">
              </div>
              <div class="badge-footer">
                ID #${String(colab.id).padStart(4, '0')} • CÓD: ${this._esc(colab.qr_token || ('COLAB-' + colab.id))}<br>
                <span style="font-size:6.5pt; font-family:sans-serif; color:#94a3b8;">Aproxime da câmera do PDV/Totem para liberar</span>
              </div>
            </div>
          </div>
          <script>
            window.onload = function() { setTimeout(function() { window.print(); }, 500); };
          <\/script>
        </body>
        </html>
      `);
      printWin.document.close();
    },

    // Impressão em lote de todos os colaboradores do restaurante
    imprimirCrachasLote: function(colabs = [], restNome = 'Chef Cozinha') {
      if (!colabs || colabs.length === 0) {
        alert('Nenhum colaborador encontrado para impressão.');
        return;
      }

      const printWin = window.open('', '_blank', 'width=900,height=700');
      if (!printWin) {
        alert('Por favor, autorize a abertura de popups para imprimir.');
        return;
      }

      const crachasHTML = colabs.map(colab => {
        const payload = this.formatarPayloadColaborador(colab);
        const qrDataUrl = this.gerarQRCodeDataUrl(payload, 200);
        const cargoStyle = this.getCargoStyle(colab.cargo);
        const iniciais = (colab.nome || 'C').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

        return `
          <div class="badge-item">
            <div class="badge-header">
              <div class="sub">CRACHÁ DE IDENTIFICAÇÃO</div>
              <div class="rest">${this._esc(restNome)}</div>
            </div>
            <div class="badge-body">
              <div class="avatar" style="background:${cargoStyle.bg};">${iniciais}</div>
              <div>
                <div class="nome">${this._esc(colab.nome)}</div>
                <div class="cargo">${this._esc(colab.cargo || 'Colaborador')}</div>
              </div>
              <div class="qr-box">
                <img src="${qrDataUrl}" alt="QR">
              </div>
              <div class="badge-footer">
                ID #${String(colab.id).padStart(4, '0')} • CÓD: ${this._esc(colab.qr_token || ('COLAB-' + colab.id))}<br>
                <span style="font-size:6pt; font-family:sans-serif; color:#94a3b8;">Liberação por QR Code</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Crachás em Lote - ${this._esc(restNome)}</title>
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            * { box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; margin: 0; padding: 0; }
            body { background: #f8fafc; padding: 14px; }
            .no-print { text-align: center; margin-bottom: 20px; }
            .grid-badges {
              display: grid; grid-template-columns: repeat(2, 85mm); gap: 10mm; justify-content: center;
            }
            .badge-item {
              width: 85mm; height: 118mm; background: #ffffff; border: 1.5px dashed #94a3b8; border-radius: 10px;
              display: flex; flex-direction: column; overflow: hidden; page-break-inside: avoid;
            }
            .badge-header { background: #0f172a; color: #ffffff; padding: 10px 8px; text-align: center; }
            .badge-header .sub { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 1.2px; color: #94a3b8; font-weight: 700; }
            .badge-header .rest { font-size: 10.5pt; font-weight: 800; margin-top: 2px; }
            .badge-body { flex: 1; padding: 10px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; }
            .avatar { width: 44px; height: 44px; border-radius: 50%; color: #fff; font-size: 15px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-top: -20px; border: 2.5px solid #fff; }
            .nome { font-size: 11pt; font-weight: 800; color: #0f172a; margin-top: 4px; max-width: 75mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .cargo { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8pt; font-weight: 700; color: #334155; margin-top: 2px; }
            .qr-box { background: #fff; border: 1.5px solid #0f172a; border-radius: 8px; padding: 4px; margin: 4px 0; }
            .qr-box img { width: 125px; height: 125px; display: block; image-rendering: pixelated; }
            .badge-footer { font-size: 7pt; color: #64748b; font-family: monospace; font-weight: 700; border-top: 1px solid #e2e8f0; width: 100%; padding-top: 4px; text-align: center; }
            @media print {
              body { background: #ffffff; padding: 0; }
              .no-print { display: none; }
              .badge-item { box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="no-print">
            <button onclick="window.print()" style="padding:10px 24px; background:#fc4b15; color:#fff; font-weight:800; border:none; border-radius:8px; cursor:pointer; font-size:14px;">🖨️ Imprimir Todos os Crachás (${colabs.length})</button>
          </div>
          <div class="grid-badges">
            ${crachasHTML}
          </div>
          <script>
            window.onload = function() { setTimeout(function() { window.print(); }, 600); };
          <\/script>
        </body>
        </html>
      `);
      printWin.document.close();
    },

    // Abre o Scanner Universal por Câmera + Bip de Leitor USB
    abrirScanner: function(options = {}) {
      const title = options.title || 'Aproxime o Crachá ou QR Code da Câmera';
      const subtitle = options.subtitle || 'Posicione o código no quadrado para leitura instantânea';
      const onScanSuccess = options.onScan || function(data) { console.log('QR Lido:', data); };
      const onScanError = options.onError || function(err) { console.warn(err); };
      const tipo = options.tipo || 'colaborador'; // 'colaborador' | 'cliente' | 'geral'

      let scannerModal = document.getElementById('modal-chef-qr-scanner');
      if (!scannerModal) {
        scannerModal = document.createElement('div');
        scannerModal.id = 'modal-chef-qr-scanner';
        scannerModal.className = 'chef-qr-modal-overlay';
        document.body.appendChild(scannerModal);
      }

      scannerModal.innerHTML = `
        <div class="chef-qr-modal-box" style="max-width:440px;">
          <div class="chef-qr-modal-header">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="width:34px; height:34px; border-radius:10px; background:#0f172a; color:#fff; display:flex; align-items:center; justify-content:center; font-size:18px;">
                <i class="ph-bold ph-qr-code"></i>
              </div>
              <h3 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">${this._esc(title)}</h3>
            </div>
            <button id="btn-close-qr-scanner" style="background:#f1f5f9; border:none; width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:16px; color:#64748b;">✕</button>
          </div>

          <p style="font-size:13px; color:#64748b; margin:0 0 12px 0;">${this._esc(subtitle)}</p>

          <!-- VIEWPORT DO SCANNER -->
          <div id="chef-qr-reader-container" style="position:relative; width:100%; min-height:280px; background:#000000; border-radius:16px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
            <div id="chef-qr-reader-video" style="width:100%; height:100%;"></div>
            <!-- Guia visual do alvo -->
            <div class="chef-qr-target-guide" style="position:absolute; width:200px; height:200px; border:2.5px solid #fc4b15; border-radius:16px; pointer-events:none; box-shadow:0 0 0 9999px rgba(0,0,0,0.45);">
              <div style="position:absolute; top:0; left:0; width:100%; height:2px; background:#fc4b15; animation:chefQrScanLine 2s infinite ease-in-out;"></div>
            </div>
          </div>

          <!-- ENTRADA MANUAL / LEITOR DE BIP USB -->
          <div style="margin-top:14px; display:flex; gap:8px;">
            <input type="text" id="chef-qr-input-manual" placeholder="Ou digite/bipe o código aqui..." style="flex:1; padding:10px 12px; border:1.5px solid #e2e8f0; border-radius:10px; font-size:13.5px; outline:none; font-family:monospace;">
            <button id="btn-chef-qr-submit-manual" style="padding:10px 16px; background:#0f172a; color:#fff; border:none; border-radius:10px; font-weight:700; font-size:13px; cursor:pointer;">
              Validar
            </button>
          </div>

          <div id="chef-qr-scan-feedback" style="display:none; margin-top:10px; padding:10px; border-radius:8px; font-size:13px; font-weight:700; text-align:center;"></div>
        </div>
      `;

      scannerModal.style.display = 'flex';

      const self = this;
      const closeBtn = document.getElementById('btn-close-qr-scanner');
      const inputManual = document.getElementById('chef-qr-input-manual');
      const submitManual = document.getElementById('btn-chef-qr-submit-manual');
      const feedback = document.getElementById('chef-qr-scan-feedback');

      function fecharScanner() {
        if (self._scannerInstance) {
          try {
            self._scannerInstance.stop().then(() => {
              self._scannerInstance.clear();
              self._scannerInstance = null;
            }).catch(() => { self._scannerInstance = null; });
          } catch(e) { self._scannerInstance = null; }
        }
        scannerModal.style.display = 'none';
      }

      if (closeBtn) closeBtn.onclick = fecharScanner;

      function emitirSucesso(decodedText) {
        if (feedback) {
          feedback.style.display = 'block';
          feedback.style.background = '#dcfce7';
          feedback.style.color = '#15803d';
          feedback.innerHTML = `✅ Código lido com sucesso!`;
        }
        // Beep de confirmação
        self.tocarBeep();
        setTimeout(() => {
          fecharScanner();
          onScanSuccess(decodedText);
        }, 300);
      }

      if (submitManual && inputManual) {
        submitManual.onclick = () => {
          const val = inputManual.value.trim();
          if (val) emitirSucesso(val);
        };
        inputManual.onkeydown = (e) => {
          if (e.key === 'Enter') {
            const val = inputManual.value.trim();
            if (val) emitirSucesso(val);
          }
        };
      }

      // Inicializa Html5Qrcode se disponível
      if (window.Html5Qrcode) {
        try {
          const html5QrCode = new window.Html5Qrcode("chef-qr-reader-video");
          this._scannerInstance = html5QrCode;
          const config = { fps: 10, qrbox: { width: 220, height: 220 } };

          html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
              emitirSucesso(decodedText);
            },
            (errorMessage) => {
              // Erros contínuos de não-leitura em cada frame são ignorados
            }
          ).catch(err => {
            console.warn('Não foi possível abrir a câmera traseira, tentando padrão:', err);
            html5QrCode.start(
              { facingMode: "user" },
              config,
              (decodedText) => { emitirSucesso(decodedText); }
            ).catch(e => {
              if (feedback) {
                feedback.style.display = 'block';
                feedback.style.background = '#fee2e2';
                feedback.style.color = '#b91c1c';
                feedback.innerHTML = '⚠️ Câmera não acessível. Use o leitor USB ou digite o código acima.';
              }
            });
          });
        } catch(e) {
          console.warn('Erro ao inicializar Html5Qrcode:', e);
        }
      } else {
        // Se a lib ainda não foi carregada no head, tenta carregar dinamicamente
        this._carregarScriptHtml5Qrcode(() => {
          self.abrirScanner(options);
        });
      }
    },

    // Toca som de bip ao autenticar
    tocarBeep: function() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } catch(e) {}
    },

    // Login rápido do colaborador por QR Code
    autenticarColaboradorPorQr: async function(qrString, estacao = 'PDV') {
      try {
        const res = await fetch('/api/auth/qr-login-colaborador', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrcode_token: qrString, estacao })
        });
        const data = await res.json();
        return data;
      } catch(e) {
        return { success: false, error: 'Erro ao conectar ao servidor.' };
      }
    },

    // Identificar Cliente por QR Code
    identificarClientePorQr: async function(qrString) {
      try {
        const res = await fetch('/api/auth/qr-identificar-cliente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ qrcode_token: qrString })
        });
        const data = await res.json();
        return data;
      } catch(e) {
        return { success: false, error: 'Erro ao conectar ao servidor.' };
      }
    },

    // Carregador assíncrono para html5-qrcode caso necessário
    _carregarScriptHtml5Qrcode: function(cb) {
      if (window.Html5Qrcode) return cb && cb();
      const s = document.createElement('script');
      s.src = '/vendor/html5-qrcode/html5-qrcode.min.js';
      s.onload = () => { if (cb) cb(); };
      s.onerror = () => { console.warn('Não foi possível carregar html5-qrcode local.'); };
      document.head.appendChild(s);
    },

    _esc: function(v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
  };

  // Injetar estilos padrão do modal de Crachá e Scanner
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .chef-qr-modal-overlay {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px);
      display: none; align-items: center; justify-content: center; z-index: 999999; padding: 16px;
    }
    .chef-qr-modal-box {
      background: #ffffff; border-radius: 24px; padding: 24px; width: 100%; max-width: 460px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3); animation: chefQrSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      box-sizing: border-box; max-height: 90vh; overflow-y: auto;
    }
    .chef-qr-modal-header {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;
    }
    @keyframes chefQrSlideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes chefQrScanLine {
      0% { top: 0; opacity: 0.8; }
      50% { top: calc(100% - 2px); opacity: 1; }
      100% { top: 0; opacity: 0.8; }
    }
  `;
  document.head.appendChild(styleEl);

  window.ChefQR = ChefQR;
})(window);
