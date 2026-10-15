'use strict';
// Biblioteca autoral: contratos, tocabilidade declarada e isolamento de cópias.
// Não usa áudio real, banco, navegador ou rede.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('./nucleo');
const Estudos = require('./estudos');
const tuning = [40, 45, 50, 55, 59, 64];
const ids = ['primeiro-riff-v1', 'cordas-soltas-v1', 'cordas-vizinhas-v1', 'primeiras-casas-v1',
  'pentatonica-mi-v1', 'saltos-entre-cordas-v1', 'frase-de-revisao-v1'];

test('Primeiro riff é preservado integralmente junto a seis estudos distintos', () => {
  const lista = Estudos.listar();
  assert.deepEqual(lista.map(item => item.id), ids);
  assert.equal(new Set(lista.map(item => item.title)).size, 7);
  assert.deepEqual(lista[0].chart, Core.demoChart());
  assert.deepEqual(Estudos.obter('primeiro-riff-v1'), Core.demoChart());
  for (const item of lista) {
    assert.equal(item.id, item.chart.id);
    assert.equal(item.title, item.chart.title);
    for (const campo of ['title', 'objective', 'level']) {
      assert.equal(typeof item[campo], 'string');
      assert.ok(item[campo].trim().length > 0);
      assert.doesNotMatch(item[campo], /[<>\u0000-\u001f]/);
    }
  }
});

test('Todos os charts obedecem ao contrato, à afinação padrão e aos limites monofônicos', () => {
  for (const item of Estudos.listar()) {
    const chart = item.chart;
    assert.deepEqual(Core.validarChart(chart), chart);
    assert.deepEqual(chart.tuning, tuning);
    assert.equal(chart.metadata.demo, true);
    assert.ok(chart.notes.length > 0 && chart.notes.length <= 2000);
    assert.ok(chart.duration > 0 && chart.duration <= 900);
    const noteIds = new Set();
    for (let i = 0; i < chart.notes.length; i++) {
      const n = chart.notes[i];
      assert.ok(!noteIds.has(n.id)); noteIds.add(n.id);
      assert.ok(Number.isInteger(n.string) && n.string >= 1 && n.string <= 6);
      assert.ok(Number.isInteger(n.fret) && n.fret >= 0 && n.fret <= 3);
      assert.equal(n.midi, tuning[6 - n.string] + n.fret);
      assert.ok(n.time >= 0 && n.duration >= 0.04 && n.time + n.duration <= chart.duration);
      if (i) assert.ok(n.time > chart.notes[i - 1].time + chart.notes[i - 1].duration,
        'Existe espaço para abafar entre os ataques: ' + chart.id);
      const hz = 440 * 2 ** ((n.midi - 69) / 12);
      assert.ok(hz >= 70 && hz <= 1400, 'Nota dentro da faixa de captura atual');
    }
  }
});

test('Frases não vazias cobrem cada nota uma única vez sem cortar sua duração', () => {
  for (const { chart } of Estudos.listar()) {
    assert.ok(chart.sections.length > 1 && chart.sections.length <= 100);
    assert.equal(new Set(chart.sections.map(s => s.id)).size, chart.sections.length);
    const atribuicoes = new Map(chart.notes.map(n => [n.id, 0]));
    chart.sections.forEach((s, i) => {
      assert.ok(s.from >= 0 && s.from < s.to && s.to <= chart.duration);
      if (i) assert.ok(s.from >= chart.sections[i - 1].to - 1e-6);
      const notas = chart.notes.filter(n => n.time >= s.from && n.time < s.to);
      assert.ok(notas.length > 0, 'Frase contém alvos: ' + s.id);
      for (const n of notas) {
        assert.ok(n.time + n.duration <= s.to + 1e-6);
        atribuicoes.set(n.id, atribuicoes.get(n.id) + 1);
      }
    });
    assert.ok([...atribuicoes.values()].every(vezes => vezes === 1));
  }
});

test('Estudos novos têm frases de 4/8 tempos e andamento gradual sem trocas de posição', () => {
  const novos = Estudos.listar().slice(1);
  let ultimoBpm = 0;
  for (const { chart } of novos) {
    assert.ok(chart.bpm >= 60 && chart.bpm <= 80 && chart.bpm > ultimoBpm);
    ultimoBpm = chart.bpm;
    assert.ok(chart.duration <= 40, 'Estudo curto para as primeiras rodadas');
    for (const s of chart.sections) {
      const tempos = (s.to - s.from) * chart.bpm / 60;
      assert.ok(Math.abs(tempos - 4) < 1e-5 || Math.abs(tempos - 8) < 1e-5);
    }
  }
});

