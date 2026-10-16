'use strict';
// Motor real, sem DOM, relógio de parede, microfone, rede ou banco.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('./nucleo');
const Aprender = require('./aprender');
const Detector = require('./detector');
let testes = 0;
function verificar(nome, fn) { fn(); testes++; console.log('OK', nome); }
function chart(midis = [40, 42, 44]) {
  return { id: 'aprender-teste', title: 'Aprendizagem', bpm: 90, duration: midis.length + 2,
    notes: midis.map((midi, i) => ({ id: 'n' + (i + 1), time: i + 1, duration: 0.25, string: 6, fret: midi - 40, midi })) };
}
function quadro(t, midi = 40, extra = {}) {
  return Object.assign({ audioTime: t, hz: midi === null ? null : 440 * Math.pow(2, (midi - 69) / 12),
    confidence: midi === null ? 0 : 0.99, rms: midi === null ? 0 : 0.1, onset: false, clipped: 0 }, extra);
}
function tocar(motor, t, midi = 40, extra = {}) {
  const mudancas = [];
  for (let i = 0; i < 4; i++) {
    const onset = extra.onset === true ? i === 0 : extra.onset === undefined ? false : extra.onset;
    const r = motor.amostrar(quadro(t + i * 0.024, midi, Object.assign({}, extra, { onset })));
    if (r) mudancas.push(r);
  }
  return mudancas;
}
const TAXA = 48000, E2 = 440 * Math.pow(2, (40 - 69) / 12);
function janela(sinal, centro) {
  return Float32Array.from({ length: 3072 }, (_, i) => sinal(centro - 0.032 + i / TAXA));
}
function palhetadas(inicios, decaimento = 0.3) {
  return t => {
    let amplitude = 0;
    for (const inicio of inicios) if (t >= inicio) amplitude += 0.15 * Math.exp(-(t - inicio) / decaimento);
    return amplitude * Math.sin(2 * Math.PI * E2 * t);
  };
}
function fluxoAudio(sinal, { midis = [40, 40], duracao = 1.8, antes } = {}) {
  const detector = Detector.criar(), motor = Aprender.criar(chart(midis));
  const frames = [], mudancas = [];
  for (let i = 0; 0.032 + i * 0.024 < duracao; i++) {
    const t = 0.032 + i * 0.024;
    if (antes) antes(motor, t);
    const frame = detector.analisar(janela(sinal, t), TAXA, t);
    frames.push(frame);
    const resultado = motor.amostrar(frame);
    if (resultado) mudancas.push(resultado);
  }
  return { frames, mudancas, resumo: motor.resumo() };
}
let sementeRuido = 41;
const ruido = Float32Array.from({ length: TAXA * 3 }, () => {
  sementeRuido = (sementeRuido * 1664525 + 1013904223) >>> 0;
  return sementeRuido / Math.pow(2, 32) * 2 - 1;
});
function ruidoEm(t) { return ruido[Math.max(0, Math.round(t * TAXA)) % ruido.length]; }

