// =====================================================================
// Musique — STORAGE (ADR-0003). Áudio NUNCA no disco do Render: o disco
// é de 1 GB e é compartilhado por 15 produtos.
//
// Driver 's3' (Cloudflare R2 / AWS / Backblaze), ligado por env:
//   MUSIC_S3_ENDPOINT  https://<accountid>.r2.cloudflarestorage.com
//   MUSIC_S3_BUCKET    villela-music
//   MUSIC_S3_KEY / MUSIC_S3_SECRET
//   MUSIC_S3_REGION    (opcional; 'auto' p/ R2)
// Sem SDK: SigV4 assinado aqui, mesmo código já provado no academy.
//
// O DESENHO QUE IMPORTA: o byte NÃO passa pelo processo web. O cliente
// pede uma URL presignada de PUT, sobe DIRETO no bucket, e depois
// confirma. É o que corrige o débito M-02 (base64 de 10 MB na memória do
// web) e o que permite gravação de estudo de verdade.
//
// Sem as envs o módulo sobe assim mesmo e DIZ no log o que falta —
// upload fica indisponível, e a rota devolve motivo, não erro genérico.
// =====================================================================
'use strict';
const crypto = require('crypto');

let _segredo = 'music-dev';
function configurar({ segredo } = {}) { if (segredo) _segredo = segredo; }

const cfg = () => ({
  endpoint: process.env.MUSIC_S3_ENDPOINT || '',
  bucket: process.env.MUSIC_S3_BUCKET || '',
  key: process.env.MUSIC_S3_KEY || '',
  secret: process.env.MUSIC_S3_SECRET || '',
  region: process.env.MUSIC_S3_REGION || 'auto',
  prefixo: process.env.MUSIC_S3_PREFIXO || '',
});
const ativo = () => { const c = cfg(); return !!(c.endpoint && c.bucket && c.key && c.secret); };
const faltando = () => ['MUSIC_S3_ENDPOINT', 'MUSIC_S3_BUCKET', 'MUSIC_S3_KEY', 'MUSIC_S3_SECRET']
  .filter((k) => !process.env[k]);

// ---------------- assinatura AWS SigV4 (presigned URL, query auth) ----------------
const sha256hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (k, m) => crypto.createHmac('sha256', k).update(m).digest();

/** Pura e testável: URL presignada para GET|PUT|HEAD de uma chave. */
function presign(c, metodo, key, segundos) {
  const url = new URL(c.endpoint);
  const host = url.host;
  const caminho = `/${c.bucket}/${String(key).split('/').map(encodeURIComponent).join('/')}`;
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const dataCurta = amzDate.slice(0, 8);
  const escopo = `${dataCurta}/${c.region}/s3/aws4_request`;
  const q = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${c.key}/${escopo}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(Math.max(1, Math.min(604800, segundos || 600)))],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  const query = q.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join('&');
  const reqCanonica = [metodo, caminho, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const aAssinar = ['AWS4-HMAC-SHA256', amzDate, escopo, sha256hex(reqCanonica)].join('\n');
  const kData = hmac('AWS4' + c.secret, dataCurta);
  const kRegiao = hmac(kData, c.region);
  const kServico = hmac(kRegiao, 's3');
  const kAss = hmac(kServico, 'aws4_request');
  const assinatura = crypto.createHmac('sha256', kAss).update(aAssinar).digest('hex');
  return `${url.protocol}//${host}${caminho}?${query}&X-Amz-Signature=${assinatura}`;
}

/** Chave no bucket. Namespace por dono para que uma listagem acidental
 *  não misture acervo de gente diferente. */
function chaveDe({ dono, tipo = 'originais', id, ext = 'bin' }) {
  const limpo = String(dono || 'anon').replace(/[^A-Za-z0-9_-]/g, '');
  return `${cfg().prefixo}${tipo}/${limpo}/${id}.${String(ext).replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'}`;
}

const urlDeUpload = (key, segundos = 900) => presign(cfg(), 'PUT', key, segundos);
const urlDeLeitura = (key, segundos = 600) => presign(cfg(), 'GET', key, segundos);

/** Confere se o objeto chegou mesmo ao bucket. Confirmação de upload que
 *  acredita no cliente não é confirmação. */
async function existe(key) {
  const r = await fetch(presign(cfg(), 'HEAD', key, 300), { method: 'HEAD' });
  if (!r.ok) return null;
  return { bytes: parseInt(r.headers.get('content-length'), 10) || 0, etag: r.headers.get('etag') || '' };
}

async function remover(key) {
  const r = await fetch(presign(cfg(), 'DELETE', key, 300), { method: 'DELETE' });
  return r.ok || r.status === 404;
}

// ---------------- integridade ----------------
const sha256De = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

/** Confere o hash declarado pelo cliente contra o que chegou. Comparação
 *  em tempo constante por higiene — hash de arquivo não é segredo, mas o
 *  hábito evita que a próxima comparação (que será de segredo) nasça
 *  torta. */
function hashConfere(esperado, obtido) {
  const a = Buffer.from(String(esperado || ''), 'utf8');
  const b = Buffer.from(String(obtido || ''), 'utf8');
  if (a.length !== b.length || !a.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  configurar, ativo, faltando, cfg, presign, chaveDe,
  urlDeUpload, urlDeLeitura, existe, remover, sha256De, hashConfere,
};