test('Cordas soltas cobre as seis cordas e permite exercitar ataques repetidos', () => {
  const chart = Estudos.obter('cordas-soltas-v1');
  assert.equal(chart.notes.length, 12);
  assert.equal(new Set(chart.notes.map(n => n.string)).size, 6);
  assert.ok(chart.notes.every(n => n.fret === 0));
  for (const s of chart.sections) {
    const notas = chart.notes.filter(n => n.time >= s.from && n.time < s.to);
    assert.equal(notas.length, 2);
    assert.equal(notas[0].midi, notas[1].midi);
    assert.ok(notas[1].time - notas[0].time - notas[0].duration >= 0.5);
  }
});

test('Cordas vizinhas alterna pares adjacentes com todas as notas soltas', () => {
  const chart = Estudos.obter('cordas-vizinhas-v1');
  assert.ok(chart.notes.every(n => n.fret === 0));
  for (const s of chart.sections) {
    const notas = chart.notes.filter(n => n.time >= s.from && n.time < s.to);
    assert.equal(new Set(notas.map(n => n.string)).size, 2);
    for (let i = 1; i < notas.length; i++) assert.equal(Math.abs(notas[i].string - notas[i - 1].string), 1);
  }
});

test('Primeiras casas explora 0–3; pentatônica contém somente mi, sol, lá, si e ré', () => {
  const casas = Estudos.obter('primeiras-casas-v1');
  assert.deepEqual([...new Set(casas.notes.map(n => n.fret))].sort(), [0, 1, 2, 3]);
  const penta = Estudos.obter('pentatonica-mi-v1');
  assert.deepEqual([...new Set(penta.notes.map(n => n.midi % 12))].sort((a, b) => a - b), [2, 4, 7, 9, 11]);
  assert.equal(Math.min(...penta.notes.map(n => n.midi)), 40);
  assert.equal(Math.max(...penta.notes.map(n => n.midi)), 64);
  assert.equal(penta.notes.at(-1).midi, 40);
});

test('Saltos usa oitavas separadas por uma corda e revisão combina habilidades', () => {
  const saltos = Estudos.obter('saltos-entre-cordas-v1');
  for (let i = 0; i < saltos.notes.length; i += 2) {
    assert.equal(Math.abs(saltos.notes[i].string - saltos.notes[i + 1].string), 2);
    assert.equal(Math.abs(saltos.notes[i].midi - saltos.notes[i + 1].midi), 12);
  }
  const revisao = Estudos.obter('frase-de-revisao-v1');
  assert.ok(revisao.notes.some(n => n.fret > 0));
  assert.ok(revisao.notes.some((n, i) => i && n.midi === revisao.notes[i - 1].midi));
  assert.ok(revisao.notes.some((n, i) => i && Math.abs(n.string - revisao.notes[i - 1].string) === 2));
  assert.equal(revisao.notes[0].midi, 40);
  assert.equal(revisao.notes.at(-1).midi, 40);
});

test('IDs de notas e frases dos novos estudos são únicos também entre charts', () => {
  const notas = [], frases = [];
  for (const { chart } of Estudos.listar()) {
    notas.push(...chart.notes.map(n => n.id));
    frases.push(...chart.sections.map(s => s.id));
  }
  assert.equal(new Set(notas).size, notas.length);
  assert.equal(new Set(frases).size, frases.length);
});

test('Mutar uma lista ou um chart obtido não altera chamadas futuras nem outros estudos', () => {
  const esperado = Estudos.listar(), lista = Estudos.listar();
  lista[1].title = 'mudou'; lista[1].objective = 'mudou'; lista[1].level = 'mudou';
  lista[1].chart.notes[0].midi = 1; lista[1].chart.tuning[0] = 1;
  lista[1].chart.sections[0].title = 'mudou'; lista[1].chart.metadata.demo = false;
  lista.pop();
  const chart = Estudos.obter(ids[1]); chart.notes.length = 0; chart.sections.length = 0;
  assert.deepEqual(Estudos.listar(), esperado);
  for (const item of esperado) assert.deepEqual(Estudos.obter(item.id), item.chart);
  assert.notEqual(Estudos.obter(ids[1]), Estudos.obter(ids[1]));
});

test('Busca é exata e identificadores desconhecidos não caem em propriedades de objeto', () => {
  for (const id of [null, undefined, '', 'inexistente', '__proto__', 'constructor', {}, 0, 'CORDAS-SOLTAS-V1']) {
    assert.equal(Estudos.obter(id), null);
  }
});

test('Mesma biblioteca roda no navegador sem CommonJS e depende do núcleo declarado', () => {
  const contexto = vm.createContext({});
  const nucleo = fs.readFileSync(path.join(__dirname, 'nucleo.js'), 'utf8');
  const estudos = fs.readFileSync(path.join(__dirname, 'estudos.js'), 'utf8');
  vm.runInContext(nucleo, contexto);
  vm.runInContext(estudos, contexto);
  assert.equal(typeof contexto.MusiqueTocarEstudos.listar, 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(contexto.MusiqueTocarEstudos.listar())), Estudos.listar());
  assert.throws(() => vm.runInNewContext(estudos, {}), /Carregue MusiqueTocarCore/);
});
