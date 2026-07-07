// =====================================================================
// Villela Legal Intelligence — montagem do módulo no app Express.
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./legal').montar(app, {
//     express, requireAuth, requireAdmin, requirePublishOrSession, lerUsuarios,
//   });
// Fase 1 (fundação): identidade/permissões, clientes, processos,
// andamentos, publicações, prazos, tarefas, documentos, registro de IA,
// financeiro jurídico, auditoria e integrações. Sem coleta automática
// nem geração por IA ainda (Fases 2+ — ver README.md).
// =====================================================================
'use strict';
const repo = require('./repo');
const permissoes = require('./permissoes');
const feriados = require('./feriados');
const { registrarRotasStaff } = require('./rotas-staff');

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, requirePublishOrSession, lerUsuarios } = injected;
  if (!express || !requireAuth || !requirePublishOrSession || !lerUsuarios) {
    throw new Error('legal.montar: faltam deps (express, requireAuth, requirePublishOrSession, lerUsuarios).');
  }
  registrarRotasStaff(app, { repo, permissoes, feriados, requireAuth, requireAdmin, requirePublishOrSession, lerUsuarios });
  console.log('[legal] Villela Legal Intelligence montado (Fases 1+2 — fundação + núcleo). API: /staff/api/legal/*');
  return { repo, permissoes, feriados };
}

module.exports = { montar, repo, permissoes, feriados };
