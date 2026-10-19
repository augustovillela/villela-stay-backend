'use strict';

/* Currículo editorial único: a mesma estrutura alimenta o curso do Musique,
 * o futuro livro e a futura trilha da Villela Academy. O texto das lições
 * continua em licoes.js; este arquivo descreve percurso, objetivos e estado. */
const NIVEIS = [
  { id: 'primeiros-passos', ordem: 0, nome: 'Primeiros passos', resumo: 'Comece do zero: som, notas, nomes e um jeito de estudar música.', status: 'disponivel', modulos: [
    { id: 'som-e-mapa', nome: 'Som e mapa musical', objetivo: 'Criar uma rotina de estudo, encontrar o pulso e reconhecer altura, duração e o nome das notas.', licoes: ['como-estudar-musica', 'escuta-ativa-e-pulso', 'som-e-nota', 'alfabeto-musical'] },
  ] },
  { id: 'fundamentos', ordem: 1, nome: 'Fundamentos da linguagem', resumo: 'Leia o básico e sinta o pulso antes de tocar.', status: 'disponivel', modulos: [
    { id: 'leitura-e-ritmo', nome: 'Leitura e ritmo', objetivo: 'Ler pauta, claves, figuras, pausas, pulso e compasso.', licoes: ['tons-e-semitons', 'pauta-e-claves', 'figuras-e-pausas', 'pulso-e-compasso'] },
  ] },
  { id: 'leitura-percepcao', ordem: 2, nome: 'Leitura e percepção', resumo: 'Conecte o que vê, ouve, canta e toca.', status: 'em-construcao', modulos: [
    { id: 'intervalos-ouvido', nome: 'Intervalos e ouvido relativo', objetivo: 'Ouvir distâncias e reconhecer relações entre notas.', licoes: ['intervalos', 'ouvido-absoluto'] },
  ] },
  { id: 'escalas-tonalidades', ordem: 3, nome: 'Escalas e tonalidades', resumo: 'Entenda tons, armaduras e modos como mapas de possibilidades.', status: 'em-construcao', modulos: [
    { id: 'mapas-tonais', nome: 'Escalas, armaduras e modos', objetivo: 'Construir escalas e localizar centros tonais.', licoes: ['escala-maior', 'escalas-menores', 'armaduras', 'modos'] },
  ] },
  { id: 'harmonia-funcional', ordem: 4, nome: 'Harmonia funcional', resumo: 'Veja como acordes criam tensão, direção e repouso.', status: 'em-construcao', modulos: [
    { id: 'acordes-e-campo', nome: 'Acordes e campo harmônico', objetivo: 'Formar tríades, tétrades e analisar graus.', licoes: ['triades', 'campo-harmonico', 'tetrades'] },
  ] },
  { id: 'melodia-forma', ordem: 5, nome: 'Melodia e forma', resumo: 'Organize ideias musicais em frases, motivos e seções.', status: 'em-construcao', modulos: [
    { id: 'estrutura', nome: 'Estrutura musical', objetivo: 'Reconhecer motivos, frases, cadências e formas.', licoes: ['frase-e-forma', 'notas-fora-da-harmonia'] },
  ] },
  { id: 'harmonia-aplicada', ordem: 6, nome: 'Harmonia aplicada', resumo: 'Use extensões, empréstimos, modulações e baixo cifrado.', status: 'em-construcao', modulos: [
    { id: 'cores-e-movimento', nome: 'Cores e movimento harmônico', objetivo: 'Aplicar recursos de repertório popular e tonal.', licoes: ['harmonia-popular', 'emprestimo-e-modulacao', 'baixo-cifrado'] },
  ] },
  { id: 'arranjo-pratica', ordem: 7, nome: 'Arranjo e prática de conjunto', resumo: 'Transforme análise em partes tocáveis e decisões de interpretação.', status: 'planejado', modulos: [
    { id: 'textura-expressao', nome: 'Textura, contraponto e expressão', objetivo: 'Distribuir vozes e escolher articulação e dinâmica.', licoes: ['articulacao-e-dinamica', 'contraponto'] },
  ] },
  { id: 'tecnologia-musical', ordem: 8, nome: 'Tecnologia musical', resumo: 'Aplique teoria no áudio, MIDI, gravação e ferramentas digitais.', status: 'planejado', modulos: [
    { id: 'som-e-tecnologia', nome: 'Som e tecnologia', objetivo: 'Relacionar acústica, afinação e produção musical.', licoes: ['acustica', 'doze-sons'] },
  ] },
  { id: 'criacao-analise', ordem: 9, nome: 'Criação e análise avançada', resumo: 'Componha, arranje e explique escolhas com autonomia.', status: 'planejado', modulos: [
    { id: 'projeto-final', nome: 'Projeto final', objetivo: 'Analisar e criar uma peça usando os recursos do curso.', licoes: [] },
  ] },
];

const CURSO = {
  id: 'teoria-musical-completa',
  titulo: 'Teoria musical completa',
  subtitulo: 'Do zero ao avançado',
  versao: '1.0',
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
