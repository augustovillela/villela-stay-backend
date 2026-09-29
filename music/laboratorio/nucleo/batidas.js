// =====================================================================
// Musique · Laboratório — NÚCLEO · padrões de batida (fazedor de batidas).
//
// São REFERÊNCIAS SIMPLIFICADAS de cada estilo para praticar e criar —
// não transcrições de gravação nem a "única forma certa": cada estilo
// tem muitas variações regionais e de época. A tela diz isso.
//
// Grade: `passos` por ciclo e `porTempo` passos por tempo.
//   · 16 passos / 4 por tempo = um compasso de 4/4 em semicolcheias
//     (os estilos em 2/4 ocupam dois compassos);
//   · 12 passos / 4 por tempo = um compasso de 3/4 em semicolcheias;
//   · 12 passos / 3 por tempo = 12/8 (ou dois de 6/8) em colcheias.
// =====================================================================
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else (raiz.MusiqueLab = raiz.MusiqueLab || {}).batidas = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FAIXAS = [
    { id: 'bumbo', nome: 'Bumbo', midi: 36 },
    { id: 'tom', nome: 'Surdo / tom grave', midi: 41 },
    { id: 'caixa', nome: 'Caixa', midi: 38 },
    { id: 'aro', nome: 'Aro / clave', midi: 37 },
    { id: 'palma', nome: 'Palma', midi: 39 },
    { id: 'chimbal', nome: 'Chimbal fechado', midi: 42 },
    { id: 'aberto', nome: 'Chimbal aberto / triângulo', midi: 46 },
    { id: 'agogo', nome: 'Agogô / cowbell', midi: 67 },
    { id: 'ganza', nome: 'Ganzá / shaker', midi: 70 },
  ];

  function todos(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  var S16 = todos(16), C8 = [0, 2, 4, 6, 8, 10, 12, 14], CT = [2, 6, 10, 14], T4 = [0, 4, 8, 12], SAMBA_B = [0, 3, 4, 7, 8, 11, 12, 15];

  // grupo: basicos | brasil | americas | europa
  var PADROES = [
    { id: 'rock', grupo: 'basicos', nome: 'Rock básico', bpm: 110, f: { bumbo: [0, 8, 10], caixa: [4, 12], chimbal: C8 } },
    { id: 'pop', grupo: 'basicos', nome: 'Pop', bpm: 100, f: { bumbo: [0, 6, 8], caixa: [4, 12], chimbal: C8, palma: [4, 12] } },
    { id: 'balada', grupo: 'basicos', nome: 'Balada', bpm: 70, f: { bumbo: [0, 7, 10], caixa: [8], chimbal: T4 } },
    { id: 'meia-tempo', grupo: 'basicos', nome: 'Meio tempo (half-time)', bpm: 80, f: { bumbo: [0, 10], caixa: [8], chimbal: C8 } },

    { id: 'samba', grupo: 'brasil', nome: 'Samba (bateria de kit)', compasso: '2/4', bpm: 100, f: { bumbo: SAMBA_B, aro: [0, 3, 6, 10, 13], ganza: S16 } },
    { id: 'samba-enredo', grupo: 'brasil', nome: 'Samba-enredo (batucada)', compasso: '2/4', bpm: 140, f: { tom: [4, 12], bumbo: [0, 8], caixa: [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15], agogo: [0, 3, 6, 8, 11, 14], ganza: S16 } },
    { id: 'pagode', grupo: 'brasil', nome: 'Pagode', compasso: '2/4', bpm: 95, f: { bumbo: SAMBA_B, tom: [0, 6, 8, 14], aro: [2, 5, 7, 10, 13], ganza: S16, palma: [4, 12] } },
    { id: 'bossa-nova', grupo: 'brasil', nome: 'Bossa nova', compasso: '2/4', bpm: 130, f: { bumbo: SAMBA_B, aro: [0, 3, 6, 10, 13], chimbal: C8 } },
    { id: 'samba-rock', grupo: 'brasil', nome: 'Samba-rock', bpm: 105, f: { bumbo: [0, 3, 8, 11], caixa: [4, 12], chimbal: C8, agogo: [0, 6, 10] } },
    { id: 'baiao', grupo: 'brasil', nome: 'Baião', compasso: '2/4', bpm: 110, f: { bumbo: [0, 3, 8, 11], aro: [4, 6, 12, 14], chimbal: [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15], aberto: CT } },
    { id: 'xote', grupo: 'brasil', nome: 'Xote', compasso: '2/4', bpm: 90, f: { bumbo: [0, 7, 8], caixa: [4, 12], chimbal: C8, aberto: [6, 14] } },
    { id: 'xaxado', grupo: 'brasil', nome: 'Xaxado', compasso: '2/4', bpm: 120, f: { bumbo: [0, 3, 6, 8, 11, 14], aro: CT, chimbal: C8 } },
    { id: 'arrasta-pe', grupo: 'brasil', nome: 'Arrasta-pé (forró)', compasso: '2/4', bpm: 140, f: { bumbo: [0, 8], caixa: [4, 12], ganza: S16, aberto: CT } },
    { id: 'frevo', grupo: 'brasil', nome: 'Frevo', compasso: '2/4', bpm: 150, f: { bumbo: [0, 8], caixa: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14], chimbal: C8 } },
    { id: 'maracatu', grupo: 'brasil', nome: 'Maracatu (nação)', bpm: 90, f: { tom: [0, 3, 6, 8, 11, 14], caixa: S16, agogo: [0, 3, 6, 8, 10, 12, 14], ganza: S16 } },
    { id: 'ijexa', grupo: 'brasil', nome: 'Ijexá / afoxé', bpm: 95, f: { agogo: [0, 2, 4, 5, 7, 8, 10, 12, 13, 15], bumbo: [0, 6, 8, 14], tom: [4, 12], ganza: C8 } },
    { id: 'samba-reggae', grupo: 'brasil', nome: 'Samba-reggae (axé)', bpm: 100, f: { bumbo: [0, 8], tom: [4, 12], caixa: [0, 3, 6, 10, 12], chimbal: C8 } },
    { id: 'axe', grupo: 'brasil', nome: 'Axé', bpm: 120, f: { bumbo: T4, caixa: [4, 12], chimbal: CT, agogo: [0, 3, 6, 10] } },
    { id: 'funk-carioca', grupo: 'brasil', nome: 'Funk carioca (tamborzão)', bpm: 130, f: { bumbo: [0, 3, 6, 10], caixa: [4, 12], palma: [4, 12], chimbal: C8 } },
    { id: 'sertanejo', grupo: 'brasil', nome: 'Sertanejo (atual)', bpm: 90, f: { bumbo: [0, 8, 10], caixa: [4, 12], chimbal: C8, palma: [12] } },
    { id: 'rasqueado', grupo: 'brasil', nome: 'Rasqueado / guarânia (sertanejo raiz)', compasso: '6/8', passos: 12, porTempo: 3, bpm: 60, f: { bumbo: [0, 6], caixa: [3, 9], chimbal: todos(12) } },
    { id: 'marchinha', grupo: 'brasil', nome: 'Marchinha de carnaval', compasso: '2/4', bpm: 120, f: { bumbo: [0, 8], caixa: [4, 12], chimbal: S16 } },
    { id: 'choro', grupo: 'brasil', nome: 'Choro (pandeiro)', compasso: '2/4', bpm: 100, f: { tom: [0, 8], ganza: S16, aro: [3, 7, 11, 15] } },
    { id: 'coco', grupo: 'brasil', nome: 'Coco', compasso: '2/4', bpm: 110, f: { bumbo: [0, 3, 8, 11], palma: [4, 7, 12, 15], ganza: S16 } },

    { id: 'funk-eua', grupo: 'americas', nome: 'Funk (EUA)', bpm: 100, f: { bumbo: [0, 3, 10], caixa: [4, 7, 12, 15], chimbal: S16 } },
    { id: 'disco', grupo: 'americas', nome: 'Disco', bpm: 120, f: { bumbo: T4, caixa: [4, 12], chimbal: T4, aberto: CT } },
    { id: 'motown', grupo: 'americas', nome: 'Motown / soul', bpm: 110, f: { bumbo: [0, 8, 10], caixa: T4, chimbal: C8, palma: [4, 12] } },
    { id: 'hip-hop', grupo: 'americas', nome: 'Hip-hop (boom bap)', bpm: 90, f: { bumbo: [0, 7, 10], caixa: [4, 12], chimbal: C8 } },
    { id: 'trap', grupo: 'americas', nome: 'Trap', bpm: 70, f: { bumbo: [0, 11], caixa: [8], palma: [8], chimbal: S16 } },
    { id: 'rnb', grupo: 'americas', nome: 'R&B / neo soul (use swing)', bpm: 85, f: { bumbo: [0, 3, 10], caixa: [4, 12], chimbal: C8 } },
    { id: 'country', grupo: 'americas', nome: 'Country (train beat)', bpm: 120, f: { bumbo: [0, 8], caixa: S16, aberto: [4, 12] } },
    { id: 'shuffle', grupo: 'americas', nome: 'Blues shuffle (12/8)', compasso: '12/8', passos: 12, porTempo: 3, bpm: 80, f: { bumbo: [0, 6], caixa: [3, 9], chimbal: [0, 2, 3, 5, 6, 8, 9, 11] } },
    { id: 'jazz', grupo: 'americas', nome: 'Jazz swing', compasso: '12/8', passos: 12, porTempo: 3, bpm: 130, f: { chimbal: [0, 3, 5, 6, 9, 11], aro: [3, 9], bumbo: [0, 3, 6, 9] } },
    { id: 'rockabilly', grupo: 'americas', nome: 'Rock and roll anos 50 (use swing)', bpm: 160, f: { bumbo: [0, 8], caixa: [4, 12], chimbal: C8 } },
    { id: 'punk', grupo: 'americas', nome: 'Punk', bpm: 180, f: { bumbo: T4, caixa: CT, chimbal: C8 } },
    { id: 'metal', grupo: 'americas', nome: 'Metal (bumbo duplo)', bpm: 150, f: { bumbo: S16, caixa: [4, 12], chimbal: T4 } },
    { id: 'reggae', grupo: 'americas', nome: 'Reggae (one drop)', bpm: 75, f: { bumbo: [8], caixa: [8], chimbal: CT } },
    { id: 'ska', grupo: 'americas', nome: 'Ska', bpm: 150, f: { bumbo: [0, 8], caixa: [4, 12], chimbal: CT } },
    { id: 'reggaeton', grupo: 'americas', nome: 'Reggaeton (dembow)', bpm: 95, f: { bumbo: T4, caixa: [3, 6, 11, 14], chimbal: C8 } },
    { id: 'salsa', grupo: 'americas', nome: 'Salsa (clave 3-2)', bpm: 180, f: { aro: [0, 3, 6, 10, 12], agogo: C8, tom: [6, 7, 14, 15], bumbo: [6, 14] } },
    { id: 'cumbia', grupo: 'americas', nome: 'Cumbia', bpm: 95, f: { bumbo: [0, 8], caixa: [4, 12], ganza: [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15] } },
    { id: 'tango', grupo: 'americas', nome: 'Tango (3-3-2)', bpm: 120, f: { bumbo: [0, 6, 12], aro: [4, 12], chimbal: T4 } },
    { id: 'second-line', grupo: 'americas', nome: 'Second line (Nova Orleans)', bpm: 100, f: { bumbo: [0, 6, 8], caixa: [0, 3, 6, 8, 10, 12, 13], chimbal: C8 } },
    { id: 'gospel', grupo: 'americas', nome: 'Gospel (use swing)', bpm: 90, f: { bumbo: [0, 6, 10], caixa: [4, 12], palma: [4, 12], chimbal: C8 } },

    { id: 'house', grupo: 'europa', nome: 'House', bpm: 124, f: { bumbo: T4, palma: [4, 12], aberto: CT, chimbal: [1, 3, 5, 7, 9, 11, 13, 15] } },
    { id: 'techno', grupo: 'europa', nome: 'Techno', bpm: 130, f: { bumbo: T4, chimbal: S16, palma: [4, 12], aberto: CT } },
    { id: 'drum-and-bass', grupo: 'europa', nome: 'Drum and bass', bpm: 172, f: { bumbo: [0, 10], caixa: [4, 12], chimbal: C8 } },
    { id: 'uk-garage', grupo: 'europa', nome: 'UK garage (2-step, use swing)', bpm: 132, f: { bumbo: [0, 7, 10], caixa: [4, 12], chimbal: CT } },
    { id: 'eurodance', grupo: 'europa', nome: 'Eurodance', bpm: 140, f: { bumbo: T4, caixa: [4, 12], aberto: CT } },
    { id: 'motorik', grupo: 'europa', nome: 'Krautrock (motorik)', bpm: 125, f: { bumbo: [0, 8, 10], caixa: [4, 12], chimbal: C8 } },
    { id: 'valsa', grupo: 'europa', nome: 'Valsa (3/4)', compasso: '3/4', passos: 12, porTempo: 4, bpm: 150, f: { bumbo: [0], caixa: [4, 8], chimbal: [0, 4, 8] } },
    { id: 'polca', grupo: 'europa', nome: 'Polca', compasso: '2/4', bpm: 120, f: { bumbo: [0, 8], caixa: [4, 12], chimbal: CT } },
    { id: 'marcha', grupo: 'europa', nome: 'Marcha militar', compasso: '2/4', bpm: 115, f: { bumbo: [0, 8], caixa: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14] } },
    { id: 'jig', grupo: 'europa', nome: 'Jig irlandesa (6/8)', compasso: '6/8', passos: 12, porTempo: 3, bpm: 110, f: { bumbo: [0, 3, 6, 9], tom: [0, 6], chimbal: todos(12) } },
    { id: 'tarantela', grupo: 'europa', nome: 'Tarantela (6/8)', compasso: '6/8', passos: 12, porTempo: 3, bpm: 120, f: { bumbo: [0, 6], aro: [3, 9], ganza: todos(12) } },
    { id: 'flamenco', grupo: 'europa', nome: 'Tangos flamencos (palmas)', bpm: 100, f: { bumbo: [0], palma: [4, 8, 12], aro: [2, 6, 10, 14] } },
  ];
  PADROES.forEach(function (p) { p.passos = p.passos || 16; p.porTempo = p.porTempo || 4; p.compasso = p.compasso || (p.passos === 16 ? '4/4' : '3/4'); });

  var GRUPOS = [{ id: 'basicos', nome: 'Básicos' }, { id: 'brasil', nome: 'Brasil' }, { id: 'americas', nome: 'Américas' }, { id: 'europa', nome: 'Europa' }];

  /** Confere um padrão: faixas conhecidas e passos dentro do ciclo. */
  function validar(p) {
    var ids = FAIXAS.map(function (f) { return f.id; });
    return Object.keys(p.f).every(function (k) { return ids.indexOf(k) >= 0 && p.f[k].every(function (i) { return i >= 0 && i < p.passos && i === Math.floor(i); }); });
  }
  function porId(id) { for (var i = 0; i < PADROES.length; i++) if (PADROES[i].id === id) return PADROES[i]; return null; }

  return { FAIXAS: FAIXAS, PADROES: PADROES, GRUPOS: GRUPOS, validar: validar, porId: porId };
});
