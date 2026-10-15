// Catálogo de charts: conta e direitos da obra existentes, sem papel global novo.
'use strict';
const crypto = require('node:crypto');
const { db, transacao, novoId, nowISO } = require('../db');
const direitos = require('../direitos');
const storage = require('../storage');
const Formato = require('./formato-catalogo');

function erro(mensagem, status = 400, extra = {}) {
  return Object.assign(new Error(mensagem), { status }, extra);
}
function objeto(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function fechado(v, campos) {
  if (!objeto(v) || Object.keys(v).some((k) => !campos.includes(k))) throw erro('Campos não permitidos.');
}
function id(v) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(v)) throw erro('Identificador inválido.');
  return v;
}
function revisao(v) {
  if (!Number.isSafeInteger(v) || v < 1) throw erro('Revisão inválida.');
  return v;
}
function paginacao(opcoes = {}) {
  if (!objeto(opcoes)) throw erro('Filtros inválidos.');
  function inteiro(v, padrao, min, max) {
    if (v === undefined) return padrao;
    if (typeof v !== 'number' && (typeof v !== 'string' || !/^\d+$/.test(v))) throw erro('Paginação inválida.');
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw erro('Paginação inválida.');
    return n;
  }
  const q = opcoes.q === undefined ? '' : opcoes.q;
  if (typeof q !== 'string' || q.length > 120 || /[\x00-\x1f\x7f]/.test(q)) throw erro('Busca inválida.');
  const out = { limit: inteiro(opcoes.limit, 20, 1, 50), offset: inteiro(opcoes.offset, 0, 0, Number.MAX_SAFE_INTEGER), q: q.trim() };
  for (const [campo, lista] of [['instrument', Formato.INSTRUMENTOS], ['level', Formato.NIVEIS], ['technique', Formato.TECNICAS]]) {
    const v = opcoes[campo];
    if (v !== undefined && v !== '' && !lista.includes(v)) throw erro('Filtro inválido: ' + campo + '.');
    out[campo] = v || '';
  }
  return out;
}
function obraDe(obraId, usuario, dono = false) {
  const o = db.prepare('SELECT * FROM obras WHERE id = ?').get(id(obraId));
  // podeVer permite ao dono consultar a lixeira; praticar/editar exige obra ativa.
  if (!o || o.removido_em) throw erro('Obra não encontrada.', 404);
  if (dono ? o.dono !== usuario : !direitos.podeVer(o, usuario).pode) throw erro('Obra não encontrada.', 404);
  return o;
}
function obraResumo(o) {
  return { id: o.id, titulo: o.titulo, artista: o.artista || '' };
}
function obraGestao(o) {
  return { ...obraResumo(o), visibilidade: o.visibilidade, titularidade: o.titularidade };
}
function obterObra(usuario, obraId) { return obraGestao(obraDe(obraId, usuario, true)); }
function arranjoDe(usuario, arranjoId, dono = false) {
  const a = db.prepare('SELECT * FROM tocar_arranjos WHERE id = ?').get(id(arranjoId));
  if (!a) throw erro('Arranjo não encontrado.', 404);
  return { a, o: obraDe(a.obra_id, usuario, dono) };
}
function conferirRevisao(a, n) {
  revisao(n);
  if (a.revisao !== n) throw erro('O arranjo mudou. Recarregue antes de salvar.', 409, { revision: a.revisao });
}
function midiaDaObra(o, mediaId) {
  const m = db.prepare(`SELECT m.* FROM midias m
    WHERE m.id = ? AND m.dono = ? AND m.estado = 'pronta'
      AND lower(m.mime) LIKE 'audio/%'
      AND EXISTS (SELECT 1 FROM obra_midias om WHERE om.obra_id = ? AND om.media_id = m.id AND om.url = '')`)
    .get(mediaId, o.dono, o.id);
  if (!m) throw erro('O acompanhamento precisa ser um áudio pronto, seu e anexado a esta obra.', 409);
  return m;
}
function documentoDe(v, o) {
  let d;
  try { d = Formato.validarDocumento(v); }
  catch (e) { throw erro(e.message); }
  if (d.mediaId) midiaDaObra(o, d.mediaId);
  return d;
}
function metadados(d) {
  return { title: d.title, instrument: d.instrument, level: d.level, technique: d.technique,
    objective: d.objective, credits: d.credits, hasAudio: !!d.mediaId };
}
function versaoResumo(v) {
  return { id: v.id, number: v.numero, publishedAt: v.publicado_em, sha256: v.sha256 };
}
function detalheGestao(a, o) {
  const documento = JSON.parse(a.documento);
  const versions = db.prepare('SELECT id, numero, publicado_em, sha256 FROM tocar_versoes WHERE arranjo_id = ? ORDER BY numero DESC LIMIT 100').all(a.id).map(versaoResumo);
  const versionsTotal = db.prepare('SELECT count(*) n FROM tocar_versoes WHERE arranjo_id = ?').get(a.id).n;
  return { id: a.id, obra: obraGestao(o), ...metadados(documento), revision: a.revisao,
    publishedVersionId: a.publicada_id, documento, versions, versionsTotal,
    createdAt: a.criado_em, updatedAt: a.atualizado_em };
}
function obterGestao(usuario, arranjoId) {
  const { a, o } = arranjoDe(usuario, arranjoId, true);
  return detalheGestao(a, o);
}
function listar(usuario, opcoes = {}, gestao = false) {
  const p = paginacao(opcoes), vis = direitos.sqlVisiveis(usuario);
  const fonte = gestao ? 'a.documento' : 'v.documento';
  const join = gestao ? '' : 'JOIN tocar_versoes v ON v.id = a.publicada_id AND v.arranjo_id = a.id';
  const where = ["o.removido_em = ''", gestao ? 'o.dono = ?' : vis.sql];
  const params = gestao ? [usuario] : [...vis.params];
  if (p.q) {
    where.push(`(instr(lower(o.titulo), lower(?)) > 0 OR instr(lower(o.artista), lower(?)) > 0 OR instr(lower(json_extract(${fonte}, '$.title')), lower(?)) > 0)`);
    params.push(p.q, p.q, p.q);
  }
  for (const campo of ['instrument', 'level', 'technique']) {
    if (p[campo]) { where.push(`json_extract(${fonte}, '$.${campo}') = ?`); params.push(p[campo]); }
  }
  const sql = `FROM tocar_arranjos a JOIN obras o ON o.id = a.obra_id ${join} WHERE ${where.join(' AND ')}`;
  const total = db.prepare('SELECT count(*) n ' + sql).get(...params).n;
  const linhas = db.prepare(`SELECT a.id, a.obra_id, a.revisao, a.publicada_id, a.atualizado_em,
    o.titulo, o.artista, ${fonte} documento ${gestao ? '' : ', v.id version_id, v.numero, v.publicado_em'}
    ${sql} ORDER BY a.atualizado_em DESC, a.id LIMIT ? OFFSET ?`).all(...params, p.limit, p.offset);
  const arranjos = linhas.map((l) => ({ id: l.id, obra: { id: l.obra_id, titulo: l.titulo, artista: l.artista || '' },
    ...metadados(JSON.parse(l.documento)), ...(gestao
      ? { revision: l.revisao, publishedVersionId: l.publicada_id, updatedAt: l.atualizado_em }
      : { versionId: l.version_id, versionNumber: l.numero, publishedAt: l.publicado_em }) }));
  return { arranjos, total, limit: p.limit, offset: p.offset };
}
function listarObras(usuario, opcoes = {}) {
  const p = paginacao(opcoes), where = "dono = ? AND removido_em = '' AND (instr(lower(titulo), lower(?)) > 0 OR instr(lower(artista), lower(?)) > 0)";
  const total = db.prepare('SELECT count(*) n FROM obras WHERE ' + where).get(usuario, p.q, p.q).n;
  const obras = db.prepare('SELECT id, titulo, artista, visibilidade, titularidade FROM obras WHERE ' + where + ' ORDER BY atualizado_em DESC, id LIMIT ? OFFSET ?')
    .all(usuario, p.q, p.q, p.limit, p.offset).map((o) => ({ ...o }));
  return { obras, total, limit: p.limit, offset: p.offset };
}
function listarMidias(usuario, obraId, opcoes = {}) {
  const o = obraDe(obraId, usuario, true), p = paginacao(opcoes);
  const sql = `FROM midias m WHERE m.dono = ? AND m.estado = 'pronta' AND lower(m.mime) LIKE 'audio/%'
    AND EXISTS (SELECT 1 FROM obra_midias om WHERE om.obra_id = ? AND om.media_id = m.id AND om.url = '' AND instr(lower(om.titulo), lower(?)) > 0)`;
  const total = db.prepare('SELECT count(*) n ' + sql).get(o.dono, o.id, p.q).n;
  const midias = db.prepare(`SELECT m.id, m.mime,
    (SELECT om.titulo FROM obra_midias om WHERE om.obra_id = ? AND om.media_id = m.id AND om.url = '' ORDER BY om.criado_em, om.id LIMIT 1) titulo
    ${sql} ORDER BY m.criado_em DESC, m.id LIMIT ? OFFSET ?`).all(o.id, o.dono, o.id, p.q, p.limit, p.offset).map((m) => ({ ...m }));
  return { midias, total, limit: p.limit, offset: p.offset };
}
function criar(usuario, entrada) {
  fechado(entrada, ['obraId', 'documento']);
  return transacao(() => {
    const o = obraDe(entrada.obraId, usuario, true), d = documentoDe(entrada.documento, o);
    const novo = novoId(), agora = nowISO();
    db.prepare('INSERT INTO tocar_arranjos (id, obra_id, documento, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?)')
      .run(novo, o.id, JSON.stringify(d), agora, agora);
    direitos.registrar({ ator: usuario, acao: 'tocar.arranjo.criado', alvo: novo, detalhe: { obraId: o.id } });
    return obterGestao(usuario, novo);
  });
}
function salvar(usuario, arranjoId, entrada) {
  fechado(entrada, ['revision', 'documento']);
  return transacao(() => {
    const { a, o } = arranjoDe(usuario, arranjoId, true); conferirRevisao(a, entrada.revision);
    const d = documentoDe(entrada.documento, o);
    db.prepare('UPDATE tocar_arranjos SET documento = ?, revisao = revisao + 1, atualizado_em = ? WHERE id = ?')
      .run(JSON.stringify(d), nowISO(), a.id);
    direitos.registrar({ ator: usuario, acao: 'tocar.rascunho.salvo', alvo: a.id, detalhe: { revision: a.revisao + 1 } });
    return obterGestao(usuario, a.id);
  });
}
function publicar(usuario, arranjoId, entrada) {
  fechado(entrada, ['revision']);
  return transacao(() => {
    const { a, o } = arranjoDe(usuario, arranjoId, true); conferirRevisao(a, entrada.revision);
    const texto = JSON.stringify(documentoDe(JSON.parse(a.documento), o));
    const sha256 = crypto.createHash('sha256').update(texto).digest('hex');
    const numero = db.prepare('SELECT COALESCE(max(numero), 0) + 1 n FROM tocar_versoes WHERE arranjo_id = ?').get(a.id).n;
    const novo = novoId(), agora = nowISO();
    db.prepare('INSERT INTO tocar_versoes (id, arranjo_id, numero, documento, sha256, publicado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .run(novo, a.id, numero, texto, sha256, agora);
    db.prepare('UPDATE tocar_arranjos SET publicada_id = ?, revisao = revisao + 1, atualizado_em = ? WHERE id = ?').run(novo, agora, a.id);
    direitos.registrar({ ator: usuario, acao: 'tocar.versao.publicada', alvo: a.id, detalhe: { versionId: novo, number: numero, sha256 } });
    return obterGestao(usuario, a.id);
  });
}
function retirar(usuario, arranjoId, entrada) {
  fechado(entrada, ['revision']);
  return transacao(() => {
    const { a } = arranjoDe(usuario, arranjoId, true); conferirRevisao(a, entrada.revision);
    db.prepare("UPDATE tocar_arranjos SET publicada_id = '', revisao = revisao + 1, atualizado_em = ? WHERE id = ?").run(nowISO(), a.id);
    direitos.registrar({ ator: usuario, acao: 'tocar.arranjo.retirado', alvo: a.id, detalhe: { versionId: a.publicada_id } });
    return obterGestao(usuario, a.id);
  });
}
function versaoDe(usuario, arranjoId, versionId, permitirRetirada = false) {
  const { a, o } = arranjoDe(usuario, arranjoId);
  if (!permitirRetirada && !a.publicada_id) throw erro('Arranjo indisponível.', 404);
  const v = db.prepare('SELECT * FROM tocar_versoes WHERE id = ? AND arranjo_id = ?').get(id(versionId || a.publicada_id), a.id);
  if (!v) throw erro('Versão não encontrada.', 404);
  return { a, o, v, documento: JSON.parse(v.documento) };
}
function obter(usuario, arranjoId, versionId) {
  const { a, o, v, documento } = versaoDe(usuario, arranjoId, versionId);
  return { arranjo: { id: a.id, obra: obraResumo(o), versionId: v.id, versionNumber: v.numero, publishedAt: v.publicado_em, sha256: v.sha256 }, documento };
}
function audioAssinado(o, documento) {
  if (!documento.mediaId) throw erro('Esta versão não tem acompanhamento.', 404);
  const m = midiaDaObra(o, documento.mediaId);
  if (!storage.ativo()) throw erro('Acompanhamento indisponível no momento.', 503);
  return { url: storage.urlDeLeitura(m.chave, 600), mime: m.mime, expiresIn: 600 };
}
function audio(usuario, arranjoId, versionId) {
  const { o, documento } = versaoDe(usuario, arranjoId, versionId);
  return audioAssinado(o, documento);
}
function audioGestao(usuario, arranjoId, revision) {
  const { a, o } = arranjoDe(usuario, arranjoId, true); conferirRevisao(a, revision);
  return audioAssinado(o, JSON.parse(a.documento));
}
function resolverReferencia(usuario, ref, resumo) {
  fechado(ref, ['arranjoId', 'versionId', 'from', 'to']);
  id(ref.arranjoId); id(ref.versionId);
  const { a, o, v, documento } = versaoDe(usuario, ref.arranjoId, ref.versionId, true);
  const c = documento.chart;
  if (typeof ref.from !== 'number' || !Number.isFinite(ref.from) || typeof ref.to !== 'number' || !Number.isFinite(ref.to)
    || ref.from < 0 || ref.to > c.duration || ref.to <= ref.from) throw erro('Intervalo do arranjo inválido.');
  const total = c.notes.filter((n) => n.time >= ref.from && n.time < ref.to).length;
  if (!total || !resumo || resumo.total !== total || resumo.chartId !== c.id || resumo.title !== c.title) {
    throw erro('O resumo não corresponde à versão e ao trecho praticados.');
  }
  // Prática usa duração musical do trecho; Aprender mede tempo ativo no aparelho.
  if (resumo.mode === 'practice' && (!Number.isFinite(resumo.duration) || Math.abs(resumo.duration - (ref.to - ref.from)) > 0.001)) {
    throw erro('A duração não corresponde ao trecho praticado.');
  }
  return { arranjoId: a.id, versionId: v.id, versionNumber: v.numero, sha256: v.sha256, obraId: o.id, from: ref.from, to: ref.to };
}

// Exporta todo o conteúdo do dono, inclusive obras na lixeira e versões retiradas.
function dadosDe(usuario) {
  const linhas = db.prepare('SELECT a.* FROM tocar_arranjos a JOIN obras o ON o.id = a.obra_id WHERE o.dono = ? ORDER BY a.criado_em, a.id').all(usuario);
  const arranjos = linhas.map((a) => detalheGestao(a, db.prepare('SELECT * FROM obras WHERE id = ?').get(a.obra_id)));
  const versoes = db.prepare('SELECT v.* FROM tocar_versoes v JOIN tocar_arranjos a ON a.id = v.arranjo_id JOIN obras o ON o.id = a.obra_id WHERE o.dono = ? ORDER BY a.id, v.numero').all(usuario)
    .map((v) => ({ ...versaoResumo(v), arranjoId: v.arranjo_id, documento: JSON.parse(v.documento) }));
  return { arranjos, versoes };
}
// Hooks internos: o chamador já autenticou a exclusão da obra/conta.
function excluirDaObra(obraId) {
  return transacao(() => {
    const versoes = db.prepare('DELETE FROM tocar_versoes WHERE arranjo_id IN (SELECT id FROM tocar_arranjos WHERE obra_id = ?)').run(obraId).changes;
    const arranjos = db.prepare('DELETE FROM tocar_arranjos WHERE obra_id = ?').run(obraId).changes;
    return { arranjos, versoes };
  });
}
function excluirDe(usuario) {
  return transacao(() => {
    const versoes = db.prepare('DELETE FROM tocar_versoes WHERE arranjo_id IN (SELECT a.id FROM tocar_arranjos a JOIN obras o ON o.id = a.obra_id WHERE o.dono = ?)').run(usuario).changes;
    const arranjos = db.prepare('DELETE FROM tocar_arranjos WHERE obra_id IN (SELECT id FROM obras WHERE dono = ?)').run(usuario).changes;
    return { arranjos, versoes };
  });
}

module.exports = { listar, listarObras, obterObra, listarMidias, criar, salvar, publicar, retirar, obter, obterGestao,
  audio, audioGestao, resolverReferencia, dadosDe, excluirDe, excluirDaObra };
