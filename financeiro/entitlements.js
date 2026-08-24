// =====================================================================
// Villela Finance — planos, módulos e limites (o que cada conta pode).
//
// Regra do produto: o gate NUNCA bloqueia leitura do que já é do cliente.
// Uma conta suspensa por inadimplência continua vendo e exportando o
// próprio razão — o que ela perde é lançar, importar e conciliar. Dado
// contábil retido é problema jurídico, não alavanca comercial.
// =====================================================================
'use strict';
const { j } = require('./db');
const repo = require('./repo');

const MODULOS = [
  { id: 'razao', nome: 'Razão e plano de contas', essencial: true },
  { id: 'bancos', nome: 'Extrato e conciliação bancária' },
  { id: 'pagar', nome: 'Contas a pagar' },
  { id: 'receber', nome: 'Contas a receber e cobrança' },
  { id: 'fechamento', nome: 'Fechamento e relatórios contábeis' },
  { id: 'aprovacoes', nome: 'Aprovações e alçadas' },
  { id: 'centros', nome: 'Centros de custo e resultado por projeto' },
  { id: 'hospitalidade', nome: 'Vertical de hospedagem (imóveis, canais, repasses)' },
  { id: 'orcamento', nome: 'Orçamento e previsão' },
  { id: 'cfo', nome: 'CFO inteligente (anomalias, previsão de caixa)' },
  { id: 'multiempresa', nome: 'Multiempresa e consolidação' },
  { id: 'api', nome: 'API e integrações' },
];

const LIMITES = ['entidades', 'usuarios', 'contas_bancarias', 'lancamentos_mes', 'transacoes_mes'];

const PLANOS_SEMENTE = [
  { slug: 'trial', nome: 'Avaliação', precoCents: 0, ordem: 0, publico: false,
    modulos: ['razao', 'bancos', 'pagar', 'receber', 'fechamento', 'centros'],
    limites: { entidades: 1, usuarios: 2, contas_bancarias: 2, lancamentos_mes: 300, transacoes_mes: 500 },
    flags: {} },
  { slug: 'essencial', nome: 'Essencial', precoCents: 14900, ordem: 1,
    modulos: ['razao', 'bancos', 'pagar', 'receber', 'fechamento', 'centros'],
    limites: { entidades: 1, usuarios: 3, contas_bancarias: 3, lancamentos_mes: 1000, transacoes_mes: 2000 },
    flags: {} },
  { slug: 'controle', nome: 'Controle', precoCents: 34900, ordem: 2,
    modulos: ['razao', 'bancos', 'pagar', 'receber', 'fechamento', 'centros', 'aprovacoes', 'orcamento', 'hospitalidade'],
    limites: { entidades: 3, usuarios: 10, contas_bancarias: 10, lancamentos_mes: 5000, transacoes_mes: 10000 },
    flags: { alcadas: true } },
  { slug: 'gestao', nome: 'Gestão', precoCents: 79900, ordem: 3,
    modulos: MODULOS.map(m => m.id),
    limites: { entidades: 10, usuarios: 30, contas_bancarias: 30, lancamentos_mes: 25000, transacoes_mes: 50000 },
    flags: { alcadas: true, api_publica: true } },
  { slug: 'enterprise', nome: 'Enterprise', precoCents: 0, ordem: 4, publico: false,
    modulos: MODULOS.map(m => m.id),
    limites: { entidades: 0, usuarios: 0, contas_bancarias: 0, lancamentos_mes: 0, transacoes_mes: 0 }, // 0 = sem limite
    flags: { alcadas: true, api_publica: true, sso: true, tenant_dedicado: true } },
];

class ErroDePlano extends Error {
  constructor(msg, detalhe) { super(msg); this.name = 'ErroDePlano'; this.status = 402; this.detalhe = detalhe || null; }
}

/** Semeia/atualiza os planos. Preço NUNCA é sobrescrito depois de criado. */
function semear() {
  let criados = 0;
  for (const p of PLANOS_SEMENTE) {
    const antes = repo.planoPorSlug(p.slug);
    repo.upsertPlano(p);
    if (!antes) criados++;
  }
  return { criados, total: repo.listarPlanos().length };
}

