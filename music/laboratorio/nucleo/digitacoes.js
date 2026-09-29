// =====================================================================
// Musique · Laboratório — NÚCLEO · exercícios de braço (tutor).
//
// Os exercícios clássicos de técnica para instrumentos de trastes,
// CALCULADOS da teoria e da afinação — nenhum desenho é copiado de
// livro ou site:
//   · escala por POSIÇÃO: todas as notas da escala numa janela de 5 casas
//     (um dedo por casa), subindo da corda mais grave à mais aguda; os
//     "desenhos" são as posições que começam em cada grau da escala na
//     corda mais grave (na pentatônica, os 5 desenhos clássicos);
//   · 3 NOTAS POR CORDA (escalas de 7 notas, violão/guitarra/baixo);
//   · ARPEJO: as notas do acorde na posição;
//   · CROMÁTICO ("aranha"): 4 casas seguidas por corda, 1 dedo por casa,
//     nas permutações clássicas de dedos.
// E as ORDENS de estudo: sobe e desce, terças, grupos de 3 e de 4.
//
// Saída: passos { corda, casa, dedo (0 = solta), midi, nota }.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./notas'), require('./escalas'), require('./acordes'), require('./instrumentos'));
  else { var L = raiz.MusiqueLab = raiz.MusiqueLab || {}; L.digitacoes = fabrica(L.notas, L.escalas, L.acordes, L.instrumentos); }
})(typeof self !== 'undefined' ? self : this, function (N, E, A, INS) {
  'use strict';

  // Uma POSIÇÃO = 4 casas, um dedo por casa (indicador na casa da posição,
  // mínimo 3 casas acima). Da 2ª corda em diante o indicador pode ESTICAR
  // uma casa para trás. É a regra dos desenhos clássicos: lá pentatônica
  // menor, desenho 1 = casas 5 a 8; desenho 5 = casas 15 a 17 com o mi na
  // casa 14 da 4ª corda; sol maior na 3ª casa = casas 2 a 5.
  var ALCANCE = 3;

  /** Cordas em ordem de ALTURA (no ukulele reentrante, a 4ª corda é a aguda). */
  function cordasPorAltura(af) {
    return af.midi.map(function (m, i) { return { i: i, m: m }; }).sort(function (a, b) { return a.m - b.m; });
  }

  /** Mapa pc → nota grafada (para dizer "fá♯" e não "sol♭" na escala de sol). */
  function grafia(notas) { var g = {}; notas.forEach(function (n) { g[N.pc(n)] = N.semOitava(n); }); return g; }
  function notaGrafada(midi, g) {
    var n = g[N.mod(midi, 12)] || N.deMidi(midi);
    return N.comOitava(n, Math.floor((midi - N.LETRA_PC[n.li] - n.alt) / 12) - 1);
  }

  /**
   * Dedos de uma corda: um dedo por casa a partir da casa-base (a da
   * posição, ou uma antes quando o indicador estica). Corda solta = 0.
   */
  function dedosDaCorda(casas, pos) {
    var presas = casas.filter(function (k) { return k > 0; });
    var base = presas.length && Math.min.apply(null, presas) < pos ? pos - 1 : Math.max(pos, 1);
    var ds = casas.map(function (k) { return k === 0 ? 0 : Math.max(1, Math.min(4, k - base + 1)); });
    // 4 notas em 5 casas (ex.: a 2ª aumentada da menor harmônica): dois dedos
    // cairiam na mesma casa-alvo. Mantém a ordem (dedo sobe com a casa),
    // empurrando para cima e depois para baixo, sem sair de 1–4.
    var n = ds.length, i;
    for (i = 1; i < n; i++) if (ds[i] && ds[i - 1] && ds[i] <= ds[i - 1]) ds[i] = Math.min(4, ds[i - 1] + 1);
    for (i = n - 2; i >= 0; i--) if (ds[i] && ds[i + 1] && ds[i] >= ds[i + 1]) ds[i] = Math.max(1, ds[i + 1] - 1);
    return ds;
  }

  /**
   * Notas de um conjunto de classes de altura numa POSIÇÃO, subindo da
   * corda mais grave para a mais aguda. Uma mesma altura em duas cordas
   * fica na mais GRAVE (sobe sem repetir). Na corda mais grave o
   * exercício começa na casa da posição (não numa nota abaixo dela); com
   * pos ≤ 1 é a posição aberta (casas 0 a 4, cordas soltas incluídas).
   */
  function naPosicao(af, pcs, pos, g) {
    var alvo = {}; pcs.forEach(function (p) { alvo[N.mod(p, 12)] = true; });
    var out = [], ultimo = -Infinity;
    var cs = cordasPorAltura(af);
    cs.forEach(function (c, ordem) {
      var ini = pos <= 1 ? 0 : (ordem > 0 ? pos - 1 : pos), fim = pos <= 1 ? 4 : pos + ALCANCE;
      var soltaSeguinte = cs[ordem + 1] ? cs[ordem + 1].m : null;
      var desta = [];
      for (var k = ini; k <= fim; k++) {
        var m = c.m + k;
        // posição aberta: a nota que a próxima corda dá SOLTA fica com ela
        // (sol→si no violão), em vez de ir para o mínimo na 4ª casa
        if (pos <= 1 && k === 4 && m === soltaSeguinte) continue;
        if (alvo[N.mod(m, 12)] && m > ultimo) { desta.push(k); ultimo = m; }
      }
      var dedos = dedosDaCorda(desta, pos);
      desta.forEach(function (k, j) { out.push({ corda: c.i, casa: k, dedo: dedos[j], midi: c.m + k, nota: notaGrafada(c.m + k, g) }); });
    });
    return out;
  }

  /**
   * As posições ("desenhos") de uma escala: cada grau na corda mais
   * grave. O desenho 1 é o da TÔNICA (como se ensina: "lá menor, desenho 1
   * na casa 5"); os seguintes sobem pelo braço e, ao passar da 12ª casa,
   * sobem uma oitava (casa + 12) quando ainda cabem no braço (`maxCasa`);
   * senão ficam na região grave (mesmo desenho, uma oitava abaixo).
   */
  function desenhos(af, tonica, escalaId, maxCasa) { return desenhosDe(af, E.notas(tonica, escalaId), maxCasa, false); }
  /** Idem para um conjunto qualquer de notas (no arpejo, as notas do acorde). */
  function desenhosDe(af, ns, maxCasa, ehAcorde) {
    if (!ns) return [];
    var grave = cordasPorAltura(af)[0];
    var vistos = {};
    return ns.map(function (n, grau) {
      var casa = N.mod(N.pc(n) - grave.m, 12);
      if (casa > 12) casa -= 12;
      return { grau: grau + 1, nota: N.semOitava(n), casa: casa };
    }).sort(function (a, b) { return a.casa - b.casa; })
      .filter(function (d) { var k = d.casa; if (vistos[k]) return false; vistos[k] = 1; return true; })
      .reduce(function (acc, d, i, arr) { if (!acc.length) { var k0 = 0; arr.forEach(function (x, j) { if (x.grau === 1) k0 = j; }); return arr.slice(k0).concat(arr.slice(0, k0).map(function (x) { return x.casa + 12 + ALCANCE <= (maxCasa || 0) ? { grau: x.grau, nota: x.nota, casa: x.casa + 12 } : x; })); } return acc; }, [])
      .map(function (d, i) { return { n: i + 1, casa: d.casa, grau: d.grau, nota: d.nota, rotulo: 'desenho ' + (i + 1) + ' (casa ' + d.casa + (d.grau === 1 ? (ehAcorde ? ', na fundamental' : ', na tônica') : ehAcorde ? ', a partir de ' + N.nome(d.nota, { notacao: 'pt', glifo: true, oitava: false }) : ', a partir do ' + d.grau + 'º grau') + ')' }; });
  }

  function escalaNaPosicao(af, tonica, escalaId, pos) {
    var ns = E.notas(tonica, escalaId);
    if (!ns) return [];
    return naPosicao(af, ns.map(N.pc), pos, grafia(ns));
  }

  function arpejoNaPosicao(af, fundamental, acordeId, pos) {
    var ns = A.notas(fundamental, acordeId);
    if (!ns) return [];
    return naPosicao(af, ns.map(N.pc), pos, grafia(ns));
  }

  /**
   * 3 notas por corda a partir da tônica na corda mais grave (escalas de
   * 7 notas). Em instrumento reentrante não se aplica (devolve []).
   */
  function tresPorCorda(af, tonica, escalaId, grauInicial) {
    var ns = E.notas(tonica, escalaId);
    if (!ns || ns.length !== 7) return [];
    for (var i = 1; i < af.midi.length; i++) if (af.midi[i] < af.midi[i - 1]) return [];
    var g = grafia(ns), pcs = ns.map(N.pc);
    var ini = N.mod(pcs[(grauInicial || 0) % 7] - af.midi[0], 12);
    var m = af.midi[0] + ini, idx = (grauInicial || 0) % 7, out = [];
    for (var c = 0; c < af.midi.length; c++) {
      for (var k = 0; k < 3; k++) {
        if (k > 0 || c > 0) {
          // próxima nota da escala acima de m
          var prox = (idx + 1) % 7, d = N.mod(pcs[prox] - N.mod(m, 12), 12) || 12;
          m += d; idx = prox;
        }
        var casa = m - af.midi[c];
        if (casa < 0 || casa > 22) return out;
        out.push({ corda: c, casa: casa, dedo: 0, midi: m, nota: null });
      }
    }
    // dedos: por corda, 1-2-4 ou 1-3-4 conforme a distância; notas grafadas
    for (var s = 0; s < out.length; s += 3) {
      var tr = out.slice(s, s + 3); if (tr.length < 3) break;
      var a = tr[1].casa - tr[0].casa;
      var dedos = a >= 2 ? [1, 3, 4] : [1, 2, 4];
      if (tr[2].casa - tr[0].casa <= 2) dedos = [1, 2, 3];
      tr.forEach(function (p, j) { p.dedo = p.casa === 0 ? 0 : dedos[j]; });
    }
    return out.map(function (p) { p.nota = notaGrafada(p.midi, g); return p; });
  }

  // Permutações clássicas do exercício cromático ("aranha").
  var CROMATICOS = { '1234': [1, 2, 3, 4], '1324': [1, 3, 2, 4], '1243': [1, 2, 4, 3], '1432': [1, 4, 3, 2], '2143': [2, 1, 4, 3] };
  function cromatico(af, pos, variante) {
    var ordem = CROMATICOS[variante] || CROMATICOS['1234'];
    var p0 = Math.max(1, pos), out = [];
    cordasPorAltura(af).forEach(function (c) {
      ordem.forEach(function (dedo) { var casa = p0 + dedo - 1; out.push({ corda: c.i, casa: casa, dedo: dedo, midi: c.m + casa, nota: N.deMidi(c.m + casa) }); });
    });
    return out;
  }

  /** Ordens de estudo sobre a sequência subindo. */
  var ORDENS = {
    'sobe-desce': { nome: 'sobe e desce', fn: function (a) { return a.concat(a.slice(0, -1).reverse()); } },
    'sobe': { nome: 'só subindo', fn: function (a) { return a.slice(); } },
    'tercas': { nome: 'em terças (1-3, 2-4…)', fn: function (a) { var o = []; for (var i = 0; i + 2 < a.length; i++) o.push(a[i], a[i + 2]); return o; } },
    'grupos-3': { nome: 'grupos de 3 (1-2-3, 2-3-4…)', fn: function (a) { var o = []; for (var i = 0; i + 2 < a.length; i++) o.push(a[i], a[i + 1], a[i + 2]); return o; } },
    'grupos-4': { nome: 'grupos de 4 (1-2-3-4, 2-3-4-5…)', fn: function (a) { var o = []; for (var i = 0; i + 3 < a.length; i++) o.push(a[i], a[i + 1], a[i + 2], a[i + 3]); return o; } },
  };
  function ordenar(passos, ordem) { var o = ORDENS[ordem] || ORDENS['sobe-desce']; return o.fn(passos); }

  var TIPOS = [
    { id: 'escala', nome: 'Escala por posição (desenhos)' },
    { id: 'pentatonica', nome: 'Pentatônica — os 5 desenhos' },
    { id: 'tres-por-corda', nome: '3 notas por corda' },
    { id: 'arpejo', nome: 'Arpejo na posição' },
    { id: 'cromatico', nome: 'Cromático (aranha): 1 dedo por casa' },
  ];

  /**
   * Monta o exercício. o: { instrumento, afinacao, tipo, tonica, escala,
   * acorde, desenho (nº), posicao, variante, ordem }.
   */
  function montar(o) {
    var af = INS.afinacao(o.instrumento || 'violao', o.afinacao || 'padrao') || INS.afinacao('violao', 'padrao');
    var t = N.ler(o.tonica || 'C'), base = [], titulo = '', pos = 0, lista = [];
    if (o.tipo === 'cromatico') {
      pos = Math.max(1, Math.min(12, Number(o.posicao) || 1));
      base = cromatico(af, pos, o.variante);
      titulo = 'Cromático ' + (o.variante || '1234') + ', posição ' + pos;
      return { passos: base, titulo: titulo, afinacao: af, posicao: pos, desenhos: [], casas: pos + 4 };
    }
    if (o.tipo === 'tres-por-corda') {
      base = tresPorCorda(af, t, o.escala || 'maior', Number(o.desenho || 1) - 1);
      titulo = N.nome(t, { notacao: 'pt', glifo: true, oitava: false }) + ' ' + E.porId(o.escala || 'maior').nome + ', 3 notas por corda';
    } else {
      var escId = o.tipo === 'pentatonica' ? (o.escala === 'pentatonica-menor' ? 'pentatonica-menor' : o.escala === 'pentatonica-maior' ? 'pentatonica-maior' : 'pentatonica-menor') : (o.escala || 'maior');
      var maxCasa = (INS.instrumento(o.instrumento || 'violao') || { casas: 19 }).casas;
      lista = o.tipo === 'arpejo' ? desenhosDe(af, A.notas(t, o.acorde || 'maior'), maxCasa, true) : desenhos(af, t, escId, maxCasa);
      var d = lista[Math.max(0, Math.min(lista.length - 1, Number(o.desenho || 1) - 1))] || { casa: 0 };
      pos = d.casa;
      if (o.tipo === 'arpejo') {
        base = arpejoNaPosicao(af, t, o.acorde || 'maior', pos);
        titulo = 'Arpejo de ' + A.simbolo(t, o.acorde || 'maior') + ', ' + (d.rotulo || 'posição da casa ' + pos);
      } else {
        base = escalaNaPosicao(af, t, escId, pos);
        titulo = N.nome(t, { notacao: 'pt', glifo: true, oitava: false }) + ' ' + E.porId(escId).nome + ', ' + (d.rotulo || 'posição ' + pos);
      }
    }
    var casasMax = base.reduce(function (m, p) { return Math.max(m, p.casa); }, 0);
    return { passos: ordenar(base, o.ordem), titulo: titulo, afinacao: af, posicao: pos, desenhos: lista, casas: Math.max(5, casasMax + 1) };
  }

  return { ALCANCE: ALCANCE, TIPOS: TIPOS, ORDENS: ORDENS, CROMATICOS: CROMATICOS, cordasPorAltura: cordasPorAltura, naPosicao: naPosicao,
    desenhos: desenhos, desenhosDe: desenhosDe, escalaNaPosicao: escalaNaPosicao, arpejoNaPosicao: arpejoNaPosicao, tresPorCorda: tresPorCorda, cromatico: cromatico, ordenar: ordenar, montar: montar };
});
