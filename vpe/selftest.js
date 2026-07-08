// =====================================================================
// Villela Projects & Events — SUÍTE DE TESTES (Fase 1).
// App Express real + banco novo em diretório temporário; rotas HTTP de
// verdade (cookies). Prioridade nº 1: isolamento entre tenants.
//   node vpe/selftest.js      (ou: npm run test:vpe)
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'vpe-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const express = require('express');
const cookieParser = require('cookie-parser');

const STAFF = [
  { id: 'adm', nome: 'Admin Villela', email: 'adm@t', papel: 'admin', areas: ['*'], ativo: true },
  { id: 'ceo', nome: 'CEO Área', email: 'ceo@t', papel: 'membro', areas: ['ceo'], ativo: true },
  { id: 'fora', nome: 'Sem Acesso', email: 'fora@t', papel: 'membro', areas: ['vendas'], ativo: true },
];
function requireAuth(req, res, next) {
  const u = STAFF.find(x => x.id === (req.headers['x-test-user'] || 'adm'));
  if (!u) return res.status(401).json({ erro: 'não autenticado' });
  req.user = u; next();
}
const requireAdmin = (req, res, next) => (req.user && req.user.papel === 'admin') ? next() : res.status(403).json({ erro: 'apenas admin' });
const alertas = [];
const emails = [];

const app = express();
app.use(cookieParser());
require('./index').montar(app, {
  express, requireAuth, requireAdmin,
  alertaAugusto: async (m) => alertas.push(m),
  enviarEmail: async (to, ass) => { emails.push({ to, ass }); return true; },
  jwtSecret: 'segredo-teste',
});

let BASE = '', ok = 0;
const falhas = [];
const jars = {};
async function req(metodo, caminho, { body, jar, staff } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (jar && jars[jar]) headers.Cookie = jars[jar];
  if (staff) headers['x-test-user'] = staff;
  const r = await fetch(BASE + caminho, { method: metodo, headers, body: body ? JSON.stringify(body) : undefined });
  const setCookie = r.headers.get('set-cookie');
  if (jar && setCookie) jars[jar] = setCookie.split(';')[0];
  let dados = {};
  try { dados = await r.json(); } catch (_) {}
  return { status: r.status, dados };
}
function teste(nome, cond) {
  if (cond) { ok++; return; }
  falhas.push(nome);
  console.error('  ✗ FALHOU:', nome);
}

