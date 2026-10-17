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
// UMA CONEXÃO POR PEDIDO (sem keep-alive). O servidor roda NESTE processo: um teste com trecho síncrono longo (a
// varredura de arquivos da Permissions-Policy, os bcrypt.hashSync) segura o laço de eventos; se passa de 6 s
// (keepAliveTimeout de 5 s + 1 s de folga do Node 24), o servidor fecha a conexão ociosa assim que o laço volta —
// e o pedido seguinte, já escrito nela pelo agente global, morria com `read ECONNRESET`. Foi o que derrubou, uma
// vez em 12/10/2026, os dois testes do coletor de CSP (os primeiros depois da varredura). Reproduzido à parte:
// 6,5 s de laço preso → ECONNRESET com o agente padrão; nenhum com este.
const SEM_REUSO = new http.Agent({ keepAlive: false });
function req(method, pth, { json, cookie, headers } = {}) {
  return new Promise((resolve, reject) => {
    const body = json !== undefined ? JSON.stringify(json) : null;
    const h = Object.assign({ Accept: 'application/json' }, headers || {});
    if (body) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(body); }
    if (cookie) h['Cookie'] = cookie;
    const r = http.request(BASE + pth, { method, headers: h, agent: SEM_REUSO }, (res) => {
      let data = ''; res.on('data', c => (data += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(data); } catch {} resolve({ status: res.statusCode, json: j, text: data, headers: res.headers, setCookie: res.headers['set-cookie'] || [] }); });
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
  console.log('\n— SEO por host: robots.txt, sitemap.xml e llms.txt —');
  const comHost = (h) => ({ Host: h });
  await t('robots de produto: libera o público, barra painel/API e lista os robôs de IA', async () => {
    const r = await req('GET', '/robots.txt', { headers: comHost('academia.villelastay.com.br') });
    assert.equal(r.status, 200);
    assert.ok(/text\/plain/.test(r.headers['content-type'] || ''), 'robots é texto');
    assert.ok(r.text.includes('Villela Academy'), 'diz de quem é');
    assert.ok(r.text.includes('Allow: /'), 'público liberado');
    assert.ok(r.text.includes('Disallow: /academy/app'), 'painel do assinante fora do índice');
    assert.ok(r.text.includes('Disallow: /staff'), 'portal interno fora');
    for (const robo of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
      assert.ok(r.text.includes('User-agent: ' + robo), 'robô de IA declarado: ' + robo);
    }
    assert.ok(/Sitemap: https?:\/\/academia\.villelastay\.com\.br\/sitemap\.xml/.test(r.text), 'aponta o sitemap DO HOST');
  });
  await t('host sem produto (onrender/minha) fica FORA do índice', async () => {
    const r = await req('GET', '/robots.txt', { headers: comHost('villela-stay-backend.onrender.com') });
    assert.equal(r.status, 200);
    assert.ok(r.text.includes('Disallow: /'), 'o domínio da Render não pode duplicar o oficial');
    assert.ok(!r.text.includes('Allow: /'), 'e não libera nada');
  });
  await t('sitemap do host lista as páginas públicas daquele produto, com o host certo', async () => {
    const r = await req('GET', '/sitemap.xml', { headers: comHost('crm.villelastay.com.br') });
    assert.equal(r.status, 200);
    assert.ok(/xml/.test(r.headers['content-type'] || ''));
    assert.ok(r.text.includes('<urlset'), 'é um sitemap');
    assert.ok(r.text.includes('http://crm.villelastay.com.br/crm</loc>'.replace('http://', 'http://')) ||
      r.text.includes('crm.villelastay.com.br/crm</loc>'), 'a landing entra com o host pedido');
    assert.ok(!r.text.includes('/crm/app'), 'painel não entra no mapa');
    const outro = await req('GET', '/sitemap.xml', { headers: comHost('livros.villelastay.com.br') });
    assert.ok(outro.text.includes('/livros'), 'cada host tem o SEU mapa');
    assert.ok(!outro.text.includes('/crm'), 'e não o do vizinho');
  });
  await t('sitemap e llms não existem em host sem produto', async () => {
    assert.equal((await req('GET', '/sitemap.xml', { headers: comHost('villela-stay-backend.onrender.com') })).status, 404);
    assert.equal((await req('GET', '/llms.txt', { headers: comHost('villela-stay-backend.onrender.com') })).status, 404);
  });
  await t('llms.txt descreve o produto para assistentes, com links e o CNPJ', async () => {
    const r = await req('GET', '/llms.txt', { headers: comHost('juridico.villelastay.com.br') });
    assert.equal(r.status, 200);
    assert.ok(r.text.startsWith('# Villela Legal'), 'começa nomeando o produto');
    assert.ok(r.text.includes('DJEN'), 'traz o resumo do que ele faz');
    assert.ok(r.text.includes('56.776.526/0001-12'), 'identifica a empresa (entidade)');
    assert.ok(r.text.includes('villelastay.com.br/sistemas.html'), 'liga ao catálogo do grupo');
  });
  // Esta é a trava que faltava quando o catálogo nasceu: as páginas públicas eram
  // SUPOSIÇÕES ('/termos' e '/precos' em todo produto) e 20 das 65 URLs dos
  // sitemaps respondiam 404 em produção. Aqui o server.js real está de pé — então
  // dá para perguntar a ele, host por host, se cada caminho anunciado existe.
  await t('toda página pública do catálogo existe de verdade (sitemap sem link morto)', async () => {
    const { PRODUTOS } = require('./nucleo/seo');
    const mortas = [];
    for (const p of PRODUTOS) {
      const host = p.subs[0] + 'villelastay.com.br';
      for (const caminho of p.publicas) {
        const r = await req('GET', p.prefixo + caminho, { headers: comHost(host) });
        if (r.status === 404) mortas.push(`${host}${p.prefixo}${caminho} → 404`);
      }
    }
    assert.equal(mortas.length, 0,
      'o sitemap anuncia página que não existe:\n  ' + mortas.join('\n  '));
  });

  await t('verificação do Search Console só responde a token da lista, e em qualquer host', async () => {
    process.env.GOOGLE_SITE_VERIFICATION = 'googleabc123.html';   // aceita com e sem enfeite
    // o arquivo vale para a conta, não para o site: tem de responder em TODO host
    for (const host of ['academia.villelastay.com.br', 'origena.villelastay.com.br', 'villelastay.com.br']) {
      const r = await req('GET', '/googleabc123.html', { headers: comHost(host) });
      assert.equal(r.status, 200, 'o arquivo tem de existir em ' + host);
      assert.equal(r.text.trim(), 'google-site-verification: googleabc123.html');
    }
    // ⚠️ o que protege: token fora da lista NÃO pode verificar. Quem verifica um
    // domínio nosso vê as consultas de busca e pode pedir remoção de URL.
    // (o que sobra aqui é o redirect de subdomínio, que devolve 302 — o que
    // importa é NUNCA sair a linha que o Google procura)
    const intruso = await req('GET', '/googleintruso999.html', { headers: comHost('academia.villelastay.com.br') });
    assert.ok(!String(intruso.text || '').includes('google-site-verification'),
      'token de fora da lista não pode ser aceito: veio ' + intruso.status);
    delete process.env.GOOGLE_SITE_VERIFICATION;
  });

  // Guarda contra o pior caso silencioso: a lista esvaziar. O arquivo pararia de
  // responder, as propriedades do Search Console perderiam a verificação e nada
  // no sistema acusaria — as páginas continuam abrindo.
  await t('a lista de verificação não está vazia, e o token gravado responde', async () => {
    const { tokensDeVerificacao } = require('./nucleo/seo');
    const tokens = tokensDeVerificacao();
    assert.ok(tokens.length > 0, 'sem token não há como provar posse dos domínios no Google');
    const r = await req('GET', `/google${tokens[0]}.html`, { headers: comHost('livros.villelastay.com.br') });
    assert.equal(r.status, 200);
    assert.equal(r.text.trim(), `google-site-verification: google${tokens[0]}.html`);
  });

  // O .com é espelho do .com.br no MESMO serviço. Quem pergunta pelo espelho tem
  // de receber o mapa do domínio oficial — senão o sitemap contradiz o canonical
  // da própria página e o rastreio se divide entre dois endereços do mesmo texto.
  await t('servido pelo domínio espelho (.com), o mapa aponta o domínio oficial (.com.br)', async () => {
    const r = await req('GET', '/sitemap.xml', { headers: comHost('academia.villelastay.com') });
    assert.equal(r.status, 200, 'o espelho continua respondendo o mapa');
    assert.ok(r.text.includes('//academia.villelastay.com.br/academy'), 'as URLs são as oficiais');
    assert.ok(!/villelastay\.com\/(?!$)/.test(r.text.replace(/\.com\.br/g, '.oficial')),
      'nenhuma URL do espelho pode entrar no mapa');

    const rb = await req('GET', '/robots.txt', { headers: comHost('academia.villelastay.com') });
    assert.ok(/Sitemap: https?:\/\/academia\.villelastay\.com\.br\/sitemap\.xml/.test(rb.text),
      'o robots do espelho aponta o mapa oficial');

    const l = await req('GET', '/llms.txt', { headers: comHost('livros.villelastay.com') });
    assert.ok(l.text.includes('//livros.villelastay.com.br/livros'),
      'o llms.txt do espelho também cita o domínio oficial');
  });

  await t('catálogo dinâmico entra no sitemap e falha nele não derruba o mapa', async () => {
    const seo = require('./nucleo/seo');
    seo.registrar('/crm', () => [{ url: '/crm/teste-dinamico', atualizado: '2026-09-19' }]);
    let r = await req('GET', '/sitemap.xml', { headers: comHost('crm.villelastay.com.br') });
    assert.ok(r.text.includes('/crm/teste-dinamico'), 'a URL do provedor entra');
    seo.registrar('/crm', () => { throw new Error('provedor quebrado'); });
    r = await req('GET', '/sitemap.xml', { headers: comHost('crm.villelastay.com.br') });
    assert.equal(r.status, 200, 'provedor quebrado não pode derrubar o sitemap');
    assert.ok(r.text.includes('<urlset'), 'e o mapa continua válido');
    seo.registrar('/crm', () => []);
  });



  // ---------- Auth / sessão ----------
  await t('/health diz qual commit esta no ar (push nao e o mesmo que estar no ar)', async () => {
    // PÚBLICO (auditoria de 11/10/2026, B7): vivo, serviço e commit curto — e mais nada. Branch, ambiente e
    // sinalizadores de segredo são informação de reconhecimento: só saem para quem manda a PUBLISH_KEY.
    const pub = await req('GET', '/health');
    assert.equal(pub.status, 200);
    assert.deepEqual(Object.keys(pub.json).sort(), ['commit', 'ok', 'servico'], 'sem chave, o health só diz que está vivo e qual commit');
    assert.ok(pub.json.ok, "o health tem de continuar dizendo ok");
    assert.equal(pub.json.servico, 'villela-stay-backend', 'o Test-StaffPortal (publicar-staff.ps1) lê o serviço');
    assert.ok(pub.json.commit.length > 0 && pub.json.commit.length <= 7, 'commit em forma curta');
    const errada = await req('GET', '/health', { headers: { 'x-publish-key': 'chave-errada' } });
    assert.deepEqual(Object.keys(errada.json).sort(), ['commit', 'ok', 'servico'], 'chave errada vale o mesmo que chave nenhuma');
    const r = await req('GET', '/health', { headers: { 'x-publish-key': process.env.PUBLISH_KEY } });
    assert.equal(r.status, 200);
    assert.ok(r.json.ok, "o health tem de continuar dizendo ok");
    assert.equal(typeof r.json.commit, 'string', 'sem o commit nao da para conferir o que ficou live');
    assert.ok(r.json.commit.length > 0 && r.json.commit.length <= 7, 'commit em forma curta');
    assert.equal(typeof r.json.branch, 'string', 'a branch denuncia deploy vindo de ref errada');
    // Sem isto, saber se a assinatura do MP está armada dependia de esperar um
    // webhook chegar e procurar um aviso no log — e a ausência do aviso não
    // provava nada, porque ele só sai quando há pagamento.
    assert.equal(typeof r.json.webhook_mp_assinado, 'boolean', 'health tem de dizer se a assinatura do MP está armada');
    assert.ok(!JSON.stringify(r.json).includes('seg-'), 'o health nunca pode devolver o segredo, só o booleano');
    // A guarda que derruba o boot sem JWT_SECRET depende de NODE_ENV, que NÃO
    // está no render.yaml — então 'o deploy subiu' não prova que o segredo
    // existe. O health prova, e diz em que ambiente o processo se enxerga.
    assert.equal(typeof r.json.jwt_secret_definido, 'boolean', 'health tem de dizer se há JWT_SECRET');
    assert.equal(r.json.jwt_secret_definido, true, 'o teste define JWT_SECRET, então tem de vir true');
    assert.equal(typeof r.json.ambiente, 'string', 'sem o ambiente não se sabe se as guardas de produção estão armadas');
    assert.equal(typeof r.json.guardas_de_producao_armadas, 'boolean',
      'o health tem de dizer se as guardas de produção estão armadas');
    // No teste rodamos fora do Render e com NODE_ENV=development: têm de estar
    // DESarmadas, senão a guarda derrubaria a própria suíte.
    assert.equal(r.json.guardas_de_producao_armadas, false, 'fora do Render não pode se achar produção');
    assert.ok(!JSON.stringify(r.json).includes(process.env.JWT_SECRET), 'o health não pode vazar o JWT_SECRET');
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
  // A base de clientes (dado pessoal de todos os sistemas) é a exceção: a chave de
  // automação, que abre quase tudo no staff, NÃO abre esta — nem a lista, nem o CSV.
  await t('Clientes: só sessão de admin — anônimo=401, membro=403, PUBLISH_KEY=403, admin=200 sem cache', async () => {
    for (const rota of ['/staff/api/clientes', '/staff/api/clientes.csv']) {
      assert.equal((await req('GET', rota)).status, 401, rota + ' anônimo');
      assert.equal((await req('GET', rota, { cookie: opCookie })).status, 403, rota + ' membro');
      assert.equal((await req('GET', rota, { headers: { 'x-publish-key': 'pk-test' } })).status, 403, rota + ' só com a chave');
      const ok = await req('GET', rota, { cookie: adminCookie });
      assert.equal(ok.status, 200, rota + ' admin');
      assert.match(String(ok.headers['cache-control']), /no-store/, rota + ' sem cache');
    }
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

  await t('dinheiro do hóspede: toda escrita passa pela fila (nenhuma some)', async () => {
    // O motor de fidelidade grava por atualizarJSON, que faz `await fn(atual)`:
    // leitura e escrita PODEM ficar separadas. Quem gravava direto no meio
    // desaparecia quando a fila commitava — e pagamento sumido não volta.
    const fsx = require('fs'), pathx = require('path');
    const arq = pathx.join(DATA_DIR, 'lancamentos.json');
    const antes = JSON.parse(fsx.readFileSync(arq, 'utf8'));
    // duas escritas concorrentes: uma lenta (como o motor) e uma rápida
    const lento = req('POST', '/staff/api/hospede/conta/H1/lancamento', {
      json: { tipo: 'bonus', descricao: 'Lento', valor: 11 }, cookie: adminCookie });
    const rapido = req('POST', '/staff/api/hospede/conta/H1/lancamento', {
      json: { tipo: 'bonus', descricao: 'Rapido', valor: 22 }, cookie: adminCookie });
    await Promise.all([lento, rapido]);
    const depois = JSON.parse(fsx.readFileSync(arq, 'utf8'));
    assert.strictEqual(depois.length, antes.length + 2, 'as duas escritas têm de sobreviver');
    assert.ok(depois.some(l => l.descricao === 'Lento'), 'a primeira sumiu');
    assert.ok(depois.some(l => l.descricao === 'Rapido'), 'a segunda sumiu');
  });

  await t('a detecção de produção NÃO depende de NODE_ENV (que não está no render.yaml)', async () => {
    // A guarda do JWT_SECRET dependia só de NODE_ENV, e NODE_ENV não aparece
    // uma única vez no render.yaml — podia nunca disparar justamente em produção.
    const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    const linha = src.split(String.fromCharCode(10)).find((l) => l.startsWith('const EM_PRODUCAO ='));
    assert.ok(linha, 'EM_PRODUCAO tem de existir');
    assert.ok(linha.includes('process.env.RENDER'), 'tem de reconhecer o Render, nao so NODE_ENV');
    assert.ok(src.includes('if (EM_PRODUCAO) {'), 'a guarda do JWT tem de usar a constante');
    const yaml = fs.readFileSync(path.join(__dirname, 'render.yaml'), 'utf8');
    assert.ok(!yaml.includes('NODE_ENV'), 'se NODE_ENV entrar no render.yaml, revisar este raciocinio');
  });

  await t('CSP vai em Report-Only (não bloqueia) e aponta para um coletor que existe', async () => {
    const r = await req('GET', '/health');
    const ro = r.headers['content-security-policy-report-only'];
    assert.ok(ro, 'sem CSP nenhuma');
    assert.ok(!r.headers['content-security-policy'],
      'em modo bloqueio quebraria tela: o passo agora é só RELATAR');
    assert.ok(ro.includes('report-uri /csp-report'), 'relatório sem coletor não serve de nada');
    assert.ok(ro.includes("default-src 'self'"), 'sem default-src a política não restringe nada');
    assert.ok(ro.includes("object-src 'none'"), 'object-src é o que barra plugin antigo');
  });

  await t('M5: não anuncia o Express e manda Permissions-Policy compatível com o que os produtos usam', async () => {
    const r = await req('GET', '/health');
    assert.ok(!('x-powered-by' in r.headers), 'x-powered-by exposto: ' + r.headers['x-powered-by']);
    const pp = r.headers['permissions-policy'];
    assert.ok(pp, 'sem Permissions-Policy');
    const mapa = Object.fromEntries(String(pp).split(',').map((d) => d.trim().split('=')));
    // fechado para todo mundo: ninguém usa
    for (const rec of ['camera', 'geolocation', 'payment', 'usb', 'bluetooth', 'serial', 'hid']) assert.equal(mapa[rec], '()', rec + ' devia estar fechado');
    // aberto só para a própria origem: algum produto usa
    for (const rec of ['microphone', 'display-capture', 'midi', 'screen-wake-lock', 'gyroscope', 'accelerometer']) assert.equal(mapa[rec], '(self)', rec + ' é usado por produto da casa');
    // NÃO listados: o player de vídeo embutido (iframe de terceiro) depende do padrão do navegador
    for (const rec of ['fullscreen', 'autoplay', 'picture-in-picture', 'encrypted-media', 'clipboard-write', 'web-share']) assert.ok(!(rec in mapa), rec + ' listado tira recurso do vídeo embutido');
    assert.ok(!/\*/.test(pp), 'curinga abre o recurso para qualquer iframe');
    // vai também em página de produto e em 404, não só no /health
    for (const rota of ['/academy/termos', '/rota-que-nao-existe']) {
      const o = await req('GET', rota);
      assert.equal(o.headers['permissions-policy'], pp, rota);
      assert.ok(!('x-powered-by' in o.headers), rota);
    }
    // A política tem de acompanhar o CÓDIGO: varre o que é servido ao navegador e confere que nada do que ela
    // fecha é usado — e que o microfone, que o Estude e o Musique usam, continua aberto para a própria origem.
    const usos = { camera: 0, microphone: 0, geolocation: 0, 'display-capture': 0, midi: 0, 'screen-wake-lock': 0, payment: 0, usb: 0 };
    const FORA = new Set(['node_modules', '.git', 'data', 'dist']);
    const varrer = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (FORA.has(e.name) || e.name.startsWith('.wt')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { varrer(p); continue; }
        if (!/\.(js|html)$/.test(e.name) || /selftest|^testes|\.test\./.test(e.name)) continue;
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/getUserMedia\(([^)]{0,200})/g)) {
          if (/video\s*:(?!\s*false\b)/.test(m[1])) usos.camera++;   // `video: false` é pedir SÓ áudio
          usos.microphone++;
        }
        if (/navigator\.geolocation/.test(src)) usos.geolocation++;
        if (/getDisplayMedia/.test(src)) usos['display-capture']++;
        if (/requestMIDIAccess/.test(src)) usos.midi++;
        if (/wakeLock/.test(src)) usos['screen-wake-lock']++;
        if (/new PaymentRequest/.test(src)) usos.payment++;
        if (/navigator\.(usb|bluetooth|serial|hid)\b/.test(src)) usos.usb++;
      }
    };
    varrer(__dirname);
    assert.ok(usos.microphone > 0, 'a varredura não achou o getUserMedia do Estude: o teste está cego');
    assert.ok(fs.readFileSync(path.join(__dirname, 'academy', 'app-estudo.js'), 'utf8').includes('getUserMedia({ audio: true }'), 'a prova oral do Estude grava áudio');
    for (const rec of ['camera', 'geolocation', 'payment', 'usb']) assert.equal(usos[rec], 0, `algum arquivo passou a usar ${rec}: abrir na Permissions-Policy (server.js) antes de publicar`);
    for (const rec of ['microphone', 'display-capture', 'midi', 'screen-wake-lock']) if (usos[rec]) assert.equal(mapa[rec], '(self)', rec);
  });

  await t('o coletor de CSP grava a violação e responde 204', async () => {
    const antes = (lerData('csp-violacoes.jsonl') === null) ? 0 : 0;
    const r = await req('POST', '/csp-report', { json: { 'csp-report': {
      'violated-directive': 'script-src', 'blocked-uri': 'https://exemplo.invalido/x.js',
      'document-uri': 'https://villelastay.com.br/', 'line-number': 42 } } });
    assert.equal(r.status, 204, 'o navegador não espera corpo');
    const fsx = require('fs'), pathx = require('path');
    const arq = pathx.join(DATA_DIR, 'csp-violacoes.jsonl');
    const linhas = fsx.readFileSync(arq, 'utf8').trim().split(String.fromCharCode(10));
    const ultima = JSON.parse(linhas[linhas.length - 1]);
    assert.equal(ultima.diretiva, 'script-src');
    assert.ok(ultima.bloqueado.includes('exemplo.invalido'));
    assert.ok(antes === 0);
  });

  await t('o coletor de CSP tem freio (endereço público que grava em disco)', async () => {
    let visto429ouParou = false;
    const fsx = require('fs'), pathx = require('path');
    const arq = pathx.join(DATA_DIR, 'csp-violacoes.jsonl');
    const antes = fsx.readFileSync(arq, 'utf8').trim().split(String.fromCharCode(10)).length;
    for (let i = 0; i < 40; i++) {
      await req('POST', '/csp-report', { json: { 'csp-report': { 'violated-directive': 'flood' } },
        headers: comIp('10.5.5.5') });
    }
    const depois = fsx.readFileSync(arq, 'utf8').trim().split(String.fromCharCode(10)).length;
    visto429ouParou = (depois - antes) < 40;
    assert.ok(visto429ouParou, 'sem freio, endereço público enche o disco: gravou tudo');
  });

  await t('HSTS vai em HTTPS e NÃO vai em HTTP', async () => {
    // O teste fala http com o servidor; o proxy do Render sinaliza o esquema
    // original no X-Forwarded-Proto, e é por ele que a decisão passa.
    const comTls = await req('GET', '/health', { headers: { 'X-Forwarded-Proto': 'https' } });
    const h = comTls.headers && comTls.headers['strict-transport-security'];
    assert.ok(h, 'sem HSTS em resposta https');
    assert.ok(Number((String(h).match(/max-age=([0-9]+)/) || [])[1] || 0) >= 15552000, 'max-age curto demais para valer de algo');
    assert.ok(/includeSubDomains/.test(h), 'os subdomínios ficariam de fora');
    assert.ok(!/preload/.test(h), 'preload é praticamente irreversível: não entra por commit');
    const semTls = await req('GET', '/health', { headers: { 'X-Forwarded-Proto': 'http' } });
    assert.ok(!(semTls.headers && semTls.headers['strict-transport-security']),
      'HSTS em resposta http não vale nada e só confunde');
  });

  // ---------- Despesas dos sistemas (nucleo/despesas-sistemas.js): leitura única para o relatório semanal ----------
  const ROTA_DESP = '/staff/api/despesas-sistemas';
  const sis = (r, chave) => r.json.sistemas.find(s => s.sistema === chave);
  await t('despesas-sistemas: sem credencial → 401; chave errada → 401; sessão que não é admin → 403', async () => {
    assert.equal((await req('GET', ROTA_DESP)).status, 401);
    assert.equal((await req('GET', ROTA_DESP, { headers: { 'x-publish-key': 'errada' } })).status, 401);
    assert.equal((await req('GET', ROTA_DESP, { cookie: opCookie })).status, 403);
  });

  await t('despesas-sistemas: com a chave (ou sessão de admin) → 200 com a lista de sistemas, sem cache', async () => {
    const r = await req('GET', ROTA_DESP, { headers: { 'x-publish-key': 'pk-test' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.dias, 7, 'o padrão é 7 dias');
    assert.ok(/no-store/.test(String(r.headers['cache-control'] || '')), 'resposta sem no-store');
    assert.ok(Array.isArray(r.json.sistemas) && r.json.sistemas.length >= 15, 'lista de sistemas curta demais');
    for (const chave of ['academy', 'legal-saas', 'vdocs', 'vpe', 'crm', 'finance', 'origena', 'music', 'hospede', 'livraria', 'cozinhe']) {
      const s = sis(r, chave);
      assert.ok(s, 'faltou o sistema ' + chave);
      assert.equal(typeof s.medido, 'boolean');
      assert.ok(s.medido || s.motivo, chave + ' sem medida e sem motivo');
    }
    assert.ok(sis(r, 'academy').medido && sis(r, 'academy').ia, 'a Academy tem de vir medida (Logs.custos)');
    assert.equal(sis(r, 'cozinhe').medido, false, 'o Cozinhe mora fora deste backend');
    assert.ok(Array.isArray(r.json.nao_medido) && r.json.nao_medido.length, 'faltou a lista do que ninguém registra');
    assert.ok(r.json.total && typeof r.json.total.ia_custo_usd === 'number' && typeof r.json.total.pagamentos_bruto_brl === 'number');
    assert.ok(!/@/.test(JSON.stringify(r.json)), 'a resposta não pode levar e-mail');
    assert.equal((await req('GET', ROTA_DESP + '?dias=99999', { headers: { 'x-publish-key': 'pk-test' } })).json.dias, 366, 'o teto é 366 dias');
    assert.equal((await req('GET', ROTA_DESP, { cookie: adminCookie })).status, 200, 'sessão de admin também lê');
  });

  await t('despesas-sistemas: um coletor que quebra não derruba os outros', async () => {
    const D = require('./nucleo/despesas-sistemas');
    const vdocs = D.COLETORES.find(c => c.sistema === 'vdocs');
    const r = await D.resumo(7, { coletores: [
      { sistema: 'quebrado', nome: 'Quebrado', coletar() { throw new Error('no such table: nada'); } },
      { sistema: 'recusa', nome: 'Promessa recusada', coletar: async () => { throw new Error('conexão caiu'); } },
      vdocs,
    ] });
    assert.equal(r.sistemas.length, 3);
    // (auditoria C, C-14) o motivo diz a CLASSE da falha — o texto cru da exceção fica no log do servidor, não na resposta
    assert.equal(r.sistemas[0].medido, false); assert.equal(r.sistemas[0].motivo, 'falha ao ler: tabela ausente', 'o motivo tem de dizer o que falhou');
    assert.equal(r.sistemas[1].medido, false); assert.equal(r.sistemas[1].motivo, 'falha ao ler: erro inesperado');
    assert.equal(r.sistemas[2].medido, true, 'o coletor seguinte tem de seguir de pé');
    assert.equal(r.total.sistemas_medidos, 1); assert.equal(r.total.sistemas_nao_medidos, 2);
  });

  // ---------- auditoria C de 12/10/2026 (C-06, C-14, C-15, C-18) ----------
  await t('despesas-sistemas (C-14): o texto da exceção NÃO sai na resposta — caminho de arquivo, e-mail e mensagem do banco ficam no log; sai a classe da falha', async () => {
    const D = require('./nucleo/despesas-sistemas');
    const erros = [];
    const antigo = console.error; console.error = (...a) => { erros.push(a.join(' ')); };
    let r;
    try {
      r = await D.resumo(7, { coletores: [
        { sistema: 'modulo', nome: 'Módulo ausente', coletar() { return require('./nao-existe-mesmo/db'); } },
        { sistema: 'pessoal', nome: 'Erro com dado', coletar() { throw new Error('UNIQUE constraint failed: users.email (fulano.de.tal@exemplo.com) em /opt/render/project/src/academy/db.js'); } },
        { sistema: 'categoria', nome: 'Falha numa categoria', coletar() { const notas = []; let ia = null; try { throw new Error('no such column: segredo em C:\\Users\\alguem\\dados\\x.db'); } catch (e) { notas.push('IA: não deu para ler (' + D._int.classeDoErro(e) + ')'); } return { ia, armazenamento: { arquivos: 1, bytes: 10, no_r2: null, no_disco: null, fonte: 'teste' }, notas }; } },
        { sistema: 'fora', nome: 'Sem o que medir', coletar() { throw Object.assign(new Error('mora em outro serviço: este processo não enxerga o banco dele'), { naoMedido: true }); } },
      ] });
    } finally { console.error = antigo; }
    assert.deepEqual(r.sistemas.map(s => s.motivo), ['falha ao ler: módulo não carregou', 'falha ao ler: restrição do banco', '', 'mora em outro serviço: este processo não enxerga o banco dele'], 'o motivo que NÓS escrevemos (não medido) continua inteiro');
    const resposta = JSON.stringify(r);
    assert.ok(!/@|exemplo\.com|\/opt\/render|Require stack|Users\\\\|\.db\b|segredo|UNIQUE|constraint failed/i.test(resposta), 'vazou texto de exceção na resposta: ' + resposta.slice(0, 400));
    assert.ok(erros.some(e => /fulano\.de\.tal@exemplo\.com/.test(e) && /\[despesas-sistemas\] pessoal: restrição do banco/.test(e)) && erros.some(e => /nao-existe-mesmo/.test(e)), 'o detalhe vai para o log do servidor, com o sistema e a classe');
    assert.deepEqual(['no such table: x', 'SQLITE_BUSY: database is locked', 'unable to open database file', 'Unexpected token } in JSON', 'qualquer outra coisa'].map(m => D._int.classeDoErro(new Error(m))),
      ['tabela ausente', 'banco ocupado', 'banco ou arquivo indisponível', 'arquivo ilegível', 'erro inesperado']);
    // a rota: o 500 também não leva o texto
    const fonte = fs.readFileSync(path.join(__dirname, 'nucleo', 'despesas-sistemas.js'), 'utf8');
    assert.ok(!/e\.message\)\s*\.replace\(\/\\s\+\/g, ' '\)\.slice\(0, 160\)/.test(fonte) && /detalhe: curto\(e, 'rota'\)/.test(fonte));
  });

  await t('despesas-sistemas (C-06): o prazo vale para o que dá — coletor assíncrono é cortado e PARA; prazo total vencido, o resto não roda; coletor síncrono lento sai com a nota; e a rota responde do CACHE, divide a leitura em curso e limita as leituras novas', async () => {
    const D = require('./nucleo/despesas-sistemas');
    const dormir = (ms) => new Promise(ok => setTimeout(ok, ms));
    const ocupar = (ms) => { const f = Date.now() + ms; while (Date.now() < f) { /* consulta síncrona demorada */ } };
    const antigo = console.error; console.error = () => {};
    try {
      // (1) assíncrono que passa do prazo: "tempo esgotado" — e o laço dele recebe o sinal e para
      let voltas = 0, parou = false;
      const lerFamilias = async (ctx) => { for (let k = 0; k < 200; k++) { if (ctx.sinal.vencido) { parou = true; throw new Error('parei'); } voltas++; await dormir(15); } return { ia: { chamadas: 1, custo_usd: 1 }, notas: [] }; };
      let r = await D.resumo(7, { prazoMs: 80, coletores: [{ sistema: 'lento-async', nome: 'Assíncrono lento', coletar: lerFamilias }, { sistema: 'depois', nome: 'O seguinte', coletar: () => ({ ia: { chamadas: 2, custo_usd: 0.5 }, notas: [] }) }] });
      assert.deepEqual([r.sistemas[0].medido, r.sistemas[0].motivo, r.sistemas[0].usa_ia, r.sistemas[1].medido, r.total.ia_chamadas], [false, 'falha ao ler: tempo esgotado', 'falha_de_leitura', true, 2]);
      await dormir(60);
      const noCorte = voltas;
      await dormir(120);
      assert.ok(parou && voltas === noCorte && voltas < 30, `o laço parou quando o prazo venceu (${voltas} voltas de 200) — antes seguia rodando em segundo plano`);
      // a Origena de verdade confere o sinal a cada família
      let familiasLidas = 0;
      const sinal = { vencido: false };
      const origenaFalsa = { db: { configurado: () => true, todas: async () => [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }] },
        tenancy: { comEscopo: async () => { familiasLidas++; sinal.vencido = true; return { ledger: [], arquivos: { n: 0, b: 0 }, pedidos: { n: 0, s: 0 } }; } } };
      const eo = await D._int.origena({ desde: new Date().toISOString(), sinal }, origenaFalsa).then(() => null, (e) => e);
      assert.deepEqual([familiasLidas, !!(eo && eo.tempoEsgotado)], [1, true], 'vencido o prazo, a segunda família já não é lida');
      // (2) síncrono lento: não há como cortar — o resultado vale, e a linha diz que passou do prazo
      r = await D.resumo(7, { prazoMs: 40, coletores: [{ sistema: 'lento-sync', nome: 'Síncrono lento', coletar() { ocupar(120); return { ia: { chamadas: 1, custo_usd: 1 }, notas: ['nota do coletor'] }; } }] });
      assert.deepEqual([r.sistemas[0].medido, r.sistemas[0].motivo, r.sistemas[0].notas.length, /^leitura lenta: \d+ ms, acima do prazo de 40 ms \(consulta síncrona não pode ser interrompida/.test(r.sistemas[0].notas[1])], [true, '', 2, true]);
      // (3) prazo TOTAL: o primeiro coletor (síncrono) gastou tudo → os seguintes NÃO rodam nesta chamada
      let rodou = 0;
      r = await D.resumo(7, { prazoTotalMs: 60, coletores: [{ sistema: 'a', nome: 'A', coletar() { ocupar(100); return { ia: { chamadas: 1, custo_usd: 1 }, notas: [] }; } },
        { sistema: 'b', nome: 'B', coletar() { rodou++; return { ia: { chamadas: 9, custo_usd: 9 }, notas: [] }; } }, { sistema: 'c', nome: 'C', coletar() { rodou++; return {}; } }] });
      assert.deepEqual([rodou, r.sistemas.map(s => s.medido), /^não lido nesta rodada: o prazo total/.test(r.sistemas[1].motivo), r.total.ia_chamadas, r.nao_medido.some(n => /^2 sistema\(s\) não foram lidos nesta rodada/.test(n))], [0, [true, false, false], true, 1, true]);
      assert.ok(typeof r.levou_ms === 'number' && r.levou_ms >= 100);
    } finally { console.error = antigo; }

    // (4) o CACHE: uma leitura por `dias`, dividida por quem chega junto, com teto de leituras novas por minuto
    let leituras = 0, relogio = 1000000;
    const C = D._int.novoCache({ leitor: async (d) => { leituras++; await dormir(20); return { dias: d, gerado_em: 'g' + leituras }; }, cacheMs: 300000, porMinuto: 3, agora: () => relogio });
    const [a, b] = await Promise.all([C.ler('7'), C.ler(7)]);
    assert.deepEqual([leituras, a.gerado_em, b.gerado_em, a.em_cache, a.dias], [1, 'g1', 'g1', false, 7], 'duas chamadas simultâneas: UMA leitura');
    const c2 = await C.ler(7);
    assert.deepEqual([leituras, c2.gerado_em, c2.em_cache, c2.cache_expira_em], [1, 'g1', true, new Date(1000000 + 300000).toISOString()], 'dentro de 5 minutos: a mesma resposta, sem ler de novo');
    await C.ler(30); await C.ler(99999);
    assert.deepEqual([leituras, (await C.ler(366)).em_cache], [3, true], 'cada `dias` tem a sua; 99999 é 366');
    const recusa = await C.ler(60).then(() => null, (e) => e);
    assert.deepEqual([recusa && recusa.status, leituras, recusa && recusa.espere_seg > 0 && recusa.espere_seg <= 60], [429, 3, true], 'a quarta leitura NOVA no mesmo minuto é recusada (as do cache continuam respondendo)');
    assert.equal((await C.ler(7)).em_cache, true);
    relogio += 61000;
    assert.deepEqual([(await C.ler(60)).em_cache, leituras], [false, 4], 'passado o minuto, volta a ler');
    relogio += 300000;
    assert.deepEqual([(await C.ler(7)).gerado_em, leituras], ['g5', 5], 'vencidos os 5 minutos, lê de novo');
    // leitura que falha não fica guardada (nem trava o `dias`)
    let vez = 0;
    const F = D._int.novoCache({ leitor: async () => { if (!vez++) throw new Error('caiu'); return { dias: 7 }; }, porMinuto: 5 });
    assert.equal((await F.ler(7).then(() => 'ok', () => 'erro')), 'erro');
    assert.equal((await F.ler(7)).em_cache, false);
    // a rota usa o cache: a segunda chamada devolve a mesma leitura; e o 429 leva Retry-After
    D._int.limparCache();
    const chave = { headers: { 'x-publish-key': 'pk-test' } };
    const r1 = await req('GET', ROTA_DESP + '?dias=3', chave), r2 = await req('GET', ROTA_DESP + '?dias=3', chave);
    assert.deepEqual([r1.status, r1.json.em_cache, r2.json.em_cache, r2.json.gerado_em === r1.json.gerado_em], [200, false, true, true]);
    let ultima = null;
    for (let d = 100; d < 100 + 8; d++) { ultima = await req('GET', ROTA_DESP + '?dias=' + d, chave); if (ultima.status === 429) break; }
    assert.deepEqual([ultima.status, Number(ultima.headers['retry-after']) > 0, /Muitas leituras novas/.test(ultima.json.erro)], [429, true, true], 'quem repete `dias` diferentes em laço é barrado');
    assert.equal((await req('GET', ROTA_DESP + '?dias=3', chave)).status, 200, 'o que está no cache segue respondendo');
    D._int.limparCache();
    const fonte = fs.readFileSync(path.join(__dirname, 'nucleo', 'despesas-sistemas.js'), 'utf8');
    assert.ok(/await cederOLaco\(\);/.test(fonte) && /NÃO corta esses coletores/.test(fonte), 'entre os coletores o laço é devolvido; e o cabeçalho diz o que o prazo não faz');
  });

  await t('despesas-sistemas (C-15 e C-18): o Legal é lido SÓ para leitura (sem abrir o banco pelo módulo, sem migrar, sem deixar conexão aberta); e cada sistema DECLARA se usa IA', async () => {
    const D = require('./nucleo/despesas-sistemas');
    const L = require('./legal/db');
    const { DatabaseSync } = require('node:sqlite');
    // um escritório com banco "antigo": tem as tabelas, não tem a tabela de migrações — abrir pelo módulo o migraria
    const dir = L.dirDoTenant('audcescritorio');
    fs.mkdirSync(dir, { recursive: true });
    const arq = path.join(dir, 'legal.db');
    const novo = new DatabaseSync(arq);
    novo.exec(`CREATE TABLE ai_agent_runs (id TEXT PRIMARY KEY, modelo TEXT, input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, custo_centavos_usd INTEGER, quando TEXT);
      CREATE TABLE document_versions (id TEXT PRIMARY KEY, tamanho INTEGER);
      INSERT INTO ai_agent_runs VALUES ('r1', 'mock', 1000, 500, 0, 7, '${new Date().toISOString()}');
      INSERT INTO document_versions VALUES ('d1', 4096);`);
    novo.close();
    // … e um escritório cujo banco ainda não tem a tabela: fica de fora, com nota, sem derrubar os outros
    const dir2 = L.dirDoTenant('audcvazio');
    fs.mkdirSync(dir2, { recursive: true });
    const vazio = new DatabaseSync(path.join(dir2, 'legal.db')); vazio.exec('CREATE TABLE outra (x INTEGER);'); vazio.close();
    const legal = D.COLETORES.find(c => c.sistema === 'legal-saas');
    const antes = fs.statSync(arq).mtimeMs, comTenant = L.comTenant;
    const antigoErr = console.error; console.error = () => {};
    let usouOModulo = 0, r;
    L.comTenant = (...a) => { usouOModulo++; return comTenant(...a); };
    try { r = await D.resumo(7, { coletores: [legal] }); } finally { L.comTenant = comTenant; console.error = antigoErr; }
    const s = r.sistemas[0];
    assert.equal(usouOModulo, 0, 'a leitura não passa por legal/db.js › comTenant (que abriria, migraria e guardaria a conexão)');
    assert.ok(s.ia && s.ia.chamadas >= 1 && s.ia.custo_usd >= 0.07 && s.armazenamento.bytes >= 4096 && s.usa_ia === 'sim', JSON.stringify(s).slice(0, 300));
    assert.ok(s.notas.some(n => /^IA: 1 escritório\(s\) ficaram de fora/.test(n)) && s.notas.some(n => /^armazenamento: 1 escritório\(s\) ficaram de fora/.test(n)), s.notas.join(' | '));
    const conf = new DatabaseSync(arq, { readOnly: true });
    const tabelas = conf.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(x => x.name);
    conf.close();
    assert.deepEqual([tabelas, fs.statSync(arq).mtimeMs], [['ai_agent_runs', 'document_versions'], antes], 'nenhuma tabela criada, nenhuma migração rodada, arquivo intocado');
    fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(dir2, { recursive: true, force: true }); // conexão fechada: no Windows o arquivo aberto não sairia
    assert.ok(!fs.existsSync(arq), 'o banco foi FECHADO depois da leitura');

    // C-18 — o campo `usa_ia`, por sistema
    D._int.limparCache();
    const todos = await req('GET', ROTA_DESP, { headers: { 'x-publish-key': 'pk-test' } });
    const usa = Object.fromEntries(todos.json.sistemas.map(x => [x.sistema, x.usa_ia]));
    assert.deepEqual([usa.academy, usa.livraria, usa.vsm, usa.vitrine, usa.comunicados, usa['alta-vista'], usa.closet, usa.kids, usa.voz, usa.cozinhe],
      ['sim', 'nao', 'nao', 'nao', 'nao', 'nao', 'sim_sem_registro', 'sim_sem_registro', 'sim_sem_registro', ''], 'quem não usa, quem usa e não grava, e quem não se sabe (não medido) — sem depender de frase nas notas');
    assert.ok(todos.json.sistemas.every(x => ['sim', 'nao', 'sim_sem_registro', 'falha_de_leitura', ''].includes(x.usa_ia)));
    // sistema cuja leitura de IA FALHOU não vira "usa IA e não registra"
    const antigo2 = console.error; console.error = () => {};
    let q;
    try { q = await D.resumo(7, { coletores: [{ sistema: 'x', nome: 'X', coletar() { throw new Error('no such table: ai_runs'); } }, { sistema: 'novo', nome: 'Sistema novo', coletar: () => ({ armazenamento: { arquivos: 0, bytes: 0, no_r2: null, no_disco: null, fonte: 't' }, notas: [] }) }] }); }
    finally { console.error = antigo2; }
    assert.deepEqual(q.sistemas.map(x => x.usa_ia), ['falha_de_leitura', ''], 'falha de leitura é falha de leitura; sistema novo que não declarou fica em branco — o relatório não acusa por omissão');
    D._int.limparCache();
  });

  await t('despesas-sistemas: soma certo sobre linhas plantadas (IA e arquivos do Docs, uso da Eva) e respeita o período', async () => {
    const chave = { headers: { 'x-publish-key': 'pk-test' } };
    // (a rota guarda a resposta por 5 minutos e limita as leituras novas — auditoria C, C-06: este teste planta linhas
    // e lê de novo, então esvazia o cache a cada mudança, como faria o relógio)
    const limparCache = require('./nucleo/despesas-sistemas')._int.limparCache;
    limparCache();
    const antes = sis(await req('GET', ROTA_DESP + '?dias=30', chave), 'vdocs');
    const vdb = require('./vdocs/db').db;
    const iso = (diasAtras) => new Date(Date.now() - diasAtras * 864e5).toISOString();
    const run = vdb.prepare('INSERT INTO ai_runs (id, tenant_id, modelo, input_tokens, output_tokens, custo_centavos_usd, duracao_ms, status, detalhe, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)');
    // modelo "mock" = preço fixo de 3/15 por milhão (academy/ia.js): 1.000 de entrada + 500 de saída = US$ 0,0105
    run.run('desp-1', 'conta-a', 'mock', 1000, 500, 12, 0, 'ok', '', iso(1));
    run.run('desp-2', 'conta-b', 'mock', 1000, 500, 30, 0, 'ok', '', iso(2));
    run.run('desp-velha', 'conta-c', 'mock', 1000, 500, 999, 0, 'ok', '', iso(40));   // fora dos 30 dias
    vdb.prepare('INSERT INTO document_versions (id, tenant_id, document_id, numero, nome_arquivo, mime, tamanho, sha256, file_path, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run('desp-arq', 'conta-a', 'doc-1', 1, 'a.pdf', 'application/pdf', 1500, 'x', 'conta-a/x', iso(1));
    const dia = (diasAtras) => iso(diasAtras).slice(0, 10);
    fs.writeFileSync(path.join(DATA_DIR, 'eva-uso.json'), JSON.stringify({ porDia: {
      [dia(1)]: { in: 100, out: 50, msgs: 3, custoUSD: 0.0123 }, [dia(60)]: { in: 9, out: 9, msgs: 9, custoUSD: 9 } } }));

    // envios da central: 2 e-mails e 1 WhatsApp ao Musique dentro do período; o aviso no app e o pendente não contam
    const cdb = require('./comunicados/db').db;
    cdb.prepare("INSERT INTO comunicados (id, titulo, corpo, categoria, criado_em, atualizado_em) VALUES ('desp-com', 'Aviso', 'Corpo', 'novidade', ?, ?)").run(iso(1), iso(1));
    const ent = cdb.prepare("INSERT INTO entregas (comunicado_id, canal, chave, produto, usuario_ref, status, atualizado_em) VALUES ('desp-com', ?, ?, 'music', ?, ?, ?)");
    ent.run('email', 'k1', 'u1', 'enviado', iso(1)); ent.run('email', 'k2', 'u2', 'enviado', iso(2));
    ent.run('whatsapp', 'k3', 'u1', 'enviado', iso(1)); ent.run('whatsapp', 'k4', 'u2', 'pendente', iso(1));
    ent.run('app', 'k5', 'u1', 'lido', iso(1)); ent.run('email', 'k6', 'u3', 'enviado', iso(45));

    assert.equal((await req('GET', ROTA_DESP + '?dias=30', chave)).json.em_cache, true, 'sem esvaziar, a rota devolveria a leitura de antes das linhas plantadas');
    limparCache();
    const r30 = await req('GET', ROTA_DESP + '?dias=30', chave);
    assert.deepEqual([sis(r30, 'music').mensagens.email, sis(r30, 'music').mensagens.whatsapp], [2, 1], 'envios do Musique pela central');
    const v = sis(r30, 'vdocs');
    const perto = (a, b) => Math.abs(a - b) < 1e-9;
    assert.equal(v.ia.chamadas - antes.ia.chamadas, 2, 'duas chamadas dentro do período');
    assert.ok(perto(v.ia.custo_usd - antes.ia.custo_usd, 0.42), 'custo gravado: 12 + 30 centavos = US$ 0,42 (veio ' + v.ia.custo_usd + ')');
    assert.ok(perto(v.ia.custo_por_tokens_usd - antes.ia.custo_por_tokens_usd, 0.021), 'custo pelos tokens: 2 × 0,0105 (veio ' + v.ia.custo_por_tokens_usd + ')');
    assert.equal(v.ia.custo_estimado_por_tokens, false, 'o Docs grava o custo: não é estimativa');
    assert.equal(v.ia.usuarios - antes.ia.usuarios, 2, 'duas contas distintas');
    assert.equal(v.ia.bancado_pela_plataforma_usd, v.ia.custo_usd, 'IA incluída no plano: tudo bancado pela plataforma');
    assert.equal(v.armazenamento.bytes - antes.armazenamento.bytes, 1500);
    assert.equal(v.armazenamento.arquivos - antes.armazenamento.arquivos, 1);
    const h = sis(r30, 'hospede');
    assert.equal(h.ia.chamadas, 3); assert.equal(h.ia.custo_usd, 0.0123, 'a Eva de 60 dias atrás fica fora dos 30');
    assert.ok(perto(r30.json.total.ia_custo_usd, r30.json.sistemas.reduce((s, x) => s + ((x.ia && x.ia.custo_usd) || 0) + ((x.google && x.google.custo_usd) || 0), 0)), 'o total de IA tem de bater com a soma dos sistemas');
    // 60 dias: a linha velha do Docs entra (US$ 9,99 a mais)
    const v60 = sis(await req('GET', ROTA_DESP + '?dias=60', chave), 'vdocs');
    assert.ok(perto(v60.ia.custo_usd - v.ia.custo_usd, 9.99), 'com 60 dias a linha velha tem de entrar');
  });

  await t('despesas-sistemas: Origena (Postgres) — sem banco não é medida; com banco soma por família sem dado pessoal', async () => {
    const D = require('./nucleo/despesas-sistemas');
    const origena = D.COLETORES.find(c => c.sistema === 'origena');
    const sem = await D.resumo(7, { coletores: [origena], origena: { db: { configurado: () => false } } });
    assert.equal(sem.sistemas[0].medido, false); assert.ok(/não está configurado/.test(sem.sistemas[0].motivo));
    // banco e escopo de mentira: duas famílias; o que cada consulta devolve é decidido pelo texto dela
    const dados = {
      f1: { ledger: [{ provider: 'anthropic', model: 'mock', tokens_in: 1000, tokens_out: 200, custo_centavos: 30, creditos_cobrados: 10 }], n: 4, b: '1000', pn: 1, ps: '4990' },
      f2: { ledger: [{ provider: 'anthropic', model: 'mock', tokens_in: 1000, tokens_out: 200, custo_centavos: 30, creditos_cobrados: 10 },
        { provider: 'google', model: 'gemini-x', tokens_in: 700, tokens_out: 0, custo_centavos: 5, creditos_cobrados: 2 }], n: 1, b: '250', pn: 0, ps: '0' },
    };
    const falso = {
      db: { configurado: () => true, todas: async () => [{ id: 'f1' }, { id: 'f2' }] },
      tenancy: { comEscopo: async (id, fn) => fn({
        todas: async () => dados[id].ledger,
        uma: async (sql) => (/FROM orders/.test(sql) ? { n: dados[id].pn, s: dados[id].ps } : { n: dados[id].n, b: dados[id].b }),
      }) },
    };
    const o = (await D.resumo(7, { coletores: [origena], origena: falso })).sistemas[0];
    assert.equal(o.medido, true);
    assert.equal(o.ia.chamadas, 2); assert.equal(o.ia.usuarios, 2);
    assert.equal(o.ia.custo_usd, 0.012, '2 × (1.000 × 3 + 200 × 15) ÷ 1e6'); assert.equal(o.ia.custo_estimado_por_tokens, true);
    assert.equal(o.ia.custo_estimado_registrado_brl, 0.6); assert.equal(o.ia.creditos_cobrados, 20);
    assert.equal(o.google.chamadas, 1); assert.equal(o.google.custo_usd, null, 'sem tabela de preços do Google não há custo em dólar');
    assert.equal(o.google.tokens_entrada, 700);
    assert.deepEqual([o.armazenamento.arquivos, o.armazenamento.bytes, o.armazenamento.no_r2.bytes], [5, 1250, 1250]);
    assert.deepEqual([o.pagamentos.aprovados, o.pagamentos.bruto_brl, o.pagamentos.taxa_medida], [1, 49.9, false]);
    assert.ok(!/f1|f2/.test(JSON.stringify(o)), 'id de família não pode sair na resposta');
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
