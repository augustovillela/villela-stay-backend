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
  const stickings = n <= 15 ? 'R L alternado; acentue a primeira nota de cada grupo' : n <= 25 ? 'R l / L r com a nota principal em maiúscula' : n <= 31 ? 'R R L / L L R; mantenha o arrasto baixo' : 'R L R R / L R L L conforme a célula';
  const aplicacoes = n <= 15 ? 'Caixa → tom alto → tom baixo, retornando à caixa no tempo 1.' : n <= 25 ? 'Acentos na caixa e notas de apoio no tom, com prato no início da frase.' : 'Bumbo nos acentos, caixa nas notas principais e tom como resposta.';
  const erros = n <= 15 ? 'Acelerar o grupo final ou perder a igualdade entre as mãos.' : n <= 25 ? 'Transformar a nota de apoio em acento e endurecer o movimento.' : 'Arrastar notas sem subdivisão clara ou antecipar o próximo tempo.';
  return { id: `rudimento-${n}`, numero: n, nome, sticking: stickings, bpmStart: n <= 15 ? 50 : 45, bpmTarget: n <= 15 ? 100 : 90, kitApplication: aplicacoes, commonError: erros, practiceMinutes: 5, checkpoint: 'Grave três repetições limpas, sem tensão, e registre o BPM que permaneceu estável.', facilitadores: ['preparar', 'isolar', 'alternar', 'orquestrar', 'musicalizar', 'acelerar-com-criterio', 'diagnosticar', 'registrar'] };
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
