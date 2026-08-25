// =====================================================================
// Musique — MIDI (Standard MIDI File). Puro: sem banco, sem usuário,
// sem dependência.
//
// COMO A TRANSPOSIÇÃO É FEITA, E POR QUE ASSIM:
//
//   Não se remonta o arquivo. Copia-se o buffer e trocam-se APENAS os
//   bytes de nota dos eventos que têm nota. Todo o resto — tempo,
//   compasso, nome de faixa, controle, pitch bend, sysex, texto,
//   marcador — passa intacto, byte a byte. Ida e volta é idêntica por
//   construção: o byte da nota tem tamanho fixo, então nada se desloca.
//
// ⚠️ O CANAL 10 NÃO SE TRANSPÕE. No General MIDI o canal 10 (índice 9)
// é percussão, e ali o número da nota escolhe O INSTRUMENTO, não a
// altura: 36 é bumbo, 38 é caixa, 42 é chimbau. Transpor a faixa de
// bateria junto com o resto troca bumbo por caixa e destrói o arranjo —
// e o usuário só descobre ao ouvir. É o defeito mais comum de quem
// transpõe MIDI ingenuamente.
//
// ⚠️ NOTA QUE SAIRIA DA FAIXA 0–127 FAZ A OPERAÇÃO RECUSAR, em vez de
// grudar no limite. Grudar mudaria a música em silêncio: um baixo
// transposto para baixo demais viraria uma linha errada, afinada.
// =====================================================================
'use strict';

const CABECALHO = 0x4d546864;   // "MThd"
const FAIXA = 0x4d54726b;       // "MTrk"
const CANAL_PERCUSSAO = 9;      // canal 10, base 1

const ehMidi = (buf) => Buffer.isBuffer(buf) && buf.length > 14 && buf.readUInt32BE(0) === CABECALHO;

// ---------------------------------------------------------------------
// Varint (delta-time)
// ---------------------------------------------------------------------
function lerVarint(buf, i) {
  let valor = 0; let lidos = 0;
  for (;;) {
    if (i + lidos >= buf.length) throw new Error('Arquivo MIDI truncado (delta-time incompleto).');
    const b = buf[i + lidos]; lidos++;
    valor = (valor << 7) | (b & 0x7f);
    if (!(b & 0x80)) break;
    if (lidos > 4) throw new Error('Arquivo MIDI inválido (delta-time longo demais).');
  }
  return { valor, lidos };
}

/**
 * Percorre uma faixa chamando `aoEvento` em cada evento.
 * `aoEvento({ status, canal, tipo, posDados, tamanhoDados, tempo })`
 *
 * Trata STATUS CONTINUADO (running status): quando o byte não tem o bit
 * alto, o status do evento anterior continua valendo. Ignorar isso faz
 * o parser se perder no meio da faixa — e arquivos reais usam muito.
 */
