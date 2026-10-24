#!/usr/bin/env node
// Extrai a mesma fonte editorial usada pelo livro digital para a geração PDF.
'use strict';
const fs = require('fs');
const vm = require('vm');
const base = __dirname;
const contexto = {
  window: { MusiqueLab: { cliente: { ferramentas: {} } } },
  document: { createElementNS() { return { setAttribute() {}, appendChild() {}, classList: { add() {} } }; } }
};
vm.createContext(contexto);
vm.runInContext(fs.readFileSync(`${base}/cliente/curso-guitarra-especificos.js`, 'utf8'), contexto, { filename: 'curso-guitarra-especificos.js' });
vm.runInContext(fs.readFileSync(`${base}/cliente/curso-guitarra-livro.js`, 'utf8'), contexto, { filename: 'curso-guitarra-livro.js' });
const dados = contexto.window.MusiqueLab.cursoLivroDados;
if (!dados || !dados.capitulos) throw new Error('Fonte editorial do livro não foi encontrada.');
for (const c of dados.capitulos) {
  c.texto = (c.texto || []).concat(dados.aulasLongas[c.id] || []);
}
for (const ed of Object.keys(dados.especificos || {})) {
  for (const c of dados.especificos[ed]) c.texto = (c.texto || []).concat(dados.aulasLongas[c.id] || []);
}
const out = `${base}/livros-instrumentos-conteudo.json`;
fs.writeFileSync(out, JSON.stringify(dados, null, 2), 'utf8');
console.log(`Conteúdo editorial extraído para ${out}`);
