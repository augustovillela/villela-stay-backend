// =====================================================================
// Villela CRM — CARTEIRA PRÉ-PAGA do assinante (créditos para gastar com provedor).
// Mesmo desenho da carteira da Academy (academy/carteira-ia.js), em outro banco:
//
//   orçar o TETO → o assinante aceita esse valor → RESERVA (débito do teto)
//   → executa → ACERTO (devolve teto − custo real) ou ESTORNO (falhou: devolve tudo)
//
// Nunca cobra mais que o teto aceito. O saldo NÃO tem coluna: é a soma do razão
// (crm_carteira_mov), em MILÉSIMOS de real (1 centavo = 10). O custo do provedor (US$) vira
// reais pelo PTAX do dia + folga, mais a margem — como na Academy. A plataforma NUNCA absorve
// custo de assinante: sem a cobrança ligada pelo Augusto, só a chave própria do assinante roda.
// Tenant interno (origem 'interno', o do Augusto) é isento.
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId } = require('./db');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const erro = (msg, status = 400, extra) => { const e = new Error(msg); e.status = status; if (extra) Object.assign(e, extra); return e; };

const MARGEM_PADRAO_PCT = 30;                 // decisão do Augusto (08/10/2026), vale aqui também
const FOLGA_PADRAO_PCT = 10;                  // sugestão (ainda não confirmada pelo Augusto) — editável no staff
const PACOTES_PADRAO = [2000, 5000, 10000];   // R$ 20, 50 e 100
const RESERVA_ORFA_MIN = 30;                  // reserva sem acerto há mais que isso = processo caiu: devolve
const PTAX_VALE_DIAS = 7;
const PTAX_URL = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@i,dataFinalCotacao=@f)";
const diasDesde = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 864e5 : Infinity);
// até 3 casas: uma operação de IA custa frações de centavo (R$ 0,003 não pode aparecer como R$ 0,00)
const brl = (milesimos) => 'R$ ' + (milesimos / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

let _mpFetch = null, _buscar = null, _notificar = null;
function configurar(o = {}) {
  if ('mpFetch' in o) _mpFetch = o.mpFetch || null;
  if ('buscar' in o) _buscar = o.buscar || null;
  if ('notificar' in o) _notificar = o.notificar || null;
  if (!_buscar && !('buscar' in o) && typeof fetch === 'function') _buscar = fetch;
}

// ---- config da plataforma (crm_plataforma) ----
const Plataforma = {
  obter(chave, padrao = {}) {
    const l = db.prepare('SELECT valor FROM crm_plataforma WHERE chave = ?').get(chave);
    try { return l ? JSON.parse(l.valor) : padrao; } catch (_) { return padrao; }
  },
  salvar(chave, valor) {
    db.prepare('INSERT INTO crm_plataforma (chave, valor, atualizado_em) VALUES (?,?,?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em')
      .run(chave, JSON.stringify(valor), nowISO());
    return valor;
  },
};

// ---- câmbio: PTAX de venda do dia + folga; sem PTAX recente vale o fixo de reserva ----
function ptax() {
  const p = Plataforma.obter('ptax', null);
  return p && Number(p.valor) > 0 ? p : null;
}
function cambio(c = Plataforma.obter('carteira', {})) {
  const fixo = Number(c.cambio_fixo) || Number(process.env.CRM_USD_BRL) || 0;
  const folga = Number.isFinite(Number(c.folga_pct)) ? Math.max(0, Number(c.folga_pct)) : FOLGA_PADRAO_PCT;
  if (c.cambio_modo === 'fixo') return { valor: fixo, origem: fixo ? 'fixo' : '', folga_pct: folga, aviso: '' };
  const p = ptax();
  if (p && diasDesde(p.buscado_em) <= PTAX_VALE_DIAS) return { valor: Math.round(p.valor * (1 + folga / 100) * 10000) / 10000, origem: 'ptax', folga_pct: folga, aviso: '' };
  return { valor: fixo, origem: fixo ? 'fixo' : '', folga_pct: folga, aviso: fixo ? 'PTAX indisponível: usando o câmbio fixo de reserva.' : 'PTAX indisponível e sem câmbio de reserva: a cobrança está suspensa.' };
}
async function atualizarPTAX() {
  const agora = nowISO();
  const mmdd = (d) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${d.getUTCFullYear()}`;
  const url = `${PTAX_URL}?@i='${mmdd(new Date(Date.now() - 10 * 864e5))}'&@f='${mmdd(new Date())}'&$top=1&$orderby=dataHoraCotacao%20desc&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
  try {
    if (!_buscar) throw new Error('sem cliente HTTP');
    const r = await _buscar(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('Banco Central respondeu ' + r.status);
    const linha = ((await r.json()).value || [])[0];
    const valor = Number(linha && linha.cotacaoVenda);
    if (!(valor >= 1 && valor <= 50)) throw new Error('cotação inválida'); // preço errado é pior que o de ontem
    Plataforma.salvar('ptax', { valor, cotado_em: s(linha.dataHoraCotacao, 30), buscado_em: agora });
    return { ok: true, valor };
  } catch (e) {
    Plataforma.salvar('ptax', { ...(ptax() || {}), erro: s(e.message, 200), erro_em: agora });
    return { ok: false, erro: e.message };
  }
}

function cfg() {
  const c = Plataforma.obter('carteira', {});
  const cb = cambio(c);
  const pacotes = (Array.isArray(c.pacotes_centavos) ? c.pacotes_centavos : PACOTES_PADRAO).map((n) => Math.round(Number(n) || 0)).filter((n) => n >= 100);
  return {
    ligada: !!c.ativa,                       // o que o dono pediu
    ativa: !!c.ativa && cb.valor > 0,        // o que está valendo (sem câmbio não liga pela metade)
    cambio_brl_usd: cb.valor, cambio_origem: cb.origem, cambio_aviso: cb.aviso, cambio_folga_pct: cb.folga_pct,
    cambio_modo: c.cambio_modo === 'fixo' ? 'fixo' : 'ptax', cambio_fixo: Number(c.cambio_fixo) || 0,
    margem_pct: Number.isFinite(Number(c.margem_pct)) ? Math.max(0, Number(c.margem_pct)) : MARGEM_PADRAO_PCT,
    pacotes_centavos: pacotes.length ? pacotes : PACOTES_PADRAO,
  };
}
/** Config do staff. Ligar exige câmbio que exista agora (PTAX já buscado ou fixo). */
function salvarConfig(novo = {}) {
  const atual = Plataforma.obter('carteira', {});
  const m = { ...atual };
  if ('margem_pct' in novo) { const x = Number(novo.margem_pct); if (!(x >= 0 && x <= 500)) throw erro('Margem deve ficar entre 0 e 500%.'); m.margem_pct = x; }
  if ('folga_pct' in novo) { const x = Number(novo.folga_pct); if (!(x >= 0 && x <= 100)) throw erro('A folga sobre o PTAX deve ficar entre 0 e 100%.'); m.folga_pct = x; }
  if ('cambio_modo' in novo) m.cambio_modo = novo.cambio_modo === 'fixo' ? 'fixo' : 'ptax';
  if ('cambio_fixo' in novo) { const x = Number(novo.cambio_fixo) || 0; if (x && (x < 1 || x > 50)) throw erro('Câmbio fora do razoável — confira o número.'); m.cambio_fixo = x; }
  if ('pacotes_centavos' in novo) { const p = (Array.isArray(novo.pacotes_centavos) ? novo.pacotes_centavos : []).map((n) => Math.round(Number(n))).filter((n) => n >= 100 && n <= 100000); if (!p.length) throw erro('Informe ao menos um pacote (R$ 1 a R$ 1.000).'); m.pacotes_centavos = p; }
  if ('ativa' in novo) {
    m.ativa = !!novo.ativa;
    if (m.ativa && !(cambio(m).valor > 0)) throw erro(m.cambio_modo === 'fixo' ? 'Informe o câmbio fixo para ligar a cobrança.' : 'O PTAX ainda não foi buscado — busque agora ou informe um câmbio fixo de reserva.');
  }
  Plataforma.salvar('carteira', m);
  return cfg();
}

/** custo do provedor em USD → preço ao assinante, em milésimos de real, sempre para cima */
const usdParaMilesimos = (usd, c = cfg()) => Math.ceil(usd * c.cambio_brl_usd * (1 + c.margem_pct / 100) * 1000 - 1e-9);

/** Tenant interno (o do Augusto) é isento; só ele. */
function interno(tid) {
  const t = db.prepare('SELECT origem, slug FROM tenants WHERE id = ?').get(tid);
  return !!t && (t.origem === 'interno' || t.slug === (process.env.CRM_PONTE_SLUG || 'villela-stay'));
}

// ---- razão ----
function lancar(tid, tipo, milesimos, { ref = '', detalhe = '', quem = '' } = {}) {
  db.prepare('INSERT INTO crm_carteira_mov (id, tenant_id, tipo, milesimos, ref, detalhe, quem, criado_em) VALUES (?,?,?,?,?,?,?,?)')
    .run(novoId(), tid, tipo, Math.round(milesimos), s(ref, 60), s(detalhe, 300), s(quem, 120), nowISO());
}
const saldo = (tid) => db.prepare('SELECT COALESCE(SUM(milesimos),0) n FROM crm_carteira_mov WHERE tenant_id = ?').get(tid).n;

// trabalho aberto NESTE processo não é órfão (a varredura pode levar minutos)
const _vivas = new Set();
const manterViva = (ref) => { if (ref) _vivas.add(ref); };
const soltar = (ref) => { _vivas.delete(ref); };

/** Reserva que ficou sem acerto (o servidor reiniciou no meio) volta ao saldo. */
function liberarOrfas(tid) {
  const corte = new Date(Date.now() - RESERVA_ORFA_MIN * 60e3).toISOString();
  const orfas = db.prepare(`SELECT r.ref, r.milesimos FROM crm_carteira_mov r WHERE r.tenant_id = ? AND r.tipo = 'reserva' AND r.criado_em < ?
    AND NOT EXISTS (SELECT 1 FROM crm_carteira_mov f WHERE f.tenant_id = r.tenant_id AND f.ref = r.ref AND f.tipo IN ('acerto','estorno'))`).all(tid, corte);
  let n = 0;
  for (const o of orfas) { if (_vivas.has(o.ref)) continue; try { lancar(tid, 'estorno', -o.milesimos, { ref: o.ref, detalhe: 'interrompido — valor devolvido' }); n++; } catch (_) { /* já devolvida */ } }
  return n;
}

function reservar(tid, tetoMilesimos, { ref = novoId(), detalhe = '' } = {}) {
  const teto = Math.round(Number(tetoMilesimos));
  if (!(teto > 0)) throw erro('Orçamento inválido.');
  return transacao(() => {
    liberarOrfas(tid);
    const sd = saldo(tid);
    if (sd < teto) throw erro(`Saldo insuficiente: o teto desta operação é ${brl(teto)} e você tem ${brl(Math.max(0, sd))}. Recarregue para continuar.`, 402, { falta_milesimos: teto - sd, teto_milesimos: teto, saldo_milesimos: sd });
    lancar(tid, 'reserva', -teto, { ref, detalhe });
    manterViva(ref);
    return { ref, teto_milesimos: teto };
  });
}
const resolvida = (tid, ref) => !!db.prepare("SELECT 1 FROM crm_carteira_mov WHERE tenant_id = ? AND ref = ? AND tipo IN ('acerto','estorno')").get(tid, ref);
/** Cobra o custo REAL (nunca acima do teto) e devolve a diferença. Idempotente. */
function acertar(tid, ref, tetoMilesimos, realMilesimos, detalhe = '') {
  soltar(ref);
  if (resolvida(tid, ref)) return { ja: true };
  const real = Math.max(0, Math.min(Math.round(realMilesimos), Math.round(tetoMilesimos)));
  lancar(tid, 'acerto', Math.round(tetoMilesimos) - real, { ref, detalhe: detalhe || `custo real ${brl(real)}` });
  return { cobrado_milesimos: real, devolvido_milesimos: Math.round(tetoMilesimos) - real };
}
function estornar(tid, ref, tetoMilesimos, detalhe = 'falhou — valor devolvido') {
  soltar(ref);
  if (resolvida(tid, ref)) return { ja: true };
  lancar(tid, 'estorno', Math.round(tetoMilesimos), { ref, detalhe });
  return { devolvido_milesimos: Math.round(tetoMilesimos) };
}

/** Cortesia/ajuste: só o staff (admin) chama. */
function creditar(tid, { valor_centavos, tipo = 'cortesia', motivo = '', quem = '' }) {
  if (!['cortesia', 'ajuste'].includes(tipo)) throw erro('Tipo inválido.');
  const v = Math.round(Number(valor_centavos));
  if (!Number.isFinite(v) || v === 0 || Math.abs(v) > 1000000) throw erro('Valor inválido.');
  if (!s(motivo)) throw erro('Informe o motivo do crédito.');
  lancar(tid, tipo, v * 10, { ref: novoId(), detalhe: motivo, quem });
  return { saldo_milesimos: saldo(tid) };
}

// ---- recarga (Mercado Pago, pagamento avulso) ----
async function criarRecarga(tid, valorCentavos, baseUrl, { email = '', quem = '' } = {}) {
  const c = cfg();
  if (!c.ativa) throw erro('Os créditos ainda não estão liberados.', 403);
  if (interno(tid)) throw erro('A conta interna não usa créditos.');
  const valor = Math.round(Number(valorCentavos) || 0);
  if (!c.pacotes_centavos.includes(valor)) throw erro('Escolha um dos pacotes de recarga.');
  if (!_mpFetch) throw erro('Pagamento online indisponível no momento.', 503);
  const id = novoId();
  db.prepare("INSERT INTO crm_recargas (id, tenant_id, valor_centavos, status, criado_em, criado_por) VALUES (?,?,?,'pendente',?,?)").run(id, tid, valor, nowISO(), s(quem, 120));
  const volta = `${baseUrl}/crm/app?recarga=${id}`;
  const pref = await _mpFetch('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ title: `Créditos Villela CRM (R$ ${(valor / 100).toFixed(2)})`, quantity: 1, unit_price: valor / 100, currency_id: 'BRL' }],
      payer: email ? { email } : undefined,
      external_reference: 'crmrec:' + id,
      back_urls: { success: volta, pending: volta, failure: volta }, auto_return: 'approved',
      notification_url: `${baseUrl}/crm/webhooks/mercadopago`,
      statement_descriptor: 'VILLELA CRM',
    }),
  });
  db.prepare('UPDATE crm_recargas SET mp_preference_id = ? WHERE id = ?').run(s(pref && pref.id, 80), id);
  return { recarga_id: id, init_point: (pref && (pref.init_point || pref.sandbox_init_point)) || '', valor_centavos: valor };
}

