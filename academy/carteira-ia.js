// =====================================================================
// Villela Academy — CARTEIRA DE IA: saldo pré-pago que paga todo uso de
// provedor de IA (Tutor Villela, mentor do Lab, lapidar, ferramentas do
// produtor e o que vier). Regra do Augusto (08/10/2026): tudo que gasta
// com provedor é orçado e cobrado do assinante ANTES de gerar.
//
// Como funciona uma chamada paga:
//   orçar o TETO → o usuário aceita esse valor → RESERVA (débito do teto)
//   → gera → ACERTO (devolve teto − custo real) ou ESTORNO (falhou: devolve tudo)
// Nunca se cobra mais do que o teto aceito.
//
// O saldo NÃO tem coluna: é a soma do razão (ia_movimentos), em MILÉSIMOS
// de real — uma pergunta custa frações de centavo, e centavo inteiro
// arredondaria tudo para zero ou para cima.
//
// Desligada por padrão: sem `ia_cobranca.ativa` e sem câmbio, vale o
// limite diário antigo e nada é cobrado.
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, j } = require('./db');
const repo = require('./repo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const erro = (msg, status = 400, extra) => { const e = new Error(msg); e.status = status; if (extra) e.extra = extra; return e; };

const MARGEM_PADRAO_PCT = 30;                    // decisão do Augusto, 08/10/2026
const PACOTES_PADRAO = [2000, 5000, 10000];      // R$ 20, R$ 50 e R$ 100 (centavos) — idem
const RESERVA_ORFA_MIN = 10;                     // reserva sem acerto depois disso = processo caiu: devolve
const TIPOS_CREDITO = ['recarga', 'cortesia', 'ajuste'];

let _mpFetch = null, _buscar = null, _notificar = null;
// só mexe no que veio: reconfigurar o cliente HTTP num teste não pode derrubar o Mercado Pago
function configurar(o = {}) {
  if ('mpFetch' in o) _mpFetch = o.mpFetch || null;
  if ('buscar' in o) _buscar = o.buscar || null;
  if ('notificar' in o) _notificar = o.notificar || null;
  if (!_buscar && !('buscar' in o) && typeof fetch === 'function') _buscar = fetch;
}

// ---------------------------------------------------------------------
// CÂMBIO — PTAX de venda do Banco Central, buscado todo dia (decisão do
// Augusto, 08/10/2026), mais uma folga: a fatura do provedor vem no cartão
// internacional, com IOF e spread acima da cotação oficial.
// A leitura é síncrona (o preço se calcula no meio de uma requisição), por
// isso o valor do dia fica guardado em platform_settings.ia_ptax e uma
// rotina o renova. Se o Banco Central ficar fora do ar, vale o último PTAX
// por até PTAX_VALE_DIAS; depois disso entra o câmbio fixo de reserva — e,
// sem reserva, a cobrança se desliga sozinha em vez de cobrar com número velho.
// ---------------------------------------------------------------------
const FOLGA_PADRAO_PCT = 10;   // sugestão minha (PTAX 5,01 → 5,51 em 08/10/2026); o Augusto ajusta no staff
const PTAX_VALE_DIAS = 7;
const PTAX_ALERTA_DIAS = 3;
const PTAX_URL = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@i,dataFinalCotacao=@f)";
const diasDesde = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 864e5 : Infinity);