verificar('Nota estável avança uma vez, sem prazo e sem penalizar alturas erradas', () => {
  const m = Aprender.criar(chart());
  assert.deepEqual(tocar(m, 1, 42), []);
  assert.equal(m.alvo().id, 'n1');
  assert.equal(m.resumo().pending, 3);
  assert.equal(tocar(m, 600, 40).length, 1);
  assert.equal(m.alvo().id, 'n2');
  assert.equal(m.resumo().hits, 1);
  assert.deepEqual(tocar(m, 601, 40), []);
  assert.equal(m.resumo().hits, 1);
});
verificar('MIDI absoluto rejeita oitava; tolerância em cents respeita a afinação', () => {
  const m = Aprender.criar(chart([40]));
  assert.deepEqual(tocar(m, 1, 52), []);
  assert.deepEqual(tocar(m, 2, 40, { hz: quadro(0).hz * Math.pow(2, 46 / 1200) }), []);
  const r = tocar(m, 3, 40, { hz: quadro(0).hz * Math.pow(2, -30 / 1200) });
  assert.equal(r.length, 1); assert.equal(r[0].cents, -30);
});
verificar('Confiança, ruído, sinal fraco e clipping não confirmam nota', () => {
  const m = Aprender.criar(chart([40]));
  for (const [i, invalido] of [{ confidence: 0.69 }, { rms: 0.0029 }, { clipped: 0.081 }, { hz: null }, { confidence: NaN }, { rms: -1 }, { clipped: Infinity }, { hz: Infinity }, { onset: 'sim' }].entries()) {
    assert.deepEqual(tocar(m, 1 + i, 40, invalido), []);
  }
  assert.equal(m.resumo().hits, 0);
  assert.equal(tocar(m, 20, 40, { confidence: 0.7, rms: 0.003, clipped: 0.08 }).length, 1);
});
verificar('Leitura interrompida ou nota errada reinicia a confirmação estável', () => {
  const m = Aprender.criar(chart([40]));
  m.amostrar(quadro(1)); m.amostrar(quadro(1.024));
  assert.equal(m.amostrar(quadro(1.2)), null, 'intervalo grande não completa estabilidade');
  m.amostrar(quadro(1.224, 42));
  assert.equal(m.amostrar(quadro(1.248)), null);
  assert.equal(m.amostrar(quadro(1.272)), null);
  assert.equal(m.amostrar(quadro(1.296)), null);
  assert.equal(m.amostrar(quadro(1.32)).status, 'hit');
});
verificar('Notas repetidas exigem ataque novo; sustain e quadros antigos não avançam', () => {
  const m = Aprender.criar(chart([40, 40]));
  assert.equal(tocar(m, 1, 40, { onset: true }).length, 1);
  assert.deepEqual(tocar(m, 1.096, 40), []);
  assert.deepEqual(tocar(m, 1.2, 40), []);
  assert.deepEqual(tocar(m, 1, 40, { onset: true }), []);
  assert.equal(m.resumo().hits, 1);
  const r = tocar(m, 2, 40, { onset: true });
  assert.equal(r.length, 1); assert.equal(r[0].id, 'n2');
});
verificar('Silêncio confirmado permite repetir; ruído forte não inventa novo ataque', () => {
  const m = Aprender.criar(chart([40, 40]));
  tocar(m, 1, 40);
  tocar(m, 1.2, 40, { confidence: 0.1, rms: 0.3, hz: null });
  assert.deepEqual(tocar(m, 1.4, 40), []);
  m.amostrar(quadro(1.6, null)); m.amostrar(quadro(1.624, null));
  assert.equal(tocar(m, 1.648, 40).length, 1);
});
verificar('Mudança estável de altura aceita próximo alvo sem onset; oscilação isolada não', () => {
  const m = Aprender.criar(chart([40, 42, 42]));
  tocar(m, 1, 40);
  assert.equal(m.amostrar(quadro(1.096, 42)), null);
  assert.equal(m.amostrar(quadro(1.12, 40)), null);
  assert.equal(tocar(m, 1.144, 42).length, 1);
  assert.equal(m.alvo().id, 'n3');
  assert.deepEqual(tocar(m, 1.24, 42), []);
});
verificar('Quadros com mesmo relógio, regressão ou relógio inválido são descartados', () => {
  const m = Aprender.criar(chart([40]));
  m.amostrar(quadro(2)); m.amostrar(quadro(2.024));
  for (const t of [2.024, 2.01, -1, NaN, Infinity, '2.048']) assert.equal(m.amostrar(quadro(t)), null);
  assert.equal(m.amostrar(null), null);
  assert.equal(m.amostrar(quadro(2.048)), null);
  assert.equal(m.amostrar(quadro(2.072)).status, 'hit');
});
verificar('Gate exclui janela de 64 ms e exige novo ataque após guia e cauda', () => {
  const m = Aprender.criar(chart([40]));
  assert.equal(m.bloquearAte(2), true);
  for (const t of [1.8, 1.824, 1.848, 1.872, 2.001, 2.031]) assert.equal(m.amostrar(quadro(t, 40, { onset: true })), null);
  assert.deepEqual(tocar(m, 2.04, 40), [], 'sustain da guia não conta mesmo após gate');
  assert.equal(m.amostrar(quadro(2.2, 40, { onset: true })), null);
  assert.equal(m.amostrar(quadro(2.224, 40)), null);
  assert.equal(m.amostrar(quadro(2.248, 40)), null);
  assert.equal(m.amostrar(quadro(2.272, 40)).status, 'hit');
});
verificar('Gate acompanha janela de 128 ms do contrabaixo e não aceita a cauda da guia', () => {
  const m = Aprender.criar(chart([40]), { windowMs: 128 });
  m.bloquearAte(2);
  assert.equal(m.amostrar(quadro(2.063, 40, { onset: true })), null, 'a janela ainda cruza o gate');
  assert.equal(m.amostrar(quadro(2.064, 40, { onset: true })), null, 'o ataque pode começar no limite da janela');
  assert.equal(m.amostrar(quadro(2.088, 40)), null);
  assert.equal(m.amostrar(quadro(2.112, 40)), null);
  assert.equal(m.amostrar(quadro(2.136, 40)).status, 'hit');
});
verificar('Bloqueio crescente não retrocede; silêncio antes do gate não rearma', () => {
  const m = Aprender.criar(chart([40]));
  m.bloquearAte(4); m.bloquearAte(2);
  tocar(m, 3, null);
  assert.deepEqual(tocar(m, 4.04, 40), []);
  assert.equal(m.bloquearAte(NaN), false);
  assert.equal(m.retomar(-1), false);
  m.amostrar(quadro(4.2, null)); m.amostrar(quadro(4.224, null));
  assert.equal(tocar(m, 4.248, 40).length, 1);
});
verificar('Retomar invalida confirmação parcial, quadros antigos e sustain pós-pausa', () => {
  const m = Aprender.criar(chart([40, 42]));
  m.amostrar(quadro(1)); m.amostrar(quadro(1.024));
  m.retomar(3);
  assert.deepEqual(tocar(m, 1.048, 40), []);
  assert.deepEqual(tocar(m, 3.04, 40), []);
  assert.equal(tocar(m, 3.2, 40, { onset: true }).length, 1);
  m.retomar(4);
  assert.deepEqual(tocar(m, 4.04, 42), [], 'nem mudança de altura contorna a retomada');
  assert.equal(tocar(m, 4.2, 42, { onset: true }).length, 1);
});
verificar('Pular registra skipped, bloqueia quadros antigos e não vira acerto', () => {
  const m = Aprender.criar(chart([40, 40]));
  m.amostrar(quadro(1)); m.amostrar(quadro(1.024));
  assert.equal(m.pular(NaN), null); assert.equal(m.pular(1), null);
  assert.deepEqual(m.pular(2), { id: 'n1', status: 'skipped', audioTime: 2 });
  assert.deepEqual(tocar(m, 1.048, 40, { onset: true }), []);
  assert.deepEqual(tocar(m, 2.04, 40), []);
  assert.equal(tocar(m, 3, 40, { onset: true }).length, 1);
  assert.deepEqual(m.resumo(), { total: 2, hits: 1, skipped: 1, pending: 0, complete: true });
  assert.equal(m.alvo(), null); assert.equal(m.pular(4), null);
  assert.deepEqual(tocar(m, 5, 40, { onset: true }), []);
});
verificar('Recorte seleciona início das notas; intervalo sem notas já está completo', () => {
  const m = Aprender.criar(chart(), { from: 2, to: 3, now: 10 });
  assert.equal(m.alvo().id, 'n2'); assert.equal(m.resumo().total, 1);
  assert.deepEqual(tocar(m, 9, 42), []);
  assert.equal(tocar(m, 10.04, 42).length, 1);
  const vazio = Aprender.criar(chart(), { from: 0, to: 0.5 });
  assert.deepEqual(vazio.resumo(), { total: 0, hits: 0, skipped: 0, pending: 0, complete: true });
  assert.equal(vazio.alvo(), null); assert.equal(vazio.pular(1), null); assert.deepEqual(tocar(vazio, 1), []);
});
verificar('Opções e chart inválidos rejeitados; configurações válidas controlam confirmação', () => {
  for (const options of [null, [], { from: -1 }, { to: 99 }, { from: 2, to: 2 }, { now: NaN }, { now: -1 },
    { stableMs: 0 }, { stableMs: Infinity }, { minConfidence: 1.01 }, { minRms: 0 }, { centsTolerance: 51 }, { stableMs: '60' }, { windowMs: 34 }, { windowMs: 251 }]) {
    assert.throws(() => Aprender.criar(chart(), options));
  }
  assert.throws(() => Aprender.criar({}));
  const m = Aprender.criar(chart([40]), { stableMs: 100, centsTolerance: 10, minConfidence: 0.9, minRms: 0.01 });
  assert.deepEqual(tocar(m, 1, 40), []);
  assert.equal(m.amostrar(quadro(1.096)), null);
  assert.equal(m.amostrar(quadro(1.12)).status, 'hit');
});
verificar('Resultados e alvos são cópias; UMD funciona no navegador sem DOM', () => {
  const original = chart([40]), m = Aprender.criar(original);
  original.notes[0].midi = 42;
  const alvo = m.alvo(); alvo.midi = 42;
  const estados = m.estados(); estados[0].status = 'hit';
  assert.equal(m.alvo().midi, 40); assert.equal(m.estados()[0].status, 'pending');
  const r = tocar(m, 1)[0]; r.status = 'skipped';
  assert.equal(m.estados()[0].status, 'hit');
  const contexto = { MusiqueTocarCore: Core }; contexto.self = contexto;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'aprender.js'), 'utf8'), contexto);
  assert.equal(contexto.MusiqueTocarAprender.criar(chart()).resumo().pending, 3);
});
verificar('Detector real confirma duas palhetadas E2 sem silêncio entre elas', () => {
  for (const decaimento of [0.3, 0.5]) {
    const r = fluxoAudio(palhetadas([0.1, 0.7], decaimento));
    assert.equal(r.resumo.hits, 2);
    const ataques = r.frames.filter(f => f.onset);
    assert.equal(ataques.length, 2, 'cada subida gera um único ataque');
    for (const ataque of ataques) {
      const transiente = r.frames.find(f => f.audioTime === ataque.onsetTime);
      assert.ok(transiente && transiente.hz === null, 'a subida precede a periodicidade neste sinal');
      assert.ok(ataque.audioTime > ataque.onsetTime);
      assert.ok(ataque.audioTime - ataque.onsetTime <= 0.075);
    }
    assert.ok(r.frames.filter(f => f.audioTime > 0.2 && f.audioTime < 0.7).every(f => f.rms >= 0.003),
      'o segundo acerto não depende de rearme por silêncio');
  }
});
verificar('Detector real não usa sustentação contínua ou decaimento como segunda palhetada', () => {
  for (const sinal of [t => 0.15 * Math.sin(2 * Math.PI * E2 * t), palhetadas([0.1])]) {
    const r = fluxoAudio(sinal);
    assert.equal(r.resumo.hits, 1);
    assert.equal(r.frames.filter(f => f.onset).length, 1);
  }
});
verificar('Detector real rejeita ruído e clipping; transiente sobre sustain não rearma', () => {
  for (const sinal of [t => 0.4 * ruidoEm(t), t => Math.max(-1, Math.min(1, 2 * Math.sin(2 * Math.PI * E2 * t)))]) {
    const r = fluxoAudio(sinal);
    assert.equal(r.resumo.hits, 0);
    assert.equal(r.frames.filter(f => f.onset).length, 0);
  }
  const r = fluxoAudio(t => 0.08 * Math.sin(2 * Math.PI * E2 * t) + (t >= 0.7 && t < 0.74 ? 0.5 * ruidoEm(t) : 0));
  assert.equal(r.resumo.hits, 1, 'voltar ao nível anterior após ruído não é nova palhetada');
  assert.equal(r.frames.filter(f => f.onset).length, 1);
});
verificar('Candidato expira: nota periódica tardia não reaproveita subida de ruído', () => {
  const r = fluxoAudio(t => t >= 0.6 && t < 0.9 ? 0.8 * ruidoEm(t) :
    (t < 0.6 ? 0.05 : 0.2) * Math.sin(2 * Math.PI * E2 * t));
  assert.equal(r.resumo.hits, 1);
  assert.equal(r.frames.filter(f => f.onset).length, 1);
  assert.ok(r.frames.some(f => f.audioTime > 1 && f.confidence >= 0.85 && f.rms > 0.1),
    'há nota confiável depois do prazo, mas falta novo ataque');
});
verificar('Clipping cancela candidato pendente; reiniciar limpa a subida anterior', () => {
  for (const cancelar of ['clipping', 'reiniciar']) {
    const detector = Detector.criar(), motor = Aprender.criar(chart());
    const enviar = (sinal, t) => {
      const frame = detector.analisar(janela(sinal, t), TAXA, t);
      motor.amostrar(frame); return frame;
    };
    const tom = t => 0.05 * Math.sin(2 * Math.PI * E2 * t);
    for (const t of [1, 1.024, 1.048, 1.072]) enviar(tom, t);
    assert.equal(motor.resumo().hits, 1);
    assert.equal(enviar(t => 0.4 * ruidoEm(t), 1.2).onset, false);
    if (cancelar === 'clipping') {
      assert.ok(enviar(t => Math.max(-1, Math.min(1, 2 * Math.sin(2 * Math.PI * E2 * t))), 1.224).clipped > 0.08);
      assert.equal(enviar(t => 0.2 * Math.sin(2 * Math.PI * E2 * t), 1.248).onset, false);
    } else {
      detector.reiniciar();
      const frame = enviar(tom, 1.224);
      assert.equal(frame.onset, true);
      assert.equal(frame.onsetTime, 1.224, 'primeiro quadro após reset tem origem própria');
    }
  }
});
verificar('Detector real preserva o gate de guia/retomada quando confirmação chega depois', () => {
  for (const metodo of ['bloquearAte', 'retomar']) for (const gate of [0.66, 0.69]) {
    let bloqueado = false;
    const r = fluxoAudio(palhetadas([0.1, 0.7, 1.3]), { antes(motor, t) {
      if (!bloqueado && t >= gate) { motor[metodo](gate); bloqueado = true; }
    } });
    const atrasado = r.frames.find(f => f.onset && f.audioTime > 0.7 && f.audioTime < 0.8);
    assert.ok(atrasado.audioTime - 0.032 >= gate, 'janela de confirmação já está depois do gate');
    assert.ok(atrasado.onsetTime - 0.032 < gate, 'janela da origem ainda cruza o gate');
    assert.equal(r.resumo.hits, 2);
    assert.ok(r.mudancas[1].audioTime > 1.3, 'só uma nova palhetada após o bloqueio avança');
  }
});
verificar('Origem do ataque é válida, consumida uma vez e opcional para quadros legados', () => {
  const m = Aprender.criar(chart([40, 40]));
  assert.equal(tocar(m, 1, 40, { onset: true, onsetTime: 0.96 }).length, 1);
  assert.deepEqual(tocar(m, 1.4, 40, { onset: true, onsetTime: 0.96 }), []);
  for (const [i, onsetTime] of [NaN, Infinity, -1, '2', 99, null].entries()) {
    assert.deepEqual(tocar(m, 2 + i, 40, { onset: true, onsetTime }), []);
  }
  assert.equal(tocar(m, 10, 40, { onset: true }).length, 1, 'onset booleano sem origem continua aceito');
});
verificar('Confirmação tardia não reutiliza ataque cuja nota já acertou após silêncio', () => {
  const m = Aprender.criar(chart([40, 40]), { stableMs: 40 });
  m.retomar(0.8);
  for (const t of [0.84, 0.864, 0.888]) m.amostrar(quadro(t, null));
  for (const t of [1, 1.024, 1.048]) m.amostrar(quadro(t, 40, { confidence: 0.83 }));
  assert.equal(m.resumo().hits, 1, 'confiança suficiente para acertar antes de confirmar o ataque');
  m.amostrar(quadro(1.072, 40, { onset: true, onsetTime: 1 }));
  for (const t of [1.096, 1.12]) assert.equal(m.amostrar(quadro(t)), null);
  assert.equal(m.resumo().hits, 1, 'origem anterior ao acerto não rearma a nota repetida');
  assert.equal(tocar(m, 1.2, 40, { onset: true, onsetTime: 1.2 }).length, 1,
    'um ataque posterior ao acerto continua aceito');
});
console.log(`${testes} verificações passaram.`);
