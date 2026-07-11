// =====================================================================
// Villela Stay Manager (VSM) — camada de banco (SQLite via node:sqlite).
// Banco próprio em DATA_DIR/vsm/ (isolado dos outros SaaS: legal-saas/,
// vdocs/, vpe/). Sem dependência nativa (node:sqlite, Node 22+).
// Produto: control plane comercial que vende o sistema de gestão de
// hospedagem por temporada a outros anfitriões e gestores.
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SAAS_DIR = path.join(DATA_DIR, 'vsm');
fs.mkdirSync(SAAS_DIR, { recursive: true });

const DB_PATH = path.join(SAAS_DIR, 'vsm.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 4000;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// ---- migrações (ALTERs; roda uma vez cada) ----
const MIGRACOES = [
  // marco 3 (Stays): rastrear origem e id externo de imóveis/reservas importados.
  // Colunas adicionadas por ALTER (as tabelas app_* já existem em produção); por
  // isso NÃO ficam no CREATE do schema.sql — este é o único ponto que as cria.
  { nome: '2026-07-09-app-imoveis-stays', sql: "ALTER TABLE app_imoveis ADD COLUMN stays_id TEXT DEFAULT ''; ALTER TABLE app_imoveis ADD COLUMN origem TEXT DEFAULT 'manual';" },
  { nome: '2026-07-09-app-reservas-stays', sql: "ALTER TABLE app_reservas ADD COLUMN stays_id TEXT DEFAULT ''; ALTER TABLE app_reservas ADD COLUMN origem TEXT DEFAULT 'manual';" },
  // checklist de etapas por reserva (JSON {etapa:{feito,em}}) — diferencial "não esqueço etapa"
  { nome: '2026-07-11-app-reservas-checklist', sql: "ALTER TABLE app_reservas ADD COLUMN checklist TEXT DEFAULT '{}';" },
];
for (const m of MIGRACOES) {
  if (db.prepare('SELECT 1 FROM migrations WHERE nome = ?').get(m.nome)) continue;
  db.exec(m.sql);
  db.prepare('INSERT INTO migrations (nome, aplicada_em) VALUES (?, ?)').run(m.nome, new Date().toISOString());
}

const nowISO = () => new Date().toISOString();
const novoId = () => crypto.randomBytes(9).toString('base64url');
const periodoAtual = () => new Date().toISOString().slice(0, 7); // YYYY-MM

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

module.exports = { db, transacao, nowISO, novoId, periodoAtual, j, DATA_DIR, SAAS_DIR, DB_PATH };
