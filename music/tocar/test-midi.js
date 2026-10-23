'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Midi = require('./midi');

test('Entrada MIDI lista dispositivos, conecta por id e encaminha notas', async () => {
  const anterior = global.navigator;
  const mensagens = [], estados = [];
  const input = { id: 'pad-1', name: 'Bateria USB', onmidimessage: null };
  const acesso = { inputs: new Map([[input.id, input]]), onstatechange: null };
  Object.defineProperty(global, 'navigator', { configurable: true, value: { requestMIDIAccess: async () => acesso } });
  try {
    const entrada = Midi.criar({ onEvent: e => mensagens.push(e), onStatus: s => estados.push(s) });
    assert.deepEqual(await entrada.iniciar('pad-1'), [{ id: 'pad-1', name: 'Bateria USB' }]);
    assert.equal(entrada.conectado(), true);
    input.onmidimessage({ data: [0x99, 36, 112], timeStamp: 123.5 });
    input.onmidimessage({ data: [0x89, 36, 0], timeStamp: 124 });
    input.onmidimessage({ data: [0x90, 38, 100], timeStamp: 125 });
    input.onmidimessage({ data: [0xb0, 1, 127], timeStamp: 126 });
    assert.deepEqual(mensagens, [
      { midi: 36, velocity: 112, channel: 9, time: 123.5 },
      { midi: 36, velocity: 0, channel: 9, time: 124 },
      { midi: 38, velocity: 100, channel: 0, time: 125 }
    ]);
    assert.equal(estados.at(-1).estado, 'conectado');
    entrada.parar();
    assert.equal(entrada.conectado(), false);
    assert.equal(input.onmidimessage, null);
  } finally { Object.defineProperty(global, 'navigator', { configurable: true, value: anterior }); }
});

test('Entrada MIDI recusa navegador sem Web MIDI e desconecta entrada removida', async () => {
  const anterior = global.navigator;
  Object.defineProperty(global, 'navigator', { configurable: true, value: {} });
  try { await assert.rejects(Midi.criar().iniciar(), /não oferece Web MIDI/); }
  finally { Object.defineProperty(global, 'navigator', { configurable: true, value: anterior }); }
  const input = { id: 'pad-2', name: 'Pad', onmidimessage: null };
  const acesso = { inputs: new Map([[input.id, input]]), onstatechange: null };
  const estados = [];
  Object.defineProperty(global, 'navigator', { configurable: true, value: { requestMIDIAccess: async () => acesso } });
  try {
    const entrada = Midi.criar({ onStatus: s => estados.push(s) });
    await entrada.iniciar('pad-2');
    acesso.inputs.delete('pad-2');
    acesso.onstatechange();
    assert.equal(entrada.conectado(), false);
    assert.match(estados.at(-1).mensagem, /desconectada/);
  } finally { Object.defineProperty(global, 'navigator', { configurable: true, value: anterior }); }
});
