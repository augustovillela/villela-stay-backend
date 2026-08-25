// =====================================================================
// Musique — CIFRA ESTRUTURADA (ChordPro). Puro: sem banco, sem usuário.
//
// Por que ChordPro e não "texto com acordes em cima":
//   · a posição do acorde fica AMARRADA à sílaba, então transpor não
//     desalinha nada — o problema nº 1 de quem guarda cifra em .txt;
//   · dá para transpor, pôr capotraste e mudar de instrumento com
//     ARITMÉTICA, não com adivinhação;
//   · é texto simples, o músico consegue ler e colar de onde já tem.
//
// A REGRA QUE MANDA NA GRAFIA: o acorde é reescrito com sustenido ou
// bemol conforme o TOM DE DESTINO, não conforme o de origem. Transpor
// dó→mi bemol e continuar escrevendo "D#" está tecnicamente certo em
// altura e errado em leitura: ninguém toca em "ré sustenido maior".
//
// ⚠️ O que este arquivo NÃO faz: adivinhar acorde de texto solto. Linha
// que não é diretiva e não tem colchete é LETRA. Tentar inferir cifra
// de "Am" no meio de uma frase acertaria às vezes e estragaria a letra
// nas outras — e o usuário não teria como saber qual foi.
// =====================================================================
'use strict';
const T = require('./teoria');

// ---------------------------------------------------------------------
// Grafia por tonalidade
// ---------------------------------------------------------------------
// Tons que se escrevem com bemol (fá, si♭, mi♭, lá♭, ré♭, sol♭ e seus
// relativos menores). Fora daí, sustenido.
const PC_COM_BEMOL = new Set([5, 10, 3, 8, 1, 6]);
const preferBemol = (tomPc) => (tomPc == null ? false : PC_COM_BEMOL.has(((tomPc % 12) + 12) % 12));

// ---------------------------------------------------------------------
// Acorde dentro do colchete
// ---------------------------------------------------------------------
// Aceita muito mais do que os tipos canônicos de `teoria.ACORDES`:
// cifra real tem "C/G", "Am7(9)", "D7M/F#", "Bsus4". O que interessa é
// separar a FUNDAMENTAL (e o baixo) do resto — o resto viaja intacto.
const RE_ACORDE = /^([A-Ga-g](?:#|b|♯|♭)?|d[oó]|r[eé]|mi|f[aá]|sol|l[aá]|si)((?:#|b|♯|♭)?)(.*)$/i;

/**
 * Interpreta a cifra escrita. Devolve `{ pc, sufixo, baixoPc, texto }`
 * ou null quando não parece acorde nenhum.
 */
function lerAcorde(txt) {
  const bruto = String(txt == null ? '' : txt).trim();
  if (!bruto) return null;

  const [corpo, baixo] = bruto.split('/');
  const nota = T.lerNota(cabecaDeNota(corpo));
  if (!nota || nota.oitava != null) return null;

  const sufixo = corpo.slice(tamanhoDaCabeca(corpo));
  let baixoPc = null;
  if (baixo !== undefined) {
    const b = T.lerNota(cabecaDeNota(baixo));
    if (!b) return null;            // "C/xyz" não é acorde: devolve null e vira letra
    baixoPc = b.pc;
  }
  return { pc: nota.pc, sufixo, baixoPc, texto: bruto };
}

/** O maior prefixo que ainda é nome de nota (com alteração). */
function tamanhoDaCabeca(txt) {
  for (let n = Math.min(4, txt.length); n >= 1; n--) {
    const c = txt.slice(0, n);
    const nota = T.lerNota(c);
    if (nota && nota.oitava == null) return n;
  }
  return 0;
}
const cabecaDeNota = (txt) => txt.slice(0, tamanhoDaCabeca(txt));

/** Escreve o acorde de volta, na grafia do tom de destino. */
function escreverAcorde(ac, { bemol = false } = {}) {
  if (!ac) return '';
  const raiz = T.nomeCifra(ac.pc, { bemol });
  const baixo = ac.baixoPc == null ? '' : '/' + T.nomeCifra(ac.baixoPc, { bemol });
  return raiz + ac.sufixo + baixo;
}

// ---------------------------------------------------------------------
// Análise
// ---------------------------------------------------------------------
const SECOES = {
  start_of_verse: 'verso', sov: 'verso',
  start_of_chorus: 'refrao', soc: 'refrao',
  start_of_bridge: 'ponte', sob: 'ponte',
  start_of_tab: 'tablatura', sot: 'tablatura',
};
const FIM_SECAO = new Set(['end_of_verse', 'eov', 'end_of_chorus', 'eoc',
  'end_of_bridge', 'eob', 'end_of_tab', 'eot']);

/**
 * Analisa um documento ChordPro. Preserva TUDO que não entende:
 * diretiva desconhecida vira `{ tipo: 'diretiva' }` e volta igual na
 * serialização. Descartar o que não se entende é como se perde o
 * trabalho de quem colou uma cifra de outro lugar.
 */
function analisar(texto) {
  const meta = {};
  const linhas = [];
  let secao = '';

  for (const cru of String(texto == null ? '' : texto).split(/\r?\n/)) {
    const linha = cru.replace(/\s+$/, '');
    const d = linha.match(/^\s*\{\s*([^:}]+?)\s*(?::\s*([\s\S]*?))?\s*\}\s*$/);

    if (d) {
      const nome = d[1].toLowerCase().replace(/[-\s]/g, '_');
      const valor = d[2] === undefined ? '' : d[2];
      if (SECOES[nome]) { secao = SECOES[nome]; linhas.push({ tipo: 'secao', secao, rotulo: valor }); continue; }
      if (FIM_SECAO.has(nome)) { linhas.push({ tipo: 'fim_secao', secao }); secao = ''; continue; }
      if (['comment', 'c', 'comentario'].includes(nome)) { linhas.push({ tipo: 'comentario', texto: valor }); continue; }
      meta[nome] = valor;
      linhas.push({ tipo: 'diretiva', nome, valor });
      continue;
    }

    if (!linha.trim()) { linhas.push({ tipo: 'vazia' }); continue; }

    // letra com acordes entre colchetes
    const partes = [];
    let resto = linha;
    let m;
    const RE = /\[([^\]]*)\]/;
    while ((m = RE.exec(resto)) !== null) {
      const antes = resto.slice(0, m.index);
      if (antes) partes.push({ cifra: null, texto: antes });
      partes.push({ cifra: m[1], texto: '' });
      resto = resto.slice(m.index + m[0].length);
    }
    if (resto) partes.push({ cifra: null, texto: resto });
    // junta o texto que vem DEPOIS de cada acorde ao próprio acorde: é
    // o que amarra a cifra à sílaba e o que faz o modo palco alinhar.
    const juntas = [];
    for (const p of partes) {
      if (p.cifra !== null) juntas.push({ cifra: p.cifra, texto: '' });
      else if (juntas.length && juntas[juntas.length - 1].cifra !== null && !juntas[juntas.length - 1].texto) {
        juntas[juntas.length - 1].texto = p.texto;
      } else juntas.push({ cifra: null, texto: p.texto });
    }
    linhas.push({ tipo: 'letra', secao, partes: juntas });
  }

  return { meta, linhas, tom: meta.key || meta.tom || '' };
}

