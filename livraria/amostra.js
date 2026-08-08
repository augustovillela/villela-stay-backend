// =====================================================================
// Livraria Villela — AMOSTRA ("Folhear")
// Recorta as N primeiras páginas do PDF do livro para o visitante folhear
// antes de comprar, como faria numa livraria física.
//
// - O PDF completo continua privado (DATA_DIR/livraria/pdfs, fora do estático).
//   A amostra é um arquivo DERIVADO, guardado em .../amostras.
// - Geração é preguiçosa (na 1ª visita) e cacheada por (livro, versão do
//   arquivo, nº de páginas): trocar o PDF do livro invalida a amostra sozinho.
// - pdf-lib é JS puro (sem binário nativo) — mesma regra do node:sqlite.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { LIVRARIA_DIR } = require('./db');
const { caminhoPDF } = require('./downloads');

const AMOSTRA_DIR = path.join(LIVRARIA_DIR, 'amostras');
fs.mkdirSync(AMOSTRA_DIR, { recursive: true });

// Quantas páginas o visitante folheia (decisão comercial do Augusto: 15).
const PAGINAS_PADRAO = Number(process.env.LIVRARIA_AMOSTRA_PAGINAS || 15);
// Trava para livro curto: a amostra nunca passa de 25% da obra — senão um
// título de 40 páginas entregaria quase metade de graça.
const TETO_PROPORCAO = 0.25;

function quantasPaginas(total, desejadas = PAGINAS_PADRAO) {
  if (!total || total < 1) return 0;
  const teto = Math.max(1, Math.floor(total * TETO_PROPORCAO));
  return Math.max(1, Math.min(desejadas, teto, total));
}

// Gera (ou reaproveita do cache) a amostra do livro. Devolve null quando o
// livro não tem PDF ativo. Assíncrona: pdf-lib parseia o documento inteiro.
async function obterAmostra(repo, book, desejadas = PAGINAS_PADRAO) {
  const file = repo.Files.ativo(book.id);
  if (!file) return null;
  const origem = caminhoPDF(file.filename);
  if (!fs.existsSync(origem)) return null;

  const destino = path.join(AMOSTRA_DIR, `${book.id}-v${file.versao || 1}-${desejadas}p.pdf`);
  if (fs.existsSync(destino)) {
    const st = fs.statSync(destino);
    return { caminho: destino, tamanho: st.size, paginas: lerPaginasDoNome(destino) };
  }

  const { PDFDocument } = require('pdf-lib');
  const src = await PDFDocument.load(fs.readFileSync(origem), { ignoreEncryption: true, updateMetadata: false });
  const total = src.getPageCount();
  const n = quantasPaginas(total, desejadas);
  if (!n) return null;

  const out = await PDFDocument.create();
  const paginas = await out.copyPages(src, Array.from({ length: n }, (_, i) => i));
  paginas.forEach(p => out.addPage(p));
  out.setTitle(`${book.titulo} — amostra (${n} primeiras páginas)`);
  out.setAuthor(book.autor || 'Augusto Villela');
  out.setSubject('Amostra gratuita. O livro completo está em livros.villelastay.com.br');
  out.setProducer('Livraria Villela');

  fs.writeFileSync(destino, Buffer.from(await out.save()));
  // Limpa amostras velhas do mesmo livro (versão anterior do PDF).
  try {
    for (const f of fs.readdirSync(AMOSTRA_DIR)) {
      if (f.startsWith(book.id + '-') && f !== path.basename(destino)) fs.unlinkSync(path.join(AMOSTRA_DIR, f));
    }
  } catch (_) {}
  return { caminho: destino, tamanho: fs.statSync(destino).size, paginas: n };
}

function lerPaginasDoNome(p) {
  const m = /-(\d+)p\.pdf$/.exec(path.basename(p));
  return m ? Number(m[1]) : PAGINAS_PADRAO;
}

// Quantas páginas a amostra deste livro terá (para o texto do botão), sem gerar nada.
function paginasPrevistas(repo, book, desejadas = PAGINAS_PADRAO) {
  const file = repo.Files.ativo(book.id);
  if (!file) return 0;
  return desejadas; // o total real só se sabe abrindo o PDF; o texto usa "até N"
}

function temAmostra(repo, book) {
  return !!repo.Files.ativo(book.id);
}

module.exports = { obterAmostra, temAmostra, paginasPrevistas, PAGINAS_PADRAO, AMOSTRA_DIR };
