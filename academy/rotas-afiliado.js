// =====================================================================
// Villela Academy — rotas de AFILIADOS (FASE 5): produtos afiliáveis,
// links rastreáveis, extrato de comissões; administração (admin/staff)
// lista comissões e marca o repasse manual como pago.
// =====================================================================
'use strict';
const repo = require('./repo');
const af = require('./repo-afiliados');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const h = (fn) => (req, res) => {
  try { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); }
  catch (e) { res.status(400).json({ erro: e.message }); }
};

function registrarRotasAfiliado(app, { requireUsuario, requirePapel }) {
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  const aud = (req, acao, ent, id, det) => repo.Auditoria.registrar({
    quem: req.usuario.id, papel: 'afiliado', acao, entidade: ent, entidade_id: id, detalhe: det, ip: ipDe(req),
  });
  const AF = [requireUsuario, requirePapel('afiliado')];
  const ADM = [requireUsuario, requirePapel('admin')];

  app.get('/academy/api/afiliado/produtos', ...AF, h((req, res) => {
    res.json({ produtos: af.produtosAfiliaveis(), cookie_dias: af.cookieDias() });
  }));
  app.post('/academy/api/afiliado/links', ...AF, h((req, res) => {
    const l = af.Links.criar(req.usuario.id, s((req.body || {}).product_id, 40));
    aud(req, 'afiliado.link', 'affiliate_links', l.id, l.product_id);
    res.json({ ok: true, link: l });
  }));
  app.get('/academy/api/afiliado/links', ...AF, h((req, res) => {
    res.json({ links: af.Links.doAfiliado(req.usuario.id) });
  }));
  app.get('/academy/api/afiliado/extrato', ...AF, h((req, res) => {
    res.json({ comissoes: af.Comissoes.extrato(req.usuario.id), saldos: af.Comissoes.saldos(req.usuario.id) });
  }));

  // administração da Academy
  app.get('/academy/api/admin/comissoes', ...ADM, h((req, res) => {
    res.json({ comissoes: af.Comissoes.listarAdmin(req.query) });
  }));
  app.post('/academy/api/admin/comissoes/:id/pagar', ...ADM, h((req, res) => {
    const c = af.Comissoes.marcarPaga(req.params.id, req.usuario.id);
    res.json({ ok: true, comissao: { id: c.id, status: c.status } });
  }));
}

// espelho no Portal Staff
function registrarRotasAfiliadoStaff(app, { requireAuth, requireAdmin }) {
  const A = [requireAuth, requireAdmin];
  const quem = (req) => 'staff:' + ((req.user && (req.user.nome || req.user.email)) || 'plataforma');
  app.get('/staff/api/academy/comissoes', ...A, h((req, res) => {
    res.json({ comissoes: af.Comissoes.listarAdmin(req.query) });
  }));
  app.post('/staff/api/academy/comissoes/:id/pagar', ...A, h((req, res) => {
    const c = af.Comissoes.marcarPaga(req.params.id, quem(req));
    res.json({ ok: true, comissao: { id: c.id, status: c.status } });
  }));
}

module.exports = { registrarRotasAfiliado, registrarRotasAfiliadoStaff };
