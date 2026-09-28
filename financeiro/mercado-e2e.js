// =====================================================================
// Ensaio ponta a ponta, sintético e isolado, do pipeline de mercado.
//
// Execução manual: FINANCE_INV_E2E=on npm run finance:market-e2e
// O parser residente continua desligado. Cada execução usa schema e
// prefixo próprios e remove somente os recursos que ela mesma criou.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Pool } = require('pg');
const storagePadrao = require('../storage-s3');
const preflight = require('./mercado-preflight');
const mercadoDbModulo = require('./investimentos-mercado-db');
const mercadoWorker = require('./mercado-worker');

const ID_RE = /^[a-f0-9]{24}$/;
const SCHEMA_RE = /^fin_e2e_[a-f0-9]{24}$/;
const PREFIXO_RE = /^financeiro\/investimentos\/__e2e__\/[a-f0-9]{24}\/$/;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipArmazenado(arquivos) {
  const locais = [], centrais = [];
  let offset = 0;
  for (const [nomeTexto, conteudoTexto] of arquivos) {
    const nome = Buffer.from(nomeTexto);
    const conteudo = Buffer.from(conteudoTexto);
    const crc = crc32(conteudo);
    const local = Buffer.alloc(30 + nome.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(conteudo.length, 18);
    local.writeUInt32LE(conteudo.length, 22); local.writeUInt16LE(nome.length, 26);
    nome.copy(local, 30); locais.push(local, conteudo);
    const central = Buffer.alloc(46 + nome.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(conteudo.length, 20);
    central.writeUInt32LE(conteudo.length, 24); central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(offset, 42); nome.copy(central, 46); centrais.push(central);
    offset += local.length + conteudo.length;
  }
  const centro = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10); fim.writeUInt32LE(centro.length, 12);
  fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...locais, centro, fim]);
}

function planejar(id = crypto.randomBytes(12).toString('hex')) {
  if (!ID_RE.test(id)) throw new Error('Identificador E2E inválido.');
  const prefixo = `financeiro/investimentos/__e2e__/${id}/`;
  return {
    id, schema: `fin_e2e_${id}`, prefixo,
    prefixoNormalizado: `${prefixo}normalizado/`,
    objetoBruto: `${prefixo}raw/cvm-sintetico.zip`,
    jobId: `e2e-${id}`,
  };
}

function validarAmbiente(env = process.env) {
  if (String(env.FINANCE_INV_E2E || '').toLowerCase() !== 'on') {
    throw new Error('Ensaio recusado: defina FINANCE_INV_E2E=on somente na execução manual.');
  }
  if (String(env.FINANCE_INV_PARSE_WORKER || '').toLowerCase() !== 'off') {
    throw new Error('Ensaio recusado: FINANCE_INV_PARSE_WORKER precisa permanecer off.');
  }
  const connectionString = String(env.FINANCE_MARKET_DATABASE_URL || '').trim();
  const configS3 = {
    endpoint: String(env.FINANCE_S3_ENDPOINT || '').trim(),
    bucket: String(env.FINANCE_S3_BUCKET || '').trim(),
    key: String(env.FINANCE_S3_KEY || '').trim(),
    secret: String(env.FINANCE_S3_SECRET || '').trim(),
    region: String(env.FINANCE_S3_REGION || 'auto').trim(),
  };
  if (!connectionString) throw new Error('Ensaio recusado: PostgreSQL de mercado não configurado.');
  if (!configS3.endpoint || !configS3.bucket || !configS3.key || !configS3.secret) {
    throw new Error('Ensaio recusado: R2 não configurado.');
  }
  return { connectionString, configS3 };
}

function validarPlano(plano) {
  if (!plano || !ID_RE.test(plano.id) || !SCHEMA_RE.test(plano.schema)
      || !PREFIXO_RE.test(plano.prefixo)) throw new Error('Isolamento E2E inválido.');
  for (const chave of [plano.objetoBruto]) {
    if (!String(chave).startsWith(plano.prefixo)) throw new Error('Objeto fora do prefixo E2E.');
  }
  return true;
}

