// =====================================================================
// Musique — ASSINATURA (28/09/2026, desenho aprovado pelo Augusto).
//
//   • R$ 250,00/mês, preapproval MENSAL hospedado no Mercado Pago (o cartão
//     nunca passa por aqui). Preço editável no staff, sem deploy: o Augusto
//     já avisou que vai rever o valor.
//   • O app continua TODO grátis. A assinatura dá CORTESIA dos cursos de
//     música da Academia, pelo MESMO e-mail — e só com o e-mail confirmado
//     no Musique (senão quem assina com o e-mail de outra pessoa jogaria a
//     matrícula na conta dela).
//   • A cortesia vale ENQUANTO a assinatura estiver ativa. Terminou (cancelou
//     ou passou da tolerância sem pagar): sai o que o Musique deu — e só
//     isso; curso comprado fica. O progresso nas aulas fica guardado.
//
// A Academia NÃO é importada: a ponte chega injetada em `academia.cortesia`
// (conceder/revogar por e-mail). Os dois sistemas seguem independentes.
//
// Duas armadilhas do MP, registradas na memória e já pagas em outros módulos:
//   1. `notification_url` vai NO CORPO do POST /preapproval — o painel de
//      webhooks do MP não cobre assinatura;
//   2. a mensalidade chega como `subscription_authorized_payment` e se lê em
//      /authorized_payments/{id}, não como `payment`.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO } = require('./db');
const repo = require('./repo');
const contas = require('./contas');
const webhookMP = require('../nucleo/webhook-mp');

// O Musique é PAGO (Augusto, 28/09/2026): R$ 250/mês, com teste grátis de
// 14 dias para conta nova — e para as contas que já existiam no lançamento
// da cobrança, contados a partir dele. Nada de graça depois do teste.
const PLANO_PADRAO = { preco_cents: 25000, carencia_dias: 5, teste_dias: 14, nome: 'Musique — assinatura mensal' };
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const novoId = () => crypto.randomBytes(9).toString('base64url');

let _mp = null;                         // (caminho, opts) => json   (mpFetch do server.js)
let _academia = {};                     // { conceder({email,nome}) , revogar({email}) }
let _avisar = async () => {};
let _baseApi = 'https://villela-stay-backend.onrender.com';
let _baseSite = 'https://musique.villelastay.com.br';

function configurar({ mpFetch, cortesia, avisar, baseApi, baseSite } = {}) {
  if (typeof mpFetch === 'function') _mp = mpFetch;
  if (cortesia && typeof cortesia.conceder === 'function') _academia = cortesia;
  if (typeof avisar === 'function') _avisar = (m) => Promise.resolve(avisar(m)).catch(() => {});
  if (baseApi) _baseApi = String(baseApi).replace(/\/+$/, '');
  if (baseSite) _baseSite = String(baseSite).replace(/\/+$/, '');
  // A data em que o Musique passou a ser pago: conta criada antes dela ganha
  // o teste a partir DELA (ninguém é bloqueado de surpresa). Gravada uma vez.
  const cfg = repo.Config.get('assinatura', {}) || {};
  if (!cfg.pago_desde) repo.Config.set('assinatura', { ...cfg, pago_desde: nowISO() });
  return { cobranca: cobrancaLigada(), cortesia: !!_academia.conceder };
}

/** Teste grátis da conta: fim e dias restantes. */
function teste(c) {
  const p = plano();
  const base = Math.max(Date.parse(c.criado_em) || 0, Date.parse(p.pago_desde || '') || 0);
  const fim = base + (Number(p.teste_dias) || 0) * 864e5;
  return { fim: new Date(fim).toISOString(), ativo: Date.now() < fim, dias_restantes: Math.max(0, Math.ceil((fim - Date.now()) / 864e5)) };
}

/** Quem cancelou continua até o fim do mês que já pagou. */
function pagoAte(contaId) {
  const u = db.prepare(`SELECT ultimo_pagamento_em FROM assinaturas_music WHERE conta_id = ? AND status = 'cancelada'
    AND ultimo_pagamento_em <> '' ORDER BY ultimo_pagamento_em DESC LIMIT 1`).get(contaId);
  if (!u) return null;
  const fim = Date.parse(u.ultimo_pagamento_em) + 30 * 864e5;
  return fim > Date.now() ? new Date(fim).toISOString() : null;
}

