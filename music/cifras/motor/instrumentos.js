// =====================================================================
// Musique Cifras — MOTOR · instrumentos. Puro e isomórfico.
//
// "Trocar de instrumento" não é trocar a figura. A HARMONIA é a mesma;
// o que cada instrumento recebe é o que serve a ele:
//
//   · violão / guitarra — digitações calculadas (não decoradas), com
//     pestana, dedos sugeridos e nível; guitarra ganha power chord;
//   · cavaquinho / ukulele — quatro cordas, afinação reentrante no
//     ukulele: aqui a nota mais grave NÃO precisa ser a fundamental
//     (esses instrumentos não fazem o baixo) e a quinta pode sair;
//   · teclado — mãos esquerda e direita, inversões e CONDUÇÃO DE VOZES
//     (a inversão escolhida é a que menos move a mão desde o acorde
//     anterior);
//   · contrabaixo — fundamentais no braço, arpejo, graus-alvo e uma
//     linha-guia que aproxima cada troca de acorde.
//
// As formas são CALCULADAS da teoria. Tabela cobriria os trinta acordes
// que alguém teve paciência de digitar e devolveria "não sei" para o
// Bbm7(b5) que apareceu na cifra — que é justamente o que o músico
// precisa ver.
//
// Novo instrumento de trastes (viola caipira, bandolim) = uma entrada
// em INSTRUMENTOS. O algoritmo não muda.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./nota'), require('./acorde'));
  else (raiz.MusiqueMotor = raiz.MusiqueMotor || {}).instrumentos = fabrica(raiz.MusiqueMotor.nota, raiz.MusiqueMotor.acorde);
})(typeof self !== 'undefined' ? self : this, function (N, A) {
  'use strict';

  // MIDI das cordas, da mais GRAVE (no desenho, a da esquerda) para a
  // mais aguda. No ukulele padrão a primeira corda é sol4, mais aguda que
  // a segunda: é a afinação reentrante, e o algoritmo lida com isso.
  var INSTRUMENTOS = {
    violao: {
      nome: 'Violão', tipo: 'trastes', cordasPadrao: 6, casas: 15, janela: 4,
      minSoando: 4, baixoNaFundamental: true, canhoto: true,
      afinacoes: {
        padrao: { nome: 'Padrão (E A D G B E)', cordas: [40, 45, 50, 55, 59, 64] },
        meio_tom_abaixo: { nome: 'Meio tom abaixo (Eb Ab Db Gb Bb Eb)', cordas: [39, 44, 49, 54, 58, 63] },
        drop_d: { nome: 'Drop D (D A D G B E)', cordas: [38, 45, 50, 55, 59, 64] },
        dadgad: { nome: 'DADGAD', cordas: [38, 45, 50, 55, 57, 62] },
        open_g: { nome: 'Sol aberto (D G D G B D)', cordas: [38, 43, 50, 55, 59, 62] },
      },
    },
    guitarra: {
      nome: 'Guitarra', tipo: 'trastes', cordasPadrao: 6, casas: 17, janela: 4,
      minSoando: 4, baixoNaFundamental: true, canhoto: true, powerChord: true, tablatura: true,
      afinacoes: {
        padrao: { nome: 'Padrão (E A D G B E)', cordas: [40, 45, 50, 55, 59, 64] },
        meio_tom_abaixo: { nome: 'Meio tom abaixo', cordas: [39, 44, 49, 54, 58, 63] },
        drop_d: { nome: 'Drop D', cordas: [38, 45, 50, 55, 59, 64] },
      },
    },
    cavaquinho: {
      nome: 'Cavaquinho', tipo: 'trastes', cordasPadrao: 4, casas: 12, janela: 4,
      minSoando: 4, baixoNaFundamental: false, canhoto: true, omiteQuinta: true,
      afinacoes: {
        padrao: { nome: 'Padrão (D G B D)', cordas: [62, 67, 71, 74] },
        dgbe: { nome: 'D G B E', cordas: [62, 67, 71, 76] },
      },
    },
    ukulele: {
      nome: 'Ukulele', tipo: 'trastes', cordasPadrao: 4, casas: 12, janela: 4,
      minSoando: 4, baixoNaFundamental: false, canhoto: true, omiteQuinta: true,
      afinacoes: {
        padrao: { nome: 'Padrão reentrante (G C E A)', cordas: [67, 60, 64, 69] },
        low_g: { nome: 'Sol grave (G C E A)', cordas: [55, 60, 64, 69] },
        baritono: { nome: 'Barítono (D G B E)', cordas: [50, 55, 59, 64] },
      },
    },
    piano: { nome: 'Piano / teclado', tipo: 'teclado', afinacoes: { padrao: { nome: 'Afinação temperada', cordas: [] } } },
    baixo: {
      nome: 'Contrabaixo', tipo: 'baixo', casas: 12, canhoto: true,
      afinacoes: {
        padrao: { nome: '4 cordas (E A D G)', cordas: [28, 33, 38, 43] },
        cinco: { nome: '5 cordas (B E A D G)', cordas: [23, 28, 33, 38, 43] },
      },
    },
  };

  var GRAU_NOME = { 0: '1', 1: 'b9', 2: '9', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5', 8: '#5', 9: '6', 10: 'b7', 11: '7' };

  function catalogo() {
    return Object.keys(INSTRUMENTOS).map(function (k) {
      var i = INSTRUMENTOS[k];
      return { id: k, nome: i.nome, tipo: i.tipo, canhoto: !!i.canhoto,
        afinacoes: Object.keys(i.afinacoes).map(function (a) { return { id: a, nome: i.afinacoes[a].nome, cordas: i.afinacoes[a].cordas }; }) };
    });
  }

  function instrumento(id) {
    var i = INSTRUMENTOS[id];
    if (!i) throw new Error('Instrumento desconhecido: "' + id + '".');
    return i;
  }

  // ---------------------------------------------------------------
  // Notas obrigatórias e opcionais de um acorde para N cordas
  // ---------------------------------------------------------------
  function papelDasNotas(ac, maxNotas, omiteQuinta) {
    var raizPc = ac.raiz.pc;
    var obrig = [], opc = [];
    ac.intervalos.forEach(function (x) {
      var pc = N.mod12(raizPc + x.semi);
      if (x.papel === 'quinta' && (omiteQuinta || ac.intervalos.length > 3)) opc.push(pc);
      else if (x.essencial) obrig.push(pc);
      else opc.push(pc);
    });
    // Mais notas obrigatórias que cordas: sai primeiro a quinta (já
    // opcional), depois a tensão de menor peso (11ª num acorde de 13ª).
    var ordemDeSaida = ['11ª', '9ª', 'add9', 'add11'];
    while (obrig.length > maxNotas) {
      var saiu = false;
      for (var k = 0; k < ordemDeSaida.length && !saiu; k++) {
        for (var z = 0; z < ac.intervalos.length; z++) {
          var it = ac.intervalos[z];
          if (it.papel === ordemDeSaida[k]) {
            var pc2 = N.mod12(raizPc + it.semi);
            var ix = obrig.indexOf(pc2);
            if (ix >= 0) { obrig.splice(ix, 1); opc.push(pc2); saiu = true; break; }
          }
        }
      }
      if (!saiu) break;
    }
    return { obrigatorias: obrig, opcionais: opc };
  }

  // ---------------------------------------------------------------
  // Trastes
  // ---------------------------------------------------------------
  var memo = {};

  /**
   * Digitações de um acorde num instrumento de trastes.
   * opcoes: { afinacao, quantas, canhoto }
   */
  function formas(cifra, idInstrumento, opcoes) {
    var o = opcoes || {};
    var inst = instrumento(idInstrumento || 'violao');
    if (inst.tipo !== 'trastes') throw new Error(inst.nome + ' não usa digitação de trastes.');
    var af = inst.afinacoes[o.afinacao || 'padrao'] || inst.afinacoes.padrao;
    var cordas = o.cordas || af.cordas;
    var quantas = o.quantas || 4;
    var chaveMemo = idInstrumento + '|' + cordas.join(',') + '|' + cifra + '|' + quantas;
    if (memo[chaveMemo]) return memo[chaveMemo];

    var ac = A.ler(cifra, { latina: o.latina });
    if (!ac) return { cifra: cifra, formas: [], motivo: 'Não reconheci "' + cifra + '" como acorde.' };
    if (!ac.reconhecido) {
      return { cifra: cifra, formas: [], motivo: 'Sei ler a fundamental de "' + cifra + '", mas não o resto do acorde. A transposição continua funcionando.' };
    }
    var power = ac.qualidade === 'power';
    var notas = papelDasNotas(ac, cordas.length, !!inst.omiteQuinta);
    var todas = notas.obrigatorias.concat(notas.opcionais);
    if (ac.baixo && todas.indexOf(ac.baixo.pc) < 0) { todas.push(ac.baixo.pc); notas.obrigatorias.push(ac.baixo.pc); }
    var baixoPc = ac.baixo ? ac.baixo.pc : ac.raiz.pc;
    var exigeBaixo = inst.baixoNaFundamental || !!ac.baixo && cordas.length > 4;
    var minSoando = power ? 2 : Math.min(inst.minSoando, cordas.length);

    var achadas = [];
    var vistas = {};
    for (var base = 0; base <= inst.casas - 1; base++) {
      buscar(cordas, todas, notas.obrigatorias, baixoPc, exigeBaixo, minSoando, base, inst.janela, power, ac)
        .forEach(function (f) { var k = f.casas.join(','); if (!vistas[k]) { vistas[k] = 1; achadas.push(f); } });
      if (achadas.length > 120) break;
    }
    achadas.sort(function (a, b) { return a.dificuldade - b.dificuldade; });
    var escolhidas = achadas.slice(0, quantas).map(function (f) {
      // Nível pelo que a MÃO sente: sem pestana, perto da pestana do braço e
      // com até três dedos é o acorde aberto que se ensina primeiro.
      f.nivel = !f.pestana && f.posicao <= 3 && f.dedos <= 3 ? 'fácil'
        : f.posicao <= 7 && f.dedos <= 4 && f.dificuldade <= 20 ? 'intermediária' : 'avançada';
      f.dedos_sugeridos = sugerirDedos(f);
      f.graus = f.casas.map(function (c, i) { return c < 0 ? '' : GRAU_NOME[N.mod12(cordas[i] + c - ac.raiz.pc)] || ''; });
      return f;
    });
    var r = {
      cifra: cifra, instrumento: idInstrumento, afinacao: o.afinacao || 'padrao', cordas: cordas,
      fundamental: N.nome(ac.raiz.pc), notas: A.notas(ac).map(function (pc) { return N.nome(pc); }),
      formas: escolhidas,
      motivo: escolhidas.length ? '' : 'Não achei uma digitação tocável para este acorde nesta afinação.',
    };
    memo[chaveMemo] = r;
    return r;
  }

  function buscar(cordas, notas, obrig, baixoPc, exigeBaixo, minSoando, base, janela, power, ac) {
    var opcoes = cordas.map(function (aberta) {
      var lista = [-1];
      if (notas.indexOf(N.mod12(aberta)) >= 0 && base <= 1) lista.push(0);
      for (var c = Math.max(1, base); c <= base + janela - 1; c++) {
        if (notas.indexOf(N.mod12(aberta + c)) >= 0) lista.push(c);
      }
      return lista;
    });
    var saida = [];
    var atual = new Array(cordas.length);
    (function combinar(i) {
      if (saida.length > 30) return;
      if (i === cordas.length) {
        var f = avaliar(cordas, atual, notas, obrig, baixoPc, exigeBaixo, minSoando, janela, power);
        if (f) saida.push(f);
        return;
      }
      for (var k = 0; k < opcoes[i].length; k++) { atual[i] = opcoes[i][k]; combinar(i + 1); }
    })(0);
    return saida;
  }

  function avaliar(cordas, casas, notas, obrig, baixoPc, exigeBaixo, minSoando, janela, power) {
    var soando = [];
    for (var i = 0; i < cordas.length; i++) if (casas[i] >= 0) soando.push({ i: i, midi: cordas[i] + casas[i] });
    if (soando.length < minSoando) return null;
    // Corda muda NO MEIO das que soam não se toca limpo.
    var primeiro = soando[0].i, ultimo = soando[soando.length - 1].i;
    for (i = primeiro; i <= ultimo; i++) if (casas[i] < 0) return null;
    // Power chord de guitarra: só nas cordas graves, sem as agudas soltas.
    if (power && soando.length > 3) return null;
    var pcs = {};
    soando.forEach(function (x) { pcs[N.mod12(x.midi)] = 1; });
    for (var k = 0; k < obrig.length; k++) if (!pcs[obrig[k]]) return null;
    if (exigeBaixo) {
      var maisGrave = soando.reduce(function (a, b) { return b.midi < a.midi ? b : a; });
      if (N.mod12(maisGrave.midi) !== baixoPc) return null;
    }
    var presas = casas.filter(function (c) { return c > 0; });
    var menor = presas.length ? Math.min.apply(null, presas) : 0;
    var maior = presas.length ? Math.max.apply(null, presas) : 0;
    var estica = maior - menor;
    if (estica > janela - 1 + (menor >= 5 ? 1 : 0)) return null;

    // PESTANA: o dedo deitado na casa `menor` cobre as cordas entre a
    // primeira e a última presas nela; nada ali pode estar solto nem
    // abaixo dela.
    var naMenor = [];
    casas.forEach(function (c, z) { if (c === menor && c > 0) naMenor.push(z); });
    var pestana = null;
    // Pestana só quando os dedos NÃO bastam (5+ notas presas). O ré aberto
    // (xx0232) tem duas notas na casa 2 e se toca com três dedos — chamar
    // isso de pestana classificava como difícil o acorde do primeiro dia.
    if (naMenor.length >= 2 && presas.length > 4) {
      var de = naMenor[0], ate = naMenor[naMenor.length - 1], valida = true;
      for (var z = de; z <= ate; z++) if (casas[z] === 0 || (casas[z] > 0 && casas[z] < menor)) valida = false;
      if (valida) pestana = { casa: menor, de: de, ate: ate };
    }
    var dedos = pestana ? 1 + presas.filter(function (c) { return c > pestana.casa; }).length : presas.length;
    if (dedos > 4) return null;

    var mudasGrave = 0, mudasAgudo = 0;
    casas.forEach(function (c, z) { if (c < 0) { if (z < primeiro) mudasGrave++; else mudasAgudo++; } });
    var abertas = casas.filter(function (c) { return c === 0; }).length;
    return {
      casas: casas.slice(),
      desenho: casas.map(function (c) { return c < 0 ? 'x' : c > 9 ? '(' + c + ')' : String(c); }).join(''),
      posicao: menor || 0,
      pestana: pestana,
      dedos: dedos,
      cordas_mudas: mudasGrave + mudasAgudo,
      soltas: abertas,
      notas: soando.map(function (x) { return N.nome(x.midi); }),
      // Corda solta soando junto de casa 4+ é forma rara (a mão estica da
      // pestana do braço até lá) — o músico espera a pestana no lugar.
      dificuldade: dedos * 2 + estica * 2 + mudasGrave * 1.5 + mudasAgudo * 3 + (menor || 0)
        + (pestana ? 2 : 0) - (abertas && !pestana ? 0.5 : 0) + (abertas && maior >= 4 ? 3 * abertas : 0),
    };
  }

  /** Dedo sugerido por corda (0 = solta/muda; 1 indicador … 4 mínimo). */
  function sugerirDedos(f) {
    var dedos = f.casas.map(function () { return 0; });
    var livres = [];
    f.casas.forEach(function (c, i) {
      if (c <= 0) return;
      if (f.pestana && c === f.pestana.casa && i >= f.pestana.de && i <= f.pestana.ate) { dedos[i] = 1; return; }
      livres.push({ i: i, c: c });
    });
    livres.sort(function (a, b) { return a.c - b.c || a.i - b.i; });
    var prox = f.pestana ? 2 : 1;
    var base = f.pestana ? f.pestana.casa : (livres.length ? livres[0].c : 1);
    livres.forEach(function (x) {
      // o dedo acompanha a casa: casa + 1 à frente da pestana = dedo 2...
      var ideal = Math.min(4, Math.max(prox, 1 + (x.c - base) + (f.pestana ? 1 : 0)));
      dedos[x.i] = ideal;
      prox = Math.min(4, ideal + (ideal === prox ? 1 : 0));
    });
    return dedos;
  }

  // ---------------------------------------------------------------
  // Teclado
  // ---------------------------------------------------------------
  /**
   * Voicing de teclado. `anterior` (mão direita do acorde anterior)
   * liga a CONDUÇÃO DE VOZES: entre as inversões possíveis, escolhe a
   * que menos move os dedos.
   */
  function teclado(cifra, opcoes) {
    var o = opcoes || {};
    var ac = A.ler(cifra, { latina: o.latina });
    if (!ac) return { cifra: cifra, erro: 'Não reconheci "' + cifra + '" como acorde.' };
    var pcs = ac.intervalos.map(function (x) { return N.mod12(ac.raiz.pc + x.semi); });
    // Mão direita com no máximo 4 notas: sai a quinta justa, depois a raiz
    // (que já está na esquerda).
    var direita = pcs.slice();
    if (direita.length > 4) direita = direita.filter(function (pc, k) { return !(ac.intervalos[k].papel === 'quinta'); });
    if (direita.length > 4) direita = direita.filter(function (pc) { return pc !== ac.raiz.pc; });
    var baixoPc = ac.baixo ? ac.baixo.pc : ac.raiz.pc;
    var esquerda = [36 + N.mod12(baixoPc - 0)];
    if (esquerda[0] < 40) esquerda[0] += 12;
    if (!ac.baixo && ac.qualidade !== 'power') esquerda.push(esquerda[0] + 12);

    var inversoes = [];
    for (var inv = 0; inv < direita.length; inv++) {
      var ordem = direita.slice(inv).concat(direita.slice(0, inv));
      var notas = [], ult = 59;
      ordem.forEach(function (pc) {
        var m = ult + 1;
        while (N.mod12(m) !== pc) m++;
        notas.push(m); ult = m;
      });
      inversoes.push({ inversao: inv, notas: notas });
    }
    var escolhida = inversoes[0];
    if (o.anterior && o.anterior.length) {
      var custo = function (ns) {
        var a = o.anterior.slice().sort(function (x, y) { return x - y; });
        var b = ns.slice().sort(function (x, y) { return x - y; });
        var soma = 0;
        for (var k = 0; k < Math.max(a.length, b.length); k++) soma += Math.abs((a[Math.min(k, a.length - 1)]) - (b[Math.min(k, b.length - 1)]));
        return soma;
      };
      // considera cada inversão uma oitava acima e abaixo também
      var todas = [];
      inversoes.forEach(function (x) {
        [-12, 0, 12].forEach(function (d) { todas.push({ inversao: x.inversao, notas: x.notas.map(function (m) { return m + d; }) }); });
      });
      todas = todas.filter(function (x) { return x.notas[0] >= 52 && x.notas[x.notas.length - 1] <= 84; });
      todas.sort(function (x, y) { return custo(x.notas) - custo(y.notas); });
      escolhida = todas[0] || escolhida;
      escolhida.movimento = custo(escolhida.notas);
    }
    var nomes = function (ns) { return ns.map(function (m) { return N.nome(m) + (Math.floor(m / 12) - 1); }); };
    return {
      cifra: cifra, mao_esquerda: esquerda, mao_direita: escolhida.notas,
      nomes_esquerda: nomes(esquerda), nomes_direita: nomes(escolhida.notas),
      inversao: escolhida.inversao, movimento: escolhida.movimento === undefined ? null : escolhida.movimento,
      inversoes: inversoes.map(function (x) { return { inversao: x.inversao, notas: x.notas, nomes: nomes(x.notas) }; }),
      fundamental: N.nome(ac.raiz.pc),
    };
  }

  /** Sequência de voicings de teclado com condução de vozes. */
  function tecladoProgressao(cifras, opcoes) {
    var ant = null;
    return (cifras || []).map(function (c) {
      var v = teclado(c, { anterior: ant, latina: opcoes && opcoes.latina });
      if (v.mao_direita) ant = v.mao_direita;
      return v;
    });
  }

  // ---------------------------------------------------------------
  // Contrabaixo
  // ---------------------------------------------------------------
  function baixo(cifra, opcoes) {
    var o = opcoes || {};
    var inst = instrumento('baixo');
    var cordas = (inst.afinacoes[o.afinacao || 'padrao'] || inst.afinacoes.padrao).cordas;
    var ac = A.ler(cifra, { latina: o.latina });
    if (!ac) return { cifra: cifra, erro: 'Não reconheci "' + cifra + '" como acorde.' };
    var alvo = ac.baixo ? ac.baixo.pc : ac.raiz.pc;
    var posicoes = [];
    cordas.forEach(function (aberta, i) {
      for (var c = 0; c <= inst.casas; c++) if (N.mod12(aberta + c) === alvo) posicoes.push({ corda: i, casa: c });
    });
    posicoes.sort(function (a, b) { return a.casa - b.casa || a.corda - b.corda; });
    var arpejo = ac.intervalos.slice().sort(function (a, b) { return a.semi - b.semi; })
      .map(function (x) { return { grau: GRAU_NOME[x.semi], nota: N.nome(ac.raiz.pc + x.semi), papel: x.papel }; });
    var graus = arpejo.filter(function (x) { return /fundamental|terça|quinta|sétima/.test(x.papel); });
    return { cifra: cifra, fundamental: N.nome(ac.raiz.pc), nota_do_baixo: N.nome(alvo), posicoes: posicoes.slice(0, 6),
      arpejo: arpejo, graus_alvo: graus, cordas: cordas };
  }

  /**
   * Linha-guia de baixo: por acorde, fundamental no tempo 1, quinta no 3
   * e, no 4, a nota de APROXIMAÇÃO da próxima fundamental (um semitom
   * abaixo). É guia de estudo, não arranjo — e a tela diz isso.
   */
  function linhaGuia(cifras, opcoes) {
    var acs = (cifras || []).map(function (c) { return A.ler(c, opcoes); });
    return acs.map(function (ac, i) {
      if (!ac) return { cifra: cifras[i], notas: [] };
      var r = ac.baixo ? ac.baixo.pc : ac.raiz.pc;
      var quinta = ac.intervalos.filter(function (x) { return /quinta/.test(x.papel); })[0];
      var prox = acs[i + 1];
      var aprox = prox ? N.mod12((prox.baixo ? prox.baixo.pc : prox.raiz.pc) - 1) : r;
      return { cifra: cifras[i], notas: [N.nome(r), N.nome(r), quinta ? N.nome(r + quinta.semi) : N.nome(r), N.nome(aprox)] };
    });
  }

  // ---------------------------------------------------------------
  // Capotraste inteligente
  // ---------------------------------------------------------------
  /**
   * Alternativas de capotraste para uma lista de acordes (o SOM não
   * muda; muda a forma que a mão faz). Pontua a facilidade das formas
   * resultantes e penaliza capo alto (braço apertado, timbre fino).
   */
  function sugerirCapotraste(cifras, opcoes) {
    var o = opcoes || {};
    var id = o.instrumento || 'violao';
    var inst = instrumento(id);
    if (inst.tipo !== 'trastes') return [];
    var cont = {};
    (cifras || []).forEach(function (c) { cont[c] = (cont[c] || 0) + 1; });
    var distintos = Object.keys(cont);
    if (!distintos.length) return [];
    var out = [];
    for (var capo = 0; capo <= (o.maxCapo || 7); capo++) {
      var soma = 0, peso = 0, faceis = 0, semForma = 0;
      var trocas = [];
      distintos.forEach(function (c) {
        var ac = A.ler(c, { latina: o.latina });
        var forma = ac ? A.escrever(ac, { semitons: -capo, bemol: false }) : c;
        trocas.push({ de: c, para: forma });
        var f = formas(forma, id, { afinacao: o.afinacao, quantas: 1, latina: o.latina });
        var d = f.formas.length ? f.formas[0].dificuldade : 30;
        if (!f.formas.length) semForma++;
        if (f.formas.length && f.formas[0].nivel === 'fácil') faceis++;
        soma += d * cont[c]; peso += cont[c];
      });
      var media = soma / peso + capo * 0.35;
      out.push({ capo: capo, dificuldade: Math.round(media * 10) / 10, faceis: faceis, total: distintos.length,
        sem_forma: semForma, formas: trocas });
    }
    out.sort(function (a, b) { return a.dificuldade - b.dificuldade; });
    return out.slice(0, o.quantas || 4);
  }

  return {
    INSTRUMENTOS: INSTRUMENTOS, catalogo: catalogo, instrumento: instrumento,
    formas: formas, teclado: teclado, tecladoProgressao: tecladoProgressao, baixo: baixo, linhaGuia: linhaGuia,
    sugerirCapotraste: sugerirCapotraste, papelDasNotas: papelDasNotas,
  };
});
