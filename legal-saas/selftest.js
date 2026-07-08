// =====================================================================
// Villela Legal SaaS — suíte de testes. Roda o Express real com auth de
// teste injetada, banco descartável e MP mockado. npm run test:legal-saas
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'legalsaas-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');

const USUARIOS = [
  { id: 'adm', nome: 'Admin', email: 'adm@t', papel: 'admin', areas: ['*'], ativo: true },
  { id: 'op', nome: 'Operador', email: 'op@t', papel: 'membro', areas: ['ti'], ativo: true },
];
const lerUsuarios = () => USUARIOS;
function requireAuth(req, res, next) { const u = USUARIOS.find(x => x.id === (req.headers['x-test-user'] || 'adm')); if (!u) return res.status(401).json({ erro: 'x' }); req.user = u; next(); }
const requireAdmin = (req, res, next) => (req.user && req.user.papel === 'admin') ? next() : res.status(403).json({ erro: 'admin' });
const enviados = [];
const enviarEmail = async (to, ass, html) => { enviados.push({ to, ass, html }); return true; };
const alertaAugusto = async () => {};

// MP mock
const mpChamadas = [];
const mpFetch = async (path, opts) => {
  mpChamadas.push(path);
  if (path === '/preapproval' && opts && opts.method === 'POST') return { id: 'PRE999', init_point: 'https://mp/PRE999', status: 'pending', external_reference: 'legalsaas' };
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
  console.log('Villela Legal SaaS — selftest\n');

  await t('landing pública renderiza com planos', async () => {
    const r = await req('GET', '/juridico');
    assert.ok(r.texto.includes('Villela Legal') && r.texto.includes('Profissional') && r.texto.includes('Testar 14 dias'));
  });
  await t('dashboard só admin (operador → 403)', async () => {
    assert.equal((await req('GET', '/staff/api/legal-saas/dashboard', { user: 'op' })).st, 403);
    assert.equal((await req('GET', '/staff/api/legal-saas/dashboard')).st, 200);
  });

  let tid;
  await t('criar escritório (tenant) em trial', async () => {
    const r = await req('POST', '/staff/api/legal-saas/tenants', { corpo: { nome: 'Alfa Advocacia', email: 'alfa@adv.br', plano: 'profissional' } });
    assert.equal(r.st, 200); tid = r.json.tenant.id;
    assert.equal(r.json.tenant.status, 'trial');
    assert.ok(r.json.tenant.trial_expira_em);
  });
  await t('entitlements: profissional libera IA e ia_direta', async () => {
    const r = await req('GET', '/staff/api/legal-saas/tenants/' + tid);
    const e = r.json.tenant.entitlements;
    assert.ok(e.modulos.includes('ia') && e.flags.ia_direta === true && e.acesso_liberado === true);
  });
  await t('override negociado sobrepõe limite e flag', async () => {
    await req('POST', `/staff/api/legal-saas/tenants/${tid}/settings`, { corpo: { limites_over: { processos_ativos: 9999 }, flags_over: { white_label: true } } });
    const e = (await req('GET', '/staff/api/legal-saas/tenants/' + tid)).json.tenant.entitlements;
    assert.equal(e.limites.processos_ativos, 9999); assert.equal(e.flags.white_label, true);
  });
  await t('suspender bloqueia entrega (acesso_liberado false)', async () => {
    await req('POST', `/staff/api/legal-saas/tenants/${tid}/status`, { corpo: { status: 'suspensa' } });
    assert.equal((await req('GET', '/staff/api/legal-saas/tenants/' + tid)).json.tenant.entitlements.acesso_liberado, false);
    await req('POST', `/staff/api/legal-saas/tenants/${tid}/status`, { corpo: { status: 'ativa' } });
  });
  await t('planos: editar preço e módulos (admin)', async () => {
    const { planos } = (await req('GET', '/staff/api/legal-saas/planos')).json;
    const ess = planos.find(p => p.slug === 'essencial');
    const r = await req('PATCH', '/staff/api/legal-saas/planos/' + ess.id, { corpo: { preco_centavos: 19900, modulos: ['processos', 'prazos'] } });
    assert.equal(r.json.plano.preco_centavos, 19900);
    assert.deepEqual(r.json.plano.modulos.sort(), ['prazos', 'processos']);
  });
  await t('upgrade/downgrade troca plano do tenant', async () => {
    const up = await req('POST', `/staff/api/legal-saas/tenants/${tid}/plano`, { corpo: { plano: 'escritorio' } });
    assert.equal(up.json.tipo, 'upgrade');
    const dn = await req('POST', `/staff/api/legal-saas/tenants/${tid}/plano`, { corpo: { plano: 'essencial' } });
    assert.equal(dn.json.tipo, 'downgrade');
  });
  await t('custo por cliente + margem', async () => {
    await req('POST', `/staff/api/legal-saas/tenants/${tid}/custo`, { corpo: { categoria: 'ia', custo_centavos: 3000, detalhe: 'teste' } });
    const l = (await req('GET', '/staff/api/legal-saas/custo-por-cliente')).json.linhas.find(x => x.id === tid);
    assert.equal(l.custo_centavos, 3000); assert.equal(l.margem_centavos, l.receita_centavos - 3000);
  });

  // signup público + fluxo do assinante
  let linkSetup;
  await t('signup público cria escritório trial + link de senha', async () => {
    const r = await req('POST', '/juridico/api/signup', { corpo: { nome: 'Beta Sociedade', nome_responsavel: 'Dra. Beta', email: 'dra@beta.br', plano: 'trial' } });
    assert.equal(r.st, 200); assert.ok(r.json.link_setup); linkSetup = r.json.link_setup;
    assert.ok(enviados.some(e => e.to === 'dra@beta.br'));
  });
  await t('signup duplicado no mesmo e-mail → 400', async () => {
    assert.equal((await req('POST', '/juridico/api/signup', { corpo: { nome: 'X', email: 'dra@beta.br' } })).st, 400);
  });
  await t('assinante define senha, loga e vê entitlements', async () => {
    const token = new URL(linkSetup).searchParams.get('token');
    assert.equal((await req('POST', '/juridico/api/definir-senha', { corpo: { token, senha: 'SenhaForte1' } })).st, 200);
    assert.equal((await req('POST', '/juridico/api/login', { corpo: { email: 'dra@beta.br', senha: 'SenhaForte1' }, cookies: true })).st, 200);
    const me = await req('GET', '/juridico/api/me', { cookies: true });
    assert.equal(me.st, 200); assert.equal(me.json.escritorio.status, 'trial');
    assert.ok(me.json.entitlements.modulos.length > 0);
  });
  await t('assinante abre ticket; plataforma responde', async () => {
    const tk = await req('POST', '/juridico/api/tickets', { corpo: { assunto: 'Dúvida', texto: 'Como assino?' }, cookies: true });
    assert.equal(tk.st, 200);
    const lista = await req('GET', '/staff/api/legal-saas/tickets');
    const t0 = lista.json.tickets[0];
    await req('POST', `/staff/api/legal-saas/tickets/${t0.id}/responder`, { corpo: { texto: 'Pelo painel → Plano.' } });
    const det = await req('GET', '/juridico/api/tickets/' + t0.id, { cookies: true });
    assert.equal(det.json.ticket.mensagens.length, 2);
    assert.equal(det.json.ticket.status, 'respondido');
  });
  await t('assinante inicia assinatura (MP mock) → link de checkout', async () => {
    const r = await req('POST', '/juridico/api/cobranca/assinar', { corpo: { plano: 'profissional' }, cookies: true });
    assert.equal(r.st, 200); assert.ok(r.json.link.includes('PRE999'));
  });
  await t('webhook MP authorized → tenant ativa + fatura paga', async () => {
    // pega o tenant do signup (Beta) pela assinatura pendente
    const sub = require('./db').db.prepare("SELECT tenant_id FROM subscriptions WHERE mp_preapproval_id = 'PRE999'").get();
    const r = await req('POST', '/juridico/webhooks/mercadopago', { corpo: { type: 'subscription_preapproval', data: { id: 'PRE999' } } });
    assert.equal(r.st, 200);
    await new Promise(x => setTimeout(x, 150));
    const tt = saas.repo.Tenants.obter(sub.tenant_id);
    assert.equal(tt.status, 'ativa');
    const fat = require('./db').db.prepare("SELECT status FROM invoices WHERE tenant_id = ?").all(sub.tenant_id);
    assert.ok(fat.some(f => f.status === 'paga'));
  });
  await t('ciclo de vida: trial vencido → inadimplente', async () => {
    const nova = await req('POST', '/staff/api/legal-saas/tenants', { corpo: { nome: 'Gama', email: 'gama@t.br', plano: 'trial' } });
    require('./db').db.prepare("UPDATE tenants SET trial_expira_em = '2020-01-01T00:00:00Z' WHERE id = ?").run(nova.json.tenant.id);
    const r = await req('POST', '/staff/api/legal-saas/ciclo-diario');
    assert.ok(r.json.trials_vencidos >= 1);
    assert.equal(saas.repo.Tenants.obter(nova.json.tenant.id).status, 'inadimplente');
  });
  await t('login assinante errado 5x → 429', async () => {
    for (let i = 0; i < 5; i++) await req('POST', '/juridico/api/login', { corpo: { email: 'dra@beta.br', senha: 'errada' } });
    assert.equal((await req('POST', '/juridico/api/login', { corpo: { email: 'dra@beta.br', senha: 'SenhaForte1' } })).st, 429);
  });
  await t('lead da landing é registrado', async () => {
    await req('POST', '/juridico/api/lead', { corpo: { nome: 'Lead X', escritorio: 'Escr X', email: 'x@x.br' } });
    assert.ok((await req('GET', '/staff/api/legal-saas/leads')).json.leads.some(l => l.email === 'x@x.br'));
  });
  await t('auditoria administrativa registrada', async () => {
    assert.ok((await req('GET', '/staff/api/legal-saas/auditoria')).json.eventos.some(e => e.acao === 'tenant.criar'));
  });

  srv.close();
  console.log(`\n${ok} teste(s) OK, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach(f => console.log('  ✗', f)); process.exit(1); }
}
rodar().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
