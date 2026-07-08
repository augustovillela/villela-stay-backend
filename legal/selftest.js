// =====================================================================
// Villela Legal Intelligence — SUÍTE DE TESTES (Fase 8, §13 do plano).
//
// Roda o app Express REAL com autenticação de teste injetada (header
// x-test-user escolhe o usuário; x-publish-key simula o agente) sobre um
// banco NOVO em diretório temporário. Sem framework: assert + contadores.
//
//   node legal/selftest.js        (ou: npm run test:legal)
//
// Cobre: login/permissões, clientes, processos, andamentos, publicações,
// prazos (travas + calculadora), tarefas/kanban, documentos (upload/
// download/sigilo), IA (fila/responder/revisão), peças (travas/export),
// contratos (wizard/análise), prestação de contas (CSV seguro),
// notificações, portal do cliente (senha/login/exposição), auditoria,
// webhooks e rotinas (unidades sem rede).
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'legal-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');

// ---- usuários de teste (papéis do Portal Staff) ----
const USUARIOS = [
  { id: 'adm', nome: 'Admin Teste', email: 'adm@t', papel: 'admin', areas: ['*'], ativo: true },
  { id: 'est', nome: 'Estagiário Teste', email: 'est@t', papel: 'membro', areas: ['juridico'], ativo: true },
  { id: 'fora', nome: 'Sem Acesso', email: 'fora@t', papel: 'membro', areas: ['vendas'], ativo: true },
];
const lerUsuarios = () => USUARIOS;
function requireAuth(req, res, next) {
  const u = USUARIOS.find(x => x.id === (req.headers['x-test-user'] || 'adm'));
  if (!u) return res.status(401).json({ erro: 'não autenticado' });
  req.user = u; next();
}
const requireAdmin = (req, res, next) => (req.user && req.user.papel === 'admin') ? next() : res.status(403).json({ erro: 'apenas admin' });
function requirePublishOrSession(req, res, next) {
  if (req.headers['x-publish-key'] === 'test-key') { req.viaChave = true; return next(); }
  return requireAuth(req, res, next);
}
const enviados = { email: [], wa: [], alertas: [] }; // canais mockados
const canais = {
  enviarEmail: async (to, ass) => { enviados.email.push({ to, ass }); return true; },
  enviarWhatsApp: async (to, txt) => { enviados.wa.push({ to, txt }); return true; },
  alertaAugusto: async (r) => { enviados.alertas.push(r); },
};

// ---- app + módulo ----
const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());
const legal = require('./index');
legal.montar(app, { express, requireAuth, requireAdmin, requirePublishOrSession, lerUsuarios, ...canais, jwtSecret: 'segredo-teste' });
legal.permissoes.salvarMembro({ id: 'est', nome: 'Estagiário Teste', email: 'est@t', role_id: 'estagiario', oab: '', nucleos: ['civel'] });

// ---- PONTE do assinante: mock de assinanteDeReq dirigido por headers x-fake-* ----
// (em produção vem do cookie jur_saas + repo do legal-saas; aqui simulamos)
const TODOS_MODULOS = 'processos,prazos,publicacoes,audiencias,tarefas,documentos,ia,pecas,contratos,relatorios';
function fakeAssinante(req) {
  const uid = req.headers['x-fake-uid'];
  if (!uid) return null;
  const modulos = String(req.headers['x-fake-modulos'] || TODOS_MODULOS).split(',').filter(Boolean);
  return {
    uid, tenantId: 'tid-' + uid, tenantSlug: 'esc-' + (req.headers['x-fake-slug'] || uid),
    papel: req.headers['x-fake-papel'] || 'admin', nome: 'Assinante ' + uid, email: uid + '@esc.com',
    acessoLiberado: req.headers['x-fake-acesso'] !== '0',
    podeModulo: (m) => modulos.includes(m),
  };
}
legal.montarAssinante(app, { express, assinanteDeReq: fakeAssinante, jwtSecret: 'segredo-teste' });