/** Pode USAR o Musique? Assinatura com acesso, cortesia, período já pago ou teste em curso. */
function acessoDaConta(contaId) {
  const c = contas.Contas.porId(contaId);
  if (!c) return { acesso: false, motivo: 'sem-conta' };
  const a = vigente(contaId);
  if (temAcesso(a)) return { acesso: true, motivo: a.status === 'cortesia' ? 'cortesia' : 'assinatura' };
  const ate = pagoAte(contaId);
  if (ate) return { acesso: true, motivo: 'pago_ate', ate };
  const t = teste(c);
  if (t.ativo) return { acesso: true, motivo: 'teste', teste: t };
  return { acesso: false, motivo: 'sem-assinatura', teste: t };
}

class ErroAssinatura extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

const plano = () => ({ ...PLANO_PADRAO, ...(repo.Config.get('assinatura', {}) || {}) });
const cobrancaLigada = () => !!(_mp && (process.env.MP_ACCESS_TOKEN || _mp.__mock));

function evento(a, tipo, detalhe = '') {
  db.prepare('INSERT INTO assinatura_eventos (assinatura_id, conta_id, tipo, detalhe, quando) VALUES (?, ?, ?, ?, ?)')
    .run(a ? a.id : '', a ? a.conta_id : '', s(tipo, 60), s(typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe), 500), nowISO());
}
const porId = (id) => db.prepare('SELECT * FROM assinaturas_music WHERE id = ?').get(id) || null;
const porPreapproval = (ref) => (ref ? db.prepare('SELECT * FROM assinaturas_music WHERE preapproval_id = ? ORDER BY criado_em DESC LIMIT 1').get(String(ref)) : null) || null;
function atualizar(id, campos) {
  const k = Object.keys(campos);
  db.prepare(`UPDATE assinaturas_music SET ${k.map((c) => c + ' = ?').join(', ')}, atualizado_em = ? WHERE id = ?`)
    .run(...k.map((c) => campos[c]), nowISO(), id);
  return porId(id);
}

/** A assinatura que vale agora (a mais recente não encerrada). */
function vigente(contaId) {
  return db.prepare(`SELECT * FROM assinaturas_music WHERE conta_id = ? AND status IN ('pendente','ativa','inadimplente','cortesia')
    ORDER BY CASE status WHEN 'cortesia' THEN 0 WHEN 'ativa' THEN 1 WHEN 'inadimplente' THEN 2 ELSE 3 END, criado_em DESC LIMIT 1`).get(contaId) || null;
}

/** Dá direito aos cursos? Ativa, cortesia, ou inadimplente ainda na tolerância. */
function temAcesso(a, agora = Date.now()) {
  if (!a) return false;
  if (a.status === 'ativa' || a.status === 'cortesia') return true;
  if (a.status === 'inadimplente' && a.inadimplente_desde) {
    return agora < Date.parse(a.inadimplente_desde) + plano().carencia_dias * 864e5;
  }
  return false;
}

// ------------------------------------------------------------------ cortesia
/**
 * Põe a Academia de acordo com a assinatura: com acesso e e-mail confirmado,
 * matricula (cortesia) nos cursos de música publicados; sem acesso, revoga o
 * que o Musique deu. Idempotente — roda no webhook, na confirmação do
 * e-mail e na rotina (curso novo publicado entra sozinho).
 */
