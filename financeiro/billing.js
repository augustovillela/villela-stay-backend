// =====================================================================
// Villela Finance — assinatura e cobrança recorrente (Mercado Pago).
//
// Mesmo modelo do resto do portfólio: preapproval MENSAL hospedado no MP,
// `mpFetch` injetado pelo server.js. Sem MP configurado, o produto NÃO
// fica sem cobrança — o painel da plataforma lança pagamento à mão (Pix,
// boleto, transferência), que é como um contrato B2B começa na prática.
//
// Três regras deste produto que NÃO vêm do padrão dos outros:
//
//   1. **Inadimplência não sequestra dado contábil.** A escada é
//      trial vencido → inadimplente (ainda lança, com aviso) → suspensa
//      (não lança), e a conta suspensa CONTINUA lendo e exportando o
//      próprio razão. Reter razão de terceiro para forçar pagamento é
//      problema jurídico, não alavanca comercial (entitlements.js).
//   2. **Conta interna do grupo nunca entra na régua.** `interno = 1` é
//      cortesia vitalícia; o ciclo diário a ignora explicitamente. Sem
//      isto, a primeira rodada de dunning suspenderia a contabilidade da
//      própria casa — e o razão do Augusto pararia por "inadimplência".
//   3. **Todo evento de cobrança entra na auditoria encadeada**, com
//      motivo. Mudar o status de uma conta é ato administrativo: quem
//      auditar precisa ver quem, quando e por quê.
// =====================================================================
'use strict';
const { nowISO } = require('./db');
const repo = require('./repo');
const tenancy = require('./tenancy');
const webhookMP = require('../nucleo/webhook-mp');
const auditoria = require('./auditoria');
const entitlements = require('./entitlements');
const dinheiro = require('./dinheiro');

class ErroDeCobranca extends Error {
  constructor(msg, status = 400) { super(msg); this.name = 'ErroDeCobranca'; this.status = status; }
}

// Dias de tolerância entre "inadimplente" e "suspensa". Generoso de
// propósito: o custo de suspender um cliente que ia pagar é maior que o
// de esperar mais uma semana.
const DIAS_ATE_SUSPENDER = Number(process.env.FINANCE_DIAS_SUSPENSAO) || 15;

let _mpFetch = null;
let _notificar = async () => {};
// O back_url e o notification_url apontam para ESTE backend, não para o
// site institucional: é aqui que a rota do webhook existe.
let _baseUrl = 'https://villela-stay-backend.onrender.com';

function configurar({ mpFetch, notificar, baseUrl } = {}) {
  if (mpFetch) _mpFetch = mpFetch;
  if (notificar) _notificar = (m) => Promise.resolve(notificar(m)).catch(() => {});
  if (baseUrl) _baseUrl = String(baseUrl).replace(/\/+$/, '');
  return { ativo: ativo() };
}

const ativo = () => !!(_mpFetch && (process.env.MP_ACCESS_TOKEN || _mpFetch.__mock));

async function mp(caminho, opts) {
  if (!_mpFetch) throw new ErroDeCobranca('Pagamento online não está configurado neste servidor.', 503);
  return _mpFetch(caminho, opts);
}

const competenciaDeHoje = () => new Date().toISOString().slice(0, 7);

// ------------------------------------------------------------- leitura

/**
 * O que o assinante vê na aba "Assinatura". Exige contexto de tenant.
 * Traz por escrito o que ele perde se não pagar — e o que não perde: a
 * tela de cobrança que esconde a consequência é a que gera disputa.
 */