function ptax() {
  const p = repo.Config.obter('ia_ptax', null);
  return p && Number(p.valor) > 0 ? { valor: Number(p.valor), cotado_em: s(p.cotado_em, 30), buscado_em: s(p.buscado_em, 30), erro: s(p.erro, 200), erro_em: s(p.erro_em, 30) } : null;
}
// → { valor, origem: 'ptax' | 'fixo' | '', ptax, folga_pct, aviso }
function cambio(c = repo.Config.obter('ia_cobranca', {}) || {}) {
  const fixo = Number(c.cambio_brl_usd) || 0;
  const folga = Number.isFinite(Number(c.cambio_folga_pct)) ? Math.max(0, Number(c.cambio_folga_pct)) : FOLGA_PADRAO_PCT;
  // o padrão é o PTAX do dia; 'fixo' só quando o dono escolher
  if (c.cambio_modo === 'fixo') return { valor: fixo, origem: fixo ? 'fixo' : '', ptax: ptax(), folga_pct: folga, aviso: '' };
  const p = ptax();
  if (p && diasDesde(p.buscado_em) <= PTAX_VALE_DIAS) {
    const velho = diasDesde(p.buscado_em) > PTAX_ALERTA_DIAS;
    return { valor: Math.round(p.valor * (1 + folga / 100) * 10000) / 10000, origem: 'ptax', ptax: p, folga_pct: folga,
      aviso: velho ? `PTAX sem atualizar há ${Math.floor(diasDesde(p.buscado_em))} dia(s) — o Banco Central não respondeu.` : '' };
  }
  return { valor: fixo, origem: fixo ? 'fixo' : '', ptax: p, folga_pct: folga,
    aviso: fixo ? 'PTAX indisponível: usando o câmbio fixo de reserva.' : 'PTAX indisponível e sem câmbio de reserva: a cobrança está suspensa.' };
}
// Busca a cotação de venda mais recente (fim de semana e feriado não têm PTAX: vale a última).
async function atualizarPTAX() {
  const agora = nowISO();
  const mmddaaaa = (d) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${d.getUTCFullYear()}`;
  const url = `${PTAX_URL}?@i='${mmddaaaa(new Date(Date.now() - 10 * 864e5))}'&@f='${mmddaaaa(new Date())}'&$top=1&$orderby=dataHoraCotacao%20desc&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
  try {
    if (!_buscar) throw new Error('sem cliente HTTP');
    const r = await _buscar(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('Banco Central respondeu ' + r.status);
    const linha = ((await r.json()).value || [])[0];
    const valor = Number(linha && linha.cotacaoVenda);
    // cotação fora de qualquer faixa plausível não entra: preço errado é pior que preço de ontem
    if (!(valor >= 1 && valor <= 50)) throw new Error('cotação inválida: ' + JSON.stringify(linha || null).slice(0, 80));
    repo.Config.salvar('ia_ptax', { valor, cotado_em: s(linha.dataHoraCotacao, 30), buscado_em: agora });
    return { ok: true, valor, cotado_em: linha.dataHoraCotacao };
  } catch (e) {
    const p = repo.Config.obter('ia_ptax', {}) || {};
    repo.Config.salvar('ia_ptax', { ...p, erro: s(e.message, 200), erro_em: agora });
    // fonte caída não pode ficar verde em silêncio: avisa o dono quando o valor começa a envelhecer
    const c = repo.Config.obter('ia_cobranca', {}) || {};
    if (c.ativa && c.cambio_modo !== 'fixo' && diasDesde(p.buscado_em) > PTAX_ALERTA_DIAS && diasDesde(p.alertado_em) > 1 && _notificar) {
      repo.Config.salvar('ia_ptax', { ...p, erro: s(e.message, 200), erro_em: agora, alertado_em: agora });
      Promise.resolve(_notificar(`⚠️ Villela Academy: o câmbio da cobrança de IA (PTAX) não atualiza desde ${s(p.buscado_em, 10) || 'nunca'} — ${s(e.message, 120)}. ${cambio(c).aviso}`)).catch(() => {});
    }
    return { ok: false, erro: e.message };
  }
}

// ---------------------------------------------------------------------
// CONFIG (platform_settings.ia_cobranca) — os números são do Augusto
// ---------------------------------------------------------------------
function cfg() {
  const c = repo.Config.obter('ia_cobranca', {}) || {};
  const cb = cambio(c);
  const pacotes = (Array.isArray(c.pacotes_centavos) ? c.pacotes_centavos : PACOTES_PADRAO).map(n => Math.round(Number(n) || 0)).filter(n => n >= 100);
  return {
    // sem câmbio não há como converter o custo do provedor: a cobrança não liga pela metade
    ativa: !!c.ativa && cb.valor > 0,
    cambio_brl_usd: cb.valor,            // o câmbio EFETIVO (PTAX + folga, ou o fixo)
    cambio_modo: c.cambio_modo === 'fixo' ? 'fixo' : 'ptax',
    cambio_origem: cb.origem, cambio_aviso: cb.aviso, cambio_folga_pct: cb.folga_pct,
    cambio_fixo: Number(c.cambio_brl_usd) || 0, ptax: cb.ptax,
    ligada: !!c.ativa,                   // o que o dono pediu; `ativa` é o que está valendo
    margem_pct: Number.isFinite(Number(c.margem_pct)) ? Math.max(0, Number(c.margem_pct)) : MARGEM_PADRAO_PCT,
    pacotes_centavos: pacotes.length ? pacotes : PACOTES_PADRAO,
    // quem tinha matrícula ANTES desta data mantém a franquia diária naquele curso
    virada_em: s(c.virada_em, 30),
    isentos: (Array.isArray(c.isentos) ? c.isentos : []).map(e => s(e, 120).toLowerCase()).filter(Boolean),
  };
}
// O que entra em platform_settings.ia_cobranca passa por aqui. A VIRADA é o instante em que a
// cobrança foi ligada pela primeira vez: nasce sozinha e não muda mais — mudá-la depois trocaria,
// em silêncio, quem tem a franquia que foi prometida na venda.
function prepararConfig(novo = {}, atual = repo.Config.obter('ia_cobranca', {}) || {}) {
  const fixo = Number(novo.cambio_brl_usd) || 0;
  const modo = novo.cambio_modo === 'fixo' ? 'fixo' : 'ptax';
  if (fixo && (fixo < 1 || fixo > 50)) throw erro('Câmbio fora do razoável — confira o número.');
  const folga = novo.cambio_folga_pct == null || novo.cambio_folga_pct === '' ? FOLGA_PADRAO_PCT : Number(novo.cambio_folga_pct);
  if (!(folga >= 0 && folga <= 100)) throw erro('A folga sobre o PTAX deve ficar entre 0 e 100%.');
  // ligar exige um câmbio que EXISTA agora: o PTAX já buscado, ou o fixo
  if (novo.ativa && !(cambio({ ...novo, cambio_modo: modo, cambio_brl_usd: fixo, cambio_folga_pct: folga }).valor > 0)) {
    throw erro(modo === 'ptax' ? 'O PTAX ainda não foi buscado no Banco Central — busque agora ou informe um câmbio fixo de reserva.' : 'Informe o câmbio (R$ por US$) para ligar a cobrança de IA.');
  }
  const margem = Number(novo.margem_pct);
  if (novo.margem_pct != null && !(margem >= 0 && margem <= 500)) throw erro('Margem deve ficar entre 0 e 500%.');
  // a lista de isentos chega colada de qualquer jeito (vírgula, ponto e vírgula, uma por linha):
  // aqui vira uma lista limpa — e e-mail torto é recusado, para ninguém "isento" pagar por um erro de digitação
  const isentos = [...new Set((Array.isArray(novo.isentos) ? novo.isentos.join(',') : String(novo.isentos || '')).split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(Boolean))];
  const torto = isentos.find(e => !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e));
  if (torto) throw erro(`"${torto}" não parece um e-mail — confira a lista de isentos.`);
  if (isentos.length > 50) throw erro('Mais de 50 isentos — isenção é exceção; para os demais, use crédito de cortesia.');
  return { ...novo, isentos, ativa: !!novo.ativa, cambio_modo: modo, cambio_brl_usd: fixo, cambio_folga_pct: folga,
    virada_em: s(atual.virada_em, 30) || (novo.ativa ? nowISO() : '') };
}

