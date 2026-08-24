// =====================================================================
// Villela Finance — orçamento e realizado.
//
// Versionado de propósito: "o orçamento aprovado em janeiro" e "a revisão
// de julho" são documentos diferentes. Comparar o realizado com a versão
// errada é pior do que não comparar — dá a sensação de controle sem o
// controle.
//
// O desvio nunca aparece sozinho: vem com o sinal certo para a natureza
// da conta. Gastar MENOS que o orçado numa despesa é desvio FAVORÁVEL;
// faturar menos que o orçado numa receita é desfavorável. Um relatório
// que mostra os dois como "-15%" obriga o leitor a fazer essa tradução de
// cabeça toda vez, e é assim que se lê um número ao contrário.
// =====================================================================
'use strict';
const { transacao, novoId, nowISO } = require('./db');
const repo = require('./repo');
const ledger = require('./ledger');
const dinheiro = require('./dinheiro');
const auditoria = require('./auditoria');
const tenancy = require('./tenancy');

class ErroDeOrcamento extends Error {
  constructor(msg, detalhe) { super(msg); this.name = 'ErroDeOrcamento'; this.status = 400; this.detalhe = detalhe || null; }
}

const RE_COMP = /^\d{4}-\d{2}$/;
const RE_ANO = /^\d{4}$/;
const CENARIOS = ['base', 'otimista', 'pessimista'];

/** Cria uma versão. A numeração é automática por exercício e cenário. */
function criar({ entidadeId, nome, exercicio, cenario = 'base', linhas = [] }) {
  if (!RE_ANO.test(String(exercicio || ''))) throw new ErroDeOrcamento('Exercício inválido (use AAAA).');
  if (!CENARIOS.includes(cenario)) throw new ErroDeOrcamento(`Cenário inválido: use ${CENARIOS.join(', ')}.`);
  if (!String(nome || '').trim()) throw new ErroDeOrcamento('Dê um nome à versão do orçamento.');

  const anterior = repo.q(
    `SELECT MAX(versao) AS v FROM fin_orcamentos
      WHERE tenant_id = :tenant AND entidade_id = :ent AND exercicio = :ex AND cenario = :cen`,
    { ent: entidadeId, ex: exercicio, cen: cenario })[0];
  const versao = ((anterior && anterior.v) || 0) + 1;

  return transacao(() => {
    const id = novoId();
    repo.exec(
      `INSERT INTO fin_orcamentos (id, tenant_id, entidade_id, nome, exercicio, versao, cenario, status, criado_em, criado_por)
       VALUES (:id, :tenant, :ent, :nome, :ex, :versao, :cen, 'rascunho', :agora, :por)`,
      { id, ent: entidadeId, nome: String(nome).slice(0, 120), ex: exercicio, versao, cen: cenario,
        agora: nowISO(), por: tenancy.userAtual() });

    const gravadas = definirLinhas(id, entidadeId, linhas);
    auditoria.registrar('orcamento.criar', {
      objetoTipo: 'orcamento', objetoId: id,
      detalhe: { nome, exercicio, cenario, versao, linhas: gravadas },
    });
    return buscar(id);
  });
}

