// =====================================================================
// Villela Kids — suíte de testes. Sobe o Express real com auth de staff
// injetada e banco descartável.  npm run test:kids
//
// O foco é o que protege criança e o que sustenta o produto: consentimento
// parental obrigatório (LGPD art. 14), minimização do perfil infantil,
// isolamento total entre famílias, desbloqueio linear da trilha,
// criação → portfólio, e exclusão que APAGA de verdade.
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'kids-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
process.env.KIDS_DEMO_SENHA = 'SenhaDemo!2026';
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const express = require('express');
const cookieParser = require('cookie-parser');

// ---- staff fake (o Portal Staff administra a plataforma) ----
const STAFF = [
  { id: 'adm', nome: 'Admin', email: 'adm@t', papel: 'admin', ativo: true },
  { id: 'op', nome: 'Operador', email: 'op@t', papel: 'membro', ativo: true },
];
function requireAuth(req, res, next) {
  const u = STAFF.find((x) => x.id === (req.headers['x-test-user'] || 'adm'));
  if (!u) return res.status(401).json({ erro: 'x' });
  req.user = u; next();
}
const requireAdmin = (req, res, next) => (req.user && req.user.papel === 'admin') ? next() : res.status(403).json({ erro: 'admin' });

const emailsEnviados = [];
const enviarEmail = async (to, ass, html) => { emailsEnviados.push({ to, ass, html }); return true; };

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
const mod = require('./index');
mod.montar(app, { express, requireAuth, requireAdmin, enviarEmail, alertaAugusto: async () => {}, jwtSecret: 'seg-teste' });
require('../pwa').montar(app); // manifest + SW por produto (onda 4)
const { db } = require('./db');
const repo = require('./repo');

// ---- harness HTTP com um cookie jar por pessoa ----
let BASE = '', ok = 0;
const falhas = [];
const jars = {};
async function req(metodo, caminho, { corpo, como = '', staff = 'adm', headers: hx } = {}) {
  const headers = { 'Content-Type': 'application/json', 'x-test-user': staff, ...(hx || {}) };
  if (como) {
    const jar = jars[como] || {};
    const c = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (c) headers.Cookie = c;
  }
  const r = await fetch(BASE + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined, redirect: 'manual' });
  if (como) {
    jars[como] = jars[como] || {};
    (r.headers.getSetCookie ? r.headers.getSetCookie() : []).forEach((ck) => { const [kv] = ck.split(';'); const i = kv.indexOf('='); jars[como][kv.slice(0, i)] = kv.slice(i + 1); });
  }
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch (_) {}
  return { st: r.status, json, texto };
}
async function t(nome, fn) {
  try { await fn(); ok++; console.log('  ✅', nome); }
  catch (e) { falhas.push(nome + ': ' + e.message); console.log('  ❌', nome, '—', e.message); }
}

async function criarFamilia(apelido, nome, email) {
  const r = await req('POST', '/kids/api/cadastrar', {
    como: apelido,
    corpo: { nome, email, senha: 'senha-forte-8', aceite_termos: true, consentimento_parental: true },
  });
  assert.equal(r.st, 200, 'cadastro ' + apelido + ': ' + JSON.stringify(r.json));
  return r.json.usuario;
}

