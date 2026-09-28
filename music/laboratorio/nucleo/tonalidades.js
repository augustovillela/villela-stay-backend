// =====================================================================
// Musique · Laboratório — NÚCLEO · tonalidades, armaduras e campo
// harmônico.
//
// A armadura é CONTADA na escala (quantos sustenidos ou bemóis ela tem),
// não copiada de uma tabela — assim a tabela do círculo de quintas e a
// página de cada tom não podem discordar.
//
// Funções harmônicas (T, S, D) seguem a teoria tonal funcional ensinada
// no Brasil. É simplificação pedagógica: a página diz isso, e diz que o
// contexto (e o estilo) pode mudar a leitura de um acorde.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./notas'), require('./intervalos'), require('./escalas'), require('./acordes'));
  else { var L = raiz.MusiqueLab = raiz.MusiqueLab || {}; L.tonalidades = fabrica(L.notas, L.intervalos, L.escalas, L.acordes); }
})(typeof self !== 'undefined' ? self : this, function (N, I, E, A) {
  'use strict';

  var ORDEM_SUST = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  var ORDEM_BEMOL = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
  // As 15 tonalidades maiores e 15 menores usuais (até 7 acidentes).
  var MAIORES = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'];
  var MENORES = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab'];

  function escalaDe(modo, variante) {
    if (modo !== 'menor') return 'maior';
    return { harmonica: 'menor-harmonica', melodica: 'menor-melodica' }[variante] || 'menor-natural';
  }

  /** Relativa: maior → menor no 6º grau; menor → maior no 3º. */
  function relativa(tonica, modo) {
    var t = N.semOitava(N.ler(tonica));
    if (!t) return null;
    return modo === 'menor' ? { tonica: I.construir(t, '3m'), modo: 'maior' } : { tonica: I.construir(t, '6M'), modo: 'menor' };
  }

  /** Armadura: { quantidade (+ sustenidos, − bemóis), acidentes grafados }. */
  function armadura(tonica, modo) {
    var t = N.semOitava(N.ler(tonica));
    if (!t) return null;
    var maior = modo === 'menor' ? relativa(t, 'menor').tonica : t;
    var ns = E.notas(maior, 'maior');
    if (!ns) return null;
    var sus = ns.filter(function (n) { return n.alt > 0; }).reduce(function (a, n) { return a + n.alt; }, 0);
    var bem = ns.filter(function (n) { return n.alt < 0; }).reduce(function (a, n) { return a - n.alt; }, 0);
    if (sus && bem) return null;                  // não acontece em escala maior
    var q = sus || -bem;
    var ordem = q > 0 ? ORDEM_SUST : ORDEM_BEMOL;
    var acid = ordem.slice(0, Math.min(7, Math.abs(q))).map(function (l) { return { li: N.LETRAS.indexOf(l), alt: q > 0 ? 1 : -1, oitava: null }; });
    return { quantidade: q, tipo: q > 0 ? 'sustenidos' : q < 0 ? 'bemóis' : 'nenhum', acidentes: acid, usual: Math.abs(q) <= 7 && ns.every(function (n) { return Math.abs(n.alt) <= 1; }) };
  }

  /** Tom da armadura: quantidade → { maior, menor }. */
  function daArmadura(q) {
    var i = MAIORES.filter(function (t) { return armadura(t, 'maior').quantidade === q; })[0];
    if (!i) return null;
    return { maior: N.ler(i), menor: relativa(i, 'maior').tonica };
  }

  var ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  var SUFIXO_ROMANO = { maior: '', menor: '', dim: '°', aum: '+', '7M': '7M', '7': '7', m7: '7', m7b5: 'ø', dim7: '°7', m7M: '(7M)', '7M#5': '+7M' };

  function romano(grau, id) {
    var base = ROMANOS[grau - 1];
    var minusc = ['menor', 'dim', 'm7', 'm7b5', 'dim7', 'm7M'].indexOf(id) >= 0;
    return (minusc ? base.toLowerCase() : base) + (SUFIXO_ROMANO[id] != null ? SUFIXO_ROMANO[id] : '');
  }

  // Funções no modo maior e no menor (graus 1–7).
  var FUNC_MAIOR = [['T', 'tônica'], ['S', 'subdominante (relativa da subdominante)'], ['T', 'tônica (anti-relativa; às vezes lida como dominante)'],
    ['S', 'subdominante'], ['D', 'dominante'], ['T', 'tônica (relativa)'], ['D', 'dominante (sem fundamental)']];
  var FUNC_MENOR = [['T', 'tônica'], ['S', 'subdominante'], ['T', 'tônica (relativa)'], ['S', 'subdominante'],
    ['D', 'dominante'], ['S', 'subdominante (relativa da subdominante)'], ['D', 'dominante (sensível) ou subtônica']];

  /**
   * Campo harmônico: um acorde por grau, empilhando terças na escala.
   * `tetrades`: com sétima. `variante` (menor): natural | harmonica | melodica.
   */
  function campo(tonica, modo, opcoes) {
    var o = opcoes || {};
    var id = escalaDe(modo, o.variante);
    var pilhas = E.empilhar(N.semOitava(N.ler(tonica)), id, o.tetrades ? 4 : 3);
    if (!pilhas) return null;
    var f = modo === 'menor' ? FUNC_MENOR : FUNC_MAIOR;
    return pilhas.map(function (p) {
      var q = A.qualidadeDaPilha(p.notas);
      return {
        grau: p.grau, romano: q ? romano(p.grau, q) : ROMANOS[p.grau - 1] + '?', acorde: q,
        fundamental: p.notas[0], notas: p.notas, simbolo: q ? A.simbolo(p.notas[0], q) : '?',
        funcao: f[p.grau - 1][0], funcao_nome: f[p.grau - 1][1],
      };
    });
  }

  /** Campo como consta num tom menor "real": v e V, VII e vii° juntos. */
  function campoMenorCompleto(tonica, opcoes) {
    var nat = campo(tonica, 'menor', { variante: 'natural', tetrades: opcoes && opcoes.tetrades });
    var har = campo(tonica, 'menor', { variante: 'harmonica', tetrades: opcoes && opcoes.tetrades });
    if (!nat || !har) return null;
    return nat.map(function (g, i) {
      var h = har[i];
      return h.acorde !== g.acorde && (i === 4 || i === 6) ? [g, h] : [g];
    });
  }

  /** Dominante secundária de cada grau (V/x), exceto o de tônica e o diminuto. */
  function dominantesSecundarias(tonica, modo) {
    var c = campo(tonica, modo);
    if (!c) return [];
    return c.filter(function (g) { return g.grau !== 1 && g.acorde !== 'dim'; }).map(function (g) {
      var d = I.construir(g.fundamental, '5J', true);
      return { alvo: g.romano, rotulo: 'V7/' + g.romano, simbolo: A.simbolo(d, '7'), fundamental: d };
    });
  }

  var CADENCIAS = [
    { id: 'perfeita', nome: 'cadência perfeita (autêntica)', graus: [5, 1], texto: 'Dominante que resolve na tônica: é a sensação de ponto final.' },
    { id: 'plagal', nome: 'cadência plagal', graus: [4, 1], texto: 'Subdominante para a tônica: fecha sem a tensão da sensível (o "amém").' },
    { id: 'meia', nome: 'meia cadência (suspensiva)', graus: [2, 5], texto: 'Termina NA dominante: vírgula, não ponto — a frase pede continuação.' },
    { id: 'interrompida', nome: 'cadência interrompida (deceptiva)', graus: [5, 6], texto: 'A dominante promete a tônica e cai na relativa: a surpresa é o efeito.' },
    { id: 'ii-V-I', nome: 'dois-cinco-um', graus: [2, 5, 1], texto: 'Preparação, tensão e resolução — a célula básica da harmonia do jazz e da MPB.' },
  ];

  // Progressões apresentadas como PADRÕES abstratos (graus), não como
  // músicas: o padrão é de domínio comum; a gravação de alguém, não.
  var PROGRESSOES = [
    { id: 'pop', nome: 'I–V–vi–IV', graus: [1, 5, 6, 4], genero: 'pop e rock', texto: 'O padrão mais comum do pop atual.' },
    { id: 'anos-50', nome: 'I–vi–IV–V', graus: [1, 6, 4, 5], genero: 'rock dos anos 50, doo-wop', texto: 'Conhecida como "progressão dos anos 50".' },
    { id: 'tres-acordes', nome: 'I–IV–V', graus: [1, 4, 5], genero: 'folk, rock, sertanejo raiz', texto: 'Três acordes cobrem as três funções.' },
    { id: 'jazz', nome: 'ii–V–I', graus: [2, 5, 1], genero: 'jazz, bossa nova', texto: 'Com sétimas, é o coração da harmonia do jazz.' },
    { id: 'circulo', nome: 'vi–ii–V–I', graus: [6, 2, 5, 1], genero: 'standards, samba-canção', texto: 'Anda pelo círculo de quintas até a tônica.' },
    { id: 'blues12', nome: 'blues de 12 compassos', graus: [1, 1, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5], genero: 'blues, rock', texto: 'Doze compassos; no blues, todos os graus costumam levar sétima menor (I7, IV7, V7).', dominantes: true },
    { id: 'andaluza', nome: 'i–VII–VI–V', graus: [1, 7, 6, 5], genero: 'flamenco, rock', modo: 'menor', texto: 'Cadência andaluza: desce pelo tetracorde do modo menor até a dominante maior.' },
    { id: 'menor-pop', nome: 'i–VI–III–VII', graus: [1, 6, 3, 7], genero: 'pop, rock', modo: 'menor', texto: 'O mesmo ciclo do I–V–vi–IV, visto a partir da relativa menor.' },
  ];

  /** Acordes de uma progressão num tom. Em menor, o V é o da harmônica. */
  function realizar(tonica, modo, graus, opcoes) {
    var o = opcoes || {};
    var nat = campo(tonica, modo, { tetrades: o.tetrades });
    var har = modo === 'menor' ? campo(tonica, 'menor', { variante: 'harmonica', tetrades: o.tetrades }) : null;
    if (!nat) return null;
    return graus.map(function (g) {
      var x = (har && g === 5) ? har[4] : nat[g - 1];
      if (o.dominantes) {
        var d = { grau: x.grau, romano: ROMANOS[g - 1] + '7', acorde: '7', fundamental: x.fundamental, notas: A.notas(x.fundamental, '7').map(N.semOitava), simbolo: A.simbolo(x.fundamental, '7'), funcao: x.funcao, funcao_nome: x.funcao_nome };
        return d;
      }
      return x;
    });
  }

  // Círculo de quintas (sentido horário), com as grafias alternativas
  // na parte de baixo, onde o círculo "fecha" por enarmonia.
  var CIRCULO = [
    { maior: 'C', menor: 'A' }, { maior: 'G', menor: 'E' }, { maior: 'D', menor: 'B' }, { maior: 'A', menor: 'F#' },
    { maior: 'E', menor: 'C#' }, { maior: 'B', menor: 'G#', alt: 'Cb', altMenor: 'Ab' },
    { maior: 'F#', menor: 'D#', alt: 'Gb', altMenor: 'Eb' }, { maior: 'Db', menor: 'Bb', alt: 'C#', altMenor: 'A#' },
    { maior: 'Ab', menor: 'F' }, { maior: 'Eb', menor: 'C' }, { maior: 'Bb', menor: 'G' }, { maior: 'F', menor: 'D' },
  ];

  /** Vizinhas: dominante, subdominante e as relativas das três. */
  function vizinhas(tonica, modo) {
    var t = N.semOitava(N.ler(tonica));
    if (!t) return [];
    var dom = I.construir(t, '5J'), sub = I.construir(t, '4J');
    var out = [{ tonica: dom, modo: modo, rel: 'dominante' }, { tonica: sub, modo: modo, rel: 'subdominante' }];
    var r = relativa(t, modo);
    out.push({ tonica: r.tonica, modo: r.modo, rel: 'relativa' });
    [dom, sub].forEach(function (x, i) { var rr = relativa(x, modo); out.push({ tonica: rr.tonica, modo: rr.modo, rel: 'relativa da ' + (i ? 'subdominante' : 'dominante') }); });
    out.push({ tonica: t, modo: modo === 'menor' ? 'maior' : 'menor', rel: 'homônima (paralela)' });
    return out;
  }

  /**
   * Cadeia de terças (o "círculo de terças"): tônicas maiores e menores
   * alternadas, cada passo dividindo duas notas com o anterior.
   */
  function cadeiaDeTercas(inicio, tamanho) {
    var t = N.semOitava(N.ler(inicio || 'C'));
    var out = [{ tonica: t, modo: 'maior' }];
    var atual = t, maior = true;
    for (var i = 1; i < (tamanho || 24); i++) {
      atual = I.construir(atual, maior ? '3M' : '3m');
      maior = !maior;
      // normaliza grafias com dobrado para a enarmônica simples
      if (Math.abs(atual.alt) > 1) atual = N.enarmonicos(atual)[0];
      out.push({ tonica: atual, modo: maior ? 'maior' : 'menor' });
    }
    return out;
  }

  function slug(tonica, modo) { return N.slug(tonica) + '-' + (modo === 'menor' ? 'menor' : 'maior'); }
  function deSlug(s) {
    var m = String(s || '').match(/^(.+)-(maior|menor)$/);
    if (!m) return null;
    var t = N.deSlug(m[1]);
    return t ? { tonica: t, modo: m[2] } : null;
  }
  function nome(tonica, modo, notacao) {
    return N.nome(tonica, { notacao: notacao || 'pt', glifo: true, oitava: false }) + ' ' + (modo === 'menor' ? 'menor' : 'maior');
  }
  function usuais() {
    return MAIORES.map(function (t) { return { tonica: N.ler(t), modo: 'maior' }; })
      .concat(MENORES.map(function (t) { return { tonica: N.ler(t), modo: 'menor' }; }));
  }

  return {
    ORDEM_SUST: ORDEM_SUST, ORDEM_BEMOL: ORDEM_BEMOL, MAIORES: MAIORES, MENORES: MENORES, CIRCULO: CIRCULO,
    CADENCIAS: CADENCIAS, PROGRESSOES: PROGRESSOES, escalaDe: escalaDe, relativa: relativa, armadura: armadura,
    daArmadura: daArmadura, romano: romano, campo: campo, campoMenorCompleto: campoMenorCompleto,
    dominantesSecundarias: dominantesSecundarias, realizar: realizar, vizinhas: vizinhas, cadeiaDeTercas: cadeiaDeTercas,
    slug: slug, deSlug: deSlug, nome: nome, usuais: usuais,
  };
});
