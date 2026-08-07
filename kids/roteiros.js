// =====================================================================
// Villela Kids — ROTEIROS das missões guiadas (onda 2).
// Currículo CURADO POR HUMANO: cada etapa tem texto fixo, objetivo
// pedagógico e respostas de reserva ("modo simples") escritas à mão.
// O LLM (ia-llm.js) personaliza a CONVERSA dentro da etapa; ele nunca
// decide o roteiro, nunca inventa etapa e nunca inventa o erro da
// pegadinha — o erro proposital é curado aqui (mito da Muralha da China),
// porque erro inventado por LLM não é verificável pela criança.
//
// ctx disponível nos textos: { assistente, apelido, respostas }.
// =====================================================================
'use strict';

const ROTEIROS = {
  'm01-meu-assistente': {
    etapas: [
      {
        id: 'nome', titulo: 'Adote o seu assistente', tipo: 'entrada', conversa: false,
        objetivo: 'Acolher a criança e explicar que o assistente é um programa de computador que ela vai aprender a usar.',
        texto: (ctx) => `Oi, ${ctx.apelido}! Eu sou um assistente de inteligência artificial — um programa de computador que conversa.\n\nNesta missão, você vai me adotar e descobrir os truques para eu te ajudar DE VERDADE. No final, você vai escrever o seu próprio Manual.\n\nPrimeira tarefa: todo assistente precisa de um nome. Qual vai ser o meu?`,
        entrada: { rotulo: 'O nome do seu assistente', dica: 'Ex.: Robi, Faísca, Zug…', min: 2, max: 30 },
        fallbacks: [],
      },
      {
        id: 'pergunta', titulo: 'O segredo das perguntas boas', tipo: 'entrada', conversa: true,
        objetivo: 'Ensinar que pergunta boa tem DETALHE (sobre o quê exatamente), CONTEXTO (para quê / para quem) e PEDIDO claro (o que você quer receber). Elogiar o que a pergunta da criança já tem e sugerir UMA melhoria por vez.',
        texto: (ctx) => `Prazer, eu sou o ${ctx.assistente}! 🎉\n\nAgora o primeiro truque: eu respondo MUITO melhor quando a pergunta é caprichada. Pergunta boa tem três partes:\n1. DETALHE — sobre o quê exatamente?\n2. CONTEXTO — para quê você quer saber?\n3. PEDIDO — como você quer a resposta? (uma lista? uma história? um desenho de ideia?)\n\nExperimente no chat aqui embaixo: me faça uma pergunta sobre algo que você AMA. Depois melhore a pergunta usando as três partes e veja a diferença!\n\nQuando terminar de testar, escreva no campo a sua pergunta mais caprichada.`,
        entrada: { rotulo: 'Sua pergunta mais caprichada', dica: 'A versão melhorada, com detalhe + contexto + pedido', min: 10, max: 300 },
        fallbacks: [
          'Boa! Agora experimente acrescentar um DETALHE: sobre o quê exatamente você quer saber?',
          'Legal! E se você me contasse PARA QUÊ quer saber isso? Com contexto eu ajudo melhor.',
          'Quase lá! Falta o PEDIDO: você quer uma lista, uma explicação curta ou uma história?',
        ],
      },
      {
        id: 'do-meu-jeito', titulo: 'Explica do MEU jeito', tipo: 'entrada', conversa: true,
        objetivo: 'Mostrar que a criança pode pedir a MESMA explicação de vários jeitos (com futebol, com dinossauros, como história, mais simples) até entender. Responder a explicação pedida de forma curta e no estilo que ela pedir.',
        texto: (ctx) => `Segundo truque: se você não entendeu, a culpa NÃO é sua — é só pedir de outro jeito!\n\nEu sei explicar a mesma coisa de mil formas: "explica com futebol", "explica com dinossauros", "explica como se eu tivesse 5 anos", "conta como uma história".\n\nExperimente no chat: escolha algo que você sempre quis entender (por que o céu é azul? como o avião voa?) e me peça do SEU jeito favorito.\n\nDepois escreva no campo o que você descobriu.`,
        entrada: { rotulo: 'O que você descobriu?', dica: 'O que você pediu e qual jeito de explicar funcionou melhor', min: 10, max: 400 },
        fallbacks: [
          'Adorei o pedido! Tenta assim: "me explica isso como se fosse um jogo" — cada jeito revela um pedaço novo.',
          'Esse é o espírito! Se ainda ficou confuso, peça: "agora mais simples ainda". Eu não canso nunca.',
        ],
      },
      {
        id: 'pegadinha', titulo: 'A pegadinha do assistente', tipo: 'entrada', conversa: true,
        objetivo: 'A criança está caçando um erro proposital entre três fatos. NÃO revelar qual é o falso, mesmo se perguntarem diretamente — incentivar a conferir com um adulto ou outra fonte. Dar no máximo uma pista sutil por vez.',
        texto: (ctx) => `Agora o truque MAIS importante de todos. Vou te contar um segredo: assistentes como eu também ERRAM. E quem não confere, acredita em erro.\n\nOlha só, eu vou te contar três "fatos" — mas UM deles é falso, de propósito:\n\n1. O mel nunca estraga — já acharam mel de milhares de anos ainda bom para comer.\n2. A Muralha da China é a única construção humana que dá para ver do espaço.\n3. Polvos têm três corações.\n\nQual é o falso? Confira com um adulto, num livro ou peça ajuda no chat (mas eu não vou entregar fácil!). Escreva sua resposta no campo.`,
        entrada: { rotulo: 'Qual é o falso — e por quê?', dica: 'Ex.: "Acho que é o número X porque…"', min: 5, max: 300 },
        fallbacks: [
          'Hmm, não vou entregar! 🤫 Dica: um desses "fatos" é tão famoso que quase todo mundo repete sem conferir…',
          'Pergunta para um adulto da sua casa qual ele acha — e desconfiem JUNTOS. Detetives trabalham em dupla!',
        ],
      },
      {
        id: 'revelacao', titulo: 'A revelação', tipo: 'avancar', conversa: true,
        objetivo: 'Comemorar a investigação da criança (independente do palpite), confirmar a resposta certa e reforçar a lição: sempre conferir informação importante em outra fonte.',
        texto: (ctx) => `Hora da verdade! ${ctx.respostas['pegadinha'] ? `Você respondeu: "${ctx.respostas['pegadinha']}"\n\n` : ''}O falso era o número 2! 🎭\n\nA Muralha da China NÃO dá para ver do espaço a olho nu — os próprios astronautas dizem isso. É um mito tão repetido que parece verdade. O mel eterno e os três corações do polvo são verdadeiros!\n\nA lição que vale ouro: quando uma informação for importante, confira em outra fonte — mesmo quando vier de mim. Combinado?`,
        fallbacks: [
          'Pois é! Até eu posso repetir um mito sem perceber. Por isso detetives conferem tudo.',
        ],
      },
      {
        id: 'regras', titulo: 'As SUAS regras', tipo: 'entrada', conversa: true,
        objetivo: 'Ajudar a criança a formular as próprias regras com base no que viveu na missão (perguntar com detalhe, pedir do seu jeito, conferir, não contar dados pessoais). Se ela pedir ideias, relembrar o que ELA fez nas etapas — não ditar regras prontas.',
        texto: (ctx) => `Chegou a hora de escrever o seu MANUAL! 📜\n\nPense em tudo que você descobriu hoje comigo, o ${ctx.assistente}, e escreva as SUAS 5 regras para conversar com uma inteligência artificial.\n\nUma por linha. Podem ser suas mesmo — as regras que VOCÊ descobriu, do seu jeito de falar. (Se quiser inspiração, me pergunte no chat o que a gente fez hoje!)`,
        entrada: { rotulo: 'Minhas 5 regras', dica: 'Escreva uma regra por linha', min: 30, max: 2000, multilinha: true },
        fallbacks: [
          'Lembra da etapa das perguntas? O que fazia a resposta melhorar? Isso pode virar a sua regra número 1!',
          'E aquele fato falso, hein? O que você faria para não cair em outro? Vira regra também!',
        ],
      },
      {
        id: 'manual', titulo: 'Seu Manual está pronto!', tipo: 'concluir', conversa: false,
        objetivo: 'Fechamento festivo.',
        texto: (ctx) => `Olha só o que você construiu, ${ctx.apelido}! O Manual do ${ctx.assistente} vai direto para o seu portfólio — a sua primeira criação do clube. 🏆\n\nDê um título para ela e guarde. Depois, momento família: leia o seu Manual para todo mundo e conte qual foi o erro que você pescou!`,
        fallbacks: [],
      },
    ],

    montarCriacao(respostas, crianca) {
      const assistente = respostas['nome'] || 'meu assistente';
      const linhas = [
        `O MANUAL DO ${String(assistente).toUpperCase()}`,
        `por ${crianca.apelido}`,
        '',
        'Minhas regras para conversar com inteligência artificial:',
        String(respostas['regras'] || '').trim(),
        '',
        `O erro que eu pesquei: a Muralha da China NÃO dá para ver do espaço — eu conferi! (Meu palpite: ${String(respostas['pegadinha'] || '—').trim()})`,
        `A pergunta que aprendi a caprichar: ${String(respostas['pergunta'] || '—').trim()}`,
        `O que descobri pedindo do meu jeito: ${String(respostas['do-meu-jeito'] || '—').trim()}`,
      ];
      return { titulo_sugerido: `O Manual do ${assistente}`, conteudo: linhas.join('\n') };
    },
  },
};

const temRoteiro = (missionId) => !!ROTEIROS[String(missionId || '')];
const roteiroDe = (missionId) => ROTEIROS[String(missionId || '')] || null;

module.exports = { ROTEIROS, temRoteiro, roteiroDe };
