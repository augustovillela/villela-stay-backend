'use strict';
const assert = require('node:assert/strict');
const { gerar, ocorrencias } = require('./motor/acompanhamento');

const doc = { meta: { titulo: 'Teste', bpm: 120 }, secoes: [{ tipo: 'verso', linhas: [{ tipo: 'letra', segmentos: [
  { acorde: 'C', texto: 'um' }, { acorde: 'Am', texto: 'dois' }, { acorde: 'F', texto: 'três' }, { acorde: 'G7', texto: 'quatro' },
] }] }] };
assert.deepEqual(ocorrencias(doc), ['C', 'Am', 'F', 'G7']);
const chart = gerar(doc, { id: 'teste', title: 'Teste · acompanhamento' });
assert.equal(chart.bpm, 120);
assert.equal(chart.notes.length, 4);
assert.equal(chart.notes[0].time, 0);
assert.equal(chart.notes[1].time, 0.5);
assert.ok(chart.notes.every((n) => Number.isInteger(n.string) && Number.isInteger(n.fret) && Number.isInteger(n.midi)));
assert.equal(chart.metadata.aproximado, true);
assert.deepEqual(chart.metadata.desconhecidos, []);
console.log('selftest-acompanhamento: ok');
