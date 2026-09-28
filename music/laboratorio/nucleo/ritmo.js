// =====================================================================
// Musique · Laboratório — NÚCLEO · ritmo.
//
// Duração é FRAÇÃO EXATA da semibreve (numerador/denominador). Somar
// 0.1 + 0.2 em ponto flutuante já não dá 0.3; somar três colcheias de
// quiáltera (1/12 cada) em float e comparar com 1/4 reprova o aluno que
// acertou. Com fração, o compasso fecha ou não fecha — sem tolerância
// escondida.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else (raiz.MusiqueLab = raiz.MusiqueLab || {}).ritmo = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function mdc(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a || 1; }
  function mmc(a, b) { return Math.abs(a * b) / mdc(a, b); }
  function fr(n, d) {
    if (d === 0) throw new Error('denominador zero');
    var s = d < 0 ? -1 : 1, g = mdc(n, d);
    return { n: s * n / g, d: s * d / g };
  }
  function soma(a, b) { return fr(a.n * b.d + b.n * a.d, a.d * b.d); }
  function sub(a, b) { return fr(a.n * b.d - b.n * a.d, a.d * b.d); }
  function mult(a, b) { return fr(a.n * b.n, a.d * b.d); }
  function comparar(a, b) { return a.n * b.d - b.n * a.d; }
  function iguais(a, b) { return comparar(a, b) === 0; }
  function texto(a) { return a.d === 1 ? String(a.n) : a.n + '/' + a.d; }
  function valor(a) { return a.n / a.d; }

  // Figuras (valor em semibreves). O glifo é do bloco Unicode de símbolos
  // musicais; a página carrega a fonte Noto Music para desenhá-lo.
  var FIGURAS = [
    { id: 'semibreve', nome: 'semibreve', en: 'whole note', valor: fr(1, 1), glifo: '𝅝', pausa: '𝄻' },
    { id: 'minima', nome: 'mínima', en: 'half note', valor: fr(1, 2), glifo: '𝅗𝅥', pausa: '𝄼' },
    { id: 'seminima', nome: 'semínima', en: 'quarter note', valor: fr(1, 4), glifo: '𝅘𝅥', pausa: '𝄽' },
    { id: 'colcheia', nome: 'colcheia', en: 'eighth note', valor: fr(1, 8), glifo: '𝅘𝅥𝅮', pausa: '𝄾' },
    { id: 'semicolcheia', nome: 'semicolcheia', en: 'sixteenth note', valor: fr(1, 16), glifo: '𝅘𝅥𝅯', pausa: '𝄿' },
    { id: 'fusa', nome: 'fusa', en: 'thirty-second note', valor: fr(1, 32), glifo: '𝅘𝅥𝅰', pausa: '𝅀' },
    { id: 'semifusa', nome: 'semifusa', en: 'sixty-fourth note', valor: fr(1, 64), glifo: '𝅘𝅥𝅱', pausa: '𝅁' },
  ];
  var FIG = {}; FIGURAS.forEach(function (f) { FIG[f.id] = f; });

  /**
   * Duração de uma figura: `pontos` (0–2) e `quialtera` [n, m] = n no
   * tempo de m (tercina = [3, 2]).
   */
  function duracao(figura, opcoes) {
    var f = typeof figura === 'string' ? FIG[figura] : figura;
    if (!f) return null;
    var o = opcoes || {};
    var v = f.valor, add = f.valor;
    for (var i = 0; i < (o.pontos || 0); i++) { add = mult(add, fr(1, 2)); v = soma(v, add); }
    if (o.quialtera) v = mult(v, fr(o.quialtera[1], o.quialtera[0]));
    return v;
  }
  function somaDuracoes(lista) { return lista.reduce(function (a, x) { return soma(a, x); }, fr(0, 1)); }

  /**
   * Compasso "6/8" → tipo (simples/composto/irregular), pulsos e unidade
   * de pulso. Composto = numerador múltiplo de 3 maior que 3: o pulso é
   * a figura pontuada (6/8 tem dois pulsos de semínima pontuada).
   */
  function compasso(txt) {
    var m = String(txt || '').match(/^\s*(\d{1,2})\s*\/\s*(1|2|4|8|16|32)\s*$/);
    if (!m) return null;
    var num = Number(m[1]), den = Number(m[2]);
    if (num < 1) return null;
    var composto = num > 3 && num % 3 === 0;
    var irregular = !composto && [5, 7, 11, 13].indexOf(num) >= 0;
    var unidade = fr(1, den);
    var pulsos = composto ? num / 3 : num;
    var unidadePulso = composto ? fr(3, den) : unidade;
    var agrup = composto ? repetir(3, pulsos) : irregular ? agrupamentoIrregular(num) : repetir(1, num);
    return { texto: num + '/' + den, numerador: num, denominador: den, capacidade: fr(num, den),
      tipo: composto ? 'composto' : irregular ? 'irregular' : 'simples',
      pulsos: pulsos, unidade: unidade, unidade_pulso: unidadePulso, agrupamento: agrup,
      acentos: acentos(num, composto, agrup) };
  }
  function repetir(v, n) { var a = []; for (var i = 0; i < n; i++) a.push(v); return a; }
  function agrupamentoIrregular(n) { return n === 5 ? [3, 2] : n === 7 ? [2, 2, 3] : n === 11 ? [3, 3, 3, 2] : [3, 3, 3, 2, 2]; }
  // Acento métrico por unidade: 2 forte, 1 meio-forte, 0 fraco.
  function acentos(num, composto, agrup) {
    var a = repetir(0, num);
    if (composto || agrup.some(function (g) { return g > 1; })) {
      var i = 0; agrup.forEach(function (g, k) { a[i] = k === 0 ? 2 : 1; i += g; });
    } else {
      a[0] = 2; if (num === 4) a[2] = 1;
    }
    return a;
  }

  /** O compasso fecha? Devolve { fecha, falta } (falta negativa = sobra). */
  function conferirCompasso(duracoes, c) {
    var cc = typeof c === 'string' ? compasso(c) : c;
    var total = somaDuracoes(duracoes);
    var falta = sub(cc.capacidade, total);
    return { fecha: falta.n === 0, falta: falta, total: total };
  }

  /** Milissegundos de uma figura a um BPM (o BPM conta `unidadeBpm`). */
  function ms(bpm, figura, opcoes) {
    var o = opcoes || {};
    var un = o.unidadeBpm || fr(1, 4);
    var d = duracao(figura, o) || figura;
    return 60000 / Number(bpm) * valor(d) / valor(un);
  }

  /**
   * BPM a partir de toques (em ms). Usa a MEDIANA dos intervalos: um toque
   * atrasado não arrasta a média. Intervalos acima de 2 s zeram a conta
   * (a pessoa parou e recomeçou).
   */
  function bpmDeToques(tempos) {
    var t = (tempos || []).slice(-12);
    var iv = [];
    for (var i = 1; i < t.length; i++) { var d = t[i] - t[i - 1]; if (d > 0 && d <= 2000) iv.push(d); else iv = []; }
    if (iv.length < 2) return null;
    var o = iv.slice().sort(function (a, b) { return a - b; });
    var med = o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
    var desvio = Math.sqrt(iv.reduce(function (a, x) { return a + (x - med) * (x - med); }, 0) / iv.length);
    return { bpm: Math.round(60000 / med * 10) / 10, intervalo_ms: med, desvio_ms: Math.round(desvio), toques: iv.length + 1 };
  }

  /** Estabilidade do pulso: desvio de cada toque para a grade ideal. */
  function desvioDoPulso(tempos, bpm) {
    if (!tempos || tempos.length < 2) return null;
    var p = 60000 / bpm, t0 = tempos[0];
    var d = tempos.map(function (t) { var k = Math.round((t - t0) / p); return t - (t0 + k * p); });
    var abs = d.map(Math.abs);
    return { desvios_ms: d.map(Math.round), medio_ms: Math.round(abs.reduce(function (a, x) { return a + x; }, 0) / abs.length),
      pior_ms: Math.round(Math.max.apply(null, abs)), adiantado: d.filter(function (x) { return x < -15; }).length, atrasado: d.filter(function (x) { return x > 15; }).length };
  }

  // Rudimentos (mão direita D, esquerda E; acento em maiúscula no desenho).
  var RUDIMENTOS = [
    { id: 'toque-simples', nome: 'toque simples alternado', en: 'single stroke roll', padrao: 'D E D E D E D E' },
    { id: 'toque-duplo', nome: 'toque duplo', en: 'double stroke roll', padrao: 'D D E E D D E E' },
    { id: 'paradiddle', nome: 'paradiddle simples', en: 'single paradiddle', padrao: 'D E D D E D E E', acentos: [0, 4] },
    { id: 'paradiddle-duplo', nome: 'paradiddle duplo', en: 'double paradiddle', padrao: 'D E D E D D E D E D E E', acentos: [0, 6] },
    { id: 'paradiddle-diddle', nome: 'paradiddle-diddle', en: 'paradiddle-diddle', padrao: 'D E D D E E', acentos: [0] },
    { id: 'toque-triplo', nome: 'toque triplo', en: 'triple stroke roll', padrao: 'D D D E E E' },
  ];

  /** Grade de polirritmo a:b — onde cada voz bate, numa grade de mmc passos. */
  function polirritmo(a, b) {
    var n = mmc(a, b), va = [], vb = [];
    for (var i = 0; i < n; i++) { va.push(i % (n / a) === 0); vb.push(i % (n / b) === 0); }
    return { passos: n, a: va, b: vb, coincidem: va.map(function (x, i) { return x && vb[i]; }) };
  }

  /**
   * Swing: a colcheia do tempo dura `razao` (0,5 = reta; 2/3 = swing de
   * tercina; 0,75 = shuffle "pontuado"). Devolve os instantes das duas
   * colcheias de cada tempo, em frações do tempo.
   */
  function swing(razao) { var r = Math.min(0.8, Math.max(0.5, Number(razao) || 0.5)); return [0, r]; }

  return {
    fr: fr, soma: soma, sub: sub, mult: mult, comparar: comparar, iguais: iguais, texto: texto, valor: valor, mmc: mmc,
    FIGURAS: FIGURAS, FIG: FIG, duracao: duracao, somaDuracoes: somaDuracoes, compasso: compasso,
    conferirCompasso: conferirCompasso, ms: ms, bpmDeToques: bpmDeToques, desvioDoPulso: desvioDoPulso,
    RUDIMENTOS: RUDIMENTOS, polirritmo: polirritmo, swing: swing,
  };
});