/** Volta ao texto ChordPro. `analisar → serializar` é idempotente. */
function serializar(doc) {
  const out = [];
  for (const l of doc.linhas) {
    if (l.tipo === 'vazia') out.push('');
    else if (l.tipo === 'diretiva') out.push(`{${l.nome}${l.valor === '' ? '' : ': ' + l.valor}}`);
    else if (l.tipo === 'comentario') out.push(`{comment: ${l.texto}}`);
    else if (l.tipo === 'secao') out.push(`{start_of_${chaveDeSecao(l.secao)}${l.rotulo ? ': ' + l.rotulo : ''}}`);
    else if (l.tipo === 'fim_secao') out.push(`{end_of_${chaveDeSecao(l.secao)}}`);
    else out.push(l.partes.map((p) => (p.cifra !== null ? `[${p.cifra}]` : '') + p.texto).join(''));
  }
  return out.join('\n');
}
const chaveDeSecao = (s) => ({ verso: 'verse', refrao: 'chorus', ponte: 'bridge', tablatura: 'tab' }[s] || 'verse');

// ---------------------------------------------------------------------
// Transposição
// ---------------------------------------------------------------------
/**
 * Transpõe o documento inteiro em `semitons`.
 *
 * `bemol` decide a grafia; quando não vem, é deduzida do TOM DE DESTINO
 * (que é o que o músico vai ler), não do de origem.
 */
function transpor(doc, semitons, { bemol = null } = {}) {
  const n = Number(semitons) || 0;
  const tomOrigem = T.lerNota(doc.tom);
  const tomDestinoPc = tomOrigem ? T.transporPc(tomOrigem.pc, n) : null;
  const usarBemol = bemol === null ? preferBemol(tomDestinoPc) : !!bemol;

  const linhas = doc.linhas.map((l) => {
    if (l.tipo === 'letra') {
      return {
        ...l,
        partes: l.partes.map((p) => {
          if (p.cifra === null) return p;
          const ac = lerAcorde(p.cifra);
          if (!ac) return p;                       // não é acorde: passa intacto
          return {
            ...p,
            cifra: escreverAcorde({
              pc: T.transporPc(ac.pc, n),
              sufixo: ac.sufixo,
              baixoPc: ac.baixoPc == null ? null : T.transporPc(ac.baixoPc, n),
            }, { bemol: usarBemol }),
          };
        }),
      };
    }
    // a diretiva de tom acompanha
    if (l.tipo === 'diretiva' && ['key', 'tom'].includes(l.nome)) {
      const k = T.lerNota(l.valor);
      if (k) return { ...l, valor: T.nomeCifra(T.transporPc(k.pc, n), { bemol: usarBemol }) + sufixoDeTom(l.valor) };
    }
    return l;
  });

  const meta = { ...doc.meta };
  for (const k of ['key', 'tom']) {
    if (meta[k]) {
      const nota = T.lerNota(meta[k]);
      if (nota) meta[k] = T.nomeCifra(T.transporPc(nota.pc, n), { bemol: usarBemol }) + sufixoDeTom(meta[k]);
    }
  }
  return { meta, linhas, tom: meta.key || meta.tom || '' };
}

