// =====================================================================
// Voz — camada de banco (SQLite via node:sqlite). Banco próprio em
// DATA_DIR/voz/, isolado dos outros produtos. Padrão do music/db.js.
//
// ⚠️ O `schema/` roda ANTES das migrações. Índice sobre coluna que só
// existe depois de um ALTER aborta o schema inteiro e o módulo não monta
// — coluna nova entra por `garantirColuna`, e o índice dela por MIGRAÇÃO.
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const MOD_DIR = path.join(DATA_DIR, 'voz');
fs.mkdirSync(MOD_DIR, { recursive: true });

const DB_PATH = path.join(MOD_DIR, 'voz.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 4000;');

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

/** Coluna nova em tabela existente. Também fica no CREATE do schema;
 *  aqui só entra quem já tem banco. */
function garantirColuna(tabela, coluna, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all();
  if (cols.some((c) => c.name === coluna)) return false;
  db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${ddl}`);
  return true;
}

const nowISO = () => new Date().toISOString();
const novoId = () => crypto.randomBytes(12).toString('hex');

/** JSON tolerante: campo corrompido não pode derrubar a leitura de um
 *  histórico inteiro. Devolve o padrão e segue. */
const j = {
  str: (v) => { try { return JSON.stringify(v == null ? null : v); } catch (_) { return 'null'; } },
  parse: (s, padrao) => { try { const v = JSON.parse(s); return v == null ? padrao : v; } catch (_) { return padrao; } },
};

module.exports = { db, DB_PATH, MOD_DIR, nowISO, novoId, j, garantirColuna, aplicarMigracoes };
