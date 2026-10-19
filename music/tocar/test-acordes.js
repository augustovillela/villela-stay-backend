const test = require('node:test');
const assert = require('node:assert/strict');
const Acordes = require('./acordes');

test('identifica tríades e inversões', () => {
  assert.equal(Acordes.identificar([60, 64, 67]).symbol, 'C');
  const inversion = Acordes.identificar([64, 67, 72]);
  assert.equal(inversion.symbol, 'C');
  assert.equal(inversion.inversion, 4);
});

test('identifica tétrades e qualidades suspensas', () => {
  assert.equal(Acordes.identificar([60, 64, 67, 71]).symbol, 'Cmaj7');
  assert.equal(Acordes.identificar([62, 65, 69, 72]).symbol, 'Dm7');
  assert.equal(Acordes.identificar([60, 62, 67]).symbol, 'Csus2');
  assert.equal(Acordes.identificar([60, 65, 67]).symbol, 'Csus4');
});

test('ignora duplicações e recusa grupos insuficientes ou desconhecidos', () => {
  assert.equal(Acordes.identificar([{ midi: 60 }, { midi: 64 }, { midi: 67 }, { midi: 72 }]).symbol, 'C');
  assert.equal(Acordes.identificar([60, 64]), null);
  assert.equal(Acordes.identificar([60, 61, 62]), null);
});
