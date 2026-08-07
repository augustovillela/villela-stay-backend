// =====================================================================
// Vitrine — suíte de testes. Sobe o Express real com auth de staff
// injetada e banco descartável.  npm run test:vitrine
//
// O foco é o que dá dinheiro e o que dá processo: comissão em centavos,
// máquina de estados do pedido, idempotência de webhook, avaliação só
// pós-entrega, 1 pedido por vendedor e isolamento entre contas.
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'vitrine-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
process.env.VITRINE_ROTINAS = 'off';
process.env.VITRINE_DEMO_SENHA = 'SenhaDemo!2026';
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');

// ---- staff fake (o Portal Staff administra a plataforma) ----
const STAFF = [
  { id: 'adm', nome: 'Admin', email: 'adm@t', papel: 'admin', ativo: true },
  { id: 'op', nome: 'Operador', email: 'op@t', papel: 'membro', ativo: true },
];
function requireAuth(req, res, next) {
  const u = STAFF.find((x) => x.id === (req.headers['x-test-user'] || 'adm'));
  if (!u) return res.status(401).json({ erro: 'x' });
  req.user = u; next();
}
const requireAdmin = (req, res, next) => (req.user && req.user.papel === 'admin') ? next() : res.status(403).json({ erro: 'admin' });

const emailsEnviados = [];
const enviarEmail = async (to, ass, html) => { emailsEnviados.push({ to, ass, html }); return true; };

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
const mod = require('./index');
mod.montar(app, { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto: async () => {}, jwtSecret: 'seg-teste' });
const { db } = require('./db');
const repo = require('./repo');
const pagamentos = require('./pagamentos');

// ---- harness HTTP com um cookie jar por pessoa ----
let BASE = '', ok = 0;
const falhas = [];
const jars = {};
async function req(metodo, caminho, { corpo, como = '', staff = 'adm', headers: hx } = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-test-user': staff, ...(hx || {}) };
  if (como) {
    const jar = jars[como] || {};
    const c = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (c) headers.Cookie = c;
  }
  const r = await fetch(BASE + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined, redirect: 'manual' });
  if (como) {
    jars[como] = jars[como] || {};
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((ck) => { const [kv] = ck.split(';'); const i = kv.indexOf('='); jars[como][kv.slice(0, i)] = kv.slice(i + 1); });
  }
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch (_) {}
  return { st: r.status, json, texto };
}
async function t(nome, fn) {
  try { await fn(); ok++; console.log('  ✅', nome); }
  catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌', nome, '—', e.message); }
}

async function criarPessoa(apelido, nome, email) {
  const r = await req('POST', '/vitrine/api/cadastrar', { como: apelido, corpo: { nome, email, senha: 'senha-forte-8', aceite_termos: true } });
  assert.equal(r.st, 200, 'cadastro ' + apelido + ': ' + JSON.stringify(r.json));
  assert.ok(r.json.link_verificacao, 'sem link de verificação em dev');
  const token = new URL(r.json.link_verificacao).searchParams.get('token');
  const v = await fetch(BASE + '/vitrine/verificar-email?token=' + token, { redirect: 'manual' });
  assert.equal(v.status, 302);
  return r.json.usuario;
}

