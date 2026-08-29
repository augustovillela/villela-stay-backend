// =====================================================================
// Musique — testes da FASE 1 (Academia Musical). Rodam dentro do
// `selftest.js`, reusando o servidor e o harness dele.
//
// O que estes testes protegem, item por item:
//
//   · TEORIA é a base de tudo. Se enarmonia ou nome em português
//     falharem, o produto reprova aluno certo — e nada dói mais num
//     sistema de ensino.
//   · AVALIAÇÃO é testada com SINAL SINTÉTICO, de gabarito conhecido.
//     É o mesmo princípio que a casa usou no tour 360 (validar
//     geometria com panorama sintético): sem entrada controlada, um
//     motor de medição só pode ser conferido no olho.
//   · A decisão Q5 do Augusto vira teste em três lugares: polifonia
//     nunca vale nota, microfone sem calibração vira indicação, e o
//     contrato da medida chega ANTES da resposta.
//   · A regra do VÍNCULO (professor perde o acesso quando arquiva a
//     tarefa) é testada TENTANDO ver depois de arquivar.
// =====================================================================
'use strict';

const T = require('./teoria');
const curriculo = require('./curriculo');
const avaliacao = require('./avaliacao');
const academia = require('./academia');
const { db } = require('./db');

/** Gera amostras de uma nota sustentada com desvio e oscilação
 *  controlados — a "entrada de gabarito conhecido" dos testes de áudio. */
function sustentada({ nota, cents = 0, oscilacao = 0, n = 40, confianca = 0.95 }) {
  const base = T.freqDeMidi(T.midiDe(nota));
  const out = [];
  for (let i = 0; i < n; i++) {
    // oscilação determinística (senóide), não aleatória: teste que
    // depende de sorteio falha um dia por acaso e ninguém sabe por quê
    const d = cents + oscilacao * Math.sin((i / n) * Math.PI * 4);
    out.push({ hz: base * Math.pow(2, d / 1200), ms: i * 50, confianca });
  }
  return out;
}

/** Eventos de melodia a partir de nomes de nota, com desvio opcional. */
const melodia = (notas, { cents = 0, oitava = 0, confianca = 0.9 } = {}) =>
  notas.map((n, i) => ({
    hz: T.freqDeMidi(T.midiDe(n) + oitava * 12) * Math.pow(2, cents / 1200),
    inicio_ms: i * 600, dur_ms: 500, confianca,
  }));

