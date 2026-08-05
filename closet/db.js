// =====================================================================
// Closet Club — camada de banco (SQLite via node:sqlite).
// Banco próprio em DATA_DIR/closet/ (isolado dos outros produtos). Sem
// dependência nativa (node:sqlite, Node 22+). Padrão idêntico ao crm/db.js.
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SAAS_DIR = path.join(DATA_DIR, 'closet');
fs.mkdirSync(SAAS_DIR, { recursive: true });

const DB_PATH = path.join(SAAS_DIR, 'closet.db');
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
// ALTER, e um ALTER cru quebraria em banco novo (coluna duplicada). Este helper
// resolve os dois casos — a coluna também fica no CREATE do schema.sql, para o
// banco novo nascer completo, e aqui só entra quem já tem banco em produção.
function garantirColuna(tabela, coluna, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all();
  if (cols.some((c) => c.name === coluna)) return false;
  db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${ddl}`);
  return true;
}
// onda 2 (03/08/2026): indicação, crédito e entrega por zona
garantirColuna('users', 'codigo_indicacao', "TEXT NOT NULL DEFAULT ''");
garantirColuna('bookings', 'credito_centavos', 'INTEGER NOT NULL DEFAULT 0');
garantirColuna('bookings', 'zona_entrega_id', "TEXT NOT NULL DEFAULT ''");
garantirColuna('partners', 'slug', "TEXT NOT NULL DEFAULT ''");
garantirColuna('partners', 'logo_url', "TEXT NOT NULL DEFAULT ''");

const nowISO = () => new Date().toISOString();
const hojeISO = () => new Date().toISOString().slice(0, 10);
const novoId = () => crypto.randomBytes(9).toString('base64url');
const novoToken = () => crypto.randomBytes(24).toString('base64url');
const periodoAtual = () => new Date().toISOString().slice(0, 7);

// Código curto e legível da reserva (some 0/O/1/I para não confundir no balcão).
const ALFA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function novoCodigo() {
  let s = '';
  for (const b of crypto.randomBytes(5)) s += ALFA[b % ALFA.length];
  return 'CC-' + s;
}

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

// ---- datas: o calendário do aluguel é em dias corridos, fim INCLUSIVE ----
const diaValido = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const somaDias = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
// dois períodos [a1,a2] e [b1,b2] (fim inclusive) se sobrepõem?
const sobrepoe = (a1, a2, b1, b2) => a1 <= b2 && b1 <= a2;

// código curto de indicação/cupom pessoal (mesmo alfabeto sem ambiguidade)
function novoCodigoCurto(tamanho = 6) {
  let s = '';
  for (const b of crypto.randomBytes(tamanho)) s += ALFA[b % ALFA.length];
  return s;
}

module.exports = {
  db, transacao, nowISO, hojeISO, novoId, novoToken, novoCodigo, novoCodigoCurto, periodoAtual, j,
  diaValido, diasEntre, somaDias, sobrepoe, garantirColuna, DATA_DIR, SAAS_DIR, DB_PATH,
};
