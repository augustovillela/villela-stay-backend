// =====================================================================
// Musique — MusicXML. Puro: sem banco, sem usuário, sem dependência.
//
// O QUE ESTE ARQUIVO FAZ, E COMO:
//
//   Transpor MusicXML sem PERDER NADA. A abordagem óbvia — ler o XML
//   para um modelo, mexer, e serializar de volta — perde tudo que o
//   modelo não conhece: articulação, dedilhado, direção de haste,
//   layout, letra, marcações do editor de quem escreveu. E MusicXML tem
//   centenas de elementos.
//
//   Aqui a transposição é uma REESCRITA CIRÚRGICA: o documento é
//   percorrido como texto, só os blocos `<pitch>` e `<key>` são
//   reescritos, e todo o resto é copiado byte a byte. Ida e volta é
//   idêntica por construção, não por cuidado.
//
// ⚠️ ESCOPO HONESTO. Isto não é um leitor completo de MusicXML: não
// renderiza partitura, não entende voz, camarim, repetição nem casa
// primeira/segunda. Faz duas coisas — transpor e extrair as notas para
// tocar — e diz claramente o que ignorou. Prometer mais seria prometer
// um renderizador de partitura, que é projeto de outra ordem.
// =====================================================================
'use strict';
const T = require('./teoria');

const PASSOS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const PC_DO_PASSO = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// pc → armadura (fifths). Onde há duas grafias possíveis, a escolha
// depende do gosto do tom; onde só há uma usável, ela vale sempre.
const FIFTHS_SUSTENIDO = { 0: 0, 1: 7, 2: 2, 3: -3, 4: 4, 5: -1, 6: 6, 7: 1, 8: -4, 9: 3, 10: -2, 11: 5 };
const FIFTHS_BEMOL = { 0: 0, 1: -5, 2: 2, 3: -3, 4: 4, 5: -1, 6: -6, 7: 1, 8: -4, 9: 3, 10: -2, 11: 5 };
const PC_DA_ARMADURA = (f) => (((Number(f) || 0) * 7) % 12 + 12) % 12;   // fifths → pc da tônica maior

const ehXml = (t) => /<\s*score-partwise|<\s*score-timewise/i.test(String(t || ''));

