// =====================================================================
// Villela Academy Marketplace — montagem no app Express.
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./academy').montar(app, { express, requireAuth, requireAdmin,
//     enviarEmail, alertaAugusto, jwtSecret });
//
// Plataforma de cursos online e produtos digitais (marketplace multi-
// produtor): landing em /academy, painel em /academy/app (sessão própria
// 'academy_sess'), administração da plataforma em /staff/api/academy/*.
// SQLite próprio em DATA_DIR/academy/. FASE 1 = fundação (usuários,
// papéis, permissões, dashboards, auditoria) — roadmap em ROADMAP.md.
// =====================================================================
'use strict';
const repo = require('./repo');
const billing = require('./billing');
const { registrarRotasCliente } = require('./rotas-cliente');
const { registrarRotasConteudo } = require('./rotas-conteudo');
const { registrarRotasCheckout, registrarRotasCheckoutStaff } = require('./rotas-checkout');
const { registrarRotasAfiliado, registrarRotasAfiliadoStaff } = require('./rotas-afiliado');
const { registrarRotasAssinaturas, registrarRotasAssinaturasStaff } = require('./rotas-assinaturas');
const { registrarRotasStaff } = require('./rotas-staff');
const { registrarPaginas } = require('./paginas');

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, alertaAugusto, mpFetch, jwtSecret } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('academy.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }
  repo.semear(); // config comercial padrão (upsert idempotente)
  const notificar = (m) => Promise.resolve((alertaAugusto || (async () => {}))(m)).catch(() => {});
  billing.configurar({ mpFetch, notificar });
  require('./storage').configurar({ segredo: jwtSecret }); // URLs assinadas (F7)
  const emails = require('./emails');
  emails.configurar({ enviarEmail: injected.enviarEmail }); // e-mails transacionais (F8)

  // rotina F8: lembrete de pedido abandonado (1x/h; ACADEMY_ROTINAS=off desliga)
  if (String(process.env.ACADEMY_ROTINAS || 'on').toLowerCase() !== 'off') {
    const t = setInterval(() => { emails.processarPedidosAbandonados(emails.base()).catch(() => {}); }, 3600e3);
    if (t.unref) t.unref();
  }

  registrarRotasStaff(app, { requireAuth, requireAdmin });
  registrarRotasCheckoutStaff(app, { requireAuth, requireAdmin });
  const cliente = registrarRotasCliente(app, { jwtSecret });
  registrarRotasConteudo(app, { requireUsuario: cliente.requireUsuario, requirePapel: cliente.requirePapel });
  registrarRotasCheckout(app, { requireUsuario: cliente.requireUsuario, requirePapel: cliente.requirePapel });
  registrarRotasAfiliado(app, { requireUsuario: cliente.requireUsuario, requirePapel: cliente.requirePapel });
  registrarRotasAfiliadoStaff(app, { requireAuth, requireAdmin });
  registrarRotasAssinaturas(app, { requireUsuario: cliente.requireUsuario, requirePapel: cliente.requirePapel });
  registrarRotasAssinaturasStaff(app, { requireAuth, requireAdmin });
  registrarPaginas(app, { notificar });

  // webhook do Mercado Pago (200 rápido; processamento assíncrono e idempotente)
  app.post('/academy/webhooks/mercadopago', express.json({ type: () => true }), async (req, res) => {
    res.sendStatus(200);
    try { await billing.processarWebhook(req.body || {}, req.query || {}); } catch (_) {}
  });

  console.log(`[academy] Villela Academy montada. Landing: /academy · painel: /academy/app · MP: ${billing.ativo() ? 'ativo' : 'inativo'}`);
  return { repo, billing };
}

module.exports = { montar, repo, billing };
