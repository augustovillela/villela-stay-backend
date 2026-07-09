// =====================================================================
// Villela Stay Manager (VSM) — API do APP DE GESTÃO REAL do assinante.
// Prefixo /gestao/api/app/*. Protegido por requireAssinante (cookie vsm_sess)
// + requireAcesso (bloqueia trial vencido/suspensa) + gateModulo (respeita os
// módulos do plano). Tudo escopado no tenant do assinante (app-repo.js).
// =====================================================================
'use strict';
const repo = require('./repo');
const app = require('./app-repo');
const stays = require('./app-stays-repo');

function registrarRotasApp(server, { requireAssinante }) {
  // captura throws síncronos E assíncronos (handlers do app lançam de forma síncrona)
  const h = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(400).json({ erro: e.message }); } };
  const tid = (req) => req.assinante.tenant_id;

  // acesso liberado só em trial/ativa; suspensa/inadimplente/cancelada = 403
  function requireAcesso(req, res, next) {
    const e = repo.entitlements(req.assinante.tenant_id);
    if (!e || !e.acesso_liberado) return res.status(403).json({ erro: 'Acesso bloqueado — regularize seu plano para usar o sistema.', bloqueado: true });
    req.ent = e; next();
  }
  // gate por módulo do plano
  const gate = (mod) => (req, res, next) => (req.ent && req.ent.modulos.includes(mod)) ? next()
    : res.status(403).json({ erro: `O módulo "${mod}" não está no seu plano. Faça upgrade para liberar.`, modulo: mod });
  const G = (mod) => [requireAssinante, requireAcesso, gate(mod)]; // guarda de módulo
  const B = [requireAssinante, requireAcesso];                     // só acesso (painel)

  server.use('/gestao/api/app', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // ---- painel (visão geral) ----
  server.get('/gestao/api/app/painel', ...B, h((req, res) => res.json({ painel: app.painel(tid(req)), entitlements: req.ent })));

  // ---- imóveis ----
  server.get('/gestao/api/app/imoveis', ...G('imoveis'), h((req, res) => res.json({ imoveis: app.Imoveis.listar(tid(req)) })));
  server.post('/gestao/api/app/imoveis', ...G('imoveis'), h((req, res) => res.json({ ok: true, imovel: app.Imoveis.criar(tid(req), req.body || {}) })));
  server.patch('/gestao/api/app/imoveis/:id', ...G('imoveis'), h((req, res) => res.json({ ok: true, imovel: app.Imoveis.atualizar(tid(req), req.params.id, req.body || {}) })));
  server.delete('/gestao/api/app/imoveis/:id', ...G('imoveis'), h((req, res) => res.json({ ok: true, ...app.Imoveis.remover(tid(req), req.params.id) })));

  // ---- hóspedes ----
  server.get('/gestao/api/app/hospedes', ...G('hospede'), h((req, res) => res.json({ hospedes: app.Hospedes.listar(tid(req), req.query.busca) })));
  server.post('/gestao/api/app/hospedes', ...G('hospede'), h((req, res) => res.json({ ok: true, hospede: app.Hospedes.criar(tid(req), req.body || {}) })));

  // ---- reservas ----
  server.get('/gestao/api/app/reservas', ...G('reservas'), h((req, res) => res.json({ reservas: app.Reservas.listar(tid(req), req.query) })));
  server.get('/gestao/api/app/reservas/calendario', ...G('reservas'), h((req, res) => {
    const agora = new Date();
    const ano = Number(req.query.ano) || agora.getUTCFullYear();
    const mes = Number(req.query.mes) || (agora.getUTCMonth() + 1);
    res.json({ ano, mes, ocupacao: app.Reservas.calendario(tid(req), ano, mes) });
  }));
  server.get('/gestao/api/app/reservas/:id', ...G('reservas'), h((req, res) => {
    const r = app.Reservas.obter(tid(req), req.params.id);
    if (!r) return res.status(404).json({ erro: 'Reserva não encontrada.' });
    res.json({ reserva: r });
  }));
  server.post('/gestao/api/app/reservas', ...G('reservas'), h((req, res) => res.json({ ok: true, reserva: app.Reservas.criar(tid(req), req.body || {}) })));
  server.post('/gestao/api/app/reservas/:id/status', ...G('reservas'), h((req, res) => res.json({ ok: true, reserva: app.Reservas.mudarStatus(tid(req), req.params.id, (req.body || {}).status) })));

  // ---- limpezas ----
  server.get('/gestao/api/app/limpezas', ...G('limpeza'), h((req, res) => res.json({ limpezas: app.Limpezas.listar(tid(req), req.query) })));
  server.post('/gestao/api/app/limpezas', ...G('limpeza'), h((req, res) => res.json({ ok: true, limpeza: app.Limpezas.criar(tid(req), req.body || {}) })));
  server.post('/gestao/api/app/limpezas/:id/concluir', ...G('limpeza'), h((req, res) => res.json({ ok: true, ...app.Limpezas.concluir(tid(req), req.params.id, (req.body || {}).concluir !== false) })));

  // ---- manutenção ----
  server.get('/gestao/api/app/manutencao', ...G('manutencao'), h((req, res) => res.json({ chamados: app.Manutencao.listar(tid(req), req.query) })));
  server.post('/gestao/api/app/manutencao', ...G('manutencao'), h((req, res) => res.json({ ok: true, chamado: app.Manutencao.criar(tid(req), req.body || {}) })));
  server.post('/gestao/api/app/manutencao/:id/status', ...G('manutencao'), h((req, res) => res.json({ ok: true, ...app.Manutencao.mudarStatus(tid(req), req.params.id, (req.body || {}).status) })));

  // ---- financeiro ----
  server.get('/gestao/api/app/financeiro', ...G('financeiro'), h((req, res) => res.json({ lancamentos: app.Financeiro.listar(tid(req), req.query), resumo: app.Financeiro.resumo(tid(req)) })));
  server.post('/gestao/api/app/financeiro', ...G('financeiro'), h((req, res) => res.json({ ok: true, lancamento: app.Financeiro.criar(tid(req), req.body || {}) })));

  // ---- Stays.net (channel manager do assinante) — módulo 'canais' ----
  server.get('/gestao/api/app/stays', ...G('canais'), h((req, res) => res.json({ conta: stays.Conta.statusPublico(tid(req)) })));
  server.post('/gestao/api/app/stays/conectar', ...G('canais'), h(async (req, res) => res.json({ ok: true, conta: await stays.Conta.salvar(tid(req), req.body || {}) })));
  server.post('/gestao/api/app/stays/sincronizar', ...G('canais'), h(async (req, res) => res.json({ ok: true, ...(await stays.sincronizar(tid(req))) })));
  server.post('/gestao/api/app/stays/desconectar', ...G('canais'), h((req, res) => res.json({ ok: true, ...stays.Conta.desconectar(tid(req)) })));
}

module.exports = { registrarRotasApp };
