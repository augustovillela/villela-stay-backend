// =====================================================================
// Invente Arena — MOLDES da Arena de Inglês (fase D, lotes 1 e 2).
// Lote 1 (pré-A1): vocabulário, escuta, leitura e conversas.
// Lote 2 (A1): gramática, números/horas e as células A1 dos demais fios.
// Listening: o exercício traz `audio` (texto em inglês) e o NAVEGADOR fala
// com speechSynthesis — voz PARA a criança, nada gravado, nada sai do
// aparelho. Bancos curados (Cambridge Pre A1 Starters / A1 Movers);
// distratores de gramática = erros típicos de aprendiz, de propósito.
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
const escolha = (r, certa, erradas) => embaralhar(r, [certa, ...erradas]);

// ---- BANCOS DE VOCABULÁRIO (EN, PT) ----
const VOCAB = {
  'EN-PA1-CORES.2': [['red', 'vermelho'], ['blue', 'azul'], ['green', 'verde'], ['yellow', 'amarelo'], ['black', 'preto'], ['white', 'branco'], ['orange', 'laranja'], ['purple', 'roxo']],
  'EN-PA1-NUMEROS.2': [['one', 'um (1)'], ['two', 'dois (2)'], ['three', 'três (3)'], ['five', 'cinco (5)'], ['seven', 'sete (7)'], ['ten', 'dez (10)'], ['twelve', 'doze (12)'], ['twenty', 'vinte (20)']],
  'EN-PA1-FAMILIA.2': [['mother', 'mãe'], ['father', 'pai'], ['brother', 'irmão'], ['sister', 'irmã'], ['grandmother', 'avó'], ['grandfather', 'avô'], ['baby', 'bebê']],
  'EN-PA1-ANIMAIS.2': [['dog', 'cachorro'], ['cat', 'gato'], ['bird', 'pássaro'], ['fish', 'peixe'], ['horse', 'cavalo'], ['elephant', 'elefante'], ['monkey', 'macaco'], ['duck', 'pato']],
  'EN-PA1-COMIDA.3': [['apple', 'maçã'], ['banana', 'banana'], ['bread', 'pão'], ['milk', 'leite'], ['water', 'água'], ['egg', 'ovo'], ['rice', 'arroz'], ['ice cream', 'sorvete']],
  'EN-PA1-ESCOLA.3': [['book', 'livro'], ['pencil', 'lápis'], ['school', 'escola'], ['teacher', 'professor(a)'], ['desk', 'carteira/mesa'], ['bag', 'mochila'], ['eraser', 'borracha']],
  'EN-PA1-CORPO.3': [['head', 'cabeça'], ['hand', 'mão'], ['foot', 'pé'], ['eye', 'olho'], ['mouth', 'boca'], ['nose', 'nariz'], ['ear', 'orelha'], ['arm', 'braço']],
  'EN-PA1-CASA.4': [['house', 'casa'], ['bed', 'cama'], ['table', 'mesa'], ['chair', 'cadeira'], ['door', 'porta'], ['window', 'janela'], ['kitchen', 'cozinha'], ['bathroom', 'banheiro']],
  'EN-PA1-ROUPAS.4': [['shirt', 'camisa'], ['shoes', 'sapatos'], ['hat', 'chapéu'], ['dress', 'vestido'], ['socks', 'meias'], ['jacket', 'casaco'], ['pants', 'calça']],
  'EN-A1-CIDADE.5': [['street', 'rua'], ['park', 'parque'], ['hospital', 'hospital'], ['library', 'biblioteca'], ['supermarket', 'supermercado'], ['bus', 'ônibus'], ['car', 'carro'], ['bike', 'bicicleta']],
  'EN-A1-NATUREZA.5': [['tree', 'árvore'], ['flower', 'flor'], ['sun', 'sol'], ['moon', 'lua'], ['river', 'rio'], ['beach', 'praia'], ['mountain', 'montanha'], ['rain', 'chuva']],
  'EN-A1-DIAS-MESES.5': [['Monday', 'segunda-feira'], ['Wednesday', 'quarta-feira'], ['Friday', 'sexta-feira'], ['Sunday', 'domingo'], ['January', 'janeiro'], ['May', 'maio'], ['August', 'agosto'], ['December', 'dezembro']],
};
const TODAS_EN = Object.values(VOCAB).flat().map((p) => p[0]);

const FRASES = [
  ['The cat is black.', 'O gato é preto.', ['O cachorro é branco.', 'O gato está dormindo.', 'A casa é grande.']],
  ['I have two dogs.', 'Eu tenho dois cachorros.', ['Eu vejo dois gatos.', 'Eu quero um cachorro.', 'Eu tenho duas irmãs.']],
  ['The apple is red.', 'A maçã é vermelha.', ['A banana é amarela.', 'A maçã é doce.', 'O suco é vermelho.']],
  ['My mother is a teacher.', 'Minha mãe é professora.', ['Minha irmã é professora.', 'Minha mãe está na escola.', 'Meu pai é professor.']],
  ['The bird is in the tree.', 'O pássaro está na árvore.', ['O pássaro está voando.', 'O gato está na árvore.', 'A árvore é alta.']],
  ['I like ice cream.', 'Eu gosto de sorvete.', ['Eu quero sorvete.', 'Eu como pão.', 'Eu gosto de bolo.']],
];

