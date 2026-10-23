const test = require('node:test');
const assert = require('node:assert/strict');
const Detector = require('./polifonico');

function sinal(midis, sr = 48000, seconds = 0.064) {
  const total = Math.ceil(sr * seconds);
  return Float32Array.from({ length: total }, (_, i) => midis.reduce((sum, midi) => sum + 0.18 * Math.sin(2 * Math.PI * Detector.midiHz(midi) * i / sr), 0));
}

test('detecta duas alturas simultâneas sem abrir o detector monofônico', () => {
  const result = Detector.analisar(sinal([60, 64]), 48000, { minMidi: 48, maxMidi: 72 });
  assert.deepEqual(result.midis, [60, 64]);
  assert.ok(result.confidence > 0.2);
});

test('recusa silêncio, clipping e amostras inválidas', () => {
  assert.deepEqual(Detector.analisar(new Float32Array(3072), 48000).midis, []);
  const clipped = new Float32Array(3072).fill(1);
  assert.deepEqual(Detector.analisar(clipped, 48000).midis, []);
  const invalid = new Float32Array(3072); invalid[2] = NaN;
  assert.deepEqual(Detector.analisar(invalid, 48000).midis, []);
});
