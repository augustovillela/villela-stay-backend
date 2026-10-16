'use strict';
// Testes do contrato de edição: dados, rollback, IDs e histórico, sem DOM/DB.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('./nucleo');
const Editor = require('./editor-nucleo');

const base = () => Editor.novoChart('Estudo original', 'arranjo-teste');
const adicionar = (motor, time = 2, string = 6, fret = 2) => motor.executar({
  tipo: 'criarNota', nota: { time, duration: 0.5, string, fret },
});
const editar = (motor, alteracoes) => motor.executar({ tipo: 'editarChart', alteracoes });

test('Novo arranjo é válido: Mi2, 16 segundos, 90 BPM e identidades estáveis distintas', () => {
  const a = Editor.novoChart(), b = Editor.novoChart();
  assert.notEqual(a.id, b.id);
  assert.equal(a.title, 'Novo arranjo');
  assert.equal(a.duration, 16); assert.equal(a.bpm, 90);
  assert.deepEqual(a.tuning, [40, 45, 50, 55, 59, 64]);
  assert.deepEqual(a.notes, [{ id: 'nota-editor-1', time: 0, duration: 0.5, string: 6, fret: 0, midi: 40 }]);
  assert.deepEqual(Core.validarChart(a), a);
  assert.deepEqual(Editor.novoChart('Estudo original', 'arranjo-teste'), base());
  assert.equal(a.metadata.demo, false);
  assert.throws(() => Editor.novoChart(''), /Título/);
});

test('Novo arranjo de baixo começa na corda Mi grave e o editor usa quatro cordas', () => {
  const baixo = Editor.novoChart('Linha de baixo', 'arranjo-baixo', 'baixo');
  assert.deepEqual(baixo.tuning, [28, 33, 38, 43]);
  assert.deepEqual(baixo.notes, [{ id: 'nota-editor-1', time: 0, duration: 0.5, string: 4, fret: 0, midi: 28 }]);
  const motor = Editor.criar(baixo);
  const criada = adicionar(motor, 2, 1, 5);
  assert.equal(criada.chart.notes[1].midi, 48);
  const antes = motor.obter();
  assert.throws(() => motor.executar({ tipo: 'editarNota', id: criada.id, alteracoes: { string: 5 } }), /Corda inválida/);
  assert.deepEqual(motor.obter(), antes);
  assert.throws(() => Editor.novoChart('Linha de baixo', 'arranjo-invalido', 'piano'), /Perfil de instrumento desconhecido/);
});

test('Abrir preserva floats, IDs, afinação e frases normalizados sem arredondar à grade', () => {
  const chart = base();
  chart.notes[0].time = -0;
  chart.notes.push({ id: '_nota-importada', time: 1 / 3 + 1, duration: 0.123456789123, string: 3, fret: 2, midi: 57 });
  chart.sections = [{ id: '-frase-importada', title: 'Frase de abertura', from: 1 / 7, to: 2.987654321 }];
  const motor = Editor.criar(chart);
  assert.deepEqual(motor.obter(), chart);
  assert.ok(Object.is(motor.obter().notes[0].time, -0));
  assert.equal(motor.podeDesfazer(), false); assert.equal(motor.podeRefazer(), false);
  assert.equal(motor.desfazer(), null); assert.equal(motor.refazer(), null);
  const second = Editor.criar(motor.obter());
  assert.deepEqual(second.obter(), chart);
});

test('Criar/editar nota recalcula MIDI e mantém IDs ao ordenar pela posição', () => {
  const motor = Editor.criar(base());
  const criada = adicionar(motor, 5, 1, 3);
  assert.notEqual(criada.id, motor.obter().notes[0].id);
  assert.equal(criada.chart.notes[1].midi, 67);
  const alterada = motor.executar({ tipo: 'editarNota', id: criada.id,
    alteracoes: { time: 1.234567891, duration: 0.4321987, string: 2, fret: 5 } });
  assert.equal(alterada.id, criada.id);
  assert.deepEqual(alterada.chart.notes[1], {
    id: criada.id, time: 1.234567891, duration: 0.4321987, string: 2, fret: 5, midi: 64,
  });
  assert.deepEqual(Core.validarChart(alterada.chart), alterada.chart);
});

