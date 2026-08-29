// =====================================================================
// ORIGENA — camada de banco (PostgreSQL via `pg`, JS puro, sem nativa).
//
// POR QUE POSTGRES E NÃO SQLITE COMO OS OUTROS 11 PRODUTOS (ADR-0002):
// a Origena tem DOIS processos escrevendo — o web e o worker de mídia —
// e o disco do Render só monta em UM serviço. Some-se RLS (muro de
// tenancy no próprio banco) e o caminho para pgvector no RAG semântico.
// Detalhe completo: docs\origena\DECISIONS\ADR-0002-banco-postgresql.md
//
// Isolamento de teste: `ORIGENA_DB_SCHEMA` põe o selftest num schema
// descartável do mesmo banco — o equivalente ao os.tmpdir() que os
// produtos SQLite usam. `public` fica sempre no fim do search_path
// porque é lá que mora o pgcrypto (gen_random_uuid).
// =====================================================================
'use strict';
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const SCHEMA = process.env.ORIGENA_DB_SCHEMA || 'origena';

// BANCO LOCAL PARA TESTE, quando existir. O `origena-db` fica na Virgínia
// e daqui cada consulta custa ~143 ms de ida e volta — com milhares de
// consultas, a suíte levava 20 minutos de PURA ESPERA DE REDE. Contra um
// Postgres na própria máquina a mesma consulta custa ~1 ms.
//
// A troca é amarrada ao SCHEMA DE TESTE (prefixo `t_`), não a uma flag
// solta: é impossível a suíte apontar para produção por engano, e é
// impossível produção cair no banco local — o schema de produção se chama
// `origena` e nunca casa com o prefixo.
const EH_TESTE = /^t_/.test(SCHEMA);
const URL_BANCO = (EH_TESTE && process.env.ORIGENA_TEST_DATABASE_URL)
  || process.env.ORIGENA_DATABASE_URL || '';
const DIR_SCHEMA = path.join(__dirname, 'schema');

// O schema vira identificador SQL cru (não dá para parametrizar DDL).
// Validar aqui é o que impede injeção por env mal preenchida.
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(SCHEMA)) {
  throw new Error(`ORIGENA_DB_SCHEMA inválido: ${SCHEMA} (use [a-z_][a-z0-9_]*)`);
}

// Trava de migração: web e worker sobem juntos a cada deploy; sem ela os
// dois tentariam migrar ao mesmo tempo. Número fixo e arbitrário.
const LOCK_MIGRACAO = 728_141_001;

const configurado = () => !!URL_BANCO;

// Host com ponto = externo (dev, via internet) → TLS obrigatório e o
// certificado do Render valida contra a CA do sistema (conferido).
// Host sem ponto = rede interna do Render → sem TLS, sem custo.
const LOCAIS = ['localhost', '127.0.0.1', '::1', '[::1]'];
function precisaTLS(url) {
  // O critério era "tem ponto no hostname" — e `127.0.0.1` tem três.
  // Banco na própria máquina não fala TLS, e a conexão morria com
  // "The server does not support SSL connections".
  try {
    const h = new URL(url).hostname;
    return !LOCAIS.includes(h) && h.includes('.');
  } catch (_) { return false; }
}

let _pool = null;
function pool() {
  if (_pool) return _pool;
  if (!configurado()) throw new Error('ORIGENA_DATABASE_URL não definida.');
  _pool = new Pool({
    connectionString: URL_BANCO,
    ssl: precisaTLS(URL_BANCO) ? true : false,
    max: Number(process.env.ORIGENA_DB_POOL || 6),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    // search_path aplicado a TODA conexão do pool: nenhuma query precisa
    // qualificar schema, e o teste roda isolado só trocando a env.
    options: `-c search_path=${SCHEMA},public`,
  });
  _pool.on('error', (e) => console.error('[origena/db] cliente ocioso caiu:', e.message));
  return _pool;
}

const q = (texto, valores) => pool().query(texto, valores);
const uma = async (texto, valores) => (await q(texto, valores)).rows[0] || null;
const todas = async (texto, valores) => (await q(texto, valores)).rows;

/**
 * Transação. O callback recebe um cliente com `.q()` — usar ele, não o
 * `q` global, senão a query sai do pool e fica FORA da transação.
 */