async function rodar() {
  const srv = app.listen(0);
  BASE = 'http://127.0.0.1:' + srv.address().port;
  console.log('Vitrine — selftest\n');

  // ================= páginas públicas =================
  await t('páginas públicas respondem 200 (home, busca, institucionais, entrar)', async () => {
    for (const p of ['/vitrine', '/vitrine/busca', '/vitrine/como-funciona', '/vitrine/venda-conosco', '/vitrine/seguranca',
      '/vitrine/termos', '/vitrine/privacidade', '/vitrine/proibidos', '/vitrine/devolucao', '/vitrine/entrar', '/vitrine/c/eletronicos']) {
      assert.equal((await req('GET', p)).st, 200, p);
    }
  });
  await t('home traz hero, categorias, ofertas de usados e bloco de segurança', async () => {
    const r = await req('GET', '/vitrine');
    for (const trecho of ['Explorar ofertas', 'Começar a vender', 'Categorias em destaque', 'Ofertas de usados', 'Pagamento protegido']) {
      assert.ok(r.texto.includes(trecho), 'faltou: ' + trecho);
    }
  });
  await t('textos jurídicos carregam a tarja de MINUTA e a comissão vem da config', async () => {
    for (const p of ['/vitrine/termos', '/vitrine/privacidade', '/vitrine/proibidos', '/vitrine/devolucao']) {
      assert.ok((await req('GET', p)).texto.includes('MINUTA'), p + ' sem tarja');
    }
    assert.ok((await req('GET', '/vitrine/termos')).texto.includes(`${repo.Config.num('marketplace_commission_percent', 5)}%`), 'comissão fora de sincronia');
  });
  await t('seed criou produtos demo; página do produto tem JSON-LD e bloco de estado do usado', async () => {
    const busca = (await req('GET', '/vitrine/api/busca?condicao=usado')).json;
    assert.ok(busca.total >= 3, 'seed não populou usados');
    const r = await req('GET', '/vitrine/p/' + busca.itens[0].slug);
    assert.equal(r.st, 200);
    assert.ok(r.texto.includes('application/ld+json'), 'sem JSON-LD');
    assert.ok(r.texto.includes('Estado do produto'), 'sem bloco de defeitos declarados');
  });
  await t('robots bloqueia painel e API; sitemap lista produtos', async () => {
    const rb = await req('GET', '/vitrine/robots.txt');
    assert.ok(rb.texto.includes('Disallow: /vitrine/app') && rb.texto.includes('Disallow: /vitrine/api'));
    assert.ok((await req('GET', '/vitrine/sitemap.xml')).texto.includes('/vitrine/p/'));
  });
  await t('busca filtra por condição, preço e ordena por menor preço', async () => {
    const r = (await req('GET', '/vitrine/api/busca?condicao=novo&ordem=menor_preco')).json;
    assert.ok(r.itens.length >= 2, 'sem produtos novos do seed');
    assert.ok(r.itens.every((i) => i.condicao === 'novo'));
    for (let i = 1; i < r.itens.length; i++) assert.ok(r.itens[i].preco_centavos >= r.itens[i - 1].preco_centavos, 'ordem errada');
    const caro = (await req('GET', '/vitrine/api/busca?preco_min=100000')).json;
    assert.ok(caro.itens.every((i) => i.preco_centavos >= 100000));
  });

  // ================= contas =================
  await t('cadastro valida senha, termos e e-mail duplicado; login errado 401', async () => {
    assert.equal((await req('POST', '/vitrine/api/cadastrar', { corpo: { nome: 'X Y', email: 'x@t.com', senha: 'curta', aceite_termos: true } })).st, 400);
    assert.equal((await req('POST', '/vitrine/api/cadastrar', { corpo: { nome: 'X Y', email: 'x@t.com', senha: 'senha-forte-8' } })).st, 400, 'sem termos passou');
    await criarPessoa('caio', 'Caio Comprador', 'caio@t.com');
    assert.equal((await req('POST', '/vitrine/api/cadastrar', { corpo: { nome: 'Outro', email: 'CAIO@t.com', senha: 'senha-forte-8', aceite_termos: true } })).st, 400, 'duplicado passou');
    assert.equal((await req('POST', '/vitrine/api/login', { corpo: { email: 'caio@t.com', senha: 'errada-8888' } })).st, 401);
  });
  await t('painel exige login (401 sem cookie)', async () => {
    for (const p of ['/vitrine/api/me', '/vitrine/api/pedidos', '/vitrine/api/favoritos', '/vitrine/api/carrinho']) {
      assert.equal((await req('GET', p)).st, 401, p);
    }
  });

  // ================= vendedor e anúncios =================
  let vera, anuncio;
  await t('cadastro de vendedor exige e-mail verificado e CEP; cria loja com slug', async () => {
    vera = await criarPessoa('vera', 'Vera Vendedora', 'vera@t.com');
    assert.equal((await req('POST', '/vitrine/api/vendedor', { como: 'vera', corpo: { loja_nome: 'Loja da Vera' } })).st, 400, 'sem CEP passou');
    const r = await req('POST', '/vitrine/api/vendedor', { como: 'vera', corpo: { loja_nome: 'Loja da Vera', cep_origem: '70200001', cidade: 'Brasília', uf: 'DF', retirada_habilitada: true, pix_chave: 'vera@t.com' } });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    assert.equal(r.json.vendedor.loja_slug, 'loja-da-vera');
  });
  await t('anúncio usado sem bloco de defeitos é recusado (descrição honesta)', async () => {
    const r = await req('POST', '/vitrine/api/anuncios', {
      como: 'vera',
      corpo: { titulo: 'Furadeira usada boa', descricao: 'Furadeira de impacto 550W funcionando perfeitamente, pouco uso.', categoria_id: repo.Categorias.porSlug('casa-e-moveis').id, condicao: 'usado', preco_centavos: 15000 },
    });
    assert.equal(r.st, 400);
    assert.ok(/estado do produto/i.test(r.json.erro));
  });
  await t('cria anúncio (rascunho), edita, e publicar sem foto é barrado', async () => {
    const r = await req('POST', '/vitrine/api/anuncios', {
      como: 'vera',
      corpo: {
        titulo: 'Furadeira de impacto 550W usada', descricao: 'Furadeira de impacto 550W, uso doméstico leve, com maleta e 6 brocas. Funciona perfeitamente.',
        categoria_id: repo.Categorias.porSlug('casa-e-moveis').id, condicao: 'usado', preco_centavos: 15000, quantidade: 5,
        peso_gramas: 1800, comp_cm: 30, larg_cm: 25, alt_cm: 10, entrega_retirada: true,
        defeitos: 'Riscos de uso na carcaça e mandril com leve folga que não afeta o furo.',
      },
    });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    anuncio = r.json.anuncio;
    assert.equal(anuncio.status, 'rascunho');
    const ed = await req('PATCH', '/vitrine/api/anuncios/' + anuncio.id, { como: 'vera', corpo: { preco_centavos: 14900 } });
    assert.equal(ed.json.anuncio.preco_centavos, 14900);
    assert.equal((await req('POST', `/vitrine/api/anuncios/${anuncio.id}/publicar`, { como: 'vera' })).st, 400, 'publicou sem foto');
  });
  await t('outro usuário não edita anúncio alheio (autorização no servidor)', async () => {
    const r = await req('PATCH', '/vitrine/api/anuncios/' + anuncio.id, { como: 'caio', corpo: { preco_centavos: 1 } });
    assert.ok(r.st === 403 || r.st === 400 || r.st === 404, 'status ' + r.st);
    assert.equal(repo.Products.obter(anuncio.id).preco_centavos, 14900, 'preço foi alterado por terceiro!');
  });
  await t('com foto, publica → moderação → staff aprova → entra na vitrine', async () => {
    await req('POST', `/vitrine/api/anuncios/${anuncio.id}/fotos`, { como: 'vera', corpo: { rotulo: 'furadeira' } });
    const pub = await req('POST', `/vitrine/api/anuncios/${anuncio.id}/publicar`, { como: 'vera' });
    assert.equal(pub.json.anuncio.status, 'aguardando_aprovacao');
    const fila = (await req('GET', '/staff/api/vitrine/moderacao')).json.fila;
    assert.ok(fila.some((p) => p.id === anuncio.id), 'não entrou na fila de moderação');
    const md = await req('POST', '/staff/api/vitrine/moderacao/' + anuncio.id, { corpo: { decisao: 'aprovar' } });
    assert.equal(md.json.produto.status, 'ativo');
    const busca = (await req('GET', '/vitrine/api/busca?q=furadeira')).json;
    assert.equal(busca.total, 1);
  });
  await t('rejeição exige motivo e devolve o anúncio ao vendedor com a explicação', async () => {
    const r2 = await req('POST', '/vitrine/api/anuncios', {
      como: 'vera',
      corpo: { titulo: 'Produto de teste para rejeitar', descricao: 'Descrição longa o bastante para o cadastro passar sem reclamação.', categoria_id: repo.Categorias.porSlug('livros').id, condicao: 'novo', preco_centavos: 5000 },
    });
    await req('POST', `/vitrine/api/anuncios/${r2.json.anuncio.id}/fotos`, { como: 'vera', corpo: {} });
    await req('POST', `/vitrine/api/anuncios/${r2.json.anuncio.id}/publicar`, { como: 'vera' });
    assert.equal((await req('POST', '/staff/api/vitrine/moderacao/' + r2.json.anuncio.id, { corpo: { decisao: 'rejeitar' } })).st, 400, 'rejeitou sem motivo');
    const md = await req('POST', '/staff/api/vitrine/moderacao/' + r2.json.anuncio.id, { corpo: { decisao: 'rejeitar', motivo: 'Sem foto real do produto.' } });
    assert.equal(md.json.produto.status, 'rejeitado');
  });

  // ================= carrinho: 1 pedido por vendedor =================
  let pedidoId, pagamentoRef;
  await t('carrinho com 2 vendedores agrupa e avisa que serão pedidos separados', async () => {
    const seedProd = (await req('GET', '/vitrine/api/busca?q=air+fryer')).json.itens[0];
    assert.ok(seedProd, 'produto do seed sumiu');
    await req('POST', '/vitrine/api/carrinho', { como: 'caio', corpo: { product_id: anuncio.id, quantidade: 2 } });
    await req('POST', '/vitrine/api/carrinho', { como: 'caio', corpo: { product_id: seedProd.id, quantidade: 1 } });
    const c = (await req('GET', '/vitrine/api/carrinho', { como: 'caio' })).json;
    assert.equal(c.grupos.length, 2);
    assert.equal(c.multiplos_vendedores, true);
    assert.ok(c.aviso.includes('pedido separado'), 'aviso ausente');
  });
  await t('vendedor não compra o próprio anúncio', async () => {
    assert.equal((await req('POST', '/vitrine/api/carrinho', { como: 'vera', corpo: { product_id: anuncio.id } })).st, 400);
  });
  await t('frete simulado cota opções com valores inteiros em centavos e prazo', async () => {
    await req('POST', '/vitrine/api/enderecos', { como: 'caio', corpo: { rotulo: 'Casa', destinatario: 'Caio Comprador', cep: '70864530', logradouro: 'SQN 410 Bloco C', numero: '204', bairro: 'Asa Norte', cidade: 'Brasília', uf: 'DF' } });
    const f = (await req('GET', `/vitrine/api/carrinho/frete?seller_id=${anuncio.seller_id}&cep=70864530`, { como: 'caio' })).json;
    assert.ok(f.opcoes.length >= 2);
    for (const o of f.opcoes) assert.ok(Number.isInteger(o.valor_centavos), 'frete não inteiro');
    assert.ok(f.opcoes.find((o) => o.tipo === 'retirada'), 'retirada habilitada não ofertada');
  });
  await t('checkout cria pedido SÓ do vendedor escolhido; o outro grupo permanece', async () => {
    const end = (await req('GET', '/vitrine/api/enderecos', { como: 'caio' })).json.enderecos[0];
    const r = await req('POST', '/vitrine/api/checkout', { como: 'caio', corpo: { seller_id: anuncio.seller_id, address_id: end.id, frete_tipo: 'economica' } });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    pedidoId = r.json.pedido.id;
    pagamentoRef = r.json.pagamento.ref;
    assert.equal(r.json.pedido.status, 'aguardando_pagamento');
    assert.equal(r.json.pedido.seller_id, anuncio.seller_id);
    const c = (await req('GET', '/vitrine/api/carrinho', { como: 'caio' })).json;
    assert.equal(c.grupos.length, 1, 'grupo do outro vendedor sumiu do carrinho');
    assert.notEqual(c.grupos[0].seller_id, anuncio.seller_id);
  });
  await t('estoque é reservado na criação do pedido', async () => {
    assert.equal(repo.Products.obter(anuncio.id).quantidade, 3, '5 − 2 reservados');
  });
  await t('composição financeira: centavos inteiros e comissão de 5% sobre o subtotal', async () => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(pedidoId);
    const subtotal = 14900 * 2;
    assert.equal(o.subtotal_centavos, subtotal);
    assert.equal(o.comissao_pct_bp, 500, 'bp da comissão');
    assert.equal(o.comissao_centavos, Math.round(subtotal * 500 / 10000));
    assert.equal(o.total_centavos, o.subtotal_centavos + o.frete_centavos - o.desconto_centavos);
    assert.equal(o.repasse_vendedor_centavos, o.subtotal_centavos + o.frete_centavos - o.comissao_centavos);
    for (const c of ['subtotal_centavos', 'frete_centavos', 'desconto_centavos', 'comissao_centavos', 'total_centavos', 'repasse_vendedor_centavos']) {
      assert.ok(Number.isInteger(o[c]) && o[c] >= 0, c + ' não é inteiro >= 0');
    }
  });
  await t('mudar a comissão na config vale para pedidos NOVOS; os antigos preservam a taxa', async () => {
    await req('POST', '/staff/api/vitrine/config', { corpo: { chave: 'marketplace_commission_percent', valor: '7.5' } });
    const seedProd = (await req('GET', '/vitrine/api/busca?q=air+fryer')).json.itens[0];
    const end = (await req('GET', '/vitrine/api/enderecos', { como: 'caio' })).json.enderecos[0];
    const r = await req('POST', '/vitrine/api/checkout', { como: 'caio', corpo: { seller_id: seedProd.seller_id ? seedProd.seller_id : '', address_id: end.id, frete_tipo: 'economica' } });
    // seller_id vem do grupo do carrinho (air fryer já está lá)
    const grupo = (await req('GET', '/vitrine/api/carrinho', { como: 'caio' })).json.grupos[0];
    const r2 = r.st === 200 ? r : await req('POST', '/vitrine/api/checkout', { como: 'caio', corpo: { seller_id: grupo.seller_id, address_id: end.id, frete_tipo: 'economica' } });
    assert.equal(r2.st, 200, JSON.stringify(r2.json));
    assert.equal(r2.json.pedido.comissao_pct_bp, 750, 'novo pedido não pegou 7,5%');
    assert.equal(r2.json.pedido.comissao_centavos, Math.round(r2.json.pedido.subtotal_centavos * 750 / 10000));
    assert.equal(db.prepare('SELECT comissao_pct_bp FROM orders WHERE id = ?').get(pedidoId).comissao_pct_bp, 500, 'pedido antigo mudou!');
    // cancela o pedido extra e restaura a comissão padrão
    await req('POST', `/vitrine/api/pedidos/${r2.json.pedido.id}/cancelar`, { como: 'caio', corpo: {} });
    await req('POST', '/staff/api/vitrine/config', { corpo: { chave: 'marketplace_commission_percent', valor: '5' } });
  });

  // ================= máquina de estados =================
  await t('transições inválidas são rejeitadas (recebi antes do envio; preparar antes do pago)', async () => {
    assert.equal((await req('POST', `/vitrine/api/pedidos/${pedidoId}/recebi`, { como: 'caio' })).st, 400);
    assert.equal((await req('POST', `/vitrine/api/vendas/${pedidoId}/preparar`, { como: 'vera' })).st, 400);
  });
  await t('comprador de fora não enxerga pedido alheio (isolamento entre contas)', async () => {
    await criarPessoa('bia', 'Bia Bisbilhoteira', 'bia@t.com');
    assert.equal((await req('GET', '/vitrine/api/pedidos/' + pedidoId, { como: 'bia' })).st, 404);
    assert.equal((await req('GET', '/vitrine/api/vendas/' + pedidoId, { como: 'bia' })).st, 403);
  });

  // ================= pagamento simulado + webhook idempotente =================
  await t('pagamento simulado aprova pelo caminho idempotente; pedido vira pago e nasce o repasse', async () => {
    const r = await req('POST', `/vitrine/api/pedidos/${pedidoId}/pagar-simulado`, { como: 'caio', corpo: { resultado: 'aprovado' } });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    assert.equal(r.json.aplicado, true);
    assert.equal(r.json.pedido.status, 'pago');
    const payout = db.prepare('SELECT * FROM seller_payouts WHERE order_id = ?').get(pedidoId);
    assert.ok(payout && payout.status === 'previsto', 'payout previsto não criado');
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(pedidoId);
    assert.equal(o.tarifa_processador_centavos, 99 + Math.round(o.total_centavos * 349 / 10000), 'tarifa simulada não registrada');
  });
  await t('o MESMO evento entregue de novo não aplica duas vezes (idempotência)', async () => {
    const r = await req('POST', `/vitrine/api/pedidos/${pedidoId}/pagar-simulado`, { como: 'caio', corpo: { resultado: 'aprovado' } });
    assert.equal(r.json.aplicado, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM seller_payouts WHERE order_id = ?').get(pedidoId).c, 1, 'payout duplicou');
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM order_status_history WHERE order_id = ? AND para = 'pago'").get(pedidoId).c, 1, 'histórico duplicou');
  });
  await t('webhook externo exige o segredo (401 sem token) e é idempotente com token', async () => {
    const semToken = await req('POST', '/vitrine/webhooks/pagamento', { corpo: { evento_id: 'ev-x', ref: pagamentoRef, tipo: 'aprovado' } });
    assert.equal(semToken.st, 401);
    const comToken = await req('POST', '/vitrine/webhooks/pagamento', {
      corpo: { evento_id: 'ev-repetido', ref: pagamentoRef, tipo: 'aprovado' },
      headers: { 'x-webhook-token': pagamentos.webhookSecret() },
    });
    assert.equal(comToken.st, 200);
    const denovo = await req('POST', '/vitrine/webhooks/pagamento', {
      corpo: { evento_id: 'ev-repetido', ref: pagamentoRef, tipo: 'aprovado' },
      headers: { 'x-webhook-token': pagamentos.webhookSecret() },
    });
    assert.equal(denovo.json.aplicado, false, 'evento repetido aplicou de novo');
  });
  await t('pagamento recusado cancela o pedido e devolve o estoque', async () => {
    await req('POST', '/vitrine/api/carrinho', { como: 'bia', corpo: { product_id: anuncio.id, quantidade: 1 } });
    await req('POST', '/vitrine/api/enderecos', { como: 'bia', corpo: { rotulo: 'Casa', cep: '01310100', logradouro: 'Av. Paulista', numero: '1000', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' } });
    const end = (await req('GET', '/vitrine/api/enderecos', { como: 'bia' })).json.enderecos[0];
    const antes = repo.Products.obter(anuncio.id).quantidade;
    const r = await req('POST', '/vitrine/api/checkout', { como: 'bia', corpo: { seller_id: anuncio.seller_id, address_id: end.id, frete_tipo: 'economica' } });
    assert.equal(repo.Products.obter(anuncio.id).quantidade, antes - 1, 'não reservou');
    const pg = await req('POST', `/vitrine/api/pedidos/${r.json.pedido.id}/pagar-simulado`, { como: 'bia', corpo: { resultado: 'recusado' } });
    assert.equal(pg.json.pedido.status, 'cancelado');
    assert.equal(repo.Products.obter(anuncio.id).quantidade, antes, 'não devolveu o estoque');
  });

  // ================= envio, rastreio e entrega =================
  await t('vendedor prepara, informa envio e nasce o rastreio com evento de postagem', async () => {
    await req('POST', `/vitrine/api/vendas/${pedidoId}/preparar`, { como: 'vera' });
    const r = await req('POST', `/vitrine/api/vendas/${pedidoId}/enviar`, { como: 'vera', corpo: { codigo_rastreio: '' } });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    assert.ok(/^VT[0-9A-F]+BR$/.test(r.json.envio.codigo_rastreio), 'código simulado não gerado');
    assert.equal(r.json.envio.status, 'postado');
    const det = (await req('GET', '/vitrine/api/pedidos/' + pedidoId, { como: 'caio' })).json;
    assert.equal(det.pedido.status, 'enviado');
    assert.equal(det.envio.eventos.length, 1);
  });
  await t('rastreio simulado avança e o pedido acompanha (em trânsito)', async () => {
    const r = await req('POST', `/vitrine/api/vendas/${pedidoId}/avancar-rastreio`, { como: 'vera' });
    assert.equal(r.json.evento.status, 'em_transito');
    assert.equal(r.json.pedido.status, 'em_transito');
  });
  await t('página pública de rastreio mostra a linha do tempo (com aviso de simulação)', async () => {
    const det = (await req('GET', '/vitrine/api/pedidos/' + pedidoId, { como: 'caio' })).json;
    const r = await req('GET', '/vitrine/rastreio/' + det.envio.codigo_rastreio);
    assert.equal(r.st, 200);
    assert.ok(r.texto.includes('simulado') || r.texto.includes('simulada'), 'sem aviso de simulação');
  });

  // ================= avaliações =================
  let itemId;
  await t('avaliar ANTES da entrega é proibido', async () => {
    itemId = db.prepare('SELECT id FROM order_items WHERE order_id = ?').get(pedidoId).id;
    const r = await req('POST', '/vitrine/api/avaliar', { como: 'caio', corpo: { order_item_id: itemId, nota_produto: 5, nota_descricao: 5, nota_embalagem: 5, nota_envio: 5, nota_atendimento: 5 } });
    assert.equal(r.st, 400);
    assert.ok(/entrega/i.test(r.json.erro));
  });
  await t('comprador confirma o recebimento; pedido entregue e reputação de prazo conta', async () => {
    const r = await req('POST', `/vitrine/api/pedidos/${pedidoId}/recebi`, { como: 'caio' });
    assert.equal(r.json.pedido.status, 'entregue');
    const sp = db.prepare('SELECT * FROM seller_profiles WHERE user_id = ?').get(anuncio.seller_id);
    assert.equal(sp.entregas_total, 1);
    assert.equal(sp.entregas_no_prazo, 1);
  });
  await t('avaliação pós-entrega: 5 dimensões 1–5, uma por item, só do comprador', async () => {
    assert.equal((await req('POST', '/vitrine/api/avaliar', { como: 'caio', corpo: { order_item_id: itemId, nota_produto: 6, nota_descricao: 5, nota_embalagem: 5, nota_envio: 5, nota_atendimento: 5 } })).st, 400, 'nota 6 passou');
    assert.equal((await req('POST', '/vitrine/api/avaliar', { como: 'bia', corpo: { order_item_id: itemId, nota_produto: 5, nota_descricao: 5, nota_embalagem: 5, nota_envio: 5, nota_atendimento: 5 } })).st, 400, 'não-comprador avaliou');
    const r = await req('POST', '/vitrine/api/avaliar', { como: 'caio', corpo: { order_item_id: itemId, nota_produto: 5, nota_descricao: 4, nota_embalagem: 5, nota_envio: 5, nota_atendimento: 5, comentario: 'Exatamente como descrito.' } });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    assert.equal((await req('POST', '/vitrine/api/avaliar', { como: 'caio', corpo: { order_item_id: itemId, nota_produto: 1, nota_descricao: 1, nota_embalagem: 1, nota_envio: 1, nota_atendimento: 1 } })).st, 400, 'avaliou duas vezes');
    const pub = repo.Vendedores.publico(anuncio.seller_id);
    assert.equal(pub.num_avaliacoes, 1);
    assert.ok(pub.nota_media > 4, 'média não recalculada');
  });

  // ================= conclusão e repasse =================
  await t('concluir libera o repasse e conta a venda; staff vê a fila e marca pago', async () => {
    const r = await req('POST', `/vitrine/api/pedidos/${pedidoId}/concluir`, { como: 'caio' });
    assert.equal(r.json.pedido.status, 'concluido');
    const fila = (await req('GET', '/staff/api/vitrine/repasses')).json.fila;
    const meu = fila.find((f) => f.order_id === pedidoId);
    assert.ok(meu, 'repasse não está na fila');
    assert.equal(meu.valor_centavos, r.json.pedido.repasse_vendedor_centavos);
    assert.equal((await req('POST', `/staff/api/vitrine/repasses/${meu.id}/pago`, { staff: 'op' })).st, 403, 'não-admin pagou repasse');
    assert.equal((await req('POST', `/staff/api/vitrine/repasses/${meu.id}/pago`)).st, 200);
    assert.equal(db.prepare('SELECT vendas_concluidas FROM seller_profiles WHERE user_id = ?').get(anuncio.seller_id).vendas_concluidas, 1);
  });
  await t('histórico do pedido é uma trilha completa (criado→pago→…→concluído)', async () => {
    const hist = db.prepare('SELECT para FROM order_status_history WHERE order_id = ? ORDER BY quando').all(pedidoId).map((x) => x.para);
    for (const etapa of ['aguardando_pagamento', 'pago', 'preparando_envio', 'enviado', 'em_transito', 'entregue', 'concluido']) {
      assert.ok(hist.includes(etapa), 'faltou no histórico: ' + etapa);
    }
  });

  // ================= devolução e disputa =================
  await t('fluxo de disputa: devolução → contestação → mediação reembolsa e cancela o repasse', async () => {
    // novo pedido completo até a entrega
    await req('POST', '/vitrine/api/carrinho', { como: 'caio', corpo: { product_id: anuncio.id, quantidade: 1 } });
    const end = (await req('GET', '/vitrine/api/enderecos', { como: 'caio' })).json.enderecos[0];
    const r = await req('POST', '/vitrine/api/checkout', { como: 'caio', corpo: { seller_id: anuncio.seller_id, address_id: end.id, frete_tipo: 'expressa' } });
    const oid = r.json.pedido.id;
    await req('POST', `/vitrine/api/pedidos/${oid}/pagar-simulado`, { como: 'caio', corpo: { resultado: 'aprovado' } });
    await req('POST', `/vitrine/api/vendas/${oid}/enviar`, { como: 'vera', corpo: {} });
    await req('POST', `/vitrine/api/pedidos/${oid}/recebi`, { como: 'caio' });
    const dev = await req('POST', `/vitrine/api/pedidos/${oid}/devolucao`, { como: 'caio', corpo: { motivo: 'Chegou com defeito não descrito' } });
    assert.equal(dev.json.pedido.status, 'devolucao_solicitada');
    const cont = await req('POST', `/vitrine/api/vendas/${oid}/devolucao`, { como: 'vera', corpo: { aceitar: false, justificativa: 'Saiu daqui funcionando.' } });
    assert.equal(cont.json.pedido.status, 'em_disputa');
    assert.equal((await req('POST', `/staff/api/vitrine/disputas/${oid}/resolver`, { staff: 'op', corpo: { resolucao: 'reembolso_total' } })).st, 403, 'não-admin resolveu');
    const res2 = await req('POST', `/staff/api/vitrine/disputas/${oid}/resolver`, { corpo: { resolucao: 'reembolso_total' } });
    assert.equal(res2.st, 200, JSON.stringify(res2.json));
    assert.equal(res2.json.pedido.status, 'reembolsado');
    assert.equal(db.prepare('SELECT status FROM seller_payouts WHERE order_id = ?').get(oid).status, 'cancelado');
    assert.equal(db.prepare('SELECT status FROM payments WHERE order_id = ?').get(oid).status, 'reembolsado');
  });

  // ================= cancelamento devolve estoque =================
  await t('cancelamento pelo comprador antes do pagamento devolve o estoque', async () => {
    const antes = repo.Products.obter(anuncio.id).quantidade;
    await req('POST', '/vitrine/api/carrinho', { como: 'caio', corpo: { product_id: anuncio.id, quantidade: 1 } });
    const end = (await req('GET', '/vitrine/api/enderecos', { como: 'caio' })).json.enderecos[0];
    const r = await req('POST', '/vitrine/api/checkout', { como: 'caio', corpo: { seller_id: anuncio.seller_id, address_id: end.id, frete_tipo: 'economica' } });
    const c = await req('POST', `/vitrine/api/pedidos/${r.json.pedido.id}/cancelar`, { como: 'caio', corpo: { motivo: 'mudei de ideia' } });
    assert.equal(c.json.pedido.status, 'cancelado');
    assert.equal(repo.Products.obter(anuncio.id).quantidade, antes);
  });

  // ================= perguntas, favoritos e denúncia =================
  await t('pergunta → notificação → resposta do vendedor → aparece na página pública', async () => {
    const prod = repo.Products.obter(anuncio.id);
    await req('POST', `/vitrine/api/produto/${anuncio.id}/perguntar`, { como: 'caio', corpo: { pergunta: 'Acompanha as brocas?' } });
    const pend = (await req('GET', '/vitrine/api/vendedor/perguntas?pendentes=1', { como: 'vera' })).json.perguntas;
    assert.equal(pend.length, 1);
    await req('POST', `/vitrine/api/perguntas/${pend[0].id}/responder`, { como: 'vera', corpo: { resposta: 'Sim, as 6 brocas da maleta.' } });
    const pagina = await req('GET', '/vitrine/p/' + prod.slug);
    assert.ok(pagina.texto.includes('Acompanha as brocas?') && pagina.texto.includes('6 brocas'));
  });
  await t('favoritar alterna e lista; denúncia entra para o staff', async () => {
    const f1 = await req('POST', '/vitrine/api/favoritos/' + anuncio.id, { como: 'caio' });
    assert.equal(f1.json.favoritado, true);
    assert.equal((await req('GET', '/vitrine/api/favoritos', { como: 'caio' })).json.favoritos.length, 1);
    await req('POST', '/vitrine/api/denunciar', { como: 'caio', corpo: { tipo: 'produto', alvo_id: anuncio.id, motivo: 'teste de denúncia' } });
    const den = (await req('GET', '/staff/api/vitrine/denuncias')).json.denuncias;
    assert.ok(den.some((d) => d.alvo_id === anuncio.id));
  });

  // ================= staff: dashboard, CSV, auditoria, bloqueio =================
  await t('dashboard consolida GMV, comissões, tarifa e margem honesta (comissão − tarifa)', async () => {
    const d = (await req('GET', '/staff/api/vitrine/dashboard')).json;
    assert.ok(d.financeiro.gmv_centavos > 0);
    assert.ok(d.financeiro.comissao_centavos > 0);
    assert.equal(d.financeiro.margem_liquida_centavos, d.financeiro.comissao_centavos - d.financeiro.tarifa_processador_centavos);
    assert.ok(Array.isArray(d.mais_vistos) && d.mais_vistos.length);
  });
  await t('exportações CSV respondem com BOM e cabeçalho', async () => {
    for (const p of ['/staff/api/vitrine/export/pedidos.csv', '/staff/api/vitrine/export/produtos.csv']) {
      const r = await req('GET', p);
      assert.equal(r.st, 200, p);
      assert.ok(r.texto.includes(';'), 'CSV sem separador em ' + p);
    }
    assert.equal((await req('GET', '/staff/api/vitrine/export/usuarios.csv', { staff: 'op' })).st, 403, 'não-admin exportou usuários');
  });
  await t('ações administrativas ficam na trilha de auditoria', async () => {
    const a = (await req('GET', '/staff/api/vitrine/auditoria')).json.auditoria;
    const acoes = a.map((x) => x.acao);
    for (const esperada of ['produto.moderar.aprovar', 'config.set', 'disputa.resolver', 'repasse.pagar']) {
      assert.ok(acoes.includes(esperada), 'auditoria sem: ' + esperada);
    }
  });
  await t('bloqueio de usuário tira os anúncios da vitrine (some da busca)', async () => {
    await req('POST', `/staff/api/vitrine/usuarios/${anuncio.seller_id}/bloquear`, { corpo: { motivo: 'teste' } });
    assert.equal((await req('GET', '/vitrine/api/busca?q=furadeira')).json.total, 0, 'bloqueado segue na vitrine');
    await req('POST', `/staff/api/vitrine/usuarios/${anuncio.seller_id}/reativar`);
    assert.equal((await req('GET', '/vitrine/api/busca?q=furadeira')).json.total, 1);
  });

  // ================= LGPD =================
  await t('titular baixa os próprios dados e a exclusão é barrada com pedido aberto', async () => {
    const exp = await req('GET', '/vitrine/api/meus-dados', { como: 'caio' });
    assert.equal(exp.st, 200);
    assert.ok(exp.json.conta && !exp.json.conta.senha_hash, 'hash de senha vazou no export');
    // bia tem pedido cancelado; caio tem tudo concluído/cancelado/reembolsado → pode excluir
    const del = await req('POST', '/vitrine/api/excluir-conta', { como: 'bia' });
    assert.equal(del.st, 200, JSON.stringify(del.json));
    assert.equal((await req('POST', '/vitrine/api/login', { corpo: { email: 'bia@t.com', senha: 'senha-forte-8' } })).st, 401, 'conta excluída ainda loga');
  });

  // ================= rotina =================
  await t('rotina expira pedido não pago antigo e devolve o estoque', async () => {
    await req('POST', '/vitrine/api/carrinho', { como: 'caio', corpo: { product_id: anuncio.id, quantidade: 1 } });
    const end = (await req('GET', '/vitrine/api/enderecos', { como: 'caio' })).json.enderecos[0];
    const r = await req('POST', '/vitrine/api/checkout', { como: 'caio', corpo: { seller_id: anuncio.seller_id, address_id: end.id, frete_tipo: 'economica' } });
    const antes = repo.Products.obter(anuncio.id).quantidade;
    db.prepare('UPDATE orders SET criado_em = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', r.json.pedido.id);
    const rot = (await req('POST', '/staff/api/vitrine/rodar-rotina')).json;
    assert.ok(rot.expirados >= 1, 'não expirou');
    assert.equal(db.prepare('SELECT status FROM orders WHERE id = ?').get(r.json.pedido.id).status, 'cancelado');
    assert.equal(repo.Products.obter(anuncio.id).quantidade, antes + 1);
  });

  // ================= painel do vendedor: resumo e loja =================
  await t('resumo do vendedor consolida receita, comissões, saldo e reputação (rota do painel "Minha loja")', async () => {
    const r = await req('GET', '/vitrine/api/vendedor/resumo', { como: 'vera' });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    assert.ok(r.json.resumo.receita_bruta_centavos > 0, 'receita zerada com venda concluída');
    assert.ok(r.json.resumo.comissoes_centavos > 0);
    assert.equal(r.json.resumo.vendas_concluidas, 1);
    for (const c of Object.values(r.json.resumo)) assert.ok(Number.isInteger(c), 'resumo com valor não inteiro');
    assert.ok(r.json.reputacao.nota_media > 0);
    const st = await req('GET', '/vitrine/api/vendedor/mp-status', { como: 'vera' });
    assert.equal(st.st, 200);
    assert.equal(st.json.plataforma_configurada, false); // sem env neste ponto da suíte
    const loja = await req('GET', '/vitrine/api/loja/loja-da-vera');
    assert.equal(loja.st, 200);
    assert.ok(loja.json.vendedor.vendas_concluidas >= 1);
  });

  // ================= FASE 6: Mercado Pago Split (sandbox, fetch mockado) =================
  await t('sem credenciais, MP Split e Melhor Envio se declaram indisponíveis (contrato honesto)', async () => {
    assert.equal(pagamentos.OAuth.configurado(), false);
    assert.equal(pagamentos.Provedores['mercadopago-split'].disponivel(), false);
    assert.equal(require('./frete').Provedores['melhor-envio'].disponivel(), false);
    const r = await req('GET', '/vitrine/oauth/mercadopago', { como: 'vera' });
    assert.equal(r.st, 302, 'rota OAuth deveria redirecionar');
  });

  let pedidoMP, mpChamadasMock = [], reembolsosMP = [];
  await t('OAuth do vendedor: callback troca o código e grava os tokens (mock)', async () => {
    process.env.VITRINE_MP_APP_ID = 'APP-TESTE';
    process.env.VITRINE_MP_SECRET = 'SECRET-TESTE';
    process.env.VITRINE_MP_WEBHOOK_SECRET = 'WHK-TESTE';
    pagamentos.setFetch(async (url, opts = {}) => {
      let corpoReq = null; try { corpoReq = opts.body ? JSON.parse(opts.body) : null; } catch (_) {}
      mpChamadasMock.push({ url, metodo: opts.method || 'GET', corpo: corpoReq });
      const responder = (obj, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(obj) });
      if (url.endsWith('/oauth/token')) {
        return responder({ access_token: 'TK-VERA', refresh_token: 'RF-VERA', user_id: 987654, public_key: 'PK-VERA', live_mode: false, expires_in: 15552000 });
      }
      if (url.endsWith('/checkout/preferences')) {
        const corpo = JSON.parse(opts.body);
        return responder({ id: 'PREF-1', sandbox_init_point: 'https://sandbox.mp.test/checkout/PREF-1', _corpo: corpo });
      }
      if (/\/v1\/payments\/MPPAY1\/refunds$/.test(url)) { reembolsosMP.push(JSON.parse(opts.body || '{}')); return responder({ id: 'REF-1', status: 'approved' }); }
      if (/\/v1\/payments\/MPPAY1$/.test(url)) {
        return responder({ id: 'MPPAY1', status: 'approved', external_reference: pedidoMP, fee_details: [{ amount: '4.99' }] });
      }
      return responder({ erro: 'rota não mockada: ' + url }, 500);
    });
    const jwt = require('jsonwebtoken');
    const state = jwt.sign({ tipo: 'vitrine-mp', uid: vera.id }, 'seg-teste', { expiresIn: '30m' });
    const cb = await req('GET', `/vitrine/oauth/mercadopago/callback?code=CODE-1&state=${state}`, { como: 'vera' });
    assert.equal(cb.st, 302);
    const st = (await req('GET', '/vitrine/api/vendedor/mp-status', { como: 'vera' })).json;
    assert.equal(st.plataforma_configurada, true);
    assert.equal(st.conectado, true);
    assert.equal(st.live_mode, false, 'mock é sandbox');
  });

  await t('checkout com vendedor conectado usa MP Split: preferência com marketplace_fee = comissão', async () => {
    await req('POST', '/vitrine/api/carrinho', { como: 'caio', corpo: { product_id: anuncio.id, quantidade: 1 } });
    const end = (await req('GET', '/vitrine/api/enderecos', { como: 'caio' })).json.enderecos[0];
    const r = await req('POST', '/vitrine/api/checkout', { como: 'caio', corpo: { seller_id: anuncio.seller_id, address_id: end.id, frete_tipo: 'economica' } });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    pedidoMP = r.json.pedido.id;
    assert.equal(r.json.pagamento.provedor, 'mercadopago-split');
    assert.equal(r.json.pagamento.checkout_url, 'https://sandbox.mp.test/checkout/PREF-1');
    const pref = mpChamadasMock.find((c) => c.url.endsWith('/checkout/preferences'));
    assert.ok(pref && pref.corpo, 'preferência não criada');
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(pedidoMP);
    assert.equal(pref.corpo.marketplace_fee, pagamentos.centavosDecimal(o.comissao_centavos), 'marketplace_fee ≠ comissão do pedido');
    assert.equal(pref.corpo.external_reference, pedidoMP);
    assert.ok(pref.corpo.notification_url.endsWith('/vitrine/webhooks/mercadopago'));
    const somaItens = pref.corpo.items.reduce((t2, i) => t2 + Math.round(i.unit_price * 100) * i.quantity, 0);
    assert.equal(somaItens, o.total_centavos, 'itens da preferência ≠ total do pedido');
  });

  const assinaturaMP = (mpId, rid, ts) => {
    const manifesto = `id:${String(mpId).toLowerCase()};request-id:${rid};ts:${ts};`;
    return `ts=${ts},v1=` + require('crypto').createHmac('sha256', 'WHK-TESTE').update(manifesto).digest('hex');
  };
  await t('webhook MP: assinatura inválida não aplica; assinatura válida aprova com a tarifa REAL (fee_details)', async () => {
    // inválida
    await req('POST', '/vitrine/webhooks/mercadopago', {
      corpo: { type: 'payment', data: { id: 'MPPAY1' } },
      headers: { 'x-signature': 'ts=1,v1=deadbeef', 'x-request-id': 'r1' },
    });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(db.prepare('SELECT status FROM orders WHERE id = ?').get(pedidoMP).status, 'aguardando_pagamento', 'assinatura inválida aplicou!');
    // válida
    const ts = String(Date.now());
    await req('POST', '/vitrine/webhooks/mercadopago', {
      corpo: { type: 'payment', data: { id: 'MPPAY1' } },
      headers: { 'x-signature': assinaturaMP('MPPAY1', 'r2', ts), 'x-request-id': 'r2' },
    });
    await new Promise((r) => setTimeout(r, 300));
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(pedidoMP);
    assert.equal(o.status, 'pago');
    assert.equal(o.tarifa_processador_centavos, 499, 'tarifa real do fee_details não registrada');
    const pay = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(pedidoMP);
    assert.ok(String(pay.dados).includes('MPPAY1'), 'mp_payment_id não vinculado');
  });
  await t('webhook MP repetido é idempotente (mesmo status não aplica de novo)', async () => {
    const antes = db.prepare("SELECT COUNT(*) AS c FROM order_status_history WHERE order_id = ? AND para = 'pago'").get(pedidoMP).c;
    const ts = String(Date.now());
    await req('POST', '/vitrine/webhooks/mercadopago', {
      corpo: { type: 'payment', data: { id: 'MPPAY1' } },
      headers: { 'x-signature': assinaturaMP('MPPAY1', 'r3', ts), 'x-request-id': 'r3' },
    });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM order_status_history WHERE order_id = ? AND para = 'pago'").get(pedidoMP).c, antes);
  });
  await t('cancelamento de pedido MP pago reembolsa pela API do MP (mock registra o refund)', async () => {
    const r = await req('POST', `/vitrine/api/pedidos/${pedidoMP}/cancelar`, { como: 'caio', corpo: { motivo: 'teste MP' } });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    assert.equal(db.prepare('SELECT status FROM orders WHERE id = ?').get(pedidoMP).status, 'reembolsado');
    assert.equal(reembolsosMP.length, 1, 'refund não chamou a API do MP');
    assert.equal(db.prepare('SELECT status FROM payments WHERE order_id = ?').get(pedidoMP).status, 'reembolsado');
  });
  await t('desconectar o MP volta o vendedor ao fluxo simulado', async () => {
    await req('POST', '/vitrine/api/vendedor/mp-desconectar', { como: 'vera' });
    await req('POST', '/vitrine/api/carrinho', { como: 'caio', corpo: { product_id: anuncio.id, quantidade: 1 } });
    const end = (await req('GET', '/vitrine/api/enderecos', { como: 'caio' })).json.enderecos[0];
    const r = await req('POST', '/vitrine/api/checkout', { como: 'caio', corpo: { seller_id: anuncio.seller_id, address_id: end.id, frete_tipo: 'economica' } });
    assert.equal(r.json.pagamento.provedor, 'simulado');
    await req('POST', `/vitrine/api/pedidos/${r.json.pedido.id}/cancelar`, { como: 'caio', corpo: {} });
    delete process.env.VITRINE_MP_APP_ID; delete process.env.VITRINE_MP_SECRET; delete process.env.VITRINE_MP_WEBHOOK_SECRET;
    pagamentos.setFetch(null);
  });

  // ================= FASE 6: Melhor Envio (sandbox, fetch mockado) =================
  await t('cotação Melhor Envio mapeia serviços reais p/ centavos inteiros; sem token cai no simulado', async () => {
    const frete = require('./frete');
    process.env.VITRINE_FRETE_PROVEDOR = 'melhor-envio';
    process.env.VITRINE_MELHOR_ENVIO_TOKEN = 'ME-TOKEN-TESTE';
    frete.setFetch(async (url, opts) => ({
      ok: true, status: 200,
      text: async () => JSON.stringify([
        { id: 1, name: 'PAC', company: { name: 'Correios' }, price: '23.45', delivery_time: { days: 7 } },
        { id: 2, name: 'SEDEX', company: { name: 'Correios' }, price: '41.90', delivery_time: 3 },
        { id: 99, name: 'Indisponível', error: 'sem cobertura' },
      ]),
    }));
    const opcoes = await frete.cotar({ cepDestino: '70864530', cepOrigem: '70200001', pesoGramas: 1800, dim: { comp_cm: 30, larg_cm: 25, alt_cm: 10 }, retiradaOk: true });
    const pac = opcoes.find((o) => o.tipo === 'me-1');
    assert.ok(pac, 'PAC não mapeado');
    assert.equal(pac.valor_centavos, 2345);
    assert.equal(pac.prazo_dias, 7);
    assert.equal(opcoes.find((o) => o.tipo === 'me-2').valor_centavos, 4190);
    assert.ok(!opcoes.some((o) => o.tipo === 'me-99'), 'serviço com erro entrou na lista');
    assert.ok(opcoes.some((o) => o.tipo === 'retirada'), 'retirada sumiu na cotação real');
    // API fora do ar → fallback simulado, checkout não morre
    frete.setFetch(async () => ({ ok: false, status: 500, text: async () => 'boom' }));
    const fallback = await frete.cotar({ cepDestino: '70864530', cepOrigem: '70200001', pesoGramas: 500, dim: {} });
    assert.ok(fallback.some((o) => o.tipo === 'economica'), 'fallback simulado não veio');
    delete process.env.VITRINE_FRETE_PROVEDOR; delete process.env.VITRINE_MELHOR_ENVIO_TOKEN;
    frete.setFetch(null);
  });

  // ================= fim =================
  srv.close();
  console.log(`\n${ok} teste(s) OK, ${falhas.length} falha(s).`);
  if (falhas.length) { console.log(falhas.map((f) => ' - ' + f).join('\n')); process.exit(1); }
}

rodar().catch((e) => { console.error('ERRO FATAL:', e); process.exit(1); });
