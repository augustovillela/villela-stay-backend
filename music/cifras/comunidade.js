// =====================================================================
// Musique Cifras — COMUNIDADE, QUALIDADE e MODERAÇÃO.
//
// Vale para o que a pessoa PODE VER (dela, da banda ou público). Como o
// público de obra de terceiro está desligado pela política (ADR-0009),
// hoje a comunidade roda sobretudo DENTRO das bandas — e ganha o acervo
// público no dia em que o Augusto ligar a política, sem mudar código.
//
//   · avaliação de precisão e facilidade (1–5), uma por pessoa;
//   · proposta de correção: quem não edita PROPÕE; quem edita aceita
//     (vira revisão, com crédito) ou recusa;
//   · denúncia por trecho → fila do staff; procedente recolhe a cifra;
//   · reputação derivada (nunca digitada): correções aceitas, avaliações
//     recebidas e denúncias procedentes contra;
//   · anti-abuso: teto diário de propostas e denúncias, e texto com
//     links em excesso é recusado.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('../db');
const direitos = require('../direitos');
const acesso = require('./acesso');
const flags = require('./flags');
const D = require('./motor/documento');
const { Cifras, Musicas, notificar, erro } = require('./acervo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const TETO_DIA = { propostas: 15, denuncias: 10 };

function contaHoje(tabela, campo, usuario) {
  return db.prepare(`SELECT COUNT(*) n FROM ${tabela} WHERE ${campo} = ? AND criado_em >= ?`).get(usuario, nowISO().slice(0, 10)).n;
}
function suspeito(t) {
  const links = (String(t).match(/https?:\/\//g) || []).length;
  return links > 2 || /(.)\1{15,}/.test(String(t));
}
function exigirVer(usuario, cifraId) {
  const c = Cifras.porId(cifraId);
  const v = acesso.podeVerCifra(c, usuario);
  if (!v.pode) throw erro(v.motivo, c ? 403 : 404, { bloqueioDeDireitos: true });
  return c;
}

const Comunidade = {
  avaliar(usuario, cifraId, { precisao, facilidade, comentario = '' }) {
    flags.exigir('cifras.comunidade');
    const c = exigirVer(usuario, cifraId);
    const p = Math.round(Number(precisao)), f = Math.round(Number(facilidade));
    if (!(p >= 1 && p <= 5 && f >= 1 && f <= 5)) throw erro('Dê notas de 1 a 5.');
    if (Musicas.porId(c.obra_id).dono === usuario) throw erro('Você não avalia a própria cifra.');
    if (suspeito(comentario)) throw erro('Comentário recusado pelo filtro de spam.');
    db.prepare(`INSERT INTO avaliacoes_cifra (cifra_id, usuario, precisao, facilidade, comentario, criado_em) VALUES (?,?,?,?,?,?)
      ON CONFLICT(cifra_id, usuario) DO UPDATE SET precisao = excluded.precisao, facilidade = excluded.facilidade,
      comentario = excluded.comentario, criado_em = excluded.criado_em`).run(cifraId, usuario, p, f, s(comentario, 1000), nowISO());
    return Comunidade.resumo(cifraId);
  },

  resumo(cifraId) {
    const r = db.prepare('SELECT COUNT(*) n, AVG(precisao) p, AVG(facilidade) f FROM avaliacoes_cifra WHERE cifra_id = ?').get(cifraId);
    return { n: r.n, precisao: r.n ? Math.round(r.p * 10) / 10 : null, facilidade: r.n ? Math.round(r.f * 10) / 10 : null,
      comentarios: db.prepare("SELECT precisao, facilidade, comentario, criado_em FROM avaliacoes_cifra WHERE cifra_id = ? AND comentario <> '' ORDER BY criado_em DESC LIMIT 20").all(cifraId) };
  },

  /** Quem não pode editar PROPÕE. A proposta guarda a revisão-base. */
  propor(usuario, cifraId, { documento, descricao = '' }) {
    flags.exigir('cifras.comunidade');
    const c = exigirVer(usuario, cifraId);
    if (acesso.podeEditarCifra(c, usuario)) throw erro('Você pode editar esta cifra direto: não precisa propor.');
    if (contaHoje('propostas_correcao', 'autor', usuario) >= TETO_DIA.propostas) throw erro('Limite diário de propostas atingido.', 429);
    const doc = typeof documento === 'string' ? JSON.parse(documento) : documento;
    const v = D.validar(doc);
    if (!v.ok) throw erro('Documento inválido: ' + v.erros[0], 422);
    const dif = D.diff(JSON.parse(c.documento), doc, { soMudancas: true });
    if (!dif.operacoes.length && !Object.keys(dif.meta).length) throw erro('A proposta não muda nada.');
    if (suspeito(descricao)) throw erro('Descrição recusada pelo filtro de spam.');
    const id = novoId();
    db.prepare(`INSERT INTO propostas_correcao (id, cifra_id, autor, base_revisao, documento, descricao, status, criado_em) VALUES (?,?,?,?,?,?,'aberta',?)`)
      .run(id, cifraId, usuario, c.revisao_atual, JSON.stringify(doc), s(descricao, 1000), nowISO());
    notificar(Musicas.porId(c.obra_id).dono, 'proposta', 'Nova proposta de correção numa cifra sua', '/music/app#cifra=' + cifraId);
    return { id, resumo: dif.resumo };
  },

  propostas(usuario, cifraId) {
    const c = exigirVer(usuario, cifraId);
    const editor = acesso.podeEditarCifra(c, usuario);
    return db.prepare('SELECT * FROM propostas_correcao WHERE cifra_id = ? ORDER BY criado_em DESC').all(cifraId)
      .filter((p) => editor || p.autor === usuario)
      .map((p) => ({ id: p.id, autor: p.autor, base_revisao: p.base_revisao, descricao: p.descricao, status: p.status, criado_em: p.criado_em,
        revisado_em: p.revisado_em, diff: D.diff(JSON.parse(c.documento), JSON.parse(p.documento), { soMudancas: true }) }));
  },

  /** Aceitar vira REVISÃO (tipo "correcao"), com o autor da proposta na descrição. */
  decidir(usuario, propostaId, aceitar) {
    const p = db.prepare('SELECT * FROM propostas_correcao WHERE id = ?').get(propostaId);
    if (!p || p.status !== 'aberta') throw erro('Proposta não encontrada ou já decidida.', 404);
    const c = Cifras.porId(p.cifra_id);
    if (!acesso.podeEditarCifra(c, usuario)) throw erro('Só quem edita a cifra decide a proposta.', 403);
    if (aceitar) {
      Cifras.salvar(usuario, c.id, { documento: JSON.parse(p.documento), versao: c.versao, tipo: 'correcao',
        descricao: 'Correção proposta por ' + p.autor + (p.base_revisao !== c.revisao_atual ? ' (feita sobre a revisão ' + p.base_revisao + ')' : '') + (p.descricao ? ': ' + p.descricao : '') });
      if (c.status === 'importada') db.prepare("UPDATE cifras SET status = 'comunitaria' WHERE id = ?").run(c.id);
    }
    db.prepare('UPDATE propostas_correcao SET status = ?, revisado_por = ?, revisado_em = ? WHERE id = ?').run(aceitar ? 'aceita' : 'recusada', usuario, nowISO(), propostaId);
    notificar(p.autor, 'proposta', aceitar ? 'Sua correção foi aceita' : 'Sua correção foi recusada', '/music/app#cifra=' + c.id);
    return true;
  },

  denunciar(usuario, { alvo_tipo = 'cifra', alvo_id, motivo, trecho = '' }) {
    if (!['cifra', 'comentario', 'musica'].includes(alvo_tipo)) throw erro('Tipo inválido.');
    if (!s(motivo)) throw erro('Diga o motivo da denúncia.');
    if (contaHoje('denuncias_cifras', 'autor', usuario) >= TETO_DIA.denuncias) throw erro('Limite diário de denúncias atingido.', 429);
    if (alvo_tipo === 'cifra') exigirVer(usuario, alvo_id);
    const id = novoId();
    db.prepare(`INSERT INTO denuncias_cifras (id, alvo_tipo, alvo_id, autor, motivo, trecho, status, criado_em) VALUES (?,?,?,?,?,?,'aberta',?)`)
      .run(id, alvo_tipo, alvo_id, usuario, s(motivo, 500), s(trecho, 500), nowISO());
    return { id };
  },

  /** Reputação: DERIVADA dos fatos, nunca digitada. */
  reputacao(usuario) {
    const aceitas = db.prepare("SELECT COUNT(*) n FROM propostas_correcao WHERE autor = ? AND status = 'aceita'").get(usuario).n;
    const recusadas = db.prepare("SELECT COUNT(*) n FROM propostas_correcao WHERE autor = ? AND status = 'recusada'").get(usuario).n;
    const aval = db.prepare(`SELECT COUNT(*) n, AVG(a.precisao) p FROM avaliacoes_cifra a JOIN cifras c ON c.id = a.cifra_id
      JOIN obras o ON o.id = c.obra_id WHERE o.dono = ?`).get(usuario);
    const contra = db.prepare(`SELECT COUNT(*) n FROM denuncias_cifras d JOIN cifras c ON c.id = d.alvo_id JOIN obras o ON o.id = c.obra_id
      WHERE d.alvo_tipo = 'cifra' AND d.status = 'procedente' AND o.dono = ?`).get(usuario).n;
    const pontos = aceitas * 10 - recusadas * 1 + Math.round((aval.p || 0) * (aval.n || 0)) - contra * 25;
    return { pontos, correcoes_aceitas: aceitas, correcoes_recusadas: recusadas, avaliacoes_recebidas: aval.n,
      precisao_media: aval.n ? Math.round(aval.p * 10) / 10 : null, denuncias_procedentes: contra,
      nivel: pontos >= 200 ? 'referência' : pontos >= 50 ? 'colaborador' : pontos >= 10 ? 'ativo' : 'iniciante' };
  },

  // ---------------- staff ----------------
  filaModeracao() {
    return {
      denuncias: db.prepare("SELECT * FROM denuncias_cifras WHERE status = 'aberta' ORDER BY criado_em LIMIT 100").all(),
      propostas_antigas: db.prepare("SELECT id, cifra_id, autor, criado_em FROM propostas_correcao WHERE status = 'aberta' AND criado_em < ? ORDER BY criado_em LIMIT 50")
        .all(new Date(Date.now() - 14 * 864e5).toISOString()),
    };
  },

  /** Procedente RECOLHE a cifra (exclusão suave) e fica na auditoria. */
  resolverDenuncia(staff, id, procedente, motivo = '') {
    const d = db.prepare('SELECT * FROM denuncias_cifras WHERE id = ?').get(id);
    if (!d || d.status !== 'aberta') throw erro('Denúncia não encontrada ou já resolvida.', 404);
    if (procedente && d.alvo_tipo === 'cifra') db.prepare("UPDATE cifras SET removido_em = ? WHERE id = ? AND removido_em = ''").run(nowISO(), d.alvo_id);
    if (procedente && d.alvo_tipo === 'comentario') db.prepare("UPDATE comentarios SET removido_em = ? WHERE id = ?").run(nowISO(), d.alvo_id);
    db.prepare('UPDATE denuncias_cifras SET status = ?, resolvido_por = ?, resolvido_em = ? WHERE id = ?').run(procedente ? 'procedente' : 'improcedente', staff, nowISO(), id);
    direitos.registrar({ ator: 'staff:' + staff, acao: 'moderacao.denuncia', alvo: d.alvo_id, motivo, detalhe: { procedente: !!procedente, tipo: d.alvo_tipo } });
    return true;
  },

  /** Reversão pela moderação: restaura uma revisão anterior como nova revisão. */
  reverterStaff(staff, cifraId, numero, motivo = '') {
    const c = Cifras.porId(cifraId);
    if (!c) throw erro('Cifra não encontrada.', 404);
    const r = db.prepare('SELECT * FROM cifra_revisoes WHERE cifra_id = ? AND numero = ?').get(cifraId, Number(numero));
    if (!r) throw erro('Revisão não encontrada.', 404);
    const dono = Musicas.porId(c.obra_id).dono;
    Cifras.salvar(dono, cifraId, { documento: JSON.parse(r.documento), versao: c.versao, tipo: 'restauracao', descricao: 'Revertida pela moderação para a revisão ' + numero });
    direitos.registrar({ ator: 'staff:' + staff, acao: 'moderacao.reversao', alvo: cifraId, motivo, detalhe: { para: numero } });
    return true;
  },
};

module.exports = { Comunidade };
