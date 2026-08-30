/**
 * controllers/super-admin.js
 * Endpoints e regras de negócio completas para o Painel Super Admin
 */
'use strict';

const fsSync = require('fs');
const path = require('path');
let bcrypt;
try { bcrypt = require('bcryptjs'); } catch (e) { bcrypt = require('bcrypt'); }
const jwt = require('jsonwebtoken');
const { exec } = require('child_process');
const { createLoadControl } = require('../load-control');

module.exports = function (app, masterDb, sqlite3, options) {
  const { JWT_SECRET, superAdminAuth, io } = options;
  const featurePlans = options.featurePlans;
  const loadAllTenantFeatures = options.loadAllTenantFeatures;
  const getTenantFeaturesSync = options.getTenantFeaturesSync;
  const isTenantFeatureEnabled = options.isTenantFeatureEnabled;
  const metricSocketCount = options.metricSocketCount;
  const ifoodApi = options.ifoodApi;
  const ifoodDeps = options.ifoodDeps;

  // Inicializa Controle de Carga
  const loadControl = createLoadControl({ masterDb });
  try {
    loadControl.init(() => {
      loadControl.startMonitor();
    });
  } catch (e) {
    console.error('[LoadControl Init Error]', e);
  }

  function getTenantDbPath(tenantId) {
    const tid = parseInt(tenantId) || 1;
    return path.join(__dirname, '..', `database_${tid}.sqlite`);
  }

  function listarBancosTenant() {
    try {
      const rootDir = path.join(__dirname, '..');
      const files = fsSync.readdirSync(rootDir)
        .filter(f => /^database_\d+\.sqlite$/.test(f))
        .map(f => path.join(rootDir, f));
      if (files.length === 0 && fsSync.existsSync(path.join(rootDir, 'database_1.sqlite'))) {
        return [path.join(rootDir, 'database_1.sqlite')];
      }
      return files;
    } catch (e) {
      return [];
    }
  }

  function trimStr(v, maxLen = 500) {
    return typeof v === 'string' ? v.trim().substring(0, maxLen) : '';
  }

  function openTenantReadOnly(dbPath) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) return reject(err);
        db.run('PRAGMA busy_timeout = 5000;', () => resolve(db));
      });
    });
  }

  function safeInt(v, min = 0, max = Infinity) {
    const n = parseInt(v, 10);
    return isNaN(n) ? min : Math.max(min, Math.min(max, n));
  }

  function getClientIp(req) {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    return String(rawIp).replace('::ffff:', '');
  }

  // ═══════════════════════════════════════════════════════════════
  // USUÁRIOS
  // ═══════════════════════════════════════════════════════════════

  // GET /api/super/usuarios — lista todos os usuários dos bancos
  app.get('/api/super/usuarios', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT id, restaurante_id, username, role, ativo, data_cadastro FROM usuarios ORDER BY id`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, usuarios: rows || [] });
    });
  });

  // POST /api/super/reset-credenciais — reseta email e/ou senha de um usuário
  app.post('/api/super/reset-credenciais', superAdminAuth, async (req, res) => {
    try {
      const { userId, novoEmail, novaSenha } = req.body;
      if (!userId) return res.json({ ok: false, erro: 'ID do usuário é obrigatório.' });
      if (!novoEmail && !novaSenha) return res.json({ ok: false, erro: 'Informe pelo menos o novo email ou a nova senha.' });

      const updates = [];
      const params = [];

      if (novoEmail) {
        const emailTrimmed = novoEmail.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
          return res.json({ ok: false, erro: 'Formato de email inválido.' });
        }
        updates.push('username = ?');
        params.push(emailTrimmed);
      }

      if (novaSenha) {
        if (novaSenha.length < 4) return res.json({ ok: false, erro: 'A senha deve ter no mínimo 4 caracteres.' });
        const hash = await bcrypt.hash(novaSenha, 10);
        updates.push('password_hash = ?');
        params.push(hash);
      }

      params.push(parseInt(userId));

      masterDb.run(
        `UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`,
        params,
        function (err) {
          if (err) return res.json({ ok: false, erro: err.message });
          if (this.changes === 0) return res.json({ ok: false, erro: 'Usuário não encontrado.' });
          res.json({ ok: true, mensagem: 'Credenciais atualizadas com sucesso!' });
        }
      );
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // POST /api/super/criar-usuario — cria novo usuário admin
  app.post('/api/super/criar-usuario', superAdminAuth, async (req, res) => {
    try {
      const { email, senha, restauranteId } = req.body;
      if (!email || !senha) return res.json({ ok: false, erro: 'Email e senha são obrigatórios.' });
      const emailTrimmed = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
        return res.json({ ok: false, erro: 'Formato de email inválido.' });
      }
      if (senha.length < 4) return res.json({ ok: false, erro: 'A senha deve ter no mínimo 4 caracteres.' });

      const hash = await bcrypt.hash(senha, 10);
      const rid = parseInt(restauranteId) || 1;
      const agora = new Date().toISOString().replace('T', ' ').substring(0, 19);

      masterDb.run(
        `INSERT INTO usuarios (restaurante_id, username, password_hash, role, ativo, data_cadastro) VALUES (?, ?, ?, 'admin', 1, ?)`,
        [rid, emailTrimmed, hash, agora],
        function (err) {
          if (err) {
            if (err.message && err.message.includes('UNIQUE')) return res.json({ ok: false, erro: 'Este email já está cadastrado.' });
            return res.json({ ok: false, erro: err.message });
          }
          res.json({ ok: true, mensagem: 'Usuário criado com sucesso!', id: this.lastID });
        }
      );
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // DELETE /api/super/usuario/:id — desativa usuário
  app.delete('/api/super/usuario/:id', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.json({ ok: false, erro: 'ID inválido.' });
    masterDb.run(`UPDATE usuarios SET ativo = 0 WHERE id = ?`, [id], function (err) {
      if (err) return res.json({ ok: false, erro: err.message });
      if (this.changes === 0) return res.json({ ok: false, erro: 'Usuário não encontrado.' });
      res.json({ ok: true, mensagem: 'Usuário desativado com sucesso.' });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RESTAURANTES
  // ═══════════════════════════════════════════════════════════════

  // GET /api/super/restaurantes — lista todos os restaurantes
  app.get('/api/super/restaurantes', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT * FROM restaurantes ORDER BY id DESC`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });

      const lista = rows || [];
      if (lista.length === 0) return res.json({ ok: true, clients: [] });

      let pendentes = lista.length;
      const mapped = lista.map(r => ({
        id: String(r.id),
        restaurante: r.nome,
        telefone: r.telefone || r.dono_telefone || '',
        dono_nome: r.dono_nome || '',
        dono_telefone: r.dono_telefone || r.telefone || '',
        dono_email: r.dono_email || '',
        status: r.ativo ? (r.licenca || 'ativo') : 'bloqueado',
        plano: r.licenca === 'premium' ? 'Premium' : (r.licenca === 'trial' ? 'Trial' : (r.licenca || 'Ativo')),
        login_mode: r.login_mode || 'multi',
        chave: r.chave_ativacao || ('CHEF-LOCAL-' + String(r.id).padStart(4, '0')),
        validade: r.validade_licenca || null,
        maxDisp: r.max_dispositivos || 0,
        ultimaVer: r.data_cadastro,
        versao: 'Local-1.0',
        ip: '127.0.0.1',
        regiao: 'Local Server',
        obs: 'Restaurante do sistema.',
        total_funcionarios: 0
      }));

      function finalizar() {
        res.json({ ok: true, clients: mapped });
      }

      mapped.forEach(item => {
        const restId = parseInt(item.id);
        const tenantDbPath = getTenantDbPath(restId);
        if (!fsSync.existsSync(tenantDbPath)) {
          pendentes--;
          if (pendentes <= 0) finalizar();
          return;
        }
        openTenantReadOnly(tenantDbPath).then(tDb => {
          tDb.get("SELECT COUNT(*) as c FROM funcionarios WHERE status = 'Ativo'", [], (errCount, rowCount) => {
            if (!errCount && rowCount) item.total_funcionarios = rowCount.c;
            tDb.close();
            pendentes--;
            if (pendentes <= 0) finalizar();
          });
        }).catch(() => {
          pendentes--;
          if (pendentes <= 0) finalizar();
        });
      });
    });
  });

  // POST /api/super/criar-restaurante-completo — setup inicial completo
  app.post('/api/super/criar-restaurante-completo', superAdminAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const nome = (body.nome || '').trim();
      if (!nome) return res.json({ ok: false, erro: 'Nome do restaurante é obrigatório.' });

      const alertas = [];

      // 1) Validar chave de ativação (se fornecida)
      let licencaVal = (body.licenca || 'trial').trim().toLowerCase();
      let validade = null;
      let maxDisp = 0;
      const chave = (body.chave_ativacao || '').trim().toUpperCase();

      if (chave) {
        const lic = await new Promise((resolve) => {
          masterDb.get(`SELECT * FROM licencas WHERE chave = ?`, [chave], (e, r) => resolve(e ? null : r));
        });
        if (!lic) {
          return res.json({ ok: false, erro: 'Chave de ativação inválida.' });
        }
        if (lic.status === 'revogada') {
          return res.json({ ok: false, erro: 'Chave de ativação revogada.' });
        }
        const hoje = new Date().toISOString().split('T')[0];
        if (lic.validade && lic.validade < hoje) {
          return res.json({ ok: false, erro: 'Chave de ativação expirada.' });
        }
        if (lic.status === 'usada' && lic.install_id) {
          return res.json({ ok: false, erro: 'Chave já utilizada em outra instalação.' });
        }
        licencaVal = lic.plano || 'premium';
        validade = lic.validade || null;
        maxDisp = lic.max_dispositivos || 0;
      }

      const activeVal = body.ativo !== undefined ? (body.ativo ? 1 : 0) : 1;
      const modeVal = body.login_mode || 'multi';
      const slug = (body.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || null;
      const customDomain = (body.custom_domain || '').trim().toLowerCase() || null;

      // 2) Criar restaurante
      const newId = await new Promise((resolve, reject) => {
        masterDb.run(
          `INSERT INTO restaurantes (nome, licenca, ativo, login_mode, chave_ativacao, validade_licenca, max_dispositivos, slug, custom_domain, data_cadastro)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
          [nome, licencaVal, activeVal, modeVal, chave || null, validade, maxDisp, slug, customDomain],
          function(err) { err ? reject(err) : resolve(this.lastID); }
        );
      });

      // 3) Criar banco do tenant vazio + schema + dados iniciais
      const tenantDbPath = path.join(__dirname, '..', `database_${newId}.sqlite`);
      if (!fsSync.existsSync(tenantDbPath)) {
        try {
          if (typeof options.createFreshTenantDb === 'function') {
            await options.createFreshTenantDb(tenantDbPath, nome);
          }
        } catch (eDb) { alertas.push('Erro ao criar banco: ' + eDb.message); }
      }

      // 4) Marcar chave como usada
      if (chave) {
        const agora = new Date().toLocaleString();
        masterDb.run(
          `UPDATE licencas SET status = 'usada', usada_em = ?, usada_por = ?, install_id = ? WHERE chave = ?`,
          [agora, nome, 'super-admin-' + newId, chave], () => {}
        );
      }

      // 5) Criar usuário admin/dono padrão
      let adminUserId = null;
      const adminEmail = (body.email || '').trim() || 'admin@cheff.pro';
      const adminSenha = body.senha || 'admin123';
      const adminNome = (body.admin_nome || '').trim() || 'Administrador Cheff';

      const hash = await bcrypt.hash(adminSenha, 10);
      adminUserId = await new Promise((resolve, reject) => {
        masterDb.run(
          `INSERT INTO usuarios (restaurante_id, username, password_hash, role, nome, ativo) VALUES (?, ?, ?, 'admin', ?, 1)`,
          [newId, adminEmail, hash, adminNome],
          function(err) { err ? reject(err) : resolve(this.lastID); }
        );
      }).catch((e) => {
        alertas.push('Aviso ao registrar admin: ' + e.message);
        return null;
      });

      // 6) Criar funcionários iniciais
      const funcs = body.funcionarios_iniciais || [];
      let funcsCriados = 0;
      for (const f of funcs) {
        const fNome = (f.nome || '').trim();
        if (!fNome) continue;
        const fCargo = (f.cargo || 'Garçom').trim();
        const fValor = parseFloat(f.valor_hora) || 0;
        const fEmail = (f.email || '').trim() || (fNome.toLowerCase().replace(/\s+/g, '.') + '@temp.local');
        const fSenha = f.senha || '1234';
        const fHash = await bcrypt.hash(fSenha, 10).catch(() => null);
        if (fHash) {
          await new Promise((resolve) => {
            masterDb.run(
              `INSERT INTO usuarios (restaurante_id, username, password_hash, role, ativo) VALUES (?, ?, ?, ?, 1)`,
              [newId, fEmail, fHash, fCargo === 'Admin' || fCargo === 'admin' ? 'admin' : fCargo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')],
              function() { resolve(); }
            );
          });
          funcsCriados++;
        }
      }
      if (funcs.length > 0) {
        alertas.push(funcsCriados + ' funcionário(s) criado(s)');
      }

      // 7) Configurações iniciais do tenant
      const cfg = body.config_iniciais || {};
      const cfgEntries = Object.entries(cfg);
      if (cfgEntries.length > 0) {
        try {
          const tenantDb = await new Promise((resolve, reject) => {
            const dbPath = path.join(__dirname, '..', `database_${newId}.sqlite`);
            const db = new sqlite3.Database(dbPath, (err) => err ? reject(err) : resolve(db));
          });
          await new Promise((resolve) => {
            tenantDb.serialize(() => {
              tenantDb.run(`CREATE TABLE IF NOT EXISTS configuracoes (chave TEXT PRIMARY KEY, valor TEXT)`, () => {});
              for (const [k, v] of cfgEntries) {
                tenantDb.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)`, [k, String(v)], () => {});
              }
              tenantDb.close(() => resolve());
            });
          });
        } catch (eCfg) {
          alertas.push('Erro ao salvar config: ' + eCfg.message);
        }
      }

      // 8) Salvar overrides de features (se fornecidos)
      const features = body.features || null;
      if (features && typeof features === 'object') {
        try {
          const featurePlans = options.featurePlans;
          if (featurePlans) {
            // Calcula diffs em relação ao plano base
            const overrides = {};
            const basePlan = featurePlans.getPlanDefaults(licencaVal);
            let hasOverrides = false;
            for (const f of featurePlans.FEATURES) {
              const baseVal = !!basePlan[f.chave];
              const desired = !!features[f.chave];
              if (desired !== baseVal) {
                overrides[f.chave] = desired;
                hasOverrides = true;
              }
            }
            if (hasOverrides) {
              await new Promise((resolve) => {
                masterDb.run(
                  `INSERT INTO tenant_features (restaurante_id, overrides_json, updated_at) VALUES (?, ?, datetime('now','localtime'))
                   ON CONFLICT(restaurante_id) DO UPDATE SET overrides_json = excluded.overrides_json, updated_at = excluded.updated_at`,
                  [newId, JSON.stringify(overrides)],
                  () => resolve()
                );
              });
            }
          }
        } catch (eFeat) {
          alertas.push('Erro ao salvar módulos: ' + eFeat.message);
        }
      }

      // 9) Recarregar caches
      if (typeof options.reloadDomainMaps === 'function') {
        await options.reloadDomainMaps();
      }
      if (typeof options.loadAllTenantFeatures === 'function') {
        await options.loadAllTenantFeatures();
      }

      res.json({
        ok: true,
        id: newId,
        nome: nome,
        licenca: licencaVal,
        admin_criado: !!adminUserId,
        alertas: alertas,
        mensagem: 'Restaurante "' + nome + '" criado com sucesso!'
      });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // POST /api/super/criar-restaurante — cria novo restaurante (simples)
  app.post('/api/super/criar-restaurante', superAdminAuth, async (req, res) => {
    try {
      const { nome, licenca, ativo, login_mode, slug, custom_domain } = req.body || {};
      if (!nome) return res.json({ ok: false, erro: 'Nome do restaurante é obrigatório.' });

      const activeVal = ativo !== undefined ? (ativo ? 1 : 0) : 1;
      const licencaVal = licenca || 'ativo';
      const modeVal = login_mode || 'multi';
      const cleanSlug = (slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || null;
      const cleanDom = (custom_domain || '').trim().toLowerCase() || null;

      masterDb.run(
        `INSERT INTO restaurantes (nome, licenca, ativo, login_mode, slug, custom_domain, data_cadastro) VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
        [nome, licencaVal, activeVal, modeVal, cleanSlug, cleanDom],
        async function (err) {
          if (err) return res.json({ ok: false, erro: err.message });
          const newId = this.lastID;
          const tenantDbPath = path.join(__dirname, '..', `database_${newId}.sqlite`);
          if (!fsSync.existsSync(tenantDbPath)) {
            try {
              if (typeof options.createFreshTenantDb === 'function') {
                await options.createFreshTenantDb(tenantDbPath, nome);
              }
            } catch (e) { }
          }
          if (typeof options.reloadDomainMaps === 'function') {
            await options.reloadDomainMaps();
          }
          res.json({ ok: true, mensagem: 'Restaurante criado com sucesso!', id: newId, slug: cleanSlug, custom_domain: cleanDom });
        }
      );
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // POST /api/super/atualizar-restaurante — atualiza dados do restaurante
  app.post('/api/super/atualizar-restaurante', superAdminAuth, async (req, res) => {
    try {
      const { id, nome, licenca, ativo, login_mode, validade_licenca, max_dispositivos } = req.body;
      if (!id) return res.json({ ok: false, erro: 'ID do restaurante é obrigatório.' });

      const updates = [];
      const params = [];

      if (nome) { updates.push('nome = ?'); params.push(nome); }
      if (licenca) { updates.push('licenca = ?'); params.push(licenca); }
      if (ativo !== undefined) { updates.push('ativo = ?'); params.push(ativo ? 1 : 0); }
      if (login_mode) { updates.push('login_mode = ?'); params.push(login_mode); }
      if (validade_licenca !== undefined) { updates.push('validade_licenca = ?'); params.push(validade_licenca); }
      if (max_dispositivos !== undefined) { updates.push('max_dispositivos = ?'); params.push(parseInt(max_dispositivos) || 0); }

      if (updates.length === 0) return res.json({ ok: false, erro: 'Nenhum campo para atualizar.' });

      params.push(parseInt(id));

      masterDb.run(
        `UPDATE restaurantes SET ${updates.join(', ')} WHERE id = ?`,
        params,
        function (err) {
          if (err) return res.json({ ok: false, erro: err.message });
          res.json({ ok: true, mensagem: 'Restaurante atualizado com sucesso!' });
        }
      );
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // DELETE /api/super/restaurante/:id — desativa restaurante
  app.delete('/api/super/restaurante/:id', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.json({ ok: false, erro: 'ID inválido.' });
    masterDb.run(`UPDATE restaurantes SET ativo = 0 WHERE id = ?`, [id], function (err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: 'Restaurante desativado com sucesso.' });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DASHBOARD STATS & BI
  // ═══════════════════════════════════════════════════════════════

  // GET /api/super/dashboard-stats — estatísticas gerais
  app.get('/api/super/dashboard-stats', superAdminAuth, async (req, res) => {
    try {
      const counts = await new Promise((resolve) => {
        masterDb.all(`SELECT licenca, ativo FROM restaurantes`, [], (err, rows) => {
          const stats = { ativas: 0, trials: 0, expiradas: 0, bloqueadas: 0 };
          if (err || !rows) return resolve(stats);
          rows.forEach(r => {
            if (!r.ativo) stats.bloqueadas++;
            else if (r.licenca === 'trial') stats.trials++;
            else if (r.licenca === 'expirado') stats.expiradas++;
            else stats.ativas++;
          });
          resolve(stats);
        });
      });

      const userCount = await new Promise((resolve) => {
        masterDb.get(`SELECT COUNT(*) as count FROM usuarios WHERE ativo = 1`, [], (err, row) => {
          resolve(row ? row.count : 0);
        });
      });

      let totalSales = 0;
      try {
        const dbFiles = listarBancosTenant();
        for (const dbPath of dbFiles) {
          const sales = await openTenantReadOnly(dbPath).then(tenantDb => {
            return new Promise((resolve) => {
              tenantDb.get("SELECT name FROM sqlite_master WHERE type='table' AND name='pedidos'", [], (errTable, tableRow) => {
                if (errTable || !tableRow) {
                  try { tenantDb.close(); } catch (e) { }
                  return resolve(0);
                }
                tenantDb.get("SELECT SUM(CAST(REPLACE(COALESCE(total,'0'), ',', '.') AS REAL)) as total_sales FROM pedidos WHERE status IN ('Finalizado', 'Pago')", [], (errQuery, rowQuery) => {
                  try { tenantDb.close(); } catch (e) { }
                  if (errQuery || !rowQuery) resolve(0);
                  else resolve(rowQuery.total_sales || 0);
                });
              });
            });
          }).catch(() => 0);
          totalSales += sales;
        }
      } catch (e) {
        console.error('[Dashboard-Stats] Erro ao calcular vendas:', e);
      }

      res.json({
        ok: true,
        stats: {
          ativas: counts.ativas,
          trials: counts.trials,
          expiradas: counts.expiradas,
          bloqueadas: counts.bloqueadas,
          usuarios: userCount,
          totalSales: parseFloat(totalSales.toFixed(2))
        }
      });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // GET /api/super/bi-franquias — BI consolidado
  app.get('/api/super/bi-franquias', superAdminAuth, async (req, res) => {
    try {
      const dias = Math.min(365, Math.max(1, parseInt(req.query.dias) || 30));
      const ate = req.query.ate || new Date().toISOString().slice(0, 10);
      const de = req.query.de || new Date(Date.now() - (dias - 1) * 86400000).toISOString().slice(0, 10);

      const restNames = await new Promise((resolve) => {
        masterDb.all(`SELECT id, nome FROM restaurantes`, [], (err, rows) => {
          const map = {};
          if (!err && rows) rows.forEach(r => map[String(r.id)] = r.nome);
          resolve(map);
        });
      });

      const dbFiles = listarBancosTenant();
      const restaurantes = [];
      let totalVendas = 0, totalPedidos = 0;

      for (const dbPath of dbFiles) {
        const idMatch = dbPath.match(/database_(\d+)\.sqlite$/);
        const restId = idMatch ? idMatch[1] : '1';
        const nome = (restId && restNames[restId]) || ('Restaurante #' + restId);

        await openTenantReadOnly(dbPath).then(tDb => {
          return new Promise((resolveOpen) => {
            tDb.get("SELECT name FROM sqlite_master WHERE type='table' AND name='pedidos'", [], (errTable, tableRow) => {
              if (errTable || !tableRow) { try { tDb.close(); } catch (e) { } return resolveOpen(); }
              const SQL_TOTAL = `CAST(REPLACE(CAST(total AS TEXT), ',', '.') AS REAL)`;
              tDb.all(
                `SELECT substr(createdAt,1,10) as dia, SUM(${SQL_TOTAL}) as total, COUNT(*) as qtd
                 FROM pedidos WHERE status IN ('Finalizado','Pago') AND substr(createdAt,1,10) BETWEEN ? AND ?
                 GROUP BY dia ORDER BY dia`,
                [de, ate], (errDias, diasRows) => {
                  const vendas_por_dia = (diasRows || []).map(r => ({ dia: r.dia, total: parseFloat(r.total || 0).toFixed(2) }));
                  const total = (diasRows || []).reduce((a, r) => a + (parseFloat(r.total) || 0), 0);
                  const qtd = (diasRows || []).reduce((a, r) => a + (r.qtd || 0), 0);

                  tDb.all(
                    `SELECT productName, SUM(quantity) as qty, SUM(${SQL_TOTAL}) as total
                     FROM pedidos
                     WHERE status IN ('Finalizado','Pago') AND substr(createdAt,1,10) BETWEEN ? AND ?
                       AND productName NOT LIKE 'Pgto %'
                     GROUP BY productName ORDER BY total DESC LIMIT 5`,
                    [de, ate], (errTop, topRows) => {
                      const top_produtos = (topRows || []).map(r => ({ nome: r.productName, qtd: r.qty || 0, total: parseFloat(r.total || 0).toFixed(2) }));
                      tDb.all(
                        `SELECT sector, SUM(${SQL_TOTAL}) as total FROM pedidos
                         WHERE status IN ('Finalizado','Pago') AND substr(createdAt,1,10) BETWEEN ? AND ?
                           AND productName NOT LIKE 'Pgto %'
                         GROUP BY sector ORDER BY total DESC`,
                        [de, ate], (errSet, setRows) => {
                          try { tDb.close(); } catch (e) { }
                          restaurantes.push({
                            id: restId,
                            nome,
                            total_vendas: parseFloat(total.toFixed(2)),
                            pedidos: qtd,
                            ticket_medio: qtd > 0 ? parseFloat((total / qtd).toFixed(2)) : 0,
                            vendas_por_dia,
                            top_produtos,
                            setores: (setRows || []).map(s => ({ setor: s.sector || 'Geral', total: parseFloat(s.total || 0).toFixed(2) }))
                          });
                          totalVendas += total;
                          totalPedidos += qtd;
                          resolveOpen();
                        }
                      );
                    }
                  );
                }
              );
            });
          });
        }).catch(() => {});
      }

      const ranking = restaurantes.slice().sort((a, b) => b.total_vendas - a.total_vendas);
      res.json({
        ok: true,
        de, ate, dias,
        total_vendas: parseFloat(totalVendas.toFixed(2)),
        total_pedidos: totalPedidos,
        ticket_medio_geral: totalPedidos > 0 ? parseFloat((totalVendas / totalPedidos).toFixed(2)) : 0,
        qtd_restaurantes: restaurantes.length,
        restaurantes,
        ranking
      });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // LICENÇAS
  // ═══════════════════════════════════════════════════════════════

  function gerarChaveAtivacao() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part = (len) => { let s = ''; for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length)); return s; };
    return `CHEF-${part(4)}-${part(4)}-${part(4)}`;
  }

  // GET /api/super/licencas — listar todas as chaves
  app.get('/api/super/licencas', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT * FROM licencas ORDER BY id DESC`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, licencas: rows || [] });
    });
  });

  // POST /api/super/licencas/gerar — gerar nova chave
  app.post('/api/super/licencas/gerar', superAdminAuth, (req, res) => {
    const { restaurante_nome, dias, plano, max_dispositivos, obs } = req.body || {};
    const nome = trimStr(restaurante_nome, 120) || 'Restaurante';
    const qtdDias = safeInt(dias, 30, 3650) || 365;
    const planoVal = ['premium', 'pro', 'plus'].includes(plano) ? plano : 'premium';
    const maxDisp = safeInt(max_dispositivos, 0, 1000) || 0;
    const validade = new Date(Date.now() + qtdDias * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const chave = gerarChaveAtivacao();
    masterDb.run(
      `INSERT INTO licencas (chave, restaurante_nome, plano, dias, validade, max_dispositivos, obs) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [chave, nome, planoVal, qtdDias, validade, maxDisp, trimStr(obs, 300) || ''],
      function (err) {
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, licenca: { id: this.lastID, chave, restaurante_nome: nome, plano: planoVal, dias: qtdDias, validade, max_dispositivos: maxDisp, obs: trimStr(obs, 300) || '', status: 'disponivel' } });
      }
    );
  });

  // POST /api/super/licencas/:id/revogar — revogar chave
  app.post('/api/super/licencas/:id/revogar', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.json({ ok: false, erro: 'ID inválido.' });
    masterDb.run(`UPDATE licencas SET status = 'revogada' WHERE id = ?`, [id], (err) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TELEMETRIA E LOGS
  // ═══════════════════════════════════════════════════════════════

  // GET /api/super/telemetria — lista telemetria consolidada
  app.get('/api/super/telemetria', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT t.*, r.nome as rest_nome FROM telemetria t LEFT JOIN restaurantes r ON r.id = t.restaurante_id ORDER BY t.ultima_atividade DESC`, [], (err, rows) => {
      if (err) return res.json({ ok: true, telemetria: [] });
      res.json({ ok: true, telemetria: rows || [] });
    });
  });

  // GET /api/super/logs-sistema — logs de auditoria e api
  app.get('/api/super/logs-sistema', superAdminAuth, (req, res) => {
    const search = req.query.search || '';
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const offset = Math.max(0, parseInt(req.query.offset) || 0);

    openTenantReadOnly(getTenantDbPath(1)).then(tDb => {
      let query = `SELECT * FROM auditoria`;
      const params = [];
      if (search) {
        query += ` WHERE operador LIKE ? OR acao LIKE ? OR detalhes LIKE ? OR motivo LIKE ?`;
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam, searchParam);
      }
      query += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      tDb.all(query, params, (err, rows) => {
        tDb.close();
        if (err) return res.json({ ok: true, rows: [], total: 0 });
        res.json({ ok: true, rows: rows || [], total: (rows || []).length });
      });
    }).catch(() => {
      res.json({ ok: true, rows: [], total: 0 });
    });
  });

  // GET /api/super/server-status — status e uso de memória
  app.get('/api/super/server-status', superAdminAuth, (req, res) => {
    const uptime = process.uptime();
    const mem = process.memoryUsage();
    const dbFiles = listarBancosTenant();
    if (fsSync.existsSync(path.join(__dirname, '..', 'master.sqlite'))) {
      dbFiles.push(path.join(__dirname, '..', 'master.sqlite'));
    }
    let totalDbSize = 0;
    dbFiles.forEach(f => {
      try { totalDbSize += fsSync.statSync(f).size; } catch (e) { }
    });

    const os = require('os');
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const platLabel = isWin ? 'Windows' : (isMac ? 'macOS' : 'Linux');

    res.json({
      ok: true,
      status: {
        uptime: Math.floor(uptime),
        memoria: {
          rss: mem.rss,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal
        },
        disco: {
          arquivos_banco: dbFiles.length,
          tamanho_total: totalDbSize
        },
        node: process.version,
        plataforma: process.platform,
        plataforma_label: platLabel,
        arch: process.arch,
        cpus: os.cpus().length,
        hostname: os.hostname(),
        pid: process.pid,
        dataHora: new Date().toISOString()
      }
    });
  });

  // POST /api/super/backup — criar backup de bancos de dados
  app.post('/api/super/backup', superAdminAuth, (req, res) => {
    try {
      const rootDir = path.join(__dirname, '..');
      const backupDir = path.join(rootDir, 'backups');
      if (!fsSync.existsSync(backupDir)) fsSync.mkdirSync(backupDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const files = listarBancosTenant();
      if (fsSync.existsSync(path.join(rootDir, 'master.sqlite'))) files.push(path.join(rootDir, 'master.sqlite'));
      const copied = [];
      files.forEach(src => {
        const f = path.basename(src);
        const dst = path.join(backupDir, f.replace(/\.sqlite$|\.db$/, '_backup_' + timestamp + (f.endsWith('.sqlite') ? '.sqlite' : '.db')));
        try { fsSync.copyFileSync(src, dst); copied.push(path.relative(rootDir, src)); } catch (e) { }
      });
      res.json({ ok: true, mensagem: 'Backup criado com sucesso!', arquivos: copied, timestamp });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // GET /api/super/config-global — listar configurações globais
  app.get('/api/super/config-global', superAdminAuth, (req, res) => {
    masterDb.all("SELECT chave, valor FROM configuracoes_global", [], (err, rows) => {
      if (err) return res.json({ ok: true, configs: {} });
      const cfgs = {};
      (rows || []).forEach(r => { cfgs[r.chave] = r.valor; });
      res.json({ ok: true, configs: cfgs });
    });
  });

  // POST /api/super/config-global — salvar configurações globais
  app.post('/api/super/config-global', superAdminAuth, (req, res) => {
    const configs = req.body || {};
    if (!Object.keys(configs).length) return res.json({ ok: false, erro: 'Nenhuma configuração informada.' });
    masterDb.serialize(() => {
      Object.keys(configs).forEach(chave => {
        const valor = typeof configs[chave] === 'object' ? JSON.stringify(configs[chave]) : String(configs[chave]);
        masterDb.run("INSERT INTO configuracoes_global (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", [chave, valor]);
      });
    });
    res.json({ ok: true, mensagem: 'Configurações salvas com sucesso!' });
  });

  // ═══════════════════════════════════════════════════════════════
  // CLIENTES (CRM GLOBAL)
  // ═══════════════════════════════════════════════════════════════

  // GET /api/super/clientes — lista clientes de todos os estabelecimentos
  app.get('/api/super/clientes', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT id, nome FROM restaurantes ORDER BY id`, [], (err, restaurantes) => {
      if (err) return res.json({ ok: false, erro: err.message });

      const restList = restaurantes || [];
      if (restList.length === 0) return res.json({ ok: true, clientes: [] });

      const todosClientes = [];
      let pendentes = restList.length;

      function finalizar() {
        todosClientes.sort((a, b) => a.restaurante_id - b.restaurante_id || String(a.nome).localeCompare(String(b.nome)));
        res.json({ ok: true, clientes: todosClientes });
      }

      restList.forEach(r => {
        const tenantDbPath = getTenantDbPath(r.id);
        if (!fsSync.existsSync(tenantDbPath)) {
          pendentes--;
          if (pendentes <= 0) finalizar();
          return;
        }

        openTenantReadOnly(tenantDbPath).then(tDb => {
          tDb.all(`SELECT * FROM clientes ORDER BY nome`, [], (errC, rows) => {
            const clientes = (!errC && rows) || [];
            if (clientes.length === 0) {
              try { tDb.close(); } catch (e) { }
              pendentes--;
              if (pendentes <= 0) finalizar();
              return;
            }

            let subPendentes = clientes.length;
            clientes.forEach(c => {
              tDb.get(`SELECT COUNT(*) as total_pedidos, COALESCE(SUM(CAST(REPLACE(COALESCE(total,'0'), ',', '.') AS REAL)), 0) as total_gasto FROM pedidos WHERE cliente_id = ? AND status IN ('Finalizado','Pago','Entregue')`, [c.id], (errP, stats) => {
                todosClientes.push({
                  id: c.id,
                  restaurante_id: r.id,
                  restaurante_nome: r.nome,
                  nome: c.nome,
                  telefone: c.telefone,
                  endereco: c.endereco,
                  data_nascimento: c.data_nascimento,
                  observacao: c.observacao || '',
                  pontos: c.pontos || 0,
                  total_pedidos: stats ? stats.total_pedidos || 0 : 0,
                  total_gasto: stats ? stats.total_gasto || 0 : 0
                });
                subPendentes--;
                if (subPendentes <= 0) {
                  try { tDb.close(); } catch (e) { }
                  pendentes--;
                  if (pendentes <= 0) finalizar();
                }
              });
            });
          });
        }).catch(() => {
          pendentes--;
          if (pendentes <= 0) finalizar();
        });
      });
    });
  });

  // GET /api/super/restaurantes/:id/funcionarios
  app.get('/api/super/restaurantes/:id/funcionarios', superAdminAuth, (req, res) => {
    const restauranteId = parseInt(req.params.id) || 1;
    const tenantDbPath = getTenantDbPath(restauranteId);

    if (!fsSync.existsSync(tenantDbPath)) {
      return res.json({ ok: true, funcionarios: [], restaurante_id: restauranteId });
    }

    openTenantReadOnly(tenantDbPath).then(tDb => {
      tDb.all(`SELECT * FROM funcionarios ORDER BY nome`, [], (err, rows) => {
        try { tDb.close(); } catch (e) { }
        if (err) return res.json({ ok: false, erro: err.message });

        const seguros = (rows || []).map(f => ({
          id: f.id,
          nome: f.nome,
          usuario: f.usuario,
          cargo: f.cargo,
          status: f.status || 'Ativo',
          valor_hora: f.valor_hora || 0,
          tipo_remuneracao: f.tipo_remuneracao || 'hora',
          valor_dia: f.valor_dia || 0,
          valor_semana: f.valor_semana || 0,
          valor_mes: f.valor_mes || 0,
          chave_pix: f.chave_pix || '',
          cpf: f.cpf || '',
          telefone: f.telefone || '',
          observacao_rh: f.observacao_rh || ''
        }));

        res.json({ ok: true, funcionarios: seguros, restaurante_id: restauranteId });
      });
    }).catch(() => {
      res.json({ ok: false, erro: 'Erro ao abrir banco.' });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // FUNÇÕES POR TENANT / PLANO (economia de recursos do servidor)
  // ═══════════════════════════════════════════════════════════════

  // GET /api/super/features — lista features, planos e estado de cada tenant
  app.get('/api/super/features', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT id, nome, licenca, ativo FROM restaurantes ORDER BY id`, [], (err, rests) => {
      if (err) return res.json({ ok: false, erro: err.message });
      masterDb.all(`SELECT restaurante_id, overrides_json FROM tenant_features`, [], (err2, ovs) => {
        const ovMap = {};
        (ovs || []).forEach(o => {
          try { ovMap[o.restaurante_id] = JSON.parse(o.overrides_json) || {}; } catch (e) { ovMap[o.restaurante_id] = {}; }
        });
        const tenants = (rests || []).map(r => ({
          id: r.id,
          nome: r.nome,
          licenca: r.licenca || 'ativo',
          plano: featurePlans.planoParaChave(r.licenca),
          ativo: !!r.ativo,
          overrides: ovMap[r.id] || {},
          features: featurePlans.resolveFeatures(r.licenca, ovMap[r.id])
        }));
        res.json({ ok: true, features: featurePlans.FEATURES, planos: featurePlans.FEATURE_PLANS, tenants });
      });
    });
  });

  // POST /api/super/features — altera feature, reseta padrões ou muda o plano de um tenant
  app.post('/api/super/features', superAdminAuth, async (req, res) => {
    const body = req.body || {};
    const rid = parseInt(body.restaurante_id, 10);
    if (!rid) return res.json({ ok: false, erro: 'ID do restaurante é obrigatório.' });

    try {
      if (typeof body.licenca === 'string') {
        const lic = body.licenca.trim().toLowerCase();
        if (!['trial', 'pro', 'premium', 'plus', 'ativo'].includes(lic)) {
          return res.json({ ok: false, erro: 'Plano inválido. Use trial, pro ou premium.' });
        }
        await new Promise((resolve) => {
          masterDb.run(`UPDATE restaurantes SET licenca = ? WHERE id = ?`, [lic, rid], resolve);
        });
      }

      if (body.reset) {
        await new Promise((resolve) => {
          masterDb.run(`DELETE FROM tenant_features WHERE restaurante_id = ?`, [rid], resolve);
        });
      } else if (body.feature) {
        const conhecida = featurePlans.FEATURES.some(f => f.chave === body.feature);
        if (!conhecida) return res.json({ ok: false, erro: 'Feature desconhecida.' });
        const enabled = !!body.enabled;

        const existing = await new Promise((resolve) => {
          masterDb.get(`SELECT overrides_json FROM tenant_features WHERE restaurante_id = ?`, [rid], (e, row) => resolve(e ? null : row));
        });
        let overrides = {};
        if (existing && existing.overrides_json) {
          try { overrides = JSON.parse(existing.overrides_json) || {}; } catch (e) { overrides = {}; }
        }
        overrides[body.feature] = enabled;

        await new Promise((resolve) => {
          masterDb.run(
            `INSERT INTO tenant_features (restaurante_id, overrides_json, updated_at) VALUES (?, ?, datetime('now','localtime'))
             ON CONFLICT(restaurante_id) DO UPDATE SET overrides_json = excluded.overrides_json, updated_at = excluded.updated_at`,
            [rid, JSON.stringify(overrides)],
            resolve
          );
        });

        // Efeito imediato no runtime
        if (body.feature === 'ifood' && ifoodApi) {
          if (enabled) {
            if (ifoodDeps && typeof ifoodDeps.isFeatureEnabled === 'function') {
              ifoodApi.ensurePoller(rid, ifoodDeps);
            }
          } else {
            ifoodApi.stopPoller(rid);
          }
        }
      } else {
        return res.json({ ok: false, erro: 'Informe feature+enabled, reset ou licenca.' });
      }

      if (typeof loadAllTenantFeatures === 'function') {
        await loadAllTenantFeatures();
      }
      res.json({ ok: true, mensagem: 'Funções atualizadas com sucesso!' });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // SOLICITAÇÕES DE FUNÇÕES (pedidos dos tenants)
  // ═══════════════════════════════════════════════════════════════

  // GET — lista solicitações (pendências primeiro)
  app.get('/api/super/solicitacoes-features', superAdminAuth, (req, res) => {
    masterDb.all(
      `SELECT s.*, r.nome AS restaurante_nome, r.licenca
         FROM solicitacoes_features s
         LEFT JOIN restaurantes r ON r.id = s.restaurante_id
        ORDER BY CASE s.status WHEN 'pendente' THEN 0 ELSE 1 END, s.criado_em DESC
        LIMIT 200`,
      [],
      (err, rows) => {
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, solicitacoes: rows || [] });
      }
    );
  });

  // POST — aprovar: ativa a feature para o tenant e resolve a solicitação
  app.post('/api/super/solicitacoes-features/aprovar', superAdminAuth, async (req, res) => {
    const id = parseInt((req.body || {}).id, 10);
    if (!id) return res.json({ ok: false, erro: 'ID obrigatório.' });
    const sol = await new Promise((resolve) => {
      masterDb.get(`SELECT * FROM solicitacoes_features WHERE id = ?`, [id], (e, row) => resolve(e ? null : row));
    });
    if (!sol) return res.json({ ok: false, erro: 'Solicitação não encontrada.' });

    try {
      const existing = await new Promise((resolve) => {
        masterDb.get(`SELECT overrides_json FROM tenant_features WHERE restaurante_id = ?`, [sol.restaurante_id], (e, row) => resolve(e ? null : row));
      });
      let overrides = {};
      if (existing && existing.overrides_json) {
        try { overrides = JSON.parse(existing.overrides_json) || {}; } catch (e) { overrides = {}; }
      }
      overrides[sol.feature] = true;
      await new Promise((resolve) => {
        masterDb.run(
          `INSERT INTO tenant_features (restaurante_id, overrides_json, updated_at) VALUES (?, ?, datetime('now','localtime'))
           ON CONFLICT(restaurante_id) DO UPDATE SET overrides_json = excluded.overrides_json, updated_at = excluded.updated_at`,
          [sol.restaurante_id, JSON.stringify(overrides)],
          resolve
        );
      });
      if (sol.feature === 'ifood' && ifoodApi && ifoodDeps && typeof ifoodDeps.isFeatureEnabled === 'function') {
        ifoodApi.ensurePoller(sol.restaurante_id, ifoodDeps);
      }
      if (typeof loadAllTenantFeatures === 'function') await loadAllTenantFeatures();

      masterDb.run(`UPDATE solicitacoes_features SET status = 'aprovada', resolvido_em = datetime('now','localtime') WHERE id = ?`, [id]);
      try { io.to('restaurante_' + sol.restaurante_id).emit('funcao_aprovada', { feature: sol.feature }); } catch (e2) {}
      res.json({ ok: true, mensagem: 'Função ativada e solicitação aprovada!' });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // POST — recusar
  app.post('/api/super/solicitacoes-features/recusar', superAdminAuth, (req, res) => {
    const id = parseInt((req.body || {}).id, 10);
    if (!id) return res.json({ ok: false, erro: 'ID obrigatório.' });
    masterDb.get(`SELECT restaurante_id, feature FROM solicitacoes_features WHERE id = ?`, [id], (e, sol) => {
      masterDb.run(`UPDATE solicitacoes_features SET status = 'recusada', resolvido_em = datetime('now','localtime') WHERE id = ?`, [id], () => {
        if (sol) { try { io.to('restaurante_' + sol.restaurante_id).emit('funcao_recusada', { feature: sol.feature }); } catch (e2) {} }
        res.json(e ? { ok: false, erro: e.message } : { ok: true, mensagem: 'Solicitação recusada.' });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PICO & CAPACIDADE DO SERVIDOR
  // ═══════════════════════════════════════════════════════════════

  // GET /api/super/mapa — restaurantes conectados com coordenadas p/ o mapa
  app.get('/api/super/mapa', superAdminAuth, async (req, res) => {
    try {
      const rests = await new Promise((resolve) => {
        masterDb.all(
          `SELECT r.id, r.nome, r.cidade, r.bairro, r.endereco, r.licenca, r.ativo,
                  r.latitude, r.longitude,
                  t.online, t.ultima_atividade, t.vendas_hoje, t.comandas_abertas,
                  t.garcons_online, t.dispositivos
           FROM restaurantes r
           LEFT JOIN telemetria t ON t.id = (SELECT MAX(id) FROM telemetria WHERE restaurante_id = r.id)
           ORDER BY r.id`,
          [],
          (e, rows) => resolve(e ? [] : (rows || []))
        );
      });

      const pontos = rests.map(r => ({
        id: r.id,
        nome: r.nome,
        cidade: r.cidade || '',
        bairro: r.bairro || '',
        endereco: r.endereco || '',
        licenca: r.licenca || 'ativo',
        ativo: !!r.ativo,
        latitude: r.latitude,
        longitude: r.longitude,
        temLocal: r.latitude != null && r.longitude != null && isFinite(r.latitude) && isFinite(r.longitude),
        online: !!r.online,
        ultima_atividade: r.ultima_atividade || null,
        vendas_hoje: r.vendas_hoje || 0,
        comandas_abertas: r.comandas_abertas || 0,
        garcons_online: r.garcons_online || 0,
        dispositivos: r.dispositivos || 0,
        sockets: (typeof metricSocketCount === 'function') ? (metricSocketCount(r.id) || 0) : 0
      }));

      const cidades = {};
      pontos.forEach(p => {
        const k = (p.cidade || 'Sem cidade').trim();
        cidades[k] = (cidades[k] || 0) + 1;
      });

      res.json({
        ok: true,
        pontos,
        stats: {
          total: pontos.length,
          comLocal: pontos.filter(p => p.temLocal).length,
          online: pontos.filter(p => p.online).length,
          ativos: pontos.filter(p => p.ativo).length,
          cidades: Object.keys(cidades).sort().map(c => ({ nome: c, total: cidades[c] }))
        }
      });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // GET /api/super/capacidade — picos por hora + estimativa de tenants restantes
  app.get('/api/super/capacidade', superAdminAuth, async (req, res) => {
    try {
      const os = require('os');
      const mem = process.memoryUsage();
      const totalRamMB = Math.round(os.totalmem() / 1048576);
      const freeRamMB = Math.round(os.freemem() / 1048576);
      const processMB = Math.round(mem.rss / 1048576);

      const cfgs = await new Promise((resolve) => {
        masterDb.all(`SELECT chave, valor FROM configuracoes_global`, [], (err, rows) => {
          const m = {};
          (rows || []).forEach(r => { m[r.chave] = r.valor; });
          resolve(m);
        });
      });
      const ramPorTenantMB = parseInt(cfgs['capacidade_ram_tenant_mb'], 10) || 80;
      const maxTenantsHard = parseInt(cfgs['capacidade_max_tenants'], 10) || 0;

      const rests = await new Promise((resolve) => {
        masterDb.all(`SELECT id, nome, licenca, ativo FROM restaurantes ORDER BY id`, [], (e, r) => resolve(e ? [] : (r || [])));
      });
      const tenantsTotal = rests.length;
      const tenantsAtivos = rests.filter(r => r.ativo).length;

      let socketsAtivos = 0;
      const tenantsLoad = rests.map(r => {
        const c = (typeof metricSocketCount === 'function') ? (metricSocketCount(r.id) || 0) : 0;
        socketsAtivos += c;
        return { id: r.id, nome: r.nome, licenca: r.licenca || 'ativo', ativo: !!r.ativo, sockets: c };
      });

      // Heatmap: últimos 7 dias, pico de sockets por hora (0-23)
      const hoje = new Date();
      const diaIni = new Date(hoje.getTime() - 6 * 86400000);
      const pad = (n) => String(n).padStart(2, '0');
      const iniStr = `${diaIni.getFullYear()}-${pad(diaIni.getMonth() + 1)}-${pad(diaIni.getDate())}`;

      const picos = await new Promise((resolve) => {
        masterDb.all(`SELECT restaurante_id, dia, hora, sockets FROM metrica_picos WHERE dia >= ?`, [iniStr], (e, r) => resolve(e ? [] : (r || [])));
      });

      const horaMax = new Array(24).fill(0);
      const horaDias = new Array(24).fill(0);
      const diasSet = {};
      const tenantPico = {};
      (picos || []).forEach(p => {
        if (p.hora >= 0 && p.hora <= 23) {
          const h = p.hora;
          if (p.sockets > horaMax[h]) horaMax[h] = p.sockets;
          if (!diasSet[p.dia]) { diasSet[p.dia] = true; horaDias[h]++; }
          const tKey = String(p.restaurante_id);
          if (!tenantPico[tKey] || p.sockets > tenantPico[tKey].sockets) {
            tenantPico[tKey] = { hora: h, sockets: p.sockets };
          }
        }
      });
      const numDias = Math.max(1, Object.keys(diasSet).length);
      const heatmap = [];
      for (let h = 0; h < 24; h++) {
        heatmap.push({
          hora: h,
          sockets: horaMax[h],
          dias: horaDias[h]
        });
      }
      const tenantsHeat = tenantsLoad.map(t => Object.assign({}, t, tenantPico[String(t.id)] || { hora: null, sockets: 0 }));

      // Estimativa teórica (fallback quando ainda não há histórico de picos)
      const maxTenantsEstimado = Math.max(1, Math.floor((totalRamMB * 0.8) / ramPorTenantMB));

      // ═══ MODELO REALISTA: baseado na carga medida nos horários de pico ═══
      // 1) Custo de RAM por socket: empírico (RSS atual ÷ sockets ativos),
      //    com piso de segurança; pode ser fixado via config.
      const custoSocketCfg = parseInt(cfgs['capacidade_ram_socket_mb'], 10) || 0;
      const custoEmpirico = socketsAtivos >= 5
        ? Math.max(8, Math.round(Math.max(1, processMB - 120) / socketsAtivos))
        : 12;
      const custoEfetivo = custoSocketCfg > 0 ? custoSocketCfg : custoEmpirico;

      // 2) Base fixa do processo (node+sqlite sem carga), deduzida do RSS
      const ramBaseMB = Math.max(120, processMB - (socketsAtivos * custoEfetivo));
      const ramUtilMB = Math.round(totalRamMB * 0.8);
      const capSockets = Math.max(10, Math.floor((ramUtilMB - ramBaseMB) / custoEfetivo));

      // 3) Pico histórico dos últimos 7 dias por tenant (tenantPico já vem
      //    do metrica_picos). Picos de tenants diferentes raramente coincidem,
      //    então aplicamos fator de simultaneidade.
      let picoSoma = 0;
      let tenantsComPico = 0;
      (tenantsHeat || []).forEach(t => {
        if (t.sockets > 0) { picoSoma += t.sockets; tenantsComPico++; }
      });
      const fatorSimultaneidade = 0.7;
      const picoSimultaneo = Math.ceil(picoSoma * fatorSimultaneidade);
      const mediaPicoPorTenant = tenantsComPico > 0
        ? Math.round((picoSoma / tenantsComPico) * 10) / 10
        : 6; // default conservador para restaurante típico

      // 4) Quantos tenants o servidor aguenta no pico: quantas vezes o pico
      //    médio por tenant cabe nos sockets suportados pela RAM.
      const maxTenantsRealista = Math.max(1, Math.floor(capSockets / Math.max(2, mediaPicoPorTenant)));

      const temHistorico = picoSoma > 0 && tenantsComPico >= 3;
      const maxTenants = maxTenantsHard > 0
        ? Math.min(maxTenantsHard, temHistorico ? maxTenantsRealista : maxTenantsEstimado)
        : (temHistorico ? maxTenantsRealista : maxTenantsEstimado);
      const restantes = Math.max(0, maxTenants - tenantsAtivos);
      const percentual = maxTenants > 0 ? Math.min(100, Math.round((tenantsAtivos / maxTenants) * 100)) : 0;
      const percentualSockets = Math.min(100, Math.round((socketsAtivos / capSockets) * 100));

      const isWin = process.platform === 'win32';
      const isMac = process.platform === 'darwin';
      const platLabel = isWin ? 'Windows' : (isMac ? 'macOS' : 'Linux');

      res.json({
        ok: true,
        server: {
          totalRamMB, freeRamMB, usedRamMB: totalRamMB - freeRamMB, processMB,
          socketsAtivos, tenantsTotal, tenantsAtivos,
          node: process.version,
          plataforma: process.platform,
          plataforma_label: platLabel,
          arch: process.arch,
          cpus: os.cpus().length,
          hostname: os.hostname(),
          uptime: Math.floor(process.uptime())
        },
        capacidade: {
          maxTenants, ramPorTenantMB, restantes, percentual, maxTenantsHard,
          teoricoMaxTenants: maxTenantsEstimado,
          modelo: {
            baseadoEmPicos: temHistorico,
            capSockets,
            custoSocketMB: custoEfetivo,
            custoSocketAuto: custoSocketCfg <= 0,
            ramBaseMB,
            ramUtilMB,
            picoSoma7d: picoSoma,
            picoSimultaneo,
            mediaPicoPorTenant,
            fatorSimultaneidade,
            tenantsComPico,
            percentualSockets
          }
        },
        heatmap,
        tenants: tenantsHeat
      });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // CONTROLE DE CARGA (CHAVE SUPER ADMIN & CIRCUIT BREAKER)
  // ═══════════════════════════════════════════════════════════════

  app.get('/api/super/load-control', superAdminAuth, async (req, res) => {
    try {
      const state = loadControl.getState();
      const metrics = loadControl.getMetrics();
      const fila = typeof loadControl.getFilaSnapshot === 'function' ? loadControl.getFilaSnapshot() : {};
      const overrides = typeof loadControl.getTenantOverrides === 'function' ? loadControl.getTenantOverrides() : {};

      const rests = await new Promise((resolve) => {
        masterDb.all(`SELECT id, nome, ativo FROM restaurantes ORDER BY id`, [], (e, r) => resolve(e ? [] : (r || [])));
      });

      const tenantsList = rests.map(r => {
        const ppm = typeof loadControl.getTenantOrdersPerMin === 'function' ? loadControl.getTenantOrdersPerMin(r.id) : 0;
        const modoEfetivo = typeof loadControl.getModoEfetivoTenant === 'function' ? loadControl.getModoEfetivoTenant(r.id) : (state.modo_efetivo || 'normal');
        return {
          id: r.id,
          nome: r.nome,
          ativo: !!r.ativo,
          pedidos_min: ppm,
          modo_efetivo: modoEfetivo,
          override: overrides[r.id] || null,
          eventos_ativos: 0,
          pico_cadastrado: {}
        };
      });

      res.json({
        ok: true,
        controle: state,
        metricas: metrics,
        modo_global: state.modo_efetivo || 'normal',
        fila_duravel: state.modo_efetivo === 'spool',
        tenants: tenantsList
      });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  function setInfraConfig(chave, valor) {
    return new Promise((resolve, reject) => {
      masterDb.run("INSERT INTO configuracoes_global (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", [chave, valor], (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }

  function getInfraConfig(chave) {
    return new Promise((resolve) => {
      masterDb.get("SELECT valor FROM configuracoes_global WHERE chave = ?", [chave], (err, row) => {
        resolve(err ? null : (row ? row.valor : null));
      });
    });
  }

  // GET /api/super/infra-cloud — carregar todas configs de infraestrutura cloud
  app.get('/api/super/infra-cloud', superAdminAuth, async (req, res) => {
    try {
      masterDb.all("SELECT chave, valor FROM configuracoes_global WHERE chave LIKE 'r2_%' OR chave LIKE 'redis_%' OR chave LIKE 'backup_%' OR chave LIKE 'crash_%'", [], (err, rows) => {
        if (err) return res.json({ ok: false, erro: err.message });
        const config = {};
        (rows || []).forEach(r => { config[r.chave] = r.valor; });
        res.json({ ok: true, config });
      });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // POST /api/super/infra-cloud/r2 — salvar config R2
  app.post('/api/super/infra-cloud/r2', superAdminAuth, async (req, res) => {
    const { account_id, bucket, access_key, secret_key } = req.body || {};
    if (!account_id || !bucket || !access_key || !secret_key) {
      return res.json({ ok: false, erro: 'Todos os campos são obrigatórios.' });
    }
    try {
      await setInfraConfig('r2_account_id', account_id);
      await setInfraConfig('r2_bucket', bucket);
      await setInfraConfig('r2_access_key', access_key);
      await setInfraConfig('r2_secret_key', secret_key);
      res.json({ ok: true, mensagem: 'Configuração R2 salva com sucesso!' });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // POST /api/super/infra-cloud/r2/test — testar conexão R2
  app.post('/api/super/infra-cloud/r2/test', superAdminAuth, async (req, res) => {
    try {
      const accountId = await getInfraConfig('r2_account_id');
      const accessKey = await getInfraConfig('r2_access_key');
      const bucket = await getInfraConfig('r2_bucket');
      if (!accountId || !accessKey || !bucket) {
        return res.json({ ok: false, erro: 'R2 não configurado. Salve as credenciais primeiro.' });
      }
      // Teste simples: HEAD no bucket via URL pública
      const testUrl = `https://${bucket}.${accountId}.r2.cloudflarestorage.com/`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const resp = await fetch(testUrl, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timer);
        // 403 = bucket existe mas precisa de auth (ok), 200 = público, 404 = bucket não existe
        const ok = resp.status !== 404;
        res.json({ ok, status: resp.status, mensagem: ok ? 'Bucket acessível!' : 'Bucket não encontrado.' });
      } catch (e) {
        clearTimeout(timer);
        res.json({ ok: false, erro: 'Não foi possível acessar o bucket: ' + e.message });
      }
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // POST /api/super/infra-cloud/r2/backup — upload backup para R2
  app.post('/api/super/infra-cloud/r2/backup', superAdminAuth, async (req, res) => {
    try {
      const bucket = await getInfraConfig('r2_bucket');
      const accountId = await getInfraConfig('r2_account_id');
      const accessKey = await getInfraConfig('r2_access_key');
      const secretKey = await getInfraConfig('r2_secret_key');
      if (!bucket || !accountId || !accessKey || !secretKey) {
        return res.json({ ok: false, erro: 'R2 não configurado. Configure as credenciais primeiro.' });
      }
      // Faz backup local primeiro
      const rootDir = path.join(__dirname, '..');
      const backupDir = path.join(rootDir, 'backups');
      if (!fsSync.existsSync(backupDir)) fsSync.mkdirSync(backupDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const files = [];
      // Lista bancos de tenant
      try {
        const dbDir = path.join(rootDir, 'db');
        if (fsSync.existsSync(dbDir)) {
          fsSync.readdirSync(dbDir).filter(f => f.endsWith('.sqlite') || f.endsWith('.db')).forEach(f => {
            files.push(path.join(dbDir, f));
          });
        }
      } catch (e) { }
      if (fsSync.existsSync(path.join(rootDir, 'master.sqlite'))) files.push(path.join(rootDir, 'master.sqlite'));

      const uploaded = [];
      for (const src of files) {
        const fname = path.basename(src).replace(/\.sqlite$|\.db$/, '_backup_' + timestamp + '.sqlite');
        // Copia local
        const dst = path.join(backupDir, fname);
        try { fsSync.copyFileSync(src, dst); } catch (e) { continue; }
        // Upload via PUT para R2
        const fileData = fsSync.readFileSync(dst);
        const key = `backups/${fname}`;
        const putUrl = `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${key}`;
        try {
          const resp = await fetch(putUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Length': String(fileData.length)
            },
            body: fileData
          });
          if (resp.ok || resp.status === 200) uploaded.push(fname);
        } catch (e) { }
      }
      res.json({ ok: uploaded.length > 0, arquivos: uploaded, total: files.length, mensagem: `${uploaded.length}/${files.length} arquivos enviados para R2.` });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // GET /api/super/infra-cloud/r2/backups — listar backups no R2
  app.get('/api/super/infra-cloud/r2/backups', superAdminAuth, async (req, res) => {
    try {
      const bucket = await getInfraConfig('r2_bucket');
      const accountId = await getInfraConfig('r2_account_id');
      if (!bucket || !accountId) return res.json({ ok: true, backups: [] });
      const listUrl = `https://${bucket}.${accountId}.r2.cloudflarestorage.com/?list&prefix=backups/&max-keys=100`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(listUrl, { signal: controller.signal });
      clearTimeout(timer);
      const text = await resp.text();
      // Parse simples do XML do S3 list
      const matches = text.match(/<Key>([^<]+)<\/Key>/g) || [];
      const backups = matches.map(m => {
        const name = m.replace(/<\/?Key>/g, '').replace('backups/', '');
        const sizeMatch = text.match(new RegExp(`<Key>${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</Key>[\\s\\S]*?<Size>(\\d+)</Size>`));
        return { name, size: sizeMatch ? parseInt(sizeMatch[1], 10) : null };
      });
      res.json({ ok: true, backups });
    } catch (e) {
      res.json({ ok: true, backups: [], erro: e.message });
    }
  });

  // POST /api/super/infra-cloud/redis — salvar config Redis
  app.post('/api/super/infra-cloud/redis', superAdminAuth, async (req, res) => {
    const { host, port, password, prefix, enabled } = req.body || {};
    try {
      if (host !== undefined) await setInfraConfig('redis_host', host || '127.0.0.1');
      if (port !== undefined) await setInfraConfig('redis_port', String(port || 6379));
      if (password !== undefined) await setInfraConfig('redis_password', password || '');
      if (prefix !== undefined) await setInfraConfig('redis_prefix', prefix || 'chef:');
      if (enabled !== undefined) await setInfraConfig('redis_enabled', enabled ? '1' : '0');
      res.json({ ok: true, mensagem: 'Configuração Redis salva!' });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // POST /api/super/infra-cloud/redis/test — testar conexão Redis
  app.post('/api/super/infra-cloud/redis/test', superAdminAuth, async (req, res) => {
    try {
      const redisMod = require('redis');
      const host = (await getInfraConfig('redis_host')) || '127.0.0.1';
      const port = parseInt((await getInfraConfig('redis_port')) || '6379', 10);
      const password = (await getInfraConfig('redis_password')) || undefined;
      const client = redisMod.createClient({ url: `redis://${password ? ':' + password + '@' : ''}${host}:${port}`, socket: { connectTimeout: 5000 } });
      let responded = false;
      const done = (ok, msg) => { if (!responded) { responded = true; try { client.disconnect(); } catch (e) { } res.json({ ok, mensagem: msg }); } };
      client.on('error', () => done(false, 'Não foi possível conectar ao Redis em ' + host + ':' + port));
      client.connect().then(() => done(true, 'Redis conectado com sucesso!')).catch(() => done(false, 'Falha ao conectar no Redis'));
      setTimeout(() => done(false, 'Timeout: Redis não respondeu em 5s'), 6000);
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        res.json({ ok: false, erro: 'Módulo "redis" não instalado. Execute: npm install redis' });
      } else {
        res.json({ ok: false, erro: e.message });
      }
    }
  });

  // POST /api/super/infra-cloud/backup-schedule — salvar agendamento de backup
  app.post('/api/super/infra-cloud/backup-schedule', superAdminAuth, async (req, res) => {
    const { frequency, retention_days, destination } = req.body || {};
    try {
      if (frequency) await setInfraConfig('backup_frequency', frequency);
      if (retention_days !== undefined) await setInfraConfig('backup_retention_days', String(retention_days));
      if (destination) await setInfraConfig('backup_destination', destination);
      res.json({ ok: true, mensagem: 'Agendamento de backup salvo!' });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // GET /api/super/infra-cloud/backup-history — histórico de backups
  app.get('/api/super/infra-cloud/backup-history', superAdminAuth, async (req, res) => {
    try {
      const backupDir = path.join(__dirname, '..', 'backups');
      if (!fsSync.existsSync(backupDir)) return res.json({ ok: true, history: [] });
      const files = fsSync.readdirSync(backupDir)
        .filter(f => f.includes('_backup_'))
        .sort().reverse().slice(0, 50)
        .map(f => {
          const stat = fsSync.statSync(path.join(backupDir, f));
          return { nome: f, tamanho: Math.round(stat.size / 1024), data: stat.mtime.toISOString() };
        });
      res.json({ ok: true, history: files });
    } catch (e) {
      res.json({ ok: true, history: [] });
    }
  });

  // POST /api/super/infra-cloud/crash-alerts — salvar config alertas de crash
  app.post('/api/super/infra-cloud/crash-alerts', superAdminAuth, async (req, res) => {
    const { channel, webhook_url } = req.body || {};
    try {
      if (channel) await setInfraConfig('crash_alert_channel', channel);
      if (webhook_url !== undefined) await setInfraConfig('crash_alert_webhook', webhook_url);
      res.json({ ok: true, mensagem: 'Configuração de alertas salva!' });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // POST /api/super/infra-cloud/crash-alerts/test — enviar alerta teste
  app.post('/api/super/infra-cloud/crash-alerts/test', superAdminAuth, async (req, res) => {
    try {
      const channel = (await getInfraConfig('crash_alert_channel')) || 'none';
      const webhook = await getInfraConfig('crash_alert_webhook');
      if (channel === 'none') return res.json({ ok: false, erro: 'Alertas desativados.' });
      if (channel === 'webhook' && webhook) {
        const payload = {
          content: '🧪 **Teste de Alerta — Chef Cozinha SaaS**\n\nEste é um alerta teste. Se você recebeu, o sistema de alertas está funcionando.\nHorário: ' + new Date().toLocaleString('pt-BR'),
          username: 'Chef Alert Bot'
        };
        const resp = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.ok) return res.json({ ok: true, mensagem: 'Alerta teste enviado via webhook!' });
        return res.json({ ok: false, erro: 'Webhook retornou HTTP ' + resp.status });
      }
      if (channel === 'email') {
        return res.json({ ok: true, mensagem: 'Alerta por e-mail será enviado no próximo crash (configurado em Configurações).' });
      }
      res.json({ ok: false, erro: 'Configure um canal de notificação válido.' });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // GET /api/super/infra-cloud/crash-history — histórico de crashes
  app.get('/api/super/infra-cloud/crash-history', superAdminAuth, (req, res) => {
    try {
      const logFile = path.join(__dirname, '..', 'logs', 'falhas.log');
      if (!fsSync.existsSync(logFile)) return res.json({ ok: true, history: [] });
      const lines = fsSync.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).slice(-50);
      const crashes = lines.map(l => {
        const match = l.match(/^\[([^\]]+)\]\s*(.*)$/);
        return match ? { data: match[1], detalhe: match[2] } : null;
      }).filter(Boolean).reverse();
      res.json({ ok: true, history: crashes });
    } catch (e) {
      res.json({ ok: true, history: [] });
    }
  });

  app.post('/api/super/load-control', superAdminAuth, (req, res) => {
    try {
      loadControl.setConfig(req.body || {}, (err) => {
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, state: loadControl.getState() });
      });
    } catch (err) {
      res.json({ ok: false, erro: err.message });
    }
  });

  app.post('/api/super/load-control/tenant', superAdminAuth, (req, res) => {
    try {
      const { restaurante_id, modo } = req.body;
      if (!restaurante_id) return res.json({ ok: false, erro: 'restaurante_id obrigatório.' });
      loadControl.setTenantOverride(restaurante_id, modo || null);
      res.json({ ok: true, restaurante_id, modo: modo || null });
    } catch (err) {
      res.json({ ok: false, erro: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // DOMÍNIOS POR TENANT (subdomínio + domínio próprio)
  // ═══════════════════════════════════════════════════════════════

  // GET /api/super/dominios — lista domínios de todos os tenants
  app.get('/api/super/dominios', superAdminAuth, (req, res) => {
    masterDb.get(`SELECT valor FROM config_sistema WHERE chave = 'base_domain'`, (errCfg, rowCfg) => {
      const activeBaseDomain = (rowCfg && rowCfg.valor && rowCfg.valor.trim()) || options.baseDomain || 'chefcozinha.com.br';
      masterDb.all(`SELECT id, nome, slug, custom_domain, licenca, ativo FROM restaurantes ORDER BY id`, [], (err, rows) => {
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, tenants: rows || [], baseDomain: activeBaseDomain });
      });
    });
  });

  // POST /api/super/dominios/base-domain — configura o domínio base da plataforma (ex: chefcozinha.com.br)
  app.post('/api/super/dominios/base-domain', superAdminAuth, async (req, res) => {
    const { base_domain } = req.body || {};
    const cleanBase = (base_domain || '').trim().toLowerCase();
    if (!cleanBase || cleanBase.length < 3) {
      return res.json({ ok: false, erro: 'Domínio base inválido.' });
    }
    masterDb.run(
      `INSERT INTO config_sistema (chave, valor) VALUES ('base_domain', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
      [cleanBase],
      async function(err) {
        if (err) return res.json({ ok: false, erro: err.message });
        if (typeof options.setBaseDomain === 'function') {
          options.setBaseDomain(cleanBase);
        }
        if (typeof options.reloadDomainMaps === 'function') {
          await options.reloadDomainMaps();
        }
        res.json({ ok: true, mensagem: `Domínio base atualizado para "${cleanBase}" com sucesso!`, baseDomain: cleanBase });
      }
    );
  });

  // POST /api/super/dominios — define slug e/ou domínio próprio para um tenant
  app.post('/api/super/dominios', superAdminAuth, async (req, res) => {
    const body = req.body || {};
    const rid = parseInt(body.restaurante_id, 10);
    if (!rid) return res.json({ ok: false, erro: 'ID do restaurante é obrigatório.' });

    try {
      const slug = (body.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const customDomain = (body.custom_domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

      // Valida slug
      if (body.slug !== undefined && slug !== '') {
        if (slug.length < 2 || slug.length > 40) {
          return res.json({ ok: false, erro: 'Slug deve ter entre 2 e 40 caracteres (letras, números, hífen).' });
        }
        // Verifica unicidade
        const existing = await new Promise((resolve) => {
          masterDb.get(`SELECT id FROM restaurantes WHERE slug = ? AND id != ?`, [slug, rid], (e, r) => resolve(e ? null : r));
        });
        if (existing) return res.json({ ok: false, erro: 'Este slug já está em uso por outro restaurante.' });
      }

      // Valida domínio próprio
      if (body.custom_domain !== undefined && customDomain !== '') {
        if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(customDomain)) {
          return res.json({ ok: false, erro: 'Domínio inválido. Ex: meurestaurante.com.br' });
        }
        const existingDom = await new Promise((resolve) => {
          masterDb.get(`SELECT id FROM restaurantes WHERE custom_domain = ? AND id != ?`, [customDomain, rid], (e, r) => resolve(e ? null : r));
        });
        if (existingDom) return res.json({ ok: false, erro: 'Este domínio já está em uso por outro restaurante.' });
      }

      // Atualiza
      await new Promise((resolve, reject) => {
        masterDb.run(
          `UPDATE restaurantes SET slug = ?, custom_domain = ? WHERE id = ?`,
          [slug || null, customDomain || null, rid],
          function(err) { err ? reject(err) : resolve(); }
        );
      });

      // Recarrega mapas de domínios
      if (typeof options.reloadDomainMaps === 'function') {
        await options.reloadDomainMaps();
      }

      res.json({ ok: true, mensagem: 'Domínios atualizados com sucesso!', slug: slug || null, custom_domain: customDomain || null });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // DELETE /api/super/dominios — limpa slug e domínio de um tenant
  app.delete('/api/super/dominios', superAdminAuth, async (req, res) => {
    const body = req.body || {};
    const rid = parseInt(body.restaurante_id, 10);
    if (!rid) return res.json({ ok: false, erro: 'ID do restaurante é obrigatório.' });
    try {
      await new Promise((resolve, reject) => {
        masterDb.run(`UPDATE restaurantes SET slug = NULL, custom_domain = NULL WHERE id = ?`, [rid], function(err) { err ? reject(err) : resolve(); });
      });
      if (typeof options.reloadDomainMaps === 'function') {
        await options.reloadDomainMaps();
      }
      res.json({ ok: true, mensagem: 'Domínios removidos com sucesso!' });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // POST /api/super/dominios/criar-instancia — cria nova instância de tenant com subdomínio exclusivo
  app.post('/api/super/dominios/criar-instancia', superAdminAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const nome = (body.nome || '').trim();
      if (!nome) return res.json({ ok: false, erro: 'Nome do restaurante é obrigatório.' });

      // Generate or clean slug
      let slug = (body.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!slug) {
        slug = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
      }
      if (!slug || slug.length < 2) slug = 'instancia-' + Date.now().toString(36);

      // Check unique slug
      const existingSlug = await new Promise((resolve) => {
        masterDb.get(`SELECT id, nome FROM restaurantes WHERE slug = ?`, [slug], (e, r) => resolve(e ? null : r));
      });
      if (existingSlug) {
        return res.json({ ok: false, erro: `O subdomínio "${slug}" já está em uso pelo restaurante "${existingSlug.nome}" (ID ${existingSlug.id}). Escolha outro subdomínio.` });
      }

      const customDomain = (body.custom_domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || null;
      if (customDomain) {
        const existingDom = await new Promise((resolve) => {
          masterDb.get(`SELECT id FROM restaurantes WHERE custom_domain = ?`, [customDomain], (e, r) => resolve(e ? null : r));
        });
        if (existingDom) return res.json({ ok: false, erro: `O domínio próprio "${customDomain}" já está em uso por outro restaurante.` });
      }

      const licencaVal = (body.licenca || 'premium').trim().toLowerCase();
      const activeVal = body.ativo !== undefined ? (body.ativo ? 1 : 0) : 1;
      const modeVal = body.login_mode || 'multi';

      // 1. Criar restaurante no masterDb
      const newId = await new Promise((resolve, reject) => {
        masterDb.run(
          `INSERT INTO restaurantes (nome, licenca, ativo, login_mode, slug, custom_domain, data_cadastro)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))`,
          [nome, licencaVal, activeVal, modeVal, slug, customDomain],
          function(err) { err ? reject(err) : resolve(this.lastID); }
        );
      });

      // 2. Criar banco do tenant com schema inicial
      const tenantDbPath = path.join(__dirname, '..', `database_${newId}.sqlite`);
      if (!fsSync.existsSync(tenantDbPath)) {
        try {
          if (typeof options.createFreshTenantDb === 'function') {
            await options.createFreshTenantDb(tenantDbPath, nome);
          }
        } catch (eDb) {
          console.error('[Criar Instancia] Erro ao criar banco:', eDb);
        }
      }

      // 3. Criar usuário admin do tenant
      const adminEmail = (body.admin_email || body.email || '').trim() || `admin@${slug}.local`;
      const adminSenha = body.admin_senha || body.senha || 'admin123';
      const adminNome = (body.admin_nome || '').trim() || `Admin ${nome}`;
      const hash = await bcrypt.hash(adminSenha, 10);

      await new Promise((resolve, reject) => {
        masterDb.run(
          `INSERT INTO usuarios (restaurante_id, username, password_hash, role, nome, ativo) VALUES (?, ?, ?, 'admin', ?, 1)`,
          [newId, adminEmail, hash, adminNome],
          function(err) { err ? reject(err) : resolve(this.lastID); }
        );
      }).catch((e) => console.warn('[Criar Instancia] Aviso ao criar admin:', e.message));

      // 4. Salvar configurações no banco do tenant
      try {
        const tenantDb = await new Promise((resolve, reject) => {
          const db = new sqlite3.Database(tenantDbPath, (err) => err ? reject(err) : resolve(db));
        });
        await new Promise((resolve) => {
          tenantDb.serialize(() => {
            tenantDb.run(`CREATE TABLE IF NOT EXISTS configuracoes (chave TEXT PRIMARY KEY, valor TEXT)`, () => {});
            tenantDb.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('empresa_nome', ?)`, [nome], () => {});
            tenantDb.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('slug', ?)`, [slug], () => {});
            if (body.telefone) tenantDb.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('telefone', ?)`, [body.telefone], () => {});
            if (body.whatsapp) tenantDb.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('whatsapp', ?)`, [body.whatsapp], () => {});
            tenantDb.close(() => resolve());
          });
        });
      } catch (eCfg) {
        console.warn('[Criar Instancia] Erro ao gravar config:', eCfg.message);
      }

      // 5. Recarregar mapas de domínio no servidor
      if (typeof options.reloadDomainMaps === 'function') {
        await options.reloadDomainMaps();
      }

      // 6. Obter domínio base atual
      const activeBaseDomain = await new Promise((resolve) => {
        masterDb.get(`SELECT valor FROM config_sistema WHERE chave = 'base_domain'`, (e, r) => {
          resolve((r && r.valor && r.valor.trim()) || options.baseDomain || 'chefcozinha.com.br');
        });
      });

      const subdomainUrl = `https://${slug}.${activeBaseDomain}`;
      const customUrl = customDomain ? `https://${customDomain}` : null;

      res.json({
        ok: true,
        mensagem: `Nova instância de tenant "${nome}" criada com sucesso no subdomínio ${slug}!`,
        id: newId,
        nome,
        slug,
        custom_domain: customDomain,
        subdomain_url: subdomainUrl,
        custom_url: customUrl,
        admin: {
          email: adminEmail,
          senha: adminSenha,
          nome: adminNome
        }
      });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // GET /api/super/dominios/diagnostico — diagnóstico completo de domínios e métricas
  app.get('/api/super/dominios/diagnostico', superAdminAuth, async (req, res) => {
    try {
      const activeBaseDomain = await new Promise((resolve) => {
        masterDb.get(`SELECT valor FROM config_sistema WHERE chave = 'base_domain'`, (e, r) => {
          resolve((r && r.valor && r.valor.trim()) || options.baseDomain || 'chefcozinha.com.br');
        });
      });

      const rows = await new Promise((resolve) => {
        masterDb.all(`SELECT id, nome, slug, custom_domain, licenca, ativo, data_cadastro FROM restaurantes ORDER BY id`, [], (e, r) => resolve(r || []));
      });

      const totalInstancias = rows.length;
      const comSubdominio = rows.filter(r => r.slug && r.slug.trim()).length;
      const comDominioProprio = rows.filter(r => r.custom_domain && r.custom_domain.trim()).length;
      const semDominio = rows.filter(r => (!r.slug || !r.slug.trim()) && (!r.custom_domain || !r.custom_domain.trim())).length;

      res.json({
        ok: true,
        baseDomain: activeBaseDomain,
        metricas: {
          total_instancias: totalInstancias,
          com_subdominio: comSubdominio,
          com_dominio_proprio: comDominioProprio,
          sem_dominio: semDominio
        },
        instancias: rows.map(r => ({
          ...r,
          subdomain_url: r.slug ? `https://${r.slug}.${activeBaseDomain}` : null,
          custom_url: r.custom_domain ? `https://${r.custom_domain}` : null
        }))
      });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // POST /api/super/exec — comandos seguros (allowlist cross-platform)
  const CMD_BLOCKLIST_RX = [
    /\brm\s+-rf\s+\/\b/,
    /\bmkfs\b/,
    /\bdd\s+.*of=\/dev\//,
    /\b:(){ :\|:& };:/,
    /\bformat\s+[a-z]:/i,
    /\bdrop\s+database\b/i
  ];
  const CMD_ALLOW_RX = /^(ls|dir|cat|type|head|tail|wc|df|du|free|uptime|ps|top|tasklist|systeminfo|wmic|netstat|ss|ip|ifconfig|ipconfig|ping|host|dig|date|time|ver|hostname|pwd|whoami|id|env|node|npm|npx|pm2|sqlite3|git|docker|echo|curl|cls|clear)/i;

  app.post('/api/super/exec', superAdminAuth, (req, res) => {
    const { command } = req.body;
    if (!command || typeof command !== 'string') return res.json({ ok: false, erro: 'Comando obrigatório.' });
    if (command.length > 500) return res.json({ ok: false, erro: 'Máx 500 caracteres.' });
    if (CMD_BLOCKLIST_RX.some(rx => rx.test(command))) return res.json({ ok: false, erro: 'Comando bloqueado por segurança.' });
    if (!CMD_ALLOW_RX.test(command.trim())) return res.json({ ok: false, erro: 'Comando não permitido por política de segurança.' });

    console.log(`[SuperAdmin Exec] ${req.superAdmin?.role || 'admin'}: ${command.substring(0, 200)}`);
    const isWin = process.platform === 'win32';
    const shellOpt = isWin ? 'cmd.exe' : '/bin/bash';

    exec(command, { cwd: path.join(__dirname, '..'), timeout: 30000, maxBuffer: 2 * 1024 * 1024, shell: shellOpt }, (error, stdout, stderr) => {
      res.json({
        ok: !error,
        stdout: (stdout || '').substring(0, 20000),
        stderr: (stderr || '').substring(0, 10000),
        exitCode: error ? (error.code || 1) : 0,
        command: command.substring(0, 300)
      });
    });
  });

  // ── INSTÂNCIAS ON-PREMISE ──────────────────────────────────────────

  app.get('/api/super/instances', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT * FROM instance_registry ORDER BY last_heartbeat_at DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, instances: rows || [] });
    });
  });

  app.get('/api/super/instances/:id', superAdminAuth, (req, res) => {
    const { id } = req.params;
    masterDb.get(`SELECT * FROM instance_registry WHERE instance_id = ?`, [id], (err, inst) => {
      if (err || !inst) return res.status(404).json({ ok: false, error: 'Instância não encontrada' });
      masterDb.all(
        `SELECT * FROM remote_commands WHERE instance_id = ? ORDER BY issued_at DESC LIMIT 20`,
        [id], (e2, commands) => {
          masterDb.all(
            `SELECT * FROM sync_conflicts WHERE instance_id = ? ORDER BY resolved_at DESC LIMIT 20`,
            [id], (e3, conflicts) => {
              masterDb.all(
                `SELECT * FROM sync_queue WHERE instance_id = ? ORDER BY created_at DESC LIMIT 20`,
                [id], (e4, queue) => {
                  res.json({
                    ok: true,
                    instance: inst,
                    commands: commands || [],
                    conflicts: conflicts || [],
                    syncQueue: queue || []
                  });
                }
              );
            }
          );
        }
      );
    });
  });

  app.post('/api/super/remote-command', superAdminAuth, (req, res) => {
    const { instance_id, command, params } = req.body;
    if (!instance_id || !command) {
      return res.status(400).json({ ok: false, error: 'instance_id e command obrigatórios' });
    }
    const validCommands = ['deactivate', 'reactivate', 'push_config', 'update_features', 'force_sync', 'update_plan', 'restart', 'send_message', 'get_status', 'update_software'];
    if (!validCommands.includes(command)) {
      return res.status(400).json({ ok: false, error: 'Comando inválido: ' + command });
    }
    const commandId = 'cmd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const issuedBy = req.user ? (req.user.username || req.user.id || 'super_admin') : 'super_admin';
    masterDb.run(
      `INSERT INTO remote_commands (instance_id, command, params, issued_by, status) VALUES (?, ?, ?, ?, 'pending')`,
      [instance_id, command, JSON.stringify(params || {}), issuedBy],
      function (err) {
        if (err) return res.status(500).json({ ok: false, error: err.message });
        masterDb.run(
          `INSERT INTO sync_queue (instance_id, message_type, payload, priority, status) VALUES (?, 'command', ?, ?, 'pending')`,
          [instance_id, JSON.stringify({ command_id: commandId, command, params: params || {} }), command === 'deactivate' ? 1 : 5],
          function (e2) {
            if (e2) return res.status(500).json({ ok: false, error: e2.message });

            try {
              const syncServer = require('./sync-server');
              const instances = syncServer.getConnectedInstances();
              if (instances.has(instance_id)) {
                masterDb.run(
                  `UPDATE sync_queue SET status = 'sent', sent_at = datetime('now','localtime') WHERE instance_id = ? AND message_type = 'command' AND status = 'pending' ORDER BY id DESC LIMIT 1`,
                  [instance_id]
                );
              }
            } catch (e) {}

            res.json({ ok: true, command_id: commandId, instance_id, command });
          }
        );
      }
    );
  });

  app.get('/api/super/remote-command/:id', superAdminAuth, (req, res) => {
    const { id } = req.params;
    masterDb.get(`SELECT * FROM remote_commands WHERE id = ?`, [id], (err, row) => {
      if (err || !row) return res.status(404).json({ ok: false, error: 'Comando não encontrado' });
      res.json({ ok: true, command: row });
    });
  });

  app.get('/api/super/sync-queue', superAdminAuth, (req, res) => {
    const { instance_id, status } = req.query;
    let sql = `SELECT * FROM sync_queue WHERE 1=1`;
    const params = [];
    if (instance_id) { sql += ` AND instance_id = ?`; params.push(instance_id); }
    if (status) { sql += ` AND status = ?`; params.push(status); }
    sql += ` ORDER BY created_at DESC LIMIT 200`;
    masterDb.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, queue: rows || [] });
    });
  });

  app.post('/api/super/push-config', superAdminAuth, (req, res) => {
    const { instance_id, configs } = req.body;
    if (!instance_id || !configs) {
      return res.status(400).json({ ok: false, error: 'instance_id e configs obrigatórios' });
    }
    const commandId = 'cmd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const issuedBy = req.user ? (req.user.username || req.user.id || 'super_admin') : 'super_admin';
    masterDb.run(
      `INSERT INTO remote_commands (instance_id, command, params, issued_by, status) VALUES (?, 'push_config', ?, ?, 'pending')`,
      [instance_id, JSON.stringify({ configs }), issuedBy],
      function (err) {
        if (err) return res.status(500).json({ ok: false, error: err.message });
        masterDb.run(
          `INSERT INTO sync_queue (instance_id, message_type, payload, priority, status) VALUES (?, 'config_push', ?, 3, 'pending')`,
          [instance_id, JSON.stringify({ command_id: commandId, command: 'push_config', params: { configs } })],
          function (e2) {
            if (e2) return res.status(500).json({ ok: false, error: e2.message });
            res.json({ ok: true, command_id: commandId });
          }
        );
      }
    );
  });

  app.get('/api/super/sync-conflicts', superAdminAuth, (req, res) => {
    const { instance_id, limit } = req.query;
    const l = Math.min(parseInt(limit) || 50, 200);
    let sql = `SELECT * FROM sync_conflicts WHERE 1=1`;
    const params = [];
    if (instance_id) { sql += ` AND instance_id = ?`; params.push(instance_id); }
    sql += ` ORDER BY resolved_at DESC LIMIT ?`;
    params.push(l);
    masterDb.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, conflicts: rows || [] });
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // FUNCIONALIDADES POR RESTAURANTE (restaurant-level feature toggles)
  // ═══════════════════════════════════════════════════════════════

  const REST_FEATURE_KEYS = [
    'feature_venda_sem_estoque', 'feature_toggle_produto_rapido', 'feature_alterar_valores_pdv',
    'feature_clientes_ativos', 'feature_produto_mais_vendido', 'feature_maior_lucro',
    'feature_impressao_digital', 'feature_impressao_termica', 'feature_produtos_lote'
  ];

  function openTenantRW(tenantId) {
    return new Promise((resolve, reject) => {
      const dbPath = getTenantDbPath(tenantId);
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
        if (err) return reject(err);
        resolve(db);
      });
    });
  }

  // GET /api/super/restaurant-features/:id — listar features do restaurante
  app.get('/api/super/restaurant-features/:id', superAdminAuth, async (req, res) => {
    const rid = parseInt(req.params.id, 10);
    if (!rid) return res.json({ ok: false, erro: 'ID obrigatório.' });
    try {
      const tDb = await openTenantRW(rid);
      tDb.all(`SELECT chave, valor FROM configuracoes WHERE chave LIKE 'feature_%'`, [], (err, rows) => {
        tDb.close();
        if (err) return res.json({ ok: false, erro: err.message });
        const features = {};
        REST_FEATURE_KEYS.forEach(k => { features[k] = 'false'; });
        (rows || []).forEach(r => { features[r.chave] = r.valor; });
        res.json({ ok: true, features, keys: REST_FEATURE_KEYS });
      });
    } catch (e) {
      res.json({ ok: false, erro: 'Banco do restaurante indisponível: ' + e.message });
    }
  });

  // POST /api/super/restaurant-features — atualizar feature do restaurante
  app.post('/api/super/restaurant-features', superAdminAuth, async (req, res) => {
    const body = req.body || {};
    const rid = parseInt(body.restaurante_id, 10);
    const key = body.feature;
    const value = body.value;
    if (!rid || !key || typeof value === 'undefined') {
      return res.json({ ok: false, erro: 'restaurante_id, feature e value são obrigatórios.' });
    }
    if (!REST_FEATURE_KEYS.includes(key)) {
      return res.json({ ok: false, erro: 'Feature desconhecida.' });
    }
    try {
      const tDb = await openTenantRW(rid);
      const val = String(value);
      tDb.run(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [key, val], function (err) {
        tDb.close();
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, mensagem: 'Feature atualizada!' });
      });
    } catch (e) {
      res.json({ ok: false, erro: 'Banco do restaurante indisponível: ' + e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // PROVEDORES DE IMAGEM → migrados para plugins/image-providers/
  // ═══════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════
  // SYNCCHEFF INVIOLÁVEL — ENDPOINTS DE AUDITORIA & SEGURANÇA MESTRE
  // ═══════════════════════════════════════════════════════════════
  const syncCheff = require('../synccheff-security');
  try {
    syncCheff.initSyncCheffDb(masterDb);
  } catch (e) {
    console.error('[SyncCheff DB Init Error]', e);
  }

  // GET /api/super/synccheff/status — Dashboard e nós de sincronização
  app.get('/api/super/synccheff/status', superAdminAuth, (req, res) => {
    masterDb.all(`
      SELECT n.*, r.nome as restaurante_nome_real
      FROM synccheff_nodes n
      LEFT JOIN restaurantes r ON r.id = n.restaurante_id
      ORDER BY n.ultimo_sync DESC
    `, [], (err, nodes) => {
      if (err) return res.json({ ok: false, erro: err.message });

      masterDb.all(`
        SELECT l.*, r.nome as restaurante_nome
        FROM synccheff_audit_logs l
        LEFT JOIN restaurantes r ON r.id = l.restaurante_id
        ORDER BY l.id DESC LIMIT 40
      `, [], (errLogs, logs) => {
        const totalNodes = (nodes || []).length;
        const inviolados = (nodes || []).filter(n => n.status === 'inviolado').length;
        const violados = (nodes || []).filter(n => n.status === 'violado').length;
        const totalSyncs = (nodes || []).reduce((acc, n) => acc + (n.total_syncs || 0), 0);

        res.json({
          ok: true,
          kpis: {
            total_nos: totalNodes,
            inviolados: inviolados,
            violados: violados,
            total_syncs: totalSyncs,
            status_geral: violados > 0 ? 'ALERTA_VIOLACAO' : '100%_SEGURO_INVIOLAVEL',
            algoritmo: 'AES-256-GCM + HMAC-SHA512'
          },
          nodes: nodes || [],
          logs: logs || []
        });
      });
    });
  });

  // POST /api/super/synccheff/validar-script — Sandbox de Auditoria de Integridade de Script
  app.post('/api/super/synccheff/validar-script', superAdminAuth, (req, res) => {
    const { script, restaurante_id } = req.body || {};
    syncCheff.auditarIntegridadeScript(script, masterDb, (err, resultado) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, ...resultado });
    });
  });

  // POST /api/super/synccheff/gerar-script — Gerador de Script Oficial Inviolável
  app.post('/api/super/synccheff/gerar-script', superAdminAuth, (req, res) => {
    const { restaurante_id, restaurante_nome } = req.body || {};
    const rid = String(restaurante_id || '1');
    const rnome = String(restaurante_nome || 'Restaurante Oficial');

    const codigo = syncCheff.getOfficialGoogleAppsScript(rid, rnome);
    const hash = syncCheff.calculateSha256(codigo);
    const assinatura = syncCheff.signHmac(hash);

    res.json({
      ok: true,
      restaurante_id: rid,
      restaurante_nome: rnome,
      versao: 'v2.4-inviolavel',
      codigo: codigo,
      hash_sha256: hash,
      assinatura_hmac: assinatura,
      selo: 'SYNCCHEFF_AUTHENTIC_SEALED'
    });
  });

  // POST /api/super/synccheff/redefinir-status — Limpa flag de violação
  app.post('/api/super/synccheff/redefinir-status', superAdminAuth, (req, res) => {
    const { restaurante_id } = req.body || {};
    if (!restaurante_id) return res.json({ ok: false, erro: 'ID do restaurante obrigatório.' });

    masterDb.run(`
      UPDATE synccheff_nodes 
      SET status = 'inviolado', tentativas_violacao = 0 
      WHERE restaurante_id = ?
    `, [restaurante_id], (err) => {
      if (err) return res.json({ ok: false, erro: err.message });
      syncCheff.registrarAuditoria(masterDb, restaurante_id, 'status_resetado', 'Status de segurança redefinido pelo Super Admin.', getClientIp(req), 'info');
      res.json({ ok: true, mensagem: 'Status do restaurante redefinido para INVIOLADO.' });
    });
  });

  // POST /api/synccheff/sync — Ingestão de telemetria segura (Pública com Assinatura Digital)
  app.post('/api/synccheff/sync', (req, res) => {
    const payload = req.body || {};
    const clientIp = getClientIp(req);

    syncCheff.processarSyncCheffPayload(payload, clientIp, masterDb, io, (err, resultado) => {
      if (err) {
        return res.status(403).json({ ok: false, erro: err.message, status: 'VIOLACAO_DETECTADA' });
      }
      res.json(resultado);
    });
  });


  // ── CENTRAL DE NOTIFICAÇÕES ENTERPRISE (31k Tenants) ──
  const SuperAdminNotificationEngine = require('../super-admin-notification-engine');
  const notificationEngine = new SuperAdminNotificationEngine({ masterDb, io });

  // GET /api/super/notificacoes
  app.get('/api/super/notificacoes', superAdminAuth, async (req, res) => {
    try {
      const { restaurante_id, categoria, prioridade, lida, busca, limit, offset } = req.query;
      const data = await notificationEngine.listar({
        restaurante_id,
        categoria,
        prioridade,
        lida,
        busca,
        limit: limit ? parseInt(limit) : 50,
        offset: offset ? parseInt(offset) : 0
      });
      res.json({ ok: true, ...data });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // GET /api/super/notificacoes/stats
  app.get('/api/super/notificacoes/stats', superAdminAuth, async (req, res) => {
    try {
      const stats = await notificationEngine.obterStats();
      res.json({ ok: true, stats });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // POST /api/super/notificacoes/marcar-lida/:id
  app.post('/api/super/notificacoes/marcar-lida/:id', superAdminAuth, async (req, res) => {
    try {
      const result = await notificationEngine.marcarComoLida(req.params.id);
      res.json(result);
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // POST /api/super/notificacoes/marcar-todas-lidas
  app.post('/api/super/notificacoes/marcar-todas-lidas', superAdminAuth, async (req, res) => {
    try {
      const { restaurante_id } = req.body || {};
      const result = await notificationEngine.marcarTodasComoLidas(restaurante_id);
      res.json(result);
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

  // POST /api/super/notificacoes/broadcast
  app.post('/api/super/notificacoes/broadcast', superAdminAuth, async (req, res) => {
    try {
      const { titulo, mensagem, prioridade, categoria, target_restaurante_id } = req.body || {};
      if (!titulo || !mensagem) return res.json({ ok: false, erro: 'Título e mensagem são obrigatórios.' });
      const notif = notificationEngine.dispararBroadcast({
        titulo,
        mensagem,
        prioridade,
        categoria,
        target_restaurante_id
      });
      res.json({ ok: true, mensagem: 'Broadcast disparado com sucesso para os tenants!', notif });
    } catch (e) {
      res.json({ ok: false, erro: e.message });
    }
  });

};