const CONVERSAS = {
  'EN-PA1-SAUDACOES.2': [
    ['Hello!', 'Hi!', ['Good night!', 'Thank you!']],
    ['Good morning!', 'Good morning!', ['Goodbye!', 'Yes, please!']],
    ['Thank you!', "You're welcome!", ['Good morning!', 'I am seven.']],
    ['Goodbye!', 'Bye! See you!', ['Hello!', "I'm fine!"]],
  ],
  'EN-PA1-APRESENTAR.3': [
    ["What's your name?", 'My name is Ana.', ['I am seven years old.', 'I like dogs.']],
    ['How old are you?', 'I am eight years old.', ['My name is Leo.', 'I am fine.']],
    ['How are you?', "I'm fine, thank you!", ['I am from Brazil.', 'My name is Bia.']],
    ['Where are you from?', 'I am from Brazil.', ['I am eight.', 'Yes, I am.']],
  ],
};

// ---- BANCOS DO LOTE 2 (A1) ----
// escuta: pergunta falada → resposta que encaixa (tudo em inglês)
const OUVIR_PERGUNTAS = [
  ['What color is the sky?', "It's blue.", ["It's a cat.", "I'm eight.", 'On Monday.']],
  ['How many legs does a dog have?', 'Four.', ['Yellow.', 'In the kitchen.', 'At school.']],
  ['Where is the teacher?', 'At school.', ['Blue.', 'Seven.', 'A banana.']],
  ["What's your favorite food?", 'Pizza!', ['On Sunday.', 'In the park.', 'He is tall.']],
  ['When do you play soccer?', 'On Saturday.', ['In my bag.', "It's red.", 'Two dogs.']],
];
// escuta: mini-diálogo falado → pergunta de compreensão em PT
const OUVIR_DIALOGOS = [
  ["Hi, Tom! Where are you going? ... I'm going to the park with my dog.", 'Aonde Tom está indo?', 'Ao parque, com o cachorro.', ['À escola, com a irmã.', 'À loja, com a mãe.', 'Ao cinema, sozinho.']],
  ['Do you like apples? ... No, but I love bananas.', 'Do que a pessoa gosta?', 'De bananas.', ['De maçãs.', 'De laranjas.', 'De uvas.']],
  ["What time is it? ... It's ten o'clock. We're late!", 'Que horas são no diálogo?', 'Dez horas.', ['Duas horas.', 'Seis horas.', 'Oito horas.']],
  ["Is this your book? ... No, my book is at home.", 'Onde está o livro da pessoa?', 'Em casa.', ['Na escola.', 'Na mochila.', 'Na mesa.']],
];
// leitura: diálogo escrito → compreensão em PT
const LER_DIALOGOS = [
  ['Anna: Is this your cat?\nBen: No, my cat is black. This cat is white.', 'De que cor é o gato do Ben?', 'Preto.', ['Branco.', 'Cinza.', 'Marrom.']],
  ['Mia: Can you swim?\nLeo: Yes! I swim every Saturday.', 'Quando Leo nada?', 'Todo sábado.', ['Todo domingo.', 'Nunca.', 'Todo dia.']],
  ['Sam: Where is my bag?\nMom: It is under the table.', 'Onde está a mochila?', 'Debaixo da mesa.', ['Em cima da cama.', 'Na escola.', 'Atrás da porta.']],
  ['Lia: Do you have a brother?\nMax: No, I have two sisters.', 'Quem são os irmãos de Max?', 'Duas irmãs.', ['Um irmão.', 'Dois irmãos.', 'Uma irmã.']],
];
// leitura: textinho → compreensão em PT
const TEXTINHOS = [
  ['My name is Lucas. I am nine years old. I have a small dog and two fish. On Sundays, I play soccer with my father.', 'Quantos anos Lucas tem?', 'Nove.', ['Sete.', 'Dez.', 'Doze.']],
  ['My name is Lucas. I am nine years old. I have a small dog and two fish. On Sundays, I play soccer with my father.', 'Com quem Lucas joga futebol?', 'Com o pai.', ['Com o irmão.', 'Com o cachorro.', 'Com a mãe.']],
  ['Emma lives in a big city. She goes to school by bus. Her favorite class is Art, because she loves to paint.', 'Como Emma vai à escola?', 'De ônibus.', ['De carro.', 'A pé.', 'De bicicleta.']],
  ['Emma lives in a big city. She goes to school by bus. Her favorite class is Art, because she loves to paint.', 'Qual é a aula favorita de Emma?', 'Arte.', ['Matemática.', 'Música.', 'Inglês.']],
  ['It is raining today. Tom is at home with his sister. They are watching a movie and eating popcorn.', 'Por que Tom está em casa?', 'Está chovendo.', ['É feriado.', 'Ele está doente.', 'A escola fechou.']],
];
// gramática: frase com lacuna → opção certa (distratores = erro típico)
const GRAMATICA = {
  'EN-PA1-TOBE.3': [
    ['I ___ a student.', 'am', ['is', 'are'], 'I am a student.'],
    ['You ___ my friend.', 'are', ['am', 'is'], 'You are my friend.'],
    ['The dog ___ big.', 'is', ['am', 'are'], 'The dog is big.'],
    ['We ___ happy.', 'are', ['is', 'am'], 'We are happy.'],
    ['She ___ my sister.', 'is', ['are', 'am'], 'She is my sister.'],
  ],
  'EN-PA1-ARTIGOS.3': [
    ['___ apple', 'an', ['a'], 'an apple'],
    ['___ banana', 'a', ['an'], 'a banana'],
    ['___ elephant', 'an', ['a'], 'an elephant'],
    ['___ book', 'a', ['an'], 'a book'],
    ['___ orange', 'an', ['a'], 'an orange'],
    ['___ house', 'a', ['an'], 'a house'],
  ],
  'EN-PA1-PLURAL.4': [
    ['one dog, two ___', 'dogs', ['dog', 'doges'], 'two dogs'],
    ['one box, two ___', 'boxes', ['boxs', 'box'], 'two boxes'],
    ['one man, two ___', 'men', ['mans', 'manes'], 'two men'],
    ['one child, two ___', 'children', ['childs', 'childrens'], 'two children'],
    ['one baby, two ___', 'babies', ['babys', 'babyes'], 'two babies'],
  ],
  'EN-PA1-PRONOMES.4': [
    ['Maria é uma menina. ___ is my friend.', 'She', ['He', 'It'], 'She is my friend.'],
    ['O carro é novo. ___ is new.', 'It', ['He', 'She'], 'It is new.'],
    ['Pedro e eu jogamos juntos. ___ are a team.', 'We', ['They', 'He'], 'We are a team.'],
    ['Meus pais trabalham. ___ are doctors.', 'They', ['We', 'She'], 'They are doctors.'],
    ['João é meu irmão. ___ is ten.', 'He', ['She', 'It'], 'He is ten.'],
  ],
  'EN-A1-PRESENT.4': [
    ['He ___ soccer on Sundays.', 'plays', ['play', 'playing'], 'He plays soccer on Sundays.'],
    ['I ___ milk every day.', 'drink', ['drinks', 'drinking'], 'I drink milk every day.'],
    ['She ___ to school by bus.', 'goes', ['go', 'going'], 'She goes to school by bus.'],
    ['They ___ in Brazil.', 'live', ['lives', 'living'], 'They live in Brazil.'],
    ['My father ___ in a hospital.', 'works', ['work', 'working'], 'My father works in a hospital.'],
  ],
  'EN-A1-CAN.5': [
    ['Eu sei nadar. → I ___ swim.', 'can', ['is', 'do'], 'I can swim.'],
    ['Ela não sabe voar. → She ___ fly.', "can't", ['can', "don't"], "She can't fly."],
    ['___ you help me, please?', 'Can', ['Is', 'Am'], 'Can you help me, please?'],
    ['Nós sabemos cantar. → We ___ sing.', 'can', ["can't", 'is'], 'We can sing.'],
  ],
  'EN-A1-CONTINUOUS.5': [
    ['Look! The baby ___ now.', 'is sleeping', ['sleeps', 'sleep'], 'The baby is sleeping now.'],
    ['She ___ a book now.', 'is reading', ['reads', 'reading'], 'She is reading a book now.'],
    ['They ___ soccer now.', 'are playing', ['play', 'is playing'], 'They are playing soccer now.'],
    ['I ___ my homework now.', 'am doing', ['do', 'doing'], 'I am doing my homework now.'],
  ],
  'EN-A1-POSSESSIVO.5': [
    ['Esta bicicleta é DELE. → This is ___ bike.', 'his', ['her', 'my'], 'This is his bike.'],
    ['Esta boneca é DELA. → This is ___ doll.', 'her', ['his', 'your'], 'This is her doll.'],
    ['Este livro é MEU. → This is ___ book.', 'my', ['your', 'his'], 'This is my book.'],
    ['Esta casa é NOSSA. → This is ___ house.', 'our', ['their', 'my'], 'This is our house.'],
    ['Este carro é DELES. → This is ___ car.', 'their', ['our', 'her'], 'This is their car.'],
  ],
};
// números por extenso e horas
const NUM_EXTENSO = [['11', 'eleven'], ['12', 'twelve'], ['13', 'thirteen'], ['15', 'fifteen'], ['16', 'sixteen'], ['18', 'eighteen'], ['20', 'twenty']];
const NUM_GRANDES = [['30', 'thirty'], ['40', 'forty'], ['42', 'forty-two'], ['55', 'fifty-five'], ['70', 'seventy'], ['99', 'ninety-nine'], ['100', 'one hundred']];
const HORAS = [
  ['3:00', "It's three o'clock."],
  ['3:30', "It's half past three."],
  ['7:15', "It's a quarter past seven."],
  ['9:45', "It's a quarter to ten."],
  ['8:00', "It's eight o'clock."],
  ['12:30', "It's half past twelve."],
];
// conversas A1
const PEDIDOS = [
  ['Você quer água. O que você diz?', 'Can I have some water, please?', ['Give me water!', 'Water now!', 'I water.']],
  ['Alguém te ajudou. O que você diz?', 'Thank you very much!', ['Goodbye!', 'Yes, I am.', 'No problem you.']],
  ['Você quer entrar na sala. O que você diz?', 'May I come in?', ['I enter now!', 'Open you!', 'In I go.']],
  ['Você não entendeu. O que você diz?', 'Can you repeat, please?', ['What you say!', 'Again now!', 'Repeat you.']],
];
const GOSTOS = [
  ['Como dizer "Eu gosto de pizza"?', 'I like pizza.', ['I am pizza.', 'I pizza like.', 'Me like pizza.']],
  ['Como dizer "Eu não gosto de peixe"?', "I don't like fish.", ['I no like fish.', "I don't fish.", 'I not like fish.']],
  ['Como dizer "Ela gosta de música"?', 'She likes music.', ['She like music.', 'She liking music.', 'Her likes music.']],
  ['Como perguntar "Você gosta de gatos?"', 'Do you like cats?', ['You like cats?', 'Does you like cats?', 'Like you cats?']],
];

