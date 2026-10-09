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
const mpChamadas = [], mpPrefs = [];
let _payResp = {}; // resposta de /v1/payments/* controlada por teste (idempotência)
const mpFetch = async (path, opts) => {
  mpChamadas.push(path);
  if (path === '/checkout/preferences') { const b = JSON.parse(opts.body); mpPrefs.push(b); return { id: 'PREF' + mpPrefs.length, init_point: 'https://mp/pref/' + mpPrefs.length }; }
  if (path === '/preapproval' && opts && opts.method === 'POST') return { id: 'PRE999', init_point: 'https://mp/PRE999', status: 'pending', external_reference: 'legalsaas' };
  if (path.startsWith('/preapproval/')) return { id: 'PRE999', status: 'authorized' };
  if (path.startsWith('/v1/payments/')) return _payResp;
  return {};
};
mpFetch.__mock = true;

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
const saas = require('./index');
let _chaveValida = true; // o provedor "aceita" a chave? controlado por teste
saas.montar(app, { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto, mpFetch, jwtSecret: 'seg-teste-com-mais-de-16', validarChaveIA: async () => _chaveValida });

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
  await t('billing idempotente: webhook de pagamento repetido gera só 1 fatura', async () => {
    const sub = require('./db').db.prepare("SELECT tenant_id FROM subscriptions WHERE mp_preapproval_id = 'PRE999'").get();
    _payResp = { id: 'PAY_DUP', status: 'approved', external_reference: `legalsaas:${sub.tenant_id}:profissional` };
    for (let i = 0; i < 3; i++) { // MP re-tenta o mesmo webhook
      assert.equal((await req('POST', '/juridico/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 'PAY_DUP' } } })).st, 200);
      await new Promise(x => setTimeout(x, 80));
    }
    const n = require('./db').db.prepare("SELECT COUNT(*) c FROM invoices WHERE mp_payment_id = 'PAY_DUP'").get().c;
    assert.equal(n, 1, `MP reenviou 3x; deve haver 1 fatura, vieram ${n}`);
  });
  await t('ciclo de vida: trial vencido → inadimplente', async () => {
    const nova = await req('POST', '/staff/api/legal-saas/tenants', { corpo: { nome: 'Gama', email: 'gama@t.br', plano: 'trial' } });
    require('./db').db.prepare("UPDATE tenants SET trial_expira_em = '2020-01-01T00:00:00Z' WHERE id = ?").run(nova.json.tenant.id);
    const r = await req('POST', '/staff/api/legal-saas/ciclo-diario');
    assert.ok(r.json.trials_vencidos >= 1);
    assert.equal(saas.repo.Tenants.obter(nova.json.tenant.id).status, 'inadimplente');
  });
  await t('equipe do escritório pela API: só admin gerencia; link de senha funciona', async () => {
    // "dra@beta.br" é a assinante logada no jar (signup feito acima)
    const lista = await req('GET', '/juridico/api/usuarios', { cookies: true });
    assert.equal(lista.st, 200); assert.equal(lista.json.admin, true); assert.equal(lista.json.usuarios.length, 1);
    const novo = await req('POST', '/juridico/api/usuarios', { cookies: true, corpo: { nome: 'Estagiária', email: 'estag@beta.br', papel: 'usuario' } });
    assert.equal(novo.st, 200);
    assert.ok(/\/juridico\/definir-senha\?token=/.test(novo.json.definir_senha_url));
    const tok = new URL(novo.json.definir_senha_url).searchParams.get('token');
    assert.equal((await req('POST', '/juridico/api/definir-senha', { corpo: { token: tok, senha: 'SenhaEstag1' } })).st, 200);
    assert.equal((await req('POST', '/juridico/api/usuarios', { cookies: true, corpo: { email: 'estag@beta.br' } })).st, 400);
    assert.equal((await req('PATCH', '/juridico/api/usuarios/' + lista.json.eu, { cookies: true, corpo: { ativo: false } })).st, 400, 'não desativa a si mesmo');
    assert.equal((await req('GET', '/juridico/api/usuarios')).st, 401, 'sem sessão não lista');
  });
  // =================== CRÉDITOS DE IA (pré-pago) e CHAVE PRÓPRIA ===================
  const cr = saas.creditos;
  let escIA; // escritório de CORTESIA: prova que cortesia também paga a IA
  await t('IA: conversão custo → preço (câmbio + margem, para cima, piso de 1 centavo)', async () => {
    assert.throws(() => cr.centavosDe(1000000), /Cotação do dólar indisponível/, 'sem câmbio a IA por crédito fica pausada');
    cr.Config.atualizar({ cambio_modo: 'manual', cambio_manual: 5, margem_pct: 30 });
    assert.equal(cr.centavosDe(1000000), 650, 'US$ 1,00 × 5 × 1,30 = R$ 6,50');
    assert.equal(cr.centavosDe(1), 1, 'chamada mínima custa ao menos 1 centavo');
    assert.equal(cr.centavosDe(1001), 1); assert.equal(cr.centavosDe(0), 0);
    assert.equal(cr.centavosDe(400000), 260);
    assert.throws(() => cr.Config.atualizar({ margem_pct: -1 }), /Margem inválida/);
  });
  await t('IA: cortesia nasce SEM saldo; reserva exige saldo e trava o valor', async () => {
    const c = await req('POST', '/staff/api/legal-saas/cortesia', { corpo: { nome: 'IA Cortesia Adv', email: 'ia@cortesia.br', seed_demo: false } });
    escIA = c.json.tenant;
    assert.deepEqual(cr.Carteira.saldo(escIA.id), { saldo_centavos: 0, reservado_centavos: 0, disponivel_centavos: 0 });
    assert.throws(() => cr.Carteira.reservar(escIA.id, 300), (e) => e.codigo === 'SALDO_IA' && /pode custar até R\$ 3,00/.test(e.message) && /Recarregue/.test(e.message));
    assert.throws(() => cr.Carteira.creditar(escIA.id, 1000, {}), /referência/);
    assert.equal(cr.Carteira.creditar(escIA.id, 1000, { ref: 'mp:T1' }).duplicado, false);
    assert.equal(cr.Carteira.creditar(escIA.id, 1000, { ref: 'mp:T1' }).duplicado, true, 'mesma referência não credita duas vezes');
    const r1 = cr.Carteira.reservar(escIA.id, 700);
    assert.deepEqual(cr.Carteira.saldo(escIA.id), { saldo_centavos: 1000, reservado_centavos: 700, disponivel_centavos: 300 });
    assert.throws(() => cr.Carteira.reservar(escIA.id, 301), (e) => e.codigo === 'SALDO_IA', 'o reservado não pode ser gasto por outra tarefa');
    // liquida pelo real (menor): devolve a diferença
    assert.equal(cr.Carteira.liquidar(r1, 120, { modelo: 'm' }).cobrado_centavos, 120);
    assert.deepEqual(cr.Carteira.saldo(escIA.id), { saldo_centavos: 880, reservado_centavos: 0, disponivel_centavos: 880 });
    assert.equal(cr.Carteira.liquidar(r1, 120).ok, false, 'reserva não liquida duas vezes');
    // cancelar devolve tudo, sem lançar consumo
    const r2 = cr.Carteira.reservar(escIA.id, 500); cr.Carteira.cancelar(r2);
    assert.equal(cr.Carteira.saldo(escIA.id).disponivel_centavos, 880);
    // reserva esquecida (processo caiu) volta sozinha depois de 30 min
    const r3 = cr.Carteira.reservar(escIA.id, 800);
    require('./db').db.prepare('UPDATE ia_reservas SET criado_em = ? WHERE id = ?').run('2020-01-01T00:00:00Z', r3);
    assert.throws(() => cr.Carteira.reservar(escIA.id, 9999), (e) => e.disponivel_centavos === 880, 'a vencida foi liberada antes de checar');
    const ex = cr.Carteira.extrato(escIA.id);
    assert.deepEqual(ex.map(m => m.tipo).sort(), ['consumo', 'recarga']);
    assert.equal(ex.find(m => m.tipo === 'consumo').valor_centavos, -120);
  });
  await t('IA: recarga pelo Mercado Pago credita 1x; valor menor que o pedido NÃO credita', async () => {
    await assert.rejects(() => cr.Recargas.criar(escIA.id, 500, { email: 'ia@cortesia.br', baseUrl: 'https://x' }), /recarga mínima é R\$ 20,00/);
    const rec = await cr.Recargas.criar(escIA.id, 5000, { email: 'ia@cortesia.br', baseUrl: 'https://x' });
    assert.ok(rec.link.startsWith('https://mp/pref/'));
    const pref = mpPrefs[mpPrefs.length - 1];
    assert.equal(pref.items[0].unit_price, 50); assert.equal(pref.external_reference, `legalsaas-ia:${escIA.id}:${rec.id}`);
    const antes = cr.Carteira.saldo(escIA.id).saldo_centavos;
    // Pix de centavo com a referência certa: não vira crédito
    _payResp = { id: 'PAY_IA_MENOR', status: 'approved', transaction_amount: 0.01, external_reference: pref.external_reference };
    await req('POST', '/juridico/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 'PAY_IA_MENOR' } } }); await new Promise(x => setTimeout(x, 120));
    assert.equal(cr.Carteira.saldo(escIA.id).saldo_centavos, antes);
    // pendente não credita
    _payResp = { id: 'PAY_IA_1', status: 'pending', transaction_amount: 50, external_reference: pref.external_reference };
    await req('POST', '/juridico/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 'PAY_IA_1' } } }); await new Promise(x => setTimeout(x, 120));
    assert.equal(cr.Carteira.saldo(escIA.id).saldo_centavos, antes);
    // aprovado: credita o valor da recarga, uma vez, mesmo com o MP reenviando o aviso
    _payResp = { id: 'PAY_IA_1', status: 'approved', transaction_amount: 50, external_reference: pref.external_reference };
    for (let i = 0; i < 3; i++) { await req('POST', '/juridico/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 'PAY_IA_1' } } }); await new Promise(x => setTimeout(x, 80)); }
    assert.equal(cr.Carteira.saldo(escIA.id).saldo_centavos, antes + 5000);
    assert.equal(cr.Recargas.listar(escIA.id)[0].status, 'paga');
    // a recarga NÃO mexe na assinatura (cortesia continua cortesia) nem gera fatura de mensalidade
    assert.equal(saas.repo.Tenants.obter(escIA.id).status, 'cortesia');
    assert.equal(require('./db').db.prepare("SELECT COUNT(*) n FROM invoices WHERE tenant_id = ?").get(escIA.id).n, 0);
    // recarga de outro escritório com id trocado não credita
    _payResp = { id: 'PAY_IA_X', status: 'approved', transaction_amount: 50, external_reference: `legalsaas-ia:${tid}:${rec.id}` };
    await req('POST', '/juridico/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 'PAY_IA_X' } } }); await new Promise(x => setTimeout(x, 120));
    assert.equal(cr.Carteira.saldo(tid).saldo_centavos, 0);
  });
  await t('IA ponta a ponta: reserva ANTES de chamar o provedor, cobra o real, devolve o resto', async () => {
    const llm = require('../legal/llm'), ldb = require('../legal/db');
    process.env.ANTHROPIC_API_KEY = 'chave-do-servidor-teste';
    llm.configurarPortao((tl) => cr.portaoDoTenant(tl));
    const chamadas = [];
    let resposta = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'minuta' }], usage: { input_tokens: 10000, output_tokens: 4000 } };
    llm.definirFabricaClienteTeste((apiKey) => ({ messages: { stream: () => ({ finalMessage: async () => {
      chamadas.push({ apiKey, reservadoNaHora: cr.Carteira.saldo(escIA.id).reservado_centavos });
      if (resposta instanceof Error) throw resposta;
      return resposta;
    } }) } }));
    const noEscritorio = (fn) => ldb.comTenant('esc-' + escIA.slug, fn);
    const saldo0 = cr.Carteira.saldo(escIA.id).saldo_centavos;
    const r = await noEscritorio(() => llm.executar({ agenteId: 'pecas', prompt: 'x'.repeat(3000) }));
    assert.equal(r.texto, 'minuta');
    assert.equal(chamadas[0].apiKey, undefined, 'crédito usa a chave do servidor');
    assert.ok(chamadas[0].reservadoNaHora > 0, 'no instante da chamada ao provedor o dinheiro JÁ estava reservado');
    // custo real: 10.000×5 + 4.000×25 = 150.000 micro-US$ = US$ 0,15 → × 5 × 1,30 = R$ 0,975 → 98 centavos
    assert.equal(cr.Carteira.saldo(escIA.id).saldo_centavos, saldo0 - 98);
    assert.equal(cr.Carteira.saldo(escIA.id).reservado_centavos, 0, 'a sobra da reserva voltou');
    const mov = cr.Carteira.extrato(escIA.id)[0];
    assert.equal(mov.tipo, 'consumo'); assert.equal(mov.detalhe.agente, 'pecas'); assert.equal(mov.detalhe.usd_micros, 150000);
    assert.ok(mov.detalhe.reservado_centavos >= 98, 'a reserva (máximo) cobre o real');
    // provedor fora do ar: nada é cobrado e a reserva volta inteira
    resposta = Object.assign(new Error('overloaded'), { status: 529 });
    const s1 = cr.Carteira.saldo(escIA.id);
    await assert.rejects(() => noEscritorio(() => llm.executar({ agenteId: 'pecas', prompt: 'x' })), /overloaded/);
    assert.deepEqual(cr.Carteira.saldo(escIA.id), s1);
    // recusa do modelo: o provedor cobrou os tokens → cobra só esse tanto
    resposta = { stop_reason: 'refusal', content: [], usage: { input_tokens: 2000, output_tokens: 0 } };
    await assert.rejects(() => noEscritorio(() => llm.executar({ agenteId: 'pecas', prompt: 'x' })), /recusou/);
    assert.equal(cr.Carteira.saldo(escIA.id).saldo_centavos, s1.saldo_centavos - 7, '2.000×5 = 10.000 micro-US$ → R$ 0,065 → 7 centavos');
    assert.equal(cr.Carteira.saldo(escIA.id).reservado_centavos, 0);
    // SEM SALDO: o provedor NEM É CHAMADO
    resposta = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'y' }], usage: { input_tokens: 1, output_tokens: 1 } };
    const semSaldo = await req('POST', '/staff/api/legal-saas/cortesia', { corpo: { nome: 'Sem Saldo Adv', email: 'sem@saldo.br', seed_demo: false } });
    const n = chamadas.length;
    await assert.rejects(() => ldb.comTenant('esc-' + semSaldo.json.tenant.slug, () => llm.executar({ agenteId: 'geral', prompt: 'oi' })), (e) => e.codigo === 'SALDO_IA');
    assert.equal(chamadas.length, n, 'sem saldo, nenhuma chamada ao provedor');
    assert.equal(ldb.comTenant('esc-' + semSaldo.json.tenant.slug, () => llm.podeRodarRotina()), false, 'rotina não roda sem saldo');
    assert.equal(noEscritorio(() => llm.podeRodarRotina()), true);
    // escritório interno: não passa pelo portão e não é cobrado
    const totalAntes = require('./db').db.prepare('SELECT COUNT(*) n FROM ia_movimentos').get().n;
    await ldb.comTenant(ldb.TENANT_PADRAO, () => llm.executar({ agenteId: 'geral', prompt: 'oi' }));
    assert.equal(require('./db').db.prepare('SELECT COUNT(*) n FROM ia_movimentos').get().n, totalAntes);
    // escritório desconhecido / sem portão → bloqueado (nunca IA de graça por falta de configuração)
    await assert.rejects(() => ldb.comTenant('esc-nao-existe', () => llm.executar({ prompt: 'oi' })), /não reconhecido/);
    llm.configurarPortao(null);
    await assert.rejects(() => noEscritorio(() => llm.executar({ prompt: 'oi' })), /cobrança de IA não configurada/);
    llm.configurarPortao((tl) => cr.portaoDoTenant(tl));
    // CHAVE PRÓPRIA: usa a chave do escritório e não consome crédito
    await cr.Chaves.salvar(escIA.id, 'sk-ant-api03-' + 'A'.repeat(40) + 'WXYZ', 'ia@cortesia.br');
    const s2 = cr.Carteira.saldo(escIA.id);
    await noEscritorio(() => llm.executar({ agenteId: 'geral', prompt: 'oi' }));
    assert.equal(chamadas[chamadas.length - 1].apiKey, 'sk-ant-api03-' + 'A'.repeat(40) + 'WXYZ');
    assert.deepEqual(cr.Carteira.saldo(escIA.id), s2, 'com chave própria o saldo não se mexe');
    assert.equal(ldb.comTenant('esc-' + semSaldo.json.tenant.slug, () => llm.ativo()), true);
    // chave recusada pelo provedor: mensagem que diz o que fazer
    resposta = Object.assign(new Error('invalid x-api-key'), { status: 401 });
    await assert.rejects(() => noEscritorio(() => llm.executar({ prompt: 'oi' })), /sua chave de API foi recusada/);
    cr.Chaves.remover(escIA.id);
    llm.definirFabricaClienteTeste(null); llm.configurarPortao(null); delete process.env.ANTHROPIC_API_KEY;
  });
  await t('IA: chave própria fica CIFRADA e nenhuma rota a devolve', async () => {
    const chave = 'sk-ant-api03-' + 'B'.repeat(40) + 'QRST';
    await assert.rejects(() => cr.Chaves.salvar(escIA.id, 'minha-senha-do-claude', 'x'), /Chave inválida/);
    _chaveValida = false;
    await assert.rejects(() => cr.Chaves.salvar(escIA.id, chave, 'x'), /provedor recusou/);
    _chaveValida = true;
    assert.deepEqual(Object.keys(await cr.Chaves.salvar(escIA.id, chave, 'ia@cortesia.br')).sort(), ['desde', 'final4', 'provedor', 'tem']);
    const bruto = require('./db').db.prepare('SELECT chave_cifrada, final4 FROM ia_chaves WHERE tenant_id = ?').get(escIA.id);
    assert.ok(!bruto.chave_cifrada.includes('sk-ant') && !bruto.chave_cifrada.includes('BBBB'), 'no banco não há chave em claro');
    assert.equal(bruto.final4, 'QRST'); assert.equal(cr.Chaves.ler(escIA.id), chave);
    assert.equal(cr.portaoDoTenant('esc-' + escIA.slug).modo, 'chave');
    const st = await req('GET', `/staff/api/legal-saas/tenants/${escIA.id}/ia-creditos`);
    assert.ok(!JSON.stringify(st.json).includes('sk-ant'), 'o staff também não vê a chave');
    cr.Chaves.remover(escIA.id);
    assert.equal(cr.portaoDoTenant('esc-' + escIA.slug).modo, 'credito');
  });
  await t('IA: rotas — assinante vê saldo; só admin recarrega; staff configura e ajusta com motivo', async () => {
    // dra@beta.br (assinante logada no jar) é admin do próprio escritório
    const v = await req('GET', '/juridico/api/ia/creditos', { cookies: true });
    assert.equal(v.st, 200); assert.equal(v.json.disponivel_centavos, 0); assert.equal(v.json.admin, true);
    assert.equal(v.json.precos.cambio_ok, true); assert.ok(v.json.precos.saida_centavos_por_milhao > v.json.precos.entrada_centavos_por_milhao);
    assert.ok(!JSON.stringify(v.json).includes('sk-ant'));
    assert.equal((await req('GET', '/juridico/api/ia/creditos')).st, 401);
    assert.equal((await req('POST', '/juridico/api/ia/recarga', { cookies: true, corpo: { valor_centavos: 100 } })).st, 400, 'abaixo da mínima');
    const rc = await req('POST', '/juridico/api/ia/recarga', { cookies: true, corpo: { valor_centavos: 3000 } });
    assert.equal(rc.st, 200); assert.ok(rc.json.link);
    assert.equal((await req('PUT', '/juridico/api/ia/chave', { cookies: true, corpo: { chave: 'abc' } })).st, 400);
    // staff
    assert.equal((await req('GET', '/staff/api/legal-saas/ia-creditos', { user: 'op' })).st, 403);
    const pl = await req('GET', '/staff/api/legal-saas/ia-creditos');
    assert.equal(pl.json.config.margem_pct, 30); assert.ok(pl.json.escritorios.some(e => e.id === escIA.id && e.recarregado_centavos === 6000));
    assert.equal((await req('PATCH', '/staff/api/legal-saas/ia-creditos/config', { corpo: { margem_pct: 40 } })).json.config.margem_pct, 40);
    assert.equal(cr.centavosDe(1000000), 700, 'a margem nova vale na hora');
    await req('PATCH', '/staff/api/legal-saas/ia-creditos/config', { corpo: { margem_pct: 30 } });
    assert.equal((await req('POST', `/staff/api/legal-saas/tenants/${escIA.id}/ia-creditos/ajuste`, { corpo: { valor_centavos: 500, motivo: '' } })).st, 400, 'ajuste sem motivo é recusado');
    const aj = await req('POST', `/staff/api/legal-saas/tenants/${escIA.id}/ia-creditos/ajuste`, { corpo: { valor_centavos: 500, motivo: 'Pix recebido por fora, comprovante 123' } });
    assert.equal(aj.st, 200);
    assert.equal((await req('POST', `/staff/api/legal-saas/tenants/${escIA.id}/ia-creditos/ajuste`, { user: 'op', corpo: { valor_centavos: 500, motivo: 'tentativa do operador' } })).st, 403);
    assert.equal((await req('POST', '/staff/api/legal-saas/tenants/nao-existe/ia-creditos/ajuste', { corpo: { valor_centavos: 500, motivo: 'escritório inexistente' } })).st, 404);
    assert.equal(cr.Carteira.extrato(escIA.id)[0].detalhe.motivo, 'Pix recebido por fora, comprovante 123');
  });
  await t('IA: a landing não promete mais consultas de IA por mês', async () => {
    const pg = await req('GET', '/juridico');
    assert.ok(!/consultas de IA\/mês/.test(pg.texto));
    assert.ok(/IA por crédito pré-pago ou com a sua chave de API/.test(pg.texto));
  });

  await t('login assinante errado 5x → 429', async () => {
    for (let i = 0; i < 5; i++) await req('POST', '/juridico/api/login', { corpo: { email: 'dra@beta.br', senha: 'errada' } });
    assert.equal((await req('POST', '/juridico/api/login', { corpo: { email: 'dra@beta.br', senha: 'SenhaForte1' } })).st, 429);
  });
  await t('lead da landing é registrado', async () => {
    await req('POST', '/juridico/api/lead', { corpo: { nome: 'Lead X', escritorio: 'Escr X', email: 'x@x.br' } });
    assert.ok((await req('GET', '/staff/api/legal-saas/leads')).json.leads.some(l => l.email === 'x@x.br'));
  });
  await t('cortesia: cria sem cobrança, revogada segue na lista e reativa', async () => {
    assert.equal((await req('POST', '/staff/api/legal-saas/cortesia', { user: 'op', corpo: { email: 'c@cortesia.br' } })).st, 403);
    const r = await req('POST', '/staff/api/legal-saas/cortesia', { corpo: { nome: 'Cortesia Adv', email: 'c@cortesia.br' } });
    assert.equal(r.st, 200);
    const cid = r.json.tenant.id;
    assert.equal(r.json.tenant.status, 'cortesia');
    assert.equal(r.json.tenant.trial_expira_em, '');
    assert.equal(r.json.tenant.entitlements.acesso_liberado, true);
    assert.ok(/\/juridico\/definir-senha\?token=/.test(r.json.acesso.definir_senha_url));
    // e-mail repetido: 400 com mensagem (era "Erro 500" mudo — o erro síncrono escapava do wrapper)
    const dup = await req('POST', '/staff/api/legal-saas/cortesia', { corpo: { nome: 'Outro', email: 'C@cortesia.br' } });
    assert.equal(dup.st, 400); assert.ok(/já tem conta/.test(dup.json.erro));
    const lista = async () => (await req('GET', '/staff/api/legal-saas/cortesia')).json.acessos;
    assert.ok((await lista()).some(a => a.id === cid));
    assert.ok(!(await lista()).some(a => a.id === tid), 'escritório pagante não é cortesia');
    // o ciclo de vida (trial/dunning) não toca em cortesia
    await req('POST', '/staff/api/legal-saas/ciclo-diario');
    assert.equal(saas.repo.Tenants.obter(cid).status, 'cortesia');
    // revogar bloqueia o acesso, mas o acesso CONTINUA na lista (senão não há como reativar)
    const rev = await req('POST', `/staff/api/legal-saas/cortesia/${cid}/revogar`);
    assert.equal(rev.json.tenant.entitlements.acesso_liberado, false);
    assert.equal((await lista()).find(a => a.id === cid).status, 'suspensa');
    const rea = await req('POST', `/staff/api/legal-saas/cortesia/${cid}/reativar`);
    assert.equal(rea.json.tenant.status, 'cortesia');
    assert.equal(rea.json.tenant.entitlements.acesso_liberado, true);
    // conta existente vira cortesia pelo status (botão "Dar cortesia") e entra na lista
    await req('POST', `/staff/api/legal-saas/tenants/${tid}/status`, { corpo: { status: 'cortesia' } });
    assert.ok((await lista()).some(a => a.id === tid));
    await req('POST', `/staff/api/legal-saas/tenants/${tid}/status`, { corpo: { status: 'ativa' } });
  });
  await t('equipe do escritório: admin convida, limite do plano vale, último admin não sai', async () => {
    const repo = saas.repo;
    const esc = repo.Tenants.criar({ nome: 'Equipe Adv', email: 'dona@equipe.br', plano: 'essencial' }, 'teste'); // essencial: 2 usuários
    const dona = esc.usuarios[0];
    const id2 = repo.Tenants.addUsuario(esc.id, { nome: 'Colega', email: 'Colega@Equipe.br', papel: 'usuario' });
    assert.equal(repo.Tenants.usuarios(esc.id).find(u => u.id === id2).papel, 'usuario');
    assert.deepEqual(repo.Tenants.usuariosPorSlug(esc.slug).map(u => u.email).sort(), ['colega@equipe.br', 'dona@equipe.br']);
    assert.throws(() => repo.Tenants.addUsuario(esc.id, { email: 'terceiro@equipe.br' }), /Seu plano permite 2/);
    assert.throws(() => repo.Tenants.addUsuario(esc.id, { email: 'colega@equipe.br' }), /já tem conta/);
    assert.throws(() => repo.Tenants.mudarUsuario(esc.id, dona.id, { ativo: false }), /ao menos um administrador/);
    assert.throws(() => repo.Tenants.mudarUsuario(tid, id2, { ativo: false }), /não encontrado/, 'usuário de outro escritório não é alcançado');
    repo.Tenants.mudarUsuario(esc.id, id2, { ativo: false });
    assert.equal(repo.Tenants.usuariosPorSlug(esc.slug).length, 1, 'desativado some da Equipe do jurídico');
    assert.equal(repo.Tenants.usuarioAssinante(id2), null, 'desativado perde a sessão');
    repo.Tenants.addUsuario(esc.id, { email: 'terceiro@equipe.br' }); // a vaga liberou
    assert.throws(() => repo.Tenants.mudarUsuario(esc.id, id2, { ativo: true }), /Sem vaga/);
  });
  await t('auditoria administrativa registrada', async () => {
    assert.ok((await req('GET', '/staff/api/legal-saas/auditoria')).json.eventos.some(e => e.acao === 'tenant.criar'));
  });

  srv.close();
  console.log(`\n${ok} teste(s) OK, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach(f => console.log('  ✗', f)); process.exit(1); }
}
rodar().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
