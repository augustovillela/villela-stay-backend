// =====================================================================
// Musique Cifras — MOTOR · harmonia. Puro e isomórfico.
//
// Tom provável, graus (romanos e Nashville) e simplificação.
//
// ⚠️ ESTIMATIVA NÃO É CERTEZA. `detectarTom` devolve CANDIDATOS com a
// confiança e o MOTIVO de cada um — e a tela mostra isso como sugestão.
// Cifra de música que modula, empresta acorde ou termina fora da tônica
// engana qualquer contagem; dizer "o tom é Lá" com a mesma voz com que
// se diz a letra seria apresentar palpite como fato.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./nota'), require('./acorde'), require('../../laboratorio/nucleo/tonalidades'));
  else (raiz.MusiqueMotor = raiz.MusiqueMotor || {}).harmonia = fabrica(raiz.MusiqueMotor.nota, raiz.MusiqueMotor.acorde, raiz.MusiqueLab && raiz.MusiqueLab.tonalidades);
})(typeof self !== 'undefined' ? self : this, function (N, A, LT) {
  'use strict';

  // Campo harmônico: grau (semitons da tônica) → qualidade esperada.
  // Derivados do NÚCLEO do Laboratório (tríades empilhadas na escala), com
  // a tabela como reserva quando ele não está carregado.
  var TIPO_LAB = { maior: 'maior', menor: 'menor', dim: 'dim' };
  var PC_LETRA = [0, 2, 4, 5, 7, 9, 11];
  function campoDoNucleo(modo, variantes) {
    var out = {};
    variantes.forEach(function (v) {
      (LT.campo('C', modo, { variante: v }) || []).forEach(function (g) {
        var st = (PC_LETRA[g.fundamental.li] + g.fundamental.alt + 12) % 12;
        var tp = TIPO_LAB[g.acorde]; if (!tp) return;
        if (out[st] === undefined) out[st] = tp; else if (out[st] !== tp && !Array.isArray(out[st])) out[st] = [out[st], tp];
      });
    });
    return out;
  }
  var CAMPO_MAIOR = LT ? campoDoNucleo('maior', ['natural']) : { 0: 'maior', 2: 'menor', 4: 'menor', 5: 'maior', 7: 'maior', 9: 'menor', 11: 'dim' };
  // Menor: natural + harmônica (V maior e vii° são tão comuns quanto v e VII).
  var CAMPO_MENOR = LT ? campoDoNucleo('menor', ['natural', 'harmonica']) : { 0: 'menor', 2: 'dim', 3: 'maior', 5: 'menor', 7: ['menor', 'maior'], 8: 'maior', 10: 'maior', 11: 'dim' };

  function tipoBasico(ac) {
    var q = ac.qualidade;
    if (q === 'menor') return 'menor';
    if (q === 'dim' || q === 'meio-dim') return 'dim';
    if (q === 'aug') return 'aug';
    return 'maior';        // maior, sus, power: a função é a do acorde maior
  }

  function casa(campo, grau, tipo) {
    var esp = campo[grau];
    if (esp === undefined) return 0;
    if (Array.isArray(esp)) return esp.indexOf(tipo) >= 0 ? 1 : 0.3;
    return esp === tipo ? 1 : 0.3;
  }

  /**
   * Candidatos a tom a partir de uma lista de textos de acorde (na ordem
   * em que aparecem). Devolve até 3, do mais provável ao menos.
   */
  function detectarTom(textos, opcoes) {
    var o = opcoes || {};
    var acs = [];
    (textos || []).forEach(function (t) {
      var a = typeof t === 'string' ? A.ler(t, o) : t;
      if (a && a.reconhecido) acs.push(a);
    });
    if (!acs.length) return [];
    var primeiro = acs[0], ultimo = acs[acs.length - 1];
    var cands = [];
    for (var pc = 0; pc < 12; pc++) {
      [false, true].forEach(function (menor) {
        var campo = menor ? CAMPO_MENOR : CAMPO_MAIOR;
        var pontos = 0, dentro = 0;
        acs.forEach(function (a) {
          var g = N.mod12(a.raiz.pc - pc);
          var tp = tipoBasico(a);
          var c = casa(campo, g, tp);
          pontos += c;
          if (c === 1) dentro++;
          if (g === 0 && tp === (menor ? 'menor' : 'maior')) pontos += 0.6;          // tônica
          if (g === 7 && a.setima === 'b7' && tp === 'maior') pontos += 0.5;       // dominante
        });
        var tonica = function (a) { return N.mod12(a.raiz.pc - pc) === 0 && tipoBasico(a) === (menor ? 'menor' : 'maior'); };
        if (tonica(primeiro)) pontos += 1.2;
        if (tonica(ultimo)) pontos += 1.8;
        cands.push({ tom: { pc: pc, menor: menor }, pontos: pontos, dentro: dentro });
      });
    }
    cands.sort(function (a, b) { return b.pontos - a.pontos; });
    var topo = cands[0].pontos || 1;
    var segundo = cands[1] ? cands[1].pontos : 0;
    return cands.slice(0, 3).map(function (c, k) {
      // Confiança: quanto o candidato cobre da cifra E quanto se destaca
      // do seguinte. Relativo maior/menor empatam de verdade às vezes —
      // e a confiança baixa diz isso.
      var cobertura = c.dentro / acs.length;
      var folga = k === 0 ? Math.min(1, (c.pontos - segundo) / Math.max(1, topo) * 4) : 0;
      var conf = Math.round(Math.max(0, Math.min(1, cobertura * 0.7 + folga * 0.3)) * 100) / 100;
      if (k > 0) conf = Math.round(Math.max(0, Math.min(1, cobertura * 0.7 * (c.pontos / topo))) * 100) / 100;
      return {
        tom: c.tom, nome: N.escreverTom(c.tom), confianca: conf,
        motivo: c.dentro + ' de ' + acs.length + ' acordes pertencem ao campo harmônico'
          + (c.tom.menor ? ' menor' : ' maior') + ' de ' + N.escreverTom(c.tom) + '.',
      };
    });
  }

  // ---------------------------------------------------------------
  // Graus
  // ---------------------------------------------------------------
  var ROMANO = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
  var ROMANO_MENOR = ['I', 'bII', 'II', 'III', '#III', 'IV', '#IV', 'V', 'VI', '#VI', 'VII', '#VII'];
  var NASH = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
  var NASH_MENOR = ['1', 'b2', '2', '3', '#3', '4', '#4', '5', '6', '#6', '7', '#7'];

  function sufixoDeFuncao(ac, sistema) {
    var s = '';
    if (ac.qualidade === 'dim') s = ac.setima === 'dim7' ? '°7' : '°';
    else if (ac.qualidade === 'meio-dim') s = 'ø7';
    else if (ac.qualidade === 'aug') s = '+';
    else if (ac.qualidade === 'sus4') s = 'sus4';
    else if (ac.qualidade === 'sus2') s = 'sus2';
    if (ac.qualidade !== 'meio-dim' && ac.setima !== 'dim7') {
      if (ac.setima === 'b7') s += '7';
      else if (ac.setima === '7M') s += (sistema === 'nashville' ? 'Δ74' : 'maj7').replace('Δ74', 'Δ7');
    }
    if (ac.sexta) s += '6';
    return s;
  }

  /**
   * Grau do acorde no tom. `sistema`: 'romano' | 'nashville'.
   * Devolve { texto, grau (semitons), diatonico } ou null.
   */
  /**
   * Função harmônica do grau (em semitons a partir da tônica), como se
   * ensina: tônica (repouso), subdominante (afastamento) e dominante
   * (tensão que pede resolução). Fora do campo, diz que está fora — não
   * inventa função para empréstimo ou dominante secundária.
   */
  var FUNCAO_MAIOR = { 0: 'tônica', 2: 'subdominante', 4: 'tônica (anti-relativa)', 5: 'subdominante', 7: 'dominante', 9: 'tônica (relativa)', 11: 'dominante' };
  var FUNCAO_MENOR = { 0: 'tônica', 2: 'subdominante', 3: 'tônica (relativa)', 5: 'subdominante', 7: 'dominante', 8: 'subdominante', 10: 'dominante (subtônica)', 11: 'dominante' };
  function funcaoDoGrau(g, menor, diatonico) {
    if (!diatonico) return 'fora do campo harmônico (empréstimo ou acorde de passagem)';
    return (menor ? FUNCAO_MENOR : FUNCAO_MAIOR)[g] || '';
  }

  function grau(textoOuAcorde, tom, opcoes) {
    var o = opcoes || {};
    var ac = typeof textoOuAcorde === 'string' ? A.ler(textoOuAcorde, o) : textoOuAcorde;
    if (!ac || !tom) return null;
    var g = N.mod12(ac.raiz.pc - tom.pc);
    var nash = o.sistema === 'nashville';
    var tabela = nash ? (tom.menor ? NASH_MENOR : NASH) : (tom.menor ? ROMANO_MENOR : ROMANO);
    var base = tabela[g];
    var tp = tipoBasico(ac);
    var menorOuDim = tp === 'menor' || tp === 'dim';
    var texto;
    if (nash) texto = base + (tp === 'menor' ? '-' : '') + sufixoDeFuncao(ac, 'nashville');
    else {
      var num = base.replace(/^[b#]/, '');
      var pre = base.slice(0, base.length - num.length);
      texto = pre + (menorOuDim ? num.toLowerCase() : num) + sufixoDeFuncao(ac, 'romano');
    }
    if (ac.baixo) {
      var gb = N.mod12(ac.baixo.pc - tom.pc);
      texto += '/' + (nash ? (tom.menor ? NASH_MENOR : NASH)[gb] : (tom.menor ? NASH_MENOR : NASH)[gb]);
    }
    var campo = tom.menor ? CAMPO_MENOR : CAMPO_MAIOR;
    return { texto: texto, grau: g, diatonico: casa(campo, g, tp) === 1, funcao: funcaoDoGrau(g, !!tom.menor, casa(campo, g, tp) === 1) };
  }

  // ---------------------------------------------------------------
  // Simplificação em níveis
  // ---------------------------------------------------------------
  var NIVEIS = {
    1: 'Sem tensões: tira 9ª, 11ª, 13ª e alterações; mantém sétimas e baixos.',
    2: 'Tríades: tira também sétimas, sextas e inversões.',
    3: 'Básico: só maior, menor e diminuto — para quem está começando.',
  };

  function estiloDe(ac) {
    return /7M|\(|°|^4$|^m?7?\(/.test(ac.sufixo) ? 'br' : 'internacional';
  }

  /**
   * Simplifica um acorde. Devolve { texto, mudou, de }.
   * Acorde não reconhecido NÃO é simplificado: devolver outra coisa no
   * lugar dele seria inventar harmonia.
   */
  function simplificar(texto, nivel, opcoes) {
    var o = opcoes || {};
    var ac = A.ler(texto, o);
    if (!ac || !ac.reconhecido) return { texto: texto, mudou: false, de: texto };
    var n = Math.max(0, Math.min(3, Number(nivel) || 0));
    if (!n) return { texto: texto, mudou: false, de: texto };
    var s = JSON.parse(JSON.stringify(ac));
    s.extensoes = [];
    s.adicionadas = [];
    s.alteracoes = s.alteracoes.filter(function (a) { return a === 'b5' || a === '#5'; });
    if (n >= 2) {
      if (s.qualidade === 'meio-dim') s.qualidade = 'dim';
      if (s.qualidade === 'menor' && s.alteracoes.indexOf('b5') >= 0) s.qualidade = 'dim';
      if (s.qualidade === 'maior' && s.alteracoes.indexOf('#5') >= 0) s.qualidade = 'aug';
      s.alteracoes = [];
      s.setima = null;
      s.sexta = false;
      s.baixo = null;
    }
    if (n >= 3) {
      if (s.qualidade === 'sus2' || s.qualidade === 'sus4' || s.qualidade === 'power' || s.qualidade === 'aug') s.qualidade = 'maior';
    }
    s.intervalos = A.intervalos(s);
    s.sufixo = A.sufixoCanonico(s, estiloDe(ac));
    var novo = A.escrever(s, {});
    var mudou = !A.equivalentes(ac, s) || (ac.baixo && !s.baixo);
    return { texto: mudou ? novo : texto, mudou: !!mudou, de: texto };
  }

  return {
    detectarTom: detectarTom, grau: grau, simplificar: simplificar, NIVEIS: NIVEIS,
    tipoBasico: tipoBasico, CAMPO_MAIOR: CAMPO_MAIOR, CAMPO_MENOR: CAMPO_MENOR,
  };
});