// ---- BANCOS DO LOTE 3 (fio 7 · BNCC LI 6º–8º) ----
// leitura (EF06LI08/09, EF07LI07, EF08LI05): texto EN + pergunta PT
const BNCC_LEITURA = {
  EF06LI08: [
    ['Elephants are big animals. They live in Africa and Asia. They eat plants and love water.', 'Qual é o assunto do texto?', 'Elefantes.', ['A África.', 'Plantas.', 'Água.']],
    ['Soccer is a popular sport. Two teams play with one ball. Each team has eleven players.', 'Qual é o assunto do texto?', 'Futebol.', ['Times de basquete.', 'Onze amigos.', 'Uma bola de tênis.']],
    ['My city has a big park, two museums and a beautiful river. Many tourists visit it every year.', 'Qual é o assunto do texto?', 'Uma cidade e o que ela tem.', ['Um museu de arte.', 'Um rio poluído.', 'Turistas famosos.']],
  ],
  EF06LI09: [
    ['The school library opens at 8 in the morning and closes at 5 in the afternoon. It has more than two thousand books.', 'A que horas a biblioteca abre?', 'Às 8 da manhã.', ['Às 5 da tarde.', 'Às 2 da tarde.', 'Ao meio-dia.']],
    ['The school library opens at 8 in the morning and closes at 5 in the afternoon. It has more than two thousand books.', 'Quantos livros a biblioteca tem?', 'Mais de dois mil.', ['Duzentos.', 'Mais de cinco mil.', 'Oitocentos.']],
    ['Tickets for the show cost ten dollars for adults and five dollars for children under twelve.', 'Quanto custa o ingresso de criança?', 'Cinco dólares.', ['Dez dólares.', 'Doze dólares.', 'É de graça.']],
  ],
  EF07LI07: [
    ['Recycling is important for our planet. It saves energy and reduces pollution.\n\nAt home, you can start with small steps: separate paper, plastic and glass, and never throw batteries in the trash.', 'Qual é a informação-chave do SEGUNDO parágrafo?', 'Como começar a reciclar em casa.', ['Por que baterias são caras.', 'A história da reciclagem.', 'Onde comprar lixeiras.']],
    ['Dogs have lived with humans for thousands of years. They were the first animals we domesticated.\n\nToday, dogs do many jobs: they guide blind people, find lost hikers and even work with police officers.', 'Qual é a informação-chave do SEGUNDO parágrafo?', 'Os trabalhos que os cães fazem hoje.', ['Como adestrar um filhote.', 'A alimentação dos cães.', 'Raças mais antigas.']],
  ],
  EF08LI05: [
    ['Ana looked at the gray sky, took her umbrella and left home.', 'O que dá para CONCLUIR, mesmo sem o texto dizer?', 'Ana achou que ia chover.', ['Ana estava atrasada.', 'Ana adora o céu cinza.', 'Ana perdeu o guarda-chuva.']],
    ['When the teacher entered, the students quickly hid their phones and opened their books.', 'O que dá para CONCLUIR, mesmo sem o texto dizer?', 'Celular não era permitido na aula.', ['Os alunos amavam os livros.', 'A professora chegou cedo.', 'A escola não tinha internet.']],
    ['Tom smelled the kitchen, smiled and ran to the table before anyone called him.', 'O que dá para CONCLUIR, mesmo sem o texto dizer?', 'A comida estava pronta e cheirosa.', ['Tom estava fugindo de alguém.', 'A cozinha estava vazia.', 'Tom não gostava de comer.']],
  ],
};
// vocabulário 6º ano (EF06LI17): temas do cotidiano escolar
VOCAB['EF06LI17'] = [['homework', 'lição de casa'], ['breakfast', 'café da manhã'], ['playground', 'pátio/parquinho'], ['subject', 'matéria (da escola)'], ['classmate', 'colega de turma'], ['hobby', 'passatempo'], ['weekend', 'fim de semana'], ['holiday', 'feriado/férias']];
// gramática BNCC: [lacuna, certa, erradas, frase completa p/ áudio]
const BNCC_GRAM = {
  EF06LI19: [
    ['She ___ up at 7 o\'clock every day.', 'wakes', ['wake', 'waking'], 'She wakes up at 7 o\'clock every day.'],
    ['I ___ breakfast at home.', 'have', ['has', 'having'], 'I have breakfast at home.'],
    ['They ___ students at my school.', 'are', ['is', 'am'], 'They are students at my school.'],
    ['My brother ___ to bed at 9.', 'goes', ['go', 'going'], 'My brother goes to bed at 9.'],
  ],
  EF06LI20: [
    ['Quiet! The teacher ___ now.', 'is speaking', ['speaks', 'speak'], 'The teacher is speaking now.'],
    ['We ___ lunch right now.', 'are having', ['have', 'is having'], 'We are having lunch right now.'],
    ['Look! It ___ outside.', 'is raining', ['rains', 'rain'], 'It is raining outside.'],
  ],
  EF06LI21: [
    ['Para pedir silêncio: "___, please."', 'Be quiet', ['You quiet', 'Quieting'], 'Be quiet, please.'],
    ['Instrução da prova: "___ your name here."', 'Write', ['Writing', 'You write'], 'Write your name here.'],
    ['Comando do jogo: "___ the button to start."', 'Press', ['Pressing', 'To pressing'], 'Press the button to start.'],
    ['Aviso: "___ run near the pool."', "Don't", ['Not', 'No do'], "Don't run near the pool."],
  ],
  EF06LI22: [
    ['O cachorro da Maria = ___', "Maria's dog", ["Maria dog's", 'dog of Maria is'], "Maria's dog"],
    ['O carro do meu pai = my ___', "father's car", ["father car's", 'car father'], "my father's car"],
    ['A casa dos avós = my ___', "grandparents' house", ["grandparents house's", 'house grandparents'], "my grandparents' house"],
  ],
  EF06LI23: [
    ['O gato lambeu a pata DELE (do próprio gato). The cat licked ___ paw.', 'its', ['his', 'it'], 'The cat licked its paw.'],
    ['Nós amamos NOSSA escola. We love ___ school.', 'our', ['ours we', 'us'], 'We love our school.'],
    ['Eles trouxeram os livros DELES. They brought ___ books.', 'their', ['theirs them', 'they'], 'They brought their books.'],
  ],
  EF07LI15: [
    ['Yesterday I ___ to school by bike.', 'went', ['goed', 'go'], 'Yesterday I went to school by bike.'],
    ['My birthday is ___ May.', 'in', ['on', 'at'], 'My birthday is in May.'],
    ['The class starts ___ 8 o\'clock.', 'at', ['in', 'on'], 'The class starts at 8 o\'clock.'],
    ['I was born ___ a Monday.', 'on', ['in', 'at'], 'I was born on a Monday.'],
    ['Last week she ___ a great book.', 'read', ['readed', 'reads'], 'Last week she read a great book.'],
  ],
  EF07LI18: [
    ['I ___ TV when the phone rang.', 'was watching', ['watched', 'watch'], 'I was watching TV when the phone rang.'],
    ['While we ___, it started to rain.', 'were playing', ['played', 'play'], 'While we were playing, it started to rain.'],
    ['She ___ her homework and then went out.', 'finished', ['was finishing', 'finish'], 'She finished her homework and then went out.'],
  ],
  EF07LI19: [
    ['Chame ELE! Call ___!', 'him', ['he', 'his'], 'Call him!'],
    ['NÓS vimos ela na escola. ___ saw her at school.', 'We', ['Us', 'Our'], 'We saw her at school.'],
    ['Este presente é para MIM. This gift is for ___.', 'me', ['I', 'my'], 'This gift is for me.'],
    ['Eu conheço ELES. I know ___.', 'them', ['they', 'their'], 'I know them.'],
  ],
  EF07LI20: [
    ['When I was five, I ___ swim. Now I can!', "couldn't", ["can't", 'not could'], "When I was five, I couldn't swim. Now I can!"],
    ['She ___ read when she was four. Amazing!', 'could', ['can', 'cans'], 'She could read when she was four.'],
    ['___ you ride a bike when you were six?', 'Could', ['Can', 'Do'], 'Could you ride a bike when you were six?'],
  ],
  EF08LI14: [
    ['Look at those clouds! It ___ rain.', 'is going to', ['will to', 'goes to'], 'It is going to rain.'],
    ['I think she ___ win the game.', 'will', ['is going', 'wills'], 'I think she will win the game.'],
    ['Tomorrow we ___ visit our grandmother.', 'are going to', ['will to', 'go to'], 'Tomorrow we are going to visit our grandmother.'],
  ],
  EF08LI15: [
    ['An elephant is ___ than a cat.', 'bigger', ['more big', 'biggest'], 'An elephant is bigger than a cat.'],
    ['This is the ___ book I have ever read.', 'best', ['better', 'goodest'], 'This is the best book I have ever read.'],
    ['My sister is ___ than me.', 'taller', ['more tall', 'tallest'], 'My sister is taller than me.'],
    ['English is ___ than I thought.', 'easier', ['more easy', 'easiest'], 'English is easier than I thought.'],
  ],
  EF08LI16: [
    ['Is there ___ milk in the fridge?', 'any', ['some', 'many'], 'Is there any milk in the fridge?'],
    ['There are ___ apples on the table.', 'some', ['any', 'much'], 'There are some apples on the table.'],
    ['How ___ water do you drink a day?', 'much', ['many', 'some'], 'How much water do you drink a day?'],
    ['How ___ books do you have?', 'many', ['much', 'any'], 'How many books do you have?'],
  ],
  EF08LI17: [
    ['The boy ___ won the race is my friend.', 'who', ['which', 'what'], 'The boy who won the race is my friend.'],
    ['The book ___ is on the table is mine.', 'which', ['who', 'whose'], 'The book which is on the table is mine.'],
    ['The girl ___ dog is white lives here.', 'whose', ['who', 'which'], 'The girl whose dog is white lives here.'],
  ],
};
Object.assign(GRAMATICA, BNCC_GRAM); // moldeGramatica lê tudo de GRAMATICA

