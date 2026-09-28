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

// Fase 3: a tarefa pode pertencer a uma TURMA — é assim que a nota entra
// no boletim. Tarefa sem turma continua existindo (professor particular
// atribui direto ao aluno), e por isso o padrão é vazio.
garantirColuna('tarefas', 'turma_id', "TEXT NOT NULL DEFAULT ''");

// Contas próprias (ADR-0011): confirmação de e-mail e duas etapas chegaram
// depois da tabela existir em produção.
garantirColuna('contas_music', 'email_verificado', 'INTEGER NOT NULL DEFAULT 0');
garantirColuna('contas_music', 'totp_secret', "TEXT NOT NULL DEFAULT ''");
garantirColuna('contas_music', 'totp_ativo', 'INTEGER NOT NULL DEFAULT 0');
garantirColuna('contas_music', 'totp_ultimo_passo', 'INTEGER NOT NULL DEFAULT 0');
garantirColuna('contas_music', 'recuperacao', "TEXT NOT NULL DEFAULT '[]'");
// Plano banda (28/09/2026): a tabela de assinaturas já existia em produção.
garantirColuna('assinaturas_music', 'plano', "TEXT NOT NULL DEFAULT 'individual'");
garantirColuna('assinaturas_music', 'vagas', 'INTEGER NOT NULL DEFAULT 1');
// A conta do dono nasceu (28/09) antes da coluna: o e-mail dele vem da Academia, onde já é dele.
db.exec("UPDATE contas_music SET email_verificado = 1 WHERE origem = 'dono' AND email_verificado = 0");

// Cifras (28/09/2026): a OBRA ganha os metadados de biblioteca que o
// músico procura (artista, álbum, gênero, dificuldade...), a impressão
// digital que impede duplicata e a exclusão SUAVE — acervo não some por
// um clique. O setlist ganha status, evento, blocos e o vínculo com a
// cifra/arranjo novos (o `arranjo_id` antigo segue apontando para a
// tabela da Fase 2).
[['artista', "TEXT NOT NULL DEFAULT ''"], ['album', "TEXT NOT NULL DEFAULT ''"],
  ['ano', 'INTEGER NOT NULL DEFAULT 0'], ['idioma', "TEXT NOT NULL DEFAULT ''"],
  ['genero', "TEXT NOT NULL DEFAULT ''"], ['subgenero', "TEXT NOT NULL DEFAULT ''"],
  ['duracao_s', 'INTEGER NOT NULL DEFAULT 0'], ['dificuldade', "TEXT NOT NULL DEFAULT ''"],
  ['afinacao', "TEXT NOT NULL DEFAULT ''"], ['capo_sugerido', 'INTEGER NOT NULL DEFAULT 0'],
  ['fingerprint', "TEXT NOT NULL DEFAULT ''"], ['removido_em', "TEXT NOT NULL DEFAULT ''"],
].forEach(([c, ddl]) => garantirColuna('obras', c, ddl));
[['status', "TEXT NOT NULL DEFAULT 'rascunho'"], ['local', "TEXT NOT NULL DEFAULT ''"],
  ['evento', "TEXT NOT NULL DEFAULT ''"], ['imagem_url', "TEXT NOT NULL DEFAULT ''"],
  ['duracao_planejada_s', 'INTEGER NOT NULL DEFAULT 0'], ['versao', 'INTEGER NOT NULL DEFAULT 1'],
  ['modelo', 'INTEGER NOT NULL DEFAULT 0'],
].forEach(([c, ddl]) => garantirColuna('repertorios', c, ddl));
[['bloco_id', "TEXT NOT NULL DEFAULT ''"], ['bis', 'INTEGER NOT NULL DEFAULT 0'],
  ['medley', "TEXT NOT NULL DEFAULT ''"], ['vocalista', "TEXT NOT NULL DEFAULT ''"],
  ['bpm', 'INTEGER NOT NULL DEFAULT 0'], ['contagem', "TEXT NOT NULL DEFAULT ''"],
  ['cifra_id', "TEXT NOT NULL DEFAULT ''"], ['cifra_arranjo_id', "TEXT NOT NULL DEFAULT ''"],
  ['tom_confirmado', 'INTEGER NOT NULL DEFAULT 0'], ['intervalo', 'INTEGER NOT NULL DEFAULT 0'],
].forEach(([c, ddl]) => garantirColuna('repertorio_itens', c, ddl));

aplicarMigracoes([
  { nome: '2026-09-28-cifras-indices',
    sql: `CREATE INDEX IF NOT EXISTS ix_obras_fingerprint ON obras(dono, fingerprint);
          CREATE INDEX IF NOT EXISTS ix_obras_ativas ON obras(dono, removido_em, atualizado_em);
          CREATE INDEX IF NOT EXISTS ix_obras_artista ON obras(artista);
          CREATE INDEX IF NOT EXISTS ix_itens_cifra ON repertorio_itens(cifra_id);` },
]);

aplicarMigracoes([
  { nome: '2026-08-25-indice-pasta',
    sql: 'CREATE INDEX IF NOT EXISTS ix_obras_pasta ON obras(dono, pasta_id)' },
  { nome: '2026-08-25-indice-tarefa-turma',
    sql: 'CREATE INDEX IF NOT EXISTS ix_tarefas_turma ON tarefas(turma_id, status)' },
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
