// =====================================================================
// Invente Arena — MOLDES da Arena de Português (fase C, lote 1).
// Lote 1 aprovado no C0: fios 1 (fluência), 2 (localizar), 3 (inferir),
// 7 (ortografia), 8 (acentuação), 9 (pontuação) e 11 (vocabulário),
// anos 2º–5º — a prioridade nacional (alfabetização e leitura).
// Todo conteúdo linguístico vem de BANCOS CURADOS fechados (palavras,
// frases e mini-textos revisados) — a variação só sorteia dentro deles.
// =====================================================================
'use strict';

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const de = (r, lista) => lista[Math.floor(r() * lista.length)];
function embaralhar(r, lista) {
  const l = [...lista];
  for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
  return l;
}
// escolha: [certa, ...erradas] → opções embaralhadas
const escolha = (r, certa, erradas) => embaralhar(r, [certa, ...erradas]);

// ---------------------------------------------------------------------
// BANCOS CURADOS (a revisão humana mora aqui)
// ---------------------------------------------------------------------

// Mini-textos por ano: [texto, pergunta literal, certa, [erradas], inferência?, certaInf, [erradasInf]]
const TEXTOS = {
  2: [
    ['O dragão Faísca abriu uma padaria na vila. Todo dia ele assa pão de queijo com seu fogo quentinho. Os fregueses chegam cedo e saem sorrindo.',
      'O que o dragão Faísca abriu?', 'uma padaria', ['uma escola', 'um circo', 'uma loja de brinquedos'],
      'Por que os fregueses saem sorrindo?', 'porque gostam do pão de queijo', ['porque está chovendo', 'porque a padaria fechou', 'porque perderam o troco']],
    ['A tartaruga Vilma adora ler. Ela leva um livro para todo lugar: para o lago, para a escola e até para a cama. Seu livro favorito fala de piratas.',
      'Sobre o que fala o livro favorito de Vilma?', 'piratas', ['dinossauros', 'princesas', 'foguetes'],
      'O que dá para descobrir sobre Vilma?', 'que ela gosta muito de histórias', ['que ela não sabe nadar', 'que ela odeia a escola', 'que ela dorme cedo']],
    ['Hoje é dia de feira na rua do Léo. Ele foi com a avó comprar frutas. Levaram maçãs, bananas e um abacaxi enorme que mal coube na sacola.',
      'Com quem Léo foi à feira?', 'com a avó', ['com o pai', 'sozinho', 'com o cachorro'],
      'Como sabemos que o abacaxi era grande?', 'ele mal coube na sacola', ['ele era amarelo', 'ele estava doce', 'ele custou caro']],
  ],
  3: [
    ['O robô Zig trabalha na biblioteca da escola. Ele organiza as prateleiras, cola etiquetas coloridas nos livros e ajuda as crianças a encontrar histórias. Quando a biblioteca fecha, Zig aproveita para ler sozinho no escuro — seus olhos têm lanternas.',
      'Onde o robô Zig trabalha?', 'na biblioteca da escola', ['na cozinha da escola', 'no parque', 'numa loja de robôs'],
      'Por que Zig consegue ler no escuro?', 'porque seus olhos têm lanternas', ['porque ele decorou os livros', 'porque a biblioteca é iluminada', 'porque ele não lê de verdade']],
    ['Marina plantou um girassol no quintal. Regou a planta todos os dias e anotou num caderno o quanto ela crescia. Em duas semanas, o girassol já estava mais alto que o muro. A vizinhança inteira parava para admirar.',
      'O que Marina anotava no caderno?', 'o quanto a planta crescia', ['o nome dos vizinhos', 'a previsão do tempo', 'suas notas da escola'],
      'O que mostra que o girassol chamava atenção?', 'a vizinhança parava para admirar', ['ele era amarelo', 'Marina o regava', 'ele estava no quintal']],
  ],
  4: [
    ['O farol da ilha ficou cem anos apagado. Ninguém lembrava mais da última vez que sua luz varreu o mar. Até que a jovem Aurora encontrou, no sótão da avó, um caderno com instruções antigas. Na primeira noite de tempestade, uma luz forte voltou a girar sobre as ondas — e os pescadores souberam o caminho de casa.',
      'O que Aurora encontrou no sótão?', 'um caderno com instruções antigas', ['um mapa do tesouro', 'uma lanterna nova', 'uma carta da avó'],
      'Quem fez o farol voltar a funcionar?', 'Aurora', ['a avó', 'os pescadores', 'ninguém — foi sozinho']],
    ['A escola organizou uma gincana de reciclagem. Cada turma recebeu um contêiner colorido e uma missão: juntar o máximo de material em um mês. A turma do 4º ano teve uma ideia diferente — visitou as casas do bairro explicando o projeto. No fim, venceu com o triplo dos pontos da segunda colocada.',
      'Quanto tempo durou a gincana?', 'um mês', ['uma semana', 'um dia', 'um ano'],
      'Por que a turma do 4º ano venceu com folga?', 'porque envolveu o bairro no projeto', ['porque tinha mais alunos', 'porque começou antes', 'porque o contêiner era maior']],
  ],
  5: [
    ['Quando o bisavô de Tomás chegou ao Brasil, trouxe apenas uma mala e um violino. Trabalhou de dia e tocou em praças à noite, juntando moeda por moeda. Décadas depois, a família ainda guarda o violino — não pelo valor que teria numa loja, mas pelo que ele conta sem dizer palavra.',
      'O que o bisavô trouxe ao chegar?', 'uma mala e um violino', ['uma mala e um mapa', 'só roupas', 'um piano'],
      'Por que a família guarda o violino?', 'pelo valor da história que ele representa', ['porque vale muito dinheiro', 'porque ninguém quer jogar fora', 'para vendê-lo um dia']],
    ['O vento levou a pipa de Rafa para o telhado da escola no sábado. Domingo, ele voltou com o irmão, uma escada emprestada e um plano detalhado. O porteiro, vendo os dois, apenas sorriu e apontou: a pipa tinha descido sozinha durante a noite e o esperava no pátio, presa na roseira.',
      'Para onde o vento levou a pipa?', 'para o telhado da escola', ['para a casa do vizinho', 'para uma árvore', 'para o rio'],
      'O plano de Rafa foi necessário?', 'não — a pipa já tinha descido sozinha', ['sim, ele subiu a escada', 'sim, o porteiro mandou', 'não se sabe']],
  ],
};

// Ortografia: pares/tarefas por célula (palavra certa primeiro)
const ORTO = {
  'EF02LP03.2': [['faca', 'vaca (animal)'], ['dado', 'tato'], ['pato', 'bato'], ['ferro', 'verro'], ['time', 'dime'], ['bola', 'pola']],
  'EF03LP01.3': [['carro', 'caro (não barato)'], ['cachorro', 'cachoro'], ['casa', 'caza'], ['girafa', 'jirafa'], ['guitarra', 'gitarra'], ['queijo', 'keijo'], ['pássaro', 'pásaro']],
  'EF04LP01.4': [['campo', 'canpo'], ['tampa', 'tanpa'], ['tempo', 'tenpo'], ['bombeiro', 'bonbeiro'], ['sempre', 'senpre'], ['limpo', 'linpo']],
  'EF04LP02.4': [['caixa', 'caxa'], ['peixe', 'pexe'], ['vassoura', 'vassora'], ['cenoura', 'cenora'], ['beijo', 'bejo'], ['loura', 'lora']],
  'EF04LP08.4': [['viagem', 'viajem (a viagem)'], ['gostoso', 'gostozo'], ['beleza', 'belesa'], ['garagem', 'garajem'], ['famoso', 'famozo'], ['tristeza', 'tristesa']],
  'EF35LP13.4': [['hoje', 'oje'], ['hora', 'ora (a hora)'], ['gente', 'jente'], ['medalha', 'medalia'], ['exercício', 'ezercício'], ['auxílio', 'ausílio']],
  'EF05LP01.5': [['exceção', 'esseção'], ['sucesso', 'suceço'], ['através', 'atravez'], ['paralisar', 'paralizar'], ['quiseram', 'quizeram'], ['pesquisa', 'pesquiza']],
};

// Acentuação
const TONICAS = [['jacaré', 'ré', ['ja', 'ca']], ['médico', 'mé', ['di', 'co']], ['sofá', 'fá', ['so']], ['banana', 'na (do meio)', ['ba', 'na (final)']], ['fósforo', 'fós', ['fo', 'ro']], ['cidade', 'da', ['ci', 'de']]];
const CONTAR_SILABAS = [['sol', 1], ['bola', 2], ['janela', 3], ['borboleta', 4], ['chocolate', 4], ['pé', 1], ['montanha', 3]];
const OXITONAS = [['café', 'cafe'], ['você', 'voce'], ['sofá', 'sofa'], ['jacaré', 'jacare'], ['guaraná', 'guarana']];
const PAROXITONAS = [['fácil', 'facil'], ['açúcar', 'açucar'], ['órgão', 'orgão'], ['táxi', 'taxi'], ['caráter', 'carater']];
const PROPAROXITONAS = [['lâmpada', 'lampada'], ['música', 'musica'], ['médico', 'medico'], ['árvore', 'arvore'], ['sílaba', 'silaba'], ['pássaro', 'passaro']];

// Pontuação
const FIM_DE_FRASE = [['Que horas são', '?'], ['Cuidado com o degrau', '!'], ['O jogo começa às três', '.'], ['Você viu meu caderno', '?'], ['Que golaço', '!'], ['Amanhã tem aula de artes', '.']];
const VIRGULA_LISTA = [['Comprei banana, maçã e uva.', 'Comprei banana maçã e uva.'], ['Levei lápis, borracha e régua.', 'Levei lápis borracha e régua.'], ['Chamei Ana, Bento e Caio.', 'Chamei Ana Bento e Caio.']];
const DIALOGO = [['— Vamos ao parque? — perguntou Lia.', 'Vamos ao parque perguntou Lia.'], ['A mãe avisou: — O lanche está pronto!', 'A mãe avisou o lanche está pronto']];
const PONTUACAO_EFEITO = [['As reticências em "Eu tenho um segredo…" mostram', 'suspense, algo ficou por dizer', ['raiva', 'que a frase acabou normal', 'uma pergunta']], ['As aspas em "O \'campeão\' chegou por último" mostram', 'ironia', ['alegria', 'uma lista', 'um diálogo']]];

