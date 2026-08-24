// =====================================================================
// Villela Finance — relatórios. Todos saem do RAZÃO, nunca de soma solta.
//
// Regra de UX que virou regra de código: todo número devolvido por este
// arquivo traz `origem` — a fórmula e as contas que o compõem — e um
// caminho de drill-down. Um KPI que não sabe explicar de onde veio não
// deveria estar na tela.
// =====================================================================
'use strict';
const repo = require('./repo');
const ledger = require('./ledger');
const dinheiro = require('./dinheiro');

const RE_COMP = /^\d{4}-\d{2}$/;

/** Primeiro e último dia da competência (fim de mês correto). */
function intervalo(competencia) {
  if (!RE_COMP.test(competencia)) throw new Error('Competência inválida (use AAAA-MM).');
  const [ano, mes] = competencia.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { desde: `${competencia}-01`, ate: `${competencia}-${String(ultimo).padStart(2, '0')}` };
}

/** Soma os saldos das contas cujo código começa por um dos prefixos. */
function somarPrefixos(linhas, prefixos) {
  const contas = linhas.filter(l => prefixos.some(p => l.codigo.startsWith(p)));
  return {
    valorCents: contas.reduce((s, l) => s + l.saldoCents, 0),
    contas: contas.map(l => ({ contaId: l.contaId, codigo: l.codigo, nome: l.nome, valorCents: l.saldoCents })),
  };
}

/**
 * DRE da competência. As deduções (3.2) já têm saldo devedor, então
 * entram somando — a conta é "receita bruta − deduções", e cada bloco
 * abre nas contas que o formaram.
 */
function dre(entidadeId, competencia) {
  const { desde, ate } = intervalo(competencia);
  const b = ledger.balancete(entidadeId, { desde, ate });

  const receitaBruta = somarPrefixos(b.linhas, ['3.1', '3.9']);
  const deducoes = somarPrefixos(b.linhas, ['3.2']);
  const despOperacional = somarPrefixos(b.linhas, ['4.1']);
  const despAdmin = somarPrefixos(b.linhas, ['4.2']);
  const despComercial = somarPrefixos(b.linhas, ['4.3']);
  const despFinanceira = somarPrefixos(b.linhas, ['4.4']);
  const despOutras = somarPrefixos(b.linhas, ['4.9']);

  const receitaLiquida = receitaBruta.valorCents - deducoes.valorCents;
  const despesaTotal = despOperacional.valorCents + despAdmin.valorCents +
    despComercial.valorCents + despFinanceira.valorCents + despOutras.valorCents;
  const resultado = receitaLiquida - despesaTotal;

  const bloco = (rotulo, dado, formula) => ({
    rotulo, valorCents: dado.valorCents, valor: dinheiro.formatar(dado.valorCents),
    contas: dado.contas, origem: { formula, periodo: `${desde} a ${ate}`, fonte: 'razão (lotes contabilizados)' },
  });

  return {
    competencia, desde, ate,
    linhas: [
      bloco('Receita bruta', receitaBruta, 'soma das contas 3.1 e 3.9'),
      bloco('(−) Deduções da receita', deducoes, 'soma das contas 3.2 (comissões, taxas, cancelamentos, impostos)'),
      { rotulo: 'Receita líquida', valorCents: receitaLiquida, valor: dinheiro.formatar(receitaLiquida), destaque: true,
        origem: { formula: 'receita bruta − deduções', periodo: `${desde} a ${ate}`, fonte: 'razão' } },
      bloco('(−) Despesas das propriedades', despOperacional, 'soma das contas 4.1'),
      bloco('(−) Despesas administrativas', despAdmin, 'soma das contas 4.2'),
      bloco('(−) Comercial e marketing', despComercial, 'soma das contas 4.3'),
      bloco('(−) Despesas financeiras', despFinanceira, 'soma das contas 4.4'),
      bloco('(−) Outras despesas', despOutras, 'soma das contas 4.9'),
      { rotulo: 'Resultado do período', valorCents: resultado, valor: dinheiro.formatar(resultado), destaque: true,
        origem: { formula: 'receita líquida − despesas', periodo: `${desde} a ${ate}`, fonte: 'razão' } },
    ],
    resumo: {
      receitaBrutaCents: receitaBruta.valorCents,
      deducoesCents: deducoes.valorCents,
      receitaLiquidaCents: receitaLiquida,
      despesaTotalCents: despesaTotal,
      resultadoCents: resultado,
      margem: receitaLiquida ? Math.round(1000 * resultado / receitaLiquida) / 10 : null,
    },
  };
}

