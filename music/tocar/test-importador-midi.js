'use strict';
// Casos sintéticos de SMF: não abrem arquivo, não acessam rede nem persistência.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Importador = require('./importador-midi');
const Core = require('./nucleo');

const bytesTexto = text => Array.from(text, ch => ch.charCodeAt(0));
const u16 = value => [(value >>> 8) & 255, value & 255];
const u32 = value => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const juntar = partes => partes.flat();
function vlq(value) {
  assert.ok(Number.isInteger(value) && value >= 0 && value <= 0x0fffffff);
  const resultado = [value & 0x7f];
  for (value >>>= 7; value; value >>>= 7) resultado.unshift((value & 0x7f) | 0x80);
  return resultado;
}
const evento = (delta, ...dados) => [...vlq(delta), ...dados];
const meta = (delta, tipo, dados) => evento(delta, 0xff, tipo, ...vlq(dados.length), ...dados);
const fim = (delta = 0) => meta(delta, 0x2f, []);
const andamento = (delta, micros) => meta(delta, 0x51, [(micros >>> 16) & 255, (micros >>> 8) & 255, micros & 255]);
const nome = (delta, texto) => meta(delta, 0x03, bytesTexto(texto));
const ligar = (delta, canal, midi, velocidade = 64) => evento(delta, 0x90 | canal, midi, velocidade);
const desligar = (delta, canal, midi) => evento(delta, 0x80 | canal, midi, 0);
function faixa(eventos) {
  const dados = juntar(eventos);
  return [...bytesTexto('MTrk'), ...u32(dados.length), ...dados];
}
function smf({ format = 0, ppqn = 480, tracks }) {
  return new Uint8Array([...bytesTexto('MThd'), ...u32(6), ...u16(format), ...u16(tracks.length), ...u16(ppqn), ...juntar(tracks)]);
}
function candidato(analise, id) { return analise.candidates.find(item => item.id === id); }
function quase(recebido, esperado, mensagem) {
  assert.ok(Math.abs(recebido - esperado) < 1e-9, (mensagem || 'valor') + ': ' + recebido + ' !== ' + esperado);
}

test('MIDI PPQN fixo cria chart válido, sem tempoMap redundante', () => {
  const arquivo = smf({ tracks: [faixa([
    nome(0, 'Baixo MIDI'), andamento(0, 500000), ligar(0, 0, 40), desligar(480, 0, 40), fim(),
  ])] });
  const analise = Importador.analisar(arquivo.buffer);
  assert.equal(analise.format, 0); assert.equal(analise.ppqn, 480); quase(analise.duration, 0.5);
  assert.deepEqual(analise.tempoMap, [{ time: 0, beat: 0, bpm: 120 }]);
  assert.deepEqual(candidato(analise, 't0-c0'), {
    id: 't0-c0', track: 0, channel: 0, name: 'Baixo MIDI', noteCount: 1, minMidi: 40, maxMidi: 40,
    duration: 0.5, valid: true, reason: null,
  });
  const chart = Importador.criarChart(analise, 't0-c0', { id: 'midi-fixo', title: 'Linha fixa' });
  assert.deepEqual(chart, {
    id: 'midi-fixo', title: 'Linha fixa', bpm: 120, duration: 0.5, tuning: [40, 45, 50, 55, 59, 64],
    notes: [{ id: 'midi-1', time: 0, duration: 0.5, string: 6, fret: 0, midi: 40 }], metadata: { demo: false },
  });
  assert.deepEqual(Core.validarChart(chart), chart);
  assert.equal(Object.hasOwn(chart, 'tempoMap'), false);
});

