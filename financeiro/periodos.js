// =====================================================================
// Villela Finance — períodos contábeis: fechar e reabrir.
//
// Fechar não é marcar caixinha: é travar a competência. Depois de
// fechada, nenhum lançamento entra — o trigger do schema recusa, mesmo
// que um serviço futuro esqueça de perguntar.
//
// Reabrir é uma das ações mais sensíveis do sistema (permite reescrever
// resultado já reportado). Por isso é nível 3: maker-checker, MFA e
// motivo obrigatório, tudo na cadeia de auditoria.
// =====================================================================
'use strict';
const { transacao } = require('./db');
const repo = require('./repo');
const ledger = require('./ledger');
const auditoria = require('./auditoria');
const dinheiro = require('./dinheiro');

class ErroDePeriodo extends Error {
  constructor(msg, detalhe) { super(msg); this.name = 'ErroDePeriodo'; this.status = 400; this.detalhe = detalhe || null; }
}

const RE_COMP = /^\d{4}-\d{2}$/;
const anterior = (comp) => {
  const [a, m] = comp.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
};

/**
 * Checklist do fechamento. Devolve cada item com `ok` e o que falta —
 * é ele que vira a tela de fechamento, e é ele que o `fechar()` exige.
 */
function checklist(entidadeId, competencia) {
  if (!RE_COMP.test(competencia)) throw new ErroDePeriodo('Competência inválida (use AAAA-MM).');
  const inicio = `${competencia}-01`;
  const fim = `${competencia}-31`;
  const itens = [];

  const balanceamento = ledger.conferirBalanceamento(entidadeId);
  itens.push({
    chave: 'razao_balanceado',
    titulo: 'Razão balanceado',
    ok: balanceamento.ok,
    detalhe: balanceamento.ok ? 'Débitos e créditos iguais.' : `Diferença de ${dinheiro.formatar(balanceamento.diferencaCents)}.`,
    bloqueia: true,
  });

  const rascunhos = repo.listarLotes(entidadeId, { competencia, status: 'rascunho', limite: 50 });
  itens.push({
    chave: 'sem_rascunho',
    titulo: 'Nenhum lançamento em rascunho',
    ok: rascunhos.length === 0,
    detalhe: rascunhos.length ? `${rascunhos.length} lote(s) em rascunho.` : 'Nenhum.',
    bloqueia: true,
  });

  const pendentes = repo.q(
    `SELECT COUNT(*) AS n FROM fin_transacoes_banco
      WHERE tenant_id = :tenant AND entidade_id = :ent AND data BETWEEN :ini AND :fim
        AND status IN ('nova','sugerida','aguardando_aprovacao')`,
    { ent: entidadeId, ini: inicio, fim })[0] || { n: 0 };
  itens.push({
    chave: 'banco_conciliado',
    titulo: 'Extrato bancário conciliado',
    ok: pendentes.n === 0,
    detalhe: pendentes.n ? `${pendentes.n} transação(ões) sem classificação.` : 'Tudo conciliado.',
    bloqueia: true,
  });

  const aprovacoesAbertas = repo.q(
    "SELECT COUNT(*) AS n FROM fin_aprovacoes WHERE tenant_id = :tenant AND status = 'pendente'", {})[0] || { n: 0 };
  itens.push({
    chave: 'sem_aprovacao_pendente',
    titulo: 'Caixa de aprovações vazia',
    ok: aprovacoesAbertas.n === 0,
    detalhe: aprovacoesAbertas.n ? `${aprovacoesAbertas.n} solicitação(ões) pendente(s).` : 'Nenhuma.',
    bloqueia: false,
  });

  const aClassificar = ['entradaAClassificar', 'saidaAClassificar'].map(k => {
    try {
      const conta = require('./plano-contas').chave(entidadeId, k);
      const s = ledger.saldo(conta.id, { ate: fim });
      return { codigo: conta.codigo, saldoCents: s.saldoCents };
    } catch { return null; }
  }).filter(Boolean);
  const sobrando = aClassificar.filter(c => c.saldoCents !== 0);
  itens.push({
    chave: 'nada_a_classificar',
    titulo: 'Contas "a classificar" zeradas',
    ok: sobrando.length === 0,
    detalhe: sobrando.length
      ? sobrando.map(c => `${c.codigo}: ${dinheiro.formatar(c.saldoCents)}`).join(' · ')
      : 'Zeradas.',
    bloqueia: false,
  });

  // O balanço fechar é diferente do balancete fechar: aqui se confere a
  // identidade ativo = passivo + PL, que é onde erro de classificação de
  // conta aparece (despesa cadastrada como ativo, p.ex.).
  const bp = require('./apuracao').balanco(entidadeId, { ate: fim });
  itens.push({
    chave: 'balanco_fecha',
    titulo: 'Balanço patrimonial fecha',
    ok: bp.fecha,
    detalhe: bp.fecha ? 'Ativo = passivo + patrimônio líquido.' : `Diferença de ${dinheiro.formatar(bp.diferencaCents)}.`,
    bloqueia: true,
  });

  const ant = repo.periodo(entidadeId, anterior(competencia));
  itens.push({
    chave: 'anterior_fechado',
    titulo: 'Competência anterior fechada',
    ok: !ant || ant.status === 'fechado',
    detalhe: !ant ? 'Não há competência anterior registrada.' : (ant.status === 'fechado' ? 'Fechada.' : `${anterior(competencia)} ainda aberta.`),
    bloqueia: false,
  });

  const bloqueadores = itens.filter(i => i.bloqueia && !i.ok);
  return {
    competencia, itens,
    pode: bloqueadores.length === 0,
    bloqueadores: bloqueadores.map(i => i.titulo),
  };
}

