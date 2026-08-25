// =====================================================================
// Musique — DIGITAÇÕES DE VIOLÃO. Puro: sem banco, sem usuário.
//
// As formas são CALCULADAS a partir da teoria, não decoradas numa
// tabela. Tabela cobriria os trinta acordes que alguém teve paciência
// de digitar e devolveria "não sei" para o Bbm7(b5) que apareceu na
// cifra do usuário — que é exatamente o acorde para o qual ele precisa
// do desenho.
//
// O QUE UMA DIGITAÇÃO PRECISA RESPEITAR PARA SER TOCÁVEL, e que um
// gerador ingênuo ignora:
//
//   · todas as notas soando têm de pertencer ao acorde;
//   · todas as notas do acorde têm de aparecer (senão não é o acorde);
//   · a nota mais grave deve ser a fundamental — ou o baixo pedido em
//     cifras como C/G;
//   · os trastes usados têm de caber na mão: uma janela de 4 casas;
//   · corda muda no MEIO de cordas soando é impossível de tocar limpo
//     no violão — desenhar isso é desenhar o que a mão não faz.
//
// A afinação padrão é o único caso tratado. Afinação alternativa
// (drop D, D-A-D-G-A-D) é fase futura, e a resposta diz isso em vez de
// devolver forma errada.
// =====================================================================
'use strict';
const T = require('./teoria');
const chordpro = require('./chordpro');

// mi2 lá2 ré3 sol3 si3 mi4 — da 6ª (mais grave) para a 1ª
const CORDAS_PADRAO = [40, 45, 50, 55, 59, 64];
const JANELA = 4;          // casas que a mão alcança sem deslocar
const MAX_CASA = 12;

/**
 * Formas para um acorde. `cifra` pode ser qualquer coisa que o
 * `chordpro.lerAcorde` entenda: "C", "Am7", "F#m7(b5)", "C/G", "Solm".
 *
 * Devolve até `quantas` formas, da mais fácil para a mais difícil.
 */
function formas(cifra, { quantas = 3, cordas = CORDAS_PADRAO } = {}) {
  const ac = chordpro.lerAcorde(cifra);
  if (!ac) return { cifra, formas: [], motivo: `Não reconheci "${cifra}" como acorde.` };

  const notas = notasDoAcorde(ac);
  if (!notas) {
    return { cifra, formas: [],
      motivo: `Sei ler a cifra "${cifra}", mas ainda não sei montar o desenho desse tipo de acorde. `
        + 'A transposição e a reprodução continuam funcionando.' };
  }
  const baixoPc = ac.baixoPc == null ? ac.pc : ac.baixoPc;

  const achadas = [];
  for (let base = 0; base + JANELA <= MAX_CASA + JANELA; base++) {
    for (const f of buscarNaJanela(cordas, notas, baixoPc, base)) achadas.push(f);
    if (achadas.length > 60) break;
  }

  const unicas = [];
  const vistas = new Set();
  for (const f of achadas.sort((a, b) => a.dificuldade - b.dificuldade)) {
    const chave = f.casas.join(',');
    if (vistas.has(chave)) continue;
    vistas.add(chave); unicas.push(f);
    if (unicas.length >= quantas) break;
  }

  return {
    cifra, fundamental: T.nomeCifra(ac.pc), notas: notas.map((pc) => T.nomeCifra(pc)),
    formas: unicas,
    motivo: unicas.length ? '' : 'Não achei uma digitação tocável para este acorde nas 12 primeiras casas.',
  };
}

/** Pitch classes do acorde, incluindo o baixo quando é cifra com barra. */
function notasDoAcorde(ac) {
  const sufixo = normalizarSufixo(ac.sufixo);
  const tipo = Object.keys(T.ACORDES).find((k) => normalizarSufixo(T.ACORDES[k].sufixo) === sufixo);
  if (!tipo) return null;
  const pcs = T.ACORDES[tipo].graus.map((g) => (ac.pc + g) % 12);
  if (ac.baixoPc != null && !pcs.includes(ac.baixoPc)) pcs.push(ac.baixoPc);
  return [...new Set(pcs)];
}

/**
 * Normaliza o sufixo da cifra. Cifra real é escrita de muitos jeitos
 * para o mesmo acorde — `Cmaj7`, `C7M`, `CM7` são o mesmo — e recusar a
 * grafia do usuário seria recusar a cifra que ele já tem guardada.
 *
 * O sufixo do catálogo passa pela MESMA normalização, senão `m7(b5)`
 * (como está em `teoria.ACORDES`) nunca casaria com `m7b5` digitado.
 */
function normalizarSufixo(sufixo) {
  const x = String(sufixo || '').trim().toLowerCase().replace(/[()\s]/g, '');
  const ALIAS = {
    'maj7': '7m', 'maj': '', 'M7': '7m', '△': '7m',
    '-': 'm', 'min': 'm', '°': 'dim', 'o': 'dim', '+': 'aug',
    'ø': 'm7b5', 'm7-5': 'm7b5', '7+': 'aug',
  };
  const direto = ALIAS[x] !== undefined ? ALIAS[x] : x;
  // `7m` acima é o "sétima maior" escrito ao contrário nas cifras
  // brasileiras (`C7M`); o catálogo usa `7M`.
  return direto === '7m' ? '7m' : direto;
}

