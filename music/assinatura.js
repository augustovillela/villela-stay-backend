// =====================================================================
// Musique — ASSINATURA (28/09/2026, desenho aprovado pelo Augusto).
//
//   • Planos Starter/Professional/Business/Enterprise (R$ 39 a 99/mês), preapproval MENSAL hospedado no Mercado Pago (o cartão
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
const { montarAviso, pessoa, reais } = require('../nucleo/aviso');

// O Musique é PAGO (Augusto, 28/09/2026; planos novos em 05/11/2026), com teste grátis de
// 15 dias para conta nova — e para as contas que já existiam no lançamento
// da cobrança, contados a partir dele. Nada de graça depois do teste.
// PLANOS (Augusto, 05/11/2026): mesmos nomes dos outros sistemas — Avaliação, Starter,
// Professional, Business e Enterprise — e preços de música (mais baixos que nas outras áreas).
// O que muda de um plano para outro é o NÚMERO DE PESSOAS: a titular distribui as vagas
// (mecanismo da antiga "banda"). Todos têm tudo liberado e a cortesia dos cursos da Academia.
// O preço de cada plano mora na config (`precos_planos`) e o staff muda sem deploy.
const PLANOS_PADRAO = [
  { slug: 'starter', nome: 'Starter', preco_cents: 3900, vagas: 1 },
  { slug: 'professional', nome: 'Professional', preco_cents: 5900, vagas: 3 },
  { slug: 'business', nome: 'Business', preco_cents: 6900, vagas: 5 },
  { slug: 'enterprise', nome: 'Enterprise', preco_cents: 9900, vagas: 10 },
];
const PLANO_PADRAO = { carencia_dias: 5, teste_dias: 15, nome: 'Musique — assinatura mensal' };
const NOME_AVALIACAO = 'Avaliação (15 dias)';
/** Os 4 planos pagos com o preço vigente (config `precos_planos` sobre o padrão). */
function catalogo(cfg = repo.Config.get('assinatura', {}) || {}) {
  const ov = cfg.precos_planos || {};
  return PLANOS_PADRAO.map((x) => ({ ...x, preco_cents: Number.isInteger(ov[x.slug]) ? ov[x.slug] : x.preco_cents }));
}
/** Aceita o slug novo e os nomes antigos (individual → starter, banda → business). */
function planoPorSlug(slug) {
  const k = { individual: 'starter', banda: 'business' }[slug] || slug;
  return catalogo().find((x) => x.slug === k) || null;
}
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const novoId = () => crypto.randomBytes(9).toString('base64url');

// Aviso ao dono: consulta que falha não derruba o webhook, sai o id da conta.
function contatoDaConta(contaId) {
  try { const c = contas.Contas.porId(contaId); return (c && pessoa(c.nome, c.email, c.telefone)) || contaId; } catch (_) { return contaId; }
}
const camposDaAssinatura = (a) => [
  ['Assinante', contatoDaConta(a.conta_id)],
  ['Plano', (a.plano_slug || (a.plano === 'banda' ? 'banda' : 'starter')) + (a.vagas > 1 ? ` (${a.vagas} vagas)` : '')],
  ['Valor', reais(a.preco_cents) + '/mês'],
  ['Preapproval MP', a.preapproval_id],
];

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
  // Teste grátis padronizado em 15 dias (Augusto, 05/11/2026): quem ainda estava no
  // padrão antigo (14) passa para 15, uma vez. Valor que o Augusto definiu diferente fica.
  const cfg2 = repo.Config.get('assinatura', {}) || {};
  if (!cfg2.teste_15_aplicado) repo.Config.set('assinatura', { ...cfg2, ...(cfg2.teste_dias === 14 ? { teste_dias: 15 } : {}), teste_15_aplicado: true });
  return { cobranca: cobrancaLigada(), cortesia: !!_academia.conceder };
}

/** Teste grátis da conta: fim e dias restantes. */
function teste(c) {
  const p = plano();
  const base = Math.max(Date.parse(c.criado_em) || 0, Date.parse(p.pago_desde || '') || 0);
  const fim = base + (Number(p.teste_dias) || 0) * 864e5;
  return { fim: new Date(fim).toISOString(), ativo: Date.now() < fim, dias_restantes: Math.max(0, Math.ceil((fim - Date.now()) / 864e5)) };
}

