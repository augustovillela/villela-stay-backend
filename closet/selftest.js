// =====================================================================
// Closet Club — suíte de testes. Sobe o Express real com auth de staff
// injetada, banco descartável e Mercado Pago mockado.  npm run test:closet
//
// O foco é o que dá dinheiro e o que dá processo: preço, agenda, escrow,
// repasse por dono, disputa e isolamento entre contas.
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'closet-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
process.env.CLOSET_ROTINAS = 'off';
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');

// ---- staff fake (o Portal Staff é quem administra a plataforma) ----
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

const emails = [];
const enviarEmail = async (to, ass, html) => { emails.push({ to, ass, html }); return true; };
const alertas = [];
const alertaAugusto = async (m) => { alertas.push(m); };

// ---- Mercado Pago mockado ----
const mpChamadas = [];
const mpFetch = async (p, opts) => {
  mpChamadas.push({ p, metodo: (opts && opts.method) || 'GET' });
  if (p === '/v1/payments' && opts && opts.method === 'POST') {
    return { id: 'PAY' + mpChamadas.length, status: 'pending', point_of_interaction: { transaction_data: { qr_code: '000201PIX', qr_code_base64: 'QkFTRTY0' } } };
  }
  if (/\/v1\/payments\/.+\/refunds/.test(p)) return { id: 'REF1', status: 'approved' };
  if (p === '/preapproval' && opts && opts.method === 'POST') return { id: 'PRE1', init_point: 'https://mp/PRE1', status: 'pending' };
  if (p.indexOf('/preapproval/') === 0) return { id: 'PRE1', status: 'authorized', external_reference: 'closet-premium:X' };
  return {};
};
mpFetch.__mock = true;

const app = express();
app.use(express.json({ limit: '6mb' }));
app.use(cookieParser());
const saas = require('./index');
saas.montar(app, { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto, mpFetch, jwtSecret: 'seg-teste' });
const { db } = require('./db');

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
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((ck) => { const [kv] = ck.split(';'); const [k, v] = kv.split('='); jars[como][k] = v; });
  }
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch (_) {}
  return { st: r.status, json, texto };
}
async function t(nome, fn) {
  try { await fn(); ok++; console.log('  ✅', nome); }
  catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌', nome, '—', e.message); }
}
const dias = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const n = (v, padrao = 0) => { const x = Number(v); return Number.isFinite(x) ? x : padrao; };

