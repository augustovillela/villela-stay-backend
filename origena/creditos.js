// =====================================================================
// ORIGENA — carteira e ledger de créditos (§52, §53).
//
// AS TRÊS REGRAS:
//   1. saldo é cache; a verdade é SUM(delta) do ledger. reconciliar()
//      confere e NUNCA "conserta" em silêncio — divergência é incidente.
//   2. operação cara RESERVA antes de executar, na MESMA transação do
//      ai_job. Falhou → estorno automático. Nunca "cobra depois".
//   3. crédito externo (compra/bônus) é idempotente por referência — o
//      índice único é a garantia, não a checagem prévia.
// =====================================================================
'use strict';
const { erro } = require('./erros');

/** Carteira da família; nasce com o bônus de boas-vindas (config). */
async function carteira(t, familyId) {
  let w = await t.uma(`SELECT * FROM credit_wallets WHERE family_id = $1`, [familyId]);
  if (w) return w;
  const bonus = Number((await t.uma(
    `SELECT valor FROM config WHERE chave = 'creditos_bonus_inicial'`) || {}).valor) || 0;
  w = await t.uma(
    `INSERT INTO credit_wallets (family_id, saldo) VALUES ($1, $2)
     ON CONFLICT (family_id) DO UPDATE SET saldo = credit_wallets.saldo
     RETURNING *`, [familyId, bonus]);
  if (bonus > 0) {
    // o mesmo parâmetro não pode ser uuid E text na mesma query ($3 repete o id como texto)
    await t.q(
      `INSERT INTO credit_transactions (family_id, tipo, delta, saldo_depois, ref_tipo, ref_id, motivo)
       VALUES ($1,'bonus',$2,$2,'boas_vindas',$3,'Créditos de boas-vindas')
       ON CONFLICT DO NOTHING`, [familyId, bonus, String(familyId)]);
  }
  return w;
}

/** Movimenta o ledger + o cache do saldo, na mesma transação. */
async function lancar(t, { familyId, tipo, delta, refTipo = '', refId = '', motivo = '', userId = null }) {
  const w = await carteira(t, familyId);
  const novoSaldo = w.saldo + delta;
  if (novoSaldo < 0) throw erro('erro.creditos_insuficientes', 402);
  // SAVEPOINT porque o `23505` esperado é ESPERADO, mas não é inofensivo:
  // no Postgres qualquer statement que falha ABORTA a transação inteira, e
  // capturar o erro em JavaScript não desfaz isso. Sem o savepoint, quem
  // chamasse `lancar` no meio de uma transação maior veria a chamada
  // "funcionar" (null) e a próxima query morrer com "transaction is
  // aborted" — que foi exatamente o que a tela de planos fez ao entregar
  // os créditos do mês pela segunda vez.
  let linha;
  await t.q('SAVEPOINT credito_idem');
  try {
    linha = await t.uma(
      `INSERT INTO credit_transactions (family_id, tipo, delta, saldo_depois, ref_tipo, ref_id, motivo, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [familyId, tipo, delta, novoSaldo, refTipo, String(refId || ''), motivo, userId]);
  } catch (e) {
    await t.q('ROLLBACK TO SAVEPOINT credito_idem');
    if (e.code === '23505') return null;    // referência já creditada — idempotência
    throw e;
  }
  await t.q('RELEASE SAVEPOINT credito_idem');
  await t.q(`UPDATE credit_wallets SET saldo = $2, atualizado_em = now() WHERE family_id = $1`,
    [familyId, novoSaldo]);
  return linha;
}

/**
 * Reserva créditos E cria o ai_job na MESMA transação — ou os dois
 * acontecem, ou nenhum. É o coração do §53: mostrou o preço, o usuário
 * confirmou, a reserva trava o valor.
 */
async function reservar(t, { familyId, userId, capability, creditos, provider, model, entrada = {} }) {
  const job = await t.uma(
    `INSERT INTO ai_jobs (family_id, capability, entrada, provider, model, creditos, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [familyId, capability, JSON.stringify(entrada), provider, model, creditos, userId]);
  await lancar(t, { familyId, tipo: 'reserva', delta: -creditos,
    refTipo: 'ai_job', refId: job.id, motivo: capability, userId });
  return job;
}

/** Concluiu: a reserva vira consumo (delta 0 — o débito já aconteceu). */
async function consumir(t, { familyId, jobId, tokensIn = 0, tokensOut = 0, custoCentavos = 0 }) {
  const job = await t.uma(
    `UPDATE ai_jobs SET status = 'concluido', updated_at = now() WHERE id = $1 RETURNING *`, [jobId]);
  await lancar(t, { familyId, tipo: 'consumo', delta: 0,
    refTipo: 'ai_job', refId: jobId, motivo: job.capability });
  // margem em basis points, quando o preço em centavos do crédito existir (§58)
  const precoCredito = Number((await t.uma(
    `SELECT valor FROM config WHERE chave = 'creditos_preco_centavos'`) || {}).valor) || 0;
  const receita = precoCredito * job.creditos;
  await t.q(
    `INSERT INTO ai_cost_ledger (ai_job_id, family_id, provider, model, capability,
       tokens_in, tokens_out, custo_centavos, creditos_cobrados, margem_bp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [jobId, familyId, job.provider, job.model, job.capability,
      tokensIn, tokensOut, custoCentavos, job.creditos,
      receita > 0 ? Math.round(10000 * (receita - custoCentavos) / receita) : null]);
  return job;
}

/** Falhou: estorno AUTOMÁTICO. O usuário nunca paga pelo que não recebeu. */
async function estornar(t, { familyId, jobId, motivo = '' }) {
  const job = await t.uma(
    `UPDATE ai_jobs SET status = 'estornado', erro = $2, updated_at = now()
      WHERE id = $1 AND status IN ('reservado','executando') RETURNING *`,
    [jobId, String(motivo).slice(0, 400)]);
  if (!job) return null;                     // já consumido ou já estornado
  await lancar(t, { familyId, tipo: 'estorno', delta: job.creditos,
    refTipo: 'ai_job', refId: jobId, motivo: 'estorno: ' + motivo });
  return job;
}

/** saldo do cache == SUM(delta) do ledger? Divergência NÃO é consertada — é denunciada. */
async function reconciliar(t, familyId) {
  const w = await t.uma(`SELECT saldo FROM credit_wallets WHERE family_id = $1`, [familyId]);
  const l = await t.uma(
    `SELECT COALESCE(SUM(delta), 0)::int AS soma FROM credit_transactions WHERE family_id = $1`,
    [familyId]);
  return { saldo: w ? w.saldo : 0, ledger: l.soma, ok: (w ? w.saldo : 0) === l.soma };
}

const extrato = (t, familyId, limite = 100) => t.todas(
  `SELECT tipo, delta, saldo_depois, ref_tipo, motivo, created_at
     FROM credit_transactions WHERE family_id = $1
    ORDER BY created_at DESC LIMIT $2`, [familyId, Math.min(limite, 500)]);

module.exports = { carteira, lancar, reservar, consumir, estornar, reconciliar, extrato };
