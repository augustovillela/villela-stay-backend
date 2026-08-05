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
function presignS3(cfg, metodo, chave, segundos, { mime } = {}) {
  const url = new URL(cfg.endpoint);
  const host = url.host;
  const caminho = `/${cfg.bucket}/${String(chave).split('/').map(encodeURIComponent).join('/')}`;
  const agora = new Date();
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
  const query = q.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join('&');
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

module.exports = { presignS3, s3Put, s3Existe };
