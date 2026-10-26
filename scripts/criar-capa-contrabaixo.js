'use strict';

const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');

const arquivo = path.join(__dirname, '..', 'output', 'pdf', 'curso-contrabaixo.pdf');
const temporario = arquivo + '.tmp';

async function main() {
  const original = await PDFDocument.load(fs.readFileSync(arquivo));
  const pdf = await PDFDocument.create();
  const [pagina] = await pdf.copyPages(original, [0]);
  const capa = pdf.addPage([595.28, 841.89]);
  const largura = capa.getWidth();
  const altura = capa.getHeight();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);

  capa.drawRectangle({ x: 0, y: 0, width: largura, height: altura, color: rgb(0.055, 0.12, 0.17) });
  capa.drawRectangle({ x: 0, y: 0, width: largura, height: 270, color: rgb(0.09, 0.25, 0.30) });
  capa.drawCircle({ x: 470, y: 700, size: 150, color: rgb(0.18, 0.39, 0.43), opacity: 0.55 });
  capa.drawCircle({ x: 80, y: 145, size: 190, color: rgb(0.12, 0.31, 0.35), opacity: 0.5 });

  // Ilustração vetorial de um contrabaixo: braço, escala, corpo, captadores e cordas.
  capa.drawRectangle({ x: 312, y: 125, width: 28, height: 570, rotate: degrees(-18), color: rgb(0.45, 0.23, 0.12) });
  capa.drawRectangle({ x: 320, y: 125, width: 12, height: 570, rotate: degrees(-18), color: rgb(0.10, 0.08, 0.06), opacity: 0.8 });
  for (let i = 0; i < 16; i += 1) capa.drawLine({ start: { x: 310 + i * 2.2, y: 175 + i * 31 }, end: { x: 338 + i * 2.2, y: 175 + i * 31 }, thickness: 1.2, color: rgb(0.75, 0.55, 0.28), opacity: 0.7 });
  capa.drawEllipse({ x: 365, y: 190, xScale: 125, yScale: 92, rotate: degrees(-18), color: rgb(0.68, 0.25, 0.12) });
  capa.drawEllipse({ x: 365, y: 190, xScale: 96, yScale: 68, rotate: degrees(-18), color: rgb(0.22, 0.09, 0.06), opacity: 0.55 });
  capa.drawRectangle({ x: 333, y: 178, width: 74, height: 12, rotate: degrees(-18), color: rgb(0.06, 0.05, 0.04) });
  capa.drawRectangle({ x: 340, y: 208, width: 55, height: 9, rotate: degrees(-18), color: rgb(0.06, 0.05, 0.04) });
  for (let i = 0; i < 4; i += 1) capa.drawLine({ start: { x: 300 + i * 3, y: 145 }, end: { x: 337 + i * 3, y: 705 }, thickness: 1, color: rgb(0.88, 0.77, 0.53), opacity: 0.85 });

  capa.drawText('MUSIQUE', { x: 58, y: 770, size: 15, font: negrito, color: rgb(0.88, 0.74, 0.36), characterSpacing: 2 });
  capa.drawText('CURSO DE', { x: 58, y: 646, size: 20, font: negrito, color: rgb(0.82, 0.9, 0.91) });
  capa.drawText('CONTRABAIXO', { x: 58, y: 606, size: 34, font: negrito, color: rgb(1, 1, 1) });
  capa.drawText('ELÉTRICO', { x: 58, y: 566, size: 30, font: negrito, color: rgb(0.65, 0.83, 0.84) });
  capa.drawLine({ start: { x: 60, y: 530 }, end: { x: 245, y: 530 }, thickness: 3, color: rgb(0.88, 0.74, 0.36) });
  capa.drawText('Do primeiro som ao groove,', { x: 60, y: 492, size: 15, font: fonte, color: rgb(0.86, 0.9, 0.9) });
  capa.drawText('à criação e à performance', { x: 60, y: 470, size: 15, font: fonte, color: rgb(0.86, 0.9, 0.9) });
  capa.drawText('Livro-base do curso · 43 capítulos', { x: 60, y: 80, size: 11, font: fonte, color: rgb(0.67, 0.76, 0.78) });

  const paginas = await pdf.copyPages(original, original.getPageIndices());
  paginas.forEach((p) => pdf.addPage(p));
  pdf.setTitle('Curso de contrabaixo elétrico — Musique');
  pdf.setAuthor('Musique · Villela Stay');
  pdf.setSubject('Livro-base do curso de contrabaixo elétrico');
  fs.writeFileSync(temporario, await pdf.save());
  fs.renameSync(temporario, arquivo);
  console.log(JSON.stringify({ ok: true, paginasOriginais: original.getPageCount(), paginasFinais: pdf.getPageCount(), arquivo }));
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
