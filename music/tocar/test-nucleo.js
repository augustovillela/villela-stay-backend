'use strict';
// Testes de contrato com fluxos sintéticos de medidas. Não abrem áudio,
// microfone, banco ou rede; a precisão do detector exige teste separado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('./nucleo');
let count = 0;
function test(name, fn) { fn(); count++; console.log('ok ' + count + ' - ' + name); }
const tuning = [40, 45, 50, 55, 59, 64];
function note(id, time, string = 6, fret = 0, duration = 0.1) {
  return { id, time, duration, string, fret, midi: tuning[6 - string] + fret };
}
function chart(notes = [note('n1', 1)], duration = 4) {
  return { id: 'test', title: 'Exercício de teste', bpm: 90, duration, tuning: tuning.slice(), notes };
}
function hz(midi, cents = 0) { return 440 * 2 ** ((midi - 69 + cents / 100) / 12); }
function feed(j, start, end, midi = 40, extra = {}) {
  let result = null;
  const n = Math.round((end - start) / 0.01);
  for (let i = 0; i <= n; i++) {
    const s = { time: start + i * 0.01, hz: hz(midi), confidence: 0.95, rms: 0.1, ...extra };
    if (extra.onset) s.onset = i === 0;
    result = j.amostrar(s) || result;
  }
  return result;
}

test('demo original válida, 48 ids únicos e seis cordas', () => {
  const d = Core.demoChart();
  assert.equal(d.notes.length, 48);
  assert.equal(new Set(d.notes.map(n => n.id)).size, 48);
  assert.equal(new Set(d.notes.map(n => n.string)).size, 6);
  assert.equal(d.bpm, 90);
  assert.equal(d.title, 'Primeiro riff');
  assert.equal(d.metadata.demo, true);
  assert.ok(d.duration > 50 && d.duration < 65);
  assert.deepEqual(Core.validarChart(d), d);
});

test('validação ordena sem alterar a entrada e não compartilha notas/afinação', () => {
  const source = chart([note('b', 2), note('a', 1)]);
  const normalized = Core.validarChart(source);
  assert.deepEqual(normalized.notes.map(n => n.id), ['a', 'b']);
  assert.deepEqual(source.notes.map(n => n.id), ['b', 'a']);
  normalized.notes[0].fret = 9; normalized.tuning[0] = 41;
  assert.equal(source.notes[1].fret, 0); assert.equal(source.tuning[0], 40);
});

test('tempoMap opcional preserva a medida MIDI fechada sem alterar charts antigos', () => {
  const source = chart([note('n1', 1)], 4);
  source.bpm = 120;
  source.tempoMap = { version: 1, events: [
    { time: 0, beat: 0, bpm: 120 },
    { time: 1.25, beat: 2.5, bpm: 90 }
  ] };
  const normalized = Core.validarChart(source);
  assert.deepEqual(normalized.tempoMap, source.tempoMap);
  normalized.tempoMap.events[1].bpm = 80;
  assert.equal(source.tempoMap.events[1].bpm, 90);
  assert.equal(Object.prototype.hasOwnProperty.call(Core.validarChart(chart()), 'tempoMap'), false);
});

test('tempoMap recusa campos extras, eventos insuficientes, ordem inválida e BPM incompatível', () => {
  function mapped() {
    const d = chart([note('n1', 1)], 4);
    d.bpm = 120;
    d.tempoMap = { version: 1, events: [{ time: 0, beat: 0, bpm: 120 }, { time: 1, beat: 2, bpm: 90 }] };
    return d;
  }
  let d = mapped(); d.tempoMap.extra = true;
  assert.throws(() => Core.validarChart(d), /campos inválidos/);
  d = mapped(); d.tempoMap.events = [d.tempoMap.events[0]];
  assert.throws(() => Core.validarChart(d), /2 a 512/);
  d = mapped(); d.tempoMap.events[1].beat = 0;
  assert.throws(() => Core.validarChart(d), /crescer estritamente/);
  d = mapped(); d.tempoMap.events[1].beat = 999;
  assert.throws(() => Core.validarChart(d), /não correspondem ao BPM anterior/);
  d = mapped(); d.tempoMap.events[1].time = 4.1;
  assert.throws(() => Core.validarChart(d), /Tempo do evento/);
  d = mapped(); d.tempoMap.events[0].bpm = 121;
  assert.throws(() => Core.validarChart(d), /BPM do arranjo/);
  d = mapped(); d.tempoMap.events = Array.from({ length: 513 }, (_, i) => ({ time: i / 1000, beat: i, bpm: 120 }));
  assert.throws(() => Core.validarChart(d), /2 a 512/);
});

test('corda 1 é mi aguda e MIDI deve concordar com casa e afinação', () => {
  const d = chart([note('aguda', 1, 1, 3)]);
  assert.equal(Core.validarChart(d).notes[0].midi, 67);
  d.notes[0].midi = 55;
  assert.throws(() => Core.validarChart(d), /discordam/);
});

