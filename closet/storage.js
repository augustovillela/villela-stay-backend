// =====================================================================
// Closet Club — fotos das peças (arquivos PÚBLICOS).
//
// Diferente do Academy (aulas protegidas, URL assinada), aqui a imagem
// PRECISA ser pública e cacheável: é ela que aparece na vitrine, no
// compartilhamento e no Google. Por isso não há assinatura na leitura.
//
// Drivers: 'local' (DATA_DIR/closet/fotos/, servido em /closet/fotos/...)
// e 's3' (R2/AWS/Backblaze) por env:
//   CLOSET_S3_ENDPOINT / CLOSET_S3_BUCKET / CLOSET_S3_KEY / CLOSET_S3_SECRET
//   CLOSET_S3_REGION      (opcional; 'auto' para R2)
//   CLOSET_S3_PUBLIC_URL  base pública do bucket (ex.: https://fotos.closet...)
//
// O upload chega em base64 (o navegador já redimensiona antes de enviar):
// evita dependência de multipart e corta o peso na origem. O nome do
// arquivo é o sha256 do binário — mesma foto enviada duas vezes não ocupa
// espaço duas vezes, e o arquivo pode ter cache imutável.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db, SAAS_DIR, nowISO, novoId } = require('./db');
const s3 = require('../storage-s3');

const FOTOS_DIR = path.join(SAAS_DIR, 'fotos');
fs.mkdirSync(FOTOS_DIR, { recursive: true });

const MAX_BYTES = Number(process.env.CLOSET_FOTO_MAX_BYTES) || 4 * 1024 * 1024; // 4MB por foto

const cfgS3 = () => ({
  endpoint: process.env.CLOSET_S3_ENDPOINT || '',
  bucket: process.env.CLOSET_S3_BUCKET || '',
  key: process.env.CLOSET_S3_KEY || '',
  secret: process.env.CLOSET_S3_SECRET || '',
  region: process.env.CLOSET_S3_REGION || 'auto',
  publico: (process.env.CLOSET_S3_PUBLIC_URL || '').replace(/\/+$/, ''),
});
const s3Ativo = () => { const c = cfgS3(); return !!(c.endpoint && c.bucket && c.key && c.secret && c.publico); };

// ---------------------------------------------------------------------
// Validação: nunca confiar no mime que o cliente mandou. Só os bytes.
// ---------------------------------------------------------------------
const ASSINATURAS = [
  { ext: 'jpg', mime: 'image/jpeg', testa: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { ext: 'png', mime: 'image/png', testa: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  { ext: 'webp', mime: 'image/webp', testa: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' },
];

function identificar(buffer) {
  if (!buffer || buffer.length < 16) return null;
  return ASSINATURAS.find((a) => a.testa(buffer)) || null;
}

// dimensões sem decodificar a imagem inteira (só o cabeçalho)
function dimensoes(buffer, ext) {
  try {
    if (ext === 'png') return { largura: buffer.readUInt32BE(16), altura: buffer.readUInt32BE(20) };
    if (ext === 'webp' && buffer.slice(12, 16).toString('ascii') === 'VP8X') {
      return { largura: 1 + buffer.readUIntLE(24, 3), altura: 1 + buffer.readUIntLE(27, 3) };
    }
    if (ext === 'jpg') {
      let i = 2;
      while (i < buffer.length - 9) {
        if (buffer[i] !== 0xFF) { i++; continue; }
        const marcador = buffer[i + 1];
        // SOF0..SOF15, pulando os que não carregam dimensão (DHT/JPG/DAC)
        if (marcador >= 0xC0 && marcador <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marcador)) {
          return { altura: buffer.readUInt16BE(i + 5), largura: buffer.readUInt16BE(i + 7) };
        }
        i += 2 + buffer.readUInt16BE(i + 2);
      }
    }
  } catch (_) { /* cabeçalho fora do padrão: segue sem dimensão */ }
  return { largura: 0, altura: 0 };
}

// ---------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------
function urlPublica(arquivo, storage) {
  if (storage === 's3') return `${cfgS3().publico}/${arquivo}`;
  return `/closet/fotos/${arquivo}`;
}

// dataUrl = "data:image/jpeg;base64,...."  (ou base64 puro)
async function salvarDataUrl(dataUrl, { userId = '', origem = 'peca' } = {}) {
  const bruto = String(dataUrl || '');
  const base64 = bruto.includes(',') ? bruto.slice(bruto.indexOf(',') + 1) : bruto;
  if (!base64) throw new Error('Nenhuma imagem recebida.');
  let buffer;
  try { buffer = Buffer.from(base64, 'base64'); } catch (_) { throw new Error('Imagem inválida.'); }
  if (buffer.length > MAX_BYTES) throw new Error(`Imagem grande demais (máx. ${Math.round(MAX_BYTES / 1048576)}MB).`);

  const tipo = identificar(buffer);
  if (!tipo) throw new Error('Formato não suportado. Envie JPG, PNG ou WEBP.');

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const arquivo = `${hash}.${tipo.ext}`;

  // dedupe: mesma imagem já enviada por qualquer pessoa reaproveita o arquivo
  const ja = db.prepare('SELECT * FROM uploads WHERE hash = ?').get(hash);
  if (ja) return { id: ja.id, url: urlPublica(ja.arquivo, ja.storage), arquivo: ja.arquivo, bytes: ja.bytes, largura: ja.largura, altura: ja.altura, reaproveitada: true };

  const dim = dimensoes(buffer, tipo.ext);
  let storage = 'local';
  if (s3Ativo()) { await s3.s3Put(cfgS3(), arquivo, buffer, tipo.mime); storage = 's3'; }
  else fs.writeFileSync(path.join(FOTOS_DIR, arquivo), buffer);

  const id = novoId();
  db.prepare(`INSERT INTO uploads (id, user_id, hash, arquivo, mime, bytes, largura, altura, storage, origem, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, String(userId || ''), hash, arquivo, tipo.mime, buffer.length, dim.largura, dim.altura, storage, String(origem || 'peca'), nowISO());
  return { id, url: urlPublica(arquivo, storage), arquivo, bytes: buffer.length, ...dim, reaproveitada: false };
}

function caminhoLocal(arquivo) {
  const limpo = path.basename(String(arquivo || '')); // nunca deixa subir de diretório
  return path.join(FOTOS_DIR, limpo);
}

// Serve as fotos do driver local. Nome = hash do conteúdo, então o cache
// pode ser imutável: mudou a foto, mudou a URL.
function registrarRotaFotos(app) {
  app.get('/closet/fotos/:arquivo', (req, res) => {
    const arquivo = path.basename(String(req.params.arquivo || ''));
    if (!/^[a-f0-9]{64}\.(jpg|png|webp)$/i.test(arquivo)) return res.status(404).end();
    const caminho = caminhoLocal(arquivo);
    if (!fs.existsSync(caminho)) return res.status(404).end();
    const ext = arquivo.split('.').pop().toLowerCase();
    res.setHeader('Content-Type', ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    fs.createReadStream(caminho).pipe(res);
  });
}

function uso(userId) {
  const r = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(bytes),0) b FROM uploads WHERE user_id = ?').get(String(userId || ''));
  return { arquivos: r.c, bytes: r.b, mb: Math.round((r.b / 1048576) * 10) / 10 };
}

module.exports = { salvarDataUrl, registrarRotaFotos, caminhoLocal, urlPublica, identificar, dimensoes, uso, s3Ativo, FOTOS_DIR, MAX_BYTES };
