'use strict';

const fases = [
  ['fundamentos', 'Fundamentos', [1, 2, 3, 4, 5, 6]],
  ['controle-coordenacao', 'Controle e coordenação', [7, 8, 9, 10, 11, 12]],
  ['linguagem-musical', 'Linguagem musical', [13, 14, 15, 16, 17, 18, 19]],
  ['repertorio-performance', 'Repertório e performance', [20, 21, 22, 23, 24, 25, 26]],
];

const titulos = [
  'Som, postura e mapa da bateria', 'Pulso, subdivisão e contagem', 'Bumbo, caixa e chimbal',
  'Técnica de baquetas e rebote', 'Viradas de um compasso', 'Grooves essenciais de rock',
  'Dinâmica e articulação', 'Independência dos quatro membros', 'Leitura rítmica aplicada',
  '6/8 e compassos compostos', 'Shuffle e swing', 'Funk introdutório',
  'Pop e acompanhamento de canções', 'Blues e linguagem de resposta', 'Coordenação com pedal',
  'Rudimentos aplicados ao kit', 'Viradas melódicas', 'Improvisação com limites',
  'Tocar com metrônomo', 'Gravação caseira', 'Ritmos brasileiros',
  'Reggae e ritmos latino-americanos', 'Arranjo de uma música', 'Performance sem interrupção',
  'Plano de estudo de 20 minutos', 'Projeto final: tocar uma música completa',
];

const resumos = [
  'Organize corpo, banco, baquetas e elementos do kit antes de buscar velocidade.',
  'O ritmo continua mesmo quando você não toca.',
  'Construa o primeiro groove em 4/4.',
  'Produza ataques consistentes com o mínimo de tensão.',
  'Entre e saia de uma virada sem perder o pulso.',
  'Varie o bumbo sem perder a função da caixa.',
  'Controle acentos, ghost notes e níveis de volume.',
  'Adicione uma camada por vez até coordenar os quatro membros.',
  'Transforme uma grade rítmica em movimento musical.',
  'Sinta agrupamentos ternários sem confundir o pulso.',
  'Toque tercinas com espaço e consistência.',
  'Use síncope, espaço e ghost notes para criar movimento.',
  'Toque para a forma da música.',
  'Responda à frase musical sem sobrecarregar o groove.',
  'Desenvolva controle e resistência do bumbo.',
  'Leve os rudimentos da caixa para a música.',
  'Pense na virada como uma frase com direção.',
  'Improvise sem abandonar o pulso.',
  'Desenvolva estabilidade interna.',
  'Use a gravação como ferramenta de estudo.',
  'Estude padrões brasileiros de coordenação e acento.',
  'Trabalhe espaço, contratempo e consistência.',
  'Planeje intro, verso, refrão, ponte, viradas e final.',
  'Recupere erros mantendo o pulso.',
  'Crie uma rotina de estudo sustentável.',
  'Consolide técnica, musicalidade e autonomia.',
];

const fasesPorNumero = Object.fromEntries(fases.flatMap(([id, nome, ns]) => ns.map((n) => [n, { id, nome }])));
const capitulos = titulos.map((titulo, i) => {
  const numero = i + 1;
  return { id: `bateria-${String(numero).padStart(2, '0')}-${titulo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`, numero, titulo, resumo: resumos[i], fase: fasesPorNumero[numero].id, faseNome: fasesPorNumero[numero].nome, nivel: numero <= 5 ? 'iniciante' : numero <= 15 ? 'basico' : 'intermediario', slug: `bateria-${String(numero).padStart(2, '0')}` };
});

