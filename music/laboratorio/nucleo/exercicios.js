// =====================================================================
// Musique · Laboratório — NÚCLEO · exercícios.
//
// Determinístico por SEMENTE: (tipo, nível, semente, versão) gera sempre
// a mesma questão. Por isso o servidor não confia na correção do
// navegador — refaz a questão pela semente e corrige de novo antes de
// gravar progresso. E uma tentativa antiga continua explicável depois
// que o catálogo mudar: a VERSAO entra na tentativa.
//
// Feedback nunca é só "errado": diz o esperado, o respondido, POR QUE
// diferem, e qual referência revisar.
//
// GRAFIA × ALTURA: quando o exercício mede leitura/grafia (nota na
// pauta, construção de intervalo), fá# e sol♭ são respostas diferentes.
// Quando mede o ouvido ou o teclado, são a mesma resposta. O campo
// `mede` decide, e a explicação diz qual foi o caso.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('./notas'), require('./intervalos'), require('./escalas'), require('./acordes'),
      require('./tonalidades'), require('./ritmo'), require('./pauta'), require('./instrumentos'));
  } else {
    var L = raiz.MusiqueLab = raiz.MusiqueLab || {};
    L.exercicios = fabrica(L.notas, L.intervalos, L.escalas, L.acordes, L.tonalidades, L.ritmo, L.pauta, L.instrumentos);
  }
})(typeof self !== 'undefined' ? self : this, function (N, I, E, A, T, R, P, INS) {
  'use strict';

  var VERSAO = 1;

  function prng(semente) {
    var a = typeof semente === 'number' ? semente >>> 0 : hashStr(String(semente));
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function escolher(r, lista) { return lista[Math.floor(r() * lista.length)]; }
  function embaralhar(r, lista) { var a = lista.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function inteiro(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }

  function nPt(n) { return N.nome(n, { notacao: 'pt', glifo: true, oitava: false }); }
  function nCif(n) { return N.nome(n, { oitava: false }); }

  /** Monta opções únicas: a certa + distratores (pelo `valor`). */
  function opcoes(r, certa, distratores, quantas, prioritarios) {
    var vistos = {}; var out = [];
    [certa].concat(prioritarios || [], embaralhar(r, distratores)).forEach(function (o) { if (o && !vistos[o.valor] && out.length < (quantas || 4)) { vistos[o.valor] = 1; out.push(o); } });
    return embaralhar(r, out);
  }

  // ------------------------------------------------------------------
  // Geradores
  // ------------------------------------------------------------------
  var TIPOS = {};

  TIPOS['nota-na-pauta'] = {
    nome: 'Nota na pauta', habilidade: 'leitura', mede: 'grafia', niveis: ['notas naturais dentro da pauta', 'com linhas suplementares', 'com acidentes'],
    gerar: function (r, nivel, p) {
      var clave = p.clave || escolher(r, nivel >= 3 ? ['sol', 'fa', 'do3'] : ['sol', 'fa']);
      var pos = nivel === 1 ? inteiro(r, 0, 8) : inteiro(r, -4, 12);
      var nat = P.naturalNaPosicao(pos, clave);
      var alt = nivel >= 3 ? escolher(r, [-1, 0, 0, 1]) : 0;
      var n = { li: nat.li, alt: alt, oitava: nat.oitava };
      var certa = { valor: nCif(n), rotulo: nPt(n) };
      var dis = [];
      [-2, -1, 1, 2].forEach(function (d) { var x = P.naturalNaPosicao(pos + d, clave); dis.push({ li: x.li, alt: alt, oitava: x.oitava }); });
      if (alt) dis.push({ li: n.li, alt: -alt, oitava: n.oitava }, { li: n.li, alt: 0, oitava: n.oitava });
      return {
        enunciado: 'Que nota é esta?', visual: { tipo: 'pauta', clave: clave, notas: [{ nota: N.nome(n) }] },
        opcoes: opcoes(r, certa, dis.map(function (x) { return { valor: nCif(x), rotulo: nPt(x) }; })),
        resposta: nCif(n), mede: 'grafia',
        explicar: function () {
          var c = P.clave(clave), pp = P.posicao(n, clave);
          return 'Na ' + c.nome + ', a referência é ' + c.referencia + '. A nota está na ' + P.nomeDaPosicao(pp.posicao)
            + (alt ? ', com ' + (alt > 0 ? 'sustenido' : 'bemol') + ' antes da cabeça' : '') + ': é ' + nPt(n) + ' (' + N.nome(n, { glifo: true }) + ').';
        },
        revisar: { rotulo: 'Pauta e claves', url: '/music/referencia/pauta-e-claves' },
      };
    },
  };

  var IV_NIVEL = [['2M', '3M', '3m', '4J', '5J', '8J'], ['2m', '2M', '3m', '3M', '4J', '4A', '5d', '5J', '6m', '6M', '7m', '7M', '8J'],
    ['2m', '2M', '2A', '3m', '3M', '3d', '4J', '4A', '4d', '5d', '5J', '5A', '6m', '6M', '6A', '7m', '7M', '7d', '8J']];
  var RAIZES_IV = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B3', 'Bb3', 'Eb4', 'F#4', 'Ab4', 'C#4'];

  TIPOS['intervalo-identificar'] = {
    nome: 'Intervalo na pauta', habilidade: 'intervalos', mede: 'grafia', niveis: ['maiores, menores e justos comuns', 'todos os simples', 'com aumentados e diminutos'],
    gerar: function (r, nivel) {
      var lista = IV_NIVEL[Math.min(nivel, 3) - 1], a, b, iv;
      for (var t = 0; t < 30; t++) { a = N.ler(escolher(r, nivel === 1 ? ['C4', 'D4', 'E4', 'F4', 'G4', 'A4'] : RAIZES_IV)); iv = I.ler(escolher(r, lista)); b = I.construir(a, iv); if (b && Math.abs(b.alt) <= 1) break; }
      var certa = { valor: iv.curto, rotulo: iv.nome };
      var dis = lista.filter(function (x) { return x !== iv.curto; }).map(function (x) { var y = I.ler(x); return { valor: y.curto, rotulo: y.nome }; });
      // distrator enarmônico primeiro: é o erro que a questão existe para pegar
      var mesmos = I.porSemitons(iv.semitons).filter(function (y) { return y.curto !== iv.curto && y.numero <= 8; }).map(function (y) { return { valor: y.curto, rotulo: y.nome }; });
      return {
        enunciado: 'Qual é o intervalo entre as duas notas?', visual: { tipo: 'pauta', clave: 'sol', notas: [{ nota: N.nome(a) }, { nota: N.nome(b) }] },
        audio: { midis: [N.midi(a), N.midi(b)], modo: 'melodico' },
        opcoes: opcoes(r, certa, dis, 4, mesmos.slice(0, 1)), resposta: iv.curto, mede: 'grafia',
        explicar: function () {
          return 'Conte as LETRAS de ' + nPt(a) + ' a ' + nPt(b) + ' (inclusive): ' + iv.numero + ' → é uma ' + I.NUMEROS[iv.numero]
            + '. Depois conte os SEMITONS: ' + iv.semitons + '. Numa ' + I.NUMEROS[iv.numero] + ', ' + iv.semitons + ' semitons dão ' + iv.nome + '.';
        },
        revisar: { rotulo: iv.nome, url: '/music/intervalos/' + iv.slug },
      };
    },
  };

  TIPOS['intervalo-construir'] = {
    nome: 'Construa o intervalo', habilidade: 'intervalos', mede: 'grafia', niveis: ['comuns', 'todos os simples', 'com aumentados e diminutos'],
    gerar: function (r, nivel) {
      var lista = IV_NIVEL[Math.min(nivel, 3) - 1], a, b, iv;
      for (var t = 0; t < 30; t++) { a = N.ler(escolher(r, RAIZES_IV)); iv = I.ler(escolher(r, lista)); b = I.construir(a, iv); if (b && Math.abs(b.alt) <= 1) break; }
      var certa = { valor: nCif(b), rotulo: nPt(b) };
      var dis = N.enarmonicos(b).filter(function (x) { return !N.mesmaGrafia(x, b); }).map(function (x) { return { valor: nCif(x), rotulo: nPt(x) }; });
      [-1, 1].forEach(function (d) { var x = { li: b.li, alt: b.alt + d, oitava: null }; if (Math.abs(x.alt) <= 2) dis.push({ valor: nCif(x), rotulo: nPt(x) }); });
      var viz = I.construir(a, iv.numero > 2 ? (iv.numero - 1) + (JUST(iv.numero - 1) ? 'J' : 'M') : '3M');
      if (viz) dis.push({ valor: nCif(viz), rotulo: nPt(viz) });
      return {
        enunciado: 'Qual nota fica uma ' + iv.nome + ' acima de ' + nPt(a) + '?', visual: { tipo: 'pauta', clave: 'sol', notas: [{ nota: N.nome(a) }] },
        opcoes: opcoes(r, certa, dis), resposta: nCif(b), mede: 'grafia',
        explicar: function () {
          return 'Uma ' + I.NUMEROS[iv.numero] + ' acima de ' + nPt(a) + ' cai na letra ' + N.PT[b.li] + ' (conte ' + iv.numero + ' letras). Para ser '
            + iv.nome + ' são ' + iv.semitons + ' semitons, e o acidente ajusta: ' + nPt(b) + '. Uma nota de mesmo som com outra letra seria OUTRO intervalo.';
        },
        revisar: { rotulo: iv.nome, url: '/music/intervalos/' + iv.slug },
      };
    },
  };
  function JUST(n) { return { 1: 1, 4: 1, 5: 1, 8: 1 }[I.simples(n)] === 1; }

  var IV_OUVIDO = [[0, 12, 7, 5, 4, 3], [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]];
  var NOME_OUVIDO = { 0: '1J', 1: '2m', 2: '2M', 3: '3m', 4: '3M', 5: '4J', 6: '4A', 7: '5J', 8: '6m', 9: '6M', 10: '7m', 11: '7M', 12: '8J' };

  TIPOS['intervalo-ouvido'] = {
    nome: 'Intervalo de ouvido', habilidade: 'percepcao', mede: 'altura', auditivo: true, niveis: ['uníssono, oitava, quinta, quarta e terças', 'todos os simples ascendentes', 'ascendentes, descendentes e harmônicos'],
    gerar: function (r, nivel) {
      var semi = escolher(r, IV_OUVIDO[Math.min(nivel, 3) - 1]);
      var base = inteiro(r, 55, 67);
      var modo = nivel >= 3 ? escolher(r, ['melodico', 'descendente', 'harmonico']) : 'melodico';
      var iv = I.ler(NOME_OUVIDO[semi]);
      var midis = modo === 'descendente' ? [base + semi, base] : [base, base + semi];
      var certa = { valor: iv.curto, rotulo: iv.nome };
      var dis = IV_OUVIDO[Math.min(nivel, 3) - 1].map(function (s) { var y = I.ler(NOME_OUVIDO[s]); return { valor: y.curto, rotulo: y.nome }; });
      return {
        enunciado: 'Ouça e diga o intervalo' + (modo === 'harmonico' ? ' (as duas notas juntas)' : modo === 'descendente' ? ' (descendo)' : '') + '.',
        visual: { tipo: 'nenhum' }, audio: { midis: midis, modo: modo === 'harmonico' ? 'harmonico' : 'melodico' },
        opcoes: opcoes(r, certa, dis, 6), resposta: iv.curto, mede: 'altura', auditivo: true,
        explicar: function () {
          return 'Eram ' + semi + ' semitons entre ' + N.nome(N.deMidi(midis[0]), { notacao: 'pt', glifo: true }) + ' e ' + N.nome(N.deMidi(midis[1]), { notacao: 'pt', glifo: true })
            + ': ' + iv.nome + '. Aqui vale a ALTURA (o som), não a grafia — uma quarta aumentada e uma quinta diminuta são o mesmo som.';
        },
        mostrar: { tipo: 'piano', midis: midis },
        revisar: { rotulo: iv.nome, url: '/music/intervalos/' + iv.slug },
      };
    },
  };

  var AC_NIVEL = [['maior', 'menor'], ['maior', 'menor', 'dim', 'aum', 'sus4', 'sus2'], ['7', 'm7', '7M', 'm7b5', 'dim7', 'm7M', '6', 'm6']];

  TIPOS['acorde-identificar'] = {
    nome: 'Nome do acorde', habilidade: 'acordes', mede: 'grafia', niveis: ['tríades maiores e menores', 'tríades e suspensos', 'tétrades'],
    gerar: function (r, nivel) {
      var lista = AC_NIVEL[Math.min(nivel, 3) - 1], f, id, ns;
      for (var t = 0; t < 30; t++) { f = N.ler(escolher(r, ['C4', 'D4', 'E4', 'F4', 'G4', 'A3', 'Bb3', 'Eb4', 'Ab3', 'F#4', 'B3', 'Db4'])); id = escolher(r, lista); ns = A.notas(f, id); if (ns && ns.every(function (x) { return Math.abs(x.alt) <= 1; })) break; }
      var certa = { valor: A.simbolo(f, id), rotulo: A.simbolo(f, id) };
      var dis = lista.concat(AC_NIVEL[Math.min(nivel, 3) - 1 === 0 ? 1 : 0]).filter(function (x) { return x !== id; }).map(function (x) { return { valor: A.simbolo(f, x), rotulo: A.simbolo(f, x) }; });
      return {
        enunciado: 'Que acorde é este?', visual: { tipo: 'pauta', clave: 'sol', acorde: true, notas: ns.map(function (x) { return { nota: N.nome(x) }; }) },
        audio: { midis: ns.map(N.midi), modo: 'harmonico' }, opcoes: opcoes(r, certa, dis), resposta: A.simbolo(f, id), mede: 'grafia',
        explicar: function () {
          return 'A nota de baixo, ' + nPt(f) + ', é a fundamental. Os intervalos a partir dela são ' + A.intervalos(id).slice(1).join(', ')
            + ' — a fórmula do acorde ' + A.porId(id).nome + ' (' + A.porId(id).formula + ').';
        },
        revisar: { rotulo: 'Acorde ' + A.simbolo(f, id), url: '/music/acordes/' + N.slug(f) + '/' + encodeURIComponent(id) },
      };
    },
  };

  var AC_OUVIDO = [['maior', 'menor'], ['maior', 'menor', 'dim', 'aum'], ['maior', 'menor', 'dim', 'aum', '7', 'm7', '7M']];

  TIPOS['acorde-ouvido'] = {
    nome: 'Acorde de ouvido', habilidade: 'percepcao', mede: 'altura', auditivo: true, niveis: ['maior × menor', 'as quatro tríades', 'tríades e tétrades'],
    gerar: function (r, nivel) {
      var lista = AC_OUVIDO[Math.min(nivel, 3) - 1];
      var id = escolher(r, lista);
      var base = inteiro(r, 53, 64);
      var midis = A.semitons(id).map(function (s) { return base + s; });
      var certa = { valor: id, rotulo: A.porId(id).nome };
      return {
        enunciado: 'Ouça o acorde. Qual a qualidade?', visual: { tipo: 'nenhum' }, audio: { midis: midis, modo: 'harmonico', arpejo: nivel === 1 },
        opcoes: opcoes(r, certa, lista.map(function (x) { return { valor: x, rotulo: A.porId(x).nome }; }), 7), resposta: id, mede: 'altura', auditivo: true,
        explicar: function () {
          return 'Era um acorde ' + A.porId(id).nome + ': ' + A.intervalos(id).slice(1).join(', ') + ' a partir da fundamental. '
            + (id === 'maior' ? 'A terça maior embaixo e a quinta justa dão a cor "aberta".' : id === 'menor' ? 'A terça menor é a diferença para o maior — só uma nota muda.' : 'Compare com o maior tocando os dois em seguida.');
        },
        mostrar: { tipo: 'piano', midis: midis },
        revisar: { rotulo: 'Fórmulas de acordes', url: '/music/referencia/formulas-de-acordes' },
      };
    },
  };

  var ES_NIVEL = [['maior', 'menor-natural', 'pentatonica-maior', 'pentatonica-menor'], ['maior', 'dorico', 'frigio', 'lidio', 'mixolidio', 'menor-natural', 'locrio'],
    ['menor-harmonica', 'menor-melodica', 'blues-menor', 'maior-harmonica', 'lidio-dominante', 'alterada', 'tons-inteiros', 'frigio-dominante']];

  TIPOS['escala-identificar'] = {
    nome: 'Qual é a escala?', habilidade: 'escalas', mede: 'grafia', niveis: ['maior, menor e pentatônicas', 'os sete modos', 'harmônica, melódica, blues e outras'],
    gerar: function (r, nivel) {
      var lista = ES_NIVEL[Math.min(nivel, 3) - 1], t, id, ns;
      for (var k = 0; k < 30; k++) { t = N.ler(escolher(r, ['C4', 'D4', 'E4', 'F4', 'G4', 'A3', 'Bb3', 'Eb4'])); id = escolher(r, lista); ns = E.notas(t, id); if (ns && ns.every(function (x) { return Math.abs(x.alt) <= 1; })) break; }
      var nomeEsc = function (x) { return nPt(t) + ' ' + E.porId(x).nome; };
      return {
        enunciado: 'Que escala é esta?', visual: { tipo: 'pauta', clave: 'sol', notas: ns.map(function (x) { return { nota: N.nome(x) }; }) },
        audio: { midis: ns.map(N.midi).concat([N.midi(t) + 12]), modo: 'melodico' },
        opcoes: opcoes(r, { valor: id, rotulo: nomeEsc(id) }, lista.map(function (x) { return { valor: x, rotulo: nomeEsc(x) }; })), resposta: id, mede: 'grafia',
        explicar: function () { return 'A sequência de tons e semitons é ' + E.passos(id).join(' ') + ' — a da escala ' + E.porId(id).nome + ' (fórmula ' + E.porId(id).formula + ').'; },
        revisar: { rotulo: nomeEsc(id), url: '/music/escalas/' + N.slug(t) + '/' + id },
      };
    },
  };

  TIPOS['armadura-identificar'] = {
    nome: 'Armadura de clave', habilidade: 'tonalidades', mede: 'grafia', niveis: ['até 3 acidentes (maior)', 'até 7 acidentes (maior)', 'maior ou menor, até 7'],
    gerar: function (r, nivel) {
      var max = nivel === 1 ? 3 : 7;
      var q = inteiro(r, -max, max);
      var tons = T.daArmadura(q);
      var menor = nivel >= 3 && r() < 0.5;
      var ton = menor ? tons.menor : tons.maior;
      var modo = menor ? 'menor' : 'maior';
      var certa = { valor: T.slug(ton, modo), rotulo: T.nome(ton, modo) };
      var dis = [];
      [-2, -1, 1, 2].forEach(function (d) { var x = T.daArmadura(q + d); if (x) { var tt = menor ? x.menor : x.maior; dis.push({ valor: T.slug(tt, modo), rotulo: T.nome(tt, modo) }); } });
      var rel = T.relativa(ton, modo); dis.push({ valor: T.slug(rel.tonica, rel.modo), rotulo: T.nome(rel.tonica, rel.modo) });
      return {
        enunciado: 'Que tonalidade ' + (menor ? 'MENOR' : 'MAIOR') + ' tem esta armadura?', visual: { tipo: 'pauta', clave: 'sol', armadura: q, notas: [] },
        opcoes: opcoes(r, certa, dis), resposta: T.slug(ton, modo), mede: 'grafia',
        explicar: function () {
          if (!q) return 'Sem acidentes: dó maior ou lá menor.';
          var ult = T.armadura(tons.maior, 'maior').acidentes.slice(-1)[0];
          var regra = q > 0 ? 'O último sustenido (' + nPt(ult) + ') é a sensível: meio tom acima dele está a tônica maior, ' + nPt(tons.maior) + '.'
            : (q === -1 ? 'Um bemol (si♭) é fá maior.' : 'O penúltimo bemol é a tônica maior: ' + nPt(tons.maior) + '.');
          return regra + (menor ? ' A menor relativa fica uma terça menor abaixo: ' + nPt(tons.menor) + ' menor.' : '');
        },
        revisar: { rotulo: 'Armaduras e círculo de quintas', url: '/music/explorar/circulo-de-quintas' },
      };
    },
  };

  TIPOS['nota-no-teclado'] = {
    nome: 'Ache a nota no teclado', habilidade: 'teclado', mede: 'altura', entrada: 'piano', niveis: ['notas naturais', 'com sustenidos e bemóis', 'com enarmônicos incomuns (mi#, dó♭)'],
    gerar: function (r, nivel) {
      var li = inteiro(r, 0, 6);
      var alt = nivel === 1 ? 0 : escolher(r, [-1, 0, 1]);
      if (nivel >= 3 && r() < 0.4) { var inc = escolher(r, [{ li: 2, alt: 1 }, { li: 0, alt: -1 }, { li: 6, alt: 1 }, { li: 3, alt: -1 }]); li = inc.li; alt = inc.alt; }
      var n = { li: li, alt: alt, oitava: null };
      return {
        enunciado: 'Toque o ' + nPt(n) + ' (' + nCif(n) + ') no teclado.', visual: { tipo: 'piano', de: 48, ate: 71, interativo: true },
        resposta: String(N.pc(n)), mede: 'altura', entrada: 'piano',
        explicar: function () {
          return nPt(n) + ' é a tecla ' + (N.pc(n) in { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 } ? 'preta' : 'branca')
            + (alt ? ' meio tom ' + (alt > 0 ? 'acima' : 'abaixo') + ' de ' + N.PT[li] : '') + '. No teclado vale a tecla (o som): qualquer oitava serve.';
        },
        revisar: { rotulo: 'Piano e notas', url: '/music/explorar/piano' },
      };
    },
  };

  TIPOS['campo-grau'] = {
    nome: 'Campo harmônico', habilidade: 'harmonia', mede: 'grafia', niveis: ['tríades em tons maiores', 'tétrades em tons maiores', 'tons menores (V da harmônica)'],
    gerar: function (r, nivel) {
      var menor = nivel >= 3;
      var ton = N.ler(escolher(r, menor ? ['A', 'E', 'D', 'G', 'C', 'B'] : ['C', 'G', 'D', 'F', 'Bb', 'A', 'E', 'Eb']));
      var modo = menor ? 'menor' : 'maior';
      var c = menor ? T.realizar(ton, 'menor', [1, 2, 3, 4, 5, 6, 7], { tetrades: false }) : T.campo(ton, modo, { tetrades: nivel === 2 });
      var g = inteiro(r, 2, 7);
      var alvo = c[g - 1];
      var dis = c.filter(function (x) { return x.simbolo !== alvo.simbolo; }).map(function (x) { return { valor: x.simbolo, rotulo: x.simbolo }; });
      var outraQ = A.simbolo(alvo.fundamental, alvo.acorde === 'menor' ? 'maior' : alvo.acorde === 'maior' ? 'menor' : 'maior');
      dis.unshift({ valor: outraQ, rotulo: outraQ });
      return {
        enunciado: 'Em ' + T.nome(ton, modo) + ', qual é o acorde do ' + g + 'º grau (' + alvo.romano + ')?', visual: { tipo: 'nenhum' },
        opcoes: opcoes(r, { valor: alvo.simbolo, rotulo: alvo.simbolo }, dis), resposta: alvo.simbolo, mede: 'grafia',
        explicar: function () {
          return 'Empilhando terças na escala de ' + T.nome(ton, modo) + ' a partir do ' + g + 'º grau: ' + alvo.notas.map(nPt).join(' – ') + ' = ' + alvo.simbolo
            + ' (' + alvo.romano + ', função ' + alvo.funcao + ')' + (menor && g === 5 ? '. No menor, o V usa a sensível da menor harmônica.' : '.');
        },
        revisar: { rotulo: 'Campo harmônico de ' + T.nome(ton, modo), url: '/music/tonalidades/' + T.slug(ton, modo) },
      };
    },
  };

  var FIG_RIT = ['minima', 'seminima', 'colcheia', 'semicolcheia'];

  TIPOS['ritmo-completar'] = {
    nome: 'Complete o compasso', habilidade: 'ritmo', mede: 'grafia', niveis: ['compassos simples', 'com figuras pontuadas', 'compostos (6/8, 9/8)'],
    gerar: function (r, nivel) {
      // A RESPOSTA vem primeiro; o resto do compasso é preenchido para
      // fechar a conta EXATA. (A versão anterior sorteava o compasso e
      // procurava a resposta depois — e às vezes não achava, e inventava.)
      var comp = R.compasso(nivel >= 3 ? escolher(r, ['6/8', '9/8', '3/8']) : escolher(r, ['2/4', '3/4', '4/4']));
      var dur = function (c) { return R.duracao(c.f, { pontos: c.p }); };
      var candidatos = [];
      FIG_RIT.forEach(function (f) { candidatos.push({ f: f, p: 0 }); if (nivel >= 2 && f !== 'semicolcheia') candidatos.push({ f: f, p: 1 }); });
      var cabem = function (lim) { return candidatos.filter(function (c) { return R.comparar(dur(c), lim) <= 0; }); };
      var certa = escolher(r, candidatos.filter(function (c) { return R.comparar(dur(c), comp.capacidade) < 0; }));
      var resto = R.sub(comp.capacidade, dur(certa));
      var itens = [];
      while (resto.n > 0) {
        var ops = cabem(resto);
        // prefere as maiores (o compasso não vira uma fila de semicolcheias)
        ops.sort(function (a, b) { return R.comparar(dur(b), dur(a)); });
        var c = ops[Math.min(ops.length - 1, Math.floor(r() * Math.min(3, ops.length)))];
        itens.push(c); resto = R.sub(resto, dur(c));
      }
      itens = embaralhar(r, itens);
      var falta = dur(certa);
      var rot = function (c) { return R.FIG[c.f].nome + (c.p ? ' pontuada' : ''); };
      var val = function (c) { return c.f + (c.p ? '.' : ''); };
      var dis = FIG_RIT.concat(['semibreve']).map(function (f) { return { f: f, p: 0 }; }).concat([{ f: 'seminima', p: 1 }, { f: 'minima', p: 1 }, { f: 'colcheia', p: 1 }])
        .map(function (c) { return { valor: val(c), rotulo: rot(c) }; });
      return {
        enunciado: 'Em ' + comp.texto + ', que figura completa o compasso?',
        visual: { tipo: 'ritmo', compasso: comp.texto, figuras: itens.map(function (c) { return { figura: c.f, pontos: c.p }; }) },
        opcoes: opcoes(r, { valor: val(certa), rotulo: rot(certa) }, dis), resposta: val(certa), mede: 'grafia',
        explicar: function () {
          var soma = itens.map(function (c) { return rot(c) + ' (' + R.texto(R.duracao(c.f, { pontos: c.p })) + ')'; }).join(' + ') || 'nada';
          return 'O compasso ' + comp.texto + ' comporta ' + R.texto(comp.capacidade) + ' de semibreve. Já há ' + soma + ' = ' + R.texto(R.somaDuracoes(itens.map(function (c) { return R.duracao(c.f, { pontos: c.p }); })))
            + '. Falta ' + R.texto(falta) + ': ' + rot(certa) + '.';
        },
        revisar: { rotulo: 'Figuras e compassos', url: '/music/referencia/figuras-e-compassos' },
      };
    },
  };

  TIPOS['nota-no-braco'] = {
    nome: 'Nota no braço', habilidade: 'instrumentos', mede: 'altura', niveis: ['cordas soltas e casas 1–3', 'até a casa 7', 'até a casa 12'],
    gerar: function (r, nivel, p) {
      var inst = p.instrumento || 'violao';
      var af = INS.afinacao(inst, 'padrao');
      var corda = inteiro(r, 0, af.midi.length - 1);
      var casa = inteiro(r, 0, [3, 7, 12][Math.min(nivel, 3) - 1]);
      var m = af.midi[corda] + casa;
      var n = N.deMidi(m, { bemol: r() < 0.5 });
      var certa = { valor: String(N.mod(m, 12)), rotulo: nPt(n) + (n.alt ? ' / ' + nPt(N.enarmonicos(n).filter(function (x) { return !N.mesmaGrafia(x, n) && Math.abs(x.alt) === 1; })[0] || n) : '') };
      var dis = [-2, -1, 1, 2, 5].map(function (d) { var x = N.deMidi(m + d); return { valor: String(N.mod(m + d, 12)), rotulo: nPt(x) }; });
      return {
        enunciado: 'Que nota é esta no braço do ' + INS.instrumento(inst).nome + '?',
        visual: { tipo: 'braco', instrumento: inst, casas: Math.max(5, [5, 7, 12][Math.min(nivel, 3) - 1]), destaques: [{ corda: corda, casa: casa, rotulo: '?' }] },
        audio: { midis: [m], modo: 'melodico' }, opcoes: opcoes(r, certa, dis), resposta: String(N.mod(m, 12)), mede: 'altura',
        explicar: function () {
          return 'A corda solta é ' + nPt(af.notas[corda]) + '; cada casa sobe meio tom. ' + casa + ' casa(s) acima: ' + certa.rotulo + '.';
        },
        revisar: { rotulo: 'Braço do ' + INS.instrumento(inst).nome, url: '/music/explorar/braco' },
      };
    },
  };

  // ------------------------------------------------------------------
  // API
  // ------------------------------------------------------------------
  function gerar(tipo, opcoesGerar) {
    var t = TIPOS[tipo];
    if (!t) return null;
    var o = opcoesGerar || {};
    var nivel = Math.max(1, Math.min(t.niveis.length, Number(o.nivel) || 1));
    var semente = o.semente == null ? Math.floor(Math.random() * 1e9) : o.semente;
    var q = t.gerar(prng(tipo + '|' + nivel + '|' + semente + '|' + VERSAO), nivel, o.params || {});
    q.tipo = tipo; q.nivel = nivel; q.semente = semente; q.versao = VERSAO; q.habilidade = t.habilidade; q.nome = t.nome;
    return q;
  }

  /** Versão da questão que pode ir ao navegador (sem funções). */
  function publica(q) {
    var out = {};
    Object.keys(q).forEach(function (k) { if (typeof q[k] !== 'function') out[k] = q[k]; });
    return out;
  }

  /** Corrige: compara pelo que o exercício MEDE, e explica. */
  function corrigir(q, resposta) {
    var r = String(resposta == null ? '' : resposta).trim();
    var certo;
    if (q.entrada === 'piano') {
      var m = Number(r);
      certo = Number.isFinite(m) && N.mod(m, 12) === Number(q.resposta);
    } else if (q.tipo === 'nota-na-pauta' || q.tipo === 'intervalo-construir') {
      certo = N.mesmaGrafia(r, q.resposta);
      var mesmaAlt = !certo && N.mesmaAltura(r, q.resposta);
      if (mesmaAlt) q._enarmonico = true;
    } else certo = r === String(q.resposta);
    var rotuloDe = function (v) {
      var o = (q.opcoes || []).filter(function (x) { return x.valor === v; })[0];
      if (o) return o.rotulo;
      var n = N.ler(v); return n && n.oitava == null ? nPt(n) : v;
    };
    var recebido = q.entrada === 'piano' && r !== '' ? N.nome(N.deMidi(Number(r)), { notacao: 'pt', glifo: true }) : rotuloDe(r);
    var expl = q.explicar();
    if (!certo && q._enarmonico) expl = 'Mesmo SOM, grafia diferente: ' + recebido + ' e ' + rotuloDe(q.resposta) + ' soam igual, mas este exercício mede a grafia. ' + expl;
    return { certo: !!certo, esperado: rotuloDe(q.resposta), recebido: recebido, explicacao: expl, revisar: q.revisar, mede: q.mede, mostrar: q.mostrar || null };
  }

  var LISTA = Object.keys(TIPOS).map(function (k) { return { id: k, nome: TIPOS[k].nome, habilidade: TIPOS[k].habilidade, mede: TIPOS[k].mede, auditivo: !!TIPOS[k].auditivo, niveis: TIPOS[k].niveis }; });

  return { VERSAO: VERSAO, TIPOS: TIPOS, LISTA: LISTA, prng: prng, gerar: gerar, publica: publica, corrigir: corrigir };
});
