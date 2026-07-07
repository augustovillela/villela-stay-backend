// =====================================================================
// Villela Docs Intelligence — Fase 3: extração de texto por formato.
// Tudo SEM dependência nativa: texto puro direto; Office (docx/xlsx/pptx)
// via leitor ZIP próprio (zlib embutido); PDF via pdfjs-dist (JS puro).
// Imagem/áudio/vídeo/zip não têm texto extraível aqui → 'ocr_pendente'
// (o OCR real pluga na fila quando for contratado/ativado — decisão no README).
// =====================================================================
'use strict';
const path = require('path');
const zlib = require('zlib');

// ---------------- leitor ZIP mínimo (central directory) ----------------
// Suporta os métodos 0 (stored) e 8 (deflate) — o que docx/xlsx/pptx usam.
function lerZip(buf) {
  // EOCD: assinatura 0x06054b50, procurada do fim (comentário ≤ 64k)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP inválido (EOCD não encontrado).');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // offset do central directory
  const entradas = {};
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const nomeLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const comentLen = buf.readUInt16LE(p + 32);
    const offLocal = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + nomeLen);
    entradas[nome] = { metodo, tamComp, offLocal };
    p += 46 + nomeLen + extraLen + comentLen;
  }
  return {
    arquivo(nome) {
      const e = entradas[nome];
      if (!e) return null;
      // local header: nome/extra podem diferir do central dir — reler tamanhos
      const lh = e.offLocal;
      if (buf.readUInt32LE(lh) !== 0x04034b50) throw new Error('ZIP corrompido (local header).');
      const nomeLen = buf.readUInt16LE(lh + 26);
      const extraLen = buf.readUInt16LE(lh + 28);
      const dados = buf.subarray(lh + 30 + nomeLen + extraLen, lh + 30 + nomeLen + extraLen + e.tamComp);
      if (e.metodo === 0) return Buffer.from(dados);
      if (e.metodo === 8) return zlib.inflateRawSync(dados);
      throw new Error(`Método ZIP não suportado: ${e.metodo}`);
    },
    nomes() { return Object.keys(entradas); },
  };
}

// ---------------- helpers XML (sem parser: strip de tags controlado) ----------------
const decodeEnt = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const textoDeTags = (xml, tagRe) => {
  const out = [];
  let m;
  while ((m = tagRe.exec(xml))) out.push(decodeEnt(m[1]));
  return out;
};

// ---------------- extratores por formato ----------------
function deTextoPuro(buf) {
  let t = buf.toString('utf8');
  if (t.includes('�')) t = buf.toString('latin1'); // fallback p/ CSV/TXT legados
  return { texto: t, metodo: 'texto', paginas: 0 };
}

function deDocx(buf) {
  const zip = lerZip(buf);
  const xml = (zip.arquivo('word/document.xml') || Buffer.alloc(0)).toString('utf8');
  if (!xml) throw new Error('DOCX sem word/document.xml.');
  const texto = decodeEnt(xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/\n{3,}/g, '\n\n').trim();
  return { texto, metodo: 'docx', paginas: 0 };
}

function deXlsx(buf) {
  const zip = lerZip(buf);
  const partes = [];
  const shared = zip.arquivo('xl/sharedStrings.xml');
  if (shared) partes.push(...textoDeTags(shared.toString('utf8'), /<t[^>]*>([\s\S]*?)<\/t>/g));
  // valores inline/numéricos das planilhas (célula <v>)
  for (const nome of zip.nomes().filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).slice(0, 20)) {
    partes.push(...textoDeTags(zip.arquivo(nome).toString('utf8'), /<v>([\s\S]*?)<\/v>/g));
  }
  return { texto: partes.join('\n').trim(), metodo: 'xlsx', paginas: 0 };
}

function dePptx(buf) {
  const zip = lerZip(buf);
  const slides = zip.nomes().filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
  const partes = [];
  for (const nome of slides) partes.push(textoDeTags(zip.arquivo(nome).toString('utf8'), /<a:t>([\s\S]*?)<\/a:t>/g).join('\n'));
  return { texto: partes.join('\n\n').trim(), metodo: 'pptx', paginas: slides.length };
}

let _pdfjs = null;
async function dePdf(buf) {
  if (!_pdfjs) _pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = _pdfjs.getDocument({
    data: new Uint8Array(buf), useSystemFonts: false, isEvalSupported: false, disableFontFace: true,
    // pdfjs exige URL com barra normal no fim (path.sep do Windows não vale)
    standardFontDataUrl: path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').split(path.sep).join('/') + '/',
  });
  let numPages = 0, texto = '';
  try {
    const doc = await task.promise;
    numPages = doc.numPages;
    const partes = [];
    const max = Math.min(numPages, 500);
    for (let i = 1; i <= max; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      partes.push(tc.items.map(it => it.str).join(' '));
      page.cleanup();
    }
    texto = partes.join('\n\n').replace(/[ \t]+/g, ' ').trim();
  } finally { await task.destroy().catch(() => {}); }
  // PDF sem camada de texto = escaneado → OCR pendente
  if (texto.replace(/\s/g, '').length < 8 && numPages >= 1) {
    const e = new Error('PDF sem camada de texto (escaneado) — aguardando OCR.');
    e.ocrPendente = true;
    throw e;
  }
  return { texto, metodo: 'pdf', paginas: numPages };
}

const SEM_TEXTO = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'wav', 'mp4', 'mov', 'zip']);

// Extrai texto do buffer conforme a extensão do nome original.
// Retorna { texto, metodo, paginas } ou lança erro (e.ocrPendente=true quando é caso de OCR).
async function extrairTexto(nomeArquivo, buf) {
  const ext = String(nomeArquivo || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1] || '';
  if (SEM_TEXTO.has(ext)) { const e = new Error(`Formato .${ext} sem texto extraível — aguardando OCR/transcrição.`); e.ocrPendente = true; throw e; }
  if (['txt', 'csv', 'md', 'json', 'xml', 'rtf'].includes(ext)) return deTextoPuro(buf);
  if (ext === 'docx') return deDocx(buf);
  if (ext === 'xlsx') return deXlsx(buf);
  if (ext === 'pptx') return dePptx(buf);
  if (['odt', 'ods', 'odp'].includes(ext)) { // OpenDocument: texto está em content.xml
    const xml = (lerZip(buf).arquivo('content.xml') || Buffer.alloc(0)).toString('utf8');
    if (!xml) throw new Error(`.${ext} sem content.xml.`);
    return { texto: decodeEnt(xml.replace(/<\/text:p>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim(), metodo: ext, paginas: 0 };
  }
  if (ext === 'pdf') return dePdf(buf);
  if (ext === 'doc' || ext === 'xls' || ext === 'ppt') { const e = new Error(`Formato legado .${ext} — converta para ${ext}x ou PDF.`); e.ocrPendente = false; throw e; }
  return deTextoPuro(buf);
}

module.exports = { extrairTexto, lerZip };
