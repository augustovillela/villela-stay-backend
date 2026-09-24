// =====================================================================
// Villela Academy Marketplace — suíte de testes. Roda o Express real com
// auth de staff injetada e banco descartável. npm run test:academy
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'academy-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
process.env.ACADEMY_ROTINAS = 'off'; // sem timer de pedidos abandonados no teste
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');

// staff do Portal (dono da plataforma) — mock igual aos outros módulos
const USUARIOS = [
  { id: 'adm', nome: 'Admin', email: 'adm@t', papel: 'admin', areas: ['*'], ativo: true },
  { id: 'op', nome: 'Operador', email: 'op@t', papel: 'membro', areas: ['ti'], ativo: true },
];
function requireAuth(req, res, next) { const u = USUARIOS.find(x => x.id === (req.headers['x-test-user'] || 'adm')); if (!u) return res.status(401).json({ erro: 'x' }); req.user = u; next(); }
const requireAdmin = (req, res, next) => (req.user && req.user.papel === 'admin') ? next() : res.status(403).json({ erro: 'admin' });
// guarda da importação: PUBLISH_KEY (automação local) OU admin do portal
const PUBLISH_KEY_TESTE = 'chave-de-publicacao-teste';
function requirePublishOrAdmin(req, res, next) {
  if (req.headers['x-publish-key'] === PUBLISH_KEY_TESTE) { req.viaChave = true; return next(); }
  return requireAuth(req, res, () => requireAdmin(req, res, next));
}
const alertas = [];
const alertaAugusto = async (m) => { alertas.push(m); };
const enviados = [];
const enviarEmail = async (to, ass, html) => { enviados.push({ to, ass, html }); };

// Mercado Pago mock (FASES 4 e 6): preferências, pagamentos com status
// controlável, busca por external_reference, reembolso e preapproval
const mpChamadas = [];
const MP_STATUS = { 901: 'approved', 902: 'rejected' };
const PAY_REF = {};   // payment id → external_reference (p/ cobranças de assinatura)
const PRE_STATE = {}; // preapproval id → status
const PRE_REF = {};   // preapproval id → external_reference
let ULTIMO_REF = '';
let preSeq = 0;
const mpFetch = async (p, opts) => {
  mpChamadas.push((opts && opts.method ? opts.method + ' ' : '') + p);
  if (p === '/checkout/preferences' && opts && opts.method === 'POST') {
    ULTIMO_REF = JSON.parse(opts.body).external_reference;
    return { id: 'PREF-1', init_point: 'https://mp.test/checkout/PREF-1' };
  }
  if (p === '/preapproval' && opts && opts.method === 'POST') {
    const id = 'PRE-' + (++preSeq);
    PRE_REF[id] = JSON.parse(opts.body).external_reference;
    PRE_STATE[id] = 'pending';
    return { id, init_point: 'https://mp.test/preapproval/' + id, status: 'pending' };
  }
  if (p.startsWith('/preapproval/') && opts && opts.method === 'PUT') {
    const id = p.split('/')[2];
    PRE_STATE[id] = 'cancelled';
    return { id, status: 'cancelled' };
  }
  if (p.startsWith('/preapproval/')) {
    const id = p.split('/')[2];
    return { id, status: PRE_STATE[id] || 'pending', external_reference: PRE_REF[id] || '' };
  }
  if (p.startsWith('/v1/payments/search')) {
    const ref = decodeURIComponent((p.match(/external_reference=([^&]+)/) || [])[1] || '');
    return { results: [{ id: 555, status: 'approved', external_reference: ref }] };
  }
  if (/^\/v1\/payments\/\d+\/refunds$/.test(p)) return { id: 'REF-9', status: 'approved' };
  if (p.startsWith('/v1/payments/')) {
    const id = p.split('/')[3];
    return { id: Number(id), status: MP_STATUS[id] || 'approved', external_reference: PAY_REF[id] || ULTIMO_REF };
  }
  return {};
};

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
const academy = require('./index');
academy.montar(app, { express, requireAuth, requireAdmin, requirePublishOrAdmin, alertaAugusto, enviarEmail, mpFetch, jwtSecret: 'seg-teste' });
const espera = (ms) => new Promise(r => setTimeout(r, ms));

