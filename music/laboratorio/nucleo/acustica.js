// =====================================================================
// Musique · Laboratório — NÚCLEO · acústica: série harmônica,
// temperamento igual × afinação justa, batimentos e tabela de
// frequências. Números calculados, não tabelados à mão.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./notas'));
  else (raiz.MusiqueLab = raiz.MusiqueLab || {}).acustica = fabrica(raiz.MusiqueLab.notas);
})(typeof self !== 'undefined' ? self : this, function (N) {
  'use strict';

  /** Os `n` primeiros harmônicos de uma fundamental (MIDI ou nota). */
  function serieHarmonica(fundamental, n, la4) {
    var m = typeof fundamental === 'number' ? fundamental : N.midi(fundamental);
    if (m == null) return null;
    var f0 = N.freqDeMidi(m, la4);
    var out = [];
    for (var k = 1; k <= (n || 16); k++) {
      var hz = f0 * k, mm = N.midiDeFreq(hz, la4), r = Math.round(mm);
      out.push({ harmonico: k, hz: hz, nota: N.deMidi(r), cents: Math.round((mm - r) * 100) });
    }
    return out;
  }

  // Razões da afinação justa de 5 limites (uma escolha usual entre várias).
  var JUSTA = [
    { semitons: 0, razao: [1, 1], nome: 'uníssono' }, { semitons: 1, razao: [16, 15], nome: 'segunda menor' },
    { semitons: 2, razao: [9, 8], nome: 'segunda maior' }, { semitons: 3, razao: [6, 5], nome: 'terça menor' },
    { semitons: 4, razao: [5, 4], nome: 'terça maior' }, { semitons: 5, razao: [4, 3], nome: 'quarta justa' },
    { semitons: 6, razao: [45, 32], nome: 'trítono' }, { semitons: 7, razao: [3, 2], nome: 'quinta justa' },
    { semitons: 8, razao: [8, 5], nome: 'sexta menor' }, { semitons: 9, razao: [5, 3], nome: 'sexta maior' },
    { semitons: 10, razao: [9, 5], nome: 'sétima menor' }, { semitons: 11, razao: [15, 8], nome: 'sétima maior' },
    { semitons: 12, razao: [2, 1], nome: 'oitava' },
  ];
  function comparacaoTemperamento() {
    return JUSTA.map(function (j) {
      var centsJusto = 1200 * Math.log2(j.razao[0] / j.razao[1]);
      return { semitons: j.semitons, nome: j.nome, razao: j.razao[0] + ':' + j.razao[1],
        cents_igual: j.semitons * 100, cents_justo: Math.round(centsJusto * 10) / 10,
        diferenca: Math.round((j.semitons * 100 - centsJusto) * 10) / 10 };
    });
  }

  /** Batimentos entre duas frequências próximas (Hz). */
  function batimentos(f1, f2) { return Math.abs(Number(f1) - Number(f2)); }

  /** Tabela de frequências de `de` a `ate` (MIDI). */
  function tabela(de, ate, la4) {
    var out = [];
    for (var m = de; m <= ate; m++) out.push({ midi: m, nota: N.deMidi(m), hz: Math.round(N.freqDeMidi(m, la4) * 100) / 100 });
    return out;
  }

  return { serieHarmonica: serieHarmonica, JUSTA: JUSTA, comparacaoTemperamento: comparacaoTemperamento, batimentos: batimentos, tabela: tabela };
});
