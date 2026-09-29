// =====================================================================
// Musique · Laboratório — NÚCLEO · motivos: transpor, inverter,
// retrogradar, aumentar e diminuir. As alturas são GRAFADAS (usa os
// intervalos por número e qualidade): inverter uma terça maior que sobe
// dá uma terça maior que desce, com a letra certa — e não "4 semitons
// para baixo" escritos com qualquer nome.
//
// Também a matriz dodecafônica (série de 12 sons): P, I, R e RI.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./notas'), require('./intervalos'));
  else (raiz.MusiqueLab = raiz.MusiqueLab || {}).motivos = fabrica(raiz.MusiqueLab.notas, raiz.MusiqueLab.intervalos);
})(typeof self !== 'undefined' ? self : this, function (N, I) {
  'use strict';

  function lerMotivo(texto) {
    var ns = String(texto || '').trim().split(/[\s,]+/).filter(Boolean).map(N.ler);
    if (!ns.length || ns.some(function (n) { return !n || n.oitava == null; })) return null;
    return ns;
  }

  function transpor(notas, intervalo, descendente) {
    var out = notas.map(function (n) { return I.construir(n, intervalo, descendente); });
    return out.some(function (x) { return !x; }) ? null : out;
  }

  /** Inversão (espelho) em torno da primeira nota. */
  function inverter(notas) {
    var p = notas[0], out = [p];
    for (var i = 1; i < notas.length; i++) {
      var iv = I.entre(p, notas[i]);
      if (!iv) return null;
      var alvo = iv.numero === 1 && iv.semitons === 0 ? N.comOitava(p, p.oitava) : I.construir(p, iv.curto, !iv.descendente);
      if (!alvo) return null;
      out.push(alvo);
    }
    return out;
  }

  function retrogradar(notas) { return notas.slice().reverse(); }
  function retrogradoInverso(notas) { var inv = inverter(notas); return inv ? retrogradar(inv) : null; }

  /** Durações (em frações de semibreve, como texto "1/4") multiplicadas. */
  function mudarDuracoes(duracoes, fator) {
    return duracoes.map(function (d) { var p = String(d).split('/'); var n = Number(p[0]) * fator[0], q = Number(p[1] || 1) * fator[1]; var g = mdc(n, q); return (n / g) + (q / g === 1 ? '' : '/' + (q / g)); });
  }
  function mdc(a, b) { while (b) { var t = b; b = a % b; a = t; } return a || 1; }

  var TRANSFORMACOES = [
    { id: 'original', nome: 'original', fn: function (ns) { return ns; } },
    { id: 'transposto', nome: 'transposto uma quinta acima', fn: function (ns) { return transpor(ns, '5J'); } },
    { id: 'inversao', nome: 'inversão (espelho)', fn: inverter },
    { id: 'retrogrado', nome: 'retrógrado (de trás para frente)', fn: retrogradar },
    { id: 'retrogrado-inverso', nome: 'retrógrado da inversão', fn: retrogradoInverso },
  ];

  // ---- Série dodecafônica ----
  /** Valida uma série: 12 classes de altura, cada uma uma vez. */
  function serieValida(pcs) {
    if (!pcs || pcs.length !== 12) return false;
    var vistos = {}; return pcs.every(function (p) { p = N.mod(p, 12); if (vistos[p]) return false; vistos[p] = 1; return true; });
  }
  /**
   * Matriz 12×12: linha i = P(n) começando na nota i da inversão.
   * Devolve { linhas: [[pc]], rotulos: { P, I, R, RI } }.
   */
  function matriz(serie) {
    if (!serieValida(serie)) return null;
    var s = serie.map(function (p) { return N.mod(p, 12); });
    var inv = s.map(function (p) { return N.mod(2 * s[0] - p, 12); });
    var linhas = inv.map(function (inicio) { var d = inicio - s[0]; return s.map(function (p) { return N.mod(p + d, 12); }); });
    return {
      linhas: linhas,
      P: linhas.map(function (l) { return 'P' + N.mod(l[0] - s[0], 12); }),
      I: linhas[0].map(function (p) { return 'I' + N.mod(p - s[0], 12); }),
    };
  }

  return { lerMotivo: lerMotivo, transpor: transpor, inverter: inverter, retrogradar: retrogradar, retrogradoInverso: retrogradoInverso,
    mudarDuracoes: mudarDuracoes, TRANSFORMACOES: TRANSFORMACOES, serieValida: serieValida, matriz: matriz };
});
