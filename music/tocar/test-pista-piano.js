'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Piano = require('./pista-piano');

function quase(a, b) { assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`); }
function canvasFalso() {
  const calls = [], stack = [];
  const g = { fillStyle: '', globalAlpha: 0.5, font: '', textAlign: 'left', textBaseline: 'top',
    save() { stack.push({ globalAlpha: this.globalAlpha, fillStyle: this.fillStyle }); calls.push(['save']); },
    restore() { Object.assign(this, stack.pop()); calls.push(['restore']); },
    clearRect(...args) { calls.push(['clearRect', ...args]); },
    fillRect(...args) { calls.push(['fillRect', ...args, this.fillStyle, this.globalAlpha]); },
    fillText(...args) { calls.push(['fillText', ...args]); },
    createLinearGradient(...args) { calls.push(['gradient', ...args]); return { addColorStop() {} }; },
    beginPath() {}, moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); }, stroke() {},
  };
  return { g, calls };
}

test('teclado tem 88 alturas absolutas, 52 brancas e 36 pretas em geometria física', () => {
  const g = Piano.geometria({ w: 1280, h: 520, d: 1 });
  assert.equal(g.keys.length, 88); assert.equal(g.whiteKeys.length, 52); assert.equal(g.blackKeys.length, 36);
  assert.deepEqual(g.keys.map(k => k.midi), Array.from({ length: 88 }, (_, i) => i + 21));
  assert.equal(g.keys[0].name, 'Lá0'); assert.equal(g.keys[87].name, 'Dó8');
  assert.equal(g.byMidi[60].name, 'Dó4'); assert.equal(g.byMidi[72].name, 'Dó5');
  quase(g.byMidi[72].center - g.byMidi[60].center, 7 * g.whiteWidth);
  quase(g.whiteKeys[0].x, g.x); quase(g.whiteKeys[51].x + g.whiteWidth, g.x + g.width);
  assert.equal(new Set(g.keys.map(k => k.center)).size, 88);
  for (const key of g.blackKeys) {
    const anterior = g.byMidi[key.midi - 1], seguinte = g.byMidi[key.midi + 1];
    assert.equal(anterior.black, false); assert.equal(seguinte.black, false);
    quase(key.center, seguinte.x); quase(key.center, anterior.x + anterior.width);
    assert.ok(key.height < anterior.height); assert.ok(key.width < anterior.width);
  }
  for (const midi of [23, 35, 47, 59, 71, 83, 95, 107, 28, 40, 52, 64, 76, 88, 100]) {
    assert.equal(g.byMidi[midi].black, false);
    assert.equal(g.byMidi[midi + 1].black, false, 'Si/Dó e Mi/Fá não têm tecla preta entre eles');
  }
});

test('geometria preserva proporções no DPR e tolera dimensões pequenas sem NaN', () => {
  const normal = Piano.geometria({ w: 900, h: 480, d: 1 });
  const retina = Piano.geometria({ w: 1800, h: 960, d: 2 });
  for (const field of ['x', 'width', 'top', 'strikeY', 'bottom', 'keyHeight', 'whiteWidth', 'travel']) quase(retina[field], normal[field] * 2);
  for (let i = 0; i < 88; i++) {
    for (const field of ['x', 'y', 'width', 'height', 'center']) quase(retina.keys[i][field], normal.keys[i][field] * 2);
  }
  for (const dims of [{ w: 1, h: 1 }, { w: 320, h: 180 }, { w: 1280, h: 520, d: NaN }]) {
    const geo = Piano.geometria(dims);
    assert.ok(geo.travel > 0); assert.ok(geo.strikeY > geo.top);
    geo.keys.forEach(key => Object.values(key).filter(v => typeof v === 'number').forEach(v => assert.ok(Number.isFinite(v))));
  }
  for (const dims of [{ w: 0, h: 100 }, { w: NaN, h: 100 }, { w: 100, h: Infinity }, { w: -1, h: 100 }]) assert.equal(Piano.geometria(dims), null);
});

test('nota desce até a própria tecla e cauda representa duração em segundos', () => {
  const geo = Piano.geometria({ w: 1280, h: 520, d: 1 });
  const nota = { midi: 60, time: 3, duration: 1 };
  const antes = Piano.projetarNota(nota, geo, { position: 0 });
  const perto = Piano.projetarNota(nota, geo, { position: 1 });
  const inicio = Piano.projetarNota(nota, geo, { position: 3 });
  assert.ok(perto.headY > antes.headY);
  quase(perto.headY - antes.headY, geo.travel / 4.5);
  quase(antes.headY - antes.tailY, geo.travel / 4.5);
  quase(inicio.headY, geo.strikeY); assert.equal(inicio.active, true); assert.equal(antes.active, false);
  quase(antes.x + antes.width / 2, geo.byMidi[60].center);
  assert.equal(Piano.projetarNota(nota, geo, { position: 4 }), null, 'cauda concluída sai da pista');
  const sustentada = Piano.projetarNota(nota, geo, { position: 3.5 });
  assert.equal(sustentada.active, true); quase(sustentada.bottom, geo.strikeY);
  quase(sustentada.height, 0.5 * geo.travel / 4.5);
});

test('acordes, oitavas e teclas pretas ficam alinhados sem compartilhar faixa', () => {
  const geo = Piano.geometria({ w: 1280, h: 520, d: 1 });
  const notas = [60, 61, 64, 67, 72].map(midi => Piano.projetarNota({ midi, time: 2, duration: 0.5 }, geo, { position: 1 }));
  assert.equal(new Set(notas.map(n => n.x + n.width / 2)).size, 5);
  notas.forEach(n => { quase(n.headY, notas[0].headY); quase(n.x + n.width / 2, geo.byMidi[n.midi].center); });
  assert.equal(notas[1].key.black, true);
  assert.ok(notas[0].x + notas[0].width < notas[1].x, 'Dó e Dó♯ simultâneos não escondem suas durações');
  quase(notas[4].x + notas[4].width / 2 - notas[0].x - notas[0].width / 2, 7 * geo.whiteWidth);
  const cromatica = Array.from({ length: 88 }, (_, i) => Piano.projetarNota({ midi: i + 21, time: 2, duration: 0.5 }, geo, { position: 1 }));
  for (let i = 1; i < cromatica.length; i++) assert.ok(cromatica[i - 1].x + cromatica[i - 1].width < cromatica[i].x);
});

test('projeção recorta caudas longas, fim do trecho e entradas inválidas', () => {
  const geo = Piano.geometria({ w: 800, h: 400, d: 1 });
  const longa = Piano.projetarNota({ midi: 60, time: 1, duration: 60 }, geo, { position: 10 });
  assert.equal(longa.y, geo.top); assert.equal(longa.bottom, geo.strikeY); assert.equal(longa.active, true);
  const trecho = Piano.projetarNota({ midi: 60, time: 2, duration: 10 }, geo, { position: 3, from: 2, to: 4 });
  assert.equal(trecho.end, 4); quase(trecho.height, geo.travel / 4.5);
  assert.equal(Piano.projetarNota({ midi: 60, time: 1, duration: 10 }, geo, { position: 3, from: 2, to: 4 }), null);
  assert.equal(Piano.projetarNota({ midi: 60, time: 4, duration: 1 }, geo, { from: 2, to: 4 }), null);
  assert.equal(Piano.projetarNota({ midi: 60, time: 8, duration: 1 }, geo, { position: 0 }), null);
  const curta = Piano.projetarNota({ midi: 60, time: 0.001, duration: 0.02 }, geo, { position: 0 });
  assert.ok(curta.height >= 4); assert.ok(curta.bottom <= geo.strikeY); assert.ok(curta.y >= geo.top);
  for (const nota of [{ midi: 20, time: 0, duration: 1 }, { midi: 109, time: 0, duration: 1 }, { midi: 60, time: NaN, duration: 1 }, { midi: 60, time: 0, duration: Infinity }, { midi: 60, time: 0, duration: 0 }]) {
    assert.equal(Piano.projetarNota(nota, geo, {}), null);
  }
});

test('canvas desenha acordes e teclado realçando somente notas ativas do arranjo', () => {
  const { g, calls } = canvasFalso();
  const notes = [
    { id: 'c4', midi: 60, time: 1, duration: 2, velocity: 100 },
    { id: 'cs4', midi: 61, time: 1, duration: 2, velocity: 80 },
    { id: 'c5', midi: 72, time: 1, duration: 2, velocity: 127 },
    { id: 'futura', midi: 64, time: 3, duration: 1, velocity: 100 },
  ];
  const result = Piano.desenhar(g, { w: 1280, h: 520, d: 1, chart: { duration: 8, notes }, position: 2,
    from: 0, to: 8, statuses: { c4: 'hit' }, beats: [0, 1, 2, 3, 4, 5, NaN, Infinity], mode: 'practice', running: true });
  assert.equal(result.visibleNotes, 4); assert.deepEqual(result.activeMidis, [60, 61, 72]);
  assert.equal(g.globalAlpha, 0.5, 'save/restore preserva estado do canvas chamador');
  const labels = calls.filter(c => c[0] === 'fillText').map(c => c[1]);
  for (const label of ['Dó4', 'Dó5', 'Lá0', 'Dó8', 'PIANO · 88 TECLAS', 'Teclas acesas = notas do arranjo']) assert.ok(labels.includes(label), label);
  const rectangles = calls.filter(c => c[0] === 'fillRect');
  const geo = result.geometry;
  const teclaPreta = rectangles.find(c => c[1] === geo.byMidi[61].x && c[2] === geo.strikeY && c[3] === geo.byMidi[61].width && c[4] === geo.byMidi[61].height);
  assert.equal(teclaPreta[5], '#f2d4a0', 'tecla preta esperada recebe destaque do arranjo');
  const ultimaBranca = rectangles.findIndex(c => c[2] === geo.strikeY && c[1] > geo.byMidi[108].x);
  assert.ok(rectangles.indexOf(teclaPreta) > ultimaBranca, 'pretas são desenhadas depois das brancas');
  for (const call of calls) for (const value of call) if (typeof value === 'number') assert.ok(Number.isFinite(value), 'canvas recebeu número finito');
  const depois = Piano.desenhar(g, { w: 1280, h: 520, d: 1, chart: { duration: 8, notes }, position: 4, mode: 'practice' });
  assert.deepEqual(depois.activeMidis, []); assert.equal(depois.visibleNotes, 0);
});

test('UMD disponibiliza renderizador sem DOM e dimensões vazias não desenham', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'pista-piano.js'), 'utf8'), sandbox);
  const web = sandbox.window.MusiqueTocarPiano;
  assert.equal(typeof web.desenhar, 'function'); assert.equal(web.geometria({ w: 320, h: 240 }).keys.length, 88);
  const { g, calls } = canvasFalso();
  const empty = web.desenhar(g, { w: 0, h: 0 });
  assert.equal(empty.geometry, null); assert.equal(calls.length, 0);
  const real = web.desenhar(g, { w: 320, h: 240, chart: { notes: [] }, position: NaN, beats: [NaN] });
  assert.equal(real.visibleNotes, 0);
  for (const call of calls) for (const value of call) if (typeof value === 'number') assert.ok(Number.isFinite(value));
});
