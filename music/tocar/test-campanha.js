'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const Campanha = require('./campanha');

test('campanha de violão começa na primeira etapa e bloqueia as seguintes', () => {
  const estado = Campanha.criar({ instrument: 'violao' });
  const lista = Campanha.listar(estado);
  assert.equal(lista.length, 7); assert.equal(lista[0].status, 'available'); assert.ok(lista.slice(1).every(item => item.status === 'locked')); assert.equal(Campanha.proximo(estado).id, 'primeiro-riff-v1'); assert.equal(lista[0].challenge.level, 'Nível 1'); assert.equal(lista[0].challenge.metric, 'conclusao'); assert.equal(lista[0].reward.unlocked, false);
});
test('iniciar e retomar preservam posição sem mutar o estado original', () => {
  const estado = Campanha.criar({ instrument: 'guitarra' });
  const iniciado = Campanha.iniciar(estado, 'primeiro-riff-v1');
  const atualizado = Campanha.atualizar(iniciado, 'primeiro-riff-v1', { position: 3.5, accuracy: 82 });
  assert.equal(estado.progress['primeiro-riff-v1'].status, 'available'); assert.equal(atualizado.progress['primeiro-riff-v1'].status, 'in_progress'); assert.equal(atualizado.progress['primeiro-riff-v1'].position, 3.5); assert.equal(atualizado.progress['primeiro-riff-v1'].bestAccuracy, 82); assert.equal(Campanha.retomar(atualizado, 'primeiro-riff-v1').position, 3.5);
});
test('concluir uma etapa desbloqueia somente a próxima', () => {
  let estado = Campanha.criar({ instrument: 'violao' }); estado = Campanha.atualizar(estado, 'primeiro-riff-v1', { completed: true, accuracy: 91 }); const lista = Campanha.listar(estado);
  assert.equal(lista[0].status, 'completed'); assert.equal(lista[1].status, 'available'); assert.ok(lista.slice(2).every(item => item.status === 'locked')); assert.equal(Campanha.proximo(estado).id, 'cordas-soltas-v1'); assert.equal(lista[0].reward.unlocked, true);
});
test('campanhas de instrumentos adicionais usam seus estudos correspondentes', () => {
  for (const [instrument, id] of [['baixo', 'baixo-pulsacao-v1'], ['piano', 'piano-pulsacao-v1'], ['bateria', 'bateria-pulsacao-v1'], ['bandolim', 'bandolim-pulsacao-v1']]) { const lista = Campanha.listar(Campanha.criar({ instrument })); assert.equal(lista.length, 1); assert.equal(lista[0].id, id); assert.equal(lista[0].status, 'available'); }
});
test('dados inválidos são normalizados e estudo bloqueado não pode ser iniciado', () => {
  const estado = Campanha.criar({ instrument: 'desconhecido', progress: { 'primeiro-riff-v1': { position: -4, bestAccuracy: 130 } } });
  assert.equal(estado.instrument, 'violao'); assert.equal(estado.progress['primeiro-riff-v1'].position, 0); assert.equal(estado.progress['primeiro-riff-v1'].bestAccuracy, null); assert.throws(() => Campanha.atualizar(estado, 'cordas-soltas-v1', { position: 1 }), /bloqueado/); assert.throws(() => Campanha.atualizar(estado, 'nao-existe', {}), /não pertence/);
});
