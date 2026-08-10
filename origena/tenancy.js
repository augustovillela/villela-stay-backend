// =====================================================================
// ORIGENA — escopo de família. É por aqui que TODA leitura e escrita de
// conteúdo passa. Requisito de segurança de primeira classe (§9, §94).
//
// COMO FUNCIONA
//   `comEscopo(familyId, fn)` abre uma transação e executa
//   `SET LOCAL app.family_id = <uuid>`. As políticas de RLS do Postgres
//   leem esse valor. Fora de uma transação com o escopo posto, as tabelas
//   de conteúdo devolvem ZERO linhas — inclusive para o dono da tabela,
//   porque o schema usa FORCE ROW LEVEL SECURITY.
//
// POR QUE TRANSAÇÃO, E NÃO SESSÃO
//   `SET LOCAL` morre no fim da transação. Um `SET` de sessão ficaria
//   grudado na conexão do pool e VAZARIA para o próximo request — que é
//   exatamente o acidente que este módulo existe para impedir.
//
// A REGRA QUE NÃO TEM EXCEÇÃO
//   O family_id vem SEMPRE da membership verificada na sessão. Parâmetro
//   de família mandado pelo cliente (corpo, query, header) é ignorado.
// =====================================================================
'use strict';
const db = require('./db');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Executa `fn` dentro do escopo de uma família.
 * O callback recebe o mesmo contrato de `db.transacao` (.q/.uma/.todas).
 */
async function comEscopo(familyId, fn) {
  if (!UUID.test(String(familyId || ''))) {
    throw new Error('tenancy.comEscopo: family_id inválido.');
  }
  return db.transacao(async (t) => {
    await t.q('SELECT set_config($1, $2, true)', ['app.family_id', String(familyId)]);
    return fn(t);
  });
}

/**
 * Escopo VAZIO, para provar nos testes que sem `app.family_id` nada
 * aparece. Não usar em código de produção.
 */
async function semEscopo(fn) {
  return db.transacao(async (t) => {
    await t.q('SELECT set_config($1, $2, true)', ['app.family_id', '']);
    return fn(t);
  });
}

/**
 * Middleware: resolve a família da requisição a partir da MEMBERSHIP do
 * usuário logado — nunca a partir do que o cliente mandou.
 *
 * A família ativa vem do parâmetro de rota `:familyId` (ou do cookie de
 * família), e só é aceita se existir membership ativa. Não existindo,
 * responde 404 — nunca 403, que confirmaria a existência da família
 * (SECURITY.md T2).
 */
function requireFamilia(req, res, next) {
  const alvo = req.params.familyId || req.familiaSolicitada;
  if (!req.usuario) return res.status(401).json({ erro: req.t('erro.faca_login'), codigo: 'erro.faca_login' });
  if (!UUID.test(String(alvo || ''))) return res.status(404).json({ erro: req.t('erro.familia_nao_encontrada'), codigo: 'erro.familia_nao_encontrada' });

  db.uma(
    `SELECT m.id, m.papel, m.status, f.nome, f.slug, f.status AS familia_status
       FROM family_memberships m JOIN families f ON f.id = m.family_id
      WHERE m.family_id = $1 AND m.user_id = $2 AND m.status = 'ativo' AND f.deleted_at IS NULL`,
    [alvo, req.usuario.id],
  ).then((m) => {
    if (!m) return res.status(404).json({ erro: req.t('erro.familia_nao_encontrada'), codigo: 'erro.familia_nao_encontrada' });
    req.familia = { id: alvo, nome: m.nome, slug: m.slug, status: m.familia_status };
    req.papel = m.papel;
    next();
  }).catch(next);
}

/**
 * Guarda das rotas de sucessão (§40). GUARDIÃO NÃO É MEMBRO DA FAMÍLIA —
 * é justamente alguém de fora, e é essa a razão de existir. Exigir
 * participação aqui tornaria impossível aceitar o convite e acionar a
 * sucessão: o guardião tomaria 404 em todas as portas que foram feitas
 * para ele.
 *
 * Passa quem for uma destas três coisas:
 *   • membro ativo (o titular administrando os próprios guardiões);
 *   • guardião ativo, ou convidado cujo E-MAIL bate com o da conta;
 *   • a PRÓPRIA pessoa sobre quem existe um pedido em curso — que pode
 *     ter sido tirada da família justamente por quem abriu o pedido, e
 *     precisa da porta aberta para derrubá-lo.
 *
 * Quem não é nada disso leva 404, igual ao `requireFamilia`: 403 aqui
 * confirmaria que a família existe. O escopo é ligado ANTES da decisão
 * porque as tabelas de guardião têm RLS — mas nada sai daqui para o
 * chamador antes de ele provar que é uma das três coisas.
 */
function requireFamiliaOuGuardiao(req, res, next) {
  const alvo = req.params.familyId || req.familiaSolicitada;
  const nao404 = () => res.status(404).json(
    { erro: req.t('erro.familia_nao_encontrada'), codigo: 'erro.familia_nao_encontrada' });
  if (!req.usuario) return res.status(401).json({ erro: req.t('erro.faca_login'), codigo: 'erro.faca_login' });
  if (!UUID.test(String(alvo || ''))) return nao404();

  (async () => {
    const f = await db.uma(
      `SELECT id, nome, slug, status FROM families WHERE id = $1 AND deleted_at IS NULL`, [alvo]);
    if (!f) return nao404();
    const m = await db.uma(
      `SELECT papel FROM family_memberships
        WHERE family_id = $1 AND user_id = $2 AND status = 'ativo'`, [alvo, req.usuario.id]);
    const extra = await comEscopo(alvo, async (t) => ({
      guardiao: await t.uma(
        `SELECT id, status FROM legacy_guardians
          WHERE deleted_at IS NULL AND status IN ('convidado','ativo')
            AND (user_id = $1 OR lower(email) = lower($2))`, [req.usuario.id, req.usuario.email]),
      alvoDe: await t.uma(
        `SELECT id FROM succession_requests WHERE sobre_user_id = $1
            AND status IN ('aguardando_quorum','aguardando_revisao','em_contestacao') LIMIT 1`,
        [req.usuario.id]),
    }));
    if (!m && !extra.guardiao && !extra.alvoDe) return nao404();

    req.familia = { id: alvo, nome: f.nome, slug: f.slug, status: f.status };
    req.papel = m ? m.papel : 'GUEST';
    req.ehGuardiao = !!(extra.guardiao && extra.guardiao.status === 'ativo');
    next();
  })().catch(next);
}

/** Açúcar: roda `fn` no escopo da família já resolvida pelo middleware. */
const noEscopoDe = (req, fn) => comEscopo(req.familia.id, fn);

module.exports = { comEscopo, semEscopo, requireFamilia, requireFamiliaOuGuardiao,
  noEscopoDe, UUID };