const RUDIMENTOS = [
  'Single Stroke Roll', 'Single Stroke Four', 'Single Stroke Seven', 'Multiple Bounce Roll',
  'Triple Stroke Roll', 'Double Stroke Open Roll', 'Five Stroke Roll', 'Six Stroke Roll',
  'Seven Stroke Roll', 'Nine Stroke Roll', 'Ten Stroke Roll', 'Eleven Stroke Roll',
  'Thirteen Stroke Roll', 'Fifteen Stroke Roll', 'Seventeen Stroke Roll', 'Flam',
  'Flam Accent', 'Flam Tap', 'Flamacue', 'Flam Paradiddle', 'Single Flammed Mill',
  'Pataflafla', 'Swiss Army Triplet', 'Inverted Flam Tap', 'Flam Drag', 'Drag / Ruff',
  'Drag Paradiddle No. 1', 'Drag Paradiddle No. 2', 'Single Drag Tap', 'Double Drag Tap',
  'Lesson 25', 'Single Paradiddle', 'Double Paradiddle', 'Triple Paradiddle',
  'Paradiddle-diddle', 'Single Ratamacue', 'Double Ratamacue', 'Triple Ratamacue',
  'Single Stroke Roll with accents', 'Inverted Paradiddle',
].map((nome, i) => {
  const n = i + 1;
  const padroes = [
    ['R','L','R','L','R','L','R','L'], ['R','L','R','L','R','L','R','L'], ['R','L','R','L','R','L','R'],
    ['R','r','L','l','R','r','L','l'], ['R','L','R','L','R','L'], ['R','R','L','L','R','R','L','L'],
    ['R','L','R','L','R','L','R','L'], ['R','L','R','L','R','L','R','L'], ['R','L','R','L','R','L','R','L'],
    ['R','L','R','L','R','L','R','L'], ['R','L','R','L','R','L','R','L'], ['R','L','R','L','R','L','R','L'],
    ['R','L','R','L','R','L','R','L'], ['R','L','R','L','R','L','R','L'], ['R','L','R','L','R','L','R','L'],
    ['fR','L','R','L','fR','L','R','L'], ['fR','L','R','L','fL','R','L','R'], ['fR','R','L','R','fL','L','R','L'],
    ['fR','r','L','R','fL','l','R','L'], ['fR','R','L','R','fL','L','R','L'], ['fR','R','L','R','fL','L','R','L'],
    ['fR','r','fL','l','R','L','R','L'], ['fR','R','L','fR','L','R','L','R'], ['fR','L','R','fL','R','L','R','L'],
    ['fR','r','R','L','fL','l','L','R'], ['gR','gR','R','L','gL','gL','L','R'], ['gR','gR','R','L','gL','gL','L','R'],
    ['gR','gR','R','L','gL','gL','L','R'], ['gL','gL','L','R','gR','gR','R','L'], ['gR','gR','R','L','gL','gL','L','R'],
    ['gR','gR','R','L','gL','gL','L','R'], ['gR','gR','R','L','gL','gL','L','R'], ['R','L','R','R','L','R','L','L'],
    ['R','L','R','R','L','R','L','L'], ['R','L','R','R','L','R','L','L'], ['R','L','R','R','L','R','L','L'],
    ['R','L','R','R','L','R','L','L'], ['gR','gR','R','L','gL','gL','L','R'], ['gR','gR','R','L','gL','gL','L','R'],
    ['gR','gR','R','L','gL','gL','L','R'], ['R','L','R','L','R','L','R','L'], ['R','L','R','R','L','R','L','L'],
  ];
  const stickings = n <= 15 ? 'R L alternado; acentue a primeira nota de cada grupo' : n <= 25 ? 'R l / L r com a nota principal em maiúscula' : n <= 31 ? 'R R L / L L R; mantenha o arrasto baixo' : 'R L R R / L R L L conforme a célula';
  const aplicacoes = n <= 15 ? 'Caixa → tom alto → tom baixo, retornando à caixa no tempo 1.' : n <= 25 ? 'Acentos na caixa e notas de apoio no tom, com prato no início da frase.' : 'Bumbo nos acentos, caixa nas notas principais e tom como resposta.';
  const erros = n <= 15 ? 'Acelerar o grupo final ou perder a igualdade entre as mãos.' : n <= 25 ? 'Transformar a nota de apoio em acento e endurecer o movimento.' : 'Arrastar notas sem subdivisão clara ou antecipar o próximo tempo.';
  const slug = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const familia = n <= 3 ? 'roll' : n <= 6 ? 'bounce-double' : n <= 15 ? 'roll-grouped' : n <= 25 ? 'flam' : n <= 31 ? 'drag' : n <= 35 ? 'paradiddle' : n <= 38 ? 'ratamacue' : 'accented';
  const gestos = padroes[i].map((token, j) => { const especial = token.charAt(0); const altura = familia === 'flam' ? (especial === 'f' ? 9 : -11) : familia === 'drag' ? (especial === 'g' ? 12 : -11) : familia === 'bounce-double' ? (j % 2 ? 5 : -14) : familia === 'paradiddle' ? ([ -12, 4, -8, 10 ][j % 4]) : familia === 'ratamacue' ? ([ 12, 4, -12, 7 ][j % 4]) : (j % 2 ? 5 : -11); return { token, mao: token.replace(/^[fg]/, '').charAt(0), altura, duracao: especial === 'g' ? 0.42 : especial === 'f' ? 0.22 : 1 }; });
  return { id: `rudimento-${n}`, numero: n, nome, slug, sticking: stickings, padrao: padroes[i], gestos, familia, bpmStart: n <= 15 ? 50 : 45, bpmTarget: n <= 15 ? 100 : 90, kitApplication: aplicacoes, commonError: erros, practiceMinutes: 5, checkpoint: 'Grave três repetições limpas, sem tensão, e registre o BPM que permaneceu estável.', facilitadores: ['preparar', 'isolar', 'alternar', 'orquestrar', 'musicalizar', 'acelerar-com-criterio', 'diagnosticar', 'registrar'] };
});