/**
 * Resultado por centro de custo (o "DRE por imóvel" que hoje o Portal
 * Staff calcula de cabeça). Aqui ele sai do razão e cada linha abre.
 */
function porCentroCusto(entidadeId, competencia) {
  const { desde, ate } = intervalo(competencia);
  const brutos = repo.resultadoPorCentro(entidadeId, { desde, ate });
  const centros = new Map();
  for (const c of repo.listarCentrosCusto(entidadeId)) centros.set(c.id, c);

  const agregado = new Map();
  for (const r of brutos) {
    const chave = r.centro_id;
    if (!agregado.has(chave)) agregado.set(chave, { receitaCents: 0, despesaCents: 0 });
    const alvo = agregado.get(chave);
    // Receita: crédito − débito (dedução é débito e entra abatendo).
    if (r.natureza === 'receita') alvo.receitaCents += r.credito - r.debito;
    else alvo.despesaCents += r.debito - r.credito;
  }

  const linhas = [...agregado.entries()].map(([id, v]) => {
    const centro = centros.get(id);
    const resultado = v.receitaCents - v.despesaCents;
    return {
      centroId: id,
      codigo: centro ? centro.codigo : '(sem centro)',
      nome: centro ? centro.nome : 'Sem centro de custo',
      externoId: centro ? centro.externo_id : '',
      receitaCents: v.receitaCents,
      despesaCents: v.despesaCents,
      resultadoCents: resultado,
      margem: v.receitaCents ? Math.round(1000 * resultado / v.receitaCents) / 10 : null,
    };
  }).sort((a, b) => b.resultadoCents - a.resultadoCents);

  const total = linhas.reduce((s, l) => ({
    receitaCents: s.receitaCents + l.receitaCents,
    despesaCents: s.despesaCents + l.despesaCents,
    resultadoCents: s.resultadoCents + l.resultadoCents,
  }), { receitaCents: 0, despesaCents: 0, resultadoCents: 0 });

  return {
    competencia, desde, ate, linhas, total,
    origem: { formula: 'receitas − despesas por centro de custo, do razão', fonte: 'lotes contabilizados' },
    aviso: linhas.some(l => l.centroId === '(sem centro)')
      ? 'Há lançamentos sem centro de custo — o resultado por imóvel está incompleto nessa parcela.'
      : '',
  };
}

/** Posição de caixa: saldo de cada conta bancária pelo razão. */
function posicaoDeCaixa(entidadeId, { ate } = {}) {
  const contas = repo.listarContasBancarias(entidadeId);
  const linhas = contas.map(cb => {
    const saldo = cb.conta_id ? ledger.saldo(cb.conta_id, { ate }) : null;
    return {
      contaBancariaId: cb.id, nome: cb.nome, banco: cb.banco, tipo: cb.tipo,
      contaContabil: saldo ? saldo.codigo : '',
      saldoCents: saldo ? saldo.saldoCents : 0,
      saldo: dinheiro.formatar(saldo ? saldo.saldoCents : 0),
      semContaContabil: !cb.conta_id,
    };
  });
  const total = linhas.reduce((s, l) => s + l.saldoCents, 0);
  return {
    ate: ate || 'hoje', linhas,
    totalCents: total, total: dinheiro.formatar(total),
    origem: { formula: 'saldo das contas contábeis espelho das contas bancárias', fonte: 'razão' },
  };
}

/**
 * Cockpit: os números que abrem o dia, cada um com o caminho de
 * drill-down que a tela deve oferecer.
 */