async function sincronizar(contaId) {
  const c = contas.Contas.porId(contaId);
  if (!c) return { resultado: 'sem-conta' };
  const a = vigente(contaId);
  const reg = db.prepare('SELECT * FROM cortesia_academia WHERE conta_id = ?').get(contaId);
  // O TESTE grátis não dá curso: os cursos da Academia também são vendidos
  // lá, e dar de graça no teste seria vender por zero.
  const deve = (temAcesso(a) || !!pagoAte(contaId)) && !!c.email_verificado && c.status === 'ativo';
  if (!_academia.conceder) return { resultado: 'academia-indisponivel', deve };
  if (deve) {
    const r = await _academia.conceder({ email: c.email, nome: c.nome, novaConta: !(reg && reg.academia_user_id) });
    db.prepare(`INSERT INTO cortesia_academia (conta_id, email, academia_user_id, cursos, concedida_em, revogada_em, ultimo_sync)
      VALUES (?, ?, ?, ?, ?, '', ?) ON CONFLICT(conta_id) DO UPDATE SET email = excluded.email, academia_user_id = excluded.academia_user_id,
      cursos = excluded.cursos, revogada_em = '', ultimo_sync = excluded.ultimo_sync,
      concedida_em = CASE WHEN cortesia_academia.revogada_em <> '' OR cortesia_academia.concedida_em = '' THEN excluded.concedida_em ELSE cortesia_academia.concedida_em END`)
      .run(contaId, c.email, s(r.academia_user_id, 80), Number(r.cursos) || 0, nowISO(), nowISO());
    if (!reg || reg.revogada_em || (Number(r.novos) || 0) > 0) evento(a, 'cortesia.concedida', { cursos: r.cursos, novos: r.novos || 0 });
    return { resultado: 'concedida', cursos: r.cursos, novos: r.novos || 0 };
  }
  if (reg && !reg.revogada_em) {
    const r = await _academia.revogar({ email: reg.email });
    db.prepare('UPDATE cortesia_academia SET revogada_em = ?, ultimo_sync = ? WHERE conta_id = ?').run(nowISO(), nowISO(), contaId);
    evento(a || { id: '', conta_id: contaId }, 'cortesia.revogada', { revogadas: r && r.revogadas });
    return { resultado: 'revogada' };
  }
  return { resultado: 'nada-a-fazer', motivo: !c.email_verificado ? 'e-mail não confirmado' : 'sem assinatura com acesso' };
}
const sincronizarSemErro = (contaId) => sincronizar(contaId).catch((e) => ({ resultado: 'erro', erro: e.message }));

// ------------------------------------------------------------------ assinar
async function assinar(contaId) {
  const c = contas.Contas.porId(contaId);
  if (!c) throw new ErroAssinatura('Conta não encontrada.', 404);
  if (!c.email_verificado) throw new ErroAssinatura('Confirme o seu e-mail antes de assinar: é por ele que os cursos chegam na Academia.');
  const atual = vigente(contaId);
  if (atual && (atual.status === 'ativa' || atual.status === 'cortesia')) throw new ErroAssinatura('Você já tem assinatura ativa.');
  if (!cobrancaLigada()) throw new ErroAssinatura('O pagamento online ainda não está ligado. Tente de novo mais tarde.', 503);
  const p = plano();
  // Pendente anterior sem pagamento: reaproveita a linha, com link novo.
  const id = atual && atual.status === 'pendente' ? atual.id : novoId();
  const pre = await _mp('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: p.nome,
      external_reference: `musique:${contaId}:${id}`,
      payer_email: c.email,
      back_url: `${_baseSite}/music/app#conta`,
      notification_url: `${_baseApi}/music/api/pagamentos/mp`,   // NO CORPO — o painel do MP não cobre assinatura
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: Number((p.preco_cents / 100).toFixed(2)), currency_id: 'BRL' },
      status: 'pending',
    }),
  });
  const link = s(pre.init_point || pre.sandbox_init_point, 1000);
  if (atual && atual.status === 'pendente') atualizar(id, { preapproval_id: String(pre.id), link, preco_cents: p.preco_cents });
  else {
    db.prepare(`INSERT INTO assinaturas_music (id, conta_id, status, origem, preco_cents, preapproval_id, link, criado_em, atualizado_em)
      VALUES (?, ?, 'pendente', 'mp', ?, ?, ?, ?, ?)`).run(id, contaId, p.preco_cents, String(pre.id), link, nowISO(), nowISO());
  }
  evento(porId(id), 'assinatura.iniciada', { preapproval: String(pre.id), preco_cents: p.preco_cents });
  return { link, assinatura_id: id };
}