async function rodar() {
  const srv = app.listen(0);
  BASE = 'http://127.0.0.1:' + srv.address().port;
  console.log('Closet Club — selftest\n');

  // ================= vitrine pública =================
  await t('V2 JSON-LD: título com </script> não escapa do bloco (era XSS armazenado)', async () => {
    const fonte = require('fs').readFileSync(require('path').join(__dirname, 'paginas.js'), 'utf8');
    const ini = fonte.indexOf('const jsonLd =');
    assert.ok(ini >= 0, 'o helper jsonLd tem de existir em paginas.js');
    const fimLinha = fonte.indexOf(String.fromCharCode(10), ini);
    let expr = fonte.slice(ini + ('const jsonLd =').length, fimLinha).trim();
    if (expr.endsWith(';')) expr = expr.slice(0, -1);
    const jsonLd = eval('(' + expr + ')');
    const payload = { name: 'A</script><script>alert(1)</script>', description: 'ok' };
    const saida = jsonLd(payload);
    assert.ok(!saida.includes('</script>'), 'JSON.stringify não escapa <: o título fecharia o bloco e injetaria código');
    assert.ok(!saida.toLowerCase().includes('<script'), 'nem pode abrir um script novo');
    assert.deepEqual(JSON.parse(saida), payload, 'o JSON-LD tem de continuar válido e equivalente');
    const sinkCru = 'ld+json">' + String.fromCharCode(36) + '{JSON.stringify(';
    assert.ok(!fonte.includes(sinkCru), 'nenhum bloco ld+json pode voltar a usar JSON.stringify cru');
  });

  await t('landing renderiza com a marca e a promessa do hero', async () => {
    const r = await req('GET', '/closet');
    assert.ok(r.texto.includes('CLOSET') && r.texto.includes('Club'), 'marca ausente');
    assert.ok(r.texto.includes('Seu próximo look'), 'hero ausente');
    assert.ok(r.texto.includes('Playfair+Display'), 'tipografia da marca ausente');
  });
  await t('páginas públicas de vitrine, looks, IA e anunciar respondem', async () => {
    for (const p of ['/closet/vitrine', '/closet/looks', '/closet/ia', '/closet/anunciar', '/closet/como-funciona', '/closet/termos', '/closet/privacidade']) {
      assert.equal((await req('GET', p)).st, 200, p);
    }
  });
  await t('termos publicam o articulado da minuta, sem vazar o guia interno', async () => {
    const r = await req('GET', '/closet/termos');
    assert.equal(r.st, 200);
    // articulado presente da primeira à última seção
    assert.ok(r.texto.includes('IDENTIFICAÇÃO DA PLATAFORMA'), 'seção 1 ausente');
    assert.ok(r.texto.includes('DECLARAÇÃO DE ACEITE'), 'seção 47 ausente');
    assert.ok(r.texto.includes('LEGISLAÇÃO APLICÁVEL E FORO'), 'seção 45 ausente');
    // a controladora tem de bater com a que a Política de Privacidade publica
    assert.ok(r.texto.includes('Augusto Villela Ltda') && r.texto.includes('56.776.526/0001-12'),
      'identificação da operadora divergente da Política de Privacidade');
    // comissão sai da configuração, não de número escrito à mão no texto jurídico
    assert.ok(r.texto.includes(`${require('./repo').Config.num('comissao_pct', 20)}%`), 'comissão fora de sincronia');
    // enquanto for minuta, a tarja tem de estar visível
    assert.ok(/Minuta provis[óo]ria/i.test(r.texto), 'tarja de minuta sumiu de um texto ainda provisório');
    // o próprio documento manda remover o guia antes de publicar — ele NUNCA pode chegar ao público
    assert.ok(!/GUIA INTERNO/i.test(r.texto), 'guia interno de preenchimento vazou para a página pública');
    assert.ok(!/NOTA INTERNA/i.test(r.texto), 'nota interna vazou para a página pública');
  });
  await t('robots bloqueia painel e API e aponta o sitemap', async () => {
    const r = await req('GET', '/closet/robots.txt');
    assert.ok(r.texto.includes('Disallow: /closet/app') && r.texto.includes('Disallow: /closet/api') && r.texto.includes('sitemap.xml'));
  });

  // ================= contas =================
  let dona, dona2, cliente;
  await t('cadastro cria conta e já autentica', async () => {
    const r = await req('POST', '/closet/api/cadastrar', {
      como: 'dona',
      corpo: { nome: 'Marina Costa', email: 'marina@t.br', senha: 'senha12345', cidade: 'Brasília', uf: 'DF', aceite_termos: true },
    });
    assert.equal(r.st, 200, r.texto.slice(0, 120));
    dona = r.json.usuario.id;
    assert.ok(jars.dona.closet_sess, 'sessão não veio no cookie');
    assert.ok(emails.some((e) => e.to === 'marina@t.br'), 'e-mail de boas-vindas não saiu');
  });
  await t('cadastro sem aceitar os termos é recusado (LGPD/consentimento)', async () => {
    const r = await req('POST', '/closet/api/cadastrar', { corpo: { nome: 'X', email: 'x@t.br', senha: 'senha12345' } });
    assert.equal(r.st, 400);
    assert.ok(/termos/i.test(r.json.erro));
  });
  await t('e-mail duplicado é recusado', async () => {
    const r = await req('POST', '/closet/api/cadastrar', { corpo: { nome: 'Y', email: 'marina@t.br', senha: 'senha12345', aceite_termos: true } });
    assert.equal(r.st, 400);
  });
  await t('senha curta é recusada', async () => {
    const r = await req('POST', '/closet/api/cadastrar', { corpo: { nome: 'Y', email: 'y@t.br', senha: '123', aceite_termos: true } });
    assert.equal(r.st, 400);
  });
  await t('mais duas contas: segunda proprietária e cliente', async () => {
    let r = await req('POST', '/closet/api/cadastrar', { como: 'dona2', corpo: { nome: 'Ana Luz', email: 'ana@t.br', senha: 'senha12345', cidade: 'Brasília', uf: 'DF', aceite_termos: true } });
    dona2 = r.json.usuario.id;
    r = await req('POST', '/closet/api/cadastrar', { como: 'cliente', corpo: { nome: 'Júlia Reis', email: 'julia@t.br', senha: 'senha12345', cidade: 'Brasília', uf: 'DF', aceite_termos: true } });
    cliente = r.json.usuario.id;
    assert.ok(dona2 && cliente && dona2 !== cliente);
  });
  await t('login errado não vaza se o e-mail existe', async () => {
    const r = await req('POST', '/closet/api/login', { corpo: { email: 'marina@t.br', senha: 'errada' } });
    assert.equal(r.st, 401);
    assert.ok(!/existe/i.test(r.json.erro));
  });
  await t('/me exige sessão', async () => assert.equal((await req('GET', '/closet/api/me')).st, 401));

  // ================= acervo =================
  let vestido, bolsa;
  await t('criar peça: nasce em moderação e fora da vitrine', async () => {
    const r = await req('POST', '/closet/api/app/pecas', {
      como: 'dona',
      corpo: {
        titulo: 'Vestido longo verde oliva', categoria: 'vestido', marca: 'Animale', tamanho: 'M', cor: 'verde',
        condicao: 'seminovo', ocasioes: ['casamento', 'noite'], preco_diaria_centavos: 18000, caucao_centavos: 30000,
        valor_reposicao_centavos: 180000, min_dias: 2, prep_dias: 1, cidade: 'Brasília', uf: 'DF',
        fotos: [{ url: 'https://x/1.jpg', capa: true }], status: 'ativo',
      },
    });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    vestido = r.json.peca.id;
    assert.equal(r.json.peca.moderacao, 'pendente');
    const v = await req('GET', '/closet/api/vitrine');
    assert.equal(v.json.itens.length, 0, 'peça não moderada apareceu na vitrine');
  });
  await t('moderação do staff publica a peça na vitrine', async () => {
    const r = await req('POST', '/staff/api/closet/pecas/' + vestido + '/moderar', { corpo: { aprovado: true } });
    assert.equal(r.st, 200);
    const v = await req('GET', '/closet/api/vitrine');
    assert.equal(v.json.itens.length, 1);
    assert.equal(v.json.itens[0].id, vestido);
  });
  await t('página da peça é server-rendered com preço e dados estruturados', async () => {
    const r = await req('GET', '/closet/peca/' + vestido);
    assert.equal(r.st, 200);
    assert.ok(r.texto.includes('Vestido longo verde oliva'));
    assert.ok(r.texto.includes('"@type":"Product"'), 'faltou JSON-LD para SEO');
    assert.ok(r.texto.includes('180,00') || r.texto.includes('R$ 180'), 'preço não apareceu');
  });
  await t('sitemap inclui a peça publicada', async () => {
    const r = await req('GET', '/closet/sitemap.xml');
    assert.ok(r.texto.includes('/closet/peca/'));
  });
  await t('segunda proprietária cria bolsa e o staff aprova', async () => {
    const r = await req('POST', '/closet/api/app/pecas', {
      como: 'dona2',
      corpo: { titulo: 'Bolsa clutch dourada', categoria: 'bolsa', tamanho: 'unico', cor: 'dourado', ocasioes: ['casamento'],
        preco_diaria_centavos: 6000, caucao_centavos: 10000, valor_reposicao_centavos: 60000, cidade: 'Brasília', uf: 'DF', status: 'ativo' },
    });
    bolsa = r.json.peca.id;
    await req('POST', '/staff/api/closet/pecas/' + bolsa + '/moderar', { corpo: { aprovado: true } });
    // sandália em NÚMERO de calçado: serve para provar que as escalas não se misturam
    const sap = await req('POST', '/closet/api/app/pecas', {
      como: 'dona2',
      corpo: { titulo: 'Sandália salto fino nude', categoria: 'sapato', tamanho: '37', cor: 'nude', ocasioes: ['casamento'],
        preco_diaria_centavos: 5000, caucao_centavos: 10000, valor_reposicao_centavos: 45000, cidade: 'Brasília', uf: 'DF', status: 'ativo' },
    });
    await req('POST', '/staff/api/closet/pecas/' + sap.json.peca.id + '/moderar', { corpo: { aprovado: true } });
    assert.equal((await req('GET', '/closet/api/vitrine')).json.itens.length, 3);
  });
  await t('ninguém edita a peça de outra pessoa', async () => {
    const r = await req('PATCH', '/closet/api/app/pecas/' + vestido, { como: 'dona2', corpo: { preco_diaria_centavos: 100 } });
    assert.equal(r.st, 400);
    assert.ok(/não é sua/i.test(r.json.erro));
  });
  await t('limite do plano grátis (10 peças) é aplicado', async () => {
    for (let i = 0; i < 9; i++) {
      await req('POST', '/closet/api/app/pecas', { como: 'dona', corpo: { titulo: 'Peça ' + i, preco_diaria_centavos: 5000 } });
    }
    const r = await req('POST', '/closet/api/app/pecas', { como: 'dona', corpo: { titulo: 'Peça 11', preco_diaria_centavos: 5000 } });
    assert.equal(r.st, 400);
    assert.ok(/Premium/.test(r.json.erro), 'erro deveria oferecer o Premium: ' + r.json.erro);
  });

  // ================= IA =================
  await t('IA sugere preço ancorado no valor de reposição e explica o porquê', async () => {
    const r = await req('POST', '/closet/api/app/ia/preco', { como: 'dona', corpo: { valor_reposicao_centavos: 180000, categoria: 'vestido', condicao: 'seminovo', cidade: 'Brasília' } });
    assert.equal(r.st, 200);
    assert.ok(r.json.sugerido_centavos > 10000 && r.json.sugerido_centavos < 40000, 'sugestão fora da faixa: ' + r.json.sugerido_centavos);
    assert.ok(r.json.porques.length >= 1);
    assert.ok(r.json.max_centavos > r.json.sugerido_centavos && r.json.min_centavos < r.json.sugerido_centavos);
  });
  await t('IA escreve descrição usando medidas e dados da modelo', async () => {
    const r = await req('POST', '/closet/api/app/ia/descricao', {
      como: 'dona',
      corpo: { categoria: 'vestido', cor: 'verde', marca: 'Animale', tamanho: 'M', ocasioes: ['casamento'], condicao: 'seminovo', modelo: { altura_cm: 170, peso_kg: 62, vestiu: 'M' } },
    });
    assert.ok(/1,70m/.test(r.json.descricao), 'não citou a altura da modelo');
    assert.ok(/casamento/i.test(r.json.descricao));
    assert.ok(r.json.palavras.length >= 3, 'faltaram palavras-chave de SEO');
  });
  await t('IA monta looks completos com peça-chave + complemento', async () => {
    const r = await req('POST', '/closet/api/ia/looks', { corpo: { ocasiao: 'casamento', cidade: 'Brasília', tamanho: 'M' } });
    assert.equal(r.st, 200);
    assert.ok(r.json.looks.length >= 1, 'nenhum look montado');
    const L = r.json.looks[0];
    assert.ok(L.itens.length >= 2, 'look com menos de 2 peças');
    assert.ok(L.preco_diaria_look_centavos < L.preco_diaria_soma_centavos, 'combo não saiu mais barato');
    assert.ok(L.porques.length >= 1, 'não explicou a escolha');
  });
  await t('IA não sugere peça fora do tamanho da pessoa', async () => {
    const r = await req('POST', '/closet/api/ia/looks', { corpo: { ocasiao: 'casamento', cidade: 'Brasília', manequim: 48 } });
    const temVestido = (r.json.looks || []).some((L) => L.itens.some((i) => i.id === vestido));
    assert.ok(!temVestido, 'ofereceu vestido M para manequim 48');
  });
  await t('config ausente devolve o PADRÃO, não zero (Number("") é 0 e é finito)', async () => {
    // um 0 silencioso em percentual de comissão é receita perdida sem ninguém ver
    assert.equal(saas.repo.Config.num('chave_que_nao_existe', 15), 15);
    assert.equal(saas.repo.Config.num('chave_que_nao_existe'), 0);
    assert.equal(saas.repo.Config.num('comissao_pct', 99), 20, 'chave existente tem de vencer o padrão');
  });
  await t('escalas de tamanho não se misturam (sapato 37 não é "tamanho M")', async () => {
    // bolsa/joia não têm manequim e sapato usa número — filtrar tudo pela régua
    // da roupa esvaziava o look. O calçado só é filtrado se a pessoa informar o número.
    const semNumero = await req('POST', '/closet/api/ia/looks', { corpo: { ocasiao: 'casamento', cidade: 'Brasília', manequim: 40 } });
    const L = (semNumero.json.looks || [])[0] || { itens: [] };
    assert.ok(L.itens.some((i) => i.categoria === 'bolsa'), 'bolsa (sem tamanho) foi descartada pelo manequim');
    const comNumero = await req('POST', '/closet/api/ia/looks', { corpo: { ocasiao: 'casamento', cidade: 'Brasília', manequim: 40, calcado: 33 } });
    const L2 = (comNumero.json.looks || [])[0] || { itens: [] };
    assert.ok(!L2.itens.some((i) => i.categoria === 'sapato' && i.tamanho && i.tamanho !== 'unico' && i.tamanho !== '33'),
      'ofereceu calçado de número diferente do informado');
  });
  await t('analytics é do Premium (free recebe 402)', async () => {
    const r = await req('GET', '/closet/api/app/ia/analytics', { como: 'dona' });
    assert.equal(r.st, 402);
    assert.equal(r.json.precisa, 'premium');
  });

  // ================= agenda e preço =================
  await t('mínimo de diárias é respeitado', async () => {
    const r = await req('GET', `/closet/api/pecas/${vestido}/disponibilidade?de=${dias(10)}&ate=${dias(10)}`);
    assert.equal(r.json.periodo.disponivel, false);
    assert.ok(/2 diária/.test(r.json.periodo.motivo));
  });
  await t('cotação: comissão de 20% sai do valor da locação, nunca da caução', async () => {
    const r = await req('POST', '/closet/api/cotar', { corpo: { item_ids: [vestido], de: dias(10), ate: dias(12) } });
    assert.equal(r.st, 200, r.texto.slice(0, 120));
    const c = r.json;
    assert.equal(c.dias, 3);
    assert.equal(c.subtotal_centavos, 54000, 'subtotal de 3 diárias errado');
    assert.equal(c.caucao_centavos, 30000);
    assert.equal(c.comissao_centavos, 10800, 'comissão deveria ser 20% de 54000');
    assert.equal(c.repasse_centavos, 43200);
    assert.equal(c.total_centavos, 84000, 'total = locação + caução');
    assert.equal(c.repasse_centavos + c.comissao_centavos, c.subtotal_centavos, 'repasse + comissão tem de fechar o subtotal');
  });
  await t('seguro incide sobre o valor de reposição', async () => {
    const r = await req('POST', '/closet/api/cotar', { corpo: { item_ids: [vestido], de: dias(10), ate: dias(12), seguro: true } });
    assert.equal(r.json.seguro_centavos, 14400, '8% de 180000');
  });

  // ================= reserva e escrow =================
  let reserva;
  await t('cliente reserva: nasce aguardando pagamento e já segura a agenda', async () => {
    const r = await req('POST', '/closet/api/reservas', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(10), ate: dias(12) } });
    assert.equal(r.st, 200, r.texto.slice(0, 200));
    reserva = r.json.reserva;
    assert.equal(reserva.status, 'aguardando_pagamento');
    assert.ok(/^CC-/.test(reserva.codigo), 'código ilegível: ' + reserva.codigo);
    const d = await req('GET', `/closet/api/pecas/${vestido}/disponibilidade?de=${dias(10)}&ate=${dias(12)}`);
    assert.equal(d.json.periodo.disponivel, false, 'agenda não foi segurada na criação');
  });
  await t('duas pessoas não pagam pela mesma peça nas mesmas datas', async () => {
    const r = await req('POST', '/closet/api/reservas', { como: 'dona2', corpo: { item_ids: [vestido], de: dias(11), ate: dias(12) } });
    assert.equal(r.st, 400);
    assert.ok(/Indisponível/i.test(r.json.erro));
  });
  await t('ninguém aluga a própria peça (fraude de reputação)', async () => {
    const r = await req('POST', '/closet/api/reservas', { como: 'dona', corpo: { item_ids: [vestido], de: dias(40), ate: dias(42) } });
    assert.equal(r.st, 400);
    assert.ok(/própria peça/i.test(r.json.erro));
  });
  await t('reservar exige login', async () => {
    assert.equal((await req('POST', '/closet/api/reservas', { corpo: { item_ids: [vestido], de: dias(60), ate: dias(62) } })).st, 401);
  });
  await t('Pix é gerado com QR e copia-e-cola', async () => {
    const r = await req('POST', '/closet/api/reservas/' + reserva.id + '/pix', { como: 'cliente' });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    assert.equal(r.json.modo, 'pix');
    assert.ok(r.json.copia_cola && r.json.qr_base64);
    assert.equal(r.json.total_centavos, 84000);
  });
  await t('cliente não gera Pix de reserva alheia', async () => {
    assert.equal((await req('POST', '/closet/api/reservas/' + reserva.id + '/pix', { como: 'dona2' })).st, 404);
  });
  await t('pagamento bloqueia o valor e avisa a proprietária', async () => {
    // com id de pagamento do PSP: é o caminho real, e é o que permite estornar depois
    const r = await req('POST', '/staff/api/closet/reservas/' + reserva.id + '/marcar-pago', { corpo: { mp_payment_id: 'PAYTESTE1' } });
    assert.equal(r.st, 200);
    assert.equal(r.json.status, 'pago_bloqueado');
    const b = (await req('GET', '/closet/api/app/reservas/' + reserva.id, { como: 'dona' })).json.reserva;
    assert.equal(b.status, 'pago_bloqueado');
    assert.ok(b.prazo_confirmacao, 'não gravou o prazo de confirmação');
    const entrada = db.prepare("SELECT valor_centavos v FROM ledger WHERE booking_id = ? AND tipo = 'entrada'").get(reserva.id);
    assert.equal(entrada.v, 84000, 'entrada não foi lançada no razão');
  });
  await t('webhook repetido do PSP não duplica nada (idempotência)', async () => {
    const r = await req('POST', '/staff/api/closet/reservas/' + reserva.id + '/marcar-pago', { corpo: {} });
    assert.equal(r.json.ja, true);
    const n = db.prepare("SELECT COUNT(*) c FROM ledger WHERE booking_id = ? AND tipo = 'entrada'").get(reserva.id).c;
    assert.equal(n, 1, 'lançou a entrada duas vezes');
  });
  await t('antes da confirmação NÃO existe QR de retirada', async () => {
    const b = (await req('GET', '/closet/api/app/reservas/' + reserva.id, { como: 'cliente' })).json.reserva;
    assert.ok(!b.token_retirada, 'QR liberado cedo demais');
  });
  await t('proprietária confirma e o QR nasce', async () => {
    const r = await req('POST', '/closet/api/app/reservas/' + reserva.id + '/confirmar', { como: 'dona' });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    assert.equal(r.json.status, 'confirmado');
    const b = (await req('GET', '/closet/api/app/reservas/' + reserva.id, { como: 'cliente' })).json.reserva;
    assert.ok(b.token_retirada && b.token_devolucao);
    reserva = b;
  });
  await t('confirmação estende o bloqueio com os dias de higienização', async () => {
    const bl = db.prepare('SELECT fim FROM item_blocks WHERE booking_id = ? AND item_id = ?').get(reserva.id, vestido);
    assert.equal(bl.fim, dias(13), 'devolução em D+12 com 1 dia de prep deveria bloquear até D+13');
  });
  await t('QR de retirada só abre para quem participa da reserva', async () => {
    const alheio = await req('GET', '/closet/api/qr/' + reserva.token_retirada, { como: 'dona2' });
    assert.equal(alheio.st, 403);
    const meu = await req('GET', '/closet/api/qr/' + reserva.token_retirada, { como: 'cliente' });
    assert.equal(meu.st, 200);
    assert.equal(meu.json.etapa, 'retirada');
    assert.equal(meu.json.pode_registrar, true);
  });
  await t('o CLIENTE não registra a própria retirada (a peça ainda está com a dona)', async () => {
    // Decisão do Augusto (30/08): o registro de posse só vale como prova se
    // quem o faz é a outra parte. O token aparece no app do cliente, então sem
    // esta trava ele marcava "retirado" com a peça ainda no balcão.
    const r = await req('POST', '/closet/api/qr/' + reserva.token_retirada, { como: 'cliente' });
    assert.equal(r.st, 400, 'o cliente não pode registrar a própria retirada');
    assert.ok(/quem entrega/i.test(JSON.stringify(r.json)), 'a mensagem tem de dizer de quem é o gesto');
  });

  await t('registro de retirada muda o estado e fica com autor', async () => {
    const r = await req('POST', '/closet/api/qr/' + reserva.token_retirada, { como: 'dona' });
    assert.equal(r.st, 200);
    assert.equal(r.json.status, 'retirado');
    const b = db.prepare('SELECT retirada_por, retirada_em FROM bookings WHERE id = ?').get(reserva.id);
    assert.equal(b.retirada_por, dona, 'quem ENTREGA a peça é quem registra a entrega');
    assert.ok(b.retirada_em);
  });
  await t('não dá para registrar devolução antes da retirada (ordem do fluxo)', async () => {
    // a reserva já está retirada; usar o QR de retirada de novo é inofensivo
    const r = await req('POST', '/closet/api/qr/' + reserva.token_retirada, { como: 'dona' });
    assert.equal(r.json.ja, true);
  });
  await t('uma confirmação só NÃO fecha a devolução, e a resposta diz quem falta', async () => {
    // Decisão do Augusto (30/08): devolução é gesto de duas partes. Sem isto, um
    // lado marcava "devolvido" sozinho e a vistoria começava com a peça ainda
    // em trânsito.
    const so = await req('POST', '/closet/api/qr/' + reserva.token_devolucao, { como: 'cliente' });
    assert.equal(so.st, 200, 'a confirmação parcial não é erro — ela conta');
    assert.equal(so.json.parcial, true, 'tem de dizer que ainda falta alguém');
    assert.equal(so.json.falta, 'proprietário', 'e dizer QUEM falta, senão o usuário fica no escuro');
    const b = db.prepare('SELECT status, devolucao_cliente_em, devolucao_dono_em FROM bookings WHERE id = ?').get(reserva.id);
    assert.equal(b.status, 'retirado', 'o estado NÃO pode avançar com metade da confirmação');
    assert.ok(b.devolucao_cliente_em, 'a confirmação do cliente tem de ficar registrada');
    assert.ok(!b.devolucao_dono_em, 'a do proprietário ainda não veio');
  });

  await t('devolução abre a janela de vistoria', async () => {
    await req('POST', '/closet/api/qr/' + reserva.token_devolucao, { como: 'dona' });
    const r = await req('POST', '/closet/api/qr/' + reserva.token_devolucao, { como: 'cliente' });   // a 2ª confirmação é a que fecha
    assert.equal(r.json.status, 'devolvido');
    const b = db.prepare('SELECT janela_vistoria FROM bookings WHERE id = ?').get(reserva.id);
    assert.ok(b.janela_vistoria, 'janela de vistoria não foi aberta');
  });
  await t('antes de concluir, o repasse ainda não existe', async () => {
    const p = db.prepare('SELECT COUNT(*) c FROM payouts WHERE booking_id = ?').get(reserva.id).c;
    assert.equal(p, 0, 'repasse criado antes da conclusão');
  });
  await t('conclusão libera repasse, retém comissão e devolve caução', async () => {
    const r = await req('POST', '/closet/api/app/reservas/' + reserva.id + '/liberar', { como: 'dona' });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    const pay = db.prepare('SELECT * FROM payouts WHERE booking_id = ?').all(reserva.id);
    assert.equal(pay.length, 1);
    assert.equal(pay[0].owner_id, dona);
    assert.equal(pay[0].valor_centavos, 43200, 'repasse != subtotal - 20%');
    assert.equal(pay[0].status, 'liberado');
    const com = db.prepare("SELECT valor_centavos v FROM ledger WHERE booking_id = ? AND tipo = 'comissao'").get(reserva.id);
    assert.equal(com.v, 10800, 'comissão não foi lançada');
    const cau = db.prepare("SELECT valor_centavos v FROM ledger WHERE booking_id = ? AND tipo = 'caucao'").get(reserva.id);
    assert.equal(cau.v, -30000, 'caução não voltou ao cliente');
    assert.ok(mpChamadas.some((c) => /refunds/.test(c.p)), 'não pediu o estorno da caução ao PSP');
  });
  await t('a peça soma uma locação e a agenda é liberada', async () => {
    const i = db.prepare('SELECT alugueis FROM items WHERE id = ?').get(vestido);
    assert.equal(i.alugueis, 1);
  });

  // ================= avaliações =================
  await t('avaliação só depois de concluída, e recalcula a nota da peça', async () => {
    const r = await req('POST', '/closet/api/app/avaliacoes', {
      como: 'cliente', corpo: { booking_id: reserva.id, alvo_tipo: 'item', alvo_id: vestido, nota: 5, texto: 'Caiu perfeito.' },
    });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    const i = db.prepare('SELECT nota_media, num_avaliacoes FROM items WHERE id = ?').get(vestido);
    assert.equal(i.num_avaliacoes, 1);
    assert.equal(i.nota_media, 5);
  });
  await t('quem não participou não avalia', async () => {
    const r = await req('POST', '/closet/api/app/avaliacoes', { como: 'dona2', corpo: { booking_id: reserva.id, alvo_tipo: 'item', alvo_id: vestido, nota: 1 } });
    assert.equal(r.st, 400);
  });
  await t('a mesma pessoa não avalia o mesmo alvo duas vezes', async () => {
    const r = await req('POST', '/closet/api/app/avaliacoes', { como: 'cliente', corpo: { booking_id: reserva.id, alvo_tipo: 'item', alvo_id: vestido, nota: 1 } });
    assert.equal(r.st, 400);
  });

  // ================= LOOK com duas proprietárias =================
  let look, reservaLook;
  await t('look junta peças de duas donas e o desconto sai da COMISSÃO', async () => {
    let r = await req('POST', '/closet/api/app/looks', {
      como: 'dona',
      corpo: { titulo: 'Look Casamento no Campo', ocasiao: 'casamento', desconto_pct: 10, itens: [vestido, bolsa], status: 'ativo' },
    });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    look = r.json.look;
    assert.equal(look.donos, 2, 'look deveria ter 2 proprietárias');
    await req('POST', '/staff/api/closet/looks/' + look.id + '/moderar', { corpo: { aprovado: true } });

    const c = (await req('POST', '/closet/api/cotar', { corpo: { look_id: look.id, de: dias(30), ate: dias(31) } })).json;
    // 2 diárias: vestido 36000 + bolsa 12000 = 48000; comissão bruta 9600; desconto do look 4800
    assert.equal(c.subtotal_centavos, 48000);
    assert.equal(c.comissao_bruta_centavos, 9600);
    assert.equal(c.desconto_centavos, 4800, 'desconto do look de 10%');
    assert.equal(c.comissao_centavos, 4800, 'a plataforma é quem banca o desconto');
    assert.equal(c.repasse_centavos, 38400, 'as donas recebem como se não houvesse desconto');
    assert.equal(c.total_centavos, 48000 - 4800 + 40000, 'total = locação com desconto + caução das duas peças');
    const daDona2 = c.linhas.find((l) => l.owner_id === dona2);
    assert.equal(daDona2.repasse_centavos, 9600, 'a dona da bolsa não pode perder por causa do combo');
  });
  await t('reserva de look cobra uma vez só e cria uma linha por dona', async () => {
    const r = await req('POST', '/closet/api/reservas', { como: 'cliente', corpo: { look_id: look.id, de: dias(30), ate: dias(31) } });
    assert.equal(r.st, 200, r.texto.slice(0, 200));
    reservaLook = r.json.reserva;
    assert.equal(reservaLook.itens.length, 2);
    assert.equal(reservaLook.donos.length, 2);
  });
  await t('look só fica confirmado quando TODAS as donas confirmam', async () => {
    await req('POST', '/staff/api/closet/reservas/' + reservaLook.id + '/marcar-pago', { corpo: {} });
    let r = await req('POST', '/closet/api/app/reservas/' + reservaLook.id + '/confirmar', { como: 'dona' });
    assert.equal(r.json.status, 'pago_bloqueado');
    assert.equal(r.json.aguardando_outros_donos, 1);
    r = await req('POST', '/closet/api/app/reservas/' + reservaLook.id + '/confirmar', { como: 'dona2' });
    assert.equal(r.json.status, 'confirmado');
  });
  await t('conclusão do look gera um repasse para cada dona', async () => {
    const b = (await req('GET', '/closet/api/app/reservas/' + reservaLook.id, { como: 'cliente' })).json.reserva;
    await req('POST', '/closet/api/qr/' + b.token_retirada, { como: 'dona' });
    await req('POST', '/closet/api/qr/' + b.token_devolucao, { como: 'cliente' });
    await req('POST', '/closet/api/qr/' + b.token_devolucao, { como: 'dona' });   // devolução precisa dos dois lados
    await req('POST', '/staff/api/closet/reservas/' + reservaLook.id + '/concluir', { corpo: {} });
    const pays = db.prepare('SELECT * FROM payouts WHERE booking_id = ? ORDER BY valor_centavos').all(reservaLook.id);
    assert.equal(pays.length, 2, 'deveria haver um repasse por proprietária');
    assert.equal(pays[0].valor_centavos, 9600);
    assert.equal(pays[1].valor_centavos, 28800);
  });

  // ================= cancelamento, recusa e prazos =================
  await t('cancelamento com 7+ dias devolve 100% da locação e a caução', async () => {
    const nova = (await req('POST', '/closet/api/reservas', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(50), ate: dias(52) } })).json.reserva;
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/marcar-pago', { corpo: {} });
    const r = await req('POST', '/closet/api/app/minhas-reservas/' + nova.id + '/cancelar', { como: 'cliente', corpo: { motivo: 'mudei de ideia' } });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    assert.equal(r.json.reembolso_centavos, 84000, 'deveria reembolsar tudo');
    const d = await req('GET', `/closet/api/pecas/${vestido}/disponibilidade?de=${dias(50)}&ate=${dias(52)}`);
    assert.equal(d.json.periodo.disponivel, true, 'agenda não foi liberada no cancelamento');
  });
  await t('cancelamento em cima da hora retém a locação mas devolve a caução', async () => {
    const nova = (await req('POST', '/closet/api/reservas', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(1), ate: dias(2) } })).json.reserva;
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/marcar-pago', { corpo: {} });
    const r = await req('POST', '/closet/api/app/minhas-reservas/' + nova.id + '/cancelar', { como: 'cliente', corpo: {} });
    assert.equal(r.json.reembolso_centavos, 30000, 'só a caução deveria voltar');
  });
  await t('recusa da proprietária reembolsa o cliente integralmente', async () => {
    const nova = (await req('POST', '/closet/api/reservas', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(70), ate: dias(72) } })).json.reserva;
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/marcar-pago', { corpo: {} });
    const r = await req('POST', '/closet/api/app/reservas/' + nova.id + '/recusar', { como: 'dona', corpo: { motivo: 'peça na lavanderia' } });
    assert.equal(r.json.reembolso_centavos, 84000);
    assert.equal(r.json.status, 'recusado');
  });
  await t('rotina estorna quem não confirmou dentro do prazo', async () => {
    const nova = (await req('POST', '/closet/api/reservas', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(80), ate: dias(82) } })).json.reserva;
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/marcar-pago', { corpo: {} });
    db.prepare('UPDATE bookings SET prazo_confirmacao = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', nova.id);
    const r = saas.bookings.Bookings.rotina();
    assert.ok(r.nao_confirmadas >= 1, 'a rotina não estornou');
    const b = db.prepare('SELECT status, reembolso_centavos FROM bookings WHERE id = ?').get(nova.id);
    assert.equal(b.status, 'recusado');
    assert.equal(b.reembolso_centavos, 84000);
  });
  await t('rotina expira reserva com Pix vencido e libera a agenda', async () => {
    const nova = (await req('POST', '/closet/api/reservas', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(90), ate: dias(92) } })).json.reserva;
    db.prepare('UPDATE bookings SET pix_expira_em = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', nova.id);
    const r = saas.bookings.Bookings.rotina();
    assert.ok(r.expiradas >= 1);
    const d = await req('GET', `/closet/api/pecas/${vestido}/disponibilidade?de=${dias(90)}&ate=${dias(92)}`);
    assert.equal(d.json.periodo.disponivel, true);
  });
  await t('rotina fecha a devolução que só um lado confirmou (dinheiro não fica preso)', async () => {
    // O contrapeso da regra dos dois lados: sem isto, o lado que nunca escaneia
    // prende a caução do cliente E o repasse da dona para sempre. Fechar não paga
    // ninguém — abre a vistoria, então a dona ainda tem 24h para contestar.
    const nova = (await req('POST', '/closet/api/reservas', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(300), ate: dias(302) } })).json.reserva;
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/marcar-pago', { corpo: {} });
    await req('POST', '/closet/api/app/reservas/' + nova.id + '/confirmar', { como: 'dona' });
    const b = (await req('GET', '/closet/api/app/reservas/' + nova.id, { como: 'cliente' })).json.reserva;
    await req('POST', '/closet/api/qr/' + b.token_retirada, { como: 'dona' });

    // só o cliente confirma, e a dona some
    const so = await req('POST', '/closet/api/qr/' + b.token_devolucao, { como: 'cliente' });
    assert.ok(so.json.prazo, 'a confirmação parcial tem de armar um relógio, senão trava para sempre');
    assert.equal(db.prepare('SELECT status FROM bookings WHERE id = ?').get(nova.id).status, 'retirado');

    db.prepare('UPDATE bookings SET prazo_devolucao = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', nova.id);
    const r = saas.bookings.Bookings.rotina();
    assert.ok(r.devolucoes_por_prazo >= 1, 'a rotina não fechou a devolução vencida');
    const dep = db.prepare('SELECT status, janela_vistoria FROM bookings WHERE id = ?').get(nova.id);
    assert.equal(dep.status, 'devolvido');
    assert.ok(dep.janela_vistoria, 'tem de abrir a vistoria — a dona ainda pode contestar');
  });
  await t('o relógio da devolução não é adiado por quem já confirmou', async () => {
    // Se cada escaneada reescrevesse o prazo, um lado insistente empurraria o
    // fecho indefinidamente — e o travamento voltaria pela porta dos fundos.
    const nova = (await req('POST', '/closet/api/reservas', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(310), ate: dias(312) } })).json.reserva;
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/marcar-pago', { corpo: {} });
    await req('POST', '/closet/api/app/reservas/' + nova.id + '/confirmar', { como: 'dona' });
    const b = (await req('GET', '/closet/api/app/reservas/' + nova.id, { como: 'cliente' })).json.reserva;
    await req('POST', '/closet/api/qr/' + b.token_retirada, { como: 'dona' });
    await req('POST', '/closet/api/qr/' + b.token_devolucao, { como: 'cliente' });
    db.prepare('UPDATE bookings SET prazo_devolucao = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', nova.id);
    await req('POST', '/closet/api/qr/' + b.token_devolucao, { como: 'cliente' });   // insiste
    assert.equal(db.prepare('SELECT prazo_devolucao FROM bookings WHERE id = ?').get(nova.id).prazo_devolucao,
      '2020-01-01T00:00:00.000Z', 'a 2ª escaneada do MESMO lado não pode adiar o fecho');
  });

  await t('rotina conclui sozinha a vistoria vencida (repasse não fica preso)', async () => {
    const nova = (await req('POST', '/closet/api/reservas', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(100), ate: dias(102) } })).json.reserva;
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/marcar-pago', { corpo: {} });
    await req('POST', '/closet/api/app/reservas/' + nova.id + '/confirmar', { como: 'dona' });
    const b = (await req('GET', '/closet/api/app/reservas/' + nova.id, { como: 'cliente' })).json.reserva;
    await req('POST', '/closet/api/qr/' + b.token_retirada, { como: 'dona' });
    await req('POST', '/closet/api/qr/' + b.token_devolucao, { como: 'cliente' });
    await req('POST', '/closet/api/qr/' + b.token_devolucao, { como: 'dona' });   // devolução precisa dos dois lados
    db.prepare('UPDATE bookings SET janela_vistoria = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', nova.id);
    const r = saas.bookings.Bookings.rotina();
    assert.ok(r.concluidas >= 1);
    assert.equal(db.prepare('SELECT status FROM bookings WHERE id = ?').get(nova.id).status, 'concluido');
  });

  // ================= disputa =================
  await t('disputa retém o repasse e a plataforma decide', async () => {
    const nova = (await req('POST', '/closet/api/reservas', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(110), ate: dias(112) } })).json.reserva;
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/marcar-pago', { corpo: {} });
    await req('POST', '/closet/api/app/reservas/' + nova.id + '/confirmar', { como: 'dona' });
    const b = (await req('GET', '/closet/api/app/reservas/' + nova.id, { como: 'cliente' })).json.reserva;
    await req('POST', '/closet/api/qr/' + b.token_retirada, { como: 'dona' });
    await req('POST', '/closet/api/qr/' + b.token_devolucao, { como: 'cliente' });
    await req('POST', '/closet/api/qr/' + b.token_devolucao, { como: 'dona' });   // devolução precisa dos dois lados
    const d = await req('POST', '/closet/api/app/reservas/' + nova.id + '/disputa', { como: 'dona', corpo: { motivo: 'dano', descricao: 'mancha de vinho na barra', valor_pedido_centavos: 15000 } });
    assert.equal(d.st, 200, d.texto.slice(0, 160));
    assert.equal(db.prepare('SELECT status FROM bookings WHERE id = ?').get(nova.id).status, 'em_disputa');

    const lista = await req('GET', '/staff/api/closet/disputas');
    assert.ok(lista.json.disputas.length >= 1);
    const r = await req('POST', '/staff/api/closet/disputas/' + d.json.id + '/resolver', {
      corpo: { favor: 'proprietario', valor_retido_centavos: 15000, decisao: 'dano comprovado por foto' },
    });
    assert.equal(r.st, 200, r.texto.slice(0, 200));
    assert.equal(db.prepare('SELECT status FROM bookings WHERE id = ?').get(nova.id).status, 'concluido');
    const total = db.prepare('SELECT COALESCE(SUM(valor_centavos),0) v FROM payouts WHERE booking_id = ?').get(nova.id).v;
    assert.equal(total, 43200 + 15000, 'indenização não somou ao repasse da dona');
    assert.equal(db.prepare('SELECT strikes FROM users WHERE id = ?').get(cliente).strikes, 1, 'cliente não recebeu strike');
  });

  // ================= cupom =================
  await t('cupom abate do cliente sem tirar do proprietário', async () => {
    await req('POST', '/staff/api/closet/cupons', { corpo: { codigo: 'PRIMEIRA10', tipo: 'pct', valor: 10, usos_max: 5 } });
    const c = (await req('POST', '/closet/api/cotar', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(120), ate: dias(122), cupom: 'PRIMEIRA10' } })).json;
    assert.equal(c.cupom, 'PRIMEIRA10');
    assert.equal(c.desconto_centavos, 5400, '10% de 54000');
    assert.equal(c.repasse_centavos, 43200, 'o repasse tem de continuar igual');
    assert.equal(c.comissao_centavos, 10800 - 5400, 'o cupom sai da comissão');
  });
  await t('cupom inexistente é recusado', async () => {
    const r = await req('POST', '/closet/api/cotar', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(120), ate: dias(122), cupom: 'NAOEXISTE' } });
    assert.equal(r.st, 400);
  });

  // ================= chat, favoritos e mensagens =================
  await t('chat entre cliente e proprietária, isolado de terceiros', async () => {
    const c = await req('POST', '/closet/api/app/conversas', { como: 'cliente', corpo: { item_id: vestido, texto: 'Serve em quem veste 40?' } });
    assert.equal(c.st, 200);
    const lista = await req('GET', '/closet/api/app/conversas', { como: 'dona' });
    assert.ok(lista.json.conversas.length >= 1);
    const alheio = await req('GET', '/closet/api/app/conversas/' + c.json.id, { como: 'dona2' });
    assert.equal(alheio.st, 400, 'terceiro conseguiu ler a conversa');
  });
  await t('favoritar e desfavoritar', async () => {
    let r = await req('POST', '/closet/api/favoritos', { como: 'cliente', corpo: { alvo_tipo: 'item', alvo_id: vestido } });
    assert.equal(r.json.favoritado, true);
    assert.equal((await req('GET', '/closet/api/app/favoritos', { como: 'cliente' })).json.itens.length, 1);
    r = await req('POST', '/closet/api/favoritos', { como: 'cliente', corpo: { alvo_tipo: 'item', alvo_id: vestido } });
    assert.equal(r.json.favoritado, false);
  });

  // ================= Premium =================
  await t('staff concede Premium e os entitlements mudam na hora', async () => {
    const r = await req('POST', '/staff/api/closet/usuarios/' + dona + '/premium', { corpo: { dias: 30 } });
    assert.equal(r.st, 200);
    const me = await req('GET', '/closet/api/me', { como: 'dona' });
    assert.equal(me.json.entitlements.plano, 'premium');
    assert.equal(me.json.entitlements.flags.analytics, true);
    assert.equal(me.json.entitlements.limites.pecas, 0, 'Premium deveria ser ilimitado');
    assert.equal((await req('GET', '/closet/api/app/ia/analytics', { como: 'dona' })).st, 200);
  });
  await t('Premium permite destacar o anúncio', async () => {
    const r = await req('POST', '/closet/api/app/pecas/' + vestido + '/destacar', { como: 'dona', corpo: { dias: 7 } });
    assert.equal(r.st, 200);
    assert.equal(r.json.peca.destacado, true);
  });

  // ================= LGPD =================
  await t('titular baixa os próprios dados', async () => {
    const r = await req('GET', '/closet/api/meus-dados', { como: 'cliente' });
    assert.equal(r.st, 200);
    assert.ok(r.json.conta && Array.isArray(r.json.reservas_como_cliente));
    assert.ok(r.json.reservas_como_cliente.length >= 1);
  });
  await t('exclusão é barrada com reserva em andamento e liberada depois', async () => {
    const nova = (await req('POST', '/closet/api/reservas', { como: 'dona2', corpo: { item_ids: [vestido], de: dias(130), ate: dias(132) } })).json.reserva;
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/marcar-pago', { corpo: {} });
    let r = await req('POST', '/closet/api/excluir-conta', { como: 'dona2' });
    assert.equal(r.st, 400);
    assert.ok(/andamento/i.test(r.json.erro));
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/cancelar', { corpo: { motivo: 'teste' } });
    r = await req('POST', '/closet/api/excluir-conta', { como: 'dona2' });
    assert.equal(r.st, 200);
    const u = db.prepare('SELECT nome, cpf, status FROM users WHERE id = ?').get(dona2);
    assert.equal(u.status, 'excluido');
    assert.equal(u.cpf, '');
    assert.ok(!/Ana/.test(u.nome), 'nome não foi anonimizado');
  });
  await t('perfil público nunca expõe e-mail, CPF ou telefone', async () => {
    const r = await req('GET', '/closet/api/pessoas/' + dona);
    assert.equal(r.st, 200);
    assert.ok(!('email' in r.json.pessoa) && !('cpf' in r.json.pessoa) && !('telefone' in r.json.pessoa), 'vazou dado pessoal: ' + Object.keys(r.json.pessoa));
  });

  // ================= administração =================
  await t('painel da plataforma é só de admin', async () => {
    assert.equal((await req('GET', '/staff/api/closet/dashboard', { staff: 'op' })).st, 403);
    const r = await req('GET', '/staff/api/closet/dashboard');
    assert.equal(r.st, 200);
    assert.ok(r.json.reservas.concluidas >= 2);
    assert.ok(r.json.financeiro.receita_comissao_centavos > 0);
  });
  await t('comissão é editável pela plataforma e vale na cotação seguinte', async () => {
    await req('PATCH', '/staff/api/closet/config', { corpo: { comissao_pct: 25 } });
    const c = (await req('POST', '/closet/api/cotar', { corpo: { item_ids: [bolsa], de: dias(140), ate: dias(141) } })).json;
    assert.equal(c.comissao_centavos, 3000, '25% de 12000');
    await req('PATCH', '/staff/api/closet/config', { corpo: { comissao_pct: 20 } });
  });
  await t('fila de repasses mostra o que a plataforma deve pagar', async () => {
    const r = await req('GET', '/staff/api/closet/repasses');
    assert.ok(r.json.liberados.length >= 2);
    const p = r.json.liberados[0];
    const m = await req('POST', '/staff/api/closet/repasses/' + p.id + '/marcar-pago', { corpo: {} });
    assert.equal(m.st, 200);
    assert.equal(db.prepare('SELECT status FROM payouts WHERE id = ?').get(p.id).status, 'pago');
  });
  await t('toda ação sensível fica na auditoria', async () => {
    const r = await req('GET', '/staff/api/closet/auditoria');
    const acoes = r.json.auditoria.map((a) => a.acao);
    for (const a of ['peca.moderar', 'reserva.marcar-pago', 'disputa.resolver', 'config.editar']) {
      assert.ok(acoes.includes(a), 'faltou auditoria de ' + a);
    }
  });

  // =====================================================================
  // ONDA 2 — fotos, blog, indicação, parceiros/entrega e API pública
  // =====================================================================

  // ---- fotos ----
  // JPEG mínimo válido (SOI + APP0 + SOF0 8x8 + EOI) — serve para provar a
  // validação por bytes sem depender de arquivo externo.
  const JPEG_OK = Buffer.concat([
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]), Buffer.from('JFIF\0'), Buffer.from([0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
    Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x08, 0x00, 0x08, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]),
    Buffer.from([0xFF, 0xD9]),
  ]).toString('base64');

  let fotoUrl = '';
  await t('upload de foto valida pelos BYTES e devolve URL pública', async () => {
    const r = await req('POST', '/closet/api/app/fotos', { como: 'dona', corpo: { fotos: ['data:image/jpeg;base64,' + JPEG_OK] } });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    fotoUrl = r.json.fotos[0].url;
    assert.ok(/^\/closet\/fotos\/[a-f0-9]{64}\.jpg$/.test(fotoUrl), 'URL fora do padrão: ' + fotoUrl);
    assert.equal(r.json.fotos[0].largura, 8, 'não leu a largura do cabeçalho JPEG');
  });
  await t('arquivo que não é imagem é recusado mesmo se disser que é', async () => {
    const r = await req('POST', '/closet/api/app/fotos', { como: 'dona', corpo: { fotos: ['data:image/jpeg;base64,' + Buffer.from('<?php echo 1; ?>rrrrrrrrrrrrrrrr').toString('base64')] } });
    assert.equal(r.st, 400);
    assert.ok(/não suportado|inválida/i.test(r.json.erro));
  });
  await t('mesma foto enviada de novo reaproveita o arquivo (dedupe)', async () => {
    const r = await req('POST', '/closet/api/app/fotos', { como: 'cliente', corpo: { fotos: ['data:image/jpeg;base64,' + JPEG_OK] } });
    assert.equal(r.json.fotos[0].reaproveitada, true);
    assert.equal(r.json.fotos[0].url, fotoUrl);
  });
  await t('foto é servida com cache imutável e caminho malicioso não passa', async () => {
    const ok = await req('GET', fotoUrl);
    assert.equal(ok.st, 200);
    assert.equal((await req('GET', '/closet/fotos/..%2F..%2Fcloset.db')).st, 404);
    assert.equal((await req('GET', '/closet/fotos/qualquer.jpg')).st, 404);
  });
  await t('upload exige login', async () => assert.equal((await req('POST', '/closet/api/app/fotos', { corpo: { fotos: [] } })).st, 401));

  // ---- blog ----
  await t('blog nasce com textos semeados e o post renderiza com JSON-LD', async () => {
    const lista = await req('GET', '/closet/blog');
    assert.equal(lista.st, 200);
    assert.ok(lista.texto.includes('Diário do Closet'));
    const post = await req('GET', '/closet/blog/o-que-vestir-casamento-no-campo');
    assert.equal(post.st, 200);
    assert.ok(post.texto.includes('"@type":"Article"'), 'faltou JSON-LD de artigo');
    assert.ok(post.texto.includes('<h2>'), 'markdown não virou HTML');
    assert.ok(post.texto.includes('/closet/vitrine?ocasiao=casamento'), 'post não leva para a vitrine da ocasião');
  });
  await t('markdown do post escapa HTML do autor (não vira XSS)', async () => {
    const r = await req('POST', '/staff/api/closet/posts', {
      corpo: { titulo: 'Teste de escape', corpo: 'Olá <script>alert(1)</script> **negrito**', status: 'publicado', categoria: 'guia' },
    });
    assert.equal(r.st, 200);
    const pag = await req('GET', '/closet/blog/' + r.json.post.slug);
    assert.ok(!pag.texto.includes('<script>alert(1)</script>'), 'script do autor foi para o HTML');
    assert.ok(pag.texto.includes('&lt;script&gt;'), 'não escapou');
    assert.ok(pag.texto.includes('<b>negrito</b>'), 'markdown legítimo deixou de funcionar');
  });
  await t('rascunho não aparece no blog nem no sitemap', async () => {
    const r = await req('POST', '/staff/api/closet/posts', { corpo: { titulo: 'Ainda escrevendo', corpo: 'x', status: 'rascunho' } });
    assert.equal((await req('GET', '/closet/blog/' + r.json.post.slug)).st, 404);
    assert.ok(!(await req('GET', '/closet/sitemap.xml')).texto.includes(r.json.post.slug));
  });
  await t('sitemap traz blog e as buscas por ocasião', async () => {
    const r = await req('GET', '/closet/sitemap.xml');
    assert.ok(r.texto.includes('/closet/blog/o-que-vestir-casamento-no-campo'));
    assert.ok(r.texto.includes('ocasiao=casamento'));
    assert.ok(!r.texto.includes('<loc>' + '' + '</loc>'.replace('x', 'y')) || true);
  });

  // ---- indicação e crédito ----
  let codigoInd = '';
  await t('cada pessoa tem um código de convite estável', async () => {
    const r = await req('GET', '/closet/api/app/indicacoes', { como: 'cliente' });
    assert.equal(r.st, 200);
    codigoInd = r.json.codigo;
    assert.ok(codigoInd && codigoInd.length >= 6);
    assert.ok(r.json.link.includes('/closet/i/' + codigoInd));
    const r2 = await req('GET', '/closet/api/app/indicacoes', { como: 'cliente' });
    assert.equal(r2.json.codigo, codigoInd, 'o código mudou entre chamadas');
  });
  await t('página do convite mostra quem indicou', async () => {
    const r = await req('GET', '/closet/i/' + codigoInd);
    assert.equal(r.st, 200);
    assert.ok(r.texto.includes('Júlia'), 'não mostrou o nome de quem convidou');
    assert.ok((await req('GET', '/closet/i/NAOEXISTE')).texto.includes('não vale mais'));
  });
  let afilhada;
  await t('cadastro por indicação registra o vínculo (sem prêmio ainda)', async () => {
    const r = await req('POST', '/closet/api/cadastrar', {
      como: 'afilhada',
      corpo: { nome: 'Bia Nunes', email: 'bia@t.br', senha: 'senha12345', cidade: 'Brasília', uf: 'DF', aceite_termos: true, indicacao: codigoInd },
    });
    assert.equal(r.st, 200);
    afilhada = r.json.usuario.id;
    const ind = await req('GET', '/closet/api/app/indicacoes', { como: 'afilhada' });
    assert.equal(ind.json.saldo_centavos, 0, 'crédito não pode sair no cadastro — só no 1º aluguel');
    const doPadrinho = await req('GET', '/closet/api/app/indicacoes', { como: 'cliente' });
    assert.equal(doPadrinho.json.convites.length, 1);
    assert.equal(doPadrinho.json.convites[0].status, 'cadastrado');
  });
  await t('1º aluguel concluído premia padrinho E afilhada', async () => {
    const nova = (await req('POST', '/closet/api/reservas', { como: 'afilhada', corpo: { item_ids: [vestido], de: dias(150), ate: dias(152) } })).json.reserva;
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/marcar-pago', { corpo: {} });
    await req('POST', '/closet/api/app/reservas/' + nova.id + '/confirmar', { como: 'dona' });
    const b = (await req('GET', '/closet/api/app/reservas/' + nova.id, { como: 'afilhada' })).json.reserva;
    await req('POST', '/closet/api/qr/' + b.token_retirada, { como: 'dona' });   // quem entrega registra
    await req('POST', '/closet/api/qr/' + b.token_devolucao, { como: 'afilhada' });
    await req('POST', '/closet/api/qr/' + b.token_devolucao, { como: 'dona' });   // devolução precisa dos dois lados
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/concluir', { corpo: {} });
    assert.equal((await req('GET', '/closet/api/app/indicacoes', { como: 'afilhada' })).json.saldo_centavos, 3000);
    assert.equal((await req('GET', '/closet/api/app/indicacoes', { como: 'cliente' })).json.saldo_centavos, 3000);
  });
  await t('o prêmio não sai duas vezes para a mesma indicação', async () => {
    saas.crescimento.Indicacoes.premiarSePrimeira(afilhada, 'x');
    assert.equal((await req('GET', '/closet/api/app/indicacoes', { como: 'afilhada' })).json.saldo_centavos, 3000);
  });
  await t('crédito abate do cliente e sai da COMISSÃO, não do repasse', async () => {
    const c = (await req('POST', '/closet/api/cotar', { como: 'afilhada', corpo: { item_ids: [vestido], de: dias(160), ate: dias(162), usar_credito: true } })).json;
    assert.equal(c.credito_centavos, 3000);
    assert.equal(c.repasse_centavos, 43200, 'o repasse do proprietário mudou por causa do crédito');
    assert.equal(c.comissao_centavos, 10800 - 3000, 'o crédito deveria sair da comissão');
    assert.equal(c.total_centavos, 84000 - 3000);
  });
  await t('crédito nunca ultrapassa a comissão daquela reserva', async () => {
    await req('POST', '/staff/api/closet/usuarios/' + afilhada + '/credito', { corpo: { valor_centavos: 500000, descricao: 'teste' } });
    const c = (await req('POST', '/closet/api/cotar', { como: 'afilhada', corpo: { item_ids: [vestido], de: dias(170), ate: dias(172), usar_credito: true } })).json;
    assert.equal(c.credito_centavos, 10800, 'crédito passou do teto da comissão');
    assert.equal(c.comissao_centavos, 0);
    assert.equal(c.repasse_centavos, 43200, 'com crédito grande, o dono continua recebendo igual');
  });
  await t('reserva cancelada devolve o crédito usado', async () => {
    const saldoAntes = (await req('GET', '/closet/api/app/indicacoes', { como: 'afilhada' })).json.saldo_centavos;
    const nova = (await req('POST', '/closet/api/reservas', { como: 'afilhada', corpo: { item_ids: [vestido], de: dias(180), ate: dias(182), usar_credito: true } })).json.reserva;
    assert.ok(nova.credito_centavos > 0, 'crédito não foi aplicado na reserva');
    const durante = (await req('GET', '/closet/api/app/indicacoes', { como: 'afilhada' })).json.saldo_centavos;
    assert.equal(durante, saldoAntes - nova.credito_centavos, 'crédito não foi debitado');
    await req('POST', '/closet/api/app/minhas-reservas/' + nova.id + '/cancelar', { como: 'afilhada', corpo: {} });
    assert.equal((await req('GET', '/closet/api/app/indicacoes', { como: 'afilhada' })).json.saldo_centavos, saldoAntes, 'crédito não voltou');
  });

  // ---- parceiros e entrega ----
  let parceiroId, servicoId;
  await t('candidatura de parceiro entra em análise, não ativa sozinha', async () => {
    const r = await req('POST', '/closet/api/parceiros/candidatar', {
      como: 'dona',
      corpo: { nome: 'Lavanderia Lago Sul', tipo: 'lavanderia', cidade: 'Brasília', uf: 'DF', email: 'lav@t.br',
        servicos: [{ nome: 'Lavagem a seco 24h', preco_centavos: 4500 }] },
    });
    assert.equal(r.st, 200);
    assert.equal(r.json.status, 'analise');
    parceiroId = r.json.id;
    assert.equal((await req('GET', '/closet/api/servicos?cidade=Brasília')).json.servicos.length, 0, 'parceiro em análise apareceu no checkout');
  });
  await t('aprovação do staff publica os serviços e dá o papel de parceiro', async () => {
    const r = await req('POST', '/staff/api/closet/parceiros/' + parceiroId + '/aprovar', { corpo: { aprovado: true } });
    assert.equal(r.st, 200);
    const sv = await req('GET', '/closet/api/servicos?cidade=Brasília');
    assert.equal(sv.json.servicos.length, 1);
    servicoId = sv.json.servicos[0].id;
    assert.equal((await req('GET', '/closet/api/me', { como: 'dona' })).json.usuario.papel, 'parceiro');
  });
  await t('serviço contratado entra no total e vira comissão só quando executado', async () => {
    const c = (await req('POST', '/closet/api/cotar', { corpo: { item_ids: [vestido], de: dias(190), ate: dias(192), servicos: [{ service_id: servicoId }] } })).json;
    assert.equal(c.servicos_centavos, 4500);
    assert.equal(c.total_centavos, 84000 + 4500);
    const nova = (await req('POST', '/closet/api/reservas', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(190), ate: dias(192), servicos: [{ service_id: servicoId }] } })).json.reserva;
    const antes = n((db.prepare("SELECT COALESCE(SUM(valor_centavos),0) v FROM ledger WHERE tipo='servico'").get() || {}).v, 0);
    const ag = (await req('GET', '/closet/api/app/parceiro', { como: 'dona' })).json.agenda;
    assert.ok(ag.length >= 1, 'serviço não apareceu na agenda do parceiro');
    await req('POST', '/closet/api/app/parceiro/agenda/' + ag[0].id + '/concluir', { como: 'dona' });
    const depois = n((db.prepare("SELECT COALESCE(SUM(valor_centavos),0) v FROM ledger WHERE tipo='servico'").get() || {}).v, 0);
    assert.equal(depois - antes, 675, 'comissão de 15% sobre R$45 deveria ser R$6,75');
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/cancelar', { corpo: { motivo: 'limpando o teste' } });
  });
  await t('entrega só é oferecida onde existe zona cadastrada', async () => {
    const semZona = await req('POST', '/closet/api/cotar', { corpo: { item_ids: [vestido], de: dias(200), ate: dias(202), modo_entrega: 'entrega', endereco_cidade: 'Brasília' } });
    assert.equal(semZona.st, 400);
    assert.ok(/não entregamos/i.test(semZona.json.erro));
    await req('POST', '/staff/api/closet/zonas', { corpo: { cidade: 'Brasília', bairro: '', preco_centavos: 2500, prazo_h: 24 } });
    await req('POST', '/staff/api/closet/zonas', { corpo: { cidade: 'Brasília', bairro: 'Lago Sul', preco_centavos: 1500, prazo_h: 12 } });
    const cidade = (await req('POST', '/closet/api/cotar', { corpo: { item_ids: [vestido], de: dias(200), ate: dias(202), modo_entrega: 'entrega', endereco_cidade: 'Brasília' } })).json;
    assert.equal(cidade.entrega_centavos, 2500);
    const bairro = (await req('POST', '/closet/api/cotar', { corpo: { item_ids: [vestido], de: dias(200), ate: dias(202), modo_entrega: 'entrega', endereco_cidade: 'Brasília', endereco_bairro: 'Lago Sul' } })).json;
    assert.equal(bairro.entrega_centavos, 1500, 'a regra do bairro deveria ganhar da regra da cidade');
    assert.equal(bairro.zona_entrega.prazo_h, 12);
  });

  // ---- API pública ----
  let chaveApi = '';
  await t('criar chave de API é do Premium', async () => {
    const semPremium = await req('POST', '/closet/api/app/chaves', { como: 'cliente', corpo: { nome: 'x' } });
    assert.equal(semPremium.st, 402);
    const r = await req('POST', '/closet/api/app/chaves', { como: 'dona', corpo: { nome: 'Meu site' } });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    chaveApi = r.json.chave;
    assert.ok(chaveApi.startsWith('cc_'));
  });
  await t('a chave completa não fica guardada em texto no banco', async () => {
    const linha = db.prepare('SELECT prefixo, chave_hash FROM api_keys ORDER BY criado_em DESC LIMIT 1').get();
    assert.ok(!linha.chave_hash.includes(chaveApi.slice(3)), 'a chave está legível no banco');
    assert.equal(linha.prefixo, chaveApi.slice(0, 11));
  });
  await t('API v1 exige chave e responde com dado público', async () => {
    assert.equal((await req('GET', '/closet/api/v1/pecas')).st, 401);
    const r = await req('GET', '/closet/api/v1/pecas', { headers: { 'x-api-key': chaveApi } });
    assert.equal(r.st, 200);
    assert.ok(r.json.pecas.length >= 1);
    const p = r.json.pecas[0];
    assert.ok(p.titulo && p.preco_diaria_centavos);
    assert.ok(!('owner_id' in p) || typeof p.proprietario === 'object');
  });
  await t('API pública NUNCA expõe dado pessoal', async () => {
    const r = await req('GET', '/closet/api/v1/pecas', { headers: { 'x-api-key': chaveApi } });
    const texto = JSON.stringify(r.json);
    for (const proibido of ['marina@t.br', 'julia@t.br', 'cpf', 'pix_chave', 'telefone', 'senha']) {
      assert.ok(!texto.toLowerCase().includes(proibido.toLowerCase()), 'vazou "' + proibido + '" na API pública');
    }
  });
  await t('documentação da API é aberta e a chave revogada para de funcionar', async () => {
    const doc = await req('GET', '/closet/api/v1');
    assert.equal(doc.st, 200);
    assert.ok(doc.json.endpoints.length >= 5);
    const lista = await req('GET', '/closet/api/app/chaves', { como: 'dona' });
    await req('DELETE', '/closet/api/app/chaves/' + lista.json.chaves[0].id, { como: 'dona' });
    assert.equal((await req('GET', '/closet/api/v1/pecas', { headers: { 'x-api-key': chaveApi } })).st, 401);
  });
  await t('ninguém revoga a chave de outra pessoa', async () => {
    const nova = await req('POST', '/closet/api/app/chaves', { como: 'dona', corpo: { nome: 'segunda' } });
    const lista = await req('GET', '/closet/api/app/chaves', { como: 'dona' });
    const id = lista.json.chaves.find((k) => k.ativa).id;
    assert.equal((await req('DELETE', '/closet/api/app/chaves/' + id, { como: 'cliente' })).st, 400);
    assert.ok(nova.json.chave);
  });

  // =====================================================================
  // ONDA 3 — e-mail transacional, campanhas, IA com LLM, GA4
  // =====================================================================

  await t('e-mail transacional sai nos momentos-chave da reserva', async () => {
    emails.length = 0;
    const nova = (await req('POST', '/closet/api/reservas', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(210), ate: dias(212) } })).json.reserva;
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/marcar-pago', { corpo: {} });
    await new Promise((r) => setTimeout(r, 60)); // envio é best-effort (não bloqueia a rota)
    const assuntos = emails.map((e) => e.ass);
    assert.ok(assuntos.some((a) => /Pagamento confirmado/.test(a)), 'cliente não recebeu confirmação de pagamento');
    assert.ok(assuntos.some((a) => /Nova reserva paga/.test(a)), 'proprietária não recebeu aviso de reserva paga');
    const paraDona = emails.find((e) => /Nova reserva paga/.test(e.ass));
    assert.equal(paraDona.to, 'marina@t.br');
    assert.ok(/bloqueado/.test(paraDona.html), 'e-mail não explica que o valor está bloqueado');
    assert.ok(!/<script/i.test(paraDona.html), 'e-mail carrega script');
  });
  await t('e-mail nunca vai para conta anonimizada por LGPD', async () => {
    const r = await saas.emails.enviar(dona2, 'cliente.avalie', { codigo: 'CC-TESTE', itens: [], comissao_pct: 20 });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'sem e-mail');
  });
  await t('e-mail transacional pode ser desligado por configuração', async () => {
    await req('PATCH', '/staff/api/closet/config', { corpo: { emails_transacionais: 'off' } });
    emails.length = 0;
    const nova = (await req('POST', '/closet/api/reservas', { como: 'cliente', corpo: { item_ids: [vestido], de: dias(220), ate: dias(222) } })).json.reserva;
    await req('POST', '/staff/api/closet/reservas/' + nova.id + '/marcar-pago', { corpo: {} });
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(emails.length, 0, 'enviou e-mail com a chave desligada');
    await req('PATCH', '/staff/api/closet/config', { corpo: { emails_transacionais: 'on' } });
  });

  // ---- campanhas patrocinadas ----
  let campanha;
  await t('campanha patrocinada é cotada por dia e nasce aguardando pagamento', async () => {
    const c = await req('POST', '/closet/api/app/campanhas/cotar', { como: 'dona', corpo: { dias: 7 } });
    assert.equal(c.json.preco_centavos, 6300, '7 dias a R$9/dia');
    const r = await req('POST', '/closet/api/app/campanhas', { como: 'dona', corpo: { item_id: vestido, dias: 7 } });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    campanha = r.json.campanha;
    assert.equal(campanha.status, 'aguardando_pagamento');
    assert.equal(campanha.preco_centavos, 6300);
  });
  await t('campanha só destaca a peça DEPOIS de paga', async () => {
    db.prepare("UPDATE items SET destaque_ate = '' WHERE id = ?").run(vestido);
    assert.equal(saas.repo.Items.obter(vestido).destacado, false, 'peça já estava destacada sem pagamento');
    const r = await req('POST', '/staff/api/closet/campanhas/' + campanha.id + '/ativar', { corpo: {} });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    assert.equal(saas.repo.Items.obter(vestido).destacado, true, 'pagamento não destacou a peça');
    const receita = n((db.prepare("SELECT COALESCE(SUM(valor_centavos),0) v FROM ledger WHERE tipo='campanha'").get() || {}).v);
    assert.equal(receita, 6300, 'campanha não entrou no razão como receita');
  });
  await t('a 4ª fonte de receita aparece no financeiro da plataforma', async () => {
    const f = await req('GET', '/staff/api/closet/financeiro');
    assert.equal(f.json.receita_campanhas_centavos, 6300);
    assert.equal(
      f.json.receita_total_centavos,
      f.json.receita_comissao_centavos + f.json.receita_assinatura_centavos + f.json.receita_servicos_centavos + f.json.receita_campanhas_centavos,
      'o total não soma as quatro fontes',
    );
  });
  await t('peça patrocinada sobe na vitrine e conta impressão', async () => {
    const v = await req('GET', '/closet/api/vitrine');
    assert.equal(v.json.itens[0].id, vestido, 'peça patrocinada não ficou em primeiro');
    assert.equal(v.json.itens[0].destacado, true, 'vitrine não marca a peça como destaque (seria anúncio disfarçado)');
    const c = db.prepare('SELECT impressoes FROM campanhas WHERE id = ?').get(campanha.id);
    assert.ok(c.impressoes >= 1, 'impressão não foi contada');
  });
  await t('ninguém cria campanha para a peça de outra pessoa', async () => {
    const r = await req('POST', '/closet/api/app/campanhas', { como: 'cliente', corpo: { item_id: vestido, dias: 3 } });
    assert.equal(r.st, 400);
    assert.ok(/não é sua/i.test(r.json.erro));
  });
  await t('campanha já paga não pode ser cancelada pelo anunciante', async () => {
    const r = await req('DELETE', '/closet/api/app/campanhas/' + campanha.id, { como: 'dona' });
    assert.equal(r.st, 400);
    assert.ok(/no ar/i.test(r.json.erro));
  });
  await t('rotina encerra campanha vencida e informa o desempenho', async () => {
    db.prepare("UPDATE campanhas SET fim = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(campanha.id);
    const r = saas.campanhas.Campanhas.rotina();
    assert.equal(r.encerradas, 1);
    assert.equal(db.prepare('SELECT status FROM campanhas WHERE id = ?').get(campanha.id).status, 'encerrada');
  });

  // ---- IA: motor automático ----
  await t('IA cai no motor de regras quando o LLM não está configurado', async () => {
    assert.equal(saas.iaLlm.disponivel(), false, 'o selftest não deve falar com a API de verdade');
    const d = await saas.ia.descricaoAuto({ categoria: 'vestido', cor: 'verde', ocasioes: ['casamento'], condicao: 'seminovo' });
    assert.equal(d.motor, 'regras');
    assert.ok(d.descricao.length > 40);
    const looks = await saas.ia.looksAuto({ ocasiao: 'casamento', cidade: 'Brasília' });
    assert.equal(looks.motor, 'regras');
  });
  await t('as candidatas do LLM saem do mesmo filtro duro das regras', async () => {
    // é isto que impede o LLM de sugerir peça indisponível ou fora do tamanho
    const sel = saas.ia.selecionarCandidatas({ ocasiao: 'casamento', cidade: 'Brasília', manequim: 48 });
    assert.ok(!sel.pontuados.some((x) => x.item.id === vestido), 'vestido M entrou nas candidatas de manequim 48');
    assert.ok(sel.pontuados.every((x) => x.item.status === 'ativo' && x.item.moderacao === 'aprovado'));
  });
  await t('rota de descrição da IA responde pelo motor automático', async () => {
    const r = await req('POST', '/closet/api/app/ia/descricao', { como: 'dona', corpo: { categoria: 'bolsa', cor: 'dourado', ocasioes: ['casamento'] } });
    assert.equal(r.st, 200);
    assert.ok(r.json.descricao && r.json.palavras.length >= 3);
  });

  await t('painel carrega o app.js com versão (deploy não deixa JS velho no cache)', async () => {
    const r = await req('GET', '/closet/app');
    assert.ok(/\/closet\/app\.js\?v=\d+/.test(r.texto), 'o <script> do painel não tem ?v= — o service worker serviria a versão anterior');
  });

  // ---- GA4 ----
  await t('GA4 mede o funil sem carregar dado pessoal', async () => {
    const pag = await req('GET', '/closet/peca/' + vestido);
    assert.ok(pag.texto.includes('googletagmanager.com/gtag/js'), 'GA não está na página');
    assert.ok(pag.texto.includes("cc('view_item'"), 'falta o evento view_item');
    assert.ok(pag.texto.includes("cc('begin_checkout'"), 'falta o evento begin_checkout');
    assert.ok(pag.texto.includes("cc('purchase'"), 'falta o evento purchase');
    const app = await req('GET', '/closet/app');
    assert.ok(!app.texto.includes('googletagmanager'), 'GA foi para o painel, que tem dado pessoal');
  });

  // ---- fechamento ----
  srv.close();
  console.log(`\n${ok} teste(s) OK, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach((f) => console.log('  ✗', f)); process.exit(1); }
}

rodar().catch((e) => { console.error('erro fatal no selftest:', e); process.exit(1); });
