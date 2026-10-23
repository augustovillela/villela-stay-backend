'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Sessao = require('./sessao-game');

test('sessão percorre preparação, contagem, execução, pausa e conclusão', () => {
  const eventos = [], s = Sessao.criar({ onChange: x => eventos.push(x.estado) });
  const token = s.preparar();
  assert.equal(s.estado().estado, 'preparing');
  assert.equal(s.pronto(token), true); assert.equal(s.iniciar(token), true);
  assert.equal(s.pausar(), 'paused'); assert.equal(s.retomar(), 'running');
  assert.equal(s.concluir(), 'completed');
  assert.deepEqual(eventos, ['preparing', 'count-in', 'running', 'paused', 'running', 'completed']);
});

test('token antigo não pode iniciar uma preparação nova', () => {
  const s = Sessao.criar(), antigo = s.preparar();
  assert.equal(s.cancelar('troca de arranjo'), true);
  const atual = s.preparar();
  assert.equal(s.pronto(antigo), false); assert.equal(s.estado().estado, 'preparing');
  assert.equal(s.pronto(atual), true);
});

test('falha libera a sessão para nova tentativa e rejeita transições impossíveis', () => {
  const s = Sessao.criar(), token = s.preparar();
  assert.throws(() => s.retomar(), /retomada indisponível/);
  assert.equal(s.pronto(token), true); assert.equal(s.falhar('áudio indisponível'), 'failed');
  assert.equal(s.estado().motivo, 'áudio indisponível');
  assert.equal(s.preparar() > 0, true);
});

test('UMD disponibiliza o núcleo sem CommonJS', () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const sandbox = { window: {} }; sandbox.globalThis = sandbox.window;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'sessao-game.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.window.MusiqueTocarSessaoGame.criar, 'function');
});
