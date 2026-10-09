// =====================================================================
// Villela Academy — ESTUDO · correção OBJETIVA. Puro e determinístico:
// mesma prova + mesmas respostas + mesma regra = mesma nota, sempre. A IA
// pode redigir comentário; nunca decide ponto (prompt mestre, seção 10.5).
//
// A regra vem do ESCOPO (edital-alvo), com fonte e data — este arquivo não
// traz regra de concurso nenhum embutida. Três situações que NÃO se
// confundem, porque há edital que as trata de forma diferente:
//   errada     marcou alternativa que não é o gabarito
//   abstencao  marcou explicitamente "não respondida"
//   em_branco  não marcou nada
// =====================================================================
'use strict';

const ABSTENCAO = '__abstencao__';
const SITUACOES = ['certa', 'errada', 'abstencao', 'em_branco', 'anulada'];

const num = (v, padrao) => (Number.isFinite(Number(v)) ? Number(v) : padrao);
const conjunto = (v) => (Array.isArray(v) ? v : [v]).map(String).sort().join('|');

// Regra normalizada. Tudo que não vier cai no comportamento mais simples
// (1 ponto por acerto, sem desconto) — nunca num desconto presumido.
function normalizarRegra(r = {}) {
  const d = r.desconto || {};
  const regra = {
    valor_certa: num(r.valor_certa, 1),
    // N erradas anulam o valor de 1 certa. 'inteiro' = só conjuntos completos.
    desconto: num(d.a_cada, 0) > 0 ? { a_cada: num(d.a_cada, 0), modo: d.modo === 'proporcional' ? 'proporcional' : 'inteiro' } : null,
    em_branco_conta_erro: !!r.em_branco_conta_erro,
    abstencao_conta_erro: !!r.abstencao_conta_erro,
    // item anulado: 'ponto_para_todos' (o usual) ou 'excluida' (sai do denominador)
    anulada: r.anulada === 'excluida' ? 'excluida' : 'ponto_para_todos',
    piso_zero: r.piso_zero !== false,
    minimos: (Array.isArray(r.minimos) ? r.minimos : []).map(m => ({ bloco: String(m.bloco || ''), min_pct: num(m.min_pct, null), min_pontos: num(m.min_pontos, null) })),
    aprovacao: r.aprovacao ? { min_pct: num(r.aprovacao.min_pct, null), min_pontos: num(r.aprovacao.min_pontos, null) } : null,
    fonte: String(r.fonte || ''),
  };
  if (regra.valor_certa <= 0) throw new Error('regra de pontuação: valor_certa deve ser positivo.');
  return regra;
}

function situacaoDoItem(item, resposta) {
  if (item.anulada) return 'anulada';
  if (resposta === ABSTENCAO) return 'abstencao';
  if (resposta == null || resposta === '' || (Array.isArray(resposta) && !resposta.length)) return 'em_branco';
  return conjunto(resposta) === conjunto(item.gabarito) ? 'certa' : 'errada';
}

// itens: [{ id, gabarito, bloco?, peso?, anulada? }] · respostas: { [id]: valor }
function corrigir(itens, respostas = {}, regraCrua = {}) {
  const regra = normalizarRegra(regraCrua);
  const blocos = {};
  const bloco = (nome) => (blocos[nome] = blocos[nome] || { bloco: nome, certas: 0, erradas: 0, abstencoes: 0, em_branco: 0, anuladas: 0, pontos_brutos: 0, maximo: 0 });
  const porItem = [];
  for (const item of itens) {
    if (item.gabarito == null && !item.anulada) throw new Error(`item ${item.id}: sem gabarito — não entra em correção automática.`);
    const sit = situacaoDoItem(item, respostas[item.id]);
    const peso = num(item.peso, 1);
    const b = bloco(String(item.bloco || ''));
    const vale = regra.valor_certa * peso;
    let pontos = 0, conta = true;
    if (sit === 'anulada') {
      b.anuladas++;
      if (regra.anulada === 'excluida') conta = false; else pontos = vale;
    } else if (sit === 'certa') { b.certas++; pontos = vale; }
    else if (sit === 'abstencao') { b.abstencoes++; if (regra.abstencao_conta_erro) b.erradas++; }
    else if (sit === 'em_branco') { b.em_branco++; if (regra.em_branco_conta_erro) b.erradas++; }
    else b.erradas++;
    if (conta) b.maximo += vale;
    b.pontos_brutos += pontos;
    porItem.push({ id: item.id, situacao: sit, pontos, bloco: b.bloco });
  }
  const lista = Object.values(blocos);
  const soma = (k) => lista.reduce((a, b) => a + b[k], 0);
  const bruta = soma('pontos_brutos'), maximo = soma('maximo'), erradas = soma('erradas');
  let descontados = 0;
  if (regra.desconto) {
    const conjuntos = regra.desconto.modo === 'inteiro' ? Math.floor(erradas / regra.desconto.a_cada) : erradas / regra.desconto.a_cada;
    descontados = conjuntos * regra.valor_certa;
  }
  let liquida = bruta - descontados;
  if (regra.piso_zero && liquida < 0) liquida = 0;
  const pct = (p, m) => (m > 0 ? Math.round((p / m) * 1000) / 10 : 0);

  const minimos = regra.minimos.map(m => {
    const b = blocos[m.bloco];
    if (!b) return { ...m, atendido: null, motivo: 'bloco sem itens nesta prova' };
    const atendido = (m.min_pct == null || pct(b.pontos_brutos, b.maximo) >= m.min_pct) && (m.min_pontos == null || b.pontos_brutos >= m.min_pontos);
    return { ...m, obtido_pct: pct(b.pontos_brutos, b.maximo), obtido_pontos: b.pontos_brutos, atendido };
  });
  let aprovado = null; // null = a regra não define critério; não se inventa um
  if (regra.aprovacao) {
    aprovado = (regra.aprovacao.min_pct == null || pct(liquida, maximo) >= regra.aprovacao.min_pct)
      && (regra.aprovacao.min_pontos == null || liquida >= regra.aprovacao.min_pontos)
      && minimos.every(m => m.atendido !== false);
  }
  return {
    nota_bruta: bruta, descontados, nota_liquida: liquida, maximo, pct_liquido: pct(liquida, maximo),
    certas: soma('certas'), erradas, abstencoes: soma('abstencoes'), em_branco: soma('em_branco'), anuladas: soma('anuladas'),
    por_bloco: lista, minimos, aprovado, por_item: porItem, regra,
  };
}

module.exports = { corrigir, normalizarRegra, situacaoDoItem, ABSTENCAO, SITUACOES };
