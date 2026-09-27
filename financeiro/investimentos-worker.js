// =====================================================================
// Transferência integral CVM/SEC para o armazenamento bruto.
//
// Não é rota web e nasce desligado. Uma carga só roda com a flag própria,
// acesso privado do CEO e chamada explícita do processo de worker.
// =====================================================================
'use strict';
const crypto = require('crypto');
const repo = require('./repo');
const acesso = require('./investimentos-acesso');
const ingestao = require('./investimentos-ingestao');
const s3Padrao = require('../storage-s3');

const PARTE_MINIMA = 5 * 1024 * 1024;
const PARTE_PADRAO = 16 * 1024 * 1024;
const MAX_PARTES = 10_000;

class ErroWorkerMercado extends Error {
  constructor(msg, { permanente = false } = {}) {
    super(msg);
    this.name = 'ErroWorkerMercado';
    this.permanente = permanente;
  }
}

const ligado = () => String(process.env.FINANCE_INV_BULK_WORKER || '').toLowerCase() === 'on';

function configS3() {
  const cfg = {
    endpoint: String(process.env.FINANCE_S3_ENDPOINT || ''),
    bucket: String(process.env.FINANCE_S3_BUCKET || ''),
    key: String(process.env.FINANCE_S3_KEY || ''),
    secret: String(process.env.FINANCE_S3_SECRET || ''),
    region: String(process.env.FINANCE_S3_REGION || 'auto'),
  };
  return cfg.endpoint && cfg.bucket && cfg.key && cfg.secret ? cfg : null;
}

const parseJson = (v, padrao = {}) => {
  try { return JSON.parse(v || '{}'); } catch { return padrao; }
};

