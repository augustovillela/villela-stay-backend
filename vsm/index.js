// =====================================================================
// Villela Stay Manager (VSM) — montagem no app Express.
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./vsm').montar(app, { express, requireAuth, requireAdmin,
//     enviarEmail, alertaAugusto, mpFetch, jwtSecret });
//
// Produto comercial (control plane) que vende o sistema de gestão de
// hospedagem por temporada a outros anfitriões/gestores: landing/preços em
// /gestao, painel do assinante em /gestao/app (sessão 'vsm_sess'),
// administração na aba 🏨 do Portal Staff. SQLite próprio em DATA_DIR/vsm/.
// Ciclo de vida (trial/dunning) roda no servidor (VSM_ROTINAS=off desliga).
// =====================================================================
'use strict';
const repo = require('./repo');
const billing = require('./billing');
const { registrarRotasStaff } = require('./rotas-staff');
const { registrarRotasCliente } = require('./rotas-cliente');
const { registrarPaginas } = require('./paginas');

let _timer = null;

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto, mpFetch, jwtSecret } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('vsm.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }
  repo.semear(); // planos + feature flags (upsert idempotente; preserva preços editados)
  const notificar = (m) => Promise.resolve((alertaAugusto || (async () => {}))(m)).catch(() => {});
  billing.configurar({ mpFetch, notificar });

  registrarRotasStaff(app, { requireAuth, requireAdmin, jwtSecret, enviarEmail });
  registrarRotasCliente(app, { jwtSecret, enviarEmail });
  registrarPaginas(app, { jwtSecret, enviarEmail, notificar });

  // webhook do Mercado Pago (assinatura recorrente / pagamento)
  app.post('/gestao/webhooks/mercadopago', express.json({ type: () => true }), async (req, res) => {
    res.sendStatus(200); // MP exige 200 rápido
    try { await billing.processarWebhook(req.body || {}, req.query || {}); } catch (_) {}
  });

  iniciarRotinas(notificar);
  console.log(`[vsm] Villela Stay Manager montado. Landing: /gestao · painel: /gestao/app · MP: ${billing.ativo() ? 'ativo' : 'manual'}`);
  return { repo, billing };
}

// agendador interno: ciclo de vida (trial vencido → inadimplente → suspensa) 1×/dia ~6h Brasília
function iniciarRotinas(notificar) {
  if (String(process.env.VSM_ROTINAS || 'on').toLowerCase() === 'off') return;
  const hora = parseInt(process.env.VSM_ROTINA_HORA, 10) || 6;
  const jaRodou = () => {
    const hoje = new Date().toISOString().slice(0, 10);
    return !!require('./db').db.prepare("SELECT 1 FROM platform_events WHERE tipo = 'ciclo.diario' AND quando >= ? LIMIT 1").get(hoje);
  };
  _timer = setInterval(() => {
    const hb = (new Date().getUTCHours() + 24 - 3) % 24; // Brasília UTC-3
    if (hb === hora && !jaRodou()) {
      try { const r = billing.processarCicloDeVida(); if (r.trials_vencidos || r.suspensos) notificar(`⏰ Villela Stay Manager: ${r.trials_vencidos} trial(s) vencido(s), ${r.suspensos} suspenso(s).`); } catch (_) {}
    }
  }, 15 * 60 * 1000);
  if (_timer.unref) _timer.unref();
  console.log(`[vsm] ciclo de vida agendado p/ ~${hora}h de Brasília`);
}

module.exports = { montar, repo, billing };