let BASE = '', ok = 0, falhas = [];
// jars de cookie por "pessoa" (cada usuário de teste tem a própria sessão)
const jars = {};
async function req(m, p, { corpo, user = 'adm', jar, ip, chave, semUser } = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-test-user': user, 'x-forwarded-for': ip || '10.0.0.1' };
  if (chave) headers['x-publish-key'] = chave === true ? PUBLISH_KEY_TESTE : chave;
  if (semUser) headers['x-test-user'] = 'ninguem-logado'; // sem sessão de staff: o mock devolve 401
  if (jar && jars[jar]) headers.Cookie = Object.entries(jars[jar]).map(([k, v]) => `${k}=${v}`).join('; ');
  const r = await fetch(BASE + p, { method: m, headers, body: corpo ? JSON.stringify(corpo) : undefined, redirect: 'manual' });
  if (jar) {
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach(c => {
      const [kv] = c.split(';'); const [k, v] = kv.split('=');
      jars[jar] = jars[jar] || {}; if (v) jars[jar][k] = v; else delete jars[jar][k];
    });
  }
  const texto = await r.text(); let json = null; try { json = JSON.parse(texto); } catch (_) {}
  return { st: r.status, json, texto, ct: r.headers.get('content-type') || '' };
}
async function t(nome, fn) { try { await fn(); ok++; console.log('  ✅', nome); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌', nome, '—', e.message); } }

const MARIA = { nome: 'Maria Produtora', email: 'maria@t.com', senha: 'senha-forte-1', aceite_termos: true };
const JOAO = { nome: 'João Afiliado', email: 'joao@t.com', senha: 'senha-forte-2', aceite_termos: true };

async function main() {
  const srv = app.listen(0);
  BASE = `http://127.0.0.1:${srv.address().port}`;

  console.log('\n— páginas públicas —');
  await t('G3 esc(): escapa aspa dupla e simples (o site do produtor ia cru p/ dentro do href)', async () => {
    const fonte = require('fs').readFileSync(require('path').join(__dirname, 'paginas.js'), 'utf8');
    const ini = fonte.indexOf('const esc =');
    assert.ok(ini >= 0, 'o helper esc tem de existir em paginas.js');
    const fimLinha = fonte.indexOf(String.fromCharCode(10), ini);
    let expr = fonte.slice(ini + ('const esc =').length, fimLinha).trim();
    if (expr.endsWith(';')) expr = expr.slice(0, -1);
    const esc = eval('(' + expr + ')');
    const saida = esc('" onmouseover="alert(1)');
    assert.ok(!saida.includes('"'), 'aspa dupla tem de sair escapada, senão quebra o atributo href');
    assert.ok(!esc("x' onerror='y").includes("'"), 'a aspa simples também');
    assert.equal(esc('<b>&</b>'), '&lt;b&gt;&amp;&lt;/b&gt;', 'o escape de sempre continua valendo');
  });

  await t('landing /academy responde HTML', async () => {
    const r = await req('GET', '/academy');
    assert.equal(r.st, 200); assert.ok(r.texto.includes('Villela Academy'));
  });
  await t('painel /academy/app e app.js respondem', async () => {
    assert.equal((await req('GET', '/academy/app')).st, 200);
    const js = await req('GET', '/academy/app.js');
    assert.equal(js.st, 200); assert.ok(js.ct.includes('javascript'));
  });
  await t('termos e privacidade carimbados MINUTA', async () => {
    for (const p of ['/academy/termos', '/academy/privacidade']) {
      const r = await req('GET', p); assert.equal(r.st, 200); assert.ok(r.texto.includes('MINUTA'));
    }
  });

  console.log('\n— cadastro e login —');
  await t('signup exige aceite dos termos', async () => {
    const r = await req('POST', '/academy/api/signup', { corpo: { ...MARIA, aceite_termos: false } });
    assert.equal(r.st, 400);
  });
  await t('signup exige senha 8+', async () => {
    const r = await req('POST', '/academy/api/signup', { corpo: { ...MARIA, senha: 'curta' } });
    assert.equal(r.st, 400);
  });
  await t('signup cria conta de aluno e autentica', async () => {
    const r = await req('POST', '/academy/api/signup', { corpo: MARIA, jar: 'maria' });
    assert.equal(r.st, 200);
    const me = await req('GET', '/academy/api/me', { jar: 'maria' });
    assert.equal(me.st, 200);
    assert.deepEqual(me.json.papeis_ativos, ['aluno']);
    assert.ok(me.json.permissoes.includes('biblioteca.ver'));
    assert.ok(!('senha_hash' in me.json.usuario), 'não vaza hash');
  });
  await t('e-mail duplicado é rejeitado', async () => {
    assert.equal((await req('POST', '/academy/api/signup', { corpo: MARIA })).st, 400);
  });
  await t('login errado 401 e auditado; certo 200', async () => {
    assert.equal((await req('POST', '/academy/api/login', { corpo: { email: MARIA.email, senha: 'errada-12345' } })).st, 401);
    assert.equal((await req('POST', '/academy/api/login', { corpo: { email: MARIA.email, senha: MARIA.senha }, jar: 'maria' })).st, 200);
    const audit = academy.repo.Auditoria.listar(50);
    assert.ok(audit.some(a => a.acao === 'auth.login.falha'));
    assert.ok(audit.some(a => a.acao === 'auth.login'));
  });
  await t('rate limit: 5 falhas do mesmo IP → 429', async () => {
    for (let i = 0; i < 5; i++) await req('POST', '/academy/api/login', { corpo: { email: MARIA.email, senha: 'errada-' + i }, ip: '10.9.9.9' });
    const r = await req('POST', '/academy/api/login', { corpo: { email: MARIA.email, senha: MARIA.senha }, ip: '10.9.9.9' });
    assert.equal(r.st, 429);
  });

  console.log('\n— permissões por papel —');
  await t('aluno acessa o próprio dashboard', async () => {
    assert.equal((await req('GET', '/academy/api/aluno/dashboard', { jar: 'maria' })).st, 200);
  });
  await t('sem perfil aprovado, produtor/afiliado/admin são 403', async () => {
    for (const p of ['produtor', 'afiliado', 'admin']) {
      assert.equal((await req('GET', `/academy/api/${p}/dashboard`, { jar: 'maria' })).st, 403, p);
    }
  });
  await t('sem cookie é 401', async () => {
    assert.equal((await req('GET', '/academy/api/me')).st, 401);
  });

  console.log('\n— onboarding de produtor (com aprovação) —');
  let mariaId;
  await t('solicitar produtor → em_analise (e ainda 403)', async () => {
    const r = await req('POST', '/academy/api/tornar-se-produtor', { jar: 'maria', corpo: { nome_publico: 'Cursos da Maria', documento: '000', bio: 'Ensino gestão' } });
    assert.equal(r.st, 200); assert.equal(r.json.status, 'em_analise');
    assert.equal((await req('GET', '/academy/api/produtor/dashboard', { jar: 'maria' })).st, 403);
  });
  await t('staff vê pendência e aprova → papel liberado', async () => {
    const pend = await req('GET', '/staff/api/academy/pendentes');
    assert.equal(pend.st, 200); assert.equal(pend.json.produtores.length, 1);
    mariaId = pend.json.produtores[0].user_id;
    const ap = await req('POST', `/staff/api/academy/perfis/produtor/${mariaId}/decidir`, { corpo: { status: 'aprovado' } });
    assert.equal(ap.st, 200);
    const dash = await req('GET', '/academy/api/produtor/dashboard', { jar: 'maria' });
    assert.equal(dash.st, 200); assert.equal(dash.json.perfil.slug, 'cursos-da-maria');
  });
  await t('staff não-admin não administra a Academy', async () => {
    assert.equal((await req('GET', '/staff/api/academy/dashboard', { user: 'op' })).st, 403);
  });

  console.log('\n— onboarding de afiliado + admin da Academy —');
  await t('joão vira afiliado (staff aprova)', async () => {
    await req('POST', '/academy/api/signup', { corpo: JOAO, jar: 'joao' });
    const r = await req('POST', '/academy/api/tornar-se-afiliado', { jar: 'joao', corpo: { nome_publico: 'João Divulga', canais: 'Instagram' } });
    assert.equal(r.st, 200);
    const joaoId = academy.repo.Usuarios.porEmail(JOAO.email).id;
    assert.equal((await req('POST', `/staff/api/academy/perfis/afiliado/${joaoId}/decidir`, { corpo: { status: 'aprovado' } })).st, 200);
    assert.equal((await req('GET', '/academy/api/afiliado/dashboard', { jar: 'joao' })).st, 200);
  });
  await t('staff concede papel admin → dashboard admin com KPIs e auditoria', async () => {
    assert.equal((await req('POST', `/staff/api/academy/usuarios/${mariaId}/papeis`, { corpo: { conceder: 'admin' } })).st, 200);
    const d = await req('GET', '/academy/api/admin/dashboard', { jar: 'maria' });
    assert.equal(d.st, 200);
    assert.equal(d.json.dashboard.usuarios, 2);
    assert.equal(d.json.dashboard.produtores_aprovados, 1);
    assert.equal(d.json.dashboard.afiliados_aprovados, 1);
    const a = await req('GET', '/academy/api/admin/auditoria', { jar: 'maria' });
    assert.equal(a.st, 200); assert.ok(a.json.eventos.length >= 5);
  });
  await t('admin da Academy lista usuários (sem hash de senha)', async () => {
    const r = await req('GET', '/academy/api/admin/usuarios', { jar: 'maria' });
    assert.equal(r.st, 200); assert.equal(r.json.usuarios.length, 2);
    assert.ok(r.json.usuarios.every(u => !('senha_hash' in u)));
  });

  console.log('\n— sessões e conta —');
  await t('logout revoga a sessão (cookie antigo morre)', async () => {
    const cookieAntigo = { ...jars.joao };
    assert.equal((await req('POST', '/academy/api/logout', { jar: 'joao' })).st, 200);
    jars.joao = cookieAntigo; // simula reuso do token roubado
    assert.equal((await req('GET', '/academy/api/me', { jar: 'joao' })).st, 401);
  });
  await t('trocar senha derruba todas as sessões e exige a nova', async () => {
    await req('POST', '/academy/api/login', { corpo: { email: JOAO.email, senha: JOAO.senha }, jar: 'joao' });
    const r = await req('POST', '/academy/api/me/senha', { jar: 'joao', corpo: { senha_atual: JOAO.senha, senha_nova: 'nova-senha-123' } });
    assert.equal(r.st, 200);
    assert.equal((await req('POST', '/academy/api/login', { corpo: { email: JOAO.email, senha: JOAO.senha } })).st, 401);
    assert.equal((await req('POST', '/academy/api/login', { corpo: { email: JOAO.email, senha: 'nova-senha-123' }, jar: 'joao' })).st, 200);
  });

  console.log('\n— LGPD —');
  await t('titular exporta os próprios dados', async () => {
    const r = await req('GET', '/academy/api/me/exportar', { jar: 'joao' });
    assert.equal(r.st, 200);
    assert.equal(r.json.usuario.email, JOAO.email);
    assert.ok(Array.isArray(r.json.auditoria));
    assert.ok(r.json.perfil_afiliado);
  });
  await t('exclusão anonimiza e mata o acesso', async () => {
    const r = await req('POST', '/academy/api/me/excluir', { jar: 'joao', corpo: { senha: 'nova-senha-123' } });
    assert.equal(r.st, 200);
    assert.equal((await req('POST', '/academy/api/login', { corpo: { email: JOAO.email, senha: 'nova-senha-123' } })).st, 401);
    const u = academy.repo.Usuarios.listar({ status: 'excluido' })[0];
    assert.ok(u && u.nome === 'Usuário excluído' && u.email.includes('anonimizado'));
  });

  console.log('\n— leads e config —');
  await t('lead da landing chega ao staff e alerta o dono', async () => {
    assert.equal((await req('POST', '/academy/api/lead', { corpo: { nome: 'Lead X', email: 'x@x', interesse: 'produtor' } })).st, 200);
    const r = await req('GET', '/staff/api/academy/leads');
    assert.equal(r.st, 200); assert.equal(r.json.leads.length, 1);
    assert.ok(alertas.some(a => a.includes('novo lead')));
  });
  await t('config comercial oficial (8,9%+R$1 / 10%) semeada e editável pelo staff', async () => {
    const r = await req('GET', '/staff/api/academy/config');
    assert.equal(r.json.comissoes.plataforma_pct, 8.9);      // decisão do Augusto 09/07/2026
    assert.equal(r.json.comissoes.fixo_centavos, 100);       // + R$1,00 fixo por venda
    assert.equal(r.json.comissoes.afiliado_padrao_pct, 10);  // decisão do Augusto 08/07/2026
    assert.equal((await req('POST', '/staff/api/academy/config', { corpo: { chave: 'comissoes', valor: { plataforma_pct: 12, fixo_centavos: 100, afiliado_padrao_pct: 10, cookie_dias: 30 } } })).st, 200);
    assert.equal((await req('GET', '/staff/api/academy/config')).json.comissoes.plataforma_pct, 12);
    // restaura o valor oficial p/ os testes de checkout
    await req('POST', '/staff/api/academy/config', { corpo: { chave: 'comissoes', valor: { plataforma_pct: 8.9, fixo_centavos: 100, afiliado_padrao_pct: 10, cookie_dias: 30 } } });
  });

  // ================= FASE 2 — produtos, conteúdo, matrículas, progresso =================
  console.log('\n— FASE 2: produtos e fluxo editorial —');
  const ANA = { nome: 'Ana Aluna', email: 'ana@t.com', senha: 'senha-forte-3', aceite_termos: true };
  const BRUNO = { nome: 'Bruno Visitante', email: 'bruno@t.com', senha: 'senha-forte-4', aceite_termos: true };
  await req('POST', '/academy/api/signup', { corpo: ANA, jar: 'ana' });
  await req('POST', '/academy/api/signup', { corpo: BRUNO, jar: 'bruno' });

  let prodId, aulaTextoId, aulaPdfId, mediaId;
  await t('produtor cria produto rascunho com slug', async () => {
    const r = await req('POST', '/academy/api/produtor/produtos', { jar: 'maria', corpo: { titulo: 'Gestão de Temporada na Prática', tipo: 'curso' } });
    assert.equal(r.st, 200); prodId = r.json.produto.id;
    assert.equal(r.json.produto.status, 'rascunho');
    assert.equal(r.json.produto.slug, 'gestao-de-temporada-na-pratica');
  });
  await t('aluno comum não cria produto (403)', async () => {
    assert.equal((await req('POST', '/academy/api/produtor/produtos', { jar: 'ana', corpo: { titulo: 'X' } })).st, 403);
  });
  await t('editar produto (preço/descrição)', async () => {
    const r = await req('PATCH', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria', corpo: { preco_centavos: 19900, descricao_curta: 'Aprenda a operar temporada' } });
    assert.equal(r.st, 200); assert.equal(r.json.produto.preco_centavos, 19900);
  });
  await t('enviar p/ revisão sem aulas é bloqueado', async () => {
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${prodId}/status`, { jar: 'maria', corpo: { status: 'em_revisao' } })).st, 400);
  });

  console.log('\n— FASE 2: builder e upload —');
  let modId;
  await t('builder: módulo + aula texto (degustação) + aula pdf com upload', async () => {
    const m = await req('POST', `/academy/api/produtor/produtos/${prodId}/modulos`, { jar: 'maria', corpo: { titulo: 'Fundamentos' } });
    assert.equal(m.st, 200); modId = m.json.id;
    const a1 = await req('POST', `/academy/api/produtor/produtos/${prodId}/modulos/${modId}/aulas`, { jar: 'maria', corpo: { titulo: 'Boas-vindas', tipo: 'texto', conteudo: 'Bem-vindo ao curso!', gratuita: true } });
    assert.equal(a1.st, 200); aulaTextoId = a1.json.id;
    const up = await req('POST', '/academy/api/produtor/upload', { jar: 'maria', corpo: { nome: 'apostila.pdf', mime: 'application/pdf', conteudo_base64: Buffer.from('%PDF-1.4 conteudo de teste').toString('base64') } });
    assert.equal(up.st, 200); mediaId = up.json.id;
    const a2 = await req('POST', `/academy/api/produtor/produtos/${prodId}/modulos/${modId}/aulas`, { jar: 'maria', corpo: { titulo: 'Apostila', tipo: 'pdf', media_id: mediaId } });
    assert.equal(a2.st, 200); aulaPdfId = a2.json.id;
    const est = await req('GET', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria' });
    assert.equal(est.json.estrutura.length, 1); assert.equal(est.json.estrutura[0].aulas.length, 2);
  });
  await t('upload de mime proibido é rejeitado', async () => {
    const r = await req('POST', '/academy/api/produtor/upload', { jar: 'maria', corpo: { nome: 'virus.exe', mime: 'application/x-msdownload', conteudo_base64: Buffer.from('x').toString('base64') } });
    assert.equal(r.st, 400);
  });

  console.log('\n— FASE 2: moderação e publicação —');
  await t('fluxo editorial: em_revisao → produtor NÃO aprova → admin aprova → produtor publica', async () => {
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${prodId}/status`, { jar: 'maria', corpo: { status: 'em_revisao' } })).st, 200);
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${prodId}/status`, { jar: 'maria', corpo: { status: 'aprovado' } })).st, 400); // transição de admin
    const fila = await req('GET', '/academy/api/admin/produtos?status=em_revisao', { jar: 'maria' });
    assert.equal(fila.json.produtos.length, 1);
    assert.equal((await req('POST', `/academy/api/admin/produtos/${prodId}/decidir`, { jar: 'maria', corpo: { status: 'aprovado' } })).st, 200);
    const pub = await req('POST', `/academy/api/produtor/produtos/${prodId}/status`, { jar: 'maria', corpo: { status: 'publicado' } });
    assert.equal(pub.st, 200); assert.equal(pub.json.produto.status, 'publicado');
  });
  await t('staff também vê e modera produtos', async () => {
    const r = await req('GET', '/staff/api/academy/produtos');
    assert.equal(r.st, 200); assert.ok(r.json.produtos.length >= 1);
  });
  await t('isolamento entre produtores (anti-IDOR)', async () => {
    await req('POST', '/academy/api/tornar-se-afiliado', { jar: 'bruno', corpo: { nome_publico: 'x' } }); // ruído
    await req('POST', '/academy/api/tornar-se-produtor', { jar: 'ana', corpo: { nome_publico: 'Ana Cursos' } });
    const anaId = academy.repo.Usuarios.porEmail(ANA.email).id;
    await req('POST', `/staff/api/academy/perfis/produtor/${anaId}/decidir`, { corpo: { status: 'aprovado' } });
    assert.equal((await req('GET', `/academy/api/produtor/produtos/${prodId}`, { jar: 'ana' })).st, 400);
    assert.equal((await req('PATCH', `/academy/api/produtor/produtos/${prodId}`, { jar: 'ana', corpo: { titulo: 'hackeado' } })).st, 400);
  });

  console.log('\n— FASE 2: matrícula, área do aluno e mídia protegida —');
  await t('matrícula cortesia pelo produtor + biblioteca do aluno', async () => {
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${prodId}/matricular`, { jar: 'maria', corpo: { email: ANA.email } })).st, 200);
    const b = await req('GET', '/academy/api/aluno/biblioteca', { jar: 'ana' });
    assert.equal(b.st, 200); assert.equal(b.json.cursos.length, 1);
    assert.equal(b.json.cursos[0].progresso.total_aulas, 2);
  });
  await t('matriculado vê estrutura completa; não matriculado só degustação', async () => {
    const ca = await req('GET', `/academy/api/aluno/cursos/${prodId}`, { jar: 'ana' });
    assert.ok(ca.json.matriculado);
    assert.ok(ca.json.estrutura[0].aulas.every(a => a.liberada));
    const cb = await req('GET', `/academy/api/aluno/cursos/${prodId}`, { jar: 'bruno' });
    assert.ok(!cb.json.matriculado);
    const aulas = cb.json.estrutura[0].aulas;
    assert.ok(aulas.find(a => a.id === aulaTextoId).liberada, 'gratuita liberada');
    const bloqueada = aulas.find(a => a.id === aulaPdfId);
    assert.ok(!bloqueada.liberada && !bloqueada.media_id && !bloqueada.conteudo, 'bloqueada não vaza conteúdo');
  });
  await t('mídia: matriculado 200 (pdf) e acesso logado; não matriculado 404', async () => {
    const ra = await req('GET', `/academy/api/media/${mediaId}`, { jar: 'ana' });
    assert.equal(ra.st, 200); assert.ok(ra.ct.includes('pdf'));
    assert.equal((await req('GET', `/academy/api/media/${mediaId}`, { jar: 'bruno' })).st, 404);
    assert.equal((await req('GET', `/academy/api/media/${mediaId}`)).st, 401); // sem login
    const logs = require('./db').db.prepare('SELECT COUNT(*) n FROM download_logs').get().n;
    assert.ok(logs >= 1, 'download logado');
  });
  await t('progresso: marcar concluída → 50% e continuar-de-onde-parou', async () => {
    const r = await req('POST', `/academy/api/aluno/aulas/${aulaTextoId}/progresso`, { jar: 'ana', corpo: { concluida: true } });
    assert.equal(r.st, 200); assert.equal(r.json.progresso.pct, 50);
    const b = await req('GET', '/academy/api/aluno/biblioteca', { jar: 'ana' });
    assert.equal(b.json.continuar.lesson_id, aulaTextoId);
  });
  await t('não matriculado não marca progresso de aula paga', async () => {
    assert.equal((await req('POST', `/academy/api/aluno/aulas/${aulaPdfId}/progresso`, { jar: 'bruno', corpo: { concluida: true } })).st, 400);
  });
  await t('revogar matrícula corta o acesso à mídia', async () => {
    const alunos = await req('GET', `/academy/api/produtor/produtos/${prodId}/alunos`, { jar: 'maria' });
    const eid = alunos.json.alunos.find(a => a.email === ANA.email).id;
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${prodId}/matriculas/${eid}/revogar`, { jar: 'maria' })).st, 200);
    assert.equal((await req('GET', `/academy/api/media/${mediaId}`, { jar: 'ana' })).st, 404);
    assert.equal((await req('GET', '/academy/api/aluno/biblioteca', { jar: 'ana' })).json.cursos.length, 0);
  });

  // ================= FASE 3 — marketplace, página de venda, avaliações, denúncias =================
  console.log('\n— FASE 3: vitrine pública —');
  await t('marketplace lista SÓ publicados e busca funciona', async () => {
    const r = await req('GET', '/academy/marketplace');
    assert.equal(r.st, 200); assert.ok(r.texto.includes('Gestão de Temporada'));
    await req('POST', '/academy/api/produtor/produtos', { jar: 'ana', corpo: { titulo: 'Rascunho Secreto da Ana' } });
    const r2 = await req('GET', '/academy/marketplace');
    assert.ok(!r2.texto.includes('Rascunho Secreto'), 'rascunho não vaza na vitrine');
    assert.ok((await req('GET', '/academy/marketplace?q=temporada')).texto.includes('Gestão de Temporada'));
    assert.ok(!(await req('GET', '/academy/marketplace?q=inexistente-xyz')).texto.includes('Gestão de Temporada'));
  });
  await t('página do curso publicado com SEO/OG e degustação; rascunho é 404', async () => {
    const r = await req('GET', '/academy/cursos/gestao-de-temporada-na-pratica');
    assert.equal(r.st, 200);
    assert.ok(r.texto.includes('og:title')); assert.ok(r.texto.includes('degustação'));
    assert.equal((await req('GET', '/academy/cursos/rascunho-secreto-da-ana')).st, 404);
  });
  await t('página do produtor por slug', async () => {
    const r = await req('GET', '/academy/produtores/cursos-da-maria');
    assert.equal(r.st, 200); assert.ok(r.texto.includes('Gestão de Temporada'));
  });
  await t('políticas novas carimbadas MINUTA', async () => {
    for (const p of ['/academy/termos-produtor', '/academy/termos-afiliado', '/academy/reembolso']) {
      const r = await req('GET', p); assert.equal(r.st, 200); assert.ok(r.texto.includes('MINUTA'), p);
    }
  });

  console.log('\n— FASE 3: página de venda e capa —');
  await t('produtor edita página de venda; conteúdo aparece escapado na página pública', async () => {
    const put = await req('PUT', `/academy/api/produtor/produtos/${prodId}/pagina`, { jar: 'maria', corpo: {
      headline: 'Do zero ao <b>lucro</b> na temporada', promessa: 'Sua operação rodando em 30 dias',
      beneficios: ['Calendário sem overbooking', 'Precificação certa'], faq: [{ p: 'Tem certificado?', r: 'Sim, ao concluir.' }],
    } });
    assert.equal(put.st, 200);
    const pg = await req('GET', '/academy/cursos/gestao-de-temporada-na-pratica');
    assert.ok(pg.texto.includes('Do zero ao &lt;b&gt;lucro&lt;/b&gt;'), 'headline escapada (sem HTML cru)');
    assert.ok(pg.texto.includes('Calendário sem overbooking'));
    assert.ok(pg.texto.includes('Tem certificado?'));
  });
  await t('outro produtor não edita a página de venda alheia', async () => {
    assert.equal((await req('PUT', `/academy/api/produtor/produtos/${prodId}/pagina`, { jar: 'ana', corpo: { headline: 'hack' } })).st, 400);
  });
  await t('capa pública só de produto publicado', async () => {
    assert.equal((await req('GET', `/academy/capa/${prodId}`)).st, 404); // sem capa ainda
    const up = await req('POST', '/academy/api/produtor/upload', { jar: 'maria', corpo: { nome: 'capa.png', mime: 'image/png', conteudo_base64: Buffer.from('PNGfake').toString('base64') } });
    assert.equal((await req('PATCH', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria', corpo: { capa_media_id: up.json.id } })).st, 200);
    const r = await req('GET', `/academy/capa/${prodId}`);
    assert.equal(r.st, 200); assert.ok(r.ct.includes('image/png'));
    // a capa também APARECE na página do curso quando não há vídeo de vendas — antes
    // ela só era og:image e o comprador nunca via a capa na página do produto
    const pg = await req('GET', '/academy/cursos/gestao-de-temporada-na-pratica');
    // <img> de verdade (não background-image): a capa precisa ser visível e ter alt.
    // Checa a URL e, logo antes dela, a abertura da tag — sem depender da ordem dos atributos.
    const alvoCapa = `src="/academy/capa/${prodId}?v=${up.json.id}"`;
    const iCapa = pg.texto.indexOf(alvoCapa);
    assert.ok(iCapa > 0, 'capa visível na página de venda sem vídeo');
    assert.ok(pg.texto.lastIndexOf('<img', iCapa) > iCapa - 160, 'a capa sai como <img>, não como background-image');
    // com vídeo, quem manda é o vídeo (a capa não duplica o espaço 16:9).
    // PUT da página de venda SUBSTITUI as seções: guardo e devolvo o conteúdo,
    // senão o fixture segue sem headline/benefícios para os testes seguintes.
    const secoes = require('./repo-conteudo').SalesPages.obter(prodId);
    await req('PUT', `/academy/api/produtor/produtos/${prodId}/pagina`, { jar: 'maria', corpo: { ...secoes, video_url: 'https://youtu.be/abc123xyz' } });
    const comVideo = await req('GET', '/academy/cursos/gestao-de-temporada-na-pratica');
    assert.ok(comVideo.texto.includes('youtube.com/embed/abc123xyz'), 'vídeo embutido');
    assert.ok(!comVideo.texto.includes(`<img src="/academy/capa/${prodId}`), 'sem capa duplicando o espaço do vídeo');
    await req('PUT', `/academy/api/produtor/produtos/${prodId}/pagina`, { jar: 'maria', corpo: secoes });
    const restaurada = await req('GET', '/academy/cursos/gestao-de-temporada-na-pratica');
    assert.ok(restaurada.texto.includes('Calendário sem overbooking'), 'página de venda devolvida ao estado anterior');
  });
  await t('interesse de compra vira lead e alerta', async () => {
    const antes = alertas.length;
    const r = await req('POST', `/academy/api/cursos/${prodId}/interesse`, { corpo: { nome: 'Comprador X', email: 'x@y.com' } });
    assert.equal(r.st, 200);
    assert.ok(alertas.length > antes && alertas[alertas.length - 1].includes('interesse de compra'));
  });

  console.log('\n— FASE 3: avaliações e denúncias —');
  await t('só matriculado avalia; avaliação aparece na página; admin oculta', async () => {
    assert.equal((await req('POST', `/academy/api/aluno/cursos/${prodId}/avaliar`, { jar: 'bruno', corpo: { nota: 5, texto: 'top' } })).st, 400);
    await req('POST', `/academy/api/produtor/produtos/${prodId}/matricular`, { jar: 'maria', corpo: { email: ANA.email } }); // reativa a matrícula revogada
    assert.equal((await req('POST', `/academy/api/aluno/cursos/${prodId}/avaliar`, { jar: 'ana', corpo: { nota: 5, texto: 'Curso excelente, mudou minha operação' } })).st, 200);
    const pg = await req('GET', '/academy/cursos/gestao-de-temporada-na-pratica');
    assert.ok(pg.texto.includes('Curso excelente'));
    assert.ok(pg.texto.includes('★ 5'));
    const lista = await req('GET', '/academy/api/admin/avaliacoes', { jar: 'maria' });
    const rid = lista.json.avaliacoes[0].id;
    assert.equal((await req('POST', `/academy/api/admin/avaliacoes/${rid}/moderar`, { jar: 'maria', corpo: { status: 'oculta' } })).st, 200);
    assert.ok(!(await req('GET', '/academy/cursos/gestao-de-temporada-na-pratica')).texto.includes('Curso excelente'), 'oculta some da página');
  });
  await t('denúncia: usuário abre, admin resolve (e staff enxerga)', async () => {
    const r = await req('POST', '/academy/api/denunciar', { jar: 'bruno', corpo: { product_id: prodId, motivo: 'enganoso', texto: 'promete demais' } });
    assert.equal(r.st, 200);
    const staffVe = await req('GET', '/staff/api/academy/denuncias');
    assert.equal(staffVe.json.denuncias.length, 1);
    const lista = await req('GET', '/academy/api/admin/denuncias', { jar: 'maria' });
    assert.equal(lista.json.denuncias.length, 1);
    assert.equal((await req('POST', `/academy/api/admin/denuncias/${r.json.id}/resolver`, { jar: 'maria', corpo: { status: 'descartada', resolucao: 'sem irregularidade' } })).st, 200);
    assert.equal((await req('GET', '/academy/api/admin/denuncias', { jar: 'maria' })).json.denuncias.length, 0);
  });

  // ================= FASE 4 — checkout Mercado Pago =================
  console.log('\n— FASE 4: checkout e pagamentos —');
  await t('páginas de checkout e obrigado respondem; CTA da vitrine vira Comprar agora', async () => {
    const cx = await req('GET', '/academy/checkout/gestao-de-temporada-na-pratica');
    assert.equal(cx.st, 200); assert.ok(cx.texto.includes('Finalizar compra'));
    assert.equal((await req('GET', '/academy/checkout/nao-existe')).st, 404);
    assert.equal((await req('GET', '/academy/obrigado?pedido=x')).st, 200);
    assert.ok((await req('GET', '/academy/cursos/gestao-de-temporada-na-pratica')).texto.includes('Comprar agora'));
  });
  await t('checkout exige login', async () => {
    assert.equal((await req('POST', `/academy/api/checkout/${prodId}`)).st, 401);
  });

  let pedidoBruno;
  await t('produto pago: pedido pendente + preferência MP; retorno do navegador NÃO libera', async () => {
    const r = await req('POST', `/academy/api/checkout/${prodId}`, { jar: 'bruno' });
    assert.equal(r.st, 200); pedidoBruno = r.json.order_id;
    assert.equal(r.json.init_point, 'https://mp.test/checkout/PREF-1');
    assert.ok(mpChamadas.some(x => x.includes('/checkout/preferences')));
    const st = await req('GET', `/academy/api/pedidos/${pedidoBruno}/status`, { jar: 'bruno' });
    assert.equal(st.json.status, 'pendente');
    // "voltou do MP" mas sem webhook: nada de matrícula
    assert.equal((await req('GET', '/academy/api/aluno/biblioteca', { jar: 'bruno' })).json.cursos.length, 0);
  });
  await t('status de pedido é só do dono (anti-IDOR)', async () => {
    assert.equal((await req('GET', `/academy/api/pedidos/${pedidoBruno}/status`, { jar: 'ana' })).st, 404);
  });
  await t('webhook approved libera matrícula e calcula comissão 8,9% + R$1', async () => {
    const antes = alertas.length;
    assert.equal((await req('POST', '/academy/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: '901' } } })).st, 200);
    await espera(200);
    const o = academy.billing.Pedidos.obter(pedidoBruno);
    assert.equal(o.status, 'paga');
    assert.equal(o.valor_centavos, 19900);
    assert.equal(o.comissao_plataforma_centavos, 1871);   // 8,9% de 199,00 (17,71) + R$1,00
    assert.equal(o.liquido_produtor_centavos, 18029);
    assert.equal((await req('GET', '/academy/api/aluno/biblioteca', { jar: 'bruno' })).json.cursos.length, 1);
    assert.ok(alertas.length > antes && alertas[alertas.length - 1].includes('venda paga'));
  });
  await t('webhook duplicado é idempotente', async () => {
    await req('POST', '/academy/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: '901' } } });
    await espera(200);
    const n = require('./db').db.prepare("SELECT COUNT(*) n FROM enrollments WHERE product_id = ? AND status = 'ativa'").get(prodId).n;
    assert.equal(n, 2); // ana + bruno, sem duplicar
    assert.equal(academy.billing.Pedidos.obter(pedidoBruno).status, 'paga');
  });
  await t('KPIs da plataforma refletem a venda (GMV/receita)', async () => {
    const d = await req('GET', '/academy/api/admin/dashboard', { jar: 'maria' });
    assert.equal(d.json.dashboard.gmv_centavos, 19900);
    assert.equal(d.json.dashboard.receita_plataforma_centavos, 1871);
    const v = await req('GET', '/academy/api/produtor/vendas', { jar: 'maria' });
    assert.equal(v.json.vendas.filter(x => x.status === 'paga').length, 1);
  });

  await t('consulta segura ("já paguei") confirma pedido pendente', async () => {
    const CARLA = { nome: 'Carla', email: 'carla@t.com', senha: 'senha-forte-5', aceite_termos: true };
    await req('POST', '/academy/api/signup', { corpo: CARLA, jar: 'carla' });
    const r = await req('POST', `/academy/api/checkout/${prodId}`, { jar: 'carla' });
    assert.equal((await req('GET', `/academy/api/pedidos/${r.json.order_id}/status`, { jar: 'carla' })).json.status, 'pendente');
    const c = await req('POST', `/academy/api/pedidos/${r.json.order_id}/conferir`, { jar: 'carla' });
    assert.equal(c.json.status, 'paga');
    assert.equal((await req('GET', '/academy/api/aluno/biblioteca', { jar: 'carla' })).json.cursos.length, 1);
  });
  await t('webhook rejected marca recusada e não matricula', async () => {
    const DANI = { nome: 'Dani', email: 'dani@t.com', senha: 'senha-forte-6', aceite_termos: true };
    await req('POST', '/academy/api/signup', { corpo: DANI, jar: 'dani' });
    const r = await req('POST', `/academy/api/checkout/${prodId}`, { jar: 'dani' });
    await req('POST', '/academy/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: '902' } } });
    await espera(200);
    assert.equal((await req('GET', `/academy/api/pedidos/${r.json.order_id}/status`, { jar: 'dani' })).json.status, 'recusada');
    assert.equal((await req('GET', '/academy/api/aluno/biblioteca', { jar: 'dani' })).json.cursos.length, 0);
  });

  await t('produto grátis matricula direto (sem MP)', async () => {
    const np = await req('POST', '/academy/api/produtor/produtos', { jar: 'maria', corpo: { titulo: 'Aula Aberta de Boas-Vindas', tipo: 'curso', preco_centavos: 0 } });
    const gid = np.json.produto.id;
    const m = await req('POST', `/academy/api/produtor/produtos/${gid}/modulos`, { jar: 'maria', corpo: { titulo: 'Único' } });
    await req('POST', `/academy/api/produtor/produtos/${gid}/modulos/${m.json.id}/aulas`, { jar: 'maria', corpo: { titulo: 'Aula 1', tipo: 'texto', conteudo: 'oi' } });
    await req('POST', `/academy/api/produtor/produtos/${gid}/status`, { jar: 'maria', corpo: { status: 'em_revisao' } });
    await req('POST', `/academy/api/admin/produtos/${gid}/decidir`, { jar: 'maria', corpo: { status: 'aprovado' } });
    await req('POST', `/academy/api/produtor/produtos/${gid}/status`, { jar: 'maria', corpo: { status: 'publicado' } });
    const r = await req('POST', `/academy/api/checkout/${gid}`, { jar: 'dani' });
    assert.equal(r.st, 200); assert.ok(r.json.gratis);
    assert.equal((await req('GET', '/academy/api/aluno/biblioteca', { jar: 'dani' })).json.cursos.length, 1);
  });

  await t('reembolso: chama o MP, revoga a matrícula e registra', async () => {
    const antesMp = mpChamadas.filter(p => p.includes('/refunds')).length;
    const r = await req('POST', `/academy/api/admin/pedidos/${pedidoBruno}/reembolsar`, { jar: 'maria', corpo: { motivo: 'teste de reembolso' } });
    assert.equal(r.st, 200);
    assert.equal(mpChamadas.filter(p => p.includes('/refunds')).length, antesMp + 1);
    assert.equal(academy.billing.Pedidos.obter(pedidoBruno).status, 'reembolsada');
    assert.equal((await req('GET', '/academy/api/aluno/biblioteca', { jar: 'bruno' })).json.cursos.length, 0);
    const refs = require('./db').db.prepare('SELECT COUNT(*) n FROM refunds').get().n;
    assert.ok(refs >= 1);
  });
  await t('staff enxerga pedidos e KPIs', async () => {
    const r = await req('GET', '/staff/api/academy/pedidos');
    assert.equal(r.st, 200);
    assert.ok(r.json.pedidos.length >= 3);
    assert.equal(r.json.kpis.reembolsos, 1);
  });
  await t('trilha financeira: webhooks e payment_events gravados', async () => {
    const dbx = require('./db').db;
    assert.ok(dbx.prepare('SELECT COUNT(*) n FROM webhook_events').get().n >= 3);
    assert.ok(dbx.prepare('SELECT COUNT(*) n FROM payment_events').get().n >= 3);
  });

  // ================= FASE 5 — afiliados e comissões =================
  console.log('\n— FASE 5: links de afiliado —');
  const dbx = require('./db').db;
  let brunoId, linkCode;
  await t('staff aprova afiliado; afiliado vê produtos com % efetivo (10)', async () => {
    brunoId = academy.repo.Usuarios.porEmail(BRUNO.email).id;
    assert.equal((await req('POST', `/staff/api/academy/perfis/afiliado/${brunoId}/decidir`, { corpo: { status: 'aprovado' } })).st, 200);
    const r = await req('GET', '/academy/api/afiliado/produtos', { jar: 'bruno' });
    assert.equal(r.st, 200);
    const p = r.json.produtos.find(x => x.id === prodId);
    assert.ok(p); assert.equal(p.pct_efetivo, 10);
    assert.equal(r.json.cookie_dias, 30);
  });
  await t('gera link rastreável (idempotente); sem papel afiliado é 403', async () => {
    const r1 = await req('POST', '/academy/api/afiliado/links', { jar: 'bruno', corpo: { product_id: prodId } });
    assert.equal(r1.st, 200); linkCode = r1.json.link.id;
    const r2 = await req('POST', '/academy/api/afiliado/links', { jar: 'bruno', corpo: { product_id: prodId } });
    assert.equal(r2.json.link.id, linkCode);
    assert.equal((await req('POST', '/academy/api/afiliado/links', { jar: 'carla', corpo: { product_id: prodId } })).st, 403);
  });
  await t('clique ?ref= arma cookie e conta; código inválido não arma', async () => {
    const FABI = { nome: 'Fabi', email: 'fabi@t.com', senha: 'senha-forte-7', aceite_termos: true };
    await req('POST', '/academy/api/signup', { corpo: FABI, jar: 'fabi' });
    const r = await req('GET', `/academy/cursos/gestao-de-temporada-na-pratica?ref=${linkCode}`, { jar: 'fabi' });
    assert.equal(r.st, 200);
    assert.equal(jars.fabi.academy_ref, linkCode, 'cookie de atribuição armado');
    assert.equal(dbx.prepare('SELECT COUNT(*) n FROM affiliate_clicks WHERE link_id = ?').get(linkCode).n, 1);
    const jarLimpo = {}; jars.x = jarLimpo;
    await req('GET', '/academy/cursos/gestao-de-temporada-na-pratica?ref=nao-existe', { jar: 'x' });
    assert.ok(!jars.x.academy_ref, 'ref inválido não arma cookie');
  });

  console.log('\n— FASE 5: atribuição e comissões —');
  let pedidoFabi;
  await t('compra atribuída: comissão do afiliado 10% e líquido do produtor correto', async () => {
    const r = await req('POST', `/academy/api/checkout/${prodId}`, { jar: 'fabi' });
    pedidoFabi = r.json.order_id;
    await req('POST', '/academy/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: '903' } } });
    await espera(200);
    const o = academy.billing.Pedidos.obter(pedidoFabi);
    assert.equal(o.status, 'paga');
    assert.equal(o.affiliate_user_id, brunoId);
    assert.equal(o.comissao_afiliado_centavos, 1990);          // 10% do afiliado
    assert.equal(o.comissao_plataforma_centavos, 1871);        // 8,9% + R$1 da plataforma
    assert.equal(o.liquido_produtor_centavos, 19900 - 1990 - 1871);
    const cm = dbx.prepare('SELECT * FROM commissions WHERE order_id = ?').get(pedidoFabi);
    assert.ok(cm); assert.equal(cm.status, 'pendente'); assert.equal(cm.valor_centavos, 1990);
  });
  await t('extrato e dashboard do afiliado com números reais', async () => {
    const e = await req('GET', '/academy/api/afiliado/extrato', { jar: 'bruno' });
    assert.equal(e.json.saldos.pendente_centavos, 1990);
    const d = await req('GET', '/academy/api/afiliado/dashboard', { jar: 'bruno' });
    assert.equal(d.json.dashboard.cliques, 1);
    assert.equal(d.json.dashboard.conversoes, 1);
    const l = await req('GET', '/academy/api/afiliado/links', { jar: 'bruno' });
    assert.equal(l.json.links[0].conversoes, 1);
  });
  await t('comissão libera após a garantia; admin marca paga (repasse manual)', async () => {
    dbx.prepare("UPDATE commissions SET disponivel_em = '2020-01-01' WHERE order_id = ?").run(pedidoFabi);
    const e = await req('GET', '/academy/api/afiliado/extrato', { jar: 'bruno' });
    assert.equal(e.json.comissoes[0].status, 'disponivel');
    const cid = e.json.comissoes[0].id;
    // pagar antes de disponível já foi bloqueado acima; agora paga de verdade
    assert.equal((await req('POST', `/academy/api/admin/comissoes/${cid}/pagar`, { jar: 'maria' })).st, 200);
    assert.equal((await req('GET', '/academy/api/afiliado/extrato', { jar: 'bruno' })).json.saldos.paga_centavos, 1990);
  });
  await t('auto-compra com o próprio link não gera comissão', async () => {
    await req('GET', `/academy/cursos/gestao-de-temporada-na-pratica?ref=${linkCode}`, { jar: 'bruno' });
    const r = await req('POST', `/academy/api/checkout/${prodId}`, { jar: 'bruno' });
    const o = academy.billing.Pedidos.obter(r.json.order_id);
    assert.equal(o.affiliate_user_id, '');
    assert.equal(o.comissao_afiliado_centavos, 0);
  });
  await t('% por produto sobrepõe o padrão (20%); reembolso cancela a comissão', async () => {
    assert.equal((await req('PATCH', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria', corpo: { afiliado_pct: 20 } })).st, 200);
    const GABI = { nome: 'Gabi', email: 'gabi@t.com', senha: 'senha-forte-8', aceite_termos: true };
    await req('POST', '/academy/api/signup', { corpo: GABI, jar: 'gabi' });
    await req('GET', `/academy/cursos/gestao-de-temporada-na-pratica?ref=${linkCode}`, { jar: 'gabi' });
    const r = await req('POST', `/academy/api/checkout/${prodId}`, { jar: 'gabi' });
    await req('POST', '/academy/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: '904' } } });
    await espera(200);
    const o = academy.billing.Pedidos.obter(r.json.order_id);
    assert.equal(o.afiliado_pct, 20);
    assert.equal(o.comissao_afiliado_centavos, 3980);
    assert.equal((await req('POST', `/academy/api/admin/pedidos/${o.id}/reembolsar`, { jar: 'maria', corpo: { motivo: 'teste F5' } })).st, 200);
    assert.equal(dbx.prepare('SELECT status FROM commissions WHERE order_id = ?').get(o.id).status, 'cancelada');
  });
  await t('afiliado_pct 0 desliga a afiliação do produto (e restaura)', async () => {
    await req('PATCH', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria', corpo: { afiliado_pct: 0 } });
    const r = await req('GET', '/academy/api/afiliado/produtos', { jar: 'bruno' });
    assert.ok(!r.json.produtos.find(x => x.id === prodId), 'produto some da lista de afiliáveis');
    await req('PATCH', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria', corpo: { afiliado_pct: '' } }); // volta ao padrão
    const r2 = await req('GET', '/academy/api/afiliado/produtos', { jar: 'bruno' });
    assert.equal(r2.json.produtos.find(x => x.id === prodId).pct_efetivo, 10);
  });
  await t('staff lista comissões e KPIs seguem consistentes', async () => {
    const r = await req('GET', '/staff/api/academy/comissoes');
    assert.equal(r.st, 200);
    assert.equal(r.json.comissoes.length, 2); // fabi (paga) + gabi (cancelada)
    assert.ok(r.json.comissoes.every(c => ['paga', 'cancelada'].includes(c.status)));
  });

  // ================= FASE 6 — assinaturas e clubes =================
  console.log('\n— FASE 6: clube do produtor —');
  let clubeId, clubeSlug;
  await t('clube exige mensalidade e conteúdo/itens antes da revisão; só produto próprio entra', async () => {
    const r = await req('POST', '/academy/api/produtor/produtos', { jar: 'maria', corpo: { titulo: 'Clube Villela de Gestão', tipo: 'clube', preco_centavos: 4900 } });
    clubeId = r.json.produto.id; clubeSlug = r.json.produto.slug;
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${clubeId}/status`, { jar: 'maria', corpo: { status: 'em_revisao' } })).st, 400); // sem itens
    // produto de outra produtora não entra
    const alheio = academy.repo.Usuarios.porEmail(ANA.email).id; // dono ana
    const rascunhoAna = require('./db').db.prepare('SELECT id FROM products WHERE producer_id = ?').get(alheio);
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${clubeId}/clube/itens`, { jar: 'maria', corpo: { product_id: rascunhoAna.id } })).st, 400);
    // produto próprio publicado entra
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${clubeId}/clube/itens`, { jar: 'maria', corpo: { product_id: prodId } })).st, 200);
    const g = await req('GET', `/academy/api/produtor/produtos/${clubeId}/clube`, { jar: 'maria' });
    assert.equal(g.json.itens.length, 1);
  });
  await t('clube publica e aparece com /mês; compra avulsa de clube é bloqueada', async () => {
    await req('POST', `/academy/api/produtor/produtos/${clubeId}/status`, { jar: 'maria', corpo: { status: 'em_revisao' } });
    await req('POST', `/academy/api/admin/produtos/${clubeId}/decidir`, { jar: 'maria', corpo: { status: 'aprovado' } });
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${clubeId}/status`, { jar: 'maria', corpo: { status: 'publicado' } })).st, 200);
    const pg = await req('GET', `/academy/cursos/${clubeSlug}`);
    assert.equal(pg.st, 200); assert.ok(pg.texto.includes('/mês')); assert.ok(pg.texto.includes('Assinar agora'));
    const cx = await req('GET', `/academy/checkout/${clubeSlug}`);
    assert.ok(cx.texto.includes('Assinar clube'));
    assert.equal((await req('POST', `/academy/api/checkout/${clubeId}`, { jar: 'dani' })).st, 400); // clube não é compra avulsa
  });

  console.log('\n— FASE 6: assinar, acesso e cobrança recorrente —');
  let subId, preId;
  await t('assinar cria preapproval; acesso SÓ depois do authorized (webhook)', async () => {
    assert.equal((await req('POST', `/academy/api/assinar/${clubeId}`)).st, 401); // exige login
    const r = await req('POST', `/academy/api/assinar/${clubeId}`, { jar: 'dani' });
    assert.equal(r.st, 200); subId = r.json.assinatura_id;
    assert.ok(r.json.init_point.includes('/preapproval/'));
    preId = academy.billing.Assinaturas.obter(subId).mp_preapproval_id;
    assert.equal((await req('GET', `/academy/api/aluno/cursos/${clubeId}`, { jar: 'dani' })).json.matriculado, false);
    assert.equal((await req('POST', `/academy/api/assinar/${clubeId}`, { jar: 'dani' })).st, 400); // não assina 2x
    PRE_STATE[preId] = 'authorized';
    await req('POST', '/academy/webhooks/mercadopago', { corpo: { type: 'subscription_preapproval', data: { id: preId } } });
    await espera(200);
    assert.equal(academy.billing.Assinaturas.obter(subId).status, 'ativa');
  });
  await t('assinante acessa o clube E os produtos incluídos (mídia inclusive)', async () => {
    const clube = await req('GET', `/academy/api/aluno/cursos/${clubeId}`, { jar: 'dani' });
    assert.ok(clube.json.matriculado);
    assert.equal(clube.json.incluidos.length, 1);
    const item = await req('GET', `/academy/api/aluno/cursos/${prodId}`, { jar: 'dani' });
    assert.ok(item.json.matriculado, 'acesso ao item via assinatura');
    assert.equal((await req('GET', `/academy/api/media/${mediaId}`, { jar: 'dani' })).st, 200, 'mídia do item liberada');
    const bib = await req('GET', '/academy/api/aluno/biblioteca', { jar: 'dani' });
    assert.equal(bib.json.assinaturas.length, 1);
    // avaliação via assinatura (temAcesso)
    assert.equal((await req('POST', `/academy/api/aluno/cursos/${prodId}/avaliar`, { jar: 'dani', corpo: { nota: 4, texto: 'via clube' } })).st, 200);
  });
  await t('cobrança recorrente vira pedido (comissão 8,9%+R$1) e é idempotente; KPIs MRR', async () => {
    PAY_REF['905'] = 'academy-sub:' + subId;
    await req('POST', '/academy/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: '905' } } });
    await espera(200);
    const o = require('./db').db.prepare("SELECT * FROM orders WHERE subscription_id = ?").get(subId);
    assert.ok(o); assert.equal(o.tipo, 'assinatura'); assert.equal(o.valor_centavos, 4900);
    assert.equal(o.comissao_plataforma_centavos, 536); // 8,9% de 49,00 (4,36) + R$1,00
    await req('POST', '/academy/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: '905' } } });
    await espera(200);
    assert.equal(require('./db').db.prepare("SELECT COUNT(*) n FROM orders WHERE subscription_id = ?").get(subId).n, 1, 'cobrança duplicada não repete');
    const d = await req('GET', '/academy/api/admin/dashboard', { jar: 'maria' });
    assert.equal(d.json.dashboard.assinaturas_ativas, 1);
    assert.equal(d.json.dashboard.mrr_centavos, 4900);
  });
  await t('pausada (inadimplência) derruba o acesso; pagamento reativa', async () => {
    PRE_STATE[preId] = 'paused';
    await req('POST', '/academy/webhooks/mercadopago', { corpo: { type: 'subscription_preapproval', data: { id: preId } } });
    await espera(200);
    assert.equal(academy.billing.Assinaturas.obter(subId).status, 'pausada');
    assert.equal((await req('GET', `/academy/api/aluno/cursos/${prodId}`, { jar: 'dani' })).json.matriculado, false);
    PAY_REF['906'] = 'academy-sub:' + subId;
    await req('POST', '/academy/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: '906' } } });
    await espera(200);
    assert.equal(academy.billing.Assinaturas.obter(subId).status, 'ativa');
    assert.equal((await req('GET', `/academy/api/aluno/cursos/${prodId}`, { jar: 'dani' })).json.matriculado, true);
  });
  await t('cancelar (assinante) chama o MP e encerra o acesso', async () => {
    const r = await req('POST', `/academy/api/assinaturas/${subId}/cancelar`, { jar: 'dani' });
    assert.equal(r.st, 200);
    assert.ok(mpChamadas.some(x => x.startsWith('PUT /preapproval/')));
    assert.equal(academy.billing.Assinaturas.obter(subId).status, 'cancelada');
    assert.equal((await req('GET', `/academy/api/aluno/cursos/${clubeId}`, { jar: 'dani' })).json.matriculado, false);
  });
  await t('staff e admin listam assinaturas; assinar de novo após cancelar funciona', async () => {
    const st = await req('GET', '/staff/api/academy/assinaturas');
    assert.equal(st.st, 200); assert.equal(st.json.assinaturas.length, 1);
    const r = await req('POST', `/academy/api/assinar/${clubeId}`, { jar: 'dani' });
    assert.equal(r.st, 200);
    // limpeza: cancela a pendente
    assert.equal((await req('POST', `/academy/api/assinaturas/${r.json.assinatura_id}/cancelar`, { jar: 'dani' })).st, 200);
  });

  // ================= FASE 7 — storage, URLs assinadas e vídeo =================
  console.log('\n— FASE 7: URLs assinadas e storage —');
  const storage = require('./storage');
  const crypto = require('crypto');
  await t('link assinado: quem tem acesso gera; URL funciona SEM cookie e expira', async () => {
    const r = await req('GET', `/academy/api/media/${mediaId}/link`, { jar: 'ana' });
    assert.equal(r.st, 200);
    assert.ok(r.json.url.includes('/academy/media-s/')); assert.ok(r.json.expira_epoch > Date.now() / 1000);
    const pub = await fetch(BASE + r.json.url); // sem cookie nenhum
    assert.equal(pub.status, 200);
    assert.ok((pub.headers.get('content-type') || '').includes('pdf'));
    // assinatura adulterada → 403
    const quebrada = r.json.url.replace(/s=[^&]+/, 's=aaaaadulterada');
    assert.equal((await fetch(BASE + quebrada)).status, 403);
    // expirada (HMAC correto, mas e no passado) → 403
    const anaId = academy.repo.Usuarios.porEmail(ANA.email).id;
    const e = Math.floor(Date.now() / 1000) - 10;
    const sig = crypto.createHmac('sha256', 'seg-teste').update(`${mediaId}.${anaId}.${e}`).digest('base64url');
    assert.equal((await fetch(`${BASE}/academy/media-s/${mediaId}?u=${anaId}&e=${e}&s=${sig}`)).status, 403);
  });
  await t('sem acesso não emite link; acessos pela URL assinada são logados', async () => {
    assert.equal((await req('GET', `/academy/api/media/${mediaId}/link`, { jar: 'bruno' })).st, 404);
    const antes = dbx.prepare('SELECT COUNT(*) n FROM download_logs').get().n;
    const r = await req('GET', `/academy/api/media/${mediaId}/link`, { jar: 'ana' });
    await fetch(BASE + r.json.url);
    assert.ok(dbx.prepare('SELECT COUNT(*) n FROM download_logs').get().n >= antes + 2, 'emissão + consumo logados');
  });
  await t('vídeo não sobe por base64; upload grande exige S3 configurado', async () => {
    const v = await req('POST', '/academy/api/produtor/upload', { jar: 'maria', corpo: { nome: 'aula.mp4', mime: 'video/mp4', conteudo_base64: Buffer.from('x').toString('base64') } });
    assert.equal(v.st, 400); assert.ok(v.json.erro.includes('upload de vídeo') || v.json.erro.includes('URL externa'));
    const g = await req('POST', '/academy/api/produtor/upload-grande', { jar: 'maria', corpo: { nome: 'aula.mp4', mime: 'video/mp4', tamanho: 1000 } });
    assert.equal(g.st, 400); assert.ok(g.json.erro.includes('S3/R2'));
  });
  // REGRESSÃO (11/08/2026): com S3 ligado, confirmar o upload de vídeo respondia
  // sempre "Upload não encontrado" — o registro nasce confirmado=0 e a confirmação
  // procurava por obter(), que filtra confirmado=1. O arquivo chegava ao bucket e a
  // aula nunca era criada. A suíte rodava sem S3, então este trecho nunca executava.
  await t('upload grande de vídeo: iniciar → PUT → confirmar → vira aula (S3 ligado)', async () => {
    const real = { s3Ativo: storage.s3Ativo, presignS3: storage.presignS3, s3Existe: storage.s3Existe };
    const bucketFalso = new Map();
    let modVideoId = null; // removido no fim: senão o curso ganha aula a mais e o teste de certificado (100%) quebra
    storage.s3Ativo = () => true;
    storage.presignS3 = (cfg, met, key) => `https://fake.r2/${encodeURIComponent(key)}?met=${met}`;
    storage.s3Existe = async (key) => (bucketFalso.has(key) ? { tamanho: bucketFalso.get(key) } : null);
    try {
      const ini = await req('POST', '/academy/api/produtor/upload-grande', { jar: 'maria', corpo: { nome: 'aula.mp4', mime: 'video/mp4', tamanho: 4096 } });
      assert.equal(ini.st, 200, 'iniciar upload grande');
      assert.ok(ini.json.upload_url, 'devolve URL presignada');

      // antes do arquivo chegar ao bucket, confirmar precisa falhar POR ISSO — e dizer isso
      const cedo = await req('POST', `/academy/api/produtor/upload-grande/${ini.json.id}/confirmar`, { jar: 'maria' });
      assert.equal(cedo.st, 400);
      assert.ok(/ainda não chegou/i.test(cedo.json.erro), `erro deve explicar que falta o arquivo, veio: ${cedo.json.erro}`);

      bucketFalso.set(ini.json.id + '.mp4', 4096); // o navegador fez o PUT
      const ok = await req('POST', `/academy/api/produtor/upload-grande/${ini.json.id}/confirmar`, { jar: 'maria' });
      assert.equal(ok.st, 200, `confirmar após o PUT deve funcionar, veio: ${JSON.stringify(ok.json)}`);

      const idem = await req('POST', `/academy/api/produtor/upload-grande/${ini.json.id}/confirmar`, { jar: 'maria' });
      assert.equal(idem.st, 200, 'confirmar de novo é idempotente');

      const mod = await req('POST', `/academy/api/produtor/produtos/${prodId}/modulos`, { jar: 'maria', corpo: { titulo: 'Mód. vídeo' } });
      modVideoId = mod.json.id;
      const aula = await req('POST', `/academy/api/produtor/produtos/${prodId}/modulos/${mod.json.id}/aulas`, {
        jar: 'maria', corpo: { titulo: 'Aula em vídeo', tipo: 'video', media_id: ini.json.id },
      });
      assert.equal(aula.st, 200, 'a aula com o vídeo confirmado é criada');

      // upload de outro produtor não pode ser confirmado por quem não é dono
      const alheio = await req('POST', `/academy/api/produtor/upload-grande/${ini.json.id}/confirmar`, { jar: 'bruno' });
      assert.ok(alheio.st >= 400, 'só o dono confirma o próprio upload');
    } finally {
      Object.assign(storage, real);
      if (modVideoId) await req('DELETE', `/academy/api/produtor/produtos/${prodId}/modulos/${modVideoId}`, { jar: 'maria' });
    }
  });
  // REGRESSÃO (11/08/2026): com o storage no R2, a capa PÚBLICA ia buscar o arquivo no
  // DISCO (sendFile) e dava ENOENT. Em produção o card do marketplace virava imagem
  // quebrada esticada e o "ver" do produtor respondia Not Found — com o upload intacto
  // no bucket. A suíte roda com driver local, então este caminho nunca executava: aqui
  // só a REDE é falsa (bucket em memória); SigV4, escolha de driver e rota são os reais.
  await t('capa pública sai do bucket quando o storage é S3/R2 (não do disco)', async () => {
    const ENVS = ['ACADEMY_S3_ENDPOINT', 'ACADEMY_S3_BUCKET', 'ACADEMY_S3_KEY', 'ACADEMY_S3_SECRET'];
    const envAntes = ENVS.map((k) => process.env[k]);
    const capaAntes = dbx.prepare('SELECT capa_media_id FROM products WHERE id = ?').get(prodId).capa_media_id;
    const bucket = new Map();
    const fetchReal = globalThis.fetch;
    process.env.ACADEMY_S3_ENDPOINT = 'https://conta-teste.r2.cloudflarestorage.com';
    process.env.ACADEMY_S3_BUCKET = 'academy-teste';
    process.env.ACADEMY_S3_KEY = 'AKIATESTE';
    process.env.ACADEMY_S3_SECRET = 'segredo-teste';
    globalThis.fetch = async (url, opc) => {
      const u = String(url && url.url ? url.url : url);
      if (!u.includes('r2.cloudflarestorage.com')) return fetchReal(url, opc); // tráfego da própria suíte
      const chave = decodeURIComponent(new URL(u).pathname.split('/').slice(2).join('/'));
      const met = (opc && opc.method) || 'GET';
      if (met === 'PUT') { bucket.set(chave, Buffer.from(opc.body)); return new Response('', { status: 200 }); }
      if (!bucket.has(chave)) return new Response('', { status: 404 });
      if (met === 'HEAD') return new Response('', { status: 200, headers: { 'content-length': String(bucket.get(chave).length) } });
      return new Response(bucket.get(chave), { status: 200 });
    };
    try {
      const png = Buffer.from('PNGfake-que-so-existe-no-bucket');
      const up = await req('POST', '/academy/api/produtor/upload', { jar: 'maria', corpo: { nome: 'capa-r2.png', mime: 'image/png', conteudo_base64: png.toString('base64') } });
      assert.equal(up.st, 200, 'upload da capa com R2 ligado');
      assert.equal(dbx.prepare('SELECT storage FROM media_files WHERE id = ?').get(up.json.id).storage, 's3', 'a capa foi para o bucket, não para o disco');
      assert.equal((await req('PATCH', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria', corpo: { capa_media_id: up.json.id } })).st, 200);

      const r = await fetchReal(`${BASE}/academy/capa/${prodId}`);
      assert.equal(r.status, 200, 'capa no bucket tem de ser servida (antes: 404 do sendFile no disco)');
      assert.ok((r.headers.get('content-type') || '').includes('image/png'));
      assert.equal(Buffer.from(await r.arrayBuffer()).toString(), png.toString(), 'os bytes vêm do bucket');
      // o card manda ?v=<media_id>: sem isso, trocar a capa deixa a antiga 1h no navegador
      assert.equal((await fetchReal(`${BASE}/academy/capa/${prodId}?v=${up.json.id}`)).status, 200, 'a chave de cache não pode atrapalhar a entrega');
      const mk = await fetchReal(`${BASE}/academy/marketplace`);
      assert.ok((await mk.text()).includes(`/academy/capa/${prodId}?v=${up.json.id}`), 'o card do marketplace versiona a capa');

      // e o produtor vê a própria capa mesmo com o produto FORA do ar (rota privada)
      const priv = await req('GET', `/academy/api/media/${up.json.id}`, { jar: 'maria', redirect: 'manual' });
      assert.ok(priv.st === 200 || priv.st === 302, `dono enxerga a capa, veio ${priv.st}`);
    } finally {
      globalThis.fetch = fetchReal;
      ENVS.forEach((k, i) => { if (envAntes[i] == null) delete process.env[k]; else process.env[k] = envAntes[i]; });
      // devolve a capa local: senão os testes seguintes leem um arquivo que só existia no bucket falso
      if (capaAntes) await req('PATCH', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria', corpo: { capa_media_id: capaAntes } });
    }
  });
  // REGRESSÃO (11/08/2026): o 404 da capa saía CACHEÁVEL. `Cache-Control` era setado
  // antes do sendFile e o finalhandler do Express limpa só os Content-*, então o erro
  // ia com `public, max-age=3600`: quem viu a capa quebrada guardou o 404 por 1 HORA e a
  // correção do bucket pareceu não ter funcionado até o cache vencer sozinho.
  await t('capa que falta responde 404 SEM cache (senão o erro gruda no navegador)', async () => {
    const fs = require('fs');
    const path = require('path');
    const capaAntes = dbx.prepare('SELECT capa_media_id FROM products WHERE id = ?').get(prodId).capa_media_id;
    const up = await req('POST', '/academy/api/produtor/upload', { jar: 'maria', corpo: { nome: 'capa-some.png', mime: 'image/png', conteudo_base64: Buffer.from('PNGfake').toString('base64') } });
    await req('PATCH', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria', corpo: { capa_media_id: up.json.id } });
    try {
      const ok = await fetch(`${BASE}/academy/capa/${prodId}`);
      assert.equal(ok.status, 200, 'com o arquivo no lugar, entrega normal');
      assert.ok((ok.headers.get('cache-control') || '').includes('max-age'), 'o SUCESSO continua cacheável');

      const rel = dbx.prepare('SELECT file_path FROM media_files WHERE id = ?').get(up.json.id).file_path;
      fs.unlinkSync(path.join(storage.ARQUIVOS_DIR, rel)); // arquivo some (migração p/ bucket, disco novo…)
      const r = await fetch(`${BASE}/academy/capa/${prodId}`);
      assert.equal(r.status, 404);
      assert.ok(!r.headers.get('cache-control'), `404 não pode ser cacheado, veio: ${r.headers.get('cache-control')}`);
    } finally {
      if (capaAntes) await req('PATCH', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria', corpo: { capa_media_id: capaAntes } });
    }
  });
  await t('categorias: escolher uma do sistema, criar a sua, e o filtro público só mostra a usada', async () => {
    const dbC = require('./db').db;
    const cats = (await req('GET', '/academy/api/produtor/produtos', { jar: 'maria' })).json.categorias;
    assert.ok(cats.length >= 15, 'as 15 do sistema vieram da migração');
    assert.ok(cats.every(c => c.slug && c.rotulo), 'cada categoria tem slug e rótulo');
    assert.ok(cats.find(c => c.slug === 'inteligencia-artificial').rotulo === 'Inteligência Artificial', 'rótulo com acento');

    // escolher uma existente
    assert.equal((await req('PATCH', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria', corpo: { categoria: 'marketing' } })).st, 200);
    assert.equal(dbC.prepare('SELECT categoria FROM products WHERE id = ?').get(prodId).categoria, 'marketing');
    // categoria inexistente não entra (vira vazio, não quebra)
    await req('PATCH', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria', corpo: { categoria: 'nao-existe-isso' } });
    assert.equal(dbC.prepare('SELECT categoria FROM products WHERE id = ?').get(prodId).categoria, '', 'slug inválido não é aceito');

    // criar uma nova
    const nova = await req('POST', '/academy/api/produtor/categorias', { jar: 'maria', corpo: { rotulo: 'Fotografia Aérea' } });
    assert.equal(nova.st, 200);
    assert.equal(nova.json.categoria.slug, 'fotografia-aerea', 'slug sem acento');
    assert.equal(nova.json.categoria.origem, 'produtor');
    // nome equivalente NÃO duplica — reusa a mesma
    const igual = await req('POST', '/academy/api/produtor/categorias', { jar: 'maria', corpo: { rotulo: '  fotografia   AÉREA ' } });
    assert.equal(igual.json.categoria.slug, 'fotografia-aerea');
    assert.equal(dbC.prepare("SELECT COUNT(*) n FROM categories WHERE slug = 'fotografia-aerea'").get().n, 1, 'sem categoria irmã');
    // nome que colide com a do sistema devolve a do sistema, sem virar de produtor
    assert.equal((await req('POST', '/academy/api/produtor/categorias', { jar: 'maria', corpo: { rotulo: 'Marketing' } })).json.categoria.origem, 'sistema');
    // nome curto demais é recusado com motivo
    const curta = await req('POST', '/academy/api/produtor/categorias', { jar: 'maria', corpo: { rotulo: 'ab' } });
    assert.equal(curta.st, 400); assert.ok(/3 letras/.test(curta.json.erro));

    // filtro público: a nova só aparece quando tiver produto PUBLICADO nela
    const ctC = require('./repo-conteudo');
    assert.ok(!ctC.Categorias.visiveis().some(c => c.slug === 'fotografia-aerea'), 'categoria nova e vazia fica fora da vitrine');
    assert.ok(ctC.Categorias.visiveis().some(c => c.slug === 'marketing'), 'a do sistema aparece sempre');
    dbC.prepare("UPDATE products SET categoria = 'fotografia-aerea' WHERE id = ?").run(prodId); // prodId está publicado
    assert.ok(ctC.Categorias.visiveis().some(c => c.slug === 'fotografia-aerea'), 'com produto publicado, entra na vitrine');
    const html = await req('GET', '/academy/marketplace');
    assert.ok(html.texto.includes('Fotografia Aérea'), 'e o marketplace lista o rótulo');
    // o rótulo também aparece NO CARD e na página do curso (etiqueta + link p/ o filtro)
    const slugPub = dbC.prepare('SELECT slug FROM products WHERE id = ?').get(prodId).slug;
    const pag = await req('GET', `/academy/cursos/${slugPub}`);
    assert.ok(pag.texto.includes('marketplace?categoria=fotografia-aerea'), 'página do curso linka a categoria');
    assert.ok(!/<a[^>]*>\s*<a/.test(html.texto), 'card não aninha âncora dentro de âncora');
    dbC.prepare("UPDATE products SET categoria = '' WHERE id = ?").run(prodId); // devolve o fixture
  });
  await t('staff governa categorias: renomeia sem quebrar link, e só remove o que não está em uso', async () => {
    const dbS = require('./db').db;
    // o staff enxerga tudo, com quantos produtos usam cada uma
    const lista = (await req('GET', '/staff/api/academy/categorias')).json.categorias;
    const ia = lista.find(c => c.slug === 'inteligencia-artificial');
    assert.equal(ia.origem, 'sistema');
    assert.ok('produtos' in ia && 'publicados' in ia, 'traz o uso de cada categoria');

    // renomear muda o RÓTULO e preserva o slug (links e produtos continuam válidos)
    await req('POST', '/academy/api/produtor/categorias', { jar: 'maria', corpo: { rotulo: 'Nome Infeliz' } });
    dbS.prepare("UPDATE products SET categoria = 'nome-infeliz' WHERE id = ?").run(prodId);
    const ren = await req('PATCH', '/staff/api/academy/categorias/nome-infeliz', { corpo: { rotulo: 'Nome Decente' } });
    assert.equal(ren.st, 200);
    assert.equal(ren.json.categoria.slug, 'nome-infeliz', 'slug NÃO muda ao renomear');
    assert.equal(ren.json.categoria.rotulo, 'Nome Decente');
    assert.equal(dbS.prepare('SELECT categoria FROM products WHERE id = ?').get(prodId).categoria, 'nome-infeliz', 'produto segue classificado');
    assert.ok((await req('GET', '/academy/marketplace')).texto.includes('Nome Decente'), 'vitrine mostra o rótulo novo');

    // em uso não se remove (senão o produto aponta para o nada, em silêncio)
    const emUso = await req('DELETE', '/staff/api/academy/categorias/nome-infeliz');
    assert.equal(emUso.st, 400); assert.ok(/produto\(s\) ainda usam/.test(emUso.json.erro), emUso.json.erro);
    // do sistema nunca se remove
    const sis = await req('DELETE', '/staff/api/academy/categorias/inteligencia-artificial');
    assert.equal(sis.st, 400); assert.ok(/sistema/.test(sis.json.erro));
    assert.ok(require('./repo-conteudo').Categorias.existe('inteligencia-artificial'), 'continua lá');

    // liberando o uso, remove
    dbS.prepare("UPDATE products SET categoria = '' WHERE id = ?").run(prodId);
    assert.equal((await req('DELETE', '/staff/api/academy/categorias/nome-infeliz')).st, 200);
    assert.ok(!require('./repo-conteudo').Categorias.existe('nome-infeliz'), 'sumiu');
    // renomear o que não existe dá erro claro
    assert.equal((await req('PATCH', '/staff/api/academy/categorias/nao-existe', { corpo: { rotulo: 'X Y Z' } })).st, 400);
    // e o guarda de admin vale aqui também
    assert.equal((await req('GET', '/staff/api/academy/categorias', { user: 'op' })).st, 403);
  });
  await t('presign SigV4 (S3/R2) gera URLs válidas em formato', async () => {
    const cfg = { endpoint: 'https://conta.r2.cloudflarestorage.com', bucket: 'academy', key: 'AKIATESTE', secret: 'segredo', region: 'auto' };
    for (const met of ['GET', 'PUT', 'HEAD']) {
      const u = storage.presignS3(cfg, met, 'videos/aula 1.mp4', 600);
      assert.ok(u.startsWith('https://conta.r2.cloudflarestorage.com/academy/videos/aula%201.mp4?'), met);
      assert.ok(u.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'));
      assert.ok(u.includes('X-Amz-Credential=AKIATESTE%2F'));
      assert.ok(/X-Amz-Signature=[0-9a-f]{64}$/.test(u));
    }
    assert.ok(!storage.s3Ativo(), 'sem env, driver s3 fica desligado');
  });

  // ================= FASE 8 — comunicações =================
  console.log('\n— FASE 8: verificação de e-mail e reset de senha —');
  const HUGO = { nome: 'Hugo', email: 'hugo@t.com', senha: 'senha-forte-9', aceite_termos: true };
  await t('signup envia boas-vindas; link confirma o e-mail', async () => {
    await req('POST', '/academy/api/signup', { corpo: HUGO, jar: 'hugo' });
    await espera(100);
    const mail = enviados.find(e => e.to === HUGO.email && e.ass.includes('confirme'));
    assert.ok(mail, 'e-mail de boas-vindas enviado');
    const token = (mail.html.match(/verificar-email\?token=([^"&]+)/) || [])[1];
    assert.ok(token, 'link de verificação presente');
    assert.equal((await req('GET', '/academy/verificar-email?token=' + token)).st, 200); // página existe
    assert.equal((await req('POST', '/academy/api/verificar-email', { corpo: { token } })).st, 200);
    const me = await req('GET', '/academy/api/me', { jar: 'hugo' });
    assert.equal(me.json.usuario.email_verificado, 1);
    assert.equal((await req('POST', '/academy/api/verificar-email', { corpo: { token: 'x' } })).st, 400);
  });
  await t('esqueci senha: sem enumeração, token redefine e derruba sessões', async () => {
    assert.equal((await req('POST', '/academy/api/senha/esquecer', { corpo: { email: 'naoexiste@t.com' } })).st, 200); // resposta idêntica
    assert.equal((await req('POST', '/academy/api/senha/esquecer', { corpo: { email: HUGO.email } })).st, 200);
    await espera(100);
    const mail = [...enviados].reverse().find(e => e.to === HUGO.email && e.ass.includes('redefinir'));
    assert.ok(mail);
    const token = (mail.html.match(/redefinir-senha\?token=([^"&]+)/) || [])[1];
    assert.equal((await req('GET', '/academy/redefinir-senha?token=' + token)).st, 200); // página existe
    assert.equal((await req('POST', '/academy/api/senha/redefinir', { corpo: { token, senha: 'nova-do-hugo-1' } })).st, 200);
    assert.equal((await req('GET', '/academy/api/me', { jar: 'hugo' })).st, 401, 'sessões derrubadas');
    assert.equal((await req('POST', '/academy/api/login', { corpo: { email: HUGO.email, senha: HUGO.senha } })).st, 401);
    assert.equal((await req('POST', '/academy/api/login', { corpo: { email: HUGO.email, senha: 'nova-do-hugo-1' }, jar: 'hugo' })).st, 200);
  });

  console.log('\n— FASE 8: e-mails de eventos e sininho —');
  await t('eventos do funil dispararam e-mails (compra, venda, cortesia, perfil, assinatura)', async () => {
    const assuntos = enviados.map(e => e.ass).join(' | ');
    assert.ok(assuntos.includes('Acesso liberado'), 'compra paga → comprador');
    assert.ok(assuntos.includes('Você vendeu'), 'venda → produtor');
    assert.ok(assuntos.includes('Você ganhou acesso'), 'cortesia → aluno');
    assert.ok(assuntos.includes('aprovado'), 'perfil aprovado → solicitante');
    assert.ok(enviados.some(e => e.ass.includes('Clube Villela')), 'assinatura → assinante');
  });
  await t('notificações internas: listar e marcar lidas', async () => {
    const n1 = await req('GET', '/academy/api/notificacoes', { jar: 'fabi' });
    assert.equal(n1.st, 200);
    assert.ok(n1.json.nao_lidas >= 1, 'fabi tem notificação da compra');
    assert.equal((await req('POST', '/academy/api/notificacoes/lidas', { jar: 'fabi' })).st, 200);
    assert.equal((await req('GET', '/academy/api/notificacoes', { jar: 'fabi' })).json.nao_lidas, 0);
  });
  await t('pedido abandonado: lembrete único após 1h pendente', async () => {
    const r = await req('POST', `/academy/api/checkout/${prodId}`, { jar: 'hugo' });
    dbx.prepare('UPDATE orders SET criado_em = ? WHERE id = ?').run(new Date(Date.now() - 2 * 3600e3).toISOString(), r.json.order_id);
    const p1 = await req('POST', '/staff/api/academy/pedidos-abandonados/processar');
    assert.equal(p1.json.lembretes_enviados, 1);
    await espera(100);
    assert.ok(enviados.some(e => e.to === HUGO.email && e.ass.includes('esperando')));
    const p2 = await req('POST', '/staff/api/academy/pedidos-abandonados/processar');
    assert.equal(p2.json.lembretes_enviados, 0, 'não repete o lembrete');
  });

  console.log('\n— FASE 8: webhook de saída e logs —');
  await t('webhook de saída assinado (Make/n8n) recebe eventos', async () => {
    const receb = [];
    const wapp = express();
    wapp.post('/hook', express.text({ type: () => true }), (rq, rs) => { receb.push({ corpo: rq.body, sig: rq.headers['x-academy-signature'], ev: rq.headers['x-academy-event'] }); rs.json({ ok: true }); });
    const wsrv = wapp.listen(0);
    await req('POST', '/staff/api/academy/config', { corpo: { chave: 'webhook_saida', valor: { url: `http://127.0.0.1:${wsrv.address().port}/hook`, secret: 'segredo-hook' } } });
    await req('POST', '/academy/api/lead', { corpo: { nome: 'Lead Hook', email: 'h@h', interesse: 'produtor' } });
    await espera(300);
    wsrv.close();
    assert.equal(receb.length, 1);
    assert.equal(receb[0].ev, 'lead.novo');
    const esperada = require('crypto').createHmac('sha256', 'segredo-hook').update(receb[0].corpo).digest('hex');
    assert.equal(receb[0].sig, esperada, 'assinatura HMAC confere');
    await req('POST', '/staff/api/academy/config', { corpo: { chave: 'webhook_saida', valor: null } }); // desliga
  });
  await t('staff vê o log de comunicações', async () => {
    const r = await req('GET', '/staff/api/academy/comunicacoes-log');
    assert.equal(r.st, 200);
    assert.ok(r.json.eventos.some(e => e.canal === 'email' && e.status === 'ok'));
    assert.ok(r.json.eventos.some(e => e.canal === 'webhook'));
    assert.ok(r.json.eventos.some(e => e.canal === 'interna'));
  });

  // ================= FASE 9 — IA =================
  console.log('\n— FASE 9: IA (agentes, escopo e limites) —');
  const iaMod = require('./ia');
  iaMod.__mockParaTeste(async ({ agente, prompt }) => {
    if (agente === 'estruturar') return { json: { modulos: [{ titulo: 'Módulo IA', aulas: [{ titulo: 'Aula IA 1', tipo: 'texto', objetivo: 'aprender X' }, { titulo: 'Aula IA 2', tipo: 'video' }] }], observacoes: 'ok' } };
    if (agente === 'copy') return { json: { headline: 'Headline da IA', subheadline: 'Sub', promessa: 'P', beneficios: ['b1', 'b2'], para_quem: [], aprender: [], bonus: [], faq: [], garantia_texto: '' } };
    if (agente === 'pedagogico') return { json: { avaliacao: 'boa sequência', sugestoes: ['s1'], quiz: [{ pergunta: 'q1', alternativas: ['a', 'b'], correta: 0, aula: 'Boas-vindas' }] } };
    if (agente === 'suporte') return { json: { resposta: 'Contexto tinha ' + (prompt.includes('Bem-vindo ao curso!') ? 'CONTEUDO-LIBERADO' : 'SEM-CONTEUDO'), aula_referencia: 'Boas-vindas', nao_encontrado: false } };
    if (agente === 'relatorio') return { json: { resumo: 'Plataforma saudável.', destaques: ['GMV ok'], alertas: [], recomendacoes: ['divulgar'] } };
    return { json: {} };
  });
  await t('status da IA + estruturar curso e APLICAR cria módulos/aulas rascunho', async () => {
    const st = await req('GET', '/academy/api/ia/status', { jar: 'maria' });
    assert.equal(st.st, 200); assert.ok(st.json.ativo); assert.equal(st.json.limite_dia, 30);
    const novo = await req('POST', '/academy/api/produtor/produtos', { jar: 'maria', corpo: { titulo: 'Curso via IA', tipo: 'curso', preco_centavos: 5000 } });
    const nid = novo.json.produto.id;
    const r = await req('POST', '/academy/api/ia/produtor/estruturar', { jar: 'maria', corpo: { product_id: nid, tema: 'gestão' } });
    assert.equal(r.st, 200); assert.equal(r.json.estrutura.modulos.length, 1);
    const ap = await req('POST', '/academy/api/ia/produtor/estruturar/aplicar', { jar: 'maria', corpo: { product_id: nid, estrutura: r.json.estrutura } });
    assert.equal(ap.json.modulos, 1); assert.equal(ap.json.aulas, 2);
    const est = await req('GET', `/academy/api/produtor/produtos/${nid}`, { jar: 'maria' });
    assert.equal(est.json.estrutura[0].aulas.length, 2);
    assert.ok(est.json.estrutura[0].aulas[0].conteudo.includes('Objetivo'));
  });
  await t('copywriter gera seções aplicáveis; pedagógico sugere quiz; só o dono usa', async () => {
    const r = await req('POST', '/academy/api/ia/produtor/copy', { jar: 'maria', corpo: { product_id: prodId } });
    assert.equal(r.st, 200); assert.equal(r.json.secoes.headline, 'Headline da IA');
    assert.equal((await req('PUT', `/academy/api/produtor/produtos/${prodId}/pagina`, { jar: 'maria', corpo: r.json.secoes })).st, 200);
    const p = await req('POST', '/academy/api/ia/produtor/pedagogico', { jar: 'maria', corpo: { product_id: prodId } });
    assert.equal(p.json.quiz.length, 1);
    assert.equal((await req('POST', '/academy/api/ia/produtor/copy', { jar: 'ana', corpo: { product_id: prodId } })).st, 400, 'produto alheio');
  });
  await t('suporte ao aluno: exige acesso e o contexto respeita o que está liberado', async () => {
    assert.equal((await req('POST', '/academy/api/ia/aluno/perguntar', { jar: 'hugo', corpo: { product_id: prodId, pergunta: 'oi?' } })).st, 404, 'sem acesso');
    const r = await req('POST', '/academy/api/ia/aluno/perguntar', { jar: 'ana', corpo: { product_id: prodId, pergunta: 'do que fala a aula 1?' } });
    assert.equal(r.st, 200);
    assert.ok(r.json.resposta.includes('CONTEUDO-LIBERADO'), 'conteúdo do matriculado entrou no contexto');
  });
  await t('relatório executivo do admin + logs/custo no staff', async () => {
    const r = await req('POST', '/academy/api/ia/admin/relatorio', { jar: 'maria' });
    assert.equal(r.st, 200); assert.equal(r.json.resumo, 'Plataforma saudável.');
    assert.equal((await req('POST', '/academy/api/ia/admin/relatorio', { jar: 'ana' })).st, 403, 'só admin');
    const logs = await req('GET', '/staff/api/academy/ia-logs');
    assert.equal(logs.st, 200);
    assert.ok(logs.json.consultas >= 5);
    assert.ok(logs.json.eventos.some(e => e.agente === 'suporte'));
  });
  await t('limite diário de IA por usuário (429)', async () => {
    await req('POST', '/staff/api/academy/config', { corpo: { chave: 'ia', valor: { consultas_dia: 2 } } });
    // ana já usou 1 (suporte); segunda ainda passa, terceira estoura
    assert.equal((await req('POST', '/academy/api/ia/aluno/perguntar', { jar: 'ana', corpo: { product_id: prodId, pergunta: 'mais uma' } })).st, 200);
    const r = await req('POST', '/academy/api/ia/aluno/perguntar', { jar: 'ana', corpo: { product_id: prodId, pergunta: 'estourou?' } });
    assert.equal(r.st, 429);
    await req('POST', '/staff/api/academy/config', { corpo: { chave: 'ia', valor: { consultas_dia: 30 } } });
  });

  // ================= FASE 10 — governança =================
  console.log('\n— FASE 10: certificados —');
  let certCodigo;
  await t('certificado só com 100%; emissão idempotente; validação pública', async () => {
    assert.equal((await req('POST', `/academy/api/aluno/cursos/${prodId}/certificado`, { jar: 'fabi' })).st, 400, '0% não emite');
    await req('POST', `/academy/api/aluno/aulas/${aulaPdfId}/progresso`, { jar: 'ana', corpo: { concluida: true } }); // ana chega a 100%
    const r = await req('POST', `/academy/api/aluno/cursos/${prodId}/certificado`, { jar: 'ana' });
    assert.equal(r.st, 200); certCodigo = r.json.codigo;
    assert.ok(certCodigo.startsWith('VA-'));
    const r2 = await req('POST', `/academy/api/aluno/cursos/${prodId}/certificado`, { jar: 'ana' });
    assert.equal(r2.json.codigo, certCodigo, 'não duplica');
    const pub = await req('GET', `/academy/certificados/${certCodigo}`);
    assert.equal(pub.st, 200);
    assert.ok(pub.texto.includes('Ana Aluna')); assert.ok(pub.texto.includes('Gestão de Temporada'));
    assert.equal((await req('GET', '/academy/certificados/VA-NAOEXISTE')).st, 404);
    const lista = await req('GET', '/academy/api/aluno/certificados', { jar: 'ana' });
    assert.equal(lista.json.certificados.length, 1);
  });

  console.log('\n— FASE 10: suporte (tickets) —');
  await t('ticket: usuário abre, plataforma responde (com sininho), fecha', async () => {
    const r = await req('POST', '/academy/api/tickets', { jar: 'fabi', corpo: { assunto: 'Dúvida de acesso', categoria: 'conta', texto: 'Não acho meu curso.' } });
    assert.equal(r.st, 200);
    const notifAntes = (await req('GET', '/academy/api/notificacoes', { jar: 'fabi' })).json.nao_lidas;
    assert.equal((await req('POST', `/academy/api/admin/tickets/${r.json.id}/responder`, { jar: 'maria', corpo: { texto: 'Está na aba Aluno → biblioteca.' } })).st, 200);
    const t1 = await req('GET', `/academy/api/tickets/${r.json.id}`, { jar: 'fabi' });
    assert.equal(t1.json.ticket.status, 'respondido');
    assert.equal(t1.json.ticket.mensagens.length, 2);
    assert.ok((await req('GET', '/academy/api/notificacoes', { jar: 'fabi' })).json.nao_lidas > notifAntes, 'sininho avisou');
    assert.equal((await req('GET', `/academy/api/tickets/${r.json.id}`, { jar: 'ana' })).st, 404, 'ticket é privado');
    assert.equal((await req('POST', `/academy/api/admin/tickets/${r.json.id}/status`, { jar: 'maria', corpo: { status: 'fechado' } })).st, 200);
    const staffVe = await req('GET', '/staff/api/academy/tickets');
    assert.ok(staffVe.json.tickets.length >= 1);
  });

  console.log('\n— FASE 10: relatórios avançados —');
  await t('série mensal, conversão e churn no admin e no staff', async () => {
    const r = await req('GET', '/academy/api/admin/relatorios', { jar: 'maria' });
    assert.equal(r.st, 200);
    assert.equal(r.json.serie_mensal.length, 6);
    const mesAtual = r.json.serie_mensal[5];
    assert.ok(mesAtual.gmv_centavos > 0, 'GMV do mês reflete as vendas do teste');
    assert.ok(r.json.conversao.pedidos > 0 && r.json.conversao.pct != null);
    assert.ok(r.json.certificados_emitidos >= 1);
    assert.equal((await req('GET', '/staff/api/academy/relatorios')).st, 200);
  });

  console.log('\n— FASE 10: 2FA e hardening —');
  await t('2FA: gerar → ativar → login exige código → desativar', async () => {
    const gov = require('./governanca');
    const g = await req('POST', '/academy/api/me/2fa/gerar', { jar: 'hugo' });
    assert.equal(g.st, 200); assert.ok(g.json.otpauth.includes('otpauth://totp/'));
    assert.equal((await req('POST', '/academy/api/me/2fa/ativar', { jar: 'hugo', corpo: { codigo: '000000' } })).st, 400, 'código errado não ativa');
    assert.equal((await req('POST', '/academy/api/me/2fa/ativar', { jar: 'hugo', corpo: { codigo: gov.totpAgora(g.json.secret) } })).st, 200);
    const semCod = await req('POST', '/academy/api/login', { corpo: { email: HUGO.email, senha: 'nova-do-hugo-1' } });
    assert.equal(semCod.st, 401); assert.ok(semCod.json.precisa_2fa);
    assert.equal((await req('POST', '/academy/api/login', { corpo: { email: HUGO.email, senha: 'nova-do-hugo-1', codigo: '123456' } })).st, 401);
    assert.equal((await req('POST', '/academy/api/login', { corpo: { email: HUGO.email, senha: 'nova-do-hugo-1', codigo: gov.totpAgora(g.json.secret) }, jar: 'hugo' })).st, 200);
    assert.equal((await req('POST', '/academy/api/me/2fa/desativar', { jar: 'hugo', corpo: { codigo: gov.totpAgora(g.json.secret) } })).st, 200);
    assert.equal((await req('POST', '/academy/api/login', { corpo: { email: HUGO.email, senha: 'nova-do-hugo-1' } })).st, 200, 'sem 2FA volta ao normal');
  });
  await t('headers de segurança presentes nas páginas do módulo', async () => {
    const r = await fetch(BASE + '/academy');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.ok(r.headers.get('referrer-policy'));
  });

  // ================= ACESSO DE CORTESIA / BETA (staff) =================
  console.log('\n— CORTESIA: acesso vitalício a tudo, revogável —');
  await t('conceder cortesia total libera produto pago sem pagar; revogar corta; reativar volta', async () => {
    const ct = require('./repo-conteudo');
    const dbT = require('./db').db;
    const email = 'cortesia@t.com';
    // há pelo menos um produto PAGO publicado (prodId = R$199)
    const pago = dbT.prepare("SELECT id FROM products WHERE status = 'publicado' AND preco_centavos > 0 LIMIT 1").get();
    assert.ok(pago, 'existe produto pago publicado');
    const pagoId = pago.id;
    // conceder cortesia total
    const c = await req('POST', '/staff/api/academy/cortesia', { corpo: { nome: 'Convidado Beta', email } });
    assert.equal(c.st, 200); assert.ok(c.json.ok);
    const uid = c.json.usuario.id;
    assert.equal(c.json.usuario.email, email);
    assert.ok(c.json.acesso.definir_senha_url.includes('/academy/redefinir-senha?token='), 'link definir-senha');
    assert.ok(c.json.acesso.painel_url.endsWith('/academy/app'), 'painel_url = área do aluno');
    assert.ok(c.json.acesso.produtos_liberados >= 1, 'liberou >= 1 produto');
    // flag de usuário ligada (acesso total)
    assert.equal(dbT.prepare('SELECT cortesia FROM users WHERE id = ?').get(uid).cortesia, 1, 'flag cortesia = 1');
    // acesso a produto PAGO sem ter comprado (nenhuma order)
    assert.equal(ct.temAcesso(uid, pagoId), true, 'ANTES: tem acesso ao produto pago sem pagar');
    assert.equal(dbT.prepare("SELECT COUNT(*) n FROM orders WHERE user_id = ? AND status = 'paga'").get(uid).n, 0, 'não houve compra');
    // acesso a produto FUTURO (publicado depois, SEM matrícula) — via flag
    const futuroId = require('./db').novoId();
    dbT.prepare("INSERT INTO products (id, producer_id, tipo, titulo, slug, preco_centavos, status, criado_em) VALUES (?,?,?,?,?,?, 'publicado', ?)")
      .run(futuroId, uid, 'curso', 'Curso Futuro', 'curso-futuro-selftest', 15000, new Date().toISOString());
    assert.equal(dbT.prepare('SELECT COUNT(*) n FROM enrollments WHERE user_id = ? AND product_id = ?').get(uid, futuroId).n, 0, 'sem matrícula no produto futuro');
    assert.equal(ct.temAcesso(uid, futuroId), true, 'flag libera produto futuro sem matrícula');
    // aparece na listagem, marcado como cortesia ativo
    const item = (await req('GET', '/staff/api/academy/cortesia')).json.acessos.find(a => a.id === uid);
    assert.ok(item && item.produtos_liberados >= 1 && item.ativo === true, 'listado como cortesia ativo');
    // o link definir-senha realmente define a senha e permite login
    const tok = decodeURIComponent(c.json.acesso.definir_senha_url.split('token=')[1]);
    assert.equal((await req('POST', '/academy/api/senha/redefinir', { corpo: { token: tok, senha: 'senha-cortesia-1' } })).st, 200);
    assert.equal((await req('POST', '/academy/api/login', { corpo: { email, senha: 'senha-cortesia-1' }, jar: 'convidado' })).st, 200);
    // REGRESSÃO (11/08/2026): a biblioteca tem que MOSTRAR o que a cortesia libera.
    // Ela listava só enrollments, então quem recebia acesso pela FLAG via "0 cursos"
    // — com o checkout dizendo "você já tem acesso" e nenhuma porta de entrada.
    const bib = await req('GET', '/academy/api/aluno/biblioteca', { jar: 'convidado' });
    assert.ok(bib.json.cursos.some(c => c.product_id === futuroId), 'produto liberado só pela flag aparece na biblioteca');
    assert.ok(bib.json.cursos.some(c => c.origem === 'cortesia'), 'e vem marcado como cortesia');
    assert.equal((await req('GET', `/academy/api/aluno/cursos/${futuroId}`, { jar: 'convidado' })).json.matriculado, true, 'e o player abre');
    // idempotente: conceder de novo não duplica matrícula
    assert.equal((await req('POST', '/staff/api/academy/cortesia', { corpo: { nome: 'Convidado Beta', email } })).st, 200);
    assert.equal(dbT.prepare('SELECT COUNT(*) n FROM enrollments WHERE user_id = ? AND product_id = ?').get(uid, pagoId).n, 1, 'sem matrícula duplicada');
    // revogar corta o acesso (flag=0 → produto pago E futuro perdem acesso)
    assert.equal((await req('POST', `/staff/api/academy/cortesia/${uid}/revogar`)).st, 200);
    assert.equal(dbT.prepare('SELECT cortesia FROM users WHERE id = ?').get(uid).cortesia, 0, 'flag cortesia = 0 após revogar');
    assert.equal(ct.temAcesso(uid, pagoId), false, 'DEPOIS de revogar: sem acesso ao produto pago');
    assert.equal(ct.temAcesso(uid, futuroId), false, 'DEPOIS de revogar: sem acesso ao produto futuro');
    assert.equal(((await req('GET', '/academy/api/aluno/biblioteca', { jar: 'convidado' })).json.cursos || [])
      .filter(c => c.origem === 'cortesia').length, 0, 'revogado: some da biblioteca também');
    assert.equal((await req('GET', '/staff/api/academy/cortesia')).json.acessos.find(a => a.id === uid).ativo, false, 'listado como inativo');
    // reativar volta a conceder
    assert.equal((await req('POST', `/staff/api/academy/cortesia/${uid}/reativar`)).st, 200);
    assert.equal(ct.temAcesso(uid, pagoId), true, 'DEPOIS de reativar: acesso restaurado');
    assert.equal(ct.temAcesso(uid, futuroId), true, 'DEPOIS de reativar: produto futuro liberado de novo');
  });
  await t('cortesia exige e-mail e guarda requireAuth+requireAdmin', async () => {
    assert.equal((await req('POST', '/staff/api/academy/cortesia', { corpo: { nome: 'Sem email' } })).st, 400);
    assert.equal((await req('GET', '/staff/api/academy/cortesia', { user: 'op' })).st, 403); // operador não-admin
  });

  console.log('\n— SEO das páginas públicas —');
  await t('curso publicado: canonical, preview grande, og dimensionado e schema Course', async () => {
    const ctx = require('./repo-conteudo');
    const slug = ctx.Produtos.obter(prodId).slug;
    const r = await req('GET', `/academy/cursos/${slug}`);
    assert.equal(r.st, 200);
    assert.ok(r.texto.includes('<link rel="canonical" href="http'), 'canonical absoluto');
    assert.ok(r.texto.includes(`/academy/cursos/${slug}"`), 'apontando para a própria página');
    assert.ok(r.texto.includes('name="robots" content="index,follow,max-image-preview:large"'), 'preview grande liberado');
    assert.ok(r.texto.includes('twitter:card'), 'cartão do Twitter/X');
    assert.ok(r.texto.includes('og:image:width'), 'dimensão da imagem — sem ela o WhatsApp corta');
    const bruto = r.texto.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(bruto, 'tem JSON-LD');
    const dados = JSON.parse(bruto[1]);
    const curso = Array.isArray(dados) ? dados.find((x) => x['@type'] === 'Course') : dados;
    assert.equal(curso['@type'], 'Course');
    assert.ok(curso.provider && curso.provider.name, 'declara o provedor');
    assert.equal(curso.offers.priceCurrency, 'BRL', 'preço em real');
    assert.ok(!curso.aggregateRating || Number(curso.aggregateRating.reviewCount) > 0,
      'nota só entra quando existe avaliação de verdade — marcar nota inventada é penalidade');
  });
  await t('marketplace: canonical e CollectionPage listando os cursos', async () => {
    const r = await req('GET', '/academy/marketplace');
    assert.ok(r.texto.includes('rel="canonical"'), 'canonical');
    const bruto = r.texto.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const ld = JSON.parse(bruto[1]);
    assert.equal(ld['@type'], 'CollectionPage');
    assert.equal(ld.mainEntity['@type'], 'ItemList');
    assert.ok(ld.mainEntity.itemListElement.length >= 1, 'lista os cursos publicados');
  });


  console.log('\n— categorias: um produto em mais de uma área —');
  await t('produto em duas áreas aparece nos dois filtros', async () => {
    const ctx = require('./repo-conteudo');
    const antes = ctx.Produtos.obter(prodId).categorias;
    ctx.Produtos.gravarCategorias(prodId, ['direito', 'tecnologia']);
    const p2 = ctx.Produtos.obter(prodId);
    assert.deepEqual(p2.categorias, ['direito', 'tecnologia']);
    assert.equal(p2.categoria, 'direito', 'a primeira é a principal (trilha, SEO, 1ª etiqueta)');
    assert.ok(ctx.Marketplace.listar({ categoria: 'direito' }).some(x => x.id === prodId));
    assert.ok(ctx.Marketplace.listar({ categoria: 'tecnologia' }).some(x => x.id === prodId), 'a área secundária também filtra');
    assert.ok(!ctx.Marketplace.listar({ categoria: 'eventos' }).some(x => x.id === prodId));
    const lista = ctx.Marketplace.listar({});
    assert.deepEqual((lista.find(x => x.id === prodId) || {}).categorias, ['direito', 'tecnologia'],
      'a vitrine leva as áreas: sem isso o cartão mostra só a principal');
    const mk = await req('GET', '/academy/marketplace');
    assert.ok(mk.texto.includes('>Tecnologia<'), 'a segunda área aparece no cartão');
    const pag = await req('GET', `/academy/cursos/${p2.slug}`);
    assert.ok(pag.texto.includes('categoria=direito') && pag.texto.includes('categoria=tecnologia'), 'a página do curso mostra as duas áreas');
    ctx.Produtos.gravarCategorias(prodId, antes.length ? antes : ['hospedagem']); // devolve o fixture
  });
  await t('slug inexistente é ignorado ao gravar as áreas', () => {
    const ctx = require('./repo-conteudo');
    const antes = ctx.Produtos.obter(prodId).categorias;
    const r = ctx.Produtos.gravarCategorias(prodId, ['nao-existe', antes[0]]);
    assert.deepEqual(r, [antes[0]], 'categoria inexistente sai, a boa fica');
  });
  await t('barra de áreas: só o que tem curso, com contagem e a ativa marcada', async () => {
    const r = await req('GET', '/academy/marketplace');
    assert.ok(r.texto.includes('pv-areas'), 'a barra de chips');
    assert.ok(r.texto.includes('Todas as áreas'));
    assert.ok(!/categoria=eventos/.test(r.texto), 'área sem curso publicado não vira filtro morto');
    const cat = require('./repo-conteudo').Produtos.obter(prodId).categoria;
    const f = await req('GET', `/academy/marketplace?categoria=${cat}`);
    assert.ok(f.texto.includes(`class="on" href="/academy/marketplace?categoria=${cat}"`), 'a área aberta fica destacada');
  });

  console.log('\n— área do aluno: estúdio, materiais e recomendação —');
  await t('assets do estúdio (aluno.js, aluno.css, publico.css) respondem', async () => {
    const js = await req('GET', '/academy/aluno.js');
    assert.equal(js.st, 200); assert.ok(js.ct.includes('javascript'));
    assert.ok(js.texto.includes('window.AcademyAluno'), 'o painel monta o módulo por este nome');
    for (const css of ['/academy/aluno.css', '/academy/publico.css']) {
      const r = await req('GET', css);
      assert.equal(r.st, 200); assert.ok(r.ct.includes('css'));
    }
    const app = await req('GET', '/academy/app');
    assert.ok(app.texto.includes('/academy/aluno.js'), 'o shell carrega o módulo do aluno');
    assert.ok(app.texto.includes('/academy/aluno.css'), 'e o CSS dele');
  });
  await t('curso do aluno traz autor e materiais com tipo e tamanho', async () => {
    const up = await req('POST', '/academy/api/produtor/upload', {
      jar: 'maria', corpo: { nome: 'anexo.pdf', mime: 'application/pdf', conteudo_base64: Buffer.from('%PDF-1.4 anexo do estudio').toString('base64') },
    });
    assert.equal(up.st, 200, up.texto);
    const aulas = (await req('GET', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria' })).json.estrutura[0].aulas;
    await req('POST', `/academy/api/produtor/produtos/${prodId}/aulas/${aulas[0].id}/materiais`, {
      jar: 'maria', corpo: { nome: 'Anexo da aula (PDF)', media_id: up.json.id },
    });
    const r = await req('GET', `/academy/api/aluno/cursos/${prodId}`, { jar: 'ana' });
    assert.equal(r.st, 200);
    assert.ok(r.json.produto.produtor_nome, 'o topo do estúdio mostra quem ensina');
    assert.ok('slug' in r.json.produto, 'o link para a página pública depende do slug');
    const mats = r.json.estrutura.flatMap(m => m.aulas).flatMap(a => a.materiais || []);
    assert.ok(mats.length, 'o curso de teste ganhou um material logo acima');
    assert.ok(mats.every(m => 'mime' in m && 'tamanho' in m), 'sem mime/tamanho o cartão do material fica sem tipo e sem peso');
  });
  // Material do CURSO (24/09/2026): a prateleira que não é de nenhuma aula.
  await t('material do curso: entra pelo produtor, aparece para quem tem o curso', async () => {
    const up = await req('POST', '/academy/api/produtor/upload', {
      jar: 'maria', corpo: { nome: 'caderno.pdf', mime: 'application/pdf', conteudo_base64: Buffer.from('%PDF-1.4 caderno do curso inteiro').toString('base64') },
    });
    const add = await req('POST', `/academy/api/produtor/produtos/${prodId}/material-curso`, {
      jar: 'maria', corpo: { nome: 'Caderno visual do curso (PDF)', descricao: 'Vale para o curso inteiro.', media_id: up.json.id },
    });
    assert.equal(add.st, 200, add.texto);
    const r = await req('GET', `/academy/api/aluno/cursos/${prodId}`, { jar: 'ana' });
    const mc = r.json.materiais_curso || [];
    assert.equal(mc.length, 1, 'a prateleira do curso tem de chegar na tela do aluno');
    assert.ok(mc[0].mime && 'tamanho' in mc[0], 'sem mime/tamanho o cartão fica sem tipo e sem peso');
    assert.ok(!mc[0].lesson_id, 'material do curso não pertence a aula nenhuma');
    // A porta dos BYTES: listar não é poder baixar. Sem o product_materials no
    // podeAcessar, o arquivo apareceria na lista e daria 404 no clique.
    const baixa = await req('GET', `/academy/api/media/${up.json.id}`, { jar: 'ana' });
    assert.equal(baixa.st, 200, 'aluno matriculado tem de conseguir baixar');
  });
  await t('material do curso: quem NÃO tem o curso não vê nem baixa', async () => {
    // Conta nova, sem compra nenhuma — criada aqui porque o "curioso" da suíte
    // só nasce mais adiante, e um teste que depende da ordem dos outros mente
    // no dia em que alguém reordenar.
    await req('POST', '/academy/api/signup', {
      jar: 'zeca', corpo: { nome: 'Zeca Sem Curso', email: 'zeca-sem-curso@t.com', senha: 'senha-forte-9', aceite_termos: true },
    });
    const r = await req('GET', `/academy/api/aluno/cursos/${prodId}`, { jar: 'zeca' });
    assert.equal(r.st, 200, 'a página do curso abre para qualquer aluno logado (é vitrine)');
    assert.equal((r.json.materiais_curso || []).length, 0, 'listar para quem não comprou é anunciar o que ele não pode baixar');
    const mid = (await req('GET', `/academy/api/produtor/produtos/${prodId}/material-curso`, { jar: 'maria' })).json.materiais[0].media_id;
    const baixa = await req('GET', `/academy/api/media/${mid}`, { jar: 'zeca' });
    assert.equal(baixa.st, 404, 'sem matrícula, os bytes não saem');
  });
  await t('material do curso: mesmo nome TROCA o arquivo (é versão nova, não cópia)', async () => {
    const up2 = await req('POST', '/academy/api/produtor/upload', {
      jar: 'maria', corpo: { nome: 'caderno-v2.pdf', mime: 'application/pdf', conteudo_base64: Buffer.from('%PDF-1.4 caderno revisado').toString('base64') },
    });
    const r = await req('POST', `/academy/api/produtor/produtos/${prodId}/material-curso`, {
      jar: 'maria', corpo: { nome: 'Caderno visual do curso (PDF)', media_id: up2.json.id },
    });
    assert.ok(r.json.substituido, 'republicar com o mesmo nome substitui');
    const lista = (await req('GET', `/academy/api/produtor/produtos/${prodId}/material-curso`, { jar: 'maria' })).json.materiais;
    assert.equal(lista.length, 1, 'não pode ficar duas versões na prateleira');
    assert.equal(lista[0].media_id, up2.json.id, 'o arquivo novo é o que fica');
  });
  await t('material do curso: remover tira da prateleira (e não colide com o material de AULA)', async () => {
    // Aqui morava um defeito de verdade: a rota de remover nasceu como
    // `/produtos/:id/materiais/:materialId`, IGUAL à que já existia para material
    // de AULA. O Express casa a primeira, e a minha nunca rodava — o produtor
    // clicava em remover e recebia "Material não encontrado". Achado só quando a
    // tela foi clicada de verdade; nenhum teste de API pegava, porque eu não
    // tinha testado o DELETE. Daí o caminho próprio `/material-curso`.
    const up = await req('POST', '/academy/api/produtor/upload', {
      jar: 'maria', corpo: { nome: 'descartavel.pdf', mime: 'application/pdf', conteudo_base64: Buffer.from('%PDF-1.4 vai sair').toString('base64') },
    });
    const add = await req('POST', `/academy/api/produtor/produtos/${prodId}/material-curso`, {
      jar: 'maria', corpo: { nome: 'Material descartável (PDF)', media_id: up.json.id },
    });
    const antes = (await req('GET', `/academy/api/produtor/produtos/${prodId}/material-curso`, { jar: 'maria' })).json.materiais.length;
    const del = await req('DELETE', `/academy/api/produtor/produtos/${prodId}/material-curso/${add.json.id}`, { jar: 'maria' });
    assert.equal(del.st, 200, del.texto);
    const depois = (await req('GET', `/academy/api/produtor/produtos/${prodId}/material-curso`, { jar: 'maria' })).json.materiais;
    assert.equal(depois.length, antes - 1, 'o material removido tem de sair da lista');
    assert.ok(!depois.some((m) => m.id === add.json.id));
    // E a rota do material de AULA continua inteira, no caminho dela.
    const aulas = (await req('GET', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria' })).json.estrutura[0].aulas;
    const matAula = await req('POST', `/academy/api/produtor/produtos/${prodId}/aulas/${aulas[0].id}/materiais`, {
      jar: 'maria', corpo: { nome: 'Anexo que sai (PDF)', media_id: up.json.id },
    });
    assert.equal((await req('DELETE', `/academy/api/produtor/produtos/${prodId}/materiais/${matAula.json.id}`, { jar: 'maria' })).st, 200,
      'a rota antiga, de material de AULA, não pode ter sido quebrada pela nova');
  });
  await t('material do curso: a rota STAFF responde pela PUBLISH_KEY (é a que o agente usa)', async () => {
    // Esta rota faltava no teste e quebrou em produção na primeira chamada: um
    // helper que não existe naquele arquivo derrubou o `iniciar` com 400. Rota
    // publicada sem teste é rota que o primeiro uso descobre.
    const emailProdutor = (await req('GET', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria' })).json ? MARIA.email : null;
    const q = `?produtor_email=${encodeURIComponent(emailProdutor)}&produto_id=${prodId}`;
    const r = await req('GET', `/staff/api/academy/materiais-curso${q}`, { chave: true, semUser: true });
    assert.equal(r.st, 200, r.texto);
    assert.ok(Array.isArray(r.json.materiais) && r.json.materiais.length, 'a prateleira do curso tem de vir pela chave');
    assert.equal(r.json.produto.id, prodId);
    const ruim = await req('GET', '/staff/api/academy/materiais-curso?produtor_email=nao@existe.com&produto_id=xxx', { chave: true, semUser: true });
    assert.equal(ruim.st, 400, 'produtor inexistente tem de falhar com mensagem, não com 500');
  });
  await t('material do curso: arquivo grande entra pelo upload direto (acima de 100 MB)', async () => {
    // O anexo de aula cabe em 10 MB porque viaja em base64 na requisição. O
    // caderno do curso jurídico tem 58 MB — e o pedido do Augusto foi "limite
    // mais de 100 MB". Quem resolve é o upload direto ao bucket, o mesmo do vídeo.
    const r = await req('POST', '/academy/api/produtor/upload-grande', {
      jar: 'maria', corpo: { nome: 'caderno-grande.pdf', mime: 'application/pdf', tamanho: 150 * 1024 * 1024 },
    });
    assert.ok(r.st === 200 || /storage|bucket|S3/i.test(r.texto || ''),
      `150 MB tem de ser aceito pelo upload direto (resposta: ${r.st} ${String(r.texto).slice(0, 120)})`);
    const pequeno = await req('POST', '/academy/api/produtor/upload', {
      jar: 'maria', corpo: { nome: 'grande-demais.pdf', mime: 'application/pdf', conteudo_base64: 'AA'.repeat(1) },
    });
    assert.equal(pequeno.st, 200, 'o caminho pequeno continua valendo para arquivo pequeno');
  });
  await t('continuar-de-onde-parou leva a capa (a biblioteca é visual)', async () => {
    const b = await req('GET', '/academy/api/aluno/biblioteca', { jar: 'ana' });
    assert.ok(b.json.continuar, 'ana já tocou uma aula');
    assert.ok('capa_media_id' in b.json.continuar);
  });
  await t('recomendados: não repete o que o aluno já tem e prioriza a mesma área', async () => {
    const r = await req('GET', '/academy/api/aluno/recomendados', { jar: 'ana' });
    assert.equal(r.st, 200);
    assert.ok(Array.isArray(r.json.cursos));
    assert.ok(!r.json.cursos.some(c => c.id === prodId), 'recomendar o curso já comprado é o erro clássico');
    assert.ok(r.json.cursos.every(c => c.motivo), 'cada recomendação explica por que apareceu');
  });
  await t('recomendados ancorados em um curso não devolvem a própria âncora', async () => {
    const r = await req('GET', `/academy/api/aluno/recomendados?product_id=${prodId}`, { jar: 'ana' });
    assert.equal(r.st, 200);
    assert.ok(!r.json.cursos.some(c => c.id === prodId));
  });
  await t('recomendação exige login de aluno', async () => {
    assert.equal((await req('GET', '/academy/api/aluno/recomendados')).st, 401);
  });
  await t('a vitrine conta aula = módulo, conteúdo = item (22 aulas, não 39)', async () => {
    const ctx = require('./repo-conteudo');
    const p2 = ctx.Produtos.obter(prodId);
    const resumo = ctx.Marketplace.resumoConteudo(prodId);
    assert.ok(resumo.total_aulas > resumo.modulos.length, 'o fixture tem mais de um item por módulo');
    const r = await req('GET', `/academy/cursos/${p2.slug}`);
    const nMod = resumo.modulos.length;
    assert.ok(r.texto.includes(nMod > 1 ? `${nMod} aulas` : `${nMod} aula`), 'o número de AULAS é o de módulos');
    assert.ok(r.texto.includes(`${resumo.total_aulas} conteúdos`), 'os itens aparecem como conteúdos');
    assert.ok(!r.texto.includes(`${resumo.total_aulas} aulas`), 'item nunca é chamado de aula — foi o que confundiu o autor');
  });
  await t('página do curso: currículo com duração/materiais e cartão de compra fixo', async () => {
    const slugPub = require('./db').db.prepare('SELECT slug FROM products WHERE id = ?').get(prodId).slug;
    const r = await req('GET', `/academy/cursos/${slugPub}`);
    assert.equal(r.st, 200);
    assert.ok(r.texto.includes('pv-compra'), 'cartão de compra');
    assert.ok(r.texto.includes('pv-curr'), 'currículo em sanfona');
    assert.ok(r.texto.includes('/academy/publico.css'), 'CSS das páginas públicas');
    assert.ok(/Certificado com validação pública/.test(r.texto), 'o que o aluno leva');
  });
  await t('landing mostra o catálogo (site comercial sem curso na home não vende)', async () => {
    const r = await req('GET', '/academy');
    assert.equal(r.st, 200);
    assert.ok(r.texto.includes('pv-vitrine'), 'vitrine de cursos na home');
    assert.ok(r.texto.includes('Cursos em destaque'));
  });
  await t('resumo do conteúdo conta vídeo, duração e materiais', async () => {
    const resumo = require('./repo-conteudo').Marketplace.resumoConteudo(prodId);
    assert.ok(resumo.total_aulas >= 2);
    assert.ok('total_videos' in resumo && 'total_seg' in resumo && 'total_materiais' in resumo);
    assert.ok(resumo.modulos[0].aulas.every(a => 'tipo' in a && 'materiais' in a));
  });

  console.log('\n— importação de curso (a grade inteira de uma vez) —');
  let impId = '';
  const CURSO = () => ({
    produtor_email: MARIA.email,
    produto: { titulo: 'Curso Importado', subtitulo: 'Sub do importado', tipo: 'curso',
      categoria: 'desenvolvimento-pessoal', descricao_curta: 'Curta', garantia_dias: 7 },
    modulos: [
      { titulo: 'Módulo A', aulas: [
        { titulo: 'Aula A1', tipo: 'video', duracao_min: 10, gratuita: true },
        { titulo: 'Aula A2', tipo: 'video', duracao_min: 5 },
      ] },
      { titulo: 'Módulo B', aulas: [{ titulo: 'Aula B1', tipo: 'texto', conteudo: 'texto da aula' }] },
    ],
    pagina_venda: { headline: 'Manchete do importado', beneficios: ['um', 'dois'] },
  });

  await t('importar cria produto + módulos + aulas, na ordem, em rascunho', async () => {
    const r = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: CURSO() });
    assert.equal(r.st, 200, r.texto);
    impId = r.json.produto.id;
    assert.equal(r.json.produto.status, 'rascunho', 'importar NUNCA publica');
    assert.equal(r.json.criou_produto, true);
    assert.equal(r.json.resumo.modulos, 2);
    assert.equal(r.json.resumo.aulas, 3);
    assert.equal(r.json.resumo.aulas_degustacao, 1);
    assert.equal(r.json.resumo.duracao_total_min, 15);
    assert.equal(r.json.resumo.pagina_venda, true);
    assert.deepEqual(r.json.estrutura.map(m => m.titulo), ['Módulo A', 'Módulo B']);
    const vis = await req('GET', `/academy/api/produtor/produtos/${impId}`, { jar: 'maria' });
    assert.equal(vis.st, 200, 'o produto é do produtor informado');
    assert.deepEqual(vis.json.estrutura[0].aulas.map(a => a.titulo), ['Aula A1', 'Aula A2'], 'ordem das aulas preservada');
    assert.equal(vis.json.estrutura[0].aulas[0].duracao_seg, 600);
  });

  await t('importar de novo ATUALIZA e não duplica', async () => {
    const r = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: CURSO() });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.criou_produto, false, 'reusa o produto pelo título');
    assert.equal(r.json.resumo.modulos_criados, 0);
    assert.equal(r.json.resumo.aulas_criadas, 0);
    assert.equal(r.json.resumo.aulas_atualizadas, 3);
    assert.equal(r.json.resumo.modulos, 2, 'continua com 2 módulos');
    assert.equal(r.json.resumo.aulas, 3, 'continua com 3 aulas');
  });

  await t('reimportar NÃO apaga a URL de vídeo já preenchida', async () => {
    const vis = await req('GET', `/academy/api/produtor/produtos/${impId}`, { jar: 'maria' });
    const a1 = vis.json.estrutura[0].aulas[0];
    assert.equal((await req('PATCH', `/academy/api/produtor/produtos/${impId}/aulas/${a1.id}`,
      { jar: 'maria', corpo: { url_externa: 'https://youtu.be/abc123' } })).st, 200);
    assert.equal((await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: CURSO() })).st, 200);
    const dep = await req('GET', `/academy/api/produtor/produtos/${impId}`, { jar: 'maria' });
    assert.equal(dep.json.estrutura[0].aulas[0].url_externa, 'https://youtu.be/abc123');
  });

  await t('material entra na aula certa e não duplica na reimportação', async () => {
    const pdf = Buffer.from('%PDF-1.4 material de teste').toString('base64');
    const corpo = { ...CURSO(), materiais: [{ aula_titulo: 'Aula A1', nome: 'Livro em PDF', mime: 'application/pdf', conteudo_base64: pdf }] };
    const r1 = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo });
    assert.equal(r1.st, 200, r1.texto);
    assert.equal(r1.json.resumo.materiais_criados, 1);
    const r2 = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo });
    assert.equal(r2.json.resumo.materiais_criados, 0);
    assert.equal(r2.json.resumo.materiais_ja_existentes, 1);
    const vis = await req('GET', `/academy/api/produtor/produtos/${impId}`, { jar: 'maria' });
    assert.equal(vis.json.estrutura[0].aulas[0].materiais.length, 1);
  });

  await t('capa entra pela importação (base64 → mídia do produtor) e sobrevive à reimportação sem capa', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
    const r = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true,
      corpo: { ...CURSO(), produto: { ...CURSO().produto, capa: { mime: 'image/png', conteudo_base64: png } } } });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.resumo.capa, true);
    const capaId = r.json.produto.capa_media_id;
    assert.ok(capaId, 'produto ficou com capa_media_id');
    assert.equal(dbx.prepare('SELECT owner_user_id FROM media_files WHERE id = ?').get(capaId).owner_user_id, r.json.produtor.id, 'a mídia é do produtor');
    const r2 = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: CURSO() });
    assert.equal(r2.json.resumo.capa, false);
    assert.equal(r2.json.produto.capa_media_id, capaId, 'reimportar sem capa não apaga a capa');
    const r3 = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true,
      corpo: { ...CURSO(), produto: { ...CURSO().produto, capa: { mime: 'application/pdf', conteudo_base64: png } } } });
    assert.equal(r3.st, 400, 'capa que não é imagem é recusada');
    assert.ok(/imagem/.test(r3.texto), r3.texto);
    const r4 = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true,
      corpo: { ...CURSO(), produto: { ...CURSO().produto, capa_media_id: 'nao-existe' } } });
    assert.equal(r4.st, 400, 'capa_media_id de mídia alheia/inexistente é recusado');
  });

  await t('material apontando para aula inexistente falha com o nome na mensagem', async () => {
    const corpo = { ...CURSO(), materiais: [{ aula_titulo: 'Aula que não existe', nome: 'X', mime: 'application/pdf', conteudo_base64: Buffer.from('%PDF').toString('base64') }] };
    const r = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo });
    assert.equal(r.st, 400);
    assert.ok(r.json.erro.includes('Aula que não existe'), r.json.erro);
  });

  await t('sem papel de produtor aprovado, recusa — e garantir_produtor resolve', async () => {
    const nova = { nome: 'Clara Autora', email: 'clara@t.com', senha: 'senha-forte-9', aceite_termos: true };
    assert.equal((await req('POST', '/academy/api/signup', { corpo: nova, jar: 'clara' })).st, 200);
    const base = { ...CURSO(), produtor_email: nova.email, produto: { ...CURSO().produto, titulo: 'Curso da Clara' } };
    const r = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: base });
    assert.equal(r.st, 400);
    assert.ok(r.json.erro.includes('produtor'), r.json.erro);
    const r2 = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: { ...base, garantir_produtor: true } });
    assert.equal(r2.st, 200, r2.texto);
    assert.equal((await req('GET', '/academy/api/produtor/dashboard', { jar: 'clara' })).st, 200, 'papel aprovado de verdade');
  });

  await t('e-mail sem conta na Academy recusa com a causa', async () => {
    const r = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: { ...CURSO(), produtor_email: 'ninguem@t.com' } });
    assert.equal(r.st, 400);
    assert.ok(r.json.erro.includes('ninguem@t.com'), r.json.erro);
  });

  await t('guarda da importação: sem chave e sem admin, 401/403', async () => {
    assert.equal((await req('POST', '/staff/api/academy/importar-curso', { semUser: true, corpo: CURSO() })).st, 401);
    assert.equal((await req('POST', '/staff/api/academy/importar-curso', { user: 'op', corpo: CURSO() })).st, 403);
    assert.equal((await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: 'chave-errada', corpo: CURSO() })).st, 401);
    assert.equal((await req('GET', '/staff/api/academy/produtores', { user: 'op' })).st, 403);
    assert.ok((await req('GET', '/staff/api/academy/produtores', { semUser: true, chave: true })).json.produtores.some(p => p.email === MARIA.email));
  });

  await t('o próprio produtor importa a grade pelo painel', async () => {
    const r = await req('POST', `/academy/api/produtor/produtos/${impId}/importar`, { jar: 'maria', corpo: {
      modulos: [...CURSO().modulos, { titulo: 'Módulo C', aulas: [{ titulo: 'Aula C1', tipo: 'video', duracao_min: 7 }] }],
    } });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.resumo.modulos_criados, 1);
    assert.equal(r.json.resumo.aulas_criadas, 1);
    assert.equal(r.json.estrutura.length, 3);
    const outro = await req('POST', `/academy/api/produtor/produtos/${impId}/importar`, { jar: 'clara', corpo: { modulos: CURSO().modulos } });
    assert.equal(outro.st, 400, 'anti-IDOR');
  });

  console.log('\n— vídeo e mídia das aulas pela chave (o mesmo ciclo do painel) —');
  const EST = (extra = {}) => ({ produtor_email: MARIA.email, produto_id: impId, ...extra });
  const estrutura = async () => (await req('GET', `/staff/api/academy/importar-curso/estrutura?produtor_email=${encodeURIComponent(MARIA.email)}&produto_id=${impId}`, { semUser: true, chave: true })).json;

  await t('estrutura pela chave devolve módulos, aulas, mídia e materiais do produto do produtor', async () => {
    const r = await estrutura();
    assert.equal(r.ok, true);
    assert.equal(r.produto.id, impId);
    assert.deepEqual(r.estrutura.map(m => m.titulo), ['Módulo A', 'Módulo B', 'Módulo C']);
    assert.equal(r.estrutura[0].aulas[0].materiais.length, 1, 'material do teste anterior aparece');
    assert.equal(r.pagina_venda.headline, 'Manchete do importado');
    const alheio = await req('GET', `/staff/api/academy/importar-curso/estrutura?produtor_email=clara@t.com&produto_id=${impId}`, { semUser: true, chave: true });
    assert.equal(alheio.st, 400, 'produto de outro produtor não aparece');
  });

  await t('titulo_anterior renomeia um módulo existente em vez de duplicar', async () => {
    const mods = CURSO().modulos;
    mods[0] = { ...mods[0], titulo: 'Módulo A renomeado', titulo_anterior: 'Módulo A' };
    const r = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: { ...CURSO(), modulos: mods } });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.resumo.modulos_criados, 0, 'absorveu o módulo antigo');
    assert.ok(r.json.estrutura.some(m => m.titulo === 'Módulo A renomeado'));
    assert.ok(!r.json.estrutura.some(m => m.titulo === 'Módulo A'));
    const volta = CURSO().modulos; volta[0] = { ...volta[0], titulo_anterior: 'Módulo A renomeado' };
    const r2 = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: { ...CURSO(), modulos: volta } });
    assert.equal(r2.json.resumo.modulos_criados, 0);
    assert.ok(r2.json.estrutura.some(m => m.titulo === 'Módulo A'), 'volta ao nome original');
  });

  // Mesma razão do módulo: sem isto, mudar o nome de uma aula cria OUTRA e deixa
  // a antiga órfã dentro do módulo — o aluno vê a aula velha logo abaixo da nova.
  await t('titulo_anterior renomeia uma AULA existente em vez de duplicar', async () => {
    const mods = CURSO().modulos;
    const aulaVelha = mods[0].aulas[0].titulo;
    mods[0] = { ...mods[0], aulas: [{ ...mods[0].aulas[0], titulo: 'Aula A renomeada', titulo_anterior: aulaVelha }, ...mods[0].aulas.slice(1)] };
    const r = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: { ...CURSO(), modulos: mods } });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.resumo.aulas_criadas, 0, 'absorveu a aula antiga');
    const m0 = (await estrutura()).estrutura.find(m => m.titulo === mods[0].titulo);
    assert.ok(m0.aulas.some(a => a.titulo === 'Aula A renomeada'), 'a aula ficou com o nome novo');
    assert.ok(!m0.aulas.some(a => a.titulo === aulaVelha), 'e a antiga não sobrou no módulo');
    const volta = CURSO().modulos;
    volta[0] = { ...volta[0], aulas: [{ ...volta[0].aulas[0], titulo_anterior: 'Aula A renomeada' }, ...volta[0].aulas.slice(1)] };
    const r2 = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: { ...CURSO(), modulos: volta } });
    assert.equal(r2.json.resumo.aulas_criadas, 0, 'e volta sem duplicar');
  });

  await t('vídeo pela chave: iniciar → PUT → confirmar vincula a mídia à aula certa', async () => {
    const storage = require('./storage');
    const real = { s3Ativo: storage.s3Ativo, presignS3: storage.presignS3, s3Existe: storage.s3Existe };
    const bucketFalso = new Map();
    storage.s3Ativo = () => true;
    storage.presignS3 = (cfg, met, key) => `https://fake.r2/${encodeURIComponent(key)}?met=${met}`;
    storage.s3Existe = async (key) => (bucketFalso.has(key) ? { tamanho: bucketFalso.get(key) } : null);
    try {
      const errada = await req('POST', '/staff/api/academy/importar-video', { semUser: true, chave: true,
        corpo: EST({ modulo_titulo: 'Módulo A', aula_titulo: 'Aula que não há', nome: 'a.mp4', mime: 'video/mp4', tamanho: 4096 }) });
      assert.equal(errada.st, 400); assert.ok(errada.json.erro.includes('Aula que não há'), errada.json.erro);

      const ini = await req('POST', '/staff/api/academy/importar-video', { semUser: true, chave: true,
        corpo: EST({ modulo_titulo: 'Módulo A', aula_titulo: 'Aula A2', nome: 'aula-a2.mp4', mime: 'video/mp4', tamanho: 4096 }) });
      assert.equal(ini.st, 200, ini.texto);
      assert.ok(ini.json.upload_url && ini.json.media_id, 'devolve URL presignada e o id da mídia');

      const cedo = await req('POST', `/staff/api/academy/importar-video/${ini.json.media_id}/confirmar`, { semUser: true, chave: true,
        corpo: EST({ modulo_titulo: 'Módulo A', aula_titulo: 'Aula A2' }) });
      assert.equal(cedo.st, 400); assert.ok(/ainda não chegou/i.test(cedo.json.erro), cedo.json.erro);

      bucketFalso.set(ini.json.media_id + '.mp4', 4096); // o PUT local aconteceu
      const ok = await req('POST', `/staff/api/academy/importar-video/${ini.json.media_id}/confirmar`, { semUser: true, chave: true,
        corpo: EST({ modulo_titulo: 'Módulo A', aula_titulo: 'Aula A2', duracao_seg: 123 }) });
      assert.equal(ok.st, 200, ok.texto);
      assert.equal(ok.json.aula.media_id, ini.json.media_id);
      assert.equal(ok.json.aula.duracao_seg, 123);
      assert.equal(ok.json.aula.tipo, 'video');

      const outro = await req('POST', `/staff/api/academy/importar-video/${ini.json.media_id}/confirmar`, { semUser: true, chave: true,
        corpo: { produtor_email: 'clara@t.com', produto_id: impId, modulo_titulo: 'Módulo A', aula_titulo: 'Aula A2' } });
      assert.equal(outro.st, 400, 'só o produtor dono do produto');

      const vis = await req('GET', `/academy/api/produtor/produtos/${impId}`, { jar: 'maria' });
      assert.equal(vis.json.estrutura[0].aulas[1].media_id, ini.json.media_id, 'o painel do produtor vê o vídeo na aula');
    } finally { Object.assign(storage, real); }
  });

  await t('mídia já confirmada (o PDF que entrou como material) vira a mídia de uma aula tipo pdf', async () => {
    const e = await estrutura();
    const pdfId = e.estrutura[0].aulas[0].materiais[0].media_id;
    const r = await req('POST', `/staff/api/academy/importar-video/${pdfId}/confirmar`, { semUser: true, chave: true,
      corpo: EST({ modulo_titulo: 'Módulo B', aula_titulo: 'Aula B1', tipo: 'pdf' }) });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.aula.tipo, 'pdf');
    assert.equal(r.json.aula.media_id, pdfId);
    assert.equal(r.json.aula.conteudo, 'texto da aula', 'o texto da aula não foi apagado');
  });

  await t('guarda das rotas de vídeo: sem chave 401, operador não-admin 403', async () => {
    assert.equal((await req('POST', '/staff/api/academy/importar-video', { semUser: true, corpo: EST() })).st, 401);
    assert.equal((await req('POST', '/staff/api/academy/importar-video', { user: 'op', corpo: EST() })).st, 403);
    assert.equal((await req('GET', `/staff/api/academy/importar-curso/estrutura?produtor_email=${MARIA.email}&produto_id=${impId}`, { user: 'op' })).st, 403);
  });

  console.log('\n— audiobook do curso (capítulos em áudio, só no player) —');
  const OUVINTE = { nome: 'Olga Ouvinte', email: 'olga@t.com', senha: 'senha-forte-9', aceite_termos: true };
  const CURIOSO = { nome: 'Caio Curioso', email: 'caio@t.com', senha: 'senha-forte-9', aceite_termos: true };
  const faixasIds = {};
  await t('capítulo pela chave: iniciar → PUT → confirmar; a ORDEM é a identidade (reenviar troca, não duplica)', async () => {
    const storage = require('./storage');
    const real = { s3Ativo: storage.s3Ativo, presignS3: storage.presignS3, s3Existe: storage.s3Existe };
    const bucketFalso = new Map();
    storage.s3Ativo = () => true;
    storage.presignS3 = (cfg, met, key) => `https://fake.r2/${encodeURIComponent(key)}?met=${met}`;
    storage.s3Existe = async (key) => (bucketFalso.has(key) ? { tamanho: bucketFalso.get(key) } : null);
    const sobe = async (ordem, titulo, extra = {}) => {
      const ini = await req('POST', '/staff/api/academy/importar-audio', { semUser: true, chave: true,
        corpo: EST({ nome: `cap-${ordem}.mp3`, mime: 'audio/mpeg', tamanho: 7000 }) });
      assert.equal(ini.st, 200, ini.texto);
      bucketFalso.set(ini.json.media_id + '.mp3', 7000);
      const ok = await req('POST', `/staff/api/academy/importar-audio/${ini.json.media_id}/confirmar`, { semUser: true, chave: true,
        corpo: EST({ ordem, titulo, duracao_seg: 600 + ordem, ...extra }) });
      assert.equal(ok.st, 200, ok.texto);
      return { media: ini.json.media_id, lista: ok.json.audiobook };
    };
    try {
      const video = await req('POST', '/staff/api/academy/importar-audio', { semUser: true, chave: true,
        corpo: EST({ nome: 'x.mp4', mime: 'video/mp4', tamanho: 10 }) });
      assert.equal(video.st, 400, 'só aceita áudio');
      await sobe(1, 'Apresentação', { amostra: true });
      await sobe(2, 'Segundo capítulo');
      const antes = await sobe(3, 'Terceiro');
      assert.deepEqual(antes.lista.map(f => f.ordem), [1, 2, 3]);
      const troca = await sobe(3, 'Terceiro (revisto)');
      assert.equal(troca.lista.length, 3, 'reenviar o capítulo 3 não cria um quarto');
      assert.equal(troca.lista[2].titulo, 'Terceiro (revisto)');
      assert.equal(troca.lista[2].media_id, troca.media, 'o áudio do 3 foi trocado');
      assert.equal(troca.lista[0].amostra, 1, 'a amostra do 1 continua');
      troca.lista.forEach(f => { faixasIds[f.ordem] = f.id; });
    } finally { Object.assign(storage, real); }
    const e = await estrutura();
    assert.equal(e.audiobook.length, 3, 'a estrutura pela chave mostra o audiobook');
  });

  await t('editar título sem reenviar o áudio; capítulo novo exige áudio; guarda da chave', async () => {
    const r = await req('POST', '/staff/api/academy/audiobook/capitulo', { semUser: true, chave: true, corpo: EST({ ordem: 2, titulo: 'Segundo, renomeado' }) });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.audiobook[1].titulo, 'Segundo, renomeado');
    assert.equal(r.json.audiobook[1].duracao_seg, 602, 'duração não foi apagada');
    const novo = await req('POST', '/staff/api/academy/audiobook/capitulo', { semUser: true, chave: true, corpo: EST({ ordem: 9, titulo: 'Sem áudio' }) });
    assert.equal(novo.st, 400, 'capítulo novo sem áudio é recusado');
    const alheio = await req('POST', '/staff/api/academy/audiobook/capitulo', { semUser: true, chave: true,
      corpo: { produtor_email: 'clara@t.com', produto_id: impId, ordem: 2, titulo: 'x' } });
    assert.equal(alheio.st, 400, 'só o produtor dono');
    assert.equal((await req('POST', '/staff/api/academy/importar-audio', { semUser: true, corpo: EST() })).st, 401);
    assert.equal((await req('POST', '/staff/api/academy/audiobook/capitulo', { user: 'op', corpo: EST({ ordem: 2 }) })).st, 403);
  });

  await t('aluno do curso ouve todos os capítulos; quem não comprou só a amostra', async () => {
    await req('POST', '/academy/api/signup', { corpo: OUVINTE, jar: 'olga' });
    await req('POST', '/academy/api/signup', { corpo: CURIOSO, jar: 'caio' });
    const mat = await req('POST', `/academy/api/produtor/produtos/${impId}/matricular`, { jar: 'maria', corpo: { email: OUVINTE.email } });
    assert.equal(mat.st, 200, mat.texto);

    const curso = await req('GET', `/academy/api/aluno/cursos/${impId}`, { jar: 'olga' });
    assert.equal(curso.st, 200, curso.texto);
    assert.deepEqual(curso.json.audiobook.map(f => f.liberada), [true, true, true]);
    assert.ok(!('media_id' in curso.json.audiobook[0]), 'o aluno não recebe o id da mídia');
    const link = await req('GET', `/academy/api/aluno/audiobook/${faixasIds[2]}/link`, { jar: 'olga' });
    assert.equal(link.st, 200, link.texto);
    assert.ok(link.json.url && link.json.expira_epoch, 'URL assinada com validade');

    const fora = await req('GET', `/academy/api/aluno/cursos/${impId}`, { jar: 'caio' });
    assert.deepEqual(fora.json.audiobook.map(f => f.liberada), [true, false, false], 'só a amostra liberada');
    assert.equal(fora.json.audiobook[1].titulo, 'Segundo, renomeado', 'mas vê os títulos (vitrine)');
    assert.equal((await req('GET', `/academy/api/aluno/audiobook/${faixasIds[1]}/link`, { jar: 'caio' })).st, 200, 'amostra toca');
    assert.equal((await req('GET', `/academy/api/aluno/audiobook/${faixasIds[2]}/link`, { jar: 'caio' })).st, 404, 'capítulo pago não');
    assert.equal((await req('GET', `/academy/api/aluno/audiobook/${faixasIds[2]}/link`, { semUser: true })).st, 401, 'sem login não');
  });

  await t('o áudio do audiobook NÃO sai pela rota genérica de mídia (só pelo player)', async () => {
    const e = await estrutura();
    const mid = e.audiobook[1].media_id;
    assert.equal((await req('GET', `/academy/api/media/${mid}`, { jar: 'olga' })).st, 404, 'nem para o aluno matriculado');
    assert.equal((await req('GET', `/academy/api/media/${mid}/link`, { jar: 'olga' })).st, 404);
  });

  // ================= EXPERIÊNCIA DE APRENDIZAGEM (fase 1) =================
  console.log('\n— experiência de aprendizagem: Tutor Villela, quiz, caderno, prompts, extras —');
  const INT = (extra = {}) => EST(extra);
  const QUESTAO = (tipo, certa = 1) => ({ tipo, enunciado: `Pergunta de ${tipo} sobre a aula`, alternativas: [0, 1, 2].map(k => ({
    texto: `alternativa ${k}`, correta: k === certa, explicacao: k === certa ? 'Certa porque segue o método da aula.' : 'Errada porque ignora a revisão humana.' })) });
  const quizA2 = { modulo_titulo: 'Módulo A', aula_titulo: 'Aula A2', questoes: [QUESTAO('conhecimento'), QUESTAO('aplicacao', 0), QUESTAO('decisao', 2)] };

  await t('importação recusa quiz ambíguo, sem explicação ou com tipo errado (quiz errado ensina errado)', async () => {
    const duas = { ...quizA2, questoes: [{ ...QUESTAO('conhecimento'), alternativas: QUESTAO('conhecimento').alternativas.map(a => ({ ...a, correta: true })) }] };
    let r = await req('POST', '/staff/api/academy/interativo/importar', { semUser: true, chave: true, corpo: INT({ quizzes: [duas] }) });
    assert.equal(r.st, 400); assert.ok(/exatamente UMA/.test(r.json.erro), r.texto);
    const semExp = { ...quizA2, questoes: [{ ...QUESTAO('conhecimento'), alternativas: QUESTAO('conhecimento').alternativas.map(a => ({ ...a, explicacao: '' })) }] };
    r = await req('POST', '/staff/api/academy/interativo/importar', { semUser: true, chave: true, corpo: INT({ quizzes: [semExp] }) });
    assert.equal(r.st, 400); assert.ok(/POR QUÊ/.test(r.json.erro));
    r = await req('POST', '/staff/api/academy/interativo/importar', { semUser: true, chave: true, corpo: INT({ quizzes: [{ ...quizA2, questoes: [QUESTAO('trivia')] }] }) });
    assert.equal(r.st, 400);
    assert.equal((await req('POST', '/staff/api/academy/interativo/importar', { semUser: true, corpo: INT({ quizzes: [quizA2] }) })).st, 401, 'sem chave');
    assert.equal((await req('POST', '/staff/api/academy/interativo/importar', { user: 'op', corpo: INT({ quizzes: [quizA2] }) })).st, 403);
  });

  await t('importa trechos, quiz, caderno, prompts e extras — tudo nasce em rascunho', async () => {
    const r = await req('POST', '/staff/api/academy/interativo/importar', { semUser: true, chave: true, corpo: INT({
      trechos: { itens: [
        { fonte: 'transcricao', modulo_titulo: 'Módulo A', aula_titulo: 'Aula A1', rotulo: 'Aula A1 · 0:30', ini_seg: 30, texto: 'Na degustação falamos da triagem de publicações com revisão humana obrigatória.' },
        { fonte: 'transcricao', modulo_titulo: 'Módulo A', aula_titulo: 'Aula A2', rotulo: 'Aula A2 · 2:10', ini_seg: 130, texto: 'O protocolo de conferência exige abrir o inteiro teor do acórdão antes de citar qualquer precedente.' },
        { fonte: 'livro', rotulo: 'Livro, cap. 7', texto: 'Capítulo sobre sigilo profissional e anonimização de dados de clientes antes de qualquer envio.' },
      ] },
      quizzes: [quizA2, { modulo_titulo: 'Módulo A', aula_titulo: 'Aula A1', questoes: [QUESTAO('conhecimento')] }],
      cadernos: [{ modulo_titulo: 'Módulo A', aula_titulo: 'Aula A2', aprendi: { resumo: 'Resumo da A2', pontos: ['p1', 'p2'] },
        pratiquei: { checklist: ['abrir o inteiro teor', 'anotar a fonte'], exercicio: 'Confira um precedente.', prompt_modelo: 'Atue como revisor…' },
        apliquei: { tarefas: ['t1', 't2', 't3'], desafio: 'Monte o seu protocolo.' }, resultado: { esperado: 'Um protocolo de uma página.' } }],
      prompts: { itens: [{ categoria: 'Pesquisa', titulo: 'Conferir precedente', objetivo: 'Checar', prompt: 'Você é um revisor jurídico. Confira o precedente…', exemplo: 'ex', personalizar: 'troque a área' }] },
      extras: [{ titulo: 'VERIDICA Cases', descricao: 'Casos jurídicos interativos.', status: 'em_breve', url: 'https://nao-deve-vazar.test' }],
    }) });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(r.json.importado, { trechos: 3, quizzes: 2, cadernos: 1, prompts: 1, extras: 1 });
    assert.ok(r.json.resumo.quizzes.every(q => q.status === 'rascunho'), 'importar nunca publica');
    assert.equal(r.json.resumo.extras[0].status, 'em_breve');
  });

  await t('rascunho: o aluno não vê; o dono do curso vê para revisar', async () => {
    const e = await estrutura();
    const a2 = e.estrutura[0].aulas.find(a => a.titulo === 'Aula A2').id;
    assert.equal((await req('GET', `/academy/api/aluno/aulas/${a2}/quiz`, { jar: 'olga' })).st, 404);
    const dono = await req('GET', `/academy/api/aluno/aulas/${a2}/quiz`, { jar: 'maria' });
    assert.equal(dono.st, 200, dono.texto);
    assert.equal(dono.json.status, 'rascunho');
    const res = await req('GET', `/academy/api/aluno/cursos/${impId}/interativo`, { jar: 'olga' });
    assert.equal(res.st, 200, res.texto);
    assert.deepEqual(res.json.quiz, {}, 'aluno não enxerga quiz em rascunho');
    assert.equal(res.json.extras[0].titulo, 'VERIDICA Cases');
    assert.equal(res.json.extras[0].url, '', 'extra "em breve" não expõe link');
    assert.equal(res.json.tutor.nome, 'Tutor Villela');
  });

  await t('publicado: quiz vai SEM gabarito, correção no servidor explica cada alternativa', async () => {
    const pub = await req('POST', '/staff/api/academy/interativo/status', { semUser: true, chave: true, corpo: INT({ quizzes: 'publicado', cadernos: 'publicado', prompts: 'publicado' }) });
    assert.equal(pub.st, 200, pub.texto);
    const e = await estrutura();
    const a2 = e.estrutura[0].aulas.find(a => a.titulo === 'Aula A2').id;
    const q = await req('GET', `/academy/api/aluno/aulas/${a2}/quiz`, { jar: 'olga' });
    assert.equal(q.st, 200, q.texto);
    assert.equal(q.json.questoes.length, 3);
    assert.ok(!/correta|explicacao|Certa porque/.test(q.texto), 'o gabarito não vai para o navegador');
    const parcial = await req('POST', `/academy/api/aluno/aulas/${a2}/quiz`, { jar: 'olga', corpo: { respostas: { q1: 1 } } });
    assert.equal(parcial.st, 400, 'precisa responder tudo');
    const r = await req('POST', `/academy/api/aluno/aulas/${a2}/quiz`, { jar: 'olga', corpo: { respostas: { q1: 1, q2: 1, q3: 2 } } });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.acertos, 2); assert.equal(r.json.total, 3); assert.equal(r.json.pct, 67);
    assert.equal(r.json.correcao[1].correta, 0, 'mostra a certa depois de responder');
    assert.ok(r.json.correcao[1].explicacoes.every(x => x.length > 10), 'explicação de CADA alternativa');
    const res = await req('GET', `/academy/api/aluno/cursos/${impId}/interativo`, { jar: 'olga' });
    assert.equal(res.json.quiz[a2].melhor_pct, 66, 'guarda o melhor resultado');
    // quem não comprou: só o quiz da aula de degustação
    assert.equal((await req('GET', `/academy/api/aluno/aulas/${a2}/quiz`, { jar: 'caio' })).st, 404);
    const a1 = e.estrutura[0].aulas.find(a => a.titulo === 'Aula A1').id;
    assert.equal((await req('GET', `/academy/api/aluno/aulas/${a1}/quiz`, { jar: 'caio' })).st, 200, 'degustação libera o quiz');
  });

  await t('caderno: o aluno escreve, o campo é validado e o caderno imprime com as respostas', async () => {
    const e = await estrutura();
    const a2 = e.estrutura[0].aulas.find(a => a.titulo === 'Aula A2').id;
    const c = await req('GET', `/academy/api/aluno/aulas/${a2}/caderno`, { jar: 'olga' });
    assert.equal(c.st, 200, c.texto);
    assert.equal(c.json.caderno.apliquei.tarefas.length, 3);
    assert.equal((await req('PUT', `/academy/api/aluno/aulas/${a2}/caderno`, { jar: 'olga', corpo: { campo: 'tarefa_2', texto: 'Minha resposta <b>forte</b>' } })).st, 200);
    assert.equal((await req('PUT', `/academy/api/aluno/aulas/${a2}/caderno`, { jar: 'olga', corpo: { campo: 'check_1', texto: '1' } })).st, 200);
    assert.equal((await req('PUT', `/academy/api/aluno/aulas/${a2}/caderno`, { jar: 'olga', corpo: { campo: 'inventado', texto: 'x' } })).st, 400);
    assert.equal((await req('PUT', `/academy/api/aluno/aulas/${a2}/caderno`, { jar: 'caio', corpo: { campo: 'tarefa_1', texto: 'x' } })).st, 404, 'sem acesso não escreve');
    const de_novo = await req('GET', `/academy/api/aluno/aulas/${a2}/caderno`, { jar: 'olga' });
    assert.equal(de_novo.json.respostas.tarefa_2, 'Minha resposta <b>forte</b>');
    const pag = await req('GET', `/academy/aluno/caderno/${impId}`, { jar: 'olga' });
    assert.equal(pag.st, 200, pag.texto);
    assert.ok(pag.texto.includes('Minha resposta &lt;b&gt;forte&lt;/b&gt;'), 'resposta escapada no caderno impresso');
    assert.ok(pag.texto.includes('☑ abrir o inteiro teor'), 'checklist marcado aparece marcado');
  });

  await t('prompts: só para quem tem acesso', async () => {
    const r = await req('GET', `/academy/api/aluno/cursos/${impId}/prompts`, { jar: 'olga' });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.prompts[0].titulo, 'Conferir precedente');
    assert.equal((await req('GET', `/academy/api/aluno/cursos/${impId}/prompts`, { jar: 'caio' })).st, 403);
  });

  await t('Tutor Villela: responde com os trechos do curso, cita a fonte e respeita o acesso', async () => {
    let ultimo = '';
    const iaM = require('./ia');
    iaM.__mockParaTeste(async ({ agente, prompt }) => {
      ultimo = prompt;
      if (agente !== 'tutor') return { json: {} };
      return { json: { resposta: 'Confira o inteiro teor antes de citar [1].', fontes: [1, 99], nao_encontrado: false, sugestoes: ['E se o acórdão não abrir?'] } };
    });
    try {
      const e = await estrutura();
      const a1 = e.estrutura[0].aulas.find(a => a.titulo === 'Aula A1').id;
      const r = await req('POST', '/academy/api/aluno/tutor/perguntar', { jar: 'olga', corpo: { product_id: impId, pergunta: 'Preciso conferir o inteiro teor do acórdão?' } });
      assert.equal(r.st, 200, r.texto);
      assert.ok(ultimo.includes('inteiro teor do acórdão'), 'o trecho certo foi para o contexto');
      assert.ok(ultimo.includes('TUTOR VILLELA'));
      assert.equal(r.json.fontes.length, 1, 'fonte inexistente (99) é descartada');
      assert.equal(r.json.fontes[0].ini_seg, 130, 'a fonte leva o ponto do vídeo');
      assert.ok(!('texto' in r.json.fontes[0]), 'o texto do trecho não vai na resposta');
      const conv = await req('GET', `/academy/api/aluno/tutor/${impId}/conversa`, { jar: 'olga' });
      assert.equal(conv.json.conversa.length, 1, 'a conversa fica guardada');
      // quem não comprou: sem aula de degustação, não conversa; na degustação, só com os trechos dela
      assert.equal((await req('POST', '/academy/api/aluno/tutor/perguntar', { jar: 'caio', corpo: { product_id: impId, pergunta: 'sigilo profissional' } })).st, 403);
      const deg = await req('POST', '/academy/api/aluno/tutor/perguntar', { jar: 'caio', corpo: { product_id: impId, lesson_id: a1, pergunta: 'sigilo profissional e acórdão' } });
      assert.equal(deg.st, 200, deg.texto);
      assert.ok(!ultimo.includes('anonimização') && !ultimo.includes('inteiro teor do acórdão'), 'livro e aula paga ficam fora do contexto de quem não comprou');
      assert.ok(ultimo.includes('triagem de publicações'), 'mas a aula de degustação entra');
    } finally { iaM.__mockParaTeste(null); }
  });
  await t('remover material pela chave: sai da lista do aluno; só o dono; guarda da chave', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');
    const imp = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: { ...CURSO(),
      materiais: [{ aula_titulo: 'Aula A2', nome: 'Artigo antigo (PDF)', mime: 'application/pdf', conteudo_base64: pdf }] } });
    assert.equal(imp.st, 200, imp.texto);
    const a2 = (await estrutura()).estrutura[0].aulas.find(a => a.titulo === 'Aula A2');
    const mat = a2.materiais.find(m => m.nome === 'Artigo antigo (PDF)');
    assert.ok(mat, 'material criado para o teste');
    assert.equal((await req('POST', '/staff/api/academy/material/remover', { semUser: true, corpo: EST({ material_id: mat.id }) })).st, 401);
    assert.equal((await req('POST', '/staff/api/academy/material/remover', { user: 'op', corpo: EST({ material_id: mat.id }) })).st, 403);
    const alheio = await req('POST', '/staff/api/academy/material/remover', { semUser: true, chave: true, corpo: { produtor_email: 'clara@t.com', produto_id: impId, material_id: mat.id } });
    assert.equal(alheio.st, 400, 'só o produtor dono');
    const r = await req('POST', '/staff/api/academy/material/remover', { semUser: true, chave: true, corpo: EST({ material_id: mat.id }) });
    assert.equal(r.st, 200, r.texto);
    const depois = (await estrutura()).estrutura[0].aulas.find(a => a.titulo === 'Aula A2');
    assert.ok(!depois.materiais.some(m => m.id === mat.id), 'saiu da aula');
    assert.equal((await req('POST', '/staff/api/academy/material/remover', { semUser: true, chave: true, corpo: EST({ material_id: mat.id }) })).st, 400, 'remover de novo = não encontrado');
  });
  // ================= JORNADA (fases 2 e 3) =================
  console.log('\n— jornada: diagnóstico, XP/selos, Villela Lab, desafio, simulações, recursos, ferramentas —');
  const QA = (i, comp) => ({ tipo: 'conhecimento', competencia: comp, enunciado: `Questão de avaliação número ${i}`, alternativas: [
    { texto: `certa ${i}`, correta: true, explicacao: 'Certa: é o método do curso.' },
    { texto: `errada ${i}a`, correta: false, explicacao: 'Errada: pula a revisão humana.' },
    { texto: `errada ${i}b`, correta: false, explicacao: 'Errada: confia sem conferir.' }] });
  const SIM = (extra = {}) => ({ id: 'caso-1', titulo: 'O cliente com pressa', resumo: 'Decida sob pressão.', papel: 'advogado', contexto: 'Um cliente chega às 18h.', inicio: 'a', nos: {
    a: { texto: 'O cliente quer a peça hoje. O que você faz?', opcoes: [
      { texto: 'Pede os documentos e confere', vai_para: 'b', feedback: 'Conferir antes evita o erro caro.', pontos: 10 },
      { texto: 'Pede à IA e protocola direto', vai_para: 'ruim', feedback: 'Sem conferência, o precedente inventado passou.', pontos: 0 }] },
    b: { texto: 'Os documentos chegaram. E agora?', opcoes: [
      { texto: 'Revisa por blocos', vai_para: 'otimo', feedback: 'Revisão por blocos pega a falha lógica.', pontos: 10 },
      { texto: 'Assina sem ler', vai_para: 'ruim', feedback: 'A assinatura é sua responsabilidade.', pontos: 0 }] },
    otimo: { texto: 'A peça saiu certa e no prazo.', final: { desfecho: 'otimo', licao: 'Método por etapas vence a pressa.' } },
    ruim: { texto: 'O juiz apontou o erro.', final: { desfecho: 'ruim', licao: 'Nunca pule a conferência.' } } }, ...extra });
  const JORNADA = () => EST({
    competencias: { itens: [{ id: 'pesquisa', nome: 'Pesquisa com fonte', icone: '🔎', aulas: [{ modulo_titulo: 'Módulo A', aula_titulo: 'Aula A2' }] }] },
    avaliacao: { titulo: 'Teste o seu nível', questoes: [1, 2, 3, 4, 5].map(i => QA(i, i <= 3 ? 'pesquisa' : '')) },
    lab: { missoes: [
      { id: 'm1', titulo: 'Analise um contrato', objetivo: 'Achar 3 riscos', entregaveis: [{ id: 'riscos', rotulo: 'Os três riscos' }, { id: 'prompt', rotulo: 'O prompt usado' }],
        rubrica: [{ criterio: 'Riscos concretos' }, { criterio: 'Prompt reutilizável' }] },
      { id: 'pf', tipo: 'projeto', titulo: 'Projeto final', entregaveis: [{ id: 'problema', rotulo: 'Problema' }], rubrica: [{ criterio: 'Problema real' }, { criterio: 'Resultado medido' }] }] },
    desafio: { titulo: 'Desafio de 7 dias', dias: [1, 2, 3, 4, 5, 6, 7].map(d => ({ titulo: `Dia ${d}`, tarefa: `Faça a tarefa prática do dia ${d} com calma.` })) },
    simulacoes: { itens: [SIM()] },
    recursos: { itens: [
      { tipo: 'cheatsheet', titulo: 'Cheat sheet do prompt', secoes: [{ titulo: 'Estrutura', itens: ['Função', 'Contexto <b>x</b>'] }] },
      { tipo: 'template', titulo: 'Template de agente', corpo: 'Você é o agente [NOME]. Missão: [MISSÃO]. Nunca invente números.' }] },
  });

  await t('jornada: importação recusa simulação com ciclo/destino inexistente, lab sem rubrica e competência inexistente', async () => {
    const imp = (corpo) => req('POST', '/staff/api/academy/jornada/importar', { semUser: true, chave: true, corpo });
    const ciclo = SIM(); ciclo.nos.b.opcoes[1].vai_para = 'a';
    let r = await imp(EST({ simulacoes: { itens: [ciclo] } }));
    assert.equal(r.st, 400); assert.ok(/ciclo/.test(r.json.erro), r.texto);
    const sumido = SIM(); sumido.nos.a.opcoes[0].vai_para = 'nao-existe';
    r = await imp(EST({ simulacoes: { itens: [sumido] } }));
    assert.equal(r.st, 400); assert.ok(/não existe/.test(r.json.erro));
    const solto = SIM(); solto.nos.orfao = { texto: 'Ninguém chega aqui nunca.', final: { desfecho: 'bom' } };
    r = await imp(EST({ simulacoes: { itens: [solto] } }));
    assert.equal(r.st, 400); assert.ok(/ninguém alcança/.test(r.json.erro));
    r = await imp(EST({ lab: { missoes: [{ id: 'x', titulo: 'Sem rubrica', entregaveis: [{ rotulo: 'algo' }], rubrica: [{ criterio: 'só um' }] }] } }));
    assert.equal(r.st, 400); assert.ok(/rubrica/.test(r.json.erro));
    r = await imp(EST({ competencias: JORNADA().competencias, avaliacao: { questoes: [1, 2, 3, 4, 5].map(i => QA(i, 'inventada')) } }));
    assert.equal(r.st, 400); assert.ok(/não existe/.test(r.json.erro));
    assert.equal((await req('POST', '/staff/api/academy/jornada/importar', { semUser: true, corpo: JORNADA() })).st, 401, 'sem chave');
  });

  await t('jornada: tudo nasce em rascunho — aluno não vê, dono do curso vê', async () => {
    const r = await req('POST', '/staff/api/academy/jornada/importar', { semUser: true, chave: true, corpo: JORNADA() });
    assert.equal(r.st, 200, r.texto);
    assert.ok(Object.values(r.json.importado).every(s => s === 'rascunho'), 'importar nunca publica');
    const al = await req('GET', `/academy/api/aluno/cursos/${impId}/jornada`, { jar: 'olga' });
    assert.equal(al.st, 200, al.texto);
    assert.deepEqual(al.json.secoes, {}, 'aluno não enxerga rascunho');
    assert.equal((await req('GET', `/academy/api/aluno/cursos/${impId}/lab`, { jar: 'olga' })).st, 404);
    const dono = await req('GET', `/academy/api/aluno/cursos/${impId}/jornada`, { jar: 'maria' });
    assert.equal(dono.json.secoes.lab, 'rascunho', 'o dono revisa na tela');
    const pub = await req('POST', '/staff/api/academy/jornada/status', { semUser: true, chave: true, corpo: EST({ todas: 'publicado' }) });
    assert.equal(pub.st, 200, pub.texto);
    assert.equal((await req('GET', `/academy/api/aluno/cursos/${impId}/jornada`, { jar: 'caio' })).json.acesso, false, 'quem não comprou não tem jornada');
    assert.equal((await req('GET', `/academy/api/aluno/cursos/${impId}/lab`, { jar: 'caio' })).st, 403);
  });

  await t('diagnóstico: sem gabarito no navegador, corrige no servidor, dá nível e trilha; é feito uma vez só', async () => {
    const q = await req('GET', `/academy/api/aluno/cursos/${impId}/avaliacao/diagnostico`, { jar: 'olga' });
    assert.equal(q.st, 200, q.texto);
    assert.ok(!/correta|explicacao|método do curso/.test(q.texto), 'nem gabarito nem explicação antes de responder');
    assert.equal((await req('POST', `/academy/api/aluno/cursos/${impId}/avaliacao/diagnostico`, { jar: 'olga', corpo: { respostas: { a1: 0 } } })).st, 400, 'responder tudo');
    // erra as 3 de "pesquisa", acerta as outras duas
    const resp = {};
    q.json.questoes.forEach((x, i) => { resp[x.id] = x.alternativas.findIndex(t => (i < 3 ? /^errada/ : /^certa/).test(t)); });
    const r = await req('POST', `/academy/api/aluno/cursos/${impId}/avaliacao/diagnostico`, { jar: 'olga', corpo: { respostas: resp } });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.pct, 40); assert.equal(r.json.nivel, 'Praticante');
    assert.equal(r.json.por_competencia.pesquisa.pct, 0);
    assert.equal(r.json.recomendacao[0].competencia, 'pesquisa', 'recomenda a competência mais fraca');
    assert.equal(r.json.recomendacao[0].aulas[0].titulo, 'Aula A2');
    assert.ok(r.json.correcao[0].explicacoes.every(x => x.length > 10));
    assert.equal((await req('GET', `/academy/api/aluno/cursos/${impId}/avaliacao/diagnostico`, { jar: 'olga' })).st, 409, 'diagnóstico é o ponto de partida: uma vez só');
  });

  await t('teste final só abre com 70% das aulas — e mostra o antes e o depois', async () => {
    const e = await estrutura();
    const aulas = e.estrutura.flatMap(m => m.aulas);
    await req('POST', `/academy/api/aluno/aulas/${aulas[0].id}/progresso`, { jar: 'olga', corpo: { concluida: false } });
    const trav = await req('GET', `/academy/api/aluno/cursos/${impId}/avaliacao/final`, { jar: 'olga' });
    assert.equal(trav.st, 409, trav.texto);
    for (const a of aulas) await req('POST', `/academy/api/aluno/aulas/${a.id}/progresso`, { jar: 'olga', corpo: { concluida: true } });
    const q = await req('GET', `/academy/api/aluno/cursos/${impId}/avaliacao/final`, { jar: 'olga' });
    assert.equal(q.st, 200, q.texto);
    const resp = {};
    q.json.questoes.forEach(x => { resp[x.id] = x.alternativas.findIndex(t => /^certa/.test(t)); });
    const r = await req('POST', `/academy/api/aluno/cursos/${impId}/avaliacao/final`, { jar: 'olga', corpo: { respostas: resp } });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.pct, 100); assert.equal(r.json.nivel, 'Especialista');
    assert.equal(r.json.antes.pct, 40, 'traz o diagnóstico para comparar');
  });

  await t('selo por competência: sai quando o quiz das aulas dela passa de 70%; XP e nível são derivados', async () => {
    const e = await estrutura();
    const a2 = e.estrutura[0].aulas.find(a => a.titulo === 'Aula A2').id;
    let p = (await req('GET', `/academy/api/aluno/cursos/${impId}/jornada`, { jar: 'olga' })).json;
    assert.equal(p.selos[0].conquistado, false, '67% no quiz ainda não dá o selo');
    const xpAntes = p.xp;
    await req('POST', `/academy/api/aluno/aulas/${a2}/quiz`, { jar: 'olga', corpo: { respostas: { q1: 1, q2: 0, q3: 2 } } });
    p = (await req('GET', `/academy/api/aluno/cursos/${impId}/jornada`, { jar: 'olga' })).json;
    assert.equal(p.selos[0].conquistado, true);
    assert.ok(p.xp > xpAntes, 'passar no quiz rende XP');
    assert.ok(p.medalhas.find(m => m.id === 'evolucao').ok, 'medalha de evolução (40 → 100)');
    assert.ok(p.nivel.n >= 1 && p.xp_max > p.xp);
  });

  await t('Villela Lab: salva, só entrega completo, mentor de IA avalia pela rubrica (indicação)', async () => {
    const base = `/academy/api/aluno/cursos/${impId}/lab`;
    assert.equal((await req('PUT', `${base}/m1`, { jar: 'olga', corpo: { respostas: { riscos: 'Multa sem teto, foro distante e renovação automática sem aviso.', prompt: 'curto' } } })).st, 200);
    const inc = await req('POST', `${base}/m1/entregar`, { jar: 'olga' });
    assert.equal(inc.st, 400); assert.ok(/O prompt usado/.test(inc.json.erro), inc.texto);
    assert.equal((await req('POST', `${base}/m1/mentor`, { jar: 'olga' })).st, 400, 'mentor só depois de entregar');
    await req('PUT', `${base}/m1`, { jar: 'olga', corpo: { respostas: { riscos: 'Multa sem teto, foro distante e renovação automática sem aviso.', prompt: 'Você é revisor de contratos. Liste os três maiores riscos…' } } });
    assert.equal((await req('POST', `${base}/m1/entregar`, { jar: 'olga' })).st, 200);
    let ultimo = '';
    const iaM = require('./ia');
    iaM.__mockParaTeste(async ({ agente, prompt }) => {
      ultimo = prompt;
      return { json: { criterios: [{ criterio: 'Riscos concretos', avaliacao: 'atende', comentario: 'Citou a multa sem teto.' }, { criterio: 'Prompt reutilizável', avaliacao: 'inventado', comentario: 'ok' }],
        pontos_fortes: ['claro'], melhorias: ['dê exemplo'], proximo_passo: 'Teste com outro contrato.', resumo: 'Boa entrega.' } };
    });
    try {
      const r = await req('POST', `${base}/m1/mentor`, { jar: 'olga' });
      assert.equal(r.st, 200, r.texto);
      assert.ok(ultimo.includes('MENTOR') && ultimo.includes('Multa sem teto') && ultimo.includes('Riscos concretos'), 'a entrega e a rubrica vão para o mentor');
      assert.equal(r.json.feedback.criterios[1].avaliacao, 'parcial', 'avaliação fora da lista vira "parcial"');
      const lab = await req('GET', base, { jar: 'olga' });
      assert.equal(lab.json.entregas.m1.feedback.resumo, 'Boa entrega.', 'o feedback fica guardado');
      const p = (await req('GET', `/academy/api/aluno/cursos/${impId}/jornada`, { jar: 'olga' })).json;
      assert.ok(p.medalhas.find(m => m.id === 'mao-na-massa').ok);
    } finally { iaM.__mockParaTeste(null); }
  });

  await t('desafio: começa hoje, o dia 1 abre, o dia 2 só amanhã, e a anotação é obrigatória', async () => {
    const base = `/academy/api/aluno/cursos/${impId}/desafio`;
    const antes = await req('GET', base, { jar: 'olga' });
    assert.equal(antes.json.iniciado_em, null);
    const ini = await req('POST', `${base}/iniciar`, { jar: 'olga' });
    assert.equal(ini.st, 200, ini.texto);
    assert.equal(ini.json.dia_atual, 1);
    assert.equal((await req('POST', `${base}/checkin`, { jar: 'olga', corpo: { dia: 1, nota: 'ok' } })).st, 400, 'anotação curta');
    const c1 = await req('POST', `${base}/checkin`, { jar: 'olga', corpo: { dia: 1, nota: 'Escrevi meu primeiro prompt com os sete blocos.' } });
    assert.equal(c1.st, 200, c1.texto); assert.equal(c1.json.feitos, 1);
    assert.equal((await req('POST', `${base}/checkin`, { jar: 'olga', corpo: { dia: 2, nota: 'Tentando adiantar o dia dois.' } })).st, 409, 'um dia de cada vez');
  });

  await t('simulação: o navegador não vê consequências nem caminhos; o fim traz o debriefing', async () => {
    const base = `/academy/api/aluno/cursos/${impId}/simulacoes`;
    const ini = await req('POST', `${base}/caso-1/iniciar`, { jar: 'olga' });
    assert.equal(ini.st, 200, ini.texto);
    assert.ok(!/vai_para|feedback|pontos"\s*:\s*10|Conferir antes/.test(JSON.stringify(ini.json.no)), 'a consequência só aparece depois da escolha');
    assert.equal(ini.json.pontos_max, 20);
    const e1 = await req('POST', `${base}/partidas/${ini.json.partida}`, { jar: 'olga', corpo: { opcao: 0 } });
    assert.equal(e1.st, 200, e1.texto);
    assert.equal(e1.json.feedback, 'Conferir antes evita o erro caro.');
    assert.equal(e1.json.terminou, false);
    const e2 = await req('POST', `${base}/partidas/${ini.json.partida}`, { jar: 'olga', corpo: { opcao: 0 } });
    assert.equal(e2.json.terminou, true); assert.equal(e2.json.pontos, 20);
    assert.equal(e2.json.no.final.desfecho, 'otimo');
    assert.equal(e2.json.caminho.length, 2, 'debriefing com as duas decisões');
    assert.equal((await req('POST', `${base}/partidas/${ini.json.partida}`, { jar: 'olga', corpo: { opcao: 0 } })).st, 409, 'partida encerrada');
    assert.equal((await req('POST', `${base}/partidas/${ini.json.partida}`, { jar: 'maria', corpo: { opcao: 0 } })).st, 404, 'a partida é do aluno');
    const lista = await req('GET', base, { jar: 'olga' });
    assert.equal(lista.json.itens[0].melhor, 20);
  });

  await t('recursos: cheat sheet em página própria (escapada) e template; só para quem tem acesso', async () => {
    const r = await req('GET', `/academy/api/aluno/cursos/${impId}/recursos`, { jar: 'olga' });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.itens.length, 2);
    const pag = await req('GET', `/academy/aluno/recursos/${impId}/${r.json.itens[0].id}`, { jar: 'olga' });
    assert.equal(pag.st, 200);
    assert.ok(pag.texto.includes('Contexto &lt;b&gt;x&lt;/b&gt;'), 'conteúdo escapado');
    assert.equal((await req('GET', `/academy/api/aluno/cursos/${impId}/recursos`, { jar: 'caio' })).st, 403);
  });

  await t('ferramentas: a IA lapida o prompt montado; texto curto é recusado; sem acesso 403', async () => {
    const iaM = require('./ia');
    let ultimo = '';
    iaM.__mockParaTeste(async ({ prompt }) => { ultimo = prompt; return { json: { texto: 'Função: você é…\nConsidere pronto quando…', mudancas: ['incluí critério de pronto'] } }; });
    try {
      const url = `/academy/api/aluno/cursos/${impId}/ferramentas/refinar`;
      assert.equal((await req('POST', url, { jar: 'olga', corpo: { tipo: 'prompt', texto: 'curto' } })).st, 400);
      const r = await req('POST', url, { jar: 'olga', corpo: { tipo: 'agente', texto: '# PROMPT MASTER — Agente financeiro\n## 1. Missão\nConciliar reservas.' } });
      assert.equal(r.st, 200, r.texto);
      assert.ok(ultimo.includes('PROMPT MASTER de um agente'));
      assert.equal(r.json.mudancas[0], 'incluí critério de pronto');
      assert.equal((await req('POST', url, { jar: 'caio', corpo: { tipo: 'prompt', texto: 'Função: você é um redator de anúncios de hospedagem.' } })).st, 403);
    } finally { iaM.__mockParaTeste(null); }
  });

  await t('certificado mostra os selos conquistados e o botão do LinkedIn', async () => {
    const c = await req('POST', `/academy/api/aluno/cursos/${impId}/certificado`, { jar: 'olga' });
    assert.equal(c.st, 200, c.texto);
    const pag = await req('GET', c.json.url, { semUser: true });
    assert.equal(pag.st, 200);
    assert.ok(pag.texto.includes('Pesquisa com fonte'), 'selo no certificado');
    assert.ok(pag.texto.includes('linkedin.com/profile/add'), 'botão do LinkedIn');
  });

  await t('LGPD: exportação traz o que o aluno escreveu (caderno, tutor, Lab, desafio)', async () => {
    const r = await req('GET', '/academy/api/me/exportar', { jar: 'olga' });
    assert.equal(r.st, 200, r.texto);
    const a = r.json.aprendizagem || (r.json.dados && r.json.dados.aprendizagem);
    assert.ok(a, 'bloco de aprendizagem na exportação');
    assert.ok(a.lab_entregas.some(x => x.missao_id === 'm1'));
    assert.ok(a.desafio_checkins.some(x => x.dia === 1));
    assert.ok(a.caderno_respostas.length >= 1);
  });
  // ================= ECOSSISTEMA: Express, Faça comigo, trilhas, lives, comunidade =================
  console.log('\n— ecossistema: Villela Express, Faça comigo, trilhas, lives, comunidade —');
  const MARIA_ID = (await req('GET', '/academy/api/me', { jar: 'maria' })).json.usuario.id;

  await t('formatos de aula: Express e Faça comigo entram pela importação, com passos validados', async () => {
    const base = CURSO();
    base.modulos.push({ titulo: 'Villela Express', aulas: [
      { titulo: 'Como anexar um PDF', tipo: 'video', duracao_seg: 90, formato: 'express', conteudo: 'Anexe o PDF convertido em Markdown.' },
      { titulo: 'Faça comigo: o primeiro projeto', tipo: 'video', duracao_seg: 900, formato: 'faca-comigo',
        passos: [{ ini_seg: 30, titulo: 'Abra o Claude', instrucao: 'Entre na conta.' }, { ini_seg: 120, titulo: 'Crie o projeto' }] }] });
    let r = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: base });
    assert.equal(r.st, 200, r.texto);
    const ruim = CURSO(); ruim.modulos.push({ titulo: 'Villela Express', aulas: [{ titulo: 'Como anexar um PDF', formato: 'tiktok' }] });
    assert.equal((await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: ruim })).st, 400, 'formato inventado');
    const fora = CURSO(); fora.modulos.push({ titulo: 'Villela Express', aulas: [{ titulo: 'Faça comigo: o primeiro projeto', passos: [{ ini_seg: 200, titulo: 'b' }, { ini_seg: 10, titulo: 'a' }] }] });
    assert.equal((await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: fora })).st, 400, 'passos fora de ordem');
    const ex = await req('GET', '/academy/api/aluno/formato/express', { jar: 'olga' });
    assert.equal(ex.st, 200, ex.texto);
    const a = ex.json.aulas.find(x => x.titulo === 'Como anexar um PDF');
    assert.ok(a && a.liberada, 'aluno do curso vê o Express');
    const fc = await req('GET', '/academy/api/aluno/formato/faca-comigo', { jar: 'olga' });
    assert.equal(fc.json.aulas[0].passos, 2);
    const curso = await req('GET', `/academy/api/aluno/cursos/${impId}`, { jar: 'olga' });
    const aula = curso.json.estrutura.flatMap(m => m.aulas).find(x => x.titulo === 'Faça comigo: o primeiro projeto');
    assert.equal(aula.formato, 'faca-comigo');
    assert.equal(JSON.parse(aula.passos)[1].titulo, 'Crie o projeto');
    const bloq = await req('GET', `/academy/api/aluno/cursos/${impId}`, { jar: 'caio' });
    const b2 = bloq.json.estrutura.flatMap(m => m.aulas).find(x => x.titulo === 'Faça comigo: o primeiro projeto');
    assert.equal(b2.formato, 'faca-comigo', 'aula travada mostra o formato (vitrine)');
    assert.ok(!('passos' in b2), 'mas não os passos');
    // Villela Express é consulta: não entra no progresso (nem trava o certificado)
    const todas = curso.json.estrutura.flatMap(m => m.aulas);
    const naoExpress = todas.filter(x => x.formato !== 'express').length;
    assert.equal(curso.json.progresso.total_aulas, naoExpress, 'total sem as aulas Express');
    const exp = todas.find(x => x.formato === 'express');
    const antesPct = curso.json.progresso.pct;
    const mk = await req('POST', `/academy/api/aluno/aulas/${exp.id}/progresso`, { jar: 'olga', corpo: { concluida: true } });
    assert.equal(mk.json.progresso.pct, antesPct, 'concluir um Express não mexe no percentual');
  });

  await t('página de venda: módulo só de Express é bônus, não conta como aula da grade', async () => {
    const base = CURSO();
    base.modulos.push({ titulo: 'Villela Express', aulas: [
      { titulo: 'Como anexar um PDF', tipo: 'video', duracao_seg: 90, formato: 'express' },
      { titulo: 'Faça comigo: o primeiro projeto', tipo: 'video', duracao_seg: 900, formato: 'faca-comigo' }] });
    base.modulos.push({ titulo: 'Biblioteca Express', aulas: [{ titulo: 'Dica rápida', tipo: 'video', duracao_seg: 40, formato: 'express' }] });
    assert.equal((await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: base })).st, 200);
    const ctx = require('./repo-conteudo');
    const resumo = ctx.Marketplace.resumoConteudo(impId);
    assert.equal(resumo.modulos.find(m => m.titulo === 'Biblioteca Express').extra, true);
    assert.equal(resumo.modulos.find(m => m.titulo === 'Villela Express').extra, false, 'módulo misto continua sendo aula');
    assert.equal(resumo.total_express, 2);
    const nAulas = resumo.modulos.filter(m => !m.extra).length;
    assert.equal(nAulas, resumo.modulos.length - 1);
    require('./db').db.prepare("UPDATE products SET status = 'publicado' WHERE id = ?").run(impId);
    const r = await req('GET', `/academy/cursos/${ctx.Produtos.obter(impId).slug}`);
    assert.ok(r.texto.includes(`${nAulas} aulas + Villela Express (2 vídeos curtos)`), 'resumo do currículo');
    assert.ok(!r.texto.includes(`${resumo.modulos.length} aulas`), 'o bônus não infla a contagem de aulas');
    require('./db').db.prepare("UPDATE products SET status = 'rascunho' WHERE id = ?").run(impId);
  });

  await t('trilhas: nascem em rascunho, só o dono vê; publicadas mostram progresso e itens "em breve"', async () => {
    const corpo = { produtor_email: MARIA.email, trilhas: [{ titulo: 'Trilha IA', icone: '🤖', subtitulo: 'Do prompt ao agente',
      itens: [{ produto_id: impId }, { titulo: 'Agentes de IA', descricao: 'Em produção.' }] }] };
    assert.equal((await req('POST', '/staff/api/academy/trilhas/importar', { semUser: true, corpo })).st, 401);
    const alheio = { produtor_email: MARIA.email, trilhas: [{ titulo: 'X', itens: [{ produto_id: 'nao-existe' }] }] };
    assert.equal((await req('POST', '/staff/api/academy/trilhas/importar', { semUser: true, chave: true, corpo: alheio })).st, 400);
    const r = await req('POST', '/staff/api/academy/trilhas/importar', { semUser: true, chave: true, corpo });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.trilhas[0].status, 'rascunho');
    assert.equal((await req('GET', '/academy/api/aluno/trilhas', { jar: 'olga' })).json.trilhas.length, 0, 'rascunho não aparece ao aluno');
    assert.equal((await req('GET', '/academy/api/aluno/trilhas', { jar: 'maria' })).json.trilhas.length, 1, 'o dono revisa');
    assert.equal((await req('POST', '/staff/api/academy/trilhas/status', { semUser: true, chave: true, corpo: { produtor_email: MARIA.email, slug: 'trilha-ia', status: 'publicada' } })).st, 200);
    const t1 = await req('GET', '/academy/api/aluno/trilhas/trilha-ia', { jar: 'olga' });
    assert.equal(t1.st, 200, t1.texto);
    assert.equal(t1.json.trilha.itens[1].status, 'em_breve');
    // o curso importado está em rascunho no catálogo: na trilha ele aparece como "em breve", não como link quebrado
    assert.ok(['disponivel', 'em_breve'].includes(t1.json.trilha.itens[0].status));
  });

  let liveId = '';
  await t('lives: só membros veem; o link só aparece 30 min antes; perguntas com limite e voto', async () => {
    const longe = new Date(Date.now() + 5 * 86400e3).toISOString();
    const nova = await req('POST', '/staff/api/academy/lives', { semUser: true, chave: true, corpo: { produtor_email: MARIA.email, titulo: 'Live de outubro',
      inicio_em: longe, link: 'https://meet.exemplo.com/abc', publicada: true, novidades: [{ titulo: 'Novo recurso', fonte: 'https://exemplo.com/noticia' }] } });
    assert.equal(nova.st, 200, nova.texto);
    liveId = nova.json.live.id;
    assert.equal((await req('POST', '/staff/api/academy/lives', { semUser: true, chave: true, corpo: { produtor_email: MARIA.email, titulo: 'x', inicio_em: longe, link: 'http://inseguro' } })).st, 400, 'link sem https');
    const ol = await req('GET', '/academy/api/aluno/lives', { jar: 'olga' });
    const l = ol.json.lives.find(x => x.id === liveId);
    assert.ok(l, 'aluna matriculada vê a live');
    assert.equal(l.link, '', 'link escondido até 30 min antes');
    assert.equal(l.novidades[0].titulo, 'Novo recurso');
    assert.equal((await req('GET', '/academy/api/aluno/lives', { jar: 'caio' })).json.lives.length, 0, 'quem não é aluno não vê');
    assert.ok((await req('GET', '/academy/api/aluno/lives', { jar: 'maria' })).json.lives.find(x => x.id === liveId).link, 'a dona vê o link');
    assert.equal((await req('POST', `/academy/api/aluno/lives/${liveId}/inscricao`, { jar: 'olga', corpo: { sim: true } })).json.live.inscrito, true);
    for (let i = 1; i <= 3; i++) assert.equal((await req('POST', `/academy/api/aluno/lives/${liveId}/perguntas`, { jar: 'olga', corpo: { texto: `Pergunta número ${i} sobre agentes` } })).st, 200);
    assert.equal((await req('POST', `/academy/api/aluno/lives/${liveId}/perguntas`, { jar: 'olga', corpo: { texto: 'A quarta pergunta da mesma pessoa' } })).st, 429);
    const ps = (await req('GET', `/academy/api/aluno/lives/${liveId}/perguntas`, { jar: 'ana' })).json.perguntas;
    assert.equal(ps[0].autor, 'Olga O.', 'nome curto, nunca o e-mail');
    const v = await req('POST', `/academy/api/aluno/lives/perguntas/${ps[0].id}/voto`, { jar: 'ana' });
    assert.equal(v.json.perguntas.find(x => x.id === ps[0].id).votos, 1);
    assert.equal((await req('POST', `/academy/api/aluno/lives/perguntas/${ps[0].id}/voto`, { jar: 'olga' })).st, 400, 'não vota na própria');
  });

  await t('lives: avisar os alunos é ato explícito (confirmar) e acontece uma vez; lembrete só para inscritos, ~1h antes', async () => {
    const url = `/staff/api/academy/lives/${liveId}/avisar`;
    assert.equal((await req('POST', url, { semUser: true, chave: true, corpo: { produtor_email: MARIA.email } })).st, 400, 'sem confirmar');
    const r = await req('POST', url, { semUser: true, chave: true, corpo: { produtor_email: MARIA.email, confirmar: true } });
    assert.equal(r.st, 200, r.texto);
    assert.ok(r.json.avisados >= 2, 'olga e ana');
    assert.equal((await req('POST', url, { semUser: true, chave: true, corpo: { produtor_email: MARIA.email, confirmar: true } })).st, 409, 'não repete sem forcar');
    // live daqui a 40 min: link já liberado e lembrete pendente
    const perto = await req('POST', '/staff/api/academy/lives', { semUser: true, chave: true, corpo: { produtor_email: MARIA.email, titulo: 'Live relâmpago',
      inicio_em: new Date(Date.now() + 25 * 60e3).toISOString(), link: 'https://meet.exemplo.com/xyz', publicada: true } });
    const pid = perto.json.live.id;
    await req('POST', `/academy/api/aluno/lives/${pid}/inscricao`, { jar: 'olga', corpo: { sim: true } });
    assert.equal((await req('GET', '/academy/api/aluno/lives', { jar: 'olga' })).json.lives.find(x => x.id === pid).link, 'https://meet.exemplo.com/xyz');
    const antes = (await req('GET', '/academy/api/notificacoes', { jar: 'olga' })).json.itens.length;
    require('./rotas-ecossistema').rotinaLembretes();
    require('./rotas-ecossistema').rotinaLembretes(); // a segunda rodada não repete
    const depois = (await req('GET', '/academy/api/notificacoes', { jar: 'olga' })).json.itens;
    assert.equal(depois.length, antes + 1, 'um lembrete, uma vez');
    assert.ok(/Começa em 1 hora/.test(depois[0].titulo));
  });

  let topId = '';
  await t('comunidade: só alunos; trava CPF e chave de API; resposta, solução, curtida', async () => {
    assert.equal((await req('GET', `/academy/api/aluno/comunidade/${MARIA_ID}`, { jar: 'caio' })).st, 403);
    const url = `/academy/api/aluno/comunidade/${MARIA_ID}/topicos`;
    assert.equal((await req('POST', url, { jar: 'olga', corpo: { area: 'duvidas', titulo: 'Dúvida sobre cliente', texto: 'O CPF do cliente é 123.456.789-09, como faço?' } })).st, 400, 'CPF barrado');
    assert.equal((await req('POST', url, { jar: 'olga', corpo: { area: 'ferramentas', titulo: 'Minha chave não funciona', texto: 'Usei sk-ant-abcdefghijklmnopqrstuv123 e deu erro.' } })).st, 400, 'chave barrada');
    assert.equal((await req('POST', url, { jar: 'olga', corpo: { area: 'novidades', titulo: 'Saiu um recurso novo', texto: 'Ouvi dizer que saiu algo novo no Claude.' } })).st, 400, 'novidade sem fonte');
    const c = await req('POST', url, { jar: 'olga', corpo: { area: 'duvidas', titulo: 'Como começo o projeto final?', texto: 'Não sei qual processo escolher <script>x</script> para o piloto.' } });
    assert.equal(c.st, 200, c.texto);
    topId = c.json.topico.id;
    assert.ok(c.json.topico.texto.includes('<script>'), 'o texto fica cru no banco — quem escapa é a tela');
    const r = await req('POST', `/academy/api/aluno/comunidade/topicos/${topId}/respostas`, { jar: 'maria', corpo: { texto: 'Escolha o processo que mais dói toda semana.' } });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.topico.respostas[0].equipe, true, 'a dona aparece como equipe');
    const resp = r.json.topico.respostas[0].id;
    assert.equal((await req('POST', `/academy/api/aluno/comunidade/topicos/${topId}/solucao`, { jar: 'ana', corpo: { resposta_id: resp } })).st, 403, 'só o autor marca');
    assert.ok((await req('POST', `/academy/api/aluno/comunidade/topicos/${topId}/solucao`, { jar: 'olga', corpo: { resposta_id: resp } })).json.topico.solucao_id === resp);
    assert.equal((await req('POST', '/academy/api/aluno/comunidade/curtir', { jar: 'ana', corpo: { tipo: 'topico', id: topId } })).json.n, 1);
    const lista = await req('GET', `/academy/api/aluno/comunidade/${MARIA_ID}?area=duvidas`, { jar: 'ana' });
    assert.equal(lista.json.topicos[0].resolvido, true);
    assert.equal(lista.json.topicos[0].autor, 'Olga O.');
    const notif = (await req('GET', '/academy/api/notificacoes', { jar: 'olga' })).json.itens;
    assert.ok(notif.some(n => /Nova resposta/.test(n.titulo)), 'o autor é avisado da resposta');
  });

  await t('comunidade: denúncia chega ao moderador; ocultar esconde do aluno; o autor apaga o que escreveu', async () => {
    assert.equal((await req('POST', '/academy/api/aluno/comunidade/denunciar', { jar: 'olga', corpo: { tipo: 'topico', id: topId, motivo: 'x' } })).st, 400, 'não denuncia o próprio');
    const d = await req('POST', '/academy/api/aluno/comunidade/denunciar', { jar: 'ana', corpo: { tipo: 'topico', id: topId, motivo: 'fora do tema' } });
    assert.equal(d.json.denuncias, 1);
    assert.equal((await req('GET', `/academy/api/aluno/comunidade/${MARIA_ID}/denuncias`, { jar: 'ana' })).st, 403);
    assert.equal((await req('GET', `/academy/api/aluno/comunidade/${MARIA_ID}/denuncias`, { jar: 'maria' })).json.denuncias.length, 1);
    assert.equal((await req('POST', '/academy/api/aluno/comunidade/moderar', { jar: 'ana', corpo: { tipo: 'topico', id: topId, acao: 'ocultar' } })).st, 403);
    assert.equal((await req('POST', '/academy/api/aluno/comunidade/moderar', { jar: 'maria', corpo: { tipo: 'topico', id: topId, acao: 'ocultar' } })).st, 200);
    assert.equal((await req('GET', `/academy/api/aluno/comunidade/${MARIA_ID}`, { jar: 'ana' })).json.topicos.length, 0, 'oculto some para os alunos');
    assert.equal((await req('GET', `/academy/api/aluno/comunidade/${MARIA_ID}/denuncias`, { jar: 'maria' })).json.denuncias.length, 0, 'denúncia resolvida');
    const ex = await req('GET', '/academy/api/me/exportar', { jar: 'olga' });
    assert.ok(ex.json.comunidade.comunidade_topicos.length >= 1 && ex.json.comunidade.live_perguntas.length === 3, 'LGPD: comunidade e perguntas na exportação');
    assert.equal((await req('POST', '/academy/api/aluno/comunidade/apagar', { jar: 'olga', corpo: { tipo: 'topico', id: topId } })).st, 200);
    assert.equal((await req('GET', `/academy/api/aluno/comunidade/topicos/${topId}`, { jar: 'maria' })).st, 404, 'apagado pelo autor');
  });

  await t('comunidade: Avisos é só de quem ensina; boas-vindas pela chave sai no nome do produtor, fixado e sem duplicar', async () => {
    const url = `/academy/api/aluno/comunidade/${MARIA_ID}/topicos`;
    assert.equal((await req('POST', url, { jar: 'olga', corpo: { area: 'avisos', titulo: 'Aviso de aluno', texto: 'Aluno não publica em Avisos, só quem ensina.' } })).st, 403);
    const corpo = { produtor_email: MARIA.email, area: 'avisos', fixar: true, titulo: 'Bem-vindo à comunidade', texto: 'Apresente-se aqui embaixo e anonimize os dados antes de postar.' };
    assert.equal((await req('POST', '/staff/api/academy/comunidade/topico', { semUser: true, corpo })).st, 401, 'sem chave');
    const r = await req('POST', '/staff/api/academy/comunidade/topico', { semUser: true, chave: true, corpo });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.criado, true);
    assert.equal(r.json.topico.fixado, true);
    const de_novo = await req('POST', '/staff/api/academy/comunidade/topico', { semUser: true, chave: true, corpo });
    assert.equal(de_novo.json.criado, false, 'reenviar não duplica');
    assert.equal(de_novo.json.topico.id, r.json.topico.id);
    const lista = await req('GET', `/academy/api/aluno/comunidade/${MARIA_ID}`, { jar: 'ana' });
    assert.equal(lista.json.topicos[0].id, r.json.topico.id, 'fixado no topo de "Tudo"');
    assert.ok(/^Maria/.test(lista.json.topicos[0].autor), 'no nome da produtora: ' + lista.json.topicos[0].autor);
  });
  // ================= GOTEJAMENTO: liberação progressiva das aulas =================
  // Regra do Augusto (22/09/2026): duas aulas a cada dois dias, contadas da
  // MATRÍCULA DO ALUNO, e só se a aula tiver o conteúdo publicado.
  console.log('\n— gotejamento: a trilha abre 2 a cada 2 dias, contada da matrícula —');

  const GOTE = () => ({
    produtor_email: MARIA.email,
    produto: { titulo: 'Curso Gotejado', tipo: 'curso', categoria: 'tecnologia', descricao_curta: 'trilha' },
    modulos: [
      { titulo: 'Gote M1', aulas: [
        { titulo: 'G1', tipo: 'video', url_externa: 'https://youtu.be/g1', duracao_min: 5, gratuita: true },
        { titulo: 'G2', tipo: 'texto', conteudo: 'texto da G2' },
      ] },
      { titulo: 'Gote M2', aulas: [
        { titulo: 'G3', tipo: 'video', url_externa: 'https://youtu.be/g3', duracao_min: 5 },
        { titulo: 'G4', tipo: 'texto', conteudo: 'texto da G4' },
      ] },
      { titulo: 'Gote M3', aulas: [
        // G5 é a aula ainda não gravada: tipo vídeo, SEM vídeo nenhum
        { titulo: 'G5', tipo: 'video', conteudo: 'Videoaula em produção.' },
        { titulo: 'G6', tipo: 'texto', conteudo: 'texto da G6' },
      ] },
    ],
  });
  let goteId = '', goteMat = '';
  const goteAulas = {};
  const RITA = { nome: 'Rita Aluna', email: 'rita@t.com', senha: 'senha-forte-9', aceite_termos: true };
  const TITO = { nome: 'Tito Aluno', email: 'tito@t.com', senha: 'senha-forte-8', aceite_termos: true };
  const dbg = require('./db').db;
  // empurra a matrícula do aluno N dias para trás — é assim que o teste viaja
  // no tempo sem depender do relógio da máquina nem da virada do calendário
  const matriculaHaDias = (email, dias) => {
    const uid = dbg.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    const quando = new Date(Date.now() - dias * 86400000).toISOString();
    dbg.prepare('UPDATE enrollments SET criado_em = ? WHERE user_id = ? AND product_id = ?').run(quando, uid, goteId);
  };
  const cfgUrl = () => `/staff/api/academy/gotejamento?produtor_email=${encodeURIComponent(MARIA.email)}&produto_id=${goteId}`;
  const ritmo = (corpo) => req('POST', '/staff/api/academy/gotejamento', { semUser: true, chave: true,
    corpo: { produtor_email: MARIA.email, produto_id: goteId, ...corpo } });
  const grade = async (jar) => {
    const r = await req('GET', `/academy/api/aluno/cursos/${goteId}`, { jar });
    const aulas = {};
    (r.json.estrutura || []).forEach(m => m.aulas.forEach(a => { aulas[a.titulo] = a; }));
    return { r, aulas, gote: r.json.gotejamento, abertas: Object.values(aulas).filter(a => a.liberada).length };
  };

  await t('preparo: curso de 6 aulas em 3 módulos, publicado, com 2 alunos matriculados', async () => {
    const imp = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: GOTE() });
    assert.equal(imp.st, 200, imp.texto);
    goteId = imp.json.produto.id;
    const vis = await req('GET', `/academy/api/produtor/produtos/${goteId}`, { jar: 'maria' });
    vis.json.estrutura.forEach(m => m.aulas.forEach(a => { goteAulas[a.titulo] = a.id; }));
    assert.equal(Object.keys(goteAulas).length, 6);
    // material na G4 (posição 4): é o arquivo que a porta do servidor precisa recusar
    const up = await req('POST', '/academy/api/produtor/upload', { jar: 'maria', corpo: { nome: 'g4.pdf', mime: 'application/pdf', conteudo_base64: Buffer.from('%PDF-1.4 g4').toString('base64') } });
    goteMat = up.json.id;
    const mat = await req('POST', `/academy/api/produtor/produtos/${goteId}/aulas/${goteAulas.G4}/materiais`, { jar: 'maria', corpo: { nome: 'Apostila G4', media_id: goteMat } });
    assert.equal(mat.st, 200, 'material: ' + mat.texto);
    await req('POST', `/academy/api/produtor/produtos/${goteId}/status`, { jar: 'maria', corpo: { status: 'em_revisao' } });
    await req('POST', `/academy/api/admin/produtos/${goteId}/decidir`, { jar: 'maria', corpo: { status: 'aprovado' } });
    const pub = await req('POST', `/academy/api/produtor/produtos/${goteId}/status`, { jar: 'maria', corpo: { status: 'publicado' } });
    assert.equal(pub.st, 200, 'publicar: ' + pub.texto);
    await req('POST', '/academy/api/signup', { corpo: RITA, jar: 'rita' });
    await req('POST', '/academy/api/signup', { corpo: TITO, jar: 'tito' });
    for (const p of [RITA, TITO]) {
      const mt = await req('POST', `/academy/api/produtor/produtos/${goteId}/matricular`, { jar: 'maria', corpo: { email: p.email } });
      assert.equal(mt.st, 200, 'matricular ' + p.email + ': ' + mt.texto);
    }
  });

  await t('o padrão é DESLIGADO: curso completo não ganha trava por descuido', async () => {
    const cfg = await req('GET', cfgUrl(), { semUser: true, chave: true });
    assert.equal(cfg.st, 200, cfg.texto);
    assert.equal(cfg.json.gotejamento.ativo, false, 'nasce desligado');
    const g = await grade('rita');
    assert.equal(g.gote.ativo, false);
    assert.equal(g.abertas, 6, 'sem gotejamento, as 6 aulas abrem na matrícula');
    // e os cursos que já estão no catálogo seguem intactos
    const outro = await req('GET', `/academy/api/aluno/cursos/${prodId}`, { jar: 'ana' });
    assert.equal(outro.json.gotejamento.ativo, false, 'curso completo (Claude AI na Prática etc.) não é afetado');
  });

  await t('ligar: 2 aulas a cada 2 dias, com o ritmo parametrizado (não cravado em código)', async () => {
    const on = await ritmo({ ativo: true, aulas_por_periodo: 2, periodo_dias: 2 });
    assert.equal(on.st, 200, on.texto);
    assert.equal(on.json.gotejamento.ativo, true);
    assert.equal(on.json.promessa, 'Duas aulas novas a cada dois dias');
    const cfg = await req('GET', cfgUrl(), { semUser: true, chave: true });
    assert.deepEqual(cfg.json.trilha.map(x => x.dia_abre), [0, 0, 2, 2, 4, 4], 'a fórmula corre a trilha INTEIRA, não o lessons.ordem de cada módulo');
    assert.equal(cfg.json.dias_ate_o_fim, 4, '6 aulas a 2/2 abrem inteiras no dia 4');
    // ritmo diferente = trilha diferente: 2/2 é o default, não regra de código
    await ritmo({ ativo: true, aulas_por_periodo: 3, periodo_dias: 7 });
    const sem = await req('GET', cfgUrl(), { semUser: true, chave: true });
    assert.deepEqual(sem.json.trilha.map(x => x.dia_abre), [0, 0, 0, 7, 7, 7], '3 aulas por semana');
    assert.equal(sem.json.promessa, 'Três aulas novas a cada sete dias');
    await ritmo({ ativo: true, aulas_por_periodo: 2, periodo_dias: 2 }); // volta à regra do Augusto
  });

  await t('dia 0: abrem as duas primeiras; as outras dizem QUANDO abrem', async () => {
    const g = await grade('rita');
    assert.equal(g.gote.ativo, true);
    assert.equal(g.gote.abertas, 2); assert.equal(g.gote.total, 6);
    assert.equal(g.abertas, g.gote.abertas, 'o contador "X de Y" bate com a grade que o aluno vê');
    assert.equal(g.aulas.G1.liberada, true, 'a degustação abre sempre'); assert.equal(g.aulas.G2.liberada, true);
    assert.equal(g.aulas.G3.liberada, false, 'a 3ª só no dia 2');
    assert.equal(g.aulas.G3.trava.motivo, 'aguardando_data');
    assert.equal(g.aulas.G3.trava.abre_em_dias, 2);
    assert.equal(g.aulas.G3.trava.rotulo, 'abre em 2 dias');
    assert.equal(g.aulas.G5.trava.abre_em_dias, 4, 'a 5ª abre no dia 4');
    // vitrine: título sim, conteúdo não
    assert.equal(g.aulas.G3.titulo, 'G3');
    assert.ok(!g.aulas.G3.url_externa, 'aula travada NÃO entrega a URL do vídeo');
    assert.ok(!g.aulas.G4.conteudo, 'nem o texto');
    assert.deepEqual(g.aulas.G4.materiais, [], 'nem a lista de materiais');
  });

  await t('A PORTA: furar pela URL direta da aula seguinte TEM de falhar', async () => {
    // 1. o arquivo do material da aula 4 (ainda travada) — rota genérica de mídia
    assert.equal((await req('GET', `/academy/api/media/${goteMat}`, { jar: 'rita' })).st, 404, 'material de aula travada não é servido');
    // 2. o link assinado, que é o caminho do player de vídeo
    assert.equal((await req('GET', `/academy/api/media/${goteMat}/link`, { jar: 'rita' })).st, 404, 'nem em URL assinada');
    // 3. marcar como concluída por fora (fecharia progresso e certificado)
    const prog = await req('POST', `/academy/api/aluno/aulas/${goteAulas.G4}/progresso`, { jar: 'rita', corpo: { concluida: true } });
    assert.equal(prog.st, 400, 'não dá para concluir aula que não abriu');
    assert.ok(/ainda não abriu/.test(prog.json.erro), prog.texto);
    // 4. quiz e caderno da aula travada, que são conteúdo dela por outra porta
    assert.equal((await req('GET', `/academy/api/aluno/aulas/${goteAulas.G4}/quiz`, { jar: 'rita' })).st, 404);
    assert.equal((await req('GET', `/academy/api/aluno/aulas/${goteAulas.G4}/caderno`, { jar: 'rita' })).st, 404);
    // 5. e o que JÁ abriu continua abrindo (a trava não pode virar muro)
    assert.equal((await req('POST', `/academy/api/aluno/aulas/${goteAulas.G1}/progresso`, { jar: 'rita', corpo: { concluida: true } })).st, 200);
  });

  await t('a 2ª condição: tempo cumprido + vídeo AUSENTE = continua bloqueada', async () => {
    matriculaHaDias(RITA.email, 10); // muito além do dia 4: o relógio já não segura nada
    const g = await grade('rita');
    assert.equal(g.aulas.G3.liberada, true); assert.equal(g.aulas.G4.liberada, true);
    assert.equal(g.aulas.G6.liberada, true);
    assert.equal(g.aulas.G5.liberada, false, 'G5 é aula de vídeo SEM vídeo: o relógio passou e ela não abre');
    assert.equal(g.aulas.G5.trava.motivo, 'aguardando_publicacao');
    assert.equal(g.aulas.G5.trava.rotulo, 'aguardando publicação');
    assert.equal(g.gote.abertas, 5, '5 de 6 — a que falta é a que não existe');
    assert.equal(g.abertas, 5, 'e a grade mostra as mesmas 5');
    // e a porta segue fechada para ela, não só a tela
    assert.equal((await req('POST', `/academy/api/aluno/aulas/${goteAulas.G5}/progresso`, { jar: 'rita', corpo: { concluida: true } })).st, 400);
    // publicar o vídeo abre a aula na hora — quem manda volta a ser o relógio
    assert.equal((await req('PATCH', `/academy/api/produtor/produtos/${goteId}/aulas/${goteAulas.G5}`,
      { jar: 'maria', corpo: { url_externa: 'https://youtu.be/g5' } })).st, 200);
    const depois = await grade('rita');
    assert.equal(depois.aulas.G5.liberada, true, 'com o vídeo no ar, a aula abre');
    assert.equal(depois.gote.abertas, 6);
    // e o material da aula 4 agora é servido: a porta libera quando é para liberar
    assert.equal((await req('GET', `/academy/api/media/${goteMat}`, { jar: 'rita' })).st, 200);
  });

  await t('o relógio é de cada ALUNO, não do curso', async () => {
    matriculaHaDias(TITO.email, 2); // Tito entrou 8 dias depois da Rita
    const rita = await grade('rita'), tito = await grade('tito');
    assert.equal(rita.gote.abertas, 6, 'Rita, matriculada há 10 dias, já tem tudo');
    assert.equal(tito.gote.abertas, 4, 'Tito, há 2 dias, tem as 4 primeiras');
    assert.equal(tito.aulas.G5.liberada, false);
    assert.equal(tito.aulas.G5.trava.motivo, 'aguardando_data', 'para Tito falta DATA, não publicação');
    assert.equal(tito.aulas.G5.trava.abre_em_dias, 2);
    assert.equal((await req('GET', `/academy/api/media/${goteMat}`, { jar: 'tito' })).st, 200, 'a G4 dele já abriu');
  });

  await t('cortesia vitalícia e admin veem tudo — sem furar a regra do aluno comum', async () => {
    // o Augusto: cortesia total. Não tem linha de matrícula, logo não tem
    // "dias desde a matrícula" para contar — e precisa poder revisar o curso.
    const aug = { nome: 'Augusto', email: 'augusto@t.com', senha: 'senha-forte-7', aceite_termos: true };
    await req('POST', '/academy/api/signup', { corpo: aug, jar: 'augusto' });
    assert.equal((await req('POST', '/staff/api/academy/cortesia', { corpo: { email: aug.email } })).st, 200);
    const g = await grade('augusto');
    assert.equal(g.gote.ativo, false, 'para quem tem cortesia o gotejamento não se aplica');
    assert.equal(g.abertas, 6, 'a cortesia é vitalícia e vale o catálogo inteiro, sem esperar trilha');
    assert.ok(g.aulas.G5.url_externa, 'e com o conteúdo de verdade, não só o título');
    // o mesmo com o papel de admin somado à cortesia (o caso do Augusto)
    const augId = dbg.prepare('SELECT id FROM users WHERE email = ?').get(aug.email).id;
    assert.equal((await req('POST', `/staff/api/academy/usuarios/${augId}/papeis`, { corpo: { conceder: 'admin' } })).st, 200);
    assert.equal((await grade('augusto')).abertas, 6, 'admin vê a trilha inteira');
    // o produtor dono revisa a própria trilha pela rota dele, sem gotejamento
    const dona = await req('GET', `/academy/api/produtor/produtos/${goteId}`, { jar: 'maria' });
    assert.equal(dona.json.estrutura.reduce((n, m) => n + m.aulas.length, 0), 6);
    // ⚠️ e o aluno comum continua travado: a isenção é de quem tem, não do curso
    const tito = await grade('tito');
    assert.equal(tito.aulas.G5.liberada, false, 'a cortesia do Augusto não abriu a trilha do Tito');
    assert.equal((await req('POST', `/academy/api/aluno/aulas/${goteAulas.G5}/progresso`, { jar: 'tito', corpo: { concluida: true } })).st, 400);
  });

  await t('o texto na tela e na página de venda: trilha é método, não curso trancado', async () => {
    const tito = await grade('tito');
    assert.equal(tito.gote.promessa, 'Duas aulas novas a cada dois dias', 'o estúdio recebe a frase pronta');
    const venda = await req('GET', '/academy/cursos/curso-gotejado');
    assert.equal(venda.st, 200);
    assert.ok(venda.texto.includes('Duas aulas novas a cada dois dias'), 'a promessa é dita ANTES da compra');
    assert.ok(venda.texto.includes('contada da <b>sua</b> matrícula'), 'e dita como é: contada da matrícula do aluno');
    // a página do curso completo não pode ganhar a frase
    const slugCompleto = (await req('GET', `/academy/api/produtor/produtos/${prodId}`, { jar: 'maria' })).json.produto.slug;
    const outra = await req('GET', `/academy/cursos/${slugCompleto}`);
    assert.ok(!outra.texto.includes('aulas novas a cada'), 'curso sem gotejamento não promete trilha');
  });

  await t('desligar devolve o curso inteiro, sem apagar o progresso de ninguém', async () => {
    const off = await ritmo({ ativo: false });
    assert.equal(off.json.gotejamento.ativo, false);
    const tito = await grade('tito');
    assert.equal(tito.gote.ativo, false);
    assert.equal(tito.abertas, 6);
    const rita = await grade('rita');
    assert.equal(rita.r.json.progresso.concluidas, 1, 'a aula que a Rita concluiu continua concluída');
    const aud = await req('GET', '/staff/api/academy/auditoria');
    assert.ok(aud.json.eventos.some(e => e.acao === 'gotejamento.ligar'), 'ligar e desligar ficam na auditoria');
    assert.ok(aud.json.eventos.some(e => e.acao === 'gotejamento.desligar'));
  });

  srv.close();
  console.log(`\n${ok} ok, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach(f => console.log('  ✗', f)); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