test('tempo em outra faixa e nota atravessando mudança preservam segundos, beat e mapa', () => {
  const arquivo = smf({ format: 1, tracks: [
    faixa([andamento(0, 500000), andamento(480, 1000000), fim(480)]),
    faixa([nome(0, 'Melodia'), ligar(240, 0, 45), desligar(480, 0, 45), fim()]),
  ] });
  const analise = Importador.analisar(arquivo);
  assert.equal(analise.candidates.length, 1);
  assert.deepEqual(analise.tempoMap, [
    { time: 0, beat: 0, bpm: 120 }, { time: 0.5, beat: 1, bpm: 60 },
  ]);
  quase(analise.duration, 1.5);
  const linha = candidato(analise, 't1-c0');
  assert.equal(linha.valid, true); quase(linha.duration, 1);
  const chart = Importador.criarChart(analise, linha.id, { id: 'midi-tempo', title: 'Tempo variável' });
  assert.equal(chart.bpm, 120); quase(chart.notes[0].time, 0.25); quase(chart.notes[0].duration, 0.75);
  assert.deepEqual(chart.tempoMap, { version: 1, events: analise.tempoMap });
  assert.equal(chart.notes[0].string, 5); assert.equal(chart.notes[0].fret, 0);
});

test('running status e note-on com velocidade zero encerram notas corretamente', () => {
  const arquivo = smf({ ppqn: 480, tracks: [faixa([
    ligar(0, 0, 45), evento(240, 45, 0), evento(0, 47, 64), evento(240, 47, 0), fim(),
  ])] });
  const analise = Importador.analisar(arquivo);
  const linha = candidato(analise, 't0-c0');
  assert.equal(linha.noteCount, 2); assert.equal(linha.valid, true); quase(linha.duration, 0.5);
  const chart = Importador.criarChart(analise, linha.id, { id: 'running', title: 'Running status' });
  assert.deepEqual(chart.notes.map(({ id, time, duration, string, fret, midi }) => ({ id, time, duration, string, fret, midi })), [
    { id: 'midi-1', time: 0, duration: 0.25, string: 5, fret: 0, midi: 45 },
    { id: 'midi-2', time: 0.25, duration: 0.25, string: 5, fret: 2, midi: 47 },
  ]);
});

test('a posição sugerida prioriza a menor casa na afinação padrão', () => {
  const arquivo = smf({ tracks: [faixa([
    ligar(0, 0, 40), desligar(480, 0, 40), ligar(0, 0, 45), desligar(480, 0, 45),
    ligar(0, 0, 64), desligar(480, 0, 64), ligar(0, 0, 88), desligar(480, 0, 88), fim(),
  ])] });
  const analise = Importador.analisar(arquivo);
  const chart = Importador.criarChart(analise, 't0-c0', { id: 'posicoes', title: 'Posições' });
  assert.deepEqual(chart.notes.map(nota => [nota.midi, nota.string, nota.fret]), [
    [40, 6, 0], [45, 5, 0], [64, 1, 0], [88, 1, 24],
  ]);
});

test('canal de percussão, sobreposição, nota aberta, pitch bend e extensão inválida são indisponíveis', () => {
  const percussao = Importador.analisar(smf({ tracks: [faixa([ligar(0, 9, 40), desligar(480, 9, 40), fim()])] }));
  assert.match(candidato(percussao, 't0-c9').reason, /percussão/);
  const sobreposta = Importador.analisar(smf({ tracks: [faixa([
    ligar(0, 0, 40), ligar(120, 0, 42), desligar(120, 0, 40), desligar(0, 0, 42), fim(),
  ])] }));
  assert.match(candidato(sobreposta, 't0-c0').reason, /sobrepostas/);
  const aberta = Importador.analisar(smf({ tracks: [faixa([ligar(0, 0, 40), fim()])] }));
  assert.match(candidato(aberta, 't0-c0').reason, /sem note-off/);
  const bend = Importador.analisar(smf({ tracks: [faixa([
    evento(0, 0xe0, 0, 64), ligar(0, 0, 40), desligar(480, 0, 40), fim(),
  ])] }));
  assert.match(candidato(bend, 't0-c0').reason, /pitch bend/);
  const fora = Importador.analisar(smf({ tracks: [faixa([ligar(0, 0, 39), desligar(480, 0, 39), fim()])] }));
  assert.match(candidato(fora, 't0-c0').reason, /Mi2–Mi6/);
  assert.throws(() => Importador.criarChart(fora, 't0-c0', { id: 'fora', title: 'Fora' }), /extensão/);
});

