// =====================================================================
// Villela Academy Marketplace — montagem no app Express.
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./academy').montar(app, { express, requireAuth, requireAdmin,
//     enviarEmail, alertaAugusto, jwtSecret });
//
// Plataforma de cursos online e produtos digitais (marketplace multi-
// produtor): landing em /academy, painel em /academy/app (sessão própria
// 'academy_sess'), administração da plataforma em /staff/api/academy/*.
// SQLite próprio em DATA_DIR/academy/. FASE 1 = fundação (usuários,
// papéis, permissões, dashboards, auditoria) — roadmap em ROADMAP.md.
// =====================================================================
'use strict';
const repo = require('./repo');
const { registrarRotasCliente } = require('./rotas-cliente');
const { registrarRotasStaff } = require('./rotas-staff');
const { registrarPaginas } = require('./paginas');

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, alertaAugusto, jwtSecret } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('academy.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }
  repo.semear(); // config comercial padrão (upsert idempotente)
  const notificar = (m) => Promise.resolve((alertaAugusto || (async () => {}))(m)).catch(() => {});

  registrarRotasStaff(app, { requireAuth, requireAdmin });
  registrarRotasCliente(app, { jwtSecret });
  registrarPaginas(app, { notificar });

  console.log('[academy] Villela Academy montada. Landing: /academy · painel: /academy/app');
  return { repo };
}

module.exports = { montar, repo };
