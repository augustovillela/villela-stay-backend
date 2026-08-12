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
academy.montar(app, { express, requireAuth, requireAdmin, alertaAugusto, enviarEmail, mpFetch, jwtSecret: 'seg-teste' });
const espera = (ms) => new Promise(r => setTimeout(r, ms));

let BASE = '', ok = 0, falhas = [];
// jars de cookie por "pessoa" (cada usuário de teste tem a própria sessão)
const jars = {};
async function req(m, p, { corpo, user = 'adm', jar, ip } = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-test-user': user, 'x-forwarded-for': ip || '10.0.0.1' };
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
    assert.ok(pg.texto.includes(`<img src="/academy/capa/${prodId}?v=${up.json.id}"`), 'capa visível na página de venda sem vídeo');
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

  srv.close();
  console.log(`\n${ok} ok, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach(f => console.log('  ✗', f)); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
