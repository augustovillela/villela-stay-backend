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
// =====================================================================
'use strict';
const pontuacao = require('./pontuacao');

const int = (v) => Math.max(0, Math.round(Number(v) || 0));
const MAX_QUESTOES = 500; // por bloco: acima disso é erro de digitação

// A regra que o aluno informa quando o percurso NÃO tem regra cadastrada. Vira o mesmo objeto que o edital
// cadastrado usaria — e por isso passa pelo mesmo `normalizarRegra`.
function regraInformada({ blocos = [], minimo_geral = 0, desconto_a_cada = 0, em_branco_conta_erro = false } = {}) {
  return {
    valor_certa: 1,
    minimos: blocos.filter(b => int(b.minimo) > 0).map(b => ({ bloco: String(b.bloco || ''), min_pontos: int(b.minimo) })),
    aprovacao: int(minimo_geral) > 0 ? { min_pontos: int(minimo_geral) } : null,
    desconto: int(desconto_a_cada) > 0 ? { a_cada: int(desconto_a_cada) } : null,
    em_branco_conta_erro: !!em_branco_conta_erro,
    fonte: 'números informados por você (não são os do edital)',
  };
}

// blocos: [{ bloco, questoes, acertos, erros }] — em branco é o que sobra.
function normalizarBlocos(blocos) {
  const vistos = new Set();
  return (Array.isArray(blocos) ? blocos : []).map((b, i) => {
    const nome = String(b.bloco == null ? '' : b.bloco).trim().slice(0, 40);
    if (vistos.has(nome)) throw new Error(`Há dois blocos com o nome "${nome || '(sem nome)'}".`);
    vistos.add(nome);
    const acertos = int(b.acertos), erros = int(b.erros), questoes = int(b.questoes) || acertos + erros;
    if (questoes > MAX_QUESTOES) throw new Error(`Bloco ${nome || i + 1}: até ${MAX_QUESTOES} questões.`);
    if (acertos + erros > questoes) throw new Error(`Bloco ${nome || i + 1}: acertos (${acertos}) e erros (${erros}) somam mais que as ${questoes} questões do bloco.`);
    return { bloco: nome, questoes, acertos, erros, em_branco: questoes - acertos - erros };
  }).filter(b => b.questoes > 0);
}
// a prova de mentira que o motor corrige: gabarito "a"; acerto responde "a", erro responde "b", em branco não responde
function provaDe(blocos) {
  const itens = [], respostas = {};
  for (const b of blocos) {
    for (let k = 0; k < b.questoes; k++) {
      const id = `${b.bloco}#${k}`;
      itens.push({ id, gabarito: 'a', bloco: b.bloco });
      if (k < b.acertos) respostas[id] = 'a'; else if (k < b.acertos + b.erros) respostas[id] = 'b';
    }
  }
  return { itens, respostas };
}
const corrigir = (blocos, regra) => { const p = provaDe(blocos); const { por_item, ...r } = pontuacao.corrigir(p.itens, p.respostas, regra); return r; };
// mais um acerto no bloco: sai de uma errada, se houver; senão, de uma em branco. `null` = o bloco já está todo certo
const maisUm = (b) => (b.erros > 0 ? { ...b, acertos: b.acertos + 1, erros: b.erros - 1 } : b.em_branco > 0 ? { ...b, acertos: b.acertos + 1, em_branco: b.em_branco - 1 } : null);

function calcular(regra, blocosCrus) {
  const blocos = normalizarBlocos(blocosCrus);
  if (!blocos.length) throw new Error('Informe as questões e os acertos de ao menos um bloco.');
  const r = corrigir(blocos, regra);
  // por bloco: quantos acertos a mais NAQUELE bloco fazem o mínimo dele ser atingido
  const porBloco = blocos.map(b => {
    const linha = r.por_bloco.find(x => x.bloco === b.bloco) || {};
    const min = r.minimos.find(m => m.bloco === b.bloco) || null;
    let faltam = min ? 0 : null, possivel = true;
    if (min && min.atendido === false) {
      let atual = b;
      for (faltam = 0; ;) {
        const prox = maisUm(atual);
        if (!prox) { possivel = false; break; }
        atual = prox; faltam++;
        const m = corrigir(blocos.map(x => (x.bloco === b.bloco ? atual : x)), regra).minimos.find(x => x.bloco === b.bloco);
        if (m.atendido) break;
      }
    }
    // `atingido` é o que a tela escreve: sai do motor, nunca de "faltam 0" (quando não há mais questão para acertar,
    // `faltam` fica em 0 e `possivel` é falso — e a tela dizia "mínimo atingido" para um mínimo inalcançável)
    return { ...b, pontos: linha.pontos_brutos || 0, maximo: linha.maximo || 0, minimo: min ? { min_pct: min.min_pct, min_pontos: min.min_pontos, atendido: min.atendido } : null,
      faltam_acertos: possivel ? faltam : null, possivel, atingido: min ? min.atendido === true : null };
  });
  // geral: quantos acertos a mais, em qualquer bloco, levam a nota líquida ao mínimo geral (os mínimos por bloco
  // são ditos à parte, acima). Erradas primeiro — onde houver desconto, é a troca que mais rende.
  let faltamGeral = null, possivelGeral = true;
  const ap = r.regra.aprovacao;
  if (ap) {
    const atinge = (x) => (ap.min_pct == null || x.pct_liquido >= ap.min_pct) && (ap.min_pontos == null || x.nota_liquida >= ap.min_pontos);
    let atuais = blocos, x = r;
    for (faltamGeral = 0; !atinge(x);) {
      const i = atuais.findIndex(b => b.erros > 0), k = i >= 0 ? i : atuais.findIndex(b => b.em_branco > 0);
      if (k < 0) { possivelGeral = false; break; }
      atuais = atuais.map((b, n) => (n === k ? maisUm(b) : b)); faltamGeral++;
      x = corrigir(atuais, regra);
    }
  }
  // mínimo da regra para um bloco que o aluno não informou: dizer, em vez de calar
  const semBloco = r.minimos.filter(m => m.atendido === null).map(m => m.bloco);
  const atingiuGeral = ap ? (ap.min_pct == null || r.pct_liquido >= ap.min_pct) && (ap.min_pontos == null || r.nota_liquida >= ap.min_pontos) : null;
  // com bloco da regra sem preencher não há como dizer "atinge": a conta está incompleta (antes saía "você atinge os mínimos")
  const aprovado = semBloco.length ? null : r.aprovado;
  return { nota_bruta: r.nota_bruta, descontados: r.descontados, nota_liquida: r.nota_liquida, maximo: r.maximo, pct_liquido: r.pct_liquido,
    certas: r.certas, erradas: r.erradas, em_branco: r.em_branco, erros_contados: r.erros_contados,
    blocos: porBloco, minimos_sem_bloco: semBloco, aprovado,
    geral: ap ? { min_pct: ap.min_pct, min_pontos: ap.min_pontos, faltam_acertos: possivelGeral ? faltamGeral : null, possivel: possivelGeral, atingido: atingiuGeral } : null,
    regra: r.regra };
}

module.exports = { calcular, regraInformada, normalizarBlocos, provaDe, MAX_QUESTOES };