function diretorioTrabalho(baseInformada, schema) {
  if (!SCHEMA_RE.test(schema)) throw new Error('Staging E2E recusado: schema inválido.');
  const base = path.resolve(String(baseInformada || os.tmpdir()));
  if (base === path.parse(base).root) throw new Error('Staging E2E recusado: diretório-base amplo demais.');
  const destino = path.resolve(base, schema);
  if (path.dirname(destino) !== base || path.basename(destino) !== schema) {
    throw new Error('Staging E2E recusado: destino fora do diretório-base.');
  }
  return destino;
}

function zipSintetico() {
  const cab = 'CNPJ_CIA;CD_CVM;DENOM_SOCIAL;DT_REFER;VERSAO;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_INI_EXERC;DT_FIM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA';
  const linha = '00.000.000/0001-00;99999;Companhia Sintetica E2E S.A.;2025-12-31;1;DF Consolidado - Balanco;REAL;UNIDADE;ULTIMO;2025-01-01;2025-12-31;1.01;Ativo sintetico;123456;S';
  return zipArmazenado([['dfp_cia_aberta_BPA_con_2025.csv', `${cab}\n${linha}\n`]]);
}

async function removerObjeto(config, chave, prefixo, fetchImpl = global.fetch, storage = storagePadrao) {
  if (!PREFIXO_RE.test(prefixo) || !String(chave).startsWith(prefixo)) {
    throw new Error('Limpeza recusada: objeto fora do prefixo E2E.');
  }
  const resposta = await fetchImpl(storage.presignS3(config, 'DELETE', chave, 300), {
    method: 'DELETE', redirect: 'manual',
  });
  if (!resposta.ok && resposta.status !== 404) throw new Error(`Limpeza R2 recusada (HTTP ${resposta.status}).`);
}

async function lerObjeto(config, chave, fetchImpl = global.fetch, storage = storagePadrao) {
  const resposta = await fetchImpl(storage.presignS3(config, 'GET', chave, 300), {
    method: 'GET', redirect: 'manual',
  });
  if (!resposta.ok) throw new Error(`Leitura sintética recusada (HTTP ${resposta.status}).`);
  return Buffer.from(await resposta.arrayBuffer());
}

