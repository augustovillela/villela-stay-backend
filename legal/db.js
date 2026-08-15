// =====================================================================
// Villela Legal Intelligence — camada de banco (SQLite via node:sqlite)
// Mesmo padrão da Livraria: sem dependência nativa (better-sqlite3 exige
// compilação e quebra no Windows); node:sqlite existe no Node 22+.
//
// ISOLAMENTO POR TENANT (caminho B — instância por escritório):
// cada escritório tem SEU banco em DATA_DIR/legal-<tenant>/legal.db e SEUS
// documentos em .../docs. O escritório interno do Augusto é o tenant
// TENANT_PADRAO ('villela') e mapeia para o diretório LEGADO DATA_DIR/legal
// — assim a produção continua no mesmo lugar, SEM migração de dados.
//
// Como funciona: o "banco atual" é resolvido por requisição via
// AsyncLocalStorage (comTenant/tenantAtual). O objeto `db` exportado é um
// PROXY fino cujos .prepare()/.exec() delegam para o handle do tenant
// corrente. Como TODO acesso no módulo é db.prepare(...)/db.exec(...) inline
// (nenhum statement preso no load), isso escopa o núcleo inteiro sem
// reescrever as ~240 queries. Isolamento é FÍSICO: um tenant não tem como
// ler o banco do outro (arquivos distintos) — garantia forte p/ sigilo/LGPD.
//
// Sem contexto de tenant (ex.: acesso a db no carregamento de um módulo),
// o proxy cai no TENANT_PADRAO — exatamente o comportamento single-tenant
// de antes, então nada quebra o escritório do Augusto.
//
// DECISÃO (Fase 1): SQLite em vez de PostgreSQL — ver README.md. A migração
// futura fica confinada a este arquivo + repo.js (schema já é ANSI-fiel).
// =====================================================================
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Tenant interno (escritório do Augusto). Mapeia para o dir LEGADO p/ não migrar nada.
const TENANT_PADRAO = 'villela';
const safeTid = (t) => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 60) || TENANT_PADRAO;
function dirDoTenant(tid) {
  const t = safeTid(tid);
  return t === TENANT_PADRAO ? path.join(DATA_DIR, 'legal') : path.join(DATA_DIR, 'legal-' + t);
}

// ---- contexto de tenant por requisição ----
const als = new AsyncLocalStorage();
const tenantAtual = () => { const c = als.getStore(); return c && c.tenantId ? c.tenantId : TENANT_PADRAO; };
function comTenant(tenantId, fn) { return als.run({ tenantId: safeTid(tenantId) }, fn); }

// ---- inicializadores rodados 1× por banco novo (FTS + seeds); registrados pelo index.js ----
const _inicializadores = [];
function registrarInicializador(fn) { if (typeof fn === 'function') _inicializadores.push(fn); }

// ---- schema + migrações (aplicados a CADA banco de tenant) ----
const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  // ONDA LIVRO: tabelas de paridade com o livro "Claude AI na Prática Jurídica"
  // (Cap. 47 + Parte VIII). Arquivo separado só por legibilidade — roda no
  // mesmo boot, também idempotente (CREATE ... IF NOT EXISTS).
  + '\n' + fs.readFileSync(path.join(__dirname, 'schema-livro.sql'), 'utf8');
// Cada entrada roda UMA vez por banco (controle na tabela migrations). Só acrescentar no fim.
const MIGRACOES = [
  { nome: '001-documents-legado-id', sql: "ALTER TABLE documents ADD COLUMN legado_id TEXT DEFAULT ''" },
  { nome: '002-contract-reviews-analise-json', sql: "ALTER TABLE contract_reviews ADD COLUMN analise_json TEXT DEFAULT ''" },
  { nome: '003-publications-movement-id', sql: "ALTER TABLE case_publications ADD COLUMN movement_id TEXT DEFAULT ''" },
  // O histórico que já existia entra como LIDO: sem isso, o dia 1 marcaria
  // todo processo como "novidade" (um caso sozinho tem 192 andamentos) e o
  // destaque nasceria inútil. Novidade passa a contar a partir daqui.
  {
    nome: '004-movements-lido',
    // `sqls` (plural) = cada comando roda SOZINHO. Num banco novo o schema já
    // criou as colunas e os ALTERs falham com "duplicate column name" — o que é
    // esperado e ignorado; num `sql` único isso abortaria o resto (o índice e o
    // UPDATE) sem ninguém perceber.
    sqls: [
      'ALTER TABLE case_movements ADD COLUMN lido INTEGER NOT NULL DEFAULT 0',
      "ALTER TABLE case_movements ADD COLUMN lido_em TEXT DEFAULT ''",
      "ALTER TABLE case_movements ADD COLUMN lido_por TEXT DEFAULT ''",
      'UPDATE case_movements SET lido = 1 WHERE lido = 0',
      'CREATE INDEX IF NOT EXISTS idx_movements_lido ON case_movements(case_id, lido)',
    ],
  },
];
// Erros que são ESPERADOS ao reaplicar (banco novo já nasceu com a coluna).
const ERRO_BENIGNO = /duplicate column name|already exists/i;