// ---- mini harness ----
let BASE = '', ok = 0, falhas = [];
const jarCliente = {}; // cookies do portal do cliente
async function req(metodo, caminho, { corpo, user = 'adm', chave, cookies, raw, tenant, fake } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (chave) headers['x-publish-key'] = 'test-key'; else headers['x-test-user'] = user;
  if (tenant) headers['x-legal-tenant'] = tenant; // seam multi-tenant (só honrado em NODE_ENV=development)
  if (fake) { // simula sessão de assinante (ponte /juridico/api/legal)
    if (fake.uid) headers['x-fake-uid'] = fake.uid;
    if (fake.slug) headers['x-fake-slug'] = fake.slug;
    if (fake.papel) headers['x-fake-papel'] = fake.papel;
    if (fake.acesso === false) headers['x-fake-acesso'] = '0';
    if (fake.modulos) headers['x-fake-modulos'] = fake.modulos;
  }
  if (cookies) headers.Cookie = Object.entries(jarCliente).map(([k, v]) => `${k}=${v}`).join('; ');
  const r = await fetch(BASE + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined, redirect: 'manual' });
  (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach(c => { const [kv] = c.split(';'); const [k, v] = kv.split('='); jarCliente[k] = v; });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch (_) {}
  return { st: r.status, json, texto, ct: r.headers.get('content-type') || '' };
}
async function t(nome, fn) {
  try { await fn(); ok++; console.log('  ✅', nome); }
  catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌', nome, '—', e.message); }
}

