// =====================================================================
// Villela CRM — camada de banco (SQLite via node:sqlite).
// Banco próprio em DATA_DIR/crm/ (isolado dos outros SaaS). Sem dependência
// nativa (node:sqlite, Node 22+). Padrão idêntico ao vsm/db.js.
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SAAS_DIR = path.join(DATA_DIR, 'crm');
fs.mkdirSync(SAAS_DIR, { recursive: true });

const DB_PATH = path.join(SAAS_DIR, 'crm.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 4000;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// ---- migrações (ALTERs futuros; roda uma vez cada) ----
const MIGRACOES = [
  // plano de teste com o mesmo nome em todos os sistemas (Augusto, 05/11/2026)
  { nome: '2026-11-05-avaliacao-nome', sql: "UPDATE plans SET nome = 'Avaliação (15 dias)' WHERE slug = 'trial';" },
  // teste grátis padronizado em 15 dias (Augusto, 05/11/2026): corrige só o texto do plano 'trial' já gravado
  { nome: '2026-11-05-trial-15-dias', sql: "UPDATE plans SET nome = replace(nome, '14 dias', '15 dias'), descricao = replace(descricao, '14 dias', '15 dias') WHERE slug = 'trial';" },
  // plano ANUAL (Augusto, 05/11/2026): anual = 10 mensalidades (2 meses gratis); so preenche quem ainda esta sem preco anual
  { nome: '2026-11-05-plano-anual', sql: "ALTER TABLE plans ADD COLUMN preco_anual_centavos INTEGER NOT NULL DEFAULT 0; ALTER TABLE subscriptions ADD COLUMN valor_centavos INTEGER NOT NULL DEFAULT 0; UPDATE plans SET preco_anual_centavos = preco_centavos * 10 WHERE preco_centavos > 0 AND preco_anual_centavos = 0;" },
  // CAMPANHA MULTICANAL (06/11/2026): campanha com N canais; cada alvo = (contato, canal)
  { nome: '2026-11-06-campanha-multicanal', sql: "ALTER TABLE crm_campanhas ADD COLUMN canais TEXT DEFAULT '[]'; ALTER TABLE crm_campanhas ADD COLUMN modo TEXT DEFAULT 'melhor'; ALTER TABLE crm_campanha_alvos ADD COLUMN canal TEXT DEFAULT ''; ALTER TABLE crm_campanha_alvos ADD COLUMN destino TEXT DEFAULT '';" },
  // canais dos contatos já existentes: telefone/whatsapp → whatsapp, e-mail → email (idempotente pelo índice único)
  { nome: '2026-11-06-canais-backfill', sql: "INSERT OR IGNORE INTO crm_contato_canais (id, tenant_id, contato_id, canal, identificador, fonte, criado_em) SELECT lower(hex(randomblob(9))), tenant_id, id, 'whatsapp', CASE WHEN whatsapp != '' THEN whatsapp ELSE telefone END, 'legado', criado_em FROM crm_contatos WHERE whatsapp != '' OR telefone != ''; INSERT OR IGNORE INTO crm_contato_canais (id, tenant_id, contato_id, canal, identificador, fonte, criado_em) SELECT lower(hex(randomblob(9))), tenant_id, id, 'email', lower(email), 'legado', criado_em FROM crm_contatos WHERE email != '';" },
];
for (const m of MIGRACOES) {
  if (db.prepare('SELECT 1 FROM migrations WHERE nome = ?').get(m.nome)) continue;
  db.exec(m.sql);
  db.prepare('INSERT INTO migrations (nome, aplicada_em) VALUES (?, ?)').run(m.nome, new Date().toISOString());
}

// colunas acrescentadas depois da 1a versao da busca ativa (06/11/2026): so altera banco que ja tinha a tabela antiga
for (const [tab, col, ddl] of [
  ['crm_buscas', 'termos', "TEXT DEFAULT '[]'"], ['crm_buscas', 'locais', "TEXT DEFAULT '[]'"], ['crm_buscas', 'tags_extra', "TEXT DEFAULT '[]'"],
  ['crm_busca_lugares', 'bairro', "TEXT DEFAULT ''"],
  // captura para assinantes (06/11/2026): área alvo da busca e como foi paga cada varredura
  ['crm_buscas', 'canal_alvo', "TEXT DEFAULT ''"],
  ['crm_busca_execucoes', 'modo_cobranca', "TEXT DEFAULT ''"],
  ['crm_busca_execucoes', 'cobrado_milesimos', 'INTEGER DEFAULT 0'],
]) {
  if (!db.prepare(`PRAGMA table_info(${tab})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${tab} ADD COLUMN ${col} ${ddl};`);
}

const nowISO = () => new Date().toISOString();
const hojeISO = () => new Date().toISOString().slice(0, 10);
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

module.exports = { db, transacao, nowISO, hojeISO, novoId, periodoAtual, j, DATA_DIR, SAAS_DIR, DB_PATH };
