'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'docs', 'books', 'ukulele');
const slugify = (value) => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titulo = (arquivo) => {
  const texto = fs.readFileSync(arquivo, 'utf8');
  const linha = texto.split(/\r?\n/).find((x) => /^#\s+/.test(x));
  return linha ? linha.replace(/^#\s+/, '').trim() : path.basename(arquivo, '.md');
};
const arquivos = (pasta) => fs.readdirSync(path.join(ROOT, pasta)).filter((x) => x.endsWith('.md')).sort().map((x) => path.join(ROOT, pasta, x));
const capitulos = [];
let numero = 1;
for (const parte of ['parte-1', 'parte-2']) {
  for (const arquivo of arquivos(parte)) {
    const texto = fs.readFileSync(arquivo, 'utf8');
    const nome = titulo(arquivo);
    capitulos.push({ numero, slug: `ukulele-${String(numero).padStart(2, '0')}-${slugify(nome)}`, titulo: nome, parte, conteudo: texto, resumo: `Estude ${nome.toLowerCase()} com leitura, prática, escuta e aplicação no ukulele.`, objetivo: `Compreender e aplicar ${nome.toLowerCase()} no instrumento.`, arquivo: path.relative(ROOT, arquivo).replace(/\\/g, '/') });
    numero += 1;
  }
}
const anexos = arquivos('anexos').map((arquivo, index) => ({ numero: index + 1, slug: `anexo-${String(index + 1).padStart(2, '0')}-${slugify(titulo(arquivo))}`, titulo: titulo(arquivo), conteudo: fs.readFileSync(arquivo, 'utf8'), arquivo: path.relative(ROOT, arquivo).replace(/\\/g, '/') }));
const partes = [
  ['parte-1', 'Conhecendo o ukulele', capitulos.filter((x) => x.parte === 'parte-1').map((x) => x.numero)],
  ['parte-2', 'Do básico à criação e performance', capitulos.filter((x) => x.parte === 'parte-2').map((x) => x.numero)],
];
const CURSO = { id: 'curso-ukulele-livro', titulo: 'Livro digital de ukulele', subtitulo: 'Do primeiro som à criação, repertório e performance', versao: '0.1', descricao: 'Formação completa baseada no livro Ukulele: do zero ao avançado.', paginas: 203, capitulos: capitulos.length, anexos: anexos.length, trilhas: [{ nome: 'Conhecer', resumo: 'Instrumento, postura, leitura, acordes e mapas.' }, { nome: 'Ouvir e reconhecer', resumo: 'Pulso, dinâmica, articulação, timbre e escuta crítica.' }, { nome: 'Aplicar', resumo: 'Repertório, arranjo, improvisação e performance.' }] };

module.exports = { CURSO, partes, capitulos, anexos };
