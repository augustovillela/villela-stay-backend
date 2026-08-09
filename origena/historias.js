// =====================================================================
// ORIGENA — histórias (§67).
//
// VERSIONADA, como a contribuição da Fase 3 e pela mesma razão: editar
// não apaga. A V1 continua consultável para sempre. Quem escreveu "meu
// avô era ferroviário" e depois corrigiu para "trabalhou na estrada de
// ferro" não apagou a primeira frase — ela é o que a família dizia em
// 2026, e isso é informação histórica.
//
// `contada_por_person_id` (quem contou, talvez morto há 40 anos) é
// DIFERENTE de `autor_user_id` (quem digitou). Confundir os dois apaga a
// autoria real — é o mesmo erro do USER ≠ PERSON (§13).
// =====================================================================
'use strict';
const { erro } = require('./erros');
const datas = require('./datas');
const busca = require('./busca');
const { auditar } = require('./repo');

const s = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);

/** Reindexa a história inteira: título + corpo corrente + menções. */
async function indexar(t, familyId, storyId) {
  const h = await t.uma(
    `SELECT s.*, v.corpo FROM stories s
       LEFT JOIN story_versions v ON v.story_id = s.id AND v.versao = s.versao_atual
      WHERE s.id = $1`, [storyId]);
  if (!h || h.deleted_at) return null;
  const mencoes = await t.todas(
    `SELECT person_id FROM story_mentions WHERE story_id = $1 AND person_id IS NOT NULL`, [storyId]);
  const pessoas = mencoes.map((m) => m.person_id);
  if (h.contada_por_person_id) pessoas.push(h.contada_por_person_id);
  return busca.indexar(t, {
    familyId, refTipo: 'story', refId: storyId,
    titulo: h.titulo, corpo: h.corpo || '',
    pessoas: [...new Set(pessoas)],
    autorId: h.autor_user_id, dataIni: h.ocorrido_ini, dataFim: h.ocorrido_fim,
    localTexto: h.local_texto, privacidade: h.privacidade, criadoPor: h.created_by,
  });
}

async function criar(t, { familyId, userId, dados }) {
  const titulo = s(dados.titulo, 200);
  const corpo = s(dados.corpo, 100000);
  if (titulo.length < 2) throw erro('erro.historia_sem_titulo', 400);
  if (corpo.length < 2) throw erro('erro.historia_vazia', 400);

  let d = { valor: null, precisao: 'ANO', ini: null, fim: null };
  if (dados.ocorrido) {
    d = datas.interpretar(dados.ocorrido);
    if (d.erro) throw erro(d.erro, 400);
  }

  const h = await t.uma(
    `INSERT INTO stories (family_id, titulo, contada_por_person_id, autor_user_id,
       ocorrido_valor, ocorrido_precisao, ocorrido_ini, ocorrido_fim, local_texto,
       privacidade, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [familyId, titulo, dados.contada_por || null, userId,
      d.valor, d.precisao, d.ini, d.fim, s(dados.local, 200),
      ['PUBLIC', 'FAMILY', 'GROUP', 'PRIVATE'].includes(dados.privacidade) ? dados.privacidade : 'FAMILY',
      userId]);

  await t.q(
    `INSERT INTO story_versions (family_id, story_id, versao, titulo, corpo, editado_por)
     VALUES ($1,$2,1,$3,$4,$5)`, [familyId, h.id, titulo, corpo, userId]);

  await mencionar(t, { familyId, storyId: h.id, pessoas: dados.pessoas || [], midias: dados.midias || [] });
  await indexar(t, familyId, h.id);
  await auditar({ familyId, atorUserId: userId, acao: 'historia.criada',
    alvoTipo: 'story', alvoId: h.id, depois: { titulo } }, t);
  return h;
}

/**
 * Editar cria a versão SEGUINTE. A anterior fica — inclusive o título,
 * porque mudar o título de uma história é mudar como a família a chama, e
 * isso também é histórico.
 */
async function editar(t, { familyId, userId, storyId, dados }) {
  const h = await t.uma(`SELECT * FROM stories WHERE id = $1 AND deleted_at IS NULL`, [storyId]);
  if (!h) throw erro('erro.historia_nao_encontrada', 404);
  const corpo = s(dados.corpo, 100000);
  if (corpo.length < 2) throw erro('erro.historia_vazia', 400);
  const titulo = s(dados.titulo, 200) || h.titulo;
  const proxima = h.versao_atual + 1;

  await t.q(
    `INSERT INTO story_versions (family_id, story_id, versao, titulo, corpo, editado_por, nota_edicao)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [familyId, storyId, proxima, titulo, corpo, userId, s(dados.nota, 300)]);

  const atualizada = await t.uma(
    `UPDATE stories SET titulo = $2, versao_atual = $3, updated_at = now()
      WHERE id = $1 RETURNING *`, [storyId, titulo, proxima]);

  if (dados.pessoas || dados.midias) {
    await mencionar(t, { familyId, storyId, pessoas: dados.pessoas || [], midias: dados.midias || [] });
  }
  await indexar(t, familyId, storyId);
  await auditar({ familyId, atorUserId: userId, acao: 'historia.editada',
    alvoTipo: 'story', alvoId: storyId,
    antes: { versao: h.versao_atual }, depois: { versao: proxima } }, t);
  return atualizada;
}

