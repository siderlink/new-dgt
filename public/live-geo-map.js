/**
 * live-geo-map.js — Visualizador de Tráfego em Tempo Real & Heatmap Layer
 * Chef Cozinha SaaS — Live View no Super Admin (Estilo Shopify Live View)
 *
 * Cores Obrigatórias:
 * 🟢 Verde Limão (#a3e635 / #ccff00): Acessos ao Site / Visitantes
 * 🔵 Azul (#3b82f6 / #00b4d8): Acessos à tela de Login
 * 🟢 Verde Normal (#22c55e / #16a34a): Login Aprovado / Sessão Ativa
 * 🔥 Heatmap Layer: Camada de Calor Geográfico com gradiente de densidade
 */

(function () {
  'use strict';

  var COLOR_MAP = {
    site: {
      hex: '#a3e635',
      glow: 'rgba(163, 230, 53, 0.85)',
      radar: 'rgba(163, 230, 53, 0.4)',
      label: 'Site / Visitante',
      icon: '🌐'
    },
    login: {
      hex: '#3b82f6',
      glow: 'rgba(59, 130, 246, 0.85)',
      radar: 'rgba(59, 130, 246, 0.4)',
      label: 'Tentativa de Login',
      icon: '🔐'
    },
    login_sucesso: {
      hex: '#22c55e',
      glow: 'rgba(34, 197, 94, 0.85)',
      radar: 'rgba(34, 197, 94, 0.4)',
      label: 'Login Aprovado',
      icon: '✅'
    }
  };

  function LiveGeoMap(containerId, options) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.options = options || {};
    this.viewMode = '3d'; // '3d' (globo) ou '2d' (mapa plano)
    this.heatmapActive = false;
    this.hits = [];
    this.particles = [];
    this.recentHitsList = [];
    this.rotation = { x: 0.25, y: -0.85 };
    this.targetRotation = { x: 0.25, y: -0.85 };
    this.isDragging = false;
    this.lastMouse = { x: 0, y: 0 };
    this.autoRotate = true;
    this.animationId = null;
    this.stats = {
      onlineNow: 0,
      siteHits: 0,
      loginHits: 0,
      loginApproved: 0,
      totalHits: 0
    };

    this.init();
  }

  LiveGeoMap.prototype.init = function () {
    this.buildDOM();
    this.setupCanvases();
    this.bindEvents();
    this.connectSocket();
    this.fetchInitialState();
    this.startAnimationLoop();
  };

  LiveGeoMap.prototype.buildDOM = function () {
    this.container.innerHTML = `
      <div class="live-geo-wrapper">
        <!-- Topbar com KPIs e Controles -->
        <div class="live-geo-header">
          <div class="live-geo-title-box">
            <div class="live-pulse-badge">
              <span class="live-dot"></span>
              <strong>LIVE VIEW</strong>
            </div>
            <span class="live-sub">Monitoramento Geográfico em Tempo Real</span>
          </div>

          <!-- Cards de Métricas Estilo Shopify -->
          <div class="live-kpi-grid">
            <div class="live-kpi-card highlight-glow">
              <span class="kpi-label">Ativos Agora</span>
              <div class="kpi-val" id="kpi-live-online">0</div>
              <span class="kpi-sub">últimos 5 min</span>
            </div>
            <div class="live-kpi-card border-lime">
              <div class="kpi-header-row">
                <span class="kpi-dot dot-lime"></span>
                <span class="kpi-label">Site / Visitantes</span>
              </div>
              <div class="kpi-val" id="kpi-live-site">0</div>
            </div>
            <div class="live-kpi-card border-blue">
              <div class="kpi-header-row">
                <span class="kpi-dot dot-blue"></span>
                <span class="kpi-label">Acessos Login</span>
              </div>
              <div class="kpi-val" id="kpi-live-login">0</div>
            </div>
            <div class="live-kpi-card border-green">
              <div class="kpi-header-row">
                <span class="kpi-dot dot-green"></span>
                <span class="kpi-label">Logins Aprovados</span>
              </div>
              <div class="kpi-val" id="kpi-live-approved">0</div>
            </div>
          </div>

          <!-- Controles de Visualização -->
          <div class="live-controls-bar">
            <div class="live-btn-group">
              <button type="button" class="live-btn active" id="btn-mode-3d" title="Globo 3D Rotativo">🌐 Globo 3D</button>
              <button type="button" class="live-btn" id="btn-mode-2d" title="Mapa Plano 2D">🗺️ Mapa 2D</button>
            </div>
            <button type="button" class="live-btn btn-heatmap-toggle" id="btn-toggle-heatmap">
              <span class="heatmap-flame">🔥</span>
              <span class="heatmap-btn-text">Camada de Calor</span>
              <span class="heatmap-status-pill">OFF</span>
            </button>
            <button type="button" class="live-btn btn-sim-burst" id="btn-simulate-traffic" title="Gerar tráfego de teste">
              ⚡ Simular Tráfego
            </button>
          </div>
        </div>

        <!-- Área Principal de Renderização + Feed Lateral -->
        <div class="live-geo-main-area">
          <!-- Canvas do Globo / Mapa -->
          <div class="live-viewport-container" id="live-viewport">
            <canvas id="live-geo-canvas"></canvas>
            <canvas id="live-heatmap-canvas" class="heatmap-overlay-canvas"></canvas>
            
            <!-- Legenda Flutuante -->
            <div class="live-legend-card">
              <div class="legend-header">Legenda de Atividade</div>
              <div class="legend-item">
                <span class="legend-indicator dot-lime"></span>
                <span>Site / Visitante (Verde Limão)</span>
              </div>
              <div class="legend-item">
                <span class="legend-indicator dot-blue"></span>
                <span>Tentativa Login (Azul)</span>
              </div>
              <div class="legend-item">
                <span class="legend-indicator dot-green"></span>
                <span>Login Aprovado (Verde)</span>
              </div>
              <div class="legend-item heatmap-legend-row" id="heatmap-legend-info" style="display:none;">
                <span class="heat-grad-bar"></span>
                <span>Intensidade Térmica</span>
              </div>
            </div>

            <!-- Dica de Interação -->
            <div class="live-interaction-hint">
              <span>🖱️ Arraste para girar • Role para zoom</span>
            </div>
          </div>

          <!-- Feed de Atividades Recentes ao Vivo -->
          <div class="live-sidebar-feed">
            <div class="feed-header">
              <div class="feed-title">
                <span class="feed-pulse-indicator"></span>
                Fluxo ao Vivo
              </div>
              <span class="feed-count" id="feed-live-count">0 eventos</span>
            </div>
            <div class="feed-list-scroll" id="live-feed-list">
              <div class="feed-empty-state">Aguardando novos acessos...</div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.injectStyles();
  };

  LiveGeoMap.prototype.injectStyles = function () {
    if (document.getElementById('live-geo-styles')) return;
    var style = document.createElement('style');
    style.id = 'live-geo-styles';
    style.innerHTML = `
      .live-geo-wrapper {
        display: flex;
        flex-direction: column;
        gap: 16px;
        background: #090d16;
        border-radius: 16px;
        padding: 20px;
        color: #f1f5f9;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        box-shadow: 0 20px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .live-geo-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 1px solid rgba(255,255,255,0.07);
        padding-bottom: 16px;
      }
      .live-geo-title-box {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .live-pulse-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: rgba(34, 197, 94, 0.12);
        color: #4ade80;
        border: 1px solid rgba(34, 197, 94, 0.3);
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 11px;
        letter-spacing: 0.08em;
        width: fit-content;
      }
      .live-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #22c55e;
        box-shadow: 0 0 10px #22c55e;
        animation: livePulseAnim 1.4s infinite ease-in-out;
      }
      @keyframes livePulseAnim {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.4); opacity: 0.5; }
      }
      .live-sub {
        font-size: 12px;
        color: #94a3b8;
      }
      .live-kpi-grid {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .live-kpi-card {
        background: #111827;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        padding: 10px 16px;
        min-width: 130px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        transition: transform 0.2s, border-color 0.2s;
      }
      .live-kpi-card:hover {
        transform: translateY(-2px);
      }
      .live-kpi-card.highlight-glow {
        background: radial-gradient(circle at top left, rgba(59,130,246,0.18), #111827 80%);
        border-color: rgba(59,130,246,0.4);
      }
      .live-kpi-card.border-lime {
        border-left: 4px solid #a3e635;
      }
      .live-kpi-card.border-blue {
        border-left: 4px solid #3b82f6;
      }
      .live-kpi-card.border-green {
        border-left: 4px solid #22c55e;
      }
      .kpi-header-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .kpi-label {
        font-size: 11px;
        color: #94a3b8;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .kpi-val {
        font-size: 22px;
        font-weight: 700;
        color: #f8fafc;
        line-height: 1.2;
      }
      .kpi-sub {
        font-size: 10px;
        color: #64748b;
      }
      .kpi-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      .dot-lime { background: #a3e635; box-shadow: 0 0 8px #a3e635; }
      .dot-blue { background: #3b82f6; box-shadow: 0 0 8px #3b82f6; }
      .dot-green { background: #22c55e; box-shadow: 0 0 8px #22c55e; }

      .live-controls-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .live-btn-group {
        display: flex;
        background: #111827;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 2px;
      }
      .live-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 12px;
        font-weight: 600;
        padding: 6px 12px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .live-btn:hover {
        color: #f8fafc;
        background: rgba(255,255,255,0.06);
      }
      .live-btn.active {
        background: #1e293b;
        color: #38bdf8;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      }
      .btn-heatmap-toggle {
        background: #1e1b4b;
        border: 1px solid rgba(139, 92, 246, 0.4);
        color: #e0e7ff;
      }
      .btn-heatmap-toggle.active {
        background: linear-gradient(135deg, #f97316, #ef4444);
        color: #fff;
        border-color: #f97316;
        box-shadow: 0 0 16px rgba(249, 115, 22, 0.5);
      }
      .heatmap-status-pill {
        font-size: 9px;
        background: rgba(0,0,0,0.3);
        padding: 2px 6px;
        border-radius: 999px;
        font-weight: 700;
      }
      .btn-sim-burst {
        background: rgba(56, 189, 248, 0.1);
        border: 1px solid rgba(56, 189, 248, 0.3);
        color: #38bdf8;
      }
      .btn-sim-burst:hover {
        background: rgba(56, 189, 248, 0.2);
      }

      .live-geo-main-area {
        display: grid;
        grid-template-columns: 1fr 320px;
        gap: 16px;
        height: 540px;
      }
      @media (max-width: 1024px) {
        .live-geo-main-area {
          grid-template-columns: 1fr;
          height: auto;
        }
      }
      .live-viewport-container {
        position: relative;
        background: radial-gradient(circle at center, #0d1527 0%, #060911 100%);
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.06);
        cursor: grab;
        min-height: 480px;
      }
      .live-viewport-container:active {
        cursor: grabbing;
      }
      #live-geo-canvas, #live-heatmap-canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
      }
      .heatmap-overlay-canvas {
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.4s ease;
      }
      .heatmap-overlay-canvas.visible {
        opacity: 0.85;
      }

      .live-legend-card {
        position: absolute;
        bottom: 16px;
        left: 16px;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px;
        padding: 10px 14px;
        font-size: 11px;
        color: #cbd5e1;
        display: flex;
        flex-direction: column;
        gap: 6px;
        pointer-events: none;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      }
      .legend-header {
        font-weight: 700;
        color: #f1f5f9;
        font-size: 11px;
        margin-bottom: 2px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .legend-item {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .legend-indicator {
        width: 10px;
        height: 10px;
        border-radius: 50%;
      }
      .heat-grad-bar {
        width: 48px;
        height: 8px;
        border-radius: 4px;
        background: linear-gradient(90deg, #3b82f6, #06b6d4, #a3e635, #eab308, #ef4444);
      }

      .live-interaction-hint {
        position: absolute;
        bottom: 16px;
        right: 16px;
        font-size: 11px;
        color: #64748b;
        background: rgba(15, 23, 42, 0.7);
        padding: 4px 10px;
        border-radius: 6px;
        pointer-events: none;
      }

      .live-sidebar-feed {
        background: #0f172a;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.06);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .feed-header {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #131d33;
      }
      .feed-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
        font-size: 12px;
        color: #f8fafc;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .feed-pulse-indicator {
        width: 6px;
        height: 6px;
        background: #38bdf8;
        border-radius: 50%;
        box-shadow: 0 0 8px #38bdf8;
      }
      .feed-count {
        font-size: 10px;
        color: #94a3b8;
        background: rgba(255,255,255,0.08);
        padding: 2px 6px;
        border-radius: 4px;
      }
      .feed-list-scroll {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .feed-item {
        background: #1e293b;
        border-radius: 8px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        border-left: 3px solid #64748b;
        animation: feedSlideIn 0.3s ease-out;
        transition: background 0.2s;
      }
      .feed-item:hover {
        background: #243248;
      }
      .feed-item.type-site { border-left-color: #a3e635; }
      .feed-item.type-login { border-left-color: #3b82f6; }
      .feed-item.type-login_sucesso { border-left-color: #22c55e; }
      
      @keyframes feedSlideIn {
        from { transform: translateX(20px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .feed-row-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
      }
      .feed-city {
        font-weight: 600;
        color: #f8fafc;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .feed-time {
        font-size: 10px;
        color: #64748b;
      }
      .feed-badge {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 600;
        width: fit-content;
      }
      .badge-site { background: rgba(163, 230, 53, 0.15); color: #a3e635; }
      .badge-login { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
      .badge-login_sucesso { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
      .feed-empty-state {
        color: #64748b;
        font-size: 12px;
        text-align: center;
        margin-top: 40px;
      }
    `;
    document.head.appendChild(style);
  };

  LiveGeoMap.prototype.setupCanvases = function () {
    this.viewport = document.getElementById('live-viewport');
    this.canvas = document.getElementById('live-geo-canvas');
    this.heatCanvas = document.getElementById('live-heatmap-canvas');
    if (!this.canvas || !this.viewport) return;

    this.ctx = this.canvas.getContext('2d');
    this.heatCtx = this.heatCanvas.getContext('2d');

    this.resizeCanvases();
    window.addEventListener('resize', this.resizeCanvases.bind(this));
  };

  LiveGeoMap.prototype.resizeCanvases = function () {
    if (!this.viewport || !this.canvas) return;
    var rect = this.viewport.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);

    this.heatCanvas.width = this.width * dpr;
    this.heatCanvas.height = this.height * dpr;
    this.heatCtx.scale(dpr, dpr);
  };

  LiveGeoMap.prototype.bindEvents = function () {
    var self = this;

    // Alternar 3D vs 2D
    var btn3d = document.getElementById('btn-mode-3d');
    var btn2d = document.getElementById('btn-mode-2d');
    if (btn3d && btn2d) {
      btn3d.addEventListener('click', function () {
        self.viewMode = '3d';
        btn3d.classList.add('active');
        btn2d.classList.remove('active');
      });
      btn2d.addEventListener('click', function () {
        self.viewMode = '2d';
        btn2d.classList.add('active');
        btn3d.classList.remove('active');
      });
    }

    // Toggle Heatmap Layer
    var btnHeat = document.getElementById('btn-toggle-heatmap');
    if (btnHeat) {
      btnHeat.addEventListener('click', function () {
        self.heatmapActive = !self.heatmapActive;
        var pill = btnHeat.querySelector('.heatmap-status-pill');
        var legendInfo = document.getElementById('heatmap-legend-info');

        if (self.heatmapActive) {
          btnHeat.classList.add('active');
          if (pill) pill.textContent = 'ON';
          if (legendInfo) legendInfo.style.display = 'flex';
          self.heatCanvas.classList.add('visible');
        } else {
          btnHeat.classList.remove('active');
          if (pill) pill.textContent = 'OFF';
          if (legendInfo) legendInfo.style.display = 'none';
          self.heatCanvas.classList.remove('visible');
        }
      });
    }

    // Simulação de Tráfego de Teste
    var btnSim = document.getElementById('btn-simulate-traffic');
    if (btnSim) {
      btnSim.addEventListener('click', function () {
        btnSim.disabled = true;
        btnSim.textContent = '⏳ Gerando...';
        fetch('/api/super/geo-traffic/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: 6 })
        })
          .then(function (r) { return r.json(); })
          .then(function () {
            btnSim.disabled = false;
            btnSim.innerHTML = '⚡ Simular Tráfego';
          })
          .catch(function () {
            btnSim.disabled = false;
            btnSim.innerHTML = '⚡ Simular Tráfego';
          });
      });
    }

    // Interação com Mouse (Girar Globo)
    if (this.viewport) {
      this.viewport.addEventListener('mousedown', function (e) {
        self.isDragging = true;
        self.lastMouse = { x: e.clientX, y: e.clientY };
        self.autoRotate = false;
      });

      window.addEventListener('mousemove', function (e) {
        if (!self.isDragging) return;
        var dx = e.clientX - self.lastMouse.x;
        var dy = e.clientY - self.lastMouse.y;
        self.targetRotation.y += dx * 0.005;
        self.targetRotation.x += dy * 0.005;
        self.targetRotation.x = Math.max(-1.4, Math.min(1.4, self.targetRotation.x));
        self.lastMouse = { x: e.clientX, y: e.clientY };
      });

      window.addEventListener('mouseup', function () {
        self.isDragging = false;
        setTimeout(function () {
          if (!self.isDragging) self.autoRotate = true;
        }, 5000);
      });
    }
  };

  LiveGeoMap.prototype.connectSocket = function () {
    var self = this;
    var socket = window.superAdminSocket || window.socket || (typeof io !== 'undefined' ? io() : null);
    if (!socket || typeof socket.on !== 'function') return;

    socket.on('geo_traffic_hit', function (hit) {
      self.onNewHit(hit);
    });
  };

  LiveGeoMap.prototype.fetchInitialState = function () {
    var self = this;
    fetch('/api/super/geo-traffic/live')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.stats) {
          self.stats = data.stats;
          self.updateKPIs();
        }
        if (data && Array.isArray(data.recentHits)) {
          data.recentHits.forEach(function (h) {
            self.onNewHit(h, true);
          });
        }
      })
      .catch(function (err) {
        console.warn('[LiveGeoMap] Erro ao carregar dados iniciais:', err);
      });
  };

  LiveGeoMap.prototype.onNewHit = function (hit, isBatch) {
    if (!hit) return;

    // Adiciona partícula animada
    this.particles.push({
      hit: hit,
      born: Date.now(),
      lifetime: 4000,
      radarRadius: 0,
      beamHeight: 0
    });

    // Mantém no histórico recente
    this.recentHitsList.unshift(hit);
    if (this.recentHitsList.length > 50) this.recentHitsList.pop();

    if (!isBatch) {
      this.stats.onlineNow++;
      this.stats.totalHits++;
      if (hit.tipo === 'site') this.stats.siteHits++;
      else if (hit.tipo === 'login') this.stats.loginHits++;
      else if (hit.tipo === 'login_sucesso') this.stats.loginApproved++;

      this.updateKPIs();
      this.appendFeedItem(hit);
    }
  };

  LiveGeoMap.prototype.updateKPIs = function () {
    var elOnline = document.getElementById('kpi-live-online');
    var elSite = document.getElementById('kpi-live-site');
    var elLogin = document.getElementById('kpi-live-login');
    var elApproved = document.getElementById('kpi-live-approved');
    var elCount = document.getElementById('feed-live-count');

    if (elOnline) elOnline.textContent = this.stats.onlineNow || 0;
    if (elSite) elSite.textContent = this.stats.siteHits || 0;
    if (elLogin) elLogin.textContent = this.stats.loginHits || 0;
    if (elApproved) elApproved.textContent = this.stats.loginApproved || 0;
    if (elCount) elCount.textContent = this.recentHitsList.length + ' eventos';
  };

  LiveGeoMap.prototype.appendFeedItem = function (hit) {
    var feedList = document.getElementById('live-feed-list');
    if (!feedList) return;

    var emptyState = feedList.querySelector('.feed-empty-state');
    if (emptyState) emptyState.remove();

    var colorInfo = COLOR_MAP[hit.tipo] || COLOR_MAP.site;
    var timeStr = new Date(hit.timestamp || Date.now()).toLocaleTimeString('pt-BR');

    var item = document.createElement('div');
    item.className = 'feed-item type-' + hit.tipo;
    item.innerHTML = `
      <div class="feed-row-top">
        <span class="feed-city">${colorInfo.icon} ${hit.cidade || 'São Paulo'}, ${hit.estado || 'SP'}</span>
        <span class="feed-time">${timeStr}</span>
      </div>
      <div class="feed-badge badge-${hit.tipo}">${colorInfo.label}</div>
    `;

    feedList.insertBefore(item, feedList.firstChild);

    while (feedList.children.length > 25) {
      feedList.removeChild(feedList.lastChild);
    }
  };

  LiveGeoMap.prototype.startAnimationLoop = function () {
    var self = this;
    function loop() {
      self.render();
      self.animationId = requestAnimationFrame(loop);
    }
    loop();
  };

  LiveGeoMap.prototype.render = function () {
    if (!this.ctx) return;

    this.ctx.clearRect(0, 0, this.width, this.height);

    if (this.autoRotate && !this.isDragging) {
      this.targetRotation.y += 0.002;
    }
    this.rotation.x += (this.targetRotation.x - this.rotation.x) * 0.1;
    this.rotation.y += (this.targetRotation.y - this.rotation.y) * 0.1;

    if (this.viewMode === '3d') {
      this.render3DGlobe();
    } else {
      this.render2DMap();
    }

    if (this.heatmapActive) {
      this.renderHeatmapLayer();
    } else {
      this.heatCtx.clearRect(0, 0, this.width, this.height);
    }
  };

  // Renderização do Globo 3D com malha de pontos e feixes de luz
  LiveGeoMap.prototype.render3DGlobe = function () {
    var ctx = this.ctx;
    var cx = this.width / 2;
    var cy = this.height / 2;
    var radius = Math.min(this.width, this.height) * 0.38;

    // Atmosfera e Brilho do Globo
    var grad = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.25);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.06)');
    grad.addColorStop(0.8, 'rgba(56, 189, 248, 0.15)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.25, 0, Math.PI * 2);
    ctx.fill();

    // Superfície do Globo
    var sphereGrad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
    sphereGrad.addColorStop(0, '#13203c');
    sphereGrad.addColorStop(0.7, '#0b1325');
    sphereGrad.addColorStop(1, '#050a14');
    ctx.fillStyle = sphereGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Grade de Meridianos e Paralelos
    this.renderGlobeGrid(cx, cy, radius);

    // Renderizar Pontos de Tráfego e Feixes de Luz
    this.renderTrafficPoints3D(cx, cy, radius);
  };

  LiveGeoMap.prototype.renderGlobeGrid = function (cx, cy, radius) {
    var ctx = this.ctx;
    var rotX = this.rotation.x;
    var rotY = this.rotation.y;

    ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';

    // Matriz de pontos na esfera
    var step = 15;
    for (var lat = -75; lat <= 75; lat += step) {
      var phi = (lat * Math.PI) / 180;
      var cosPhi = Math.cos(phi);
      var sinPhi = Math.sin(phi);

      for (var lng = -180; lng < 180; lng += step) {
        var theta = ((lng * Math.PI) / 180) + rotY;

        var x = radius * cosPhi * Math.sin(theta);
        var y = -radius * sinPhi;
        var z = radius * cosPhi * Math.cos(theta);

        // Rotação no eixo X
        var yRot = y * Math.cos(rotX) - z * Math.sin(rotX);
        var zRot = y * Math.sin(rotX) + z * Math.cos(rotX);

        if (zRot > 0) { // Somente hemisfério visível
          var alpha = (zRot / radius) * 0.4;
          ctx.fillStyle = 'rgba(148, 163, 184, ' + alpha + ')';
          ctx.fillRect(cx + x - 1, cy + yRot - 1, 2, 2);
        }
      }
    }
  };

  LiveGeoMap.prototype.renderTrafficPoints3D = function (cx, cy, radius) {
    var ctx = this.ctx;
    var now = Date.now();
    var rotX = this.rotation.x;
    var rotY = this.rotation.y;

    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      var age = now - p.born;
      if (age > p.lifetime) {
        this.particles.splice(i, 1);
        continue;
      }

      var hit = p.hit;
      var lat = hit.lat || -23.5505;
      var lng = hit.lng || -46.6333;

      var phi = (lat * Math.PI) / 180;
      var theta = ((lng * Math.PI) / 180) + rotY;

      var cosPhi = Math.cos(phi);
      var sinPhi = Math.sin(phi);

      var x = radius * cosPhi * Math.sin(theta);
      var y = -radius * sinPhi;
      var z = radius * cosPhi * Math.cos(theta);

      var yRot = y * Math.cos(rotX) - z * Math.sin(rotX);
      var zRot = y * Math.sin(rotX) + z * Math.cos(rotX);

      if (zRot > -radius * 0.1) {
        var screenX = cx + x;
        var screenY = cy + yRot;
        var colorInfo = COLOR_MAP[hit.tipo] || COLOR_MAP.site;
        var progress = age / p.lifetime;
        var fadeAlpha = 1 - progress;

        // 1. Feixe de Luz Vertical (Pillar Beam)
        var beamMaxHeight = 45;
        var currentBeamH = Math.min(beamMaxHeight, (age / 300) * beamMaxHeight);
        var beamGrad = ctx.createLinearGradient(screenX, screenY, screenX, screenY - currentBeamH);
        beamGrad.addColorStop(0, colorInfo.glow);
        beamGrad.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.strokeStyle = beamGrad;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX, screenY - currentBeamH);
        ctx.stroke();

        // 2. Onda Radar Pulsante no Chão
        var maxRadar = 24;
        var radarR = (progress * maxRadar);
        ctx.strokeStyle = colorInfo.radar;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(screenX, screenY, radarR, 0, Math.PI * 2);
        ctx.stroke();

        // 3. Ponto Central Brilhante
        ctx.fillStyle = colorInfo.hex;
        ctx.shadowColor = colorInfo.hex;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  };

  // Renderização 2D (Mapa Plano Equiretangular)
  LiveGeoMap.prototype.render2DMap = function () {
    var ctx = this.ctx;
    var w = this.width;
    var h = this.height;

    // Fundo do mapa plano
    ctx.fillStyle = '#0a101d';
    ctx.fillRect(0, 0, w, h);

    // Grade de coordenadas
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (var x = 0; x < w; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (var y = 0; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Projeção dos Pontos
    var now = Date.now();
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      var age = now - p.born;
      if (age > p.lifetime) continue;

      var hit = p.hit;
      var lat = hit.lat || -23.5505;
      var lng = hit.lng || -46.6333;

      var px = ((lng + 180) / 360) * w;
      var py = ((90 - lat) / 180) * h;

      var colorInfo = COLOR_MAP[hit.tipo] || COLOR_MAP.site;
      var progress = age / p.lifetime;

      // Onda de Radar
      ctx.strokeStyle = colorInfo.radar;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, progress * 30, 0, Math.PI * 2);
      ctx.stroke();

      // Ponto Central
      ctx.fillStyle = colorInfo.hex;
      ctx.shadowColor = colorInfo.hex;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  };

  // Renderização da Camada de Mapa de Calor (Heatmap Layer)
  LiveGeoMap.prototype.renderHeatmapLayer = function () {
    var hctx = this.heatCtx;
    var w = this.width;
    var h = this.height;

    hctx.clearRect(0, 0, w, h);

    // Cria pontos de calor cumulativos
    var points = this.recentHitsList.slice(0, 30);
    if (points.length === 0) return;

    points.forEach(function (hit) {
      var lat = hit.lat || -23.5505;
      var lng = hit.lng || -46.6333;

      var px, py;
      if (this.viewMode === '2d') {
        px = ((lng + 180) / 360) * w;
        py = ((90 - lat) / 180) * h;
      } else {
        var cx = w / 2;
        var cy = h / 2;
        var radius = Math.min(w, h) * 0.38;
        var phi = (lat * Math.PI) / 180;
        var theta = ((lng * Math.PI) / 180) + this.rotation.y;
        var x = radius * Math.cos(phi) * Math.sin(theta);
        var y = -radius * Math.sin(phi);
        var z = radius * Math.cos(phi) * Math.cos(theta);
        var yRot = y * Math.cos(this.rotation.x) - z * Math.sin(this.rotation.x);
        var zRot = y * Math.sin(this.rotation.x) + z * Math.cos(this.rotation.x);

        if (zRot <= 0) return; // Fora do campo de visão
        px = cx + x;
        py = cy + yRot;
      }

      var heatRadius = 60;
      var radGrad = hctx.createRadialGradient(px, py, 0, px, py, heatRadius);
      radGrad.addColorStop(0, 'rgba(239, 68, 68, 0.85)'); // Vermelho
      radGrad.addColorStop(0.25, 'rgba(234, 179, 8, 0.7)'); // Amarelo
      radGrad.addColorStop(0.5, 'rgba(163, 230, 53, 0.5)'); // Verde Limão
      radGrad.addColorStop(0.75, 'rgba(6, 182, 212, 0.3)'); // Ciano
      radGrad.addColorStop(1, 'rgba(59, 130, 246, 0)'); // Azul fade

      hctx.fillStyle = radGrad;
      hctx.beginPath();
      hctx.arc(px, py, heatRadius, 0, Math.PI * 2);
      hctx.fill();
    }.bind(this));
  };

  LiveGeoMap.prototype.destroy = function () {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  };

  window.LiveGeoMap = LiveGeoMap;
})();
