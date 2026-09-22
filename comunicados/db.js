// =====================================================================
// Comunicados — camada de banco (SQLite via node:sqlite). Banco próprio
// em DATA_DIR/comunicados/, isolado dos produtos. Padrão do voz/db.js.
//
// ⚠️ O `schema/` roda ANTES das migrações. Coluna nova entra por
// `garantirColuna`, e o índice dela por MIGRAÇÃO.
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const MOD_DIR = path.join(DATA_DIR, 'comunicados');
fs.mkdirSync(MOD_DIR, { recursive: true });

const DB_PATH = path.join(MOD_DIR, 'comunicados.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 4000;');

const SCHEMA_DIR = path.join(__dirname, 'schema');
for (const arquivo of fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.sql')).sort()) {
  db.exec(fs.readFileSync(path.join(SCHEMA_DIR, arquivo), 'utf8'));
}

const MIGRACOES = [];
function aplicarMigracoes(lista) {
  for (const m of lista) {
    if (db.prepare('SELECT 1 FROM migrations WHERE nome = ?').get(m.nome)) continue;
    db.exec(m.sql);
    db.prepare('INSERT INTO migrations (nome, aplicada_em) VALUES (?, ?)').run(m.nome, new Date().toISOString());
  }
}
aplicarMigracoes(MIGRACOES);

/** Coluna nova em tabela que já existe. Também fica no CREATE do schema — por
 *  isso a checagem: em banco NOVO a coluna já nasce e o ALTER quebraria o boot
 *  (o schema/ roda ANTES das migrações). */
function garantirColuna(tabela, coluna, ddl) {
  if (db.prepare(`PRAGMA table_info(${tabela})`).all().some((c) => c.name === coluna)) return false;
  db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${ddl}`);
  return true;
}
// Cópia de teste do comunicado (só o admin vê), acrescentada em 22/09/2026.
garantirColuna('comunicados', 'teste', 'INTEGER NOT NULL DEFAULT 0');
// Dica de UM curso (as funcionalidades mudam conforme o assunto), 22/09/2026.
garantirColuna('dicas', 'curso_id', "TEXT NOT NULL DEFAULT ''");

const nowISO = () => new Date().toISOString();
const novoId = () => crypto.randomBytes(10).toString('hex');
const j = {
  str: (v) => { try { return JSON.stringify(v == null ? null : v); } catch (_) { return 'null'; } },
  parse: (s, padrao) => { try { const v = JSON.parse(s); return v == null ? padrao : v; } catch (_) { return padrao; } },
};

module.exports = { db, DB_PATH, MOD_DIR, nowISO, novoId, j, aplicarMigracoes, garantirColuna };