/** Até quando uma assinatura CANCELADA ainda vale (fim do mês já pago). */
function pagoAteDe(a) {
  if (!a || a.status !== 'cancelada' || !a.ultimo_pagamento_em) return null;
  const fim = Date.parse(a.ultimo_pagamento_em) + 30 * 864e5;
  return fim > Date.now() ? new Date(fim).toISOString() : null;
}
/** Quem cancelou continua até o fim do mês que já pagou. */
function pagoAte(contaId) {
  const u = db.prepare(`SELECT * FROM assinaturas_music WHERE conta_id = ? AND status = 'cancelada'
    AND ultimo_pagamento_em <> '' ORDER BY ultimo_pagamento_em DESC LIMIT 1`).get(contaId);
  return pagoAteDe(u);
}

// ------------------------------------------------------------------ vagas do plano banda
/** A assinatura de banda em que a conta ocupa uma vaga (se houver). */
function bandaDaConta(contaId) {
  return db.prepare(`SELECT a.* FROM assinatura_vagas v JOIN assinaturas_music a ON a.id = v.assinatura_id
    WHERE v.conta_id = ? AND v.removida_em = '' AND a.plano = 'banda'
    ORDER BY CASE a.status WHEN 'ativa' THEN 0 WHEN 'inadimplente' THEN 1 WHEN 'pendente' THEN 2 ELSE 3 END, a.criado_em DESC LIMIT 1`).get(contaId) || null;
}
const acessoPelaBanda = (contaId) => { const b = bandaDaConta(contaId); return b && (temAcesso(b) || pagoAteDe(b)) ? b : null; };
function vagasDe(assinaturaId) {
  return db.prepare(`SELECT v.conta_id, v.adicionada_em, c.nome, c.email, c.email_verificado FROM assinatura_vagas v
    LEFT JOIN contas_music c ON c.id = v.conta_id WHERE v.assinatura_id = ? AND v.removida_em = '' ORDER BY v.id`).all(assinaturaId);
}
function assinaturaBandaDoTitular(titularId) {
  return db.prepare(`SELECT * FROM assinaturas_music WHERE conta_id = ? AND plano = 'banda' AND status IN ('pendente','ativa','inadimplente')
    ORDER BY criado_em DESC LIMIT 1`).get(titularId) || null;
}
async function adicionarVaga(titularId, email) {
  const a = assinaturaBandaDoTitular(titularId);
  if (!a) throw new ErroAssinatura('Você não tem plano banda.');
  const c = contas.Contas.porEmail(email);
  if (!c) throw new ErroAssinatura('Não há conta do Musique com este e-mail. Peça para a pessoa criar a conta primeiro (o teste grátis dela começa na hora).');
  const ocupadas = vagasDe(a.id);
  if (ocupadas.some((v) => v.conta_id === c.id)) throw new ErroAssinatura('Esta pessoa já está no seu plano banda.');
  if (ocupadas.length >= a.vagas) throw new ErroAssinatura(`As ${a.vagas} vagas estão ocupadas. Tire alguém para colocar outra pessoa.`);
  const outra = bandaDaConta(c.id);
  if (outra && outra.id !== a.id && (temAcesso(outra) || outra.status === 'pendente')) throw new ErroAssinatura('Esta pessoa já ocupa uma vaga em outro plano banda.');
  db.prepare('INSERT INTO assinatura_vagas (assinatura_id, conta_id, adicionada_em) VALUES (?, ?, ?)').run(a.id, c.id, nowISO());
  evento(a, 'banda.vaga.adicionada', { conta: c.id });
  await sincronizarSemErro(c.id);
  return vagasDe(a.id);
}
async function removerVaga(pedidoPor, assinaturaId, contaId) {
  const a = porId(assinaturaId);
  if (!a || a.plano !== 'banda') throw new ErroAssinatura('Plano banda não encontrado.', 404);
  const titular = a.conta_id === pedidoPor;
  if (!titular && pedidoPor !== contaId) throw new ErroAssinatura('Só a titular do plano tira alguém; cada integrante pode sair da própria vaga.', 403);
  if (contaId === a.conta_id) throw new ErroAssinatura('A titular ocupa a própria vaga enquanto o plano existir. Para sair, cancele o plano.');
  const r = db.prepare("UPDATE assinatura_vagas SET removida_em = ? WHERE assinatura_id = ? AND conta_id = ? AND removida_em = ''").run(nowISO(), a.id, contaId);
  if (!r.changes) throw new ErroAssinatura('Esta pessoa não está no plano.');
  evento(a, 'banda.vaga.removida', { conta: contaId, por: titular ? 'titular' : 'a própria pessoa' });
  await sincronizarSemErro(contaId);
  return vagasDe(a.id);
}
/** Webhook, cancelamento e rotina mexem numa assinatura: todas as pessoas dela entram em acordo. */
async function sincronizarDaAssinatura(a) {
  if (!a) return;
  const ids = new Set([a.conta_id]);
  if (a.plano === 'banda') db.prepare('SELECT conta_id FROM assinatura_vagas WHERE assinatura_id = ?').all(a.id).forEach((x) => ids.add(x.conta_id));
  for (const id of ids) await sincronizarSemErro(id);
}

