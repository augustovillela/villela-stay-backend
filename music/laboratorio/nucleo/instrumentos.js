// =====================================================================
// Musique · Laboratório — NÚCLEO · instrumentos de corda, afinações e
// extensões.
//
// O braço é CALCULADO: nota da corda solta + casas. Nenhuma imagem de
// braço é desenhada à mão. Afinação nova = uma linha; instrumento novo
// de trastes = uma entrada. As digitações de ACORDE continuam no motor
// das cifras (`cifras/motor/instrumentos.js`), que já as calcula da
// teoria; aqui o problema é outro: onde cada nota está no braço.
//
// Extensões de instrumentos e vozes são REFERÊNCIA aproximada. Varia com
// o instrumento, o músico e a escola — e extensão vocal NÃO é
// classificação de voz nem diagnóstico (dito na página).
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./notas'));
  else (raiz.MusiqueLab = raiz.MusiqueLab || {}).instrumentos = fabrica(raiz.MusiqueLab.notas);
})(typeof self !== 'undefined' ? self : this, function (N) {
  'use strict';

  // Cordas da mais GRAVE para a mais aguda (no ukulele padrão a 4ª corda
  // é sol4: afinação reentrante — a "mais grave" no desenho não é a nota
  // mais grave).
  var CORDAS = {
    violao: { nome: 'violão', casas: 19, afinacoes: {
      padrao: { nome: 'padrão (mi lá ré sol si mi)', notas: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
      'drop-d': { nome: 'Drop D (ré lá ré sol si mi)', notas: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
      dadgad: { nome: 'DADGAD', notas: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
      'open-g': { nome: 'Open G (sol aberto)', notas: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
      'open-d': { nome: 'Open D (ré aberto)', notas: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] },
      'open-c': { nome: 'Open C (dó aberto)', notas: ['C2', 'G2', 'C3', 'G3', 'C4', 'E4'] },
      'drop-c': { nome: 'Drop C', notas: ['C2', 'G2', 'C3', 'F3', 'A3', 'D4'] },
      'double-drop-d': { nome: 'Double Drop D', notas: ['D2', 'A2', 'D3', 'G3', 'B3', 'D4'] },
      'meio-tom-abaixo': { nome: 'meio tom abaixo (mi♭)', notas: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
    } },
    'violao-7': { nome: 'violão de 7 cordas', casas: 19, afinacoes: {
      padrao: { nome: '7ª em dó (dó mi lá ré sol si mi)', notas: ['C2', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
      si: { nome: '7ª em si', notas: ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    } },
    guitarra: { nome: 'guitarra', casas: 22, afinacoes: null },   // mesmas afinações do violão
    baixo: { nome: 'contrabaixo elétrico', casas: 20, afinacoes: {
      padrao: { nome: '4 cordas (mi lá ré sol)', notas: ['E1', 'A1', 'D2', 'G2'] },
      'cinco-cordas': { nome: '5 cordas (si mi lá ré sol)', notas: ['B0', 'E1', 'A1', 'D2', 'G2'] },
      'drop-d': { nome: 'Drop D', notas: ['D1', 'A1', 'D2', 'G2'] },
    } },
    ukulele: { nome: 'ukulele', casas: 15, afinacoes: {
      padrao: { nome: 'padrão reentrante (sol dó mi lá)', notas: ['G4', 'C4', 'E4', 'A4'] },
      'sol-grave': { nome: 'sol grave (low G)', notas: ['G3', 'C4', 'E4', 'A4'] },
      baritono: { nome: 'barítono (ré sol si mi)', notas: ['D3', 'G3', 'B3', 'E4'] },
    } },
    cavaquinho: { nome: 'cavaquinho', casas: 17, afinacoes: {
      padrao: { nome: 'padrão (ré sol si ré)', notas: ['D4', 'G4', 'B4', 'D5'] },
      natural: { nome: 'natural (ré sol si mi)', notas: ['D4', 'G4', 'B4', 'E5'] },
    } },
    // bandolim: 4 PARES de cordas afinados em uníssono, em quintas como o violino
    bandolim: { nome: 'bandolim', casas: 17, afinacoes: {
      padrao: { nome: 'padrão (sol ré lá mi, em pares)', notas: ['G3', 'D4', 'A4', 'E5'] },
    } },
  };

  // Sopros: notas de REFERÊNCIA para afinar (altura real, lá4 = 440 Hz).
  // Nos transpositores, "escrita" é a nota como aparece na partitura dele.
  // A gaita diatônica não se afina pelo músico (as palhetas são fixas): as
  // notas servem para CONFERIR e para tocar junto.
  var SOPROS = [
    { id: 'trompete', nome: 'trompete em si♭', timbre: 'metal', transpositor: 'soa uma 2ª maior abaixo do escrito', notas: [{ soa: 'Bb3', escrita: 'C4' }, { soa: 'F4', escrita: 'G4' }, { soa: 'Bb4', escrita: 'C5' }] },
    { id: 'trombone', nome: 'trombone', timbre: 'metal', notas: [{ soa: 'Bb2' }, { soa: 'F3' }, { soa: 'Bb3' }] },
    { id: 'flauta-doce', nome: 'flauta doce soprano', timbre: 'doce', transpositor: 'soa uma oitava acima do escrito', notas: [{ soa: 'C5', escrita: 'C4' }, { soa: 'A5', escrita: 'A4' }, { soa: 'C6', escrita: 'C5' }] },
    { id: 'flauta', nome: 'flauta transversal', timbre: 'flauta', notas: [{ soa: 'A4' }, { soa: 'Bb4' }, { soa: 'C5' }] },
    { id: 'gaita', nome: 'gaita (harmônica diatônica em dó)', timbre: 'palheta', notas: [{ soa: 'C4' }, { soa: 'E4' }, { soa: 'G4' }, { soa: 'C5' }, { soa: 'D4' }, { soa: 'B4' }] },
  ];
  function sopro(id) { for (var i = 0; i < SOPROS.length; i++) if (SOPROS[i].id === id) return SOPROS[i]; return null; }
  CORDAS.guitarra.afinacoes = CORDAS.violao.afinacoes;

  function instrumento(id) { return CORDAS[id] || null; }
  function afinacao(id, afin) {
    var i = instrumento(id);
    if (!i) return null;
    var a = i.afinacoes[afin || 'padrao'];
    return a ? { id: afin || 'padrao', nome: a.nome, notas: a.notas.map(N.ler), midi: a.notas.map(N.midi) } : null;
  }
  /** Afinação personalizada: "D A D G B E" ou "D2 A2 D3 G3 B3 E4". */
  function afinacaoPersonalizada(texto, idBase) {
    var base = afinacao(idBase || 'violao');
    var partes = String(texto || '').trim().split(/[\s,]+/);
    if (!base || partes.length !== base.notas.length) return null;
    var ns = partes.map(function (p, i) {
      var n = N.ler(p);
      if (!n) return null;
      if (n.oitava != null) return n;
      // sem oitava: a mais próxima da corda correspondente da padrão
      var alvo = base.midi[i], melhor = null;
      for (var o = 0; o <= 6; o++) { var c = N.comOitava(n, o); if (!melhor || Math.abs(N.midi(c) - alvo) < Math.abs(N.midi(melhor) - alvo)) melhor = c; }
      return melhor;
    });
    if (ns.some(function (x) { return !x; })) return null;
    return { id: 'personalizada', nome: 'personalizada', notas: ns, midi: ns.map(N.midi) };
  }

  /** MIDI na corda (índice 0 = mais grave no desenho) e casa. */
  function midiNaCasa(afin, corda, casa) { return afin.midi[corda] + Number(casa); }

  /**
   * Todas as posições de um conjunto de classes de altura no braço.
   * Devolve [{ corda, casa, midi, pc }].
   */
  function posicoes(afin, classes, casas) {
    var alvo = {}; (classes || []).forEach(function (p) { alvo[N.mod(p, 12)] = true; });
    var out = [];
    for (var c = 0; c < afin.midi.length; c++) {
      for (var k = 0; k <= (casas || 15); k++) {
        var m = afin.midi[c] + k;
        if (alvo[N.mod(m, 12)]) out.push({ corda: c, casa: k, midi: m, pc: N.mod(m, 12) });
      }
    }
    return out;
  }

  /** Extensão (mais grave e mais aguda) de um instrumento de trastes. */
  function extensaoDeCordas(id, afin) {
    var a = afinacao(id, afin); var i = instrumento(id);
    if (!a) return null;
    return { grave: Math.min.apply(null, a.midi), agudo: Math.max.apply(null, a.midi) + i.casas };
  }

  // Extensões de referência (altura REAL, não escrita). Transpositores:
  // `soa` = intervalo entre o escrito e o que soa.
  var EXTENSOES = [
    { id: 'piano', nome: 'piano', grave: 'A0', agudo: 'C8' },
    { id: 'flauta', nome: 'flauta transversal', grave: 'C4', agudo: 'C7' },
    { id: 'violino', nome: 'violino', grave: 'G3', agudo: 'E7' },
    { id: 'viola', nome: 'viola (de arco)', grave: 'C3', agudo: 'E6' },
    { id: 'violoncelo', nome: 'violoncelo', grave: 'C2', agudo: 'A5' },
    { id: 'contrabaixo-acustico', nome: 'contrabaixo acústico', grave: 'E1', agudo: 'G4', soa: 'uma oitava abaixo do escrito' },
    { id: 'trompete', nome: 'trompete em si♭', grave: 'E3', agudo: 'Bb5', soa: 'segunda maior abaixo do escrito' },
    { id: 'clarinete', nome: 'clarinete em si♭', grave: 'D3', agudo: 'Bb6', soa: 'segunda maior abaixo do escrito' },
    { id: 'sax-alto', nome: 'saxofone alto em mi♭', grave: 'Db3', agudo: 'Ab5', soa: 'sexta maior abaixo do escrito' },
    { id: 'sax-tenor', nome: 'saxofone tenor em si♭', grave: 'Ab2', agudo: 'E5', soa: 'nona maior abaixo do escrito' },
    { id: 'trompa', nome: 'trompa em fá', grave: 'B1', agudo: 'F5', soa: 'quinta justa abaixo do escrito' },
    { id: 'trombone', nome: 'trombone', grave: 'E2', agudo: 'F5' },
    { id: 'violao', nome: 'violão (padrão, 19 casas)', calculado: ['violao', 'padrao'], soa: 'uma oitava abaixo do escrito na clave de sol' },
    { id: 'guitarra', nome: 'guitarra (padrão, 22 casas)', calculado: ['guitarra', 'padrao'], soa: 'uma oitava abaixo do escrito na clave de sol' },
    { id: 'baixo', nome: 'contrabaixo elétrico (4 cordas, 20 casas)', calculado: ['baixo', 'padrao'], soa: 'uma oitava abaixo do escrito na clave de fá' },
    { id: 'ukulele', nome: 'ukulele (padrão, 15 casas)', calculado: ['ukulele', 'padrao'] },
    { id: 'cavaquinho', nome: 'cavaquinho (padrão, 17 casas)', calculado: ['cavaquinho', 'padrao'] },
  ];
  // Vozes: faixas COMUNS em livros de canto coral. Não é diagnóstico nem
  // classificação — classificar voz exige professor e mais que extensão.
  var VOZES = [
    { id: 'soprano', nome: 'soprano', grave: 'C4', agudo: 'A5' },
    { id: 'mezzo', nome: 'mezzo-soprano', grave: 'A3', agudo: 'F5' },
    { id: 'contralto', nome: 'contralto', grave: 'F3', agudo: 'D5' },
    { id: 'tenor', nome: 'tenor', grave: 'C3', agudo: 'A4' },
    { id: 'baritono', nome: 'barítono', grave: 'A2', agudo: 'F4' },
    { id: 'baixo', nome: 'baixo', grave: 'E2', agudo: 'E4' },
  ];

  function extensoes() {
    return EXTENSOES.map(function (e) {
      if (e.calculado) {
        var x = extensaoDeCordas(e.calculado[0], e.calculado[1]);
        return { id: e.id, nome: e.nome, grave: N.deMidi(x.grave), agudo: N.deMidi(x.agudo), soa: e.soa || '' };
      }
      return { id: e.id, nome: e.nome, grave: N.ler(e.grave), agudo: N.ler(e.agudo), soa: e.soa || '' };
    });
  }

  return {
    CORDAS: CORDAS, VOZES: VOZES, SOPROS: SOPROS, sopro: sopro, instrumento: instrumento, afinacao: afinacao, afinacaoPersonalizada: afinacaoPersonalizada,
    midiNaCasa: midiNaCasa, posicoes: posicoes, extensaoDeCordas: extensaoDeCordas, extensoes: extensoes,
  };
});
