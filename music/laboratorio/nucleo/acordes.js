// =====================================================================
// Musique · Laboratório — NÚCLEO · acordes.
//
// Acorde também é FÓRMULA por graus ("1 3 5 b7"): a grafia sai da letra
// e da conta, como nas escalas. Dó° tem mi♭ e sol♭ (e não ré# e fá#);
// dó°7 tem si𝄫, que soa como lá e é outra nota — a sétima diminuta.
//
// Símbolos: o primeiro de cada lista é o canônico da casa (cifra
// brasileira); os outros são aliases aceitos na leitura. ⚠️ "C9" é
// ambíguo no Brasil (há songbooks que usam por add9); aqui segue a
// convenção internacional — C9 = C7(9) — e "C(9)" / "Cadd9" é o sem
// sétima. A página do acorde diz isso.
//
// O identificador compara ALTURAS (classes de altura), porque é o que o
// músico toca no teclado; a grafia do resultado vem da fórmula a partir
// da fundamental encontrada. Um conjunto pode ter vários nomes (C6 =
// Am7/C) — todos voltam, o mais simples primeiro.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./notas'), require('./intervalos'), require('./escalas'));
  else { var L = raiz.MusiqueLab = raiz.MusiqueLab || {}; L.acordes = fabrica(L.notas, L.intervalos, L.escalas); }
})(typeof self !== 'undefined' ? self : this, function (N, I, E) {
  'use strict';

  var CATALOGO = [
    { id: 'maior', nome: 'maior', formula: '1 3 5', simbolos: ['', 'M', 'maj'], nivel: 1, familia: 'triade' },
    { id: 'menor', nome: 'menor', formula: '1 b3 5', simbolos: ['m', 'min', '-'], nivel: 1, familia: 'triade' },
    { id: 'dim', nome: 'diminuto', formula: '1 b3 b5', simbolos: ['dim', '°', 'm(b5)'], nivel: 1, familia: 'triade' },
    { id: 'aum', nome: 'aumentado', formula: '1 3 #5', simbolos: ['aug', '+', '(#5)', '5+', 'aum'], nivel: 1, familia: 'triade' },
    { id: 'sus2', nome: 'suspenso de segunda', formula: '1 2 5', simbolos: ['sus2'], nivel: 1, familia: 'suspenso' },
    { id: 'sus4', nome: 'suspenso de quarta', formula: '1 4 5', simbolos: ['sus4', 'sus', '4'], nivel: 1, familia: 'suspenso' },
    { id: 'power', nome: 'power chord (quinta)', formula: '1 5', simbolos: ['5'], nivel: 1, familia: 'quinta' },
    { id: 'add9', nome: 'maior com nona adicionada', formula: '1 3 5 9', simbolos: ['(9)', 'add9', 'add2', '2'], nivel: 2, familia: 'adicionada' },
    { id: 'madd9', nome: 'menor com nona adicionada', formula: '1 b3 5 9', simbolos: ['m(9)', 'madd9', 'm(add9)', 'm2'], nivel: 2, familia: 'adicionada' },
    { id: '6', nome: 'maior com sexta', formula: '1 3 5 6', simbolos: ['6'], nivel: 2, familia: 'sexta' },
    { id: 'm6', nome: 'menor com sexta', formula: '1 b3 5 6', simbolos: ['m6'], nivel: 2, familia: 'sexta' },
    { id: '69', nome: 'sexta e nona', formula: '1 3 5 6 9', simbolos: ['6(9)', '6/9', '69'], nivel: 3, familia: 'sexta' },
    { id: '7M', nome: 'maior com sétima maior', formula: '1 3 5 7', simbolos: ['7M', 'maj7', 'M7', 'Δ', 'Δ7'], nivel: 2, familia: 'setima' },
    { id: '7', nome: 'dominante (com sétima)', formula: '1 3 5 b7', simbolos: ['7', 'dom7'], nivel: 1, familia: 'setima' },
    { id: 'm7', nome: 'menor com sétima', formula: '1 b3 5 b7', simbolos: ['m7', 'min7', '-7'], nivel: 1, familia: 'setima' },
    { id: 'm7b5', nome: 'meio-diminuto', formula: '1 b3 b5 b7', simbolos: ['m7(b5)', 'm7b5', 'ø', 'ø7', '-7(b5)'], nivel: 2, familia: 'setima' },
    { id: 'dim7', nome: 'diminuto com sétima', formula: '1 b3 b5 bb7', simbolos: ['°7', 'dim7'], nivel: 2, familia: 'setima' },
    { id: 'm7M', nome: 'menor com sétima maior', formula: '1 b3 5 7', simbolos: ['m(7M)', 'm7M', 'mMaj7', 'm(maj7)', '-Δ'], nivel: 3, familia: 'setima' },
    { id: '7M#5', nome: 'maior com sétima maior e quinta aumentada', formula: '1 3 #5 7', simbolos: ['7M(#5)', 'maj7#5', '+7M', 'Δ#5'], nivel: 3, familia: 'setima' },
    { id: '7#5', nome: 'dominante com quinta aumentada', formula: '1 3 #5 b7', simbolos: ['7(#5)', '7#5', 'aug7', '+7'], nivel: 3, familia: 'setima' },
    { id: '7b5', nome: 'dominante com quinta diminuta', formula: '1 3 b5 b7', simbolos: ['7(b5)', '7b5'], nivel: 3, familia: 'setima' },
    { id: '7sus4', nome: 'dominante suspenso', formula: '1 4 5 b7', simbolos: ['7sus4', '7(4)', '7sus'], nivel: 2, familia: 'setima' },
    { id: '9', nome: 'dominante com nona', formula: '1 3 5 b7 9', simbolos: ['7(9)', '9'], nivel: 2, familia: 'extensao' },
    { id: '7M9', nome: 'maior com sétima maior e nona', formula: '1 3 5 7 9', simbolos: ['7M(9)', 'maj9', '7M9', 'Δ9'], nivel: 3, familia: 'extensao' },
    { id: 'm9', nome: 'menor com sétima e nona', formula: '1 b3 5 b7 9', simbolos: ['m7(9)', 'm9', 'min9'], nivel: 3, familia: 'extensao' },
    { id: '7b9', nome: 'dominante com nona menor', formula: '1 3 5 b7 b9', simbolos: ['7(b9)', '7b9'], nivel: 3, familia: 'extensao' },
    { id: '7#9', nome: 'dominante com nona aumentada', formula: '1 3 5 b7 #9', simbolos: ['7(#9)', '7#9'], nivel: 3, familia: 'extensao' },
    { id: 'm11', nome: 'menor com sétima e décima primeira', formula: '1 b3 5 b7 11', simbolos: ['m7(11)', 'm11'], nivel: 3, familia: 'extensao' },
    { id: '7#11', nome: 'dominante com décima primeira aumentada', formula: '1 3 5 b7 #11', simbolos: ['7(#11)', '7#11'], nivel: 3, familia: 'extensao' },
    { id: '7M#11', nome: 'maior com sétima maior e décima primeira aumentada', formula: '1 3 5 7 #11', simbolos: ['7M(#11)', 'maj7#11', 'Δ#11'], nivel: 3, familia: 'extensao' },
    { id: '13', nome: 'dominante com décima terceira', formula: '1 3 5 b7 13', simbolos: ['7(13)', '13'], nivel: 3, familia: 'extensao' },
    { id: '7b13', nome: 'dominante com décima terceira menor', formula: '1 3 5 b7 b13', simbolos: ['7(b13)', '7b13'], nivel: 3, familia: 'extensao' },
    { id: '7b9b13', nome: 'dominante com nona menor e décima terceira menor', formula: '1 3 5 b7 b9 b13', simbolos: ['7(b9,b13)', '7(b9b13)'], nivel: 4, familia: 'extensao' },
    { id: '7alt', nome: 'dominante alterado', formula: '1 3 b7 b9 #9 b13', simbolos: ['7alt', 'alt'], nivel: 4, familia: 'extensao' },
  ];
  var POR_ID = {};
  CATALOGO.forEach(function (c) { POR_ID[c.id] = c; });
  function porId(id) { return POR_ID[id] || null; }

  function graus(id) { var c = porId(id); return c ? E.graus(c.formula) : null; }

  /** Notas grafadas, em posição fundamental (a oitava sobe quando precisa). */
  function notas(fundamental, id) {
    var g = graus(id);
    if (!g || !N.ler(fundamental)) return null;
    var out = g.map(function (x) { return E.notaDoGrau(fundamental, x); });
    return out.some(function (x) { return !x; }) ? null : out;
  }

  function semitons(id) {
    var g = graus(id);
    return g ? g.map(function (x) { return I.REF[(x.grau - 1) % 7] + 12 * Math.floor((x.grau - 1) / 7) + x.alt; }) : null;
  }
  function classes(id) { var s = semitons(id); return s ? s.map(function (x) { return N.mod(x, 12); }) : null; }

  /** Intervalos a partir da fundamental ("3M", "5J", "7m", "9M"). */
  function intervalos(id) {
    var ns = notas('C4', id);
    return ns ? ns.map(function (n) { var iv = I.entre('C4', n); return iv ? iv.curto : '?'; }) : null;
  }

  function simbolo(fundamental, id, baixo, opcoes) {
    var c = porId(id); var f = N.ler(fundamental);
    if (!c || !f) return '';
    var o = opcoes || {};
    var s = N.nome(f, { oitava: false, notacao: o.notacao === 'pt' ? 'pt' : 'cifra' }) + c.simbolos[0];
    var b = baixo ? N.ler(baixo) : null;
    if (b && !N.mesmaAltura(b, f)) s += '/' + N.nome(b, { oitava: false, notacao: o.notacao === 'pt' ? 'pt' : 'cifra' });
    return s;
  }

  // Normalização de sufixo para casar "7M", "maj7", "7(b9)" e "7b9".
  // ⚠️ Os PARÊNTESES contam primeiro: "C(9)" é a nona sem sétima e "C9" é
  // C7(9). Apagar os parênteses antes de comparar faria "(9)" e "9" virarem
  // a mesma chave — e o primeiro do catálogo ganharia, calado.
  function normSufixo(s, semParenteses) {
    var x = String(s).replace(/\s+/g, '').replace(/,/g, '').replace(/♭/g, 'b').replace(/♯/g, '#')
      .replace(/^min(?!or)/, 'm').replace(/^-(?!\d)/, 'm').replace(/^-7/, 'm7');
    return semParenteses ? x.replace(/[()]/g, '') : x;
  }
  var SUFIXOS = {}, SUFIXOS_SOLTOS = {};
  CATALOGO.forEach(function (c) { c.simbolos.forEach(function (s) { var k = normSufixo(s); if (!(k in SUFIXOS)) SUFIXOS[k] = c.id; }); });
  // variante sem parênteses ("7b9" para "7(b9)") só quando não colide
  CATALOGO.forEach(function (c) { c.simbolos.forEach(function (s) { var k = normSufixo(s, true); if (!(k in SUFIXOS) && !(k in SUFIXOS_SOLTOS)) SUFIXOS_SOLTOS[k] = c.id; }); });
  function sufixoId(suf) { var k = normSufixo(suf); if (k in SUFIXOS) return SUFIXOS[k]; var k2 = normSufixo(suf, true); return k2 in SUFIXOS ? SUFIXOS[k2] : (k2 in SUFIXOS_SOLTOS ? SUFIXOS_SOLTOS[k2] : null); }

  /**
   * Lê uma cifra: "G7(b9)", "Bbm7(b5)", "F#°7", "Solm", "C/E", "Dm7/C".
   * Devolve { fundamental, id, baixo } ou null. A fundamental aceita
   * nome latino com maiúscula ("Sol", "Ré") — "Do" minúsculo seria
   * ambíguo com a palavra, então a leitura exige a maiúscula ou o acento.
   */
  function ler(texto) {
    var s = String(texto == null ? '' : texto).trim();
    if (!s) return null;
    var barra = s.lastIndexOf('/');
    var baixo = null;
    if (barra > 0 && !/6\/9$/.test(s)) {
      baixo = N.ler(s.slice(barra + 1));
      if (!baixo || baixo.oitava != null) return null;
      s = s.slice(0, barra);
    }
    // fundamental = prefixo mais longo que é nota sem oitava
    for (var n = Math.min(s.length, 6); n >= 1; n--) {
      var cab = s.slice(0, n);
      // só letras e acidentes: "C-" não é a nota "C" (o leitor de nota
      // ignora hífen e espaço, e "C-" é dó MENOR na cifra)
      if (!/^[A-GDRMFSL][A-Za-zÀ-úé#b♯♭]*$/.test(cab)) continue;
      var f = N.ler(cab);
      if (!f || f.oitava != null) continue;
      var id = sufixoId(s.slice(n));
      if (id) return { fundamental: f, id: id, baixo: baixo };
    }
    return null;
  }

  /** Inversão k (0 = fundamental): a k-ésima nota vai para o baixo. */
  function inversao(fundamental, id, k) {
    var f = N.ler(fundamental);
    if (!f) return null;
    var ns = notas(f.oitava == null ? N.comOitava(f, 4) : f, id);
    if (!ns) return null;
    var kk = N.mod(Number(k) || 0, ns.length);
    var out = ns.slice(kk).concat(ns.slice(0, kk).map(function (x) { return N.comOitava(x, x.oitava + 1); }));
    for (var i = 1; i < out.length; i++) while (N.midi(out[i]) <= N.midi(out[i - 1])) out[i] = N.comOitava(out[i], out[i].oitava + 1);
    return f.oitava == null ? out.map(N.semOitava) : out;
  }

  var NOME_INVERSAO = ['posição fundamental', 'primeira inversão', 'segunda inversão', 'terceira inversão', 'quarta inversão'];

  /**
   * Nomeia um conjunto de ALTURAS. `alturas`: MIDI ou notas; a mais grave
   * é o baixo. Devolve candidatos ordenados: fundamental no baixo antes,
   * depois o mais simples. Quinta justa omitida é aceita em acorde de
   * quatro ou mais sons (é a primeira nota que o músico tira).
   */
  function identificar(alturas, opcoes) {
    var o = opcoes || {};
    var itens = (alturas || []).map(function (a) {
      if (typeof a === 'number') return { midi: a, nota: null };
      var n = N.ler(a); return n ? { midi: N.midi(n) != null ? N.midi(n) : N.pc(n), nota: n } : null;
    }).filter(Boolean);
    if (!itens.length) return [];
    // sem oitava, o baixo é a PRIMEIRA nota dada; com oitava, a mais grave
    var comOit = itens.every(function (x) { return !x.nota || x.nota.oitava != null; });
    var grave = comOit ? itens.slice().sort(function (x, y) { return x.midi - y.midi; })[0] : itens[0];
    var pcs = {}; itens.forEach(function (x) { pcs[N.mod(x.midi, 12)] = x.nota || pcs[N.mod(x.midi, 12)] || true; });
    var chaves = Object.keys(pcs).map(Number);
    var baixoPc = N.mod(grave.midi, 12);
    var out = [];
    chaves.forEach(function (r) {
      var rel = chaves.map(function (p) { return N.mod(p - r, 12); }).sort(function (a, b) { return a - b; }).join(',');
      CATALOGO.forEach(function (c) {
        var cls = classes(c.id).slice().sort(function (a, b) { return a - b; });
        var uniq = cls.filter(function (v, i) { return cls.indexOf(v) === i; });
        var exato = uniq.join(',') === rel;
        var sem5 = !exato && uniq.length >= 4 && uniq.indexOf(7) >= 0
          && uniq.filter(function (v) { return v !== 7; }).join(',') === rel;
        if (!exato && !sem5) return;
        var fund = pcs[r] && pcs[r] !== true ? N.semOitava(pcs[r]) : N.deClasse(r, { bemol: !!o.bemol });
        var cands = notas(fund, c.id);
        if (!cands) return;
        var baixo = null, inv = 0;
        if (baixoPc !== r) {
          var bn = pcs[baixoPc] && pcs[baixoPc] !== true ? N.semOitava(pcs[baixoPc]) : null;
          var naFormula = cands.filter(function (x) { return N.pc(x) === baixoPc; })[0];
          baixo = bn || naFormula || N.deClasse(baixoPc, { bemol: !!o.bemol });
          var ordem = cands.map(N.pc);
          inv = ordem.indexOf(baixoPc);
        }
        out.push({ id: c.id, nome: c.nome, fundamental: fund, baixo: baixo, inversao: inv,
          nome_inversao: inv > 0 ? NOME_INVERSAO[inv] || 'inversão' : (baixo ? 'baixo alternativo' : NOME_INVERSAO[0]),
          simbolo: simbolo(fund, c.id, baixo), sem_quinta: sem5, nivel: c.nivel });
      });
    });
    return out.sort(function (a, b) {
      return ((a.baixo ? 1 : 0) - (b.baixo ? 1 : 0)) || (a.sem_quinta - b.sem_quinta) || (a.nivel - b.nivel);
    });
  }

  /** Qualidade de uma pilha de notas (tríade/tétrade) já grafada. */
  function qualidadeDaPilha(pilha) {
    var f = pilha[0];
    var toks = pilha.slice(1).map(function (n) {
      var iv = I.entre(f, n); if (!iv) return '?';
      var p = { J: '', M: '', m: 'b', d: I.simples(iv.numero) in { 1: 1, 4: 1, 5: 1 } ? 'b' : 'bb', A: '#' }[iv.qualidade];
      return p + iv.simples;
    });
    var chave = ['1'].concat(toks).join(' ');
    for (var i = 0; i < CATALOGO.length; i++) if (CATALOGO[i].formula === chave) return CATALOGO[i].id;
    return null;
  }

  /**
   * Condução de vozes: das inversões do próximo acorde, a que menos
   * move as vozes a partir do atual (soma das distâncias em semitons).
   */
  function conduzir(atual, fundamental, id) {
    var base = (atual || []).map(N.midi).filter(function (x) { return x != null; });
    var ns = notas(fundamental, id);
    if (!ns) return null;
    var tam = ns.length, melhor = null;
    for (var k = 0; k < tam; k++) {
      for (var oit = 2; oit <= 5; oit++) {
        var f = N.ler(fundamental);
        var inv = inversao({ li: f.li, alt: f.alt, oitava: oit }, id, k);
        if (!inv) continue;
        var ms = inv.map(N.midi);
        var custo = base.length ? ms.reduce(function (a, m, i) { return a + Math.abs(m - (base[Math.min(i, base.length - 1)])); }, 0) : Math.abs(ms[0] - 60);
        if (!melhor || custo < melhor.custo) melhor = { custo: custo, notas: inv, inversao: k };
      }
    }
    return melhor;
  }

  return {
    CATALOGO: CATALOGO, porId: porId, graus: graus, notas: notas, semitons: semitons, classes: classes,
    intervalos: intervalos, simbolo: simbolo, ler: ler, inversao: inversao, identificar: identificar,
    qualidadeDaPilha: qualidadeDaPilha, conduzir: conduzir, NOME_INVERSAO: NOME_INVERSAO,
  };
});
