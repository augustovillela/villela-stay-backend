// =====================================================================
// Musique Cifras — EXTRATORES: HTML, DOCX, PDF e TXT → texto de cifra.
//
// ⚠️ O QUE ELES PRECISAM PRESERVAR É A COLUNA. Em cifra, o acorde fica
// em cima da sílaba porque está na MESMA COLUNA; um extrator que achata
// espaços (como o genérico do Villela Docs, correto para indexar
// documento) destruiria justamente o que importa. Por isso:
//   · PDF: a linha é remontada pela posição X de cada trecho;
//   · DOCX: tabulação e espaço preservado (xml:space) viram espaço;
//   · HTML: o conteúdo de <pre> é o texto, e HTML externo NUNCA é
//     renderizado — só tag removida e entidade decodificada.
// =====================================================================
'use strict';
const path = require('path');
const { lerZip } = require('../../../vdocs/extrair');

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í',
  oacute: 'ó', uacute: 'ú', agrave: 'à', acirc: 'â', ecirc: 'ê', ocirc: 'ô', atilde: 'ã', otilde: 'õ', ccedil: 'ç',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Agrave: 'À', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô',
  Atilde: 'Ã', Otilde: 'Õ', Ccedil: 'Ç', uuml: 'ü', ordm: 'º', ordf: 'ª', deg: '°', sharp: '♯', flat: '♭', hellip: '…',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };

function decodificar(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENTIDADES[e] !== undefined ? ENTIDADES[e] : m;
  });
}

const tirarTags = (h) => decodificar(String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''));

/**
 * HTML → texto de cifra. Escolhe o <pre> que MAIS parece cifra (o maior
 * com linhas de acorde); sem <pre>, cai para o texto do corpo com
 * confiança menor — e diz isso.
 */
