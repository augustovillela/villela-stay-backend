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
//
// O PACOTE É ES5 (réplica de 11/10/2026, R3-B11). Os módulos vão CRUS — não há
// etapa de build nem transpilador no projeto —, então quem tem de ser ES5 é o
// FONTE de cada um: `var` e `function`, sem seta, sem `const`/`let`, sem texto
// com crase, sem espalhamento nem desestruturação, sem Map/Set, sem método de
// biblioteca posterior ao ES5 (`includes`, `find`, `padStart`, `Object.entries`…).
// Antes, um `{ ...b }` na calculadora e um resto de desestruturação no plano
// faziam o arquivo inteiro falhar em navegador de antes de 2018, e as três
// ferramentas sumiam com um aviso de "navegador não suportado". `problemasDeES5`
// (abaixo) é o que o teste usa para recusar sintaxe nova nos módulos da lista —
// este arquivo, que só roda no servidor, não precisa segui-la.
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

// ---------------------------------------------------------------------
// VERIFICADOR DE ES5 — sem dependência: tira comentários, textos e expressões regulares do fonte e procura, no que
// sobra, o que um navegador ES5 não entende (sintaxe) ou não tem (biblioteca). Não é um analisador da linguagem:
// é uma varredura de fichas proibidas, estrita de propósito — na dúvida, acusa. → [{ regra, trecho, linha }]
// ---------------------------------------------------------------------
function semTextos(fonte) {
  const f = String(fonte);
  let saida = '', i = 0, ultimo = ''; // `ultimo`: a última ficha significativa (decide se "/" abre expressão regular)
  const palavraAntes = () => (/([A-Za-z_$][\w$]*)\s*$/.exec(saida) || [])[1] || '';
  while (i < f.length) {
    const c = f[i], d = f[i + 1];
    if (c === '/' && d === '/') { while (i < f.length && f[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const fim = f.indexOf('*/', i + 2); const ate = fim < 0 ? f.length : fim + 2; saida += f.slice(i, ate).replace(/[^\n]/g, ''); i = ate; continue; }
    if (c === '\'' || c === '"') {
      let k = i + 1;
      while (k < f.length && f[k] !== c) { if (f[k] === '\\') k++; k++; }
      saida += c + c; i = k + 1; ultimo = 'x'; continue;
    }
    if (c === '/' && (ultimo === '' || '(,=:[!&|?{};+-*%<>~^'.includes(ultimo) || ['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do'].includes(palavraAntes()))) {
      let k = i + 1, classe = false;
      while (k < f.length && (f[k] !== '/' || classe) && f[k] !== '\n') { if (f[k] === '\\') k++; else if (f[k] === '[') classe = true; else if (f[k] === ']') classe = false; k++; }
      k++; while (/[a-z]/.test(f[k] || '')) k++;
      saida += '/R/'; i = k; ultimo = 'x'; continue;
    }
    saida += c; if (!/\s/.test(c)) ultimo = c; i++;
  }
  return saida;
}
const PROIBIDO_NO_ES5 = [
  ['função seta', /=>/g],
  ['const ou let', /\b(?:const|let)\b/g],
  ['texto com crase', /`/g],
  ['espalhamento ou resto (...)', /\.\.\./g],
  ['class, async, await, yield, import, export', /\b(?:class|async|await|yield|import|export|extends|super)\b/g],
  ['for…of', /\bfor\s*\([^)]*\sof\s/g],
  ['desestruturação em var', /\bvar\s*[[{]/g],
  ['parâmetro com valor padrão ou desestruturado', /\bfunction\b[^(]*\([^)]*[=[{]/g],
  ['propriedade abreviada', /\{\s*[A-Za-z_$][\w$]*\s*[,}]|,\s*[A-Za-z_$][\w$]*\s*\}/g],
  ['método abreviado', /[{,]\s*[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/g],
  ['chave computada', /[{,]\s*\[[^\]]*\]\s*:/g],
  ['vírgula sobrando em chamada', /,\s*\)/g],
  ['**, ?. ou ??', /\*\*|\?\.(?=[A-Za-z_$([])|\?\?/g],
  ['Map, Set, Promise, Symbol, Proxy, Reflect', /\b(?:Map|Set|WeakMap|WeakSet|Promise|Symbol|Proxy|Reflect)\b/g],
  ['Object.entries/values/assign/fromEntries', /\bObject\.(?:entries|values|assign|fromEntries|is|getOwnPropertySymbols)\b/g],
  ['Array.from/of', /\bArray\.(?:from|of)\b/g],
  ['Number.isFinite/isInteger/isNaN…', /\bNumber\.(?:isFinite|isInteger|isNaN|isSafeInteger|parseFloat|parseInt|EPSILON|MAX_SAFE_INTEGER|MIN_SAFE_INTEGER)\b/g],
  ['Math de depois do ES5', /\bMath\.(?:trunc|sign|log2|log10|hypot|cbrt|fround|clz32|expm1|log1p)\b/g],
  ['método de lista ou de texto de depois do ES5', /\.(?:includes|find|findIndex|findLast|findLastIndex|fill|flat|flatMap|copyWithin|padStart|padEnd|startsWith|endsWith|repeat|at|matchAll|replaceAll|trimStart|trimEnd|codePointAt|normalize)\s*\(/g],
];
// `if (x) { a } else { b }` não é propriedade abreviada, e `function f() {` depois de vírgula não é método: as duas
// regras acima olham só a forma. O que elas acusam se conserta escrevendo por extenso — é o preço de não ter analisador.
function problemasDeES5(fonte) {
  const limpo = semTextos(fonte), achados = [];
  for (const [regra, re] of PROIBIDO_NO_ES5) {
    re.lastIndex = 0;
    for (let m; (m = re.exec(limpo));) {
      // `function (a, b) {` depois de "{" ou "," casa com "método abreviado": é função anônima, que é ES5
      if (regra === 'método abreviado' && /^[{,]\s*(?:function|if|for|while|switch|catch)\b/.test(m[0])) continue;
      achados.push({ regra, trecho: limpo.slice(Math.max(0, m.index - 30), m.index + 50).replace(/\s+/g, ' ').trim(), linha: limpo.slice(0, m.index).split('\n').length });
    }
  }
  return achados;
}

module.exports = { pacote, problemasDeES5, semTextos, MODULOS, EXPOSTOS };
