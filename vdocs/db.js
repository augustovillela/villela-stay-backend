// =====================================================================
// Villela Docs Intelligence — camada de banco (SQLite via node:sqlite).
// Mesmo padrão da Livraria/Legal: sem dependência nativa; Node 22+.
//
// Banco e (futuros) arquivos ficam sob DATA_DIR/vdocs/ (disco
// persistente do Render, /var/data) — nunca no git nem em pasta pública.
//
// DECISÃO (Fase 1): SQLite com isolamento LÓGICO por tenant_id, não um
// banco por tenant nem PostgreSQL. Motivos: (1) infra existente é 1 web
// service Render + disco, sem Postgres provisionado; (2) o produto nasce
// com poucos tenants — WAL atende; (3) o repo.js exige tenantId em toda
// query, e o selftest prova o isolamento. A migração futura (Postgres +
// OpenSearch + storage S3, ver README §Arquitetura) fica confinada a
// este arquivo + repo.js.
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const VDOCS_DIR = path.join(DATA_DIR, 'vdocs');
const STORAGE_DIR = path.join(VDOCS_DIR, 'storage'); // arquivos de documentos (Fase 2)
fs.mkdirSync(STORAGE_DIR, { recursive: true });

const DB_PATH = path.join(VDOCS_DIR, 'vdocs.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 4000;');

// Aplica o schema (idempotente — tudo é CREATE ... IF NOT EXISTS).
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ---- migrações (só acrescentar no fim; cada uma roda UMA vez) ----
const MIGRACOES = [];
for (const m of MIGRACOES) {
  if (db.prepare('SELECT 1 FROM migrations WHERE nome = ?').get(m.nome)) continue;
  db.exec(m.sql);
  db.prepare('INSERT INTO migrations (nome, aplicada_em) VALUES (?, ?)').run(m.nome, new Date().toISOString());
}

// ---- helpers (mesmos idiomas do legal/db.js) ----
const nowISO = () => new Date().toISOString();
const novoId = () => crypto.randomBytes(9).toString('base64url');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

let _txDepth = 0;
function transacao(fn) {
  if (_txDepth > 0) { _txDepth++; try { return fn(); } finally { _txDepth--; } }
  _txDepth = 1;
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
  finally { _txDepth = 0; }
}

const j = {
  parse(s, padrao) { try { return s == null || s === '' ? padrao : JSON.parse(s); } catch { return padrao; } },
  str(o) { try { return JSON.stringify(o == null ? null : o); } catch { return 'null'; } },
};

module.exports = { db, transacao, nowISO, novoId, sha256, j, DATA_DIR, VDOCS_DIR, STORAGE_DIR, DB_PATH };
