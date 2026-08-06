// =====================================================================
// Villela Alta Vista 360 — pagamentos (Mercado Pago Checkout Pro) e
// financeiro gerencial. Padrão da casa (academy/closet):
//   · mpFetch injetado (único ponto que fala com a API do MP);
//   · sem token o produto roda em MODO MANUAL — nunca simula pagamento;
//   · webhook NÃO confia no corpo: refetch GET /v1/payments/:id e confere
//     referência, valor e moeda antes de acreditar em qualquer coisa;
//   · idempotência explícita (pagamento_eventos + status da parcela);
//   · pagamento aprovado destrava o projeto (awaiting_payment → briefing_pending)
//     e o SALDO controla a liberação da entrega (usado pela Onda 5).
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const { Projetos, Clientes, Auditoria, s, n, cent } = repo;

let _mpFetch = null;
let _notificar = async () => {};
let _emailCliente = async () => {};

function configurar({ mpFetch, notificar, emailCliente } = {}) {
  if (mpFetch) _mpFetch = mpFetch;
  if (notificar) _notificar = notificar;
  if (emailCliente) _emailCliente = emailCliente;
}
const ativo = () => !!(_mpFetch && (process.env.MP_ACCESS_TOKEN || _mpFetch.__mock));

const LIMITE_INTEGRAL_CENTAVOS = 100000; // R$ 1.000 (spec §4.3)

const evento = (parcelaId, payId, status, detalhe) =>
  db.prepare('INSERT INTO pagamento_eventos (id, parcela_id, mp_payment_id, status, detalhe, criado_em) VALUES (?,?,?,?,?,?)')
    .run(novoId(), s(parcelaId, 40), s(String(payId || ''), 60), s(status, 40), s(detalhe, 400), nowISO());

const mapaParcela = (p) => p || null;

const Parcelas = {
  doProjeto(projetoId) {
    return db.prepare('SELECT * FROM parcelas WHERE projeto_id = ? ORDER BY ordem').all(s(projetoId, 40)).map(mapaParcela);
  },
  obter(id) { return mapaParcela(db.prepare('SELECT * FROM parcelas WHERE id = ?').get(s(id, 40))); },
  doCliente(clienteId, id) {
    return mapaParcela(db.prepare('SELECT * FROM parcelas WHERE id = ? AND cliente_id = ?').get(s(id, 40), s(clienteId, 40)));
  },
};

// saldo em aberto = o que ainda não foi aprovado/pago (controla marca d'água e entrega)
function saldo(projetoId) {
  const r = db.prepare(`SELECT COALESCE(SUM(valor_centavos),0) v FROM parcelas
    WHERE projeto_id = ? AND status NOT IN ('aprovado','cancelado')`).get(s(projetoId, 40));
  return n(r.v, 0);
}

// ---------------------------------------------------------------------
// Geração das parcelas — a REGRA COMERCIAL mora aqui, e só aqui.
// ---------------------------------------------------------------------
function gerarParcelas(projetoId, { presencial = true, quem = 'staff' } = {}) {
  const p = Projetos.obter(projetoId);
  if (!p) throw new Error('Projeto não encontrado.');
  if (!p.total_centavos) throw new Error('Projeto sem valor — defina o total antes de gerar a cobrança.');
  if (Parcelas.doProjeto(p.id).length) throw new Error('Este projeto já tem cobrança gerada.');
  const agora = nowISO();
  const inserir = (rotulo, ordem, valor) =>
    db.prepare(`INSERT INTO parcelas (id, projeto_id, cliente_id, rotulo, ordem, valor_centavos, status, criado_em)
      VALUES (?,?,?,?,?,?, 'pendente', ?)`)
      .run(novoId(), p.id, p.cliente_id, rotulo, ordem, cent(valor), agora);
  transacao(() => {
    if (!presencial) {
      inserir('Pagamento integral (serviço remoto)', 1, p.total_centavos);
    } else if (p.total_centavos <= LIMITE_INTEGRAL_CENTAVOS) {
      inserir('Pagamento integral (na reserva da agenda)', 1, p.total_centavos);
    } else {
      const sinal = Math.floor(p.total_centavos / 2);
      inserir('Sinal (50% — reserva da agenda)', 1, sinal);
      inserir('Saldo final (50% — antes da liberação da entrega)', 2, p.total_centavos - sinal); // resto no saldo: soma sempre fecha
    }
    Auditoria.registrar({ quem, acao: 'cobranca.gerar', entidade: 'projetos', entidade_id: p.id, detalhe: `${presencial ? 'presencial' : 'remoto'} · ${p.total_centavos} centavos` });
  });
  return Parcelas.doProjeto(p.id);
}

