// =====================================================================
// Invente Arena — MOLDES da Arena de Inglês (fase D, lote 1: pré-A1).
// Fios 1 (vocabulário), 2 (ouvir 🔊), 3 (ler) e 6 (conversas).
// Listening: o exercício traz `audio` (texto em inglês) e o NAVEGADOR fala
// com speechSynthesis — voz PARA a criança, nada gravado, nada sai do
// aparelho. Bancos de palavras/frases curados (Cambridge Pre A1 Starters).
// =====================================================================
'use strict';

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const de = (r, lista) => lista[Math.floor(r() * lista.length)];
function embaralhar(r, lista) {
  const l = [...lista];
  for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
  return l;
}
const escolha = (r, certa, erradas) => embaralhar(r, [certa, ...erradas]);

// ---- BANCOS CURADOS (EN, PT, distratores EN) ----
const VOCAB = {
  'EN-PA1-CORES.2': [['red', 'vermelho'], ['blue', 'azul'], ['green', 'verde'], ['yellow', 'amarelo'], ['black', 'preto'], ['white', 'branco'], ['orange', 'laranja'], ['purple', 'roxo']],
  'EN-PA1-NUMEROS.2': [['one', 'um (1)'], ['two', 'dois (2)'], ['three', 'três (3)'], ['five', 'cinco (5)'], ['seven', 'sete (7)'], ['ten', 'dez (10)'], ['twelve', 'doze (12)'], ['twenty', 'vinte (20)']],
  'EN-PA1-FAMILIA.2': [['mother', 'mãe'], ['father', 'pai'], ['brother', 'irmão'], ['sister', 'irmã'], ['grandmother', 'avó'], ['grandfather', 'avô'], ['baby', 'bebê']],
  'EN-PA1-ANIMAIS.2': [['dog', 'cachorro'], ['cat', 'gato'], ['bird', 'pássaro'], ['fish', 'peixe'], ['horse', 'cavalo'], ['elephant', 'elefante'], ['monkey', 'macaco'], ['duck', 'pato']],
  'EN-PA1-COMIDA.3': [['apple', 'maçã'], ['banana', 'banana'], ['bread', 'pão'], ['milk', 'leite'], ['water', 'água'], ['egg', 'ovo'], ['rice', 'arroz'], ['ice cream', 'sorvete']],
  'EN-PA1-ESCOLA.3': [['book', 'livro'], ['pencil', 'lápis'], ['school', 'escola'], ['teacher', 'professor(a)'], ['desk', 'carteira/mesa'], ['bag', 'mochila'], ['eraser', 'borracha']],
  'EN-PA1-CORPO.3': [['head', 'cabeça'], ['hand', 'mão'], ['foot', 'pé'], ['eye', 'olho'], ['mouth', 'boca'], ['nose', 'nariz'], ['ear', 'orelha'], ['arm', 'braço']],
};
const TODAS_EN = Object.values(VOCAB).flat().map((p) => p[0]);

const FRASES = [
  ['The cat is black.', 'O gato é preto.', ['O cachorro é branco.', 'O gato está dormindo.', 'A casa é grande.']],
  ['I have two dogs.', 'Eu tenho dois cachorros.', ['Eu vejo dois gatos.', 'Eu quero um cachorro.', 'Eu tenho duas irmãs.']],
  ['The apple is red.', 'A maçã é vermelha.', ['A banana é amarela.', 'A maçã é doce.', 'O suco é vermelho.']],
  ['My mother is a teacher.', 'Minha mãe é professora.', ['Minha irmã é professora.', 'Minha mãe está na escola.', 'Meu pai é professor.']],
  ['The bird is in the tree.', 'O pássaro está na árvore.', ['O pássaro está voando.', 'O gato está na árvore.', 'A árvore é alta.']],
  ['I like ice cream.', 'Eu gosto de sorvete.', ['Eu quero sorvete.', 'Eu como pão.', 'Eu gosto de bolo.']],
];

const CONVERSAS = {
  'EN-PA1-SAUDACOES.2': [
    ['Hello!', 'Hi!', ['Good night!', 'Thank you!']],
    ['Good morning!', 'Good morning!', ['Goodbye!', 'Yes, please!']],
    ['Thank you!', "You're welcome!", ['Good morning!', 'I am seven.']],
    ['Goodbye!', 'Bye! See you!', ['Hello!', "I'm fine!"]],
  ],
  'EN-PA1-APRESENTAR.3': [
    ["What's your name?", 'My name is Ana.', ['I am seven years old.', 'I like dogs.']],
    ['How old are you?', 'I am eight years old.', ['My name is Leo.', 'I am fine.']],
    ['How are you?', "I'm fine, thank you!", ['I am from Brazil.', 'My name is Bia.']],
    ['Where are you from?', 'I am from Brazil.', ['I am eight.', 'Yes, I am.']],
  ],
};

const distratoresEn = (r, certa, n) => {
  const out = new Set();
  let guarda = 0;
  while (out.size < n && guarda++ < 80) { const d2 = de(r, TODAS_EN); if (d2 !== certa) out.add(d2); }
  return [...out];
};

