// =====================================================================
// ORIGENA — leitura de arquivo binário: tipo real e EXIF (§75, §21).
//
// Tudo em JS puro, sem dependência: o grupo evita nativa e isto é
// leitura de cabeçalho, não processamento de imagem.
//
// §75 — NUNCA confiar no MIME que o navegador mandou. Ele é metadado do
// cliente, e cliente não é fonte de verdade. O que vale é o que está nos
// primeiros bytes do arquivo.
// =====================================================================
'use strict';

// magic bytes → { mime, ext, tipo }
const ASSINATURAS = [
  { bytes: [0xff, 0xd8, 0xff], mime: 'image/jpeg', ext: 'jpg', tipo: 'FOTO' },
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: 'image/png', ext: 'png', tipo: 'FOTO' },
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: 'image/gif', ext: 'gif', tipo: 'FOTO' },
  { bytes: [0x42, 0x4d], mime: 'image/bmp', ext: 'bmp', tipo: 'FOTO' },
  { bytes: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf', ext: 'pdf', tipo: 'DOCUMENTO' },
  { bytes: [0x49, 0x49, 0x2a, 0x00], mime: 'image/tiff', ext: 'tif', tipo: 'FOTO' },
  { bytes: [0x4d, 0x4d, 0x00, 0x2a], mime: 'image/tiff', ext: 'tif', tipo: 'FOTO' },
  { bytes: [0x4f, 0x67, 0x67, 0x53], mime: 'audio/ogg', ext: 'ogg', tipo: 'AUDIO' },
  { bytes: [0x66, 0x4c, 0x61, 0x43], mime: 'audio/flac', ext: 'flac', tipo: 'AUDIO' },
  { bytes: [0x49, 0x44, 0x33], mime: 'audio/mpeg', ext: 'mp3', tipo: 'AUDIO' },
];

const bateEm = (buf, bytes, off = 0) =>
  buf.length >= off + bytes.length && bytes.every((b, i) => buf[off + i] === b);

/**
 * Tipo REAL, pelos bytes. Devolve null para o que não reconhecemos —
 * e o que não reconhecemos não entra (lista de permissão, não de bloqueio).
 */
function tipoReal(buf) {
  for (const a of ASSINATURAS) if (bateEm(buf, a.bytes)) return { mime: a.mime, ext: a.ext, tipo: a.tipo };

  // Contêineres que precisam de contexto além dos primeiros bytes:
  // RIFF (wav/webp) e ISO-BMFF (mp4/mov/m4a) declaram o formato depois.
  if (bateEm(buf, [0x52, 0x49, 0x46, 0x46])) {
    if (bateEm(buf, [0x57, 0x41, 0x56, 0x45], 8)) return { mime: 'audio/wav', ext: 'wav', tipo: 'AUDIO' };
    if (bateEm(buf, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: 'image/webp', ext: 'webp', tipo: 'FOTO' };
    if (bateEm(buf, [0x41, 0x56, 0x49, 0x20], 8)) return { mime: 'video/x-msvideo', ext: 'avi', tipo: 'VIDEO' };
  }
  // EBML — WebM e Matroska. É o que o NAVEGADOR grava (`MediaRecorder`),
  // então sem isto a entrevista gravada na hora cairia em quarentena como
  // "tipo não reconhecido". O contêiner é o mesmo para som e vídeo; quem
  // separa são os CodecID em texto puro na área de Tracks. Heurística
  // declarada: se aparece codec de áudio e nenhum de vídeo nos primeiros
  // 8 KB, é áudio; na dúvida, VÍDEO (o limite de tamanho é maior, e o
  // caminho de vídeo não presume que dá para transcrever direto).
  if (bateEm(buf, [0x1a, 0x45, 0xdf, 0xa3])) {
    const cabeca = buf.toString('latin1', 0, Math.min(buf.length, 8192));
    const audio = /A_(OPUS|VORBIS|AAC|MPEG|PCM)/.test(cabeca);
    const video = /V_(VP8|VP9|AV1|MPEG|THEORA)/.test(cabeca);
    return audio && !video
      ? { mime: 'audio/webm', ext: 'webm', tipo: 'AUDIO' }
      : { mime: 'video/webm', ext: 'webm', tipo: 'VIDEO' };
  }
  if (bateEm(buf, [0x66, 0x74, 0x79, 0x70], 4)) {
    const marca = buf.toString('ascii', 8, 12);
    if (/^(qt|M4A)/.test(marca)) {
      return marca.startsWith('M4A')
        ? { mime: 'audio/mp4', ext: 'm4a', tipo: 'AUDIO' }
        : { mime: 'video/quicktime', ext: 'mov', tipo: 'VIDEO' };
    }
    return { mime: 'video/mp4', ext: 'mp4', tipo: 'VIDEO' };
  }
  // ZIP: pode ser docx/xlsx/pptx. Sem abrir o pacote, é só ZIP.
  if (bateEm(buf, [0x50, 0x4b, 0x03, 0x04])) {
    return { mime: 'application/zip', ext: 'zip', tipo: 'DOCUMENTO' };
  }
  return null;
}

/**
 * SVG e HTML NÃO entram como imagem, por mais que o navegador insista:
 * SVG executa script e é vetor clássico de XSS (SECURITY.md T4). Se um
 * dia entrar, entra rasterizado ou servido como anexo de texto puro.
 */
const PROIBIDOS = ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'application/x-msdownload'];
const ehProibido = (mime) => PROIBIDOS.includes(String(mime || '').toLowerCase());

