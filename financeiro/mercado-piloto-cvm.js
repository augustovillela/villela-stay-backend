// =====================================================================
// Piloto real e manual da DFP 2025 da CVM em quarentena persistente.
//
// Execução: FINANCE_INV_CVM_PILOT=on npm run finance:market-pilot-cvm
// Não ativa fonte, parser residente, recomendação ou operação financeira.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Transform, Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { Pool } = require('pg');
const storagePadrao = require('../storage-s3');
const preflight = require('./mercado-preflight');
const mercadoDbModulo = require('./investimentos-mercado-db');
const mercadoWorker = require('./mercado-worker');
const mercadoParser = require('./investimentos-parser');

const FONTE_URL = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_2025.zip';
const CONJUNTO = 'cvm_dfp_2025';
const SCHEMA = 'fin_pilot_cvm_dfp_2025';
const PREFIXO_RAIZ = 'financeiro/investimentos/__pilot__/cvm/dfp/2025/';
const LIMITE_COMPACTADO = 32 * 1024 * 1024;
const TAMANHO_PARTE = 8 * 1024 * 1024;
const TIMEOUT_CABECALHO_MS = 12_000;
const TIMEOUT_DOWNLOAD_MS = 180_000;
const HASH_RE = /^[a-f0-9]{64}$/;
const VERSAO_RE = /^[a-f0-9]{64}$/;

function configAmbiente(env = process.env) {
  if (String(env.FINANCE_INV_CVM_PILOT || '').toLowerCase() !== 'on') {
    throw new Error('Piloto recusado: defina FINANCE_INV_CVM_PILOT=on somente na execução manual.');
  }
  if (String(env.FINANCE_INV_PARSE_WORKER || '').toLowerCase() !== 'off') {
    throw new Error('Piloto recusado: FINANCE_INV_PARSE_WORKER precisa permanecer off.');
  }
  const connectionString = String(env.FINANCE_MARKET_DATABASE_URL || '').trim();
  const configS3 = {
    endpoint: String(env.FINANCE_S3_ENDPOINT || '').trim(),
    bucket: String(env.FINANCE_S3_BUCKET || '').trim(),
    key: String(env.FINANCE_S3_KEY || '').trim(),
    secret: String(env.FINANCE_S3_SECRET || '').trim(),
    region: String(env.FINANCE_S3_REGION || 'auto').trim(),
  };
  if (!connectionString) throw new Error('Piloto recusado: PostgreSQL de mercado não configurado.');
  if (!configS3.endpoint || !configS3.bucket || !configS3.key || !configS3.secret) {
    throw new Error('Piloto recusado: R2 não configurado.');
  }
  return { connectionString, configS3 };
}

function validarMeta(meta) {
  if (!meta || !Number.isSafeInteger(meta.tamanhoBytes) || meta.tamanhoBytes <= 0) {
    throw new Error('CVM não informou tamanho confiável para a DFP 2025.');
  }
  if (meta.tamanhoBytes > LIMITE_COMPACTADO) {
    throw new Error(`Piloto recusado: DFP 2025 excede o limite de ${LIMITE_COMPACTADO} bytes.`);
  }
  if (!String(meta.etag || '').trim() || !String(meta.ultimaModificacao || '').trim()) {
    throw new Error('CVM não informou ETag e última modificação para a DFP 2025.');
  }
  if (!/(zip|octet-stream)/i.test(String(meta.contentType || ''))) {
    throw new Error('CVM devolveu tipo de conteúdo incompatível com ZIP.');
  }
  return true;
}

function versaoOrigem(meta) {
  validarMeta(meta);
  return crypto.createHash('sha256').update([
    FONTE_URL, meta.etag, meta.ultimaModificacao, meta.tamanhoBytes,
  ].join('|')).digest('hex');
}

function planoVersao(sha256) {
  if (!HASH_RE.test(String(sha256 || ''))) throw new Error('SHA-256 do piloto inválido.');
  const prefixo = `${PREFIXO_RAIZ}${sha256}/`;
  return {
    prefixo,
    prefixoNormalizado: `${prefixo}normalizado/`,
    objetoBruto: `${prefixo}raw/dfp_cia_aberta_2025.zip`,
  };
}