function deHtml(html) {
  const limpo = String(html || '').replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const meta = (re) => { const m = limpo.match(re); return m ? tirarTags(m[1]).trim() : ''; };
  const titulo = meta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || meta(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pres = [];
  const re = /<pre[^>]*>([\s\S]*?)<\/pre>/gi;
  let m;
  while ((m = re.exec(limpo)) !== null) pres.push(tirarTags(m[1]).replace(/\r/g, ''));
  if (pres.length) {
    const pontuar = (t) => t.split('\n').filter((l) => /^\s*([A-G][#b]?(m|maj|7|9|sus|dim|°|\+|\/|\(|\s|$))/.test(l)).length * 10 + t.length / 100;
    pres.sort((a, b) => pontuar(b) - pontuar(a));
    return { texto: pres[0].replace(/ /g, ' '), titulo, metodo: 'html.pre', confianca: 0.9 };
  }
  const corpo = (limpo.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [null, limpo])[1]
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  const texto = tirarTags(corpo).replace(/ /g, ' ').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { texto, titulo, metodo: 'html.corpo', confianca: 0.5 };
}

/** TXT: UTF-8 quando é UTF-8 válido; senão Latin-1 (arquivo antigo do Windows). */
function deTxt(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf));
  let t = b.toString('utf8');
  if (t.includes('�')) t = b.toString('latin1');
  return { texto: t.replace(/^﻿/, '').replace(/\r\n?/g, '\n'), metodo: 'txt', confianca: 1 };
}

/** DOCX: parágrafo = linha; tabulação e espaço preservado continuam lá. */
function deDocx(buf) {
  const zip = lerZip(buf);
  const xml = (zip.arquivo('word/document.xml') || Buffer.alloc(0)).toString('utf8');
  if (!xml) throw Object.assign(new Error('DOCX sem document.xml.'), { permanente: true });
  const linhas = [];
  const paragrafos = xml.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) || [];
  paragrafos.forEach((p) => {
    let linha = '';
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g;
    let m;
    while ((m = re.exec(p)) !== null) {
      if (m[0] === '<w:tab/>') linha += '    ';
      else if (m[0] === '<w:br/>' || m[0] === '<w:cr/>') { linhas.push(linha); linha = ''; }
      else linha += decodificar(m[1]);
    }
    linhas.push(linha);
  });
  return { texto: linhas.join('\n'), metodo: 'docx', confianca: 0.95 };
}

let _pdfjs = null;
/**
 * PDF com camada de texto → texto com COLUNAS reconstruídas. Sem camada
 * de texto (escaneado), lança `ocrPendente` — quem chama decide se
 * manda para a leitura por IA.
 */
async function dePdf(buf) {
  if (!_pdfjs) _pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = _pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false, isEvalSupported: false, disableFontFace: true,
    standardFontDataUrl: path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').split(path.sep).join('/') + '/' });
  const paginas = [];
  let n = 0;
  try {
    const doc = await task.promise;
    n = doc.numPages;
    for (let i = 1; i <= Math.min(n, 60); i++) {
      const pg = await doc.getPage(i);
      const tc = await pg.getTextContent();
      paginas.push(remontarPagina(tc.items.filter((it) => it.str !== undefined)));
      pg.cleanup();
    }
  } finally { await task.destroy().catch(() => {}); }
  const texto = paginas.join('\n\n');
  if (texto.replace(/\s/g, '').length < 8) {
    throw Object.assign(new Error('PDF sem camada de texto (escaneado).'), { ocrPendente: true, paginas: n });
  }
  return { texto, metodo: 'pdf', confianca: 0.85, paginas: n };
}

/** Agrupa os trechos por linha (Y) e posiciona cada um pela coluna (X). */
function remontarPagina(itens) {
  const linhas = [];
  itens.forEach((it) => {
    if (!it.str) return;
    const x = it.transform[4], y = it.transform[5];
    let l = linhas.find((q) => Math.abs(q.y - y) <= 2);
    if (!l) { l = { y, itens: [] }; linhas.push(l); }
    l.itens.push({ x, str: it.str, w: it.width || 0 });
  });
  const larguras = [];
  itens.forEach((it) => { if (it.str && it.str.trim() && it.width) larguras.push(it.width / it.str.length); });
  larguras.sort((a, b) => a - b);
  const car = larguras.length ? larguras[Math.floor(larguras.length / 2)] : 5;
  const xs = linhas.flatMap((l) => l.itens.map((i) => i.x));
  const minX = xs.length ? Math.min(...xs) : 0;
  linhas.sort((a, b) => b.y - a.y);
  return linhas.map((l) => {
    let s = '';
    l.itens.sort((a, b) => a.x - b.x).forEach((i) => {
      const col = Math.max(0, Math.round((i.x - minX) / car));
      if (col > s.length) s += ' '.repeat(col - s.length);
      else if (s.length && !s.endsWith(' ') && col <= s.length && !/^\s/.test(i.str)) s += ' ';
      s += i.str;
    });
    return s.replace(/\s+$/, '');
  }).join('\n');
}

const EXT_TEXTO = ['txt', 'cho', 'chopro', 'chordpro', 'crd', 'pro', 'text', 'md'];
const EXT_IMAGEM = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const MIME_IMAGEM = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/** Identifica o tipo do arquivo pela extensão E pelos primeiros bytes. */
function tipoDeArquivo(nome, buf) {
  const ext = (String(nome || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || '';
  const b = Buffer.isBuffer(buf) ? buf : Buffer.alloc(0);
  const assinatura = b.slice(0, 8).toString('hex');
  if (assinatura.startsWith('25504446')) return { tipo: 'pdf', ext: 'pdf' };                 // %PDF
  if (assinatura.startsWith('504b0304') && (ext === 'docx' || !ext)) return { tipo: 'docx', ext: 'docx' };
  if (assinatura.startsWith('89504e47')) return { tipo: 'imagem', ext: 'png', mime: 'image/png' };
  if (assinatura.startsWith('ffd8ff')) return { tipo: 'imagem', ext: 'jpg', mime: 'image/jpeg' };
  if (assinatura.startsWith('52494646') && b.slice(8, 12).toString() === 'WEBP') return { tipo: 'imagem', ext: 'webp', mime: 'image/webp' };
  if (EXT_IMAGEM.includes(ext)) return { tipo: 'imagem', ext, mime: MIME_IMAGEM[ext] };
  if (ext === 'doc') return { tipo: 'recusado', ext, motivo: 'Formato .doc antigo: salve como .docx ou PDF.' };
  if (EXT_TEXTO.includes(ext) || !ext) return { tipo: 'texto', ext: ext || 'txt' };
  if (ext === 'docx') return { tipo: 'recusado', ext, motivo: 'O arquivo diz ser .docx mas não é.' };
  return { tipo: 'recusado', ext, motivo: 'Formato .' + ext + ' não suportado.' };
}

module.exports = { deHtml, deTxt, deDocx, dePdf, remontarPagina, tipoDeArquivo, decodificar, tirarTags, EXT_IMAGEM };
