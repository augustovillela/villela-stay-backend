// =====================================================================
// Catálogo compartilhado do pipeline de mercado.
//
// Este PostgreSQL NÃO contém razão, saldos, posições ou dados financeiros
// do CEO. Ele existe apenas porque o web e o worker do Render não podem
// compartilhar o mesmo disco SQLite.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { Pool } = require('pg');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS fin_market_jobs (
  id text PRIMARY KEY,
  tenant_ref text NOT NULL,
  carga_ref text NOT NULL DEFAULT '',
  fonte text NOT NULL,
  conjunto text NOT NULL,
  jurisdicao text NOT NULL CHECK (jurisdicao IN ('BR','US')),
  formato text NOT NULL CHECK (formato IN ('csv','zip')),
  objeto_chave text NOT NULL,
  tamanho_bytes bigint NOT NULL CHECK (tamanho_bytes > 0),
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  chave_idempotencia text NOT NULL,
  status text NOT NULL CHECK (status IN ('aguardando','processando','concluida','falhou','bloqueada')),
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  worker_id text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  iniciado_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  erro text NOT NULL DEFAULT '',
  UNIQUE (tenant_ref, chave_idempotencia)
);
CREATE INDEX IF NOT EXISTS idx_fin_market_jobs_fila
  ON fin_market_jobs(status, atualizado_em, criado_em);

CREATE TABLE IF NOT EXISTS fin_market_entradas (
  job_id text NOT NULL REFERENCES fin_market_jobs(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordem integer NOT NULL CHECK (ordem > 0),
  tamanho_compactado bigint NOT NULL CHECK (tamanho_compactado >= 0),
  tamanho_descompactado bigint NOT NULL CHECK (tamanho_descompactado >= 0),
  status text NOT NULL CHECK (status IN ('pendente','processando','concluida','ignorada','falhou')),
  registros bigint NOT NULL DEFAULT 0 CHECK (registros >= 0),
  sha256 text NOT NULL DEFAULT '',
  erro text NOT NULL DEFAULT '',
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, nome),
  UNIQUE (job_id, ordem)
);

CREATE TABLE IF NOT EXISTS fin_market_identidades (
  id text PRIMARY KEY,
  tenant_ref text NOT NULL,
  sistema text NOT NULL,
  valor text NOT NULL,
  nome text NOT NULL,
  jurisdicao text NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_ref, sistema, valor)
);

CREATE TABLE IF NOT EXISTS fin_market_particoes (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES fin_market_jobs(id) ON DELETE CASCADE,
  sequencia integer NOT NULL CHECK (sequencia > 0),
  objeto_chave text NOT NULL,
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  registros bigint NOT NULL CHECK (registros > 0),
  periodo_min text NOT NULL DEFAULT '',
  periodo_max text NOT NULL DEFAULT '',
  taxonomias jsonb NOT NULL DEFAULT '[]'::jsonb,
  parser_versao integer NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, sequencia),
  UNIQUE (job_id, objeto_chave)
);
CREATE INDEX IF NOT EXISTS idx_fin_market_particoes_periodo
  ON fin_market_particoes(job_id, periodo_min, periodo_max);
`;

const configurado = () => !!String(process.env.FINANCE_MARKET_DATABASE_URL || '').trim();

class MercadoDb {
  constructor({ connectionString, pool } = {}) {
    this.pool = pool || new Pool({
      connectionString: connectionString || process.env.FINANCE_MARKET_DATABASE_URL,
      max: Number(process.env.FINANCE_MARKET_DB_POOL || 4),
      ssl: String(process.env.FINANCE_MARKET_DB_SSL || '').toLowerCase() === 'require'
        ? { rejectUnauthorized: true } : undefined,
    });
  }

  async migrar() { await this.pool.query(SCHEMA_SQL); }

  async enfileirar(d) {
    const id = d.id || crypto.randomUUID();
    const r = await this.pool.query(`INSERT INTO fin_market_jobs
      (id, tenant_ref, carga_ref, fonte, conjunto, jurisdicao, formato, objeto_chave,
       tamanho_bytes, sha256, chave_idempotencia, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'aguardando')
      ON CONFLICT (tenant_ref, chave_idempotencia) DO UPDATE SET atualizado_em = now()
      RETURNING *`, [id, d.tenantRef, d.cargaRef || '', d.fonte, d.conjunto, d.jurisdicao,
      d.formato, d.objetoChave, d.tamanhoBytes, d.sha256, d.chaveIdempotencia]);
    return r.rows[0];
  }

  async reivindicar(workerId, jobId = null) {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const r = await c.query(`SELECT * FROM fin_market_jobs
        WHERE ($1::text IS NULL OR id=$1)
          AND (status='aguardando'
           OR (status='falhou' AND tentativas < 3 AND atualizado_em < now() - interval '1 minute'))
        ORDER BY atualizado_em, criado_em
        FOR UPDATE SKIP LOCKED LIMIT 1`, [jobId]);
      if (!r.rows[0]) { await c.query('COMMIT'); return null; }
      const u = await c.query(`UPDATE fin_market_jobs
        SET status='processando', worker_id=$2, tentativas=tentativas+1,
            iniciado_em=COALESCE(iniciado_em,now()), atualizado_em=now(), erro=''
        WHERE id=$1 RETURNING *`, [r.rows[0].id, workerId]);
      await c.query('COMMIT');
      return u.rows[0];
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally { c.release(); }
  }

  async checkpoint(jobId, checkpoint, resumo = undefined) {
    const r = await this.pool.query(`UPDATE fin_market_jobs
      SET checkpoint=$2::jsonb,
          resumo=CASE WHEN $3::jsonb IS NULL THEN resumo ELSE $3::jsonb END,
          atualizado_em=now() WHERE id=$1 RETURNING *`,
    [jobId, JSON.stringify(checkpoint || {}), resumo === undefined ? null : JSON.stringify(resumo)]);
    return r.rows[0];
  }

  async registrarEntrada(jobId, d) {
    await this.pool.query(`INSERT INTO fin_market_entradas
      (job_id,nome,ordem,tamanho_compactado,tamanho_descompactado,status)
      VALUES ($1,$2,$3,$4,$5,'pendente')
      ON CONFLICT (job_id,nome) DO UPDATE SET
        ordem=EXCLUDED.ordem, tamanho_compactado=EXCLUDED.tamanho_compactado,
        tamanho_descompactado=EXCLUDED.tamanho_descompactado, atualizado_em=now()`,
    [jobId, d.nome, d.ordem, d.tamanhoCompactado, d.tamanhoDescompactado]);
  }

  async registrarEntradas(jobId, entradas) {
    if (!Array.isArray(entradas) || !entradas.length) return;
    await this.pool.query(`INSERT INTO fin_market_entradas
      (job_id,nome,ordem,tamanho_compactado,tamanho_descompactado,status)
      SELECT $1, x.nome, x.ordem, x.compactado, x.descompactado, 'pendente'
      FROM jsonb_to_recordset($2::jsonb)
        AS x(nome text, ordem integer, compactado bigint, descompactado bigint)
      ON CONFLICT (job_id,nome) DO UPDATE SET
        ordem=EXCLUDED.ordem, tamanho_compactado=EXCLUDED.tamanho_compactado,
        tamanho_descompactado=EXCLUDED.tamanho_descompactado, atualizado_em=now()`,
    [jobId, JSON.stringify(entradas.map(e => ({
      nome: e.nome, ordem: e.ordem,
      compactado: e.tamanhoCompactado, descompactado: e.tamanhoDescompactado,
    })))]);
  }

  async concluirEntrada(jobId, nome, d) {
    await this.pool.query(`UPDATE fin_market_entradas SET status=$3, registros=$4,
      sha256=$5, erro=$6, atualizado_em=now() WHERE job_id=$1 AND nome=$2`,
    [jobId, nome, d.status || 'concluida', d.registros || 0, d.sha256 || '', d.erro || '']);
  }

  async registrarIdentidade(tenantRef, identidade) {
    const principal = (identidade.identificadores || []).find(x => x.principal)
      || (identidade.identificadores || [])[0];
    if (!principal) return null;
    const id = crypto.createHash('sha256').update(`${tenantRef}|${principal.sistema}|${principal.valor}`).digest('hex');
    const r = await this.pool.query(`INSERT INTO fin_market_identidades
      (id,tenant_ref,sistema,valor,nome,jurisdicao,dados)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
      ON CONFLICT (tenant_ref,sistema,valor) DO UPDATE SET
        nome=EXCLUDED.nome, jurisdicao=EXCLUDED.jurisdicao, dados=EXCLUDED.dados, atualizado_em=now()
      RETURNING *`, [id, tenantRef, principal.sistema, principal.valor, identidade.nome,
      identidade.pais || '', JSON.stringify(identidade)]);
    return r.rows[0];
  }

  async registrarParticao(jobId, d) {
    const id = crypto.createHash('sha256').update(`${jobId}|${d.sequencia}|${d.sha256}`).digest('hex');
    const r = await this.pool.query(`INSERT INTO fin_market_particoes
      (id,job_id,sequencia,objeto_chave,sha256,registros,periodo_min,periodo_max,taxonomias,parser_versao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
      ON CONFLICT (job_id,sequencia) DO UPDATE SET
        objeto_chave=EXCLUDED.objeto_chave, sha256=EXCLUDED.sha256,
        registros=EXCLUDED.registros, periodo_min=EXCLUDED.periodo_min,
        periodo_max=EXCLUDED.periodo_max, taxonomias=EXCLUDED.taxonomias,
        parser_versao=EXCLUDED.parser_versao
      RETURNING *`, [id, jobId, d.sequencia, d.objetoChave, d.sha256, d.registros,
      d.periodoMin || '', d.periodoMax || '', JSON.stringify(d.taxonomias || []), d.parserVersao]);
    return r.rows[0];
  }

  async concluir(jobId, resumo) {
    const r = await this.pool.query(`UPDATE fin_market_jobs SET status='concluida',
      checkpoint='{}'::jsonb, resumo=$2::jsonb, concluido_em=now(), atualizado_em=now(), erro=''
      WHERE id=$1 RETURNING *`, [jobId, JSON.stringify(resumo || {})]);
    return r.rows[0];
  }

  async falhar(jobId, erro, bloqueada = false) {
    await this.pool.query(`UPDATE fin_market_jobs SET status=$2, erro=$3,
      atualizado_em=now() WHERE id=$1`, [jobId, bloqueada ? 'bloqueada' : 'falhou', String(erro || '').slice(0, 2000)]);
  }

  async fechar() { await this.pool.end(); }
}

module.exports = { SCHEMA_SQL, configurado, MercadoDb };
