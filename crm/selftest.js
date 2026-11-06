// =====================================================================
// Villela CRM — suíte de testes. Roda o Express real com auth de teste
// injetada, banco descartável e MP mockado. npm run test:crm
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'crm-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
process.env.CRM_ROTINAS = 'off';
// o teste de MFA usa o cofre do Growth OS (o segredo TOTP é credencial)
process.env.GROWTH_SECRET_KEY = process.env.GROWTH_SECRET_KEY || require('crypto').randomBytes(32).toString('hex');
process.env.GROWTH_WORKER = 'off';
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const USUARIOS = [
  { id: 'adm', nome: 'Admin', email: 'adm@t', papel: 'admin', areas: ['*'], ativo: true },
  { id: 'op', nome: 'Operador', email: 'op@t', papel: 'membro', areas: ['ti'], ativo: true },
];
function requireAuth(req, res, next) { const u = USUARIOS.find(x => x.id === (req.headers['x-test-user'] || 'adm')); if (!u) return res.status(401).json({ erro: 'x' }); req.user = u; next(); }
const requireAdmin = (req, res, next) => (req.user && req.user.papel === 'admin') ? next() : res.status(403).json({ erro: 'admin' });
const enviados = [];
const enviarEmail = async (to, ass, html) => { enviados.push({ to, ass, html }); return true; };
const alertas = [];
const alertaAugusto = async (m) => { alertas.push(m); };

// MP mock
const mpCorpos = []; // corpos dos POST /preapproval (plano anual: frequency e valor)
const mpPrefs = []; // corpos dos POST /checkout/preferences (recarga de créditos)
let _payResp = {}; // resposta de /v1/payments/* controlada por teste (idempotência)
const mpFetch = async (p, opts) => {
  if (p === '/preapproval' && opts && opts.method === 'POST') mpCorpos.push(JSON.parse(opts.body)); if (p === '/preapproval' && opts && opts.method === 'POST') return { id: 'PRE777', init_point: 'https://mp/PRE777', status: 'pending', external_reference: 'crm' };
  if (p === '/checkout/preferences') { mpPrefs.push(JSON.parse(opts.body)); return { id: 'PREF-' + mpPrefs.length, init_point: 'https://mp/pref' }; } // recarga de créditos
  if (p.startsWith('/preapproval/')) return { id: 'PRE777', status: 'authorized' };
  if (p.startsWith('/v1/payments/')) return _payResp;
  return {};
};
mpFetch.__mock = true;

const app = express();
app.use(express.json({ limit: '5mb', verify: (req, res, buf) => { if (req.url.startsWith('/crm/webhook/whatsapp/')) req.rawBody = buf; } })); // igual ao server.js
app.use(cookieParser());
const saas = require('./index');
// mesma regra do server.js: x-publish-key OU sessão; podeCRM = chave ou admin/vendas
const requirePublishOrSession = (req, res, next) => { if (req.headers['x-publish-key'] === 'k-teste') { req.viaChave = true; return next(); } return requireAuth(req, res, next); };
const podeCRM = (req, res, next) => (req.viaChave || (req.user && req.user.papel === 'admin')) ? next() : res.status(403).json({ erro: 'Sem acesso ao CRM (área vendas).' });
saas.montar(app, { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto, mpFetch, jwtSecret: 'seg-teste', requirePublishOrSession, podeCRM });

