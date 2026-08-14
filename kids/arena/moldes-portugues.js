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
