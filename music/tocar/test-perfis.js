'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Perfis = require('./perfis');

test('Perfis expõem cópias de seis cordas e contrabaixo padrão', () => {
  const violao = Perfis.obter('violao');
  const guitarra = Perfis.obter('guitarra');
  const baixo = Perfis.obter('baixo');
  assert.deepEqual(violao.tuning, [40, 45, 50, 55, 59, 64]);
  assert.deepEqual(guitarra.tuning, violao.tuning);
  assert.equal(violao.id, 'seis-cordas');
  assert.equal(baixo.id, 'baixo');
  assert.equal(baixo.strings, 4);
  assert.deepEqual(baixo.tuning, [28, 33, 38, 43]);
  assert.deepEqual(baixo.detector, { minHz: 35, maxHz: 700, frameMs: 128, windowMs: 128, stepMs: 48 });
  baixo.tuning[0] = 0;
  assert.deepEqual(Perfis.obter('baixo').tuning, [28, 33, 38, 43]);
});

test('Perfis reconhecem somente afinações padrão completas', () => {
  assert.equal(Perfis.porAfinacao([40, 45, 50, 55, 59, 64]).id, 'seis-cordas');
  assert.equal(Perfis.porAfinacao([28, 33, 38, 43]).id, 'baixo');
  assert.equal(Perfis.porAfinacao([28, 33, 38, 44]), null);
  assert.equal(Perfis.porAfinacao([28, 33, 38]), null);
  assert.equal(Perfis.obter('piano').layout, 'piano');
});