// Vocabulário
const SINONIMOS = [['contente', 'feliz', ['triste', 'cansado', 'bravo']], ['veloz', 'rápido', ['lento', 'alto', 'forte']], ['bonito', 'belo', ['feio', 'grande', 'novo']], ['assustado', 'amedrontado', ['corajoso', 'calmo', 'sonolento']]];
const ANTONIMOS_IN = [['possível', 'impossível'], ['feliz', 'infeliz'], ['justo', 'injusto'], ['paciente', 'impaciente']];
const AUMENTATIVOS = [['casa', 'casarão', 'casinha'], ['cachorro', 'cachorrão', 'cachorrinho'], ['livro', 'livrão', 'livrinho']];
const POLISSEMIA = [['banco', 'Sentei no BANCO da praça. / Fui ao BANCO sacar dinheiro.', 'assento OU lugar de guardar dinheiro', ['só assento', 'só lugar de dinheiro', 'um tipo de mesa']], ['manga', 'Comi uma MANGA madura. / A MANGA da camisa rasgou.', 'fruta OU parte da roupa', ['só fruta', 'só parte da roupa', 'um tipo de suco']], ['pé', 'Machuquei o PÉ jogando bola. / O PÉ de alface cresceu.', 'parte do corpo OU planta', ['só parte do corpo', 'só planta', 'um tipo de sapato']]];
const DERIVADAS = [['pedra', 'pedreiro', 'derivada'], ['ferro', 'ferreiro', 'derivada'], ['flor', 'floricultura', 'derivada'], ['guarda-chuva', '', 'composta'], ['beija-flor', '', 'composta'], ['couve-flor', '', 'composta']];

// Sílabas (fio 1)
const SEPARAR = [['bola', 'bo-la', ['bol-a', 'b-ola']], ['janela', 'ja-ne-la', ['jan-e-la', 'ja-nel-a']], ['escola', 'es-co-la', ['e-sco-la', 'esc-o-la']], ['prato', 'pra-to', ['pr-ato', 'p-rato']], ['flauta', 'flau-ta', ['fla-u-ta', 'f-lauta']]];
const COMPLETAR_SILABA = [['ca__lo (animal que galopa)', 'va', ['fa', 'pa'], 'cavalo'], ['bor__leta', 'bo', ['pa', 'ba'], 'borboleta'], ['ja__la (fica na parede da casa)', 'ne', ['me', 'be'], 'janela']];
const NASAIS = [['maçã', 'maça (sem til)'], ['irmã', 'irma (sem til)'], ['campo', 'cãpo'], ['ponte', 'põte'], ['manhã', 'manha (sem til)']];
const PALAVRA_REAL = [['girassol', ['girasol', 'jirassol']], ['espaguete', ['espagete', 'ispaguete']], ['bicicleta', ['bicicreta', 'bissicleta']], ['problema', ['pobrema', 'poblema']]];
const DIGRAFOS = [['coelho', 'coelio'], ['aranha', 'arania'], ['chave', 'xave (com CH)'], ['milho', 'milio'], ['ninho', 'nino'], ['chuva', 'xuva (com CH)']];
const TITULOS = [['A receita secreta do bolo da vovó', 'uma receita de família', ['um jogo de futebol', 'uma viagem espacial', 'um animal marinho']], ['Como os golfinhos conversam entre si', 'a comunicação dos golfinhos', ['uma festa de aniversário', 'um castelo antigo', 'uma corrida de carros']], ['O dia em que a chuva ficou colorida', 'uma história de fantasia', ['uma notícia de esportes', 'uma receita', 'uma bula de remédio']]];
const CONTEXTO_PALAVRA = [['O explorador ficou EXAUSTO depois de subir a montanha e dormiu na hora.', 'exausto', 'muito cansado', ['muito feliz', 'com fome', 'perdido']], ['A sala ficou em ALVOROÇO quando anunciaram o passeio: todos falavam ao mesmo tempo.', 'alvoroço', 'agitação', ['silêncio', 'tristeza', 'escuridão']], ['O cofre era INVIOLÁVEL: ninguém jamais conseguiu abri-lo.', 'inviolável', 'impossível de abrir', ['fácil de abrir', 'muito antigo', 'transparente']]];

// ---------------------------------------------------------------------
// BANCOS DO LOTE 2 (fios 4-6, 10, 12 + anos 6º–8º)
// ---------------------------------------------------------------------

// fio 2 · localizar (6º–8º)
const NOTICIAS_6 = [
  ['Um incêndio atingiu o galpão de uma fábrica de móveis na madrugada de ontem. Ninguém se feriu, mas o prejuízo passa de um milhão de reais. Os bombeiros levaram três horas para controlar o fogo.', 'Qual é o FATO CENTRAL da notícia?', 'um incêndio atingiu uma fábrica de móveis', ['os bombeiros trabalharam três horas', 'móveis custam caro', 'ninguém gosta de incêndio']],
  ['A prefeitura inaugurou neste domingo a nova ciclovia da orla, com oito quilômetros de extensão. Centenas de ciclistas participaram do passeio de estreia, que terminou com um café da manhã coletivo.', 'Qual é o FATO CENTRAL da notícia?', 'a inauguração da nova ciclovia da orla', ['um café da manhã coletivo', 'a compra de bicicletas', 'o tamanho da orla']],
];
const GRIFAR = [
  ['A água doce é um recurso limitado. Rios e lagos representam menos de 1% de toda a água do planeta. Por isso, economizar água em casa não é frescura: é uma atitude que protege um bem raro.', 'Se você pudesse GRIFAR uma frase que carrega o essencial, qual seria?', 'Rios e lagos representam menos de 1% de toda a água do planeta.', ['Economizar não é frescura.', 'A água vem de rios e lagos.', 'Todo mundo tem água em casa.']],
  ['O sono é o momento em que o cérebro organiza o que aprendeu no dia. Crianças que dormem pouco têm mais dificuldade de concentração na escola. Dormir bem, portanto, é parte do estudo.', 'Qual frase resume o ESSENCIAL do texto?', 'Dormir bem é parte do estudo.', ['Criança gosta de dormir.', 'O cérebro nunca descansa.', 'A escola exige concentração.']],
];
const SELECIONAR_INFO = [
  ['Você vai fazer um trabalho sobre a ALIMENTAÇÃO dos tubarões. Qual trecho da enciclopédia interessa?', 'A maioria dos tubarões se alimenta de peixes, focas e lulas, caçando principalmente à noite.', ['Os tubarões existem há mais de 400 milhões de anos.', 'O tubarão-baleia pode medir 12 metros.', 'Filmes famosos aumentaram o medo de tubarões.']],
  ['Sua pesquisa é sobre COMO as abelhas produzem mel. Qual trecho serve?', 'As abelhas coletam o néctar das flores e o transformam em mel dentro da colmeia, batendo as asas para secá-lo.', ['O mel é usado desde o antigo Egito.', 'As abelhas-rainhas vivem vários anos.', 'Existem abelhas que não fazem mel.']],
];

// fio 3 · inferir (6º–8º)
const IRONIA_HUMOR = [
  ['Depois de tomar chuva a caminho da prova, Caio olhou para o céu e disse: "Que dia PERFEITO!"', 'Por que a fala de Caio é IRÔNICA?', 'ele diz o contrário do que pensa: o dia foi péssimo', ['ele realmente ama chuva', 'ele acertou a previsão do tempo', 'ele estava elogiando o céu']],
  ['A mãe abriu o quarto bagunçado e comentou: "Adorei a decoração nova."', 'O que a mãe quis dizer de verdade?', 'que o quarto está uma bagunça', ['que gostou dos móveis novos', 'que quer redecorar a casa', 'que o quarto está bonito']],
];
const TESES = [
  ['O recreio deveria ser mais longo. Estudos mostram que pausas melhoram a concentração, e alunos descansados aprendem mais rápido. Além disso, o recreio é o principal momento de convivência da escola.', 'Qual é a TESE (a opinião central) do texto?', 'o recreio deveria ser mais longo', ['pausas existem em toda escola', 'alunos gostam de conversar', 'estudos são importantes']],
  ['Animais não deveriam ser vendidos em lojas. Abrigos estão cheios de cães e gatos esperando um lar, e a adoção salva duas vidas: a do animal adotado e a do que ocupa a vaga aberta.', 'Qual é a TESE do texto?', 'animais não deveriam ser vendidos em lojas', ['abrigos estão sempre cheios', 'cães e gatos são bons animais', 'lojas vendem muitos animais']],
];
const TESE_IMPLICITA = [
  ['"Enquanto o estádio novo custou 300 milhões, a escola do bairro segue com goteiras nas salas."', 'Sem dizer com todas as letras, o autor DEFENDE que…', 'o dinheiro público foi mal priorizado', ['estádios não deveriam existir', 'goteiras são fáceis de consertar', 'o estádio custou barato']],
  ['"Curioso: quando o assunto é videogame, a memória do meu irmão funciona perfeitamente."', 'O que o autor deixa IMPLÍCITO?', 'o irmão finge esquecer o que não lhe interessa', ['o irmão tem memória ruim de verdade', 'videogame melhora a memória', 'o autor não tem irmão']],
];

