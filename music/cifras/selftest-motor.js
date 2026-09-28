// =====================================================================
// Musique Cifras — testes do MOTOR (puro). Rodam dentro do
// `npm run test:music` e também sozinhos: `node music/cifras/selftest-motor.js`.
//
// Três tipos de teste, cada um pegando um tipo de defeito:
//   · TABELAS de casos extremos — cada linha é um acorde que já quebrou
//     (ou que quebraria) um parser ingênuo;
//   · PROPRIEDADES com semente fixa — transpor N e depois −N devolve a
//     mesma harmonia; transpor nunca mexe na letra; ChordPro ida e volta
//     devolve o mesmo documento. Valem para QUALQUER cifra, não só para
//     as que alguém lembrou de escrever;
//   · CENÁRIOS reais — a cifra colada de site, com cabeçalho, tab e "2x".
// =====================================================================
'use strict';
const N = require('./motor/nota');
const A = require('./motor/acorde');
const H = require('./motor/harmonia');
const D = require('./motor/documento');
const I = require('./motor/instrumentos');

async function rodar({ t, secao, assert }) {
  secao('Cifras · motor harmônico — parser de acordes (tabela de casos)');

  // [texto, qualidade, sétima, notas esperadas (pcs, qualquer ordem), reconhecido]
  const TABELA = [
    ['C', 'maior', null, [0, 4, 7]],
    ['Cm', 'menor', null, [0, 3, 7]],
    ['C7', 'maior', 'b7', [0, 4, 7, 10]],
    ['C7M', 'maior', '7M', [0, 4, 7, 11]],
    ['Cmaj7', 'maior', '7M', [0, 4, 7, 11]],
    ['CM7', 'maior', '7M', [0, 4, 7, 11]],
    ['CΔ7', 'maior', '7M', [0, 4, 7, 11]],
    ['Cm7', 'menor', 'b7', [0, 3, 7, 10]],
    ['Cm(maj7)', 'menor', '7M', [0, 3, 7, 11]],
    ['Cm7M', 'menor', '7M', [0, 3, 7, 11]],
    ['Cdim', 'dim', null, [0, 3, 6]],
    ['C°', 'dim', null, [0, 3, 6]],
    ['Cº7', 'dim', 'dim7', [0, 3, 6, 9]],
    ['Cdim7', 'dim', 'dim7', [0, 3, 6, 9]],
    ['Cø', 'meio-dim', 'b7', [0, 3, 6, 10]],
    ['Cm7(b5)', 'menor', 'b7', [0, 3, 6, 10]],
    ['Cm7b5', 'menor', 'b7', [0, 3, 6, 10]],
    ['Caug', 'aug', null, [0, 4, 8]],
    ['C+', 'aug', null, [0, 4, 8]],
    ['C(#5)', 'maior', null, [0, 4, 8]],
    ['Csus4', 'sus4', null, [0, 5, 7]],
    ['Csus2', 'sus2', null, [0, 2, 7]],
    ['Csus', 'sus4', null, [0, 5, 7]],
    ['C4', 'sus4', null, [0, 5, 7]],
    ['C7(4)', 'sus4', 'b7', [0, 5, 7, 10]],
    ['C5', 'power', null, [0, 7]],
    ['C6', 'maior', null, [0, 4, 7, 9]],
    ['C6/9', 'maior', null, [0, 4, 7, 9, 2]],
    ['C6(9)', 'maior', null, [0, 4, 7, 9, 2]],
    ['C9', 'maior', null, [0, 4, 7, 2]],            // convenção brasileira: nona ADICIONADA
    ['C(9)', 'maior', null, [0, 4, 7, 2]],
    ['Cadd9', 'maior', null, [0, 4, 7, 2]],
    ['C7(9)', 'maior', 'b7', [0, 4, 7, 10, 2]],
    ['C7(b9)', 'maior', 'b7', [0, 4, 7, 10, 1]],
    ['C7(#9)', 'maior', 'b7', [0, 4, 7, 10, 3]],
    ['C7(#11)', 'maior', 'b7', [0, 4, 7, 10, 6]],
    ['C7(b13)', 'maior', 'b7', [0, 4, 7, 10, 8]],
    ['C7(13)', 'maior', 'b7', [0, 4, 7, 10, 9]],
    ['C7M(9)', 'maior', '7M', [0, 4, 7, 11, 2]],
    ['Cm7(9)', 'menor', 'b7', [0, 3, 7, 10, 2]],
    ['Cm7(11)', 'menor', 'b7', [0, 3, 7, 10, 5]],
    ['C7(4/9)', 'sus4', 'b7', [0, 5, 7, 10, 2]],
    ['C7(b9,#11)', 'maior', 'b7', [0, 4, 7, 10, 1, 6]],
    ['C7(b5)', 'maior', 'b7', [0, 4, 6, 10]],
    ['C7-5', 'maior', 'b7', [0, 4, 6, 10]],
    ['C7+5', 'maior', 'b7', [0, 4, 8, 10]],
    ['C(omit3)', 'maior', null, [0, 7]],
    ['Cmaj9', 'maior', '7M', [0, 4, 7, 11, 2]],
    ['C7+', 'maior', '7M', [0, 4, 7, 11]],          // brasileiro: sétima maior
  ];
  await t(`reconhece ${TABELA.length} formas de acorde com as notas certas`, async () => {
    for (const [txt, q, set, pcs] of TABELA) {
      const ac = A.ler(txt);
      assert.ok(ac, `${txt}: devia ser acorde`);
      assert.ok(ac.reconhecido, `${txt}: devia ser reconhecido (sobrou "${ac.desconhecido}")`);
      assert.equal(ac.qualidade, q, `${txt}: qualidade`);
      assert.equal(ac.setima, set, `${txt}: sétima`);
      assert.deepEqual(A.notas(ac).slice().sort((a, b) => a - b), pcs.slice().sort((a, b) => a - b), `${txt}: notas`);
    }
  });

  await t('baixo invertido: D/F#, Am/C, C/Bb — e "6/9" NÃO é baixo', async () => {
    assert.equal(A.ler('D/F#').baixo.pc, 6);
    assert.equal(A.ler('Am/C').baixo.pc, 0);
    assert.equal(A.ler('C/Bb').baixo.pc, 10);
    assert.equal(A.ler('C6/9').baixo, null);
    assert.equal(A.ler('C7/9').baixo, null, 'C7/9 é tensão, não baixo');
  });

  await t('acorde entre parênteses é lido e volta com os parênteses', async () => {
    const ac = A.ler('(Am7)');
    assert.ok(ac.envolto);
    assert.equal(A.escrever(ac, { semitons: 2 }), '(Bm7)');
  });

  await t('palavra da letra não vira acorde ("e", "a", "Deus" sem reconhecimento)', async () => {
    assert.equal(A.ler('e'), null, 'minúscula não é acorde');
    assert.equal(A.ler('a'), null);
    const deus = A.ler('Deus');
    assert.ok(!deus || !deus.reconhecido, '"Deus" não pode sair como acorde reconhecido');
    assert.equal(A.ler('Olá'), null);
  });

  await t('acorde NÃO reconhecido transpõe pela fundamental sem corromper o resto', async () => {
    const ac = A.ler('Cxyz9');
    assert.ok(ac && !ac.reconhecido);
    assert.equal(A.escrever(ac, { semitons: 2 }), 'Dxyz9');
  });

  await t('notação latina: Sol, Rem, Fa#7, Sib7M', async () => {
    const op = { latina: true };
    assert.deepEqual(A.notas(A.ler('Sol', op)).sort((a, b) => a - b), [2, 7, 11]);
    assert.equal(A.ler('Rem', op).qualidade, 'menor');
    assert.equal(A.ler('Fa#7', op).raiz.pc, 6);
    assert.equal(A.ler('Sib7M', op).raiz.pc, 10);
    assert.equal(A.escrever(A.ler('Rem', op), { semitons: 2 }), 'Mim');
    assert.equal(A.detectarNotacao(['Sol', 'Rem', 'Do', 'La7']), 'latina');
    assert.equal(A.detectarNotacao(['G', 'Dm', 'C', 'A7']), 'internacional');
  });

  await t('transpor preserva o sufixo BYTE A BYTE (não normaliza em silêncio)', async () => {
    for (const s of ['m7(9)', '7M(9)', '7(4/9)', 'm7(b5)', '°', '4', '(9)', 'sus2', 'maj7', '7(b9,#11)']) {
      assert.equal(A.escrever(A.ler('C' + s), { semitons: 7 }), 'G' + s);
    }
  });

  await t('grafia normalizada: brasileira e internacional', async () => {
    assert.equal(A.escrever(A.ler('Cmaj7'), { estilo: 'br' }), 'C7M');
    assert.equal(A.escrever(A.ler('C7M(9)'), { estilo: 'internacional' }), 'Cmaj9');
    assert.equal(A.escrever(A.ler('Am9'), { estilo: 'br' }), 'Am(9)', 'Am9 BR = nona adicionada');
    assert.equal(A.escrever(A.ler('Cm7b5'), { estilo: 'br' }), 'Cm7(b5)');
    assert.equal(A.escrever(A.ler('Ebmaj7'), { estilo: 'br' }), 'Eb7M', 'normalizar não troca Eb por D#');
  });

  await t('equivalência harmônica: Cmaj7 = C7M; C# = Db; C ≠ Cm', async () => {
    assert.ok(A.equivalentes(A.ler('Cmaj7'), A.ler('C7M')));
    assert.ok(A.equivalentes(A.ler('C#m7'), A.ler('Dbm7')));
    assert.ok(!A.equivalentes(A.ler('C'), A.ler('Cm')));
    assert.ok(!A.equivalentes(A.ler('C'), A.ler('C/E')));
  });

  // -------------------------------------------------------------------
  secao('Cifras · motor — propriedades (semente fixa, 400 casos cada)');
  let semente = 20260928;
  const rnd = () => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente / 0x7fffffff; };
  const pega = (l) => l[Math.floor(rnd() * l.length)];
  const RAIZES = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const SUF = ['', 'm', '7', 'm7', '7M', 'maj7', 'm7(b5)', '°', 'dim7', '+', 'sus4', '4', '9', '7(9)', 'm7(11)',
    '7(b9)', '7(#11)', '6', '6/9', '5', 'add9', '7(4/9)', 'm(maj7)', '7(b13)'];
  const acordeAleatorio = () => pega(RAIZES) + pega(SUF) + (rnd() < 0.2 ? '/' + pega(RAIZES) : '');

  await t('transpor +n e depois −n devolve a MESMA harmonia', async () => {
    for (let k = 0; k < 400; k++) {
      const c = acordeAleatorio();
      const n = Math.floor(rnd() * 23) - 11;
      const ida = A.transporTexto(c, n, { bemol: rnd() < 0.5 });
      const volta = A.transporTexto(ida, -n, { bemol: rnd() < 0.5 });
      assert.ok(A.equivalentes(A.ler(c), A.ler(volta)), `${c} → ${ida} → ${volta}`);
    }
  });

  await t('transpor 12 semitons é identidade harmônica', async () => {
    for (let k = 0; k < 400; k++) {
      const c = acordeAleatorio();
      assert.ok(A.equivalentes(A.ler(c), A.ler(A.transporTexto(c, 12))), c);
    }
  });

  await t('transpor desloca TODAS as notas pelo mesmo intervalo', async () => {
    for (let k = 0; k < 400; k++) {
      const c = acordeAleatorio();
      const n = Math.floor(rnd() * 12);
      const a = A.notas(A.ler(c)).map((p) => (p + n) % 12).sort((x, y) => x - y);
      const b = A.notas(A.ler(A.transporTexto(c, n))).sort((x, y) => x - y);
      assert.deepEqual(a, b, `${c} +${n}`);
    }
  });

  await t('simplificar é idempotente e nunca inventa acorde a partir de sufixo desconhecido', async () => {
    for (let k = 0; k < 400; k++) {
      const c = acordeAleatorio();
      const nivel = 1 + Math.floor(rnd() * 3);
      const uma = H.simplificar(c, nivel).texto;
      const duas = H.simplificar(uma, nivel).texto;
      assert.ok(A.equivalentes(A.ler(uma), A.ler(duas)), `${c} → ${uma} → ${duas} (nível ${nivel})`);
    }
    assert.equal(H.simplificar('Cxyz', 3).texto, 'Cxyz');
  });

  function docAleatorio() {
    const d = D.novoDocumento({ titulo: 'Teste', tom: pega(['C', 'G', 'Am', 'F', 'Bb', 'E']) });
    const tipos = ['intro', 'verso', 'pre_refrao', 'refrao', 'ponte', 'solo', 'final'];
    const nSec = 1 + Math.floor(rnd() * 4);
    for (let s = 0; s < nSec; s++) {
      const sec = { tipo: pega(tipos), rotulo: '', linhas: [] };
      if (rnd() < 0.2) sec.tom = pega(['D', 'Eb', 'Bm']);
      const nL = 1 + Math.floor(rnd() * 5);
      for (let l = 0; l < nL; l++) {
        const segs = [];
        const nS = 1 + Math.floor(rnd() * 4);
        for (let g = 0; g < nS; g++) segs.push({ acorde: g === 0 && rnd() < 0.2 ? null : acordeAleatorio(), texto: pega(['Olha ', 'que ', 'coisa ', 'mais ', 'lin', 'da', 'ção ', 'é ']) });
        if (segs[0].acorde === null && segs.length > 1) segs[0].texto = 'Ah ';
        segs[segs.length - 1].texto = segs[segs.length - 1].texto.trim() || 'x';
        sec.linhas.push({ tipo: 'letra', segmentos: segs });
      }
      if (rnd() < 0.3) sec.linhas.push({ tipo: 'instrucao', texto: '2x' });
      d.secoes.push(sec);
    }
    return D.renumerar(d);
  }

  await t('documento → ChordPro → documento devolve o MESMO documento', async () => {
    for (let k = 0; k < 200; k++) {
      const d = docAleatorio();
      const volta = D.deChordPro(D.paraChordPro(d));
      assert.deepEqual(volta, d, D.paraChordPro(d));
    }
  });

  await t('transpor nunca muda o texto da letra (o alinhamento é do segmento)', async () => {
    const letra = (d) => d.secoes.map((s) => s.linhas.map((l) => (l.segmentos || []).map((g) => g.texto).join('|')).join('/')).join('#');
    for (let k = 0; k < 200; k++) {
      const d = docAleatorio();
      const n = Math.floor(rnd() * 23) - 11;
      assert.equal(letra(D.transpor(d, n)), letra(d));
      assert.equal(letra(D.simplificar(d, 2).documento), letra(d));
    }
  });

  await t('transpor o documento +n e −n devolve a mesma harmonia, e o tom acompanha', async () => {
    for (let k = 0; k < 200; k++) {
      const d = docAleatorio();
      const n = 1 + Math.floor(rnd() * 11);
      const ida = D.transpor(d, n);
      const volta = D.transpor(ida, -n);
      const a = D.acordesEmOrdem(d), b = D.acordesEmOrdem(volta);
      a.forEach((c, i) => assert.ok(A.equivalentes(A.ler(c), A.ler(b[i])), `${c} ≠ ${b[i]}`));
      assert.equal(N.lerTom(volta.meta.tom).pc, N.lerTom(d.meta.tom).pc);
    }
  });

  await t('todo documento gerado passa na validação de esquema', async () => {
    for (let k = 0; k < 100; k++) assert.ok(D.validar(docAleatorio()).ok);
    assert.ok(!D.validar({ formato: 'x' }).ok);
    assert.ok(!D.validar({ formato: 'musique.cifra', versao: 1, secoes: [{ tipo: 'invasor', linhas: [] }] }).ok);
  });

  // -------------------------------------------------------------------
  secao('Cifras · motor — enarmonia, tom, graus, capotraste');

  await t('grafia pelo tom de destino: C → Eb se escreve em BEMOL', async () => {
    const d = D.deChordPro('{key: C}\n[C]Olha [F]que [G7]coisa');
    assert.deepEqual(D.acordesEmOrdem(D.transpor(d, 3)), ['Eb', 'Ab', 'Bb7']);
    assert.equal(D.transpor(d, 3).meta.tom, 'Eb');
    assert.deepEqual(D.acordesEmOrdem(D.transpor(d, 4)), ['E', 'A', 'B7']);
  });

  await t('tom MENOR se escreve como o relativo maior (Dm tem Bb, não A#)', async () => {
    const d = D.deChordPro('{key: Am}\n[Am]um [Dm]dois [E7]três');
    assert.deepEqual(D.acordesEmOrdem(D.transpor(d, 5)), ['Dm', 'Gm', 'A7']);
    const e = D.deChordPro('{key: Em}\n[Em]um [C]dois');
    assert.deepEqual(D.acordesEmOrdem(D.transpor(e, 1)), ['Fm', 'Db']);
  });

  await t('acorde de empréstimo segue a FUNÇÃO: bVII e bVI em bemol', async () => {
    const d = D.deChordPro('{key: C}\n[C]a [Bb]b [Ab]c [G]d');
    assert.deepEqual(D.acordesEmOrdem(D.transpor(d, 7)), ['G', 'F', 'Eb', 'D'], 'em sol maior: F e Eb, nunca E#/D#');
  });

  await t('preferência explícita por sustenido ou bemol vale sobre o tom', async () => {
    const d = D.deChordPro('{key: C}\n[C]a [F]b');
    assert.deepEqual(D.acordesEmOrdem(D.transpor(d, 1, { preferencia: 'sustenido' })), ['C#', 'F#']);
    assert.deepEqual(D.acordesEmOrdem(D.transpor(d, 1, { preferencia: 'bemol' })), ['Db', 'Gb']);
  });

  await t('seção modulada usa o PRÓPRIO tom para a grafia', async () => {
    const d = D.deChordPro('{key: G}\n{start_of_verse}\n[G]a [C]b\n{end_of_verse}\n{start_of_chorus}\n{key: Ab}\n[Ab]c [Db]d\n{end_of_chorus}');
    assert.equal(d.secoes[1].tom, 'Ab');
    const t2 = D.transpor(d, 2);
    assert.deepEqual(D.acordesEmOrdem(t2), ['A', 'D', 'Bb', 'Eb']);
    assert.equal(t2.secoes[1].tom, 'Bb');
  });

  await t('detecta o tom com confiança e MOTIVO — e o relativo aparece como alternativa', async () => {
    const c = H.detectarTom(['C', 'Am', 'F', 'G7', 'C']);
    assert.equal(c[0].nome, 'C');
    assert.ok(c[0].confianca > 0.6, 'confiança ' + c[0].confianca);
    assert.match(c[0].motivo, /acordes pertencem/);
    const m = H.detectarTom(['Am', 'Dm', 'E7', 'Am']);
    assert.equal(m[0].nome, 'Am');
    assert.deepEqual(H.detectarTom([]), []);
  });

  await t('graus romanos e Nashville, com empréstimo marcado como não diatônico', async () => {
    const tom = N.lerTom('C');
    assert.equal(H.grau('Am', tom).texto, 'vi');
    assert.equal(H.grau('G7', tom).texto, 'V7');
    assert.equal(H.grau('Bb', tom).texto, 'bVII');
    assert.equal(H.grau('Bb', tom).diatonico, false);
    assert.equal(H.grau('Bm7(b5)', tom).texto, 'vii7', 'm7(b5) sem ø: lido como menor com b5');
    assert.equal(H.grau('Am', tom, { sistema: 'nashville' }).texto, '6-');
    assert.equal(H.grau('C/E', tom, { sistema: 'nashville' }).texto, '1/3');
    assert.equal(H.grau('Bø', tom).texto, 'viiø7');
  });

  await t('simplificação em níveis, com lista de mudanças para a prévia', async () => {
    assert.equal(H.simplificar('Am7(9)', 1).texto, 'Am7');
    assert.equal(H.simplificar('Am7(9)', 2).texto, 'Am');
    assert.equal(H.simplificar('D/F#', 2).texto, 'D');
    assert.equal(H.simplificar('D/F#', 1).texto, 'D/F#', 'nível 1 mantém o baixo');
    assert.equal(H.simplificar('Bm7(b5)', 2).texto, 'B°');
    assert.equal(H.simplificar('Esus4', 3).texto, 'E');
    const d = D.deChordPro('[Am7(9)]a [Am7(9)]b [G]c');
    const r = D.simplificar(d, 2);
    assert.deepEqual(r.mudancas, [{ de: 'Am7(9)', para: 'Am', vezes: 2 }]);
  });

  await t('capotraste mostra a FORMA e diz qual é o som', async () => {
    const d = D.deChordPro('{key: Eb}\n[Eb]a [Cm]b [Ab]c [Bb]d');
    const r = D.comCapotraste(d, 1);
    assert.equal(r.tom_soando, 'Eb');
    assert.equal(r.tom_das_formas, 'D');
    assert.deepEqual(D.acordesEmOrdem(r.documento), ['D', 'Bm', 'G', 'A']);
  });

  await t('capotraste inteligente: música em Eb sugere capo que leva a formas abertas', async () => {
    const s = I.sugerirCapotraste(['Eb', 'Cm', 'Ab', 'Bb']);
    assert.ok([1, 3, 6].includes(s[0].capo), 'capo sugerido: ' + s[0].capo);
    assert.ok(s[0].dificuldade < s.find((x) => x.capo === 0).dificuldade);
    assert.ok(s.length >= 3, 'várias alternativas');
  });

  // -------------------------------------------------------------------
  secao('Cifras · motor — os seis instrumentos');

  const primeira = (c, inst, op) => I.formas(c, inst, op).formas[0];
  await t('violão: formas abertas canônicas em primeiro lugar', async () => {
    const esperado = { C: 'x32010', G: '320003', D: 'xx0232', A: 'x02220', E: '022100', Am: 'x02210', Em: '022000', Dm: 'xx0231', F: '133211' };
    Object.keys(esperado).forEach((c) => assert.equal(primeira(c, 'violao').desenho, esperado[c], c));
    assert.equal(primeira('C', 'violao').nivel, 'fácil');
    assert.ok(primeira('F', 'violao').pestana, 'F tem pestana');
  });

  await t('violão: toda forma devolvida é FISICAMENTE tocável', async () => {
    for (const c of ['Bbm7(b5)', 'C7M(9)', 'G7(13)', 'F#m7', 'Ab', 'Db7(9)', 'E7(#9)', 'Bb6(9)', 'D/F#', 'Cdim7']) {
      const r = I.formas(c, 'violao');
      assert.ok(r.formas.length, `${c}: ${r.motivo}`);
      for (const f of r.formas) {
        const presas = f.casas.filter((x) => x > 0);
        if (presas.length) assert.ok(Math.max(...presas) - Math.min(...presas) <= 4, `${c} ${f.desenho}: estica demais`);
        assert.ok(f.dedos <= 4, `${c} ${f.desenho}: mais de 4 dedos`);
        const soando = f.casas.map((x, i) => (x >= 0 ? i : -1)).filter((i) => i >= 0);
        for (let i = soando[0]; i <= soando[soando.length - 1]; i++) assert.ok(f.casas[i] >= 0, `${c} ${f.desenho}: corda muda no meio`);
        const notasAcorde = A.notas(A.ler(c));
        f.casas.forEach((x, i) => { if (x >= 0) assert.ok(notasAcorde.includes((I.INSTRUMENTOS.violao.afinacoes.padrao.cordas[i] + x) % 12), `${c} ${f.desenho}: nota fora do acorde`); });
      }
    }
  });

  await t('violão: o baixo pedido é a nota mais grave (D/F#)', async () => {
    const f = primeira('D/F#', 'violao');
    const cordas = I.INSTRUMENTOS.violao.afinacoes.padrao.cordas;
    const graves = f.casas.map((x, i) => (x >= 0 ? cordas[i] + x : 999));
    assert.equal(Math.min(...graves) % 12, 6);
  });

  await t('afinação alternativa muda a forma (drop D)', async () => {
    const f = primeira('D', 'violao', { afinacao: 'drop_d' });
    assert.equal(f.casas[0], 0, 'em drop D o ré grave soa solto: ' + f.desenho);
  });

  await t('guitarra: power chord em duas ou três cordas graves', async () => {
    const f = primeira('A5', 'guitarra');
    assert.ok(f.casas.filter((x) => x >= 0).length <= 3, f.desenho);
  });

  await t('cavaquinho e ukulele: quatro cordas, todas as notas do acorde, reentrante sem exigir fundamental no grave', async () => {
    assert.equal(primeira('C', 'ukulele').desenho, '0003');
    assert.equal(primeira('G', 'ukulele').desenho, '0232');
    assert.equal(primeira('Am', 'ukulele').desenho, '2000');
    assert.equal(primeira('G', 'cavaquinho').desenho, '0000');
    assert.equal(primeira('D', 'cavaquinho').casas.length, 4);
    const ext = I.formas('C7M(9)', 'cavaquinho');
    assert.ok(ext.formas.length, 'acorde de 5 notas cabe em 4 cordas omitindo a quinta: ' + ext.motivo);
  });

  await t('teclado: inversões e condução de vozes que MOVE MENOS a mão', async () => {
    const p = I.tecladoProgressao(['C', 'Am', 'F', 'G7']);
    assert.deepEqual(p[0].nomes_direita, ['C4', 'E4', 'G4']);
    assert.ok(p[1].movimento <= 3, 'C → Am quase não move: ' + p[1].movimento);
    assert.ok(p[2].movimento <= 3, 'Am → F: ' + p[2].movimento);
    assert.equal(p[0].nomes_esquerda[0].slice(0, 1), 'C');
  });

  await t('contrabaixo: posição da fundamental, arpejo, graus-alvo e linha-guia', async () => {
    const b = I.baixo('D/F#');
    assert.equal(b.nota_do_baixo, 'F#');
    assert.deepEqual(b.posicoes[0], { corda: 0, casa: 2 });
    assert.ok(b.graus_alvo.some((g) => g.grau === '3'));
    const l = I.linhaGuia(['C', 'Am']);
    assert.deepEqual(l[0].notas, ['C', 'C', 'G', 'G#']);
  });

  await t('os seis instrumentos iniciais estão no catálogo, com afinações', async () => {
    const ids = I.catalogo().map((x) => x.id);
    for (const id of ['violao', 'guitarra', 'cavaquinho', 'ukulele', 'piano', 'baixo']) assert.ok(ids.includes(id), id);
    assert.ok(I.catalogo().find((x) => x.id === 'violao').afinacoes.length >= 4);
  });

  // -------------------------------------------------------------------
  secao('Cifras · motor — importação de texto colado');

  const COLADA = [
    'Garota de Ipanema - Tom Jobim',
    'Tom: F',
    '',
    '[Intro] F7M  G7(13)  Gm7  Gb7(#11)',
    '',
    '[Primeira Parte]',
    '',
    'F7M                     G7(13)',
    '  Olha que coisa mais linda',
    '                    Gm7',
    'Mais cheia de graça',
    '',
    'E|-----------------|',
    'B|---3---5---6-----|',
    '',
    '[Refrão]',
    '         Gb7M',
    'Ah, porque estou tão sozinho',
    '(2x)',
  ].join('\n');

  await t('cifra colada de site: cabeçalho, tom, seções, acordes na sílaba certa, tab e instrução', async () => {
    const r = D.deTexto(COLADA);
    const d = r.documento;
    assert.equal(d.meta.titulo, 'Garota de Ipanema');
    assert.equal(d.meta.artista, 'Tom Jobim');
    assert.equal(d.meta.tom, 'F');
    assert.deepEqual(d.secoes.map((s) => s.tipo), ['intro', 'verso', 'tablatura', 'refrao']);
    const l1 = d.secoes[1].linhas[0].segmentos;
    assert.deepEqual(l1.map((s) => s.acorde), ['F7M', 'G7(13)']);
    assert.equal(l1[1].texto, 'nda', 'G7(13) cai sobre "nda" de "linda"');
    assert.equal(d.secoes[2].linhas[0].tipo, 'tab');
    assert.equal(d.secoes[3].linhas[1].tipo, 'instrucao');
    assert.ok(r.confianca >= 0.9);
  });

  await t('linha de letra com "E" e "A" (palavras) NÃO vira linha de acordes', async () => {
    const r = D.deTexto('G        D\nE a vida é assim\nA casa caiu');
    const l = r.documento.secoes[0].linhas;
    assert.equal(l.length, 2);
    assert.deepEqual(l[0].segmentos.map((s) => s.acorde), ['G', 'D']);
    assert.equal(l[1].segmentos[0].texto, 'A casa caiu');
  });

  await t('texto sem acorde nenhum é guardado como letra e a importação AVISA', async () => {
    const r = D.deTexto('só letra\nnada de acorde');
    assert.ok(r.ambiguidades.some((a) => /Nenhum acorde/.test(a.motivo)));
    assert.ok(r.confianca <= 0.3);
  });

  await t('texto → documento → texto preserva o alinhamento depois de transpor para acorde mais largo', async () => {
    const d = D.deTexto('C       G\nOlha que coisa').documento;
    const txt = D.paraTexto(D.transpor(d, 1, { preferencia: 'sustenido' }), { cabecalho: false }).split('\n');
    assert.equal(txt[0].indexOf('G#'), txt[1].indexOf('coisa') - 'que '.length + 0 >= 0 ? txt[0].indexOf('G#') : -1);
    assert.equal(txt[0].indexOf('G#'), 8);
    assert.equal(txt[1], 'Olha que coisa');
    const largo = D.deChordPro('[C]a[G]b');
    const t2 = D.paraTexto(D.transpor(largo, 1, { preferencia: 'sustenido' }), { cabecalho: false }).split('\n');
    assert.ok(t2[0].indexOf('G#') > t2[0].indexOf('C#') + 1, 'acorde não se sobrepõe ao anterior: ' + t2[0]);
  });

  await t('cifra em notação latina é detectada pelo documento', async () => {
    const r = D.deTexto('Sol        Rem\nEu vou cantar');
    assert.equal(r.notacao, 'latina');
    assert.deepEqual(D.acordesEmOrdem(D.transpor(r.documento, 2)), ['La', 'Mim']);
  });

  await t('acordes que o motor não entende aparecem para revisão', async () => {
    const d = D.deChordPro('[C]a [Cxyz]b');
    assert.deepEqual(D.acordesNaoReconhecidos(d).map((a) => a.acorde), ['Cxyz']);
  });

  // -------------------------------------------------------------------
  secao('Cifras · motor — comparação e fusão de versões');

  await t('diff separa mudança de ACORDE, de GRAFIA e de LETRA', async () => {
    const a = D.deChordPro('[C]Olha que [G]coisa\n[Am]mais linda');
    const b = D.deChordPro('[C]Olha que [G7]coisa\n[Am]mais linda\nnovo verso');
    const c = D.deChordPro('[C]Olha que [G]coisa\n[Am]mais linda');
    const g = D.deChordPro('[C]Olha que [G]coisa\n[A-]mais linda');
    const r = D.diff(a, b);
    assert.equal(r.resumo.acordes, 1);
    assert.equal(r.resumo.adicionadas, 1);
    assert.equal(D.diff(a, c).resumo.acordes, 0);
    assert.equal(D.diff(a, g).resumo.grafia, 1, 'Am → A- é só grafia');
  });

  await t('fusão ("criar melhor versão") escolhe o acorde da MAIORIA e registra o empate', async () => {
    const base = D.deChordPro('[C]Olha que [G]coisa');
    const v2 = D.deChordPro('[C]Olha que [G7]coisa');
    const v3 = D.deChordPro('[C]Olha que [G7]coisa');
    const r = D.mesclar(base, [v2, v3]);
    assert.deepEqual(D.acordesEmOrdem(r.documento), ['C', 'G7']);
    assert.ok(r.divergencias.some((x) => x.aplicado && x.de === 'G'));
    const emp = D.mesclar(base, [v2]);
    assert.deepEqual(D.acordesEmOrdem(emp.documento), ['C', 'G'], 'empate fica com a base');
    assert.ok(emp.divergencias.some((x) => !x.aplicado));
    assert.deepEqual(D.acordesEmOrdem(base), ['C', 'G'], 'a fusão NÃO altera a base');
  });

  await t('mapa da música e duração estimada (com BPM e sem)', async () => {
    const d = D.deChordPro('{tempo: 120}\n{start_of_verse}\n[C]a\n[G]b\n{end_of_verse}\n{start_of_chorus}\n{x_repetir: 2}\n[F]c\n{end_of_chorus}');
    const m = D.mapa(d);
    assert.deepEqual(m.map((s) => s.tipo), ['verso', 'refrao']);
    assert.equal(m[1].repetir, 2);
    assert.equal(D.duracaoEstimada(d), 16);
  });
}

module.exports = { rodar };

if (require.main === module) {
  const assert = require('assert');
  let ok = 0; const falhas = [];
  const t = async (nome, fn) => {
    try { await fn(); ok++; console.log('  ✅ ' + nome); } catch (e) { falhas.push(nome); console.log('  ❌ ' + nome + '\n     ' + e.message); }
  };
  rodar({ t, secao: (s) => console.log('\n— ' + s + ' —'), assert }).then(() => {
    console.log(`\n${ok} ok, ${falhas.length} falha(s).`);
    if (falhas.length) process.exit(1);
  });
}
