// =====================================================================
// Clientes — LEITORES: como cada sistema do grupo conta quem paga.
//
// SOMENTE LEITURA. Nenhuma função daqui escreve em banco de produto.
//
// Cada leitor devolve linhas no MESMO formato (uma por vínculo: matrícula,
// pedido ou assinatura):
//
//   { tipo, nome, email, telefone, conta, item, data, status, status_origem,
//     natureza, mensalidade_centavos, pagamentos: [{ em, centavos }],
//     reembolsado_centavos, quantidade, origem_id, interna, obs }
//
// Três regras que valem para todos:
//   • DINHEIRO SÓ DE PAGAMENTO REGISTRADO. `pagamentos` traz o que entrou de
//     fato (pedido pago, fatura paga, parcela aprovada). Preço de tabela nunca
//     vira valor pago: sem registro, a lista fica vazia e a natureza diz
//     `sem_pagamento`. O preço do plano aparece só em `mensalidade_centavos`.
//   • TELEFONE É O DO PRÓPRIO SISTEMA. Quem não guarda telefone devolve ''.
//     Nada de completar cruzando com outra base.
//   • O QUE NÃO É VENDA É DITO, NÃO ESCONDIDO: cortesia, período de teste,
//     compra de teste e reembolso aparecem na lista, com a natureza marcada,
//     e ficam fora da receita (quem soma é o motor).
//
// Os `require` dos produtos são TARDIOS: produto que falhar ao carregar
// derruba só a própria fonte, não a página.
// =====================================================================
'use strict';

const dbDe = (mod) => require(`../${mod}/db`).db;
const cent = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0; };
const iso = (v) => !v ? '' : (v instanceof Date ? v.toISOString() : String(v));
const txt = (v) => (v == null ? '' : String(v)).trim();

// trial | ativa | cortesia | inadimplente | suspensa | cancelada (vocabulário
// dos SaaS multiempresa) → o vocabulário único da página.
function statusDeConta(bruto, trialAte, agora = Date.now()) {
  const s = txt(bruto);
  if (s === 'trial') {
    const fim = Date.parse(trialAte || '');
    return (Number.isFinite(fim) && fim < agora) ? 'teste_vencido' : 'em_teste';
  }
  return s || 'desconhecido';
}

function linha(d) {
  return {
    tipo: d.tipo, nome: txt(d.nome), email: txt(d.email).toLowerCase(), telefone: txt(d.telefone),
    conta: txt(d.conta), item: txt(d.item), data: iso(d.data),
    status: d.status, status_origem: txt(d.status_origem),
    natureza: d.natureza,
    mensalidade_centavos: d.mensalidade_centavos == null ? null : cent(d.mensalidade_centavos),
    pagamentos: (d.pagamentos || []).map((p) => ({ em: iso(p.em), centavos: cent(p.centavos) })),
    reembolsado_centavos: cent(d.reembolsado_centavos),
    quantidade: d.quantidade == null ? 1 : cent(d.quantidade),
    origem_id: txt(d.origem_id), interna: !!d.interna, obs: txt(d.obs),
  };
}

// Natureza de um vínculo de ASSINATURA a partir do status e do que foi pago.
function naturezaDeAssinatura(status, pagamentos, { cortesia = false, precoZero = false } = {}) {
  if (cortesia || status === 'cortesia') return 'cortesia';
  if (status === 'em_teste' || status === 'teste_vencido') return 'em_teste';
  if (pagamentos.length) return 'pago';
  if (precoZero) return 'gratuito';
  return 'sem_pagamento';
}