/** Resolve o que a conta pode: plano + overrides. */
function resolver(tenant) {
  if (!tenant) throw new ErroDePlano('Conta não encontrada.');
  const plano = tenant.plano_id ? repo.planoPorId(tenant.plano_id) : repo.planoPorSlug('trial');
  const base = plano || { modulos: '[]', limites: '{}', flags: '{}', slug: 'trial', nome: 'Avaliação' };
  const overrides = j.parse(tenant.overrides, {}) || {};

  const modulos = new Set(j.parse(base.modulos, []) || []);
  for (const m of overrides.modulosMais || []) modulos.add(m);
  for (const m of overrides.modulosMenos || []) modulos.delete(m);

  const limites = Object.assign({}, j.parse(base.limites, {}) || {}, overrides.limites || {});
  const flags = Object.assign({}, j.parse(base.flags, {}) || {}, overrides.flags || {});

  // Conta interna do grupo: cortesia vitalícia, mais forte que status
  // (mesma regra do resto do portfólio).
  const cortesia = tenant.interno === 1;
  const bloqueiaEscrita = !cortesia && ['suspensa', 'cancelada'].includes(tenant.status);

  return {
    planoSlug: base.slug, planoNome: base.nome,
    modulos: [...modulos], limites, flags,
    status: tenant.status, cortesia, bloqueiaEscrita,
  };
}

/** Módulo liberado? Leitura nunca depende disto. */
function temModulo(tenant, modulo) {
  const e = resolver(tenant);
  return e.modulos.includes(modulo);
}

/**
 * Conta quanto a conta já consumiu de uma medida. Exige contexto de tenant
 * (é chamada de dentro da rota, que já abriu o contexto).
 *
 * Sem isto, `limites` seria decoração: o plano diria "3 contas bancárias" e o
 * sistema deixaria criar trinta.
 */
function medir(medida) {
  const mes = new Date().toISOString().slice(0, 7);
  switch (medida) {
    case 'entidades':
      return repo.q('SELECT COUNT(*) AS n FROM fin_entidades WHERE tenant_id = :tenant', {})[0].n;
    case 'usuarios':
      return repo.q("SELECT COUNT(*) AS n FROM tenant_users WHERE tenant_id = :tenant AND status = 'ativo'", {})[0].n;
    case 'contas_bancarias':
      return repo.q("SELECT COUNT(*) AS n FROM fin_contas_bancarias WHERE tenant_id = :tenant AND status = 'ativa'", {})[0].n;
    case 'lancamentos_mes':
      return repo.q('SELECT COUNT(*) AS n FROM fin_lotes WHERE tenant_id = :tenant AND competencia = :mes', { mes })[0].n;
    case 'transacoes_mes':
      return repo.q("SELECT COUNT(*) AS n FROM fin_transacoes_banco WHERE tenant_id = :tenant AND substr(criado_em, 1, 7) = :mes", { mes })[0].n;
    default:
      return 0;
  }
}

/**
 * Guarda de escrita. Chame antes de qualquer ação que grave.
 * `medida` confere o limite de volume; a quantidade é CONTADA se não vier
 * explícita (só os testes passam o número à mão).
 */
function exigir(tenant, modulo, { medida = '', quantidadeAtual = null } = {}) {
  const e = resolver(tenant);
  if (e.bloqueiaEscrita) {
    throw new ErroDePlano(
      `A conta está ${e.status}. A leitura e a exportação continuam liberadas; para voltar a lançar, regularize a assinatura.`,
      { status: e.status });
  }
  if (modulo && !e.modulos.includes(modulo)) {
    const m = MODULOS.find(x => x.id === modulo);
    throw new ErroDePlano(
      `O módulo "${m ? m.nome : modulo}" não está no plano ${e.planoNome}.`,
      { modulo, plano: e.planoSlug });
  }
  if (medida) {
    const limite = Number(e.limites[medida] || 0);
    if (limite > 0) {
      const atual = quantidadeAtual == null ? medir(medida) : quantidadeAtual;
      if (atual >= limite) {
        throw new ErroDePlano(
          `Limite do plano ${e.planoNome} atingido: ${limite} ${medida.replace(/_/g, ' ')}. Faça upgrade para continuar.`,
          { medida, limite, atual });
      }
    }
  }
  return e;
}

module.exports = { MODULOS, LIMITES, PLANOS_SEMENTE, ErroDePlano, semear, resolver, temModulo, exigir, medir };
