// =====================================================================
// Livraria Villela — camada de banco (SQLite via node:sqlite embutido)
// Sem dependência nativa (better-sqlite3 exige compilação). node:sqlite
// existe no Node 22+ (por isso package.json engines = ">=22").
//
// O arquivo do banco e os PDFs privados ficam sob DATA_DIR/livraria/,
// que é o disco persistente do Render (/var/data) — nunca no git nem
// em pasta pública.
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const LIVRARIA_DIR = path.join(DATA_DIR, 'livraria');
const PDF_DIR = path.join(LIVRARIA_DIR, 'pdfs');
fs.mkdirSync(PDF_DIR, { recursive: true });

const DB_PATH = path.join(LIVRARIA_DIR, 'livraria.db');
const db = new DatabaseSync(DB_PATH);

// WAL: leituras concorrentes durante escrita; melhor para servidor web.
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 4000;');

// Aplica o schema (idempotente — tudo é CREATE ... IF NOT EXISTS).
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ---- helpers ----
const nowISO = () => new Date().toISOString();
// ID curto, opaco e url-safe (mesmo estilo do server.js: base64url).
const novoId = () => crypto.randomBytes(9).toString('base64url');
// Token de download: mais longo e imprevisível (32 bytes).
const novoToken = () => crypto.randomBytes(32).toString('base64url');

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
  db, transacao, nowISO, novoId, novoToken, j,
  DATA_DIR, LIVRARIA_DIR, PDF_DIR, DB_PATH,
};
