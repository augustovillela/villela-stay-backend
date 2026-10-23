'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { configuracao, disponivel, converterPdf, LIMITE_BYTES, TIMEOUT_MS } = require('./omr');

test('OMR expõe configuração e limites seguros', () => {
  const c = configuracao();
  assert.equal(typeof c.java, 'string');
  assert.equal(typeof c.app, 'string');
  assert.equal(typeof c.classpath, 'string');
  assert.equal(LIMITE_BYTES, 10 * 1024 * 1024);
  assert.equal(TIMEOUT_MS, 180000);
  assert.equal(typeof disponivel(), 'boolean');
});

test('OMR rejeita entradas que não são PDFs antes de iniciar processo', async () => {
  await assert.rejects(() => converterPdf(Buffer.alloc(0)), /PDF está vazio/);
  await assert.rejects(() => converterPdf(Buffer.from('texto')), /não é um PDF válido/);
  await assert.rejects(() => converterPdf(Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(LIMITE_BYTES)])), /no máximo 10 MiB/);
});
