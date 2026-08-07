// =====================================================================
// Villela Kids — suíte de testes. Sobe o Express real com auth de staff
// injetada e banco descartável.  npm run test:kids
//
// O foco é o que protege criança e o que sustenta o produto: consentimento
// parental obrigatório (LGPD art. 14), minimização do perfil infantil,
// isolamento total entre famílias, desbloqueio linear da trilha,
// criação → portfólio, e exclusão que APAGA de verdade.
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'kids-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
process.env.KIDS_DEMO_SENHA = 'SenhaDemo!2026';
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

async function criarFamilia(apelido, nome, email) {
  const r = await req('POST', '/kids/api/cadastrar', {
    como: apelido,
    corpo: { nome, email, senha: 'senha-forte-8', aceite_termos: true, consentimento_parental: true },
  });
  assert.equal(r.st, 200, 'cadastro ' + apelido + ': ' + JSON.stringify(r.json));
  return r.json.usuario;
}

async function rodar() {
  const srv = app.listen(0);
  BASE = 'http://127.0.0.1:' + srv.address().port;
  console.log('Villela Kids — selftest\n');

  // ================= páginas públicas =================
  await t('páginas públicas respondem 200 (home, entrar, termos, privacidade, app)', async () => {
    for (const p of ['/kids', '/kids/entrar', '/kids/termos', '/kids/privacidade', '/kids/app']) {
      assert.equal((await req('GET', p)).st, 200, p);
    }
  });
  await t('landing traz os 4 eixos, o aviso de beta fechado e o bloco de segurança dos pais', async () => {
    const r = await req('GET', '/kids');
    for (const trecho of ['Pensar', 'Criar', 'Comunicar', 'Realizar', 'Beta fechado', 'Para os pais', 'LGPD']) {
      assert.ok(r.texto.includes(trecho), 'faltou: ' + trecho);
    }
  });
  await t('textos jurídicos carregam a tarja de MINUTA', async () => {
    for (const p of ['/kids/termos', '/kids/privacidade']) {
      assert.ok((await req('GET', p)).texto.includes('MINUTA'), p + ' sem tarja');
    }
  });
  await t('robots.txt bloqueia /kids/app e /kids/api; sitemap responde', async () => {
    const r = await req('GET', '/kids/robots.txt');
    assert.ok(r.texto.includes('Disallow: /kids/app') && r.texto.includes('Disallow: /kids/api'));
    assert.equal((await req('GET', '/kids/sitemap.xml')).st, 200);
  });
  await t('bundle do app é servido com cache imutável', async () => {
    const r = await fetch(BASE + '/kids/app.js');
    assert.equal(r.status, 200);
    assert.ok(String(r.headers.get('cache-control') || '').includes('immutable'));
  });

  // ================= conta do responsável =================
  await t('cadastro SEM consentimento parental é recusado (LGPD art. 14)', async () => {
    const r = await req('POST', '/kids/api/cadastrar', { corpo: { nome: 'X', email: 'x@t.com', senha: 'senha-forte-8', aceite_termos: true } });
    assert.equal(r.st, 400);
    assert.ok(/consentimento/i.test(r.json.erro));
  });
  await t('cadastro sem aceite de termos é recusado', async () => {
    const r = await req('POST', '/kids/api/cadastrar', { corpo: { nome: 'X', email: 'x2@t.com', senha: 'senha-forte-8', consentimento_parental: true } });
    assert.equal(r.st, 400);
  });
  await t('cadastro completo cria sessão e envia e-mail de boas-vindas', async () => {
    await criarFamilia('ana', 'Ana Mãe', 'ana@t.com');
    const me = await req('GET', '/kids/api/me', { como: 'ana' });
    assert.equal(me.st, 200);
    assert.equal(me.json.usuario.email, 'ana@t.com');
    assert.ok(emailsEnviados.some((e) => e.to === 'ana@t.com'));
  });
  await t('API autenticada sem sessão devolve 401', async () => {
    assert.equal((await req('GET', '/kids/api/me')).st, 401);
    assert.equal((await req('GET', '/kids/api/criancas')).st, 401);
  });

  // ================= perfis de criança =================
  let ana1 = null;
  await t('perfil de criança nasce mínimo (apelido + faixa + avatar)', async () => {
    const r = await req('POST', '/kids/api/criancas', { como: 'ana', corpo: { apelido: 'Duda', faixa: '7-8', avatar: '🦖' } });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    ana1 = r.json.crianca;
    assert.equal(ana1.apelido, 'Duda');
    const cols = Object.keys(ana1);
    for (const proibida of ['nome_completo', 'nascimento', 'email', 'foto']) assert.ok(!cols.includes(proibida));
  });
  await t('apelido com cara de dado pessoal (e-mail/números longos) é recusado', async () => {
    assert.equal((await req('POST', '/kids/api/criancas', { como: 'ana', corpo: { apelido: 'duda@gmail.com' } })).st, 400);
    assert.equal((await req('POST', '/kids/api/criancas', { como: 'ana', corpo: { apelido: 'Duda 2015' } })).st, 400);
  });
  await t('limite de perfis por conta é respeitado', async () => {
    const max = repo.Config.num('max_perfis_por_conta', 6);
    for (let i = 2; i <= max; i++) {
      assert.equal((await req('POST', '/kids/api/criancas', { como: 'ana', corpo: { apelido: 'Filho ' + 'abc'[i % 3] + i } })).st, 200);
    }
    const r = await req('POST', '/kids/api/criancas', { como: 'ana', corpo: { apelido: 'Extra' } });
    assert.equal(r.st, 400);
    assert.ok(/limite/i.test(r.json.erro));
  });

  // ================= trilha e portfólio =================
  await t('trilha nasce com a missão 1 disponível e as demais bloqueadas', async () => {
    const r = await req('GET', `/kids/api/criancas/${ana1.id}/missoes`, { como: 'ana' });
    assert.equal(r.st, 200);
    assert.equal(r.json.missoes.length, 8);
    assert.equal(r.json.missoes[0].status, 'disponivel');
    for (const m of r.json.missoes.slice(1)) assert.equal(m.status, 'bloqueada', m.id);
  });
  await t('iniciar missão bloqueada é recusado', async () => {
    const r = await req('POST', `/kids/api/criancas/${ana1.id}/missoes/m03-estudio-ilustracao/iniciar`, { como: 'ana' });
    assert.equal(r.st, 400);
  });
  await t('concluir sem ter iniciado é recusado; concluir sem criação também', async () => {
    assert.equal((await req('POST', `/kids/api/criancas/${ana1.id}/missoes/m01-meu-assistente/concluir`, { como: 'ana', corpo: { titulo: 'x', conteudo: 'y' } })).st, 400);
    assert.equal((await req('POST', `/kids/api/criancas/${ana1.id}/missoes/m01-meu-assistente/iniciar`, { como: 'ana' })).st, 200);
    assert.equal((await req('POST', `/kids/api/criancas/${ana1.id}/missoes/m01-meu-assistente/concluir`, { como: 'ana', corpo: { titulo: '', conteudo: '' } })).st, 400);
  });
  await t('concluir com criação grava o portfólio, abre a missão 2 e avisa o responsável', async () => {
    const r = await req('POST', `/kids/api/criancas/${ana1.id}/missoes/m01-meu-assistente/concluir`, {
      como: 'ana', corpo: { titulo: 'Manual do Robi', conteudo: 'Regra 1: perguntar direito. Regra 2: conferir.' },
    });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    assert.ok(r.json.portfolio_id);
    assert.equal(r.json.proxima.id, 'm02-minha-historia');
    const trilha = (await req('GET', `/kids/api/criancas/${ana1.id}/missoes`, { como: 'ana' })).json.missoes;
    assert.equal(trilha[0].status, 'concluida');
    assert.equal(trilha[1].status, 'disponivel');
    const pf = (await req('GET', `/kids/api/criancas/${ana1.id}/portfolio`, { como: 'ana' })).json.portfolio;
    assert.equal(pf.length, 1);
    assert.equal(pf[0].titulo, 'Manual do Robi');
    const notif = (await req('GET', '/kids/api/notificacoes', { como: 'ana' })).json.notificacoes;
    assert.ok(notif.some((n) => n.titulo.includes('Duda') && n.titulo.includes('concluiu')));
  });
  await t('concluir a mesma missão duas vezes é recusado', async () => {
    const r = await req('POST', `/kids/api/criancas/${ana1.id}/missoes/m01-meu-assistente/concluir`, { como: 'ana', corpo: { titulo: 'De novo', conteudo: 'x' } });
    assert.equal(r.st, 400);
  });

  // ================= isolamento entre famílias =================
  await t('família B não enxerga nem opera a criança da família A', async () => {
    await criarFamilia('bia', 'Bia Mãe', 'bia@t.com');
    for (const [metodo, caminho, corpo] of [
      ['GET', `/kids/api/criancas/${ana1.id}/missoes`],
      ['GET', `/kids/api/criancas/${ana1.id}/portfolio`],
      ['POST', `/kids/api/criancas/${ana1.id}/missoes/m02-minha-historia/iniciar`],
      ['PATCH', `/kids/api/criancas/${ana1.id}`, { apelido: 'Hackeada' }],
      ['DELETE', `/kids/api/criancas/${ana1.id}`],
    ]) {
      const r = await req(metodo, caminho, { como: 'bia', corpo });
      assert.equal(r.st, 400, metodo + ' ' + caminho + ' → ' + r.st);
      assert.ok(/não encontrado/i.test(r.json.erro), r.json.erro);
    }
  });

  // ================= LGPD =================
  await t('exportar dados traz a família inteira e nunca o hash de senha', async () => {
    const r = await req('GET', '/kids/api/meus-dados', { como: 'ana' });
    assert.equal(r.st, 200);
    assert.ok(!('senha_hash' in r.json.conta) && !('verif_token' in r.json.conta));
    assert.ok(r.json.criancas.length >= 1);
    const duda = r.json.criancas.find((c) => c.apelido === 'Duda');
    assert.equal(duda.portfolio.length, 1);
  });
  await t('excluir a conta APAGA criações e perfis de verdade (não anonimiza criança)', async () => {
    await criarFamilia('caio', 'Caio Pai', 'caio@t.com');
    const c = (await req('POST', '/kids/api/criancas', { como: 'caio', corpo: { apelido: 'Nino' } })).json.crianca;
    await req('POST', `/kids/api/criancas/${c.id}/missoes/m01-meu-assistente/iniciar`, { como: 'caio' });
    await req('POST', `/kids/api/criancas/${c.id}/missoes/m01-meu-assistente/concluir`, { como: 'caio', corpo: { titulo: 'T', conteudo: 'C' } });
    const r = await req('POST', '/kids/api/excluir-conta', { como: 'caio' });
    assert.equal(r.st, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM children WHERE id = ?').get(c.id).c, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM portfolio WHERE child_id = ?').get(c.id).c, 0);
    assert.equal((await req('GET', '/kids/api/me', { como: 'caio' })).st, 401);
  });

  // ================= seed demo =================
  await t('seed demo criou a família de demonstração com o ciclo completo', async () => {
    const r = await req('POST', '/kids/api/login', { corpo: { email: 'familia@demo.kids', senha: 'SenhaDemo!2026' }, como: 'demo' });
    assert.equal(r.st, 200);
    const me = (await req('GET', '/kids/api/me', { como: 'demo' })).json;
    assert.equal(me.criancas.length, 1);
    const trilha = (await req('GET', `/kids/api/criancas/${me.criancas[0].id}/missoes`, { como: 'demo' })).json.missoes;
    assert.equal(trilha[0].status, 'concluida');
    assert.equal(trilha[1].status, 'em_andamento');
  });

  // ================= staff =================
  await t('staff: dashboard consolida famílias, crianças, funil e últimas criações', async () => {
    const r = await req('GET', '/staff/api/kids/dashboard');
    assert.equal(r.st, 200);
    assert.ok(r.json.familias >= 3);
    assert.ok(r.json.criacoes >= 2);
    assert.equal(r.json.funil.length, 8);
    assert.ok(r.json.funil[0].concluidas >= 2);
    assert.ok(r.json.ultimas_criacoes.length >= 2);
  });
  await t('staff: catálogo lista as 8 missões; despublicar exige admin e some da trilha', async () => {
    assert.equal((await req('GET', '/staff/api/kids/missoes')).json.missoes.length, 8);
    assert.equal((await req('PATCH', '/staff/api/kids/missoes/m08-detetive-digital', { staff: 'op', corpo: { ativa: false } })).st, 403);
    assert.equal((await req('PATCH', '/staff/api/kids/missoes/m08-detetive-digital', { corpo: { ativa: false } })).st, 200);
    const trilha = (await req('GET', `/kids/api/criancas/${ana1.id}/missoes`, { como: 'ana' })).json.missoes;
    assert.equal(trilha.length, 7);
    assert.equal((await req('PATCH', '/staff/api/kids/missoes/m08-detetive-digital', { corpo: { ativa: true } })).st, 200);
  });
  await t('staff: bloquear família exige admin, derruba a sessão e reativar devolve', async () => {
    const bia = repo.Users.porEmail('bia@t.com');
    assert.equal((await req('POST', `/staff/api/kids/familias/${bia.id}/bloquear`, { staff: 'op', corpo: { motivo: 'x' } })).st, 403);
    assert.equal((await req('POST', `/staff/api/kids/familias/${bia.id}/bloquear`, { corpo: { motivo: 'teste' } })).st, 200);
    assert.equal((await req('GET', '/kids/api/me', { como: 'bia' })).st, 401);
    assert.equal((await req('POST', `/staff/api/kids/familias/${bia.id}/reativar`)).st, 200);
    assert.equal((await req('GET', '/kids/api/me', { como: 'bia' })).st, 200);
  });
  await t('staff: auditoria registra criação de conta, LGPD e ações de admin', async () => {
    const a = (await req('GET', '/staff/api/kids/auditoria')).json.auditoria;
    for (const acao of ['conta.criar', 'lgpd.exportar', 'lgpd.excluir', 'missao.desativar', 'usuario.bloquear']) {
      assert.ok(a.some((x) => x.acao === acao), 'faltou auditoria: ' + acao);
    }
  });

  // Por último de propósito: o bloqueio vale 15 min para o IP inteiro e
  // derrubaria qualquer login feito por um teste posterior.
  await t('login errado dá 401; 5 erros seguidos bloqueiam por IP (429)', async () => {
    for (let i = 0; i < 5; i++) {
      assert.equal((await req('POST', '/kids/api/login', { corpo: { email: 'ana@t.com', senha: 'errada-123' } })).st, 401);
    }
    assert.equal((await req('POST', '/kids/api/login', { corpo: { email: 'ana@t.com', senha: 'errada-123' } })).st, 429);
  });

  srv.close();
  console.log(`\n${ok} teste(s) ok, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach((f) => console.log('  ✗', f)); process.exit(1); }
}

rodar().catch((e) => { console.error(e); process.exit(1); });