const agrupar = (lista, chave) => {
  const m = new Map();
  for (const x of lista) { const k = String(x[chave]); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
};

// ---------------- Livraria: um pedido = uma linha ----------------
function livraria() {
  const db = dbDe('livraria');
  const itens = agrupar(db.prepare('SELECT order_id, titulo_snapshot, tipo, quantidade FROM order_items').all(), 'order_id');
  const pedidos = db.prepare(`SELECT o.id, o.status, o.valor_total, o.created_at, o.pago_em, COALESCE(o.teste, 0) teste,
      c.nome, c.email, c.whatsapp
    FROM orders o JOIN customers c ON c.id = o.customer_id
    WHERE o.status IN ('pago', 'reembolsado')`).all();
  return pedidos.map((o) => {
    const its = itens.get(String(o.id)) || [];
    const reemb = o.status === 'reembolsado';
    const quando = o.pago_em || o.created_at;
    return linha({
      tipo: 'comprador', nome: o.nome, email: o.email, telefone: o.whatsapp,
      item: its.map((i) => `${i.titulo_snapshot} (${i.tipo})${i.quantidade > 1 ? ' ×' + i.quantidade : ''}`).join('; '),
      quantidade: its.reduce((s, i) => s + cent(i.quantidade || 1), 0),
      data: quando, status: reemb ? 'reembolsada' : 'paga', status_origem: o.status,
      natureza: reemb ? 'reembolsado' : o.teste ? 'compra_teste' : cent(o.valor_total) === 0 ? 'gratuito' : 'pago',
      pagamentos: [{ em: quando, centavos: o.valor_total }],
      reembolsado_centavos: reemb ? o.valor_total : 0,
      origem_id: o.id, obs: o.teste ? 'pedido marcado como teste na Livraria' : '',
    });
  });
}

// ---------------- Academy: matrículas + assinaturas de clube ----------------
// A matrícula é o vínculo; o dinheiro vem do PEDIDO pago do mesmo aluno para o
// mesmo produto. Matrícula por cortesia não tem pedido — e não ganha valor.
function academy() {
  const db = dbDe('academy');
  const out = [];
  const pedidos = db.prepare(`SELECT id, user_id, product_id, produto_titulo, valor_centavos, status, criado_em, pago_em,
      COALESCE(tipo, 'avulsa') tipo, COALESCE(subscription_id, '') subscription_id
    FROM orders WHERE status IN ('paga', 'reembolsada') ORDER BY criado_em`).all();
  // Último pedido avulso de cada (aluno, produto): recompra depois de reembolso vence o reembolso.
  const avulso = new Map();
  for (const o of pedidos) if (o.tipo !== 'assinatura' && !o.subscription_id) avulso.set(`${o.user_id}|${o.product_id}`, o);
  const usados = new Set();

  const matriculas = db.prepare(`SELECT e.id, e.user_id, e.product_id, e.origem, e.status, e.criado_em, e.criado_por,
      u.nome, u.email, u.telefone, COALESCE(u.cortesia, 0) conta_cortesia, p.titulo, p.tipo produto_tipo
    FROM enrollments e JOIN users u ON u.id = e.user_id LEFT JOIN products p ON p.id = e.product_id`).all();
  for (const e of matriculas) {
    const o = avulso.get(`${e.user_id}|${e.product_id}`);
    if (o) usados.add(o.id);
    const base = {
      tipo: (e.produto_tipo && e.produto_tipo !== 'curso') ? 'comprador' : 'aluno',
      nome: e.nome, email: e.email, telefone: e.telefone, item: e.titulo || (o && o.produto_titulo) || '',
      origem_id: e.id, status_origem: `${e.status}/${e.origem}`,
    };
    if (o && o.status === 'paga') {
      out.push(linha({ ...base, data: o.pago_em || e.criado_em, status: e.status === 'ativa' ? 'ativa' : 'revogada',
        natureza: cent(o.valor_centavos) === 0 ? 'gratuito' : 'pago',
        pagamentos: [{ em: o.pago_em || o.criado_em, centavos: o.valor_centavos }] }));
    } else if (o && o.status === 'reembolsada') {
      out.push(linha({ ...base, data: o.pago_em || e.criado_em, status: 'reembolsada', natureza: 'reembolsado',
        pagamentos: [{ em: o.pago_em || o.criado_em, centavos: o.valor_centavos }], reembolsado_centavos: o.valor_centavos }));
    } else if (e.origem === 'compra') {
      const gratis = e.criado_por === 'checkout-gratis';
      out.push(linha({ ...base, data: e.criado_em, status: e.status === 'ativa' ? 'ativa' : 'revogada',
        natureza: gratis ? 'gratuito' : 'sem_pagamento', pagamentos: gratis ? [{ em: e.criado_em, centavos: 0 }] : [],
        obs: gratis ? 'produto gratuito' : 'matrícula de compra sem pedido pago correspondente' }));
    } else {
      out.push(linha({ ...base, data: e.criado_em, status: e.status === 'ativa' ? 'cortesia' : 'revogada', natureza: 'cortesia',
        obs: e.conta_cortesia ? 'conta de acesso de teste' : (e.origem && e.origem !== 'cortesia' ? `origem: ${e.origem}` : '') }));
    }
  }
  // Pedido pago sem matrícula alguma: não some da lista (dinheiro entrou).
  const usuarios = new Map(db.prepare('SELECT id, nome, email, telefone FROM users').all().map((u) => [String(u.id), u]));
  for (const o of avulso.values()) {
    if (usados.has(o.id)) continue;
    const u = usuarios.get(String(o.user_id)) || {};
    const reemb = o.status === 'reembolsada';
    out.push(linha({ tipo: 'aluno', nome: u.nome, email: u.email, telefone: u.telefone, item: o.produto_titulo,
      data: o.pago_em || o.criado_em, status: reemb ? 'reembolsada' : 'paga', status_origem: o.status,
      natureza: reemb ? 'reembolsado' : cent(o.valor_centavos) === 0 ? 'gratuito' : 'pago',
      pagamentos: [{ em: o.pago_em || o.criado_em, centavos: o.valor_centavos }], reembolsado_centavos: reemb ? o.valor_centavos : 0,
      origem_id: 'pedido:' + o.id, obs: 'pedido sem matrícula registrada' }));
  }

  // Assinaturas de clube: cada cobrança recorrente vira um pedido com subscription_id.
  const cobrancas = agrupar(pedidos.filter((o) => o.subscription_id && o.status === 'paga'), 'subscription_id');
  const subs = db.prepare(`SELECT s.id, s.produto_titulo, s.valor_centavos, s.status, s.criado_em, s.ativa_em, s.cancelada_em,
      u.nome, u.email, u.telefone
    FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE s.status <> 'pendente'`).all();
  for (const s of subs) {
    const pagos = (cobrancas.get(String(s.id)) || []).map((o) => ({ em: o.pago_em || o.criado_em, centavos: o.valor_centavos }));
    out.push(linha({ tipo: 'assinante', nome: s.nome, email: s.email, telefone: s.telefone, item: s.produto_titulo,
      data: s.ativa_em || s.criado_em, status: s.status, status_origem: s.status,
      natureza: naturezaDeAssinatura(s.status, pagos), mensalidade_centavos: s.valor_centavos, pagamentos: pagos,
      origem_id: 'assinatura:' + s.id }));
  }
  return out;
}

// ---------------- SaaS multiempresa: a CONTA (tenant) é o assinante ----------------
// O contato é o dono da conta; o telefone é o da empresa (é onde o sistema guarda).
function assinantesPorConta({ contas, donoDe, assinaturaDe, planoDe, pagamentosDe, ehInterna = () => false, ehCortesia = () => false, trialAte = (t) => t.trial_expira_em }) {
  return contas.map((t) => {
    const dono = donoDe(t) || {};
    const sub = assinaturaDe(t) || null;
    const plano = planoDe(t, sub) || null;
    const pagos = pagamentosDe(t) || [];
    const cortesia = ehCortesia(t);
    const status = cortesia && t.status !== 'cancelada' ? 'cortesia' : statusDeConta(t.status, trialAte(t));
    const natureza = naturezaDeAssinatura(status, pagos, { cortesia });
    return linha({
      tipo: 'assinante', nome: dono.nome || t.nome, email: dono.email || t.email_contato || t.contato_email || '',
      telefone: t.telefone || '', conta: t.nome,
      item: plano ? `Plano ${plano.nome}` : 'sem plano definido',
      data: (sub && sub.inicio) || t.criado_em, status, status_origem: t.status, natureza,
      // Preço de TABELA do plano — informativo. Cortesia e teste não pagam mensalidade.
      mensalidade_centavos: (plano && !['cortesia', 'em_teste'].includes(natureza)) ? (plano.preco_centavos != null ? plano.preco_centavos : plano.preco_cents) : null,
      pagamentos: pagos, origem_id: t.id, interna: ehInterna(t),
      obs: !dono.email ? 'conta sem dono ativo: contato é o da empresa' : '',
    });
  });
}
const maisRecente = (lista) => (lista || []).slice().sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))[0] || null;

