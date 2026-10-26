'use strict';

const { db } = require('./db');

const EVENTOS = new Set([
  'js_error', 'audio_load_error', 'audio_decode_error', 'microphone_denied',
  'browser_unsupported', 'upload_error', 'worker_error', 'route_error',
]);

function texto(v, max = 160) { return String(v == null ? '' : v).slice(0, max); }

function registrar(d = {}) {
  const evento = texto(d.evento, 60);
  if (!EVENTOS.has(evento)) {
    const e = new Error('Evento de telemetria não permitido.'); e.status = 422; throw e;
  }
  const agora = new Date().toISOString();
  db.prepare(`INSERT INTO music_telemetria
    (evento, rota, navegador, sistema, versao_app, duracao_ms, codigo, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(evento, texto(d.rota, 180), texto(d.navegador, 60), texto(d.sistema, 60),
      texto(d.versao_app, 40), Math.max(0, Math.min(600000, Number(d.duracao_ms) || 0)), texto(d.codigo, 80), agora);
  db.prepare("DELETE FROM music_telemetria WHERE criado_em < datetime('now', '-30 days')").run();
  return { ok: true };
}

function resumo(dias = 7) {
  const n = Math.max(1, Math.min(30, Number(dias) || 7));
  const desde = new Date(Date.now() - n * 86400000).toISOString();
  const total = (db.prepare('SELECT COUNT(*) AS n FROM music_telemetria WHERE criado_em >= ?').get(desde) || {}).n || 0;
  const agrupar = (campo) => db.prepare(`SELECT ${campo} AS chave, COUNT(*) AS n FROM music_telemetria WHERE criado_em >= ? GROUP BY ${campo} ORDER BY n DESC LIMIT 20`).all(desde);
  const eventos = agrupar('evento');
  const porDia = db.prepare("SELECT substr(criado_em, 1, 10) AS dia, COUNT(*) AS n FROM music_telemetria WHERE criado_em >= ? GROUP BY dia ORDER BY dia").all(desde);
  const alertas = eventos.filter((x) => x.n >= 10).map((x) => ({
    severidade: x.n >= 25 ? 'alta' : 'media', tipo: x.chave,
    mensagem: `O evento ${x.chave} atingiu ${x.n} ocorrências nos últimos ${n} dias.`,
  }));
  // Último recebido em toda a retenção (não só no período): é o sinal de que o
  // app ainda está reportando — período vazio com último evento de ontem é
  // "sem falhas", sem nenhum em 30 dias pode ser o próprio envio quebrado.
  const ultimo = (db.prepare('SELECT MAX(criado_em) AS u FROM music_telemetria').get() || {}).u || null;
  return { dias: n, total, demonstracao: false, ultimo_evento: ultimo, por_dia: porDia, eventos, rotas: agrupar('rota'), navegadores: agrupar('navegador'), codigos: agrupar('codigo'), alertas };
}

function demonstracao() {
  return {
    demonstracao: true, dias: 7, total: 47, ultimo_evento: '2026-10-26T14:32:00.000Z',
    por_dia: [{ dia: '2026-10-20', n: 4 }, { dia: '2026-10-21', n: 7 }, { dia: '2026-10-22', n: 5 }, { dia: '2026-10-23', n: 9 }, { dia: '2026-10-24', n: 6 }, { dia: '2026-10-25', n: 8 }, { dia: '2026-10-26', n: 8 }],
    eventos: [
      { chave: 'audio_decode_error', n: 14 }, { chave: 'js_error', n: 11 },
      { chave: 'microphone_denied', n: 9 }, { chave: 'worker_error', n: 7 },
      { chave: 'route_error', n: 6 },
    ],
    rotas: [
      { chave: '/music/tocar', n: 19 }, { chave: '/music/explorar/laboratorio', n: 16 },
      { chave: '/music/criar/curso-contrabaixo', n: 8 },
    ],
    navegadores: [{ chave: 'chrome', n: 29 }, { chave: 'edge', n: 10 }, { chave: 'firefox', n: 8 }],
    codigos: [{ chave: 'UNSUPPORTED_CODEC', n: 14 }, { chave: 'PERMISSION_DENIED', n: 9 }],
    alertas: [
      { severidade: 'media', tipo: 'audio_decode_error', mensagem: 'Falhas de decodificação acima do limiar de demonstração.' },
      { severidade: 'baixa', tipo: 'microphone_denied', mensagem: 'Recusas de microfone concentradas no fluxo de prática.' },
    ],
  };
}

module.exports = { EVENTOS, registrar, resumo, demonstracao };