// fio 4 · leitura crítica
const ANUNCIOS = [
  ['Anúncio: "TODO MUNDO já tem o tênis TurboMax. Só falta VOCÊ!"', 'Qual truque de convencimento o anúncio usa?', 'fazer parecer que todos têm, para você não ficar de fora', ['dar informações técnicas do tênis', 'mostrar o preço baixo', 'explicar como o tênis é feito']],
  ['Anúncio: "Compre HOJE! Últimas unidades! Amanhã pode ser tarde demais!"', 'Qual é o truque?', 'criar pressa para você não pensar antes de comprar', ['informar o estoque com precisão', 'dar um desconto real', 'elogiar a qualidade do produto']],
  ['Anúncio: "O suco preferido dos campeões olímpicos!"', 'Qual é o truque?', 'ligar o produto a pessoas admiradas', ['provar que o suco é saudável', 'mostrar a receita do suco', 'comparar preços com o concorrente']],
];
const FATO_OPINIAO = [
  ['O Brasil tem mais de 8 mil quilômetros de litoral.', 'fato'],
  ['As praias do Brasil são as mais bonitas do mundo.', 'opinião'],
  ['A água ferve a 100 °C ao nível do mar.', 'fato'],
  ['Sorvete de chocolate é melhor que o de morango.', 'opinião'],
  ['A baleia-azul é o maior animal do planeta.', 'fato'],
  ['Matemática é a matéria mais difícil da escola.', 'opinião'],
];
const FATO_OPINIAO_7 = [
  ['O filme arrecadou 500 milhões em duas semanas.', 'fato'],
  ['O filme é sem dúvida o melhor do ano.', 'opinião'],
  ['A pesquisa ouviu 2 mil estudantes de 14 cidades.', 'fato'],
  ['Esse resultado mostra que os jovens leem pouco demais.', 'opinião'],
  ['O time venceu por 3 a 1 fora de casa.', 'fato'],
  ['Foi a vitória mais emocionante da década.', 'opinião'],
];
const MIDIAS = [
  ['O MESMO jogo terminou 1 a 0. Jornal A: "Time joga mal e vence sem brilho". Jornal B: "Time mostra eficiência e garante vitória".', 'O que muda entre os dois jornais?', 'o jeito de contar: cada um escolhe um tom para o mesmo fato', ['o resultado do jogo', 'a data da partida', 'o time que venceu']],
  ['A MESMA chuva. Site A: "Chuva alaga ruas e causa transtorno". Site B: "Chuva alivia seca e enche reservatórios".', 'Por que as manchetes são tão diferentes?', 'cada site escolheu um lado do mesmo fato para destacar', ['choveu em cidades diferentes', 'um dos sites mentiu sobre a chuva', 'a chuva parou entre uma e outra']],
];
const RELATO_NEUTRO = [
  ['Qual manchete mostra OPINIÃO escondida no meio da notícia?', '"Prefeitura gasta fortuna em obra desnecessária"', ['"Prefeitura inicia obra na avenida central"', '"Obra na avenida começa na segunda-feira"', '"Avenida central recebe obra de drenagem"']],
  ['Qual manchete tenta parecer neutra mas JULGA?', '"Aluno atrapalha aula com pergunta polêmica"', ['"Aluno faz pergunta durante a aula"', '"Professor responde pergunta de aluno"', '"Aula tem debate entre alunos"']],
];
const MEME_CRITICO = [
  ['Você recebe um post chocante sem fonte, pedindo "compartilhe antes que apaguem!". O que fazer ANTES de repassar?', 'checar se o fato aparece em fontes confiáveis', ['compartilhar rápido, como pede o post', 'repassar só para os amigos próximos', 'copiar o texto e postar como seu']],
  ['Um meme usa a foto de uma pessoa real para zombar dela. Qual é o problema?', 'espalha constrangimento sobre alguém de verdade', ['memes nunca podem ter fotos', 'a foto está fora de foco', 'faltou colocar mais texto']],
];
const PERSUASAO_ARG = [
  ['"Segundo a pesquisa da universidade, 70% dos alunos melhoram com aulas de música." O argumento se apoia em…', 'dados e fonte de autoridade', ['apelo à emoção', 'ameaça', 'humor']],
  ['"Imagine seu filho preso num corredor lotado durante um incêndio." O argumento se apoia em…', 'apelo à emoção', ['estatísticas oficiais', 'citação de especialista', 'definição de dicionário']],
];

// fio 5 · narrativas
const CONFLITOS = [
  ['A formiga Rita guardou comida o verão inteiro. Quando o inverno chegou, a despensa desabou e enterrou tudo. Rita então bateu na porta das vizinhas — e cada uma dividiu um pouco do que tinha.', 'Qual era o PROBLEMA da história?', 'a despensa desabou e enterrou a comida', ['Rita não gostava do verão', 'as vizinhas eram más', 'o inverno atrasou']],
  ['O papagaio Bino sabia mil palavras, mas travava na frente dos outros. No festival de calouros, o amigo tatu subiu no palco junto. De pertinho, Bino soltou a voz — e ganhou o troféu.', 'Como o problema foi RESOLVIDO?', 'o amigo subiu ao palco e deu segurança a Bino', ['Bino desistiu do festival', 'o tatu cantou no lugar dele', 'o troféu foi cancelado']],
];
const ELEMENTOS_NARRATIVA = [
  ['"Numa vila à beira-mar, a pescadora Dora encontrou uma garrafa com um bilhete misterioso", diz o começo do conto.', 'Qual é o CENÁRIO da história?', 'uma vila à beira-mar', ['uma floresta escura', 'a casa de Dora', 'um navio pirata']],
  ['"Numa vila à beira-mar, a pescadora Dora encontrou uma garrafa com um bilhete misterioso", diz o começo do conto.', 'Quem é a PERSONAGEM principal?', 'a pescadora Dora', ['o bilhete', 'a garrafa', 'o mar']],
];
const ENREDO = [
  ['Na história, PRIMEIRO o balão do festival escapou; DEPOIS as crianças correram atrás dele pelo campo; POR FIM o vento o devolveu na praça, onde todos comemoraram.', 'O que aconteceu POR ÚLTIMO?', 'o vento devolveu o balão na praça', ['o balão escapou', 'as crianças correram pelo campo', 'o festival foi cancelado']],
  ['No conto, a chave sumiu de manhã; a família procurou o dia todo; à noite, o gato apareceu brincando com ela debaixo do sofá.', 'Qual foi o DESFECHO?', 'o gato apareceu com a chave debaixo do sofá', ['a chave sumiu', 'a família procurou o dia todo', 'compraram uma chave nova']],
];
const DISCURSOS = [
  ['— Vou vencer esta corrida! — gritou Lena.', 'direto'],
  ['Lena gritou que venceria a corrida.', 'indireto'],
  ['— Está chovendo de novo? — perguntou o avô.', 'direto'],
  ['O avô perguntou se estava chovendo de novo.', 'indireto'],
];
const FOCO_NARRATIVO = [
  ['"EU abri a porta devagar e MEU coração disparou."', 'Quem conta a história?', 'um narrador-personagem (1ª pessoa)', ['um narrador de fora (3ª pessoa)', 'o leitor', 'ninguém conta']],
  ['"Marina abriu a porta devagar e o coração DELA disparou."', 'Quem conta a história?', 'um narrador de fora (3ª pessoa)', ['a própria Marina (1ª pessoa)', 'o coração', 'um repórter']],
];
const FOCO_NARRATIVO_7 = [
  ['"Eu nunca soube o que Pedro pensou naquela hora — só vi seu rosto mudar." O narrador…', 'é personagem e NÃO sabe tudo: só o que viu', ['sabe tudo o que todos pensam', 'está fora da história e sabe tudo', 'é o próprio Pedro']],
  ['"Enquanto Ana dormia, do outro lado da cidade Bruno tomava sua decisão." O narrador…', 'está fora da história e vê tudo, até o que ninguém viu', ['é a Ana', 'é o Bruno', 'só sabe o que Ana sabe']],
];
const EFEITO_DISCURSO = [
  ['O autor podia resumir, mas escolheu mostrar a fala: "— NUNCA mais entro aqui!". Que efeito isso cria?', 'a cena fica viva: ouvimos a raiva na voz da personagem', ['o texto fica mais curto', 'a história perde emoção', 'o narrador some da história']],
  ['O autor trocou "— Socorro!" por "ela pediu ajuda baixinho". O que mudou?', 'a cena perdeu força: a fala virou um resumo distante', ['a cena ficou mais emocionante', 'nada mudou no efeito', 'a personagem ficou mais corajosa']],
];