function estado(tenant) {
  const e = entitlements.resolver(tenant);
  const sub = repo.assinaturaVigente();
  const plano = tenant.plano_id ? repo.planoPorId(tenant.plano_id) : null;
  return {
    conta: { status: tenant.status, cortesia: e.cortesia, trialAte: tenant.trial_ate || '' },
    plano: plano ? {
      slug: plano.slug, nome: plano.nome,
      precoCents: plano.preco_cents, preco: dinheiro.formatar(plano.preco_cents),
    } : null,
    assinatura: sub ? {
      id: sub.id, status: sub.status, inicio: sub.inicio, fim: sub.fim || '',
      recorrenciaOnline: !!sub.externo_ref,
    } : null,
    faturas: repo.listarInvoices(12).map(f => ({
      competencia: f.competencia, valorCents: f.valor_cents, valor: dinheiro.formatar(f.valor_cents),
      status: f.status, vencimento: f.vencimento, pagoEm: f.pago_em,
    })),
    planosDisponiveis: repo.listarPlanos()
      .filter(p => p.publico === 1 && p.preco_cents > 0)
      .map(p => ({ slug: p.slug, nome: p.nome, precoCents: p.preco_cents, preco: dinheiro.formatar(p.preco_cents) })),
    pagamentoOnline: ativo(),
    consequencias: {
      escrita: e.bloqueiaEscrita ? 'bloqueada' : 'liberada',
      leituraEExportacao: 'sempre liberadas, inclusive com a conta suspensa',
      prazoAteSuspender: `${DIAS_ATE_SUSPENDER} dias depois de vencer`,
    },
  };
}

// ------------------------------------------------------------ assinar

/**
 * Inicia a assinatura online e devolve o link do checkout do MP. Grava a
 * assinatura como `pendente`: quem a promove a `ativa` é o webhook,
 * quando o MP autoriza. Marcar ativa aqui seria acreditar na intenção.
 */
async function assinar(tenant, planoSlug, { email = '', baseUrl = '' } = {}) {
  if (!ativo()) {
    throw new ErroDeCobranca(
      'O pagamento online ainda não está ligado. Fale com o suporte para receber a cobrança por Pix ou boleto.', 503);
  }
  const plano = repo.planoPorSlug(String(planoSlug || ''));
  if (!plano || plano.publico !== 1 || !plano.preco_cents) {
    throw new ErroDeCobranca('Plano inválido para assinatura online.');
  }
  const vigente = repo.assinaturaVigente();
  if (vigente && vigente.externo_ref && vigente.status === 'ativa') {
    throw new ErroDeCobranca(
      'Já existe uma assinatura ativa. Para trocar de plano, cancele a atual e assine de novo — é limitação da recorrência do Mercado Pago.');
  }
  // `notification_url` vai NO PREAPPROVAL, e não é detalhe: a configuração de
  // webhook do painel "Suas integrações" do Mercado Pago **não cobre
  // assinaturas** — para elas, a URL só existe se for enviada aqui. Sem esta
  // linha, o MP autorizaria a assinatura e nunca nos avisaria, e a conta
  // ficaria `pendente` para sempre. Mesmo padrão do vdocs e da livraria.
  const base = (baseUrl || _baseUrl).replace(/\/+$/, '');
  const pre = await mp('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: `Villela Finance — plano ${plano.nome}`,
      external_reference: `finance:${tenant.id}:${plano.slug}`,
      payer_email: email || tenant.contato_email,
      back_url: `${base}/finance`,
      notification_url: `${base}/finance/webhooks/mercadopago`,
      auto_recurring: {
        frequency: 1, frequency_type: 'months',
        transaction_amount: Number((plano.preco_cents / 100).toFixed(2)),
        currency_id: 'BRL',
      },
      status: 'pending',
    }),
  });

  const sub = repo.criarAssinatura({ planoId: plano.id, status: 'pendente', externoRef: String(pre.id) });
  repo.atualizarTenant(tenant.id, { plano_id: plano.id });
  auditoria.registrar('assinatura.iniciar', {
    objetoTipo: 'assinatura', objetoId: sub.id,
    motivo: `assinatura do plano ${plano.slug}`,
    detalhe: { plano: plano.slug, precoCents: plano.preco_cents, preapproval: String(pre.id) },
  });
  repo.publicarEvento({ tipo: 'billing.preapproval_criada', payload: { assinaturaId: sub.id, plano: plano.slug } });
  return { link: pre.init_point || pre.sandbox_init_point, assinaturaId: sub.id, plano: plano.slug };
}

