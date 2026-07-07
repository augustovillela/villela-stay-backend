// =====================================================================
// Villela Legal Intelligence — camada de banco (SQLite via node:sqlite)
// Mesmo padrão da Livraria: sem dependência nativa (better-sqlite3 exige
// compilação e quebra no Windows); node:sqlite existe no Node 22+.
//
// Banco e documentos ficam sob DATA_DIR/legal/ (disco persistente do
// Render, /var/data) — nunca no git nem em pasta pública.
//
// DECISÃO (Fase 1): SQLite em vez de PostgreSQL. Motivos: (1) a infra
// existente é 1 web service Render + disco persistente, sem Postgres
// provisionado; (2) escritório single-tenant com poucos usuários — WAL
// atende com folga; (3) zero dependência nova. A eventual migração para
// Postgres fica confinada a este arquivo + repo.js (schema já é ANSI-fiel).
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LEGAL_DIR = path.join(DATA_DIR, 'legal');
const DOCS_DIR = path.join(LEGAL_DIR, 'docs');
fs.mkdirSync(DOCS_DIR, { recursive: true });

const DB_PATH = path.join(LEGAL_DIR, 'legal.db');
const db = new DatabaseSync(DB_PATH);

// WAL: leituras concorrentes durante escrita; melhor para servidor web.
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 4000;');

// Aplica o schema (idempotente — tudo é CREATE ... IF NOT EXISTS).
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ---- helpers (mesmos idiomas do livraria/db.js) ----
const nowISO = () => new Date().toISOString();
const novoId = () => crypto.randomBytes(9).toString('base64url');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Executa fn dentro de uma transação (rollback em erro).
function transacao(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
}

// JSON seguro (colunas TEXT que guardam JSON).
const j = {
  parse(s, padrao) { try { return s == null || s === '' ? padrao : JSON.parse(s); } catch { return padrao; } },
  str(o) { try { return JSON.stringify(o == null ? null : o); } catch { return 'null'; } },
};

module.exports = {
  db, transacao, nowISO, novoId, sha256, j,
  DATA_DIR, LEGAL_DIR, DOCS_DIR, DB_PATH,
};
