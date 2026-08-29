// =====================================================================
// Villela Stay — SUÍTE DE TESTES DO NÚCLEO (server.js). npm run test:nucleo
// Black-box: sobe o server.js real in-process com DATA_DIR temporário e
// mock só das chamadas de SAÍDA (Stays/Mercado Pago via global.fetch); o
// cliente de teste usa node:http (não afetado pelo mock). Cobre: auth/RBAC,
// PUBLISH_KEY/ADMIN_KEY, webhook Stays (segredo), webhook MP (dinheiro +
// idempotência), motor de fidelidade (dinheiro + idempotência) e a escrita
// atômica de JSON (round-trip). Sem framework: assert + contadores.
// =====================================================================
'use strict';
const os = require('os');
const fs = require('fs');
const net = require('net');
const http = require('http');
const path = require('path');
const assert = require('assert');
const bcrypt = require('bcryptjs');

const PORT = 4090;
const BASE = 'http://127.0.0.1:' + PORT;
const DATA_DIR = path.join(os.tmpdir(), 'nucleo-selftest-' + process.pid + '-' + Date.now());
fs.mkdirSync(DATA_DIR, { recursive: true });

// --- env de teste ANTES de requerer o server ---
Object.assign(process.env, {
  DATA_DIR,
  NODE_ENV: 'development',           // COOKIE_SECURE=false (cookie sobre http)
  STAYS_CLIENT_ID: 'x', STAYS_SECRET: 'x', STAYS_BASE: 'https://stays.mock/v1',
  JWT_SECRET: 'test-secret-nucleo',
  PUBLISH_KEY: 'pk-test', ADMIN_KEY: 'ak-test', STAYS_WEBHOOK_SECRET: 'sw-test',
  MP_ACCESS_TOKEN: 'mp-test',
  MANUTENCAO_OFF: '1',               // sem o timer diário de snapshots/purga no teste
  PORT: String(PORT),
});

// --- seeds no DATA_DIR ---
const SENHA_ADM = 'SenhaAdmin1', SENHA_OP = 'SenhaOperador1';
const seed = (arq, obj) => fs.writeFileSync(path.join(DATA_DIR, arq), JSON.stringify(obj, null, 2));
seed('usuarios.json', [
  { id: 'adm', nome: 'Admin', email: 'adm@t.com', senhaHash: bcrypt.hashSync(SENHA_ADM, 10), papel: 'admin', areas: ['*'], ativo: true },
  { id: 'op', nome: 'Operador', email: 'op@t.com', senhaHash: bcrypt.hashSync(SENHA_OP, 10), papel: 'membro', areas: ['ti'], ativo: true },
  { id: 'ina', nome: 'Inativo', email: 'ina@t.com', senhaHash: bcrypt.hashSync('SenhaInativa1', 10), papel: 'membro', areas: ['ti'], ativo: false },
  { id: 'pw', nome: 'PwTest', email: 'pw@t.com', senhaHash: bcrypt.hashSync('SenhaPw123456', 10), papel: 'membro', areas: ['ti'], ativo: true },
]);
seed('hospedes.json', [
  { id: 'H1', nome: 'Hospede Um', email: 'h1@t.com', telefone: '', senhaHash: bcrypt.hashSync('SenhaHospede1', 10), staysClientId: 'C1', ativo: true },
]);

// --- mock de global.fetch: SÓ chamadas de saída (Stays / Mercado Pago) ---
const mpPayments = {}; // payId -> { status, external_reference, transaction_amount }
const fix = { checkin: '2026-06-01', checkout: '2026-06-15', dispAvail: 1 };
const resp = (data, ok = true, status = 200) => ({ ok, status, json: async () => data, text: async () => JSON.stringify(data) });
global.fetch = async (url, opts) => {
  const u = String(url);
  const metodo = (opts && opts.method) || 'GET';
  if (u.startsWith('https://api.mercadopago.com')) {
    if (u.includes('/checkout/preferences')) return resp({ id: 'PREF1', init_point: 'https://mp/checkout/PREF1' });
    const m = u.match(/\/v1\/payments\/([^/?]+)/);
    if (m) return resp(mpPayments[m[1]] || { status: 'rejected' });
    return resp({});
  }
  if (u.startsWith(process.env.STAYS_BASE)) {
    const rel = u.slice(process.env.STAYS_BASE.length);
    let m;
    if (metodo === 'POST' && rel.startsWith('/booking/reservations')) return resp({ id: 'RNEW', _id: 'rnew', checkInDate: '2026-08-01', checkOutDate: '2026-08-03', price: { _f_total: 0, currency: 'BRL' }, guests: 2 });
    if (metodo === 'POST' && rel.startsWith('/booking/clients')) return resp({ _id: 'CNEW' });
    if (rel.startsWith('/content/listings')) return resp([{ _id: 'L1', id: 'GD01H', status: 'active', subtype: 'entire_home', internalName: 'Casa Teste', _mstitle: { pt_BR: 'Casa Teste' } }]);
    if ((m = rel.match(/^\/calendar\/listing\/([^/?]+)/))) return resp([{ date: '2026-08-01', avail: fix.dispAvail, prices: [{ _mcval: { BRL: 500 } }] }, { date: '2026-08-02', avail: fix.dispAvail, prices: [{ _mcval: { BRL: 500 } }] }]);
    if ((m = rel.match(/^\/booking\/reservations\/([^/?]+)/))) return resp({ id: m[1], _idclient: m[1] === 'RNOVA' ? 'C9' : 'C1', price: { _f_total: 1000 }, checkInDate: fix.checkin, checkOutDate: fix.checkout }); // reserva individual
    if (rel.startsWith('/booking/reservations')) return resp([{ id: 'R1', type: 'booked', _idclient: 'C1', partner: { name: '' }, price: { _f_total: 1 }, checkInDate: fix.checkin, checkOutDate: fix.checkout }]); // lista
    if ((m = rel.match(/^\/booking\/clients\/([^/?]+)/))) return resp(m[1] === 'C9' ? { _id: 'C9', fName: 'Ana', lName: 'Souza Lima', reservations: [] } : { _id: m[1], fName: 'Maria', lName: 'Villela Santos', reservations: [] }); // cliente individual
    if (rel.startsWith('/booking/clients')) return resp([{ _id: 'C1', name: 'Cliente Um', clientSource: 'direct', creationDate: '2026-01-01' }]); // lista de clientes
    return resp({});
  }
  return resp({}); // qualquer outra saída → vazio benigno
};

require('./server.js'); // sobe e escuta em PORT

