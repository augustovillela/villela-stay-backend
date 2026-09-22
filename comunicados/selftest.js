// =====================================================================
// Comunicados — suíte.   npm run test:comunicados
//
// Quase todo teste VIOLA uma trava de propósito e exige que ela segure:
//   sql        todo segmento de todo produto compila contra o schema REAL
//   público    mesma pessoa em dois sistemas recebe uma vez; desmarcou
//              marketing sai de novidade mas fica em instabilidade;
//              conta excluída e de demonstração nunca entram
//   envio      a chave (PUBLISH_KEY) prepara rascunho mas NÃO dispara;
//              sem `confirmar: true` não sai; a fila respeita o teto do
//              dia; falha volta à fila e vira erro na 3ª; reinício não
//              duplica; cancelar para o que ainda não saiu
//   descadastro token adulterado não vale; "avisos" ≠ "tudo"
//   app        sino só com sessão válida DO PRÓPRIO produto; cookie de
//              outro produto não abre; central nativa (Academy) recebe
// =====================================================================
'use strict';
const path = require('path');
process.env.DATA_DIR = path.join(require('os').tmpdir(), 'comunicados-selftest-' + Date.now());
process.env.COMUNICADOS_FILA_OFF = '1';      // o teste gira a fila à mão
process.env.COMUNICADOS_EMAIL_DIA = '3';     // teto pequeno: a trava do dia fica barata de testar
process.env.COMUNICADOS_EMAIL_MIN = '50';
process.env.COMUNICADOS_WA_TEMPLATE = 'aviso_plataforma::pt_BR';
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const SEGREDO = 'segredo-de-teste';
const CHAVE = 'chave-de-teste';
process.env.PUBLISH_KEY = CHAVE;

// ---- staff falso ----
function requireAuth(req, res, next) {
  if (req.headers['x-test-user'] === 'adm') { req.user = { id: 'adm', nome: 'Admin', email: 'adm@villela.test', papel: 'admin' }; return next(); }
  if (req.headers['x-test-user'] === 'op') { req.user = { id: 'op', nome: 'Op', email: 'op@t', papel: 'membro' }; return next(); }
  return res.status(401).json({ erro: 'não autenticado' });
}
const requireAdmin = (req, res, next) => req.user && req.user.papel === 'admin' ? next() : res.status(403).json({ erro: 'apenas administrador' });
function requirePublishOrAdmin(req, res, next) {
  if (req.headers['x-publish-key'] === CHAVE) { req.viaChave = true; return next(); }
  return requireAuth(req, res, () => requireAdmin(req, res, next));
}

// ---- canais falsos ----
const saidos = { email: [], whatsapp: [] };
let emailFalhaPara = null;
const enviarEmail = async (to, assunto, html) => { if (to === emailFalhaPara) return false; saidos.email.push({ to, assunto, html }); return true; };
const enviarWhatsAppTemplate = async (to, template, params) => { saidos.whatsapp.push({ to, template, params }); return true; };
const avisosStaff = [];
const avisarStaff = async (p) => { avisosStaff.push(p); return 1; };

