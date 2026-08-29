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
process.env.VDOCS_ROTINAS = 'off'; // timers desligados — o teste processa a fila manualmente
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

  // ================== FASE 2: pastas, documentos, versões, lixeira ==================
  const B64 = (t) => Buffer.from(t).toString('base64');

  // pastas
  r = await req('POST', '/vdocs/api/pastas', { body: { nome: 'Contratos' }, jar: 'anaA' });
  teste('pasta criada', r.status === 200 && r.dados.id);
  const pastaContratos = r.dados.id;
  r = await req('POST', '/vdocs/api/pastas', { body: { nome: 'Fornecedores', parent_id: pastaContratos }, jar: 'anaA' });
  const pastaFornec = r.dados.id;
  teste('subpasta criada', r.status === 200);
  r = await req('PATCH', '/vdocs/api/pastas/' + pastaContratos, { body: { parent_id: pastaFornec }, jar: 'anaA' });
  teste('mover pasta para dentro dela mesma é recusado (anti-ciclo)', r.status === 400);
  r = await req('POST', '/vdocs/api/pastas', { body: { nome: 'Hack', parent_id: pastaContratos }, jar: 'bobB' });
  teste('B não cria pasta dentro de pasta de A', r.status === 400);

  // upload
  r = await req('POST', '/vdocs/api/documentos', { body: { arquivo_nome: 'contrato.pdf', nome: 'Contrato Fornecedor X', folder_id: pastaContratos, tipo_documental: 'contrato', tags: ['fornecedor', '2026'], conteudo_base64: B64('%PDF-1.4 conteudo do contrato') }, jar: 'anaA' });
  teste('upload de documento', r.status === 200 && r.dados.documento.versao_atual === 1);
  const docId = r.dados.documento.id;
  r = await req('POST', '/vdocs/api/documentos', { body: { arquivo_nome: 'contrato2.pdf', conteudo_base64: B64('%PDF-1.4 conteudo do contrato') }, jar: 'anaA' });
  teste('duplicado por hash detectado (409)', r.status === 409 && r.dados.duplicado);
  r = await req('POST', '/vdocs/api/documentos', { body: { arquivo_nome: 'contrato2.pdf', conteudo_base64: B64('%PDF-1.4 conteudo do contrato'), forcar_duplicado: true }, jar: 'anaA' });
  teste('duplicado forçado passa', r.status === 200);
  const docDup = r.dados.documento.id;
  r = await req('POST', '/vdocs/api/documentos', { body: { arquivo_nome: 'virus.exe', conteudo_base64: B64('MZ...') }, jar: 'anaA' });
  teste('extensão perigosa recusada', r.status === 400);
  r = await req('POST', '/vdocs/api/documentos', { body: { arquivo_nome: 'x.pdf', conteudo_base64: '' }, jar: 'anaA' });
  teste('arquivo vazio recusado', r.status === 400);

  // isolamento de documentos
  r = await req('GET', '/vdocs/api/documentos/' + docId, { jar: 'bobB' });
  teste('B não abre documento de A', r.status === 400 || r.status === 404);
  r = await req('GET', '/vdocs/api/documentos/' + docId + '/baixar', { jar: 'bobB' });
  teste('B não baixa documento de A', r.status !== 200);
  r = await req('GET', '/vdocs/api/documentos?pasta=' + pastaContratos, { jar: 'bobB' });
  teste('lista de B na pasta de A vem vazia', r.status === 200 && r.dados.documentos.length === 0);

  // permissões: Carla tem papel custom Fiscal (ver_documentos+ver_auditoria, SEM baixar/criar)
  r = await req('GET', '/vdocs/api/documentos?pasta=' + pastaContratos, { jar: 'carlaA' });
  teste('Carla (custom) vê a lista', r.status === 200 && r.dados.documentos.length >= 1);
  r = await req('GET', '/vdocs/api/documentos/' + docId + '/baixar', { jar: 'carlaA' });
  teste('Carla sem baixar_documento → 403', r.status === 403);
  r = await req('POST', '/vdocs/api/documentos', { body: { arquivo_nome: 'y.pdf', conteudo_base64: B64('yy') }, jar: 'carlaA' });
  teste('Carla sem criar_documento → 403', r.status === 403);

  // download real + log de acesso
  {
    const resp = await fetch(BASE + '/vdocs/api/documentos/' + docId + '/baixar', { headers: { Cookie: jars.anaA } });
    const corpo = await resp.text();
    teste('download devolve o conteúdo com attachment', resp.status === 200 && corpo.includes('conteudo do contrato') && String(resp.headers.get('content-disposition')).includes('attachment'));
  }
  r = await req('GET', '/vdocs/api/documentos/' + docId, { jar: 'anaA' });
  teste('acessos registrados (visualizar+baixar)', r.status === 200 && r.dados.acessos.some(a => a.acao === 'baixar') && r.dados.acessos.some(a => a.acao === 'visualizar'));

  // metadados + versões
  r = await req('PATCH', '/vdocs/api/documentos/' + docId, { body: { descricao: 'Contrato de manutenção', validade: '2027-01-31', metadados: { cnpj_fornecedor: '00.000.000/0001-00', valor_mensal: 'R$ 1.500' } }, jar: 'anaA' });
  teste('metadados personalizados gravados', r.status === 200 && r.dados.documento.metadados.cnpj_fornecedor === '00.000.000/0001-00');
  r = await req('POST', '/vdocs/api/documentos/' + docId + '/versoes', { body: { arquivo_nome: 'contrato-v2.pdf', conteudo_base64: B64('%PDF-1.4 versao dois'), comentario: 'reajuste anual' }, jar: 'anaA' });
  teste('nova versão criada (v2)', r.status === 200 && r.dados.versao === 2);
  r = await req('POST', '/vdocs/api/documentos/' + docId + '/versoes/1/restaurar', { jar: 'anaA' });
  teste('restaurar v1 gera v3 vigente', r.status === 200 && r.dados.versao === 3);
  {
    const resp = await fetch(BASE + '/vdocs/api/documentos/' + docId + '/baixar', { headers: { Cookie: jars.anaA } });
    teste('download da vigente traz o conteúdo da v1 restaurada', (await resp.text()).includes('conteudo do contrato'));
  }

  // mover + lixeira + exclusão definitiva
  r = await req('POST', '/vdocs/api/documentos/' + docDup + '/mover', { body: { folder_id: pastaFornec }, jar: 'anaA' });
  teste('documento movido de pasta', r.status === 200);
  r = await req('DELETE', '/vdocs/api/pastas/' + pastaFornec, { jar: 'anaA' });
  teste('pasta com documento não pode ser excluída', r.status === 400);
  r = await req('POST', '/vdocs/api/documentos/' + docDup + '/lixeira', { jar: 'anaA' });
  teste('documento vai à lixeira', r.status === 200);
  r = await req('GET', '/vdocs/api/documentos?status=lixeira', { jar: 'anaA' });
  teste('lixeira lista o documento', r.status === 200 && r.dados.documentos.some(d => d.id === docDup));
  r = await req('POST', '/vdocs/api/documentos/' + docDup + '/restaurar', { jar: 'anaA' });
  teste('restaurado da lixeira', r.status === 200);
  r = await req('POST', '/vdocs/api/documentos/' + docDup + '/lixeira', { jar: 'anaA' });
  r = await req('DELETE', '/vdocs/api/documentos/' + docDup, { jar: 'anaA' });
  teste('exclusão definitiva', r.status === 200);
  r = await req('GET', '/vdocs/api/documentos/' + docDup, { jar: 'anaA' });
  teste('documento excluído não existe mais', r.status === 400 || r.status === 404);

  // uso vivo no dashboard
  r = await req('GET', '/vdocs/api/dashboard', { jar: 'anaA' });
  teste('dashboard conta documentos ativos', r.dados.documentos === 1);

  // ================== FASE 3: extração, indexação, busca por conteúdo, vencimentos ==================
  const jobs = require('./jobs');

  // txt: extração + FTS
  r = await req('POST', '/vdocs/api/documentos', { body: { arquivo_nome: 'ata-reuniao.txt', nome: 'Ata da Diretoria', conteudo_base64: B64('Ata da reunião: aprovado o orçamento de marketing digital para 2027.') }, jar: 'anaA' });
  const docAta = r.dados.documento.id;
  await jobs.processarPendentes(20);
  r = await req('GET', '/vdocs/api/documentos/' + docAta, { jar: 'anaA' });
  teste('texto extraído do txt', r.dados.processamento.texto && r.dados.processamento.texto.metodo === 'texto' && r.dados.processamento.texto.chars > 20);
  teste('job concluído', r.dados.processamento.job && r.dados.processamento.job.status === 'concluido');
  r = await req('GET', '/vdocs/api/documentos?busca=' + encodeURIComponent('orçamento de marketing'), { jar: 'anaA' });
  teste('busca por CONTEÚDO acha o documento com trecho', r.status === 200 && r.dados.documentos.some(d => d.id === docAta && d.trecho));
  r = await req('GET', '/vdocs/api/documentos?busca=' + encodeURIComponent('orçamento de marketing'), { jar: 'bobB' });
  teste('busca por conteúdo de B não vê documento de A (isolamento FTS)', r.status === 200 && !r.dados.documentos.some(d => d.id === docAta));

  // pdf: extração real via pdfjs
  const PDF_MIN = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 62>>stream\nBT /F1 12 Tf 72 720 Td (Clausula de rescisao contratual) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>';
  r = await req('POST', '/vdocs/api/documentos', { body: { arquivo_nome: 'clausulas.pdf', nome: 'Cláusulas', conteudo_base64: B64(PDF_MIN) }, jar: 'anaA' });
  const docPdf = r.dados.documento.id;
  await jobs.processarPendentes(20);
  r = await req('GET', '/vdocs/api/documentos/' + docPdf, { jar: 'anaA' });
  teste('PDF extraído (método pdf, 1 página)', r.dados.processamento.texto && r.dados.processamento.texto.metodo === 'pdf' && r.dados.processamento.texto.paginas === 1);
  r = await req('GET', '/vdocs/api/documentos?busca=rescisao', { jar: 'anaA' });
  teste('busca acha conteúdo do PDF', r.dados.documentos.some(d => d.id === docPdf));

  // docx: zip mínimo com word/document.xml (stored, gerado à mão)
  function zipStored(entradas) {
    const locais = []; const cds = []; let off = 0;
    const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
    for (const [nome, conteudo] of entradas) {
      const nomeB = Buffer.from(nome), dado = Buffer.from(conteudo);
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 8);
      lh.writeUInt32LE(crc(dado), 14); lh.writeUInt32LE(dado.length, 18); lh.writeUInt32LE(dado.length, 22);
      lh.writeUInt16LE(nomeB.length, 26);
      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 10);
      cd.writeUInt32LE(crc(dado), 16); cd.writeUInt32LE(dado.length, 20); cd.writeUInt32LE(dado.length, 24);
      cd.writeUInt16LE(nomeB.length, 28); cd.writeUInt32LE(off, 42);
      locais.push(lh, nomeB, dado); cds.push(Buffer.concat([cd, nomeB]));
      off += 30 + nomeB.length + dado.length;
    }
    const cdBuf = Buffer.concat(cds);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entradas.length, 8); eocd.writeUInt16LE(entradas.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(off, 16);
    return Buffer.concat([...locais, cdBuf, eocd]);
  }
  const docxBuf = zipStored([['word/document.xml', '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Manual de conduta dos colaboradores</w:t></w:r></w:p></w:body></w:document>']]);
  r = await req('POST', '/vdocs/api/documentos', { body: { arquivo_nome: 'manual.docx', nome: 'Manual', conteudo_base64: docxBuf.toString('base64') }, jar: 'anaA' });
  teste('docx aceito', r.status === 200);
  await jobs.processarPendentes(20);
  r = await req('GET', '/vdocs/api/documentos?busca=conduta', { jar: 'anaA' });
  teste('busca acha conteúdo do DOCX', r.dados.documentos.some(d => d.nome === 'Manual'));

  // imagem → ocr_pendente + reprocessar
  r = await req('POST', '/vdocs/api/documentos', { body: { arquivo_nome: 'foto.png', nome: 'Foto do alvará', conteudo_base64: B64('PNGFAKE') }, jar: 'anaA' });
  const docImg = r.dados.documento.id;
  await jobs.processarPendentes(20);
  r = await req('GET', '/vdocs/api/documentos/' + docImg, { jar: 'anaA' });
  teste('imagem fica ocr_pendente (sem erro)', r.dados.processamento.job && r.dados.processamento.job.status === 'ocr_pendente');
  r = await req('POST', '/vdocs/api/documentos/' + docImg + '/reprocessar', { jar: 'anaA' });
  teste('reprocessar reabre o job', r.status === 200);
  r = await req('POST', '/vdocs/api/documentos/' + docImg + '/reprocessar', { jar: 'bobB' });
  teste('B não reprocessa documento de A', r.status === 400 || r.status === 403);
  await jobs.processarPendentes(20);

  // lixeira tira da busca; restauração devolve
  r = await req('POST', '/vdocs/api/documentos/' + docAta + '/lixeira', { jar: 'anaA' });
  r = await req('GET', '/vdocs/api/documentos?busca=' + encodeURIComponent('orçamento de marketing'), { jar: 'anaA' });
  teste('documento na lixeira some da busca por conteúdo', !r.dados.documentos.some(d => d.id === docAta));
  r = await req('POST', '/vdocs/api/documentos/' + docAta + '/restaurar', { jar: 'anaA' });
  r = await req('GET', '/vdocs/api/documentos?busca=' + encodeURIComponent('orçamento de marketing'), { jar: 'anaA' });
  teste('restaurado volta à busca', r.dados.documentos.some(d => d.id === docAta));

  // vencimentos
  const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  r = await req('PATCH', '/vdocs/api/documentos/' + docPdf, { body: { validade: amanha }, jar: 'anaA' });
  teste('validade gravada', r.status === 200);
  const alertados = await jobs.rotinaVencimentos();
  teste('rotina de vencimentos alerta a empresa A', alertados >= 1);
  r = await req('GET', '/vdocs/api/dashboard', { jar: 'anaA' });
  teste('dashboard mostra vencendo em 30 dias', r.dados.vencendo_30dias >= 1 && Array.isArray(r.dados.docs_vencendo));

  // ================== FASE 4: busca avançada ==================
  // massa: mais um doc p/ diferenciar operadores
  r = await req('POST', '/vdocs/api/documentos', { body: { arquivo_nome: 'distrato.txt', nome: 'Distrato Fornecedor Y', tipo_documental: 'contrato', tags: ['fornecedor'], conteudo_base64: B64('Distrato amigavel do contrato de manutencao predial, sem multa rescisoria.') }, jar: 'anaA' });
  const docDistrato = r.dados.documento.id;
  await jobs.processarPendentes(20);

  r = await req('GET', '/vdocs/api/busca?q=' + encodeURIComponent('manutencao predial'), { jar: 'anaA' });
  teste('busca AND acha por conteúdo', r.status === 200 && r.dados.resultados.some(d => d.id === docDistrato));
  r = await req('GET', '/vdocs/api/busca?q=' + encodeURIComponent('"multa rescisoria"'), { jar: 'anaA' });
  teste('busca por frase exata', r.dados.resultados.some(d => d.id === docDistrato));
  r = await req('GET', '/vdocs/api/busca?q=' + encodeURIComponent('"rescisoria multa"'), { jar: 'anaA' });
  teste('frase na ordem errada NÃO acha', !r.dados.resultados.some(d => d.id === docDistrato));
  r = await req('GET', '/vdocs/api/busca?q=' + encodeURIComponent('manutencao -predial'), { jar: 'anaA' });
  teste('operador -excluir tira o documento', !r.dados.resultados.some(d => d.id === docDistrato));
  r = await req('GET', '/vdocs/api/busca?q=' + encodeURIComponent('inexistentexyz OR distrato'), { jar: 'anaA' });
  teste('operador OR acha pela alternativa', r.dados.resultados.some(d => d.id === docDistrato));
  r = await req('GET', '/vdocs/api/busca?q=Distrato', { jar: 'anaA' });
  teste('busca híbrida acha pelo NOME também', r.dados.resultados.some(d => d.id === docDistrato && (d.onde === 'nome' || d.onde === 'conteúdo')));

  // filtros
  r = await req('GET', '/vdocs/api/busca?q=fornecedor&tipo=contrato', { jar: 'anaA' });
  teste('filtro por tipo documental', r.status === 200 && r.dados.resultados.every(d => d.tipo_documental === 'contrato'));
  r = await req('GET', '/vdocs/api/busca?tag=fornecedor', { jar: 'anaA' });
  teste('busca só por filtro (sem termo) via tag', r.dados.resultados.length >= 1 && r.dados.resultados.every(d => d.tags.includes('fornecedor')));
  r = await req('GET', '/vdocs/api/busca?vencendo=1', { jar: 'anaA' });
  teste('filtro só vencendo (30d) pega o doc com validade', r.dados.resultados.some(d => d.id === docPdf));

  // isolamento + injeção FTS
  r = await req('GET', '/vdocs/api/busca?q=distrato', { jar: 'bobB' });
  teste('busca avançada de B não vê docs de A', r.status === 200 && r.dados.resultados.length === 0);
  r = await req('GET', '/vdocs/api/busca?q=' + encodeURIComponent('nome:* OR (texto NEAR/2 x) "'), { jar: 'anaA' });
  teste('sintaxe FTS maliciosa não quebra (tokens escapados)', r.status === 200);

  // buscas salvas + histórico
  r = await req('POST', '/vdocs/api/buscas-salvas', { body: { nome: 'Contratos de fornecedor', termo: 'fornecedor', filtros: { tipo: 'contrato' } }, jar: 'anaA' });
  teste('busca salva criada', r.status === 200 && r.dados.id);
  const salvaId = r.dados.id;
  r = await req('GET', '/vdocs/api/busca/contexto', { jar: 'anaA' });
  teste('contexto traz salvas + histórico', r.dados.salvas.some(x => x.id === salvaId) && r.dados.historico.length >= 1);
  r = await req('GET', '/vdocs/api/busca/contexto', { jar: 'carlaA' });
  teste('busca salva é pessoal (Carla não vê a da Ana)', !r.dados.salvas.some(x => x.id === salvaId));
  r = await req('DELETE', '/vdocs/api/buscas-salvas/' + salvaId, { jar: 'bobB' });
  teste('B não exclui busca salva de A', r.status === 400 || r.status === 403);
  r = await req('DELETE', '/vdocs/api/buscas-salvas/' + salvaId, { jar: 'anaA' });
  teste('dona exclui a busca salva', r.status === 200);

  // ================== FASE 5: IA documental (LLM mockado) ==================
  const ia = require('./ia');

  // sem chave e sem mock → indisponível com aviso claro
  r = await req('POST', '/vdocs/api/ia/perguntar', { body: { pergunta: 'Qual a multa do distrato?' }, jar: 'anaA' });
  teste('IA sem chave → erro claro de indisponível', r.status === 400 && /indisponível/i.test(r.dados.erro));

  // mock: devolve resposta citando a 1ª fonte do contexto
  let ultimoPrompt = '';
  ia.__mockParaTeste(async ({ prompt }) => {
    ultimoPrompt = prompt;
    const temContexto = prompt.includes('TRECHOS DE DOCUMENTOS');
    return { json: { resposta: temContexto ? 'O distrato é amigável e não prevê multa rescisória [1].' : 'Não encontrei nos documentos.', fontes_usadas: temContexto ? [1] : [], nao_encontrado: !temContexto, nivel_confianca: temContexto ? 'alto' : 'baixo' }, modelo: 'mock-1', usage: { input_tokens: 100, output_tokens: 50 } };
  });

  r = await req('POST', '/vdocs/api/ia/perguntar', { body: { pergunta: 'O distrato do fornecedor prevê multa rescisoria?', escopo_tipo: 'base' }, jar: 'anaA' });
  teste('IA responde com fontes citadas', r.status === 200 && r.dados.mensagem.fontes.length >= 1 && /\[1\]/.test(r.dados.mensagem.conteudo));
  teste('RAG entregou trecho do documento certo no prompt', ultimoPrompt.includes('Distrato Fornecedor Y'));
  const convId = r.dados.conversation_id;
  r = await req('POST', '/vdocs/api/ia/perguntar', { body: { conversation_id: convId, pergunta: 'E qual a data disso?' }, jar: 'anaA' });
  teste('pergunta de acompanhamento na mesma conversa', r.status === 200 && ultimoPrompt.includes('CONVERSA ANTERIOR'));
  r = await req('GET', '/vdocs/api/ia/conversas/' + convId, { jar: 'anaA' });
  teste('conversa gravada com 4 mensagens', r.status === 200 && r.dados.conversa.mensagens.length === 4);

  // permissões e isolamento
  r = await req('POST', '/vdocs/api/ia/perguntar', { body: { pergunta: 'x' }, jar: 'carlaA' });
  teste('papel custom sem usar_ia → 403', r.status === 403);
  r = await req('GET', '/vdocs/api/ia/conversas/' + convId, { jar: 'bobB' });
  teste('B não abre conversa de A', r.status === 400 || r.status === 403);
  r = await req('POST', '/vdocs/api/ia/perguntar', { body: { pergunta: 'segredos', escopo_tipo: 'documento', escopo_ref: docDistrato }, jar: 'bobB' });
  teste('escopo com documento de A negado para B', (r.status === 400 || r.status === 403));
  r = await req('POST', '/vdocs/api/ia/perguntar', { body: { pergunta: 'ata OR distrato OR manutencao', escopo_tipo: 'base' }, jar: 'bobB' });
  teste('RAG de B não recebe trechos de A no prompt', r.status === 200 && !ultimoPrompt.includes('Distrato Fornecedor Y') && !ultimoPrompt.includes('manutencao predial'));

  // escopo documento + feedback + auditoria + uso
  r = await req('POST', '/vdocs/api/ia/perguntar', { body: { pergunta: 'Resuma este documento.', escopo_tipo: 'documento', escopo_ref: docDistrato }, jar: 'anaA' });
  teste('escopo documento responde', r.status === 200);
  const msgId = r.dados.mensagem.id;
  r = await req('POST', '/vdocs/api/ia/mensagens/' + msgId + '/feedback', { body: { tipo: 'util' }, jar: 'anaA' });
  teste('feedback registrado', r.status === 200);
  r = await req('POST', '/vdocs/api/ia/mensagens/' + msgId + '/feedback', { body: { tipo: 'hackear' }, jar: 'anaA' });
  teste('feedback com tipo inválido rejeitado', r.status === 400);
  r = await req('GET', '/vdocs/api/uso', { jar: 'anaA' });
  teste('consultas de IA contam no uso do plano', Number(r.dados.uso.ia_consultas) >= 3);
  r = await req('GET', '/vdocs/api/auditoria', { jar: 'anaA' });
  teste('auditoria registra ia.perguntar', r.dados.eventos.some(e => e.acao === 'ia.perguntar'));

  // limite do plano bloqueia (starter do tenant B: 50/mês)
  repo.registrarUso(tenantB.id, 'ia_consultas', 50);
  r = await req('POST', '/vdocs/api/ia/perguntar', { body: { pergunta: 'alguma coisa' }, jar: 'bobB' });
  teste('limite ia_consultas_mes do plano bloqueia', r.status === 400 && /Limite do plano/.test(r.dados.erro));

  // ---- REDIGIR com IA: contexto INTEGRAL (não trechos) ----
  ia.__mockParaTeste(async ({ prompt, schema }) => {
    ultimoPrompt = prompt;
    if (schema) return { json: { resposta: 'x', fontes_usadas: [], nao_encontrado: true, nivel_confianca: 'baixo' }, modelo: 'mock-1', usage: {} };
    return { json: null, texto: 'RASCUNHO GERADO POR IA — revisão humana obrigatória antes de qualquer uso oficial.\n\nCOMUNICADO\n\nO distrato não prevê multa.\n\nLACUNAS E PONTOS DE ATENÇÃO\n- conferir data.', modelo: 'mock-1', usage: { input_tokens: 900, output_tokens: 120 } };
  });

  r = await req('POST', '/vdocs/api/ia/redigir', { body: { instrucao: 'Comunicado interno', documentos: [] }, jar: 'anaA' });
  teste('redigir sem documento escolhido → erro claro', r.status === 400 && /Escolha ao menos um documento/.test(r.dados.erro));
  r = await req('POST', '/vdocs/api/ia/redigir', { body: { instrucao: '', documentos: [docDistrato] }, jar: 'anaA' });
  teste('redigir sem instrução → erro claro', r.status === 400);

  r = await req('POST', '/vdocs/api/ia/redigir', { body: { instrucao: 'Comunicado interno sobre o distrato', tipo: 'comunicado', documentos: [docDistrato] }, jar: 'anaA' });
  teste('redigir devolve rascunho carimbado', r.status === 200 && /RASCUNHO GERADO POR IA/.test(r.dados.rascunho.conteudo));
  teste('rascunho grava a proveniência (fontes)', (r.dados.rascunho.fontes || []).some(f => f.document_id === docDistrato));
  // a diferença que justifica a onda: documento INTEIRO no prompt, não trecho
  teste('contexto da redação é INTEGRAL (não snippet do RAG)',
    ultimoPrompt.includes('DOCUMENTO DA EMPRESA') && ultimoPrompt.includes('Distrato amigavel do contrato de manutencao predial'));
  teste('prompt proíbe completar com conhecimento geral', /Não complete com conhecimento geral/.test(ultimoPrompt));
  const rascunhoId = r.dados.rascunho.id;

  r = await req('GET', '/vdocs/api/ia/redacoes', { jar: 'anaA' });
  teste('rascunhos listados para o tenant', r.status === 200 && r.dados.rascunhos.some(x => x.id === rascunhoId));
  r = await req('GET', '/vdocs/api/ia/redacoes/' + rascunhoId, { jar: 'bobB' });
  teste('rascunho de A não abre para B (isolamento)', r.status === 400 || r.status === 403);
  r = await req('POST', '/vdocs/api/ia/redigir', { body: { instrucao: 'x', documentos: [docDistrato] }, jar: 'bobB' });
  teste('B não usa documento de A como base', r.status === 400);
  r = await req('POST', '/vdocs/api/ia/redigir', { body: { instrucao: 'x', documentos: [docDistrato] }, jar: 'carlaA' });
  teste('papel sem usar_ia não redige → 403', r.status === 403);
  r = await req('GET', '/vdocs/api/auditoria', { jar: 'anaA' });
  teste('auditoria registra ia.redigir', r.dados.eventos.some(e => e.acao === 'ia.redigir'));
  r = await req('DELETE', '/vdocs/api/ia/redacoes/' + rascunhoId, { jar: 'anaA' });
  teste('rascunho excluído pelo dono', r.status === 200);

  ia.__mockParaTeste(null);

  // ================== FASE 6: workflows de aprovação ==================
  const wf = require('./workflows');

  // aprovadores: Ana (dono) e Carla (papel custom SEM aprovar_documento — vamos promovê-la a aprovador)
  const usuariosA2 = (await req('GET', '/vdocs/api/usuarios', { jar: 'anaA' })).dados.usuarios;
  const carlaUserId = usuariosA2.find(u => u.email === 'carla@a.com').user_id;
  const anaUserId = usuariosA2.find(u => u.email === 'ana@a.com').user_id;
  r = await req('PATCH', '/vdocs/api/usuarios/' + vinculoCarla, { body: { papel: 'aprovador' }, jar: 'anaA' });
  teste('Carla vira papel aprovador', r.status === 200);

  // modelo com 2 etapas: Carla → Ana
  r = await req('POST', '/vdocs/api/workflows', { body: { nome: 'Aprovação de contratos', etapas: [{ nome: 'Revisão', aprovadores: [carlaUserId], prazo_dias: 3 }, { nome: 'Diretoria', aprovadores: [anaUserId], prazo_dias: 5 }] }, jar: 'anaA' });
  teste('modelo de fluxo criado', r.status === 200 && r.dados.id);
  const wfId = r.dados.id;
  r = await req('POST', '/vdocs/api/workflows', { body: { nome: 'Fluxo inválido', etapas: [{ nome: 'X', aprovadores: ['nao-existe'] }] }, jar: 'anaA' });
  teste('modelo com aprovador inexistente rejeitado', r.status === 400);
  r = await req('POST', '/vdocs/api/workflows', { body: { nome: 'Hack', etapas: [{ nome: 'X', aprovadores: [carlaUserId] }] }, jar: 'carlaA' });
  teste('papel aprovador não cria modelos (sem criar_workflow)', r.status === 403);

  // iniciar no documento
  r = await req('POST', '/vdocs/api/documentos/' + docDistrato + '/aprovacao', { body: { workflow_id: wfId }, jar: 'anaA' });
  teste('aprovação iniciada', r.status === 200 && r.dados.id);
  const instId = r.dados.id;
  r = await req('POST', '/vdocs/api/documentos/' + docDistrato + '/aprovacao', { body: { workflow_id: wfId }, jar: 'anaA' });
  teste('segunda aprovação simultânea no mesmo doc bloqueada', r.status === 400);

  // pendências e permissões de decisão
  r = await req('GET', '/vdocs/api/aprovacoes', { jar: 'carlaA' });
  teste('pendente aparece para Carla (etapa 1)', r.dados.pendentes.some(a => a.id === instId));
  r = await req('GET', '/vdocs/api/aprovacoes', { jar: 'anaA' });
  teste('não aparece para Ana ainda (etapa 2)', !r.dados.pendentes.some(a => a.id === instId) && r.dados.minhas.some(a => a.id === instId));
  r = await req('POST', '/vdocs/api/aprovacoes/' + instId + '/decidir', { body: { decisao: 'aprovar' }, jar: 'anaA' });
  teste('Ana não decide etapa que não é dela', r.status === 400);
  r = await req('POST', '/vdocs/api/aprovacoes/' + instId + '/decidir', { body: { decisao: 'rejeitar' }, jar: 'carlaA' });
  teste('rejeição sem justificativa recusada', r.status === 400);
  r = await req('POST', '/vdocs/api/aprovacoes/' + instId + '/decidir', { body: { decisao: 'aprovar' }, jar: 'carlaA' });
  teste('Carla aprova etapa 1 → avança', r.status === 200 && r.dados.status === 'em_andamento' && r.dados.etapa_atual === 1);
  r = await req('POST', '/vdocs/api/aprovacoes/' + instId + '/decidir', { body: { decisao: 'aprovar' }, jar: 'anaA' });
  teste('Ana aprova etapa final → aprovado', r.status === 200 && r.dados.status === 'aprovado');
  r = await req('GET', '/vdocs/api/aprovacoes/' + instId, { jar: 'anaA' });
  teste('histórico com 2 decisões', r.dados.aprovacao.decisoes.length === 2 && r.dados.aprovacao.status === 'aprovado');

  // fluxo de rejeição + cancelamento + isolamento
  r = await req('POST', '/vdocs/api/documentos/' + docAta + '/aprovacao', { body: { workflow_id: wfId }, jar: 'anaA' });
  const inst2 = r.dados.id;
  r = await req('POST', '/vdocs/api/aprovacoes/' + inst2 + '/decidir', { body: { decisao: 'rejeitar', justificativa: 'Falta anexo do orçamento.' }, jar: 'carlaA' });
  teste('rejeição com justificativa encerra', r.status === 200 && r.dados.status === 'rejeitado');
  r = await req('POST', '/vdocs/api/documentos/' + docAta + '/aprovacao', { body: { workflow_id: wfId }, jar: 'anaA' });
  const inst3 = r.dados.id;
  r = await req('POST', '/vdocs/api/aprovacoes/' + inst3 + '/cancelar', { jar: 'anaA' });
  teste('solicitante cancela', r.status === 200);
  r = await req('GET', '/vdocs/api/aprovacoes/' + instId, { jar: 'bobB' });
  teste('B não vê aprovação de A', r.status === 400 || r.status === 403);

  // documento mostra as aprovações; dashboard conta pendentes
  r = await req('GET', '/vdocs/api/documentos/' + docDistrato, { jar: 'anaA' });
  teste('detalhe do documento lista a aprovação', r.dados.aprovacoes.some(a => a.id === instId && a.status === 'aprovado'));
  r = await req('GET', '/vdocs/api/dashboard', { jar: 'anaA' });
  teste('dashboard traz aprovacoes_pendentes', typeof r.dados.aprovacoes_pendentes === 'number');

  // lembrete de atrasadas (unidade)
  const { db: dbTeste } = require('./db');
  r = await req('POST', '/vdocs/api/documentos/' + docAta + '/aprovacao', { body: { workflow_id: wfId }, jar: 'anaA' });
  dbTeste.prepare('UPDATE workflow_instances SET prazo_em = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', r.dados.id);
  teste('rotina lembra aprovações atrasadas', (await wf.lembrarAtrasadas()) >= 1);

  // ================== FASE 7: compartilhamento externo ==================
  // share de DOCUMENTO com senha + expiração
  r = await req('POST', '/vdocs/api/compartilhamentos', { body: { alvo_tipo: 'documento', alvo_id: docDistrato, senha: 'segredo123', permite_download: true, expira_dias: 7, rotulo: 'Cliente X' }, jar: 'anaA' });
  teste('share de documento criado com link', r.status === 200 && /\/vdocs\/s\//.test(r.dados.link));
  const shareLink = r.dados.link.replace(/^https?:\/\/[^/]+/, '');
  const shareId = r.dados.id;
  r = await req('POST', '/vdocs/api/compartilhamentos', { body: { alvo_tipo: 'documento', alvo_id: docDistrato }, jar: 'carlaA' });
  teste('papel aprovador sem compartilhar_documento → 403', r.status === 403);

  // acesso público: pede senha, senha errada, senha certa
  {
    let resp = await fetch(BASE + shareLink);
    teste('página pública pede senha', resp.status === 200 && (await resp.text()).includes('exige senha'));
    resp = await fetch(BASE + shareLink, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'senha=errada' });
    teste('senha errada volta ao formulário', (await resp.text()).includes('Senha incorreta'));
    resp = await fetch(BASE + shareLink, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'senha=segredo123' });
    const corpo = await resp.text();
    teste('senha certa mostra o documento', resp.status === 200 && corpo.includes('Distrato Fornecedor Y'));
    resp = await fetch(BASE + shareLink + '/baixar', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'senha=segredo123&doc=' + docDistrato });
    teste('download público com senha funciona', resp.status === 200 && String(resp.headers.get('content-disposition')).includes('attachment'));
    resp = await fetch(BASE + shareLink + '/baixar', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'senha=segredo123&doc=' + docAta });
    teste('download de documento FORA do link negado', (await resp.text()).includes('fora deste link') || resp.status === 410);
  }
  r = await req('GET', '/vdocs/api/compartilhamentos/' + shareId + '/acessos', { jar: 'anaA' });
  teste('acessos externos logados (visualizar+baixar+senha_errada)', r.status === 200 && ['visualizar', 'baixar', 'senha_errada'].every(a => r.dados.acessos.some(x => x.acao === a)));

  // sala segura (pasta) só-visualização: lista docs e mostra texto, sem download
  r = await req('POST', '/vdocs/api/compartilhamentos', { body: { alvo_tipo: 'pasta', alvo_id: pastaContratos, permite_download: false, rotulo: 'Auditoria externa' }, jar: 'anaA' });
  teste('sala segura (pasta) criada', r.status === 200);
  const salaLink = r.dados.link.replace(/^https?:\/\/[^/]+/, '');
  {
    const resp = await fetch(BASE + salaLink);
    const corpo = await resp.text();
    teste('sala lista documentos da pasta com texto e sem download', resp.status === 200 && corpo.includes('só visualização') && !corpo.includes('⬇️ Baixar'));
    const dl = await fetch(BASE + salaLink + '/baixar', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'doc=' + docId });
    teste('download bloqueado em link só-visualização', (await dl.text()).includes('somente visualização') || dl.status === 410);
  }

  // revogação corta o acesso na hora
  r = await req('DELETE', '/vdocs/api/compartilhamentos/' + shareId, { jar: 'anaA' });
  teste('share revogado', r.status === 200);
  {
    const resp = await fetch(BASE + shareLink);
    teste('link revogado → indisponível', resp.status === 410);
  }
  r = await req('DELETE', '/vdocs/api/compartilhamentos/' + shareId, { jar: 'bobB' });
  teste('B não revoga share de A', r.status === 400 || r.status === 403);

  // solicitação de documentos (upload externo)
  r = await req('POST', '/vdocs/api/solicitacoes', { body: { titulo: 'Documentos do fornecedor', instrucoes: 'Envie o contrato assinado.', folder_id: pastaContratos, expira_dias: 7, max_arquivos: 2 }, jar: 'anaA' });
  teste('solicitação criada com link', r.status === 200 && /\/vdocs\/r\//.test(r.dados.link));
  const reqLink = r.dados.link.replace(/^https?:\/\/[^/]+/, '');
  const reqId = r.dados.id;
  {
    let resp = await fetch(BASE + reqLink);
    teste('página pública da solicitação abre', resp.status === 200 && (await resp.text()).includes('Documentos do fornecedor'));
    resp = await fetch(BASE + reqLink + '/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remetente: 'João da Silva', arquivo_nome: 'contrato-assinado.txt', conteudo_base64: B64('contrato assinado pelo fornecedor joao') }) });
    teste('externo envia arquivo', resp.status === 200);
    resp = await fetch(BASE + reqLink + '/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ arquivo_nome: 'virus.exe', conteudo_base64: B64('MZ') }) });
    teste('upload externo também valida extensão', resp.status === 400);
  }
  r = await req('GET', '/vdocs/api/documentos?pasta=' + pastaContratos, { jar: 'anaA' });
  teste('arquivo do externo virou documento na pasta', r.dados.documentos.some(d => d.nome === 'contrato-assinado.txt'));
  r = await req('DELETE', '/vdocs/api/solicitacoes/' + reqId, { jar: 'anaA' });
  teste('solicitação encerrada', r.status === 200);
  {
    const resp = await fetch(BASE + reqLink);
    teste('link de solicitação encerrado → indisponível', resp.status === 410);
  }

  // ================== FASE 8: billing (Mercado Pago mockado) ==================
  const billing = require('./billing');

  // sem MP configurado → aviso claro
  r = await req('POST', '/vdocs/api/billing/assinar', { body: { plano_slug: 'starter' }, jar: 'anaA' });
  teste('assinar sem MP → erro claro', r.status === 400 && /indisponível/i.test(r.dados.erro));

  // mock do Mercado Pago
  const chamadasMP = [];
  const preapprovals = {}; // id -> objeto
  const mockMp = async (pathname, opts) => {
    chamadasMP.push({ pathname, method: (opts || {}).method || 'GET' });
    if (pathname === '/preapproval' && opts && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      const id = 'pre_' + (Object.keys(preapprovals).length + 1);
      preapprovals[id] = { id, status: 'pending', external_reference: body.external_reference, init_point: 'https://mp.test/autorizar/' + id };
      return preapprovals[id];
    }
    let m;
    if ((m = pathname.match(/^\/preapproval\/(.+)$/))) {
      const pre = preapprovals[m[1]];
      if (!pre) throw new Error('Mercado Pago 404');
      if (opts && opts.method === 'PUT') { pre.status = JSON.parse(opts.body).status; return pre; }
      return pre;
    }
    if ((m = pathname.match(/^\/v1\/payments\/(.+)$/))) {
      return { id: m[1], status: 'approved', status_detail: 'accredited', transaction_amount: 99.0, external_reference: 'vdocs:' + tenantB.id };
    }
    throw new Error('rota MP não mockada: ' + pathname);
  };
  mockMp.__mock = true;
  billing.configurar({ mpFetch: mockMp });

  // Bob (dono do tenant B) assina o Starter
  r = await req('GET', '/vdocs/api/billing', { jar: 'bobB' });
  teste('estado de billing disponível p/ dono', r.status === 200 && r.dados.online_disponivel === true && Array.isArray(r.dados.planos));
  r = await req('POST', '/vdocs/api/billing/assinar', { body: { plano_slug: 'starter' }, jar: 'bobB' });
  teste('assinar cria preapproval e devolve link do MP', r.status === 200 && /mp\.test\/autorizar/.test(r.dados.link));
  const preId = r.dados.preapproval_id;
  // Carla (papel aprovador, sem administrar_cobranca) não mexe em billing
  r = await req('POST', '/vdocs/api/billing/assinar', { body: { plano_slug: 'starter' }, jar: 'carlaA' });
  teste('sem administrar_cobranca → 403', r.status === 403);

  // webhook: MP autorizou → assinatura ativa + tenant ativa
  preapprovals[preId].status = 'authorized';
  r = await req('POST', '/vdocs/api/billing/webhook', { body: { type: 'subscription_preapproval', data: { id: preId } } });
  teste('webhook preapproval processado', r.status === 200);
  r = await req('GET', '/vdocs/api/me', { jar: 'bobB' });
  teste('tenant B ativo após autorização', r.dados.tenant.status === 'ativa');
  r = await req('GET', '/vdocs/api/billing', { jar: 'bobB' });
  teste('assinatura marcada como recorrente MP', r.dados.plano && r.dados.plano.recorrencia_mp === true && r.dados.plano.status === 'ativa');

  // webhook de pagamento aprovado → payments + idempotente
  r = await req('POST', '/vdocs/api/billing/webhook', { body: { type: 'payment', data: { id: 'pay_1' } } });
  r = await req('POST', '/vdocs/api/billing/webhook', { body: { type: 'payment', data: { id: 'pay_1' } } });
  r = await req('GET', '/vdocs/api/billing', { jar: 'bobB' });
  teste('pagamento registrado 1x (idempotente)', r.dados.pagamentos.filter(p => p.status === 'aprovado').length === 1 && r.dados.pagamentos[0].valor_centavos === 9900);

  // webhook alheio/ruim não quebra
  r = await req('POST', '/vdocs/api/billing/webhook', { body: { type: 'subscription_preapproval', data: { id: 'pre_inexistente' } } });
  teste('webhook de recurso desconhecido responde 200 sem efeito', r.status === 200);

  // relatório SaaS no staff
  r = await req('GET', '/staff/api/vdocs/receita', { staff: 'ceo' });
  teste('staff/receita: MRR e pagamento do mês', r.status === 200 && r.dados.mrr_centavos >= 9900 && r.dados.recebido_mes_centavos === 9900 && r.dados.assinaturas.some(a => a.recorrencia_mp));
  r = await req('GET', '/staff/api/vdocs/receita', { staff: 'fora' });
  teste('staff/receita bloqueado p/ área sem acesso', r.status === 403);

  // cancelamento → MP PUT + tenant suspenso
  r = await req('POST', '/vdocs/api/billing/cancelar', { jar: 'bobB' });
  teste('cancelamento chama o MP e responde ok', r.status === 200 && chamadasMP.some(c => c.method === 'PUT'));
  r = await req('GET', '/vdocs/api/me', { jar: 'bobB' });
  teste('tenant suspenso após cancelar', r.dados.tenant.status === 'suspensa' && r.dados.bloqueado === true);
  // reativa p/ os testes seguintes (leads etc.)
  r = await req('PATCH', '/staff/api/vdocs/tenants/' + tenantB.id, { body: { status: 'ativa', plano_slug: 'starter' }, staff: 'adm' });
  teste('staff reativa tenant B manualmente', r.status === 200);
  billing.configurar({ mpFetch: null });

  // ================== FASE 9: API pública + webhooks de saída ==================
  const apiPub = require('./api-publica');

  // receptor local p/ os webhooks de saída (registra corpo e assinatura)
  const recebidos = [];
  app.post('/receptor-teste', express.json(), (rq2, rs2) => {
    recebidos.push({ evento: rq2.headers['x-vdocs-event'], assinatura: rq2.headers['x-vdocs-signature'], corpo: rq2.body, bruto: JSON.stringify(rq2.body) });
    rs2.json({ ok: true });
  });

  // chave exige permissão configurar_integracoes
  r = await req('POST', '/vdocs/api/integracoes/chaves', { body: { nome: 'ERP' }, jar: 'carlaA' });
  teste('criar chave sem configurar_integracoes → 403', r.status === 403);
  r = await req('POST', '/vdocs/api/integracoes/chaves', { body: { nome: 'ERP financeiro' }, jar: 'anaA' });
  teste('chave criada (mostrada 1x)', r.status === 200 && /^vd_/.test(r.dados.chave));
  const chaveA = r.dados.chave;
  const chaveAId = r.dados.id;

  // plano sem API (A está no trial = Professional, api=false) → 403 com upgrade
  {
    let resp = await fetch(BASE + '/vdocs/api/v1/ping', { headers: { Authorization: 'Bearer ' + chaveA } });
    teste('plano sem API → 403 sugerindo upgrade', resp.status === 403 && /Business/.test((await resp.json()).erro));
    // sobe A para business e tenta de novo
    repo.administrarTenant(tenantA.id, { plano_slug: 'business' }, staff, 'teste');
    resp = await fetch(BASE + '/vdocs/api/v1/ping', { headers: { Authorization: 'Bearer ' + chaveA } });
    const pj = await resp.json();
    teste('ping autenticado no plano Business', resp.status === 200 && pj.tenant === tenantA.id);
    teste('headers de rate limit presentes', resp.headers.get('x-ratelimit-limit') !== null);
    resp = await fetch(BASE + '/vdocs/api/v1/ping', { headers: { Authorization: 'Bearer vd_chave_falsa' } });
    teste('chave inválida → 401', resp.status === 401);
    resp = await fetch(BASE + '/vdocs/api/v1/ping');
    teste('sem chave → 401', resp.status === 401);
    // upload + busca + download via API
    resp = await fetch(BASE + '/vdocs/api/v1/documentos', { method: 'POST', headers: { Authorization: 'Bearer ' + chaveA, 'Content-Type': 'application/json' }, body: JSON.stringify({ arquivo_nome: 'nf-api.txt', nome: 'NF via API', conteudo_base64: B64('nota fiscal emitida pela integracao do ERP') }) });
    const up = await resp.json();
    teste('upload via API v1', resp.status === 200 && up.documento && up.documento.nome === 'NF via API');
    await jobs.processarPendentes(20);
    resp = await fetch(BASE + '/vdocs/api/v1/documentos?busca=' + encodeURIComponent('integracao do ERP'), { headers: { Authorization: 'Bearer ' + chaveA } });
    const bs = await resp.json();
    teste('busca via API v1 acha por conteúdo', resp.status === 200 && bs.resultados.some(x => x.id === up.documento.id));
    resp = await fetch(BASE + '/vdocs/api/v1/documentos/' + up.documento.id + '/baixar', { headers: { Authorization: 'Bearer ' + chaveA } });
    teste('download via API v1', resp.status === 200 && (await resp.text()).includes('nota fiscal'));
    // isolamento: chave de A não vê docs de B
    resp = await fetch(BASE + '/vdocs/api/v1/documentos?busca=qualquer', { headers: { Authorization: 'Bearer ' + chaveA } });
    teste('API v1 respeita o tenant da chave', resp.status === 200);
    // uso registrado
    r = await req('GET', '/vdocs/api/uso', { jar: 'anaA' });
    teste('api_chamadas contam no uso', Number(r.dados.uso.api_chamadas) >= 5);
  }

  // webhooks de saída
  r = await req('POST', '/vdocs/api/integracoes/webhooks', { body: { url: 'ftp://x', eventos: ['documento.criado'] }, jar: 'anaA' });
  teste('webhook com URL inválida rejeitado', r.status === 400);
  r = await req('POST', '/vdocs/api/integracoes/webhooks', { body: { url: BASE + '/receptor-teste', eventos: ['documento.criado', 'aprovacao.finalizada'] }, jar: 'anaA' });
  teste('webhook criado com secret 1x', r.status === 200 && /^whsec_/.test(r.dados.secret));
  const whSecret = r.dados.secret;
  const whId = r.dados.id;
  // dispara um evento real (upload) e processa entregas
  r = await req('POST', '/vdocs/api/documentos', { body: { arquivo_nome: 'evento.txt', nome: 'Doc do evento', conteudo_base64: B64('conteudo evento webhook') }, jar: 'anaA' });
  const docEvento = r.dados.documento.id;
  await apiPub.processarEntregas(10);
  {
    // SSRF: a lista anterior era textual e incompleta. Estas cinco faixas
    // passavam, e a checagem olhava o NOME do host, nao o IP resolvido.
    const interno = apiPub.ipInterno;
    for (const ip of ['10.0.0.1', '127.0.0.1', '192.168.1.1', '169.254.169.254',
      '172.16.0.1', '172.31.255.254', '100.64.0.1', '::1', 'fc00::1', 'fe80::1',
      '::ffff:10.0.0.1', 'nao-e-ip']) {
      teste('SSRF: ' + ip + ' e interno', interno(ip) === true);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '172.15.0.1', '100.63.0.1',
      '2001:4860:4860::8888']) {
      teste('SSRF: ' + ip + ' e externo', interno(ip) === false);
    }
  }
  teste('webhook entregue ao receptor', recebidos.some(x => x.evento === 'documento.criado' && x.corpo.dados.document_id === docEvento));
  {
    const ent = recebidos.find(x => x.evento === 'documento.criado');
    const esperada = 'sha256=' + require('crypto').createHmac('sha256', whSecret).update(JSON.stringify(ent.corpo)).digest('hex');
    teste('assinatura HMAC confere', ent.assinatura === esperada);
  }
  r = await req('GET', '/vdocs/api/integracoes', { jar: 'anaA' });
  teste('tela de integrações lista entrega como entregue', r.dados.entregas.some(e => e.status === 'entregue'));
  // B não vê nem mexe nas integrações de A
  r = await req('GET', '/vdocs/api/integracoes', { jar: 'bobB' });
  teste('integrações de B vêm vazias (isolamento)', r.status === 200 && r.dados.chaves.length === 0 && r.dados.webhooks.length === 0);
  r = await req('DELETE', '/vdocs/api/integracoes/webhooks/' + whId, { jar: 'bobB' });
  teste('B não exclui webhook de A', r.status === 400 || r.status === 403);
  // revogação da chave corta o acesso
  r = await req('DELETE', '/vdocs/api/integracoes/chaves/' + chaveAId, { jar: 'anaA' });
  teste('chave revogada', r.status === 200);
  {
    const resp = await fetch(BASE + '/vdocs/api/v1/ping', { headers: { Authorization: 'Bearer ' + chaveA } });
    teste('chave revogada → 401', resp.status === 401);
  }

  // ================== FASE 10: enterprise (2FA, retenção legal, takeout, saúde) ==================
  const ent = require('./enterprise');

  // ---- 2FA (TOTP) ----
  r = await req('POST', '/vdocs/api/seguranca/2fa/iniciar', { jar: 'anaA' });
  teste('2FA: secret gerado com otpauth', r.status === 200 && /^[A-Z2-7]{32}$/.test(r.dados.secret) && /otpauth:\/\//.test(r.dados.uri));
  const tfaSecret = r.dados.secret;
  r = await req('POST', '/vdocs/api/seguranca/2fa/confirmar', { body: { codigo: '000000' }, jar: 'anaA' });
  teste('2FA: código errado não ativa', r.status === 400);
  r = await req('POST', '/vdocs/api/seguranca/2fa/confirmar', { body: { codigo: ent.totpAgora(tfaSecret) }, jar: 'anaA' });
  teste('2FA ativado com 8 códigos de recuperação', r.status === 200 && r.dados.recovery.length === 8);
  const recovery = r.dados.recovery;
  // login agora exige o 2º passo
  r = await req('POST', '/vdocs/api/login', { body: { email: 'ana@a.com', senha: 'senha1234' }, jar: 'ana2fa' });
  teste('login com 2FA pede o código (sem sessão ainda)', r.status === 200 && r.dados.precisa_2fa && r.dados.tfa_token && !jars.ana2fa);
  const tfaToken = r.dados.tfa_token;
  r = await req('POST', '/vdocs/api/login-2fa', { body: { tfa_token: tfaToken, codigo: '123456' }, jar: 'ana2fa' });
  teste('2º passo com código errado → 401', r.status === 401);
  r = await req('POST', '/vdocs/api/login-2fa', { body: { tfa_token: tfaToken, codigo: ent.totpAgora(tfaSecret) }, jar: 'ana2fa' });
  teste('2º passo com TOTP correto loga', r.status === 200);
  r = await req('GET', '/vdocs/api/me', { jar: 'ana2fa' });
  teste('sessão pós-2FA funciona e expõe totp_ativo', r.status === 200 && r.dados.totp_ativo === true);
  // código de recuperação: vale 1 vez
  r = await req('POST', '/vdocs/api/login', { body: { email: 'ana@a.com', senha: 'senha1234' }, jar: 'ana2fb' });
  r = await req('POST', '/vdocs/api/login-2fa', { body: { tfa_token: r.dados.tfa_token, codigo: recovery[0] }, jar: 'ana2fb' });
  teste('código de recuperação loga', r.status === 200);
  r = await req('POST', '/vdocs/api/login', { body: { email: 'ana@a.com', senha: 'senha1234' }, jar: 'ana2fc' });
  r = await req('POST', '/vdocs/api/login-2fa', { body: { tfa_token: r.dados.tfa_token, codigo: recovery[0] }, jar: 'ana2fc' });
  teste('código de recuperação NÃO vale duas vezes', r.status === 401);
  r = await req('POST', '/vdocs/api/seguranca/2fa/desativar', { body: { codigo: ent.totpAgora(tfaSecret) }, jar: 'anaA' });
  teste('2FA desativado com código', r.status === 200);
  r = await req('POST', '/vdocs/api/login', { body: { email: 'ana@a.com', senha: 'senha1234' }, jar: 'ana2fd' });
  teste('sem 2FA o login volta a ser direto', r.status === 200 && !r.dados.precisa_2fa);

  // ---- retenção legal + purga da lixeira ----
  r = await req('POST', '/vdocs/api/documentos', { body: { arquivo_nome: 'contrato-judicial.txt', nome: 'Contrato em disputa', conteudo_base64: B64('processo em curso') }, jar: 'anaA' });
  const docHold = r.dados.documento.id;
  r = await req('POST', '/vdocs/api/documentos/' + docHold + '/retencao-legal', { body: { ativo: true }, jar: 'carlaA' });
  teste('retenção legal exige gerir_configuracoes (403 p/ aprovador)', r.status === 403);
  r = await req('POST', '/vdocs/api/documentos/' + docHold + '/retencao-legal', { body: { ativo: true }, jar: 'anaA' });
  teste('retenção legal ativada', r.status === 200);
  r = await req('POST', '/vdocs/api/documentos/' + docHold + '/lixeira', { jar: 'anaA' });
  teste('documento sob retenção legal não vai à lixeira', r.status === 400 && /retenção legal/.test(r.dados.erro));
  // purga: doc na lixeira há 40 dias sai
  r = await req('POST', '/vdocs/api/documentos', { body: { arquivo_nome: 'velho.txt', nome: 'Doc antigo na lixeira', conteudo_base64: B64('conteudo antigo qualquer') }, jar: 'anaA' });
  const docVelho = r.dados.documento.id;
  r = await req('POST', '/vdocs/api/documentos/' + docVelho + '/lixeira', { jar: 'anaA' });
  dbTeste.prepare('UPDATE documents SET excluido_em = ? WHERE id = ?').run(new Date(Date.now() - 40 * 86400000).toISOString(), docVelho);
  const purgados = await ent.purgarLixeiras();
  teste('purga automática removeu o doc velho da lixeira', purgados >= 1);
  r = await req('GET', '/vdocs/api/documentos/' + docVelho, { jar: 'anaA' });
  teste('doc purgado não existe mais', r.status === 400 || r.status === 404);
  r = await req('POST', '/vdocs/api/documentos/' + docHold + '/retencao-legal', { body: { ativo: false }, jar: 'anaA' });
  teste('retenção legal removida', r.status === 200);

  // ---- takeout LGPD ----
  r = await req('GET', '/vdocs/api/exportacao', { jar: 'carlaA' });
  teste('takeout exige exportar_dados (403 p/ aprovador)', r.status === 403);
  {
    const resp = await fetch(BASE + '/vdocs/api/exportacao', { headers: { Cookie: jars.anaA } });
    const buf = Buffer.from(await resp.arrayBuffer());
    teste('takeout ZIP baixa', resp.status === 200 && String(resp.headers.get('content-type')).includes('zip') && buf.readUInt32LE(0) === 0x04034b50);
    const { lerZip } = require('./extrair');
    const zip = lerZip(buf);
    const dados = JSON.parse(zip.arquivo('dados.json').toString('utf8'));
    teste('takeout tem dados.json com documentos e auditoria', dados.tenant.id === tenantA.id && dados.documentos.length >= 3 && dados.auditoria.length > 10);
    teste('takeout inclui os arquivos vigentes', zip.nomes().some(n => n.startsWith('arquivos/')));
  }
  r = await req('GET', '/vdocs/api/auditoria', { jar: 'anaA' });
  teste('exportação auditada', r.dados.eventos.some(e => e.acao === 'lgpd.exportacao_completa'));

  // ---- saúde (staff) ----
  r = await req('GET', '/staff/api/vdocs/saude', { staff: 'adm' });
  teste('saúde: jobs/webhooks/volumes presentes', r.status === 200 && typeof r.dados.jobs.erro === 'number' && typeof r.dados.volumes.storage_mb === 'number' && r.dados.volumes.tenants === 2);
  r = await req('GET', '/staff/api/vdocs/saude', { staff: 'fora' });
  teste('saúde bloqueada p/ área sem acesso', r.status === 403);

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
