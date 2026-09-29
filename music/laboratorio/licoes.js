// =====================================================================
// Musique · Laboratório — LIÇÕES (caminho 2: aprender passo a passo).
//
// Conteúdo ORIGINAL, escrito para o Musique, versionado no git. Cada
// lição percorre o ciclo da ADR-0013: entender → ver → ouvir → manipular
// → praticar → aplicar. Os desenhos e sons NÃO estão escritos aqui: a
// lição pede "mostre a escala de dó maior" e o núcleo calcula — assim a
// lição não pode ensinar uma nota diferente da que a ferramenta mostra.
//
// Blocos: p (parágrafo), visual (desenho do núcleo), ouvir (MIDI),
// praticar (exercício do motor), aprofundar (texto para quem quer mais),
// ferramenta (link contextual), lista.
//
// ⚠️ `html` aqui é texto AUTORAL da casa (não vem de usuário). Mesmo
// assim, nada de script: só <em>, <strong>, <a> internos.
// =====================================================================
'use strict';

const AUTORIA = { autor: 'Equipe Musique (Villela Music)', revisao_tecnica: 'núcleo de teoria com testes automatizados',
  revisao_pedagogica: 'pendente — aguardando professor revisor', revisado_em: '28/09/2026' };

const REFS = {
  med: 'Bohumil Med, Teoria da Música (Musimed) — leitura complementar.',
  priolli: 'Maria Luisa de Mattos Priolli, Princípios Básicos da Música para a Juventude — leitura complementar.',
  omt: 'Open Music Theory (openmusictheory.github.io), livro aberto em inglês — leitura complementar.',
  kostka: 'Stefan Kostka e Dorothy Payne, Tonal Harmony — leitura complementar (inglês).',
  schoenberg: 'Arnold Schoenberg, Harmonia (Editora Unesp) — leitura complementar.',
};

