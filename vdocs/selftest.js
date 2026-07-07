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