// --- cliente HTTP de teste (node:http) ---
function req(method, pth, { json, cookie, headers } = {}) {
  return new Promise((resolve, reject) => {
    const body = json !== undefined ? JSON.stringify(json) : null;
    const h = Object.assign({ Accept: 'application/json' }, headers || {});
    if (body) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(body); }
    if (cookie) h['Cookie'] = cookie;
    const r = http.request(BASE + pth, { method, headers: h }, (res) => {
      let data = ''; res.on('data', c => (data += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(data); } catch {} resolve({ status: res.statusCode, json: j, text: data, setCookie: res.headers['set-cookie'] || [] }); });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}
const pegaCookie = (setCookie, nome) => { for (const c of setCookie || []) { const m = c.match(new RegExp(nome + '=([^;]+)')); if (m) return nome + '=' + m[1]; } return ''; };
const lerData = (arq) => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, arq), 'utf8')); } catch { return null; } };
const espera = (ms) => new Promise(r => setTimeout(r, ms));
function esperarPorta() {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tenta = () => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.end(); resolve(); }); s.on('error', () => { s.destroy(); if (++n > 100) return reject(new Error('server não subiu')); setTimeout(tenta, 50); }); };
    tenta();
  });
}

// --- runner ---
let ok = 0; const falhas = [];
async function t(nome, fn) { try { await fn(); ok++; console.log('  ✅', nome); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌', nome, '—', e.message); } }
// cada teste de login usa um X-Forwarded-For próprio (trust proxy=1 → req.ip) p/ não colidir no lockout
const comIp = (ip, extra) => Object.assign({ 'X-Forwarded-For': ip }, extra || {});

(async () => {
  await esperarPorta();
  console.log('Villela Stay — selftest do núcleo (server.js)\nDATA_DIR:', DATA_DIR, '\n');

  // ---------- Auth / sessão ----------
  await t('/health diz qual commit esta no ar (push nao e o mesmo que estar no ar)', async () => {
    const r = await req('GET', '/health');
    assert.equal(r.status, 200);
    assert.ok(r.json.ok, "o health tem de continuar dizendo ok");
    assert.equal(typeof r.json.commit, 'string', 'sem o commit nao da para conferir o que ficou live');
    assert.ok(r.json.commit.length > 0 && r.json.commit.length <= 7, 'commit em forma curta');
    assert.equal(typeof r.json.branch, 'string', 'a branch denuncia deploy vindo de ref errada');
  });

  await t('login: senha errada → 401', async () => {
    const r = await req('POST', '/staff/api/login', { json: { email: 'adm@t.com', senha: 'errada' }, headers: comIp('10.1.1.1') });
    assert.equal(r.status, 401);
  });
  let adminCookie = '';
  await t('login: correto → 200 + cookie staff_token', async () => {
    const r = await req('POST', '/staff/api/login', { json: { email: 'adm@t.com', senha: SENHA_ADM }, headers: comIp('10.1.1.2') });
    assert.equal(r.status, 200); assert.ok(r.json && r.json.ok);
    adminCookie = pegaCookie(r.setCookie, 'staff_token');
    assert.ok(adminCookie, 'cookie staff_token setado');
  });
  let opCookie = '';
  await t('login: usuário membro (não-admin) ok', async () => {
    const r = await req('POST', '/staff/api/login', { json: { email: 'op@t.com', senha: SENHA_OP }, headers: comIp('10.1.1.5') });
    assert.equal(r.status, 200); opCookie = pegaCookie(r.setCookie, 'staff_token'); assert.ok(opCookie);
  });
  await t('login: usuário inativo → 401', async () => {
    const r = await req('POST', '/staff/api/login', { json: { email: 'ina@t.com', senha: 'SenhaInativa1' }, headers: comIp('10.1.1.3') });
    assert.equal(r.status, 401);
  });
  await t('login: lockout após 5 erros → 429', async () => {
    for (let i = 0; i < 5; i++) { const r = await req('POST', '/staff/api/login', { json: { email: 'adm@t.com', senha: 'x' }, headers: comIp('10.9.9.9') }); assert.equal(r.status, 401); }
    const r6 = await req('POST', '/staff/api/login', { json: { email: 'adm@t.com', senha: SENHA_ADM }, headers: comIp('10.9.9.9') });
    assert.equal(r6.status, 429, 'bloqueado mesmo com senha certa após 5 erros');
  });
  await t('/staff/api/me sem cookie → 401', async () => { assert.equal((await req('GET', '/staff/api/me')).status, 401); });
  await t('/staff/api/me com cookie → 200 + usuário', async () => {
    const r = await req('GET', '/staff/api/me', { cookie: adminCookie });
    assert.equal(r.status, 200); assert.equal(r.json.usuario.email, 'adm@t.com');
  });

  // ---------- RBAC ----------
  await t('RBAC: /staff/api/usuarios admin=200, membro=403, anônimo=401', async () => {
    assert.equal((await req('GET', '/staff/api/usuarios', { cookie: adminCookie })).status, 200);
    assert.equal((await req('GET', '/staff/api/usuarios', { cookie: opCookie })).status, 403);
    assert.equal((await req('GET', '/staff/api/usuarios')).status, 401);
  });
  await t('PUBLISH_KEY: relatórios com chave=200, sem chave e sem sessão=401', async () => {
    assert.equal((await req('GET', '/staff/api/relatorios', { headers: { 'x-publish-key': 'pk-test' } })).status, 200);
    assert.equal((await req('GET', '/staff/api/relatorios', { headers: { 'x-publish-key': 'errada' } })).status, 401);
    assert.equal((await req('GET', '/staff/api/relatorios')).status, 401);
  });
  await t('ADMIN_KEY: /api/eventos com chave certa=200, errada=401', async () => {
    assert.equal((await req('GET', '/api/eventos', { headers: { 'x-admin-key': 'ak-test' } })).status, 200);
    assert.equal((await req('GET', '/api/eventos', { headers: { 'x-admin-key': 'errada' } })).status, 401);
  });

  // ---------- staff-core: troca de senha, CRUD de usuários, link/login-mágico ----------
  await t('staff-core: trocar senha (atual errada→400, curta→400, ok→200; nova loga, antiga não)', async () => {
    const login = await req('POST', '/staff/api/login', { json: { email: 'pw@t.com', senha: 'SenhaPw123456' }, headers: comIp('10.7.7.1') });
    const pc = pegaCookie(login.setCookie, 'staff_token'); assert.ok(pc);
    assert.equal((await req('POST', '/staff/api/conta/senha', { json: { atual: 'errada', nova: 'NovaSenha123' }, cookie: pc })).status, 400);
    assert.equal((await req('POST', '/staff/api/conta/senha', { json: { atual: 'SenhaPw123456', nova: 'curta' }, cookie: pc })).status, 400);
    assert.equal((await req('POST', '/staff/api/conta/senha', { json: { atual: 'SenhaPw123456', nova: 'NovaSenha123' }, cookie: pc })).status, 200);
    assert.equal((await req('POST', '/staff/api/login', { json: { email: 'pw@t.com', senha: 'NovaSenha123' }, headers: comIp('10.7.7.2') })).status, 200);
    assert.equal((await req('POST', '/staff/api/login', { json: { email: 'pw@t.com', senha: 'SenhaPw123456' }, headers: comIp('10.7.7.3') })).status, 401);
  });
  await t('staff-core: CRUD de usuários (criar/duplicado-409/patch/excluir; protege self)', async () => {
    const cria = await req('POST', '/staff/api/usuarios', { json: { nome: 'Novo', email: 'novo@t.com', senha: 'SenhaNova123', papel: 'staff', areas: ['ti'] }, cookie: adminCookie });
    assert.equal(cria.status, 200); const nid = cria.json.usuario.id;
    assert.equal((await req('POST', '/staff/api/usuarios', { json: { nome: 'Dup', email: 'novo@t.com', senha: 'SenhaNova123' }, cookie: adminCookie })).status, 409);
    assert.equal((await req('PATCH', '/staff/api/usuarios/' + nid, { json: { nome: 'Renomeado' }, cookie: adminCookie })).status, 200);
    assert.equal((await req('DELETE', '/staff/api/usuarios/adm', { cookie: adminCookie })).status, 400, 'não remove a si mesmo');
    assert.equal((await req('DELETE', '/staff/api/usuarios/' + nid, { cookie: adminCookie })).status, 200);
  });
  await t('staff-core: link-acesso (admin) + login-mágico trocam por sessão; inválido→401', async () => {
    const lk = await req('POST', '/staff/api/usuarios/op/link-acesso', { cookie: adminCookie });
    assert.equal(lk.status, 200); assert.ok(lk.json.token);
    const mg = await req('POST', '/staff/api/login-magico', { json: { token: lk.json.token } });
    assert.equal(mg.status, 200); assert.ok(pegaCookie(mg.setCookie, 'staff_token'));
    assert.equal((await req('POST', '/staff/api/login-magico', { json: { token: 'lixo' } })).status, 401);
    assert.equal((await req('POST', '/staff/api/usuarios/op/link-acesso', { cookie: opCookie })).status, 403, 'membro não gera link');
  });

  // ---------- Analytics (/api/hit, /api/leads) ----------
  await t('analytics /api/hit: responde 204 e estoura rate-limit (120/min)', async () => {
    assert.equal((await req('GET', '/api/hit?p=/home', { headers: comIp('10.3.3.1') })).status, 204);
    let bateu429 = false;
    for (let i = 0; i < 130; i++) { if ((await req('GET', '/api/hit?p=/x', { headers: comIp('10.3.3.9') })).status === 429) { bateu429 = true; break; } }
    assert.ok(bateu429, 'estoura o rate-limit de 120/min por IP');
  });
  await t('analytics /api/leads: cria lead; sem nome/contato → 400', async () => {
    assert.equal((await req('POST', '/api/leads', { json: { nome: 'Fulano Lead', contato: '61999990000', origem: 'site' } })).status, 200);
    assert.equal((await req('POST', '/api/leads', { json: { mensagem: 'sem nome nem contato' } })).status, 400);
    assert.ok(fs.readFileSync(path.join(DATA_DIR, 'leads.jsonl'), 'utf8').includes('Fulano Lead'), 'lead gravado em leads.jsonl');
  });

  // ---------- Visitas (analytics de todos os sites do grupo) ----------
  await t('visitas: classificação de produto, canal, robô e prefixo de IP', async () => {
    const v = require('./nucleo/visitas');
    assert.equal(v.produtoDe('/kids/app', ''), 'kids');
    assert.equal(v.produtoDe('/livros/ver/1', ''), 'livraria');
    assert.equal(v.produtoDe('/', 'closet.villelastay.com.br'), 'closet', 'cai para o host quando o caminho é a raiz');
    assert.equal(v.produtoDe('/nada', ''), 'outro');
    assert.equal(v.canalDe('https://www.google.com/search?q=x', null), 'Busca Google');
    assert.equal(v.canalDe('https://chatgpt.com/', null), 'Busca com IA', 'buscador de IA é canal próprio');
    assert.equal(v.canalDe('', { s: 'instagram' }), 'Instagram', 'utm_source sem domínio também classifica');
    assert.equal(v.canalDe('', null), 'Direto');
    assert.equal(v.uaInfo('Mozilla/5.0 (compatible; GPTBot/1.0)').bot, 1);
    assert.equal(v.uaInfo('Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile Safari/537.36').dispositivo, 'celular');
    // LGPD: o IP nunca é gravado — só o prefixo de rede, e só para consultar a localidade.
    assert.equal(v.prefixoIp('189.6.1.44'), '189.6.1.0/24');
    assert.equal(v.prefixoIp('::ffff:189.6.1.44'), '189.6.1.0/24', 'IPv4 embrulhado em IPv6');
    assert.equal(v.prefixoIp('2804:14c:65:9a::1'), '2804:14c:65::/48');
  });

  await t('visitas: /api/hit grava linha rica e NUNCA o IP do visitante', async () => {
    await req('GET', '/api/hit?p=/eventos.html&r=' + encodeURIComponent('https://l.instagram.com/') + '&q=' + encodeURIComponent('?utm_source=instagram&utm_campaign=verao') + '&l=pt-BR',
      { headers: Object.assign({ 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605.1' }, comIp('189.6.1.44')) });
    const linhas = fs.readFileSync(path.join(DATA_DIR, 'hits.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const h = linhas.find(x => x.pagina === '/eventos.html');
    assert.ok(h, 'visita gravada');
    assert.equal(h.produto, 'site');
    assert.equal(h.canal, 'Instagram');
    assert.equal(h.utm.c, 'verao');
    assert.equal(h.disp, 'celular');
    assert.equal(h.idioma, 'pt');
    const cru = JSON.stringify(h);
    assert.ok(!cru.includes('189.6.1.44'), 'o IP não pode aparecer na linha gravada');
    assert.ok(h.vid && h.vid.length === 12, 'visitante anônimo por hash com sal do dia');
  });

  await t('visitas: relatório exige área (marketing/ti/ceo) e agrega o período', async () => {
    assert.equal((await req('GET', '/staff/api/visitas?dias=30')).status, 401, 'anônimo não vê');
    const r = await req('GET', '/staff/api/visitas?dias=30', { cookie: adminCookie });
    assert.equal(r.status, 200);
    assert.ok(r.json.resumo && typeof r.json.resumo.visitas === 'number');
    assert.ok(Array.isArray(r.json.serie) && r.json.serie.length === 30, 'série com um ponto por dia');
    assert.ok(Array.isArray(r.json.sites));
    assert.ok(Array.isArray(r.json.canais));
  });

  await t('visitas: CSV com BOM, funil por canal e resumo por PUBLISH_KEY', async () => {
    const csv = await req('GET', '/staff/api/visitas.csv?dias=7', { cookie: adminCookie });
    assert.equal(csv.status, 200);
    assert.ok(csv.text.startsWith('﻿'), 'BOM para o Excel abrir com acento certo');
    assert.ok(csv.text.includes('pais;uf;cidade'), 'colunas de localidade');
    const fun = await req('GET', '/staff/api/visitas-funil?dias=30', { cookie: adminCookie });
    assert.equal(fun.status, 200); assert.ok(Array.isArray(fun.json.linhas));
    const md = await req('GET', '/staff/api/visitas-resumo?dias=7', { headers: { 'x-publish-key': 'pk-test' } });
    assert.equal(md.status, 200, 'PUBLISH_KEY libera o resumo p/ a rotina semanal');
    assert.ok(md.text.includes('Visitas dos sites'), 'resumo em markdown');
    assert.equal((await req('GET', '/staff/api/visitas-resumo?dias=7')).status, 401);
  });

  await t('visitas: lead grava o canal de origem (para o funil chegar à reserva)', async () => {
    const r = await req('POST', '/api/leads', { json: { nome: 'Lead Com Canal', contato: '61988887777', origem: 'site', ref: 'https://www.google.com/' } });
    assert.equal(r.status, 200);
    const leads = fs.readFileSync(path.join(DATA_DIR, 'leads.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    const l = leads.find(x => x.nome === 'Lead Com Canal');
    assert.equal(l.canal, 'Busca Google');
  });

  // ---------- Backup do DATA_DIR ----------
  await t('backup: lista admin=200/anônimo=401; arquivo bloqueia path traversal, serve válido', async () => {
    const l = await req('GET', '/staff/api/backup/lista', { cookie: adminCookie });
    assert.equal(l.status, 200); assert.ok(Array.isArray(l.json.arquivos), 'retorna lista de arquivos');
    assert.equal((await req('GET', '/staff/api/backup/lista')).status, 401);
    const trav = await req('GET', '/staff/api/backup/arquivo?caminho=' + encodeURIComponent('../server.js'), { cookie: adminCookie });
    assert.equal(trav.status, 400, 'path traversal → 400');
    const ok2 = await req('GET', '/staff/api/backup/arquivo?caminho=usuarios.json', { cookie: adminCookie });
    assert.equal(ok2.status, 200, 'arquivo válido do DATA_DIR servido');
  });

  // ---------- Stays proxy (/staff/api/stays/*) ----------
  await t('stays-proxy: as 6 rotas exigem sessão (401 sem cookie)', async () => {
    for (const p of ['/staff/api/stays/imoveis', '/staff/api/stays/clientes', '/staff/api/stays/cliente/C1',
      '/staff/api/stays/reservas?from=2026-08-01&to=2026-08-10', '/staff/api/stays/disponibilidade?listingId=L1&from=2026-08-01&to=2026-08-03'])
      assert.equal((await req('GET', p)).status, 401, p + ' sem cookie');
    assert.equal((await req('POST', '/staff/api/stays/reserva', { json: {} })).status, 401);
  });
  await t('stays-proxy: imoveis/clientes/cliente/reservas/disponibilidade respondem 200', async () => {
    fix.dispAvail = 1;
    const im = await req('GET', '/staff/api/stays/imoveis', { cookie: adminCookie });
    assert.equal(im.status, 200); assert.ok(im.json.imoveis.some(x => x.codigo === 'GD01H'));
    const cl = await req('GET', '/staff/api/stays/clientes', { cookie: adminCookie });
    assert.equal(cl.status, 200); assert.ok(cl.json.clientes.some(x => x.nome === 'Cliente Um'));
    assert.equal((await req('GET', '/staff/api/stays/cliente/C1', { cookie: adminCookie })).status, 200);
    assert.equal((await req('GET', '/staff/api/stays/reservas?from=2026-08-01&to=2026-08-10', { cookie: adminCookie })).status, 200);
    const dp = await req('GET', '/staff/api/stays/disponibilidade?listingId=L1&from=2026-08-01&to=2026-08-03', { cookie: adminCookie });
    assert.equal(dp.status, 200); assert.equal(dp.json.todasLivres, true);
  });
  await t('stays-proxy: criar bloqueio confere disponibilidade e exige admin', async () => {
    const corpo = { tipo: 'bloqueio', listingId: 'L1', checkInDate: '2026-08-01', checkOutDate: '2026-08-03' };
    assert.equal((await req('POST', '/staff/api/stays/reserva', { json: corpo, cookie: opCookie })).status, 403, 'não-admin → 403');
    fix.dispAvail = 0;
    assert.equal((await req('POST', '/staff/api/stays/reserva', { json: corpo, cookie: adminCookie })).status, 409, 'datas ocupadas → 409');
    fix.dispAvail = 1;
    const ok2 = await req('POST', '/staff/api/stays/reserva', { json: corpo, cookie: adminCookie });
    assert.equal(ok2.status, 200); assert.equal(ok2.json.tipo, 'bloqueio');
  });

  // ---------- CRM legado (/staff/api/crm/*) ----------
  await t('crm-legado: criar (dedupe), listar, detalhe, patch estágio, funil', async () => {
    const cria = await req('POST', '/staff/api/crm/contatos', { json: { nome: 'Lead CRM', telefone: '61988887777', origem: 'site' }, cookie: adminCookie });
    assert.equal(cria.status, 200); assert.ok(cria.json.contato && cria.json.contato.id); const cid = cria.json.contato.id;
    const dup = await req('POST', '/staff/api/crm/contatos', { json: { nome: 'Lead CRM', telefone: '61988887777' }, cookie: adminCookie });
    assert.equal(dup.json.novo, false, 'dedupe por telefone');
    assert.ok((await req('GET', '/staff/api/crm/contatos?busca=Lead', { cookie: adminCookie })).json.contatos.some(c => c.id === cid));
    assert.equal((await req('GET', '/staff/api/crm/contatos/' + cid, { cookie: adminCookie })).status, 200);
    assert.equal((await req('GET', '/staff/api/crm/contatos/' + cid + '/stays', { cookie: adminCookie })).status, 200); // sem staysClientId → vinculado:false
    const pt = await req('PATCH', '/staff/api/crm/contatos/' + cid, { json: { estagio: 'negociacao', valorEstimado: 5000 }, cookie: adminCookie });
    assert.equal(pt.status, 200); assert.equal(pt.json.contato.estagio, 'negociacao');
    assert.equal((await req('PATCH', '/staff/api/crm/contatos/' + cid, { json: { estagio: 'xyz' }, cookie: adminCookie })).status, 400);
    assert.ok((await req('GET', '/staff/api/crm/funil', { cookie: adminCookie })).json.porEstagio.negociacao.n >= 1);
  });
  await t('crm-legado: métricas/followups/sla/receita 200; excluir exige admin (403 membro)', async () => {
    for (const p of ['/staff/api/crm/metricas', '/staff/api/crm/followups', '/staff/api/crm/sla', '/staff/api/crm/receita-prevista'])
      assert.equal((await req('GET', p, { cookie: adminCookie })).status, 200, p);
    const c = await req('POST', '/staff/api/crm/contatos', { json: { nome: 'Para Excluir', telefone: '61911112222' }, cookie: adminCookie });
    const cid = c.json.contato.id;
    assert.equal((await req('DELETE', '/staff/api/crm/contatos/' + cid, { cookie: opCookie })).status, 403, 'membro não exclui');
    assert.equal((await req('DELETE', '/staff/api/crm/contatos/' + cid, { cookie: adminCookie })).status, 200);
    assert.equal((await req('GET', '/staff/api/crm/contatos/' + cid, { cookie: adminCookie })).status, 404);
  });

  await t('crm-legado: inbox substitui o Data Store — mensagem entra, é atendida, e volta se o lead reescreve', async () => {
    const tel = '61955554444';
    const c1 = await req('POST', '/staff/api/crm/contatos', { json: { nome: 'Lead Inbox', telefone: tel, origem: 'whatsapp-business', mensagem: 'Tem vaga em setembro?' }, cookie: adminCookie });
    assert.equal(c1.json.novo, true); const cid = c1.json.contato.id;
    const naFila = () => req('GET', '/staff/api/crm/inbox?horas=24', { cookie: adminCookie })
      .then(r => r.json.mensagens.filter(m => m.contatoId === cid));
    let f = await naFila();
    assert.equal(f.length, 1, 'mensagem de contato novo entra na caixa');
    assert.equal(f[0].texto, 'Tem vaga em setembro?'); assert.equal(f[0].atendida, false);

    assert.equal((await req('POST', `/staff/api/crm/inbox/${cid}/atendida`, { json: { resposta: 'Temos sim!' }, cookie: adminCookie })).status, 200);
    assert.equal((await naFila()).length, 0, 'atendida sai da fila');
    const todas = await req('GET', '/staff/api/crm/inbox?horas=24&todas=1', { cookie: adminCookie });
    assert.ok(todas.json.mensagens.some(m => m.contatoId === cid && m.atendida === true), 'histórico continua visível com todas=1');

    // O ponto que o Data Store cobria e o CRM não: contato JÁ conhecido que escreve de novo.
    await req('POST', '/staff/api/crm/contatos', { json: { nome: 'Lead Inbox', telefone: tel, origem: 'whatsapp-business', mensagem: 'Fechou, pode reservar' }, cookie: adminCookie });
    f = await naFila();
    assert.equal(f.length, 1, 'lead que volta a escrever REAPARECE na fila');
    assert.equal(f[0].texto, 'Fechou, pode reservar');
  });

  // ---------- Bloco de Notas (anotações livres — restrito à área CEO) ----------
  await t('notas: RBAC — anônimo 401, membro sem CEO 403, admin 200, PUBLISH_KEY 200', async () => {
    assert.equal((await req('GET', '/staff/api/notas')).status, 401);
    assert.equal((await req('GET', '/staff/api/notas', { cookie: opCookie })).status, 403, 'membro area ti → 403');
    assert.equal((await req('GET', '/staff/api/notas', { cookie: adminCookie })).status, 200);
    assert.equal((await req('GET', '/staff/api/notas', { headers: { 'x-publish-key': 'pk-test' } })).status, 200);
  });
  let notaId = '';
  await t('notas: criar, editar, fixar (vem primeiro) e buscar; nota vazia → 400', async () => {
    const c = await req('POST', '/staff/api/notas', { json: { titulo: 'Ideias', texto: 'Comprar toalhas\nFalar com o pintor', cor: '#bff0c3' }, cookie: adminCookie });
    assert.equal(c.status, 200); notaId = c.json.nota.id; assert.equal(c.json.nota.cor, '#bff0c3');
    assert.equal((await req('POST', '/staff/api/notas', { json: { titulo: '  ', texto: '' }, cookie: adminCookie })).status, 400, 'sem título e sem texto → 400');
    const outra = await req('POST', '/staff/api/notas', { json: { texto: 'Reveillon 2027', cor: 'inventada' }, cookie: adminCookie });
    assert.equal(outra.json.nota.cor, '#ffe08a', 'cor fora da paleta cai no padrão');
    const pt = await req('PATCH', '/staff/api/notas/' + notaId, { json: { texto: 'Comprar toalhas brancas', fixado: true }, cookie: adminCookie });
    assert.equal(pt.status, 200); assert.equal(pt.json.nota.fixado, true);
    assert.equal((await req('PATCH', '/staff/api/notas/' + notaId, { json: { titulo: '', texto: '' }, cookie: adminCookie })).status, 400, 'não deixa esvaziar');
    const lista = await req('GET', '/staff/api/notas', { cookie: adminCookie });
    assert.equal(lista.json.notas[0].id, notaId, 'fixada vem primeiro');
    const busca = await req('GET', '/staff/api/notas?busca=' + encodeURIComponent('reveillon'), { cookie: adminCookie });
    assert.equal(busca.json.notas.length, 1, 'busca sem acento acha "Réveillon"');
    assert.equal((await req('PATCH', '/staff/api/notas/naoexiste', { json: { texto: 'x' }, cookie: adminCookie })).status, 404);
  });
  await t('notas: arquivar → arquivo, restaurar volta ao mural, ?arquivar=nao apaga de vez', async () => {
    assert.equal((await req('DELETE', '/staff/api/notas/' + notaId, { cookie: adminCookie })).json.removidas, 1);
    const arq = await req('GET', '/staff/api/notas/arquivo', { cookie: adminCookie });
    assert.ok(arq.json.notas.some(n => n.id === notaId), 'nota excluída foi para o arquivo');
    assert.ok(!(await req('GET', '/staff/api/notas', { cookie: adminCookie })).json.notas.some(n => n.id === notaId));
    assert.equal((await req('POST', '/staff/api/notas/arquivo/' + notaId + '/restaurar', { cookie: adminCookie })).status, 200);
    assert.ok((await req('GET', '/staff/api/notas', { cookie: adminCookie })).json.notas.some(n => n.id === notaId), 'restaurada volta ao mural');
    assert.equal((await req('POST', '/staff/api/notas/arquivo/' + notaId + '/restaurar', { cookie: adminCookie })).status, 404, 'não está mais no arquivo');
    assert.equal((await req('DELETE', '/staff/api/notas/' + notaId + '?arquivar=nao', { cookie: adminCookie })).status, 200);
    assert.ok(!(await req('GET', '/staff/api/notas/arquivo', { cookie: adminCookie })).json.notas.some(n => n.id === notaId), 'excluída de vez não vai ao arquivo');
    assert.equal((await req('DELETE', '/staff/api/notas/arquivo/qualquer', { cookie: opCookie })).status, 403, 'arquivo também é restrito ao CEO');
  });

  // ---------- Lista de compras: concluir (✓) x excluir (✕) e a volta dos concluídos ----------
  await t('compras: ✓ vai p/ concluídos e volta com restaurar; ✕ (?arquivar=nao) não arquiva', async () => {
    const novo = async (nome) => (await req('POST', '/staff/api/listas/compras', { json: { nome }, cookie: adminCookie })).json.item.id;
    const ativos = async () => (await req('GET', '/staff/api/listas/compras', { cookie: adminCookie })).json.itens;
    const conc = async () => (await req('GET', '/staff/api/listas/compras/concluidos', { cookie: adminCookie })).json.itens;
    const a = await novo('detergente'), b = await novo('papel higiênico');
    assert.equal((await req('DELETE', '/staff/api/listas/compras/' + a, { cookie: adminCookie })).status, 200);
    assert.ok((await conc()).some(i => i.id === a), '✓ manda para os concluídos');
    assert.ok(!(await ativos()).some(i => i.id === a), 'sai da lista ativa');
    assert.equal((await req('DELETE', '/staff/api/listas/compras/' + b + '?arquivar=nao', { cookie: adminCookie })).status, 200);
    assert.ok(!(await conc()).some(i => i.id === b), '✕ exclui sem arquivar');
    const volta = await req('POST', '/staff/api/listas/compras/concluidos/' + a + '/restaurar', { cookie: adminCookie });
    assert.equal(volta.status, 200);
    assert.equal(volta.json.item.nome, 'detergente');
    // id novo + origem portal + sem refId: é o que impede a captura do WhatsApp de apagá-lo de novo
    assert.notEqual(volta.json.item.id, a); assert.equal(volta.json.item.origem, 'portal'); assert.equal(volta.json.item.refId, '');
    assert.ok((await ativos()).some(i => i.id === volta.json.item.id), 'voltou para a lista de compras');
    assert.equal((await conc()).length, 0, 'saiu dos concluídos');
    assert.equal((await req('POST', '/staff/api/listas/compras/concluidos/' + a + '/restaurar', { cookie: adminCookie })).status, 404);
    assert.equal((await req('DELETE', '/staff/api/listas/compras/' + volta.json.item.id, { cookie: adminCookie })).status, 200);
    assert.equal((await req('POST', '/staff/api/listas/compras/concluidos/limpar', { cookie: adminCookie })).status, 200);
    assert.equal((await conc()).length, 0, 'limpar concluídos zera a lista');
  });

  // ---------- Hóspede: conta corrente / fidelidade / Mercado Pago (dinheiro) ----------
  await t('fidelidade view/config respondem 200 (staff)', async () => {
    assert.equal((await req('GET', '/staff/api/hospede/fidelidade', { cookie: adminCookie })).status, 200);
    assert.equal((await req('GET', '/staff/api/hospede/fidelidade-config', { headers: { 'x-publish-key': 'pk-test' } })).status, 200);
  });
  await t('hóspede: extrato /conta e guarda de /conta/pagar (sem pendência → 400)', async () => {
    const login = await req('POST', '/hospede/api/login', { json: { email: 'h1@t.com', senha: 'SenhaHospede1' }, headers: comIp('10.4.4.1') });
    const hc = pegaCookie(login.setCookie, 'hospede_token'); assert.ok(hc);
    const conta = await req('GET', '/hospede/api/conta', { cookie: hc });
    assert.equal(conta.status, 200); assert.ok('saldo' in conta.json && Array.isArray(conta.json.lancamentos));
    assert.equal((await req('POST', '/hospede/api/conta/pagar', { cookie: hc })).status, 400, 'sem valor pendente → 400');
  });
  await t('hóspede: /conta/pagar cria checkout MP quando há valor pendente', async () => {
    const ls = lerData('lancamentos.json') || [];
    ls.push({ id: 'dbg-teste', hospedeId: 'H1', tipo: 'debito', descricao: 'Serviço extra (teste)', valor: -500, criadoEm: new Date().toISOString() });
    fs.writeFileSync(path.join(DATA_DIR, 'lancamentos.json'), JSON.stringify(ls, null, 2));
    const login = await req('POST', '/hospede/api/login', { json: { email: 'h1@t.com', senha: 'SenhaHospede1' }, headers: comIp('10.4.4.2') });
    const hc = pegaCookie(login.setCookie, 'hospede_token');
    const pg = await req('POST', '/hospede/api/conta/pagar', { cookie: hc });
    assert.equal(pg.status, 200); assert.ok(String(pg.json.url).includes('PREF1'), 'retorna URL do checkout MP');
  });

  // ---------- Área do Hóspede (app não-financeiro): exercita a maioria das deps ----------
  await t('hospede-app: auth-gate + guards + GETs simples respondem (deps resolvem)', async () => {
    for (const p of ['/hospede/api/me', '/hospede/api/servicos', '/hospede/api/minhas-reservas', '/hospede/api/meus-pedidos', '/hospede/api/indicacao'])
      assert.equal((await req('GET', p)).status, 401, p + ' sem cookie → 401');
    const login = await req('POST', '/hospede/api/login', { json: { email: 'h1@t.com', senha: 'SenhaHospede1' }, headers: comIp('10.8.8.1') });
    const hc = pegaCookie(login.setCookie, 'hospede_token'); assert.ok(hc);
    for (const p of ['/hospede/api/me', '/hospede/api/servicos', '/hospede/api/fidelidade-config', '/hospede/api/minhas-reservas', '/hospede/api/meus-pedidos', '/hospede/api/minhas-avaliacoes', '/hospede/api/indicacao', '/hospede/api/push/chave'])
      assert.equal((await req('GET', p, { cookie: hc })).status, 200, p + ' → 200');
    assert.equal((await req('POST', '/hospede/api/senha', { json: { atual: 'x', nova: 'y' }, cookie: hc })).status, 400);
    assert.equal((await req('POST', '/hospede/api/indicacao/usar', { json: {}, cookie: hc })).status, 400);
    assert.equal((await req('POST', '/hospede/api/indicacao', { json: {}, cookie: hc })).status, 400);
    assert.equal((await req('POST', '/hospede/api/pedido', { json: { tipo: 'servico', servicoId: 'zzz' }, cookie: hc })).status, 400);
    assert.equal((await req('POST', '/hospede/api/precheckin', { json: {}, cookie: hc })).status, 400);
    assert.equal((await req('POST', '/hospede/api/avaliacao', { json: {}, cookie: hc })).status, 400);
    assert.equal((await req('POST', '/hospede/api/push/subscribe', { json: {}, cookie: hc })).status, 400);
    assert.equal((await req('GET', '/hospede/api/conteudo/inexistente', { cookie: hc })).status, 404); // SECOES_CONTEUDO
    assert.equal((await req('POST', '/hospede/api/chat', { json: { mensagem: 'oi' }, cookie: hc })).status, 503); // sem ANTHROPIC_API_KEY
    assert.equal((await req('GET', '/hospede/api/carteira/RX', { cookie: hc })).status, 404); // reservasDoHospede
    assert.equal((await req('GET', '/hospede/api/propriedade/GD01H', { cookie: hc })).status, 403);
    // registro/e-mail (exercita stays/getStaysClientes/jwt/linkThrottle)
    assert.equal((await req('POST', '/hospede/api/registrar', { json: {} })).status, 400);
    assert.equal((await req('POST', '/hospede/api/registrar-email', { json: { email: 'naoexiste@t.com' } })).status, 200);
    assert.equal((await req('POST', '/hospede/api/definir-senha', { json: { token: 'lixo', senha: 'SenhaNova123' } })).status, 400);
  });

  // ---------- Webhook da Stays (segredo) ----------
  await t('webhook Stays: sem segredo=401, errado=401, correto=200', async () => {
    assert.equal((await req('POST', '/webhooks/stays', { json: { x: 1 } })).status, 401);
    assert.equal((await req('POST', '/webhooks/stays?s=errado', { json: { x: 1 } })).status, 401);
    assert.equal((await req('POST', '/webhooks/stays?s=sw-test', { json: { x: 1 } })).status, 200);
  });

  // ---------- Escrita atômica (round-trip mural) ----------
  await t('escrita atômica: POST mural → GET mural retorna a mensagem', async () => {
    const texto = 'aviso de teste ' + Date.now();
    const p = await req('POST', '/staff/api/mural', { json: { texto }, headers: { 'x-publish-key': 'pk-test' } });
    assert.equal(p.status, 200);
    const g = await req('GET', '/staff/api/mural', { headers: { 'x-publish-key': 'pk-test' } });
    const lista = Array.isArray(g.json) ? g.json : (g.json && g.json.mensagens) || [];
    assert.ok(lista.some(m => m.texto === texto), 'mensagem persistida e lida de volta');
    assert.ok(fs.existsSync(path.join(DATA_DIR, 'mural.json')), 'mural.json gravado');
  });

  // ---------- Webhook Mercado Pago (dinheiro + idempotência) ----------
  await t('webhook MP: pagamento aprovado credita 1 lançamento e é idempotente', async () => {
    mpPayments['PAY1'] = { id: 'PAY1', status: 'approved', external_reference: 'conta:H1', transaction_amount: 250 };
    for (let i = 0; i < 3; i++) { // MP re-tenta o mesmo webhook
      const r = await req('POST', '/webhooks/mercadopago', { json: { type: 'payment', data: { id: 'PAY1' } } });
      assert.equal(r.status, 200);
      await espera(120); // o handler responde 200 e processa em seguida
    }
    const ls = (lerData('lancamentos.json') || []).filter(l => l.pagamentoRef === 'PAY1');
    assert.equal(ls.length, 1, `esperava 1 lançamento de pagamento, veio ${ls.length}`);
    assert.equal(ls[0].valor, 250);
    assert.equal(ls[0].hospedeId, 'H1');
  });

  // ---------- Motor de fidelidade (dinheiro + idempotência + lock) ----------
  await t('fidelidade: credita cashback 5% e é idempotente', async () => {
    fix.checkout = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10); // dentro da janela (>5 dias)
    const r1 = await req('POST', '/staff/api/hospede/fidelidade/rodar', { json: { force: true }, headers: { 'x-publish-key': 'pk-test' } });
    assert.equal(r1.status, 200);
    const cash1 = (lerData('lancamentos.json') || []).filter(l => l.tipo === 'cashback' && l.hospedeId === 'H1');
    assert.equal(cash1.length, 1, 'creditou exatamente 1 cashback');
    assert.equal(cash1[0].valor, 50, 'cashback = 5% de 1000 (líquido)');
    await req('POST', '/staff/api/hospede/fidelidade/rodar', { json: { force: true }, headers: { 'x-publish-key': 'pk-test' } });
    const cash2 = (lerData('lancamentos.json') || []).filter(l => l.tipo === 'cashback' && l.hospedeId === 'H1');
    assert.equal(cash2.length, 1, 'idempotente: continua 1 cashback');
  });

  // ---------- Snapshots dos bancos SQLite (backup restaurável) ----------
  await t('snapshots: um por banco, tenants de mesmo nome não colidem, retenção não come o vizinho', async () => {
    const { DatabaseSync } = require('node:sqlite');
    const { snapshotTodos } = require('./snapshots');
    const raiz = path.join(DATA_DIR, 'snap-teste');
    // legal/legal.db e legal-esc-x/legal.db têm o MESMO basename; legal-saas/ tem o mesmo PREFIXO
    const bancos = ['legal/legal.db', 'legal-esc-x/legal.db', 'legal-saas/legal-saas.db', 'academy/academy.db'];
    for (const rel of bancos) {
      const cheio = path.join(raiz, rel);
      fs.mkdirSync(path.dirname(cheio), { recursive: true });
      const db = new DatabaseSync(cheio);
      db.exec('CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (1)');
      db.close();
    }
    const feitos = snapshotTodos(raiz, { manter: 2, hoje: '2026-08-01' });
    assert.equal(feitos.length, 4, 'um snapshot por banco (nenhum sobrescreve o outro)');
    const nomes = () => fs.readdirSync(path.join(raiz, '_snapshots')).sort();
    assert.deepEqual(nomes(), [
      'academy-2026-08-01.db', 'legal-2026-08-01.db',
      'legal-esc-x__legal-2026-08-01.db', 'legal-saas-2026-08-01.db',
    ], 'tenant vira legal-esc-x__legal; pasta com o nome do banco continua sem prefixo');
    // três dias com retenção 2: cada banco poda os SEUS, sem tocar nos do vizinho de prefixo
    snapshotTodos(raiz, { manter: 2, hoje: '2026-08-02' });
    snapshotTodos(raiz, { manter: 2, hoje: '2026-08-03' });
    const finais = nomes();
    for (const prefixo of ['academy', 'legal', 'legal-esc-x__legal', 'legal-saas']) {
      const doBanco = finais.filter(f => /^(.*)-\d{4}-\d{2}-\d{2}\.db$/.exec(f)[1] === prefixo);
      assert.equal(doBanco.length, 2, `${prefixo}: retém 2 (tem ${doBanco.join()})`);
      assert.ok(doBanco.includes(prefixo + '-2026-08-03.db'), `${prefixo}: manteve o mais recente`);
    }
  });

  // ---------- Área do Hóspede (login) ----------
  // ---------- H1: tomada de conta pelo localizador (auditoria de 28/08/2026) ----------
  // O localizador e curto (ex.: LR03J) e enumeravel; estes testes travam as 4 defesas.
  await t('H1 hóspede/registrar: sobrenome frouxo ("a") não casa mais → 404', async () => {
    const r = await req('POST', '/hospede/api/registrar', { json: { localizador: 'LR03J', sobrenome: 'a', checkin: fix.checkin, senha: 'SenhaNova123' }, headers: comIp('10.9.0.1') });
    assert.equal(r.status, 404, 'a substring bidirecional deixava "a" casar com quase todo sobrenome');
  });

  await t('H1 hóspede/registrar: check-in é obrigatório (400) e tem de bater (404)', async () => {
    const sem = await req('POST', '/hospede/api/registrar', { json: { localizador: 'LR03J', sobrenome: 'santos', senha: 'SenhaNova123' }, headers: comIp('10.9.0.2') });
    assert.equal(sem.status, 400, 'sem check-in tem de recusar');
    const errado = await req('POST', '/hospede/api/registrar', { json: { localizador: 'LR03J', sobrenome: 'santos', checkin: '2020-01-01', senha: 'SenhaNova123' }, headers: comIp('10.9.0.3') });
    assert.equal(errado.status, 404, 'check-in que não bate tem de recusar');
  });

  await t('H1 hóspede/registrar: conta existente NÃO tem a senha redefinida (409); a antiga continua valendo', async () => {
    const r = await req('POST', '/hospede/api/registrar', { json: { localizador: 'LR03J', sobrenome: 'santos', checkin: fix.checkin, senha: 'SenhaDoAtacante1' }, headers: comIp('10.9.0.4') });
    assert.equal(r.status, 409, 'era aqui que a senha do hóspede era sobrescrita sem prova de posse');
    const antiga = await req('POST', '/hospede/api/login', { json: { email: 'h1@t.com', senha: 'SenhaHospede1' }, headers: comIp('10.9.0.5') });
    assert.equal(antiga.status, 200, 'a senha original do hóspede segue válida');
    const doAtacante = await req('POST', '/hospede/api/login', { json: { email: 'h1@t.com', senha: 'SenhaDoAtacante1' }, headers: comIp('10.9.0.6') });
    assert.equal(doAtacante.status, 401, 'a senha escolhida pelo atacante não pode valer');
  });

  await t('H1 hóspede/registrar: 5 erros do mesmo IP → 429 (corta a enumeração)', async () => {
    let visto429 = false;
    for (let i = 0; i < 7; i++) {
      const r = await req('POST', '/hospede/api/registrar', { json: { localizador: 'LR03J', sobrenome: 'zzznaoexiste', checkin: fix.checkin, senha: 'SenhaNova123' }, headers: comIp('10.9.9.9') });
      if (r.status === 429) { visto429 = true; break; }
    }
    assert.ok(visto429, 'sem freio, dava para varrer o espaço de 5 caracteres do localizador');
  });

  await t('H1 hóspede/registrar: caminho feliz — sobrenome exato + check-in certo cria a conta', async () => {
    const r = await req('POST', '/hospede/api/registrar', { json: { localizador: 'RNOVA', sobrenome: 'Lima', checkin: fix.checkin, senha: 'SenhaNova123' }, headers: comIp('10.9.1.1') });
    assert.equal(r.status, 200, 'o hóspede legítimo continua conseguindo criar a conta');
    assert.ok(pegaCookie(r.setCookie, 'hospede_token'), 'cookie de sessão setado');
  });

  await t('hóspede: login correto=200+cookie, senha errada=401', async () => {
    const bom = await req('POST', '/hospede/api/login', { json: { email: 'h1@t.com', senha: 'SenhaHospede1' }, headers: comIp('10.2.2.2') });
    assert.equal(bom.status, 200); assert.ok(pegaCookie(bom.setCookie, 'hospede_token'), 'cookie hospede_token setado');
    const ruim = await req('POST', '/hospede/api/login', { json: { email: 'h1@t.com', senha: 'errada' }, headers: comIp('10.2.2.3') });
    assert.equal(ruim.status, 401);
  });

  await t('endpoints públicos têm freio: 6º pré-check-in do mesmo IP → 429', async () => {
    // limiteTaxa existia no server.js e nunca era chamado. O /api/precheckin
    // ainda dispara WhatsApp ao Augusto: sem freio, era vetor de rajada.
    let visto429 = false;
    for (let k = 0; k < 8; k++) {
      const r = await req('POST', '/api/precheckin', { json: { nome: 'Flood ' + k, email: 'f@t.com' }, headers: comIp('10.6.6.6') });
      if (r.status === 429) { visto429 = true; break; }
    }
    assert.ok(visto429, 'sem 429 o formulário público não tem freio nenhum');
    const outroIp = await req('POST', '/api/precheckin', { json: { nome: 'Legítimo', email: 'l@t.com' }, headers: comIp('10.6.6.7') });
    assert.notEqual(outroIp.status, 429, 'o freio é por IP: não pode punir quem não abusou');
  });

  // ---------- A1: sessão que não morria na troca de senha ----------
  // Ficam por último de propósito: trocam as senhas que os testes acima usam.
  await t('A1 staff: trocar a senha mata o cookie antigo e mantém quem trocou', async () => {
    const login = await req('POST', '/staff/api/login', { json: { email: 'pw@t.com', senha: 'NovaSenha123' }, headers: comIp('10.7.8.1') });
    const antigo = pegaCookie(login.setCookie, 'staff_token'); assert.ok(antigo, 'logou');
    assert.equal((await req('GET', '/staff/api/me', { cookie: antigo })).status, 200, 'o cookie vale antes da troca');
    const troca = await req('POST', '/staff/api/conta/senha', { json: { atual: 'NovaSenha123', nova: 'TerceiraSenha789' }, cookie: antigo });
    assert.equal(troca.status, 200);
    const novoCookie = pegaCookie(troca.setCookie, 'staff_token');
    assert.ok(novoCookie, 'a troca tem de devolver cookie novo');
    assert.equal((await req('GET', '/staff/api/me', { cookie: antigo })).status, 401, 'o cookie ANTIGO tem de morrer');
    assert.equal((await req('GET', '/staff/api/me', { cookie: novoCookie })).status, 200, 'quem trocou segue dentro');
  });

  await t('A1 hóspede: trocar a senha mata o cookie antigo e mantém quem trocou', async () => {
    const login = await req('POST', '/hospede/api/login', { json: { email: 'h1@t.com', senha: 'SenhaHospede1' }, headers: comIp('10.7.8.2') });
    const antigo = pegaCookie(login.setCookie, 'hospede_token'); assert.ok(antigo, 'logou');
    assert.equal((await req('GET', '/hospede/api/me', { cookie: antigo })).status, 200, 'o cookie vale antes da troca');
    const troca = await req('POST', '/hospede/api/senha', { json: { atual: 'SenhaHospede1', nova: 'NovaHospede12345' }, cookie: antigo });
    assert.equal(troca.status, 200);
    const novoCookie = pegaCookie(troca.setCookie, 'hospede_token');
    assert.ok(novoCookie, 'a troca tem de devolver cookie novo');
    assert.equal((await req('GET', '/hospede/api/me', { cookie: antigo })).status, 401, 'o cookie ANTIGO tem de morrer');
    assert.equal((await req('GET', '/hospede/api/me', { cookie: novoCookie })).status, 200, 'quem trocou segue dentro');
  });

  console.log(`\n${ok} teste(s) OK, ${falhas.length} falha(s).`);
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  if (falhas.length) { falhas.forEach(f => console.log('  ✗', f)); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('FALHA GERAL:', e); process.exit(1); });