const brl = (milesimos) => 'R$ ' + (milesimos / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

// custo do provedor em USD → preço ao usuário em milésimos de real, sempre para cima
function precoEmMilesimos(usd, c = cfg()) {
  return Math.ceil(usd * c.cambio_brl_usd * (1 + c.margem_pct / 100) * 1000 - 1e-9);
}

function isento(userId, c = cfg()) {
  if (!c.isentos.length) return false;
  const u = repo.Usuarios.porId(userId);
  return !!u && c.isentos.includes(String(u.email || '').toLowerCase());
}
// A franquia é POR CURSO: vale onde a matrícula é anterior à virada — é a promessa feita naquela venda.
function temFranquia(userId, productId, c = cfg()) {
  if (!c.virada_em || !productId) return false;
  return !!db.prepare("SELECT 1 FROM enrollments WHERE user_id = ? AND product_id = ? AND status = 'ativa' AND criado_em < ?").get(userId, productId, c.virada_em);
}

// ---------------------------------------------------------------------
// RAZÃO
// ---------------------------------------------------------------------
function lancar(userId, tipo, milesimos, { ref = '', detalhe = '', quem = '' } = {}) {
  db.prepare('INSERT INTO ia_movimentos (id, user_id, tipo, milesimos, ref, detalhe, quem, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(novoId(), userId, tipo, Math.round(milesimos), s(ref, 60), s(detalhe, 300), s(quem, 120), nowISO());
}
// Reserva que ficou sem acerto (o servidor reiniciou no meio da geração) volta ao saldo.
function liberarOrfas(userId) {
  const corte = new Date(Date.now() - RESERVA_ORFA_MIN * 60e3).toISOString();
  const orfas = db.prepare(`SELECT r.ref, r.milesimos FROM ia_movimentos r WHERE r.user_id = ? AND r.tipo = 'reserva' AND r.criado_em < ?
    AND NOT EXISTS (SELECT 1 FROM ia_movimentos f WHERE f.ref = r.ref AND f.tipo IN ('acerto', 'estorno'))`).all(userId, corte);
  for (const o of orfas) lancar(userId, 'estorno', -o.milesimos, { ref: o.ref, detalhe: 'geração interrompida — valor devolvido', quem: 'sistema' });
}
function saldo(userId) {
  liberarOrfas(userId);
  return db.prepare('SELECT COALESCE(SUM(milesimos), 0) n FROM ia_movimentos WHERE user_id = ?').get(userId).n;
}

function reservar(userId, teto, { agente, aceite }) {
  const disponivel = saldo(userId);
  const base = { cobranca: 'paga', agente, orcamento_milesimos: teto, orcamento: brl(teto), saldo_milesimos: disponivel, saldo: brl(disponivel) };
  if (disponivel < teto) {
    throw erro(`Saldo de IA insuficiente: esta ação custa até ${brl(teto)} e você tem ${brl(disponivel)}. Coloque saldo em Conta e pagamentos.`, 402,
      { ...base, motivo: 'saldo_insuficiente', falta_milesimos: teto - disponivel });
  }
  // o aceite é do VALOR: se o orçamento passou do que o usuário viu e aceitou, pergunta de novo
  if (!(aceite >= teto)) {
    throw erro(`Esta ação usa IA e custa até ${brl(teto)}. Confirme para continuar — você paga só o que for usado.`, 402, { ...base, motivo: 'confirmar' });
  }
  const ref = novoId();
  lancar(userId, 'reserva', -teto, { ref, detalhe: agente });
  return ref;
}
function acertar(userId, ref, teto, real, detalhe) {
  const cobrado = Math.min(teto, Math.max(0, Math.round(real))); // nunca acima do teto aceito
  lancar(userId, 'acerto', teto - cobrado, { ref, detalhe });
  return cobrado;
}
function estornar(userId, ref, teto, detalhe) {
  lancar(userId, 'estorno', teto, { ref, detalhe });
}

// Crédito manual do dono da plataforma: cortesia (positivo) ou ajuste (qualquer sinal, sem deixar negativo).
function creditar({ email, valor_centavos, motivo, quem, tipo = 'cortesia' }) {
  const u = repo.Usuarios.porEmail(s(email, 120).toLowerCase());
  if (!u) throw erro('Não existe conta na Academy com esse e-mail.', 404);
  const centavos = Math.round(Number(valor_centavos) || 0);
  if (!['cortesia', 'ajuste'].includes(tipo)) throw erro('tipo deve ser cortesia ou ajuste.');
  if (!centavos) throw erro('Informe o valor do crédito.');
  if (tipo === 'cortesia' && centavos < 0) throw erro('Cortesia é crédito: use "ajuste" para retirar saldo.');
  if (Math.abs(centavos) > 100000) throw erro('Valor acima de R$ 1.000,00 — confira o número.');
  if (s(motivo, 300).length < 3) throw erro('Diga o motivo — ele fica no extrato do usuário e na auditoria.');
  const atual = saldo(u.id);
  if (atual + centavos * 10 < 0) throw erro(`O ajuste deixaria o saldo negativo (saldo atual: ${brl(atual)}).`);
  lancar(u.id, tipo, centavos * 10, { detalhe: motivo, quem });
  return { user_id: u.id, email: u.email, nome: u.nome, saldo_milesimos: saldo(u.id), saldo: brl(saldo(u.id)) };
}

// ---------------------------------------------------------------------
// RECARGA pelo Mercado Pago — o crédito só entra por webhook ou conferência
// segura (como o pedido de curso); o retorno do navegador nunca credita.
// ---------------------------------------------------------------------
async function criarRecarga(usuario, valorCentavos, baseUrl) {
  const c = cfg();
  if (!c.ativa) throw erro('A cobrança de IA não está ativa.');
  const valor = Math.round(Number(valorCentavos) || 0);
  if (!c.pacotes_centavos.includes(valor)) throw erro('Escolha um dos pacotes de recarga.');
  if (!_mpFetch) throw erro('Pagamento online indisponível no momento.');
  const id = novoId();
  db.prepare("INSERT INTO ia_recargas (id, user_id, valor_centavos, status, criado_em) VALUES (?, ?, ?, 'pendente', ?)").run(id, usuario.id, valor, nowISO());
  const pref = await _mpFetch('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ title: `Créditos de IA — Villela Academy (R$ ${(valor / 100).toFixed(2)})`, quantity: 1, unit_price: valor / 100, currency_id: 'BRL' }],
      payer: { email: usuario.email },
      external_reference: 'academy-ia:' + id,
      back_urls: { success: `${baseUrl}/academy/app?recarga=${id}`, pending: `${baseUrl}/academy/app?recarga=${id}`, failure: `${baseUrl}/academy/app?recarga=${id}` },
      auto_return: 'approved',
      notification_url: `${baseUrl}/academy/webhooks/mercadopago`,
      statement_descriptor: 'VILLELA ACADEMY',
    }),
  });
  db.prepare('UPDATE ia_recargas SET mp_preference_id = ? WHERE id = ?').run(s(pref.id, 80), id);
  return { recarga_id: id, init_point: pref.init_point || pref.sandbox_init_point || '' };
}

