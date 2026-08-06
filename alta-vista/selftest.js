// =====================================================================
// Villela Alta Vista 360 — suíte de testes. Sobe o Express real com auth de
// staff injetada e banco descartável.  npm run test:alta-vista
//
// O foco é o que dá dinheiro e o que dá processo: preço vindo do banco,
// aviso obrigatório dos conceituais, trava do consentimento no portfólio,
// lead com LGPD/honeypot/rate-limit e edição de preço refletindo no site.
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'alta-vista-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
delete process.env.ALTAVISTA_GA_ID; // GA só entra por env explícita
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');

// ---- staff fake (o Portal Staff é quem administra) ----
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

const alertas = [];
const alertaAugusto = async (m) => { alertas.push(m); };
const emails = [];
const enviarEmail = async (to, ass, html) => { emails.push({ to, ass, html }); return true; };

// ---- Mercado Pago mockado (Checkout Pro) ----
const mpChamadas = [];
const mpPagamentos = {}; // id → objeto devolvido pelo GET /v1/payments/:id
const mpFetch = async (p, opts) => {
  mpChamadas.push({ p, metodo: (opts && opts.method) || 'GET' });
  if (p === '/checkout/preferences' && opts && opts.method === 'POST') {
    const corpo = JSON.parse(opts.body);
    return { id: 'PREF' + mpChamadas.length, init_point: 'https://mp.test/checkout/' + corpo.external_reference };
  }
  if (/^\/v1\/payments\/[^/]+$/.test(p)) return mpPagamentos[p.split('/').pop()] || {};
  if (/\/v1\/payments\/.+\/refunds/.test(p)) return { id: 'REF1', status: 'approved' };
  return {};
};
mpFetch.__mock = true;

const app = express();
app.use(express.json({ limit: '6mb' }));
app.use(cookieParser());
const mod = require('./index');
mod.montar(app, { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto, mpFetch, jwtSecret: 'seg-teste' });
const repo = require('./repo');
const { db } = require('./db');

