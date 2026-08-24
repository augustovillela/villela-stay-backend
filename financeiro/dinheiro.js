// =====================================================================
// Villela Finance — dinheiro.
//
// INVARIANTE Nº 1 DO PRODUTO: dinheiro é INTEIRO EM CENTAVOS. Nenhum
// valor monetário atravessa este módulo como float. `Number` só aparece
// na fronteira de entrada (texto digitado, CSV) e na de saída (formatação
// para a tela) — e nas duas a conversão passa por aqui.
//
// Por que isso importa: 0.1 + 0.2 !== 0.3 em float. Num razão de partida
// dobrada, meio centavo de erro não "arredonda" — ele desbalanceia o lote
// e trava o fechamento. Melhor recusar na entrada do que descobrir no
// fechamento.
// =====================================================================
'use strict';

class ErroDeValor extends Error {
  constructor(msg) { super(msg); this.name = 'ErroDeValor'; this.status = 400; }
}

// Acima disso, a soma de centavos deixa de ser exata em IEEE-754.
// 2^53-1 centavos = R$ 90.071.992.547.409,91 — teto generoso e honesto.
const MAX_CENTAVOS = Number.MAX_SAFE_INTEGER;

/** Verifica que o valor É centavos: inteiro seguro. Devolve o próprio. */
function centavos(v, campo = 'valor') {
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new ErroDeValor(`${campo} tem de ser inteiro em centavos (recebi ${JSON.stringify(v)}).`);
  }
  if (!Number.isSafeInteger(v)) throw new ErroDeValor(`${campo} excede o limite de precisão.`);
  return v;
}

const naoNegativo = (v, campo = 'valor') => {
  centavos(v, campo);
  if (v < 0) throw new ErroDeValor(`${campo} não pode ser negativo.`);
  return v;
};

/**
 * Converte entrada humana ou de arquivo para centavos.
 *
 * Aceita: 12,34 · 12.34 · "1.234,56" (pt-BR) · "1,234.56" (en) · "R$ 1.234,56"
 * · "(1.234,56)" e "1.234,56-" (negativo contábil) · number em REAIS.
 *
 * A ambiguidade "1.234" (mil ou um e vinte e três centavos?) é resolvida
 * pela regra dos três dígitos: separador seguido de exatamente 3 dígitos
 * e sem outro separador depois é MILHAR. É a convenção dos extratos
 * brasileiros — e a exceção fica registrada aqui, não espalhada.
 */
function paraCentavos(entrada, campo = 'valor') {
  if (entrada == null || entrada === '') throw new ErroDeValor(`${campo} está vazio.`);

  if (typeof entrada === 'number') {
    if (!Number.isFinite(entrada)) throw new ErroDeValor(`${campo} não é um número finito.`);
    // Arredondamento half-away-from-zero (padrão monetário), não o
    // half-to-even do Math.round para negativos.
    const c = entrada < 0 ? -Math.round(Math.abs(entrada) * 100) : Math.round(entrada * 100);
    return centavos(c, campo);
  }

  let s = String(entrada).trim();
  if (!s) throw new ErroDeValor(`${campo} está vazio.`);

  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  if (/-\s*$/.test(s)) { negativo = true; s = s.replace(/-\s*$/, ''); }

  s = s.replace(/R\$/gi, '').replace(/\s| /g, '');
  if (s.startsWith('-')) { negativo = !negativo; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);

  if (!/^[\d.,]+$/.test(s)) throw new ErroDeValor(`${campo} inválido: ${JSON.stringify(String(entrada))}.`);

  const ultimaVirgula = s.lastIndexOf(',');
  const ultimoPonto = s.lastIndexOf('.');
  const corte = Math.max(ultimaVirgula, ultimoPonto);

  let inteiro, fracao;
  if (corte === -1) {
    inteiro = s; fracao = '';
  } else {
    const depois = s.slice(corte + 1);
    const antes = s.slice(0, corte);
    // Último grupo antes do separador: se ele começa com zero, não é um
    // grupo de milhar (ninguém escreve "0.750" para setecentos e cinquenta)
    // — então o separador é decimal. É o que salva "0,750" de virar R$ 750.
    const grupoFinal = antes.split(/[.,]/).pop();
    const pareceMilhar = depois.length === 3 && /^\d{3}$/.test(depois) && !/^0\d*$/.test(grupoFinal || '0');
    if (pareceMilhar) { inteiro = s; fracao = ''; }
    else { inteiro = antes; fracao = depois; }
  }

  inteiro = inteiro.replace(/[.,]/g, '');
  if (!/^\d*$/.test(inteiro) || !/^\d*$/.test(fracao)) {
    throw new ErroDeValor(`${campo} inválido: ${JSON.stringify(String(entrada))}.`);
  }
  if (fracao.length > 2) {
    // Mais de duas casas: arredonda para centavo (half-up), não trunca.
    const extra = fracao.slice(2);
    const arredonda = Number(extra[0]) >= 5 ? 1 : 0;
    fracao = String(Number(fracao.slice(0, 2)) + arredonda).padStart(2, '0');
    if (fracao.length > 2) { // 99 + 1 = 100 → sobe um real
      inteiro = String(BigInt(inteiro || '0') + 1n);
      fracao = '00';
    }
  }
  fracao = (fracao + '00').slice(0, 2);

  const totalStr = (inteiro || '0') + fracao;
  const total = Number(totalStr);
  if (!Number.isSafeInteger(total)) throw new ErroDeValor(`${campo} excede o limite de precisão.`);
  return negativo ? -total : total;
}

