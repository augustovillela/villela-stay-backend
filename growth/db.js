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
for (const arquivo of ['schema.sql', 'schema-etapa2.sql', 'schema-etapa3.sql', 'schema-etapa4.sql', 'schema-etapa5.sql', 'schema-etapa6.sql', 'schema-etapa7.sql', 'schema-etapa8.sql', 'schema-etapa9.sql']) {
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
  {
    // Rotação da chave-mestra: sem saber COM QUAL chave cada linha foi
    // cifrada, trocar GROWTH_SECRET_KEY torna todo segredo ilegível em
    // silêncio. A impressão digital da chave (8 hex do sha256) permite
    // diagnosticar e re-cifrar em lote — e nunca revela a chave.
    nome: 'gx-0002-segredos-impressao-da-chave',
    aplicar() {
      if (!temColuna('gx_segredos', 'chave_id')) {
        db.exec("ALTER TABLE gx_segredos ADD COLUMN chave_id TEXT DEFAULT ''");
      }
    },
  },
  {
    // Segundo fator no login do assinante. As colunas ficam em
    // `tenant_users` (tabela do Villela CRM) porque é ali que a pessoa
    // entra — o segredo TOTP em si vive cifrado no cofre, não aqui.
    // Aditiva; o CRM não conhece estas colunas e continua funcionando.
    nome: 'gx-0003-tenant-users-mfa',
    aplicar() {
      if (!temColuna('tenant_users', 'mfa_ativo')) {
        db.exec('ALTER TABLE tenant_users ADD COLUMN mfa_ativo INTEGER DEFAULT 0');
      }
      if (!temColuna('tenant_users', 'mfa_ativado_em')) {
        db.exec("ALTER TABLE tenant_users ADD COLUMN mfa_ativado_em TEXT DEFAULT ''");
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