// ---- bases dos produtos (schema real, dados mínimos) ----
const agora = new Date().toISOString();
const acad = require('../academy/db').db;
const insU = acad.prepare('INSERT INTO users (id, nome, email, telefone, status, consentimentos, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
insU.run('a1', 'Ana Aluna', 'ana@ex.com', '61999990001', 'ativo', JSON.stringify({ marketing: true }), agora);
insU.run('a2', 'Beto Sem Mkt', 'beto@ex.com', '61999990002', 'ativo', JSON.stringify({ marketing: false }), agora);
insU.run('a3', 'Caio Excluído', 'caio@ex.com', '', 'excluido', '{}', agora);
insU.run('a4', 'Dora Sem Contato', 'invalido', '', 'ativo', '{}', agora);
acad.prepare('INSERT INTO sessions (id, user_id, criada_em, expira_em) VALUES (?, ?, ?, ?)').run('jti-a1', 'a1', agora, new Date(Date.now() + 864e5).toISOString());
const music = require('../music/db').db;
music.prepare('INSERT INTO usuarios_music (academy_user_id, criado_em) VALUES (?, ?)').run('a1', agora);
const vsm = require('../vsm/db').db;
vsm.prepare('INSERT INTO tenants (id, slug, nome, telefone, status, criado_em) VALUES (?, ?, ?, ?, ?, ?)').run('t1', 'pousada', 'Pousada', '(61) 98888-0000', 'ativa', agora);
vsm.prepare('INSERT INTO tenants (id, slug, nome, telefone, status, criado_em) VALUES (?, ?, ?, ?, ?, ?)').run('t2', 'velha', 'Velha', '', 'cancelada', agora);
const insT = vsm.prepare('INSERT INTO tenant_users (id, tenant_id, nome, email, papel, ativo, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
insT.run('v1', 't1', 'Vera Dona', 'ANA@ex.com', 'admin', 1, agora);        // mesmo e-mail da Ana, em outro sistema
insT.run('v2', 't1', 'Vito Equipe', 'vito@ex.com', 'usuario', 1, agora);
insT.run('v3', 't2', 'Xavier Ex', 'xavier@ex.com', 'admin', 1, agora);

// ---- app ----
const com = require('./index');
const app = express();
app.use(cookieParser());
com.montar(app, { express, requireAuth, requireAdmin, requirePublishOrAdmin, enviarEmail, enviarWhatsAppTemplate, avisarStaff, jwtSecret: SEGREDO, registrarAuditoria: () => {} });
const { motor, fontes } = com;
const { db } = require('./db');

let base;
async function req(metodo, url, { corpo, quem, chave, cookie } = {}) {
  const h = { 'content-type': 'application/json' };
  if (quem) h['x-test-user'] = quem;
  if (chave) h['x-publish-key'] = CHAVE;
  if (cookie) h.cookie = cookie;
  const r = await fetch(base + url, { method: metodo, headers: h, body: corpo ? JSON.stringify(corpo) : undefined });
  let json = null; try { json = await r.json(); } catch (_) {}
  return { status: r.status, json };
}

let ok = 0; const falhas = [];
async function t(nome, fn) {
  try { await fn(); ok++; console.log('  ok  ' + nome); }
  catch (e) { falhas.push({ nome, erro: e.message }); console.log(' FALHA ' + nome + '\n        ' + e.message); }
}
const rascunho = (extra = {}) => ({ titulo: 'Novo recurso', corpo: 'Linha 1\n\nLinha 2', categoria: 'novidade', alvos: [{ produto: 'academy', segmento: 'todos' }], canais: ['app', 'email'], ...extra });

(async () => {
  const srv = app.listen(0); base = 'http://127.0.0.1:' + srv.address().port;

  await t('sql: todo segmento de todo sistema roda contra o schema real', async () => {
    for (const f of fontes.todas()) {
      if (f.indisponivel) continue;
      for (const g of f.segmentos) {
        const r = await f.listar(g.id);
        assert.ok(Array.isArray(r), `${f.chave}/${g.id} não devolveu lista`);
      }
    }
  });

  await t('público: excluída fica fora; e-mail inválido não conta como e-mail', async () => {
    const p = await motor.previa(rascunho());
    assert.equal(p.canais.app.total, 3, 'app: a1, a2, a4 (a3 excluída)');
    assert.equal(p.canais.email.total, 1, 'e-mail: só a Ana — Beto desmarcou marketing, Dora não tem e-mail válido');
    assert.equal(p.fora.sem_consentimento, 1);
    assert.equal(p.fora.sem_email, 1);
  });

  await t('público: instabilidade ignora marketing desmarcado (é aviso operacional)', async () => {
    const p = await motor.previa(rascunho({ categoria: 'instabilidade' }));
    assert.equal(p.canais.email.total, 2);
  });

  await t('público: mesma pessoa em dois sistemas recebe UMA vez (e-mail normalizado)', async () => {
    const p = await motor.previa(rascunho({ categoria: 'instabilidade', alvos: [{ produto: 'academy', segmento: 'todos' }, { produto: 'vsm', segmento: 'todos' }, { produto: 'music', segmento: 'todos' }] }));
    assert.equal(p.canais.email.total, 3, 'ana, beto, vito — ANA@ do VSM e a Ana da Musique são a mesma');
    assert.ok(p.fora.repetido >= 2);
    assert.equal(p.canais.app.total, 6, 'no app cada sistema é uma caixa: 3 academy + 2 vsm + 1 music');
  });

  await t('público: WhatsApp do SaaS vai só ao dono, com o telefone da empresa', async () => {
    const p = await motor.previa(rascunho({ categoria: 'instabilidade', alvos: [{ produto: 'vsm', segmento: 'todos' }], canais: ['whatsapp'] }));
    assert.equal(p.canais.whatsapp.total, 1);
    assert.equal(p.canais.whatsapp.operacoes_make, 2);
  });

  await t('público: segmento de cancelados não se mistura com "todos"', async () => {
    const todos = await fontes.obter('vsm').listar('todos');
    assert.ok(!todos.some((x) => x.ref === 'v3'));
    assert.deepEqual((await fontes.obter('vsm').listar('cancelados')).map((x) => x.ref), ['v3']);
  });

  await t('público: sistema sem app (Livraria) não gera aviso no app', async () => {
    const lv = require('../livraria/db').db;
    lv.prepare("INSERT INTO customers (id, nome, email, whatsapp, created_at, updated_at) VALUES ('c1', 'Leitor', 'leitor@ex.com', '', ?, ?)").run(agora, agora);
    lv.prepare("INSERT INTO orders (id, customer_id, status, created_at, updated_at) VALUES ('o1', 'c1', 'pago', ?, ?)").run(agora, agora);
    const p = await motor.previa(rascunho({ categoria: 'instabilidade', alvos: [{ produto: 'livraria', segmento: 'compradores' }] }));
    assert.equal(p.canais.app.total, 0);
    assert.equal(p.canais.email.total, 1);
  });

  await t('app: a caixa mora sob /api (o service worker dos apps não guarda /api em cache)', async () => {
    const js = require('fs').readFileSync(path.join(__dirname, 'widget.js'), 'utf8');
    assert.ok(/'\/api\/comunicados'/.test(js) && !/'\/comunicados'\)/.test(js));
  });

  await t('validação: sistema não conectado (Cozinhe) é recusado com o motivo', async () => {
    const r = await req('POST', '/staff/api/comunicados', { quem: 'adm', corpo: rascunho({ alvos: [{ produto: 'cozinhe', segmento: 'todos' }] }) });
    assert.equal(r.status, 400); assert.ok(/Cozinhe/.test(r.json.erro));
  });

  await t('permissão: membro comum não vê a central', async () => {
    assert.equal((await req('GET', '/staff/api/comunicados', { quem: 'op' })).status, 403);
  });

  let idChave;
  await t('permissão: a CHAVE cria rascunho, mas NÃO dispara', async () => {
    const r = await req('POST', '/staff/api/comunicados', { chave: true, corpo: rascunho() });
    assert.equal(r.status, 201); idChave = r.json.comunicado.id;
    const e = await req('POST', `/staff/api/comunicados/${idChave}/enviar`, { chave: true, corpo: { confirmar: true } });
    assert.equal(e.status, 401, 'a chave que pede não pode aprovar');
  });

  await t('envio: sem confirmar:true não sai', async () => {
    const e = await req('POST', `/staff/api/comunicados/${idChave}/enviar`, { quem: 'adm', corpo: {} });
    assert.equal(e.status, 400);
    assert.equal(motor.obter(idChave).status, 'rascunho');
  });

  let id1;
  await t('envio: dispara, entra na central da Academy e o e-mail sai pela fila', async () => {
    const c = (await req('POST', '/staff/api/comunicados', { quem: 'adm', corpo: rascunho({ categoria: 'instabilidade', destaque: true }) })).json.comunicado;
    id1 = c.id;
    const e = await req('POST', `/staff/api/comunicados/${id1}/enviar`, { quem: 'adm', corpo: { confirmar: true } });
    assert.equal(e.status, 200, JSON.stringify(e.json)); assert.equal(e.json.comunicado.status, 'enviando');
    assert.equal(saidos.email.length, 0, 'o clique não envia — quem envia é a fila');
    await motor.processarLote();
    assert.equal(saidos.email.length, 2);
    assert.ok(/Villela Academy/.test(saidos.email[0].assunto));
    assert.ok(/comunicados\/descadastro\?t=/.test(saidos.email[0].html), 'todo e-mail leva o link de descadastro');
    assert.ok(saidos.email[0].html.includes('https://academia.villelastay.com.br/comunicados/descadastro'), 'descadastro no domínio do produto');
    const n = acad.prepare("SELECT COUNT(*) n FROM notifications WHERE titulo = 'Novo recurso'").get().n;
    assert.equal(n, 3, 'o sino da Academy recebeu (a1, a2, a4)');
    assert.equal(motor.obter(id1).status, 'enviado');
  });

  await t('envio: repetir a fila e rematerializar não duplica', async () => {
    const antes = saidos.email.length;
    await motor.processarLote();
    const c = motor.obter(id1);
    const r = db.prepare('SELECT COUNT(*) n FROM entregas WHERE comunicado_id = ?').get(c.id).n;
    assert.equal(saidos.email.length, antes);
    assert.equal(r, 5, '3 app + 2 e-mail');
  });

  await t('envio: teto do dia segura o excedente para amanhã', async () => {
    // teto = 3; 2 já saíram hoje. Um comunicado para 2 e-mails: sai 1, fica 1.
    const c = motor.criar(rascunho({ titulo: 'Teto', categoria: 'instabilidade', canais: ['email'] }), 'adm');
    await motor.disparar(c.id, { autor: 'adm' });
    await motor.processarLote();
    const st = db.prepare("SELECT status, COUNT(*) n FROM entregas WHERE comunicado_id = ? GROUP BY status").all(c.id);
    const m = Object.fromEntries(st.map((x) => [x.status, x.n]));
    assert.equal(m.enviado, 1); assert.equal(m.pendente, 1);
    assert.equal(motor.obter(c.id).status, 'enviando');
    // cancelar para o que ainda não saiu
    const can = motor.cancelar(c.id);
    assert.equal(can.cancelados, 1); assert.equal(can.status, 'cancelado');
  });

  await t('envio: falha volta à fila e vira erro na 3ª tentativa; "tentar de novo" reenfileira', async () => {
    process.env.COMUNICADOS_EMAIL_DIA = '100';
    emailFalhaPara = 'vito@ex.com';
    const c = motor.criar(rascunho({ titulo: 'Falha', categoria: 'instabilidade', canais: ['email'], alvos: [{ produto: 'vsm', segmento: 'equipe' }] }), 'adm');
    await motor.disparar(c.id, { autor: 'adm' });
    for (let i = 0; i < 3; i++) await motor.processarLote();
    const e = db.prepare('SELECT status, tentativas FROM entregas WHERE comunicado_id = ?').get(c.id);
    assert.equal(e.status, 'erro'); assert.equal(e.tentativas, 3);
    assert.equal(motor.obter(c.id).status, 'enviado');
    emailFalhaPara = null;
    assert.equal(motor.reenviarErros(c.id), 1);
    await motor.processarLote();
    assert.equal(db.prepare('SELECT status FROM entregas WHERE comunicado_id = ?').get(c.id).status, 'enviado');
  });

  await t('whatsapp: modelo com 3 variáveis, de uma linha só e nunca vazias', async () => {
    const c = motor.criar(rascunho({ titulo: 'Queda', corpo: 'Primeira linha\n\n\tSegunda    linha', categoria: 'instabilidade', canais: ['whatsapp'], alvos: [{ produto: 'academy', segmento: 'todos' }] }), 'adm');
    await motor.disparar(c.id, { autor: 'adm' });
    await motor.processarLote();
    const m = saidos.whatsapp.find((x) => x.params[2].includes('Queda'));
    assert.ok(m, 'não saiu');
    assert.equal(m.template, 'aviso_plataforma::pt_BR');
    assert.equal(m.params.length, 3);
    m.params.forEach((p) => { assert.ok(p && !/[\n\t]/.test(p) && !/\s{4,}/.test(p), 'variável inválida: ' + JSON.stringify(p)); });
    assert.ok(m.to.startsWith('55'));
  });

  await t('descadastro: "avisos" tira novidade mas mantém instabilidade; "tudo" tira os dois', async () => {
    motor.descadastrar('ana@ex.com', 'email', 'avisos');
    assert.equal((await motor.previa(rascunho())).canais.email.total, 0);
    assert.equal((await motor.previa(rascunho({ categoria: 'instabilidade' }))).canais.email.total, 2);
    motor.descadastrar('ana@ex.com', 'email', 'tudo');
    assert.equal((await motor.previa(rascunho({ categoria: 'instabilidade' }))).canais.email.total, 1);
    motor.recadastrar('ana@ex.com', 'email');
  });

  await t('descadastro: token adulterado não vale; o verdadeiro vale pelo link', async () => {
    const tok = motor.tokenDescadastro('beto@ex.com', 'email');
    assert.equal(motor.lerTokenDescadastro(tok.replace(/.$/, (c) => c === 'A' ? 'B' : 'A')), null);
    const outro = Buffer.from('email|ana@ex.com').toString('base64url') + '.' + tok.split('.')[1];
    assert.equal(motor.lerTokenDescadastro(outro), null, 'assinatura de um contato não serve para outro');
    const r = await fetch(base + '/comunicados/descadastro', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 't=' + encodeURIComponent(tok) + '&escopo=tudo' });
    assert.equal(r.status, 200);
    assert.ok(motor.listarDescadastros().some((d) => d.contato === 'beto@ex.com' && d.escopo === 'tudo'));
  });

  await t('app: sem sessão o sino não desenha; cookie de OUTRO produto não abre', async () => {
    const anon = await req('GET', '/gestao/api/comunicados');
    assert.equal(anon.json.anonimo, true);
    const tokAcad = jwt.sign({ uid: 'a1', jti: 'jti-a1' }, SEGREDO);
    const cruzado = await req('GET', '/gestao/api/comunicados', { cookie: 'vsm_sess=' + tokAcad });
    assert.equal(cruzado.json.anonimo, true, 'uid da Academy não existe no VSM');
    const falso = await req('GET', '/gestao/api/comunicados', { cookie: 'vsm_sess=' + jwt.sign({ uid: 'v1' }, 'outro-segredo') });
    assert.equal(falso.json.anonimo, true, 'JWT com outro segredo');
  });

  await t('app: segmento congelado — só quem estava no público vê; "todos" vale para qualquer logado', async () => {
    const c = motor.criar(rascunho({ titulo: 'Só donos', categoria: 'novidade', canais: ['app'], alvos: [{ produto: 'vsm', segmento: 'donos' }] }), 'adm');
    await motor.disparar(c.id, { autor: 'adm' });
    const dono = await req('GET', '/gestao/api/comunicados', { cookie: 'vsm_sess=' + jwt.sign({ uid: 'v1' }, SEGREDO) });
    const equipe = await req('GET', '/gestao/api/comunicados', { cookie: 'vsm_sess=' + jwt.sign({ uid: 'v2' }, SEGREDO) });
    assert.ok(dono.json.itens.some((x) => x.titulo === 'Só donos'));
    assert.ok(!equipe.json.itens.some((x) => x.titulo === 'Só donos'));
    assert.ok(!equipe.json.itens.some((x) => x.titulo === 'Falha'), '"Falha" foi só por e-mail — não pode aparecer no sino');
  });

  await t('app: marcar lido zera o contador e arquivar tira do sino', async () => {
    const ck = 'vsm_sess=' + jwt.sign({ uid: 'v1' }, SEGREDO);
    const antes = (await req('GET', '/gestao/api/comunicados', { cookie: ck })).json;
    assert.ok(antes.nao_lidos >= 1);
    await req('POST', '/gestao/api/comunicados/todos/lido', { cookie: ck });
    assert.equal((await req('GET', '/gestao/api/comunicados', { cookie: ck })).json.nao_lidos, 0);
    const alvo = antes.itens[0].id;
    motor.arquivar(alvo);
    assert.ok(!(await req('GET', '/gestao/api/comunicados', { cookie: ck })).json.itens.some((x) => x.id === alvo));
  });

  await t('app: Academy resolve pela sessão da Academy (com revogação)', async () => {
    const ck = 'academy_sess=' + jwt.sign({ uid: 'a1', jti: 'jti-a1' }, SEGREDO);
    const r = await req('GET', '/academy/api/comunicados', { cookie: ck });
    assert.ok(!r.json.anonimo && r.json.itens.some((x) => x.destaque), 'a faixa de instabilidade devia vir');
    acad.prepare('UPDATE sessions SET revogada = 1 WHERE id = ?').run('jti-a1');
    assert.equal((await req('GET', '/academy/api/comunicados', { cookie: ck })).json.anonimo, true, 'sessão revogada ainda abria');
  });

  await t('widget: servido sob o caminho de cada produto', async () => {
    for (const p of ['/academy', '/gestao', '/vdocs', '/vpe', '/juridico', '/crm', '/finance', '/closet', '/vitrine', '/alta-vista', '/kids', '/music']) {
      const r = await fetch(base + p + '/comunicados.js');
      assert.equal(r.status, 200, p);
      assert.ok((await r.text()).includes('__vsComunicados'), p);
    }
  });

  // ======================= SUPORTE (chat de mão dupla) =======================
  const ckV1 = () => 'vsm_sess=' + jwt.sign({ uid: 'v1' }, SEGREDO);
  const ckV2 = () => 'vsm_sess=' + jwt.sign({ uid: 'v2' }, SEGREDO);
  let conv;
  await t('suporte: cliente abre conversa; a equipe é avisada; nome e e-mail vêm do sistema, não do cliente', async () => {
    const r = await req('POST', '/gestao/api/comunicados/suporte', { cookie: ckV1(), corpo: { assunto: 'Não consigo exportar', texto: 'O botão de exportar não faz nada.', nome: 'Forjado', email: 'forjado@x.com' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    conv = r.json.conversa;
    assert.equal(conv.nome, 'Vera Dona'); assert.equal(conv.email.toLowerCase(), 'ana@ex.com');
    assert.equal(conv.mensagens.length, 1);
    assert.ok(avisosStaff.some((a) => /Novo pedido de suporte/.test(a.title)), 'staff não recebeu push');
  });

  await t('suporte: outro usuário do MESMO sistema não lê nem responde a conversa (id não basta)', async () => {
    assert.equal((await req('GET', `/gestao/api/comunicados/suporte/${conv.id}`, { cookie: ckV2() })).status, 404);
    assert.equal((await req('POST', `/gestao/api/comunicados/suporte/${conv.id}`, { cookie: ckV2(), corpo: { texto: 'invasão' } })).status, 404);
    assert.equal((await req('GET', '/gestao/api/comunicados/suporte', { cookie: ckV2() })).json.conversas.length, 0);
  });

  await t('suporte: sessão de OUTRO sistema com o mesmo id não abre a conversa', async () => {
    // Mesmo uid "v1" assinado como cookie do CRM: a conversa é do VSM.
    const r = await req('GET', `/crm/api/comunicados/suporte/${conv.id}`, { cookie: 'crm_sess=' + jwt.sign({ uid: 'v1' }, SEGREDO) });
    assert.ok([401, 404].includes(r.status), 'status ' + r.status);
  });

  await t('suporte: sem sessão é 401; escrita de outra origem é recusada', async () => {
    assert.equal((await req('POST', '/gestao/api/comunicados/suporte', { corpo: { texto: 'oi' } })).status, 401);
    const r = await fetch(base + '/gestao/api/comunicados/suporte', { method: 'POST', headers: { 'content-type': 'application/json', cookie: ckV1(), origin: 'https://site-malicioso.example' }, body: JSON.stringify({ texto: 'oi' }) });
    assert.equal(r.status, 403);
  });

  await t('suporte: equipe responde → cliente vê a resposta, badge e e-mail', async () => {
    const antes = saidos.email.length;
    const r = await req('POST', `/staff/api/suporte-sistemas/${conv.id}/responder`, { quem: 'adm', corpo: { texto: 'Corrigimos, pode tentar de novo.' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.conversa.status, 'respondida');
    assert.equal(saidos.email.length, antes + 1);
    assert.ok(/respondemos a sua mensagem/.test(saidos.email[saidos.email.length - 1].assunto));
    const cx = (await req('GET', '/gestao/api/comunicados', { cookie: ckV1() })).json;
    assert.equal(cx.suporte_nao_lidas, 1);
    const aberta = (await req('GET', `/gestao/api/comunicados/suporte/${conv.id}`, { cookie: ckV1() })).json.conversa;
    assert.equal(aberta.mensagens[1].autor, 'staff');
    assert.equal((await req('GET', '/gestao/api/comunicados', { cookie: ckV1() })).json.suporte_nao_lidas, 0, 'abrir devia zerar');
  });

  await t('suporte: cliente escreve numa conversa resolvida e ela reabre', async () => {
    await req('POST', `/staff/api/suporte-sistemas/${conv.id}/status`, { quem: 'adm', corpo: { status: 'resolvida' } });
    const r = await req('POST', `/gestao/api/comunicados/suporte/${conv.id}`, { cookie: ckV1(), corpo: { texto: 'Voltou a dar erro.' } });
    assert.equal(r.json.conversa.status, 'aberta');
    assert.equal(com.suporte.resumoStaff().aguardando, 1);
  });

  await t('suporte: staff comum não acessa; texto vazio recusado; limite de conversas por dia', async () => {
    assert.equal((await req('GET', '/staff/api/suporte-sistemas', { quem: 'op' })).status, 403);
    assert.equal((await req('POST', '/gestao/api/comunicados/suporte', { cookie: ckV2(), corpo: { texto: '   ' } })).status, 400);
    for (let i = 0; i < 5; i++) await req('POST', '/gestao/api/comunicados/suporte', { cookie: ckV2(), corpo: { texto: 'msg ' + i } });
    assert.equal((await req('POST', '/gestao/api/comunicados/suporte', { cookie: ckV2(), corpo: { texto: 'sexta' } })).status, 429);
  });

  await t('suporte: resposta do staff chega ao celular onde o sistema tem push', async () => {
    const vsmDb = require('../vsm/db').db;
    vsmDb.prepare('INSERT INTO push_subs (endpoint, tenant_id, user_id, dados, criado_em) VALUES (?, ?, ?, ?, ?)')
      .run('https://push.example/v1', 't1', 'v1', JSON.stringify({ endpoint: 'https://push.example/v1', keys: {} }), agora);
    const r = await req('POST', `/staff/api/suporte-sistemas/${conv.id}/responder`, { quem: 'adm', corpo: { texto: 'Ok, ajustado.' } });
    assert.equal(r.json.conversa.avisos.push, true);
    assert.equal(await fontes.pushUsuario('vitrine', 'x', { title: 'x' }), 0, 'Vitrine não tem push: devia ser 0, sem erro');
  });

  // ======================= PREFERÊNCIAS =======================
  await t('preferências: o cliente escolhe "só importantes" e sai de novidades, fica em instabilidade', async () => {
    // Sessão nova da Ana (a anterior foi revogada no teste da Academy).
    acad.prepare('INSERT INTO sessions (id, user_id, criada_em, expira_em) VALUES (?, ?, ?, ?)').run('jti-a1b', 'a1', agora, new Date(Date.now() + 864e5).toISOString());
    const ckA = 'academy_sess=' + jwt.sign({ uid: 'a1', jti: 'jti-a1b' }, SEGREDO);
    const g = (await req('GET', '/academy/api/comunicados/preferencias', { cookie: ckA })).json.preferencias;
    assert.equal(g.email.valor, 'tudo'); assert.ok(!g.email.contato.includes('ana@'), 'e-mail devia vir mascarado');
    const s = await req('POST', '/academy/api/comunicados/preferencias', { cookie: ckA, corpo: { email: 'importantes' } });
    assert.equal(s.json.preferencias.email.valor, 'importantes');
    assert.equal((await motor.previa(rascunho())).canais.email.total, 0, 'novidade não devia ir para a Ana');
    // Instabilidade continua indo para ela (o Beto sai porque pediu "tudo" pelo link, num teste anterior).
    const inst = await motor.previa(rascunho({ categoria: 'instabilidade' }));
    assert.equal(inst.canais.email.total, 1); assert.ok(inst.canais.email.amostra[0].nome.startsWith('Ana'));
    await req('POST', '/academy/api/comunicados/preferencias', { cookie: ckA, corpo: { email: 'tudo' } });
    assert.equal((await motor.previa(rascunho())).canais.email.total, 1);
    assert.equal((await req('POST', '/academy/api/comunicados/preferencias', { cookie: ckA, corpo: { email: 'qualquer' } })).status, 400);
  });

  await t('descadastro em um clique (Gmail/Yahoo): POST com o token na query', async () => {
    const tok = motor.tokenDescadastro('vito@ex.com', 'email');
    const r = await fetch(base + '/comunicados/descadastro?t=' + encodeURIComponent(tok), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
    assert.equal(r.status, 200);
    assert.ok(motor.listarDescadastros().some((d) => d.contato === 'vito@ex.com' && d.escopo === 'tudo' && d.origem === 'um-clique'));
    motor.recadastrar('vito@ex.com', 'email');
  });

  // ======================= E-MAIL EM VOLUME (Resend) =======================
  await t('resend: com a chave, o comunicado sai pelo Resend com cabeçalho de descadastro', async () => {
    const fetchReal = global.fetch, chamadas = [];
    global.fetch = async (url, op) => {
      if (String(url).startsWith('https://api.resend.com')) { chamadas.push(JSON.parse(op.body)); return new Response('{"id":"x"}', { status: 200 }); }
      return fetchReal(url, op);
    };
    process.env.RESEND_API_KEY = 're_teste'; process.env.COMUNICADOS_EMAIL_FROM = 'Villela <avisos@villelastay.com.br>';
    try {
      assert.equal(motor.disponibilidade().email.provedor, 'resend');
      const antesGmail = saidos.email.length;
      const c = motor.criar(rascunho({ titulo: 'Via Resend', categoria: 'instabilidade', canais: ['email'], alvos: [{ produto: 'vsm', segmento: 'equipe' }] }), 'adm');
      await motor.disparar(c.id, { autor: 'adm' });
      await motor.processarLote();
      assert.equal(chamadas.length, 1, 'não chamou o Resend');
      assert.equal(saidos.email.length, antesGmail, 'não devia sair pelo Gmail');
      assert.ok(/comunicados\/descadastro\?t=/.test(chamadas[0].headers['List-Unsubscribe']));
      assert.equal(chamadas[0].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    } finally {
      global.fetch = fetchReal; delete process.env.RESEND_API_KEY; delete process.env.COMUNICADOS_EMAIL_FROM;
    }
    assert.equal(motor.disponibilidade().email.provedor, 'gmail', 'sem a chave volta ao Gmail');
  });

  await t('push de comunicado: aviso no app do Stay Manager passa pela fila (celular) e fica disponível', async () => {
    const c = motor.criar(rascunho({ titulo: 'Push VSM', categoria: 'novidade', canais: ['app'], alvos: [{ produto: 'vsm', segmento: 'donos' }] }), 'adm');
    await motor.disparar(c.id, { autor: 'adm' });
    assert.equal(db.prepare("SELECT status FROM entregas WHERE comunicado_id = ?").get(c.id).status, 'pendente');
    await motor.processarLote();
    assert.equal(db.prepare("SELECT status FROM entregas WHERE comunicado_id = ?").get(c.id).status, 'disponivel');
    assert.equal(motor.obter(c.id).status, 'enviado');
  });

  await t('staff: rascunho enviado não se edita; excluir só rascunho', async () => {
    assert.equal((await req('PUT', `/staff/api/comunicados/${id1}`, { quem: 'adm', corpo: { titulo: 'x' } })).status, 409);
    assert.equal((await req('DELETE', `/staff/api/comunicados/${id1}`, { quem: 'adm' })).status, 409);
    assert.equal((await req('DELETE', `/staff/api/comunicados/${idChave}`, { quem: 'adm' })).status, 200);
  });

  srv.close();
  com.desligarFila();
  console.log(`\n${ok} ok, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach((f) => console.log(` - ${f.nome}: ${f.erro}`)); process.exit(1); }
  process.exit(0);
})();