function diretorioTrabalho(baseInformada, versao) {
  if (!VERSAO_RE.test(String(versao || ''))) throw new Error('Versão do staging do piloto inválida.');
  const base = path.resolve(String(baseInformada || os.tmpdir()));
  if (base === path.parse(base).root) throw new Error('Staging do piloto recusado: diretório-base amplo demais.');
  const nome = `fin-pilot-cvm-dfp-2025-${versao.slice(0, 16)}`;
  const destino = path.resolve(base, nome);
  if (path.dirname(destino) !== base || path.basename(destino) !== nome) {
    throw new Error('Staging do piloto recusado: destino fora do diretório-base.');
  }
  return destino;
}

async function sondarFonte(fetchImpl = global.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_CABECALHO_MS);
  try {
    const r = await fetchImpl(new URL(FONTE_URL), {
      method: 'HEAD', redirect: 'manual', signal: controller.signal,
      headers: { accept: 'application/zip', 'user-agent': 'VillelaFinance/0.1' },
    });
    if (r.status >= 300 && r.status < 400) throw new Error('CVM tentou redirecionar a DFP 2025.');
    if (!r.ok) throw new Error(`CVM recusou o inventário da DFP 2025 (HTTP ${r.status}).`);
    const meta = {
      tamanhoBytes: Number(r.headers.get('content-length')),
      etag: String(r.headers.get('etag') || ''),
      ultimaModificacao: String(r.headers.get('last-modified') || ''),
      contentType: String(r.headers.get('content-type') || ''),
    };
    validarMeta(meta);
    return meta;
  } finally { clearTimeout(timer); }
}

function conferirRespostaFonte(r, meta) {
  if (!r || !r.ok || r.status !== 200 || !r.body) {
    throw new Error(`CVM recusou o download da DFP 2025 (HTTP ${r && r.status || 0}).`);
  }
  const etag = String(r.headers.get('etag') || '');
  const modificacao = String(r.headers.get('last-modified') || '');
  if (etag !== meta.etag || modificacao !== meta.ultimaModificacao) {
    throw new Error('A versão da DFP 2025 mudou entre inventário e download.');
  }
}