/** Centavos → número em reais. SÓ para exibir ou serializar em API. */
const paraReais = (c) => centavos(c, 'centavos') / 100;

/** "R$ 1.234,56". Negativo com sinal, não com parênteses. */
function formatar(c, { simbolo = true } = {}) {
  centavos(c, 'centavos');
  const neg = c < 0;
  const abs = Math.abs(c);
  const reais = Math.floor(abs / 100);
  const cent = String(abs % 100).padStart(2, '0');
  const milhar = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${simbolo ? 'R$ ' : ''}${milhar},${cent}`;
}

/** Soma segura: valida cada parcela e o total. */
function somar(...valores) {
  let t = 0;
  for (const v of valores.flat()) { centavos(v, 'parcela'); t += v; }
  return centavos(t, 'total');
}

/**
 * Percentual em BASIS POINTS (1% = 100 bps) — evita 0.1 no cálculo de
 * comissão. Arredonda half-away-from-zero.
 */
function percentual(c, bps) {
  centavos(c, 'base');
  if (!Number.isInteger(bps)) throw new ErroDeValor('percentual tem de vir em basis points inteiros (1% = 100).');
  const produto = c * bps;
  const sinal = produto < 0 ? -1 : 1;
  return sinal * Math.round(Math.abs(produto) / 10000);
}

/**
 * Rateio que NÃO perde nem inventa centavo: distribui `total` na proporção
 * dos pesos e devolve partes cuja soma é exatamente `total`.
 *
 * Método do maior resto: cada parte fica com o piso, e os centavos que
 * sobram vão, um a um, para quem tem o maior resto. Sem isto, ratear
 * R$ 100,00 em 3 devolve 33,33 × 3 = 99,99 e o lote não fecha.
 */
function ratear(total, pesos) {
  centavos(total, 'total');
  if (!Array.isArray(pesos) || !pesos.length) throw new ErroDeValor('ratear exige ao menos um peso.');
  for (const p of pesos) {
    if (typeof p !== 'number' || !Number.isFinite(p) || p < 0) throw new ErroDeValor('peso de rateio inválido.');
  }
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (soma <= 0) throw new ErroDeValor('a soma dos pesos do rateio tem de ser maior que zero.');

  const sinal = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const brutos = pesos.map(p => (abs * p) / soma);
  const partes = brutos.map(Math.floor);
  let resto = abs - partes.reduce((a, b) => a + b, 0);

  const ordem = brutos
    .map((b, i) => ({ i, frac: b - Math.floor(b) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; resto > 0; k++, resto--) partes[ordem[k % ordem.length].i]++;
  return partes.map(p => sinal * p);
}

/** Divide em N partes iguais sem perder centavo (atalho do ratear). */
const dividir = (total, n) => {
  if (!Number.isInteger(n) || n < 1) throw new ErroDeValor('número de partes inválido.');
  return ratear(total, new Array(n).fill(1));
};

module.exports = {
  ErroDeValor, MAX_CENTAVOS,
  centavos, naoNegativo, paraCentavos, paraReais, formatar,
  somar, percentual, ratear, dividir,
};