/** Fecha a competência. Só passa com o checklist bloqueante limpo. */
function fechar(entidadeId, competencia, { por, forcar = false, motivo = '' } = {}) {
  const c = checklist(entidadeId, competencia);
  if (!c.pode && !forcar) {
    throw new ErroDePeriodo(
      `Não dá para fechar ${competencia}: ${c.bloqueadores.join(' · ')}.`, c);
  }
  if (!c.pode && forcar && !String(motivo).trim()) {
    throw new ErroDePeriodo('Fechar com pendência exige motivo escrito.');
  }
  const p = repo.periodo(entidadeId, competencia) || repo.criarPeriodo(entidadeId, competencia);
  if (p.status === 'fechado') throw new ErroDePeriodo(`A competência ${competencia} já está fechada.`);

  return transacao(() => {
    repo.fecharPeriodo(entidadeId, competencia, por || '');
    auditoria.registrar('periodo.fechar', {
      objetoTipo: 'periodo', objetoId: `${entidadeId}:${competencia}`,
      motivo: motivo || `fechamento de ${competencia}`,
      detalhe: { competencia, checklist: c.itens.map(i => ({ chave: i.chave, ok: i.ok })), forcado: !c.pode },
    });
    return repo.periodo(entidadeId, competencia);
  });
}

/** Reabre a competência. Nível 3 — motivo obrigatório e auditado. */
function reabrir(entidadeId, competencia, { por, motivo }) {
  if (!String(motivo || '').trim()) throw new ErroDePeriodo('Reabrir período exige motivo — ele fica no histórico para sempre.');
  const p = repo.periodo(entidadeId, competencia);
  if (!p) throw new ErroDePeriodo('Período não encontrado.');
  if (p.status !== 'fechado') throw new ErroDePeriodo(`A competência ${competencia} não está fechada.`);

  return transacao(() => {
    repo.reabrirPeriodo(entidadeId, competencia, por || '', String(motivo).slice(0, 300));
    auditoria.registrar('periodo.reabrir', {
      objetoTipo: 'periodo', objetoId: `${entidadeId}:${competencia}`, motivo,
      detalhe: { competencia, fechado_em: p.fechado_em, fechado_por: p.fechado_por },
    });
    return repo.periodo(entidadeId, competencia);
  });
}

const listar = (entidadeId) => repo.listarPeriodos(entidadeId);
const estaFechado = (entidadeId, competencia) => {
  const p = repo.periodo(entidadeId, competencia);
  return !!p && p.status === 'fechado';
};

module.exports = { ErroDePeriodo, checklist, fechar, reabrir, listar, estaFechado, anterior };