test('Duplicar usa destino explícito e nova identidade sem alterar o original', () => {
  const motor = Editor.criar(base()), original = motor.obter().notes[0];
  const duplicada = motor.executar({ tipo: 'duplicarNota', id: original.id, time: 3.125 });
  assert.notEqual(duplicada.id, original.id);
  assert.deepEqual(duplicada.chart.notes[0], original);
  assert.deepEqual(duplicada.chart.notes[1], { ...original, id: duplicada.id, time: 3.125 });
  assert.throws(() => motor.executar({ tipo: 'duplicarNota', id: original.id }), /time/);
  assert.deepEqual(motor.obter(), duplicada.chart);
});

test('Excluir nota permite desfazer/refazer com exatamente os mesmos dados e IDs', () => {
  const motor = Editor.criar(base()), criada = adicionar(motor);
  const antes = motor.obter();
  const removida = motor.executar({ tipo: 'excluirNota', id: criada.id });
  assert.equal(removida.id, criada.id); assert.equal(removida.chart.notes.length, 1);
  assert.deepEqual(motor.desfazer(), antes);
  assert.deepEqual(motor.refazer(), removida.chart);
  assert.equal(motor.podeRefazer(), false);
});

test('Excluir a última nota e abrir arranjo vazio falham com estado e histórico intactos', () => {
  const motor = Editor.criar(base()), antes = motor.obter();
  assert.throws(() => motor.executar({ tipo: 'excluirNota', id: antes.notes[0].id }), /ao menos uma nota/);
  assert.deepEqual(motor.obter(), antes); assert.equal(motor.podeDesfazer(), false);
  assert.throws(() => Editor.criar({ ...base(), notes: [] }), /1 a 2000 notas/);
});

test('Sobreposição, fora de duração e valores inválidos são rejeitados atomicamente', () => {
  const motor = Editor.criar(base());
  const criada = adicionar(motor, 2), antes = motor.obter();
  for (const alteracoes of [{ time: 0.25 }, { time: 15.9 }, { duration: 61 },
    { duration: 0.039 }, { string: 0 }, { string: 7 }, { fret: 25 }, { fret: 1.5 },
    { time: NaN }, { duration: Infinity }]) {
    assert.throws(() => motor.executar({ tipo: 'editarNota', id: criada.id, alteracoes }));
    assert.deepEqual(motor.obter(), antes);
  }
  assert.deepEqual(motor.desfazer(), base(), 'Erros não introduziram estados no undo');
  assert.equal(motor.desfazer(), null);
  assert.deepEqual(motor.refazer(), antes);
});

test('Erro não perde redo nem consome ID; edição sem alteração também preserva redo', () => {
  const motor = Editor.criar(base()), criada = adicionar(motor);
  motor.desfazer();
  assert.throws(() => adicionar(motor, 0.1), /sobrepostas/);
  editar(motor, { bpm: 90 });
  assert.equal(motor.podeRefazer(), true); assert.equal(motor.podeDesfazer(), false);
  assert.deepEqual(motor.refazer(), criada.chart);
  const comErro = Editor.criar(base()), semErro = Editor.criar(base());
  assert.throws(() => adicionar(comErro, 0.1), /sobrepostas/);
  assert.equal(adicionar(comErro).id, adicionar(semErro).id);
});

test('Novo ramo abandona redo, sem reutilizar IDs desfeitos ou excluídos', () => {
  const motor = Editor.criar(base()), primeira = adicionar(motor);
  motor.desfazer();
  const segunda = adicionar(motor, 4);
  assert.notEqual(segunda.id, primeira.id);
  assert.equal(motor.podeRefazer(), false); assert.equal(motor.refazer(), null);
  motor.executar({ tipo: 'excluirNota', id: segunda.id });
  const terceira = adicionar(motor, 6);
  assert.notEqual(terceira.id, primeira.id); assert.notEqual(terceira.id, segunda.id);
});

test('IDs importados de notas, frases e chart não colidem com IDs novos', () => {
  const chart = base(); chart.id = 'nota-editor-2';
  chart.sections = [{ id: 'nota-editor-3', title: 'Abertura', from: 0, to: 1 }];
  const motor = Editor.criar(chart), criada = adicionar(motor);
  const frase = motor.executar({ tipo: 'criarFrase', frase: { title: 'Continuação', from: 1, to: 4 } });
  const ids = [frase.chart.id, ...frase.chart.notes.map(n => n.id), ...frase.chart.sections.map(s => s.id)];
  assert.equal(new Set(ids).size, ids.length); assert.equal(criada.id, 'nota-editor-4');
  assert.equal(Editor.criar(frase.chart).obter().notes[1].id, criada.id);
});

