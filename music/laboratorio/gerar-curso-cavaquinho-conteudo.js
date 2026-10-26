'use strict';

const fs = require('fs');
const path = require('path');
const origem = process.argv[2] || 'D:/ClaudeData/Claude/dados/music/livro-cavaquinho';
const destino = process.argv[3] || path.join(__dirname, 'curso-cavaquinho-conteudo.json');

const limpar = (texto) => String(texto || '')
  .replace(/^---[\s\S]*?---\s*/m, '')
  .replace(/^##?\s+Revisão de qualidade do autor[\s\S]*?(?=^##?\s|$)/gim, '')
  .replace(/\r/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const arquivos = [];
for (let parte = 1; parte <= 10; parte += 1) {
  const pasta = path.join(origem, `parte-${parte}`);
  if (!fs.existsSync(pasta)) continue;
  for (const nome of fs.readdirSync(pasta).filter((x) => /^cap-\d+-.+\.md$/i.test(x))) {
    const match = nome.match(/^cap-(\d+)-(.+)\.md$/i);
    arquivos.push({ parte, numero: Number(match[1]), arquivo: nome, caminho: path.join(pasta, nome) });
  }
}
arquivos.sort((a, b) => a.numero - b.numero);
if (arquivos.length !== 38) throw new Error(`Esperados 38 capítulos, encontrados ${arquivos.length}`);

const capitulos = arquivos.map((x) => ({
  numero: x.numero,
  parte: x.parte,
  arquivo: x.arquivo,
  titulo: (limpar(fs.readFileSync(x.caminho, 'utf8')).match(/^#\s+(.+)$/m) || [])[1] || x.arquivo,
  conteudo: limpar(fs.readFileSync(x.caminho, 'utf8')),
}));

const documento = {
  schema: 'musique.course.editorial.v1',
  curso: 'curso-cavaquinho-livro',
  origem: 'livro-cavaquinho',
  total_capitulos: capitulos.length,
  capitulos,
};
fs.writeFileSync(destino, JSON.stringify(documento, null, 2) + '\n', 'utf8');
console.log(`Gerados ${capitulos.length} capítulos em ${destino}`);
