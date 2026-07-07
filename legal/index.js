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
const llm = require('./llm');
const ia = require('./ia');
const pecas = require('./pecas');
const contratos = require('./contratos');
const { semearIA } = require('./prompts-seed');
const { registrarRotasStaff } = require('./rotas-staff');

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, requirePublishOrSession, lerUsuarios } = injected;
  if (!express || !requireAuth || !requirePublishOrSession || !lerUsuarios) {
    throw new Error('legal.montar: faltam deps (express, requireAuth, requirePublishOrSession, lerUsuarios).');
  }
  semearIA(); // agentes especialistas + biblioteca de prompts (upsert idempotente)
  contratos.semearTemplates(); // modelos de contrato + cláusulas (Módulo 13)
  registrarRotasStaff(app, { repo, permissoes, feriados, ia, llm, pecas, contratos, requireAuth, requireAdmin, requirePublishOrSession, lerUsuarios });
  console.log(`[legal] Villela Legal Intelligence montado (Fases 1-4). IA: ${llm.ativo() ? 'direto (' + llm.MODELOS[0] + ')' : 'fila (agente local)'} · RAG: ${ia.ftsOK ? 'FTS5 ok' : 'indisponível'}`);
  return { repo, permissoes, feriados, ia, llm, pecas, contratos };
}

module.exports = { montar, repo, permissoes, feriados, ia, llm, pecas, contratos };