/** Substitui as linhas da versão. Só em rascunho — aprovado é congelado. */
function definirLinhas(orcamentoId, entidadeId, linhas) {
  const o = repo.q('SELECT * FROM fin_orcamentos WHERE tenant_id = :tenant AND id = :id', { id: orcamentoId })[0];
  if (!o) throw new ErroDeOrcamento('Orçamento não encontrado.');
  if (o.status !== 'rascunho') {
    throw new ErroDeOrcamento(`A versão está ${o.status} e não aceita alteração. Crie uma versão nova.`);
  }
  if (!Array.isArray(linhas)) throw new ErroDeOrcamento('Informe as linhas do orçamento.');

  repo.exec('DELETE FROM fin_orcamento_linhas WHERE tenant_id = :tenant AND orcamento_id = :o', { o: orcamentoId });

  // Agrega antes de gravar: a mesma conta/centro/competência repetida na
  // entrada vira uma linha só, em vez de estourar o índice único.
  const agregado = new Map();
  linhas.forEach((l, i) => {
    const conta = l.contaId ? repo.contaPorId(l.contaId) : repo.contaPorCodigo(entidadeId, l.contaCodigo);
    if (!conta) throw new ErroDeOrcamento(`Linha ${i + 1}: conta ${l.contaId || l.contaCodigo} não existe.`);
    if (conta.aceita_lancamento !== 1) throw new ErroDeOrcamento(`Linha ${i + 1}: ${conta.codigo} é conta sintética.`);
    if (!RE_COMP.test(String(l.competencia || ''))) throw new ErroDeOrcamento(`Linha ${i + 1}: competência inválida (use AAAA-MM).`);
    if (l.competencia.slice(0, 4) !== o.exercicio) {
      throw new ErroDeOrcamento(`Linha ${i + 1}: competência ${l.competencia} está fora do exercício ${o.exercicio}.`);
    }
    const cc = l.centroCustoId || '';
    if (cc && !repo.centroCustoPorId(cc)) throw new ErroDeOrcamento(`Linha ${i + 1}: centro de custo ${cc} não existe.`);
    const chave = `${conta.id}|${cc}|${l.competencia}`;
    const valor = dinheiro.naoNegativo(l.valorCents, `valor da linha ${i + 1}`);
    const atual = agregado.get(chave);
    if (atual) atual.valorCents += valor;
    else agregado.set(chave, { contaId: conta.id, centroCustoId: cc, competencia: l.competencia, valorCents: valor, memo: String(l.memo || '').slice(0, 200) });
  });

  for (const l of agregado.values()) {
    repo.exec(
      `INSERT INTO fin_orcamento_linhas (id, tenant_id, orcamento_id, conta_id, centro_custo_id, competencia, valor_cents, memo, criado_em)
       VALUES (:id, :tenant, :o, :conta, :cc, :comp, :valor, :memo, :agora)`,
      { id: novoId(), o: orcamentoId, conta: l.contaId, cc: l.centroCustoId, comp: l.competencia,
        valor: l.valorCents, memo: l.memo, agora: nowISO() });
  }
  return agregado.size;
}

/** Aprovar congela a versão: comparar contra alvo móvel não é comparar. */
function aprovar(orcamentoId, { motivo }) {
  const o = repo.q('SELECT * FROM fin_orcamentos WHERE tenant_id = :tenant AND id = :id', { id: orcamentoId })[0];
  if (!o) throw new ErroDeOrcamento('Orçamento não encontrado.');
  if (o.status === 'aprovado') throw new ErroDeOrcamento('Esta versão já está aprovada.');
  const linhas = repo.q('SELECT COUNT(*) AS n FROM fin_orcamento_linhas WHERE tenant_id = :tenant AND orcamento_id = :o', { o: orcamentoId })[0].n;
  if (!linhas) throw new ErroDeOrcamento('Não dá para aprovar orçamento sem linha nenhuma.');

  return transacao(() => {
    repo.exec(
      `UPDATE fin_orcamentos SET status = 'aprovado', aprovado_em = :agora, aprovado_por = :por
        WHERE tenant_id = :tenant AND id = :id`,
      { id: orcamentoId, agora: nowISO(), por: tenancy.userAtual() });
    // Uma versão aprovada por exercício/cenário: a anterior vai para
    // arquivada, senão "o orçamento" fica ambíguo.
    repo.exec(
      `UPDATE fin_orcamentos SET status = 'arquivado'
        WHERE tenant_id = :tenant AND entidade_id = :ent AND exercicio = :ex AND cenario = :cen
          AND id <> :id AND status = 'aprovado'`,
      { id: orcamentoId, ent: o.entidade_id, ex: o.exercicio, cen: o.cenario });
    auditoria.registrar('orcamento.aprovar', {
      objetoTipo: 'orcamento', objetoId: orcamentoId, motivo: motivo || '',
      detalhe: { nome: o.nome, exercicio: o.exercicio, cenario: o.cenario, versao: o.versao, linhas },
    });
    return buscar(orcamentoId);
  });
}

