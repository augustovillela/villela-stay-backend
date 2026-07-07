// =====================================================================
// Villela Docs Intelligence — montagem do módulo no app Express.
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./vdocs').montar(app, { express, requireAuth, requireAdmin,
//     alertaAugusto, jwtSecret });
//
// Fase 1 (fundação SaaS): multi-tenant, identidade, RBAC, convites,
// auditoria, planos/limites, landing/preços, painel do cliente e
// administração da plataforma no Portal Staff. Documentos, OCR, busca,
// IA e workflows = Fases 2+ (ver README.md).
// =====================================================================
'use strict';
const repo = require('./repo');
const permissoes = require('./permissoes');
const { criarAuth } = require('./auth');
const { registrarRotasApi } = require('./rotas-api');
const { registrarRotasStaff } = require('./rotas-staff');
const { registrarPaginas } = require('./paginas');

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, alertaAugusto, enviarEmail, jwtSecret } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('vdocs.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }
  repo.semearPlanos(); // Starter/Professional/Business/Enterprise (upsert idempotente)
  const auth = criarAuth({ jwtSecret });
  const notificar = (msg) => Promise.resolve((alertaAugusto || (async () => {}))(msg)).catch(() => {});
  registrarRotasApi(app, { express, auth, notificar, enviarEmail });
  registrarRotasStaff(app, { express, requireAuth, requireAdmin });
  registrarPaginas(app);
  console.log('[vdocs] Villela Docs Intelligence montado (Fases 1-2: fundação SaaS + gestão documental).');
  return { repo, permissoes, auth };
}

module.exports = { montar, repo, permissoes };
