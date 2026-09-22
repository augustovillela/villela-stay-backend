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
com.montar(app, { express, requireAuth, requireAdmin, requirePublishOrAdmin, enviarEmail, enviarWhatsAppTemplate, jwtSecret: SEGREDO, registrarAuditoria: () => {} });
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
