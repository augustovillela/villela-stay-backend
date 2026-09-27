// =====================================================================
// Assinatura AWS SigV4 para storage S3-compatível (Cloudflare R2, AWS,
// Backblaze) — helper COMPARTILHADO entre os produtos, sem SDK.
//
// Funções puras: recebem a config do módulo e devolvem URL/resultado. Cada
// produto define as próprias env (ACADEMY_S3_*, CLOSET_S3_*, ...) e passa
// o objeto de config aqui.
//
// Nota: `academy/storage.js` tem uma cópia própria destas funções (é
// anterior a este arquivo). Quando for mexer no Academy, vale migrar para
// cá — não foi feito agora para não tocar num produto que está no ar.
// =====================================================================
'use strict';
const crypto = require('crypto');

const sha256hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (k, m) => crypto.createHmac('sha256', k).update(m).digest();

// cfg = { endpoint, bucket, key, secret, region }
function presignS3(cfg, metodo, chave, segundos, { mime, query: extras = {}, agora: agoraInformado } = {}) {
  const url = new URL(cfg.endpoint);
  const host = url.host;
  const caminho = `/${cfg.bucket}/${String(chave).split('/').map(encodeURIComponent).join('/')}`;
  const agora = agoraInformado ? new Date(agoraInformado) : new Date();
  const amzDate = agora.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const dataCurta = amzDate.slice(0, 8);
  const escopo = `${dataCurta}/${cfg.region || 'auto'}/s3/aws4_request`;
  const q = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${cfg.key}/${escopo}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(Math.max(1, Math.min(604800, segundos || 600)))],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  for (const [k, v] of Object.entries(extras || {})) {
    if (v !== undefined && v !== null) q.push([String(k), String(v)]);
  }
  const query = q.map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
    .sort(([ak, av], [bk, bv]) => ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0)
    .map(([k, v]) => `${k}=${v}`).join('&');
  const reqCanonica = [metodo, caminho, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const aAssinar = ['AWS4-HMAC-SHA256', amzDate, escopo, sha256hex(reqCanonica)].join('\n');
  const kData = hmac('AWS4' + cfg.secret, dataCurta);
  const kRegiao = hmac(kData, cfg.region || 'auto');
  const kServico = hmac(kRegiao, 's3');
  const kAss = hmac(kServico, 'aws4_request');
  const assinatura = crypto.createHmac('sha256', kAss).update(aAssinar).digest('hex');
  return `${url.protocol}//${host}${caminho}?${query}&X-Amz-Signature=${assinatura}`;
}

async function s3Put(cfg, chave, buffer, mime) {
  const u = presignS3(cfg, 'PUT', chave, 300);
  const r = await fetch(u, { method: 'PUT', headers: { 'Content-Type': mime || 'application/octet-stream' }, body: buffer });
  if (!r.ok) throw new Error(`Storage recusou o upload (${r.status}).`);
  return true;
}

async function s3Existe(cfg, chave) {
  const r = await fetch(presignS3(cfg, 'HEAD', chave, 300), { method: 'HEAD' });
  return r.ok ? { tamanho: parseInt(r.headers.get('content-length'), 10) || 0 } : null;
}

const xmlEsc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const xmlUnesc = (v) => String(v).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tagXml = (xml, tag) => {
  const m = String(xml).match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? xmlUnesc(m[1].trim()) : '';
};

async function s3MultipartIniciar(cfg, chave, mime, fetchImpl = global.fetch) {
  const url = presignS3(cfg, 'POST', chave, 300, { query: { uploads: '' } });
  const r = await fetchImpl(url, {
    method: 'POST', headers: { 'Content-Type': mime || 'application/octet-stream' },
  });
  const corpo = await r.text();
  const uploadId = tagXml(corpo, 'UploadId');
  if (!r.ok || !uploadId) throw new Error(`Storage recusou o início multipart (${r.status}).`);
  return { uploadId };
}

async function s3MultipartParte(cfg, chave, uploadId, numero, buffer, fetchImpl = global.fetch) {
  if (!Number.isInteger(numero) || numero < 1 || numero > 10000) throw new Error('Número de parte S3 inválido.');
  const corpo = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const url = presignS3(cfg, 'PUT', chave, 900, { query: { partNumber: numero, uploadId } });
  const r = await fetchImpl(url, {
    method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(corpo.length) }, body: corpo,
  });
  const etag = String(r.headers.get('etag') || '').trim();
  if (!r.ok || !etag) throw new Error(`Storage recusou a parte multipart (${r.status}).`);
  return { numero, etag };
}

async function s3MultipartCompletar(cfg, chave, uploadId, partes, fetchImpl = global.fetch) {
  if (!Array.isArray(partes) || !partes.length) throw new Error('Conclusão multipart exige partes.');
  if (partes.some((p, i) => !Number.isInteger(p.numero) || p.numero !== i + 1 || !String(p.etag || ''))) {
    throw new Error('Lista de partes multipart inválida.');
  }
  const corpo = '<CompleteMultipartUpload>' + partes.map(p =>
    `<Part><PartNumber>${Number(p.numero)}</PartNumber><ETag>${xmlEsc(p.etag)}</ETag></Part>`
  ).join('') + '</CompleteMultipartUpload>';
  const url = presignS3(cfg, 'POST', chave, 900, { query: { uploadId } });
  const r = await fetchImpl(url, {
    method: 'POST', headers: { 'Content-Type': 'application/xml', 'Content-Length': String(Buffer.byteLength(corpo)) }, body: corpo,
  });
  const resposta = await r.text();
  if (!r.ok || /<Error[ >]/i.test(resposta)) throw new Error(`Storage recusou a conclusão multipart (${r.status}).`);
  return { etag: tagXml(resposta, 'ETag') };
}

async function s3MultipartAbortar(cfg, chave, uploadId, fetchImpl = global.fetch) {
  const url = presignS3(cfg, 'DELETE', chave, 300, { query: { uploadId } });
  const r = await fetchImpl(url, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error(`Storage recusou o cancelamento multipart (${r.status}).`);
  return true;
}

module.exports = {
  presignS3, s3Put, s3Existe, s3MultipartIniciar, s3MultipartParte,
  s3MultipartCompletar, s3MultipartAbortar,
};