// ---- registro de handles abertos, um por tenant ----
const _handles = new Map();

function _abrir(tid) {
  const dir = dirDoTenant(tid);
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  const sqlite = new DatabaseSync(path.join(dir, 'legal.db'));
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec('PRAGMA busy_timeout = 4000;');
  sqlite.exec(schemaSQL);
  for (const m of MIGRACOES) {
    if (sqlite.prepare('SELECT 1 FROM migrations WHERE nome = ?').get(m.nome)) continue;
    let falhou = null;
    for (const sql of (m.sqls || [m.sql])) {
      try { sqlite.exec(sql); }
      catch (e) {
        if (ERRO_BENIGNO.test(e.message)) continue;   // reaplicação em banco novo
        falhou = e;
        console.error(`[legal/db] migração ${m.nome} falhou: ${e.message} — comando: ${String(sql).slice(0, 90)}`);
      }
    }
    // NÃO marcar como aplicada quando falhou de verdade: marcar esconderia um
    // schema quebrado para sempre. Assim ela tenta de novo e o erro aparece.
    if (!falhou) sqlite.prepare('INSERT INTO migrations (nome, aplicada_em) VALUES (?, ?)').run(m.nome, new Date().toISOString());
  }
  return { sqlite, tid: safeTid(tid), txDepth: 0 };
}

// Abre (ou reusa) o handle do tenant. Na 1ª abertura roda os inicializadores
// DENTRO do contexto do tenant — daí semeiam no banco certo. O handle é
// registrado ANTES dos inits para que acessos reentrantes reusem o mesmo.
function handleDoTenant(tid) {
  const key = safeTid(tid);
  const existente = _handles.get(key);
  if (existente) return existente;
  const h = _abrir(key);
  _handles.set(key, h);
  comTenant(key, () => {
    for (const init of _inicializadores) {
      try { init(key); } catch (e) { console.error(`[legal/db] inicializador falhou (tenant ${key}):`, e.message); }
    }
  });
  return h;
}

// Garante que o banco do tenant exista e esteja semeado. Retorna o id normalizado.
function garantirTenant(tid) { handleDoTenant(tid); return safeTid(tid); }

// Lista os tenants com banco já criado no disco (villela + legal-*). Usado
// pelas rotinas server-side (coleta) para varrer todos os escritórios.
function listarTenants() {
  const out = new Set([TENANT_PADRAO]);
  try {
    for (const nome of fs.readdirSync(DATA_DIR)) {
      if (nome === 'legal') out.add(TENANT_PADRAO);
      else if (nome.startsWith('legal-') && nome !== 'legal-saas') { const t = safeTid(nome.slice('legal-'.length)); if (t) out.add(t); }
    }
  } catch (_) { /* DATA_DIR ainda sem nada */ }
  return [...out];
}

// ---- proxy fino: delega para o handle do tenant corrente ----
const db = {
  prepare(sql) { return handleDoTenant(tenantAtual()).sqlite.prepare(sql); },
  exec(sql) { return handleDoTenant(tenantAtual()).sqlite.exec(sql); },
};

// ---- helpers (mesmos idiomas do livraria/db.js) ----
const nowISO = () => new Date().toISOString();
const novoId = () => crypto.randomBytes(9).toString('base64url');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Pasta de documentos do tenant corrente (DATA_DIR/<dir do tenant>/docs).
function docsDir() { const d = path.join(dirDoTenant(tenantAtual()), 'docs'); fs.mkdirSync(d, { recursive: true }); return d; }

// Executa fn dentro de uma transação NO BANCO DO TENANT CORRENTE (rollback em
// erro). Reentrante por handle: chamadas aninhadas participam da tx externa.
function transacao(fn) {
  const h = handleDoTenant(tenantAtual());
  if (h.txDepth > 0) { h.txDepth++; try { return fn(); } finally { h.txDepth--; } }
  h.txDepth = 1;
  h.sqlite.exec('BEGIN');
  try { const r = fn(); h.sqlite.exec('COMMIT'); return r; }
  catch (e) { try { h.sqlite.exec('ROLLBACK'); } catch (_) {} throw e; }
  finally { h.txDepth = 0; }
}

// JSON seguro (colunas TEXT que guardam JSON).
const j = {
  parse(s, padrao) { try { return s == null || s === '' ? padrao : JSON.parse(s); } catch { return padrao; } },
  str(o) { try { return JSON.stringify(o == null ? null : o); } catch { return 'null'; } },
};

module.exports = {
  db, transacao, nowISO, novoId, sha256, j, DATA_DIR, docsDir,
  // multi-tenant (caminho B)
  TENANT_PADRAO, comTenant, tenantAtual, dirDoTenant, garantirTenant, listarTenants, registrarInicializador,
};
