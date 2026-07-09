// =====================================================================
// Villela Academy — rotas de CHECKOUT (FASE 4): comprar, meus pedidos,
// conferir pagamento (consulta segura), administração e reembolso.
// Páginas /academy/checkout/<slug> e /academy/obrigado ficam em paginas.js.
// =====================================================================
'use strict';
const repo = require('./repo');
const ct = require('./repo-conteudo');
const billing = require('./billing');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

function registrarRotasCheckout(app, { requireUsuario, requirePapel }) {
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  const h = (fn) => (req, res) => {
    try { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); }
    catch (e) { res.status(400).json({ erro: e.message }); }
  };
  const aud = (req, acao, ent, id, det) => repo.Auditoria.registrar({
    quem: req.usuario.id, papel: req.papelAtivo || '', acao, entidade: ent, entidade_id: id, detalhe: det, ip: ipDe(req),
  });
  const ADM = [requireUsuario, requirePapel('admin')];

  // iniciar compra (logado): grátis matricula direto; pago cria preferência MP.
  // A atribuição de afiliado vem do cookie academy_ref (armado no clique ?ref=).
  app.post('/academy/api/checkout/:productId', requireUsuario, h(async (req, res) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const ref = s(req.cookies && req.cookies.academy_ref, 30);
    const r = await billing.criarCheckout(req.usuario, s(req.params.productId, 40), `${proto}://${req.get('host')}`, ref);
    aud(req, 'checkout.iniciar', 'orders', r.order_id, r.gratis ? 'grátis' : (ref ? 'ref:' + ref : ''));
    res.json({ ok: true, ...r });
  }));

  // meus pedidos + status de um pedido (só o dono)
  app.get('/academy/api/pedidos', requireUsuario, h(async (req, res) => {
    res.json({ pedidos: billing.Pedidos.doUsuario(req.usuario.id) });
  }));
  app.get('/academy/api/pedidos/:id/status', requireUsuario, h(async (req, res) => {
    const o = billing.Pedidos.obter(req.params.id);
    if (!o || o.user_id !== req.usuario.id) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json({ status: o.status, produto_titulo: o.produto_titulo, product_id: o.product_id });
  }));
  // "já paguei": consulta segura server-side ao MP (nunca confia no navegador)
  app.post('/academy/api/pedidos/:id/conferir', requireUsuario, h(async (req, res) => {
    const o = billing.Pedidos.obter(req.params.id);
    if (!o || o.user_id !== req.usuario.id) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json(await billing.conferirPedido(o.id));
  }));

  // vendas do produtor
  app.get('/academy/api/produtor/vendas', requireUsuario, requirePapel('produtor'), h(async (req, res) => {
    res.json({ vendas: billing.Pedidos.doProdutor(req.usuario.id) });
  }));

  // administração (admin da Academy)
  app.get('/academy/api/admin/pedidos', ...ADM, h(async (req, res) => {
    res.json({ pedidos: billing.Pedidos.listarAdmin(req.query), kpis: billing.Pedidos.kpisPlataforma() });
  }));
  app.post('/academy/api/admin/pedidos/:id/reembolsar', ...ADM, h(async (req, res) => {
    const r = await billing.reembolsar(req.params.id, { motivo: s((req.body || {}).motivo, 300), quem: req.usuario.id });
    aud(req, 'pedido.reembolsar', 'orders', req.params.id, s((req.body || {}).motivo, 200));
    res.json(r);
  }));
}

// espelho no Portal Staff (dono da plataforma)
function registrarRotasCheckoutStaff(app, { requireAuth, requireAdmin }) {
  const A = [requireAuth, requireAdmin];
  const h = (fn) => (req, res) => {
    try { Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ erro: e.message })); }
    catch (e) { res.status(400).json({ erro: e.message }); }
  };
  const quem = (req) => 'staff:' + ((req.user && (req.user.nome || req.user.email)) || 'plataforma');
  app.get('/staff/api/academy/pedidos', ...A, h((req, res) => {
    res.json({ pedidos: billing.Pedidos.listarAdmin(req.query), kpis: billing.Pedidos.kpisPlataforma() });
  }));
  app.post('/staff/api/academy/pedidos/:id/reembolsar', ...A, h(async (req, res) => {
    res.json(await billing.reembolsar(req.params.id, { motivo: String((req.body || {}).motivo || ''), quem: quem(req) }));
  }));
}

module.exports = { registrarRotasCheckout, registrarRotasCheckoutStaff };
