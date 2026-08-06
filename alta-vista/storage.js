// =====================================================================
// Villela Alta Vista 360 — storage de mídia (driver local | S3/R2).
// Padrão da casa (academy/closet + storage-s3.js compartilhado):
//   · arquivos PRIVADOS por padrão — acesso só por URL assinada com expiração;
//   · upload DIRETO: presigned PUT no R2 (vídeo pesado não passa pelo Node);
//     no driver local, rota raw dedicada com limite próprio;
//   · nome do arquivo = id aleatório + extensão do mime VALIDADO (magic bytes
//     no local; extensão whitelistada no S3, conferida no confirmar);
//   · envs: ALTAVISTA_S3_ENDPOINT / _BUCKET / _KEY / _SECRET / _REGION.
//     Sem elas: disco local em DATA_DIR/alta-vista/arquivos/ (dev/fallback).
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MOD_DIR, novoId } = require('./db');
const { presignS3, s3Existe } = require('../storage-s3');

const DIR_LOCAL = path.join(MOD_DIR, 'arquivos');
fs.mkdirSync(DIR_LOCAL, { recursive: true });

const CFG_S3 = {
  endpoint: process.env.ALTAVISTA_S3_ENDPOINT || '',
  bucket: process.env.ALTAVISTA_S3_BUCKET || '',
  key: process.env.ALTAVISTA_S3_KEY || '',
  secret: process.env.ALTAVISTA_S3_SECRET || '',
  region: process.env.ALTAVISTA_S3_REGION || 'auto',
};
const s3Ativo = () => !!(CFG_S3.endpoint && CFG_S3.bucket && CFG_S3.key && CFG_S3.secret);

// segredo das URLs assinadas do driver local (persiste no DATA_DIR para
// sobreviver a restart sem invalidar links recém-emitidos)
const SEG_PATH = path.join(MOD_DIR, 'assinatura.secret');
let SEGREDO = '';
try { SEGREDO = fs.readFileSync(SEG_PATH, 'utf8').trim(); } catch (_) {}
if (!SEGREDO) { SEGREDO = crypto.randomBytes(24).toString('base64url'); fs.writeFileSync(SEG_PATH, SEGREDO); }

// ---------------------------------------------------------------------
// Tipos aceitos — imagem, panorama e vídeo. Nada de executável/aleatório.
// ---------------------------------------------------------------------
const TIPOS = {
  'image/jpeg': { ext: 'jpg', maxLocal: 30 * 1024 * 1024, maxS3: 60 * 1024 * 1024 },
  'image/png': { ext: 'png', maxLocal: 30 * 1024 * 1024, maxS3: 60 * 1024 * 1024 },
  'image/webp': { ext: 'webp', maxLocal: 30 * 1024 * 1024, maxS3: 60 * 1024 * 1024 },
  'video/mp4': { ext: 'mp4', maxLocal: 200 * 1024 * 1024, maxS3: 2 * 1024 * 1024 * 1024 },
  'video/quicktime': { ext: 'mov', maxLocal: 200 * 1024 * 1024, maxS3: 2 * 1024 * 1024 * 1024 },
};

// magic bytes: nunca confiar no mime declarado (driver local recebe os bytes)
function detectarMime(buf) {
  if (!buf || buf.length < 12) return '';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  const ftyp = buf.slice(4, 8).toString('ascii');
  if (ftyp === 'ftyp') {
    const marca = buf.slice(8, 12).toString('ascii');
    return marca.startsWith('qt') ? 'video/quicktime' : 'video/mp4';
  }
  return '';
}

const novaChave = (mime, prefixo = 'projetos') =>
  `${prefixo}/${new Date().toISOString().slice(0, 7)}/${novoId()}${novoId()}.${(TIPOS[mime] || {}).ext || 'bin'}`;

// caminho local sempre confinado ao diretório (anti path traversal — lição vdocs)
function caminhoLocal(chave) {
  const abs = path.resolve(DIR_LOCAL, chave.replace(/^\/+/, ''));
  if (!abs.startsWith(path.resolve(DIR_LOCAL) + path.sep)) throw new Error('Chave inválida.');
  return abs;
}

// ---------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------
// Emite o destino do upload. S3: presigned PUT direto ao bucket (o arquivo não
// passa pelo Node). Local: rota raw própria com o id do upload pendente.
function prepararUpload(mime, tamanho) {
  const t = TIPOS[mime];
  if (!t) throw new Error('Tipo de arquivo não aceito. Envie JPG, PNG, WEBP, MP4 ou MOV.');
  const max = s3Ativo() ? t.maxS3 : t.maxLocal;
  if (tamanho && tamanho > max) {
    throw new Error(`Arquivo grande demais (${Math.round(tamanho / 1048576)} MB; máximo ${Math.round(max / 1048576)} MB${s3Ativo() ? '' : ' no modo local'}).`);
  }
  const chave = novaChave(mime);
  if (s3Ativo()) {
    return { modo: 's3', chave, url: presignS3(CFG_S3, 'PUT', chave, 3600), headers: { 'Content-Type': mime } };
  }
  return { modo: 'local', chave, url: null }; // a rota chama receberLocal
}