// VSM, Legal e CRM: tenant_users (papel do dono) + invoices pagas.
function saasSimples(mod, papelDono) {
  return () => {
    const db = dbDe(mod);
    const usuarios = agrupar(db.prepare('SELECT tenant_id, nome, email, papel FROM tenant_users WHERE ativo = 1 ORDER BY criado_em').all(), 'tenant_id');
    const subs = agrupar(db.prepare('SELECT tenant_id, plan_id, status, inicio, criado_em FROM subscriptions').all(), 'tenant_id');
    const planos = new Map(db.prepare('SELECT id, nome, preco_centavos FROM plans').all().map((p) => [String(p.id), p]));
    const faturas = agrupar(db.prepare("SELECT tenant_id, valor_centavos, pago_em, criado_em FROM invoices WHERE status = 'paga'").all(), 'tenant_id');
    return assinantesPorConta({
      contas: db.prepare('SELECT * FROM tenants').all(),
      donoDe: (t) => { const us = usuarios.get(String(t.id)) || []; return us.find((u) => u.papel === papelDono) || null; },
      assinaturaDe: (t) => maisRecente(subs.get(String(t.id))),
      planoDe: (t, sub) => planos.get(String((sub && sub.plan_id) || t.plan_id || '')) || null,
      pagamentosDe: (t) => (faturas.get(String(t.id)) || []).map((f) => ({ em: f.pago_em || f.criado_em, centavos: f.valor_centavos })),
    });
  };
}

