// =====================================================================
// ORIGENA — storage no Cloudflare R2 (ADR-0003). Usa o helper SigV4
// compartilhado do grupo (../storage-s3.js), sem SDK e sem dependência.
//
// REGRA QUE NÃO TEM EXCEÇÃO: nenhum byte de mídia passa pelo processo
// web. Upload e download são SEMPRE por URL assinada por objeto, com
// TTL curto, emitida depois da checagem de permissão. O web só assina.
//
// Layout (docs\origena\ARCHITECTURE.md §9):
//   fam/<family_id>/orig/<media_id>/<sha256>.<ext>   ORIGINAL — imutável
//   fam/<family_id>/der/<media_id>/<derivado_id>.<ext>
//   fam/<family_id>/exp/<export_id>.zip              TTL curto
// =====================================================================
'use strict';
const { presignS3, s3Put, s3Existe } = require('../storage-s3');

const cfg = {
  endpoint: process.env.ORIGENA_S3_ENDPOINT || '',
  bucket: process.env.ORIGENA_S3_BUCKET || '',
  key: process.env.ORIGENA_S3_KEY || '',
  secret: process.env.ORIGENA_S3_SECRET || '',
  region: process.env.ORIGENA_S3_REGION || 'auto',
};

const TTL_LEITURA = Number(process.env.ORIGENA_S3_TTL_GET || 600);   // 10 min
const TTL_ESCRITA = Number(process.env.ORIGENA_S3_TTL_PUT || 900);   // 15 min

const configurado = () => !!(cfg.endpoint && cfg.bucket && cfg.key && cfg.secret);
function exigirConfig() {
  if (!configurado()) throw new Error('Storage da Origena não configurado (ORIGENA_S3_*).');
}

// Ponto NÃO entra: os componentes são uuid, hash e extensão curta, e sem
// ponto é impossível montar `..` — nem como segmento, nem colado.
const limpo = (s) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '');

const chaveOriginal = (familyId, mediaId, sha256, ext) =>
  `fam/${limpo(familyId)}/orig/${limpo(mediaId)}/${limpo(sha256)}${ext ? '.' + limpo(ext) : ''}`;
const chaveDerivado = (familyId, mediaId, derivadoId, ext) =>
  `fam/${limpo(familyId)}/der/${limpo(mediaId)}/${limpo(derivadoId)}${ext ? '.' + limpo(ext) : ''}`;
const chaveExport = (familyId, exportId) =>
  `fam/${limpo(familyId)}/exp/${limpo(exportId)}.zip`;

/** URL para o NAVEGADOR enviar o binário direto ao R2. */
function urlDeEnvio(chave, { segundos = TTL_ESCRITA } = {}) {
  exigirConfig();
  return presignS3(cfg, 'PUT', chave, segundos);
}

/** URL de leitura. Só chamar DEPOIS de podeVer() — aqui não há permissão. */
function urlDeLeitura(chave, { segundos = TTL_LEITURA } = {}) {
  exigirConfig();
  return presignS3(cfg, 'GET', chave, segundos);
}

const enviar = (chave, buffer, mime) => { exigirConfig(); return s3Put(cfg, chave, buffer, mime); };
const existe = (chave) => { exigirConfig(); return s3Existe(cfg, chave); };

async function baixar(chave) {
  const r = await fetch(urlDeLeitura(chave, { segundos: 120 }));
  if (!r.ok) throw new Error(`Storage recusou a leitura (${r.status}).`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * Apagar existe para derivado, exportação e purga de LGPD.
 * ORIGINAL não se apaga por operação normal (ADR-0008): derivado é
 * regenerável, original não é.
 */
async function apagar(chave) {
  exigirConfig();
  if (/\/orig\//.test(chave) && process.env.ORIGENA_PERMITIR_APAGAR_ORIGINAL !== 'sim') {
    throw new Error('Recusado: original é imutável. Apagar só pelo fluxo de purga (LGPD).');
  }
  const r = await fetch(presignS3(cfg, 'DELETE', chave, 120), { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error(`Storage recusou a exclusão (${r.status}).`);
  return true;
}

/**
 * Teste sintético de ponta a ponta: PUT → HEAD → GET assinado → DELETE.
 * Log verde não prova storage — a lição `heartbeat-verde-fonte-caida`.
 */
async function saude() {
  if (!configurado()) return { ok: false, motivo: 'ORIGENA_S3_* não definidas' };
  const chave = `selftest/saude-${Date.now()}.txt`;
  const corpo = Buffer.from('origena');
  const t0 = Date.now();
  try {
    await enviar(chave, corpo, 'text/plain');
    const info = await existe(chave);
    const r = await fetch(urlDeLeitura(chave, { segundos: 60 }));
    const bate = (await r.text()) === 'origena';
    await fetch(presignS3(cfg, 'DELETE', chave, 60), { method: 'DELETE' });
    return { ok: bate && !!info, bucket: cfg.bucket, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, bucket: cfg.bucket, erro: e.message, ms: Date.now() - t0 };
  }
}

module.exports = {
  configurado, urlDeEnvio, urlDeLeitura, enviar, baixar, existe, apagar, saude,
  chaveOriginal, chaveDerivado, chaveExport,
};