// parcela avulsa (ex.: renovação de hospedagem do tour) — fora das regras 50/50
function criarParcelaAvulsa(projetoId, rotulo, valorCentavos, { quem = 'sistema' } = {}) {
  const p = Projetos.obter(projetoId);
  if (!p) throw new Error('Projeto não encontrado.');
  const valor = cent(valorCentavos);
  if (!valor) throw new Error('Valor da parcela é obrigatório.');
  const ordem = n((db.prepare('SELECT MAX(ordem) m FROM parcelas WHERE projeto_id = ?').get(p.id) || {}).m, 0) + 1;
  const id = novoId();
  db.prepare(`INSERT INTO parcelas (id, projeto_id, cliente_id, rotulo, ordem, valor_centavos, status, criado_em)
    VALUES (?,?,?,?,?,?, 'pendente', ?)`)
    .run(id, p.id, p.cliente_id, s(rotulo, 120), ordem, valor, nowISO());
  Auditoria.registrar({ quem, acao: 'parcela.avulsa', entidade: 'parcelas', entidade_id: id, detalhe: `${s(rotulo, 80)} · ${valor}` });
  return Parcelas.obter(id);
}

// ---------------------------------------------------------------------
// Checkout Pro — preferência criada NO SERVIDOR
// ---------------------------------------------------------------------
async function criarCheckout(parcelaId, { baseUrl }) {
  if (!ativo()) throw new Error('Pagamento on-line indisponível no momento — combine o pagamento com a equipe (Pix manual).');
  const parc = Parcelas.obter(parcelaId);
  if (!parc) throw new Error('Parcela não encontrada.');
  if (parc.status === 'aprovado') throw new Error('Esta parcela já está paga.');
  if (parc.status === 'reembolsado' || parc.status === 'cancelado') throw new Error('Esta parcela não está mais aberta.');
  const projeto = Projetos.obter(parc.projeto_id);
  const cliente = Clientes.obter(parc.cliente_id);
  // ordem 2 (saldo final) só abre depois do sinal aprovado — a regra vale no servidor
  if (parc.ordem > 1) {
    const anterior = db.prepare("SELECT 1 FROM parcelas WHERE projeto_id = ? AND ordem < ? AND status != 'aprovado' LIMIT 1")
      .get(parc.projeto_id, parc.ordem);
    if (anterior) throw new Error('O saldo final abre depois da confirmação do sinal.');
  }
  const pref = await _mpFetch('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [{
        title: s(`${projeto.titulo} — ${parc.rotulo}`, 120),
        quantity: 1, unit_price: Math.round(parc.valor_centavos) / 100, currency_id: 'BRL',
      }],
      payer: cliente && cliente.email ? { email: cliente.email } : undefined,
      external_reference: 'altavista:' + parc.id,
      back_urls: {
        success: `${baseUrl}/alta-vista/app?pagamento=sucesso`,
        pending: `${baseUrl}/alta-vista/app?pagamento=pendente`,
        failure: `${baseUrl}/alta-vista/app?pagamento=falhou`,
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/alta-vista/webhooks/mercadopago`,
      statement_descriptor: 'VILLELA ALTAVISTA',
    }),
  });
  db.prepare("UPDATE parcelas SET status = 'aguardando', mp_preference_id = ?, mp_init_point = ?, atualizado_em = ? WHERE id = ?")
    .run(s(pref.id, 80), s(pref.init_point || pref.sandbox_init_point || '', 400), nowISO(), parc.id);
  return { parcela: Parcelas.obter(parc.id), init_point: pref.init_point || pref.sandbox_init_point };
}

// ---------------------------------------------------------------------
// Efeito de "parcela paga" — compartilhado pelo webhook e pela conciliação manual
// ---------------------------------------------------------------------
function aplicarPagamento(parc, { payId = '', via = 'mercadopago', quem = 'mercadopago' }) {
  transacao(() => {
    db.prepare("UPDATE parcelas SET status = 'aprovado', mp_payment_id = ?, pago_em = ?, pago_via = ?, atualizado_em = ? WHERE id = ?")
      .run(s(String(payId), 60), nowISO(), via, nowISO(), parc.id);
    evento(parc.id, payId, 'aprovado', via);
    // primeira parcela aprovada destrava o projeto (a máquina de estados valida a transição)
    const projeto = Projetos.obter(parc.projeto_id);
    if (projeto && projeto.status === 'awaiting_payment') {
      Projetos.mudarStatus(projeto.id, 'briefing_pending', {
        quem, justificativa: `pagamento aprovado (${via}${payId ? ' ' + payId : ''}) — ${parc.rotulo}`,
      });
    }
    Auditoria.registrar({ quem, acao: 'parcela.aprovada', entidade: 'parcelas', entidade_id: parc.id, detalhe: `${parc.valor_centavos} centavos · ${via}` });
    // renovação de hospedagem de tour: estende a validade sozinho (require tardio — sem ciclo)
    try { require('./tours').Tours.estenderPorParcela(parc); } catch (_) {}
  });
  const resto = saldo(parc.projeto_id);
  _notificar(`💰 Alta Vista 360 — parcela paga: ${parc.rotulo} (R$ ${(parc.valor_centavos / 100).toLocaleString('pt-BR')})`
    + `${resto ? ` · saldo em aberto R$ ${(resto / 100).toLocaleString('pt-BR')}` : ' · projeto QUITADO ✅'}`).catch(() => {});
  _emailCliente(parc, 'aprovado').catch(() => {});
}

// ---------------------------------------------------------------------
// Webhook — refetch + validação + idempotência
// ---------------------------------------------------------------------
async function processarWebhook(body = {}, query = {}) {
  const payId = (body.data && body.data.id) || query['data.id'] || query.id || '';
  const tipo = body.type || query.type || query.topic || '';
  if (!payId || (tipo && tipo !== 'payment')) return { ignorado: 'sem payment id' };
  if (!ativo()) return { ignorado: 'billing inativo' };

  const pay = await _mpFetch('/v1/payments/' + payId);
  const ref = String(pay.external_reference || '');
  if (!ref.startsWith('altavista:')) return { ignorado: 'referência de outro produto' };
  const parc = Parcelas.obter(ref.slice('altavista:'.length));
  if (!parc) { evento('', payId, 'orfao', ref); return { ignorado: 'parcela não encontrada' }; }

  // idempotência: pagamento+status já processado → não repete efeito
  const jaVisto = db.prepare('SELECT 1 FROM pagamento_eventos WHERE mp_payment_id = ? AND status = ? LIMIT 1')
    .get(String(payId), String(pay.status === 'approved' ? 'aprovado' : pay.status));
  if (jaVisto) return { ignorado: 'evento repetido' };

  if (pay.status === 'approved') {
    if (parc.status === 'aprovado') return { ignorado: 'parcela já aprovada' };
    // NUNCA aceitar valor/moeda diferentes do que cobramos
    const valorOk = Math.round(n(pay.transaction_amount, 0) * 100) === parc.valor_centavos;
    const moedaOk = (pay.currency_id || 'BRL') === 'BRL';
    if (!valorOk || !moedaOk) {
      evento(parc.id, payId, 'divergente', `esperado ${parc.valor_centavos}, veio ${pay.transaction_amount} ${pay.currency_id}`);
      _notificar(`⚠️ Alta Vista 360 — pagamento com VALOR DIVERGENTE ignorado (MP ${payId}): esperado R$ ${(parc.valor_centavos / 100).toLocaleString('pt-BR')}, veio ${pay.transaction_amount} ${pay.currency_id}. Conferir no painel do MP.`).catch(() => {});
      return { ignorado: 'valor divergente' };
    }
    aplicarPagamento(parc, { payId, via: 'mercadopago', quem: 'mercadopago' });
    return { ok: true, aplicado: 'aprovado' };
  }
  if (['rejected', 'cancelled'].includes(pay.status)) {
    if (['aprovado', 'reembolsado'].includes(parc.status)) return { ignorado: 'estado final' };
    db.prepare("UPDATE parcelas SET status = ?, atualizado_em = ? WHERE id = ?")
      .run(pay.status === 'rejected' ? 'rejeitado' : 'cancelado', nowISO(), parc.id);
    evento(parc.id, payId, pay.status === 'rejected' ? 'rejeitado' : 'cancelado', '');
    return { ok: true, aplicado: pay.status };
  }
  if (['refunded', 'charged_back'].includes(pay.status)) {
    db.prepare("UPDATE parcelas SET status = ?, atualizado_em = ? WHERE id = ?")
      .run(pay.status === 'refunded' ? 'reembolsado' : 'contestado', nowISO(), parc.id);
    evento(parc.id, payId, pay.status === 'refunded' ? 'reembolsado' : 'contestado', '');
    _notificar(`🔁 Alta Vista 360 — pagamento ${pay.status === 'refunded' ? 'REEMBOLSADO' : 'CONTESTADO (chargeback)'} na parcela "${parc.rotulo}" (MP ${payId}). Conferir o projeto.`).catch(() => {});
    return { ok: true, aplicado: pay.status };
  }
  evento(parc.id, payId, String(pay.status || 'desconhecido'), 'sem efeito');
  return { ok: true, aplicado: 'registrado' };
}

// ---------------------------------------------------------------------
// Conciliação manual (Pix direto/dinheiro) e reembolso — só staff, com auditoria
// ---------------------------------------------------------------------
function marcarPagoManual(parcelaId, { quem, justificativa = '' }) {
  const parc = Parcelas.obter(parcelaId);
  if (!parc) throw new Error('Parcela não encontrada.');
  if (parc.status === 'aprovado') throw new Error('Parcela já está paga.');
  if (!s(justificativa, 300)) throw new Error('Conciliação manual exige justificativa (ex.: "Pix recebido no C6 em 06/08").');
  aplicarPagamento(parc, { payId: '', via: 'manual', quem });
  Auditoria.registrar({ quem, acao: 'parcela.conciliacao_manual', entidade: 'parcelas', entidade_id: parc.id, detalhe: justificativa });
  return Parcelas.obter(parc.id);
}

async function reembolsar(parcelaId, { quem, confirmar = false }) {
  if (!confirmar) throw new Error('Reembolso exige confirmação explícita (confirmar: true).');
  const parc = Parcelas.obter(parcelaId);
  if (!parc) throw new Error('Parcela não encontrada.');
  if (parc.status !== 'aprovado') throw new Error('Só parcela paga pode ser reembolsada.');
  if (parc.pago_via === 'mercadopago' && parc.mp_payment_id) {
    if (!ativo()) throw new Error('Mercado Pago indisponível — faça o estorno no painel do MP e marque aqui depois.');
    await _mpFetch(`/v1/payments/${parc.mp_payment_id}/refunds`, {
      method: 'POST',
      headers: { 'X-Idempotency-Key': `av-ref-${parc.id}` },
      body: JSON.stringify({}),
    });
  }
  db.prepare("UPDATE parcelas SET status = 'reembolsado', atualizado_em = ? WHERE id = ?").run(nowISO(), parc.id);
  evento(parc.id, parc.mp_payment_id, 'reembolsado', 'por ' + quem);
  Auditoria.registrar({ quem, acao: 'parcela.reembolso', entidade: 'parcelas', entidade_id: parc.id, detalhe: `${parc.valor_centavos} centavos` });
  _notificar(`↩️ Alta Vista 360 — reembolso executado na parcela "${parc.rotulo}" por ${quem}.`).catch(() => {});
  return Parcelas.obter(parc.id);
}

// ---------------------------------------------------------------------
// Despesas + financeiro gerencial (dashboards honestos: base vazia = zero real)
// ---------------------------------------------------------------------
const Despesas = {
  criar(d, { quem = 'staff' } = {}) {
    if (!s(d.descricao, 300)) throw new Error('Descrição da despesa é obrigatória.');
    const valor = cent(d.valor_centavos);
    if (!valor) throw new Error('Valor da despesa é obrigatório (em centavos).');
    const id = novoId();
    db.prepare('INSERT INTO despesas (id, projeto_id, categoria, descricao, valor_centavos, data, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(id, s(d.projeto_id, 40), s(d.categoria, 40) || 'outros', s(d.descricao, 300), valor,
        s(d.data, 10) || nowISO().slice(0, 10), nowISO());
    Auditoria.registrar({ quem, acao: 'despesa.criar', entidade: 'despesas', entidade_id: id, detalhe: `${valor} centavos` });
    return db.prepare('SELECT * FROM despesas WHERE id = ?').get(id);
  },
  remover(id, { quem = 'staff' } = {}) {
    db.prepare('DELETE FROM despesas WHERE id = ?').run(s(id, 40));
    Auditoria.registrar({ quem, acao: 'despesa.remover', entidade: 'despesas', entidade_id: s(id, 40), detalhe: '' });
  },
  listar() { return db.prepare('SELECT * FROM despesas ORDER BY data DESC, criado_em DESC LIMIT 500').all(); },
};

function financeiro() {
  const soma = (sql, ...p) => n((db.prepare(sql).get(...p) || {}).v, 0);
  const recebido = soma("SELECT COALESCE(SUM(valor_centavos),0) v FROM parcelas WHERE status = 'aprovado'");
  const aReceber = soma("SELECT COALESCE(SUM(valor_centavos),0) v FROM parcelas WHERE status IN ('pendente','aguardando','rejeitado')");
  const reembolsado = soma("SELECT COALESCE(SUM(valor_centavos),0) v FROM parcelas WHERE status = 'reembolsado'");
  const contestado = soma("SELECT COALESCE(SUM(valor_centavos),0) v FROM parcelas WHERE status = 'contestado'");
  const despesas = soma('SELECT COALESCE(SUM(valor_centavos),0) v FROM despesas');
  const porProjeto = db.prepare(`SELECT pr.id, pr.titulo,
      COALESCE(SUM(CASE WHEN pa.status='aprovado' THEN pa.valor_centavos ELSE 0 END),0) recebido,
      COALESCE(SUM(CASE WHEN pa.status IN ('pendente','aguardando','rejeitado') THEN pa.valor_centavos ELSE 0 END),0) em_aberto,
      COALESCE((SELECT SUM(d.valor_centavos) FROM despesas d WHERE d.projeto_id = pr.id),0) despesas
    FROM projetos pr LEFT JOIN parcelas pa ON pa.projeto_id = pr.id
    GROUP BY pr.id HAVING recebido > 0 OR em_aberto > 0 OR despesas > 0
    ORDER BY pr.criado_em DESC LIMIT 100`).all()
    .map((x) => ({ ...x, margem: x.recebido - x.despesas }));
  return {
    recebido_centavos: recebido, a_receber_centavos: aReceber,
    reembolsado_centavos: reembolsado, contestado_centavos: contestado,
    despesas_centavos: despesas, margem_centavos: recebido - reembolsado - despesas,
    por_projeto: porProjeto,
    aviso: 'Financeiro GERENCIAL — não substitui a contabilidade fiscal.',
  };
}

module.exports = {
  configurar, ativo, gerarParcelas, criarParcelaAvulsa, criarCheckout, processarWebhook,
  marcarPagoManual, reembolsar, saldo, Parcelas, Despesas, financeiro,
  LIMITE_INTEGRAL_CENTAVOS,
};