// fio 6 · poesia e figuras
const RIMAS = [
  ['coração', 'balão', ['sapato', 'janela', 'sorvete']],
  ['janela', 'panela', ['portão', 'telhado', 'parede']],
  ['flor', 'amor', ['pedra', 'chuva', 'campo']],
  ['gato', 'sapato', ['cachorro', 'peixe', 'flor']],
];
const ESTROFES = [
  ['"O mar dança sem parar,\nvai e volta na areia,\nquem o vê fica a sonhar,\ncom a lua que o clareia."', 'Quantos VERSOS tem essa estrofe?', '4', ['2', '3', '5']],
  ['"A estrela acordou cedo,\npintou o céu de anil."', 'Quantos VERSOS tem essa estrofe?', '2', ['1', '3', '4']],
];
const METAFORAS = [
  ['"A lua é uma lâmpada pendurada no céu."', 'O que o poeta quis dizer?', 'que a lua ilumina a noite como uma lâmpada', ['que a lua é elétrica', 'que alguém pendurou a lua', 'que o céu tem tomadas']],
  ['"Meu avô é uma biblioteca de histórias."', 'O que a frase quer dizer?', 'que o avô conhece muitas histórias', ['que o avô mora numa biblioteca', 'que o avô só lê livros', 'que o avô é feito de papel']],
];
const PIADAS = [
  ['"— Garçom, esse frango está gelado! — Claro, senhor: é frango à passarinho, e passarinho voa em céu frio."', 'A graça da piada está…', 'no duplo sentido criado pela resposta absurda do garçom', ['no preço do frango', 'na fome do cliente', 'no nome do restaurante']],
  ['"Por que o livro de matemática vive triste? Porque tem muitos problemas."', 'A graça está no duplo sentido de…', '"problemas": exercícios E preocupações', ['"livro": objeto e pessoa', '"triste": alegre e chateado', '"matemática": fácil e difícil']],
];
const FIGURAS_6 = [
  ['"Suas mãos eram gelo quando chegou da rua."', 'metáfora', ['comparação (com COMO)', 'personificação']],
  ['"O vento sussurrava segredos nas janelas."', 'personificação', ['metáfora', 'comparação (com COMO)']],
  ['"Ela corre COMO uma gazela."', 'comparação (com COMO)', ['metáfora', 'personificação']],
  ['"O sol abraçou a cidade logo cedo."', 'personificação', ['comparação (com COMO)', 'metáfora']],
];
const FIGURAS_7 = [
  ['"Já te chamei UM MILHÃO de vezes!"', 'hipérbole (exagero)', ['eufemismo (suavização)', 'metáfora']],
  ['"Estou morrendo de fome."', 'hipérbole (exagero)', ['personificação', 'eufemismo (suavização)']],
  ['"Chorou rios de lágrimas no final do filme."', 'hipérbole (exagero)', ['comparação', 'metonímia']],
];
const FIGURAS_8 = [
  ['"Adoro ler Machado de Assis." (o AUTOR pelo LIVRO)', 'metonímia', ['antítese', 'hipérbole']],
  ['"O ódio e o amor moram no mesmo peito."', 'antítese (opostos lado a lado)', ['metonímia', 'eufemismo']],
  ['"Aquela notícia tem um CHEIRO estranho." (sentido figurado)', 'conotação', ['sentido literal (denotação)', 'antítese']],
];
const IRONIA_EUFEMISMO = [
  ['"Ele foi CONVIDADO A SE RETIRAR da sala." (em vez de "foi expulso")', 'eufemismo (suavizar algo duro)', ['ironia (dizer o contrário)', 'hipérbole (exagerar)']],
  ['"Que organização IMPECÁVEL!" (diante da mesa caótica)', 'ironia (dizer o contrário do que pensa)', ['eufemismo (suavizar)', 'metáfora']],
  ['"Ela nos deixou." (em vez de "ela morreu")', 'eufemismo (suavizar algo doloroso)', ['ironia', 'antítese']],
];

// fio 7 · ortografia 6º–8º
ORTO['EF67LP32.6'] = [['mexer', 'mecher'], ['enxergar', 'enchergar'], ['jeito', 'geito'], ['ansioso', 'ancioso'], ['obsessão', 'obcessão'], ['berinjela', 'beringela']];
ORTO['EF08LP05.8'] = [['guarda-chuva', 'guardachuva'], ['segunda-feira', 'segunda feira (sem hífen)'], ['beija-flor', 'beijaflor'], ['bem-vindo', 'benvindo'], ['micro-ondas', 'microondas'], ['autoescola', 'auto-escola']];

// fio 9 · pontuação 6º–8º
const PONTUAR_6 = [
  ['O diretor anunciou o passeio.', 'O diretor, anunciou o passeio.'],
  ['Ana, venha almoçar!', 'Ana venha almoçar!'],
  ['Trouxe pão, queijo e suco.', 'Trouxe, pão queijo e suco.'],
];
const VIRGULA_ORACOES = [
  ['Quando a chuva passou, saímos para brincar.', 'Quando a chuva passou saímos para brincar.'],
  ['Se você quiser, eu espero.', 'Se você quiser eu espero.'],
  ['Embora estivesse cansado, terminou a lição.', 'Embora estivesse cansado terminou a lição.'],
];
const CONECTOR_ORACOES = [
  ['Estudei bastante, ___ ainda fiquei nervoso.', 'mas', ['e', 'ou']],
  ['Ela treinou o ano todo ___ venceu a prova.', 'e', ['mas', 'porém']],
  ['Queria ir à festa, ___ estava doente.', 'porém', ['e', 'ou']],
];
const SENTIDO_CONJUNCAO = [
  ['Na frase "Estava frio, PORTANTO levei casaco", a conjunção indica…', 'conclusão', ['causa', 'oposição', 'alternativa']],
  ['Em "EMBORA chovesse, fomos ao jogo", a conjunção indica…', 'concessão (um obstáculo que não impediu)', ['conclusão', 'adição', 'alternativa']],
  ['Em "Faltei PORQUE fiquei doente", a conjunção indica…', 'causa', ['oposição', 'conclusão', 'tempo']],
];

// fio 10 · classes e sintaxe
const CLASSE_PALAVRA = [
  ['Na frase "O cachorro CORREU pelo parque", a palavra CORREU é…', 'verbo', ['substantivo', 'adjetivo']],
  ['Na frase "A MENINA leu o livro", a palavra MENINA é…', 'substantivo', ['verbo', 'adjetivo']],
  ['Em "O sol BRILHOU forte", BRILHOU é…', 'verbo', ['substantivo', 'adjetivo']],
];
const ACHAR_ADJETIVO = [
  ['O bolo DELICIOSO acabou em um minuto.', 'delicioso', ['bolo', 'minuto', 'acabou']],
  ['A casa AMARELA fica na esquina.', 'amarela', ['casa', 'esquina', 'fica']],
  ['Que dia CHUVOSO!', 'chuvoso', ['dia', 'que']],
];
const CONCORDANCIA_V = [
  ['Os meninos ___ no parque.', 'brincam', ['brinca', 'brincamos']],
  ['A professora ___ a lição.', 'corrigiu', ['corrigiram', 'corrigimos']],
  ['Nós ___ cedo amanhã.', 'saímos', ['sai', 'saem']],
];
const CONCORDANCIA_N = [
  ['As casas ___ da rua nova.', 'amarelas', ['amarela', 'amarelos']],
  ['Os dois ___ irmãos chegaram.', 'queridos', ['querida', 'querido']],
  ['Aquelas ___ histórias me encantam.', 'velhas', ['velho', 'velha']],
];
const TEMPOS_VERBAIS = [
  ['Ontem eu ___ um bolo inteiro.', 'comi', ['como', 'comerei']],
  ['Amanhã nós ___ para a praia.', 'viajaremos', ['viajamos ontem', 'viajávamos']],
  ['Agora ela ___ no quintal.', 'brinca', ['brincou', 'brincará']],
];
const FLEXAO_SUJEITO = [
  ['Nós ___ o filme juntos.', 'assistimos', ['assistiu', 'assistiram']],
  ['Eles ___ tarde da festa.', 'voltaram', ['voltou', 'voltamos']],
  ['Tu ___ muito bem!', 'cantas', ['canta', 'cantam']],
];
const MODOS_VERBAIS = [
  ['Espero que você ___ bem na prova.', 'vá', ['vai', 'foi']],
  ['Se eu ___ rico, viajaria o mundo.', 'fosse', ['era', 'sou']],
  ['___ a porta, por favor. (pedido)', 'Feche', ['Fechou', 'Fechava']],
];
const CONCORDANCIA_6 = [
  ['Faz dois anos que moro aqui.', 'Fazem dois anos que moro aqui.'],
  ['Havia muitas pessoas na fila.', 'Haviam muitas pessoas na fila.'],
  ['Mais de um aluno faltou hoje.', 'Mais de um aluno faltaram hoje.'],
];
const SINTAXE_TERMOS = [
  ['Na frase "O menino comeu a maçã", quem é o SUJEITO?', 'o menino', ['a maçã', 'comeu']],
  ['Na frase "O menino comeu a maçã", o que é "a maçã"?', 'objeto direto (quem sofre a ação)', ['sujeito', 'verbo']],
  ['Em "As crianças cantaram lindamente", qual é o PREDICADO?', 'cantaram lindamente', ['as crianças', 'lindamente']],
];
const ADVERBIOS = [
  ['Em "Ela canta LINDAMENTE", o advérbio indica…', 'modo (como canta)', ['tempo (quando)', 'lugar (onde)']],
  ['Em "Chegamos ONTEM", o advérbio indica…', 'tempo (quando)', ['modo (como)', 'lugar (onde)']],
  ['Em "Moro AQUI", o advérbio indica…', 'lugar (onde)', ['tempo (quando)', 'modo (como)']],
];
const TERMOS_ORACAO_8 = [
  ['Em "Os alunos entregaram o trabalho AO PROFESSOR", o termo destacado é…', 'objeto indireto', ['objeto direto', 'sujeito', 'adjunto de tempo']],
  ['Em "A tempestade destruiu O TELHADO", o termo destacado é…', 'objeto direto', ['objeto indireto', 'sujeito', 'predicativo']],
];
const REGENCIA = [
  ['Assisti ___ filme com meus primos.', 'ao', ['o', 'no']],
  ['Obedeça ___ regras do jogo.', 'às', ['as', 'nas']],
  ['Cheguei ___ escola mais cedo.', 'à', ['a', 'em']],
];
const VOZES = [
  ['"A bola FOI CHUTADA pelo menino." A frase está na voz…', 'passiva', ['ativa', 'reflexiva']],
  ['"O menino CHUTOU a bola." A frase está na voz…', 'ativa', ['passiva', 'reflexiva']],
  ['Qual é a versão na voz ATIVA de "O bolo foi feito pela avó"?', 'A avó fez o bolo.', ['O bolo fez a avó.', 'O bolo foi comido.', 'A avó foi feita pelo bolo.']],
];
const COORD_SUBORD = [
  ['"Cheguei em casa E tomei banho." As orações são…', 'coordenadas (independentes, lado a lado)', ['subordinadas (uma depende da outra)']],
  ['"QUANDO cheguei em casa, tomei banho." As orações são…', 'subordinadas (uma depende da outra)', ['coordenadas (independentes)']],
  ['"Estudei muito, MAS a prova foi difícil." As orações são…', 'coordenadas (independentes, lado a lado)', ['subordinadas (uma depende da outra)']],
];

