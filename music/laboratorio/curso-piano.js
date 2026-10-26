// Musique · Curso editorial de piano baseado no livro Piano do Zero ao Avançado.
'use strict';

const PARTES = [
  ['nivel-1', 'Nível 1 · Iniciante absoluto', [1, 2, 3, 4, 5, 6, 7]],
  ['nivel-2', 'Nível 2 · Básico', [8, 9, 10, 11, 12, 13, 14]],
  ['nivel-3', 'Nível 3 · Intermediário', [15, 16, 17, 18, 19, 20, 21, 22, 23]],
  ['nivel-4', 'Nível 4 · Avançado', [24, 25, 26, 27, 28, 29, 30]],
  ['nivel-5', 'Nível 5 · Profissional e criativo', [31, 32, 33, 34, 35, 36, 37]],
  ['tecnica', 'Manual de técnica pianística', [38, 39, 40, 41]],
  ['planos', 'Planos de estudo', [42]],
];

const DADOS = [
  ['O teclado', 13, 24], ['O corpo ao piano', 24, 38], ['Pulso e ritmo', 38, 51], ['Leitura nas duas claves', 51, 64], ['As duas mãos', 64, 75], ['Intervalos e acordes', 75, 90], ['Escalas e repertório de entrada', 90, 108],
  ['Leitura com acidentes e linhas suplementares', 108, 124], ['Ritmo em colcheias', 124, 134], ['Escalas maiores', 134, 144], ['Tríades, inversões e cadências', 144, 157], ['Arpejos, sétimas e cifras', 157, 170], ['Padrões de acompanhamento', 170, 185], ['Expressão e repertório clássico inicial', 185, 205],
  ['Todas as escalas', 205, 220], ['Campo harmônico, funções e modulação', 220, 234], ['Acordes ampliados e voicings', 234, 245], ['Ler, transpor e separar as mãos', 245, 259], ['Acompanhar cantores', 259, 269], ['Improvisação tonal e blues', 269, 279], ['Jazz básico', 279, 290], ['Ritmos brasileiros', 290, 302], ['Repertório romântico e moderno', 302, 318],
  ['Oitavas, acordes largos e saltos', 318, 328], ['Velocidade, notas duplas e arpejos', 328, 338], ['Polifonia e contraponto', 338, 347], ['Análise', 347, 357], ['Interpretação estilística', 357, 369], ['Pedais', 369, 378], ['Recital e performance', 378, 393],
  ['Improvisação avançada', 393, 406], ['Reharmonização', 406, 414], ['Arranjo para piano solo', 414, 423], ['O pianista na banda e no acompanhamento', 423, 434], ['Composição', 434, 443], ['Ouvido e estúdio', 443, 451], ['Portfólio, método próprio e carreira', 451, 465],
  ['O corpo', 466, 470], ['Os dedos', 470, 474], ['Como praticar', 474, 478], ['Prevenção de lesões', 478, 482], ['Planos de estudo', 482, 486],
].map(([titulo, inicio, fim], i) => ({ numero: i + 1, slug: `piano-${String(i + 1).padStart(2, '0')}`, titulo, pagina_inicio: inicio, pagina_fim: fim, nivel: PARTES.find((p) => p[2].includes(i + 1))[1], resumo: `Estude ${titulo.toLowerCase()} com leitura, escuta, prática deliberada e registro de domínio.`, ferramentas: ['/music/criar/piano-virtual', '/music/criar/professor-piano', '/music/criar/metronomo-progressivo'] }));

const CURSO = {
  id: 'curso-piano-livro', titulo: 'Livro digital de piano', subtitulo: 'Piano do zero ao avançado', versao: '1.0', paginas: 557, capitulos: 42,
  descricao: 'Formação completa de piano, leitura, técnica, harmonia, acompanhamento, improvisação, criação e performance.',
  trilhas: [
    { id: 'conhecer', nome: 'Conhecer', resumo: 'Conceitos, postura, leitura e mapa do teclado.' },
    { id: 'ouvir', nome: 'Ouvir e reconhecer', resumo: 'Pulso, dinâmica, subdivisão, harmonia e escuta crítica.' },
    { id: 'aplicar', nome: 'Aplicar', resumo: 'Repertório, acompanhamento, improvisação e performance.' },
  ],
  partes: PARTES, capitulos: DADOS,
};

module.exports = { CURSO, PARTES, CAPITULOS: DADOS };
