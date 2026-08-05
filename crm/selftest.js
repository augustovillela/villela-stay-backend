// =====================================================================
// Villela CRM — suíte de testes. Roda o Express real com auth de teste
// injetada, banco descartável e MP mockado. npm run test:crm
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'crm-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
process.env.CRM_ROTINAS = 'off';
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
const alertaAugusto = async () => {};

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
saas.montar(app, { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto, mpFetch, jwtSecret: 'seg-teste' });

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
    assert.ok(r.texto.includes('Testar 14 dias'), 'landing sem o CTA do teste');
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

  await t('LGPD: exclusão definitiva remove contato + timeline', async () => {
    await req('POST', '/crm/api/login', { corpo: { email: 'bia@beta.br', senha: 'SenhaForte1' }, cookies: true });
    const r = await req('DELETE', '/crm/api/app/contatos/' + leadId, { cookies: true });
    assert.equal(r.st, 200); assert.equal(r.json.removido, true);
    assert.equal((await req('GET', '/crm/api/app/contatos/' + leadId, { cookies: true })).st, 404);
    assert.equal(require('./db').db.prepare('SELECT COUNT(*) n FROM crm_atividades WHERE contato_id = ?').get(leadId).n, 0);
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
