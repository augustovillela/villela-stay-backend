'use strict';

const { db, nowISO } = require('../db');

const INSTRUMENTOS = new Set(['violao', 'guitarra', 'baixo', 'piano', 'bateria', 'cavaquinho', 'ukulele', 'bandolim']);
const METAS = new Set(['conclusao', 'precisao', 'sequencia']);

function texto(valor, nome, max = 120) {
  const out = String(valor == null ? '' : valor).trim();
  if (!out || out.length > max || /[\x00-\x1f\x7f]/.test(out)) throw new Error(`${nome} inválido.`);
  return out;
}

function normalizar(input = {}) {
  if (!INSTRUMENTOS.has(input.instrumento)) throw new Error('Instrumento de campanha inválido.');
  const estudo_id = texto(input.estudo_id, 'Estudo', 120);
  const meta_tipo = String(input.meta_tipo || 'conclusao');
  if (!METAS.has(meta_tipo)) throw new Error('Tipo de meta inválido.');
  const meta_valor = Number(input.meta_valor == null ? 1 : input.meta_valor);
  if (!Number.isFinite(meta_valor) || meta_valor < 0 || meta_valor > 10000) throw new Error('Valor da meta inválido.');
  return { instrumento: input.instrumento, estudo_id, meta_tipo, meta_valor };
}

function porTarefa(tarefa_id) {
  return db.prepare('SELECT tarefa_id, instrumento, estudo_id, meta_tipo, meta_valor, criado_em FROM tocar_tarefas WHERE tarefa_id = ?').get(tarefa_id) || null;
}

function vincular(tarefa_id, input) {
  const id = texto(tarefa_id, 'Tarefa', 120);
  const valor = normalizar(input);
  const criado_em = nowISO();
  db.prepare(`INSERT INTO tocar_tarefas (tarefa_id, instrumento, estudo_id, meta_tipo, meta_valor, criado_em)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(tarefa_id) DO UPDATE SET instrumento=excluded.instrumento, estudo_id=excluded.estudo_id,
      meta_tipo=excluded.meta_tipo, meta_valor=excluded.meta_valor`).run(id, valor.instrumento, valor.estudo_id, valor.meta_tipo, valor.meta_valor, criado_em);
  return porTarefa(id);
}

function remover(tarefa_id) {
  return db.prepare('DELETE FROM tocar_tarefas WHERE tarefa_id = ?').run(String(tarefa_id || '')).changes;
}

function sessoesDaTarefa(tarefa_id) {
  return db.prepare("SELECT id, usuario, resumo, criado_em FROM tocar_sessoes WHERE json_extract(resumo, '$.tarefaId') = ? ORDER BY criado_em DESC")
    .all(tarefa_id).map((x) => {
      let resumo = {}; try { resumo = JSON.parse(x.resumo || '{}'); } catch (_) {}
      return { id: x.id, usuario: x.usuario, criado_em: x.criado_em, ...resumo };
    });
}

function sessaoDaTarefa(usuario, tarefa_id, sessao_id) {
  const x = db.prepare('SELECT id, usuario, resumo, criado_em FROM tocar_sessoes WHERE id = ? AND usuario = ?').get(sessao_id, usuario);
  if (!x) return null;
  let resumo = {}; try { resumo = JSON.parse(x.resumo || '{}'); } catch (_) {}
  return resumo.tarefaId === tarefa_id ? { id: x.id, usuario: x.usuario, criado_em: x.criado_em, ...resumo } : null;
}

module.exports = { normalizar, porTarefa, vincular, remover, sessoesDaTarefa, sessaoDaTarefa };
