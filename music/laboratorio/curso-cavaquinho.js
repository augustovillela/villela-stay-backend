'use strict';

const partes = [
  ['fundamentos', 'Conhecendo o cavaquinho', [1, 2, 3, 4]],
  ['tecnica', 'Postura, mãos e primeiros acordes', [5, 6, 7, 8]],
  ['ritmo', 'Pulso, batidas e acompanhamento', [9, 10, 11, 12]],
  ['harmonia', 'Cifras, acordes e transposição', [13, 14, 15, 16]],
  ['samba', 'Samba, pagode e roda', [17, 18, 19, 20]],
  ['choro', 'Choro, seresta e ritmos tradicionais', [21, 22, 23, 24]],
  ['recursos', 'Harmonia avançada e arranjos', [25, 26, 27, 28, 29]],
  ['criacao', 'Escalas, frases e improvisação', [30, 31, 32, 33]],
  ['repertorio', 'Repertório e aplicação musical', [34, 35, 36, 37]],
  ['performance', 'Performance e plano de evolução', [38]],
];

const titulos = [
  'História e função do cavaquinho', 'Anatomia e tipos', 'Acessórios e manutenção', 'Afinação',
  'Postura', 'Mão direita', 'Mão esquerda', 'Primeiros acordes',
  'Pulsação e contagem', 'Primeiras batidas', 'O braço da mão direita', 'Batidas de acompanhamento',
  'Leitura de cifras', 'Formação dos acordes', 'Campo harmônico maior', 'Transposição',
  'O cavaquinho no samba', 'Batidas de samba', 'Pagode', 'Tocar em uma roda',
  'Introdução ao choro', 'Melodias e acompanhamentos de choro', 'Seresta, valsas e tradicionais', 'Forró, baião e xote',
  'Acordes com sétima', 'Tensões e extensões', 'Inversões e condução de vozes', 'Introduções, interlúdios e finais', 'Arranjos para cavaquinho',
  'Escalas no cavaquinho', 'Arpejos e frases', 'Improvisação', 'Solo e contraponto',
  'Tocar e cantar', 'Tocar com outros músicos', 'Gravação', 'Apresentações', 'Plano de evolução',
];

const porNumero = Object.fromEntries(partes.flatMap(([id, nome, ns]) => ns.map((n) => [n, { id, nome }])));
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const capitulos = titulos.map((titulo, i) => {
  const numero = i + 1;
  const fase = porNumero[numero] || { id: 'repertorio', nome: 'Repertório e aplicação musical' };
  return {
    id: `cavaquinho-${String(numero).padStart(2, '0')}-${slug(titulo)}`,
    numero, titulo, slug: `cavaquinho-${String(numero).padStart(2, '0')}`,
    fase: fase.id, faseNome: fase.nome, nivel: numero <= 8 ? 'iniciante' : numero <= 20 ? 'basico' : numero <= 33 ? 'intermediario' : 'avancado',
    resumo: `Estude ${titulo.toLowerCase()} com leitura, prática orientada e aplicação musical no cavaquinho.`,
    arquivo: `cap-${String(numero).padStart(2, '0')}-${slug(titulo)}.md`,
    ferramentas: ['/music/criar/metronomo-progressivo', '/music/explorar/laboratorio'],
  };
});

const CURSO = {
  id: 'curso-cavaquinho-livro',
  titulo: 'Curso de cavaquinho',
  subtitulo: 'Do primeiro acorde ao samba, choro e performance',
  versao: '1.0.0',
  descricao: 'Um percurso completo de cavaquinho baseado no livro Cavaquinho: do Zero ao Avançado.',
  // PDF-base com a capa Villela Music adicionada.
  paginas: 748,
  trilhas: [
    { nome: 'Conhecer', resumo: 'Instrumento, postura, afinação, acordes e mapas.' },
    { nome: 'Ouvir e reconhecer', resumo: 'Pulso, subdivisão, batidas, estilos e escuta crítica.' },
    { nome: 'Aplicar', resumo: 'Samba, pagode, choro, repertório, criação e performance.' },
  ],
};

module.exports = { CURSO, partes, capitulos };
