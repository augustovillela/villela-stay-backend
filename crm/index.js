// =====================================================================
// Villela CRM — montagem no app Express.
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./crm').montar(app, { express, requireAuth, requireAdmin,
//     enviarEmail, alertaAugusto, mpFetch, jwtSecret });
//
// CRM inteligente multicanal vendido como SaaS: landing/preços em /crm,
// painel do assinante em /crm/app (cookie 'crm_sess'), administração na
// aba 🤝 do Portal Staff (/staff/api/vcrm/*). SQLite próprio em
// DATA_DIR/crm/. Ciclo de vida + automações diárias no servidor
// (CRM_ROTINAS=off desliga).
// =====================================================================
'use strict';
const repo = require('./repo');
const appRepo = require('./app-repo');
const billing = require('./billing');
const { registrarRotasStaff } = require('./rotas-staff');
const { registrarRotasCliente } = require('./rotas-cliente');
const { registrarRotasApp, registrarRotasPublicas } = require('./rotas-app');
const { registrarPaginas } = require('./paginas');
const webhookMP = require('../nucleo/webhook-mp');

let _timer = null;

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto, mpFetch, jwtSecret } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('crm.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }
  repo.semear(); // planos + flags (upsert idempotente; preserva preços editados)
  const notificar = (m) => Promise.resolve((alertaAugusto || (async () => {}))(m)).catch(() => {});
  billing.configurar({ mpFetch, notificar });

  registrarRotasStaff(app, { requireAuth, requireAdmin, jwtSecret, enviarEmail });
  const cliente = registrarRotasCliente(app, { jwtSecret });
  registrarRotasApp(app, { requireAssinante: cliente.requireAssinante, requirePapel: cliente.requirePapel });
  registrarRotasPublicas(app);
  registrarPaginas(app, { jwtSecret, enviarEmail, notificar });

  // webhook do Mercado Pago (assinatura recorrente / pagamento)
  app.post('/crm/webhooks/mercadopago', express.json({ type: () => true }), async (req, res) => {
    res.sendStatus(200); // MP exige 200 rápido
    // Confere a assinatura quando ha segredo configurado; sem segredo apenas
    // avisa (a re-busca na API do MP segue sendo a defesa contra payload forjado).
    const idMP = ((req.body || {}).data || {}).id || (req.query || {})['data.id'] || (req.query || {}).id;
    const confMP = webhookMP.conferir({ headers: req.headers, dataId: idMP,
      segredo: process.env.CRM_MP_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET, rotulo: 'crm' });
    if (!confMP.ok) return console.warn('[crm] webhook MP recusado:', confMP.motivo);
    if (!webhookMP.idSeguro(idMP)) return console.warn('[crm] webhook MP com id inválido');
    try { await billing.processarWebhook(req.body || {}, req.query || {}); } catch (_) {}
  });

  iniciarRotinas(notificar);
  console.log(`[crm] Villela CRM montado. Landing: /crm · painel: /crm/app · MP: ${billing.ativo() ? 'ativo' : 'manual'}`);
  // requireAssinante sai daqui porque o Villela Growth OS estende ESTE painel
  // (ADR-0002) — o assinante tem um login só, não dois.
  return { repo, appRepo, billing, requireAssinante: cliente.requireAssinante, requirePapel: cliente.requirePapel };
}

// agendador interno: ciclo de vida + automações 1×/dia ~6h Brasília
function iniciarRotinas(notificar) {
  if (String(process.env.CRM_ROTINAS || 'on').toLowerCase() === 'off') return;
  const hora = parseInt(process.env.CRM_ROTINA_HORA, 10) || 6;
  const jaRodou = () => {
    const hoje = new Date().toISOString().slice(0, 10);
    return !!require('./db').db.prepare("SELECT 1 FROM platform_events WHERE tipo = 'ciclo.diario' AND quando >= ? LIMIT 1").get(hoje);
  };
  _timer = setInterval(() => {
    const hb = (new Date().getUTCHours() + 24 - 3) % 24; // Brasília UTC-3
    if (hb === hora && !jaRodou()) {
      try { const r = billing.processarCicloDeVida(); if (r.trials_vencidos || r.suspensos) notificar(`⏰ Villela CRM: ${r.trials_vencidos} trial(s) vencido(s), ${r.suspensos} suspenso(s).`); } catch (_) {}
    }
  }, 15 * 60 * 1000);
  if (_timer.unref) _timer.unref();
  console.log(`[crm] ciclo de vida + automações agendados p/ ~${hora}h de Brasília`);
}

module.exports = { montar, repo, appRepo, billing };
