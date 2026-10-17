'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./nucleo');
const Estudos = require('./estudos');
const Formato = require('./formato-arranjo');

function guitarra() {
  return { id: 'g-1', title: 'Guitarra aberta', bpm: 90, duration: 4, tuning: [40, 45, 50, 55, 59, 64],
    notes: [{ id: 'n1', time: 1, duration: 0.5, string: 1, fret: 0, midi: 64 }],
    sections: [{ id: 'intro', title: 'Introdução', from: 0, to: 4 }] };
}

test('normaliza guitarra para o contrato aberto', () => {
  const out = Formato.normalizar({ chart: guitarra(), sources: [{ format: 'midi', name: 'estudo.mid', sha256: 'abc' }] }, { instrument: 'guitarra' });
  assert.equal(out.schema, 'musique.arrangement.v1');
  assert.equal(out.tracks[0].events[0].atMs, 1000);
  assert.equal(out.tracks[0].events[0].string, 1);
  assert.equal(out.sections[0].toMs, 4000);
  assert.equal(out.sources[0].name, 'estudo.mid');
});

test('normaliza piano e bateria sem exigir corda/casa', () => {
  const piano = Estudos.obter('piano-pulsacao-v1');
  const bateria = Estudos.obter('bateria-pulsacao-v1');
  const p = Formato.normalizar({ chart: piano }, { instrument: 'piano' });
  const b = Formato.normalizar({ chart: bateria }, { instrument: 'bateria' });
  assert.equal(p.tracks[0].events[0].type, 'note');
  assert.equal(p.tracks[0].events[0].string, undefined);
  assert.equal(b.tracks[0].events[0].drum !== undefined, true);
});

test('rejeita fonte com caminho e nota fora dos limites', () => {
  assert.throws(() => Formato.normalizar({ chart: guitarra(), sources: [{ format: 'midi', name: '../estudo.mid' }] }, { instrument: 'guitarra' }), /caminho/);
  const ruim = guitarra(); ruim.notes[0].midi = 200;
  assert.throws(() => Formato.normalizar({ chart: ruim }, { instrument: 'guitarra' }), /MIDI/);
});

test('exporta enum estável', () => {
  assert.deepEqual(Formato.INSTRUMENTOS, ['violao', 'guitarra', 'baixo', 'cavaquinho', 'ukulele', 'bandolim', 'piano', 'bateria']);
  assert.equal(Formato.MAX_EVENTOS, 10000);
  assert.ok(Core);
});
