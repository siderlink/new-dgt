module.exports = function(socket, io, db, helpers) {
  const { checkCaixa, activePaymentLocks, broadcastPedidos, mesasFechando, licenseManager, verificarSenhaAdmin, verificarSenhaFuncionario, getLocalTimestamp } = helpers;

  function fidelidadeNivel(totalGasto, cfg) {
    const prata = parseFloat(cfg.fidelidade_nivel_prata) || 500;
    const ouro = parseFloat(cfg.fidelidade_nivel_ouro) || 1500;
    const diamante = parseFloat(cfg.fidelidade_nivel_diamante) || 3500;
    if (totalGasto >= diamante) return 'Diamante';
    if (totalGasto >= ouro) return 'Ouro';
    if (totalGasto >= prata) return 'Prata';
    return 'Bronze';
  }

  function fidelidadeBonusPct(nivel, cfg) {
    if (nivel === 'Diamante') return parseFloat(cfg.fidelidade_bonus_diamante) || 30;
    if (nivel === 'Ouro') return parseFloat(cfg.fidelidade_bonus_ouro) || 20;
    if (nivel === 'Prata') return parseFloat(cfg.fidelidade_bonus_prata) || 10;
    return 0;
  }

  // (Segurança) Regras de autorização para ABRIR/FECHAR caixa por cargo:
  //  - Admin/Gerente: não precisam de senha.
  //  - Caixa: digita a própria senha (a do caixa).
  //  - Garçom/demais: deve informar a senha de um caixa, admin ou gerente.
  function socketEhAdminOuGerente(sock) {
    if (!sock) return false;
    if (sock.isAdminToken || sock.auth?.is_dono) return true;
    const jwtRole = String(sock.jwtRole || sock.auth?.role || '').toLowerCase();
    if (['admin', 'administrador', 'gerente', 'dono', 'proprietario', 'master'].includes(jwtRole)) return true;
    const cargo = String(sock.funcionarioCargo || sock.auth?.cargo || '').toLowerCase();
    return ['admin', 'administrador', 'adm', 'gerente', 'dono', 'master', 'dono / gerente master'].some(c => cargo.includes(c));
  }

  function getFuncionarioPorId(id) {
    return new Promise((resolve) => {
      if (!id) return resolve(null);
      db.get(`SELECT * FROM funcionarios WHERE id = ?`, [id], (err, row) => resolve(row || null));
    });
  }

  // Valida se a senha pertence a qualquer funcionário caixa/admin/gerente.
  function validarSenhaCaixaAdminGerente(senha) {
    return new Promise((resolve) => {
      if (!senha) return resolve(false);
      db.all(`SELECT * FROM funcionarios WHERE cargo IN ('Caixa', 'Admin', 'Administrador', 'Gerente', 'adm')`, [], async (err, rows) => {
        if (err || !rows || rows.length === 0) return resolve(false);
        for (const row of rows) {
          try {
            if (await verificarSenhaFuncionario(row, senha)) return resolve(true);
          } catch (e) { /* continua tentando */ }
        }
        resolve(false);
      });
    });
  }

  // Autoriza o fechamento do caixa conforme o cargo de quem opera.
  async function autorizarFecharCaixa(data) {
    // Admin/Gerente autenticados: sem senha.
    if (socketEhAdminOuGerente(socket)) return true;

    const senha = data && data.senha ? String(data.senha) : '';
    if (!senha) return false;

    // Admin master (usuários) também autoriza o fechamento.
    try {
      if (await verificarSenhaAdmin(senha)) return true;
    } catch (e) {}

    // Caixa identificado no socket: exige a PRÓPRIA senha do caixa.
    const funcionario = await getFuncionarioPorId(socket.funcionarioId);
    if (funcionario && String(funcionario.cargo) === 'Caixa') {
      try {
        if (await verificarSenhaFuncionario(funcionario, senha)) return true;
      } catch (e) {}
    }

    // Garçom/demais (ou caixa não identificado): senha de caixa/admin/gerente.
    return validarSenhaCaixaAdminGerente(senha);
  }

  socket.on('get_financeiro', () => {
    checkCaixa(turno => {
      if (!turno) return socket.emit('financeiro_atualizado', []);
      db.all(`SELECT * FROM movimentacoes WHERE turno_id = ? ORDER BY id DESC`, [turno.id], (err, rows) => {
        socket.emit('financeiro_atualizado', rows || []);
      });
    });
  });

  socket.on('add_despesa', ({ valor, descricao }) => {
    checkCaixa(turno => {
      if (!turno) return socket.emit('erro_caixa', 'Caixa fechado!');
        db.run(`INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, 'Saída', ?, 'Dinheiro', ?, datetime('now', 'localtime'))`, 
        [turno.id, valor, descricao], (err) => {
          if(!err) {
             db.all(`SELECT * FROM movimentacoes WHERE turno_id = ? ORDER BY id DESC`, [turno.id], (e, rows) => {
               io.emit('financeiro_atualizado', rows || []);
             });
          }
      });
    });
  });

  socket.on('get_relatorios', () => {
    checkCaixa(turno => {
      if (!turno) return socket.emit('relatorios_atualizados', { produtos: [], garcons: [], mesas: [], total: 0 });
      db.all(`SELECT productName, SUM(quantity) as qtd, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as total FROM pedidos WHERE status IN ('Finalizado', 'Pago', 'Fracionado') AND turno_id = ? AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%' GROUP BY productName ORDER BY qtd DESC`, [turno.id], (err, prodRows) => {
        db.all(`SELECT userName, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as total FROM pedidos WHERE status IN ('Finalizado', 'Pago', 'Fracionado') AND turno_id = ? AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%' GROUP BY userName ORDER BY total DESC`, [turno.id], (err, userRows) => {
          db.all(`SELECT localName, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as total FROM pedidos WHERE status IN ('Finalizado', 'Pago', 'Fracionado') AND turno_id = ? AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%' GROUP BY localName ORDER BY total DESC`, [turno.id], (err, mesaRows) => {
            db.get(`SELECT SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as geral FROM pedidos WHERE status IN ('Finalizado', 'Pago', 'Fracionado') AND turno_id = ? AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%'`, [turno.id], (err, totalRow) => {
              socket.emit('relatorios_atualizados', { 
                produtos: prodRows || [], 
                garcons: userRows || [],
                mesas: mesaRows || [],
                total: totalRow ? (totalRow.geral || 0) : 0
              });
            });
          });
        });
      });
    });
  });

  socket.on('get_estado_caixa', () => {
    checkCaixa(turno => {
      socket.emit('estado_caixa', turno);
    });
  });

  socket.on('abrir_caixa', (data) => {
    const payload = (data && typeof data === 'object') ? data : {};
    const fundo_troco = parseFloat(String(payload.fundo_troco || '0').replace(',', '.')) || 0;
    const operador = payload.operador || 'Caixa';
    const tid = socket.restaurante_id || 1;
    
    console.log(`🔓 [CAIXA] Abertura de caixa solicitada: R$ ${fundo_troco.toFixed(2)} por ${operador} (Tenant: ${tid})`);

    checkCaixa(turnoAtual => {
      if (turnoAtual) {
        console.log(`✅ [CAIXA] Caixa já aberto (Turno ID: ${turnoAtual.id})`);
        io.to(`restaurante_${tid}`).emit('estado_caixa', turnoAtual);
        io.to(`restaurante_${tid}`).emit('caixa_aberto_sucesso');
        io.emit('estado_caixa', turnoAtual);
        io.emit('caixa_aberto_sucesso');
        socket.emit('estado_caixa', turnoAtual);
        socket.emit('caixa_aberto_sucesso');
        return;
      }
      
      db.run(
        `INSERT INTO turnos_caixa (fundo_troco, status, data_abertura) VALUES (?, 'Aberto', datetime('now', 'localtime'))`,
        [fundo_troco],
        function (err) {
          if (!err) {
            const newTurno = { id: this.lastID, status: 'Aberto', fundo_troco, data_abertura: new Date().toISOString() };
            console.log(`🎉 [CAIXA ABERTO COM SUCESSO] Novo Turno ID: ${newTurno.id} | R$ ${fundo_troco.toFixed(2)} por ${operador}`);
            
            db.run(`UPDATE mesas SET status = 'Disponível', observacao = ''`, () => {});
            db.run(`UPDATE pedidos SET status = 'Finalizado' WHERE status NOT IN ('Finalizado', 'Cancelado') AND (turno_id IS NULL OR turno_id < ?)`, [newTurno.id], () => {});

            if (typeof global.registrarAuditoria === 'function') {
              try {
                global.registrarAuditoria(operador, 'ABERTURA_CAIXA', `Caixa aberto com fundo R$ ${fundo_troco.toFixed(2)}`, 'Início de Turno', 'BAIXO');
              } catch (eAudit) {}
            }
            
            io.to(`restaurante_${tid}`).emit('estado_caixa', newTurno);
            io.to(`restaurante_${tid}`).emit('caixa_aberto_sucesso');
            io.emit('estado_caixa', newTurno);
            io.emit('caixa_aberto_sucesso');
            socket.emit('estado_caixa', newTurno);
            socket.emit('caixa_aberto_sucesso');
            db.all(`SELECT * FROM mesas`, (e, r) => {
              io.to(`restaurante_${tid}`).emit('mesas_atualizadas', r || []);
              io.emit('mesas_atualizadas', r || []);
            });
            if (typeof broadcastPedidos === 'function') broadcastPedidos();
          } else {
            console.error("❌ [ERRO AO ABRIR CAIXA]:", err);
            socket.emit('erro_caixa', 'Erro no servidor ao abrir o caixa: ' + (err.message || 'Falha no banco de dados'));
          }
        }
      );
    });
  });

  socket.on('fechar_caixa', async (data) => {
    if (!(await autorizarFecharCaixa(data))) {
      return socket.emit('erro_fechar_caixa', { ok: false, msg: 'Permissão negada. Informe a senha de um caixa, administrador ou gerente.', mesasAbertas: [] });
    }
    const op = (data && data.operador) ? data.operador : 'Caixa';
    db.all(
      `SELECT DISTINCT localName as nome FROM pedidos WHERE status NOT IN ('Finalizado', 'Cancelado') AND localName IS NOT NULL AND localName != '' UNION SELECT nome FROM mesas WHERE status != 'Disponível'`,
      [],
      (err, rows) => {
        const abertas = (rows || []).map(r => r.nome).filter(Boolean);
        if (abertas.length > 0) {
          socket.emit('erro_fechar_caixa', {
            ok: false,
            msg: `Não é possível fechar o caixa! Existem ${abertas.length} mesa(s)/comanda(s) ainda abertas: ${abertas.join(', ')}. Finalize todas antes de encerrar o turno.`,
            mesasAbertas: abertas
          });
          return;
        }

        db.get(`SELECT valor FROM configuracoes WHERE chave = 'ponto_saida_fechar_caixa'`, (errCfg, configRow) => {
          const autoClosePonto = configRow && configRow.valor === 'true';

          db.run(
            `UPDATE turnos_caixa SET status = 'Fechado', data_fechamento = datetime('now', 'localtime') WHERE status = 'Aberto'`,
            function (err) {
              if (!err) {
                global.registrarAuditoria(op, 'FECHAMENTO_CAIXA', 'Caixa fechado (Fechamento Normal)', 'Rotina de Encerramento', 'ALTO');
                
                if (autoClosePonto) {
                  db.all(
                    `SELECT p.id, p.entrada, f.id as funcionario_id, f.valor_hora, f.tipo_remuneracao, f.valor_dia, f.valor_semana, f.valor_mes 
                     FROM pontos p 
                     JOIN funcionarios f ON p.funcionario_id = f.id 
                     WHERE p.saida IS NULL`,
                    [],
                    (errP, rows) => {
                      if (!errP && rows && rows.length > 0) {
                        const agora = getLocalTimestamp ? getLocalTimestamp() : new Date().toISOString().replace('T', ' ').substring(0, 19);
                        rows.forEach(row => {
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
                            valorPagar = (row.valor_semana || 0) / 6;
                          } else if (tipoRem === 'mes') {
                            valorPagar = (row.valor_mes || 0) / 26;
                          }

                          db.run(
                            `UPDATE pontos SET saida = ?, total_horas = ?, valor_pagar = ? WHERE id = ?`,
                            [agora, horasTrabalhadas, valorPagar, row.id]
                          );
                        });
                        io.emit('rh_update');
                      }
                    }
                  );
                }

                // --- BACKUP AUTOMÁTICO DO BANCO DE DADOS AO FECHAR O CAIXA ---
                try {
                  const fsSync = require('fs');
                  const pathMod = require('path');
                  const backupDir = pathMod.join(__dirname, '..', 'backups');
                  if (!fsSync.existsSync(backupDir)) fsSync.mkdirSync(backupDir, { recursive: true });
                  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                  const dbSrc = pathMod.join(__dirname, '..', 'database.sqlite');
                  const dbDst = pathMod.join(backupDir, `database_backup_${ts}.sqlite`);
                  if (fsSync.existsSync(dbSrc)) {
                    fsSync.copyFile(dbSrc, dbDst, (bErr) => {
                      if (!bErr) console.log(`[BACKUP AUTOMÁTICO] Criado: ${dbDst}`);
                    });
                  }
                } catch (errBk) {
                  console.error('[BACKUP AUTOMÁTICO ERRO]', errBk);
                }

                io.emit('estado_caixa', null);
                socket.emit('caixa_fechado_sucesso');
              }
            }
          );
        });
      }
    );
  });

  socket.on('get_relatorio_caixa', () => {
    checkCaixa(turno => {
      if (!turno) {
        socket.emit('relatorio_caixa', null);
        return;
      }
      db.all(`SELECT * FROM movimentacoes WHERE turno_id = ? ORDER BY id DESC`, [turno.id], (err, rows) => {
        let stats = {
          turno_id: turno.id,
          data_abertura: turno.data_abertura,
          fundo_troco: turno.fundo_troco,
          total_dinheiro: 0,
          total_pix: 0,
          total_cartao: 0,
          total_debito: 0,
          total_credito: 0,
          total_fiado: 0,
          total_sangria: 0,
          total_suprimento: 0,
          total_desconto: 0,
          total_pedidos: 0,
          total_itens_vendidos: 0,
          historico: rows || [],
          produtos_vendidos: [],
          dre: null
        };
        if (rows) {
          rows.forEach(r => {
            if (r.tipo === 'Entrada') {
              const fp = (r.forma_pagamento || '').toLowerCase();
              if (fp.includes('dinheiro')) stats.total_dinheiro += r.valor;
              else if (fp.includes('pix')) stats.total_pix += r.valor;
              else if (fp.includes('débito') || fp.includes('debito')) stats.total_debito += r.valor;
              else if (fp.includes('crédito') || fp.includes('credito') || fp.includes('cartão') || fp.includes('cartao')) stats.total_credito += r.valor;
              else if (fp.includes('fiado') || fp.includes('conta')) stats.total_fiado += r.valor;
              else stats.total_credito += r.valor;
            } else if (r.tipo === 'Sangria') {
              stats.total_sangria += r.valor;
            } else if (r.tipo === 'Suprimento') {
              stats.total_suprimento += r.valor;
            } else if (r.tipo === 'Desconto') {
              stats.total_desconto += r.valor;
            }
          });
        }
        
        db.all(`SELECT ped.productName, SUM(ped.quantity) as qty, SUM(ped.total) as valTotal, COALESCE(p.custo, 0) as custoUnit FROM pedidos ped LEFT JOIN produtos p ON LOWER(TRIM(p.nome)) = LOWER(TRIM(ped.productName)) WHERE ped.turno_id = ? AND ped.productName NOT LIKE 'Pgto Parcial%' AND ped.productName NOT LIKE 'Pgto QR Code%' AND CAST(ped.total AS REAL) >= 0 GROUP BY ped.productName ORDER BY valTotal DESC`, [turno.id], (errProd, pRows) => {
           let cmvTotal = 0;
           if (pRows) {
             stats.produtos_vendidos = pRows;
             stats.total_itens_vendidos = pRows.reduce((acc, p) => acc + (parseInt(p.qty) || 0), 0);
             cmvTotal = pRows.reduce((acc, p) => acc + ((parseInt(p.qty) || 0) * (parseFloat(p.custoUnit) || 0)), 0);
           }
           
           db.all(`SELECT * FROM formas_pagamento`, [], (errFp, fpRows) => {
             const taxaMap = {};
             if (fpRows) {
               fpRows.forEach(fp => {
                 taxaMap[fp.nome.toLowerCase()] = parseFloat(fp.taxa || 0);
                 taxaMap[fp.tipo.toLowerCase()] = parseFloat(fp.taxa || 0);
               });
             }

             const taxaPix = (stats.total_pix * (taxaMap['pix'] || 0)) / 100;
             const taxaDebito = (stats.total_debito * (taxaMap['debito'] || 1.2)) / 100;
             const taxaCredito = (stats.total_credito * (taxaMap['credito'] || 2.5)) / 100;
             const taxasMaquininha = taxaPix + taxaDebito + taxaCredito;

             const faturamentoBruto = stats.total_dinheiro + stats.total_pix + stats.total_credito + stats.total_debito + stats.total_fiado;
             const receitaLiquida = Math.max(0, faturamentoBruto - stats.total_desconto);
             const lucroLiquido = receitaLiquida - cmvTotal - taxasMaquininha - stats.total_sangria;
             const margemLucroPct = faturamentoBruto > 0 ? (lucroLiquido / faturamentoBruto) * 100 : 0;

             stats.dre = {
               faturamento_bruto: faturamentoBruto,
               descontos: stats.total_desconto,
               receita_liquida: receitaLiquida,
               cmv: cmvTotal,
               taxas_maquininha: taxasMaquininha,
               sangrias_despesas: stats.total_sangria,
               lucro_liquido: lucroLiquido,
               margem_lucro_pct: margemLucroPct
             };

             db.get(`SELECT COUNT(DISTINCT id) as total_pedidos FROM pedidos WHERE turno_id = ? AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%' AND CAST(total AS REAL) >= 0`, [turno.id], (errPed, pedRow) => {
               if (pedRow) stats.total_pedidos = pedRow.total_pedidos || 0;
               socket.emit('relatorio_caixa', stats);
             });
           });
        });
      });
    });
  });

  socket.on('pagamento_parcial_valor', ({ mesaName, valor, metodo, userName, comTaxa, comandaName, itemIds }) => {
    checkCaixa(turno => {
      if (!turno) {
        socket.emit('erro_caixa', 'O caixa está fechado! Abra o caixa antes de receber pagamentos.');
        return;
      }
      
      const lockKey = `${mesaName}_${metodo}_${Number(valor).toFixed(2)}_${comandaName || ''}`;
      if (activePaymentLocks.has(lockKey)) {
        console.warn('[DUPLICATE PREVENTED] Lock active for payment:', lockKey);
        return;
      }
      activePaymentLocks.add(lockKey);
      setTimeout(() => activePaymentLocks.delete(lockKey), 1500);

      db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ?) AND status != 'Finalizado'`, [mesaName, mesaName], (err, rows) => {
        if (err || !rows) rows = [];

        let consumoBruto = 0;
        let jaPago = 0;
        rows.forEach(r => {
          const v = parseFloat(String(r.total).replace(',', '.')) || 0;
          if (v >= 0) {
            consumoBruto += v;
          } else if (r.productName && (String(r.productName).indexOf('Pgto Parcial') !== -1 || String(r.productName).indexOf('Pagamento') !== -1)) {
            jaPago += Math.abs(v);
          }
        });

        const aplicarTaxa = comTaxa !== false;
        const totalComTaxa = aplicarTaxa ? (consumoBruto * 1.10) : consumoBruto;
        const saldoRestante = Math.max(0, totalComTaxa - jaPago);

        if (saldoRestante <= 0.01) {
          activePaymentLocks.delete(lockKey);
          socket.emit('erro_pagamento', 'A conta desta mesa já está totalmente paga!');
          return;
        }

        if (metodo !== 'Dinheiro' && valor > saldoRestante + 0.05) {
          activePaymentLocks.delete(lockKey);
          socket.emit('erro_pagamento', `O valor excedeu o saldo.`);
          return;
        }

        let valorRegistrado = valor;
        if (metodo === 'Dinheiro' && valor > saldoRestante + 0.01) valorRegistrado = saldoRestante;

        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        const negativeTotal = (-Math.abs(valorRegistrado)).toFixed(2).replace('.', ',');
        const descStr = comandaName ? `Pgto Parcial (${metodo}) - Comanda ${comandaName}` : `Pgto Parcial (${metodo})`;
        
        db.run(
          `INSERT INTO pedidos (productName, productEmoji, quantity, total, status, localName, userName, time, sector, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
          [descStr, '💸', 1, negativeTotal, 'Entregue', mesaName, userName, timeStr, 'Caixa'],
          function (err) {
            if (err) {
              console.error('Erro no pagamento_parcial:', err);
              socket.emit('erro_servidor', 'Falha ao processar o pagamento.');
              return;
            }
            const lastID = this.lastID;

            // Registrar na tabela movimentacoes (única fonte de verdade para o relatório financeiro)
            db.run(
              `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, 'Entrada', ?, ?, ?, datetime('now', 'localtime'))`,
              [turno.id, valorRegistrado, metodo, `Pgto Parcial: ${mesaName}`]
            );
            
            if (Array.isArray(itemIds) && itemIds.length > 0) {
              const placeholders = itemIds.map(() => '?').join(',');
              db.run(`UPDATE pedidos SET status = 'Pago', turno_id = ? WHERE id IN (${placeholders})`, [turno.id, ...itemIds], () => {
                broadcastPedidos();
              });
            } else if (comandaName && String(comandaName).trim()) {
              db.run(
                `UPDATE pedidos SET status = 'Pago', turno_id = ? WHERE (localName = ? OR mesa_grupo = ?) AND TRIM(mesa_comanda) = ? AND status != 'Finalizado' AND status != 'Pago'`,
                [turno.id, mesaName, mesaName, String(comandaName).trim()],
                () => {
                  broadcastPedidos();
                }
              );
            } else {
              broadcastPedidos();
            }

            db.get(`SELECT * FROM pedidos WHERE id = ?`, [lastID], (err, row) => {
               if (row) io.emit('pedido_adicionado', row);
            });
            db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ?) AND status != 'Finalizado'`, [mesaName, mesaName], (e, r) => {
               io.emit('itens_mesa_recebidos', { mesaName, items: r || [] });
            });
            // Notificação em tempo real (caixa ↔ garçom): quem recebe o pagamento e quem
            // está com o modal aberto na mesa atualiza na hora.
            io.emit('pagamento_parcial_registrado', {
              mesaName, valor: valorRegistrado, metodo, userName: userName || 'Caixa',
              comandaName: comandaName || null, originSocket: socket.id
            });
            setTimeout(() => io.emit('atualizacao_caixa'), 300);
          }
        );
      });
    });
  });

  socket.on('marcar_fracionado', ({ mesaName, itemIds }) => {
    if (!Array.isArray(itemIds) || itemIds.length === 0) return;
    checkCaixa(turno => {
      const turnoId = turno ? turno.id : null;
      db.all(`SELECT id FROM pedidos WHERE (localName = ? OR mesa_grupo = ?) AND status NOT IN ('Finalizado','Cancelado','Pago','Fracionado')`, [mesaName, mesaName], (err, rows) => {
        if (err) return;
        const ids = (rows || []).map(r => r.id).filter(id => itemIds.includes(id));
        if (ids.length === 0) return;
        const placeholders = ids.map(() => '?').join(',');
        db.run(`UPDATE pedidos SET status = 'Fracionado', turno_id = COALESCE(turno_id, ?) WHERE id IN (${placeholders})`, [turnoId, ...ids], () => {
          broadcastPedidos();
          db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ?) AND status != 'Finalizado'`, [mesaName, mesaName], (e, r) => {
            io.emit('itens_mesa_recebidos', { mesaName, items: r || [] });
          });
        });
      });
    });
  });

  socket.on('nova_comanda_crm', ({ nome, telefone }) => {
    let finalName = (nome || '').trim();
    if (!finalName) return;
    if (!finalName.toLowerCase().includes('comanda')) {
      finalName = `Comanda - ${finalName}`;
    }
    db.get(`SELECT * FROM mesas WHERE nome = ?`, [finalName], (err, row) => {
      if (!row) {
        db.run(`INSERT INTO mesas (nome, status, observacao) VALUES (?, 'Disponível', ?)`, [finalName, telefone || ''], (err) => {
          if (!err) {
            db.all(`SELECT * FROM mesas`, (err, rows) => {
              io.emit('mesas_atualizadas', rows || []);
              socket.emit('comanda_criada_sucesso', { nomeMesa: finalName });
            });
          }
        });
      } else {
        socket.emit('comanda_criada_sucesso', { nomeMesa: finalName });
      }
    });
  });

  socket.on('finalizar_mesa', ({ mesaName, payments, totalValue, emitirNfce, cpfCnpj, clienteNome, customNfceConfig }) => {
    checkCaixa(turno => {
      if (!turno) {
        socket.emit('erro_caixa', 'O caixa está fechado! Abra o caixa antes de finalizar vendas.');
        return;
      }
      
      db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ? OR mesa_comanda = ?) AND status != 'Finalizado'`, [mesaName, mesaName, mesaName], (errItems, itemsMesa) => {
        if (errItems) {
          socket.emit('erro_caixa', 'Erro ao acessar o banco de dados.');
          return;
        }
        const rows = itemsMesa || [];
        
        let consumoBrutoTotal = 0;
        let pagoParcialTotal = 0;
        rows.forEach(r => {
          const v = parseFloat(String(r.total).replace(',', '.')) || 0;
          if (v >= 0) {
            consumoBrutoTotal += v;
          } else if (r.productName && (String(r.productName).indexOf('Pgto Parcial') !== -1 || String(r.productName).indexOf('Pagamento') !== -1)) {
            pagoParcialTotal += Math.abs(v);
          }
        });

        const taxaMult = consumoBrutoTotal > 0 ? (totalValue / consumoBrutoTotal) : 1.0;
        const pendenteComTaxa = Math.max(0, consumoBrutoTotal * taxaMult - pagoParcialTotal);

        const pago = (payments || []).reduce((acc, curr) => acc + (curr.valor || 0), 0);
        if (pago < pendenteComTaxa - 0.05 && pendenteComTaxa > 0) {
          socket.emit('erro_caixa', 'Pagamento incompleto! A mesa não pode ser fechada sem o pagamento total.');
          return;
        }
        const primaryMethod = (payments && payments.length > 1) ? 'Múltiplo' : (payments && payments[0] ? payments[0].metodo : 'Dinheiro');

        db.run(
          `UPDATE pedidos SET status = ?, paymentMethod = ?, turno_id = ? WHERE (localName = ? OR mesa_grupo = ?) AND status != 'Finalizado'`,
          ['Finalizado', primaryMethod, turno.id, mesaName, mesaName],
          function (err) {
            if (err) console.error(err);
            
            setTimeout(() => io.emit('atualizacao_caixa'), 300);

            io.emit('mesa_finalizada', { mesaName });
            const liberarMesas = () => {
              mesasFechando.delete(mesaName);
              io.emit('sync_mesas_fechando', Array.from(mesasFechando));
              db.all(`SELECT * FROM mesas`, (e, r) => io.emit('mesas_atualizadas', r || []));
            };
            if (mesaName && mesaName.includes(' + ')) {
              const nomes = mesaName.split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
              if (nomes.length > 0) {
                const placeholders = nomes.map(() => '?').join(',');
                db.run(`UPDATE mesas SET status = 'Disponível', observacao = '' WHERE nome IN (${placeholders})`, nomes, liberarMesas);
              } else {
                liberarMesas();
              }
            } else {
              db.run(`UPDATE mesas SET status = 'Disponível', observacao = '' WHERE nome = ?`, [mesaName], liberarMesas);
            }

            // Lógica de Fidelidade (cashback em pontos + níveis)
            db.get(`SELECT cliente_id FROM pedidos WHERE (localName = ? OR mesa_grupo = ?) AND turno_id = ? AND cliente_id IS NOT NULL LIMIT 1`, [mesaName, mesaName, turno.id], (err, row) => {
               if (row && row.cliente_id) {
                  db.all(`SELECT chave, valor FROM configuracoes`, (eCfg, cfgRows) => {
                     const cfg = {};
                     if (cfgRows) cfgRows.forEach(r => cfg[r.chave] = r.valor);
                     if (cfg.fidelidade_enabled === 'false') return;
                     db.get(`SELECT * FROM clientes WHERE id = ?`, [row.cliente_id], (eCli, cliente) => {
                        if (!cliente) return;
                        const pontosPorReal = parseFloat(cfg.fidelidade_pontos_por_real) || 1;
                        let pontosGanhos = Math.floor((parseFloat(totalValue) || 0) * pontosPorReal);
                        const totalGastoNovo = (parseFloat(cliente.total_gasto) || 0) + (parseFloat(totalValue) || 0);
                        const nivel = fidelidadeNivel(totalGastoNovo, cfg);
                        const bonus = fidelidadeBonusPct(nivel, cfg);
                        if (bonus > 0) pontosGanhos += Math.floor(pontosGanhos * bonus / 100);
                        if (pontosGanhos > 0 || cliente.nivel !== nivel) {
                           db.run(`UPDATE clientes SET pontos = pontos + ?, total_gasto = ?, nivel = ? WHERE id = ?`, [pontosGanhos, totalGastoNovo, nivel, row.cliente_id], () => {
                              db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
                           });
                        }
                     });
                  });
               }
            });

            // ====================================================
            // EMISSÃO AUTOMÁTICA DE NFC-e AO FECHAR MESA
            // ====================================================
            if (emitirNfce) {
              db.all(`SELECT * FROM configuracoes`, (errConfig, configRows) => {
                const config = {};
                if (configRows) configRows.forEach(r => config[r.chave] = r.valor);

                // Monta os itens para a nota
                let nfceItems = [];
                let nfceTotal = parseFloat(totalValue) || 0;

                if (customNfceConfig && customNfceConfig.agrupar) {
                  // Nota agrupada (1 item genérico)
                  nfceItems = [{
                    productName: customNfceConfig.descricaoAgrupada || '1 Refeição',
                    quantity: 1,
                    preco: customNfceConfig.totalAgrupado || nfceTotal,
                    total: customNfceConfig.totalAgrupado || nfceTotal
                  }];
                  nfceTotal = customNfceConfig.totalAgrupado || nfceTotal;
                } else if (customNfceConfig && customNfceConfig.finalItems && customNfceConfig.finalItems.length > 0) {
                  // Itens customizados do modal
                  nfceItems = customNfceConfig.finalItems.map(it => ({
                    productName: it.produto_nome || it.nome || 'Produto',
                    quantity: it.quantidade || it.qtd || 1,
                    preco: it.preco || it.total || 0,
                    total: it.total || (it.preco * (it.quantidade || 1)) || 0
                  }));
                } else {
                  // Usa os itens reais da mesa
                  rows.forEach(r => {
                    nfceItems.push({
                      productName: r.nome || r.descricao || 'Produto',
                      quantity: r.quantidade || 1,
                      preco: parseFloat(String(r.total || 0).replace(',', '.')) / (r.quantidade || 1),
                      total: parseFloat(String(r.total || 0).replace(',', '.'))
                    });
                  });
                }

                const nfceService = require('../nfce-service');
                nfceService.emitirNFCe({
                  db,
                  pedidoId: null,
                  localName: mesaName,
                  items: nfceItems,
                  totalValue: nfceTotal,
                  cpfCnpj: cpfCnpj || '',
                  clienteNome: clienteNome || '',
                  paymentMethods: primaryMethod,
                  config
                }).then(res => {
                  if (res.ok) {
                    socket.emit('nfce_emitida_sucesso', res);
                    // Atualiza a lista de notas para todos
                    db.all(`SELECT id, pedido_id, localName, cliente_nome, cpf_cnpj, valor_total, chave_acesso, numero_nota, serie, ambiente, status, protocolo, created_at FROM nfce_notas ORDER BY id DESC`, (e, notasRows) => {
                      io.emit('nfce_lista_atualizada', notasRows || []);
                    });
                  } else {
                    console.error('[NFC-e] Falha ao emitir:', res.erro);
                    socket.emit('erro_nfce', `Erro ao emitir NFC-e para ${mesaName}: ${res.erro}`);
                  }
                }).catch(nfceErr => {
                  console.error('[NFC-e] Erro inesperado:', nfceErr);
                  socket.emit('erro_nfce', `Erro ao emitir NFC-e: ${nfceErr.message}`);
                });
              });
            }
          }
        );
      });
    });
  });



  socket.on('finalizar_parcial_mesa', ({ mesaName, pedidoIds, payments }) => {
    if (licenseManager.isRestricted()) {
      socket.emit('erro_finalizar', { msg: '⚠️ Sistema em modo restrito. Ative a licença para fechar contas.' });
      return;
    }
    checkCaixa(turno => {
      if (!turno) {
        socket.emit('erro_caixa', 'O caixa está fechado! Abra o caixa antes de finalizar vendas.');
        return;
      }
      
      const primaryMethod = (payments && payments.length > 1) ? 'Múltiplo' : (payments && payments[0] ? payments[0].metodo : 'Dinheiro');
      const placeholders = pedidoIds.map(() => '?').join(',');
      
      db.run(
        `UPDATE pedidos SET status = ?, paymentMethod = ?, turno_id = ? WHERE id IN (${placeholders})`,
        ['Pago', primaryMethod, turno.id, ...pedidoIds],
        function (err) {
          if (err) console.error(err);
          
          if (payments && payments.length > 0) {
            db.serialize(() => {
              db.run("BEGIN TRANSACTION;");
              payments.forEach(p => {
                db.run(
                  `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, 'Entrada', ?, ?, ?, datetime('now', 'localtime'))`,
                  [turno.id, p.valor, p.metodo, `Pgto Parcial: ${mesaName}`]
                );
              });
              db.run("COMMIT;");
            });
            setTimeout(() => io.emit('atualizacao_caixa'), 500);
          }
          
          db.get(`SELECT count(id) as pendentes FROM pedidos WHERE (localName = ? OR mesa_grupo = ?) AND status NOT IN ('Finalizado', 'Cancelado', 'Pago') AND productName NOT LIKE 'Pgto Parcial%'`, 
            [mesaName, mesaName], (err, row) => {
              if (row && row.pendentes === 0) {
                db.run(`UPDATE pedidos SET status = 'Finalizado' WHERE (localName = ? OR mesa_grupo = ?) AND status != 'Finalizado'`, [mesaName, mesaName], () => {
                  db.run(`UPDATE mesas SET status = 'Disponível', observacao = '' WHERE nome = ?`, [mesaName], () => {
                    mesasFechando.delete(mesaName);
                    io.emit('sync_mesas_fechando', Array.from(mesasFechando));
                    db.all(`SELECT * FROM mesas`, (e, r) => io.emit('mesas_atualizadas', r || []));
                    broadcastPedidos();
                  });
                });
              } else {
                broadcastPedidos();
              }
            });
        }
      );
    });
  });

};