// ---------------------------------------------------------------------
// Leitura mínima
// ---------------------------------------------------------------------
const tag = (bloco, nome) => {
  const m = new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`, 'i').exec(bloco);
  return m ? m[1].trim() : null;
};

/** Armadura da primeira ocorrência, se houver. */
function armadura(xml) {
  const m = /<key[^>]*>([\s\S]*?)<\/key>/i.exec(String(xml || ''));
  if (!m) return null;
  const fifths = Number(tag(m[1], 'fifths'));
  if (!Number.isFinite(fifths)) return null;
  const modo = (tag(m[1], 'mode') || 'major').toLowerCase();
  const pcMaior = PC_DA_ARMADURA(fifths);
  const pc = modo === 'minor' ? (pcMaior + 9) % 12 : pcMaior;
  return { fifths, modo, pc, tom: T.nomeCifra(pc, { bemol: fifths < 0 }) + (modo === 'minor' ? 'm' : '') };
}

/** Metadados que dá para saber sem renderizar nada. */
function resumo(xml) {
  const s = String(xml || '');
  const arm = armadura(s);
  const partes = (s.match(/<score-part\b/gi) || []).length;
  const compassos = (s.match(/<measure\b/gi) || []).length;
  const divisions = Number(tag(s, 'divisions')) || null;
  const tempoM = /<sound[^>]*\btempo="([\d.]+)"/i.exec(s);
  return {
    titulo: tag(s, 'work-title') || tag(s, 'movement-title') || '',
    partes, compassos, divisions,
    bpm: tempoM ? Number(tempoM[1]) : null,
    tom: arm ? arm.tom : '',
    armadura: arm,
  };
}

/**
 * Notas para tocar. Devolve eventos simples e DIZ o que ignorou —
 * quem exibe precisa poder avisar que a reprodução é simplificada.
 */
function notas(xml, { parte = 0 } = {}) {
  const s = String(xml || '');
  const partes = [...s.matchAll(/<part\b[^>]*>([\s\S]*?)<\/part>/gi)].map((m) => m[1]);
  const corpo = partes[parte] || partes[0] || '';
  const divisions = Number(tag(s, 'divisions')) || 1;

  const eventos = [];
  const ignorado = new Set();
  let t = 0;
  for (const m of corpo.matchAll(/<note\b[^>]*>([\s\S]*?)<\/note>/gi)) {
    const nota = m[1];
    const dur = Number(tag(nota, 'duration')) || 0;
    const emAcorde = /<chord\s*\/?>/i.test(nota);
    if (/<grace\s*\/?>/i.test(nota)) { ignorado.add('apogiatura'); continue; }
    if (/<rest\s*\/?>/i.test(nota)) { if (!emAcorde) t += dur; continue; }

    const p = /<pitch>([\s\S]*?)<\/pitch>/i.exec(nota);
    if (!p) { if (!emAcorde) t += dur; continue; }
    const passo = (tag(p[1], 'step') || 'C').toUpperCase();
    const alter = Number(tag(p[1], 'alter')) || 0;
    const oitava = Number(tag(p[1], 'octave'));
    const midi = (oitava + 1) * 12 + PC_DO_PASSO[passo] + alter;

    // Nota em acorde começa no MESMO tempo da anterior — é isso que
    // `<chord/>` significa. Somar a duração dela empurraria a peça.
    const inicio = emAcorde && eventos.length ? eventos[eventos.length - 1].inicio_divisions : t;
    eventos.push({ midi, inicio_divisions: inicio, duracao_divisions: dur, acorde: emAcorde });
    if (!emAcorde) t += dur;

    if (/<tie\b/i.test(nota)) ignorado.add('ligadura de duração');
    if (/<tuplet\b/i.test(nota)) ignorado.add('quiáltera');
  }
  if (/<repeat\b/i.test(corpo)) ignorado.add('repetição');
  if ((s.match(/<part\b/gi) || []).length > 1) ignorado.add('outras partes');

  return { divisions, eventos, ignorado: [...ignorado], total_divisions: t };
}

// ---------------------------------------------------------------------
// Transposição cirúrgica
// ---------------------------------------------------------------------
/**
 * Transpõe em `semitons`, reescrevendo SÓ `<pitch>` e `<key>`.
 * Tudo o mais volta byte a byte.
 *
 * A grafia (sustenido ou bemol) segue a armadura de DESTINO — é ela que
 * o músico vai ler.
 */
function transpor(xml, semitons, { bemol = null } = {}) {
  const n = Number(semitons) || 0;
  const s = String(xml || '');
  if (!ehXml(s)) throw new Error('Isto não parece um arquivo MusicXML.');
  if (!n) return s;

  const arm = armadura(s);
  const pcDestino = arm ? (arm.pc + n % 12 + 12) % 12 : null;
  // Sem armadura declarada não há tom de destino para consultar; aí o
  // padrão é sustenido, que é o que a notação usa quando nada diz.
  const usarBemol = bemol === null
    ? (pcDestino == null ? false : require('./chordpro').preferBemol(
        arm.modo === 'minor' ? (pcDestino + 3) % 12 : pcDestino))
    : !!bemol;

  let out = s.replace(/<pitch>([\s\S]*?)<\/pitch>/gi, (bloco, dentro) => {
    const passo = (tag(dentro, 'step') || '').toUpperCase();
    const oitava = Number(tag(dentro, 'octave'));
    if (!PASSOS.includes(passo) || !Number.isFinite(oitava)) return bloco;  // não mexe no que não entende
    const alter = Number(tag(dentro, 'alter')) || 0;
    const midi = (oitava + 1) * 12 + PC_DO_PASSO[passo] + alter + n;
    return escreverPitch(midi, usarBemol, dentro);
  });

  out = out.replace(/<key\b([^>]*)>([\s\S]*?)<\/key>/gi, (bloco, attrs, dentro) => {
    const f = Number(tag(dentro, 'fifths'));
    if (!Number.isFinite(f)) return bloco;
    const modo = (tag(dentro, 'mode') || 'major').toLowerCase();
    const pcMaiorNovo = (PC_DA_ARMADURA(f) + n % 12 + 12) % 12;
    const tabela = usarBemol ? FIFTHS_BEMOL : FIFTHS_SUSTENIDO;
    const novo = tabela[pcMaiorNovo];
    return bloco.replace(/<fifths>[^<]*<\/fifths>/i, `<fifths>${novo}</fifths>`);
  });

  return out;
}

/**
 * Reescreve um bloco `<pitch>` COM A MESMA FORMA do original.
 *
 * MusicXML sai de editores diferentes e vem formatado de jeitos
 * diferentes: uns põem `<pitch>` numa linha só, outros quebram e
 * indentam. Escolher um formato e impor a todos faria a ida e volta
 * mudar o arquivo — e um diff de partitura ficaria ilegível para quem
 * versiona o próprio arranjo.
 *
 * Também nasceu de um teste que falhou: com formato fixo, transpor +5 e
 * voltar −5 devolvia um arquivo diferente do que entrou.
 */
function escreverPitch(midi, bemol, original) {
  const pc = ((midi % 12) + 12) % 12;
  const oitava = Math.floor(midi / 12) - 1;
  const cifra = T.nomeCifra(pc, { bemol });
  const passo = cifra[0];
  const alter = cifra.length > 1 ? (bemol ? -1 : 1) : 0;

  const partes = [`<step>${passo}</step>`];
  if (alter) partes.push(`<alter>${alter}</alter>`);
  partes.push(`<octave>${oitava}</octave>`);

  // Uma linha só? Volta em uma linha só.
  if (!/\n/.test(original)) return '<pitch>' + partes.join('') + '</pitch>';

  const recuo = (/\n([ \t]*)</.exec(original) || [, '        '])[1];
  const fecha = (/\n([ \t]*)$/.exec(original) || [, recuo.replace(/ {2}$/, '')])[1];
  return '<pitch>\n' + partes.map((l) => recuo + l).join('\n') + '\n' + fecha + '</pitch>';
}

module.exports = { ehXml, armadura, resumo, notas, transpor, PC_DO_PASSO, PASSOS };
