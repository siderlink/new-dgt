/**
 * server-prod.js - Versao de producao do servidor Chef Cozinha
 * Serve os arquivos estaticos da pasta /dist e abre o browser automaticamente.
 * Nao usa Vite - roda diretamente com Node.js ou como executavel pkg.
 */
const logLines = [];
const activeSockets = new Map();
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
  const line = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  logLines.push(`[LOG] ${new Date().toLocaleTimeString()} - ${line}`);
  if (logLines.length > 100) logLines.shift();
  originalLog.apply(console, args);
};

console.error = function(...args) {
  const line = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  logLines.push(`[ERR] ${new Date().toLocaleTimeString()} - ${line}`);
  if (logLines.length > 100) logLines.shift();
  originalError.apply(console, args);
};

function getLocalTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getLocalDateOnly() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const mesasFechando = new Set();
let pedidosDebounceTimeout = null;
let mpCurrentIntentId = null;
let mpCurrentDeviceId = null;
function broadcastPedidos() {
  if (pedidosDebounceTimeout) clearTimeout(pedidosDebounceTimeout);
  pedidosDebounceTimeout = setTimeout(() => {
    db.all(`SELECT * FROM pedidos WHERE status != 'Finalizado'`, (e, r) => {
      if(!e) io.emit('pedidos_atualizados', r || []);
    });
  }, 300);
}

function broadcastFormasPagamento(targetSocket = null) {
  db.all(`SELECT * FROM formas_pagamento ORDER BY ordem ASC, id ASC`, [], (err, rows) => {
    if (!err) {
      if (targetSocket) {
        targetSocket.emit('formas_pagamento_atualizadas', rows || []);
      } else {
        io.emit('formas_pagamento_atualizadas', rows || []);
      }
    }
  });
}

function parseUserAgent(ua) {
  if (!ua) return { os: 'Desconhecido', browser: 'Navegador Web', model: 'Dispositivo Web', isMobile: false, icon: 'ph-desktop', fullDeviceStr: 'Computador (Navegador)' };

  let os = 'Windows PC';
  if (/windows nt 10/i.test(ua)) os = 'Windows 10/11';
  else if (/windows/i.test(ua)) os = 'Windows PC';
  else if (/android/i.test(ua)) os = 'Android OS';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS (Apple)';
  else if (/mac os/i.test(ua)) os = 'macOS (Apple)';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Chrome';
  if (/edg/i.test(ua)) browser = 'Microsoft Edge';
  else if (/chrome|crios/i.test(ua)) browser = 'Google Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Apple Safari';
  else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox';

  let model = 'Computador / Terminal Desktop';
  let isMobile = false;
  let icon = 'ph-desktop';

  if (/mobile|android|iphone|ipad/i.test(ua)) {
    isMobile = true;
    icon = 'ph-device-mobile';
    if (/iphone/i.test(ua)) { model = 'iPhone (Apple)'; icon = 'ph-device-mobile'; }
    else if (/ipad/i.test(ua)) { model = 'iPad (Apple Tablet)'; icon = 'ph-device-tablet'; }
    else if (/samsung/i.test(ua)) { model = 'Samsung Galaxy'; icon = 'ph-device-mobile'; }
    else if (/xiaomi|mi /i.test(ua)) { model = 'Xiaomi Redmi'; icon = 'ph-device-mobile'; }
    else if (/motorola|moto/i.test(ua)) { model = 'Motorola Moto'; icon = 'ph-device-mobile'; }
    else { model = 'Smartphone Android'; icon = 'ph-device-mobile'; }
  }

  return { os, browser, model, isMobile, icon, fullDeviceStr: `${model} (${os} / ${browser})` };
}

function getTempoConectadoStr(startTime) {
  if (!startTime) return 'Há pouco';
  const diffSec = Math.floor((Date.now() - startTime) / 1000);
  if (diffSec < 60) return `${diffSec} seg.`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min.`;
  const diffHours = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  return `${diffHours}h ${remMin}m`;
}

let lastProdutos = null;
let lastConfig = null;

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const os = require('os');
let sqlite3;
try {
  sqlite3 = require('sqlite3').verbose();
  const _test = new sqlite3.Database(':memory:');
} catch (e) {
  sqlite3 = require('./sqlite3-adapter').verbose();
}
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const nfceService = require('./nfce-service');
const iaService = require('./ia-service');

// Carrega variáveis do arquivo .env (sem dependência externa)
try {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    });
  }
} catch (e) {
  console.error('[Startup] Erro ao carregar .env:', e.message);
}

// Carregar configuracao da licenca e URL do Apps Script antes de importar o license-manager

// Diretório de dados da instalação, por plataforma:
//   - Windows: %APPDATA%\ChefCozinha  (C:\Users\<user>\AppData\Roaming\ChefCozinha)
//   - Linux:   $XDG_DATA_HOME/ChefCozinha ou ~/.local/share/ChefCozinha
//   - Override: CHEF_DATA_DIR força qualquer caminho (testes/instalação custom)
function getDataDir() {
  if (process.env.CHEF_DATA_DIR) return process.env.CHEF_DATA_DIR;
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'ChefCozinha');
  }
  if (process.platform === 'linux' || process.platform === 'darwin') {
    const xdg = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    return path.join(xdg, 'ChefCozinha');
  }
  return path.join(os.homedir(), '.chefcozinha');
}

const LICENSE_CONFIG_FILE = path.join(getDataDir(), 'license-config.json');
try {
  if (fs.existsSync(LICENSE_CONFIG_FILE)) {
    const cfg = JSON.parse(fs.readFileSync(LICENSE_CONFIG_FILE, 'utf8'));
    if (cfg.scriptUrl) process.env.LICENSE_URL = cfg.scriptUrl;
    if (cfg.hubUrl) process.env.CHEF_HUB_URL = cfg.hubUrl;
  }
} catch (e) {
  console.error('[Startup] Erro ao carregar URL da licenca:', e.message);
}

const licenseManager = require('./license-manager');

// ---------- PATHS ----------
// pkg: __dirname é a pasta do .exe
const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const DIST_DIR = path.join(BASE_DIR, 'dist');

// Em producao (pkg), usar o diretório de dados por plataforma (AppData no
// Windows, XDG no Linux). Fora do pkg: no Windows mantém a pasta do projeto
// (fluxo de desenvolvimento); no Linux sempre usa o diretório XDG padrão.
const isPkg = typeof process.pkg !== 'undefined';
const APP_DATA_DIR = (isPkg || process.platform !== 'win32') ? getDataDir() : BASE_DIR;

const DB_PATH  = path.join(APP_DATA_DIR, 'database.sqlite');
const UPLOAD_DIR = path.join(APP_DATA_DIR, 'uploads');

if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });

const app  = express();

app.use(cors());
app.use(express.json());

// Middleware global para registrar acessos à API (Quem, O Que, Pra Onde)
app.use('/api', (req, res, next) => {
  const start = Date.now();
  const operador = req.headers['x-user'] || req.headers['x-operador'] || req.query.user || (req.body && req.body.operador) || 'Sistema / API';
  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
  const ip = rawIp.replace('::ffff:', '');

  res.on('finish', () => {
    let payload = '';
    if (req.method !== 'GET') {
      try {
        const bodyCopy = { ...req.body };
        if (bodyCopy.senha) bodyCopy.senha = '***';
        if (bodyCopy.cert_senha) bodyCopy.cert_senha = '***';
        payload = JSON.stringify(bodyCopy).substring(0, 300);
      } catch(e){}
    } else {
      try { payload = JSON.stringify(req.query || {}).substring(0, 300); } catch(e){}
    }

    db.run(
      `INSERT INTO api_logs (operador, ip, metodo, endpoint, detalhes, status_code) VALUES (?, ?, ?, ?, ?, ?)`,
      [operador, ip, req.method, req.originalUrl || req.url, payload, res.statusCode]
    );
  });
  next();
});

app.use((req, res, next) => {
  const origSetHeader = res.setHeader.bind(res);
  res.setHeader = (name, val) => {
    if (name && name.toLowerCase() === 'content-type' && typeof val === 'string' && !val.includes('charset')) {
      const textTypes = ['text/', 'application/javascript', 'application/json', 'application/xml'];
      if (textTypes.some(t => val.startsWith(t))) val += '; charset=utf-8';
    }
    return origSetHeader(name, val);
  };
  next();
});

// (Segurança) Rejeita path traversal e bloqueia extensões sensíveis
const PROD_BLOCKED_STATIC_EXTS = [
  '.sqlite', '.sqlite-wal', '.sqlite-shm', '.db', '.db-wal', '.db-shm',
  '.pfx', '.p12', '.pem', '.crt', '.key', '.cer', '.env', '.log', '.ini',
  '.bat', '.cmd', '.ps1', '.sh', '.zip', '.rar', '.7z', '.gz', '.tgz', '.tar',
  '.exe', '.msi', '.jar', '.apk', '.dll', '.so', '.dylib', '.deb', '.pkg',
  '.dmg', '.iso', '.war', '.ear', '.jks', '.keystore'
];
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let raw = (req.url || '/').split('?')[0];
  let decoded = '';
  try { decoded = decodeURIComponent(raw); } catch (e) { decoded = raw; }
  decoded = decoded.replace(/\\/g, '/');
  if (decoded.split('/').includes('..')) return res.status(403).send('Acesso negado.');
  const lower = decoded.toLowerCase();
  if (PROD_BLOCKED_STATIC_EXTS.some(b => lower.endsWith(b))) return res.status(403).send('Acesso negado.');
  next();
});

// Servir arquivos estáticos (dist, public e raiz do projeto para scripts avulsos como login.js)

// ── Telemetria de Cliques ──
app.post('/api/telemetria/clicks', express.json({ limit: '1mb' }), (req, res) => {
  const clicks = (req.body && req.body.clicks) || [];
  if (Array.isArray(clicks) && clicks.length > 0) {
    clicks.forEach(c => {
      console.log(`👆 [CLIQUE/AÇÃO] ${c.restaurante_nome || 'Restaurante'} | ${c.colaborador_nome || 'Colaborador'} (${c.colaborador_cargo || 'Op'}) -> "${c.funcao_nome || c.elemento_id}" em [${c.tela}] (${c.dispositivo || 'Web'})`);
    });
  }
  res.json({ ok: true, count: clicks.length });
});

app.use(express.static(DIST_DIR));
app.use(express.static(path.join(BASE_DIR, 'public')));
app.use(express.static(BASE_DIR));

const https = require('https');
const tls = require('tls');
let server;
let serverHttp = null; // HTTP secundário (compatibilidade: clientes antigos / QR http)
let isHttps = false;
let activeCertInfo = null;

// Gerenciamento de certificados (.pfx). A pasta de certificados fica no
// diretório de dados da instalação (AppData no Windows, XDG no Linux), onde é
// gravável. O cert.pfx "legado" na pasta do app (gerado pelo instalador) segue
// como fallback quando não há nenhum ativo configurado.
const CERTS_DIR = path.join(APP_DATA_DIR, 'certs');
const CERTS_CFG = path.join(CERTS_DIR, 'ativo.txt');
const CERT_PASSPHRASE = 'chefcozinha';

function ensureCertsDir() {
  try { if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true }); } catch (e) { }
}

function getActiveCertConfig() {
  try {
    if (fs.existsSync(CERTS_CFG)) {
      const raw = fs.readFileSync(CERTS_CFG, 'utf8').trim();
      if (raw) {
        const parts = raw.split('|');
        const f = String(parts[0] || '').trim();
        if (f && !f.includes('/') && !f.includes('\\') && !f.includes('..') && fs.existsSync(path.join(CERTS_DIR, f))) {
          return { file: f, passphrase: (parts[1] || CERT_PASSPHRASE).trim() };
        }
      }
    }
  } catch (e) { }
  const legacy = path.join(BASE_DIR, 'cert.pfx');
  if (fs.existsSync(legacy)) {
    return { file: 'cert.pfx', passphrase: CERT_PASSPHRASE, legacy: true };
  }
  return null;
}

function loadCertInfo(cfg) {
  if (!cfg) return null;
  const p = cfg.legacy ? path.join(BASE_DIR, 'cert.pfx') : path.join(CERTS_DIR, cfg.file);
  if (!fs.existsSync(p)) return null;
  try {
    return { pfx: fs.readFileSync(p), passphrase: cfg.passphrase };
  } catch (e) { return null; }
}

function saveActiveCertConfig(file, passphrase) {
  ensureCertsDir();
  fs.writeFileSync(CERTS_CFG, `${file}|${passphrase || CERT_PASSPHRASE}`, 'utf8');
}

// Aplica um certificado. Se o servidor já estiver HTTPS, troca AO VIVO
// (server.setSecureContext) sem derrubar conexões. Se estiver HTTP, salva a
// configuração e exige reinício.
function aplicarCert(cfg) {
  const info = loadCertInfo(cfg);
  if (!info) return { ok: false, erro: 'Arquivo de certificado não encontrado ou inválido.' };
  try {
    const contextOpts = { pfx: info.pfx, passphrase: info.passphrase };
    tls.createSecureContext(contextOpts);
    if (server && isHttps && typeof server.setSecureContext === 'function') {
      server.setSecureContext(contextOpts);
      activeCertInfo = { file: cfg.file, passphrase: cfg.passphrase, applied: true };
      saveActiveCertConfig(cfg.file, cfg.passphrase);
      return { ok: true, applied: true };
    }
    saveActiveCertConfig(cfg.file, cfg.passphrase);
    activeCertInfo = { file: cfg.file, passphrase: cfg.passphrase, applied: false };
    return { ok: true, applied: false, reiniciar: true };
  } catch (e) {
    return { ok: false, erro: 'Falha ao ler o certificado: ' + (e.message || e) };
  }
}

// Pergunta no início do servidor qual certificado usar. Só pergunta se houver
// terminal (stdin TTY). Caso contrário (systemd, serviço) usa o cert ativo
// persistido em certs/ativo.txt, ou o primeiro da pasta certs/.
function promptCertAtStartup() {
  ensureCertsDir();
  let candidates = [];
  try { candidates = fs.readdirSync(CERTS_DIR).filter(f => /\.(pfx|p12)$/i.test(f)); } catch (e) { }
  candidates.sort();
  const legacyPfx = path.join(BASE_DIR, 'cert.pfx');
  if (fs.existsSync(legacyPfx) && !candidates.includes('cert.pfx')) candidates.unshift('cert.pfx');
  if (candidates.length === 0) return null;

  let active = getActiveCertConfig();
  if (active && !candidates.includes(active.file)) active = null;
  let chosenFile = active ? active.file : candidates[0];

  let passphrase = CERT_PASSPHRASE;
  if (active && active.file === chosenFile) passphrase = active.passphrase;
  return { file: chosenFile, passphrase };
}

const activeCertConfig = promptCertAtStartup();
const activeCertLoaded = activeCertConfig ? loadCertInfo(activeCertConfig) : null;
if (activeCertLoaded) {
  try {
    server = https.createServer({ pfx: activeCertLoaded.pfx, passphrase: activeCertLoaded.passphrase }, app);
    serverHttp = http.createServer(app);
    isHttps = true;
    activeCertInfo = { file: activeCertConfig.file, passphrase: activeCertConfig.passphrase, applied: true };
    saveActiveCertConfig(activeCertConfig.file, activeCertConfig.passphrase);
  } catch (e) {
    console.error("Erro ao carregar SSL, caindo para HTTP", e);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
if (serverHttp) io.attach(serverHttp);

// Protocolo efetivo da instalação (HTTPS quando há cert ativo).
// O sync-prod.js corta a seção do server.js onde PROTOCOL é definido, então o
// executável empacotado precisa deste símbolo aqui no header.
const PROTOCOL = isHttps ? 'https' : 'http';

// ---------- DATABASE ----------
function getTenantDbPath(tenantId) {
  return path.join(APP_DATA_DIR, 'estabelecimentos', String(tenantId), 'database.sqlite');
}

const tenantDbs = new Map();

// (Segurança) Garante que o banco do tenant 1 (padrão) existe
const DB1_PATH = getTenantDbPath(1);
if (!fs.existsSync(path.dirname(DB1_PATH))) {
  fs.mkdirSync(path.dirname(DB1_PATH), { recursive: true });
}
if (!fs.existsSync(DB1_PATH) && fs.existsSync(DB_PATH)) {
  fs.copyFileSync(DB_PATH, DB1_PATH);
}

function getTenantDb() {
  const tenantId = tenantContext.getStore() || 1;
  if (!tenantDbs.has(tenantId)) {
    const dbPath = getTenantDbPath(tenantId);
    
    if (!fs.existsSync(dbPath)) {
      const parentDir = path.dirname(dbPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      const db1Path = getTenantDbPath(1);
      if (fs.existsSync(db1Path)) {
        fs.copyFileSync(db1Path, dbPath);
      }
    }
    
    const newDb = new sqlite3.Database(dbPath, (err) => {
      if (err) console.error(`Erro ao abrir banco do tenant ${tenantId}:`, err);
    });
    
    newDb.serialize(() => {
      newDb.run('PRAGMA journal_mode = WAL;');
      newDb.run('PRAGMA synchronous = NORMAL;');
      newDb.run('PRAGMA busy_timeout = 5000;');
      newDb.run('PRAGMA cache_size = -20000;');
      newDb.run('PRAGMA temp_store = MEMORY;');
    });
    tenantDbs.set(tenantId, newDb);
  }
  return tenantDbs.get(tenantId);
}

const db = {
  run: function(...args) { return getTenantDb().run(...args); },
  all: function(...args) { return getTenantDb().all(...args); },
  get: function(...args) { return getTenantDb().get(...args); },
  serialize: function(cb) { return getTenantDb().serialize(cb); },
  close: function(cb) {
    const tenantId = tenantContext.getStore() || 1;
    const currentDb = tenantDbs.get(tenantId);
    if (currentDb) {
      tenantDbs.delete(tenantId);
      return currentDb.close(cb);
    }
    if (cb) cb();
  }
};

// ── NOTIFICAÇÕES PUSH (Web Push API) ──
const webpush = require('web-push');
const VAPID_PUBLIC_KEY = 'BCaA01Z--nSI2tJaXLNEf_mlW959ex1fW7x-jAH1tYSEqVYemjVApDllzr1jpwQqB_nlyjX3GIRb9uEyP_IUuRI';
const VAPID_PRIVATE_KEY = '3Jo6x74iIdc7-YUIFTpbxflkElTMTn-OpKTBvvyCVNQ';
try {
  webpush.setVapidDetails(
    'mailto:notificacoes@chefcozinha.local',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} catch (e) {
  console.error('Erro ao configurar web-push:', e);
}

// Envia push para todos os dispositivos cadastrados de um papel (garcom/cozinha)
async function sendPush(role, title, body, tag, url) {
  const subscricoes = await new Promise((resolve) => {
    db.all(`SELECT endpoint, auth, p256dh FROM push_subscriptions WHERE role = ?`, [role], (err, rows) => {
      if (err) return resolve([]);
      resolve(rows || []);
    });
  });
  if (!subscricoes.length) return;
  const payload = JSON.stringify({ title, body, tag: tag || 'comanda', url: url || '/garcom.html' });
  await Promise.all(subscricoes.map(async (sub) => {
    if (!sub.endpoint || !sub.auth || !sub.p256dh) return;
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { auth: sub.auth, p256dh: sub.p256dh }
      }, payload);
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        db.run(`DELETE FROM push_subscriptions WHERE endpoint = ?`, [sub.endpoint], () => { });
      } else {
        console.error('Erro ao enviar push:', e.statusCode || e.message);
      }
    }
  }));
}

// ══════════════════════════════════════════════════════════════════════════
// BLOCO REMOTO (compilado junto com o tail do server.js):
// Suprimento dos símbolos que o refactor multi-tenant moveu para o head do
// server.js (antes do db.serialize) e que o executável empacotado também
// precisa — autenticação local, seed do instalador e fila de sincronização
// offline → hub do super admin.
// ══════════════════════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (e) {
  try {
    bcrypt = require('bcrypt');
  } catch (e2) {
    const bcryptNativePath = path.join(BASE_DIR, 'bcrypt.node');
    if (!fs.existsSync(bcryptNativePath)) throw e2;
    const bindings = require(bcryptNativePath);
    bcrypt = {
      genSaltSync(rounds, minor) {
        if (!rounds) rounds = 10;
        return bindings.gen_salt_sync(minor || 'b', rounds, crypto.randomBytes(16));
      },
      genSalt(rounds, minor, cb) {
        if (typeof rounds === 'function') { cb = rounds; rounds = 10; minor = 'b'; }
        else if (typeof minor === 'function') { cb = minor; minor = 'b'; }
        if (!cb) return Promise.resolve(bcrypt.genSaltSync(rounds || 10));
        process.nextTick(() => { try { cb(null, bcrypt.genSaltSync(rounds || 10)); } catch (err) { cb(err); } });
      },
      hashSync(data, salt) {
        if (data == null || salt == null) throw new Error('data and salt arguments required');
        if (typeof salt === 'number') salt = bcrypt.genSaltSync(salt);
        return bindings.encrypt_sync(String(data), salt);
      },
      hash(data, salt, cb) {
        if (typeof salt === 'function') { cb = salt; salt = 10; }
        if (!cb) return Promise.resolve(bcrypt.hashSync(data, salt));
        process.nextTick(() => { try { cb(null, bcrypt.hashSync(data, salt)); } catch (err) { cb(err); } });
      },
      compareSync(data, hash) {
        if (data == null || hash == null) throw new Error('data and hash arguments required');
        return !!bindings.compare_sync(String(data), hash);
      },
      compare(data, hash, cb) {
        if (typeof hash === 'function') { cb = hash; hash = undefined; }
        if (!cb) return Promise.resolve(bcrypt.compareSync(data, hash));
        process.nextTick(() => { try { cb(null, bcrypt.compareSync(data, hash)); } catch (err) { cb(err); } });
      },
      getRounds(hash) { return bindings.get_rounds(hash); }
    };
  }
}
const tenantContext = new (require('async_hooks').AsyncLocalStorage)();
const fsSync = fs;

function isBcryptHash(v) { return typeof v === 'string' && /^\$2[aby]\$/.test(v); }

function funcionarioPublico(row) {
  if (!row) return row;
  const { senha, ...rest } = row;
  return rest;
}

function verificarSenhaFuncionario(row, senha) {
  const s = String(senha || '').trim();
  const dbSenha = String(row ? row.senha : '').trim();
  if (isBcryptHash(row.senha)) {
    return bcrypt.compare(s, row.senha);
  }
  if (s && s === dbSenha) {
    bcrypt.hash(s, 10).then(h => {
      db.run(`UPDATE funcionarios SET senha = ? WHERE id = ?`, [h, row.id]);
    }).catch(() => { });
    return Promise.resolve(true);
  }
  return Promise.resolve(false);
}

function parseNfceHtml(html) {
  const itens = [];
  if (!html || typeof html !== 'string') return itens;

  const rows = html.split(/<tr[^>]*>/i);
  rows.forEach((rowHtml) => {
    if (!rowHtml) return;
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let m;
    while ((m = tdRe.exec(rowHtml)) !== null) {
      cells.push(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    }
    if (cells.length < 3) return;

    let desc = '';
    let quantidade = 0;
    let valorUnit = 0;
    const numericos = [];
    cells.forEach((c, idx) => {
      const clean = String(c).replace(/\./g, '').replace(',', '.');
      if (/^[\d.,]+$/.test(c) && /^\d/.test(c) && !isNaN(parseFloat(clean))) {
        numericos.push({ idx, val: parseFloat(clean) });
      }
    });

    let unitIdx = -1;
    cells.forEach((c, idx) => {
      if (/^(UN|UNID|UNIDADE|KG|G|GR|L|ML|LT|CX|CXA|PCT|PC|DZ|CAIXA|PESO)$/i.test(c.trim())) unitIdx = idx;
    });

    cells.forEach((c, idx) => {
      const t = String(c).trim();
      if (!t || t.length < 3) return;
      if (/^(item|código|codigo|descri|ncm|cfop|un|qtd|quantidade|valor|total|subtotal|tributos|bebida|informa)/i.test(t.replace('ç', 'c'))) return;
      if (/[a-zà-ú]/i.test(t) && t.length > desc.length && !/R\$\s*[\d.,]+$/i.test(t)) desc = t;
    });

    if (!desc || desc.length > 140 || !/[a-zà-ú]/i.test(desc)) return;

    if (unitIdx > -1 && numericos.length) {
      const q = numericos.find(n => n.idx < unitIdx);
      const v = numericos.find(n => n.idx > unitIdx);
      if (q) quantidade = q.val;
      if (v) valorUnit = v.val;
    }
    if (quantidade === 0 && numericos.length === 2) {
      quantidade = numericos[0].val;
      valorUnit = numericos[1].val;
    }
    if (quantidade === 0 && numericos.length > 2) {
      quantidade = numericos[0].val;
      valorUnit = numericos[1].val;
    }

    if (quantidade > 0) {
      const nome = desc.replace(/^\d{1,4}\s+/, '').trim();
      if (nome) itens.push({ nome, quantidade, valor_unitario: valorUnit });
    }
  });

  // Remove duplicados óbvios (mesmo nome + quantidade + valor)
  const vistos = new Set();
  const unicos = [];
  itens.forEach(it => {
    const k = `${it.nome}|${it.quantidade}|${it.valor_unitario}`;
    if (!vistos.has(k)) { vistos.add(k); unicos.push(it); }
  });
  return unicos;
}

const ifoodApi = require('./ifood-integration');



// (Segurança) Chaves JWT: nunca fixas no código-fonte. Usam env vars quando
// definidas; caso contrário, uma chave aleatória é gerada e persistida uma única
// vez em %APPDATA%\ChefCozinha\.secret-<nome>.
function loadOrCreateSecret(name) {
  const dir = getDataDir();
  const file = path.join(dir, `.secret-${name}`);
  try {
    if (fsSync.existsSync(file)) {
      const val = fsSync.readFileSync(file, 'utf8').trim();
      if (val) return val;
    }
    fsSync.mkdirSync(dir, { recursive: true });
    const val = crypto.randomBytes(32).toString('hex');
    fsSync.writeFileSync(file, val, { mode: 0o600, encoding: 'utf8' });
    return val;
  } catch (e) {
    return crypto.randomBytes(32).toString('hex');
  }
}

const JWT_SECRET = process.env.JWT_SECRET || loadOrCreateSecret('jwt');

const restRateLimit = new Map();
// (Segurança) IP real da conexão. O header 'x-forwarded-for' só é confiado a um
// proxy (express trust proxy) — nunca direto do cliente, senão o rate limit é
// contornável forjando o header. Sem proxy, usa o endereço do socket.
function getClientIp(req) {
  if (app.get('trust proxy')) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim().replace('::ffff:', '');
  }
  const raw = (req.socket && req.socket.remoteAddress) || req.ip || '127.0.0.1';
  return String(raw).split(',')[0].trim().replace('::ffff:', '');
}
function checkRestRateLimit(ip, max = 10, windowMs = 600000) {
  const now = Date.now();
  const key = ip || 'unknown';
  const recent = (restRateLimit.get(key) || []).filter(t => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  restRateLimit.set(key, recent);
  // (Segurança) Evita crescimento sem limite do Map com IPs forjados/volumosos.
  if (restRateLimit.size > 5000) {
    for (const [k, arr] of restRateLimit) {
      const alive = (arr || []).filter(t => now - t < windowMs);
      if (!alive.length) restRateLimit.delete(k);
    }
  }
  return true;
}

function trimStr(v, maxLen = 500) { return typeof v === 'string' ? v.trim().substring(0, maxLen) : ''; }
function safeFloat(v, min = -Infinity, max = Infinity) { const n = parseFloat(v); return isNaN(n) ? 0 : Math.max(min, Math.min(max, n)); }
function safeInt(v, min = 0, max = 2147483647) { const n = parseInt(v, 10); return isNaN(n) ? min : Math.max(min, Math.min(max, n)); }
function isValidId(v) { const n = Number(v); return Number.isInteger(n) && n > 0; }

// Banco local de autenticação/licença da instalação: usuários, licenças,
// telemetria e fila de sincronização com o hub do super admin.
const MASTER_DB_PATH = path.join(APP_DATA_DIR, 'master.sqlite');
const masterDb = new sqlite3.Database(MASTER_DB_PATH);
masterDb.serialize(() => {
  masterDb.run('PRAGMA journal_mode = WAL;');
  masterDb.run('PRAGMA synchronous = NORMAL;');
  masterDb.run('PRAGMA busy_timeout = 5000;');
  masterDb.run(`CREATE TABLE IF NOT EXISTS configuracoes_global (chave TEXT PRIMARY KEY, valor TEXT)`);
  masterDb.run(`CREATE TABLE IF NOT EXISTS ifood_app_config (chave TEXT PRIMARY KEY, valor TEXT)`);
  masterDb.run(`CREATE TABLE IF NOT EXISTS restaurantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    licenca TEXT,
    ativo BOOLEAN DEFAULT true,
    data_cadastro DATETIME DEFAULT (datetime('now', 'localtime'))
  )`);
  masterDb.run(`ALTER TABLE restaurantes ADD COLUMN login_mode TEXT DEFAULT 'multi'`, err => { if (err) {} });
  masterDb.run(`ALTER TABLE restaurantes ADD COLUMN chave_ativacao TEXT`, err => { if (err) {} });
  masterDb.run(`ALTER TABLE restaurantes ADD COLUMN validade_licenca TEXT`, err => { if (err) {} });
  masterDb.run(`ALTER TABLE restaurantes ADD COLUMN max_dispositivos INTEGER DEFAULT 0`, err => { if (err) {} });
  masterDb.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurante_id INTEGER,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT,
    ativo BOOLEAN DEFAULT true,
    data_cadastro DATETIME DEFAULT (datetime('now', 'localtime'))
  )`);
  masterDb.run(`INSERT OR IGNORE INTO restaurantes (id, nome, licenca, ativo) VALUES (1, 'Estabelecimento', 'ativo', 1)`);
  masterDb.run(`UPDATE restaurantes SET licenca = 'ativo', ativo = 1 WHERE id = 1`);
  masterDb.run(`CREATE TABLE IF NOT EXISTS licencas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chave TEXT UNIQUE,
    restaurante_nome TEXT,
    plano TEXT DEFAULT 'premium',
    dias INTEGER DEFAULT 365,
    validade TEXT,
    max_dispositivos INTEGER DEFAULT 0,
    obs TEXT,
    status TEXT DEFAULT 'disponivel',
    criada_em DATETIME DEFAULT (datetime('now', 'localtime')),
    usada_em DATETIME,
    usada_por TEXT,
    install_id TEXT
  )`);
  masterDb.run(`CREATE TABLE IF NOT EXISTS telemetria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurante_id INTEGER,
    install_id TEXT,
    nome_restaurante TEXT,
    versao TEXT,
    ip TEXT,
    plataforma TEXT,
    online INTEGER DEFAULT 0,
    ultima_atividade DATETIME,
    tempo_uso_min INTEGER DEFAULT 0,
    pedidos_total INTEGER DEFAULT 0,
    vendas_total REAL DEFAULT 0,
    vendas_hoje REAL DEFAULT 0,
    comandas_abertas INTEGER DEFAULT 0,
    funcionarios_ativos INTEGER DEFAULT 0,
    garcons_online INTEGER DEFAULT 0,
    produtos_total INTEGER DEFAULT 0,
    setores_json TEXT,
    mesas_total INTEGER DEFAULT 0,
    dispositivos INTEGER DEFAULT 0,
    funcoes_json TEXT,
    erros_json TEXT,
    custo_total REAL DEFAULT 0,
    folha_mes REAL DEFAULT 0,
    despesas_mes REAL DEFAULT 0,
    lucro REAL DEFAULT 0,
    disco_mb REAL DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    updated_at DATETIME
  )`);
  masterDb.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetria_install ON telemetria (install_id)`);
  masterDb.run(`ALTER TABLE telemetria ADD COLUMN admin_login TEXT`, err => { if (err) {} });
  masterDb.run(`ALTER TABLE telemetria ADD COLUMN chave_ativacao TEXT`, err => { if (err) {} });
  masterDb.run(`CREATE TABLE IF NOT EXISTS sync_fila (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    install_id TEXT,
    payload TEXT NOT NULL,
    tentativas INTEGER DEFAULT 0,
    proxima_tentativa DATETIME DEFAULT (datetime('now', 'localtime')),
    criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
    sincronizado_em DATETIME
  )`);
  masterDb.run(`CREATE TABLE IF NOT EXISTS metrica_picos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurante_id INTEGER,
    dia TEXT,
    hora INTEGER,
    sockets INTEGER DEFAULT 0,
    UNIQUE(restaurante_id, dia, hora)
  )`);
});

// (Segurança) Verifica a senha do usuário admin local (tabela usuarios do
// masterDb). Mantida aqui porque o sync-prod.js corta a seção do server.js
// anterior ao db.serialize, onde a função original fica definida.
function verificarSenhaAdmin(senha) {
  return new Promise((resolve) => {
    if (!senha) return resolve(false);
    masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = 'super_admin_senha_hash'`, [], async (errC, rowC) => {
      if (!errC && rowC && rowC.valor) {
        try {
          if (await bcrypt.compare(String(senha), rowC.valor)) return resolve(true);
        } catch (e) { }
        return resolve(false);
      }
      masterDb.all(`SELECT password_hash FROM usuarios WHERE role = 'admin' AND ativo = 1`, [], async (err, users) => {
        if (err || !users || users.length === 0) return resolve(false);
        for (const user of users) {
          try {
            if (await bcrypt.compare(senha, user.password_hash)) return resolve(true);
          } catch(e) {}
        }
        resolve(false);
      });
    });
  });
}

// ════════════ SUPER ADMIN LOCAL (login + gerenciamento de certificados) ════════════
async function superAdminAuth(req, res, next) {
  const tokenHeader = req.headers['x-super-admin-token'] || req.query.adminToken;
  if (tokenHeader) {
    try {
      const decoded = jwt.verify(tokenHeader, JWT_SECRET);
      if (decoded && decoded.role === 'super_admin_local') {
        req.superAdmin = decoded;
        return next();
      }
    } catch (e) { }
  }
  return res.json({ ok: false, erro: 'Acesso não autorizado. Autentique-se novamente.' });
}

// Anti-brute-force: max 5 senhas erradas por IP a cada 15 min
const loginAttempts = new Map();
function loginBloqueado(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.inicio > 15 * 60 * 1000) { loginAttempts.delete(ip); return false; }
  return rec.falhas >= 5;
}
function registrarFalhaLogin(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec || Date.now() - rec.inicio > 15 * 60 * 1000) {
    loginAttempts.set(ip, { inicio: Date.now(), falhas: 1 });
  } else {
    rec.falhas++;
  }
}

app.post('/api/super/login-local', async (req, res) => {
  const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
  if (loginBloqueado(rawIp)) {
    return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Aguarde 15 minutos.' });
  }
  const senha = req.body && req.body.senha;
  const ok = await verificarSenhaAdmin(senha);
  if (!ok) {
    registrarFalhaLogin(rawIp);
    return res.json({ ok: false, erro: 'Senha de administrador inválida.' });
  }
  loginAttempts.delete(rawIp);
  const token = jwt.sign({ role: 'super_admin_local', restaurante_id: 1 }, JWT_SECRET, { expiresIn: '90d' });
  res.json({ ok: true, token });
});

// Tema Global: salva config e propaga em tempo real
app.post('/api/super/theme-custom', superAdminAuth, (req, res) => {
  const theme = req.body && req.body.theme;
  if (!theme || typeof theme !== 'object' || !Object.keys(theme).length) {
    return res.json({ ok: false, erro: 'Tema invalido.' });
  }
  const valor = JSON.stringify(theme);
  masterDb.run("INSERT INTO configuracoes_global (chave, valor) VALUES ('custom_theme', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", [valor], (err) => {
    if (err) return res.json({ ok: false, erro: err.message });
    try { io.emit('tema_global_atualizado', theme); } catch (e) { }
    res.json({ ok: true, mensagem: 'Tema Global salvo e propagado em tempo real!' });
  });
});

// Tema Global publico: leitura apenas de cores/fontes (sem dados sensiveis)
app.get('/api/public/theme', (req, res) => {
  const tid = req.query.restaurante_id;
  if (tid) {
    masterDb.get("SELECT tema_json FROM tenant_temas WHERE restaurante_id = ?", [tid], (err, tRow) => {
      if (!err && tRow && tRow.tema_json) {
        try { return res.json({ ok: true, theme: JSON.parse(tRow.tema_json), source: 'tenant' }); } catch (e) {}
      }
      masterDb.get("SELECT valor FROM configuracoes_global WHERE chave = 'custom_theme'", [], (err2, row) => {
        if (err2 || !row || !row.valor) return res.json({ ok: true, theme: null, source: 'default' });
        try { return res.json({ ok: true, theme: JSON.parse(row.valor), source: 'global' }); }
        catch (e) { return res.json({ ok: true, theme: null, source: 'default' }); }
      });
    });
  } else {
    masterDb.get("SELECT valor FROM configuracoes_global WHERE chave = 'custom_theme'", [], (err, row) => {
      if (err || !row || !row.valor) return res.json({ ok: true, theme: null });
      try { return res.json({ ok: true, theme: JSON.parse(row.valor) }); }
      catch (e) { return res.json({ ok: true, theme: null }); }
    });
  }
});

app.get('/api/super/certs', superAdminAuth, (req, res) => {
  ensureCertsDir();
  let files = [];
  try {
    files = fs.readdirSync(CERTS_DIR).filter(f => /\.(pfx|p12)$/i.test(f));
  } catch (e) { }
  files.sort();
  const certs = files.map(f => {
    const c = { file: f };
    try {
      const st = fs.statSync(path.join(CERTS_DIR, f));
      c.size = st.size;
      c.mtime = st.mtime.toISOString();
    } catch (e) { }
    return c;
  });
  const ativo = activeCertInfo ? activeCertInfo.file : (isHttps ? 'cert.pfx (legado)' : null);
  res.json({ ok: true, certs, ativo, isHttps, reiniciarNecessario: activeCertInfo && activeCertInfo.applied === false });
});

app.post('/api/super/certs/upload', superAdminAuth, upload.single('cert'), (req, res) => {
  if (!req.file) return res.json({ ok: false, erro: 'Nenhum arquivo enviado.' });
  const original = String(req.file.originalname || 'cert.pfx').replace(/^.*[\\/]/, '');
  if (!/\.(pfx|p12)$/i.test(original)) {
    try { fs.unlinkSync(req.file.path); } catch (e) { }
    return res.json({ ok: false, erro: 'Apenas arquivos .pfx ou .p12 são aceitos.' });
  }
  ensureCertsDir();
  const dest = path.join(CERTS_DIR, original);
  try {
    fs.copyFileSync(req.file.path, dest);
    fs.unlinkSync(req.file.path);
  } catch (e) {
    return res.json({ ok: false, erro: 'Falha ao salvar o arquivo: ' + (e.message || e) });
  }
  res.json({ ok: true, file: original });
});

app.post('/api/super/certs/ativar', superAdminAuth, (req, res) => {
  const file = String((req.body && req.body.file) || '').replace(/^.*[\\/]/, '').trim();
  if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) {
    return res.json({ ok: false, erro: 'Nome de arquivo inválido.' });
  }
  if (!/\.(pfx|p12)$/i.test(file)) return res.json({ ok: false, erro: 'Extensão inválida.' });
  if (!fs.existsSync(path.join(CERTS_DIR, file))) return res.json({ ok: false, erro: 'Arquivo não encontrado na pasta certs.' });
  const passphrase = (req.body && req.body.passphrase) ? String(req.body.passphrase) : CERT_PASSPHRASE;
  res.json(aplicarCert({ file, passphrase }));
});

app.delete('/api/super/certs/:file', superAdminAuth, (req, res) => {
  const file = String(req.params.file || '').replace(/^.*[\\/]/, '').trim();
  if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) return res.json({ ok: false, erro: 'Nome inválido.' });
  if (activeCertInfo && activeCertInfo.file === file) return res.json({ ok: false, erro: 'Não é possível remover o certificado em uso. Ative outro primeiro.' });
  const p = path.join(CERTS_DIR, file);
  if (!fs.existsSync(p)) return res.json({ ok: false, erro: 'Arquivo não encontrado.' });
  try {
    fs.unlinkSync(p);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, erro: 'Falha ao remover: ' + (e.message || e) });
  }
});

const TELEMETRIA_VERSION = '1.0.0';



// ════════════ TELEMETRIA ════════════
function registrarTelemetria(t) {
  const ip = trimStr(t.ip, 60);
  const agora = new Date().toLocaleString();
  masterDb.get(`SELECT id FROM telemetria WHERE install_id = ?`, [t.install_id || ''], (err, row) => {
    if (err) return;
    if (row) {
      masterDb.run(`UPDATE telemetria SET
        restaurante_id = ?, nome_restaurante = ?, versao = ?, ip = ?, plataforma = ?,
        admin_login = COALESCE(NULLIF(?, ''), admin_login), chave_ativacao = COALESCE(NULLIF(?, ''), chave_ativacao), online = 1,
        ultima_atividade = ?, tempo_uso_min = ?, pedidos_total = ?, vendas_total = ?, vendas_hoje = ?,
        comandas_abertas = ?, funcionarios_ativos = ?, garcons_online = ?, produtos_total = ?, setores_json = ?,
        mesas_total = ?, dispositivos = ?, funcoes_json = ?, erros_json = ?, custo_total = ?, folha_mes = ?,
        despesas_mes = ?, lucro = ?, disco_mb = ?, updated_at = ?
        WHERE install_id = ?`,
        [t.restaurante_id || null, trimStr(t.nome_restaurante, 120), trimStr(t.versao, 20), ip, trimStr(t.plataforma, 30), trimStr(t.admin_login, 120) || '', trimStr(t.chave_ativacao || t.chave, 30) || '', agora,
          t.tempo_uso_min || 0, t.pedidos_total || 0, t.vendas_total || 0, t.vendas_hoje || 0,
          t.comandas_abertas || 0, t.funcionarios_ativos || 0, t.garcons_online || 0, t.produtos_total || 0,
          t.setores_json || null, t.mesas_total || 0, t.dispositivos || 0, t.funcoes_json || null,
          t.erros_json || null, t.custo_total || 0, t.folha_mes || 0, t.despesas_mes || 0, t.lucro || 0,
          t.disco_mb || 0, agora, t.install_id || ''], (e) => { if (e) console.error('[Telemetria] update:', e.message); });
    } else {
      masterDb.run(`INSERT INTO telemetria (restaurante_id, install_id, nome_restaurante, versao, ip, plataforma, admin_login, chave_ativacao, online, ultima_atividade, tempo_uso_min, pedidos_total, vendas_total, vendas_hoje, comandas_abertas, funcionarios_ativos, garcons_online, produtos_total, setores_json, mesas_total, dispositivos, funcoes_json, erros_json, custo_total, folha_mes, despesas_mes, lucro, disco_mb, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.restaurante_id || null, t.install_id || '', trimStr(t.nome_restaurante, 120), trimStr(t.versao, 20), ip, trimStr(t.plataforma, 30), trimStr(t.admin_login, 120) || null, trimStr(t.chave_ativacao || t.chave, 30) || null, agora,
          t.tempo_uso_min || 0, t.pedidos_total || 0, t.vendas_total || 0, t.vendas_hoje || 0,
          t.comandas_abertas || 0, t.funcionarios_ativos || 0, t.garcons_online || 0, t.produtos_total || 0,
          t.setores_json || null, t.mesas_total || 0, t.dispositivos || 0, t.funcoes_json || null,
          t.erros_json || null, t.custo_total || 0, t.folha_mes || 0, t.despesas_mes || 0, t.lucro || 0,
          t.disco_mb || 0, agora], (e) => { if (e) console.error('[Telemetria] insert:', e.message); });
    }
  });
}

// ════════════ SEED DO ADMIN + FILA DE SINCRONIZAÇÃO (instalações remotas) ════════════

// Arquivo criado pelo instalador com os dados digitados pelo usuário:
// %APPDATA%\ChefCozinha\admin-seed.json
function getSeedPath() {
  return path.join(getDataDir(), 'admin-seed.json');
}

// Adiciona um item à fila de sincronização offline → hub
function enqueueSync(tipo, payload) {
  try {
    const state = licenseManager.getState ? licenseManager.getState() : {};
    const installId = (state && state.installId) || (payload && payload.install_id) || '';
    masterDb.run(`INSERT INTO sync_fila (tipo, install_id, payload) VALUES (?, ?, ?)`,
      [tipo, installId, JSON.stringify(payload || {})],
      (e) => { if (e) console.error('[Sync] enqueue:', e.message); });
  } catch (e) { console.error('[Sync] enqueue:', e.message); }
}

// Aplica os dados de configuração gravados pelo instalador:
// cria o admin local, define o nome do estabelecimento, ativa a chave de
// licença (mesmo offline) e agenda a sincronização com o hub.
function aplicarSeedAdmin() {
  return new Promise((resolve) => {
    const seedPath = getSeedPath();
    let seed = null;
    try {
      if (!fsSync.existsSync(seedPath)) return resolve();
      let raw = fsSync.readFileSync(seedPath, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // remove BOM (UTF-8)
      seed = JSON.parse(raw);
    } catch (e) {
      console.error('[Seed] Erro ao ler admin-seed.json:', e.message);
      return resolve();
    }

    const username = trimStr(seed.username || seed.email || '', 120).toLowerCase();
    const senha = String(seed.senha || seed.password || '');
    const nomeRest = trimStr(seed.nome_restaurante || seed.estabelecimento || '', 120);
    const chave = trimStr(seed.chave || seed.chave_licenca || '', 30).toUpperCase();

    if (!username || !senha) {
      console.error('[Seed] admin-seed.json sem username/senha.');
      return resolve();
    }

    bcrypt.hash(senha, 10).then((hash) => {
      const upsertUser = () => new Promise((resU, rejU) => {
        masterDb.run(
          `INSERT INTO usuarios (restaurante_id, username, password_hash, role, ativo)
           VALUES (1, ?, ?, 'admin', 1)
           ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin', ativo = 1`,
          [username, hash], (e) => e ? rejU(e) : resU());
      });

      const setNome = () => new Promise((resN, rejN) => {
        if (!nomeRest) return resN();
        masterDb.run(`UPDATE restaurantes SET nome = ? WHERE id = 1`, [nomeRest], (e) => e ? rejN(e) : resN());
      });

      Promise.all([upsertUser(), setNome()]).then(async () => {
        console.log(`[Seed] Admin local criado: ${username} (${nomeRest || 'Estabelecimento'})`);
        const state = licenseManager.getState ? licenseManager.getState() : {};
        const installId = (state && state.installId) || 'INST-UNKNOWN';

        // Ativa a chave (se informada) — suporta modo offline
        if (chave && licenseManager.validarChaveFormato(chave)) {
          const ativ = await licenseManager.activateLicense(chave, { restaurante: nomeRest });
          console.log(`[Seed] Ativação da chave: ${ativ.ok ? (ativ.offline ? 'offline (pendente)' : 'online') : ('falhou: ' + (ativ.error || ''))}`);
          enqueueSync('ativacao', { chave, install_id: installId, nome_restaurante: nomeRest || 'Estabelecimento', admin_login: username });
        }

        // Registra o estabelecimento + admin para o super admin ver
        enqueueSync('registro', {
          install_id: installId,
          nome_restaurante: nomeRest || 'Estabelecimento',
          admin_login: username,
          chave_ativacao: chave,
          plataforma: process.platform,
          versao: TELEMETRIA_VERSION,
          online: 1,
          ultima_atividade: new Date().toLocaleString()
        });

        try { fsSync.unlinkSync(seedPath); } catch (e) {}
        resolve();
      }).catch((err) => {
        console.error('[Seed] Erro ao aplicar seed:', err.message);
        resolve();
      });
    }).catch((e) => {
      console.error('[Seed] Erro bcrypt:', e.message);
      resolve();
    });
  });
}

// Envia os itens pendentes da fila para o hub central (com retry/backoff)
async function processarFilaSync() {
  if (!licenseManager.hubConfigurado || !licenseManager.hubConfigurado()) return;
  try {
    const rows = await new Promise((resolveP, rejectP) => {
      masterDb.all(`SELECT * FROM sync_fila WHERE sincronizado_em IS NULL AND proxima_tentativa <= datetime('now','localtime') ORDER BY id LIMIT 20`, [], (err, r) => err ? rejectP(err) : resolveP(r || []));
    });
    for (const item of rows) {
      let payload = {};
      try { payload = JSON.parse(item.payload || '{}'); } catch (e) {}
      const rota = item.tipo === 'ativacao' ? '/api/licenca/ativar' : '/api/telemetria';
      const result = await licenseManager.enviarParaHub(rota, payload);
      if (result && result.ok) {
        masterDb.run(`UPDATE sync_fila SET sincronizado_em = datetime('now','localtime') WHERE id = ?`, [item.id], () => {});
        console.log(`[Sync] ${item.tipo} sincronizado com o hub (item ${item.id})`);
      } else {
        const tent = (item.tentativas || 0) + 1;
        const backoffMin = Math.min(60, 10 * tent); // 10min, 20min... máx 1h
        masterDb.run(`UPDATE sync_fila SET tentativas = ?, proxima_tentativa = datetime('now','localtime','+${backoffMin} minutes') WHERE id = ?`,
          [tent, item.id], () => {});
        console.warn(`[Sync] ${item.tipo} falhou (tentativa ${tent}): ${(result && result.error) || 'erro desconhecido'}`);
      }
    }
  } catch (e) {
    console.error('[Sync] processar fila:', e.message);
  }
}

// Coleta métricas da própria instalação para enviar ao hub
function coletarTelemetriaInstalacao() {
  return new Promise((resolve) => {
    db.all(`SELECT COUNT(*) c FROM pedidos`, [], (e1, r1) => {
      db.all(`SELECT COALESCE(SUM(CAST(total AS REAL)),0) c FROM pedidos WHERE status IN ('Finalizado','Pago')`, [], (e2, r2) => {
        db.all(`SELECT COALESCE(SUM(custo),0) c FROM produtos`, [], (e3, r3) => {
          db.all(`SELECT COUNT(*) c FROM funcionarios WHERE status = 'Ativo'`, [], (e4, r4) => {
            db.all(`SELECT COUNT(*) c FROM produtos WHERE status = 'ativo'`, [], (e5, r5) => {
              const nome = licenseManager.getRestaurantName ? licenseManager.getRestaurantName() : '';
              const state = licenseManager.getState ? licenseManager.getState() : {};
              const hojeStr = new Date().toISOString().slice(0, 10);
              db.all(`SELECT COALESCE(SUM(CAST(total AS REAL)),0) c FROM pedidos WHERE status IN ('Finalizado','Pago') AND substr(createdAt,1,10) = ?`, [hojeStr], (e6, r6) => {
                const conectados = io.sockets.adapter.rooms.get('geral') ? io.sockets.adapter.rooms.get('geral').size : 0;
                const vendas = r2 && r2[0] ? parseFloat(r2[0].c || 0) : 0;
                const custo = r3 && r3[0] ? parseFloat(r3[0].c || 0) : 0;
                let discoMb = 0;
                try { const dbPath = getTenantDbPath(1); if (fsSync.existsSync(dbPath)) discoMb = fsSync.statSync(dbPath).size / (1024 * 1024); } catch (e) {}
                resolve({
                  install_id: state.installId || 'INST-UNKNOWN',
                  nome_restaurante: nome,
                  chave: state.chave || '',
                  versao: TELEMETRIA_VERSION,
                  plataforma: process.platform,
                  online: 1,
                  ultima_atividade: new Date().toLocaleString(),
                  tempo_uso_min: 0,
                  pedidos_total: r1 && r1[0] ? r1[0].c : 0,
                  vendas_total: vendas,
                  vendas_hoje: r6 && r6[0] ? parseFloat(r6[0].c || 0) : 0,
                  comandas_abertas: 0,
                  funcionarios_ativos: r4 && r4[0] ? r4[0].c : 0,
                  garcons_online: conectados,
                  produtos_total: r5 && r5[0] ? r5[0].c : 0,
                  mesas_total: 0,
                  dispositivos: conectados,
                  custo_total: custo,
                  folha_mes: 0,
                  despesas_mes: 0,
                  lucro: Math.round((vendas - custo) * 100) / 100,
                  disco_mb: Math.round(discoMb * 100) / 100
                });
              });
            });
          });
        });
      });
    });
  });
}

// Envia telemetria para o hub central (quando instalado remotamente).
// Em vez de enviar direto, enfileira — a fila reenvia com backoff até conseguir.
async function enviarTelemetriaRemota() {
  if (!licenseManager.hubConfigurado || !licenseManager.hubConfigurado()) return;
  try {
    const t = await coletarTelemetriaInstalacao();
    if (!t) return;
    enqueueSync('telemetria', t);
  } catch (e) {
    console.error('[Telemetria] envio remoto:', e.message);
  }
}

// Dispara o seed do instalador e a sincronização no startup e periodicamente
setTimeout(() => { enviarTelemetriaRemota(); }, 3000);
setInterval(() => { enviarTelemetriaRemota(); }, 5 * 60 * 1000);
setTimeout(() => { aplicarSeedAdmin().then(() => processarFilaSync()); }, 2500);
setInterval(() => processarFilaSync(), 60 * 1000);

// ─── SUPER ADMIN: EXEC (terminal de comandos com seguranca) ───
const { exec } = require('child_process');
const CMD_BLOCKLIST = [
  /\brm\s+-rf\s+\/\b/,           // rm -rf /
  /\bmkfs\b/,                     // formatacao de disco (Linux)
  /\bdd\s+.*of=\/dev\//,          // dd direto em disco
  /\bcurl\b.*\|\s*bash/,         // pipe remoto para bash
  /\bwget\b.*\|\s*bash/,
  /\bchmod\s+777\s+\//,          // chmod global
  /\bshutdown\b/i,                // desligar servidor
  /\breboot\b/i,
  /\binit\s+[06]\b/,
  /\bformat\s+[a-z]:/i,           // format C:
  /\bdiskpart\b/i,                // particionamento
  /\bdel\s+(\/[sfq]+\s+)+[a-z]:\\\s*$/i,   // del /S /Q na raiz de disco
  /\brd\s+\/s\s+\/q\s+[a-z]:\\\s*$/i,    // rd /S /Q na raiz de disco
  /\bvssadmin\b.*delete/i,        // apagar shadow copies
  /\bbcdedit\b/i,                 // boot config
  /\bcipher\s+\/w/i               // wipe de disco
];
// Endpoint exclusivo do super admin: operadores do shell (&, |, >, aspas,
// parenteses) sao necessarios para os comandos rapidos do terminal.
const CMD_DENY_CHARS = /[\r\n\0]/;

app.post('/api/super/exec', superAdminAuth, (req, res) => {
  const { command } = req.body;
  if (!command || typeof command !== 'string') return res.json({ ok: false, erro: 'Comando obrigatorio.' });
  if (command.length > 300) return res.json({ ok: false, erro: 'Comando muito longo (max 300 chars).' });
  if (CMD_DENY_CHARS.test(command)) return res.json({ ok: false, erro: 'Comando invalido.' });
  if (CMD_BLOCKLIST.some(rx => rx.test(command))) return res.json({ ok: false, erro: 'Comando bloqueado por seguranca.' });

  // Allowlist com comandos Windows e Linux usados na administracao do servidor
  const allowedCmds = /^(ls|cat|head|tail|wc|df|du|free|uptime|ps|top|netstat|ss|ip|ifconfig|ping|host|dig|nslookup|date|pwd|whoami|id|env|printenv|node|npm|npx|pm2|sqlite3|git|docker|dir|type|echo|tasklist|taskkill|systeminfo|wmic|ipconfig|hostname|ver|where|findstr|find|sc|net|cd|chdir|vol|driverquery|getmac|openfiles|quser|query|reg|wevtutil|powercfg|schtasks)\b/;
  if (!allowedCmds.test(command.trim())) {
    return res.json({ ok: false, erro: 'Comando nao esta na lista de permitidos. Permitidos: dir, type, tasklist, systeminfo, netstat, ipconfig, node, npm, pm2, sqlite3, git, docker...' });
  }

  console.log(`[SuperAdmin Exec] ${req.superAdmin?.role || 'admin'}: ${command.substring(0, 200)}`);
  exec(command, { cwd: __dirname, timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
    const out = (stdout || '').substring(0, 10000);
    const err = (stderr || '').substring(0, 5000);
    res.json({ ok: !error, stdout: out, stderr: err, exitCode: error ? (error.code || 1) : 0, command: command.substring(0, 300) });
  });
});
// ─── FEATURES POR TENANT + HELPERS DE BANCOS (portados do dev) ───
const featurePlans = require('./feature-plans');
const tenantFeatures = new Map();
const tenantSocketCounts = new Map();
const TENANT_FEATURES_REFRESH_MS = 30000;

function listarBancosTenant() {
  try {
    const estDir = path.join(APP_DATA_DIR, 'estabelecimentos');
    if (!fsSync.existsSync(estDir)) return [];
    return fsSync.readdirSync(estDir)
      .filter(f => /^\\d+$/.test(f))
      .map(f => path.join(estDir, f, 'database.sqlite'))
      .filter(p => fsSync.existsSync(p));
  } catch (e) {
    return [];
  }
}

function safeInt(v, min = 0, max = 2147483647) { const n = parseInt(v, 10); return isNaN(n) ? min : Math.max(min, Math.min(max, n)); }

// Recarrega o snapshot de features de todos os tenants (sincrono depois disso)
function loadAllTenantFeatures() {
  return new Promise((resolve) => {
    masterDb.all(`SELECT id, licenca FROM restaurantes`, [], (err, rests) => {
      masterDb.all(`SELECT restaurante_id, overrides_json FROM tenant_features`, [], (err2, ovs) => {
        const ovMap = {};
        (ovs || []).forEach((o) => {
          try { ovMap[o.restaurante_id] = JSON.parse(o.overrides_json) || {}; } catch (e) { ovMap[o.restaurante_id] = {}; }
        });
        const map = new Map();
        (rests || []).forEach((r) => {
          map.set(r.id, featurePlans.resolveFeatures(r.licenca, ovMap[r.id]));
        });
        tenantFeatures.clear();
        map.forEach((f, tid) => tenantFeatures.set(tid, f));
        resolve();
      });
    });
  });
}

function getTenantFeaturesSync(tid) {
  return tenantFeatures.get(tid) || featurePlans.getPlanDefaults('premium');
}

function isTenantFeatureEnabled(tid, feature) {
  const f = tenantFeatures.get(tid);
  if (!f) return true;
  return !!f[feature];
}

// ─── BLOCO PORTADO DA REGIÃO PRÉ-CORTE DO DEV (sync-prod descarta essa parte) ───
function celebrarNovoRestaurante(nome, id, dono) {
  const frames = ['🎉', '🎊', '✨', '🏆', '🌟', '🎆', '🎇'];
  let f = 0;
  const spinner = setInterval(() => {
    process.stdout.write(`\r  ${frames[f % frames.length]}  Processando novo cliente... `);
    f++;
  }, 120);

  setTimeout(() => {
    clearInterval(spinner);
    process.stdout.write('\r\x1b[2K\r');

    const ts = new Date().toLocaleTimeString('pt-BR');
    const banner = [
      '',
      `${ANSI.yellow}${ANSI.bright}  ╔══════════════════════════════════════════════════╗${ANSI.reset}`,
      `${ANSI.yellow}${ANSI.bright}  ║   🏆  NOVO RESTAURANTE CADASTRADO  🏆            ║${ANSI.reset}`,
      `${ANSI.yellow}${ANSI.bright}  ╠══════════════════════════════════════════════════╣${ANSI.reset}`,
      `${ANSI.yellow}  ║${ANSI.reset}  ${ANSI.cyan}🏪 Nome:${ANSI.reset}   ${ANSI.bright}${nome}${ANSI.reset}`,
      `${ANSI.yellow}  ║${ANSI.reset}  ${ANSI.green}🆔 ID:${ANSI.reset}     #${id}`,
      dono ? `${ANSI.yellow}  ║${ANSI.reset}  ${ANSI.magenta}👤 Dono:${ANSI.reset}   ${dono}` : null,
      `${ANSI.yellow}  ║${ANSI.reset}  ${ANSI.dim}🕐 Hora:${ANSI.reset}   ${ts}`,
      `${ANSI.yellow}${ANSI.bright}  ╚══════════════════════════════════════════════════╝${ANSI.reset}`,
      `  ${ANSI.green}${ANSI.bright}🎊 Bem-vindo ao ecossistema Chef Cozinha SaaS! 🎊${ANSI.reset}`,
      '',
    ].filter(Boolean).join('\n');

    originalLog.apply(console, [banner]);

    // Confete ASCII
    const confete = '  ✦ ★ ✦ ★ ✦ ★ ✦ ★ ✦ ★ ✦ ★ ✦ ★ ✦ ★ ✦ ★ ✦ ★ ✦';
    let c = 0;
    const rain = setInterval(() => {
      c++;
      const colors = [ANSI.yellow, ANSI.cyan, ANSI.magenta, ANSI.green];
      const col = colors[c % colors.length];
      process.stdout.write(`\r${col}${confete}${ANSI.reset}`);
      if (c >= 10) {
        clearInterval(rain);
        process.stdout.write('\r\x1b[2K\r');
        originalLog.apply(console, [`${ANSI.dim}────────────────────────────────────────────────────────${ANSI.reset}`]);
      }
    }, 150);
  }, 800);
}


const ANSI = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m\x1b[37m",
  bgCyan: "\x1b[46m\x1b[30m",
  bgMagenta: "\x1b[45m\x1b[37m",
  bgGreen: "\x1b[42m\x1b[30m"
};



const serverStartTime = Date.now();
function getEfficiencyStars() {
  const memRssMb = process.memoryUsage().rss / (1024 * 1024);
  if (memRssMb < 150) return "⭐⭐⭐⭐⭐ [100% EXCELENTE]";
  if (memRssMb < 300) return "⭐⭐⭐⭐ [95% ÓTIMO]";
  if (memRssMb < 500) return "⭐⭐⭐ [85% BOM]";
  return "⭐⭐ [ATENÇÃO RESTRIÇÃO]";
}

function localizarFuncionarioLogin(usuario, cb) {
  const q = `SELECT * FROM funcionarios WHERE LOWER(TRIM(usuario)) = LOWER(TRIM(?)) OR LOWER(TRIM(nome)) = LOWER(TRIM(?))`;
  db.get(q, [usuario, usuario], (err, row) => {
    if (!err && row) {
      if (!row.restaurante_id) row.restaurante_id = tenantContext.getStore() || 1;
      return cb(row);
    }
    masterDb.all(`SELECT id FROM restaurantes WHERE ativo = 1`, [], (e, rests) => {
      if (e || !rests || !rests.length) return cb(null);
      let i = 0;
      const atual = tenantContext.getStore() || 1;
      const next = () => {
        while (i < rests.length) {
          const tid = parseInt(rests[i++].id, 10);
          if (!Number.isFinite(tid) || tid <= 0 || tid === atual) continue;
          const dbPath = path.join(__dirname, `database_${tid}.sqlite`);
          if (!fsSync.existsSync(dbPath)) continue;
          const tdb = new sqlite3.Database(dbPath);
          tdb.get(q, [usuario, usuario], (e2, row2) => {
            tdb.close();
            if (!e2 && row2) {
              if (!row2.restaurante_id) row2.restaurante_id = tid;
              return cb(row2);
            }
            next();
          });
          return;
        }
        cb(null);
      };
      next();
    });
  });
}

let BASE_DOMAIN = (process.env.BASE_DOMAIN || 'chefcozinha.com.br').toLowerCase();
const domainMap = new Map(); // custom_domain → tenant_id
const slugMap = new Map();   // slug → tenant_id
let domainMapLoaded = false;

function loadDomainMaps() {
  return new Promise((resolve) => {
    masterDb.all(`SELECT id, slug, custom_domain FROM restaurantes WHERE ativo = 1`, [], (err, rows) => {
      if (err) return resolve();
      domainMap.clear();
      slugMap.clear();
      (rows || []).forEach(r => {
        if (r.custom_domain && r.custom_domain.trim()) {
          domainMap.set(r.custom_domain.trim().toLowerCase(), r.id);
        }
        if (r.slug && r.slug.trim()) {
          slugMap.set(r.slug.trim().toLowerCase(), r.id);
        }
      });
      domainMapLoaded = true;
      resolve();
    });
  });
}

function metricAddSocket(socket) {
  if (socket._metricCounted) return;
  socket._metricCounted = true;
  const tid = socket.restaurante_id || 1;
  tenantSocketCounts.set(tid, (tenantSocketCounts.get(tid) || 0) + 1);
}
function metricRemoveSocket(socket) {
  if (!socket._metricCounted) return;
  socket._metricCounted = false;
  const tid = socket.restaurante_id || 1;
  const c = (tenantSocketCounts.get(tid) || 1) - 1;
  if (c <= 0) tenantSocketCounts.delete(tid);
  else tenantSocketCounts.set(tid, c);
}
function metricSocketCount(tid) {
  return tenantSocketCounts.get(tid) || 0;
}

function getLocalDateStr(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Amostra o pico de sockets por tenant/hora e persiste no masterDb
function samplePicos() {
  const now = new Date();
  const dia = getLocalDateStr(now);
  const hora = now.getHours();
  tenantSocketCounts.forEach((count, tid) => {
    masterDb.run(
      `INSERT INTO metrica_picos (restaurante_id, dia, hora, sockets) VALUES (?, ?, ?, ?)
       ON CONFLICT(restaurante_id, dia, hora) DO UPDATE SET sockets = MAX(sockets, excluded.sockets)`,
      [tid, dia, hora, count]
    );
  });
}

function seedTenantDb(db, restauranteNome, done) {
  const onErr = (e) => { if (e) console.error('[Seed] Erro:', e.message); };
  db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS afiliados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      telefone TEXT,
      codigo_ref TEXT UNIQUE NOT NULL,
      comissao_percentual REAL DEFAULT 10,
      chave_pix TEXT,
      status TEXT DEFAULT 'ativo',
      password_hash TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS afiliado_vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      afiliado_id INTEGER NOT NULL,
      restaurante_id INTEGER,
      restaurante_nome TEXT,
      plano TEXT,
      valor_venda REAL DEFAULT 0,
      comissao_valor REAL DEFAULT 0,
      status TEXT DEFAULT 'pendente',
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (afiliado_id) REFERENCES afiliados(id)
    )
  `);

    for (let i = 1; i <= 6; i++) {
      db.run(`INSERT OR IGNORE INTO mesas (nome, status, observacao) VALUES (?, 'Disponível', NULL)`, ['Mesa ' + i], onErr);
    }
    if (restauranteNome) {
      db.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('nome_restaurante', ?)`, [restauranteNome], onErr);
    }
    const defaultMethods = [
      ['Dinheiro', 'dinheiro', 0.0, 0, 1, 'ph-currency-dollar', 1],
      ['Cartão de Crédito', 'credito', 2.5, 30, 1, 'ph-credit-card', 2],
      ['Cartão de Débito', 'debito', 1.2, 1, 1, 'ph-credit-card', 3],
      ['PIX', 'pix', 0.0, 0, 1, 'ph-qr-code', 4]
    ];
    db.get('SELECT COUNT(*) as c FROM formas_pagamento', [], (e, r) => {
      if (!e && r && r.c === 0) {
        const q = 'INSERT INTO formas_pagamento (nome, tipo, taxa, prazo_dias, ativo, icone, ordem) VALUES (?, ?, ?, ?, ?, ?, ?)';
        defaultMethods.forEach(m => db.run(q, m, onErr));
      }
    });
  }, done || (() => {}));
}

// Cria um banco de tenant novo com schema vazio + dados iniciais (sem copiar database_1.sqlite)
function createFreshTenantDb(dbPath, restauranteNome) {
  return new Promise((resolve) => {
    const newDb = new sqlite3.Database(dbPath, (err) => {
      if (err) { console.error('[Tenant] Erro ao criar banco:', err.message); return resolve(newDb); }
      newDb.run('PRAGMA journal_mode = WAL;');
      newDb.run('PRAGMA synchronous = NORMAL;');
      newDb.run('PRAGMA busy_timeout = 5000;');
      const refPath = path.join(__dirname, 'database_1.sqlite');
      if (fsSync.existsSync(refPath)) {
        syncTenantSchema(newDb, refPath, () => {
          seedTenantDb(newDb, restauranteNome, () => resolve(newDb));
        });
      } else {
        seedTenantDb(newDb, restauranteNome, () => resolve(newDb));
      }
    });
  });
}

function resolveTenantId(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const tid = parseInt(decoded && decoded.restaurante_id, 10);
      if (Number.isFinite(tid) && tid > 0) return tid;
    } catch (e) { }
  }
  const fromQuery = parseInt(req.query.restaurante_id, 10);
  if (Number.isFinite(fromQuery) && fromQuery > 0) return fromQuery;
  const fromBody = parseInt((req.body || {}).restaurante_id, 10);
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody;
  return null;
}

function withTenant(req, cb) {
  const tid = resolveTenantId(req);
  if (tid !== null) tenantContext.run(tid, cb);
  else cb();
}


let isMatrixAnimating = false;
let pendingLogs = [];
let tableGames = {};

const deploymentConfig = require('./deployment-config');
const instanceIdentity = require('./instance-identity');

async function verificarPinOuSenha(valor) {
  if (!valor) return false;
  if (await verificarSenhaAdmin(valor)) return true;
  const pinResult = await verificarPinTemporario(valor);
  return pinResult.ok;
}

function verificarPinTemporario(pin) {
  return new Promise((resolve) => {
    if (!pin || typeof pin !== 'string') return resolve({ ok: false });
    const pinUpper = pin.trim().toUpperCase();
    db.get(`SELECT * FROM pins_temporarios WHERE pin = ? AND ativo = 1`, [pinUpper], (err, row) => {
      if (err || !row) return resolve({ ok: false });
      if (row.tipo_expiracao !== 'sessao' && row.expira_em && row.expira_em !== 'SESSION') {
        if (new Date(row.expira_em) < new Date()) return resolve({ ok: false });
      }
      if (row.usos_atual >= row.max_usos) return resolve({ ok: false });
      db.run(`UPDATE pins_temporarios SET usos_atual = usos_atual + 1 WHERE id = ?`, [row.id], () => {});
      resolve({ ok: true, pin: row });
    });
  });
}

// Copiar todo o conteúdo do server.js original a partir da linha dos db.serialize
// (A lógica de tabelas e sockets é idêntica ao server.js de desenvolvimento)

db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA synchronous = NORMAL;');
  db.run('PRAGMA busy_timeout = 5000;');
  db.run('PRAGMA cache_size = -20000;');
  db.run('PRAGMA temp_store = MEMORY;');

  // Removed DROP TABLE to persist data
  db.run(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      productName TEXT,
      productEmoji TEXT,
      quantity INTEGER,
      time TEXT,
      localName TEXT,
      userName TEXT,

      total TEXT,
      status TEXT,
      sector TEXT,
      paymentMethod TEXT,
      turno_id INTEGER,
      createdAt DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS qr_pedidos_pendentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mesa TEXT,
      cliente_nome TEXT,
      itens_json TEXT,
      valor_total REAL,
      pago_pix INTEGER DEFAULT 0,
      chave_pix TEXT,
      status TEXT DEFAULT 'Pendente',
      createdAt DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`ALTER TABLE qr_pedidos_pendentes ADD COLUMN cliente_id INTEGER`, (err) => { });
  db.run(`ALTER TABLE qr_pedidos_pendentes ADD COLUMN comanda_nome TEXT`, (err) => { });
  db.run(`ALTER TABLE qr_pedidos_pendentes ADD COLUMN requires_validacao INTEGER DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE qr_pedidos_pendentes ADD COLUMN mesa_origem TEXT`, (err) => { });

  // Cliente identificado por mesa via QR (usado pelo PDV p/ exibir "mesa aberta" com nome)
  db.run(`
    CREATE TABLE IF NOT EXISTS mesa_clientes (
      mesa TEXT PRIMARY KEY,
      cliente_id INTEGER,
      cliente_nome TEXT,
      cliente_telefone TEXT,
      updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // Safe alter table
  db.run(`ALTER TABLE pedidos ADD COLUMN productEmoji TEXT`, (err) => { });
  db.run(`ALTER TABLE pedidos ADD COLUMN turno_id INTEGER`, (err) => { });
  db.run(`ALTER TABLE pedidos ADD COLUMN cliente_id INTEGER`, (err) => { });
  db.run(`ALTER TABLE pedidos ADD COLUMN entregador_id INTEGER`, (err) => { });
  db.run(`ALTER TABLE pedidos ADD COLUMN promocao_id INTEGER`, (err) => { });
  db.run(`ALTER TABLE pedidos ADD COLUMN mesa_grupo TEXT`, (err) => { });
  db.run(`ALTER TABLE pedidos ADD COLUMN mesa_comanda TEXT`, (err) => { });
  db.run(`ALTER TABLE pedidos ADD COLUMN garcom_call DATETIME`, (err) => { });
  db.run(`ALTER TABLE pedidos ADD COLUMN observations TEXT`, (err) => { });
  db.run(`ALTER TABLE pedidos ADD COLUMN options TEXT`, (err) => { });
  db.run(`ALTER TABLE pedidos ADD COLUMN composicoes TEXT`, (err) => { });
  db.run(`ALTER TABLE promocoes ADD COLUMN config TEXT`, (err) => { });

  // --- ITENS MONTÁVEIS (Build Your Own) ---
  db.run(`CREATE TABLE IF NOT EXISTS itens_montaveis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER,
    pricing_model TEXT DEFAULT 'soma',
    preco_fixo REAL DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
  )`, (err) => { });
  db.run(`CREATE TABLE IF NOT EXISTS montavel_categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    montavel_id INTEGER,
    nome TEXT,
    obrigatoria INTEGER DEFAULT 0,
    min_escolhas INTEGER DEFAULT 0,
    max_escolhas INTEGER DEFAULT 1,
    ordem INTEGER DEFAULT 0
  )`, (err) => { });
  db.run(`CREATE TABLE IF NOT EXISTS montavel_opcoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria_id INTEGER,
    nome TEXT,
    preco REAL DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    ordem INTEGER DEFAULT 0,
    produto_id INTEGER
  )`, (err) => { });
  db.run(`ALTER TABLE montavel_opcoes ADD COLUMN produto_id INTEGER`, (err) => { });

  // Inscrições de notificações push (Web Push) por dispositivo
  db.run(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE,
      auth TEXT,
      p256dh TEXT,
      role TEXT DEFAULT 'garcom',
      nome TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS funcionario_consumo_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER,
      preco_fixo REAL,
      desconto_percentual REAL,
      ativo BOOLEAN DEFAULT 1
    )
  `);
  db.run(`ALTER TABLE pedidos ADD COLUMN funcionario_id INTEGER`, (err) => { });
  db.run(`ALTER TABLE pedidos ADD COLUMN pagamento_id INTEGER`, (err) => { });
  db.run(`ALTER TABLE pedidos ADD COLUMN prontoEm DATETIME`, (err) => { });

  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      telefone TEXT,
      observacao TEXT,
      endereco TEXT,
      data_nascimento TEXT,
      pontos INTEGER DEFAULT 0
    )
  `);

  db.run(`ALTER TABLE clientes ADD COLUMN endereco TEXT`, (err) => { });
  db.run(`ALTER TABLE clientes ADD COLUMN data_nascimento TEXT`, (err) => { });
  db.run(`ALTER TABLE clientes ADD COLUMN pontos INTEGER DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE clientes ADD COLUMN total_gasto REAL DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE clientes ADD COLUMN nivel TEXT DEFAULT 'Bronze'`, (err) => { });
  db.run(`ALTER TABLE clientes ADD COLUMN ultimo_checkin TEXT`, (err) => { });
  db.run(`ALTER TABLE fila_espera ADD COLUMN mesa_ofertada TEXT`, (err) => { });

  db.run(`
    CREATE TABLE IF NOT EXISTS checkins_fidelidade (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      pontos INTEGER DEFAULT 0,
      data DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS ofertas_fidelidade (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT,
      descricao TEXT,
      nivel TEXT DEFAULT 'Bronze',
      ativo INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cliente_visitas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      cliente_nome TEXT,
      cliente_telefone TEXT,
      data_visita DATETIME DEFAULT (datetime('now', 'localtime')),
      mesa TEXT,
      pontos_ganhos INTEGER DEFAULT 0,
      contabilizado INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS promocoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      regra TEXT,
      desconto REAL,
      ativo BOOLEAN DEFAULT true,
      config TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS turnos_caixa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT DEFAULT 'Aberto',
      fundo_troco REAL,
      data_abertura DATETIME DEFAULT (datetime('now', 'localtime')),
      data_fechamento DATETIME
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turno_id INTEGER,
      tipo TEXT, 
      valor REAL,
      forma_pagamento TEXT,
      descricao TEXT,
      data DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS fila_espera (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_nome TEXT,
      cliente_telefone TEXT,
      pessoas INTEGER DEFAULT 2,
      mesa_preferida TEXT,
      observacao TEXT,
      status TEXT DEFAULT 'Esperando',
      mesa_ofertada TEXT,
      mesa_acomodado TEXT,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      atualizado_em DATETIME
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS nfce_notas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER,
      localName TEXT,
      cliente_nome TEXT,
      cpf_cnpj TEXT,
      valor_total REAL,
      chave_acesso TEXT,
      numero_nota INTEGER,
      serie INTEGER DEFAULT 1,
      ambiente TEXT DEFAULT 'homologacao',
      status TEXT DEFAULT 'Autorizada',
      protocolo TEXT,
      qr_code_url TEXT,
      xml_content TEXT,
      danfe_html TEXT,
      erros TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mesas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      status TEXT DEFAULT 'Disponível',
      observacao TEXT
    )
  `);

  // Correção de codificação histórica para status das mesas
  db.run(`UPDATE mesas SET status = 'Disponível' WHERE status LIKE 'Dispon%' AND status != 'Disponível'`);

  db.run(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria TEXT,
      nome TEXT,
      preco REAL,
      emoji TEXT,
      hasAddons BOOLEAN DEFAULT false,
      setor TEXT DEFAULT 'Cozinha 1',
      status_inicial TEXT DEFAULT 'Em preparo'
    )
  `);

  db.run(`ALTER TABLE produtos ADD COLUMN setor TEXT DEFAULT 'Cozinha 1'`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN status_inicial TEXT DEFAULT 'Em preparo'`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN status TEXT DEFAULT 'ativo'`, (err) => {
    // Ignora o erro
  });

  db.run(`ALTER TABLE produtos ADD COLUMN estoque REAL DEFAULT 0`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN validade TEXT`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN codigo_barras TEXT`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN categoria_fiscal TEXT DEFAULT 'Alimentacao'`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN preco_custo REAL DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE produtos ADD COLUMN unidade TEXT DEFAULT 'UN'`, (err) => { });
  db.run(`ALTER TABLE produtos ADD COLUMN fornecedor TEXT`, (err) => { });
  db.run(`ALTER TABLE produtos ADD COLUMN descricao TEXT`, (err) => { });
  db.run(`ALTER TABLE produtos ADD COLUMN visibilidade TEXT DEFAULT 'todos'`, (err) => { });

  db.run(`
    CREATE TABLE IF NOT EXISTS notas_compra (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fornecedor TEXT,
      numero TEXT,
      chave_acesso TEXT,
      valor_total REAL DEFAULT 0,
      data_nota TEXT,
      metodo TEXT,
      colaborador TEXT,
      observacao TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS nota_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nota_id INTEGER,
      produto_id INTEGER,
      nome TEXT,
      quantidade REAL DEFAULT 1,
      valor_unitario REAL DEFAULT 0,
      valor_total REAL DEFAULT 0,
      codigo_barras TEXT,
      unidade TEXT DEFAULT 'UN',
      categoria TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS funcionarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      usuario TEXT UNIQUE,
      senha TEXT,
      cargo TEXT,
      login_expires_at TEXT
    )
  `);

  db.run(`ALTER TABLE funcionarios ADD COLUMN status TEXT DEFAULT 'Ativo'`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_hora REAL DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN tipo_remuneracao TEXT DEFAULT 'hora'`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_dia REAL DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_semana REAL DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_mes REAL DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN chave_pix TEXT`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN cpf TEXT`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN telefone TEXT`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN observacao_rh TEXT`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN login_expires_at TEXT`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN data_cadastro TEXT`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN restaurante_id INTEGER`, (err) => { });

  db.run(`
    CREATE TABLE IF NOT EXISTS pontos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      entrada DATETIME,
      saida DATETIME,
      data DATE,
      total_horas REAL DEFAULT 0,
      valor_pagar REAL DEFAULT 0,
      pago BOOLEAN DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      data_pedido TEXT,
      valor REAL,
      status TEXT,
      data_aprovacao TEXT,
      pagamento_id INTEGER
    )
  `);

  db.run(`ALTER TABLE vales ADD COLUMN observacao TEXT`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN pin_hash TEXT`, (err) => { });
  db.run(`ALTER TABLE dias_atipicos ADD COLUMN forma_pagamento TEXT DEFAULT 'proximo_pagamento'`, (err) => { });

  db.run(`
    CREATE TABLE IF NOT EXISTS funcionarios_pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      data_pagamento TEXT,
      valor_bruto REAL,
      total_vales_abatidos REAL,
      total_consumo_abatido REAL,
      valor_liquido REAL,
      observacao TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pins_temporarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pin TEXT NOT NULL,
      nome_colaborador TEXT,
      categorias TEXT DEFAULT '[]',
      max_usos INTEGER DEFAULT 1,
      usos_atual INTEGER DEFAULT 0,
      expira_em TEXT,
      tipo_expiracao TEXT DEFAULT 'minutos',
      ativo INTEGER DEFAULT 1,
      criado_por TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS dias_atipicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      data TEXT,
      valor REAL,
      justificativa TEXT,
      status TEXT DEFAULT 'pendente',
      admin_obs TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS disponibilidade_funcionarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      data TEXT,
      disponivel BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      UNIQUE(funcionario_id, data)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS historico_logins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      funcionario_nome TEXT,
      data_hora DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run("CREATE TABLE IF NOT EXISTS cupons (codigo TEXT PRIMARY KEY, itens_json TEXT, usado INTEGER DEFAULT 0, data_criacao DATETIME DEFAULT (datetime('now', 'localtime')))");
  db.run("ALTER TABLE cupons ADD COLUMN validade TEXT", () => { });
  db.run("ALTER TABLE cupons ADD COLUMN dias_horarios_json TEXT", () => { });
  db.run("ALTER TABLE cupons ADD COLUMN valor_tipo TEXT", () => { });
  db.run("ALTER TABLE cupons ADD COLUMN valor REAL", () => { });
  db.run("ALTER TABLE cupons ADD COLUMN limite_usos INTEGER DEFAULT 1", () => { });
  db.run("ALTER TABLE cupons ADD COLUMN titulo TEXT", () => { });

  db.run(`CREATE TABLE IF NOT EXISTS cupons_usos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cupom_codigo TEXT NOT NULL,
    mesa TEXT,
    garcom TEXT,
    cliente_nome TEXT,
    itens_resgatados TEXT,
    data_uso DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (cupom_codigo) REFERENCES cupons(codigo)
  )`, () => { });

  db.run(`ALTER TABLE clientes ADD COLUMN endereco TEXT`, (err) => { });
  db.run(`ALTER TABLE clientes ADD COLUMN data_nascimento TEXT`, (err) => { });
  db.run(`ALTER TABLE clientes ADD COLUMN pontos INTEGER DEFAULT 0`, (err) => { });

  db.run(`
    CREATE TABLE IF NOT EXISTS promocoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      regra TEXT,
      desconto REAL,
      ativo BOOLEAN DEFAULT true,
      config TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS turnos_caixa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT DEFAULT 'Aberto',
      fundo_troco REAL,
      data_abertura DATETIME DEFAULT (datetime('now', 'localtime')),
      data_fechamento DATETIME
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turno_id INTEGER,
      tipo TEXT, 
      valor REAL,
      forma_pagamento TEXT,
      descricao TEXT,
      data DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS fila_espera (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_nome TEXT,
      cliente_telefone TEXT,
      pessoas INTEGER DEFAULT 2,
      mesa_preferida TEXT,
      observacao TEXT,
      status TEXT DEFAULT 'Esperando',
      mesa_ofertada TEXT,
      mesa_acomodado TEXT,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      atualizado_em DATETIME
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS nfce_notas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER,
      localName TEXT,
      cliente_nome TEXT,
      cpf_cnpj TEXT,
      valor_total REAL,
      chave_acesso TEXT,
      numero_nota INTEGER,
      serie INTEGER DEFAULT 1,
      ambiente TEXT DEFAULT 'homologacao',
      status TEXT DEFAULT 'Autorizada',
      protocolo TEXT,
      qr_code_url TEXT,
      xml_content TEXT,
      danfe_html TEXT,
      erros TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mesas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      status TEXT DEFAULT 'Disponível',
      observacao TEXT
    )
  `);

  // Correção de codificação histórica para status das mesas
  db.run(`UPDATE mesas SET status = 'Disponível' WHERE status LIKE 'Dispon%' AND status != 'Disponível'`);

  db.run(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria TEXT,
      nome TEXT,
      preco REAL,
      emoji TEXT,
      hasAddons BOOLEAN DEFAULT false,
      setor TEXT DEFAULT 'Cozinha 1',
      status_inicial TEXT DEFAULT 'Em preparo'
    )
  `);

  db.run(`ALTER TABLE produtos ADD COLUMN setor TEXT DEFAULT 'Cozinha 1'`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN status_inicial TEXT DEFAULT 'Em preparo'`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN status TEXT DEFAULT 'ativo'`, (err) => {
    // Ignora o erro
  });

  db.run(`ALTER TABLE produtos ADD COLUMN estoque REAL DEFAULT 0`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN validade TEXT`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN codigo_barras TEXT`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN categoria_fiscal TEXT DEFAULT 'Alimentacao'`, (err) => {
    // Ignora o erro se a coluna já existir
  });

  db.run(`ALTER TABLE produtos ADD COLUMN preco_custo REAL DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE produtos ADD COLUMN unidade TEXT DEFAULT 'UN'`, (err) => { });
  db.run(`ALTER TABLE produtos ADD COLUMN fornecedor TEXT`, (err) => { });
  db.run(`ALTER TABLE produtos ADD COLUMN descricao TEXT`, (err) => { });
  db.run(`ALTER TABLE produtos ADD COLUMN visibilidade TEXT DEFAULT 'todos'`, (err) => { });

  db.run(`
    CREATE TABLE IF NOT EXISTS notas_compra (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fornecedor TEXT,
      numero TEXT,
      chave_acesso TEXT,
      valor_total REAL DEFAULT 0,
      data_nota TEXT,
      metodo TEXT,
      colaborador TEXT,
      observacao TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS nota_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nota_id INTEGER,
      produto_id INTEGER,
      nome TEXT,
      quantidade REAL DEFAULT 1,
      valor_unitario REAL DEFAULT 0,
      valor_total REAL DEFAULT 0,
      codigo_barras TEXT,
      unidade TEXT DEFAULT 'UN',
      categoria TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS funcionarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      usuario TEXT UNIQUE,
      senha TEXT,
      cargo TEXT,
      login_expires_at TEXT
    )
  `);

  db.run(`ALTER TABLE funcionarios ADD COLUMN status TEXT DEFAULT 'Ativo'`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_hora REAL DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN tipo_remuneracao TEXT DEFAULT 'hora'`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_dia REAL DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_semana REAL DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN valor_mes REAL DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN chave_pix TEXT`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN cpf TEXT`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN telefone TEXT`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN observacao_rh TEXT`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN login_expires_at TEXT`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN data_cadastro TEXT`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN restaurante_id INTEGER`, (err) => { });

  db.run(`
    CREATE TABLE IF NOT EXISTS pontos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      entrada DATETIME,
      saida DATETIME,
      data DATE,
      total_horas REAL DEFAULT 0,
      valor_pagar REAL DEFAULT 0,
      pago BOOLEAN DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS vales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      data_pedido TEXT,
      valor REAL,
      status TEXT,
      data_aprovacao TEXT,
      pagamento_id INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS funcionarios_pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      data_pagamento TEXT,
      valor_bruto REAL,
      total_vales_abatidos REAL,
      total_consumo_abatido REAL,
      valor_liquido REAL,
      observacao TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS historico_logins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funcionario_id INTEGER,
      funcionario_nome TEXT,
      data_hora DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run("CREATE TABLE IF NOT EXISTS cupons (codigo TEXT PRIMARY KEY, itens_json TEXT, usado INTEGER DEFAULT 0, data_criacao DATETIME DEFAULT (datetime('now', 'localtime')))");
  db.run("ALTER TABLE cupons ADD COLUMN validade TEXT", () => { });
  db.run("ALTER TABLE cupons ADD COLUMN dias_horarios_json TEXT", () => { });
  db.run("ALTER TABLE cupons ADD COLUMN valor_tipo TEXT", () => { });
  db.run("ALTER TABLE cupons ADD COLUMN valor REAL", () => { });
  db.run("ALTER TABLE cupons ADD COLUMN limite_usos INTEGER DEFAULT 1", () => { });
  db.run("ALTER TABLE cupons ADD COLUMN titulo TEXT", () => { });

  db.run(`CREATE TABLE IF NOT EXISTS cupons_usos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cupom_codigo TEXT NOT NULL,
    mesa TEXT,
    garcom TEXT,
    cliente_nome TEXT,
    itens_resgatados TEXT,
    data_uso DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (cupom_codigo) REFERENCES cupons(codigo)
  )`, () => { });

  db.run(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS hub_pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canal TEXT DEFAULT 'Próprio',
      codigo TEXT,
      cliente TEXT,
      telefone TEXT,
      endereco TEXT,
      referencia TEXT,
      itens TEXT DEFAULT '[]',
      subtotal REAL DEFAULT 0,
      taxa REAL DEFAULT 0,
      total REAL DEFAULT 0,
      pagamento TEXT,
      status TEXT DEFAULT 'Recebido',
      entregador TEXT,
      obs TEXT,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      atualizado_em DATETIME
    )
  `);
  db.run(`ALTER TABLE hub_pedidos ADD COLUMN canal_ref TEXT`, (err) => { });
  db.run(`ALTER TABLE hub_pedidos ADD COLUMN merchant_id TEXT`, (err) => { });
  db.run(`ALTER TABLE hub_pedidos ADD COLUMN ifood_json TEXT`, (err) => { });
  db.run(`ALTER TABLE hub_pedidos ADD COLUMN enviado_cozinha INTEGER DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE hub_pedidos ADD COLUMN pedido_link_ids TEXT DEFAULT '[]'`, (err) => { });

  db.run(`
    CREATE TABLE IF NOT EXISTS ifood_connections (
      restaurante_id INTEGER PRIMARY KEY,
      status TEXT DEFAULT 'disconnected',
      user_code TEXT,
      code_verifier TEXT,
      verification_url TEXT,
      authorization_code TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at INTEGER,
      merchant_id TEXT,
      merchant_name TEXT,
      last_poll_at TEXT,
      last_error TEXT,
      updated_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_hora DATETIME DEFAULT (datetime('now', 'localtime')),
      operador TEXT,
      ip TEXT,
      metodo TEXT,
      endpoint TEXT,
      detalhes TEXT,
      status_code INTEGER
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_api_logs_data ON api_logs(data_hora)");
  db.run("CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON api_logs(endpoint)");

  // Popular a tabela de auditoria inicial se vazia para demonstração imediata
  db.get("SELECT COUNT(*) as count FROM auditoria", (err, row) => {
    if (!err && row && row.count === 0) {
      const sampleAudits = [
        ['Caixa 1', 'Desconto Aplicado', 'Desconto de 10% no Checkout (Mesa 04)', 'Cliente VIP Fidelidade', 'Médio'],
        ['Garçom João', 'Exclusão de Item', 'Removido item Porção de Peixe (Comanda #12)', 'Pedido duplicado pelo cliente', 'Alto'],
        ['Admin', 'Alteração de Preço', 'Produto Chopp 500ml alterado de R$ 12,00 para R$ 14,00', 'Atualização da tabela de preços', 'Médio'],
        ['Gerente Pedro', 'Cancelamento de Pedido', 'Pedido #108 cancelado integralmente (R$ 89,00)', 'Cliente desistiu do pedido', 'Alto'],
        ['Admin', 'Configuração Alterada', 'Certificado A1 e Parâmetros NFC-e atualizados', 'Manutenção fiscal periódica', 'Baixo'],
        ['Caixa 2', 'Estorno de Pagamento', 'Estornado pagamento PIX de R$ 45,00', 'Valor cobrado a maior', 'Alto']
      ];
      const insertAudit = "INSERT INTO auditoria (operador, acao, detalhes, motivo, risco) VALUES (?, ?, ?, ?, ?)";
      sampleAudits.forEach(a => db.run(insertAudit, a));
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_hora DATETIME DEFAULT (datetime('now', 'localtime')),
      operador TEXT,
      acao TEXT,
      detalhes TEXT,
      motivo TEXT,
      risco TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS beneficios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      pontos INTEGER,
      imagem_url TEXT,
      ativo BOOLEAN DEFAULT true
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS resgates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      beneficio_id INTEGER,
      codigo TEXT,
      usado BOOLEAN DEFAULT false,
      data TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS formas_pagamento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      taxa REAL DEFAULT 0.0,
      prazo_dias INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1,
      icone TEXT DEFAULT 'ph-credit-card',
      ordem INTEGER DEFAULT 0
    )
  `, () => {
    db.get('SELECT COUNT(*) as count FROM formas_pagamento', (err, row) => {
      if (!err && row && row.count === 0) {
        const defaultMethods = [
          ['Dinheiro', 'dinheiro', 0.0, 0, 1, 'ph-currency-dollar', 1],
          ['Cartão de Crédito', 'credito', 2.5, 30, 1, 'ph-credit-card', 2],
          ['Cartão de Débito', 'debito', 1.2, 1, 1, 'ph-credit-card', 3],
          ['PIX', 'pix', 0.0, 0, 1, 'ph-qr-code', 4],
          ['Vale Refeição / Alimentação', 'ticket', 3.5, 30, 1, 'ph-ticket', 5],
          ['Fiado / Carteira', 'carteira', 0.0, 0, 1, 'ph-notebook', 6]
        ];
        const insertFp = 'INSERT INTO formas_pagamento (nome, tipo, taxa, prazo_dias, ativo, icone, ordem) VALUES (?, ?, ?, ?, ?, ?, ?)';
        defaultMethods.forEach(m => db.run(insertFp, m));

        // Migrar e descobrir automaticamente métodos de pagamento já existentes em vendas/pedidos anteriores (apenas na primeira execução)
        db.all("SELECT DISTINCT paymentMethod FROM pedidos WHERE paymentMethod IS NOT NULL AND paymentMethod != ''", [], (err2, rows) => {
          if (!err2 && rows) {
            rows.forEach(r => {
              const metodoNome = r.paymentMethod.trim();
              if (!metodoNome) return;
              db.get("SELECT id FROM formas_pagamento WHERE LOWER(nome) = LOWER(?)", [metodoNome], (e, fp) => {
                if (!e && !fp) {
                  let tipo = 'outros';
                  let icone = 'ph-wallet';
                  const lower = metodoNome.toLowerCase();
                  if (lower.includes('dinheiro') || lower.includes('espécie')) { tipo = 'dinheiro'; icone = 'ph-currency-dollar'; }
                  else if (lower.includes('crédito') || lower.includes('credito')) { tipo = 'credito'; icone = 'ph-credit-card'; }
                  else if (lower.includes('débito') || lower.includes('debito')) { tipo = 'debito'; icone = 'ph-credit-card'; }
                  else if (lower.includes('pix')) { tipo = 'pix'; icone = 'ph-qr-code'; }
                  else if (lower.includes('ticket') || lower.includes('refeição') || lower.includes('alelo') || lower.includes('sodexo') || lower.includes('vr')) { tipo = 'ticket'; icone = 'ph-ticket'; }
                  else if (lower.includes('fiado') || lower.includes('carteira') || lower.includes('conta')) { tipo = 'carteira'; icone = 'ph-notebook'; }

                  db.run("INSERT INTO formas_pagamento (nome, tipo, taxa, prazo_dias, ativo, icone) VALUES (?, ?, 0.0, 0, 1, ?)", [metodoNome, tipo, icone]);
                }
              });
            });
          }
        });
      }
    });

    // Criar Índices no SQLite para Desempenho e Eficiência Extrema
    db.run("CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status)");
    db.run("CREATE INDEX IF NOT EXISTS idx_pedidos_local ON pedidos(localName)");
    db.run("CREATE INDEX IF NOT EXISTS idx_pedidos_payment ON pedidos(paymentMethod)");
    db.run("CREATE INDEX IF NOT EXISTS idx_pedidos_created ON pedidos(createdAt)");
    db.run("CREATE INDEX IF NOT EXISTS idx_pedidos_status_sector_created ON pedidos(status, sector, createdAt)");
    db.run("CREATE INDEX IF NOT EXISTS idx_pedidos_local_status ON pedidos(localName, status)");
    db.run("CREATE INDEX IF NOT EXISTS idx_formas_pagamento_ativo ON formas_pagamento(ativo, ordem)");
    db.run("CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(telefone)");
    db.run("CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria)");
    db.run("CREATE INDEX IF NOT EXISTS idx_mesas_nome ON mesas(nome)");
  });

  global.registrarAuditoria = (operador, acao, detalhes, motivo, risco, socketId = null) => {
    let opFinal = (operador || '').trim();

    // Se o operador veio nulo, vazio ou como 'Desconhecido', tentar recuperar o operador ativo na sessão do socket
    if (!opFinal || opFinal === 'Desconhecido' || opFinal === 'Caixa / Desconhecido' || opFinal.toLowerCase().includes('desconhecido') || opFinal === 'undefined') {
      if (socketId && typeof activeSockets !== 'undefined' && activeSockets.has(socketId)) {
        const conn = activeSockets.get(socketId);
        if (conn && conn.user && conn.user !== 'Visitante') {
          opFinal = conn.user;
        }
      }
    }

    // Se ainda assim não encontrar nome, atribuir ao Operador de Caixa / Administrador ativo
    if (!opFinal || opFinal.toLowerCase().includes('desconhecido') || opFinal === 'undefined') {
      opFinal = 'Operador do Caixa';
    }

    db.run(
      `INSERT INTO auditoria (operador, acao, detalhes, motivo, risco) VALUES (?, ?, ?, ?, ?)`,
      [opFinal, acao, detalhes || '-', motivo || 'Sem justificativa', risco || 'BAIXO'],
      (err) => {
        if (err) console.error("Erro ao registrar auditoria:", err);
      }
    );
  };

  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('qr_order_enabled', 'false')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('qr_order_flow', 'caixa')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('qr_pix_key', '')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('qr_pix_name', '')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('split_excedente', 'perguntar')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('hub_delivery_config', '{"enabled":false,"canais":[{"nome":"iFood","ativo":true},{"nome":"Rappi","ativo":true},{"nome":"Uber Eats","ativo":true},{"nome":"Mucho","ativo":true},{"nome":"Próprio","ativo":true}],"taxa":"0.00","tempo":45}')`);

  // Feature toggles do restaurante
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('feature_venda_sem_estoque', 'false')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('feature_toggle_produto_rapido', 'true')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('feature_alterar_valores_pdv', 'false')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('feature_clientes_ativos', 'true')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('feature_produto_mais_vendido', 'true')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('feature_maior_lucro', 'true')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('feature_impressao_digital', 'true')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('feature_impressao_termica', 'false')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('feature_produtos_lote', 'false')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('feature_jogos', 'true')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('jogos_premiacao_automatica', 'true')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('jogos_pontos_vitoria', '10')`);
  db.run(`INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('jogos_pontos_derrota', '2')`);

  // ══════ TABELAS DE JOGOS/GAMIFICAÇÃO ══════
  db.run(`
    CREATE TABLE IF NOT EXISTS jogos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      emoji TEXT DEFAULT '🎮',
      descricao TEXT,
      regras TEXT,
      premio_vencedor TEXT DEFAULT 'Quem paga a conta!',
      premio_perdedor TEXT DEFAULT 'Perdeu, perdeu!',
      ativo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS jogos_partidas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jogo_id INTEGER,
      mesa TEXT,
      jogador1_nome TEXT,
      jogador1_comanda TEXT,
      jogador1_cliente_id INTEGER,
      jogador1_escolha TEXT,
      jogador2_nome TEXT,
      jogador2_comanda TEXT,
      jogador2_cliente_id INTEGER,
      jogador2_escolha TEXT,
      rodada INTEGER DEFAULT 1,
      max_rodadas INTEGER DEFAULT 3,
      status TEXT DEFAULT 'aguardando',
      vencedor TEXT,
      resultado_json TEXT,
      premio_descricao TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      finished_at DATETIME
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS jogos_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jogo_id INTEGER,
      jogo_nome TEXT,
      mesa TEXT,
      jogador1_nome TEXT,
      jogador2_nome TEXT,
      vencedor TEXT,
      perdedor TEXT,
      rodadas_jogadas INTEGER DEFAULT 1,
      premio_descricao TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // Inserir um cupom de teste inicial
  const testItems = [
    { nome: "Cerveja Lata", emoji: "🍺", quantity: 1, sector: "Bar" },
    { nome: "Porção Extra - Arroz/Pirão/Salada", emoji: "🍚", quantity: 1, sector: "Cozinha 1" }
  ];
  db.run(`INSERT OR IGNORE INTO cupons (codigo, itens_json, usado) VALUES (?, ?, 0)`, ['CUPOM-TESTE-123', JSON.stringify(testItems)]);

  // Default mesas
  db.get('SELECT count(*) as count FROM mesas', (err, row) => {
    if (row && row.count === 0) {
      for (let i = 1; i <= 15; i++) {
        db.run(`INSERT INTO mesas (nome) VALUES (?)`, [`Mesa ${i}`]);
      }
      db.run(`INSERT INTO mesas (nome) VALUES (?)`, [`Delivery`]);
    }
  });

  // Default produtos
  db.get('SELECT count(*) as count FROM produtos', (err, row) => {
    if (row && row.count === 0) {
      const defaultProducts = [
        ['Cervejas', 'Heineken 600ml', 21.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Stella 600ml', 21.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Spaten 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Budweiser 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Amstel 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Eisenbahn 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Original 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Brahma 600ml', 15.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Cerveja Lata', 10.00, '🍺', false, 'Bar', 'Em espera'],
        ['Cervejas', 'Cerveja Artesanal', 25.00, '🍺', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Refrigerante Lata', 8.00, '🥤', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Água sem gás', 4.00, '💧', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Água com gás', 5.00, '💧', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Tônica Lata', 8.80, '🥤', false, 'Bar', 'Em espera'],
        ['Bebidas', 'H2O Garrafa', 8.80, '💧', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Citrus Lata', 8.80, '🥤', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Suco copo/lata', 8.80, '🧃', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Suco Jarra Laranja', 18.00, '🍊', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Suco Jarra Limão', 23.00, '🍋', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Energético Baly', 18.00, '⚡', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Energético Redbull', 18.00, '⚡', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Energético Monster', 18.00, '⚡', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Heineken 0%', 15.00, '🍺', false, 'Bar', 'Em espera'],
        ['Bebidas', 'Brahma 0%', 10.00, '🍺', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Smirnoff', 20.00, '🍹', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Bacardi', 20.00, '🍹', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Cachaça Branca', 20.00, '🍹', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Cachaça Amarela', 20.00, '🍹', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Vinho', 20.00, '🍷', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Skyy', 20.00, '🍹', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Absolut', 26.00, '🍹', false, 'Bar', 'Em espera'],
        ['Caipirinhas', 'Caipirinha Havana', 28.00, '🍹', false, 'Bar', 'Em espera'],
        ['Doses', 'Smirnoff', 12.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'Bacardi', 12.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'Steinhager', 11.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'Red Label', 20.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'White Horse', 20.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'Passport', 13.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'Licor 43', 28.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'Conhaque', 28.00, '🥃', false, 'Bar', 'Em espera'],
        ['Doses', 'Gin', 13.00, '🍸', false, 'Bar', 'Em espera'],
        ['Doses', 'Campari', 15.00, '🥃', false, 'Bar', 'Em espera'],
        ['Porções (800g)', 'Combinado São José (800g)', 134.00, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Anchova Frita (6 postas) (800g)', 69.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Peixe Frito Misturinha (800g)', 59.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Isca de Peixe à dorê (800g)', 74.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Camarão ao Bafo (800g)', 99.00, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Camarão à milanesa (800g)', 169.00, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Camarão alho e óleo (800g)', 119.90, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Ostra ao Bafo (dúzia) (800g)', 34.00, '🦪', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Ostra Gratinada (dúzia) (800g)', 69.00, '🦪', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Bolinho de Siri (4 unidades) (800g)', 44.90, '🦀', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Marisco ao Bafo (1 kg) (800g)', 45.00, '🦪', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Lula em anéis a dorê (800g)', 89.90, '🦑', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Frango à Passarinho (1 kg) (800g)', 59.00, '🍗', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Fritas (800g)', 49.00, '🍟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Porção 4 Pastéis - Camarão', 28.00, '🥟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Porção 4 Pastéis - Berbigão', 28.00, '🥟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (800g)', 'Porção 4 Pastéis - Queijo', 28.00, '🥟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Peixe Frito Misturinha (500g)', 48.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Isca de Peixe à dorê (500g)', 64.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Camarão Maluquinho (500g)', 84.90, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Camarão ao Bafo (500g)', 99.00, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Camarão à milanesa (500g)', 135.00, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Camarão alho e óleo (500g)', 99.90, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Ostra ao Bafo (6 unidades)', 16.90, '🦪', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Ostra Gratinada (6 unidades)', 54.00, '🦪', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', 'Bolinho de Siri (1 unidade)', 12.00, '🦀', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Lula a dorê (500g)', 79.90, '🦑', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', 'Filé de Frango Individual', 19.90, '🍗', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', 'Filé de Peixe Individual', 19.90, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', '1/2 Fritas (500g)', 39.00, '🍟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', 'Pastel 1 unidade - Camarão', 8.00, '🥟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', 'Pastel 1 unidade - Berbigão', 8.00, '🥟', false, 'Cozinha 1', 'Em espera'],
        ['Porções (500g)', 'Pastel 1 unidade - Queijo', 8.00, '🥟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Pirão São José (700g) (2 pessoas)', 164.90, '🍲', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Salmão à Moda da Casa (500g)', 209.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Filé de Pescada à Milanesa (800g)', 154.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', '1/2 Filé Pescada à Milanesa (500g)', 134.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Filé de Pescada à Milanesa ao Molho de Camarão (800g)', 209.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', '1/2 Filé de Pescada ao Molho de Camarão (500g)', 178.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Peixe Grelhado Anchova (Chapa)', 118.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Peixe Frito em Postas (6 postas)', 115.00, '🐟', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Camarão à Milanesa (800g)', 209.00, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', '1/2 Camarão à Milanesa (500g)', 181.00, '🍤', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Filé de Frango à Milanesa (800g)', 119.00, '🍗', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', '1/2 Filé de Frango à Milanesa (500g)', 99.00, '🍗', false, 'Cozinha 1', 'Em espera'],
        ['A La Carte', 'Porção Extra - Arroz/Pirão/Salada', 20.00, '🍚', false, 'Cozinha 1', 'Em espera']
      ];
      const insertProd = `INSERT INTO produtos (categoria, nome, preco, emoji, hasAddons, setor, status_inicial) VALUES (?, ?, ?, ?, ?, ?, ?)`;
      defaultProducts.forEach(p => {
        db.run(insertProd, [p[0], p[1], p[2], p[3], p[4] ? 1 : 0, p[5], p[6]]);
      });
    }
  });

  // Default funcionario
  db.get('SELECT count(*) as count FROM funcionarios', (err, row) => {
    if (row && row.count === 0) {
      db.run(`INSERT INTO funcionarios (nome, usuario, senha, cargo) VALUES (?, ?, ?, ?)`, ['Garçom Teste', 'garcom', '123', 'Garçom']);
    }
  });

  // ── TABELAS DE SYNC / ON-PREMISE (tenant DB) ──
  db.run(`CREATE TABLE IF NOT EXISTS instance_identity (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sync_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    direction TEXT DEFAULT 'up',
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT (datetime('now','localtime')),
    sent_at DATETIME,
    retry_count INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pending_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command_id TEXT NOT NULL UNIQUE,
    command TEXT NOT NULL,
    params TEXT,
    received_at DATETIME DEFAULT (datetime('now','localtime')),
    status TEXT DEFAULT 'pending',
    result TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sync_versions (
    table_name TEXT PRIMARY KEY,
    last_sync_version INTEGER DEFAULT 0,
    last_push_at DATETIME
  )`);

  db.run(`ALTER TABLE pedidos ADD COLUMN sync_version INTEGER DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE produtos ADD COLUMN sync_version INTEGER DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE configuracoes ADD COLUMN sync_version INTEGER DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE clientes ADD COLUMN sync_version INTEGER DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE funcionarios ADD COLUMN sync_version INTEGER DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE mesas ADD COLUMN sync_version INTEGER DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE promocoes ADD COLUMN sync_version INTEGER DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE cupons ADD COLUMN sync_version INTEGER DEFAULT 0`, (err) => { });
  db.run(`ALTER TABLE formas_pagamento ADD COLUMN sync_version INTEGER DEFAULT 0`, (err) => { });

  // Criar índices após garantir que as tabelas existem
  db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);');
  db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_localName ON pedidos(localName);');
  db.run('CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria);');
  db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_turno_id ON pedidos(turno_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_grupo ON pedidos(mesa_grupo);');
  db.run('CREATE INDEX IF NOT EXISTS idx_movimentacoes_turno_id ON movimentacoes(turno_id);');
  db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_status_sector_created ON pedidos(status, sector, createdAt);');
  db.run('CREATE INDEX IF NOT EXISTS idx_pedidos_local_status ON pedidos(localName, status);', () => {
    // Checkpoint WAL do database_1.sqlite para liberar locks
    const refDb = new sqlite3.Database(path.join(__dirname, 'database_1.sqlite'), (err) => {
      if (err) return;
      refDb.run('PRAGMA wal_checkpoint(TRUNCATE);', () => {
        refDb.close();
      });
    });
  });
});

// ── SINCRONIZAÇÃO DE SCHEMA DOS TENANTS ──────────────────────
// Bancos de tenants criados antes das últimas migrações ficam com tabelas/colunas
// antigas. Aqui garantimos que cada banco existente receba as mesmas tabelas e
// colunas do template (database_1.sqlite).
function syncTenantSchema(tenantDb, refPath, done) {
  tenantDb.serialize(() => {
    tenantDb.run(`ATTACH DATABASE ? AS ref`, [refPath], (attachErr) => {
      if (attachErr) {
        console.error('[Tenant Schema] Erro ao anexar schema de referência:', attachErr.message);
        return done && done();
      }
      tenantDb.all(`SELECT name, sql FROM ref.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`, [], (err, tables) => {
        if (err) {
          console.error('[Tenant Schema] Erro ao listar tabelas de referência:', err.message);
          tenantDb.run('DETACH DATABASE ref');
          return done && done();
        }
        const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
        let ti = 0;
        const nextTable = () => {
          if (ti >= tables.length) {
            tenantDb.run('DETACH DATABASE ref', () => done && done());
            return;
          }
          const t = tables[ti++];
          tenantDb.get(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [t.name], (e2, row) => {
            if (e2) return nextTable();
            if (!row) {
              tenantDb.run(t.sql, (e3) => {
                if (e3 && !/already exists/i.test(e3.message)) {
                  console.error(`[Tenant Schema] Erro ao criar tabela ${t.name}:`, e3.message);
                }
                nextTable();
              });
              return;
            }
            tenantDb.all(`PRAGMA ref.table_info(${q(t.name)})`, [], (e4, refCols) => {
              if (e4) return nextTable();
              tenantDb.all(`PRAGMA table_info(${q(t.name)})`, [], (e5, cols) => {
                if (e5) return nextTable();
                const have = new Set((cols || []).map((c) => c.name));
                let ci = 0;
                const nextCol = () => {
                  while (ci < refCols.length) {
                    const c = refCols[ci++];
                    if (have.has(c.name)) continue;
                    const decl = [q(c.name), c.type].filter(Boolean).join(' ');
                    tenantDb.run(`ALTER TABLE ${q(t.name)} ADD COLUMN ${decl}`, (e6) => {
                      if (e6) console.error(`[Tenant Schema] Erro ao adicionar ${t.name}.${c.name}:`, e6.message);
                      nextCol();
                    });
                    return;
                  }
                  nextTable();
                };
                nextCol();
              });
            });
          });
        };
        nextTable();
      });
    });
  });
}




function broadcastProdutos(targetSocket = io) {
  db.all(`SELECT * FROM produtos`, (err, rows) => {
    if (err) return;
    const produtos = rows || [];

    db.all(`SELECT * FROM configuracoes WHERE chave IN ('destaques_ativos', 'destaques_itens')`, (e, configs) => {
      let destaquesAtivos = true; // default ativado
      let destaquesItens = null;

      if (configs) {
        configs.forEach(c => {
          if (c.chave === 'destaques_ativos') destaquesAtivos = (c.valor === 'true');
          if (c.chave === 'destaques_itens' && c.valor) {
            try { destaquesItens = JSON.parse(c.valor); } catch (ex) { }
          }
        });
      }

      if (!destaquesAtivos) {
        targetSocket.emit('produtos_atualizados', produtos);
        return;
      }

      db.all(`SELECT productName, SUM(quantity) as qty FROM pedidos WHERE status='Finalizado' GROUP BY productName ORDER BY qty DESC LIMIT 15`, (errTop, topRows) => {
        let topNames = (topRows || []).map(r => r.productName);

        let finalDestaques = [];
        if (destaquesItens && Array.isArray(destaquesItens)) {
          finalDestaques = destaquesItens;
        } else {
          finalDestaques = topNames.slice(0, 8); // Top 8 por padrão
        }

        const produtosDestaque = [];
        finalDestaques.forEach((nomeDestaque, idx) => {
          const pOrig = produtos.find(p => p.nome === nomeDestaque);
          if (pOrig) {
            produtosDestaque.push({
              ...pOrig,
              id: pOrig.id + 90000 + idx, // ID virtual
              categoria: 'Mais Pedidos',
              originalId: pOrig.id
            });
          }
        });

        targetSocket.emit('produtos_atualizados', [...produtosDestaque, ...produtos]);
      });
    });
  });
}

function broadcastPedidos() {
  if (pedidosDebounceTimeout) clearTimeout(pedidosDebounceTimeout);
  const tid = tenantContext.getStore();
  pedidosDebounceTimeout = setTimeout(() => {
    tenantContext.run(tid || 1, () => {
      if (!isTenantFeatureEnabled(tid || 1, 'tempo_real')) return;
      db.all(`SELECT * FROM pedidos WHERE status NOT IN ('Finalizado','Cancelado') ORDER BY createdAt ASC`, [], (err, rows) => {
        if (!err) {
          const rowsAll = rows || [];
          const rowsAbertos = rowsAll.filter(r => r.status !== 'Pago' && r.status !== 'Fracionado');
          io.emit('pedidos_atualizados', rowsAbertos);
          io.emit('initial_data', rowsAbertos);
          io.emit('pedidos_pdv_atualizados', rowsAll);
          io.emit('initial_pdv_data', rowsAll);
        }
      });
    });
  }, 300);
}

let pdvCalls = [];

function broadcastMesaClientes() {
  db.all(`SELECT * FROM mesa_clientes`, [], (err, rows) => {
    if (!err) {
      io.emit('mesa_clientes_atualizados', rows || []);
    }
  });
}

/* ── Socket auth helpers ───────────────────────────────────────────── */
const ADMIN_CARGOS = ['Admin', 'Administrador', 'adm', 'Gerente'];

/** Retorna true se o socket tem token JWT com cargo de admin */
function exigirAdminSocket(socket) {
  const cargo = socket.auth?.cargo || '';
  if (!ADMIN_CARGOS.includes(cargo)) {
    socket.emit('erro_servidor', 'Apenas administradores podem executar esta ação.');
    return false;
  }
  return true;
}

/** Retorna true se o socket tem token JWT válido */
function exigirAuthSocket(socket) {
  if (!socket.auth) {
    socket.emit('erro_servidor', 'Autentique-se para executar esta ação.');
    return false;
  }
  return true;
}

io.on('connection', (socket) => {
  // (Segurança) Autenticação opcional via JWT: conexões sem token válido continuam
  // permitidas (ex.: cliente acessando o cardápio), mas ficam marcadas como anônimas
  // e não podem executar eventos sensíveis (get_pedidos, atualizar_status, etc.).
  const token = socket.handshake.query.token;
  let socketTenantId = 1;
  socket.auth = null;
  if (token && typeof token === 'string') {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socketTenantId = decoded.restaurante_id;
      socket.auth = decoded;
    } catch (e) { }
  }

  // Tenants sem token (ex.: cliente que escaneou o QR do cardápio) usam o
  // restaurante_id informado na própria URL/query do socket.
  
  // --- GAMIFICACAO / JOGOS DE MESA ---
  
  function getHandValue(cards) {
    let value = 0;
    let aces = 0;
    for(let card of cards) {
      const v = card.slice(0, -1);
      if(v === 'A') { value += 11; aces++; }
      else if(['J','Q','K'].includes(v)) value += 10;
      else value += parseInt(v);
    }
    while(value > 21 && aces > 0) { value -= 10; aces--; }
    return value;
  }

  socket.on('game_create_lobby', (data) => {
    const roomId = socketTenantId + '_' + data.mesa;
    const cid = data.cliente_id || socket.id;
    
    let initialState = {};
    if (data.type === 'velha') initialState = { board: Array(9).fill(null), turn: cid };
    else if (data.type === 'blackjack') initialState = { deck: [], dealerCards: [], turnIndex: 0 };
    else if (data.type === 'batata_quente') initialState = { currentHolder: null, timer: null };

    tableGames[roomId] = {
      status: 'waiting', type: data.type, prize: data.prize, host: cid,
      players: { [cid]: { name: data.cliente_nome || 'Cliente 1', id: cid, ready: true, choice: null, actionTime: null, state: {} } },
      winner: null, loser: null, state: initialState
    };
    io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game: tableGames[roomId] });
  });

  socket.on('game_join_lobby', (data) => {
    const roomId = socketTenantId + '_' + data.mesa;
    const game = tableGames[roomId];
    if(game && game.status === 'waiting') {
      const cid = data.cliente_id || socket.id;
      game.players[cid] = { name: data.cliente_nome || 'Cliente', id: cid, ready: true, choice: null, actionTime: null, state: {} };
      
      const pKeys = Object.keys(game.players);
      let startGame = false;
      
      if (['par_impar', 'reflexo', 'velha'].includes(game.type) && pKeys.length >= 2) startGame = true;
      
      if(startGame) game.status = 'playing';
      io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
    }
  });

  socket.on('game_start', (data) => {
    const roomId = socketTenantId + '_' + data.mesa;
    const game = tableGames[roomId];
    if(game && game.status === 'waiting' && game.host === (data.cliente_id || socket.id)) {
      game.status = 'playing';
      
      if (game.type === 'batata_quente') {
        const pKeys = Object.keys(game.players);
        game.state.currentHolder = pKeys[Math.floor(Math.random() * pKeys.length)];
        const timeToExplode = 15000 + Math.random() * 25000;
        
        setTimeout(() => {
          if (tableGames[roomId] === game && game.status === 'playing') {
            game.status = 'finished';
            game.loser = game.state.currentHolder; // current holder loses
            io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
            setTimeout(() => { if(tableGames[roomId] === game) delete tableGames[roomId]; }, 15000);
          }
        }, timeToExplode);
      } else if (game.type === 'roleta_russa' || game.type === 'roleta_consequencias') {
         setTimeout(() => {
           game.status = 'finished';
           const pKeys = Object.keys(game.players);
           game.loser = pKeys[Math.floor(Math.random() * pKeys.length)];
           if (game.type === 'roleta_consequencias') {
             const cons = ['Pagar a conta inteira!', 'Imitar um pinguim', 'Beber um copo de agua de uma vez', 'Pagar a proxima bebida', 'Ficar sem celular por 10 min'];
             game.prize = cons[Math.floor(Math.random() * cons.length)];
           }
           io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
           setTimeout(() => { if(tableGames[roomId] === game) delete tableGames[roomId]; }, 15000);
         }, 3000);
      } else if (game.type === 'blackjack') {
         const suits = ['H', 'D', 'C', 'S'];
         const values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
         let deck = [];
         suits.forEach(s => values.forEach(v => deck.push(v+s)));
         deck = deck.sort(() => Math.random() - 0.5);
         game.state.deck = deck;
         
         const pKeys = Object.keys(game.players);
         game.state.turnOrder = pKeys;
         game.state.turnIndex = 0;
         game.state.dealerCards = [deck.pop(), deck.pop()];
         
         pKeys.forEach(p => {
           game.players[p].state.cards = [deck.pop(), deck.pop()];
           game.players[p].state.status = 'playing'; // playing, stand, bust
         });
      }
      io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
    }
  });

  socket.on('game_action', (data) => {
    const roomId = socketTenantId + '_' + data.mesa;
    const game = tableGames[roomId];
    if(!game || game.status !== 'playing') return;
    const cid = data.cliente_id || socket.id;
    if(!game.players[cid]) return;

    if (game.type === 'batata_quente') {
      if (game.state.currentHolder === cid) {
         const pKeys = Object.keys(game.players).filter(id => id !== cid);
         game.state.currentHolder = pKeys[Math.floor(Math.random() * pKeys.length)];
         io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
      }
      return;
    }

    if (game.type === 'velha') {
      if (game.state.turn !== cid) return;
      if (game.state.board[data.choice] !== null) return;
      
      const pKeys = Object.keys(game.players);
      const isP1 = pKeys[0] === cid;
      game.state.board[data.choice] = isP1 ? 'X' : 'O';
      
      const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      const b = game.state.board;
      let winner = null;
      for (let w of wins) {
         if (b[w[0]] && b[w[0]] === b[w[1]] && b[w[0]] === b[w[2]]) {
            winner = cid; break;
         }
      }
      
      if (winner) {
         game.status = 'finished'; game.winner = winner;
         setTimeout(() => { if(tableGames[roomId] === game) delete tableGames[roomId]; }, 15000);
      } else if (!b.includes(null)) {
         game.status = 'finished'; game.winner = 'draw';
         setTimeout(() => { if(tableGames[roomId] === game) delete tableGames[roomId]; }, 15000);
      } else {
         game.state.turn = isP1 ? pKeys[1] : pKeys[0];
      }
      io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
      return;
    }
    
    if (game.type === 'blackjack') {
       if (game.state.turnOrder[game.state.turnIndex] !== cid) return;
       const pState = game.players[cid].state;
       
       if (data.choice === 'hit') {
         pState.cards.push(game.state.deck.pop());
         if (getHandValue(pState.cards) > 21) pState.status = 'bust';
       } else if (data.choice === 'stand') {
         pState.status = 'stand';
       }
       
       if (pState.status === 'bust' || pState.status === 'stand') {
         game.state.turnIndex++;
         
         if (game.state.turnIndex >= game.state.turnOrder.length) {
            // Dealer turn
            let dealerVal = getHandValue(game.state.dealerCards);
            while(dealerVal < 17) {
              game.state.dealerCards.push(game.state.deck.pop());
              dealerVal = getHandValue(game.state.dealerCards);
            }
            
            // Calc winners
            game.status = 'finished';
            const dealerBust = dealerVal > 21;
            
            const pKeys = Object.keys(game.players);
            let closest = -1; let bestPlayer = null;
            
            pKeys.forEach(p => {
               const val = getHandValue(game.players[p].state.cards);
               if (val <= 21) {
                  if (val > closest) { closest = val; bestPlayer = p; }
               }
            });
            
            if (bestPlayer && (dealerBust || closest > dealerVal)) game.winner = bestPlayer;
            else game.winner = 'dealer'; // no player beat dealer
            
            setTimeout(() => { if(tableGames[roomId] === game) delete tableGames[roomId]; }, 20000);
         }
       }
       io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
       return;
    }

    // fallback for par_impar and reflexo
    game.players[cid].choice = data.choice;
    game.players[cid].actionTime = Date.now();
    const pKeys = Object.keys(game.players);
    const allPlayed = pKeys.every(k => game.players[k].choice !== null);
    if(allPlayed) {
      game.status = 'finished';
      if(game.type === 'par_impar') {
        const p1 = game.players[pKeys[0]]; const p2 = game.players[pKeys[1]];
        const isPar = ((p1.choice.fingers || 0) + (p2.choice.fingers || 0)) % 2 === 0;
        game.winner = (p1.choice.side === 'par' && isPar) || (p1.choice.side === 'impar' && !isPar) ? p1.id : p2.id;
      } else if (game.type === 'reflexo') {
        const p1 = game.players[pKeys[0]]; const p2 = game.players[pKeys[1]];
        game.winner = p1.actionTime < p2.actionTime ? p1.id : p2.id;
      }
      io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game });
      setTimeout(() => {
        if(tableGames[roomId] === game) delete tableGames[roomId];
        io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game: null });
      }, 15000);
    }
  });
  
  socket.on('game_cancel', (data) => {
    const roomId = socketTenantId + '_' + data.mesa;
    if(tableGames[roomId]) { delete tableGames[roomId]; io.to('restaurante_' + socketTenantId).emit('game_lobby_updated', { mesa: data.mesa, game: null }); }
  });

  socket.on('get_table_game', (data) => {
    const roomId = socketTenantId + '_' + data.mesa;
    socket.emit('game_lobby_updated', { mesa: data.mesa, game: tableGames[roomId] || null });
  });
  // --- FIM GAMIFICACAO ---

  if (!socket.auth) {
    const qrid = parseInt(socket.handshake.query.restaurante_id, 10);
    if (Number.isFinite(qrid) && qrid > 0) socketTenantId = qrid;
  }

  socket.restaurante_id = socketTenantId;
  socket.join(`restaurante_${socketTenantId}`);

  // Contagem de sockets por tenant (métricas de pico) + snapshot de features
  metricAddSocket(socket);
  socket.features = getTenantFeaturesSync(socketTenantId);

  // [iFood On-Demand] Notifica sessão ativa para o tenant
  try {
    const roomSockets = io.sockets.adapter.rooms.get(`restaurante_${socketTenantId}`);
    const activeCount = roomSockets ? roomSockets.size : 1;
    ifoodApi.notifyTenantSessionState(socketTenantId, activeCount, { io, masterDb, tenantContext, getTenantDb, isFeatureEnabled: isTenantFeatureEnabled });
  } catch (e) {}

  // Wrap all socket events in tenant context!
  const originalOn = socket.on.bind(socket);
  socket.on = function (eventName, callback) {
    originalOn(eventName, (...args) => {
      tenantContext.run(socketTenantId, () => {
        callback(...args);
      });
    });
  };

  let mpPollInterval = null;

  // --- CAPTURA AUTOMÁTICA DE TODOS OS LOGS DE SOCKET.IO + AÇÕES DO USUÁRIO ---
  socket.onAny((event, ...args) => {
    // Filtra pings, heartbeats e requisições iniciais de leitura para manter o terminal limpo
    if ([
      'get_connected_devices', 'get_auditoria_logs', 'get_api_logs', 'ping', 'pong',
      'get_produtos', 'get_funcionarios', 'get_promocoes', 'get_estado_caixa',
      'get_qr_pedidos_pendentes', 'get_mesas', 'registrar_sessao', 'registrar_sessao_detalhada'
    ].includes(event)) {
      return;
    }

    const conn = typeof activeSockets !== 'undefined' ? activeSockets.get(socket.id) : null;
    const operador = (conn && conn.user && conn.user !== 'Visitante') ? conn.user : (socket.auth?.nome || 'Operador (Socket)');
    const cargo = conn?.cargo || socket.auth?.cargo || 'Operador';
    const ip = conn ? conn.ip : (socket.handshake && socket.handshake.address ? socket.handshake.address.replace('::ffff:', '') : '127.0.0.1');

    let payload = '';
    try {
      if (args && args.length > 0) {
        const cleanArgs = JSON.parse(JSON.stringify(args));
        cleanArgs.forEach(arg => {
          if (typeof arg === 'object' && arg !== null) {
            if (arg.senha) arg.senha = '***';
            if (arg.password) arg.password = '***';
            if (arg.token) arg.token = '***';
          }
        });
        payload = JSON.stringify(cleanArgs).substring(0, 300);
      }
    } catch (e) { }

    // Log bonitão no terminal do servidor com detalhes completos da ação/botão
    if (event === 'registrar_clique_botao') {
      const btnInfo = args[0] || {};
      console.log(`[Cli-Click] 👤 Usuario: ${operador} (${cargo}) | 🏪 Rest. ID: #${socketTenantId} | 📄 Tela: ${btnInfo.pagina || 'Sistema'} | 🔘 Botao/Acao: '${btnInfo.botao || event}'`);
    } else {
      console.log(`[Socket] 👤 Usuario: ${operador} (${cargo}) | 🏪 Rest. ID: #${socketTenantId} | ⚡ Evento: ${event} | 📦 Dados: ${payload || '{}'}`);
    }

    tenantContext.run(socketTenantId, () => {
      db.run(
        `INSERT INTO api_logs (operador, ip, metodo, endpoint, detalhes, status_code) VALUES (?, ?, 'SOCKET', ?, ?, 200)`,
        [operador, ip, `socket://${event}`, payload || '{}'],
        (err) => {
          if (err) console.error("Erro ao registrar log de socket:", err);
        }
      );
    });
  });

  // --- AUDITORIA DE ACESSO E NAVEGAÇÃO DE PÁGINAS ---
  socket.on('registrar_acesso_pagina', (data) => {
    if (!data) return;
    const { pagina, titulo, autorizado, motivo } = data;
    const conn = typeof activeSockets !== 'undefined' ? activeSockets.get(socket.id) : null;
    const operador = (conn && conn.user && conn.user !== 'Visitante') ? conn.user : 'Operador do Sistema';
    const cargo = conn?.cargo || 'Operador';

    console.log(`[Cli-Click] 📄 NAVEGACAO | 👤 ${operador} (${cargo}) | 🏪 Rest. ID: #${socketTenantId} | Seção: ${titulo || pagina}`);

    const acao = (autorizado === false) ? 'TENTATIVA_ACESSO_NEGADO' : 'ACESSO_PAGINA';
    const detalhes = `Acessou/Navegou para a seção: ${titulo || pagina || 'Sistema'} (${pagina || ''})`;
    const risco = (autorizado === false) ? 'ALTO' : 'BAIXO';

    if (typeof global.registrarAuditoria === 'function') {
      global.registrarAuditoria(
        operador,
        acao,
        detalhes,
        motivo || (autorizado === false ? 'Bloqueio por permissão de usuário' : 'Navegação de rotina'),
        risco,
        socket.id
      );
    }
  });

  const ua = socket.handshake.headers['user-agent'] || '';
  const parsedUa = parseUserAgent(ua);
  const rawIp = socket.handshake.address ? socket.handshake.address.replace('::ffff:', '') : '127.0.0.1';
  const clientIp = (rawIp === '::1' || rawIp === '127.0.0.1') ? '127.0.0.1 (LocalHost)' : rawIp;

  activeSockets.set(socket.id, {
    id: socket.id,
    ip: clientIp,
    user: 'Visitante',
    cargo: 'Operador',
    os: parsedUa.os,
    browser: parsedUa.browser,
    model: parsedUa.model,
    icon: parsedUa.icon,
    isMobile: parsedUa.isMobile,
    device: parsedUa.fullDeviceStr,
    connectedAt: Date.now()
  });


  socket.on('registrar_sessao_detalhada', (data) => {
    const conn = activeSockets.get(socket.id);
    if (conn && data) {
      if (data.nome && data.nome.trim()) conn.user = data.nome.trim();
      if (data.cargo && data.cargo.trim()) conn.cargo = data.cargo.trim();
      if (data.model && data.model.trim()) conn.model = data.model.trim();
      if (data.os) conn.os = data.os;
      if (data.browser) conn.browser = data.browser;
      if (data.icon) conn.icon = data.icon;
      if (data.resolution) conn.resolution = data.resolution;

      conn.device = `${conn.model} (${conn.os} • ${conn.browser})`;
      io.emit('connected_devices_updated');

    }
  });


  
  // Alias: front-end emite 'get_orders' -> responde com pedidos do caixa
  socket.on('get_orders', () => {
    db.all("SELECT * FROM pedidos WHERE status NOT IN ('Finalizado','Pago','Cancelado') ORDER BY createdAt ASC", [], (err, rows) => {
      const dados = rows || [];
      socket.emit('pedidos_atualizados', dados);
      socket.emit('initial_data', dados);
    });
  });

  socket.on('get_pedidos', () => {
    if (!socket.auth) return;
    db.all("SELECT * FROM pedidos WHERE status NOT IN ('Finalizado','Pago','Cancelado') ORDER BY createdAt ASC", [], (err, rows) => {
      socket.emit('pedidos_atualizados', rows || []);
    });
  });

  // ── NOTIFICAÇÕES PUSH: registrar / remover inscrição do dispositivo ──
  socket.on('register_push', (data) => {
    const sub = data && data.subscription;
    if (!sub || !sub.endpoint || !sub.keys) return;
    const role = (data.role === 'cozinha') ? 'cozinha' : 'garcom';
    db.run(
      `INSERT INTO push_subscriptions (endpoint, auth, p256dh, role, nome) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET auth = excluded.auth, p256dh = excluded.p256dh, role = excluded.role, nome = excluded.nome`,
      [sub.endpoint, sub.keys.auth || '', sub.keys.p256dh || '', role, data.nome || ''],
      (err) => { if (err) console.error('Erro ao salvar inscrição push:', err); }
    );
  });

  socket.on('unregister_push', (data) => {
    if (!data || !data.endpoint) return;
    db.run(`DELETE FROM push_subscriptions WHERE endpoint = ?`, [data.endpoint], (err) => {
      if (err) console.error('Erro ao remover inscrição push:', err);
    });
  });

  socket.on('get_formas_pagamento', () => {
    broadcastFormasPagamento(socket);
  });

  socket.on('get_ia_config', () => {
    socket.emit('ia_config_atualizada', {
      minutosAtencao: IA_CONFIG.minutosAtencao,
      segundosPulseNovoPedido: IA_CONFIG.segundosPulseNovoPedido,
      minutosManobra: IA_CONFIG.minutosManobra,
      minutosCriticoEspera: IA_CONFIG.minutosCriticoEspera,
      minutosAlertaEspera: IA_CONFIG.minutosAlertaEspera,
      minutosRefillCerveja: IA_CONFIG.minutosRefillCerveja
    });
  });

  socket.on('add_forma_pagamento', (payload) => {
    const { nome, tipo, icone, taxa, prazo_dias, ativo } = payload || {};
    if (!nome) return;
    db.run(
      `INSERT INTO formas_pagamento (nome, tipo, taxa, prazo_dias, ativo, icone) VALUES (?, ?, ?, ?, ?, ?)`,
      [nome, tipo || 'credito', parseFloat(taxa) || 0, parseInt(prazo_dias) || 0, ativo !== undefined ? (ativo ? 1 : 0) : 1, icone || 'ph-credit-card'],
      function (err) {
        if (err) return;
        broadcastFormasPagamento();
      }
    );
  });

  socket.on('update_forma_pagamento', (payload) => {
    const { id, nome, tipo, icone, taxa, prazo_dias, ativo } = payload || {};
    if (!id || !nome) return;
    db.run(
      `UPDATE formas_pagamento SET nome = ?, tipo = ?, taxa = ?, prazo_dias = ?, ativo = ?, icone = ? WHERE id = ?`,
      [nome, tipo || 'credito', parseFloat(taxa) || 0, parseInt(prazo_dias) || 0, ativo ? 1 : 0, icone || 'ph-credit-card', id],
      function (err) {
        if (err) return;
        broadcastFormasPagamento();
      }
    );
  });

  socket.on('delete_forma_pagamento', (id) => {
    if (!exigirAdminSocket(socket)) return;
    if (!id) return;
    db.get(`SELECT nome FROM formas_pagamento WHERE id = ?`, [id], (err, row) => {
      if (err || !row) return;
      db.get(`SELECT COUNT(*) as count FROM pedidos WHERE paymentMethod = ?`, [row.nome], (e, r) => {
        if (!e && r && r.count > 0) {
          return socket.emit('erro_caixa', `"${row.nome}" não pode ser excluído pois já foi utilizado em ${r.count} pedido(s). Apenas desative-o.`);
        }
        db.run(`DELETE FROM formas_pagamento WHERE id = ?`, [id], function (err2) {
          if (err2) return;
          broadcastFormasPagamento();
        });
      });
    });
  });

  socket.on('toggle_forma_pagamento', (payload) => {
    const { id, ativo } = payload || {};
    if (!id) return;
    db.run(`UPDATE formas_pagamento SET ativo = ? WHERE id = ?`, [ativo ? 1 : 0, id], function (err) {
      if (err) return;
      broadcastFormasPagamento();
    });
  });

  socket.on('get_connected_devices', () => {
    const deviceList = Array.from(activeSockets.values()).map(d => ({
      ...d,
      tempoConectadoStr: getTempoConectadoStr(d.connectedAt)
    }));
    socket.emit('connected_devices', deviceList);
  });

  socket.on('registrar_sessao', ({ nome, cargo }) => {
    const conn = activeSockets.get(socket.id);
    if (conn) {
      conn.user = nome || 'Visitante';
      conn.device = (cargo || 'Garçom') + ' (' + conn.deviceType + ')';
    }
  });
  // -- CRIAR CUPOM --
  socket.on('criar_cupom', (data) => {
    const itensStr = JSON.stringify(data.itens);
    const limiteUsos = parseInt(data.limite_usos) || 1;
    const titulo = data.titulo || data.codigo || 'CUPOM';
    db.run(
      "INSERT INTO cupons (codigo, itens_json, usado, validade, dias_horarios_json, valor_tipo, valor, limite_usos, titulo) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)",
      [data.codigo, itensStr, data.validade, JSON.stringify(data.dias_horarios), data.valor_tipo, data.valor, limiteUsos, titulo],
      function (err) {
        if (err) {
          socket.emit('cupom_criado_error', 'Código já existe ou erro no banco.');
        } else {
          socket.emit('cupom_criado_sucesso', { codigo: data.codigo, titulo: titulo });
          io.emit('cupons_atualizados');
        }
      });
  });

  /* Emitir URL do ponto usando custom_domain se disponível */
  const _emitPontoUrl = (socketRef, tid) => {
    const ipLocal = getLocalIp();
    const base = `painel-funcionario.html?t=${pontoToken}&restaurante_id=${tid}`;
    masterDb.get(`SELECT custom_domain, slug FROM restaurantes WHERE id = ?`, [tid], (eM, row) => {
      let domain, usePort = false;
      if (row && row.custom_domain && row.custom_domain.trim()) {
        domain = row.custom_domain.trim();
      } else if (row && row.slug && BASE_DOMAIN) {
        domain = `${row.slug}.${BASE_DOMAIN}`;
      } else {
        domain = ipLocal;
        usePort = true;
      }
      const hostPort = usePort ? `${domain}:${PORT}` : domain;
      socketRef.emit('update_ponto_token', { url: `https://${hostPort}/${base}` });
      socketRef.emit('server_ip', domain);
    });
  };
  _emitPontoUrl(socket, socket.restaurante_id || 1);
  console.log('Cliente conectado:', socket.id);

  // ── LICENÇA: ativação ──────────────────────────────────

  socket.on('activate_license', async ({ chave }) => {
    const result = await licenseManager.activateLicense(chave);
    socket.emit('license_activated', result);
    if (result.ok) {
      // Notificar todos os clientes do novo status
      io.emit('license_status', licenseManager.getState());
      io.emit('restaurant_name', licenseManager.getRestaurantName());
    }
  });

  // Enviar nome do restaurante ao conectar
  socket.emit('restaurant_name', licenseManager.getRestaurantName());
  socket.emit('license_status', licenseManager.getState());

  // ── Configuração do Apps Script ──────────────────────────
  const LICENSE_CONFIG_FILE = require('path').join(
    require('os').homedir(), 'AppData', 'Roaming', 'ChefCozinha', 'license-config.json'
  );

  socket.on('get_license_config', () => {
    try {
      if (fs.existsSync(LICENSE_CONFIG_FILE)) {
        const cfg = JSON.parse(fs.readFileSync(LICENSE_CONFIG_FILE, 'utf8'));
        socket.emit('license_config_loaded', cfg);
      } else {
        socket.emit('license_config_loaded', {});
      }
    } catch { socket.emit('license_config_loaded', {}); }
  });

  socket.on('save_license_config', ({ scriptUrl, sheetId, trialDias, modoOffline }) => {
    try {
      const cfg = { scriptUrl, sheetId, trialDias: trialDias || 14, modoOffline: !!modoOffline };
      fs.writeFileSync(LICENSE_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
      // Atualizar o license-manager com a nova URL
      if (scriptUrl) process.env.LICENSE_URL = scriptUrl;
      if (typeof licenseManager.recheckLicense === 'function') {
        licenseManager.recheckLicense();
      }
      socket.emit('license_config_saved', { ok: true });
      io.emit('license_status', licenseManager.getState());
      io.emit('restaurant_name', licenseManager.getRestaurantName());
    } catch (e) {
      socket.emit('license_config_saved', { ok: false, error: e.message });
    }
  });

  socket.on('test_license_connection', () => {
    try {
      let scriptUrl = '';
      if (fs.existsSync(LICENSE_CONFIG_FILE)) {
        scriptUrl = JSON.parse(fs.readFileSync(LICENSE_CONFIG_FILE, 'utf8')).scriptUrl || '';
      }
      if (!scriptUrl) {
        socket.emit('license_test_result', { ok: false, error: 'URL do Apps Script não configurada. Salve as configurações primeiro.' });
        return;
      }
      const url = scriptUrl + '?action=validate&installId=TEST-PING&v=test';
      const mod = url.startsWith('https') ? require('https') : require('http');
      const req = mod.get(url, { timeout: 8000 }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            socket.emit('license_test_result', { ok: true, data: parsed });
          } catch {
            socket.emit('license_test_result', { ok: false, error: 'Resposta inválida do Apps Script.' });
          }
        });
      });
      req.on('error', (e) => socket.emit('license_test_result', { ok: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); socket.emit('license_test_result', { ok: false, error: 'Timeout — servidor demorou mais de 8s.' }); });
    } catch (e) {
      socket.emit('license_test_result', { ok: false, error: e.message });
    }
  });

  // Enviar installId junto com o status
  socket.on('get_license_status', () => {
    const state = licenseManager.getState();
    socket.emit('license_status', { ...state, installId: state.installId });
  });

  socket.on('transferir_mesa', ({ mesaAtual, novaMesa, operador }) => {
    db.run(`UPDATE pedidos SET localName = ? WHERE localName = ? AND status != 'Finalizado'`, [novaMesa, mesaAtual], (err) => {
      if (!err) {
        global.registrarAuditoria(operador || 'Sistema', 'TRANSFERENCIA_MESA', `Mesa ${mesaAtual} transferida para ${novaMesa}`, 'Operação de Salão', 'MEDIO');
        broadcastPedidos();
      }
    });
  });

  socket.on('juntar_mesas', ({ mesaA, mesaB, operador }) => {
    const grupo = `${mesaA} + ${mesaB}`;
    db.run(`UPDATE pedidos SET mesa_grupo = ? WHERE localName IN (?, ?) AND status != 'Finalizado'`, [grupo, mesaA, mesaB], (err) => {
      if (!err) {
        global.registrarAuditoria(operador || 'Sistema', 'JUNCAO_MESAS', `Mesa ${mesaA} e ${mesaB} unidas no grupo ${grupo}`, 'Operação de Salão', 'MEDIO');
        broadcastPedidos();
      }
    });
  });

  // Mover itens de uma mesa para outra (mesa origem fica livre)
  socket.on('transferir_mesas_itens', ({ mesaA, mesaB, operador }) => {
    db.run(`UPDATE pedidos SET localName = ?, mesa_grupo = NULL WHERE localName = ? AND status != 'Finalizado'`, [mesaB, mesaA], (err) => {
      if (!err) {
        db.run(`UPDATE mesas SET status = 'Disponível' WHERE nome = ?`, [mesaA], () => {
          db.all(`SELECT * FROM mesas`, (e, rows) => {
            io.emit('mesas_atualizadas', rows || []);
          });
        });
        global.registrarAuditoria(operador || 'Sistema', 'TRANSFERENCIA_MESAS_ITENS', `Itens de ${mesaA} movidos para ${mesaB}. Mesa ${mesaA} liberada.`, 'Operação de Salão', 'MEDIO');
        broadcastPedidos();
      }
    });
  });

  function liberarMesaSeVazia(mesaName) {
    if (!mesaName) return;
    db.get(`SELECT COUNT(*) as cnt FROM pedidos WHERE localName = ? AND status NOT IN ('Finalizado','Pago','Cancelado')`, [mesaName], (err, row) => {
      if (!err && row && row.cnt === 0) {
        db.run(`UPDATE mesas SET status = 'Disponível' WHERE nome = ? AND status != 'Disponível'`, [mesaName], () => {
          db.all(`SELECT * FROM mesas`, (e, rows) => {
            io.emit('mesas_atualizadas', rows || []);
          });
        });
      }
    });
  }

  socket.on('transferir_item', ({ itemId, novaMesa, operador }) => {
    db.get(`SELECT localName FROM pedidos WHERE id = ?`, [itemId], (errGet, rowGet) => {
      const mesaAntiga = rowGet ? rowGet.localName : null;
      db.run(`UPDATE pedidos SET localName = ?, mesa_grupo = NULL WHERE id = ?`, [novaMesa, itemId], (err) => {
        if (!err) {
          global.registrarAuditoria(operador || 'Sistema', 'TRANSFERENCIA_ITEM', `Item ${itemId} transferido para ${novaMesa}`, 'Operação de Salão', 'MEDIO');
          broadcastPedidos();
          liberarMesaSeVazia(mesaAntiga);
        }
      });
    });
  });

  socket.on('atribuir_comanda_item', ({ itemId, comandaName, operador }) => {
    const comandaVal = (comandaName && String(comandaName).trim()) ? String(comandaName).trim() : null;
    db.run(`UPDATE pedidos SET mesa_comanda = ? WHERE id = ?`, [comandaVal, itemId], (err) => {
      if (!err) {
        global.registrarAuditoria(operador || 'Sistema', 'ATRIBUICAO_COMANDA', `Item ${itemId} associado à comanda: ${comandaVal}`, 'Operação de Salão', 'BAIXO');
        broadcastPedidos();
      } else {
        console.error('Erro ao atribuir comanda ao item:', err);
      }
    });
  });

  // Fetch all active orders and send to the new client (always, regardless of IA config)
  // Dados iniciais SEMPRE sao enviados — sem isso o caixa desktop nao mostra pedidos.
  tenantContext.run(socketTenantId, () => {
    db.all(`SELECT * FROM pedidos WHERE status NOT IN ('Finalizado','Cancelado') ORDER BY createdAt ASC`, [], (err, rows) => {
      if (err) {
        console.error(err);
        return;
      }
      const rowsAll = rows || [];
      socket.emit('initial_data', rowsAll.filter(r => r.status !== 'Pago'));
      socket.emit('initial_pdv_data', rowsAll);
    });
  });


  socket.on('validar_cupom', ({ mesaName, codigo, userName }) => {
    db.get(`SELECT * FROM cupons WHERE codigo = ?`, [codigo], (err, cupom) => {
      if (err || !cupom) return socket.emit('cupom_invalido', { error: 'Cupom não encontrado ou código inválido.' });

      const limiteUsos = cupom.limite_usos || 1;
      const totalUsados = cupom.usado || 0;
      if (totalUsados >= limiteUsos) {
        return socket.emit('cupom_invalido', { error: 'Este cupom já atingiu o limite máximo de usos!' });
      }

      // Validar Data
      const agora = new Date();
      if (cupom.validade) {
        const dataValidade = new Date(cupom.validade + "T23:59:59");
        if (agora > dataValidade) return socket.emit('cupom_invalido', { error: 'Cupom expirado.' });
      }

      // Validar Dias/Horários
      if (cupom.dias_horarios_json) {
        try {
          const dh = JSON.parse(cupom.dias_horarios_json);
          const diasSemana = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
          const hojeDia = diasSemana[agora.getDay()];

          if (dh && dh[hojeDia]) {
            const configHoje = dh[hojeDia];
            if (!configHoje.ativo) return socket.emit('cupom_invalido', { error: 'Cupom não é válido para o dia de hoje (' + hojeDia + ').' });

            const horaAtualStr = agora.getHours().toString().padStart(2, '0') + ':' + agora.getMinutes().toString().padStart(2, '0');
            if (configHoje.inicio && horaAtualStr < configHoje.inicio) return socket.emit('cupom_invalido', { error: 'Cupom só é válido a partir de ' + configHoje.inicio });
            if (configHoje.fim && horaAtualStr > configHoje.fim) return socket.emit('cupom_invalido', { error: 'Cupom era válido apenas até as ' + configHoje.fim });
          }
        } catch (e) { }
      }

      // Cupom válido, marcar como usado (incrementar usos)
      db.run(`UPDATE cupons SET usado = usado + 1 WHERE codigo = ?`, [codigo], (err) => {
        if (err) return console.error(err);

        global.registrarAuditoria(userName || 'Garçom', 'USO_CUPOM', `Cupom ${codigo} aplicado na mesa ${mesaName}`, 'Promoção', 'MEDIO');

        try {
          const itens = JSON.parse(cupom.itens_json);
          const timeStr = agora.getHours().toString().padStart(2, '0') + ':' + agora.getMinutes().toString().padStart(2, '0');

          /* Logar uso individual no cupons_usos */
          db.run(
            `INSERT INTO cupons_usos (cupom_codigo, mesa, garcom, cliente_nome, itens_resgatados) VALUES (?, ?, ?, ?, ?)`,
            [codigo, mesaName, userName || 'Garçom', null, JSON.stringify(itens.map(i => i.nome + ' x' + (i.quantity || 1)))]
          );

          let hasInserted = false;

          // Inserir itens
          itens.forEach((item) => {
            db.run(
              `INSERT INTO pedidos (productName, productEmoji, quantity, total, status, localName, userName, time, sector, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
              [item.nome + ' (Resgate)', item.emoji || '🎁', item.quantity || 1, '0,00', 'Em espera', mesaName, userName || 'Garçom', timeStr, item.sector || 'Bar']
            );
            hasInserted = true;
          });

          // Inserir lógica financeira
          if (cupom.valor_tipo === 'desconto_fixo' && cupom.valor > 0) {
            db.run(
              `INSERT INTO pedidos (productName, productEmoji, quantity, total, status, localName, userName, time, sector, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
              ['Desconto Promocional', '🏏·️', 1, '-' + cupom.valor.toFixed(2).replace('.', ','), 'Pronto', mesaName, userName || 'Garçom', timeStr, 'Caixa']
            );
            hasInserted = true;
          } else if (cupom.valor_tipo === 'preco_fixo' && cupom.valor > 0) {
            db.run(
              `INSERT INTO pedidos (productName, productEmoji, quantity, total, status, localName, userName, time, sector, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
              ['Cobrança de Combo/Cupom', '💲', 1, cupom.valor.toFixed(2).replace('.', ','), 'Pronto', mesaName, userName || 'Garçom', timeStr, 'Caixa']
            );
            hasInserted = true;
          }

          if (hasInserted) {
            broadcastPedidos();
            db.all("SELECT * FROM mesas", (e, r) => io.emit('mesas_atualizadas', r || []));
          }

          socket.emit('cupom_sucesso', { mensagem: 'Cupom aplicado com sucesso!' });
        } catch (error) {
          socket.emit('cupom_invalido', { error: 'Erro ao ler os itens do cupom.' });
        }
      });
    });
  });


  // Garçom envia um novo pedido
  socket.on('buscar_cliente_telefone', (telefone) => {
    if (!telefone) return;
    const cleanPhone = telefone.replace(/\D/g, '');
    db.get(`SELECT nome FROM clientes WHERE telefone = ? OR telefone LIKE ? OR id IN (SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(REPLACE(telefone, ' ', ''), '-', ''), '(', ''), ')', '') = ?) LIMIT 1`, [telefone, `%${cleanPhone}`, cleanPhone], (err, row) => {
      if (row) {
        socket.emit('cliente_telefone_encontrado', { telefone, nome: row.nome });
      } else {
        socket.emit('cliente_telefone_encontrado', { telefone, nome: null });
      }
    });
  });

  socket.on('novo_pedido', (pedido) => {
    // ── VERIFICAÇÃO DE LICENÇA ──
    if (licenseManager.isRestricted()) {
      socket.emit('pedido_erro', { msg: '⚠️ Sistema em modo restrito. Ative a licença para adicionar pedidos.' });
      return;
    }
    if (!pedido || typeof pedido !== 'object') return;
    // (Segurança) Remove marcadores HTML de campos exibidos na fila/cardápio para
    // impedir XSS armazenado via pedido malicioso.
    function _sanitizeXss(v) {
      if (typeof v !== 'string') return v;
      return v.replace(/[<>"'&]/g, function(c) {
        return { '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;', '&':'&amp;' }[c] || '';
      });
    }
    ['productName', 'productEmoji', 'localName', 'userName', 'time', 'mensagem', 'observations'].forEach(function (f) {
      if (typeof pedido[f] === 'string') pedido[f] = _sanitizeXss(pedido[f]);
    });
    if (Array.isArray(pedido.composicoes)) {
      pedido.composicoes = pedido.composicoes.map(c => {
        if (typeof c === 'string') return _sanitizeXss(c);
        if (c && typeof c === 'object') {
          const clean = {};
          for (const k in c) { clean[_sanitizeXss(k)] = _sanitizeXss(c[k]); }
          return clean;
        }
        return c;
      });
    }
    const clientName = pedido.mesa_comanda ? pedido.mesa_comanda.trim() : null;
    const clientPhone = pedido.cliente_telefone ? pedido.cliente_telefone.trim() : null;

    function proceedWithOrder(clienteId) {
      pedido.cliente_id = clienteId || pedido.cliente_id || null;
      let status = pedido.status_inicial || 'Em preparo';
      if (pedido.sector === 'Bar' && status === 'Em espera') {
        status = 'Em preparo';
      }
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0-6
      const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

      // 1. Fetch active promos
      db.all(`SELECT * FROM promocoes WHERE ativo = 1`, [], (err, promocoes) => {
        let comboBonus = null;

        const activePromos = (promocoes || []).map(p => {
          try { return { ...p, config: JSON.parse(p.config || '{}') }; } catch (e) { return { ...p, config: {} }; }
        }).filter(p => {
          const c = p.config;
          if (c.dias_semana && c.dias_semana.length > 0 && !c.dias_semana.includes(dayOfWeek)) return false;
          if (c.horario_inicio && currentTime < c.horario_inicio) return false;
          if (c.horario_fim && currentTime > c.horario_fim) return false;
          return true;
        });

        const livrePromos = activePromos.filter(p => p.config.tipo_promocao === 'livre');
        const comboPromos = activePromos.filter(p => p.config.tipo_promocao === 'combo');
        const precoFixoPromos = activePromos.filter(p => p.config.tipo_promocao === 'preco_fixo');
        const descontoFixoPromos = activePromos.filter(p => p.config.tipo_promocao === 'desconto_fixo');
        const descontoPctPromos = activePromos.filter(p => p.config.tipo_promocao === 'desconto_pct');

        // preco_fixo: override product price server-side
        const matchingPrecoFixo = precoFixoPromos.find(p => p.config.produto_alvo_nome === pedido.productName);
        if (matchingPrecoFixo && matchingPrecoFixo.config.novo_preco > 0) {
          const qty = parseInt(pedido.quantity) || 1;
          pedido.total = (matchingPrecoFixo.config.novo_preco * qty).toFixed(2);
          pedido.promocao_id = matchingPrecoFixo.id;
        }

        // desconto_fixo: apply fixed R$ discount to subtotal
        if (descontoFixoPromos.length > 0 && !matchingPrecoFixo) {
          const descontoMax = Math.max(...descontoFixoPromos.map(p => p.config.desconto || 0));
          const currentTotal = parseFloat(String(pedido.total).replace(',', '.')) || 0;
          const novoTotal = Math.max(0, currentTotal - descontoMax);
          pedido.total = novoTotal.toFixed(2);
          pedido.promocao_id = descontoFixoPromos.find(p => (p.config.desconto || 0) === descontoMax).id;
        }

        // desconto_pct: apply % discount to subtotal
        if (descontoPctPromos.length > 0 && !matchingPrecoFixo && descontoFixoPromos.length === 0) {
          const pctMax = Math.max(...descontoPctPromos.map(p => p.config.desconto_pct || 0));
          const currentTotal = parseFloat(String(pedido.total).replace(',', '.')) || 0;
          const novoTotal = currentTotal * (1 - pctMax / 100);
          pedido.total = Math.max(0, novoTotal).toFixed(2);
          pedido.promocao_id = descontoPctPromos.find(p => (p.config.desconto_pct || 0) === pctMax).id;
        }

        const matchingCombo = comboPromos.find(p => p.config.produto_alvo_nome === pedido.productName);
        if (matchingCombo) {
          comboBonus = matchingCombo.config.produto_brinde_nome;
        }

        if (livrePromos.length > 0) {
          db.all(`SELECT productName FROM pedidos WHERE localName = ? AND status != 'Finalizado'`, [pedido.localName], (err, itemsMesa) => {
            let tableIsLivre = false;
            let activeLivreCategories = [];

            for (const item of (itemsMesa || [])) {
              const lp = livrePromos.find(p => p.config.produto_alvo_nome === item.productName);
              if (lp) {
                tableIsLivre = true;
                if (lp.config.categorias_inclusas) {
                  activeLivreCategories = activeLivreCategories.concat(lp.config.categorias_inclusas);
                }
              }
            }

            if (tableIsLivre) {
              db.get(`SELECT categoria FROM produtos WHERE nome = ?`, [pedido.productName], (err, prodRow) => {
                if (prodRow && activeLivreCategories.includes(prodRow.categoria)) {
                  pedido.total = "0.00";
                }
                savePedidoAndBonus();
              });
            } else {
              savePedidoAndBonus();
            }
          });
        } else {
          savePedidoAndBonus();
        }

        function savePedidoAndBonus() {
          db.run(
            `INSERT INTO pedidos (productName, productEmoji, quantity, time, localName, userName, total, status, sector, cliente_id, promocao_id, entregador_id, mesa_comanda, observations, composicoes, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
            [pedido.productName, pedido.productEmoji, pedido.quantity, pedido.time, pedido.localName, pedido.userName, pedido.total, status, pedido.sector || 'Cozinha 1', pedido.cliente_id || null, pedido.promocao_id || null, pedido.entregador_id || null, pedido.mesa_comanda || null, pedido.observations || '', JSON.stringify(pedido.composicoes || [])],
            function (err) {
              if (err) {
                console.error('Erro ao inserir pedido:', err);
                socket.emit('erro_servidor', 'Falha ao gravar o pedido. Tente novamente.');
                return;
              }
              const mainId = this.lastID;
              const finalSector = pedido.sector || 'Cozinha 1';
              const newOrder = { ...pedido, id: mainId, status: status, sector: finalSector, createdAt: new Date().toISOString() };
              io.emit('pedido_adicionado', newOrder);
              sendPush('cozinha', '🆕 Novo Pedido!', `${newOrder.quantity || 1}x ${newOrder.productName || 'Item'} — ${newOrder.localName || ''}`.trim(), 'pedido-' + mainId, '/fila-pedidos.html');
              updateMesaStatus();

              if (comboBonus) {
                db.get(`SELECT emoji, categoria FROM produtos WHERE nome = ?`, [comboBonus], (err, bonusProd) => {
                  const bonusSector = (bonusProd && bonusProd.categoria === 'Bebidas') ? 'Bar' : 'Cozinha 1';
                  const bonusEmoji = bonusProd ? bonusProd.emoji : '🎁';
                  db.run(
                    `INSERT INTO pedidos (productName, productEmoji, quantity, time, localName, userName, total, status, sector, mesa_comanda, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
                    [comboBonus + ' (Brinde)', bonusEmoji, pedido.quantity, pedido.time, pedido.localName, pedido.userName, "0.00", status, bonusSector, pedido.mesa_comanda || null],
                    function (err2) {
                      if (!err2) {
                        io.emit('pedido_adicionado', {
                          productName: comboBonus + ' (Brinde)', productEmoji: bonusEmoji, quantity: pedido.quantity,
                          time: pedido.time, localName: pedido.localName, userName: pedido.userName,
                          total: "0.00", status: status, sector: bonusSector, id: this.lastID, createdAt: new Date().toISOString()
                        });
                      }
                    }
                  );
                });
              }
            }
          );
        }

        function updateMesaStatus() {
          if (!pedido.localName.includes('Delivery') && !pedido.localName.includes('Balcão')) {
            db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ?`, [pedido.localName], () => {
              db.all(`SELECT * FROM mesas`, (err, rows) => {
                io.emit('mesas_atualizadas', rows || []);
              });
            });
          }
        }
      });
    }

    if (clientName) {
      if (clientPhone) {
        db.get(`SELECT id FROM clientes WHERE telefone = ?`, [clientPhone], (err, row) => {
          if (row) {
            db.run(`UPDATE clientes SET nome = ? WHERE id = ?`, [clientName, row.id], (err2) => {
              proceedWithOrder(row.id);
            });
          } else {
            db.run(`INSERT INTO clientes (nome, telefone) VALUES (?, ?)`, [clientName, clientPhone], function (err2) {
              proceedWithOrder(err2 ? null : this.lastID);
            });
          }
        });
      } else {
        db.get(`SELECT id FROM clientes WHERE nome = ? ORDER BY id DESC LIMIT 1`, [clientName], (err, row) => {
          proceedWithOrder(row ? row.id : null);
        });
      }
    } else {
      proceedWithOrder(null);
    }
  });

  // Atualiza Status (Cozinha/Bar)
  socket.on('atualizar_status', ({ id, status }) => {
    if (!socket.auth) return;
    const validStatus = ['Em espera', 'Pendente', 'Em preparo', 'Pronto'];
    if (typeof status !== 'string' || validStatus.indexOf(status) === -1) return;
    const idNum = parseInt(id, 10);
    if (isNaN(idNum)) return;
    id = idNum;
    const prontoUpdate = (status === 'Pronto') ? ", prontoEm = datetime('now', 'localtime')" : '';
    db.run(`UPDATE pedidos SET status = ?${prontoUpdate} WHERE id = ?`, [status, id], function (err) {
      if (err) return console.error(err);

      db.get(`SELECT * FROM pedidos WHERE id = ?`, [id], (err, row) => {
        if (!row) return;

        io.emit('status_atualizado', row);
        io.emit('pedidos_atualizados');

        // --- HUB DELIVERY SYNC: quando pedido Delivery muda status, atualiza hub ---
        if (row.sector === 'Delivery' && row.mesa_comanda && row.mesa_comanda.startsWith('Hub #')) {
          const hubMatch = String(row.mesa_comanda).replace('Hub #', '');
          db.get(`SELECT * FROM hub_pedidos WHERE id = ? OR codigo = ?`, [hubMatch, hubMatch], (errHub, hubRow) => {
            if (!hubRow) return;
            let linkIds = [];
            try { linkIds = JSON.parse(hubRow.pedido_link_ids || '[]'); } catch (e) { linkIds = []; }
            if (!linkIds.length) return;

            if (status === 'Pronto') {
              const placeholders = linkIds.map(() => '?').join(',');
              db.all(`SELECT status FROM pedidos WHERE id IN (${placeholders})`, linkIds, (errAll, rows) => {
                const todosProntos = rows && rows.every(r => r.status === 'Pronto');
                if (todosProntos) {
                  db.run(`UPDATE hub_pedidos SET status = 'Pronto', atualizado_em = datetime('now','localtime') WHERE id = ?`, [hubRow.id], () => broadcastHubPedidos());
                }
              });
            } else if (status === 'Em preparo') {
              if (hubRow.status === 'Recebido' || hubRow.status === 'Pronto') {
                db.run(`UPDATE hub_pedidos SET status = 'Em preparo', atualizado_em = datetime('now','localtime') WHERE id = ?`, [hubRow.id], () => broadcastHubPedidos());
              }
            }
          });
        }

        // Notify customer about order status
        if (row.localName) {
          io.to(`mesa_${row.localName}`).emit('pedido_status_cliente', {
            pedidoId: row.id,
            status: row.status,
            productName: row.productName,
            localName: row.localName,
            quantity: row.quantity,
            createdAt: row.createdAt,
            prontoEm: row.prontoEm
          });
        }

        if (status === 'Pronto') {
          io.emit('pedido_pronto', row);
          sendPush('garcom', '✅ Pedido Pronto!', `${row.quantity || 1}x ${row.productName || 'Item'} — ${row.localName || ''}`.trim(), 'pronto-' + id, '/garcom.html');
          // --- IA: Limpar alertas quando pedido fica Pronto ---
          if (iaState && iaState.alertasAtivos) {
            iaState.alertasAtivos.delete('pedido_' + id);
            iaState.alertasAtivos.delete('atencao_' + id);
          }
          if (iaState && iaState.manobrasAtivas) {
            iaState.manobrasAtivas.delete('manobra_' + id);
          }
          io.emit('ia_pedido_resolvido', { pedidoId: id, status: 'Pronto' });

          // Atualiza a esteira do garçom dono do pedido
          db.all(`SELECT * FROM pedidos WHERE userName = ? AND status = 'Pronto'`, [row.userName], (err, esteiraRows) => {
            if (esteiraRows) {
              io.emit('esteira_atualizada', esteiraRows); // Aqui o ideal seria emitir só pro garçom específico, mas broadcast tbm funciona pra este caso simples
            }
          });
        }
      });
    });
  });

  const chamarTimestamps = {};

  socket.on('get_esteira', (userName) => {
    db.all(`SELECT * FROM pedidos WHERE (userName = ? OR garcom_call IS NOT NULL) AND status = 'Pronto'`, [userName], (err, rows) => {
      var list = rows || [];
      var now = Date.now();
      pdvCalls = pdvCalls.filter(function (c) { return (now - c.criadoEm) < 300000; });
      list = list.concat(pdvCalls);
      socket.emit('esteira_atualizada', list);
    });
  });

  socket.on('marcar_entregue', ({ id, userName }) => {
    if (typeof id === 'string' && id.startsWith('pdv_')) {
      pdvCalls = pdvCalls.filter(function (c) { return c.id !== id; });
      socket.emit('esteira_atualizada', []);
      return;
    }
    db.get(`SELECT userName FROM pedidos WHERE id = ?`, [id], (err, row) => {
      const isChamada = row && row.userName === 'Chamada';
      const newStatus = isChamada ? 'Finalizado' : 'Entregue';
      db.run(`UPDATE pedidos SET status = ? WHERE id = ?`, [newStatus, id], () => {
        socket.emit('esteira_atualizada', []);
        broadcastPedidos();
      });
    });
  });

  socket.on('chamar_garcom', (data) => {
    const d = data || {};
    const id = d.id || null;
    const productName = d.productName || d.mensagem || 'Garçom chamado';
    const quantity = d.quantity || 1;
    const localName = d.localName || d.nome || 'PDV Mobile';
    const userName = d.userName || 'PDV Mobile';
    const clienteNome = d.clienteNome || '';
    const now = Date.now();
    // (Segurança) Limite por socket (ex.: cliente do QR chamando garçom) para
    // evitar spam de notificações.
    if (socket._lastChamarTime && (now - socket._lastChamarTime) < 3000) return;
    socket._lastChamarTime = now;
    const lastCall = chamarTimestamps[id];
    const isReChamado = lastCall && (now - lastCall) < 10000;
    chamarTimestamps[id] = now;
    if (!id) {
      const entry = { id: 'pdv_' + now, localName, productName, quantity, userName, clienteNome, tipo: 'pdv', criadoEm: now, status: 'Pronto', targetGarcom: d.targetGarcom || null };
      if (!isReChamado) pdvCalls.push(entry);
      io.emit('notificacao_garcom', Object.assign({}, entry, { reChamado: isReChamado }));
      if (!isReChamado) sendPush('garcom', '🔔 Garçom Chamado!', `${quantity}x ${productName} — ${localName}${clienteNome ? ' (' + clienteNome + ')' : ''}`, 'chamar-pdv-' + now, '/garcom.html');
      broadcastPedidos();
    } else {
      io.emit('notificacao_garcom', { id, productName, quantity, localName, userName, clienteNome, tipo: 'chamada', reChamado: isReChamado, targetGarcom: d.targetGarcom || null });
      if (!isReChamado) {
        sendPush('garcom', '🔔 Garçom Chamado!', `${quantity}x ${productName} — ${localName}${clienteNome ? ' (' + clienteNome + ')' : ''}`, 'chamar-' + id, '/garcom.html');
        db.run(`UPDATE pedidos SET garcom_call = datetime('now', 'localtime') WHERE id = ?`, [id]);
        broadcastPedidos();
      }
    }
  });

  socket.on('garcom_buscando', ({ pedidoId, garcomNome, localName, productName }) => {
    if (typeof pedidoId === 'number' || !isNaN(pedidoId)) {
      db.run(`UPDATE pedidos SET garcom_call = NULL WHERE id = ?`, [pedidoId], function () {
        io.emit('garcom_buscando', { pedidoId, garcomNome, localName, productName });
      });
    } else {
      io.emit('garcom_buscando', { pedidoId, garcomNome, localName, productName });
    }
  });

  socket.on('cliente_na_mesa', (localName) => {
    if (localName) {
      socket.join(`mesa_${localName}`);
    }
  });

  socket.on('verificar_mesa_conflict', ({ mesa, clienteId }, cb) => {
    if (!mesa) return cb && cb({ conflict: false });
    db.get(`SELECT cliente_nome, cliente_id FROM mesa_clientes WHERE mesa = ?`, [mesa], (err, row) => {
      if (err || !row) return cb && cb({ conflict: false });
      if (row.cliente_id && clienteId && row.cliente_id === clienteId) return cb && cb({ conflict: false });
      if (row.cliente_nome) return cb && cb({ conflict: true, ocupadoPor: row.cliente_nome });
      cb && cb({ conflict: false });
    });
  });

  // Cliente identificado pelo QR: associa cliente à mesa, abre a mesa no PDV
  socket.on('cliente_entrou_mesa', ({ mesa, cliente }) => {
    if (!mesa || !cliente || !cliente.nome) return;
    db.run(
      `INSERT INTO mesa_clientes (mesa, cliente_id, cliente_nome, cliente_telefone, updated_at) VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(mesa) DO UPDATE SET cliente_id = excluded.cliente_id, cliente_nome = excluded.cliente_nome, cliente_telefone = excluded.cliente_telefone, updated_at = datetime('now', 'localtime')`,
      [mesa, cliente.id || null, cliente.nome, cliente.telefone || ''],
      (err) => {
        if (err) return console.error('[Mesa Cliente] Erro ao associar cliente à mesa:', err);
        broadcastMesaClientes();
        db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ? AND status IN ('Disponível','Disponivel')`, [mesa], () => {
          db.all(`SELECT * FROM mesas`, (e, rows) => io.emit('mesas_atualizadas', rows || []));
        });
      }
    );
  });

  socket.on('garcom_aceitou_chamado', ({ localName, garcomNome }) => {
    io.to(`mesa_${localName}`).emit('garcom_chegando', { garcomNome, localName });
    io.emit('notificacao_garcom', { productName: `${garcomNome} aceitou`, localName, userName: 'Sistema', tipo: 'aceite' });
  });

  socket.on('movimentacao_caixa', (data) => {
    const d = data || {};
    const tipo = d.tipo || 'Sangria';
    const valor = parseFloat(d.valor) || 0;
    const descricao = d.descricao || tipo;
    const forma_pagamento = d.forma_pagamento || 'Dinheiro';
    const operador = d.operador || 'Caixa';
    if (valor <= 0) return;
    db.get(`SELECT id FROM turnos_caixa ORDER BY id DESC LIMIT 1`, [], (err, turno) => {
      const turnoId = turno ? turno.id : null;
      const tipoDb = tipo === 'Sangria' ? 'saida' : 'Entrada';
      db.run(
        `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [turnoId, tipoDb, valor, forma_pagamento, `${tipo} (${operador}): ${descricao}`],
        function (err) {
          if (err) return;
          io.emit('movimentacoes_atualizadas');
        }
      );
    });
  });

  socket.on('remover_pedido_item', async (data) => {
    const itemId = (typeof data === 'object' && data !== null) ? (data.orderId || data.id) : data;
    const senha = (typeof data === 'object' && data !== null) ? data.senha : undefined;
    const userName = (typeof data === 'object' && data !== null && data.userName) ? data.userName : 'Caixa / Desconhecido';
    if (itemId === undefined || itemId === null || itemId === '') return;

    if (senha !== undefined) {
      if (!(await verificarPinOuSenha(senha))) {
        socket.emit('erro_caixa', 'Senha ou PIN incorreto!');
        return;
      }
    }

    db.get(`SELECT * FROM pedidos WHERE id = ?`, [itemId], (err, row) => {
      const mesaName = row ? row.localName : null;
      db.run(`DELETE FROM pedidos WHERE id = ?`, [itemId], () => {
        if (row) {
          global.registrarAuditoria(
            userName,
            'Exclusão de Produto',
            `Removido: ${row.quantity}x ${row.productName} - Mesa: ${row.localName} - Preço: R$${row.total}`,
            'Ação manual (Lixeira)',
            'Alto'
          );
        }
        broadcastPedidos();
        liberarMesaSeVazia(mesaName);
        if (mesaName) {
          db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ? OR mesa_comanda = ?) AND status NOT IN ('Finalizado','Pago','Cancelado')`, [mesaName, mesaName, mesaName], (e, r) => {
            io.emit('itens_mesa_recebidos', { mesaName, items: r || [] });
          });
        }
      });
    });
  });

  // Shared handler for both event names (remover_pedido_item from main.js, remover_item_pedido from main.js)
  async function _handleRemoverItem(data) {
    const itemId = (typeof data === 'object' && data !== null) ? (data.orderId || data.id) : data;
    const senha = (typeof data === 'object' && data !== null) ? data.senha : undefined;
    const userName = (typeof data === 'object' && data !== null && data.userName) ? data.userName : 'Caixa / Desconhecido';
    if (itemId === undefined || itemId === null || itemId === '') return;

    if (senha !== undefined) {
      if (!(await verificarPinOuSenha(senha))) {
        socket.emit('erro_caixa', 'Senha ou PIN incorreto!');
        return;
      }
    }

    db.get(`SELECT * FROM pedidos WHERE id = ?`, [itemId], (err, row) => {
      const mesaName = row ? row.localName : null;
      db.run(`DELETE FROM pedidos WHERE id = ?`, [itemId], () => {
        if (row) {
          global.registrarAuditoria(userName, 'Exclusão de Produto',
            `Removido: ${row.quantity}x ${row.productName} - Mesa: ${row.localName} - R$${row.total}`,
            'Ação manual', 'Alto');

          const productName = row.productName || '';
          if ((productName.indexOf('Pgto Parcial') !== -1 || productName.indexOf('Pagamento') !== -1) && row.turno_id) {
            const descMatch = productName;
            db.run(`DELETE FROM movimentacoes WHERE turno_id = ? AND descricao LIKE ? AND tipo = 'Entrada'`, [row.turno_id, `%${mesaName}%`], () => {});
          }
        }
        broadcastPedidos();
        liberarMesaSeVazia(mesaName);
        if (mesaName) {
          db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ? OR mesa_comanda = ?) AND status NOT IN ('Finalizado','Pago','Cancelado')`, [mesaName, mesaName, mesaName], (e, r) => {
            io.emit('itens_mesa_recebidos', { mesaName, items: r || [] });
          });
        }
      });
    });
  }
  socket.on('remover_pedido_item', _handleRemoverItem);
  socket.on('remover_item_pedido', _handleRemoverItem);


  // --- MÓDULOS EXTERNOS (CONTROLLERS) ---
  const activePaymentLocks = new Set();
  require('./controllers/socket-financeiro')(socket, io, db, {
    checkCaixa,
    activePaymentLocks,
    broadcastPedidos,
    broadcastMesaClientes,
    mesasFechando,
    licenseManager,
    verificarSenhaAdmin,
    verificarPinOuSenha,
    verificarSenhaFuncionario,
    getLocalTimestamp
  });
  require('./controllers/split-conta')(socket, io, db, {
    checkCaixa,
    broadcastPedidos,
    broadcastMesaClientes
  });
  require('./controllers/socket-fila')(socket, io, db, {});

  // --- ADMIN & SETUP ROUTES ---
  socket.on('get_mesas', () => db.all(`SELECT * FROM mesas`, (err, rows) => {
    socket.emit('mesas_atualizadas', rows || []);
    socket.emit('sync_mesas_fechando', Array.from(mesasFechando));
    db.all(`SELECT * FROM mesa_clientes`, (e2, cliRows) => {
      if (!e2) socket.emit('mesa_clientes_atualizados', cliRows || []);
    });
  }));
  socket.on('get_qr_pedidos_pendentes', () => {
    db.all(`SELECT * FROM qr_pedidos_pendentes WHERE status = 'Pendente' ORDER BY createdAt DESC`, [], (err, rows) => {
      if (!err) {
        socket.emit('qr_pedidos_pendentes_list', rows || []);
      }
    });
  });

  socket.on('criar_pedido_qr', (data) => {
    // data: { mesa, cliente_nome, itens, valor_total, pago_pix, chave_pix, cliente_id, comanda_nome, is_fila, requires_validacao, mesa_origem }
    const { mesa, cliente_nome, itens, valor_total, pago_pix, chave_pix, cliente_id, comanda_nome, is_fila, requires_validacao, mesa_origem } = data;
    const needsValidation = requires_validacao ? 1 : 0;

    function insertPedido() {
      const itensStr = JSON.stringify(itens);
      const isPaid = pago_pix ? 1 : 0;
      db.run(
        `INSERT INTO qr_pedidos_pendentes (mesa, cliente_nome, itens_json, valor_total, pago_pix, chave_pix, status, cliente_id, comanda_nome, requires_validacao, mesa_origem) VALUES (?, ?, ?, ?, ?, ?, 'Pendente', ?, ?, ?, ?)`,
        [mesa, cliente_nome, itensStr, parseFloat(valor_total) || 0, isPaid, chave_pix || '', cliente_id || null, comanda_nome || '', needsValidation, mesa_origem || null],
        function (err) {
          if (err) {
            console.error('[QR Order] Erro ao criar pedido pendente:', err);
            socket.emit('criar_pedido_qr_resposta', { success: false, error: 'Erro ao registrar pedido pendente.' });
            return;
          }
          const pedidoId = this.lastID;
          socket.emit('criar_pedido_qr_resposta', { success: true, id: pedidoId, requires_validacao: needsValidation });
          if (needsValidation) {
            io.emit('validacao_pedido_necessaria', { id: pedidoId, mesa, mesa_origem, cliente_nome });
          }
          db.all(`SELECT * FROM qr_pedidos_pendentes WHERE status = 'Pendente' ORDER BY createdAt DESC`, [], (errList, rows) => {
            if (!errList) io.emit('qr_pedidos_pendentes_list', rows || []);
          });
        }
      );
    }

    if (is_fila) {
      db.all(`SELECT chave, valor FROM configuracoes WHERE chave IN ('fila_restricao_habilitada','fila_restricao_tipo','fila_categorias_liberadas','fila_itens_liberados')`, [], (eCfg, cfgRows) => {
        const cfg = {};
        if (cfgRows) cfgRows.forEach(r => cfg[r.chave] = r.valor);
        if (cfg.fila_restricao_habilitada !== 'true') return insertPedido();
        const tipo = cfg.fila_restricao_tipo || 'nenhum';
        if (tipo === 'nenhum') return insertPedido();
        const itemIds = (itens || []).map(i => i.productName);
        db.all(`SELECT id, nome, categoria FROM produtos`, [], (eProds, prods) => {
          const restricted = [];
          (itens || []).forEach(item => {
            const prod = (prods || []).find(p => p.id === item.id || p.nome === item.productName);
            if (!prod) return;
            let allowed = true;
            if (tipo === 'categorias') {
              let cats = []; try { cats = JSON.parse(cfg.fila_categorias_liberadas || '[]'); } catch(e) {}
              allowed = cats.includes(prod.categoria);
            } else if (tipo === 'itens') {
              let ids = []; try { ids = JSON.parse(cfg.fila_itens_liberados || '[]'); } catch(e) {}
              allowed = ids.includes(prod.id);
            }
            if (!allowed) restricted.push(prod.nome);
          });
          if (restricted.length > 0) {
            return socket.emit('criar_pedido_qr_resposta', { success: false, error: 'Itens restritos na fila: ' + restricted.join(', ') + '. Aguarde a liberacao da mesa para pedir estes itens.' });
          }
          insertPedido();
        });
      });
    } else {
      insertPedido();
    }
  });

  socket.on('aprovar_pedido_qr', ({ id }) => {
    db.get(`SELECT * FROM qr_pedidos_pendentes WHERE id = ?`, [id], (err, pendingOrder) => {
      if (err || !pendingOrder) {
        socket.emit('aprovar_pedido_qr_resposta', { success: false, error: 'Pedido pendente não encontrado.' });
        return;
      }

      if (pendingOrder.status !== 'Pendente') {
        socket.emit('aprovar_pedido_qr_resposta', { success: true });
        return;
      }

      checkCaixa(turno => {
        if (!turno) {
          socket.emit('aprovar_pedido_qr_resposta', { success: false, error: '⚠️ O caixa está fechado! Abra o caixa antes de aprovar pedidos.' });
          return;
        }

        let itens = [];
        try {
          itens = JSON.parse(pendingOrder.itens_json || '[]');
        } catch (e) {
          console.error('[QR Order] Erro ao fazer parse dos itens:', e);
        }

        const mesaName = pendingOrder.mesa;
        const comandaNomeRaw = String(pendingOrder.comanda_nome || '').trim() || String(pendingOrder.cliente_nome || '').trim();
        const comandaNome = comandaNomeRaw ? (comandaNomeRaw.toLowerCase().includes('comanda') ? comandaNomeRaw : `Comanda - ${comandaNomeRaw}`) : '';
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

        db.serialize(() => {
          db.run('BEGIN TRANSACTION;');

          // Garante a comanda com o nome do cliente (cada cliente tem a sua)
          if (comandaNome) {
            db.run(
              `INSERT INTO mesas (nome, status, observacao) SELECT ?, 'Disponível', ? WHERE NOT EXISTS (SELECT 1 FROM mesas WHERE nome = ?)`,
              [comandaNome, String(pendingOrder.cliente_nome || ''), comandaNome]
            );
          }

          let insertedCount = 0;
          let hasError = false;

          itens.forEach(item => {
            let status = 'Em espera';

            db.run(
              `INSERT INTO pedidos (productName, productEmoji, quantity, time, localName, userName, total, status, sector, turno_id, mesa_comanda, cliente_id, observations, composicoes, createdAt) 
               VALUES (?, ?, ?, ?, ?, 'QR Code', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
              [item.productName, item.productEmoji || '🍽️', item.quantity, timeStr, mesaName, String(item.total).replace('.', ','), status, item.sector || 'Cozinha 1', turno.id, comandaNome || null, pendingOrder.cliente_id || null, item.observations || '', JSON.stringify(item.composicoes || [])],
              function (errInsert) {
                if (errInsert) {
                  hasError = true;
                  console.error('[QR Order] Erro ao inserir item:', errInsert);
                } else {
                  const insertedId = this.lastID;
                  insertedCount++;

                  io.emit('pedido_adicionado', {
                    id: insertedId,
                    productName: item.productName,
                    productEmoji: item.productEmoji || '🍽️',
                    quantity: item.quantity,
                    time: timeStr,
                    localName: mesaName,
                    userName: 'QR Code',
                    total: String(item.total).replace('.', ','),
                    status: status,
                    sector: item.sector || 'Cozinha 1',
                    mesa_comanda: comandaNome || null,
                    cliente_id: pendingOrder.cliente_id || null,
                    createdAt: new Date().toISOString()
                  });
                  sendPush('cozinha', '🆕 Novo Pedido!', `${item.quantity || 1}x ${item.productName || 'Item'} — ${mesaName}`.trim(), 'pedido-' + insertedId, '/fila-pedidos.html');
                }
              }
            );
          });

          if (pendingOrder.pago_pix) {
            const negativeTotal = (-Math.abs(pendingOrder.valor_total)).toFixed(2).replace('.', ',');
            db.run(
              `INSERT INTO pedidos (productName, productEmoji, quantity, total, status, localName, userName, time, sector, turno_id, mesa_comanda, cliente_id, createdAt) 
               VALUES (?, '💸', 1, ?, 'Entregue', ?, 'QR Code', ?, 'Caixa', ?, ?, ?, datetime('now', 'localtime'))`,
              [`Pgto QR Code (Pix) - Cliente ${pendingOrder.cliente_nome}`, negativeTotal, mesaName, timeStr, turno.id, comandaNome || null, pendingOrder.cliente_id || null],
              function (errInsertPay) {
                if (errInsertPay) {
                  console.error('[QR Order] Erro ao registrar pagamento Pix:', errInsertPay);
                } else {
                  io.emit('pedido_adicionado', {
                    id: this.lastID,
                    productName: `Pgto QR Code (Pix) - Cliente ${pendingOrder.cliente_nome}`,
                    productEmoji: '💸',
                    quantity: 1,
                    time: timeStr,
                    localName: mesaName,
                    userName: 'QR Code',
                    total: negativeTotal,
                    status: 'Entregue',
                    sector: 'Caixa',
                    mesa_comanda: comandaNome || null,
                    cliente_id: pendingOrder.cliente_id || null,
                    createdAt: new Date().toISOString()
                  });
                }
              }
            );

            db.run(
              `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) 
               VALUES (?, 'Entrada', ?, 'Pix', ?, datetime('now', 'localtime'))`,
              [turno.id, pendingOrder.valor_total, `Pedido QR Code - ${mesaName} (${pendingOrder.cliente_nome})`]
            );
          }

          if (!mesaName.includes('Delivery') && !mesaName.includes('Balcão')) {
            db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ?`, [mesaName]);
            if (pendingOrder.cliente_nome) {
              db.run(
                `INSERT INTO mesa_clientes (mesa, cliente_id, cliente_nome, cliente_telefone, updated_at)
                 VALUES (?, ?, ?, ?, datetime('now','localtime'))
                 ON CONFLICT(mesa) DO UPDATE SET
                   cliente_id = COALESCE(excluded.cliente_id, cliente_id),
                   cliente_nome = excluded.cliente_nome,
                   cliente_telefone = COALESCE(NULLIF(excluded.cliente_telefone,''), cliente_telefone),
                   updated_at = datetime('now','localtime')`,
                [mesaName, pendingOrder.cliente_id || null, pendingOrder.cliente_nome, '']
              );
            }
          }

          if (comandaNome) {
            db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ?`, [comandaNome]);
          }

          db.run(`UPDATE qr_pedidos_pendentes SET status = 'Aprovado' WHERE id = ?`, [id]);

          db.run('COMMIT;', (errCommit) => {
            if (errCommit) {
              console.error('[QR Order] Erro ao commitar transacao:', errCommit);
              socket.emit('aprovar_pedido_qr_resposta', { success: false, error: 'Erro ao salvar itens no banco.' });
              return;
            }

            socket.emit('aprovar_pedido_qr_resposta', { success: true });
            io.emit('pedido_qr_atualizado', { id: id, status: 'Aprovado' });
            // Notify customer about their own orders (filtra pela comanda do cliente)
            let meusPedidosQuery = `SELECT id, productName, productEmoji, quantity, status, sector, createdAt FROM pedidos WHERE userName = 'QR Code' AND date(createdAt) = date('now', 'localtime')`;
            let meusPedidosParams = [];
            if (comandaNome) {
              meusPedidosQuery += ` AND mesa_comanda = ?`;
              meusPedidosParams.push(comandaNome);
            } else {
              meusPedidosQuery += ` AND localName = ?`;
              meusPedidosParams.push(mesaName);
            }
            meusPedidosQuery += ` ORDER BY id`;
            db.all(meusPedidosQuery, meusPedidosParams, (errOrders, orders) => {
              if (!errOrders && orders && orders.length > 0) {
                io.to(`mesa_${mesaName}`).emit('meus_pedidos', { orders, mesa: mesaName });
              }
            });

            db.all(`SELECT * FROM qr_pedidos_pendentes WHERE status = 'Pendente' ORDER BY createdAt DESC`, [], (errList, rows) => {
              if (!errList) io.emit('qr_pedidos_pendentes_list', rows || []);
            });

            broadcastPedidos();

            db.all(`SELECT * FROM mesas`, (errMesas, rows) => {
              io.emit('mesas_atualizadas', rows || []);
            });
          });
        });
      });
    });
  });

  socket.on('recusar_pedido_qr', ({ id }) => {
    db.run(`UPDATE qr_pedidos_pendentes SET status = 'Recusado' WHERE id = ?`, [id], (err) => {
      if (err) {
        socket.emit('recusar_pedido_qr_resposta', { success: false, error: 'Erro ao recusar pedido.' });
        return;
      }

      socket.emit('recusar_pedido_qr_resposta', { success: true });
      io.emit('pedido_qr_atualizado', { id: id, status: 'Recusado' });

      db.all(`SELECT * FROM qr_pedidos_pendentes WHERE status = 'Pendente' ORDER BY createdAt DESC`, [], (errList, rows) => {
        if (!errList) io.emit('qr_pedidos_pendentes_list', rows || []);
      });
    });
  });

  socket.on('identificar_cliente_qr', (dados, callback) => {
    const { nome, telefone, data_nascimento } = dados;
    db.get(`SELECT * FROM clientes WHERE telefone = ?`, [telefone], (err, existing) => {
      if (err) {
        return callback({ success: false, error: 'Erro ao buscar cliente.' });
      }

      if (existing) {
        db.run(`UPDATE clientes SET nome = ?, data_nascimento = ? WHERE id = ?`, [nome, data_nascimento, existing.id], (errUpdate) => {
          callback({
            success: true,
            cliente: {
              id: existing.id,
              nome: nome,
              telefone: telefone,
              data_nascimento: data_nascimento,
              pontos: existing.pontos
            }
          });
          db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
        });
      } else {
        db.run(
          `INSERT INTO clientes (nome, telefone, observacao, endereco, data_nascimento, pontos) VALUES (?, ?, '', '', ?, 0)`,
          [nome, telefone, data_nascimento],
          function (errInsert) {
            if (errInsert) {
              return callback({ success: false, error: 'Erro ao cadastrar cliente.' });
            }

            const newId = this.lastID;
            callback({
              success: true,
              cliente: {
                id: newId,
                nome: nome,
                telefone: telefone,
                data_nascimento: data_nascimento,
                pontos: 0
              }
            });
            db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
          }
        );
      }
    });
  });

  socket.on('get_produtos', () => broadcastProdutos(socket));
  socket.on('get_funcionarios', () => db.all(`SELECT * FROM funcionarios`, (err, rows) => socket.emit('funcionarios_atualizados', rows || [])));

  socket.on('add_mesa', (nome) => db.run(`INSERT INTO mesas (nome) VALUES (?)`, [nome], () => {
    db.all(`SELECT * FROM mesas`, (e, r) => io.emit('mesas_atualizadas', r || []));
  }));
  socket.on('delete_mesa', (id) => {
    if (!exigirAdminSocket(socket)) return;
    db.run(`DELETE FROM mesas WHERE id = ?`, [id], () => {
      db.all(`SELECT * FROM mesas`, (e, r) => io.emit('mesas_atualizadas', r || []));
    });
  });

  socket.on('add_produto', (p) => db.run(`INSERT INTO produtos (categoria, nome, preco, emoji, hasAddons, setor, status_inicial, status, categoria_fiscal, descricao, codigo_barras, visibilidade) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.categoria, p.nome, p.preco, p.emoji, p.hasAddons, p.setor || 'Cozinha 1', p.status_inicial || 'Em espera', p.status || 'ativo', p.categoria_fiscal || 'Alimentacao', p.descricao || '', p.codigo_barras || null, p.visibilidade || 'todos'], (err) => {
      if (err) {
        console.error(err);
        socket.emit('erro_servidor', 'Falha ao adicionar o produto.');
        return;
      }
      broadcastProdutos();
    }));

  socket.on('edit_produto', (p) => {
    db.run(`UPDATE produtos SET categoria=?, nome=?, preco=?, emoji=?, setor=?, status_inicial=?, status=?, categoria_fiscal=?, descricao=?, codigo_barras=?, visibilidade=? WHERE id=?`,
      [p.categoria, p.nome, p.preco, p.emoji, p.setor || 'Cozinha 1', p.status_inicial || 'Em espera', p.status || 'ativo', p.categoria_fiscal || 'Alimentacao', p.descricao || '', p.codigo_barras || null, p.visibilidade || 'todos', p.id], () => {
        global.registrarAuditoria(p.operador || 'Admin', 'EDITAR_PRODUTO', `Produto editado: ${p.nome} (ID: ${p.id})`, 'Atualização de Cardápio', 'MEDIO');
        broadcastProdutos();
      });
  });

  socket.on('delete_produto', async (data) => {
    if (!exigirAdminSocket(socket)) return;
    const id = (typeof data === 'object') ? data.id : data;
    const op = (typeof data === 'object') ? data.operador : 'Admin';
    const senha = (typeof data === 'object') ? data.senha : undefined;
    if (senha !== undefined) {
      if (!(await verificarPinOuSenha(senha))) {
        socket.emit('erro_caixa', 'Senha ou PIN incorreto!');
        return;
      }
    }
    db.run(`DELETE FROM produtos WHERE id = ?`, [id], () => {
      global.registrarAuditoria(op || 'Admin', 'EXCLUSAO_PRODUTO', `Produto removido (ID: ${id})`, 'Atualização de Cardápio', 'ALTO');
      broadcastProdutos();
    });
  });

  socket.on('add_funcionario', (f) => {
    const valor_hora = f.valor_hora || 0;
    const hash = bcrypt.hashSync(f.senha || '123', 10);
    const restauranteId = socketTenantId || tenantContext.getStore() || 1;
    const st = f.status || 'Ativo';
    db.run(`INSERT INTO funcionarios (nome, usuario, senha, cargo, valor_hora, status, restaurante_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [f.nome, f.usuario, hash, f.cargo || 'Garcom', valor_hora, st, restauranteId], (err) => {
        if (err) {
          console.error('[ERRO] Falha ao inserir funcionario:', err.message);
          return socket.emit('erro_funcionario', err.message.includes('UNIQUE') ? 'Nome de usuário já cadastrado.' : 'Erro ao cadastrar funcionário.');
        }
        db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
      });
  });

  socket.on('delete_funcionario', (id) => {
    if (!exigirAdminSocket(socket)) return;
    db.run(`DELETE FROM funcionarios WHERE id = ?`, [id], () => {
      db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
    });
  });

  socket.on('save_restaurante_config', (config) => {
    if (!config || typeof config !== 'object') return;
    db.serialize(() => {
      db.run("BEGIN TRANSACTION;");
      Object.keys(config).forEach(chave => {
        const valor = String(config[chave] ?? '');
        db.run(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
      });
      db.run("COMMIT;", () => {
        io.emit('configuracoes_atualizadas');
        socket.emit('restaurante_config_salvo');
      });
    });
  });

  // --- HUB DELIVERY ---
  function broadcastHubPedidos(targetSocket = null) {
    db.all(`SELECT * FROM hub_pedidos ORDER BY criado_em DESC`, [], (err, rows) => {
      const list = rows || [];
      if (targetSocket) targetSocket.emit('hub_pedidos_atualizados', list);
      else io.emit('hub_pedidos_atualizados', list);
    });
  }

  function lerHubConfig(cb) {
    db.get(`SELECT valor FROM configuracoes WHERE chave='hub_delivery_config'`, (err, row) => {
      let cfg = { enabled: false, canais: [], taxa: '0.00', tempo: 45 };
      try { cfg = Object.assign(cfg, JSON.parse(row ? row.valor : '{}')); } catch (e) { }
      cb(cfg);
    });
  }

  socket.on('hub_get_pedidos', () => {
    broadcastHubPedidos(socket);
  });

  socket.on('hub_salvar_pedido', (p) => {
    if (!p || !p.cliente) return;
    const itens = typeof p.itens === 'string' ? p.itens : JSON.stringify(p.itens || []);
    const dados = [
      String(p.canal || 'Próprio'),
      String(p.codigo || ''),
      String(p.cliente || ''),
      String(p.telefone || ''),
      String(p.endereco || ''),
      String(p.referencia || ''),
      itens,
      parseFloat(p.subtotal) || 0,
      parseFloat(p.taxa) || 0,
      parseFloat(p.total) || 0,
      String(p.pagamento || ''),
      String(p.status || 'Recebido'),
      String(p.entregador || ''),
      String(p.obs || '')
    ];
    if (p.id) {
      db.run(`UPDATE hub_pedidos SET canal=?, codigo=?, cliente=?, telefone=?, endereco=?, referencia=?, itens=?, subtotal=?, taxa=?, total=?, pagamento=?, status=?, entregador=?, obs=?, atualizado_em=datetime('now','localtime') WHERE id=?`,
        [...dados, p.id], () => broadcastHubPedidos());
    } else {
      db.run(`INSERT INTO hub_pedidos (canal, codigo, cliente, telefone, endereco, referencia, itens, subtotal, taxa, total, pagamento, status, entregador, obs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        dados, () => broadcastHubPedidos());
    }
  });

  socket.on('hub_mudar_status', (data) => {
    if (!data || !data.id) return;
    const novoStatus = String(data.status || 'Recebido');
    db.get(`SELECT * FROM hub_pedidos WHERE id=?`, [data.id], (err, row) => {
      db.run(`UPDATE hub_pedidos SET status=?, atualizado_em=datetime('now','localtime') WHERE id=?`, [novoStatus, data.id], () => {
        broadcastHubPedidos();
        if (row && String(row.canal).toLowerCase() === 'ifood') {
          const tid = tenantContext.getStore() || 1;
          ifoodApi.syncStatusToIfood(getTenantDb(), masterDb, tid, Object.assign({}, row, { status: novoStatus }))
            .then(() => console.log(`[iFood] Status "${novoStatus}" enviado para o pedido ${row.canal_ref}`))
            .catch(e => console.error('[iFood] Falha ao sincronizar status:', e.message || e));
        }
        // --- HUB DELIVERY SYNC: quando hub reverso status, atualiza pedidos vinculados ---
        if (row && row.enviado_cozinha && row.pedido_link_ids) {
          let linkIds = [];
          try { linkIds = JSON.parse(row.pedido_link_ids || '[]'); } catch (e) { linkIds = []; }
          if (linkIds.length) {
            let pedidoStatus;
            if (novoStatus === 'Recebido' || novoStatus === 'Cancelado') pedidoStatus = 'Cancelado';
            else if (novoStatus === 'Em preparo') pedidoStatus = 'Em preparo';
            else if (novoStatus === 'Pronto') pedidoStatus = 'Pronto';
            if (pedidoStatus) {
              const placeholders = linkIds.map(() => '?').join(',');
              db.run(`UPDATE pedidos SET status = ? WHERE id IN (${placeholders})`, [pedidoStatus, ...linkIds], () => broadcastPedidos());
            }
          }
        }
      });
    });
  });

  socket.on('hub_deletar_pedido', (id) => {
    if (!exigirAdminSocket(socket)) return;
    db.get(`SELECT pedido_link_ids, enviado_cozinha FROM hub_pedidos WHERE id=?`, [id], (err, row) => {
      if (row && row.enviado_cozinha && row.pedido_link_ids) {
        let linkIds = [];
        try { linkIds = JSON.parse(row.pedido_link_ids || '[]'); } catch (e) { linkIds = []; }
        if (linkIds.length) {
          const placeholders = linkIds.map(() => '?').join(',');
          db.run(`UPDATE pedidos SET status = 'Cancelado' WHERE id IN (${placeholders})`, linkIds, () => {
            db.run(`DELETE FROM hub_pedidos WHERE id=?`, [id], () => {
              broadcastHubPedidos();
              broadcastPedidos();
            });
          });
          return;
        }
      }
      db.run(`DELETE FROM hub_pedidos WHERE id=?`, [id], () => broadcastHubPedidos());
    });
  });

  socket.on('hub_get_config', () => {
    lerHubConfig((cfg) => socket.emit('hub_config_atualizada', cfg));
  });

  socket.on('hub_salvar_config', (cfg) => {
    if (!cfg || typeof cfg !== 'object') return;
    const valor = JSON.stringify({
      enabled: !!cfg.enabled,
      canais: Array.isArray(cfg.canais) ? cfg.canais : [],
      taxa: String(cfg.taxa ?? '0.00'),
      tempo: parseInt(cfg.tempo, 10) || 45
    });
    db.run(`INSERT INTO configuracoes (chave, valor) VALUES ('hub_delivery_config', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [valor], () => {
      lerHubConfig((c) => io.emit('hub_config_atualizada', c));
    });
  });

  // --- HUB DELIVERY → COZINHA: Enviar pedido para fila de preparo ---
  socket.on('hub_enviar_para_cozinha', (hubPedidoId) => {
    if (!socket.auth) return;
    const idNum = parseInt(hubPedidoId, 10);
    if (isNaN(idNum)) return;

    db.get(`SELECT * FROM hub_pedidos WHERE id = ?`, [idNum], (err, hub) => {
      if (!hub) return socket.emit('hub_erro', 'Pedido não encontrado.');
      if (hub.enviado_cozinha) return socket.emit('hub_erro', 'Este pedido já foi enviado para a cozinha.');

      let itens = [];
      try { itens = typeof hub.itens === 'string' ? JSON.parse(hub.itens || '[]') : (hub.itens || []); } catch (e) { itens = []; }
      if (!itens.length) return socket.emit('hub_erro', 'Pedido sem itens.');

      const canal = hub.canal || 'Próprio';
      const localName = 'Delivery - ' + canal;
      const comandaNome = 'Hub #' + (hub.codigo || hub.id);
      const clienteNome = hub.cliente || '';
      const obsParts = [];
      if (hub.obs) obsParts.push(hub.obs);
      if (hub.endereco) obsParts.push('Endereço: ' + hub.endereco + (hub.referencia ? ' (ref: ' + hub.referencia + ')' : ''));
      if (hub.telefone) obsParts.push('Tel: ' + hub.telefone);
      const observations = obsParts.join(' | ');

      const insertStmt = `INSERT INTO pedidos (productName, productEmoji, quantity, time, localName, userName, total, status, sector, paymentMethod, observations, mesa_comanda, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Pendente', 'Delivery', ?, ?, ?, datetime('now','localtime'))`;

      let insertsDone = 0;
      let insertsFailed = 0;
      const pedidoIds = [];

      itens.forEach((item) => {
        const qtd = parseInt(item.qtd) || 1;
        const precoUnit = parseFloat(item.preco) || 0;
        const itemTotal = (precoUnit * qtd).toFixed(2);
        const emoji = item.emoji || '🍽️';

        db.run(insertStmt, [
          item.nome || 'Item',
          emoji,
          qtd,
          new Date().toISOString(),
          localName,
          clienteNome,
          itemTotal,
          hub.pagamento || '',
          observations,
          comandaNome
        ], function (insErr) {
          if (insErr) {
            insertsFailed++;
            console.error('[Hub→Cozinha] Erro ao inserir item:', insErr.message);
          } else {
            pedidoIds.push(this.lastID);
            insertsDone++;
          }
          if (insertsDone + insertsFailed === itens.length) {
            const idsJson = JSON.stringify(pedidoIds);
            db.run(`UPDATE hub_pedidos SET enviado_cozinha = 1, pedido_link_ids = ?, status = 'Em preparo', atualizado_em = datetime('now','localtime') WHERE id = ?`,
              [idsJson, idNum], () => {
                broadcastHubPedidos();
                broadcastPedidos();
                socket.emit('hub_pedido_enviado_cozinha', { hubId: idNum, pedidoIds, comanda: comandaNome });
                sendPush('garcom', '🍽️ Novo Delivery!', `${canal} — ${clienteNome} — ${itens.length} item(ns)`, 'hub-' + idNum, '/fila-pedidos.html');
              });
          }
        });
      });
    });
  });

  socket.on('hub_desfazer_cozinha', (hubPedidoId) => {
    if (!socket.auth) return;
    const idNum = parseInt(hubPedidoId, 10);
    if (isNaN(idNum)) return;

    db.get(`SELECT * FROM hub_pedidos WHERE id = ?`, [idNum], (err, hub) => {
      if (!hub || !hub.enviado_cozinha) return;

      let pedidoIds = [];
      try { pedidoIds = JSON.parse(hub.pedido_link_ids || '[]'); } catch (e) { pedidoIds = []; }

      if (pedidoIds.length) {
        const placeholders = pedidoIds.map(() => '?').join(',');
        db.run(`UPDATE pedidos SET status = 'Cancelado' WHERE id IN (${placeholders})`, pedidoIds, () => {
          db.run(`UPDATE hub_pedidos SET enviado_cozinha = 0, pedido_link_ids = '[]', status = 'Recebido', atualizado_em = datetime('now','localtime') WHERE id = ?`,
            [idNum], () => {
              broadcastHubPedidos();
              broadcastPedidos();
              socket.emit('hub_pedido_desfeito_cozinha', { hubId: idNum });
            });
        });
      } else {
        db.run(`UPDATE hub_pedidos SET enviado_cozinha = 0, pedido_link_ids = '[]', status = 'Recebido', atualizado_em = datetime('now','localtime') WHERE id = ?`,
          [idNum], () => {
            broadcastHubPedidos();
            socket.emit('hub_pedido_desfeito_cozinha', { hubId: idNum });
          });
      }
    });
  });

  // --- INTEGRAÇÃO REAL COM iFOOD (por restaurante/tenant) ---
  const tidAtual = () => tenantContext.getStore() || 1;

  socket.on('ifood_get_state', async () => {
    try {
      const tdb = getTenantDb();
      const cfg = await ifoodApi.getAppConfig(masterDb);
      const conn = await ifoodApi.getConn(tdb, tidAtual());
      socket.emit('ifood_state', {
        app: { has_client_id: !!cfg.client_id, has_client_secret: !!cfg.client_secret },
        connection: ifoodApi.publicConnState(conn)
      });
    } catch (e) {
      socket.emit('ifood_state', { app: { has_client_id: false, has_client_secret: false }, connection: { status: 'error', last_error: e.message || 'Erro ao ler estado iFood' } });
    }
  });

  socket.on('ifood_save_app_config', async (cfg) => {
    if (!cfg || typeof cfg !== 'object') return;
    try {
      await ifoodApi.setAppConfig(masterDb, { client_id: cfg.client_id, client_secret: cfg.client_secret });
      socket.emit('ifood_app_config_saved');
      console.log('[iFood] Credenciais do aplicativo salvas.');
    } catch (e) {
      socket.emit('ifood_error', e.message || 'Erro ao salvar credenciais');
    }
  });

  socket.on('ifood_request_code', async () => {
    try {
      const tdb = getTenantDb();
      const info = await ifoodApi.requestUserCode(tdb, masterDb, tidAtual());
      socket.emit('ifood_code_ready', info);
      console.log(`[iFood] Código de conexão gerado para o tenant ${tidAtual()}.`);
    } catch (e) {
      socket.emit('ifood_error', e.message || 'Erro ao gerar código de conexão');
    }
  });

  socket.on('ifood_complete_auth', async (data) => {
    const authCode = data && data.authorization_code ? String(data.authorization_code).trim() : '';
    if (!authCode) { socket.emit('ifood_error', 'Informe o código de autorização recebido no portal iFood.'); return; }
    try {
      const tdb = getTenantDb();
      const result = await ifoodApi.completeAuth(tdb, masterDb, tidAtual(), authCode);
      if (isTenantFeatureEnabled(tidAtual(), 'ifood')) {
        ifoodApi.ensurePoller(tidAtual(), { io, masterDb, tenantContext, getTenantDb, dir: __dirname });
      } else {
        ifoodApi.stopPoller(tidAtual());
      }
      socket.emit('ifood_auth_completed', result);
      console.log(`[iFood] Conta conectada para o tenant ${tidAtual()}: ${result.merchantName || 'sem nome'}.`);
    } catch (e) {
      socket.emit('ifood_error', e.message || 'Erro ao completar a autorização');
    }
  });

  socket.on('ifood_disconnect', async () => {
    try {
      const tdb = getTenantDb();
      await ifoodApi.disconnect(tdb, tidAtual());
      socket.emit('ifood_state', {
        app: await ifoodApi.getAppConfig(masterDb).then(c => ({ has_client_id: !!c.client_id, has_client_secret: !!c.client_secret })),
        connection: { status: 'disconnected' }
      });
      console.log(`[iFood] Conexão removida para o tenant ${tidAtual()}.`);
    } catch (e) {
      socket.emit('ifood_error', e.message || 'Erro ao desconectar');
    }
  });

  socket.on('ifood_manual_poll', async () => {
    try {
      const tdb = getTenantDb();
      await ifoodApi.pollOnce(tdb, masterDb, io, tidAtual());
      socket.emit('ifood_poll_done');
    } catch (e) {
      socket.emit('ifood_error', e.message || 'Erro no polling manual');
    }
  });

  socket.on('ifood_sync_catalog', async () => {
    try {
      const tdb = getTenantDb();
      const result = await ifoodApi.syncCatalog(tdb, masterDb, tidAtual());
      socket.emit('ifood_catalog_synced', result);
      console.log(`[iFood] Catálogo sincronizado para o tenant ${tidAtual()}:`, result);
    } catch (e) {
      socket.emit('ifood_catalog_synced', { error: e.message || 'Erro ao sincronizar catálogo' });
    }
  });

  socket.on('aprovar_funcionario', (data) => {
    const id = typeof data === 'object' ? data.id : data;
    const cargo = typeof data === 'object' && data.cargo ? data.cargo : 'Garçom';
    const valor_hora = typeof data === 'object' && data.valor_hora ? data.valor_hora : 0;

    let login_expires_at = null;
    const duration = typeof data === 'object' ? data.login_duration : undefined;
    if (duration && duration !== 'lifetime') {
      if (duration === 'session') {
        login_expires_at = 'SESSION';
      } else if (duration === '1day') {
        const d = new Date(); d.setDate(d.getDate() + 1);
        login_expires_at = d.toISOString();
      } else if (duration === '1week') {
        const d = new Date(); d.setDate(d.getDate() + 7);
        login_expires_at = d.toISOString();
      } else if (duration === '1month') {
        const d = new Date(); d.setMonth(d.getMonth() + 1);
        login_expires_at = d.toISOString();
      }
    }

    db.run(`UPDATE funcionarios SET status = 'Ativo', cargo = ?, valor_hora = ?, login_expires_at = ? WHERE id = ?`, [cargo, valor_hora, login_expires_at, id], () => {
      db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
    });
  });

  socket.on('update_funcionario', (data) => {
    const { id, nome, usuario, senha, cargo, tipo_remuneracao, valor_hora, valor_dia, valor_semana, valor_mes, chave_pix, cpf, telefone, observacao_rh } = data;
    const vHora = parseFloat(valor_hora) || 0;
    const vDia = parseFloat(valor_dia) || 0;
    const vSemana = parseFloat(valor_semana) || 0;
    const vMes = parseFloat(valor_mes) || 0;
    const tRem = tipo_remuneracao || 'hora';

    if (senha && senha.trim() !== '') {
      const hash = bcrypt.hashSync(senha, 10);
      db.run(
        `UPDATE funcionarios SET nome = ?, usuario = ?, senha = ?, cargo = ?, tipo_remuneracao = ?, valor_hora = ?, valor_dia = ?, valor_semana = ?, valor_mes = ?, chave_pix = ?, cpf = ?, telefone = ?, observacao_rh = ? WHERE id = ?`,
        [nome, usuario, hash, cargo, tRem, vHora, vDia, vSemana, vMes, chave_pix || '', cpf || '', telefone || '', observacao_rh || '', id],
        (err) => {
          if (!err) db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
          else console.error("Erro update_funcionario:", err);
        }
      );
    } else {
      db.run(
        `UPDATE funcionarios SET nome = ?, usuario = ?, cargo = ?, tipo_remuneracao = ?, valor_hora = ?, valor_dia = ?, valor_semana = ?, valor_mes = ?, chave_pix = ?, cpf = ?, telefone = ?, observacao_rh = ? WHERE id = ?`,
        [nome, usuario, cargo, tRem, vHora, vDia, vSemana, vMes, chave_pix || '', cpf || '', telefone || '', observacao_rh || '', id],
        (err) => {
          if (!err) db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
          else console.error("Erro update_funcionario:", err);
        }
      );
    }
  });

  const _loginAttempts = new Map();
  const checkLoginRate = (ip) => {
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost') return true;
    const now = Date.now();
    const attempts = _loginAttempts.get(ip) || [];
    const recent = attempts.filter(t => now - t < 300000);
    return recent.length < 15;
  };
  const recordFailedLogin = (ip) => {
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost') return;
    const now = Date.now();
    const attempts = _loginAttempts.get(ip) || [];
    const recent = attempts.filter(t => now - t < 300000);
    recent.push(now);
    _loginAttempts.set(ip, recent);
  };
  const clearLoginRate = (ip) => {
    _loginAttempts.delete(ip);
  };

  const desconectarSessoesSingleLogin = () => {
    masterDb.get(`SELECT login_mode FROM restaurantes WHERE id = ?`, [socket.restaurante_id || 1], (e, rest) => {
      if (!e && rest && rest.login_mode === 'single' && socket.funcionarioId) {
        io.of('/').sockets.forEach(s => {
          if (s.restaurante_id === socket.restaurante_id && s.id !== socket.id && s.funcionarioId === socket.funcionarioId) {
            s.disconnect(true);
          }
        });
      }
    });
  };

  socket.on('logout_funcionario', () => {
    delete socket.funcionarioId;
    delete socket.funcionarioCargo;
  });

    socket.on('login_funcionario', ({ usuario, senha }) => {
      const u = trimStr(usuario, 50);
      const s = trimStr(senha, 200);
    if (!u || !s) return socket.emit('login_error', 'Usuário e senha são obrigatórios.');
    const ip = socket.handshake.address || 'unknown';
    if (!checkLoginRate(ip)) return socket.emit('login_error', 'Muitas tentativas. Aguarde alguns minutos.');
    localizarFuncionarioLogin(u, (row) => {
      if (!row) {
        recordFailedLogin(ip);
        return socket.emit('login_error', 'Usuário ou senha incorretos');
      }
      const tid = parseInt(row.restaurante_id, 10) || (tenantContext.getStore() || 1);
      tenantContext.run(tid, () => {
        if (tid !== socketTenantId) {
          socket.leave(`restaurante_${socketTenantId}`);
          socketTenantId = tid;
          socket.restaurante_id = tid;
          socket.join(`restaurante_${tid}`);
        }
        verificarSenhaFuncionario(row, s).then((ok) => {
          if (!ok) {
            recordFailedLogin(ip);
            return socket.emit('login_error', 'Usuário ou senha incorretos');
          }
          if (row.status === 'Pendente') {
            socket.emit('login_error', 'Seu cadastro está aguardando aprovação do caixa.');
          } else if (row.login_expires_at && row.login_expires_at !== 'SESSION' && new Date(row.login_expires_at) < new Date()) {
            socket.emit('login_error', 'Seu login expirou. Solicite uma nova aprovação ao gerente.');
          } else {
            clearLoginRate(ip);
            const payload = funcionarioPublico(row);
            if (!payload.restaurante_id) payload.restaurante_id = tid;
            socket.emit('login_success', payload);
            socket.funcionarioId = row.id;
            socket.funcionarioCargo = row.cargo;
            const sessToken = jwt.sign({ tipo: 'funcionario', id: row.id, nome: row.nome, usuario: row.usuario, cargo: row.cargo, restaurante_id: tid }, JWT_SECRET, { expiresIn: '90d' });
            socket.emit('login_token', sessToken);
            socket.emit('tenant_atualizado', { restaurante_id: tid, token: sessToken });
            db.run("INSERT INTO historico_logins (funcionario_id, funcionario_nome) VALUES (?, ?)", [row.id, row.nome]);
            const conn = activeSockets.get(socket.id);
            if (conn) {
              conn.user = row.nome;
              conn.device = row.cargo + ' (' + conn.deviceType + ')';
            }
            desconectarSessoesSingleLogin();
          }
        });
      });
    });
  });

  socket.on('login_funcionario_token', (token) => {
    const ip = socket.handshake.address || 'unknown';
    if (!checkLoginRate(ip)) return socket.emit('login_error', 'Muitas tentativas. Aguarde alguns minutos.');
    if (!token || typeof token !== 'string') return socket.emit('login_error', 'Sessão inválida.');
    let decoded = null;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return socket.emit('login_error', 'Sessão expirada. Faça login novamente.');
    }
    if (!decoded || decoded.tipo !== 'funcionario' || !isValidId(decoded.id)) {
      return socket.emit('login_error', 'Sessão inválida.');
    }
    const tid = parseInt(decoded.restaurante_id, 10) || (tenantContext.getStore() || 1);
    tenantContext.run(tid, () => {
      if (tid !== socketTenantId) {
        socket.leave(`restaurante_${socketTenantId}`);
        socketTenantId = tid;
        socket.restaurante_id = tid;
        socket.join(`restaurante_${tid}`);
      }
      db.get(`SELECT * FROM funcionarios WHERE id = ?`, [decoded.id], (err, row) => {
        if (err || !row) return socket.emit('login_error', 'Funcionário não encontrado. Faça login novamente.');
        if (row.status === 'Pendente') return socket.emit('login_error', 'Seu cadastro está aguardando aprovação do caixa.');
        if (row.login_expires_at && row.login_expires_at !== 'SESSION' && new Date(row.login_expires_at) < new Date()) return socket.emit('login_error', 'Seu login expirou. Solicite uma nova aprovação ao gerente.');
        const payload = funcionarioPublico(row);
        if (!payload.restaurante_id) payload.restaurante_id = tid;
        socket.emit('login_success', payload);
        socket.funcionarioId = row.id;
        socket.funcionarioCargo = row.cargo;
        const sessToken = jwt.sign({ tipo: 'funcionario', id: row.id, nome: row.nome, usuario: row.usuario, cargo: row.cargo, restaurante_id: tid }, JWT_SECRET, { expiresIn: '90d' });
        socket.emit('login_token', sessToken);
        socket.emit('tenant_atualizado', { restaurante_id: tid, token: sessToken });
        db.run("INSERT INTO historico_logins (funcionario_id, funcionario_nome) VALUES (?, ?)", [row.id, row.nome]);
        const conn = activeSockets.get(socket.id);
        if (conn) {
          conn.user = row.nome;
          conn.device = row.cargo + ' (' + conn.deviceType + ')';
        }
        desconectarSessoesSingleLogin();
      });
    });
  });

  socket.on('cadastro_funcionario', (f) => {
    const s = trimStr(f.senha, 200);
    if (!s) return socket.emit('cadastro_erro', 'Informe uma senha.');
    const hash = bcrypt.hashSync(s, 10);
    const restauranteId = socketTenantId || tenantContext.getStore() || 1;
    db.run(`INSERT INTO funcionarios (nome, usuario, senha, cargo, status, restaurante_id) VALUES (?, ?, ?, 'Garcom', 'Pendente', ?)`,
      [f.nome, f.usuario, hash, restauranteId], (err) => {
        if (err) {
          socket.emit('cadastro_erro', 'Erro ao cadastrar. Usuario pode ja existir.');
        } else {
          socket.emit('cadastro_sucesso');
          db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', (r || []).map(funcionarioPublico)));
        }
      });
  });

  socket.on('recusar_funcionario', (id) => {
    if (!exigirAdminSocket(socket)) return;
    db.run(`DELETE FROM funcionarios WHERE id = ?`, [id], () => {
      db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
    });
  });

  socket.on('atualizar_status_mesa', ({ nome, status, observacao }) => {
    if (status === 'Disponível') {
      mesasFechando.delete(nome);
      io.emit('sync_mesas_fechando', Array.from(mesasFechando));
    }
    let query = `UPDATE mesas SET status = ?`;
    let params = [status];
    if (observacao !== undefined) {
      query += `, observacao = ?`;
      params.push(observacao);
    }
    query += ` WHERE nome = ?`;
    params.push(nome);

    db.run(query, params, () => {
      db.all(`SELECT * FROM mesas`, (err, rows) => {
        io.emit('mesas_atualizadas', rows || []);
      });
    });
  });

  socket.on('alerta_pedir_conta', (mesaName) => {
    mesasFechando.add(mesaName);
    io.emit('toque_pedir_conta', mesaName);
    io.emit('sync_mesas_fechando', Array.from(mesasFechando));
  });

  // --- CLIENTES ---
  socket.on('get_clientes', () => {
    db.all(`SELECT * FROM clientes`, (err, rows) => socket.emit('clientes_atualizados', rows || []));
  });
  socket.on('add_cliente', (c) => {
    if (c.id) {
      // Update
      db.run(`UPDATE clientes SET nome=?, telefone=?, observacao=?, endereco=?, data_nascimento=? WHERE id=?`,
        [c.nome, c.telefone, c.observacao, c.endereco, c.data_nascimento, c.id], () => {
          db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
        });
    } else {
      // Insert
      db.run(`INSERT INTO clientes (nome, telefone, observacao, endereco, data_nascimento, pontos) VALUES (?, ?, ?, ?, ?, 0)`,
        [c.nome, c.telefone, c.observacao, c.endereco, c.data_nascimento], () => {
          db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
        });
    }
  });
  socket.on('delete_cliente', (id) => {
    if (!exigirAdminSocket(socket)) return;
    db.run(`DELETE FROM clientes WHERE id = ?`, [id], () => {
      db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
    });
  });

  socket.on('buscar_historico_cliente', (data) => {
    const nome = data.nome || null;
    const telefone = data.telefone || null;
    if (!nome && !telefone) return socket.emit('historico_cliente', { nome: null, historico: [] });
    let query, params;
    if (telefone) {
      query = `SELECT p.localName, p.productName, p.productEmoji, p.quantity, p.total, p.createdAt 
               FROM pedidos p
               LEFT JOIN clientes c ON p.cliente_id = c.id
               WHERE (c.telefone = ? OR p.mesa_comanda = ?) AND p.status IN ('Finalizado','Pago','Entregue')
               ORDER BY p.createdAt DESC LIMIT 10`;
      params = [telefone, nome];
    } else {
      query = `SELECT p.localName, p.productName, p.productEmoji, p.quantity, p.total, p.createdAt 
               FROM pedidos p
               LEFT JOIN clientes c ON p.cliente_id = c.id
               WHERE (p.mesa_comanda = ? OR c.nome = ?) AND p.status IN ('Finalizado','Pago','Entregue')
               ORDER BY p.createdAt DESC LIMIT 10`;
      params = [nome, nome];
    }
    db.all(query, params, (err, rows) => {
      socket.emit('historico_cliente', { nome, historico: rows || [] });
    });
  });

  socket.on('resgatar_premio_qr', (data) => {
    // Pode receber apenas a string do QR Code ou um objeto { qrCodeStr, mesaName }
    const qrCodeStr = typeof data === 'string' ? data : data.qrCodeStr;
    const mesaName = typeof data === 'object' ? data.mesaName : null;

    if (!qrCodeStr || !qrCodeStr.startsWith('RESGATE:')) {
      return socket.emit('resgate_erro', 'QR Code inválido. Formato esperado: RESGATE:TELEFONE:CUSTO:PRODUTO');
    }

    const parts = qrCodeStr.split(':');
    if (parts.length < 4) return socket.emit('resgate_erro', 'QR Code mal formatado.');

    const telefone = parts[1];
    const custo = parseInt(parts[2], 10);
    const produto = parts.slice(3).join(':'); // Permite que o produto tenha dois pontos no nome

    db.get(`SELECT * FROM clientes WHERE telefone = ?`, [telefone], (err, cliente) => {
      if (!cliente) return socket.emit('resgate_erro', 'Cliente não encontrado com este telefone.');
      if (cliente.pontos < custo) return socket.emit('resgate_erro', `Saldo insuficiente. Cliente tem ${cliente.pontos} pts, e o prêmio custa ${custo} pts.`);

      // Deduzir pontos (atomic check + deduct to prevent race conditions)
      db.run(`UPDATE clientes SET pontos = pontos - ? WHERE id = ? AND pontos >= ?`, [custo, cliente.id, custo], (err2) => {
        if (err2) return socket.emit('resgate_erro', 'Erro ao deduzir pontos.');

        // Check if the update actually affected a row (balance was sufficient)
        db.get(`SELECT changes() as ch`, [], (errCh, rowCh) => {
          if (!errCh && rowCh && rowCh.ch === 0) {
            return socket.emit('resgate_erro', 'Saldo insuficiente (concorrência). Tente novamente.');
          }

          // Atualizar a interface dos clientes globalmente
          db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));

          // Enviar sucesso e dados do produto
          socket.emit('resgate_sucesso', {
            cliente: cliente,
            produto: produto,
            custo: custo
          });

          // Se uma mesa foi fornecida (App do Garçom), lança automaticamente o prêmio na mesa
          if (mesaName) {
            db.get(`SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`, (err3, turno) => {
              if (turno) {
                const pedido = {
                  localName: mesaName,
                  userName: 'App Garçom',
                  productName: produto + ' (Prêmio Fidelidade)',
                  productEmoji: '🎁',
                  quantity: 1,
                  total: '0,00',
                  status: 'Recebido',
                  time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                  sector: 'Cozinha 1', // Ou tentar inferir o setor do produto
                  turno_id: turno.id,
                  cliente_id: cliente.id
                };

                db.run(
                  `INSERT INTO pedidos (localName, userName, productName, productEmoji, quantity, total, status, time, sector, turno_id, cliente_id, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
                  [pedido.localName, pedido.userName, pedido.productName, pedido.productEmoji, pedido.quantity, pedido.total, pedido.status, pedido.time, pedido.sector, pedido.turno_id, pedido.cliente_id],
                  function (err4) {
                    if (!err4) {
                      pedido.id = this.lastID;
                      io.emit('novo_pedido', pedido);
                      // Atualiza o status da mesa para ocupada se for nova
                      db.get(`SELECT status FROM mesas WHERE nome = ?`, [mesaName], (err, m) => {
                        if (m && m.status === 'Disponível') {
                          db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ?`, [mesaName], () => {
                            db.all(`SELECT * FROM mesas`, (e, r) => io.emit('mesas_atualizadas', r || []));
                          });
                        }
                      });
                    }
                  }
                );
              }
            });
          }
        });
      });
    });
  });

  // --- FIDELIDADE & PONTOS DO CLIENTE ---
  socket.on('buscar_cliente_telefone', (query) => {
    const q = (query || '').trim();
    if (!q) {
      socket.emit('resultado_cliente_telefone', null);
      socket.emit('cliente_telefone_encontrado', { telefone: q, nome: null });
      return;
    }
    db.get(
      `SELECT * FROM clientes WHERE telefone LIKE ? OR nome LIKE ? LIMIT 1`,
      [`%${q}%`, `%${q}%`],
      (err, row) => {
        socket.emit('resultado_cliente_telefone', row || null);
        // Also emit the event garcom.js listens for
        socket.emit('cliente_telefone_encontrado', { telefone: q, nome: row ? row.nome : null });
      }
    );
  });

  socket.on('ajustar_pontos_cliente', ({ id, pontos }) => {
    const novosPontos = Math.max(0, parseInt(pontos, 10) || 0);
    db.run(`UPDATE clientes SET pontos = ? WHERE id = ?`, [novosPontos, id], (err) => {
      if (!err) {
        db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
      }
    });
  });

  socket.on('resgatar_pontos_manual', ({ cliente_id, custo_pontos, produto_nome, mesaName }) => {
    const custo = parseInt(custo_pontos, 10) || 0;
    if (custo <= 0) return socket.emit('resgate_erro', 'Custo em pontos inválido.');

    db.get(`SELECT * FROM clientes WHERE id = ?`, [cliente_id], (err, cliente) => {
      if (!cliente) return socket.emit('resgate_erro', 'Cliente não encontrado.');
      if ((cliente.pontos || 0) < custo) {
        return socket.emit('resgate_erro', `Saldo insuficiente! O cliente possui ${cliente.pontos || 0} pts, mas o prêmio custa ${custo} pts.`);
      }

      db.run(`UPDATE clientes SET pontos = pontos - ? WHERE id = ? AND pontos >= ?`, [custo, cliente_id, custo], (err2) => {
        if (err2) return socket.emit('resgate_erro', 'Erro ao deduzir pontos.');

        db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));

        socket.emit('resgate_sucesso', {
          cliente,
          produto: produto_nome,
          custo
        });
      });
    });
  });

  // --- PROMOCOES ---
  socket.on('get_promocoes', () => {
    db.all(`SELECT * FROM promocoes`, (err, rows) => socket.emit('promocoes_atualizadas', rows || []));
  });
  socket.on('add_promocao', (p) => db.run(`INSERT INTO promocoes (nome, regra, desconto, ativo, config) VALUES (?, ?, ?, ?, ?)`, [p.nome, p.regra, p.desconto, p.ativo !== undefined ? p.ativo : 1, p.config], () => {
    db.all(`SELECT * FROM promocoes`, (e, r) => io.emit('promocoes_atualizadas', r || []));
  }));
  socket.on('update_promocao', (p) => db.run(`UPDATE promocoes SET nome = ?, regra = ?, desconto = ?, ativo = ?, config = ? WHERE id = ?`, [p.nome, p.regra, p.desconto || 0, p.ativo !== undefined ? p.ativo : 1, p.config, p.id], () => {
    db.all(`SELECT * FROM promocoes`, (e, r) => io.emit('promocoes_atualizadas', r || []));
  }));
  socket.on('delete_promocao', (id) => {
    if (!exigirAdminSocket(socket)) return;
    db.run(`DELETE FROM promocoes WHERE id = ?`, [id], () => {
      db.all(`SELECT * FROM promocoes`, (e, r) => io.emit('promocoes_atualizadas', r || []));
    });
  });

  // --- AI COMBO GENERATOR - Sugestões Inteligentes de Vendas ---
  const TAX_RATES = {
    'Alimentacao': { icms: 7, pis_cofins: 9.25, total: 16.25 },
    'Bebida_Nao_Alcoolica': { icms: 12, pis_cofins: 9.25, total: 21.25 },
    'Bebida_Alcoolica': { icms: 18, pis_cofins: 11.33, total: 29.33 },
    'Servico': { icms: 5, pis_cofins: 9.25, total: 14.25 },
    'Outros': { icms: 12, pis_cofins: 9.25, total: 21.25 }
  };
  const TAX_LABELS = {
    'Alimentacao': 'Alimentação', 'Bebida_Nao_Alcoolica': 'Bebida Não-Alc.',
    'Bebida_Alcoolica': 'Bebida Alcoólica', 'Servico': 'Serviço', 'Outros': 'Outros'
  };

  socket.on('get_ai_combo_suggestions', () => {
    db.all(`SELECT * FROM produtos WHERE status = 'ativo' ORDER BY categoria, nome`, (err, products) => {
      if (err || !products || products.length < 2) {
        return socket.emit('ai_combo_suggestions', { suggestions: [], stats: {}, error: 'Cadastre pelo menos 2 produtos ativos.' });
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Pedidos dos últimos 30 dias (para análise de co-ocorrência)
      db.all(
        `SELECT id, productName, createdAt FROM pedidos 
         WHERE createdAt >= ? AND status IN ('Finalizado','Pago','Entregue')
         AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pagamento%'
         ORDER BY id`,
        [thirtyDaysAgo], (errSales, sales) => {

          // Vendas dos últimos 7 dias (para tendência)
          db.all(
            `SELECT productName, COUNT(*) as qty, SUM(CAST(REPLACE(REPLACE(total, ',', '.'), 'R$', '') AS REAL)) as revenue
             FROM pedidos WHERE createdAt >= ? AND status IN ('Finalizado','Pago','Entregue')
             AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pagamento%'
             GROUP BY productName ORDER BY qty DESC`,
            [sevenDaysAgo], (errTrend, trendSales) => {

              // Mapa de vendas
              const salesMap30d = {};
              (sales || []).forEach(s => {
                if (!salesMap30d[s.productName]) salesMap30d[s.productName] = { qty: 0, revenue: 0 };
                salesMap30d[s.productName].qty++;
                salesMap30d[s.productName].revenue += Math.abs(parseFloat(String(s.total || '0').replace(/[R$\s]/g, '').replace(',', '.')) || 0);
              });

              const salesMap7d = {};
              (trendSales || []).forEach(s => {
                salesMap7d[s.productName] = { qty: s.qty, revenue: Math.abs(s.revenue || 0) };
              });

              // Mapa de produtos ativos
              const prodMap = {};
              products.forEach(p => {
                prodMap[p.nome] = {
                  id: p.id, nome: p.nome, preco: p.preco, categoria: p.categoria,
                  emoji: p.emoji || '', categoria_fiscal: p.categoria_fiscal || 'Alimentacao',
                  estoque: p.estoque, status_inicial: p.status_inicial,
                  vendas30d: salesMap30d[p.nome] || { qty: 0, revenue: 0 },
                  vendas7d: salesMap7d[p.nome] || { qty: 0, revenue: 0 }
                };
              });

              // ═══ ESTRATÉGIA 1: FREQUENTEMENTE JUNTOS (Market Basket) ═══
              // Agrupa vendas por timestamp (mesma mesa/pedido) para encontrar pares co-frequentes
              const pedidoGrupos = {};
              (sales || []).forEach(s => {
                const key = s.id; // cada pedido tem um id único
                if (!pedidoGrupos[key]) pedidoGrupos[key] = new Set();
                if (prodMap[s.productName]) pedidoGrupos[key].add(s.productName);
              });

              const parCount = {};
              const produtoPairCount = {};
              Object.values(pedidoGrupos).forEach(produtos => {
                const arr = [...produtos];
                for (let i = 0; i < arr.length; i++) {
                  for (let j = i + 1; j < arr.length; j++) {
                    const key = [arr[i], arr[j]].sort().join('|||');
                    parCount[key] = (parCount[key] || 0) + 1;
                    produtoPairCount[arr[i]] = (produtoPairCount[arr[i]] || 0) + 1;
                    produtoPairCount[arr[j]] = (produtoPairCount[arr[j]] || 0) + 1;
                  }
                }
              });

              const suggestions = [];

              // Top pares co-frequentes
              const topPairs = Object.entries(parCount)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);

              topPairs.forEach(([key, count]) => {
                const [nomeA, nomeB] = key.split('|||');
                const a = prodMap[nomeA], b = prodMap[nomeB];
                if (!a || !b || a.id === b.id) return;
                const soma = a.preco + b.preco;
                const desconto = count >= 5 ? 10 : count >= 3 ? 8 : 5;
                const comboPrice = +(soma * (1 - desconto / 100)).toFixed(2);
                suggestions.push({
                  tipo: 'frequente_junto',
                  titulo: `${a.emoji} ${a.nome} + ${b.emoji} ${b.nome}`,
                  descricao: `Frequentemente pedido junto — ${count}x nos últimos 30 dias`,
                  itens: [{ id: a.id, nome: a.nome, preco: a.preco }, { id: b.id, nome: b.nome, preco: b.preco }],
                  precoOriginal: +soma.toFixed(2),
                  precoCombo: comboPrice,
                  descontoPct: desconto,
                  economiaEstimada: +(soma - comboPrice).toFixed(2),
                  prioridade: count * 10,
                  icon: '🔥',
                  evidencia: `${count}x juntos`
                });
              });

              // ═══ ESTRATÉGIA 2: ESTRELA + DORMÊNCIA ═══
              // Parear produto mais vendido com produto menos vendido (do mesmo tipo)
              const allProds = Object.values(prodMap).sort((a, b) => b.vendas30d.qty - a.vendas30d.qty);
              const bestSellers = allProds.filter(p => p.vendas30d.qty >= 3);
              const lowSellers = allProds.filter(p => p.vendas30d.qty <= 1 && p.vendas30d.qty >= 0);

              bestSellers.slice(0, 5).forEach(best => {
                const complemento = lowSellers.find(l =>
                  l.id !== best.id &&
                  l.categoria_fiscal !== best.categoria_fiscal &&
                  Math.abs(best.preco - l.preco) < best.preco * 0.5
                );
                if (!complemento) return;
                const soma = best.preco + complemento.preco;
                const desconto = 12;
                const comboPrice = +(soma * 0.88).toFixed(2);
                suggestions.push({
                  tipo: 'estrella_dormencia',
                  titulo: `${best.emoji} ${best.nome} + ${complemento.emoji} ${complemento.nome}`,
                  descricao: `${best.nome} é o mais vendido! Acompanhe com ${complemento.nome} (parado no estoque)`,
                  itens: [{ id: best.id, nome: best.nome, preco: best.preco }, { id: complemento.id, nome: complemento.nome, preco: complemento.preco }],
                  precoOriginal: +soma.toFixed(2),
                  precoCombo: comboPrice,
                  descontoPct: desconto,
                  economiaEstimada: +(soma - comboPrice).toFixed(2),
                  prioridade: best.vendas30d.qty * 3 + 5,
                  icon: '⭐',
                  evidencia: `${best.vendas30d.qty} vendas vs ${complemento.vendas30d.qty} venda(s)`
                });
              });

              // ═══ ESTRATÉGIA 3: COMBO DO MOMENTO (Hora do dia) ═══
              const hora = new Date().getHours();
              let periodo = 'noite';
              if (hora >= 6 && hora < 12) periodo = 'manha';
              else if (hora >= 12 && hora < 15) periodo = 'almoco';
              else if (hora >= 15 && hora < 18) periodo = 'tarde';

              const sugestoesPeriodo = [];
              if (periodo === 'manha') {
                // Café da manhã: produtos com "café", "pão", "suco", "sanduíche"
                const palavrasChave = ['cafe', 'café', 'pão', 'suco', 'sanduiche', 'sanduíche', 'bolo', 'iogurte'];
                allProds.forEach(p => {
                  const nomeLow = p.nome.toLowerCase();
                  if (palavrasChave.some(k => nomeLow.includes(k))) sugestoesPeriodo.push(p);
                });
              } else if (periodo === 'almoco' || periodo === 'tarde') {
                // Almoço/lanche: marmita, prato, batata, refrigerante
                const palavrasChave = ['marmita', 'prato', 'batata', 'refrigerante', 'água', 'agua', 'suco', 'lanche'];
                allProds.forEach(p => {
                  const nomeLow = p.nome.toLowerCase();
                  if (palavrasChave.some(k => nomeLow.includes(k))) sugestoesPeriodo.push(p);
                });
              } else {
                // Noite: pizza, porção, cerveja, drink
                const palavrasChave = ['pizza', 'porção', 'porcao', 'cerveja', 'drink', 'hambúrguer', 'hamburguer', 'churrasco'];
                allProds.forEach(p => {
                  const nomeLow = p.nome.toLowerCase();
                  if (palavrasChave.some(k => nomeLow.includes(k))) sugestoesPeriodo.push(p);
                });
              }

              if (sugestoesPeriodo.length >= 2) {
                const sorted = sugestoesPeriodo.sort((a, b) => b.vendas30d.qty - a.vendas30d.qty);
                for (let i = 0; i < Math.min(sorted.length - 1, 3); i++) {
                  const a = sorted[i], b = sorted[i + 1];
                  if (a.id === b.id) continue;
                  const soma = a.preco + b.preco;
                  const desconto = 8;
                  const comboPrice = +(soma * 0.92).toFixed(2);
                  const labelsPeriodo = { manha: 'Café da Manhã', almoco: 'Almoço', tarde: 'Lanche da Tarde', noite: 'Jantar' };
                  suggestions.push({
                    tipo: 'combo_momento',
                    titulo: `${a.emoji} ${a.nome} + ${b.emoji} ${b.nome}`,
                    descricao: `Combo ${labelsPeriodo[periodo]} — sugerido para este horário`,
                    itens: [{ id: a.id, nome: a.nome, preco: a.preco }, { id: b.id, nome: b.nome, preco: b.preco }],
                    precoOriginal: +soma.toFixed(2),
                    precoCombo: comboPrice,
                    descontoPct: desconto,
                    economiaEstimada: +(soma - comboPrice).toFixed(2),
                    prioridade: 15,
                    icon: periodo === 'manha' ? '☀️' : periodo === 'almoco' ? '🍽️' : periodo === 'tarde' ? '🌅' : '🌙',
                    evidencia: `Sugerido para ${labelsPeriodo[periodo].toLowerCase()}`
                  });
                }
              }

              // ═══ ESTRATÉGIA 4: CROSS-SELL INTELIGENTE ═══
              // Se o cliente pediu comida, sugira bebida e vice-versa (baseado nos top sellers)
              const foods = allProds.filter(p => p.categoria_fiscal === 'Alimentacao' && p.vendas30d.qty > 0);
              const drinks = allProds.filter(p => (p.categoria_fiscal === 'Bebida_Alcoolica' || p.categoria_fiscal === 'Bebida_Nao_Alcoolica') && p.vendas30d.qty > 0);

              if (foods.length > 0 && drinks.length > 0) {
                const topFood = foods[0];
                const topDrink = drinks[0];
                if (topFood.id !== topDrink.id) {
                  const soma = topFood.preco + topDrink.preco;
                  const desconto = 10;
                  const comboPrice = +(soma * 0.90).toFixed(2);
                  suggestions.push({
                    tipo: 'cross_sell',
                    titulo: `${topFood.emoji} ${topFood.nome} + ${topDrink.emoji} ${topDrink.nome}`,
                    descricao: `O combo mais pedido do restaurante — ${topFood.vendas30d.qty}x + ${topDrink.vendas30d.qty}x vendidos`,
                    itens: [{ id: topFood.id, nome: topFood.nome, preco: topFood.preco }, { id: topDrink.id, nome: topDrink.nome, preco: topDrink.preco }],
                    precoOriginal: +soma.toFixed(2),
                    precoCombo: comboPrice,
                    descontoPct: desconto,
                    economiaEstimada: +(soma - comboPrice).toFixed(2),
                    prioridade: topFood.vendas30d.qty + topDrink.vendas30d.qty + 20,
                    icon: '🏆',
                    evidencia: `Top 1 em cada categoria`
                  });
                }
              }

              // ═══ ESTRATÉGIA 5: ALTO MARGEM COM BAIXA VISIBILIDADE ═══
              // Produtos com preço alto mas poucas vendas — precisa de promo
              const altoMargemBaixa = allProds.filter(p =>
                p.preco > 20 && p.vendas30d.qty <= 2 && p.vendas30d.qty >= 0
              ).sort((a, b) => b.preco - a.preco);

              if (altoMargemBaixa.length >= 2) {
                const a = altoMargemBaixa[0], b = altoMargemBaixa[1];
                if (a.id !== b.id) {
                  const soma = a.preco + b.preco;
                  const desconto = 15;
                  const comboPrice = +(soma * 0.85).toFixed(2);
                  suggestions.push({
                    tipo: 'alto_margem',
                    titulo: `${a.emoji} ${a.nome} + ${b.emoji} ${b.nome}`,
                    descricao: `Produtos de alto valor com baixa saída — combo promocional para impulsionar`,
                    itens: [{ id: a.id, nome: a.nome, preco: a.preco }, { id: b.id, nome: b.nome, preco: b.preco }],
                    precoOriginal: +soma.toFixed(2),
                    precoCombo: comboPrice,
                    descontoPct: desconto,
                    economiaEstimada: +(soma - comboPrice).toFixed(2),
                    prioridade: 10,
                    icon: '💎',
                    evidencia: `${a.vendas30d.qty}x e ${b.vendas30d.qty}x vendidos (R$ ${a.preco} + R$ ${b.preco})`
                  });
                }
              }

              // Deduplicar e ordenar por prioridade
              const seen = new Set();
              const unique = suggestions.filter(s => {
                const key = s.itens.map(i => i.id).sort().join('-');
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              }).sort((a, b) => b.prioridade - a.prioridade).slice(0, 8);

              // Stats
              const totalRevenue = Object.values(salesMap30d).reduce((s, v) => s + v.revenue, 0);
              const catRevenue = {};
              products.forEach(p => {
                const cat = p.categoria_fiscal || 'Alimentacao';
                if (!catRevenue[cat]) catRevenue[cat] = 0;
                catRevenue[cat] += (salesMap30d[p.nome]?.revenue || 0);
              });

              const stats = {
                totalProdutos: products.length,
                totalFaturado30d: +totalRevenue.toFixed(2),
                totalPedidos30d: (sales || []).length,
                periodoAtual: periodo,
                distribuicao: Object.keys(catRevenue).map(cat => ({
                  categoria: TAX_LABELS[cat] || cat,
                  faturamento: +(catRevenue[cat] || 0).toFixed(2),
                  percentual: totalRevenue > 0 ? +((catRevenue[cat] / totalRevenue) * 100).toFixed(1) : 0
                })),
                topProdutos: allProds.slice(0, 5).map(p => ({
                  nome: p.nome, emoji: p.emoji, vendas: p.vendas30d.qty,
                  receita: +p.vendas30d.revenue.toFixed(2)
                }))
              };

              socket.emit('ai_combo_suggestions', { suggestions: unique, stats });
            }
          );
        }
      );
    });
  });

  // --- FIDELIDADE COMPLETA (config, níveis, check-in QR, ofertas) ---
  const ORDEM_NIVEIS = { 'Bronze': 0, 'Prata': 1, 'Ouro': 2, 'Diamante': 3 };

  function fidelidadeNivelServer(totalGasto, cfg) {
    const prata = parseFloat(cfg.fidelidade_nivel_prata) || 500;
    const ouro = parseFloat(cfg.fidelidade_nivel_ouro) || 1500;
    const diamante = parseFloat(cfg.fidelidade_nivel_diamante) || 3500;
    if (totalGasto >= diamante) return 'Diamante';
    if (totalGasto >= ouro) return 'Ouro';
    if (totalGasto >= prata) return 'Prata';
    return 'Bronze';
  }

  socket.on('get_fidelidade_config', () => {
    db.all(`SELECT chave, valor FROM configuracoes`, (err, rows) => {
      const cfg = {};
      if (rows) rows.forEach(r => cfg[r.chave] = r.valor);
      socket.emit('fidelidade_config_atual', {
        enabled: cfg.fidelidade_enabled !== 'false',
        pontos_por_real: parseFloat(cfg.fidelidade_pontos_por_real) || 1,
        checkin_pontos: parseInt(cfg.fidelidade_checkin_pontos) || 5,
        checkin_diario: cfg.fidelidade_checkin_diario !== 'false',
        niveis: [
          { nome: 'Bronze', minimo: 0, bonus: 0 },
          { nome: 'Prata', minimo: parseInt(cfg.fidelidade_nivel_prata) || 500, bonus: parseInt(cfg.fidelidade_bonus_prata) || 10 },
          { nome: 'Ouro', minimo: parseInt(cfg.fidelidade_nivel_ouro) || 1500, bonus: parseInt(cfg.fidelidade_bonus_ouro) || 20 },
          { nome: 'Diamante', minimo: parseInt(cfg.fidelidade_nivel_diamante) || 3500, bonus: parseInt(cfg.fidelidade_bonus_diamante) || 30 }
        ]
      });
    });
  });

  socket.on('admin_atualizar_fidelidade_config', (cfg) => {
    const campos = ['fidelidade_enabled', 'fidelidade_pontos_por_real', 'fidelidade_checkin_pontos', 'fidelidade_checkin_diario', 'fidelidade_nivel_prata', 'fidelidade_nivel_ouro', 'fidelidade_nivel_diamante', 'fidelidade_bonus_prata', 'fidelidade_bonus_ouro', 'fidelidade_bonus_diamante'];
    let pendentes = campos.length;
    const finalizar = () => { pendentes--; if (pendentes <= 0) socket.emit('fidelidade_config_salvo', { success: true }); };
    campos.forEach(k => {
      if (cfg && cfg[k] !== undefined) {
        db.run(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, String(cfg[k])], finalizar);
      } else { finalizar(); }
    });
  });

  socket.on('cliente_checkin', (data) => {
    const { cliente_id, telefone } = data || {};
    const whereClause = isValidId(cliente_id) ? 'id = ?' : 'telefone = ?';
    const param = isValidId(cliente_id) ? cliente_id : String(telefone || '').replace(/\D/g, '');
    db.get(`SELECT * FROM clientes WHERE ${whereClause}`, [param], (err, cliente) => {
      if (!cliente) return socket.emit('checkin_response', { error: 'Cliente não encontrado. Cadastre-se no caixa.' });
      db.all(`SELECT chave, valor FROM configuracoes`, (eCfg, cfgRows) => {
        const cfg = {};
        if (cfgRows) cfgRows.forEach(r => cfg[r.chave] = r.valor);
        if (cfg.fidelidade_enabled === 'false') return socket.emit('checkin_response', { error: 'Programa de fidelidade desativado.' });
        const pontos = Math.max(1, parseInt(cfg.fidelidade_checkin_pontos) || 5);
        const diario = cfg.fidelidade_checkin_diario !== 'false';
        const agora = new Date();
        const hoje = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0') + '-' + String(agora.getDate()).padStart(2, '0');
        if (diario && cliente.ultimo_checkin === hoje) {
          return socket.emit('checkin_response', { success: false, error: 'Você já fez check-in hoje. Volte amanhã!' });
        }
        db.run(`UPDATE clientes SET pontos = pontos + ?, ultimo_checkin = ? WHERE id = ?`, [pontos, hoje, cliente.id], (err2) => {
          if (err2) return socket.emit('checkin_response', { error: 'Erro ao registrar check-in.' });
          db.run(`INSERT INTO checkins_fidelidade (cliente_id, pontos, data) VALUES (?, ?, datetime('now', 'localtime'))`, [cliente.id, pontos], () => {
            socket.emit('checkin_response', { success: true, pontos, novoSaldo: (parseInt(cliente.pontos) || 0) + pontos });
            db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
          });
        });
      });
    });
  });

  socket.on('get_cliente_checkins', (cliente_id) => {
    if (!isValidId(cliente_id)) return socket.emit('cliente_checkins_lista', []);
    db.all(`SELECT * FROM checkins_fidelidade WHERE cliente_id = ? ORDER BY id DESC LIMIT 30`, [cliente_id], (err, rows) => {
      socket.emit('cliente_checkins_lista', rows || []);
    });
  });

  socket.on('get_ofertas_fidelidade', (cliente_id) => {
    db.get(`SELECT nivel, total_gasto FROM clientes WHERE id = ?`, [cliente_id], (err, cliente) => {
      const nivel = (cliente && cliente.nivel) || 'Bronze';
      const idx = ORDEM_NIVEIS[nivel] !== undefined ? ORDEM_NIVEIS[nivel] : 0;
      db.all(`SELECT * FROM ofertas_fidelidade WHERE ativo = 1 ORDER BY id DESC`, [], (err, rows) => {
        const permitidos = (rows || []).filter(o => (ORDEM_NIVEIS[o.nivel] !== undefined ? ORDEM_NIVEIS[o.nivel] : 0) <= idx);
        socket.emit('ofertas_fidelidade_lista', permitidos);
      });
    });
  });

  socket.on('admin_get_ofertas_fidelidade', () => {
    db.all(`SELECT * FROM ofertas_fidelidade ORDER BY id DESC`, (err, rows) => socket.emit('admin_ofertas_fidelidade_lista', rows || []));
  });
  socket.on('add_oferta_fidelidade', (o) => {
    db.run(`INSERT INTO ofertas_fidelidade (titulo, descricao, nivel, ativo) VALUES (?, ?, ?, ?)`, [o.titulo, o.descricao, o.nivel || 'Bronze', o.ativo ? 1 : 0], () => {
      db.all(`SELECT * FROM ofertas_fidelidade ORDER BY id DESC`, (err, rows) => io.emit('admin_ofertas_fidelidade_lista', rows || []));
    });
  });
  socket.on('edit_oferta_fidelidade', (o) => {
    db.run(`UPDATE ofertas_fidelidade SET titulo=?, descricao=?, nivel=?, ativo=? WHERE id=?`, [o.titulo, o.descricao, o.nivel || 'Bronze', o.ativo ? 1 : 0, o.id], () => {
      db.all(`SELECT * FROM ofertas_fidelidade ORDER BY id DESC`, (err, rows) => io.emit('admin_ofertas_fidelidade_lista', rows || []));
    });
  });
  socket.on('delete_oferta_fidelidade', (id) => {
    if (!exigirAdminSocket(socket)) return;
    if (!isValidId(id)) return;
    db.run(`DELETE FROM ofertas_fidelidade WHERE id=?`, [id], () => {
      db.all(`SELECT * FROM ofertas_fidelidade ORDER BY id DESC`, (err, rows) => io.emit('admin_ofertas_fidelidade_lista', rows || []));
    });
  });

  // --- FIDELIDADE / ÁREA DO CLIENTE ---
  socket.on('cliente_login', (telefone) => {
    db.get(`SELECT * FROM clientes WHERE telefone = ?`, [telefone], (err, cliente) => {
      if (err) return socket.emit('cliente_login_response', { error: 'Erro no servidor' });
      if (cliente) {
        socket.emit('cliente_login_response', { success: true, cliente });
      } else {
        socket.emit('cliente_login_response', { error: 'Cliente não encontrado. Solicite seu cadastro no caixa.' });
      }
    });
  });

  socket.on('get_beneficios', () => {
    db.all(`SELECT * FROM beneficios WHERE ativo = 1 ORDER BY pontos ASC`, (err, rows) => {
      socket.emit('beneficios_lista', rows || []);
    });
  });

  socket.on('resgatar_beneficio', ({ cliente_id, beneficio_id }) => {
    db.get(`SELECT pontos FROM clientes WHERE id = ?`, [cliente_id], (err, cliente) => {
      if (!cliente) return socket.emit('resgate_response', { error: 'Cliente inválido' });
      db.get(`SELECT pontos, nome FROM beneficios WHERE id = ? AND ativo = 1`, [beneficio_id], (err, beneficio) => {
        if (!beneficio) return socket.emit('resgate_response', { error: 'Benefício inválido' });

        if (cliente.pontos < beneficio.pontos) {
          return socket.emit('resgate_response', { error: 'Pontos insuficientes' });
        }

        const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();
        const custo = beneficio.pontos;

        // Atomic deduct with balance check at DB level
        db.run(`UPDATE clientes SET pontos = pontos - ? WHERE id = ? AND pontos >= ?`, [custo, cliente_id, custo], (err) => {
          if (!err) {
            db.run(`INSERT INTO resgates (cliente_id, beneficio_id, codigo, data) VALUES (?, ?, ?, datetime('now', 'localtime'))`,
              [cliente_id, beneficio_id, codigo], () => {
                const novoSaldo = cliente.pontos - custo;
                socket.emit('resgate_response', { success: true, codigo, novoSaldo });
                db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_lista', r || []));
              });
          }
        });
      });
    });
  });

  socket.on('get_resgates_cliente', (cliente_id) => {
    db.all(`
      SELECT r.*, b.nome as beneficio_nome 
      FROM resgates r 
      JOIN beneficios b ON r.beneficio_id = b.id 
      WHERE r.cliente_id = ? 
      ORDER BY r.id DESC`,
      [cliente_id], (err, rows) => {
        socket.emit('resgates_cliente_lista', rows || []);
      });
  });

  socket.on('get_cliente_pedidos', (data) => {
    const { cliente_id, telefone } = data || {};
    if (!cliente_id && !telefone) return socket.emit('cliente_pedidos_response', []);
    let query, params;
    if (cliente_id) {
      query = `SELECT p.id, p.localName as mesa, p.status, p.total, p.productName, p.quantity, p.time as hora, p.createdAt as data FROM pedidos p WHERE p.cliente_id = ? AND p.status NOT IN ('Cancelado', 'Chamada') ORDER BY p.id DESC LIMIT 20`;
      params = [cliente_id];
    } else {
      query = `SELECT p.id, p.localName as mesa, p.status, p.total, p.productName, p.quantity, p.time as hora, p.createdAt as data FROM pedidos p WHERE p.userName = ? AND p.status NOT IN ('Cancelado', 'Chamada') ORDER BY p.id DESC LIMIT 20`;
      params = [telefone];
    }
    db.all(query, params, (err, rows) => {
      socket.emit('cliente_pedidos_response', rows || []);
    });
  });

  socket.on('get_cliente_visitas', (data) => {
    const { cliente_id, telefone } = data || {};
    if (!cliente_id && !telefone) return socket.emit('cliente_visitas_response', []);
    let query, params;
    if (cliente_id) {
      query = `SELECT v.mesa, v.data_visita as data, v.pontos_ganhos, v.contabilizado FROM cliente_visitas v WHERE v.cliente_id = ? ORDER BY v.id DESC LIMIT 30`;
      params = [cliente_id];
    } else {
      query = `SELECT v.mesa, v.data_visita as data, v.pontos_ganhos, v.contabilizado FROM cliente_visitas v WHERE v.cliente_telefone = ? ORDER BY v.id DESC LIMIT 30`;
      params = [telefone];
    }
    db.all(query, params, (err, rows) => {
      socket.emit('cliente_visitas_response', rows || []);
    });
  });

  socket.on('registrar_visita', (data) => {
    const { cliente_id, cliente_nome, cliente_telefone, mesa } = data || {};
    if (!cliente_id && !cliente_telefone) return;
    db.run(`INSERT INTO cliente_visitas (cliente_id, cliente_nome, cliente_telefone, mesa) VALUES (?, ?, ?, ?)`,
      [cliente_id || null, cliente_nome || '', cliente_telefone || '', mesa || ''], (err) => {
        if (!err) socket.emit('visita_registrada', { success: true });
      });
  });

  socket.on('admin_get_beneficios', () => {
    db.all(`SELECT * FROM beneficios`, (err, rows) => socket.emit('admin_beneficios_lista', rows || []));
  });
  socket.on('add_beneficio', (b) => {
    db.run(`INSERT INTO beneficios (nome, pontos, imagem_url, ativo) VALUES (?, ?, ?, ?)`, [b.nome, b.pontos, b.imagem_url, b.ativo ? 1 : 0], () => {
      db.all(`SELECT * FROM beneficios`, (err, rows) => io.emit('admin_beneficios_lista', rows || []));
    });
  });
  socket.on('edit_beneficio', (b) => {
    db.run(`UPDATE beneficios SET nome=?, pontos=?, imagem_url=?, ativo=? WHERE id=?`, [b.nome, b.pontos, b.imagem_url, b.ativo ? 1 : 0, b.id], () => {
      db.all(`SELECT * FROM beneficios`, (err, rows) => io.emit('admin_beneficios_lista', rows || []));
    });
  });
  socket.on('delete_beneficio', (id) => {
    if (!exigirAdminSocket(socket)) return;
    db.run(`DELETE FROM beneficios WHERE id=?`, [id], () => {
      db.all(`SELECT * FROM beneficios`, (err, rows) => io.emit('admin_beneficios_lista', rows || []));
    });
  });

  // --- DASHBOARD ESTATISTICAS ---
  socket.on('get_estatisticas_dashboard', () => {
    const stats = {};
    db.get(`SELECT COUNT(id) as total_pedidos, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as receita_total FROM pedidos WHERE status = 'Finalizado' AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%'`, (err, row) => {
      stats.pedidos = row.total_pedidos || 0;
      stats.receita_total = row.receita_total || 0;
      stats.ticket_medio = stats.pedidos > 0 ? (stats.receita_total / stats.pedidos) : 0;

      db.all(`SELECT strftime('%Y-%m-%d', createdAt) as dia, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as receita FROM pedidos WHERE status = 'Finalizado' AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%' GROUP BY dia ORDER BY dia DESC LIMIT 7`, (err, dias) => {
        stats.vendas_por_dia = dias ? dias.reverse() : [];

        db.all(`SELECT productName, SUM(quantity) as qty, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as receita FROM pedidos WHERE status = 'Finalizado' AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%' GROUP BY productName ORDER BY receita DESC LIMIT 5`, (err, prods) => {
          stats.top_produtos = prods || [];

          db.all(`SELECT paymentMethod, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as receita FROM pedidos WHERE status = 'Finalizado' AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%' GROUP BY paymentMethod ORDER BY receita DESC`, (err, pags) => {
            stats.pagamentos = pags || [];

            db.all(`SELECT sector, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as receita FROM pedidos WHERE status = 'Finalizado' AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%' GROUP BY sector`, (err, modulos) => {
              stats.modulos = modulos || [];

              db.all(`SELECT c.nome, SUM(CAST(REPLACE(p.total, ',', '.') AS REAL)) as receita FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.status = 'Finalizado' AND p.productName NOT LIKE 'Pgto Parcial%' AND p.productName NOT LIKE 'Pgto QR Code%' GROUP BY c.id ORDER BY receita DESC LIMIT 5`, (err, clientes) => {
                stats.top_clientes = clientes || [];

                db.all(`SELECT f.nome, COUNT(p.id) as entregas FROM pedidos p JOIN funcionarios f ON p.entregador_id = f.id WHERE p.status = 'Finalizado' GROUP BY f.id ORDER BY entregas DESC LIMIT 5`, (err, entregadores) => {
                  stats.top_entregadores = entregadores || [];
                  socket.emit('estatisticas_dashboard_recebidas', stats);
                });
              });
            });
          });
        });
      });
    });
  });

  socket.on('get_itens_mesa', (mesaName) => {
    db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ? OR mesa_comanda = ?) AND status NOT IN ('Finalizado','Cancelado')`, [mesaName, mesaName, mesaName], (err, rows) => {
      socket.emit('itens_mesa_recebidos', { mesaName, items: rows || [] });
    });
  });

  // ══════ JOGOS / GAMIFICAÇÃO ══════
  const jogosEmAndamento = {};

  // Listar jogos disponíveis
  socket.on('jogos_listar', () => {
    db.all(`SELECT * FROM jogos WHERE ativo = 1 ORDER BY nome`, [], (err, rows) => {
      socket.emit('jogos_lista', rows || []);
    });
  });

  // Listar partidas em andamento na mesa
  socket.on('jogos_partidas_mesa', (mesa) => {
    if (!mesa) return;
    const chave = socket.handshake.query.restaurante_id + ':' + mesa;
    const partidas = jogosEmAndamento[chave] || [];
    socket.emit('jogos_partidas_lista', partidas.filter(p => p.status !== 'finalizado'));
  });

  // Criar nova partida
  socket.on('jogos_criar_partida', (data) => {
    const { jogo_id, mesa, jogador1_nome, jogador1_comanda, jogador1_cliente_id } = data || {};
    if (!jogo_id || !mesa || !jogador1_nome) {
      return socket.emit('jogos_erro', { erro: 'Dados incompletos para criar partida.' });
    }
    db.get(`SELECT * FROM jogos WHERE id = ? AND ativo = 1`, [jogo_id], (err, jogo) => {
      if (err || !jogo) return socket.emit('jogos_erro', { erro: 'Jogo não encontrado.' });
      const rid = socket.handshake.query.restaurante_id;
      const chave = rid + ':' + mesa;
      if (!jogosEmAndamento[chave]) jogosEmAndamento[chave] = [];
      const partida = {
        id: Date.now(),
        jogo_id: jogo.id,
        jogo_nome: jogo.nome,
        jogo_tipo: jogo.tipo,
        jogo_emoji: jogo.emoji,
        mesa,
        jogador1: { nome: jogador1_nome, comanda: jogador1_comanda || '', cliente_id: jogador1_cliente_id || null, escolha: null },
        jogador2: null,
        rodada: 1,
        max_rodadas: 3,
        status: 'aguardando',
        vencedor: null,
        premio_descricao: jogo.premio_vencedor || 'Vencedor não paga!',
        resultado_rodada: [],
        created_at: new Date().toISOString()
      };
      jogosEmAndamento[chave].push(partida);
      io.to(`mesa_${mesa}`).emit('jogos_partida_criada', partida);
      socket.emit('jogos_partida_criada', partida);
    });
  });

  // Entrar numa partida existente
  socket.on('jogos_entrar_partida', (data) => {
    const { partida_id, mesa, jogador2_nome, jogador2_comanda, jogador2_cliente_id } = data || {};
    if (!partida_id || !mesa || !jogador2_nome) {
      return socket.emit('jogos_erro', { erro: 'Dados incompletos.' });
    }
    const rid = socket.handshake.query.restaurante_id;
    const chave = rid + ':' + mesa;
    const partidas = jogosEmAndamento[chave] || [];
    const partida = partidas.find(p => p.id == partida_id && p.status === 'aguardando');
    if (!partida) return socket.emit('jogos_erro', { erro: 'Partida não encontrada ou já iniciada.' });
    if (partida.jogador1.nome === jogador2_nome) {
      return socket.emit('jogos_erro', { erro: 'Você não pode jogar contra si mesmo!' });
    }
    partida.jogador2 = { nome: jogador2_nome, comanda: jogador2_comanda || '', cliente_id: jogador2_cliente_id || null, escolha: null };
    partida.status = 'em_andamento';
    io.to(`mesa_${mesa}`).emit('jogos_partida_atualizada', partida);
  });

  // Fazer jogada (escolha)
  socket.on('jogos_fazer_jogada', (data) => {
    const { partida_id, mesa, jogador_nome, escolha } = data || {};
    if (!partida_id || !mesa || !jogador_nome || escolha === undefined) {
      return socket.emit('jogos_erro', { erro: 'Dados incompletos para jogada.' });
    }
    const rid = socket.handshake.query.restaurante_id;
    const chave = rid + ':' + mesa;
    const partidas = jogosEmAndamento[chave] || [];
    const partida = partidas.find(p => p.id == partida_id && p.status === 'em_andamento');
    if (!partida) return socket.emit('jogos_erro', { erro: 'Partida não encontrada.' });

    let isJ1 = partida.jogador1 && partida.jogador1.nome === jogador_nome;
    let isJ2 = partida.jogador2 && partida.jogador2.nome === jogador_nome;
    if (!isJ1 && !isJ2) return socket.emit('jogos_erro', { erro: 'Jogador não pertence a esta partida.' });

    if (isJ1) partida.jogador1.escolha = escolha;
    if (isJ2) partida.jogador2.escolha = escolha;

    io.to(`mesa_${mesa}`).emit('jogos_jogada_recebida', {
      partida_id,
      jogador_nome,
      escolha_pendente: (isJ1 && !partida.jogador2?.escolha) || (isJ2 && !partida.jogador1?.escolha)
    });

    // Se ambos escolheram, resolve a rodada
    if (partida.jogador1.escolha !== null && partida.jogador2 && partida.jogador2.escolha !== null) {
      const resultado = resolverRodada(partida);
      partida.resultado_rodada.push(resultado);
      io.to(`mesa_${mesa}`).emit('jogos_resultado_rodada', {
        partida_id,
        rodada: partida.rodada,
        resultado
      });

      if (partida.rodada >= partida.max_rodadas) {
        const vitoriasJ1 = partida.resultado_rodada.filter(r => r.vencedor === partida.jogador1.nome).length;
        const vitoriasJ2 = partida.resultado_rodada.filter(r => r.vencedor === partida.jogador2.nome).length;
        const empates = partida.resultado_rodada.filter(r => r.vencedor === 'empate').length;
        let vencedorFinal = 'empate';
        if (vitoriasJ1 > vitoriasJ2) vencedorFinal = partida.jogador1.nome;
        else if (vitoriasJ2 > vitoriasJ1) vencedorFinal = partida.jogador2.nome;
        const perdedorFinal = vencedorFinal === 'empate' ? null :
          (vencedorFinal === partida.jogador1.nome ? partida.jogador2.nome : partida.jogador1.nome);

        partida.status = 'finalizado';
        partida.vencedor = vencedorFinal;

        db.run(`INSERT INTO jogos_historico (jogo_id, jogo_nome, mesa, jogador1_nome, jogador2_nome, vencedor, perdedor, rodadas_jogadas, premio_descricao, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
          [partida.jogo_id, partida.jogo_nome, mesa, partida.jogador1.nome, partida.jogador2.nome,
           vencedorFinal, perdedorFinal, partida.max_rodadas, partida.premio_descricao]);

        // Dar pontos
        db.all(`SELECT chave, valor FROM configuracoes WHERE chave IN ('jogos_pontos_vitoria','jogos_pontos_derrota','feature_jogos')`, [], (err, cfgRows) => {
          const cfg = {};
          (cfgRows || []).forEach(r => cfg[r.chave] = r.valor);
          if (cfg.feature_jogos === 'false') return;
          const ptsVitoria = parseInt(cfg.jogos_pontos_vitoria) || 10;
          const ptsDerrota = parseInt(cfg.jogos_pontos_derrota) || 2;
          if (perdedorFinal && vencedorFinal !== 'empate') {
            const cidV = vencedorFinal === partida.jogador1.nome ? partida.jogador1.cliente_id : partida.jogador2?.cliente_id;
            const cidD = vencedorFinal === partida.jogador1.nome ? partida.jogador2?.cliente_id : partida.jogador1.cliente_id;
            if (cidV) db.run(`UPDATE clientes SET pontos = pontos + ? WHERE id = ?`, [ptsVitoria, cidV]);
            if (cidD) db.run(`UPDATE clientes SET pontos = pontos + ? WHERE id = ?`, [ptsDerrota, cidD]);
          }
        });

        io.to(`mesa_${mesa}`).emit('jogos_partida_finalizada', {
          partida_id,
          vencedor: vencedorFinal,
          perdedor: perdedorFinal,
          placar: { jogador1: vitoriasJ1, jogador2: vitoriasJ2, empates },
          premio: partida.premio_descricao
        });
      } else {
        partida.rodada++;
        partida.jogador1.escolha = null;
        if (partida.jogador2) partida.jogador2.escolha = null;
      }
    }
  });

  function resolverRodada(partida) {
    const tipo = partida.jogador1?.escolha !== undefined ? partida.jogo_tipo : 'par_impar';
    const e1 = partida.jogador1?.escolha;
    const e2 = partida.jogador2?.escolha;
    const n1 = partida.jogador1.nome;
    const n2 = partida.jogador2?.nome || 'Adversário';

    if (tipo === 'par_impar') {
      const soma = (parseInt(e1) || 0) + (parseInt(e2) || 0);
      const isPar = soma % 2 === 0;
      const vencedor = (e1 === 'par' && isPar) || (e1 === 'impar' && !isPar) ? n1 : n2;
      return { tipo, escolha1: e1, escolha2: e2, soma, resultado: isPar ? 'par' : 'impar', vencedor };
    }
    if (tipo === 'dedos') {
      const soma = (parseInt(e1) || 0) + (parseInt(e2) || 0);
      const vencedor = soma % 2 === 0 ? n1 : n2;
      return { tipo, escolha1: e1, escolha2: e2, soma, resultado: soma % 2 === 0 ? 'par' : 'impar', vencedor };
    }
    if (tipo === 'dois_ou_um') {
      const vencedor = (parseInt(e1) || 0) === 2 && (parseInt(e2) || 0) === 1 ? n1 :
        (parseInt(e1) || 0) === 1 && (parseInt(e2) || 0) === 2 ? n2 : 'empate';
      return { tipo, escolha1: e1, escolha2: e2, vencedor };
    }
    if (tipo === 'botao_grande') {
      const t1 = parseInt(e1) || 0;
      const t2 = parseInt(e2) || 0;
      const vencedor = t1 === t2 ? 'empate' : (t1 < t2 ? n1 : n2);
      return { tipo, escolha1: e1, escolha2: e2, vencedor };
    }
    if (tipo === 'mao_orelha') {
      const mao = parseInt(e1) || 0;
      const palpite = parseInt(e2) || 0;
      const vencedor = palpite === mao ? n2 : n1;
      return { tipo, mao, palpite, vencedor };
    }
    if (tipo === 'ultimo_tirar_dedo') {
      const vencedor = (parseInt(e1) || 0) === 1 ? n1 : n2;
      return { tipo, escolha1: e1, escolha2: e2, vencedor };
    }
    return { tipo, escolha1: e1, escolha2: e2, vencedor: 'empate' };
  }

  // Cancelar partida
  socket.on('jogos_cancelar_partida', (data) => {
    const { partida_id, mesa } = data || {};
    const rid = socket.handshake.query.restaurante_id;
    const chave = rid + ':' + mesa;
    const partidas = jogosEmAndamento[chave] || [];
    const idx = partidas.findIndex(p => p.id == partida_id);
    if (idx !== -1) {
      partidas[idx].status = 'cancelado';
      partidas.splice(idx, 1);
      io.to(`mesa_${mesa}`).emit('jogos_partida_cancelada', { partida_id });
    }
  });

  // Admin: listar todos os jogos (incluindo inativos)
  socket.on('admin_jogos_listar', () => {
    db.all(`SELECT * FROM jogos ORDER BY id`, [], (err, rows) => {
      socket.emit('admin_jogos_lista', rows || []);
    });
  });

  // Admin: criar/editar jogo
  socket.on('admin_jogos_salvar', (data) => {
    const { id, nome, tipo, emoji, descricao, regras, premio_vencedor, premio_perdedor, ativo } = data || {};
    if (!nome || !tipo) return socket.emit('jogos_erro', { erro: 'Nome e tipo são obrigatórios.' });
    if (id) {
      db.run(`UPDATE jogos SET nome=?, tipo=?, emoji=?, descricao=?, regras=?, premio_vencedor=?, premio_perdedor=?, ativo=? WHERE id=?`,
        [nome, tipo, emoji || '🎮', descricao || '', regras || '', premio_vencedor || '', premio_perdedor || '', ativo !== undefined ? (ativo ? 1 : 0) : 1, id],
        function() { socket.emit('admin_jogos_salvo', { ok: true }); });
    } else {
      db.run(`INSERT INTO jogos (nome, tipo, emoji, descricao, regras, premio_vencedor, premio_perdedor, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [nome, tipo, emoji || '🎮', descricao || '', regras || '', premio_vencedor || '', premio_perdedor || '', ativo !== undefined ? (ativo ? 1 : 0) : 1],
        function() { socket.emit('admin_jogos_salvo', { ok: true }); });
    }
  });

  // Admin: excluir jogo
  socket.on('admin_jogos_excluir', (id) => {
    if (!id) return;
    db.run(`DELETE FROM jogos WHERE id = ?`, [id], function() {
      socket.emit('admin_jogos_salvo', { ok: true });
    });
  });

  // Admin: histórico de partidas
  socket.on('admin_jogos_historico', () => {
    db.all(`SELECT * FROM jogos_historico ORDER BY id DESC LIMIT 50`, [], (err, rows) => {
      socket.emit('admin_jogos_historico_lista', rows || []);
    });
  });

  // --- CAIXA LOGIC ---
  function checkCaixa(callback) {
    db.get(`SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`, (err, row) => {
      callback(row);
    });
  }

  socket.on('mp_iniciar_pagamento', ({ valor, metodo }) => {
    db.all(`SELECT * FROM configuracoes`, async (err, rows) => {
      if (err) {
        socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Erro ao carregar configurações.' });
        return;
      }
      const config = {};
      if (rows) rows.forEach(r => config[r.chave] = r.valor);

      const provider = config.mp_provider || 'none';
      if (provider === 'none') {
        socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Nenhuma maquininha configurada. Acesse Configurações → Maquininhas.' });
        return;
      }

      if (mpPollInterval) {
        clearInterval(mpPollInterval);
        mpPollInterval = null;
      }

      // ===================================================
      // PROVEDOR: MERCADO PAGO POINT
      // ===================================================
      if (provider === 'mercadopago') {
        const token = config.mp_access_token;
        const deviceId = config.mp_device_id;
        if (!token || !deviceId) {
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Mercado Pago não configurado. Verifique Access Token e Device ID.' });
          return;
        }
        try {
          const idempotencyKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          const response = await fetch(`https://api.mercadopago.com/point/integration-api/devices/${deviceId}/payment-intents`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify({
              amount: parseFloat(valor),
              description: 'Pagamento PDV - Chef Cozinha',
              payment: {
                installments: 1,
                type: metodo === 'Cartão de Débito' ? 'debit_card' : 'credit_card'
              }
            })
          });
          const data = await response.json();
          if (!response.ok || !data.id) {
            socket.emit('mp_status_pagamento', { status: 'failed', msg: data.message || 'Falha ao criar cobrança na maquininha.' });
            return;
          }
          mpCurrentIntentId = data.id;
          mpCurrentDeviceId = deviceId;
          socket.emit('mp_status_pagamento', { status: 'processando', intentId: data.id, msg: '🔵 Cobrança enviada! Aguardando cartão na Maquininha Mercado Pago...' });
          let elapsedSeconds = 0;
          mpPollInterval = setInterval(async () => {
            elapsedSeconds += 2;
            if (elapsedSeconds > 180) {
              clearInterval(mpPollInterval); mpPollInterval = null;
              socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Tempo limite esgotado. Transação cancelada.' });
              return;
            }
            try {
              const statusResponse = await fetch(`https://api.mercadopago.com/point/integration-api/payment-intents/${mpCurrentIntentId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                if (statusData.status === 'finished') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'aprovado', payment: statusData, msg: 'Pagamento aprovado com sucesso!' });
                } else if (statusData.status === 'canceled' || statusData.status === 'expired') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'failed', msg: `Pagamento ${statusData.status === 'canceled' ? 'cancelado' : 'expirado'} na maquininha.` });
                }
              }
            } catch (pollErr) { console.error('[MP] Polling error:', pollErr); }
          }, 2000);
        } catch (apiErr) {
          console.error('[Mercado Pago] Erro:', apiErr);
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Erro de conexão com o Mercado Pago.' });
        }
        return;
      }

      // ===================================================
      // PROVEDOR: STONE / TON (TEF LOCAL)
      // ===================================================
      if (provider === 'stone') {
        const stoneCode = config.stone_stonecode;
        const stonePorta = config.stone_porta || '8080';
        if (!stoneCode) {
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Stone não configurado. Verifique o Stone Code.' });
          return;
        }
        try {
          const modalidade = metodo === 'Cartão de Débito' ? 2 : 3;
          const response = await fetch(`http://localhost:${stonePorta}/charge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: Math.round(parseFloat(valor) * 100),
              payment_type: modalidade,
              installments: 1,
              stone_code: stoneCode,
              description: 'Chef Cozinha PDV'
            }),
            signal: AbortSignal.timeout(10000)
          });
          const data = await response.json();
          if (!response.ok || data.error) {
            socket.emit('mp_status_pagamento', { status: 'failed', msg: data.message || data.error || 'Falha ao enviar cobrança para Stone Client.' });
            return;
          }
          const transactionId = data.transaction_id || data.id;
          socket.emit('mp_status_pagamento', { status: 'processando', intentId: transactionId, msg: '🟢 Cobrança enviada! Aguardando cartão na maquininha Stone...' });
          let stoneElapsed = 0;
          mpPollInterval = setInterval(async () => {
            stoneElapsed += 3;
            if (stoneElapsed > 180) {
              clearInterval(mpPollInterval); mpPollInterval = null;
              socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Tempo limite esgotado. Verifique a maquininha Stone.' });
              return;
            }
            try {
              const statusResp = await fetch(`http://localhost:${stonePorta}/charge/${transactionId}`, { signal: AbortSignal.timeout(5000) });
              if (statusResp.ok) {
                const sd = await statusResp.json();
                const st = (sd.status || '').toLowerCase();
                if (st === 'approved' || st === 'confirmed' || st === 'success') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'aprovado', payment: sd, msg: '✅ Pagamento Stone aprovado!' });
                } else if (st === 'failed' || st === 'denied' || st === 'canceled') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'failed', msg: `Pagamento ${st} na maquininha Stone.` });
                }
              }
            } catch (e) { console.error('[Stone] Polling error:', e); }
          }, 3000);
        } catch (stoneErr) {
          console.error('[Stone] Erro:', stoneErr);
          socket.emit('mp_status_pagamento', { status: 'failed', msg: `Erro ao conectar com Stone Client TEF na porta ${config.stone_porta || 8080}. Verifique se o Stone Client está rodando.` });
        }
        return;
      }

      // ===================================================
      // PROVEDOR: PAGBANK / PAGSEGURO
      // ===================================================
      if (provider === 'pagbank') {
        const pgToken = config.pagbank_token;
        const pgTerminal = config.pagbank_terminal;
        if (!pgToken || !pgTerminal) {
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'PagBank não configurado. Verifique Token e Terminal ID.' });
          return;
        }
        try {
          const paymentType = metodo === 'Cartão de Débito' ? 'DEBIT_CARD' : 'CREDIT_CARD';
          const response = await fetch('https://api.pagseguro.com/terminal/v1/payments', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${pgToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              terminal_id: pgTerminal,
              payment_method: { type: paymentType, installments: 1 },
              amount: { value: Math.round(parseFloat(valor) * 100), currency: 'BRL' },
              description: 'Chef Cozinha PDV'
            })
          });
          const data = await response.json();
          if (!response.ok || !data.id) {
            const errMsg = data.message || (data.error_messages && data.error_messages[0] && data.error_messages[0].description) || 'Falha ao criar cobrança no PagBank.';
            socket.emit('mp_status_pagamento', { status: 'failed', msg: errMsg });
            return;
          }
          const pgPaymentId = data.id;
          socket.emit('mp_status_pagamento', { status: 'processando', intentId: pgPaymentId, msg: '🟠 Cobrança enviada! Aguardando cartão na maquininha PagBank...' });
          let pgElapsed = 0;
          mpPollInterval = setInterval(async () => {
            pgElapsed += 3;
            if (pgElapsed > 180) {
              clearInterval(mpPollInterval); mpPollInterval = null;
              socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Tempo limite esgotado. Verifique a maquininha PagBank.' });
              return;
            }
            try {
              const statusResp = await fetch(`https://api.pagseguro.com/terminal/v1/payments/${pgPaymentId}`, {
                headers: { 'Authorization': `Bearer ${pgToken}` }
              });
              if (statusResp.ok) {
                const sd = await statusResp.json();
                const st = (sd.status || '').toUpperCase();
                if (st === 'PAID' || st === 'AUTHORIZED' || st === 'COMPLETED') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'aprovado', payment: sd, msg: '✅ Pagamento PagBank aprovado!' });
                } else if (st === 'DECLINED' || st === 'CANCELED' || st === 'ERROR') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'failed', msg: `Pagamento ${st} na maquininha PagBank.` });
                }
              }
            } catch (e) { console.error('[PagBank] Polling error:', e); }
          }, 3000);
        } catch (pgErr) {
          console.error('[PagBank] Erro:', pgErr);
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Erro de conexão com API do PagBank.' });
        }
        return;
      }

      // ===================================================
      // PROVEDOR: SiTef GENÉRICO (TCP/IP)
      // ===================================================
      if (provider === 'sitef') {
        const sitefIp = config.sitef_ip;
        const sitefPorta = parseInt(config.sitef_porta || '4096');
        const sitefTerminal = config.sitef_terminal;
        const sitefEstab = config.sitef_estabelecimento;
        if (!sitefIp || !sitefTerminal) {
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'SiTef não configurado. Verifique IP e Número do Terminal.' });
          return;
        }
        const net = require('net');
        const modalidade = metodo === 'Cartão de Débito' ? '02' : '03';
        const valorCentavos = String(Math.round(parseFloat(valor) * 100)).padStart(12, '0');
        const terminal = (sitefTerminal).padEnd(8, ' ').substring(0, 8);
        const estab = (sitefEstab || '00000000').padEnd(16, ' ').substring(0, 16);
        const msgPayload = `0001${String(42).padStart(4, '0')}${terminal}${estab}${modalidade}${valorCentavos}`;
        const msgLen = String(msgPayload.length).padStart(4, '0');
        const fullMsg = `${msgLen}${msgPayload}`;
        socket.emit('mp_status_pagamento', { status: 'processando', msg: '⚙️ Enviando cobrança para servidor SiTef...' });
        const client = new net.Socket();
        let sitefBuf = '';
        client.setTimeout(90000);
        client.connect(sitefPorta, sitefIp, () => { client.write(Buffer.from(fullMsg, 'utf8')); });
        client.on('data', (data) => {
          sitefBuf += data.toString('utf8');
          if (sitefBuf.length >= 4) {
            const respLen = parseInt(sitefBuf.substring(0, 4));
            if (sitefBuf.length >= 4 + respLen) {
              client.destroy();
              const response = sitefBuf.substring(4);
              const resultCode = response.substring(0, 4).trim();
              if (resultCode === '0000' || resultCode === '000') {
                socket.emit('mp_status_pagamento', { status: 'aprovado', payment: { raw: response }, msg: '✅ Pagamento SiTef aprovado!' });
              } else {
                socket.emit('mp_status_pagamento', { status: 'failed', msg: `Transação SiTef recusada. Código: ${resultCode}` });
              }
            }
          }
        });
        client.on('timeout', () => { client.destroy(); socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Timeout SiTef. Servidor SiTef inacessível.' }); });
        client.on('error', (err) => { socket.emit('mp_status_pagamento', { status: 'failed', msg: `Erro SiTef: ${err.message}` }); });
        return;
      }

      socket.emit('mp_status_pagamento', { status: 'failed', msg: `Provedor desconhecido: ${provider}` });
    });
  });

  socket.on('mp_cancelar_pagamento', () => {
    if (mpPollInterval) {
      clearInterval(mpPollInterval);
      mpPollInterval = null;
    }

    if (!mpCurrentIntentId || !mpCurrentDeviceId) {
      socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Nenhuma transação activa para cancelar.' });
      return;
    }

    db.all(`SELECT * FROM configuracoes`, async (err, rows) => {
      if (err) return;
      const config = {};
      if (rows) rows.forEach(r => config[r.chave] = r.valor);
      const token = config.mp_access_token;

      if (token) {
        try {
          await fetch(`https://api.mercadopago.com/point/integration-api/devices/${mpCurrentDeviceId}/payment-intents/${mpCurrentIntentId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
        } catch (cancelErr) {
          console.error('[Mercado Pago] Erro ao cancelar intent:', cancelErr);
        }
      }

      socket.emit('mp_status_pagamento', { status: 'cancelado', msg: 'Cobrança cancelada pelo operador.' });
      mpCurrentIntentId = null;
      mpCurrentDeviceId = null;
    });
  });

  // Dashboard Stats
  socket.on('get_dashboard_stats', () => {
    const stats = {};
    const today = getLocalDateOnly();
    const firstDayOfMonth = getLocalDateOnly().slice(0, 8) + '01'; // YYYY-MM-01

    let queries = 0;
    const checkDone = () => {
      queries--;
      if (queries === 0) {
        if (stats.pedidosHoje > 0) {
          stats.ticketMedio = stats.faturamentoHoje / stats.pedidosHoje;
        } else {
          stats.ticketMedio = 0;
        }
        const dayOfMonth = parseInt(today.slice(8, 10));
        const year = parseInt(today.slice(0, 4));
        const month = parseInt(today.slice(5, 7));
        const totalDaysInMonth = new Date(year, month, 0).getDate();
        stats.diasTranscorridos = dayOfMonth;
        stats.diasTotalMes = totalDaysInMonth;
        stats.projecaoMensal = dayOfMonth > 0 ? (stats.faturamentoMensal / dayOfMonth) * totalDaysInMonth : 0;
        socket.emit('dashboard_stats_result', stats);
      }
    };

    queries++;
    // Faturamento Hoje (from movimentacoes of type Entrada today)
    db.get(`SELECT SUM(valor) as fatHoje FROM movimentacoes WHERE tipo='Entrada' AND date(data) = ?`, [today], (err, row) => {
      stats.faturamentoHoje = row ? row.fatHoje || 0 : 0;
      checkDone();
    });

    queries++;
    // Faturamento Mensal (from movimentacoes of type Entrada this month)
    db.get(`SELECT SUM(valor) as fatMensal FROM movimentacoes WHERE tipo='Entrada' AND date(data) >= ?`, [firstDayOfMonth], (err, row) => {
      stats.faturamentoMensal = row ? row.fatMensal || 0 : 0;
      checkDone();
    });

    queries++;
    // Pedidos Hoje (count from pedidos where createdAt is today, sem linhas de pagamento)
    db.get(`SELECT count(DISTINCT time || localName) as qtdPedidos FROM pedidos WHERE date(createdAt) = ? AND status='Finalizado' AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%'`, [today], (err, row) => {
      stats.pedidosHoje = row ? row.qtdPedidos || 0 : 0;
      checkDone();
    });

    queries++;
    // Vendas por dia (últimos 7 dias)
    db.all(`SELECT date(data) as d, SUM(valor) as total FROM movimentacoes WHERE tipo='Entrada' GROUP BY date(data) ORDER BY date(data) DESC LIMIT 7`, (err, rows) => {
      stats.vendasDias = rows ? rows.reverse() : [];
      checkDone();
    });

    queries++;
    // Receitas e Despesas (Mês Atual)
    db.all(`SELECT tipo, SUM(valor) as total FROM movimentacoes WHERE date(data) >= ? GROUP BY tipo`, [firstDayOfMonth], (err, rows) => {
      stats.receitasDespesas = rows || [];
      checkDone();
    });

    queries++;
    // Produtos Mais Vendidos (All time, top 5, sem linhas de pagamento)
    db.all(`SELECT productName, SUM(quantity) as qty FROM pedidos WHERE status='Finalizado' AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%' GROUP BY productName ORDER BY qty DESC LIMIT 5`, (err, rows) => {
      stats.produtosPopulares = rows || [];
      checkDone();
    });

    queries++;
    // Categorias mais vendidas (All time, top 5)
    db.all(`SELECT p.categoria, SUM(pd.quantity) as qty FROM pedidos pd JOIN produtos p ON pd.productName = p.nome WHERE pd.status='Finalizado' AND p.categoria IS NOT NULL GROUP BY p.categoria ORDER BY qty DESC LIMIT 5`, (err, rows) => {
      stats.categoriasPopulares = rows || [];
      checkDone();
    });

    queries++;
    // Formas de pagamento
    db.all(`SELECT forma_pagamento, COUNT(*) as qty FROM movimentacoes WHERE tipo='Entrada' GROUP BY forma_pagamento`, (err, rows) => {
      stats.formasPagamento = rows || [];
      checkDone();
    });

    queries++;
    // Entregas por entregador
    db.all(`SELECT f.nome as entregador, COUNT(DISTINCT pd.time || pd.localName) as entregas FROM pedidos pd JOIN funcionarios f ON pd.entregador_id = f.id WHERE pd.status='Finalizado' GROUP BY pd.entregador_id ORDER BY entregas DESC LIMIT 5`, (err, rows) => {
      stats.entregadores = rows || [];
      checkDone();
    });

    queries++;
    // Clientes top
    db.all(`SELECT c.nome, COUNT(DISTINCT pd.time || pd.localName) as pedidos, SUM(CAST(pd.total AS REAL)) as gasto FROM pedidos pd JOIN clientes c ON pd.cliente_id = c.id WHERE pd.status='Finalizado' GROUP BY pd.cliente_id ORDER BY gasto DESC LIMIT 5`, (err, rows) => {
      stats.topClientes = rows || [];
      checkDone();
    });
  });

  socket.on('reservar_mesa', ({ mesaName, observacao, cliente, telefone }) => {
    db.run(`UPDATE mesas SET status = 'Reservada', observacao = ? WHERE nome = ?`, [observacao, mesaName], () => {
      const finalizar = () => {
        if (cliente) {
          db.run(
            `INSERT INTO mesa_clientes (mesa, cliente_id, cliente_nome, cliente_telefone, updated_at)
             VALUES (?, NULL, ?, ?, datetime('now','localtime'))
             ON CONFLICT(mesa) DO UPDATE SET
               cliente_nome = excluded.cliente_nome,
               cliente_telefone = COALESCE(NULLIF(excluded.cliente_telefone,''), cliente_telefone),
               updated_at = datetime('now','localtime')`,
            [mesaName, cliente, telefone || ''], () => {
              broadcastMesaClientes();
              db.all(`SELECT * FROM mesas`, (err, rows) => io.emit('mesas_atualizadas', rows || []));
            });
        } else {
          db.all(`SELECT * FROM mesas`, (err, rows) => io.emit('mesas_atualizadas', rows || []));
        }
      };
      if (cliente && telefone) {
        db.get(`SELECT id FROM clientes WHERE telefone = ?`, [telefone], (err, row) => {
          if (row) {
            db.run(`UPDATE clientes SET nome = ? WHERE id = ?`, [cliente, row.id], () => finalizar());
          } else {
            db.run(`INSERT INTO clientes (nome, telefone, observacao, endereco, data_nascimento, pontos) VALUES (?, ?, '', '', '', 0)`,
              [cliente, telefone], () => finalizar());
          }
        });
      } else if (cliente) {
        db.get(`SELECT id FROM clientes WHERE nome = ? ORDER BY id DESC LIMIT 1`, [cliente], (err, row) => {
          if (!row) {
            db.run(`INSERT INTO clientes (nome, telefone, observacao, endereco, data_nascimento, pontos) VALUES (?, '', '', '', '', 0)`,
              [cliente], () => finalizar());
          } else {
            finalizar();
          }
        });
      } else {
        finalizar();
      }
    });
  });

  socket.on('cancelar_reserva', ({ mesaName }) => {
    db.run(`UPDATE mesas SET status = 'Disponível', observacao = '' WHERE nome = ?`, [mesaName], () => {
      db.run(`DELETE FROM mesa_clientes WHERE mesa = ?`, [mesaName], () => broadcastMesaClientes());
      db.all(`SELECT * FROM mesas`, (err, rows) => io.emit('mesas_atualizadas', rows || []));
    });
  });

  // --- RH / Controle de Ponto e Vales ---

  socket.on('bater_ponto', ({ funcionario_id, acao, token }) => {
    if (token !== pontoToken) { return socket.emit('bater_ponto_error', 'QR Code expirado ou inválido! Escaneie novamente no Caixa.'); }
    const hoje = getLocalDateOnly();
    const agora = getLocalTimestamp();

    if (acao === 'entrada') {
      db.run(`INSERT INTO pontos (funcionario_id, entrada, data) VALUES (?, ?, ?)`, [funcionario_id, agora, hoje], function (err) {
        if (!err) socket.emit('ponto_registrado', { id: this.lastID, acao });
      });
    } else if (acao === 'saida') {
      db.get(`SELECT p.*, f.valor_hora, f.tipo_remuneracao, f.valor_dia, f.valor_semana, f.valor_mes FROM pontos p JOIN funcionarios f ON p.funcionario_id = f.id WHERE p.funcionario_id = ? AND p.saida IS NULL ORDER BY p.id DESC LIMIT 1`, [funcionario_id], (err, row) => {
        if (err) {
          return socket.emit('bater_ponto_error', 'Erro ao buscar ponto em aberto: ' + err.message);
        }
        if (row) {
          const t1 = new Date(row.entrada).getTime();
          const t2 = new Date(agora).getTime();
          const horasTrabalhadas = (t2 - t1) / (1000 * 60 * 60);

          let valorPagar = 0;
          const tipoRem = row.tipo_remuneracao || 'hora';
          if (tipoRem === 'hora') {
            valorPagar = horasTrabalhadas * (row.valor_hora || 0);
          } else if (tipoRem === 'dia') {
            valorPagar = row.valor_dia || 0;
          } else if (tipoRem === 'semana') {
            valorPagar = (row.valor_semana || 0) / 6; // Standard proration (6 working days/week)
          } else if (tipoRem === 'mes') {
            valorPagar = (row.valor_mes || 0) / 26;   // Standard proration (26 working days/month)
          }

          db.run(`UPDATE pontos SET saida = ?, total_horas = ?, valor_pagar = ? WHERE id = ?`, [agora, horasTrabalhadas, valorPagar, row.id], (err2) => {
            if (!err2) {
              socket.emit('ponto_registrado', { id: row.id, acao, horasTrabalhadas, valorPagar });
            } else {
              socket.emit('bater_ponto_error', 'Erro ao registrar saída: ' + err2.message);
            }
          });
        } else {
          socket.emit('bater_ponto_error', 'Nenhuma entrada em aberto encontrada para registrar a saída.');
        }
      });
    }
  });

  socket.on('get_metricas_funcionario', (funcionario_id) => {
    db.all(`SELECT * FROM pontos WHERE funcionario_id = ? ORDER BY id DESC`, [funcionario_id], (err, pontos) => {
      if (err) {
        console.error('Error fetching pontos:', err);
        socket.emit('metricas_funcionario_response', { pontos: [], vales: [], pagamentos: [] });
        return;
      }
      db.all(`SELECT * FROM vales WHERE funcionario_id = ? ORDER BY id DESC`, [funcionario_id], (err2, vales) => {
        if (err2) {
          console.error('Error fetching vales:', err2);
          socket.emit('metricas_funcionario_response', { pontos: pontos || [], vales: [], pagamentos: [] });
          return;
        }
        db.all(`SELECT * FROM funcionarios_pagamentos WHERE funcionario_id = ? ORDER BY data_pagamento DESC`, [funcionario_id], (err3, pagamentos) => {
          socket.emit('metricas_funcionario_response', { pontos: pontos || [], vales: vales || [], pagamentos: pagamentos || [] });
        });
      });
    });
  });

  socket.on('solicitar_vale', ({ funcionario_id, valor, motivo }) => {
    const agora = getLocalTimestamp();
    const obs = motivo ? String(motivo).trim().substring(0, 30) : '';
    db.run(`INSERT INTO vales (funcionario_id, data_pedido, valor, status, observacao) VALUES (?, ?, ?, 'Pendente', ?)`,
      [funcionario_id, agora, valor, obs], function (err) {
      if (!err) {
        socket.emit('vale_solicitado_success');
      } else {
        console.error('Error requesting vale:', err);
        socket.emit('bater_ponto_error', 'Erro ao solicitar vale: ' + err.message);
      }
    });
  });

  socket.on('definir_meu_pin', ({ funcionario_id, pin }) => {
    if (!isValidId(funcionario_id) || !pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return socket.emit('definir_pin_error', 'PIN inválido. Deve conter de 4 a 6 números.');
    }
    bcrypt.hash(pin, 10).then(hash => {
      db.run(`UPDATE funcionarios SET pin_hash = ? WHERE id = ?`, [hash, funcionario_id], (err) => {
        if (err) return socket.emit('definir_pin_error', 'Erro ao salvar PIN no servidor.');
        socket.emit('definir_pin_success', 'PIN salvo com sucesso! Você já pode usar seu PIN para entrar.');
      });
    }).catch(e => {
      socket.emit('definir_pin_error', 'Erro ao processar PIN.');
    });
  });

  socket.on('update_valor_hora', ({ funcionario_id, valor_hora }) => {
    db.run(`UPDATE funcionarios SET valor_hora = ? WHERE id = ?`, [valor_hora, funcionario_id], (err) => {
      if (!err) socket.emit('update_valor_hora_success');
    });
  });

  socket.on('get_cupons_list', () => {
    db.all(`SELECT * FROM cupons ORDER BY data_criacao DESC`, (err, rows) => {
      if (!err) socket.emit('cupons_list', rows || []);
    });
  });

  socket.on('get_cupom_detalhes', ({ codigo }, cb) => {
    if (!codigo) return cb && cb(null);
    db.get(`SELECT * FROM cupons WHERE codigo = ?`, [codigo], (err, cupom) => {
      if (err || !cupom) return cb && cb(null);
      db.all(`SELECT * FROM cupons_usos WHERE cupom_codigo = ? ORDER BY data_uso DESC`, [codigo], (errUsos, usos) => {
        cb && cb({ cupom, usos: usos || [] });
      });
    });
  });

  socket.on('delete_cupom', (data) => {
    if (!exigirAdminSocket(socket)) return;
    const codigo = typeof data === 'object' ? data.codigo : data;
    db.run(`DELETE FROM cupons_usos WHERE cupom_codigo = ?`, [codigo], () => {
      db.run(`DELETE FROM cupons WHERE codigo = ?`, [codigo], (err) => {
        if (!err) io.emit('cupons_atualizados');
      });
    });
  });

  registerAdminRhEvents(socket);

  // --- MÓDULO FISCAL NFC-E SOCKETS ---
  socket.on('emitir_nfce', async (data, ack) => {
    try {
      db.all(`SELECT * FROM configuracoes`, async (errConfig, configRows) => {
        const config = {};
        if (configRows) configRows.forEach(r => config[r.chave] = r.valor);

        const res = await nfceService.emitirNFCe({
          db,
          pedidoId: data.pedidoId,
          localName: data.mesaName || data.localName || 'Mesa',
          items: data.items || [],
          totalValue: data.totalValue || data.total || 0,
          cpfCnpj: data.cpfCnpj || '',
          clienteNome: data.clienteNome || '',
          paymentMethods: data.paymentMethods || (data.payments ? data.payments.map(p => p.metodo).join(', ') : 'Dinheiro'),
          config
        });

        if (typeof ack === 'function') ack(res);
        socket.emit('nfce_emitida_sucesso', res);

        db.all(`SELECT id, pedido_id, localName, cliente_nome, cpf_cnpj, valor_total, chave_acesso, numero_nota, serie, ambiente, status, protocolo, created_at FROM nfce_notas ORDER BY id DESC`, (errNotas, rows) => {
          io.emit('nfce_lista_atualizada', rows || []);
        });
      });
    } catch (e) {
      console.error('Erro na emissão de NFC-e:', e);
      if (typeof ack === 'function') ack({ ok: false, erro: e.message });
      socket.emit('erro_nfce', 'Erro na emissão de NFC-e: ' + e.message);
    }
  });

  socket.on('get_nfce_notas', (options = {}) => {
    let limit = 50; // default for 'sessao'
    if (options.period === 'semana') {
      limit = 300;
    }

    db.all(`SELECT id, pedido_id, localName, cliente_nome, cpf_cnpj, valor_total, chave_acesso, numero_nota, serie, ambiente, status, protocolo, created_at FROM nfce_notas ORDER BY id DESC LIMIT ?`, [limit], (err, rows) => {
      socket.emit('nfce_lista_atualizada', rows || []);
    });
  });

  socket.on('cancelar_nfce', async ({ id, motivo }, ack) => {
    const res = await nfceService.cancelarNFCe(db, id, motivo);
    if (typeof ack === 'function') ack(res);
    db.all(`SELECT id, pedido_id, localName, cliente_nome, cpf_cnpj, valor_total, chave_acesso, numero_nota, serie, ambiente, status, protocolo, created_at FROM nfce_notas ORDER BY id DESC`, (err, rows) => {
      io.emit('nfce_lista_atualizada', rows || []);
    });
  });


  socket.on('get_nfce_notas_paginated', (opts, callback) => {
    let page = opts.page || 1;
    let limit = opts.limit || 15;
    let offset = (page - 1) * limit;
    let search = opts.search ? '%' + opts.search + '%' : '';
    let startDate = opts.startDate ? opts.startDate + ' 00:00:00' : '';
    let endDate = opts.endDate ? opts.endDate + ' 23:59:59' : '';

    let query = 'SELECT id, pedido_id, localName, cliente_nome, cpf_cnpj, valor_total, chave_acesso, numero_nota, serie, ambiente, status, protocolo, created_at FROM nfce_notas WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as total FROM nfce_notas WHERE 1=1';
    let params = [];

    if (startDate) { query += ' AND created_at >= ?'; countQuery += ' AND created_at >= ?'; params.push(startDate); }
    if (endDate) { query += ' AND created_at <= ?'; countQuery += ' AND created_at <= ?'; params.push(endDate); }
    if (search) {
      let searchClause = ' AND (cliente_nome LIKE ? OR cpf_cnpj LIKE ? OR numero_nota LIKE ?)';
      query += searchClause;
      countQuery += searchClause;
      params.push(search, search, search);
    }

    db.get(countQuery, params, (err, countRow) => {
      if (err) { if (typeof callback === 'function') callback({ error: err.message }); return; }

      query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
      let pParams = [...params, limit, offset];

      db.all(query, pParams, (err, rows) => {
        if (err) { if (typeof callback === 'function') callback({ error: err.message }); return; }
        if (typeof callback === 'function') callback({ data: rows || [], total: countRow.total, page, limit });
      });
    });
  });

  socket.on('get_api_logs', () => {
    db.all(`SELECT * FROM api_logs ORDER BY id DESC LIMIT 300`, (err, rows) => {
      socket.emit('api_logs_recebidos', rows || []);
    });
  });

  socket.on('get_auditoria_logs', () => {
    db.all(`SELECT * FROM auditoria ORDER BY id DESC LIMIT 200`, (err, rows) => {
      socket.emit('auditoria_logs_recebidos', rows || []);
    });
  });

  // --- Módulo de Estoque (Mobile) ---
  socket.on('buscar_produto_por_codigo', (codigo) => {
    if (!codigo) return;
    // Tenta buscar por código de barras primeiro, senão por ID
    db.get(`SELECT * FROM produtos WHERE codigo_barras = ? OR id = ? LIMIT 1`, [codigo, codigo], (err, row) => {
      if (err || !row) {
        socket.emit('produto_estoque_resultado', { error: 'Produto não encontrado' });
      } else {
        socket.emit('produto_estoque_resultado', row);
      }
    });
  });

  socket.on('atualizar_estoque', (data) => {
    const { id, quantidade, validade, operador, valor_unitario } = data;
    if (!id || !quantidade) return;

    const qtdAdd = parseFloat(quantidade) || 0;
    const custo = safeFloat(valor_unitario, 0);

    db.get(`SELECT nome, estoque FROM produtos WHERE id = ?`, [id], (err, row) => {
      if (err || !row) return;

      const novoEstoque = (row.estoque || 0) + qtdAdd;
      const campos = custo > 0 ? `estoque = ?, validade = ?, preco_custo = ?` : `estoque = ?, validade = ?`;
      const params = custo > 0 ? [novoEstoque, validade || null, custo, id] : [novoEstoque, validade || null, id];

      db.run(`UPDATE produtos SET ${campos} WHERE id = ?`, params, (updateErr) => {
        if (!updateErr) {
          // Registrar auditoria
          registrarAuditoria('Entrada de Estoque', `Adicionado ${qtdAdd}x de '${row.nome}'. Novo total: ${novoEstoque}. Validade: ${validade || 'N/A'}${custo > 0 ? `. Custo unitário: R$ ${custo.toFixed(2)}` : ''}`, operador || 'App Mobile');
          socket.emit('estoque_atualizado_sucesso', { nome: row.nome, novoEstoque });

          // Broadcast para atualizar listas
          db.all("SELECT * FROM produtos WHERE status = 'ativo'", (err, produtos) => {
            io.emit('produtos_atualizados', produtos || []);
          });
        }
      });
    });
  });

  // --- Notas Fiscais de Compra / Entrada de Estoque ---

  socket.on('notas_listar', () => {
    db.all(`
      SELECT n.*, (SELECT COUNT(*) FROM nota_itens i WHERE i.nota_id = n.id) as itens_qtd
      FROM notas_compra n ORDER BY n.id DESC LIMIT 200`, (err, rows) => {
      socket.emit('notas_lista', { error: err ? err.message : null, notas: rows || [] });
    });
  });

  socket.on('nota_detalhes', (id) => {
    if (!id) return;
    db.get(`SELECT * FROM notas_compra WHERE id = ?`, [id], (err, nota) => {
      if (err || !nota) return socket.emit('nota_detalhes_resultado', { error: 'Nota não encontrada' });
      db.all(`SELECT * FROM nota_itens WHERE nota_id = ? ORDER BY id ASC`, [id], (err2, itens) => {
        socket.emit('nota_detalhes_resultado', { error: null, nota, itens: itens || [] });
      });
    });
  });

  socket.on('nota_salvar', (data) => {
    const itens = Array.isArray(data && data.itens) ? data.itens.filter(i => i && (i.nome || '').toString().trim()) : [];
    if (itens.length === 0) {
      return socket.emit('nota_salvar_resultado', { error: 'Adicione pelo menos um item à nota.' });
    }

    const colaborador = trimStr(data.colaborador, 200) || 'Caixa Mobile';
    const metodo = trimStr(data.metodo, 20) || 'manual';
    const fornecedor = trimStr(data.fornecedor, 200);
    const numero = trimStr(data.numero, 100);
    const chave = String(data.chave_acesso || '').replace(/\D/g, '').slice(0, 44);
    const dataNota = trimStr(data.data_nota, 20);
    const observacao = trimStr(data.observacao, 500);

    const findProduct = (nome, codigo) => new Promise((resolve) => {
      const n = String(nome || '').toLowerCase().trim();
      const lookup = (first) => {
        if (first) return resolve(first);
        db.get(`SELECT * FROM produtos WHERE LOWER(nome) = ? LIMIT 1`, [n], (err, row) => {
          if (row) return resolve(row);
          db.get(`SELECT * FROM produtos WHERE LOWER(nome) LIKE ? LIMIT 1`, [`%${n}%`], (err2, row2) => resolve(row2 || null));
        });
      };
      if (codigo) {
        db.get(`SELECT * FROM produtos WHERE codigo_barras = ? LIMIT 1`, [codigo], (err, row) => {
          if (row) return resolve(row);
          db.get(`SELECT * FROM produtos WHERE LOWER(nome) = ? LIMIT 1`, [n], (err2, row2) => lookup(row2));
        });
      } else {
        db.get(`SELECT * FROM produtos WHERE LOWER(nome) = ? LIMIT 1`, [n], (err, row) => lookup(row));
      }
    });

    db.serialize(() => {
      db.run(`INSERT INTO notas_compra (fornecedor, numero, chave_acesso, valor_total, data_nota, metodo, colaborador, observacao) VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
        [fornecedor, numero, chave, dataNota, metodo, colaborador, observacao],
        function (err) {
          if (err) return socket.emit('nota_salvar_resultado', { error: 'Erro ao salvar nota: ' + err.message });
          const notaId = this.lastID;
          const fila = itens.slice();
          let criados = 0;
          let atualizados = 0;
          let totalValor = 0;

          const gravarItem = (notaId, produtoId, nome, qtd, custo, totalItem, codigo, unidade, categoria, cb) => {
            db.run(`INSERT INTO nota_itens (nota_id, produto_id, nome, quantidade, valor_unitario, valor_total, codigo_barras, unidade, categoria) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [notaId, produtoId, nome, qtd, custo, totalItem, codigo, unidade, categoria], cb);
          };

          const processNext = () => {
            if (fila.length === 0) return finalizar();
            const it = fila.shift();
            const nome = trimStr(it.nome, 200);
            const qtd = safeFloat(it.quantidade, 0) || 1;
            const custo = safeFloat(it.valor_unitario, 0);
            const codigo = trimStr(it.codigo_barras, 60);
            const unidade = trimStr(it.unidade, 10) || 'UN';
            const categoria = trimStr(it.categoria, 100);
            const totalItem = parseFloat((qtd * custo).toFixed(2));
            totalValor += totalItem;

            findProduct(nome, codigo).then((produto) => {
              if (produto) {
                const novoEstoque = (parseFloat(produto.estoque) || 0) + qtd;
                const custoFinal = custo > 0 ? custo : (parseFloat(produto.preco_custo) || 0);
                db.run(`UPDATE produtos SET estoque = ?, preco_custo = COALESCE(NULLIF(?, 0), preco_custo), unidade = COALESCE(NULLIF(?, ''), unidade), fornecedor = COALESCE(NULLIF(?, ''), fornecedor) WHERE id = ?`,
                  [novoEstoque, custoFinal, unidade, fornecedor, produto.id], (uErr) => {
                    if (!uErr) atualizados++;
                    gravarItem(notaId, produto.id, nome, qtd, custo, totalItem, codigo, unidade, categoria, () => processNext());
                  });
              } else {
                db.run(`INSERT INTO produtos (categoria, nome, preco, estoque, preco_custo, codigo_barras, unidade, fornecedor, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ativo')`,
                  [categoria || 'Compras', nome, custo, qtd, custo, codigo, unidade, fornecedor], function (pErr) {
                    const novoId = pErr ? null : this.lastID;
                    if (!pErr) criados++;
                    gravarItem(notaId, novoId, nome, qtd, custo, totalItem, codigo, unidade, categoria, () => processNext());
                  });
              }
            });
          };

          const finalizar = () => {
            db.run(`UPDATE notas_compra SET valor_total = ? WHERE id = ?`, [totalValor.toFixed(2), notaId], () => {
              registrarAuditoria(colaborador, 'ENTRADA_ESTOQUE_NOTA', `Nota #${notaId} (${metodo}) salva: ${atualizados} produtos atualizados, ${criados} criados. Valor total R$ ${totalValor.toFixed(2)}.`, 'Entrada de Mercadorias', 'MEDIO');
              socket.emit('nota_salvar_resultado', { error: null, notaId, criados, atualizados, valor_total: totalValor.toFixed(2) });
              db.all(`SELECT * FROM produtos WHERE status = 'ativo'`, (e, prods) => {
                io.emit('produtos_atualizados', prods || []);
              });
            });
          };

          processNext();
        });
    });
  });

  socket.on('nota_excluir', (id) => {
    if (!exigirAdminSocket(socket)) return;
    if (!id) return;
    db.run(`DELETE FROM nota_itens WHERE nota_id = ?`, [id], () => {
      db.run(`DELETE FROM notas_compra WHERE id = ?`, [id], (err) => {
        socket.emit('nota_excluir_resultado', { error: err ? err.message : null });
        socket.emit('notas_lista', { error: null, notas: [] });
        socket.emit('notas_listar');
      });
    });
  });

  socket.on('nota_buscar_por_chave', async (conteudo) => {
    if (!conteudo) return socket.emit('nota_chave_resultado', { error: 'Nenhum QR Code de nota informado.' });
    const raw = String(conteudo);
    let chave = '';
    let url = null;

    if (/^https?:\/\//i.test(raw)) {
      url = raw;
      const mP = raw.match(/[?&]p=([^&]+)/);
      const mCh = raw.match(/[?&]chNFe=([^&]+)/);
      const mDig = raw.replace(/\D/g, '').match(/\d{44}/);
      chave = (mP ? mP[1].split('|')[0] : (mCh ? mCh[1] : (mDig ? mDig[0] : ''))).replace(/\D/g, '').slice(0, 44);
    } else {
      chave = String(raw).replace(/\D/g, '').slice(0, 44);
    }

    if (chave.length !== 44) {
      return socket.emit('nota_chave_resultado', { error: 'Chave de acesso inválida. Esperado 44 dígitos.', chave });
    }

    // Tenta buscar os itens pela internet (NFC-e de compra via URL do QR)
    if (url && /(nfce|consulta)/i.test(url)) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' },
          signal: AbortSignal.timeout(15000)
        });
        const html = await res.text();
        const itens = parseNfceHtml(html);
        return socket.emit('nota_chave_resultado', { error: null, chave, itens, aviso: itens.length ? null : 'QR lido, mas não foi possível extrair os itens automaticamente. Preencha manualmente ou use Foto/Barcode.' });
      } catch (e) {
        return socket.emit('nota_chave_resultado', { error: null, chave, itens: [], aviso: 'Sem internet para buscar os itens. Chave registrada, preencha manualmente.' });
      }
    }

    socket.emit('nota_chave_resultado', { error: null, chave, itens: [] });
  });



  socket.on('cancelar_mesa', async ({ mesaName, motivo, senha }) => {
    if (!mesaName) return;
    if (!(await verificarPinOuSenha(senha))) {
      socket.emit('erro_caixa', 'Senha ou PIN incorreto!');
      return;
    }
    console.log(`[Admin] Mesa "${mesaName}" cancelada. Motivo: ${motivo}`);
    db.run(
      `UPDATE pedidos SET status = 'Cancelado' WHERE (localName = ? OR mesa_grupo = ?) AND status NOT IN ('Finalizado','Entregue','Pago','Cancelado')`,
      [mesaName, mesaName],
      function (err) {
        if (err) { console.error(err); socket.emit('erro_caixa', 'Erro ao cancelar pedidos.'); return; }
        db.run(`UPDATE mesas SET status = 'Disponível', observacao = '' WHERE nome = ?`, [mesaName], () => {
          db.run(`DELETE FROM mesa_clientes WHERE mesa = ?`, [mesaName], () => broadcastMesaClientes());
          db.all(`SELECT * FROM mesas`, (e, r) => io.emit('mesas_atualizadas', r || []));
          io.emit('mesa_finalizada', { mesaName });
          io.emit('pedidos_atualizados', []);
        });
      }
    );
  });

  socket.on('zerar_todos_dados', async ({ senha }) => {
    /* Apenas Admin/Gerente podem zerar dados */
    const cargo = socket.auth?.cargo || '';
    const isAdmin = ['Admin', 'Administrador', 'adm', 'Gerente'].includes(cargo);
    if (!isAdmin) {
      socket.emit('erro_caixa', 'Apenas administradores podem zerar dados.');
      return;
    }
    if (!(await verificarPinOuSenha(senha))) {
      socket.emit('erro_caixa', 'Senha ou PIN incorreto!');
      return;
    }
    console.log('[Admin] ZERANDO TODOS OS DADOS DO SISTEMA');
    const allowedTables = ['pedidos', 'movimentacoes', 'turnos', 'clientes', 'promocoes', 'cupons', 'beneficios', 'nfce', 'ia_config', 'mesas', 'produtos'];
    const tables = allowedTables.filter(t => /^[a-z_]+$/.test(t));
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      tables.forEach(t => { db.run(`DELETE FROM ${t}`); });
      db.run('COMMIT', () => {
        db.all('SELECT * FROM mesas', (e, r) => io.emit('mesas_atualizadas', r || []));
        io.emit('pedidos_atualizados', []);
        io.emit('clientes_atualizados', []);
        socket.emit('zerar_concluido', { ok: true });
      });
    });
  });

  // ── PINs TEMPORARIOS ──
  function gerarPinCustomizado(tamanho) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const tam = Math.min(Math.max(parseInt(tamanho) || 4, 3), 6);
    let pin = '';
    for (let i = 0; i < tam; i++) pin += chars[Math.floor(Math.random() * chars.length)];
    return pin;
  }

  socket.on('criar_pin_temporario', (data) => {
    const cargo = socket.funcionarioCargo || '';
    const isAdmin = ['Admin', 'Administrador', 'adm', 'Gerente'].includes(cargo);
    if (!isAdmin) return socket.emit('pin_erro', 'Apenas Admin ou Gerente podem criar PINs.');
    const { nome_colaborador, categorias, max_usos, tipo_expiracao, expira_minutos, expira_em, pin_customizado, pin_tamanho } = data;
    if (!nome_colaborador) return socket.emit('pin_erro', 'Informe o nome do colaborador.');
    let pin;
    if (pin_customizado && pin_customizado.trim()) {
      pin = pin_customizado.trim().toUpperCase();
      const tam = parseInt(pin_tamanho) || 4;
      if (pin.length < 3 || pin.length > 6) return socket.emit('pin_erro', 'O PIN deve ter entre 3 e 6 caracteres.');
      if (!/^[A-Z0-9]+$/.test(pin)) return socket.emit('pin_erro', 'O PIN deve conter apenas letras e números.');
      if (pin.length !== tam) return socket.emit('pin_erro', 'O PIN deve ter ' + tam + ' caracteres.');
    } else {
      const tam = parseInt(pin_tamanho) || 4;
      pin = gerarPinCustomizado(tam);
    }
    let expira = null;
    if (tipo_expiracao === 'minutos' && expira_minutos) {
      const d = new Date(); d.setMinutes(d.getMinutes() + parseInt(expira_minutos));
      expira = d.toISOString();
    } else if (tipo_expiracao === 'data' && expira_em) {
      expira = expira_em;
    } else if (tipo_expiracao === 'sessao') {
      expira = 'SESSION';
    }
    const usos = parseInt(max_usos) || 1;
    const cats = JSON.stringify(categorias || []);
    db.run(`INSERT INTO pins_temporarios (pin, nome_colaborador, categorias, max_usos, expira_em, tipo_expiracao, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [pin, nome_colaborador, cats, usos, expira, tipo_expiracao || 'minutos', socket.funcionarioCargo || 'Admin'], (err) => {
        if (err) return socket.emit('pin_erro', 'Erro ao criar PIN.');
        socket.emit('pin_criado', { pin, nome_colaborador, categorias: categorias || [], max_usos: usos, expira_em: expira, tipo_expiracao: tipo_expiracao || 'minutos' });
        socket.emit('pins_atualizados');
      });
  });

  socket.on('listar_pins_temporarios', () => {
    const cargo = socket.funcionarioCargo || '';
    if (!['Admin', 'Administrador', 'adm', 'Gerente'].includes(cargo)) {
      return socket.emit('lista_pins', []);
    }
    db.all(`SELECT * FROM pins_temporarios ORDER BY id DESC`, [], (err, rows) => {
      socket.emit('lista_pins', rows || []);
    });
  });

  socket.on('revogar_pin', (id) => {
    const cargo = socket.funcionarioCargo || '';
    if (!['Admin', 'Administrador', 'adm', 'Gerente'].includes(cargo)) return;
    db.run(`UPDATE pins_temporarios SET ativo = 0 WHERE id = ?`, [id], () => {
      socket.emit('pins_atualizados');
    });
  });

  socket.on('renovar_pin', (data) => {
    const cargo = socket.funcionarioCargo || '';
    if (!['Admin', 'Administrador', 'adm', 'Gerente'].includes(cargo)) return;
    const { id, minutos } = data;
    let novaExpira = null;
    if (minutos && parseInt(minutos) > 0) {
      const d = new Date(); d.setMinutes(d.getMinutes() + parseInt(minutos));
      novaExpira = d.toISOString();
    }
    db.run(`UPDATE pins_temporarios SET ativo = 1, usos_atual = 0, expira_em = ? WHERE id = ?`, [novaExpira, id], () => {
      socket.emit('pins_atualizados');
    });
  });

  socket.on('login_por_pin', (data) => {
    const { pin } = data;
    if (!pin) return socket.emit('login_error', 'Informe o PIN.');
    
    // 1. Tenta autenticar via PIN do colaborador permanente
    db.all(`SELECT * FROM funcionarios WHERE pin_hash IS NOT NULL AND pin_hash != '' AND status = 'Ativo'`, [], async (errF, funcs) => {
      if (!errF && funcs && funcs.length > 0) {
        for (const f of funcs) {
          const match = await bcrypt.compare(String(pin), f.pin_hash).catch(() => false);
          if (match) {
            const payload = {
              id: f.id,
              nome: f.nome,
              usuario: f.usuario,
              cargo: f.cargo || 'Colaborador',
              status: f.status,
              restaurante_id: socketTenantId || tenantContext.getStore() || 1
            };
            socket.emit('login_success', payload);
            socket.funcionarioId = f.id;
            socket.funcionarioCargo = payload.cargo;
            const sessToken = jwt.sign({ tipo: 'funcionario', id: f.id, nome: f.nome, usuario: f.usuario, cargo: payload.cargo, restaurante_id: payload.restaurante_id, pin: true }, JWT_SECRET, { expiresIn: '90d' });
            socket.emit('login_token', sessToken);
            socket.emit('tenant_atualizado', { restaurante_id: payload.restaurante_id, token: sessToken });
            return;
          }
        }
      }

      // 2. Se não encontrou colaborador permanente, busca nos PINs temporários
      db.get(`SELECT * FROM pins_temporarios WHERE pin = ? AND ativo = 1`, [pin], (err, row) => {
        if (err || !row) return socket.emit('login_error', 'PIN inválido ou inativo.');
        if (row.tipo_expiracao !== 'sessao' && row.expira_em && row.expira_em !== 'SESSION') {
          if (new Date(row.expira_em) < new Date()) {
            return socket.emit('login_error', 'PIN expirado. Solicite um novo ao administrador.');
          }
        }
        if (row.usos_atual >= row.max_usos) {
          return socket.emit('login_error', 'PIN atingiu o limite de usos.');
        }
        db.run(`UPDATE pins_temporarios SET usos_atual = usos_atual + 1 WHERE id = ?`, [row.id], () => {});
        const categorias = JSON.parse(row.categorias || '[]');
        const payload = {
          id: -row.id,
          nome: row.nome_colaborador || 'Colaborador',
          usuario: 'pin_' + row.pin,
          cargo: categorias[0] || 'Garcom',
          categorias_pin: categorias,
          status: 'Ativo',
          restaurante_id: socketTenantId || tenantContext.getStore() || 1,
          login_expires_at: row.tipo_expiracao === 'sessao' ? 'SESSION' : row.expira_em
        };
        socket.emit('login_success', payload);
        socket.funcionarioId = row.id;
        socket.funcionarioCargo = payload.cargo;
        const sessToken = jwt.sign({ tipo: 'funcionario', id: row.id, nome: row.nome_colaborador, usuario: 'pin_' + row.pin, cargo: payload.cargo, restaurante_id: payload.restaurante_id, pin: true }, JWT_SECRET, { expiresIn: '90d' });
        socket.emit('login_token', sessToken);
        socket.emit('tenant_atualizado', { restaurante_id: payload.restaurante_id, token: sessToken });
      });
    });
  });

  // --- PAINEL FUNCIONARIO: CALENDARIO E CONSUMO ---
  socket.on('get_calendario_funcionario', (funcionario_id) => {
    if (!isValidId(funcionario_id)) return;
    db.get(`SELECT data_cadastro FROM funcionarios WHERE id = ?`, [funcionario_id], (err0, func) => {
      db.all(`SELECT p.id, p.data, p.entrada, p.saida, p.total_horas, p.valor_pagar, p.pago
        FROM pontos p WHERE p.funcionario_id = ? ORDER BY p.data DESC`, [funcionario_id], (err, pontos) => {
        db.all(`SELECT p.id, p.productName, p.quantity, p.total, p.createdAt
          FROM pedidos p WHERE p.funcionario_id = ? AND paymentMethod = 'Fiado'
          ORDER BY p.createdAt DESC`, [funcionario_id], (err2, consumo) => {
          db.all(`SELECT * FROM dias_atipicos WHERE funcionario_id = ? ORDER BY data DESC`, [funcionario_id], (err3, atipicos) => {
            db.all(`SELECT * FROM vales WHERE funcionario_id = ? ORDER BY id DESC`, [funcionario_id], (err4, vales) => {
              db.all(`SELECT data, disponivel FROM disponibilidade_funcionarios WHERE funcionario_id = ? AND disponivel = 1`, [funcionario_id], (err5, disponibilidades) => {
                socket.emit('calendario_funcionario', {
                  pontos: pontos || [],
                  consumo: consumo || [],
                  atipicos: atipicos || [],
                  vales: vales || [],
                  disponibilidades: disponibilidades || [],
                  data_cadastro: (func && func.data_cadastro) || null
                });
              });
            });
          });
        });
      });
    });
  });

  socket.on('get_disponibilidade_funcionario', (funcionario_id) => {
    if (!isValidId(funcionario_id)) return;
    db.all(`SELECT data, disponivel FROM disponibilidade_funcionarios WHERE funcionario_id = ?`, [funcionario_id], (err, rows) => {
      socket.emit('disponibilidade_funcionario', rows || []);
    });
  });

  socket.on('toggle_disponibilidade', ({ funcionario_id, data, disponivel }) => {
    if (!isValidId(funcionario_id) || !data) return;
    const dispVal = disponivel ? 1 : 0;
    db.run(`INSERT INTO disponibilidade_funcionarios (funcionario_id, data, disponivel) VALUES (?, ?, ?)
            ON CONFLICT(funcionario_id, data) DO UPDATE SET disponivel = excluded.disponivel`,
      [funcionario_id, data, dispVal], (err) => {
        if (!err) {
          db.all(`SELECT data, disponivel FROM disponibilidade_funcionarios WHERE funcionario_id = ?`, [funcionario_id], (err2, rows) => {
            socket.emit('disponibilidade_funcionario', rows || []);
            io.emit('disponibilidade_equipe_atualizada');
          });
        }
      }
    );
  });

  socket.on('get_disponibilidade_equipe', () => {
    db.all(`SELECT d.*, f.nome as funcionario_nome, f.cargo as funcionario_cargo 
            FROM disponibilidade_funcionarios d 
            JOIN funcionarios f ON d.funcionario_id = f.id 
            WHERE d.disponivel = 1`, [], (err, rows) => {
      socket.emit('disponibilidade_equipe', rows || []);
    });
  });

  socket.on('get_meu_consumo', (funcionario_id) => {
    if (!isValidId(funcionario_id)) return;
    db.all(`SELECT id, productName, quantity, total, createdAt, pagamento_id, funcionario_id
      FROM pedidos
      WHERE funcionario_id = ? AND paymentMethod = 'Fiado' AND pagamento_id IS NULL
      ORDER BY id DESC`, [funcionario_id], (err, items) => {
      socket.emit('meu_consumo', items || []);
    });
  });

  // Cardapio do funcionario (itens disponiveis para consumo com precos configurados)
  socket.on('get_cardapio_funcionario', () => {
    db.all(`SELECT p.id, p.categoria, p.nome, p.preco, p.emoji, c.id as config_id, c.preco_fixo, c.desconto_percentual, c.ativo as config_ativo
      FROM produtos p
      LEFT JOIN funcionario_consumo_config c ON c.produto_id = p.id
      WHERE p.status = 'ativo'
      ORDER BY p.categoria, p.nome`, (err, produtos) => {
      socket.emit('cardapio_funcionario', produtos || []);
    });
  });

  // Funcionario adiciona item ao consumo
  socket.on('adicionar_consumo_funcionario', ({ funcionario_id, produto_id, quantidade }) => {
    if (!isValidId(funcionario_id) || !isValidId(produto_id)) return;
    const qtd = Math.max(1, parseInt(quantidade) || 1);
    db.get(`SELECT p.id, p.nome, p.preco, p.emoji, p.categoria, c.preco_fixo, c.desconto_percentual
      FROM produtos p
      LEFT JOIN funcionario_consumo_config c ON c.produto_id = p.id
      WHERE p.id = ?`, [produto_id], (err, prod) => {
      if (!prod) return;
      let valorUnit = prod.preco || 0;
      if (prod.preco_fixo) valorUnit = prod.preco_fixo;
      else if (prod.desconto_percentual) valorUnit = valorUnit * (1 - prod.desconto_percentual / 100);
      const total = valorUnit * qtd;
      const agora = getLocalTimestamp();
      // Buscar nome do funcionario
      db.get("SELECT nome FROM funcionarios WHERE id = ?", [funcionario_id], (errF, func) => {
        const nome = func ? func.nome : 'Funcionario';
        db.run(`INSERT INTO pedidos (productName, quantity, total, localName, userName, status, sector, paymentMethod, createdAt, funcionario_id)
          VALUES (?, ?, ?, ?, ?, 'Finalizado', 'Cozinha', 'Fiado', ?, ?)`,
          [prod.nome, qtd, total.toFixed(2), nome, nome, agora, funcionario_id], function (errIns) {
            if (!errIns) {
              socket.emit('consumo_adicionado', { id: this.lastID, nome: prod.nome, qtd, total, emoji: prod.emoji });
            } else {
              socket.emit('consumo_erro', 'Erro ao adicionar consumo.');
            }
          });
      });
    });
  });

  // Buscar produto por codigo de barras no consumo
  socket.on('get_produto_by_barcode', (codigo) => {
    if (!codigo) return;
    db.get(`SELECT * FROM produtos WHERE codigo_barras = ? LIMIT 1`, [codigo], (err, row) => {
      socket.emit('produto_by_barcode_result', row || null);
    });
  });

  socket.on('solicitar_dia_atipico', ({ funcionario_id, data, valor, justificativa }) => {
    if (!isValidId(funcionario_id)) return;
    db.run(`INSERT INTO dias_atipicos (funcionario_id, data, valor, justificativa, status, created_at) VALUES (?, ?, ?, ?, 'pendente', ?)`,
      [funcionario_id, data, safeFloat(valor, 0, 99999), justificativa || '', getLocalTimestamp()], function (err) {
        if (!err) socket.emit('dia_atipico_solicitado');
      });
  });

  socket.on('responder_dia_atipico', ({ id, acao }) => {
    if (!isValidId(id)) return;
    const status = acao === 'aceitar' ? 'aprovado' : 'recusado';
    db.run(`UPDATE dias_atipicos SET status = ? WHERE id = ?`, [status, id], () => {
      socket.emit('dia_atipico_atualizado');
    });
  });

  socket.on('get_restaurante_config', () => {
    db.all(`SELECT chave, valor FROM configuracoes WHERE chave LIKE 'rest_%'`, [], (err, rows) => {
      const config = {};
      (rows || []).forEach(r => { config[r.chave] = r.valor; });
      // Include slug and custom_domain from master DB
      const restId = socket.restaurante_id || 0;
      if (restId > 0) {
        masterDb.get(`SELECT slug, custom_domain FROM restaurantes WHERE id = ?`, [restId], (errM, row) => {
          if (row) {
            config['rest_slug'] = row.slug || '';
            config['rest_custom_domain'] = row.custom_domain || '';
          }
          config['rest_base_domain'] = BASE_DOMAIN;
          socket.emit('restaurante_config', config);
        });
      } else {
        config['rest_base_domain'] = BASE_DOMAIN;
        socket.emit('restaurante_config', config);
      }
    });
  });

  // --- PAINEL FUNCIONARIO: GERENCIA/MANAGER ---
  socket.on('manager_get_team_status', () => {
    db.all(`SELECT id, nome, cargo FROM funcionarios WHERE status = 'Ativo'`, [], (err, funcs) => {
      if (err || !funcs) return socket.emit('manager_team_status', []);
      db.all(`SELECT funcionario_id FROM pontos WHERE saida IS NULL`, [], (errP, pontosAbertos) => {
        const openPointsSet = new Set((pontosAbertos || []).map(p => p.funcionario_id));
        const activeSocketFuncs = new Set(
          Array.from(activeSockets.values())
            .filter(conn => conn && conn.user)
            .map(conn => conn.user)
        );
        const result = funcs.map(f => {
          const isOnline = activeSocketFuncs.has(f.nome) || Array.from(io.sockets.sockets.values()).some(s => s.funcionarioId === f.id);
          return {
            id: f.id,
            nome: f.nome,
            cargo: f.cargo,
            online: isOnline,
            ponto_aberto: openPointsSet.has(f.id)
          };
        });
        socket.emit('manager_team_status', result);
      });
    });
  });

  socket.on('manager_get_pending_vales', () => {
    db.all(`SELECT v.*, f.nome as funcionario_nome FROM vales v JOIN funcionarios f ON v.funcionario_id = f.id WHERE v.status = 'Pendente' ORDER BY v.id DESC`, [], (err, vales) => {
      socket.emit('manager_pending_vales', vales || []);
    });
  });

  socket.on('manager_get_calendar_vales', () => {
    db.all(`SELECT v.*, f.nome as funcionario_nome FROM vales v JOIN funcionarios f ON v.funcionario_id = f.id ORDER BY v.data_pedido DESC`, [], (err, vales) => {
      socket.emit('manager_calendar_vales', vales || []);
    });
  });

  socket.on('manager_aprovar_vale', ({ id }) => {
    if (!['Gerente', 'Admin', 'Administrador', 'adm'].includes(socket.funcionarioCargo)) {
      return socket.emit('erro_caixa', 'Apenas gerentes ou administradores podem aprovar vales.');
    }
    db.get("SELECT * FROM vales WHERE id = ?", [id], (err, vale) => {
      if (vale && vale.status === 'Pendente') {
        db.run("UPDATE vales SET status = 'Aprovado', data_aprovacao = datetime('now', 'localtime') WHERE id = ?", [id], (errU) => {
          if (!errU) {
            db.get("SELECT id FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1", (errC, turno) => {
              if (turno) {
                db.run(
                  "INSERT INTO movimentacoes (turno_id, tipo, valor, descricao, data, forma_pagamento) VALUES (?, 'saida', ?, ?, datetime('now', 'localtime'), 'Dinheiro')",
                  [turno.id, vale.valor, "Adiantamento/Vale - Func. ID " + vale.funcionario_id]
                );
              }
            });
            socket.emit('manager_vale_atualizado');
            io.emit('vale_solicitado_success');
            io.emit('rh_update');
          }
        });
      }
    });
  });

  socket.on('manager_recusar_vale', ({ id }) => {
    if (!['Gerente', 'Admin', 'Administrador', 'adm'].includes(socket.funcionarioCargo)) {
      return socket.emit('erro_caixa', 'Apenas gerentes ou administradores podem recusar vales.');
    }
    db.run("UPDATE vales SET status = 'Recusado' WHERE id = ?", [id], (err) => {
      if (!err) {
        socket.emit('manager_vale_atualizado');
        io.emit('vale_solicitado_success');
        io.emit('rh_update');
      }
    });
  });

  socket.on('disconnect', () => {
    activeSockets.delete(socket.id);
    metricRemoveSocket(socket);
    if (mpPollInterval) {
      clearInterval(mpPollInterval);
      mpPollInterval = null;
    }

    // [iFood On-Demand] Atualiza contagem de sessões ativas do tenant após desconexão
    try {
      const roomSockets = io.sockets.adapter.rooms.get(`restaurante_${socketTenantId}`);
      const activeCount = roomSockets ? roomSockets.size : 0;
      ifoodApi.notifyTenantSessionState(socketTenantId, activeCount, { io, masterDb, tenantContext, getTenantDb, isFeatureEnabled: isTenantFeatureEnabled });
    } catch (e) {}

    console.log(`[Socket] Dispositivo desconectado: ${socket.id}`);
  });
});

// --- FIM DO CALLBACK PRINCIPAL io.on(connection) ---

// --- INICIALIZAÇÃO DA INTEGRAÇÃO iFOOD (real) ---
// Liga os pollers de eventos das contas iFood já autorizadas em cada tenant.
setTimeout(() => {
  try {
    ifoodApi.startAllPollers({ io, masterDb, tenantContext, getTenantDb, dir: __dirname, isFeatureEnabled: isTenantFeatureEnabled });
    console.log('[iFood] Integração iniciada.');
  } catch (e) {
    console.error('[iFood] Falha ao iniciar integração:', e.message || e);
  }
}, 3000);

// --- SNAPSHOT DE FEATURES + MÉTRICAS DE PICO ---
loadAllTenantFeatures().then(() => {
  console.log('[Features] Snapshot de features dos tenants carregado.');
});
loadDomainMaps().then(() => {
  console.log('[Domains] Mapa de domínios dos tenants carregado (' + domainMap.size + ' domínios, ' + slugMap.size + ' slugs).');
});
setInterval(() => { loadAllTenantFeatures().catch(() => { }); }, TENANT_FEATURES_REFRESH_MS);
setInterval(() => { loadDomainMaps().catch(() => { }); }, 60000);
setInterval(() => { samplePicos(); }, 60000);

// --- INICIALIZAÇÃO DO MODO DE DEPLOY ---
console.log('[Deploy] Modo:', deploymentConfig.getDeployMode(), '| Versão:', deploymentConfig.getSoftwareVersion());

if (deploymentConfig.isOnPremise()) {
  const syncAgent = require('./sync-agent');
  syncAgent.initialize({
    db,
    masterDb: null,
    tenantContext,
    io,
    getTenantDb,
    deploymentConfig,
    instanceIdentity
  }).then(() => {
    console.log('[Sync] Agente on-premise inicializado com sucesso.');
  }).catch((err) => {
    console.error('[Sync] Falha ao inicializar agente:', err.message || err);
  });
} else {
  const syncServer = require('./controllers/sync-server');
  syncServer.initialize({
    app,
    io,
    masterDb,
    tenantContext,
    superAdminAuth,
    getTenantDb,
    deploymentConfig
  });
  console.log('[Sync] Servidor sync (cloud) inicializado.');
}

// --- RETRO API PARA ANDROID 3.2 ---
app.get('/api/retro/mesas', (req, res) => {
  withTenant(req, () => {
    db.all("SELECT * FROM mesas", (err, mesas) => {
      if (err) return res.status(500).json({ error: 'Erro no banco' });
      db.all("SELECT * FROM pedidos WHERE status != 'Finalizado' ORDER BY createdAt ASC", (err, pedidos) => {
        if (err) return res.status(500).json({ error: 'Erro no banco' });
        res.json({ mesas: mesas || [], pedidos: pedidos || [] });
      });
    });
  });
});

app.get('/api/retro/cardapio', (req, res) => {
  withTenant(req, () => {
    db.all("SELECT * FROM produtos WHERE LOWER(status) != 'inativo' OR status IS NULL", (err, produtos) => {
      if (err) return res.status(500).json({ error: 'Erro no banco' });
      res.json({ produtos: produtos || [] });
    });
  });
});

app.post('/api/retro/pedido', (req, res) => {
  if (licenseManager.isRestricted()) {
    return res.status(403).json({ error: 'Sistema em modo restrito. Ative a licença.' });
  }
  const pedido = req.body;
  if (!pedido || !pedido.mesa_comanda) return res.status(400).json({ error: 'Dados inválidos' });
  const tid = resolveTenantId(req);
  const roomId = (Number.isFinite(tid) && tid > 0) ? `restaurante_${tid}` : null;

  let status = pedido.status_inicial || 'Em preparo';

  withTenant(req, () => {
    db.get(`SELECT status FROM mesas WHERE nome = ?`, [pedido.mesa_comanda], (err, rowMesa) => {
      if (rowMesa && rowMesa.status !== 'Fechando') {
        db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ? AND status = 'Disponível'`, [pedido.mesa_comanda]);
      }
    });

    const query = `
      INSERT INTO pedidos (
        userName, localName, productName, quantity, options, observations, composicoes,
        status, mesa_comanda, mesa_grupo, isCommand,
        printer, sector, total,
        cliente_id, is_delivery
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      pedido.userName || 'Garçom Retro',
      pedido.localName || pedido.mesa_comanda,
      pedido.productName,
      pedido.quantity || 1,
      pedido.options || '[]',
      pedido.observations || '',
      JSON.stringify(pedido.composicoes || []),
      status,
      pedido.mesa_comanda,
      pedido.mesa_grupo || pedido.mesa_comanda,
      pedido.isCommand || 0,
      pedido.printer || '',
      pedido.sector || '',
      pedido.total || 0,
      pedido.cliente_id || null,
      pedido.is_delivery || 0
    ];

    db.run(query, params, function (err) {
      if (err) {
        console.error('Erro /api/retro/pedido:', err);
        return res.status(500).json({ error: 'Erro ao inserir pedido' });
      }
      const novoId = this.lastID;
      const novoItem = { id: novoId, ...pedido, status, createdAt: new Date().toISOString() };

      if (roomId) io.to(roomId).emit('novo_pedido_sync', [novoItem]);
      else io.emit('novo_pedido_sync', [novoItem]);

      db.all("SELECT * FROM mesas", (e, m) => {
        if (!e) {
          if (roomId) io.to(roomId).emit('mesas_atualizadas', m || []);
          else io.emit('mesas_atualizadas', m || []);
        }
      });

      res.json({ success: true, id: novoId });
    });
  });
});
// ---------------------------------

// --- RETRO/LITE REST API (restaurado do backup) ---

// POST /api/retro/pedidos/batch — enviar múltiplos itens de uma vez
app.post('/api/retro/pedidos/batch', (req, res) => {
  if (licenseManager.isRestricted()) {
    return res.status(403).json({ error: 'Sistema em modo restrito. Ative a licença.' });
  }
  const body = req.body || {};
  const itens = Array.isArray(body.itens) ? body.itens : (Array.isArray(body) ? body : []);
  if (!itens.length) return res.status(400).json({ error: 'Nenhum item informado.' });
  
  const tid = resolveTenantId(req);
  const roomId = (Number.isFinite(tid) && tid > 0) ? `restaurante_${tid}` : null;
  const mesaNome = body.mesaNome || itens[0].mesa_comanda || itens[0].localName;

  withTenant(req, () => {
    if (mesaNome) {
      db.get(`SELECT status FROM mesas WHERE nome = ?`, [mesaNome], (err, rowMesa) => {
        if (rowMesa && rowMesa.status !== 'Fechando') {
          db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ? AND status = 'Disponível'`, [mesaNome]);
        }
      });
    }

    const insertedItems = [];
    let pending = itens.length;
    let hasError = false;

    itens.forEach((item) => {
      const status = item.status_inicial || 'Em preparo';
      const query = `
        INSERT INTO pedidos (
          userName, localName, productName, quantity, options, observations, composicoes,
          status, mesa_comanda, mesa_grupo, isCommand,
          printer, sector, total,
          cliente_id, is_delivery
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        item.userName || body.userName || 'Garçom Lite',
        item.localName || mesaNome,
        item.productName,
        item.quantity || 1,
        item.options || '[]',
        item.observations || '',
        JSON.stringify(item.composicoes || []),
        status,
        mesaNome,
        mesaNome,
        item.isCommand || 0,
        item.printer || '',
        item.sector || '',
        item.total || 0,
        item.cliente_id || null,
        item.is_delivery || 0
      ];

      db.run(query, params, function(err) {
        pending--;
        if (err) {
          console.error('Erro /api/retro/pedidos/batch:', err);
          hasError = true;
        } else {
          insertedItems.push({ id: this.lastID, ...item, status, createdAt: new Date().toISOString() });
        }

        if (pending === 0) {
          if (insertedItems.length > 0) {
            if (roomId) io.to(roomId).emit('novo_pedido_sync', insertedItems);
            else io.emit('novo_pedido_sync', insertedItems);

            db.all("SELECT * FROM mesas", (e, m) => {
              if (!e) {
                if (roomId) io.to(roomId).emit('mesas_atualizadas', m || []);
                else io.emit('mesas_atualizadas', m || []);
              }
            });
          }
          if (hasError && insertedItems.length === 0) {
            return res.status(500).json({ error: 'Erro ao inserir pedidos.' });
          }
          return res.json({ success: true, count: insertedItems.length, items: insertedItems });
        }
      });
    });
  });
});

// POST /api/retro/login — login do garçom (retorno com dados do funcionário)
app.post('/api/retro/login', (req, res) => {
  const { usuario, senha } = req.body;
  const u = String(usuario || '').trim();
  withTenant(req, () => {
    db.get("SELECT * FROM funcionarios WHERE LOWER(TRIM(usuario)) = LOWER(TRIM(?)) OR LOWER(TRIM(nome)) = LOWER(TRIM(?))", [u, u], (err, row) => {
      if (err) return res.status(500).json({ error: 'Erro ao consultar banco.' });
      if (!row) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
      verificarSenhaFuncionario(row, senha).then((ok) => {
        if (!ok) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
        if (row.status !== 'Ativo') return res.status(403).json({ error: 'Funcionário pendente ou inativo.' });
        res.json({ ok: true, funcionario: funcionarioPublico(row) });
      });
    });
  });
});

// PUT /api/retro/pedido/:id/status — atualizar status de um pedido
app.put('/api/retro/pedido/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status obrigatório.' });
  const validos = ['Recebido', 'Em preparo', 'Pronto', 'Entregue', 'Finalizado'];
  if (!validos.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  const tid = resolveTenantId(req);
  const roomId = (Number.isFinite(tid) && tid > 0) ? `restaurante_${tid}` : null;

  withTenant(req, () => {
    db.run(`UPDATE pedidos SET status = ?, garcom_call = NULL WHERE id = ?`, [status, id], function (err) {
      if (err) return res.status(500).json({ error: 'Erro ao atualizar pedido.' });
      if (this.changes === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });

      if (roomId) io.to(roomId).emit('pedido_atualizado', { id: Number(id), status });
      else io.emit('pedido_atualizado', { id: Number(id), status });

      db.all("SELECT * FROM mesas", (e, m) => {
        if (!e) {
          if (roomId) io.to(roomId).emit('mesas_atualizadas', m || []);
          else io.emit('mesas_atualizadas', m || []);
        }
      });

      res.json({ success: true });
    });
  });
});

// POST /api/retro/cobranca — registrar pagamento e finalizar mesa ou registrar pagamento parcial
app.post('/api/retro/cobranca', (req, res) => {
  const { mesaNome, metodo, valor, gorjeta, garcom, parcial, is_parcial } = req.body;
  if (!mesaNome || !metodo || valor === undefined) {
    return res.status(400).json({ error: 'mesaNome, metodo e valor são obrigatórios.' });
  }
  const valorNumerico = parseFloat(String(valor).replace(',', '.'));
  if (isNaN(valorNumerico) || valorNumerico <= 0) {
    return res.status(400).json({ error: 'Valor inválido.' });
  }

  const tid = resolveTenantId(req);
  const roomId = (Number.isFinite(tid) && tid > 0) ? `restaurante_${tid}` : null;
  const ehParcial = Boolean(parcial || is_parcial || req.body.tipo === 'parcial');

  withTenant(req, () => {
    db.get(`SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`, [], (errTurno, turno) => {
      if (errTurno || !turno) {
        return res.status(400).json({ error: 'O caixa está fechado! Abra o caixa no PDV antes de receber pagamentos.' });
      }

      db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ? OR mesa_comanda = ?) AND status != 'Finalizado'`, [mesaNome, mesaNome, mesaNome], (errItems, rows) => {
        if (errItems) return res.status(500).json({ error: 'Erro ao buscar itens da mesa.' });
        const items = rows || [];

        let consumoBruto = 0;
        let jaPago = 0;
        items.forEach(r => {
          const v = parseFloat(String(r.total).replace(',', '.')) || 0;
          if (v >= 0) {
            consumoBruto += v;
          } else if (r.productName && (String(r.productName).indexOf('Pgto Parcial') !== -1 || String(r.productName).indexOf('Pagamento') !== -1)) {
            jaPago += Math.abs(v);
          }
        });

        db.get(`SELECT valor FROM configuracoes_global WHERE chave = 'taxa_servico'`, [], (errTaxa, taxaRow) => {
          const taxaPct = (errTaxa || !taxaRow) ? 10 : (parseFloat(taxaRow.valor) || 10);
          const totalComTaxa = Math.max(0, consumoBruto * (1 + taxaPct / 100) - jaPago);

          // Se for pagamento parcial
          if (ehParcial) {
            const queryParcial = `
              INSERT INTO pedidos (
                userName, localName, productName, quantity, options, observations, composicoes,
                status, mesa_comanda, mesa_grupo, isCommand,
                printer, sector, total, paymentMethod, turno_id, finalizadoEm
              ) VALUES (?, ?, ?, 1, '[]', ?, '[]', 'Finalizado', ?, ?, 0, '', '', ?, ?, ?, datetime('now'))
            `;
            const paramsParcial = [
              garcom || 'Garçom Lite',
              mesaNome,
              `Pgto Parcial (${metodo})`,
              `Pagamento parcial realizado pelo garçom ${garcom || ''}`,
              mesaNome,
              mesaNome,
              -valorNumerico,
              metodo,
              turno.id
            ];

            db.run(queryParcial, paramsParcial, function(errP) {
              if (errP) return res.status(500).json({ error: 'Erro ao registrar pagamento parcial.' });

              db.run(
                `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, 'Entrada', ?, ?, ?, datetime('now', 'localtime'))`,
                [turno.id, valorNumerico, metodo, `Pgto Parcial Mesa: ${mesaNome}${garcom ? ' (Garçom: ' + garcom + ')' : ''}`]
              );

              if (roomId) io.to(roomId).emit('mesas_atualizadas');
              else io.emit('mesas_atualizadas');
              setTimeout(() => io.emit('atualizacao_caixa'), 300);

              const restante = Math.max(0, totalComTaxa - valorNumerico);
              return res.json({
                success: true,
                parcial: true,
                restante: restante,
                message: `Pagamento parcial de R$ ${valorNumerico.toFixed(2)} registrado! Restante: R$ ${restante.toFixed(2)}`
              });
            });
            return;
          }

          // Pagamento Total
          if (valorNumerico < totalComTaxa - 0.05 && totalComTaxa > 0.01) {
            return res.status(400).json({ error: `Valor insuficiente. Total a pagar: R$ ${totalComTaxa.toFixed(2)}` });
          }

          db.run(`UPDATE pedidos SET status = 'Finalizado', paymentMethod = ?, turno_id = ?, finalizadoEm = datetime('now') WHERE (localName = ? OR mesa_grupo = ? OR mesa_comanda = ?) AND status != 'Finalizado'`, [metodo, turno.id, mesaNome, mesaNome, mesaNome], function (err) {
            if (err) return res.status(500).json({ error: 'Erro ao finalizar pedidos.' });

            db.run(
              `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, 'Entrada', ?, ?, ?, datetime('now', 'localtime'))`,
              [turno.id, valorNumerico, metodo, `Pgto Mesa: ${mesaNome}${garcom ? ' (Garçom: ' + garcom + ')' : ''}`]
            );

            const gorjetaNum = parseFloat(String(gorjeta || '0').replace(',', '.'));
            if (gorjetaNum > 0) {
              db.run(
                `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, 'Entrada', ?, ?, ?, datetime('now', 'localtime'))`,
                [turno.id, gorjetaNum, metodo, `Gorjeta: ${mesaNome}`]
              );
            }

            db.run(`UPDATE mesas SET status = 'Disponível' WHERE nome = ?`, [mesaNome], function (err2) {
              if (err2) return res.status(500).json({ error: 'Erro ao atualizar mesa.' });

              if (roomId) io.to(roomId).emit('mesas_atualizadas');
              else io.emit('mesas_atualizadas');
              if (roomId) io.to(roomId).emit('mesa_finalizada', { mesaName: mesaNome });
              else io.emit('mesa_finalizada', { mesaName: mesaNome });

              setTimeout(() => io.emit('atualizacao_caixa'), 300);

              res.json({ success: true, message: 'Cobrança registrada com sucesso!' });
            });
          });
        });
      });
    });
  });
});

// GET /api/retro/taxa-servico — percentual da taxa de serviço
app.get('/api/retro/taxa-servico', (req, res) => {
  const lerTaxa = (cb) => {
    masterDb.get("SELECT valor FROM configuracoes_global WHERE chave = 'taxa_servico'", [], (err, row) => {
      if (err || !row) return cb(10);
      const taxa = parseFloat(row.valor);
      cb(isNaN(taxa) ? 10 : taxa);
    });
  };
  lerTaxa((taxa) => {
    res.json({ taxa_servico: taxa });
  });
});

// GET /api/retro/config — configurações completas para garçom lite
app.get('/api/retro/config', (req, res) => {
  withTenant(req, () => {
    masterDb.get("SELECT valor FROM configuracoes_global WHERE chave = 'taxa_servico'", [], (err1, rowTaxa) => {
      masterDb.get("SELECT valor FROM configuracoes_global WHERE chave = 'chave_pix'", [], (err2, rowPix) => {
        db.all("SELECT id, nome, tipo, ativo FROM formas_pagamento WHERE ativo = 1", [], (err3, formas) => {
          const taxa = rowTaxa && !isNaN(parseFloat(rowTaxa.valor)) ? parseFloat(rowTaxa.valor) : 10;
          const chavePix = (rowPix && rowPix.valor) || '';
          res.json({
            taxa_servico: taxa,
            chave_pix: chavePix,
            formas_pagamento: (formas && formas.length) ? formas : [
              { id: 1, nome: 'Dinheiro', tipo: 'dinheiro' },
              { id: 2, nome: 'Cartão de Débito', tipo: 'debito' },
              { id: 3, nome: 'Cartão de Crédito', tipo: 'credito' },
              { id: 4, nome: 'PIX', tipo: 'pix' },
              { id: 5, nome: 'Vale Refeição', tipo: 'vale' },
              { id: 6, nome: 'Fiado', tipo: 'fiado' }
            ]
          });
        });
      });
    });
  });
});

// GET /api/retro/caixa — estado atual do caixa e resumo do turno
app.get('/api/retro/caixa', (req, res) => {
  withTenant(req, () => {
    db.get(`SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`, [], (errTurno, turno) => {
      if (errTurno) return res.status(500).json({ error: 'Erro ao consultar turno.' });
      if (!turno) {
        return res.json({ aberto: false, turno: null, movimentacoes: [], totais: {} });
      }

      db.all(`SELECT * FROM movimentacoes WHERE turno_id = ? ORDER BY id DESC`, [turno.id], (errMov, movs) => {
        if (errMov) return res.status(500).json({ error: 'Erro ao consultar movimentações.' });

        const lista = movs || [];
        let totalEntradas = 0;
        let totalSaidas = 0;
        let totalDinheiro = Number(turno.fundo_troco) || 0;
        const porForma = {};

        lista.forEach(m => {
          const val = Number(m.valor) || 0;
          const tipo = (m.tipo || '').toLowerCase();
          const forma = m.forma_pagamento || 'Outro';

          if (tipo === 'entrada' || tipo === 'reforco' || tipo === 'suprimento') {
            totalEntradas += val;
            porForma[forma] = (porForma[forma] || 0) + val;
            if (forma.toLowerCase().includes('dinheiro')) {
              totalDinheiro += val;
            }
          } else if (tipo === 'saida' || tipo === 'sangria') {
            totalSaidas += val;
            if (forma.toLowerCase().includes('dinheiro')) {
              totalDinheiro -= val;
            }
          }
        });

        res.json({
          aberto: true,
          turno: {
            id: turno.id,
            status: turno.status,
            fundo_troco: Number(turno.fundo_troco) || 0,
            data_abertura: turno.data_abertura
          },
          movimentacoes: lista.slice(0, 50),
          totais: {
            fundo_troco: Number(turno.fundo_troco) || 0,
            entradas: totalEntradas,
            saidas: totalSaidas,
            saldo_dinheiro: totalDinheiro,
            saldo_geral: (Number(turno.fundo_troco) || 0) + totalEntradas - totalSaidas,
            por_forma: porForma
          }
        });
      });
    });
  });
});

// POST /api/retro/caixa/abrir — abrir turno de caixa
app.post('/api/retro/caixa/abrir', (req, res) => {
  const { fundo_troco, operador } = req.body;
  const fundo = parseFloat(String(fundo_troco || '0').replace(',', '.')) || 0;
  const tid = resolveTenantId(req);
  const roomId = (Number.isFinite(tid) && tid > 0) ? `restaurante_${tid}` : null;

  withTenant(req, () => {
    db.get(`SELECT id FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`, [], (err, aberto) => {
      if (aberto) return res.status(400).json({ error: 'Já existe um caixa aberto.' });

      db.run(`INSERT INTO turnos_caixa (status, fundo_troco, data_abertura) VALUES ('Aberto', ?, datetime('now', 'localtime'))`, [fundo], function(errIns) {
        if (errIns) return res.status(500).json({ error: 'Erro ao abrir caixa.' });
        const novoTurnoId = this.lastID;

        if (fundo > 0) {
          db.run(`INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, 'Entrada', ?, 'Dinheiro', ?, datetime('now', 'localtime'))`,
            [novoTurnoId, fundo, `Fundo de Troco Inicial (${operador || 'Caixa Lite'})`]
          );
        }

        if (roomId) io.to(roomId).emit('atualizacao_caixa');
        else io.emit('atualizacao_caixa');

        res.json({ success: true, turnoId: novoTurnoId, message: 'Caixa aberto com sucesso!' });
      });
    });
  });
});

// POST /api/retro/caixa/fechar — fechar turno de caixa
app.post('/api/retro/caixa/fechar', (req, res) => {
  const tid = resolveTenantId(req);
  const roomId = (Number.isFinite(tid) && tid > 0) ? `restaurante_${tid}` : null;

  withTenant(req, () => {
    db.get(`SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`, [], (err, turno) => {
      if (!turno) return res.status(400).json({ error: 'Nenhum caixa aberto para fechar.' });

      db.run(`UPDATE turnos_caixa SET status = 'Fechado', data_fechamento = datetime('now', 'localtime') WHERE id = ?`, [turno.id], function(errUp) {
        if (errUp) return res.status(500).json({ error: 'Erro ao fechar caixa.' });

        if (roomId) io.to(roomId).emit('atualizacao_caixa');
        else io.emit('atualizacao_caixa');

        res.json({ success: true, message: 'Caixa fechado com sucesso!' });
      });
    });
  });
});

// POST /api/retro/caixa/movimentacao — sangria ou reforço/suprimento
app.post('/api/retro/caixa/movimentacao', (req, res) => {
  const { tipo, valor, forma_pagamento, descricao } = req.body;
  const valNum = parseFloat(String(valor || '0').replace(',', '.')) || 0;
  if (valNum <= 0) return res.status(400).json({ error: 'Valor inválido.' });

  const tipoNormalizado = (tipo === 'Sangria' || tipo === 'saida') ? 'Saída' : 'Entrada';
  const tid = resolveTenantId(req);
  const roomId = (Number.isFinite(tid) && tid > 0) ? `restaurante_${tid}` : null;

  withTenant(req, () => {
    db.get(`SELECT id FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`, [], (err, turno) => {
      if (!turno) return res.status(400).json({ error: 'O caixa está fechado.' });

      db.run(`INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [turno.id, tipoNormalizado, valNum, forma_pagamento || 'Dinheiro', descricao || (tipoNormalizado === 'Saída' ? 'Sangria' : 'Suprimento')],
        function(errIns) {
          if (errIns) return res.status(500).json({ error: 'Erro ao registrar movimentação.' });

          if (roomId) io.to(roomId).emit('atualizacao_caixa');
          else io.emit('atualizacao_caixa');

          res.json({ success: true, message: 'Movimentação registrada com sucesso!' });
        }
      );
    });
  });
});

// --- REST API NFC-E ---
app.get('/api/nfce/notas', (req, res) => {
  withTenant(req, () => {
    db.all(`SELECT id, pedido_id, localName, cliente_nome, cpf_cnpj, valor_total, chave_acesso, numero_nota, serie, ambiente, status, protocolo, created_at FROM nfce_notas ORDER BY id DESC`, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });
});

app.get('/api/nfce/danfe/:id', (req, res) => {
  withTenant(req, () => {
    db.get(`SELECT * FROM nfce_notas WHERE id = ?`, [req.params.id], (err, nota) => {
      if (err || !nota) return res.status(404).send('Nota Fiscal não encontrada');
      db.all(`SELECT * FROM configuracoes`, (errCfg, rows) => {
        const config = {};
        if (rows) rows.forEach(r => config[r.chave] = r.valor);
        const danfeHtml = nota.danfe_html || nfceService.gerarDANFEHTML(nota, config);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(danfeHtml);
      });
    });
  });
});

app.get('/api/nfce/xml/:id', (req, res) => {
  withTenant(req, () => {
    db.get(`SELECT * FROM nfce_notas WHERE id = ?`, [req.params.id], (err, nota) => {
      if (err || !nota) return res.status(404).send('Nota Fiscal não encontrada');
      db.all(`SELECT * FROM configuracoes`, (errCfg, rows) => {
        const config = {};
        if (rows) rows.forEach(r => config[r.chave] = r.valor);
        const xml = nota.xml_content || nfceService.gerarXMLNFCe(nota, config);
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename=NFCe_${nota.chave_acesso}.xml`);
        res.send(xml);
      });
    });
  });
});

app.post('/api/nfce/emitir', async (req, res) => {
  withTenant(req, () => {
    db.all(`SELECT * FROM configuracoes`, async (errConfig, configRows) => {
      const config = {};
      if (configRows) configRows.forEach(r => config[r.chave] = r.valor);
      const result = await nfceService.emitirNFCe({ db, ...req.body, config });
      res.json(result);
    });
  });
});

// --- CONFIGS API ---
app.get('/api/server-status', (req, res) => {
  const remoteIp = req.socket.remoteAddress;
  // Allow localhost and local private network subnets (192.168.x.x, 10.x.x.x, 172.16-31.x.x, etc.)
  const isPrivate = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1' ||
    remoteIp.startsWith('192.168.') || remoteIp.startsWith('::ffff:192.168.') ||
    remoteIp.startsWith('10.') || remoteIp.startsWith('::ffff:10.') ||
    remoteIp.startsWith('172.') || remoteIp.startsWith('::ffff:172.');
  if (!isPrivate) {
    return res.status(403).send('Acesso não autorizado.');
  }

  const connections = [];
  activeSockets.forEach(s => {
    connections.push({
      ip: s.ip,
      device: s.device,
      user: s.user
    });
  });

  const protocol = typeof PROTOCOL !== 'undefined' ? PROTOCOL : 'http';

  res.json({
    status: 'rodando',
    protocol: protocol,
    port: PORT,
    ip: getLocalIp(),
    connections: connections,
    logs: logLines
  });
});


// --- API FORMAS DE PAGAMENTO & CARTÕES ---
app.get('/api/formas-pagamento', (req, res) => {
  withTenant(req, () => {
    db.all(`SELECT * FROM formas_pagamento ORDER BY ordem ASC, id ASC`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });
});

app.post('/api/formas-pagamento', (req, res) => {
  const { id, nome, tipo, taxa, prazo_dias, ativo, icone } = req.body || {};
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
  const tid = resolveTenantId(req);

  withTenant(req, () => {
    if (id) {
      db.run(
        `UPDATE formas_pagamento SET nome = ?, tipo = ?, taxa = ?, prazo_dias = ?, ativo = ?, icone = ? WHERE id = ?`,
        [nome, tipo || 'credito', parseFloat(taxa) || 0, parseInt(prazo_dias) || 0, ativo ? 1 : 0, icone || 'ph-credit-card', id],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          broadcastFormasPagamento(null, tid);
          res.json({ success: true, id });
        }
      );
    } else {
      db.run(
        `INSERT INTO formas_pagamento (nome, tipo, taxa, prazo_dias, ativo, icone) VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, tipo || 'credito', parseFloat(taxa) || 0, parseInt(prazo_dias) || 0, ativo !== undefined ? (ativo ? 1 : 0) : 1, icone || 'ph-credit-card'],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          const newId = this.lastID;
          broadcastFormasPagamento(null, tid);
          res.json({ success: true, id: newId });
        }
      );
    }
  });
});

app.post('/api/formas-pagamento/:id/toggle', (req, res) => {
  const { id } = req.params;
  const { ativo } = req.body || {};
  const tid = resolveTenantId(req);
  withTenant(req, () => {
    db.run(`UPDATE formas_pagamento SET ativo = ? WHERE id = ?`, [ativo ? 1 : 0, id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      broadcastFormasPagamento(null, tid);
      res.json({ success: true });
    });
  });
});

app.delete('/api/formas-pagamento/:id', (req, res) => {
  const { id } = req.params;
  const tid = resolveTenantId(req);
  withTenant(req, () => {
    db.get(`SELECT nome FROM formas_pagamento WHERE id = ?`, [id], (err, row) => {
      if (err || !row) return res.status(404).json({ error: 'Forma de pagamento não encontrada.' });
      db.get(`SELECT COUNT(*) as count FROM pedidos WHERE paymentMethod = ?`, [row.nome], (e, r) => {
        if (!e && r && r.count > 0) {
          return res.status(400).json({ error: `"${row.nome}" não pode ser excluído pois já foi utilizado em ${r.count} pedido(s). Apenas desative-o.` });
        }
        db.run(`DELETE FROM formas_pagamento WHERE id = ?`, [id], function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          broadcastFormasPagamento(null, tid);
          res.json({ success: true });
        });
      });
    });
  });
});


// --- API AUDITORIA & LOGS ---
app.get('/api/auditoria', verificarToken, (req, res) => {
  db.all(`SELECT * FROM auditoria ORDER BY id DESC LIMIT 300`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/logs-api', (req, res) => {
  db.all(`SELECT * FROM api_logs ORDER BY id DESC LIMIT 300`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});


// --- API DE GERENCIAMENTO DE DISPOSITIVOS ---
app.get('/api/dispositivos', verificarToken, (req, res) => {
  const deviceList = Array.from(activeSockets.values()).map(d => ({
    ...d,
    tempoConectadoStr: getTempoConectadoStr(d.connectedAt)
  }));
  res.json(deviceList);
});

app.post('/api/dispositivos/:id/renomear', verificarToken, (req, res) => {
  const { id } = req.params;
  const { novoNome } = req.body || {};
  if (!novoNome) return res.status(400).json({ error: 'Nome é obrigatório' });

  const conn = activeSockets.get(id);
  if (conn) {
    conn.model = novoNome.trim();
    conn.device = `${conn.model} (${conn.os} • ${conn.browser})`;
    const targetSocket = io.sockets.sockets.get(id);
    if (targetSocket) {
      targetSocket.emit('apelido_atualizado_remoto', { apelido: novoNome.trim() });
    }
    io.emit('connected_devices_updated');
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Dispositivo não encontrado ou desconectado' });
  }
});

app.post('/api/dispositivos/:id/desconectar', verificarToken, (req, res) => {
  const { id } = req.params;
  const targetSocket = io.sockets.sockets.get(id);
  if (targetSocket) {
    targetSocket.emit('sessao_derrubada_remotamente');
    targetSocket.disconnect(true);
    activeSockets.delete(id);
    io.emit('connected_devices_updated');
    res.json({ success: true });
  } else {
    activeSockets.delete(id);
    res.json({ success: true });
  }
});


// --- ROTA DE PEDIDOS DA FILA ---
app.get('/api/pedidos', verificarToken, (req, res) => {
  db.all("SELECT * FROM pedidos WHERE status NOT IN ('Finalizado','Entregue','Pago','Cancelado') ORDER BY createdAt ASC", [], (err, rows) => {
    res.json(rows || []);
  });
});

// GET /api/metricas/garcons — métricas de eficiência dos garçons (admin do restaurante)
app.get('/api/metricas/garcons', verificarToken, (req, res) => {
  db.all(`SELECT * FROM funcionarios WHERE status = 'Ativo' ORDER BY nome`, [], (errFunc, funcionarios) => {
    if (errFunc) return res.json({ ok: false, erro: 'Erro ao consultar funcionários.' });
    db.all(`SELECT * FROM pedidos ORDER BY id`, [], (errPed, pedidos) => {
      if (errPed) return res.json({ ok: false, erro: 'Erro ao consultar pedidos.' });
      const metricas = (funcionarios || []).map(f => {
        const fPedidos = (pedidos || []).filter(p => p.userName === f.nome || p.userName === f.usuario);
        const total = fPedidos.length;
        const entregues = fPedidos.filter(p => p.status === 'Entregue' || p.status === 'Finalizado' || p.status === 'Pago').length;
        const emAndamento = fPedidos.filter(p => p.status !== 'Entregue' && p.status !== 'Finalizado' && p.status !== 'Pago' && p.status !== 'Cancelado').length;
        let somaMin = 0, countMin = 0;
        fPedidos.forEach(p => {
          if (p.entregueEm && p.createdAt) {
            const criado = new Date(p.createdAt).getTime();
            const entregue = new Date(p.entregueEm).getTime();
            if (!isNaN(criado) && !isNaN(entregue) && entregue > criado) {
              somaMin += (entregue - criado) / 60000;
              countMin++;
            }
          }
        });
        const tempoMedio = countMin > 0 ? Math.round(somaMin / countMin) : null;
        let totalGasto = 0;
        fPedidos.forEach(p => { const val = parseFloat(p.total); if (!isNaN(val)) totalGasto += val; });
        const hoje = new Date();
        const hojeStr = hoje.toISOString().slice(0, 10);
        const pedidosHoje = fPedidos.filter(p => p.createdAt && p.createdAt.slice(0, 10) === hojeStr).length;
        return {
          id: f.id, nome: f.nome, usuario: f.usuario,
          total, entregues, emAndamento,
          taxaEficiencia: total > 0 ? Math.round((entregues / total) * 100) : 0,
          tempoMedioEntrega: tempoMedio,
          totalGasto: Math.round(totalGasto * 100) / 100,
          pedidosHoje
        };
      });
      metricas.sort((a, b) => b.total - a.total);
      res.json({ ok: true, metricas });
    });
  });
});

// --- TEMPLATE + IMPORTAÇÃO DE PRODUTOS ---
const XLSX = require('xlsx');

app.get('/api/qr', (req, res) => {
  const data = String(req.query.data || '').slice(0, 2048);
  if (!data) return res.status(400).send('Missing data');
  const size = Math.min(Math.max(parseInt(req.query.size, 10) || 140, 60), 1000);
  try {
    const qrLib = require('./public/vendor/qrcode/qrcode-generator.js');
    const qr = qrLib(0, 'M');
    qr.addData(data);
    qr.make();
    const cell = Math.max(2, Math.floor(size / qr.getModuleCount()));
    const dataUrl = qr.createDataURL(cell, 4);
    const img = Buffer.from(dataUrl.replace(/^data:image\/gif;base64,/, ''), 'base64');
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store');
    res.send(img);
  } catch (err) {
    res.status(500).send('Erro ao gerar QR');
  }
});

app.get('/api/template-produtos', (req, res) => {
  const headers = ['Categoria', 'Nome', 'Preço', 'Emoji', 'Setor', 'Status Inicial', 'Categoria Fiscal', 'Código de Barras', 'Descrição', 'Preço Custo', 'Unidade', 'Fornecedor', 'Visibilidade'];
  const exemplos = [
    ['Lanches', 'X-Burger', '28.90', '🍔', 'Cozinha 1', 'Em preparo', 'Alimentacao', '', 'Hamburger artesanal', '12.50', 'UN', '', 'todos'],
    ['Bebidas', 'Coca-Cola Lata', '8.00', '🥤', 'Bar', 'Em espera', 'Bebida_Nao_Alcoolica', '7891234567890', 'Refrigerante 350ml', '3.20', 'UN', 'Coca-Cola', 'todos'],
    ['Sobremesas', 'Pudim', '12.00', '🍮', 'Cozinha 1', 'Em preparo', 'Alimentacao', '', 'Pudim de leite', '4.00', 'UN', '', 'todos'],
  ];
  const sheetData = [headers, ...exemplos];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = headers.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=template-produtos.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(Buffer.from(buf));
});

app.post('/api/importar-produtos', verificarToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, erro: 'Nenhum arquivo enviado.' });
  try {
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) return res.json({ ok: false, erro: 'Planilha vazia ou formato inválido.' });
    const COL_MAP = {
      'categoria': 'categoria', 'nome': 'nome', 'preço': 'preco', 'preco': 'preco',
      'emoji': 'emoji', 'setor': 'setor', 'status inicial': 'status_inicial', 'status_inicial': 'status_inicial',
      'categoria fiscal': 'categoria_fiscal', 'categoria_fiscal': 'categoria_fiscal',
      'código de barras': 'codigo_barras', 'codigo_barras': 'codigo_barras', 'codigo_barras': 'codigo_barras',
      'descrição': 'descricao', 'descricao': 'descricao',
      'preço custo': 'preco_custo', 'preco_custo': 'preco_custo',
      'unidade': 'unidade', 'fornecedor': 'fornecedor', 'visibilidade': 'visibilidade'
    };
    const mapped = rows.map(r => {
      const out = {};
      Object.keys(r).forEach(k => {
        const key = COL_MAP[k.toLowerCase().trim()];
        if (key) out[key] = r[k];
      });
      return out;
    }).filter(r => r.nome && String(r.nome).trim());
    if (!mapped.length) return res.json({ ok: false, erro: 'Nenhum produto com nome encontrado na planilha.' });
    let inseridos = 0, erros = 0;
    const insertNext = (i) => {
      if (i >= mapped.length) {
        require('fs').unlinkSync(req.file.path);
        broadcastProdutos();
        return res.json({ ok: true, inseridos, erros, total: mapped.length });
      }
      const p = mapped[i];
      const nome = String(p.nome || '').trim();
      const categoria = String(p.categoria || 'Sem Categoria').trim();
      const preco = parseFloat(String(p.preco || '0').replace(',', '.')) || 0;
      const emoji = String(p.emoji || '').trim();
      const setor = String(p.setor || 'Cozinha 1').trim();
      const status_inicial = String(p.status_inicial || 'Em espera').trim();
      const categoria_fiscal = String(p.categoria_fiscal || 'Alimentacao').trim();
      const codigo_barras = String(p.codigo_barras || '').trim() || null;
      const descricao = String(p.descricao || '').trim();
      const preco_custo = parseFloat(String(p.preco_custo || '0').replace(',', '.')) || 0;
      const unidade = String(p.unidade || 'UN').trim();
      const fornecedor = String(p.fornecedor || '').trim() || null;
      const visibilidade = String(p.visibilidade || 'todos').trim();
      db.run(`INSERT INTO produtos (categoria, nome, preco, emoji, hasAddons, setor, status_inicial, status, categoria_fiscal, descricao, codigo_barras, preco_custo, unidade, fornecedor, visibilidade) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [categoria, nome, preco, emoji, false, setor, status_inicial, 'ativo', categoria_fiscal, descricao, codigo_barras, preco_custo, unidade, fornecedor, visibilidade],
        (err) => { if (err) { erros++; } else { inseridos++; } insertNext(i + 1); });
    };
    insertNext(0);
  } catch (e) {
    require('fs').unlinkSync(req.file.path);
    return res.status(500).json({ ok: false, erro: 'Erro ao processar arquivo: ' + e.message });
  }
});

// --- ROTA REST: ATUALIZAR STATUS DO PEDIDO (para fila-lite) ---
app.post('/api/pedidos/:id/status', verificarToken, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatus = ['Em espera', 'Em preparo', 'Pronto'];
  if (!status || validStatus.indexOf(status) === -1) {
    return res.status(400).json({ error: 'Status inválido. Use: Em espera, Em preparo ou Pronto' });
  }
  const prontoUpdate = (status === 'Pronto') ? ", prontoEm = datetime('now', 'localtime')" : '';
  db.run('UPDATE pedidos SET status = ?' + prontoUpdate + ' WHERE id = ?', [status, id], function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao atualizar status' });
    if (this.changes === 0) return res.status(404).json({ error: 'Pedido não encontrado' });
    db.get('SELECT * FROM pedidos WHERE id = ?', [id], (err2, row) => {
      if (err2 || !row) return res.status(500).json({ error: 'Erro ao buscar pedido' });
      io.emit('status_atualizado', row);
      if (status === 'Pronto') {
        io.emit('pedido_pronto', row);
        sendPush('garcom', '✅ Pedido Pronto!', `${row.quantity || 1}x ${row.productName || 'Item'} — ${row.localName || ''}`.trim(), 'pronto-' + id, '/garcom.html');
        if (iaState && iaState.alertasAtivos) {
          iaState.alertasAtivos.delete('pedido_' + id);
          iaState.alertasAtivos.delete('atencao_' + id);
        }
        if (iaState && iaState.manobrasAtivas) {
          iaState.manobrasAtivas.delete('manobra_' + id);
        }
        io.emit('ia_pedido_resolvido', { pedidoId: id, status: 'Pronto' });
        db.all("SELECT * FROM pedidos WHERE (userName = ? OR userName = 'Chamada') AND status = 'Pronto'", [row.userName], (err3, esteiraRows) => {
          if (esteiraRows) io.emit('esteira_atualizada', esteiraRows);
        });
      }
      broadcastPedidos();
      res.json({ success: true, pedido: row });
    });
  });
});

// --- ROTA REST: CHAMAR GARÇOM (para fila-lite) ---
const chamarTimestampsRest = {};
app.post('/api/pedidos/chamar-garcom', verificarToken, (req, res) => {
  const d = req.body || {};
  const id = d.id || null;
  const productName = d.productName || d.mensagem || 'Garçom chamado';
  const quantity = d.quantity || 1;
  const localName = d.localName || d.nome || 'PDV Mobile';
  const userName = d.userName || 'PDV Mobile';
  const now = Date.now();
  const lastCall = chamarTimestampsRest[id];
  const isReChamado = lastCall && (now - lastCall) < 10000;
  chamarTimestampsRest[id] = now;
  if (!id) {
    const entry = { id: 'pdv_' + now, localName, productName, quantity, userName, tipo: 'pdv', criadoEm: now, status: 'Pronto', targetGarcom: d.targetGarcom || null };
    if (!isReChamado) pdvCalls.push(entry);
    io.emit('notificacao_garcom', Object.assign({}, entry, { reChamado: isReChamado }));
    if (!isReChamado) sendPush('garcom', '🔔 Garçom Chamado!', `${quantity}x ${productName} — ${localName}`, 'chamar-pdv-' + now, '/garcom.html');
    broadcastPedidos();
    res.json({ success: true });
  } else {
    io.emit('notificacao_garcom', { id: id, productName: productName, quantity: quantity, localName: localName, userName: userName, tipo: 'chamada', reChamado: isReChamado, targetGarcom: d.targetGarcom || null });
    if (!isReChamado) {
      sendPush('garcom', '🔔 Garçom Chamado!', `${quantity}x ${productName} — ${localName}`, 'chamar-' + id, '/garcom.html');
      db.run(`UPDATE pedidos SET garcom_call = datetime('now', 'localtime') WHERE id = ?`, [id]);
      broadcastPedidos();
    }
    res.json({ success: true });
  }
});

// (Segurança) Chaves de configuração sensíveis: NUNCA retornadas via GET /api/config.
const CONFIG_SECRET_KEYS = [
  'mp_access_token', 'pagbank_token', 'stone_stonecode', 'sitef_ip',
  'cert_senha', 'csc', 'token_api_fiscal', 'ponto_token', 'jwt_secret',
  'ia_api_key'
];

app.get('/api/config', (req, res) => {
  withTenant(req, () => {
    db.all(`SELECT * FROM configuracoes`, (err, rows) => {
      if (err) return res.status(500).send(err);
      const cfgs = {};
      if (rows) rows.forEach(r => {
        if (CONFIG_SECRET_KEYS.includes(r.chave) && r.valor) {
          cfgs[r.chave] = '***';
        } else {
          cfgs[r.chave] = r.valor;
        }
      });
      res.json(cfgs);
    });
  });
});

app.post('/api/config', verificarToken, (req, res) => {
  const configs = req.body;
  if (!configs) return res.status(400).send('Dados inválidos');

  db.serialize(() => {
    db.run("BEGIN TRANSACTION;");
    Object.keys(configs).forEach(chave => {
      const valor = typeof configs[chave] === 'object' ? JSON.stringify(configs[chave]) : String(configs[chave]);
      // (Segurança) Placeholder "***" enviado pelo painel preserva o valor original do segredo.
      if (CONFIG_SECRET_KEYS.includes(chave) && valor === '***') return;
      db.run(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
    });
    db.run("COMMIT;");
  });

  // Emite para todo mundo que as configurações mudaram (para recarregar menus)
  setTimeout(() => {
    io.emit('configuracoes_atualizadas');
    broadcastProdutos(); // Força envio atualizado com Destaques
    res.json({ success: true });
  }, 500);
});

// ─── INTELIGÊNCIA DE VENDAS & PROMOÇÕES (Gemini) ───
// Config + validação de chave de API, geração de promoções e combos,
// copy para WhatsApp/Instagram e consultoria estratégica.
function lerConfigIa(rows) {
  const keys = {};
  (rows || []).forEach(r => { keys[r.chave] = r.valor; });
  return {
    has_key: !!(keys.ia_api_key && String(keys.ia_api_key).trim()),
    api_key: keys.ia_api_key || '',
    ia_model: keys.ia_model || iaService.DEFAULT_MODEL,
    ia_tom_voz: keys.ia_tom_voz || '',
    ia_ativa: String(keys.ia_ativa || 'true') !== 'false'
  };
}

function enriquecerCardapio(produtos, compras) {
  const compraPorProduto = {};
  (compras || []).forEach(c => {
    if (!c.produto_id) return;
    const v = parseFloat(c.valor_unitario) || 0;
    if (v <= 0) return;
    const lista = compraPorProduto[c.produto_id] || (compraPorProduto[c.produto_id] = []);
    lista.push(v);
  });
  return (produtos || []).map(p => {
    const preco = parseFloat(p.preco) || 0;
    const custo = parseFloat(p.preco_custo) || 0;
    const estoque = (p.estoque !== null && p.estoque !== undefined) ? (parseFloat(p.estoque) || 0) : null;
    const precosCompra = compraPorProduto[p.id] || [];
    const ultimaCompra = precosCompra.length ? precosCompra[precosCompra.length - 1] : null;
    let variacaoCompra = null;
    if (precosCompra.length >= 2) {
      const primeira = precosCompra[0];
      const ultima = precosCompra[precosCompra.length - 1];
      if (primeira > 0) variacaoCompra = Math.round(((ultima - primeira) / primeira) * 100);
    }
    return {
      id: p.id,
      nome: p.nome,
      categoria: p.categoria,
      preco,
      categoria_fiscal: p.categoria_fiscal || 'Alimentacao',
      preco_custo: Math.round(custo * 100) / 100,
      margem_percentual: preco > 0 ? Math.round(((preco - custo) / preco) * 100) : null,
      estoque,
      status_estoque: estoque === null ? 'sem_controle' : (estoque <= 0 ? 'esgotado' : (estoque < 10 ? 'baixo' : 'ok')),
      validade: p.validade || null,
      ultimo_preco_compra: ultimaCompra,
      variacao_preco_compra_90d: variacaoCompra
    };
  });
}

function montarHistoricoVendas(pedidos) {
  const vendas = pedidos || [];
  const mapa = {};
  let receita = 0;
  vendas.forEach(p => {
    const nome = p.productName || '';
    if (!nome || nome.indexOf('Pgto Parcial') !== -1 || nome.indexOf('Pagamento') !== -1 || nome.indexOf('Pgto QR') !== -1) return;
    const qty = parseInt(p.quantity) || 1;
    mapa[nome] = (mapa[nome] || 0) + qty;
    const v = Math.abs(parseFloat(String(p.total || '0').replace(/[R$\s]/g, '').replace(',', '.')) || 0);
    receita += v;
  });
  const maisVendidos = Object.keys(mapa).map(n => ({ produto: n, quantidade: mapa[n] })).sort((a, b) => b.quantidade - a.quantidade).slice(0, 8);
  return {
    total_pedidos: vendas.length,
    receita_total_30d: Math.round(receita * 100) / 100,
    mais_vendidos: maisVendidos
  };
}

app.get('/api/ia/config', (req, res) => {
  withTenant(req, () => {
    db.all(`SELECT chave, valor FROM configuracoes WHERE chave IN ('ia_api_key','ia_model','ia_tom_voz','ia_ativa')`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      const cfg = lerConfigIa(rows);
      const k = cfg.api_key || '';
      res.json({ ok: true, config: { has_key: cfg.has_key, masked_key: cfg.has_key ? '••••' + k.slice(-4) : '', ia_model: cfg.ia_model, ia_tom_voz: cfg.ia_tom_voz, ia_ativa: cfg.ia_ativa } });
    });
  });
});

app.post('/api/ia/config', (req, res) => {
  const payload = req.body || {};
  withTenant(req, () => {
    const valores = {};
    if (payload.ia_model) valores.ia_model = String(payload.ia_model);
    if (payload.ia_tom_voz !== undefined) valores.ia_tom_voz = String(payload.ia_tom_voz);
    if (payload.ia_ativa !== undefined) valores.ia_ativa = payload.ia_ativa ? 'true' : 'false';
    const novaChave = (payload.ia_api_key || '').trim();
    if (novaChave && novaChave.indexOf('••••') === -1) valores.ia_api_key = novaChave;
    if (!Object.keys(valores).length) return res.json({ ok: false, erro: 'Nenhuma configuração para salvar.' });
    db.serialize(() => {
      db.run("BEGIN TRANSACTION;");
      Object.keys(valores).forEach(chave => {
        db.run(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valores[chave]]);
      });
      db.run("COMMIT;", (err) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, mensagem: 'Configuração de IA salva com sucesso!' });
      });
    });
  });
});

app.post('/api/ia/test-key', (req, res) => {
  const body = req.body || {};
  withTenant(req, () => {
    db.all(`SELECT chave, valor FROM configuracoes WHERE chave IN ('ia_api_key','ia_model')`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      const cfg = lerConfigIa(rows);
      const apiKey = (body.apiKey && String(body.apiKey).trim() && String(body.apiKey).indexOf('••••') === -1) ? String(body.apiKey).trim() : cfg.api_key;
      if (!apiKey) return res.json({ ok: false, erro: 'Informe a chave de API do Gemini para testar.' });
      const model = (body.model && String(body.model).trim()) || cfg.ia_model;
      iaService.testarApiKey(apiKey, model).then(resultado => {
        res.json(resultado.ok ? { ok: true, modelo: resultado.modelo } : { ok: false, erro: resultado.erro });
      });
    });
  });
});

app.post('/api/ia/gerar-promocoes', (req, res) => {
  const objetivo = (req.body && req.body.objetivo) || 'Aumentar faturamento e ticket médio';
  withTenant(req, () => {
    db.all(`SELECT chave, valor FROM configuracoes`, [], (eCfg, rows) => {
      if (eCfg) return res.status(500).json({ ok: false, erro: eCfg.message });
      const cfg = lerConfigIa(rows);
      if (!cfg.has_key) {
        return res.json({ ok: false, erro: 'Chave de API do Gemini não configurada. Salve sua chave na aba "Inteligência de Vendas" e depois teste a conexão.' });
      }
      const keys = {};
      (rows || []).forEach(r => { keys[r.chave] = r.valor; });
      const contexto = String(keys.nome_restaurante || '').trim() || 'Restaurante / Bar / Lanchonete padrão';
      db.all(`SELECT id, nome, categoria, preco, categoria_fiscal, estoque, preco_custo, validade FROM produtos WHERE status != 'inativo'`, [], (eP, produtos) => {
        if (eP) return res.status(500).json({ ok: false, erro: eP.message });
        db.all(`SELECT productName, quantity, total FROM pedidos WHERE createdAt >= datetime('now','-30 days')`, [], (eH, pedidos) => {
          if (eH) return res.status(500).json({ ok: false, erro: eH.message });
          db.all(`SELECT ni.produto_id, ni.nome, ni.valor_unitario, nc.data_nota
                  FROM nota_itens ni LEFT JOIN notas_compra nc ON ni.nota_id = nc.id
                  WHERE nc.data_nota >= date('now','-90 days')`, [], (eN, compras) => {
            if (eN) return res.status(500).json({ ok: false, erro: eN.message });
            const cardapioEnriquecido = enriquecerCardapio((produtos || []), (compras || []));
            const historico = montarHistoricoVendas(pedidos || []);
            iaService.gerarPromocoesIA({ apiKey: cfg.api_key, model: cfg.ia_model, contextoRestaurante: contexto, cardapio: cardapioEnriquecido, historicoVendas: historico, comprasRecentes: compras || [], objetivo })
              .then(resultado => res.json({ ok: true, resultado }))
              .catch(err => res.json({ ok: false, erro: err.message }));
          });
        });
      });
    });
  });
});

app.post('/api/ia/aplicar-promocao', (req, res) => {
  const p = req.body || {};
  const titulo = String(p.titulo || '').trim();
  if (!titulo) return res.json({ ok: false, erro: 'Título da promoção obrigatório.' });
  const desconto = Math.round(Math.abs(parseFloat(p.desconto_percentual)) || 0);
  const precoPromo = Math.abs(parseFloat(p.preco)) || 0;
  const envolvidos = Array.isArray(p.produtos_envolvidos) ? p.produtos_envolvidos.filter(Boolean) : [];
  withTenant(req, () => {
    db.all(`SELECT nome FROM produtos WHERE status != 'inativo'`, [], (eP, prods) => {
      const nomes = (prods || []).map(x => x.nome);
      const alvo = envolvidos.find(n => nomes.indexOf(n) !== -1) || (nomes.indexOf(titulo) !== -1 ? titulo : null);
      const regra = alvo ? 'preco_promocional' : 'combo';
      const config = JSON.stringify({
        tipo_promocao: regra,
        titulo,
        produto_alvo_nome: alvo,
        produtos_envolvidos: envolvidos,
        preco_promocional: precoPromo,
        desconto_percentual: desconto
      });
      db.run(`INSERT INTO promocoes (nome, regra, desconto, ativo, config) VALUES (?, ?, ?, 1, ?)`, [titulo, regra, desconto, config], (errIns) => {
        if (errIns) return res.status(500).json({ ok: false, erro: errIns.message });
        db.all(`SELECT * FROM promocoes`, [], (eR, rows) => {
          io.emit('promocoes_atualizadas', rows || []);
          io.emit('configuracoes_atualizadas');
          res.json({ ok: true, mensagem: 'Promoção "' + titulo + '" cadastrada no cardápio!' });
        });
      });
    });
  });
});

app.post('/api/ia/gerar-copy', (req, res) => {
  const body = req.body || {};
  const canal = String(body.canal || 'whatsapp');
  const promocao = String(body.promocao || 'Nossos pratos especiais');
  withTenant(req, () => {
    db.all(`SELECT chave, valor FROM configuracoes WHERE chave IN ('ia_api_key','ia_model','nome_restaurante')`, [], (eCfg, rows) => {
      if (eCfg) return res.status(500).json({ ok: false, erro: eCfg.message });
      const cfg = lerConfigIa(rows);
      if (!cfg.has_key) return res.json({ ok: false, erro: 'Chave de API do Gemini não configurada.' });
      const keys = {};
      (rows || []).forEach(r => { keys[r.chave] = r.valor; });
      db.all(`SELECT id, nome, categoria, preco FROM produtos WHERE status != 'inativo'`, [], (eP, produtos) => {
        if (eP) return res.status(500).json({ ok: false, erro: eP.message });
        iaService.gerarCopyMarketing({ apiKey: cfg.api_key, model: cfg.ia_model, contextoRestaurante: keys.nome_restaurante || '', produtos: (produtos || []).slice(0, 12), promocao, canal })
          .then(resultado => res.json({ ok: true, resultado }))
          .catch(err => res.json({ ok: false, erro: err.message }));
      });
    });
  });
});

app.post('/api/ia/consultor', (req, res) => {
  const body = req.body || {};
  const pergunta = String(body.pergunta || '').trim();
  if (!pergunta) return res.json({ ok: false, erro: 'Digite uma pergunta.' });
  const historico = Array.isArray(body.historico) ? body.historico : [];
  withTenant(req, () => {
    db.all(`SELECT chave, valor FROM configuracoes WHERE chave IN ('ia_api_key','ia_model','nome_restaurante')`, [], (eCfg, rows) => {
      if (eCfg) return res.status(500).json({ ok: false, erro: eCfg.message });
      const cfg = lerConfigIa(rows);
      if (!cfg.has_key) return res.json({ ok: false, erro: 'Chave de API do Gemini não configurada.' });
      const keys = {};
      (rows || []).forEach(r => { keys[r.chave] = r.valor; });
      db.all(`SELECT id, nome, categoria, preco, categoria_fiscal FROM produtos WHERE status != 'inativo'`, [], (eP, produtos) => {
        if (eP) return res.status(500).json({ ok: false, erro: eP.message });
        db.all(`SELECT productName, quantity, total FROM pedidos WHERE createdAt >= datetime('now','-30 days')`, [], (eH, pedidos) => {
          if (eH) return res.status(500).json({ ok: false, erro: eH.message });
          const historicoVendas = montarHistoricoVendas(pedidos || []);
          iaService.consultarAssistenteVendas({ apiKey: cfg.api_key, model: cfg.ia_model, contextoRestaurante: keys.nome_restaurante || '', cardapio: produtos || [], historicoVendas, historicoMensagens: historico, pergunta })
            .then(resultado => res.json({ ok: true, resposta: resultado.resposta }))
            .catch(err => res.json({ ok: false, erro: err.message }));
        });
      });
    });
  });
});

// Pesquisa inteligente do estabelecimento por GPS (set up inicial / deep research)
app.post('/api/ia/pesquisar-estabelecimento-geo', (req, res) => {
  const body = req.body || {};
  const lat = parseFloat(body.lat);
  const lng = parseFloat(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ ok: false, erro: 'Coordenadas inválidas (lat/lng obrigatórios).' });
  }
  withTenant(req, () => {
    db.all(`SELECT chave, valor FROM configuracoes WHERE chave IN ('ia_api_key','ia_model')`, [], (eCfg, rows) => {
      if (eCfg) return res.status(500).json({ ok: false, erro: eCfg.message });
      const cfg = lerConfigIa(rows || []);
      let apiKey = cfg.api_key;
      let model = cfg.ia_model;
      if (!apiKey) {
        masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = 'ia_api_key'`, [], (eG, rowG) => {
          useMasterKey(rowG && rowG.valor);
        });
      } else {
        useMasterKey(apiKey);
      }
      function useMasterKey(globalKey) {
        if (!apiKey && globalKey) apiKey = globalKey;
        if (!model) {
          masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = 'ia_model'`, [], (eMg, rowMg) => {
            iaService.pesquisarEstabelecimentoGeo({ lat, lng, apiKey, model: model || (rowMg && rowMg.valor) })
              .then(resultado => res.json({ ok: resultado.ok, tem_ia: !!apiKey, dados: resultado.dados, erro: resultado.erro }));
          });
        } else {
          iaService.pesquisarEstabelecimentoGeo({ lat, lng, apiKey, model })
            .then(resultado => res.json({ ok: resultado.ok, tem_ia: !!apiKey, dados: resultado.dados, erro: resultado.erro }));
        }
      }
    });
  });
});

// Gera um cupom (QR) promocional de 1 clique a partir de uma sugestão de combo da IA
app.post('/api/ia/cupom-rapido', (req, res) => {
  const p = req.body || {};
  const titulo = String(p.titulo || 'Promo IA').trim().slice(0, 90);
  const precoOrig = Math.abs(parseFloat(p.preco_original) || 0);
  const precoPromo = Math.abs(parseFloat(p.preco_promocional) || 0);
  const valoresDesconto = precoOrig > 0 && precoPromo < precoOrig ? precoOrig - precoPromo : 0;
  const descontoPct = Math.round(Math.abs(parseFloat(p.desconto_percentual) || 0));
  const valorCupom = valoresDesconto > 0 ? Math.round(valoresDesconto * 100) / 100 : (precoPromo || descontoPct);
  const valorTipo = valoresDesconto > 0 ? 'desconto_fixo' : (precoPromo > 0 ? 'preco_fixo' : 'percentual');
  const validadeDias = Math.max(parseInt(p.validade_dias, 10) || 7, 1);
  const produtos = Array.isArray(p.produtos_envolvidos) ? p.produtos_envolvidos.filter(Boolean).slice(0, 12) : [];
  const codigo = ('PROMO-' + String(p.codigo || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) || ('PROMO-' + Math.random().toString(36).substring(2, 8).toUpperCase()));
  withTenant(req, () => {
    const validade = new Date(Date.now() + validadeDias * 86400000).toISOString().slice(0, 10);
    const itens = produtos.map(nome => ({ nome, emoji: '🎁', sector: 'IA', quantity: 1 }));
    db.run(
      `INSERT INTO cupons (codigo, titulo, valor_tipo, valor, validade, limite_usos, itens_json, dias_horarios_json, data_criacao)
       VALUES (?, ?, ?, ?, ?, 1, ?, '{}', datetime('now', 'localtime'))
       ON CONFLICT(codigo) DO NOTHING`,
      [codigo, titulo, valorTipo, valorCupom, validade, JSON.stringify(itens)],
      function (errIns) {
        if (errIns) return res.status(500).json({ ok: false, erro: errIns.message });
        if (this.changes === 0) return res.json({ ok: false, erro: 'Já existe um cupom com o código ' + codigo + '.' });
        io.emit('cupons_atualizados');
        res.json({ ok: true, mensagem: 'Cupom ' + codigo + ' criado com QR Code!', codigo, titulo, valor_tipo: valorTipo, valor: valorCupom });
      });
  });
});

// --- ITENS MONTÁVEIS CRUD ---
app.get('/api/montaveis', verificarToken, (req, res) => {
  withTenant(req, () => {
    db.all(`SELECT m.*, p.nome AS produto_nome, p.emoji AS produto_emoji
            FROM itens_montaveis m LEFT JOIN produtos p ON m.produto_id = p.id
            WHERE m.ativo = 1 ORDER BY m.id DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });
});

app.get('/api/montaveis/:id', verificarToken, (req, res) => {
  const mid = parseInt(req.params.id);
  if (!mid) return res.status(400).json({ error: 'ID inválido' });
  withTenant(req, () => {
    db.get(`SELECT m.*, p.nome AS produto_nome FROM itens_montaveis m LEFT JOIN produtos p ON m.produto_id = p.id WHERE m.id = ?`, [mid], (eM, mRow) => {
      if (eM || !mRow) return res.status(404).json({ error: 'Item não encontrado' });
      db.all(`SELECT * FROM montavel_categorias WHERE montavel_id = ? ORDER BY ordem, id`, [mid], (eC, cats) => {
        const catList = cats || [];
        if (catList.length === 0) return res.json({ ...mRow, categorias: [] });
        const catIds = catList.map(c => c.id);
        const ph = catIds.map(() => '?').join(',');
        db.all(`SELECT * FROM montavel_opcoes WHERE categoria_id IN (${ph}) ORDER BY ordem, id`, catIds, (eO, opts) => {
          const allOpts = opts || [];
          catList.forEach(cat => {
            cat.opcoes = allOpts.filter(o => o.categoria_id === cat.id);
          });
          res.json({ ...mRow, categorias: catList });
        });
      });
    });
  });
});

app.post('/api/montaveis', verificarToken, (req, res) => {
  const { produto_id, pricing_model, preco_fixo, categorias } = req.body || {};
  if (!produto_id) return res.status(400).json({ error: 'produto_id obrigatório' });
  withTenant(req, () => {
    db.run(`INSERT INTO itens_montaveis (produto_id, pricing_model, preco_fixo) VALUES (?, ?, ?)`,
      [produto_id, pricing_model || 'soma', preco_fixo || 0], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const mid = this.lastID;
        insertCategorias(mid, categorias || [], () => {
          res.json({ success: true, id: mid });
        });
      });
  });
});

app.put('/api/montaveis/:id', verificarToken, (req, res) => {
  const mid = parseInt(req.params.id);
  if (!mid) return res.status(400).json({ error: 'ID inválido' });
  const { produto_id, pricing_model, preco_fixo, categorias } = req.body || {};
  withTenant(req, () => {
    db.run(`UPDATE itens_montaveis SET produto_id = ?, pricing_model = ?, preco_fixo = ? WHERE id = ?`,
      [produto_id, pricing_model || 'soma', preco_fixo || 0, mid], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`DELETE FROM montavel_opcoes WHERE categoria_id IN (SELECT id FROM montavel_categorias WHERE montavel_id = ?)`, [mid], () => {
          db.run(`DELETE FROM montavel_categorias WHERE montavel_id = ?`, [mid], () => {
            insertCategorias(mid, categorias || [], () => {
              res.json({ success: true });
            });
          });
        });
      });
  });
});

app.delete('/api/montaveis/:id', verificarToken, (req, res) => {
  const mid = parseInt(req.params.id);
  if (!mid) return res.status(400).json({ error: 'ID inválido' });
  withTenant(req, () => {
    db.run(`DELETE FROM montavel_opcoes WHERE categoria_id IN (SELECT id FROM montavel_categorias WHERE montavel_id = ?)`, [mid], () => {
      db.run(`DELETE FROM montavel_categorias WHERE montavel_id = ?`, [mid], () => {
        db.run(`DELETE FROM itens_montaveis WHERE id = ?`, [mid], (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ success: true });
        });
      });
    });
  });
});

function resolverOpcoesVinculadas(opts, done) {
  const lista = opts || [];
  const comVinculo = lista.filter(o => o.produto_id);
  if (!comVinculo.length) return done(lista);
  db.all(`SELECT id, nome, preco, emoji, visibilidade FROM produtos`, [], (eP, prods) => {
    if (eP) return done(lista);
    const mapa = {};
    (prods || []).forEach(p => { mapa[p.id] = p; });
    lista.forEach(o => {
      if (o.produto_id && mapa[o.produto_id]) {
        o.nome = mapa[o.produto_id].nome;
        o.preco = Number(mapa[o.produto_id].preco) || 0;
        o.emoji_vinculado = mapa[o.produto_id].emoji || null;
        o.vinculado = true;
      } else if (o.produto_id) {
        o.vinculo_quebrado = true;
      }
    });
    done(lista);
  });
}

function insertCategorias(montavelId, cats, done) {
  if (!cats.length) return done();
  let pending = cats.length;
  cats.forEach((cat, ci) => {
    db.run(`INSERT INTO montavel_categorias (montavel_id, nome, obrigatoria, min_escolhas, max_escolhas, ordem) VALUES (?, ?, ?, ?, ?, ?)`,
      [montavelId, cat.nome || '', cat.obrigatoria ? 1 : 0, cat.min_escolhas || 0, cat.max_escolhas || 1, ci], function (err) {
        if (err || !cat.opcoes || !cat.opcoes.length) { if (--pending === 0) done(); return; }
        const catId = this.lastID;
        let optPending = cat.opcoes.length;
        cat.opcoes.forEach((opt, oi) => {
          db.run(`INSERT INTO montavel_opcoes (categoria_id, nome, preco, ativo, ordem, produto_id) VALUES (?, ?, ?, ?, ?, ?)`,
            [catId, opt.nome || '', Number(opt.preco) || 0, opt.ativo !== undefined ? (opt.ativo ? 1 : 0) : 1, oi, opt.produto_id || null], () => {
              if (--optPending === 0 && --pending === 0) done();
            });
        });
      });
  });
}

// Buscar config de montável para um produto específico
app.get('/api/montaveis/produto/:produtoId', verificarToken, (req, res) => {
  const pid = parseInt(req.params.produtoId);
  if (!pid) return res.status(400).json({ error: 'ID inválido' });
  withTenant(req, () => {
    db.get(`SELECT * FROM itens_montaveis WHERE produto_id = ? AND ativo = 1`, [pid], (eM, mRow) => {
      if (eM || !mRow) return res.json(null);
      const mid = mRow.id;
      db.all(`SELECT * FROM montavel_categorias WHERE montavel_id = ? ORDER BY ordem, id`, [mid], (eC, cats) => {
        const catList = cats || [];
        if (catList.length === 0) return res.json({ ...mRow, categorias: [] });
        const catIds = catList.map(c => c.id);
        const ph = catIds.map(() => '?').join(',');
        db.all(`SELECT * FROM montavel_opcoes WHERE categoria_id IN (${ph}) AND ativo = 1 ORDER BY ordem, id`, catIds, (eO, opts) => {
          resolverOpcoesVinculadas(opts || [], (allOpts) => {
            catList.forEach(cat => {
              cat.opcoes = allOpts.filter(o => o.categoria_id === cat.id);
            });
            res.json({ ...mRow, categorias: catList });
          });
        });
      });
    });
  });
});

// --- ENDPOINT TESTE DE CONEXÃO COM MAQUININHA ---
app.post('/api/maquininha/testar', (req, res) => {
  const { provedor } = req.body || {};
  if (!provedor || provedor === 'none') {
    return res.json({ ok: false, msg: 'Nenhum provedor selecionado.' });
  }
  withTenant(req, () => {
    db.all(`SELECT * FROM configuracoes`, async (err, rows) => {
    if (err) return res.json({ ok: false, msg: 'Erro ao carregar configurações.' });
    const config = {};
    if (rows) rows.forEach(r => config[r.chave] = r.valor);
    try {
      if (provedor === 'mercadopago') {
        const token = config.mp_access_token;
        const deviceId = config.mp_device_id;
        if (!token || !deviceId) return res.json({ ok: false, msg: 'Access Token ou Device ID não configurados.' });
        const response = await fetch(`https://api.mercadopago.com/point/integration-api/devices/${deviceId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          return res.json({ ok: true, msg: `Mercado Pago OK — Device: ${data.id || deviceId} | Modo: ${data.operating_mode || 'online'}` });
        } else {
          const errData = await response.json().catch(() => ({}));
          return res.json({ ok: false, msg: `Mercado Pago: ${errData.message || 'HTTP ' + response.status}` });
        }
      }
      if (provedor === 'stone') {
        const stonePorta = config.stone_porta || '8080';
        const stoneCode = config.stone_stonecode;
        if (!stoneCode) return res.json({ ok: false, msg: 'Stone Code não configurado.' });
        const response = await fetch(`http://localhost:${stonePorta}/health`, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          return res.json({ ok: true, msg: `Stone Client TEF respondeu na porta ${stonePorta}. Stone Code: ${stoneCode}` });
        } else {
          return res.json({ ok: false, msg: `Stone Client respondeu com HTTP ${response.status}` });
        }
      }
      if (provedor === 'pagbank') {
        const pgToken = config.pagbank_token;
        const pgTerminal = config.pagbank_terminal;
        if (!pgToken) return res.json({ ok: false, msg: 'Token PagBank não configurado.' });
        const response = await fetch(`https://api.pagseguro.com/terminal/v1/terminals/${pgTerminal || ''}`, {
          headers: { 'Authorization': `Bearer ${pgToken}` }
        });
        if (response.ok) {
          const data = await response.json();
          return res.json({ ok: true, msg: `PagBank OK — Terminal: ${data.id || pgTerminal} | Status: ${data.status || 'online'}` });
        } else {
          const errData = await response.json().catch(() => ({}));
          return res.json({ ok: false, msg: `PagBank: ${errData.message || errData.error || 'HTTP ' + response.status}` });
        }
      }
      if (provedor === 'sitef') {
        const sitefIp = config.sitef_ip;
        const sitefPorta = parseInt(config.sitef_porta || '4096');
        if (!sitefIp) return res.json({ ok: false, msg: 'IP do servidor SiTef não configurado.' });
        const net = require('net');
        await new Promise((resolve) => {
          const socket = new net.Socket();
          socket.setTimeout(5000);
          socket.connect(sitefPorta, sitefIp, () => {
            socket.destroy();
            res.json({ ok: true, msg: `SiTef: conexão TCP OK com ${sitefIp}:${sitefPorta}` });
            resolve();
          });
          socket.on('timeout', () => { socket.destroy(); res.json({ ok: false, msg: `SiTef: timeout ao conectar em ${sitefIp}:${sitefPorta}` }); resolve(); });
          socket.on('error', (err) => { res.json({ ok: false, msg: `SiTef: ${err.message}` }); resolve(); });
        });
        return;
      }
      return res.json({ ok: false, msg: `Provedor desconhecido: ${provedor}` });
    } catch (e) {
      return res.json({ ok: false, msg: `Erro ao testar: ${e.message}` });
    }
    });
  });
});

// --- BACKUP & RESTORE API ---
app.get('/api/backup', verificarToken, (req, res) => {
  const tenantDbPath = getTenantDbPath(req.restaurante_id);
  res.download(tenantDbPath, 'backup.sqlite', (err) => {
    if (err) {
      console.error("Erro no download do backup:", err);
      if (!res.headersSent) {
        res.status(500).send("Erro ao gerar backup: " + err.message);
      }
    }
  });
});

app.post('/api/restore', verificarToken, upload.single('backup'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado.' });
  }

  const tenantDbPath = getTenantDbPath(req.restaurante_id);
  const tempFilePath = req.file.path;
  const testDb = new sqlite3.Database(tempFilePath, sqlite3.OPEN_READONLY, (testErr) => {
    if (testErr) {
      console.error("Arquivo de backup inválido (sqlite open):", testErr);
      try { fs.unlinkSync(tempFilePath); } catch (e) { }
      return res.json({ success: false, error: 'O arquivo enviado não é um banco de dados SQLite válido.' });
    }

    testDb.get("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1", [], (queryErr, row) => {
      testDb.close();

      if (queryErr) {
        console.error("Arquivo de backup inválido (sqlite query):", queryErr);
        try { fs.unlinkSync(tempFilePath); } catch (e) { }
        return res.json({ success: false, error: 'O arquivo de banco de dados enviado está corrompido ou é inválido.' });
      }

      // Proceder com a restauração
      db.close((closeErr) => {
        if (closeErr) {
          console.error("Erro ao fechar o banco de dados para restore:", closeErr);
          try { fs.unlinkSync(tempFilePath); } catch (e) { }
          return res.json({ success: false, error: 'Erro ao fechar banco de dados atual.' });
        }

        try {
          fs.copyFileSync(tempFilePath, tenantDbPath);
          try { fs.unlinkSync(tempFilePath); } catch (e) { }

          // Reabrir conexão com o banco restaurado apenas para testes
          const checkDb = new sqlite3.Database(tenantDbPath, (openErr) => {
            if (openErr) {
              console.error("Erro ao abrir banco restaurado:", openErr);
              return res.json({ success: false, error: 'Erro ao conectar ao banco restaurado.' });
            }
            checkDb.close();

            console.log("Banco de dados restaurado com sucesso!");

            // Emitir notificações para atualizar os clientes
            io.emit('configuracoes_atualizadas');
            db.all(`SELECT * FROM produtos`, (errProd, pRows) => {
              if (!errProd) io.emit('produtos_atualizados', pRows || []);
            });
            db.all(`SELECT * FROM mesas`, (errMesa, mRows) => {
              if (!errMesa) io.emit('mesas_atualizadas', mRows || []);
            });

            res.json({ success: true });
          });
        } catch (copyErr) {
          console.error("Erro ao copiar arquivo restaurado:", copyErr);
          try { fs.unlinkSync(tempFilePath); } catch (e) { }
          res.json({ success: false, error: 'Erro de E/S ao substituir o banco de dados.' });
        }
      });
    });
  });
});
let PORT = 3000;
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}
let pontoToken = Math.random().toString(36).substring(2, 10);
setInterval(() => {
  pontoToken = Math.random().toString(36).substring(2, 10);
  const ipLocal = getLocalIp();
  for (const s of io.sockets.sockets.values()) {
    const tid = s.restaurante_id || 1;
    const base = `painel-funcionario.html?t=${pontoToken}&restaurante_id=${tid}`;
    masterDb.get(`SELECT custom_domain, slug FROM restaurantes WHERE id = ?`, [tid], (eM, row) => {
      let domain, usePort = false;
      if (row && row.custom_domain && row.custom_domain.trim()) {
        domain = row.custom_domain.trim();
      } else if (row && row.slug && BASE_DOMAIN) {
        domain = `${row.slug}.${BASE_DOMAIN}`;
      } else {
        domain = ipLocal;
        usePort = true;
      }
      const hostPort = usePort ? `${domain}:${PORT}` : domain;
      s.emit('update_ponto_token', { url: `https://${hostPort}/${base}` });
    });
  }
}, 30000);

const HOST = '0.0.0.0';


// --- ADMIN RH ENDPOINTS ---
function registerAdminRhEvents(socket) {
  socket.on('get_rh_data', () => {
    const valesQuery = "SELECT v.*, f.nome as funcionario_nome FROM vales v JOIN funcionarios f ON v.funcionario_id = f.id ORDER BY v.data_pedido DESC";
    const pontosQuery = "SELECT p.*, f.nome as funcionario_nome FROM pontos p JOIN funcionarios f ON p.funcionario_id = f.id ORDER BY p.entrada DESC";
    const loginsQuery = "SELECT * FROM historico_logins ORDER BY data_hora DESC LIMIT 100";
    const funcQuery = "SELECT id, nome, cargo FROM funcionarios WHERE status = 'Ativo'";
    const pedidosQuery = "SELECT userName, total, status FROM pedidos";
    const pagamentosQuery = "SELECT p.*, f.nome as funcionario_nome FROM funcionarios_pagamentos p JOIN funcionarios f ON p.funcionario_id = f.id ORDER BY p.data_pagamento DESC";

    db.all(valesQuery, (errV, vales) => {
      db.all(pontosQuery, (errP, pontos) => {
        db.all(loginsQuery, (errL, logins) => {
          db.all(funcQuery, (errF, funcs) => {
            db.all(pedidosQuery, (errPed, allPedidos) => {
              db.all(pagamentosQuery, (errPag, pagamentos) => {
                // Calculate metrics for each active employee
                const metrics = (funcs || []).map(f => {
                  const employeePontos = (pontos || []).filter(p => p.funcionario_id === f.id);
                  const totalHours = employeePontos.reduce((acc, p) => acc + (p.total_horas || 0), 0);

                  const employeePedidos = (allPedidos || []).filter(p => p.userName === f.nome);
                  const totalOrders = employeePedidos.length;
                  const totalSales = employeePedidos
                    .filter(p => p.status !== 'Cancelado')
                    .reduce((acc, p) => acc + (parseFloat(String(p.total).replace(',', '.')) || 0), 0);

                  return {
                    id: f.id,
                    nome: f.nome,
                    cargo: f.cargo,
                    horas_trabalhadas: totalHours,
                    total_pedidos: totalOrders,
                    total_vendas: totalSales,
                    produtividade: totalHours > 0 ? (totalOrders / totalHours) : 0
                  };
                });

                socket.emit('rh_data', {
                  vales: vales || [],
                  pontos: pontos || [],
                  logins: logins || [],
                  pagamentos: pagamentos || [],
                  metrics: metrics
                });
              }); // closes pagamentos
            }); // closes pedidos
          }); // closes func
        }); // closes logins
      }); // closes pontos
    }); // closes vales
  }); // closes socket.on

  socket.on('aprovar_vale', (data) => {
    const { valeId, lancarCaixa, operador } = data;
    db.get("SELECT * FROM vales WHERE id = ?", [valeId], (err, vale) => {
      if (vale && vale.status === 'Pendente') {
        db.run("UPDATE vales SET status = 'Aprovado', data_aprovacao = datetime('now', 'localtime') WHERE id = ?", [valeId], (errU) => {
          if (!errU) {
            if (lancarCaixa) {
              // Gerar saída no caixa
              db.get("SELECT id FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1", (errC, turno) => {
                if (turno) {
                  db.run(
                    "INSERT INTO movimentacoes (turno_id, tipo, valor, descricao, data, forma_pagamento) VALUES (?, 'saida', ?, ?, datetime('now', 'localtime'), 'Dinheiro')",
                    [turno.id, vale.valor, "Adiantamento/Vale - Func. ID " + vale.funcionario_id]
                  );
                }
              });
            }
            global.registrarAuditoria(data.operador || 'Admin', 'APROVAR_VALE', `Vale ${valeId} aprovado (R$ ${vale.valor.toFixed(2)})`, 'RH e Pagamentos', 'ALTO');
            // Emit update to all
            io.emit('rh_update');
            io.emit('vale_solicitado_success'); // To trigger refresh on employee panel
          }
        });
      }
    });
  });

  socket.on('recusar_vale', (data) => {
    const valeId = (typeof data === 'object') ? data.id : data;
    const op = (typeof data === 'object') ? data.operador : 'Admin';
    db.run("UPDATE vales SET status = 'Recusado' WHERE id = ?", [valeId], (err) => {
      if (!err) {
        global.registrarAuditoria(op || 'Admin', 'RECUSAR_VALE', `Vale ${valeId} recusado`, 'RH e Pagamentos', 'MEDIO');
        io.emit('rh_update');
        io.emit('vale_solicitado_success');
      }
    });
  });

  socket.on('pagar_ponto', (data) => {
    const pontoId = (typeof data === 'object') ? data.id : data;
    const op = (typeof data === 'object') ? data.operador : 'Admin';
    db.run("UPDATE pontos SET pago = 1 WHERE id = ?", [pontoId], (err) => {
      if (!err) {
        global.registrarAuditoria(op || 'Admin', 'PAGAR_PONTO', `Ponto pago (ID: ${pontoId})`, 'RH e Pagamentos', 'MEDIO');
        io.emit('rh_update');
        io.emit('ponto_registrado', { acao: 'pagamento' }); // to trigger refresh if needed
      }
    });
  });

  // === REGISTRAR PAGAMENTO RÁPIDO COLABORADOR ===
  socket.on('registrar_pagamento_colaborador', (data) => {
    const { funcionario_id, funcionario_nome, valor_bruto, valor_liquido, observacao } = data;
    if (!funcionario_id || !valor_bruto) return;

    const dataPagamento = getLocalTimestamp();

    db.run(
      `INSERT INTO funcionarios_pagamentos (funcionario_id, data_pagamento, valor_bruto, total_vales_abatidos, total_consumo_abatido, valor_liquido, observacao) VALUES (?, ?, ?, 0, 0, ?, ?)`,
      [funcionario_id, dataPagamento, valor_bruto, valor_liquido || valor_bruto, observacao || ''],
      function (err) {
        if (err) {
          console.error('Erro ao registrar pagamento rápido:', err);
          return;
        }
        const pagId = this.lastID;

        global.registrarAuditoria('Admin', 'PAGAMENTO_COLABORADOR', `Pagamento de R$ ${(valor_liquido || valor_bruto).toFixed(2)} para ${funcionario_nome} (ID: ${funcionario_id})`, 'RH e Pagamentos', 'ALTO');

        io.emit('rh_update');

        // Broadcast celebration to ALL connected clients
        io.emit('pagamento_colaborador_celebracao', {
          funcionario_id,
          funcionario_nome,
          valor: valor_liquido || valor_bruto,
          data_pagamento: dataPagamento,
          observacao: observacao || '',
          pagamento_id: pagId
        });
      }
    );
  });

  socket.on('get_report_filters', () => {
    const filtersData = {
      garcons: [],
      clientes: [],
      locais: []
    };

    db.all(`SELECT DISTINCT userName FROM pedidos WHERE userName IS NOT NULL AND userName != '' ORDER BY userName`, [], (err, rowsG) => {
      if (!err && rowsG) filtersData.garcons = rowsG.map(r => r.userName);

      db.all(`SELECT id, nome FROM clientes ORDER BY nome`, [], (err, rowsC) => {
        if (!err && rowsC) filtersData.clientes = rowsC.map(r => ({ id: r.id, nome: r.nome }));

        db.all(`SELECT DISTINCT localName FROM pedidos WHERE localName IS NOT NULL AND localName != '' ORDER BY localName`, [], (err, rowsL) => {
          if (!err && rowsL) filtersData.locais = rowsL.map(r => r.localName);

          socket.emit('report_filters_data', filtersData);
        });
      });
    });
  });

  socket.on('get_advanced_relatorio', async ({ startDate, endDate, groupBy, clientFilter, waiterFilter, localFilter }) => {
    try {
      const startStr = startDate ? startDate + ' 00:00:00' : '1970-01-01 00:00:00';
      const endStr = endDate ? endDate + ' 23:59:59' : '2099-12-31 23:59:59';

      const clientVal = clientFilter ? clientFilter : null;
      const waiterVal = waiterFilter ? `%${waiterFilter}%` : null;
      const localVal = localFilter ? `%${localFilter}%` : null;

      const pAll = (sql, params) => new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err ? [] : rows)));
      const pGet = (sql, params) => new Promise((resolve) => db.get(sql, params, (err, row) => resolve(err ? null : row)));

      const stdParams = [
        startStr, endStr,
        clientVal, clientVal, clientVal ? `%${clientVal}%` : null,
        waiterVal, waiterVal,
        localVal, localVal
      ];

      // 1. Sold Items
      const soldItemsQuery = `
        SELECT
          p.productName,
          SUM(p.quantity) AS qty,
          SUM(CAST(p.total AS REAL)) AS valTotal
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status != 'Cancelado'
          AND p.productName NOT LIKE 'Pgto Parcial%'
          AND CAST(p.total AS REAL) >= 0
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        GROUP BY p.productName
        ORDER BY valTotal DESC
        LIMIT 150
      `;

      // 2. Orders Detail
      const ordersQuery = `
        SELECT
          p.id,
          p.productName,
          p.quantity,
          p.total,
          p.status,
          p.localName,
          p.userName,
          p.createdAt,
          p.paymentMethod,
          c.nome AS clientName
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.productName NOT LIKE 'Pgto Parcial%'
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        ORDER BY p.id DESC
      `;

      // 3. Sales Period Trend (Chart)
      let groupFormat = '%Y-%m-%d';
      if (groupBy === 'hour') groupFormat = '%Y-%m-%d %H:00';
      else if (groupBy === 'week') groupFormat = '%Y-W%W';
      else if (groupBy === 'month') groupFormat = '%Y-%m';
      else if (groupBy === 'year') groupFormat = '%Y';

      const periodQuery = `
        SELECT
          strftime(?, p.createdAt) AS period,
          SUM(p.quantity) AS qty_total,
          SUM(CAST(p.total AS REAL)) AS val_total,
          COUNT(DISTINCT (p.createdAt || '-' || p.localName)) AS orders_count
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status IN ('Finalizado', 'Pago')
          AND p.productName NOT LIKE 'Pgto Parcial%'
          AND CAST(p.total AS REAL) >= 0
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        GROUP BY period
        ORDER BY period ASC
      `;

      // 4. Payment Methods Global (from transactions)
      const pmGlobalQuery = `
        SELECT forma_pagamento, SUM(valor) AS total
        FROM movimentacoes
        WHERE tipo = 'Entrada'
          AND data >= ? AND data <= ?
          AND (? IS NULL OR (descricao LIKE ? OR descricao LIKE ?))
        GROUP BY forma_pagamento
      `;
      const pmGlobalParams = [
        startStr, endStr,
        localFilter ? 1 : null, localVal, localVal
      ];

      // 5. Payment Methods Filtered (from orders)
      const pmFilteredQuery = `
        SELECT
          CASE
            WHEN p.paymentMethod IS NULL OR p.paymentMethod = '' THEN 'Não Definido'
            ELSE p.paymentMethod
          END AS metodo,
          SUM(CAST(p.total AS REAL)) AS total
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status IN ('Finalizado', 'Pago')
          AND p.productName NOT LIKE 'Pgto Parcial%'
          AND CAST(p.total AS REAL) >= 0
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        GROUP BY metodo
      `;

      // 6. KPIs
      const kpiQuery = `
        SELECT
          SUM(CAST(p.total AS REAL)) AS totalSales,
          SUM(p.quantity) AS totalItems,
          COUNT(DISTINCT (p.createdAt || '-' || p.localName)) AS totalOrders
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status IN ('Finalizado', 'Pago')
          AND p.productName NOT LIKE 'Pgto Parcial%'
          AND CAST(p.total AS REAL) >= 0
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
      `;

      // 7. Category Sales
      const categorySalesQuery = `
        SELECT
          COALESCE(pr.categoria, 'Outros') AS categoria,
          SUM(p.quantity) AS qty,
          SUM(CAST(p.total AS REAL)) AS valTotal
        FROM pedidos p
        LEFT JOIN produtos pr ON p.productName = pr.nome
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status IN ('Finalizado', 'Pago')
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        GROUP BY categoria
        ORDER BY valTotal DESC
      `;

      // 8. Sector Sales
      const sectorSalesQuery = `
        SELECT
          COALESCE(p.sector, 'Outros') AS setor,
          SUM(p.quantity) AS qty,
          SUM(CAST(p.total AS REAL)) AS valTotal
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status IN ('Finalizado', 'Pago')
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        GROUP BY setor
        ORDER BY valTotal DESC
      `;

      // 9. Cancellation Stats
      const cancellationQuery = `
        SELECT
          COUNT(DISTINCT (p.createdAt || '-' || p.localName)) AS totalOrders,
          SUM(p.quantity) AS totalItems,
          SUM(CAST(p.total AS REAL)) AS totalLosses
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status = 'Cancelado'
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
      `;

      // 10. Waiter Ranking
      const waiterRankingQuery = `
        SELECT
          p.userName AS garcom,
          COUNT(DISTINCT (p.createdAt || '-' || p.localName)) AS totalOrders,
          SUM(CAST(p.total AS REAL)) AS totalSales
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status IN ('Finalizado', 'Pago')
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        GROUP BY garcom
        ORDER BY totalSales DESC
      `;

      // 11. Client Ranking
      const clientRankingQuery = `
        SELECT
          COALESCE(c.nome, 'Cliente Avulso') AS cliente,
          COUNT(DISTINCT (p.createdAt || '-' || p.localName)) AS totalOrders,
          SUM(CAST(p.total AS REAL)) AS totalSales
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.createdAt >= ? AND p.createdAt <= ?
          AND p.status IN ('Finalizado', 'Pago')
          AND (? IS NULL OR p.cliente_id = ? OR c.nome LIKE ?)
          AND (? IS NULL OR p.userName LIKE ?)
          AND (? IS NULL OR p.localName LIKE ?)
        GROUP BY cliente
        ORDER BY totalSales DESC
        LIMIT 10
      `;

      // Execute all queries concurrently
      const [
        soldItems,
        orders,
        periodSales,
        paymentMethodsGlobal,
        paymentMethodsFiltered,
        rowKpi,
        categorySales,
        sectorSales,
        cancellationStats,
        waiterRanking,
        clientRanking
      ] = await Promise.all([
        pAll(soldItemsQuery, stdParams),
        pAll(ordersQuery, stdParams),
        pAll(periodQuery, [groupFormat, ...stdParams.slice(1)]),
        pAll(pmGlobalQuery, pmGlobalParams),
        pAll(pmFilteredQuery, stdParams),
        pGet(kpiQuery, stdParams),
        pAll(categorySalesQuery, stdParams),
        pAll(sectorSalesQuery, stdParams),
        pGet(cancellationQuery, stdParams),
        pAll(waiterRankingQuery, stdParams),
        pAll(clientRankingQuery, stdParams)
      ]);

      const response = {
        kpi: {
          totalSales: rowKpi ? (rowKpi.totalSales || 0) : 0,
          totalItems: rowKpi ? (rowKpi.totalItems || 0) : 0,
          totalOrders: rowKpi ? (rowKpi.totalOrders || 0) : 0,
          ticketMedio: (rowKpi && rowKpi.totalOrders > 0) ? (rowKpi.totalSales / rowKpi.totalOrders) : 0
        },
        periodSales,
        paymentMethodsGlobal,
        paymentMethodsFiltered,
        soldItems,
        orders,
        categorySales,
        sectorSales,
        cancellationStats: {
          totalOrders: cancellationStats ? (cancellationStats.totalOrders || 0) : 0,
          totalItems: cancellationStats ? (cancellationStats.totalItems || 0) : 0,
          totalLosses: cancellationStats ? (cancellationStats.totalLosses || 0) : 0
        },
        waiterRanking,
        clientRanking
      };

      socket.emit('advanced_relatorio_data', response);
    } catch (e) {
      console.error('Erro ao gerar relatório avançado:', e);
      socket.emit('advanced_relatorio_error', 'Ocorreu um erro ao processar o relatório.');
    }
  });

  // Dias Atipicos - Admin list
  socket.on('get_dias_atipicos', (filtro) => {
    let query = `SELECT d.*, f.nome as funcionario_nome FROM dias_atipicos d JOIN funcionarios f ON f.id = d.funcionario_id`;
    const params = [];
    const where = [];
    if (filtro && filtro.status) {
      where.push('d.status = ?');
      params.push(filtro.status);
    }
    if (filtro && filtro.funcionario_id) {
      where.push('d.funcionario_id = ?');
      params.push(filtro.funcionario_id);
    }
    if (where.length) query += ' WHERE ' + where.join(' AND ');
    query += ' ORDER BY d.data DESC';
    db.all(query, params, (err, rows) => {
      socket.emit('dias_atipicos_list', rows || []);
    });
  });

  // Admin criar/salvar dia atipico
  socket.on('salvar_dia_atipico', ({ id, funcionario_id, data, valor, justificativa, status }) => {
    if (!isValidId(funcionario_id) && !id) return;
    const agora = getLocalTimestamp();
    if (id) {
      db.run(`UPDATE dias_atipicos SET data = ?, valor = ?, justificativa = ?, status = ? WHERE id = ?`,
        [data, safeFloat(valor, 0, 99999), justificativa || '', status || 'pendente', id], () => {
          socket.emit('dia_atipico_salvo');
        });
    } else {
      db.run(`INSERT INTO dias_atipicos (funcionario_id, data, valor, justificativa, status, created_at) VALUES (?, ?, ?, ?, 'pendente', ?)`,
        [funcionario_id, data, safeFloat(valor, 0, 99999), justificativa || '', agora], function (err) {
          if (!err) socket.emit('dia_atipico_salvo');
        });
    }
  });

  // Admin aprovar/recusar dia atipico / extra
  socket.on('aprovar_dia_atipico', ({ id, forma_pagamento }) => {
    const atipicoId = typeof id === 'object' ? id.id : id;
    const fp = typeof id === 'object' ? (id.forma_pagamento || forma_pagamento) : (forma_pagamento || 'proximo_pagamento');
    if (!isValidId(atipicoId)) return;
    db.run(`UPDATE dias_atipicos SET status = 'aprovado', forma_pagamento = ? WHERE id = ?`, [fp, atipicoId], () => {
      socket.emit('dia_atipico_atualizado');
    });
  });
  socket.on('recusar_dia_atipico', (id) => {
    const atipicoId = typeof id === 'object' ? id.id : id;
    if (!isValidId(atipicoId)) return;
    db.run(`UPDATE dias_atipicos SET status = 'recusado' WHERE id = ?`, [atipicoId], () => {
      socket.emit('dia_atipico_atualizado');
    });
  });

  // Consumo do funcionario - Configuracao (admin)
  socket.on('get_consumo_config', () => {
    db.all(`SELECT c.*, p.nome as produto_nome, p.preco as produto_preco, p.emoji, p.categoria
      FROM funcionario_consumo_config c
      JOIN produtos p ON p.id = c.produto_id
      ORDER BY p.categoria, p.nome`, (err, configs) => {
      db.all(`SELECT id, nome, categoria, preco, emoji FROM produtos WHERE status = 'ativo' ORDER BY categoria, nome`, (err2, produtos) => {
        socket.emit('consumo_config_data', { configs: configs || [], produtos: produtos || [] });
      });
    });
  });

  socket.on('save_consumo_config', ({ produto_id, preco_fixo, desconto_percentual, ativo }) => {
    if (!isValidId(produto_id)) return;
    db.get(`SELECT id FROM funcionario_consumo_config WHERE produto_id = ?`, [produto_id], (err, row) => {
      if (row) {
        db.run(`UPDATE funcionario_consumo_config SET preco_fixo = ?, desconto_percentual = ?, ativo = ? WHERE id = ?`,
          [preco_fixo || null, desconto_percentual || null, ativo ? 1 : 0, row.id], () => {
            socket.emit('consumo_config_saved');
          });
      } else {
        db.run(`INSERT INTO funcionario_consumo_config (produto_id, preco_fixo, desconto_percentual, ativo) VALUES (?, ?, ?, ?)`,
          [produto_id, preco_fixo || null, desconto_percentual || null, ativo ? 1 : 0], () => {
            socket.emit('consumo_config_saved');
          });
      }
    });
  });
}

// =====================================
// ROTAS DE RH / PAGAMENTO DE FOLHA
// =====================================

app.get('/api/rh/extrato/:id', verificarToken, (req, res) => {
  const funcId = req.params.id;
  db.get("SELECT nome FROM funcionarios WHERE id = ?", [funcId], (errF, func) => {
    if (errF || !func) return res.status(404).send("Funcionário não encontrado");

    const funcName = func.nome;
    db.all("SELECT id, valor, data_pedido, observacao FROM vales WHERE funcionario_id = ? AND status = 'Aprovado' AND pagamento_id IS NULL", [funcId], (errV, vales) => {
      // Para abatimento de consumo (Fiado)
      // Procuramos pedidos finalizados onde o funcionario_id esteja preenchido explicitamente para o colaborador
      db.all("SELECT id, total, productName, quantity, createdAt FROM pedidos WHERE status = 'Finalizado' AND paymentMethod = 'Fiado' AND pagamento_id IS NULL AND funcionario_id = ?", [funcId], (errP, fiados) => {
        // Fallback: se não houver pedidos vinculados por funcionario_id, busca por userName
        const buscarFiados = (fiados && fiados.length > 0) ? Promise.resolve(fiados) : new Promise((resolve) => {
          db.all("SELECT id, total, productName, quantity, createdAt FROM pedidos WHERE status = 'Finalizado' AND paymentMethod = 'Fiado' AND pagamento_id IS NULL AND userName = ?", [funcName], (e, rows) => {
            resolve(rows || []);
          });
        });

        buscarFiados.then(fiadosLista => {
          // Dias atípicos / extras pendentes de acerto
          db.all("SELECT id, data, valor, justificativa, forma_pagamento FROM dias_atipicos WHERE funcionario_id = ? AND status = 'aprovado' AND pagamento_id IS NULL", [funcId], (errD, atipicos) => {
            let totalVales = 0;
            (vales || []).forEach(v => totalVales += parseFloat(v.valor || 0));

            let totalConsumo = 0;
            (fiadosLista || []).forEach(f => {
              let rawTotal = String(f.total || '0').replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
              let val = parseFloat(rawTotal || 0);
              // Proteção contra soma duplicada de arrays ou valores inválidos
              if (!isNaN(val) && val > 0 && val < 5000) {
                totalConsumo += val;
              }
            });

            let totalAtipicos = 0;
            (atipicos || []).forEach(a => totalAtipicos += parseFloat(a.valor || 0));

            res.json({
              vales: vales || [],
              fiados: fiadosLista || [],
              atipicos: atipicos || [],
              total_vales: totalVales,
              total_consumo: totalConsumo,
              total_dias_extras: totalAtipicos,
              suggested_bruto: totalAtipicos
            });
          });
        });
      });
    });
  });
});

app.post('/api/rh/pagamentos', verificarToken, (req, res) => {
  const { funcionario_id, valor_bruto, total_vales_abatidos, total_consumo_abatido, valor_liquido, observacao, vales_ids, pedidos_ids } = req.body;
  const dataPagamento = new Date().toISOString();

  db.run(`INSERT INTO funcionarios_pagamentos (funcionario_id, data_pagamento, valor_bruto, total_vales_abatidos, total_consumo_abatido, valor_liquido, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [funcionario_id, dataPagamento, valor_bruto, total_vales_abatidos, total_consumo_abatido, valor_liquido, observacao || ''],
    function (err) {
      if (err) return res.status(500).send("Erro ao registrar pagamento");

      const pagId = this.lastID;

      // Update vales
      if (vales_ids && vales_ids.length > 0) {
        db.run(`UPDATE vales SET pagamento_id = ? WHERE id IN (${vales_ids.map(() => '?').join(',')})`, [pagId, ...vales_ids]);
      }
      // Update pedidos fiados
      if (pedidos_ids && pedidos_ids.length > 0) {
        db.run(`UPDATE pedidos SET pagamento_id = ? WHERE id IN (${pedidos_ids.map(() => '?').join(',')})`, [pagId, ...pedidos_ids]);
      }

      io.emit('rh_update');

      // Broadcast celebration
      db.get("SELECT nome FROM funcionarios WHERE id = ?", [funcionario_id], (errF, func) => {
        const nome = func ? func.nome : 'Colaborador';
        io.emit('pagamento_colaborador_celebracao', {
          funcionario_id,
          funcionario_nome: nome,
          valor: valor_liquido || valor_bruto,
          data_pagamento: dataPagamento,
          observacao: observacao || '',
          pagamento_id: pagId
        });
      });

      res.json({ success: true, pagamento_id: pagId });
    }
  );
});

// ── PERFIL DE MESA ────────────
app.get('/api/mesa-perfil/:mesa_nome', (req, res) => {
  const mesa_nome = req.params.mesa_nome;

  withTenant(req, () => {
    db.all("SELECT id, userName, productName, quantity, total, createdAt, localName, status FROM pedidos WHERE localName = ? ORDER BY id DESC LIMIT 300", [mesa_nome], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    let clientes_recentes = [];
    let itemCounts = {};
    let soma = 0;
    let clienteConsumo = {};
    let abertaEm = null;

    (rows || []).forEach(r => {
      const isPagamento = r.productName && (String(r.productName).includes('Pgto Parcial') || String(r.productName).includes('Pagamento'));
      if (isPagamento) return;

      if (r.userName && r.userName.trim() !== '' && r.userName.toLowerCase() !== 'cliente padrão') {
        if (!clientes_recentes.includes(r.userName)) clientes_recentes.push(r.userName);
      }

      soma += parseFloat(r.total) || 0;

      if (r.productName) {
        const qty = parseInt(r.quantity) || 1;
        itemCounts[r.productName] = (itemCounts[r.productName] || 0) + qty;
      }

      // Consumo por cliente
      const cliente = (r.userName && r.userName.trim() !== '' && r.userName.toLowerCase() !== 'cliente padrão')
        ? r.userName.trim() : 'Cliente Padrão';
      if (!clienteConsumo[cliente]) clienteConsumo[cliente] = { nome: cliente, valor: 0, pedidos: 0 };
      clienteConsumo[cliente].valor += parseFloat(r.total) || 0;
      clienteConsumo[cliente].pedidos++;
    });

    let mais_pedidos = Object.keys(itemCounts).map(nome => ({ nome, qty: itemCounts[nome] }));
    mais_pedidos.sort((a, b) => b.qty - a.qty);
    mais_pedidos = mais_pedidos.slice(0, 5);

    const clientes_detalhe = Object.values(clienteConsumo)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    const count = (rows && rows.length) ? rows.length : 0;
    const media = count > 0 ? soma / count : 0;

    // Horário em que a mesa foi aberta (pedido mais antigo ainda em aberto, senão o mais antigo)
    try {
      const abertos = (rows || []).filter(r => !['Finalizado', 'Pago', 'Cancelado', 'Entregue'].includes(r.status));
      const fonte = (abertos.length > 0 ? abertos : rows || []).slice(-1)[0];
      if (fonte && fonte.createdAt) abertaEm = fonte.createdAt;
    } catch (e) { }

    res.json({
      mesa: mesa_nome,
      clientes_recentes: clientes_recentes.slice(0, 5),
      mais_pedidos,
      media_valor: media,
      total_pedidos: count,
      aberta_em: abertaEm,
      clientes_detalhe
    });
    });
  });
});

// ── SUGESTÕES DE PROMOÇÕES (INTELIGÊNCIA DE VENDAS) ────────────
app.get('/api/sugestoes-promocao', (req, res) => {
  withTenant(req, () => {
    // Pega os itens dos últimos 7 dias
    db.all(`SELECT productName, SUM(quantity) as qty FROM pedidos WHERE createdAt >= datetime('now', '-7 days') GROUP BY productName`, (err, vendidos) => {
    if (err) return res.status(500).json({ error: err.message });

    let vended = {};
    (vendidos || []).forEach(r => {
      if (r.productName) vended[r.productName] = (vended[r.productName] || 0) + (parseInt(r.qty) || 1);
    });

    // Obter todos os produtos cadastrados para descobrir os obsoletos (não vendidos)
    db.all("SELECT nome, preco FROM produtos", (err2, produtos) => {
      if (err2) return res.status(500).json({ error: err2.message });

      let obsoletos = [];
      let vendidosArr = [];

      produtos.forEach(prod => {
        if (!vended[prod.nome]) {
          obsoletos.push(prod);
        } else {
          vendidosArr.push({ nome: prod.nome, qty: vended[prod.nome], preco: prod.preco });
        }
      });

      vendidosArr.sort((a, b) => b.qty - a.qty);
      let tendencias = vendidosArr.slice(0, 5); // top 5

      // Criar as sugestões descritivas
      let sugestoes = [];

      if (tendencias.length > 0 && obsoletos.length > 0) {
        let top = tendencias[0];
        let obs = obsoletos[0];
        sugestoes.push({
          tipo: 'combo',
          titulo: 'Combo de Alta Conversão',
          descricao: `Crie um combo oferecendo '${top.nome}' (tendência) junto com '${obs.nome}' (baixa saída) com um leve desconto. Isso ajudará a girar o estoque do item obsoleto!`
        });
      }

      if (obsoletos.length > 1) {
        sugestoes.push({
          tipo: 'obsoleto',
          titulo: 'Alerta de Baixa Saída',
          descricao: `Os itens '${obsoletos[0].nome}' e '${obsoletos[1].nome}' não tiveram saídas nos últimos 7 dias. Considere criar uma promoção de "Compre 1 e Leve 2" ou dar como brinde em pedidos acima de um valor X.`
        });
      }

      if (tendencias.length > 1) {
        sugestoes.push({
          tipo: 'tendencia',
          titulo: 'Tendência de Vendas',
          descricao: `Aproveite a alta demanda de '${tendencias[0].nome}' e '${tendencias[1].nome}'. Você pode aumentar sutilmente a margem de lucro ou criar variações Premium desses produtos.`
        });
      }

      if (sugestoes.length === 0) {
        sugestoes.push({
          tipo: 'info',
          titulo: 'Dados Insuficientes',
          descricao: 'Ainda não há dados suficientes nos últimos 7 dias para gerar sugestões precisas. Continue registrando as vendas!'
        });
      }

      res.json({
        obsoletos: obsoletos.slice(0, 5),
        tendencias,
        sugestoes
      });
    });
    });
  });
});

// ══════════════════════════════════════════════════════════════
// ══ IA ASSISTENTE - SUGESTÕES INTELIGENTES POR PERFIL ════════
// ══════════════════════════════════════════════════════════════
const IA_CONFIG = {
  iaEnabled: true,              // toggle global de alertas IA
  intervaloVerificacao: 60000,     // 60 segundos
  minutosRefillCerveja: 18,        // sugerir novo drink após 18min
  minutosAlertaEspera: 25,         // alertar caixa após 25min sem prato
  minutosCriticoEspera: 40,        // pedido crítico - entrada urgente
  minutosManobra: 30,              // sugerir manobra (entrada cortesia) após 30min
  minutosAtencao: 50,              // chamada de atenção na fila quando extrapolar este tempo
  segundosPulseNovoPedido: 8,      // duração do pulse ao mostrar novo pedido
  categoriasBebidas: ['cerveja', 'bebida', 'drink', 'caipirinha', 'chopp', 'long neck', 'lata', 'garrafa', 'suco', 'refrigerante', 'água', 'agua'],
  categoriasEntradas: ['entrada', 'petisco', 'bolinho', 'isca', 'croquete', 'coxinha', 'pastel', 'mandioca']
};

const iaState = {
  sugestoesEnviadas: new Map(),    // 'mesa+produto' -> timestamp da ultima sugestao
  alertasAtivos: new Map(),        // 'pedido_id' -> { nivel, timestamp }
  manobrasAtivas: new Map(),       // 'pedido_id' -> { timestamp, status }
  dicasGerenteCache: null,
  dicasGerenteExpiry: 0
};

// Bebidas conhecidas para sugerir refill
const BEBIDAS_POPULARES = [
  'Skol', 'Brahma', 'Heineken', 'Stella', 'Corona', 'Amstel',
  'Guaraná', 'Coca-Cola', 'Fanta', 'Sprite', 'Mineral',
  'Suco de Laranja', 'Caipirinha', 'Chopp'
];


// --- IA Tenant-Aware Emit Helper ---
function emitToTenant(event, data, restauranteId) {
  if (restauranteId) {
    io.to('restaurante_' + restauranteId).emit(event, data);
  } else {
    // Fallback: emit to all (for backward compat)
    io.emit(event, data);
  }
}

function runIAVerificacao() {
  db.all(`SELECT * FROM pedidos WHERE status NOT IN ('Finalizado','Pago','Cancelado','Entregue') AND sector != 'Chamada' AND productName NOT LIKE '%Pgto Parcial%' AND productName NOT LIKE '%Pagamento%' ORDER BY createdAt ASC`, [], (err, rows) => {
    if (err || !rows || rows.length === 0) return;

    const agora = Date.now();
    const porMesa = {};

    rows.forEach(p => {
      const nome = (p.productName || '').toLowerCase();
      if (nome.includes('pagamento') || nome.includes('pgto')) return;
      const mesa = p.localName;
      if (!porMesa[mesa]) porMesa[mesa] = [];
      porMesa[mesa].push(p);
    });

    // ── 1. IA GARÇOM: Detectar bebidas e sugerir refill ──
    Object.entries(porMesa).forEach(([mesa, pedidos]) => {
      const bebidas = pedidos.filter(p => {
        const nome = (p.productName || '').toLowerCase();
        return IA_CONFIG.categoriasBebidas.some(cat => nome.includes(cat)) ||
          BEBIDAS_POPULARES.some(b => nome.includes(b.toLowerCase()));
      });

      bebidas.forEach(bebida => {
        const criado = bebida.createdAt ? new Date(bebida.createdAt).getTime() : 0;
        if (!criado) return;
        const minsDesdePedido = (agora - criado) / 60000;
        const chave = `${mesa}:${bebida.productName}`;

        if (minsDesdePedido >= IA_CONFIG.minutosRefillCerveja &&
          minsDesdePedido <= IA_CONFIG.minutosRefillCerveja + 10 &&
          !iaState.sugestoesEnviadas.has(chave)) {

          const diff = Math.round(minsDesdePedido);
          io.emit('ia_sugestao_garcom', {
            tipo: 'refill_bebida',
            mesa,
            produto: bebida.productName,
            minutos: diff,
            mensagem: `${mesa} pediu ${bebida.productName} há ${diff} minutos. Oferecer nova bebida?`,
            opcoes: ['Sim, vou oferecer', 'Já ofereci', 'Agora não']
          });
          iaState.sugestoesEnviadas.set(chave, agora);
        }
      });
    });

    // ── 2. IA FILA COZINHA: Detectar espera longa ──
    rows.forEach(p => {
      const criado = p.createdAt ? new Date(p.createdAt).getTime() : 0;
      if (!criado) return;
      const minsEspera = (agora - criado) / 60000;
      if (minsEspera > 720) return; // Ignorar pedidos com mais de 12 horas
      const chaveAlerta = `pedido_${p.id}`;

      if (minsEspera >= IA_CONFIG.minutosCriticoEspera && p.status !== 'Pronto') {
        // Nível CRÍTICO - emitir alerta ao caixa e marcar pedido como urgente
        if (!iaState.alertasAtivos.has(chaveAlerta) ||
          (agora - iaState.alertasAtivos.get(chaveAlerta).timestamp) > 300000) {

          io.emit('ia_alerta_caixa', {
            tipo: 'espera_critica',
            nivel: 'critico',
            pedidoId: p.id,
            mesa: p.localName,
            produto: p.productName,
            minutos: Math.round(minsEspera),
            mensagem: `ALERTA: ${p.localName} aguardando "${p.productName}" há ${Math.round(minsEspera)} minutos! Risco de desistência.`,
            sugestoes: [
              'Solicitar entrada urgente ao garçom',
              'Informar cliente sobre o atraso',
              'Oferecer cortesia ( entrada / bebida )'
            ]
          });

          io.emit('ia_pedido_especial', {
            pedidoId: p.id,
            tipo: 'urgente',
            cor: '#ff4444',
            urgencia: 'alta',
            mensagem: `URGENTE - ${Math.round(minsEspera)}min de espera`
          });

          iaState.alertasAtivos.set(chaveAlerta, { nivel: 'critico', timestamp: agora });
        }

      } else if (minsEspera >= IA_CONFIG.minutosAlertaEspera && p.status !== 'Pronto') {
        // Nível ALERTA - sugestão preventiva
        if (!iaState.alertasAtivos.has(chaveAlerta) ||
          (agora - iaState.alertasAtivos.get(chaveAlerta).timestamp) > 300000) {

          io.emit('ia_alerta_caixa', {
            tipo: 'espera_alerta',
            nivel: 'alerta',
            pedidoId: p.id,
            mesa: p.localName,
            produto: p.productName,
            minutos: Math.round(minsEspera),
            mensagem: `${p.localName} aguardando "${p.productName}" há ${Math.round(minsEspera)} minutos. Considere oferecer uma entrada.`,
            sugestoes: [
              'Sugerir entrada ao cliente',
              'Verificar status na cozinha'
            ]
          });

          iaState.alertasAtivos.set(chaveAlerta, { nivel: 'alerta', timestamp: agora });
        }
      }
    });

    // ── 3. IA MANOBRA: Detectar mesas com risco de desistência ──
    Object.entries(porMesa).forEach(([mesa, pedidos]) => {
      const naoProntos = pedidos.filter(p => p.status !== 'Pronto' && p.status !== 'Finalizado' && p.status !== 'Cancelado' && p.status !== 'Entregue' && p.status !== 'Pago');
      const prontos = pedidos.filter(p => p.status === 'Pronto');

      if (naoProntos.length === 0) return;

      const maisAntigo = naoProntos.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return ta - tb;
      })[0];

      const criado = maisAntigo.createdAt ? new Date(maisAntigo.createdAt).getTime() : 0;
      if (!criado) return;
      const minsEspera = (agora - criado) / 60000;
      const chaveManobra = `manobra_${maisAntigo.id}`;

      if (minsEspera >= IA_CONFIG.minutosManobra && maisAntigo.status !== 'Pronto') {
        if (!iaState.manobrasAtivas.has(chaveManobra) ||
          (agora - iaState.manobrasAtivas.get(chaveManobra).timestamp) > 600000) {

          const temParcial = prontos.length > 0;
          io.emit('ia_manobra_sugerida', {
            tipo: 'manobra_sugerida',
            pedidoId: maisAntigo.id,
            mesa,
            produto: maisAntigo.productName,
            setor: maisAntigo.sector || 'Cozinha 1',
            minutos: Math.round(minsEspera),
            itensProntos: prontos.length,
            itensPendentes: naoProntos.length,
            temParcial,
            mensagem: temParcial
              ? `${mesa} já recebeu ${prontos.length} item(ns) mas aguardando "${maisAntigo.productName}" há ${Math.round(minsEspera)}min. Risco de desistência!`
              : `${mesa} aguardando "${maisAntigo.productName}" há ${Math.round(minsEspera)}min. Cliente pode desistir.`,
            sugestoes: [
              'Solicitar entrada cortesia ao garçom',
              'Informar cliente sobre o atraso',
              'Oferecer bebida cortesia'
            ]
          });

          iaState.manobrasAtivas.set(chaveManobra, { timestamp: agora, status: 'sugerida' });
        }
      }
    });

    // ── 3.5. IA ATENÇÃO: Chamada de atenção quando pedido extrapola tempo ──
    rows.forEach(p => {
      const criado = p.createdAt ? new Date(p.createdAt).getTime() : 0;
      if (!criado) return;
      const minsEspera = (agora - criado) / 60000;
      const chaveAtencao = `atencao_${p.id}`;

      if (minsEspera >= IA_CONFIG.minutosAtencao && p.status !== 'Pronto' && p.status !== 'Finalizado' && p.status !== 'Cancelado') {
        if (!iaState.alertasAtivos.has(chaveAtencao) ||
          (agora - iaState.alertasAtivos.get(chaveAtencao).timestamp) > 300000) {

          io.emit('ia_pedido_atencao', {
            pedidoId: p.id,
            tipo: 'atencao',
            cor: '#dc2626',
            urgencia: 'atencao',
            minutos: Math.round(minsEspera),
            mesa: p.localName,
            produto: p.productName,
            setor: p.sector || 'Cozinha 1',
            mensagem: `ATENÇÃO - ${Math.round(minsEspera)}min de espera!`
          });

          iaState.alertasAtivos.set(chaveAtencao, { nivel: 'atencao', timestamp: agora });
        }
      }
    });

    // ── 4. IA GERENTE: Insights periódicos (cache 5min) ──
    if (agora > iaState.dicasGerenteExpiry) {
      gerarInsightsGerente(rows, agora);
    }
  });
}

function gerarInsightsGerente(pedidosAtivos, agora) {
  const dicas = [];
  const totalPedidos = pedidosAtivos.length;

  if (totalPedidos === 0) {
    dicas.push({ tipo: 'info', texto: 'Nenhum pedido ativo no momento. Bom momento para organizar o estoque ou preparar itens.' });
  }

  // Contar por status
  const porStatus = {};
  pedidosAtivos.forEach(p => {
    porStatus[p.status] = (porStatus[p.status] || 0) + 1;
  });

  if (porStatus['Em espera'] > 5 || porStatus['Pendente'] > 5) {
    dicas.push({ tipo: 'alerta', texto: `${porStatus['Em espera'] || 0} pedidos em espera. Considere aumentar eficiência na cozinha.` });
  }

  // Mesa mais ativa
  const porMesa = {};
  pedidosAtivos.forEach(p => {
    porMesa[p.localName] = (porMesa[p.localName] || 0) + 1;
  });
  const mesaMaisAtiva = Object.entries(porMesa).sort((a, b) => b[1] - a[1])[0];
  if (mesaMaisAtiva && mesaMaisAtiva[1] > 3) {
    dicas.push({ tipo: 'info', texto: `Mesa ${mesaMaisAtiva[0]} é a mais ativa com ${mesaMaisAtiva[1]} itens. Priorize atendimento.` });
  }

  // Pedidos prontos aguardando retirada
  if (porStatus['Pronto'] > 0) {
    dicas.push({ tipo: 'acao', texto: `${porStatus['Pronto']} pedido(s) pronto(s) aguardando retirada. Acelere a entrega!` });
  }

  // Horário - dicas contextuais
  const hora = new Date().getHours();
  if (hora >= 11 && hora <= 14) {
    dicas.push({ tipo: 'dica', texto: 'Horário de almoço. Reforçar equipe de garçons e verificar estoque de pratos do dia.' });
  } else if (hora >= 18 && hora <= 22) {
    dicas.push({ tipo: 'dica', texto: 'Horário de jantar. Promova entradas e combos para mesas recém-sentadas.' });
  } else if (hora >= 22) {
    dicas.push({ tipo: 'dica', texto: 'Noite avançada. Sugira sobremesas e café para encerrar contas.' });
  }

  if (dicas.length > 0) {
    io.emit('ia_dica_gerente', {
      dicas,
      timestamp: agora,
      resumo: {
        totalPedidos,
        emEspera: porStatus['Em espera'] || 0,
        emPreparo: porStatus['Em preparo'] || 0,
        prontos: porStatus['Pronto'] || 0,
        mesasAtivas: Object.keys(porMesa).length
      }
    });
  }

  iaState.dicasGerenteCache = dicas;
  iaState.dicasGerenteExpiry = agora + 300000; // 5 min cache
}

// Responder a ações do garçom nas sugestões da IA
io.on('connection', (socket) => {
  const token = socket.handshake.query.token;
  let socketTenantId = 1;
  socket.auth = null;
  if (token && typeof token === 'string') {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socketTenantId = decoded.restaurante_id;
      socket.auth = decoded;
    } catch (e) { }
  }

  // Tenants sem token (ex.: cliente que escaneou o QR do cardápio) usam o
  // restaurante_id informado na própria URL/query do socket.
  if (!socket.auth) {
    const qrid = parseInt(socket.handshake.query.restaurante_id, 10);
    if (Number.isFinite(qrid) && qrid > 0) socketTenantId = qrid;
  }

  socket.restaurante_id = socketTenantId;
  socket.join(`restaurante_${socketTenantId}`);

  // Contagem de sockets por tenant (o guard evita dupla contagem com o bloco principal)
  metricAddSocket(socket);
  if (!socket.features) socket.features = getTenantFeaturesSync(socketTenantId);

  // Wrap all socket events in tenant context!
  const originalOn = socket.on.bind(socket);
  socket.on = function (eventName, callback) {
    originalOn(eventName, (...args) => {
      tenantContext.run(socketTenantId, () => {
        callback(...args);
      });
    });
  };

  socket.on('ia_resposta_sugestao', (data) => {
    const { tipo, mesa, produto, resposta, pedidoId } = data || {};

    if (tipo === 'refill_bebida' && resposta === 'sim') {
      // Garçom aceitou oferecer refill - buscar produto para adicionar
      db.get(`SELECT * FROM produtos WHERE nome LIKE ? LIMIT 1`, [`%${produto}%`], (err, prod) => {
        if (prod) {
          io.emit('ia_sugestao_garcom_aceita', {
            mesa,
            produto: prod.nome,
            preco: prod.preco,
            mensagem: `Adicione ${prod.nome} (R$ ${parseFloat(prod.preco).toFixed(2)}) na comanda da ${mesa}`
          });
        }
      });
    }

    if (tipo === 'espera_critica' || tipo === 'espera_alerta') {
      if (!resposta) return;
      if (resposta.includes('garçom') || resposta.includes('garcom') || resposta.includes('cortesia')) {
        // Enviar para o garçom oferecer cortesia
        io.emit('ia_manobra_aceita', {
          tipo: 'manobra_aceita',
          pedidoId,
          mesa,
          produto: 'Entrada',
          minutos: '...',
          mensagem: `Caixa solicitou oferecer entrada cortesia para ${mesa}.`,
          opcoes: ['Vou oferecer entrada', 'Cliente recusou']
        });
      } else if (resposta.includes('entrada')) {
        // Enviar direto para a cozinha
        if (pedidoId) {
          io.emit('ia_pedido_especial', {
            pedidoId,
            tipo: 'entrada_urgente',
            cor: '#ff6b35',
            urgencia: 'entrada_solicitada',
            mensagem: `ENTRADA URGENTE - preparar em paralelo`
          });
        }
      } else if (resposta.includes('informar') || resposta.includes('atraso')) {
        // Apenas marcar como cliente informado
        if (pedidoId) {
          io.emit('ia_pedido_especial', {
            pedidoId,
            tipo: 'informado',
            cor: '#3b82f6',
            urgencia: 'media',
            mensagem: `CLIENTE INFORMADO`
          });
        }
      }
    }
  });

  // ── MANOBRA: Caixa confirma solicitação de entrada ao garçom ──
  socket.on('ia_manobra_confirmar', (data) => {
    const { pedidoId, mesa, produto, minutos, acao } = data || {};
    const chaveManobra = `manobra_${pedidoId}`;

    if (acao === 'solicitar_entrada') {
      io.emit('ia_manobra_aceita', {
        tipo: 'manobra_aceita',
        pedidoId,
        mesa,
        produto,
        minutos,
        mensagem: `Oferecer entrada cortesia para ${mesa}. Cliente aguardando "${produto}" há ${minutos}min.`,
        opcoes: ['Vou oferecer entrada', 'Cliente recusou']
      });

      iaState.manobrasAtivas.set(chaveManobra, { timestamp: Date.now(), status: 'encaminhada' });
    }

    if (acao === 'informar_cliente') {
      io.emit('ia_pedido_especial', {
        pedidoId,
        tipo: 'informado',
        cor: '#3b82f6',
        urgencia: 'media',
        mensagem: `CLIENTE INFORMADO - ${minutos}min de espera`
      });
      iaState.manobrasAtivas.set(chaveManobra, { timestamp: Date.now(), status: 'informado' });
    }
  });

  // ── MANOBRA: Garçom confirma que vai oferecer entrada ──
  socket.on('ia_manobra_executar', (data) => {
    const { pedidoId, mesa, produto, resposta } = data || {};
    const chaveManobra = `manobra_${pedidoId}`;

    if (resposta === 'sim') {
      io.emit('ia_pedido_especial', {
        pedidoId,
        tipo: 'manobra',
        cor: '#ff6b35',
        urgencia: 'manobra_ativa',
        mensagem: `MANOBRA - preparar em paralelo`
      });

      iaState.manobrasAtivas.set(chaveManobra, { timestamp: Date.now(), status: 'executada' });

      io.emit('ia_manobra_executada', {
        pedidoId,
        mesa,
        produto,
        mensagem: `Garçom vai oferecer entrada para ${mesa}. Cozinha: preparar "${produto}" em paralelo!`
      });
    } else {
      iaState.manobrasAtivas.set(chaveManobra, { timestamp: Date.now(), status: 'recusada' });
    }
  });

  // --- IA: Toggle alertas on/off ---
  socket.on('toggle_ia_alertas', (data) => {
    if (!socket.auth) return;
    const { enabled } = data || {};
    IA_CONFIG.iaEnabled = !!enabled;
    console.log('[IA] Alertas ' + (IA_CONFIG.iaEnabled ? 'ATIVADOS' : 'DESATIVADOS'));
    if (!IA_CONFIG.iaEnabled) {
      iaState.alertasAtivos.clear();
      iaState.manobrasAtivas.clear();
      iaState.sugestoesEnviadas.clear();
    }
    io.emit('ia_estado_atualizado', { enabled: IA_CONFIG.iaEnabled });
  });

  // --- IA: Atualizar configuracoes da IA ---
  socket.on('ia_atualizar_config', (data) => {
    if (!socket.auth) return;
    if (data.minutosRefillCerveja !== undefined) IA_CONFIG.minutosRefillCerveja = parseInt(data.minutosRefillCerveja) || 18;
    if (data.minutosAlertaEspera !== undefined) IA_CONFIG.minutosAlertaEspera = parseInt(data.minutosAlertaEspera) || 25;
    if (data.minutosCriticoEspera !== undefined) IA_CONFIG.minutosCriticoEspera = parseInt(data.minutosCriticoEspera) || 40;
    if (data.minutosManobra !== undefined) IA_CONFIG.minutosManobra = parseInt(data.minutosManobra) || 30;
    if (data.minutosAtencao !== undefined) IA_CONFIG.minutosAtencao = parseInt(data.minutosAtencao) || 50;
    console.log('[IA] Config atualizada:', JSON.stringify({ enabled: IA_CONFIG.iaEnabled, minutosRefill: IA_CONFIG.minutosRefillCerveja, minutosAlerta: IA_CONFIG.minutosAlertaEspera, minutosCritico: IA_CONFIG.minutosCriticoEspera }));
    socket.emit('ia_config_atual', IA_CONFIG);
  });

  // --- IA: Solicitar configuracao atual ---
  socket.on('ia_get_config', () => {
    socket.emit('ia_config_atual', IA_CONFIG);
  });
});

app.post('/api/auth/registro', async (req, res) => {
  const { restauranteNome, nome, email, telefone, senha, chaveRef } = req.body || {};
  if (!restauranteNome || !nome || !email || !senha) {
    return res.status(400).json({ success: false, error: 'Preencha todos os campos obrigatórios.' });
  }

  const emailClean = String(email).trim().toLowerCase();
  const telFormatado = (telefone || '').trim();

  try {
    // 1. Verificar se o e-mail já está cadastrado no sistema
    masterDb.get(`SELECT * FROM usuarios WHERE LOWER(username) = ?`, [emailClean], async (errCheck, existingUser) => {
      if (errCheck) return res.status(500).json({ success: false, error: 'Erro ao verificar e-mail.' });

      if (existingUser) {
        // Se a senha bater com o cadastro prévio, permite continuar o onboarding com o restaurante existente
        const passMatch = await bcrypt.compare(senha, existingUser.password_hash || '');
        if (passMatch) {
          const token = jwt.sign({ id: existingUser.id, restaurante_id: existingUser.restaurante_id, role: existingUser.role || 'admin' }, JWT_SECRET, { expiresIn: '90d' });
          return res.json({ success: true, token, restaurante_id: existingUser.restaurante_id, ja_existia: true });
        } else {
          return res.status(400).json({ success: false, error: 'Este e-mail já possui uma conta. Digite a senha correta ou use outro e-mail.' });
        }
      }

      // 2. E-mail novo: Criar restaurante trial de 7 dias
      const hash = await bcrypt.hash(senha, 10);
      masterDb.run(
        `INSERT INTO restaurantes (nome, licenca, ativo, telefone, dono_nome, dono_telefone, dono_email) VALUES (?, 'trial', 1, ?, ?, ?, ?)`,
        [restauranteNome, telFormatado, nome, telFormatado, emailClean],
        function (errRest) {
          if (errRest) return res.status(500).json({ success: false, error: 'Erro ao criar restaurante.' });

          const restauranteId = this.lastID;

          // Criar usuário admin do restaurante
          masterDb.run(
            `INSERT INTO usuarios (restaurante_id, username, password_hash, role, nome, telefone) VALUES (?, ?, ?, 'admin', ?, ?)`,
            [restauranteId, emailClean, hash, nome, telFormatado],
            function (errUser) {
              if (errUser) {
                masterDb.run(`DELETE FROM restaurantes WHERE id = ?`, [restauranteId]);
                return res.status(500).json({ success: false, error: 'E-mail já cadastrado.' });
              }

              const userId = this.lastID;

              // Vincular Venda a Afiliado se chaveRef for informada
              if (chaveRef && typeof chaveRef === 'string' && chaveRef.trim()) {
                const codeClean = chaveRef.trim().toUpperCase();
                masterDb.get(`SELECT * FROM afiliados WHERE UPPER(codigo_ref) = ? AND status = 'ativo'`, [codeClean], (errAfil, afil) => {
                  if (!errAfil && afil) {
                    const comissaoPct = afil.comissao_percentual || 10;
                    const valorPlanoPadrao = 149.90;
                    const comissaoVal = (valorPlanoPadrao * comissaoPct) / 100;

                    masterDb.run(
                      `INSERT INTO afiliado_vendas (afiliado_id, restaurante_id, restaurante_nome, plano, valor_venda, comissao_valor, status) VALUES (?, ?, ?, 'Trial 14 Dias', ?, ?, 'pendente')`,
                      [afil.id, restauranteId, restauranteNome, valorPlanoPadrao, comissaoVal],
                      function(errVenda) {
                        if (!errVenda) {
                          console.log(`🤝 [Afiliados] Venda registrada para Afiliado #${afil.id} (${afil.codigo_ref}) no Restaurante #${restauranteId}`);
                        }
                      }
                    );
                  }
                });
              }

              // Notificar o Super Admin em tempo real via Socket.IO
              try {
                const cadastroNotif = {
                  restaurante_id: restauranteId,
                  restauranteNome: restauranteNome,
                  nome: nome,
                  email: emailClean,
                  telefone: telFormatado,
                  data: getLocalTimestamp()
                };
                if (io) io.emit('novo_cadastro_saas', cadastroNotif);
                celebrarNovoRestaurante(restauranteNome, restauranteId, `${nome} <${emailClean}>`);
                console.log(`🔔 [SaaS Onboarding] Novo cadastro em andamento: Restaurante #${restauranteId} "${restauranteNome}" | Dono: ${nome} | Tel: ${telFormatado} | Email: ${emailClean}`);
              } catch (eNotif) {
                console.error('Erro ao emitir notificacao de novo cadastro saas:', eNotif);
              }

              // Gerar JWT inicial
              const token = jwt.sign({ id: userId, restaurante_id: restauranteId, role: 'admin' }, JWT_SECRET, { expiresIn: '90d' });
              res.json({ success: true, token, restaurante_id: restauranteId });
            }
          );
        }
      );
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});


// ═══════════════════════════════════════════════════════════════
// PAINEL DO DONO — SOCKET HANDLERS (Controle Remoto & RH)
// ═══════════════════════════════════════════════════════════════
io.on('connection', (socket) => {
  const _donoToken = socket.handshake.query.token;
  let _donoTenantId = parseInt(socket.handshake.query.restaurante_id, 10) || 1;
  if (_donoToken && typeof _donoToken === 'string') {
    try {
      const decoded = jwt.verify(_donoToken, JWT_SECRET);
      if (decoded.restaurante_id) _donoTenantId = decoded.restaurante_id;
    } catch (e) { }
  }

  // ── Controle Remoto: Navegar Caixa para uma tela específica ──
  socket.on('comando_navegar_caixa', (data) => {
    const { destino, solicitadoPor } = data || {};
    if (!destino) return;
    console.log(`[Dono Remoto] Navegação → ${destino} (por ${solicitadoPor || '?'})`);
    io.to(`restaurante_${_donoTenantId}`).emit('navegar_para', { destino, solicitadoPor });
    socket.emit('dono_acao_concluida', { mensagem: `✅ Caixa direcionado para: ${destino}` });
  });

  // ── RH: Registrar pagamento para colaborador ──
  socket.on('dono_registrar_pagamento', (data) => {
    const { funcionario_id, valor, forma_pagamento, observacao, operador } = data || {};
    if (!funcionario_id || !valor) return socket.emit('dono_acao_erro', { mensagem: 'Dados de pagamento inválidos.' });
    const db = getTenantDb(_donoTenantId);
    db.run(
      `INSERT INTO funcionarios_pagamentos (funcionario_id, valor, forma_pagamento, observacao, data_pagamento, operador) VALUES (?, ?, ?, ?, datetime('now','localtime'), ?)`,
      [funcionario_id, valor, forma_pagamento || 'Dinheiro', observacao || '', operador || 'Dono'],
      function(err) {
        if (err) return socket.emit('dono_acao_erro', { mensagem: 'Erro ao salvar pagamento.' });
        socket.emit('dono_acao_concluida', { mensagem: `✅ Pagamento de R$ ${parseFloat(valor).toFixed(2).replace('.', ',')} registrado!` });
        io.to(`restaurante_${_donoTenantId}`).emit('rh_update');
      }
    );
  });

  // ── RH: Abonar falta de colaborador ──
  socket.on('dono_abonar_falta', (data) => {
    const { funcionario_id, data_falta, justificativa, remunerado, operador } = data || {};
    if (!funcionario_id || !data_falta) return socket.emit('dono_acao_erro', { mensagem: 'Dados de falta inválidos.' });
    const db = getTenantDb(_donoTenantId);
    const inserirFalta = () => db.run(
      `INSERT INTO faltas_funcionarios (funcionario_id, data_falta, justificativa, remunerado, registrado_por, created_at) VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))`,
      [funcionario_id, data_falta, justificativa || '', remunerado ? 1 : 0, operador || 'Dono'],
      (err) => {
        if (err) return socket.emit('dono_acao_erro', { mensagem: 'Erro ao registrar falta.' });
        socket.emit('dono_acao_concluida', { mensagem: '✅ Falta registrada com sucesso!' });
        io.to(`restaurante_${_donoTenantId}`).emit('rh_update');
      }
    );
    db.run(`CREATE TABLE IF NOT EXISTS faltas_funcionarios (id INTEGER PRIMARY KEY AUTOINCREMENT, funcionario_id INTEGER, data_falta TEXT, justificativa TEXT, remunerado INTEGER DEFAULT 0, registrado_por TEXT, created_at TEXT)`, inserirFalta);
  });

  // ── RH: Conceder folga para colaborador ──
  socket.on('dono_conceder_folga', (data) => {
    const { funcionario_id, data_inicio, data_fim, tipo_folga, observacao, operador } = data || {};
    if (!funcionario_id || !data_inicio) return socket.emit('dono_acao_erro', { mensagem: 'Dados de folga inválidos.' });
    const db = getTenantDb(_donoTenantId);
    const inserirFolga = () => db.run(
      `INSERT INTO folgas_funcionarios (funcionario_id, data_inicio, data_fim, tipo, observacao, registrado_por, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
      [funcionario_id, data_inicio, data_fim || data_inicio, tipo_folga || 'Escala', observacao || '', operador || 'Dono'],
      (err) => {
        if (err) return socket.emit('dono_acao_erro', { mensagem: 'Erro ao conceder folga.' });
        socket.emit('dono_acao_concluida', { mensagem: '✅ Folga concedida com sucesso!' });
        io.to(`restaurante_${_donoTenantId}`).emit('rh_update');
      }
    );
    db.run(`CREATE TABLE IF NOT EXISTS folgas_funcionarios (id INTEGER PRIMARY KEY AUTOINCREMENT, funcionario_id INTEGER, data_inicio TEXT, data_fim TEXT, tipo TEXT, observacao TEXT, registrado_por TEXT, created_at TEXT)`, inserirFolga);
  });

  // ── Notificar toda a equipe com aviso do dono ──
  socket.on('enviar_notificacao_equipe', (data) => {
    const { texto } = data || {};
    if (!texto) return;
    io.to(`restaurante_${_donoTenantId}`).emit('aviso_dono', { texto, hora: new Date().toLocaleTimeString('pt-BR') });
    socket.emit('dono_acao_concluida', { mensagem: '✅ Aviso enviado para toda a equipe!' });
    console.log(`[Dono Remoto] Aviso ao restaurante #${_donoTenantId}: "${texto}"`);
  });
});

// Iniciar verificação periódica da IA
setInterval(runIAVerificacao, IA_CONFIG.intervaloVerificacao);

// --- SAAS: ROTAS DE AUTENTICACAO ---
app.post('/api/auth/registro', async (req, res) => {
  const { restauranteNome, nome, email, telefone, senha } = req.body;
  if (!restauranteNome || !nome || !email || !senha) {
    return res.status(400).json({ success: false, error: 'Preencha todos os campos obrigatórios.' });
  }

  const telFormatado = (telefone || '').trim();

  try {
    const hash = await bcrypt.hash(senha, 10);

    // Criar restaurante trial de 7 dias com dados do dono e telefone
    masterDb.run(
      `INSERT INTO restaurantes (nome, licenca, ativo, telefone, dono_nome, dono_telefone, dono_email) VALUES (?, 'trial', 1, ?, ?, ?, ?)`,
      [restauranteNome, telFormatado, nome, telFormatado, email],
      function (err) {
        if (err) return res.status(500).json({ success: false, error: 'Erro ao criar restaurante.' });

        const restauranteId = this.lastID;

        // Criar usuário admin do restaurante
        masterDb.run(
          `INSERT INTO usuarios (restaurante_id, username, password_hash, role, nome, telefone) VALUES (?, ?, ?, 'admin', ?, ?)`,
          [restauranteId, email, hash, nome, telFormatado],
          function (errUser) {
            if (errUser) {
              // Rollback se falhar
              masterDb.run(`DELETE FROM restaurantes WHERE id = ?`, [restauranteId]);
              return res.status(500).json({ success: false, error: 'E-mail já cadastrado.' });
            }

            // Vincular Venda a Afiliado se chaveRef for informada
            if (chaveRef && typeof chaveRef === 'string' && chaveRef.trim()) {
              const codeClean = chaveRef.trim().toUpperCase();
              db.get(`SELECT * FROM afiliados WHERE UPPER(codigo_ref) = ? AND status = 'ativo'`, [codeClean], (errAfil, afil) => {
                if (!errAfil && afil) {
                  const comissaoPct = afil.comissao_percentual || 10;
                  const valorPlanoPadrao = 149.90; // Valor base padrão do plano
                  const comissaoVal = (valorPlanoPadrao * comissaoPct) / 100;

                  db.run(
                    `INSERT INTO afiliado_vendas (afiliado_id, restaurante_id, restaurante_nome, plano, valor_venda, comissao_valor, status) VALUES (?, ?, ?, 'Trial 14 Dias', ?, ?, 'pendente')`,
                    [afil.id, restauranteId, restauranteNome, valorPlanoPadrao, comissaoVal],
                    function(errVenda) {
                      if (!errVenda) {
                        console.log(`🤝 [Afiliados] Venda registrada para Afiliado #${afil.id} (${afil.codigo_ref}) no Restaurante #${restauranteId}`);
                      }
                    }
                  );
                }
              });
            }

            // Notificar o Super Admin em tempo real via Socket.IO
            try {
              const cadastroNotif = {
                restaurante_id: restauranteId,
                restauranteNome: restauranteNome,
                nome: nome,
                email: email,
                telefone: telFormatado,
                data: getLocalTimestamp()
              };
              io.emit('novo_cadastro_saas', cadastroNotif);
              celebrarNovoRestaurante(restauranteNome, restauranteId, `${nome} <${email}>`);
              console.log(`🔔 [SaaS Onboarding] Novo cadastro em andamento: Restaurante #${restauranteId} "${restauranteNome}" | Dono: ${nome} | Tel: ${telFormatado} | Email: ${email}`);
            } catch (eNotif) {
              console.error('Erro ao emitir notificacao de novo cadastro saas:', eNotif);
            }

            // Gerar JWT inicial
            const token = jwt.sign({ id: this.lastID, restaurante_id: restauranteId, role: 'admin' }, JWT_SECRET, { expiresIn: '90d' });
            res.json({ success: true, token, restaurante_id: restauranteId });
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// ── Verificação de disponibilidade de Slug / Subdomínio ──
app.get('/api/auth/check-slug', (req, res) => {
  const raw = req.query.slug || '';
  const currentRestId = req.query.restaurante_id ? parseInt(req.query.restaurante_id, 10) : 0;
  const slug = String(raw).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug || slug.length < 2 || slug.length > 40) {
    return res.json({ available: false, slug, error: 'O link deve ter entre 2 e 40 caracteres (apenas letras, números e hífen).' });
  }

  const query = currentRestId > 0 
    ? `SELECT id FROM restaurantes WHERE slug = ? AND id != ?`
    : `SELECT id FROM restaurantes WHERE slug = ?`;
  const params = currentRestId > 0 ? [slug, currentRestId] : [slug];

  masterDb.get(query, params, (err, row) => {
    if (err) return res.status(500).json({ available: false, slug, error: 'Erro de validação no servidor.' });
    if (row) return res.json({ available: false, slug, error: 'Este link já está em uso por outro restaurante.' });
    res.json({ available: true, slug, baseDomain: BASE_DOMAIN, previewUrl: `https://${slug}.${BASE_DOMAIN}` });
  });
});

// ── Definir Slug individualmente ──
app.post('/api/auth/definir-slug', verificarToken, (req, res) => {
  const restauranteId = req.restaurante_id;
  const raw = (req.body && req.body.slug) || '';
  const slug = String(raw).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug) {
    masterDb.run(`UPDATE restaurantes SET slug = NULL WHERE id = ?`, [restauranteId], () => {
      if (typeof loadDomainMaps === 'function') loadDomainMaps();
      return res.json({ success: true, slug: null });
    });
    return;
  }

  if (slug.length < 2 || slug.length > 40) {
    return res.status(400).json({ success: false, error: 'Slug deve ter entre 2 e 40 caracteres.' });
  }

  masterDb.get(`SELECT id FROM restaurantes WHERE slug = ? AND id != ?`, [slug, restauranteId], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: 'Erro no servidor.' });
    if (row) return res.status(400).json({ success: false, error: 'Este link já está em uso.' });

    masterDb.run(`UPDATE restaurantes SET slug = ? WHERE id = ?`, [slug, restauranteId], function(errUp) {
      if (errUp) return res.status(500).json({ success: false, error: 'Erro ao salvar link.' });
      if (typeof loadDomainMaps === 'function') loadDomainMaps();
      res.json({ success: true, slug, url: `https://${slug}.${BASE_DOMAIN}` });
    });
  });
});

// ── Verificar disponibilidade de domínio personalizado ──
app.get('/api/auth/check-dominio', verificarToken, (req, res) => {
  const raw = req.query.domain || '';
  const currentRestId = req.restaurante_id || 0;
  const domain = String(raw).trim().toLowerCase().replace(/[^a-z0-9.\-]/g, '').replace(/\.$/, '');

  if (!domain || !domain.includes('.')) {
    return res.json({ available: false, domain, error: 'Domínio inválido. Exemplo: meuhotel.com.br' });
  }

  const query = currentRestId > 0
    ? `SELECT id FROM restaurantes WHERE custom_domain = ? AND id != ?`
    : `SELECT id FROM restaurantes WHERE custom_domain = ?`;
  const params = currentRestId > 0 ? [domain, currentRestId] : [domain];

  masterDb.get(query, params, (err, row) => {
    if (err) return res.status(500).json({ available: false, domain, error: 'Erro de validação no servidor.' });
    if (row) return res.json({ available: false, domain, error: 'Este domínio já está em uso por outro restaurante.' });
    res.json({ available: true, domain, previewUrl: `https://${domain}` });
  });
});

// ── Definir domínio personalizado ──
app.post('/api/auth/definir-dominio', verificarToken, (req, res) => {
  const restauranteId = req.restaurante_id;
  const raw = (req.body && req.body.domain) || '';
  const domain = String(raw).trim().toLowerCase().replace(/[^a-z0-9.\-]/g, '').replace(/\.$/, '');

  if (!domain) {
    masterDb.run(`UPDATE restaurantes SET custom_domain = NULL WHERE id = ?`, [restauranteId], () => {
      if (typeof loadDomainMaps === 'function') loadDomainMaps();
      return res.json({ success: true, domain: null });
    });
    return;
  }

  if (!domain.includes('.') || domain.length < 4 || domain.length > 253) {
    return res.status(400).json({ success: false, error: 'Domínio inválido. Exemplo: meuhotel.com.br' });
  }

  masterDb.get(`SELECT id FROM restaurantes WHERE custom_domain = ? AND id != ?`, [domain, restauranteId], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: 'Erro no servidor.' });
    if (row) return res.status(400).json({ success: false, error: 'Este domínio já está em uso.' });

    masterDb.run(`UPDATE restaurantes SET custom_domain = ? WHERE id = ?`, [domain, restauranteId], function(errUp) {
      if (errUp) return res.status(500).json({ success: false, error: 'Erro ao salvar domínio.' });
      if (typeof loadDomainMaps === 'function') loadDomainMaps();
      res.json({ success: true, domain, url: `https://${domain}` });
    });
  });
});

// ── Onboarding de equipe apos registro ──
app.post('/api/auth/equipe-onboarding', verificarToken, async (req, res) => {
  const { equipe, slug } = req.body;
  const restauranteId = req.restaurante_id;
  if (!restauranteId) return res.status(400).json({ success: false, error: 'Restaurante invalido.' });

  // Se um slug foi fornecido, valida e salva
  if (slug && typeof slug === 'string') {
    const cleanSlug = slug.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (cleanSlug.length >= 2 && cleanSlug.length <= 40) {
      await new Promise((resolve) => {
        masterDb.get(`SELECT id FROM restaurantes WHERE slug = ? AND id != ?`, [cleanSlug, restauranteId], (err, row) => {
          if (!err && !row) {
            masterDb.run(`UPDATE restaurantes SET slug = ? WHERE id = ?`, [cleanSlug, restauranteId], () => {
              if (typeof loadDomainMaps === 'function') loadDomainMaps();
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    }
  }

  if (!Array.isArray(equipe) || equipe.length === 0) return res.status(400).json({ success: false, error: 'Envie pelo menos um funcionario.' });

  const restauranteNome = await new Promise((resolve) => {
    masterDb.get(`SELECT nome FROM restaurantes WHERE id = ?`, [restauranteId], (e, r) => resolve(r ? r.nome : null));
  });

  const dbPath = path.join(__dirname, `database_${restauranteId}.sqlite`);
  if (!fsSync.existsSync(dbPath)) {
    await createFreshTenantDb(dbPath, restauranteNome);
  }
  if (!fsSync.existsSync(dbPath)) return res.status(500).json({ success: false, error: 'Erro ao criar banco do restaurante.' });

  const tenantDb = new sqlite3.Database(dbPath);
  let criados = 0;
  let erros = 0;

  const criarFuncionario = (f) => new Promise((resolve) => {
    const hash = bcrypt.hashSync(f.senha, 10);
    tenantDb.run(
      `INSERT INTO funcionarios (nome, usuario, senha, cargo, valor_hora, status, restaurante_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [f.nome, f.usuario, hash, f.cargo || 'Garcom', f.valor_hora || 0, f.status || 'Pendente', restauranteId],
      function(err) {
        if (err) { erros++; } else { criados++; }
        resolve();
      }
    );
  });

  for (const f of equipe) {
    if (f.nome && f.usuario && f.senha) {
      await criarFuncionario(f);
    }
  }

  tenantDb.close(() => {
    res.json({ success: true, criados, erros });
  });
});


// ════════════════════════════════════════════════════════════════════
// ENDPOINTS REST: FUNCIONÁRIOS, CUPONS E MINHA REDE (PAINEL DO DONO)
// ════════════════════════════════════════════════════════════════════

// ── Minha Rede (Multi-Lojas Dono) ──
app.get('/api/auth/minha-rede', (req, res) => {
  try {
    masterDb.all('SELECT id, nome FROM restaurantes WHERE ativo = 1 ORDER BY id', [], (err, rows) => {
      res.json({ success: true, atual: 1, rede: rows || [] });
    });
  } catch(e) {
    res.json({ success: true, atual: 1, rede: [] });
  }
});

// ── Funcionários ──
app.get('/api/funcionarios', (req, res) => {
  db.all('SELECT id, nome, usuario, cargo, status, valor_hora, tipo_remuneracao, valor_dia, valor_semana, valor_mes, chave_pix, cpf, telefone, observacao_rh, data_cadastro FROM funcionarios ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/funcionarios', (req, res) => {
  const { nome, usuario, senha, cargo, valor_hora, tipo_remuneracao, valor_dia, valor_semana, valor_mes, chave_pix, cpf, telefone, observacao_rh } = req.body || {};
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

  db.run(
    `INSERT INTO funcionarios (nome, usuario, senha, cargo, valor_hora, tipo_remuneracao, valor_dia, valor_semana, valor_mes, chave_pix, cpf, telefone, observacao_rh, data_cadastro)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
    [nome, usuario || '', senha || '1234', cargo || 'Atendente', valor_hora || 0, tipo_remuneracao || 'hora', valor_dia || 0, valor_semana || 0, valor_mes || 0, chave_pix || '', cpf || '', telefone || '', observacao_rh || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.delete('/api/funcionarios/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM funcionarios WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ── Cupons ──
app.get('/api/cupons', (req, res) => {
  db.all('SELECT * FROM cupons ORDER BY rowid DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/cupons', (req, res) => {
  const { codigo, titulo, valor_tipo, valor, validade, limite_usos, itens_json, dias_horarios_json } = req.body || {};
  if (!codigo) return res.status(400).json({ error: 'Código do cupom é obrigatório.' });

  db.run(
    `INSERT INTO cupons (codigo, titulo, valor_tipo, valor, validade, limite_usos, itens_json, dias_horarios_json, data_criacao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
     ON CONFLICT(codigo) DO UPDATE SET
       titulo = excluded.titulo,
       valor_tipo = excluded.valor_tipo,
       valor = excluded.valor,
       validade = excluded.validade,
       limite_usos = excluded.limite_usos,
       itens_json = excluded.itens_json,
       dias_horarios_json = excluded.dias_horarios_json`,
    [codigo.toUpperCase(), titulo || '', valor_tipo || 'percentual', valor || 0, validade || '', limite_usos || 1, itens_json || '[]', dias_horarios_json || '[]'],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.delete('/api/cupons/:codigo', (req, res) => {
  const codigo = req.params.codigo;
  db.run('DELETE FROM cupons WHERE codigo = ?', [codigo], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/cupons/:codigo/desempenho', (req, res) => {
  const codigo = req.params.codigo;
  db.get('SELECT COUNT(*) as total_usos, COALESCE(SUM(desconto_aplicado), 0) as economia_total FROM cupons_usos WHERE codigo_cupom = ?', [codigo], (err, row) => {
    res.json(row || { total_usos: 0, economia_total: 0 });
  });
});


// ── Produtos para o Modal de Cupons & Promoções ──

// ── Rotas Auxiliares do Sistema & Suporte ──
app.get('/api/layout/injected-css', (req, res) => {
  res.setHeader('Content-Type', 'text/css; charset=utf-8');
  db.get('SELECT valor FROM configuracoes WHERE chave = "custom_css_override"', (err, row) => {
    if (row && row.valor) return res.send(row.valor);
    res.send('/* Chef Injected CSS */');
  });
});

app.get('/api/configuracoes', (req, res) => {
  db.all('SELECT * FROM configuracoes', [], (err, rows) => {
    const configMap = {};
    if (rows) rows.forEach(r => { configMap[r.chave] = r.valor; });
    res.json(configMap);
  });
});

app.post('/api/configuracoes', (req, res) => {
  const configs = req.body || {};
  const entries = Object.entries(configs);
  let done = 0;
  if (entries.length === 0) return res.json({ success: true });
  entries.forEach(([chave, valor]) => {
    const valStr = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
    db.run(
      'INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = ?',
      [chave, valStr, valStr],
      () => {
        done++;
        if (done === entries.length) res.json({ success: true });
      }
    );
  });
});

app.get('/api/plugins/admin', (req, res) => {
  res.json({ success: true, plugins: [] });
});

app.get('/api/funcoes', (req, res) => {
  res.json({ success: true, funcoes: [] });
});

app.get('/api/config/produtos', (req, res) => {
  withTenant(req, () => {
    db.all('SELECT id, nome, preco, emoji, categoria, visibilidade, status FROM produtos WHERE status != \'inativo\' ORDER BY nome', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });
});

app.get('/api/mensagens', (req, res) => {
  res.json({ success: true, mensagens: [] });
});

app.get('/api/plugins/list', (req, res) => {
  res.json({ success: true, plugins: [] });
});

app.get('/api/licenca/status-quarentena', (req, res) => {
  res.json({ status: 'ativa', quarentena: false, dias_restantes: 30 });
});

app.post('/api/pwa/telemetria', (req, res) => {
  res.json({ success: true });
});

app.post('/api/seguranca/reportar-violacao', (req, res) => {
  res.json({ success: true });
});

app.get('/api/mesas', (req, res) => {
  db.all('SELECT * FROM mesas ORDER BY id ASC', [], (err, rows) => {
    res.json(rows || []);
  });
});

app.get('/api/produtos', (req, res) => {
  db.all('SELECT id, nome as name, preco as price, categoria as category, emoji FROM produtos ORDER BY id DESC', [], (err, rows) => {
    res.json(rows || []);
  });
});

// ── Módulo Premium de Marketing & Disparo em Massa ──
app.get('/api/marketing/status', (req, res) => {
  db.get('SELECT valor FROM configuracoes WHERE chave = "modulo_marketing_ativo"', (err, row) => {
    const ativo = row && row.valor === 'true';
    db.get('SELECT COUNT(*) as total_clientes FROM clientes', (err2, countRow) => {
      res.json({
        ativo: Boolean(ativo),
        total_clientes: countRow?.total_clientes || 0,
        plano: 'Pro Marketing Push + WhatsApp'
      });
    });
  });
});

app.post('/api/marketing/ativar', (req, res) => {
  db.run('INSERT INTO configuracoes (chave, valor) VALUES ("modulo_marketing_ativo", "true") ON CONFLICT(chave) DO UPDATE SET valor = "true"', [], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, mensagem: 'Módulo Premium de Mensagens & Push ativado!' });
  });
});

app.post('/api/marketing/disparo-massa', (req, res) => {
  const { mensagem, cupom_codigo, publico } = req.body || {};
  if (!mensagem) return res.status(400).json({ error: 'Mensagem não informada.' });

  db.get('SELECT COUNT(*) as count FROM clientes', (err, row) => {
    const total = row?.count || 12;
    console.log(`📢 [MARKETING PUSH/WHATSAPP] Disparado para ${total} clientes: "${mensagem}" (Cupom: ${cupom_codigo || 'Nenhum'})`);
    res.json({ success: true, enviados: total, cupom: cupom_codigo });
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ success: false, error: 'Preencha e-mail e senha.' });

  masterDb.get(`SELECT u.*, r.ativo as r_ativo, r.licenca, r.data_cadastro FROM usuarios u JOIN restaurantes r ON u.restaurante_id = r.id WHERE u.username = ? AND u.ativo = 1`, [email], async (err, user) => {
    if (err || !user) return res.status(401).json({ success: false, error: 'Usuário não encontrado ou inativo.' });

    // Validar Trial
    if (user.licenca === 'trial') {
      const dataCad = new Date(user.data_cadastro);
      const agora = new Date();
      const diffDias = Math.floor((agora - dataCad) / (1000 * 60 * 60 * 24));
      if (diffDias > 7) {
        return res.status(403).json({ success: false, error: 'Período de teste (7 dias) expirou. Contate o suporte.' });
      }
    }

    if (!user.r_ativo) return res.status(403).json({ success: false, error: 'Restaurante inativo.' });

    const match = await bcrypt.compare(senha, user.password_hash);
    if (!match) return res.status(401).json({ success: false, error: 'Senha incorreta.' });

    const token = jwt.sign({ id: user.id, restaurante_id: user.restaurante_id, role: user.role }, JWT_SECRET, { expiresIn: '90d' });
    res.json({ success: true, token, restaurante_id: user.restaurante_id, role: user.role });
  });
});

// ── Deslogar Restaurante do Sistema ──
app.post('/api/auth/deslogar-restaurante', verificarToken, async (req, res) => {
  const { senha, restaurante_id } = req.body;
  const adminId = req.restaurante_id;
  if (!senha) return res.status(400).json({ success: false, error: 'Senha obrigatoria.' });

  masterDb.get(`SELECT * FROM usuarios WHERE restaurante_id = ? AND role = 'admin' AND ativo = 1`, [adminId], async (err, user) => {
    if (err || !user) return res.status(404).json({ success: false, error: 'Admin nao encontrado.' });
    const match = await bcrypt.compare(senha, user.password_hash);
    if (!match) return res.status(401).json({ success: false, error: 'Senha incorreta.' });

    masterDb.run(`UPDATE restaurantes SET ativo = 0 WHERE id = ?`, [adminId], function (errUp) {
      if (errUp) return res.status(500).json({ success: false, error: 'Erro ao desativar.' });

      masterDb.run(`UPDATE usuarios SET ativo = 0 WHERE restaurante_id = ?`, [adminId], () => {
        res.json({ success: true, message: 'Restaurante deslogado e desativado com sucesso.' });
      });
    });
  });
});

// Middleware JWT Universal para proteger Rotas de API
function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(403).json({ success: false, error: 'Nenhum token fornecido.' });

  const token = authHeader.split(' ')[1]; // Formato: Bearer TOKEN
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ success: false, error: 'Sessão expirada ou token inválido.' });

    // Substitui o middleware temporário da Fase 1
    req.restaurante_id = decoded.restaurante_id;
    req.user_role = decoded.role;
    tenantContext.run(decoded.restaurante_id, () => {
      next();
    });
  });
}

// ─── Plugin Pix & QR Code Dinâmico ───
try {
  require('./plugins/pix')({ app, db, io });
  console.log('[Pix] Plugin Pix e QR Code Dinâmico inicializado.');
} catch (e) {
  console.error('[Pix] Falha ao inicializar plugin Pix:', e);
}

// ─── App Store de Temas (catálogo global, curadoria e aplicação por restaurante) ───
try {
  require('./plugins/theme-curator')({
    app,
    db: masterDb,
    masterDb,
    io,
    options: { JWT_SECRET, superAdminAuth, verificarToken },
    log: (m) => console.log(`[theme-curator] ${m}`)
  });
} catch (e) {
  console.error('[theme-curator] Falha ao inicializar:', e);
}

// Health check (sem auth, para load balancer / monitor) ────────────
app.get('/healthz', (req, res) => {
  const checks = { status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() };
  if (typeof db !== 'undefined' && db && typeof db.get === 'function') {
    db.get('SELECT 1 AS ok', [], (err) => {
      if (err) return res.status(503).json({ status: 'error', db: 'unavailable', uptime: checks.uptime });
      res.json({ ...checks, db: 'ok' });
    });
  } else {
    res.json(checks);
  }
});

// Graceful shutdown: encerra conexões socket e o HTTP server em até 5s
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${signal}] Encerrando servidor com graça...`);
  const force = setTimeout(() => {
    console.error('Forçando saída após timeout.');
    process.exit(1);
  }, 5000);
  force.unref();
  try { io.close(); } catch (e) { }
  server.close(() => {
    console.log('Servidor encerrado.');
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Inicializar licença e depois subir o servidor com Animação Visualizer / Matrix ────────────
licenseManager.initLicense().then((licState) => {
  server.listen(PORT, HOST, () => {
    const ip = getLocalIp();

    const banner = `
${ANSI.cyan}${ANSI.bright}  ╭─────────────────────────── System Fetch ───────────────────────────╮${ANSI.reset}
${ANSI.cyan}  │${ANSI.reset}   ${ANSI.magenta}󰣇 System:${ANSI.reset}     Chef Cozinha SaaS Kernel v1.0.0
${ANSI.cyan}  │${ANSI.reset}   ${ANSI.yellow}⚡ Engine:${ANSI.reset}     Node.js ${process.version} (${process.platform})
${ANSI.cyan}  │${ANSI.reset}   ${ANSI.green}🟢 Status:${ANSI.reset}     Online & Pronto (Porta ${PORT})
${ANSI.cyan}  │${ANSI.reset}   ${ANSI.cyan}📡 Local API:${ANSI.reset}  http://localhost:${PORT}
${ANSI.cyan}  │${ANSI.reset}   ${ANSI.blue}📱 Network:${ANSI.reset}    https://${ip}:5173
${ANSI.cyan}  │${ANSI.reset}   ${ANSI.magenta}🔑 License:${ANSI.reset}    ${licState.status.toUpperCase()} (${licState.restaurante || 'Dev Mode'})
${ANSI.cyan}  │${ANSI.reset}   ${ANSI.yellow}📊 Health:${ANSI.reset}     ${getEfficiencyStars()}
${ANSI.cyan}  ╰────────────────────────────────────────────────────────────────────╯${ANSI.reset}
${ANSI.dim}────────────────────────────────────────────────────────────────────────${ANSI.reset}
`;
    originalLog.apply(console, [banner]);

    isMatrixAnimating = false;
    while (pendingLogs.length > 0) {
      const fn = pendingLogs.shift();
      fn();
    }

  });
});


// ═══════════════════════════════════════════════════════════════
// AFILIADOS & PARCEIROS (MÉTRICAS E AMBIENTE PRÓPRIO)
// ═══════════════════════════════════════════════════════════════

// Listar todos os afiliados (Super Admin)
app.get('/api/super/afiliados', superAdminAuth, (req, res) => {
  db.all(`
    SELECT a.*, 
           COUNT(DISTINCT v.id) as total_vendas,
           COALESCE(SUM(v.valor_venda), 0) as total_faturado,
           COALESCE(SUM(v.comissao_valor), 0) as total_comissoes
    FROM afiliados a
    LEFT JOIN afiliado_vendas v ON a.id = v.afiliado_id
    GROUP BY a.id
    ORDER BY a.id DESC
  `, [], (err, rows) => {
    if (err) return res.json({ ok: false, erro: err.message });
    res.json({ ok: true, afiliados: rows || [] });
  });
});

// Criar novo afiliado
app.post('/api/super/afiliados', superAdminAuth, async (req, res) => {
  try {
    const { nome, email, telefone, codigo_ref, comissao_percentual, chave_pix, senha } = req.body;
    if (!nome || !email || !codigo_ref) {
      return res.json({ ok: false, erro: 'Nome, E-mail e Código de Afiliado são obrigatórios.' });
    }
    const codeClean = codigo_ref.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const passHash = senha ? await bcrypt.hash(senha, 10) : await bcrypt.hash('123456', 10);
    const comissao = parseFloat(comissao_percentual) || 10;

    db.run(
      `INSERT INTO afiliados (nome, email, telefone, codigo_ref, comissao_percentual, chave_pix, password_hash, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'ativo')`,
      [nome.trim(), email.trim().toLowerCase(), telefone || '', codeClean, comissao, chave_pix || '', passHash],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.json({ ok: false, erro: 'E-mail ou Código de Afiliado já cadastrado.' });
          }
          return res.json({ ok: false, erro: err.message });
        }
        res.json({ ok: true, id: this.lastID, codigo_ref: codeClean });
      }
    );
  } catch (e) {
    res.json({ ok: false, erro: e.message });
  }
});

// Editar afiliado
app.put('/api/super/afiliados/:id', superAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, email, telefone, comissao_percentual, chave_pix, status, senha } = req.body;
    
    let updates = ['nome = ?', 'email = ?', 'telefone = ?', 'comissao_percentual = ?', 'chave_pix = ?', 'status = ?'];
    let params = [nome, email, telefone, parseFloat(comissao_percentual) || 10, chave_pix, status || 'ativo'];

    if (senha && senha.trim().length >= 4) {
      const hash = await bcrypt.hash(senha.trim(), 10);
      updates.push('password_hash = ?');
      params.push(hash);
    }

    params.push(id);
    db.run(`UPDATE afiliados SET ${updates.join(', ')} WHERE id = ?`, params, function (err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true });
    });
  } catch (e) {
    res.json({ ok: false, erro: e.message });
  }
});

// Excluir afiliado
app.delete('/api/super/afiliados/:id', superAdminAuth, (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM afiliados WHERE id = ?`, [id], (err) => {
    if (err) return res.json({ ok: false, erro: err.message });
    res.json({ ok: true });
  });
});

// Detalhes / Métricas completas de um afiliado (Super Admin)
app.get('/api/super/afiliados/:id/metricas', superAdminAuth, (req, res) => {
  const { id } = req.params;
  db.get(`SELECT * FROM afiliados WHERE id = ?`, [id], (err, afil) => {
    if (err || !afil) return res.json({ ok: false, erro: 'Afiliado não encontrado.' });

    db.all(`SELECT * FROM afiliado_vendas WHERE afiliado_id = ? ORDER BY id DESC`, [id], (errVendas, vendas) => {
      res.json({
        ok: true,
        afiliado: afil,
        vendas: vendas || []
      });
    });
  });
});

// Login do Afiliado para entrar no seu próprio Portal
app.post('/api/afiliado/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.json({ ok: false, erro: 'Preencha email e senha.' });

  db.get(`SELECT * FROM afiliados WHERE LOWER(email) = LOWER(?)`, [email.trim()], async (err, afil) => {
    if (err || !afil) return res.json({ ok: false, erro: 'Afiliado não encontrado.' });
    if (afil.status !== 'ativo') return res.json({ ok: false, erro: 'Conta de afiliado inativa ou suspensa.' });

    const match = await bcrypt.compare(senha, afil.password_hash || '');
    if (!match) return res.json({ ok: false, erro: 'Senha incorreta.' });

    const token = jwt.sign({ id: afil.id, codigo_ref: afil.codigo_ref, role: 'afiliado' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ ok: true, token, afiliado: { id: afil.id, nome: afil.nome, email: afil.email, codigo_ref: afil.codigo_ref } });
  });
});

// Dashboard do Afiliado (Autenticado pelo token do afiliado)
app.get('/api/afiliado/dashboard', (req, res) => {
  const tokenHeader = req.headers['authorization'] || req.headers['x-afiliado-token'];
  if (!tokenHeader) return res.json({ ok: false, erro: 'Token não fornecido.' });
  
  const token = tokenHeader.replace(/^Bearers+/, '');
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err || !decoded || decoded.role !== 'afiliado') {
      return res.json({ ok: false, erro: 'Sessão inválida ou expirada.' });
    }

    db.get(`SELECT id, nome, email, telefone, codigo_ref, comissao_percentual, chave_pix FROM afiliados WHERE id = ?`, [decoded.id], (errA, afil) => {
      if (errA || !afil) return res.json({ ok: false, erro: 'Afiliado não encontrado.' });

      db.all(`SELECT * FROM afiliado_vendas WHERE afiliado_id = ? ORDER BY id DESC`, [decoded.id], (errV, vendas) => {
        const listV = vendas || [];
        const totalFaturado = listV.reduce((acc, v) => acc + (v.valor_venda || 0), 0);
        const totalComissao = listV.reduce((acc, v) => acc + (v.comissao_valor || 0), 0);
        const comissoesPagas = listV.filter(v => v.status === 'pago').reduce((acc, v) => acc + (v.comissao_valor || 0), 0);
        const comissoesPendentes = listV.filter(v => v.status === 'pendente').reduce((acc, v) => acc + (v.comissao_valor || 0), 0);

        res.json({
          ok: true,
          afiliado: afil,
          stats: {
            totalVendas: listV.length,
            totalFaturado,
            totalComissao,
            comissoesPagas,
            comissoesPendentes
          },
          vendas: listV
        });
      });
    });
  });
});

// API /api/dono/dashboard & /api/dashboard/metrics — Métricas em tempo real para o Painel do Dono
const handleDashboardMetrics = (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader ? authHeader.split(' ')[1] : req.query.token;

  const processMetrics = (tenantId) => {
    const dbInst = db;
    if (!dbInst) return res.status(500).json({ success: false, error: 'Banco de dados indisponível.' });

    const periodo = req.query.periodo || 'hoje';
    const dataInicio = req.query.data_inicio;
    const dataFim = req.query.data_fim;

    let dateWhere = "date(createdAt) = date('now', 'localtime')";
    let rotulo = 'Hoje';

    if (periodo === 'ontem') {
      dateWhere = "date(createdAt) = date('now', '-1 day', 'localtime')";
      rotulo = 'Ontem';
    } else if (periodo === 'semana') {
      dateWhere = "createdAt >= date('now', '-7 days', 'localtime')";
      rotulo = 'Últimos 7 dias';
    } else if (periodo === 'mes') {
      dateWhere = "strftime('%Y-%m', createdAt) = strftime('%Y-%m', 'now', 'localtime')";
      rotulo = 'Este Mês';
    } else if (periodo === 'custom' && dataInicio && dataFim) {
      dateWhere = `date(createdAt) BETWEEN '${dataInicio}' AND '${dataFim}'`;
      rotulo = `${dataInicio} a ${dataFim}`;
    }

    dbInst.get(`
      SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as totalPedidos
      FROM pedidos 
      WHERE status IN ('Finalizado', 'Entregue') AND ${dateWhere}
    `, [], (err1, faturamentoRow) => {
      if (err1) return res.status(500).json({ success: false, error: err1.message });

      dbInst.get(`
        SELECT COUNT(DISTINCT localName) as ativas 
        FROM pedidos 
        WHERE status NOT IN ('Finalizado', 'Cancelado', 'Entregue')
      `, [], (err2, mesasRow) => {
        if (err2) return res.status(500).json({ success: false, error: err2.message });

        dbInst.get(`
          SELECT COALESCE(AVG(total), 0) as avgTotal 
          FROM pedidos 
          WHERE status IN ('Finalizado', 'Entregue') AND ${dateWhere}
        `, [], (err3, ticketRow) => {
          if (err3) return res.status(500).json({ success: false, error: err3.message });

          dbInst.get(`
            SELECT COUNT(*) as ativos 
            FROM pontos 
            WHERE data_saida IS NULL OR saida IS NULL
          `, [], (err4, ativosRow) => {
            db.get(`
              SELECT id, status, fundo_troco, data_abertura, data_fechamento 
              FROM turnos_caixa 
              ORDER BY id DESC 
              LIMIT 1
            `, [], (err5, caixaRow) => {
              console.log('DEBUG handleDashboardMetrics err5:', err5 ? err5.message : null, 'caixaRow:', caixaRow);
              let activeRow = caixaRow;
              const isCaixaAberto = Boolean(activeRow && (activeRow.status === 'Aberto' || (!activeRow.data_fechamento && activeRow.status !== 'Fechado')));
              const caixaStatus = isCaixaAberto ? 'Aberto' : 'Fechado';
              const caixaSaldo = activeRow ? (activeRow.fundo_troco || 0) : 0;

              dbInst.all(`
                SELECT productName, productEmoji, SUM(quantity) as quantidade, SUM(total) as total
                FROM pedidos
                WHERE status IN ('Finalizado', 'Entregue') AND ${dateWhere}
                GROUP BY productName, productEmoji
                ORDER BY quantidade DESC
                LIMIT 5
              `, [], (err6, topProdutos) => {
                res.json({
                  success: true,
                  data: {
                    rotuloPeriodo: rotulo,
                    totalPedidos: faturamentoRow?.totalPedidos || 0,
                    faturamentoHoje: faturamentoRow?.total || 0,
                    mesasAtivas: mesasRow?.ativas || 0,
                    ticketMedio: ticketRow?.avgTotal || 0,
                    colaboradoresAtivos: ativosRow?.ativos || 0,
                    caixaStatus: caixaStatus,
                    caixaSaldo: caixaSaldo,
                    topProdutos: topProdutos || []
                  }
                });
              });
            });
          });
        });
      });
    });
  };

  if (!token) return processMetrics(1);

  jwt.verify(token, JWT_SECRET, (errToken, decoded) => {
    if (errToken || !decoded) return processMetrics(1);
    processMetrics(decoded.restaurante_id || 1);
  });
};

app.get('/api/dono/dashboard', handleDashboardMetrics);
app.get('/api/dashboard/metrics', handleDashboardMetrics);

// API /api/auth/notificar-impostor — Alerta em tempo real de tentativa não autorizada no Painel do Dono
app.post('/api/auth/notificar-impostor', (req, res) => {
  const { email, cargo, restaurante_id } = req.body || {};
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'IP desconhecido';
  const restId = parseInt(restaurante_id) || 1;

  masterDb.get(`SELECT nome FROM restaurantes WHERE id = ?`, [restId], (errRest, restRow) => {
    const nomeRestaurante = restRow ? restRow.nome : `Restaurante #${restId}`;
    const detalhes = `⚠️ TENTATIVA DE IMPOSTOR: Usuário '${email}' (Cargo: ${cargo}) tentou acessar o Painel do Dono sem permissão! IP: ${ip}`;

    // 1. Registra no Log de Auditoria
    masterDb.run(
      `INSERT INTO suporte_logs_audit (suporte_id, suporte_nome, acao, detalhes, ip) VALUES (?, ?, ?, ?, ?)`,
      [0, email || 'Desconhecido', 'TENTATIVA_IMPOSTOR_PAINEL_DONO', detalhes, ip]
    );

    // 2. Notifica o Super Admin em tempo real via Socket.IO
    if (io) {
      io.emit('alerta_impostor_super_admin', {
        email,
        cargo,
        restaurante_id: restId,
        restaurante_nome: nomeRestaurante,
        ip,
        data_tentativa: new Date().toISOString(),
        mensagem: `🚨 ATENÇÃO SUPER-ADMIN: Tentativa de Impostor no ${nomeRestaurante}! O funcionário '${email}' (${cargo}) tentou acessar o Painel do Dono.`
      });

      // 3. Notifica o Gerente/Dono do Restaurante via Socket.IO
      io.to(`restaurante_${restId}`).emit('alerta_seguranca_gerente', {
        titulo: '⚠️ Alerta de Segurança',
        mensagem: `O colaborador '${email}' (${cargo}) tentou acessar o Painel do Dono sem autorização.`,
        ip,
        data: new Date().toLocaleTimeString('pt-BR')
      });
    }

    res.json({ ok: true, registrado: true });
  });
});

// ══════ PLUGINS & MÓDULOS ══════
// CREATE TABLE IF NOT EXISTS super_plugins (plugin_id TEXT PRIMARY KEY, nome TEXT, descricao TEXT, ativo INTEGER DEFAULT 1, atualizado_em DATETIME DEFAULT (datetime('now','localtime')));
masterDb.serialize(() => {
  masterDb.run(`CREATE TABLE IF NOT EXISTS super_plugins (
    plugin_id TEXT PRIMARY KEY,
    nome TEXT,
    descricao TEXT,
    ativo INTEGER DEFAULT 1,
    atualizado_em DATETIME DEFAULT (datetime('now','localtime'))
  )`);
  const defaultPlugins = [
    ['ifood', 'iFood Integrado Direct', 'Integração nativa de pedidos, cardápio e cancelamento automático com o iFood.'],
    ['whatsapp', 'WhatsApp Bot Atendimento', 'Disparo de notificação de pedido pronto e robô de pedidos automáticos.'],
    ['balanca', 'Balança Self-Service / Kilo', 'Conexão direta com balanças Toledo, Filizola e Urano via Serial/USB.'],
    ['kds', 'KDS Inteligente (Cozinha)', 'Painel de TV para gerenciamento de pedidos na cozinha com tempos de preparo.'],
    ['pix_automatico', 'Pagamentos PIX Automáticos', 'Geração automática de QR Code PIX e conciliação de pagamentos.']
  ];
  defaultPlugins.forEach(p => {
    masterDb.run(`INSERT OR IGNORE INTO super_plugins (plugin_id, nome, descricao, ativo) VALUES (?, ?, ?, 1)`, p);
  });
});

// ═══ TABELA: Temas por Tenant ═══
masterDb.run(`CREATE TABLE IF NOT EXISTS tenant_temas (
  restaurante_id INTEGER PRIMARY KEY,
  tema_json TEXT NOT NULL,
  atualizado_em DATETIME DEFAULT (datetime('now','localtime'))
)`);

// ═══ TABELA: Tarefas Super Admin ═══
masterDb.run(`CREATE TABLE IF NOT EXISTS super_tarefas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  descricao TEXT DEFAULT '',
  prioridade TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'pendente',
  criado_por TEXT DEFAULT 'super_admin',
  atribuido_a TEXT DEFAULT '',
  restaurante_id INTEGER,
  categoria TEXT DEFAULT 'geral',
  resposta TEXT DEFAULT '',
  criado_em DATETIME DEFAULT (datetime('now','localtime')),
  atualizado_em DATETIME DEFAULT (datetime('now','localtime')),
  atribuido_em DATETIME,
  concluido_em DATETIME
)`);

app.get('/api/super/plugins', superAdminAuth, (req, res) => {
  masterDb.all(`SELECT * FROM super_plugins ORDER BY plugin_id`, [], (err, rows) => {
    if (err) return res.json({ ok: false, erro: err.message });
    res.json({ ok: true, plugins: rows || [] });
  });
});

app.post('/api/super/plugins', superAdminAuth, (req, res) => {
  const { plugin_id, ativo } = req.body || {};
  if (!plugin_id) return res.json({ ok: false, erro: 'plugin_id é obrigatório.' });
  masterDb.run(`UPDATE super_plugins SET ativo = ?, atualizado_em = datetime('now','localtime') WHERE plugin_id = ?`,
    [ativo ? 1 : 0, plugin_id], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      if (io) {
        io.emit('plugin_atualizado', { plugin_id, ativo: !!ativo });
      }
      res.json({ ok: true, mensagem: `Plugin ${plugin_id} ${ativo ? 'ativado' : 'desativado'}.` });
    });
});

// GET /api/super/commits — Lista os últimos 15 commits do repositório Git
// Cada commit vem anotado com status (estavel/quebrado) e nota rápida salvas pelo super admin.
app.get('/api/super/commits', superAdminAuth, (req, res) => {
  const { exec } = require('child_process');
  exec('git log -n 15 --pretty=format:"%h|%s|%an|%ar"', (err, stdout) => {
    if (err) return res.json({ ok: false, erro: 'Falha ao obter histórico Git: ' + err.message });
    const lines = stdout.split('\n').filter(Boolean);
    const commits = lines.map(line => {
      const parts = line.split('|');
      return {
        hash: parts[0],
        mensagem: parts[1] || 'Sem mensagem',
        autor: parts[2] || 'Anônimo',
        data: parts[3] || 'Recente'
      };
    });
    masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = 'commit_meta'`, [], (errM, rowM) => {
      let meta = {};
      if (!errM && rowM && rowM.valor) { try { meta = JSON.parse(rowM.valor); } catch (e) { } }
      commits.forEach(c => {
        const m = meta[c.hash];
        if (m) { c.status = m.status || null; c.nota = m.nota || ''; }
      });
      res.json({ ok: true, commits });
    });
  });
});

// POST /api/super/commits/meta — Marca commit como estável/quebrado e salva nota rápida
app.post('/api/super/commits/meta', superAdminAuth, (req, res) => {
  const { hash } = req.body || {};
  const status = req.body && req.body.status !== undefined ? req.body.status : null;
  const nota = req.body && req.body.nota !== undefined ? String(req.body.nota).slice(0, 500) : null;
  const safeHash = String(hash || '').replace(/[^a-f0-9]/gi, '');
  if (!safeHash) return res.json({ ok: false, erro: 'Hash do commit é obrigatório.' });
  if (status !== null && !['estavel', 'quebrado', ''].includes(status)) {
    return res.json({ ok: false, erro: 'Status inválido. Use "estavel", "quebrado" ou "".' });
  }
  masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = 'commit_meta'`, [], (err, row) => {
    let meta = {};
    if (!err && row && row.valor) { try { meta = JSON.parse(row.valor); } catch (e) { } }
    const atual = meta[safeHash] || {};
    if (status !== null) atual.status = status || null;
    if (nota !== null) atual.nota = nota;
    atual.ts = Date.now();
    meta[safeHash] = atual;
    const valor = JSON.stringify(meta);
    masterDb.run(`INSERT INTO configuracoes_global (chave, valor) VALUES ('commit_meta', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [valor], (errS) => {
      if (errS) return res.json({ ok: false, erro: errS.message });
      res.json({ ok: true, mensagem: 'Commit atualizado.', meta: meta[safeHash] });
    });
  });
});

// ── SUPER ADMIN: ALTERAR SENHA ──────────────────────────────────────
// Salva hash dedicado em configuracoes_global; a partir daí só a nova senha abre o painel.
app.post('/api/super/alterar-senha', superAdminAuth, async (req, res) => {
  try {
    const { senha_atual, nova_senha } = req.body || {};
    if (!senha_atual || !nova_senha) return res.json({ ok: false, erro: 'Informe a senha atual e a nova senha.' });
    if (String(nova_senha).length < 8) return res.json({ ok: false, erro: 'A nova senha deve ter pelo menos 8 caracteres.' });
    if (String(nova_senha).length > 72) return res.json({ ok: false, erro: 'A nova senha deve ter no máximo 72 caracteres.' });
    const okAtual = await verificarSenhaAdmin(String(senha_atual));
    if (!okAtual) return res.json({ ok: false, erro: 'Senha atual incorreta.' });
    const hash = await bcrypt.hash(String(nova_senha), 10);
    masterDb.run(`INSERT INTO configuracoes_global (chave, valor) VALUES ('super_admin_senha_hash', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [hash], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      try { if (typeof registrarAuditLog === 'function') registrarAuditLog(null, 'super_admin', 'ALTERAR_SENHA_ADMIN', 'Senha do super admin alterada via painel', req); } catch (e) { }
      res.json({ ok: true, mensagem: 'Senha alterada com sucesso! Use a nova senha no próximo login.' });
    });
  } catch (e) {
    res.json({ ok: false, erro: e.message });
  }
});

// ── RESTAURANTE: REPORTAR PROBLEMA → vira tarefa para a equipe de suporte ──
// Middleware local de autenticação de suporte (autossuficiente para o bundle prod)
const relatoSuporteAuth = (req, res, next) => {
  const token = req.headers['x-suporte-token'];
  if (!token) return res.json({ ok: false, erro: 'Token de suporte não fornecido.' });
  try {
    const decoded = jwt.verify(token, process.env.SUPORTE_JWT_SECRET || 'chef-suporte-secret-key-2026');
    req.suporteId = decoded.id;
    req.suporteData = decoded;
    next();
  } catch (e) { res.json({ ok: false, erro: 'Sessão de suporte inválida ou expirada.' }); }
};

app.post('/api/dono/reportar-problema', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(403).json({ ok: false, erro: 'Nenhum token fornecido.' });
  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (errToken, decoded) => {
    if (errToken || !decoded) return res.status(401).json({ ok: false, erro: 'Sessão expirada ou token inválido.' });
    if (decoded.role !== 'admin' && decoded.role !== 'gerente') return res.status(403).json({ ok: false, erro: 'Acesso não autorizado.' });

    const { titulo, descricao, categoria, prioridade } = req.body || {};
    if (!titulo || String(titulo).trim().length < 4 || String(titulo).trim().length > 120) return res.json({ ok: false, erro: 'Informe um título de 4 a 120 caracteres.' });
    if (!descricao || String(descricao).trim().length < 5 || String(descricao).trim().length > 1500) return res.json({ ok: false, erro: 'Descreva o problema em até 1500 caracteres.' });
    const cat = ['bug', 'duvida', 'sugestao', 'outro'].includes(categoria) ? categoria : 'outro';
    const pri = ['baixa', 'media', 'alta'].includes(prioridade) ? prioridade : 'media';
    const tenantId = decoded.restaurante_id || 1;

    masterDb.get(`SELECT nome FROM restaurantes WHERE id = ?`, [tenantId], (errR, rowR) => {
      const nomeRestaurante = (errR || !rowR) ? ('Restaurante #' + tenantId) : rowR.nome;
      const descFinal = `[RELATO ${cat.toUpperCase()} • prioridade ${pri.toUpperCase()}] ${String(titulo).trim()}\nRestaurante: ${nomeRestaurante}\n\n${String(descricao).trim()}`;
      masterDb.run(`INSERT INTO tarefas_suporte (suporte_id, tipo, descricao, restaurante_id, pontos, status, criada_em) VALUES (NULL, 'relato_restaurante', ?, ?, 15, 'pendente', datetime('now','localtime'))`,
        [descFinal, tenantId],
        function(err) {
          if (err) return res.json({ ok: false, erro: err.message });
          try {
            io.emit('nova_tarefa_suporte', { id: this.lastID, restaurante_id: tenantId, restaurante_nome: nomeRestaurante, titulo: String(titulo).trim(), categoria: cat, prioridade: pri });
          } catch (e) {}
          res.json({ ok: true, id: this.lastID, mensagem: 'Relato enviado! Nossa equipe de suporte já foi notificada.' });
        }
      );
    });
  });
});

// GET /api/suporte/tarefas-relatadas - Fila de relatos enviados pelos restaurantes (não assumidos)
app.get('/api/suporte/tarefas-relatadas', relatoSuporteAuth, (req, res) => {
  masterDb.all(`SELECT t.*, r.nome as restaurante_nome FROM tarefas_suporte t LEFT JOIN restaurantes r ON t.restaurante_id = r.id WHERE t.tipo = 'relato_restaurante' AND t.status = 'pendente' AND t.suporte_id IS NULL ORDER BY t.criada_em DESC LIMIT 50`,
    [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, relatos: rows || [] });
    }
  );
});

// POST /api/suporte/assumir-relato - Atendente assume um relato da fila
app.post('/api/suporte/assumir-relato', relatoSuporteAuth, (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.json({ ok: false, erro: 'ID do relato obrigatório.' });
  masterDb.run(`UPDATE tarefas_suporte SET suporte_id = ? WHERE id = ? AND tipo = 'relato_restaurante' AND status = 'pendente' AND suporte_id IS NULL`,
    [req.suporteId, parseInt(id)], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      if (this.changes === 0) return res.json({ ok: false, erro: 'Relato não disponível (já assumido por outro atendente).' });
      res.json({ ok: true, mensagem: 'Relato assumido! Ele agora está nas suas tarefas.' });
    }
  );
});

// POST /api/suporte/concluir-tarefa - Atendente conclui uma das suas tarefas
app.post('/api/suporte/concluir-tarefa', relatoSuporteAuth, (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.json({ ok: false, erro: 'ID da tarefa obrigatório.' });
  masterDb.run(`UPDATE tarefas_suporte SET status = 'concluida', concluida_em = datetime('now','localtime') WHERE id = ? AND suporte_id = ? AND status IN ('pendente','aviso')`,
    [parseInt(id), req.suporteId], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      if (this.changes === 0) return res.json({ ok: false, erro: 'Tarefa não encontrada ou já concluída.' });
      masterDb.run(`UPDATE equipe_suporte SET xp = xp + 10 WHERE id = ?`, [req.suporteId]);
      res.json({ ok: true, mensagem: 'Tarefa concluída! +10 XP' });
    }
  );
});

// POST /api/super/deploy-commit — Executa deploy zero-downtime para um commit específico
app.post('/api/super/deploy-commit', superAdminAuth, (req, res) => {
  const { hash } = req.body || {};
  if (!hash) return res.json({ ok: false, erro: 'Hash do commit é obrigatório.' });

  const { exec: execCb } = require('child_process');
  const safeHash = String(hash).replace(/[^a-f0-9]/gi, '');

  execCb(`git fetch origin && git checkout ${safeHash}`, (err, stdout, stderr) => {
    if (err) return res.json({ ok: false, erro: 'Erro ao alternar para o commit: ' + (stderr || err.message) });

    const reloadResult = [];
    const modulesToReload = [
      './controllers/super-admin.js',
      './controllers/socket-financeiro.js',
      './controllers/sync-server.js',
      './deployment-config.js',
      './sync-agent.js',
      './feature-plans.js'
    ];
    modulesToReload.forEach(mod => {
      try {
        delete require.cache[require.resolve(mod)];
        reloadResult.push({ modulo: mod, status: 'recarregado' });
      } catch (e) {
        reloadResult.push({ modulo: mod, status: 'ignorado: ' + e.message });
      }
    });

    if (io) {
      io.emit('sistema_hot_swapped', {
        hash: safeHash,
        data: new Date().toISOString(),
        reload_result: reloadResult,
        mensagem: 'Servidor atualizado para commit ' + safeHash + '. Recarregue a página para ver mudanças.'
      });
    }

    res.json({
      ok: true,
      mensagem: `Deploy Zero-Downtime efetuado para o commit ${safeHash}. ${reloadResult.length} módulo(s) recarregado(s).`,
      reload_result: reloadResult
    });
  });
});

// --- CONTROLLER DO SUPER ADMIN INTEGRADO ---
if (!process.env.SUPER_ADMIN_ISOLADO) {
  try {
    const metricSocketCount = (tid) => {
      let count = 0;
      activeSockets.forEach(conn => {
        if (conn.restaurante_id === tid) count++;
      });
      return count;
    };

    require('./controllers/super-admin')(app, masterDb, sqlite3, {
      JWT_SECRET,
      superAdminAuth,
      io,
      featurePlans: require('./feature-plans'),
      loadAllTenantFeatures: async () => {},
      getTenantFeaturesSync: (tid) => require('./feature-plans').getPlanDefaults('ativo'),
      isTenantFeatureEnabled: (tid, f) => true,
      metricSocketCount,
      ifoodApi: null,
      baseDomain: process.env.BASE_DOMAIN || 'localhost',
      reloadDomainMaps: async () => {},
      createFreshTenantDb: null,
      ifoodDeps: null
    });
    console.log('👑 Controller do Super Admin carregado com sucesso no servidor principal.');
  } catch (e) {
    console.error('Erro ao carregar o Controller do Super Admin:', e);
  }
}
