// =====================================================================
// ORIGENA — lixeira e purga (§66).
//
// TRÊS DEGRAUS, e nenhum atalho entre eles:
//   1. arquivar (soft delete)  — some das telas, fica no banco. Já existe
//      desde as Fases 2/4; aqui entra a LIXEIRA que lista e RESTAURA.
//   2. purga de família        — desmonta TUDO, de verdade: linhas e
//      binários. É o fim do contrato (LGPD/encerramento), exige o nome
//      da família por extenso e é STAFF-only até o fluxo jurídico do
//      titular existir (PRIVACY.md §10).
//   3. o que a purga NÃO é: caminho de exclusão do dia a dia. Claims e
//      contribuições continuam sem rota de DELETE.
// =====================================================================
'use strict';
const { erro } = require('./erros');
const storage = require('./storage');
const { auditar } = require('./repo');

// ------------------------------------------------------------------ lixeira
async function lixeira(t, familyId) {
  const pessoas = await t.todas(
    `SELECT id, nome_exibicao AS titulo, deleted_at FROM persons
      WHERE family_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100`, [familyId]);
  const midias = await t.todas(
    `SELECT id, COALESCE(NULLIF(titulo,''), nome_original) AS titulo, deleted_at FROM media
      WHERE family_id = $1 AND deleted_at IS NOT NULL AND derivado_de IS NULL
      ORDER BY deleted_at DESC LIMIT 100`, [familyId]);
  const hist = await t.todas(
    `SELECT id, titulo, deleted_at FROM stories
      WHERE family_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100`, [familyId]);
  const trad = await t.todas(
    `SELECT id, titulo, categoria, deleted_at FROM traditions
      WHERE family_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100`, [familyId]);
  const rel = await t.todas(
    `SELECT id, nome AS titulo, deleted_at FROM heirlooms
      WHERE family_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100`, [familyId]);
  return { pessoas, midias, historias: hist, tradicoes: trad, reliquias: rel };
}

async function restaurar(t, { familyId, userId, tipo, id }) {
  const tabela = { pessoa: 'persons', midia: 'media', historia: 'stories',
    tradicao: 'traditions', reliquia: 'heirlooms' }[tipo];
  if (!tabela) throw erro('erro.lixeira_tipo', 400);
  const r = await t.uma(
    `UPDATE ${tabela} SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`, [id]);
  if (!r) throw erro('erro.lixeira_nao_encontrado', 404);
  if (tipo === 'midia') {
    await t.q(`UPDATE media SET deleted_at = NULL WHERE derivado_de = $1`, [id]);
  }
  if (tipo === 'pessoa') {
    // as arestas voltam junto — pessoa sem parentesco seria outra pessoa
    await t.q(`UPDATE relationships SET deleted_at = NULL
                WHERE (person_a = $1 OR person_b = $1) AND deleted_at IS NOT NULL`, [id]);
  }
  // Arquivar tirou da busca; restaurar devolve — item restaurado que não
  // se acha é item perdido com outro nome.
  if (tipo === 'tradicao') await require('./tradicoes').indexar(t, familyId, id);
  if (tipo === 'reliquia') await require('./tradicoes').indexarReliquia(t, familyId, id);
  await auditar({ familyId, atorUserId: userId, acao: 'lixeira.restaurado',
    alvoTipo: tipo, alvoId: id }, t);
  return true;
}

// -------------------------------------------------------------------- purga
// Ordem de desmonte: filhos antes de pais (FKs), binários antes das
// linhas que os apontam — se a purga morrer no meio, sobra registro
// apontando byte apagado (visível), nunca byte órfão pago para sempre.
const ORDEM = ['books', 'search_chunks', 'document_findings', 'interview_answers', 'interviews', 'heirloom_custody', 'heirlooms', 'recipe_learners', 'tradition_transmissions',
  'recipes', 'traditions', 'missions', 'memory_index', 'notification_prefs',
  'evidence', 'claim_resolutions', 'claims', 'sources', 'contributions',
  'story_mentions', 'story_versions', 'stories', 'event_participants', 'events',
  'timeline_entries', 'album_items', 'albums', 'media_persons', 'document_texts', 'busca',
  'biography_versions', 'biographies', 'exports', 'ai_cost_ledger', 'ai_jobs',
  'credit_transactions', 'credit_wallets', 'orders', 'subscriptions', 'media', 'person_user_links',
  'relationships', 'persons', 'places'];

async function purgarFamilia(t, { familyId, confirmarNome, atorUserId }) {
  const f = await t.uma(`SELECT * FROM families WHERE id = $1 AND deleted_at IS NULL`, [familyId]);
  if (!f) throw erro('erro.familia_nao_encontrada', 404);
  // O nome por extenso é o "tem certeza?" que não se clica sem ler.
  if (String(confirmarNome || '').trim() !== f.nome) throw erro('erro.purga_nome_diferente', 400);

  // 1. estado `encerrada` — libera a trava do último OWNER (schema 009)
  await t.q(`UPDATE families SET status = 'encerrada' WHERE id = $1`, [familyId]);

  // 2. binários do R2, um a um, pela lista do banco (não temos LIST no
  //    helper S3 — a lista canônica é o próprio banco)
  const arquivos = await t.todas(
    `SELECT storage_key FROM media WHERE family_id = $1 AND storage_key <> ''`, [familyId]);
  let apagados = 0;
  for (const a of arquivos) {
    try { await storage.apagar(a.storage_key, { purga: true }); apagados++; }
    catch (e) { console.error('[origena/purga] R2 recusou', a.storage_key, e.message); }
  }
  const exps = await t.todas(
    `SELECT storage_key FROM exports WHERE family_id = $1 AND storage_key <> ''`, [familyId]);
  for (const a of exps) { try { await storage.apagar(a.storage_key, { purga: true }); } catch (_) {} }

  // 3. linhas, na ordem das FKs
  const linhas = {};
  for (const tabela of ORDEM) {
    const r = await t.q(`DELETE FROM ${tabela} WHERE family_id = $1`, [familyId]);
    linhas[tabela] = r.rowCount || 0;
  }
  await t.q(`DELETE FROM invites WHERE family_id = $1`, [familyId]);
  await t.q(`DELETE FROM family_memberships WHERE family_id = $1`, [familyId]);
  await t.q(`UPDATE families SET deleted_at = now(), nome = '[família encerrada]',
              slug = 'encerrada-' || substr(id::text, 1, 8) WHERE id = $1`, [familyId]);

  // O REGISTRO da purga fica no audit global (family_id nulo — a família
  // não existe mais para o RLS): id, quem, quando, contagens. Sem conteúdo.
  await auditar({ familyId: null, atorUserId: atorUserId, atorKind: 'staff',
    acao: 'familia.purgada', alvoTipo: 'family', alvoId: familyId,
    depois: { nome: f.nome, binarios_apagados: apagados, linhas } });
  return { binarios: apagados, linhas };
}

module.exports = { lixeira, restaurar, purgarFamilia, ORDEM };
