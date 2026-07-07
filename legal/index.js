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
const notif = require('./notificacoes');
const portalCliente = require('./portal-cliente');
const { semearIA } = require('./prompts-seed');
const { registrarRotasStaff } = require('./rotas-staff');

function montar(app, injected = {}) {
  const {
    express, requireAuth, requireAdmin, requirePublishOrSession, lerUsuarios,
    enviarEmail, enviarWhatsApp, alertaAugusto, jwtSecret,
  } = injected;
  if (!express || !requireAuth || !requirePublishOrSession || !lerUsuarios) {
    throw new Error('legal.montar: faltam deps (express, requireAuth, requirePublishOrSession, lerUsuarios).');
  }
  semearIA(); // agentes especialistas + biblioteca de prompts (upsert idempotente)
  contratos.semearTemplates(); // modelos de contrato + cláusulas (Módulo 13)
  notif.configurar({ enviarEmail, enviarWhatsApp, alertaAugusto }); // canais reais do server.js
  registrarRotasStaff(app, {
    repo, permissoes, feriados, ia, llm, pecas, contratos, portalCliente, notif, jwtSecret,
    requireAuth, requireAdmin, requirePublishOrSession, lerUsuarios,
  });
  if (jwtSecret) portalCliente.registrarPortalCliente(app, { jwtSecret });
  else console.warn('[legal] jwtSecret ausente — Portal do Cliente NÃO montado.');
  console.log(`[legal] Villela Legal Intelligence montado (Fases 1-5). IA: ${llm.ativo() ? 'direto (' + llm.MODELOS[0] + ')' : 'fila (agente local)'} · RAG: ${ia.ftsOK ? 'FTS5 ok' : 'indisponível'}`);
  return { repo, permissoes, feriados, ia, llm, pecas, contratos, notif, portalCliente };
}

module.exports = { montar, repo, permissoes, feriados, ia, llm, pecas, contratos, notif, portalCliente };