/** Idempotente (índice único tipo+ref): o mesmo pagamento nunca credita duas vezes. */
function aplicarPagamento(pay) {
  const ref = String((pay && pay.external_reference) || '');
  if (!ref.startsWith('crmrec:')) return { resultado: 'outro' };
  const rec = db.prepare('SELECT * FROM crm_recargas WHERE id = ?').get(ref.slice(7));
  if (!rec) return { resultado: 'recarga-desconhecida' };
  const st = String(pay.status || '');
  if (st === 'approved') {
    if (rec.status === 'paga') return { resultado: 'ja-paga' };
    // credita o que NÓS criamos, conferido com o que o MP diz ter recebido
    if (Math.round(Number(pay.transaction_amount) * 100) !== rec.valor_centavos) return { resultado: 'valor-diferente' };
    transacao(() => {
      db.prepare("UPDATE crm_recargas SET status = 'paga', mp_payment_id = ?, pago_em = ? WHERE id = ?").run(s(pay.id, 40), nowISO(), rec.id);
      lancar(rec.tenant_id, 'recarga', rec.valor_centavos * 10, { ref: rec.id, detalhe: 'recarga pelo Mercado Pago', quem: 'mercadopago' });
    });
    return { resultado: 'creditada', tenant_id: rec.tenant_id };
  }
  if (st === 'rejected' || st === 'cancelled') {
    if (rec.status === 'pendente') db.prepare('UPDATE crm_recargas SET status = ?, mp_payment_id = ? WHERE id = ?').run(st === 'rejected' ? 'recusada' : 'cancelada', s(pay.id, 40), rec.id);
    return { resultado: st };
  }
  if ((st === 'refunded' || st === 'charged_back') && rec.status === 'paga') {
    transacao(() => {
      db.prepare("UPDATE crm_recargas SET status = 'reembolsada' WHERE id = ?").run(rec.id);
      lancar(rec.tenant_id, 'estorno_recarga', -rec.valor_centavos * 10, { ref: rec.id, detalhe: st === 'charged_back' ? 'chargeback (MP)' : 'reembolso (MP)', quem: 'mercadopago' });
    });
    return { resultado: 'reembolsada' };
  }
  return { resultado: 'sem-acao:' + st };
}
/** "Já paguei": reconfere no MP (o aviso pode ter se perdido). */
async function conferirRecarga(tid, id) {
  const rec = db.prepare('SELECT * FROM crm_recargas WHERE id = ? AND tenant_id = ?').get(s(id, 40), tid);
  if (!rec) throw erro('Recarga não encontrada.', 404);
  if (['pendente', 'recusada', 'cancelada'].includes(rec.status) && _mpFetch) {
    const r = await _mpFetch(`/v1/payments/search?external_reference=${encodeURIComponent('crmrec:' + rec.id)}&sort=date_created&criteria=desc`);
    for (const pay of (r && r.results) || []) aplicarPagamento(pay);
  }
  return { status: db.prepare('SELECT status FROM crm_recargas WHERE id = ?').get(rec.id).status, saldo_milesimos: saldo(tid), saldo: brl(saldo(tid)) };
}