(async () => {
  const srv = app.listen(0);
  BASE = `http://127.0.0.1:${srv.address().port}`;
  const repo = require('./repo');

  // ---------- páginas públicas ----------
  for (const p of ['/vpe', '/vpe/cadastro', '/vpe/login']) {
    const r = await fetch(BASE + p);
    teste(`página ${p} responde 200 html`, r.status === 200 && (r.headers.get('content-type') || '').includes('text/html'));
  }

  // ---------- cadastro / login ----------
  let r = await req('POST', '/vpe/api/cadastro', { body: { empresa: 'Eventos Alfa', nome: 'Ana', email: 'ana@alfa.com', senha: 'senha1234' }, jar: 'anaA' });
  teste('cadastro tenant A (trial)', r.status === 200 && r.dados.tenant.slug === 'eventos-alfa');
  r = await req('POST', '/vpe/api/cadastro', { body: { empresa: 'Construtora Beta', nome: 'Bob', email: 'bob@beta.com', senha: 'senha1234' }, jar: 'bobB' });
  teste('cadastro tenant B', r.status === 200);
  r = await req('GET', '/vpe/api/me', { jar: 'anaA' });
  const tenantA = r.dados.tenant;
  teste('me: dono com todas as permissões e enums', r.dados.papel === 'dono' && r.dados.permissoes.administrar_cobranca === true && Array.isArray(r.dados.enums.estagios));
  r = await req('GET', '/vpe/api/me', { jar: 'bobB' });
  const tenantB = r.dados.tenant;
  teste('tenants distintos', tenantA.id !== tenantB.id);
  r = await req('POST', '/vpe/api/login', { body: { email: 'ana@alfa.com', senha: 'errada99' } });
  teste('login errado → 401', r.status === 401);
  r = await req('GET', '/vpe/api/dashboard', {});
  teste('dashboard sem sessão → 401', r.status === 401);

  // ---------- portfólio ----------
  r = await req('POST', '/vpe/api/projetos', { body: { nome: 'Food bike de brunch', categoria: 'gastronomia', estagio: 'ideia', prioridade: 'alta', investimento_estimado: 1500000, receita_potencial: 12000000, proximos_passos: 'Validar cardápio' }, jar: 'anaA' });
  teste('projeto criado', r.status === 200 && r.dados.projeto.estagio === 'ideia');
  const projA = r.dados.projeto.id;
  r = await req('PATCH', '/vpe/api/projetos/' + projA, { body: { estagio: 'viabilidade', viabilidade: 70 }, jar: 'anaA' });
  teste('mudança de estágio registrada', r.status === 200 && r.dados.projeto.estagio === 'viabilidade' && r.dados.projeto.viabilidade === 70);
  r = await req('GET', '/vpe/api/auditoria', { jar: 'anaA' });
  teste('auditoria tem projeto.mudar_estagio', r.dados.eventos.some(e => e.acao === 'projeto.mudar_estagio'));
  r = await req('GET', '/vpe/api/projetos?estagio=viabilidade', { jar: 'anaA' });
  teste('filtro por estágio', r.dados.projetos.some(p => p.id === projA));

  // ---------- ISOLAMENTO ----------
  r = await req('GET', '/vpe/api/projetos', { jar: 'bobB' });
  teste('B não vê projetos de A', r.status === 200 && !r.dados.projetos.some(p => p.id === projA));
  r = await req('GET', '/vpe/api/projetos/' + projA, { jar: 'bobB' });
  teste('B não abre projeto de A (anti-IDOR)', r.status === 400 || r.status === 404);
  r = await req('PATCH', '/vpe/api/projetos/' + projA, { body: { nome: 'hack' }, jar: 'bobB' });
  teste('B não edita projeto de A', r.status === 400 || r.status === 403 || r.status === 404);
  r = await req('POST', '/vpe/api/trocar-tenant', { body: { tenant_id: tenantA.id }, jar: 'bobB' });
  teste('B não troca para tenant A', r.status === 400 || r.status === 403);
  r = await req('GET', '/vpe/api/usuarios', { jar: 'bobB' });
  teste('usuários de B não contêm A', r.status === 200 && !r.dados.usuarios.some(u => u.email.endsWith('@alfa.com')));

  // ---------- convites + RBAC ----------
  r = await req('POST', '/vpe/api/convites', { body: { email: 'carla@alfa.com', papel: 'comercial' }, jar: 'anaA' });
  teste('convite criado com link e e-mail', r.status === 200 && /\/vpe\/convite\//.test(r.dados.link) && emails.length >= 1);
  const token = r.dados.link.split('/convite/')[1];
  r = await req('POST', '/vpe/api/convites', { body: { email: 'x@alfa.com', papel: 'dono' }, jar: 'anaA' });
  teste('convite não concede dono', r.status === 400);
  r = await req('POST', '/vpe/api/convites/aceitar', { body: { token, nome: 'Carla', senha: 'senha1234' }, jar: 'carlaA' });
  teste('aceite loga a Carla', r.status === 200);
  r = await req('POST', '/vpe/api/convites/aceitar', { body: { token, nome: 'Eve', senha: 'senha1234' } });
  teste('token de convite é uso único', r.status === 400);
  r = await req('GET', '/vpe/api/me', { jar: 'carlaA' });
  teste('Carla é comercial (gerir_crm sim, criar_projeto não)', r.dados.permissoes.gerir_crm === true && !r.dados.permissoes.criar_projeto);
  r = await req('POST', '/vpe/api/projetos', { body: { nome: 'x' }, jar: 'carlaA' });
  teste('comercial não cria projeto (403)', r.status === 403);
  r = await req('PATCH', '/vpe/api/projetos/' + projA, { body: { status: 'arquivado' }, jar: 'carlaA' });
  teste('arquivar exige decidir_projeto', r.status === 403);
  r = await req('GET', '/vpe/api/auditoria', { jar: 'carlaA' });
  teste('comercial não vê auditoria', r.status === 403);

  // ---------- papéis custom + dono protegido ----------
  r = await req('POST', '/vpe/api/papeis', { body: { nome: 'Estagiário', permissoes: ['ver_projetos', 'chave_falsa'] }, jar: 'anaA' });
  teste('papel custom criado (inválidas filtradas)', r.status === 200);
  const roleId = r.dados.id;
  const usuariosA = (await req('GET', '/vpe/api/usuarios', { jar: 'anaA' })).dados.usuarios;
  const vincCarla = usuariosA.find(u => u.email === 'carla@alfa.com').vinculo_id;
  r = await req('PATCH', '/vpe/api/usuarios/' + vincCarla, { body: { papel: 'custom:' + roleId }, jar: 'anaA' });
  teste('Carla assume papel custom', r.status === 200);
  r = await req('GET', '/vpe/api/me', { jar: 'carlaA' });
  teste('papel custom vale (ver_projetos sim, gerir_crm não)', r.dados.permissoes.ver_projetos === true && !r.dados.permissoes.gerir_crm);
  r = await req('DELETE', '/vpe/api/papeis/' + roleId, { jar: 'anaA' });
  teste('papel em uso não é excluído', r.status === 400);
  const vincAna = usuariosA.find(u => u.email === 'ana@alfa.com').vinculo_id;
  r = await req('PATCH', '/vpe/api/usuarios/' + vincAna, { body: { status: 'suspenso' }, jar: 'anaA' });
  teste('último dono não pode ser suspenso', r.status === 400);

  // ---------- limites do plano ----------
  const staffAtor = { id: 'adm', nome: 'Admin Villela' };
  repo.administrarTenant(tenantB.id, { plano_slug: 'starter' }, staffAtor, 'teste'); // 15 projetos
  for (let i = 0; i < 15; i++) repo.criarProjeto(tenantB.id, { nome: 'P' + i }, staffAtor, 'teste');
  let estourou = false;
  try { repo.criarProjeto(tenantB.id, { nome: 'P16' }, staffAtor, 'teste'); }
  catch (e) { estourou = /Limite do plano/.test(e.message); }
  teste('limite de projetos do Starter bloqueia o 16º', estourou);

  // ---------- SEED INTERNO VILLELA (16 projetos) ----------
  r = await req('POST', '/staff/api/vpe/semear-interno', { body: {}, staff: 'ceo' });
  teste('seed interno exige admin (ceo → 403)', r.status === 403);
  r = await req('POST', '/staff/api/vpe/semear-interno', { body: {}, staff: 'adm' });
  teste('seed interno cria tenant + 16 projetos + senha inicial', r.status === 200 && r.dados.projetos_criados === 16 && /^Villela-/.test(r.dados.senha_inicial));
  const senhaInterna = r.dados.senha_inicial;
  r = await req('POST', '/staff/api/vpe/semear-interno', { body: {}, staff: 'adm' });
  teste('seed é idempotente (0 novos, sem nova senha)', r.status === 200 && r.dados.projetos_criados === 0 && !r.dados.senha_inicial);
  // dono interno loga e vê os 16
  r = await req('POST', '/vpe/api/login', { body: { email: 'augusto.villela@gmail.com', senha: senhaInterna }, jar: 'gus' });
  teste('dono do workspace interno loga', r.status === 200);
  r = await req('GET', '/vpe/api/projetos', { jar: 'gus' });
  teste('workspace interno tem os 16 projetos', r.dados.projetos.length === 16 && r.dados.projetos.some(p => p.nome.includes('Villela Stay')));
  r = await req('GET', '/vpe/api/dashboard', { jar: 'gus' });
  teste('dashboard interno marca interno=true e soma estágios', r.dados.empresa.interno === true && r.dados.projetos_total === 16);
  // interno não trava por limite (enterprise + flag interno) e não pode ser suspenso
  let travou = false;
  try { for (let i = 0; i < 5; i++) repo.criarProjeto(repo.tenantPorSlug('villela-interno').id, { nome: 'Extra ' + i }, staffAtor, 'teste'); } catch (_) { travou = true; }
  teste('workspace interno não trava por limite', !travou);
  r = await req('PATCH', '/staff/api/vpe/tenants/' + repo.tenantPorSlug('villela-interno').id, { body: { status: 'suspensa' }, staff: 'adm' });
  teste('workspace interno não pode ser suspenso', r.status === 400);
  // isolamento também vale p/ o interno
  r = await req('GET', '/vpe/api/projetos', { jar: 'anaA' });
  teste('tenant A não vê projetos internos da Villela', !r.dados.projetos.some(p => p.nome.includes('Villela Stay')));

  // ---------- staff da plataforma ----------
  r = await req('GET', '/staff/api/vpe/resumo', { staff: 'ceo' });
  teste('staff resumo com projetos_total e MRR', r.status === 200 && r.dados.projetos_total >= 17 && typeof r.dados.mrr_centavos === 'number');
  r = await req('GET', '/staff/api/vpe/tenants', { staff: 'fora' });
  teste('área sem acesso → 403', r.status === 403);
  r = await req('PATCH', '/staff/api/vpe/tenants/' + tenantB.id, { body: { status: 'suspensa' }, staff: 'adm' });
  teste('admin suspende tenant B', r.status === 200 && r.dados.tenant.status === 'suspensa');
  r = await req('GET', '/vpe/api/dashboard', { jar: 'bobB' });
  teste('tenant suspenso → 402', r.status === 402);
  r = await req('PATCH', '/staff/api/vpe/tenants/' + tenantB.id, { body: { status: 'ativa' }, staff: 'adm' });
  teste('admin reativa tenant B', r.status === 200);

  // ---------- leads ----------
  r = await req('POST', '/vpe/api/leads', { body: { nome: 'Lead', email: 'lead@x.com', empresa: 'X Eventos' } });
  teste('lead da landing gravado', r.status === 200);
  r = await req('GET', '/staff/api/vpe/leads', { staff: 'adm' });
  teste('staff lista leads', r.status === 200 && r.dados.leads.some(l => l.email === 'lead@x.com'));
  teste('alertas de trial/lead disparados', alertas.length >= 3);

  srv.close();
  console.log(`\nVillela Projects selftest: ${ok} ok, ${falhas.length} falha(s).`);
  if (falhas.length) { console.error('Falhas:', falhas); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('ERRO FATAL DO SELFTEST:', e); process.exit(1); });