const distratoresEn = (r, certa, n) => {
  const out = new Set();
  let guarda = 0;
  while (out.size < n && guarda++ < 80) { const d2 = de(r, TODAS_EN); if (d2 !== certa) out.add(d2); }
  return [...out];
};

// molde de vocabulário (fios 1 e 5) + escuta opcional
function moldeVocab(celulaId) {
  return [{ id: 'en-pt', gerar(r) {
    const p = de(r, VOCAB[celulaId]);
    return { enunciado: `Como se diz "${p[1].toUpperCase()}" em inglês?`, tipo: 'escolha', opcoes: escolha(r, p[0], distratoresEn(r, p[0], 3)), resposta: p[0], audio: p[0], dica: 'Toque no 🔊 depois de responder para ouvir a palavra certa.' };
  } }, { id: 'pt-en', gerar(r) {
    const p = de(r, VOCAB[celulaId]);
    const erradas = embaralhar(r, VOCAB[celulaId].filter((x) => x[0] !== p[0])).slice(0, 3).map((x) => x[1]);
    return { enunciado: `O que significa "${p[0]}"?`, tipo: 'escolha', opcoes: escolha(r, p[1], erradas), resposta: p[1], audio: p[0], dica: 'Ouça no 🔊 — às vezes o som ajuda a lembrar.' };
  } }];
}