/** "Am" → "m"; preserva o "m" do tom menor ao transpor. */
const sufixoDeTom = (v) => String(v).slice(tamanhoDaCabeca(String(v).trim()));

/**
 * CAPOTRASTE. Com capo na casa N, o violonista TOCA as formas N
 * semitons ABAIXO do som que sai. Então o que se mostra a ele é a cifra
 * transposta em −N — e o som continua o mesmo.
 *
 * Devolve as duas coisas de propósito: quem lê precisa saber que está
 * vendo a forma, não o som.
 */
function comCapotraste(doc, casa) {
  const n = Math.max(0, Math.min(11, Number(casa) || 0));
  return {
    capotraste: n,
    tom_soando: doc.tom,
    tom_das_formas: n ? tomTransposto(doc.tom, -n) : doc.tom,
    documento: n ? transpor(doc, -n) : doc,
  };
}

/**
 * INSTRUMENTO TRANSPOSITOR. Sax alto (mi bemol), clarinete e trompete
 * (si bemol), trompa (fá): a nota ESCRITA é diferente da que SOA.
 * `transposicao` = quantos semitons somar ao som para obter o escrito.
 */
const INSTRUMENTOS_TRANSPOSITORES = {
  'sib': { pt: 'instrumento em si bemol (clarinete, trompete, sax tenor)', semitons: 2 },
  'mib': { pt: 'instrumento em mi bemol (sax alto, sax barítono)', semitons: 9 },
  'fa': { pt: 'instrumento em fá (trompa, corne inglês)', semitons: 7 },
  'la': { pt: 'clarinete em lá', semitons: 3 },
  'do': { pt: 'instrumento em dó (soa como escrito)', semitons: 0 },
};

function paraInstrumento(doc, chave) {
  const inst = INSTRUMENTOS_TRANSPOSITORES[String(chave || 'do').toLowerCase()];
  if (!inst) throw new Error(`Instrumento transpositor desconhecido: "${chave}".`);
  return {
    instrumento: chave, instrumento_pt: inst.pt, semitons: inst.semitons,
    tom_soando: doc.tom,
    tom_escrito: tomTransposto(doc.tom, inst.semitons),
    documento: inst.semitons ? transpor(doc, inst.semitons) : doc,
  };
}

function tomTransposto(tom, n) {
  const k = T.lerNota(tom);
  if (!k) return tom;
  const destino = T.transporPc(k.pc, n);
  return T.nomeCifra(destino, { bemol: preferBemol(destino) }) + sufixoDeTom(tom);
}

// ---------------------------------------------------------------------
// Leitura auxiliar
// ---------------------------------------------------------------------
/** Todos os acordes usados, na ordem de aparição, sem repetir. */
function acordesUsados(doc) {
  const vistos = new Set();
  const out = [];
  for (const l of doc.linhas) {
    if (l.tipo !== 'letra') continue;
    for (const p of l.partes) {
      if (p.cifra === null) continue;
      const ac = lerAcorde(p.cifra);
      if (!ac) continue;
      const chave = escreverAcorde(ac, { bemol: preferBemol(ac.pc) });
      if (!vistos.has(chave)) { vistos.add(chave); out.push({ cifra: p.cifra, pc: ac.pc, sufixo: ac.sufixo }); }
    }
  }
  return out;
}

/**
 * Só a letra, sem acorde — para busca e para leitura em voz alta.
 *
 * Linha que só tinha acordes vira vazia e é descartada: os espaços que
 * separavam dois acordes não são letra, e deixá-los faria a busca por
 * trecho casar com espaço em branco.
 */
const somenteLetra = (doc) => doc.linhas
  .filter((l) => l.tipo === 'letra')
  .map((l) => l.partes.map((p) => p.texto).join('').trim())
  .filter(Boolean)
  .join('\n');

/** Estimativa de duração (min) por número de versos — usado no setlist
 *  quando o usuário não informou a duração. É ESTIMATIVA, e quem chama
 *  precisa dizer isso na tela. */
function duracaoEstimadaMin(doc) {
  const versos = doc.linhas.filter((l) => l.tipo === 'letra').length;
  if (!versos) return null;
  return Math.max(1, Math.round(versos / 8));
}

module.exports = {
  analisar, serializar, transpor, comCapotraste, paraInstrumento,
  lerAcorde, escreverAcorde, acordesUsados, somenteLetra, duracaoEstimadaMin,
  preferBemol, tomTransposto, INSTRUMENTOS_TRANSPOSITORES,
};
