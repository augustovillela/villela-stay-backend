// =====================================================================
// Villela Stay Manager (VSM) — suíte de testes. Roda o Express real com auth
// de teste injetada, banco descartável e MP mockado. npm run test:vsm
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'vsm-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');

const USUARIOS = [
  { id: 'adm', nome: 'Admin', email: 'adm@t', papel: 'admin', areas: ['*'], ativo: true },
  { id: 'op', nome: 'Operador', email: 'op@t', papel: 'membro', areas: ['ti'], ativo: true },
];
function requireAuth(req, res, next) { const u = USUARIOS.find(x => x.id === (req.headers['x-test-user'] || 'adm')); if (!u) return res.status(401).json({ erro: 'x' }); req.user = u; next(); }
const requireAdmin = (req, res, next) => (req.user && req.user.papel === 'admin') ? next() : res.status(403).json({ erro: 'admin' });
const enviados = [];
const enviarEmail = async (to, ass, html) => { enviados.push({ to, ass, html }); return true; };
const alertaAugusto = async () => {};

// MP mock
const mpChamadas = [];
let _payResp = {}; // resposta de /v1/payments/* controlada por teste (idempotência)
const mpFetch = async (path, opts) => {
  mpChamadas.push(path);
  if (path === '/preapproval' && opts && opts.method === 'POST') return { id: 'PRE999', init_point: 'https://mp/PRE999', status: 'pending', external_reference: 'vsm' };
  if (path.startsWith('/preapproval/')) return { id: 'PRE999', status: 'authorized' };
  if (path.startsWith('/v1/payments/')) return _payResp;
  return {};
};
mpFetch.__mock = true;

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
const saas = require('./index');
saas.montar(app, { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto, mpFetch, jwtSecret: 'seg-teste' });

// Stays mockada (fábrica de cliente injetável — sem rede)
const fakeListings = [{ _id: 'L1', id: 'CASA1', _mstitle: { pt_BR: 'Casa da Praia' }, _i_maxGuests: 6, _i_rooms: 3 }];
const fakeReservas = [{ _id: 'R1', _idlisting: 'L1', _idclient: 'C1', type: 'booked', checkInDate: '2026-10-01', checkOutDate: '2026-10-05', price: { _f_total: 1500 }, partner: { name: 'Airbnb' }, guests: 2 }];
const fakeCli = { base: 'https://minha.stays.com.br/external/v1', testar: async () => true, listings: async () => fakeListings, reservations: async () => fakeReservas, cliente: async (id) => ({ name: 'Cliente ' + id }) };
require('./app-stays-repo').setFabrica(() => fakeCli);

