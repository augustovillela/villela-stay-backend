// =====================================================================
// ORIGENA — administração pelo Portal Staff (§79, SECURITY.md T12).
//
// O STAFF NÃO É DONO DO CONTEÚDO DAS FAMÍLIAS. Este arquivo devolve
// AGREGADOS — contagens, custo, jobs, saldo — nunca o acervo. Não existe
// rota que abra foto, história ou documento de família por aqui.
//
// O papel de app tem RLS FORÇADA, então os agregados de conteúdo são
// calculados família a família, DENTRO do escopo de cada uma. Mais lento
// e muito mais seguro: nem o código de staff consegue esquecer o muro.
// =====================================================================
'use strict';
const db = require('./db');
const tenancy = require('./tenancy');
const creditos = require('./creditos');
const fila = require('./fila');

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function registrarRotasStaff(app, { requireAuth, requireAdmin }) {
  const R = '/staff/api/origena';

  /** Visão geral da plataforma: só números, nenhum conteúdo. */
  app.get(`${R}/resumo`, requireAuth, requireAdmin, h(async (req, res) => {
    // `users` e `families` não têm RLS (são escopadas por usuário) — os
    // agregados saem direto; conteúdo por família sai por escopo.
    const familias = await db.todas(
      `SELECT f.id, f.nome, f.created_at FROM families f WHERE f.deleted_at IS NULL ORDER BY f.created_at`);
    const usuarios = await db.uma(`SELECT count(*)::int n FROM users WHERE deleted_at IS NULL`);

    const porFamilia = [];
    for (const f of familias) {
      const agg = await tenancy.comEscopo(f.id, async (t) => ({
        pessoas: (await t.uma(`SELECT count(*)::int n FROM persons WHERE deleted_at IS NULL`)).n,
        midias: (await t.uma(`SELECT count(*)::int n FROM media WHERE deleted_at IS NULL AND derivado_de IS NULL`)).n,
        bytes: Number((await t.uma(`SELECT COALESCE(sum(bytes),0) s FROM media WHERE deleted_at IS NULL`)).s),
        historias: (await t.uma(`SELECT count(*)::int n FROM stories WHERE deleted_at IS NULL`)).n,
        claims: (await t.uma(`SELECT count(*)::int n FROM claims`)).n,
        saldo: (await creditos.carteira(t, f.id)).saldo,
        reconciliacao: await creditos.reconciliar(t, f.id),
        // §80 — a MÉTRICA NORTE, agora na definição inteira do
        // DOMAIN_MODEL: item (mídia, história OU tradição) com, ao mesmo
        // tempo, ≥1 pessoa identificada por humano, data de qualquer
        // precisão, lugar ou ocasião, autoria e ≥1 fonte. Subir 5.000
        // fotos sem contexto não move este número — é o comportamento que
        // o produto quer premiar. Cada tipo cumpre as pernas do seu jeito:
        //   fonte  = claim/fonte/contribuição (mídia) · quem contou
        //            (história) · origem, manuscrito ou contribuição (tradição)
        //   pessoa = identificação confirmada · menção · "de quem é"
        mpc_por_tipo: await t.uma(
          `SELECT
             (SELECT count(*) FROM media m
               WHERE m.deleted_at IS NULL AND m.derivado_de IS NULL
                 AND m.capturada_valor IS NOT NULL AND m.created_by IS NOT NULL
                 AND m.local_texto <> ''
                 AND EXISTS (SELECT 1 FROM media_persons mp WHERE mp.media_id = m.id
                               AND mp.origem IN ('MANUAL','CONFIRMADA'))
                 AND (EXISTS (SELECT 1 FROM claims c WHERE c.sujeito_id = m.id)
                      OR EXISTS (SELECT 1 FROM sources s WHERE s.media_id = m.id)
                      OR EXISTS (SELECT 1 FROM contributions ct
                                  WHERE ct.alvo_tipo = 'media' AND ct.alvo_id = m.id
                                    AND ct.status = 'ativa'))
             )::int AS midia,
             (SELECT count(*) FROM stories st
               WHERE st.deleted_at IS NULL AND st.ocorrido_valor IS NOT NULL
                 AND st.created_by IS NOT NULL AND st.local_texto <> ''
                 AND st.contada_por_person_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM story_mentions sm
                              WHERE sm.story_id = st.id AND sm.person_id IS NOT NULL)
             )::int AS historia,
             (SELECT count(*) FROM traditions tr
               WHERE tr.deleted_at IS NULL AND tr.desde_valor IS NOT NULL
                 AND tr.created_by IS NOT NULL AND tr.person_id IS NOT NULL
                 AND (tr.local_texto <> '' OR tr.ocasioes <> '{}')
                 AND (tr.origem <> ''
                      OR EXISTS (SELECT 1 FROM recipes r
                                  WHERE r.tradition_id = tr.id AND r.manuscrito_media_id IS NOT NULL)
                      OR EXISTS (SELECT 1 FROM contributions ct2
                                  WHERE ct2.alvo_tipo = 'tradition' AND ct2.alvo_id = tr.id
                                    AND ct2.status = 'ativa'))
             )::int AS tradicao`),
        // as lacunas abertas do Historiador (§29): quanto a família ainda
        // não contou, em número
        missoes: await t.uma(
          `SELECT count(*) FILTER (WHERE status = 'aberta')::int abertas,
                  count(*) FILTER (WHERE status IN ('respondida','resolvida'))::int fechadas
             FROM missions`),
        ia: await t.uma(
          `SELECT count(*)::int jobs,
                  count(*) FILTER (WHERE status = 'executando')::int presos,
                  COALESCE(sum(creditos) FILTER (WHERE status = 'concluido'), 0)::int creditos
             FROM ai_jobs`),
        custo_ia_centavos: Number((await t.uma(
          `SELECT COALESCE(sum(custo_centavos),0) s FROM ai_cost_ledger`)).s),
      }));
      const m = agg.mpc_por_tipo;
      porFamilia.push({ id: f.id, nome: f.nome, ...agg,
        mpc: m.midia + m.historia + m.tradicao });
    }

    res.json({
      usuarios: usuarios.n,
      familias: porFamilia.length,
      fila: await fila.saude(),
      por_familia: porFamilia,
      alertas: porFamilia.filter((f) => !f.reconciliacao.ok).map((f) =>
        `Família ${f.nome}: saldo ${f.reconciliacao.saldo} ≠ ledger ${f.reconciliacao.ledger}`),
    });
  }));

  // ------------------------------------------------------------- preços
  // Preço NÃO mora em código (§97). Estas rotas existem para o Augusto
  // ajustar sem deploy — e para a tela mostrar, ao lado de cada plano, o
  // PISO DE CUSTO com o plano CHEIO. Um plano só é sustentável se o preço
  // cobre o cliente bem-sucedido, não o cliente médio.
  const CONFIG_EDITAVEL = new Set(['creditos_preco_centavos', 'storage_excedente_centavos_gb',
    'fx_usd_brl', 'custo_r2_usd_gb_mes', 'trial_dias', 'creditos_bonus_inicial']);

  app.get(`${R}/precos`, requireAuth, requireAdmin, h(async (req, res) => {
    const planos = await db.todas(`SELECT * FROM plans ORDER BY ordem, preco_centavos`);
    const produtos = await db.todas(
      `SELECT * FROM products WHERE categoria = 'creditos' ORDER BY ordem, preco_centavos`);
    const cfg = Object.fromEntries((await db.todas(
      `SELECT chave, valor, descricao FROM config WHERE chave = ANY($1)`,
      [[...CONFIG_EDITAVEL]])).map((c) => [c.chave, c]));
    const registry = await db.todas(
      `SELECT capability, provider, model, creditos, custo_estimado_centavos, ativo
         FROM provider_registry ORDER BY capability`);

    const num = (chave, padrao) => Number((cfg[chave] || {}).valor) || padrao;
    const fx = num('fx_usd_brl', 5.4);
    const r2 = num('custo_r2_usd_gb_mes', 0.015);
    const precoCredito = num('creditos_preco_centavos', 20);
    // O pior caso é a capability com a PIOR relação custo/crédito — é ela
    // que define se o plano aguenta a família que usa tudo o que comprou.
    const piorPorCredito = registry.filter((l) => l.ativo && l.creditos > 0)
      .reduce((pior, l) => Math.max(pior, l.custo_estimado_centavos / l.creditos), 0);

    res.json({
      planos: planos.map((p) => {
        const custoStorage = Math.round(p.storage_gb * r2 * fx * 100);
        const custoCreditos = Math.round(p.creditos_mes * piorPorCredito);
        const piso = custoStorage + custoCreditos;
        return { ...p, piso_centavos: piso, custo_storage_centavos: custoStorage,
          custo_creditos_centavos: custoCreditos,
          margem_bp: p.preco_centavos > 0
            ? Math.round(10000 * (p.preco_centavos - piso) / p.preco_centavos) : null };
      }),
      produtos: produtos.map((p) => ({ ...p,
        centavos_por_credito: p.creditos ? +(p.preco_centavos / p.creditos).toFixed(2) : null })),
      capacidades: registry.map((l) => ({ ...l,
        receita_centavos: l.creditos * precoCredito,
        margem_bp: l.creditos * precoCredito > 0
          ? Math.round(10000 * (l.creditos * precoCredito - l.custo_estimado_centavos)
            / (l.creditos * precoCredito)) : null })),
      config: cfg,
      // margem MEDIDA, do ledger — a estimativa acima é hipótese; isto é fato
      medido: await db.uma(
        `SELECT count(*)::int operacoes, COALESCE(sum(custo_centavos),0)::int custo_centavos,
                COALESCE(round(avg(margem_bp)),0)::int margem_bp_media
           FROM ai_cost_ledger`),
    });
  }));

  app.patch(`${R}/planos/:id`, requireAuth, requireAdmin, h(async (req, res) => {
    const d = req.body || {};
    const inteiro = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
    const p = await db.uma(
      `UPDATE plans SET
         preco_centavos = COALESCE($2, preco_centavos),
         preco_anual_centavos = COALESCE($3, preco_anual_centavos),
         storage_gb = COALESCE($4, storage_gb), creditos_mes = COALESCE($5, creditos_mes),
         familias = COALESCE($6, familias), ativo = COALESCE($7, ativo)
       WHERE id = $1 RETURNING *`,
      [req.params.id, inteiro(d.preco_centavos), inteiro(d.preco_anual_centavos),
        inteiro(d.storage_gb), inteiro(d.creditos_mes), inteiro(d.familias),
        typeof d.ativo === 'boolean' ? d.ativo : null]);
    if (!p) return res.status(404).json({ erro: 'plano não encontrado' });
    res.json({ plano: p });
  }));

  app.patch(`${R}/produtos/:id`, requireAuth, requireAdmin, h(async (req, res) => {
    const d = req.body || {};
    const inteiro = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
    const p = await db.uma(
      `UPDATE products SET preco_centavos = COALESCE($2, preco_centavos),
              creditos = COALESCE($3, creditos), ativo = COALESCE($4, ativo),
              updated_at = now()
        WHERE id = $1 RETURNING *`,
      [req.params.id, inteiro(d.preco_centavos), inteiro(d.creditos),
        typeof d.ativo === 'boolean' ? d.ativo : null]);
    if (!p) return res.status(404).json({ erro: 'produto não encontrado' });
    res.json({ produto: p });
  }));

  /** Só as chaves de preço: `config` também guarda o heartbeat do worker. */
  app.patch(`${R}/config/:chave`, requireAuth, requireAdmin, h(async (req, res) => {
    if (!CONFIG_EDITAVEL.has(req.params.chave)) {
      return res.status(400).json({ erro: 'esta chave não é editável por aqui' });
    }
    const valor = String((req.body || {}).valor == null ? '' : (req.body || {}).valor).slice(0, 80);
    if (!/^[0-9]+(\.[0-9]+)?$/.test(valor)) {
      return res.status(400).json({ erro: 'valor deve ser um número' });
    }
    const c = await db.uma(
      `UPDATE config SET valor = $2, atualizado_em = now() WHERE chave = $1 RETURNING *`,
      [req.params.chave, valor]);
    if (!c) return res.status(404).json({ erro: 'chave não encontrada' });
    res.json({ config: c });
  }));

  /** Registry de provedores: trocar modelo é UPDATE, não deploy (§56). */
  app.get(`${R}/registry`, requireAuth, requireAdmin, h(async (req, res) => {
    res.json({ registry: await db.todas(`SELECT * FROM provider_registry ORDER BY capability, prioridade`) });
  }));

  app.patch(`${R}/registry/:id`, requireAuth, requireAdmin, h(async (req, res) => {
    const d = req.body || {};
    const r = await db.uma(
      `UPDATE provider_registry SET
         ativo = COALESCE($2, ativo), prioridade = COALESCE($3, prioridade),
         creditos = COALESCE($4, creditos), model = COALESCE($5, model),
         custo_estimado_centavos = COALESCE($6, custo_estimado_centavos)
       WHERE id = $1 RETURNING *`,
      [req.params.id, typeof d.ativo === 'boolean' ? d.ativo : null,
        Number.isInteger(d.prioridade) ? d.prioridade : null,
        Number.isInteger(d.creditos) ? d.creditos : null,
        d.model ? String(d.model).slice(0, 80) : null,
        Number.isInteger(d.custo_estimado_centavos) ? d.custo_estimado_centavos : null]);
    if (!r) return res.status(404).json({ erro: 'linha não encontrada' });
    res.json({ linha: r });
  }));

  /**
   * Crédito manual (beta, sem gateway): o admin credita uma compra. A
   * referência torna a operação IDEMPOTENTE — confirmar duas vezes não
   * credita duas vezes (o índice único garante).
   */
  app.post(`${R}/familias/:familyId/creditos`, requireAuth, requireAdmin, h(async (req, res) => {
    const d = req.body || {};
    const quantidade = Number(d.creditos);
    if (!Number.isInteger(quantidade) || quantidade <= 0 || quantidade > 100000) {
      return res.status(400).json({ erro: 'quantidade inválida' });
    }
    if (!d.referencia) return res.status(400).json({ erro: 'referência obrigatória (idempotência)' });
    const linha = await tenancy.comEscopo(req.params.familyId, (t) =>
      creditos.lancar(t, { familyId: req.params.familyId, tipo: 'compra', delta: quantidade,
        refTipo: 'manual', refId: String(d.referencia).slice(0, 80),
        motivo: String(d.motivo || 'crédito manual').slice(0, 200) }));
    res.status(linha ? 201 : 200).json({ creditado: !!linha, ja_estava: !linha });
  }));

  /**
   * PURGA de família (§66, LGPD). Staff-only até o fluxo jurídico do
   * titular existir (PRIVACY.md §10): apaga LINHAS e BINÁRIOS, de
   * verdade, e exige o nome da família por extenso. O registro da purga
   * (quem, quando, contagens — sem conteúdo) fica no audit global.
   */
  app.post(`${R}/familias/:familyId/purgar`, requireAuth, requireAdmin, h(async (req, res) => {
    const purga = require('./purga');
    const r = await tenancy.comEscopo(req.params.familyId, (t) =>
      purga.purgarFamilia(t, { familyId: req.params.familyId,
        confirmarNome: (req.body || {}).confirmar_nome,
        atorUserId: null }));
    res.json({ purgado: r });
  }));
}

module.exports = { registrarRotasStaff };
