// =====================================================================
// Musique · LABORATÓRIO MUSICAL — testes (ADR-0013).
//
// A regra: a interface não pode ensinar uma nota, um intervalo, uma
// grafia, uma posição na pauta ou um ritmo errados sem quebrar um teste
// daqui. Por isso o núcleo é varrido INTEIRO (todas as escalas × todas as
// tônicas, todos os tons usuais), não por amostra.
// =====================================================================
'use strict';
const vm = require('vm');

async function rodar({ t, secao, req, assert }) {
  const N = require('./nucleo/notas');
  const I = require('./nucleo/intervalos');
  const E = require('./nucleo/escalas');
  const A = require('./nucleo/acordes');
  const T = require('./nucleo/tonalidades');
  const R = require('./nucleo/ritmo');
  const P = require('./nucleo/pauta');
  const INS = require('./nucleo/instrumentos');
  const D = require('./nucleo/desenho');
  const X = require('./nucleo/exercicios');
  const AC = require('./nucleo/acustica');
  const CAT = require('./catalogo');
  const ACESSO = require('./acesso');
  const PG = require('./paginas');
  const L = require('./licoes');
  const { db } = require('../db');
  const nm = (ns) => ns.map((n) => N.nome(n, { oitava: false })).join(' ');
  const TONICAS = []; for (let li = 0; li < 7; li++) [-1, 0, 1].forEach((alt) => TONICAS.push({ li, alt, oitava: null }));

  secao('Laboratório · núcleo: notas, intervalos, escalas, acordes');

  await t('NOTAS: lê cifra, nome latino e por extenso; a oitava é da LETRA (dó♭4 = 59, si♯3 = 60)', async () => {
    const casos = { 'C#4': [0, 1, 4], 'dó sustenido': [0, 1, null], 'si b': [6, -1, null], 'Fx': [3, 2, null], 'Ebb': [2, -2, null], 'B flat': [6, -1, null], 'sol4': [4, 0, 4], 'ré♭3': [1, -1, 3], 'Lá': [5, 0, null], 'b': [6, 0, null] };
    Object.entries(casos).forEach(([txt, [li, alt, o]]) => { const n = N.ler(txt); assert.ok(n, txt); assert.deepEqual([n.li, n.alt, n.oitava], [li, alt, o], txt); });
    assert.equal(N.midi('Cb4'), 59); assert.equal(N.midi('B#3'), 60); assert.equal(N.midi('A4'), 69);
    assert.equal(Math.round(N.freq('A4')), 440); assert.equal(N.ler('H'), null); assert.equal(N.ler('C###'), null);
    TONICAS.forEach((n) => assert.ok(N.mesmaGrafia(N.deSlug(N.slug(n)), n), 'slug ida e volta: ' + N.slug(n)));
    assert.deepEqual(N.enarmonicos('C#').map((x) => N.nome(x)).sort(), ['B##', 'C#', 'Db']);
    assert.ok(N.mesmaAltura('F#', 'Gb') && !N.mesmaGrafia('F#', 'Gb'), 'mesma altura, grafia diferente');
  });

  await t('INTERVALOS: número pelas letras, qualidade pelos semitons (dó–fá♭ é 4ª diminuta, não 3ª maior)', async () => {
    const c = (a, b) => I.entre(a, b).curto;
    assert.equal(c('C', 'E'), '3M'); assert.equal(c('C', 'Fb'), '4d'); assert.equal(c('C', 'D#'), '2A'); assert.equal(c('C', 'Eb'), '3m');
    assert.equal(c('B#', 'C'), '2d'); assert.equal(c('C4', 'E5'), '10M'); assert.equal(c('F', 'B'), '4A'); assert.equal(c('B', 'F'), '5d');
    const desc = I.entre('E4', 'C4'); assert.equal(desc.curto, '3M'); assert.equal(desc.descendente, true);
    assert.equal(N.nome(I.construir('C', '4d')), 'Fb'); assert.equal(N.nome(I.construir('G#', '3M')), 'B#');
    assert.equal(N.nome(I.construir('C4', '9m')), 'Db5'); assert.equal(N.nome(I.construir('E4', '3M', true)), 'C4');
    I.USUAIS.forEach((iv) => {
      const inv = I.inverter(iv); assert.ok(inv, iv.curto);
      if (iv.numero <= 8) assert.equal(I.inverter(inv).curto, iv.curto, 'inverter duas vezes volta: ' + iv.curto);
      if (iv.numero > 1 && iv.numero < 8) assert.equal(iv.numero + inv.numero, 9, iv.curto);
      assert.equal(inv.semitons % 12, (12 - iv.semitons % 12) % 12, 'as duas somam uma oitava: ' + iv.curto);
      assert.equal(I.porSlug(iv.slug).curto, iv.curto);
      // construir e medir de volta dá o mesmo intervalo, em todas as tônicas com até um acidente
      TONICAS.forEach((t0) => { const b = I.construir(N.comOitava(t0, 4), iv); if (b) assert.equal(I.entre(N.comOitava(t0, 4), b).curto, iv.curto, N.nome(t0) + ' + ' + iv.curto); });
    });
    ['M3', 'P5', 'terça maior', 'major third', 'trítono', '5J', 'J5'].forEach((x) => assert.ok(I.ler(x), x));
    assert.equal(I.ler('3M').semitons, 4); assert.equal(I.ler('3m').semitons, 3);
  });

  await t('ESCALAS: TODAS as escalas em TODAS as tônicas batem a fórmula, sobem e fecham a oitava; hepta = uma nota por letra', async () => {
    let conferidas = 0;
    E.CATALOGO.forEach((e) => {
      const semi = E.semitons(e.id);
      TONICAS.forEach((t0) => {
        const ns = E.notas(N.comOitava(t0, 4), e.id);
        if (!ns) return;                            // exigiria triplo acidente: não existe página
        conferidas++;
        const m0 = N.midi(ns[0]);
        ns.forEach((n, i) => assert.equal(N.midi(n) - m0, semi[i], `${N.nome(t0)} ${e.id} grau ${i + 1}`));
        for (let i = 1; i < ns.length; i++) assert.ok(N.midi(ns[i]) > N.midi(ns[i - 1]), `${e.id} sobe`);
        assert.ok(N.midi(ns[ns.length - 1]) - m0 < 12, `${e.id} cabe na oitava`);
        if (E.graus(e.formula).length === 7) assert.equal(new Set(ns.map((n) => n.li)).size, 7, `${N.nome(t0)} ${e.id}: uma nota de cada letra`);
      });
    });
    assert.ok(conferidas > 700, 'varreu ' + conferidas);
    assert.equal(nm(E.notas('G#', 'menor-harmonica')), 'G# A# B C# D# E F##');
    assert.equal(nm(E.notas('F', 'maior')), 'F G A Bb C D E');
    assert.equal(nm(E.notas('C', 'alterada')), 'C Db Eb Fb Gb Ab Bb');
    assert.equal(nm(E.notas('Cb', 'maior')), 'Cb Db Eb Fb Gb Ab Bb');
    assert.equal(E.passos('maior').join(' '), 'T T S T T T S');
    assert.equal(E.passos('menor-harmonica').join(' '), 'T S T T S T+S S');
    assert.deepEqual(E.modosRelacionados('D', 'dorico').map((m) => N.nome(m.tonica) + ':' + m.id), ['C:maior', 'D:dorico', 'E:frigio', 'F:lidio', 'G:mixolidio', 'A:menor-natural', 'B:locrio']);
    const ex = E.identificar([0, 2, 4, 5, 7, 9, 11], { soExatas: true }).map((x) => x.tonica_pc + ':' + x.id);
    assert.ok(ex.includes('0:maior') && ex.includes('9:menor-natural') && ex.includes('2:dorico'));
    assert.deepEqual(E.lerNome('ré dórico'), { tonica: N.ler('D'), id: 'dorico' });
    assert.equal(E.lerNome('C harmonic minor').id, 'menor-harmonica');
  });

  await t('ACORDES: grafia pela fórmula (C°7 tem si𝄫), leitura de todos os símbolos, inversões e identificação com vários nomes', async () => {
    assert.equal(nm(A.notas('C', 'dim7')), 'C Eb Gb Bbb');
    assert.equal(nm(A.notas('Bb', 'm7b5')), 'Bb Db Fb Ab');
    A.CATALOGO.forEach((c) => c.simbolos.forEach((s) => {
      const r = A.ler('C' + s);
      assert.ok(r && r.id === c.id, `"C${s}" deveria ser ${c.id}, veio ${r && r.id}`);
    }));
    assert.equal(A.ler('Bbm7(b5)').id, 'm7b5'); assert.equal(N.nome(A.ler('Solm').fundamental), 'G'); assert.equal(N.nome(A.ler('C/E').baixo), 'E');
    assert.equal(A.ler('F#°7').id, 'dim7'); assert.equal(A.ler('G7(b9)').id, '7b9'); assert.equal(A.ler('C6/9').id, '69');
    const inv = A.identificar(['E3', 'G3', 'C4'])[0];
    assert.equal(inv.simbolo, 'C/E'); assert.equal(inv.nome_inversao, 'primeira inversão');
    const seis = A.identificar([60, 64, 67, 69]).map((x) => x.simbolo);
    assert.ok(seis.includes('C6') && seis.includes('Am7/C'), 'C6 = Am7/C: ' + seis);
    const sem5 = A.identificar([60, 64, 70]);
    assert.ok(sem5.some((x) => x.id === '7' && x.sem_quinta), 'C7 sem a quinta');
    A.CATALOGO.forEach((c) => {
      const ns = A.notas('C4', c.id);
      for (let k = 0; k < ns.length; k++) {
        const x = A.inversao('C4', c.id, k);
        for (let i = 1; i < x.length; i++) assert.ok(N.midi(x[i]) > N.midi(x[i - 1]), `${c.id} inv ${k} sobe`);
        assert.equal(new Set(x.map(N.pc)).size, new Set(ns.map(N.pc)).size, `${c.id} inv ${k} mantém as notas`);
      }
    });
    const cond = A.conduzir(A.notas('C4', 'maior'), N.ler('F'), 'maior');
    assert.ok(cond.custo <= 3, 'C → F com o menor movimento (C–F–A): ' + cond.custo);
  });

  secao('Laboratório · tonalidades, ritmo, pauta, instrumentos');

  await t('TONALIDADES: armadura CONTADA nos 30 tons usuais, na ordem certa; campo maior I ii iii IV V vi vii° em todos', async () => {
    const esperado = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
    Object.entries(esperado).forEach(([t0, q]) => assert.equal(T.armadura(t0, 'maior').quantidade, q, t0));
    const menores = { A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6, 'A#': 7, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6, Ab: -7 };
    Object.entries(menores).forEach(([t0, q]) => assert.equal(T.armadura(t0, 'menor').quantidade, q, t0 + 'm'));
    assert.equal(nm(T.armadura('E', 'maior').acidentes), 'F# C# G# D#');
    assert.equal(nm(T.armadura('Ab', 'maior').acidentes), 'Bb Eb Ab Db');
    T.MAIORES.forEach((t0) => {
      assert.equal(T.campo(t0, 'maior').map((g) => g.romano).join(' '), 'I ii iii IV V vi vii°', t0);
      assert.equal(T.campo(t0, 'maior', { tetrades: true }).map((g) => g.romano).join(' '), 'I7M ii7 iii7 IV7M V7 vi7 viiø', t0);
    });
    assert.equal(T.campo('A', 'menor', { variante: 'harmonica' })[4].simbolo, 'E', 'V maior na menor harmônica');
    assert.equal(T.realizar('A', 'menor', [5])[0].simbolo, 'E', 'a progressão em menor usa o V da harmônica');
    assert.equal(N.nome(T.relativa('Eb', 'maior').tonica), 'C'); assert.equal(N.nome(T.relativa('F#', 'menor').tonica), 'A');
    assert.equal(T.realizar('C', 'maior', [1, 4, 5], { dominantes: true }).map((x) => x.simbolo).join(' '), 'C7 F7 G7');
    assert.deepEqual(T.daArmadura(-3).maior, N.ler('Eb'));
  });

  await t('RITMO: fração EXATA — três colcheias de tercina = 1/4; pontos; 6/8 tem 2 pulsos; BPM pela mediana', async () => {
    const ter = R.duracao('colcheia', { quialtera: [3, 2] });
    assert.ok(R.iguais(R.somaDuracoes([ter, ter, ter]), R.fr(1, 4)));
    assert.equal(R.texto(R.duracao('seminima', { pontos: 1 })), '3/8'); assert.equal(R.texto(R.duracao('seminima', { pontos: 2 })), '7/16');
    const c68 = R.compasso('6/8'); assert.equal(c68.tipo, 'composto'); assert.equal(c68.pulsos, 2); assert.equal(R.texto(c68.unidade_pulso), '3/8');
    assert.equal(R.compasso('7/8').tipo, 'irregular'); assert.equal(R.compasso('3/4').tipo, 'simples'); assert.equal(R.compasso('4/5'), null);
    assert.ok(R.conferirCompasso([R.duracao('minima'), R.duracao('seminima', { pontos: 1 }), R.duracao('colcheia')], '4/4').fecha);
    assert.equal(R.ms(120, 'seminima'), 500); assert.equal(R.ms(120, 'colcheia', { pontos: 1 }), 375);
    const b = R.bpmDeToques([0, 500, 1000, 1700, 2000, 2500, 3000]);
    assert.equal(b.bpm, 120, 'um toque fora não arrasta a mediana');
    assert.equal(R.desvioDoPulso([0, 500, 1010, 1490], 120).pior_ms, 10);
    assert.deepEqual(R.polirritmo(3, 2).a.map(Number), [1, 0, 1, 0, 1, 0]);
  });

  await t('PAUTA: sol, fá, dó (3ª e 4ª) linha por linha; a posição vem da GRAFIA (dó♯ ≠ ré♭)', async () => {
    const pos = (n, c) => P.posicao(n, c).posicao;
    assert.equal(pos('E4', 'sol'), 0); assert.equal(pos('G4', 'sol'), 2); assert.equal(pos('F5', 'sol'), 8); assert.equal(pos('C4', 'sol'), -2);
    assert.equal(pos('G2', 'fa'), 0); assert.equal(pos('F3', 'fa'), 6); assert.equal(pos('C4', 'fa'), 10);
    assert.equal(pos('C4', 'do3'), 4); assert.equal(pos('C4', 'do4'), 6);
    assert.notEqual(pos('C#4', 'sol'), pos('Db4', 'sol'));
    assert.deepEqual(P.posicao('C4', 'sol').suplementares, [-2]); assert.deepEqual(P.posicao('A3', 'sol').suplementares, [-2, -4]); assert.deepEqual(P.posicao('C6', 'sol').suplementares, [10, 12]);
    assert.deepEqual(P.armadura(7, 'sol').map((x) => x.posicao), [8, 5, 9, 6, 3, 7, 4]);
    assert.deepEqual(P.armadura(-7, 'sol').map((x) => x.posicao), [4, 7, 3, 6, 2, 5, 1]);
    assert.deepEqual(P.armadura(-3, 'fa').map((x) => x.posicao), [2, 5, 1]);
    assert.deepEqual(P.armadura(2, 'do4').map((x) => x.posicao), [2, 6], 'tenor: fá# na 2ª linha, dó# na 4ª');
    assert.equal(P.nomeDaPosicao(2), '2ª linha'); assert.equal(P.nomeDaPosicao(-2), '1ª linha suplementar inferior'); assert.equal(P.nomeDaPosicao(9), 'espaço acima da pauta');
    for (let p = -6; p <= 14; p++) ['sol', 'fa', 'do3', 'do4'].forEach((c) => assert.equal(pos(P.naturalNaPosicao(p, c), c), p, `${c} ${p}`));
  });

  await t('INSTRUMENTOS: braço calculado (afinações, reentrante, personalizada) e extensões derivadas', async () => {
    const v = INS.afinacao('violao', 'padrao');
    assert.equal(INS.midiNaCasa(v, 0, 5), N.midi('A2')); assert.equal(INS.midiNaCasa(v, 5, 0), N.midi('E4'));
    assert.deepEqual(INS.afinacao('ukulele', 'padrao').midi, [67, 60, 64, 69], 'sol4 reentrante');
    assert.deepEqual(INS.afinacao('violao', 'drop-d').midi.slice(0, 1), [38]);
    assert.deepEqual(INS.afinacaoPersonalizada('D A D G B E', 'violao').midi, [38, 45, 50, 55, 59, 64]);
    assert.equal(INS.afinacaoPersonalizada('D A D', 'violao'), null);
    const ex = INS.extensaoDeCordas('violao', 'padrao'); assert.deepEqual([ex.grave, ex.agudo], [40, 83]);
    const pos = INS.posicoes(v, [0], 12); assert.ok(pos.every((p) => N.mod(v.midi[p.corda] + p.casa, 12) === 0) && pos.length === 6, 'dó nas 6 cordas até a casa 12 (8, 3, 10, 5, 1, 8)');
    Object.keys(INS.CORDAS).forEach((k) => Object.keys(INS.CORDAS[k].afinacoes).forEach((a) => assert.ok(INS.afinacao(k, a).midi.every((m) => m > 20 && m < 90), k + ' ' + a)));
  });

  await t('ACÚSTICA: série harmônica (7º harmônico ~ −31 cents) e terça justa ~14 cents abaixo da temperada', async () => {
    const s = AC.serieHarmonica('C2', 8);
    assert.equal(N.nome(s[1].nota), 'C3'); assert.equal(N.nome(s[2].nota), 'G3'); assert.equal(N.nome(s[4].nota), 'E4');
    assert.ok(s[6].cents < -25 && s[6].cents > -35, '7º: ' + s[6].cents);
    const tm = AC.comparacaoTemperamento().find((x) => x.semitons === 4);
    assert.ok(Math.abs(tm.diferenca - 13.7) < 0.2, 'terça: ' + tm.diferenca);
  });

  secao('Laboratório · exercícios, desenho e busca');

  await t('EXERCÍCIOS: mesma semente = mesma questão; a certa está nas opções; corrigir aceita a certa (todos os tipos e níveis)', async () => {
    let n = 0;
    X.LISTA.forEach((x) => { for (let nv = 1; nv <= x.niveis.length; nv++) for (let s = 0; s < 60; s++) {
      const q = X.gerar(x.id, { nivel: nv, semente: s });
      assert.deepEqual(X.publica(q), X.publica(X.gerar(x.id, { nivel: nv, semente: s })), x.id);
      if (q.opcoes) assert.ok(q.opcoes.some((o) => o.valor === q.resposta) && new Set(q.opcoes.map((o) => o.valor)).size === q.opcoes.length, x.id + ' opções');
      assert.ok(X.corrigir(q, q.resposta).certo, x.id); assert.equal(q.versao, X.VERSAO); n++;
    } });
    assert.ok(n > 1500);
  });

  // ⚠️ "A resposta está entre as opções e corrige certo" é CONSISTÊNCIA, não
  // verdade: um gerador que inventa a resposta errada passa nesse teste
  // (aconteceu com o "complete o compasso", 5% das questões). Aqui cada
  // resposta é conferida por um caminho INDEPENDENTE, a partir do que o
  // aluno vê.
  await t('EXERCÍCIOS: a resposta certa é VERDADE musical, conferida pelo que a questão mostra (todos os tipos, 1.500+ questões)', async () => {
    const verif = {
      'nota-na-pauta': (q) => N.mesmaGrafia(N.semOitava(N.ler(q.visual.notas[0].nota)), q.resposta),
      'intervalo-identificar': (q) => I.entre(q.visual.notas[0].nota, q.visual.notas[1].nota).curto === q.resposta,
      'intervalo-construir': (q) => { const iv = I.ler(q.enunciado.match(/uma (.+) acima de/)[1]); const med = I.entre(N.semOitava(N.ler(q.visual.notas[0].nota)), q.resposta).curto; return med === iv.curto || (iv.curto === '8J' && med === '1J'); },
      'intervalo-ouvido': (q) => Math.abs(q.audio.midis[1] - q.audio.midis[0]) === I.ler(q.resposta).semitons,
      'acorde-identificar': (q) => A.identificar(q.visual.notas.map((x) => x.nota)).some((c) => c.simbolo === q.resposta && !c.baixo),
      'acorde-ouvido': (q) => JSON.stringify(q.audio.midis.map((m) => m - q.audio.midis[0])) === JSON.stringify(A.semitons(q.resposta)),
      'escala-identificar': (q) => { const ns = E.notas(N.ler(q.visual.notas[0].nota), q.resposta); return ns && ns.every((n, i) => N.mesmaGrafia(n, q.visual.notas[i].nota)); },
      'armadura-identificar': (q) => { const x = T.deSlug(q.resposta); return T.armadura(x.tonica, x.modo).quantidade === q.visual.armadura && q.enunciado.includes(x.modo.toUpperCase()); },
      'nota-no-teclado': (q) => { const m = q.enunciado.match(/\(([A-G][#b]?)\)/); return N.pc(m[1]) === Number(q.resposta); },
      'campo-grau': (q) => { const m = q.enunciado.match(/^Em (.+) (maior|menor), qual é o acorde do (\d)º grau/); const acs = T.realizar(N.ler(m[1]), m[2], [Number(m[3])], { tetrades: q.nivel === 2 }); return acs[0].simbolo === q.resposta; },
      'ritmo-completar': (q) => { const v = q.visual; const [f, p] = [q.resposta.replace('.', ''), q.resposta.endsWith('.') ? 1 : 0]; return v.figuras.length > 0 && R.iguais(R.soma(R.somaDuracoes(v.figuras.map((x) => R.duracao(x.figura, { pontos: x.pontos }))), R.duracao(f, { pontos: p })), R.compasso(v.compasso).capacidade); },
      'nota-no-braco': (q) => { const d = q.visual.destaques[0]; return N.mod(INS.afinacao(q.visual.instrumento, 'padrao').midi[d.corda] + d.casa, 12) === Number(q.resposta); },
      'leitura-primeira-vista': (q) => JSON.stringify(q.visual.notas.map((x) => N.midi(x.nota))) === JSON.stringify(q.resposta.split(',').map(Number))
        && q.visual.armadura === T.armadura(N.ler(q.enunciado.match(/\((.+) maior\)/)[1]), 'maior').quantidade,
      'ditado-ritmico': (q) => { const t = q.resposta.split(',').map(Number); const sem = 60000 / q.bpm / 4; return JSON.stringify(t.map((x) => Math.round(x / sem))) === JSON.stringify(q.audio.ritmo) && q.audio.ritmo[0] === 0 && R.iguais(R.somaDuracoes(q.mostrar.figuras.map((f) => R.duracao(f.figura, { pontos: f.pontos }))), R.fr(1, 1)); },
      'ditado-duas-vozes': (q) => { const [a, b] = q.resposta.split('|').map((x) => x.split('.').map(Number)); return a.length === q.audio.sequencia.length && b.length === a.length && q.audio.sequencia.every((c) => c[0] < c[1]); },
      'cadencia-ouvido': (q) => { const c = T.CADENCIAS.find((x) => x.id === q.resposta); return !!c && q.audio.sequencia.length === 3 && q.opcoes.some((o) => o.valor === q.resposta); },
      'transposicao': (q) => { const m = q.enunciado.match(/^Transponha (.+) de (.+) maior para (.+) maior\.$/); const de = m[1].split(' ').map(A.ler), para = q.resposta.split(' ').map(A.ler); const semi = N.mod(N.pc(N.ler(m[3])) - N.pc(N.ler(m[2])), 12); return de.length === para.length && de.every((x, i) => N.mod(N.pc(x.fundamental) + semi, 12) === N.pc(para[i].fundamental) && x.id === para[i].id); },
      'escala-no-braco': (q) => { const m = q.enunciado.match(/notas de (.+?) (maior|menor natural|pentatônica maior|pentatônica menor|dórico|mixolídio) \(/); const e = E.CATALOGO.find((x) => x.nome === m[2]); return E.notas(N.ler(m[1]), e.id).map(N.pc).sort((a, b) => a - b).join(',') === q.resposta; },
    };
    assert.deepEqual(Object.keys(verif).sort(), X.LISTA.map((x) => x.id).sort(), 'todo tipo de exercício tem verificação independente');
    let n = 0;
    X.LISTA.forEach((x) => { for (let nv = 1; nv <= x.niveis.length; nv++) for (let s = 0; s < 130; s++) {
      const q = X.gerar(x.id, { nivel: nv, semente: s });
      assert.ok(verif[x.id](q), `${x.id} nível ${nv} semente ${s}: a resposta "${q.resposta}" não confere com o que a questão mostra`); n++;
    } });
    assert.ok(n > 1500, 'conferidas ' + n);
  });

  await t('EXERCÍCIOS: grafia × altura — enarmônico é ERRO na leitura (e a explicação diz por quê), CERTO no teclado e no ouvido', async () => {
    let q; for (let s = 0; s < 400 && !(q && N.ler(q.resposta).alt); s++) q = X.gerar('nota-na-pauta', { nivel: 3, semente: s });
    const outra = N.nome(N.enarmonicos(q.resposta).find((e) => !N.mesmaGrafia(e, q.resposta)), { oitava: false });
    const c = X.corrigir(q, outra);
    assert.equal(c.certo, false); assert.match(c.explicacao, /Mesmo SOM/);
    const tec = X.gerar('nota-no-teclado', { nivel: 2, semente: 5 });
    assert.ok(X.corrigir(tec, String(Number(tec.resposta) + 12 * 5)).certo, 'qualquer oitava vale no teclado');
    const ou = X.gerar('intervalo-ouvido', { nivel: 1, semente: 3 });
    assert.equal(ou.mede, 'altura'); assert.ok(ou.auditivo && ou.mostrar, 'auditivo tem alternativa visual depois de responder');
    const iv = X.gerar('intervalo-identificar', { nivel: 1, semente: 1 });
    const errada = iv.opcoes.find((o) => o.valor !== iv.resposta);
    const ce = X.corrigir(iv, errada.valor);
    assert.ok(!ce.certo && ce.esperado && ce.recebido && /LETRAS/.test(ce.explicacao) && ce.revisar.url.startsWith('/music/intervalos/'), 'feedback completo');
  });

  await t('DESENHO: a nota sai no y da pauta calculada, o acidente vem junto, tudo escapado; braço de canhoto espelha', async () => {
    const svg = D.pauta({ clave: 'sol', notas: [{ nota: 'E4' }, { nota: 'F#5' }] });
    const cys = [...svg.matchAll(/class="p-nota[^"]*" cx="([\d.]+)" cy="([\d.]+)"/g)].map((m) => Number(m[2]));
    assert.equal(cys[0] - cys[1], 8 * 5, 'mi4 na 1ª linha e fá#5 na 5ª: 4 espaços de distância');
    assert.match(svg, /p-acid-g/); assert.match(svg, /<title id="[^"]+">Pauta em clave de sol<\/title>/);
    assert.match(svg, /fá sustenido 5 \(5ª linha\)/, 'descrição textual para leitor de tela');
    const mal = D.pauta({ clave: 'sol', notas: [{ nota: 'C4', rotulo: '<script>x</script>' }], titulo: '"><img>' });
    assert.ok(!mal.includes('<script>') && !mal.includes('"><img>'), 'escapa rótulo e título');
    const piano = D.piano({ de: 60, ate: 71 }); assert.equal((piano.match(/k-b/g) || []).length, 7); assert.equal((piano.match(/k-p/g) || []).length, 5);
    const af = INS.afinacao('violao', 'padrao');
    const d1 = D.braco({ afinacao: af, casas: 5, destaques: [{ corda: 0, casa: 1, rotulo: 'x' }] });
    const d2 = D.braco({ afinacao: af, casas: 5, canhoto: true, destaques: [{ corda: 0, casa: 1, rotulo: 'x' }] });
    const cx = (s) => Number(s.match(/class="b-pt[^"]*" cx="([\d.]+)"/)[1]);
    const larg = Number(d1.match(/viewBox="0 0 ([\d.]+)/)[1]);
    assert.ok(Math.abs(cx(d1) + cx(d2) - larg) < 0.2, 'canhoto espelha a posição');
  });

  await t('BUSCA: entende "dó sustenido", "C#", "3M", "harmonic minor", "campo harmônico de Ré", "G7(b9)", "si bemol"', async () => {
    const primeiro = (q) => (CAT.buscar(q)[0] || {}).url;
    assert.equal(primeiro('dó sustenido'), '/music/notas/do-sustenido'); assert.equal(primeiro('C#'), '/music/notas/do-sustenido');
    assert.equal(primeiro('si bemol'), '/music/notas/si-bemol');
    assert.equal(primeiro('3M'), '/music/intervalos/terca-maior'); assert.equal(primeiro('terça maior'), '/music/intervalos/terca-maior');
    assert.equal(primeiro('campo harmônico de Ré'), '/music/tonalidades/re-maior'); assert.equal(primeiro('Mi menor'), '/music/tonalidades/mi-menor');
    assert.equal(primeiro('acorde G7(b9)'), '/music/acordes/sol/7b9');
    assert.ok(CAT.buscar('harmonic minor').some((r) => /menor-harmonica/.test(r.url)));
    assert.ok(CAT.buscar('menor harmônica').some((r) => /menor-harmonica/.test(r.url)));
    assert.equal(primeiro('ré dórico'), '/music/escalas/re/dorico');
    const g = CAT.buscar('paradiddle').map((r) => r.grupo); assert.ok(g.length, 'palavra livre acha ferramenta/referência');
  });

  await t('ACESSO: a matriz é a fonte única — público, assinatura e docente, com motivo e caminho legíveis', async () => {
    Object.entries(ACESSO.CAPACIDADES).forEach(([k, c]) => assert.ok(['nada', 'assinatura', 'docente'].includes(c.requer), k));
    const anon = { logado: false }, venc = { logado: true, assinante: false }, ass = { logado: true, assinante: true }, doc = { logado: true, assinante: true, docente: true };
    assert.ok(ACESSO.pode('referencia', anon).ok && ACESSO.pode('ferramentas-criar', anon).ok && ACESSO.pode('pratica-demo', anon).ok);
    const r = ACESSO.pode('progresso', anon); assert.ok(!r.ok && r.acao.url === '/music/entrar' && r.motivo);
    assert.equal(ACESSO.pode('progresso', venc).acao.url, '/music/app#conta');
    assert.ok(ACESSO.pode('pratica-completa', ass).ok && !ACESSO.pode('ensinar', ass).ok && ACESSO.pode('ensinar', doc).ok);
    assert.equal(ACESSO.pode('inexistente', doc).ok, false);
  });

  secao('Laboratório · páginas, SEO, API paga, professor e isolamento');

  await t('PÁGINAS PÚBLICAS abrem sem conta (hub, ambientes, ferramentas, atlas, referências, jogos) e os scripts compilam', async () => {
    const urls = ['/music/laboratorio', '/music/aprender', '/music/explorar', '/music/criar', '/music/praticar', '/music/jogar', '/music/referencia', '/music/escalas', '/music/acordes', '/music/intervalos', '/music/notas', '/music/ensinar',
      '/music/escalas/re/dorico', '/music/escalas/sol-sustenido/menor-harmonica', '/music/acordes/sol/7', '/music/acordes/si-bemol/m7b5', '/music/tonalidades/mi-bemol-menor', '/music/tonalidades/do-maior',
      '/music/intervalos/terca-maior', '/music/notas/do-sustenido', '/music/aprender/som-e-nota', '/music/buscar?q=r%C3%A9%20d%C3%B3rico']
      .concat(CAT.FERRAMENTAS.map((f) => `/music/${f.ambiente}/${f.slug}`)).concat(CAT.REFERENCIAS.map((r) => '/music/referencia/' + r.slug))
      .concat(CAT.JOGOS.map((j) => '/music/jogar/' + j.slug)).concat(X.LISTA.map((x) => '/music/praticar/' + x.id));
    for (const u of urls) {
      const r = await req('GET', u, { cru: true });
      assert.equal(r.status, 200, u); assert.ok(r.texto.length > 2000, u + ' tem conteúdo');
      assert.ok(!/undefined|NaN|\[object Object\]/.test(r.texto.replace(/<script[\s\S]*?<\/script>/g, '')), u + ' sem undefined/NaN no HTML');
    }
    for (const s of ['/music/laboratorio-nucleo.js', '/music/laboratorio.js']) {
      const r = await req('GET', s, { cru: true });
      assert.equal(r.status, 200); assert.ok(r.texto.length > 20000, s); new vm.Script(r.texto);
      assert.match(r.headers.get('cache-control'), /no-cache/, 'sem max-age: não prende JS velho no SW');
    }
    const css = await req('GET', '/music/laboratorio.css', { cru: true }); assert.ok(css.texto.includes('.lab-piano'));
  });

  await t('SEO: enarmônico existe mas aponta canonical para a grafia simples; o sitemap só lista canônicas; lixo dá 404', async () => {
    const r = await req('GET', '/music/escalas/do-sustenido/maior', { cru: true });
    assert.equal(r.status, 200); assert.match(r.texto, /rel="canonical" href="[^"]*\/music\/escalas\/re-bemol\/maior"/);
    const f = await req('GET', '/music/escalas/fa-sustenido/maior', { cru: true });
    assert.match(f.texto, /rel="canonical" href="[^"]*\/music\/escalas\/(fa-sustenido|sol-bemol)\/maior"/);
    const urls = PG.urlsDoSitemap().map((x) => x.url);
    assert.ok(!urls.includes('/music/escalas/do-sustenido/maior') && urls.includes('/music/escalas/re-bemol/maior'));
    assert.equal(new Set(urls).size, urls.length, 'sem URL repetida');
    for (const u of ['/music/escalas/xx/maior', '/music/escalas/do/nao-existe', '/music/acordes/do/zz', '/music/tonalidades/h-maior', '/music/intervalos/quinta-roxa', '/music/aprender/nada', '/music/explorar/nada', '/music/escalas/do-dobrado-sustenido/maior']) {
      const x = await req('GET', u, { cru: true }); assert.equal(x.status, 404, u); assert.match(x.texto, /noindex/);
    }
    const b = await req('GET', '/music/buscar?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E', { cru: true });
    assert.ok(!b.texto.includes('<script>alert(1)'), 'busca escapa o termo'); assert.match(b.texto, /noindex/);
    const st = PG.estadoInicial({ i: '<script>', af: '../../x', t: 'zz', bpm: '99999' });
    assert.deepEqual([st.instrumento, st.afinacao, st.tonica, st.bpm], ['violao', 'padrao', 'do', 300], 'deep link inválido volta ao padrão');
  });

  await t('LIÇÕES: as 3 primeiras são abertas; da 4ª em diante, sem assinatura o conteúdo NÃO vai (só o convite com o motivo)', async () => {
    const quarta = L.LICOES[3];
    const anon = await req('GET', '/music/aprender/' + quarta.slug, { cru: true });
    assert.equal(anon.status, 200); assert.match(anon.texto, /lab-portao/);
    const trecho = quarta.blocos.filter((b) => b.t === 'p')[1];
    assert.ok(trecho && !anon.texto.includes(trecho.html.slice(0, 60)), 'o 2º parágrafo não vai para quem não assina');
    const ana = await req('GET', '/music/aprender/' + quarta.slug, { como: 'ana', cru: true });
    assert.ok(!/lab-portao/.test(ana.texto) && ana.texto.includes(trecho.html.slice(0, 60)), 'no teste grátis, a lição inteira');
    const primeira = await req('GET', '/music/aprender/' + L.LICOES[0].slug, { cru: true });
    assert.ok(!/lab-portao/.test(primeira.texto));
  });

  await t('API PAGA: sem conta 401; o servidor corrige DE NOVO (não confia no navegador), grava como lab: e agenda a revisão', async () => {
    assert.equal((await req('POST', '/music/api/lab/responder', { corpo: { tipo: 'intervalo-identificar', nivel: 1, semente: 7, resposta: '3M' } })).status, 401);
    const q = X.gerar('intervalo-identificar', { nivel: 1, semente: 7 });
    const errada = q.opcoes.find((o) => o.valor !== q.resposta).valor;
    const r1 = await req('POST', '/music/api/lab/responder', { como: 'ana', corpo: { tipo: 'intervalo-identificar', nivel: 1, semente: 7, resposta: errada, certo: true } });
    assert.equal(r1.status, 200); assert.equal(r1.json.certo, false, 'o "certo: true" do cliente é ignorado');
    const r2 = await req('POST', '/music/api/lab/responder', { como: 'ana', corpo: { tipo: 'intervalo-identificar', nivel: 1, semente: 7, resposta: q.resposta } });
    assert.equal(r2.json.certo, true); assert.ok(r2.json.proxima_revisao_dias >= 1);
    const linhas = db.prepare("SELECT * FROM tentativas WHERE usuario = 'u-ana' AND tipo = 'lab:intervalo-identificar'").all();
    assert.equal(linhas.length, 2); assert.ok(linhas.every((l) => l.vale_nota === 0 && l.familia === 'lab:intervalos'));
    assert.equal(JSON.parse(linhas[0].esperado).versao, X.VERSAO, 'a versão do gerador fica na tentativa');
    assert.ok(db.prepare("SELECT 1 FROM agenda_revisao WHERE usuario = 'u-ana' AND familia = 'lab:intervalos'").get());
    const p = await req('GET', '/music/api/lab/progresso', { como: 'ana' });
    assert.equal(p.json.por_tipo['intervalo-identificar'].tentativas, 2);
    const pb = await req('GET', '/music/api/lab/progresso', { como: 'bruno' });
    assert.equal(Object.keys(pb.json.por_tipo).length, 0, 'o progresso da Ana não aparece para o Bruno');
    assert.equal((await req('POST', '/music/api/lab/responder', { como: 'ana', corpo: { tipo: 'nao-existe', semente: 1, resposta: 'x' } })).status, 400);
  });

  await t('FAVORITOS e JOGOS por pessoa; LGPD: exporta e exclui só o que é seu, com confirmação', async () => {
    assert.equal((await req('POST', '/music/api/lab/favoritos', { como: 'ana', corpo: { url: 'https://mal.com/x' } })).status, 400);
    await req('POST', '/music/api/lab/favoritos', { como: 'ana', corpo: { url: '/music/escalas/re/dorico', titulo: 'Ré dórico' } });
    assert.equal((await req('GET', '/music/api/lab/favoritos', { como: 'ana' })).json.favoritos.length, 1);
    assert.equal((await req('GET', '/music/api/lab/favoritos', { como: 'bruno' })).json.favoritos.length, 0);
    const j = await req('POST', '/music/api/lab/jogos', { como: 'ana', corpo: { jogo: 'caca-a-nota', dia: '2026-09-28', pontos: 120 } });
    await req('POST', '/music/api/lab/jogos', { como: 'ana', corpo: { jogo: 'caca-a-nota', dia: '2026-09-28', pontos: 80 } });
    assert.equal(j.json.melhor, 120); assert.equal((await req('GET', '/music/api/lab/jogos/caca-a-nota', { como: 'ana' })).json.melhor, 120, 'a pior rodada não apaga a melhor');
    const exp = await req('GET', '/music/api/lab/meus-dados', { como: 'ana', cru: true });
    assert.equal(exp.status, 200); const dados = JSON.parse(exp.texto); assert.ok(dados.tentativas.length >= 2 && dados.favoritos.length === 1);
    await req('POST', '/music/api/lab/responder', { como: 'bruno', corpo: { tipo: 'nota-na-pauta', nivel: 1, semente: 1, resposta: 'C' } });
    assert.equal((await req('POST', '/music/api/lab/meus-dados/excluir', { como: 'ana', corpo: { confirmacao: 'sim' } })).status, 400);
    const ex = await req('POST', '/music/api/lab/meus-dados/excluir', { como: 'ana', corpo: { confirmacao: 'EXCLUIR' } });
    assert.ok(ex.json.tentativas_excluidas >= 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tentativas WHERE usuario = 'u-ana' AND tipo LIKE 'lab:%'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tentativas WHERE usuario = 'u-bruno' AND tipo LIKE 'lab:%'").get().n, 1, 'os dados do Bruno ficam');
    assert.ok(/lab\\\/meus-dados/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'sessao.js'), 'utf8')), 'LGPD do Laboratório não fica refém da assinatura (SEM_PAGAR)');
  });

  await t('PROFESSOR: só docente cria; atividade vira TAREFA; aluno sem vínculo não vê; gabarito não vai; relatório só do dono', async () => {
    // conta nova, no teste grátis, que não é professor por nenhum dos dois caminhos
    const contas = require('../contas');
    const cad = await req('POST', '/music/api/conta/cadastrar', { corpo: { nome: 'Aluno Novo', email: 'alunonovo@t', senha: 'senha-boa-123', aceite_termos: true } });
    const ckNovo = { Cookie: (cad.setCookie || []).find((x) => x.startsWith(contas.COOKIE + '=')).split(';')[0] };
    const neg = await req('POST', '/music/api/lab/atividades', { headers: ckNovo, corpo: { titulo: 'x', tipos: ['nota-na-pauta'] } });
    assert.equal(neg.status, 403); assert.match(neg.json.erro, /professor/);
    const pv = await req('POST', '/music/api/lab/atividades/previa', { como: 'prof', corpo: { tipos: ['intervalo-identificar', 'nota-na-pauta'], nivel: 1, questoes: 4 } });
    assert.equal(pv.status, 200); assert.equal(pv.json.questoes.length, 4); assert.ok(pv.json.questoes.every((q) => q.resposta === undefined), 'prévia sem gabarito');
    const c = await req('POST', '/music/api/lab/atividades', { como: 'prof', corpo: { titulo: 'Leitura — semana 1', tipos: ['nota-na-pauta'], nivel: 1, questoes: 5, emails: 'ana@t, ninguem@t' } });
    assert.equal(c.status, 200, JSON.stringify(c.json)); assert.equal(c.json.atribuidos, 1); assert.deepEqual(c.json.nao_encontrados, ['ninguem@t']);
    const tarefa = db.prepare('SELECT * FROM tarefas WHERE id = ?').get(c.json.tarefa_id);
    assert.ok(tarefa && tarefa.professor === 'u-prof' && tarefa.exige_audio === 0 && tarefa.instrucoes.includes('/music/atividade/' + c.json.id));
    const qa = await req('GET', `/music/api/lab/atividades/${c.json.id}/questoes`, { como: 'ana' });
    assert.equal(qa.status, 200); assert.equal(qa.json.questoes.length, 5); assert.ok(qa.json.questoes.every((q) => q.resposta === undefined), 'o gabarito não vai ao aluno');
    assert.equal((await req('GET', `/music/api/lab/atividades/${c.json.id}/questoes`, { como: 'bruno' })).status, 403);
    const q0 = qa.json.questoes[0];
    const certa = X.gerar(q0.tipo, { nivel: q0.nivel, semente: q0.semente }).resposta;
    const r = await req('POST', '/music/api/lab/responder', { como: 'ana', corpo: { tipo: q0.tipo, nivel: q0.nivel, semente: q0.semente, resposta: certa, sessao: qa.json.sessao } });
    assert.equal(r.json.certo, true);
    assert.equal((await req('POST', '/music/api/lab/responder', { como: 'bruno', corpo: { tipo: q0.tipo, nivel: q0.nivel, semente: q0.semente, resposta: certa, sessao: qa.json.sessao } })).status, 403, 'quem não está na tarefa não pontua na atividade');
    const rel = await req('GET', `/music/api/lab/atividades/${c.json.id}/relatorio`, { como: 'prof' });
    assert.equal(rel.status, 200); assert.equal(rel.json.alunos.length, 1); assert.equal(rel.json.alunos[0].aluno, 'Ana'); assert.equal(rel.json.alunos[0].acertos, 1);
    assert.match(rel.json.aviso, /não é nota/);
    // a Ana também dá aula numa escola (fase 3), mas a atividade não é dela: não vê
    assert.equal((await req('GET', `/music/api/lab/atividades/${c.json.id}/relatorio`, { como: 'ana' })).status, 404);
    assert.equal((await req('GET', `/music/api/lab/atividades/${c.json.id}/relatorio`, { headers: ckNovo })).status, 403);
    // mesma semente para todos: a questão do aluno é reproduzível pelo servidor
    const de_novo = await req('GET', `/music/api/lab/atividades/${c.json.id}/questoes`, { como: 'ana' });
    assert.deepEqual(de_novo.json.questoes.map((q) => q.semente), qa.json.questoes.map((q) => q.semente));
  });

  await t('ASSINATURA VENCIDA: o Laboratório pessoal fecha com 402 — mas as ferramentas e os dados (LGPD) continuam abertos', async () => {
    const contas = require('../contas');
    const cad = await req('POST', '/music/api/conta/cadastrar', { corpo: { nome: 'Lab Vencido', email: 'labvencido@t', senha: 'senha-boa-123', aceite_termos: true } });
    const ck = { Cookie: (cad.setCookie || []).find((x) => x.startsWith(contas.COOKIE + '=')).split(';')[0] };
    const c = contas.Contas.porEmail('labvencido@t');
    db.prepare('UPDATE contas_music SET criado_em = ? WHERE id = ?').run(new Date(Date.now() - 40 * 864e5).toISOString(), c.id);
    const cfg = require('../repo').Config.get('assinatura', {});
    require('../repo').Config.set('assinatura', { ...cfg, pago_desde: new Date(Date.now() - 60 * 864e5).toISOString() });
    try {
      const r = await req('GET', '/music/api/lab/progresso', { headers: ck });
      assert.equal(r.status, 402); assert.equal(r.json.codigo, 'ASSINATURA');
      assert.equal((await req('GET', '/music/api/lab/meus-dados', { headers: ck })).status, 200, 'dado pessoal não fica refém');
      assert.equal((await req('GET', '/music/explorar/piano', { headers: ck, cru: true })).status, 200, 'ferramenta continua aberta');
      const l = await req('GET', '/music/aprender/' + L.LICOES[5].slug, { headers: ck, cru: true });
      assert.match(l.texto, /lab-portao/); assert.match(l.texto, /Assinar o Musique/, 'o convite diz o caminho certo para quem já tem conta');
      const pr = await req('GET', '/music/praticar/nota-na-pauta', { headers: ck, cru: true });
      assert.match(pr.texto, /Modo demonstração/);
    } finally { require('../repo').Config.set('assinatura', cfg); }
  });

  secao('Laboratório · 2ª entrega: exercícios, ferramentas, professor, Cifras e teoria única');

  await t('EXERCÍCIOS NOVOS: leitura aceita qualquer oitava; ritmo tolera ±40 ms mas não um toque a mais; braço confere o CONJUNTO de notas; clave e extensão escolhidas valem', async () => {
    const l = X.gerar('leitura-primeira-vista', { nivel: 1, semente: 3 });
    assert.ok(X.corrigir(l, l.resposta.split(',').map((m) => Number(m) - 12).join(',')).certo, 'uma oitava abaixo vale (violão lê assim)');
    const errada = l.resposta.split(',').map(Number); errada[1] += 1;
    const cl = X.corrigir(l, errada.join(',')); assert.ok(!cl.certo && /A melodia era/.test(cl.explicacao));
    const r = X.gerar('ditado-ritmico', { nivel: 2, semente: 5 });
    const t0 = r.resposta.split(',').map(Number);
    assert.ok(X.corrigir(r, t0.map((x, i) => x + 500 + (i % 2 ? 35 : -35)).join(',')).certo, 'desvio de 35 ms passa');
    assert.ok(!X.corrigir(r, t0.concat([t0[t0.length - 1] + 400]).join(',')).certo, 'um toque a mais não passa');
    const b = X.gerar('escala-no-braco', { nivel: 1, semente: 2 });
    const cb = X.corrigir(b, b.resposta.split(',').slice(1).join(','));
    assert.ok(!cb.certo && /Faltaram/.test(cb.explicacao));
    const q = X.gerar('nota-na-pauta', { nivel: 1, semente: 9, params: { clave: 'do4', extensao: 'pauta', lixo: 'x' } });
    assert.equal(q.visual.clave, 'do4'); assert.deepEqual(q.params, { clave: 'do4', extensao: 'pauta' }, 'parâmetro não declarado é descartado');
    const p = P.posicao(q.visual.notas[0].nota, 'do4').posicao; assert.ok(p >= 0 && p <= 8, 'extensão "pauta" fica dentro das 5 linhas');
    const semP = X.gerar('nota-na-pauta', { nivel: 1, semente: 9 });
    assert.equal(semP.resposta, X.gerar('nota-na-pauta', { nivel: 1, semente: 9, params: {} }).resposta, 'sem parâmetro, a questão antiga continua a mesma');
  });

  await t('NÚCLEO: armadura na clave de tenor (sustenidos a partir da 2ª linha), motivos com grafia e matriz dodecafônica', async () => {
    assert.deepEqual(P.armadura(7, 'do4').map((x) => x.posicao), [2, 6, 3, 7, 4, 8, 5]);
    assert.deepEqual(P.armadura(-7, 'do4').map((x) => x.posicao), [5, 8, 4, 7, 3, 6, 2]);
    const Mo = require('./nucleo/motivos');
    const mot = Mo.lerMotivo('C4 E4 G4');
    assert.equal(Mo.inverter(mot).map((n) => N.nome(n)).join(' '), 'C4 Ab3 F3', 'terça maior que sobe vira terça maior que desce');
    assert.equal(Mo.transpor(mot, '5J').map((n) => N.nome(n)).join(' '), 'G4 B4 D5');
    assert.equal(Mo.retrogradoInverso(mot).map((n) => N.nome(n)).join(' '), 'F3 Ab3 C4');
    const s = [0, 11, 7, 8, 3, 1, 2, 10, 6, 5, 4, 9], mz = Mo.matriz(s);
    assert.deepEqual(mz.linhas[0], s); assert.equal(mz.P[0], 'P0');
    mz.linhas.forEach((l) => assert.equal(new Set(l).size, 12));
    for (let c = 0; c < 12; c++) assert.equal(new Set(mz.linhas.map((l) => l[c])).size, 12, 'cada coluna também tem as 12');
    assert.equal(Mo.matriz([0, 1, 2]), null); assert.equal(Mo.serieValida([0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), false);
  });

  await t('TEORIA ÚNICA: teoria.js e o motor das Cifras tiram escalas, acordes, pauta, grafia pelo tom e campo harmônico do núcleo — com o mesmo resultado de antes', async () => {
    const TE = require('../teoria');
    assert.deepEqual(TE.escala('D', 'dorico'), [2, 4, 5, 7, 9, 11, 0]);
    assert.deepEqual(TE.ESCALAS.blues.graus, [0, 3, 5, 6, 7, 10]); assert.equal(TE.ESCALAS.menor_harmonica.lab, 'menor-harmonica');
    assert.deepEqual(TE.ACORDES.diminuto7.graus, [0, 3, 6, 9]); assert.equal(TE.ACORDES.meio_diminuto.sufixo, 'm7(b5)');
    const p = TE.posicaoNaPauta(61, 'sol', { bemol: true }); assert.equal(p.acidente, 'b'); assert.equal(p.y, 128 + 7, 'ré♭4 no espaço do ré, logo abaixo da pauta');
    assert.equal(TE.posicaoNaPauta(48, 'fa').y, 128 - 3 * 7, 'dó3 na clave de fá (antes: não existia)');
    const H = require('../cifras/motor/harmonia'), CN = require('../cifras/motor/nota');
    assert.deepEqual(H.CAMPO_MAIOR, { 0: 'maior', 2: 'menor', 4: 'menor', 5: 'maior', 7: 'maior', 9: 'menor', 11: 'dim' });
    assert.deepEqual(H.CAMPO_MENOR, { 0: 'menor', 2: 'dim', 3: 'maior', 5: 'menor', 7: ['menor', 'maior'], 8: 'maior', 10: 'maior', 11: 'dim' });
    const bem = []; for (let pc = 0; pc < 12; pc++) bem.push(CN.usarBemol({ pc, menor: false }) ? 1 : 0);
    assert.equal(bem.join(''), '010101101010', 'mesma grafia pelo tom (derivada da armadura do núcleo)');
    const js = await req('GET', '/music/motor-cifras.js', { cru: true });
    assert.ok(js.texto.indexOf('MusiqueLab') >= 0 && js.texto.indexOf('MusiqueLab') < js.texto.indexOf('MusiqueMotor'), 'o núcleo vai na frente no pacote das Cifras');
    new vm.Script(js.texto);
  });

  await t('POR ONDE COMEÇAR: perfil validado, guardado por pessoa e na exportação LGPD; recomendação cobre as combinações', async () => {
    const hub = await req('GET', '/music/laboratorio', { cru: true }); assert.match(hub.texto, /Por onde começar\?/); assert.match(hub.texto, /id="lab-perfil"/);
    assert.equal((await req('POST', '/music/api/lab/perfil', { como: 'ana', corpo: { nivel: 'x', instrumento: 'violao', objetivo: 'teoria' } })).status, 400);
    assert.equal((await req('POST', '/music/api/lab/perfil', { como: 'ana', corpo: { nivel: 'toco', instrumento: 'cavaquinho', objetivo: 'tocar' } })).status, 200);
    assert.equal((await req('GET', '/music/api/lab/perfil', { como: 'ana' })).json.perfil.instrumento, 'cavaquinho');
    assert.equal((await req('GET', '/music/api/lab/perfil', { como: 'bruno' })).json.perfil, null);
    assert.ok(JSON.parse((await req('GET', '/music/api/lab/meus-dados', { como: 'ana', cru: true })).texto).perfil);
    const cli = PG.clienteJs(); const ctx = { window: {}, document: { addEventListener() {}, querySelector() { return null; } } };
    assert.match(cli, /function recomendar\(p\)/);
    // a recomendação existe para toda combinação (5 objetivos × 3 níveis) e aponta para páginas que existem
    const urls = new Set(PG.urlsDoSitemap().map((x) => x.url));
    const rec = cli.slice(cli.indexOf('function recomendar(p)'));
    [...rec.matchAll(/url: '(\/music\/[a-z0-9/-]+)/g)].map((m) => m[1]).forEach((u) => assert.ok(urls.has(u) || u === '/music/ferramentas' || u === '/music/criar/afinador-cordas?i=' || /\/music\/explorar\/braco$/.test(u), 'recomendação aponta para página inexistente: ' + u));
    void ctx;
  });

  await t('PROFESSOR: turma inteira pelo portão das escolas; atividades prontas; parâmetros valem na atividade; impressão só para o dono, com gabarito opcional', async () => {
    const tur = await req('GET', '/music/api/lab/turmas', { como: 'bruno' });
    assert.equal(tur.status, 200);
    const bib = await req('GET', '/music/api/lab/biblioteca', { como: 'prof' });
    assert.ok(bib.json.atividades.length >= 10); bib.json.atividades.forEach((a) => a.tipos.forEach((tp) => assert.ok(X.TIPOS[tp], a.titulo)));
    const c = await req('POST', '/music/api/lab/atividades', { como: 'prof', corpo: { titulo: 'Clave de dó', tipos: ['nota-na-pauta'], nivel: 1, questoes: 4, params: { clave: 'do3' }, emails: 'ana@t' } });
    assert.equal(c.status, 200);
    const qs = await req('GET', `/music/api/lab/atividades/${c.json.id}/questoes`, { como: 'ana' });
    assert.ok(qs.json.questoes.every((q) => q.visual.clave === 'do3'), 'o parâmetro do professor vale para o aluno');
    const q0 = qs.json.questoes[0];
    const certa = X.gerar(q0.tipo, { nivel: q0.nivel, semente: q0.semente, params: q0.params }).resposta;
    assert.equal((await req('POST', '/music/api/lab/responder', { como: 'ana', corpo: { tipo: q0.tipo, nivel: q0.nivel, semente: q0.semente, params: q0.params, resposta: certa, sessao: qs.json.sessao } })).json.certo, true, 'o servidor regenera COM os parâmetros');
    const imp = await req('GET', `/music/atividade/${c.json.id}/imprimir`, { como: 'prof', cru: true });
    assert.equal(imp.status, 200); assert.match(imp.texto, /window\.print/); assert.ok(!/Gabarito/.test(imp.texto.replace(/Versão com gabarito/, '')));
    const gab = await req('GET', `/music/atividade/${c.json.id}/imprimir?gabarito=1`, { como: 'prof', cru: true }); assert.match(gab.texto, /<h2>Gabarito<\/h2>/);
    assert.notEqual((await req('GET', `/music/atividade/${c.json.id}/imprimir`, { como: 'ana', cru: true })).status, 200, 'aluno não imprime o gabarito do professor');
    assert.equal((await req('GET', `/music/atividade/${c.json.id}/imprimir`, { cru: true })).status, 302, 'sem conta, vai para a entrada');
    assert.equal((await req('POST', `/music/api/lab/atividades/${c.json.id}/turma`, { como: 'prof', corpo: { turma_id: 'turma-de-outro' } })).status, 403, 'turma que não é sua é recusada');
    const rotas = require('fs').readFileSync(require('path').join(__dirname, 'rotas-api.js'), 'utf8');
    assert.ok(!/FROM (turmas|matriculas|org_membros|organizacoes)\b/.test(rotas), 'nada de consulta direta às tabelas de escola (ADR-0007)');
  });

  await t('CIFRAS ↔ LABORATÓRIO: acorde e tom da cifra abrem a página certa; a cifra tem o painel de análise em graus e o botão no detalhe do acorde', async () => {
    const a = await req('GET', '/music/laboratorio/acorde?c=' + encodeURIComponent('Bbm7(b5)'), { cru: true });
    assert.equal(a.status, 302); assert.equal(a.headers.get('location'), '/music/acordes/si-bemol/m7b5');
    assert.equal((await req('GET', '/music/laboratorio/acorde?c=' + encodeURIComponent('A#7'), { cru: true })).headers.get('location'), '/music/acordes/la-sustenido/7', 'mantém a grafia da cifra');
    assert.match((await req('GET', '/music/laboratorio/acorde?c=xyz', { cru: true })).headers.get('location'), /^\/music\/buscar/);
    assert.equal((await req('GET', '/music/laboratorio/tom?t=Em', { cru: true })).headers.get('location'), '/music/tonalidades/mi-menor');
    assert.equal((await req('GET', '/music/laboratorio/tom?t=Bb', { cru: true })).headers.get('location'), '/music/tonalidades/si-bemol-maior');
    const cif = (await req('GET', '/music/cifras.js', { cru: true })).texto;
    assert.match(cif, /C\.paineis\.graus = function/); assert.match(cif, /\/music\/laboratorio\/acorde\?c=/); assert.match(cif, /'graus', 'Análise em graus/);
  });

  await t('PÁGINAS NOVAS abrem: 10 ferramentas, 9 lições, solfejo; lições com duas vozes e progressões tocáveis', async () => {
    const novas = ['explorar/comparar-modos', 'explorar/piano-isomorfico', 'explorar/serie-dodecafonica', 'criar/afinador-cordas', 'criar/extensao-vocal', 'criar/metronomo-progressivo',
      'criar/mini-maquina', 'criar/motivos', 'criar/xilofone', 'criar/gerador-de-bumbo', 'referencia/solfejo'];
    for (const u of novas) { const r = await req('GET', '/music/' + u, { cru: true }); assert.equal(r.status, 200, u); }
    assert.equal(L.LICOES.length, 24);
    for (const l of L.LICOES.slice(15)) { const r = await req('GET', '/music/aprender/' + l.slug, { como: 'ana', cru: true }); assert.equal(r.status, 200, l.slug); assert.ok(!/undefined|NaN/.test(r.texto.replace(/<script[\s\S]*?<\/script>/g, '')), l.slug); }
    const hp = await req('GET', '/music/aprender/harmonia-popular', { como: 'ana', cru: true }); assert.match(hp.texto, /data-sequencia=/); assert.match(hp.texto, /Db7/);
    const cp = await req('GET', '/music/aprender/contraponto', { como: 'ana', cru: true }); assert.match(cp.texto, /class="lab-svg lab-pauta"/);
    const X2 = X.LISTA.map((x) => x.id); ['leitura-primeira-vista', 'ditado-ritmico', 'ditado-duas-vozes', 'cadencia-ouvido', 'transposicao', 'escala-no-braco'].forEach((id) => assert.ok(X2.includes(id), id));
    assert.match(PG.clienteJs(), /Modo aula/);
  });

  await t('CABEÇALHO ÚNICO: o mesmo menu (Laboratório, Cifras, Ferramentas) em todas as páginas públicas, inclusive as das Cifras, com a seção atual marcada', async () => {
    const casos = [['/music', ''], ['/music/laboratorio', 'Laboratório'], ['/music/escalas/re/dorico', 'Laboratório'], ['/music/ferramentas', 'Ferramentas'],
      ['/music/cifras-publicas', 'Cifras'], ['/music/p/nao-existe', 'Cifras'], ['/music/termos', '']];
    for (const [u, atual] of casos) {
      const r = await req('GET', u, { cru: true });
      assert.equal((r.texto.match(/class="mq-topo"/g) || []).length, 1, u + ' tem o cabeçalho (uma vez)');
      ['/music/laboratorio', '/music/cifras-publicas', '/music/ferramentas'].forEach((l) => assert.ok(r.texto.includes('href="' + l + '"'), u + ' → ' + l));
      const m = r.texto.match(/aria-current="page">([^<]+)</);
      assert.equal(m ? m[1] : '', atual, u + ': seção marcada');
    }
  });

  await t('COBERTURA: toda ferramenta, jogo, referência e lição do catálogo tem página; toda lição aponta para exercício existente', async () => {
    L.LICOES.forEach((l) => {
      l.blocos.filter((b) => b.t === 'praticar').forEach((b) => assert.ok(X.TIPOS[b.tipo], l.slug + ' → ' + b.tipo));
      l.blocos.filter((b) => b.t === 'ferramenta').forEach((b) => assert.ok(CAT.FERRAMENTAS.find((f) => f.slug === b.slug), l.slug + ' → ' + b.slug));
      l.prereq.forEach((p) => assert.ok(L.POR_SLUG[p], l.slug + ' pré-requisito ' + p));
      assert.ok(l.blocos.some((b) => b.t === 'visual' || b.t === 'ouvir' || b.t === 'praticar'), l.slug + ' tem ver/ouvir/praticar');
    });
    CAT.JOGOS.forEach((j) => j.tipos.forEach((tp) => assert.ok(X.TIPOS[tp], j.slug + ' → ' + tp)));
    const clientes = PG.clienteJs();
    CAT.FERRAMENTAS.forEach((f) => assert.ok(clientes.includes("F['" + f.slug + "']") || clientes.includes('F.' + f.slug.replace(/-/g, '_') + ' ') || clientes.includes('F.' + f.slug + ' '), 'ferramenta sem implementação no cliente: ' + f.slug));
  });
}

module.exports = { rodar };