function receberLocal(chave, buf) {
  const mimeReal = detectarMime(buf);
  const t = TIPOS[mimeReal];
  if (!t) throw new Error('Conteúdo do arquivo não confere com um tipo aceito (JPG, PNG, WEBP, MP4, MOV).');
  if (buf.length > t.maxLocal) throw new Error('Arquivo grande demais para o modo local.');
  const abs = caminhoLocal(chave);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
  return { mime: mimeReal, tamanho: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

// confirma que o upload chegou (S3: HEAD; local: stat) e devolve o tamanho real
async function confirmarUpload(chave, mimeDeclarado) {
  if (s3Ativo()) {
    const ok = await s3Existe(CFG_S3, chave);
    if (!ok) throw new Error('Upload não encontrado no bucket — envie de novo.');
    return { mime: mimeDeclarado, tamanho: 0 };
  }
  const abs = caminhoLocal(chave);
  if (!fs.existsSync(abs)) throw new Error('Upload não encontrado — envie de novo.');
  const buf = fs.readFileSync(abs);
  const mimeReal = detectarMime(buf);
  if (!TIPOS[mimeReal]) { fs.unlinkSync(abs); throw new Error('Conteúdo do arquivo não confere com um tipo aceito.'); }
  return { mime: mimeReal, tamanho: buf.length };
}

// ---------------------------------------------------------------------
// Leitura — sempre por URL assinada com expiração
// ---------------------------------------------------------------------
function assinarUrl(chave, segundos = 300) {
  if (s3Ativo()) return presignS3(CFG_S3, 'GET', chave, segundos);
  const exp = Math.floor(Date.now() / 1000) + segundos;
  const sig = crypto.createHmac('sha256', SEGREDO).update(`${chave}:${exp}`).digest('base64url');
  return `/alta-vista/arquivo/${encodeURIComponent(chave)}?exp=${exp}&sig=${sig}`;
}

function validarAssinaturaLocal(chave, exp, sig) {
  if (!exp || !sig || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const esperado = crypto.createHmac('sha256', SEGREDO).update(`${chave}:${exp}`).digest('base64url');
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado)); } catch (_) { return false; }
}

function removerArquivo(chave) {
  if (s3Ativo()) {
    // DELETE assinado, best-effort (não bloqueia a operação principal)
    return fetch(presignS3(CFG_S3, 'DELETE', chave, 60), { method: 'DELETE' }).catch(() => {});
  }
  try { fs.unlinkSync(caminhoLocal(chave)); } catch (_) {}
  return Promise.resolve();
}

// rotas do driver local: upload raw + leitura assinada
function registrarRotasLocais(app, express) {
  // upload local (dev/fallback): corpo cru até 200 MB, chave vem do upload pendente
  app.put('/alta-vista/upload-local/:uploadId', express.raw({ type: () => true, limit: '200mb' }), (req, res) => {
    const { db } = require('./db');
    const up = db.prepare('SELECT * FROM uploads_pendentes WHERE id = ?').get(String(req.params.uploadId));
    if (!up) return res.status(404).json({ erro: 'Upload não encontrado ou já consumido.' });
    try {
      const r = receberLocal(up.chave, req.body);
      res.json({ ok: true, mime: r.mime, tamanho: r.tamanho });
    } catch (e) { res.status(400).json({ erro: e.message }); }
  });

  app.get('/alta-vista/arquivo/:chave', (req, res) => {
    const chave = decodeURIComponent(req.params.chave);
    if (!validarAssinaturaLocal(chave, req.query.exp, req.query.sig)) return res.status(403).send('Link vencido ou inválido.');
    let abs;
    try { abs = caminhoLocal(chave); } catch (_) { return res.status(400).send('Chave inválida.'); }
    if (!fs.existsSync(abs)) return res.status(404).send('Arquivo não encontrado.');
    const ext = path.extname(abs).slice(1);
    const mime = Object.entries(TIPOS).find(([, v]) => v.ext === ext);
    res.setHeader('Content-Type', mime ? mime[0] : 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(abs).pipe(res);
  });
}

module.exports = {
  s3Ativo, TIPOS, detectarMime, prepararUpload, receberLocal, confirmarUpload,
  assinarUrl, validarAssinaturaLocal, removerArquivo, registrarRotasLocais, DIR_LOCAL,
};