test('limites de 2.000 notas, duração do chart e duração de nota viram diagnósticos por linha', () => {
  const muitas = [];
  for (let i = 0; i < 2001; i++) { muitas.push(ligar(0, 0, 40), desligar(8, 0, 40)); }
  muitas.push(fim());
  const analiseMuitas = Importador.analisar(smf({ ppqn: 96, tracks: [faixa(muitas)] }));
  assert.match(candidato(analiseMuitas, 't0-c0').reason, /2.000/);

  const longa = [];
  for (let i = 0; i < 16; i++) longa.push(ligar(0, 0, 40), desligar(11520, 0, 40));
  longa.push(fim());
  const analiseLonga = Importador.analisar(smf({ ppqn: 96, tracks: [faixa(longa)] }));
  assert.match(candidato(analiseLonga, 't0-c0').reason, /900/);

  const curta = Importador.analisar(smf({ tracks: [faixa([ligar(0, 0, 40), desligar(1, 0, 40), fim()])] }));
  assert.match(candidato(curta, 't0-c0').reason, /0,04/);
});

test('recusa formatos, chunks e tempo globais inválidos antes de oferecer uma linha', () => {
  const base = faixa([ligar(0, 0, 40), desligar(480, 0, 40), fim()]);
  assert.throws(() => Importador.analisar(smf({ format: 2, tracks: [base] })), /formato 0 ou 1/);
  assert.throws(() => Importador.analisar(smf({ ppqn: 0xe728, tracks: [base] })), /SMPTE/);
  assert.throws(() => Importador.analisar(smf({ tracks: [base] }).slice(0, -1)), /truncad|fim/);
  assert.throws(() => Importador.analisar(smf({ tracks: [faixa([[0x80, 0x80, 0x80, 0x80, 0]])] })), /VLQ/);
  assert.throws(() => Importador.analisar(smf({ tracks: [faixa([[0, 40, 64], fim()])] })), /running status/);
  assert.throws(() => Importador.analisar(smf({ format: 1, tracks: [
    faixa([andamento(0, 500000), fim()]), faixa([andamento(0, 600000), fim()]),
  ] })), /conflitante/);
  assert.throws(() => Importador.analisar(smf({ tracks: [faixa([andamento(0, 100000), fim()])] })), /BPM/);
  assert.throws(() => Importador.analisar(new Uint8Array(Importador.LIMITE_BYTES + 1)), /512 KiB/);
});

test('compacta tempos idênticos no mesmo tick e recusa mapa com mais de 512 eventos', () => {
  const iguais = Importador.analisar(smf({ tracks: [faixa([
    andamento(0, 500000), andamento(0, 500000), ligar(0, 0, 40), desligar(480, 0, 40), fim(),
  ])] }));
  assert.deepEqual(iguais.tempoMap, [{ time: 0, beat: 0, bpm: 120 }]);
  const eventos = [];
  for (let i = 0; i < 513; i++) eventos.push(andamento(i === 0 ? 0 : 1, 500000));
  eventos.push(fim());
  assert.throws(() => Importador.analisar(smf({ tracks: [faixa(eventos)] })), /512/);
});

test('análise é associada ao arquivo lido e o UMD funciona sem CommonJS', () => {
  const analise = Importador.analisar(smf({ tracks: [faixa([ligar(0, 0, 40), desligar(480, 0, 40), fim()])] }));
  assert.throws(() => Importador.criarChart({ ...analise }, 't0-c0', { id: 'x', title: 'X' }), /Analise o arquivo novamente/);
  const source = fs.readFileSync(path.join(__dirname, 'importador-midi.js'), 'utf8');
  const sandbox = { window: { MusiqueTocarCore: Core }, Uint8Array, ArrayBuffer, WeakMap, Number, Object, Math, Error };
  vm.runInNewContext(source, sandbox);
  assert.equal(typeof sandbox.window.MusiqueTocarImportadorMidi.analisar, 'function');
  const web = sandbox.window.MusiqueTocarImportadorMidi.analisar(smf({ tracks: [faixa([ligar(0, 0, 40), desligar(480, 0, 40), fim()])] }));
  assert.equal(web.candidates[0].id, 't0-c0');
});