async function executar({ env = process.env, fetchImpl = global.fetch, storage = storagePadrao,
  PoolClass = Pool, logger = console } = {}) {
  const inicio = Date.now();
  const { connectionString, configS3 } = validarAmbiente(env);
  const plano = planejar();
  validarPlano(plano);
  const anteriorPrefixo = process.env.FINANCE_INV_NORM_PREFIXO;
  const workDir = diretorioTrabalho(env.FINANCE_INV_WORK_DIR, plano.schema);
  const objetos = new Set([plano.objetoBruto]);
  const limpeza = [];
  let admin;
  let pool;
  let schemaCriado = false;
  let resultado;
  let falha;
  try {
    process.env.FINANCE_INV_NORM_PREFIXO = plano.prefixoNormalizado;
    const saude = await preflight.executar({ configS3, postgresOpts: { connectionString }, r2Opts: { fetchImpl, storage } });
    if (!saude.ok) throw new Error(`Preflight E2E reprovado: postgres=${saude.postgres.categoria}; r2=${saude.r2.categoria}.`);

    admin = new PoolClass({ connectionString, max: 1 });
    await admin.query(`CREATE SCHEMA ${plano.schema}`);
    schemaCriado = true;
    pool = new PoolClass({ connectionString, max: 1 });
    await pool.query(`SET search_path TO ${plano.schema}`);
    const db = new mercadoDbModulo.MercadoDb({ pool });
    await db.migrar();

    const bruto = zipSintetico();
    const shaBruto = crypto.createHash('sha256').update(bruto).digest('hex');
    await storage.s3Put(configS3, plano.objetoBruto, bruto, 'application/zip');
    await db.enfileirar({
      id: plano.jobId, tenantRef: `e2e:${plano.id}`, cargaRef: `e2e:${plano.id}`,
      fonte: 'sintetica', conjunto: `cvm_e2e_${plano.id}`, jurisdicao: 'BR', formato: 'zip',
      objetoChave: plano.objetoBruto, tamanhoBytes: bruto.length, sha256: shaBruto,
      chaveIdempotencia: `e2e:${plano.id}`,
    });
    const job = await db.reivindicar(`e2e:${process.pid}`);
    if (!job || job.id !== plano.jobId) throw new Error('Job sintético não foi reivindicado no schema isolado.');
    const resumo = await mercadoWorker.executarJob(job, {
      db, cfg: configS3, storage, fetchImpl, workDir, limiteLoteBytes: 64 * 1024,
    });

    const estado = await pool.query('SELECT status, resumo FROM fin_market_jobs WHERE id=$1', [plano.jobId]);
    const partes = await pool.query('SELECT objeto_chave, sha256, registros FROM fin_market_particoes WHERE job_id=$1 ORDER BY sequencia', [plano.jobId]);
    const identidades = await pool.query('SELECT count(*)::int AS total FROM fin_market_identidades');
    if (estado.rows[0]?.status !== 'concluida' || resumo.registros !== 1 || partes.rows.length !== 1
        || Number(partes.rows[0].registros) !== 1 || Number(identidades.rows[0].total) !== 1) {
      throw new Error('Validação final do pipeline sintético divergiu.');
    }
    for (const parte of partes.rows) {
      if (!String(parte.objeto_chave).startsWith(plano.prefixoNormalizado)) {
        throw new Error('Partição sintética saiu do prefixo isolado.');
      }
      objetos.add(parte.objeto_chave);
      const conteudo = await lerObjeto(configS3, parte.objeto_chave, fetchImpl, storage);
      const hash = crypto.createHash('sha256').update(conteudo).digest('hex');
      if (hash !== parte.sha256 || conteudo.toString('utf8').trim().split('\n').length !== 1) {
        throw new Error('Hash ou contagem da partição sintética divergiu.');
      }
    }
    resultado = {
      ok: true, registros: 1, identidades: 1, particoes: 1,
      sha: partes.rows[0].sha256.slice(0, 12), duracao_ms: Date.now() - inicio,
    };
  } catch (e) {
    falha = e;
  } finally {
    if (anteriorPrefixo === undefined) delete process.env.FINANCE_INV_NORM_PREFIXO;
    else process.env.FINANCE_INV_NORM_PREFIXO = anteriorPrefixo;
    if (pool) {
      try {
        const r = await pool.query('SELECT objeto_chave FROM fin_market_particoes');
        for (const item of r.rows) if (String(item.objeto_chave).startsWith(plano.prefixo)) objetos.add(item.objeto_chave);
      } catch { /* o schema pode não ter chegado a ser migrado */ }
    }
    for (const chave of objetos) {
      try { await removerObjeto(configS3, chave, plano.prefixo, fetchImpl, storage); }
      catch (e) { limpeza.push(e.message); }
    }
    if (pool) { try { await pool.end(); } catch (e) { limpeza.push('Falha ao fechar pool E2E.'); } }
    if (schemaCriado && admin) {
      try {
        if (!SCHEMA_RE.test(plano.schema)) throw new Error('Schema E2E inválido.');
        await admin.query(`DROP SCHEMA ${plano.schema} CASCADE`);
      } catch { limpeza.push('Falha ao remover schema E2E.'); }
    }
    if (admin) { try { await admin.end(); } catch { limpeza.push('Falha ao fechar conexão administrativa E2E.'); } }
    try {
      if (diretorioTrabalho(path.dirname(workDir), plano.schema) !== workDir) throw new Error('Destino divergente.');
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch { limpeza.push('Falha ao remover staging E2E.'); }
  }
  if (limpeza.length) throw new Error(`Ensaio reprovado na limpeza (${limpeza.length} falha(s)); referência ${plano.id}.`);
  if (falha) throw falha;
  logger.log(`[finance-market-e2e] OK duracao=${resultado.duracao_ms}ms registros=1 identidades=1 particoes=1 sha=${resultado.sha}`);
  return resultado;
}

if (require.main === module) executar().catch(e => {
  console.error(`[finance-market-e2e] FALHA ${String(e && e.message || e).slice(0, 500)}`);
  process.exitCode = 1;
});

module.exports = {
  ID_RE, SCHEMA_RE, PREFIXO_RE, planejar, validarAmbiente, validarPlano,
  diretorioTrabalho, zipSintetico, removerObjeto, executar,
};
