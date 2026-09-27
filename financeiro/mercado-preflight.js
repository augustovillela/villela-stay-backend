// =====================================================================
// Preflight somente leitura do worker de mercado.
//
// Confirma que o PostgreSQL e o bucket R2 estao acessiveis sem migrar
// schema, gravar objetos ou devolver detalhes sensiveis nos resultados.
// =====================================================================
'use strict';
const { Pool } = require('pg');
const storagePadrao = require('../storage-s3');

const TIMEOUT_PADRAO_MS = 5_000;

function categoriaErro(e) {
  const codigo = String((e && e.code) || '').toUpperCase();
  const nome = String((e && e.name) || '');
  const status = Number((e && e.status) || 0);
  if (nome === 'AbortError' || codigo === 'ABORT_ERR' || codigo === 'ETIMEDOUT' || codigo === '57014') return 'timeout';
  if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'].includes(codigo)) return 'rede';
  if (status === 401 || status === 403 || codigo === '28P01') return 'autenticacao';
  if (status === 404 || codigo === '3D000') return 'nao_encontrado';
  return 'indisponivel';
}

function resultadoErro(inicio, e) {
  return { ok: false, latencia_ms: Math.max(0, Date.now() - inicio), categoria: categoriaErro(e) };
}

async function postgres({ connectionString = process.env.FINANCE_MARKET_DATABASE_URL,
  poolFactory = cfg => new Pool(cfg), timeoutMs = TIMEOUT_PADRAO_MS } = {}) {
  const inicio = Date.now();
  if (!String(connectionString || '').trim()) return { ok: false, latencia_ms: 0, categoria: 'nao_configurado' };
  let pool;
  try {
    pool = poolFactory({
      connectionString, max: 1, connectionTimeoutMillis: timeoutMs,
      statement_timeout: timeoutMs, query_timeout: timeoutMs,
    });
    const r = await pool.query('SELECT 1 AS ok');
    if (!r || !r.rows || Number(r.rows[0] && r.rows[0].ok) !== 1) throw new Error('resposta_invalida');
    return { ok: true, latencia_ms: Math.max(0, Date.now() - inicio), categoria: 'ok' };
  } catch (e) {
    return resultadoErro(inicio, e);
  } finally {
    if (pool && typeof pool.end === 'function') {
      try { await pool.end(); } catch { /* o resultado da consulta continua sendo a fonte da falha */ }
    }
  }
}

async function r2({ config, storage = storagePadrao, fetchImpl = global.fetch,
  timeoutMs = TIMEOUT_PADRAO_MS } = {}) {
  const inicio = Date.now();
  if (!config || !config.endpoint || !config.bucket || !config.key || !config.secret) {
    return { ok: false, latencia_ms: 0, categoria: 'nao_configurado' };
  }
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const url = storage.presignS3(config, 'HEAD', null, 60);
    const resposta = await fetchImpl(url, { method: 'HEAD', redirect: 'manual', signal: controlador.signal });
    if (!resposta.ok) {
      const erro = new Error('bucket_indisponivel');
      erro.status = resposta.status;
      throw erro;
    }
    return { ok: true, latencia_ms: Math.max(0, Date.now() - inicio), categoria: 'ok' };
  } catch (e) {
    return resultadoErro(inicio, e);
  } finally { clearTimeout(timer); }
}

async function executar({ configS3, postgresOpts = {}, r2Opts = {} } = {}) {
  const [banco, bucket] = await Promise.all([
    postgres(postgresOpts),
    r2({ ...r2Opts, config: configS3 }),
  ]);
  return { ok: banco.ok && bucket.ok, postgres: banco, r2: bucket };
}

function formatar(r) {
  const item = x => `${x.ok ? 'ok' : 'falha'}:${x.categoria}:${x.latencia_ms}ms`;
  return `[finance-market-worker] PREFLIGHT postgres=${item(r.postgres)} r2=${item(r.r2)}`;
}

module.exports = { TIMEOUT_PADRAO_MS, categoriaErro, postgres, r2, executar, formatar };