async function rodar({ t, secao, req, assert, PROFESSORES }) {
  // ===================================================================
  secao('Fase 1 · teoria musical (a base de tudo)');

  await t('lê nota em português e em cifra, com e sem alteração', async () => {
    assert.equal(T.lerNota('dó').pc, 0);
    assert.equal(T.lerNota('C').pc, 0);
    assert.equal(T.lerNota('Ré').pc, 2);
    assert.equal(T.lerNota('fa#').pc, 6);
    assert.equal(T.lerNota('SOL b').pc, 6);
    assert.equal(T.lerNota('si').pc, 11);
    assert.equal(T.lerNota('xis'), null);
  });

  await t('ENARMONIA conta como certa: fá# e solb são a mesma altura', async () => {
    assert.ok(T.mesmaAltura('F#', 'Gb'));
    assert.ok(T.mesmaAltura('fá sustenido'.replace(' sustenido', '#'), 'solb'));
    assert.ok(!T.mesmaAltura('F#', 'G'));
    // com oitava, a oitava importa
    assert.ok(T.mesmaAltura('F#4', 'Gb4'));
    assert.ok(!T.mesmaAltura('F#4', 'Gb5'));
  });

  await t('lá4 = 440 Hz, e a conversão volta igual', async () => {
    assert.equal(T.midiDe('A4'), 69);
    assert.equal(T.midiDe('la4'), 69);
    assert.equal(T.midiDe('C4'), 60);
    assert.equal(Math.round(T.freqDeMidi(69)), 440);
    assert.ok(Math.abs(T.midiDeFreq(440) - 69) < 1e-9);
    assert.equal(Math.round(T.centsEntre(440 * Math.pow(2, 50 / 1200), 440)), 50);
  });

  await t('notaDeFreq acha a nota e o desvio', async () => {
    const r = T.notaDeFreq(445);
    assert.equal(r.midi, 69);
    assert.ok(r.cents > 15 && r.cents < 22, 'esperava ~+20 cents, veio ' + r.cents);
  });

  await t('intervalos, escalas e acordes batem com a teoria', async () => {
    assert.equal(T.intervaloDe(7).curto, 'J5');
    assert.equal(T.lerIntervalo('terça maior').semitons, 4);
    assert.equal(T.lerIntervalo('3M').semitons, 4);
    assert.equal(T.lerIntervalo('3m').semitons, 3);
    assert.deepEqual(T.escala('C', 'maior'), [0, 2, 4, 5, 7, 9, 11]);
    assert.deepEqual(T.escala('la', 'menor_natural'), [9, 11, 0, 2, 4, 5, 7]);
    assert.deepEqual(T.acorde('C', 'maior'), [0, 4, 7]);
    assert.deepEqual(T.acorde('la', 'menor'), [9, 0, 4]);
    assert.equal(T.cifraDe('G', 'dominante7'), 'G7');
  });

  await t('a CAIXA importa na abreviação do intervalo: 3M nao e 3m', async () => {
    // Regressão de um defeito real: normalizar a entrada para minúsculas
    // (o reflexo certo em quase todo campo de texto) fazia `3M` casar com
    // `3m` e devolver terça MENOR, calado. Em música a caixa carrega
    // significado, e o campo não pode ser tratado como texto qualquer.
    for (const [curto, semitons] of [['2M', 2], ['2m', 1], ['3M', 4], ['3m', 3],
      ['6M', 9], ['6m', 8], ['7M', 11], ['7m', 10]]) {
      assert.equal(T.lerIntervalo(curto).semitons, semitons, curto + ' devia ser ' + semitons);
    }
    assert.equal(T.lerIntervalo('TERCA MAIOR').semitons, 4);
    assert.equal(T.lerIntervalo('  terça   Menor ').semitons, 3);
  });

  await t('lê cifra escrita em português — o aluno escreve "Solm"', async () => {
    assert.equal(T.lerCifra('Am').tipo, 'menor');
    assert.equal(T.lerCifra('Solm').tipo, 'menor');
    assert.equal(T.lerCifra('Solm').pc, 7);
    assert.equal(T.lerCifra('F#dim').tipo, 'diminuto');
    assert.equal(T.lerCifra('Dó7M').tipo, 'maior7');
    assert.equal(T.lerCifra('zzz'), null);
  });

  await t('transposição é aritmética exata, ida e volta', async () => {
    assert.equal(T.transporCifra('C', 2), 'D');
    assert.equal(T.transporCifra('Am7', 3), 'Cm7');
    assert.equal(T.transporCifra(T.transporCifra('G7', 5), -5), 'G7');
    assert.equal(T.semitonsEntreTons('C', 'D'), 2);
    assert.equal(T.semitonsEntreTons('B', 'C'), 1, 'passar de si para dó é 1 semitom, não 11 negativos');
  });

  await t('extensão vocal diz se o tom serve para o cantor', async () => {
    const r = T.cabeNaExtensao(['C4', 'G4'], { grave: 'E3', agudo: 'C5' });
    assert.equal(r.cabe, true);
    const r2 = T.cabeNaExtensao(['C4', 'E5'], { grave: 'E3', agudo: 'C5' });
    assert.equal(r2.cabe, false);
    assert.ok(r2.falta_agudo > 0);
  });

  // ===================================================================
  secao('Fase 1 · avaliação simbólica (múltipla escolha e texto)');

  const av = (o) => avaliacao.avaliar(o);

  await t('nota: enarmonia e português contam como certos', async () => {
    const esperado = { tipo: 'nota', valor: 'F#' };
    assert.ok(av({ modo: 'escolha', esperado, resposta: { valor: 'F#' } }).acerto);
    assert.ok(av({ modo: 'escolha', esperado, resposta: { valor: 'Gb' } }).acerto,
      'Solb é a MESMA altura de Fá# — marcar erro ensinaria o contrário da teoria');
    assert.ok(av({ modo: 'escolha', esperado, resposta: { valor: 'fá#' } }).acerto);
    assert.ok(!av({ modo: 'escolha', esperado, resposta: { valor: 'G' } }).acerto);
  });

  await t('erro vem com explicação, não só com "errado"', async () => {
    const r = av({ modo: 'escolha', esperado: { tipo: 'nota', valor: 'F#' }, resposta: { valor: 'G' } });
    assert.ok(/fá sustenido/i.test(r.explicacao), r.explicacao);
    assert.ok(r.criterio.length > 10, 'o critério tem de estar escrito');
  });

  await t('intervalo aceita nome por extenso e abreviação, e mede a distância do erro', async () => {
    const esperado = { tipo: 'intervalo', valor: 'J5' };
    assert.ok(av({ modo: 'escolha', esperado, resposta: { valor: 'quinta justa' } }).acerto);
    assert.ok(av({ modo: 'escolha', esperado, resposta: { valor: 'J5' } }).acerto);
    const r = av({ modo: 'escolha', esperado, resposta: { valor: '4A' } });
    assert.equal(r.acerto, false);
    assert.equal(r.medida.erro_semitons, -1);
  });

  await t('escala: tônica certa com tipo errado recebe retorno específico', async () => {
    const r = av({ modo: 'texto', esperado: { tipo: 'escala', valor: { tonica: 'D', tipo: 'menor_natural' } },
      resposta: { valor: 'ré maior' } });
    assert.equal(r.acerto, false);
    assert.ok(r.medida.tonica_ok && !r.medida.tipo_ok);
    assert.ok(/tônica está certa/i.test(r.explicacao), r.explicacao);
  });

  await t('conjunto de notas: ordem não importa, e o retorno diz o que faltou', async () => {
    const esperado = { tipo: 'notas', valor: [0, 4, 7] };
    assert.ok(av({ modo: 'texto', esperado, resposta: { valor: 'sol dó mi' } }).acerto);
    assert.ok(av({ modo: 'texto', esperado, resposta: { valor: 'C E G' } }).acerto);
    const r = av({ modo: 'texto', esperado, resposta: { valor: 'dó mi' } });
    assert.equal(r.acerto, false);
    assert.ok(/faltou/i.test(r.explicacao) && /sol/i.test(r.explicacao), r.explicacao);
  });

  await t('resposta vazia não estoura: devolve o motivo', async () => {
    const r = av({ modo: 'escolha', esperado: { tipo: 'nota', valor: 'C' }, resposta: { valor: '' } });
    assert.equal(r.acerto, false);
    assert.ok(/nenhuma resposta/i.test(r.explicacao));
  });

  // ===================================================================
  secao('Fase 1 · avaliação de áudio, com sinal sintético');

  await t('afinação: nota no alvo passa; 40 cents fora não passa', async () => {
    const ok = av({ modo: 'sustentada', esperado: { nota: 'A4' },
      resposta: { amostras: sustentada({ nota: 'A4', cents: 3 }) },
      contexto: { calibrado: true, ruido_db: -55 } });
    assert.ok(ok.acerto, ok.explicacao);
    assert.ok(ok.vale_nota, 'nota isolada em ambiente calmo é o caso que MAIS vale nota');

    const fora = av({ modo: 'sustentada', esperado: { nota: 'A4' },
      resposta: { amostras: sustentada({ nota: 'A4', cents: 40 }) },
      contexto: { calibrado: true, ruido_db: -55 } });
    assert.equal(fora.acerto, false);
    assert.ok(/ACIMA/.test(fora.explicacao), fora.explicacao);
  });

  await t('afinação: quem oscila muito não passa "na média"', async () => {
    const r = av({ modo: 'sustentada', esperado: { nota: 'A4' },
      resposta: { amostras: sustentada({ nota: 'A4', cents: 0, oscilacao: 60 }) },
      contexto: { calibrado: true, ruido_db: -55 } });
    assert.equal(r.acerto, false, 'centro zero com oscilação de 60 cents soa desafinado');
    assert.ok(r.medida.oscilacao_cents > 30);
  });

  await t('afinação: som curto demais recusa em vez de inventar medida', async () => {
    const r = av({ modo: 'sustentada', esperado: { nota: 'A4' },
      resposta: { amostras: sustentada({ nota: 'A4', n: 3 }) }, contexto: { calibrado: true } });
    assert.equal(r.confianca, 0);
    assert.ok(/curta demais/i.test(r.explicacao));
  });

  await t('melodia: execução correta passa, e a OITAVA é livre', async () => {
    const esperado = { notas: ['C4', 'E4', 'G4'] };
    const ok = av({ modo: 'instrumento', esperado, resposta: { eventos: melodia(['C4', 'E4', 'G4']) },
      contexto: { calibrado: true, ruido_db: -55 } });
    assert.ok(ok.acerto, ok.explicacao);
    const oitavaAbaixo = av({ modo: 'canto', esperado, resposta: { eventos: melodia(['C4', 'E4', 'G4'], { oitava: -1 }) },
      contexto: { calibrado: true, ruido_db: -55 } });
    assert.ok(oitavaAbaixo.acerto, 'baixo cantando uma oitava abaixo está certo; exigir a oitava mediria tessitura');
  });

  await t('melodia: nota trocada é apontada pela POSIÇÃO', async () => {
    const r = av({ modo: 'instrumento', esperado: { notas: ['C4', 'E4', 'G4'] },
      resposta: { eventos: melodia(['C4', 'F4', 'G4']) }, contexto: { calibrado: true, ruido_db: -55 } });
    assert.equal(r.acerto, false);
    assert.equal(r.medida.certas, 2);
    assert.ok(/2ª/.test(r.explicacao), r.explicacao);
  });

  await t('melodia: nota faltando é dita como faltando, não como errada', async () => {
    const r = av({ modo: 'instrumento', esperado: { notas: ['C4', 'E4', 'G4'] },
      resposta: { eventos: melodia(['C4', 'E4']) }, contexto: { calibrado: true, ruido_db: -55 } });
    assert.ok(/não apareceu/.test(r.explicacao), r.explicacao);
  });

  await t('RITMO: execução perfeita ATRASADA no começo é acerto — o atraso constante é descontado', async () => {
    const esperado = { bpm: 60, figuras: [1, 1, 1, 1] };   // ataques a 0, 1000, 2000, 3000 ms
    const r = av({ modo: 'palma', esperado, resposta: { onsets: [140, 1140, 2140, 3140] },
      contexto: { calibrado: true, ruido_db: -55 } });
    assert.ok(r.acerto, 'comparar tempo absoluto reprovaria uma execução perfeita: ' + r.explicacao);
    assert.ok(Math.abs(r.medida.atraso_medio_ms - 140) < 20);
    assert.ok(r.medida.instabilidade_ms < 20, 'quem entra tarde mas toca certo tem instabilidade baixa');
  });

  await t('RITMO: oscilar é diagnosticado diferente de atrasar', async () => {
    // Oito ataques alternando cerca de 200 ms: não é um tropeço isolado,
    // é a pulsação balançando — que é o caso em que o conserto é
    // metrônomo, e não "preste atenção no 3º tempo".
    const esperado = { bpm: 60, figuras: [1, 1, 1, 1, 1, 1, 1, 1] };
    const onsets = [0, 1200, 1800, 3200, 3800, 5200, 5800, 7200];
    const r = av({ modo: 'palma', esperado, resposta: { onsets },
      contexto: { calibrado: true, ruido_db: -55 } });
    assert.equal(r.acerto, false);
    assert.ok(r.medida.instabilidade_ms > 120, 'instabilidade medida: ' + r.medida.instabilidade_ms);
    assert.ok(/oscilou/i.test(r.explicacao), r.explicacao);
    assert.ok(/metrônomo/i.test(r.explicacao), 'o retorno tem de dizer o que fazer');
  });

  await t('RITMO: um tropeço isolado NÃO é chamado de oscilação', async () => {
    // O contraponto do teste acima, e a razão de os dois existirem:
    // chamar tudo de "oscilação" mandaria ao metrônomo quem só errou uma
    // entrada — conselho errado é pior que conselho nenhum.
    const r = av({ modo: 'palma', esperado: { bpm: 60, figuras: [1, 1, 1, 1] },
      resposta: { onsets: [0, 1000, 1780, 3000] }, contexto: { calibrado: true, ruido_db: -55 } });
    assert.equal(r.acerto, false);
    assert.ok(/3º ataque/.test(r.explicacao), r.explicacao);
    assert.ok(!/oscilou/i.test(r.explicacao));
  });

  await t('RITMO: a tolerância acompanha o andamento', async () => {
    const ctx = { calibrado: true, ruido_db: -55 };
    const lenta = av({ modo: 'palma', esperado: { bpm: 60, figuras: [1, 1] }, resposta: { onsets: [0, 1000] }, contexto: ctx });
    const rapida = av({ modo: 'palma', esperado: { bpm: 180, figuras: [1, 1] }, resposta: { onsets: [0, 333] }, contexto: ctx });
    assert.ok(lenta.tolerancia.ms > rapida.tolerancia.ms,
      'tolerancia 60 BPM=' + lenta.tolerancia.ms + 'ms vs 180 BPM=' + rapida.tolerancia.ms + 'ms');
    assert.ok(/andamento/i.test(avaliacao.contrato({ modo: 'palma' }).tolerancia_texto));

    // O MESMO desvio passa no andamento lento e não passa no rápido.
    // Precisa de mais de dois ataques: com dois, qualquer erro parece
    // atraso constante e o alinhamento o absorve — limitação real do
    // método, e a razão de este teste usar quatro.
    const desvio = (bpm) => {
      const passo = 60000 / bpm;
      return [0, passo + 60, 2 * passo - 60, 3 * passo + 60];
    };
    const a = av({ modo: 'palma', esperado: { bpm: 60, figuras: [1, 1, 1, 1] }, resposta: { onsets: desvio(60) }, contexto: ctx });
    const b = av({ modo: 'palma', esperado: { bpm: 180, figuras: [1, 1, 1, 1] }, resposta: { onsets: desvio(180) }, contexto: ctx });
    assert.ok(a.acerto, 'desvio de 60 ms a 60 BPM esta dentro: ' + a.explicacao);
    assert.ok(!b.acerto, 'o mesmo desvio a 180 BPM e muito: ' + b.explicacao);
  });

  // ===================================================================
  secao('Fase 1 · decisão Q5: o que pode e o que NÃO pode valer nota');

  await t('POLIFONIA nunca vale nota, e a tela recebe o porquê', async () => {
    const r = av({ modo: 'instrumento', esperado: { notas: ['C4', 'E4', 'G4'] },
      resposta: { eventos: melodia(['C4', 'E4', 'G4']) },
      contexto: { calibrado: true, ruido_db: -55, polifonico: true } });
    assert.equal(r.vale_nota, false, 'acorde ao violão não é medido com confiança suficiente');
    assert.ok(r.ressalvas.some((x) => /indicação/i.test(x)), JSON.stringify(r.ressalvas));
  });

  await t('sem calibração, resultado vira indicação — e diz como resolver', async () => {
    const r = av({ modo: 'sustentada', esperado: { nota: 'A4' },
      resposta: { amostras: sustentada({ nota: 'A4', cents: 2 }) },
      contexto: { calibrado: false } });
    assert.ok(r.acerto, 'a medida continua sendo feita');
    assert.equal(r.vale_nota, false, 'só que não vale nota');
    assert.ok(r.ressalvas.some((x) => /calibra/i.test(x)));
  });

  await t('ruído alto derruba a confiança', async () => {
    const r = av({ modo: 'sustentada', esperado: { nota: 'A4' },
      resposta: { amostras: sustentada({ nota: 'A4', cents: 2 }) },
      contexto: { calibrado: true, ruido_db: -18 } });
    assert.ok(r.confianca < 0.7);
    assert.equal(r.vale_nota, false);
  });

  await t('resposta digitada NÃO depende de microfone e sempre pode valer nota', async () => {
    const r = av({ modo: 'escolha', esperado: { tipo: 'nota', valor: 'C' }, resposta: { valor: 'dó' },
      contexto: {} });
    assert.equal(r.confianca, 1);
    assert.equal(r.vale_nota, true);
  });

  await t('modo desconhecido recusa em vez de fingir que avaliou', async () => {
    const r = av({ modo: 'telepatia', esperado: {}, resposta: {} });
    assert.equal(r.vale_nota, false);
    assert.ok(/desconhecido/i.test(r.explicacao));
  });

  await t('o CONTRATO existe para todo modo, e diz se pode valer nota', async () => {
    for (const modo of Object.keys(avaliacao.MODOS)) {
      const c = avaliacao.contrato({ modo });
      assert.ok(c && c.mede && c.tolerancia_texto, 'faltou contrato em ' + modo);
      assert.equal(typeof c.pode_valer_nota, 'boolean');
    }
  });

  // ===================================================================
  secao('Fase 1 · currículo: geração determinística');

  await t('mesma semente devolve o MESMO item', async () => {
    const a = curriculo.gerarItem({ tipo: 'percepcao.intervalo', nivel: 2, sem: 'abc' });
    const b = curriculo.gerarItem({ tipo: 'percepcao.intervalo', nivel: 2, sem: 'abc' });
    assert.deepEqual(a, b, 'recarregar a página não pode trocar o exercício do aluno');
  });

  await t('sementes diferentes VARIAM o item', async () => {
    // Afirmar que duas sementes específicas dão itens diferentes seria um
    // teste instável: com sete intervalos no nível 2, colidir é normal e
    // não é defeito. O que importa é haver variedade no conjunto.
    const gabaritos = new Set();
    for (let i = 0; i < 30; i++) {
      gabaritos.add(curriculo.gerarItem({ tipo: 'percepcao.intervalo', nivel: 2, sem: 'v' + i }).esperado.valor);
    }
    assert.ok(gabaritos.size >= 4, 'esperava variedade, veio ' + gabaritos.size + ' gabarito(s) distintos');
  });

  await t('todo tipo do catálogo gera item válido em todos os níveis que aceita', async () => {
    for (const [tipo, def] of Object.entries(curriculo.TIPOS)) {
      for (let n = def.nivel_min; n <= 5; n++) {
        const it = curriculo.gerarItem({ tipo, nivel: n, sem: 'x' + n });
        assert.ok(it.enunciado && it.enunciado.length > 5, `${tipo} nível ${n}: enunciado vazio`);
        assert.ok(it.esperado, `${tipo} nível ${n}: sem gabarito`);
        assert.equal(it.modo, def.modo);
      }
    }
  });

  await t('tipo abaixo do nível mínimo recusa com a razão', async () => {
    assert.throws(() => curriculo.gerarItem({ tipo: 'harmonia.grau', nivel: 1 }), /começa no nível 3/);
  });

  await t('o gabarito bate com a teoria: o V de dó maior é sol', async () => {
    // varre sementes até cair na tonalidade de dó com o grau V
    let achou = null;
    for (let i = 0; i < 400 && !achou; i++) {
      const it = curriculo.gerarItem({ tipo: 'harmonia.grau', nivel: 3, sem: 's' + i });
      if (/dó maior/.test(it.enunciado) && /grau V\?/.test(it.enunciado)) achou = it;
    }
    assert.ok(achou, 'esperava achar o caso dó maior / grau V');
    assert.equal(achou.esperado.valor, 'G');
  });

  await t('escala.montar tem gabarito coerente com o enunciado', async () => {
    const it = curriculo.gerarItem({ tipo: 'escala.montar', nivel: 3, sem: 'e1' });
    const r = av({ modo: 'texto', esperado: it.esperado,
      resposta: { valor: it.esperado.valor.map((pc) => T.nomeCifra(pc)).join(' ') } });
    assert.ok(r.acerto, 'o próprio gabarito tem de passar na própria correção');
  });

  await t('as alternativas incluem a certa, e as erradas são VIZINHAS', async () => {
    const it = curriculo.gerarItem({ tipo: 'percepcao.intervalo', nivel: 4, sem: 'op' });
    assert.ok(it.opcoes.some((o) => o.valor === it.esperado.valor), 'a resposta certa tem de estar entre as opções');
    assert.ok(it.opcoes.length >= 3);
    const alvo = T.lerIntervalo(it.esperado.valor).semitons;
    const distancias = it.opcoes.map((o) => Math.abs(T.lerIntervalo(o.valor).semitons - alvo));
    assert.ok(Math.max(...distancias) <= 6, 'alternativa absurda deixa acertar por eliminação');
  });

  await t('exercício com áudio traz o que TOCAR, não o áudio', async () => {
    const it = curriculo.gerarItem({ tipo: 'percepcao.acorde', nivel: 3, sem: 'ac' });
    assert.equal(it.tocar.tipo, 'acorde');
    assert.ok(Array.isArray(it.tocar.midi) && it.tocar.midi.length >= 3);
  });

  await t('GEOMETRIA DA PAUTA: cada nota cai na linha ou no espaço certo', async () => {
    // Regressão de um defeito achado ABRINDO A TELA, não rodando teste:
    // a versão que calculava a posição no desenho do cliente punha a nota
    // um grau ACIMA do lugar — e o exercício de leitura reprovava quem
    // lia certo. A geometria veio para cá justamente para poder ser
    // cravada nota por nota.
    const esperado = [
      ['E4', 128, 'linha 1'], ['F4', 121, 'espaço 1'], ['G4', 114, 'linha 2'],
      ['A4', 107, 'espaço 2'], ['B4', 100, 'linha 3'], ['C5', 93, 'espaço 3'],
      ['D5', 86, 'linha 4'], ['E5', 79, 'espaço 4'], ['F5', 72, 'linha 5'],
    ];
    for (const [nota, y, onde] of esperado) {
      const p = T.posicaoNaPauta(T.midiDe(nota));
      assert.equal(p.y, y, `${nota} devia ficar em ${onde} (y=${y}), veio y=${p.y}`);
      assert.equal(p.suplementares.length, 0, nota + ' não precisa de linha suplementar');
    }
    // dó4 e lá5 são as primeiras suplementares, abaixo e acima
    assert.equal(T.posicaoNaPauta(T.midiDe('C4')).y, 142);
    assert.deepEqual(T.posicaoNaPauta(T.midiDe('C4')).suplementares, [142]);
    assert.equal(T.posicaoNaPauta(T.midiDe('A5')).y, 58);
    assert.deepEqual(T.posicaoNaPauta(T.midiDe('A5')).suplementares, [58]);
    // lá3: duas suplementares abaixo (dó4 e lá3)
    assert.equal(T.posicaoNaPauta(T.midiDe('A3')).suplementares.length, 2);
  });

  await t('nota alterada ocupa a MESMA posição da natural, e o ACIDENTE vai junto', async () => {
    // Segundo defeito achado abrindo a tela: fá# era desenhado na linha
    // do fá, sem sustenido. O aluno lia "fá", respondia "fá" e o gabarito
    // dizia "fá sustenido" — reprovado por ler certo o que foi desenhado
    // errado. A posição é a mesma DE PROPÓSITO; o que faltava era o sinal.
    const nat = T.posicaoNaPauta(T.midiDe('F4'));
    const alt = T.posicaoNaPauta(T.midiDe('F#4'));
    assert.equal(nat.y, alt.y, 'a linha é a mesma');
    assert.equal(nat.acidente, '', 'natural não leva sinal');
    assert.equal(alt.acidente, '#', 'alterada TEM de levar sinal');
    assert.ok(alt.acidente_glifo, 'e o glifo para desenhar');
    // Fá# e Solb soam IGUAL e ficam em linhas DIFERENTES: fá# na do fá,
    // solb na do sol. Derivar a linha só da altura punha solb na linha do
    // fá — o mesmo som, escrito errado. Num exercício de LEITURA isso é
    // exatamente o defeito.
    const solB = T.posicaoNaPauta(T.midiDe('Gb4'), 'sol', { bemol: true });
    const sol = T.posicaoNaPauta(T.midiDe('G4'));
    assert.equal(solB.acidente, 'b');
    assert.equal(solB.y, sol.y, 'solb fica na linha do SOL, não na do fá');
    assert.notEqual(solB.y, alt.y, 'fá# e solb soam igual e se escrevem em linhas diferentes');
    const siB = T.posicaoNaPauta(T.midiDe('Bb4'), 'sol', { bemol: true });
    assert.equal(siB.y, T.posicaoNaPauta(T.midiDe('B4')).y, 'sib fica na linha do si');
    assert.equal(T.grauDiatonico(T.midiDe('C4')), 0);
    assert.equal(T.grauDiatonico(T.midiDe('C5')), 7);
  });

  await t('leitura nos níveis 1 a 3 só usa notas naturais', async () => {
    // Ler acidente é habilidade separada, e vem depois de ler a linha.
    for (let i = 0; i < 200; i++) {
      const it = curriculo.gerarItem({ tipo: 'leitura.nota', nivel: 1 + (i % 3), sem: 'nat' + i });
      assert.equal(it.partitura.acidente, '', 'apareceu nota alterada em nível inicial: ' + it.esperado.valor);
      // e as alternativas também: oferecer "lá sustenido" num exercício
      // só de naturais ensina a eliminar pelo formato, não pela leitura
      for (const o of it.opcoes) {
        assert.ok(!/[#b]/.test(o.valor), 'alternativa alterada em exercício de naturais: ' + o.valor);
      }
    }
  });

  await t('a tela recebe o acidente para desenhar', async () => {
    const app = await req('GET', '/music/app.js', { cru: true });
    assert.ok(/acidente_glifo/.test(app.texto), 'o desenho tem de saber desenhar o sinal');
  });

  await t('o exercício de leitura manda a posição PRONTA para a tela', async () => {
    const it = curriculo.gerarItem({ tipo: 'leitura.nota', nivel: 2, sem: 'L1' });
    assert.ok(it.partitura, 'faltou a partitura');
    assert.ok(Number.isFinite(it.partitura.y), 'a tela não pode ter de calcular a posição');
    assert.equal(it.partitura.linhas.length, 5);
    assert.equal(it.partitura.y, T.posicaoNaPauta(it.partitura.midi).y);
  });

  // ===================================================================
  secao('Fase 1 · repetição espaçada e nível adaptativo');

  await t('acerto empurra a revisão para a frente; erro traz para hoje', async () => {
    let e = curriculo.proximaRevisao({}, { acertou: true, confianca: 1 });
    assert.equal(e.revisar_em_dias, 1);
    e = curriculo.proximaRevisao(e, { acertou: true, confianca: 1 });
    assert.equal(e.revisar_em_dias, 3);
    e = curriculo.proximaRevisao(e, { acertou: true, confianca: 1 });
    assert.ok(e.revisar_em_dias > 3);
    const errou = curriculo.proximaRevisao(e, { acertou: false, confianca: 1 });
    assert.equal(errou.revisar_em_dias, 0, 'errou volta hoje');
    assert.equal(errou.acertos_seguidos, 0);
  });

  await t('acerto com confiança BAIXA não empurra a revisão', async () => {
    const e = curriculo.proximaRevisao({ acertos_seguidos: 3, intervalo_dias: 9, facilidade: 2.5 },
      { acertou: true, confianca: 0.4 });
    assert.equal(e.acertos_seguidos, 0,
      'medida em que não se confia não pode "aprovar" o aluno');
  });

  await t('o nível sobe com desempenho alto e desce com baixo', async () => {
    const alto = Array.from({ length: 8 }, () => ({ acerto: true, vale_nota: true }));
    assert.equal(curriculo.ajustarNivel(2, alto).nivel, 3);
    const baixo = Array.from({ length: 8 }, () => ({ acerto: false, vale_nota: true }));
    assert.equal(curriculo.ajustarNivel(2, baixo).nivel, 1);
    assert.equal(curriculo.ajustarNivel(2, alto.slice(0, 3)).mudou, false, 'poucas tentativas não mudam nada');
    assert.equal(curriculo.ajustarNivel(5, alto).nivel, 5, 'não passa do teto');
  });

  await t('tentativa que não vale nota não conta para subir de nível', async () => {
    const soIndicacoes = Array.from({ length: 8 }, () => ({ acerto: true, vale_nota: false }));
    assert.equal(curriculo.ajustarNivel(2, soIndicacoes).mudou, false);
  });

  // ===================================================================
  secao('Fase 1 · calibração do microfone');

  await t('ruído alto: calibra, mas avisa que não vale nota', async () => {
    const r = await req('POST', '/music/api/calibracao', { como: 'ana', corpo: { ruido_db: -18, latencia_ms: 90 } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.calibracao.microfone_ok, false);
    assert.ok(/barulhento/i.test(r.json.calibracao.aviso), r.json.calibracao.aviso);
  });

  await t('ambiente silencioso calibra de verdade', async () => {
    const r = await req('POST', '/music/api/calibracao', { como: 'ana', corpo: { ruido_db: -52, latencia_ms: 40 } });
    assert.equal(r.json.calibracao.microfone_ok, true);
    const e = await req('GET', '/music/api/calibracao', { como: 'ana' });
    assert.equal(e.json.calibracao.calibrado, true);
  });

  await t('calibração VENCE: ambiente muda, e medida velha não vale', async () => {
    const velho = new Date(Date.now() - 30 * 86400000).toISOString();
    db.prepare('UPDATE usuarios_music SET calibracao = ? WHERE academy_user_id = ?')
      .run(JSON.stringify({ microfone_ok: true, ruido_db: -50, em: velho }), 'u-ana');
    const e = academia.Calibracao.estado('u-ana');
    assert.equal(e.calibrado, false);
    assert.ok(e.vencida && /Refaça/.test(e.motivo));
    await req('POST', '/music/api/calibracao', { como: 'ana', corpo: { ruido_db: -52 } });
  });

  await t('calibração sem o ruído medido é recusada', async () => {
    const r = await req('POST', '/music/api/calibracao', { como: 'ana', corpo: {} });
    assert.equal(r.status, 400);
  });

  // ===================================================================
  secao('Fase 1 · praticar pela API');

  let itemAtual = null;
  await t('o próximo item NÃO traz o gabarito', async () => {
    const r = await req('POST', '/music/api/exercicios/proximo',
      { como: 'ana', corpo: { tipo: 'teoria.intervalo' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    itemAtual = r.json.item;
    assert.ok(itemAtual.enunciado);
    assert.equal(itemAtual.esperado, undefined,
      'mandar o gabarito junto faria o exercício virar decoreba de inspetor');
    assert.ok(itemAtual.semente, 'a semente volta para o servidor poder conferir depois');
  });

  await t('o CONTRATO da medida chega ANTES da resposta (decisão Q5)', async () => {
    assert.ok(itemAtual.contrato, 'o item tem de dizer o que mede antes de o aluno responder');
    assert.ok(itemAtual.contrato.mede);
    assert.equal(typeof itemAtual.contrato.pode_valer_nota, 'boolean');
  });

  await t('recarregar devolve o MESMO item — o aluno não perde o exercício', async () => {
    const r = await req('POST', '/music/api/exercicios/proximo', { como: 'ana', corpo: { tipo: 'teoria.intervalo' } });
    assert.equal(r.json.item.semente, itemAtual.semente);
    assert.equal(r.json.item.enunciado, itemAtual.enunciado);
  });

  await t('responder corrige, mostra o gabarito e grava o critério da época', async () => {
    const gab = curriculo.gerarItem({ tipo: 'teoria.intervalo', nivel: itemAtual.nivel, sem: itemAtual.semente });
    const r = await req('POST', '/music/api/exercicios/responder', {
      como: 'ana',
      corpo: { tipo: 'teoria.intervalo', nivel: itemAtual.nivel, semente: itemAtual.semente,
        resposta: { valor: gab.esperado.valor }, ms_gasto: 4200 },
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.acerto, true);
    assert.ok(r.json.gabarito, 'ver o gabarito DEPOIS é o que transforma erro em aprendizado');
    const linha = db.prepare('SELECT * FROM tentativas WHERE id = ?').get(r.json.tentativa_id);
    assert.ok(linha.criterio.length > 10, 'sem o critério gravado, contestar meses depois é impossível');
    assert.equal(linha.ms_gasto, 4200);
  });

  await t('depois de responder, o próximo item é OUTRO', async () => {
    const r = await req('POST', '/music/api/exercicios/proximo', { como: 'ana', corpo: { tipo: 'teoria.intervalo' } });
    assert.notEqual(r.json.item.semente, itemAtual.semente);
  });

  await t('exercício de microfone sem calibração vira INDICAÇÃO, não nota', async () => {
    db.prepare("UPDATE usuarios_music SET calibracao = '{}' WHERE academy_user_id = ?").run('u-bruno');
    const p = await req('POST', '/music/api/exercicios/proximo', { como: 'bruno', corpo: { tipo: 'afinacao.sustentada' } });
    assert.equal(p.json.item.contrato.exige_calibracao, true);
    assert.equal(p.json.item.contrato.calibrado, false);
    assert.ok(p.json.item.contrato.aviso_calibracao, 'a tela precisa do motivo, não de um bloqueio mudo');

    const it = curriculo.gerarItem({ tipo: 'afinacao.sustentada', nivel: p.json.item.nivel, sem: p.json.item.semente });
    const r = await req('POST', '/music/api/exercicios/responder', {
      como: 'bruno',
      corpo: { tipo: 'afinacao.sustentada', nivel: p.json.item.nivel, semente: p.json.item.semente,
        resposta: { amostras: sustentada({ nota: it.esperado.nota, cents: 2 }) } },
    });
    assert.equal(r.json.acerto, true);
    assert.equal(r.json.vale_nota, false);
    assert.ok(r.json.ressalvas.length);
  });

  await t('o painel de estudo junta revisão, trilhas, estatística e calibração', async () => {
    const r = await req('GET', '/music/api/estudo', { como: 'ana' });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json.revisar_hoje));
    assert.ok(r.json.trilhas.length >= 5, 'as trilhas do catálogo têm de estar semeadas');
    assert.ok(r.json.estatisticas.tentativas >= 1);
    assert.equal(r.json.sou_professor, false);
  });

  await t('estatísticas separam o que valeu nota do que foi indicação', async () => {
    const r = await req('GET', '/music/api/estatisticas', { como: 'bruno' });
    const e = r.json.estatisticas;
    assert.ok(e.tentativas >= 1);
    assert.ok(e.valeram_nota < e.tentativas, 'a indicação do bruno não pode contar como nota');
  });

  await t('a sequência de dias conta o hábito', async () => {
    assert.ok(academia.Pratica.sequencia('u-ana') >= 1);
    assert.equal(academia.Pratica.sequencia('u-ninguem'), 0);
  });

  // ===================================================================
  secao('Fase 1 · trilhas');

  await t('as trilhas do catálogo foram semeadas com os itens', async () => {
    const r = await req('GET', '/music/api/trilhas', { como: 'ana' });
    const t0 = r.json.trilhas.find((x) => x.slug === 'primeiros-passos');
    assert.ok(t0, 'faltou a trilha de entrada');
    assert.ok(t0.itens.length >= 4);
    assert.equal(t0.itens[0].estado, 'atual');
    assert.equal(t0.itens[1].estado, 'travado');
  });

  await t('semear de novo NÃO duplica (upsert)', async () => {
    const antes = db.prepare('SELECT COUNT(*) AS n FROM trilhas').get().n;
    academia.Trilhas.semear();
    const depois = db.prepare('SELECT COUNT(*) AS n FROM trilhas').get().n;
    assert.equal(antes, depois);
    const itens = db.prepare("SELECT COUNT(*) AS n FROM trilha_itens WHERE trilha_id = (SELECT id FROM trilhas WHERE slug = 'primeiros-passos')").get().n;
    assert.equal(itens, 5, 'reimportar não pode multiplicar os itens da trilha');
  });

  await t('avançar move o ponteiro e conclui no fim', async () => {
    const slug = 'ritmo-e-pulso';
    let r;
    for (let i = 0; i < 3; i++) r = await req('POST', `/music/api/trilhas/${slug}/avancar`, { como: 'ana' });
    assert.equal(r.json.progresso.concluiu, true);
    const t2 = await req('GET', `/music/api/trilhas/${slug}`, { como: 'ana' });
    assert.ok(t2.json.trilha.progresso.concluida_em);
  });

  // ===================================================================
  secao('Fase 1 · tarefa, submissão, nota e o VÍNCULO');

  let tarefaId, submissaoId;

  await t('quem não é professor recebe 403 COM o caminho para virar professor', async () => {
    const r = await req('POST', '/music/api/prof/tarefas', { como: 'ana', corpo: { titulo: 'x' } });
    assert.equal(r.status, 403);
    assert.equal(r.json.onde, '/academy/app');
  });

  await t('professor cria tarefa e atribui ao aluno', async () => {
    const r = await req('POST', '/music/api/prof/tarefas', {
      como: 'prof',
      corpo: { titulo: 'Escala de dó em duas oitavas', instrucoes: 'Grave devagar, com metrônomo a 60.', nota_maxima: 10 },
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    tarefaId = r.json.tarefa.id;
    const a = await req('POST', `/music/api/prof/tarefas/${tarefaId}/alunos`, { como: 'prof', corpo: { alunos: ['u-ana'] } });
    assert.equal(a.json.atribuidos, 1);
  });

  await t('a tarefa aparece para o aluno certo e só para ele', async () => {
    const ana = await req('GET', '/music/api/tarefas', { como: 'ana' });
    assert.equal(ana.json.tarefas.length, 1);
    const bruno = await req('GET', '/music/api/tarefas', { como: 'bruno' });
    assert.equal(bruno.json.tarefas.length, 0);
  });

  await t('tarefa que pede áudio recusa envio sem gravação, e explica', async () => {
    const r = await req('POST', `/music/api/tarefas/${tarefaId}/enviar`, { como: 'ana', corpo: { texto: 'fiz' } });
    assert.equal(r.status, 400);
    assert.ok(/gravação/i.test(r.json.erro), r.json.erro);
  });

  await t('aluno envia com áudio', async () => {
    const r = await req('POST', `/music/api/tarefas/${tarefaId}/enviar`,
      { como: 'ana', corpo: { texto: 'primeira tentativa', media_id: 'md-1' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    submissaoId = r.json.submissao.id;
    assert.equal(r.json.submissao.status, 'enviada');
  });

  await t('REENVIO não é duplicata: é o único conserto de quem gravou errado', async () => {
    const r = await req('POST', `/music/api/tarefas/${tarefaId}/enviar`,
      { como: 'ana', corpo: { texto: 'agora foi', media_id: 'md-2' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.submissao.id, submissaoId, 'reenviar atualiza, não cria uma segunda');
    assert.equal(r.json.submissao.media_id, 'md-2');
    const n = db.prepare('SELECT COUNT(*) AS n FROM submissoes WHERE tarefa_id = ?').get(tarefaId).n;
    assert.equal(n, 1);
  });

  await t('aluno de fora não envia nessa tarefa', async () => {
    const r = await req('POST', `/music/api/tarefas/${tarefaId}/enviar`, { como: 'bruno', corpo: { media_id: 'x' } });
    assert.equal(r.status, 400);
    assert.ok(/não é sua/i.test(r.json.erro));
  });

  await t('professor vê as submissões da tarefa dele', async () => {
    const r = await req('GET', `/music/api/prof/tarefas/${tarefaId}/submissoes`, { como: 'prof' });
    assert.equal(r.status, 200);
    assert.equal(r.json.submissoes.length, 1);
    assert.equal(r.json.submissoes[0].texto, 'agora foi');
  });

  await t('aluno NÃO vê submissão de outro aluno', async () => {
    const r = await req('GET', `/music/api/submissoes/${submissaoId}`, { como: 'bruno' });
    assert.equal(r.status, 403);
  });

  await t('nota fora do intervalo é recusada com o limite na mensagem', async () => {
    const r = await req('POST', `/music/api/prof/submissoes/${submissaoId}/feedback`,
      { como: 'prof', corpo: { nota: 42, texto: 'ótimo' } });
    assert.equal(r.status, 400);
    assert.ok(/entre 0 e 10/.test(r.json.erro), r.json.erro);
  });

  await t('feedback vazio é recusado: retorno sem conteúdo não é retorno', async () => {
    const r = await req('POST', `/music/api/prof/submissoes/${submissaoId}/feedback`, { como: 'prof', corpo: {} });
    assert.equal(r.status, 400);
  });

  await t('a NOTA é do humano, e a indicação do sistema fica SEPARADA', async () => {
    const r = await req('POST', `/music/api/prof/submissoes/${submissaoId}/feedback`, {
      como: 'prof',
      corpo: { texto: 'Afinação boa; cuide do tempo na subida.', nota: 8.5,
        indicacao_sistema: { acerto: true, confianca: 0.62, vale_nota: false } },
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const f = r.json.feedbacks[0];
    assert.equal(f.nota, 8.5);
    assert.equal(f.origem, 'professor');
    assert.equal(f.indicacao_sistema.confianca, 0.62);
    assert.notEqual(f.nota, f.indicacao_sistema.nota,
      'nota e indicação em colunas separadas é o que impede uma virar a outra por descuido');
    const sub = db.prepare('SELECT * FROM submissoes WHERE id = ?').get(submissaoId);
    assert.equal(sub.status, 'avaliada');
  });

  await t('o aluno vê a nota e o retorno', async () => {
    const r = await req('GET', `/music/api/submissoes/${submissaoId}`, { como: 'ana' });
    assert.equal(r.status, 200);
    assert.equal(r.json.feedbacks[0].nota, 8.5);
  });

  await t('M1 CONTESTAÇÃO: só o professor DA TAREFA resolve (nota de aluno alheio)', async () => {
    // A listagem já amarrava professor↔tarefa; a escrita não. Qualquer docente
    // com o id da contestação podia fechá-la e REGRAVAR a nota.
    const c = await req('POST', '/music/api/contestacoes',
      { como: 'ana', corpo: { submissao_id: submissaoId, motivo: 'Revisão pedida para o teste do M1.' } });
    assert.equal(c.status, 200, JSON.stringify(c.json));
    const id = c.json.contestacao.id;
    let barrou = false;
    try {
      academia.Contestacoes.resolver('u-prof2',
        { id, acolher: true, resposta: 'invadindo', notaNova: 10 });
    } catch (_) { barrou = true; }
    assert.ok(barrou, 'u-prof2 é docente de verdade, mas não é o da tarefa: não pode resolver');
    const ainda = academia.Contestacoes.doAluno('u-ana').find((x) => x.id === id);
    assert.equal(ainda.status, 'aberta', 'a contestação tem de continuar aberta');
    // e o professor da tarefa continua conseguindo
    const ok = academia.Contestacoes.resolver('u-prof',
      { id, acolher: false, resposta: 'Mantida.', notaNova: null });
    assert.equal(ok.status, 'mantida', 'o professor da tarefa tem de conseguir');
  });

  await t('CONTESTAÇÃO: o aluno pede revisão e o professor acolhe com nota nova', async () => {
    const c = await req('POST', '/music/api/contestacoes',
      { como: 'ana', corpo: { submissao_id: submissaoId, motivo: 'O metrônomo do exercício estava em 80, não 60.' } });
    assert.equal(c.status, 200, JSON.stringify(c.json));
    const abertas = await req('GET', '/music/api/prof/contestacoes', { como: 'prof' });
    assert.equal(abertas.json.contestacoes.length, 1);
    const r = await req('POST', `/music/api/prof/contestacoes/${c.json.contestacao.id}`,
      { como: 'prof', corpo: { acolher: true, resposta: 'Conferi, você tem razão.', nota_nova: 9.5 } });
    assert.equal(r.json.contestacao.status, 'acolhida');
    const fb = academia.Feedbacks.daSubmissao(submissaoId);
    assert.equal(fb.length, 2, 'a revisão ENTRA no histórico; a nota antiga não some');
    assert.equal(fb[1].origem, 'revisao');
    assert.equal(fb[1].nota, 9.5);
  });

  await t('contestação sem motivo é recusada', async () => {
    const r = await req('POST', '/music/api/contestacoes', { como: 'ana', corpo: { submissao_id: submissaoId } });
    assert.equal(r.status, 400);
  });

  await t('contestar submissão de outro é recusado', async () => {
    const r = await req('POST', '/music/api/contestacoes',
      { como: 'bruno', corpo: { submissao_id: submissaoId, motivo: 'quero ver' } });
    assert.equal(r.status, 400);
  });

  await t('ARQUIVAR a tarefa ENCERRA o acesso do professor às submissões', async () => {
    const a = await req('POST', `/music/api/prof/tarefas/${tarefaId}/arquivar`, { como: 'prof' });
    assert.equal(a.status, 200);
    const r = await req('GET', `/music/api/prof/tarefas/${tarefaId}/submissoes`, { como: 'prof' });
    assert.equal(r.status, 400);
    assert.ok(/arquivada/i.test(r.json.erro), 'permissão é do VÍNCULO, não da pessoa: ' + r.json.erro);
    const v = academia.Submissoes.podeVer(academia.Submissoes.porId(submissaoId), 'u-prof');
    assert.equal(v.pode, false);
  });

  await t('o ALUNO continua vendo a própria submissão depois de a tarefa ser arquivada', async () => {
    const r = await req('GET', `/music/api/submissoes/${submissaoId}`, { como: 'ana' });
    assert.equal(r.status, 200, 'o trabalho é dele; arquivar a tarefa não apaga o histórico do aluno');
  });

  await t('tarefa arquivada não recebe aluno novo nem envio', async () => {
    const a = await req('POST', `/music/api/prof/tarefas/${tarefaId}/alunos`, { como: 'prof', corpo: { alunos: ['u-bruno'] } });
    assert.equal(a.status, 400);
    const e = await req('POST', `/music/api/tarefas/${tarefaId}/enviar`, { como: 'ana', corpo: { media_id: 'z' } });
    assert.equal(e.status, 400);
  });

  await t('as ações de ensino ficam na auditoria', async () => {
    const acoes = require('./direitos').auditoria(300).map((e) => e.acao);
    for (const a of ['tarefa.criada', 'tarefa.atribuida', 'nota.dada', 'contestacao.aberta',
      'contestacao.resolvida', 'tarefa.arquivada']) {
      assert.ok(acoes.includes(a), 'falta na auditoria: ' + a);
    }
  });

  // ===================================================================
  secao('Fase 1 · ferramentas abertas ao visitante');

  await t('afinador, metrônomo e gerador respondem SEM login', async () => {
    const r = await req('GET', '/music/ferramentas', { cru: true });
    assert.equal(r.status, 200);
    for (const termo of ['Afinador', 'Metrônomo', 'Gerador de tons']) {
      assert.ok(r.texto.includes(termo), 'faltou ' + termo);
    }
    assert.ok(!/api\/me/.test(r.texto), 'a página não pode depender de sessão');
  });

  await t('o metrônomo agenda no relógio do áudio, não em setInterval', async () => {
    const r = await req('GET', '/music/ferramentas', { cru: true });
    assert.ok(/currentTime/.test(r.texto), 'sem agendar por currentTime o metrônomo derrapa audivelmente');
    assert.ok(/JANELA_S|LOOKAHEAD/.test(r.texto));
  });

  await t('a página diz o que o afinador NÃO faz', async () => {
    const r = await req('GET', '/music/ferramentas', { cru: true });
    assert.ok(/não separa acordes/i.test(r.texto),
      'prometer o que a física não entrega é o jeito mais rápido de perder o usuário');
  });

  await t('o microfone é desligado ao sair da página', async () => {
    const r = await req('GET', '/music/ferramentas', { cru: true });
    assert.ok(/pagehide/.test(r.texto) && /getTracks/.test(r.texto),
      'microfone aberto depois de sair é falha de privacidade');
  });

  await t('a landing leva às ferramentas', async () => {
    const r = await req('GET', '/music', { cru: true });
    assert.ok(/\/music\/ferramentas/.test(r.texto));
  });

  // ===================================================================
  secao('Fase 1 · app do músico');

  await t('os scripts do app são servidos INTEIROS', async () => {
    // Isto existe por um acidente real: um script de edição truncou o
    // `app-cliente.js` para zero byte ao falhar na codificação, e
    // `node --check` passou — arquivo vazio é JavaScript válido. Um
    // teste de sintaxe nunca veria; um teste de CONTEÚDO vê.
    const audio = await req('GET', '/music/audio.js', { cru: true });
    assert.equal(audio.status, 200);
    assert.ok(audio.texto.length > 4000, 'audio.js veio com ' + audio.texto.length + ' bytes');
    for (const fn of ['detectarHz', 'capturarSustentada', 'capturarOnsets', 'capturarMelodia', 'medirRuido']) {
      assert.ok(audio.texto.includes(fn), 'faltou ' + fn + ' em audio.js');
    }

    const app = await req('GET', '/music/app.js', { cru: true });
    assert.equal(app.status, 200);
    assert.ok(app.texto.length > 8000, 'app.js veio com ' + app.texto.length + ' bytes');
    for (const tela of ['verEstudar', 'verPraticar', 'verTarefas', 'verProgresso', 'verProfessor', 'pauta']) {
      assert.ok(app.texto.includes(tela), 'faltou a tela ' + tela);
    }
  });

  await t('o app não desenha a pauta por conta própria', async () => {
    const app = await req('GET', '/music/app.js', { cru: true });
    assert.ok(!/GRAUS\s*=\s*\[0, 0, 1/.test(app.texto),
      'a geometria da pauta tem de vir do servidor, onde é testada');
    assert.ok(/p\.y/.test(app.texto), 'o desenho usa a posição que recebeu');
  });

  await t('a página do app carrega os dois scripts e não embute gabarito', async () => {
    const r = await req('GET', '/music/app', { cru: true });
    assert.equal(r.status, 200);
    assert.ok(r.texto.includes('/music/audio.js'));
    assert.ok(r.texto.includes('/music/app.js'));
    assert.ok(!/esperado/.test(r.texto), 'a casca não pode trazer gabarito nenhum');
  });
}

module.exports = { rodar, sustentada, melodia };
