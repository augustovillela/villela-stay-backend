// =====================================================================
// Villela Growth OS — camada de banco.
//
// NÃO abre banco novo: reusa a conexão do Villela CRM (mesmo arquivo
// DATA_DIR/crm/crm.db) — ver docs/growth-os/DECISIONS/ADR-0002. O require
// do Node compartilha a instância, então há UMA DatabaseSync só: WAL e
// transações ficam coerentes entre os dois módulos.
//
// Aqui só ficam conexão, schema, migrations e helpers. Regra de negócio
// mora nos serviços; SQL de domínio mora no repo.js.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const base = require('../crm/db');

const { db, transacao, nowISO, hojeISO, novoId, periodoAtual, j, DATA_DIR, SAAS_DIR, DB_PATH } = base;

// Um arquivo de schema por etapa: fica claro o que cada uma acrescentou, e
// o CREATE IF NOT EXISTS torna a ordem irrelevante em banco já existente.
for (const arquivo of ['schema.sql', 'schema-etapa2.sql']) {
  db.exec(fs.readFileSync(path.join(__dirname, arquivo), 'utf8'));
}

// ---- helpers de introspecção (usados por migrations e pelo guarda) ----
function colunas(tabela) {
  try { return db.prepare(`PRAGMA table_info(${tabela})`).all().map(c => c.name); }
  catch { return []; }
}
const temColuna = (tabela, coluna) => colunas(tabela).includes(coluna);

// ---- migrations (nome único, roda uma vez, NUNCA destrutiva) ----
const MIGRACOES = [
  {
    // Correlação ponta a ponta: a auditoria precisa amarrar com evento e job.
    // Aditiva — todos os INSERT existentes usam colunas nomeadas.
    nome: 'gx-0001-audit-logs-correlation-id',
    aplicar() {
      if (!temColuna('audit_logs', 'correlation_id')) {
        db.exec("ALTER TABLE audit_logs ADD COLUMN correlation_id TEXT DEFAULT ''");
      }
    },
  },
];

for (const m of MIGRACOES) {
  if (db.prepare('SELECT 1 FROM migrations WHERE nome = ?').get(m.nome)) continue;
  if (typeof m.aplicar === 'function') m.aplicar(); else db.exec(m.sql);
  db.prepare('INSERT INTO migrations (nome, aplicada_em) VALUES (?, ?)').run(m.nome, nowISO());
}

// ---- tabelas sob isolamento de tenant --------------------------------
// Descobertas do próprio schema: qualquer tabela com coluna tenant_id.
// É isto que faz uma tabela nova entrar sozinha no teste anti-vazamento.
function mapearTabelasComTenant() {
  const nomes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  ).all().map(r => r.name);
  const set = new Set();
  for (const t of nomes) if (colunas(t).includes('tenant_id')) set.add(t);
  return set;
}
const TABELAS_TENANT = mapearTabelasComTenant();

// Catálogos globais: nenhum guarda dado de cliente — consulta sem tenant
// é legítima e o guarda não interfere.
const TABELAS_CATALOGO = new Set(['plans', 'feature_flags', 'gx_integracoes', 'migrations']);

// Tabelas MISTAS: guardam linhas globais (tenant_id = '') e linhas de
// cliente na mesma tabela — perfis de sistema convivem com perfis
// personalizados. O guarda continua exigindo predicado de tenant_id no
// SQL, mas não exige contexto (o login precisa ler perfis antes de haver
// tenant escolhido).
const TABELAS_MISTAS = new Set(['gx_roles']);

module.exports = {
  db, transacao, nowISO, hojeISO, novoId, periodoAtual, j,
  DATA_DIR, SAAS_DIR, DB_PATH,
  colunas, temColuna, TABELAS_TENANT, TABELAS_CATALOGO, TABELAS_MISTAS,
};