// ------------------------------------------------------------------ EXIF
// Parser de APP1/TIFF só do que interessa. Não é biblioteca de EXIF:
// é o mínimo para saber QUANDO a foto foi tirada e com o quê.
const TAGS = {
  0x010f: 'fabricante', 0x0110: 'modelo', 0x0112: 'orientacao',
  0x0132: 'data_arquivo', 0x9003: 'data_original', 0x9004: 'data_digitalizada',
  0xa002: 'largura', 0xa003: 'altura', 0x8827: 'iso', 0x829a: 'exposicao',
};
const TAGS_GPS = { 0x0001: 'lat_ref', 0x0002: 'lat', 0x0003: 'lon_ref', 0x0004: 'lon' };

function lerIFD(buf, inicio, tiffBase, le, mapa, saida) {
  if (inicio + 2 > buf.length) return null;
  const n = le ? buf.readUInt16LE(inicio) : buf.readUInt16BE(inicio);
  let ponteiroExif = null, ponteiroGps = null;
  for (let i = 0; i < n; i++) {
    const p = inicio + 2 + i * 12;
    if (p + 12 > buf.length) break;
    const tag = le ? buf.readUInt16LE(p) : buf.readUInt16BE(p);
    const tipo = le ? buf.readUInt16LE(p + 2) : buf.readUInt16BE(p + 2);
    const conta = le ? buf.readUInt32LE(p + 4) : buf.readUInt32BE(p + 4);
    const valorOff = p + 8;

    if (tag === 0x8769) { ponteiroExif = tiffBase + (le ? buf.readUInt32LE(valorOff) : buf.readUInt32BE(valorOff)); continue; }
    if (tag === 0x8825) { ponteiroGps = tiffBase + (le ? buf.readUInt32LE(valorOff) : buf.readUInt32BE(valorOff)); continue; }

    const nome = mapa[tag];
    if (!nome) continue;
    try {
      if (tipo === 2) {                                  // ASCII
        const tam = conta;
        const off = tam > 4 ? tiffBase + (le ? buf.readUInt32LE(valorOff) : buf.readUInt32BE(valorOff)) : valorOff;
        saida[nome] = buf.toString('ascii', off, off + tam).replace(/\0.*$/, '').trim();
      } else if (tipo === 3) {                           // SHORT
        saida[nome] = le ? buf.readUInt16LE(valorOff) : buf.readUInt16BE(valorOff);
      } else if (tipo === 4) {                           // LONG
        saida[nome] = le ? buf.readUInt32LE(valorOff) : buf.readUInt32BE(valorOff);
      } else if (tipo === 5 && conta >= 1) {             // RATIONAL
        const off = tiffBase + (le ? buf.readUInt32LE(valorOff) : buf.readUInt32BE(valorOff));
        const partes = [];
        for (let k = 0; k < Math.min(conta, 3); k++) {
          const num = le ? buf.readUInt32LE(off + k * 8) : buf.readUInt32BE(off + k * 8);
          const den = le ? buf.readUInt32LE(off + k * 8 + 4) : buf.readUInt32BE(off + k * 8 + 4);
          partes.push(den ? num / den : 0);
        }
        saida[nome] = partes.length === 1 ? partes[0] : partes;
      }
    } catch (_) { /* tag corrompida não derruba a ingestão */ }
  }
  return { ponteiroExif, ponteiroGps };
}

