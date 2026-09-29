// =====================================================================
// Musique · Laboratório — NÚCLEO · pauta.
//
// A geometria da pauta é REGRA DE DOMÍNIO, não detalhe do desenho: com
// ela no JS da tela, a nota já saiu um grau acima do lugar e nenhum
// teste viu (lição de `teoria.js`). Aqui a posição vem da GRAFIA — dó# e
// ré♭ ficam em linhas diferentes — e cada clave é testada linha a linha.
//
// Posição = passos diatônicos a partir da LINHA DE BAIXO (0). Linhas são
// posições pares (0, 2, 4, 6, 8); espaços, ímpares. Negativo = abaixo.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./notas'));
  else (raiz.MusiqueLab = raiz.MusiqueLab || {}).pauta = fabrica(raiz.MusiqueLab.notas);
})(typeof self !== 'undefined' ? self : this, function (N) {
  'use strict';

  // linhaDeBaixo = a nota da 1ª linha (de baixo para cima).
  var CLAVES = {
    sol: { nome: 'clave de sol', en: 'treble clef', linhaDeBaixo: 'E4', glifo: '𝄞', referencia: 'sol4 na 2ª linha',
      sustenidos: ['F5', 'C5', 'G5', 'D5', 'A4', 'E5', 'B4'], bemois: ['B4', 'E5', 'A4', 'D5', 'G4', 'C5', 'F4'] },
    fa: { nome: 'clave de fá', en: 'bass clef', linhaDeBaixo: 'G2', glifo: '𝄢', referencia: 'fá3 na 4ª linha',
      sustenidos: ['F3', 'C3', 'G3', 'D3', 'A2', 'E3', 'B2'], bemois: ['B2', 'E3', 'A2', 'D3', 'G2', 'C3', 'F2'] },
    do3: { nome: 'clave de dó na 3ª linha (contralto)', en: 'alto clef', linhaDeBaixo: 'F3', glifo: '𝄡', referencia: 'dó4 na 3ª linha',
      sustenidos: ['F4', 'C4', 'G4', 'D4', 'A3', 'E4', 'B3'], bemois: ['B3', 'E4', 'A3', 'D4', 'G3', 'C4', 'F3'] },
    // Tenor: os SUSTENIDOS têm desenho próprio. Seguindo o zigue-zague das
    // outras claves, o fá♯ cairia acima da pauta; por isso, na clave de
    // tenor, o 1º sustenido vai na 2ª linha (fá3) e o desenho sobe em
    // quinta e desce em quarta. Os bemóis seguem o desenho de sempre.
    do4: { nome: 'clave de dó na 4ª linha (tenor)', en: 'tenor clef', linhaDeBaixo: 'D3', glifo: '𝄡', referencia: 'dó4 na 4ª linha',
      sustenidos: ['F3', 'C4', 'G3', 'D4', 'A3', 'E4', 'B3'], bemois: ['B3', 'E4', 'A3', 'D4', 'G3', 'C4', 'F3'] },
  };

  function clave(id) { return CLAVES[id] || null; }

  /** Posição de uma nota (com oitava) numa clave. */
  function posicao(nota, idClave) {
    var c = clave(idClave || 'sol');
    var n = N.ler(nota);
    if (!c || !n || n.oitava == null) return null;
    var pos = N.passo(n) - N.passo(c.linhaDeBaixo);
    var sup = [];
    for (var p = -2; p >= pos; p -= 2) sup.push(p);
    for (var q = 10; q <= pos; q += 2) sup.push(q);
    return { posicao: pos, sobreLinha: N.mod(pos, 2) === 0, suplementares: sup,
      acidente: n.alt, acidenteGlifo: { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' }[n.alt] };
  }

  /** Inverso: que nota NATURAL fica nesta posição (para exercícios). */
  function naturalNaPosicao(pos, idClave) {
    var c = clave(idClave || 'sol');
    if (!c) return null;
    var abs = N.passo(c.linhaDeBaixo) + pos;
    return { li: N.mod(abs, 7), alt: 0, oitava: Math.floor(abs / 7) };
  }

  /** Nome da posição: "3ª linha", "2º espaço", "1ª linha suplementar inferior". */
  function nomeDaPosicao(pos) {
    if (pos >= 0 && pos <= 8) return pos % 2 === 0 ? (pos / 2 + 1) + 'ª linha' : ((pos + 1) / 2) + 'º espaço';
    if (pos < 0) {
      if (pos % 2 === 0) return (-pos / 2) + 'ª linha suplementar inferior';
      return pos === -1 ? 'espaço abaixo da pauta' : ((-pos - 1) / 2) + 'º espaço suplementar inferior';
    }
    if (pos % 2 === 0) return ((pos - 8) / 2) + 'ª linha suplementar superior';
    return pos === 9 ? 'espaço acima da pauta' : ((pos - 9) / 2) + 'º espaço suplementar superior';
  }

  /** Posições da armadura (quantidade + sustenidos, − bemóis). */
  function armadura(quantidade, idClave) {
    var c = clave(idClave || 'sol');
    if (!c) return null;
    var lista = quantidade > 0 ? c.sustenidos : quantidade < 0 ? c.bemois : [];
    if (lista === null) return null;
    return lista.slice(0, Math.abs(quantidade)).map(function (x) {
      var p = posicao(x, idClave);
      return { posicao: p.posicao, glifo: quantidade > 0 ? '♯' : '♭' };
    });
  }

  return { CLAVES: CLAVES, clave: clave, posicao: posicao, naturalNaPosicao: naturalNaPosicao, nomeDaPosicao: nomeDaPosicao, armadura: armadura };
});
