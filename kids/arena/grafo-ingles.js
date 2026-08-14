// =====================================================================
// Invente Arena — GRAFO da Arena de Inglês (fase D).
// Fonte: docs/kids/arena-grafo-ingles.md, APROVADO pelo Augusto em
// 14/08/2026. Régua: CEFR pré-A1 → A1 (2º–5º; Cambridge Starters/Movers
// como guia etário) — o MEC não define inglês antes do 6º. Fio 7 (D3):
// BNCC Língua Inglesa 6º–8º, códigos conferidos no PDF oficial do MEC
// (basenacionalcomum.mec.gov.br, pesquisa 14/08/2026: 26+23+20 habilidades);
// a Arena treina os eixos de LEITURA e CONHECIMENTOS LINGUÍSTICOS —
// oralidade (fala da criança) fica gated pelo parecer, e escrita/dimensão
// intercultural vivem nas missões, não em múltipla escolha.
// Travas: voz da criança NUNCA sobe (speaking pós-parecer); listening é
// o sintetizador do NAVEGADOR (voz PARA a criança, nada gravado).
// =====================================================================
'use strict';

const CELULAS = {
  // fio 1 · palavras do meu mundo (pré-A1 → A1)
  'EN-PA1-CORES.2': ['V', 'As cores em inglês'],
  'EN-PA1-NUMEROS.2': ['V', 'Números de 1 a 20'],
  'EN-PA1-FAMILIA.2': ['V', 'A família'],
  'EN-PA1-ANIMAIS.2': ['V', 'Os animais'],
  'EN-PA1-COMIDA.3': ['V', 'Comidas e bebidas'],
  'EN-PA1-ESCOLA.3': ['V', 'Coisas da escola'],
  'EN-PA1-CORPO.3': ['V', 'O corpo'],
  'EN-PA1-CASA.4': ['V', 'A casa'],
  'EN-PA1-ROUPAS.4': ['V', 'As roupas'],
  'EN-A1-CIDADE.5': ['V', 'A cidade'],
  'EN-A1-NATUREZA.5': ['V', 'A natureza'],
  // fio 2 · ouvir e entender 🔊
  'EN-PA1-OUVIR-PALAVRA.2': ['L', 'Ouvir e reconhecer a palavra'],
  'EN-PA1-OUVIR-FRASE.3': ['L', 'Ouvir e entender a frase'],
  'EN-A1-OUVIR-PERGUNTA.4': ['L', 'Ouvir a pergunta e responder'],
  'EN-A1-OUVIR-DIALOGO.5': ['L', 'Ouvir um mini-diálogo'],
  // fio 3 · ler e entender
  'EN-PA1-LER-PALAVRA.2': ['R', 'Ler a palavra e entender'],
  'EN-PA1-LER-FRASE.3': ['R', 'Ler a frase e entender'],
  'EN-A1-LER-DIALOGO.4': ['R', 'Ler um diálogo'],
  'EN-A1-LER-TEXTINHO.5': ['R', 'Ler um textinho'],
  // fio 4 · frases que funcionam (D2)
  'EN-PA1-TOBE.3': ['G', 'I am, you are, it is'],
  'EN-PA1-ARTIGOS.3': ['G', 'A ou AN?'],
  'EN-PA1-PLURAL.4': ['G', 'O plural'],
  'EN-PA1-PRONOMES.4': ['G', 'He, she, it, we, they'],
  'EN-A1-PRESENT.4': ['G', 'O presente simples'],
  'EN-A1-CAN.5': ['G', 'CAN: o que sei fazer'],
  'EN-A1-CONTINUOUS.5': ['G', 'O que está acontecendo agora'],
  'EN-A1-POSSESSIVO.5': ['G', 'My, your, his, her'],
  // fio 5 · números, horas e datas (D2)
  'EN-PA1-NUM-EXTENSO.3': ['V', 'Números por extenso'],
  'EN-A1-NUM-GRANDES.4': ['V', 'Números até 100'],
  'EN-A1-HORAS.5': ['V', 'As horas'],
  'EN-A1-DIAS-MESES.5': ['V', 'Dias e meses'],
  // fio 6 · conversas do dia a dia
  'EN-PA1-SAUDACOES.2': ['C', 'Cumprimentar e despedir'],
  'EN-PA1-APRESENTAR.3': ['C', 'Dizer quem eu sou'],
  'EN-A1-PEDIDOS.4': ['C', 'Pedir com educação'],
  'EN-A1-GOSTOS.5': ['C', 'I like, I don\'t like'],
  // fio 7 · BNCC: o inglês da escola (6º–8º)
  'EF06LI08': ['R', 'Descobrir o assunto do texto (cognatos)'],
  'EF06LI09': ['R', 'Localizar a informação no texto'],
  'EF06LI17': ['V', 'Vocabulário do dia a dia (escola, rotina, lazer)'],
  'EF06LI19': ['G', 'To be e rotinas no presente simples'],
  'EF06LI20': ['G', 'Presente contínuo'],
  'EF06LI21': ['G', 'Imperativo: comandos e instruções'],
  'EF06LI22': ['G', 'Genitivo: o \'s de posse'],
  'EF06LI23': ['G', 'Adjetivos possessivos'],
  'EF07LI15': ['G', 'Passado: verbos e preposições in/on/at'],
  'EF07LI18': ['G', 'Passado simples e contínuo'],
  'EF07LI19': ['G', 'Pronomes: sujeito e objeto'],
  'EF07LI20': ['G', 'CAN e COULD: habilidades'],
  'EF07LI07': ['R', 'A informação-chave de cada parágrafo'],
  'EF08LI14': ['G', 'Futuro: planos e previsões'],
  'EF08LI15': ['G', 'Comparativos e superlativos'],
  'EF08LI16': ['G', 'Some, any, many, much'],
  'EF08LI17': ['G', 'Pronomes relativos (who, which, that)'],
  'EF08LI05': ['R', 'Inferência: ler o que está implícito'],
};

