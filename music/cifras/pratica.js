// =====================================================================
// Musique Cifras — PRÁTICA de uma música: sessão, histórico e progresso.
// O cliente mede (tempo tocado, BPM, trecho em loop, nível de ocultação
// para memorizar); aqui só se guarda e se resume. Progresso é DERIVADO
// das sessões — não há "nota" de prática digitada por ninguém.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('../db');
const acesso = require('./acesso');
const { Cifras, erro } = require('./acervo');

const Pratica = {
  registrar(usuario, cifraId, d = {}) {
    const c = Cifras.porId(cifraId);
    if (!acesso.podeVerCifra(c, usuario).pode) throw erro('Sem acesso a esta cifra.', 403);
    const dur = Math.max(0, Math.min(4 * 3600, Math.round(Number(d.duracao_s) || 0)));
    if (dur < 5) throw erro('Sessão curta demais para registrar.');
    const loop = d.loop && typeof d.loop === 'object'
      ? { a_s: Math.max(0, Number(d.loop.a_s) || 0), b_s: Math.max(0, Number(d.loop.b_s) || 0), secao_id: String(d.loop.secao_id || '').slice(0, 20) } : {};
    db.prepare(`INSERT INTO pratica_cifras (id, usuario, cifra_id, duracao_s, bpm, velocidade, loop, ocultacao, notas, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(novoId(), usuario, cifraId, dur, Math.max(0, Math.min(400, Math.round(Number(d.bpm) || 0))),
      Math.max(0.25, Math.min(2, Number(d.velocidade) || 1)), JSON.stringify(loop), Math.max(0, Math.min(3, Math.round(Number(d.ocultacao) || 0))),
      String(d.notas || '').slice(0, 2000), nowISO());
    return Pratica.progresso(usuario, cifraId);
  },

  progresso(usuario, cifraId) {
    const sess = db.prepare('SELECT * FROM pratica_cifras WHERE usuario = ? AND cifra_id = ? ORDER BY criado_em DESC LIMIT 200').all(usuario, cifraId);
    const total = sess.reduce((a, x) => a + x.duracao_s, 0);
    const dias = new Set(sess.map((x) => x.criado_em.slice(0, 10))).size;
    const maiorVel = sess.reduce((a, x) => Math.max(a, x.velocidade), 0);
    const maiorOcult = sess.reduce((a, x) => Math.max(a, x.ocultacao), 0);
    return {
      sessoes: sess.length, minutos: Math.round(total / 60), dias_praticados: dias,
      maior_velocidade: maiorVel || null, memorizacao: maiorOcult,
      ultimas: sess.slice(0, 10).map((x) => ({ duracao_s: x.duracao_s, bpm: x.bpm, velocidade: x.velocidade, ocultacao: x.ocultacao,
        loop: j.parse(x.loop, {}), notas: x.notas, criado_em: x.criado_em })),
      // Etapa sugerida, pelos fatos: primeiro tocar inteira em velocidade
      // reduzida, depois na velocidade real, depois memorizar.
      etapa: maiorOcult >= 2 ? 'memorizando' : maiorVel >= 1 ? 'na velocidade real' : sess.length ? 'aprendendo devagar' : 'ainda não praticada',
    };
  },
};

module.exports = { Pratica };
