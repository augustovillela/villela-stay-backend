// =====================================================================
// Villela Academy — camada de STORAGE (FASE 7).
// Driver 'local' (DATA_DIR/academy/arquivos/, padrão) e driver 's3'
// (qualquer S3-compatível: Cloudflare R2, AWS, Backblaze), ativado por
// env — sem SDK, assinatura AWS SigV4 implementada aqui:
//   ACADEMY_S3_ENDPOINT  ex.: https://<accountid>.r2.cloudflarestorage.com
//   ACADEMY_S3_BUCKET    ex.: academy
//   ACADEMY_S3_KEY / ACADEMY_S3_SECRET
//   ACADEMY_S3_REGION    (opcional; 'auto' p/ R2)
// URLs assinadas com expiração nos DOIS drivers: no local via HMAC
// próprio (rota /academy/media-s), no s3 via presigned URL do bucket.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MOD_DIR } = require('./db');

const ARQUIVOS_DIR = path.join(MOD_DIR, 'arquivos');
fs.mkdirSync(ARQUIVOS_DIR, { recursive: true });

let _segredo = 'academy-dev';
function configurar({ segredo } = {}) { if (segredo) _segredo = segredo; }

const s3cfg = () => ({
  endpoint: process.env.ACADEMY_S3_ENDPOINT || '',
  bucket: process.env.ACADEMY_S3_BUCKET || '',
  key: process.env.ACADEMY_S3_KEY || '',
  secret: process.env.ACADEMY_S3_SECRET || '',
  region: process.env.ACADEMY_S3_REGION || 'auto',
});
const s3Ativo = () => { const c = s3cfg(); return !!(c.endpoint && c.bucket && c.key && c.secret); };

// ---------------- assinatura AWS SigV4 (presigned URL, query auth) ----------------
const sha256hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (k, m) => crypto.createHmac('sha256', k).update(m).digest();

// pura e testável: gera URL presignada p/ GET|PUT|HEAD de uma chave no bucket
function presignS3(cfg, metodo, key, segundos, { mime } = {}) {
  const url = new URL(cfg.endpoint);
  const host = url.host;
  const caminho = `/${cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const agora = new Date();
  const amzDate = agora.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const dataCurta = amzDate.slice(0, 8);
  const escopo = `${dataCurta}/${cfg.region}/s3/aws4_request`;
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
  const kRegiao = hmac(kData, cfg.region);
  const kServico = hmac(kRegiao, 's3');
  const kAss = hmac(kServico, 'aws4_request');
  const assinatura = crypto.createHmac('sha256', kAss).update(aAssinar).digest('hex');
  return `${url.protocol}//${host}${caminho}?${query}&X-Amz-Signature=${assinatura}`;
}

// sobe um buffer ao bucket (uploads pequenos server-side quando s3 ativo)
async function s3Put(key, buffer, mime) {
  const u = presignS3(s3cfg(), 'PUT', key, 300);
  const r = await fetch(u, { method: 'PUT', headers: { 'Content-Type': mime || 'application/octet-stream' }, body: buffer });
  if (!r.ok) throw new Error(`Storage S3 recusou o upload (${r.status}).`);
}
// confere se o objeto existe (confirmação do upload direto)
async function s3Existe(key) {
  const u = presignS3(s3cfg(), 'HEAD', key, 300);
  const r = await fetch(u, { method: 'HEAD' });
  return r.ok ? { tamanho: parseInt(r.headers.get('content-length'), 10) || 0 } : null;
}

// ---------------- URL assinada do driver LOCAL (HMAC próprio) ----------------
function assinaturaLocal(mediaId, uid, expEpoch) {
  return crypto.createHmac('sha256', _segredo).update(`${mediaId}.${uid}.${expEpoch}`).digest('base64url');
}
function urlLocalAssinada(mediaId, uid, segundos) {
  const e = Math.floor(Date.now() / 1000) + Math.max(30, Math.min(86400, segundos || 600));
  return { url: `/academy/media-s/${mediaId}?u=${encodeURIComponent(uid)}&e=${e}&s=${assinaturaLocal(mediaId, uid, e)}`, expira_epoch: e };
}
function validarLocalAssinada(mediaId, { u, e, s } = {}) {
  const exp = parseInt(e, 10);
  if (!exp || exp < Math.floor(Date.now() / 1000)) return null;
  const esperada = assinaturaLocal(mediaId, String(u || ''), exp);
  try { if (!crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(String(s || '')))) return null; } catch (_) { return null; }
  return { uid: String(u || '') };
}

// ---------------- driver unificado ----------------
function salvarLocal(rel, buffer) { fs.writeFileSync(path.join(ARQUIVOS_DIR, rel), buffer); }
async function salvar(rel, buffer, mime) {
  if (s3Ativo()) { await s3Put(rel, buffer, mime); return 's3'; }
  salvarLocal(rel, buffer); return 'local';
}
function caminhoLocal(rel) { return path.join(ARQUIVOS_DIR, rel); }
// URL temporária de leitura p/ um media já autorizado
function urlDeLeitura(media, uid, segundos) {
  if (media.storage === 's3' && s3Ativo()) {
    const seg = Math.max(30, Math.min(86400, segundos || 600));
    return { url: presignS3(s3cfg(), 'GET', media.file_path, seg), expira_epoch: Math.floor(Date.now() / 1000) + seg };
  }
  return urlLocalAssinada(media.id, uid, segundos);
}

module.exports = {
  configurar, s3Ativo, s3cfg, presignS3, s3Put, s3Existe,
  salvar, caminhoLocal, urlDeLeitura, validarLocalAssinada, ARQUIVOS_DIR,
};