/** Pode USAR o Musique? Assinatura com acesso, cortesia, período já pago ou teste em curso. */
function acessoDaConta(contaId) {
  const c = contas.Contas.porId(contaId);
  if (!c) return { acesso: false, motivo: 'sem-conta' };
  const a = vigente(contaId);
  if (temAcesso(a)) return { acesso: true, motivo: a.status === 'cortesia' ? 'cortesia' : 'assinatura' };
  const ate = pagoAte(contaId);
  if (ate) return { acesso: true, motivo: 'pago_ate', ate };
  const b = acessoPelaBanda(contaId);
  if (b) return { acesso: true, motivo: 'banda', titular: (contas.Contas.porId(b.conta_id) || {}).nome || '', ate: pagoAteDe(b) || '' };
  const t = teste(c);
  if (t.ativo) return { acesso: true, motivo: 'teste', teste: t };
  return { acesso: false, motivo: 'sem-assinatura', teste: t };
}

class ErroAssinatura extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

const plano = () => {
  const cfg = repo.Config.get('assinatura', {}) || {};
  // preco_cents = preço do Starter (compatibilidade com quem lê o plano de entrada)
  return { ...PLANO_PADRAO, ...cfg, preco_cents: catalogo(cfg)[0].preco_cents };
};
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
  const deve = (temAcesso(a) || !!pagoAte(contaId) || !!acessoPelaBanda(contaId)) && !!c.email_verificado && c.status === 'ativo';
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
async function assinar(contaId, { plano: pedido = 'starter' } = {}) {
  const escolhido = planoPorSlug(pedido);
  if (!escolhido) throw new ErroAssinatura('Plano inválido.');
  const c = contas.Contas.porId(contaId);
  if (!c) throw new ErroAssinatura('Conta não encontrada.', 404);
  if (!c.email_verificado) throw new ErroAssinatura('Confirme o seu e-mail antes de assinar: é por ele que os cursos chegam na Academia.');
  const atual = vigente(contaId);
  if (atual && (atual.status === 'ativa' || atual.status === 'cortesia')) throw new ErroAssinatura('Você já tem assinatura ativa.');
  if (!cobrancaLigada()) throw new ErroAssinatura('O pagamento online ainda não está ligado. Tente de novo mais tarde.', 503);
  const p = plano();
  const vagas = escolhido.vagas;
  const banda = vagas > 1;                 // mais de uma pessoa: usa o mecanismo de vagas
  const tipo = banda ? 'banda' : 'individual';
  const valor = escolhido.preco_cents;
  if (banda && assinaturaBandaDoTitular(contaId) && assinaturaBandaDoTitular(contaId).status !== 'pendente') throw new ErroAssinatura('Você já tem um plano banda.');
  // Pendente anterior sem pagamento: reaproveita a linha, com link novo.
  const id = atual && atual.status === 'pendente' ? atual.id : novoId();
  const pre = await _mp('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: banda ? `Musique — ${escolhido.nome} (${vagas} assinaturas)` : `Musique — ${escolhido.nome}`,
      external_reference: `musique:${contaId}:${id}`,
      payer_email: c.email,
      back_url: `${_baseSite}/music/app#conta`,
      notification_url: `${_baseApi}/music/api/pagamentos/mp`,   // NO CORPO — o painel do MP não cobre assinatura
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: Number((valor / 100).toFixed(2)), currency_id: 'BRL' },
      status: 'pending',
    }),
  });
  const link = s(pre.init_point || pre.sandbox_init_point, 1000);
  if (atual && atual.status === 'pendente') atualizar(id, { preapproval_id: String(pre.id), link, preco_cents: valor, plano: tipo, plano_slug: escolhido.slug, vagas });
  else {
    db.prepare(`INSERT INTO assinaturas_music (id, conta_id, status, origem, plano, plano_slug, vagas, preco_cents, preapproval_id, link, criado_em, atualizado_em)
      VALUES (?, ?, 'pendente', 'mp', ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, contaId, tipo, escolhido.slug, vagas, valor, String(pre.id), link, nowISO(), nowISO());
  }
  // A titular ocupa a primeira vaga do plano banda.
  if (banda && !db.prepare("SELECT 1 FROM assinatura_vagas WHERE assinatura_id = ? AND conta_id = ? AND removida_em = ''").get(id, contaId)) {
    db.prepare('INSERT INTO assinatura_vagas (assinatura_id, conta_id, adicionada_em) VALUES (?, ?, ?)').run(id, contaId, nowISO());
  }
  evento(porId(id), 'assinatura.iniciada', { preapproval: String(pre.id), preco_cents: valor, plano: escolhido.slug });
  return { link, assinatura_id: id };
}

async function cancelar(contaId, motivo = 'cancelada pelo assinante') {
  const a = vigente(contaId);
  if (!a || a.status === 'cortesia') throw new ErroAssinatura(a ? 'Esta é uma assinatura cortesia: fale com o suporte.' : 'Você não tem assinatura para cancelar.');
  let mpOk = true;
  if (a.preapproval_id && _mp) {
    try { await _mp(`/preapproval/${a.preapproval_id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }); }
    catch (e) {
      mpOk = false;
      _avisar(montarAviso({
        titulo: '⚠️ Musique: cancelamento local feito, mas o Mercado Pago recusou',
        campos: [...camposDaAssinatura(a), ['Erro', s(e.message, 160)]],
        fazer: `Cancelar no painel do Mercado Pago (preapproval ${a.preapproval_id}): aqui já está cancelada, mas a cobrança pode continuar.`,
      }));
    }
  }
  atualizar(a.id, { status: 'cancelada', encerrada_em: nowISO(), motivo: s(motivo, 200) });
  evento(a, 'assinatura.cancelada', { motivo, mp: mpOk });
  await sincronizarDaAssinatura(porId(a.id));
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
    _avisar(montarAviso({
      titulo: a.status === 'inadimplente' ? '💚 Musique: assinante voltou a pagar' : '💚 Musique: novo assinante',
      campos: camposDaAssinatura(a),
      fazer: 'Nada: acesso e cortesia dos cursos de música liberados automaticamente.',
    }));
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
      _avisar(montarAviso({
        titulo: '⚠️ Musique: assinatura cancelada no Mercado Pago',
        campos: camposDaAssinatura(a),
        fazer: 'Nada a fazer: acesso e cortesia dos cursos de música encerram sozinhos ao fim do período já pago. Para tentar recuperar o assinante, use o contato acima.',
      }));
    } else r = { resultado: 'ignorado', status: pre.status };
    await sincronizarDaAssinatura(porId(a.id));
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
    await sincronizarDaAssinatura(porId(a.id));
    return { ok: true, ...r };
  }

  if (tipo === 'payment') {
    const pag = await _mp(`/v1/payments/${id}`);
    if (pag.status !== 'approved') return { ok: true, ignorado: `pagamento ${pag.status}` };
    const a = assinaturaDaReferencia(pag.external_reference, '');
    if (!a) return { ok: true, ignorado: 'assinatura não encontrada' };
    const r = registrarPagamento(a, String(pag.id), Math.round((Number(pag.transaction_amount) || 0) * 100));
    await sincronizarDaAssinatura(porId(a.id));
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
    UNION SELECT conta_id FROM assinatura_vagas WHERE removida_em = ''
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
    plano: { nome: p.nome, preco_cents: p.preco_cents, carencia_dias: p.carencia_dias, teste_dias: p.teste_dias,
      avaliacao: { nome: NOME_AVALIACAO, preco_cents: 0, dias: p.teste_dias },
      planos: catalogo() },
    banda: (() => {
      const t = assinaturaBandaDoTitular(contaId);
      if (t) return { papel: 'titular', assinatura_id: t.id, status: t.status, vagas: t.vagas, ocupadas: vagasDe(t.id) };
      const b = bandaDaConta(contaId);
      if (b && b.conta_id !== contaId) return { papel: 'integrante', assinatura_id: b.id, status: b.status, titular: (contas.Contas.porId(b.conta_id) || {}).nome || '' };
      return null;
    })(),
    uso,
    cobranca_ligada: cobrancaLigada(),
    email_verificado: !!(c && c.email_verificado),
    assinatura: a ? { status: a.status, origem: a.origem, plano: a.plano, plano_slug: a.plano_slug || '', vagas: a.vagas, desde: a.criado_em, preco_cents: a.preco_cents, ultimo_pagamento_em: a.ultimo_pagamento_em,
      inadimplente_desde: a.inadimplente_desde, link: a.status === 'pendente' ? a.link : '' } : null,
    acesso: temAcesso(a),
    cortesia_academia: reg && !reg.revogada_em ? { email: reg.email, cursos: reg.cursos, desde: reg.concedida_em } : null,
  };
}