// molde de vocabulário (serve às 7 células do fio 1) + escuta opcional
function moldeVocab(celulaId) {
  return [{ id: 'en-pt', gerar(r) {
    const p = de(r, VOCAB[celulaId]);
    return { enunciado: `Como se diz "${p[1].toUpperCase()}" em inglês?`, tipo: 'escolha', opcoes: escolha(r, p[0], distratoresEn(r, p[0], 3)), resposta: p[0], audio: p[0], dica: 'Toque no 🔊 depois de responder para ouvir a palavra certa.' };
  } }, { id: 'pt-en', gerar(r) {
    const p = de(r, VOCAB[celulaId]);
    const erradas = embaralhar(r, VOCAB[celulaId].filter((x) => x[0] !== p[0])).slice(0, 3).map((x) => x[1]);
    return { enunciado: `O que significa "${p[0]}"?`, tipo: 'escolha', opcoes: escolha(r, p[1], erradas), resposta: p[1], audio: p[0], dica: 'Ouça no 🔊 — às vezes o som ajuda a lembrar.' };
  } }];
}

const MOLDES = {
  'EN-PA1-CORES.2': moldeVocab('EN-PA1-CORES.2'),
  'EN-PA1-NUMEROS.2': moldeVocab('EN-PA1-NUMEROS.2'),
  'EN-PA1-FAMILIA.2': moldeVocab('EN-PA1-FAMILIA.2'),
  'EN-PA1-ANIMAIS.2': moldeVocab('EN-PA1-ANIMAIS.2'),
  'EN-PA1-COMIDA.3': moldeVocab('EN-PA1-COMIDA.3'),
  'EN-PA1-ESCOLA.3': moldeVocab('EN-PA1-ESCOLA.3'),
  'EN-PA1-CORPO.3': moldeVocab('EN-PA1-CORPO.3'),
  'EN-PA1-OUVIR-PALAVRA.2': [{ id: 'ouvir-palavra', gerar(r) {
    const certa = de(r, TODAS_EN);
    return { enunciado: '🔊 Toque no botão de ouvir. Qual palavra você ouviu?', tipo: 'escolha', opcoes: escolha(r, certa, distratoresEn(r, certa, 3)), resposta: certa, audio: certa, dica: 'Pode ouvir quantas vezes quiser!' };
  } }],
  'EN-PA1-OUVIR-FRASE.3': [{ id: 'ouvir-frase', gerar(r) {
    const f = de(r, FRASES);
    return { enunciado: '🔊 Ouça a frase. O que ela diz?', tipo: 'escolha', opcoes: escolha(r, f[1], f[2]), resposta: f[1], audio: f[0], dica: 'Ouça de novo e preste atenção na primeira palavra.' };
  } }],
  'EN-PA1-LER-PALAVRA.2': [{ id: 'ler-palavra', gerar(r) {
    const p = de(r, [...VOCAB['EN-PA1-ANIMAIS.2'], ...VOCAB['EN-PA1-CORES.2'], ...VOCAB['EN-PA1-FAMILIA.2']]);
    const erradas = distratoresEn(r, p[0], 3);
    return { enunciado: `Qual destas palavras significa "${p[1].toUpperCase()}"?`, tipo: 'escolha', opcoes: escolha(r, p[0], erradas), resposta: p[0], audio: p[0], dica: 'Leia cada opção com calma.' };
  } }],
  'EN-PA1-LER-FRASE.3': [{ id: 'ler-frase', gerar(r) {
    const f = de(r, FRASES);
    return { enunciado: `Leia: "${f[0]}"\n\nO que a frase diz?`, tipo: 'escolha', opcoes: escolha(r, f[1], f[2]), resposta: f[1], audio: f[0], dica: 'Procure as palavras que você já conhece na frase.' };
  } }],
  'EN-PA1-SAUDACOES.2': [{ id: 'saudacao', gerar(r) {
    const cItem = de(r, CONVERSAS['EN-PA1-SAUDACOES.2']);
    return { enunciado: `Alguém diz: "${cItem[0]}" — qual é a melhor resposta?`, tipo: 'escolha', opcoes: escolha(r, cItem[1], cItem[2]), resposta: cItem[1], audio: cItem[0], dica: 'Ouça no 🔊 como soa — cumprimento combina com cumprimento.' };
  } }],
  'EN-PA1-APRESENTAR.3': [{ id: 'apresentar', gerar(r) {
    const cItem = de(r, CONVERSAS['EN-PA1-APRESENTAR.3']);
    return { enunciado: `A pergunta é: "${cItem[0]}" — qual resposta encaixa?`, tipo: 'escolha', opcoes: escolha(r, cItem[1], cItem[2]), resposta: cItem[1], audio: cItem[0], dica: 'Name = nome · old = idade · from = de onde.' };
  } }],
};

// ---- API (mesmo contrato dos outros bancos) ----
const temMolde = (celula) => Array.isArray(MOLDES[celula]) && MOLDES[celula].length > 0;
const CELULAS_COM_MOLDE = Object.keys(MOLDES);

function exercicio(celulaId, seed) {
  const lista = MOLDES[celulaId];
  if (!lista || !lista.length) return null;
  const molde = lista[seed % lista.length];
  const ex = molde.gerar(rng(seed));
  return { celula: celulaId, molde: molde.id, seed, ...ex };
}

const normalizar = (v) => String(v == null ? '' : v).trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const conferir = (celulaId, seed, respostaDada) => {
  const ex = exercicio(celulaId, seed);
  if (!ex) return null;
  return { certo: normalizar(respostaDada) === normalizar(ex.resposta), resposta: ex.resposta, dica: ex.dica };
};

module.exports = { MOLDES, CELULAS_COM_MOLDE, temMolde, exercicio, conferir, rng };
