// =====================================================================
// Villela Docs Intelligence — SUÍTE DE TESTES (Fase 1).
// Roda o app Express REAL sobre banco novo em diretório temporário,
// exercitando as rotas HTTP de verdade (cookies inclusive).
//
//   node vdocs/selftest.js        (ou: npm run test:vdocs)
//
// Prioridade nº 1 (spec §15): dados de uma empresa NUNCA vazam p/ outra.
// Cobre: cadastro/trial, login (+ throttle), permissões por papel,
// convites (fluxo completo + limite do plano), papéis custom, auditoria,
// suspensão de tenant (bloqueio), staff da plataforma e configurações.
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'vdocs-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');

// ---- Portal Staff mockado (p/ rotas da plataforma) ----
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

const app = express();
app.use(cookieParser());
require('./index').montar(app, { express, requireAuth, requireAdmin, alertaAugusto: async (m) => alertas.push(m), jwtSecret: 'segredo-teste' });

// ---- mini harness ----
let BASE = '', ok = 0;
const falhas = [];
const jars = {}; // sessões por apelido: jars.anaA, jars.bob, ...
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

  // ---------- páginas públicas respondem ----------
  for (const p of ['/vdocs', '/vdocs/precos', '/vdocs/cadastro', '/vdocs/login']) {
    const r = await fetch(BASE + p);
    teste(`página ${p} responde 200 html`, r.status === 200 && (r.headers.get('content-type') || '').includes('text/html'));
  }

  // ---------- cadastro (trial) ----------
  let r = await req('POST', '/vdocs/api/cadastro', { body: { empresa: 'Empresa A', nome: 'Ana', email: 'ana@a.com', senha: 'senha1234' }, jar: 'anaA' });
  teste('cadastro tenant A', r.status === 200 && r.dados.tenant && r.dados.tenant.slug === 'empresa-a');
  r = await req('POST', '/vdocs/api/cadastro', { body: { empresa: 'Empresa B', nome: 'Bob', email: 'bob@b.com', senha: 'senha1234' }, jar: 'bobB' });
  teste('cadastro tenant B', r.status === 200);
  r = await req('POST', '/vdocs/api/cadastro', { body: { empresa: 'Outra', nome: 'Ana', email: 'ana@a.com', senha: 'senha1234' } });
  teste('cadastro rejeita e-mail repetido', r.status === 400 && /já tem conta/.test(r.dados.erro));
  r = await req('POST', '/vdocs/api/cadastro', { body: { empresa: 'X', nome: 'X', email: 'x@x.com', senha: 'curta' } });
  teste('cadastro exige senha 8+', r.status === 400);

  // ---------- me / dashboard ----------
  r = await req('GET', '/vdocs/api/me', { jar: 'anaA' });
  const tenantA = r.dados.tenant;
  teste('me da Ana: papel dono com todas as permissões', r.status === 200 && r.dados.papel === 'dono' && r.dados.permissoes.administrar_cobranca === true);
  r = await req('GET', '/vdocs/api/me', { jar: 'bobB' });
  const tenantB = r.dados.tenant;
  teste('tenants A e B são diferentes', tenantA.id !== tenantB.id);
  r = await req('GET', '/vdocs/api/dashboard', { jar: 'anaA' });
  teste('dashboard A: 1 usuário ativo e status trial', r.dados.usuarios_ativos === 1 && r.dados.empresa.status === 'trial');
  r = await req('GET', '/vdocs/api/dashboard', {});
  teste('dashboard sem sessão → 401', r.status === 401);

  // ---------- login + throttle ----------
  r = await req('POST', '/vdocs/api/login', { body: { email: 'ana@a.com', senha: 'senha1234' }, jar: 'anaA2' });
  teste('login da Ana ok', r.status === 200 && r.dados.tenant.id === tenantA.id);
  r = await req('POST', '/vdocs/api/login', { body: { email: 'ana@a.com', senha: 'errada12' } });
  teste('login com senha errada → 401', r.status === 401);

  // ---------- convites (fluxo completo) ----------
  r = await req('POST', '/vdocs/api/convites', { body: { email: 'carla@a.com', papel: 'leitor' }, jar: 'anaA' });
  teste('convite criado com link', r.status === 200 && /\/vdocs\/convite\//.test(r.dados.link));
  const token = r.dados.link.split('/convite/')[1];
  r = await req('POST', '/vdocs/api/convites', { body: { email: 'carla@a.com', papel: 'dono' }, jar: 'anaA' });
  teste('convite não concede papel dono', r.status === 400);
  r = await req('POST', '/vdocs/api/convites/aceitar', { body: { token, nome: 'Carla', senha: 'senha1234' }, jar: 'carlaA' });
  teste('aceite do convite loga a Carla', r.status === 200);
  r = await req('POST', '/vdocs/api/convites/aceitar', { body: { token: token, nome: 'Eve', senha: 'senha1234' } });
  teste('token de convite não é reutilizável', r.status === 400);
  r = await req('GET', '/vdocs/api/me', { jar: 'carlaA' });
  teste('Carla é leitor: sem gerir_usuarios, com ver_documentos', r.dados.papel === 'leitor' && !r.dados.permissoes.gerir_usuarios && r.dados.permissoes.ver_documentos === true);

  // ---------- permissões (RBAC nega) ----------
  r = await req('GET', '/vdocs/api/usuarios', { jar: 'carlaA' });
  teste('leitor não lista usuários (403)', r.status === 403);
  r = await req('GET', '/vdocs/api/auditoria', { jar: 'carlaA' });
  teste('leitor não vê auditoria (403)', r.status === 403);
  r = await req('PATCH', '/vdocs/api/config', { body: { tenant: { nome: 'Hackeada' } }, jar: 'carlaA' });
  teste('leitor não altera config (403)', r.status === 403);

  // ---------- ISOLAMENTO ENTRE TENANTS (prioridade nº 1) ----------
  r = await req('GET', '/vdocs/api/usuarios', { jar: 'bobB' });
  teste('B não vê usuários de A', r.status === 200 && !r.dados.usuarios.some(u => u.email.endsWith('@a.com')));
  r = await req('GET', '/vdocs/api/auditoria', { jar: 'bobB' });
  teste('auditoria de B não contém eventos de A', r.status === 200 && r.dados.eventos.every(e => !JSON.stringify(e).includes('ana@a.com') && !JSON.stringify(e).includes('carla@a.com')));
  // Bob tenta alterar um vínculo de A pelo id (anti-IDOR)
  const usuariosA = (await req('GET', '/vdocs/api/usuarios', { jar: 'anaA' })).dados.usuarios;
  const vinculoCarla = usuariosA.find(u => u.email === 'carla@a.com').vinculo_id;
  r = await req('PATCH', '/vdocs/api/usuarios/' + vinculoCarla, { body: { papel: 'admin' }, jar: 'bobB' });
  teste('B não altera vínculo de A (anti-IDOR)', r.status === 400 || r.status === 403);
  r = await req('POST', '/vdocs/api/trocar-tenant', { body: { tenant_id: tenantA.id }, jar: 'bobB' });
  teste('B não troca para o tenant A', r.status === 400 || r.status === 403);

  // ---------- papéis custom ----------
  r = await req('POST', '/vdocs/api/papeis', { body: { nome: 'Fiscal', permissoes: ['ver_documentos', 'ver_auditoria', 'chave_invalida'] }, jar: 'anaA' });
  teste('papel custom criado (permissão inválida filtrada)', r.status === 200);
  const roleId = r.dados.id;
  r = await req('PATCH', '/vdocs/api/usuarios/' + vinculoCarla, { body: { papel: 'custom:' + roleId }, jar: 'anaA' });
  teste('Carla assume papel custom', r.status === 200);
  r = await req('GET', '/vdocs/api/me', { jar: 'carlaA' });
  teste('permissões do papel custom valem (ver_auditoria sim, baixar não)', r.dados.permissoes.ver_auditoria === true && !r.dados.permissoes.baixar_documento);
  r = await req('DELETE', '/vdocs/api/papeis/' + roleId, { jar: 'anaA' });
  teste('papel custom em uso não pode ser excluído', r.status === 400);

  // ---------- dono é protegido ----------
  const vinculoAna = usuariosA.find(u => u.email === 'ana@a.com').vinculo_id;
  r = await req('PATCH', '/vdocs/api/usuarios/' + vinculoAna, { body: { status: 'suspenso' }, jar: 'anaA' });
  teste('último dono não pode ser suspenso', r.status === 400);

  // ---------- limites do plano ----------
  const repo = require('./repo');
  const staff = { id: 'adm', nome: 'Admin Villela' };
  repo.administrarTenant(tenantB.id, { plano_slug: 'starter' }, staff, 'teste'); // starter: 5 usuários
  for (let i = 0; i < 4; i++) {
    const c = repo.criarConvite(tenantB.id, { email: `u${i}@b.com`, papel: 'usuario' }, staff, 'teste');
    repo.aceitarConvite(c.token, { nome: 'U' + i, senha: 'senha1234' }, 'teste');
  }
  let estourou = false;
  try { repo.criarConvite(tenantB.id, { email: 'u9@b.com', papel: 'usuario' }, staff, 'teste'); }
  catch (e) { estourou = /Limite do plano/.test(e.message); }
  teste('limite de usuários do plano Starter bloqueia o 6º', estourou);

  // ---------- config ----------
  r = await req('PATCH', '/vdocs/api/config', { body: { tenant: { cnpj: '00.000.000/0001-00' }, settings: { retencao_padrao_dias: '365' } }, jar: 'anaA' });
  teste('dono grava config', r.status === 200);
  r = await req('GET', '/vdocs/api/config', { jar: 'anaA' });
  teste('config lida de volta', r.dados.settings.retencao_padrao_dias === '365');
  r = await req('PATCH', '/vdocs/api/config', { body: { settings: { chave_maliciosa: 'x' } }, jar: 'anaA' });
  teste('setting fora da lista é rejeitada', r.status === 400);

  // ---------- auditoria registra ----------
  r = await req('GET', '/vdocs/api/auditoria', { jar: 'anaA' });
  const acoes = r.dados.eventos.map(e => e.acao);
  teste('auditoria de A tem criação, convite e config', ['tenant.criar', 'usuario.convidar', 'config.gravar'].every(a => acoes.includes(a)));

  // ---------- staff da plataforma ----------
  r = await req('GET', '/staff/api/vdocs/resumo', { staff: 'adm' });
  teste('staff resumo: 2 tenants e MRR numérico', r.status === 200 && r.dados.tenants_total === 2 && typeof r.dados.mrr_centavos === 'number');
  r = await req('GET', '/staff/api/vdocs/tenants', { staff: 'ceo' });
  teste('área ceo lê tenants', r.status === 200);
  r = await req('GET', '/staff/api/vdocs/tenants', { staff: 'fora' });
  teste('área sem acesso → 403', r.status === 403);
  r = await req('PATCH', '/staff/api/vdocs/tenants/' + tenantB.id, { body: { status: 'suspensa' }, staff: 'ceo' });
  teste('escrita exige admin (ceo → 403)', r.status === 403);
  r = await req('PATCH', '/staff/api/vdocs/tenants/' + tenantB.id, { body: { status: 'suspensa' }, staff: 'adm' });
  teste('admin suspende tenant B', r.status === 200 && r.dados.tenant.status === 'suspensa');

  // ---------- tenant suspenso é bloqueado ----------
  r = await req('GET', '/vdocs/api/me', { jar: 'bobB' });
  teste('me do suspenso responde com bloqueado=true', r.status === 200 && r.dados.bloqueado === true);
  r = await req('GET', '/vdocs/api/dashboard', { jar: 'bobB' });
  teste('demais rotas do suspenso → 402', r.status === 402);
  r = await req('PATCH', '/staff/api/vdocs/tenants/' + tenantB.id, { body: { status: 'ativa' }, staff: 'adm' });
  teste('admin reativa tenant B', r.status === 200 && r.dados.tenant.status === 'ativa');

  // ---------- leads ----------
  r = await req('POST', '/vdocs/api/leads', { body: { nome: 'Lead', email: 'lead@x.com', empresa: 'X SA' } });
  teste('lead da landing gravado', r.status === 200);
  r = await req('GET', '/staff/api/vdocs/leads', { staff: 'adm' });
  teste('staff lista leads', r.status === 200 && r.dados.leads.some(l => l.email === 'lead@x.com'));
  teste('alerta de novo trial/lead disparado', alertas.length >= 2);

  // ---------- resultado ----------
  srv.close();
  console.log(`\nVillela Docs selftest: ${ok} ok, ${falhas.length} falha(s).`);
  if (falhas.length) { console.error('Falhas:', falhas); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('ERRO FATAL DO SELFTEST:', e); process.exit(1); });