function resumoStaff() {
  const p = plano();
  const porStatus = db.prepare('SELECT status, COUNT(*) n FROM assinaturas_music GROUP BY status').all();
  const ativas = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(preco_cents),0) c FROM assinaturas_music WHERE status = 'ativa'").get();
  const lista = db.prepare(`SELECT a.id, a.conta_id, a.status, a.origem, a.plano, a.vagas,
      (SELECT COUNT(*) FROM assinatura_vagas v WHERE v.assinatura_id = a.id AND v.removida_em = '') AS ocupadas, a.preco_cents, a.criado_em, a.ultimo_pagamento_em, a.inadimplente_desde,
      a.motivo, c.nome, c.email, c.email_verificado, ca.cursos, ca.revogada_em
    FROM assinaturas_music a LEFT JOIN contas_music c ON c.id = a.conta_id LEFT JOIN cortesia_academia ca ON ca.conta_id = a.conta_id
    WHERE a.status <> 'cancelada' OR a.atualizado_em > ? ORDER BY a.atualizado_em DESC LIMIT 300`)
    .all(new Date(Date.now() - 60 * 864e5).toISOString());
  return { plano: p, planos: catalogo(), cobranca_ligada: cobrancaLigada(), por_status: porStatus, ativas: ativas.n, receita_mensal_cents: ativas.c, assinaturas: lista,
    eventos: db.prepare('SELECT * FROM assinatura_eventos ORDER BY id DESC LIMIT 50').all() };
}