async function transacao(fn) {
  const c = await pool().connect();
  try {
    await c.query('BEGIN');
    const r = await fn({
      q: (t, v) => c.query(t, v),
      uma: async (t, v) => (await c.query(t, v)).rows[0] || null,
      todas: async (t, v) => (await c.query(t, v)).rows,
      cliente: c,
    });
    await c.query('COMMIT');
    return r;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    c.release();
  }
}

// ---------------------------------------------------------------------
// Migrações — arquivos numerados em schema/, aditivas e idempotentes.
// Cada uma roda UMA vez, dentro da própria transação. Falhou, não marca.
// ---------------------------------------------------------------------
function arquivosDeMigracao() {
  if (!fs.existsSync(DIR_SCHEMA)) return [];
  return fs.readdirSync(DIR_SCHEMA).filter((f) => f.endsWith('.sql')).sort();
}

async function migrar({ silencioso = false } = {}) {
  const c = await pool().connect();
  const aplicadas = [];
  try {
    await c.query('SELECT pg_advisory_lock($1)', [LOCK_MIGRACAO]);
    // SCHEMA já validado contra [a-z_][a-z0-9_]* no topo do arquivo
    await c.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    await c.query(`SET search_path = ${SCHEMA}, public`);
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())`);

    const jaFeitas = new Set((await c.query('SELECT nome FROM schema_migrations')).rows.map((r) => r.nome));
    for (const arquivo of arquivosDeMigracao()) {
      if (jaFeitas.has(arquivo)) continue;
      const sql = fs.readFileSync(path.join(DIR_SCHEMA, arquivo), 'utf8');
      await c.query('BEGIN');
      try {
        await c.query(sql);
        await c.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [arquivo]);
        await c.query('COMMIT');
        aplicadas.push(arquivo);
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error(`Migração ${arquivo} falhou: ${e.message}`);
      }
    }
    if (aplicadas.length && !silencioso) console.log(`[origena/db] migrações aplicadas: ${aplicadas.join(', ')}`);
    return aplicadas;
  } finally {
    try { await c.query('SELECT pg_advisory_unlock($1)', [LOCK_MIGRACAO]); } catch (_) {}
    c.release();
  }
}

/**
 * Guarda pura (e por isso testável): só schema que começa com `t_` pode
 * ser derrubado. `origena` e `public` nunca — um DROP CASCADE errado aqui
 * apagaria o acervo de todas as famílias.
 */
const podeDerrubar = (schema) => /^t_[a-z0-9_]+$/.test(String(schema || ''));

/** Só para o selftest: apaga o schema descartável no fim. */
async function derrubarSchema(schema = SCHEMA) {
  if (!podeDerrubar(schema)) {
    throw new Error(`Recusado: derrubarSchema só aceita schema de teste (t_*), recebeu "${schema}".`);
  }
  await q(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
}

async function saude() {
  const t0 = Date.now();
  const r = await uma('SELECT current_database() AS banco, current_schema() AS schema');
  return { ok: true, banco: r.banco, schema: r.schema, ms: Date.now() - t0 };
}

/**
 * O muro do banco esta MESMO de pe? Pergunta empirica, nao promessa de doc.
 *
 * Todo o isolamento entre familias assenta em row level security, e RLS nao
 * vale para papel com SUPERUSER ou BYPASSRLS — que passa por cima sem erro,
 * sem log, sem nada. Aqui a resposta vem de dois lados: o atributo do papel
 * (definitivo) e uma sonda sem escopo, que TEM de devolver zero linhas.
 */
async function isolamento() {
  const t0 = Date.now();
  try {
    const p = await uma(
      `SELECT current_user AS papel, rolsuper OR rolbypassrls AS ignora
         FROM pg_roles WHERE rolname = current_user`);
    // sem SET app.family_id nenhum: com o muro de pe, o RLS zera o resultado
    const sonda = await uma('SELECT count(*)::int AS n FROM audit_log');
    return {
      ok: !p.ignora && sonda.n === 0,
      papel: p.papel, ignoraRls: !!p.ignora, linhasSemEscopo: sonda.n,
      ms: Date.now() - t0,
    };
  } catch (e) { return { ok: false, erro: e.message }; }
}

const fechar = async () => { if (_pool) { await _pool.end(); _pool = null; } };

const nowISO = () => new Date().toISOString();

module.exports = {
  configurado, pool, q, uma, todas, transacao, migrar,
  podeDerrubar, derrubarSchema, saude, isolamento, fechar, nowISO, SCHEMA,
};
