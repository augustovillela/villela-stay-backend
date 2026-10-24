'use strict';

const assert = require('assert');
const { CURSO, capitulos, RUDIMENTOS } = require('./curso-bateria');
const { LICOES, POR_SLUG } = require('./licoes-bateria');

assert.equal(CURSO.id, 'curso-bateria-livro');
assert.equal(capitulos.length, 26);
assert.equal(LICOES.length, 26);
assert.equal(RUDIMENTOS.length, 40);
assert.equal(new Set(capitulos.map((c) => c.id)).size, 26);
assert.equal(new Set(capitulos.map((c) => c.slug)).size, 26);
assert.deepEqual(capitulos.map((c) => c.numero), Array.from({ length: 26 }, (_, i) => i + 1));
assert.equal(CURSO.fases.reduce((sum, fase) => sum + fase[2].length, 0), 26);
assert(RUDIMENTOS.every((r) => r.facilitadores.length === 8));
assert(RUDIMENTOS.every((r) => r.sticking && r.bpmStart > 0 && r.bpmTarget >= r.bpmStart && r.kitApplication && r.commonError && r.practiceMinutes > 0 && r.checkpoint));
assert(RUDIMENTOS.every((r) => r.movimentoDescricao && r.somDescricao && r.animacaoPrompt.includes(r.nome) && r.audioPrompt.includes(r.nome) && r.gestos.length === r.padrao.length));
assert(RUDIMENTOS.every((r) => r.movimentoPerfil && r.gestos.every((g) => g.retorno > 0 && g.intensidade > 0)));
assert(new Set(RUDIMENTOS.map((r) => r.gestos.map((g) => g.altura).join(','))).size >= 32);
assert.deepEqual(RUDIMENTOS[0].padrao, ['R', 'L', 'R', 'L', 'R', 'L', 'R', 'L']);
assert.equal(new Set(RUDIMENTOS[0].gestos.map((g) => g.altura)).size, 1);
assert.equal(new Set(RUDIMENTOS[0].gestos.map((g) => g.intensidade)).size, 1);
assert(capitulos.every((c) => POR_SLUG[c.slug]));
assert(LICOES.every((l) => Array.isArray(l.prereq) && Array.isArray(l.blocos) && l.blocos.length >= 6));
assert(LICOES.every((l) => l.blocos.some((b) => b.t === 'praticar')));
assert(LICOES.every((l) => l.blocos.some((b) => b.t === 'aprofundar')));
assert(LICOES.every((l) => l.blocos.some((b) => b.t === 'ferramenta' && b.slug)));
assert(LICOES.every((l) => l.blocos.filter((b) => b.t === 'praticar').every((b) => b.rudimento && b.rudimento.nome && b.rudimento.nome !== '[object Object]')));
assert(LICOES.every((l) => l.blocos.filter((b) => b.t === 'aprofundar').every((b) => !b.html.includes('[object Object]'))));

console.log(JSON.stringify({ ok: true, curso: CURSO.id, capitulos: capitulos.length, rudimentos: RUDIMENTOS.length, facilitadores: RUDIMENTOS[0].facilitadores.length }));
