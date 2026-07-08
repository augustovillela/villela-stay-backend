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
  const { express, requireAuth, requireAdmin, alertaAugusto, enviarEmail, jwtSecret } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('vpe.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }
  repo.semearPlanos();
  const auth = criarAuth({ jwtSecret });
  const notificar = (msg) => Promise.resolve((alertaAugusto || (async () => {}))(msg)).catch(() => {});
  registrarRotasApi(app, { express, auth, notificar, enviarEmail });
  registrarRotasStaff(app, { express, requireAuth, requireAdmin });
  registrarPaginas(app);
  console.log('[vpe] Villela Projects & Events montado (Fases 1-4 — fundação, portfólio, execução e eventos).');
  return { repo, permissoes, auth };
}

module.exports = { montar, repo, permissoes };
