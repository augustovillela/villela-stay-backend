// =====================================================================
// Villela Finance — camada de banco (SQLite via node:sqlite).
//
// Banco PRÓPRIO em DATA_DIR/financeiro/financeiro.db, isolado dos outros
// SaaS (ADR-0002). Sem dependência nativa — node:sqlite, Node 22+.
//
// Aqui só ficam conexão, schema, migrations e introspecção. Regra de
// negócio mora nos serviços; SQL de domínio mora no repo.js.
//
// ATENÇÃO: schema.sql roda ANTES das migrações. Índice ou trigger que
// dependa de coluna criada por migração aborta o schema inteiro e o
// módulo não monta — crie a coluna na migração e o índice também nela.
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SAAS_DIR = path.join(DATA_DIR, 'financeiro');
fs.mkdirSync(SAAS_DIR, { recursive: true });

const DB_PATH = path.join(SAAS_DIR, 'financeiro.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 4000;');
// Durabilidade: o razão não pode perder um COMMIT confirmado por causa de
// um crash do processo. FULL custa fsync por commit — aceitável no volume
// de um financeiro, e é a diferença entre "o lote existe" e "achamos que sim".
db.exec('PRAGMA synchronous = FULL;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// ---- helpers de introspecção (usados por migrations e pelo guarda) ----
function colunas(tabela) {
  try { return db.prepare(`PRAGMA table_info(${tabela})`).all().map(c => c.name); }
  catch { return []; }
}
const temColuna = (tabela, coluna) => colunas(tabela).includes(coluna);

// ---- migrations (nome único, roda uma vez, NUNCA destrutiva) ----
const MIGRACOES = [];

for (const m of MIGRACOES) {
  if (db.prepare('SELECT 1 FROM migrations WHERE nome = ?').get(m.nome)) continue;
  if (typeof m.aplicar === 'function') m.aplicar(); else db.exec(m.sql);
  db.prepare('INSERT INTO migrations (nome, aplicada_em) VALUES (?, ?)').run(m.nome, new Date().toISOString());
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

// Catálogos globais: nenhum guarda dado de cliente.
const TABELAS_CATALOGO = new Set(['plans', 'migrations']);

// MISTAS: guardam linhas de plataforma (tenant_id = '') e de cliente na
// mesma tabela. O guarda exige predicado de tenant_id no SQL, mas não
// exige contexto — a auditoria de plataforma grava sem tenant escolhido.
const TABELAS_MISTAS = new Set(['audit_logs', 'fin_eventos']);

const nowISO = () => new Date().toISOString();
const hojeISO = () => new Date().toISOString().slice(0, 10);
const novoId = () => crypto.randomBytes(9).toString('base64url');
const competenciaDe = (data) => String(data || '').slice(0, 7);

let _txDepth = 0;
function transacao(fn) {
  if (_txDepth > 0) { _txDepth++; try { return fn(); } finally { _txDepth--; } }
  _txDepth = 1; db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  finally { _txDepth = 0; }
}
const emTransacao = () => _txDepth > 0;

const j = {
  parse(s, padrao) { try { return s == null || s === '' ? padrao : JSON.parse(s); } catch { return padrao; } },
  str(o) { try { return JSON.stringify(o == null ? null : o); } catch { return 'null'; } },
};

module.exports = {
  db, transacao, emTransacao, nowISO, hojeISO, novoId, competenciaDe, j,
  DATA_DIR, SAAS_DIR, DB_PATH,
  colunas, temColuna, TABELAS_TENANT, TABELAS_CATALOGO, TABELAS_MISTAS,
};