function buscar(id) {
  const o = repo.q('SELECT * FROM fin_orcamentos WHERE tenant_id = :tenant AND id = :id', { id })[0];
  if (!o) return null;
  const linhas = repo.q(
    `SELECT l.*, c.codigo AS conta_codigo, c.nome AS conta_nome, c.natureza, cc.codigo AS centro_codigo
       FROM fin_orcamento_linhas l
       JOIN fin_contas c ON c.id = l.conta_id
       LEFT JOIN fin_centros_custo cc ON cc.id = l.centro_custo_id AND cc.tenant_id = l.tenant_id
      WHERE l.tenant_id = :tenant AND l.orcamento_id = :o
      ORDER BY l.competencia, c.codigo`, { o: id });
  return {
    id: o.id, nome: o.nome, exercicio: o.exercicio, versao: o.versao, cenario: o.cenario,
    status: o.status, aprovadoEm: o.aprovado_em, aprovadoPor: o.aprovado_por,
    totalCents: linhas.reduce((s, l) => s + l.valor_cents, 0),
    linhas: linhas.map(l => ({
      contaId: l.conta_id, contaCodigo: l.conta_codigo, contaNome: l.conta_nome, natureza: l.natureza,
      centroCustoId: l.centro_custo_id, centroCodigo: l.centro_codigo || '',
      competencia: l.competencia, valorCents: l.valor_cents, memo: l.memo,
    })),
  };
}

const listar = (entidadeId, { exercicio = '', status = '' } = {}) => repo.q(
  `SELECT o.*, (SELECT COUNT(*) FROM fin_orcamento_linhas l WHERE l.tenant_id = o.tenant_id AND l.orcamento_id = o.id) AS linhas,
          (SELECT COALESCE(SUM(l.valor_cents),0) FROM fin_orcamento_linhas l WHERE l.tenant_id = o.tenant_id AND l.orcamento_id = o.id) AS total
     FROM fin_orcamentos o
    WHERE o.tenant_id = :tenant AND o.entidade_id = :ent
      ${exercicio ? 'AND o.exercicio = :ex' : ''} ${status ? 'AND o.status = :status' : ''}
    ORDER BY o.exercicio DESC, o.cenario, o.versao DESC`,
  { ent: entidadeId, ex: exercicio, status }).map(o => ({
    id: o.id, nome: o.nome, exercicio: o.exercicio, versao: o.versao, cenario: o.cenario,
    status: o.status, linhas: o.linhas, totalCents: o.total, total: dinheiro.formatar(o.total),
  }));

/**
 * Orçado × realizado da competência (ou do exercício até ela).
 *
 * O sinal do desvio segue a natureza: gastar menos que o orçado é
 * FAVORÁVEL; faturar menos é desfavorável. O campo `favoravel` responde
 * isso direto, para a tela não ter de traduzir.
 */