// Idempotente: o índice único (tipo, ref) do razão impede creditar a mesma recarga duas vezes.
function aplicarPagamento(pay) {
  const id = String(pay.external_reference || '').slice('academy-ia:'.length);
  const rec = db.prepare('SELECT * FROM ia_recargas WHERE id = ?').get(id);
  if (!rec) return { resultado: 'ignorado' };
  const st = String(pay.status || '');
  if (st === 'approved') {
    if (rec.status === 'paga') return { resultado: 'ja-paga' };
    // o valor creditado é o da recarga que NÓS criamos, conferido com o que o MP diz ter recebido
    if (pay.transaction_amount != null && Math.round(Number(pay.transaction_amount) * 100) !== rec.valor_centavos) return { resultado: 'valor-divergente' };
    transacao(() => {
      db.prepare("UPDATE ia_recargas SET status = 'paga', mp_payment_id = ?, pago_em = ? WHERE id = ?").run(s(pay.id, 40), nowISO(), rec.id);
      lancar(rec.user_id, 'recarga', rec.valor_centavos * 10, { ref: rec.id, detalhe: 'recarga pelo Mercado Pago', quem: 'mercadopago' });
    });
    repo.Auditoria.registrar({ quem: 'mercadopago', acao: 'ia.recarga.paga', entidade: 'ia_recargas', entidade_id: rec.id, detalhe: `R$ ${(rec.valor_centavos / 100).toFixed(2)}` });
    return { resultado: 'paga' };
  }
  if (['rejected', 'cancelled'].includes(st) && rec.status === 'pendente') {
    db.prepare('UPDATE ia_recargas SET status = ?, mp_payment_id = ? WHERE id = ?').run(st === 'rejected' ? 'recusada' : 'cancelada', s(pay.id, 40), rec.id);
    return { resultado: st };
  }
  if (['refunded', 'charged_back'].includes(st) && rec.status === 'paga') {
    transacao(() => {
      db.prepare("UPDATE ia_recargas SET status = 'reembolsada' WHERE id = ?").run(rec.id);
      // o dinheiro voltou ao pagador: o crédito sai. Se já foi gasto, o saldo fica negativo e a IA para até regularizar.
      lancar(rec.user_id, 'estorno_recarga', -rec.valor_centavos * 10, { ref: rec.id, detalhe: st === 'charged_back' ? 'chargeback (MP)' : 'reembolso (MP)', quem: 'mercadopago' });
    });
    return { resultado: 'reembolsada' };
  }
  return { resultado: 'sem-acao:' + st };
}
async function conferirRecarga(usuario, id) {
  const rec = db.prepare('SELECT * FROM ia_recargas WHERE id = ? AND user_id = ?').get(s(id, 40), usuario.id);
  if (!rec) throw erro('Recarga não encontrada.', 404);
  if (rec.status === 'pendente' && _mpFetch) {
    const r = await _mpFetch(`/v1/payments/search?external_reference=${encodeURIComponent('academy-ia:' + rec.id)}&sort=date_created&criteria=desc`);
    for (const pay of (r && r.results) || []) aplicarPagamento(pay);
  }
  return { status: db.prepare('SELECT status FROM ia_recargas WHERE id = ?').get(rec.id).status, saldo_milesimos: saldo(usuario.id), saldo: brl(saldo(usuario.id)) };
}

