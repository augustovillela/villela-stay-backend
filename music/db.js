// =====================================================================
// Musique · por Villela Music — camada de banco (SQLite via node:sqlite).
// Banco próprio em DATA_DIR/music/ (isolado dos outros produtos).
// Sem dependência nativa (node:sqlite, Node 22+). Padrão do kids/db.js.
//
// ⚠️ O `schema/` roda ANTES das migrações. Índice sobre coluna que só
// existe depois de um ALTER aborta o schema inteiro e o módulo não monta
// — por isso coluna nova entra por `garantirColuna`, e o índice dela
// entra por MIGRAÇÃO, nunca no schema.
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const MOD_DIR = path.join(DATA_DIR, 'music');
fs.mkdirSync(MOD_DIR, { recursive: true });

const DB_PATH = path.join(MOD_DIR, 'music.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 4000;');
// O schema cresce por FASE, em `schema/`, lido em ORDEM ALFABÉTICA
// (padrão do origena/schema/). Nomear com prefixo numérico não é
// estética: a Fase 1 referencia tabelas da Fase 0, e ordem trocada
// derrubaria o `REFERENCES` no primeiro boot de um banco novo.
const SCHEMA_DIR = path.join(__dirname, 'schema');
for (const arquivo of fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.sql')).sort()) {
  db.exec(fs.readFileSync(path.join(SCHEMA_DIR, arquivo), 'utf8'));
}

// ---- migrações (rodam uma vez cada, em ordem) ----
// Tabela NOVA entra num arquivo do `schema/`. Aqui entra o que MUDA em
// tabela que já existe — ALTER, backfill, reconstrução.
const MIGRACOES = [];
function aplicarMigracoes(lista) {
  for (const m of lista) {
    if (db.prepare('SELECT 1 FROM migrations WHERE nome = ?').get(m.nome)) continue;
    db.exec(m.sql);
    db.prepare('INSERT INTO migrations (nome, aplicada_em) VALUES (?, ?)')
      .run(m.nome, new Date().toISOString());
  }
}
aplicarMigracoes(MIGRACOES);

/** Coluna nova em tabela existente. Também fica no CREATE do schema.sql;
 *  aqui só entra quem já tem banco. */
function garantirColuna(tabela, coluna, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all();
  if (cols.some((c) => c.name === coluna)) return false;
  db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${ddl}`);
  return true;
}

// Fase 2: a obra passa a morar numa pasta. Coluna nova em tabela que já
// existe entra por aqui, nunca no `schema/` — e o ÍNDICE dela entra por
// migração, porque o schema roda ANTES e abortaria inteiro.
garantirColuna('obras', 'pasta_id', "TEXT NOT NULL DEFAULT ''");
aplicarMigracoes([
  { nome: '2026-08-25-indice-pasta',
    sql: 'CREATE INDEX IF NOT EXISTS ix_obras_pasta ON obras(dono, pasta_id)' },
]);

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

module.exports = { db, transacao, garantirColuna, nowISO, hojeISO, novoId, novoToken, j, DATA_DIR, MOD_DIR, DB_PATH };
