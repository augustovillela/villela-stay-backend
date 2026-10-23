'use strict';
const { db, nowISO, novoId, j, transacao } = require('./db');
const repo = require('./repo');

const n = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
function inteiro(v, nome) { const x = n(v); if (x == null || !Number.isInteger(x) || x < 0 || x > 127) throw new Error(`${nome} deve ser uma nota MIDI entre 0 e 127.`); return x; }
function proporcao(v, nome) { const x = n(v); if (x == null || x < 0 || x > 1) throw new Error(`${nome} deve estar entre 0 e 1.`); return x; }
function validar(d = {}) {
  const a = {
    nota_min_midi: inteiro(d.nota_min_midi, 'Nota grave'), nota_max_midi: inteiro(d.nota_max_midi, 'Nota aguda'),
    regiao_min_midi: inteiro(d.regiao_min_midi, 'Região grave'), regiao_max_midi: inteiro(d.regiao_max_midi, 'Região aguda'),
    estabilidade: proporcao(d.estabilidade, 'Estabilidade'), confianca: proporcao(d.confianca, 'Confiança'),
    amostras: Math.max(1, Math.min(10000, Math.round(n(d.amostras) || 1))), cifra_id: String(d.cifra_id || '').slice(0, 120),
  };
  if (a.nota_min_midi > a.nota_max_midi || a.regiao_min_midi > a.regiao_max_midi || a.regiao_min_midi < a.nota_min_midi || a.regiao_max_midi > a.nota_max_midi) throw new Error('A extensão vocal precisa estar em ordem e conter a região estável.');
  return a;
}
function perfil(u) {
  const x = repo.Usuarios.porId(u);
  return x ? j.parse(x.extensao_vocal, null) : null;
}
function mesclar(anterior, a) {
  if (!anterior || !Number.isFinite(Number(anterior.amostras))) return {
    grave_midi: a.nota_min_midi, agudo_midi: a.nota_max_midi, regiao_min_midi: a.regiao_min_midi, regiao_max_midi: a.regiao_max_midi,
    estabilidade_media: a.estabilidade, confianca_media: a.confianca, amostras: a.amostras, atualizado_em: nowISO(),
  };
  const peso = Math.max(1, Number(anterior.amostras) || 1), total = peso + a.amostras;
  // Extremos só se ampliam com confiança razoável; isso evita que ruído de uma tentativa destrua o perfil.
  const confiavel = a.confianca >= 0.45 && a.estabilidade >= 0.35;
  return {
    grave_midi: confiavel ? Math.min(anterior.grave_midi, a.nota_min_midi) : anterior.grave_midi,
    agudo_midi: confiavel ? Math.max(anterior.agudo_midi, a.nota_max_midi) : anterior.agudo_midi,
    regiao_min_midi: Math.round((anterior.regiao_min_midi * peso + a.regiao_min_midi * a.amostras) / total),
    regiao_max_midi: Math.round((anterior.regiao_max_midi * peso + a.regiao_max_midi * a.amostras) / total),
    estabilidade_media: Number(((anterior.estabilidade_media * peso + a.estabilidade * a.amostras) / total).toFixed(4)),
    confianca_media: Number(((anterior.confianca_media * peso + a.confianca * a.amostras) / total).toFixed(4)),
    amostras: total, atualizado_em: nowISO(),
  };
}
function registrar(usuario, dados) {
  const a = validar(dados); const anterior = perfil(usuario); const p = mesclar(anterior, a);
  transacao(() => {
    repo.Usuarios.editar(usuario, { extensao_vocal: p });
    db.prepare(`INSERT INTO avaliacoes_vocais (id, usuario, cifra_id, nota_min_midi, nota_max_midi, regiao_min_midi, regiao_max_midi, estabilidade, confianca, amostras, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(novoId(), usuario, a.cifra_id, a.nota_min_midi, a.nota_max_midi, a.regiao_min_midi, a.regiao_max_midi, a.estabilidade, a.confianca, a.amostras, nowISO());
  });
  return p;
}
function historico(usuario, limite = 20) { return db.prepare('SELECT * FROM avaliacoes_vocais WHERE usuario = ? ORDER BY criado_em DESC LIMIT ?').all(usuario, Math.max(1, Math.min(100, Number(limite) || 20))); }
module.exports = { perfil, registrar, historico, validar, mesclar };
