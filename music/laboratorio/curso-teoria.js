'use strict';

/* Currículo editorial único: a mesma estrutura alimenta o curso do Musique,
 * o futuro livro e a futura trilha da Villela Academy. O texto das lições
 * continua em licoes.js; este arquivo descreve percurso, objetivos e estado. */
const NIVEIS = [
  { id: 'primeiros-passos', ordem: 0, nome: 'Primeiros passos', resumo: 'Comece do zero: som, notas, nomes e um jeito de estudar música.', status: 'disponivel', modulos: [
    { id: 'som-e-mapa', nome: 'Som e mapa musical', objetivo: 'Criar uma rotina de estudo, encontrar o pulso, cantar e reconhecer altura, duração e o nome das notas.', licoes: ['como-estudar-musica', 'escuta-ativa-e-pulso', 'cantar-e-localizar-notas', 'som-e-nota', 'alfabeto-musical', 'revisao-primeiros-passos'] },
  ] },
  { id: 'fundamentos', ordem: 1, nome: 'Fundamentos da linguagem', resumo: 'Leia o básico e sinta o pulso antes de tocar.', status: 'disponivel', modulos: [
    { id: 'leitura-e-ritmo', nome: 'Leitura e ritmo', objetivo: 'Ler pauta, claves, figuras, pausas, pulso e compasso.', licoes: ['primeira-leitura-ritmica', 'primeira-leitura-melodica', 'tons-e-semitons', 'pauta-e-claves', 'figuras-e-pausas', 'pulso-e-compasso'] },
  ] },
  { id: 'leitura-percepcao', ordem: 2, nome: 'Leitura e percepção', resumo: 'Conecte o que vê, ouve, canta e toca.', status: 'disponivel', modulos: [
    { id: 'intervalos-ouvido', nome: 'Intervalos e ouvido relativo', objetivo: 'Ouvir distâncias e reconhecer relações entre notas.', licoes: ['intervalos', 'treino-intervalos', 'ditado-melodico', 'ouvido-absoluto'] },
  ] },
  { id: 'escalas-tonalidades', ordem: 3, nome: 'Escalas e tonalidades', resumo: 'Entenda tons, armaduras e modos como mapas de possibilidades.', status: 'disponivel', modulos: [
    { id: 'mapas-tonais', nome: 'Escalas, armaduras e modos', objetivo: 'Construir escalas e localizar centros tonais.', licoes: ['escala-maior', 'escalas-menores', 'armaduras', 'modos'] },
  ] },
  { id: 'harmonia-funcional', ordem: 4, nome: 'Harmonia funcional', resumo: 'Veja como acordes criam tensão, direção e repouso.', status: 'disponivel', modulos: [
    { id: 'acordes-e-campo', nome: 'Acordes e campo harmônico', objetivo: 'Formar tríades, tétrades e analisar graus.', licoes: ['triades', 'campo-harmonico', 'tetrades'] },
  ] },
  { id: 'melodia-forma', ordem: 5, nome: 'Melodia e forma', resumo: 'Organize ideias musicais em frases, motivos e seções.', status: 'disponivel', modulos: [
    { id: 'estrutura', nome: 'Estrutura musical', objetivo: 'Reconhecer motivos, frases, cadências e formas.', licoes: ['frase-e-forma', 'notas-fora-da-harmonia'] },
  ] },
  { id: 'harmonia-aplicada', ordem: 6, nome: 'Harmonia aplicada', resumo: 'Use extensões, empréstimos, modulações e baixo cifrado.', status: 'disponivel', modulos: [
    { id: 'cores-e-movimento', nome: 'Cores e movimento harmônico', objetivo: 'Aplicar recursos de repertório popular e tonal.', licoes: ['harmonia-popular', 'emprestimo-e-modulacao', 'baixo-cifrado'] },
  ] },
  { id: 'arranjo-pratica', ordem: 7, nome: 'Arranjo e prática de conjunto', resumo: 'Transforme análise em partes tocáveis e decisões de interpretação.', status: 'disponivel', modulos: [
    { id: 'textura-expressao', nome: 'Textura, contraponto e expressão', objetivo: 'Distribuir vozes e escolher articulação e dinâmica.', licoes: ['articulacao-e-dinamica', 'contraponto'] },
  ] },
  { id: 'tecnologia-musical', ordem: 8, nome: 'Tecnologia musical', resumo: 'Aplique teoria no áudio, MIDI, gravação e ferramentas digitais.', status: 'disponivel', modulos: [
    { id: 'som-e-tecnologia', nome: 'Som e tecnologia', objetivo: 'Relacionar acústica, afinação e produção musical.', licoes: ['acustica', 'doze-sons'] },
  ] },
  { id: 'criacao-analise', ordem: 9, nome: 'Criação e análise avançada', resumo: 'Componha, arranje e explique escolhas com autonomia.', status: 'disponivel', modulos: [
    { id: 'projeto-final', nome: 'Projeto final', objetivo: 'Analisar e criar uma peça usando os recursos do curso.', licoes: ['projeto-final'] },
  ] },
];