function cockpit(entidadeId, competencia) {
  const { desde, ate } = intervalo(competencia);
  const r = dre(entidadeId, competencia);
  const caixa = posicaoDeCaixa(entidadeId, {});
  const balanco = ledger.conferirBalanceamento(entidadeId);

  const pendentes = repo.contarTransacoes(entidadeId);
  const porStatus = Object.fromEntries(pendentes.map(p => [p.status, p.n]));
  const aConciliar = (porStatus.nova || 0) + (porStatus.sugerida || 0);
  const conciliadas = porStatus.conciliada || 0;
  const totalTransacoes = pendentes.reduce((s, p) => s + p.n, 0);

  const vencendo = repo.q(
    `SELECT p.*, t.especie, t.descricao FROM fin_parcelas p
       JOIN fin_titulos t ON t.id = p.titulo_id AND t.tenant_id = p.tenant_id
      WHERE p.tenant_id = :tenant AND t.entidade_id = :ent AND p.status IN ('aberta','parcial')
      ORDER BY p.vencimento LIMIT 200`, { ent: entidadeId });
  const hoje = new Date().toISOString().slice(0, 10);
  const aPagar = vencendo.filter(p => p.especie === 'pagar');
  const aReceber = vencendo.filter(p => p.especie === 'receber');
  const soma = (lista, filtro) => lista.filter(filtro).reduce((s, p) => s + (p.valor_cents - p.pago_cents), 0);

  return {
    competencia,
    kpis: [
      { chave: 'resultado', rotulo: 'Resultado do mês', valorCents: r.resumo.resultadoCents,
        valor: dinheiro.formatar(r.resumo.resultadoCents),
        origem: { formula: 'receita líquida − despesas', fonte: 'razão', periodo: `${desde} a ${ate}` },
        drill: { tipo: 'dre', competencia } },
      { chave: 'receita_liquida', rotulo: 'Receita líquida', valorCents: r.resumo.receitaLiquidaCents,
        valor: dinheiro.formatar(r.resumo.receitaLiquidaCents),
        origem: { formula: 'contas 3.1 e 3.9 menos as 3.2', fonte: 'razão' },
        drill: { tipo: 'dre', competencia } },
      { chave: 'caixa', rotulo: 'Caixa hoje', valorCents: caixa.totalCents, valor: caixa.total,
        origem: caixa.origem, drill: { tipo: 'caixa' } },
      { chave: 'a_pagar_vencido', rotulo: 'A pagar vencido', valorCents: soma(aPagar, p => p.vencimento < hoje),
        valor: dinheiro.formatar(soma(aPagar, p => p.vencimento < hoje)),
        origem: { formula: 'parcelas a pagar em aberto com vencimento anterior a hoje', fonte: 'contas a pagar' },
        drill: { tipo: 'titulos', especie: 'pagar', filtro: 'vencido' }, alerta: true },
      { chave: 'a_receber_vencido', rotulo: 'A receber vencido', valorCents: soma(aReceber, p => p.vencimento < hoje),
        valor: dinheiro.formatar(soma(aReceber, p => p.vencimento < hoje)),
        origem: { formula: 'parcelas a receber em aberto com vencimento anterior a hoje', fonte: 'contas a receber' },
        drill: { tipo: 'titulos', especie: 'receber', filtro: 'vencido' }, alerta: true },
    ],
    saude: {
      razaoBalanceado: balanco.ok,
      diferencaCents: balanco.diferencaCents,
      transacoesAConciliar: aConciliar,
      taxaConciliacao: totalTransacoes ? Math.round(1000 * conciliadas / totalTransacoes) / 10 : null,
      // "95% de correspondência automática" só é verificável se a taxa
      // aparecer na tela desde o primeiro dia.
      origem: { formula: 'conciliadas ÷ total de transações importadas', fonte: 'extrato importado' },
    },
    exigeAtencao: [
      ...(balanco.ok ? [] : [{ tipo: 'razao_desbalanceado', gravidade: 'critica', texto: `Razão desbalanceado em ${dinheiro.formatar(balanco.diferencaCents)}.` }]),
      ...(aConciliar ? [{ tipo: 'a_conciliar', gravidade: 'media', texto: `${aConciliar} transação(ões) bancária(s) sem classificação.` }] : []),
      ...(caixa.linhas.some(l => l.semContaContabil) ? [{ tipo: 'conta_sem_espelho', gravidade: 'alta', texto: 'Há conta bancária sem conta contábil ligada — ela não entra no razão.' }] : []),
    ],
  };
}

module.exports = { dre, porCentroCusto, posicaoDeCaixa, cockpit, intervalo, somarPrefixos };