async function rodar() {
  const srv = app.listen(0);
  BASE = 'http://127.0.0.1:' + srv.address().port;
  console.log('Villela Kids — selftest\n');

  // ================= páginas públicas =================
  await t('páginas públicas respondem 200 (home, entrar, termos, privacidade, app)', async () => {
    for (const p of ['/kids', '/kids/entrar', '/kids/termos', '/kids/privacidade', '/kids/app']) {
      assert.equal((await req('GET', p)).st, 200, p);
    }
  });
  await t('landing traz os 4 eixos, o aviso de beta fechado e o bloco de segurança dos pais', async () => {
    const r = await req('GET', '/kids');
    for (const trecho of ['Pensar', 'Criar', 'Comunicar', 'Realizar', 'Beta fechado', 'Para os pais', 'LGPD']) {
      assert.ok(r.texto.includes(trecho), 'faltou: ' + trecho);
    }
  });
  await t('textos jurídicos carregam a tarja de MINUTA', async () => {
    for (const p of ['/kids/termos', '/kids/privacidade']) {
      assert.ok((await req('GET', p)).texto.includes('MINUTA'), p + ' sem tarja');
    }
  });
  await t('robots.txt bloqueia /kids/app e /kids/api; sitemap responde', async () => {
    const r = await req('GET', '/kids/robots.txt');
    assert.ok(r.texto.includes('Disallow: /kids/app') && r.texto.includes('Disallow: /kids/api'));
    assert.equal((await req('GET', '/kids/sitemap.xml')).st, 200);
  });
  await t('bundle do app é servido com cache imutável', async () => {
    const r = await fetch(BASE + '/kids/app.js');
    assert.equal(r.status, 200);
    assert.ok(String(r.headers.get('cache-control') || '').includes('immutable'));
  });

  // ================= conta do responsável =================
  await t('cadastro SEM consentimento parental é recusado (LGPD art. 14)', async () => {
    const r = await req('POST', '/kids/api/cadastrar', { corpo: { nome: 'X', email: 'x@t.com', senha: 'senha-forte-8', aceite_termos: true } });
    assert.equal(r.st, 400);
    assert.ok(/consentimento/i.test(r.json.erro));
  });
  await t('cadastro sem aceite de termos é recusado', async () => {
    const r = await req('POST', '/kids/api/cadastrar', { corpo: { nome: 'X', email: 'x2@t.com', senha: 'senha-forte-8', consentimento_parental: true } });
    assert.equal(r.st, 400);
  });
  await t('cadastro completo cria sessão e envia e-mail de boas-vindas', async () => {
    await criarFamilia('ana', 'Ana Mãe', 'ana@t.com');
    const me = await req('GET', '/kids/api/me', { como: 'ana' });
    assert.equal(me.st, 200);
    assert.equal(me.json.usuario.email, 'ana@t.com');
    assert.ok(emailsEnviados.some((e) => e.to === 'ana@t.com'));
  });
  await t('API autenticada sem sessão devolve 401', async () => {
    assert.equal((await req('GET', '/kids/api/me')).st, 401);
    assert.equal((await req('GET', '/kids/api/criancas')).st, 401);
  });

  // ================= perfis de criança =================
  let ana1 = null;
  await t('perfil de criança nasce mínimo (apelido + faixa + avatar)', async () => {
    const r = await req('POST', '/kids/api/criancas', { como: 'ana', corpo: { apelido: 'Duda', faixa: '7-8', avatar: '🦖' } });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    ana1 = r.json.crianca;
    assert.equal(ana1.apelido, 'Duda');
    const cols = Object.keys(ana1);
    for (const proibida of ['nome_completo', 'nascimento', 'email', 'foto']) assert.ok(!cols.includes(proibida));
  });
  await t('apelido com cara de dado pessoal (e-mail/números longos) é recusado', async () => {
    assert.equal((await req('POST', '/kids/api/criancas', { como: 'ana', corpo: { apelido: 'duda@gmail.com' } })).st, 400);
    assert.equal((await req('POST', '/kids/api/criancas', { como: 'ana', corpo: { apelido: 'Duda 2015' } })).st, 400);
  });
  await t('limite de perfis por conta é respeitado', async () => {
    const max = repo.Config.num('max_perfis_por_conta', 6);
    for (let i = 2; i <= max; i++) {
      assert.equal((await req('POST', '/kids/api/criancas', { como: 'ana', corpo: { apelido: 'Filho ' + 'abc'[i % 3] + i } })).st, 200);
    }
    const r = await req('POST', '/kids/api/criancas', { como: 'ana', corpo: { apelido: 'Extra' } });
    assert.equal(r.st, 400);
    assert.ok(/limite/i.test(r.json.erro));
  });

  // ================= trilha e portfólio =================
  await t('trilha nasce com a missão 1 disponível e as demais bloqueadas', async () => {
    const r = await req('GET', `/kids/api/criancas/${ana1.id}/missoes`, { como: 'ana' });
    assert.equal(r.st, 200);
    assert.equal(r.json.missoes.length, 8);
    assert.equal(r.json.missoes[0].status, 'disponivel');
    for (const m of r.json.missoes.slice(1)) assert.equal(m.status, 'bloqueada', m.id);
  });
  await t('iniciar missão bloqueada é recusado', async () => {
    const r = await req('POST', `/kids/api/criancas/${ana1.id}/missoes/m03-estudio-ilustracao/iniciar`, { como: 'ana' });
    assert.equal(r.st, 400);
  });
  await t('concluir sem ter iniciado é recusado; concluir sem criação também', async () => {
    assert.equal((await req('POST', `/kids/api/criancas/${ana1.id}/missoes/m01-meu-assistente/concluir`, { como: 'ana', corpo: { titulo: 'x', conteudo: 'y' } })).st, 400);
    assert.equal((await req('POST', `/kids/api/criancas/${ana1.id}/missoes/m01-meu-assistente/iniciar`, { como: 'ana' })).st, 200);
    assert.equal((await req('POST', `/kids/api/criancas/${ana1.id}/missoes/m01-meu-assistente/concluir`, { como: 'ana', corpo: { titulo: '', conteudo: '' } })).st, 400);
  });
  await t('concluir com criação grava o portfólio, abre a missão 2 e avisa o responsável', async () => {
    const r = await req('POST', `/kids/api/criancas/${ana1.id}/missoes/m01-meu-assistente/concluir`, {
      como: 'ana', corpo: { titulo: 'Manual do Robi', conteudo: 'Regra 1: perguntar direito. Regra 2: conferir.' },
    });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    assert.ok(r.json.portfolio_id);
    assert.equal(r.json.proxima.id, 'm02-minha-historia');
    const trilha = (await req('GET', `/kids/api/criancas/${ana1.id}/missoes`, { como: 'ana' })).json.missoes;
    assert.equal(trilha[0].status, 'concluida');
    assert.equal(trilha[1].status, 'disponivel');
    const pf = (await req('GET', `/kids/api/criancas/${ana1.id}/portfolio`, { como: 'ana' })).json.portfolio;
    assert.equal(pf.length, 1);
    assert.equal(pf[0].titulo, 'Manual do Robi');
    const notif = (await req('GET', '/kids/api/notificacoes', { como: 'ana' })).json.notificacoes;
    assert.ok(notif.some((n) => n.titulo.includes('Duda') && n.titulo.includes('concluiu')));
  });
  await t('concluir a mesma missão duas vezes é recusado', async () => {
    const r = await req('POST', `/kids/api/criancas/${ana1.id}/missoes/m01-meu-assistente/concluir`, { como: 'ana', corpo: { titulo: 'De novo', conteudo: 'x' } });
    assert.equal(r.st, 400);
  });

  // ================= isolamento entre famílias =================
  await t('família B não enxerga nem opera a criança da família A', async () => {
    await criarFamilia('bia', 'Bia Mãe', 'bia@t.com');
    for (const [metodo, caminho, corpo] of [
      ['GET', `/kids/api/criancas/${ana1.id}/missoes`],
      ['GET', `/kids/api/criancas/${ana1.id}/portfolio`],
      ['POST', `/kids/api/criancas/${ana1.id}/missoes/m02-minha-historia/iniciar`],
      ['PATCH', `/kids/api/criancas/${ana1.id}`, { apelido: 'Hackeada' }],
      ['DELETE', `/kids/api/criancas/${ana1.id}`],
    ]) {
      const r = await req(metodo, caminho, { como: 'bia', corpo });
      assert.equal(r.st, 400, metodo + ' ' + caminho + ' → ' + r.st);
      assert.ok(/não encontrado/i.test(r.json.erro), r.json.erro);
    }
  });

  // ================= missão guiada (onda 2) =================
  // Sem ANTHROPIC_API_KEY no ambiente de teste, o tutor nasce no "modo
  // simples" — o que também prova que a missão nunca depende do LLM.
  let nina = null;
  const J = (mid) => `/kids/api/criancas/${nina.id}/missoes/${mid}/jogo`;
  await t('as 8 missões têm modo guiado (onda 3 completou os roteiros)', async () => {
    nina = (await req('POST', '/kids/api/criancas', { como: 'bia', corpo: { apelido: 'Nina', faixa: '7-8', avatar: '🐼' } })).json.crianca;
    const trilha = (await req('GET', `/kids/api/criancas/${nina.id}/missoes`, { como: 'bia' })).json.missoes;
    assert.equal(trilha.length, 8);
    for (const m of trilha) assert.equal(m.tem_roteiro, true, m.id + ' sem roteiro');
  });
  await t('todo roteiro é bem formado (ids únicos, textos renderizam, criação compõe)', async () => {
    const { ROTEIROS } = require('./roteiros');
    assert.equal(Object.keys(ROTEIROS).length, 8);
    for (const [mid, rot] of Object.entries(ROTEIROS)) {
      const ids = rot.etapas.map((e) => e.id);
      assert.equal(new Set(ids).size, ids.length, mid + ': etapa com id repetido');
      assert.notEqual(rot.etapas[0].tipo, 'concluir', mid + ': primeira etapa não pode concluir');
      assert.equal(rot.etapas[rot.etapas.length - 1].tipo, 'concluir', mid + ': última etapa deve concluir');
      const respostas = {};
      for (const e of rot.etapas) respostas[e.id] = 'Resposta sintética bem comprida para passar em qualquer validação de tamanho mínimo do roteiro.';
      respostas['nome'] = 'Robi';
      const ctx = { assistente: 'Robi', apelido: 'Teste', respostas };
      for (const e of rot.etapas) {
        assert.ok(['entrada', 'avancar', 'concluir'].includes(e.tipo), mid + '/' + e.id + ': tipo inválido');
        assert.ok(typeof e.objetivo === 'string' && e.objetivo.length > 10, mid + '/' + e.id + ': sem objetivo pedagógico');
        const txt = e.texto(ctx);
        assert.ok(typeof txt === 'string' && txt.length >= 30, mid + '/' + e.id + ': texto curto demais');
        if (e.tipo === 'entrada') {
          assert.ok(e.entrada && e.entrada.rotulo, mid + '/' + e.id + ': entrada sem rótulo');
          assert.ok((e.entrada.min || 1) < (e.entrada.max || 500), mid + '/' + e.id + ': min/max invertidos');
        }
        if (e.conversa) assert.ok(Array.isArray(e.fallbacks) && e.fallbacks.length >= 1, mid + '/' + e.id + ': etapa com chat precisa de fallback');
      }
      const criacao = rot.montarCriacao(respostas, { apelido: 'Teste' });
      assert.ok(criacao.titulo_sugerido && criacao.conteudo && criacao.conteudo.length > 40, mid + ': montarCriacao vazia');
    }
  });
  await t('níveis: 0 concluídas = Explorador, 8 = Visionário, e o mapa é monotônico', async () => {
    assert.equal(repo.nivelDe(0).nome, 'Explorador');
    assert.equal(repo.nivelDe(1).nome, 'Inventor');
    assert.equal(repo.nivelDe(8).nome, 'Visionário');
    assert.equal(repo.NIVEIS.length, 9);
  });
  await t('jogo exige a missão iniciada; estado inicial é a etapa do nome, sem chat', async () => {
    assert.equal((await req('GET', J('m01-meu-assistente'), { como: 'bia' })).st, 400);
    await req('POST', `/kids/api/criancas/${nina.id}/missoes/m01-meu-assistente/iniciar`, { como: 'bia' });
    const g = (await req('GET', J('m01-meu-assistente'), { como: 'bia' })).json.jogo;
    assert.equal(g.indice, 1);
    assert.equal(g.total, 7);
    assert.equal(g.etapa.id, 'nome');
    assert.equal(g.etapa.conversa, false);
    assert.equal(g.tutor.motor, 'simples');
    assert.ok(g.etapa.texto.includes('Nina'), 'texto não personalizou o apelido');
  });
  await t('etapa sem chat recusa conversa; avançar valida a entrada (vazia e com telefone)', async () => {
    assert.equal((await req('POST', J('m01-meu-assistente') + '/responder', { como: 'bia', corpo: { texto: 'oi' } })).st, 400);
    assert.equal((await req('POST', J('m01-meu-assistente') + '/avancar', { como: 'bia', corpo: { entrada: '' } })).st, 400);
    const r = await req('POST', J('m01-meu-assistente') + '/avancar', { como: 'bia', corpo: { entrada: '61987654321' } });
    assert.equal(r.st, 400);
    assert.ok(/dados pessoais/i.test(r.json.erro));
  });
  await t('dar nome ao assistente avança e o nome entra nos textos seguintes', async () => {
    const g = (await req('POST', J('m01-meu-assistente') + '/avancar', { como: 'bia', corpo: { entrada: 'Robi' } })).json.jogo;
    assert.equal(g.etapa.id, 'pergunta');
    assert.equal(g.etapa.conversa, true);
    assert.equal(g.tutor.nome, 'Robi');
    assert.ok(g.etapa.texto.includes('Robi'));
  });
  await t('concluir antes da última etapa é recusado', async () => {
    assert.equal((await req('POST', J('m01-meu-assistente') + '/concluir', { como: 'bia', corpo: { titulo: 'x' } })).st, 400);
  });
  await t('chat no modo simples responde com os fallbacks curados do roteiro', async () => {
    const r = (await req('POST', J('m01-meu-assistente') + '/responder', { como: 'bia', corpo: { texto: 'como faço uma pergunta boa?' } })).json;
    assert.equal(r.motor, 'simples');
    assert.ok(/DETALHE|CONTEXTO|PEDIDO/.test(r.resposta), 'fallback fora do roteiro: ' + r.resposta);
  });
  await t('guarda: dado pessoal no chat não vai ao tutor e volta com orientação', async () => {
    const r = (await req('POST', J('m01-meu-assistente') + '/responder', { como: 'bia', corpo: { texto: 'meu telefone é 61999998888' } })).json;
    assert.equal(r.motor, 'guarda');
    assert.ok(/dados pessoais/i.test(r.resposta));
  });
  await t('guarda: sinal de risco aciona notificação imediata ao responsável', async () => {
    const r = (await req('POST', J('m01-meu-assistente') + '/responder', { como: 'bia', corpo: { texto: 'às vezes eu quero sumir' } })).json;
    assert.equal(r.motor, 'guarda');
    assert.ok(/respons/i.test(r.resposta));
    const notif = (await req('GET', '/kids/api/notificacoes', { como: 'bia' })).json.notificacoes;
    assert.ok(notif.some((x) => x.tipo === 'alerta' && x.titulo.includes('Nina')), 'sem notificação de alerta');
  });
  await t('limite de trocas por etapa fecha o chat com convite à atividade', async () => {
    let ultimo = null;
    for (let i = 0; i < 6; i++) {
      ultimo = (await req('POST', J('m01-meu-assistente') + '/responder', { como: 'bia', corpo: { texto: 'conta mais ' + i } })).json;
    }
    assert.equal(ultimo.motor, 'guarda');
    assert.ok(/mão na massa/i.test(ultimo.resposta));
  });
  await t('trilha completa: pergunta → do meu jeito → pegadinha → revelação → regras → manual', async () => {
    let g = (await req('POST', J('m01-meu-assistente') + '/avancar', { como: 'bia', corpo: { entrada: 'Como os polvos respiram no fundo do mar? Quero uma lista curta para contar na escola.' } })).json.jogo;
    assert.equal(g.etapa.id, 'do-meu-jeito');
    g = (await req('POST', J('m01-meu-assistente') + '/avancar', { como: 'bia', corpo: { entrada: 'Pedi para explicar o céu azul como futebol e entendi!' } })).json.jogo;
    assert.equal(g.etapa.id, 'pegadinha');
    g = (await req('POST', J('m01-meu-assistente') + '/avancar', { como: 'bia', corpo: { entrada: 'O 2, porque astronauta diz que não dá para ver' } })).json.jogo;
    assert.equal(g.etapa.id, 'revelacao');
    assert.ok(g.etapa.texto.includes('Muralha'), 'revelação sem a resposta curada');
    assert.ok(g.etapa.texto.includes('O 2, porque'), 'revelação não citou o palpite da criança');
    g = (await req('POST', J('m01-meu-assistente') + '/avancar', { como: 'bia', corpo: {} })).json.jogo;
    assert.equal(g.etapa.id, 'regras');
    g = (await req('POST', J('m01-meu-assistente') + '/avancar', { como: 'bia', corpo: { entrada: '1. Perguntar com detalhe\n2. Pedir do meu jeito\n3. Conferir tudo\n4. Não contar meus dados\n5. A IA também erra' } })).json.jogo;
    assert.equal(g.etapa.id, 'manual');
    assert.ok(g.previa && g.previa.titulo_sugerido === 'O Manual do Robi');
    assert.ok(g.previa.conteudo.includes('MANUAL DO ROBI') && g.previa.conteudo.includes('Conferir tudo'));
  });
  await t('concluir a missão guiada compõe o Manual no portfólio e abre a missão 2', async () => {
    const r = await req('POST', J('m01-meu-assistente') + '/concluir', { como: 'bia', corpo: { titulo: '' } });
    assert.equal(r.st, 200, JSON.stringify(r.json));
    const pf = (await req('GET', `/kids/api/criancas/${nina.id}/portfolio`, { como: 'bia' })).json.portfolio;
    assert.equal(pf.length, 1);
    assert.equal(pf[0].titulo, 'O Manual do Robi');
    assert.ok(pf[0].conteudo.includes('por Nina'));
    const trilha = (await req('GET', `/kids/api/criancas/${nina.id}/missoes`, { como: 'bia' })).json.missoes;
    assert.equal(trilha[0].status, 'concluida');
    assert.equal(trilha[1].status, 'disponivel');
  });
  await t('LLM fake: resposta validada é saneada (sem links) e alerta vira notificação; falha cai no modo simples', async () => {
    const iaLlm = require('./ia-llm');
    const lalo = (await req('POST', '/kids/api/criancas', { como: 'bia', corpo: { apelido: 'Lalo', avatar: '🦊' } })).json.crianca;
    const JL = (rota) => `/kids/api/criancas/${lalo.id}/missoes/m01-meu-assistente/jogo${rota}`;
    await req('POST', `/kids/api/criancas/${lalo.id}/missoes/m01-meu-assistente/iniciar`, { como: 'bia' });
    await req('POST', JL('/avancar'), { como: 'bia', corpo: { entrada: 'Zug' } });

    iaLlm._injetarParaTeste(() => ({ resposta: 'Boa pergunta! Veja https://exemplo.com/x e [clique aqui](https://y.com).', alerta_responsavel: '' }));
    let r = (await req('POST', JL('/responder'), { como: 'bia', corpo: { texto: 'me ajuda?' } })).json;
    assert.equal(r.motor, 'llm');
    assert.ok(!r.resposta.includes('https://'), 'link vazou: ' + r.resposta);
    assert.ok(r.resposta.includes('[link removido]'));

    iaLlm._injetarParaTeste(() => ({ resposta: 'Entendi. Que tal contar isso para alguém da sua casa?', alerta_responsavel: 'A criança relatou situação que merece atenção do responsável.' }));
    await req('POST', JL('/responder'), { como: 'bia', corpo: { texto: 'uma coisa aconteceu' } });
    const notif = (await req('GET', '/kids/api/notificacoes', { como: 'bia' })).json.notificacoes;
    assert.ok(notif.some((x) => x.tipo === 'alerta' && x.titulo.includes('Lalo')), 'alerta do LLM não virou notificação');

    iaLlm._injetarParaTeste(() => { throw new Error('timeout simulado'); });
    r = (await req('POST', JL('/responder'), { como: 'bia', corpo: { texto: 'e agora?' } })).json;
    assert.equal(r.motor, 'simples');
    iaLlm._injetarParaTeste(null);
  });
  await t('missão 2 guiada: o nome do assistente da missão 1 acompanha (continuidade)', async () => {
    await req('POST', `/kids/api/criancas/${nina.id}/missoes/m02-minha-historia/iniciar`, { como: 'bia' });
    const g = (await req('GET', J('m02-minha-historia'), { como: 'bia' })).json.jogo;
    assert.equal(g.indice, 1);
    assert.equal(g.etapa.id, 'escolha');
    assert.equal(g.tutor.nome, 'Robi', 'o nome dado na missão 1 não acompanhou');
  });
  await t('missão 2 completa: escrita própria vira história no portfólio e sobe o nível', async () => {
    const passos = [
      ['escolha', 'Minha avó destemida, na feira do bairro, no dia em que o dinheiro do almoço sumiu.'],
      ['comeco', 'A feira acordava cedo e cheirava a pastel com caldo de cana. Minha avó segurava minha mão firme enquanto escolhia tomates, e o rádio da banca tocava uma música antiga.'],
      ['encruzilhada', 'Na hora de pagar, a carteira não estava na bolsa. Minha avó ficou pálida, olhou para mim, e o feirante cruzou os braços esperando. Todo mundo na fila olhava para a gente.'],
      ['final', 'Foi o menino da banca vizinha que achou a carteira caída perto dos limões. Minha avó agradeceu com um abraço apertado e comprou um pastel para ele também.'],
      ['revisao', 'A feira acordava cedo e cheirava a pastel. Minha avó segurava minha mão enquanto escolhia tomates. Na hora de pagar, a carteira sumiu, e a fila inteira olhava para a gente. No fim, o menino da banca dos limões achou a carteira no chão, e minha avó comprou um pastel para ele também. Naquele dia aprendi que ajuda vem de onde a gente menos espera.'],
    ];
    let g = null;
    for (const [id, entrada] of passos) {
      const r = await req('POST', J('m02-minha-historia') + '/avancar', { como: 'bia', corpo: { entrada } });
      assert.equal(r.st, 200, id + ': ' + JSON.stringify(r.json));
      g = r.json.jogo;
    }
    assert.equal(g.etapa.tipo, 'concluir');
    assert.equal(g.previa.titulo_sugerido, 'A história de Nina');
    const fim = (await req('POST', J('m02-minha-historia') + '/concluir', { como: 'bia', corpo: { titulo: 'O dia da feira' } })).json;
    assert.equal(fim.ok, true);
    assert.equal(fim.nivel.nome, 'Criador', 'nível esperado após 2 missões');
    assert.equal(fim.subiu_nivel, true);
    const pf = (await req('GET', `/kids/api/criancas/${nina.id}/portfolio`, { como: 'bia' })).json.portfolio;
    assert.equal(pf.length, 2);
    assert.ok(pf[0].conteudo.includes('pastel'), 'história não foi para o portfólio');
    const trilha = (await req('GET', `/kids/api/criancas/${nina.id}/missoes`, { como: 'bia' })).json;
    assert.equal(trilha.missoes[2].status, 'disponivel');
    assert.equal(trilha.crianca.nivel.nome, 'Criador');
    const notif = (await req('GET', '/kids/api/notificacoes', { como: 'bia' })).json.notificacoes;
    assert.ok(notif.some((n) => n.titulo.includes('🎖️') && n.titulo.includes('Criador')), 'sem notificação de nível');
  });
  await t('/me devolve o nível de cada criança para o painel da família', async () => {
    const me = (await req('GET', '/kids/api/me', { como: 'bia' })).json;
    const n = me.criancas.find((c) => c.apelido === 'Nina');
    assert.equal(n.nivel.nome, 'Criador');
    assert.equal(n.nivel.concluidas, 2);
  });
  // ================= onda 4: painel dos pais, push e PWA =================
  await t('painel dos pais consolida nível, progresso, evidências e atividade', async () => {
    const painel = (await req('GET', '/kids/api/painel', { como: 'bia' })).json.painel;
    const p = painel.find((x) => x.crianca.apelido === 'Nina');
    assert.ok(p, 'Nina fora do painel');
    assert.equal(p.nivel.nome, 'Criador');
    assert.equal(p.progresso.concluidas, 2);
    assert.equal(p.progresso.total, 8);
    assert.equal(p.progresso.atual.id, 'm03-estudio-ilustracao');
    assert.ok(p.progresso.atual.momento_familia.length > 10, 'sem momento família');
    assert.equal(p.criacoes.length, 2);
    assert.ok(p.atividade.conversas_com_tutor > 0, 'conversas não contadas');
    assert.ok(p.atividade.dias_ativos >= 1 && p.atividade.ultima, 'atividade vazia');
    const campos = Object.keys(p.crianca);
    assert.deepEqual(campos.sort(), ['apelido', 'avatar', 'faixa', 'id'], 'painel expôs mais que o mínimo da criança');
  });
  await t('push: sem VAPID a chave se declara indisponível; inscrever/remover funcionam e nada quebra', async () => {
    const ch = (await req('GET', '/kids/api/push/chave')).json;
    assert.equal(ch.disponivel, false);
    const r = await req('POST', '/kids/api/push/inscrever', { como: 'bia', corpo: { assinatura: { endpoint: 'https://push.exemplo/e1', keys: {} } } });
    assert.equal(r.st, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM push_subs').get().c, 1);
    // uma notificação com assinatura registrada e sem VAPID não pode explodir
    repo.Notificacoes.criar(repo.Users.porEmail('bia@t.com').id, { titulo: 'Teste push', texto: 'best-effort' });
    assert.equal((await req('POST', '/kids/api/push/remover', { como: 'bia', corpo: { endpoint: 'https://push.exemplo/e1' } })).st, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM push_subs').get().c, 0);
  });
  await t('PWA: manifest e service worker do /kids saem com a marca própria; assets existem', async () => {
    const m = (await req('GET', '/kids/manifest.webmanifest')).json;
    assert.equal(m.name, 'Villela Kids');
    assert.equal(m.theme_color, '#0F766E');
    assert.equal(m.start_url, '/kids/app');
    assert.ok(m.icons.every((i) => i.src.includes('villela-kids')));
    const sw = (await req('GET', '/kids/sw.js')).texto;
    assert.ok(sw.includes("addEventListener('push'") && sw.includes('villela-kids'), 'SW sem push/marca');
    const fs = require('fs');
    const path = require('path');
    for (const a of ['favicon.svg', 'simbolo.svg', 'logo-negativo.svg', 'logo-horizontal.svg', 'favicon-192.png', 'icon-pwa.png', 'apple-touch-icon.png', 'og-image.png']) {
      assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'brand', 'villela-kids', a)), 'asset ausente: ' + a);
    }
    const home = (await req('GET', '/kids')).texto;
    assert.ok(home.includes('/kids/manifest.webmanifest') && home.includes('/kids/sw.js'), 'HEAD sem tags de PWA');
  });

  await t('isolamento também vale para o jogo: outra família não joga a missão de Nina', async () => {
    const r = await req('GET', `/kids/api/criancas/${nina.id}/missoes/m01-meu-assistente/jogo`, { como: 'ana' });
    assert.equal(r.st, 400);
    assert.ok(/não encontrado/i.test(r.json.erro));
  });

  // ================= LGPD =================
  await t('exportar dados traz a família inteira e nunca o hash de senha', async () => {
    const r = await req('GET', '/kids/api/meus-dados', { como: 'ana' });
    assert.equal(r.st, 200);
    assert.ok(!('senha_hash' in r.json.conta) && !('verif_token' in r.json.conta));
    assert.ok(r.json.criancas.length >= 1);
    const duda = r.json.criancas.find((c) => c.apelido === 'Duda');
    assert.equal(duda.portfolio.length, 1);
  });
  await t('excluir a conta APAGA criações e perfis de verdade (não anonimiza criança)', async () => {
    await criarFamilia('caio', 'Caio Pai', 'caio@t.com');
    const c = (await req('POST', '/kids/api/criancas', { como: 'caio', corpo: { apelido: 'Nino' } })).json.crianca;
    await req('POST', `/kids/api/criancas/${c.id}/missoes/m01-meu-assistente/iniciar`, { como: 'caio' });
    await req('POST', `/kids/api/criancas/${c.id}/missoes/m01-meu-assistente/concluir`, { como: 'caio', corpo: { titulo: 'T', conteudo: 'C' } });
    const r = await req('POST', '/kids/api/excluir-conta', { como: 'caio' });
    assert.equal(r.st, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM children WHERE id = ?').get(c.id).c, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM portfolio WHERE child_id = ?').get(c.id).c, 0);
    assert.equal((await req('GET', '/kids/api/me', { como: 'caio' })).st, 401);
  });

  // ================= seed demo =================
  await t('seed demo criou a família de demonstração com o ciclo completo', async () => {
    const r = await req('POST', '/kids/api/login', { corpo: { email: 'familia@demo.kids', senha: 'SenhaDemo!2026' }, como: 'demo' });
    assert.equal(r.st, 200);
    const me = (await req('GET', '/kids/api/me', { como: 'demo' })).json;
    assert.equal(me.criancas.length, 1);
    const trilha = (await req('GET', `/kids/api/criancas/${me.criancas[0].id}/missoes`, { como: 'demo' })).json.missoes;
    assert.equal(trilha[0].status, 'concluida');
    assert.equal(trilha[1].status, 'em_andamento');
  });

  // ================= staff =================
  await t('staff: dashboard consolida famílias, crianças, funil e últimas criações', async () => {
    const r = await req('GET', '/staff/api/kids/dashboard');
    assert.equal(r.st, 200);
    assert.ok(r.json.familias >= 3);
    assert.ok(r.json.criacoes >= 2);
    assert.equal(r.json.funil.length, 8);
    assert.ok(r.json.funil[0].concluidas >= 2);
    assert.ok(r.json.ultimas_criacoes.length >= 2);
  });
  await t('staff: catálogo lista as 8 missões; despublicar exige admin e some da trilha', async () => {
    assert.equal((await req('GET', '/staff/api/kids/missoes')).json.missoes.length, 8);
    assert.equal((await req('PATCH', '/staff/api/kids/missoes/m08-detetive-digital', { staff: 'op', corpo: { ativa: false } })).st, 403);
    assert.equal((await req('PATCH', '/staff/api/kids/missoes/m08-detetive-digital', { corpo: { ativa: false } })).st, 200);
    const trilha = (await req('GET', `/kids/api/criancas/${ana1.id}/missoes`, { como: 'ana' })).json.missoes;
    assert.equal(trilha.length, 7);
    assert.equal((await req('PATCH', '/staff/api/kids/missoes/m08-detetive-digital', { corpo: { ativa: true } })).st, 200);
  });
  await t('staff: bloquear família exige admin, derruba a sessão e reativar devolve', async () => {
    const bia = repo.Users.porEmail('bia@t.com');
    assert.equal((await req('POST', `/staff/api/kids/familias/${bia.id}/bloquear`, { staff: 'op', corpo: { motivo: 'x' } })).st, 403);
    assert.equal((await req('POST', `/staff/api/kids/familias/${bia.id}/bloquear`, { corpo: { motivo: 'teste' } })).st, 200);
    assert.equal((await req('GET', '/kids/api/me', { como: 'bia' })).st, 401);
    assert.equal((await req('POST', `/staff/api/kids/familias/${bia.id}/reativar`)).st, 200);
    assert.equal((await req('GET', '/kids/api/me', { como: 'bia' })).st, 200);
  });
  await t('staff: auditoria registra criação de conta, LGPD e ações de admin', async () => {
    const a = (await req('GET', '/staff/api/kids/auditoria')).json.auditoria;
    for (const acao of ['conta.criar', 'lgpd.exportar', 'lgpd.excluir', 'missao.desativar', 'usuario.bloquear']) {
      assert.ok(a.some((x) => x.acao === acao), 'faltou auditoria: ' + acao);
    }
  });

  // Por último de propósito: o bloqueio vale 15 min para o IP inteiro e
  // derrubaria qualquer login feito por um teste posterior.
  await t('login errado dá 401; 5 erros seguidos bloqueiam por IP (429)', async () => {
    for (let i = 0; i < 5; i++) {
      assert.equal((await req('POST', '/kids/api/login', { corpo: { email: 'ana@t.com', senha: 'errada-123' } })).st, 401);
    }
    assert.equal((await req('POST', '/kids/api/login', { corpo: { email: 'ana@t.com', senha: 'errada-123' } })).st, 429);
  });

  srv.close();
  console.log(`\n${ok} teste(s) ok, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach((f) => console.log('  ✗', f)); process.exit(1); }
}

rodar().catch((e) => { console.error(e); process.exit(1); });
