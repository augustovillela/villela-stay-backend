'use strict';

const LIVRO = require('./curso-bandolim-conteudo.json');
const faixas = [
  ['fundamentos', 'Conhecendo o bandolim', [1, 2, 3, 4]],
  ['som', 'Afinação, postura e produção do som', [5, 6, 7, 8]],
  ['palhetada', 'Palhetada e primeiras melodias', [9, 10, 11, 12]],
  ['leitura', 'Leitura, ritmo e braço do instrumento', [13, 14, 15, 16]],
  ['escalas', 'Escalas, intervalos e arpejos', [17, 18, 19, 20, 21]],
  ['tremolo', 'Tremolo, articulação e técnicas avançadas', [22, 23, 24, 25, 26]],
  ['choro', 'Choro e música brasileira', [27, 28, 29, 30, 31]],
  ['harmonia', 'Harmonia, acordes e arranjos', [32, 33, 34, 35, 36]],
  ['criacao', 'Improvisação, transcrição e criação', [37, 38, 39]],
  ['performance', 'Performance e desenvolvimento profissional', [40, 41, 42, 43]],
];
const porNumero = Object.fromEntries(faixas.flatMap(([id, nome, ns]) => ns.map((n) => [n, { id, nome }])));
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const objetivoDo = (texto, titulo) => {
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim();
  const m = limpo.match(/Ao fim deste capítulo,?\s+(.+?)(?=\s+(?:Objetivos de aprendizagem|Pré-requisitos|Conceitos fundamentais)\b|$)/i);
  return m ? m[1].trim() : `Compreender e aplicar ${titulo.toLowerCase()} no bandolim.`;
};
const capitulos = LIVRO.capitulos.map((x) => {
  const fase = porNumero[x.numero];
  return { ...x, id: `bandolim-${String(x.numero).padStart(2, '0')}-${slug(x.titulo)}`, slug: `bandolim-${String(x.numero).padStart(2, '0')}`, fase: fase.id, faseNome: fase.nome, nivel: x.numero <= 8 ? 'iniciante' : x.numero <= 16 ? 'basico' : x.numero <= 31 ? 'intermediario' : 'avancado', objetivo: objetivoDo(x.conteudo, x.titulo), resumo: `Estude ${x.titulo.toLowerCase()} com leitura, técnica, escuta e aplicação no bandolim.`, arquivo: `cap-${String(x.numero).padStart(2, '0')}-${slug(x.titulo)}.md` };
});
const CURSO = {
  id: 'curso-bandolim-livro', titulo: 'Curso de bandolim', subtitulo: 'Do primeiro som ao choro, tremolo e performance', versao: '1.0.0',
  descricao: 'Percurso completo baseado no livro Bandolim Brasileiro: do Zero ao Avançado.', paginas: LIVRO.paginas_pdf,
  trilhas: [
    { nome: 'Conhecer', resumo: 'História, anatomia, afinação, leitura e mapa das quatro ordens.' },
    { nome: 'Ouvir e reconhecer', resumo: 'Timbre, pulso, articulação, tremolo, dinâmica e escuta crítica.' },
    { nome: 'Aplicar', resumo: 'Melodias, choro, arranjos, improvisação, repertório e performance.' },
  ],
};
module.exports = { CURSO, partes: faixas, capitulos };