async function cancelar(contaId, motivo = 'cancelada pelo assinante') {
  const a = vigente(contaId);
  if (!a || a.status === 'cortesia') throw new ErroAssinatura(a ? 'Esta é uma assinatura cortesia: fale com o suporte.' : 'Você não tem assinatura para cancelar.');
  let mpOk = true;
  if (a.preapproval_id && _mp) {
    try { await _mp(`/preapproval/${a.preapproval_id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }); }
    catch (e) { mpOk = false; _avisar(`⚠️ Musique: cancelamento local feito, mas o Mercado Pago recusou (${a.preapproval_id}): ${e.message}. Cancele no painel do MP.`); }
  }
  atualizar(a.id, { status: 'cancelada', encerrada_em: nowISO(), motivo: s(motivo, 200) });
  evento(a, 'assinatura.cancelada', { motivo, mp: mpOk });
  await sincronizarSemErro(contaId);
  return { ok: true, mp: mpOk };
}

// ------------------------------------------------------------------ webhook
function registrarPagamento(a, ref, valorCents) {
  if (ref && db.prepare('SELECT 1 FROM assinatura_pagamentos WHERE ref = ?').get(ref)) return { resultado: 'ja-registrado' };
  if (ref) db.prepare('INSERT INTO assinatura_pagamentos (ref, assinatura_id, valor_cents, pago_em) VALUES (?, ?, ?, ?)').run(ref, a.id, valorCents || a.preco_cents, nowISO());
  const eraAtiva = a.status === 'ativa';
  atualizar(a.id, { status: 'ativa', inadimplente_desde: '', ultimo_pagamento_em: nowISO() });
  evento(a, 'pagamento.recebido', { ref });
  if (!eraAtiva) {
    const c = contas.Contas.porId(a.conta_id);
    _avisar(`💚 Musique: novo assinante — ${c ? c.nome : a.conta_id} (R$ ${(a.preco_cents / 100).toFixed(2).replace('.', ',')}/mês).`);
  }
  return { resultado: 'registrado' };
}

function assinaturaDaReferencia(externalReference, preapprovalId) {
  const m = /^musique:([^:]+):([^:]+)$/.exec(String(externalReference || ''));
  if (m) { const a = porId(m[2]); if (a && a.conta_id === m[1]) return a; }
  return porPreapproval(preapprovalId);
}

/** Nunca confia no corpo: toda informação é relida na API do MP. */
async function processarWebhook(body = {}, query = {}) {
  const tipo = body.type || query.type || body.topic || query.topic;
  const id = (body.data && body.data.id) || query['data.id'] || query.id;
  if (!id) return { ok: true, ignorado: 'sem id' };
  if (!webhookMP.idSeguro(id)) return { ok: true, ignorado: 'id inválido' };
  if (!_mp) return { ok: true, ignorado: 'mp desligado' };

  if (tipo === 'subscription_preapproval' || tipo === 'preapproval') {
    const pre = await _mp(`/preapproval/${id}`);
    const a = assinaturaDaReferencia(pre.external_reference, id);
    if (!a) return { ok: true, ignorado: 'assinatura não encontrada' };
    let r;
    if (pre.status === 'authorized') r = registrarPagamento(a, `preapproval:${id}`, a.preco_cents);
    else if (pre.status === 'paused') {
      atualizar(a.id, { status: 'inadimplente', inadimplente_desde: a.inadimplente_desde || nowISO() });
      evento(a, 'assinatura.pausada'); r = { resultado: 'inadimplente' };
    } else if (pre.status === 'cancelled') {
      atualizar(a.id, { status: 'cancelada', encerrada_em: nowISO(), motivo: 'cancelada no Mercado Pago' });
      evento(a, 'assinatura.cancelada', { motivo: 'mp' }); r = { resultado: 'cancelada' };
      const c = contas.Contas.porId(a.conta_id);
      _avisar(`⚠️ Musique: assinatura cancelada — ${c ? c.nome : a.conta_id}.`);
    } else r = { resultado: 'ignorado', status: pre.status };
    await sincronizarSemErro(a.conta_id);
    return { ok: true, ...r };
  }

  if (tipo === 'subscription_authorized_payment') {
    const aut = await _mp(`/authorized_payments/${id}`);
    const a = porPreapproval(aut.preapproval_id);
    if (!a) return { ok: true, ignorado: 'assinatura não encontrada' };
    const pago = aut.status === 'processed' && (!aut.payment || aut.payment.status === 'approved');
    if (!pago) {
      // Tentativa recusada: entra na tolerância; o acesso só cai depois dela.
      if (aut.payment && ['rejected', 'cancelled'].includes(aut.payment.status) && a.status === 'ativa') {
        atualizar(a.id, { status: 'inadimplente', inadimplente_desde: nowISO() });
        evento(a, 'pagamento.recusado', { ref: String(aut.payment.id || id) });
      }
      return { ok: true, ignorado: `cobrança ${aut.status}${aut.payment ? '/' + aut.payment.status : ''}` };
    }
    const r = registrarPagamento(a, String((aut.payment && aut.payment.id) || aut.id), Math.round((Number(aut.transaction_amount) || 0) * 100));
    await sincronizarSemErro(a.conta_id);
    return { ok: true, ...r };
  }

  if (tipo === 'payment') {
    const pag = await _mp(`/v1/payments/${id}`);
    if (pag.status !== 'approved') return { ok: true, ignorado: `pagamento ${pag.status}` };
    const a = assinaturaDaReferencia(pag.external_reference, '');
    if (!a) return { ok: true, ignorado: 'assinatura não encontrada' };
    const r = registrarPagamento(a, String(pag.id), Math.round((Number(pag.transaction_amount) || 0) * 100));
    await sincronizarSemErro(a.conta_id);
    return { ok: true, ...r };
  }
  return { ok: true, ignorado: `tipo ${tipo}` };
}

// ------------------------------------------------------------------ cortesia manual e dono
function concederCortesia(contaId, motivo, origem = 'cortesia') {
  const c = contas.Contas.porId(contaId);
  if (!c) throw new ErroAssinatura('Conta não encontrada.', 404);
  const a = vigente(contaId);
  if (a && a.status === 'cortesia') return a;
  if (a && ['pendente', 'ativa', 'inadimplente'].includes(a.status)) {
    throw new ErroAssinatura('Esta conta tem assinatura paga em andamento: cancele-a antes de dar cortesia, para não cobrar e dar ao mesmo tempo.');
  }
  const id = novoId();
  db.prepare(`INSERT INTO assinaturas_music (id, conta_id, status, origem, preco_cents, motivo, criado_em, atualizado_em)
    VALUES (?, ?, 'cortesia', ?, 0, ?, ?, ?)`).run(id, contaId, origem, s(motivo, 200), nowISO(), nowISO());
  evento(porId(id), 'cortesia.criada', { motivo, origem });
  return porId(id);
}
function encerrarCortesia(contaId, motivo = 'encerrada pelo staff') {
  const a = vigente(contaId);
  if (!a || a.status !== 'cortesia') throw new ErroAssinatura('Esta conta não tem assinatura cortesia.');
  if (a.origem === 'dono') throw new ErroAssinatura('A conta do dono é vitalícia.');
  atualizar(a.id, { status: 'cancelada', encerrada_em: nowISO(), motivo: s(motivo, 200) });
  evento(a, 'cortesia.encerrada', { motivo });
  return true;
}
/** A conta do Augusto é cortesia vitalícia (regra da casa em todos os SaaS). */
function garantirDono() {
  const d = db.prepare("SELECT id FROM contas_music WHERE origem = 'dono' LIMIT 1").get();
  if (!d) return false;
  const a = vigente(d.id);
  if (a && a.status === 'cortesia') return true;
  if (a) return false;   // nunca sobrescreve uma assinatura dele que exista
  concederCortesia(d.id, 'conta do dono — vitalícia', 'dono');
  return true;
}

// ------------------------------------------------------------------ rotina
/**
 * Passa pelas assinaturas: inadimplente que estourou a tolerância perde o
 * acesso (e a cortesia sai); quem tem acesso recebe curso novo publicado.
 */
async function ciclo() {
  const r = { sincronizadas: 0, sem_acesso: 0 };
  const ids = db.prepare(`SELECT DISTINCT conta_id FROM assinaturas_music WHERE status IN ('ativa','cortesia','inadimplente','cancelada')
    UNION SELECT conta_id FROM cortesia_academia WHERE revogada_em = ''`).all().map((x) => x.conta_id);
  for (const id of ids) {
    const a = vigente(id);
    if (a && a.status === 'inadimplente' && !temAcesso(a)) r.sem_acesso++;
    const x = await sincronizarSemErro(id);
    if (x.resultado === 'concedida' || x.resultado === 'revogada') r.sincronizadas++;
  }
  return r;
}

// ------------------------------------------------------------------ leitura
function estadoDaConta(contaId) {
  const c = contas.Contas.porId(contaId);
  const a = vigente(contaId);
  const p = plano();
  const reg = db.prepare('SELECT * FROM cortesia_academia WHERE conta_id = ?').get(contaId);
  const uso = acessoDaConta(contaId);
  return {
    plano: { nome: p.nome, preco_cents: p.preco_cents, carencia_dias: p.carencia_dias, teste_dias: p.teste_dias },
    uso,
    cobranca_ligada: cobrancaLigada(),
    email_verificado: !!(c && c.email_verificado),
    assinatura: a ? { status: a.status, origem: a.origem, desde: a.criado_em, preco_cents: a.preco_cents, ultimo_pagamento_em: a.ultimo_pagamento_em,
      inadimplente_desde: a.inadimplente_desde, link: a.status === 'pendente' ? a.link : '' } : null,
    acesso: temAcesso(a),
    cortesia_academia: reg && !reg.revogada_em ? { email: reg.email, cursos: reg.cursos, desde: reg.concedida_em } : null,
  };
}

function resumoStaff() {
  const p = plano();
  const porStatus = db.prepare('SELECT status, COUNT(*) n FROM assinaturas_music GROUP BY status').all();
  const ativas = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(preco_cents),0) c FROM assinaturas_music WHERE status = 'ativa'").get();
  const lista = db.prepare(`SELECT a.id, a.conta_id, a.status, a.origem, a.preco_cents, a.criado_em, a.ultimo_pagamento_em, a.inadimplente_desde,
      a.motivo, c.nome, c.email, c.email_verificado, ca.cursos, ca.revogada_em
    FROM assinaturas_music a LEFT JOIN contas_music c ON c.id = a.conta_id LEFT JOIN cortesia_academia ca ON ca.conta_id = a.conta_id
    WHERE a.status <> 'cancelada' OR a.atualizado_em > ? ORDER BY a.atualizado_em DESC LIMIT 300`)
    .all(new Date(Date.now() - 60 * 864e5).toISOString());
  return { plano: p, cobranca_ligada: cobrancaLigada(), por_status: porStatus, ativas: ativas.n, receita_mensal_cents: ativas.c, assinaturas: lista,
    eventos: db.prepare('SELECT * FROM assinatura_eventos ORDER BY id DESC LIMIT 50').all() };
}

function definirPlano({ preco_cents, carencia_dias, teste_dias }) {
  const atual = repo.Config.get('assinatura', {}) || {};
  const novo = { ...atual };
  if (preco_cents !== undefined) {
    const v = Math.round(Number(preco_cents));
    if (!(v >= 100 && v <= 10000000)) throw new ErroAssinatura('Preço inválido.');
    novo.preco_cents = v;
  }
  if (carencia_dias !== undefined) {
    const d = Math.round(Number(carencia_dias));
    if (!(d >= 0 && d <= 60)) throw new ErroAssinatura('Tolerância entre 0 e 60 dias.');
    novo.carencia_dias = d;
  }
  if (teste_dias !== undefined) {
    const t = Math.round(Number(teste_dias));
    if (!(t >= 0 && t <= 90)) throw new ErroAssinatura('Teste entre 0 e 90 dias.');
    novo.teste_dias = t;
  }
  repo.Config.set('assinatura', novo);
  return plano();
}

module.exports = {
  configurar, plano, cobrancaLigada, vigente, temAcesso, acessoDaConta, teste, sincronizar, assinar, cancelar, processarWebhook,
  concederCortesia, encerrarCortesia, garantirDono, ciclo, estadoDaConta, resumoStaff, definirPlano, ErroAssinatura,
  _conferirWebhook: webhookMP.conferir,
};