const FIOS = [
  { id: 1, nome: 'Palavras do meu mundo', celulas: ['EN-PA1-CORES.2', 'EN-PA1-NUMEROS.2', 'EN-PA1-FAMILIA.2', 'EN-PA1-ANIMAIS.2', 'EN-PA1-COMIDA.3', 'EN-PA1-ESCOLA.3', 'EN-PA1-CORPO.3', 'EN-PA1-CASA.4', 'EN-PA1-ROUPAS.4', 'EN-A1-CIDADE.5', 'EN-A1-NATUREZA.5'] },
  { id: 2, nome: 'Ouvir e entender', celulas: ['EN-PA1-OUVIR-PALAVRA.2', 'EN-PA1-OUVIR-FRASE.3', 'EN-A1-OUVIR-PERGUNTA.4', 'EN-A1-OUVIR-DIALOGO.5'] },
  { id: 3, nome: 'Ler e entender', celulas: ['EN-PA1-LER-PALAVRA.2', 'EN-PA1-LER-FRASE.3', 'EN-A1-LER-DIALOGO.4', 'EN-A1-LER-TEXTINHO.5'] },
  { id: 4, nome: 'Frases que funcionam', celulas: ['EN-PA1-TOBE.3', 'EN-PA1-ARTIGOS.3', 'EN-PA1-PLURAL.4', 'EN-PA1-PRONOMES.4', 'EN-A1-PRESENT.4', 'EN-A1-CAN.5', 'EN-A1-CONTINUOUS.5', 'EN-A1-POSSESSIVO.5'] },
  { id: 5, nome: 'Números e horas', celulas: ['EN-PA1-NUM-EXTENSO.3', 'EN-A1-NUM-GRANDES.4', 'EN-A1-HORAS.5', 'EN-A1-DIAS-MESES.5'] },
  { id: 6, nome: 'Conversas do dia a dia', celulas: ['EN-PA1-SAUDACOES.2', 'EN-PA1-APRESENTAR.3', 'EN-A1-PEDIDOS.4', 'EN-A1-GOSTOS.5'] },
  { id: 7, nome: 'O inglês da escola (BNCC)', celulas: ['EF06LI08', 'EF06LI09', 'EF06LI17', 'EF06LI19', 'EF06LI20', 'EF06LI21', 'EF06LI22', 'EF06LI23', 'EF07LI15', 'EF07LI18', 'EF07LI19', 'EF07LI20', 'EF07LI07', 'EF08LI14', 'EF08LI15', 'EF08LI16', 'EF08LI17', 'EF08LI05'] },
];

// Sem dificuldade nacional medida em inglês: prioridade = motivação
// (vocabulário do mundo da criança e escuta primeiro).
const ATENCAO = { critica: [], alta: ['EN-PA1-OUVIR-PALAVRA.2', 'EN-PA1-LER-PALAVRA.2', 'EN-PA1-CORES.2', 'EN-PA1-ANIMAIS.2'] };

const ANO_DE = (codigo) => {
  const s = String(codigo);
  const suf = Number(s.split('.')[1]);
  if (suf) return suf;
  const m = s.match(/^EF(\d\d)/); // códigos BNCC LI carregam o ano no próprio código
  return m ? Number(m[1]) : 2;
};

const _fioPorCelula = {};
for (const f of FIOS) f.celulas.forEach((c, i) => { _fioPorCelula[c] = { fio: f.id, idx: i }; });

function celula(codigo) {
  const c = CELULAS[codigo];
  if (!c) return null;
  const pos = _fioPorCelula[codigo] || null;
  const fio = pos ? FIOS.find((f) => f.id === pos.fio) : null;
  return {
    codigo, unidade: c[0], resumo: c[1], ano: ANO_DE(codigo),
    fio: pos ? pos.fio : null, fioNome: fio ? fio.nome : null,
    prereq: pos && pos.idx > 0 ? fio.celulas[pos.idx - 1] : null,
    atencao: ATENCAO.critica.includes(codigo) ? 'critica' : (ATENCAO.alta.includes(codigo) ? 'alta' : null),
  };
}

const TODAS = Object.keys(CELULAS);

module.exports = { CELULAS, FIOS, ATENCAO, TODAS, celula, ANO_DE };