// ---------------------------------------------------------------------
// EXTRATO — uma linha por uso (reserva + acerto somados), não duas
// ---------------------------------------------------------------------
const ROTULO = { recarga: 'Recarga', cortesia: 'Crédito de cortesia', ajuste: 'Ajuste', estorno_recarga: 'Recarga devolvida' };
const AGENTE = { tutor: 'Tutor Villela', suporte: 'Tutor Villela', mentor: 'Mentor do Villela Lab', refinar: 'Lapidar com IA', estruturar: 'Estruturar curso', copy: 'Página de venda', pedagogico: 'Revisão pedagógica', relatorio: 'Relatório executivo' };
function extrato(userId, n = 30) {
  const linhas = db.prepare('SELECT * FROM ia_movimentos WHERE user_id = ? ORDER BY criado_em DESC, rowid DESC LIMIT 400').all(userId);
  const usos = {}, saida = [];
  for (const m of linhas) {
    if (['reserva', 'acerto', 'estorno'].includes(m.tipo)) {
      let u = usos[m.ref];
      if (!u) { u = usos[m.ref] = { tipo: 'uso', milesimos: 0, quando: m.criado_em, agente: '', estornado: false, aberto: true }; saida.push(u); }
      u.milesimos += m.milesimos;
      if (m.tipo === 'reserva') { u.agente = m.detalhe; u.quando = m.criado_em; } else u.aberto = false;
      if (m.tipo === 'estorno') u.estornado = true;
    } else saida.push({ tipo: m.tipo, milesimos: m.milesimos, quando: m.criado_em, detalhe: m.detalhe });
  }
  return saida.slice(0, n).map(x => x.tipo === 'uso'
    ? { tipo: 'uso', quando: x.quando, milesimos: x.milesimos, valor: brl(Math.abs(x.milesimos)),
        descricao: (AGENTE[x.agente] || x.agente || 'IA') + (x.estornado ? ' — não gerou, valor devolvido' : x.aberto ? ' — em andamento' : '') }
    : { tipo: x.tipo, quando: x.quando, milesimos: x.milesimos, valor: brl(Math.abs(x.milesimos)), descricao: (ROTULO[x.tipo] || x.tipo) + (x.detalhe && x.tipo !== 'recarga' ? ' — ' + x.detalhe : '') });
}

