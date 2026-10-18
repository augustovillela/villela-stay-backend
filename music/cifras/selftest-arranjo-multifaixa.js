'use strict';
const assert = require('node:assert/strict');
const { gerar } = require('./motor/arranjo-multifaixa');
const doc = { meta: { titulo: 'Teste multifaixa', bpm: 120 }, secoes: [{ linhas: [{ tipo: 'letra', segmentos: [
  { acorde: 'C', texto: 'um' }, { acorde: 'Am', texto: 'dois' }, { acorde: 'F', texto: 'três' }, { acorde: 'G7', texto: 'quatro' },
] }] }] };
const pacote = gerar(doc, { id: 'multi-teste', title: 'Teste multifaixa' });
assert.equal(pacote.schema, 'musique.arrangement.v1');
assert.equal(pacote.tracks.length, 4);
assert.deepEqual(pacote.tracks.map((t) => t.instrument), ['violao', 'baixo', 'piano', 'bateria']);
assert.ok(pacote.tracks[0].events.length > 0);
assert.ok(pacote.tracks[1].events.length > 0);
assert.ok(pacote.tracks[2].events.length >= 4);
assert.ok(pacote.tracks[3].events.length >= 8);
assert.ok(pacote.metadata.aproximado);
console.log('selftest-arranjo-multifaixa: ok');
