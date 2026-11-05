// =====================================================================
// Livraria — suíte de testes.  npm run test:livraria
//
// Sobe o módulo real com auth de staff injetada e banco descartável.
//
// A Livraria era o ÚNICO produto que movimenta dinheiro e faz entrega
// irreversível sem nenhum teste — e, sem suíte, o portão de qualidade
// também não tinha o que rodar quando alguém mexia nela. O foco aqui é
// exatamente esses dois eixos:
//
//   DINHEIRO   — o valor pago tem de bater com o cobrado; webhook repetido
//                não pode pagar duas vezes; preço é centavo inteiro.
//   ENTREGA    — o PDF não volta depois de baixado. Então: só quem pagou
//                baixa, o link expira, o limite é respeitado, o token de um
//                pedido não serve para outro, e bloquear corta na hora.
// =====================================================================
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const express = require('express');

process.env.DATA_DIR = path.join(os.tmpdir(), 'livraria-selftest-' + process.pid + '-' + Date.now());
process.env.NODE_ENV = 'development';
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

// ---- staff falso: o Portal Staff administra a livraria ----
const STAFF = [
  { id: 'adm', nome: 'Admin', email: 'adm@t', papel: 'admin', ativo: true },
  { id: 'op', nome: 'Operador', email: 'op@t', papel: 'membro', ativo: true },
];
function requireAuth(req, res, next) {
  const u = STAFF.find((x) => x.id === (req.headers['x-test-user'] || 'adm'));
  if (!u) return res.status(401).json({ erro: 'x' });
  req.user = u; next();
}
const requireAdmin = (req, res, next) =>
  (req.user && req.user.papel === 'admin') ? next() : res.status(403).json({ erro: 'admin' });

const emailsEnviados = [];
const avisosDono = [];
const app = express();
app.use(express.json({ limit: '4mb' }));
require('./index').montar(app, {
  express, requireAuth, requireAdmin,
  lerUsuarios: () => [], salvarUsuarios: () => {},
  enviarEmail: async (to, ass, html) => { emailsEnviados.push({ to, ass, html }); return true; },
  alertaAugusto: async () => {},
});

const repo = require('./repo');
// O fluxo e uma fabrica (criarFluxo) e recebe as mesmas pecas que o index monta.
const urls = {
  biblioteca: (id) => 'http://teste/minha-biblioteca?p=' + id,
  obrigado: (id) => 'http://teste/obrigado?p=' + id,
  webhook: () => 'http://teste/livraria/webhooks/mercadopago',
  checkoutRetry: () => 'http://teste/livros',
  download: (t) => 'http://teste/download/' + t,
};
const fluxo = require('./fluxo').criarFluxo({
  repo,
  eventos: require('./eventos').criarEventos({ repo }),
  emails: require('./emails'),
  enviarEmail: async (to, ass) => { emailsEnviados.push({ to, ass }); return true; },
  enviarWhatsApp: async () => true,
  alertaAugusto: async (m) => { avisosDono.push(m); },
  urls,
});
const { PDF_DIR } = require('./db');

// ---- harness ----
let ok = 0; const falhas = [];
function teste(nome, fn) {
  try { fn(); ok++; console.log('  ✅', nome); }
  catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌', nome, '—', e.message); }
}
async function testeAsync(nome, fn) {
  try { await fn(); ok++; console.log('  ✅', nome); }
  catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌', nome, '—', e.message); }
}
let BASE = '';
async function req(metodo, caminho, corpo) {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'x-test-user': 'adm' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    redirect: 'manual',
  });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch (_) {}
  return { status: r.status, json, texto, headers: r.headers };
}

// ---- fixtura: um livro com PDF de verdade no disco ----
const PRECO_PDF = 4990;               // centavos — o schema é INTEGER em centavos
function semearLivro(titulo = 'Livro de Teste') {
  const b = repo.Books.criar({
    titulo, autor: 'Augusto Villela', preco_pdf: PRECO_PDF, ativo: 1,
    descricao_curta: 'x', categoria: 'teste',
  });
  fs.mkdirSync(PDF_DIR, { recursive: true });
  const nome = 'teste-' + b.id + '.pdf';
  const caminhoPdf = path.join(PDF_DIR, nome);
  fs.writeFileSync(caminhoPdf, '%PDF-1.4\n% conteudo de teste\n');
  // tamanho REAL do arquivo: a rota manda Content-Length a partir dele, e um
  // numero chutado deixa o cliente esperando o byte que nunca chega.
  const tamanho = fs.statSync(caminhoPdf).size;
  repo.Files.adicionar(b.id, { filename: nome, original_name: 'teste.pdf', mime: 'application/pdf', tamanho });
  return b;
}
const CLIENTE = {
  nome: 'Comprador Um', email: 'comprador@exemplo.test', estado: 'DF', cidade: 'Brasília',
  consentimentos: { termos: true },
  endereco: { cep: '71680-000', logradouro: 'SMDB 29', numero: '1', bairro: 'Lago Sul' },
};
const pedidoNovo = (book) => repo.Orders.criar({
  customer: CLIENTE, items: [{ book_id: book.id, tipo: 'pdf', quantidade: 1 }],
  origem: 'teste', endereco_entrega: CLIENTE.endereco,
});