// Docs e Projects: identidade global (users N:N tenants) + payments aprovados.
// O plano NÃO mora no tenant: mora em `subscriptions`.
function saasGlobal(mod) {
  return () => {
    const db = dbDe(mod);
    const donos = agrupar(db.prepare(`SELECT tu.tenant_id, u.nome, u.email FROM tenant_users tu JOIN users u ON u.id = tu.user_id
      WHERE tu.papel = 'dono' AND tu.status = 'ativo' AND u.ativo = 1 ORDER BY tu.criado_em`).all(), 'tenant_id');
    const subs = agrupar(db.prepare('SELECT tenant_id, plan_id, status, inicio, criado_em FROM subscriptions').all(), 'tenant_id');
    const planos = new Map(db.prepare('SELECT id, nome, preco_centavos FROM plans').all().map((p) => [String(p.id), p]));
    const pagos = agrupar(db.prepare("SELECT tenant_id, valor_centavos, criado_em FROM payments WHERE status = 'aprovado'").all(), 'tenant_id');
    return assinantesPorConta({
      contas: db.prepare('SELECT * FROM tenants').all(),
      donoDe: (t) => (donos.get(String(t.id)) || [])[0] || null,
      assinaturaDe: (t) => maisRecente(subs.get(String(t.id))),
      planoDe: (t, sub) => planos.get(String((sub && sub.plan_id) || '')) || null,
      pagamentosDe: (t) => (pagos.get(String(t.id)) || []).map((p) => ({ em: p.criado_em, centavos: p.valor_centavos })),
      // O Projects não tem status `cortesia`: a blindagem é por COLUNA.
      ehInterna: (t) => Number(t.interno || 0) === 1,
      ehCortesia: (t) => Number(t.interno || 0) === 1 || Number(t.cortesia || 0) === 1,
    });
  };
}

