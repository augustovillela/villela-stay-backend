// =====================================================================
// Musique Cifras — MOTOR · acorde. Puro e isomórfico (Node + navegador).
//
// O parser entende o acorde INTEIRO — qualidade, sétima, tensões,
// alterações, suspensão, omissões e baixo —, e não só "a nota da frente
// e um sufixo qualquer". Isso é o que permite simplificar, montar
// digitação para seis instrumentos e comparar duas cifras pela HARMONIA
// e não pela grafia.
//
// TRÊS REGRAS QUE MANDAM AQUI:
//
//   1. TRANSPOR NÃO REESCREVE O SUFIXO. A fundamental e o baixo mudam; o
//      resto viaja byte a byte ("Am7(9)" vira "Bm7(9)", nunca "Bm9"). O
//      músico escreveu daquele jeito por um motivo, e a transposição não
//      é lugar de normalizar.
//
//   2. CONVENÇÃO BRASILEIRA É PADRÃO. Em cifra brasileira "C9" é dó com
//      nona ADICIONADA (sem sétima), "C7M" é sétima maior e "E4" é
//      suspenso. Na convenção internacional "C9" tem sétima. O padrão é
//      a brasileira, porque é a que o nosso músico lê; a ambiguidade fica
//      REGISTRADA no acorde, para a tela poder avisar.
//
//   3. O QUE NÃO SE ENTENDE NÃO SE ESTRAGA. Acorde com sufixo exótico
//      continua transponível pela fundamental e sai marcado
//      `reconhecido: false`. Texto que nem começa com nota não é acorde.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./nota'));
  else (raiz.MusiqueMotor = raiz.MusiqueMotor || {}).acorde = fabrica(raiz.MusiqueMotor.nota);
})(typeof self !== 'undefined' ? self : this, function (N) {
  'use strict';

  // Intervalo (em semitons a partir da fundamental) de cada grau nomeado.
  var GRAU = { 2: 2, 4: 5, 6: 9, 9: 2, 11: 5, 13: 9 };
  var ALTERACAO = { b5: 6, '#5': 8, b9: 1, '#9': 3, '#11': 6, b13: 8 };

  // Tokens que aparecem em linha de cifra e não são acorde, mas também
  // não são letra: "N.C." (sem acorde), barras de compasso, repetição.
  var RE_ESPECIAL = /^(N\.?C\.?|%|\|+|\|:|:\||\|\||x\d+|\d+x|\(\d+x\)|\d+ ?vezes|\/|-|\.\.\.?|\*)$/i;

  function especial(tok) { return RE_ESPECIAL.test(String(tok || '').trim()); }

  // ---------------------------------------------------------------
  // Leitura
  // ---------------------------------------------------------------
  /**
   * Lê um acorde. `opcoes.latina`: 'auto' | true | false (padrão false:
   * a detecção de notação é por DOCUMENTO, em `detectarNotacao`).
   * `opcoes.convencao`: 'br' (padrão) | 'internacional'.
   * Devolve null quando o texto não é acorde.
   */
  function ler(texto, opcoes) {
    var o = opcoes || {};
    var bruto = String(texto == null ? '' : texto).trim();
    if (!bruto || bruto.length > 40) return null;

    // Acorde entre parênteses inteiro: "(Am)" = opcional / de passagem.
    var envolto = false;
    var miolo = bruto;
    if (/^\(.+\)$/.test(miolo) && miolo.indexOf('(', 1) < 0) { envolto = true; miolo = miolo.slice(1, -1).trim(); }
    // Marca de rodapé comum em cifra copiada ("C*"): sai, mas é lembrada.
    var marca = '';
    var mm = miolo.match(/^(.*?)(\*+)$/);
    if (mm && mm[1]) { miolo = mm[1]; marca = mm[2]; }

    var cab = N.lerCabeca(miolo, o.latina === undefined ? false : o.latina);
    if (!cab) return null;

    // Separa o baixo: a ÚLTIMA barra fora de parênteses cujo lado
    // direito é uma nota. "C6/9" não tem baixo; "D/F#" tem.
    var corpo = miolo.slice(cab.tamanho);
    var baixo = null;
    var nivel = 0;
    for (var i = corpo.length - 1; i >= 0; i--) {
      var ch = corpo[i];
      if (ch === ')') nivel++;
      else if (ch === '(') nivel--;
      else if (ch === '/' && nivel === 0) {
        var dir = corpo.slice(i + 1);
        var b = N.lerCabeca(dir, o.latina === undefined ? false : o.latina);
        if (b && b.tamanho === dir.length) {
          baixo = { pc: b.pc, texto: dir };
          corpo = corpo.slice(0, i);
        }
        break;
      }
    }

    // "Cb5" é ambíguo com "C(b5)"? Não: a cabeça já consumiu o bemol como
    // acidente da nota (dó bemol + "5" = power chord de dó bemol). É o que
    // o padrão de cifra diz, e quem quer quinta diminuta escreve "C(b5)".
    var est = analisarSufixo(corpo, o.convencao || 'br');
    var ac = {
      texto: bruto,
      raiz: { pc: cab.pc, texto: miolo.slice(0, cab.tamanho) },
      latina: !!cab.latina,
      sufixo: corpo,
      baixo: baixo,
      envolto: envolto,
      marca: marca,
      qualidade: est.qualidade,
      setima: est.setima,
      sexta: est.sexta,
      extensoes: est.extensoes,
      adicionadas: est.adicionadas,
      alteracoes: est.alteracoes,
      omitidas: est.omitidas,
      reconhecido: est.reconhecido,
      desconhecido: est.desconhecido,
      ambiguidades: est.ambiguidades,
    };
    ac.intervalos = intervalos(ac);
    return ac;
  }

  function analisarSufixo(sufixo, convencao) {
    var r = {
      qualidade: 'maior', setima: null, sexta: false, extensoes: [], adicionadas: [],
      alteracoes: [], omitidas: [], reconhecido: true, desconhecido: '', ambiguidades: [],
    };
    var s = String(sufixo || '')
      .replace(/\s+/g, '')
      .replace(/[Δ∆△]/g, 'maj')     // Δ ∆ △
      .replace(/[°º]/g, 'dim')            // ° º
      .replace(/[øØ]/g, 'hdim')           // ø Ø
      .replace(/♭/g, 'b').replace(/♯/g, '#')
      .replace(/[–−]/g, '-');
    var i = 0;
    var inicio = true;         // ainda na posição da QUALIDADE
    var dentro = 0;            // profundidade de parênteses
    var emParenteses = false;

    function tenta(re) {
      var m = s.slice(i).match(re);
      if (!m) return null;
      i += m[0].length;
      return m;
    }
    function ext(n, implicarSetima) {
      if (implicarSetima && !r.setima && convencao === 'internacional') r.setima = 'b7';
      if (implicarSetima && !r.setima && convencao === 'br') {
        // "C9" na convenção brasileira: nona ADICIONADA, sem sétima.
        r.adicionadas.push(n);
        if (n !== 9) r.ambiguidades.push('"' + n + '" sem sétima: lido como adicionada (convenção brasileira).');
        else r.ambiguidades.push('"9" sem sétima: lido como nona adicionada (convenção brasileira).');
        return;
      }
      if (r.extensoes.indexOf(n) < 0) r.extensoes.push(n);
    }

    while (i < s.length) {
      var c = s[i];
      if (c === '(') { dentro++; emParenteses = true; i++; continue; }
      if (c === ')') { dentro = Math.max(0, dentro - 1); i++; continue; }
      if (c === ',' || (c === '/' && dentro > 0)) { i++; continue; }
      if (c === '/' && dentro === 0 && /^\/(9|11|13)/.test(s.slice(i))) { i++; continue; }  // 6/9

      var m;
      if (inicio) {
        inicio = false;
        if ((m = tenta(/^hdim7?/))) { r.qualidade = 'meio-dim'; r.setima = 'b7'; continue; }
        if ((m = tenta(/^(maj|Maj|MAJ|ma)(7|9|11|13)?/))) {
          r.setima = '7M';
          if (m[2] && m[2] !== '7') ext(Number(m[2]), false);
          continue;
        }
        if ((m = tenta(/^M(7|9|11|13)/))) { r.setima = '7M'; if (m[1] !== '7') ext(Number(m[1]), false); continue; }
        if ((m = tenta(/^M(?![a-z])/))) continue;                          // "CM" = dó maior
        if ((m = tenta(/^(min|mi|m|-)(?!aj)/))) { r.qualidade = 'menor'; continue; }
        if ((m = tenta(/^(dim|o(?!mit))(7)?/))) {
          r.qualidade = 'dim';
          if (m[2]) r.setima = 'dim7';
          continue;
        }
        if ((m = tenta(/^(aug|\+)(?![0-9])/))) { r.qualidade = 'aug'; continue; }
        if ((m = tenta(/^5(?![0-9])/))) {
          if (i >= s.length) { r.qualidade = 'power'; continue; }
          i -= 1;                                   // "5" seguido de algo: deixa o laço decidir
        }
      }

      if ((m = tenta(/^(7M|7maj|7Maj|7\+(?![0-9]))/))) {
        if (m[1] === '7+' && convencao !== 'br') { r.setima = 'b7'; r.alteracoes.push('#5'); continue; }
        if (m[1] === '7+') r.ambiguidades.push('"7+" lido como sétima maior (convenção brasileira); fora do Brasil significa quinta aumentada.');
        r.setima = '7M'; continue;
      }
      if ((m = tenta(/^(maj|Maj|MAJ|M)(7|9|11|13)/))) {            // "mM7", "m(maj7)"
        r.setima = '7M'; if (m[2] !== '7') ext(Number(m[2]), false); continue;
      }
      if ((m = tenta(/^maj/))) { r.setima = '7M'; continue; }
      if ((m = tenta(/^sus(2|4|9)?/))) {
        r.qualidade = m[1] === '2' || m[1] === '9' ? 'sus2' : 'sus4';
        continue;
      }
      if ((m = tenta(/^add(2|4|6|9|11|13)/))) {
        var nAdd = Number(m[1]);
        if (r.adicionadas.indexOf(nAdd) < 0) r.adicionadas.push(nAdd);
        continue;
      }
      if ((m = tenta(/^(omit|no)(3|5)/))) { r.omitidas.push(Number(m[2])); continue; }
      if ((m = tenta(/^(b|#)(5|9|11|13)/))) { pushUnico(r.alteracoes, m[1] + m[2]); continue; }
      if ((m = tenta(/^-(5|9|13)/))) { pushUnico(r.alteracoes, 'b' + m[1]); continue; }
      if ((m = tenta(/^\+(5|9|11)/))) { pushUnico(r.alteracoes, '#' + m[1]); continue; }
      if ((m = tenta(/^(aug|\+)/))) { r.qualidade = 'aug'; continue; }
      if ((m = tenta(/^(dim|o(?!mit))/))) { r.qualidade = 'dim'; continue; }
      if ((m = tenta(/^(69|6(?=\/9))/))) {
        r.sexta = true; pushUnico(r.adicionadas, 9);
        if (m[1] === '6') i += 2;                                   // consome "/9"
        continue;
      }
      if ((m = tenta(/^(13|11|9|7|6|5|4|2)/))) {
        var n = Number(m[1]);
        if (n === 7) { r.setima = r.qualidade === 'dim' ? 'dim7' : (r.setima === '7M' ? '7M' : 'b7'); continue; }
        if (n === 6) { r.sexta = true; continue; }
        if (n === 5) {
          if (!r.setima && !r.extensoes.length && r.qualidade === 'maior') { r.qualidade = 'power'; continue; }
          continue;                                                // "(5)" redundante
        }
        if (n === 4) {
          // "C4" e "C7(4)": suspensão. Em parênteses COM terça explícita
          // seria 11ª — mas cifra popular não escreve assim.
          r.qualidade = 'sus4'; continue;
        }
        if (n === 2) {
          pushUnico(r.adicionadas, 9);
          r.ambiguidades.push('"2" lido como nona adicionada (com terça).');
          continue;
        }
        // 9, 11, 13: dentro de parênteses é tensão SOBRE o que já existe;
        // fora, depende da convenção.
        if (emParenteses && dentro > 0) {
          if (!r.setima && convencao === 'br') pushUnico(r.adicionadas, n);
          else pushUnico(r.extensoes, n);
        } else {
          ext(n, true);
        }
        continue;
      }
      // Não reconheceu o resto. Guarda, e para: o acorde continua
      // transponível pela fundamental.
      r.reconhecido = false;
      r.desconhecido = s.slice(i);
      break;
    }
    r.extensoes.sort(function (a, b) { return a - b; });
    return r;
  }

  function pushUnico(lista, v) { if (lista.indexOf(v) < 0) lista.push(v); }

  /** Intervalos (semitons a partir da fundamental), com a função de cada um. */
  function intervalos(ac) {
    var out = [];
    function add(semi, papel, essencial) {
      semi = N.mod12(semi);
      for (var k = 0; k < out.length; k++) if (out[k].semi === semi) {
        out[k].essencial = out[k].essencial || essencial; return;
      }
      out.push({ semi: semi, papel: papel, essencial: !!essencial });
    }
    add(0, 'fundamental', true);
    var q = ac.qualidade;
    var tiraTerca = ac.omitidas.indexOf(3) >= 0;
    var tiraQuinta = ac.omitidas.indexOf(5) >= 0;
    if (!tiraTerca) {
      if (q === 'maior' || q === 'aug') add(4, 'terça', true);
      else if (q === 'menor' || q === 'dim' || q === 'meio-dim') add(3, 'terça', true);
      else if (q === 'sus2') add(2, 'suspensão', true);
      else if (q === 'sus4') add(5, 'suspensão', true);
    }
    var altQuinta = ac.alteracoes.indexOf('b5') >= 0 ? 6 : (ac.alteracoes.indexOf('#5') >= 0 ? 8 : null);
    if (!tiraQuinta) {
      if (altQuinta != null) add(altQuinta, 'quinta alterada', true);
      else if (q === 'dim' || q === 'meio-dim') add(6, 'quinta diminuta', true);
      else if (q === 'aug') add(8, 'quinta aumentada', true);
      else add(7, 'quinta', q === 'power');
    }
    if (ac.setima === 'b7') add(10, 'sétima', true);
    else if (ac.setima === '7M') add(11, 'sétima maior', true);
    else if (ac.setima === 'dim7') add(9, 'sétima diminuta', true);
    if (ac.sexta) add(9, 'sexta', true);
    var mais = ac.extensoes.slice().sort(function (a, b) { return b - a; })[0];
    ac.extensoes.forEach(function (e) { add(GRAU[e], e + 'ª', e === mais); });
    ac.adicionadas.forEach(function (e) { add(GRAU[e] != null ? GRAU[e] : 0, 'add' + e, true); });
    ac.alteracoes.forEach(function (a) {
      if (a === 'b5' || a === '#5') return;
      add(ALTERACAO[a], a, true);
    });
    return out;
  }

  /** Classes de altura do acorde (inclui o baixo). */
  function notas(ac) {
    var pcs = ac.intervalos.map(function (x) { return N.mod12(ac.raiz.pc + x.semi); });
    if (ac.baixo && pcs.indexOf(ac.baixo.pc) < 0) pcs.push(ac.baixo.pc);
    return pcs;
  }

  // ---------------------------------------------------------------
  // Escrita
  // ---------------------------------------------------------------
  /**
   * Reescreve o acorde. `semitons` transpõe. `estilo`:
   *   'original'      — mantém o sufixo como o músico escreveu (padrão);
   *   'br'            — normaliza para a cifra brasileira (C7M, Am7(9));
   *   'internacional' — normaliza para a internacional (Cmaj7, Am9).
   */
  function escrever(ac, opcoes) {
    var o = opcoes || {};
    var n = Number(o.semitons) || 0;
    var bemol = !!o.bemol;
    var latina = o.latina === undefined ? ac.latina : !!o.latina;
    // Sem transposição e sem grafia pedida, a nota fica como foi escrita
    // (normalizar o sufixo não é motivo para trocar Eb por D#).
    var manter = n === 0 && o.bemol === undefined && o.latina === undefined;
    var raiz = manter ? ac.raiz.texto : N.nome(ac.raiz.pc + n, { bemol: bemol, latina: latina });
    var suf = !o.estilo || o.estilo === 'original' || !ac.reconhecido ? ac.sufixo : sufixoCanonico(ac, o.estilo);
    var baixo = !ac.baixo ? '' : '/' + (manter ? ac.baixo.texto : N.nome(ac.baixo.pc + n, { bemol: bemol, latina: latina }));
    var t = raiz + suf + baixo + (ac.marca || '');
    return ac.envolto ? '(' + t + ')' : t;
  }

  function sufixoCanonico(ac, estilo) {
    var br = estilo === 'br';
    var q = ac.qualidade;
    var tensoes = [];
    ac.extensoes.forEach(function (e) { tensoes.push(String(e)); });
    ac.alteracoes.forEach(function (a) { tensoes.push(a); });
    var adds = ac.adicionadas.slice();

    if (q === 'power') return '5';
    var base = '';
    if (q === 'menor') base = 'm';
    else if (q === 'dim') base = ac.setima === 'dim7' ? (br ? '°7' : 'dim7') : (br ? '°' : 'dim');
    else if (q === 'meio-dim') {
      base = br ? 'm7(b5)' : 'm7b5';
      tensoes = tensoes.filter(function (t) { return t !== 'b5'; });
    } else if (q === 'aug') base = br ? '+' : 'aug';

    var set = '';
    if (q !== 'meio-dim' && ac.setima !== 'dim7') {
      if (ac.setima === 'b7') set = '7';
      else if (ac.setima === '7M') set = br ? '7M' : (q === 'menor' ? '(maj7)' : 'maj7');
    }
    var sexta = ac.sexta ? '6' : '';
    if (ac.sexta && adds.indexOf(9) >= 0) { sexta = br ? '6(9)' : '6/9'; adds = adds.filter(function (x) { return x !== 9; }); }
    var sus = q === 'sus4' ? (br ? '4' : 'sus4') : q === 'sus2' ? 'sus2' : '';

    if (br) {
      var paren = tensoes.concat(adds.map(String));
      var s = base + sexta + set + (sus && set ? '(' + sus.replace('sus', '') + ')' : sus);
      if (sus && set) paren = [sus === '4' ? '4' : '2'].concat(paren).filter(function (v, k, arr) { return arr.indexOf(v) === k; });
      if (sus && set) s = base + sexta + set;
      return s + (paren.length ? '(' + paren.join('/') + ')' : '');
    }
    // internacional: a maior extensão "sobe" para o nome ("C9", "Cmaj9", "Cm11")
    var nome = base + sexta;
    var ext = ac.extensoes.slice();
    if (set && ext.length) {
      var topo = ext[ext.length - 1];
      nome += (set === '7' ? '' : 'maj') + topo;
      tensoes = tensoes.filter(function (t) { return t !== String(topo) && ext.indexOf(Number(t)) < 0; });
    } else nome += set;
    nome += sus;
    nome += adds.map(function (a) { return 'add' + a; }).join('');
    return nome + tensoes.join('');
  }

  // ---------------------------------------------------------------
  // Comparação e utilidades
  // ---------------------------------------------------------------
  /** Mesma harmonia, grafias diferentes? ("Cmaj7" == "C7M"; "C#" == "Db") */
  function equivalentes(a, b) {
    if (!a || !b) return false;
    if (a.raiz.pc !== b.raiz.pc) return false;
    if ((a.baixo ? a.baixo.pc : -1) !== (b.baixo ? b.baixo.pc : -1)) return false;
    if (!a.reconhecido || !b.reconhecido) return a.sufixo === b.sufixo;
    return chaveHarmonica(a) === chaveHarmonica(b);
  }
  function chaveHarmonica(ac) {
    return ac.intervalos.map(function (x) { return x.semi; }).sort(function (x, y) { return x - y; }).join('.');
  }

  /**
   * Detecta a notação de um CONJUNTO de tokens. Decide por documento,
   * não por token: "Do" isolado é ré diminuto na internacional; num
   * documento em que metade dos acordes é "Sol", "Re", "La", é dó.
   */
  function detectarNotacao(tokens) {
    var lat = 0, total = 0;
    (tokens || []).forEach(function (t) {
      var s = String(t || '').trim();
      if (!s || especial(s)) return;
      total++;
      if (/^(Do|Re|Mi|Fa|Sol|La|Si|Dó|Ré|Fá|Lá)(?![a-z])|^(Do|Re|Mi|Fa|Sol|La|Si)(m|#|b|7|\/|\(|$)/.test(s)) lat++;
    });
    return total && lat / total >= 0.5 ? 'latina' : 'internacional';
  }

  /** Transpõe um texto de acorde (atalho). Não-acorde volta intacto. */
  function transporTexto(texto, semitons, opcoes) {
    var o = opcoes || {};
    var ac = ler(texto, o);
    if (!ac) return texto;
    return escrever(ac, { semitons: semitons, bemol: o.bemol, estilo: o.estilo });
  }

  return {
    ler: ler, escrever: escrever, notas: notas, intervalos: intervalos, especial: especial,
    equivalentes: equivalentes, chaveHarmonica: chaveHarmonica, detectarNotacao: detectarNotacao,
    transporTexto: transporTexto, sufixoCanonico: sufixoCanonico,
  };
});
