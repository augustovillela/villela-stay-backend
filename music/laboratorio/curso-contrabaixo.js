'use strict';

const partes = [
  ['fundamentos', 'Primeiros passos no instrumento', [1, 2, 3, 4]],
  ['tecnica', 'Técnica fundamental e controle do som', [5, 6, 7]],
  ['ritmo', 'Ritmo, leitura e musicalidade', [8, 9, 10, 11]],
  ['teoria', 'Teoria musical aplicada ao braço', [12, 13, 14, 15]],
  ['harmonia', 'Harmonia e construção de linhas', [16, 17, 18, 19]],
  ['expressao', 'Técnicas de expressão', [20, 21, 22, 23, 24]],
  ['estilos', 'Groove, síncopa e estilos', [25, 26, 27, 28, 29, 30]],
  ['slap', 'Slap e técnicas expandidas', [31, 32, 33, 34]],
  ['criacao', 'Modos, improvisação e criação', [35, 36, 37, 38]],
  ['profissionalizacao', 'Performance, equipamento e profissionalização', [39, 40, 41, 42, 43]],
];
const titulos = [
  'Conhecendo o contrabaixo elétrico', 'Afinando o instrumento', 'Postura, relaxamento e ergonomia', 'Primeiras notas e primeiros exercícios',
  'Técnica da mão direita', 'Técnica da mão esquerda', 'Cromatismos e coordenação', 'Pulsação e subdivisão',
  'O metrônomo como ferramenta musical', 'Tablatura, cifras e partitura', 'Primeiras linhas de baixo', 'Tons, semitons e acidentes',
  'Intervalos musicais', 'Escala maior', 'Campo harmônico maior', 'Tríades', 'Tétrades e acordes com sétima',
  'Condução de vozes', 'Escala menor e pentatônicas', 'Hammer-on e pull-off', 'Slides e mudanças de posição',
  'Vibrato, bends e controle de afinação', 'Ghost notes e abafamentos', 'Dinâmica, articulação e fraseado',
  'Síncopa e contratempo', 'Funk e soul', 'Rock e pop', 'Blues e shuffle', 'Reggae e ska', 'Música brasileira',
  'Introdução ao slap', 'Slap intermediário', 'Slap avançado', 'Tapping, harmônicos e técnicas especiais',
  'Modos gregos aplicados ao baixo', 'Improvisação sobre acordes', 'Criação de riffs e linhas originais', 'Transcrição e análise',
  'Timbre e equipamento', 'Tocar em banda', 'Gravação e estudo com bases', 'Preparação para apresentações', 'Plano de desenvolvimento contínuo',
];
const paginas = [14, 25, 35, 45, 61, 72, 83, 98, 108, 117, 127, 142, 150, 159, 168, 182, 190, 197, 205, 219, 225, 231, 237, 243, 255, 261, 267, 273, 280, 286, 301, 307, 312, 318, 330, 338, 345, 351, 362, 368, 374, 379, 384];
const resumos = [
  'Conheça o instrumento, suas partes, possibilidades e cuidados.', 'Construa uma rotina confiável de afinação.', 'Toque com conforto, relaxamento e economia de movimento.', 'Produza as primeiras notas limpas e controladas.',
  'Desenvolva alternância, consistência e timbre na mão direita.', 'Organize a mão esquerda para tocar sem tensão.', 'Use cromatismos para coordenar as duas mãos.', 'Sinta e subdivida o pulso antes de preencher o compasso.',
  'Use o clique para desenvolver estabilidade e intenção musical.', 'Leia as três linguagens mais usadas pelo baixista.', 'Construa linhas simples que sustentem a música.', 'Localize tons, semitons e acidentes no braço.',
  'Ouça e aplique intervalos em linhas de baixo.', 'Mapeie a escala maior e suas funções.', 'Transforme a escala em graus e caminhos harmônicos.', 'Construa linhas a partir das tríades.', 'Use sétimas para criar movimento e cor.',
  'Conecte acordes com o menor movimento possível.', 'Explore a sonoridade menor e as pentatônicas.', 'Articule notas ligadas com clareza.', 'Mude de posição sem quebrar o pulso.',
  'Controle afinação, vibrato e expressividade.', 'Abafe e articule notas fantasma sem perder o groove.', 'Varie intensidade e ataque a serviço da frase.',
  'Antecipe e atrase notas mantendo o pulso.', 'Construa pocket, espaço e repetição no funk e soul.', 'Sustente canções com segurança e simplicidade.', 'Domine a forma, o shuffle e o walking bass.',
  'Toque no espaço do reggae e do ska.', 'Explore levadas e sotaques da música brasileira.', 'Entenda o slap e seus movimentos básicos.', 'Combine thumb, pop e abafamento com controle.', 'Construa frases de slap com clareza e dinâmica.', 'Amplie recursos sem perder musicalidade.',
  'Use modos como sons concretos no braço.', 'Improvise ouvindo a harmonia e escolhendo notas-alvo.', 'Crie riffs que tenham pulso, forma e identidade.', 'Aprenda a ouvir, registrar e compreender linhas.',
  'Monte timbres coerentes com a função musical.', 'Comunique-se, escute e sustente uma banda.', 'Estude com bases e use a gravação como espelho.', 'Prepare repertório, corpo e equipamento.', 'Organize uma prática contínua e autônoma.',
];
const porNumero = Object.fromEntries(partes.flatMap(([id, nome, ns]) => ns.map((n) => [n, { id, nome }])));
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const capitulos = titulos.map((titulo, i) => ({ id: `contrabaixo-${String(i + 1).padStart(2, '0')}-${slug(titulo)}`, numero: i + 1, titulo, resumo: resumos[i], pagina: paginas[i], fase: porNumero[i + 1].id, faseNome: porNumero[i + 1].nome, nivel: i < 8 ? 'iniciante' : i < 20 ? 'basico' : i < 35 ? 'intermediario' : 'avancado', slug: `contrabaixo-${String(i + 1).padStart(2, '0')}` }));
const CURSO = { id: 'curso-contrabaixo-livro', titulo: 'Curso de contrabaixo elétrico', subtitulo: 'Do primeiro som ao groove, à criação e à performance', versao: '1.0.0', descricao: 'Um percurso completo de contrabaixo baseado no livro Contrabaixo elétrico.', trilhas: [{ nome: 'Ler e compreender', resumo: 'Conceitos, braço, ritmo, teoria e harmonia.' }, { nome: 'Tocar e controlar', resumo: 'Técnica, articulação, groove e expressão.' }, { nome: 'Criar e tocar com outros', resumo: 'Linhas, estilos, improvisação, banda e performance.' }], fases: partes };
module.exports = { CURSO, capitulos, partes };
