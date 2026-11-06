'use strict';
// Rota por endereço do painel da Alta Vista (F5 mantém a tela): funções puras do app-cliente.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const chamadas = [];
const loc = { hash: '', pathname: '/alta-vista/app', search: '' };
const ctx = { location: loc, history: { pushState: (_a, _b, u) => { chamadas.push(['push', u]); }, replaceState: (_a, _b, u) => { chamadas.push(['replace', u]); } },
  document: { querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener() {} }, fetch: async () => ({}), console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'app-cliente.js'), 'utf8') + '\nthis.avLerHash = avLerHash; this.avHash = avHash; this.avMarcar = avMarcar;', ctx);
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);

eq(ctx.avLerHash('#projetos'), { aba: 'projetos', id: '' });
eq(ctx.avLerHash('#projetos/abc123'), { aba: 'projetos', id: 'abc123' });
eq(ctx.avLerHash('#projetos/a%20b'), { aba: 'projetos', id: 'a b' }, 'id decodificado');
eq(ctx.avLerHash('#tours'), { aba: 'tours', id: '' });
eq(ctx.avLerHash('#conta/xyz'), { aba: 'conta', id: '' }, 'só projetos aceita id');
assert.strictEqual(ctx.avLerHash(''), null, 'hash vazio não é rota');
assert.strictEqual(ctx.avLerHash('#'), null);
assert.strictEqual(ctx.avLerHash('#inexistente'), null, 'aba desconhecida cai no padrão');
eq(ctx.avLerHash('#projetos/%E0%A4%A'), { aba: 'projetos', id: '' }, 'id malformado não quebra e vira lista');
assert.strictEqual(ctx.avHash('projetos', 'a b'), '#projetos/a%20b');
assert.strictEqual(ctx.avHash('conta'), '#conta');

// avMarcar: grava uma vez, não duplica, usa replace no boot
ctx.avMarcar('#tours', false); eq(chamadas.pop(), ['push', '/alta-vista/app#tours']);
loc.hash = '#tours'; ctx.avMarcar('#tours', false); assert.strictEqual(chamadas.length, 0, 'mesmo hash não empilha');
ctx.avMarcar('#conta', true); eq(chamadas.pop(), ['replace', '/alta-vista/app#conta']);
console.log('alta-vista/test-rota: tudo certo');
