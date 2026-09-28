// =====================================================================
// Musique · Laboratório — NÚCLEO · notas (ADR-0013).
//
// Puro e ISOMÓRFICO: o mesmo arquivo roda no Node (testes, páginas
// renderizadas no servidor) e no navegador (Laboratório interativo).
//
// A DECISÃO QUE MORA AQUI: nota é LETRA + ALTERAÇÃO + OITAVA. Altura
// (MIDI, frequência) é consequência, nunca a fonte. Dó# e ré♭ soam igual
// e são notas diferentes: ficam em linhas diferentes da pauta, formam
// intervalos diferentes e pertencem a tonalidades diferentes. Um núcleo
// que guardasse só a classe de altura ensinaria errado sem nenhum teste
// perceber — foi por isso que `teoria.js` e o motor das cifras não
// serviram de base (ver a ADR).
//
// Convenção de oitava: científica (dó central = C4 = MIDI 60). A oitava
// pertence à LETRA: si#3 soa como dó4 e continua sendo "da oitava 3".
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else (raiz.MusiqueLab = raiz.MusiqueLab || {}).notas = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LETRAS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var LETRA_PC = [0, 2, 4, 5, 7, 9, 11];
  var PT = ['dó', 'ré', 'mi', 'fá', 'sol', 'lá', 'si'];
  var PT_SLUG = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
  var PT_LER = { do: 0, re: 1, mi: 2, fa: 3, sol: 4, la: 5, si: 6 };
  var ALT_PT = { '-2': ' dobrado bemol', '-1': ' bemol', 0: '', 1: ' sustenido', 2: ' dobrado sustenido' };
  var ALT_SLUG = { '-2': '-dobrado-bemol', '-1': '-bemol', 0: '', 1: '-sustenido', 2: '-dobrado-sustenido' };
  var ALT_ASCII = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' };
  var ALT_GLIFO = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
  var LA4 = 440;

  function mod(n, m) { return ((n % m) + m) % m; }
  function semAcento(v) { return String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function nota(letra, alt, oitava) {
    var li = typeof letra === 'number' ? letra : LETRAS.indexOf(String(letra).toUpperCase());
    if (li < 0 || li > 6) return null;
    var a = Number(alt) || 0;
    if (a < -2 || a > 2) return null;
    return { li: li, alt: a, oitava: oitava == null || oitava === '' ? null : Number(oitava) };
  }

  /**
   * Lê uma nota escrita do jeito que o músico escreve. Devolve
   * { li, alt, oitava } ou null. Aceita cifra (C#4, Bb, Fx, Ebb, E𝄫),
   * nome latino (dó#, réb, sol4, si b) e por extenso ("dó sustenido",
   * "si bemol", "fá dobrado sustenido", "B flat", "C sharp").
   */
  function ler(entrada) {
    if (entrada && typeof entrada === 'object' && typeof entrada.li === 'number') return entrada;
    var s = semAcento(entrada).trim().toLowerCase();
    if (!s) return null;
    s = s.replace(/𝄪/g, '##').replace(/𝄫/g, 'bb').replace(/♯/g, '#').replace(/♭/g, 'b').replace(/♮/g, '');
    s = s.replace(/(dobrado|duplo|double)[\s-]*(sustenido|sharp)/g, '##')
      .replace(/(dobrado|duplo|double)[\s-]*(bemol|flat)/g, 'bb')
      .replace(/sustenido|sharp/g, '#').replace(/bemol|flat/g, 'b').replace(/natural/g, '');
    s = s.replace(/[\s_-]+/g, '');
    var li, resto;
    var m = s.match(/^(sol|do|re|mi|fa|la|si)/);
    if (m) { li = PT_LER[m[1]]; resto = s.slice(m[1].length); }
    else if (/^[a-g]/.test(s)) { li = LETRAS.indexOf(s[0].toUpperCase()); resto = s.slice(1); }
    else return null;
    var r = resto.match(/^([#bx]*)(-?\d+)?$/);
    if (!r) return null;
    var alt = 0;
    for (var i = 0; i < r[1].length; i++) {
      var c = r[1][i];
      alt += c === '#' ? 1 : c === 'x' ? 2 : -1;
    }
    if (alt < -2 || alt > 2) return null;
    var oit = r[2] === undefined ? null : Number(r[2]);
    if (oit != null && (oit < -1 || oit > 9)) return null;
    return { li: li, alt: alt, oitava: oit };
  }

  function pc(n) { n = ler(n); return n ? mod(LETRA_PC[n.li] + n.alt, 12) : null; }

  /** MIDI da nota (exige oitava). C4 = 60; Cb4 = 59; B#3 = 60. */
  function midi(n) {
    n = ler(n);
    if (!n || n.oitava == null) return null;
    return (n.oitava + 1) * 12 + LETRA_PC[n.li] + n.alt;
  }

  function freqDeMidi(m, la4) { return (la4 || LA4) * Math.pow(2, (Number(m) - 69) / 12); }
  function midiDeFreq(hz, la4) { return 69 + 12 * Math.log2(Number(hz) / (la4 || LA4)); }
  function freq(n, la4) { var m = midi(n); return m == null ? null : freqDeMidi(m, la4); }

  /** Posição diatônica absoluta (letra + 7 × oitava): é o que a pauta usa. */
  function passo(n) { n = ler(n); return n && n.oitava != null ? n.li + 7 * n.oitava : null; }

  /**
   * Nome para mostrar. `notacao`: 'cifra' (C#4) | 'pt' (dó♯4) |
   * 'extenso' (dó sustenido). `glifo`: usa ♯ ♭ 𝄪 𝄫 em vez de # b.
   * `oitava: false` omite a oitava.
   */
  function nome(n, opcoes) {
    n = ler(n);
    if (!n) return '';
    var o = opcoes || {};
    var not = o.notacao || 'cifra';
    var oit = o.oitava === false || n.oitava == null ? '' : String(n.oitava);
    if (not === 'extenso') return PT[n.li] + ALT_PT[n.alt] + (oit ? ' ' + oit : '');
    var acid = o.glifo ? ALT_GLIFO[n.alt] : ALT_ASCII[n.alt];
    return (not === 'pt' ? PT[n.li] : LETRAS[n.li]) + acid + oit;
  }

  /** Nome curto nas duas notações: "dó♯ (C#)". */
  function nomeDuplo(n) { return nome(n, { notacao: 'pt', glifo: true, oitava: false }) + ' (' + nome(n, { oitava: false }) + ')'; }

  function slug(n) { n = ler(n); return n ? PT_SLUG[n.li] + ALT_SLUG[n.alt] : ''; }
  function deSlug(s) {
    var m = String(s || '').toLowerCase().match(/^(do|re|mi|fa|sol|la|si)(-dobrado-sustenido|-dobrado-bemol|-sustenido|-bemol)?$/);
    if (!m) return null;
    var alt = { '': 0, '-sustenido': 1, '-bemol': -1, '-dobrado-sustenido': 2, '-dobrado-bemol': -2 }[m[2] || ''];
    return { li: PT_LER[m[1]], alt: alt, oitava: null };
  }

  function comOitava(n, oitava) { n = ler(n); return n ? { li: n.li, alt: n.alt, oitava: oitava } : null; }
  function semOitava(n) { return comOitava(n, null); }

  /** Mesma ALTURA (enarmonia vale). Com as duas oitavas, compara MIDI. */
  function mesmaAltura(a, b) {
    a = ler(a); b = ler(b);
    if (!a || !b) return false;
    if (a.oitava != null && b.oitava != null) return midi(a) === midi(b);
    return pc(a) === pc(b);
  }
  /** Mesma GRAFIA: letra e alteração (e oitava, se as duas tiverem). */
  function mesmaGrafia(a, b) {
    a = ler(a); b = ler(b);
    if (!a || !b) return false;
    if (a.li !== b.li || a.alt !== b.alt) return false;
    return a.oitava == null || b.oitava == null || a.oitava === b.oitava;
  }

  /** Todas as grafias da mesma altura, com até dois acidentes. */
  function enarmonicos(n) {
    n = ler(n);
    if (!n) return [];
    var alvo = pc(n), m = midi(n), out = [];
    for (var li = 0; li < 7; li++) {
      var alt = mod(alvo - LETRA_PC[li] + 6, 12) - 6;
      if (alt < -2 || alt > 2) continue;
      var e = { li: li, alt: alt, oitava: null };
      if (m != null) e.oitava = Math.floor((m - LETRA_PC[li] - alt) / 12) - 1;
      out.push(e);
    }
    return out.sort(function (x, y) { return Math.abs(x.alt) - Math.abs(y.alt); });
  }

  var PADRAO_SUST = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
  var PADRAO_BEMOL = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];

  /** Grafia padrão de uma classe de altura (sem contexto de tom). */
  function deClasse(p, opcoes) {
    var par = ((opcoes && opcoes.bemol) ? PADRAO_BEMOL : PADRAO_SUST)[mod(p, 12)];
    return { li: par[0], alt: par[1], oitava: null };
  }
  function deMidi(m, opcoes) {
    m = Math.round(Number(m));
    var n = deClasse(mod(m, 12), opcoes);
    n.oitava = Math.floor((m - LETRA_PC[n.li] - n.alt) / 12) - 1;
    return n;
  }

  /** A nota mais próxima de uma frequência e o desvio em cents. */
  function deFreq(hz, opcoes) {
    if (!(Number(hz) > 0)) return null;
    var o = opcoes || {};
    var mm = midiDeFreq(hz, o.la4), r = Math.round(mm);
    return { nota: deMidi(r, o), midi: r, cents: Math.round((mm - r) * 100), alvo_hz: freqDeMidi(r, o.la4) };
  }

  function centsEntre(hz, ref) { return 1200 * Math.log2(Number(hz) / Number(ref)); }

  return {
    LETRAS: LETRAS, LETRA_PC: LETRA_PC, PT: PT, LA4: LA4, mod: mod, semAcento: semAcento,
    nota: nota, ler: ler, pc: pc, midi: midi, freq: freq, freqDeMidi: freqDeMidi, midiDeFreq: midiDeFreq,
    passo: passo, nome: nome, nomeDuplo: nomeDuplo, slug: slug, deSlug: deSlug,
    comOitava: comOitava, semOitava: semOitava, mesmaAltura: mesmaAltura, mesmaGrafia: mesmaGrafia,
    enarmonicos: enarmonicos, deClasse: deClasse, deMidi: deMidi, deFreq: deFreq, centsEntre: centsEntre,
  };
});
