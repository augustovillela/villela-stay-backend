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

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
const academy = require('./index');
academy.montar(app, { express, requireAuth, requireAdmin, alertaAugusto, jwtSecret: 'seg-teste' });

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
  await t('config comercial semeada e editável pelo staff', async () => {
    const r = await req('GET', '/staff/api/academy/config');
    assert.equal(r.json.comissoes.plataforma_pct, 10);
    assert.equal((await req('POST', '/staff/api/academy/config', { corpo: { chave: 'comissoes', valor: { plataforma_pct: 12 } } })).st, 200);
    assert.equal((await req('GET', '/staff/api/academy/config')).json.comissoes.plataforma_pct, 12);
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

  srv.close();
  console.log(`\n${ok} ok, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach(f => console.log('  ✗', f)); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });
