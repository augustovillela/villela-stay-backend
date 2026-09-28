// =====================================================================
// Projeção analítica canônica da DFP 2025.
//
// Mantém o ZIP e as partições normalizadas imutáveis. O único artefato
// novo é um manifesto versionado das ocorrências que a leitura canônica
// deve ocultar, sempre com linhagem reversível até a fonte oficial.
//
// Execução: FINANCE_INV_CVM_CANONICAL=on npm run finance:market-canonical-cvm
// =====================================================================
'use strict';
const crypto = require('crypto');
const { Pool } = require('pg');
const storagePadrao = require('../storage-s3');
const preflight = require('./mercado-preflight');
const parser = require('./investimentos-parser');
const duplicidades = require('./mercado-duplicidades-cvm');
const qualidade = require('./mercado-qualidade-cvm');

const REGRA_VERSAO = 1;
const SCHEMA = qualidade.SCHEMA;
const CATEGORIA_PERMITIDA = 'linha_oficial_repetida_mesmo_arquivo';

const CANONICAL_SCHEMA_STATEMENTS = [`CREATE TABLE IF NOT EXISTS ${SCHEMA}.fin_canonical_runs (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES ${SCHEMA}.fin_market_jobs(id),
  quality_run_id text NOT NULL REFERENCES ${SCHEMA}.fin_quality_runs(id),
  duplicate_run_id text NOT NULL REFERENCES ${SCHEMA}.fin_quality_duplicate_runs(id),
  parser_versao integer NOT NULL,
  regra_versao integer NOT NULL,
  fonte_sha256 text NOT NULL CHECK (length(fonte_sha256)=64),
  particoes_sha256 text NOT NULL CHECK (length(particoes_sha256)=64),
  chave_idempotencia text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('processando','concluida','falhou')),
  resultado text NOT NULL DEFAULT '',
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  erro text NOT NULL DEFAULT '',
  criado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now()
)`, `CREATE TABLE IF NOT EXISTS ${SCHEMA}.fin_canonical_groups (
  run_id text NOT NULL REFERENCES ${SCHEMA}.fin_canonical_runs(id) ON DELETE CASCADE,
  chave_hash text NOT NULL CHECK (length(chave_hash)=64),
  categoria text NOT NULL,
  ocorrencias bigint NOT NULL CHECK (ocorrencias > 1),
  ocultas bigint NOT NULL CHECK (ocultas > 0),
  assinatura_fato text NOT NULL CHECK (length(assinatura_fato)=64),
  particao_mantida text NOT NULL,
  linha_particao_mantida integer NOT NULL CHECK (linha_particao_mantida > 0),
  arquivo_bruto_mantido text NOT NULL,
  linha_bruta_mantida integer NOT NULL CHECK (linha_bruta_mantida > 0),
  hash_linha_bruta text NOT NULL CHECK (length(hash_linha_bruta)=64),
  PRIMARY KEY (run_id,chave_hash)
)`, `CREATE TABLE IF NOT EXISTS ${SCHEMA}.fin_canonical_suppressions (
  run_id text NOT NULL,
  chave_hash text NOT NULL,
  ordem integer NOT NULL CHECK (ordem > 1),
  assinatura_fato text NOT NULL CHECK (length(assinatura_fato)=64),
  particao text NOT NULL,
  linha_particao integer NOT NULL CHECK (linha_particao > 0),
  arquivo_bruto text NOT NULL,
  linha_bruta integer NOT NULL CHECK (linha_bruta > 0),
  hash_linha_bruta text NOT NULL CHECK (length(hash_linha_bruta)=64),
  PRIMARY KEY (run_id,chave_hash,ordem),
  UNIQUE (run_id,particao,linha_particao),
  FOREIGN KEY (run_id,chave_hash) REFERENCES ${SCHEMA}.fin_canonical_groups(run_id,chave_hash) ON DELETE CASCADE
)`, `CREATE OR REPLACE VIEW ${SCHEMA}.fin_canonical_lineage_v1 AS
  SELECT g.run_id,g.chave_hash,g.categoria,g.assinatura_fato,
    g.particao_mantida,g.linha_particao_mantida,
    g.arquivo_bruto_mantido,g.linha_bruta_mantida,g.hash_linha_bruta AS hash_linha_bruta_mantida,
    s.ordem,s.particao AS particao_oculta,s.linha_particao AS linha_particao_oculta,
    s.arquivo_bruto AS arquivo_bruto_oculto,s.linha_bruta AS linha_bruta_oculta,
    s.hash_linha_bruta AS hash_linha_bruta_oculta
  FROM ${SCHEMA}.fin_canonical_groups g
  JOIN ${SCHEMA}.fin_canonical_suppressions s
    ON s.run_id=g.run_id AND s.chave_hash=g.chave_hash`];
const CANONICAL_SCHEMA_SQL = `${CANONICAL_SCHEMA_STATEMENTS.join(';\n')};`;

async function migrar(pool) { for (const sql of CANONICAL_SCHEMA_STATEMENTS) await pool.query(sql); }

function configAmbiente(env = process.env) {
  if (String(env.FINANCE_INV_CVM_CANONICAL || '').toLowerCase() !== 'on') {
    throw new Error('Projeção recusada: defina FINANCE_INV_CVM_CANONICAL=on somente na execução manual.');
  }
  if (String(env.FINANCE_INV_PARSE_WORKER || '').toLowerCase() !== 'off') {
    throw new Error('Projeção recusada: FINANCE_INV_PARSE_WORKER precisa permanecer off.');
  }
  const connectionString = String(env.FINANCE_MARKET_DATABASE_URL || '').trim();
  const configS3 = {
    endpoint: String(env.FINANCE_S3_ENDPOINT || '').trim(), bucket: String(env.FINANCE_S3_BUCKET || '').trim(),
    key: String(env.FINANCE_S3_KEY || '').trim(), secret: String(env.FINANCE_S3_SECRET || '').trim(),
    region: String(env.FINANCE_S3_REGION || 'auto').trim(),
  };
  if (!connectionString) throw new Error('Projeção recusada: PostgreSQL de mercado não configurado.');
  if (!configS3.endpoint || !configS3.bucket || !configS3.key || !configS3.secret) {
    throw new Error('Projeção recusada: R2 não configurado.');
  }
  return { connectionString, configS3 };
}

const chaveOcorrencia = (particao, linha) => JSON.stringify([String(particao || ''), Number(linha || 0)]);

function planejarGrupo(grupo, normalizadas, brutas) {
  const ns = [...normalizadas].sort((a, b) => Number(a.ordem) - Number(b.ordem));
  const bs = [...brutas].sort((a, b) => Number(a.ordem) - Number(b.ordem));
  if (grupo.categoria !== CATEGORIA_PERMITIDA) throw new Error(`Categoria não canônica: ${grupo.categoria}.`);
  if (ns.length !== Number(grupo.ocorrencias) || bs.length !== ns.length || ns.length < 2) {
    throw new Error('Grupo sem proveniência integral ou contagem reconciliada.');
  }
  const assinaturas = new Set([...ns, ...bs].map(x => x.assinatura_fato));
  const hashes = new Set(bs.map(x => x.hash_linha_bruta));
  const arquivos = new Set(bs.map(x => x.arquivo_bruto));
  if (assinaturas.size !== 1 || hashes.size !== 1 || arquivos.size !== 1
      || ns.some((n, i) => n.assinatura_fato !== bs[i].assinatura_fato)) {
    throw new Error('Grupo não é uma repetição integral da mesma linha oficial.');
  }
  const mantida = ns[0], brutoMantido = bs[0];
  const ocultas = ns.slice(1).map((n, i) => ({
    chave_hash: grupo.chave_hash, ordem: Number(n.ordem), assinatura_fato: n.assinatura_fato,
    particao: n.particao, linha_particao: Number(n.linha_particao),
    arquivo_bruto: bs[i + 1].arquivo_bruto, linha_bruta: Number(bs[i + 1].linha_bruta),
    hash_linha_bruta: bs[i + 1].hash_linha_bruta,
  }));
  if (ocultas.length !== Number(grupo.excedentes)) throw new Error('Excedentes do grupo não reconciliaram.');
  return {
    grupo: { chave_hash: grupo.chave_hash, categoria: grupo.categoria, ocorrencias: ns.length,
      ocultas: ocultas.length, assinatura_fato: mantida.assinatura_fato,
      particao_mantida: mantida.particao, linha_particao_mantida: Number(mantida.linha_particao),
      arquivo_bruto_mantido: brutoMantido.arquivo_bruto,
      linha_bruta_mantida: Number(brutoMantido.linha_bruta), hash_linha_bruta: brutoMantido.hash_linha_bruta },
    ocultas,
  };
}

function construirPlano(grupos, ocorrencias) {
  const porGrupo = new Map();
  for (const o of ocorrencias) {
    const e = porGrupo.get(o.chave_hash) || { normalizadas: [], brutas: [] };
    (o.origem === 'normalizado' ? e.normalizadas : e.brutas).push(o); porGrupo.set(o.chave_hash, e);
  }
  const planos = grupos.map(g => {
    const o = porGrupo.get(g.chave_hash) || { normalizadas: [], brutas: [] };
    return planejarGrupo(g, o.normalizadas, o.brutas);
  });
  if (porGrupo.size !== grupos.length) throw new Error('Ocorrências sem grupo correspondente no diagnóstico.');
  const ocultas = planos.flatMap(x => x.ocultas);
  const chaves = new Set();
  for (const o of ocultas) {
    const chave = chaveOcorrencia(o.particao, o.linha_particao);
    if (chaves.has(chave)) throw new Error('Manifesto contém coordenada normalizada repetida.');
    chaves.add(chave);
  }
  return { grupos: planos.map(x => x.grupo), ocultas };
}

function criarManifesto(ocultas) {
  return new Map(ocultas.map(o => [chaveOcorrencia(o.particao, o.linha_particao), o.assinatura_fato]));
}

function avaliarOcorrencia(fato, parte, linha, manifesto) {
  const esperado = manifesto.get(chaveOcorrencia(parte.objeto_chave, linha));
  if (!esperado) return { visivel: true };
  const assinatura = duplicidades.assinaturaFato(fato);
  if (assinatura !== esperado) throw new Error('Manifesto canônico não corresponde ao fato da partição.');
  return { visivel: false, assinatura };
}

async function carregarManifesto(pool, runId = null) {
  let id = runId;
  if (!id) {
    const run = await pool.query(`SELECT id FROM ${SCHEMA}.fin_canonical_runs
      WHERE status='concluida' AND resultado='VALIDADA' ORDER BY concluido_em DESC LIMIT 1`);
    id = run.rows[0]?.id;
  }
  if (!id) throw new Error('Projeção canônica validada não encontrada.');
  const resultado = await pool.query(`SELECT particao,linha_particao,assinatura_fato
    FROM ${SCHEMA}.fin_canonical_suppressions WHERE run_id=$1 ORDER BY particao,linha_particao`, [id]);
  return { runId: id, manifesto: new Map(resultado.rows.map(o => [
    chaveOcorrencia(o.particao, o.linha_particao), o.assinatura_fato,
  ])) };
}

async function percorrerVisaoCanonica(partes, configS3, manifesto, callback = async () => {},
  fetchImpl = global.fetch, storage = storagePadrao) {
  const encontradas = new Set(); let visiveis = 0, ocultas = 0;
  const registros = await duplicidades.percorrerParticoes(partes, configS3, async (fato, parte, linha) => {
    const avaliacao = avaliarOcorrencia(fato, parte, linha, manifesto);
    if (avaliacao.visivel) { visiveis++; await callback(fato, parte, linha); }
    else { ocultas++; encontradas.add(chaveOcorrencia(parte.objeto_chave, linha)); }
  }, fetchImpl, storage);
  return { registros, visiveis, ocultas, encontradas };
}

async function inserirLotes(client, tabela, colunas, linhas, tamanho = 150) {
  for (let inicio = 0; inicio < linhas.length; inicio += tamanho) {
    const lote = linhas.slice(inicio, inicio + tamanho), params = [];
    const valores = lote.map(l => `(${colunas.map(c => { params.push(l[c]); return `$${params.length}`; }).join(',')})`);
    await client.query(`INSERT INTO ${SCHEMA}.${tabela} (${colunas.join(',')}) VALUES ${valores.join(',')}`, params);
  }
}

async function validarParticoes(partes, plano, configS3, fetchImpl, storage) {
  const manifesto = criarManifesto(plano.ocultas);
  const leitura = await percorrerVisaoCanonica(partes, configS3, manifesto, async () => {}, fetchImpl, storage);
  if (leitura.encontradas.size !== manifesto.size || leitura.ocultas !== plano.ocultas.length) {
    throw new Error('Partições não contêm todas as ocorrências do manifesto canônico.');
  }
  return { registros: leitura.registros, visiveis: leitura.visiveis, ocultas: leitura.ocultas,
    particoes: partes.length,
    invariantes: { valoresPreservados: true, coberturaPreservada: true, balancosPreservados: true,
      prova: 'cada ocorrência oculta possui ocorrência mantida com assinatura integral e proveniência bruta idênticas' } };
}

async function persistir(pool, runId, plano, resumo) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ${SCHEMA}.fin_canonical_suppressions WHERE run_id=$1`, [runId]);
    await client.query(`DELETE FROM ${SCHEMA}.fin_canonical_groups WHERE run_id=$1`, [runId]);
    await inserirLotes(client, 'fin_canonical_groups', ['run_id','chave_hash','categoria','ocorrencias','ocultas',
      'assinatura_fato','particao_mantida','linha_particao_mantida','arquivo_bruto_mantido','linha_bruta_mantida',
      'hash_linha_bruta'], plano.grupos.map(g => ({ run_id: runId, ...g })), 100);
    await inserirLotes(client, 'fin_canonical_suppressions', ['run_id','chave_hash','ordem','assinatura_fato',
      'particao','linha_particao','arquivo_bruto','linha_bruta','hash_linha_bruta'],
    plano.ocultas.map(o => ({ run_id: runId, ...o })), 150);
    await client.query(`UPDATE ${SCHEMA}.fin_canonical_runs SET status='concluida',resultado='VALIDADA',
      resumo=$2::jsonb,erro='',concluido_em=now(),atualizado_em=now() WHERE id=$1`, [runId, JSON.stringify(resumo)]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function executar({ env = process.env, fetchImpl = global.fetch, storage = storagePadrao,
  PoolClass = Pool, logger = console } = {}) {
  const inicio = Date.now(), { connectionString, configS3 } = configAmbiente(env);
  let admin, lock, pool, runId = '';
  try {
    const saude = await preflight.executar({ configS3, postgresOpts: { connectionString }, r2Opts: { fetchImpl, storage } });
    if (!saude.ok) throw new Error(`Preflight reprovado: postgres=${saude.postgres.categoria}; r2=${saude.r2.categoria}.`);
    admin = new PoolClass({ connectionString, max: 1 }); lock = await admin.connect();
    const trava = await lock.query("SELECT pg_try_advisory_lock(hashtext('finance-market-canonical-cvm-dfp-2025')) AS locked");
    if (!trava.rows[0]?.locked) throw new Error('Já existe projeção canônica CVM em execução.');
    await lock.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    pool = new PoolClass({ connectionString, max: 2 }); await migrar(pool);
    const fonteR = await pool.query(`SELECT d.id duplicate_run_id,d.job_id,d.quality_run_id,d.parser_versao,
      d.diagnostico_versao,d.fonte_sha256,d.particoes_sha256,d.resumo,j.sha256
      FROM ${SCHEMA}.fin_quality_duplicate_runs d
      JOIN ${SCHEMA}.fin_quality_runs q ON q.id=d.quality_run_id
      JOIN ${SCHEMA}.fin_market_jobs j ON j.id=d.job_id
      WHERE d.status='concluida' AND d.resultado='DECOMPOSTO' AND q.resultado='ATENCAO'
        AND d.parser_versao=$1 ORDER BY d.concluido_em DESC LIMIT 1`, [parser.PARSER_VERSAO]);
    const fonte = fonteR.rows[0]; if (!fonte) throw new Error('Diagnóstico de duplicidades aprovado não encontrado.');
    const partesR = await pool.query(`SELECT sequencia,objeto_chave,sha256,registros
      FROM ${SCHEMA}.fin_market_particoes WHERE job_id=$1 AND parser_versao=$2 ORDER BY sequencia`,
    [fonte.job_id, parser.PARSER_VERSAO]);
    const partes = partesR.rows;
    const particoesSha = duplicidades.hashTexto(partes.map(p => `${p.sequencia}:${p.sha256}:${p.registros}`).join('|'));
    if (particoesSha !== fonte.particoes_sha256 || fonte.sha256 !== fonte.fonte_sha256) {
      throw new Error('Fonte ou catálogo de partições divergiu do diagnóstico de duplicidades.');
    }
    const chave = `${fonte.job_id}|quality-${fonte.quality_run_id}|duplicates-${fonte.duplicate_run_id}`
      + `|parser-${parser.PARSER_VERSAO}|canonical-${REGRA_VERSAO}|raw-${fonte.fonte_sha256}|parts-${particoesSha}`;
    runId = `canonical-cvm-${duplicidades.hashTexto(chave).slice(0, 32)}`;
    const anterior = await pool.query(`SELECT status,resultado,resumo FROM ${SCHEMA}.fin_canonical_runs
      WHERE chave_idempotencia=$1`, [chave]);
    if (anterior.rows[0]?.status === 'concluida') {
      const r = anterior.rows[0].resumo || {};
      logger.log(`[finance-market-canonical-cvm] OK idempotente=sim resultado=${anterior.rows[0].resultado} visiveis=${r.visiveis || 0} ocultas=${r.ocultas || 0} grupos=${r.grupos || 0}`);
      return { ok: true, idempotente: true, resultado: anterior.rows[0].resultado, ...r };
    }
    if (anterior.rows[0]) {
      await pool.query(`UPDATE ${SCHEMA}.fin_canonical_runs SET status='processando',resultado='',
        resumo='{}'::jsonb,erro='',atualizado_em=now() WHERE id=$1`, [runId]);
      logger.log('[finance-market-canonical-cvm] RETOMADA tentativa anterior interrompida.');
    } else {
      await pool.query(`INSERT INTO ${SCHEMA}.fin_canonical_runs
        (id,job_id,quality_run_id,duplicate_run_id,parser_versao,regra_versao,fonte_sha256,
         particoes_sha256,chave_idempotencia,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'processando')`,
      [runId, fonte.job_id, fonte.quality_run_id, fonte.duplicate_run_id, parser.PARSER_VERSAO,
        REGRA_VERSAO, fonte.fonte_sha256, particoesSha, chave]);
    }
    const gruposR = await pool.query(`SELECT chave_hash,categoria,ocorrencias,excedentes
      FROM ${SCHEMA}.fin_quality_duplicate_groups WHERE run_id=$1 ORDER BY chave_hash`, [fonte.duplicate_run_id]);
    const ocorrenciasR = await pool.query(`SELECT chave_hash,origem,ordem,assinatura_fato,particao,
      linha_particao,arquivo_bruto,linha_bruta,hash_linha_bruta
      FROM ${SCHEMA}.fin_quality_duplicate_occurrences WHERE run_id=$1
      ORDER BY chave_hash,origem,ordem`, [fonte.duplicate_run_id]);
    const plano = construirPlano(gruposR.rows, ocorrenciasR.rows);
    const validacao = await validarParticoes(partes, plano, configS3, fetchImpl, storage);
    const esperado = fonte.resumo || {};
    if (validacao.registros !== Number(esperado.registros) || plano.grupos.length !== Number(esperado.grupos)
        || validacao.ocultas !== Number(esperado.excedentes)
        || validacao.visiveis !== validacao.registros - validacao.ocultas) {
      throw new Error('Totais da projeção canônica não reconciliaram o diagnóstico aprovado.');
    }
    const resumo = { registros: validacao.registros, visiveis: validacao.visiveis,
      ocultas: validacao.ocultas, grupos: plano.grupos.length, particoes: validacao.particoes,
      regraVersao: REGRA_VERSAO, diagnosticoVersao: Number(fonte.diagnostico_versao),
      invariantes: validacao.invariantes, brutoIntacto: true, particoesIntactas: true,
      ativadaParaDecisao: false };
    await persistir(pool, runId, plano, resumo);
    logger.log(`[finance-market-canonical-cvm] OK idempotente=nao resultado=VALIDADA duracao=${Date.now() - inicio}ms registros=${resumo.registros} visiveis=${resumo.visiveis} ocultas=${resumo.ocultas} grupos=${resumo.grupos} particoes=${resumo.particoes}`);
    return { ok: true, idempotente: false, resultado: 'VALIDADA', ...resumo };
  } catch (e) {
    if (pool && runId) try { await pool.query(`UPDATE ${SCHEMA}.fin_canonical_runs SET status='falhou',
      erro=$2,atualizado_em=now() WHERE id=$1 AND status='processando'`, [runId, String(e.message || e).slice(0, 1000)]); } catch { /* erro original */ }
    throw e;
  } finally {
    if (pool) try { await pool.end(); } catch { /* noop */ }
    if (lock) { try { await lock.query("SELECT pg_advisory_unlock(hashtext('finance-market-canonical-cvm-dfp-2025'))"); } catch { /* noop */ }
      try { lock.release(); } catch { /* noop */ } }
    if (admin) try { await admin.end(); } catch { /* noop */ }
  }
}

if (require.main === module) executar().catch(e => {
  console.error(`[finance-market-canonical-cvm] FALHA ${String(e?.message || e).slice(0, 500)}`); process.exitCode = 1;
});

module.exports = { REGRA_VERSAO, SCHEMA, CATEGORIA_PERMITIDA, CANONICAL_SCHEMA_STATEMENTS,
  CANONICAL_SCHEMA_SQL, migrar, configAmbiente, chaveOcorrencia, planejarGrupo, construirPlano,
  criarManifesto, avaliarOcorrencia, carregarManifesto, percorrerVisaoCanonica, validarParticoes,
  persistir, executar };