test('recusa polifonia, ids repetidos, duração fora do chart e campos inseguros', () => {
  assert.throws(() => Core.validarChart(chart([note('a', 1), note('b', 1.05)])), /sobrepostas/);
  assert.throws(() => Core.validarChart(chart([note('a', 1), note('a', 2)])), /repetido/);
  assert.throws(() => Core.validarChart(chart([note('a', 3.95)])), /ultrapassa/);
  assert.throws(() => Core.validarChart({ ...chart(), title: '<img src=x>' }), /texto simples/);
  assert.throws(() => Core.validarChart({ ...chart(), bpm: '90' }), /BPM/);
  assert.throws(() => Core.validarChart({ ...chart(), duration: NaN }), /Duração/);
  assert.throws(() => Core.validarChart({ ...chart(), id: '../arquivo' }), /inválido/);
});

test('limites 2000 notas e 900 segundos, sem aceitar arrays gigantes', () => {
  const d = chart(Array.from({ length: 2000 }, (_, i) => note('n' + i, i * 0.4)), 900);
  assert.equal(Core.validarChart(d).notes.length, 2000);
  d.notes.push(note('extra', 899));
  assert.throws(() => Core.validarChart(d), /2000/);
  assert.throws(() => Core.validarChart(chart([note('a', 1)], 900.1)), /900/);
  assert.throws(() => Core.validarChart(chart([])), /1 a 2000/);
});

test('trechos validados e limites adjacentes são permitidos', () => {
  const d = chart([note('a', 1), note('b', 1.1)]);
  d.sections = [{ id: 's1', title: 'Parte A', from: 0, to: 2 }];
  assert.equal(Core.validarChart(d).sections[0].to, 2);
  d.sections[0].to = 0;
  assert.throws(() => Core.validarChart(d), /depois/);
});

test('acerto exige confirmação de 40ms e retorna detalhe explicável', () => {
  const j = Core.criarJulgador(chart());
  feed(j, 1, 1.03, 40);
  assert.equal(j.resumo().hits, 0);
  const hit = j.amostrar({ time: 1.04, hz: hz(40), confidence: 0.95, rms: 0.1 });
  assert.equal(hit.status, 'hit'); assert.equal(hit.timingMs, 0); assert.equal(hit.cents, 0);
  assert.equal(j.resumo().hits, 1); assert.equal(j.resumo().accuracy, 100);
  assert.equal(j.resumo().trainingOnly, true);
});

test('oitava errada não acerta mesmo com a classe de altura correta', () => {
  const j = Core.criarJulgador(chart());
  feed(j, 0.95, 1.2, 52); j.avancar(2);
  assert.equal(j.resumo().hits, 0); assert.equal(j.resumo().misses, 1);
});

test('nota errada seguida de correta dentro da janela ainda pode acertar', () => {
  const j = Core.criarJulgador(chart());
  feed(j, 0.94, 1.01, 41);
  feed(j, 1.02, 1.10, 40);
  assert.equal(j.resumo().hits, 1); assert.equal(j.estados()[0].timingMs, 20);
});

test('ausência, confiança baixa, silêncio e medida inválida não são acerto', () => {
  for (const extra of [{ confidence: 0.4 }, { rms: 0.001 }, { hz: NaN }, { confidence: Infinity }]) {
    const j = Core.criarJulgador(chart()); feed(j, 0.9, 1.2, 40, extra); j.avancar(2);
    assert.equal(j.resumo().hits, 0); assert.equal(j.resumo().misses, 1);
  }
  const j = Core.criarJulgador(chart());
  j.avancar(1.22); assert.equal(j.resumo().pending, 1);
  assert.equal(j.avancar(1.221)[0].status, 'miss');
  assert.equal(j.avancar(2).length, 0);
});

test('limites de antecipação e atraso incluem confirmação até o fim da janela', () => {
  for (const onset of [0.82, 1.18]) {
    const j = Core.criarJulgador(chart()); feed(j, onset, onset + 0.04);
    assert.equal(j.resumo().hits, 1, 'onset ' + onset);
  }
  for (const onset of [0.819, 1.181]) {
    const j = Core.criarJulgador(chart()); feed(j, onset, onset + 0.05); j.avancar(2);
    assert.equal(j.resumo().hits, 0, 'onset ' + onset);
  }
});

test('desvio em cents é medido e respeita a tolerância', () => {
  for (const cents of [-44, 44]) {
    const j = Core.criarJulgador(chart()); feed(j, 1, 1.06, 40, { hz: hz(40, cents) });
    assert.equal(j.resumo().hits, 1); assert.ok(Math.abs(j.estados()[0].cents - cents) < 0.1);
  }
  const j = Core.criarJulgador(chart()); feed(j, 1, 1.08, 40, { hz: hz(40, 48) }); j.avancar(2);
  assert.equal(j.resumo().misses, 1);
});

