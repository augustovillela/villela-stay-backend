'use strict';
// Endereço de item do app do Musique (F5 reabre o item): #obra=ID, #repertorio=ID, #escola=ID, #turma=ID, #retorno=ID.
// Extrai o trecho de roteamento do app-cliente.js (servido como template) e testa em node.
const assert = require('assert');
const { JS } = require('./app-cliente');
const ini = JS.indexOf('var ITENS = ');
const fim = JS.indexOf('function marcarItem');
assert.ok(ini > 0 && fim > ini, 'trecho de roteamento não encontrado no app-cliente.js');
const { itemDoHash, ITENS } = new Function(JS.slice(ini, fim) + '\nreturn { itemDoHash: itemDoHash, ITENS: ITENS };')();
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);

eq(itemDoHash('#obra=abc_123-X'), { tipo: 'obra', id: 'abc_123-X', aba: 'biblioteca' });
eq(itemDoHash('#repertorio=r1'), { tipo: 'repertorio', id: 'r1', aba: 'repertorios' });
eq(itemDoHash('#escola=e1'), { tipo: 'escola', id: 'e1', aba: 'escola' });
eq(itemDoHash('#turma=t1'), { tipo: 'turma', id: 't1', aba: 'minhas_turmas' });
eq(itemDoHash('#retorno=s9'), { tipo: 'retorno', id: 's9', aba: 'tarefas' });
eq(itemDoHash('obra=semcerquilha'), { tipo: 'obra', id: 'semcerquilha', aba: 'biblioteca' }, 'aceita sem #');
for (const ruim of ['', '#', '#biblioteca', '#obra=', '#obra=a b', '#obra=<script>', '#cifra=ID', '#musica=ID', '#obra=a/b', '#desconhecido=1']) {
  assert.strictEqual(itemDoHash(ruim), null, 'não é item: ' + JSON.stringify(ruim));
}
assert.strictEqual(itemDoHash('#obra=' + 'x'.repeat(81)), null, 'id longo demais');
// toda aba de item existe no menu do app
for (const aba of Object.values(ITENS)) assert.ok(JS.indexOf("['" + aba + "',") > 0 || JS.indexOf("'" + aba + "'") > 0, 'aba sem entrada: ' + aba);
// os formatos que já existiam não viram item (as Cifras cuidam deles)
for (const h of ['#cifras', '#cifra=ID', '#musica=ID', '#banda=ID', '#setlist=ID', '#convite=ID', '#vivo=ID']) assert.strictEqual(itemDoHash(h), null, h);
console.log('music/test-rota-hash: tudo certo');
