// =====================================================================
// Villela Alta Vista 360 — montagem no app Express.
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./alta-vista').montar(app, { express, requireAuth, requireAdmin,
//     enviarEmail, alertaAugusto, mpFetch, jwtSecret });
//
// Estúdio visual para hospedagens e imóveis (drone, vídeo com IA, foto 360°
// e tour virtual): site público em /alta-vista, administração na aba 🚁 do
// Portal Staff (/staff/api/alta-vista/*). SQLite próprio em
// DATA_DIR/alta-vista/. Onda 1 = vitrine pública + catálogo + leads;
// conta do cliente (/alta-vista/app), pagamentos e tours chegam nas
// Ondas 3–6 (plano em docs/integracoes/villela-alta-vista-360.md).
// =====================================================================
'use strict';
const repo = require('./repo');
const billing = require('./billing');
const storage = require('./storage');
const { registrarRotasPublicas } = require('./rotas-publicas');
const { registrarRotasConta } = require('./rotas-conta');
const { registrarRotasApp } = require('./rotas-app');
const { registrarRotasStaff } = require('./rotas-staff');
const { registrarRotasTour } = require('./rotas-tour');
const { registrarPaginas, SITE } = require('./paginas');
const webhookMP = require('../nucleo/webhook-mp');

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto, mpFetch, jwtSecret } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('alta-vista.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }
  repo.semear(); // catálogo, combos, FAQs, projetos conceituais e config — idempotente

  const notificar = (m) => Promise.resolve((alertaAugusto || (async () => {}))(m)).catch(() => {});

  // pagamentos: e-mail de recibo simples ao cliente quando a parcela aprova
  billing.configurar({
    mpFetch, notificar,
    emailCliente: async (parcela) => {
      if (typeof enviarEmail !== 'function') return;
      const cliente = repo.Clientes.obter(parcela.cliente_id);
      const projeto = repo.Projetos.obter(parcela.projeto_id);
      if (!cliente || !cliente.email || cliente.email.endsWith('.invalid')) return;
      const resto = billing.saldo(parcela.projeto_id);
      await enviarEmail(cliente.email, 'Pagamento confirmado — Villela Alta Vista 360',
        `<p>Olá, ${cliente.nome}!</p>
         <p>Confirmamos o pagamento de <b>R$ ${(parcela.valor_centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>
         (${parcela.rotulo}) do projeto <b>${projeto ? projeto.titulo : ''}</b>.</p>
         ${resto ? `<p>Saldo em aberto: R$ ${(resto / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (cobrado antes da liberação final).</p>` : '<p>Projeto quitado — obrigado!</p>'}
         <p><a href="${SITE}/alta-vista/app">Acompanhar o projeto</a></p>`).catch(() => {});
    },
  });

  registrarRotasPublicas(app, { notificar });
  const conta = registrarRotasConta(app, { jwtSecret, enviarEmail, baseUrl: SITE });
  registrarRotasApp(app, { requireCliente: conta.requireCliente, notificar });
  registrarRotasStaff(app, { requireAuth, requireAdmin, enviarEmail, notificar, jwtSecret });
  registrarPaginas(app);
  registrarRotasTour(app, { jwtSecret }); // viewer público dos tours (/alta-vista/t/:slug)
  storage.registrarRotasLocais(app, express); // upload raw + leitura assinada do driver local

  // webhook do Mercado Pago (Checkout Pro das parcelas). 200 rápido, efeito async.
  app.post('/alta-vista/webhooks/mercadopago', express.json({ type: () => true }), async (req, res) => {
    res.sendStatus(200); // o MP exige 200 rápido
    // Confere a assinatura quando ha segredo configurado; sem segredo apenas
    // avisa (a re-busca na API do MP segue sendo a defesa contra payload forjado).
    const idMP = ((req.body || {}).data || {}).id || (req.query || {})['data.id'] || (req.query || {}).id;
    const confMP = webhookMP.conferir({ headers: req.headers, dataId: idMP,
      segredo: process.env.ALTA_VISTA_MP_WEBHOOK_SECRET, rotulo: 'alta-vista' });
    if (!confMP.ok) return console.warn('[alta-vista] webhook MP recusado:', confMP.motivo);
    if (!webhookMP.idSeguro(idMP)) return console.warn('[alta-vista] webhook MP com id inválido');
    try { await billing.processarWebhook(req.body || {}, req.query || {}); } catch (_) {}
  });

  console.log('[alta-vista] Villela Alta Vista 360 montado. Site: /alta-vista · painel: /alta-vista/app'
    + ` · admin: aba 🚁 do staff · serviços: ${repo.Servicos.listar().length} · combos: ${repo.Combos.listar().length}`
    + ` · pagamento: ${billing.ativo() ? 'Checkout Pro (MP)' : 'manual'}`);
  return { repo, billing, requireCliente: conta.requireCliente };
}

module.exports = { montar, repo, billing };
