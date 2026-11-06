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
let _payResp = {}; // resposta de /v1/payments/* controlada por teste (idempotência)
const mpFetch = async (p, opts) => {
  if (p === '/preapproval' && opts && opts.method === 'POST') mpCorpos.push(JSON.parse(opts.body)); if (p === '/preapproval' && opts && opts.method === 'POST') return { id: 'PRE777', init_point: 'https://mp/PRE777', status: 'pending', external_reference: 'crm' };
  if (p.startsWith('/preapproval/')) return { id: 'PRE777', status: 'authorized' };
  if (p.startsWith('/v1/payments/')) return _payResp;
  return {};
};
mpFetch.__mock = true;

const app = express();
app.use(express.json({ limit: '5mb' }));
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
    } finally { saas.repo.salvarSettings(tid, { limites_over: {} }); }
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
    assert.equal(r.st, 400); assert.ok(/limite/i.test(r.json.erro));
    saas.repo.salvarSettings(tid, { limites_over: {} });
  });
  await t('IA bloqueada quando flag desligada (professional sem override)', async () => {
    saas.repo.salvarSettings(tid, { flags_over: {}, modulos_extra: [] });
    const { json } = await req('GET', '/crm/api/app/contatos', { cookies: true });
    const r = await req('POST', '/crm/api/app/ia/followups', { cookies: true });
    assert.equal(r.st, 403);
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