const LICOES = [
  {
    slug: 'som-e-nota', titulo: 'Som, altura e nota', nivel: 'iniciante', prereq: [], termos: 'som altura duracao intensidade timbre frequencia',
    resumo: 'O que o ouvido percebe num som — altura, duração, intensidade e timbre — e o que é uma nota.',
    blocos: [
      { t: 'p', html: 'Todo som é vibração. Quando algo vibra de forma <strong>regular</strong> (uma corda, as pregas vocais, a coluna de ar de uma flauta), o ouvido percebe uma <strong>altura</strong>: o som é mais grave ou mais agudo. Vibração irregular — um chocalho, o vento — é ruído: tem timbre e intensidade, mas não tem altura definida.' },
      { t: 'lista', itens: ['<strong>Altura</strong>: grave ou agudo. Depende da frequência — quantas vibrações por segundo (Hz).', '<strong>Duração</strong>: quanto tempo o som dura.', '<strong>Intensidade</strong>: forte ou fraco (o volume).', '<strong>Timbre</strong>: a "cor" que faz um violão e uma flauta soarem diferentes tocando a mesma nota.'] },
      { t: 'ouvir', rotulo: 'Ouça: grave, médio e agudo', midis: [45, 57, 69, 81], modo: 'melodico' },
      { t: 'p', html: 'Uma <strong>nota</strong> é um som de altura definida a que damos um nome. O lá que a orquestra usa para afinar vibra 440 vezes por segundo (440 Hz). O lá uma oitava acima vibra o dobro: 880 Hz. O ouvido escuta essas duas notas como "a mesma nota, mais aguda" — por isso elas têm o mesmo nome.' },
      { t: 'aprofundar', html: 'O timbre vem, em boa parte, dos <em>harmônicos</em>: frequências múltiplas da fundamental que soam junto com ela, cada instrumento com uma receita própria. Veja na <a href="/music/explorar/serie-harmonica">série harmônica</a> e na <a href="/music/explorar/onda">forma de onda</a>.' },
      { t: 'ferramenta', slug: 'onda' },
    ],
    refs: ['med', 'omt'],
  },
  {
    slug: 'alfabeto-musical', titulo: 'O nome das notas', nivel: 'iniciante', prereq: ['som-e-nota'], termos: 'do re mi fa sol la si c d e f g a b cifra oitava',
    resumo: 'Dó, ré, mi… e C, D, E: as duas notações, as oitavas e o dó central.',
    blocos: [
      { t: 'p', html: 'São sete nomes que se repetem: <strong>dó, ré, mi, fá, sol, lá, si</strong>. Na cifra (a notação por letras, usada em acordes e no mundo inteiro) os mesmos sete são <strong>C, D, E, F, G, A, B</strong>. Nenhuma das duas é "a certa": o Musique deixa você escolher e mostra as duas.' },
      { t: 'visual', v: { tipo: 'piano', de: 60, ate: 72, rotulos: 'todas', brancas: true } },
      { t: 'p', html: 'Depois do si, volta o dó — uma <strong>oitava</strong> acima. Para saber de qual dó se fala, usa-se um número: o <strong>dó central</strong> do piano é o <strong>dó4</strong> (C4). O lá de afinação é o lá4 (A4 = 440 Hz).' },
      { t: 'ouvir', rotulo: 'Ouça dó4 até dó5', midis: [60, 62, 64, 65, 67, 69, 71, 72], modo: 'melodico' },
      { t: 'aprofundar', html: 'A oitava pertence à <em>letra</em>: si♯3 soa igual ao dó4, mas continua "da oitava 3" — porque é um si. Parece detalhe, e é exatamente o que decide em que linha da pauta a nota fica.' },
      { t: 'praticar', tipo: 'nota-no-teclado', nivel: 1 },
    ],
    refs: ['med', 'priolli'],
  },
  {
    slug: 'tons-e-semitons', titulo: 'Teclado, tons, semitons e acidentes', nivel: 'iniciante', prereq: ['alfabeto-musical'], termos: 'tom semitom sustenido bemol bequadro enarmonia teclas pretas',
    resumo: 'O semitom é a menor distância do teclado; sustenido e bemol movem a nota meio tom.',
    blocos: [
      { t: 'p', html: 'No piano, de uma tecla para a vizinha (branca ou preta) é um <strong>semitom</strong> (meio tom). Dois semitons formam um <strong>tom</strong>. Entre as teclas brancas, quase sempre há uma preta no meio — ou seja, um tom. As exceções são <strong>mi–fá</strong> e <strong>si–dó</strong>: ali não há tecla preta, e a distância é de meio tom.' },
      { t: 'visual', v: { tipo: 'piano', de: 60, ate: 72, marcar: [[64, 'mi'], [65, 'fá'], [71, 'si'], [72, 'dó']] } },
      { t: 'p', html: 'O <strong>sustenido (♯)</strong> sobe a nota meio tom; o <strong>bemol (♭)</strong> desce meio tom; o <strong>bequadro (♮)</strong> cancela. A tecla preta entre dó e ré pode se chamar <strong>dó♯</strong> ou <strong>ré♭</strong>: é a <a href="/music/referencia/enarmonia">enarmonia</a>. Mesmo som, nomes diferentes — e o nome depende do contexto (da escala, do acorde, da tonalidade).' },
      { t: 'aprofundar', html: 'Existem ainda o dobrado sustenido (𝄪) e o dobrado bemol (𝄫), que aparecem quando a teoria exige: a sensível de sol♯ menor é fá𝄪 — que soa como sol, mas precisa ser um fá para a escala ter uma nota de cada letra.' },
      { t: 'praticar', tipo: 'nota-no-teclado', nivel: 2 },
    ],
    refs: ['med'],
  },
  {
    slug: 'pauta-e-claves', titulo: 'Pauta e claves', nivel: 'iniciante', prereq: ['alfabeto-musical'], termos: 'pauta clave de sol clave de fa clave de do linhas suplementares',
    resumo: 'Cinco linhas, quatro espaços e a clave que dá nome a tudo.',
    blocos: [
      { t: 'p', html: 'A <strong>pauta</strong> tem cinco linhas e quatro espaços, contados <strong>de baixo para cima</strong>. Cada linha e cada espaço é uma nota; subir um degrau (de linha para espaço) é subir uma letra.' },
      { t: 'p', html: 'A <strong>clave</strong> fixa o nome de uma linha — e, a partir dela, de todas as outras. A <strong>clave de sol</strong> diz que a 2ª linha é o sol4. A <strong>clave de fá</strong> diz que a 4ª linha é o fá3. A <strong>clave de dó</strong> diz onde está o dó4 (3ª linha na viola, 4ª no violoncelo agudo e no fagote).' },
      { t: 'visual', v: { tipo: 'pauta', clave: 'sol', notas: ['E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5'], rotular: true } },
      { t: 'visual', v: { tipo: 'pauta', clave: 'fa', notas: ['G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3'], rotular: true } },
      { t: 'p', html: 'Notas fora da pauta usam <strong>linhas suplementares</strong>. O dó central fica na 1ª linha suplementar abaixo da clave de sol — e na 1ª acima da clave de fá. Juntas, as duas pautas formam a <strong>grande pauta</strong> do piano, com o dó central no meio.' },
      { t: 'ferramenta', slug: 'pauta' },
      { t: 'praticar', tipo: 'nota-na-pauta', nivel: 1 },
    ],
    refs: ['med', 'priolli'],
  },
  {
    slug: 'figuras-e-pausas', titulo: 'Figuras, pausas e o ponto', nivel: 'iniciante', prereq: ['som-e-nota'], termos: 'semibreve minima seminima colcheia semicolcheia fusa semifusa pausa ponto ligadura quialtera',
    resumo: 'Cada figura vale metade da anterior; o ponto soma metade; a pausa é o silêncio medido.',
    blocos: [
      { t: 'p', html: 'A duração se escreve com <strong>figuras</strong>. Cada uma vale a metade da anterior: <strong>semibreve</strong> (1), <strong>mínima</strong> (1/2), <strong>semínima</strong> (1/4), <strong>colcheia</strong> (1/8), <strong>semicolcheia</strong> (1/16), <strong>fusa</strong> (1/32) e <strong>semifusa</strong> (1/64). Os números são frações da semibreve — é daí que vem o "4" de 4/4.' },
      { t: 'visual', v: { tipo: 'figuras' } },
      { t: 'p', html: 'Cada figura tem a sua <strong>pausa</strong>, com a mesma duração, em silêncio. O <strong>ponto de aumento</strong> soma metade do valor: semínima pontuada = 1/4 + 1/8 = 3/8. A <strong>ligadura de valor</strong> soma notas iguais sem novo ataque. A <strong>quiáltera</strong> encaixa um número "errado" de figuras num tempo — a tercina põe 3 colcheias no lugar de 2.' },
      { t: 'aprofundar', html: 'Durações somam como frações, e o Musique as calcula assim — nunca com números decimais aproximados. Três colcheias de tercina somam exatamente 1/4.' },
      { t: 'praticar', tipo: 'ritmo-completar', nivel: 1 },
    ],
    refs: ['med'],
  },
  {
    slug: 'pulso-e-compasso', titulo: 'Pulso, andamento e compasso', nivel: 'iniciante', prereq: ['figuras-e-pausas'], termos: 'pulso bpm andamento compasso simples composto irregular 4/4 6/8 3/4',
    resumo: 'O pulso, o BPM e como a fórmula de compasso organiza os tempos fortes e fracos.',
    blocos: [
      { t: 'p', html: 'O <strong>pulso</strong> é a batida regular que o corpo sente. O <strong>andamento</strong> é a velocidade dele, em batidas por minuto (<strong>BPM</strong>): 60 BPM = uma por segundo.' },
      { t: 'p', html: 'O <strong>compasso</strong> agrupa os pulsos e dá a eles peso: o primeiro tempo é o mais forte. A fórmula tem dois números — em <strong>4/4</strong>, quatro tempos de semínima; em <strong>3/4</strong>, três (a valsa).' },
      { t: 'p', html: 'Nos <strong>compassos compostos</strong> (6/8, 9/8, 12/8), o pulso é uma figura pontuada dividida em três: 6/8 tem <strong>dois</strong> pulsos de semínima pontuada, não seis. Compassos <strong>irregulares</strong> (5/8, 7/8) misturam grupos de dois e de três.' },
      { t: 'ferramenta', slug: 'bpm' },
      { t: 'praticar', tipo: 'ritmo-completar', nivel: 2 },
    ],
    refs: ['med', 'omt'],
  },
  {
    slug: 'intervalos', titulo: 'Intervalos: número e qualidade', nivel: 'iniciante', prereq: ['tons-e-semitons', 'pauta-e-claves'], termos: 'intervalo terca quinta justa maior menor aumentada diminuta inversao semitons',
    resumo: 'Conte as letras para o número; conte os semitons para a qualidade.',
    blocos: [
      { t: 'p', html: 'Intervalo é a distância entre duas notas, e tem duas partes. O <strong>número</strong> se conta pelas <strong>letras</strong>, incluindo as duas pontas: de dó a mi são 3 letras (dó-ré-mi) — é uma <strong>terça</strong>. A <strong>qualidade</strong> se conta pelos <strong>semitons</strong>: de dó a mi são 4 — terça <strong>maior</strong>; de dó a mi♭ são 3 — terça <strong>menor</strong>.' },
      { t: 'visual', v: { tipo: 'pauta', clave: 'sol', notas: ['C4', 'E4'], rotulos: ['dó', 'mi'] } },
      { t: 'ouvir', rotulo: 'Ouça a terça maior e a menor', midis: [60, 64, 60, 63], modo: 'melodico' },
      { t: 'p', html: 'Uníssono, quarta, quinta e oitava são <strong>justas</strong>; segundas, terças, sextas e sétimas são <strong>maiores ou menores</strong>. Um semitom a mais que a maior (ou a justa) é <strong>aumentado</strong>; um a menos que a menor (ou a justa) é <strong>diminuto</strong>.' },
      { t: 'p', html: 'Por que contar letras, se o ouvido só ouve semitons? Porque <strong>dó–fá♭</strong> tem os mesmos 4 semitons de dó–mi, mas é uma <strong>quarta diminuta</strong>: outra função na música, outra linha na pauta.' },
      { t: 'aprofundar', html: 'Inverter um intervalo (subir a nota de baixo uma oitava) troca o número por 9 − número e a qualidade pela oposta: terça maior vira sexta menor; quarta aumentada vira quinta diminuta. Veja a <a href="/music/referencia/intervalos">tabela de intervalos</a>.' },
      { t: 'praticar', tipo: 'intervalo-identificar', nivel: 1 },
    ],
    refs: ['med', 'omt'],
  },
  {
    slug: 'escala-maior', titulo: 'A escala maior', nivel: 'iniciante', prereq: ['intervalos'], termos: 'escala maior tom tom semitom graus tonica',
    resumo: 'Tom, tom, semitom, tom, tom, tom, semitom — e uma nota de cada letra.',
    blocos: [
      { t: 'p', html: 'A <strong>escala maior</strong> é a sequência de sete notas com o desenho <strong>T T S T T T S</strong> (tom, tom, semitom, tom, tom, tom, semitom). Em dó maior, só teclas brancas: dó ré mi fá sol lá si dó.' },
      { t: 'visual', v: { tipo: 'escala', tonica: 'C4', escala: 'maior' } },
      { t: 'p', html: 'Começando em outra nota, o desenho obriga a usar acidentes. Em <strong>sol maior</strong>, o 7º grau precisa estar a meio tom da tônica: fá♯. E há sempre <strong>uma nota de cada letra</strong> — é por isso que em fá maior se escreve si♭ (e não lá♯).' },
      { t: 'visual', v: { tipo: 'escala', tonica: 'G4', escala: 'maior' } },
      { t: 'p', html: 'Cada nota é um <strong>grau</strong> (1º a 7º). O 1º é a <strong>tônica</strong>, o 5º a <strong>dominante</strong>, o 4º a <strong>subdominante</strong>, o 7º a <strong>sensível</strong>.' },
      { t: 'praticar', tipo: 'escala-identificar', nivel: 1 },
    ],
    refs: ['med', 'priolli'],
  },
  {
    slug: 'escalas-menores', titulo: 'As escalas menores e a relativa', nivel: 'iniciante', prereq: ['escala-maior'], termos: 'menor natural harmonica melodica relativa homonima',
    resumo: 'Natural, harmônica e melódica — e por que lá menor é "parente" de dó maior.',
    blocos: [
      { t: 'p', html: 'A <strong>menor natural</strong> tem o desenho T S T T S T T. Lá menor natural usa as mesmas notas de dó maior, começando no lá: por isso lá menor é a <strong>relativa</strong> de dó maior (mesma armadura, tônica diferente).' },
      { t: 'visual', v: { tipo: 'escala', tonica: 'A3', escala: 'menor-natural' } },
      { t: 'p', html: 'A <strong>menor harmônica</strong> sobe o 7º grau (sol♯ em lá menor) para criar uma sensível — é ela que dá o acorde de mi maior, a dominante. O salto de tom e meio entre o 6º e o 7º grau é a sua marca.' },
      { t: 'visual', v: { tipo: 'escala', tonica: 'A3', escala: 'menor-harmonica' } },
      { t: 'p', html: 'A <strong>menor melódica</strong> sobe também o 6º grau, para suavizar esse salto. Na música tonal, ela costuma voltar à natural na descida; no jazz, usa-se a mesma escala nos dois sentidos. É uma convenção, e vale saber qual está em uso.' },
      { t: 'aprofundar', html: 'Menor não é "triste" por natureza. Andamento, registro, timbre e harmonia pesam tanto quanto a escala — e culturas diferentes ouvem o modo menor de jeitos diferentes.' },
      { t: 'praticar', tipo: 'escala-identificar', nivel: 3 },
    ],
    refs: ['med', 'kostka'],
  },
  {
    slug: 'armaduras', titulo: 'Armaduras e o círculo de quintas', nivel: 'intermediário', prereq: ['escala-maior'], termos: 'armadura ordem dos sustenidos bemois circulo de quintas',
    resumo: 'A ordem dos sustenidos e dos bemóis, e como achar o tom pela armadura.',
    blocos: [
      { t: 'p', html: 'A <strong>armadura</strong> reúne, no início da pauta, os acidentes que a escala do tom exige. A ordem é sempre a mesma: sustenidos <strong>fá dó sol ré lá mi si</strong>; bemóis na ordem inversa, <strong>si mi lá ré sol dó fá</strong>.' },
      { t: 'visual', v: { tipo: 'pauta', clave: 'sol', armadura: 4, notas: [] } },
      { t: 'p', html: 'Para achar o tom maior: com sustenidos, o último é a sensível — a tônica fica meio tom acima. Com bemóis, o penúltimo é a tônica (um bemol só é fá maior). A relativa menor fica uma terça menor abaixo.' },
      { t: 'visual', v: { tipo: 'circulo-quintas' } },
      { t: 'p', html: 'No <strong>círculo de quintas</strong>, cada passo no sentido horário sobe uma quinta e acrescenta um sustenido; no anti-horário, desce uma quinta e acrescenta um bemol. Tons vizinhos no círculo dividem quase todas as notas — é para eles que a música costuma modular.' },
      { t: 'ferramenta', slug: 'circulo-de-quintas' },
      { t: 'praticar', tipo: 'armadura-identificar', nivel: 1 },
    ],
    refs: ['med', 'omt'],
  },
  {
    slug: 'triades', titulo: 'Tríades e inversões', nivel: 'intermediário', prereq: ['intervalos'], termos: 'triade acorde maior menor diminuto aumentado inversao baixo',
    resumo: 'Três notas em terças: maior, menor, diminuta e aumentada.',
    blocos: [
      { t: 'p', html: 'Empilhe duas terças e você tem uma <strong>tríade</strong>: fundamental, terça e quinta. A qualidade das terças dá o tipo: <strong>maior</strong> (terça maior + terça menor), <strong>menor</strong> (menor + maior), <strong>diminuta</strong> (menor + menor) e <strong>aumentada</strong> (maior + maior).' },
      { t: 'visual', v: { tipo: 'acorde', fundamental: 'C4', acorde: 'maior' } },
      { t: 'visual', v: { tipo: 'acorde', fundamental: 'C4', acorde: 'menor' } },
      { t: 'ouvir', rotulo: 'Ouça as quatro tríades de dó', midis: [[60, 64, 67], [60, 63, 67], [60, 63, 66], [60, 64, 68]], modo: 'harmonico' },
      { t: 'p', html: 'Com a terça no baixo, o acorde está em <strong>primeira inversão</strong>; com a quinta, em <strong>segunda inversão</strong>. A cifra mostra o baixo depois da barra: <strong>C/E</strong> é dó maior com mi no baixo.' },
      { t: 'ferramenta', slug: 'identificar-acorde' },
      { t: 'praticar', tipo: 'acorde-identificar', nivel: 1 },
    ],
    refs: ['med', 'kostka'],
  },
  {
    slug: 'campo-harmonico', titulo: 'Campo harmônico e funções', nivel: 'intermediário', prereq: ['triades', 'escala-maior'], termos: 'campo harmonico graus funcoes tonica subdominante dominante cadencia romanos',
    resumo: 'Os acordes de cada grau, os algarismos romanos e as três funções.',
    blocos: [
      { t: 'p', html: 'Empilhando terças <strong>só com as notas da escala</strong> sobre cada grau, nasce o <strong>campo harmônico</strong>. Em qualquer tom maior o resultado tem o mesmo desenho: <strong>I ii iii IV V vi vii°</strong> — maiúsculo para acorde maior, minúsculo para menor, ° para diminuto.' },
      { t: 'visual', v: { tipo: 'campo', tonica: 'C', modo: 'maior' } },
      { t: 'p', html: 'Os graus se agrupam em três <strong>funções</strong>: <strong>tônica</strong> (repouso: I, vi, iii), <strong>subdominante</strong> (afastamento: IV, ii) e <strong>dominante</strong> (tensão que pede a tônica: V, vii°). É uma simplificação útil — o contexto pode mudar a leitura de um acorde.' },
      { t: 'p', html: 'Duas funções seguidas no fim de uma frase formam uma <strong>cadência</strong>: V–I é a perfeita (ponto final); IV–I a plagal; terminar no V é a meia cadência (vírgula); V–vi é a interrompida (surpresa).' },
      { t: 'ferramenta', slug: 'progressoes' },
      { t: 'praticar', tipo: 'campo-grau', nivel: 1 },
    ],
    refs: ['kostka', 'schoenberg'],
  },
  {
    slug: 'tetrades', titulo: 'Tétrades e extensões', nivel: 'intermediário', prereq: ['campo-harmonico'], termos: 'tetrade setima 7M m7 7 meio diminuto diminuto nona decima primeira decima terceira',
    resumo: 'Com a sétima, o acorde ganha cor — e o campo harmônico ganha nomes novos.',
    blocos: [
      { t: 'p', html: 'Mais uma terça sobre a tríade e temos uma <strong>tétrade</strong> (acorde com sétima). As cinco mais comuns: <strong>7M</strong> (maior com sétima maior), <strong>7</strong> (dominante), <strong>m7</strong>, <strong>m7(b5)</strong> (meio-diminuto) e <strong>°7</strong> (diminuto).' },
      { t: 'visual', v: { tipo: 'acorde', fundamental: 'G3', acorde: '7' } },
      { t: 'p', html: 'No campo harmônico maior com tétrades: <strong>I7M ii7 iii7 IV7M V7 vi7 viiø</strong>. O único acorde dominante (7) é o do 5º grau — por isso "sétima" sem qualificação lembra tanto a dominante.' },
      { t: 'visual', v: { tipo: 'campo', tonica: 'C', modo: 'maior', tetrades: true } },
      { t: 'p', html: 'Acima da sétima vêm as <strong>extensões</strong>: 9ª, 11ª e 13ª (as mesmas notas da 2ª, 4ª e 6ª, uma oitava acima). Na cifra brasileira elas vão entre parênteses: G7(9), Dm7(11), G7(b13).' },
      { t: 'aprofundar', html: '⚠️ "C9" é ambíguo: em muitos songbooks brasileiros significa dó com nona adicionada (sem sétima). O Musique segue a convenção internacional — <strong>C9 = C7(9)</strong> — e escreve <strong>C(9)</strong> para a nona sem sétima.' },
      { t: 'praticar', tipo: 'acorde-identificar', nivel: 3 },
    ],
    refs: ['kostka'],
  },
  {
    slug: 'modos', titulo: 'Os sete modos', nivel: 'intermediário', prereq: ['escala-maior', 'escalas-menores'], termos: 'modos gregos jonio dorico frigio lidio mixolidio eolio locrio',
    resumo: 'As mesmas notas, outra tônica: jônio, dórico, frígio, lídio, mixolídio, eólio e lócrio.',
    blocos: [
      { t: 'p', html: 'Toque as notas de dó maior começando em ré e parando em ré: é o <strong>ré dórico</strong>. Cada grau da escala maior gera um <strong>modo</strong>, e cada modo tem uma cor própria porque a posição dos semitons muda em relação à tônica.' },
      { t: 'visual', v: { tipo: 'escala', tonica: 'D4', escala: 'dorico' } },
      { t: 'lista', itens: ['<strong>jônio</strong> = a escala maior', '<strong>dórico</strong>: menor com 6ª maior', '<strong>frígio</strong>: menor com 2ª menor', '<strong>lídio</strong>: maior com 4ª aumentada', '<strong>mixolídio</strong>: maior com 7ª menor', '<strong>eólio</strong> = menor natural', '<strong>lócrio</strong>: 2ª menor e 5ª diminuta'] },
      { t: 'p', html: 'Pensar no modo pela <strong>diferença</strong> para o maior ou o menor ajuda mais do que decorar de onde ele "vem": mixolídio é "maior com sétima menor" — o som do rock e do baião.' },
      { t: 'ferramenta', slug: 'laboratorio' },
      { t: 'praticar', tipo: 'escala-identificar', nivel: 2 },
    ],
    refs: ['omt'],
  },
  {
    slug: 'acustica', titulo: 'Série harmônica e temperamento', nivel: 'avançado', prereq: ['intervalos'], termos: 'serie harmonica harmonicos temperamento igual afinacao justa cents batimento',
    resumo: 'Os harmônicos que moram em cada nota e por que o piano "desafina" de propósito.',
    blocos: [
      { t: 'p', html: 'Uma corda vibra inteira, e também em metades, terços, quartos… Cada divisão soa uma frequência múltipla da fundamental: é a <strong>série harmônica</strong>. Os primeiros harmônicos formam oitava, quinta, oitava, terça maior — o acorde maior "mora" dentro de uma nota só.' },
      { t: 'visual', v: { tipo: 'serie', fundamental: 'C2' } },
      { t: 'p', html: 'O piano não usa essas razões puras. No <strong>temperamento igual</strong>, a oitava é dividida em 12 semitons idênticos: assim todos os tons funcionam igual, ao preço de terças um pouco "abertas" (a terça maior temperada tem 400 cents; a justa, cerca de 386). A diferença se ouve como <strong>batimento</strong>.' },
      { t: 'ferramenta', slug: 'batimentos' },
      { t: 'aprofundar', html: 'Veja a <a href="/music/referencia/temperamento">tabela completa</a> de temperamento igual × afinação justa, em cents.' },
    ],
    refs: ['omt'],
  },
  // ------------------------------------------------------------------
  // Aprofundamento
  // ------------------------------------------------------------------
  {
    slug: 'articulacao-e-dinamica', titulo: 'Articulação e dinâmica', nivel: 'intermediário', prereq: ['figuras-e-pausas'], termos: 'staccato legato acento tenuto fermata ligadura de expressao piano forte crescendo diminuendo',
    resumo: 'Como a nota é atacada e ligada, e o quão forte ela soa: o que a partitura diz além da altura e da duração.',
    blocos: [
      { t: 'p', html: 'A <strong>articulação</strong> diz COMO a nota começa e termina. <strong>Legato</strong> (ligado): uma nota emenda na outra, sem espaço. <strong>Staccato</strong> (ponto sobre a nota): curta e destacada — a duração escrita inclui o silêncio. <strong>Tenuto</strong> (traço): segurar o valor inteiro. <strong>Acento</strong> (>): ataque mais forte. <strong>Fermata</strong> (𝄐): segurar o quanto o intérprete quiser.' },
      { t: 'ouvir', rotulo: 'A mesma melodia em legato', midis: [60, 62, 64, 65, 67], dur: 0.5 },
      { t: 'ouvir', rotulo: 'E em staccato', midis: [60, 62, 64, 65, 67], dur: 0.14, passo: 0.5 },
      { t: 'p', html: 'A <strong>ligadura de expressão</strong> (curva sobre notas diferentes) pede legato; não confunda com a <strong>ligadura de valor</strong> (sobre notas iguais), que soma a duração.' },
      { t: 'p', html: 'A <strong>dinâmica</strong> é a intensidade. Do mais fraco ao mais forte: <strong>pp</strong> (pianíssimo), <strong>p</strong> (piano), <strong>mp</strong> (meio-piano), <strong>mf</strong> (meio-forte), <strong>f</strong> (forte), <strong>ff</strong> (fortíssimo). <strong>Crescendo</strong> (&lt;) e <strong>diminuendo</strong> (&gt;) mudam aos poucos. São relativas: o <strong>f</strong> de um violão solo não é o de uma orquestra.' },
      { t: 'ouvir', rotulo: 'Piano (fraco)', midis: [60, 64, 67], vel: 0.07 },
      { t: 'ouvir', rotulo: 'Forte', midis: [60, 64, 67], vel: 0.32 },
      { t: 'aprofundar', html: 'Sinais de dinâmica e articulação vêm do italiano, e toda a terminologia está no <a href="/music/referencia/glossario">glossário</a> com o equivalente em inglês.' },
    ],
    refs: ['med'],
  },
  {
    slug: 'harmonia-popular', titulo: 'Harmonia popular: MPB, blues e jazz', nivel: 'avançado', prereq: ['tetrades'], termos: 'harmonia popular jazz blues bossa ii v i turnaround substituto tritonal dominante secundaria',
    resumo: 'Tétrades como padrão, o ii–V–I, o blues de 12 compassos, o turnaround e a substituição por trítono.',
    blocos: [
      { t: 'p', html: 'Na música popular brasileira e no jazz, a <strong>tétrade é o acorde básico</strong>: tríade soa "incompleta". O movimento mais comum é o <strong>ii–V–I</strong>: preparação (ii7), tensão (V7) e resolução (I7M).' },
      { t: 'visual', v: { tipo: 'progressao', simbolos: ['Dm7', 'G7', 'C7M'], graus: ['ii7', 'V7', 'I7M'], legenda: 'ii–V–I em dó maior.' } },
      { t: 'p', html: 'O <strong>turnaround</strong> volta ao começo: <strong>I–vi–ii–V</strong> (C7M–A7–Dm7–G7). O A7 no lugar do Am7 é uma <strong>dominante secundária</strong> (V7 do ii): um acorde de fora que aponta para o seguinte.' },
      { t: 'visual', v: { tipo: 'progressao', simbolos: ['C7M', 'A7', 'Dm7', 'G7', 'C7M'], graus: ['I7M', 'V7/ii', 'ii7', 'V7', 'I7M'] } },
      { t: 'p', html: 'O <strong>blues de 12 compassos</strong> usa três acordes, todos com sétima menor — inclusive o I, o que a teoria clássica chamaria de dominante: <strong>I7 I7 I7 I7 · IV7 IV7 I7 I7 · V7 IV7 I7 V7</strong>.' },
      { t: 'visual', v: { tipo: 'progressao', simbolos: ['C7', 'F7', 'C7', 'G7', 'F7', 'C7'], graus: ['I7', 'IV7', 'I7', 'V7', 'IV7', 'I7'], legenda: 'O esqueleto do blues em dó.' } },
      { t: 'p', html: 'A <strong>substituição por trítono</strong> troca o V7 pelo acorde de sétima meio-oitava acima (a um trítono): G7 → D♭7. Os dois têm o mesmo trítono (si e fá, escrito dó♭ em D♭7), e o baixo passa a descer por semitom: Dm7–D♭7–C7M.' },
      { t: 'visual', v: { tipo: 'progressao', simbolos: ['Dm7', 'Db7', 'C7M'], graus: ['ii7', 'subV7', 'I7M'] } },
      { t: 'aprofundar', html: 'Na bossa nova e no samba-canção, extensões (9ª, 11ª, 13ª) e baixos alternativos são a regra. Monte e ouça no <a href="/music/criar/progressoes">laboratório de progressões</a> com as sétimas ligadas.' },
      { t: 'praticar', tipo: 'campo-grau', nivel: 2 },
    ],
    refs: ['kostka'],
  },
  {
    slug: 'emprestimo-e-modulacao', titulo: 'Empréstimo modal, modulação, napolitano e sexta aumentada', nivel: 'avançado', prereq: ['campo-harmonico', 'escalas-menores'], termos: 'emprestimo modal modulacao acorde pivo napolitano sexta aumentada italiana francesa alema cromatismo',
    resumo: 'Acordes vindos de fora do campo: o que eles emprestam, para onde levam e como se escrevem.',
    blocos: [
      { t: 'p', html: '<strong>Empréstimo modal</strong>: usar num tom maior acordes do tom <em>homônimo</em> menor (mesma tônica). Em dó maior, os mais comuns são <strong>Fm</strong> (iv), <strong>A♭</strong> (♭VI) e <strong>B♭</strong> (♭VII). Eles escurecem a cor sem mudar o centro.' },
      { t: 'visual', v: { tipo: 'progressao', simbolos: ['C', 'F', 'Fm', 'C'], graus: ['I', 'IV', 'iv', 'I'], legenda: 'O iv emprestado do dó menor.' } },
      { t: 'visual', v: { tipo: 'progressao', simbolos: ['C', 'Ab', 'Bb', 'C'], graus: ['I', '♭VI', '♭VII', 'I'] } },
      { t: 'p', html: '<strong>Modulação</strong>: mudar de tonalidade. O caminho mais suave é o <strong>acorde pivô</strong>, que pertence aos dois tons: Am é vi em dó e ii em sol — depois dele, a dominante do novo tom (D7) confirma a chegada.' },
      { t: 'visual', v: { tipo: 'progressao', simbolos: ['C', 'Am', 'D7', 'G'], graus: ['I (dó)', 'vi = ii', 'V7 (sol)', 'I (sol)'], legenda: 'Modulação de dó para sol pelo pivô Am.' } },
      { t: 'p', html: 'O <strong>acorde napolitano</strong> é o ♭II maior, quase sempre em primeira inversão (por isso "sexta napolitana"). Em lá menor: B♭/D, que vai para a dominante E.' },
      { t: 'visual', v: { tipo: 'progressao', simbolos: ['Am', 'Bb/D', 'E', 'Am'], graus: ['i', 'N6', 'V', 'i'] } },
      { t: 'p', html: 'Os acordes de <strong>sexta aumentada</strong> têm o intervalo de 6ª aumentada entre o ♭6 e o ♯4, que se abrem em oitava sobre a dominante. Em dó: lá♭ e fá♯ indo para sol. A <strong>italiana</strong> tem três notas (lá♭–dó–fá♯); a <strong>francesa</strong> acrescenta ré; a <strong>alemã</strong>, mi♭ — soando como um A♭7, mas escrita com fá♯, porque a função é outra.' },
      { t: 'ouvir', rotulo: 'Sexta aumentada italiana → dominante', midis: [[56, 60, 66], [55, 59, 62, 67]] },
      { t: 'aprofundar', html: 'Aqui a enarmonia vira ferramenta: a sexta alemã e o dominante com sétima soam igual e resolvem para lados diferentes. A <a href="/music/referencia/enarmonia">referência de enarmonia</a> mostra por que a grafia importa.' },
    ],
    refs: ['kostka', 'schoenberg'],
  },
  {
    slug: 'notas-fora-da-harmonia', titulo: 'Notas fora da harmonia', nivel: 'avançado', prereq: ['triades'], termos: 'notas nao harmonicas nota de passagem bordadura apojatura retardo antecipacao escapada',
    resumo: 'Passagem, bordadura, apojatura, retardo e antecipação: as notas da melodia que não estão no acorde — e por que soam bem.',
    blocos: [
      { t: 'p', html: 'Nem toda nota da melodia pertence ao acorde que soa. As <strong>notas fora da harmonia</strong> (não harmônicas) se reconhecem por COMO chegam e COMO saem.' },
      { t: 'lista', itens: ['<strong>Passagem</strong>: liga duas notas do acorde por grau conjunto, na mesma direção (dó–<em>ré</em>–mi sobre C).', '<strong>Bordadura</strong>: sai de uma nota do acorde e volta a ela (mi–<em>fá</em>–mi).', '<strong>Apojatura</strong>: chega por salto, no tempo forte, e resolve por grau (dissonância acentuada).', '<strong>Retardo</strong>: a nota do acorde anterior é mantida por cima do acorde novo e só depois desce (o 4–3 do sus4).', '<strong>Antecipação</strong>: a nota do próximo acorde chega um pouco antes dele.', '<strong>Escapada</strong>: sai por grau e deixa por salto, no sentido contrário.'] },
      { t: 'visual', v: { tipo: 'vozes', colunas: [['C3', 'E4'], ['C3', 'F4'], ['C3', 'G4'], ['C3', 'C5'], ['G2', 'C5'], ['G2', 'B4'], ['C3', 'C5']], legenda: 'Passagem (fá entre mi e sol, sobre dó) e retardo (dó segurado sobre o sol, resolvendo em si).' } },
      { t: 'visual', v: { tipo: 'progressao', simbolos: ['Csus4', 'C'], graus: ['4–3', ''], legenda: 'O retardo 4–3 é o sus4 que resolve.' } },
      { t: 'aprofundar', html: 'Classificar a nota pelo movimento (e não só pelo acorde) é o que permite analisar melodias reais: a mesma nota fá pode ser passagem num compasso e retardo no outro.' },
    ],
    refs: ['kostka'],
  },
  {
    slug: 'frase-e-forma', titulo: 'Motivo, frase e forma', nivel: 'avançado', prereq: ['campo-harmonico'], termos: 'motivo frase periodo antecedente consequente forma binaria ternaria rondo verso refrao ponte',
    resumo: 'Do motivo à música inteira: frase, período, forma binária, ternária, rondó e a canção popular.',
    blocos: [
      { t: 'p', html: 'O <strong>motivo</strong> é a menor ideia reconhecível: duas a cinco notas com um ritmo próprio. Ele se repete, é transposto, invertido, alongado — é assim que uma música "fala" de si mesma.' },
      { t: 'ferramenta', slug: 'motivos' },
      { t: 'p', html: 'A <strong>frase</strong> é uma unidade que termina numa cadência (em geral 4 compassos). Duas frases que se respondem formam um <strong>período</strong>: a primeira (<strong>antecedente</strong>) termina suspensa, na dominante; a segunda (<strong>consequente</strong>) repete o começo e fecha na tônica.' },
      { t: 'visual', v: { tipo: 'progressao', simbolos: ['C', 'F', 'G', 'C', 'F', 'G', 'C'], graus: ['antecedente…', '', '(meia cadência)', 'consequente…', '', '', '(perfeita)'] } },
      { t: 'lista', itens: ['<strong>Binária (AB)</strong>: duas partes contrastantes.', '<strong>Ternária (ABA)</strong>: sai e volta — o retorno dá a sensação de fechamento.', '<strong>Rondó (ABACA…)</strong>: um refrão que volta entre episódios.', '<strong>Canção popular</strong>: introdução, verso, pré-refrão, refrão, ponte e final — o refrão concentra o gancho.', '<strong>Blues de 12 compassos</strong>: a forma é a própria progressão, repetida em "voltas".'] },
      { t: 'aprofundar', html: 'Para analisar a forma, marque onde a harmonia faz cadência e onde a melodia repete: as seções quase sempre começam logo depois de uma cadência.' },
    ],
    refs: ['omt'],
  },
  {
    slug: 'contraponto', titulo: 'Contraponto: duas vozes independentes', nivel: 'avançado', prereq: ['intervalos'], termos: 'contraponto especies cantus firmus movimento contrario paralelo quintas oitavas paralelas',
    resumo: 'As espécies do contraponto e as regras de primeira espécie: consonâncias, movimento e as quintas e oitavas paralelas.',
    blocos: [
      { t: 'p', html: '<strong>Contraponto</strong> é escrever vozes que soam bem juntas e continuam independentes. O método tradicional (as <strong>espécies</strong>) parte de uma melodia dada, o <em>cantus firmus</em>, e acrescenta uma voz com regras que se soltam aos poucos.' },
      { t: 'lista', itens: ['<strong>1ª espécie</strong>: nota contra nota, só consonâncias.', '<strong>2ª</strong>: duas notas contra uma (a segunda pode ser passagem).', '<strong>3ª</strong>: quatro contra uma.', '<strong>4ª</strong>: síncopes e retardos.', '<strong>5ª</strong>: florida — mistura as anteriores.'] },
      { t: 'p', html: 'Regras da 1ª espécie: começar e terminar em consonância perfeita (uníssono, 5ª ou 8ª); no meio, preferir as imperfeitas (3ªs e 6ªs); preferir <strong>movimento contrário</strong>; e nunca <strong>quintas ou oitavas paralelas</strong> — duas vozes que andam juntas em 5ª ou 8ª justas se fundem e deixam de ser duas.' },
      { t: 'visual', v: { tipo: 'vozes', colunas: [['C4', 'C5'], ['D4', 'B4'], ['F4', 'A4'], ['E4', 'G4'], ['D4', 'B4'], ['C4', 'C5']], legenda: 'Um exemplo de 1ª espécie: começa e termina na oitava, movimento contrário, 3ªs e 6ªs no meio.' } },
      { t: 'ouvir', rotulo: 'Quintas paralelas (evitadas)', midis: [[60, 67], [62, 69], [64, 71]] },
      { t: 'aprofundar', html: 'A proibição das paralelas é de estilo (contraponto e coral tonal). No rock, o power chord é justamente quintas paralelas — outro estilo, outra regra.' },
    ],
    refs: ['omt', 'schoenberg'],
  },
  {
    slug: 'baixo-cifrado', titulo: 'Baixo cifrado', nivel: 'avançado', prereq: ['triades', 'tetrades'], termos: 'baixo cifrado baixo continuo figuras 6 6/4 7 6/5 4/3 4/2 inversao',
    resumo: 'Os números sob o baixo que dizem o acorde e a inversão: 6, 6/4, 7, 6/5, 4/3 e 4/2.',
    blocos: [
      { t: 'p', html: 'No barroco, o tecladista lia só a linha do baixo e uns números: o <strong>baixo cifrado</strong> (ou contínuo). Os números são os intervalos acima do baixo — e dizem a inversão sem nomear o acorde.' },
      { t: 'lista', itens: ['<strong>(nada)</strong> ou 5/3: posição fundamental.', '<strong>6</strong> (6/3): primeira inversão.', '<strong>6/4</strong>: segunda inversão.', '<strong>7</strong>: tétrade em fundamental.', '<strong>6/5</strong>: tétrade em 1ª inversão.', '<strong>4/3</strong>: tétrade em 2ª inversão.', '<strong>4/2</strong> (ou 2): tétrade em 3ª inversão.'] },
      { t: 'visual', v: { tipo: 'vozes', clave: 'fa', colunas: [['C3', 'E3', 'G3'], ['E3', 'G3', 'C4'], ['G2', 'C3', 'E3']], legenda: 'Dó maior: fundamental (5/3), 6 e 6/4.' } },
      { t: 'p', html: 'Um acidente sozinho (♯ ou ♭) altera a terça acima do baixo; ao lado de um número, altera aquele intervalo. Na cifra popular, a mesma informação vira a barra: C/E = C com 6; C/G = C com 6/4.' },
      { t: 'praticar', tipo: 'acorde-identificar', nivel: 2 },
    ],
    refs: ['kostka'],
  },
  {
    slug: 'doze-sons', titulo: 'Música de doze sons (serialismo)', nivel: 'avançado', prereq: ['intervalos'], termos: 'dodecafonismo serialismo serie matriz original inversao retrogrado schoenberg classes de altura',
    resumo: 'A série de 12 sons, suas quatro formas (original, inversão, retrógrado e retrógrado da inversão) e a matriz.',
    blocos: [
      { t: 'p', html: 'No começo do século XX, compositores como Arnold Schoenberg buscaram uma organização sem centro tonal. No <strong>dodecafonismo</strong>, as 12 classes de altura são postas numa ordem — a <strong>série</strong> — e nenhuma se repete antes que as outras 11 apareçam.' },
      { t: 'p', html: 'A série tem quatro formas: <strong>original (P)</strong>, <strong>inversão (I)</strong> — cada intervalo ao contrário —, <strong>retrógrado (R)</strong> — de trás para frente — e <strong>retrógrado da inversão (RI)</strong>. Cada uma pode começar em qualquer das 12 notas: 48 formas, todas numa <strong>matriz</strong> 12×12.' },
      { t: 'ouvir', rotulo: 'Ouça uma série de 12 sons', midis: [60, 71, 67, 68, 63, 61, 62, 70, 66, 65, 64, 69], dur: 0.4 },
      { t: 'ferramenta', slug: 'serie-dodecafonica' },
      { t: 'p', html: 'As notas se contam como <strong>classes de altura</strong> (0 a 11, dó = 0), sem oitava e sem grafia — aqui, e só aqui, dó♯ e ré♭ são de fato a mesma coisa.' },
      { t: 'aprofundar', html: 'Veja as formas de conjuntos no <a href="/music/explorar/circulo-cromatico">relógio cromático</a>: simetrias e transposições ficam visíveis.' },
    ],
    refs: ['omt', 'schoenberg'],
  },
  {
    slug: 'ouvido-absoluto', titulo: 'Ouvido absoluto e ouvido relativo', nivel: 'intermediário', prereq: ['intervalos'], termos: 'ouvido absoluto ouvido relativo percepcao treino',
    resumo: 'O que é ouvido absoluto, por que é raro e por que o relativo é o que todo músico pode (e deve) treinar.',
    blocos: [
      { t: 'p', html: '<strong>Ouvido absoluto</strong> é nomear uma nota ouvida sem referência (“isso é um lá♭”). É raro e, pelo que a pesquisa mostra, associado a treino musical muito cedo na infância. O Musique não promete desenvolvê-lo em adultos.' },
      { t: 'p', html: '<strong>Ouvido relativo</strong> é reconhecer as <em>relações</em>: o intervalo entre duas notas, a qualidade de um acorde, o grau de uma nota no tom. É treinável em qualquer idade — e é o que faz o músico tirar uma música de ouvido, afinar com a banda e improvisar.' },
      { t: 'ouvir', rotulo: 'Referência: lá4 (440 Hz)', midis: [69] },
      { t: 'p', html: 'Um bom treino combina as duas coisas possíveis: guardar uma referência (o lá do diapasão, a nota mais grave do seu instrumento) e medir tudo o mais por intervalos a partir dela.' },
      { t: 'praticar', tipo: 'intervalo-ouvido', nivel: 1 },
    ],
    refs: ['omt'],
  },
];

const POR_SLUG = Object.fromEntries(LICOES.map((l) => [l.slug, l]));

module.exports = { LICOES, POR_SLUG, AUTORIA, REFS };