// fio 11 · vocabulário 6º–8º
const NUANCES = [
  ['olhar de um jeito escondido, sem ser visto', 'espiar', ['encarar', 'admirar']],
  ['a casa vista como lugar de afeto e família', 'lar', ['imóvel', 'construção']],
  ['rir baixinho, quase sem barulho', 'sorrir', ['gargalhar', 'debochar']],
  ['pedir com muita força, quase implorando', 'suplicar', ['solicitar', 'perguntar']],
];
const DERIVADA_COMPOSTA_7 = [
  ['passatempo', 'composta (junta duas palavras)', ['derivada (nasce de uma só)']],
  ['infelizmente', 'derivada (nasce de uma só)', ['composta (junta duas palavras)']],
  ['pé-de-moleque', 'composta (junta duas palavras)', ['derivada (nasce de uma só)']],
  ['reflorestamento', 'derivada (nasce de uma só)', ['composta (junta duas palavras)']],
];
const AFIXOS = [
  ['O prefixo RE- em "REfazer" significa…', 'fazer de novo', ['fazer o contrário', 'fazer pela metade']],
  ['O prefixo DES- em "DESfazer" significa…', 'o contrário da ação', ['fazer de novo', 'fazer rápido']],
  ['O sufixo -VEL em "lavá-VEL" significa…', 'que pode ser (lavado)', ['que já foi (lavado)', 'quem lava']],
  ['O sufixo -EIRO em "sapatEIRO" indica…', 'profissão/quem trabalha com', ['lugar distante', 'tamanho grande']],
];

// fio 12 · coesão
const REFERENTES = [
  ['"Ana pegou o livro na estante e O guardou na mochila." A palavra "O" se refere a…', 'o livro', ['a mochila', 'a estante', 'Ana']],
  ['"O time entrou em campo. ELE estava confiante." "ELE" se refere a…', 'o time', ['o campo', 'o jogo', 'o técnico']],
];
const REFERENTES_4 = [
  ['"Marcos emprestou a bicicleta ao primo, mas pediu que ELA voltasse até sábado." "ELA" é…', 'a bicicleta', ['a semana', 'a casa do primo', 'a mãe de Marcos']],
  ['"A professora elogiou as alunas e LHES deu parabéns." "LHES" se refere a…', 'as alunas', ['a professora', 'as provas', 'as famílias']],
];
const CONECTIVOS_5 = [
  ['Não fui à festa ___ estava doente.', 'porque', ['mas', 'ou']],
  ['Quero ir ao cinema, ___ está chovendo muito.', 'mas', ['porque', 'e']],
  ['Você prefere suco ___ refrigerante?', 'ou', ['mas', 'porque']],
  ['___ chova, o jogo vai acontecer.', 'Mesmo que', ['Porque', 'Portanto']],
];
const COESAO_6 = [
  ['"Pedro ama futebol. ___, treina todos os dias." Qual conectivo costura as frases?', 'Por isso', ['Porém', 'Ou seja', 'Antes disso']],
  ['"A cidade cresceu rápido. ___ crescimento trouxe problemas." O que costura?', 'Esse', ['Aquela', 'Nenhum', 'Outro']],
];
const ANAFORAS = [
  ['"O time venceu de virada. A EQUIPE comemorou no gramado." "A equipe" retoma…', 'o time', ['a torcida', 'a virada', 'o gramado']],
  ['"Comprei um romance ontem. O LIVRO é incrível." "O livro" retoma…', 'o romance', ['a livraria', 'o autor', 'o dia de ontem']],
];
const ORGANIZADORES = [
  ['"PRIMEIRO misture os ovos; DEPOIS acrescente a farinha; POR FIM leve ao forno." Essas palavras organizam o texto por…', 'ordem no tempo (sequência de passos)', ['oposição de ideias', 'causa e efeito', 'comparação']],
  ['"POR UM LADO, o celular ajuda nos estudos; POR OUTRO, distrai." As expressões organizam…', 'um contraste entre dois lados', ['uma sequência de passos', 'uma lista de compras', 'uma conclusão']],
];
const RELATIVOS = [
  ['"O livro QUE li nas férias era ótimo." O QUE se refere a…', 'o livro', ['as férias', 'quem leu', 'a escola']],
  ['"A cidade ONDE nasci fica no litoral." O ONDE se refere a…', 'a cidade', ['o litoral', 'quem nasceu', 'a praia']],
];
const PROGRESSAO = [
  ['O parágrafo diz: "A horta da escola começou pequena, com três canteiros de alface." Qual frase CONTINUA bem o assunto?', 'Hoje, já são dez canteiros e até um pomar.', ['O futebol é o esporte mais popular do país.', 'Alface se escreve com CE.', 'A escola fica na rua principal.']],
  ['O parágrafo diz: "Reciclar virou rotina na nossa rua." Qual frase CONTINUA bem o assunto?', 'Cada casa agora separa papel, vidro e plástico.', ['Meu cachorro late à noite.', 'A rua foi asfaltada em 1990.', 'Plástico deriva do petróleo.']],
];

