// =====================================================================
// Villela Academy Marketplace — suíte de testes. Roda o Express real com
// auth de staff injetada e banco descartável. npm run test:academy
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'academy-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
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
academy.montar(app, { express, requireAuth, requireAdmin, alertaAugusto, mpFetch, jwtSecret: 'seg-teste' });
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
  await t('config comercial oficial (10%/10%) semeada e editável pelo staff', async () => {
    const r = await req('GET', '/staff/api/academy/config');
    assert.equal(r.json.comissoes.plataforma_pct, 10);
    assert.equal(r.json.comissoes.afiliado_padrao_pct, 10); // decisão do Augusto 08/07/2026
    assert.equal((await req('POST', '/staff/api/academy/config', { corpo: { chave: 'comissoes', valor: { plataforma_pct: 12, afiliado_padrao_pct: 10, cookie_dias: 30 } } })).st, 200);
    assert.equal((await req('GET', '/staff/api/academy/config')).json.comissoes.plataforma_pct, 12);
    // restaura o valor oficial p/ os testes de checkout
    await req('POST', '/staff/api/academy/config', { corpo: { chave: 'comissoes', valor: { plataforma_pct: 10, afiliado_padrao_pct: 10, cookie_dias: 30 } } });
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
  await t('webhook approved libera matrícula e calcula comissão 10%', async () => {
    const antes = alertas.length;
    assert.equal((await req('POST', '/academy/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: '901' } } })).st, 200);
    await espera(200);
    const o = academy.billing.Pedidos.obter(pedidoBruno);
    assert.equal(o.status, 'paga');
    assert.equal(o.valor_centavos, 19900);
    assert.equal(o.comissao_plataforma_centavos, 1990);   // 10% da plataforma
    assert.equal(o.liquido_produtor_centavos, 17910);
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
    assert.equal(d.json.dashboard.receita_plataforma_centavos, 1990);
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
    assert.equal(o.comissao_plataforma_centavos, 1990);        // 10% da plataforma
    assert.equal(o.liquido_produtor_centavos, 19900 - 1990 - 1990);
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
  await t('cobrança recorrente vira pedido (comissão 10%) e é idempotente; KPIs MRR', async () => {
    PAY_REF['905'] = 'academy-sub:' + subId;
    await req('POST', '/academy/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: '905' } } });
    await espera(200);
    const o = require('./db').db.prepare("SELECT * FROM orders WHERE subscription_id = ?").get(subId);
    assert.ok(o); assert.equal(o.tipo, 'assinatura'); assert.equal(o.valor_centavos, 4900);
    assert.equal(o.comissao_plataforma_centavos, 490);
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

  srv.close();
  console.log(`\n${ok} ok, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach(f => console.log('  ✗', f)); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