const ROTULO = { recarga: 'Recarga', cortesia: 'Crédito de cortesia', ajuste: 'Ajuste', estorno_recarga: 'Recarga devolvida' };
/** Extrato legível: reserva+acerto/estorno de uma mesma operação viram UMA linha de uso. */
function extrato(tid, n = 40) {
  const mov = db.prepare('SELECT * FROM crm_carteira_mov WHERE tenant_id = ? ORDER BY criado_em DESC, rowid DESC LIMIT 400').all(tid);
  const usos = new Map(); const linhas = [];
  for (const m of mov) {
    if (['reserva', 'acerto', 'estorno'].includes(m.tipo)) { const u = usos.get(m.ref) || { ref: m.ref, quando: m.criado_em, milesimos: 0, detalhe: '', aberta: true }; u.milesimos += m.milesimos; if (m.tipo !== 'reserva') { u.aberta = false; u.detalhe = m.tipo === 'estorno' ? 'não executado — valor devolvido' : ''; } if (m.tipo === 'reserva') { u.rotulo = m.detalhe; u.quando = m.criado_em; } usos.set(m.ref, u); }
    else linhas.push({ quando: m.criado_em, tipo: m.tipo, milesimos: m.milesimos, valor: brl(Math.abs(m.milesimos)), descricao: (ROTULO[m.tipo] || m.tipo) + (m.detalhe && m.tipo !== 'recarga' ? ' — ' + m.detalhe : '') });
  }
  for (const u of usos.values()) linhas.push({ quando: u.quando, tipo: 'uso', milesimos: u.milesimos, valor: brl(Math.abs(u.milesimos)), descricao: (u.rotulo || 'Uso') + (u.aberta ? ' (em andamento — teto reservado)' : u.detalhe ? ' — ' + u.detalhe : '') });
  return linhas.sort((a, b) => (a.quando < b.quando ? 1 : -1)).slice(0, n);
}