function realizado(entidadeId, { orcamentoId, competencia, acumulado = false }) {
  const o = orcamentoId
    ? repo.q('SELECT * FROM fin_orcamentos WHERE tenant_id = :tenant AND id = :id', { id: orcamentoId })[0]
    : repo.q(
      `SELECT * FROM fin_orcamentos WHERE tenant_id = :tenant AND entidade_id = :ent
         AND exercicio = :ex AND status = 'aprovado' AND cenario = 'base'
       ORDER BY versao DESC LIMIT 1`,
      { ent: entidadeId, ex: String(competencia || '').slice(0, 4) })[0];
  if (!o) {
    throw new ErroDeOrcamento(
      'Não há orçamento aprovado para este exercício. Crie uma versão e aprove antes de comparar.');
  }
  if (!RE_COMP.test(String(competencia || ''))) throw new ErroDeOrcamento('Competência inválida (use AAAA-MM).');

  const orcadas = repo.q(
    `SELECT l.conta_id, l.centro_custo_id, SUM(l.valor_cents) AS orcado
       FROM fin_orcamento_linhas l
      WHERE l.tenant_id = :tenant AND l.orcamento_id = :o
        ${acumulado ? 'AND l.competencia <= :comp' : 'AND l.competencia = :comp'}
      GROUP BY l.conta_id, l.centro_custo_id`,
    { o: o.id, comp: competencia });

  const [ano, mes] = competencia.split('-').map(Number);
  const desde = acumulado ? `${o.exercicio}-01-01` : `${competencia}-01`;
  const ate = `${competencia}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, '0')}`;

  const reais = repo.q(
    `SELECT l.conta_id, COALESCE(NULLIF(l.centro_custo_id,''),'') AS cc,
            COALESCE(SUM(l.debito_cents),0) AS deb, COALESCE(SUM(l.credito_cents),0) AS cred
       FROM fin_linhas l
       JOIN fin_lotes b ON b.id = l.lote_id AND b.status <> 'rascunho'
      WHERE l.tenant_id = :tenant AND b.entidade_id = :ent AND b.data >= :desde AND b.data <= :ate
      GROUP BY l.conta_id, cc`,
    { ent: entidadeId, desde, ate });

  const mapaReal = new Map();
  for (const r of reais) mapaReal.set(`${r.conta_id}|${r.cc}`, r);

  const chaves = new Set([
    ...orcadas.map(l => `${l.conta_id}|${l.centro_custo_id}`),
    ...reais.map(r => `${r.conta_id}|${r.cc}`),
  ]);

  const linhas = [];
  for (const chave of chaves) {
    const [contaId, cc] = chave.split('|');
    const conta = repo.contaPorId(contaId);
    if (!conta || !['receita', 'despesa'].includes(conta.natureza)) continue;  // orçamento é de resultado
    const orcado = (orcadas.find(l => l.conta_id === contaId && l.centro_custo_id === cc) || {}).orcado || 0;
    const r = mapaReal.get(chave) || { deb: 0, cred: 0 };
    const real = conta.saldo_normal === 'devedora' ? r.deb - r.cred : r.cred - r.deb;
    if (!orcado && !real) continue;

    const desvio = real - orcado;
    const centro = cc ? repo.centroCustoPorId(cc) : null;
    linhas.push({
      contaId, contaCodigo: conta.codigo, contaNome: conta.nome, natureza: conta.natureza,
      centroCustoId: cc, centroCodigo: centro ? centro.codigo : '',
      orcadoCents: orcado, realizadoCents: real, desvioCents: desvio,
      orcado: dinheiro.formatar(orcado), realizado: dinheiro.formatar(real), desvio: dinheiro.formatar(desvio),
      percentual: orcado ? Math.round(1000 * desvio / orcado) / 10 : null,
      // Despesa abaixo do orçado é bom; receita abaixo do orçado é ruim.
      favoravel: conta.natureza === 'despesa' ? desvio <= 0 : desvio >= 0,
    });
  }
  linhas.sort((a, b) => Math.abs(b.desvioCents) - Math.abs(a.desvioCents));

  const somaPor = (natureza, campo) => linhas.filter(l => l.natureza === natureza).reduce((s, l) => s + l[campo], 0);
  const receitaOrcada = somaPor('receita', 'orcadoCents');
  const receitaReal = somaPor('receita', 'realizadoCents');
  const despesaOrcada = somaPor('despesa', 'orcadoCents');
  const despesaReal = somaPor('despesa', 'realizadoCents');

  return {
    orcamento: { id: o.id, nome: o.nome, exercicio: o.exercicio, versao: o.versao, cenario: o.cenario, status: o.status },
    competencia, acumulado, desde, ate,
    linhas,
    resumo: {
      receitaOrcadaCents: receitaOrcada, receitaRealizadaCents: receitaReal,
      despesaOrcadaCents: despesaOrcada, despesaRealizadaCents: despesaReal,
      resultadoOrcadoCents: receitaOrcada - despesaOrcada,
      resultadoRealizadoCents: receitaReal - despesaReal,
      desvioResultadoCents: (receitaReal - despesaReal) - (receitaOrcada - despesaOrcada),
    },
    // Os cinco desvios que mais pesam, que é o que alguém realmente lê.
    maioresDesvios: linhas.slice(0, 5).map(l => ({
      conta: `${l.contaCodigo} ${l.contaNome}`,
      desvio: l.desvio, percentual: l.percentual, favoravel: l.favoravel,
    })),
    origem: {
      formula: acumulado
        ? 'orçado acumulado do exercício até a competência × realizado no razão no mesmo intervalo'
        : 'orçado da competência × realizado no razão na competência',
      fonte: `orçamento "${o.nome}" v${o.versao} (${o.cenario}) × razão`,
      convencao: 'desvio = realizado − orçado. Em despesa, desvio negativo é favorável; em receita, é desfavorável.',
    },
  };
}

module.exports = { ErroDeOrcamento, CENARIOS, criar, definirLinhas, aprovar, buscar, listar, realizado };
