// =====================================================================
// Villela Kids — montagem no app Express.
// Uso no server.js (antes dos express.static e do app.listen):
//   require('./kids').montar(app, { express, requireAuth, requireAdmin,
//     enviarEmail, alertaAugusto, jwtSecret });
//
// Ecossistema de desenvolvimento humano para crianças (7–11): MVP
// "Clube de Missões" da fase 1 (docs/PROMPT_MASTER_VILLELA_KIDS.md).
// Landing em /kids, app da família em /kids/app (cookie 'kids_sess'),
// administração na aba 🧒 do Portal Staff (/staff/api/kids/*).
// SQLite próprio em DATA_DIR/kids/. A conta é SEMPRE do responsável
// (LGPD art. 14); a criança é um perfil mínimo sem login. Tutor por IA
// entra na onda 2 pela mesma estrutura (ia.js + ia-llm.js, padrão closet).
// =====================================================================
'use strict';
const repo = require('./repo');
const emails = require('./emails');
const seed = require('./seed');
const { registrarRotasConta } = require('./rotas-conta');
const { registrarRotasApp } = require('./rotas-app');
const { registrarRotasStaff } = require('./rotas-staff');
const { registrarPaginas } = require('./paginas');

function montar(app, injected = {}) {
  const { express, requireAuth, requireAdmin, enviarEmail, jwtSecret } = injected;
  if (!express || !requireAuth || !requireAdmin || !jwtSecret) {
    throw new Error('kids.montar: faltam deps (express, requireAuth, requireAdmin, jwtSecret).');
  }
  repo.semear();          // config + catálogo curado das 8 missões (upsert)
  emails.configurar({ enviarEmail });
  seed.semearDemo();      // só em dev/KIDS_SEED=on e só com o banco vazio

  const conta = registrarRotasConta(app, { jwtSecret });
  registrarRotasApp(app, { requireUsuario: conta.requireUsuario });
  registrarRotasStaff(app, { requireAuth, requireAdmin });
  registrarPaginas(app);

  console.log(`[kids] Villela Kids montado. Landing: /kids · app: /kids/app · staff: /staff/api/kids`
    + ` · missões ativas: ${repo.Missoes.catalogo().length}`
    + ` · beta fechado: ${repo.Config.get('beta_fechado', 'on')}`
    + ` · e-mail: ${emails.ativo() ? 'ligado' : 'desligado'}`);
  return { repo, emails, seed };
}

module.exports = { montar, repo, emails, seed };