// ---- harness HTTP com um cookie jar por pessoa ----
let BASE = '', ok = 0;
const falhas = [];
const jars = {};
async function req(metodo, caminho, { corpo, staff = 'adm', como = '' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-test-user': staff };
  if (como) {
    const jar = jars[como] || {};
    const c = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (c) headers.Cookie = c;
  }
  const r = await fetch(BASE + caminho, {
    method: metodo, headers,
    body: corpo ? JSON.stringify(corpo) : undefined,
    redirect: 'manual',
  });
  if (como) {
    jars[como] = jars[como] || {};
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((ck) => {
      const [kv] = ck.split(';'); const [k, v] = kv.split('=');
      jars[como][k] = v;
    });
  }
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch (_) {}
  return { st: r.status, json, texto };
}
async function t(nome, fn) {
  try { await fn(); ok++; console.log('  ✅', nome); }
  catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌', nome, '—', e.message); }
}

async function rodar() {
  const srv = app.listen(0);
  BASE = 'http://127.0.0.1:' + srv.address().port;
  console.log('Villela Alta Vista 360 — selftest\n');

  // ================= vitrine pública =================
  await t('landing renderiza com a marca, o hero da spec e a tipografia', async () => {
    const r = await req('GET', '/alta-vista');
    assert.equal(r.st, 200);
    assert.ok(r.texto.includes('VILLELA') && r.texto.includes('ALTA VISTA 360'), 'marca ausente');
    assert.ok(r.texto.includes('Mostre a experiência de estar aí'), 'copy principal do hero ausente');
    assert.ok(r.texto.includes('Descobrir o pacote ideal') && r.texto.includes('Explorar possibilidades'), 'CTAs da spec ausentes');
    assert.ok(r.texto.includes('Sora'), 'tipografia da marca ausente');
  });

  await t('todas as páginas públicas da Onda 1 respondem 200', async () => {
    const paginas = ['/alta-vista/servicos', '/alta-vista/servicos/drone', '/alta-vista/servicos/video-com-ia',
      '/alta-vista/servicos/fotografia-360', '/alta-vista/servicos/tour-virtual-360',
      '/alta-vista/para/anfitrioes', '/alta-vista/para/imobiliarias', '/alta-vista/para/hoteis-e-pousadas',
      '/alta-vista/para/proprietarios', '/alta-vista/portfolio', '/alta-vista/precos', '/alta-vista/como-funciona',
      '/alta-vista/sobre', '/alta-vista/conteudos', '/alta-vista/faq', '/alta-vista/contato', '/alta-vista/orcamento',
      '/alta-vista/privacidade', '/alta-vista/termos', '/alta-vista/cookies', '/alta-vista/politica-de-ia'];
    for (const p of paginas) assert.equal((await req('GET', p)).st, 200, p);
  });

  await t('recomendador: wizard em etapas com progresso salvo responde', async () => {
    const r = await req('GET', '/alta-vista/recomendar-pacote');
    assert.equal(r.st, 200);
    assert.ok(r.texto.includes('Etapa 1 de 4'), 'etapas ausentes');
    assert.ok(r.texto.includes('localStorage'), 'salvamento de progresso ausente');
    assert.ok(r.texto.includes('rc-lgpd'), 'consentimento LGPD ausente');
  });

  await t('projeto conceitual carrega o aviso obrigatório no card e na página', async () => {
    const aviso = 'Não representa cliente atendido';
    const galeria = await req('GET', '/alta-vista/portfolio');
    assert.ok(galeria.texto.includes(aviso), 'aviso ausente na galeria');
    const item = await req('GET', '/alta-vista/portfolio/casa-de-temporada');
    assert.equal(item.st, 200);
    assert.ok(item.texto.includes(aviso), 'aviso ausente na página do projeto');
    const home = await req('GET', '/alta-vista');
    assert.ok(home.texto.includes(aviso), 'aviso ausente na galeria da home');
  });

  await t('nenhuma página pública promete resultado garantido', async () => {
    for (const p of ['/alta-vista', '/alta-vista/precos', '/alta-vista/para/anfitrioes']) {
      const r = await req('GET', p);
      assert.ok(!/aumento garantido|garantia de (reservas|ocupa)/i.test(r.texto), 'promessa proibida em ' + p);
    }
  });

  await t('preços saem do banco: R$ 179, R$ 1.690 e Clientes Fundadores na página', async () => {
    const r = await req('GET', '/alta-vista/precos');
    assert.ok(r.texto.includes('R$ 179'), 'Vídeo IA Essencial ausente');
    assert.ok(r.texto.includes('R$ 1.690'), 'Alta Vista Completo ausente');
    assert.ok(r.texto.includes('Clientes Fundadores'), 'programa de fundadores ausente');
    assert.ok(r.texto.includes('50% na reserva'), 'regra de pagamento ausente');
  });

  await t('robots bloqueia app e api e aponta o sitemap; sitemap lista portfólio', async () => {
    const rb = await req('GET', '/alta-vista/robots.txt');
    assert.ok(rb.texto.includes('Disallow: /alta-vista/app') && rb.texto.includes('Disallow: /alta-vista/api') && rb.texto.includes('sitemap.xml'));
    const sm = await req('GET', '/alta-vista/sitemap.xml');
    assert.ok(sm.texto.includes('/alta-vista/portfolio/apartamento-compacto') && sm.texto.includes('/alta-vista/precos'));
  });

  await t('GA4 fica fora das páginas quando ALTAVISTA_GA_ID não está configurado', async () => {
    const r = await req('GET', '/alta-vista');
    assert.ok(!r.texto.includes('googletagmanager'), 'GA presente sem env');
  });

  await t('páginas legais publicam a tarja MINUTA e a identificação da empresa', async () => {
    for (const p of ['/alta-vista/privacidade', '/alta-vista/termos', '/alta-vista/politica-de-ia']) {
      const r = await req('GET', p);
      assert.ok(/MINUTA/i.test(r.texto), 'tarja de minuta ausente em ' + p);
      assert.ok(r.texto.includes('56.776.526/0001-12'), 'CNPJ ausente em ' + p);
    }
  });

  // ================= catálogo (API pública) =================
  await t('catálogo público devolve preços em centavos (inteiros)', async () => {
    const r = await req('GET', '/alta-vista/api/catalogo');
    assert.equal(r.st, 200);
    assert.equal(r.json.servicos.length, 11, 'esperava 11 serviços do seed');
    assert.equal(r.json.combos.length, 4, 'esperava 4 combos do seed');
    for (const sv of r.json.servicos) assert.ok(Number.isInteger(sv.preco_centavos), sv.slug + ' sem centavos inteiros');
    const completo = r.json.combos.find((c) => c.slug === 'alta-vista-completo');
    assert.equal(completo.preco_centavos, 169000);
    assert.ok(completo.destaque, 'Alta Vista Completo deveria ser o destaque');
  });

  await t('seed é idempotente: rodar de novo não duplica nada', async () => {
    const c = (sql) => db.prepare(sql).get().c;
    repo.semear();
    assert.equal(c('SELECT COUNT(*) c FROM servicos'), 11);
    assert.equal(c('SELECT COUNT(*) c FROM combos'), 4);
    assert.equal(c('SELECT COUNT(*) c FROM portfolio'), 5);
    assert.equal(c('SELECT COUNT(*) c FROM faqs'), 10);
  });

  // ================= orçamento (leads) =================
  await t('pedido de orçamento cria lead e alerta o dono', async () => {
    const r = await req('POST', '/alta-vista/api/orcamento', { corpo: {
      nome: 'Helena Prado', email: 'helena@t.br', cidade: 'Brasília', tipo_imovel: 'Casa de temporada',
      finalidade: 'Aluguel por temporada', interesses: ['alta-vista-completo'], mensagem: 'Casa com piscina no Lago Sul',
      consentimento: true, utm: { utm_source: 'teste' }, origem: '/alta-vista/orcamento',
    } });
    assert.equal(r.st, 200, r.texto.slice(0, 120));
    const leads = await req('GET', '/staff/api/alta-vista/leads');
    assert.equal(leads.json.leads.length, 1);
    assert.equal(leads.json.leads[0].nome, 'Helena Prado');
    assert.equal(leads.json.leads[0].utm.utm_source, 'teste');
    assert.ok(alertas.some((a) => a.includes('Helena Prado')), 'alerta ao dono não saiu');
  });

  await t('sem consentimento LGPD ou sem contato o pedido é recusado', async () => {
    const semLgpd = await req('POST', '/alta-vista/api/orcamento', { corpo: { nome: 'X', email: 'x@t.br' } });
    assert.equal(semLgpd.st, 400);
    const semContato = await req('POST', '/alta-vista/api/orcamento', { corpo: { nome: 'X', consentimento: true } });
    assert.equal(semContato.st, 400);
  });

  await t('honeypot preenchido finge sucesso e NÃO cria lead', async () => {
    const antes = db.prepare('SELECT COUNT(*) c FROM leads').get().c;
    const r = await req('POST', '/alta-vista/api/orcamento', { corpo: {
      nome: 'Robô', email: 'robo@t.br', consentimento: true, website: 'http://spam',
    } });
    assert.equal(r.st, 200);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM leads').get().c, antes, 'robô virou lead');
  });

  await t('mesmo contato em 24h não duplica o lead (mensagens são somadas)', async () => {
    const antes = db.prepare('SELECT COUNT(*) c FROM leads').get().c;
    const r = await req('POST', '/alta-vista/api/orcamento', { corpo: {
      nome: 'Helena Prado', email: 'helena@t.br', consentimento: true, mensagem: 'Complementando: também quero drone',
    } });
    assert.equal(r.st, 200);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM leads').get().c, antes, 'duplicou');
    const l = db.prepare("SELECT mensagem FROM leads WHERE email='helena@t.br'").get();
    assert.ok(l.mensagem.includes('Complementando'), 'mensagem não somou');
  });

  await t('rate limit por IP segura rajada de pedidos', async () => {
    let teve429 = false;
    for (let i = 0; i < 10; i++) {
      const r = await req('POST', '/alta-vista/api/orcamento', { corpo: {
        nome: 'Rajada ' + i, email: `rajada${i}@t.br`, consentimento: true,
      } });
      if (r.st === 429) { teve429 = true; break; }
    }
    assert.ok(teve429, 'nenhum 429 em 10 pedidos seguidos');
  });

  // ================= administração =================
  await t('staff sem papel admin não acessa a administração', async () => {
    const r = await req('GET', '/staff/api/alta-vista/dashboard', { staff: 'op' });
    assert.equal(r.st, 403);
    const w = await req('PATCH', '/staff/api/alta-vista/config', { staff: 'op', corpo: { whatsapp: '5561999' } });
    assert.equal(w.st, 403);
  });

  await t('editar preço no staff reflete na página pública na hora', async () => {
    const cat = await req('GET', '/staff/api/alta-vista/catalogo');
    const sv = cat.json.servicos.find((x) => x.slug === 'video-ia-essencial');
    const r = await req('PATCH', `/staff/api/alta-vista/servicos/${sv.id}`, { corpo: { preco_centavos: 19900 } });
    assert.equal(r.st, 200);
    const pg = await req('GET', '/alta-vista/precos');
    assert.ok(pg.texto.includes('R$ 199'), 'preço novo não apareceu');
    assert.ok(!pg.texto.includes('R$ 179'), 'preço antigo continua na página');
    // auditoria registrou quem mexeu em dinheiro
    const aud = await req('GET', '/staff/api/alta-vista/auditoria');
    assert.ok(aud.json.eventos.some((e) => e.acao === 'servico.editar'), 'edição de preço sem auditoria');
    await req('PATCH', `/staff/api/alta-vista/servicos/${sv.id}`, { corpo: { preco_centavos: 17900 } }); // volta
  });

  await t('portfólio: virar caso real SEM consentimento registrado é recusado', async () => {
    const lista = await req('GET', '/staff/api/alta-vista/portfolio');
    const p = lista.json.itens.find((x) => x.slug === 'pousada');
    const semConsent = await req('POST', '/staff/api/alta-vista/portfolio', { corpo: { id: p.id, titulo: p.titulo, conceitual: false } });
    assert.equal(semConsent.st, 400, 'aceitou caso real sem consentimento');
    const comConsent = await req('POST', '/staff/api/alta-vista/portfolio', { corpo: {
      id: p.id, titulo: p.titulo, conceitual: false,
      consentimento: { autorizado_por: 'Cliente Teste', data: '2026-08-06', escopo: 'portfólio do site, sem endereço' },
    } });
    assert.equal(comConsent.st, 200, comConsent.texto.slice(0, 160));
    // volta a conceitual para não sujar os demais testes
    await req('POST', '/staff/api/alta-vista/portfolio', { corpo: { id: p.id, titulo: p.titulo, conceitual: true } });
  });

  await t('lead muda de status com validação e auditoria', async () => {
    const leads = await req('GET', '/staff/api/alta-vista/leads');
    const l = leads.json.leads.find((x) => x.email === 'helena@t.br');
    const invalido = await req('POST', `/staff/api/alta-vista/leads/${l.id}/status`, { corpo: { status: 'qualquer' } });
    assert.equal(invalido.st, 400);
    const okSt = await req('POST', `/staff/api/alta-vista/leads/${l.id}/status`, { corpo: { status: 'em_contato', nota: 'respondida por WhatsApp' } });
    assert.equal(okSt.st, 200);
    assert.equal(okSt.json.lead.status, 'em_contato');
  });

  await t('conteúdo rascunho não vaza na página pública; publicado aparece', async () => {
    await req('POST', '/staff/api/alta-vista/conteudos', { corpo: { titulo: 'Guia secreto', corpo: '<p>rascunho</p>', status: 'rascunho' } });
    const pub = await req('POST', '/staff/api/alta-vista/conteudos', { corpo: { titulo: 'Checklist visual do anúncio de temporada', resumo: 'O essencial antes de fotografar.', corpo: '<p>Checklist…</p>', status: 'publicado' } });
    assert.equal(pub.st, 200);
    const lista = await req('GET', '/alta-vista/conteudos');
    assert.ok(!lista.texto.includes('Guia secreto'), 'rascunho vazou');
    assert.ok(lista.texto.includes('Checklist visual'), 'publicado não apareceu');
    const rascunhoDireto = await req('GET', '/alta-vista/conteudos/guia-secreto');
    assert.equal(rascunhoDireto.st, 404, 'rascunho acessível por URL direta');
  });

  await t('config editada muda o site (WhatsApp aparece no contato)', async () => {
    await req('PATCH', '/staff/api/alta-vista/config', { corpo: { whatsapp: '5561992113000' } });
    const r = await req('GET', '/alta-vista/contato');
    assert.ok(r.texto.includes('wa.me/5561992113000'), 'WhatsApp configurado não apareceu');
  });

  // ================= Onda 2: recomendador (motor no servidor) =================
  const { _janela } = require('./rotas-publicas');
  _janela.clear(); // os testes de rate-limit acima saturaram o IP de teste

  let leadRita = null;
  await t('recomendador: casa no DF → Alta Vista Completo com análise manual e preço do banco', async () => {
    const r = await req('POST', '/alta-vista/api/recomendar', { corpo: {
      nome: 'Rita Campos', whatsapp: '61988887777', email: 'rita@t.br', cidade: 'Brasília',
      tipo_imovel: 'Casa de temporada', finalidade: 'Aluguel por temporada', ambientes: 5, fotos_qtd: 20,
      canais: ['Airbnb', 'Instagram/Reels'], prazo: 'Neste mês', interesses: ['alta-vista-completo'],
      consentimento: true, origem: '/alta-vista/recomendar-pacote', utm: { utm_source: 'google' },
    } });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    const rec = r.json.recomendacao;
    assert.equal(rec.pacote.slug, 'alta-vista-completo');
    assert.equal(rec.preco_base_centavos, 169000, 'preço-base não veio do catálogo');
    assert.equal(rec.atendimento, 'presencial');
    assert.ok(rec.analise_manual, 'voo de drone sem análise manual');
    assert.ok(rec.motivos.length >= 1 && rec.pontuacao >= 6, 'motivos/pontuação ausentes');
    const leads = await req('GET', '/staff/api/alta-vista/leads');
    leadRita = leads.json.leads.find((l) => l.email === 'rita@t.br');
    assert.ok(leadRita && leadRita.recomendacao && leadRita.recomendacao.pacote.slug === 'alta-vista-completo', 'lead sem recomendação gravada');
    assert.equal(leadRita.pontuacao, leadRita.recomendacao.pontuacao, 'pontuação divergente');
  });

  await t('recomendador: fora do DF cai no remoto (vídeo IA) e avisa sobre o drone', async () => {
    const r = await req('POST', '/alta-vista/api/recomendar', { corpo: {
      nome: 'Paulo Remoto', whatsapp: '11977776666', cidade: 'São Paulo', tipo_imovel: 'Apartamento/flat',
      fotos_qtd: 18, canais: ['Airbnb', 'Booking', 'Instagram/Reels'], interesses: ['drone', 'video-com-ia'],
      consentimento: true,
    } });
    assert.equal(r.st, 200);
    const rec = r.json.recomendacao;
    assert.equal(rec.pacote.slug, 'video-ia-destaque');
    assert.equal(rec.atendimento, 'remoto');
    assert.ok(rec.avisos.join(' ').includes('presencial'), 'sem aviso de drone indisponível');
  });

  await t('recomendador: pousada grande → Premium + pontos adicionais com motivo', async () => {
    const r = await req('POST', '/alta-vista/api/recomendar', { corpo: {
      nome: 'Pousada Grande', email: 'pousada@t.br', cidade: 'Lago Norte, Brasília', tipo_imovel: 'Pousada',
      ambientes: 14, interesses: ['tour-360'], consentimento: true,
    } });
    assert.equal(r.st, 200);
    const rec = r.json.recomendacao;
    assert.equal(rec.pacote.slug, 'alta-vista-premium');
    assert.equal(rec.adicionais.length, 1);
    assert.equal(rec.adicionais[0].qtd, 2, '14 ambientes − 12 pontos do Premium = 2 adicionais');
    assert.equal(rec.preco_estimado_centavos, 239000 + 2 * 7000);
    assert.ok(rec.adicionais[0].motivo.includes('12'), 'motivo do adicional sem a capacidade do pacote');
  });

  // ================= Onda 2: propostas com aceite formal =================
  let proposta = null;
  await t('proposta nasce como snapshot do catálogo com desconto e validade', async () => {
    const r = await req('POST', '/staff/api/alta-vista/propostas', { corpo: {
      lead_id: leadRita.id, itens: ['alta-vista-completo'], desconto_pct: 20,
      motivo_desconto: 'Clientes Fundadores — autorização de portfólio', validade_dias: 7,
    } });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    proposta = r.json.proposta;
    assert.equal(proposta.subtotal_centavos, 169000);
    assert.equal(proposta.total_centavos, 135200, '169000 − 20%');
    assert.equal(proposta.status, 'rascunho');
    assert.ok(r.json.link.includes('/alta-vista/proposta/' + proposta.token));
  });

  await t('editar preço no catálogo NÃO muda proposta já emitida (snapshot)', async () => {
    const cat = await req('GET', '/staff/api/alta-vista/catalogo');
    const cb = cat.json.combos.find((x) => x.slug === 'alta-vista-completo');
    await req('PATCH', `/staff/api/alta-vista/combos/${cb.id}`, { corpo: { preco_centavos: 200000 } });
    const lista = await req('GET', '/staff/api/alta-vista/propostas');
    const p = lista.json.propostas.find((x) => x.id === proposta.id);
    assert.equal(p.total_centavos, 135200, 'snapshot vazou a edição de preço');
    await req('PATCH', `/staff/api/alta-vista/combos/${cb.id}`, { corpo: { preco_centavos: 169000 } }); // volta
  });

  await t('rascunho não aceita; enviar dispara e-mail com o link e move o lead no funil', async () => {
    _janela.clear();
    const cedo = await req('POST', `/alta-vista/api/proposta/${proposta.token}/aceitar`, { corpo: { nome: 'Rita Campos' } });
    assert.equal(cedo.st, 400, 'aceitou proposta em rascunho');
    const env = await req('POST', `/staff/api/alta-vista/propostas/${proposta.id}/enviar`, {});
    assert.equal(env.st, 200);
    assert.ok(env.json.email_enviado, 'e-mail não saiu');
    assert.ok(emails.some((e) => e.to === 'rita@t.br' && e.html.includes(proposta.token)), 'e-mail sem o link da proposta');
    const lead = await req('GET', `/staff/api/alta-vista/leads/${leadRita.id}`);
    assert.equal(lead.json.lead.status, 'proposta', 'lead não avançou no funil');
  });

  await t('página pública da proposta mostra valores, é noindex e token errado dá 404', async () => {
    const r = await req('GET', `/alta-vista/proposta/${proposta.token}`);
    assert.equal(r.st, 200);
    assert.ok(r.texto.includes('R$ 1.352,00'), 'total ausente');
    assert.ok(r.texto.includes('Clientes Fundadores'), 'motivo do desconto ausente');
    assert.ok(r.texto.includes('noindex'), 'proposta indexável');
    assert.equal((await req('GET', '/alta-vista/proposta/nao-existe')).st, 404);
  });

  await t('aceite formal registra nome + termos e é idempotente; lead vira ganho', async () => {
    _janela.clear();
    const semNome = await req('POST', `/alta-vista/api/proposta/${proposta.token}/aceitar`, { corpo: {} });
    assert.equal(semNome.st, 400);
    const ok1 = await req('POST', `/alta-vista/api/proposta/${proposta.token}/aceitar`, { corpo: { nome: 'Rita Campos' } });
    assert.equal(ok1.st, 200, ok1.texto.slice(0, 160));
    const denovo = await req('POST', `/alta-vista/api/proposta/${proposta.token}/aceitar`, { corpo: { nome: 'Outra Pessoa' } });
    assert.equal(denovo.st, 400, 'aceitou duas vezes');
    const lista = await req('GET', '/staff/api/alta-vista/propostas');
    const p = lista.json.propostas.find((x) => x.id === proposta.id);
    assert.equal(p.status, 'aceita');
    assert.equal(p.aceite.nome, 'Rita Campos');
    assert.equal(p.aceite.termos_versao, require('./repo').TERMOS_VERSAO);
    const lead = await req('GET', `/staff/api/alta-vista/leads/${leadRita.id}`);
    assert.equal(lead.json.lead.status, 'ganho');
    const pg = await req('GET', `/alta-vista/proposta/${proposta.token}`);
    assert.ok(pg.texto.includes('Proposta aceita por Rita Campos'), 'página não reflete o aceite');
  });

  await t('proposta vencida expira na leitura e recusa aceite', async () => {
    _janela.clear();
    const nova = await req('POST', '/staff/api/alta-vista/propostas', { corpo: { lead_id: leadRita.id, itens: ['fotos-360'], validade_dias: 3 } });
    await req('POST', `/staff/api/alta-vista/propostas/${nova.json.proposta.id}/enviar`, {});
    db.prepare('UPDATE propostas SET enviada_em = ? WHERE id = ?')
      .run(new Date(Date.now() - 5 * 86400000).toISOString(), nova.json.proposta.id);
    const pg = await req('GET', `/alta-vista/proposta/${nova.json.proposta.token}`);
    assert.ok(pg.texto.includes('expirou'), 'página não avisou a expiração');
    const ac = await req('POST', `/alta-vista/api/proposta/${nova.json.proposta.token}/aceitar`, { corpo: { nome: 'Rita' } });
    assert.equal(ac.st, 400, 'aceitou proposta vencida');
  });

  // ================= Onda 2: CRM =================
  await t('interações e tarefas do lead funcionam e o status perdido exige motivo', async () => {
    const it = await req('POST', `/staff/api/alta-vista/leads/${leadRita.id}/interacoes`, { corpo: { tipo: 'ligacao', texto: 'Alinhamos a data da captação.' } });
    assert.equal(it.st, 200);
    const tf = await req('POST', '/staff/api/alta-vista/tarefas', { corpo: { lead_id: leadRita.id, texto: 'Enviar briefing', vence_em: '2026-08-10' } });
    assert.equal(tf.st, 200);
    await req('POST', `/staff/api/alta-vista/tarefas/${tf.json.tarefa.id}/concluir`, {});
    const det = await req('GET', `/staff/api/alta-vista/leads/${leadRita.id}`);
    assert.ok(det.json.interacoes.some((x) => x.texto.includes('captação')), 'interação sumiu');
    assert.ok(det.json.tarefas.some((x) => x.texto === 'Enviar briefing' && x.feita), 'tarefa não concluiu');
    // perdido sem motivo é recusado (em outro lead, para não mexer no ganho da Rita)
    const leads = await req('GET', '/staff/api/alta-vista/leads');
    const paulo = leads.json.leads.find((l) => l.nome === 'Paulo Remoto');
    const semMotivo = await req('POST', `/staff/api/alta-vista/leads/${paulo.id}/status`, { corpo: { status: 'perdido' } });
    assert.equal(semMotivo.st, 400);
    const comMotivo = await req('POST', `/staff/api/alta-vista/leads/${paulo.id}/status`, { corpo: { status: 'perdido', motivo: 'orçamento' } });
    assert.equal(comMotivo.st, 200);
  });

  await t('exportação CSV sai com BOM e os leads; conversão por origem no dashboard', async () => {
    // fetch().text() REMOVE o BOM inicial por especificação — conferir nos bytes crus
    const r = await fetch(BASE + '/staff/api/alta-vista/leads.csv', { headers: { 'x-test-user': 'adm' } });
    assert.equal(r.status, 200);
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.ok(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF, 'CSV sem BOM (Excel PT-BR quebra acento)');
    const csvTexto = bytes.toString('utf8');
    assert.ok(csvTexto.includes('Rita Campos') && csvTexto.includes('criado_em;nome'), 'conteúdo do CSV incompleto');
    const dash = await req('GET', '/staff/api/alta-vista/dashboard');
    const origem = dash.json.conversao_por_origem.find((o) => o.origem === '/alta-vista/recomendar-pacote');
    assert.ok(origem && origem.total >= 1 && origem.ganhos >= 1, 'conversão por origem não consolidou');
    assert.ok(dash.json.propostas.aceitas >= 1 && dash.json.propostas.valor_aceito_centavos >= 135200, 'propostas fora do dashboard');
  });

  await t('robots também esconde as propostas dos buscadores', async () => {
    const r = await req('GET', '/alta-vista/robots.txt');
    assert.ok(r.texto.includes('Disallow: /alta-vista/proposta/'), 'propostas indexáveis');
  });

  // ================= Onda 3: conta do cliente =================
  await t('páginas de auth e shell do painel respondem (noindex + app.js versionado)', async () => {
    for (const p of ['/alta-vista/entrar', '/alta-vista/criar-conta', '/alta-vista/esqueci', '/alta-vista/definir-senha']) {
      const r = await req('GET', p);
      assert.equal(r.st, 200, p);
      assert.ok(r.texto.includes('noindex'), p + ' indexável');
    }
    const shell = await req('GET', '/alta-vista/app');
    assert.ok(shell.texto.includes('noindex') && /app\.js\?v=\d+/.test(shell.texto), 'shell sem noindex ou sem ?v=');
    assert.equal((await req('GET', '/alta-vista/app.js')).st, 200);
  });

  await t('criar conta autentica com cookie av_sess restrito a /alta-vista', async () => {
    const r = await req('POST', '/alta-vista/api/conta/criar', { como: 'ana', corpo: {
      nome: 'Ana Dona', email: 'ana@t.br', senha: 'senha12345', aceite_termos: true,
    } });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    assert.ok(jars.ana && jars.ana.av_sess, 'cookie av_sess não veio');
    const me = await req('GET', '/alta-vista/api/app/me', { como: 'ana' });
    assert.equal(me.st, 200);
    assert.equal(me.json.cliente.email, 'ana@t.br');
    // validações
    assert.equal((await req('POST', '/alta-vista/api/conta/criar', { corpo: { nome: 'X', email: 'x@t.br', senha: 'curta', aceite_termos: true } })).st, 400, 'senha curta passou');
    assert.equal((await req('POST', '/alta-vista/api/conta/criar', { corpo: { nome: 'X', email: 'ana@t.br', senha: 'senha12345', aceite_termos: true } })).st, 400, 'e-mail duplicado passou');
    assert.equal((await req('POST', '/alta-vista/api/conta/criar', { corpo: { nome: 'X', email: 'y@t.br', senha: 'senha12345' } })).st, 400, 'sem aceite de termos passou');
  });

  await t('login com senha errada falha; sem sessão a API do app dá 401', async () => {
    assert.equal((await req('POST', '/alta-vista/api/conta/entrar', { corpo: { email: 'ana@t.br', senha: 'errada123' } })).st, 401);
    assert.equal((await req('GET', '/alta-vista/api/app/me')).st, 401);
    const r = await req('POST', '/alta-vista/api/conta/criar', { como: 'bruno', corpo: {
      nome: 'Bruno Vizinho', email: 'bruno@t.br', senha: 'senha12345', aceite_termos: true,
    } });
    assert.equal(r.st, 200);
  });

  let imovelAna = null;
  await t('ISOLAMENTO: imóvel da Ana é invisível e intocável para o Bruno', async () => {
    const r = await req('POST', '/alta-vista/api/app/imoveis', { como: 'ana', corpo: {
      nome: 'Casa do Lago', tipo: 'Casa de temporada', cidade: 'Brasília', ambientes: 7,
      endereco: 'SHIS QL 10 conj 5 casa 1', acesso: 'portão azul, senha 1234',
    } });
    assert.equal(r.st, 200);
    imovelAna = r.json.imovel;
    const deBruno = await req('GET', '/alta-vista/api/app/imoveis', { como: 'bruno' });
    assert.equal(deBruno.json.imoveis.length, 0, 'Bruno enxergou imóvel da Ana');
    // Bruno tentando editar/remover o imóvel da Ana não acha nada
    const edit = await req('POST', '/alta-vista/api/app/imoveis', { como: 'bruno', corpo: { id: imovelAna.id, nome: 'hackeado' } });
    assert.equal(edit.st, 400, 'Bruno editou imóvel da Ana');
    await req('DELETE', `/alta-vista/api/app/imoveis/${imovelAna.id}`, { como: 'bruno' });
    const aindaLa = await req('GET', '/alta-vista/api/app/imoveis', { como: 'ana' });
    assert.equal(aindaLa.json.imoveis.length, 1, 'DELETE do Bruno removeu imóvel da Ana');
  });

  // ================= Onda 3: projeto a partir da proposta aceita =================
  let projetoRita = null;
  await t('proposta aceita vira projeto: conta convidada por e-mail, sem duplicar', async () => {
    const antes = emails.length;
    const r = await req('POST', `/staff/api/alta-vista/projetos/de-proposta/${proposta.id}`, {});
    assert.equal(r.st, 200, r.texto.slice(0, 200));
    projetoRita = r.json.projeto;
    assert.equal(projetoRita.status, 'awaiting_payment');
    assert.equal(projetoRita.total_centavos, 135200, 'total não veio do snapshot da proposta');
    assert.ok(r.json.cliente_novo, 'deveria ter criado conta nova');
    assert.ok(r.json.convite_enviado && emails.length > antes, 'convite não saiu');
    const denovo = await req('POST', `/staff/api/alta-vista/projetos/de-proposta/${proposta.id}`, {});
    assert.equal(denovo.st, 400, 'mesma proposta virou dois projetos');
  });

  await t('convite do e-mail define a senha e entra direto no painel', async () => {
    const convite = emails.filter((e) => e.to === 'rita@t.br' && e.html.includes('definir-senha')).pop();
    assert.ok(convite, 'e-mail de convite não encontrado');
    const token = decodeURIComponent((convite.html.match(/definir-senha\?token=([^"]+)"/) || [])[1] || '');
    assert.ok(token, 'token ausente no link do convite');
    const r = await req('POST', '/alta-vista/api/conta/definir-senha', { como: 'rita', corpo: { token, senha: 'senhaRita123' } });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    const me = await req('GET', '/alta-vista/api/app/me', { como: 'rita' });
    assert.equal(me.json.cliente.email, 'rita@t.br');
  });

  await t('ISOLAMENTO: projeto da Rita é invisível para a Ana; Rita vê o dela', async () => {
    const daRita = await req('GET', '/alta-vista/api/app/projetos', { como: 'rita' });
    assert.equal(daRita.json.projetos.length, 1);
    const daAna = await req('GET', '/alta-vista/api/app/projetos', { como: 'ana' });
    assert.equal(daAna.json.projetos.length, 0, 'Ana enxergou projeto da Rita');
    assert.equal((await req('GET', `/alta-vista/api/app/projetos/${projetoRita.id}`, { como: 'ana' })).st, 404, 'Ana abriu projeto da Rita');
  });

  await t('máquina de estados: transição válida avança, salto inválido é recusado com as permitidas', async () => {
    const ok1 = await req('POST', `/staff/api/alta-vista/projetos/${projetoRita.id}/status`, { corpo: { status: 'briefing_pending', justificativa: 'pagamento confirmado manualmente (Onda 4 automatiza)' } });
    assert.equal(ok1.st, 200);
    const salto = await req('POST', `/staff/api/alta-vista/projetos/${projetoRita.id}/status`, { corpo: { status: 'delivered' } });
    assert.equal(salto.st, 400);
    assert.ok(salto.json.erro.includes('scheduling'), 'erro não lista as transições permitidas');
    const semJust = await req('POST', `/staff/api/alta-vista/projetos/${projetoRita.id}/status`, { corpo: { status: 'cancelled' } });
    assert.equal(semJust.st, 400, 'cancelou sem justificativa');
    const eventos = await req('GET', `/staff/api/alta-vista/projetos/${projetoRita.id}`);
    assert.ok(eventos.json.eventos.some((e) => e.para === 'briefing_pending' && e.quem === 'Admin' && e.justificativa.includes('pagamento')), 'evento sem autor/justificativa');
  });

  await t('briefing: cliente preenche, staff enxerga, produção trava edição', async () => {
    const r = await req('PUT', `/alta-vista/api/app/projetos/${projetoRita.id}/briefing`, { como: 'rita', corpo: {
      objetivo: 'Aumentar a percepção de valor do anúncio', destaques: 'Piscina com borda infinita',
      restricoes: 'Não fotografar o quarto de despejo', disponibilidade: 'terças e quintas de manhã',
    } });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    const staffVe = await req('GET', `/staff/api/alta-vista/projetos/${projetoRita.id}`);
    assert.equal(staffVe.json.projeto.briefing.destaques, 'Piscina com borda infinita');
    // avança até produção e confere a trava
    await req('POST', `/staff/api/alta-vista/projetos/${projetoRita.id}/status`, { corpo: { status: 'scheduling' } });
    await req('POST', `/staff/api/alta-vista/projetos/${projetoRita.id}/status`, { corpo: { status: 'production' } });
    const travado = await req('PUT', `/alta-vista/api/app/projetos/${projetoRita.id}/briefing`, { como: 'rita', corpo: { objetivo: 'mudar tudo' } });
    assert.equal(travado.st, 400, 'briefing editável em produção');
  });

  await t('mensagens: cliente ↔ equipe, com e-mail de aviso para o cliente', async () => {
    const r = await req('POST', `/alta-vista/api/app/projetos/${projetoRita.id}/mensagens`, { como: 'rita', corpo: { texto: 'A piscina estará limpa na quinta.' } });
    assert.equal(r.st, 200);
    const antes = emails.length;
    const resp = await req('POST', `/staff/api/alta-vista/projetos/${projetoRita.id}/mensagens`, { corpo: { texto: 'Perfeito, agendamos para quinta às 9h.' } });
    assert.equal(resp.st, 200);
    assert.ok(emails.length > antes && emails[emails.length - 1].to === 'rita@t.br', 'cliente não recebeu aviso por e-mail');
    const doApp = await req('GET', `/alta-vista/api/app/projetos/${projetoRita.id}`, { como: 'rita' });
    assert.equal(doApp.json.mensagens.length, 2);
    assert.ok(doApp.json.mensagens.some((m) => m.autor === 'equipe'), 'resposta da equipe sumiu');
  });

  await t('staff define agenda/prazo/responsável e o cliente enxerga', async () => {
    await req('PATCH', `/staff/api/alta-vista/projetos/${projetoRita.id}`, { corpo: { responsavel: 'Augusto', prazo_em: '2026-08-20', agenda_em: '2026-08-13T09:00' } });
    const doApp = await req('GET', `/alta-vista/api/app/projetos/${projetoRita.id}`, { como: 'rita' });
    assert.equal(doApp.json.projeto.responsavel, 'Augusto');
    assert.equal(doApp.json.projeto.prazo_em, '2026-08-20');
    assert.equal(doApp.json.projeto.agenda_em, '2026-08-13T09:00');
  });

  // ================= Onda 3: LGPD =================
  await t('LGPD: exportação traz imóveis, projetos, eventos e mensagens', async () => {
    const r = await req('GET', '/alta-vista/api/app/meus-dados', { como: 'rita' });
    assert.equal(r.st, 200);
    assert.equal(r.json.cliente.email, 'rita@t.br');
    assert.equal(r.json.projetos.length, 1);
    assert.ok(r.json.projetos[0].mensagens.length >= 2 && r.json.projetos[0].eventos.length >= 3, 'histórico incompleto na exportação');
  });

  await t('LGPD: conta com projeto ativo não exclui; conta livre é anonimizada e sessão morre', async () => {
    const bloqueada = await req('POST', '/alta-vista/api/app/excluir-conta', { como: 'rita', corpo: { senha: 'senhaRita123' } });
    assert.equal(bloqueada.st, 400, 'excluiu conta com projeto em produção');
    const senhaErrada = await req('POST', '/alta-vista/api/app/excluir-conta', { como: 'bruno', corpo: { senha: 'errada999' } });
    assert.equal(senhaErrada.st, 401, 'excluiu sem confirmar a senha');
    const okExc = await req('POST', '/alta-vista/api/app/excluir-conta', { como: 'bruno', corpo: { senha: 'senha12345' } });
    assert.equal(okExc.st, 200, okExc.texto.slice(0, 160));
    assert.equal((await req('POST', '/alta-vista/api/conta/entrar', { corpo: { email: 'bruno@t.br', senha: 'senha12345' } })).st, 401, 'login sobreviveu à exclusão');
    const anon = db.prepare("SELECT nome, email FROM clientes WHERE id = (SELECT id FROM clientes WHERE email LIKE 'excluido-%')").get();
    assert.ok(anon && anon.nome === 'Conta excluída', 'dados não anonimizados');
  });

  // ================= Onda 4: cobrança e Checkout Pro =================
  let parcelas = [];
  await t('regra 50/50: projeto presencial > R$ 1.000 gera sinal + saldo que fecham o total', async () => {
    const r = await req('POST', `/staff/api/alta-vista/projetos/${projetoRita.id}/cobranca`, { corpo: {} });
    assert.equal(r.st, 200, r.texto.slice(0, 200));
    assert.ok(r.json.presencial, 'atendimento presencial não veio da recomendação do lead');
    parcelas = r.json.parcelas;
    assert.equal(parcelas.length, 2);
    assert.equal(parcelas[0].valor_centavos + parcelas[1].valor_centavos, 135200, 'as parcelas não somam o total');
    assert.ok(parcelas[0].rotulo.includes('Sinal') && parcelas[1].rotulo.includes('Saldo final'));
    const denovo = await req('POST', `/staff/api/alta-vista/projetos/${projetoRita.id}/cobranca`, { corpo: {} });
    assert.equal(denovo.st, 400, 'gerou cobrança em dobro');
  });

  await t('remoto e presencial pequeno cobram integral antecipado', async () => {
    const cRita = repo.Clientes.porEmail('rita@t.br');
    const pRemoto = repo.Projetos.criar({ cliente_id: cRita.id, titulo: 'Vídeo IA remoto', total_centavos: 32900 }, { quem: 'teste' });
    const rRem = await req('POST', `/staff/api/alta-vista/projetos/${pRemoto.id}/cobranca`, { corpo: { presencial: false } });
    assert.equal(rRem.json.parcelas.length, 1);
    assert.ok(rRem.json.parcelas[0].rotulo.includes('remoto'));
    const pPeq = repo.Projetos.criar({ cliente_id: cRita.id, titulo: 'Fotos 360 pequenas', total_centavos: 59000 }, { quem: 'teste' });
    const rPeq = await req('POST', `/staff/api/alta-vista/projetos/${pPeq.id}/cobranca`, { corpo: { presencial: true } });
    assert.equal(rPeq.json.parcelas.length, 1, 'presencial ≤ R$ 1.000 deveria ser integral');
  });

  await t('cliente cria checkout SÓ da própria parcela; saldo final só abre após o sinal', async () => {
    const daAna = await req('POST', `/alta-vista/api/app/parcelas/${parcelas[0].id}/checkout`, { como: 'ana' });
    assert.equal(daAna.st, 404, 'Ana criou checkout da parcela da Rita');
    const cedo = await req('POST', `/alta-vista/api/app/parcelas/${parcelas[1].id}/checkout`, { como: 'rita' });
    assert.equal(cedo.st, 400, 'saldo final abriu antes do sinal');
    const r = await req('POST', `/alta-vista/api/app/parcelas/${parcelas[0].id}/checkout`, { como: 'rita' });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    assert.ok(r.json.init_point.includes('altavista:' + parcelas[0].id), 'external_reference fora do padrão');
    const pref = mpChamadas.find((c) => c.p === '/checkout/preferences');
    assert.ok(pref, 'preferência não foi criada no servidor');
  });

  await t('webhook aprovado: refetch + validação, projeto destrava e cliente recebe e-mail', async () => {
    mpPagamentos.PAY100 = { status: 'approved', external_reference: 'altavista:' + parcelas[0].id, transaction_amount: 676, currency_id: 'BRL' };
    const emailsAntes = emails.length;
    const r = await req('POST', '/alta-vista/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 'PAY100' } } });
    assert.equal(r.st, 200);
    await new Promise((x) => setTimeout(x, 50)); // efeito roda depois do 200
    const parc = db.prepare('SELECT * FROM parcelas WHERE id = ?').get(parcelas[0].id);
    assert.equal(parc.status, 'aprovado');
    assert.equal(parc.mp_payment_id, 'PAY100');
    // pagamento destravou o projeto? (estava em production por causa dos testes da Onda 3 — NÃO deve mexer)
    const pr = repo.Projetos.obter(projetoRita.id);
    assert.equal(pr.status, 'production', 'pagamento mexeu num projeto que já estava em produção');
    assert.ok(emails.length > emailsAntes && emails[emails.length - 1].to === 'rita@t.br', 'recibo por e-mail não saiu');
    // saldo em aberto = parcela 2
    const app3 = await req('GET', `/alta-vista/api/app/projetos/${projetoRita.id}`, { como: 'rita' });
    assert.equal(app3.json.saldo_centavos, parcelas[1].valor_centavos);
  });

  await t('webhook aprovado DESTRAVA projeto awaiting_payment → briefing_pending', async () => {
    const cRita = repo.Clientes.porEmail('rita@t.br');
    const pNovo = repo.Projetos.criar({ cliente_id: cRita.id, titulo: 'Tour da pousada', total_centavos: 84900 }, { quem: 'teste' });
    const cob = await req('POST', `/staff/api/alta-vista/projetos/${pNovo.id}/cobranca`, { corpo: { presencial: false } });
    const parcela = cob.json.parcelas[0];
    await req('POST', `/alta-vista/api/app/parcelas/${parcela.id}/checkout`, { como: 'rita' });
    mpPagamentos.PAY200 = { status: 'approved', external_reference: 'altavista:' + parcela.id, transaction_amount: 849, currency_id: 'BRL' };
    await req('POST', '/alta-vista/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 'PAY200' } } });
    await new Promise((x) => setTimeout(x, 50));
    const pr = repo.Projetos.obter(pNovo.id);
    assert.equal(pr.status, 'briefing_pending', 'pagamento não destravou o projeto');
    const ev = repo.Projetos.eventos(pNovo.id);
    assert.ok(ev.some((e) => e.para === 'briefing_pending' && e.justificativa.includes('PAY200')), 'evento sem o rastro do pagamento');
  });

  await t('webhook é idempotente e recusa valor divergente', async () => {
    const antes = db.prepare("SELECT COUNT(*) c FROM pagamento_eventos WHERE mp_payment_id='PAY100' AND status='aprovado'").get().c;
    await req('POST', '/alta-vista/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 'PAY100' } } });
    await new Promise((x) => setTimeout(x, 50));
    const depois = db.prepare("SELECT COUNT(*) c FROM pagamento_eventos WHERE mp_payment_id='PAY100' AND status='aprovado'").get().c;
    assert.equal(depois, antes, 'webhook repetido aplicou efeito de novo');
    // valor divergente na parcela 2: NUNCA aprova
    mpPagamentos.PAY300 = { status: 'approved', external_reference: 'altavista:' + parcelas[1].id, transaction_amount: 1, currency_id: 'BRL' };
    await req('POST', '/alta-vista/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 'PAY300' } } });
    await new Promise((x) => setTimeout(x, 50));
    const parc2 = db.prepare('SELECT * FROM parcelas WHERE id = ?').get(parcelas[1].id);
    assert.ok(parc2.status !== 'aprovado', 'valor divergente aprovou parcela');
    assert.ok(alertas.some((a) => a.includes('DIVERGENTE')), 'divergência sem alerta ao dono');
  });

  await t('conciliação manual exige justificativa e quita o projeto (saldo zero)', async () => {
    const sem = await req('POST', `/staff/api/alta-vista/parcelas/${parcelas[1].id}/marcar-pago`, { corpo: {} });
    assert.equal(sem.st, 400, 'conciliou sem justificativa');
    const r = await req('POST', `/staff/api/alta-vista/parcelas/${parcelas[1].id}/marcar-pago`, { corpo: { justificativa: 'Pix recebido no C6 em 06/08' } });
    assert.equal(r.st, 200);
    assert.equal(r.json.parcela.pago_via, 'manual');
    const app4 = await req('GET', `/alta-vista/api/app/projetos/${projetoRita.id}`, { como: 'rita' });
    assert.equal(app4.json.saldo_centavos, 0, 'projeto não quitou');
  });

  await t('reembolso exige confirmação explícita, estorna no MP e audita', async () => {
    const sem = await req('POST', `/staff/api/alta-vista/parcelas/${parcelas[0].id}/reembolsar`, { corpo: {} });
    assert.equal(sem.st, 400, 'reembolsou sem confirmar');
    const r = await req('POST', `/staff/api/alta-vista/parcelas/${parcelas[0].id}/reembolsar`, { corpo: { confirmar: true } });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    assert.equal(r.json.parcela.status, 'reembolsado');
    assert.ok(mpChamadas.some((c) => c.p.includes('/refunds')), 'estorno não chamou a API do MP');
    const aud = await req('GET', '/staff/api/alta-vista/auditoria');
    assert.ok(aud.json.eventos.some((e) => e.acao === 'parcela.reembolso'), 'reembolso sem auditoria');
  });

  await t('financeiro gerencial: números reais, despesa entra na margem, CSV com BOM', async () => {
    await req('POST', '/staff/api/alta-vista/despesas', { corpo: { descricao: 'Bateria extra do drone', categoria: 'equipamento', valor_centavos: 45000 } });
    const f = await req('GET', '/staff/api/alta-vista/financeiro');
    assert.ok(f.json.recebido_centavos >= 84900 + parcelas[1].valor_centavos, 'recebido não consolidou');
    assert.equal(f.json.despesas_centavos, 45000);
    assert.equal(f.json.margem_centavos, f.json.recebido_centavos - f.json.reembolsado_centavos - 45000, 'margem errada');
    assert.ok(f.json.aviso.includes('não substitui'), 'aviso de contabilidade sumiu');
    assert.ok(f.json.por_projeto.length >= 2, 'visão por projeto vazia');
    const csv = await fetch(BASE + '/staff/api/alta-vista/financeiro.csv', { headers: { 'x-test-user': 'adm' } });
    const bytes = Buffer.from(await csv.arrayBuffer());
    assert.ok(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF, 'CSV financeiro sem BOM');
    assert.ok(bytes.toString('utf8').includes('Sinal'), 'CSV sem as parcelas');
  });

  // ================= Onda 5: arquivos, versões, revisão e entrega =================
  const storage = require('./storage');
  const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(80, 7)]);
  const subirLocal = async (uploadUrl, buf) => fetch(BASE + uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: buf });

  let entregaRita = null, versao2 = null;
  await t('staff cria entregável, sobe v1 e v2 (histórico), cliente é avisado por e-mail', async () => {
    const en = await req('POST', `/staff/api/alta-vista/projetos/${projetoRita.id}/entregas`, { corpo: { titulo: 'Vídeo vertical 45s', tipo: 'video' } });
    assert.equal(en.st, 200, en.texto.slice(0, 160));
    entregaRita = en.json.entrega;
    for (const nota of ['primeira edição', 'ajuste de cor']) {
      const alvo = await req('POST', `/staff/api/alta-vista/entregas/${entregaRita.id}/upload-url`, { corpo: { mime: 'image/jpeg', tamanho: JPG.length } });
      assert.equal(alvo.json.modo, 'local', 'sem envs S3 o driver deveria ser local');
      const put = await subirLocal(alvo.json.url, JPG);
      assert.equal(put.status, 200, 'PUT local falhou');
      const emailsAntes = emails.length;
      const v = await req('POST', `/staff/api/alta-vista/entregas/${entregaRita.id}/versoes`, { corpo: { upload_id: alvo.json.upload_id, nota } });
      assert.equal(v.st, 200, v.texto.slice(0, 200));
      versao2 = v.json.versao;
      assert.ok(emails.length > emailsAntes && emails[emails.length - 1].html.includes('revisão'), 'cliente não foi avisado da versão nova');
    }
    assert.equal(versao2.numero, 2, 'versões não acumularam histórico');
    const lista = await req('GET', `/staff/api/alta-vista/projetos/${projetoRita.id}`);
    assert.equal(lista.json.entregas[0].versoes.length, 2, 'v1 sumiu quando v2 entrou');
  });

  await t('upload com conteúdo que não bate os magic bytes é recusado', async () => {
    const alvo = await req('POST', `/staff/api/alta-vista/entregas/${entregaRita.id}/upload-url`, { corpo: { mime: 'image/jpeg', tamanho: 40 } });
    const put = await subirLocal(alvo.json.url, Buffer.from('isto é texto, não um JPG de verdade'));
    assert.equal(put.status, 400, 'aceitou conteúdo falso');
    const conf = await req('POST', `/staff/api/alta-vista/entregas/${entregaRita.id}/versoes`, { corpo: { upload_id: alvo.json.upload_id } });
    assert.equal(conf.st, 400, 'confirmou versão sem arquivo válido');
  });

  await t('prévia do cliente vem com tarja enquanto há saldo; isolamento vale também aqui', async () => {
    const r = await req('GET', `/alta-vista/api/app/versoes/${versao2.id}/previa`, { como: 'rita' });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    assert.ok(r.json.previa, 'com saldo em aberto a prévia deveria levar tarja');
    const arquivo = await fetch(BASE + r.json.url);
    assert.equal(arquivo.status, 200, 'URL assinada não serviu o arquivo');
    assert.equal(arquivo.headers.get('content-type'), 'image/jpeg');
    assert.equal((await req('GET', `/alta-vista/api/app/versoes/${versao2.id}/previa`, { como: 'ana' })).st, 404, 'Ana viu a versão da Rita');
  });

  await t('comentário ancorado no tempo do vídeo: cliente comenta, equipe responde', async () => {
    const c = await req('POST', `/alta-vista/api/app/versoes/${versao2.id}/comentarios`, { como: 'rita', corpo: { texto: 'Corta essa cena', ancora: { t: 12.5 } } });
    assert.equal(c.st, 200);
    assert.equal(c.json.comentarios[0].ancora.t, 12.5, 'âncora de tempo não gravou');
    const resp = await req('POST', `/staff/api/alta-vista/versoes/${versao2.id}/comentarios`, { corpo: { texto: 'Cortada na v3.' } });
    assert.equal(resp.st, 200);
    const det = await req('GET', `/alta-vista/api/app/projetos/${projetoRita.id}`, { como: 'rita' });
    const coments = det.json.entregas[0].versoes[1].comentarios;
    assert.equal(coments.length, 2);
    assert.ok(coments.some((x) => x.autor === 'equipe'), 'resposta da equipe sumiu');
  });

  await t('download final: exige aprovação formal E saldo zero, e registra quem baixou', async () => {
    const cedo = await req('GET', `/alta-vista/api/app/versoes/${versao2.id}/download`, { como: 'rita' });
    assert.equal(cedo.st, 400, 'baixou sem aprovar');
    const ap = await req('POST', `/alta-vista/api/app/entregas/${entregaRita.id}/aprovar`, { como: 'rita' });
    assert.equal(ap.st, 200);
    assert.equal(ap.json.entrega.aprovada_por, 'Rita Campos');
    const comSaldo = await req('GET', `/alta-vista/api/app/versoes/${versao2.id}/download`, { como: 'rita' });
    assert.equal(comSaldo.st, 400, 'baixou com saldo em aberto');
    assert.ok(comSaldo.json.erro.includes('quita'), 'erro não explica a quitação');
    // quita a parcela que ficou reembolsada nos testes da Onda 4
    await req('POST', `/staff/api/alta-vista/parcelas/${parcelas[0].id}/marcar-pago`, { corpo: { justificativa: 'novo Pix após o estorno (teste)' } });
    const ok2 = await req('GET', `/alta-vista/api/app/versoes/${versao2.id}/download`, { como: 'rita' });
    assert.equal(ok2.st, 200, ok2.texto.slice(0, 160));
    assert.equal(db.prepare('SELECT COUNT(*) c FROM downloads WHERE versao_id = ?').get(versao2.id).c, 1, 'download sem registro');
    const semTarja = await req('GET', `/alta-vista/api/app/versoes/${versao2.id}/previa`, { como: 'rita' });
    assert.ok(!semTarja.json.previa, 'quitado ainda com tarja de prévia');
  });

  await t('todas as entregas aprovadas + projeto em client_review → approved sozinho', async () => {
    const cRita = repo.Clientes.porEmail('rita@t.br');
    const pTour = repo.Projetos.doCliente(cRita.id).find((x) => x.titulo === 'Tour da pousada');
    for (const st of ['scheduling', 'production', 'quality_control', 'client_review']) {
      await req('POST', `/staff/api/alta-vista/projetos/${pTour.id}/status`, { corpo: { status: st } });
    }
    const en = await req('POST', `/staff/api/alta-vista/projetos/${pTour.id}/entregas`, { corpo: { titulo: 'Tour 360°', tipo: 'panorama' } });
    const alvo = await req('POST', `/staff/api/alta-vista/entregas/${en.json.entrega.id}/upload-url`, { corpo: { mime: 'image/jpeg', tamanho: JPG.length } });
    await subirLocal(alvo.json.url, JPG);
    await req('POST', `/staff/api/alta-vista/entregas/${en.json.entrega.id}/versoes`, { corpo: { upload_id: alvo.json.upload_id } });
    const ap = await req('POST', `/alta-vista/api/app/entregas/${en.json.entrega.id}/aprovar`, { como: 'rita' });
    assert.equal(ap.st, 200);
    const pr = repo.Projetos.obter(pTour.id);
    assert.equal(pr.status, 'approved', 'projeto não promoveu sozinho');
    assert.ok(repo.Projetos.eventos(pTour.id).some((e) => e.para === 'approved' && e.justificativa.includes('todas as entregas')), 'evento da promoção ausente');
  });

  await t('materiais do cliente: upload próprio, staff enxerga, isolamento e remoção', async () => {
    const alvo = await req('POST', `/alta-vista/api/app/projetos/${projetoRita.id}/materiais/upload-url`, { como: 'rita', corpo: { mime: 'image/jpeg', tamanho: JPG.length, nome: 'sala.jpg' } });
    assert.equal(alvo.st, 200, alvo.texto.slice(0, 160));
    await subirLocal(alvo.json.url, JPG);
    const conf = await req('POST', `/alta-vista/api/app/projetos/${projetoRita.id}/materiais/confirmar`, { como: 'rita', corpo: { upload_id: alvo.json.upload_id, nome: 'sala.jpg' } });
    assert.equal(conf.st, 200);
    const staffVe = await req('GET', `/staff/api/alta-vista/projetos/${projetoRita.id}`);
    assert.ok(staffVe.json.materiais.some((m) => m.nome === 'sala.jpg'), 'staff não viu o material');
    const staffAbre = await req('GET', `/staff/api/alta-vista/materiais/${conf.json.material.id}/ver`);
    assert.equal(staffAbre.st, 200);
    assert.equal((await req('GET', `/alta-vista/api/app/materiais/${conf.json.material.id}/ver`, { como: 'ana' })).st, 404, 'Ana viu material da Rita');
    const rm = await req('DELETE', `/alta-vista/api/app/materiais/${conf.json.material.id}`, { como: 'rita' });
    assert.equal(rm.st, 200);
  });

  await t('URL assinada vencida é recusada (403)', async () => {
    const v = db.prepare('SELECT * FROM entrega_versoes WHERE id = ?').get(versao2.id);
    const vencida = storage.assinarUrl(v.chave, -60);
    const r = await fetch(BASE + vencida);
    assert.equal(r.status, 403, 'link vencido serviu arquivo');
  });

  // ================= Onda 6: tours 360° dinâmicos =================
  let tour = null, cena1 = null, cena2 = null;
  const cRita2 = repo.Clientes.porEmail('rita@t.br');
  const pTour2 = repo.Projetos.doCliente(cRita2.id).find((x) => x.titulo === 'Tour da pousada');

  await t('tour nasce em rascunho; publicar sem cenas e hotspot inválido são recusados', async () => {
    const r = await req('POST', '/staff/api/alta-vista/tours', { corpo: { titulo: 'Pousada Vista Alta — Tour 360°', projeto_id: pTour2.id } });
    assert.equal(r.st, 200, r.texto.slice(0, 160));
    tour = r.json.tour;
    assert.equal(tour.status, 'rascunho');
    assert.equal(tour.cliente_id, cRita2.id, 'cliente não veio do projeto');
    const semCena = await req('POST', `/staff/api/alta-vista/tours/${tour.id}/publicar`, {});
    assert.equal(semCena.st, 400, 'publicou tour vazio');
    for (const titulo of ['Recepção', 'Suíte Master']) {
      const alvo = await req('POST', `/staff/api/alta-vista/tours/${tour.id}/cenas/upload-url`, { corpo: { mime: 'image/jpeg', tamanho: JPG.length } });
      await subirLocal(alvo.json.url, JPG);
      const c = await req('POST', `/staff/api/alta-vista/tours/${tour.id}/cenas`, { corpo: { upload_id: alvo.json.upload_id, titulo } });
      assert.equal(c.st, 200, c.texto.slice(0, 160));
      if (!cena1) cena1 = c.json.cena; else cena2 = c.json.cena;
    }
    const hs = await req('POST', `/staff/api/alta-vista/tours/cenas/${cena1.id}/hotspots`, { corpo: { yaw: 40, pitch: -3, tipo: 'cena', destino_cena_id: cena2.id, texto: 'Suíte Master' } });
    assert.equal(hs.st, 200);
    const semTexto = await req('POST', `/staff/api/alta-vista/tours/cenas/${cena1.id}/hotspots`, { corpo: { tipo: 'info' } });
    assert.equal(semTexto.st, 400, 'info sem texto passou');
  });

  await t('link quebrado bloqueia a publicação com explicação; consertado, publica com franquia', async () => {
    // simula hotspot órfão legado (a UI não cria assim; a validação tem de pegar mesmo assim)
    db.prepare("INSERT INTO tour_hotspots (id, tour_id, cena_id, yaw, pitch, tipo, texto, destino_cena_id, criado_em) VALUES ('hs-orfao', ?, ?, 0, 0, 'cena', 'porta fantasma', 'cena-que-nao-existe', ?)")
      .run(tour.id, cena1.id, new Date().toISOString());
    const quebrado = await req('POST', `/staff/api/alta-vista/tours/${tour.id}/publicar`, {});
    assert.equal(quebrado.st, 400);
    assert.ok(quebrado.json.erro.includes('link quebrado'), 'erro não explica o link quebrado');
    db.prepare("DELETE FROM tour_hotspots WHERE id = 'hs-orfao'").run();
    const ok3 = await req('POST', `/staff/api/alta-vista/tours/${tour.id}/publicar`, {});
    assert.equal(ok3.st, 200, ok3.texto.slice(0, 200));
    tour = ok3.json.tour;
    assert.equal(tour.status, 'publicado');
    assert.equal(tour.cena_inicial, cena1.id, 'cena inicial não caiu na 1ª da ordem');
    assert.ok(tour.expira_em > new Date().toISOString().slice(0, 10), 'franquia padrão não aplicada');
  });

  await t('página pública injeta o manifesto do banco no visualizador da casa e conta views', async () => {
    const r = await req('GET', `/alta-vista/t/${tour.slug}`);
    assert.equal(r.st, 200);
    assert.ok(r.texto.includes('window.TOUR360'), 'manifesto ausente');
    assert.ok(r.texto.includes('/alta-vista/tour360/visualizador.js'), 'visualizador da casa não referenciado');
    assert.ok(r.texto.includes('Suíte Master'), 'hotspot fora do manifesto');
    assert.ok(!r.texto.includes('noindex'), 'tour público não deveria ter noindex');
    await req('GET', `/alta-vista/t/${tour.slug}`);
    assert.equal(db.prepare("SELECT SUM(hits) v FROM tour_views WHERE tour_id = ?").get(tour.id).v, 2, 'views não contaram');
    const js = await req('GET', '/alta-vista/tour360/visualizador.js');
    assert.equal(js.st, 200);
    assert.ok(js.texto.includes('TOUR360'), 'arquivo do visualizador não é o da casa');
  });

  await t('texturas -1024/-thumb passam pelo gate e redirecionam para URL assinada', async () => {
    for (const sufixo of ['1024', 'thumb']) {
      const r = await fetch(`${BASE}/alta-vista/t/${tour.slug}/img/${cena1.id}-${sufixo}.jpg`, { redirect: 'manual' });
      assert.equal(r.status, 302, sufixo + ' não redirecionou');
      const img = await fetch(BASE + r.headers.get('location'));
      assert.equal(img.status, 200, 'assinada não serviu');
      assert.equal(img.headers.get('content-type'), 'image/jpeg');
    }
    assert.equal((await fetch(`${BASE}/alta-vista/t/${tour.slug}/img/nome-esquisito`)).status, 400);
    assert.equal((await fetch(`${BASE}/alta-vista/t/${tour.slug}/img/inexistente-1024.jpg`)).status, 404);
  });

  await t('rascunho é invisível; preview_token abre com banner (e sem contar view) e liga o editor', async () => {
    const dup = await req('POST', `/staff/api/alta-vista/tours/${tour.id}/duplicar`, {});
    const copia = dup.json.tour;
    assert.equal(copia.status, 'rascunho');
    assert.ok(copia.slug.includes('copia'));
    assert.equal(copia.cenas.length, 2, 'cenas não copiaram');
    const hsCopia = copia.cenas.find((c) => c.hotspots.length).hotspots[0];
    assert.ok(copia.cenas.some((c) => c.id === hsCopia.destino_cena_id), 'hotspot da cópia não foi remapeado para a cena NOVA');
    assert.equal((await req('GET', `/alta-vista/t/${copia.slug}`)).st, 404, 'rascunho visível sem token');
    const detalhe = await req('GET', `/staff/api/alta-vista/tours/${copia.id}`);
    const prev = await req('GET', `/alta-vista/t/${copia.slug}?chave=${detalhe.json.tour.preview_token}`, { como: 'staff-prev' });
    assert.equal(prev.st, 200);
    assert.ok(prev.texto.includes('PRÉVIA'), 'banner de prévia ausente');
    assert.equal((db.prepare('SELECT SUM(hits) v FROM tour_views WHERE tour_id = ?').get(copia.id) || {}).v || 0, 0, 'prévia contou view');
    const ed = await req('GET', `/alta-vista/t/${copia.slug}?chave=${detalhe.json.tour.preview_token}&editor=1`, { como: 'staff-prev' });
    assert.ok(ed.texto.includes('editor.js'), 'modo editor não carregou o editor da casa');
  });

  await t('visibilidade: não listado ganha noindex; senha exige a senha certa (cookie de 2 h)', async () => {
    await req('PATCH', `/staff/api/alta-vista/tours/${tour.id}`, { corpo: { visibilidade: 'nao_listado' } });
    const nl = await req('GET', `/alta-vista/t/${tour.slug}`);
    assert.ok(nl.texto.includes('noindex'), 'não listado sem noindex');
    await req('PATCH', `/staff/api/alta-vista/tours/${tour.id}`, { corpo: { visibilidade: 'senha', senha: 'hospede123' } });
    const form = await req('GET', `/alta-vista/t/${tour.slug}`);
    assert.ok(form.texto.includes('protegido'), 'form de senha não apareceu');
    const imgSem = await fetch(`${BASE}/alta-vista/t/${tour.slug}/img/${cena1.id}-1024.jpg`, { redirect: 'manual' });
    assert.equal(imgSem.status, 403, 'textura servida sem senha');
    const errada = await fetch(`${BASE}/alta-vista/t/${tour.slug}/senha`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'senha=errada', redirect: 'manual' });
    assert.ok(errada.headers.get('location').includes('erro=1'), 'senha errada não sinalizou');
    const certa = await fetch(`${BASE}/alta-vista/t/${tour.slug}/senha`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'senha=hospede123', redirect: 'manual' });
    const cookie = (certa.headers.getSetCookie ? certa.headers.getSetCookie() : []).find((c) => c.startsWith('avt_'));
    assert.ok(cookie, 'cookie de acesso não veio');
    const dentro = await fetch(`${BASE}/alta-vista/t/${tour.slug}`, { headers: { Cookie: cookie.split(';')[0] } });
    assert.ok((await dentro.text()).includes('window.TOUR360'), 'com cookie o tour não abriu');
    await req('PATCH', `/staff/api/alta-vista/tours/${tour.id}`, { corpo: { visibilidade: 'publico' } }); // volta
  });

  await t('expirado sai do ar com aviso; renovação paga estende a validade sozinha', async () => {
    const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await req('PATCH', `/staff/api/alta-vista/tours/${tour.id}`, { corpo: { expira_em: ontem } });
    const pg = await req('GET', `/alta-vista/t/${tour.slug}`);
    assert.ok(pg.texto.includes('expirou'), 'página não avisou a expiração');
    assert.equal((await fetch(`${BASE}/alta-vista/t/${tour.slug}/img/${cena1.id}-1024.jpg`, { redirect: 'manual' })).status, 403, 'textura de tour expirado servida');
    // cliente renova (anual) → parcela avulsa → webhook aprova → validade estendida
    const ren = await req('POST', `/alta-vista/api/app/tours/${tour.id}/renovar`, { como: 'rita', corpo: { plano: 'anual' } });
    assert.equal(ren.st, 200, ren.texto.slice(0, 200));
    assert.equal(ren.json.parcela.valor_centavos, 29000, 'preço da renovação não veio do catálogo');
    assert.ok(ren.json.init_point, 'checkout da renovação não abriu');
    mpPagamentos.PAY400 = { status: 'approved', external_reference: 'altavista:' + ren.json.parcela.id, transaction_amount: 290, currency_id: 'BRL' };
    await req('POST', '/alta-vista/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 'PAY400' } } });
    await new Promise((x) => setTimeout(x, 60));
    const depois = db.prepare('SELECT expira_em FROM tours WHERE id = ?').get(tour.id).expira_em;
    const minimo = new Date(Date.now() + 360 * 86400000).toISOString().slice(0, 10);
    assert.ok(depois >= minimo, `validade não estendeu (${depois})`);
    assert.equal((await req('GET', `/alta-vista/t/${tour.slug}`)).texto.includes('window.TOUR360'), true, 'tour renovado não voltou ao ar');
  });

  await t('cliente vê seus tours (link, embed, QR, stats) e não os dos outros', async () => {
    const meus = await req('GET', '/alta-vista/api/app/tours', { como: 'rita' });
    const item = meus.json.tours.find((x) => x.id === tour.id);
    assert.ok(item && item.url.includes(tour.slug) && item.embed.includes('iframe'), 'link/embed ausentes');
    assert.ok(item.views_total >= 2, 'stats zeradas');
    const daAna = await req('GET', '/alta-vista/api/app/tours', { como: 'ana' });
    assert.equal(daAna.json.tours.length, 0, 'Ana viu tours da Rita');
    assert.equal((await req('GET', `/alta-vista/api/app/tours/${tour.id}/qr`, { como: 'ana' })).st, 404, 'Ana pegou QR alheio');
    const qr = await fetch(`${BASE}/alta-vista/api/app/tours/${tour.id}/qr`, { headers: { Cookie: Object.entries(jars.rita).map(([k, v]) => `${k}=${v}`).join('; ') } });
    assert.equal(qr.status, 200);
    assert.ok((await qr.text()).includes('<svg'), 'QR não é SVG');
  });

  // ================= Onda 7: operação, prontidão e lançamento =================
  await t('checklist de drone: confirmar voo só com TODOS os itens de segurança marcados', async () => {
    const cl = await req('POST', `/staff/api/alta-vista/projetos/${projetoRita.id}/checklists`, { corpo: { categoria: 'drone' } });
    assert.equal(cl.st, 200, cl.texto.slice(0, 160));
    const checklist = cl.json.checklist;
    const cedo = await req('POST', `/staff/api/alta-vista/checklists/${checklist.id}/decisao`, { corpo: { decisao: 'confirmado' } });
    assert.equal(cedo.st, 400, 'confirmou voo sem segurança');
    assert.ok(cedo.json.erro.includes('espaço aéreo') || cedo.json.erro.includes('segurança'), 'erro não lista as pendências');
    for (const item of checklist.itens) {
      await req('POST', `/staff/api/alta-vista/checklists/${checklist.id}/itens/${item.id}`, { corpo: { feito: true } });
    }
    const ok5 = await req('POST', `/staff/api/alta-vista/checklists/${checklist.id}/decisao`, { corpo: { decisao: 'confirmado' } });
    assert.equal(ok5.st, 200);
    assert.equal(ok5.json.checklist.decisao_quem, 'Admin', 'decisão sem autor');
    // desmarcar item de segurança derruba a confirmação sozinho
    const seg = checklist.itens.find((i) => i.seguranca);
    const caiu = await req('POST', `/staff/api/alta-vista/checklists/${checklist.id}/itens/${seg.id}`, { corpo: { feito: false } });
    assert.equal(caiu.json.checklist.decisao, '', 'voo continuou confirmado com segurança desmarcada');
    const dup2 = await req('POST', `/staff/api/alta-vista/projetos/${projetoRita.id}/checklists`, { corpo: { categoria: 'drone' } });
    assert.equal(dup2.st, 400, 'criou checklist em dobro');
  });

  await t('portão de prontidão: bloqueia com pendências, libera com os 12 ✓ e revoga sozinho', async () => {
    const antes = await req('GET', '/staff/api/alta-vista/prontidao');
    assert.equal(antes.json.itens.length, 12, 'não são os 12 itens da spec');
    assert.ok(!antes.json.apto && !antes.json.divulgacao_liberada);
    const barrado = await req('POST', '/staff/api/alta-vista/prontidao-liberar', {});
    assert.equal(barrado.st, 400);
    assert.ok(barrado.json.erro.includes('Pendências'), 'erro não lista as pendências');
    for (const item of antes.json.itens) {
      await req('POST', `/staff/api/alta-vista/prontidao/${item.chave}`, { corpo: { feito: true, nota: 'teste' } });
    }
    const liberado = await req('POST', '/staff/api/alta-vista/prontidao-liberar', {});
    assert.equal(liberado.st, 200, liberado.texto.slice(0, 160));
    const dep = await req('GET', '/staff/api/alta-vista/prontidao');
    assert.ok(dep.json.divulgacao_liberada, 'flag de divulgação não ligou');
    // um item cai → a liberação cai junto, sem depender de ninguém lembrar
    await req('POST', '/staff/api/alta-vista/prontidao/checkout-testado', { corpo: { feito: false } });
    const revogado = await req('GET', '/staff/api/alta-vista/prontidao');
    assert.ok(!revogado.json.divulgacao_liberada, 'liberação sobreviveu a item desmarcado');
    await req('POST', '/staff/api/alta-vista/prontidao/checkout-testado', { corpo: { feito: true } }); // repõe
  });

  await t('capacidade semanal: agenda cheia recomenda pausar a aquisição', async () => {
    await req('PATCH', '/staff/api/alta-vista/config', { corpo: { capacidade_semanal: '1' } });
    const quadro = await req('GET', '/staff/api/alta-vista/operacao');
    assert.ok(quadro.json.capacidade.ativos >= 1, 'nenhum projeto ativo no cenário de teste');
    assert.ok(quadro.json.capacidade.agenda_cheia, 'agenda deveria estar cheia com limite 1');
    assert.ok(quadro.json.capacidade.recomendacao.includes('PAUSAR'), 'sem recomendação de pausa');
    await req('PATCH', '/staff/api/alta-vista/config', { corpo: { capacidade_semanal: '2' } });
  });

  await t('campanha 90 dias: custo manual entra no painel e o teto estourado grita', async () => {
    const c1 = await req('POST', '/staff/api/alta-vista/campanha/custos', { corpo: { canal: 'google', valor_centavos: 3000, nota: 'semana 5 — pesquisa' } });
    assert.equal(c1.st, 200);
    let painel = await req('GET', '/staff/api/alta-vista/campanha');
    assert.equal(painel.json.gasto_mes_centavos, 3000);
    assert.ok(!painel.json.estourou_teto);
    assert.ok(painel.json.campanha.nome === 'Primeiros Espaços em Alta' && painel.json.campanha.fases.length === 4, 'campanha da spec ausente');
    assert.ok(painel.json.custo_por_lead_centavos > 0, 'custo por lead não calculou');
    const estouro = await req('POST', '/staff/api/alta-vista/campanha/custos', { corpo: { canal: 'meta', valor_centavos: 99000, nota: 'teste de teto' } });
    painel = await req('GET', '/staff/api/alta-vista/campanha');
    assert.ok(painel.json.estourou_teto, 'teto de R$ 1.000 estourado sem aviso');
    await req('DELETE', `/staff/api/alta-vista/campanha/custos/${estouro.json.custo.id}`, {});
  });

  await t('relatórios calculam do banco: entregas, ticket, revisões, recorrência e tours', async () => {
    // fecha um ciclo completo para o relatório ter uma entrega de verdade
    const cRita3 = repo.Clientes.porEmail('rita@t.br');
    const pTour3 = repo.Projetos.doCliente(cRita3.id).find((x) => x.titulo === 'Tour da pousada');
    await req('POST', `/staff/api/alta-vista/projetos/${pTour3.id}/status`, { corpo: { status: 'delivered' } });
    const r = await req('GET', '/staff/api/alta-vista/relatorios');
    assert.equal(r.st, 200);
    assert.ok(r.json.entregues_total >= 1, 'entrega não contou');
    assert.ok(r.json.tempo_medio_entrega_dias != null, 'tempo médio ausente');
    assert.ok(r.json.ticket_medio_centavos >= 135200, 'ticket médio errado');
    assert.ok(r.json.clientes_recorrentes >= 1, 'Rita tem vários projetos e não contou como recorrente');
    assert.ok(r.json.media_versoes_por_entrega >= 1, 'média de versões ausente');
    assert.ok(r.json.tours_views_total >= 2, 'views de tours fora do relatório');
    assert.ok(r.json.aviso.includes('nada aqui é projeção'), 'aviso de honestidade sumiu');
  });

  srv.close();
  console.log(`\n${ok} teste(s) OK, ${falhas.length} falha(s)`);
  if (falhas.length) { falhas.forEach((f) => console.log('  ✗', f)); process.exit(1); }
}

rodar().catch((e) => { console.error(e); process.exit(1); });