(async () => {
  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  BASE = 'http://127.0.0.1:' + srv.address().port;
  console.log('\nLIVRARIA — selftest\n');

  console.log('dinheiro');

  await testeAsync('pedido nasce pendente e com o preço do livro, em centavos', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    assert.strictEqual(o.status, 'pendente');
    assert.strictEqual(Number(o.valor_total), PRECO_PDF, 'valor_total tem de ser centavo inteiro');
    assert.strictEqual(Number.isInteger(Number(o.valor_total)), true, 'nada de float em dinheiro');
  });

  await testeAsync('pagamento com o valor certo libera a entrega', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    const r = await fluxo.confirmarPagamento(o.id, {
      provider_payment_id: 'mp-ok-1', valor: PRECO_PDF, metodo: 'pix', raw: {} });
    assert.ok(r, 'devia ter confirmado');
    assert.strictEqual(r.status, 'pago');
    assert.strictEqual(r.entrega_digital, 'liberado');
  });

  console.log('aviso ao dono');

  await testeAsync('venda de impresso avisa UMA vez: livro, valor, comprador, endereço e o que fazer', async () => {
    const b = semearLivro();
    repo.Books.atualizar(b.id, { preco_impresso: 8990 });
    const o = repo.Orders.criar({
      customer: { ...CLIENTE, whatsapp: '5561999990000' },
      items: [{ book_id: b.id, tipo: 'impresso', quantidade: 2 }],
      origem: 'teste',
      endereco_entrega: { cep: '71680-000', logradouro: 'SMDB 29', numero: '1', complemento: 'Casa 2', bairro: 'Lago Sul' },
    });
    avisosDono.length = 0;
    await fluxo.confirmarPagamento(o.id, { provider_payment_id: 'mp-imp', valor: o.valor_total, metodo: 'pix', raw: {} });
    assert.strictEqual(avisosDono.length, 1, 'uma venda, um aviso: cada mensagem gasta cota do Make');
    const m = avisosDono[0];
    for (const trecho of [b.titulo, '(impresso)', '2x', 'R$', '(pix)', 'Comprador Um', '5561999990000',
      'comprador@exemplo.test', 'SMDB 29, 1', 'Casa 2', 'Lago Sul', 'Brasília/DF', 'CEP 71680-000', 'O QUE FAZER: Enviar']) {
      assert.ok(m.includes(trecho), 'faltou "' + trecho + '" em: ' + m);
    }
    assert.ok(!/undefined|null/.test(m), 'campo vazio vazou: ' + m);
    assert.ok(m.length <= 880, 'não cabe no modelo: ' + m.length);
  });

  await testeAsync('venda de PDF diz que não há nada a fazer e não fala em envio', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    avisosDono.length = 0;
    await fluxo.confirmarPagamento(o.id, { provider_payment_id: 'mp-pdf-aviso', valor: PRECO_PDF, raw: {} });
    assert.ok(/O QUE FAZER: Nada/.test(avisosDono[0]), avisosDono[0]);
    assert.ok(!avisosDono[0].includes('Entregar em'), 'PDF não tem remessa: ' + avisosDono[0]);
  });

  await testeAsync('impresso sem endereço manda pedir o endereço em vez de inventar', async () => {
    const b = semearLivro();
    repo.Books.atualizar(b.id, { preco_impresso: 8990 });
    const o = repo.Orders.criar({ customer: CLIENTE, items: [{ book_id: b.id, tipo: 'impresso', quantidade: 1 }], origem: 'teste', endereco_entrega: {} });
    avisosDono.length = 0;
    await fluxo.confirmarPagamento(o.id, { provider_payment_id: 'mp-sem-end', valor: o.valor_total, raw: {} });
    assert.ok(avisosDono[0].includes('Pedir o endereço'), avisosDono[0]);
  });

  await testeAsync('título enorme não corta o que fazer nem passa do limite do modelo', async () => {
    const { montarAviso, paraModelo } = require('../nucleo/aviso');
    const m = montarAviso({ titulo: 'T', campos: [['Livro', 'x'.repeat(2000)]], fazer: 'Enviar o livro' });
    assert.ok(m.length <= 880 && m.endsWith('O QUE FAZER: Enviar o livro'), m.slice(-40));
    assert.strictEqual(paraModelo('linha um\nlinha dois.'), 'linha um | linha dois');
  });

  await testeAsync('pagamento divergente avisa o dono: pagaram e o livro não foi entregue', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    avisosDono.length = 0;
    await fluxo.confirmarPagamento(o.id, { provider_payment_id: 'mp-div', valor: 100, raw: {} });
    assert.ok(avisosDono[0] && avisosDono[0].includes('DIVERGENTE') && avisosDono[0].includes('mp-div'), String(avisosDono[0]));
  });

  await testeAsync('pagamento com valor MENOR é recusado e nada é liberado', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    const r = await fluxo.confirmarPagamento(o.id, {
      provider_payment_id: 'mp-menor', valor: 100, metodo: 'pix', raw: {} });
    assert.strictEqual(r, null, 'valor divergente não pode confirmar');
    const depois = repo.Orders.obter(o.id);
    assert.strictEqual(depois.status, 'pendente', 'o pedido tem de continuar pendente');
    assert.notStrictEqual(depois.entrega_digital, 'liberado', 'a entrega do PDF é irreversível: não pode liberar');
  });

  await testeAsync('confirmar duas vezes não paga duas vezes (idempotente)', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    await fluxo.confirmarPagamento(o.id, { provider_payment_id: 'mp-idem', valor: PRECO_PDF, raw: {} });
    const segunda = await fluxo.confirmarPagamento(o.id, { provider_payment_id: 'mp-idem', valor: PRECO_PDF, raw: {} });
    assert.strictEqual(segunda.status, 'pago');
    const tokens = repo.Tokens.daOrder(o.id);
    assert.ok(tokens.length <= 1, 'não pode emitir um token de download por reenvio do webhook');
  });

  teste('webhook repetido é reconhecido pelo id do provedor', () => {
    const a = repo.Webhooks.registrar('mercadopago', 'evt-1', 'aprovado', {});
    const b = repo.Webhooks.registrar('mercadopago', 'evt-1', 'aprovado', {});
    assert.strictEqual(!!a.novo, true, 'o primeiro é novo');
    assert.strictEqual(!!b.novo, false, 'o reenvio NÃO pode ser novo');
  });

  console.log('\nentrega (o PDF não volta depois de baixado)');

  await testeAsync('quem pagou baixa, e o download conta', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    await fluxo.confirmarPagamento(o.id, { provider_payment_id: 'mp-dl', valor: PRECO_PDF, raw: {} });
    const tk = repo.Tokens.gerar(o.id, b.id, { horas: 72, max: 5 });
    const r = await req('GET', '/download/' + tk.id);
    assert.strictEqual(r.status, 200);
    assert.ok(String(r.headers.get('content-type') || '').includes('pdf'));
    assert.ok(String(r.headers.get('content-disposition') || '').includes('attachment'), 'tem de baixar, não abrir inline');
    assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(Number(repo.Tokens.obter(tk.id).download_count), 1, 'o contador tem de subir');
  });

  await testeAsync('link expirado não entrega', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    const tk = repo.Tokens.gerar(o.id, b.id, { horas: -1, max: 5 });   // já nasceu vencido
    const r = await req('GET', '/download/' + tk.id);
    assert.strictEqual(r.status, 403);
    assert.ok(/expirou/i.test(r.texto), 'a página tem de dizer que expirou');
  });

  await testeAsync('limite de downloads é respeitado', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    const tk = repo.Tokens.gerar(o.id, b.id, { horas: 72, max: 1 });
    assert.strictEqual((await req('GET', '/download/' + tk.id)).status, 200);
    const segunda = await req('GET', '/download/' + tk.id);
    assert.strictEqual(segunda.status, 403, 'passou do limite');
    assert.ok(/limite/i.test(segunda.texto));
  });

  await testeAsync('token bloqueado corta na hora', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    const tk = repo.Tokens.gerar(o.id, b.id, {});
    repo.Tokens.bloquear(tk.id, false);
    const r = await req('GET', '/download/' + tk.id);
    assert.strictEqual(r.status, 403);
  });

  await testeAsync('token inventado dá 404, e não vaza se o pedido existe', async () => {
    const r = await req('GET', '/download/naoexiste-' + Date.now());
    assert.strictEqual(r.status, 404);
    assert.ok(!/pedido|order/i.test(r.texto), 'a página de erro não pode falar de pedido');
  });

  await testeAsync('o token de um pedido não serve para o livro de outro', async () => {
    const b1 = semearLivro('Livro A'), b2 = semearLivro('Livro B');
    const o1 = pedidoNovo(b1), o2 = pedidoNovo(b2);
    const t1 = repo.Tokens.gerar(o1.id, b1.id, {});
    const t2 = repo.Tokens.gerar(o2.id, b2.id, {});
    assert.notStrictEqual(t1.id, t2.id, 'tokens têm de ser distintos');
    assert.strictEqual(repo.Tokens.obter(t1.id).book_id, b1.id);
    assert.strictEqual(repo.Tokens.obter(t2.id).book_id, b2.id, 'cada token está preso ao seu livro');
  });

  await testeAsync('todo acesso ao PDF fica registrado (ok e recusa)', async () => {
    const b = semearLivro();
    const o = pedidoNovo(b);
    const tk = repo.Tokens.gerar(o.id, b.id, { horas: 72, max: 1 });
    await req('GET', '/download/' + tk.id);      // ok
    await req('GET', '/download/' + tk.id);      // limite
    const { db } = require('./db');
    const n = db.prepare('SELECT COUNT(*) n FROM download_logs WHERE token_id = ?').get(tk.id).n;
    assert.ok(n >= 2, 'a entrega e a recusa têm de deixar rastro');
  });

  console.log('\nloja');

  await testeAsync('checkout recusa carrinho vazio e sem aceite dos termos', async () => {
    assert.strictEqual((await req('POST', '/livraria/api/checkout', { customer: CLIENTE, items: [] })).status, 400);
    const semTermos = { ...CLIENTE, consentimentos: {} };
    const b = semearLivro();
    const r = await req('POST', '/livraria/api/checkout', {
      customer: semTermos, items: [{ book_id: b.id, tipo: 'pdf', quantidade: 1 }],
      endereco_entrega: CLIENTE.endereco });
    assert.strictEqual(r.status, 400);
  });

  await testeAsync('páginas públicas da loja respondem', async () => {
    for (const p of ['/livros', '/termos-de-uso', '/politica-de-privacidade', '/politica-de-compra-e-entrega']) {
      assert.strictEqual((await req('GET', p)).status, 200, p + ' não respondeu');
    }
  });

  // =====================================================================
  // CONTA DO LEITOR — só código por e-mail (sem senha), painel, LGPD
  // =====================================================================
  console.log('\nconta do leitor');
  const { db: dbTeste } = require('./db');
  // cliente HTTP com jar de cookie (cada "navegador" é um jar)
  function navegador() {
    const jar = {};
    return async function (metodo, caminho, corpo) {
      const headers = { 'Content-Type': 'application/json' };
      const ck = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
      if (ck) headers.Cookie = ck;
      const r = await fetch(BASE + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined, redirect: 'manual' });
      for (const c of (r.headers.getSetCookie ? r.headers.getSetCookie() : [])) {
        const [par] = c.split(';'); const i = par.indexOf('=');
        const nome = par.slice(0, i), valor = par.slice(i + 1);
        if (!valor || /expires=Thu, 01 Jan 1970/i.test(c)) delete jar[nome]; else jar[nome] = valor;
      }
      const texto = await r.text(); let json = null; try { json = JSON.parse(texto); } catch (_) {}
      return { status: r.status, json, texto, headers: r.headers, temCookie: Object.keys(jar).length > 0 };
    };
  }
  const ultimoCodigo = (email) => {
    const m = [...emailsEnviados].reverse().find((e) => e.to === email && /Código de acesso/.test(e.html || ''));
    const k = m && /letter-spacing:8px[^>]*>(\d{6})</.exec(m.html);
    return k ? k[1] : null;
  };
  const zerarIntervalo = () => dbTeste.prepare("UPDATE conta_codigos SET criado_em = '2020-01-01T00:00:00.000Z'").run();
  // entra com código (pede → confere) e devolve o "navegador" já logado
  async function entrar(email) {
    zerarIntervalo();
    const n = navegador();
    await n('POST', C + '/codigo', { email });
    const r = await n('POST', C + '/entrar-codigo', { email, codigo: ultimoCodigo(email) });
    assert.strictEqual(r.status, 200, 'entrar: ' + r.texto);
    return n;
  }
  const C = '/livraria/api/conta';

  // comprador que JÁ existe como visitante (sem conta), com um pedido pago
  const livroC = semearLivro('Livro da Conta');
  const emailA = 'leitora.a@exemplo.test';
  const pedA = repo.Orders.criar({ customer: { ...CLIENTE, nome: 'Leitora A', email: emailA }, items: [{ book_id: livroC.id, tipo: 'pdf', quantidade: 1 }], origem: 'teste', endereco_entrega: CLIENTE.endereco });
  await fluxo.confirmarPagamento(pedA.id, { provider_payment_id: 'mp-conta-a', valor: PRECO_PDF, raw: { payer: 'dado-pessoal' } });

  await testeAsync('criar conta recusa nome curto, e-mail inválido e falta de aceite', async () => {
    const n = navegador();
    assert.strictEqual((await n('POST', C + '/cadastro', { nome: 'A', email: emailA, aceite: true })).status, 400);
    assert.strictEqual((await n('POST', C + '/cadastro', { nome: 'Leitora A', email: 'sem-arroba', aceite: true })).status, 400);
    assert.strictEqual((await n('POST', C + '/cadastro', { nome: 'Leitora A', email: emailA, aceite: false })).status, 400);
  });

  await testeAsync('SEM o código nada se abre: nem sessão, nem pedidos (e-mail alheio)', async () => {
    const n = navegador();
    assert.strictEqual((await n('POST', C + '/cadastro', { nome: 'Intrusa', email: emailA, aceite: true })).status, 200);
    assert.ok(ultimoCodigo(emailA), 'o código tem de ir para o e-mail');
    assert.strictEqual((await n('GET', C + '/eu')).status, 401);
    assert.strictEqual((await n('POST', C + '/entrar-codigo', { email: emailA, codigo: '123456' })).status, 400);
    assert.strictEqual(dbTeste.prepare('SELECT email_verificado v FROM customers WHERE email = ?').get(emailA).v, 0, 'e-mail só fica verificado com o código');
  });

  await testeAsync('código errado é recusado e, após 5 erros, o código se perde', async () => {
    const n = navegador();
    const certo = ultimoCodigo(emailA);
    const errado = certo === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) assert.strictEqual((await n('POST', C + '/cadastro/confirmar', { email: emailA, codigo: errado })).status, 400);
    assert.strictEqual((await n('POST', C + '/cadastro/confirmar', { email: emailA, codigo: certo })).status, 400, 'após 5 erros nem o código certo vale');
  });

  const A = navegador();
  await testeAsync('criar conta → código → sessão aberta, e o pedido do visitante aparece', async () => {
    zerarIntervalo();
    assert.strictEqual((await A('POST', C + '/cadastro', { nome: 'Leitora A', email: emailA, aceite: true, marketing: true })).status, 200);
    const r = await A('POST', C + '/cadastro/confirmar', { email: emailA, codigo: ultimoCodigo(emailA) });
    assert.strictEqual(r.status, 200, r.texto);
    assert.ok(r.temCookie, 'tem de abrir sessão');
    assert.ok(/HttpOnly/i.test((r.headers.getSetCookie() || []).join(';')), 'cookie de sessão precisa ser HttpOnly');
    const eu = await A('GET', C + '/eu');
    assert.strictEqual(eu.status, 200);
    assert.strictEqual(eu.json.perfil.email, emailA);
    assert.strictEqual(eu.json.perfil.nome, 'Leitora A', 'quem já era cliente mantém o nome');
    assert.strictEqual(eu.json.perfil.marketing, true);
    assert.strictEqual(eu.json.pedidos.length, 1, 'o pedido feito como visitante aparece na conta');
    assert.ok(eu.json.pedidos[0].itens[0].download, 'pedido pago mostra o link de download');
    assert.ok(!/senha|\$2[aby]\$/i.test(eu.texto), 'nada de senha ou hash na resposta');
  });

  await testeAsync('o mesmo código não serve duas vezes', async () => {
    assert.strictEqual((await navegador()('POST', C + '/cadastro/confirmar', { email: emailA, codigo: ultimoCodigo(emailA) })).status, 400);
  });

  await testeAsync('entrar: todo e-mail válido recebe código (não revela quem é cliente); com o código entra', async () => {
    const n = navegador();
    const antes = emailsEnviados.length;
    const novo = await n('POST', C + '/codigo', { email: 'fantasma@exemplo.test' });
    assert.strictEqual(novo.status, 200);
    assert.strictEqual(emailsEnviados.length, antes + 1, 'e-mail sem compra também recebe o código');
    zerarIntervalo();
    const real = await n('POST', C + '/codigo', { email: emailA });
    assert.strictEqual(real.json.mensagem, novo.json.mensagem, 'mesma resposta nos dois casos');
    const r = await n('POST', C + '/entrar-codigo', { email: emailA.toUpperCase(), codigo: ultimoCodigo(emailA) });
    assert.strictEqual(r.status, 200); assert.ok(r.temCookie);
  });

  await testeAsync('e-mail NOVO que só entra com o código ganha a conta (sem compra, nome vazio)', async () => {
    const email = 'primeira.vez@exemplo.test';
    assert.strictEqual(dbTeste.prepare('SELECT COUNT(*) n FROM customers WHERE email = ?').get(email).n, 0);
    const n = await entrar(email);
    const eu = await n('GET', C + '/eu');
    assert.strictEqual(eu.status, 200);
    assert.strictEqual(eu.json.perfil.email, email);
    assert.strictEqual(eu.json.pedidos.length, 0);
    const c = dbTeste.prepare('SELECT * FROM customers WHERE email = ?').get(email);
    assert.strictEqual(c.email_verificado, 1);
    assert.ok(JSON.parse(c.consentimentos).termos, 'registra o aceite dos termos');
    assert.strictEqual((await n('PATCH', C + '/eu', { nome: 'Primeira Vez' })).json.perfil.nome, 'Primeira Vez');
  });

  await testeAsync('comprador que nunca criou conta entra só com o código do e-mail da compra', async () => {
    const emailB = 'leitor.b@exemplo.test';
    const livro = semearLivro('Livro B');
    repo.Orders.criar({ customer: { ...CLIENTE, nome: 'Leitor B', email: emailB }, items: [{ book_id: livro.id, tipo: 'pdf', quantidade: 1 }], origem: 'teste', endereco_entrega: CLIENTE.endereco });
    const n = await entrar(emailB);
    const eu = await n('GET', C + '/eu');
    assert.strictEqual(eu.json.perfil.email, emailB);
    assert.strictEqual(eu.json.pedidos.length, 1);
  });

  await testeAsync('não existe rota de senha: o caminho antigo responde 404', async () => {
    const n = navegador();
    for (const rota of ['/entrar', '/senha/trocar', '/senha/redefinir']) {
      assert.strictEqual((await n('POST', C + rota, { email: emailA, senha: 'x' })).status, 404, rota + ' não deveria existir');
    }
  });

  const L = await entrar(emailA);

  await testeAsync('sair de todos os aparelhos derruba as outras sessões e esta', async () => {
    const outro = await entrar(emailA);
    const L2 = await entrar(emailA);
    assert.strictEqual((await outro('GET', C + '/eu')).status, 200);
    assert.strictEqual((await L2('POST', C + '/sair-todos')).status, 200);
    assert.strictEqual((await outro('GET', C + '/eu')).status, 401);
    assert.strictEqual((await L2('GET', C + '/eu')).status, 401);
    assert.strictEqual((await L('GET', C + '/eu')).status, 401, 'a sessão L também caiu');
  });

  const L3 = await entrar(emailA);

  await testeAsync('editar dados: nome, endereço e consentimento; CPF inválido recusado', async () => {
    assert.strictEqual((await L3('PATCH', C + '/eu', { doc: '123' })).status, 400);
    assert.strictEqual((await L3('PATCH', C + '/eu', { nome: 'A' })).status, 400);
    const r = await L3('PATCH', C + '/eu', { nome: 'Leitora Atualizada', whatsapp: '61999990000', cidade: 'Brasília', endereco: { cep: '70000-000', logradouro: 'Rua X', numero: '5', bairro: 'Centro', lixo: 'ignorado' }, marketing: false });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.perfil.nome, 'Leitora Atualizada');
    assert.strictEqual(r.json.perfil.marketing, false);
    assert.strictEqual(r.json.perfil.endereco.logradouro, 'Rua X');
    assert.strictEqual(r.json.perfil.endereco.lixo, undefined, 'só os campos conhecidos do endereço');
  });

  await testeAsync('compra como visitante com o e-mail de uma conta NÃO sobrescreve o perfil', async () => {
    repo.Customers.upsert({ nome: 'Vândalo', email: emailA, whatsapp: '000', cidade: 'Outra' });
    const eu = await L3('GET', C + '/eu');
    assert.strictEqual(eu.json.perfil.nome, 'Leitora Atualizada');
    assert.strictEqual(eu.json.perfil.cidade, 'Brasília');
  });

  await testeAsync('trocar o e-mail: código no e-mail NOVO, aviso no ANTIGO, outros aparelhos saem', async () => {
    const novo = 'leitora.a.nova@exemplo.test';
    const outro = await entrar(emailA);
    zerarIntervalo();
    assert.strictEqual((await L3('POST', C + '/email/pedir', { novo_email: 'sem-arroba' })).status, 400);
    assert.strictEqual((await L3('POST', C + '/email/pedir', { novo_email: novo })).status, 200);
    const cod = ultimoCodigo(novo);
    assert.ok(cod, 'código enviado ao e-mail NOVO');
    assert.strictEqual((await navegador()('POST', C + '/email/confirmar', { novo_email: novo, codigo: cod })).status, 401, 'outra pessoa não confirma');
    assert.strictEqual((await L3('POST', C + '/email/confirmar', { novo_email: novo, codigo: cod })).status, 200);
    assert.strictEqual((await L3('GET', C + '/eu')).json.perfil.email, novo);
    assert.strictEqual((await outro('GET', C + '/eu')).status, 401, 'outros aparelhos saem');
    assert.ok(emailsEnviados.some((e) => e.to === emailA && /foi alterado/.test(e.ass)), 'o e-mail antigo é avisado');
    assert.ok(await entrar(novo), 'entra com o e-mail novo');
  });

  await testeAsync('novo link: gera se venceu; não gera de pedido alheio, de pedido bloqueado, nem se já há um válido', async () => {
    const eu0 = await L3('GET', C + '/eu');
    const pid = eu0.json.pedidos[0].id;
    assert.strictEqual((await L3('POST', C + '/pedidos/' + pid + '/novo-link')).json.gerados, 0, 'já existe link válido');
    dbTeste.prepare("UPDATE download_tokens SET expires_at = '2020-01-01T00:00:00.000Z' WHERE order_id = ?").run(pid);
    const eu1 = await L3('GET', C + '/eu');
    assert.ok(eu1.json.pedidos[0].itens[0].novo_link, 'painel oferece gerar novo link');
    const r = await L3('POST', C + '/pedidos/' + pid + '/novo-link');
    assert.strictEqual(r.json.gerados, 1);
    assert.ok(r.json.pedidos[0].itens[0].download, 'volta com link válido');
    const livro = semearLivro('Alheio');
    const alheio = repo.Orders.criar({ customer: { ...CLIENTE, nome: 'Outro', email: 'outro@exemplo.test' }, items: [{ book_id: livro.id, tipo: 'pdf', quantidade: 1 }], origem: 'teste', endereco_entrega: CLIENTE.endereco });
    assert.strictEqual((await L3('POST', C + '/pedidos/' + alheio.id + '/novo-link')).status, 404);
    repo.Tokens.bloquearOrder(pid, false);
    dbTeste.prepare("UPDATE download_tokens SET expires_at = '2020-01-01T00:00:00.000Z' WHERE order_id = ?").run(pid);
    assert.strictEqual((await L3('POST', C + '/pedidos/' + pid + '/novo-link')).status, 409);
    repo.Tokens.bloquearOrder(pid, true);
  });

  await testeAsync('LGPD: exportação traz os dados e nunca segredo', async () => {
    const r = await L3('GET', C + '/dados');
    assert.strictEqual(r.status, 200);
    assert.ok(/attachment/.test(r.headers.get('content-disposition')));
    assert.ok(r.json.cadastro.email && r.json.pedidos.length === 1);
    assert.ok(!/senha_hash|\$2[aby]\$/.test(r.texto));
  });

  await testeAsync('o Portal Staff não recebe a coluna de senha', async () => {
    const r = await req('GET', '/staff/api/livraria/clientes');
    assert.strictEqual(r.status, 200);
    assert.ok(r.json.clientes.length > 0);
    assert.ok(!/senha_hash/.test(r.texto), 'lista de clientes vazou a coluna');
  });

  await testeAsync('escrita só aceita JSON da própria origem (defesa de CSRF)', async () => {
    const r1 = await fetch(BASE + C + '/sair', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    assert.strictEqual(r1.status, 415);
    const r2 = await fetch(BASE + C + '/sair', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://site-malicioso.test' }, body: '{}' });
    assert.strictEqual(r2.status, 403);
  });

  await testeAsync('excluir: exige código + EXCLUIR; recusa com impresso em produção; depois anonimiza', async () => {
    const novoEmail = 'leitora.a.nova@exemplo.test';
    const X = await entrar(novoEmail);
    const livroI = semearLivro('Impresso da Conta');
    dbTeste.prepare('UPDATE books SET preco_impresso = 5000 WHERE id = ?').run(livroI.id);
    const oImp = repo.Orders.criar({ customer: { ...CLIENTE, nome: 'x', email: novoEmail }, items: [{ book_id: livroI.id, tipo: 'impresso', quantidade: 1 }], origem: 'teste', endereco_entrega: CLIENTE.endereco });
    await fluxo.confirmarPagamento(oImp.id, { provider_payment_id: 'mp-imp-conta', valor: oImp.valor_total, raw: {} });
    zerarIntervalo();
    assert.strictEqual((await X('POST', C + '/excluir/pedir')).status, 200);
    assert.strictEqual((await X('POST', C + '/excluir', { codigo: ultimoCodigo(novoEmail), confirmacao: 'talvez' })).status, 400, 'exige digitar EXCLUIR');
    const bloqueio = await X('POST', C + '/excluir', { codigo: ultimoCodigo(novoEmail), confirmacao: 'EXCLUIR' });
    assert.strictEqual(bloqueio.status, 409, 'impresso em produção impede: ' + bloqueio.texto);
    assert.strictEqual((await X('GET', C + '/eu')).status, 200, 'a conta continua');
    // impresso entregue → pode excluir (o código do pedido anterior ainda vale: o impedimento é conferido antes dele)
    dbTeste.prepare("UPDATE print_jobs SET status = 'entregue'").run();
    const ok = await X('POST', C + '/excluir', { codigo: ultimoCodigo(novoEmail), confirmacao: 'excluir' });
    assert.strictEqual(ok.status, 200, ok.texto);
    assert.strictEqual((await X('GET', C + '/eu')).status, 401, 'sessão encerrada');
    zerarIntervalo();
    // o e-mail da conta excluída fica livre: quem entrar de novo ganha uma conta NOVA, sem os pedidos antigos
    const recomeco = await entrar(novoEmail);
    const eu2 = await recomeco('GET', C + '/eu');
    assert.strictEqual(eu2.json.pedidos.length, 0, 'a conta nova não herda os pedidos da excluída');
    assert.notStrictEqual(dbTeste.prepare('SELECT id FROM customers WHERE email = ?').get(novoEmail).id, oImp.customer_id);
    const cli = dbTeste.prepare('SELECT * FROM customers WHERE id = ?').get(oImp.customer_id);
    assert.ok(cli.excluido_em); assert.strictEqual(cli.nome, 'Conta excluída');
    assert.ok(!cli.email.includes('exemplo') && cli.whatsapp === '' && cli.doc === '' && cli.senha_hash === null);
    assert.strictEqual(dbTeste.prepare('SELECT COUNT(*) n FROM orders WHERE customer_id = ?').get(cli.id).n >= 2, true, 'os pedidos pagos permanecem');
    assert.strictEqual(dbTeste.prepare('SELECT endereco_entrega FROM orders WHERE id = ?').get(oImp.id).endereco_entrega, '{}', 'endereço de entrega apagado');
    assert.strictEqual(dbTeste.prepare('SELECT COUNT(*) n FROM download_tokens WHERE ativo = 1 AND order_id IN (SELECT id FROM orders WHERE customer_id = ?)').get(cli.id).n, 0, 'links desativados');
  });

  await testeAsync('/minha-conta responde, é noindex e a conta aparece no menu da loja', async () => {
    const p = await fetch(BASE + '/minha-conta'); const t = await p.text();
    assert.strictEqual(p.status, 200); assert.ok(/noindex/.test(t));
    assert.strictEqual((await fetch(BASE + '/minha-conta/app.js')).status, 200);
    assert.ok(/href="\/minha-conta"/.test(await (await fetch(BASE + '/livros')).text()));
  });

  console.log(`\n${ok} teste(s) OK, ${falhas.length} falha(s).`);
  srv.close();
  try { fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); } catch (_) {}
  if (falhas.length) { falhas.forEach((f) => console.log('  ✗', f)); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('FALHA GERAL:', e); process.exit(1); });