async function baixarFonte(meta, destino, fetchImpl = global.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_DOWNLOAD_MS);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  try {
    const r = await fetchImpl(new URL(FONTE_URL), {
      method: 'GET', redirect: 'manual', signal: controller.signal,
      headers: { accept: 'application/zip', 'user-agent': 'VillelaFinance/0.1' },
    });
    conferirRespostaFonte(r, meta);
    const medidor = new Transform({
      transform(chunk, _enc, cb) {
        bytes += chunk.length;
        if (bytes > meta.tamanhoBytes || bytes > LIMITE_COMPACTADO) {
          cb(new Error('Download da DFP 2025 excedeu o tamanho inventariado.')); return;
        }
        hash.update(chunk); cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(r.body), medidor, fs.createWriteStream(destino, { flags: 'wx' }));
    if (bytes !== meta.tamanhoBytes) throw new Error('Download da DFP 2025 terminou com tamanho divergente.');
    return { bytes, sha256: hash.digest('hex') };
  } catch (e) {
    try { fs.unlinkSync(destino); } catch { /* staging incompleto pode não existir */ }
    throw e;
  } finally { clearTimeout(timer); }
}

async function enviarMultipart(config, chave, arquivo, tamanhoEsperado,
  storage = storagePadrao, fetchImpl = global.fetch) {
  if (!String(chave).startsWith(PREFIXO_RAIZ)) throw new Error('Upload recusado fora da quarentena CVM.');
  let uploadId = '';
  let concluido = false;
  const partes = [];
  const handle = await fs.promises.open(arquivo, 'r');
  try {
    uploadId = (await storage.s3MultipartIniciar(config, chave, 'application/zip', fetchImpl)).uploadId;
    let posicao = 0;
    let numero = 1;
    while (posicao < tamanhoEsperado) {
      const desejado = Math.min(TAMANHO_PARTE, tamanhoEsperado - posicao);
      const buffer = Buffer.allocUnsafe(desejado);
      let preenchido = 0;
      while (preenchido < desejado) {
        const lido = await handle.read(buffer, preenchido, desejado - preenchido, posicao + preenchido);
        if (!lido.bytesRead) throw new Error('Staging terminou antes do tamanho inventariado.');
        preenchido += lido.bytesRead;
      }
      const parte = await storage.s3MultipartParte(config, chave, uploadId, numero, buffer, fetchImpl);
      partes.push({ numero, etag: parte.etag });
      posicao += desejado; numero++;
    }
    await storage.s3MultipartCompletar(config, chave, uploadId, partes, fetchImpl);
    concluido = true;
    const remoto = await storage.s3Existe(config, chave);
    if (!remoto || Number(remoto.tamanho) !== tamanhoEsperado) {
      throw new Error('Objeto bruto da quarentena ficou com tamanho divergente.');
    }
    return { partes: partes.length, bytes: tamanhoEsperado };
  } catch (e) {
    if (uploadId && !concluido) {
      try { await storage.s3MultipartAbortar(config, chave, uploadId, fetchImpl); } catch { /* erro original prevalece */ }
    }
    throw e;
  } finally { await handle.close(); }
}

async function resumoBanco(pool, jobId, tenantRef, prefixo) {
  const [job, entradas, identidades, partes] = await Promise.all([
    pool.query('SELECT status, resumo, objeto_chave FROM fin_market_jobs WHERE id=$1', [jobId]),
    pool.query(`SELECT count(*)::int AS total, COALESCE(sum(registros),0)::bigint AS registros
      FROM fin_market_entradas WHERE job_id=$1`, [jobId]),
    pool.query('SELECT count(*)::int AS total FROM fin_market_identidades WHERE tenant_ref=$1', [tenantRef]),
    pool.query(`SELECT objeto_chave, sha256, registros, periodo_min, periodo_max, taxonomias
      FROM fin_market_particoes WHERE job_id=$1 ORDER BY sequencia`, [jobId]),
  ]);
  if (job.rows[0]?.status !== 'concluida' || !partes.rows.length) {
    throw new Error('Piloto não concluiu o catálogo técnico esperado.');
  }
  if (!String(job.rows[0].objeto_chave).startsWith(prefixo)
      || partes.rows.some(p => !String(p.objeto_chave).startsWith(`${prefixo}normalizado/`))) {
    throw new Error('Piloto gravou objeto fora da quarentena aprovada.');
  }
  const periodos = partes.rows.flatMap(p => [p.periodo_min, p.periodo_max]).filter(Boolean).sort();
  const taxonomias = [...new Set(partes.rows.flatMap(p => Array.isArray(p.taxonomias) ? p.taxonomias : []))].sort();
  const resumoJob = job.rows[0].resumo && typeof job.rows[0].resumo === 'object' ? job.rows[0].resumo : {};
  return {
    registros: Number(entradas.rows[0].registros), entradas: Number(entradas.rows[0].total),
    identidades: Number(identidades.rows[0].total), particoes: partes.rows.length,
    ignoradas: Number(resumoJob.ignoradas || 0),
    periodoMin: periodos[0] || '', periodoMax: periodos.at(-1) || '', taxonomias,
    particaoSha: String(partes.rows[0].sha256 || '').slice(0, 12),
  };
}

async function verificarParticoes(config, pool, jobId, prefixo,
  fetchImpl = global.fetch, storage = storagePadrao) {
  const r = await pool.query(`SELECT objeto_chave, sha256, registros
    FROM fin_market_particoes WHERE job_id=$1 ORDER BY sequencia`, [jobId]);
  let verificadas = 0;
  for (const parte of r.rows) {
    if (!String(parte.objeto_chave).startsWith(`${prefixo}normalizado/`)) {
      throw new Error('Partição fora da quarentena aprovada.');
    }
    const resposta = await fetchImpl(storage.presignS3(config, 'GET', parte.objeto_chave, 900), {
      method: 'GET', redirect: 'manual',
    });
    if (!resposta.ok) throw new Error(`R2 recusou verificação de partição (HTTP ${resposta.status}).`);
    const conteudo = Buffer.from(await resposta.arrayBuffer());
    const hash = crypto.createHash('sha256').update(conteudo).digest('hex');
    const linhas = conteudo.length ? conteudo.toString('utf8').trimEnd().split('\n').length : 0;
    if (hash !== parte.sha256 || linhas !== Number(parte.registros)) {
      throw new Error('Hash ou contagem de partição da quarentena divergiu.');
    }
    verificadas++;
  }
  return verificadas;
}

async function executar({ env = process.env, fetchImpl = global.fetch, storage = storagePadrao,
  PoolClass = Pool, logger = console } = {}) {
  const inicio = Date.now();
  const { connectionString, configS3 } = configAmbiente(env);
  const anteriorPrefixo = process.env.FINANCE_INV_NORM_PREFIXO;
  let admin;
  let lock;
  let pool;
  let workDir = '';
  let workVersao = '';
  try {
    process.env.FINANCE_INV_NORM_PREFIXO = `${PREFIXO_RAIZ}__preflight__/`;
    const saude = await preflight.executar({
      configS3, postgresOpts: { connectionString }, r2Opts: { fetchImpl, storage },
    });
    if (!saude.ok) throw new Error(`Preflight do piloto reprovado: postgres=${saude.postgres.categoria}; r2=${saude.r2.categoria}.`);

    const meta = await sondarFonte(fetchImpl);
    const versao = versaoOrigem(meta);
    workVersao = versao;
    workDir = diretorioTrabalho(env.FINANCE_INV_WORK_DIR, versao);
    admin = new PoolClass({ connectionString, max: 1 });
    lock = await admin.connect();
    const trava = await lock.query("SELECT pg_try_advisory_lock(hashtext('finance-market-pilot-cvm-dfp-2025')) AS locked");
    if (!trava.rows[0]?.locked) throw new Error('Já existe um piloto CVM DFP 2025 em execução.');
    await lock.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
    pool = new PoolClass({ connectionString, max: 1 });
    await pool.query(`SET search_path TO ${SCHEMA}`);
    const db = new mercadoDbModulo.MercadoDb({ pool });
    await db.migrar();

    const chaveIdempotencia = `cvm-dfp-2025:${versao}:parser-${mercadoParser.PARSER_VERSAO}`;
    const existente = await pool.query('SELECT * FROM fin_market_jobs WHERE chave_idempotencia=$1', [chaveIdempotencia]);
    if (existente.rows[0]) {
      if (existente.rows[0].status !== 'concluida') {
        throw new Error('A mesma versão oficial possui tentativa incompleta; revise a quarentena antes de repetir.');
      }
      const objeto = String(existente.rows[0].objeto_chave || '');
      const prefixo = objeto.slice(0, objeto.indexOf('raw/'));
      if (!prefixo.startsWith(PREFIXO_RAIZ) || !objeto.startsWith(prefixo)) throw new Error('Job idempotente fora da quarentena.');
      const remoto = await storage.s3Existe(configS3, objeto);
      if (!remoto || Number(remoto.tamanho) !== Number(existente.rows[0].tamanho_bytes)) {
        throw new Error('Versão idempotente perdeu o objeto bruto; promoção recusada.');
      }
      const resumo = await resumoBanco(pool, existente.rows[0].id, existente.rows[0].tenant_ref, prefixo);
      await verificarParticoes(configS3, pool, existente.rows[0].id, prefixo, fetchImpl, storage);
      logger.log(`[finance-market-pilot-cvm] OK idempotente=sim versao=${versao.slice(0, 12)} registros=${resumo.registros} identidades=${resumo.identidades} particoes=${resumo.particoes}`);
      return { ok: true, idempotente: true, versao: versao.slice(0, 12), ...resumo };
    }
    const incompleto = await pool.query("SELECT id FROM fin_market_jobs WHERE status IN ('aguardando','processando') LIMIT 1");
    if (incompleto.rows[0]) {
      throw new Error('Existe tentativa anterior incompleta na quarentena; revise-a antes de uma nova versão.');
    }

    fs.mkdirSync(workDir, { recursive: true });
    const arquivo = path.join(workDir, 'origem.zip');
    const download = await baixarFonte(meta, arquivo, fetchImpl);
    const plano = planoVersao(download.sha256);
    const existenteR2 = await storage.s3Existe(configS3, plano.objetoBruto);
    if (existenteR2 && Number(existenteR2.tamanho) !== download.bytes) {
      throw new Error('Objeto já existente na quarentena tem tamanho divergente.');
    }
    if (!existenteR2) await enviarMultipart(configS3, plano.objetoBruto, arquivo, download.bytes, storage, fetchImpl);

    const jobId = `pilot-cvm-dfp-2025-p${mercadoParser.PARSER_VERSAO}-${versao.slice(0, 24)}`;
    const tenantRef = `pilot:cvm_dfp_2025:p${mercadoParser.PARSER_VERSAO}:${versao}`;
    await db.enfileirar({
      id: jobId, tenantRef, cargaRef: chaveIdempotencia, fonte: 'cvm_dados_abertos',
      conjunto: CONJUNTO, jurisdicao: 'BR', formato: 'zip', objetoChave: plano.objetoBruto,
      tamanhoBytes: download.bytes, sha256: download.sha256, chaveIdempotencia,
    });
    const job = await db.reivindicar(`pilot:${process.pid}`, jobId);
    if (!job || job.id !== jobId) throw new Error('Job real da CVM não foi reivindicado na quarentena.');
    process.env.FINANCE_INV_NORM_PREFIXO = plano.prefixoNormalizado;
    try {
      await mercadoWorker.executarJob(job, {
        db, cfg: configS3, storage, fetchImpl, workDir, limiteLoteBytes: 4 * 1024 * 1024,
      });
    } catch (e) {
      await db.falhar(job.id, e && e.message || e, Boolean(e && e.permanente));
      throw e;
    }
    const resumo = await resumoBanco(pool, jobId, tenantRef, plano.prefixo);
    if (!resumo.registros || !resumo.identidades || !resumo.entradas) {
      throw new Error('Piloto concluiu sem fatos, identidades ou entradas reais.');
    }
    await verificarParticoes(configS3, pool, jobId, plano.prefixo, fetchImpl, storage);
    const resultado = {
      ok: true, idempotente: false, versao: versao.slice(0, 12),
      fonteSha: download.sha256.slice(0, 12), bytes: download.bytes,
      duracao_ms: Date.now() - inicio, ...resumo,
    };
    logger.log(`[finance-market-pilot-cvm] OK idempotente=nao duracao=${resultado.duracao_ms}ms bytes=${resultado.bytes} registros=${resultado.registros} identidades=${resultado.identidades} entradas=${resultado.entradas} ignoradas=${resultado.ignoradas} particoes=${resultado.particoes} periodo=${resultado.periodoMin}..${resultado.periodoMax} taxonomias=${resultado.taxonomias.join(',')} fonte_sha=${resultado.fonteSha} particao_sha=${resultado.particaoSha}`);
    return resultado;
  } finally {
    if (anteriorPrefixo === undefined) delete process.env.FINANCE_INV_NORM_PREFIXO;
    else process.env.FINANCE_INV_NORM_PREFIXO = anteriorPrefixo;
    if (pool) { try { await pool.end(); } catch { /* encerramento não altera o resultado */ } }
    if (lock) {
      try { await lock.query("SELECT pg_advisory_unlock(hashtext('finance-market-pilot-cvm-dfp-2025'))"); } catch { /* conexão pode ter encerrado */ }
      try { lock.release(); } catch { /* conexão pode ter encerrado */ }
    }
    if (admin) { try { await admin.end(); } catch { /* encerramento não altera o resultado */ } }
    if (workDir) {
      try {
        const esperado = diretorioTrabalho(path.dirname(workDir), workVersao);
        if (esperado !== workDir) throw new Error('Destino divergente.');
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        throw new Error(`Piloto reprovado: staging não removido; versão ${workVersao.slice(0, 12)}.`);
      }
    }
  }
}

if (require.main === module) executar().catch(e => {
  console.error(`[finance-market-pilot-cvm] FALHA ${String(e && e.message || e).slice(0, 500)}`);
  process.exitCode = 1;
});

module.exports = {
  FONTE_URL, CONJUNTO, SCHEMA, PREFIXO_RAIZ, LIMITE_COMPACTADO, TAMANHO_PARTE,
  configAmbiente, validarMeta, versaoOrigem, planoVersao, diretorioTrabalho,
  sondarFonte, conferirRespostaFonte, baixarFonte, enviarMultipart, verificarParticoes, executar,
};