/** Cancela. O MP pode recusar (rede, id vencido) — o registro local vale assim mesmo, e o aviso sai junto. */
async function cancelar(tenant, { motivo = 'cancelamento pedido pelo assinante' } = {}) {
  const sub = repo.assinaturaVigente();
  if (!sub) throw new ErroDeCobranca('Não há assinatura vigente para cancelar.');
  let mpOk = true;
  if (sub.externo_ref && ativo()) {
    try { await mp(`/preapproval/${sub.externo_ref}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }); }
    catch (_) { mpOk = false; }
  }
  repo.atualizarAssinatura(sub.id, { status: 'cancelada', fim: nowISO() });
  mudarStatusDaConta(tenant.id, 'cancelada', motivo);
  auditoria.registrar('assinatura.cancelar', {
    objetoTipo: 'assinatura', objetoId: sub.id, motivo,
    detalhe: { canceladaNoMercadoPago: mpOk },
  });
  return {
    ok: true, canceladaNoMercadoPago: mpOk,
    aviso: mpOk ? '' : 'Cancelamos aqui, mas o Mercado Pago não confirmou — confira a recorrência na conta do MP.',
    leitura: 'Os dados continuam disponíveis para leitura e exportação.',
  };
}

// ------------------------------------------------------ estado da conta

/**
 * Muda o status da conta, com auditoria. Conta interna é cortesia
 * vitalícia: cobrança e dunning não mexem nela — só a reativação passa.
 */
function mudarStatusDaConta(tenantId, status, motivo) {
  const t = repo.tenantPorId(tenantId);
  if (!t) return null;
  if (t.interno === 1 && status !== 'ativa') {
    return { ignorado: true, motivo: 'conta interna do grupo — cortesia vitalícia' };
  }
  if (t.status === status) return { ignorado: true, motivo: 'já estava neste status' };
  const campos = { status };
  if (status === 'cancelada') campos.cancelado_em = nowISO();
  repo.atualizarTenant(tenantId, campos);
  auditoria.registrar('tenant.status', {
    objetoTipo: 'tenant', objetoId: tenantId, motivo,
    detalhe: { de: t.status, para: status },
  });
  return { de: t.status, para: status };
}

// ------------------------------------------------------------- webhook

/**
 * Aplica o resultado de um preapproval. Chamado com contexto de tenant.
 * `authorized` reenviado não gera fatura nem alerta de novo — o MP repete
 * notificação, e fatura duplicada é erro que o cliente vê.
 */
function aplicarPreapproval(tenantId, ref, statusMP) {
  const sub = repo.assinaturaVigente()
    || repo.listarAssinaturas(10).find(s => s.externo_ref === String(ref));
  if (!sub) return { resultado: 'sem-assinatura' };

  if (statusMP === 'authorized') {
    const jaAtiva = sub.status === 'ativa';
    repo.atualizarAssinatura(sub.id, { status: 'ativa' });
    mudarStatusDaConta(tenantId, 'ativa', 'assinatura autorizada no Mercado Pago');
    if (!jaAtiva) {
      gerarFatura(tenantId, { status: 'paga', externoRef: `preapproval:${ref}` });
      const t = repo.tenantPorId(tenantId);
      _notificar(`💚 Villela Finance: novo assinante pagante — ${t ? t.nome : tenantId}.`);
    }
    return { resultado: jaAtiva ? 'ja-ativa' : 'ativada' };
  }

  if (statusMP === 'paused' || statusMP === 'cancelled') {
    const novo = statusMP === 'paused' ? 'inadimplente' : 'cancelada';
    repo.atualizarAssinatura(sub.id, { status: novo, fim: novo === 'cancelada' ? nowISO() : '' });
    mudarStatusDaConta(tenantId, novo, `preapproval ${statusMP} no Mercado Pago`);
    const t = repo.tenantPorId(tenantId);
    _notificar(`⚠️ Villela Finance: assinatura ${statusMP === 'paused' ? 'PAUSADA' : 'CANCELADA'} — ${t ? t.nome : tenantId}.`);
    return { resultado: novo };
  }
  return { resultado: 'ignorado', statusMP };
}

/** Pagamento recorrente aprovado. Idempotente pelo id do pagamento no MP. */
function registrarPagamento(tenantId, pagamentoId = '') {
  const ref = String(pagamentoId || '');
  if (ref && repo.invoicePorRefExterna(ref)) return { resultado: 'ja-registrado' };
  const sub = repo.assinaturaVigente();
  if (sub) repo.atualizarAssinatura(sub.id, { status: 'ativa' });
  mudarStatusDaConta(tenantId, 'ativa', 'pagamento recorrente confirmado');
  const fatura = gerarFatura(tenantId, { status: 'paga', externoRef: ref });
  auditoria.registrar('assinatura.pagamento', {
    objetoTipo: 'fatura', objetoId: fatura ? fatura.id : '',
    motivo: 'pagamento confirmado pelo Mercado Pago', detalhe: { pagamento: ref },
  });
  return { resultado: 'registrado', faturaId: fatura && fatura.id };
}

/**
 * Webhook do MP. Chega SEM sessão e SEM contexto: descobrir de qual conta
 * é passa por `comoPlataforma` (com motivo, que entra na trilha), e o
 * efeito roda dentro do contexto da conta encontrada.
 */
async function processarWebhook(body = {}, query = {}) {
  const tipo = body.type || query.type || body.topic || query.topic;
  const id = (body.data && body.data.id) || query['data.id'] || query.id;
  if (!id) return { ok: true, ignorado: 'sem id' };
  // F4: o id vai para dentro da URL da API do MP; sem isto um id com barra
  // navegava no caminho com a credencial da casa.
  if (!webhookMP.idSeguro(id)) return { ok: true, ignorado: 'id inválido' };

  if (tipo === 'subscription_preapproval' || tipo === 'preapproval') {
    const pre = await mp(`/preapproval/${id}`);
    const tenantId = tenantDoWebhook(String(pre.external_reference || ''), id);
    if (!tenantId) return { ok: true, ignorado: 'conta não encontrada' };
    return tenancy.comTenant({ tenantId, userId: 'mercadopago', perfil: 'plataforma' }, () => {
      const r = aplicarPreapproval(tenantId, id, pre.status);
      repo.publicarEvento({ tipo: 'webhook.mp.preapproval', payload: { id: String(id), status: pre.status, ...r } });
      return { ok: true, ...r };
    });
  }

  // A cobrança mensal de uma assinatura NÃO chega como `payment`: chega como
  // `subscription_authorized_payment`, e o recurso se lê em
  // /authorized_payments/{id}. Tratar só `payment` faria a primeira
  // autorização funcionar e todas as renovações passarem em branco — a conta
  // continuaria ativa (o MP cobra), mas sem fatura nenhuma do lado de cá.
  if (tipo === 'subscription_authorized_payment') {
    const aut = await mp(`/authorized_payments/${id}`);
    const tenantId = tenantDoWebhook('', aut.preapproval_id || '');
    if (!tenantId) return { ok: true, ignorado: 'conta não encontrada' };
    // `processed` é o estado em que o MP diz que a cobrança do período saiu.
    // `recycling`/`scheduled` são tentativa e agendamento — não são caixa.
    const pago = aut.status === 'processed'
      && (!aut.payment || aut.payment.status === 'approved');
    if (!pago) {
      return { ok: true, ignorado: `cobrança recorrente ${aut.status}${aut.payment ? '/' + aut.payment.status : ''}` };
    }
    const refPagamento = String((aut.payment && aut.payment.id) || aut.id);
    return tenancy.comTenant({ tenantId, userId: 'mercadopago', perfil: 'plataforma' }, () => {
      const r = registrarPagamento(tenantId, refPagamento);
      repo.publicarEvento({ tipo: 'webhook.mp.recorrencia', payload: { id: String(id), ...r } });
      return { ok: true, ...r };
    });
  }

  if (tipo === 'payment') {
    const pag = await mp(`/v1/payments/${id}`);
    if (pag.status !== 'approved') return { ok: true, ignorado: `pagamento ${pag.status}` };
    const tenantId = tenantDoWebhook(String(pag.external_reference || ''), '');
    if (!tenantId) return { ok: true, ignorado: 'conta não encontrada' };
    return tenancy.comTenant({ tenantId, userId: 'mercadopago', perfil: 'plataforma' }, () => {
      const r = registrarPagamento(tenantId, String(pag.id));
      repo.publicarEvento({ tipo: 'webhook.mp.payment', payload: { id: String(id), ...r } });
      return { ok: true, ...r };
    });
  }
  return { ok: true, ignorado: `tipo ${tipo}` };
}

/**
 * De quem é esta notificação? Primeiro a referência que nós mesmos
 * mandamos; se ela não vier, a busca pelo preapproval — e essa atravessa
 * contas, então é de plataforma, com motivo escrito.
 */
function tenantDoWebhook(externalReference, preapprovalId) {
  const m = /^finance:([^:]+):/.exec(externalReference || '');
  if (m && repo.tenantPorId(m[1])) return m[1];
  if (!preapprovalId) return '';
  return tenancy.comoPlataforma(
    { userId: 'mercadopago', motivo: 'identificar a conta do webhook de cobrança' },
    () => {
      const sub = repo.assinaturaPorRefExterna(preapprovalId);
      return sub ? sub.tenant_id : '';
    });
}

// -------------------------------------------------------------- faturas

/** Fatura do mês pelo preço do plano da conta. Exige contexto de tenant. */
function gerarFatura(tenantId, { status = 'aberta', externoRef = '', competencia = '', vencimento = '' } = {}) {
  const t = repo.tenantPorId(tenantId);
  if (!t) return null;
  const plano = t.plano_id ? repo.planoPorId(t.plano_id) : null;
  return repo.criarInvoice({
    competencia: competencia || competenciaDeHoje(),
    valorCents: plano ? plano.preco_cents : 0,
    status,
    vencimento: vencimento || new Date().toISOString().slice(0, 10),
    pagoEm: status === 'paga' ? nowISO() : '',
    externoRef,
  });
}

/**
 * Pagamento fora do Mercado Pago (Pix, boleto, transferência, contrato
 * anual). É como um cliente B2B costuma pagar antes de existir
 * recorrência — por isso não é gambiarra: é caminho de primeira classe,
 * auditado como qualquer outro, e exige motivo.
 */
function marcarPago(tenantId, { competencia = '', valorCents = null, motivo = '' } = {}) {
  if (!String(motivo).trim()) throw new ErroDeCobranca('Informe o motivo/meio do pagamento — ele vai para a auditoria.');
  const t = repo.tenantPorId(tenantId);
  if (!t) throw new ErroDeCobranca('Conta não encontrada.', 404);
  const plano = t.plano_id ? repo.planoPorId(t.plano_id) : null;
  const fatura = repo.criarInvoice({
    competencia: competencia || competenciaDeHoje(),
    valorCents: valorCents == null ? (plano ? plano.preco_cents : 0) : dinheiro.naoNegativo(Number(valorCents), 'valor'),
    status: 'paga', vencimento: new Date().toISOString().slice(0, 10), pagoEm: nowISO(),
  });
  const sub = repo.assinaturaVigente();
  if (sub) repo.atualizarAssinatura(sub.id, { status: 'ativa' });
  else if (plano) repo.criarAssinatura({ planoId: plano.id, status: 'ativa' });
  mudarStatusDaConta(tenantId, 'ativa', motivo);
  auditoria.registrar('assinatura.pagamento_manual', {
    objetoTipo: 'fatura', objetoId: fatura.id, motivo,
    detalhe: { competencia: fatura.competencia, valorCents: fatura.valor_cents },
  });
  return { ok: true, fatura };
}

// --------------------------------------------------------- ciclo diário

/**
 * Régua de cobrança, uma vez por dia (worker do index.js).
 *
 * trial vencido → inadimplente · inadimplente há +N dias → suspensa.
 * Conta interna nunca entra. Nada aqui apaga, esconde ou trava leitura.
 */
function cicloDeVida({ agora = nowISO() } = {}) {
  const trialsVencidos = [], suspensas = [];
  const corte = new Date(Date.parse(agora) - DIAS_ATE_SUSPENDER * 86400000).toISOString();
  // `trial_ate` é DIA (YYYY-MM-DD). Comparar dia com timestamp encerraria a
  // avaliação na manhã do último dia — o assinante perderia o dia que lhe
  // foi prometido. A comparação é dia contra dia: vence no dia seguinte.
  const hoje = String(agora).slice(0, 10);

  for (const t of repo.listarTenants()) {
    if (t.interno === 1) continue;                       // cortesia vitalícia
    tenancy.comTenant({ tenantId: t.id, userId: 'cobranca', perfil: 'plataforma' }, () => {
      if (t.status === 'trial' && t.trial_ate && String(t.trial_ate).slice(0, 10) < hoje) {
        mudarStatusDaConta(t.id, 'inadimplente', 'período de avaliação encerrado');
        trialsVencidos.push(t.slug);
        return;
      }
      if (t.status === 'inadimplente' && (t.atualizado_em || t.criado_em) < corte) {
        mudarStatusDaConta(t.id, 'suspensa', `inadimplente há mais de ${DIAS_ATE_SUSPENDER} dias`);
        suspensas.push(t.slug);
      }
    });
  }

  if (trialsVencidos.length || suspensas.length) {
    _notificar(
      `💰 Villela Finance — cobrança: ${trialsVencidos.length} avaliação(ões) encerrada(s), ` +
      `${suspensas.length} conta(s) suspensa(s). Leitura e exportação seguem liberadas.`);
  }
  return { quando: agora, trialsVencidos, suspensas, diasAteSuspender: DIAS_ATE_SUSPENDER };
}

// -------------------------------------------------------------- painel

/**
 * Números da plataforma. O MRR conta só o que está de fato ativo — trial
 * e inadimplente aparecem em colunas próprias, porque somá-los ao MRR é
 * exatamente como um gestor se engana sobre a própria receita.
 */
function resumo() {
  const planos = new Map(repo.listarPlanos().map(p => [p.id, p]));
  const linhas = repo.listarTenants().map(t => {
    const plano = t.plano_id ? planos.get(t.plano_id) : null;
    const preco = plano ? plano.preco_cents : 0;
    const pagante = t.status === 'ativa' && t.interno !== 1 && preco > 0;
    return {
      id: t.id, slug: t.slug, nome: t.nome, status: t.status, interno: t.interno === 1,
      planoSlug: plano ? plano.slug : '', planoNome: plano ? plano.nome : '—',
      precoCents: preco, preco: dinheiro.formatar(preco), pagante,
      trialAte: t.trial_ate || '', criadoEm: t.criado_em, atualizadoEm: t.atualizado_em || '',
      contatoEmail: t.contato_email || '',
    };
  });
  const mrrCents = linhas.filter(l => l.pagante).reduce((s, l) => s + l.precoCents, 0);
  const emRisco = linhas.filter(l => l.status === 'inadimplente' && !l.interno);
  const emRiscoCents = emRisco.reduce((s, l) => s + l.precoCents, 0);
  return {
    mrrCents, mrr: dinheiro.formatar(mrrCents),
    arrCents: mrrCents * 12, arr: dinheiro.formatar(mrrCents * 12),
    emRiscoCents, emRisco: dinheiro.formatar(emRiscoCents),
    contas: linhas,
    por: {
      total: linhas.length,
      pagantes: linhas.filter(l => l.pagante).length,
      trial: linhas.filter(l => l.status === 'trial').length,
      inadimplentes: emRisco.length,
      suspensas: linhas.filter(l => l.status === 'suspensa').length,
      canceladas: linhas.filter(l => l.status === 'cancelada').length,
      cortesia: linhas.filter(l => l.interno).length,
    },
    pagamentoOnline: ativo(),
    diasAteSuspender: DIAS_ATE_SUSPENDER,
  };
}

/** Faturas de todas as contas, para a aba de cobrança do staff. */
function faturasDaPlataforma(limite = 60) {
  const saida = [];
  for (const t of repo.listarTenants()) {
    tenancy.comTenant({ tenantId: t.id, userId: 'plataforma' }, () => {
      for (const f of repo.listarInvoices(12)) {
        saida.push({
          conta: t.nome, slug: t.slug, tenantId: t.id,
          competencia: f.competencia, valorCents: f.valor_cents, valor: dinheiro.formatar(f.valor_cents),
          status: f.status, pagoEm: f.pago_em, criadoEm: f.criado_em,
        });
      }
    });
  }
  return saida.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm))).slice(0, limite);
}

module.exports = {
  ErroDeCobranca, DIAS_ATE_SUSPENDER,
  configurar, ativo, estado, assinar, cancelar,
  aplicarPreapproval, registrarPagamento, processarWebhook, tenantDoWebhook,
  gerarFatura, marcarPago, mudarStatusDaConta, cicloDeVida, resumo, faturasDaPlataforma,
  competenciaDeHoje,
};
