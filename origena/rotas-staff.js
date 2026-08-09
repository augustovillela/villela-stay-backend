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
        // §80 — a métrica norte: itens com pessoa+data+contexto+fonte
        mpc: (await t.uma(
          `SELECT count(*)::int n FROM media m
            WHERE m.deleted_at IS NULL AND m.derivado_de IS NULL
              AND m.capturada_valor IS NOT NULL
              AND (m.local_texto <> '' OR EXISTS (SELECT 1 FROM claims c WHERE c.sujeito_id = m.id))
              AND EXISTS (SELECT 1 FROM media_persons mp WHERE mp.media_id = m.id
                            AND mp.origem IN ('MANUAL','CONFIRMADA'))`)).n,
        ia: await t.uma(
          `SELECT count(*)::int jobs,
                  count(*) FILTER (WHERE status = 'executando')::int presos,
                  COALESCE(sum(creditos) FILTER (WHERE status = 'concluido'), 0)::int creditos
             FROM ai_jobs`),
        custo_ia_centavos: Number((await t.uma(
          `SELECT COALESCE(sum(custo_centavos),0) s FROM ai_cost_ledger`)).s),
      }));
      porFamilia.push({ id: f.id, nome: f.nome, ...agg });
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
}

module.exports = { registrarRotasStaff };
