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
const roteiros = {
  fundamentos: ['Leia o contexto e observe as partes do instrumento.', 'Ouça ou imagine o resultado sonoro descrito no capítulo.', 'Registre uma pergunta para levar ao instrumento.'],
  som: ['Afine e organize a postura sem tensão.', 'Produza sons curtos e longos, ouvindo a diferença.', 'Anote o ajuste que deixou o som mais limpo.'],
  palhetada: ['Comece lentamente com movimento pequeno.', 'Repita a célula até manter pulso e articulação.', 'Aumente o andamento apenas se o som continuar uniforme.'],
  leitura: ['Leia o ritmo sem tocar, contando em voz alta.', 'Toque trechos curtos com metrônomo ou pulso interno.', 'Marque o ponto em que a leitura ficou instável.'],
  escalas: ['Localize as notas no braço do bandolim.', 'Toque subindo e descendo com alternância de palheta.', 'Aplique o desenho em uma frase musical curta.'],
  tremolo: ['Relaxe a mão e encontre uma alternância regular.', 'Sustente uma nota ouvindo uniformidade e ruído.', 'Registre o andamento confortável, sem forçar velocidade.'],
  choro: ['Ouça a frase e identifique o pulso brasileiro.', 'Isole a melodia em pequenos motivos.', 'Una os motivos mantendo articulação e respiração musical.'],
  harmonia: ['Localize a fundamental e as notas do acorde.', 'Pratique mudanças lentas entre as posições.', 'Use o acorde em um acompanhamento ou arranjo.'],
  criacao: ['Escolha uma ideia curta para transformar.', 'Experimente variações de ritmo, direção ou articulação.', 'Grave ou anote a versão que deseja revisar depois.'],
  performance: ['Planeje entrada, andamento, forma e final.', 'Faça uma tomada completa sem interromper por pequenos erros.', 'Registre uma melhoria objetiva para a próxima sessão.'],
};
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const objetivoDo = (texto, titulo) => {
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim();
  const m = limpo.match(/Ao fim deste capítulo,?\s+(.+?)(?=\s+(?:Objetivos de aprendizagem|Pré-requisitos|Conceitos fundamentais)\b|$)/i);
  return m ? m[1].trim() : `Compreender e aplicar ${titulo.toLowerCase()} no bandolim.`;
};
const limparConteudo = (texto) => String(texto || '').replace(/^\s*\d+\s*\n/, '').replace(/^Capítulo\s+\d+\s+—\s+[\s\S]*?\n(?=Ao fim deste capítulo)/, '').trim();
const capitulos = LIVRO.capitulos.map((x) => {
  const fase = porNumero[x.numero];
  return { ...x, conteudo_limpo: limparConteudo(x.conteudo), id: `bandolim-${String(x.numero).padStart(2, '0')}-${slug(x.titulo)}`, slug: `bandolim-${String(x.numero).padStart(2, '0')}`, fase: fase.id, faseNome: fase.nome, nivel: x.numero <= 8 ? 'iniciante' : x.numero <= 16 ? 'basico' : x.numero <= 31 ? 'intermediario' : 'avancado', objetivo: objetivoDo(x.conteudo, x.titulo), roteiro: roteiros[fase.id], resumo: `Estude ${x.titulo.toLowerCase()} com leitura, técnica, escuta e aplicação no bandolim.`, arquivo: `cap-${String(x.numero).padStart(2, '0')}-${slug(x.titulo)}.md` };
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