function percorrerFaixa(buf, inicio, fim, aoEvento) {
  let i = inicio;
  let statusAnterior = 0;
  let tempo = 0;

  while (i < fim) {
    const dt = lerVarint(buf, i);
    i += dt.lidos;
    tempo += dt.valor;
    if (i >= fim) break;

    let status = buf[i];
    if (status & 0x80) i++;
    else status = statusAnterior;               // running status
    if (!(status & 0x80)) throw new Error('Arquivo MIDI inválido (evento sem status).');

    if (status === 0xff) {                      // meta
      const tipo = buf[i]; i++;
      const len = lerVarint(buf, i); i += len.lidos;
      aoEvento({ status, meta: tipo, posDados: i, tamanhoDados: len.valor, tempo });
      i += len.valor;
      statusAnterior = 0;                       // meta não estabelece running status
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {   // sysex
      const len = lerVarint(buf, i); i += len.lidos;
      aoEvento({ status, posDados: i, tamanhoDados: len.valor, tempo });
      i += len.valor;
      statusAnterior = 0;
      continue;
    }

    const alto = status & 0xf0;
    const canal = status & 0x0f;
    const nBytes = (alto === 0xc0 || alto === 0xd0) ? 1 : 2;
    aoEvento({ status, alto, canal, posDados: i, tamanhoDados: nBytes, tempo });
    i += nBytes;
    statusAnterior = status;
  }
  return i;
}

/** Limites das faixas (MTrk) dentro do arquivo. */
function faixas(buf) {
  const out = [];
  let i = 14;                                   // header MThd tem 14 bytes
  while (i + 8 <= buf.length) {
    const tipo = buf.readUInt32BE(i);
    const len = buf.readUInt32BE(i + 4);
    if (tipo === FAIXA) out.push({ inicio: i + 8, fim: Math.min(buf.length, i + 8 + len) });
    i += 8 + len;
  }
  return out;
}

// ---------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------
function resumo(buf) {
  if (!ehMidi(buf)) throw new Error('Isto não parece um arquivo MIDI.');
  const formato = buf.readUInt16BE(8);
  const nFaixas = buf.readUInt16BE(10);
  const divisao = buf.readUInt16BE(12);
  const porBatida = (divisao & 0x8000) ? null : divisao;   // SMPTE não usa ticks por semínima

  let bpm = null; let compasso = null; let nomes = [];
  let maxTempo = 0; let temPercussao = false; let canais = new Set();

  for (const f of faixas(buf)) {
    percorrerFaixa(buf, f.inicio, f.fim, (e) => {
      if (e.tempo > maxTempo) maxTempo = e.tempo;
      if (e.meta === 0x51 && bpm === null && e.tamanhoDados === 3) {
        const us = (buf[e.posDados] << 16) | (buf[e.posDados + 1] << 8) | buf[e.posDados + 2];
        bpm = us ? Math.round(60000000 / us) : null;
      }
      if (e.meta === 0x58 && !compasso && e.tamanhoDados >= 2) {
        compasso = `${buf[e.posDados]}/${Math.pow(2, buf[e.posDados + 1])}`;
      }
      if (e.meta === 0x03 && e.tamanhoDados) {
        nomes.push(buf.slice(e.posDados, e.posDados + e.tamanhoDados).toString('utf8'));
      }
      if (e.canal !== undefined) {
        canais.add(e.canal);
        if (e.canal === CANAL_PERCUSSAO) temPercussao = true;
      }
    });
  }
  return {
    formato, faixas: nFaixas, divisao, ticks_por_semininima: porBatida,
    bpm, compasso, nomes_de_faixa: nomes,
    canais: [...canais].sort((a, b) => a - b),
    tem_percussao: temPercussao,
    duracao_ticks: maxTempo,
    duracao_s: (porBatida && bpm) ? Math.round((maxTempo / porBatida) * (60 / bpm)) : null,
  };
}

/** Notas para tocar/analisar. Percussão sai marcada, não escondida. */
function notas(buf, { incluirPercussao = true } = {}) {
  if (!ehMidi(buf)) throw new Error('Isto não parece um arquivo MIDI.');
  const eventos = [];
  const abertas = new Map();
  for (const [iF, f] of faixas(buf).entries()) {
    percorrerFaixa(buf, f.inicio, f.fim, (e) => {
      if (e.alto !== 0x90 && e.alto !== 0x80) return;
      const nota = buf[e.posDados];
      const vel = buf[e.posDados + 1];
      const chave = `${iF}:${e.canal}:${nota}`;
      // Note-on com velocidade 0 é note-off. Arquivo real usa muito, e
      // tratar como ataque criaria notas fantasma de duração zero.
      if (e.alto === 0x90 && vel > 0) abertas.set(chave, { inicio: e.tempo, vel });
      else {
        const a = abertas.get(chave);
        if (!a) return;
        abertas.delete(chave);
        if (!incluirPercussao && e.canal === CANAL_PERCUSSAO) return;
        eventos.push({ faixa: iF, canal: e.canal, midi: nota, velocidade: a.vel,
          inicio_ticks: a.inicio, duracao_ticks: e.tempo - a.inicio,
          percussao: e.canal === CANAL_PERCUSSAO });
      }
    });
  }
  return eventos.sort((a, b) => a.inicio_ticks - b.inicio_ticks || a.midi - b.midi);
}

// ---------------------------------------------------------------------
// Transposição
// ---------------------------------------------------------------------
/**
 * Transpõe em `semitons`. Devolve um Buffer NOVO.
 *
 * Não toca no canal 10 (percussão) e recusa quando alguma nota sairia
 * de 0–127. `permitirLimite: true` força, grudando no limite — e quem
 * chama tem de dizer isso ao usuário, porque muda a música.
 */
function transpor(buf, semitons, { permitirLimite = false, transporPercussao = false } = {}) {
  if (!ehMidi(buf)) throw new Error('Isto não parece um arquivo MIDI.');
  const n = Number(semitons) || 0;
  if (!n) return Buffer.from(buf);

  const fora = [];
  const alvos = [];
  for (const f of faixas(buf)) {
    percorrerFaixa(buf, f.inicio, f.fim, (e) => {
      // 0x8n note-off · 0x9n note-on · 0xAn aftertouch por nota: nos três
      // o PRIMEIRO byte de dado é o número da nota.
      if (e.alto !== 0x80 && e.alto !== 0x90 && e.alto !== 0xa0) return;
      if (e.canal === CANAL_PERCUSSAO && !transporPercussao) return;
      const atual = buf[e.posDados];
      const novo = atual + n;
      if (novo < 0 || novo > 127) fora.push({ nota: atual, viraria: novo });
      alvos.push(e.posDados);
    });
  }

  if (fora.length && !permitirLimite) {
    const e = new Error(`Transpor em ${n > 0 ? '+' : ''}${n} semitons jogaria ${fora.length} nota(s) `
      + 'fora da faixa do MIDI (0 a 127). Escolha um intervalo menor, ou aceite que essas notas '
      + 'fiquem no limite — o que muda a música.');
    e.notasForaDaFaixa = fora.length;
    e.podeForcar = true;
    throw e;
  }

  const out = Buffer.from(buf);
  for (const pos of alvos) out[pos] = Math.max(0, Math.min(127, buf[pos] + n));
  return out;
}

module.exports = { ehMidi, resumo, notas, transpor, faixas, percorrerFaixa, CANAL_PERCUSSAO };