// molde de gramática: frase com lacuna, distratores curados (erro típico)
function moldeGramatica(celulaId, dica) {
  return [{ id: 'lacuna', gerar(r) {
    const it = de(r, GRAMATICA[celulaId]);
    return { enunciado: `Complete: ${it[0]}`, tipo: 'escolha', opcoes: escolha(r, it[1], it[2]), resposta: it[1], audio: it[3], dica };
  } }];
}

// molde de compreensão: material + pergunta + alternativas em PT
function moldeCompreensao(banco, cabecalho, mostrarTexto, dica) {
  return [{ id: 'compreensao', gerar(r) {
    const it = de(r, banco);
    const corpo = mostrarTexto ? `${cabecalho}\n\n"${it[0]}"\n\n${it[1]}` : `${cabecalho} ${it[1]}`;
    return { enunciado: corpo, tipo: 'escolha', opcoes: escolha(r, it[2], it[3]), resposta: it[2], audio: it[0], dica };
  } }];
}

const MOLDES = {
  // ---- fio 1 · vocabulário ----
  'EN-PA1-CORES.2': moldeVocab('EN-PA1-CORES.2'),
  'EN-PA1-NUMEROS.2': moldeVocab('EN-PA1-NUMEROS.2'),
  'EN-PA1-FAMILIA.2': moldeVocab('EN-PA1-FAMILIA.2'),
  'EN-PA1-ANIMAIS.2': moldeVocab('EN-PA1-ANIMAIS.2'),
  'EN-PA1-COMIDA.3': moldeVocab('EN-PA1-COMIDA.3'),
  'EN-PA1-ESCOLA.3': moldeVocab('EN-PA1-ESCOLA.3'),
  'EN-PA1-CORPO.3': moldeVocab('EN-PA1-CORPO.3'),
  'EN-PA1-CASA.4': moldeVocab('EN-PA1-CASA.4'),
  'EN-PA1-ROUPAS.4': moldeVocab('EN-PA1-ROUPAS.4'),
  'EN-A1-CIDADE.5': moldeVocab('EN-A1-CIDADE.5'),
  'EN-A1-NATUREZA.5': moldeVocab('EN-A1-NATUREZA.5'),
  // ---- fio 2 · escuta ----
  'EN-PA1-OUVIR-PALAVRA.2': [{ id: 'ouvir-palavra', gerar(r) {
    const certa = de(r, TODAS_EN);
    return { enunciado: '🔊 Toque no botão de ouvir. Qual palavra você ouviu?', tipo: 'escolha', opcoes: escolha(r, certa, distratoresEn(r, certa, 3)), resposta: certa, audio: certa, dica: 'Pode ouvir quantas vezes quiser!' };
  } }],
  'EN-PA1-OUVIR-FRASE.3': [{ id: 'ouvir-frase', gerar(r) {
    const f = de(r, FRASES);
    return { enunciado: '🔊 Ouça a frase. O que ela diz?', tipo: 'escolha', opcoes: escolha(r, f[1], f[2]), resposta: f[1], audio: f[0], dica: 'Ouça de novo e preste atenção na primeira palavra.' };
  } }],
  'EN-A1-OUVIR-PERGUNTA.4': [{ id: 'ouvir-pergunta', gerar(r) {
    const it = de(r, OUVIR_PERGUNTAS);
    return { enunciado: '🔊 Ouça a pergunta. Qual resposta encaixa?', tipo: 'escolha', opcoes: escolha(r, it[1], it[2]), resposta: it[1], audio: it[0], dica: 'What = o quê · where = onde · when = quando · how many = quantos.' };
  } }],
  'EN-A1-OUVIR-DIALOGO.5': [{ id: 'ouvir-dialogo', gerar(r) {
    const it = de(r, OUVIR_DIALOGOS);
    return { enunciado: `🔊 Ouça o mini-diálogo e responda:\n\n${it[1]}`, tipo: 'escolha', opcoes: escolha(r, it[2], it[3]), resposta: it[2], audio: it[0], dica: 'Ouça duas vezes: uma para entender o assunto, outra para o detalhe.' };
  } }],
  // ---- fio 3 · leitura ----
  'EN-PA1-LER-PALAVRA.2': [{ id: 'ler-palavra', gerar(r) {
    const p = de(r, [...VOCAB['EN-PA1-ANIMAIS.2'], ...VOCAB['EN-PA1-CORES.2'], ...VOCAB['EN-PA1-FAMILIA.2']]);
    const erradas = distratoresEn(r, p[0], 3);
    return { enunciado: `Qual destas palavras significa "${p[1].toUpperCase()}"?`, tipo: 'escolha', opcoes: escolha(r, p[0], erradas), resposta: p[0], audio: p[0], dica: 'Leia cada opção com calma.' };
  } }],
  'EN-PA1-LER-FRASE.3': [{ id: 'ler-frase', gerar(r) {
    const f = de(r, FRASES);
    return { enunciado: `Leia: "${f[0]}"\n\nO que a frase diz?`, tipo: 'escolha', opcoes: escolha(r, f[1], f[2]), resposta: f[1], audio: f[0], dica: 'Procure as palavras que você já conhece na frase.' };
  } }],
  'EN-A1-LER-DIALOGO.4': moldeCompreensao(LER_DIALOGOS, 'Leia o diálogo:', true, 'A resposta está na fala de UMA das pessoas — releia com calma.'),
  'EN-A1-LER-TEXTINHO.5': moldeCompreensao(TEXTINHOS, 'Leia o textinho:', true, 'Procure no texto a palavra-chave da pergunta.'),
  // ---- fio 4 · gramática ----
  'EN-PA1-TOBE.3': moldeGramatica('EN-PA1-TOBE.3', 'I → am · he/she/it → is · you/we/they → are.'),
  'EN-PA1-ARTIGOS.3': moldeGramatica('EN-PA1-ARTIGOS.3', 'AN antes de som de vogal (a, e, i, o, u); A antes dos outros.'),
  'EN-PA1-PLURAL.4': moldeGramatica('EN-PA1-PLURAL.4', 'A maioria ganha -s; mas algumas palavras mudam inteiras (man → men).'),
  'EN-PA1-PRONOMES.4': moldeGramatica('EN-PA1-PRONOMES.4', 'Ela → she · ele → he · coisa/animal → it · nós → we · eles → they.'),
  'EN-A1-PRESENT.4': moldeGramatica('EN-A1-PRESENT.4', 'Com he/she/it o verbo ganha -s: he plays, she goes.'),
  'EN-A1-CAN.5': moldeGramatica('EN-A1-CAN.5', 'CAN = saber/poder fazer; a negativa é can\'t.'),
  'EN-A1-CONTINUOUS.5': moldeGramatica('EN-A1-CONTINUOUS.5', 'Agora = am/is/are + verbo com -ing.'),
  'EN-A1-POSSESSIVO.5': moldeGramatica('EN-A1-POSSESSIVO.5', 'meu → my · dele → his · dela → her · nosso → our · deles → their.'),
  // ---- fio 5 · números e horas ----
  'EN-PA1-NUM-EXTENSO.3': [{ id: 'num-extenso', gerar(r) {
    const p = de(r, NUM_EXTENSO);
    const erradas = embaralhar(r, NUM_EXTENSO.filter((x) => x[1] !== p[1])).slice(0, 3).map((x) => x[1]);
    return { enunciado: `Como se escreve o número ${p[0]} em inglês?`, tipo: 'escolha', opcoes: escolha(r, p[1], erradas), resposta: p[1], audio: p[1], dica: 'Os "teen" (13–19) terminam em -teen; ouça no 🔊.' };
  } }],
  'EN-A1-NUM-GRANDES.4': [{ id: 'num-grandes', gerar(r) {
    const p = de(r, NUM_GRANDES);
    const erradas = embaralhar(r, NUM_GRANDES.filter((x) => x[1] !== p[1])).slice(0, 3).map((x) => x[1]);
    return { enunciado: `Como se escreve o número ${p[0]} em inglês?`, tipo: 'escolha', opcoes: escolha(r, p[1], erradas), resposta: p[1], audio: p[1], dica: 'As dezenas terminam em -ty: thirty, forty, fifty…' };
  } }],
  'EN-A1-HORAS.5': [{ id: 'horas', gerar(r) {
    const p = de(r, HORAS);
    const erradas = embaralhar(r, HORAS.filter((x) => x[1] !== p[1])).slice(0, 3).map((x) => x[1]);
    return { enunciado: `O relógio marca ${p[0]}. Como se diz em inglês?`, tipo: 'escolha', opcoes: escolha(r, p[1], erradas), resposta: p[1], audio: p[1], dica: "o'clock = hora cheia · half past = e meia · a quarter = quinze minutos." };
  } }],
  'EN-A1-DIAS-MESES.5': moldeVocab('EN-A1-DIAS-MESES.5'),
  // ---- fio 6 · conversas ----
  'EN-PA1-SAUDACOES.2': [{ id: 'saudacao', gerar(r) {
    const cItem = de(r, CONVERSAS['EN-PA1-SAUDACOES.2']);
    return { enunciado: `Alguém diz: "${cItem[0]}" — qual é a melhor resposta?`, tipo: 'escolha', opcoes: escolha(r, cItem[1], cItem[2]), resposta: cItem[1], audio: cItem[0], dica: 'Ouça no 🔊 como soa — cumprimento combina com cumprimento.' };
  } }],
  'EN-PA1-APRESENTAR.3': [{ id: 'apresentar', gerar(r) {
    const cItem = de(r, CONVERSAS['EN-PA1-APRESENTAR.3']);
    return { enunciado: `A pergunta é: "${cItem[0]}" — qual resposta encaixa?`, tipo: 'escolha', opcoes: escolha(r, cItem[1], cItem[2]), resposta: cItem[1], audio: cItem[0], dica: 'Name = nome · old = idade · from = de onde.' };
  } }],
  'EN-A1-PEDIDOS.4': [{ id: 'pedidos', gerar(r) {
    const it = de(r, PEDIDOS);
    return { enunciado: it[0], tipo: 'escolha', opcoes: escolha(r, it[1], it[2]), resposta: it[1], audio: it[1], dica: 'Pedido educado costuma ter "please" ou começar com Can/May.' };
  } }],
  'EN-A1-GOSTOS.5': [{ id: 'gostos', gerar(r) {
    const it = de(r, GOSTOS);
    return { enunciado: it[0], tipo: 'escolha', opcoes: escolha(r, it[1], it[2]), resposta: it[1], audio: it[1], dica: 'like ganha -s com she/he; a negativa usa don\'t/doesn\'t.' };
  } }],
  // ---- fio 7 · BNCC LI (6º–8º) ----
  'EF06LI08': moldeCompreensao(BNCC_LEITURA.EF06LI08, 'Leia o texto:', true, 'As palavras parecidas com o português (cognatos) entregam o assunto.'),
  'EF06LI09': moldeCompreensao(BNCC_LEITURA.EF06LI09, 'Leia o texto:', true, 'Procure no texto o número ou a palavra exata da pergunta.'),
  'EF06LI17': moldeVocab('EF06LI17'),
  'EF06LI19': moldeGramatica('EF06LI19', 'Com he/she/it o verbo ganha -s no presente simples.'),
  'EF06LI20': moldeGramatica('EF06LI20', 'Agora = am/is/are + verbo com -ing.'),
  'EF06LI21': moldeGramatica('EF06LI21', 'O imperativo é o verbo sem sujeito: Open… Write… Don\'t…'),
  'EF06LI22': moldeGramatica('EF06LI22', 'Dono + \'s + coisa: Maria\'s dog = o cachorro DA Maria.'),
  'EF06LI23': moldeGramatica('EF06LI23', 'its = de coisa/animal · our = nosso · their = deles.'),
  'EF07LI15': moldeGramatica('EF07LI15', 'in mês/ano · on dia · at hora; verbos irregulares mudam inteiros no passado.'),
  'EF07LI18': moldeGramatica('EF07LI18', 'Ação em andamento no passado = was/were + -ing; ação pontual = passado simples.'),
  'EF07LI19': moldeGramatica('EF07LI19', 'Sujeito faz (he, we, I); objeto recebe (him, us, me).'),
  'EF07LI20': moldeGramatica('EF07LI20', 'could = can no passado; a negativa é couldn\'t.'),
  'EF07LI07': moldeCompreensao(BNCC_LEITURA.EF07LI07, 'Leia os dois parágrafos:', true, 'Cada parágrafo tem UMA ideia central — resuma cada um numa frase.'),
  'EF08LI14': moldeGramatica('EF08LI14', 'will = previsão/decisão · be going to = plano ou evidência ("olha as nuvens!").'),
  'EF08LI15': moldeGramatica('EF08LI15', 'Curta: -er/-est (taller). Nunca "more big" — big é curta.'),
  'EF08LI16': moldeGramatica('EF08LI16', 'some em afirmativa · any em pergunta/negativa · much p/ incontável · many p/ contável.'),
  'EF08LI17': moldeGramatica('EF08LI17', 'who = pessoa · which = coisa · whose = posse.'),
  'EF08LI05': moldeCompreensao(BNCC_LEITURA.EF08LI05, 'Leia a cena:', true, 'A resposta não está escrita — está ESCONDIDA nas pistas do texto.'),
};

// ---- API (mesmo contrato dos outros bancos) ----
const temMolde = (celula) => Array.isArray(MOLDES[celula]) && MOLDES[celula].length > 0;
const CELULAS_COM_MOLDE = Object.keys(MOLDES);

function exercicio(celulaId, seed) {
  const lista = MOLDES[celulaId];
  if (!lista || !lista.length) return null;
  const molde = lista[seed % lista.length];
  const ex = molde.gerar(rng(seed));
  return { celula: celulaId, molde: molde.id, seed, ...ex };
}

const normalizar = (v) => String(v == null ? '' : v).trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
const conferir = (celulaId, seed, respostaDada) => {
  const ex = exercicio(celulaId, seed);
  if (!ex) return null;
  return { certo: normalizar(respostaDada) === normalizar(ex.resposta), resposta: ex.resposta, dica: ex.dica };
};

module.exports = { MOLDES, CELULAS_COM_MOLDE, temMolde, exercicio, conferir, rng };
