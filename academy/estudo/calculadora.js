// =====================================================================
// Villela Academy — ESTUDO · CALCULADORA DE PONTUAÇÃO DA PROVA. Pura.
//
// NÃO faz conta de nota: monta uma prova com os números que o aluno
// informou (acertos, erros e em branco por bloco) e entrega ao motor de
// sempre, `pontuacao.corrigir` — o mesmo da aba Prova. Assim a calculadora
// e o simulado nunca dizem coisas diferentes para a mesma regra.
//
// "Quantos acertos faltam" também sai do motor: troca-se uma questão por
// acerto de cada vez (primeiro as erradas, depois as em branco) e pergunta-se
// de novo, até o mínimo ser atingido. Nenhuma fórmula paralela.
//
// ESTE ARQUIVO VAI AO NAVEGADOR (estudo/motores-navegador.js), servido cru:
// é escrito em ES5 — `var` e `function`, sem seta, sem `const`/`let`, sem
// texto com crase, sem espalhamento nem desestruturação, sem Map/Set
// (réplica de 11/10/2026, R3-B11: o `{ ...b }` e o resto de desestruturação
// daqui paravam as Ferramentas em navegador de antes de 2018). O teste de
// testes-auditoria-b2.js recusa sintaxe mais nova aqui.
// =====================================================================
'use strict';
var pontuacao = require('./pontuacao');

function int(v) { return Math.max(0, Math.round(Number(v) || 0)); }
var MAX_QUESTOES = 500; // por bloco: acima disso é erro de digitação
function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
// cópia rasa de `a` com os campos de `b` por cima (o lugar do espalhamento de objeto)
function junta(a, b) {
  var r = {}, k;
  for (k in a) if (tem(a, k)) r[k] = a[k];
  for (k in (b || {})) if (tem(b, k)) r[k] = b[k];
  return r;
}
function primeiro(lista, fn) { for (var i = 0; i < lista.length; i++) if (fn(lista[i])) return lista[i]; return undefined; }
function indiceDe(lista, fn) { for (var i = 0; i < lista.length; i++) if (fn(lista[i])) return i; return -1; }

// A regra que o aluno informa quando o percurso NÃO tem regra cadastrada. Vira o mesmo objeto que o edital
// cadastrado usaria — e por isso passa pelo mesmo `normalizarRegra`.
function regraInformada(o) {
  o = o === undefined ? {} : o;
  var blocos = o.blocos === undefined ? [] : o.blocos, minimoGeral = o.minimo_geral === undefined ? 0 : o.minimo_geral;
  var descontoACada = o.desconto_a_cada === undefined ? 0 : o.desconto_a_cada, emBranco = o.em_branco_conta_erro === undefined ? false : o.em_branco_conta_erro;
  return {
    valor_certa: 1,
    minimos: blocos.filter(function (b) { return int(b.minimo) > 0; }).map(function (b) { return { bloco: String(b.bloco || ''), min_pontos: int(b.minimo) }; }),
    aprovacao: int(minimoGeral) > 0 ? { min_pontos: int(minimoGeral) } : null,
    desconto: int(descontoACada) > 0 ? { a_cada: int(descontoACada) } : null,
    em_branco_conta_erro: !!emBranco,
    fonte: 'números informados por você (não são os do edital)'
  };
}

// blocos: [{ bloco, questoes, acertos, erros }] — em branco é o que sobra.
function normalizarBlocos(blocos) {
  var vistos = {};
  return (Array.isArray(blocos) ? blocos : []).map(function (b, i) {
    var nome = String(b.bloco == null ? '' : b.bloco).trim().slice(0, 40);
    if (tem(vistos, nome)) throw new Error('Há dois blocos com o nome "' + (nome || '(sem nome)') + '".');
    vistos[nome] = true;
    var acertos = int(b.acertos), erros = int(b.erros), questoes = int(b.questoes) || acertos + erros;
    if (questoes > MAX_QUESTOES) throw new Error('Bloco ' + (nome || i + 1) + ': até ' + MAX_QUESTOES + ' questões.');
    if (acertos + erros > questoes) throw new Error('Bloco ' + (nome || i + 1) + ': acertos (' + acertos + ') e erros (' + erros + ') somam mais que as ' + questoes + ' questões do bloco.');
    return { bloco: nome, questoes: questoes, acertos: acertos, erros: erros, em_branco: questoes - acertos - erros };
  }).filter(function (b) { return b.questoes > 0; });
}
// a prova de mentira que o motor corrige: gabarito "a"; acerto responde "a", erro responde "b", em branco não responde
function provaDe(blocos) {
  var itens = [], respostas = {};
  blocos.forEach(function (b) {
    for (var k = 0; k < b.questoes; k++) {
      var id = b.bloco + '#' + k;
      itens.push({ id: id, gabarito: 'a', bloco: b.bloco });
      if (k < b.acertos) respostas[id] = 'a'; else if (k < b.acertos + b.erros) respostas[id] = 'b';
    }
  });
  return { itens: itens, respostas: respostas };
}
// a correção sem a lista item a item (a calculadora não tem itens de verdade)
function corrigir(blocos, regra) {
  var p = provaDe(blocos), r = junta(pontuacao.corrigir(p.itens, p.respostas, regra));
  delete r.por_item;
  return r;
}
// mais um acerto no bloco: sai de uma errada, se houver; senão, de uma em branco. `null` = o bloco já está todo certo
function maisUm(b) {
  return b.erros > 0 ? junta(b, { acertos: b.acertos + 1, erros: b.erros - 1 }) : b.em_branco > 0 ? junta(b, { acertos: b.acertos + 1, em_branco: b.em_branco - 1 }) : null;
}