function chaveObjeto(carga) {
  const prefixoBruto = String(process.env.FINANCE_INV_S3_PREFIXO || 'investimentos/mercado/');
  const prefixo = prefixoBruto.replace(/^\/+/, '').replace(/\/*$/, '/');
  const extensao = carga.formato === 'csv' ? 'csv' : 'zip';
  const conjunto = String(carga.conjunto).replace(/[^a-z0-9_-]/gi, '_');
  return `${prefixo}${carga.jurisdicao.toLowerCase()}/${conjunto}/${carga.chave_idempotencia}.${extensao}`;
}

function itemDaCarga(carga) {
  const anoNoNome = Number((String(carga.conjunto).match(/_(\d{4})$/) || [])[1]);
  const ano = Math.max(new Date().getUTCFullYear(), Number.isInteger(anoNoNome) ? anoNoNome : 2011);
  const item = ingestao.plano(ano).find(x => x.chave === carga.conjunto);
  if (!item || item.url !== carga.url || !ingestao.destinoPermitido(item)) {
    throw new ErroWorkerMercado('Carga não corresponde ao catálogo oficial permitido.', { permanente: true });
  }
  return item;
}

function validarIdentidadeResposta(carga, r) {
  const etag = String(r.headers.get('etag') || '');
  const modificacao = String(r.headers.get('last-modified') || '');
  if (carga.etag && etag && carga.etag !== etag) {
    throw new ErroWorkerMercado('ETag da origem mudou durante a carga.', { permanente: true });
  }
  if (carga.ultima_modificacao && modificacao && carga.ultima_modificacao !== modificacao) {
    throw new ErroWorkerMercado('Data de modificação da origem mudou durante a carga.', { permanente: true });
  }
}

async function abrirFaixa(carga, item, inicio, fim, fetchImpl) {
  const faixa = inicio > 0 || fim !== undefined;
  const headers = {
    accept: item.formato === 'zip' ? 'application/zip' : 'text/csv',
    'user-agent': ingestao.userAgent(item),
  };
  if (faixa) headers.range = `bytes=${inicio}-${fim === undefined ? '' : fim}`;
  if (faixa && carga.etag) headers['if-match'] = carga.etag;
  let r;
  try {
    r = await fetchImpl(new URL(carga.url), { method: 'GET', redirect: 'manual', headers });
  } catch (e) {
    throw new ErroWorkerMercado(`Falha transitória ao ler a origem: ${e.message}`);
  }
  if (r.status >= 300 && r.status < 400) {
    throw new ErroWorkerMercado('A origem tentou redirecionar a carga.', { permanente: true });
  }
  if (r.status === 412 || r.status === 416) {
    throw new ErroWorkerMercado('A origem não corresponde mais ao inventário.', { permanente: true });
  }
  if (!r.ok || (faixa && r.status !== 206) || !r.body) {
    throw new ErroWorkerMercado(`Origem recusou a faixa solicitada (HTTP ${r.status}).`, { permanente: faixa });
  }
  if (faixa) {
    const contentRange = String(r.headers.get('content-range') || '');
    const m = contentRange.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
    const esperadoFim = fim === undefined ? carga.tamanho_bytes - 1 : fim;
    if (!m || Number(m[1]) !== inicio || Number(m[2]) !== esperadoFim
        || Number(m[3]) !== carga.tamanho_bytes) {
      throw new ErroWorkerMercado('A origem respondeu uma faixa diferente da solicitada.', { permanente: true });
    }
  }
  validarIdentidadeResposta(carga, r);
  return r;
}

async function consumir(body, onChunk) {
  let total = 0;
  for await (const bruto of body) {
    const chunk = Buffer.from(bruto);
    if (!chunk.length) continue;
    total += chunk.length;
    await onChunk(chunk);
  }
  return total;
}

async function* partes(body, tamanhoParte) {
  let pendente = Buffer.alloc(0);
  for await (const bruto of body) {
    let chunk = Buffer.from(bruto);
    if (!chunk.length) continue;
    if (pendente.length) { chunk = Buffer.concat([pendente, chunk]); pendente = Buffer.alloc(0); }
    let pos = 0;
    while (chunk.length - pos >= tamanhoParte) {
      yield chunk.subarray(pos, pos + tamanhoParte);
      pos += tamanhoParte;
    }
    if (pos < chunk.length) pendente = Buffer.from(chunk.subarray(pos));
  }
  if (pendente.length) yield pendente;
}

function checkpointValido(cp, carga, objeto, tamanhoParte) {
  if (!cp || !cp.uploadId) return false;
  if (cp.objeto !== objeto || cp.etag !== carga.etag
      || cp.ultimaModificacao !== carga.ultima_modificacao || cp.tamanhoBytes !== carga.tamanho_bytes
      || cp.tamanhoParte !== tamanhoParte || !Array.isArray(cp.partes)) return false;
  const ordenadas = [...cp.partes].sort((a, b) => a.numero - b.numero);
  let bytes = 0;
  for (let i = 0; i < ordenadas.length; i++) {
    const p = ordenadas[i];
    if (p.numero !== i + 1 || !p.etag || !Number.isSafeInteger(p.bytes) || p.bytes <= 0) return false;
    bytes += p.bytes;
  }
  return bytes === cp.offset && cp.offset <= carga.tamanho_bytes;
}

async function executarCarga(tenant, usuario, cargaId, opts = {}) {
  if (!ligado()) throw new ErroWorkerMercado('Worker integral desligado.');
  acesso.exigir(tenant, usuario);
  const cfg = opts.configS3 || configS3();
  if (!cfg) throw new ErroWorkerMercado('Armazenamento R2 não configurado.');
  const fetchImpl = opts.fetchImpl || global.fetch;
  const storage = opts.storage || s3Padrao;
  const tamanhoParte = Number(opts.tamanhoParte || PARTE_PADRAO);
  if (!Number.isSafeInteger(tamanhoParte)
      || (tamanhoParte < PARTE_MINIMA && opts.permitirPartePequenaTeste !== true)) {
    throw new ErroWorkerMercado('Tamanho de parte multipart inválido.');
  }

  let carga = repo.cargaMercado(cargaId);
  if (!carga) throw new ErroWorkerMercado('Carga de mercado não encontrada.', { permanente: true });
  if (!['aguardando_capacidade', 'pronta', 'baixando', 'falhou'].includes(carga.status)) {
    throw new ErroWorkerMercado(`Carga no estado ${carga.status} não pode ser transferida.`);
  }
  const item = itemDaCarga(carga);
  const objeto = chaveObjeto(carga);
  let cp = parseJson(carga.checkpoint, {});
  let uploadId = '';

  try {
    if (!checkpointValido(cp, carga, objeto, tamanhoParte)) {
      if (cp.uploadId && cp.objeto) {
        await storage.s3MultipartAbortar(cfg, cp.objeto, cp.uploadId, opts.storageFetchImpl || global.fetch);
      }
      const iniciado = await storage.s3MultipartIniciar(
        cfg, objeto, item.formato === 'zip' ? 'application/zip' : 'text/csv',
        opts.storageFetchImpl || global.fetch);
      uploadId = iniciado.uploadId;
      cp = {
        versao: 1, uploadId, objeto, offset: 0, tamanhoParte, tamanhoBytes: carga.tamanho_bytes,
        etag: carga.etag, ultimaModificacao: carga.ultima_modificacao, partes: [],
      };
    } else uploadId = cp.uploadId;

    carga = repo.atualizarCargaMercado(carga.id, {
      status: 'baixando', checkpoint: cp, objetoRef: `s3://${cfg.bucket}/${objeto}`, erro: '',
    });

    const hash = crypto.createHash('sha256');
    if (cp.offset > 0) {
      const prefixo = await abrirFaixa(carga, item, 0, cp.offset - 1, fetchImpl);
      const lidos = await consumir(prefixo.body, chunk => hash.update(chunk));
      if (lidos !== cp.offset) {
        throw new ErroWorkerMercado('Prefixo da origem não corresponde ao checkpoint.', { permanente: true });
      }
    }

    if (cp.offset < carga.tamanho_bytes) {
      const restante = await abrirFaixa(carga, item, cp.offset, undefined, fetchImpl);
      for await (const parte of partes(restante.body, tamanhoParte)) {
        if (cp.partes.length >= MAX_PARTES) {
          throw new ErroWorkerMercado('Carga excede o limite de 10.000 partes.', { permanente: true });
        }
        hash.update(parte);
        const numero = cp.partes.length + 1;
        const enviada = await storage.s3MultipartParte(
          cfg, objeto, uploadId, numero, parte, opts.storageFetchImpl || global.fetch);
        cp.partes.push({
          numero, etag: enviada.etag, bytes: parte.length,
          sha256: crypto.createHash('sha256').update(parte).digest('hex'),
        });
        cp.offset += parte.length;
        repo.atualizarCargaMercado(carga.id, { status: 'baixando', checkpoint: cp, erro: '' });
      }
    }

    if (cp.offset !== carga.tamanho_bytes) {
      throw new ErroWorkerMercado(
        `Tamanho recebido diverge do inventário (${cp.offset}/${carga.tamanho_bytes}).`, { permanente: true });
    }
    const sha256 = hash.digest('hex');
    repo.atualizarCargaMercado(carga.id, { status: 'validando', checkpoint: cp, sha256, erro: '' });
    await storage.s3MultipartCompletar(cfg, objeto, uploadId, cp.partes, opts.storageFetchImpl || global.fetch);
    const resumoAnterior = parseJson(carga.resumo, {});
    return repo.atualizarCargaMercado(carga.id, {
      status: 'concluida', checkpoint: {}, sha256,
      objetoRef: `s3://${cfg.bucket}/${objeto}`, concluidaEm: new Date().toISOString(), erro: '',
      resumo: { ...resumoAnterior, transferencia: { bytes: cp.offset, partes: cp.partes.length, sha256, verificada: true } },
    });
  } catch (e) {
    const erro = e instanceof Error ? e : new Error(String(e));
    if (erro.permanente && uploadId) {
      try { await storage.s3MultipartAbortar(cfg, objeto, uploadId, opts.storageFetchImpl || global.fetch); } catch { /* mantém o erro original */ }
      repo.atualizarCargaMercado(carga.id, { status: 'falhou', checkpoint: {}, erro: erro.message });
    } else {
      repo.atualizarCargaMercado(carga.id, { status: 'baixando', checkpoint: cp, erro: erro.message });
    }
    throw erro;
  }
}

module.exports = {
  PARTE_MINIMA, PARTE_PADRAO, MAX_PARTES, ErroWorkerMercado,
  ligado, configS3, chaveObjeto, checkpointValido, partes, executarCarga,
};
