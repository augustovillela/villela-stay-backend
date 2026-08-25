// =====================================================================
// Musique — TEORIA MUSICAL. Base pura de todo o resto.
//
// ⚠️ ESTE ARQUIVO É PURO. Não lê banco, não sabe quem é o usuário, não
// importa nada do módulo. É o que permite que a avaliação seja
// EXPLICÁVEL: quando o aluno erra, o sistema consegue dizer o que era
// esperado e por quê, em vez de devolver "errado".
//
// Duas decisões de produto que moram aqui:
//
//   1. NOME DE NOTA EM PORTUGUÊS É PRIMEIRA CLASSE. Músico brasileiro
//      diz "dó ré mi", não "C D E" — e escola de música ensina assim.
//      Aceitar só a cifra anglófona seria pedir que o aluno traduza
//      antes de responder, o que mede tradução, não percepção.
//
//   2. ENARMONIA É RESPOSTA CERTA. Se o exercício espera Fá# e o aluno
//      responde Solb, ele acertou: é a mesma altura. Marcar como erro
//      seria ensinar o contrário do que a teoria diz.
// =====================================================================
'use strict';

// ---------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------
const CROMATICA = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CROMATICA_BEMOL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// pt → cifra. `mi#` e `si#` existem na teoria e caem em Fá e Dó.
const PT_PARA_CIFRA = {
  do: 'C', 'dó': 'C', re: 'D', 'ré': 'D', mi: 'E', fa: 'F', 'fá': 'F',
  sol: 'G', la: 'A', 'lá': 'A', si: 'B',
};
const CIFRA_PARA_PT = { C: 'dó', D: 'ré', E: 'mi', F: 'fá', G: 'sol', A: 'lá', B: 'si' };

const semAcento = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Interpreta um nome de nota em cifra OU em português, com ou sem
 * alteração e com ou sem oitava. Devolve `{ pc, oitava, texto }` ou
 * null. `pc` = pitch class 0–11 (dó = 0).
 *
 * Aceita: C, C#, Db, do, dó#, réb, Sol, si b, F#4, la3, dó4...
 */