function calcular(regra, blocosCrus) {
  var blocos = normalizarBlocos(blocosCrus);
  if (!blocos.length) throw new Error('Informe as questões e os acertos de ao menos um bloco.');
  var r = corrigir(blocos, regra);
  // por bloco: quantos acertos a mais NAQUELE bloco fazem o mínimo dele ser atingido
  var porBloco = blocos.map(function (b) {
    var linha = primeiro(r.por_bloco, function (x) { return x.bloco === b.bloco; }) || {};
    var min = primeiro(r.minimos, function (m) { return m.bloco === b.bloco; }) || null;
    var faltam = min ? 0 : null, possivel = true;
    if (min && min.atendido === false) {
      var atual = b;
      for (faltam = 0; ;) {
        var prox = maisUm(atual);
        if (!prox) { possivel = false; break; }
        atual = prox; faltam++;
        var m = primeiro(corrigir(blocos.map(function (x) { return x.bloco === b.bloco ? atual : x; }), regra).minimos, function (x) { return x.bloco === b.bloco; });
        if (m.atendido) break;
      }
    }
    // `atingido` é o que a tela escreve: sai do motor, nunca de "faltam 0" (quando não há mais questão para acertar,
    // `faltam` fica em 0 e `possivel` é falso — e a tela dizia "mínimo atingido" para um mínimo inalcançável)
    return junta(b, { pontos: linha.pontos_brutos || 0, maximo: linha.maximo || 0, minimo: min ? { min_pct: min.min_pct, min_pontos: min.min_pontos, atendido: min.atendido } : null,
      faltam_acertos: possivel ? faltam : null, possivel: possivel, atingido: min ? min.atendido === true : null });
  });
  // geral: quantos acertos a mais, em qualquer bloco, levam a nota líquida ao mínimo geral (os mínimos por bloco
  // são ditos à parte, acima). Erradas primeiro — onde houver desconto, é a troca que mais rende.
  var faltamGeral = null, possivelGeral = true;
  var ap = r.regra.aprovacao;
  function atinge(x) { return (ap.min_pct == null || x.pct_liquido >= ap.min_pct) && (ap.min_pontos == null || x.nota_liquida >= ap.min_pontos); }
  if (ap) {
    var atuais = blocos, x = r;
    for (faltamGeral = 0; !atinge(x);) {
      var i = indiceDe(atuais, function (b) { return b.erros > 0; }), k = i >= 0 ? i : indiceDe(atuais, function (b) { return b.em_branco > 0; });
      if (k < 0) { possivelGeral = false; break; }
      atuais = atuais.map(function (b, n) { return n === k ? maisUm(b) : b; }); faltamGeral++;
      x = corrigir(atuais, regra);
    }
  }
  // mínimo da regra para um bloco que o aluno não informou: dizer, em vez de calar
  var semBloco = r.minimos.filter(function (m) { return m.atendido === null; }).map(function (m) { return m.bloco; });
  var atingiuGeral = ap ? atinge(r) : null;
  // com bloco da regra sem preencher não há como dizer "atinge": a conta está incompleta (antes saía "você atinge os mínimos")
  var aprovado = semBloco.length ? null : r.aprovado;
  return { nota_bruta: r.nota_bruta, descontados: r.descontados, nota_liquida: r.nota_liquida, maximo: r.maximo, pct_liquido: r.pct_liquido,
    certas: r.certas, erradas: r.erradas, em_branco: r.em_branco, erros_contados: r.erros_contados,
    blocos: porBloco, minimos_sem_bloco: semBloco, aprovado: aprovado,
    geral: ap ? { min_pct: ap.min_pct, min_pontos: ap.min_pontos, faltam_acertos: possivelGeral ? faltamGeral : null, possivel: possivelGeral, atingido: atingiuGeral } : null,
    regra: r.regra };
}

module.exports = { calcular: calcular, regraInformada: regraInformada, normalizarBlocos: normalizarBlocos, provaDe: provaDe, MAX_QUESTOES: MAX_QUESTOES };
