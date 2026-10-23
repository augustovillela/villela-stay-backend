'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classificarTexto, analisarPdf, LIMITE_BYTES } = require('./importador-pdf');

test('classifica cifra textual por acordes', () => {
  const resultado = classificarTexto('[Intro] C7M Am7 Bm7 Em\nEu vou cantar a canção');
  assert.equal(resultado.tipo, 'cifra');
  assert.ok(resultado.acordes >= 4);
  assert.equal(resultado.simbolos, 0);
});

test('classifica partitura textual por glifos e contexto', () => {
  const resultado = classificarTexto('Yesterday - piano solo\n    ');
  assert.equal(resultado.tipo, 'partitura');
  assert.ok(resultado.simbolos >= 5);
});

test('mantém revisão manual para texto sem sinais suficientes', () => {
  const resultado = classificarTexto('Título da obra\nAutor desconhecido\ntexto editorial');
  assert.equal(resultado.tipo, 'desconhecido');
});

test('rejeita arquivo vazio, não PDF e limite de tamanho', async () => {
  await assert.rejects(() => analisarPdf(Buffer.alloc(0)), /PDF está vazio/);
  await assert.rejects(() => analisarPdf(Buffer.from('texto')), /não é um PDF válido/);
  await assert.rejects(() => analisarPdf(Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(LIMITE_BYTES)])), /no máximo 10 MiB/);
});
