// =====================================================================
// Villela Finance — as consultas PRÉ-CONTEXTO. Todas. Só estas.
//
// Existe um problema circular no login: para abrir o contexto de tenant é
// preciso saber a qual conta o usuário pertence — e descobrir isso é
// justamente ler o banco antes de haver contexto. O guarda do `repo.js`
// (com razão) recusa qualquer leitura de tabela com `tenant_id` sem
// contexto.
//
// Em vez de espalhar exceções pelo módulo, elas ficam TODAS aqui, são
// TRÊS, e cada uma é por chave primária ou por e-mail — nunca uma
// listagem, nunca um filtro que possa devolver dado de várias contas.
//
// Regra para quem mexer: se você precisou de `db.prepare` em qualquer
// outro arquivo do módulo, quase certamente não precisava. Use o
// `repo.js` dentro de `tenancy.comTenant`.
// =====================================================================
'use strict';
const { db, nowISO } = require('./db');

/**
 * Usuário da sessão, por id. Devolve também os campos da conta, porque
 * quem chama precisa deles para abrir o contexto.
 */
const porId = (uid) => db.prepare(
  `SELECT u.*, t.slug AS tenant_slug, t.nome AS tenant_nome, t.status AS tenant_status
     FROM tenant_users u JOIN tenants t ON t.id = u.tenant_id
    WHERE u.id = ? AND u.status = 'ativo'`).get(uid) || null;

/**
 * Usuário por e-mail, para o login. `ORDER BY criado_em LIMIT 1` porque o
 * mesmo e-mail pode existir em contas diferentes (o índice único é por
 * tenant, não global) — e nesse caso entra na conta mais antiga.
 *
 * ⚠️ Quando houver o primeiro cliente com e-mail repetido em duas contas,
 * isto vira escolha de conta na tela de login, não sorteio. Está no
 * ROADMAP da fase 9 (onboarding).
 */
const porEmail = (email) => db.prepare(
  "SELECT * FROM tenant_users WHERE email = ? AND status = 'ativo' ORDER BY criado_em LIMIT 1")
  .get(String(email || '').toLowerCase().trim()) || null;

/** Carimba o último acesso. Não devolve nada e nunca derruba o login. */
function marcarAcesso(uid) {
  try { db.prepare('UPDATE tenant_users SET ultimo_acesso = ? WHERE id = ?').run(nowISO(), uid); }
  catch (_) { /* carimbo de acesso não vale um erro de login */ }
}

module.exports = { porId, porEmail, marcarAcesso };