function carteiraDoUsuario(usuario) {
  const c = cfg();
  const sd = saldo(usuario.id);
  return {
    ativa: c.ativa, isento: isento(usuario.id, c), saldo_milesimos: sd, saldo: brl(sd),
    pacotes: c.pacotes_centavos.map(v => ({ valor_centavos: v, rotulo: 'R$ ' + (v / 100).toFixed(0) })),
    pagamento_online: !!_mpFetch,
    extrato: extrato(usuario.id),
    recargas_pendentes: db.prepare("SELECT id, valor_centavos, criado_em FROM ia_recargas WHERE user_id = ? AND status = 'pendente' AND criado_em > ? ORDER BY criado_em DESC").all(usuario.id, new Date(Date.now() - 2 * 864e5).toISOString()),
  };
}

// visão do dono da plataforma: quem tem saldo, quanto entrou, quanto foi consumido e quanto custou
function painelStaff() {
  const c = cfg();
  const carteiras = db.prepare(`SELECT m.user_id, u.nome, u.email, SUM(m.milesimos) saldo,
      SUM(CASE WHEN m.tipo = 'recarga' THEN m.milesimos ELSE 0 END) carregado,
      SUM(CASE WHEN m.tipo = 'cortesia' THEN m.milesimos ELSE 0 END) cortesia,
      -SUM(CASE WHEN m.tipo IN ('reserva', 'acerto', 'estorno') THEN m.milesimos ELSE 0 END) consumido,
      MAX(m.criado_em) ultimo FROM ia_movimentos m LEFT JOIN users u ON u.id = m.user_id GROUP BY m.user_id ORDER BY ultimo DESC LIMIT 500`).all()
    .map(x => ({ ...x, saldo_txt: brl(x.saldo), carregado_txt: brl(x.carregado), cortesia_txt: brl(x.cortesia), consumido_txt: brl(x.consumido) }));
  const soma = (k) => carteiras.reduce((t, x) => t + x[k], 0);
  const custo = db.prepare("SELECT COALESCE(SUM(custo_centavos_usd), 0) c FROM ai_usage_logs WHERE cobranca = 'paga' AND status = 'ok'").get().c;
  return {
    config: c, carteiras,
    total: { saldo: brl(soma('saldo')), carregado: brl(soma('carregado')), cortesia: brl(soma('cortesia')), consumido: brl(soma('consumido')), custo_provedor_usd: custo / 100 },
    creditos_manuais: db.prepare(`SELECT m.criado_em, m.tipo, m.milesimos, m.detalhe, m.quem, u.email FROM ia_movimentos m LEFT JOIN users u ON u.id = m.user_id
      WHERE m.tipo IN ('cortesia', 'ajuste') ORDER BY m.criado_em DESC LIMIT 100`).all().map(x => ({ ...x, valor: brl(x.milesimos) })),
  };
}

module.exports = {
  configurar, cfg, prepararConfig, cambio, ptax, atualizarPTAX, FOLGA_PADRAO_PCT, PTAX_VALE_DIAS, brl, precoEmMilesimos, isento, temFranquia, saldo, reservar, acertar, estornar, creditar,
  criarRecarga, aplicarPagamento, conferirRecarga, extrato, carteiraDoUsuario, painelStaff,
  MARGEM_PADRAO_PCT, PACOTES_PADRAO, TIPOS_CREDITO,
};