test('Alterar BPM afeta só metadado, não move notas ou frases nem muda o chart ID', () => {
  const chart = Core.demoChart(), motor = Editor.criar(chart);
  const alterado = editar(motor, { title: 'Meu estudo', bpm: 117.25, duration: 89.123456789 }).chart;
  assert.equal(alterado.id, chart.id); assert.equal(alterado.bpm, 117.25);
  assert.deepEqual(alterado.notes, chart.notes); assert.deepEqual(alterado.sections, chart.sections);
  assert.deepEqual(motor.desfazer(), chart); assert.deepEqual(motor.refazer(), alterado);
});

test('Editar notas, frases e duração preserva mapa de andamento e histórico defensivo', () => {
  const chart = base();
  chart.bpm = 120;
  chart.tempoMap = { version: 1, events: [{ time: 0, beat: 0, bpm: 120 }, { time: 4, beat: 8, bpm: 90 }] };
  const motor = Editor.criar(chart);
  const before = motor.obter();
  const changed = motor.executar({ tipo: 'editarNota', id: before.notes[0].id, alteracoes: { fret: 2 } }).chart;
  assert.deepEqual(changed.tempoMap, before.tempoMap);
  changed.tempoMap.events[1].bpm = 40;
  assert.equal(motor.obter().tempoMap.events[1].bpm, 90);
  assert.deepEqual(motor.desfazer().tempoMap, before.tempoMap);
  assert.deepEqual(motor.refazer().tempoMap, before.tempoMap);
});

test('Reduzir duração não corta notas/frases e limite de 900 segundos é efetivo', () => {
  const chart = base(); chart.sections = [{ id: 'fim', title: 'Até o fim', from: 0, to: 16 }];
  const motor = Editor.criar(chart);
  assert.throws(() => editar(motor, { duration: 10 }), /trecho/);
  assert.throws(() => editar(motor, { duration: 0.4 }), /ultrapassa/);
  assert.throws(() => editar(motor, { duration: 900.001 }), /900/);
  assert.throws(() => editar(motor, { bpm: 301 }), /BPM/);
  assert.throws(() => editar(motor, { bpm: 19.99 }), /BPM/);
  assert.deepEqual(motor.obter(), chart); assert.equal(motor.podeDesfazer(), false);
  assert.equal(editar(motor, { duration: 900 }).chart.duration, 900);
  assert.throws(() => adicionar(motor, 899.75), /ultrapassa/);
});

test('Frases podem ser criadas/editadas/excluídas com roundtrip e ordenação por início', () => {
  const motor = Editor.criar(base());
  const criada = motor.executar({ tipo: 'criarFrase', frase: { title: 'Segunda', from: 3.123456789, to: 6.123456789 } });
  const segunda = motor.executar({ tipo: 'criarFrase', frase: { title: 'Primeira', from: 0, to: 3 } });
  const editada = motor.executar({ tipo: 'editarFrase', id: criada.id, alteracoes: { title: 'Tema', from: 2.8, to: 7.9 } });
  assert.equal(editada.chart.sections[0].id, segunda.id);
  assert.deepEqual(editada.chart.sections[1], { id: criada.id, title: 'Tema', from: 2.8, to: 7.9 });
  const excluida = motor.executar({ tipo: 'excluirFrase', id: criada.id });
  assert.equal(excluida.chart.sections.length, 1);
  assert.deepEqual(motor.desfazer(), editada.chart); assert.deepEqual(motor.refazer(), excluida.chart);
  motor.executar({ tipo: 'excluirFrase', id: segunda.id });
  assert.deepEqual(motor.obter().sections, []);
});

test('Frases inválidas e campos de identidade/afinação/MIDI não alteram dados', () => {
  const motor = Editor.criar(base());
  const frase = motor.executar({ tipo: 'criarFrase', frase: { title: 'Frase', from: 0, to: 4 } });
  const antes = motor.obter();
  for (const alteracoes of [{ title: '<script>' }, { from: 4 }, { to: 17 }, { to: -1 }, { from: NaN }]) {
    assert.throws(() => motor.executar({ tipo: 'editarFrase', id: frase.id, alteracoes }));
  }
  for (const alteracoes of [{ id: 'outro' }, { tuning: [40, 45, 50, 55, 59, 64] }, {}]) {
    assert.throws(() => editar(motor, alteracoes));
  }
  assert.throws(() => motor.executar({ tipo: 'editarNota', id: antes.notes[0].id, alteracoes: { midi: 64 } }), /não permitidos/);
  assert.throws(() => motor.executar({ tipo: 'criarNota', nota: { time: 2, duration: 0.5, string: 6, fret: 0, id: 'forcado' } }), /não permitidos/);
  assert.deepEqual(motor.obter(), antes);
});