/** Estado para a tela do assinante. */
function estado(tid) {
  const c = cfg(); const isento = interno(tid);
  liberarOrfas(tid);
  return {
    isento, ativa: c.ativa || isento, saldo_milesimos: saldo(tid), saldo: brl(saldo(tid)),
    pacotes_centavos: c.pacotes_centavos, margem_pct: c.margem_pct,
    recargas_pendentes: db.prepare("SELECT id, valor_centavos, criado_em, status FROM crm_recargas WHERE tenant_id = ? AND status IN ('pendente','recusada') AND criado_em > ? ORDER BY criado_em DESC").all(tid, new Date(Date.now() - 2 * 864e5).toISOString()),
    extrato: extrato(tid, 30),
  };
}
/** Visão do staff: configuração e quanto cada assinante tem. */
function painelStaff() {
  const c = cfg();
  const tenants = db.prepare(`SELECT t.id, t.nome, t.slug,
      COALESCE(SUM(m.milesimos),0) saldo,
      COALESCE(SUM(CASE WHEN m.tipo='recarga' THEN m.milesimos ELSE 0 END),0) carregado
    FROM tenants t JOIN crm_carteira_mov m ON m.tenant_id = t.id GROUP BY t.id ORDER BY carregado DESC LIMIT 100`).all();
  return { config: c, ptax: ptax(), tenants: tenants.map((x) => ({ ...x, saldo_txt: brl(x.saldo), carregado_txt: brl(x.carregado) })) };
}

module.exports = {
  configurar, Plataforma, cfg, salvarConfig, cambio, atualizarPTAX, usdParaMilesimos, interno,
  saldo, reservar, acertar, estornar, liberarOrfas, creditar, criarRecarga, aplicarPagamento, conferirRecarga,
  extrato, estado, painelStaff, brl, MARGEM_PADRAO_PCT, FOLGA_PADRAO_PCT,
};
