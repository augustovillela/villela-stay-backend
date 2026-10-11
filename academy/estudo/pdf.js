// =====================================================================
// Villela Academy — ESTUDO · LEITOR DE PDF (ADR-0010, fase 3). Sem provedor:
// nada aqui custa — é o que permite ORÇAR antes de cobrar.
//
//   ler(bytes)                 texto por página (com as quebras de linha) e quais páginas vieram
//                              SEM camada de texto (escaneadas: só o modelo as lê, como bloco `document`)
//   recortar(bytes, paginas)   um PDF menor só com aquelas páginas, em base64, para mandar ao modelo
//
// O PDF é do usuário: dado NÃO confiável. Lê-se sem avaliar script, sem fonte do sistema e com teto
// de páginas; protegido por senha ou corrompido vira erro claro (status 422), antes de qualquer cobrança.
// =====================================================================
'use strict';
const path = require('path');

const MAX_PAGINAS_LIDAS = 300;       // acima disso não é caderno de prova: nem se abre página por página
const MINIMO_DE_TEXTO = 40;          // caracteres (sem espaço) para a página contar como "tem texto"
const erro = (msg, status = 422) => { const e = new Error(msg); e.status = status; return e; };
const ILEGIVEL = 'Não foi possível ler este PDF: o arquivo está corrompido ou não é um PDF. Nada foi cobrado.';
const PROTEGIDO = 'Este PDF está protegido por senha. Envie uma cópia sem proteção. Nada foi cobrado.';

let _pdfjs = null;
const pdfjs = async () => _pdfjs || (_pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'));
const FONTES = () => path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').split(path.sep).join('/') + '/';
const pareceSenha = (e) => /password|encrypt/i.test(`${e && e.name} ${e && e.message}`);

// As linhas da página, na ordem de leitura do arquivo. O pdfjs entrega pedaços; `hasEOL` marca o fim
// da linha. Onde ele não marca, a troca de altura (y) entre dois pedaços vale como quebra.
function textoDaPagina(itens) {
  const linhas = [];
  let atual = '', y = null;
  for (const it of itens) {
    if (typeof it.str !== 'string') continue;
    const yi = Array.isArray(it.transform) ? it.transform[5] : null;
    if (atual && y != null && yi != null && Math.abs(yi - y) > 2 && it.str.trim()) { linhas.push(atual); atual = ''; }
    atual += it.str;
    if (yi != null && it.str.trim()) y = yi;
    if (it.hasEOL) { linhas.push(atual); atual = ''; y = null; }
  }
  if (atual) linhas.push(atual);
  return linhas.map(l => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n');
}

// → { paginas, textos: [{ n, texto, sem_texto }] } — `n` a partir de 1.
async function ler(bytes, { maxPaginas = MAX_PAGINAS_LIDAS, nome = 'Este PDF' } = {}) {
  if (!bytes || bytes.length < 8 || bytes.subarray(0, 1024).indexOf('%PDF-') < 0) throw erro(ILEGIVEL);
  const lib = await pdfjs();
  // cópia: o pdfjs fica com o buffer que recebe (quem chamou ainda vai recortar o original)
  const task = lib.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false, disableFontFace: true, standardFontDataUrl: FONTES(), verbosity: 0 });
  try {
    let doc;
    try { doc = await task.promise; } catch (e) { throw erro(pareceSenha(e) ? PROTEGIDO : ILEGIVEL); }
    if (!doc.numPages) throw erro(ILEGIVEL);
    if (doc.numPages > maxPaginas) throw erro(`${nome} tem ${doc.numPages} páginas — o limite é de ${maxPaginas}. Nada foi cobrado.`);
    const textos = [];
    for (let n = 1; n <= doc.numPages; n++) {
      let texto = '';
      try {
        const page = await doc.getPage(n);
        texto = textoDaPagina((await page.getTextContent()).items);
        page.cleanup();
      } catch (_) { texto = ''; } // página que não abre é tratada como sem texto: o modelo a lê (ou a revisão a aponta)
      textos.push({ n, texto, sem_texto: texto.replace(/\s/g, '').length < MINIMO_DE_TEXTO });
    }
    return { paginas: doc.numPages, textos };
  } finally { await task.destroy().catch(() => {}); }
}

// Um PDF só com as páginas pedidas (números a partir de 1, na ordem dada) → { base64, bytes, paginas }.
async function recortar(bytes, paginas) {
  const { PDFDocument } = require('pdf-lib');
  let origem, total;
  try { origem = await PDFDocument.load(bytes, { updateMetadata: false }); total = origem.getPageCount(); }
  catch (e) { throw erro(pareceSenha(e) ? PROTEGIDO : ILEGIVEL); }
  const lista = (Array.isArray(paginas) ? paginas : []).map(n => Math.round(Number(n))).filter(n => n >= 1 && n <= total);
  if (!lista.length) throw erro('Página fora do PDF.', 400);
  try {
    const novo = await PDFDocument.create();
    (await novo.copyPages(origem, lista.map(n => n - 1))).forEach(p => novo.addPage(p));
    const saida = Buffer.from(await novo.save());
    return { base64: saida.toString('base64'), bytes: saida.length, paginas: lista };
  } catch (_) { throw erro(ILEGIVEL); }
}

// Os lotes de uma faixa de páginas: [de, ate] em grupos de `porLote` → [[1,2,3,4],[5,6,7,8],…]
function lotes(de, ate, porLote) {
  const r = [];
  for (let i = de; i <= ate; i += porLote) r.push(Array.from({ length: Math.min(porLote, ate - i + 1) }, (_, k) => i + k));
  return r;
}

module.exports = { ler, recortar, lotes, textoDaPagina, MAX_PAGINAS_LIDAS, MINIMO_DE_TEXTO };
