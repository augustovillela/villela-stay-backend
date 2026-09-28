// =====================================================================
// Musique · Laboratório — CATÁLOGO editorial e BUSCA (isomórfico).
//
// O catálogo diz O QUE existe e ONDE (URL); o núcleo diz o que é
// verdade musical. A busca entende o jeito que o músico digita —
// "dó sustenido", "C#", "3M", "G7(b9)", "campo harmônico de Ré",
// "harmonic minor" — e agrupa lição, ferramenta, exercício e referência
// do mesmo assunto.
//
// Nenhum texto aqui foi copiado de outro site: descrições originais,
// escritas para o Musique (ADR-0013).
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    var n = './nucleo/';
    module.exports = fabrica(require(n + 'notas'), require(n + 'intervalos'), require(n + 'escalas'), require(n + 'acordes'), require(n + 'tonalidades'), require(n + 'exercicios'));
  } else {
    var L = raiz.MusiqueLab = raiz.MusiqueLab || {};
    L.catalogo = fabrica(L.notas, L.intervalos, L.escalas, L.acordes, L.tonalidades, L.exercicios);
  }
})(typeof self !== 'undefined' ? self : this, function (N, I, E, A, T, X) {
  'use strict';

  // Os sete ambientes. `icone` é decorativo: o texto sempre acompanha.
  var AMBIENTES = [
    { id: 'aprender', nome: 'Aprender', icone: '📘', url: '/music/aprender', resumo: 'Lições curtas, na ordem certa, do som ao campo harmônico.' },
    { id: 'explorar', nome: 'Explorar', icone: '🔭', url: '/music/explorar', resumo: 'Piano, pauta, braços e círculos que mostram a mesma música ao mesmo tempo.' },
    { id: 'praticar', nome: 'Praticar', icone: '🎯', url: '/music/praticar', resumo: 'Exercícios de leitura, intervalos, acordes, escalas, ritmo e ouvido, com explicação do erro.' },
    { id: 'jogar', nome: 'Jogar', icone: '🎲', url: '/music/jogar', resumo: 'Desafios curtos contra o relógio, sem ranking público.' },
    { id: 'criar', nome: 'Criar', icone: '🎛️', url: '/music/criar', resumo: 'Piano virtual, batidas, sequenciador, progressões e ferramentas de estúdio de bolso.' },
    { id: 'consultar', nome: 'Consultar', icone: '📚', url: '/music/referencia', resumo: 'Fórmulas, tabelas, glossário e o atlas de escalas, acordes e tonalidades.' },
    { id: 'ensinar', nome: 'Ensinar', icone: '🧑‍🏫', url: '/music/ensinar', resumo: 'Para professores: monte, atribua e acompanhe atividades da turma.' },
  ];

  // Ferramentas (Explorar e Criar). `publico`: abre sem conta.
  var FERRAMENTAS = [
    { slug: 'laboratorio', ambiente: 'explorar', nome: 'Laboratório integrado', icone: '🧪', resumo: 'Tônica, escala e acorde num lugar só: piano, pauta, braço e círculo mudam juntos.', publico: true, termos: 'estudio integrado tudo junto' },
    { slug: 'piano', ambiente: 'explorar', nome: 'Piano e notas', icone: '🎹', resumo: 'Teclado com nomes, escalas e acordes marcados; toque e ouça.', publico: true, termos: 'teclado notas do piano' },
    { slug: 'pauta', ambiente: 'explorar', nome: 'Pauta e claves', icone: '🎼', resumo: 'Onde cada nota fica nas claves de sol, fá e dó — com a grafia certa.', publico: true, termos: 'partitura clave de sol clave de fa clave de do grande pauta notas na pauta' },
    { slug: 'braco', ambiente: 'explorar', nome: 'Braço dos instrumentos', icone: '🎸', resumo: 'Violão, guitarra, baixo, ukulele e cavaquinho, com afinações e canhoto.', publico: true, termos: 'fretboard braco violao guitarra baixo ukulele cavaquinho afinacao drop d dadgad canhoto' },
    { slug: 'circulo-de-quintas', ambiente: 'explorar', nome: 'Círculo de quintas', icone: '⭕', resumo: 'Tonalidades, armaduras, relativas e vizinhas num só desenho.', publico: true, termos: 'circle of fifths circulo das quintas quartas armadura' },
    { slug: 'circulo-cromatico', ambiente: 'explorar', nome: 'Relógio cromático', icone: '🕛', resumo: 'As 12 classes de altura em círculo: a forma de cada escala e acorde.', publico: true, termos: 'relogio classes de altura pitch class cromatico conjuntos' },
    { slug: 'circulo-de-tercas', ambiente: 'explorar', nome: 'Cadeia de terças', icone: '🔗', resumo: 'Tons maiores e menores ligados por terças: cada passo divide duas notas.', publico: true, termos: 'circulo de tercas thirds' },
    { slug: 'identificar-acorde', ambiente: 'explorar', nome: 'Identificador de acordes', icone: '🔎', resumo: 'Marque as notas e veja todos os nomes possíveis, com inversão.', publico: true, termos: 'chord finder qual acorde e este nome do acorde' },
    { slug: 'identificar-escala', ambiente: 'explorar', nome: 'Identificador de escalas', icone: '🧭', resumo: 'Marque as notas e veja em quais escalas elas cabem.', publico: true, termos: 'scale finder qual escala' },
    { slug: 'serie-harmonica', ambiente: 'explorar', nome: 'Série harmônica', icone: '〰️', resumo: 'Os harmônicos de uma nota, ouvidos um a um, e o quanto desafinam do piano.', publico: true, termos: 'harmonicos overtone series timbre' },
    { slug: 'onda', ambiente: 'explorar', nome: 'Forma de onda e espectro', icone: '📈', resumo: 'Veja o som: frequência, amplitude e harmônicos de quatro timbres básicos.', publico: true, termos: 'onda espectro frequencia amplitude senoide timbre' },
    { slug: 'piano-virtual', ambiente: 'criar', nome: 'Piano virtual', icone: '🎹', resumo: 'Toque com o mouse, o toque ou o teclado do computador (MIDI opcional).', publico: true, termos: 'tocar piano online teclado do computador midi' },
    { slug: 'transpositor', ambiente: 'criar', nome: 'Transpositor de acordes', icone: '🔁', resumo: 'Cole uma progressão e mude de tom com a grafia do tom de destino.', publico: true, termos: 'transpor mudar de tom capotraste cifra' },
    { slug: 'bpm', ambiente: 'criar', nome: 'BPM por toque', icone: '👆', resumo: 'Toque no ritmo e descubra o andamento; veja o quanto você oscila.', publico: true, termos: 'tap tempo contador de bpm andamento' },
    { slug: 'bpm-ms', ambiente: 'criar', nome: 'BPM ↔ milissegundos', icone: '⏲️', resumo: 'Duração de cada figura num andamento — para delay, reverb e sequenciadores.', publico: true, termos: 'calculadora bpm ms delay tempo em milissegundos' },
    { slug: 'batidas', ambiente: 'criar', nome: 'Fazedor de batidas', icone: '🥁', resumo: 'Grade de 16 passos com bumbo, caixa, chimbal e palma, swing e padrões prontos.', publico: true, termos: 'beat maker bateria drum machine padroes de bateria groove' },
    { slug: 'sequenciador', ambiente: 'criar', nome: 'Sequenciador melódico', icone: '🎚️', resumo: 'Monte uma melodia por passos, dentro da escala escolhida.', publico: true, termos: 'sequencer melodia passos step' },
    { slug: 'progressoes', ambiente: 'criar', nome: 'Laboratório de progressões', icone: '🎶', resumo: 'Escolha o tom e os graus; ouça com condução de vozes e veja as funções.', publico: true, termos: 'progressao harmonica sequencia de acordes ii v i campo harmonico' },
    { slug: 'arpejador', ambiente: 'criar', nome: 'Arpejador', icone: '🌊', resumo: 'Qualquer acorde em arpejo: subindo, descendo, alternado, em várias oitavas.', publico: true, termos: 'arpejo arpeggiator' },
    { slug: 'polirritmos', ambiente: 'criar', nome: 'Polirritmos e rudimentos', icone: '🔀', resumo: '3 contra 2, 4 contra 3 e os rudimentos de caixa, tocados e desenhados.', publico: true, termos: 'polirritmo paradiddle rudimentos subdivisao' },
    { slug: 'batimentos', ambiente: 'criar', nome: 'Batimentos e ruído', icone: '🔊', resumo: 'Duas frequências próximas "batem": ouça a afinação acontecer. Com volume seguro.', publico: true, termos: 'gerador de ruido batimento afinacao ruido branco rosa' },
  ];

  // Referências (Consultar).
  var REFERENCIAS = [
    { slug: 'cheat-sheet', nome: 'Resumo de teoria (cheat sheet)', icone: '🗒️', resumo: 'O essencial numa página: notas, intervalos, escalas, acordes, armaduras.', termos: 'resumo cola teoria musical' },
    { slug: 'glossario', nome: 'Glossário (português ↔ inglês)', icone: '📖', resumo: 'Os termos com definição curta e o equivalente em inglês.', termos: 'glossario dicionario termos ingles' },
    { slug: 'pauta-e-claves', nome: 'Pauta, claves e grande pauta', icone: '🎼', resumo: 'Linhas, espaços, suplementares e as claves de sol, fá e dó.', termos: 'pauta clave grande pauta linhas suplementares' },
    { slug: 'figuras-e-compassos', nome: 'Figuras, pausas e compassos', icone: '𝅘𝅥', resumo: 'Da semibreve à semifusa, ponto, quiálteras e fórmulas de compasso.', termos: 'figuras ritmicas pausas compasso 4/4 6/8 ponto de aumento quialtera tercina' },
    { slug: 'intervalos', nome: 'Tabela de intervalos', icone: '↕️', resumo: 'Número, qualidade, semitons, inversão e nome em inglês.', termos: 'tabela de intervalos' },
    { slug: 'formulas-de-escalas', nome: 'Fórmulas de escalas', icone: '📐', resumo: 'Todas as escalas do atlas com fórmula, passos e família.', termos: 'formulas escalas modos' },
    { slug: 'formulas-de-acordes', nome: 'Fórmulas de acordes', icone: '🧮', resumo: 'Tríades, tétrades e extensões com símbolos aceitos.', termos: 'formulas acordes cifras simbolos' },
    { slug: 'armaduras', nome: 'Armaduras e ordem dos acidentes', icone: '♯', resumo: 'Quantos sustenidos ou bemóis tem cada tom, e em que ordem.', termos: 'armadura de clave ordem dos sustenidos bemois' },
    { slug: 'tonalidades', nome: 'Todas as tonalidades', icone: '🗝️', resumo: 'As 30 tonalidades usuais, com campo harmônico e relativas.', termos: 'tonalidades tons maiores menores' },
    { slug: 'graus-e-funcoes', nome: 'Graus, funções e algarismos romanos', icone: 'Ⅴ', resumo: 'Tônica, subdominante e dominante; como ler I–IV–V.', termos: 'graus funcoes harmonicas algarismos romanos tonica dominante subdominante' },
    { slug: 'cadencias-e-progressoes', nome: 'Cadências e progressões comuns', icone: '🔚', resumo: 'Perfeita, plagal, meia, interrompida e os padrões mais usados.', termos: 'cadencia progressoes comuns' },
    { slug: 'enarmonia', nome: 'Enarmonia', icone: '🟰', resumo: 'Mesma tecla, nomes diferentes — e por que a diferença importa.', termos: 'enarmonicos equivalentes enarmonia' },
    { slug: 'afinacoes', nome: 'Afinações de cordas', icone: '🎸', resumo: 'Violão, guitarra, baixo, ukulele e cavaquinho: padrão e alternativas.', termos: 'afinacoes drop d dadgad open g ukulele cavaquinho baixo' },
    { slug: 'extensoes', nome: 'Extensão dos instrumentos e vozes', icone: '📏', resumo: 'Da nota mais grave à mais aguda; transpositores explicados.', termos: 'extensao instrumentos transpositores tessitura vozes' },
    { slug: 'frequencias', nome: 'Frequência das notas', icone: '🔢', resumo: 'Hz de cada nota com lá4 = 440 Hz (ou outra referência).', termos: 'frequencia das notas hz tabela' },
    { slug: 'temperamento', nome: 'Temperamento igual × afinação justa', icone: '⚖️', resumo: 'Por que a terça do piano é "desafinada" de propósito.', termos: 'temperamento igual afinacao justa cents' },
    { slug: 'ritmo-e-groove', nome: 'Síncope, swing, shuffle e subdivisões', icone: '💃', resumo: 'Onde o ritmo sai do tempo — e volta.', termos: 'sincope contratempo swing shuffle groove subdivisao' },
  ];

  // Jogos = o motor de exercícios com regras de jogo.
  var JOGOS = [
    { slug: 'caca-a-nota', nome: 'Caça à nota', icone: '🎯', tipos: ['nota-na-pauta'], resumo: 'Quantas notas você lê em 60 segundos?' },
    { slug: 'teclado-relampago', nome: 'Teclado relâmpago', icone: '⚡', tipos: ['nota-no-teclado'], resumo: 'Ache a tecla antes do tempo acabar.' },
    { slug: 'mapa-do-braco', nome: 'Mapa do braço', icone: '🗺️', tipos: ['nota-no-braco'], resumo: 'Que nota é esta casa? Violão, baixo, ukulele ou cavaquinho.' },
    { slug: 'corrida-de-intervalos', nome: 'Corrida de intervalos', icone: '🏁', tipos: ['intervalo-identificar', 'intervalo-construir'], resumo: 'Leia e construa intervalos contra o relógio.' },
    { slug: 'detetive-de-acordes', nome: 'Detetive de acordes', icone: '🕵️', tipos: ['acorde-identificar'], resumo: 'Olhe as notas e diga o acorde.' },
    { slug: 'ouvido-relativo', nome: 'Ouvido relativo', icone: '👂', tipos: ['intervalo-ouvido', 'acorde-ouvido'], resumo: 'Só o som: intervalos e acordes de ouvido.' },
    { slug: 'monte-a-armadura', nome: 'Armaduras', icone: '♭', tipos: ['armadura-identificar'], resumo: 'Olhe a armadura e diga o tom.' },
    { slug: 'campo-relampago', nome: 'Campo harmônico relâmpago', icone: '🎹', tipos: ['campo-grau'], resumo: 'Qual o acorde do grau? Rápido.' },
    { slug: 'complete-o-compasso', nome: 'Complete o compasso', icone: '🧩', tipos: ['ritmo-completar'], resumo: 'Que figura fecha a conta?' },
    { slug: 'construtor-de-escalas', nome: 'Detetive de escalas', icone: '🪜', tipos: ['escala-identificar'], resumo: 'Qual é a escala? Maior, modos, harmônica…' },
    { slug: 'mantenha-o-pulso', nome: 'Mantenha o pulso', icone: '💓', tipos: [], especial: 'pulso', resumo: 'Toque junto do metrônomo; ele some e você continua. Mede o desvio em ms.' },
    { slug: 'desafio-diario', nome: 'Desafio do dia', icone: '📅', tipos: ['nota-na-pauta', 'intervalo-identificar', 'acorde-identificar', 'escala-identificar', 'campo-grau', 'ritmo-completar', 'nota-no-teclado'], diario: true, resumo: 'Dez questões iguais para todo mundo, hoje.' },
  ];

  // Glossário: termo, inglês, definição curta (original).
  var GLOSSARIO = [
    ['acidente', 'accidental', 'Sinal que altera a altura da nota: sustenido (♯) sobe meio tom, bemol (♭) desce, bequadro (♮) cancela.'],
    ['acorde', 'chord', 'Três ou mais notas diferentes soando juntas (ou em arpejo) e entendidas como uma unidade.'],
    ['andamento', 'tempo', 'A velocidade do pulso, medida em batidas por minuto (BPM).'],
    ['arpejo', 'arpeggio', 'Acorde tocado nota a nota, em vez de todas juntas.'],
    ['armadura de clave', 'key signature', 'Os sustenidos ou bemóis escritos no início da pauta, que valem para a peça inteira.'],
    ['bemol', 'flat', 'Acidente que abaixa a nota em meio tom (♭).'],
    ['cadência', 'cadence', 'Fórmula harmônica que fecha (ou suspende) uma frase.'],
    ['campo harmônico', 'diatonic chords', 'Os acordes que se formam empilhando terças sobre cada grau de uma escala.'],
    ['cifra', 'chord symbol', 'Símbolo de letras e números que nomeia um acorde (C, Am7, G7(9)).'],
    ['clave', 'clef', 'Sinal no início da pauta que fixa o nome de uma linha — e, com ela, de todas as outras.'],
    ['compasso', 'measure / bar', 'Grupo de tempos entre duas barras; a fórmula (4/4, 6/8) diz quantos e de que figura.'],
    ['consonância', 'consonance', 'Intervalo ou acorde percebido como estável no contexto (varia com a época e o estilo).'],
    ['contratempo', 'offbeat', 'Ataque na parte fraca do tempo, com o tempo forte em silêncio.'],
    ['dissonância', 'dissonance', 'Intervalo ou acorde percebido como instável, que pede resolução no contexto.'],
    ['dominante', 'dominant', 'O 5º grau e a função de tensão que "puxa" para a tônica.'],
    ['enarmonia', 'enharmonic equivalence', 'Duas grafias para o mesmo som no temperamento igual (dó♯ e ré♭).'],
    ['escala', 'scale', 'Conjunto ordenado de notas dentro de uma oitava, a partir de uma tônica.'],
    ['extensão', 'range', 'Da nota mais grave à mais aguda que um instrumento ou voz alcança.'],
    ['fermata', 'fermata', 'Sinal que suspende o tempo: a nota dura o quanto o intérprete decidir.'],
    ['figura', 'note value', 'O desenho da nota que indica a duração (semínima, colcheia…).'],
    ['frequência', 'frequency', 'Quantas vibrações por segundo (Hz) o som tem; o ouvido percebe como altura.'],
    ['fundamental', 'root / fundamental', 'A nota que dá nome ao acorde; na acústica, a frequência mais grave da série harmônica.'],
    ['grau', 'scale degree', 'A posição de uma nota na escala (1º, 2º… 7º), escrita também em algarismos romanos.'],
    ['harmônico', 'overtone / harmonic', 'Frequência múltipla da fundamental que soa junto com ela e define o timbre.'],
    ['intervalo', 'interval', 'A distância entre duas notas, com número (letras) e qualidade (semitons).'],
    ['inversão', 'inversion', 'Acorde com outra nota que não a fundamental no baixo; ou intervalo virado de cabeça para baixo.'],
    ['ligadura', 'tie / slur', 'De valor: soma a duração de notas iguais. De expressão: liga notas diferentes sem novo ataque.'],
    ['linha suplementar', 'ledger line', 'Linha curta acima ou abaixo da pauta para notas fora dela.'],
    ['meio tom', 'half step / semitone', 'A menor distância do teclado: de uma tecla para a vizinha.'],
    ['metrônomo', 'metronome', 'Aparelho que marca o pulso num andamento fixo.'],
    ['modo', 'mode', 'Escala obtida começando outra escala num grau diferente (ré dórico = notas de dó maior a partir de ré).'],
    ['modulação', 'modulation', 'Mudança de tonalidade dentro da peça.'],
    ['oitava', 'octave', 'Intervalo entre uma nota e a de frequência dobrada; recebe o mesmo nome.'],
    ['pauta', 'staff / stave', 'As cinco linhas e quatro espaços onde se escrevem as notas.'],
    ['pausa', 'rest', 'Figura de silêncio, com a mesma duração da nota correspondente.'],
    ['pentatônica', 'pentatonic', 'Escala de cinco notas, sem semitons na versão maior e menor comuns.'],
    ['ponto de aumento', 'dot', 'Ponto depois da figura que soma metade do valor dela.'],
    ['progressão', 'chord progression', 'Sequência de acordes.'],
    ['pulso', 'beat / pulse', 'A batida regular que se sente (e em que se bate o pé).'],
    ['quiáltera', 'tuplet', 'Grupo de figuras que ocupa o tempo de outro número delas (tercina: 3 no tempo de 2).'],
    ['relativa', 'relative key', 'Tonalidade com a mesma armadura: dó maior e lá menor.'],
    ['semitom', 'semitone', 'O mesmo que meio tom.'],
    ['sensível', 'leading tone', 'O 7º grau a meio tom da tônica, que pede para subir até ela.'],
    ['síncope', 'syncopation', 'Ataque em tempo fraco que se prolonga pelo forte, deslocando o acento.'],
    ['subdominante', 'subdominant', 'O 4º grau e a função de afastamento da tônica.'],
    ['sustenido', 'sharp', 'Acidente que sobe a nota em meio tom (♯).'],
    ['swing', 'swing', 'Colcheias tocadas desiguais (longa-curta), com acento no contratempo.'],
    ['temperamento igual', 'equal temperament', 'Afinação que divide a oitava em 12 semitons idênticos.'],
    ['tessitura', 'tessitura', 'A faixa em que uma voz ou instrumento soa confortável — menor que a extensão.'],
    ['timbre', 'timbre / tone color', 'A "cor" do som que distingue instrumentos na mesma nota; depende dos harmônicos e do envelope.'],
    ['tom (distância)', 'whole step', 'Dois semitons.'],
    ['tom (tonalidade)', 'key', 'A tonalidade: a escala e a tônica em torno das quais a música se organiza.'],
    ['tônica', 'tonic', 'O 1º grau: o centro de repouso da tonalidade.'],
    ['transposição', 'transposition', 'Mover tudo o mesmo intervalo, mantendo as relações.'],
    ['tríade', 'triad', 'Acorde de três notas empilhadas em terças.'],
    ['tétrade', 'seventh chord', 'Acorde de quatro notas empilhadas em terças (com sétima).'],
  ];

  function norm(s) { return N.semAcento(s).toLowerCase().replace(/[^\w#♯♭/()+°ø\s-]/g, ' ').replace(/\s+/g, ' ').trim(); }

  function urlEscala(t, id) { return '/music/escalas/' + N.slug(t) + '/' + id; }
  function urlAcorde(f, id) { return '/music/acordes/' + N.slug(f) + '/' + encodeURIComponent(id); }
  function urlTom(t, modo) { return '/music/tonalidades/' + T.slug(t, modo); }
  function urlIntervalo(iv) { return '/music/intervalos/' + iv.slug; }
  function urlNota(n) { return '/music/notas/' + N.slug(n); }

  /** Entradas textuais pesquisáveis (ferramentas, referências, jogos, práticas, glossário). */
  function entradas(licoes) {
    var out = [];
    FERRAMENTAS.forEach(function (f) { out.push({ grupo: f.ambiente === 'criar' ? 'Criar' : 'Explorar', titulo: f.nome, url: '/music/' + f.ambiente + '/' + f.slug, resumo: f.resumo, chave: norm(f.nome + ' ' + f.resumo + ' ' + (f.termos || '')) }); });
    REFERENCIAS.forEach(function (r) { out.push({ grupo: 'Consultar', titulo: r.nome, url: '/music/referencia/' + r.slug, resumo: r.resumo, chave: norm(r.nome + ' ' + r.resumo + ' ' + (r.termos || '')) }); });
    JOGOS.forEach(function (j) { out.push({ grupo: 'Jogar', titulo: j.nome, url: '/music/jogar/' + j.slug, resumo: j.resumo, chave: norm(j.nome + ' ' + j.resumo + ' jogo desafio') }); });
    X.LISTA.forEach(function (x) { out.push({ grupo: 'Praticar', titulo: x.nome, url: '/music/praticar/' + x.id, resumo: 'Exercício de ' + x.habilidade + '. Níveis: ' + x.niveis.join('; ') + '.', chave: norm(x.nome + ' ' + x.habilidade + ' exercicio treino ' + x.niveis.join(' ')) }); });
    (licoes || []).forEach(function (l) { out.push({ grupo: 'Aprender', titulo: l.titulo, url: '/music/aprender/' + l.slug, resumo: l.resumo, chave: norm(l.titulo + ' ' + l.resumo + ' ' + (l.termos || '') + ' licao aula') }); });
    GLOSSARIO.forEach(function (g) { out.push({ grupo: 'Consultar', titulo: g[0] + ' (' + g[1] + ')', url: '/music/referencia/glossario#' + encodeURIComponent(norm(g[0]).replace(/ /g, '-')), resumo: g[2], chave: norm(g[0] + ' ' + g[1]) }); });
    E.CATALOGO.forEach(function (e) { out.push({ grupo: 'Consultar', titulo: 'Escala ' + e.nome + ' (em dó)', url: urlEscala(N.ler('C'), e.id), resumo: 'Fórmula ' + e.formula + '.', chave: norm('escala ' + e.nome + ' ' + e.aliases.join(' ')) }); });
    return out;
  }

  /**
   * Busca. Primeiro tenta LER o texto como objeto musical (acorde, escala,
   * tonalidade, intervalo, nota); depois procura por palavras. Devolve
   * [{ grupo, titulo, url, resumo }], o mais específico primeiro.
   */
  function buscar(q, opcoes) {
    var o = opcoes || {};
    var cru = String(q || '').trim();
    if (!cru) return [];
    var res = [], vistos = {};
    function add(r) { if (!vistos[r.url]) { vistos[r.url] = 1; res.push(r); } }
    var t = norm(cru);
    var semPrefixo = cru.replace(/^\s*(acorde|cifra|escala|modo|tonalidade|tom|intervalo|nota)\s+(de\s+)?/i, '').trim();

    // campo harmônico / tonalidade
    var mCampo = N.semAcento(cru).toLowerCase().match(/^(?:campo harmonico|tonalidade|tom|armadura)\s+(?:de|do|da)?\s*(.+)$/);
    var alvoTom = mCampo ? mCampo[1] : cru;
    var mt = N.semAcento(alvoTom).toLowerCase().match(/^(.+?)\s*(maior|menor|major|minor|m)?$/);
    if (mt) {
      var tn = N.ler(mt[1]);
      if (tn && tn.oitava == null && (mCampo || mt[2])) {
        var modo = /menor|minor|^m$/.test(mt[2] || '') ? 'menor' : 'maior';
        add({ grupo: 'Consultar', titulo: 'Tonalidade de ' + T.nome(tn, modo), url: urlTom(tn, modo), resumo: 'Escala, armadura, campo harmônico, funções e relativas.' });
      }
    }
    // escala por nome ("ré dórico", "C harmonic minor")
    var esc = E.lerNome(semPrefixo);
    if (esc) add({ grupo: 'Consultar', titulo: N.nome(esc.tonica, { notacao: 'pt', glifo: true }) + ' ' + E.porId(esc.id).nome, url: urlEscala(esc.tonica, esc.id), resumo: 'Notas, fórmula, acordes e modos relacionados.' });
    // nota pura ("C#", "dó sustenido") vem ANTES do acorde de mesmo nome
    var ntPura = N.ler(semPrefixo);
    if (ntPura && !mCampo && !/^\s*(acorde|cifra)\b/i.test(cru)) {
      var nsp = N.semOitava(ntPura);
      add({ grupo: 'Consultar', titulo: 'Nota ' + N.nomeDuplo(nsp), url: urlNota(nsp), resumo: 'Onde fica no teclado, na pauta e no braço; enarmônicos e frequências.' });
    }
    // acorde
    var ac = A.ler(semPrefixo);
    if (ac) add({ grupo: 'Consultar', titulo: 'Acorde ' + A.simbolo(ac.fundamental, ac.id, ac.baixo), url: urlAcorde(ac.fundamental, ac.id), resumo: A.porId(ac.id).nome + ' — notas, intervalos, inversões e desenho nos instrumentos.' });
    // intervalo
    var iv = I.ler(semPrefixo);
    if (iv && iv.slug) add({ grupo: 'Consultar', titulo: iv.nome + ' (' + iv.curto + ')', url: urlIntervalo(iv), resumo: iv.semitons + ' semitons — veja, ouça e pratique.' });
    // nota
    var nt = N.ler(semPrefixo);
    if (nt && !mCampo) {
      var ns = N.semOitava(nt);
      add({ grupo: 'Consultar', titulo: 'Nota ' + N.nomeDuplo(ns), url: urlNota(ns), resumo: 'Onde fica no teclado, na pauta e no braço; enarmônicos e frequências.' });
      add({ grupo: 'Consultar', titulo: 'Escala de ' + N.nome(ns, { notacao: 'pt', glifo: true }) + ' maior', url: urlEscala(ns, 'maior'), resumo: 'Notas, acordes e armadura.' });
    }
    // texto livre
    var palavras = t.split(' ').filter(function (w) { return w.length > 1; });
    if (palavras.length) {
      var pontuadas = entradas(o.licoes).map(function (e) {
        var p = 0;
        palavras.forEach(function (w) { if (e.chave.indexOf(w) >= 0) p += w.length; });
        if (e.chave.indexOf(t) >= 0) p += 10;
        return { e: e, p: p };
      }).filter(function (x) { return x.p > 0; }).sort(function (a, b) { return b.p - a.p; });
      pontuadas.slice(0, o.limite || 20).forEach(function (x) { add({ grupo: x.e.grupo, titulo: x.e.titulo, url: x.e.url, resumo: x.e.resumo }); });
    }
    return res.slice(0, o.limite || 24);
  }

  return {
    AMBIENTES: AMBIENTES, FERRAMENTAS: FERRAMENTAS, REFERENCIAS: REFERENCIAS, JOGOS: JOGOS, GLOSSARIO: GLOSSARIO,
    urlEscala: urlEscala, urlAcorde: urlAcorde, urlTom: urlTom, urlIntervalo: urlIntervalo, urlNota: urlNota,
    norm: norm, entradas: entradas, buscar: buscar,
  };
});