/** Busca digitações numa janela de casas. */
function buscarNaJanela(cordas, notas, baixoPc, base) {
  // Opções por corda: -1 = muda · 0 = solta (se a nota solta serve) ·
  // casa dentro da janela cuja nota pertença ao acorde.
  const opcoes = cordas.map((aberta) => {
    const lista = [-1];
    if (notas.includes(aberta % 12)) lista.push(0);
    for (let c = Math.max(1, base); c <= base + JANELA; c++) {
      if (notas.includes((aberta + c) % 12)) lista.push(c);
    }
    return lista;
  });

  const saida = [];
  const atual = new Array(cordas.length);

  (function combinar(i) {
    if (saida.length > 24) return;
    if (i === cordas.length) {
      const f = avaliar(cordas, atual, notas, baixoPc);
      if (f) saida.push(f);
      return;
    }
    for (const op of opcoes[i]) { atual[i] = op; combinar(i + 1); }
  })(0);

  return saida;
}

/** Valida e pontua uma combinação. Devolve null quando não é tocável. */
function avaliar(cordas, casas, notas, baixoPc) {
  const soando = [];
  for (let i = 0; i < cordas.length; i++) if (casas[i] >= 0) soando.push({ i, midi: cordas[i] + casas[i] });
  if (soando.length < 4) return null;                    // acorde de violão com 3 cordas soa pobre

  // Corda muda NO MEIO das que soam não se toca limpo. As mudas
  // aceitáveis ficam nas pontas (graves ou agudas).
  const primeiro = soando[0].i, ultimo = soando[soando.length - 1].i;
  for (let i = primeiro; i <= ultimo; i++) if (casas[i] < 0) return null;

  // Todas as notas do acorde presentes
  const pcs = new Set(soando.map((x) => x.midi % 12));
  for (const n of notas) if (!pcs.has(n)) return null;

  // A mais grave tem de ser o baixo pedido
  if (soando[0].midi % 12 !== baixoPc) return null;

  const presas = casas.filter((c) => c > 0);
  const menor = presas.length ? Math.min(...presas) : 0;
  const maior = presas.length ? Math.max(...presas) : 0;
  const estica = maior - menor;
  if (estica > JANELA) return null;

  // PESTANA. Um dedo deitado na casa `menor` pressiona TODAS as cordas
  // que ele cobre — então nenhuma corda dentro do vão da pestana pode
  // estar solta nem presa numa casa mais baixa. Sem esta checagem o
  // gerador desenhava coisas como "pestana na casa 2 com a 5ª solta",
  // que a mão simplesmente não faz.
  // Duas ocorrências já bastam: no si menor padrão (x24432) só a 5ª e a
  // 1ª corda ficam na casa 2, e o dedo deitado cobre as duas — as outras
  // são presas por cima. Exigir três ocorrências rejeitava a pestana mais
  // ensinada do violão.
  const naMenor = [];
  casas.forEach((c, i) => { if (c === menor && c > 0) naMenor.push(i); });
  let pestana = 0;
  if (naMenor.length >= 2) {
    const de = naMenor[0], ate = naMenor[naMenor.length - 1];
    let valida = true;
    for (let i = de; i <= ate; i++) if (casas[i] === 0 || (casas[i] > 0 && casas[i] < menor)) valida = false;
    if (valida) pestana = menor;
  }
  // Sem pestana, cada nota presa custa um dedo — e a mão tem quatro.
  const dedos = pestana ? 1 + presas.filter((c) => c > pestana).length : presas.length;
  if (dedos > 4) return null;

  // Corda muda no GRAVE é normal (não se toca a 6ª no dó); no AGUDO é
  // mais difícil, porque a mão direita tem de evitar a corda no meio da
  // batida. Pesos diferentes, porque a dificuldade é diferente.
  let mudasGrave = 0; let mudasAgudo = 0;
  casas.forEach((c, i) => { if (c < 0) (i < primeiro ? mudasGrave++ : mudasAgudo++); });

  return {
    casas: [...casas],
    // notação de cifra: "x32010"
    desenho: casas.map((c) => (c < 0 ? 'x' : c > 9 ? String.fromCharCode(87 + c) : String(c))).join(''),
    posicao: menor || 0,
    pestana,
    dedos,
    cordas_mudas: mudasGrave + mudasAgudo,
    notas: soando.map((x) => T.nomePt(x.midi % 12)),
    // O que faz uma forma ser difícil, na ordem em que pesa de verdade:
    // esticar a mão, usar muitos dedos, calar corda aguda no meio da
    // batida — e SAIR DA PRIMEIRA POSIÇÃO. Este último pesa 1 por casa
    // de propósito: uma pestana lá em cima usa um dedo só e o gerador
    // a considerava "fácil", oferecendo pestana na 10ª casa para um Dm
    // que se toca aberto. Perto do braço é onde o resto da música está.
    dificuldade: dedos * 2 + estica * 2 + mudasGrave * 1.5 + mudasAgudo * 3
      + (menor || 0) + (pestana ? 1 : 0),
  };
}

/** Diagramas para todos os acordes de uma cifra, de uma vez. */
function formasDaCifra(doc, opcoes = {}) {
  return chordpro.acordesUsados(doc).map((a) => formas(a.cifra, opcoes));
}

module.exports = { formas, formasDaCifra, CORDAS_PADRAO, JANELA, notasDoAcorde };
