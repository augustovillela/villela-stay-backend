// =====================================================================
// Musique — CURRÍCULO: o catálogo de exercícios e a geração dos itens.
//
// ⚠️ PURO. Não lê banco, não sabe quem é o aluno. Geração é
// DETERMINÍSTICA a partir de uma semente: a mesma semente devolve o
// mesmo item, sempre.
//
// Por que determinística, e não aleatória de verdade:
//   · o aluno recarrega a página e continua o MESMO exercício, em vez
//     de ganhar outro por acidente;
//   · o professor consegue reproduzir exatamente o que o aluno viu ao
//     conferir uma contestação de nota;
//   · o teste consegue afirmar o gabarito sem congelar `Math.random`.
//
// O QUE ENTRA AQUI (decisão Q5 do Augusto): só exercício cuja medida é
// confiável. Percepção de acorde existe como MÚLTIPLA ESCOLHA — o
// acorde é TOCADO pelo sistema e o aluno escolhe. O que não entra é
// avaliar o aluno TOCANDO um acorde: polifonia captada por microfone
// não é medida com confiança suficiente, e fingir que é queima o
// produto no primeiro uso.
// =====================================================================
'use strict';
const T = require('./teoria');

// ---------------------------------------------------------------------
// Sorteio determinístico
// ---------------------------------------------------------------------
function semente(txt) {
  let h = 2166136261;
  for (const ch of String(txt)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function sorteador(sem) {
  let a = semente(sem);
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const escolher = (r, lista) => lista[Math.floor(r() * lista.length) % lista.length];
const embaralhar = (r, lista) => {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// ---------------------------------------------------------------------
// Faixas por nível (1 = primeiras notas · 5 = avançado)
// ---------------------------------------------------------------------
const NIVEIS = [1, 2, 3, 4, 5];
const clamp = (n) => Math.min(5, Math.max(1, Number(n) || 1));

const INTERVALOS_POR_NIVEL = {
  1: [0, 5, 7, 12],                         // uníssono, 4J, 5J, 8ª — os "âncoras"
  2: [0, 2, 4, 5, 7, 9, 12],                // + 2M, 3M, 6M
  3: [0, 1, 2, 3, 4, 5, 7, 8, 9, 12],       // + menores
  4: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  5: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};
const ACORDES_POR_NIVEL = {
  1: ['maior', 'menor'],
  2: ['maior', 'menor', 'diminuto'],
  3: ['maior', 'menor', 'diminuto', 'aumentado', 'sus4'],
  4: ['maior', 'menor', 'diminuto', 'aumentado', 'sus2', 'sus4', 'dominante7', 'maior7', 'menor7'],
  5: Object.keys(T.ACORDES),
};
const ESCALAS_POR_NIVEL = {
  1: ['maior', 'menor_natural'],
  2: ['maior', 'menor_natural', 'pentatonica_maior', 'pentatonica_menor'],
  3: ['maior', 'menor_natural', 'menor_harmonica', 'pentatonica_maior', 'pentatonica_menor', 'blues'],
  4: ['maior', 'menor_natural', 'menor_harmonica', 'menor_melodica', 'dorico', 'mixolidio', 'blues'],
  5: Object.keys(T.ESCALAS),
};
// Tônicas fáceis primeiro: sem alteração, depois com.
const TONICAS_POR_NIVEL = {
  1: ['C', 'G', 'F'],
  2: ['C', 'G', 'D', 'F', 'A'],
  3: ['C', 'G', 'D', 'A', 'E', 'F', 'Bb'],
  4: ['C', 'G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Eb', 'Ab'],
  5: T.CROMATICA,
};
const GRAUS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// ---------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------
// `modo` = como o aluno responde · `familia` = para a repetição espaçada
// agrupar o que é a mesma habilidade.
const TIPOS = {
  'teoria.intervalo': {
    pt: 'Nomear o intervalo entre duas notas escritas', familia: 'intervalo',
    modo: 'escolha', mic: false, nivel_min: 1,
  },
  'percepcao.intervalo': {
    pt: 'Ouvir duas notas e reconhecer o intervalo', familia: 'intervalo',
    modo: 'escolha', mic: false, nivel_min: 1,
  },
  'percepcao.acorde': {
    pt: 'Ouvir um acorde e reconhecer a qualidade', familia: 'acorde',
    modo: 'escolha', mic: false, nivel_min: 1,
  },
  'percepcao.escala': {
    pt: 'Ouvir uma escala e reconhecer o tipo', familia: 'escala',
    modo: 'escolha', mic: false, nivel_min: 2,
  },
  'leitura.nota': {
    pt: 'Ler a nota na pauta', familia: 'leitura',
    modo: 'escolha', mic: false, nivel_min: 1,
  },
  'ditado.melodico': {
    pt: 'Ouvir uma melodia curta e escrever as notas', familia: 'ditado',
    modo: 'texto', mic: false, nivel_min: 2,
  },
  'escala.montar': {
    pt: 'Escrever as notas de uma escala', familia: 'escala',
    modo: 'texto', mic: false, nivel_min: 2,
  },
  'acorde.montar': {
    pt: 'Escrever as notas de um acorde', familia: 'acorde',
    modo: 'texto', mic: false, nivel_min: 2,
  },
  'harmonia.grau': {
    pt: 'Dizer qual acorde corresponde ao grau da tonalidade', familia: 'harmonia',
    modo: 'texto', mic: false, nivel_min: 3,
  },
  'afinacao.sustentada': {
    pt: 'Cantar ou tocar uma nota e sustentá-la afinada', familia: 'afinacao',
    modo: 'sustentada', mic: true, nivel_min: 1,
  },
  'ritmo.palma': {
    pt: 'Bater o padrão rítmico com palmas', familia: 'ritmo',
    modo: 'palma', mic: true, nivel_min: 1,
  },
  'melodia.tocar': {
    pt: 'Tocar ou cantar a melodia', familia: 'melodia',
    modo: 'instrumento', mic: true, nivel_min: 2,
  },
};

const listarTipos = () => Object.entries(TIPOS).map(([id, t]) => ({ id, ...t }));

// ---------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------
/**
 * Gera um item. Devolve TUDO que a tela precisa, inclusive o `contrato`
 * (o que se mede e com que tolerância) — que, por decisão Q5, aparece
 * ANTES de o aluno responder.
 *
 * O gabarito vem separado em `esperado`: quem chama decide se manda para
 * o cliente (prática) ou guarda (prova).
 */
function gerarItem({ tipo, nivel = 1, sem = 'x' } = {}) {
  const def = TIPOS[tipo];
  if (!def) throw new Error(`Tipo de exercício desconhecido: "${tipo}".`);
  const n = clamp(nivel);
  if (n < def.nivel_min) throw new Error(`"${tipo}" começa no nível ${def.nivel_min}.`);
  const r = sorteador(`${tipo}|${n}|${sem}`);

  const item = GERADORES[tipo](r, n);
  return {
    tipo, nivel: n, semente: String(sem), familia: def.familia,
    modo: def.modo, exige_microfone: def.mic,
    ...item,
  };
}

const GERADORES = {
  'teoria.intervalo'(r, n) {
    const semitons = escolher(r, INTERVALOS_POR_NIVEL[n]);
    const base = escolher(r, TONICAS_POR_NIVEL[n]);
    const pcBase = T.lerNota(base).pc;
    const pcTopo = (pcBase + semitons) % 12;
    const iv = T.intervaloDe(semitons);
    return {
      enunciado: `Qual é o intervalo entre ${T.nomePt(pcBase)} e ${T.nomePt(pcTopo)}?`,
      dica: 'Conte os semitons entre as duas notas.',
      opcoes: opcoesIntervalo(r, semitons, n),
      esperado: { tipo: 'intervalo', valor: iv.curto },
      tocar: null,
    };
  },

  'percepcao.intervalo'(r, n) {
    const semitons = escolher(r, INTERVALOS_POR_NIVEL[n]);
    const midiBase = 55 + Math.floor(r() * 10);   // sol3 a fá4: região confortável
    const iv = T.intervaloDe(semitons);
    return {
      enunciado: 'Ouça as duas notas e diga qual é o intervalo.',
      dica: n <= 2 ? 'Cante as duas notas antes de responder — a voz ajuda o ouvido.' : '',
      opcoes: opcoesIntervalo(r, semitons, n),
      esperado: { tipo: 'intervalo', valor: iv.curto },
      // O cliente sintetiza; o servidor manda O QUE tocar, não o áudio.
      tocar: { tipo: 'sequencia', midi: [midiBase, midiBase + semitons], dur_ms: 900, gap_ms: 120 },
    };
  },

  'percepcao.acorde'(r, n) {
    const tipos = ACORDES_POR_NIVEL[n];
    const tipo = escolher(r, tipos);
    const fund = escolher(r, TONICAS_POR_NIVEL[n]);
    const pc = T.lerNota(fund).pc;
    const midiFund = 48 + pc;
    return {
      enunciado: 'Ouça o acorde e diga qual é a qualidade dele.',
      dica: n <= 2 ? 'Maior soa aberto; menor soa mais fechado.' : '',
      opcoes: embaralhar(r, tipos).map((k) => ({ valor: k, rotulo: T.ACORDES[k].pt })),
      esperado: { tipo: 'texto', valor: tipo },
      tocar: { tipo: 'acorde', midi: T.ACORDES[tipo].graus.map((g) => midiFund + g), dur_ms: 1800 },
    };
  },

  'percepcao.escala'(r, n) {
    const tipos = ESCALAS_POR_NIVEL[n];
    const tipo = escolher(r, tipos);
    const tonica = escolher(r, TONICAS_POR_NIVEL[n]);
    const pc = T.lerNota(tonica).pc;
    const midis = T.ESCALAS[tipo].graus.map((g) => 60 + pc + g).concat([60 + pc + 12]);
    return {
      enunciado: 'Ouça a escala e diga qual é o tipo.',
      dica: '',
      opcoes: embaralhar(r, tipos).map((k) => ({ valor: k, rotulo: T.ESCALAS[k].pt })),
      esperado: { tipo: 'texto', valor: tipo },
      tocar: { tipo: 'sequencia', midi: midis, dur_ms: 380, gap_ms: 30 },
    };
  },

  'leitura.nota'(r, n) {
    // clave de sol; faixa cresce com o nível
    const faixa = { 1: [60, 72], 2: [59, 76], 3: [55, 79], 4: [52, 84], 5: [48, 88] }[n];
    // Até o nível 3, SÓ NOTAS NATURAIS. Ler acidente é habilidade
    // separada, e vem depois de ler a linha. (Também evita o defeito de
    // desenhar a cabeça sem o sinal — mas a razão principal é pedagógica.)
    const naturais = [0, 2, 4, 5, 7, 9, 11];
    let midi = faixa[0] + Math.floor(r() * (faixa[1] - faixa[0] + 1));
    if (n <= 3) {
      const candidatos = [];
      for (let m = faixa[0]; m <= faixa[1]; m++) if (naturais.includes(((m % 12) + 12) % 12)) candidatos.push(m);
      midi = escolher(r, candidatos);
    }
    const pc = ((midi % 12) + 12) % 12;
    const opcoes = embaralhar(r, alternativasPc(r, pc, 4, n <= 3 ? naturais : null))
      .map((p) => ({ valor: T.nomeCifra(p), rotulo: T.nomePt(p) }));
    return {
      enunciado: 'Que nota está escrita na pauta?',
      dica: n === 1 ? 'As linhas da clave de sol, de baixo para cima: mi, sol, si, ré, fá.' : '',
      opcoes,
      esperado: { tipo: 'nota', valor: T.nomeCifra(pc) },
      // A geometria vem PRONTA do servidor (teoria.posicaoNaPauta), onde
      // é pura e testada. Calculá-la no desenho da tela já custou um
      // defeito: a nota saía um grau acima e o exercício reprovava quem
      // lia certo.
      partitura: { clave: 'sol', midi, ...T.posicaoNaPauta(midi) },
      tocar: null,
    };
  },

  'ditado.melodico'(r, n) {
    const tamanho = { 1: 3, 2: 3, 3: 4, 4: 5, 5: 6 }[n];
    const tonica = escolher(r, TONICAS_POR_NIVEL[n]);
    const tipo = n <= 2 ? 'maior' : escolher(r, ['maior', 'menor_natural']);
    const pcs = T.escala(tonica, tipo);
    const base = 60 + T.lerNota(tonica).pc;
    const graus = [0];                                  // começa na tônica: dá referência
    for (let i = 1; i < tamanho; i++) {
      const passo = Math.floor(r() * (n <= 2 ? 3 : 5)) - (n <= 2 ? 1 : 2);
      graus.push(Math.max(0, Math.min(pcs.length - 1, graus[i - 1] + (passo || 1))));
    }
    const midis = graus.map((g) => base + T.ESCALAS[tipo].graus[g]);
    const notas = midis.map((m) => T.nomeCifra(((m % 12) + 12) % 12));
    return {
      enunciado: `Ouça a melodia (${tamanho} notas) e escreva as notas na ordem.`,
      dica: `A tônica é ${T.nomePt(T.lerNota(tonica).pc)} e a melodia começa nela.`,
      opcoes: null,
      esperado: { tipo: 'texto', valor: [notas.join(' '), notas.map((c) => T.nomePt(T.lerNota(c).pc)).join(' ')] },
      tocar: { tipo: 'sequencia', midi: midis, dur_ms: 600, gap_ms: 60, repeticoes: 3 },
    };
  },

  'escala.montar'(r, n) {
    const tipo = escolher(r, ESCALAS_POR_NIVEL[n]);
    const tonica = escolher(r, TONICAS_POR_NIVEL[n]);
    const pc = T.lerNota(tonica).pc;
    return {
      enunciado: `Escreva as notas da escala de ${T.nomePt(pc)} ${T.ESCALAS[tipo].pt}.`,
      dica: 'Pode escrever em português (dó ré mi) ou em cifra (C D E). A ordem não importa.',
      opcoes: null,
      esperado: { tipo: 'notas', valor: T.escala(tonica, tipo) },
      tocar: null,
    };
  },

  'acorde.montar'(r, n) {
    const tipo = escolher(r, ACORDES_POR_NIVEL[n]);
    const fund = escolher(r, TONICAS_POR_NIVEL[n]);
    const pc = T.lerNota(fund).pc;
    return {
      enunciado: `Quais notas formam o acorde ${T.cifraDe(fund, tipo)} `
        + `(${T.nomePt(pc)} ${T.ACORDES[tipo].pt})?`,
      dica: 'Escreva as notas separadas por espaço.',
      opcoes: null,
      esperado: { tipo: 'notas', valor: T.acorde(fund, tipo) },
      tocar: null,
    };
  },

  'harmonia.grau'(r, n) {
    const tonica = escolher(r, TONICAS_POR_NIVEL[n]);
    const pc = T.lerNota(tonica).pc;
    const grau = Math.floor(r() * (n >= 4 ? 7 : 5));    // até o V nos níveis 3
    const graus = T.ESCALAS.maior.graus;
    const pcAcorde = (pc + graus[grau]) % 12;
    // campo harmônico maior: I ii iii IV V vi vii°
    const tipos = ['maior', 'menor', 'menor', 'maior', 'maior', 'menor', 'diminuto'];
    const tipo = tipos[grau];
    return {
      enunciado: `Na tonalidade de ${T.nomePt(pc)} maior, qual acorde é o grau ${GRAUS[grau]}?`,
      dica: 'Responda em cifra, por exemplo "Am" ou "G7".',
      opcoes: null,
      esperado: { tipo: 'cifra', valor: T.nomeCifra(pcAcorde) + T.ACORDES[tipo].sufixo },
      tocar: null,
    };
  },

  'afinacao.sustentada'(r, n) {
    const faixa = { 1: [60, 67], 2: [57, 69], 3: [55, 72], 4: [53, 76], 5: [48, 79] }[n];
    const midi = faixa[0] + Math.floor(r() * (faixa[1] - faixa[0] + 1));
    const pc = ((midi % 12) + 12) % 12;
    const tol = { 1: 35, 2: 30, 3: 25, 4: 20, 5: 15 }[n];
    return {
      enunciado: `Ouça a referência e sustente ${T.nomePt(pc)} por cerca de 3 segundos.`,
      dica: 'Respire antes, apoie o som e evite deixar a nota cair no fim.',
      opcoes: null,
      esperado: { nota: T.nomeCifra(pc) + (Math.floor(midi / 12) - 1) },
      tolerancia: { cents: tol },
      tocar: { tipo: 'referencia', midi: [midi], dur_ms: 2000 },
    };
  },

  'ritmo.palma'(r, n) {
    const bpm = { 1: 70, 2: 80, 3: 90, 4: 100, 5: 110 }[n];
    const vocabulario = {
      1: [1, 1, 1, 1], 2: [1, 0.5, 0.5, 1, 1], 3: [0.5, 0.5, 1, 0.5, 0.5, 1],
      4: [1, 0.5, 0.25, 0.25, 1, 1], 5: [0.5, 0.25, 0.25, 0.5, 0.5, 1, 1],
    };
    const figuras = embaralhar(r, vocabulario[n]);
    return {
      enunciado: `Ouça o padrão e bata com palmas, a ${bpm} BPM.`,
      dica: 'Deixe o metrônomo rodar dois compassos antes de começar.',
      opcoes: null,
      esperado: { bpm, figuras },
      tolerancia: { fracao: { 1: 0.18, 2: 0.16, 3: 0.14, 4: 0.12, 5: 0.1 }[n] },
      tocar: { tipo: 'ritmo', bpm, figuras, contagem: 4 },
    };
  },

  'melodia.tocar'(r, n) {
    const d = GERADORES['ditado.melodico'](r, n);
    const midis = d.tocar.midi;
    return {
      enunciado: 'Ouça a melodia e toque (ou cante) de volta.',
      dica: 'Pode tocar em qualquer oitava — o que conta é a altura das notas.',
      opcoes: null,
      esperado: {
        notas: midis.map((m) => T.nomeCifra(((m % 12) + 12) % 12) + (Math.floor(m / 12) - 1)),
        oitava_livre: true,
      },
      tolerancia: { cents: { 1: 60, 2: 55, 3: 50, 4: 45, 5: 40 }[n] },
      tocar: { tipo: 'sequencia', midi: midis, dur_ms: 600, gap_ms: 60, repeticoes: 2 },
    };
  },
};

/** Alternativas de intervalo: as erradas são VIZINHAS da certa, não
 *  sorteadas do nada — alternativa absurda deixa acertar por eliminação
 *  e mede lógica, não ouvido. */
function opcoesIntervalo(r, semitons, nivel) {
  const universo = INTERVALOS_POR_NIVEL[nivel];
  const perto = [...universo].sort((a, b) => Math.abs(a - semitons) - Math.abs(b - semitons));
  const set = [...new Set([semitons, ...perto])].slice(0, 4);
  return embaralhar(r, set).map((s) => {
    const iv = T.intervaloDe(s);
    return { valor: iv.curto, rotulo: iv.pt };
  });
}

/**
 * Distratores de nota: graus VIZINHOS, pelo mesmo motivo das opções de
 * intervalo. `universo` restringe as alternativas — num exercício só de
 * naturais, oferecer "lá sustenido" ensinaria a eliminar pelo formato da
 * alternativa, não pela leitura.
 */
function alternativasPc(r, pc, quantas, universo) {
  const permitido = (x) => !universo || universo.includes(x);
  const perto = [pc];
  for (let d = 1; perto.length < quantas && d < 12; d++) {
    if (permitido((pc + d) % 12)) perto.push((pc + d) % 12);
    if (perto.length < quantas && permitido((pc - d + 12) % 12)) perto.push((pc - d + 12) % 12);
  }
  return [...new Set(perto)].slice(0, quantas);
}

// ---------------------------------------------------------------------
// Repetição espaçada (SM-2 simplificado)
// ---------------------------------------------------------------------
/**
 * Decide quando o item volta. Trabalha em DIAS, sobre o par
 * (família, nível) — não sobre o item, porque o item é gerado e nunca
 * se repete igual; o que se revisa é a HABILIDADE.
 *
 * `estado` = { acertos_seguidos, intervalo_dias, facilidade }
 */
function proximaRevisao(estado = {}, { acertou, confianca = 1 } = {}) {
  let facilidade = Number(estado.facilidade) || 2.5;
  let acertosSeguidos = Number(estado.acertos_seguidos) || 0;
  let intervalo = Number(estado.intervalo_dias) || 0;

  // Medida em que não se confia não empurra o item para longe: seria
  // "aprovar" o aluno com base num sinal ruim.
  const contaComoAcerto = acertou && confianca >= 0.7;

  if (contaComoAcerto) {
    acertosSeguidos += 1;
    intervalo = acertosSeguidos === 1 ? 1 : acertosSeguidos === 2 ? 3 : Math.round(intervalo * facilidade);
    facilidade = Math.min(2.8, facilidade + 0.06);
  } else {
    acertosSeguidos = 0;
    intervalo = acertou ? 1 : 0;     // errou: volta hoje mesmo
    facilidade = Math.max(1.3, facilidade - 0.22);
  }
  return {
    acertos_seguidos: acertosSeguidos,
    intervalo_dias: Math.min(180, intervalo),
    facilidade: Number(facilidade.toFixed(2)),
    revisar_em_dias: Math.min(180, intervalo),
  };
}

/** Sobe/desce de nível pelo desempenho recente. Subir cedo demais faz o
 *  aluno desistir; nunca subir faz ele achar o produto infantil. */
function ajustarNivel(nivelAtual, ultimas = []) {
  const n = clamp(nivelAtual);
  const validas = ultimas.filter((u) => u && u.vale_nota !== false);
  if (validas.length < 5) return { nivel: n, mudou: false, motivo: 'ainda sem tentativas suficientes' };
  const taxa = validas.filter((u) => u.acerto).length / validas.length;
  if (taxa >= 0.85 && n < 5) return { nivel: n + 1, mudou: true, motivo: `${Math.round(taxa * 100)}% de acerto nas últimas ${validas.length}` };
  if (taxa < 0.45 && n > 1) return { nivel: n - 1, mudou: true, motivo: `${Math.round(taxa * 100)}% de acerto nas últimas ${validas.length}` };
  return { nivel: n, mudou: false, motivo: `${Math.round(taxa * 100)}% de acerto — faixa boa para continuar` };
}

module.exports = {
  TIPOS, NIVEIS, GRAUS, listarTipos, gerarItem, proximaRevisao, ajustarNivel,
  sorteador, semente,
  INTERVALOS_POR_NIVEL, ACORDES_POR_NIVEL, ESCALAS_POR_NIVEL, TONICAS_POR_NIVEL,
};
