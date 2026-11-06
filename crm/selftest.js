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
let _payResp = {}; // resposta de /v1/payments/* controlada por teste (idempotência)
const mpFetch = async (p, opts) => {
  if (p === '/preapproval' && opts && opts.method === 'POST') return { id: 'PRE777', init_point: 'https://mp/PRE777', status: 'pending', external_reference: 'crm' };
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