// Finance: SQL em tabela de conta é proibido fora do repo.js — a leitura
// atravessa as contas uma a uma, no contexto de cada uma (como a central de
// comunicados já faz).
function finance() {
  const repo = require('../financeiro/repo'), tenancy = require('../financeiro/tenancy');
  const contas = repo.listarTenants();
  const dados = new Map();
  for (const t of contas) {
    tenancy.comTenant({ tenantId: t.id, userId: 'clientes-leitura' }, () => {
      dados.set(t.id, {
        dono: repo.listarUsuarios().find((u) => u.perfil === 'proprietario' && u.status === 'ativo') || null,
        sub: maisRecente(repo.listarAssinaturas(24)),
        faturas: repo.listarInvoices(500).filter((f) => f.status === 'paga'),
      });
    });
  }
  return assinantesPorConta({
    contas,
    donoDe: (t) => dados.get(t.id).dono || (t.contato_email ? { nome: t.contato_nome, email: t.contato_email } : null),
    assinaturaDe: (t) => dados.get(t.id).sub,
    planoDe: (t, sub) => repo.planoPorId((sub && sub.plano_id) || t.plano_id || '') || null,
    pagamentosDe: (t) => dados.get(t.id).faturas.map((f) => ({ em: f.pago_em || f.criado_em, centavos: f.valor_cents })),
    ehInterna: (t) => Number(t.interno || 0) === 1,
    ehCortesia: (t) => Number(t.interno || 0) === 1,
    trialAte: (t) => t.trial_ate,
  });
}

// ---------------- Closet Club: só a assinatura premium ----------------
// Aluguel de peça é dinheiro entre usuários (a plataforma fica com a comissão):
// não é "cliente pagante do grupo" e fica fora desta página.
function closet() {
  const db = dbDe('closet');
  const planos = new Map(db.prepare('SELECT id, nome, preco_centavos FROM plans').all().map((p) => [String(p.id), p]));
  const faturas = agrupar(db.prepare("SELECT user_id, valor_centavos, pago_em, criado_em FROM invoices WHERE status = 'paga'").all(), 'user_id');
  const subs = db.prepare(`SELECT s.id, s.user_id, s.plan_id, s.status, s.inicio, s.criado_em, u.nome, u.email, u.telefone
    FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE s.status <> 'pendente' ORDER BY s.criado_em DESC`).all();
  const jaComFatura = new Set();
  return subs.map((s) => {
    // As faturas são do USUÁRIO, não da assinatura: vão só para a mais recente dele (senão somariam em dobro).
    const pagos = jaComFatura.has(s.user_id) ? [] : (faturas.get(String(s.user_id)) || []).map((f) => ({ em: f.pago_em || f.criado_em, centavos: f.valor_centavos }));
    jaComFatura.add(s.user_id);
    const plano = planos.get(String(s.plan_id)) || null;
    return linha({ tipo: 'assinante', nome: s.nome, email: s.email, telefone: s.telefone,
      item: plano ? `Plano ${plano.nome}` : 'Premium', data: s.inicio || s.criado_em, status: s.status, status_origem: s.status,
      natureza: naturezaDeAssinatura(s.status, pagos), mensalidade_centavos: plano ? plano.preco_centavos : null,
      pagamentos: pagos, origem_id: s.id });
  });
}

