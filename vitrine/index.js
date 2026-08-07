// =====================================================================
// Vitrine — montagem no app Express.
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./vitrine').montar(app, { express, requireAuth, requireAdmin,
//     enviarEmail, alertaAugusto, jwtSecret });
//
// Marketplace de produtos NOVOS E USADOS entre pessoas (venda, não
// aluguel — o Closet Club é outro produto): vitrine pública em /vitrine,
// painel do usuário em /vitrine/app (cookie 'vitrine_sess'), administração
// na aba 🛒 do Portal Staff (/staff/api/vitrine/*). SQLite próprio em
// DATA_DIR/vitrine/. Pagamento e frete SIMULADOS no MVP; provedores reais
// (MP Split, Melhor Envio) entram pela mesma camada na fase 6.
// VITRINE_ROTINAS=off desliga a rotina horária.
// =====================================================================
'use strict';
const repo = require('./repo');
const pedidos = require('./pedidos');
const pagamentos = require('./pagamentos');
const frete = require('./frete');
const emails = require('./emails');
const seed = require('./seed');
const { registrarRotasConta } = require('./rotas-conta');
const { registrarRotasPublicas } = require('./rotas-publicas');
const { registrarRotasApp } = require('./rotas-app');
const { registrarRotasStaff } = require('./rotas-staff');
const { registrarPaginas } = require('./paginas');

let _timer = null;

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto, jwtSecret } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('vitrine.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }
  repo.semear();          // config (comissão 5% etc.) + árvore de categorias
  emails.configurar({ enviarEmail });
  seed.semearDemo();      // só em dev/VITRINE_SEED=on e só com catálogo vazio

  const conta = registrarRotasConta(app, { jwtSecret });
  registrarRotasPublicas(app, { talvezUsuario: conta.talvezUsuario });
  registrarRotasApp(app, { requireUsuario: conta.requireUsuario });
  registrarRotasStaff(app, { requireAuth, requireAdmin });
  registrarPaginas(app);

  // Webhook do provedor de pagamentos: autenticado por segredo e idempotente
  // por evento_id (payment_events UNIQUE). O provedor simulado também passa
  // por aqui quando chamado de fora; a simulação do painel usa o mesmo núcleo.
  app.post('/vitrine/webhooks/pagamento', express.json({ type: () => true }), (req, res) => {
    if (String(req.headers['x-webhook-token'] || '') !== pagamentos.webhookSecret()) {
      return res.status(401).json({ erro: 'webhook não autenticado' });
    }
    try {
      const b = req.body || {};
      const r = pagamentos.Pagamentos.processarEvento({ evento_id: b.evento_id, ref: b.ref, tipo: b.tipo, payload: b });
      res.json({ ok: true, aplicado: r.aplicado });
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });

  // Webhook do Mercado Pago (Split, fase 6): responde 200 rápido (exigência do
  // MP) e processa em seguida — validação x-signature + núcleo idempotente.
  app.post('/vitrine/webhooks/mercadopago', express.json({ type: () => true }), (req, res) => {
    res.sendStatus(200);
    pagamentos.processarWebhookMP(req.body || {}, req.query || {}, req.headers || {})
      .catch((e) => console.error('[vitrine] webhook MP:', e.message));
  });

  iniciarRotinas(alertaAugusto);
  const prov = pagamentos.provedorAtivo();
  console.log(`[vitrine] Vitrine montada. Loja: /vitrine · painel: /vitrine/app · staff: /staff/api/vitrine`
    + ` · comissão: ${repo.Config.num('marketplace_commission_percent', 5)}%`
    + ` · pagamento: ${prov.nome === 'mercadopago-split' ? 'MP Split (por vendedor conectado; simulado como reserva)' : prov.nome}`
    + ` · frete: ${frete.provedorAtivo().nome} · e-mail: ${emails.ativo() ? 'ligado' : 'desligado'}`);
  return { repo, pedidos, pagamentos, frete, emails, seed };
}

// Rotina horária: expira pedido não pago, avança rastreio simulado e conclui
// pedidos entregues com a janela de devolução vencida.
function iniciarRotinas(alertaAugusto) {
  if (String(process.env.VITRINE_ROTINAS || 'on').toLowerCase() === 'off') return;
  const notificar = (m) => Promise.resolve((alertaAugusto || (async () => {}))(m)).catch(() => {});
  _timer = setInterval(() => {
    try {
      const r = pedidos.Pedidos.rotina();
      if (r.expirados || r.concluidos) {
        notificar(`🛒 Vitrine: ${r.expirados} pedido(s) expirado(s), ${r.concluidos} concluído(s) automaticamente, ${r.rastreios_avancados} rastreio(s) avançado(s).`);
      }
    } catch (e) { console.error('[vitrine] rotina:', e.message); }
  }, 60 * 60 * 1000);
  if (_timer.unref) _timer.unref();
  console.log('[vitrine] rotina horária ligada (expirar não pagos · rastreio simulado · concluir vencidos)');
}

module.exports = { montar, repo, pedidos, pagamentos, frete, emails, seed };