let BASE = '', ok = 0, falhas = [];
const jar = {};
async function req(m, p, { corpo, user = 'adm', cookies, headers: extras } = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-test-user': user, ...(extras || {}) };
  if (cookies) headers.Cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const r = await fetch(BASE + p, { method: m, headers, body: corpo ? JSON.stringify(corpo) : undefined, redirect: 'manual' });
  (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach(c => { const [kv] = c.split(';'); const [k, v] = kv.split('='); jar[k] = v; });
  const texto = await r.text(); let json = null; try { json = JSON.parse(texto); } catch (_) {}
  return { st: r.status, json, texto, ct: r.headers.get('content-type') || '' };
}
async function t(nome, fn) { try { await fn(); ok++; console.log('  ✅', nome); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌', nome, '—', e.message); } }

async function rodar() {
  const srv = app.listen(0); BASE = 'http://127.0.0.1:' + srv.address().port;
  console.log('Villela Stay Manager — selftest\n');

  await t('landing pública renderiza com planos', async () => {
    const r = await req('GET', '/gestao');
    assert.ok(r.texto.includes('Villela Stay Manager') && r.texto.includes('Pro') && r.texto.includes('Testar 14 dias'));
  });
  await t('dashboard só admin (operador → 403)', async () => {
    assert.equal((await req('GET', '/staff/api/vsm/dashboard', { user: 'op' })).st, 403);
    assert.equal((await req('GET', '/staff/api/vsm/dashboard')).st, 200);
  });
  await t('preços finais (11/07): starter 129, pro 299, business 699', async () => {
    const { planos } = (await req('GET', '/staff/api/vsm/planos')).json;
    const preco = (slug) => planos.find(p => p.slug === slug).preco_centavos;
    assert.equal(preco('starter'), 12900); assert.equal(preco('pro'), 29900); assert.equal(preco('business'), 69900);
  });

  let tid;
  await t('criar operação (tenant) em trial', async () => {
    const r = await req('POST', '/staff/api/vsm/tenants', { corpo: { nome: 'Pousada Alfa', email: 'alfa@host.br', plano: 'pro' } });
    assert.equal(r.st, 200); tid = r.json.tenant.id;
    assert.equal(r.json.tenant.status, 'trial');
    assert.ok(r.json.tenant.trial_expira_em);
  });
  await t('entitlements: pro libera IA e ia_direta', async () => {
    const r = await req('GET', '/staff/api/vsm/tenants/' + tid);
    const e = r.json.tenant.entitlements;
    assert.ok(e.modulos.includes('ia') && e.flags.ia_direta === true && e.acesso_liberado === true);
  });
  await t('override negociado sobrepõe limite e flag', async () => {
    await req('POST', `/staff/api/vsm/tenants/${tid}/settings`, { corpo: { limites_over: { imoveis: 9999 }, flags_over: { white_label: true } } });
    const e = (await req('GET', '/staff/api/vsm/tenants/' + tid)).json.tenant.entitlements;
    assert.equal(e.limites.imoveis, 9999); assert.equal(e.flags.white_label, true);
  });
  await t('suspender bloqueia entrega (acesso_liberado false)', async () => {
    await req('POST', `/staff/api/vsm/tenants/${tid}/status`, { corpo: { status: 'suspensa' } });
    assert.equal((await req('GET', '/staff/api/vsm/tenants/' + tid)).json.tenant.entitlements.acesso_liberado, false);
    await req('POST', `/staff/api/vsm/tenants/${tid}/status`, { corpo: { status: 'ativa' } });
  });
  await t('planos: editar preço e módulos (admin)', async () => {
    const { planos } = (await req('GET', '/staff/api/vsm/planos')).json;
    const st = planos.find(p => p.slug === 'starter');
    const r = await req('PATCH', '/staff/api/vsm/planos/' + st.id, { corpo: { preco_centavos: 11900, modulos: ['imoveis', 'reservas'] } });
    assert.equal(r.json.plano.preco_centavos, 11900);
    assert.deepEqual(r.json.plano.modulos.sort(), ['imoveis', 'reservas']);
  });
  await t('upgrade/downgrade troca plano do tenant', async () => {
    const up = await req('POST', `/staff/api/vsm/tenants/${tid}/plano`, { corpo: { plano: 'business' } });
    assert.equal(up.json.tipo, 'upgrade');
    const dn = await req('POST', `/staff/api/vsm/tenants/${tid}/plano`, { corpo: { plano: 'starter' } });
    assert.equal(dn.json.tipo, 'downgrade');
  });
  await t('custo por cliente + margem', async () => {
    await req('POST', `/staff/api/vsm/tenants/${tid}/custo`, { corpo: { categoria: 'ia', custo_centavos: 3000, detalhe: 'teste' } });
    const l = (await req('GET', '/staff/api/vsm/custo-por-cliente')).json.linhas.find(x => x.id === tid);
    assert.equal(l.custo_centavos, 3000); assert.equal(l.margem_centavos, l.receita_centavos - 3000);
  });

  // signup público + fluxo do assinante
  let linkSetup;
  await t('signup público cria operação trial + link de senha', async () => {
    const r = await req('POST', '/gestao/api/signup', { corpo: { nome: 'Gestora Beta', nome_responsavel: 'Bea Host', email: 'bea@beta.br', plano: 'trial' } });
    assert.equal(r.st, 200); assert.ok(r.json.link_setup); linkSetup = r.json.link_setup;
    assert.ok(enviados.some(e => e.to === 'bea@beta.br'));
  });
  await t('signup duplicado no mesmo e-mail → 400', async () => {
    assert.equal((await req('POST', '/gestao/api/signup', { corpo: { nome: 'X', email: 'bea@beta.br' } })).st, 400);
  });
  await t('assinante define senha, loga e vê entitlements', async () => {
    const token = new URL(linkSetup).searchParams.get('token');
    assert.equal((await req('POST', '/gestao/api/definir-senha', { corpo: { token, senha: 'SenhaForte1' } })).st, 200);
    assert.equal((await req('POST', '/gestao/api/login', { corpo: { email: 'bea@beta.br', senha: 'SenhaForte1' }, cookies: true })).st, 200);
    const me = await req('GET', '/gestao/api/me', { cookies: true });
    assert.equal(me.st, 200); assert.equal(me.json.operacao.status, 'trial');
    assert.ok(me.json.entitlements.modulos.length > 0);
  });
  await t('assinante abre ticket; plataforma responde', async () => {
    const tk = await req('POST', '/gestao/api/tickets', { corpo: { assunto: 'Dúvida', texto: 'Como conecto o Airbnb?' }, cookies: true });
    assert.equal(tk.st, 200);
    const lista = await req('GET', '/staff/api/vsm/tickets');
    const t0 = lista.json.tickets[0];
    await req('POST', `/staff/api/vsm/tickets/${t0.id}/responder`, { corpo: { texto: 'Pelo módulo Canais.' } });
    const det = await req('GET', '/gestao/api/tickets/' + t0.id, { cookies: true });
    assert.equal(det.json.ticket.mensagens.length, 2);
    assert.equal(det.json.ticket.status, 'respondido');
  });
  await t('assinante inicia assinatura (MP mock) → link de checkout', async () => {
    const r = await req('POST', '/gestao/api/cobranca/assinar', { corpo: { plano: 'pro' }, cookies: true });
    assert.equal(r.st, 200); assert.ok(r.json.link.includes('PRE999'));
  });
  await t('webhook MP authorized → tenant ativa + fatura paga', async () => {
    const sub = require('./db').db.prepare("SELECT tenant_id FROM subscriptions WHERE mp_preapproval_id = 'PRE999'").get();
    const r = await req('POST', '/gestao/webhooks/mercadopago', { corpo: { type: 'subscription_preapproval', data: { id: 'PRE999' } } });
    assert.equal(r.st, 200);
    await new Promise(x => setTimeout(x, 150));
    const tt = saas.repo.Tenants.obter(sub.tenant_id);
    assert.equal(tt.status, 'ativa');
    const fat = require('./db').db.prepare("SELECT status FROM invoices WHERE tenant_id = ?").all(sub.tenant_id);
    assert.ok(fat.some(f => f.status === 'paga'));
  });
  await t('billing idempotente: webhook de pagamento repetido gera só 1 fatura', async () => {
    const sub = require('./db').db.prepare("SELECT tenant_id FROM subscriptions WHERE mp_preapproval_id = 'PRE999'").get();
    _payResp = { id: 'PAY_DUP', status: 'approved', external_reference: `vsm:${sub.tenant_id}:pro` };
    for (let i = 0; i < 3; i++) { // MP re-tenta o mesmo webhook
      assert.equal((await req('POST', '/gestao/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 'PAY_DUP' } } })).st, 200);
      await new Promise(x => setTimeout(x, 80));
    }
    const n = require('./db').db.prepare("SELECT COUNT(*) c FROM invoices WHERE mp_payment_id = 'PAY_DUP'").get().c;
    assert.equal(n, 1, `MP reenviou 3x; deve haver 1 fatura, vieram ${n}`);
  });
  // ---- APP DE GESTÃO REAL (assinante Beta = pro/ativa, cookie ativo) ----
  let imovelId;
  await t('app: cadastra imóvel', async () => {
    const r = await req('POST', '/gestao/api/app/imoveis', { corpo: { nome: 'Casa Azul', tipo: 'casa', capacidade: 4, tarifa_base_centavos: 50000 }, cookies: true });
    assert.equal(r.st, 200); imovelId = r.json.imovel.id;
  });
  await t('app: lança reserva → gera limpeza de check-out + receita', async () => {
    const r = await req('POST', '/gestao/api/app/reservas', { corpo: { imovel_id: imovelId, hospede_nome: 'João', checkin: '2026-08-01', checkout: '2026-08-05', valor_centavos: 200000, canal: 'direto' }, cookies: true });
    assert.equal(r.st, 200); assert.equal(r.json.reserva.noites, 4);
    const lp = await req('GET', '/gestao/api/app/limpezas', { cookies: true });
    assert.ok(lp.json.limpezas.some(l => l.reserva_id === r.json.reserva.id && l.tipo === 'checkout'));
    const fi = await req('GET', '/gestao/api/app/financeiro', { cookies: true });
    assert.ok(fi.json.lancamentos.some(l => l.tipo === 'receita' && l.valor_centavos === 200000));
  });
  await t('app: anti-overbooking bloqueia sobreposição', async () => {
    const r = await req('POST', '/gestao/api/app/reservas', { corpo: { imovel_id: imovelId, hospede_nome: 'Maria', checkin: '2026-08-03', checkout: '2026-08-06' }, cookies: true });
    assert.equal(r.st, 400); assert.ok(/overbooking|conflito/i.test(r.json.erro));
  });
  await t('app: painel conta imóveis e reservas', async () => {
    const r = await req('GET', '/gestao/api/app/painel', { cookies: true });
    assert.ok(r.json.painel.imoveis >= 1 && r.json.painel.reservas_ativas >= 1);
  });
  await t('app/stays: conectar valida credencial e salva (mascarada)', async () => {
    const r = await req('POST', '/gestao/api/app/stays/conectar', { corpo: { base_url: 'minha.stays.com.br', client_id: 'meu-id-123456', secret: 'meu-secret' }, cookies: true });
    assert.equal(r.st, 200); assert.equal(r.json.conta.conectada, true);
    assert.ok(/•/.test(r.json.conta.client_id) && !r.json.conta.client_id.includes('123456')); // nunca devolve cru
  });
  await t('app/stays: sincronizar importa anúncios e reservas', async () => {
    const r = await req('POST', '/gestao/api/app/stays/sincronizar', { cookies: true });
    assert.equal(r.st, 200); assert.ok(r.json.imoveis >= 1 && r.json.reservas_novas >= 1);
    const im = await req('GET', '/gestao/api/app/imoveis', { cookies: true });
    assert.ok(im.json.imoveis.some(i => i.nome === 'Casa da Praia' && i.origem === 'stays'));
    const rv = await req('GET', '/gestao/api/app/reservas', { cookies: true });
    assert.ok(rv.json.reservas.some(x => x.canal === 'airbnb' && x.hospede_nome === 'Cliente C1' && x.origem === 'stays'));
  });
  await t('app/stays: reimportar é idempotente (upsert, não duplica)', async () => {
    const antes = (await req('GET', '/gestao/api/app/reservas', { cookies: true })).json.reservas.length;
    await req('POST', '/gestao/api/app/stays/sincronizar', { cookies: true });
    const depois = (await req('GET', '/gestao/api/app/reservas', { cookies: true })).json.reservas.length;
    assert.equal(antes, depois);
  });

  // ---- CHECKLIST DE ETAPAS por reserva ----
  let reservaJoao;
  await t('checklist: reserva confirmada nasce com etapas pré-reserva prontas', async () => {
    const rs = (await req('GET', '/gestao/api/app/reservas', { cookies: true })).json.reservas;
    reservaJoao = rs.find(r => r.hospede_nome === 'João');
    assert.equal(reservaJoao.checklist_feitas, 3); // consulta + pendência + reserva
    const det = (await req('GET', '/gestao/api/app/reservas/' + reservaJoao.id, { cookies: true })).json.reserva;
    assert.ok(det.checklist.find(e => e.chave === 'reserva').feito);
    assert.ok(!det.checklist.find(e => e.chave === 'boas_vindas').feito);
  });
  await t('checklist: marcar/desmarcar etapa e rejeitar etapa inválida', async () => {
    const r = await req('POST', `/gestao/api/app/reservas/${reservaJoao.id}/checklist`, { corpo: { etapa: 'boas_vindas' }, cookies: true });
    assert.equal(r.st, 200); assert.equal(r.json.reserva.checklist_feitas, 4);
    const des = await req('POST', `/gestao/api/app/reservas/${reservaJoao.id}/checklist`, { corpo: { etapa: 'boas_vindas', feito: false }, cookies: true });
    assert.equal(des.json.reserva.checklist_feitas, 3);
    assert.equal((await req('POST', `/gestao/api/app/reservas/${reservaJoao.id}/checklist`, { corpo: { etapa: 'inexistente' }, cookies: true })).st, 400);
  });

  // ---- ESTOQUE ----
  await t('estoque: item com mínimo + baixa por reserva marca a etapa e alerta falta', async () => {
    const it = await req('POST', '/gestao/api/app/estoque', { corpo: { nome: 'Papel higiênico', categoria: 'pessoal', quantidade: 5, minimo: 4, por_reserva: 2 }, cookies: true });
    assert.equal(it.st, 200); assert.equal(it.json.item.em_falta, false);
    const bx = await req('POST', '/gestao/api/app/estoque/baixa-reserva', { corpo: { reserva_id: reservaJoao.id }, cookies: true });
    assert.equal(bx.st, 200); assert.equal(bx.json.ja_feita, false);
    assert.equal(bx.json.itens[0].quantidade, 3);
    assert.ok(bx.json.em_falta.some(i => i.nome === 'Papel higiênico')); // 3 < mínimo 4
    const det = (await req('GET', '/gestao/api/app/reservas/' + reservaJoao.id, { cookies: true })).json.reserva;
    assert.ok(det.checklist.find(e => e.chave === 'estoque').feito); // baixa marcou a etapa
  });
  await t('estoque: baixa repetida da mesma reserva não duplica', async () => {
    const bx = await req('POST', '/gestao/api/app/estoque/baixa-reserva', { corpo: { reserva_id: reservaJoao.id }, cookies: true });
    assert.equal(bx.json.ja_feita, true);
    const itens = (await req('GET', '/gestao/api/app/estoque', { cookies: true })).json.itens;
    assert.equal(itens.find(i => i.nome === 'Papel higiênico').quantidade, 3);
  });

  // ---- TOKEN DE API (flag api_publica — plano pro do Beta tem) ----
  let tokenApi, tokenId;
  await t('api: gerar token (exibido 1x) e autenticar por Bearer sem cookie', async () => {
    const r = await req('POST', '/gestao/api/tokens', { corpo: { nome: 'Claude Code' }, cookies: true });
    assert.equal(r.st, 200); assert.ok(r.json.token.startsWith('vsm_'));
    tokenApi = r.json.token; tokenId = r.json.id;
    const lista = (await req('GET', '/gestao/api/tokens', { cookies: true })).json.tokens;
    assert.ok(lista.length === 1 && !JSON.stringify(lista).includes(tokenApi)); // nunca devolve o token cru
    const im = await req('GET', '/gestao/api/app/imoveis', { headers: { Authorization: 'Bearer ' + tokenApi } });
    assert.equal(im.st, 200); assert.ok(im.json.imoveis.length >= 1);
  });
  await t('api: token não gerencia credenciais; revogado → 401', async () => {
    assert.equal((await req('POST', '/gestao/api/tokens', { corpo: { nome: 'x' }, headers: { Authorization: 'Bearer ' + tokenApi } })).st, 403);
    assert.equal((await req('DELETE', '/gestao/api/tokens/' + tokenId, { cookies: true })).st, 200);
    assert.equal((await req('GET', '/gestao/api/app/imoveis', { headers: { Authorization: 'Bearer ' + tokenApi } })).st, 401);
  });

  // ---- WEBHOOKS de eventos ----
  const entregas = [];
  const receptor = require('http').createServer((rq, rs) => {
    let corpo = '';
    rq.on('data', c => corpo += c);
    rq.on('end', () => { entregas.push({ corpo, assinatura: rq.headers['x-vsm-assinatura'] }); rs.end('ok'); });
  });
  await new Promise(x => receptor.listen(0, x));
  let segredoWh;
  await t('webhooks: cadastrar endpoint devolve o segredo 1x', async () => {
    const url = 'http://127.0.0.1:' + receptor.address().port + '/hook';
    const r = await req('POST', '/gestao/api/app/webhooks', { corpo: { url, eventos: ['reserva.confirmada'] }, cookies: true });
    assert.equal(r.st, 200); assert.ok(r.json.webhook.segredo.startsWith('whsec_'));
    segredoWh = r.json.webhook.segredo;
    const lista = (await req('GET', '/gestao/api/app/webhooks', { cookies: true })).json.webhooks;
    assert.ok(lista.length === 1 && !JSON.stringify(lista).includes(segredoWh)); // segredo mascarado na listagem
  });
  await t('webhooks: reserva confirmada entrega POST com HMAC válido', async () => {
    const r = await req('POST', '/gestao/api/app/reservas', { corpo: { imovel_id: imovelId, hospede_nome: 'Web Hook', checkin: '2026-09-01', checkout: '2026-09-03', valor_centavos: 10000 }, cookies: true });
    assert.equal(r.st, 200);
    for (let i = 0; i < 30 && !entregas.length; i++) await new Promise(x => setTimeout(x, 100)); // entrega assíncrona
    assert.ok(entregas.length >= 1, 'webhook não entregue');
    const ev = JSON.parse(entregas[0].corpo);
    assert.equal(ev.evento, 'reserva.confirmada');
    assert.equal(ev.dados.reserva.hospede_nome, 'Web Hook');
    const hmac = require('crypto').createHmac('sha256', segredoWh).update(entregas[0].corpo).digest('hex');
    assert.equal(entregas[0].assinatura, 'sha256=' + hmac);
  });

  // ---- CONSULTAS (mini-funil pré-reserva) ----
  let consultaId;
  await t('consultas: registrar e mover no funil; converter exige imóvel+datas', async () => {
    const r = await req('POST', '/gestao/api/app/consultas', { corpo: { hospede_nome: 'Ana Interessada', contato: '61 9....', canal: 'airbnb', obs: 'perguntou fim de semana' }, cookies: true });
    assert.equal(r.st, 200); assert.equal(r.json.consulta.status, 'nova'); consultaId = r.json.consulta.id;
    const resp = await req('POST', `/gestao/api/app/consultas/${consultaId}/status`, { corpo: { status: 'respondida' }, cookies: true });
    assert.equal(resp.json.consulta.status, 'respondida');
    assert.equal((await req('POST', `/gestao/api/app/consultas/${consultaId}/converter`, { corpo: {}, cookies: true })).st, 400); // sem imóvel/datas
    const painel = (await req('GET', '/gestao/api/app/painel', { cookies: true })).json.painel;
    assert.ok(painel.consultas_abertas >= 1);
  });
  await t('consultas: converter cria reserva confirmada com etapas pré-reserva prontas', async () => {
    const r = await req('POST', `/gestao/api/app/consultas/${consultaId}/converter`, { corpo: { imovel_id: imovelId, checkin: '2026-11-10', checkout: '2026-11-12', valor_centavos: 80000 }, cookies: true });
    assert.equal(r.st, 200);
    assert.equal(r.json.consulta.status, 'convertida');
    assert.equal(r.json.consulta.reserva_id, r.json.reserva.id);
    assert.equal(r.json.reserva.status, 'confirmada');
    assert.equal(r.json.reserva.checklist_feitas, 3); // consulta + pendência + reserva
    // consulta convertida não volta pro funil
    assert.equal((await req('POST', `/gestao/api/app/consultas/${consultaId}/status`, { corpo: { status: 'perdida' }, cookies: true })).st, 400);
  });

  // ---- PRECIFICAÇÃO assistida ----
  await t('precificação: salvar parâmetros e simular preço mínimo com lucro', async () => {
    const p = await req('PUT', '/gestao/api/app/precificacao/' + imovelId, { corpo: { faxina_centavos: 15000, lavanderia_centavos: 5000, insumos_centavos: 3000, custo_noite_centavos: 2000, comissao_pct: 15, imposto_pct: 10, margem_pct: 20 }, cookies: true });
    assert.equal(p.st, 200);
    const s2 = (await req('GET', '/gestao/api/app/precificacao/' + imovelId + '/simular?noites=2', { cookies: true })).json.simulacao;
    assert.equal(s2.custos_fixos_estadia_centavos, 23000);
    assert.equal(s2.preco_minimo_noite_centavos, Math.round((23000 / 2 + 2000) / 0.55)); // 245,45
    assert.equal(s2.tarifa_base_cobre, s2.tarifa_base_centavos >= s2.preco_minimo_noite_centavos);
    // percentuais fora da régua → 400
    assert.equal((await req('PUT', '/gestao/api/app/precificacao/' + imovelId, { corpo: { margem_pct: 91 }, cookies: true })).st, 400);
  });

  await t('app: gating por módulo + limite de imóveis (plano starter)', async () => {
    const nova = await req('POST', '/staff/api/vsm/tenants', { corpo: { nome: 'Hostel Delta', email: 'delta@t.br', plano: 'starter' } });
    const link = await req('POST', `/staff/api/vsm/tenants/${nova.json.tenant.id}/link-acesso`);
    const token = new URL(link.json.url).searchParams.get('token');
    assert.equal((await req('POST', '/gestao/api/definir-senha', { corpo: { token, senha: 'SenhaForte2' } })).st, 200);
    assert.equal((await req('POST', '/gestao/api/login', { corpo: { email: 'delta@t.br', senha: 'SenhaForte2' }, cookies: true })).st, 200);
    // starter (editado no teste p/ [imoveis, reservas]): hospede/estoque → 403, imoveis → 200
    assert.equal((await req('GET', '/gestao/api/app/hospedes', { cookies: true })).st, 403);
    assert.equal((await req('GET', '/gestao/api/app/estoque', { cookies: true })).st, 403);
    assert.equal((await req('GET', '/gestao/api/app/imoveis', { cookies: true })).st, 200);
    // starter não tem api_publica → gerar token e cadastrar webhook = 403
    assert.equal((await req('POST', '/gestao/api/tokens', { corpo: { nome: 'x' }, cookies: true })).st, 403);
    assert.equal((await req('POST', '/gestao/api/app/webhooks', { corpo: { url: 'https://x.br/h' }, cookies: true })).st, 403);
    // limite de 3 imóveis do starter
    for (let i = 0; i < 3; i++) assert.equal((await req('POST', '/gestao/api/app/imoveis', { corpo: { nome: 'Q' + i }, cookies: true })).st, 200);
    const q4 = await req('POST', '/gestao/api/app/imoveis', { corpo: { nome: 'Q4' }, cookies: true });
    assert.equal(q4.st, 400); assert.ok(/limite/i.test(q4.json.erro));
  });
  await t('app: suspensa bloqueia o acesso ao app (403)', async () => {
    const delta = (await req('GET', '/staff/api/vsm/tenants')).json.tenants.find(x => x.email_contato === 'delta@t.br');
    await req('POST', `/staff/api/vsm/tenants/${delta.id}/status`, { corpo: { status: 'suspensa' } });
    assert.equal((await req('GET', '/gestao/api/app/imoveis', { cookies: true })).st, 403);
  });

  await t('ciclo de vida: trial vencido → inadimplente', async () => {
    const nova = await req('POST', '/staff/api/vsm/tenants', { corpo: { nome: 'Gama Stays', email: 'gama@t.br', plano: 'trial' } });
    require('./db').db.prepare("UPDATE tenants SET trial_expira_em = '2020-01-01T00:00:00Z' WHERE id = ?").run(nova.json.tenant.id);
    const r = await req('POST', '/staff/api/vsm/ciclo-diario');
    assert.ok(r.json.trials_vencidos >= 1);
    assert.equal(saas.repo.Tenants.obter(nova.json.tenant.id).status, 'inadimplente');
  });
  await t('login assinante errado 5x → 429', async () => {
    for (let i = 0; i < 5; i++) await req('POST', '/gestao/api/login', { corpo: { email: 'bea@beta.br', senha: 'errada' } });
    assert.equal((await req('POST', '/gestao/api/login', { corpo: { email: 'bea@beta.br', senha: 'SenhaForte1' } })).st, 429);
  });
  await t('lead da landing é registrado', async () => {
    await req('POST', '/gestao/api/lead', { corpo: { nome: 'Lead X', empresa: 'Op X', email: 'x@x.br' } });
    assert.ok((await req('GET', '/staff/api/vsm/leads')).json.leads.some(l => l.email === 'x@x.br'));
  });
  await t('auditoria administrativa registrada', async () => {
    assert.ok((await req('GET', '/staff/api/vsm/auditoria')).json.eventos.some(e => e.acao === 'tenant.criar'));
  });

  // ---- ONDA LIVRO (paridade com o livro "Claude AI na Prática para Hospedagens") ----
  console.log('\n  — ONDA LIVRO —');
  await require('./selftest-livro').rodarTestesLivro({ req, t, assert, saas });

  srv.close(); receptor.close();
  console.log(`\n${ok} teste(s) OK, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach(f => console.log('  ✗', f)); process.exit(1); }
}
rodar().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