test('Limites de 2000 notas e 100 frases não permitem crescimento nem histórico parcial', () => {
  const chart = base(); chart.duration = 300;
  chart.notes = Array.from({ length: 2000 }, (_, i) => ({ id: 'n-' + i, time: i / 10, duration: 0.05, string: 6, fret: 0, midi: 40 }));
  chart.sections = Array.from({ length: 100 }, (_, i) => ({ id: 'f-' + i, title: 'Frase ' + i, from: i, to: i + 0.5 }));
  const motor = Editor.criar(chart);
  assert.throws(() => adicionar(motor, 250), /2000/);
  assert.throws(() => motor.executar({ tipo: 'duplicarNota', id: 'n-0', time: 250 }), /2000/);
  assert.throws(() => motor.executar({ tipo: 'criarFrase', frase: { title: 'Extra', from: 250, to: 251 } }), /100/);
  assert.deepEqual(motor.obter(), chart); assert.equal(motor.podeDesfazer(), false);
});

test('Histórico retém exatamente 80 alterações e refaz o mesmo conjunto de estados', () => {
  assert.equal(Editor.LIMITE_HISTORICO, 80);
  const motor = Editor.criar(base());
  for (let i = 1; i <= 81; i++) editar(motor, { title: 'Revisão ' + i });
  for (let i = 80; i >= 1; i--) assert.equal(motor.desfazer().title, 'Revisão ' + i);
  assert.equal(motor.desfazer(), null);
  for (let i = 2; i <= 81; i++) assert.equal(motor.refazer().title, 'Revisão ' + i);
  assert.equal(motor.refazer(), null);
});

test('Entrada, operações e todas as saídas são cópias defensivas sem afetar undo/redo', () => {
  const chart = base(), original = base(), motor = Editor.criar(chart);
  chart.notes[0].fret = 24; chart.tuning[0] = 12; chart.metadata.demo = true;
  const op = { tipo: 'criarNota', nota: { time: 2, duration: 0.5, string: 3, fret: 2 } };
  const saida = motor.executar(op), esperado = Core.validarChart(saida.chart);
  op.nota.fret = 12; saida.chart.notes[0].time = 99; saida.chart.metadata.demo = true;
  const leitura = motor.obter(); leitura.tuning[0] = 1; leitura.notes.length = 0;
  assert.deepEqual(motor.obter(), esperado);
  const undo = motor.desfazer(); assert.deepEqual(undo, original); undo.notes.length = 0;
  const redo = motor.refazer(); assert.deepEqual(redo, esperado); redo.tuning[0] = 3;
  assert.deepEqual(motor.obter(), esperado); assert.deepEqual(motor.desfazer(), original);
});

test('Operações desconhecidas, IDs ausentes e estruturas incompletas falham sem histórico', () => {
  const motor = Editor.criar(base());
  for (const op of [null, [], {}, { tipo: 'ignorar' }, { tipo: 'criarNota', nota: {} },
    { tipo: 'excluirNota', id: 'desconhecida' }, { tipo: 'excluirFrase', id: 'desconhecida' },
    { tipo: 'editarChart', alteracoes: [], extra: 1 }, { tipo: 'editarNota', id: 'nota-editor-1', alteracoes: null }]) {
    assert.throws(() => motor.executar(op));
  }
  assert.deepEqual(motor.obter(), base()); assert.equal(motor.podeDesfazer(), false);
});

test('UMD expõe o mesmo contrato em window independente de globalThis e exige o Core', () => {
  const source = fs.readFileSync(path.join(__dirname, 'editor-nucleo.js'), 'utf8');
  const sandbox = { window: { MusiqueTocarCore: Core, MusiqueTocarPerfis: require('./perfis') } };
  vm.runInNewContext(source, sandbox);
  assert.equal(typeof sandbox.window.MusiqueTocarEditorCore.criar, 'function');
  assert.equal(sandbox.MusiqueTocarEditorCore, undefined);
  const web = sandbox.window.MusiqueTocarEditorCore;
  assert.deepEqual(JSON.parse(JSON.stringify(web.criar(base()).obter())), base());
  assert.equal(web.novoChart('Baixo', 'baixo-web', 'baixo').notes[0].midi, 28);
  assert.notEqual(web.novoChart().id, web.novoChart().id, 'Fallback sem crypto mantém identidades distintas');
  assert.throws(() => vm.runInNewContext(source, { window: {} }), /Carregue MusiqueTocarCore/);
});
