// =====================================================================
// Villela Academy — rotas de ASSINATURAS/CLUBES (FASE 6): assinar,
// minhas assinaturas, cancelar; produtor gerencia os itens do clube;
// admin/staff listam e cancelam. Estados vêm do MP via webhook.
// =====================================================================
'use strict';
const repo = require('./repo');
const ct = require('./repo-conteudo');
const billing = require('./billing');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const h = (fn) => (req, res) => {
  try { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); }
  catch (e) { res.status(400).json({ erro: e.message }); }
};

function registrarRotasAssinaturas(app, { requireUsuario, requirePapel }) {
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  const aud = (req, acao, ent, id, det) => repo.Auditoria.registrar({
    quem: req.usuario.id, acao, entidade: ent, entidade_id: id, detalhe: det, ip: ipDe(req),
  });
  const P = [requireUsuario, requirePapel('produtor')];
  const ADM = [requireUsuario, requirePapel('admin')];

  // ---- assinante ----
  app.post('/academy/api/assinar/:productId', requireUsuario, h(async (req, res) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const r = await billing.criarAssinatura(req.usuario, s(req.params.productId, 40), `${proto}://${req.get('host')}`);
    aud(req, 'assinatura.iniciar', 'subscriptions', r.assinatura_id, '');
    res.json({ ok: true, ...r });
  }));
  app.get('/academy/api/assinaturas', requireUsuario, h(async (req, res) => {
    res.json({ assinaturas: billing.Assinaturas.doUsuario(req.usuario.id) });
  }));
  app.get('/academy/api/assinaturas/:id/status', requireUsuario, h(async (req, res) => {
    const sub = billing.Assinaturas.obter(req.params.id);
    if (!sub || sub.user_id !== req.usuario.id) return res.status(404).json({ erro: 'Assinatura não encontrada.' });
    res.json({ status: sub.status, produto_titulo: sub.produto_titulo, product_id: sub.product_id });
  }));
  app.post('/academy/api/assinaturas/:id/cancelar', requireUsuario, h(async (req, res) => {
    const sub = billing.Assinaturas.obter(req.params.id);
    if (!sub || sub.user_id !== req.usuario.id) return res.status(404).json({ erro: 'Assinatura não encontrada.' });
    res.json(await billing.cancelarAssinatura(sub.id, req.usuario.id));
  }));

  // ---- produtor: itens do clube ----
  const doDono = (req) => ct.Produtos.obterDoDono(req.params.id, req.usuario.id);
  app.get('/academy/api/produtor/produtos/:id/clube', ...P, h((req, res) => {
    const clube = doDono(req);
    res.json({
      itens: ct.Clube.itens(clube.id),
      // candidatos: produtos publicados do próprio produtor (fora clubes)
      candidatos: ct.Produtos.doProdutor(req.usuario.id).filter(p => p.id !== clube.id && p.tipo !== 'clube' && p.status === 'publicado')
        .map(p => ({ id: p.id, titulo: p.titulo, tipo: p.tipo })),
    });
  }));
  app.post('/academy/api/produtor/produtos/:id/clube/itens', ...P, h((req, res) => {
    const clube = doDono(req);
    ct.Clube.addItem(clube, (req.body || {}).product_id);
    aud(req, 'clube.item.add', 'club_items', clube.id, s((req.body || {}).product_id, 40));
    res.json({ ok: true });
  }));
  app.delete('/academy/api/produtor/produtos/:id/clube/itens/:pid', ...P, h((req, res) => {
    const clube = doDono(req);
    ct.Clube.removerItem(clube.id, req.params.pid);
    aud(req, 'clube.item.remover', 'club_items', clube.id, s(req.params.pid, 40));
    res.json({ ok: true });
  }));
  app.get('/academy/api/produtor/assinantes', ...P, h((req, res) => {
    const subs = billing.Assinaturas.listarAdmin({ n: 500 }).filter(x => x.producer_id === req.usuario.id);
    res.json({ assinaturas: subs });
  }));

  // ---- admin ----
  app.get('/academy/api/admin/assinaturas', ...ADM, h(async (req, res) => {
    res.json({ assinaturas: billing.Assinaturas.listarAdmin(req.query), kpis: billing.Assinaturas.kpis() });
  }));
  app.post('/academy/api/admin/assinaturas/:id/cancelar', ...ADM, h(async (req, res) => {
    res.json(await billing.cancelarAssinatura(req.params.id, 'admin:' + req.usuario.id));
  }));
}

// espelho no Portal Staff
function registrarRotasAssinaturasStaff(app, { requireAuth, requireAdmin }) {
  const A = [requireAuth, requireAdmin];
  const quem = (req) => 'staff:' + ((req.user && (req.user.nome || req.user.email)) || 'plataforma');
  app.get('/staff/api/academy/assinaturas', ...A, h((req, res) => {
    res.json({ assinaturas: billing.Assinaturas.listarAdmin(req.query), kpis: billing.Assinaturas.kpis() });
  }));
  app.post('/staff/api/academy/assinaturas/:id/cancelar', ...A, h(async (req, res) => {
    res.json(await billing.cancelarAssinatura(req.params.id, quem(req)));
  }));
}

module.exports = { registrarRotasAssinaturas, registrarRotasAssinaturasStaff };