// ---- os testes ----
async function rodar() {
  const srv = app.listen(0);
  BASE = 'http://127.0.0.1:' + srv.address().port;
  console.log('Villela Legal Intelligence — selftest (§13)\nDATA_DIR:', process.env.DATA_DIR, '\n');

  // 1. login/permissões
  await t('permissões: admin é super_admin', async () => {
    const r = await req('GET', '/staff/api/legal/eu');
    assert.equal(r.st, 200); assert.equal(r.json.perfil, 'super_admin');
  });
  await t('permissões: estagiário tem perfil próprio e NÃO aprova', async () => {
    const r = await req('GET', '/staff/api/legal/eu', { user: 'est' });
    assert.equal(r.json.perfil, 'estagiario'); assert.equal(r.json.permissoes.aprovar_documentos, false);
  });
  await t('permissões: usuário fora do jurídico → 403', async () => {
    const r = await req('GET', '/staff/api/legal/dashboard', { user: 'fora' });
    assert.equal(r.st, 403);
  });

  // 2. cliente (+LGPD)
  let cliId;
  await t('cliente: criar/consentimento/mascarar CPF', async () => {
    const c = await req('POST', '/staff/api/legal/clientes', { corpo: { nome: 'Cliente Teste', cpf_cnpj: '111.222.333-44', email: 'cli@t.com', tipo_cliente: 'ativo' } });
    assert.equal(c.st, 200); cliId = c.json.cliente.id;
    await req('POST', `/staff/api/legal/clientes/${cliId}/consentimentos`, { corpo: { finalidade: 'comunicacao-processual', base_legal: 'execução de contrato' } });
    const det = await req('GET', '/staff/api/legal/clientes/' + cliId, { user: 'est' });
    assert.equal(det.st, 403); // estagiário não tem gerir_clientes
    const detAdm = await req('GET', '/staff/api/legal/clientes/' + cliId);
    assert.equal(detAdm.json.cliente.consentimentos.length, 1);
  });

  // 3. processo
  let caseId;
  await t('processo: criar com CNJ normalizado; duplicado → 400', async () => {
    const p = await req('POST', '/staff/api/legal/processos', { corpo: { numero_cnj: '07001112220268070001', tribunal: 'TJDFT', assunto: 'Teste', client_id: cliId, nucleo: 'civel' } });
    assert.equal(p.st, 200); assert.equal(p.json.processo.numero_cnj, '0700111-22.2026.8.07.0001'); caseId = p.json.processo.id;
    const dup = await req('POST', '/staff/api/legal/processos', { corpo: { numero_cnj: '07001112220268070001', assunto: 'dup' } });
    assert.equal(dup.st, 400);
  });

  // 4. andamento (via chave do agente) + notificação ao cliente
  await t('andamento: ingestão via PUBLISH_KEY + dedupe + notificação', async () => {
    const a = await req('POST', `/staff/api/legal/processos/${caseId}/andamentos`, { chave: true, corpo: { data: '2026-07-07', descricao: 'Sentença publicada', fonte: 'datajud' } });
    assert.equal(a.st, 200); assert.equal(a.json.duplicado, false);
    const a2 = await req('POST', `/staff/api/legal/processos/${caseId}/andamentos`, { chave: true, corpo: { data: '2026-07-07', descricao: 'Sentença publicada', fonte: 'datajud' } });
    assert.equal(a2.json.duplicado, true);
    await new Promise(r => setTimeout(r, 250)); // notificação é assíncrona
    assert.ok(enviados.email.some(e => e.to === 'cli@t.com'), 'e-mail de notificação enviado');
  });

  // 5. publicação
  await t('publicação: ingestão + dedupe + triagem', async () => {
    const p = await req('POST', '/staff/api/legal/publicacoes', { chave: true, corpo: { fonte: 'djen', data_publicacao: '2026-07-07', texto: 'Intimação com prazo de 15 dias', tem_prazo: true } });
    assert.equal(p.json.duplicado, false);
    const p2 = await req('POST', '/staff/api/legal/publicacoes', { chave: true, corpo: { fonte: 'djen', data_publicacao: '2026-07-07', texto: 'Intimação com prazo de 15 dias', tem_prazo: true } });
    assert.equal(p2.json.duplicado, true);
    const up = await req('PATCH', `/staff/api/legal/publicacoes/${p.json.id}`, { corpo: { status: 'analisada' } });
    assert.equal(up.json.publicacao.status, 'analisada');
  });

  // 6. prazos: calculadora + trava de validação humana
  await t('prazo: calculadora (dias úteis) e trava sem validado_por', async () => {
    const c = await req('POST', '/staff/api/legal/prazos/calcular', { corpo: { termo_inicial: '2026-07-06', dias: 5, modo: 'uteis' } });
    assert.equal(c.json.resultado, '2026-07-13');
    const z = await req('POST', '/staff/api/legal/prazos', { corpo: { titulo: 'Contestação', tipo: 'fatal', data_fatal: c.json.resultado, case_id: caseId, calculo_sugerido: c.json.memoria, calculo_log_id: c.json.log_id } });
    const avanca = await req('PATCH', `/staff/api/legal/prazos/${z.json.prazo.id}`, { corpo: { status: 'em_elaboracao' } });
    assert.equal(avanca.st, 400); // sem validado_por
    const valida = await req('PATCH', `/staff/api/legal/prazos/${z.json.prazo.id}`, { corpo: { status: 'em_elaboracao', validado_por: 'Dr. Teste' } });
    assert.equal(valida.st, 200);
  });

  // 7. tarefas + kanban + histórico
  await t('tarefa: kanban e histórico de status', async () => {
    const k = await req('POST', '/staff/api/legal/tarefas', { corpo: { titulo: 'Fazer X', case_id: caseId } });
    await req('PATCH', `/staff/api/legal/tarefas/${k.json.tarefa.id}`, { corpo: { status: 'em_andamento' } });
    const kb = await req('GET', '/staff/api/legal/tarefas/kanban');
    assert.equal(kb.json.colunas.em_andamento.length, 1);
    const h = await req('GET', `/staff/api/legal/tarefas/${k.json.tarefa.id}/historico`);
    assert.equal(h.json.historico.length, 1);
  });

  // 8. documentos: upload/validações/sigilo/download
  let docId;
  await t('documento: upload, extensão inválida, sigilo restrito p/ estagiário', async () => {
    const bad = await req('POST', '/staff/api/legal/documentos', { corpo: { titulo: 'x', nome_original: 'virus.exe', base64: Buffer.from('x').toString('base64') } });
    assert.equal(bad.st, 400);
    const up = await req('POST', '/staff/api/legal/documentos', { corpo: { titulo: 'Procuração', tipo: 'procuracao', case_id: caseId, sigilo: 'restrito', nome_original: 'proc.txt', base64: Buffer.from('conteúdo').toString('base64') } });
    assert.equal(up.st, 200); docId = up.json.id;
    const dl = await req('GET', `/staff/api/legal/documentos/${docId}/download`, { user: 'est' });
    assert.equal(dl.st, 403); // estagiário sem ver_dados_sensiveis
    const dlAdm = await req('GET', `/staff/api/legal/documentos/${docId}/download`);
    assert.equal(dlAdm.st, 200);
  });

  // 9. IA: fila → agente responde → revisão exige permissão
  let queryId, respostaId;
  await t('IA: consulta entra na fila (sem API key) e agente responde', async () => {
    const c = await req('POST', '/staff/api/legal/ia/consultas', { corpo: { pergunta: 'Teste de fila?', agente: 'civel' } });
    assert.equal(c.json.situacao, 'pendente'); queryId = c.json.query_id;
    const fila = await req('GET', '/staff/api/legal/ia/consultas/pendentes', { chave: true });
    assert.ok(fila.json.pendentes.some(q => q.id === queryId));
    assert.ok(fila.json.guardrails.includes('NUNCA invente'));
    const resp = await req('POST', `/staff/api/legal/ia/consultas/${queryId}/responder`, { chave: true, corpo: { resposta: 'Sim.', nivel_confianca: 'alto', fontes: [{ tipo: 'legislacao', citacao: 'CPC art. 1º' }] } });
    assert.equal(resp.st, 200); respostaId = resp.json.response_id;
  });
  await t('IA: resposta nasce rascunho; estagiário não aprova', async () => {
    const r = await req('GET', `/staff/api/legal/ia/respostas/${respostaId}`);
    assert.equal(r.json.resposta.status, 'rascunho'); assert.equal(r.json.resposta.fontes.length, 1);
    const neg = await req('POST', `/staff/api/legal/ia/respostas/${respostaId}/revisar`, { user: 'est', corpo: { status: 'aprovado' } });
    assert.equal(neg.st, 403);
  });

  // 10. peças: fluxo + travas + export
  let pecaId;
  await t('peça: IA não protocola sem aprovação; export com carimbo', async () => {
    const p = await req('POST', '/staff/api/legal/pecas', { corpo: { tipo_peca: 'contestacao', objetivo: 'Testar', case_id: caseId } });
    pecaId = p.json.peca.id;
    await req('POST', `/staff/api/legal/pecas/${pecaId}/versoes`, { chave: true, corpo: { conteudo: 'MINUTA de contestação…' } });
    const prot = await req('PATCH', `/staff/api/legal/pecas/${pecaId}`, { corpo: { status: 'protocolado' } });
    assert.equal(prot.st, 400); // gerada por IA sem aprovação
    const exp = await req('GET', `/staff/api/legal/pecas/${pecaId}/exportar?formato=html`);
    assert.ok(exp.texto.includes('MINUTA — SUJEITA'));
    const apr = await req('PATCH', `/staff/api/legal/pecas/${pecaId}`, { corpo: { status: 'aprovado' } });
    assert.equal(apr.json.peca.aprovado_por, 'Admin Teste');
    const exp2 = await req('GET', `/staff/api/legal/pecas/${pecaId}/exportar?formato=html`);
    assert.ok(!exp2.texto.includes('MINUTA — SUJEITA'));
  });

  // 11. contratos: wizard + análise pendente
  await t('contrato: wizard gera minuta com placeholder', async () => {
    const g = await req('POST', '/staff/api/legal/contratos/gerar', { corpo: { template_id: 'nda', respostas: { contratante: 'A', contratante_doc: '1', contratado: 'B', contratado_doc: '2', finalidade: 'testes' } } });
    assert.equal(g.st, 200); assert.ok(g.json.campos_pendentes.length >= 1);
    const peca = await req('GET', `/staff/api/legal/pecas/${g.json.draft_id}`);
    assert.ok(peca.json.peca.conteudo.includes('[___]'));
  });
  await t('contrato: análise sem texto extraído fica pendente', async () => {
    const a = await req('POST', '/staff/api/legal/contratos/analises', { corpo: { document_id: docId } });
    assert.equal(a.json.situacao, 'pendente');
  });

  // 12. prestação de contas + CSV seguro
  await t('prestação de contas: totais e CSV sem injeção de fórmula', async () => {
    await req('POST', '/staff/api/legal/financeiro', { corpo: { client_id: cliId, tipo: 'honorario_contratual', descricao: '=HYPERLINK("evil")', valor: 100000, status: 'pago' } });
    const pc = await req('GET', `/staff/api/legal/relatorios/prestacao-contas/${cliId}`);
    assert.equal(pc.json.totais.recebido, 100000);
    const csv = await req('GET', `/staff/api/legal/relatorios/prestacao-contas/${cliId}/exportar?formato=csv`);
    assert.ok(csv.ct.includes('text/csv')); assert.ok(csv.texto.includes(";'=HYPERLINK"));
  });

  // 13. relatórios + arquivo
  await t('relatórios: sócio/núcleo/financeiro + arquivo de gerados', async () => {
    const s2 = await req('GET', '/staff/api/legal/relatorios/socio');
    assert.ok(s2.json.processos.ativos >= 1);
    const n = await req('GET', '/staff/api/legal/relatorios/nucleo/civel');
    assert.ok(Array.isArray(n.json.tarefas_abertas));
    const g = await req('GET', '/staff/api/legal/relatorios/gerados');
    assert.ok(g.json.gerados.length >= 1); // o CSV acima ficou arquivado
  });

  // 14. portal do cliente: acesso, exposição e mensagens
  await t('portal do cliente: senha→login→dados filtrados', async () => {
    const acc = await req('POST', `/staff/api/legal/clientes/${cliId}/portal-acesso`, { corpo: {} });
    const token = new URL(acc.json.url).searchParams.get('token');
    const def = await req('POST', '/cliente-juridico/api/definir-senha', { corpo: { token, senha: 'SenhaForte123' } });
    assert.equal(def.st, 200);
    const log = await req('POST', '/cliente-juridico/api/login', { corpo: { email: 'cli@t.com', senha: 'SenhaForte123' }, cookies: true });
    assert.equal(log.st, 200);
    const procs = await req('GET', '/cliente-juridico/api/processos', { cookies: true });
    assert.equal(procs.json.processos.length, 1);
    const det = await req('GET', `/cliente-juridico/api/processos/${procs.json.processos[0].id}`, { cookies: true });
    assert.ok(!('estrategia' in det.json.processo) && !('risco' in det.json.processo));
    await req('POST', '/cliente-juridico/api/mensagens', { corpo: { texto: 'Olá!' }, cookies: true });
    assert.ok(enviados.alertas.some(a => a.includes('Mensagem de cliente')));
  });
  await t('portal do cliente: processo sigiloso some', async () => {
    await req('PATCH', `/staff/api/legal/processos/${caseId}`, { corpo: { sigiloso: true } });
    const procs = await req('GET', '/cliente-juridico/api/processos', { cookies: true });
    assert.equal(procs.json.processos.length, 0);
    await req('PATCH', `/staff/api/legal/processos/${caseId}`, { corpo: { sigiloso: false } });
  });
  await t('portal do cliente: login errado 5x → bloqueio 429', async () => {
    for (let i = 0; i < 5; i++) await req('POST', '/cliente-juridico/api/login', { corpo: { email: 'cli@t.com', senha: 'errada' } });
    const r = await req('POST', '/cliente-juridico/api/login', { corpo: { email: 'cli@t.com', senha: 'SenhaForte123' } });
    assert.equal(r.st, 429);
  });

  // 15. auditoria + webhooks + rotinas (unidades)
  await t('auditoria: ações registradas; estagiário não vê', async () => {
    const a = await req('GET', '/staff/api/legal/auditoria');
    assert.ok(a.json.eventos.some(e => e.acao === 'cliente.criar'));
    const neg = await req('GET', '/staff/api/legal/auditoria', { user: 'est' });
    assert.equal(neg.st, 403);
  });
  await t('webhook: evento armazenado via PUBLISH_KEY', async () => {
    const w = await req('POST', '/staff/api/legal/webhooks/fornecedor-x', { chave: true, corpo: { evento: 'ping' } });
    assert.equal(w.st, 200);
    const l = await req('GET', '/staff/api/legal/integracoes');
    assert.ok(l.json.webhooks.some(x => x.origem === 'fornecedor-x'));
  });
  await t('rotinas: unidades sem rede (tribunal, classificador, fila em modo fila)', async () => {
    assert.equal(legal.coleta.aliasTribunal('0700111-22.2026.8.07.0001'), 'tjdft');
    assert.equal(legal.coleta.classificarMovimento('Audiência designada'), 'audiencia');
    const f = await legal.coleta.processarFila();
    assert.equal(f.processadas, 0); // modo fila: agente local processa
  });

  // ---------------------------------------------------------------------
  // 24. ISOLAMENTO POR TENANT (caminho B — instância por escritório)
  // Todo o bloco acima rodou no tenant padrão (villela). Aqui usamos o seam
  // de teste (header x-legal-tenant, honrado só em NODE_ENV=development) para
  // provar que o escritório 'escritorio-b' tem dados 100% separados.
  // ---------------------------------------------------------------------
  const B = 'escritorio-b';
  let bCliId;
  await t('isolamento: banco do escritório B nasce vazio e semeado (não vê clientes do interno)', async () => {
    const eu = await req('GET', '/staff/api/legal/eu', { tenant: B });
    assert.equal(eu.st, 200); assert.equal(eu.json.perfil, 'super_admin'); // módulo alcança o banco de B, já semeado
    const lst = await req('GET', '/staff/api/legal/clientes', { tenant: B });
    assert.equal(lst.st, 200);
    assert.equal(lst.json.clientes.length, 0, 'B deveria começar SEM clientes (banco próprio)');
  });
  await t('isolamento: cliente criado em B não aparece no escritório interno (e vice-versa)', async () => {
    const c = await req('POST', '/staff/api/legal/clientes', { tenant: B, corpo: { nome: 'Cliente do B', email: 'b@b.com', tipo_cliente: 'ativo' } });
    assert.equal(c.st, 200); bCliId = c.json.cliente.id;
    // B enxerga só o dele
    const lstB = await req('GET', '/staff/api/legal/clientes', { tenant: B });
    assert.equal(lstB.json.clientes.length, 1);
    assert.equal(lstB.json.clientes[0].nome, 'Cliente do B');
    // interno (villela) NÃO enxerga o de B, mas mantém o seu ('Cliente Teste')
    const lstV = await req('GET', '/staff/api/legal/clientes');
    assert.ok(lstV.json.clientes.some(x => x.id === cliId), 'interno deve manter o próprio cliente');
    assert.ok(!lstV.json.clientes.some(x => x.id === bCliId), 'interno NÃO pode ver cliente de B');
  });
  await t('isolamento: id de um tenant não é acessível pelo outro (404 cruzado)', async () => {
    const bPorInterno = await req('GET', '/staff/api/legal/clientes/' + bCliId);         // villela buscando id de B
    assert.equal(bPorInterno.st, 404);
    const internoPorB = await req('GET', '/staff/api/legal/clientes/' + cliId, { tenant: B }); // B buscando id de villela
    assert.equal(internoPorB.st, 404);
  });
  await t('isolamento: mesmo número CNJ coexiste nos dois tenants (índice único é por-banco)', async () => {
    // villela já tem o CNJ 0700111-22.2026.8.07.0001 (teste 3). Em B, o MESMO
    // número deve ser aceito (200), não "duplicado 400" — prova de banco físico separado.
    const p = await req('POST', '/staff/api/legal/processos', { tenant: B, corpo: { numero_cnj: '07001112220268070001', tribunal: 'TJDFT', assunto: 'Processo do B', client_id: bCliId, nucleo: 'civel' } });
    assert.equal(p.st, 200);
    assert.equal(p.json.processo.numero_cnj, '0700111-22.2026.8.07.0001');
  });

  // ---------------------------------------------------------------------
  // 28. PONTE DE ACESSO DO ASSINANTE (/juridico/api/legal → banco do escritório)
  // ---------------------------------------------------------------------
  await t('ponte assinante: sem sessão jur_saas → 401', async () => {
    const r = await req('GET', '/juridico/api/legal/clientes'); // sem fake → assinanteDeReq null
    assert.equal(r.st, 401);
  });
  await t('ponte assinante: escritório acessa e vê só os PRÓPRIOS dados (isolado do interno)', async () => {
    const c = await req('POST', '/juridico/api/legal/clientes', { fake: { uid: 'b2' }, corpo: { nome: 'Cliente do Assinante B2', email: 'x@b2.com', tipo_cliente: 'ativo' } });
    assert.equal(c.st, 200);
    const lst = await req('GET', '/juridico/api/legal/clientes', { fake: { uid: 'b2' } });
    assert.equal(lst.st, 200);
    assert.equal(lst.json.clientes.length, 1);
    assert.equal(lst.json.clientes[0].nome, 'Cliente do Assinante B2');
    // escritório interno (villela, via staff) NÃO vê o cliente do assinante
    const staff = await req('GET', '/staff/api/legal/clientes');
    assert.ok(!staff.json.clientes.some(x => x.nome === 'Cliente do Assinante B2'), 'interno não pode ver dados do assinante');
  });
  await t('ponte assinante: módulo fora do plano → 403; baseline (clientes) liberado', async () => {
    // b3 só tem 'documentos' no plano: processos deve barrar, clientes (baseline) passa
    const proc = await req('GET', '/juridico/api/legal/processos', { fake: { uid: 'b3', modulos: 'documentos' } });
    assert.equal(proc.st, 403);
    const cli = await req('GET', '/juridico/api/legal/clientes', { fake: { uid: 'b3', modulos: 'documentos' } });
    assert.equal(cli.st, 200);
  });
  await t('ponte assinante: assinatura inativa (acesso não liberado) → 403', async () => {
    const r = await req('GET', '/juridico/api/legal/clientes', { fake: { uid: 'b4', acesso: false } });
    assert.equal(r.st, 403);
  });

  srv.close();
  console.log(`\n${ok} teste(s) OK, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach(f => console.log('  ✗', f)); process.exit(1); }
}

rodar().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
