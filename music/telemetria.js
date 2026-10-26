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
  return { dias: n, total, eventos: agrupar('evento'), rotas: agrupar('rota'), navegadores: agrupar('navegador'), codigos: agrupar('codigo') };
}

module.exports = { EVENTOS, registrar, resumo };