test('offset positivo compensa entrada atrasada; negativo também é explícito', () => {
  const late = Core.criarJulgador(chart(), { offsetMs: 120 }); feed(late, 1.12, 1.18);
  assert.equal(late.estados()[0].timingMs, 0);
  const early = Core.criarJulgador(chart(), { offsetMs: -100 }); feed(early, 0.9, 0.96);
  assert.equal(early.estados()[0].timingMs, 0);
});

test('nota sustentada não acerta outro alvo repetido, mesmo com janelas próximas', () => {
  const j = Core.criarJulgador(chart([note('a', 1, 6, 0, 0.08), note('b', 1.12)]));
  feed(j, 1, 1.5); j.avancar(2);
  assert.deepEqual(j.estados().map(s => s.status), ['hit', 'miss']);
});

test('nova palhetada permite repetir a mesma nota', () => {
  const j = Core.criarJulgador(chart([note('a', 1, 6, 0, 0.08), note('b', 1.12)]));
  feed(j, 1, 1.10); feed(j, 1.12, 1.2, 40, { onset: true });
  assert.deepEqual(j.estados().map(s => s.status), ['hit', 'hit']);
});

test('silêncio verificável permite repetir, confiança baixa sozinha não', () => {
  const d = chart([note('a', 1, 6, 0, 0.08), note('b', 1.2)]);
  const j = Core.criarJulgador(d); feed(j, 1, 1.05); feed(j, 1.06, 1.12, 40, { rms: 0 }); feed(j, 1.2, 1.26);
  assert.equal(j.resumo().hits, 2);
  const k = Core.criarJulgador(d); feed(k, 1, 1.05); feed(k, 1.06, 1.12, 40, { confidence: 0.1 }); feed(k, 1.2, 1.26); k.avancar(2);
  assert.equal(k.resumo().hits, 1);
});

test('mudança estável de altura permite nova nota; oscilação isolada não', () => {
  const d = chart([note('a', 1, 6, 0, 0.08), note('b', 1.3)]);
  const j = Core.criarJulgador(d); feed(j, 1, 1.05); feed(j, 1.1, 1.16, 42); feed(j, 1.3, 1.38);
  assert.equal(j.resumo().hits, 2);
  const k = Core.criarJulgador(d); feed(k, 1, 1.05); feed(k, 1.1, 1.11, 42); feed(k, 1.3, 1.38); k.avancar(2);
  assert.equal(k.resumo().hits, 1);
});

test('trecho [from,to) usa somente alvos do trecho e mantém tempo da música', () => {
  const j = Core.criarJulgador(chart([note('a', 1), note('b', 2), note('c', 3)]), { from: 2, to: 3 });
  assert.deepEqual(j.estados(), [{ id: 'b', status: 'pending' }]);
  feed(j, 2, 2.05); assert.equal(j.resumo().total, 1); assert.equal(j.resumo().hits, 1);
});

test('medidas fora de ordem não reabrem alvos e estados devolvidos são cópias', () => {
  const j = Core.criarJulgador(chart()); feed(j, 1, 1.05);
  j.amostrar({ time: 0.95, hz: hz(41), confidence: 1, rms: 0.1 });
  const states = j.estados(); states[0].status = 'miss';
  assert.equal(j.estados()[0].status, 'hit'); assert.equal(j.resumo().hits, 1);
});

test('lacuna de amostragem não satisfaz estabilidade sozinha', () => {
  const j = Core.criarJulgador(chart());
  j.amostrar({ time: 1, hz: hz(40), confidence: 1, rms: 0.1 });
  j.amostrar({ time: 1.16, hz: hz(40), confidence: 1, rms: 0.1 });
  assert.equal(j.resumo().hits, 0);
});

test('sustain configurável e opções inválidas são recusadas', () => {
  const j = Core.criarJulgador(chart(), { stableMs: 80 }); feed(j, 1, 1.06); assert.equal(j.resumo().hits, 0);
  feed(j, 1.07, 1.09); assert.equal(j.resumo().hits, 1);
  assert.throws(() => Core.criarJulgador(chart(), { toleranceMs: NaN }), /toleranceMs/);
  assert.throws(() => Core.criarJulgador(chart(), { from: 2, to: 1 }), /fim/);
});

test('mesmo núcleo roda no navegador sem CommonJS nem dependências', () => {
  const sandbox = { self: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('./nucleo'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.self.MusiqueTocarCore.criarJulgador, 'function');
  assert.equal(sandbox.self.MusiqueTocarCore.demoChart().notes.length, 48);
});

console.log(count + ' testes do núcleo Tocar passaram.');
