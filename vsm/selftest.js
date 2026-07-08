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
const mpFetch = async (path, opts) => {
  mpChamadas.push(path);
  if (path === '/preapproval' && opts && opts.method === 'POST') return { id: 'PRE999', init_point: 'https://mp/PRE999', status: 'pending', external_reference: 'vsm' };
  if (path.startsWith('/preapproval/')) return { id: 'PRE999', status: 'authorized' };
  return {};
};
mpFetch.__mock = true;

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
const saas = require('./index');
saas.montar(app, { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto, mpFetch, jwtSecret: 'seg-teste' });

let BASE = '', ok = 0, falhas = [];
const jar = {};
async function req(m, p, { corpo, user = 'adm', cookies } = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-test-user': user };
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
  await t('app: gating por módulo + limite de imóveis (plano starter)', async () => {
    const nova = await req('POST', '/staff/api/vsm/tenants', { corpo: { nome: 'Hostel Delta', email: 'delta@t.br', plano: 'starter' } });
    const link = await req('POST', `/staff/api/vsm/tenants/${nova.json.tenant.id}/link-acesso`);
    const token = new URL(link.json.url).searchParams.get('token');
    assert.equal((await req('POST', '/gestao/api/definir-senha', { corpo: { token, senha: 'SenhaForte2' } })).st, 200);
    assert.equal((await req('POST', '/gestao/api/login', { corpo: { email: 'delta@t.br', senha: 'SenhaForte2' }, cookies: true })).st, 200);
    // starter (editado no teste p/ [imoveis, reservas]): hospede → 403, imoveis → 200
    assert.equal((await req('GET', '/gestao/api/app/hospedes', { cookies: true })).st, 403);
    assert.equal((await req('GET', '/gestao/api/app/imoveis', { cookies: true })).st, 200);
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

  srv.close();
  console.log(`\n${ok} teste(s) OK, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach(f => console.log('  ✗', f)); process.exit(1); }
}
rodar().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
