// =====================================================================
// Musique · Laboratório — NÚCLEO · escalas e modos.
//
// Escala é FÓRMULA POR GRAUS ("1 2 b3 4 5 b6 7"), não lista de semitons.
// O grau dá a LETRA e o acidente dá a conta: sol# menor harmônica sai
// com fá𝄪, como na partitura, e não com sol (que é a mesma tecla e outra
// nota). Cadastrar escala nova = uma linha em CATALOGO; a interface não
// muda.
//
// Convenções declaradas (diferem entre livros, e o aluno merece saber):
//   · menor melódica: fórmula ASCENDENTE; na descida, a prática tonal
//     usa a menor natural — dito na página, não escondido;
//   · cromática: sustenidos subindo (a descida com bemóis é a outra
//     convenção comum);
//   · "árabe" nomeia duas escalas na literatura; aqui é a maior-lócria,
//     e a dupla harmônica tem a própria entrada.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./notas'), require('./intervalos'));
  else (raiz.MusiqueLab = raiz.MusiqueLab || {}).escalas = fabrica(raiz.MusiqueLab.notas, raiz.MusiqueLab.intervalos);
})(typeof self !== 'undefined' ? self : this, function (N, I) {
  'use strict';

  // nivel: 1 iniciante · 2 intermediário · 3 avançado · 4 especialista
  var CATALOGO = [
    { id: 'maior', nome: 'maior', aliases: ['jônio', 'jonio', 'major', 'ionian', 'escala maior'], formula: '1 2 3 4 5 6 7', familia: 'maior', grau: 1, nivel: 1 },
    { id: 'menor-natural', nome: 'menor natural', aliases: ['eólio', 'eolio', 'menor', 'natural minor', 'aeolian', 'minor'], formula: '1 2 b3 4 5 b6 b7', familia: 'maior', grau: 6, nivel: 1 },
    { id: 'menor-harmonica', nome: 'menor harmônica', aliases: ['harmonic minor'], formula: '1 2 b3 4 5 b6 7', familia: 'menor-harmonica', grau: 1, nivel: 2 },
    { id: 'menor-melodica', nome: 'menor melódica', aliases: ['melodic minor', 'menor melódica ascendente', 'jazz minor'], formula: '1 2 b3 4 5 6 7', familia: 'menor-melodica', grau: 1, nivel: 2,
      nota: 'Fórmula ascendente. Na música tonal, a descida costuma usar a menor natural; no jazz, a mesma fórmula vale nos dois sentidos.' },
    { id: 'dorico', nome: 'dórico', aliases: ['dorian', 'modo dórico'], formula: '1 2 b3 4 5 6 b7', familia: 'maior', grau: 2, nivel: 2 },
    { id: 'frigio', nome: 'frígio', aliases: ['phrygian', 'modo frígio'], formula: '1 b2 b3 4 5 b6 b7', familia: 'maior', grau: 3, nivel: 2 },
    { id: 'lidio', nome: 'lídio', aliases: ['lydian', 'modo lídio'], formula: '1 2 3 #4 5 6 7', familia: 'maior', grau: 4, nivel: 2 },
    { id: 'mixolidio', nome: 'mixolídio', aliases: ['mixolydian', 'modo mixolídio'], formula: '1 2 3 4 5 6 b7', familia: 'maior', grau: 5, nivel: 2 },
    { id: 'locrio', nome: 'lócrio', aliases: ['locrian', 'modo lócrio'], formula: '1 b2 b3 4 b5 b6 b7', familia: 'maior', grau: 7, nivel: 2 },
    { id: 'pentatonica-maior', nome: 'pentatônica maior', aliases: ['major pentatonic', 'pentatonica'], formula: '1 2 3 5 6', familia: 'pentatonica', nivel: 1 },
    { id: 'pentatonica-menor', nome: 'pentatônica menor', aliases: ['minor pentatonic'], formula: '1 b3 4 5 b7', familia: 'pentatonica', nivel: 1 },
    { id: 'blues-menor', nome: 'blues menor', aliases: ['blues', 'escala blues', 'minor blues', 'blues scale'], formula: '1 b3 4 b5 5 b7', familia: 'blues', nivel: 1 },
    { id: 'blues-maior', nome: 'blues maior', aliases: ['major blues'], formula: '1 2 b3 3 5 6', familia: 'blues', nivel: 2 },
    { id: 'maior-harmonica', nome: 'maior harmônica', aliases: ['harmonic major'], formula: '1 2 3 4 5 b6 7', familia: 'maior-harmonica', grau: 1, nivel: 3 },
    { id: 'dupla-harmonica', nome: 'dupla harmônica maior', aliases: ['double harmonic major', 'bizantina', 'byzantine', 'cigana maior'], formula: '1 b2 3 4 5 b6 7', familia: 'exotica', nivel: 3 },
    // modos da menor harmônica
    { id: 'locrio-6', nome: 'lócrio ♮6', aliases: ['locrian natural 6', 'lócrio 6'], formula: '1 b2 b3 4 b5 6 b7', familia: 'menor-harmonica', grau: 2, nivel: 4 },
    { id: 'jonio-aumentado', nome: 'jônio aumentado', aliases: ['ionian #5', 'jônio #5'], formula: '1 2 3 4 #5 6 7', familia: 'menor-harmonica', grau: 3, nivel: 4 },
    { id: 'dorico-4', nome: 'dórico ♯4', aliases: ['ucraniano', 'dorian #4', 'romeno menor'], formula: '1 2 b3 #4 5 6 b7', familia: 'menor-harmonica', grau: 4, nivel: 4 },
    { id: 'frigio-dominante', nome: 'frígio dominante', aliases: ['phrygian dominant', 'espanhola', 'mixolídio b9 b13', 'frígio maior'], formula: '1 b2 3 4 5 b6 b7', familia: 'menor-harmonica', grau: 5, nivel: 3 },
    { id: 'lidio-2', nome: 'lídio ♯2', aliases: ['lydian #2'], formula: '1 #2 3 #4 5 6 7', familia: 'menor-harmonica', grau: 6, nivel: 4 },
    { id: 'ultralocrio', nome: 'ultralócrio', aliases: ['superlócrio bb7', 'ultralocrian', 'alterada bb7'], formula: '1 b2 b3 b4 b5 b6 bb7', familia: 'menor-harmonica', grau: 7, nivel: 4 },
    // modos da menor melódica
    { id: 'dorico-b2', nome: 'dórico ♭2', aliases: ['frígio ♮6', 'dorian b2', 'phrygian natural 6'], formula: '1 b2 b3 4 5 6 b7', familia: 'menor-melodica', grau: 2, nivel: 4 },
    { id: 'lidio-aumentado', nome: 'lídio aumentado', aliases: ['lydian augmented', 'lídio #5'], formula: '1 2 3 #4 #5 6 7', familia: 'menor-melodica', grau: 3, nivel: 3 },
    { id: 'lidio-dominante', nome: 'lídio dominante', aliases: ['acústica', 'acustica', 'lídio b7', 'lydian dominant', 'acoustic scale', 'overtone'], formula: '1 2 3 #4 5 6 b7', familia: 'menor-melodica', grau: 4, nivel: 3 },
    { id: 'mixolidio-b6', nome: 'mixolídio ♭6', aliases: ['hindu', 'mixolydian b6', 'eólio dominante'], formula: '1 2 3 4 5 b6 b7', familia: 'menor-melodica', grau: 5, nivel: 4 },
    { id: 'locrio-2', nome: 'lócrio ♮2', aliases: ['meio-diminuta', 'locrian natural 2', 'half diminished'], formula: '1 2 b3 4 b5 b6 b7', familia: 'menor-melodica', grau: 6, nivel: 4 },
    { id: 'alterada', nome: 'alterada', aliases: ['superlócria', 'superlocria', 'altered', 'super locrian'], formula: '1 b2 b3 b4 b5 b6 b7', familia: 'menor-melodica', grau: 7, nivel: 3 },
    // bebop
    { id: 'bebop-dominante', nome: 'bebop dominante', aliases: ['bebop dominant', 'bebop'], formula: '1 2 3 4 5 6 b7 7', familia: 'bebop', nivel: 3 },
    { id: 'bebop-maior', nome: 'bebop maior', aliases: ['bebop major'], formula: '1 2 3 4 5 #5 6 7', familia: 'bebop', nivel: 3 },
    { id: 'bebop-menor', nome: 'bebop menor', aliases: ['bebop dórico', 'bebop minor', 'bebop dorian'], formula: '1 2 b3 3 4 5 6 b7', familia: 'bebop', nivel: 3 },
    // simétricas
    { id: 'cromatica', nome: 'cromática', aliases: ['chromatic', 'cromatica'], formula: '1 #1 2 #2 3 4 #4 5 #5 6 #6 7', familia: 'simetrica', nivel: 1,
      nota: 'Grafada com sustenidos subindo; na descida, a convenção comum é usar bemóis.' },
    { id: 'tons-inteiros', nome: 'tons inteiros', aliases: ['hexafônica', 'whole tone', 'escala de tons inteiros', 'modo 1 de messiaen'], formula: '1 2 3 #4 #5 b7', familia: 'simetrica', nivel: 3 },
    { id: 'diminuta-tom-semitom', nome: 'diminuta tom–semitom', aliases: ['octatônica', 'octatonica', 'whole half', 'diminuta', 'modo 2 de messiaen'], formula: '1 2 b3 4 b5 b6 6 7', familia: 'simetrica', nivel: 3 },
    { id: 'diminuta-semitom-tom', nome: 'diminuta semitom–tom', aliases: ['dominante diminuta', 'half whole', 'diminuta dominante'], formula: '1 b2 #2 3 #4 5 6 b7', familia: 'simetrica', nivel: 3 },
    { id: 'aumentada', nome: 'aumentada', aliases: ['augmented', 'hexatônica aumentada'], formula: '1 #2 3 5 #5 7', familia: 'simetrica', nivel: 4 },
    { id: 'messiaen-3', nome: 'modo 3 de Messiaen', aliases: ['messiaen 3', 'modo de transposição limitada 3'], formula: '1 2 b3 3 #4 5 b6 b7 7', familia: 'simetrica', nivel: 4 },
    // outras tradições e cores
    { id: 'hungara-menor', nome: 'húngara menor', aliases: ['hungarian minor', 'cigana menor'], formula: '1 2 b3 #4 5 b6 7', familia: 'exotica', nivel: 3 },
    { id: 'hungara-maior', nome: 'húngara maior', aliases: ['hungarian major'], formula: '1 #2 3 #4 5 6 b7', familia: 'exotica', nivel: 4 },
    { id: 'arabe', nome: 'árabe (maior-lócria)', aliases: ['arabic', 'maior lócria', 'major locrian'], formula: '1 2 3 4 b5 b6 b7', familia: 'exotica', nivel: 4,
      nota: '"Árabe" nomeia mais de uma escala na literatura. Aqui é a maior-lócria; a dupla harmônica maior tem página própria.' },
    { id: 'egipcia', nome: 'egípcia', aliases: ['egyptian', 'pentatônica suspensa'], formula: '1 2 4 5 b7', familia: 'pentatonica', nivel: 3 },
    { id: 'hirajoshi', nome: 'hirajoshi', aliases: ['hirajōshi'], formula: '1 2 b3 5 b6', familia: 'pentatonica', nivel: 3 },
    { id: 'japonesa', nome: 'japonesa (in-sen)', aliases: ['in sen', 'insen', 'japanese'], formula: '1 b2 4 5 b7', familia: 'pentatonica', nivel: 3 },
    { id: 'iwato', nome: 'iwato', aliases: [], formula: '1 b2 4 b5 b7', familia: 'pentatonica', nivel: 4 },
    { id: 'prometheus', nome: 'Prometheus', aliases: ['prometeu', 'escala mística'], formula: '1 2 3 #4 6 b7', familia: 'exotica', nivel: 4 },
  ];
  var POR_ID = {};
  CATALOGO.forEach(function (e) { POR_ID[e.id] = e; });

  /** "b3" → { grau: 3, alt: -1 }. */
  function lerGrau(tok) {
    var m = String(tok).match(/^([#b]*)(\d{1,2})$/);
    if (!m) return null;
    var alt = 0;
    for (var i = 0; i < m[1].length; i++) alt += m[1][i] === '#' ? 1 : -1;
    return { grau: Number(m[2]), alt: alt };
  }
  function graus(formula) { return String(formula).trim().split(/\s+/).map(lerGrau); }

  /** Nota do grau (letra pelo grau, alteração pela conta). */
  function notaDoGrau(tonica, g) {
    var t = N.ler(tonica);
    if (!t || !g) return null;
    var oit = t.oitava == null ? 4 : t.oitava;
    var abs = t.li + 7 * oit + (g.grau - 1);
    var li = N.mod(abs, 7), o = Math.floor(abs / 7);
    var semi = I.REF[(g.grau - 1) % 7] + 12 * Math.floor((g.grau - 1) / 7) + g.alt;
    var alvo = (oit + 1) * 12 + N.LETRA_PC[t.li] + t.alt + semi;
    var alt = alvo - ((o + 1) * 12 + N.LETRA_PC[li]);
    if (alt < -2 || alt > 2) return null;               // exigiria triplo acidente
    return { li: li, alt: alt, oitava: t.oitava == null ? null : o };
  }

  function porId(id) { return POR_ID[id] || null; }

  /** Notas grafadas da escala. null se alguma exigir triplo acidente. */
  function notas(tonica, id) {
    var e = porId(id);
    if (!e || !N.ler(tonica)) return null;
    var out = graus(e.formula).map(function (g) { return notaDoGrau(tonica, g); });
    return out.some(function (x) { return !x; }) ? null : out;
  }

  /** Semitons a partir da tônica (0 = tônica). */
  function semitons(id) {
    var e = porId(id);
    if (!e) return null;
    return graus(e.formula).map(function (g) { return I.REF[(g.grau - 1) % 7] + g.alt; });
  }

  /** "T T S T T T S" — com "T+S" para o intervalo de tom e meio. */
  function passos(id) {
    var s = semitons(id);
    if (!s) return null;
    var nomes = { 1: 'S', 2: 'T', 3: 'T+S', 4: '2T' };
    return s.map(function (x, i) { var p = (i + 1 < s.length ? s[i + 1] : 12) - x; return nomes[p] || p + 's'; });
  }

  /** Intervalos de cada grau a partir da tônica ("3m", "5J"...). */
  function intervalos(id) {
    var ns = notas('C4', id);
    if (!ns) return null;
    return ns.map(function (n) { var iv = I.entre('C4', n); return iv ? iv.curto : '?'; });
  }

  /** Quantos acidentes a escala tem nesta tônica (para escolher a grafia). */
  function acidentes(tonica, id) {
    var ns = notas(tonica, id);
    return ns ? ns.reduce(function (a, n) { return a + Math.abs(n.alt); }, 0) : Infinity;
  }

  var HEPTA = function (e) { return graus(e.formula).length === 7; };

  /** Tríades e tétrades sobre cada grau, empilhando terças DENTRO da escala. */
  function empilhar(tonica, id, tamanho) {
    var e = porId(id);
    var ns = notas(tonica, id);
    if (!e || !ns || !HEPTA(e)) return null;
    var out = [];
    for (var i = 0; i < 7; i++) {
      var acorde = [];
      for (var k = 0; k < (tamanho || 3); k++) acorde.push(ns[(i + 2 * k) % 7]);
      out.push({ grau: i + 1, notas: acorde.map(N.semOitava) });
    }
    return out;
  }

  /** Os outros modos da mesma família, com a tônica de cada um. */
  function modosRelacionados(tonica, id) {
    var e = porId(id);
    var ns = notas(tonica, id);
    if (!e || !ns || !e.grau) return [];
    // tônica da escala-mãe = grau (8 - grau) a partir daqui
    var maeIdx = (7 - (e.grau - 1)) % 7;
    var maeTonica = ns[maeIdx];
    var mae = notas(maeTonica, CATALOGO.filter(function (x) { return x.familia === e.familia && x.grau === 1; })[0].id);
    return CATALOGO.filter(function (x) { return x.familia === e.familia && x.grau; })
      .sort(function (a, b) { return a.grau - b.grau; })
      .map(function (x) { return { id: x.id, nome: x.nome, grau: x.grau, tonica: N.semOitava(mae[x.grau - 1]), atual: x.id === id }; });
  }

  /**
   * Busca inversa: quais escalas contêm TODAS estas classes de altura
   * (exatas ou incluídas), em qualquer tônica. Lista as exatas primeiro.
   */
  function identificar(classes, opcoes) {
    var alvo = {}; (classes || []).forEach(function (p) { alvo[N.mod(p, 12)] = true; });
    var chaves = Object.keys(alvo).map(Number);
    if (!chaves.length) return [];
    var o = opcoes || {};
    var out = [];
    for (var t = 0; t < 12; t++) {
      CATALOGO.forEach(function (e) {
        var s = semitons(e.id).map(function (x) { return N.mod(x + t, 12); });
        var tem = {}; s.forEach(function (x) { tem[x] = true; });
        if (!chaves.every(function (c) { return tem[c]; })) return;
        var exata = s.length === chaves.length;
        if (o.soExatas && !exata) return;
        out.push({ tonica_pc: t, id: e.id, nome: e.nome, exata: exata, nivel: e.nivel, extras: s.length - chaves.length });
      });
    }
    return out.sort(function (a, b) { return (b.exata - a.exata) || (a.extras - b.extras) || (a.nivel - b.nivel); });
  }

  /** Lê "ré dórico", "C harmonic minor", "sol# menor harmônica". */
  function lerNome(texto) {
    var s = N.semAcento(texto).toLowerCase().trim();
    var melhor = null;
    CATALOGO.forEach(function (e) {
      [e.nome].concat(e.aliases).forEach(function (al) {
        var a = N.semAcento(al).toLowerCase();
        var ix = s.lastIndexOf(a);
        if (ix > 0 && ix + a.length === s.length) {
          var ton = N.ler(s.slice(0, ix).replace(/\b(escala|de|modo)\b/g, '').trim());
          if (ton && ton.oitava == null && (!melhor || a.length > melhor.tam)) melhor = { tonica: ton, id: e.id, tam: a.length };
        }
      });
    });
    return melhor ? { tonica: melhor.tonica, id: melhor.id } : null;
  }

  return {
    CATALOGO: CATALOGO, porId: porId, lerGrau: lerGrau, graus: graus, notaDoGrau: notaDoGrau,
    notas: notas, semitons: semitons, passos: passos, intervalos: intervalos, acidentes: acidentes,
    empilhar: empilhar, modosRelacionados: modosRelacionados, identificar: identificar, lerNome: lerNome,
  };
});