// ---------------- Musique: assinatura própria + contas em teste grátis ----------------
function music() {
  const db = dbDe('music');
  const pagos = agrupar(db.prepare('SELECT assinatura_id, valor_cents, pago_em FROM assinatura_pagamentos').all(), 'assinatura_id');
  const subs = db.prepare(`SELECT a.id, a.conta_id, a.status, a.origem, a.plano, a.vagas, a.preco_cents, a.criado_em,
      c.nome, c.email, c.telefone
    FROM assinaturas_music a JOIN contas_music c ON c.id = a.conta_id WHERE a.status <> 'pendente'`).all();
  const out = subs.map((a) => {
    const pg = (pagos.get(String(a.id)) || []).map((p) => ({ em: p.pago_em, centavos: p.valor_cents }));
    const cortesia = a.status === 'cortesia' || a.origem !== 'mp';
    return linha({ tipo: 'assinante', nome: a.nome, email: a.email, telefone: a.telefone,
      item: `Musique ${a.plano}${a.vagas > 1 ? ` (${a.vagas} vagas)` : ''}`, data: a.criado_em,
      status: cortesia && a.status !== 'cancelada' ? 'cortesia' : a.status, status_origem: `${a.status}/${a.origem}`,
      natureza: naturezaDeAssinatura(a.status, pg, { cortesia }), mensalidade_centavos: cortesia ? null : a.preco_cents,
      pagamentos: pg, origem_id: a.id, interna: a.origem === 'dono' });
  });
  // Quem está nos 14 dias de teste ainda não tem assinatura: aparece como "em teste".
  const comAssinatura = new Set(subs.filter((a) => a.status !== 'cancelada').map((a) => String(a.conta_id)));
  const { teste } = require('../music/assinatura');
  for (const c of db.prepare("SELECT id, nome, email, telefone, criado_em FROM contas_music WHERE status = 'ativo'").all()) {
    if (comAssinatura.has(String(c.id))) continue;
    const t = teste(c);
    if (!t.ativo) continue;
    out.push(linha({ tipo: 'assinante', nome: c.nome, email: c.email, telefone: c.telefone, item: 'Musique — teste grátis',
      data: c.criado_em, status: 'em_teste', status_origem: 'sem assinatura', natureza: 'em_teste',
      origem_id: 'conta:' + c.id, obs: `teste termina em ${String(t.fim).slice(0, 10)}` }));
  }
  return out;
}

// ---------------- Alta Vista 360: serviço por projeto (não é assinatura) ----------------
function altaVista() {
  const db = dbDe('alta-vista');
  const parcelas = agrupar(db.prepare("SELECT projeto_id, valor_centavos, status, pago_em, criado_em FROM parcelas WHERE status IN ('aprovado', 'reembolsado')").all(), 'projeto_id');
  const ST = { awaiting_payment: 'pendente', cancelled: 'cancelada', completed: 'concluida', delivered: 'concluida', archived: 'concluida' };
  const out = [];
  for (const p of db.prepare(`SELECT p.id, p.titulo, p.status, p.criado_em, c.nome, c.email, c.whatsapp
      FROM projetos p JOIN clientes c ON c.id = p.cliente_id`).all()) {
    const ps = parcelas.get(String(p.id)) || [];
    const pagos = ps.filter((x) => x.status === 'aprovado').map((x) => ({ em: x.pago_em || x.criado_em, centavos: x.valor_centavos }));
    const reemb = ps.filter((x) => x.status === 'reembolsado').reduce((s, x) => s + cent(x.valor_centavos), 0);
    // Projeto que só existe aguardando o 1º pagamento ainda não é cliente pagante.
    if (!pagos.length && !reemb && p.status === 'awaiting_payment') continue;
    out.push(linha({ tipo: 'comprador', nome: p.nome, email: p.email, telefone: p.whatsapp, item: p.titulo,
      data: (pagos[0] && pagos[0].em) || p.criado_em, status: ST[p.status] || 'em_andamento', status_origem: p.status,
      natureza: pagos.length ? 'pago' : reemb ? 'reembolsado' : 'sem_pagamento', pagamentos: pagos,
      reembolsado_centavos: reemb, origem_id: p.id }));
  }
  return out;
}

