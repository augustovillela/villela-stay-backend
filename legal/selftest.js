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

  // 5b. acervo de publicações: a íntegra fica acessível com um clique e o
  // conteúdo vira andamento do processo (pedido do Augusto, 03/08/2026).
  await t('publicação: ficha com íntegra, acervo pesquisável e busca por status', async () => {
    const texto = 'INTIMACAO INTEGRAL: fica a parte intimada para manifestar-se em 15 dias sobre o laudo pericial acostado aos autos.';
    const nova = await req('POST', '/staff/api/legal/publicacoes', { chave: true, corpo: { fonte: 'djen', data_publicacao: '2026-07-08', orgao: 'TJDFT — 2a Vara', texto, tem_prazo: true } });
    assert.equal(nova.json.duplicado, false);
    // ficha completa devolve o texto INTEIRO (não truncado) + blocos da tela
    const ficha = await req('GET', '/staff/api/legal/publicacoes/' + nova.json.id);
    assert.equal(ficha.st, 200);
    assert.equal(ficha.json.publicacao.texto, texto, 'íntegra preservada');
    assert.ok(Array.isArray(ficha.json.publicacao.prazos), 'prazos vinculados listados');
    // a listagem informa quantas existem e quantas ainda não foram triadas
    const lista = await req('GET', '/staff/api/legal/publicacoes');
    assert.ok(lista.json.total >= 2 && lista.json.novas >= 1, 'acervo conta total e novas');
    // as ANTERIORES (já triadas) continuam acessíveis — não somem da tela
    const triadas = await req('GET', '/staff/api/legal/publicacoes?status=analisada');
    assert.ok(triadas.json.publicacoes.length >= 1, 'publicação já triada continua no acervo');
    // busca textual encontra pelo conteúdo
    const busca = await req('GET', '/staff/api/legal/publicacoes?busca=laudo%20pericial');
    assert.equal(busca.json.publicacoes.length, 1);
    // publicação sem processo vinculado NÃO vira andamento às cegas
    const semCaso = await req('POST', `/staff/api/legal/publicacoes/${nova.json.id}/andamento`, { corpo: {} });
    assert.equal(semCaso.st, 400, 'sem processo vinculado o andamento é barrado');
  });

  await t('publicação → andamento: salva o conteúdo no processo e é idempotente', async () => {
    const texto = 'DESPACHO: intime-se a parte autora para especificar as provas que pretende produzir.';
    const pub = await req('POST', '/staff/api/legal/publicacoes', { chave: true, corpo: { fonte: 'djen', data_publicacao: '2026-07-09', orgao: 'TJDFT', texto } });
    const r = await req('POST', `/staff/api/legal/publicacoes/${pub.json.id}/andamento`, { corpo: { case_id: caseId } });
    assert.equal(r.st, 200);
    assert.ok(r.json.movement_id, 'andamento criado');
    assert.equal(r.json.case_id, caseId);
    // o CONTEÚDO da publicação está no andamento do processo
    const ands = await req('GET', `/staff/api/legal/processos/${caseId}/andamentos`);
    const mov = ands.json.andamentos.find(m => m.id === r.json.movement_id);
    assert.ok(mov, 'andamento aparece na linha do tempo do processo');
    assert.equal(mov.descricao, texto);
    // triagem avança sozinha e o vínculo fica registrado na ficha
    const ficha = await req('GET', '/staff/api/legal/publicacoes/' + pub.json.id);
    assert.equal(ficha.json.publicacao.status, 'analisada');
    assert.equal(ficha.json.publicacao.movement_id, r.json.movement_id);
    assert.ok(ficha.json.publicacao.andamento, 'ficha traz o andamento gerado');
    // repetir NÃO duplica o andamento — devolve o mesmo id
    const r2 = await req('POST', `/staff/api/legal/publicacoes/${pub.json.id}/andamento`, { corpo: { case_id: caseId } });
    assert.equal(r2.json.movement_id, r.json.movement_id, 'reconversão devolve o mesmo andamento');
    const ands2 = await req('GET', `/staff/api/legal/processos/${caseId}/andamentos`);
    assert.equal(ands2.json.andamentos.filter(m => m.descricao === texto).length, 1, 'sem duplicata na linha do tempo');
  });

  await t('publicação: coleta com CNJ conhecido já entra vinculada e vira andamento', async () => {
    const texto = '0700111-22.2026.8.07.0001 - SENTENCA: julgo procedente o pedido inicial. Publicacao automatica.';
    const pub = await req('POST', '/staff/api/legal/publicacoes', { chave: true, corpo: { fonte: 'djen', data_publicacao: '2026-07-10', orgao: 'TJDFT', texto, tem_prazo: true } });
    assert.equal(pub.json.case_id, caseId, 'vinculou pelo CNJ que veio no texto');
    assert.ok(pub.json.movement_id, 'andamento gerado junto com a coleta');
    const ficha = await req('GET', '/staff/api/legal/publicacoes/' + pub.json.id);
    assert.equal(ficha.json.publicacao.andamento.classificacao, 'intimacao'); // tem_prazo → intimação
    assert.equal(ficha.json.publicacao.andamento.descricao, texto);
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
  await t('coleta: os 27 TJs do Anexo V da Res. CNJ 65/2008 são deduzidos do número CNJ', async () => {
    // o processo real que não coletava (Sofia Villela, TJRS)
    assert.equal(legal.coleta.aliasTribunal('5002731-07.2025.8.21.0046'), 'tjrs');
    // amostra que cobre os limites da tabela e os que faltavam
    const esperado = {
      '01': 'tjac', '06': 'tjce', '10': 'tjma', '11': 'tjmt', '12': 'tjms', '14': 'tjpa',
      '15': 'tjpb', '16': 'tjpr', '17': 'tjpe', '18': 'tjpi', '20': 'tjrn', '21': 'tjrs',
      '22': 'tjro', '23': 'tjrr', '24': 'tjsc', '25': 'tjse', '27': 'tjto',
    };
    for (const [tr, alias] of Object.entries(esperado)) {
      assert.equal(legal.coleta.aliasTribunal(`0000100-15.2026.8.${tr}.0001`), alias, 'TR ' + tr);
    }
    // os 7 que já existiam continuam valendo
    assert.equal(legal.coleta.aliasTribunal('0000100-15.2026.8.26.0001'), 'tjsp');
    assert.equal(legal.coleta.aliasTribunal('0000100-15.2026.8.13.0001'), 'tjmg');
    // Justiça Militar Estadual (J=9) e código inexistente
    assert.equal(legal.coleta.aliasTribunal('0000100-15.2026.9.21.0000'), 'tjmrs');
    assert.equal(legal.coleta.aliasTribunal('0000100-15.2026.8.99.0001'), null);
    // outros segmentos seguem intactos
    assert.equal(legal.coleta.aliasTribunal('0000100-15.2026.4.01.0001'), 'trf1');
    assert.equal(legal.coleta.aliasTribunal('0000100-15.2026.5.10.0001'), 'trt10');
    assert.equal(legal.coleta.aliasTribunal('0000100-15.2026.5.00.0000'), 'tst');
  });
  await t('coleta: movimento sem descrição é ignorado sem abortar o resto do processo', async () => {
    // a validação do repo continua valendo para lançamento MANUAL (é guardrail)
    const manual = await req('POST', `/staff/api/legal/processos/${caseId}/andamentos`, {
      chave: true, corpo: { data: '2026-07-21', descricao: '', fonte: 'manual' },
    });
    assert.equal(manual.st, 400, 'sem descrição, o lançamento manual é recusado');

    // já na COLETA, o movimento problemático não pode derrubar os demais do caso.
    // Dublê do DataJud: bom → quebrado (sem nome, como o TJES devolveu) → bom.
    const antes = await req('GET', `/staff/api/legal/processos/${caseId}`);
    const nAntes = antes.json.processo.movimentos.length;
    const r = await legal.coleta.coletarAndamentos({
      consultar: async () => ([{
        classe: { nome: 'Procedimento Comum' }, tribunal: 'TJDFT',
        movimentos: [
          { nome: 'Juntada de petição', dataHora: '2026-07-22T10:00:00', codigo: 26 },
          { dataHora: '2026-07-22T11:00:00', codigo: 999 },              // sem nome: o bug antigo
          { nome: 'Conclusão para decisão', dataHora: '2026-07-22T12:00:00', codigo: 51 },
        ],
      }]),
    });
    assert.equal(r.ignorados, 1, 'o movimento sem descrição entra na contagem de ignorados');
    assert.equal(r.novos, 2, 'os movimentos válidos ANTES e DEPOIS do inválido foram gravados');
    assert.equal(r.erros, 0, 'movimento ruim não conta como falha do processo inteiro');
    const depois = await req('GET', `/staff/api/legal/processos/${caseId}`);
    assert.equal(depois.json.processo.movimentos.length, nAntes + 2);
    // o ignorado fica rastreável no log de integrações (não desaparece em silêncio)
    const log = await req('GET', '/staff/api/legal/integracoes');
    assert.ok(log.json.logs.some(l => String(l.operacao).startsWith('movimento-ignorado:')), 'ignorado registrado no log');
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

  // ==================================================================
  // ONDA LIVRO — paridade com "Claude AI na Prática Jurídica"
  // Foco: as TRAVAS que o livro exige (aprovação humana antes de sair),
  // não o CRUD trivial.
  // ==================================================================
  const P = '/staff/api/legal';
  let leadId, propId;
  await t('livro/CRM: lead entra no funil com score e sinal de spam (Cap. 15.7/15.9)', async () => {
    const r = await req('POST', P + '/crm/leads', {
      corpo: {
        nome: 'Interessado Teste', email: 'i@t.com', telefone: '61999990000', origem: 'indicacao',
        urgencia: 'alta', resumo_fato: 'Cobrança indevida de taxa condominial com protesto em cartório há oito meses.',
      },
    });
    assert.equal(r.st, 200); leadId = r.json.lead.id;
    assert.ok(r.json.lead.score > 50, 'score deve refletir indicação + urgência');
    assert.equal(r.json.lead.spam_score, 0);
    const spam = await req('POST', P + '/crm/leads', { corpo: { nome: 'XX', resumo_fato: 'bitcoin' } });
    assert.ok(spam.json.lead.spam_score >= 60, 'lead sem contato e com isca deve pontuar spam');
  });
  await t('livro/CRM: proposta NÃO sai sem aprovação humana (trava do 47.1)', async () => {
    const p = await req('POST', `${P}/crm/leads/${leadId}/propostas`, {
      corpo: { escopo: 'Ação declaratória de inexistência de débito', modalidade: 'fixo', valor_centavos: 600000 },
    });
    assert.equal(p.st, 200); propId = p.json.proposta.id;
    assert.equal(p.json.proposta.status, 'rascunho');
    const cedo = await req('POST', `${P}/crm/propostas/${propId}/enviada`);
    assert.equal(cedo.st, 400);
    assert.ok(/aprovação humana/i.test(cedo.json.erro));
    const apr = await req('POST', `${P}/crm/propostas/${propId}/aprovar`);
    assert.equal(apr.st, 200); assert.ok(apr.json.proposta.aprovada_por);
    const env = await req('POST', `${P}/crm/propostas/${propId}/enviada`);
    assert.equal(env.st, 200); assert.equal(env.json.proposta.status, 'enviada');
  });
  await t('livro/CRM: editar proposta aprovada derruba a aprovação', async () => {
    const p2 = await req('POST', `${P}/crm/leads/${leadId}/propostas`, { corpo: { escopo: 'x', valor_centavos: 1000 } });
    await req('POST', `${P}/crm/propostas/${p2.json.proposta.id}/aprovar`);
    const ed = await req('PATCH', `${P}/crm/propostas/${p2.json.proposta.id}`, { corpo: { escopo: 'escopo diferente' } });
    assert.equal(ed.json.proposta.status, 'rascunho');
    assert.equal(ed.json.proposta.aprovada_por, '');
  });
  await t('livro/CRM: conflito de interesses trava a conversão (Cap. 17.1)', async () => {
    const cedo = await req('PATCH', `${P}/crm/leads/${leadId}`, { corpo: { estagio: 'contratado' } });
    assert.equal(cedo.st, 400); assert.ok(/conflito/i.test(cedo.json.erro));
    const pesq = await req('GET', `${P}/crm/conflitos?termo=Interessado`);
    assert.equal(pesq.st, 200);
    assert.ok(pesq.json.pesquisa.resultados.some(x => x.tipo === 'lead'));
    const reg = await req('POST', P + '/crm/conflitos', {
      corpo: { termo: 'Interessado Teste', lead_id: leadId, veredito: 'livre', justificativa: 'Sem cruzamento com parte contrária.' },
    });
    assert.equal(reg.st, 200);
    const depois = await req('PATCH', `${P}/crm/leads/${leadId}`, { corpo: { estagio: 'contratado' } });
    assert.equal(depois.st, 200);
  });

  let pesqId, achadoId;
  await t('livro/pesquisa: achado nasce como HIPÓTESE e só é conferido com fonte oficial (47.7)', async () => {
    const pj = await req('POST', P + '/pesquisa/projetos', {
      corpo: { titulo: 'Taxa condominial — prescrição', questao: 'Qual o prazo prescricional?', plano_busca: 'termos: taxa condominial, prescrição' },
    });
    assert.equal(pj.st, 200); pesqId = pj.json.projeto.id;
    const ac = await req('POST', `${P}/pesquisa/projetos/${pesqId}/achados`, {
      corpo: { identificacao: 'STJ, REsp 0.000.000/DF', hierarquia: 'persuasivo', ementa: 'ementa de teste' },
    });
    assert.equal(ac.st, 200); achadoId = ac.json.achado.id;
    assert.equal(ac.json.achado.verificado, 0);
    const semFonte = await req('POST', `${P}/pesquisa/achados/${achadoId}/conferir`, { corpo: {} });
    assert.equal(semFonte.st, 400);
    assert.ok(/OFICIAL/i.test(semFonte.json.erro));
    const conf = await req('POST', `${P}/pesquisa/achados/${achadoId}/conferir`, { corpo: { fonte_url: 'https://scon.stj.jus.br/x' } });
    assert.equal(conf.st, 200); assert.equal(conf.json.achado.verificado, 1);
    const det = await req('GET', `${P}/pesquisa/projetos/${pesqId}`);
    assert.equal(det.json.projeto.conferidos.length, 1);
    assert.equal(det.json.projeto.hipoteses.length, 0);
  });
  await t('livro/pesquisa: alterar o achado conferido devolve ao bloco de hipóteses', async () => {
    const ed = await req('PATCH', `${P}/pesquisa/achados/${achadoId}`, { corpo: { ementa: 'ementa reescrita' } });
    assert.equal(ed.json.achado.verificado, 0);
  });
  await t('livro/pesquisa: relatório auditável separa os dois blocos', async () => {
    const r = await req('GET', `${P}/pesquisa/projetos/${pesqId}/relatorio`);
    assert.equal(r.st, 200);
    assert.ok(/text\/html/.test(r.ct));
    assert.ok(r.texto.includes('Localizado e conferido'));
    assert.ok(r.texto.includes('Hipótese a verificar'));
    assert.ok(r.texto.includes('MINUTA'));
  });

  let casoLivroId;
  await t('livro/matrizes: fato "comprovado" exige fonte (Cap. 5.6) e provas apontam lacunas (24.1)', async () => {
    const c = await req('POST', P + '/processos', { corpo: { numero_cnj: '0009999-00.2026.8.07.0001', client_id: cliId, nucleo: 'civel' } });
    assert.equal(c.st, 200); casoLivroId = c.json.processo.id;
    const semFonte = await req('POST', `${P}/matrizes/${casoLivroId}/fatos`, { corpo: { fato: 'Pagou a taxa', situacao: 'comprovado' } });
    assert.equal(semFonte.st, 400);
    const comFonte = await req('POST', `${P}/matrizes/${casoLivroId}/fatos`, { corpo: { fato: 'Pagou a taxa', situacao: 'comprovado', fonte: 'fls. 45 dos autos' } });
    assert.equal(comFonte.st, 200);
    const contro = await req('POST', `${P}/matrizes/${casoLivroId}/fatos`, { corpo: { fato: 'Houve notificação prévia', situacao: 'controvertido' } });
    assert.equal(contro.st, 200);
    const pv = await req('GET', `${P}/matrizes/${casoLivroId}/provas`);
    assert.ok(pv.json.lacunas.length >= 1, 'fato controvertido sem prova deve aparecer como lacuna');
  });
  await t('livro/estratégia: cenário exige declarar a incerteza (Cap. 23.3)', async () => {
    const sem = await req('POST', `${P}/estrategia/${casoLivroId}/cenarios`, { corpo: { cenario: 'Procedência total', probabilidade: 'possivel' } });
    assert.equal(sem.st, 400); assert.ok(/incerteza/i.test(sem.json.erro));
    const com = await req('POST', `${P}/estrategia/${casoLivroId}/cenarios`, {
      corpo: { cenario: 'Procedência total', probabilidade: 'possivel', incerteza: 'Não se sabe se há prova do envio da notificação.' },
    });
    assert.equal(com.st, 200);
  });
  await t('livro/diagnóstico: minuta de IA fica rascunho até validação humana (Cap. 21.9/6.9)', async () => {
    const dg = await req('POST', `${P}/matrizes/${casoLivroId}/diagnosticos`, {
      chave: true, corpo: { origem: 'ia', cronologia: 'linha do tempo gerada', riscos_lacunas: 'faltam documentos' },
    });
    assert.equal(dg.st, 200); assert.equal(dg.json.diagnostico.status, 'rascunho');
    const val = await req('POST', `${P}/matrizes/diagnosticos/${dg.json.diagnostico.id}/validar`);
    assert.equal(val.st, 200); assert.ok(val.json.diagnostico.validado_por);
  });

  let ctrId;
  await t('livro/contratos: assinatura bloqueada sem alçada aprovada (Cap. 29.9 / 47.9)', async () => {
    const c = await req('POST', P + '/contratos-ciclo', {
      corpo: { titulo: 'Prestação de serviços — teste', tipo: 'servicos', contraparte: 'Empresa X', alcada: 'socio', vigencia_fim: '2027-01-31', renovacao_automatica: true, aviso_previo_dias: 30 },
    });
    assert.equal(c.st, 200); ctrId = c.json.contrato.id;
    const cedo = await req('POST', `${P}/contratos-ciclo/${ctrId}/mover`, { corpo: { status: 'assinatura' } });
    assert.equal(cedo.st, 400); assert.ok(/alçada/i.test(cedo.json.erro));
    const ped = await req('POST', `${P}/contratos-ciclo/${ctrId}/aprovacao`, { corpo: {} });
    assert.equal(ped.st, 200);
    const apId = ped.json.contrato.aprovacoes[0].id;
    const semRessalva = await req('POST', `${P}/contratos-ciclo/aprovacoes/${apId}`, { corpo: { decisao: 'com_ressalva' } });
    assert.equal(semRessalva.st, 400);
    const dec = await req('POST', `${P}/contratos-ciclo/aprovacoes/${apId}`, { corpo: { decisao: 'aprovado' } });
    assert.equal(dec.st, 200);
    const ok2 = await req('POST', `${P}/contratos-ciclo/${ctrId}/mover`, { corpo: { status: 'vigente' } });
    assert.equal(ok2.st, 200);
  });
  await t('livro/contratos: alerta de renovação calcula a janela de denúncia (Cap. 29.11)', async () => {
    const r = await req('GET', P + '/contratos-ciclo?dias=400');
    assert.equal(r.st, 200);
    const alvo = r.json.alertas.renovacoes.find(x => x.id === ctrId);
    assert.ok(alvo, 'contrato vigente com fim de vigência deve entrar nos alertas');
    assert.ok(alvo.denuncia_ate && alvo.denuncia_ate < alvo.vigencia_fim, 'denúncia deve vencer antes do fim da vigência');
  });
  await t('livro/contratos: cláusula inaceitável exige justificativa (Cap. 29.3)', async () => {
    const sem = await req('POST', P + '/clausulas', { corpo: { tema: 'Foro', nivel: 'inaceitavel', texto: 'Foro estrangeiro' } });
    assert.equal(sem.st, 400);
    const com = await req('POST', P + '/clausulas', { corpo: { tema: 'Foro', nivel: 'inaceitavel', texto: 'Foro estrangeiro', justificativa: 'Inviabiliza a execução no Brasil.' } });
    assert.equal(com.st, 200);
  });

  await t('livro/financeiro: hora sem valor/hora não fatura; cobrança nível 2 exige aprovação (47.10)', async () => {
    const hr = await req('POST', P + '/fin/horas', { corpo: { minutos: 90, atividade: 'Elaboração de petição', client_id: cliId } });
    assert.equal(hr.st, 200);
    const semValor = await req('POST', P + '/fin/faturas/de-horas', { corpo: { client_id: cliId } });
    assert.equal(semValor.st, 400);
    assert.ok(/valor\/hora/i.test(semValor.json.erro));
    const fee = await req('POST', P + '/fin/honorarios', { corpo: { client_id: cliId, modalidade: 'hora', valor_hora_centavos: 40000 } });
    assert.equal(fee.st, 200);
    const hr2 = await req('POST', P + '/fin/horas', { corpo: { minutos: 60, atividade: 'Audiência', client_id: cliId } });
    assert.equal(hr2.json.hora.valor_hora_centavos, 40000, 'deve herdar o valor/hora do contrato');
    const fat = await req('POST', P + '/fin/faturas/de-horas', { corpo: { client_id: cliId } });
    assert.equal(fat.st, 400, 'a 1ª hora ficou sem valor → ainda barra');
    // remove o apontamento sem valor e fatura
    await req('DELETE', `${P}/fin/horas/${hr.json.hora.id}`);
    const fat2 = await req('POST', P + '/fin/faturas/de-horas', { corpo: { client_id: cliId } });
    assert.equal(fat2.st, 200);
    assert.equal(fat2.json.fatura.valor_centavos, 40000);
    const cb1 = await req('POST', `${P}/fin/faturas/${fat2.json.fatura.id}/cobrancas`, { corpo: { nivel: 1, canal: 'email', texto: 'lembrete' } });
    const env1 = await req('POST', `${P}/fin/cobrancas/${cb1.json.cobranca.id}/enviada`);
    assert.equal(env1.st, 200, 'nível 1 é lembrete: sai sem aprovação');
    const cb2 = await req('POST', `${P}/fin/faturas/${fat2.json.fatura.id}/cobrancas`, { corpo: { nivel: 2, canal: 'email', texto: 'cobrança' } });
    const env2 = await req('POST', `${P}/fin/cobrancas/${cb2.json.cobranca.id}/enviada`);
    assert.equal(env2.st, 400); assert.ok(/aprovação humana/i.test(env2.json.erro));
    await req('POST', `${P}/fin/cobrancas/${cb2.json.cobranca.id}/aprovar`);
    const env2b = await req('POST', `${P}/fin/cobrancas/${cb2.json.cobranca.id}/enviada`);
    assert.equal(env2b.st, 200);
  });

  await t('livro/POP: checklist obrigatório trava a conclusão (Cap. 7.7)', async () => {
    const pop = await req('POST', P + '/interno/pops', {
      corpo: {
        codigo: 'POP-01', titulo: 'Tratamento de publicação', area: 'civel',
        passos: [{ acao: 'Ler a publicação', responsavel: 'paralegal' }],
        checklist: [{ item: 'Processo identificado', obrigatorio: true }, { item: 'Cliente avisado', obrigatorio: false }],
      },
    });
    assert.equal(pop.st, 200);
    const pub = await req('POST', `${P}/interno/pops/${pop.json.pop.id}/publicar`);
    assert.equal(pub.st, 200); assert.ok(pub.json.pop.aprovado_por);
    const incompleto = await req('POST', `${P}/interno/pops/${pop.json.pop.id}/executar`, {
      corpo: { concluido: true, marcados: [{ item: 'Cliente avisado', ok: true }] },
    });
    assert.equal(incompleto.st, 400); assert.ok(/obrigatório/i.test(incompleto.json.erro));
    const completo = await req('POST', `${P}/interno/pops/${pop.json.pop.id}/executar`, {
      corpo: { concluido: true, marcados: [{ item: 'Processo identificado', ok: true }] },
    });
    assert.equal(completo.st, 200);
  });
  await t('livro/agentes: carta exige os três blocos do Cap. 10.10', async () => {
    const sem = await req('POST', P + '/agentes/cartas', { corpo: { agente: 'publicacoes', nome: 'Agente de publicações', pode_sozinho: ['coletar DJEN'] } });
    assert.equal(sem.st, 400);
    const com = await req('POST', P + '/agentes/cartas', {
      corpo: {
        agente: 'publicacoes', nome: 'Agente de publicações', pode_sozinho: ['coletar DJEN', 'sugerir cálculo de prazo'],
        exige_aprovacao: ['confirmar prazo', 'avisar cliente'], proibido: ['protocolar peça', 'responder cliente'],
      },
    });
    assert.equal(com.st, 200);
    const central = await req('GET', P + '/agentes/central');
    assert.ok(central.json.cartas.some(x => x.agente === 'publicacoes'));
  });

  await t('livro/compliance: risco alto sem plano barra; LGPD calcula prazo de 15 dias', async () => {
    const semPlano = await req('POST', P + '/compliance/riscos', { corpo: { risco: 'Perda de prazo por falha de coleta', impacto: 'critico', probabilidade: 'possivel' } });
    assert.equal(semPlano.st, 400);
    const comPlano = await req('POST', P + '/compliance/riscos', {
      corpo: { risco: 'Perda de prazo por falha de coleta', impacto: 'critico', probabilidade: 'possivel', controles: 'Conferência diária independente', plano_correcao: 'Alerta de coleta zero' },
    });
    assert.equal(comPlano.st, 200);
    const dsr = await req('POST', P + '/lgpd/titulares', { corpo: { titular: 'Titular Teste', tipo: 'acesso', recebido_em: '2026-07-01' } });
    assert.equal(dsr.st, 200); assert.equal(dsr.json.pedido.prazo_em, '2026-07-16');
    const semResposta = await req('PATCH', `${P}/lgpd/titulares/${dsr.json.pedido.id}`, { corpo: { status: 'atendido' } });
    assert.equal(semResposta.st, 400);
  });
  await t('livro/compliance: eliminação de documento exige autorização nominal e motivo (35.12)', async () => {
    const sem = await req('POST', P + '/lgpd/eliminacoes', { corpo: { descricao: 'Cópias de autos' } });
    assert.equal(sem.st, 400);
    const com = await req('POST', P + '/lgpd/eliminacoes', { corpo: { descricao: 'Cópias de autos', motivo: 'Prazo de guarda vencido (tabela de temporalidade)' } });
    assert.equal(com.st, 200); assert.ok(com.json.registro.autorizado_por);
  });
  await t('livro/compliance: item crítico do inventário exige plano de contingência (12.9)', async () => {
    const sem = await req('POST', P + '/interno/inventario', { corpo: { nome: 'Coleta DJEN local', tipo: 'automacao', criticidade: 'critica' } });
    assert.equal(sem.st, 400);
    const com = await req('POST', P + '/interno/inventario', {
      corpo: { nome: 'Coleta DJEN local', tipo: 'automacao', criticidade: 'critica', plano_contingencia: 'Conferência manual no DJEN pela equipe.' },
    });
    assert.equal(com.st, 200);
  });

  await t('livro/conteúdo: publicar sem revisão ética é bloqueado (Prov. 205/2021 · Cap. 14.5)', async () => {
    const ct = await req('POST', P + '/conteudo', { corpo: { titulo: 'Como funciona a usucapião', tipo: 'artigo', texto: 'texto informativo' } });
    assert.equal(ct.st, 200);
    const id = ct.json.item.id;
    const cedo = await req('PATCH', `${P}/conteudo/${id}`, { corpo: { status: 'publicado' } });
    assert.equal(cedo.st, 400); assert.ok(/ética/i.test(cedo.json.erro));
    const cl = await req('GET', `${P}/conteudo/${id}`);
    const obrig = cl.json.checklist.filter(c => c.obrigatorio);
    // faltando um obrigatório → reprovado
    const parcial = await req('POST', `${P}/conteudo/${id}/etica`, { corpo: { itens: obrig.slice(1).map(c => ({ item: c.item, ok: true })) } });
    assert.equal(parcial.st, 200); assert.equal(parcial.json.reprovado, true);
    const total = await req('POST', `${P}/conteudo/${id}/etica`, { corpo: { itens: cl.json.checklist.map(c => ({ item: c.item, ok: true })) } });
    assert.equal(total.json.reprovado, false);
    const pub = await req('PATCH', `${P}/conteudo/${id}`, { corpo: { status: 'publicado', url_publicada: 'https://x/y' } });
    assert.equal(pub.st, 200);
    // alterar o texto de conteúdo publicado exige nova versão
    const reescrever = await req('PATCH', `${P}/conteudo/${id}`, { corpo: { texto: 'outro texto' } });
    assert.equal(reescrever.st, 400);
  });

  await t('livro/portal: tradução do andamento só fica visível após aprovação humana (47.2)', async () => {
    const mov = await req('POST', `${P}/processos/${casoLivroId}/andamentos`, {
      chave: true, corpo: { data: '2026-07-20', descricao: 'Intimação para manifestação em 15 dias', fonte: 'teste' },
    });
    assert.equal(mov.st, 200);
    const movId = mov.json.id || (mov.json.andamento && mov.json.andamento.id);
    assert.ok(movId, 'andamento deve retornar id');
    const tr = await req('POST', `${P}/portal/andamentos/${movId}/traducao`, {
      chave: true, corpo: { texto_simples: 'O juiz pediu que você envie um documento.', origem: 'ia', sensivel: true },
    });
    assert.equal(tr.st, 200); assert.equal(tr.json.traducao.status, 'rascunho');
    const cedo = await req('POST', `${P}/portal/traducoes/${tr.json.traducao.id}/publicar`, { corpo: {} });
    assert.equal(cedo.st, 400); assert.ok(/aprovação humana/i.test(cedo.json.erro));
    await req('POST', `${P}/portal/traducoes/${tr.json.traducao.id}/aprovar`);
    const sensivel = await req('POST', `${P}/portal/traducoes/${tr.json.traducao.id}/publicar`, { corpo: {} });
    assert.equal(sensivel.st, 400);
    assert.ok(/sensível/i.test(sensivel.json.erro), 'evento sensível espera a conversa pessoal');
    const pub = await req('POST', `${P}/portal/traducoes/${tr.json.traducao.id}/publicar`, { corpo: { conversa_feita: true } });
    assert.equal(pub.st, 200); assert.equal(pub.json.traducao.status, 'publicada');
  });

  await t('livro/documentos: classificação de baixa confiança vai para a fila (47.6)', async () => {
    const doc = await req('POST', P + '/documentos', {
      corpo: { titulo: 'digitalizacao.pdf', tipo: 'outro', case_id: casoLivroId, nome_original: 'digitalizacao.pdf', base64: Buffer.from('%PDF-1.4 teste').toString('base64') },
    });
    assert.equal(doc.st, 200);
    const docId = doc.json.id;
    const fila = await req('POST', P + '/documentos-fila', {
      chave: true, corpo: { document_id: docId, sugestao_tipo: 'sentenca', sugestao_nome: 'Sentença', confianca: 0.42 },
    });
    assert.equal(fila.st, 200); assert.equal(fila.json.item.exige_revisao, true);
    const dec = await req('PATCH', `${P}/documentos-fila/${fila.json.item.id}`, { corpo: { status: 'corrigida', tipo: 'decisao', titulo: 'Decisão interlocutória' } });
    assert.equal(dec.st, 200);
    const det = await req('GET', `${P}/documentos/${docId}`);
    assert.equal(det.json.documento.tipo, 'decisao');
  });

  await t('livro/controladoria: conferências rodam de forma independente e geram achados (47.11)', async () => {
    const r = await req('POST', P + '/controladoria/rodar', { corpo: { escopo: 'manual' } });
    assert.equal(r.st, 200);
    assert.ok(r.json.achados >= 1, 'com prazo/publicação pendentes deve haver achado');
    const lst = await req('GET', P + '/controladoria');
    assert.ok(lst.json.regras.length >= 20, 'catálogo de conferências do livro');
    const ind = await req('GET', P + '/controladoria/indicadores');
    assert.ok(ind.json.indicadores.prazos, 'indicadores do Cap. 40');
    const achado = lst.json.achados[0];
    const semJust = await req('PATCH', `${P}/controladoria/achados/${achado.id}`, { corpo: { status: 'falso_positivo' } });
    assert.equal(semJust.st, 400, 'falso positivo exige justificativa');
    const tratado = await req('PATCH', `${P}/controladoria/achados/${achado.id}`, { corpo: { status: 'tratado', observacao: 'corrigido' } });
    assert.equal(tratado.st, 200);
  });

  await t('livro/prazos: escalonamento em três níveis e confirmação de leitura (47.4/19.7/19.8)', async () => {
    const pz = await req('POST', P + '/prazos', {
      corpo: { case_id: casoLivroId, titulo: 'Manifestação', tipo: 'fatal', data_fatal: new Date(Date.now() + 864e5).toISOString().slice(0, 10), validado_por: 'Admin Teste' },
    });
    assert.equal(pz.st, 200);
    const pend = await req('GET', P + '/prazos-escalonamento');
    const meus = pend.json.pendentes.filter(x => x.deadline.id === pz.json.prazo.id);
    assert.ok(meus.length >= 3, 'prazo em D-1 acumula os níveis 1, 2 e 3');
    assert.ok(meus.some(x => x.nivel === 3), 'véspera escala até o sócio');
    const reg = await req('POST', P + '/prazos-escalonamento', {
      chave: true, corpo: { deadline_id: pz.json.prazo.id, nivel: 3, dias_antes: 1, destino: 'socio', canal: 'whatsapp' },
    });
    assert.equal(reg.st, 200);
    const naoLidos = await req('GET', P + '/prazos-escalonamento');
    assert.ok(naoLidos.json.nao_lidos.some(x => x.id === reg.json.alerta.id));
    const lido = await req('POST', `${P}/prazos-escalonamento/${reg.json.alerta.id}/lido`);
    assert.equal(lido.st, 200); assert.ok(lido.json.alerta.lido_em);
  });

  await t('livro/seeds: escritório novo nasce com os artefatos do livro (rascunho a aprovar)', async () => {
    const pol = await req('GET', P + '/compliance/politicas');
    const ia = pol.json.politicas.find(p => p.tipo === 'politica_ia');
    assert.ok(ia, 'política de uso de IA semeada (Cap. 6.10/42.12)');
    assert.equal(ia.status, 'rascunho', 'seed não se autoaprova');
    const pops = await req('GET', P + '/interno/pops');
    assert.ok(pops.json.pops.length >= 3, 'POPs iniciais do Cap. 7.8');
    const cl = await req('GET', P + '/clausulas?tema=Limitação&agrupar=1');
    assert.ok(cl.json.tema.preferencial.length && cl.json.tema.inaceitavel.length, 'cláusulas em três níveis (Cap. 29.3)');
    const temp = await req('GET', P + '/lgpd/temporalidade');
    assert.ok(temp.json.tabela.length >= 5, 'tabela de temporalidade (Cap. 35.11)');
    const central = await req('GET', P + '/agentes/central');
    assert.ok(central.json.cartas.length >= 5, 'cartas de autonomia dos agentes do Cap. 10');
    for (const c of central.json.cartas) {
      assert.ok(c.proibido.length && c.exige_aprovacao.length, 'toda carta tem os três blocos do Cap. 10.10');
    }
  });
  await t('livro/seeds: base normativa nasce conferida, com fonte oficial e data (Cap. 33.4/33.9)', async () => {
    const r = await req('GET', P + '/pesquisa/normas');
    assert.ok(r.json.normas.length >= 9, 'normas que sustentam as minutas semeadas');
    for (const n of r.json.normas) {
      assert.ok(n.fonte_url && /^https:\/\//.test(n.fonte_url), 'toda norma semeada aponta fonte oficial: ' + n.identificacao);
      assert.ok(n.conferida_em && n.conferida_por, 'conferência datada e nominal: ' + n.identificacao);
    }
    // as três normas de IA/publicidade que o livro manda conferir (caps. 6/13/42)
    const tem = (t) => r.json.normas.some(n => n.identificacao.includes(t));
    assert.ok(tem('205/2021'), 'Provimento 205/2021 (publicidade)');
    assert.ok(tem('001/2024'), 'Recomendação CFOAB 001/2024 (IA generativa)');
    assert.ok(tem('615/2025'), 'Resolução CNJ 615/2025 (Política de IA do Judiciário)');
    assert.equal(r.json.desatualizadas.length, 0, 'nenhuma norma semeada nasce vencida de conferência');
    // a política de IA precisa citar as normas conferidas, não normas genéricas
    const pol = await req('GET', P + '/compliance/politicas');
    const ia = pol.json.politicas.find(p => p.tipo === 'politica_ia');
    const det = await req('GET', `${P}/compliance/politicas/${ia.id}`);
    for (const ref of ['001/2024', '615/2025', '205/2021', '13.709']) {
      assert.ok(det.json.politica.texto.includes(ref), 'política de IA cita ' + ref);
    }
    assert.ok(/COMUNICAÇÃO AO CLIENTE/i.test(det.json.politica.texto), 'dever de comunicar o uso de IA ao cliente (Recomendação 001/2024)');
  });
  await t('livro/rotina: manutenção diária marca vencidos, escalona prazos e roda conferências', async () => {
    const r = legal.coleta.manutencaoLivro();
    assert.ok(typeof r.achados === 'number');
    assert.ok(r.escalonamentos >= 0);
    const runs = await req('GET', P + '/controladoria');
    assert.ok(runs.json.runs.some(x => x.escopo === 'diaria'), 'execução diária registrada');
  });
  await t('livro/ponte: módulos novos são gateados pelo plano do assinante', async () => {
    const semCrm = await req('GET', '/juridico/api/legal/crm/painel', { fake: { uid: 'b5', modulos: 'documentos' } });
    assert.equal(semCrm.st, 403);
    const comCrm = await req('GET', '/juridico/api/legal/crm/painel', { fake: { uid: 'b5', modulos: 'documentos,crm' } });
    assert.equal(comCrm.st, 200);
    const semCompliance = await req('GET', '/juridico/api/legal/lgpd/inventario', { fake: { uid: 'b5', modulos: 'crm' } });
    assert.equal(semCompliance.st, 403);
  });

  srv.close();
  console.log(`\n${ok} teste(s) OK, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach(f => console.log('  ✗', f)); process.exit(1); }
}

rodar().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
