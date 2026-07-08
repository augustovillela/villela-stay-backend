// =====================================================================
// Villela Projects & Events — Fase 5 (parte financeira).
// Receitas/despesas por projeto ou evento = contas a receber/pagar.
// "Atrasado" é sempre DERIVADO (vencimento < hoje e não liquidado) —
// nunca gravado. Consolida por projeto/evento: previsto × realizado,
// margem, inadimplência. Integração com gateway de pagamento: fase
// futura (reusar adapter Mercado Pago do vdocs).
// =====================================================================
'use strict';
const { db, nowISO, novoId } = require('./db');
const repo = require('./repo');

const s = repo.s;
const STATUS_FIN = ['previsto', 'pendente', 'pago', 'cancelado'];
const hoje = () => nowISO().slice(0, 10);

function criarLancamento(tenantId, campos, ator, ip) {
  if (!['receita', 'despesa'].includes(campos.tipo)) throw new Error('Tipo deve ser receita ou despesa.');
  if (!s(campos.descricao, 300)) throw new Error('Descreva o lançamento.');
  if (campos.project_id) repo.obterProjeto(tenantId, campos.project_id);
  if (campos.event_id) require('./eventos').obterEvento(tenantId, campos.event_id);
  const id = novoId();
  db.prepare(`INSERT INTO finance_entries (id, tenant_id, tipo, descricao, valor_centavos, categoria, project_id, event_id, vencimento, status, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, String(tenantId), campos.tipo, s(campos.descricao, 300), Math.max(0, Math.trunc(Number(campos.valor_centavos) || 0)),
      s(campos.categoria, 60), s(campos.project_id, 40), s(campos.event_id, 40), s(campos.vencimento, 10),
      STATUS_FIN.includes(campos.status) ? campos.status : 'pendente', nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'financeiro.lancar', 'finance_entries', id, { tipo: campos.tipo, valor: campos.valor_centavos }, ip);
  return obterLancamento(tenantId, id);
}
function obterLancamento(tenantId, id) {
  const e = db.prepare('SELECT * FROM finance_entries WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!e) throw new Error('Lançamento não encontrado.');
  e.atrasado = !!(e.vencimento && e.vencimento < hoje() && !['pago', 'cancelado'].includes(e.status));
  return e;
}
function listarLancamentos(tenantId, { tipo = '', status = '', project_id = '', event_id = '', so_atrasados = false } = {}) {
  let sql = 'SELECT * FROM finance_entries WHERE tenant_id = ?';
  const args = [String(tenantId)];
  if (tipo) { sql += ' AND tipo = ?'; args.push(s(tipo, 10)); }
  if (status) { sql += ' AND status = ?'; args.push(s(status, 20)); }
  if (project_id) { sql += ' AND project_id = ?'; args.push(String(project_id)); }
  if (event_id) { sql += ' AND event_id = ?'; args.push(String(event_id)); }
  sql += " ORDER BY CASE WHEN vencimento='' THEN 1 ELSE 0 END, vencimento LIMIT 1000";
  let es = db.prepare(sql).all(...args).map(e => ({ ...e, atrasado: !!(e.vencimento && e.vencimento < hoje() && !['pago', 'cancelado'].includes(e.status)) }));
  if (so_atrasados) es = es.filter(e => e.atrasado);
  return es;
}
function atualizarLancamento(tenantId, id, campos, ator, ip) {
  const e = obterLancamento(tenantId, id);
  if (campos.status && !STATUS_FIN.includes(campos.status)) throw new Error('Status inválido.');
  const novoStatus = campos.status || e.status;
  db.prepare(`UPDATE finance_entries SET descricao = ?, valor_centavos = ?, categoria = ?, vencimento = ?, status = ?, liquidado_em = ?, atualizado_em = ?
    WHERE id = ? AND tenant_id = ?`)
    .run(s(campos.descricao || e.descricao, 300),
      campos.valor_centavos != null ? Math.max(0, Math.trunc(Number(campos.valor_centavos) || 0)) : e.valor_centavos,
      s(campos.categoria ?? e.categoria, 60), s(campos.vencimento ?? e.vencimento, 10), novoStatus,
      novoStatus === 'pago' ? (e.liquidado_em || nowISO()) : '', nowISO(), e.id, String(tenantId));
  repo.auditar(tenantId, ator, campos.status && campos.status !== e.status ? 'financeiro.mudar_status' : 'financeiro.atualizar', 'finance_entries', e.id, { status: novoStatus }, ip);
  return obterLancamento(tenantId, e.id);
}
function excluirLancamento(tenantId, id, ator, ip) {
  const r = db.prepare('DELETE FROM finance_entries WHERE id = ? AND tenant_id = ?').run(String(id), String(tenantId));
  if (!r.changes) throw new Error('Lançamento não encontrado.');
  repo.auditar(tenantId, ator, 'financeiro.excluir', 'finance_entries', String(id), {}, ip);
}

// Consolidação: por escopo (tenant, projeto ou evento).
function consolidado(tenantId, { project_id = '', event_id = '' } = {}) {
  const cond = ['tenant_id = ?']; const args = [String(tenantId)];
  if (project_id) { cond.push('project_id = ?'); args.push(String(project_id)); }
  if (event_id) { cond.push('event_id = ?'); args.push(String(event_id)); }
  const where = cond.join(' AND ');
  const soma = (tipo, statusIn) => db.prepare(`SELECT COALESCE(SUM(valor_centavos),0) v FROM finance_entries WHERE ${where} AND tipo = ? AND status IN (${statusIn.map(() => '?').join(',')})`).get(...args, tipo, ...statusIn).v;
  const receita_prevista = soma('receita', ['previsto', 'pendente', 'pago']);
  const receita_realizada = soma('receita', ['pago']);
  const despesa_prevista = soma('despesa', ['previsto', 'pendente', 'pago']);
  const despesa_realizada = soma('despesa', ['pago']);
  const aReceber = db.prepare(`SELECT COALESCE(SUM(valor_centavos),0) v FROM finance_entries WHERE ${where} AND tipo='receita' AND status IN ('previsto','pendente')`).get(...args).v;
  const aPagar = db.prepare(`SELECT COALESCE(SUM(valor_centavos),0) v FROM finance_entries WHERE ${where} AND tipo='despesa' AND status IN ('previsto','pendente')`).get(...args).v;
  const inadimplencia = db.prepare(`SELECT COALESCE(SUM(valor_centavos),0) v FROM finance_entries WHERE ${where} AND tipo='receita' AND status IN ('previsto','pendente') AND vencimento != '' AND vencimento < ?`).get(...args, hoje()).v;
  return {
    receita_prevista, receita_realizada, despesa_prevista, despesa_realizada,
    margem_prevista: receita_prevista - despesa_prevista, margem_realizada: receita_realizada - despesa_realizada,
    a_receber: aReceber, a_pagar: aPagar, inadimplencia,
  };
}
function resumoFinanceiro(tenantId) {
  const c = consolidado(tenantId, {});
  const vencendo7 = db.prepare(`SELECT COUNT(*) n FROM finance_entries WHERE tenant_id = ? AND status IN ('previsto','pendente') AND vencimento != '' AND vencimento <= ?`)
    .get(String(tenantId), new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).n;
  return { a_receber: c.a_receber, a_pagar: c.a_pagar, inadimplencia: c.inadimplencia, contas_vencendo_7d: vencendo7 };
}

module.exports = { STATUS_FIN, criarLancamento, obterLancamento, listarLancamentos, atualizarLancamento, excluirLancamento, consolidado, resumoFinanceiro };
