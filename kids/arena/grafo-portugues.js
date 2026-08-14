// =====================================================================
// Invente Arena — GRAFO da Arena de Português (fase C).
// Fonte: docs/kids/arena-grafo-portugues.md, APROVADO pelo Augusto em
// 07/08/2026. Célula = habilidade BNCC + ANO de aplicação ("EF35LP04.4"),
// porque a BNCC de LP compartilha códigos entre anos — a mesma habilidade
// evolui em textos de complexidade crescente. Eixos: L = Leitura,
// AL = Análise linguística. Oralidade e produção ficam no Lab.
// =====================================================================
'use strict';

// célula: [eixo, resumo curto para o mapa da criança]
const CELULAS = {
  // ---- fio 1 · decodificar e ler com fluência (🔥 2º–3º) ----
  'EF02LP02.2': ['AL', 'Separar palavras em sílabas'],
  'EF02LP04.2': ['AL', 'Ler e montar sílabas (CV, CVC, CCV)'],
  'EF02LP05.2': ['AL', 'O som do nasal: til, M e N'],
  'EF12LP01.2': ['L', 'Ler palavras novas e conhecidas'],
  'EF03LP02.3': ['AL', 'Todas as estruturas de sílaba'],
  'EF03LP03.3': ['AL', 'Os dígrafos LH, NH e CH'],
  'EF35LP01.3': ['L', 'Ler textos curtos com fluência'],
  // ---- fio 2 · localizar informação (🔥) ----
  'EF15LP03.2': ['L', 'Achar a informação no texto (2º)'],
  'EF15LP03.3': ['L', 'Achar a informação no texto (3º)'],
  'EF15LP03.4': ['L', 'Achar a informação no texto (4º)'],
  'EF15LP03.5': ['L', 'Achar a informação no texto (5º)'],
  'EF04LP14.4': ['L', 'Na notícia: o quê, quem, onde, quando'],
  'EF69LP03.6': ['L', 'O fato central da notícia'],
  'EF69LP34.7': ['L', 'Grifar o essencial'],
  'EF69LP32.8': ['L', 'Selecionar a informação que importa'],
  // ---- fio 3 · inferir e compreender (🔥) ----
  'EF15LP02.2': ['L', 'Adivinhar o assunto pelo título'],
  'EF35LP04.3': ['L', 'Ler nas entrelinhas (3º)'],
  'EF35LP04.4': ['L', 'Ler nas entrelinhas (4º)'],
  'EF35LP04.5': ['L', 'Ler nas entrelinhas (5º)'],
  'EF35LP03.4': ['L', 'A ideia central do texto'],
  'EF35LP05.4': ['L', 'Descobrir a palavra pelo contexto'],
  'EF69LP05.6': ['L', 'Entender humor e ironia'],
  'EF67LP05.7': ['L', 'Tese e argumentos'],
  'EF89LP04.8': ['L', 'Teses explícitas e implícitas'],
  // ---- fio 4 · ler criticamente ----
  'EF03LP19.3': ['L', 'Truques de persuasão em anúncios'],
  'EF04LP15.4': ['L', 'Fato ou opinião?'],
  'EF05LP16.5': ['L', 'O mesmo fato em mídias diferentes'],
  'EF06LP01.6': ['L', 'Nenhum relato é 100% neutro'],
  'EF67LP04.7': ['L', 'Separar fato de opinião (7º)'],
  'EF89LP02.8': ['L', 'Curtir, compartilhar, memes: olhar crítico'],
  'EF89LP06.8': ['L', 'Recursos persuasivos em argumentos'],
  // ---- fio 5 · narrativas ----
  'EF02LP28.2': ['AL', 'Conflito e resolução da história'],
  'EF35LP29.3': ['AL', 'Cenário, personagem e narrador'],
  'EF35LP26.4': ['L', 'O enredo completo'],
  'EF35LP30.5': ['AL', 'Discurso direto e indireto'],
  'EF69LP47.6': ['L', 'Foco narrativo (6º)'],
  'EF69LP47.7': ['L', 'Foco narrativo (7º)'],
  'EF89LP05.8': ['L', 'Efeitos dos discursos no texto'],
  // ---- fio 6 · poesia e linguagem figurada ----
  'EF12LP07.2': ['AL', 'Rimas e ritmo'],
  'EF35LP23.3': ['L', 'Versos e estrofes'],
  'EF35LP31.4': ['AL', 'Metáforas e sons do poema'],
  'EF05LP10.5': ['L', 'O humor de piadas e cartuns'],
  'EF67LP38.6': ['AL', 'Comparação, metáfora, personificação (6º)'],
  'EF67LP38.7': ['AL', 'Hipérbole e outras figuras (7º)'],
  'EF69LP54.8': ['AL', 'Metonímia, antítese e conotação'],
  'EF89LP37.8': ['AL', 'Ironia e eufemismo'],
  // ---- fio 7 · ortografia (🔥 2º–4º) ----
  'EF02LP03.2': ['AL', 'F/V, T/D, P/B: o par certo'],
  'EF03LP01.3': ['AL', 'R/RR, C/QU, G/GU, S/Z'],
  'EF04LP01.4': ['AL', 'M antes de P e B (e cia.)'],
  'EF04LP02.4': ['AL', 'Ditongos escondidos: caixa, peixe'],
  'EF04LP08.4': ['AL', 'Sufixos -agem, -oso, -eza, -izar'],
  'EF35LP13.4': ['AL', 'Palavras irregulares de memória'],
  'EF05LP01.5': ['AL', 'Ortografia: a prova dos campeões'],
  'EF67LP32.6': ['AL', 'Escrever com correção (6º)'],
  'EF08LP05.8': ['AL', 'Palavras compostas e hífen'],
  // ---- fio 8 · acentuação ----
  'EF03LP05.3': ['AL', 'Contar sílabas'],
  'EF03LP06.3': ['AL', 'A sílaba tônica'],
  'EF03LP04.3': ['AL', 'Acento em oxítonas e monossílabos'],
  'EF04LP04.4': ['AL', 'Paroxítonas em -i, -l, -r, -ão'],
  'EF05LP03.5': ['AL', 'Proparoxítonas: todas com acento'],
  // ---- fio 9 · pontuação ----
  'EF02LP09.2': ['AL', 'Ponto, interrogação e exclamação'],
  'EF03LP07.3': ['AL', 'Dois-pontos e travessão do diálogo'],
  'EF04LP05.4': ['AL', 'Vírgula em listas e chamados'],
  'EF05LP04.5': ['AL', 'Aspas, reticências e parênteses'],
  'EF67LP33.6': ['AL', 'Pontuar textos (6º)'],
  'EF06LP07.6': ['AL', 'Vírgula entre orações'],
  'EF07LP11.7': ['AL', 'E, MAS, PORÉM entre orações'],
  'EF08LP13.8': ['AL', 'O sentido das conjunções'],
  // ---- fio 10 · classes de palavras e sintaxe ----
  'EF03LP08.3': ['AL', 'Substantivo e verbo'],
  'EF03LP09.3': ['AL', 'Adjetivo: a palavra que descreve'],
  'EF04LP06.4': ['AL', 'Concordância verbal'],
  'EF04LP07.4': ['AL', 'Concordância nominal'],
  'EF05LP05.5': ['AL', 'Presente, passado e futuro'],
  'EF05LP06.5': ['AL', 'Flexionar o verbo com o sujeito'],
  'EF06LP04.6': ['AL', 'Flexões e modos verbais'],
  'EF06LP06.6': ['AL', 'Concordância (6º)'],
  'EF07LP07.7': ['AL', 'Sujeito, predicado e objetos'],
  'EF07LP09.7': ['AL', 'Advérbios'],
  'EF08LP06.8': ['AL', 'Os termos da oração'],
  'EF08LP07.8': ['AL', 'Regência: direto ou indireto?'],
  'EF08LP08.8': ['AL', 'Voz ativa e passiva'],
  'EF08LP11.8': ['AL', 'Coordenação × subordinação'],
  // ---- fio 11 · vocabulário ----
  'EF02LP10.2': ['AL', 'Sinônimos e antônimos'],
  'EF02LP11.2': ['AL', 'Aumentativo e diminutivo'],
  'EF04LP03.4': ['AL', 'O sentido certo no contexto'],
  'EF05LP02.5': ['AL', 'Uma palavra, vários sentidos'],
  'EF05LP08.5': ['AL', 'Primitivas, derivadas e compostas'],
  'EF06LP03.6': ['AL', 'Nuances entre sinônimos'],
  'EF67LP35.7': ['AL', 'Derivada ou composta?'],
  'EF07LP03.7': ['AL', 'Prefixos e sufixos produtivos'],
  // ---- fio 12 · coesão e conectivos ----
  'EF35LP06.3': ['L', 'A quem o pronome se refere'],
  'EF35LP14.4': ['AL', 'Pronomes que costuram o texto'],
  'EF05LP07.5': ['AL', 'Conectivos: e, mas, porque, se'],
  'EF67LP36.6': ['AL', 'Coesão referencial e sequencial'],
  'EF07LP12.7': ['AL', 'Anáforas'],
  'EF69LP31.7': ['L', 'Pistas de organização do texto'],
  'EF08LP15.8': ['AL', 'O antecedente do pronome relativo'],
  'EF89LP29.8': ['AL', 'Progressão do tema'],
};

