'use strict';
// Endereço da tela do Closet (F5 mantém a tela): rotaDoHash do app-cliente.js, testada em node.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, 'app-cliente.js'), 'utf8');
const ini = src.indexOf('const ABAS = [');
const fimAbas = src.indexOf('function montarAbas');
const ini2 = src.indexOf('const ITENS_HASH');
const fim2 = src.indexOf('// Grava o endereço sem disparar');
assert.ok(ini > 0 && fimAbas > ini && ini2 > 0 && fim2 > ini2, 'trechos de rota não encontrados no app-cliente.js');
const { rotaDoHash, ABAS } = new Function(src.slice(ini, fimAbas) + '\n' + src.slice(ini2, fim2) + '\nreturn { rotaDoHash: rotaDoHash, ABAS: ABAS };')();
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);

eq(rotaDoHash(''), { aba: 'inicio', tipo: '', id: '', novo: false }, 'vazio = início');
eq(rotaDoHash('#pecas'), { aba: 'pecas', tipo: '', id: '', novo: false });
eq(rotaDoHash('#minhas-reservas'), { aba: 'minhas-reservas', tipo: '', id: '', novo: false });
eq(rotaDoHash('#parceiro').aba, 'parceiro');
eq(rotaDoHash('#reserva/R1'), { aba: 'minhas-reservas', tipo: 'reserva', id: 'R1', novo: false }, 'formato que já existia');
eq(rotaDoHash('#peca/abc_9-Z'), { aba: 'pecas', tipo: 'peca', id: 'abc_9-Z', novo: false });
eq(rotaDoHash('#peca/novo'), { aba: 'pecas', tipo: 'peca', id: '', novo: true });
eq(rotaDoHash('#look/L7'), { aba: 'looks', tipo: 'look', id: 'L7', novo: false });
eq(rotaDoHash('#look/novo'), { aba: 'looks', tipo: 'look', id: '', novo: true });
for (const ruim of ['#naoexiste', '#peca/', '#peca/a b', '#peca/<x>', '#look/a/b', '#disputa/1', '#reserva']) {
  assert.strictEqual(rotaDoHash(ruim).aba === 'inicio' || rotaDoHash(ruim).tipo === '', true, 'cai no padrão: ' + ruim);
}
eq(rotaDoHash('#peca/' + 'x'.repeat(81)).tipo, '', 'id longo demais não vira item');
for (const a of ABAS) assert.strictEqual(rotaDoHash('#' + a[0]).aba, a[0], 'toda aba do menu é roteável: ' + a[0]);
console.log('closet/test-rota: tudo certo');