const MOVIMENTOS_RUDIMENTOS = {
  roll: 'Alternância contínua: a baqueta da mão ativa desce verticalmente até a pele e retorna antes da próxima mão. As duas baquetas permanecem paralelas, separadas e sem cruzamento.',
  'bounce-double': 'Duas pancadas da mesma mão no mesmo lado da caixa: primeiro golpe controlado, segundo golpe de rebote curto. A outra mão espera e só entra no próximo grupo.',
  'roll-grouped': 'Alternância em grupos com o primeiro ataque mais alto e os ataques seguintes menores. O grupo termina claramente antes de reiniciar no outro lado.',
  flam: 'Golpe de apoio baixo imediatamente antes do golpe principal mais alto. As duas baquetas descem em sequência muito próxima, permanecem em seus lados e nunca se cruzam.',
  drag: 'Dois golpes preparatórios baixos e próximos, seguidos de um golpe principal mais alto. O arrasto é visível como três alturas diferentes no mesmo lado.',
  paradiddle: 'Alternância R-L seguida de dois golpes da mesma mão, depois espelhada. A repetição da mão fica visualmente evidente antes da troca.',
  ratamacue: 'Arrasto preparatório baixo, ataque principal acentuado e resposta alternada. O acento sobe mais e a preparação permanece próxima da pele.',
  accented: 'Alternância regular com acentos destacados: ataques acentuados sobem mais, ataques de apoio sobem menos, sempre em trilhas laterais fixas.',
};
RUDIMENTOS.forEach((r) => {
  const gestoTexto = r.gestos.map((g, i) => `${i + 1}: mão ${g.mao === 'R' ? 'direita' : 'esquerda'}, ${g.token.charAt(0) === 'f' ? 'flam' : g.token.charAt(0) === 'g' ? 'nota fantasma/drag' : 'golpe normal'}, altura ${g.altura}px`).join('; ');
  r.movimentoDescricao = MOVIMENTOS_RUDIMENTOS[r.familia];
  r.somDescricao = `Caixa acústica com ataque ${r.familia === 'accented' ? 'acentuado e contraste de dinâmica' : r.familia}, pele e esteira audíveis; eventos sincronizados: ${gestoTexto}.`;
  r.animacaoPrompt = `Animação didática vista de cima, enquadramento fixo de uma caixa de bateria centralizada. Ensinar o rudimento ${r.numero}. ${r.nome}. ${r.movimentoDescricao} Mostrar duas mãos humanas e duas baquetas de madeira, uma trilha fixa à esquerda e outra à direita, sem cruzar. Sincronizar cada descida com a partitura, destacar a mão ativa e respeitar esta sequência exata: ${gestoTexto}. Fundo limpo, sem texto inventado, sem baquetas extras, sem movimento lateral.`;
  r.audioPrompt = `Áudio didático de caixa de bateria para ${r.numero}. ${r.nome}. Gravar/sintetizar uma caixa realista com pele e esteira, sem metrônomo dominante. Executar exatamente os eventos: ${gestoTexto}. Diferenciar golpes acentuados, normais, ghost notes, flams e drags por intensidade e microtempo. Manter o BPM ${r.bpmStart}–${r.bpmTarget}.`;
});

const CURSO = {
  id: 'curso-bateria-livro', titulo: 'Livro digital de bateria', subtitulo: 'Do primeiro pulso à performance completa', versao: '1.0',
  descricao: 'Formação progressiva de bateria, do primeiro som ao nível intermediário, com grooves, leitura, rudimentos, repertório e performance.',
  trilhas: [
    { id: 'conhecer', nome: 'Conhecer', resumo: 'Conceitos, postura, leitura e mapas do instrumento.' },
    { id: 'ouvir', nome: 'Ouvir e reconhecer', resumo: 'Pulso, dinâmica, subdivisão e escuta crítica.' },
    { id: 'aplicar', nome: 'Aplicar', resumo: 'Grooves, rudimentos, repertório e performance.' },
  ], fases, capitulos, rudimentos: RUDIMENTOS,
};

module.exports = { CURSO, capitulos, RUDIMENTOS };