function lerNota(entrada) {
  const bruto = semAcento(entrada).trim().toLowerCase().replace(/\s+/g, '');
  if (!bruto) return null;

  // nome (1–3 letras) + alterações (# b ♯ ♭ s) + oitava opcional
  const m = bruto.match(/^([a-g]|do|re|mi|fa|sol|la|si)([#b♯♭s]*)(-?\d)?$/);
  if (!m) return null;
  const [, nome, alts, oit] = m;

  let base;
  if (PT_PARA_CIFRA[nome]) base = PT_PARA_CIFRA[nome];
  else if (nome.length === 1) base = nome.toUpperCase();
  else return null;

  let pc = CROMATICA.indexOf(base);
  if (pc < 0) return null;
  for (const a of alts) {
    if (a === '#' || a === '♯' || a === 's') pc += 1;
    else if (a === 'b' || a === '♭') pc -= 1;
  }
  pc = ((pc % 12) + 12) % 12;
  return { pc, oitava: oit === undefined ? null : Number(oit), texto: String(entrada).trim() };
}

/** Duas grafias soam a mesma altura? É isto que faz Fá# = Solb valer. */
function mesmaAltura(a, b) {
  const x = lerNota(a); const y = lerNota(b);
  if (!x || !y) return false;
  if (x.oitava != null && y.oitava != null && x.oitava !== y.oitava) return false;
  return x.pc === y.pc;
}

const nomeCifra = (pc, { bemol = false } = {}) => (bemol ? CROMATICA_BEMOL : CROMATICA)[((pc % 12) + 12) % 12];

/** Nome em português: "dó", "fá sustenido", "si bemol". */
function nomePt(pc, { bemol = false } = {}) {
  const cifra = nomeCifra(pc, { bemol });
  const base = CIFRA_PARA_PT[cifra[0]];
  if (cifra.length === 1) return base;
  return base + (cifra[1] === '#' ? ' sustenido' : ' bemol');
}

/** Como mostrar uma nota ao usuário, no idioma que ele escolheu. */
const nomeDaNota = (pc, { notacao = 'pt', bemol = false } = {}) =>
  (notacao === 'cifra' ? nomeCifra(pc, { bemol }) : nomePt(pc, { bemol }));

// ---------------------------------------------------------------------
// Altura, frequência e cents
// ---------------------------------------------------------------------
const LA4_HZ = 440;

/** MIDI de uma nota com oitava. C4 = 60 (dó central), A4 = 69. */
function midiDe(entrada) {
  const n = lerNota(entrada);
  if (!n || n.oitava == null) return null;
  return (n.oitava + 1) * 12 + n.pc;
}

const freqDeMidi = (midi, { la4 = LA4_HZ } = {}) => la4 * Math.pow(2, (Number(midi) - 69) / 12);
const midiDeFreq = (hz, { la4 = LA4_HZ } = {}) => 69 + 12 * Math.log2(Number(hz) / la4);

/** Diferença em cents. 100 cents = 1 semitom. Positivo = mais agudo. */
const centsEntre = (hz, hzRef) => 1200 * Math.log2(Number(hz) / Number(hzRef));

/** A nota mais próxima de uma frequência, e o quanto está desafinada. */
function notaDeFreq(hz, { la4 = LA4_HZ } = {}) {
  if (!(Number(hz) > 0)) return null;
  const m = midiDeFreq(hz, { la4 });
  const midi = Math.round(m);
  const cents = Math.round((m - midi) * 100);
  return { midi, pc: ((midi % 12) + 12) % 12, oitava: Math.floor(midi / 12) - 1, cents,
    freq_alvo: freqDeMidi(midi, { la4 }) };
}

// ---------------------------------------------------------------------
// Intervalos
// ---------------------------------------------------------------------
const INTERVALOS = [
  { semitons: 0, curto: 'J1', pt: 'uníssono' },
  { semitons: 1, curto: '2m', pt: 'segunda menor' },
  { semitons: 2, curto: '2M', pt: 'segunda maior' },
  { semitons: 3, curto: '3m', pt: 'terça menor' },
  { semitons: 4, curto: '3M', pt: 'terça maior' },
  { semitons: 5, curto: 'J4', pt: 'quarta justa' },
  { semitons: 6, curto: '4A', pt: 'trítono' },
  { semitons: 7, curto: 'J5', pt: 'quinta justa' },
  { semitons: 8, curto: '6m', pt: 'sexta menor' },
  { semitons: 9, curto: '6M', pt: 'sexta maior' },
  { semitons: 10, curto: '7m', pt: 'sétima menor' },
  { semitons: 11, curto: '7M', pt: 'sétima maior' },
  { semitons: 12, curto: 'J8', pt: 'oitava' },
];
const intervaloDe = (semitons) => INTERVALOS.find((i) => i.semitons === Math.abs(Number(semitons))) || null;

/**
 * Nome do intervalo que o usuário digitou ou escolheu.
 *
 * ⚠️ A CAIXA IMPORTA na abreviação, e só nela: `3M` é terça MAIOR e `3m`
 * é terça MENOR. Normalizar tudo para minúsculas — que é o reflexo certo
 * em quase todo campo de texto — faria `3M` casar com `3m` e devolver o
 * intervalo errado, calado. Por isso o nome por extenso é comparado sem
 * caixa e sem acento, e a abreviação é comparada como foi escrita.
 */
function lerIntervalo(entrada) {
  const cru = String(entrada == null ? '' : entrada).trim();
  if (!cru) return null;
  const porExtenso = semAcento(cru).toLowerCase().replace(/\s+/g, ' ');
  const abreviado = cru.replace(/\s+/g, '');
  return INTERVALOS.find((i) =>
    semAcento(i.pt).toLowerCase() === porExtenso || i.curto === abreviado) || null;
}

// ---------------------------------------------------------------------
// Escalas
// ---------------------------------------------------------------------
const ESCALAS = {
  maior: { pt: 'maior', graus: [0, 2, 4, 5, 7, 9, 11] },
  menor_natural: { pt: 'menor natural', graus: [0, 2, 3, 5, 7, 8, 10] },
  menor_harmonica: { pt: 'menor harmônica', graus: [0, 2, 3, 5, 7, 8, 11] },
  menor_melodica: { pt: 'menor melódica', graus: [0, 2, 3, 5, 7, 9, 11] },
  dorico: { pt: 'dórico', graus: [0, 2, 3, 5, 7, 9, 10] },
  frigio: { pt: 'frígio', graus: [0, 1, 3, 5, 7, 8, 10] },
  lidio: { pt: 'lídio', graus: [0, 2, 4, 6, 7, 9, 11] },
  mixolidio: { pt: 'mixolídio', graus: [0, 2, 4, 5, 7, 9, 10] },
  locrio: { pt: 'lócrio', graus: [0, 1, 3, 5, 6, 8, 10] },
  pentatonica_maior: { pt: 'pentatônica maior', graus: [0, 2, 4, 7, 9] },
  pentatonica_menor: { pt: 'pentatônica menor', graus: [0, 3, 5, 7, 10] },
  blues: { pt: 'blues', graus: [0, 3, 5, 6, 7, 10] },
};

/** Pitch classes da escala. Tônica aceita cifra ou português. */
function escala(tonica, tipo = 'maior') {
  const t = lerNota(tonica);
  const e = ESCALAS[tipo];
  if (!t || !e) return null;
  return e.graus.map((g) => (t.pc + g) % 12);
}

// ---------------------------------------------------------------------
// Acordes
// ---------------------------------------------------------------------
const ACORDES = {
  maior: { sufixo: '', pt: 'maior', graus: [0, 4, 7] },
  menor: { sufixo: 'm', pt: 'menor', graus: [0, 3, 7] },
  diminuto: { sufixo: 'dim', pt: 'diminuto', graus: [0, 3, 6] },
  aumentado: { sufixo: 'aug', pt: 'aumentado', graus: [0, 4, 8] },
  sus2: { sufixo: 'sus2', pt: 'suspenso de segunda', graus: [0, 2, 7] },
  sus4: { sufixo: 'sus4', pt: 'suspenso de quarta', graus: [0, 5, 7] },
  maior7: { sufixo: '7M', pt: 'maior com sétima maior', graus: [0, 4, 7, 11] },
  dominante7: { sufixo: '7', pt: 'com sétima (dominante)', graus: [0, 4, 7, 10] },
  menor7: { sufixo: 'm7', pt: 'menor com sétima', graus: [0, 3, 7, 10] },
  meio_diminuto: { sufixo: 'm7(b5)', pt: 'meio-diminuto', graus: [0, 3, 6, 10] },
  diminuto7: { sufixo: 'dim7', pt: 'diminuto com sétima', graus: [0, 3, 6, 9] },
  sexta: { sufixo: '6', pt: 'com sexta', graus: [0, 4, 7, 9] },
};

function acorde(fundamental, tipo = 'maior') {
  const f = lerNota(fundamental);
  const a = ACORDES[tipo];
  if (!f || !a) return null;
  return a.graus.map((g) => (f.pc + g) % 12);
}

const cifraDe = (fundamental, tipo = 'maior', { bemol = false } = {}) => {
  const f = lerNota(fundamental);
  const a = ACORDES[tipo];
  if (!f || !a) return null;
  return nomeCifra(f.pc, { bemol }) + a.sufixo;
};

/** Lê uma cifra ("Am7", "Solm", "F#dim") e devolve fundamental + tipo.
 *  Aceita fundamental em português porque o aluno escreve "Solm". */
function lerCifra(entrada) {
  const bruto = String(entrada == null ? '' : entrada).trim();
  if (!bruto) return null;
  const semAc = semAcento(bruto);
  // a fundamental é o prefixo mais LONGO que ainda é nota válida
  for (let n = Math.min(5, semAc.length); n >= 1; n--) {
    const cabeca = semAc.slice(0, n);
    const nota = lerNota(cabeca);
    if (!nota || nota.oitava != null) continue;
    const resto = semAc.slice(n).replace(/\s+/g, '');
    const tipo = Object.keys(ACORDES).find((k) => semAcento(ACORDES[k].sufixo).toLowerCase() === resto.toLowerCase());
    if (tipo) return { pc: nota.pc, tipo, notas: acorde(cabeca, tipo) };
  }
  return null;
}

// ---------------------------------------------------------------------
// Transposição — aritmética, não adivinhação (ver ARCHITECTURE §5.1)
// ---------------------------------------------------------------------
const transporPc = (pc, semitons) => (((pc + Number(semitons)) % 12) + 12) % 12;

/** Transpõe uma cifra mantendo o tipo do acorde. */
function transporCifra(cifra, semitons, { bemol = false } = {}) {
  const c = lerCifra(cifra);
  if (!c) return null;
  return nomeCifra(transporPc(c.pc, semitons), { bemol }) + ACORDES[c.tipo].sufixo;
}

/** Semitons entre dois tons (para "passar de Dó para Ré"). */
function semitonsEntreTons(de, para) {
  const a = lerNota(de); const b = lerNota(para);
  if (!a || !b) return null;
  return (((b.pc - a.pc) % 12) + 12) % 12;
}

// ---------------------------------------------------------------------
// Posição na pauta
// ---------------------------------------------------------------------
// A geometria mora AQUI, e não no desenho do cliente, por um motivo
// aprendido doendo: com ela no JS da tela, a nota saiu desenhada um grau
// acima do lugar e nenhum teste viu — o exercício de leitura reprovava
// quem lia certo. Aqui ela é pura, e o teste crava linha por linha.
//
// Convenção da clave de sol: a linha DE BAIXO é mi4 e a de CIMA é fá5.
// Cada grau diatônico vale meia distância entre linhas.
const PAUTA = { linha_de_baixo: 128, espaco: 14, clave_sol_base: 'E4' };
const GRAUS_DIATONICOS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];  // dó=0 … si=6

/** Graus diatônicos acima de dó4. dó4 = 0, mi4 = 2, lá4 = 5, dó5 = 7. */
function grauDiatonico(midi) {
  const m = Math.round(Number(midi));
  const pc = ((m % 12) + 12) % 12;
  const oitava = Math.floor(m / 12) - 1;
  return GRAUS_DIATONICOS[pc] + (oitava - 4) * 7;
}

/**
 * Onde a cabeça da nota fica, e quais linhas suplementares ela exige.
 * `y` cresce para BAIXO (coordenada de tela).
 */
function posicaoNaPauta(midi, clave = 'sol', { bemol = false } = {}) {
  if (clave !== 'sol') return null;                 // outras claves: fase futura
  const base = grauDiatonico(midiDe(PAUTA.clave_sol_base));   // mi4 = 2
  // A LINHA VEM DA GRAFIA, não da altura. Fá# e Solb soam igual e ficam
  // em linhas DIFERENTES: fá# na do fá, solb na do sol. Derivar a linha
  // só da classe de altura poria solb na linha do fá — que é o mesmo
  // som escrito errado, e num exercício de leitura isso é o defeito.
  const alterado = nomeCifra(((midi % 12) + 12) % 12).length > 1;
  const passo = alterado && bemol ? grauDiatonico(midi + 1) : grauDiatonico(midi);
  const y = PAUTA.linha_de_baixo - (passo - base) * (PAUTA.espaco / 2);

  // Suplementares aparecem de duas em duas posições (só sobre linhas),
  // da pauta até a nota.
  const suplementares = [];
  for (let l = PAUTA.linha_de_baixo + PAUTA.espaco; l <= y; l += PAUTA.espaco) suplementares.push(l);
  const topo = PAUTA.linha_de_baixo - 4 * PAUTA.espaco;        // fá5
  for (let l = topo - PAUTA.espaco; l >= y; l -= PAUTA.espaco) suplementares.push(l);

  // ⚠️ O ACIDENTE VAI JUNTO, e não é enfeite. Nota alterada ocupa a MESMA
  // linha da natural — só o sinal antes dela diz que é fá# e não fá.
  // Desenhar a cabeça sem o acidente faz o aluno ler "fá", responder
  // "fá" e ser reprovado pelo gabarito "fá sustenido". Já aconteceu.
  const acidente = alterado ? (bemol ? 'b' : '#') : '';

  return {
    passo, y, acidente,
    acidente_glifo: acidente === '#' ? '♯' : acidente === 'b' ? '♭' : '',
    linhas: [0, 1, 2, 3, 4].map((i) => PAUTA.linha_de_baixo - i * PAUTA.espaco),
    suplementares,
    // `true` quando a cabeça fica exatamente sobre uma linha (útil para o
    // desenho e para conferir a geometria de fora)
    sobre_linha: (PAUTA.linha_de_baixo - y) % PAUTA.espaco === 0,
  };
}

// ---------------------------------------------------------------------
// Extensão vocal — usado para "este tom serve para o cantor?"
// ---------------------------------------------------------------------
/** `extensao` = { grave: 'E3', agudo: 'C5' }. `notas` = MIDI ou nomes. */
function cabeNaExtensao(notas, extensao) {
  const g = midiDe(extensao && extensao.grave);
  const a = midiDe(extensao && extensao.agudo);
  if (g == null || a == null) return null;
  const ms = (notas || []).map((n) => (typeof n === 'number' ? n : midiDe(n))).filter((x) => x != null);
  if (!ms.length) return null;
  const min = Math.min(...ms); const max = Math.max(...ms);
  return { cabe: min >= g && max <= a, falta_grave: Math.max(0, g - min), falta_agudo: Math.max(0, max - a) };
}

module.exports = {
  CROMATICA, CROMATICA_BEMOL, INTERVALOS, ESCALAS, ACORDES, LA4_HZ,
  semAcento, lerNota, mesmaAltura, nomeCifra, nomePt, nomeDaNota,
  midiDe, freqDeMidi, midiDeFreq, centsEntre, notaDeFreq,
  intervaloDe, lerIntervalo, escala, acorde, cifraDe, lerCifra,
  PAUTA, grauDiatonico, posicaoNaPauta,
  transporPc, transporCifra, semitonsEntreTons, cabeNaExtensao,
};
