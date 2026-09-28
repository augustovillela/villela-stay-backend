// =====================================================================
// Musique — rotas da ASSINATURA (conta, webhook do Mercado Pago e staff).
// Regras de negócio em `assinatura.js`; aqui só HTTP.
// =====================================================================
'use strict';
const assinatura = require('./assinatura');
const contas = require('./contas');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

function registrarRotasAssinatura(app, { requireUsuario, requireAuth, requireAdmin }) {
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) =>
    res.status(e.status && e.status < 600 ? e.status : 400).json({ erro: e.message }));

  app.get('/music/api/assinatura', requireUsuario, h(async (req, res) => res.json(assinatura.estadoDaConta(req.usuario.id))));
  app.post('/music/api/assinatura/assinar', requireUsuario, h(async (req, res) =>
    res.json({ ok: true, ...(await assinatura.assinar(req.usuario.id, { plano: s((req.body || {}).plano, 20) || 'individual' })) })));
  // Plano banda: a titular distribui as vagas pelo e-mail da conta Musique;
  // cada integrante pode sair da própria vaga.
  app.post('/music/api/assinatura/vagas', requireUsuario, h(async (req, res) =>
    res.json({ ok: true, vagas: await assinatura.adicionarVaga(req.usuario.id, s((req.body || {}).email, 160)) })));
  app.delete('/music/api/assinatura/vagas/:assinaturaId/:contaId', requireUsuario, h(async (req, res) =>
    res.json({ ok: true, vagas: await assinatura.removerVaga(req.usuario.id, req.params.assinaturaId, req.params.contaId) })));
  app.post('/music/api/assinatura/cancelar', requireUsuario, h(async (req, res) => res.json(await assinatura.cancelar(req.usuario.id))));

  // Webhook do MP. Sem sessão: a assinatura HMAC é conferida quando há
  // segredo configurado, e o conteúdo é SEMPRE relido na API do MP.
  // 200 mesmo quando ignora — senão o MP insiste; 500 só em falha real,
  // que é quando queremos que ele tente de novo.
  app.post('/music/api/pagamentos/mp', async (req, res) => {
    const dataId = (req.body && req.body.data && req.body.data.id) || req.query['data.id'] || req.query.id;
    const c = assinatura._conferirWebhook({ headers: req.headers, dataId,
      segredo: process.env.MUSIC_MP_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET, rotulo: 'music/mp' });
    if (!c.ok) return res.status(401).json({ erro: c.motivo });
    try { res.json(await assinatura.processarWebhook(req.body || {}, req.query || {})); }
    catch (e) { console.error('[music/assinatura] webhook:', e.message); res.status(500).json({ erro: 'falha ao processar' }); }
  });

  if (requireAuth && requireAdmin) {
    app.get('/staff/api/music/assinaturas', requireAuth, h(async (req, res) => res.json(assinatura.resumoStaff())));
    app.put('/staff/api/music/assinaturas/plano', requireAuth, requireAdmin, h(async (req, res) =>
      res.json({ ok: true, plano: assinatura.definirPlano(req.body || {}) })));
    // Cortesia manual (professor parceiro, imprensa…): pelo e-mail da CONTA
    // DO MUSIQUE — a pessoa precisa ter se cadastrado aqui.
    app.post('/staff/api/music/assinaturas/cortesia', requireAuth, requireAdmin, h(async (req, res) => {
      const c = contas.Contas.porEmail((req.body || {}).email);
      if (!c) throw new Error('Não há conta do Musique com este e-mail. A pessoa precisa se cadastrar primeiro.');
      const a = assinatura.concederCortesia(c.id, s((req.body || {}).motivo, 200) || 'cortesia do staff');
      const sync = await assinatura.sincronizar(c.id);
      contas.auditar('staff:' + (req.user && req.user.id), 'assinatura.cortesia', c.email);
      res.json({ ok: true, assinatura: a.status, academia: sync });
    }));
    app.post('/staff/api/music/assinaturas/cortesia/:contaId/encerrar', requireAuth, requireAdmin, h(async (req, res) => {
      assinatura.encerrarCortesia(req.params.contaId, s((req.body || {}).motivo, 200) || 'encerrada pelo staff');
      const sync = await assinatura.sincronizar(req.params.contaId);
      contas.auditar('staff:' + (req.user && req.user.id), 'assinatura.cortesia.encerrada', req.params.contaId);
      res.json({ ok: true, academia: sync });
    }));
    app.post('/staff/api/music/assinaturas/sincronizar', requireAuth, requireAdmin, h(async (req, res) => res.json({ ok: true, ...(await assinatura.ciclo()) })));
  }
}

module.exports = { registrarRotasAssinatura };