// ---------------- Origena: PostgreSQL próprio, com RLS por família ----------------
// A consulta atravessa as famílias UMA A UMA, dentro do escopo de cada uma
// (é o que as rotas de staff da própria Origena fazem: `orders` e
// `subscriptions` têm RLS forçada). Só dinheiro e contato do responsável —
// nada de acervo.
const ORIGENA_MAX_FAMILIAS = 500;
async function consultarOrigena({ db, tenancy } = {}) {
  db = db || require('../origena/db');
  if (!db.configurado()) {
    throw Object.assign(new Error('O banco da Origena (PostgreSQL próprio) não está configurado neste processo — falta ORIGENA_DATABASE_URL.'), { naoIntegrada: true });
  }
  tenancy = tenancy || require('../origena/tenancy');
  const familias = await db.todas(
    `SELECT id, nome, status, created_at FROM families WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ${ORIGENA_MAX_FAMILIAS + 1}`);
  const cortou = familias.length > ORIGENA_MAX_FAMILIAS;
  const out = [];
  for (const f of familias.slice(0, ORIGENA_MAX_FAMILIAS)) {
    out.push(await tenancy.comEscopo(f.id, async (t) => ({
      familia: f,
      dono: await t.uma(`SELECT u.nome, u.email FROM family_memberships m JOIN users u ON u.id = m.user_id
          WHERE m.family_id = $1 AND m.papel = 'OWNER' AND m.status = 'ativo' ORDER BY m.created_at LIMIT 1`, [f.id]),
      assinatura: await t.uma(`SELECT s.id, s.status, s.gateway, s.inicio, s.ciclo, s.preco_centavos, s.trial_ate,
            p.nome AS plano
          FROM subscriptions s JOIN plans p ON p.id = s.plan_id
          WHERE s.family_id = $1 ORDER BY s.inicio DESC LIMIT 1`, [f.id]),
      pedidos: await t.todas(`SELECT id, tipo, descricao, total_centavos, status, pago_em, created_at
          FROM orders WHERE family_id = $1 AND status IN ('pago', 'reembolsado') ORDER BY created_at`, [f.id]),
    })));
  }
  return { familias: out, cortou };
}
function normalizarOrigena({ familias }) {
  const out = [];
  for (const { familia: f, dono, assinatura: s, pedidos } of familias) {
    const quem = { nome: (dono && dono.nome) || f.nome, email: (dono && dono.email) || '', telefone: '', conta: `Família ${f.nome}` };
    const daAssinatura = (pedidos || []).filter((o) => o.tipo === 'assinatura');
    if (s) {
      const pagos = daAssinatura.filter((o) => o.status === 'pago').map((o) => ({ em: o.pago_em || o.created_at, centavos: o.total_centavos }));
      const status = s.status === 'trial' ? statusDeConta('trial', s.trial_ate) : s.status;
      out.push(linha({ ...quem, tipo: 'assinante', item: `${s.plano} (${s.ciclo || 'mensal'})`, data: s.inicio, status, status_origem: `${s.status}/${s.gateway}`,
        natureza: naturezaDeAssinatura(status, pagos, { precoZero: cent(s.preco_centavos) === 0 }),
        mensalidade_centavos: s.preco_centavos, pagamentos: pagos,
        reembolsado_centavos: daAssinatura.filter((o) => o.status === 'reembolsado').reduce((a, o) => a + cent(o.total_centavos), 0),
        origem_id: 'assinatura:' + s.id }));
    }
    for (const o of (pedidos || []).filter((x) => x.tipo !== 'assinatura')) {
      const reemb = o.status === 'reembolsado';
      out.push(linha({ ...quem, tipo: 'comprador', item: o.descricao || 'Créditos', data: o.pago_em || o.created_at,
        status: reemb ? 'reembolsada' : 'paga', status_origem: o.status, natureza: reemb ? 'reembolsado' : 'pago',
        pagamentos: [{ em: o.pago_em || o.created_at, centavos: o.total_centavos }], reembolsado_centavos: reemb ? o.total_centavos : 0,
        origem_id: 'pedido:' + o.id }));
    }
  }
  return out;
}
async function origena(dep) {
  const bruto = await consultarOrigena(dep);
  const linhas = normalizarOrigena(bruto);
  if (bruto.cortou) linhas.aviso = `Só as ${ORIGENA_MAX_FAMILIAS} famílias mais recentes foram lidas.`;
  return linhas;
}

module.exports = {
  livraria, academy, saasSimples, saasGlobal, finance, closet, music, altaVista, origena,
  _int: { consultarOrigena, normalizarOrigena, statusDeConta, naturezaDeAssinatura, linha },
};
