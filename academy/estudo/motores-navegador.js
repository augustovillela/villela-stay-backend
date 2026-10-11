// =====================================================================
// Villela Academy — ESTUDO · os MOTORES PUROS, servidos ao navegador.
//
// As Ferramentas do concurseiro (calculadora de pontuação, contador de
// prazo, cronograma) rodam no navegador, sem IA e sem custo — mas com o
// MESMO código que o servidor usa e que os testes exercitam. Em vez de
// reescrever a conta em JS de tela, este arquivo embrulha os módulos puros
// num carregador mínimo e os entrega em /academy/estude-motores.js:
//   window.EstudeMotores = { pontuacao, calculadora, prazo, plano, cronograma }
// Só entram módulos SEM banco, sem rede e sem `require` de fora desta lista.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const MODULOS = ['agenda', 'plano', 'pontuacao', 'calculadora', 'prazo', 'cronograma']; // dependência antes de quem depende
const EXPOSTOS = ['pontuacao', 'calculadora', 'prazo', 'plano', 'cronograma'];

let cache = '';
function pacote() {
  if (cache) return cache;
  const partes = MODULOS.map(n => {
    const fonte = fs.readFileSync(path.join(__dirname, n + '.js'), 'utf8');
    const pedidos = [...fonte.matchAll(/require\('([^']+)'\)/g)].map(m => m[1].replace(/^\.\//, ''));
    const fora = pedidos.filter(p => !MODULOS.includes(p));
    if (fora.length) throw new Error(`motores-navegador: ${n}.js pede ${fora.join(', ')}, que não é módulo puro desta lista.`);
    return `M[${JSON.stringify(n)}] = function (module, exports, require) {\n${fonte}\n};`;
  });
  cache = `/* Villela Academy — motores puros do Estude (gerado de academy/estudo/*.js; não editar aqui) */\n(function () {\n` +
    `var M = {}, C = {};\nfunction pedir(n) { n = String(n).replace(/^\\.\\//, ''); if (C[n]) return C[n].exports; if (!M[n]) throw new Error('motor desconhecido: ' + n); var m = C[n] = { exports: {} }; M[n](m, m.exports, pedir); return m.exports; }\n` +
    partes.join('\n') + `\nwindow.EstudeMotores = { ${EXPOSTOS.map(n => `${n}: pedir('${n}')`).join(', ')} };\n})();\n`;
  return cache;
}

module.exports = { pacote, MODULOS, EXPOSTOS };