const FIOS = [
  { id: 1, nome: 'Ler sem tropeçar', celulas: ['EF02LP02.2', 'EF02LP04.2', 'EF02LP05.2', 'EF12LP01.2', 'EF03LP02.3', 'EF03LP03.3', 'EF35LP01.3'] },
  { id: 2, nome: 'Achar a informação', celulas: ['EF15LP03.2', 'EF15LP03.3', 'EF15LP03.4', 'EF15LP03.5', 'EF04LP14.4', 'EF69LP03.6', 'EF69LP34.7', 'EF69LP32.8'] },
  { id: 3, nome: 'Ler nas entrelinhas', celulas: ['EF15LP02.2', 'EF35LP04.3', 'EF35LP04.4', 'EF35LP05.4', 'EF35LP03.4', 'EF35LP04.5', 'EF69LP05.6', 'EF67LP05.7', 'EF89LP04.8'] },
  { id: 4, nome: 'Ler com olhar crítico', celulas: ['EF03LP19.3', 'EF04LP15.4', 'EF05LP16.5', 'EF06LP01.6', 'EF67LP04.7', 'EF89LP02.8', 'EF89LP06.8'] },
  { id: 5, nome: 'Histórias por dentro', celulas: ['EF02LP28.2', 'EF35LP29.3', 'EF35LP26.4', 'EF35LP30.5', 'EF69LP47.6', 'EF69LP47.7', 'EF89LP05.8'] },
  { id: 6, nome: 'Poesia e figuras', celulas: ['EF12LP07.2', 'EF35LP23.3', 'EF35LP31.4', 'EF05LP10.5', 'EF67LP38.6', 'EF67LP38.7', 'EF69LP54.8', 'EF89LP37.8'] },
  { id: 7, nome: 'Escrever certo', celulas: ['EF02LP03.2', 'EF03LP01.3', 'EF04LP01.4', 'EF04LP02.4', 'EF04LP08.4', 'EF35LP13.4', 'EF05LP01.5', 'EF67LP32.6', 'EF08LP05.8'] },
  { id: 8, nome: 'Acentuação', celulas: ['EF03LP05.3', 'EF03LP06.3', 'EF03LP04.3', 'EF04LP04.4', 'EF05LP03.5'] },
  { id: 9, nome: 'Pontuação', celulas: ['EF02LP09.2', 'EF03LP07.3', 'EF04LP05.4', 'EF05LP04.5', 'EF67LP33.6', 'EF06LP07.6', 'EF07LP11.7', 'EF08LP13.8'] },
  { id: 10, nome: 'Palavras e orações', celulas: ['EF03LP08.3', 'EF03LP09.3', 'EF04LP06.4', 'EF04LP07.4', 'EF05LP05.5', 'EF05LP06.5', 'EF06LP04.6', 'EF06LP06.6', 'EF07LP07.7', 'EF07LP09.7', 'EF08LP06.8', 'EF08LP07.8', 'EF08LP08.8', 'EF08LP11.8'] },
  { id: 11, nome: 'Tesouro de palavras', celulas: ['EF02LP10.2', 'EF02LP11.2', 'EF04LP03.4', 'EF05LP02.5', 'EF05LP08.5', 'EF06LP03.6', 'EF67LP35.7', 'EF07LP03.7'] },
  { id: 12, nome: 'Costura do texto', celulas: ['EF35LP06.3', 'EF35LP14.4', 'EF05LP07.5', 'EF67LP36.6', 'EF07LP12.7', 'EF69LP31.7', 'EF08LP15.8', 'EF89LP29.8'] },
];

// Atenção especial (pesquisa nacional): alfabetização/fluência 2º–3º e
// interpretação são o gargalo de LP; ortografia base completa o lote 🔥.
const ATENCAO = {
  critica: ['EF02LP02.2', 'EF02LP04.2', 'EF02LP05.2', 'EF12LP01.2', 'EF03LP02.3', 'EF03LP03.3', 'EF35LP01.3',
    'EF15LP03.2', 'EF15LP03.3', 'EF15LP02.2', 'EF35LP04.3',
    'EF02LP03.2', 'EF03LP01.3', 'EF04LP01.4'],
  alta: ['EF15LP03.4', 'EF15LP03.5', 'EF35LP04.4', 'EF35LP04.5', 'EF35LP03.4', 'EF35LP05.4'],
};

// "EF35LP04.4" → 4 (o ano é o sufixo, não o do código compartilhado)
const ANO_DE = (codigo) => Number(String(codigo).split('.')[1]) || Number(String(codigo).slice(2, 4));

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