/** Devolve `{}` quando não há EXIF — ausência não é erro. */
function lerExif(buf) {
  try {
    if (!bateEm(buf, [0xff, 0xd8])) return {};            // só JPEG por ora
    let p = 2;
    while (p + 4 < buf.length) {
      if (buf[p] !== 0xff) break;
      const marcador = buf[p + 1];
      const tam = buf.readUInt16BE(p + 2);
      if (marcador === 0xe1 && buf.toString('ascii', p + 4, p + 10) === 'Exif\0\0') {
        const tiff = p + 10;
        const le = buf.toString('ascii', tiff, tiff + 2) === 'II';
        const off0 = le ? buf.readUInt32LE(tiff + 4) : buf.readUInt32BE(tiff + 4);
        const saida = {};
        const r = lerIFD(buf, tiff + off0, tiff, le, TAGS, saida);
        if (r && r.ponteiroExif) lerIFD(buf, r.ponteiroExif, tiff, le, TAGS, saida);
        if (r && r.ponteiroGps) {
          const gps = {};
          lerIFD(buf, r.ponteiroGps, tiff, le, TAGS_GPS, gps);
          if (Array.isArray(gps.lat) && Array.isArray(gps.lon)) {
            const grau = (a) => a[0] + (a[1] || 0) / 60 + (a[2] || 0) / 3600;
            saida.gps = {
              lat: grau(gps.lat) * (gps.lat_ref === 'S' ? -1 : 1),
              lon: grau(gps.lon) * (gps.lon_ref === 'W' ? -1 : 1),
            };
          }
        }
        return saida;
      }
      if (marcador === 0xda) break;                       // começou a imagem
      p += 2 + tam;
    }
  } catch (_) { /* EXIF quebrado não impede guardar a foto */ }
  return {};
}

/** Dimensões sem decodificar a imagem — só o cabeçalho. */
function dimensoes(buf) {
  try {
    if (bateEm(buf, [0x89, 0x50, 0x4e, 0x47])) {
      return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
    }
    if (bateEm(buf, [0xff, 0xd8])) {
      let p = 2;
      while (p + 9 < buf.length) {
        if (buf[p] !== 0xff) { p++; continue; }
        const m = buf[p + 1];
        // SOF0..SOF15, menos os marcadores que não são frame
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
          return { altura: buf.readUInt16BE(p + 5), largura: buf.readUInt16BE(p + 7) };
        }
        p += 2 + buf.readUInt16BE(p + 2);
      }
    }
    if (bateEm(buf, [0x47, 0x49, 0x46, 0x38])) {
      return { largura: buf.readUInt16LE(6), altura: buf.readUInt16LE(8) };
    }
  } catch (_) { /* cabeçalho estranho: seguimos sem dimensão */ }
  return {};
}

/**
 * A data que a câmera gravou. Vale como fonte DOCUMENTAL de origem
 * técnica: não é a memória da família, é o relógio do aparelho — e por
 * isso entra como fato com fonte própria, não como verdade absoluta.
 */
function dataDoExif(exif) {
  const bruto = exif.data_original || exif.data_digitalizada || exif.data_arquivo;
  if (!bruto) return null;
  const m = String(bruto).match(/^(\d{4}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, a, mes, d] = m;
  if (Number(a) < 1826 || Number(a) > new Date().getFullYear() + 1) return null;  // 1826 = 1ª fotografia
  return `${d}/${mes}/${a}`;
}

module.exports = { tipoReal, ehProibido, PROIBIDOS, lerExif, dimensoes, dataDoExif, bateEm };