let BASE = '', ok = 0, falhas = [];
const jar = {};
async function req(m, p, { corpo, user = 'adm', cookies, headers: hx } = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-test-user': user, ...(hx || {}) };
  if (cookies) headers.Cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const r = await fetch(BASE + p, { method: m, headers, body: corpo ? JSON.stringify(corpo) : undefined, redirect: 'manual' });
  (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach(c => { const [kv] = c.split(';'); const [k, v] = kv.split('='); jar[k] = v; });
  const texto = await r.text(); let json = null; try { json = JSON.parse(texto); } catch (_) {}
  return { st: r.status, json, texto, ct: r.headers.get('content-type') || '' };
}
async function t(nome, fn) { try { await fn(); ok++; console.log('  ✅', nome); } catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌', nome, '—', e.message); } }

async function rodar() {
  const srv = app.listen(0); BASE = 'http://127.0.0.1:' + srv.address().port;
  console.log('Villela CRM — selftest\n');

  await t('plano anual: semente = 10x o mensal nos planos pagos; trial e sem preco ficam 0', async () => {
    const planos = saas.repo.Planos.listar({ incluirInativos: true });
    const pagos = planos.filter(p => p.preco_centavos > 0);
    assert.ok(pagos.length >= 3, 'esperava >= 3 planos pagos');
    for (const p of pagos) assert.equal(p.preco_anual_centavos, p.preco_centavos * 10, p.slug + ': anual deve ser 10x o mensal');
    for (const p of planos.filter(p => p.preco_centavos === 0)) assert.equal(p.preco_anual_centavos, 0, p.slug + ': sem preco mensal => sem anual');
  });
  await t('F5 mantém a tela: rota no endereço (#tela e #contatos/id), padrão e conta bloqueada', async () => {
    // O bloco entre <rota> e </rota> do app é código puro: roda aqui no mesmo arquivo que o navegador recebe.
    const src = fs.readFileSync(path.join(__dirname, 'app-cliente.js'), 'utf8');
    const bloco = src.slice(src.indexOf('// <rota>'), src.indexOf('// </rota>'));
    assert.ok(bloco.includes('function rotaDoHash') && bloco.includes('function resolverRota'), 'bloco de rota ausente');
    const vm = require('vm'); const ctx = {}; vm.createContext(ctx);
    vm.runInContext(bloco + ';this.rotaDoHash = rotaDoHash; this.hashDaRota = hashDaRota; this.resolverRota = resolverRota;', ctx);
    const J = (x) => JSON.stringify(x);
    // hash -> tela
    assert.equal(J(ctx.rotaDoHash('#contatos')), J({ tela: 'contatos', id: '' }));
    assert.equal(J(ctx.rotaDoHash('#contatos/abc123')), J({ tela: 'contatos', id: 'abc123' }));
    assert.equal(J(ctx.rotaDoHash('#/kanban')), J({ tela: 'kanban', id: '' }), 'aceita #/tela');
    assert.equal(J(ctx.rotaDoHash('#gx_inbox')), J({ tela: 'gx_inbox', id: '' }), 'abas do Growth entram no mesmo mapa');
    for (const ruim of ['', '#', '#/', null, undefined, '#<script>', '#contatos/%E0%A4%A', '#a b', '#contatos/x y']) {
      assert.equal(ctx.rotaDoHash(ruim), null, 'deve ignorar ' + ruim);
    }
    // tela -> hash (ida e volta)
    assert.equal(ctx.hashDaRota('contatos', ''), '#contatos');
    assert.equal(ctx.hashDaRota('contatos', 'abc123'), '#contatos/abc123');
    assert.equal(J(ctx.rotaDoHash(ctx.hashDaRota('contatos', 'a:b-c.d'))), J({ tela: 'contatos', id: 'a:b-c.d' }));
    // abertura: válido, sem permissão, inválido, bloqueado
    const permitidas = ['dash', 'kanban', 'contatos', 'conta', 'gx_inbox'];
    const ok = { bloqueado: false, permitidas };
    assert.equal(J(ctx.resolverRota(ctx.rotaDoHash('#kanban'), ok)), J({ tela: 'kanban', id: '' }));
    assert.equal(J(ctx.resolverRota(ctx.rotaDoHash('#contatos/77'), ok)), J({ tela: 'contatos', id: '77' }));
    assert.equal(J(ctx.resolverRota(ctx.rotaDoHash('#kanban/77'), ok)), J({ tela: 'kanban', id: '' }), 'só contato leva id');
    assert.equal(J(ctx.resolverRota(ctx.rotaDoHash('#campanhas'), ok)), J({ tela: 'dash', id: '' }), 'sem permissão cai no dashboard');
    assert.equal(J(ctx.resolverRota(ctx.rotaDoHash('#nao-existe'), ok)), J({ tela: 'dash', id: '' }));
    assert.equal(J(ctx.resolverRota(null, ok)), J({ tela: 'dash', id: '' }), 'sem hash: dashboard como antes');
    assert.equal(J(ctx.resolverRota(ctx.rotaDoHash('#kanban'), { bloqueado: true, permitidas })), J({ tela: 'conta', id: '' }), 'conta bloqueada vai para Conta');
    assert.equal(J(ctx.resolverRota(null, { bloqueado: true, permitidas })), J({ tela: 'conta', id: '' }));
    // o app realmente usa a rota: boot, navegação, popstate e item aberto
    assert.ok(/resolverRota\(rotaDoHash\(location\.hash\)/.test(src), 'o boot precisa ler o endereço');
    assert.ok(/marcarRota\(ABA, ''\)/.test(src), 'navegar precisa gravar o endereço');
    assert.ok(/addEventListener\('popstate'/.test(src), 'Voltar/Avançar precisam funcionar');
    assert.ok(/async function abrirContato\(id\) \{\s*marcarRota\('contatos', id\)/.test(src), 'contato aberto vai para o endereço');
    assert.ok(!/ABA = bloq \? 'conta' : 'dash'/.test(src), 'a tela inicial não pode mais ser fixa');
    // todas as abas do menu base existem no mapa de telas (senão o hash cairia no dashboard)
    for (const id of ['dash', 'kanban', 'contatos', 'propostas', 'buscas', 'tarefas', 'templates', 'conversas', 'campanhas', 'ia', 'conta']) {
      assert.ok(new RegExp("\\b" + id + ": v[A-Z]").test(src), 'tela ' + id + ' fora do mapa');
    }
  });
  await t('landing pública renderiza com planos e marca', async () => {
    const r = await req('GET', '/crm');
    // Nomes comerciais decididos pelo Augusto em 05/08/2026: os planos de
    // entrada levam a marca "Villela CRM" e os completos, "Villela Growth".
    assert.ok(r.texto.includes('Villela CRM — Profissional'), 'landing sem o plano Villela CRM — Profissional');
    assert.ok(r.texto.includes('Villela Growth — Completo'), 'landing sem o plano Villela Growth — Completo');
    assert.ok(r.texto.includes('Testar 15 dias'), 'landing sem o CTA do teste');
  });
  await t('dashboard da plataforma só admin (operador → 403)', async () => {
    assert.equal((await req('GET', '/staff/api/vcrm/dashboard', { user: 'op' })).st, 403);
    assert.equal((await req('GET', '/staff/api/vcrm/dashboard')).st, 200);
  });

  // ---- control plane ----
  let tid;
  await t('criar empresa (tenant) provisiona 5 funis + templates', async () => {
    const r = await req('POST', '/staff/api/vcrm/tenants', { corpo: { nome: 'Imobiliária Alfa', email: 'alfa@emp.br', plano: 'professional' } });
    assert.equal(r.st, 200); tid = r.json.tenant.id;
    assert.equal(r.json.tenant.status, 'trial');
    const funis = saas.appRepo.Funis.listar(tid);
    assert.equal(funis.length, 5);
    assert.ok(funis.find(f => f.slug === 'hospedagem').estagios.length >= 10);
    assert.ok(saas.appRepo.Templates.listar(tid).length >= 5);
  });
  await t('entitlements: professional libera campanhas mas não IA', async () => {
    const e = (await req('GET', '/staff/api/vcrm/tenants/' + tid)).json.tenant.entitlements;
    assert.ok(e.modulos.includes('campanhas') && !e.modulos.includes('ia'));
    assert.equal(e.flags.automacoes, true); assert.equal(e.flags.ia, false);
  });
  await t('override negociado sobrepõe limite e flag', async () => {
    await req('POST', `/staff/api/vcrm/tenants/${tid}/settings`, { corpo: { limites_over: { contatos: 99999 }, flags_over: { ia: true }, modulos_extra: ['ia'] } });
    const e = (await req('GET', '/staff/api/vcrm/tenants/' + tid)).json.tenant.entitlements;
    assert.equal(e.limites.contatos, 99999); assert.equal(e.flags.ia, true); assert.ok(e.modulos.includes('ia'));
  });

  // ---- signup + login do assinante ----
  let linkSetup;
  await t('signup público cria empresa trial + link de senha + e-mail', async () => {
    const r = await req('POST', '/crm/api/signup', { corpo: { nome: 'Pousada Beta', nome_responsavel: 'Bia Dona', email: 'bia@beta.br', plano: 'trial' } });
    assert.equal(r.st, 200); assert.ok(r.json.link_setup); linkSetup = r.json.link_setup;
    assert.ok(enviados.some(e => e.to === 'bia@beta.br'));
  });
  await t('signup duplicado no mesmo e-mail → 400', async () => {
    assert.equal((await req('POST', '/crm/api/signup', { corpo: { nome: 'X', email: 'bia@beta.br' } })).st, 400);
  });
  await t('owner define senha, loga e vê entitlements', async () => {
    const token = new URL(linkSetup).searchParams.get('token');
    assert.equal((await req('POST', '/crm/api/definir-senha', { corpo: { token, senha: 'SenhaForte1' } })).st, 200);
    assert.equal((await req('POST', '/crm/api/login', { corpo: { email: 'bia@beta.br', senha: 'SenhaForte1' }, cookies: true })).st, 200);
    const me = await req('GET', '/crm/api/me', { cookies: true });
    assert.equal(me.st, 200); assert.equal(me.json.usuario.papel, 'owner');
    assert.ok(me.json.entitlements.modulos.includes('contatos'));
  });

  // ---- esqueci / redefinir / trocar senha ----
  const tokenDoEmail = () => { const e = enviados.filter(x => x.ass.includes('redefinir')).pop(); const m = e && /token=([^"&\s<]+)/.exec(e.html); return m && m[1]; };
  await t('esqueci-senha: e-mail desconhecido responde igual e não envia nada', async () => {
    const antes = enviados.length;
    const conhecido = await req('POST', '/crm/api/esqueci-senha', { corpo: { email: 'ninguem@nada.br' } });
    assert.equal(conhecido.st, 200); assert.equal(conhecido.json.ok, true);
    assert.equal(enviados.length, antes, 'enviou e-mail para conta inexistente');
  });
  let linkReset;
  await t('esqueci-senha: conta existente recebe link e a resposta é a mesma', async () => {
    const desconhecido = await req('POST', '/crm/api/esqueci-senha', { corpo: { email: 'ninguem@nada.br' } });
    const r = await req('POST', '/crm/api/esqueci-senha', { corpo: { email: 'BIA@beta.br' } });
    assert.equal(r.st, 200); assert.deepEqual(r.json, desconhecido.json, 'resposta revela se a conta existe');
    linkReset = tokenDoEmail(); assert.ok(linkReset, 'não saiu e-mail com link');
  });
  await t('redefinir-senha: senha curta recusada; link troca a senha; reuso do link falha', async () => {
    assert.equal((await req('POST', '/crm/api/redefinir-senha', { corpo: { token: linkReset, senha: 'curta' } })).st, 400);
    assert.equal((await req('POST', '/crm/api/redefinir-senha', { corpo: { token: linkReset, senha: 'ResetNova9x' } })).st, 200);
    assert.equal((await req('POST', '/crm/api/redefinir-senha', { corpo: { token: linkReset, senha: 'OutraSenha9' } })).st, 400, 'link foi usado duas vezes');
    assert.equal((await req('POST', '/crm/api/login', { corpo: { email: 'bia@beta.br', senha: 'SenhaForte1' } })).st, 401, 'senha antiga ainda entra');
    assert.equal((await req('POST', '/crm/api/login', { corpo: { email: 'bia@beta.br', senha: 'ResetNova9x' }, cookies: true })).st, 200);
  });
  await t('redefinir-senha: token de outro tipo (definir-senha) é recusado', async () => {
    const setup = new URL(linkSetup).searchParams.get('token');
    assert.equal((await req('POST', '/crm/api/redefinir-senha', { corpo: { token: setup, senha: 'QualquerUma9' } })).st, 400);
  });
  await t('trocar-senha: exige login, senha atual certa e nova diferente', async () => {
    assert.equal((await req('POST', '/crm/api/trocar-senha', { corpo: { senha_atual: 'ResetNova9x', nova_senha: 'SenhaForte1' } })).st, 401, 'trocou sem sessão');
    const errada = await req('POST', '/crm/api/trocar-senha', { cookies: true, corpo: { senha_atual: 'errada', nova_senha: 'SenhaForte1' } });
    assert.equal(errada.st, 400, 'senha atual errada não pode virar 401 (o painel acharia que a sessão expirou)');
    assert.equal((await req('POST', '/crm/api/trocar-senha', { cookies: true, corpo: { senha_atual: 'ResetNova9x', nova_senha: 'curta' } })).st, 400);
    assert.equal((await req('POST', '/crm/api/trocar-senha', { cookies: true, corpo: { senha_atual: 'ResetNova9x', nova_senha: 'ResetNova9x' } })).st, 400);
  });
  await t('trocar-senha: troca, mantém esta sessão e derruba a outra', async () => {
    const cookieAntigo = 'crm_sess=' + jar.crm_sess;
    assert.equal((await req('POST', '/crm/api/trocar-senha', { cookies: true, corpo: { senha_atual: 'ResetNova9x', nova_senha: 'SenhaForte1' } })).st, 200);
    assert.equal((await req('GET', '/crm/api/me', { cookies: true })).st, 200, 'a sessão de quem trocou caiu');
    assert.equal((await req('GET', '/crm/api/me', { headers: { Cookie: cookieAntigo } })).st, 401, 'sessão aberta com a senha antiga continua valendo');
    assert.equal((await req('POST', '/crm/api/login', { corpo: { email: 'bia@beta.br', senha: 'SenhaForte1' }, cookies: true })).st, 200);
  });
  await t('páginas: login tem "Esqueci minha senha"; /crm/redefinir-senha existe', async () => {
    assert.ok((await req('GET', '/crm/app.js')).texto.includes('Esqueci minha senha'));
    assert.equal((await req('GET', '/crm/redefinir-senha?token=x')).st, 200);
  });

  // ---- contatos: criação, procedência, dedupe, scoring ----
  let leadId;
  await t('cria lead com origem/UTM/consentimento; score calculado', async () => {
    const r = await req('POST', '/crm/api/app/contatos', { corpo: {
      nome: 'João Comprador', telefone: '(61) 98888-7777', email: 'joao@x.br', tipo: 'lead-hospedagem',
      origem: 'google-ads', campanha: 'reveillon-2027', utm: { source: 'google', medium: 'cpc', campaign: 'reveillon' },
      pagina_entrada: '/casas/villa-k', produto_interesse: 'Villa Kubitschek', ticket_centavos: 800000,
      primeira_mensagem: 'Quero réveillon para 12 pessoas',
      consentimento: { optIn: true, base: 'formulario-site', em: '2026-07-09' },
    }, cookies: true });
    assert.equal(r.st, 200); leadId = r.json.contato.id;
    assert.equal(r.json.existente, false);
    assert.equal(r.json.contato.telefone, '5561988887777'); // normalizado E.164
    assert.ok(r.json.contato.score > 0);
    assert.equal(r.json.contato.utm.medium, 'cpc');
  });
  await t('dedupe por telefone mescla em vez de duplicar', async () => {
    const r = await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'João Comprador', telefone: '61988887777', cidade: 'Brasília' }, cookies: true });
    assert.equal(r.json.existente, true);
    assert.equal(r.json.contato.id, leadId);
    assert.equal(r.json.contato.cidade, 'Brasília'); // merge de campo vazio
  });
  await t('atividade recebida sobe o score (respondeu)', async () => {
    const antes = (await req('GET', '/crm/api/app/contatos/' + leadId, { cookies: true })).json.contato.score;
    await req('POST', `/crm/api/app/contatos/${leadId}/atividade`, { corpo: { tipo: 'mensagem-recebida', canal: 'whatsapp', texto: 'Oi! Pode ser sim.' }, cookies: true });
    const depois = (await req('GET', '/crm/api/app/contatos/' + leadId, { cookies: true })).json.contato.score;
    assert.ok(depois > antes, `score ${depois} > ${antes}`);
  });

  // ---- kanban / oportunidades ----
  let funilHosp, oportId;
  await t('kanban do funil de hospedagem com colunas', async () => {
    const { json } = await req('GET', '/crm/api/app/funis', { cookies: true });
    funilHosp = json.funis.find(f => f.slug === 'hospedagem');
    const k = await req('GET', '/crm/api/app/kanban?funil_id=' + funilHosp.id, { cookies: true });
    assert.equal(k.st, 200); assert.ok(k.json.colunas.length >= 10);
  });
  await t('cria oportunidade e move até GANHA (contato vira recorrente)', async () => {
    const r = await req('POST', '/crm/api/app/oportunidades', { corpo: { contato_id: leadId, funil_id: funilHosp.id, titulo: 'Réveillon Villa K', valor_centavos: 800000, previsao: '2026-12-28' }, cookies: true });
    assert.equal(r.st, 200); oportId = r.json.oportunidade.id;
    const ganho = funilHosp.estagios.find(e => e.tipo === 'ganho');
    const mv = await req('POST', `/crm/api/app/oportunidades/${oportId}/mover`, { corpo: { estagio_id: ganho.id }, cookies: true });
    assert.equal(mv.json.oportunidade.status, 'ganha');
    const c = (await req('GET', '/crm/api/app/contatos/' + leadId, { cookies: true })).json.contato;
    assert.equal(c.tipo, 'cliente-recorrente');
    assert.ok(c.atividades.some(a => a.tipo === 'ganho'));
  });
  await t('mover para estágio de outro funil → 400', async () => {
    const { json } = await req('GET', '/crm/api/app/funis', { cookies: true });
    const outro = json.funis.find(f => f.slug === 'saas').estagios[0];
    assert.equal((await req('POST', `/crm/api/app/oportunidades/${oportId}/mover`, { corpo: { estagio_id: outro.id }, cookies: true })).st, 400);
  });

  // ---- tarefas + automações ----
  await t('caixa de trabalho lista tarefa que vence hoje', async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    await req('POST', '/crm/api/app/tarefas', { corpo: { contato_id: leadId, titulo: 'Ligar para João', vence_em: hoje }, cookies: true });
    const cx = await req('GET', '/crm/api/app/tarefas/caixa', { cookies: true });
    assert.ok(cx.json.hoje.some(x => x.titulo === 'Ligar para João'));
  });
  await t('automações: proposta parada gera follow-up; validade vencida → vencida', async () => {
    // proposta enviada com enviada_em no passado + validade vencida
    const pr = await req('POST', '/crm/api/app/propostas', { corpo: { contato_id: leadId, titulo: 'Proposta velha', itens: [{ descricao: 'x', qtd: 1, valor_centavos: 100000 }], validade: '2026-01-01' }, cookies: true });
    await req('POST', `/crm/api/app/propostas/${pr.json.proposta.id}/enviar`, { cookies: true });
    require('./db').db.prepare("UPDATE crm_propostas SET enviada_em = '2026-07-01T00:00:00Z' WHERE id = ?").run(pr.json.proposta.id);
    const r = await req('POST', '/crm/api/app/automacoes/rodar', { cookies: true });
    assert.ok(r.json.tarefas_criadas >= 1);
    assert.ok(r.json.propostas_vencidas >= 1);
    const p2 = (await req('GET', '/crm/api/app/propostas', { cookies: true })).json.propostas.find(p => p.id === pr.json.proposta.id);
    assert.equal(p2.status, 'vencida');
  });

  // ---- templates ----
  await t('template renderiza variáveis do contato', async () => {
    const { json } = await req('GET', '/crm/api/app/templates', { cookies: true });
    const tpl = json.templates.find(x => x.categoria === 'primeira-resposta');
    const r = await req('POST', `/crm/api/app/templates/${tpl.id}/render`, { corpo: { contato_id: leadId, extras: { nome_responsavel: 'Bia', nome_empresa: 'Pousada Beta' } }, cookies: true });
    assert.ok(r.json.corpo.includes('João') && r.json.corpo.includes('Bia'));
    assert.ok(!r.json.corpo.includes('{{nome}}'));
  });

  // ---- propostas: link público + aceite ----
  await t('proposta pública: visualizar muda status; aceite registra', async () => {
    const pr = await req('POST', '/crm/api/app/propostas', { corpo: { contato_id: leadId, titulo: 'Réveillon 4 noites', itens: [{ descricao: '4 noites', qtd: 1, valor_centavos: 800000 }], condicoes: 'Sinal 50%' }, cookies: true });
    const env = await req('POST', `/crm/api/app/propostas/${pr.json.proposta.id}/enviar`, { cookies: true });
    const token = env.json.proposta.token;
    assert.ok(token);
    const pub = await req('GET', '/crm/api/p/' + token); // sem sessão
    assert.equal(pub.st, 200); assert.equal(pub.json.proposta.status, 'visualizada');
    assert.ok(!JSON.stringify(pub.json).includes('tenant_id')); // não vaza internals
    const ac = await req('POST', `/crm/api/p/${token}/responder`, { corpo: { aceite: true } });
    assert.equal(ac.json.status, 'aceita');
    const pg = await req('GET', '/crm/p/' + token);
    assert.ok(pg.texto.includes('Proposta'));
  });

  // ---- campanhas + segmentação + opt-out ----
  await t('campanha segmentada gera alvos e respeita opt-out', async () => {
    await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'Optout Cara', telefone: '61977776666', tipo: 'hospede', consentimento: { optIn: false } }, cookies: true });
    await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'Hospede Bom', telefone: '61966665555', tipo: 'hospede', consentimento: { optIn: true } }, cookies: true });
    const r = await req('POST', '/crm/api/app/campanhas', { corpo: { nome: 'Reativação julho', tipo: 'whatsapp', segmento: { tipo: 'hospede' }, mensagem: 'Oi {{nome}}!' }, cookies: true });
    assert.equal(r.st, 200); assert.equal(r.json.alvos, 1); // só o opt-in
    const alvos = await req('GET', `/crm/api/app/campanhas/${r.json.id}/alvos`, { cookies: true });
    assert.equal(alvos.json.alvos[0].nome, 'Hospede Bom');
    await req('POST', `/crm/api/app/campanha-alvos/${alvos.json.alvos[0].id}`, { corpo: { status: 'enviado' }, cookies: true });
    const c2 = (await req('GET', `/crm/api/app/campanhas`, { cookies: true })).json.campanhas.find(x => x.id === r.json.id);
    assert.equal(c2.enviados, 1);
  });

  // ---- multicanal: canais do contato, campanha com N canais, importação, unificação ----
  await t('contato guarda vários canais, normaliza e dedupe por perfil', async () => {
    const a = await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'Marina Souza', telefone: '61 98888-1111', email: 'Marina@X.com', instagram: 'https://instagram.com/Marina.S/', linkedin: 'https://br.linkedin.com/in/marina-souza?x=1', tiktok: '@marina.tt' }, cookies: true });
    assert.equal(a.st, 200);
    const f = (await req('GET', '/crm/api/app/contatos/' + a.json.contato.id, { cookies: true })).json.contato;
    const mapa = Object.fromEntries(f.canais.map(k => [k.canal, k.identificador]));
    assert.equal(mapa.whatsapp, '5561988881111'); assert.equal(mapa.email, 'marina@x.com');
    assert.equal(mapa.instagram, 'marina.s'); assert.equal(mapa.linkedin, 'marina-souza'); assert.equal(mapa.tiktok, 'marina.tt');
    // mesma pessoa chegando só pelo @instagram → mescla, não duplica; e ganha o facebook
    const b = await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'Marina', instagram: '@marina.s', facebook: 'facebook.com/marina.souza' }, cookies: true });
    assert.equal(b.json.existente, true); assert.equal(b.json.contato.id, a.json.contato.id);
    const f2 = (await req('GET', '/crm/api/app/contatos/' + a.json.contato.id, { cookies: true })).json.contato;
    assert.ok(f2.canais.some(k => k.canal === 'facebook' && k.identificador === 'marina.souza'));
    // perfil de outro contato não é roubado
    const c = await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'Outra Pessoa', telefone: '61955550000' }, cookies: true });
    const r = await req('POST', `/crm/api/app/contatos/${c.json.contato.id}/canais`, { corpo: { canal: 'instagram', identificador: 'marina.s' }, cookies: true });
    assert.equal(r.st, 400);
    const ruim = await req('POST', `/crm/api/app/contatos/${c.json.contato.id}/canais`, { corpo: { canal: 'email', identificador: 'nao-e-email' }, cookies: true });
    assert.equal(ruim.st, 400);
  });
  await t('campanha multicanal: melhor canal × todos, opt-out por canal', async () => {
    const tidBeta = require('./db').db.prepare("SELECT id FROM tenants WHERE nome LIKE 'Pousada Beta%'").get().id; // tenant do cookie
    saas.repo.salvarSettings(tidBeta, { limites_over: { campanhas_mes: 999 } }); // este teste cria várias campanhas
    const mk = (nome, extra) => req('POST', '/crm/api/app/contatos', { corpo: { nome, tags: ['mc'], ...extra }, cookies: true });
    const A = await mk('MC Alfa', { telefone: '61911110001', email: 'alfa@mc.com', instagram: 'mc_alfa' });
    await mk('MC Beta', { email: 'beta@mc.com' });
    await mk('MC Gama', { linkedin: 'mc-gama' });
    await mk('MC Delta', { obs: 'sem canal nenhum' });
    // 'melhor': ordem instagram > whatsapp > email; Delta e Gama(sem esses canais) ficam de fora
    const m = await req('POST', '/crm/api/app/campanhas', { corpo: { nome: 'MC melhor', canais: ['instagram', 'whatsapp', 'email'], modo: 'melhor', segmento: { tag: 'mc' }, mensagem: 'Oi {{nome}}' }, cookies: true });
    assert.equal(m.st, 200); assert.equal(m.json.alvos, 2); assert.equal(m.json.sem_canal, 2);
    assert.deepEqual(m.json.por_canal, { instagram: 1, email: 1 });
    const al = (await req('GET', `/crm/api/app/campanhas/${m.json.id}/alvos`, { cookies: true })).json.alvos;
    const alfa = al.find(x => x.nome === 'MC Alfa');
    assert.equal(alfa.canal, 'instagram'); assert.equal(alfa.assistido, true); assert.ok(alfa.link_base.includes('ig.me/m/mc_alfa'));
    // 'todos': Alfa entra em 3 canais
    const todos = await req('POST', '/crm/api/app/campanhas', { corpo: { nome: 'MC todos', canais: ['instagram', 'whatsapp', 'email', 'linkedin'], modo: 'todos', segmento: { tag: 'mc' } }, cookies: true });
    assert.equal(todos.json.alvos, 3 + 1 + 1 /* alfa(3) beta(email) gama(linkedin) */); assert.equal(todos.json.contatos, 3);
    // opt-out do canal instagram do Alfa: some do instagram, continua no WhatsApp
    const fAlfa = (await req('GET', '/crm/api/app/contatos/' + A.json.contato.id, { cookies: true })).json.contato;
    const ig = fAlfa.canais.find(k => k.canal === 'instagram');
    assert.equal((await req('POST', `/crm/api/app/contatos/${A.json.contato.id}/canais/${ig.id}/optout`, { corpo: { sair: true }, cookies: true })).json.ok, true);
    const m2 = await req('POST', '/crm/api/app/campanhas', { corpo: { nome: 'MC pós opt-out', canais: ['instagram', 'whatsapp'], modo: 'melhor', segmento: { tag: 'mc' } }, cookies: true });
    const al2 = (await req('GET', `/crm/api/app/campanhas/${m2.json.id}/alvos`, { cookies: true })).json.alvos;
    assert.equal(al2.length, 1); assert.equal(al2[0].canal, 'whatsapp');
    // marcar enviado registra a atividade no canal certo
    await req('POST', `/crm/api/app/campanha-alvos/${al[0].id}`, { corpo: { status: 'enviado' }, cookies: true });
    // canal inexistente na lista é ignorado; sem nenhum canal válido e tipo antigo continua funcionando
    const velha = await req('POST', '/crm/api/app/campanhas', { corpo: { nome: 'MC ligações', tipo: 'ligacao', segmento: { tag: 'mc' } }, cookies: true });
    assert.equal(velha.st, 200); assert.equal(velha.json.alvos, 4);
    const nada = await req('POST', '/crm/api/app/campanhas', { corpo: { nome: 'MC tiktok', canais: ['tiktok'], segmento: { tag: 'mc' } }, cookies: true });
    assert.equal(nada.st, 400);
    saas.repo.salvarSettings(tidBeta, { limites_over: {} });
  });
  await t('importação: CSV do LinkedIn/Google e lista de perfis do Instagram', async () => {
    const li = 'Notes:\n"aviso do linkedin"\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\nJoão,Silva,https://www.linkedin.com/in/joao-silva,,ACME,Diretor,01 Jan 2024\n';
    const r1 = await req('POST', '/crm/api/app/contatos/importar', { corpo: { csv: li }, cookies: true });
    assert.equal(r1.json.criados, 1);
    const jo = (await req('GET', '/crm/api/app/contatos?busca=Silva', { cookies: true })).json.contatos.find(x => x.nome === 'João');
    const fj = (await req('GET', '/crm/api/app/contatos/' + jo.id, { cookies: true })).json.contato;
    assert.ok(fj.canais.some(k => k.canal === 'linkedin' && k.identificador === 'joao-silva')); assert.equal(fj.cargo, 'Diretor');
    const ig = JSON.stringify([{ title: '', string_list_data: [{ value: 'ana_ig', href: 'https://www.instagram.com/ana_ig' }] }, { string_list_data: [{ value: 'bia.ig' }] }]);
    const r2 = await req('POST', '/crm/api/app/contatos/importar-rede', { corpo: { canal: 'instagram', texto: ig }, cookies: true });
    assert.equal(r2.json.criados, 2);
    const r3 = await req('POST', '/crm/api/app/contatos/importar-rede', { corpo: { canal: 'instagram', texto: '@ana_ig\nCarla Dias;https://instagram.com/carla.d\nlixo !!' }, cookies: true });
    assert.equal(r3.json.criados, 1); assert.equal(r3.json.duplicados, 1);
    assert.equal((await req('POST', '/crm/api/app/contatos/importar-rede', { corpo: { canal: 'orkut', texto: 'x' }, cookies: true })).st, 400);
  });
  await t('unificação: sugere duplicados e mescla levando canais e histórico', async () => {
    const x = await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'Paulo', sobrenome: 'Duplicado', telefone: '61933330001' }, cookies: true });
    const y = await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'Paulo', sobrenome: 'Duplicado', instagram: 'paulo.dup' }, cookies: true });
    assert.notEqual(x.json.contato.id, y.json.contato.id);
    const dup = (await req('GET', '/crm/api/app/contatos-duplicados', { cookies: true })).json.grupos;
    assert.ok(dup.some(g => g.length === 2 && g.every(r => r.nome === 'Paulo Duplicado')));
    await req('POST', `/crm/api/app/contatos/${y.json.contato.id}/atividade`, { corpo: { tipo: 'nota', texto: 'nota do duplicado' }, cookies: true });
    const m = await req('POST', `/crm/api/app/contatos/${x.json.contato.id}/mesclar`, { corpo: { com: y.json.contato.id }, cookies: true });
    assert.equal(m.st, 200, JSON.stringify(m.json));
    const f = (await req('GET', '/crm/api/app/contatos/' + x.json.contato.id, { cookies: true })).json.contato;
    assert.ok(f.canais.some(k => k.canal === 'instagram' && k.identificador === 'paulo.dup') && f.canais.some(k => k.canal === 'whatsapp'));
    assert.ok(f.atividades.some(a => a.texto === 'nota do duplicado'));
    assert.equal((await req('GET', '/crm/api/app/contatos/' + y.json.contato.id, { cookies: true })).st, 404);
    assert.equal((await req('POST', `/crm/api/app/contatos/${x.json.contato.id}/mesclar`, { corpo: { com: x.json.contato.id }, cookies: true })).st, 400);
  });

  // ---- busca ativa (leads do Google Maps) ----
  const buscasMod = require('./buscas');
  const fontesMod = require('./busca-fontes');
  const enriqMod = require('./busca-enriquecer');
  let BTID = '';
  const tidDoTenant = async () => BTID || (BTID = (await req('GET', '/crm/api/app/contatos', { cookies: true })).json.contatos[0].tenant_id);
  const LUGARES = [
    { place_id: 'P1', nome: 'Clínica Sorriso Lago Sul', categoria: 'Dentista', endereco: 'SHIS QL 10, Brasília', cidade: 'Brasília', estado: 'DF', telefone: '(61) 3333-1000', site: 'https://sorriso.com.br' },
    { place_id: 'P2', nome: 'Odonto Premium', categoria: 'Dentista', endereco: 'SHIS QI 5', cidade: 'Brasília', estado: 'DF', telefone: '(61) 97000-1234', site: '' },
    { place_id: 'P3', nome: 'Dentista Sem Contato', categoria: 'Dentista', endereco: 'CLS 200', cidade: 'Brasília', estado: 'DF', telefone: '', site: 'https://semcontato.com.br' },
  ];
  const provFake = (lista) => ({ async buscar() { return lista; } });
  const paginas = {
    'https://sorriso.com.br/': '<a href="/contato">Contato</a><footer>noreply@sorriso.com.br logo@2x.png sorriso@sorriso.com.br · <a href="https://wa.me/5561960005555">WhatsApp</a> <a href="https://instagram.com/clinica.sorriso">ig</a></footer>',
    'https://sorriso.com.br/contato': 'Fale: contato@sorriso.com.br',
    'https://semcontato.com.br/': '<p>Nada por aqui</p>',
  };
  const obterFake = async (u) => { const k = String(u).replace(/\/$/, '') + '/'; const key = paginas[u] ? u : (paginas[k] ? k : u); if (paginas[key] == null) throw new Error('404'); return { texto: paginas[key], status: 200 }; };
  let buscaId = '';

  await t('busca ativa: cria, estima custo e NÃO roda sem aprovação', async () => {
    const r = await req('POST', '/crm/api/app/buscas', { corpo: { termo: 'dentista', local_texto: 'Lago Sul, Brasília - DF', frequencia_dias: 7, max_resultados: 100, nome: 'Dentistas Lago Sul' }, cookies: true });
    assert.equal(r.st, 200); buscaId = r.json.busca.id;
    assert.equal(r.json.busca.status, 'aguardando_aprovacao');
    assert.equal(r.json.busca.tag, 'busca:dentistas-lago-sul');
    assert.equal(r.json.busca.custo.lugares_max, 100); assert.ok(r.json.busca.custo.brl_centavos > 0);
    assert.equal((await req('POST', '/crm/api/app/buscas', { corpo: { termo: 'x', local_texto: 'DF' }, cookies: true })).st, 400, 'termo curto');
    assert.equal((await req('POST', '/crm/api/app/buscas', { corpo: { termo: 'dentista' }, cookies: true })).st, 400, 'sem região');
    const lista1 = await req('POST', '/crm/api/app/buscas', { corpo: { termo: 'clínica', local_texto: 'Asa Sul, Asa Norte, Águas Claras, Sudoeste, Noroeste.' }, cookies: true });
    assert.equal(lista1.st, 400); assert.match(lista1.json.erro, /UMA região por linha/, 'lista de bairros numa linha só é recusada');
    assert.equal((await req('POST', '/crm/api/app/buscas', { corpo: { termo: 'clínica', locais: ['Asa Sul, Brasília - DF', 'Lago Sul, Brasília, DF'], max_resultados: 5 }, cookies: true })).st, 200, 'regiões com cidade/UF passam');
    assert.equal((await req('POST', '/crm/api/app/buscas', { corpo: { termo: 'dentista', local_texto: 'DF', frequencia_dias: 2 }, cookies: true })).st, 400, 'frequência fora da lista');
    assert.equal((await req('POST', `/crm/api/app/buscas/${buscaId}/rodar`, { cookies: true })).st, 400, 'rodar sem aprovar');
    assert.equal((await req('POST', `/crm/api/app/buscas/${buscaId}/aprovar`, { corpo: {}, cookies: true })).st, 400, 'aprovar sem aceite');
    assert.equal((await req('POST', `/crm/api/app/buscas/${buscaId}/status`, { corpo: { status: 'ativa' }, cookies: true })).st, 400, 'ativar sem aprovar');
    await assert.rejects(async () => buscasMod.executar(await tidDoTenant(), buscaId, { provedor: provFake(LUGARES) }), /sem aprovação/);
    assert.equal(buscasMod.execucoes(await tidDoTenant(), buscaId).length, 0, 'nenhuma execução registrada');
  });

  await t('busca ativa: aprovada, fonte sem credencial não roda nem cobra', async () => {
    const a = await req('POST', `/crm/api/app/buscas/${buscaId}/aprovar`, { corpo: { aceite: true }, cookies: true });
    assert.equal(a.st, 200); assert.equal(a.json.busca.status, 'ativa'); assert.ok(a.json.busca.aprovada_em);
    delete process.env.APIFY_TOKEN;
    assert.equal((await req('POST', `/crm/api/app/buscas/${buscaId}/rodar`, { cookies: true })).st, 400, 'sem APIFY_TOKEN');
    await assert.rejects(async () => buscasMod.executar(await tidDoTenant(), buscaId), /credencial/);
    assert.equal(buscasMod.execucoes(await tidDoTenant(), buscaId).length, 0);
    // a agenda também fica quieta sem a chave geral
    const r = await buscasMod.rodarVencidas({ provedor: provFake(LUGARES) });
    assert.equal(r.ligada, false); assert.equal(buscasMod.execucoes(await tidDoTenant(), buscaId).length, 0);
  });

  await t('busca ativa: varredura grava empresa+contato, tag, origem, LGPD e canais com fonte', async () => {
    const tid = await tidDoTenant();
    const r = await buscasMod.executar(tid, buscaId, { provedor: provFake(LUGARES), obter: obterFake });
    assert.equal(r.lugares, 3); assert.equal(r.novos, 3); assert.equal(r.existentes, 0);
    assert.equal(r.enriquecidos, 1, 'só o site do P1 rendeu');
    const lug = buscasMod.lugares(tid, buscaId);
    assert.equal(lug.length, 3);
    const p1 = lug.find(l => l.place_id === 'P1');
    const c1 = (await req('GET', '/crm/api/app/contatos/' + p1.contato_id, { cookies: true })).json.contato;
    assert.equal(c1.origem, 'busca-ativa'); assert.equal(c1.tipo, 'lead-b2b'); assert.equal(c1.interesse, 'Dentista');
    assert.ok(c1.tags.includes('busca:dentistas-lago-sul'));
    assert.equal(c1.consentimento.base, 'legitimo-interesse-b2b'); assert.equal(c1.consentimento.optIn, undefined, 'sem optIn');
    assert.ok(c1.empresa_id);
    const porCanal = (c, canal) => c.canais.filter(k => k.canal === canal);
    assert.equal(porCanal(c1, 'whatsapp').length, 1, 'telefone FIXO do Maps não vira WhatsApp; só o wa.me do site');
    assert.equal(porCanal(c1, 'whatsapp')[0].identificador, '5561960005555'); assert.equal(porCanal(c1, 'whatsapp')[0].fonte, 'site:sorriso.com.br');
    const emails = porCanal(c1, 'email').map(k => k.identificador).sort();
    assert.deepEqual(emails, ['contato@sorriso.com.br', 'sorriso@sorriso.com.br'], 'noreply e .png descartados; sem e-mail de RH/diretoria segue lendo a página de contato');
    assert.ok(porCanal(c1, 'email').every(k => k.fonte === 'site:sorriso.com.br'));
    assert.equal(porCanal(c1, 'instagram')[0].identificador, 'clinica.sorriso');
    assert.equal(c1.email, 'sorriso@sorriso.com.br', 'campo clássico preenchido');
    const emp = (await req('GET', '/crm/api/app/empresas', { cookies: true })).json.empresas.find(e => e.nome === 'Clínica Sorriso Lago Sul');
    assert.ok(emp && emp.site === 'https://sorriso.com.br' && emp.segmento === 'Dentista');
    // P2: celular do Maps entra como WhatsApp com fonte "maps"
    const c2 = (await req('GET', '/crm/api/app/contatos/' + lug.find(l => l.place_id === 'P2').contato_id, { cookies: true })).json.contato;
    assert.equal(porCanal(c2, 'whatsapp')[0].fonte, 'maps');
    // P3: lead sem canal, mas capturado
    const c3 = (await req('GET', '/crm/api/app/contatos/' + lug.find(l => l.place_id === 'P3').contato_id, { cookies: true })).json.contato;
    assert.equal(c3.canais.length, 0);
    // a captura NUNCA dispara mensagem
    const ult = (await req('GET', '/crm/api/app/contatos/' + p1.contato_id, { cookies: true })).json.contato.atividades;
    assert.ok(!ult.some(a => /mensagem-enviada/.test(a.tipo)));
  });

  await t('busca ativa: nova varredura deduplica (place_id, telefone, e-mail) e não duplica canais', async () => {
    const tid = await tidDoTenant();
    // contato já existente com o telefone de um lugar novo (P4) e o e-mail de outro (P5)
    const pre = await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'Já Conhecido', telefone: '61955554444' }, cookies: true });
    const pre2 = await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'Outro Conhecido', email: 'ja@conhecido.com.br' }, cookies: true });
    paginas['https://p5.com.br/'] = 'ja@conhecido.com.br';
    const lista = LUGARES.concat([
      { place_id: 'P4', nome: 'Clínica P4', categoria: 'Dentista', endereco: 'x', telefone: '61 95555-4444', site: '' },
      { place_id: 'P5', nome: 'Clínica P5', categoria: 'Dentista', endereco: 'y', telefone: '', site: 'https://p5.com.br' },
    ]);
    const antes = (await req('GET', '/crm/api/app/contatos?limite=2000', { cookies: true })).json.contatos.length;
    const r = await buscasMod.executar(tid, buscaId, { provedor: provFake(lista), obter: obterFake });
    assert.equal(r.lugares, 5); assert.equal(r.novos, 1, 'só P5 é criado (depois unificado); P1–P3 por place_id, P4 por telefone');
    assert.equal(r.existentes, 4);
    const lug = buscasMod.lugares(tid, buscaId);
    assert.equal(lug.length, 5);
    assert.equal(lug.find(l => l.place_id === 'P4').contato_id, pre.json.contato.id, 'P4 aproveitou o contato do telefone');
    const f = (await req('GET', '/crm/api/app/contatos/' + pre.json.contato.id, { cookies: true })).json.contato;
    assert.ok(f.tags.includes('busca:dentistas-lago-sul'), 'contato existente também recebe a tag');
    assert.equal(f.canais.filter(k => k.canal === 'whatsapp').length, 1);
    // P5 nasceu sem canais; o e-mail achado no site já era do "Outro Conhecido" → os dois foram unificados
    assert.equal(lug.find(l => l.place_id === 'P5').contato_id, pre2.json.contato.id, 'P5 unificado pelo e-mail');
    const depois = (await req('GET', '/crm/api/app/contatos?limite=2000', { cookies: true })).json.contatos.length;
    assert.equal(depois, antes, 'nenhum contato a mais: P5 foi criado e mesclado no cadastro que já tinha o e-mail');
    const exec = buscasMod.execucoes(tid, buscaId);
    assert.equal(exec.length, 2); assert.equal(exec[0].gatilho, 'manual');
    assert.ok(exec.every(e => e.status === 'ok' && e.custo_estimado_centavos > 0));
  });

  await t('busca ativa: editar o alvo cancela a aprovação; pausar/retomar; arquivar', async () => {
    const p = await req('PATCH', `/crm/api/app/buscas/${buscaId}`, { corpo: { frequencia_dias: 14 }, cookies: true });
    assert.equal(p.json.reaprovar, true); assert.equal(p.json.busca.status, 'aguardando_aprovacao'); assert.equal(p.json.busca.aprovada_em, '');
    await assert.rejects(async () => buscasMod.executar(await tidDoTenant(), buscaId, { provedor: provFake(LUGARES) }), /sem aprovação/);
    assert.equal((await req('PATCH', `/crm/api/app/buscas/${buscaId}`, { corpo: { nome: 'Renomeada' }, cookies: true })).json.reaprovar, false, 'só o nome não reprova');
    await req('POST', `/crm/api/app/buscas/${buscaId}/aprovar`, { corpo: { aceite: true }, cookies: true });
    assert.equal((await req('POST', `/crm/api/app/buscas/${buscaId}/status`, { corpo: { status: 'pausada' }, cookies: true })).st, 200);
    await assert.rejects(async () => buscasMod.executar(await tidDoTenant(), buscaId, { provedor: provFake(LUGARES) }), /pausada/);
    assert.equal((await req('POST', `/crm/api/app/buscas/${buscaId}/status`, { corpo: { status: 'ativa' }, cookies: true })).st, 200);
    const lista = await req('GET', '/crm/api/app/buscas', { cookies: true });
    assert.ok(lista.json.buscas.length >= 1 && lista.json.buscas.some(x => x.id === buscaId)); assert.ok(lista.json.fontes.some(f => f.id === 'apify')); assert.ok(lista.json.teto_mes > 0);
    const eg = await req('GET', `/crm/api/app/buscas/${buscaId}/lugares`, { cookies: true });
    assert.ok(eg.json.lugares.length >= 5);
    assert.ok((await req('GET', `/crm/api/app/buscas/${buscaId}/execucoes`, { cookies: true })).json.execucoes.length >= 2);
    // outro papel sem permissão de gerir conta não aprova
  });

  await t('busca ativa: agenda roda só vencidas, só com a chave geral, e respeita o teto mensal', async () => {
    const tid = await tidDoTenant();
    const { db } = require('./db');
    db.prepare("UPDATE crm_buscas SET proxima_em = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), buscaId);
    const n0 = buscasMod.execucoes(tid, buscaId).length;
    assert.equal((await buscasMod.rodarVencidas({ provedor: provFake(LUGARES), obter: obterFake })).ligada, false);
    assert.equal(buscasMod.execucoes(tid, buscaId).length, n0, 'chave geral desligada: nada roda');
    const r = await buscasMod.rodarVencidas({ provedor: provFake(LUGARES), obter: obterFake, forcar: true });
    assert.equal(r.rodadas.length, 1); assert.equal(buscasMod.execucoes(tid, buscaId)[0].gatilho, 'agenda');
    const b = buscasMod.obter(tid, buscaId);
    assert.ok(Date.parse(b.proxima_em) > Date.now() + 13 * 86400000, 'próxima varredura em 14 dias');
    assert.equal((await buscasMod.rodarVencidas({ provedor: provFake(LUGARES), forcar: true })).rodadas.length, 0, 'não vencida de novo');
    // teto mensal
    const antigo = process.env.CRM_BUSCA_TETO_LUGARES_MES; process.env.CRM_BUSCA_TETO_LUGARES_MES = '1';
    await assert.rejects(() => buscasMod.executar(tid, buscaId, { provedor: provFake(LUGARES) }), /Teto mensal/);
    if (antigo === undefined) delete process.env.CRM_BUSCA_TETO_LUGARES_MES; else process.env.CRM_BUSCA_TETO_LUGARES_MES = antigo;
  });

  await t('busca ativa: erro da fonte vira execução com erro e a agenda adia', async () => {
    const tid = await tidDoTenant();
    const { db } = require('./db');
    db.prepare("UPDATE crm_buscas SET proxima_em = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), buscaId);
    const quebrada = { async buscar() { throw new Error('Apify respondeu 402'); } };
    const r = await buscasMod.rodarVencidas({ provedor: quebrada, forcar: true });
    assert.match(r.rodadas[0].erro, /402/);
    assert.equal(buscasMod.execucoes(tid, buscaId)[0].status, 'erro');
    assert.ok(Date.parse(buscasMod.obter(tid, buscaId).proxima_em) > Date.now(), 'adiada, não tenta a cada ciclo');
    assert.equal(buscasMod.obter(tid, buscaId).rodando_desde, '', 'trava de concorrência liberada');
  });

  await t('busca ativa: contatos capturados entram em campanha por tag, sem disparo automático', async () => {
    saas.repo.salvarSettings(await tidDoTenant(), { limites_over: { campanhas_mes: 999 } });
    const m = await req('POST', '/crm/api/app/campanhas', { corpo: { nome: 'Dentistas — abordagem', canais: ['email', 'whatsapp'], modo: 'melhor', segmento: { tag: 'busca:dentistas-lago-sul' }, mensagem: 'Olá {{nome}}' }, cookies: true });
    assert.equal(m.st, 200, JSON.stringify(m.json));
    const alvos = (await req('GET', `/crm/api/app/campanhas/${m.json.campanha ? m.json.campanha.id : m.json.id}/alvos`, { cookies: true })).json.alvos;
    assert.ok(alvos.length >= 2, 'quem tem canal entra na fila');
    assert.ok(alvos.every(a => a.status === 'pendente'), 'tudo pendente: o envio é humano');
    saas.repo.salvarSettings(await tidDoTenant(), { limites_over: {} });
  });

  await t('confraternização: vários bairros e categorias, tag, bairro, RH/diretoria e campanha em rascunho', async () => {
    const tid = await tidDoTenant();
    // custo: categorias × bairros × máx — mostrado ANTES de gastar
    const r = await req('POST', '/crm/api/app/buscas', { corpo: { termos: ['escritório', 'clínica'], locais: ['Lago Sul, Brasília - DF', 'Asa Norte, Brasília - DF'], max_resultados: 10, frequencia_dias: 30, tags: ['Confraternização 2026'], nome: 'Confra DF' }, cookies: true });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    const b = r.json.busca;
    assert.equal(b.custo.lugares_max, 40, '2 categorias × 2 bairros × 10'); assert.deepEqual(b.tags_extra, ['confraternizacao-2026']);
    assert.equal(b.status, 'aguardando_aprovacao');
    assert.equal((await req('POST', '/crm/api/app/buscas', { corpo: { termos: ['ab'], locais: ['DF'] }, cookies: true })).st, 400, 'categoria curta');
    await req('POST', `/crm/api/app/buscas/${b.id}/aprovar`, { corpo: { aceite: true }, cookies: true });
    const chamadas = [];
    const prov = { async buscar(q) {
      chamadas.push({ termos: q.termos, local: q.local_texto, max: q.max_resultados });
      const lago = q.local_texto.startsWith('Lago Sul');
      return [{ place_id: lago ? 'C1' : 'C2', nome: lago ? 'Advocacia Lago' : 'Agência Norte', categoria: 'Empresa', endereco: 'x', cidade: 'Brasília', estado: 'DF', telefone: '', site: lago ? 'https://advlago.com.br' : '' }];
    } };
    paginas['https://advlago.com.br/'] = 'Fale com o RH: rh@advlago.com.br · diretoria@advlago.com.br · contato@advlago.com.br · vendas@advlago.com.br';
    const ex = await buscasMod.executar(tid, b.id, { provedor: prov, obter: obterFake });
    assert.equal(chamadas.length, 2, 'uma chamada por bairro'); assert.deepEqual(chamadas[0].termos, ['escritório', 'clínica']);
    assert.equal(chamadas[0].max, 10); assert.equal(ex.lugares, 2); assert.equal(ex.novos, 2);
    const lug = buscasMod.lugares(tid, b.id);
    const c1 = (await req('GET', '/crm/api/app/contatos/' + lug.find(l => l.place_id === 'C1').contato_id, { cookies: true })).json.contato;
    assert.equal(c1.tipo, 'lead-b2b'); assert.equal(c1.origem, 'busca-ativa');
    for (const tg of ['confraternizacao-2026', 'bairro:lago-sul', 'google-maps']) assert.ok(c1.tags.includes(tg), tg);
    assert.match(c1.obs, /Lago Sul/);
    assert.equal(lug.find(l => l.place_id === 'C2').bairro, 'Asa Norte, Brasília - DF');
    const em = c1.canais.filter(k => k.canal === 'email');
    assert.equal(em[0].identificador, 'rh@advlago.com.br'); assert.equal(em[0].rotulo, 'RH');
    assert.equal(em.find(k => k.identificador === 'diretoria@advlago.com.br').rotulo, 'Diretoria');
    assert.equal(em.find(k => k.identificador === 'contato@advlago.com.br').rotulo, '');
    // campanha: rascunho, sem envio, só quem tem canal; texto sem salão/banda/DJ e sem preço
    saas.repo.salvarSettings(tid, { limites_over: { campanhas_mes: 999 } });
    // as regras de texto (salão/banda/DJ, preço) e a mensagem padrão são do negócio do Augusto: valem para a conta INTERNA
    require('./db').db.prepare("UPDATE tenants SET origem = 'interno' WHERE id = ?").run(tid);
    try {
      assert.equal((await req('POST', '/crm/api/app/buscas/preparar-campanha', { corpo: { tag: 'confraternizacao-2026', mensagem: 'Nosso salão de festas!' }, cookies: true })).st, 400, 'salão proibido');
      assert.equal((await req('POST', '/crm/api/app/buscas/preparar-campanha', { corpo: { tag: 'confraternizacao-2026', mensagem: 'Temos DJ e banda' }, cookies: true })).st, 400);
      assert.equal((await req('POST', '/crm/api/app/buscas/preparar-campanha', { corpo: { tag: 'confraternizacao-2026', mensagem: 'A diária é R$ 900' }, cookies: true })).st, 400, 'preço só da proposta');
      const c = await req('POST', '/crm/api/app/buscas/preparar-campanha', { corpo: { tag: 'confraternizacao-2026' }, cookies: true });
      assert.equal(c.st, 200, JSON.stringify(c.json)); assert.equal(c.json.status, 'rascunho'); assert.equal(c.json.contatos, 1, 'só C1 tem e-mail; C2 não tem canal');
      const camp = (await req('GET', '/crm/api/app/campanhas', { cookies: true })).json.campanhas.find(x => x.id === c.json.id);
      assert.equal(camp.status, 'rascunho'); assert.deepEqual(camp.canais, ['email', 'whatsapp']);
      assert.ok(!/sal[aã]o|banda|\bdj\b|R\$/i.test(camp.mensagem), 'texto padrão respeita as regras da casa');
      const alvos = (await req('GET', `/crm/api/app/campanhas/${c.json.id}/alvos`, { cookies: true })).json.alvos;
      assert.ok(alvos.length && alvos.every(a => a.status === 'pendente' && a.destino === 'rh@advlago.com.br'), 'o RH é o destino');
      // assinante comum: as palavras e o preço são DELE; só a mensagem é obrigatória (a padrão é do Augusto)
      require('./db').db.prepare("UPDATE tenants SET origem = 'landing' WHERE id = ?").run(tid);
      assert.equal((await req('POST', '/crm/api/app/buscas/preparar-campanha', { corpo: { tag: 'confraternizacao-2026' }, cookies: true })).st, 400, 'sem mensagem própria não usa o texto do Augusto');
      const livre = await req('POST', '/crm/api/app/buscas/preparar-campanha', { corpo: { tag: 'confraternizacao-2026', mensagem: 'Olá, {{nome}}! Temos banda e DJ por R$ 900.' }, cookies: true });
      assert.equal(livre.st, 200, JSON.stringify(livre.json));
    } finally { require('./db').db.prepare("UPDATE tenants SET origem = 'landing' WHERE id = ?").run(tid); saas.repo.salvarSettings(tid, { limites_over: {} }); }
  });

  // =====================================================================
  // CAPTURA DE LEADS PARA ASSINANTES: cofre, carteira pré-paga, IA (chave própria/créditos), busca externa paga,
  // importação de exports. Provedores SIMULADOS: nenhuma chamada real ao Apify, à Anthropic ou à OpenAI.
  // =====================================================================
  const CapturaMod = require('./captura'); const CofreMod = require('./cofre'); const CarteiraMod = require('./carteira'); const IAMod = require('./ia-provedor');
  const dbm = require('./db').db;
  const CHAVE_ANT = 'sk-ant-api03-' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4'; // chave FALSA de teste
  const TOKEN_APIFY = 'apify_api_' + 'Zx9Yw8Vu7Ts6Rq5Po4Nm3';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const saldoDe = async () => CarteiraMod.saldo(await tidDoTenant());
  const logs = []; const _log = console.log, _warn = console.warn, _err = console.error;
  const gravaLog = (...a) => { logs.push(a.map(String).join(' ')); };
  process.env.ANTHROPIC_API_KEY = 'sk-ant-PLATAFORMA-' + 'Qq1Ww2Ee3Rr4Tt5Yy6Uu7Ii8Oo9';
  let chamadasIA = [];
  IAMod.trocarTransporte(async (url, init) => {
    chamadasIA.push({ url, headers: init.headers, body: init.body });
    if (/\/models/.test(url)) return { ok: true, status: 200, json: async () => ({ data: [] }) };
    if (chamadasIA.falhar) return { ok: false, status: chamadasIA.falhar, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{"termos":["clínica odontológica","dentista"],"locais":["Lago Sul"],"observacao":"ok"}' }], usage: { input_tokens: 500, output_tokens: 100 } }) };
  });

  await t('cofre: chave malformada é recusada; válida é cifrada, nunca volta e some do log/erro', async () => {
    assert.equal((await req('PUT', '/crm/api/app/captura/chaves/ia_anthropic', { corpo: { valor: 'minha senha é 123' }, cookies: true })).st, 400);
    assert.equal((await req('PUT', '/crm/api/app/captura/chaves/qualquer', { corpo: { valor: CHAVE_ANT }, cookies: true })).st, 400, 'tipo desconhecido');
    const r = await req('PUT', '/crm/api/app/captura/chaves/ia_anthropic', { corpo: { valor: CHAVE_ANT }, cookies: true });
    assert.equal(r.st, 200, r.texto); assert.ok(!r.texto.includes(CHAVE_ANT), 'a resposta não devolve a chave');
    const v = await req('GET', '/crm/api/app/captura', { cookies: true });
    assert.equal(v.st, 200); assert.ok(!v.texto.includes(CHAVE_ANT), 'a tela não recebe a chave');
    const meta = v.json.cofre.chaves.find((c) => c.nome === 'ia_anthropic');
    assert.equal(meta.final, '••••' + CHAVE_ANT.slice(-4));
    const linha = dbm.prepare('SELECT * FROM crm_segredos WHERE nome = ?').get('ia_anthropic');
    assert.ok(!JSON.stringify(linha).includes(CHAVE_ANT) && !linha.cifra.includes('sk-ant'), 'no banco só há cifra');
    const tid = await tidDoTenant();
    assert.equal(CofreMod.revelar(tid, 'ia_anthropic'), CHAVE_ANT);
    assert.ok(!CofreMod.limpar('falhou com ' + CHAVE_ANT + ' e Bearer abcdefghijklmnop12345', tid).includes(CHAVE_ANT));
    // a linha copiada para OUTRO tenant não decifra (tenant+nome entram na autenticação do GCM)
    dbm.prepare('INSERT INTO crm_segredos (id, tenant_id, nome, cifra, iv, tag, ultimos4, criado_em) VALUES (?,?,?,?,?,?,?,?)').run('copia1', 'outro-tenant', 'ia_anthropic', linha.cifra, linha.iv, linha.tag, 'x', 'agora');
    assert.throws(() => CofreMod.revelar('outro-tenant', 'ia_anthropic'), /ler a chave/);
    dbm.prepare("DELETE FROM crm_segredos WHERE id = 'copia1'").run();
  });

  await t('cofre: sem GROWTH_SECRET_KEY nada é gravado (sem modo silencioso)', async () => {
    const k = process.env.GROWTH_SECRET_KEY; delete process.env.GROWTH_SECRET_KEY;
    const tid0 = await tidDoTenant();
    try { assert.throws(() => CofreMod.guardar(tid0, 'apify', TOKEN_APIFY), /GROWTH_SECRET_KEY/); } finally { process.env.GROWTH_SECRET_KEY = k; }
  });

  await t('cofre: testar a chave não gasta token e marca a data; chave recusada é dita sem expor nada', async () => {
    chamadasIA = [];
    const ok = await req('POST', '/crm/api/app/captura/chaves/ia_anthropic/testar', { cookies: true });
    assert.equal(ok.json.ok, true); assert.ok(chamadasIA.every((c) => /\/models/.test(c.url)), 'só lista modelos');
    assert.equal(chamadasIA[0].headers['x-api-key'], CHAVE_ANT);
    assert.ok((await req('GET', '/crm/api/app/captura', { cookies: true })).json.cofre.chaves[0].testada_em);
  });

  await t('IA com chave PRÓPRIA: usa a chave do assinante, não cobra, registra só metadado', async () => {
    chamadasIA = []; const antes = await saldoDe();
    console.log = gravaLog; console.warn = gravaLog; console.error = gravaLog;
    let r; try { r = await req('POST', '/crm/api/app/captura/ia/executar', { corpo: { tarefa: 'sugerir_busca', entrada: { descricao: 'Sou dentista no Lago Sul e quero atender famílias do bairro' }, modo: 'propria' }, cookies: true }); }
    finally { console.log = _log; console.warn = _warn; console.error = _err; }
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(r.json.resultado.termos, ['clínica odontológica', 'dentista']);
    assert.equal(chamadasIA[0].headers['x-api-key'], CHAVE_ANT, 'a chamada saiu com a chave DELE');
    assert.equal(await saldoDe(), antes, 'chave própria não mexe no saldo'); assert.equal(r.json.uso.cobrado_milesimos, 0);
    assert.ok(!r.texto.includes(CHAVE_ANT) && !logs.join('\n').includes(CHAVE_ANT), 'chave fora da resposta e dos logs');
    const u = dbm.prepare("SELECT * FROM crm_ia_uso WHERE modo = 'propria'").get();
    assert.ok(u && u.tokens_in === 500 && u.milesimos === 0); assert.ok(!JSON.stringify(u).includes('dentista'), 'nem prompt nem resposta ficam gravados');
    // o prompt tem a moldura anti-injeção e não leva a chave
    assert.ok(!chamadasIA[0].body.includes(CHAVE_ANT)); assert.match(chamadasIA[0].body, /nao instrucao|não instrução/);
  });

  await t('IA com chave própria: provedor recusa → erro claro, sem eco da chave; sem chave cadastrada → pede para cadastrar', async () => {
    chamadasIA = []; chamadasIA.falhar = 401;
    const r = await req('POST', '/crm/api/app/captura/ia/executar', { corpo: { tarefa: 'sugerir_busca', entrada: { descricao: 'Sou dentista no Lago Sul e quero atender famílias' }, modo: 'propria' }, cookies: true });
    chamadasIA.falhar = 0;
    assert.equal(r.st, 502); assert.match(r.json.erro, /recusada/); assert.ok(!r.texto.includes(CHAVE_ANT));
    const t2 = await req('POST', '/crm/api/app/captura/ia/executar', { corpo: { tarefa: 'sugerir_busca', entrada: { descricao: 'Sou dentista no Lago Sul e quero atender famílias' }, modo: 'propria', provedor: 'openai' }, cookies: true });
    assert.equal(t2.st, 400); assert.match(t2.json.erro, /Cadastre/);
    assert.equal((await req('POST', '/crm/api/app/captura/ia/executar', { corpo: { tarefa: 'sugerir_busca', entrada: { descricao: 'curto' }, modo: 'propria' }, cookies: true })).st, 400, 'entrada curta');
    assert.equal((await req('POST', '/crm/api/app/captura/ia/executar', { corpo: { tarefa: 'apagar_tudo', entrada: {}, modo: 'propria' }, cookies: true })).st, 400, 'tarefa desconhecida');
  });

  await t('créditos DESLIGADOS: a plataforma não absorve custo — IA e recarga recusadas', async () => {
    const e = { tarefa: 'sugerir_busca', entrada: { descricao: 'Sou dentista no Lago Sul e quero atender famílias' }, modo: 'creditos', aceite_milesimos: 999999 };
    const r = await req('POST', '/crm/api/app/captura/ia/executar', { corpo: e, cookies: true });
    assert.equal(r.st, 403); assert.match(r.json.erro, /créditos ainda não/i);
    assert.equal((await req('POST', '/crm/api/app/carteira/recarga', { corpo: { valor_centavos: 2000 }, cookies: true })).st, 403);
    assert.equal(await saldoDe(), 0);
    // ligar sem câmbio é recusado (não liga pela metade)
    assert.equal((await req('POST', '/staff/api/vcrm/carteira/config', { corpo: { ativa: true, cambio_modo: 'ptax' } })).st, 400);
    assert.equal((await req('POST', '/staff/api/vcrm/carteira/config', { corpo: { margem_pct: 900 } })).st, 400);
  });

  await t('staff liga a carteira (câmbio fixo, margem 30%); recarga por pacote → webhook credita UMA vez', async () => {
    const c = await req('POST', '/staff/api/vcrm/carteira/config', { corpo: { ativa: true, cambio_modo: 'fixo', cambio_fixo: 5.5, folga_pct: 0, margem_pct: 30 } });
    assert.equal(c.st, 200, c.texto); assert.equal(c.json.config.ativa, true);
    assert.equal((await req('POST', '/crm/api/app/carteira/recarga', { corpo: { valor_centavos: 1234 }, cookies: true })).st, 400, 'só pacotes');
    const r = await req('POST', '/crm/api/app/carteira/recarga', { corpo: { valor_centavos: 2000 }, cookies: true });
    assert.equal(r.st, 200, r.texto); assert.ok(r.json.init_point.includes('mp/pref'));
    const pref = mpPrefs[mpPrefs.length - 1];
    assert.equal(pref.external_reference, 'crmrec:' + r.json.recarga_id); assert.equal(pref.items[0].unit_price, 20);
    // valor diferente do que criamos: não credita
    _payResp = { id: 7001, status: 'approved', external_reference: 'crmrec:' + r.json.recarga_id, transaction_amount: 1 };
    await req('POST', '/crm/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 7001 } } }); await sleep(120);
    assert.equal(await saldoDe(), 0, 'valor pago diferente do pedido não credita');
    _payResp = { id: 7001, status: 'approved', external_reference: 'crmrec:' + r.json.recarga_id, transaction_amount: 20 };
    for (let i = 0; i < 3; i++) { await req('POST', '/crm/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 7001 } } }); await sleep(100); }
    assert.equal(await saldoDe(), 20000, 'R$ 20,00 = 20.000 milésimos, uma vez só');
    const est = (await req('GET', '/crm/api/app/carteira', { cookies: true })).json;
    assert.equal(est.saldo_milesimos, 20000); assert.ok(est.extrato.some((x) => x.tipo === 'recarga'));
    // reembolso tira o crédito
    _payResp = { id: 7001, status: 'refunded', external_reference: 'crmrec:' + r.json.recarga_id, transaction_amount: 20 };
    await req('POST', '/crm/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 7001 } } }); await sleep(120);
    assert.equal(await saldoDe(), 0, 'reembolso devolve o crédito ao MP');
    // cortesia só pelo staff, com motivo
    assert.equal((await req('POST', '/staff/api/vcrm/carteira/cortesia', { corpo: { tenant_id: await tidDoTenant(), valor_centavos: 2000 } })).st, 400, 'sem motivo');
    const co = await req('POST', '/staff/api/vcrm/carteira/cortesia', { corpo: { tenant_id: await tidDoTenant(), valor_centavos: 2000, motivo: 'teste' } });
    assert.equal(co.st, 200); assert.equal(await saldoDe(), 20000);
    assert.equal((await req('POST', '/staff/api/vcrm/carteira/cortesia', { corpo: { tenant_id: await tidDoTenant(), valor_centavos: 2000, motivo: 'x' }, user: 'op' })).st, 403, 'não-admin não dá crédito');
  });

  await t('IA com CRÉDITOS: orçamento → sem aceite 409 (nada gasto) → com aceite reserva, cobra o REAL e devolve a diferença', async () => {
    const corpo = { tarefa: 'sugerir_busca', entrada: { descricao: 'Sou dentista no Lago Sul e quero atender famílias do bairro' }, modo: 'creditos', provedor: 'anthropic' };
    const orc = await req('POST', '/crm/api/app/captura/ia/orcar', { corpo, cookies: true });
    assert.equal(orc.st, 200, orc.texto); assert.ok(orc.json.orcamento.teto_milesimos > 0); assert.ok(!orc.texto.includes('sk-ant'));
    const antes = await saldoDe(); chamadasIA = [];
    const sem = await req('POST', '/crm/api/app/captura/ia/executar', { corpo, cookies: true });
    assert.equal(sem.st, 409); assert.equal(sem.json.orcamento_milesimos, orc.json.orcamento.teto_milesimos);
    assert.equal(chamadasIA.length, 0, 'sem aceite o provedor nem é chamado'); assert.equal(await saldoDe(), antes);
    const ok = await req('POST', '/crm/api/app/captura/ia/executar', { corpo: { ...corpo, aceite_milesimos: orc.json.orcamento.teto_milesimos }, cookies: true });
    assert.equal(ok.st, 200, ok.texto); assert.equal(ok.json.uso.modo, 'creditos');
    assert.match(chamadasIA[0].headers['x-api-key'], /^sk-ant-PLATAFORMA/, 'créditos usam a chave da plataforma, não a do assinante');
    const cobrado = ok.json.uso.cobrado_milesimos;
    // real: 500 tokens × US$0,10/M + 100 × US$0,50/M = US$ 0,0001 → × 5,5 × 1,3 → arredonda para cima
    assert.equal(cobrado, Math.ceil(0.0001 * 5.5 * 1.3 * 1000 - 1e-9)); assert.ok(cobrado < orc.json.orcamento.teto_milesimos, 'cobrou o real, não o teto');
    assert.equal(await saldoDe(), antes - cobrado, 'o saldo caiu só o custo real');
    assert.equal(dbm.prepare("SELECT COUNT(*) n FROM crm_carteira_mov WHERE tipo = 'reserva' AND ref NOT IN (SELECT ref FROM crm_carteira_mov WHERE tipo IN ('acerto','estorno'))").get().n, 0, 'nenhuma reserva em aberto');
    const uso = (await req('GET', '/crm/api/app/carteira', { cookies: true })).json.extrato.find((x) => x.tipo === 'uso');
    assert.ok(uso && /Sugerir busca/.test(uso.descricao));
  });

  await t('IA com créditos: falha do provedor estorna TUDO; saldo insuficiente é 402 sem chamar o provedor', async () => {
    const corpo = { tarefa: 'sugerir_busca', entrada: { descricao: 'Sou dentista no Lago Sul e quero atender famílias do bairro' }, modo: 'creditos' };
    const teto = (await req('POST', '/crm/api/app/captura/ia/orcar', { corpo, cookies: true })).json.orcamento.teto_milesimos;
    const antes = await saldoDe(); chamadasIA = []; chamadasIA.falhar = 500;
    const r = await req('POST', '/crm/api/app/captura/ia/executar', { corpo: { ...corpo, aceite_milesimos: teto }, cookies: true });
    chamadasIA.falhar = 0;
    assert.equal(r.st, 502); assert.equal(await saldoDe(), antes, 'estorno integral');
    // segura TODO o saldo numa reserva (o staff só ajusta em centavos; a reserva zera na unidade) e tenta de novo
    const tidZ = await tidDoTenant(); const tudo = CarteiraMod.saldo(tidZ); CarteiraMod.reservar(tidZ, tudo, { ref: 'seguro-teste' });
    chamadasIA = [];
    const baixo = await req('POST', '/crm/api/app/captura/ia/executar', { corpo: { ...corpo, aceite_milesimos: teto }, cookies: true });
    assert.equal(baixo.st, 402); assert.match(baixo.json.erro, /Saldo insuficiente/); assert.equal(chamadasIA.length, 0);
    CarteiraMod.estornar(tidZ, 'seguro-teste', tudo);
    await req('POST', '/staff/api/vcrm/carteira/cortesia', { corpo: { tenant_id: tidZ, valor_centavos: 3000, motivo: 'recompõe' } });
  });

  await t('isolamento: o saldo, o cofre e as reservas de um assinante não aparecem para outro', async () => {
    await req('POST', '/crm/api/signup', { corpo: { nome: 'Outra Empresa', nome_responsavel: 'Z', email: 'z@outra.br', plano: 'trial' } });
    const outro = dbm.prepare("SELECT id FROM tenants WHERE email_contato = 'z@outra.br'").get().id;
    assert.equal(CarteiraMod.saldo(outro), 0); assert.deepEqual(CofreMod.meta(outro), []); assert.equal(CofreMod.revelar(outro, 'ia_anthropic'), null);
    assert.deepEqual(CarteiraMod.extrato(outro), []);
    assert.throws(() => CarteiraMod.reservar(outro, 1000), /Saldo insuficiente/);
  });

  await t('conta interna: isenta de cobrança, usa a chave do servidor e não recarrega', async () => {
    const c = await req('POST', '/staff/api/vcrm/tenants', { corpo: { nome: 'Interno X', slug: 'interno-x', email: 'x@interno.br', plano: 'enterprise', status_inicial: 'ativa', origem: 'interno' } });
    assert.equal(c.st, 200, c.texto);
    const id = dbm.prepare("SELECT id FROM tenants WHERE slug = 'interno-x'").get().id;
    assert.equal(CarteiraMod.interno(id), true);
    chamadasIA = [];
    const r = await IAMod.executar(id, { tarefa: 'sugerir_busca', entrada: { descricao: 'Hospedagem por temporada em Brasília para famílias' }, modo: 'creditos' });
    assert.equal(r.uso.modo, 'interno'); assert.equal(r.uso.cobrado_milesimos, 0); assert.equal(CarteiraMod.saldo(id), 0);
    await assert.rejects(() => CarteiraMod.criarRecarga(id, 2000, 'https://x'), /interna/);
  });

  // ---- busca externa paga ----
  const itensApify = [
    { placeId: 'AP1', title: 'Clínica Odonto Sul', categoryName: 'Dentista', address: 'SHIS QI 9', city: 'Brasília', state: 'DF', phoneUnformatted: '61999990001', website: '' },
    { placeId: 'AP2', title: 'Sorriso Norte', categoryName: 'Dentista', address: 'SHIN', city: 'Brasília', state: 'DF', phoneUnformatted: '6133331000', website: '' },
  ];
  const apifyHttp = { chamadas: [], falhar: false };
  fontesMod.trocarTransporte(async (url, init) => {
    apifyHttp.chamadas.push({ url, auth: init.headers.Authorization });
    if (apifyHttp.falhar) return { ok: false, status: 402, text: async () => 'sem credito ' + init.headers.Authorization, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => itensApify, text: async () => '' };
  });
  let extId = '';
  await t('busca externa por ÁREA: planeja, mostra o teto e NÃO roda enquanto a plataforma não libera', async () => {
    process.env.APIFY_TOKEN = 'apify_api_PLATAFORMA' + 'x'.repeat(12);
    assert.equal((await req('POST', '/crm/api/app/captura/externa/planejar', { corpo: { area: 'telepatia', termos: ['dentista'], locais: ['Lago Sul'] }, cookies: true })).st, 400, 'área desconhecida');
    const p = await req('POST', '/crm/api/app/captura/externa/planejar', { corpo: { area: 'whatsapp', termos: ['dentista'], locais: ['Lago Sul, Brasília - DF'], max_resultados: 20, nome: 'Dentistas WhatsApp' }, cookies: true });
    assert.equal(p.st, 200, p.texto); extId = p.json.busca.id;
    assert.equal(p.json.busca.canal_alvo, 'whatsapp'); assert.equal(p.json.busca.status, 'aguardando_aprovacao');
    assert.equal(p.json.situacao.pode, false); assert.match(p.json.situacao.motivo, /ainda não foi liberada/);
    await req('POST', `/crm/api/app/buscas/${extId}/aprovar`, { corpo: { aceite: true }, cookies: true });
    const r = await req('POST', `/crm/api/app/buscas/${extId}/rodar`, { cookies: true });
    assert.equal(r.st, 400); assert.match(r.json.erro, /liberada/);
    await assert.rejects(async () => buscasMod.executar(await tidDoTenant(), extId), /liberada/);
    assert.equal(apifyHttp.chamadas.length, 0, 'nenhuma chamada paga'); assert.equal(buscasMod.execucoes(await tidDoTenant(), extId).length, 0);
  });

  await t('busca externa com CRÉDITOS: pede aceite do teto, reserva, cobra só os lugares devolvidos e acerta', async () => {
    await req('POST', '/staff/api/vcrm/captura/config', { corpo: { externa_ativa: true } });
    const tid = await tidDoTenant();
    const orc = (await req('GET', `/crm/api/app/captura/externa/${extId}/orcamento`, { cookies: true })).json.orcamento;
    assert.equal(orc.modo, 'creditos'); assert.equal(orc.lugares_max, 20); assert.ok(orc.cobre);
    assert.equal(orc.teto_milesimos, Math.ceil(20 * 0.0015 * 5.5 * 1.3 * 1000 - 1e-9));
    const sem = await req('POST', `/crm/api/app/buscas/${extId}/rodar`, { cookies: true });
    assert.equal(sem.st, 409); assert.equal(sem.json.orcamento_milesimos, orc.teto_milesimos); assert.equal(apifyHttp.chamadas.length, 0);
    const antes = CarteiraMod.saldo(tid);
    const r = await buscasMod.executar(tid, extId, { gatilho: 'manual', obter: obterFake });
    assert.equal(r.lugares, 2); assert.equal(apifyHttp.chamadas.length, 1);
    assert.match(apifyHttp.chamadas[0].auth, /PLATAFORMA/, 'créditos usam o token do servidor');
    const real = Math.ceil(2 * 0.0015 * 5.5 * 1.3 * 1000 - 1e-9);
    assert.equal(CarteiraMod.saldo(tid), antes - real, 'cobrou 2 lugares, não o teto de 20');
    const ex = buscasMod.execucoes(tid, extId)[0]; assert.equal(ex.modo_cobranca, 'creditos'); assert.equal(ex.cobrado_milesimos, real);
    const lista = buscasMod.listar(tid).find((b) => b.id === extId);
    assert.equal(lista.resumo.aproveitaveis, 1, 'só o lead com celular conta para a área WhatsApp (o outro tem telefone fixo)');
    assert.equal(lista.custo_total_cobrado_milesimos, real);
  });

  await t('busca externa: fonte falha → estorno total e erro sem eco do token; saldo curto → 402 sem chamar a fonte', async () => {
    const tid = await tidDoTenant(); const antes = CarteiraMod.saldo(tid);
    apifyHttp.falhar = true; apifyHttp.chamadas.length = 0;
    await assert.rejects(() => buscasMod.executar(tid, extId, { gatilho: 'manual', obter: obterFake }), (e) => { assert.ok(!e.message.includes('PLATAFORMA'), 'sem token na mensagem'); return /Apify respondeu 402/.test(e.message); });
    apifyHttp.falhar = false;
    assert.equal(CarteiraMod.saldo(tid), antes, 'nada devolvido pela fonte = nada cobrado');
    assert.equal(dbm.prepare("SELECT COUNT(*) n FROM crm_carteira_mov WHERE tenant_id = ? AND tipo = 'reserva' AND ref NOT IN (SELECT ref FROM crm_carteira_mov WHERE tipo IN ('acerto','estorno'))").get(tid).n, 0);
    const ex = buscasMod.execucoes(tid, extId)[0]; assert.equal(ex.status, 'erro'); assert.ok(!String(ex.erro).includes('PLATAFORMA'));
    const tudo = CarteiraMod.saldo(tid); CarteiraMod.reservar(tid, tudo, { ref: 'seguro-teste-2' });
    apifyHttp.chamadas.length = 0;
    await assert.rejects(() => buscasMod.executar(tid, extId, { gatilho: 'manual', obter: obterFake }), /Saldo insuficiente/);
    assert.equal(apifyHttp.chamadas.length, 0);
    const r = await req('POST', `/crm/api/app/buscas/${extId}/rodar`, { corpo: { aceite_milesimos: 9999999 }, cookies: true });
    assert.equal(r.st, 402);
    CarteiraMod.estornar(tid, 'seguro-teste-2', tudo);
    await req('POST', '/staff/api/vcrm/carteira/cortesia', { corpo: { tenant_id: tid, valor_centavos: 3000, motivo: 'recompõe' } });
  });

  await t('busca externa com TOKEN DO ASSINANTE: usa o token dele, não cobra créditos', async () => {
    const tid = await tidDoTenant();
    assert.equal((await req('PUT', '/crm/api/app/captura/chaves/apify', { corpo: { valor: 'apify_api_curto' }, cookies: true })).st, 400, 'token malformado');
    assert.equal((await req('PUT', '/crm/api/app/captura/chaves/apify', { corpo: { valor: TOKEN_APIFY }, cookies: true })).st, 200);
    const antes = CarteiraMod.saldo(tid); apifyHttp.chamadas.length = 0;
    const o = (await req('GET', `/crm/api/app/captura/externa/${extId}/orcamento`, { cookies: true })).json.orcamento;
    assert.equal(o.modo, 'propria'); assert.equal(o.teto_milesimos, 0);
    // rodar pela rota não pede aceite (não há cobrança de créditos)
    const r = await buscasMod.executar(tid, extId, { gatilho: 'manual', obter: obterFake });
    assert.equal(r.lugares, 2); assert.equal(apifyHttp.chamadas[0].auth, 'Bearer ' + TOKEN_APIFY);
    assert.equal(CarteiraMod.saldo(tid), antes, 'créditos intactos');
    assert.equal(buscasMod.execucoes(tid, extId)[0].modo_cobranca, 'propria');
    await req('DELETE', '/crm/api/app/captura/chaves/apify', { cookies: true });
    assert.equal(CofreMod.tem(tid, 'apify'), false);
    delete process.env.APIFY_TOKEN;
  });

  // ---- DENTRO: importação de exports ----
  const conversasTotal = async () => dbm.prepare('SELECT COUNT(*) n FROM crm_conversas WHERE tenant_id = ?').get(await tidDoTenant()).n;
  const WA = [
    '12/10/2026 14:03 - Maria Souza: Oi, queria saber o preço do plano',
    '12/10/2026 14:05 - Beta Dono: Claro! Posso mandar a proposta?',
    '12/10/2026 14:06 - Maria Souza: Pode mandar a proposta, quanto custa o plano mensal?',
    'segunda linha da mensagem dela',
  ].join('\n');
  await t('importar WhatsApp (.txt): pergunta quem é você, não chuta; texto não é guardado; assunto GERAL', async () => {
    const antes = await conversasTotal();
    const sem = await req('POST', '/crm/api/app/captura/interna/importar', { corpo: { area: 'whatsapp', arquivos: [{ nome: 'Conversa com Maria Souza.txt', conteudo: WA }] }, cookies: true });
    assert.equal(sem.st, 200, sem.texto); assert.equal(sem.json.precisa_eu, true); assert.ok(sem.json.candidatos.includes('Maria Souza'));
    assert.equal(await conversasTotal(), antes, 'nada gravado enquanto a tela pergunta');
    const r = await req('POST', '/crm/api/app/captura/interna/importar', { corpo: { area: 'whatsapp', eu: 'Beta Dono', arquivos: [{ nome: 'c.txt', conteudo: WA }] }, cookies: true });
    assert.equal(r.st, 200, r.texto); assert.equal(r.json.ingestao.novas, 1);
    const c = dbm.prepare("SELECT * FROM crm_conversas WHERE canal = 'whatsapp' AND tenant_id = ?").get(await tidDoTenant());
    assert.equal(c.assunto, 'geral'); assert.equal(c.status, 'sugerido', 'nada vira contato sozinho'); assert.equal(c.identificador, 'nome:maria souza');
    const bruto = JSON.stringify(c).toLowerCase();
    for (const frase of ['queria saber', 'posso mandar', 'segunda linha', 'quanto custa o plano mensal']) assert.ok(!bruto.includes(frase), 'texto de conversa não é gravado: ' + frase);
    assert.ok(!r.texto.includes('segunda linha'), 'nem devolvido');
    // grupo (3 autores) e "eu" errado não geram lead
    const g = await req('POST', '/crm/api/app/captura/interna/importar', { corpo: { area: 'whatsapp', eu: 'Beta Dono', arquivos: [{ nome: 'g.txt', conteudo: WA + '\n12/10/2026 14:09 - Joao: tambem quero o preço' }] }, cookies: true });
    assert.equal(g.json.ingestao.novas, 0); assert.equal(g.json.ignoradas_grupo, 1);
  });

  await t('assuntos do assinante: palavras dele viram assunto próprio; vazio/errado é recusado', async () => {
    assert.equal((await req('PUT', '/crm/api/app/captura/assuntos', { corpo: { assuntos: [{ rotulo: 'Reforma', palavras: 'ab' }] }, cookies: true })).st, 400);
    const p = await req('PUT', '/crm/api/app/captura/assuntos', { corpo: { assuntos: [{ rotulo: 'Reforma de casa', palavras: 'reforma, pintura, piso' }] }, cookies: true });
    assert.equal(p.st, 200, p.texto); assert.equal(p.json.assuntos[0].id, 'c-reforma-de-casa');
    const txt = ['13/10/2026 09:00 - Carlos Lima: Bom dia, preciso de orçamento para reforma da casa', '13/10/2026 09:10 - Beta Dono: Bom dia! Qual o tamanho?', '13/10/2026 09:12 - Carlos Lima: Reforma completa e pintura, uns 200m2'].join('\n');
    const r = await req('POST', '/crm/api/app/captura/interna/importar', { corpo: { area: 'whatsapp', eu: 'Beta Dono', arquivos: [{ nome: 'c.txt', conteudo: txt }] }, cookies: true });
    assert.equal(r.json.ingestao.novas, 1, r.texto);
    const l = (await req('GET', '/crm/api/app/conversas?status=sugerido', { cookies: true })).json.conversas.find((x) => x.nome === 'Carlos Lima');
    assert.equal(l.assunto, 'c-reforma-de-casa'); assert.equal(l.assunto_rotulo, 'Reforma de casa');
    const rs = (await req('GET', '/crm/api/app/conversas/resumo', { cookies: true })).json.assuntos;
    assert.ok(rs.some((a) => a.rotulo === 'Reforma de casa'));
    // aprovar vira contato só aí
    const d = await req('POST', `/crm/api/app/conversas/${l.id}/decidir`, { corpo: { acao: 'lead' }, cookies: true });
    assert.equal(d.st, 200, d.texto);
    await req('PUT', '/crm/api/app/captura/assuntos', { corpo: { assuntos: [] }, cookies: true });
  });

  await t('importar e-mail (.mbox): só conversa com resposta, automático ignorado, texto não guardado', async () => {
    const mbox = [
      'From a@b Mon Oct 13 10:00:00 2026', 'From: Ana Prado <ana@cliente.com>', 'To: dono@beta.br', 'Subject: Orçamento do plano', 'Date: Tue, 13 Oct 2026 10:00:00 -0300', '', 'Olá, quanto custa o plano anual? Segredo-do-texto-123', '',
      'From a@b Mon Oct 13 10:30:00 2026', 'From: Beta <dono@beta.br>', 'To: ana@cliente.com', 'Subject: Re: Orçamento do plano', 'Date: Tue, 13 Oct 2026 10:30:00 -0300', '', 'Claro, segue a proposta.', '',
      'From a@b Mon Oct 13 11:00:00 2026', 'From: Ana Prado <ana@cliente.com>', 'To: dono@beta.br', 'Subject: Re: Orçamento do plano', 'Date: Tue, 13 Oct 2026 11:00:00 -0300', '', 'Pode mandar a proposta, tenho interesse e quero contratar.', '',
      'From a@b Mon Oct 13 12:00:00 2026', 'From: Promo <no-reply@loja.com>', 'To: dono@beta.br', 'Subject: Cupom oferta imperdível', 'Date: Tue, 13 Oct 2026 12:00:00 -0300', '', 'compre agora com desconto de 50%', '',
    ].join('\n');
    const sem = await req('POST', '/crm/api/app/captura/interna/importar', { corpo: { area: 'email', arquivos: [{ nome: 'Todos.mbox', conteudo: mbox }] }, cookies: true });
    assert.equal(sem.json.precisa_eu, true);
    const r = await req('POST', '/crm/api/app/captura/interna/importar', { corpo: { area: 'email', eu: 'dono@beta.br', arquivos: [{ nome: 'Todos.mbox', conteudo: mbox }] }, cookies: true });
    assert.equal(r.st, 200, r.texto); assert.equal(r.json.ingestao.novas, 1); assert.equal(r.json.ignoradas_automaticos, 1);
    const c = dbm.prepare("SELECT * FROM crm_conversas WHERE canal = 'email'").get();
    assert.equal(c.identificador, 'ana@cliente.com'); assert.ok(!JSON.stringify(c).includes('Segredo-do-texto-123'));
    assert.equal((await req('POST', '/crm/api/app/captura/interna/importar', { corpo: { area: 'email', eu: 'dono@beta.br', arquivos: [{ nome: 'x.mbox', conteudo: 'isto não é e-mail' }] }, cookies: true })).st, 400);
  });

  await t('importar Instagram/Facebook (JSON), LinkedIn (CSV) e TikTok: formatos lidos; estrutura desconhecida é recusada sem gravar', async () => {
    const meta = JSON.stringify({ participants: [{ name: 'Beta Dono' }, { name: 'Paula Reis' }], messages: [
      { sender_name: 'Paula Reis', timestamp_ms: Date.parse('2026-10-14T10:00:00Z'), content: 'Oi! Quanto custa o plano? Quero um orçamento' },
      { sender_name: 'Beta Dono', timestamp_ms: Date.parse('2026-10-14T10:05:00Z'), content: 'Te mando a proposta' },
      { sender_name: 'Paula Reis', timestamp_ms: Date.parse('2026-10-14T10:09:00Z'), content: 'Pode mandar a proposta, tenho interesse' }] });
    const ig = await req('POST', '/crm/api/app/captura/interna/importar', { corpo: { area: 'instagram', eu: 'Beta Dono', arquivos: [{ nome: 'messages/inbox/paula_123/message_1.json', conteudo: meta }] }, cookies: true });
    assert.equal(ig.st, 200, ig.texto); assert.equal(ig.json.ingestao.novas, 1);
    assert.ok(dbm.prepare("SELECT 1 FROM crm_conversas WHERE canal = 'instagram' AND identificador = 'nome:paula reis'").get());
    assert.equal((await req('POST', '/crm/api/app/captura/interna/importar', { corpo: { area: 'instagram', arquivos: [{ nome: 'x.json', conteudo: '{}' }] }, cookies: true })).st, 400);
    const csvTxt = 'CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT,FOLDER\n' +
      'c1,,Rui Alves,https://www.linkedin.com/in/rui-alves,Beta Dono,https://www.linkedin.com/in/beta,2026-10-15 09:00:00 UTC,,Quanto custa o plano? Preciso de orçamento,INBOX\n' +
      'c1,,Beta Dono,https://www.linkedin.com/in/beta,Rui Alves,https://www.linkedin.com/in/rui-alves,2026-10-15 09:10:00 UTC,,Mando a proposta,SENT\n' +
      'c1,,Rui Alves,https://www.linkedin.com/in/rui-alves,Beta Dono,https://www.linkedin.com/in/beta,2026-10-15 09:20:00 UTC,,Pode mandar a proposta tenho interesse,INBOX\n';
    const li = await req('POST', '/crm/api/app/captura/interna/importar', { corpo: { area: 'linkedin', eu: 'Beta Dono', arquivos: [{ nome: 'messages.csv', conteudo: csvTxt }] }, cookies: true });
    assert.equal(li.st, 200, li.texto); assert.equal(li.json.ingestao.novas, 1);
    const tk = await req('POST', '/crm/api/app/captura/interna/importar', { corpo: { area: 'tiktok', arquivos: [{ nome: 'u.json', conteudo: '{"Profile":{}}' }] }, cookies: true });
    assert.equal(tk.st, 400); assert.match(tk.json.erro, /não reconhecida/);
    assert.equal((await req('POST', '/crm/api/app/captura/interna/importar', { corpo: { area: 'telegram', arquivos: [{ nome: 'x', conteudo: 'x' }] }, cookies: true })).st, 400);
    assert.equal((await req('POST', '/crm/api/app/captura/interna/importar', { corpo: { area: 'whatsapp', arquivos: [] }, cookies: true })).st, 400);
  });

  await t('tela "Aumentar leads": 6 áreas, cada uma diz o que é automático, assistido e inviável', async () => {
    const v = (await req('GET', '/crm/api/app/captura', { cookies: true })).json;
    assert.deepEqual(v.areas.map((a) => a.id), ['whatsapp', 'email', 'instagram', 'facebook', 'tiktok', 'linkedin']);
    for (const a of v.areas) { assert.ok(a.fora.automatico && a.fora.inviavel && a.dentro.automatico && a.dentro.inviavel, a.id); }
    assert.match(v.areas.find((a) => a.id === 'instagram').dentro.inviavel, /ao vivo/);
    assert.match(v.areas.find((a) => a.id === 'whatsapp').fora.inviavel, /banir/);
    assert.ok(v.carteira && v.cofre && v.externa && v.ia);
    assert.ok(!JSON.stringify(v).includes(CHAVE_ANT) && !JSON.stringify(v).includes('PLATAFORMA'));
  });
  delete process.env.ANTHROPIC_API_KEY;

  // =====================================================================
  // FASES B e C: IMAP (somente leitura), CNPJ aberto, WhatsApp Business oficial (só recebimento).
  // Servidor IMAP, BrasilAPI e Meta SIMULADOS: nenhuma conexão externa.
  // =====================================================================
  const CaixaImap = require('./captura-imap'); const CnpjMod = require('./cnpj'); const WAMod = require('./whatsapp-business');
  const { EventEmitter } = require('events'); const cripto = require('crypto');
  const SENHA_APP = 'abcdwxyzefghijkl'; const USUARIO_IMAP = 'dono@gmail.com';
  const comandosImap = [];
  const conectarFalso = () => {
    const sock = new EventEmitter(); sock.setTimeout = () => {}; sock.end = () => {};
    const emite = (txt) => setImmediate(() => sock.emit('data', Buffer.from(txt, 'latin1')));
    const MSGS = {
      1: [['From: Ana Prado <ana@cliente.com>', 'To: ' + USUARIO_IMAP, 'Subject: Orcamento do plano', 'Date: Tue, 13 Oct 2026 10:00:00 -0300'].join('\r\n') + '\r\n\r\n', '1', 'Ola, quanto custa o plano anual? SEGREDO-DO-CORPO-777\r\n'],
      2: [['From: Dono <' + USUARIO_IMAP + '>', 'To: ana@cliente.com', 'Subject: Re: Orcamento do plano', 'Date: Tue, 13 Oct 2026 10:30:00 -0300'].join('\r\n') + '\r\n\r\n', '2', 'Segue a proposta.\r\n'],
      3: [['From: Ana Prado <ana@cliente.com>', 'To: ' + USUARIO_IMAP, 'Subject: Re: Orcamento do plano', 'Date: Tue, 13 Oct 2026 11:00:00 -0300'].join('\r\n') + '\r\n\r\n', '3', 'Pode mandar a proposta, tenho interesse e quero contratar.\r\n'],
      4: [['From: Loja <promo@loja.com>', 'To: ' + USUARIO_IMAP, 'Subject: Cupom oferta', 'List-Unsubscribe: <mailto:sair@loja.com>', 'Date: Tue, 13 Oct 2026 12:00:00 -0300'].join('\r\n') + '\r\n\r\n', '4', 'compre agora com desconto de 50%\r\n'],
    };
    emite('* OK ready\r\n');
    sock.write = (linha) => {
      const m = String(linha).trim().match(/^(a\d+) (.*)$/); const tag = m[1], c = m[2]; comandosImap.push(c);
      if (/^LOGIN/.test(c)) return emite(c.includes(SENHA_APP) ? `${tag} OK logado\r\n` : `${tag} NO [AUTHENTICATIONFAILED] invalido\r\n`);
      if (/^LIST/.test(c)) return emite(`* LIST (\\HasNoChildren \\All) "/" "[Gmail]/All Mail"\r\n${tag} OK\r\n`);
      if (/^EXAMINE/.test(c)) return emite(`* 4 EXISTS\r\n${tag} OK [READ-ONLY] ok\r\n`);
      if (/^UID SEARCH/.test(c)) return emite(`* SEARCH 1 2 3 4\r\n${tag} OK\r\n`);
      if (/^UID FETCH/.test(c)) { const n = Number(c.match(/^UID FETCH (\d+)/)[1]); const [h, , t] = MSGS[n]; return emite(`* ${n} FETCH (UID ${n} BODY[HEADER.FIELDS (FROM)] {${h.length}}\r\n${h} BODY[TEXT]<0> {${t.length}}\r\n${t})\r\n${tag} OK\r\n`); }
      if (/^LOGOUT/.test(c)) return emite(`* BYE\r\n${tag} OK\r\n`);
      emite(`${tag} BAD comando inesperado\r\n`);
    };
    return sock;
  };

  await t('IMAP: senha de app vai ao cofre sem eco; validações; chave genérica não aceita a credencial', async () => {
    assert.equal((await req('PUT', '/crm/api/app/captura/imap', { corpo: { provedor: 'servidor-do-vizinho', usuario: USUARIO_IMAP, senha: SENHA_APP }, cookies: true })).st, 400, 'provedor fora da lista fechada');
    assert.equal((await req('PUT', '/crm/api/app/captura/imap', { corpo: { provedor: 'gmail', usuario: 'nao-e-email', senha: SENHA_APP }, cookies: true })).st, 400);
    assert.equal((await req('PUT', '/crm/api/app/captura/imap', { corpo: { provedor: 'gmail', usuario: USUARIO_IMAP, senha: 'curta' }, cookies: true })).st, 400);
    const r = await req('PUT', '/crm/api/app/captura/imap', { corpo: { provedor: 'gmail', usuario: USUARIO_IMAP, senha: 'abcd wxyz efgh ijkl' }, cookies: true });
    assert.equal(r.st, 200, r.texto); assert.equal(r.json.cadastrada, true); assert.ok(!r.texto.includes(SENHA_APP));
    const v = await req('GET', '/crm/api/app/captura', { cookies: true });
    assert.ok(!v.texto.includes(SENHA_APP) && !v.texto.includes(Buffer.from(SENHA_APP).toString('base64').slice(0, 12)), 'a tela não recebe a senha');
    assert.equal(v.json.cofre.chaves.find((c) => c.nome === 'imap').final, '••••••••', 'nem os 4 últimos caracteres');
    assert.equal(v.json.cofre.tipos.some((x) => ['imap', 'wa_secret'].includes(x.id)), false, 'esta credencial tem tela própria');
    assert.equal((await req('PUT', '/crm/api/app/captura/chaves/imap', { corpo: { valor: Buffer.from('x'.repeat(40)).toString('base64') }, cookies: true })).st, 400);
    const bruto = dbm.prepare("SELECT * FROM crm_segredos WHERE nome = 'imap'").get();
    assert.ok(!JSON.stringify(bruto).includes(SENHA_APP));
  });

  await t('IMAP: testar login (senha errada recusada sem eco) e leitura SOMENTE LEITURA classifica e descarta o texto', async () => {
    const tid = await tidDoTenant();
    assert.deepEqual(await CaixaImap.testar(tid, { conectar: conectarFalso }), { ok: true });
    comandosImap.length = 0;
    CaixaImap.guardar(tid, { provedor: 'gmail', usuario: USUARIO_IMAP, senha: 'senhaerrada1234' });
    const ruim = await CaixaImap.testar(tid, { conectar: conectarFalso });
    assert.equal(ruim.ok, false); assert.match(ruim.motivo, /SENHA DE APLICATIVO/); assert.ok(!ruim.motivo.includes('senhaerrada1234'));
    CaixaImap.guardar(tid, { provedor: 'gmail', usuario: USUARIO_IMAP, senha: SENHA_APP });
    comandosImap.length = 0;
    CaixaImap.iniciar(tid, { dias: 30 }, { conectar: conectarFalso });
    await assert.rejects(async () => CaixaImap.iniciar(tid, {}, { conectar: conectarFalso }), /em andamento/);
    await CaixaImap.aguardar(tid);
    const st = CaixaImap.estado(tid).trabalho;
    assert.equal(st.estado, 'pronto', JSON.stringify(st)); assert.equal(st.resultado.lidas, 4); assert.equal(st.resultado.conversas_com_assunto, 1);
    assert.equal(st.resultado.ignoradas_automaticos, 1, 'newsletter (List-Unsubscribe) ignorada');
    // SOMENTE LEITURA: examina, espia, nunca altera
    const todos = comandosImap.join('\n');
    assert.match(todos, /EXAMINE/); assert.ok(!/SELECT|STORE|EXPUNGE|DELETE|COPY|APPEND|MOVE/i.test(todos.replace(/UID SEARCH/g, '')), 'nenhum comando que altere a caixa');
    assert.ok(comandosImap.filter((c) => /^UID FETCH/.test(c)).every((c) => /BODY\.PEEK/.test(c) && !/BODY\[/.test(c.replace(/BODY\.PEEK\[/g, ''))), 'só PEEK (não marca como lido)');
    const c = dbm.prepare("SELECT * FROM crm_conversas WHERE canal = 'email' AND identificador = 'ana@cliente.com'").get();
    assert.ok(c && c.status === 'sugerido' && c.fonte === 'imap:email');
    assert.ok(!JSON.stringify(c).includes('SEGREDO-DO-CORPO-777'), 'texto do e-mail não é guardado');
    assert.ok(!JSON.stringify(CaixaImap.estado(tid)).includes('SEGREDO-DO-CORPO-777') && !JSON.stringify(CaixaImap.estado(tid)).includes(SENHA_APP), 'nem no estado do trabalho');
  });

  // ---- CNPJ aberto ----
  const CNPJ_A = '11222333000181';
  const gerarCnpj = (n) => { const dv = (b) => { let p = b.length - 7, soma = 0; for (let i = 0; i < b.length; i++) { soma += Number(b[i]) * p--; if (p < 2) p = 9; } const r = soma % 11; return r < 2 ? 0 : 11 - r; }; const b = String(10000000 + n).padStart(8, '0') + '0001'; const d1 = dv(b); return b + d1 + dv(b + d1); };
  const BASE_CNPJ = (c, o) => ({ cnpj: c, razao_social: 'EMPRESA ' + c + ' LTDA', nome_fantasia: 'Fantasia ' + c, descricao_situacao_cadastral: 'ATIVA', cnae_fiscal: 8630503, cnae_fiscal_descricao: 'Atividade médica ambulatorial', municipio: 'BRASILIA', uf: 'DF', ddd_telefone_1: '61999990002', email: 'contato' + c + '@empresa.com.br', opcao_pelo_mei: false, natureza_juridica: 'Sociedade Empresária Limitada', codigo_natureza_juridica: 2062, ...o });
  const gerados = [CNPJ_A, gerarCnpj(2), gerarCnpj(3), gerarCnpj(4)];
  const chamadasBrasil = [];
  CnpjMod.trocarTransporte(async (url) => {
    const c = url.split('/').pop(); chamadasBrasil.push(c);
    const resp = (st, corpo) => ({ ok: st === 200, status: st, json: async () => corpo });
    if (c === gerados[0]) return resp(200, BASE_CNPJ(c));
    if (c === gerados[1]) return resp(200, BASE_CNPJ(c, { opcao_pelo_mei: true, natureza_juridica: 'Empresário (Individual)', codigo_natureza_juridica: 2135, email: 'dono.pessoal@gmail.com', ddd_telefone_1: '61988887777' }));
    if (c === gerados[2]) return resp(200, BASE_CNPJ(c, { descricao_situacao_cadastral: 'BAIXADA' }));
    if (c === gerados[3]) return resp(404, {});
    return resp(200, BASE_CNPJ(c));
  }, async () => {});
  await t('CNPJ aberto: lista com dígito verificador, limite por lista, MEI sem dado pessoal, baixada/inexistente fora, não duplica', async () => {
    assert.equal(CnpjMod.cnpjValido(CNPJ_A), true); assert.equal(CnpjMod.cnpjValido('11222333000182'), false, 'dígito errado'); assert.equal(CnpjMod.cnpjValido('00000000000000'), false);
    const l = CnpjMod.lerLista('11.222.333/0001-81\n11222333000181\n11.222.333/0001-82\nlixo');
    assert.deepEqual(l.validos, [CNPJ_A]); assert.equal(l.invalidos.length, 1);
    assert.equal((await req('POST', '/crm/api/app/captura/cnpj/importar', { corpo: { texto: 'nada aqui' }, cookies: true })).st, 400);
    const muitos = Array.from({ length: 151 }, (_, i) => gerarCnpj(100 + i)).join('\n');
    assert.equal((await req('POST', '/crm/api/app/captura/cnpj/importar', { corpo: { texto: muitos }, cookies: true })).st, 400, 'passa do máximo');
    assert.equal(chamadasBrasil.length, 0, 'recusar a lista não consulta a fonte');
    const r = await req('POST', '/crm/api/app/captura/cnpj/importar', { corpo: { texto: gerados.join('\n') }, cookies: true });
    assert.equal(r.st, 200, r.texto); assert.equal(r.json.total, 4);
    const tid = await tidDoTenant(); await CnpjMod.aguardar(tid);
    const st = CnpjMod.estado(tid).trabalho;
    assert.equal(st.estado, 'pronto', JSON.stringify(st)); assert.deepEqual({ n: st.resumo.novos, i: st.resumo.inativas, x: st.resumo.nao_encontradas, p: st.resumo.sem_dado_pessoal }, { n: 2, i: 1, x: 1, p: 1 });
    const ca = dbm.prepare("SELECT * FROM crm_contatos WHERE tenant_id = ? AND canal_entrada = 'cnpj-aberto' AND nome = ?").get(tid, 'Fantasia ' + CNPJ_A);
    assert.ok(ca && ca.origem === 'importacao' && /legitimo-interesse-b2b/.test(ca.consentimento) && !/"optIn":true/.test(ca.consentimento), 'sem consentimento, base legal registrada');
    const canaisA = require('./canais').doContato(tid, ca.id); assert.ok(canaisA.some((k) => k.canal === 'email' && k.fonte === 'cnpj-aberto'));
    const cb = dbm.prepare("SELECT * FROM crm_contatos WHERE tenant_id = ? AND canal_entrada = 'cnpj-aberto' AND nome = ?").get(tid, 'Fantasia ' + gerados[1]);
    assert.ok(cb, 'a empresa do MEI entra'); assert.equal(cb.email || '', ''); assert.equal(cb.telefone || '', ''); assert.equal(require('./canais').doContato(tid, cb.id).length, 0, 'sem e-mail/telefone do dono (dado pessoal)');
    assert.ok(!dbm.prepare("SELECT 1 FROM crm_contatos WHERE tenant_id = ? AND nome = ?").get(tid, 'Fantasia ' + gerados[2]), 'baixada não entra');
    // de novo: nada duplica
    const antes = dbm.prepare("SELECT COUNT(*) n FROM crm_contatos WHERE tenant_id = ?").get(tid).n;
    await req('POST', '/crm/api/app/captura/cnpj/importar', { corpo: { texto: gerados.join('\n') }, cookies: true }); await CnpjMod.aguardar(tid);
    assert.equal(dbm.prepare("SELECT COUNT(*) n FROM crm_contatos WHERE tenant_id = ?").get(tid).n, antes, 'repetir a lista não duplica contato');
    assert.equal(CnpjMod.estado(tid).trabalho.resumo.existentes, 2);
  });

  // ---- WhatsApp Business oficial ----
  const SEGREDO_META = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'; const PHONE_ID = '109876543210987';
  let wa = null;
  const msgWA = (id, de, texto, nome = 'Maria Cliente', phone = PHONE_ID) => ({ object: 'whatsapp_business_account', entry: [{ id: 'WABA1', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '5561999990000', phone_number_id: phone }, contacts: [{ wa_id: de, profile: { name: nome } }], messages: [{ from: de, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: texto } }] } }] }] });
  const postWA = async (corpo, { segredo = SEGREDO_META, token = wa && wa.token, assinar = true } = {}) => {
    const texto = JSON.stringify(corpo);
    const headers = assinar ? { 'x-hub-signature-256': 'sha256=' + cripto.createHmac('sha256', segredo).update(texto).digest('hex') } : {};
    return req('POST', `/crm/webhook/whatsapp/${token}`, { corpo, headers });
  };
  await t('WhatsApp Business: segredo no cofre, endereço do webhook, handshake da Meta só com o token certo', async () => {
    assert.equal((await req('PUT', '/crm/api/app/captura/whatsapp', { corpo: { phone_number_id: '', app_secret: SEGREDO_META }, cookies: true })).st, 400);
    assert.equal((await req('PUT', '/crm/api/app/captura/whatsapp', { corpo: { phone_number_id: PHONE_ID, app_secret: 'curto' }, cookies: true })).st, 400);
    const r = await req('PUT', '/crm/api/app/captura/whatsapp', { corpo: { phone_number_id: PHONE_ID, app_secret: SEGREDO_META }, cookies: true });
    assert.equal(r.st, 200, r.texto); assert.ok(!r.texto.includes(SEGREDO_META), 'o segredo não volta');
    assert.match(r.json.webhook_caminho, /^\/crm\/webhook\/whatsapp\/[0-9a-f]{32}$/);
    wa = { token: r.json.webhook_caminho.split('/').pop(), verify: r.json.verify_token };
    const v = await req('GET', '/crm/api/app/captura', { cookies: true });
    assert.ok(!v.texto.includes(SEGREDO_META)); assert.equal(v.json.whatsapp.configurada, true);
    // trocar o segredo mantém endereço e token (o assinante não reconfigura a Meta à toa)
    const r2 = await req('PUT', '/crm/api/app/captura/whatsapp', { corpo: { phone_number_id: PHONE_ID, app_secret: SEGREDO_META }, cookies: true });
    assert.equal(r2.json.webhook_caminho, r.json.webhook_caminho);
    const ok = await req('GET', `/crm/webhook/whatsapp/${wa.token}?hub.mode=subscribe&hub.verify_token=${wa.verify}&hub.challenge=DESAFIO123`);
    assert.equal(ok.st, 200); assert.equal(ok.texto, 'DESAFIO123');
    assert.equal((await req('GET', `/crm/webhook/whatsapp/${wa.token}?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=X`)).st, 403);
    assert.equal((await req('GET', `/crm/webhook/whatsapp/${'0'.repeat(32)}?hub.mode=subscribe&hub.verify_token=${wa.verify}&hub.challenge=X`)).st, 403, 'token de outro endereço');
  });

  await t('WhatsApp Business: só mensagem ASSINADA vale; texto não é guardado; vira sinal de lead só com intenção; reentrega não duplica', async () => {
    const tid = await tidDoTenant(); const NUM = '5561944443210';
    assert.equal((await postWA(msgWA('wamid.A1', NUM, 'Quanto custa o plano? Quero orçamento'), { assinar: false })).st, 401, 'sem assinatura');
    assert.equal((await postWA(msgWA('wamid.A1', NUM, 'Quanto custa o plano? Quero orçamento'), { segredo: 'segredo-errado-0123456789abcdef' })).st, 401, 'assinatura de outro segredo');
    assert.equal((await postWA(msgWA('wamid.A1', NUM, 'oi'), { token: '1'.repeat(32) })).st, 404, 'endereço desconhecido');
    assert.equal(dbm.prepare('SELECT COUNT(*) n FROM crm_wa_estado WHERE tenant_id = ?').get(tid).n, 0, 'nada gravado sem assinatura válida');
    // saudação sozinha: contador, mas ainda não é lead
    assert.equal((await postWA(msgWA('wamid.A0', NUM, 'Oi, bom dia!'))).st, 200);
    assert.equal(dbm.prepare("SELECT COUNT(*) n FROM crm_conversas WHERE canal = 'whatsapp' AND identificador = ?").get(NUM).n, 0, 'saudação não é lead');
    // intenção comercial: vira conversa sugerida
    assert.equal((await postWA(msgWA('wamid.A1', NUM, 'Quanto custa o plano? Preciso de um orçamento e proposta'))).st, 200);
    const c = dbm.prepare("SELECT * FROM crm_conversas WHERE canal = 'whatsapp' AND identificador = ?").get(NUM);
    assert.ok(c && c.status === 'sugerido' && c.assunto === 'geral' && c.fonte === 'whatsapp-business' && c.nome === 'Maria Cliente', JSON.stringify(c));
    const est = dbm.prepare('SELECT * FROM crm_wa_estado WHERE tenant_id = ? AND ident = ?').get(tid, NUM);
    assert.equal(est.deles, 2);
    for (const frase of ['Quanto custa o plano', 'Preciso de um', 'bom dia']) assert.ok(!(JSON.stringify(est) + JSON.stringify(c)).toLowerCase().includes(frase.toLowerCase()), 'texto não é guardado: ' + frase);
    // a Meta reentrega o mesmo wamid: não conta de novo
    await postWA(msgWA('wamid.A1', NUM, 'Quanto custa o plano? Preciso de um orçamento e proposta'));
    assert.equal(dbm.prepare('SELECT deles FROM crm_wa_estado WHERE tenant_id = ? AND ident = ?').get(tid, NUM).deles, 2);
    // número que não é deste assinante é ignorado
    await postWA(msgWA('wamid.B1', '5561911112222', 'Quanto custa o plano? orçamento proposta', 'X', '999000111222'));
    assert.equal(dbm.prepare('SELECT COUNT(*) n FROM crm_wa_estado WHERE tenant_id = ? AND ident = ?').get(tid, '5561911112222').n, 0);
  });

  await t('WhatsApp Business: "SAIR" marca o opt-out do canal; remover a credencial fecha a porta', async () => {
    const tid = await tidDoTenant();
    const ct = saas.appRepo.Contatos.criar(tid, { nome: 'Zé Opt', telefone: '61977776666', origem: 'manual' }, 'teste').contato;
    assert.ok(require('./canais').doContato(tid, ct.id).some((k) => k.canal === 'whatsapp' && !k.opt_out));
    assert.equal((await postWA(msgWA('wamid.S1', '5561977776666', 'SAIR', 'Zé Opt'))).st, 200);
    assert.ok(require('./canais').doContato(tid, ct.id).find((k) => k.canal === 'whatsapp').opt_out, 'opt-out gravado');
    assert.equal((await req('DELETE', '/crm/api/app/captura/whatsapp', { cookies: true })).st, 200);
    assert.equal((await postWA(msgWA('wamid.S2', '5561977776666', 'oi'))).st, 404, 'endereço desativado');
    assert.equal(CofreMod.tem(tid, 'wa_secret'), false);
  });

  await t('IA: pontuar lead e rascunhar mensagem — só dado público vai ao provedor; nota limitada; id inventado descartado', async () => {
    const tid = await tidDoTenant(); let corpoVisto = '';
    IAMod.trocarTransporte(async (url, init) => {
      corpoVisto = init.body;
      const tx = /Leads:/.test(init.body) ? '{"itens":[{"id":"L1","nota":250,"motivo":"ótimo encaixe"},{"id":"INVENTADO","nota":10,"motivo":"x"}]}' : '{"assunto":"Olá","texto":"Olá, {{nome}}! Podemos conversar? Se preferir não receber mais contato, é só avisar."}';
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: tx }], usage: { input_tokens: 300, output_tokens: 60 } }) };
    });
    const p = await IAMod.executar(tid, { tarefa: 'pontuar_lead', modo: 'propria', entrada: { perfil_ideal: 'Clínicas odontológicas de médio porte no Lago Sul', leads: [{ id: 'L1', nome: 'Clínica Sorriso', categoria: 'Dentista', cidade: 'Brasília', resumo: '', email: 'segredo@clinica.com', telefone: '61999990001' }] } });
    assert.deepEqual(p.resultado.itens, [{ id: 'L1', nota: 100, motivo: 'ótimo encaixe' }]);
    assert.ok(!corpoVisto.includes('segredo@clinica.com') && !corpoVisto.includes('61999990001'), 'nenhum e-mail/telefone vai ao provedor');
    assert.ok(corpoVisto.includes('Clínica Sorriso'));
    const m = await IAMod.executar(tid, { tarefa: 'rascunhar_mensagem', modo: 'propria', entrada: { oferta: 'Reformas residenciais com projeto e execução', canal: 'email' } });
    assert.match(m.resultado.texto, /\{\{nome\}\}/); assert.match(m.resultado.texto, /não receber/);
    assert.equal(m.uso.cobrado_milesimos, 0);
  });

  await t('Apify: tempo esgotado aproveita o que a execução já coletou; região que falha não derruba as outras', async () => {
    fontesMod.trocarTransporte(async (url) => {
      if (/run-sync/.test(url)) return { ok: false, status: 400, text: async () => '{"error":{"type":"run-failed","message":"Actor run did not succeed (run ID: g40BLhgUW7mjvlBlA, status: TIMED-OUT)."}}', json: async () => ({}) };
      if (/actor-runs\/g40BLhgUW7mjvlBlA/.test(url)) return { ok: true, status: 200, json: async () => ({ data: { defaultDatasetId: 'DS9' } }), text: async () => '' };
      if (/datasets\/DS9\/items/.test(url)) return { ok: true, status: 200, json: async () => itensApify, text: async () => '' };
      return { ok: false, status: 404, text: async () => 'x', json: async () => ({}) };
    });
    const lista = await fontesMod.fonte('apify').buscar({ termos: ['x'], max_resultados: 5, local_texto: 'Asa Sul' }, { token: 'apify_api_tokenqualquer1234' });
    assert.equal(lista.length, 2); assert.equal(lista.parcial, true, 'marcado como parcial');
    fontesMod.trocarTransporte(async () => ({ ok: false, status: 400, text: async () => 'outro erro qualquer', json: async () => ({}) }));
    await assert.rejects(() => fontesMod.fonte('apify').buscar({ termos: ['x'], max_resultados: 5, local_texto: 'Asa Sul' }, { token: 'apify_api_tokenqualquer1234' }), /Apify respondeu 400/);
    fontesMod.trocarTransporte();
    // varredura em 3 regiões: a do meio falha, as outras entram, o motivo fica registrado
    const tid = await tidDoTenant();
    const b = buscasMod.criar(tid, { termos: ['tecnologia'], locais: ['Asa Sul, Brasília - DF', 'Asa Norte, Brasília - DF', 'Sudoeste, Brasília - DF'], max_resultados: 5, frequencia_dias: 30, nome: 'Tecnologia no DF' });
    buscasMod.aprovar(tid, b.id, { aceite: true, por: 'teste' });
    const prov = { async buscar(q) {
      if (q.local_texto.startsWith('Asa Norte')) throw new Error('Apify respondeu 400: Actor run did not succeed (status: TIMED-OUT)');
      const k = q.local_texto.slice(0, 4);
      return [{ place_id: 'T-' + k, nome: 'Tech ' + k, categoria: 'Software', endereco: 'x', cidade: 'Brasília', estado: 'DF', telefone: '', site: '' }];
    } };
    const r = await buscasMod.executar(tid, b.id, { provedor: prov, obter: obterFake });
    assert.equal(r.lugares, 2, 'Asa Sul e Sudoeste entraram'); assert.equal(r.novos, 2);
    assert.match(r.erro, /Asa Norte/); assert.ok(!/Asa Sul|Sudoeste/.test(r.erro));
    const ex = buscasMod.execucoes(tid, b.id)[0]; assert.equal(ex.status, 'ok'); assert.match(ex.erro, /Asa Norte/);
  });

  await t('busca: lista colada com marcadores e comentários vira categorias limpas', async () => {
    const tid = await tidDoTenant();
    const colado = 'escritório de advocacia\n\n* escritório de contabilidade\n* escritório de arquitetura\n- consultoria empresarial\n1) corretora de seguros\n• agência de publicidade\n* clínica (se quiser profissional liberal de saúde)\nescritório de advocacia';
    const b = buscasMod.criar(tid, { termos: colado, locais: 'Lago Sul, Brasília - DF', max_resultados: 20, frequencia_dias: 30, nome: 'Lista colada' });
    assert.deepEqual(b.termos, ['escritório de advocacia', 'escritório de contabilidade', 'escritório de arquitetura', 'consultoria empresarial', 'corretora de seguros', 'agência de publicidade', 'clínica']);
    assert.equal(b.custo.lugares_max, 7 * 20, 'cada categoria × região × máximo');
  });

  await t('busca: teto mensal esgotado avisa na hora (400) em vez de falhar em silêncio; falha antes da varredura vira execução com erro', async () => {
    const tid = await tidDoTenant();
    const b = buscasMod.criar(tid, { termos: ['empresa de formaturas'], locais: ['DF'], max_resultados: 10, frequencia_dias: 30, nome: 'Formaturas teto' });
    await req('POST', `/crm/api/app/buscas/${b.id}/aprovar`, { corpo: { aceite: true }, cookies: true });
    const antes = process.env.CRM_BUSCA_TETO_LUGARES_MES; process.env.CRM_BUSCA_TETO_LUGARES_MES = '1';
    try {
      const r = await req('POST', `/crm/api/app/buscas/${b.id}/rodar`, { cookies: true });
      assert.equal(r.st, 400); assert.match(r.json.erro, /Teto mensal de 1 lugares atingido/); assert.match(r.json.erro, /CRM_BUSCA_TETO_LUGARES_MES/);
    } finally { if (antes === undefined) delete process.env.CRM_BUSCA_TETO_LUGARES_MES; else process.env.CRM_BUSCA_TETO_LUGARES_MES = antes; }
    buscasMod.registrarFalha(tid, b.id, 'Apify respondeu 402 com apify_api_SEGREDOSEGREDO123 no texto');
    const ex = buscasMod.execucoes(tid, b.id)[0];
    assert.equal(ex.status, 'erro'); assert.match(ex.erro, /Apify respondeu 402/); assert.ok(!ex.erro.includes('SEGREDOSEGREDO123'), 'sem token no registro');
  });

  await t('enriquecimento: extrai e-mail/wa.me/perfis, filtra lixo e bloqueia rede interna', async () => {
    const x = enriqMod.extrair('<a href="mailto:vendas@loja.com.br?subject=oi">x</a> teste@sentry.io foto@2x.png ana&#64;loja.com.br <a href="https://api.whatsapp.com/send?phone=5561999991111&text=oi">w</a> <a href="https://facebook.com/sharer/sharer.php?u=1">s</a> <a href="https://facebook.com/lojinha.oficial">f</a>', 'loja.com.br');
    assert.deepEqual(x.emails, ['vendas@loja.com.br', 'ana@loja.com.br']);
    assert.deepEqual(x.whatsapps, ['5561999991111']); assert.deepEqual(x.redes, { facebook: 'lojinha.oficial' });
    const interno = await enriqMod.enriquecerSite('http://169.254.169.254/latest/meta-data/');
    assert.ok(interno.erro && !interno.emails.length, 'SSRF recusado');
    const local = await enriqMod.enriquecerSite('http://localhost:10000/staff');
    assert.ok(local.erro);
    assert.ok((await enriqMod.enriquecerSite('')).vazio);
  });

  await t('fonte Apify: monta o pedido sem enriquecimento pago, usa token por header e descarta fechados', async () => {
    const vistos = [];
    fontesMod.trocarTransporte(async (url, init) => { vistos.push({ url, init }); return { ok: true, status: 200, json: async () => ([
      { placeId: 'A1', title: 'Padaria A', categoryName: 'Padaria', address: 'Rua 1', city: 'Brasília', state: 'DF', phoneUnformatted: '+556133334444', website: 'https://padaria.example.br', location: { lat: -15.8, lng: -47.9 } },
      { placeId: 'A2', title: 'Fechada', permanentlyClosed: true },
      { title: 'Sem id' },
    ]) }; });
    process.env.APIFY_TOKEN = 'token-de-teste';
    try {
      const out = await fontesMod.fonte('apify').buscar({ termo: 'padaria', local_texto: '', lat: -15.8, lng: -47.9, raio_m: 2000, max_resultados: 30 });
      assert.equal(out.length, 1); assert.equal(out[0].place_id, 'A1'); assert.equal(out[0].lat, -15.8);
      const v = vistos[0]; const corpo = JSON.parse(v.init.body);
      assert.ok(v.url.startsWith('https://api.apify.com/v2/acts/') && !/token=/.test(v.url), 'token nunca na URL');
      assert.equal(v.init.headers.Authorization, 'Bearer token-de-teste');
      assert.equal(corpo.scrapeContacts, false); assert.deepEqual(corpo.searchStringsArray, ['padaria']);
      assert.equal(corpo.maxCrawledPlacesPerSearch, 30); assert.equal(corpo.customGeolocation.radiusKm, 2);
    } finally { delete process.env.APIFY_TOKEN; fontesMod.trocarTransporte(); }
    fontesMod.trocarTransporte(async () => ({ ok: false, status: 402, text: async () => 'limit' }));
    process.env.APIFY_TOKEN = 'x';
    try { await assert.rejects(() => fontesMod.fonte('apify').buscar({ termo: 'a', local_texto: 'DF', max_resultados: 5 }), /402/); }
    finally { delete process.env.APIFY_TOKEN; fontesMod.trocarTransporte(); }
    const e = fontesMod.estimarCusto({ max_resultados: 1000, frequencia_dias: 7 });
    assert.equal(e.usd, 1.5); assert.ok(e.por_mes_centavos > e.brl_centavos);
  });

  // ---- conversas: classificador (assunto + razão da última conversa) ----
  await t('classificador: assunto principal, razão da última conversa e temperatura', async () => {
    const { classificarConversa } = require('./conversas-classificador');
    const agora = Date.parse('2026-11-06T12:00:00Z');
    const h = (n) => new Date(agora - n * 3600000).toISOString();
    // conversa de orçamento de evento, ela escreveu por último, 2 dias atrás
    const a = classificarConversa({ agora, mensagens: [
      { t: h(24 * 40), deMim: false, texto: 'Oi! Queria saber sobre a casa para uma confraternização da empresa, somos 30 pessoas' },
      { t: h(24 * 40 - 1), deMim: true, texto: 'Olá! A Gran Villela comporta 37 pessoas. Qual a data?' },
      { t: h(50), deMim: false, texto: 'Dia 12 de dezembro. Quanto custa o aluguel da casa?' },
    ] });
    assert.equal(a.assunto, 'evento'); assert.equal(a.razao, 'orcamento'); assert.equal(a.situacao, 'aguardando_nos');
    assert.equal(a.qualificacao, 'quente'); assert.equal(a.dias_parado, 2); assert.equal(a.total, 3);
    assert.ok(a.evidencias.length && a.comercial);
    // a "última conversa" é só a rajada final: o orçamento antigo não conta quando a última foi sobre pagamento
    const b = classificarConversa({ agora, mensagens: [
      { t: h(24 * 60), deMim: false, texto: 'Qual o valor da diária da casa?' },
      { t: h(24 * 60 - 1), deMim: true, texto: 'R$ 2.000 a diária' },
      { t: h(3), deMim: false, texto: 'Fiz o pix, segue o comprovante da reserva' },
      { t: h(2), deMim: true, texto: 'Recebido, reserva confirmada!' },
    ] });
    assert.equal(b.assunto, 'hospedagem'); assert.equal(b.razao, 'pagamento'); assert.equal(b.qualificacao, 'cliente'); assert.equal(b.situacao, 'aguardando_eles');
    // conversa pessoal sem assunto comercial não vira lead; propaganda também não
    const c = classificarConversa({ agora, mensagens: [{ t: h(5), deMim: false, texto: 'Bom dia! Tudo bem com você?' }, { t: h(4), deMim: true, texto: 'Tudo ótimo, e a família?' }] });
    assert.equal(c.comercial, false); assert.equal(c.assunto, '');
    const d = classificarConversa({ agora, mensagens: [{ t: h(5), deMim: false, texto: 'Oferta imperdível! Use o cupom e compre agora' }, { t: h(4), deMim: false, texto: 'Promoção relâmpago, clique aqui, cupom de desconto de 20%' }] });
    assert.equal(d.ruido, true); assert.equal(d.comercial, false);
    // morno/frio pelo tempo; perdido pela razão
    const e = classificarConversa({ agora, mensagens: [{ t: h(24 * 300), deMim: false, texto: 'Qual o valor da hospedagem?' }, { t: h(24 * 300 - 1), deMim: true, texto: 'R$ 900' }] });
    assert.equal(e.qualificacao, 'frio');
    const f = classificarConversa({ agora, mensagens: [{ t: h(30), deMim: false, texto: 'Valor da diária da casa?' }, { t: h(29), deMim: true, texto: 'R$ 900' }, { t: h(28), deMim: false, texto: 'Obrigado, mas não tenho interesse' }] });
    assert.equal(f.qualificacao, 'perdido');
    assert.equal(classificarConversa({ mensagens: [] }), null);
  });
  await t('conversas: ingestão só guarda metadado, aprovação vira lead e segmenta campanha', async () => {
    const Conversas = require('./conversas');
    const tidBeta = require('./db').db.prepare("SELECT id FROM tenants WHERE nome LIKE 'Pousada Beta%'").get().id;
    const ontem = new Date(Date.now() - 86400000).toISOString();
    const velha = new Date(Date.now() - 200 * 86400000).toISOString();
    // contato que já existe → entra como lead direto
    const ja = await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'Já Cliente', telefone: '61 97777-0001' }, cookies: true });
    const item = (o) => ({ canal: 'whatsapp', assunto: 'evento', razao: 'orcamento', razao_rotulo: 'Pediu orçamento / preço', situacao: 'aguardando_nos', qualificacao: 'quente', confianca: 0.7, evidencias: ['festa'], total: 5, minhas: 2, deles: 3, primeira_em: velha, ultima_em: ontem, ultima_de_mim: false, ...o });
    const r = Conversas.ingerir(tidBeta, [
      item({ identificador: '61977770001', nome: 'Já Cliente' }),
      item({ identificador: '61977770002', nome: 'Desconhecida Um', texto: 'SEGREDO DA CONVERSA', conteudo: 'mensagem privada' }),
      item({ identificador: '61977770003', nome: 'Desconhecido Dois', assunto: 'curso', ultima_em: velha, qualificacao: 'frio' }),
      item({ canal: 'instagram', identificador: '', nome: 'Pessoa Do Insta' }),       // export sem perfil → 'nome:'
      item({ identificador: '61977770004', assunto: 'inexistente' }),                  // sem assunto válido → ignorada
      item({ identificador: 'lixo' }),                                                 // identificador inválido → ignorada
    ]);
    assert.equal(r.novas, 4); assert.equal(r.ignoradas, 2); assert.equal(r.vinculadas, 1);
    // privacidade: nenhum texto de mensagem chega ao banco
    const bruto = JSON.stringify(require('./db').db.prepare('SELECT * FROM crm_conversas').all());
    assert.ok(!bruto.includes('SEGREDO DA CONVERSA') && !bruto.includes('mensagem privada'));
    // listar/resumo
    const lst = (await req('GET', '/crm/api/app/conversas?assunto=evento', { cookies: true })).json.conversas;
    assert.equal(lst.length, 3); assert.equal(lst.find(x => x.nome === 'Já Cliente').status, 'lead');
    assert.equal(lst.find(x => x.nome === 'Desconhecida Um').status, 'sugerido');
    const res = (await req('GET', '/crm/api/app/conversas/resumo', { cookies: true })).json.assuntos;
    assert.ok(res.find(a => a.assunto === 'evento').total === 3 && res.find(a => a.assunto === 'curso').total === 1);
    // reenvio atualiza, não duplica; decisão do Augusto é preservada
    const um = lst.find(x => x.nome === 'Desconhecida Um');
    const dec = await req('POST', `/crm/api/app/conversas/${um.id}/decidir`, { corpo: { acao: 'lead' }, cookies: true });
    assert.equal(dec.st, 200); assert.ok(dec.json.contato_id);
    const r2 = Conversas.ingerir(tidBeta, [item({ identificador: '61977770002', nome: 'Desconhecida Um', total: 9 })]);
    assert.equal(r2.novas, 0); assert.equal(r2.atualizadas, 1);
    const um2 = (await req('GET', '/crm/api/app/conversas?busca=Desconhecida', { cookies: true })).json.conversas[0];
    assert.equal(um2.status, 'lead'); assert.equal(um2.total, 9);
    const fc = (await req('GET', '/crm/api/app/contatos/' + dec.json.contato_id, { cookies: true })).json.contato;
    assert.ok(fc.tags.includes('conversa-evento')); assert.ok(fc.canais.some(k => k.canal === 'whatsapp' && k.identificador === '5561977770002'));
    // descartar some da lista padrão
    const dois = (await req('GET', '/crm/api/app/conversas?busca=Dois', { cookies: true })).json.conversas[0];
    await req('POST', `/crm/api/app/conversas/${dois.id}/decidir`, { corpo: { acao: 'descartar' }, cookies: true });
    assert.equal((await req('GET', '/crm/api/app/conversas?busca=Dois', { cookies: true })).json.conversas.length, 0);
    assert.equal((await req('POST', `/crm/api/app/conversas/${dois.id}/decidir`, { corpo: { acao: 'x' }, cookies: true })).st, 400);
    // SEGMENTO de campanha por assunto + há quanto tempo foi a conversa (só quem foi aprovado como lead)
    saas.repo.salvarSettings(await tidDoTenant(), { limites_over: { campanhas_mes: 999 } });
    const camp = await req('POST', '/crm/api/app/campanhas', { corpo: { nome: 'Evento fim de ano', canais: ['whatsapp'], segmento: { assunto: 'evento', conversa_dias_max: 30 }, mensagem: 'Oi {{nome}}' }, cookies: true });
    assert.equal(camp.st, 200); assert.equal(camp.json.alvos, 2); // Já Cliente + Desconhecida Um (aprovados, conversa recente)
    const velhas = await req('POST', '/crm/api/app/campanhas', { corpo: { nome: 'Reativar quem sumiu', canais: ['whatsapp'], segmento: { assunto: 'evento', conversa_dias_min: 90 } }, cookies: true });
    assert.equal(velhas.st, 400); // nenhuma conversa de evento tem mais de 90 dias
    saas.repo.salvarSettings(await tidDoTenant(), { limites_over: {} });
    // LGPD: excluir o contato leva a conversa junto
    await req('DELETE', '/crm/api/app/contatos/' + dec.json.contato_id, { cookies: true });
    assert.equal((await req('GET', '/crm/api/app/conversas?busca=Desconhecida', { cookies: true })).json.conversas.length, 0);
  });

  // ---- agentes (IA por regras, com log) ----
  await t('agente de qualificação sugere e registra log', async () => {
    // trial tem ia liberada
    const r = await req('POST', '/crm/api/app/ia/qualificar/' + leadId, { cookies: true });
    assert.equal(r.st, 200); assert.ok(r.json.perfil && r.json.proxima_acao && r.json.log_id);
    const logs = await req('GET', '/crm/api/app/ia/logs', { cookies: true });
    assert.ok(logs.json.logs.some(l => l.agente === 'qualificacao'));
  });
  await t('agente de perdas analisa motivos', async () => {
    // cria e perde uma oportunidade com motivo
    const nc = await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'Perdido Silva', telefone: '61955554444' }, cookies: true });
    const op = await req('POST', '/crm/api/app/oportunidades', { corpo: { contato_id: nc.json.contato.id, titulo: 'Negócio X', valor_centavos: 50000 }, cookies: true });
    const funil = (await req('GET', '/crm/api/app/funis', { cookies: true })).json.funis[0];
    const perdido = funil.estagios.find(e => e.tipo === 'perdido');
    await req('POST', `/crm/api/app/oportunidades/${op.json.oportunidade.id}/mover`, { corpo: { estagio_id: perdido.id, motivo: 'preço alto' }, cookies: true });
    const r = await req('POST', '/crm/api/app/ia/perdas', { cookies: true });
    assert.ok(r.json.motivos.some(m => m.motivo === 'preço alto'));
  });

  // ---- webhook de entrada + import/export + API pública ----
  let webhookToken;
  await t('webhook de entrada cria lead deduplicado com procedência', async () => {
    const cfg = await req('GET', '/crm/api/app/config', { cookies: true });
    webhookToken = cfg.json.webhook_token;
    const r = await req('POST', '/crm/webhook/' + webhookToken, { corpo: { nome: 'Lead do Site', telefone: '61933332222', origem: 'site', utm: { source: 'instagram' }, primeira_mensagem: 'Quero orçamento' } });
    assert.equal(r.st, 200); assert.ok(r.json.contato_id);
    assert.equal((await req('POST', '/crm/webhook/token-errado', { corpo: {} })).st, 404);
  });
  await t('importa CSV com dedupe; exporta CSV', async () => {
    const csv = 'nome;telefone;email;tipo;origem\nMaria CSV;61922221111;maria@csv.br;aluno;importacao\nLead do Site;61933332222;;lead;site\n;;;;';
    const r = await req('POST', '/crm/api/app/contatos/importar', { corpo: { csv }, cookies: true });
    assert.equal(r.json.criados, 1); assert.equal(r.json.duplicados, 1); assert.equal(r.json.invalidos, 1);
    const ex = await req('GET', '/crm/api/app/contatos/exportar', { cookies: true });
    assert.ok(ex.ct.includes('csv') && ex.texto.includes('Maria CSV'));
  });
  await t('API pública por chave vc_ cria contato', async () => {
    // trial não tem api_publica → liga por override
    const tBeta = saas.repo.Tenants.listar({ busca: 'Pousada Beta' })[0];
    saas.repo.salvarSettings(tBeta.id, { flags_over: { api_publica: true }, modulos_extra: ['api'] });
    const ch = await req('POST', '/crm/api/app/chaves', { corpo: { nome: 'integracao' }, cookies: true });
    assert.ok(ch.json.chave.startsWith('vc_'));
    const r = await req('POST', '/crm/api/v1/contatos', { corpo: { nome: 'Via API', telefone: '61911110000' }, headers: { 'x-api-key': ch.json.chave } });
    assert.equal(r.st, 200);
    assert.equal((await req('POST', '/crm/api/v1/contatos', { corpo: { nome: 'x' }, headers: { 'x-api-key': 'vc_falsa' } })).st, 401);
  });

  // ---- papéis + isolamento entre tenants ----
  await t('papel leitura não cria contato (403); vendedor cria', async () => {
    const add1 = await req('POST', '/crm/api/equipe', { corpo: { nome: 'Leitor', email: 'leitor@beta.br', papel: 'leitura' }, cookies: true });
    const add2 = await req('POST', '/crm/api/equipe', { corpo: { nome: 'Vend', email: 'vend@beta.br', papel: 'vendedor' }, cookies: true });
    for (const [link, senha] of [[add1.json.link_setup, 'SenhaForte2'], [add2.json.link_setup, 'SenhaForte3']]) {
      const token = new URL(link).searchParams.get('token');
      await req('POST', '/crm/api/definir-senha', { corpo: { token, senha } });
    }
    await req('POST', '/crm/api/login', { corpo: { email: 'leitor@beta.br', senha: 'SenhaForte2' }, cookies: true });
    assert.equal((await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'Nao Pode' }, cookies: true })).st, 403);
    assert.equal((await req('GET', '/crm/api/app/contatos', { cookies: true })).st, 200); // leitura pode ler
    await req('POST', '/crm/api/login', { corpo: { email: 'vend@beta.br', senha: 'SenhaForte3' }, cookies: true });
    assert.equal((await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'Pode Sim', telefone: '61900009999' }, cookies: true })).st, 200);
  });
  await t('isolamento: tenant Alfa não vê contatos da Beta', async () => {
    const link = await req('POST', `/staff/api/vcrm/tenants/${tid}/link-acesso`);
    const token = new URL(link.json.url).searchParams.get('token');
    await req('POST', '/crm/api/definir-senha', { corpo: { token, senha: 'SenhaForte4' } });
    await req('POST', '/crm/api/login', { corpo: { email: 'alfa@emp.br', senha: 'SenhaForte4' }, cookies: true });
    const r = await req('GET', '/crm/api/app/contatos', { cookies: true });
    assert.equal(r.json.contatos.length, 0);
  });

  // ---- limites de plano ----
  await t('limite de contatos do plano bloqueia (starter=1000 → override 2)', async () => {
    // tenant Alfa (professional) com override de limite baixo para testar
    saas.repo.salvarSettings(tid, { limites_over: { contatos: 2 } });
    assert.equal((await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'C1', telefone: '61844443333' }, cookies: true })).st, 200);
    assert.equal((await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'C2', telefone: '61844443334' }, cookies: true })).st, 200);
    const r = await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'C3', telefone: '61844443335' }, cookies: true });
    // 402 estruturado: o painel mostra o cartão de upgrade com o plano que resolve (antes: 400 com texto solto)
    assert.equal(r.st, 402); assert.equal(r.json.codigo, 'limite'); assert.equal(r.json.recurso, 'contatos');
    assert.equal(r.json.limite, 2); assert.equal(r.json.usado >= 2, true);
    assert.equal(r.json.plano_atual.slug, 'professional'); assert.equal(r.json.plano_sugerido.slug, 'business');
    assert.ok(r.json.plano_sugerido.preco_centavos > 0 && /Business|Completo|Growth/i.test(r.json.plano_sugerido.nome) && /upgrade|plano/i.test(r.json.erro));
    assert.ok(!JSON.stringify(r.json).includes(tid), 'o corpo não pode vazar o id do tenant');
    saas.repo.salvarSettings(tid, { limites_over: {} });
  });
  await t('limite negativo (-1, convenção do Growth OS) e 0 valem ilimitado; positivo continua bloqueando', async () => {
    // regressão de 06/11/2026: conta Enterprise com contatos = -1 não conseguia salvar nem 1 contato (a busca ativa parava)
    const { dentroLimite } = saas.repo;
    saas.repo.salvarSettings(tid, { limites_over: { contatos: -1 } });
    assert.equal(dentroLimite(tid, 'contatos').ok, true);
    assert.equal((await req('POST', '/crm/api/app/contatos', { corpo: { nome: 'Sem Teto', telefone: '61811110001' }, cookies: true })).st, 200);
    saas.repo.salvarSettings(tid, { limites_over: { contatos: 0 } });
    assert.equal(dentroLimite(tid, 'contatos').ok, true);
    saas.repo.salvarSettings(tid, { limites_over: { contatos: 1 } });
    assert.equal(dentroLimite(tid, 'contatos').ok, false); // já há mais de 1 contato
    saas.repo.salvarSettings(tid, { limites_over: {} });
  });
  await t('IA bloqueada quando flag desligada (professional sem override)', async () => {
    saas.repo.salvarSettings(tid, { flags_over: {}, modulos_extra: [] });
    const { json } = await req('GET', '/crm/api/app/contatos', { cookies: true });
    const r = await req('POST', '/crm/api/app/ia/followups', { cookies: true });
    assert.equal(r.st, 402); assert.equal(r.json.codigo, 'modulo'); assert.equal(r.json.plano_atual.slug, 'professional');
    assert.equal(r.json.plano_sugerido.slug, 'business'); // o menor plano que TEM o módulo de IA
  });
  await t('nucleo/upgrade: sugere o menor plano pago acima do atual, ignora grátis/sob consulta e não vaza nada', async () => {
    const U = require('../nucleo/upgrade');
    const planos = [
      { slug: 'trial', nome: 'Avaliação', preco_centavos: 0, limites: { x: 5 } },
      { slug: 'a', nome: 'A', preco_centavos: 5000, preco_anual_centavos: 50000, limites: { x: 10 } },
      { slug: 'b', nome: 'B', preco_centavos: 9000, limites: { x: 100 } },
      { slug: 'ent', nome: 'Enterprise', preco_centavos: 0, limites: { x: 0 } }, // sob consulta: nunca sugerido
    ];
    const atende = (n) => (p) => U.ilimitado(p.limites.x) || p.limites.x > n;
    assert.equal(U.menorPlanoQue(planos, 'trial', atende(5)).slug, 'a');
    assert.equal(U.menorPlanoQue(planos, 'a', atende(10)).slug, 'b'); // A não resolve (10 não é > 10)
    assert.equal(U.menorPlanoQue(planos, 'b', atende(100)), null);   // topo: nada a sugerir
    const e = U.erroDePlano({ codigo: 'limite', recurso: 'x', rotulo: 'coisas', usado: 10, limite: 10, planos, atualSlug: 'a', atende: atende(10), valorNoPlano: (p) => p.limites.x });
    assert.equal(e.status, 402); assert.equal(e.corpo.plano_sugerido.slug, 'b'); assert.equal(e.corpo.plano_sugerido.novo_limite, 100);
    assert.ok(/10 coisas do plano A/.test(e.corpo.erro) && /R\$\s?90/.test(e.corpo.erro));
    const topo = U.erroDePlano({ codigo: 'limite', recurso: 'x', rotulo: 'coisas', usado: 100, limite: 100, planos, atualSlug: 'b', atende: atende(100) });
    assert.equal(topo.corpo.plano_sugerido, null); assert.ok(/Fale com a gente/.test(topo.corpo.erro));
    assert.equal(U.ilimitado(0) && U.ilimitado(-1) && !U.ilimitado(1), true);
    let corpo = null; const res = { status(s) { this.s = s; return this; }, json(c) { corpo = c; } };
    assert.equal(U.responder(res, new Error('comum')), false); assert.equal(U.responder(res, e), true);
    assert.equal(res.s, 402); assert.equal(corpo.codigo, 'limite');
  });

  // ---- dashboard comercial ----
  await t('dashboard comercial traz KPIs e origem', async () => {
    await req('POST', '/crm/api/login', { corpo: { email: 'bia@beta.br', senha: 'SenhaForte1' }, cookies: true });
    const r = await req('GET', '/crm/api/app/dashboard', { cookies: true });
    assert.equal(r.st, 200);
    const d = r.json.dashboard;
    assert.ok(d.contatos_total >= 4);
    assert.ok(d.vendas_ganhas >= 1 && d.valor_ganho_centavos >= 800000);
    assert.ok(Array.isArray(d.por_origem) && d.por_origem.length);
    assert.ok(d.taxa_conversao_pct >= 0);
  });

  // ---- billing (MP mock) + ciclo de vida ----
  await t('assinante inicia assinatura (MP mock) → link; webhook ativa', async () => {
    const r = await req('POST', '/crm/api/cobranca/assinar', { corpo: { plano: 'professional' }, cookies: true });
    assert.equal(r.st, 200); assert.ok(r.json.link.includes('PRE777'));
    const wb = await req('POST', '/crm/webhooks/mercadopago', { corpo: { type: 'subscription_preapproval', data: { id: 'PRE777' } } });
    assert.equal(wb.st, 200);
    await new Promise(x => setTimeout(x, 150));
    const tBeta = saas.repo.Tenants.listar({ busca: 'Pousada Beta' })[0];
    assert.equal(tBeta.status, 'ativa');
    const fat = require('./db').db.prepare('SELECT status FROM invoices WHERE tenant_id = ?').all(tBeta.id);
    assert.ok(fat.some(f => f.status === 'paga'));
  });
  await t('billing idempotente: webhook de pagamento repetido gera só 1 fatura', async () => {
    const tBeta = saas.repo.Tenants.listar({ busca: 'Pousada Beta' })[0];
    _payResp = { id: 'PAY_DUP', status: 'approved', external_reference: `crm:${tBeta.id}:professional` };
    for (let i = 0; i < 3; i++) { // MP re-tenta o mesmo webhook
      assert.equal((await req('POST', '/crm/webhooks/mercadopago', { corpo: { type: 'payment', data: { id: 'PAY_DUP' } } })).st, 200);
      await new Promise(x => setTimeout(x, 80));
    }
    const n = require('./db').db.prepare("SELECT COUNT(*) c FROM invoices WHERE mp_payment_id = 'PAY_DUP'").get().c;
    assert.equal(n, 1, `MP reenviou 3x; deve haver 1 fatura, vieram ${n}`);
  });
  // ---- PLANO ANUAL (Augusto, 05/11/2026): anual = 10 mensalidades; cobranca unica por ano ----
  await t('plano anual: PATCH do preco anual (admin) so mexe nele e rejeita valor invalido', async () => {
    const { planos } = (await req('GET', '/staff/api/vcrm/planos')).json;
    const pl = planos.find(p => p.slug === 'professional');
    assert.equal(pl.preco_anual_centavos, pl.preco_centavos * 10, 'GET devolve preco_anual_centavos');
    const antes = pl.preco_centavos;
    const r = await req('PATCH', '/staff/api/vcrm/planos/' + pl.id, { corpo: { preco_anual_centavos: 123400 } });
    assert.equal(r.json.plano.preco_anual_centavos, 123400);
    assert.equal(r.json.plano.preco_centavos, antes, 'o mensal nao muda');
    const r2 = await req('PATCH', '/staff/api/vcrm/planos/' + pl.id, { corpo: { nome: pl.nome } });
    assert.equal(r2.json.plano.preco_anual_centavos, 123400, 'omitido = mantem');
    const ruim = await req('PATCH', '/staff/api/vcrm/planos/' + pl.id, { corpo: { preco_anual_centavos: -5 } });
    assert.equal(ruim.st, 400);
    assert.equal(saas.repo.Planos.porSlug('professional').preco_anual_centavos, 123400);
    await req('PATCH', '/staff/api/vcrm/planos/' + pl.id, { corpo: { preco_anual_centavos: antes * 10 } });
  });
  await t('plano anual: assinar anual cria preapproval de 12 meses com o valor anual e guarda o ciclo', async () => {
    const nova = await req('POST', '/staff/api/vcrm/tenants', { corpo: { nome: 'Anual Um', email: 'anual1@t.br', plano: 'trial' } });
    const tid2 = nova.json.tenant.id;
    const pl = saas.repo.Planos.porSlug('professional');
    mpCorpos.length = 0;
    const r = await require('./billing').assinar(tid2, 'professional', 'anual1@t.br', 'https://base.teste', '1.1.1.1', 'anual');
    assert.ok(r.link);
    const b = mpCorpos[mpCorpos.length - 1];
    assert.equal(b.auto_recurring.frequency, 12);
    assert.equal(b.auto_recurring.frequency_type, 'months');
    assert.equal(b.auto_recurring.transaction_amount, pl.preco_anual_centavos / 100);
    assert.match(b.reason, /anual/);
    const sub = require('./db').db.prepare("SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY criado_em DESC").get(tid2);
    assert.equal(sub.ciclo, 'anual'); assert.equal(sub.valor_centavos, pl.preco_anual_centavos);
    // mensal continua igual: 1 mes e o valor mensal
    const nova2 = await req('POST', '/staff/api/vcrm/tenants', { corpo: { nome: 'Mensal Um', email: 'mensal1@t.br', plano: 'trial' } });
    await require('./billing').assinar(nova2.json.tenant.id, 'professional', 'mensal1@t.br', 'https://base.teste', '1.1.1.1');
    const bm = mpCorpos[mpCorpos.length - 1];
    assert.equal(bm.auto_recurring.frequency, 1); assert.equal(bm.auto_recurring.transaction_amount, pl.preco_centavos / 100);
    assert.equal(require('./db').db.prepare('SELECT ciclo FROM subscriptions WHERE tenant_id = ?').get(nova2.json.tenant.id).ciclo, 'mensal');
    // pelo endpoint do assinante: ciclo invalido nao passa
    await assert.rejects(() => require('./billing').assinar(nova2.json.tenant.id, 'professional', 'x@t.br', 'https://base.teste', '1.1.1.1', 'trimestral'), /Ciclo inválido/);
  });
  await t('plano anual: ciclo anual e rejeitado quando o plano nao tem preco anual', async () => {
    const pl = saas.repo.Planos.porSlug('starter');
    const antes = pl.preco_anual_centavos;
    await req('PATCH', '/staff/api/vcrm/planos/' + pl.id, { corpo: { preco_anual_centavos: 0 } });
    const nova = await req('POST', '/staff/api/vcrm/tenants', { corpo: { nome: 'Sem Anual', email: 'semanual@t.br', plano: 'trial' } });
    const nSubs = require('./db').db.prepare('SELECT COUNT(*) c FROM subscriptions WHERE tenant_id = ?').get(nova.json.tenant.id).c;
    await assert.rejects(() => require('./billing').assinar(nova.json.tenant.id, 'starter', 'semanual@t.br', 'https://base.teste', '1.1.1.1', 'anual'), /não tem preço anual/);
    assert.equal(require('./db').db.prepare('SELECT COUNT(*) c FROM subscriptions WHERE tenant_id = ?').get(nova.json.tenant.id).c, nSubs, 'rejeitado: nenhuma assinatura nova foi criada');
    await req('PATCH', '/staff/api/vcrm/planos/' + pl.id, { corpo: { preco_anual_centavos: antes } });
  });
  await t('plano anual: MRR conta o anual dividido por 12; ativacao anual vence em 365 dias e a fatura e a anual', async () => {
    const nova = await req('POST', '/staff/api/vcrm/tenants', { corpo: { nome: 'Anual Mrr', email: 'anualmrr@t.br', plano: 'trial' } });
    const tid3 = nova.json.tenant.id;
    const dbx = require('./db').db;
    const billing = require('./billing');
    await billing.assinar(tid3, 'professional', 'anualmrr@t.br', 'https://base.teste', '1.1.1.1', 'anual');
    dbx.prepare("UPDATE subscriptions SET valor_centavos = 1200000 WHERE tenant_id = ? AND ciclo = 'anual'").run(tid3);
    const mrr0 = saas.repo.Dashboard.plataforma().mrr_centavos;
    const preId = dbx.prepare("SELECT mp_preapproval_id p FROM subscriptions WHERE tenant_id = ? AND ciclo = 'anual'").get(tid3).p;
    billing.aplicarPreapproval(tid3, preId, 'authorized');
    const sub = dbx.prepare("SELECT * FROM subscriptions WHERE tenant_id = ? AND ciclo = 'anual'").get(tid3);
    assert.equal(sub.status, 'ativa');
    const dias = (Date.parse(sub.proximo_venc) - Date.now()) / 86400000;
    assert.ok(dias > 360 && dias < 366, 'vencimento anual ~365 dias, veio ' + dias);
    const fat = dbx.prepare("SELECT valor_centavos FROM invoices WHERE tenant_id = ? ORDER BY criado_em DESC").get(tid3);
    assert.equal(fat.valor_centavos, 1200000, 'a fatura e o valor anual cobrado');
    const mrr1 = saas.repo.Dashboard.plataforma().mrr_centavos;
    assert.equal(mrr1 - mrr0, 100000, 'MRR sobe 1/12 do anual (1.200.000 / 12)');
    // trocar de plano numa assinatura anual compara os precos ANUAIS
    const r = billing.trocarPlano(tid3, 'starter', 'teste');
    assert.equal(r.tipo, 'downgrade');
    assert.equal(r.exige_reassinar, true, 'assinatura anual ativa no MP: trocar de plano exige reassinar');
  });

  await t('ciclo de vida: trial vencido → inadimplente; suspensa bloqueia app', async () => {
    const nova = await req('POST', '/staff/api/vcrm/tenants', { corpo: { nome: 'Gama Vendas', email: 'gama@t.br', plano: 'trial' } });
    require('./db').db.prepare("UPDATE tenants SET trial_expira_em = '2020-01-01T00:00:00Z' WHERE id = ?").run(nova.json.tenant.id);
    const r = await req('POST', '/staff/api/vcrm/ciclo-diario');
    assert.ok(r.json.trials_vencidos >= 1);
    assert.ok(!alertas.some(m => m.includes('trial expirou') && m.includes('Gama Vendas')), 'trial vencido não manda aviso por conta: vai no resumo do ciclo');
    const resumo = require('./avisos').resumoDoCiclo(r.json);
    assert.ok(resumo.includes('Gama Vendas') && resumo.includes('gama@t.br') && resumo.includes('O QUE FAZER'), 'resumo do ciclo não diz quem: ' + resumo);
    // suspende a Alfa e o app dela responde 403
    await req('POST', `/staff/api/vcrm/tenants/${tid}/status`, { corpo: { status: 'suspensa' } });
    await req('POST', '/crm/api/login', { corpo: { email: 'alfa@emp.br', senha: 'SenhaForte4' }, cookies: true });
    assert.equal((await req('GET', '/crm/api/app/contatos', { cookies: true })).st, 403);
    await req('POST', `/staff/api/vcrm/tenants/${tid}/status`, { corpo: { status: 'ativa' } });
  });

  // ---- importação do CRM legado ----
  await t('importar-legado: contatos.json vira contatos + oportunidades', async () => {
    fs.writeFileSync(path.join(process.env.DATA_DIR, 'contatos.json'), JSON.stringify([
      { id: 'l1', nome: 'Legado Um', telefone: '5561981112222', origem: 'whatsapp-business', estagio: 'negociacao', valorEstimado: 3500, imovelInteresse: 'GD01H', proximaAcao: { descricao: 'responder', data: '2026-07-10' } },
      { id: 'l2', nome: 'Legado Dois', telefone: '5561982223333', origem: 'airbnb', estagio: 'posvenda' },
    ]));
    await req('POST', '/staff/api/vcrm/tenants', { corpo: { nome: 'Villela Stay', slug: 'villela-stay', email: 'contato@villelastay.com.br', plano: 'enterprise', status_inicial: 'ativa', origem: 'interno' } });
    const r = await req('POST', '/staff/api/vcrm/importar-legado', { corpo: { tenant_slug: 'villela-stay' } });
    assert.equal(r.st, 200);
    assert.equal(r.json.criados, 2);
    assert.equal(r.json.oportunidades, 1); // só o em negociação vira oportunidade aberta
    const tV = saas.repo.Tenants.porSlug('villela-stay');
    const cs = saas.appRepo.Contatos.listar(tV.id, {});
    assert.ok(cs.find(c => c.nome === 'Legado Dois').tipo === 'hospede');
  });
  await t('importar-legado completo: histórico, tarefas, perdidos, datas originais, simulação e idempotência', async () => {
    const dir = process.env.DATA_DIR;
    fs.writeFileSync(path.join(dir, 'contatos.json'), JSON.stringify([
      { id: 'l1', nome: 'Legado Um', telefone: '5561981112222', origem: 'whatsapp-business', estagio: 'negociacao', valorEstimado: 3500, imovelInteresse: 'GD01H', proximaAcao: { descricao: 'responder', data: '2026-07-10' } },
      { id: 'l2', nome: 'Legado Dois', telefone: '5561982223333', origem: 'airbnb', estagio: 'posvenda' },
      { id: 'l3', nome: 'Legado Tres', telefone: '5561983334444', origem: 'stays', estagio: 'perdido', motivoPerda: 'Preço', criadoEm: '2026-06-16T15:30:00.000Z', staysReservationId: 'RES9', proximaAcao: { descricao: 'nao deve virar tarefa', data: '2026-07-01' } },
      { id: 'l4', nome: 'Legado Quatro', telefone: '5561984445555', origem: 'whatsapp-business', estagio: 'novo', criadoEm: '2026-06-20T10:00:00.000Z', proximaAcao: { descricao: 'Responder primeiro contato', data: '2026-06-21' } },
    ]));
    fs.writeFileSync(path.join(dir, 'atividades.jsonl'), [
      { id: 'a1', contatoId: 'l4', tipo: 'mensagem-recebida', texto: 'Oi, tem vaga?', canal: 'whatsapp', autor: 'cliente', data: '2026-06-20T10:00:05.000Z' },
      { id: 'a2', contatoId: 'l4', tipo: 'tipo-inventado', texto: 'algo', canal: 'xyz', autor: 'sistema', data: '2026-06-20T10:01:00.000Z' },
    ].map(x => JSON.stringify(x)).join('\n') + '\n');
    const tV = saas.repo.Tenants.porSlug('villela-stay');
    const antes = saas.appRepo.Contatos.contar(tV.id);
    const sim = await req('POST', '/staff/api/vcrm/importar-legado', { corpo: { tenant_slug: 'villela-stay', simular: true } });
    assert.equal(sim.st, 200); assert.equal(sim.json.simulacao, true);
    assert.equal(sim.json.criados, 2, 'l3 e l4 são novos (l1/l2 já foram importados)');
    assert.equal(saas.appRepo.Contatos.contar(tV.id), antes, 'a simulação gravou contato');
    assert.equal(require("./db").db.prepare('SELECT COUNT(*) n FROM crm_atividades WHERE tenant_id = ? AND texto = ?').get(tV.id, 'Oi, tem vaga?').n, 0, 'a simulação gravou histórico');
    const real = await req('POST', '/staff/api/vcrm/importar-legado', { corpo: { tenant_slug: 'villela-stay' } });
    assert.equal(real.st, 200); assert.equal(real.json.simulacao, false);
    assert.equal(real.json.criados, 2); assert.equal(real.json.existentes, 2);
    assert.equal(real.json.perdidas, 1); assert.equal(real.json.atividades, 2);
    assert.equal(real.json.tarefas, 1, 'só a do l4 (a do l1 já nasceu no teste anterior); o perdido não gera tarefa');
    assert.deepEqual({ ...sim.json, simulacao: false }, { ...real.json }, 'simulação e importação real divergiram');
    const c4 = saas.appRepo.Contatos.listar(tV.id, {}).find(c => c.nome === 'Legado Quatro');
    assert.equal(c4.criado_em, '2026-06-20T10:00:00.000Z', 'perdeu a data original');
    assert.equal(c4.ultima_interacao, '2026-06-20T10:00:05.000Z', 'ultima_interacao virou "agora" por causa do import');
    assert.ok(c4.tags.includes('legado'));
    const c3 = saas.appRepo.Contatos.listar(tV.id, {}).find(c => c.nome === 'Legado Tres');
    assert.ok(c3.obs.includes('RES9'), 'vínculo com a Stays sumiu');
    assert.equal(require("./db").db.prepare("SELECT status FROM crm_oportunidades WHERE tenant_id = ? AND contato_id = ?").get(tV.id, c3.id).status, 'perdida');
    const tarefas = saas.appRepo.Tarefas.listar(tV.id, { status: 'aberta' });
    assert.ok(tarefas.some(x => x.titulo === 'Responder primeiro contato' && x.vence_em === '2026-06-21'));
    assert.ok(!tarefas.some(x => x.titulo === 'nao deve virar tarefa'));
    const ativ = require("./db").db.prepare('SELECT tipo, canal FROM crm_atividades WHERE tenant_id = ? AND contato_id = ? AND autor IN (?, ?)').all(tV.id, c4.id, 'cliente', 'sistema');
    assert.ok(ativ.some(a => a.tipo === 'nota' && a.canal === ''), 'tipo/canal desconhecidos deviam cair em nota/vazio');
    // idempotência: repetir não duplica nada
    const de_novo = await req('POST', '/staff/api/vcrm/importar-legado', { corpo: { tenant_slug: 'villela-stay' } });
    assert.equal(de_novo.json.criados, 0); assert.equal(de_novo.json.atividades, 0);
    assert.equal(de_novo.json.tarefas, 0); assert.equal(de_novo.json.oportunidades + de_novo.json.perdidas, 0);
  });
  await t('ponte do legado: contato, mensagem, estágio e próxima ação chegam ao CRM novo — sem duplicar depois', async () => {
    const ponte = require('./ponte-legado'); const D = require('./db').db;
    const tV = saas.repo.Tenants.porSlug('villela-stay');
    const hoje = new Date().toISOString().slice(0, 10);
    const l = { id: 'p1', nome: 'Ponte Um', telefone: '5561970001111', origem: 'whatsapp-business', estagio: 'novo', dono: 'Augusto', criadoEm: '2026-11-05T12:00:00.000Z', proximaAcao: { descricao: 'Responder primeiro contato', data: hoje } };
    assert.equal(ponte.depois([], [l]), 1, 'contato novo não foi espelhado');
    const achar = () => saas.appRepo.Contatos.listar(tV.id, {}).find(c => c.nome === 'Ponte Um');
    let c = achar(); assert.ok(c, 'contato não chegou'); assert.equal(c.criado_em, '2026-11-05T12:00:00.000Z');
    const abre = () => saas.appRepo.Tarefas.listar(tV.id, { status: 'aberta', contato_id: c.id });
    assert.equal(abre().length, 1); assert.equal(abre()[0].titulo, 'Responder primeiro contato');
    // mensagem recebida: mesma data do legado, e vira a última interação
    const msg = { id: 'am', contatoId: 'p1', tipo: 'mensagem-recebida', texto: 'Quero reservar', canal: 'whatsapp', autor: 'sistema', data: '2026-11-05T12:00:03.000Z' };
    assert.equal(ponte.atividade(l, msg), true); ponte.atividade(l, msg); // repetida: não duplica
    assert.equal(D.prepare("SELECT COUNT(*) n FROM crm_atividades WHERE tenant_id = ? AND contato_id = ? AND texto = 'Quero reservar'").get(tV.id, c.id).n, 1);
    assert.equal(achar().ultima_interacao, '2026-11-05T12:00:03.000Z');
    assert.equal(ponte.atividade(l, { tipo: 'nota', texto: 'Contato criado (origem: x)', data: '2026-11-05T12:00:00.000Z' }), false, 'nota de criação duplicaria a do CRM novo');
    // próxima ação trocada no legado: conclui a espelhada e cria a nova
    const l2 = { ...l, proximaAcao: { descricao: 'Aguardando resposta', data: '2099-01-01' } };
    ponte.depois([l], [l2]);
    assert.equal(abre().length, 1); assert.equal(abre()[0].titulo, 'Aguardando resposta');
    // estágio só avança por evento automático; 'perdido' sempre vale
    const estagioDe = () => D.prepare('SELECT e.nome, o.status FROM crm_oportunidades o JOIN crm_estagios e ON e.id = o.estagio_id WHERE o.tenant_id = ? AND o.contato_id = ?').get(tV.id, c.id);
    const antesNome = estagioDe().nome;
    const l3 = { ...l2, estagio: 'orcamento' }; ponte.depois([l2], [l3]);
    assert.notEqual(estagioDe().nome, antesNome, 'estágio não avançou');
    const l4 = { ...l3, estagio: 'novo' }; ponte.depois([l3], [l4]);
    assert.equal(estagioDe().nome, estagioDe().nome); assert.notEqual(estagioDe().nome, antesNome, 'o legado fez o funil regredir');
    ponte.depois([l4], [{ ...l4, estagio: 'perdido', motivoPerda: 'Preço' }]);
    assert.equal(estagioDe().status, 'perdida');
    // sem mudança relevante: nada a espelhar
    assert.equal(ponte.depois([l], [{ ...l, atualizadoEm: 'x' }]), 0, 'espelhou sem mudança relevante');
    // importar depois NÃO duplica o que a ponte já levou (mesma data+texto)
    fs.writeFileSync(path.join(process.env.DATA_DIR, 'contatos.json'), JSON.stringify([l]));
    fs.writeFileSync(path.join(process.env.DATA_DIR, 'atividades.jsonl'), JSON.stringify(msg) + '\n');
    const imp = await req('POST', '/staff/api/vcrm/importar-legado', { corpo: { tenant_slug: 'villela-stay' } });
    assert.equal(imp.json.atividades, 0, 'a importação duplicou a mensagem que a ponte levou');
    assert.equal(imp.json.criados, 0, 'a importação recriou o contato que a ponte já levou');
    // contato sem telefone/e-mail: a ponte e a importação não duplicam
    const sem = { id: 'sk', nome: 'Só Nome', origem: 'manual', estagio: 'novo' };
    ponte.depois([], [sem]); ponte.depois([], [sem]);
    fs.writeFileSync(path.join(process.env.DATA_DIR, 'contatos.json'), JSON.stringify([sem]));
    await req('POST', '/staff/api/vcrm/importar-legado', { corpo: { tenant_slug: 'villela-stay' } });
    assert.equal(saas.appRepo.Contatos.listar(tV.id, {}).filter(x => x.nome === 'Só Nome').length, 1, 'contato sem chave duplicou');
    // desligável
    process.env.CRM_PONTE = 'off';
    assert.equal(ponte.depois([], [{ ...l, id: 'p9', nome: 'Desligada', telefone: '5561970009999' }]), 0, 'ponte ligada com CRM_PONTE=off');
    delete process.env.CRM_PONTE;
    assert.ok(!saas.appRepo.Contatos.listar(tV.id, {}).find(x => x.nome === 'Desligada'));
    // sem a empresa interna a ponte não faz nada nem quebra
    process.env.CRM_PONTE_SLUG = 'nao-existe';
    assert.equal(ponte.depois([], [{ ...l, id: 'p8', nome: 'Sem tenant' }]), 0, 'espelhou sem a empresa interna');
    delete process.env.CRM_PONTE_SLUG;
  });
  await t('rotas das automações (/vcrm/agente): follow-ups, pular, atividade e inbox no formato do legado', async () => {
    const K = { 'x-publish-key': 'k-teste' }; const D = require('./db').db;
    const tV = saas.repo.Tenants.porSlug('villela-stay');
    assert.equal((await req('GET', '/staff/api/vcrm/agente/resumo', { user: 'op' })).st, 403, 'operador sem área vendas entrou');
    const rs = await req('GET', '/staff/api/vcrm/agente/resumo', { headers: K, user: 'nenhum' });
    assert.equal(rs.st, 200, 'chave de publicação não passou'); assert.ok(rs.json.tarefas_atrasadas >= 1); assert.ok(rs.json.contatos_legado >= 1);
    // follow-ups: contato com tarefa vencida, no vocabulário do legado
    const fu = (await req('GET', '/staff/api/vcrm/agente/followups', { headers: K })).json.followups;
    const q = fu.find(f => f.nome === 'Legado Quatro');
    assert.ok(q, 'follow-up vencido não apareceu'); assert.equal(q.estagio, 'novo'); assert.equal(q.proximaAcao.descricao, 'Responder primeiro contato');
    assert.ok(!fu.some(f => f.estagio === 'perdido'), 'perdido não pode virar follow-up');
    // detalhe no formato do legado + 404
    const det = (await req('GET', '/staff/api/vcrm/agente/contatos/' + q.id, { headers: K })).json;
    assert.equal(det.contato.nome, 'Legado Quatro'); assert.ok(Array.isArray(det.atividades) && det.atividades.length >= 1);
    assert.equal((await req('GET', '/staff/api/vcrm/agente/contatos/nao-existe', { headers: K })).st, 404);
    // pular: conclui (não apaga) e cria a nova no futuro
    const futuro = '2099-02-02';
    assert.equal((await req('PATCH', '/staff/api/vcrm/agente/contatos/' + q.id, { headers: K, corpo: { proximaAcao: { descricao: 'Follow-up adiado', data: futuro } } })).st, 200);
    const tk = D.prepare('SELECT titulo, status, vence_em FROM crm_tarefas WHERE tenant_id = ? AND contato_id = ? ORDER BY criado_em').all(tV.id, q.id);
    assert.ok(tk.some(x => x.titulo === 'Responder primeiro contato' && x.status === 'concluida'), 'a tarefa antiga devia ficar CONCLUÍDA (não apagada)');
    assert.ok(tk.some(x => x.titulo === 'Follow-up adiado' && x.vence_em === futuro && x.status === 'aberta'));
    assert.ok(!(await req('GET', '/staff/api/vcrm/agente/followups', { headers: K })).json.followups.some(f => f.id === q.id), 'adiado continua na lista de hoje');
    assert.equal(require('./ponte-legado').followupsVencidos(), (await req('GET', '/staff/api/vcrm/agente/followups', { headers: K })).json.followups.length, 'card do staff e rota de follow-ups divergem');
    assert.equal((await req('PATCH', '/staff/api/vcrm/agente/contatos/' + q.id, { headers: K, corpo: { nome: 'x' } })).st, 400, 'PATCH só aceita proximaAcao');
    // atividade
    assert.equal((await req('POST', `/staff/api/vcrm/agente/contatos/${q.id}/atividade`, { headers: K, corpo: { tipo: 'mensagem-enviada', texto: '[follow-up] teste', canal: 'whatsapp-business' } })).st, 200);
    assert.ok(D.prepare("SELECT 1 FROM crm_atividades WHERE tenant_id = ? AND contato_id = ? AND texto = '[follow-up] teste' AND tipo = 'mensagem-enviada'").get(tV.id, q.id));
    // inbox: mensagem recebida sem resposta aparece; atendida some (e volta com todas=1)
    const nova = saas.appRepo.Contatos.criar(tV.id, { nome: 'Inbox Teste', telefone: '5561977770000' }, 't').contato;
    saas.appRepo.Atividades.registrar(tV.id, { contato_id: nova.id, tipo: 'mensagem-recebida', texto: 'Tem vaga?', canal: 'whatsapp', autor: 'cliente', data: new Date(Date.now() - 5000).toISOString() });
    const caixa = async (todas) => (await req('GET', '/staff/api/vcrm/agente/inbox?horas=48' + (todas ? '&todas=1' : ''), { headers: K })).json.mensagens;
    assert.ok((await caixa()).some(m => m.contatoId === nova.id && m.texto === 'Tem vaga?'), 'mensagem não atendida não apareceu');
    assert.equal((await req('POST', `/staff/api/vcrm/agente/inbox/${nova.id}/atendida`, { headers: K, corpo: { resposta: 'Temos sim!' } })).st, 200);
    assert.ok(!(await caixa()).some(m => m.contatoId === nova.id), 'continuou na fila depois de atendida');
    assert.equal((await caixa(true)).find(m => m.contatoId === nova.id).atendida, true);
    // mensagem NOVA depois da resposta volta para a fila (a velha continua atendida)
    saas.appRepo.Atividades.registrar(tV.id, { contato_id: nova.id, tipo: 'mensagem-recebida', texto: 'E o preço?', canal: 'whatsapp', autor: 'cliente', data: new Date(Date.now() + 5000).toISOString() });
    const fila = await caixa();
    assert.ok(fila.some(m => m.texto === 'E o preço?') && !fila.some(m => m.texto === 'Tem vaga?'));
  });

  await t('rota do agente: conversas classificadas localmente entram na empresa interna (sem texto, exige chave)', async () => {
    const itens = [{ canal: 'whatsapp', identificador: '61 98888-7777', nome: 'Lead Local', assunto: 'evento', razao: 'orcamento', razao_rotulo: 'Pediu orçamento / preço', situacao: 'aguardando_nos', qualificacao: 'quente', confianca: 0.8, evidencias: ['festa'], total: 4, minhas: 2, deles: 2, primeira_em: '2026-10-01T10:00:00Z', ultima_em: '2026-11-04T10:00:00Z', texto: 'NAO PODE GRAVAR' }];
    const sem = await req('POST', '/staff/api/vcrm/agente/conversas', { corpo: { itens }, user: 'op' });
    assert.equal(sem.st, 403); // sem chave e sem papel de CRM
    const ok1 = await req('POST', '/staff/api/vcrm/agente/conversas', { corpo: { itens, fonte: 'local-whatsapp' }, headers: { 'x-publish-key': 'k-teste' } });
    assert.equal(ok1.st, 200); assert.equal(ok1.json.novas, 1);
    const ok2 = await req('POST', '/staff/api/vcrm/agente/conversas', { corpo: { itens }, headers: { 'x-publish-key': 'k-teste' } });
    assert.equal(ok2.json.novas, 0); assert.equal(ok2.json.atualizadas, 1); // idempotente
    const linha = require('./db').db.prepare("SELECT * FROM crm_conversas WHERE nome = 'Lead Local'").get();
    assert.equal(linha.status, 'sugerido'); assert.ok(!JSON.stringify(linha).includes('NAO PODE GRAVAR'));
    assert.equal((await req('POST', '/staff/api/vcrm/agente/conversas', { corpo: { itens: 'x' }, headers: { 'x-publish-key': 'k-teste' } })).st, 400);
  });
  await t('LGPD: exclusão definitiva remove contato + timeline', async () => {
    await req('POST', '/crm/api/login', { corpo: { email: 'bia@beta.br', senha: 'SenhaForte1' }, cookies: true });
    const r = await req('DELETE', '/crm/api/app/contatos/' + leadId, { cookies: true });
    assert.equal(r.st, 200); assert.equal(r.json.removido, true);
    assert.equal((await req('GET', '/crm/api/app/contatos/' + leadId, { cookies: true })).st, 404);
    assert.equal(require('./db').db.prepare('SELECT COUNT(*) n FROM crm_atividades WHERE contato_id = ?').get(leadId).n, 0);
  });
  await t('MFA: com segundo fator, senha certa não abre sessão sozinha', async () => {
    const { db } = require('./db');
    const growth = require('../growth');
    const mfa = require('../growth/mfa');
    const u = db.prepare("SELECT * FROM tenant_users WHERE lower(email) = 'bia@beta.br'").get();

    const inicio = growth.tenancy.comTenant({ tenantId: u.tenant_id, userId: u.id },
      () => mfa.iniciar({ userId: u.id, email: u.email }));
    const codigo = mfa.codigoEm(inicio.segredo, Math.floor(Date.now() / 1000 / 30));
    growth.tenancy.comTenant({ tenantId: u.tenant_id, userId: u.id },
      () => mfa.confirmar({ userId: u.id, codigo }));

    // 1) senha certa devolve DESAFIO, não sessão
    const login = await req('POST', '/crm/api/login', { corpo: { email: 'bia@beta.br', senha: 'SenhaForte1' } });
    assert.equal(login.st, 200);
    assert.equal(login.json.mfa, true, 'entrou sem pedir o segundo fator');
    assert.ok(login.json.desafio, 'não devolveu desafio');
    assert.ok(!login.json.ok, 'declarou sessão aberta sem o segundo fator');

    // 2) código errado não abre
    assert.equal((await req('POST', '/crm/api/login/mfa', { corpo: { desafio: login.json.desafio, codigo: '000000' } })).st, 401);

    // 3) código certo abre
    const ok = await req('POST', '/crm/api/login/mfa', {
      corpo: { desafio: login.json.desafio, codigo: mfa.codigoEm(inicio.segredo, Math.floor(Date.now() / 1000 / 30)) },
      cookies: true,
    });
    assert.equal(ok.st, 200);
    assert.equal((await req('GET', '/crm/api/me', { cookies: true })).st, 200, 'a sessão não abriu');

    // limpa para não afetar os testes seguintes
    growth.tenancy.comTenant({ tenantId: u.tenant_id, userId: u.id }, () => mfa.desativar({ userId: u.id }));
  });

  await t('login errado 5x → 429', async () => {
    for (let i = 0; i < 5; i++) await req('POST', '/crm/api/login', { corpo: { email: 'bia@beta.br', senha: 'errada' } });
    assert.equal((await req('POST', '/crm/api/login', { corpo: { email: 'bia@beta.br', senha: 'SenhaForte1' } })).st, 429);
  });
  await t('lead da landing registrado + auditoria da plataforma', async () => {
    await req('POST', '/crm/api/lead', { corpo: { nome: 'Lead X', empresa: 'Emp X', email: 'x@x.br' } });
    assert.ok((await req('GET', '/staff/api/vcrm/leads')).json.leads.some(l => l.email === 'x@x.br'));
    assert.ok((await req('GET', '/staff/api/vcrm/auditoria')).json.eventos.some(e => e.acao === 'tenant.criar'));
  });

  srv.close();
  console.log(`\n${ok} teste(s) OK, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach(f => console.log('  ✗', f)); process.exit(1); }
}
rodar().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
