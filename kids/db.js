// =====================================================================
// Villela Kids — camada de banco (SQLite via node:sqlite).
// Banco próprio em DATA_DIR/kids/ (isolado dos outros produtos).
// Sem dependência nativa (node:sqlite, Node 22+). Padrão do vitrine/db.js.
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const MOD_DIR = path.join(DATA_DIR, 'kids');
fs.mkdirSync(MOD_DIR, { recursive: true });

const DB_PATH = path.join(MOD_DIR, 'kids.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 4000;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// ---- migrações (ALTERs; roda uma vez cada) ----
const MIGRACOES = [];
for (const m of MIGRACOES) {
  if (db.prepare('SELECT 1 FROM migrations WHERE nome = ?').get(m.nome)) continue;
  db.exec(m.sql);
  db.prepare('INSERT INTO migrations (nome, aplicada_em) VALUES (?, ?)').run(m.nome, new Date().toISOString());
}

// Coluna nova em tabela que já existe: `CREATE TABLE IF NOT EXISTS` não aplica
// ALTER, e um ALTER cru quebraria em banco novo (coluna duplicada). A coluna
// também fica no CREATE do schema.sql — aqui só entra quem já tem banco.
function garantirColuna(tabela, coluna, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all();
  if (cols.some((c) => c.name === coluna)) return false;
  db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${ddl}`);
  return true;
}
// onda 5 (07/08/2026): Estúdio de Ilustração com IA — PNG da criação
garantirColuna('portfolio', 'arquivo', "TEXT NOT NULL DEFAULT ''");

const nowISO = () => new Date().toISOString();
const hojeISO = () => new Date().toISOString().slice(0, 10);
const novoId = () => crypto.randomBytes(9).toString('base64url');
const novoToken = () => crypto.randomBytes(24).toString('base64url');

let _txDepth = 0;
function transacao(fn) {
  if (_txDepth > 0) { _txDepth++; try { return fn(); } finally { _txDepth--; } }
  _txDepth = 1; db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  finally { _txDepth = 0; }
}

const j = {
  parse(s, padrao) { try { return s == null || s === '' ? padrao : JSON.parse(s); } catch { return padrao; } },
  str(o) { try { return JSON.stringify(o == null ? null : o); } catch { return 'null'; } },
};

module.exports = { db, transacao, nowISO, hojeISO, novoId, novoToken, j, DATA_DIR, MOD_DIR, DB_PATH };
