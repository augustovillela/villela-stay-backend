// =====================================================================
// Villela Kids — CATÁLOGO das 8 missões do MVP (fase 1).
// Currículo CURADO POR HUMANO, versionado em código (regra do
// PROMPT_MASTER §4: a IA personaliza a entrega, nunca inventa o
// currículo). Aprovado pelo Augusto em 07/08/2026
// (docs/kids/missoes-mvp.md). Upsert no boot por repo.semear().
// O roteiro passo a passo de cada missão entra na onda 2 (tutor IA);
// aqui está o que a onda 1 precisa: convite, produto final e momento
// família — na voz PARA A CRIANÇA (7–11 anos).
// =====================================================================
'use strict';

const MISSOES = [
  {
    id: 'm01-meu-assistente', ordem: 1, emoji: '🤖', titulo: 'O Meu Assistente', eixo: 'criar',
    resumo: 'Adote seu assistente de IA: dê um nome a ele e descubra como conversar para ele te ajudar de verdade. Cuidado — ele vai esconder um erro de propósito!',
    produto_final: 'O Manual do Meu Assistente: as 5 regras que VOCÊ descobriu sobre conversar com IA.',
    momento_familia: 'Leia o seu Manual para a família e conte qual foi o erro que você pescou.',
  },
  {
    id: 'm02-minha-historia', ordem: 2, emoji: '📖', titulo: 'A História que Só Eu Podia Contar', eixo: 'criar',
    resumo: 'Invente uma história com herói, lugar e problema da SUA vida. O assistente é seu coautor: ele sugere caminhos, mas quem decide é você.',
    produto_final: 'Uma história de uma página, escrita por você (com final 100% seu).',
    momento_familia: 'Leia a história em voz alta para a família antes de dormir.',
  },
  {
    id: 'm03-estudio-ilustracao', ordem: 3, emoji: '🎨', titulo: 'Estúdio de Ilustração', eixo: 'criar',
    resumo: 'Transforme a sua história em livro! Aprenda a descrever cenas tão bem que dá para desenhá-las — e monte a capa e as ilustrações.',
    produto_final: 'Seu livrinho: capa + 3 ilustrações da história da missão anterior.',
    momento_familia: 'Imprimam (ou montem) o livrinho juntos e deixem na estante de verdade.',
  },
  {
    id: 'm04-inventor-de-jogos', ordem: 4, emoji: '🎲', titulo: 'Inventor de Jogos', eixo: 'criar',
    resumo: 'Crie um jogo de tabuleiro ou de cartas com regras suas. O assistente vira um "jogador chato" que procura furos nas regras — conserte todos!',
    produto_final: 'As regras escritas do seu jogo + o tabuleiro pronto para jogar.',
    momento_familia: 'Noite de jogo: a família joga a SUA invenção (e você explica as regras).',
  },
  {
    id: 'm05-mini-podcast', ordem: 5, emoji: '🎙️', titulo: 'Meu Mini-Podcast', eixo: 'criar',
    resumo: 'Escolha um assunto que você domina e monte um roteiro com começo, meio e fim. Depois grave 3 minutos no celular da família.',
    produto_final: 'O roteiro do seu episódio (a gravação fica no celular da família, só de vocês).',
    momento_familia: 'Ouçam o episódio juntos no jantar, como um programa de verdade.',
  },
  {
    id: 'm06-minha-hq', ordem: 6, emoji: '💥', titulo: 'Minha HQ', eixo: 'criar',
    resumo: 'Crie um personagem só seu (com medo e superpoder!) e conte uma história em quadrinhos. O segredo é escolher o que fica ENTRE os quadros.',
    produto_final: 'Uma tira de 4 a 6 quadros com balões escritos por você.',
    momento_familia: 'Cole a tira na geladeira — toda HQ merece público.',
  },
  {
    id: 'm07-minha-empresa', ordem: 7, emoji: '💡', titulo: 'Minha Primeira Empresa', eixo: 'criar',
    resumo: 'Invente um produto que resolve um problema da sua casa. Dê nome, preço e enfrente o cliente mais difícil do mundo: o assistente cético.',
    produto_final: 'Cartaz do produto + o seu discurso de venda de 1 minuto.',
    momento_familia: 'Faça o pitch para a família — eles "compram" (ou não!) com dinheiro de brincadeira.',
  },
  {
    id: 'm08-detetive-digital', ordem: 8, emoji: '🔍', titulo: 'Detetive Digital', eixo: 'criar',
    resumo: 'Missão final: 5 casos para investigar — o que é verdade e o que é falso na internet? No fim, o assistente confessa os erros que cometeu com você.',
    produto_final: 'O Guia do Detetive da sua família: os 3 testes para descobrir se algo é verdade.',
    momento_familia: 'Apresente o Guia e combine com todos quando NÃO confiar no que aparece na tela.',
  },
];

module.exports = { MISSOES };