// A primeira edição ampliada acrescenta prática deliberada e conteúdos que
// não cabiam na trilha inicial. Os slugs continuam no mesmo catálogo para
// alimentar página, livro e Academy sem duplicar texto.
NIVEIS[0].modulos.push({ id: 'rotina-e-escuta', nome: 'Rotina, corpo e escuta', objetivo: 'Criar atenção, memória e vocabulário a partir do som.', licoes: ['rotina-de-escuta', 'mapa-do-instrumento', 'pulso-no-corpo', 'pergunta-musical', 'diario-de-pratica'] });
NIVEIS[1].modulos.push({ id: 'som-e-fisica', nome: 'Som e matéria', objetivo: 'Relacionar fonte, frequência, envelope, ruído e silêncio.', licoes: ['timbre-e-fonte', 'frequencia-e-altura', 'envelope-do-som', 'ruido-e-silencio', 'notas-e-oitavas', 'enharmonia-na-pratica'] });
NIVEIS[1].modulos.push({ id: 'ritmo-aplicado', nome: 'Ritmo aplicado', objetivo: 'Internalizar subdivisão, síncope, anacruse e polirritmia.', licoes: ['subdivisao-binaria', 'subdivisao-ternaria', 'sincopa-e-contratempo', 'anacruse-e-levare', 'quialteras', 'polirritmia-basica'] });
NIVEIS[2].modulos.push({ id: 'leitura-e-ditado', nome: 'Leitura e ditado', objetivo: 'Ler armaduras, claves, intervalos e escrever o que se ouve.', licoes: ['leitura-de-armaduras', 'claves-e-registro', 'intervalo-numero-qualidade', 'inversao-de-intervalos', 'solfejo-movel', 'ditado-ritmico-progressivo', 'ditado-harmonico'] });
NIVEIS[3].modulos.push({ id: 'escalas-aplicadas', nome: 'Escalas em contexto', objetivo: 'Construir, ouvir e transpor escalas, modos e tonalidades.', licoes: ['escala-maior-construcao', 'menor-natural', 'menor-harmonica-melodica', 'modos-e-nota-caracteristica', 'pentatonica-e-blues', 'circulo-quintas-aplicado', 'transposicao-metodo'] });
NIVEIS[4].modulos.push({ id: 'harmonia-na-pratica', nome: 'Harmonia na prática', objetivo: 'Construir acordes, funções, cadências e condução.', licoes: ['triades-e-inversoes', 'tetrades-e-guia', 'funcoes-tonais', 'cadencias', 'dominantes-secundarias', 'emprestimo-modal', 'substituicao-tritono', 'extensoes-e-tensoes', 'modulacao-pivot'] });
NIVEIS[5].modulos.push({ id: 'melodia-e-forma', nome: 'Melodia, forma e textura', objetivo: 'Desenvolver ideias melódicas e compreender sua organização.', licoes: ['melodia-e-acorde', 'motivo-e-variacao', 'frase-periodo', 'forma-da-cancao', 'notas-nao-harmonicas', 'contraponto-especies', 'quatro-vozes', 'textura-musical'] });
NIVEIS[7].modulos.push({ id: 'arranjo-real', nome: 'Arranjo real', objetivo: 'Transformar funções musicais em partes tocáveis.', licoes: ['groove-e-secao-ritmica', 'voicings-para-teclado', 'violao-e-guitarra-arranjo', 'cordas-dedilhadas-no-arranjo', 'voz-e-tessitura', 'bateria-e-mapa-vertical', 'arranjo-por-camadas'] });
NIVEIS[8].modulos.push({ id: 'arquivos-e-escuta', nome: 'Arquivos, MIDI e produção', objetivo: 'Usar ferramentas digitais sem perder a escuta musical.', licoes: ['midi-e-eventos', 'musicxml-e-partitura', 'piano-roll-e-groove', 'escuta-critica-gravacao'] });
NIVEIS[9].modulos.push({ id: 'autoria-e-portfolio', nome: 'Autoria e portfólio', objetivo: 'Criar, analisar, revisar e apresentar trabalho autoral.', licoes: ['motivo-para-composicao', 'improvisacao-com-alvos', 'analise-completa-repertorio', 'projeto-composicao-arranjo', 'portfolio-e-autoavaliacao'] });

const CURSO = {
  id: 'teoria-musical-completa',
  titulo: 'Teoria musical completa',
  subtitulo: 'Do zero ao avançado',
  versao: '1.1',
  descricao: 'Um percurso progressivo para conhecer, ouvir e aplicar música no instrumento, na voz e no arranjo.',
  trilhas: [
    { id: 'conhecer', nome: 'Conhecer', resumo: 'Conceitos, símbolos e mapas.' },
    { id: 'ouvir', nome: 'Ouvir e reconhecer', resumo: 'Treino do ouvido e da percepção.' },
    { id: 'aplicar', nome: 'Aplicar', resumo: 'Instrumento, repertório e criação.' },
  ],
  niveis: NIVEIS,
};

const POR_LICAO = Object.fromEntries(NIVEIS.flatMap((n) => n.modulos.flatMap((m) => m.licoes.map((slug) => [slug, { nivel: n, modulo: m }]))));

module.exports = { CURSO, NIVEIS, POR_LICAO };