// ---------------------------------------------------------------------
// MOLDES por célula
// ---------------------------------------------------------------------
const MOLDES = {
  // ---- fio 1 · fluência (🔥) ----
  'EF02LP02.2': [{ id: 'separar-silabas', gerar(r) {
    const p = de(r, SEPARAR);
    return { enunciado: `Como se separa a palavra "${p[0]}" em sílabas?`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Fale devagar batendo palmas: cada palma é uma sílaba.' };
  } }],
  'EF02LP04.2': [{ id: 'completar-silaba', gerar(r) {
    const p = de(r, COMPLETAR_SILABA);
    return { enunciado: `Complete a palavra: ${p[0]}`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: `A palavra completa é algo que você conhece: ${p[3].length} letras no total.` };
  } }],
  'EF02LP05.2': [{ id: 'nasal', gerar(r) {
    const p = de(r, NASAIS);
    return { enunciado: `Qual está escrita do jeito CERTO?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'O som "anasalado" pede til (~), M ou N.' };
  } }],
  'EF12LP01.2': [{ id: 'palavra-real', gerar(r) {
    const p = de(r, PALAVRA_REAL);
    return { enunciado: `Só UMA está escrita do jeito certo. Qual?`, tipo: 'escolha', opcoes: escolha(r, p[0], p[1]), resposta: p[0], dica: 'Leia cada uma em voz alta, bem devagar.' };
  } }],
  'EF03LP02.3': [{ id: 'silabas-dificeis', gerar(r) {
    const p = de(r, SEPARAR.filter((x) => x[0].length >= 5));
    return { enunciado: `Separe em sílabas: "${p[0]}"`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Consoantes juntas como PR e FL ficam na MESMA sílaba.' };
  } }],
  'EF03LP03.3': [{ id: 'digrafos', gerar(r) {
    const p = de(r, DIGRAFOS);
    return { enunciado: `Qual está certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'LH, NH e CH são duplas de letras com um som só.' };
  } }],
  'EF35LP01.3': [{ id: 'leitura-rapida', gerar(r) {
    const t = de(r, TEXTOS[3]);
    return { enunciado: `Leia com atenção:\n\n"${t[0]}"\n\n${t[1]}`, tipo: 'escolha', opcoes: escolha(r, t[2], t[3]), resposta: t[2], dica: 'A resposta está escrita no texto — volte e ache.' };
  } }],
  // ---- fio 2 · localizar (🔥) ----
  'EF15LP03.2': [{ id: 'literal-2', gerar(r) {
    const t = de(r, TEXTOS[2]);
    return { enunciado: `Leia:\n\n"${t[0]}"\n\n${t[1]}`, tipo: 'escolha', opcoes: escolha(r, t[2], t[3]), resposta: t[2], dica: 'A resposta está no texto, do jeitinho que foi escrita.' };
  } }],
  'EF15LP03.3': [{ id: 'literal-3', gerar(r) {
    const t = de(r, TEXTOS[3]);
    return { enunciado: `Leia:\n\n"${t[0]}"\n\n${t[1]}`, tipo: 'escolha', opcoes: escolha(r, t[2], t[3]), resposta: t[2], dica: 'Procure no texto a parte que fala disso.' };
  } }],
  'EF15LP03.4': [{ id: 'literal-4', gerar(r) {
    const t = de(r, TEXTOS[4]);
    return { enunciado: `Leia:\n\n"${t[0]}"\n\n${t[1]}`, tipo: 'escolha', opcoes: escolha(r, t[2], t[3]), resposta: t[2], dica: 'Releia com calma o trecho que responde à pergunta.' };
  } }],
  'EF15LP03.5': [{ id: 'literal-5', gerar(r) {
    const t = de(r, TEXTOS[5]);
    return { enunciado: `Leia:\n\n"${t[0]}"\n\n${t[1]}`, tipo: 'escolha', opcoes: escolha(r, t[2], t[3]), resposta: t[2], dica: 'A informação está lá — caçe com paciência de detetive.' };
  } }],
  'EF04LP14.4': [{ id: 'noticia', gerar(r) {
    const n = de(r, [
      ['Ontem à tarde, alunos do 4º ano plantaram vinte mudas de ipê no pátio da Escola Aurora.', 'Onde as mudas foram plantadas?', 'no pátio da Escola Aurora', ['na praça central', 'no zoológico', 'na beira do rio']],
      ['Neste sábado, a Biblioteca Municipal fará uma tarde de contação de histórias para crianças.', 'Quando será a contação de histórias?', 'neste sábado', ['ontem à tarde', 'na segunda-feira', 'no feriado']],
    ]);
    return { enunciado: `Notícia: "${n[0]}"\n\n${n[1]}`, tipo: 'escolha', opcoes: escolha(r, n[2], n[3]), resposta: n[2], dica: 'Toda notícia responde: o quê, quem, onde e quando.' };
  } }],
  // ---- fio 3 · inferir (🔥) ----
  'EF15LP02.2': [{ id: 'titulo', gerar(r) {
    const t = de(r, TITULOS);
    return { enunciado: `Só pelo TÍTULO — "${t[0]}" — o texto deve falar sobre…`, tipo: 'escolha', opcoes: escolha(r, t[1], t[2]), resposta: t[1], dica: 'O título é uma janelinha para o assunto.' };
  } }],
  'EF35LP04.3': [{ id: 'inferencia-3', gerar(r) {
    const t = de(r, TEXTOS[3]);
    return { enunciado: `Leia:\n\n"${t[0]}"\n\n${t[4]}`, tipo: 'escolha', opcoes: escolha(r, t[5], t[6]), resposta: t[5], dica: 'A resposta não está escrita — junte as pistas do texto.' };
  } }],
  'EF35LP04.4': [{ id: 'inferencia-4', gerar(r) {
    const t = de(r, TEXTOS[4]);
    return { enunciado: `Leia:\n\n"${t[0]}"\n\n${t[4]}`, tipo: 'escolha', opcoes: escolha(r, t[5], t[6]), resposta: t[5], dica: 'Pense: o que o texto DEIXA ENTENDER sem dizer?' };
  } }],
  'EF35LP04.5': [{ id: 'inferencia-5', gerar(r) {
    const t = de(r, TEXTOS[5]);
    return { enunciado: `Leia:\n\n"${t[0]}"\n\n${t[4]}`, tipo: 'escolha', opcoes: escolha(r, t[5], t[6]), resposta: t[5], dica: 'Ler nas entrelinhas: as pistas somadas contam mais que as palavras.' };
  } }],
  'EF35LP03.4': [{ id: 'ideia-central', gerar(r) {
    const t = de(r, [
      ['As abelhas visitam centenas de flores por dia. Nesse vai e vem, carregam o pólen que faz nascer frutas e sementes. Sem elas, muitas plantações simplesmente desapareceriam.', 'a importância das abelhas para as plantas', ['a vida das flores', 'como fazer mel', 'os perigos do jardim']],
      ['Antigamente, as cartas demoravam semanas para chegar. Hoje, uma mensagem cruza o mundo em um segundo. A forma de conversar mudou — mas a vontade de estar perto continua a mesma.', 'como a comunicação mudou com o tempo', ['a história dos correios', 'como escrever cartas', 'a invenção do telefone']],
    ]);
    return { enunciado: `Leia:\n\n"${t[0]}"\n\nQual é a IDEIA CENTRAL do texto?`, tipo: 'escolha', opcoes: escolha(r, t[1], t[2]), resposta: t[1], dica: 'Não é um detalhe — é o assunto que segura o texto inteiro.' };
  } }],
  'EF35LP05.4': [{ id: 'palavra-contexto', gerar(r) {
    const p = de(r, CONTEXTO_PALAVRA);
    return { enunciado: `"${p[0]}"\n\nPelo contexto, "${p[1].toUpperCase()}" quer dizer…`, tipo: 'escolha', opcoes: escolha(r, p[2], p[3]), resposta: p[2], dica: 'O resto da frase entrega o sentido — leia o que vem antes e depois.' };
  } }],
  // ---- fio 7 · ortografia (🔥) ----
  'EF02LP03.2': [{ id: 'par-fv', gerar(r) {
    const p = de(r, ORTO['EF02LP03.2']);
    return { enunciado: `Qual está escrita certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'Fale em voz alta: F e V (e T/D, P/B) têm sons irmãos, mas diferentes.' };
  } }],
  'EF03LP01.3': [{ id: 'contextuais', gerar(r) {
    const p = de(r, ORTO['EF03LP01.3']);
    return { enunciado: `Qual está certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'RR entre vogais tem som forte; S entre vogais soa como Z.' };
  } }],
  'EF04LP01.4': [{ id: 'm-antes-pb', gerar(r) {
    const p = de(r, ORTO['EF04LP01.4']);
    return { enunciado: `Qual está certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'Antes de P e B, usamos sempre M.' };
  } }],
  'EF04LP02.4': [{ id: 'ditongo', gerar(r) {
    const p = de(r, ORTO['EF04LP02.4']);
    return { enunciado: `Qual está certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'Algumas palavras têm um I ou U "escondido" que a fala engole: cai-xa, pei-xe.' };
  } }],
  'EF04LP08.4': [{ id: 'sufixos', gerar(r) {
    const p = de(r, ORTO['EF04LP08.4']);
    return { enunciado: `Qual está certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: '-AGEM se escreve com G; -OSO e -EZA com S e Z nessa ordem.' };
  } }],
  'EF35LP13.4': [{ id: 'irregulares', gerar(r) {
    const p = de(r, ORTO['EF35LP13.4']);
    return { enunciado: `Qual está certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'Essas não têm regra — são de decorar. O H de "hoje" e "hora" é mudo!' };
  } }],
  'EF05LP01.5': [{ id: 'campeonato', gerar(r) {
    const p = de(r, ORTO['EF05LP01.5']);
    return { enunciado: `Nível campeão: qual está certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'Na dúvida de verdade, o dicionário é o juiz.' };
  } }],
  // ---- fio 8 · acentuação ----
  'EF03LP05.3': [{ id: 'contar-silabas', gerar(r) {
    const p = de(r, CONTAR_SILABAS);
    return { enunciado: `Quantas sílabas tem a palavra "${p[0]}"?`, tipo: 'numero', resposta: String(p[1]), dica: 'Bata uma palma para cada pedacinho da palavra.' };
  } }],
  'EF03LP06.3': [{ id: 'tonica', gerar(r) {
    const p = de(r, TONICAS);
    return { enunciado: `Qual é a sílaba mais FORTE (tônica) de "${p[0]}"?`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Chame a palavra bem alto, como se gritasse — a sílaba que estica é a tônica.' };
  } }],
  'EF03LP04.3': [{ id: 'acento-oxitona', gerar(r) {
    const p = de(r, OXITONAS);
    return { enunciado: `Qual está escrita certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'Palavras fortes no FINAL terminadas em A, E, O levam acento.' };
  } }],
  'EF04LP04.4': [{ id: 'acento-paroxitona', gerar(r) {
    const p = de(r, PAROXITONAS);
    return { enunciado: `Qual está certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'Paroxítonas terminadas em -L, -R, -I, -ÃO levam acento.' };
  } }],
  'EF05LP03.5': [{ id: 'proparoxitona', gerar(r) {
    const p = de(r, PROPAROXITONAS);
    return { enunciado: `Qual está certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'Regra de ouro: TODA proparoxítona leva acento.' };
  } }],
  // ---- fio 9 · pontuação ----
  'EF02LP09.2': [{ id: 'fim-de-frase', gerar(r) {
    const p = de(r, FIM_DE_FRASE);
    return { enunciado: `Que sinal termina a frase?\n\n"${p[0]}__"`, tipo: 'escolha', opcoes: escolha(r, p[1], ['.', '?', '!'].filter((x) => x !== p[1]).slice(0, 2)), resposta: p[1], dica: 'Pergunta pede ?, surpresa ou grito pede !, o resto pede ponto.' };
  } }],
  'EF03LP07.3': [{ id: 'dialogo', gerar(r) {
    const p = de(r, DIALOGO);
    return { enunciado: `Qual está pontuada certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'Fala de personagem começa com travessão (—).' };
  } }],
  'EF04LP05.4': [{ id: 'virgula-lista', gerar(r) {
    const p = de(r, VIRGULA_LISTA);
    return { enunciado: `Qual está pontuada certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'Numa lista, a vírgula separa os itens — menos antes do E final.' };
  } }],
  'EF05LP04.5': [{ id: 'efeito-pontuacao', gerar(r) {
    const p = de(r, PONTUACAO_EFEITO);
    return { enunciado: `${p[0]}…`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Pontuação também cria clima: suspense, ironia, pausa.' };
  } }],
  // ---- fio 11 · vocabulário ----
  'EF02LP10.2': [{ id: 'sinonimo', gerar(r) {
    const p = de(r, SINONIMOS);
    return { enunciado: `Qual palavra significa o MESMO que "${p[0]}"?`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Sinônimos são palavras que podem trocar de lugar na frase.' };
  } }, { id: 'antonimo-in', gerar(r) {
    const p = de(r, ANTONIMOS_IN);
    return { enunciado: `Qual é o CONTRÁRIO de "${p[0]}" usando IN- ou IM-?`, tipo: 'texto', resposta: p[1], dica: 'É só grudar o prefixo de negação na frente.' };
  } }],
  'EF02LP11.2': [{ id: 'aumentativo', gerar(r) {
    const p = de(r, AUMENTATIVOS); const querAum = de(r, [true, false]);
    return { enunciado: `Qual é o ${querAum ? 'AUMENTATIVO' : 'DIMINUTIVO'} de "${p[0]}"?`, tipo: 'escolha', opcoes: escolha(r, querAum ? p[1] : p[2], [querAum ? p[2] : p[1]]), resposta: querAum ? p[1] : p[2], dica: querAum ? '-ÃO deixa grandão.' : '-INHO deixa pequenininho.' };
  } }],
  'EF04LP03.4': [{ id: 'contexto-leve', gerar(r) {
    const p = de(r, CONTEXTO_PALAVRA);
    return { enunciado: `"${p[0]}"\n\nO que "${p[1]}" significa AQUI?`, tipo: 'escolha', opcoes: escolha(r, p[2], p[3]), resposta: p[2], dica: 'O dicionário dá vários sentidos — o contexto escolhe um.' };
  } }],
  'EF05LP02.5': [{ id: 'polissemia', gerar(r) {
    const p = de(r, POLISSEMIA);
    return { enunciado: `"${p[1]}"\n\nNessas frases, "${p[0].toUpperCase()}" significa…`, tipo: 'escolha', opcoes: escolha(r, p[2], p[3]), resposta: p[2], dica: 'A mesma palavra pode ter sentidos bem diferentes.' };
  } }],
  'EF05LP08.5': [{ id: 'derivada-composta', gerar(r) {
    const p = de(r, DERIVADAS);
    const pal = p[1] || p[0];
    return { enunciado: `A palavra "${pal}" é…`, tipo: 'escolha', opcoes: escolha(r, p[2], [p[2] === 'derivada' ? 'composta' : 'derivada', 'primitiva']), resposta: p[2], dica: 'Derivada nasce de outra com sufixo; composta junta DUAS palavras.' };
  } }],
  // ================= LOTE 2 =================
  // ---- fio 2 · localizar (6º–8º) ----
  'EF69LP03.6': [{ id: 'fato-central', gerar(r) {
    const n = de(r, NOTICIAS_6);
    return { enunciado: `Notícia: "${n[0]}"\n\n${n[1]}`, tipo: 'escolha', opcoes: escolha(r, n[2], n[3]), resposta: n[2], dica: 'O fato central costuma estar logo na primeira frase da notícia.' };
  } }],
  'EF69LP34.7': [{ id: 'grifar', gerar(r) {
    const t = de(r, GRIFAR);
    return { enunciado: `Leia:\n\n"${t[0]}"\n\n${t[1]}`, tipo: 'escolha', opcoes: escolha(r, t[2], t[3]), resposta: t[2], dica: 'Grife a frase que, sozinha, ainda conta o principal.' };
  } }],
  'EF69LP32.8': [{ id: 'selecionar-info', gerar(r) {
    const t = de(r, SELECIONAR_INFO);
    return { enunciado: t[0], tipo: 'escolha', opcoes: escolha(r, t[1], t[2]), resposta: t[1], dica: 'Pesquisar bem é IGNORAR o que não responde à sua pergunta.' };
  } }],
  // ---- fio 3 · inferir (6º–8º) ----
  'EF69LP05.6': [{ id: 'ironia-humor', gerar(r) {
    const t = de(r, IRONIA_HUMOR);
    return { enunciado: `${t[0]}\n\n${t[1]}`, tipo: 'escolha', opcoes: escolha(r, t[2], t[3]), resposta: t[2], dica: 'Na ironia, as palavras dizem uma coisa e a intenção diz outra.' };
  } }],
  'EF67LP05.7': [{ id: 'tese', gerar(r) {
    const t = de(r, TESES);
    return { enunciado: `Leia o texto de opinião:\n\n"${t[0]}"\n\n${t[1]}`, tipo: 'escolha', opcoes: escolha(r, t[2], t[3]), resposta: t[2], dica: 'A tese é o que o autor DEFENDE; o resto são os argumentos que a sustentam.' };
  } }],
  'EF89LP04.8': [{ id: 'tese-implicita', gerar(r) {
    const t = de(r, TESE_IMPLICITA);
    return { enunciado: `${t[0]}\n\n${t[1]}`, tipo: 'escolha', opcoes: escolha(r, t[2], t[3]), resposta: t[2], dica: 'Compare o que foi dito com o que foi ESCOLHIDO para ficar lado a lado.' };
  } }],
  // ---- fio 4 · leitura crítica ----
  'EF03LP19.3': [{ id: 'anuncio', gerar(r) {
    const a = de(r, ANUNCIOS);
    return { enunciado: `${a[0]}\n\n${a[1]}`, tipo: 'escolha', opcoes: escolha(r, a[2], a[3]), resposta: a[2], dica: 'Anúncio quer VENDER — repare no que ele faz você sentir.' };
  } }],
  'EF04LP15.4': [{ id: 'fato-opiniao', gerar(r) {
    const f = de(r, FATO_OPINIAO);
    return { enunciado: `"${f[0]}"\n\nIsso é um FATO ou uma OPINIÃO?`, tipo: 'escolha', opcoes: escolha(r, f[1], [f[1] === 'fato' ? 'opinião' : 'fato']), resposta: f[1], dica: 'Fato dá para checar; opinião depende de quem fala.' };
  } }],
  'EF05LP16.5': [{ id: 'midias', gerar(r) {
    const m2 = de(r, MIDIAS);
    return { enunciado: `${m2[0]}\n\n${m2[1]}`, tipo: 'escolha', opcoes: escolha(r, m2[2], m2[3]), resposta: m2[2], dica: 'O fato é um só — a escolha das palavras é que muda o retrato.' };
  } }],
  'EF06LP01.6': [{ id: 'relato-neutro', gerar(r) {
    const m2 = de(r, RELATO_NEUTRO);
    return { enunciado: m2[0], tipo: 'escolha', opcoes: escolha(r, m2[1], m2[2]), resposta: m2[1], dica: 'Palavras como "fortuna" e "desnecessária" julgam — não apenas informam.' };
  } }],
  'EF67LP04.7': [{ id: 'fato-opiniao-7', gerar(r) {
    const f = de(r, FATO_OPINIAO_7);
    return { enunciado: `"${f[0]}"\n\nFATO ou OPINIÃO?`, tipo: 'escolha', opcoes: escolha(r, f[1], [f[1] === 'fato' ? 'opinião' : 'fato']), resposta: f[1], dica: 'Números e registros são checáveis; "melhor", "demais" e "emocionante" são julgamentos.' };
  } }],
  'EF89LP02.8': [{ id: 'meme-critico', gerar(r) {
    const m2 = de(r, MEME_CRITICO);
    return { enunciado: m2[0], tipo: 'escolha', opcoes: escolha(r, m2[1], m2[2]), resposta: m2[1], dica: 'Na internet, quem compartilha também assina — cheque antes.' };
  } }],
  'EF89LP06.8': [{ id: 'persuasao-arg', gerar(r) {
    const m2 = de(r, PERSUASAO_ARG);
    return { enunciado: m2[0], tipo: 'escolha', opcoes: escolha(r, m2[1], m2[2]), resposta: m2[1], dica: 'Argumento pode convencer por dados, por autoridade ou por emoção — identifique o motor.' };
  } }],
  // ---- fio 5 · narrativas ----
  'EF02LP28.2': [{ id: 'conflito', gerar(r) {
    const c2 = de(r, CONFLITOS);
    return { enunciado: `Leia:\n\n"${c2[0]}"\n\n${c2[1]}`, tipo: 'escolha', opcoes: escolha(r, c2[2], c2[3]), resposta: c2[2], dica: 'Toda história tem um problema no meio e um jeito de resolver no fim.' };
  } }],
  'EF35LP29.3': [{ id: 'elementos', gerar(r) {
    const e2 = de(r, ELEMENTOS_NARRATIVA);
    return { enunciado: `${e2[0]}\n\n${e2[1]}`, tipo: 'escolha', opcoes: escolha(r, e2[2], e2[3]), resposta: e2[2], dica: 'Cenário = onde; personagem = quem; narrador = quem conta.' };
  } }],
  'EF35LP26.4': [{ id: 'enredo', gerar(r) {
    const e2 = de(r, ENREDO);
    return { enunciado: `${e2[0]}\n\n${e2[1]}`, tipo: 'escolha', opcoes: escolha(r, e2[2], e2[3]), resposta: e2[2], dica: 'Reconte a história na cabeça, na ordem: começo → meio → fim.' };
  } }],
  'EF35LP30.5': [{ id: 'discurso', gerar(r) {
    const d2 = de(r, DISCURSOS);
    return { enunciado: `"${d2[0]}"\n\nO discurso é DIRETO ou INDIRETO?`, tipo: 'escolha', opcoes: escolha(r, d2[1], [d2[1] === 'direto' ? 'indireto' : 'direto']), resposta: d2[1], dica: 'Travessão e fala ao vivo = direto; "disse que…" = indireto.' };
  } }],
  'EF69LP47.6': [{ id: 'foco-6', gerar(r) {
    const f = de(r, FOCO_NARRATIVO);
    return { enunciado: `${f[0]}\n\n${f[1]}`, tipo: 'escolha', opcoes: escolha(r, f[2], f[3]), resposta: f[2], dica: 'EU/MEU = narrador dentro da história; ELA/DELA = narrador de fora.' };
  } }],
  'EF69LP47.7': [{ id: 'foco-7', gerar(r) {
    const f = de(r, FOCO_NARRATIVO_7);
    return { enunciado: `${f[0]}\n\n`, tipo: 'escolha', opcoes: escolha(r, f[1], f[2]), resposta: f[1], dica: 'Pergunte: o narrador sabe TUDO ou só o que uma personagem vê?' };
  } }],
  'EF89LP05.8': [{ id: 'efeito-discurso', gerar(r) {
    const f = de(r, EFEITO_DISCURSO);
    return { enunciado: f[0], tipo: 'escolha', opcoes: escolha(r, f[1], f[2]), resposta: f[1], dica: 'Mostrar a fala aproxima; resumir a fala afasta. O autor escolhe o efeito.' };
  } }],
  // ---- fio 6 · poesia e figuras ----
  'EF12LP07.2': [{ id: 'rima', gerar(r) {
    const p = de(r, RIMAS);
    return { enunciado: `Qual palavra RIMA com "${p[0]}"?`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Rimar é terminar com o mesmo som — fale alto e ouça o final.' };
  } }],
  'EF35LP23.3': [{ id: 'versos', gerar(r) {
    const p = de(r, ESTROFES);
    return { enunciado: `${p[0]}\n\n${p[1]}`, tipo: 'escolha', opcoes: escolha(r, p[2], p[3]), resposta: p[2], dica: 'Cada linha do poema é um verso; o bloco de versos é a estrofe.' };
  } }],
  'EF35LP31.4': [{ id: 'metafora', gerar(r) {
    const p = de(r, METAFORAS);
    return { enunciado: `${p[0]}\n\n${p[1]}`, tipo: 'escolha', opcoes: escolha(r, p[2], p[3]), resposta: p[2], dica: 'O poeta compara sem avisar — procure o que as duas coisas têm em comum.' };
  } }],
  'EF05LP10.5': [{ id: 'piada', gerar(r) {
    const p = de(r, PIADAS);
    return { enunciado: `${p[0]}\n\n${p[1]}`, tipo: 'escolha', opcoes: escolha(r, p[2], p[3]), resposta: p[2], dica: 'Quase toda piada mora numa palavra com dois sentidos.' };
  } }],
  'EF67LP38.6': [{ id: 'figuras-6', gerar(r) {
    const p = de(r, FIGURAS_6);
    return { enunciado: `${p[0]}\n\nQual figura de linguagem é essa?`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'COMO na frase = comparação; sem COMO = metáfora; coisa agindo como gente = personificação.' };
  } }],
  'EF67LP38.7': [{ id: 'figuras-7', gerar(r) {
    const p = de(r, FIGURAS_7);
    return { enunciado: `${p[0]}\n\nQual figura de linguagem é essa?`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Exagero proposital para dar força = hipérbole.' };
  } }],
  'EF69LP54.8': [{ id: 'figuras-8', gerar(r) {
    const p = de(r, FIGURAS_8);
    return { enunciado: `${p[0]}\n\nQual recurso é esse?`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Metonímia troca a coisa por algo ligado a ela (autor pela obra).' };
  } }],
  'EF89LP37.8': [{ id: 'ironia-eufemismo', gerar(r) {
    const p = de(r, IRONIA_EUFEMISMO);
    return { enunciado: `${p[0]}\n\nQual figura é essa?`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Ironia diz o contrário; eufemismo diz mais suave.' };
  } }],
  // ---- fio 7 · ortografia (6º–8º) ----
  'EF67LP32.6': [{ id: 'orto-6', gerar(r) {
    const p = de(r, ORTO['EF67LP32.6']);
    return { enunciado: `Qual está escrita certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'X ou CH, G ou J: quando não há regra, vale a memória (e o dicionário).' };
  } }],
  'EF08LP05.8': [{ id: 'hifen', gerar(r) {
    const p = de(r, ORTO['EF08LP05.8']);
    return { enunciado: `Qual está escrita certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'Compostas de bicho e planta mantêm hífen (beija-flor); vogais iguais se separam (micro-ondas).' };
  } }],
  // ---- fio 9 · pontuação (6º–8º) ----
  'EF67LP33.6': [{ id: 'pontuar-6', gerar(r) {
    const p = de(r, PONTUAR_6);
    return { enunciado: `Qual está pontuada certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'NUNCA se separa sujeito do verbo com vírgula.' };
  } }],
  'EF06LP07.6': [{ id: 'virgula-oracoes', gerar(r) {
    const p = de(r, VIRGULA_ORACOES);
    return { enunciado: `Qual está pontuada certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'Oração que começa com QUANDO/SE/EMBORA pede vírgula ao terminar.' };
  } }],
  'EF07LP11.7': [{ id: 'conector-oracoes', gerar(r) {
    const p = de(r, CONECTOR_ORACOES);
    return { enunciado: `Complete: "${p[0]}"`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'E soma; MAS e PORÉM viram o jogo; OU oferece escolha.' };
  } }],
  'EF08LP13.8': [{ id: 'sentido-conjuncao', gerar(r) {
    const p = de(r, SENTIDO_CONJUNCAO);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'A conjunção é a placa de trânsito da frase: indica para onde a ideia vira.' };
  } }],
  // ---- fio 10 · classes e sintaxe ----
  'EF03LP08.3': [{ id: 'classe', gerar(r) {
    const p = de(r, CLASSE_PALAVRA);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Verbo é ação; substantivo dá nome; adjetivo descreve.' };
  } }],
  'EF03LP09.3': [{ id: 'achar-adjetivo', gerar(r) {
    const p = de(r, ACHAR_ADJETIVO);
    return { enunciado: `"${p[0]}"\n\nQual palavra é o ADJETIVO?`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'O adjetivo responde: COMO é a coisa?' };
  } }],
  'EF04LP06.4': [{ id: 'concordancia-v', gerar(r) {
    const p = de(r, CONCORDANCIA_V);
    return { enunciado: `Complete: "${p[0]}"`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'O verbo acompanha quem faz: um faz, vários fazem.' };
  } }],
  'EF04LP07.4': [{ id: 'concordancia-n', gerar(r) {
    const p = de(r, CONCORDANCIA_N);
    return { enunciado: `Complete: "${p[0]}"`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Adjetivo combina com o substantivo em gênero E número.' };
  } }],
  'EF05LP05.5': [{ id: 'tempos', gerar(r) {
    const p = de(r, TEMPOS_VERBAIS);
    return { enunciado: `Complete: "${p[0]}"`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Ontem = passado; agora = presente; amanhã = futuro.' };
  } }],
  'EF05LP06.5': [{ id: 'flexao-sujeito', gerar(r) {
    const p = de(r, FLEXAO_SUJEITO);
    return { enunciado: `Complete: "${p[0]}"`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Troque o sujeito em voz alta e ouça qual forma soa certa.' };
  } }],
  'EF06LP04.6': [{ id: 'modos', gerar(r) {
    const p = de(r, MODOS_VERBAIS);
    return { enunciado: `Complete: "${p[0]}"`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Desejo/dúvida pede subjuntivo (que você VÁ); ordem pede imperativo.' };
  } }],
  'EF06LP06.6': [{ id: 'concordancia-6', gerar(r) {
    const p = de(r, CONCORDANCIA_6);
    return { enunciado: `Qual está certa?`, tipo: 'escolha', opcoes: escolha(r, p[0], [p[1]]), resposta: p[0], dica: 'FAZER e HAVER no sentido de tempo/existência ficam no singular.' };
  } }],
  'EF07LP07.7': [{ id: 'sintaxe', gerar(r) {
    const p = de(r, SINTAXE_TERMOS);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Sujeito = quem faz; predicado = o que se diz dele; objeto = quem recebe a ação.' };
  } }],
  'EF07LP09.7': [{ id: 'adverbios', gerar(r) {
    const p = de(r, ADVERBIOS);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'O advérbio responde: como? quando? onde?' };
  } }],
  'EF08LP06.8': [{ id: 'termos-8', gerar(r) {
    const p = de(r, TERMOS_ORACAO_8);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Com preposição (ao, para, de) = objeto INDIRETO; sem = direto.' };
  } }],
  'EF08LP07.8': [{ id: 'regencia', gerar(r) {
    const p = de(r, REGENCIA);
    return { enunciado: `Complete (norma-padrão): "${p[0]}"`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Alguns verbos pedem preposição: assistir A, obedecer A, chegar A.' };
  } }],
  'EF08LP08.8': [{ id: 'vozes', gerar(r) {
    const p = de(r, VOZES);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Voz ativa: sujeito FAZ. Voz passiva: sujeito RECEBE (foi feito por…).' };
  } }],
  'EF08LP11.8': [{ id: 'coord-subord', gerar(r) {
    const p = de(r, COORD_SUBORD);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Se uma oração só faz sentido apoiada na outra, é subordinada.' };
  } }],
  // ---- fio 11 · vocabulário (6º–8º) ----
  'EF06LP03.6': [{ id: 'nuances', gerar(r) {
    const p = de(r, NUANCES);
    return { enunciado: `Qual palavra combina melhor com: "${p[0]}"?`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Sinônimos não são gêmeos — cada um carrega um tom diferente.' };
  } }],
  'EF67LP35.7': [{ id: 'derivada-composta-7', gerar(r) {
    const p = de(r, DERIVADA_COMPOSTA_7);
    return { enunciado: `A palavra "${p[0]}" é…`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Composta junta duas palavras inteiras; derivada cresce com prefixo/sufixo.' };
  } }],
  'EF07LP03.7': [{ id: 'afixos', gerar(r) {
    const p = de(r, AFIXOS);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Prefixo muda o sentido na frente; sufixo transforma no final.' };
  } }],
  // ---- fio 12 · coesão ----
  'EF35LP06.3': [{ id: 'referente', gerar(r) {
    const p = de(r, REFERENTES);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Volte na frase e pergunte: que palavra ele está substituindo?' };
  } }],
  'EF35LP14.4': [{ id: 'referente-4', gerar(r) {
    const p = de(r, REFERENTES_4);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'O pronome costura o texto para não repetir a mesma palavra.' };
  } }],
  'EF05LP07.5': [{ id: 'conectivos-5', gerar(r) {
    const p = de(r, CONECTIVOS_5);
    return { enunciado: `Complete: "${p[0]}"`, tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'PORQUE explica; MAS contraria; OU oferece escolha.' };
  } }],
  'EF67LP36.6': [{ id: 'coesao-6', gerar(r) {
    const p = de(r, COESAO_6);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'O conectivo certo faz a segunda frase apontar para a primeira.' };
  } }],
  'EF07LP12.7': [{ id: 'anaforas', gerar(r) {
    const p = de(r, ANAFORAS);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Anáfora = retomar algo já dito com outra palavra.' };
  } }],
  'EF69LP31.7': [{ id: 'organizadores', gerar(r) {
    const p = de(r, ORGANIZADORES);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'Palavras como PRIMEIRO/DEPOIS/POR FIM são o mapa do texto.' };
  } }],
  'EF08LP15.8': [{ id: 'relativos', gerar(r) {
    const p = de(r, RELATIVOS);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'O antecedente é a palavra que vem ANTES e que o relativo retoma.' };
  } }],
  'EF89LP29.8': [{ id: 'progressao', gerar(r) {
    const p = de(r, PROGRESSAO);
    return { enunciado: p[0], tipo: 'escolha', opcoes: escolha(r, p[1], p[2]), resposta: p[1], dica: 'A frase seguinte deve puxar o fio do MESMO assunto, acrescentando algo.' };
  } }],
};

// ---- API (mesmo contrato do banco de Matemática) ----
const temMolde = (celula) => Array.isArray(MOLDES[celula]) && MOLDES[celula].length > 0;
const CELULAS_COM_MOLDE = Object.keys(MOLDES);

function exercicio(celulaId, seed) {
  const lista = MOLDES[celulaId];
  if (!lista || !lista.length) return null;
  const molde = lista[seed % lista.length];
  const ex = molde.gerar(rng(seed));
  return { celula: celulaId, molde: molde.id, seed, ...ex };
}

// Português: acento não pode reprovar quem digitou "impossivel" — a grafia
// acentuada só é cobrada nos exercícios DE acentuação (que são de escolha).
const normalizar = (v) => String(v == null ? '' : v).trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const conferir = (celulaId, seed, respostaDada) => {
  const ex = exercicio(celulaId, seed);
  if (!ex) return null;
  return { certo: normalizar(respostaDada) === normalizar(ex.resposta), resposta: ex.resposta, dica: ex.dica };
};

module.exports = { MOLDES, CELULAS_COM_MOLDE, temMolde, exercicio, conferir, rng };
