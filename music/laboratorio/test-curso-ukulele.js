'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const curso = require('./curso-ukulele');

test('ukulele: curso usa o manuscrito do livro e mantém 43 capítulos', () => {
  assert.equal(curso.CURSO.capitulos, 43);
  assert.equal(curso.capitulos.length, 43);
  assert.equal(curso.anexos.length, 6);
  curso.capitulos.forEach((capitulo, index) => {
    assert.equal(capitulo.numero, index + 1);
    assert.ok(capitulo.conteudo.length > 500, capitulo.slug);
    assert.ok(capitulo.titulo.startsWith('Capítulo '), capitulo.slug);
  });
});

test('ukulele: partes e trilhas estão disponíveis para a página do curso', () => {
  assert.equal(curso.partes.length, 2);
  assert.deepEqual(curso.partes.map((x) => x[0]), ['parte-1', 'parte-2']);
  assert.equal(curso.CURSO.trilhas.length, 3);
  assert.deepEqual(curso.capitulos.map((x) => x.slug).slice(0, 2), ['ukulele-01-capitulo-1-historia-e-caracteristicas', 'ukulele-02-capitulo-2-tipos-de-ukulele']);
});

test('ukulele: páginas, links e acompanhamento docente permanecem conectados', () => {
  const paginas = fs.readFileSync(require.resolve('./paginas'), 'utf8');
  const api = fs.readFileSync(require.resolve('./rotas-api'), 'utf8');
  const cliente = fs.readFileSync(require.resolve('./cliente/base'), 'utf8');
  for (const trecho of ["'/music/curso-ukulele/professor'", 'data-ukulele-professor-dashboard', 'Área do professor']) assert.ok(paginas.includes(trecho), trecho);
  for (const trecho of ["B + '/ukulele/progresso'", "B + '/ukulele/praticas'", "B + '/prof/ukulele/alunos'", "B + '/prof/ukulele/observacoes'", "B + '/prof/ukulele/tarefas'"]) assert.ok(api.includes(trecho), trecho);
  assert.ok(cliente.includes('painelProfessorUkulele'));
});
