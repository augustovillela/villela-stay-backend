// =====================================================================
// Musique · Laboratório — NÚCLEO · intervalos.
//
// Intervalo tem NÚMERO (quantas letras) e QUALIDADE (quantos semitons
// em relação ao de referência). Dó→mi é terça maior; dó→fá♭ soa igual e
// é quarta diminuta. Contar só semitons apagaria essa diferença — e ela
// é exatamente o que um exercício de construção cobra.
//
// Notação curta brasileira: número + qualidade (3M, 3m, 5J, 4A, 5d).
// Aceita também a anglófona (M3, m3, P5, A4, d5) na leitura.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./notas'));
  else (raiz.MusiqueLab = raiz.MusiqueLab || {}).intervalos = fabrica(raiz.MusiqueLab.notas);
})(typeof self !== 'undefined' ? self : this, function (N) {
  'use strict';

  var REF = [0, 2, 4, 5, 7, 9, 11];              // semitons dos graus da escala maior
  var JUSTO = { 1: true, 4: true, 5: true };      // número simples com qualidade justa
  var NUMEROS = ['', 'uníssono', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sétima', 'oitava',
    'nona', 'décima', 'décima primeira', 'décima segunda', 'décima terceira', 'décima quarta', 'décima quinta'];
  var NUMEROS_SLUG = ['', 'unissono', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'setima', 'oitava',
    'nona', 'decima', 'decima-primeira', 'decima-segunda', 'decima-terceira', 'decima-quarta', 'decima-quinta'];
  var QUAL_F = { J: 'justa', M: 'maior', m: 'menor', A: 'aumentada', d: 'diminuta', AA: 'duplamente aumentada', dd: 'duplamente diminuta' };
  var QUAL_M = { J: 'justo', M: 'maior', m: 'menor', A: 'aumentado', d: 'diminuto', AA: 'duplamente aumentado', dd: 'duplamente diminuto' };
  var QUAL_EN = { J: 'P', M: 'M', m: 'm', A: 'A', d: 'd', AA: 'AA', dd: 'dd' };
  var QUAL_EN_LONGO = { J: 'perfect', M: 'major', m: 'minor', A: 'augmented', d: 'diminished', AA: 'doubly augmented', dd: 'doubly diminished' };
  var NUM_EN = ['', 'unison', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'octave',
    'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth'];

  function simples(numero) { return ((numero - 1) % 7) + 1; }
  function referencia(numero) { return REF[simples(numero) - 1] + 12 * Math.floor((numero - 1) / 7); }

  /** Diferença de semitons → qualidade, para um número. */
  function qualidadeDe(numero, diff) {
    var s = simples(numero);
    if (JUSTO[s]) return { 0: 'J', 1: 'A', 2: 'AA', '-1': 'd', '-2': 'dd' }[diff] || null;
    return { 0: 'M', '-1': 'm', 1: 'A', 2: 'AA', '-2': 'd', '-3': 'dd' }[diff] || null;
  }
  function diffDe(numero, q) {
    var s = simples(numero);
    if (JUSTO[s]) return { J: 0, A: 1, AA: 2, d: -1, dd: -2 }[q];
    return { M: 0, m: -1, A: 1, AA: 2, d: -2, dd: -3 }[q];
  }

  function montar(numero, q, semitons) {
    if (!q || numero < 1) return null;
    var masc = simples(numero) === 1 && numero === 1;
    return {
      numero: numero, qualidade: q, semitons: semitons, simples: simples(numero), composto: numero > 8,
      curto: numero + q, en: QUAL_EN[q] + numero,
      nome: NUMEROS[numero] ? NUMEROS[numero] + ' ' + (masc ? QUAL_M[q] : QUAL_F[q]) : numero + 'ª ' + QUAL_F[q],
      nome_en: NUM_EN[numero] ? QUAL_EN_LONGO[q] + ' ' + NUM_EN[numero] : '',
      slug: NUMEROS_SLUG[numero] ? NUMEROS_SLUG[numero] + '-' + N.semAcento(masc ? QUAL_M[q] : QUAL_F[q]).replace(/ /g, '-') : '',
    };
  }

  /**
   * Intervalo de `a` para `b`. Com as duas oitavas, mede o intervalo
   * real (pode ser composto; se `b` estiver abaixo, `descendente: true`).
   * Sem oitava, mede o intervalo SIMPLES ascendente.
   */
  function entre(a, b) {
    a = N.ler(a); b = N.ler(b);
    if (!a || !b) return null;
    var passos, semi, desc = false;
    if (a.oitava != null && b.oitava != null) {
      passos = N.passo(b) - N.passo(a);
      semi = N.midi(b) - N.midi(a);
      if (passos < 0 || (passos === 0 && semi < 0)) { desc = true; passos = -passos; semi = -semi; }
    } else {
      passos = N.mod(b.li - a.li, 7);
      semi = N.mod(N.pc(b) - N.pc(a), 12);
      var r = referencia(passos + 1);
      while (semi - r > 6) semi -= 12;
      while (semi - r < -6) semi += 12;
    }
    var numero = passos + 1;
    var q = qualidadeDe(numero, semi - referencia(numero));
    var out = montar(numero, q, semi);
    if (out) out.descendente = desc;
    return out;
  }

  /** Lê "3M", "M3", "P5", "5J", "J5", "terça maior", "major third", "trítono". */
  function ler(entrada) {
    if (entrada && typeof entrada === 'object' && entrada.numero) return entrada;
    var cru = String(entrada == null ? '' : entrada).trim();
    if (!cru) return null;
    var m = cru.replace(/\s+/g, '').match(/^(\d{1,2})(J|P|M|m|A|d|AA|dd)$/) || null;
    var numero, q;
    if (m) { numero = Number(m[1]); q = m[2] === 'P' ? 'J' : m[2]; }
    else {
      m = cru.replace(/\s+/g, '').match(/^(J|P|M|m|A|d|AA|dd)(\d{1,2})$/);
      if (m) { numero = Number(m[2]); q = m[1] === 'P' ? 'J' : m[1]; }
    }
    if (!numero) {
      var t = N.semAcento(cru).toLowerCase().replace(/\s+/g, ' ');
      if (t === 'tritono') { numero = 4; q = 'A'; }
      else {
        for (var i = NUMEROS.length - 1; i >= 1 && !numero; i--) {
          var base = N.semAcento(NUMEROS[i]);
          var ks = Object.keys(QUAL_F);
          for (var k = 0; k < ks.length; k++) {
            if (t === base + ' ' + N.semAcento(QUAL_F[ks[k]]) || t === base + ' ' + N.semAcento(QUAL_M[ks[k]])
              || (NUM_EN[i] && t === QUAL_EN_LONGO[ks[k]] + ' ' + NUM_EN[i])) { numero = i; q = ks[k]; break; }
          }
        }
      }
    }
    if (!numero || numero > 22) return null;
    var d = diffDe(numero, q);
    if (d === undefined) return null;
    return montar(numero, q, referencia(numero) + d);
  }

  /**
   * Constrói a nota a um intervalo de `n`. A letra vem do NÚMERO e a
   * alteração vem da conta — é assim que dó + 4d dá fá♭, e não mi.
   */
  function construir(n, intervalo, descendente) {
    n = N.ler(n); var iv = ler(intervalo);
    if (!n || !iv) return null;
    var sinal = descendente ? -1 : 1;
    var oit = n.oitava == null ? 4 : n.oitava;
    var abs = n.li + 7 * oit + sinal * (iv.numero - 1);
    var li = N.mod(abs, 7), o = Math.floor(abs / 7);
    var alvo = (oit + 1) * 12 + N.LETRA_PC[n.li] + n.alt + sinal * iv.semitons;
    var alt = alvo - ((o + 1) * 12 + N.LETRA_PC[li]);
    if (alt < -2 || alt > 2) return null;
    return { li: li, alt: alt, oitava: n.oitava == null ? null : o };
  }

  /** Inversão: 3M ↔ 6m, 4A ↔ 5d, 2m ↔ 7M. Composto inverte o simples. */
  function inverter(intervalo) {
    var iv = ler(intervalo);
    if (!iv) return null;
    var s = iv.simples;
    var num = s === 1 ? 8 : s === 8 ? 1 : 9 - s;
    if (iv.numero === 8) num = 1;
    var q = { J: 'J', M: 'm', m: 'M', A: 'd', d: 'A', AA: 'dd', dd: 'AA' }[iv.qualidade];
    return ler(num + q);
  }

  /** O intervalo que o ouvido mede (semitons), com os nomes possíveis. */
  function porSemitons(semi) {
    var s = Math.abs(Number(semi));
    var out = [];
    for (var numero = 1; numero <= 15; numero++) {
      var q = qualidadeDe(numero, s - referencia(numero));
      if (q) out.push(montar(numero, q, s));
    }
    return out;
  }

  // Intervalos com página própria (os usuais; os duplamente alterados
  // existem no motor, mas não merecem página).
  var USUAIS = ['1J', '2m', '2M', '2A', '3m', '3M', '4J', '4A', '5d', '5J', '5A', '6m', '6M', '7m', '7M', '8J',
    '9m', '9M', '10m', '10M', '11J', '11A', '12J', '13m', '13M'].map(ler);

  function porSlug(slug) {
    for (var i = 0; i < USUAIS.length; i++) if (USUAIS[i].slug === slug) return USUAIS[i];
    return null;
  }

  return {
    REF: REF, NUMEROS: NUMEROS, QUAL_F: QUAL_F, USUAIS: USUAIS, simples: simples, referencia: referencia,
    qualidadeDe: qualidadeDe, entre: entre, ler: ler, construir: construir, inverter: inverter,
    porSemitons: porSemitons, porSlug: porSlug,
  };
});
