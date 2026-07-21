// =====================================================================
// Villela Projects & Events Intelligence — montagem do módulo.
// Uso no server.js: require('./vpe').montar(app, { express, requireAuth,
//   requireAdmin, alertaAugusto, enviarEmail, jwtSecret });
// Fase 1 (fundação): multi-tenant, identidade/RBAC, auditoria, planos/
// limites, portfólio núcleo + seed dos 16 projetos internos (via staff),
// landing, painel do cliente e administração no Portal Staff.
// Fases 2+ (tarefas, eventos, CRM, financeiro, IA, automações, portal do
// cliente, billing, integrações): ver README.md.
// =====================================================================
'use strict';
const repo = require('./repo');
const permissoes = require('./permissoes');
const { criarAuth } = require('./auth');
const { registrarRotasApi } = require('./rotas-api');
const { registrarRotasStaff } = require('./rotas-staff');
const { registrarPaginas } = require('./paginas');

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, alertaAugusto, enviarEmail, mpFetch, jwtSecret } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('vpe.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }
  repo.semearPlanos();
  const auth = criarAuth({ jwtSecret });
  const notificar = (msg) => Promise.resolve((alertaAugusto || (async () => {}))(msg)).catch(() => {});
  require('./billing').configurar({ mpFetch, notificar });
  registrarRotasApi(app, { express, auth, notificar, enviarEmail, jwtSecret });
  require('./api-publica').registrarApiPublica(app, { express });
  registrarRotasStaff(app, { express, requireAuth, requireAdmin, jwtSecret });
  registrarPaginas(app);
  iniciarJobs();
  console.log('[vpe] Villela Projects & Events montado (Fases 1-8 — +billing SaaS Mercado Pago, API pública por chave e webhooks de saída).');
  return { repo, permissoes, auth };
}

// Timers in-process (single instance Render). VPE_ROTINAS=off desliga (testes).
let _timers = [];
function iniciarJobs() {
  if (_timers.length) return;
  if (String(process.env.VPE_ROTINAS || '').toLowerCase() === 'off') return;
  const apiPublica = require('./api-publica');
  _timers.push(setInterval(() => { apiPublica.processarEntregas().catch(e => console.error('[vpe webhooks]', e.message)); }, 12000));
  // rotina diária de billing (trials vencendo) — checa de hora em hora, dispara 1×/dia por instância
  let ultimoDia = '';
  _timers.push(setInterval(() => {
    const dia = new Date().toISOString().slice(0, 10);
    if (dia === ultimoDia) return; ultimoDia = dia;
    require('./billing').rotinaBilling().catch(e => console.error('[vpe billing]', e.message));
  }, 3600000));
  if (_timers[0] && _timers[0].unref) _timers.forEach(t => t.unref && t.unref());
}

module.exports = { montar, repo, permissoes };
