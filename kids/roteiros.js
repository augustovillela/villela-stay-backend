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
  // ===================================================================
  // Missão 2 — a criança escreve; o tutor sugere rumos, NUNCA escreve por ela.
  // ===================================================================
  'm02-minha-historia': {
    etapas: [
      {
        id: 'escolha', titulo: 'Herói, lugar e problema', tipo: 'entrada', conversa: true,
        objetivo: 'Ajudar a criança a escolher herói, lugar e problema VINDOS DA VIDA DELA (seu bairro, seu bicho, seu medo, sua família). Fazer perguntas que puxem memória real; nunca sugerir elementos genéricos de desenho animado.',
        texto: (ctx) => `Hora de escrever a história que SÓ VOCÊ podia contar, ${ctx.apelido}!\n\nO segredo: use coisas da SUA vida. Um herói parecido com alguém que você conhece. Um lugar onde você já esteve. Um problema que você já sentiu de verdade.\n\nPense (pode conversar comigo!) e escreva no campo: quem é o herói, onde a história acontece e qual é o problema.`,
        entrada: { rotulo: 'Meu herói, o lugar e o problema', dica: 'Ex.: "Minha avó destemida, na feira do bairro, quando some o dinheiro do almoço"', min: 15, max: 400 },
        fallbacks: [
          'Pensa num lugar onde você já esteve DE VERDADE — sua história fica mais forte quando o chão é conhecido.',
          'O problema pode ser pequeno por fora e grande por dentro: perder algo, ter vergonha, precisar de coragem…',
        ],
      },
      {
        id: 'comeco', titulo: 'O começo', tipo: 'entrada', conversa: true,
        objetivo: 'Encorajar um começo com detalhes dos sentidos (o que se vê, ouve, cheira). Se pedirem ajuda, dar UMA sugestão de detalhe sensorial por vez. NUNCA escrever frases da história pela criança.',
        texto: (ctx) => `Toda história boa começa nos mostrando o mundo dela.\n\nEscreva o COMEÇO da sua (3 a 5 frases): apresente o herói no lugar, e deixe a gente VER a cena — o que tem ali? Que barulho faz? Que cheiro tem?\n\nSe travar, me chama no chat que eu ajudo com perguntas (mas quem escreve é você!).`,
        entrada: { rotulo: 'O começo da minha história', dica: '3 a 5 frases apresentando o herói e o lugar', min: 40, max: 1200, multilinha: true },
        fallbacks: [
          'Fecha os olhos e entra na cena: qual é a PRIMEIRA coisa que o seu herói ouve? Começa por aí!',
          'Experimente começar com o herói FAZENDO algo — histórias que começam em movimento prendem a gente.',
        ],
      },
      {
        id: 'encruzilhada', titulo: 'A encruzilhada', tipo: 'entrada', conversa: true,
        objetivo: 'Quando a criança pedir, oferecer DOIS rumos possíveis e curtos para a história (uma frase cada), sempre lembrando que ela pode inventar um terceiro. A decisão é dela; nunca dizer qual rumo é "melhor".',
        texto: (ctx) => `Agora o problema aparece — e a história chega numa ENCRUZILHADA: o que acontece?\n\nSe quiser, me peça no chat: "me dá dois rumos!" — eu sugiro dois caminhos e você escolhe… ou inventa um TERCEIRO, todinho seu (os melhores autores fazem isso!).\n\nEscreva o MEIO da história: o problema aparecendo e o herói reagindo.`,
        entrada: { rotulo: 'O meio da minha história', dica: 'O problema aparece e o herói tenta resolver', min: 40, max: 1500, multilinha: true },
        fallbacks: [
          'Dois rumos de brinde: (1) o herói pede ajuda a quem menos esperava; (2) o herói descobre que entendeu tudo errado. Ou invente o seu!',
          'Deixe o herói ERRAR primeiro — herói que acerta de primeira dá história curta e sem graça.',
        ],
      },
      {
        id: 'final', titulo: 'O final é 100% seu', tipo: 'entrada', conversa: true,
        objetivo: 'O final é território exclusivo da criança: NUNCA sugerir finais, mesmo que ela peça — devolver a pergunta com carinho ("o que o SEU herói faria?"). Pode ajudar com perguntas sobre o que o herói sente.',
        texto: (ctx) => `Chegou a parte mais importante — e essa é uma regra sagrada aqui do clube: o FINAL é 100% seu. Nem eu, o ${ctx.assistente}, posso opinar!\n\nComo termina? O herói resolve? Aprende algo? Escreva o final do seu jeito.`,
        entrada: { rotulo: 'O final da minha história', dica: 'Como termina — só você decide', min: 30, max: 1200, multilinha: true },
        fallbacks: [
          'Essa é com você! Só uma pergunta para ajudar: o que o seu herói DESCOBRIU que não sabia no começo?',
        ],
      },
      {
        id: 'revisao', titulo: 'Olho de autor', tipo: 'entrada', conversa: true,
        objetivo: 'Ajudar a revisar: quando a criança colar trechos, apontar UMA melhoria concreta por vez (repetição de palavra, frase confusa, detalhe faltando) e elogiar UM acerto específico. Ela decide o que acatar.',
        texto: (ctx) => `Todo autor de verdade faz isso: relê e melhora UMA coisa.\n\nJunte começo + meio + final, releia em voz alta (pode pedir minha opinião no chat!) e cole aqui a versão final da sua história inteira.`,
        entrada: { rotulo: 'Minha história completa (versão final)', dica: 'Começo + meio + final, do seu jeito', min: 100, max: 4000, multilinha: true },
        fallbacks: [
          'Dica de autor: procure uma palavra que você repetiu muito e troque uma delas. Muda tudo!',
          'Leia em voz alta — onde a sua língua tropeçar, a frase quer ser mais curta.',
        ],
      },
      {
        id: 'fim', titulo: 'Sua história está viva!', tipo: 'concluir', conversa: false,
        objetivo: 'Fechamento festivo.',
        texto: (ctx) => `Que orgulho, ${ctx.apelido}! Você é oficialmente autor(a) de uma história que só você podia contar. 🏆\n\nDê um título e guarde no portfólio. Momento família: leia em voz alta hoje — histórias existem para ser ouvidas!`,
        fallbacks: [],
      },
    ],
    montarCriacao(respostas, crianca) {
      return {
        titulo_sugerido: `A história de ${crianca.apelido}`,
        conteudo: [
          `UMA HISTÓRIA QUE SÓ ${String(crianca.apelido).toUpperCase()} PODIA CONTAR`, '',
          String(respostas['revisao'] || [respostas['comeco'], respostas['encruzilhada'], respostas['final']].filter(Boolean).join('\n\n')).trim(),
          '', `— Herói, lugar e problema: ${String(respostas['escolha'] || '—').trim()}`,
        ].join('\n'),
      };
    },
  },

  // ===================================================================
  // Missão 3 — prompt visual sem depender de gerador de imagem: o produto
  // é o ROTEIRO de ilustração; o desenho sai no papel (IA de imagem é
  // gated por credencial e entra depois, sem mudar o roteiro).
  // ===================================================================
  'm03-estudio-ilustracao': {
    etapas: [
      {
        id: 'ingredientes', titulo: 'Os 4 ingredientes de uma cena', tipo: 'entrada', conversa: true,
        objetivo: 'Ensinar os 4 ingredientes da descrição de cena (QUEM aparece, ONDE está, CLIMA/luz/hora, ESTILO do desenho). Quando a criança descrever, apontar qual ingrediente ficou faltando — um por vez.',
        texto: (ctx) => `Bem-vindo(a) ao Estúdio, ${ctx.apelido}! Hoje você vira diretor(a) de arte da história que escreveu na missão passada (dá uma espiada nela no seu portfólio!).\n\nUma cena bem descrita tem 4 ingredientes:\n1. QUEM aparece\n2. ONDE está\n3. CLIMA — dia ou noite? sol ou chuva? alegre ou misterioso?\n4. ESTILO — desenho animado? aquarela? quadrinhos?\n\nDescreva a CAPA do seu livrinho usando os 4. Teste comigo no chat antes, se quiser!`,
        entrada: { rotulo: 'A capa do meu livrinho', dica: 'Quem + onde + clima + estilo', min: 30, max: 600, multilinha: true },
        fallbacks: [
          'Confere os 4 ingredientes: tem QUEM? tem ONDE? tem CLIMA? tem ESTILO? O que faltou?',
          'O CLIMA muda tudo: a mesma cena de dia é aventura, de noite vira mistério. Qual combina com a sua capa?',
        ],
      },
      {
        id: 'cenas', titulo: 'Três cenas da história', tipo: 'entrada', conversa: true,
        objetivo: 'Ajudar a escolher os TRÊS momentos mais visuais da história (começo, meio, fim) e descrevê-los com os 4 ingredientes. Perguntar "qual momento dá a imagem mais forte?" em vez de escolher por ela.',
        texto: (ctx) => `Agora escolha os 3 momentos da sua história que dariam as ilustrações mais incríveis — um do começo, um do meio, um do fim.\n\nDescreva cada um com os 4 ingredientes. Capriche no detalhe: quem for desenhar só vai ver o que você DISSER.`,
        entrada: { rotulo: 'Minhas 3 cenas', dica: 'Uma cena por parágrafo: começo, meio e fim', min: 60, max: 1500, multilinha: true },
        fallbacks: [
          'O momento mais visual costuma ser onde algo MUDA: a chegada, a descoberta, a virada. Qual é o da sua história?',
        ],
      },
      {
        id: 'teste-do-desenhista', titulo: 'O teste do desenhista', tipo: 'entrada', conversa: true,
        objetivo: 'Fazer o papel de "desenhista que só sabe o que leu": quando a criança colar uma descrição no chat, dizer o que você "veria" desenhado — SOMENTE com o que está escrito, sem completar lacunas. Se faltar detalhe, o desenho imaginado sai "errado" de propósito para ela perceber.',
        texto: (ctx) => `Teste final do Estúdio: eu viro o DESENHISTA que só desenha o que está escrito — nadinha a mais.\n\nCole uma das suas cenas no chat e eu conto o que eu desenharia. Se eu "desenhar errado"… é porque faltou detalhe na descrição! Melhore até eu enxergar igualzinho a você.\n\nDepois cole aqui a sua melhor descrição, a campeã.`,
        entrada: { rotulo: 'Minha descrição campeã', dica: 'A cena que passou no teste do desenhista', min: 30, max: 800, multilinha: true },
        fallbacks: [
          'Modo desenhista: eu só desenho o que está ESCRITO. Sua cena diz a cor? a hora do dia? o tamanho? Se não diz, eu invento errado!',
        ],
      },
      {
        id: 'maos-a-obra', titulo: 'Mãos à obra!', tipo: 'avancar', conversa: true,
        objetivo: 'Incentivar o desenho no papel sem cobrar perfeição: o roteiro é o mapa, o traço é da criança.',
        texto: (ctx) => `Seu roteiro de ilustração está pronto — agora é papel, lápis e capricho: desenhe a capa e as 3 cenas seguindo as SUAS descrições!\n\n(Em breve o Estúdio também vai gerar imagens por IA a partir das suas descrições — mas o talento de descrever cena, que é o que você treinou hoje, já é seu para sempre.)`,
        fallbacks: [
          'Não precisa ficar "perfeito" — precisa ficar SEU. O roteiro garante que a ideia está no lugar.',
        ],
      },
      {
        id: 'fim', titulo: 'Livrinho a caminho!', tipo: 'concluir', conversa: false,
        objetivo: 'Fechamento festivo.',
        texto: (ctx) => `O roteiro de ilustração vai para o portfólio, ${ctx.apelido} — e o seu livrinho ganha vida no papel! 🏆\n\nMomento família: montem o livrinho juntos (história + desenhos) e coloquem na estante de verdade.`,
        fallbacks: [],
      },
    ],
    montarCriacao(respostas, crianca) {
      return {
        titulo_sugerido: `Roteiro de ilustração do meu livrinho`,
        conteudo: [
          `ROTEIRO DE ILUSTRAÇÃO — por ${crianca.apelido}`, '',
          `CAPA:\n${String(respostas['ingredientes'] || '—').trim()}`, '',
          `AS 3 CENAS:\n${String(respostas['cenas'] || '—').trim()}`, '',
          `DESCRIÇÃO CAMPEÃ (passou no teste do desenhista):\n${String(respostas['teste-do-desenhista'] || '—').trim()}`,
        ].join('\n'),
      };
    },
  },

  // ===================================================================
  // Missão 4 — lógica e sistemas disfarçados de diversão.
  // ===================================================================
  'm04-inventor-de-jogos': {
    etapas: [
      {
        id: 'ideia', titulo: 'A grande ideia', tipo: 'entrada', conversa: true,
        objetivo: 'Ajudar a definir nome do jogo, objetivo e como se vence — com perguntas ("de quê o jogo é? quantos jogam? o que faz alguém ganhar?"). Não propor jogos prontos.',
        texto: (ctx) => `Inventor(a) ${ctx.apelido}, seu estúdio de jogos está aberto!\n\nTodo jogo começa respondendo três perguntas:\n• Qual é o NOME do jogo?\n• Qual é o OBJETIVO (o que os jogadores tentam fazer)?\n• Como alguém VENCE?\n\nPense (me chama no chat para trocar ideia!) e escreva as três respostas.`,
        entrada: { rotulo: 'Nome, objetivo e como se vence', dica: 'Ex.: "Corrida da Pizza — entregar 3 pizzas antes dos outros — vence quem entregar primeiro"', min: 20, max: 500, multilinha: true },
        fallbacks: [
          'Pensa num jogo que você AMA. O que faz ele ser bom? Agora rouba só a diversão, não as regras!',
          'Jogo bom cabe numa frase: "vence quem ___ primeiro". Completa essa frase para o seu!',
        ],
      },
      {
        id: 'regras', titulo: 'O livro de regras', tipo: 'entrada', conversa: true,
        objetivo: 'Ajudar a escrever regras completas e em ordem: preparação, o que se faz no turno, o que é proibido, como termina. Perguntar pelos pedaços que faltam, sem escrever as regras por ela.',
        texto: (ctx) => `Agora as REGRAS — o coração do jogo. Escreva como se fosse ensinar alguém que nunca viu:\n\n1. Como o jogo COMEÇA (o que cada um recebe? quem joga primeiro?)\n2. O que se faz na sua VEZ\n3. O que é PROIBIDO\n4. Como o jogo TERMINA\n\nUma regra por linha. Capricha que daqui a pouco elas vão ser testadas…`,
        entrada: { rotulo: 'As regras do meu jogo', dica: 'Preparação, turno, proibições e fim — uma por linha', min: 60, max: 2500, multilinha: true },
        fallbacks: [
          'Regra de ouro do inventor: se a regra precisa de "aí depende…", ela ainda não está pronta. Deixa cada uma bem clara!',
        ],
      },
      {
        id: 'jogador-chato', titulo: 'O jogador chato', tipo: 'entrada', conversa: true,
        objetivo: 'Fazer o papel do "jogador chato": ler as regras que a criança já escreveu (estão nas respostas anteriores) e fazer UMA pergunta-furo por vez ("e se der empate?", "e se acabarem as cartas?", "posso pular minha vez?"). Comemorar quando ela tapar um furo.',
        texto: (ctx) => `Chegou a hora do teste supremo: eu, ${ctx.assistente}, vou virar o JOGADOR CHATO — aquele que procura furo em tudo. 😈\n\n"E se der empate?" "E se acabarem as peças?" "Posso fazer duas vezes seguidas?"\n\nMe enfrenta no chat! Depois conserte as regras e cole a versão à prova de jogador chato.`,
        entrada: { rotulo: 'Minhas regras, versão à prova de furos', dica: 'As regras corrigidas depois do teste', min: 60, max: 2500, multilinha: true },
        fallbacks: [
          'Pergunta chata número 1: e se der EMPATE? Sua regra já responde isso?',
          'Pergunta chata número 2: e se um jogador não PUDER jogar na vez dele? O que acontece?',
        ],
      },
      {
        id: 'tabuleiro', titulo: 'Construa!', tipo: 'avancar', conversa: true,
        objetivo: 'Incentivar a construção física com material simples (papelão, tampinhas, dado emprestado).',
        texto: (ctx) => `Regras prontas — agora o jogo vira COISA! Desenhe o tabuleiro (ou as cartas) numa cartolina ou papelão. Tampinha vira peça, dado se empresta de outro jogo, criatividade vale mais que material.\n\nQuando estiver pronto, é só concluir e… convocar a família para a noite de jogo!`,
        fallbacks: [
          'Tabuleiro feio que funciona vence tabuleiro lindo que ninguém entende. Primeiro funciona, depois enfeita!',
        ],
      },
      {
        id: 'fim', titulo: 'Jogo lançado!', tipo: 'concluir', conversa: false,
        objetivo: 'Fechamento festivo.',
        texto: (ctx) => `Você INVENTOU um jogo, ${ctx.apelido} — regras, tabuleiro, tudo seu! 🏆\n\nAs regras vão para o portfólio. Momento família: noite de jogo com a SUA invenção — e você explicando as regras como inventor(a) oficial.`,
        fallbacks: [],
      },
    ],
    montarCriacao(respostas, crianca) {
      const nome = String(respostas['ideia'] || '').split(/[—\n-]/)[0].trim() || 'Meu jogo';
      return {
        titulo_sugerido: `Regras do ${nome}`,
        conteudo: [
          `${nome.toUpperCase()} — um jogo inventado por ${crianca.apelido}`, '',
          `A ideia: ${String(respostas['ideia'] || '—').trim()}`, '',
          `REGRAS OFICIAIS (versão à prova de jogador chato):\n${String(respostas['jogador-chato'] || respostas['regras'] || '—').trim()}`,
        ].join('\n'),
      };
    },
  },

  // ===================================================================
  // Missão 5 — comunicação. A voz da criança NUNCA sobe: o tutor trabalha
  // só o roteiro escrito; a gravação fica no celular da família.
  // ===================================================================
  'm05-mini-podcast': {
    etapas: [
      {
        id: 'tema', titulo: 'O assunto que você domina', tipo: 'entrada', conversa: true,
        objetivo: 'Ajudar a escolher um tema que a criança REALMENTE domina e ama, e definir para quem é o episódio. Perguntar "sobre o que você poderia falar por uma hora sem parar?".',
        texto: (ctx) => `Você está prestes a virar podcaster, ${ctx.apelido}! 🎙️\n\nO segredo de um bom episódio: falar do que você DOMINA. Aquele assunto que você sabe tudo — dinossauro, futebol, Minecraft, slime, o que for.\n\nEscreva: qual é o seu assunto, e para quem é o episódio (a família? os primos?).`,
        entrada: { rotulo: 'Meu assunto e meu público', dica: 'Ex.: "Curiosidades de tubarões, para a minha família"', min: 10, max: 300 },
        fallbacks: [
          'Sobre o que você consegue falar UMA HORA sem cansar? Esse é o seu assunto.',
        ],
      },
      {
        id: 'roteiro', titulo: 'O roteiro do episódio', tipo: 'entrada', conversa: true,
        objetivo: 'Ajudar a estruturar o roteiro: GANCHO de abertura (uma pergunta ou fato surpreendente), 3 partes no meio (com um exemplo cada) e despedida. Revisar clareza e sugerir onde falta exemplo. Lembrar: você não ouve a gravação — só trabalha o texto.',
        texto: (ctx) => `Todo episódio bom tem um mapa:\n\n1. GANCHO — a primeira frase que prende quem ouve (uma pergunta? um fato de cair o queixo?)\n2. MEIO — as 3 melhores coisas que você quer contar, com um exemplo cada\n3. DESPEDIDA — como você fecha e se despede\n\nEscreva seu roteiro! Me mostra no chat que eu ajudo a deixar mais claro (o roteiro — a sua voz é toda sua, eu nem escuto 😉).`,
        entrada: { rotulo: 'Roteiro do meu episódio', dica: 'Gancho + 3 partes com exemplos + despedida', min: 80, max: 2500, multilinha: true },
        fallbacks: [
          'Testa o seu gancho: ele faria ALGUÉM largar o celular para ouvir? Se não, começa com a coisa mais incrível que você sabe.',
          'Cada parte do meio merece um exemplo. "Tubarão é antigo" fica bom; "tubarão é mais velho que as ÁRVORES" fica inesquecível.',
        ],
      },
      {
        id: 'ensaio', titulo: 'Ensaio geral', tipo: 'avancar', conversa: true,
        objetivo: 'Orientar o ensaio: ler em voz alta 2x, marcar onde tropeça, encurtar frase comprida. Dicas só sobre o TEXTO (você não ouve áudio).',
        texto: (ctx) => `Ensaio geral! Leia o roteiro em voz alta DUAS vezes:\n• onde a língua tropeçar → frase mais curta;\n• onde faltar ar → ponto final;\n• fale como quem conta segredo para um amigo, não como quem lê.\n\nDica de ouro: sorria enquanto fala — dá para OUVIR o sorriso na gravação!`,
        fallbacks: [
          'Tropeçou na leitura? Ótimo — achou uma frase para encurtar. O tropeço é o revisor mais honesto que existe.',
        ],
      },
      {
        id: 'gravacao', titulo: 'Gravando!', tipo: 'avancar', conversa: true,
        objetivo: 'Orientar a gravação com o responsável, reforçando que o áudio fica na família.',
        texto: (ctx) => `Agora peça o celular ao seu responsável e grave o episódio (uns 3 minutos)!\n\nImportante do nosso combinado: a gravação fica NO CELULAR DA FAMÍLIA — ela não sobe para cá, é de vocês. Aqui no clube fica o roteiro, que é a sua criação de autor(a).\n\nErrou no meio? Respira e segue — os melhores podcasters deixam o "opa!" e continuam.`,
        fallbacks: [
          'Ficou nervoso(a)? Normal! Grava uma vez "de mentira" só para aquecer — a segunda sai muito melhor.',
        ],
      },
      {
        id: 'fim', titulo: 'No ar!', tipo: 'concluir', conversa: false,
        objetivo: 'Fechamento festivo.',
        texto: (ctx) => `Episódio gravado, podcaster ${ctx.apelido}! 🏆 O roteiro vai para o portfólio.\n\nMomento família: hoje no jantar, todo mundo ouve o episódio juntos — como um programa de verdade. Aplausos garantidos.`,
        fallbacks: [],
      },
    ],
    montarCriacao(respostas, crianca) {
      return {
        titulo_sugerido: `Roteiro do meu podcast`,
        conteudo: [
          `ROTEIRO DE PODCAST — por ${crianca.apelido}`, '',
          `Assunto e público: ${String(respostas['tema'] || '—').trim()}`, '',
          String(respostas['roteiro'] || '—').trim(), '',
          '(A gravação é da família e fica no celular de casa — combinado do clube.)',
        ].join('\n'),
      };
    },
  },

  // ===================================================================
  // Missão 6 — narrativa visual: o poder do que fica ENTRE os quadros.
  // ===================================================================
  'm06-minha-hq': {
    etapas: [
      {
        id: 'personagem', titulo: 'Ficha do personagem', tipo: 'entrada', conversa: true,
        objetivo: 'Ajudar a criar um personagem próprio com nome, jeito, um MEDO e um superpoder (que pode ser simples: fazer amigos, nunca desistir). Personagem com medo é o que torna a HQ interessante — puxar por isso.',
        texto: (ctx) => `Toda HQ começa com um personagem inesquecível — e o seu vai nascer AGORA, ${ctx.apelido}!\n\nPreencha a ficha secreta:\n• NOME do personagem\n• JEITO dele (engraçado? tímido? elétrico?)\n• o MEDO dele (essa é a parte mais importante!)\n• o SUPERPODER (pode ser simples: fazer qualquer um rir, nunca desistir…)\n\nPersonagem sem medo é chato — é o medo que deixa a história emocionante!`,
        entrada: { rotulo: 'Ficha do meu personagem', dica: 'Nome, jeito, medo e superpoder', min: 20, max: 500, multilinha: true },
        fallbacks: [
          'O truque dos quadrinistas: o MEDO e o SUPERPODER conversam. Medo de altura + poder de voar? História pronta!',
        ],
      },
      {
        id: 'momentos', titulo: 'A história em 4 a 6 quadros', tipo: 'entrada', conversa: true,
        objetivo: 'Ensinar a escolher só os MOMENTOS-CHAVE: em HQ, o que acontece ENTRE os quadros o leitor imagina. Ajudar a cortar momentos desnecessários perguntando "esse quadro pode ser imaginado pelo leitor?".',
        texto: (ctx) => `Agora o segredo número 1 dos quadrinhos: você NÃO desenha tudo — escolhe só os momentos-chave, e o leitor imagina o que aconteceu ENTRE os quadros. É tipo mágica!\n\nConte a história do seu personagem em 4 a 6 momentos (um por quadro, uma linha cada). Onde o medo dele aparece? Onde o superpoder entra?`,
        entrada: { rotulo: 'Meus 4 a 6 quadros', dica: 'Um momento por linha', min: 40, max: 1200, multilinha: true },
        fallbacks: [
          'Teste do corte: se o leitor consegue IMAGINAR o momento sozinho, ele não precisa de quadro. Corta e deixa a mágica acontecer!',
        ],
      },
      {
        id: 'baloes', titulo: 'Os balões', tipo: 'entrada', conversa: true,
        objetivo: 'Ajudar a escrever falas CURTAS (balão comprido mata quadrinho) e com a voz do personagem. Máximo ~10 palavras por balão; nem todo quadro precisa de fala.',
        texto: (ctx) => `Hora de dar voz! Escreva a fala de cada quadro — e olha a regra de ouro do balão: CURTO. Se não cabe num fôlego, não cabe no balão.\n\nDica profissa: nem todo quadro precisa de fala. Um quadro mudo, na hora certa, é dos momentos mais poderosos de uma HQ.`,
        entrada: { rotulo: 'As falas, quadro por quadro', dica: 'Quadro 1: "…" / Quadro 2: (mudo) …', min: 20, max: 1200, multilinha: true },
        fallbacks: [
          'Balão bom cabe num fôlego. Lê a fala em voz alta: sobrou ar? Aprovada!',
        ],
      },
      {
        id: 'desenho', titulo: 'Desenhe a tira!', tipo: 'avancar', conversa: true,
        objetivo: 'Incentivar o desenho no papel: dividir a folha nos quadros, personagem simples e igual em todos, balões primeiro (para reservar espaço).',
        texto: (ctx) => `Papel e lápis na mão! Divida a folha nos seus quadros e desenhe.\n\nTruques de quadrinista:\n• escreva os BALÕES primeiro (senão não sobra espaço — todo iniciante cai nessa!);\n• personagem simples que você consiga repetir igualzinho vale mais que desenho difícil;\n• capricho no quadro do MEDO — é o coração da história.`,
        fallbacks: [
          'Desenho simples + história boa = HQ incrível. Desenho incrível + história fraca = só um desenho. Aposta na história!',
        ],
      },
      {
        id: 'fim', titulo: 'HQ publicada!', tipo: 'concluir', conversa: false,
        objetivo: 'Fechamento festivo.',
        texto: (ctx) => `Sua primeira HQ, ${ctx.apelido}! 🏆 O roteiro completo (ficha + quadros + balões) vai para o portfólio.\n\nMomento família: cole a tira na geladeira — galeria oficial de arte da casa. Toda HQ merece público!`,
        fallbacks: [],
      },
    ],
    montarCriacao(respostas, crianca) {
      const nome = String(respostas['personagem'] || '').split(/[\n,;]/)[0].replace(/^nome:?\s*/i, '').trim() || 'meu personagem';
      return {
        titulo_sugerido: `A HQ de ${nome}`,
        conteudo: [
          `ROTEIRO DE HQ — por ${crianca.apelido}`, '',
          `FICHA DO PERSONAGEM:\n${String(respostas['personagem'] || '—').trim()}`, '',
          `OS QUADROS:\n${String(respostas['momentos'] || '—').trim()}`, '',
          `OS BALÕES:\n${String(respostas['baloes'] || '—').trim()}`,
        ].join('\n'),
      };
    },
  },

  // ===================================================================
  // Missão 7 — empreender de verdade: problema → produto → preço → defesa.
  // ===================================================================
  'm07-minha-empresa': {
    etapas: [
      {
        id: 'problema', titulo: 'Caçada ao problema', tipo: 'entrada', conversa: true,
        objetivo: 'Ajudar a achar um problema REAL da casa da criança (coisas que somem, tarefas chatas, brigas bobas do dia a dia). Empresa boa nasce de problema de verdade, não de invenção solta.',
        texto: (ctx) => `Segredo dos grandes inventores de empresa, ${ctx.apelido}: eles não começam pela invenção — começam pelo PROBLEMA.\n\nCace um problema de verdade aí na sua casa: o que vive sumindo? Que tarefa todo mundo odeia? O que sempre dá confusão?\n\n(Vale entrevistar a família: "qual a coisa mais chata do seu dia?")`,
        entrada: { rotulo: 'O problema que eu escolhi', dica: 'Ex.: "O controle remoto some toda santa noite"', min: 10, max: 300 },
        fallbacks: [
          'Problema bom é o que faz alguém bufar de raiva. O que faz alguém bufar aí na sua casa?',
        ],
      },
      {
        id: 'produto', titulo: 'A invenção', tipo: 'entrada', conversa: true,
        objetivo: 'Ajudar a desenhar a solução: o que é, como funciona, para quem, e um NOME de produto. Perguntar "como isso resolve o problema?" até a resposta ficar concreta.',
        texto: (ctx) => `Problema na mão? Agora a INVENÇÃO que resolve!\n\nDescreva o seu produto:\n• o que é e como funciona\n• para quem é\n• e o NOME dele (nome bom se fala fácil e lembra o que o produto faz)\n\nPode ser simples — as melhores invenções são.`,
        entrada: { rotulo: 'Meu produto', dica: 'Nome + o que é + como resolve o problema', min: 20, max: 600, multilinha: true },
        fallbacks: [
          'Teste do nome: fala em voz alta. Ficou fácil de falar E lembra o produto? Aprovado!',
        ],
      },
      {
        id: 'preco', titulo: 'Quanto custa (e por quê)', tipo: 'entrada', conversa: true,
        objetivo: 'Ensinar a conta simples do preço: MATERIAL + TRABALHO + um pouco de LUCRO. Ajudar a criança a estimar cada parte com números redondos; preço não é chute, é conta.',
        texto: (ctx) => `Agora a pergunta de milhões: QUANTO custa o seu produto?\n\nPreço não é chute — é uma continha de 3 partes:\n• MATERIAL: quanto custa fazer?\n• TRABALHO: seu tempo vale!\n• LUCRO: um pouquinho a mais, que é o que faz a empresa crescer.\n\nFaça a conta (me chama no chat para ajudar!) e escreva o preço com a explicação.`,
        entrada: { rotulo: 'Meu preço e a conta', dica: 'Ex.: "R$ 10 = 4 de material + 4 do meu trabalho + 2 de lucro"', min: 10, max: 400 },
        fallbacks: [
          'Começa pelo material: quanto custaria fazer UM? Agora soma o seu trabalho e um tiquinho de lucro. Esse é o preço honesto.',
        ],
      },
      {
        id: 'cliente-cetico', titulo: 'O cliente cético', tipo: 'entrada', conversa: true,
        objetivo: 'Fazer o papel do CLIENTE CÉTICO: educado mas duro, uma objeção por vez ("por que não compro um da loja?", "e se quebrar?", "tá caro"). Quando a criança responder bem, ceder um pouco e fazer a próxima objeção. Nunca ser grosseiro.',
        texto: (ctx) => `Prepare-se para o desafio final: eu, ${ctx.assistente}, virei o CLIENTE CÉTICO — aquele que quer comprar mas duvida de tudo. 🧐\n\n"Por que não compro um da loja?" "E se quebrar?" "Tá caro, hein…"\n\nMe convença no chat! Depois escreva aqui as suas 3 melhores respostas — elas são o seu escudo de vendedor(a).`,
        entrada: { rotulo: 'Minhas 3 melhores respostas ao cliente', dica: 'Uma por linha', min: 30, max: 800, multilinha: true },
        fallbacks: [
          'Pergunta de cliente cético: "por que o SEU e não um da loja?" — a resposta boa fala do que só o seu tem.',
          '"Tá caro…" — responde com a CONTA do preço: material + trabalho + lucro. Preço explicado convence.',
        ],
      },
      {
        id: 'pitch', titulo: 'O discurso de 1 minuto', tipo: 'entrada', conversa: true,
        objetivo: 'Ajudar a montar o pitch: problema → solução → preço → frase final memorável. Revisar para ficar falável em 1 minuto (±130 palavras).',
        texto: (ctx) => `Para fechar: o PITCH — o discurso de 1 minuto que apresenta sua empresa.\n\nA receita: comece pelo PROBLEMA ("sabe quando…?"), apresente a SOLUÇÃO, diga o PREÇO com a conta, e feche com uma frase de efeito.\n\nEscreva o seu! Depois capriche num cartaz (papel + canetão) para a apresentação.`,
        entrada: { rotulo: 'Meu pitch de 1 minuto', dica: 'Problema → solução → preço → frase de efeito', min: 60, max: 1200, multilinha: true },
        fallbacks: [
          'Começa pelo problema: "Sabe quando o controle some?" — quem já viveu o problema já quer a solução.',
        ],
      },
      {
        id: 'fim', titulo: 'Empresa aberta!', tipo: 'concluir', conversa: false,
        objetivo: 'Fechamento festivo.',
        texto: (ctx) => `Empreendedor(a) ${ctx.apelido}, sua primeira empresa está de pé! 🏆 O plano completo vai para o portfólio.\n\nMomento família: faça o pitch com o cartaz — e a família "compra" (ou não!) com dinheiro de brincadeira. Cliente da vida real é o teste final!`,
        fallbacks: [],
      },
    ],
    montarCriacao(respostas, crianca) {
      const nome = String(respostas['produto'] || '').split(/[\n,;+—-]/)[0].replace(/^nome:?\s*/i, '').trim() || 'Minha empresa';
      return {
        titulo_sugerido: `Plano da ${nome}`,
        conteudo: [
          `PLANO DE EMPRESA — por ${crianca.apelido}`, '',
          `O problema: ${String(respostas['problema'] || '—').trim()}`, '',
          `O produto:\n${String(respostas['produto'] || '—').trim()}`, '',
          `O preço (com a conta): ${String(respostas['preco'] || '—').trim()}`, '',
          `Escudo do vendedor (respostas ao cliente cético):\n${String(respostas['cliente-cetico'] || '—').trim()}`, '',
          `PITCH DE 1 MINUTO:\n${String(respostas['pitch'] || '—').trim()}`,
        ].join('\n'),
      };
    },
  },

  // ===================================================================
  // Missão 8 — fecha o arco aberto na missão 1: usar E desconfiar.
  // Os 5 casos são CURADOS e verificáveis; o gabarito é determinístico.
  // ===================================================================
  'm08-detetive-digital': {
    etapas: [
      {
        id: 'tres-testes', titulo: 'Os 3 testes do detetive', tipo: 'avancar', conversa: true,
        objetivo: 'Apresentar e exercitar os 3 testes (Quem disse? Onde mais aparece? Faz sentido?). Se a criança trouxer exemplos, aplicar os testes JUNTO com ela, sem dar veredito pronto.',
        texto: (ctx) => `Missão final, detetive ${ctx.apelido}! Você vai ganhar a ferramenta mais poderosa do clube: os 3 TESTES para saber se algo na internet é verdade.\n\n🔍 Teste 1 — QUEM disse? (uma pessoa que entende? um site sério? ou "um cara aí"?)\n🔍 Teste 2 — ONDE MAIS aparece? (só num lugar? ou vários lugares confiáveis contam igual?)\n🔍 Teste 3 — FAZ SENTIDO? (é surpreendente DEMAIS? promete fácil demais?)\n\nGuarde os três — os casos chegam já já.`,
        fallbacks: [
          'Detetive não decide no achismo: roda os 3 testes. Quem disse? Onde mais? Faz sentido?',
        ],
      },
      {
        id: 'casos', titulo: 'Os 5 casos', tipo: 'entrada', conversa: true,
        objetivo: 'A criança está julgando 5 casos com os 3 testes. Ajudar aplicando os testes com perguntas, SEM revelar os vereditos (o gabarito vem na próxima etapa). Incentivar a conferir com um adulto ou outra fonte.',
        texto: (ctx) => `Sua mesa de detetive tem 5 casos. Julgue cada um com os 3 testes: VERDADEIRO, FALSO — e atenção que pode ter coisa criada por IA no meio!\n\n📁 CASO 1: "Comer cenoura deixa a sua visão noturna perfeita, quase como enxergar no escuro."\n📁 CASO 2: "Abelhas fazem uma dança para avisar às outras onde tem flor."\n📁 CASO 3: um vídeo mostra um golfinho gigante voando por cima de um prédio. "É real", diz a legenda.\n📁 CASO 4: "Cientistas confirmam: beber água gelada emagrece muito, sem esforço."\n📁 CASO 5: "O Brasil tem mais de 200 milhões de habitantes."\n\nEscreva seu veredito para cada caso (e POR QUÊ). Pode investigar com um adulto — detetive bom trabalha em equipe!`,
        entrada: { rotulo: 'Meus 5 vereditos', dica: 'Caso 1: … / Caso 2: … (com o porquê!)', min: 50, max: 1500, multilinha: true },
        fallbacks: [
          'Roda o teste 3 no caso 4: promete resultado incrível SEM esforço… isso costuma ser sinal de quê? 🤔',
          'No caso 3, pergunta de detetive: golfinho VOANDO faz sentido no mundo real? E quem postou o vídeo?',
        ],
      },
      {
        id: 'gabarito', titulo: 'O gabarito do detetive', tipo: 'avancar', conversa: true,
        objetivo: 'Comemorar os acertos que a criança relatar e revisar os erros com leveza, sempre amarrando ao teste que resolveria o caso.',
        texto: (ctx) => `Abram os envelopes! 🕵️\n\n✅ CASO 1: FALSO — cenoura faz bem para os olhos, mas o "enxergar no escuro" é um exagero famoso, inventado como propaganda na Segunda Guerra!\n✅ CASO 2: VERDADEIRO — a "dança das abelhas" existe e é estudada pelos cientistas.\n✅ CASO 3: CRIADO — golfinho gigante voando não passa no teste do "faz sentido"; vídeos assim costumam ser feitos por IA ou montagem.\n✅ CASO 4: FALSO — promessa de emagrecer "muito, sem esforço" é o clássico bom-demais-para-ser-verdade.\n✅ CASO 5: VERDADEIRO — dá para conferir no site do IBGE, que conta a população do Brasil.\n\n${ctx.respostas['casos'] ? `Seus vereditos foram:\n"${ctx.respostas['casos']}"\n\n` : ''}Quantos você acertou? O que importa não é acertar todos — é ter RODADO os testes!`,
        fallbacks: [
          'Errar caso treinando é lucro: agora você sabe qual teste rodar na próxima!',
        ],
      },
      {
        id: 'confissao', titulo: 'A confissão do assistente', tipo: 'entrada', conversa: true,
        objetivo: 'Momento de fechamento do arco: relembrar que na missão 1 o próprio assistente contou um mito (a Muralha) de propósito. Perguntar à criança quando ela NÃO deve confiar no assistente, e conversar honestamente sobre limites da IA (erra, inventa, repete mitos). Não dramatizar: IA é ferramenta poderosa que merece conferência.',
        texto: (ctx) => `Agora… uma confissão. 😳\n\nLembra da primeira missão, quando eu, ${ctx.assistente}, te contei que a Muralha da China dava para ver do espaço — e era MITO? Pois é: eu erro. Assistentes de IA erram, inventam coisa sem perceber e repetem mitos famosos.\n\nPor isso a pergunta final do clube, a mais importante de todas:\n\n**Quando você NÃO deve confiar em mim?**\n\nPense de verdade e escreva sua resposta. (Pode conversar comigo antes — prometo honestidade total.)`,
        entrada: { rotulo: 'Quando NÃO confiar no assistente', dica: 'Sua resposta sincera', min: 20, max: 600, multilinha: true },
        fallbacks: [
          'Vou te ajudar sendo honesto: eu erro mais quando o assunto é recente, muito específico, ou quando "todo mundo repete" algo. O que isso te diz?',
        ],
      },
      {
        id: 'guia', titulo: 'O Guia da família', tipo: 'entrada', conversa: true,
        objetivo: 'Ajudar a compilar o Guia do Detetive da família: os 3 testes com as palavras da criança + as regras da casa que ela quiser criar. O guia é DELA para a família — não ditar o texto.',
        texto: (ctx) => `Última criação do clube — e ela é para a sua família inteira: o GUIA DO DETETIVE DIGITAL da casa!\n\nEscreva com as suas palavras:\n• os 3 testes (do seu jeito de explicar)\n• e as regras da casa que você quiser criar ("antes de compartilhar, rodar os testes", "notícia boa demais, desconfiar"…)\n\nEsse guia vai proteger todo mundo aí — até os adultos, que também caem em fake news!`,
        entrada: { rotulo: 'O Guia do Detetive da minha família', dica: 'Os 3 testes + as regras da casa, do seu jeito', min: 60, max: 2000, multilinha: true },
        fallbacks: [
          'Escreve como você explicaria para o adulto MAIS apressado da casa — curto, claro e direto.',
        ],
      },
      {
        id: 'fim', titulo: 'Detetive formado!', tipo: 'concluir', conversa: false,
        objetivo: 'Fechamento do arco das 8 missões.',
        texto: (ctx) => `${ctx.apelido}… você completou as 8 missões do clube. 🎓🏆\n\nVocê começou aprendendo a USAR a inteligência artificial — e termina sabendo quando DESCONFIAR dela. Esse par de superpoderes vai com você para sempre.\n\nMomento família: apresente o Guia e combinem juntos as regras da casa. Missão cumprida, detetive!`,
        fallbacks: [],
      },
    ],
    montarCriacao(respostas, crianca) {
      return {
        titulo_sugerido: `Guia do Detetive Digital da família`,
        conteudo: [
          `GUIA DO DETETIVE DIGITAL — por ${crianca.apelido}, para a família inteira`, '',
          String(respostas['guia'] || '—').trim(), '',
          `Quando NÃO confiar no assistente (resposta de ${crianca.apelido}):\n${String(respostas['confissao'] || '—').trim()}`, '',
          `Treino do detetive — meus vereditos nos 5 casos:\n${String(respostas['casos'] || '—').trim()}`,
        ].join('\n'),
      };
    },
  },
};

const temRoteiro = (missionId) => !!ROTEIROS[String(missionId || '')];
const roteiroDe = (missionId) => ROTEIROS[String(missionId || '')] || null;

module.exports = { ROTEIROS, temRoteiro, roteiroDe };
