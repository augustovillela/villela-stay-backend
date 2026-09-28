// =====================================================================
// Musique Cifras — MOTOR · nota. Puro e ISOMÓRFICO: o mesmo arquivo roda
// no Node (testes, servidor) e no navegador (transposição instantânea e
// modo palco sem rede). Por isso não usa nada do Node nem do DOM.
//
// Por que não reusar `music/teoria.js`: ela é CommonJS de servidor e já
// tem contrato próprio com a Academia (nome em português como resposta
// de exercício). Aqui o problema é outro — grafia de CIFRA, em notação
// internacional e latina, com a enarmonia decidida pelo tom.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else (raiz.MusiqueMotor = raiz.MusiqueMotor || {}).nota = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SUSTENIDO = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var BEMOL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var LATINA = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
  var LATINA_PARA_LETRA = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };
  var LETRA_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function mod12(n) { return ((n % 12) + 12) % 12; }

  function semAcento(v) {
    return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /**
   * Lê a CABEÇA de nota no início de `txt` (sem oitava).
   * Devolve { pc, tamanho, letra, latina } ou null.
   * `latina`: 'auto' | true | false. Em 'auto' a latina só vale quando
   * a sílaba vem com maiúscula ("Sol", "Re") — "Do" em cifra
   * internacional é ré diminuto, e confundir os dois muda o acorde.
   */
  function lerCabeca(txt, latina, aceitaMinuscula) {
    var s = String(txt == null ? '' : txt);
    if (!s) return null;
    var modo = latina === undefined ? false : latina;
    // Acorde começa com MAIÚSCULA. Sem isso "e" e "a" — palavras da letra
    // em português — virariam mi maior e lá maior.
    var min = !!aceitaMinuscula;
    var m;
    if (modo) {
      var base = semAcento(s);
      m = base.match(/^(Sol|SOL|sol|Do|DO|do|Re|RE|re|Mi|MI|mi|Fa|FA|fa|La|LA|la|Si|SI|si)/);
      if (m && (/^[A-Z]/.test(m[1]) || (modo === true && min))) {
        var letraL = LATINA_PARA_LETRA[m[1].toLowerCase()];
        // o tamanho é medido no texto ORIGINAL (acento ocupa um caractere)
        var tamL = m[1].length;
        var acid = lerAcidentes(s.slice(tamL));
        return { pc: mod12(LETRA_PC[letraL] + acid.delta), tamanho: tamL + acid.tamanho,
          letra: letraL, acidente: acid.texto, latina: true };
      }
      if (modo === true) return null;
    }
    m = s.match(min ? /^[A-Ga-g]/ : /^[A-G]/);
    if (!m) return null;
    var letra = m[0].toUpperCase();
    var a = lerAcidentes(s.slice(1));
    return { pc: mod12(LETRA_PC[letra] + a.delta), tamanho: 1 + a.tamanho, letra: letra,
      acidente: a.texto, latina: false };
  }

  // No máximo dois acidentes (C##, Bbb). "b" depois da letra é bemol;
  // mas "Cb5"? É dó bemol com quinta? Não: cifra escreve Cb para dó
  // bemol e "C(b5)" para quinta diminuta. Quem decide é o chamador,
  // olhando o que sobra (ver acorde.js).
  function lerAcidentes(resto) {
    var delta = 0, tam = 0, texto = '';
    for (var i = 0; i < 2 && i < resto.length; i++) {
      var c = resto[i];
      if (c === '#' || c === '♯') { delta++; tam++; texto += '#'; }
      else if (c === 'b' || c === '♭') { delta--; tam++; texto += 'b'; }
      else break;
    }
    return { delta: delta, tamanho: tam, texto: texto };
  }

  /** Nota completa (sem sufixo). "F#" → { pc: 6 }; "Solb" → 6. */
  function lerNota(txt, latina) {
    var s = String(txt == null ? '' : txt).trim();
    var c = lerCabeca(s, latina === undefined ? 'auto' : latina, true);
    if (!c || c.tamanho !== s.length) {
      // tenta a latina estrita quando a internacional não fechou
      if (latina === undefined) {
        var l = lerCabeca(s, true, true);
        if (l && l.tamanho === s.length) return l;
      }
      return null;
    }
    return c;
  }

  /** Nome de cifra para uma classe de altura. */
  function nome(pc, opcoes) {
    var o = opcoes || {};
    var n = (o.bemol ? BEMOL : SUSTENIDO)[mod12(pc)];
    if (o.latina) n = LATINA[n[0]] + n.slice(1);
    return n;
  }

  // ---------------------------------------------------------------
  // Grafia pelo TOM. A regra que manda: escrever como o músico lê no
  // tom de destino. Transpor dó → mi bemol e continuar escrevendo "D#"
  // é certo em altura e errado em leitura.
  // ---------------------------------------------------------------
  // Tons maiores escritos com bemol: F Bb Eb Ab Db Gb (Gb x F#: empate,
  // decide a preferência do usuário; por padrão, bemol até 6 acidentes).
  var MAIOR_COM_BEMOL = { 5: true, 10: true, 3: true, 8: true, 1: true, 6: true };

  /**
   * Deve-se escrever com bemol neste tom?
   * `tom` = { pc, menor } ou null. `pref` = 'auto' | 'sustenido' | 'bemol'.
   */
  function usarBemol(tom, pref) {
    if (pref === 'bemol') return true;
    if (pref === 'sustenido') return false;
    if (!tom) return false;
    // Tom menor se escreve como o seu relativo maior (lá menor = dó).
    var relativo = tom.menor ? mod12(tom.pc + 3) : mod12(tom.pc);
    return !!MAIOR_COM_BEMOL[relativo];
  }

  /** Lê um TOM: "Am", "F#m", "Bb", "Solm", "C major", "A minor". */
  function lerTom(txt) {
    var s = semAcento(String(txt == null ? '' : txt)).trim();
    if (!s) return null;
    var c = lerCabeca(s, 'auto', true);
    if (!c) c = lerCabeca(s, true, true);
    if (!c) return null;
    // A caixa importa: "M" é maior, "m" é menor.
    var resto = s.slice(c.tamanho).trim().replace(/[()]/g, '');
    var menor;
    if (resto === '' || resto === 'M' || /^(maj|maior|major)$/i.test(resto)) menor = false;
    else if (resto === 'm' || resto === '-' || /^(min|menor|minor)$/i.test(resto)) menor = true;
    else return null;
    return { pc: c.pc, menor: menor };
  }

  function escreverTom(tom, opcoes) {
    if (!tom) return '';
    var o = opcoes || {};
    var bemol = o.bemol === undefined ? usarBemol(tom, o.preferencia || 'auto') : o.bemol;
    return nome(tom.pc, { bemol: bemol, latina: o.latina }) + (tom.menor ? 'm' : '');
  }

  return {
    SUSTENIDO: SUSTENIDO, BEMOL: BEMOL, mod12: mod12, semAcento: semAcento,
    lerCabeca: lerCabeca, lerNota: lerNota, nome: nome,
    usarBemol: usarBemol, lerTom: lerTom, escreverTom: escreverTom,
  };
});
