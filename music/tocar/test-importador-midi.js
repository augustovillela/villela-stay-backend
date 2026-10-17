'use strict';
// Casos sintéticos de SMF: não abrem arquivo, não acessam rede nem persistência.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Importador = require('./importador-midi');
const Core = require('./nucleo');
const Perfis = require('./perfis');

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

test('piano MIDI oferece todas as faixas compatíveis', () => {
  const arquivo = smf({ format: 1, tracks: [
    faixa([nome(0, 'Mão direita'), ligar(0, 0, 60, 90), desligar(480, 0, 60), fim()]),
    faixa([nome(0, 'Mão esquerda'), ligar(0, 0, 48, 80), desligar(480, 0, 48), fim()]),
  ] });
  const analise = Importador.analisar(arquivo, { perfil: 'piano' });
  const todas = candidato(analise, '__todas__');
  assert.ok(todas); assert.equal(todas.valid, true); assert.equal(todas.noteCount, 2);
  const chart = Importador.criarChart(analise, '__todas__', { id: 'piano-faixas', title: 'Piano completo' });
  assert.deepEqual(chart.notes.map(nota => nota.midi), [48, 60]);
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

test('perfil baixo aceita Mi1 e cria posições para quatro cordas sem alterar o padrão', () => {
  const arquivo = smf({ tracks: [faixa([
    ligar(0, 0, 28), desligar(480, 0, 28), ligar(0, 0, 33), desligar(480, 0, 33),
    ligar(0, 0, 43), desligar(480, 0, 43), ligar(0, 0, 67), desligar(480, 0, 67), fim(),
  ])] });
  const seisCordas = Importador.analisar(arquivo);
  assert.equal(candidato(seisCordas, 't0-c0').valid, false);
  assert.match(candidato(seisCordas, 't0-c0').reason, /Mi2–Mi6/);

  const baixo = Importador.analisar(arquivo, { perfil: 'baixo' });
  assert.equal(candidato(baixo, 't0-c0').valid, true);
  const chart = Importador.criarChart(baixo, 't0-c0', { id: 'baixo-midi', title: 'Baixo MIDI', perfil: 'baixo' });
  assert.deepEqual(chart.tuning, [28, 33, 38, 43]);
  assert.deepEqual(chart.notes.map(nota => [nota.midi, nota.string, nota.fret]), [
    [28, 4, 0], [33, 3, 0], [43, 1, 0], [67, 1, 24],
  ]);
  assert.deepEqual(Core.validarChart(chart), chart);
  assert.throws(() => Importador.criarChart(baixo, 't0-c0', { id: 'perfil-trocado', title: 'Perfil trocado', perfil: 'violao' }), /mesmo perfil/);
  assert.throws(() => Importador.analisar(arquivo, { perfil: 'cinco-cordas' }), /Perfil de instrumento desconhecido/);
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
  const sandbox = { window: { MusiqueTocarCore: Core, MusiqueTocarPerfis: Perfis }, Uint8Array, ArrayBuffer, WeakMap, Number, Object, Math, Error };
  vm.runInNewContext(source, sandbox);
  assert.equal(typeof sandbox.window.MusiqueTocarImportadorMidi.analisar, 'function');
  const web = sandbox.window.MusiqueTocarImportadorMidi.analisar(smf({ tracks: [faixa([ligar(0, 0, 40), desligar(480, 0, 40), fim()])] }));
  assert.equal(web.candidates[0].id, 't0-c0');
});

test('piano preserva acordes, oitavas, intensidades e andamento que atravessa notas', () => {
  const arquivo = smf({ format: 1, tracks: [
    faixa([andamento(0, 500000), andamento(480, 1000000), fim(480)]),
    faixa([nome(0, 'Piano'), ligar(240, 0, 72, 127), ligar(0, 0, 60, 1), ligar(0, 0, 64, 90),
      desligar(480, 0, 64), desligar(0, 0, 60), evento(240, 0x90, 72, 0), fim()]),
  ] });
  const analise = Importador.analisar(arquivo, { perfil: 'piano' });
  assert.equal(candidato(analise, 't1-c0').valid, true);
  const chart = Importador.criarChart(analise, 't1-c0', { id: 'piano-acorde', title: 'Piano com acordes', perfil: 'piano-midi' });
  assert.equal(chart.profile, 'piano-midi'); assert.equal(chart.layout, 'piano');
  assert.equal(Object.hasOwn(chart, 'tuning'), false);
  assert.deepEqual(chart.notes, [
    { id: 'midi-1', time: 0.25, duration: 0.75, midi: 60, velocity: 1 },
    { id: 'midi-2', time: 0.25, duration: 0.75, midi: 64, velocity: 90 },
    { id: 'midi-3', time: 0.25, duration: 1.25, midi: 72, velocity: 127 },
  ]);
  assert.deepEqual(chart.tempoMap, { version: 1, events: [{ time: 0, beat: 0, bpm: 120 }, { time: 0.5, beat: 1, bpm: 60 }] });
  assert.equal(chart.duration, 1.5);
  assert.deepEqual(Core.validarChart(chart), chart);
  const guitarra = Importador.analisar(arquivo);
  assert.match(candidato(guitarra, 't1-c0').reason, /sobrepostas/);
});

test('piano aceita 88 teclas, duração mínima e repetição somente após soltar a tecla', () => {
  const arquivo = smf({ ppqn: 500, tracks: [faixa([
    ligar(275, 0, 21, 1), ligar(0, 0, 108, 127), desligar(20, 0, 21), desligar(0, 0, 108),
    ligar(0, 0, 21, 55), desligar(20, 0, 21), fim(),
  ])] });
  const analise = Importador.analisar(arquivo, 'piano-midi');
  assert.equal(analise.candidates[0].valid, true);
  const chart = Importador.criarChart(analise, 't0-c0', { id: 'piano-limites', title: 'Limites do piano', perfil: 'piano' });
  assert.deepEqual(chart.notes.map(n => [n.midi, n.velocity, n.duration]), [[21, 1, 0.02], [108, 127, 0.02], [21, 55, 0.02]]);
  quase(chart.notes[2].time, 0.295); quase(chart.duration, 0.315);
  assert.deepEqual(Core.validarChart(chart), chart);
  for (const midi of [20, 109]) {
    const fora = Importador.analisar(smf({ tracks: [faixa([ligar(0, 0, midi), desligar(480, 0, midi), fim()])] }), 'piano');
    assert.equal(fora.candidates[0].valid, false); assert.match(fora.candidates[0].reason, /Lá0–Dó8/);
    assert.throws(() => Importador.criarChart(fora, 't0-c0', { id: 'fora', title: 'Fora' }), /extensão/);
  }
  const curta = Importador.analisar(smf({ ppqn: 500, tracks: [faixa([ligar(100, 0, 60), desligar(19, 0, 60), fim()])] }), 'piano');
  assert.match(curta.candidates[0].reason, /0,02/);
  const chartCurto = Importador.analisar(smf({ ppqn: 500, tracks: [faixa([ligar(0, 0, 60), desligar(20, 0, 60), fim()])] }), 'piano');
  assert.match(chartCurto.candidates[0].reason, /ao menos 0,04/);
});

test('piano recusa sobreposição da mesma tecla, canal 10, notas abertas, órfãs e pitch bend', () => {
  const casos = [
    { events: [ligar(0, 0, 60), ligar(120, 0, 60), desligar(120, 0, 60), desligar(120, 0, 60), fim()], reason: /mesma tecla/ },
    { events: [ligar(0, 9, 60), desligar(480, 9, 60), fim()], reason: /percussão/ },
    { events: [ligar(0, 0, 60), fim(480)], reason: /sem note-off/ },
    { events: [desligar(0, 0, 62), ligar(0, 0, 60), desligar(480, 0, 60), fim()], reason: /note-off sem note-on/ },
    { events: [evento(0, 0xe0, 0, 64), ligar(0, 0, 60), desligar(480, 0, 60), fim()], reason: /pitch bend/ },
  ];
  for (const item of casos) {
    const analise = Importador.analisar(smf({ tracks: [faixa(item.events)] }), 'piano');
    const linha = analise.candidates[0];
    assert.equal(linha.valid, false); assert.match(linha.reason, item.reason);
    assert.throws(() => Importador.criarChart(analise, linha.id, { id: 'invalido', title: 'Inválido' }), item.reason);
  }
});

test('piano não encurta silenciosamente notas sustentadas por pedal CC64 ou sostenuto CC66', () => {
  for (const pedal of [64, 66]) {
    for (const intensidade of [64, 127]) {
      const analise = Importador.analisar(smf({ tracks: [faixa([
        evento(0, 0xb0, pedal, intensidade), ligar(0, 0, 60), desligar(480, 0, 60), evento(480, 0xb0, pedal, 0), fim(),
      ])] }), 'piano');
      assert.equal(analise.candidates[0].valid, false); assert.match(analise.candidates[0].reason, /pedal.*CC64.*CC66/);
      assert.throws(() => Importador.criarChart(analise, 't0-c0', { id: 'pedal', title: 'Com pedal' }), /pedal/);
    }
    const desligado = Importador.analisar(smf({ tracks: [faixa([
      evento(0, 0xb0, pedal, 63), ligar(0, 0, 60), desligar(480, 0, 60), evento(0, 0xb0, pedal, 0), fim(),
    ])] }), 'piano');
    assert.equal(desligado.candidates[0].valid, true);
    assert.equal(Importador.criarChart(desligado, 't0-c0', { id: 'sem-pedal', title: 'Sem pedal' }).notes[0].duration, 0.5);
  }
});

test('piano mantém limites de 2.000 notas, 60 segundos por nota e 900 segundos por linha', () => {
  const notas = [];
  for (let i = 0; i < 2000; i++) notas.push(ligar(0, 0, 60), desligar(20, 0, 60));
  const limite = Importador.analisar(smf({ ppqn: 500, tracks: [faixa([...notas, fim()])] }), 'piano');
  assert.equal(limite.candidates[0].valid, true);
  assert.equal(Importador.criarChart(limite, 't0-c0', { id: 'duas-mil', title: 'Duas mil notas' }).notes.length, 2000);
  const muitas = Importador.analisar(smf({ ppqn: 500, tracks: [faixa([...notas, ligar(0, 0, 60), desligar(20, 0, 60), fim()])] }), 'piano');
  assert.match(muitas.candidates[0].reason, /2.000/);
  const longa = Importador.analisar(smf({ ppqn: 500, tracks: [faixa([ligar(0, 0, 60), desligar(60001, 0, 60), fim()])] }), 'piano');
  assert.match(longa.candidates[0].reason, /60 segundos/);
  const limiteTempo = [];
  for (let i = 0; i < 15; i++) limiteTempo.push(ligar(0, 0, 60), desligar(60000, 0, 60));
  const exata = Importador.analisar(smf({ ppqn: 500, tracks: [faixa([...limiteTempo, fim()])] }), 'piano');
  assert.equal(exata.candidates[0].valid, true);
  assert.equal(Importador.criarChart(exata, 't0-c0', { id: 'quinze-min', title: 'Quinze minutos' }).duration, 900);
  const excessiva = Importador.analisar(smf({ ppqn: 500, tracks: [faixa([...limiteTempo, ligar(0, 0, 60), desligar(20, 0, 60), fim()])] }), 'piano');
  assert.match(excessiva.candidates[0].reason, /900 segundos/);
});

test('controles em outra faixa do mesmo canal também impedem importação incompleta de piano', () => {
  const notas = faixa([ligar(0, 0, 60), desligar(480, 0, 60), fim()]);
  for (const controle of [evento(0, 0xb0, 64, 127), evento(0, 0xb0, 66, 127), evento(0, 0xe0, 0, 64)]) {
    const analise = Importador.analisar(smf({ format: 1, tracks: [faixa([controle, fim(960)]), notas] }), 'piano');
    assert.equal(candidato(analise, 't1-c0').valid, false);
    assert.match(candidato(analise, 't1-c0').reason, /pedal|pitch bend/);
    assert.throws(() => Importador.criarChart(analise, 't1-c0', { id: 'controle-externo', title: 'Controle em outra faixa' }), /pedal|pitch bend/);
  }
  const outroCanal = Importador.analisar(smf({ format: 1, tracks: [faixa([evento(0, 0xb1, 64, 127), fim(960)]), notas] }), 'piano');
  assert.equal(candidato(outroCanal, 't1-c0').valid, true);
  assert.equal(Importador.criarChart(outroCanal, 't1-c0', { id: 'outro-canal', title: 'Outro canal' }).notes.length, 1);
});

test('fronteiras de duração da linha normalizam somente ruído binário em análise e criação', () => {
  for (const perfil of ['piano', 'guitarra', 'bateria']) {
    const canal = perfil === 'bateria' ? 9 : 0, midi = perfil === 'bateria' ? 36 : 60;
    const notasLongas = [];
    for (let i = 0; i < 15; i++) notasLongas.push(ligar(0, canal, midi, 90), desligar(12000, canal, midi));
    const tempos = [andamento(0, 480000)];
    for (let i = 0; i < 5; i++) tempos.push(andamento(288, 480000));
    const longa = Importador.analisar(smf({ format: 1, ppqn: 96, tracks: [
      faixa([...tempos, fim()]), faixa([...notasLongas, fim()]),
    ] }), perfil);
    // O arquivo é matematicamente 900 s, mas a soma de segmentos produz
    // 900,0000000000001. O candidato e o contrato Core devem concordar.
    assert.ok(longa.duration > 900);
    assert.equal(longa.candidates[0].duration, 900); assert.equal(longa.candidates[0].valid, true);
    const chartLongo = Importador.criarChart(longa, 't1-c' + canal, { id: 'limite-superior', title: '900 segundos', perfil });
    assert.equal(chartLongo.duration, 900); assert.equal(chartLongo.notes.length, 15);
    assert.deepEqual(Core.validarChart(chartLongo), chartLongo);

    const curta = Importador.analisar(smf({ format: 1, ppqn: 36, tracks: [
      faixa([andamento(0, 480000), andamento(1, 480000), fim()]),
      faixa([ligar(0, canal, midi, 90), desligar(3, canal, midi), fim()]),
    ] }), perfil);
    assert.ok(curta.duration < 0.04);
    assert.equal(curta.candidates[0].duration, 0.04); assert.equal(curta.candidates[0].valid, true);
    const chartCurto = Importador.criarChart(curta, 't1-c' + canal, { id: 'limite-inferior', title: '0,04 segundos', perfil });
    assert.equal(chartCurto.duration, 0.04);
    quase(chartCurto.notes[0].duration, 0.04); assert.deepEqual(Core.validarChart(chartCurto), chartCurto);

    // Um tick real fora do limite não pode ser corrigido como arredondamento.
    notasLongas[0] = ligar(1, canal, midi, 90);
    const acima = Importador.analisar(smf({ format: 1, ppqn: 96, tracks: [
      faixa([...tempos, fim()]), faixa([...notasLongas, fim()]),
    ] }), perfil);
    assert.equal(acima.candidates[0].valid, false);
    assert.throws(() => Importador.criarChart(acima, 't1-c' + canal, { id: 'acima', title: 'Acima' }), /duração/);
    const abaixo = Importador.analisar(smf({ ppqn: 36, tracks: [
      faixa([andamento(0, 480000), ligar(0, canal, midi), desligar(2, canal, midi), fim()]),
    ] }), perfil);
    assert.equal(abaixo.candidates[0].valid, false);
    assert.throws(() => Importador.criarChart(abaixo, 't0-c' + canal, { id: 'abaixo', title: 'Abaixo' }), /duração|durar/);
  }
});

test('ukulele reentrante usa todas as cordas, extensão Dó4–Dó6 e a menor casa sem reordenar afinação', () => {
  const alturas = [60, 64, 67, 69, 72, 84];
  const eventos = alturas.flatMap(midi => [ligar(0, 0, midi), desligar(480, 0, midi)]);
  const analise = Importador.analisar(smf({ tracks: [faixa([...eventos, fim()])] }), 'ukulele');
  assert.equal(analise.candidates[0].valid, true);
  const chart = Importador.criarChart(analise, 't0-c0', { id: 'ukulele', title: 'Afinação tradicional', perfil: 'ukulele' });
  assert.deepEqual(chart.tuning, [67, 60, 64, 69]);
  assert.deepEqual(chart.notes.map(n => [n.midi, n.string, n.fret]), [
    [60, 3, 0], [64, 2, 0], [67, 4, 0], [69, 1, 0], [72, 1, 3], [84, 1, 15],
  ]);
  assert.deepEqual(Core.validarChart(chart), chart);
  for (const midi of [59, 85]) {
    const fora = Importador.analisar(smf({ tracks: [faixa([ligar(0, 0, midi), desligar(480, 0, midi), fim()])] }), 'ukulele');
    assert.equal(fora.candidates[0].valid, false); assert.match(fora.candidates[0].reason, /Dó4–Dó6/);
  }
});

test('criação revalida dados privados e recusa troca de perfil entre piano, cordas e bateria', () => {
  const arquivo = smf({ tracks: [faixa([ligar(0, 0, 60, 87), desligar(480, 0, 60), fim()])] });
  const piano = Importador.analisar(arquivo, 'piano');
  piano.candidates[0].valid = false; piano.candidates[0].reason = 'alterado';
  piano.candidates[0].noteCount = 5000; piano.tempoMap[0].bpm = 300; arquivo.fill(0);
  const chart = Importador.criarChart(piano, 't0-c0', { id: 'privado', title: 'Dados privados', perfil: 'piano-midi' });
  assert.equal(chart.notes.length, 1); assert.equal(chart.bpm, 120); assert.equal(chart.notes[0].velocity, 87);
  for (const perfil of ['guitarra', 'baixo', 'ukulele', 'bateria-midi']) {
    assert.throws(() => Importador.criarChart(piano, 't0-c0', { id: 'troca', title: 'Troca', perfil }), /mesmo perfil/);
  }
  const cordas = Importador.analisar(smf({ tracks: [faixa([ligar(0, 0, 60), desligar(480, 0, 60), fim()])] }));
  assert.throws(() => Importador.criarChart(cordas, 't0-c0', { id: 'troca', title: 'Troca', perfil: 'piano' }), /mesmo perfil/);
  const invalida = Importador.analisar(smf({ tracks: [faixa([ligar(0, 0, 20), desligar(480, 0, 20), fim()])] }), 'piano');
  invalida.candidates[0].valid = true; invalida.candidates[0].reason = null; invalida.candidates[0].minMidi = 60;
  assert.throws(() => Importador.criarChart(invalida, 't0-c0', { id: 'forjada', title: 'Forjada' }), /extensão/);
  invalida.candidates.push({ id: 't8-c8', valid: true });
  assert.throws(() => Importador.criarChart(invalida, 't8-c8', { id: 'ausente', title: 'Ausente' }), /não existe/);
});

test('bateria mantém peças simultâneas, intensidade, canal e recusa mesma peça sobreposta', () => {
  const arquivo = smf({ tracks: [faixa([
    ligar(0, 9, 36, 110), ligar(0, 9, 42, 50), desligar(48, 9, 36), desligar(0, 9, 42), fim(),
  ])] });
  const analise = Importador.analisar(arquivo, 'bateria');
  assert.equal(analise.candidates[0].valid, true);
  const chart = Importador.criarChart(analise, 't0-c9', { id: 'bateria', title: 'Bateria', perfil: 'bateria-midi' });
  assert.deepEqual(chart.notes.map(n => [n.midi, n.drum, n.time, n.duration, n.velocity]), [
    [36, 'bumbo', 0, 0.05, 110], [42, 'chimbal-fechado', 0, 0.05, 50],
  ]);
  assert.deepEqual(Core.validarChart(chart), chart);
  assert.throws(() => Importador.criarChart(analise, 't0-c9', { id: 'troca', title: 'Troca', perfil: 'piano' }), /mesmo perfil/);
  const sobreposta = Importador.analisar(smf({ tracks: [faixa([
    ligar(0, 9, 36), ligar(24, 9, 36), desligar(24, 9, 36), desligar(24, 9, 36), fim(),
  ])] }), 'bateria');
  assert.match(sobreposta.candidates[0].reason, /mesma peça/);
  const fora = Importador.analisar(smf({ tracks: [faixa([ligar(0, 9, 35), desligar(48, 9, 35), fim()])] }), 'bateria');
  assert.match(fora.candidates[0].reason, /mapeamento/);
  const canalErrado = Importador.analisar(smf({ tracks: [faixa([ligar(0, 0, 36), desligar(48, 0, 36), fim()])] }), 'bateria');
  assert.match(canalErrado.candidates[0].reason, /canal 10/);
});

test('UMD importa piano polifônico até chart normalizado sem CommonJS', () => {
  const source = fs.readFileSync(path.join(__dirname, 'importador-midi.js'), 'utf8');
  const sandbox = { window: { MusiqueTocarCore: Core, MusiqueTocarPerfis: Perfis }, Uint8Array, ArrayBuffer, WeakMap, Number, Object, Math, Error };
  vm.runInNewContext(source, sandbox);
  const web = sandbox.window.MusiqueTocarImportadorMidi;
  const analise = web.analisar(smf({ tracks: [faixa([
    ligar(0, 0, 21, 5), ligar(0, 0, 108, 127), desligar(480, 0, 21), desligar(0, 0, 108), fim(),
  ])] }), 'piano');
  assert.equal(analise.candidates[0].valid, true);
  const chart = web.criarChart(analise, 't0-c0', { id: 'web-piano', title: 'Piano navegador' });
  assert.equal(chart.layout, 'piano'); assert.equal(chart.profile, 'piano-midi');
  assert.deepEqual(Array.from(chart.notes, n => [n.midi, n.velocity]), [[21, 5], [108, 127]]);
  assert.deepEqual(Core.validarChart(chart), chart);
});