/** Menções são acrescentadas, nunca substituídas em silêncio. */
async function mencionar(t, { familyId, storyId, pessoas = [], midias = [] }) {
  for (const personId of pessoas.slice(0, 80)) {
    await t.q(
      `INSERT INTO story_mentions (family_id, story_id, person_id) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING`, [familyId, storyId, personId]);
  }
  for (const mediaId of midias.slice(0, 80)) {
    await t.q(
      `INSERT INTO story_mentions (family_id, story_id, media_id) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING`, [familyId, storyId, mediaId]);
  }
}

const listar = (t, familyId, { pessoaId = null, limite = 50 } = {}) => t.todas(
  `SELECT s.id, s.titulo, s.ocorrido_valor, s.local_texto, s.privacidade, s.versao_atual,
          s.created_by, s.created_at, u.nome AS autor_nome, p.nome_exibicao AS contada_por,
          left(v.corpo, 220) AS resumo
     FROM stories s
     LEFT JOIN users u ON u.id = s.autor_user_id
     LEFT JOIN persons p ON p.id = s.contada_por_person_id
     LEFT JOIN story_versions v ON v.story_id = s.id AND v.versao = s.versao_atual
    WHERE s.family_id = $1 AND s.deleted_at IS NULL
      AND ($2::uuid IS NULL OR s.contada_por_person_id = $2
           OR EXISTS (SELECT 1 FROM story_mentions m WHERE m.story_id = s.id AND m.person_id = $2))
    ORDER BY s.ocorrido_ini DESC NULLS LAST, s.created_at DESC
    LIMIT $3`, [familyId, pessoaId, Math.min(limite, 200)]);

async function obter(t, storyId) {
  const h = await t.uma(
    `SELECT s.*, u.nome AS autor_nome, p.nome_exibicao AS contada_por
       FROM stories s
       LEFT JOIN users u ON u.id = s.autor_user_id
       LEFT JOIN persons p ON p.id = s.contada_por_person_id
      WHERE s.id = $1 AND s.deleted_at IS NULL`, [storyId]);
  if (!h) return null;
  const versoes = await t.todas(
    `SELECT v.versao, v.titulo, v.corpo, v.nota_edicao, v.created_at, u.nome AS editado_por_nome
       FROM story_versions v LEFT JOIN users u ON u.id = v.editado_por
      WHERE v.story_id = $1 ORDER BY v.versao DESC`, [storyId]);
  const mencoes = await t.todas(
    `SELECT m.person_id, m.media_id, p.nome_exibicao
       FROM story_mentions m LEFT JOIN persons p ON p.id = m.person_id
      WHERE m.story_id = $1`, [storyId]);
  return { historia: h, versoes, mencoes, corpo: (versoes[0] || {}).corpo || '' };
}

module.exports = { criar, editar, mencionar, listar, obter, indexar };