function definirPlano({ preco_cents, planos, carencia_dias, teste_dias }) {
  const atual = repo.Config.get('assinatura', {}) || {};
  const novo = { ...atual };
  const preco = (x) => {
    const v = Math.round(Number(x));
    if (!(v >= 100 && v <= 10000000)) throw new ErroAssinatura('Preço inválido.');
    return v;
  };
  // Preço por plano: { starter: 3900, professional: 5900, ... } (centavos). `preco_cents` sozinho = Starter.
  const pedidos = { ...(planos || {}) };
  if (preco_cents !== undefined) pedidos.starter = preco_cents;
  if (Object.keys(pedidos).length) {
    novo.precos_planos = { ...(novo.precos_planos || {}) };
    for (const [slug, v] of Object.entries(pedidos)) {
      if (!PLANOS_PADRAO.some((x) => x.slug === slug)) throw new ErroAssinatura('Plano inválido: ' + slug);
      novo.precos_planos[slug] = preco(v);
    }
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
  configurar, plano, cobrancaLigada, vigente, temAcesso, acessoDaConta, teste, catalogo, planoPorSlug, NOME_AVALIACAO, adicionarVaga, removerVaga, vagasDe, bandaDaConta, sincronizar, assinar, cancelar, processarWebhook,
  concederCortesia, encerrarCortesia, garantirDono, ciclo, estadoDaConta, resumoStaff, definirPlano, ErroAssinatura,
  _conferirWebhook: webhookMP.conferir,
};
