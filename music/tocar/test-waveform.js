'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Waveform = require('./waveform');

test('Limita posições ao contrato de deslocamento e à duração conhecida do áudio', () => {
  assert.equal(Waveform.LIMITE_OFFSET_MS, 600000);
  assert.equal(Waveform.limitarMs(-1, 2000), 0);
  assert.equal(Waveform.limitarMs(123.6, 2000), 124);
  assert.equal(Waveform.limitarMs(5000, 2000), 2000);
  assert.equal(Waveform.limitarMs(700000, 800000), 600000);
  assert.equal(Waveform.limitarMs(9, 0), 0);
  assert.equal(Waveform.limitarMs(700000), 600000);
});

test('Converte pixels e milissegundos sem sair da área útil da waveform', () => {
  assert.equal(Waveform.msParaX(0, 300, 3000), 0);
  assert.equal(Waveform.msParaX(1500, 300, 3000), 150);
  assert.equal(Waveform.msParaX(8000, 300, 3000), 300);
  assert.equal(Waveform.xParaMs(0, 300, 3000), 0);
  assert.equal(Waveform.xParaMs(150, 300, 3000), 1500);
  assert.equal(Waveform.xParaMs(600, 300, 3000), 3000);
  assert.equal(Waveform.xParaMs(20, 0, 3000), 0);
});

test('Reduz PCM em picos por coluna sem inventar valores fora do intervalo audível', () => {
  const peaks = Waveform.picos(new Float32Array([-1, -0.5, 0, 0.8, 1]), 3);
  assert.deepEqual(peaks.slice(0, 2), [{ min: -1, max: -1 }, { min: -0.5, max: 0 }]);
  assert.ok(Math.abs(peaks[2].min - 0.8) < 1e-6); assert.equal(peaks[2].max, 1);
  assert.deepEqual(Waveform.picos(new Float32Array([NaN, Infinity]), 2), [{ min: 0, max: 0 }, { min: 0, max: 0 }]);
  assert.deepEqual(Waveform.picos(null, 2), []);
});

test('Usa somente um canal do AudioBuffer como referência leve e determinística', () => {
  const buffer = { numberOfChannels: 2, getChannelData(channel) { return channel === 0 ? new Float32Array([-.25, .75]) : new Float32Array([1, 1]); } };
  assert.deepEqual(Waveform.picosDoBuffer(buffer, 2), [{ min: -.25, max: -.25 }, { min: .75, max: .75 }]);
  assert.deepEqual(Waveform.picosDoBuffer({ numberOfChannels: 0, getChannelData() {} }, 2), []);
});
