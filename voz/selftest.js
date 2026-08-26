// =====================================================================
// Voz — suíte da FASE 0.   npm run test:voz
//
// Cada teste existe porque, sem ele, uma trava do plano seria só um
// parágrafo. Por isso quase todos VIOLAM a trava de propósito e exigem
// que ela segure:
//
//   contrato   as duas funções são assimétricas (§3): consultar responde,
//              executar só devolve recibo — nunca o resultado
//   trava 1    o nível vem do CATÁLOGO, e ação desconhecida não é leitura
//   trava 2    `consultar` fisicamente não escreve — nível E mapa
//   trava 3    autorização é uso único, expira, e a CHAVE não aprova
//   trava 4    dado pessoal não sai por mensagem, nem quebra de linha
//   trava 5    telefone fora da lista não vira comando (leitor ≠ executor)
//   trava 6    repetir não é pedir de novo
//   trava 7    o interruptor derruba `executar` e preserva `consultar`
//   trava 8    a transcrição original fica gravada
//   fila       `codigo` travada, DLQ para handler ausente, idempotência
// =====================================================================
'use strict';
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'voz-selftest-' + Date.now());
process.env.NODE_ENV = 'development';
process.env.VOZ_FILA_OFF = '1';            // o teste processa a fila À MÃO
process.env.VOZ_EXECUTAR = 'on';
process.env.VOZ_AUDIO_MAX_BYTES = '4096';  // teto pequeno: as travas de tamanho ficam baratas de testar
delete process.env.VOZ_STT_PROVEDOR;       // a transcrição tem de começar INDISPONÍVEL
delete process.env.OPENAI_API_KEY;
delete process.env.VOZ_FILA_CODIGO;        // a fila `codigo` tem de nascer travada
delete process.env.ANTHROPIC_API_KEY;      // sem rede: exercita o interpretador determinístico
require('fs').mkdirSync(process.env.DATA_DIR, { recursive: true });

const assert = require('assert');
const express = require('express');

const CHAVE = 'chave-de-teste';
process.env.PUBLISH_KEY = CHAVE;

// ---- staff falso ----
const STAFF = [
  { id: 'adm', nome: 'Admin', email: 'adm@t', papel: 'admin', ativo: true },
  { id: 'op', nome: 'Operador', email: 'op@t', papel: 'membro', ativo: true },
];
function requireAuth(req, res, next) {
  const id = req.headers['x-test-user'];
  const u = id && STAFF.find((x) => x.id === id);
  if (!u) return res.status(401).json({ erro: 'não autenticado' });
  req.user = u; next();
}
const requireAdmin = (req, res, next) =>
  (req.user && req.user.papel === 'admin') ? next() : res.status(403).json({ erro: 'apenas administrador' });
function requirePublishOrAdmin(req, res, next) {
  if (req.headers['x-publish-key'] === CHAVE) { req.viaChave = true; return next(); }
  return requireAuth(req, res, () => requireAdmin(req, res, next));
}

// ---- ferramentas falsas: contam chamadas, para provar o que RODOU ----
const chamadas = { leitura: 0, escrita: 0, ultima: null };
const ferramentas = {
  'agenda.dia': async (p) => { chamadas.leitura++; chamadas.ultima = ['agenda.dia', p]; return { chegadas: [], saidas: [] }; },
  'ocupacao.periodo': async (p) => { chamadas.leitura++; return { ocupadas: 7, total: 20, percentual: 35 }; },
  'listas.ver': async (p) => { chamadas.leitura++; return { tipo: p.tipo, total: 0, itens: [] }; },
  'listas.adicionar': async (p) => { chamadas.escrita++; chamadas.ultima = ['listas.adicionar', p]; return { ok: true, item: p }; },
  'tarefa.criar': async (p) => { chamadas.escrita++; chamadas.ultima = ['tarefa.criar', p]; return { ok: true, item: p }; },
  'cliente.cadastrar': async (p) => { chamadas.escrita++; chamadas.ultima = ['cliente.cadastrar', p]; return { ok: true, id: 'cli-1' }; },
};

// ---- WhatsApp falso ----
const enviadas = [];
const enviarWhatsApp = async (to, texto) => { enviadas.push({ to, texto }); return true; };
const alertaAugusto = async (resumo) => { enviadas.push({ to: 'template', texto: resumo }); return true; };

const voz = require('./index');
const { acoes, repo, fila, servico, executor, entrada, notificar, aprovacoes } = voz;
const cerebro = require('./cerebro');

const app = express();
app.use(express.json());
voz.montar(app, {
  express, requireAuth, requireAdmin, requirePublishOrAdmin,
  enviarWhatsApp, alertaAugusto,
  destino: '556192113000',
  baseUrl: 'https://exemplo.test',
  ferramentas,
});

// ---- cérebro roteirizado: o determinístico não cobre nível 3 e 4 ----
// Substituir o módulo (e não passar um parâmetro) é de propósito: assim
// o teste percorre exatamente o mesmo caminho de produção.
const original = cerebro.interpretar;
const roteiro = new Map();
cerebro.interpretar = async (texto) => {
  const k = String(texto || '').trim().toLowerCase();
  // Casa por PREFIXO: `unico()` acrescenta um número ao fim da frase para
  // isolar a janela de idempotência, e o roteiro tem de sobreviver a isso.
  const chave = [...roteiro.keys()].find((c) => k === c || k.startsWith(c + ' '));
  if (chave) return { motor: 'roteiro', parametros: {}, confianca: 0.9, motivo: 'roteiro', ...roteiro.get(chave) };
  return original(texto);
};
const roteirizar = (texto, r) => roteiro.set(String(texto).trim().toLowerCase(), r);

roteirizar('cadastra o cliente joao silva', { acao: 'cliente.cadastrar', parametros: { nome: 'João Silva' } });
roteirizar('manda um email pro pedro', { acao: 'email.enviar', parametros: { para: 'Pedro', corpo: 'oi' } });
roteirizar('manda um email pro bruno', { acao: 'email.enviar', parametros: { para: 'Bruno', corpo: 'b' } });
roteirizar('manda um email pra ana', { acao: 'email.enviar', parametros: { para: 'Ana', corpo: 'a' } });
roteirizar('manda um email pra carla', { acao: 'email.enviar', parametros: { para: 'Carla', corpo: 'c' } });
roteirizar('cadastra o cliente maria souza', { acao: 'cliente.cadastrar', parametros: { nome: 'Maria Souza' } });
roteirizar('cria uma tela de relatorio de consumo', { acao: 'codigo.implementar', parametros: { pedido: 'tela de relatório de consumo' } });
roteirizar('poe leite na lista', { acao: 'listas.adicionar', parametros: { nome: 'leite' } });
roteirizar('quanto foi o faturamento', { acao: 'financeiro.resumo', parametros: {}, confianca: 0.9 });
roteirizar('faz alguma coisa ai', { acao: null, confianca: 0, motivo: 'pedido vago' });
roteirizar('acho que era pra mandar email pro cesar', { acao: 'email.enviar', parametros: { para: 'Cesar', corpo: 'x' }, confianca: 0.25 });

// ---- harness HTTP ----
let BASE = '', ok = 0;
const falhas = [];
async function req(metodo, caminho, { corpo, staff = null, chave = false, cru = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (staff) headers['x-test-user'] = staff;
  if (chave) headers['x-publish-key'] = CHAVE;
  const r = await fetch(BASE + caminho, {
    method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined, redirect: 'manual',
  });
  if (cru) return { status: r.status, texto: await r.text() };
  let json = null;
  try { json = await r.json(); } catch (_) { json = null; }
  return { status: r.status, json };
}
async function t(nome, fn) {
  try { await fn(); ok++; console.log('  ✅ ' + nome); }
  catch (e) { falhas.push({ nome, erro: e.message }); console.log('  ❌ ' + nome + '\n     ' + e.message); }
}
const secao = (s) => console.log('\n— ' + s + ' —');
const rodarFila = () => fila.processarLote(20, 'rapida');
/** Texto único por teste: a idempotência é por janela de tempo e
 *  contaminaria testes vizinhos que dizem a mesma frase. */
let n = 0;
const unico = (s) => `${s} ${++n}`;

(async () => {
  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  BASE = 'http://127.0.0.1:' + srv.address().port;

  // ===================================================================
  secao('Contrato · as duas funções são assimétricas (plano §3)');

  await t('consultar responde na hora, com fala falável', async () => {
    const r = await req('POST', '/staff/api/voz/consultar', { corpo: { pergunta: 'qual a agenda de hoje' }, chave: true });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.acao, 'agenda.dia');
    assert.equal(r.json.status, 'concluido');
    assert.ok(r.json.fala && r.json.fala.length <= 300, 'a fala tem de caber em uma frase');
  });

  await t('executar NUNCA devolve o resultado — só o recibo', async () => {
    const r = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: unico('poe papel higienico na lista de compras') }, chave: true });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.acao, 'listas.adicionar');
    assert.ok(!('resultado' in r.json), 'executar devolveu resultado — é a terceira função que o plano proíbe');
    assert.equal(r.json.status, 'recebido', 'o pedido devia estar só enfileirado, não executado');
  });

  await t('o resultado do executar chega DEPOIS, pelo WhatsApp', async () => {
    const antes = enviadas.length;
    await rodarFila();
    assert.ok(enviadas.length > antes, 'nada foi enviado — a voz prometeu aviso e não cumpriu');
    assert.ok(enviadas.some((e) => /lista de compras/i.test(e.texto)), JSON.stringify(enviadas.slice(-3)));
  });

  // ===================================================================
  secao('Trava 1 · o nível vem do catálogo');

  await t('ação desconhecida NÃO é tratada como leitura', () => {
    assert.equal(acoes.nivelDe('inventada.qualquer'), Infinity,
      'ação fora do catálogo devolveu nível baixo — passaria por toda comparação de teto');
    assert.equal(acoes.exigeAprovacao('inventada.qualquer'), true);
  });

  await t('nível 3 e 4 exigem aprovação; 1 e 2 não', () => {
    assert.equal(acoes.exigeAprovacao('cliente.cadastrar'), true);
    assert.equal(acoes.exigeAprovacao('codigo.implementar'), true);
    assert.equal(acoes.exigeAprovacao('listas.adicionar'), false);
    assert.equal(acoes.exigeAprovacao('agenda.dia'), false);
  });

  await t('o interpretador SABE que dia é hoje — senão "setembro" vira o ano passado', () => {
    // Achado no primeiro teste de reserva (26/08/2026): "15 a 18 de
    // setembro" saiu como 2025-09-15. O modelo nao tem relogio; a data
    // precisa estar no prompt.
    const prompt = require('./cerebro').sistema
      ? require('./cerebro').sistema()
      : require('fs').readFileSync(require('path').join(__dirname, 'cerebro.js'), 'utf8');
    assert.ok(/HOJE É/.test(prompt), 'o prompt precisa dizer a data de hoje');
    assert.ok(/passado/i.test(prompt), 'e proibir data no passado');
  });

  await t('reserva: consultar é nível 1, CRIAR é nível 3', () => {
    // Criar reserva mexe em calendario, dinheiro e na viagem de alguem.
    // Se um dia isso virar nivel 2 "para agilizar", este teste quebra.
    assert.equal(acoes.nivelDe('reserva.disponibilidade'), 1);
    assert.equal(acoes.nivelDe('reserva.criar'), 3);
    assert.equal(acoes.exigeAprovacao('reserva.criar'), true);
  });

  await t('pedido INCOMPLETO pergunta o que falta — não vira "não entendi"', async () => {
    // Achado no uso real (26/08/2026): "Quero fazer uma reserva" voltava
    // como nao_entendido, e o Augusto repetia a frase sem nunca saber o
    // que faltava dizer. O mecanismo de perguntar existia e NUNCA rodava,
    // porque o cerebro recusava a acao antes de chegar nele.
    roteirizar('quero fazer uma reserva', { acao: 'reserva.criar', parametros: {}, confianca: 0.9 });
    const escritasAntes = chamadas.escrita;
    const r = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: unico('quero fazer uma reserva') }, chave: true });
    assert.notEqual(r.json.status, 'nao_entendido', `virou nao_entendido: ${JSON.stringify(r.json)}`);
    assert.ok(r.json.faltando, `devia dizer o que falta: ${JSON.stringify(r.json)}`);
    assert.deepEqual(r.json.faltando.sort(), ['ate', 'de', 'hospede', 'imovel', 'pessoas']);
    // A frase vai ser DITA: nada de chave do codigo nem "e" repetido.
    assert.ok(/Preciso saber/.test(r.json.fala), r.json.fala);
    assert.ok(/o nome do hóspede/.test(r.json.fala), `sem rotulo falavel: ${r.json.fala}`);
    assert.ok(!/imovel|ate|hospede/.test(r.json.fala),
      `a fala saiu com a chave do codigo: ${r.json.fala}`);
    assert.ok(!/ e .* e /.test(r.json.fala), `"a e b e c" em vez de "a, b e c": ${r.json.fala}`);
    await rodarFila();
    assert.equal(chamadas.escrita, escritasAntes, 'executou com dado faltando');
  });

  await t('o prompt PROÍBE recusar por falta de parâmetro', () => {
    // A trava de verdade e o prompt: o mecanismo so e alcancavel se o
    // cerebro nomear a acao.
    const prompt = require('./cerebro').sistema();
    assert.ok(/FALTAR PARÂMETRO NÃO É MOTIVO PARA RECUSAR/.test(prompt));
    assert.ok(/Quero fazer uma reserva/.test(prompt), 'o exemplo concreto ajuda mais que a regra');
  });

  await t('reserva.criar exige TODOS os dados — não reserva para 1 pessoa por omissão', () => {
    // Quantidade de hospedes muda o preco. Assumir 1 em silencio seria
    // reservar errado com cara de acerto.
    const faltam = acoes.faltando('reserva.criar', { imovel: 'Kubitschek', de: '2026-09-12' });
    assert.deepEqual(faltam.sort(), ['ate', 'hospede', 'pessoas']);
  });

  await t('o resumo da reserva diz TUDO que vai acontecer, em uma linha', () => {
    // É o texto que a pessoa lê antes de autorizar. Se ele omitir algo,
    // ela autoriza no escuro.
    const r = acoes.resumir('reserva.criar',
      { imovel: 'Villa Kubitschek', de: '2026-09-12', ate: '2026-09-15', hospede: 'João Silva', pessoas: '4' });
    for (const parte of ['Villa Kubitschek', '2026-09-12', '2026-09-15', 'João Silva', '4 pessoas']) {
      assert.ok(r.includes(parte), `faltou "${parte}" em: ${r}`);
    }
  });

  await t('registrar ferramenta fora do catálogo é recusado', () => {
    assert.throws(() => executor.registrar('nao.existe', async () => 1), /catálogo/);
  });

  // ===================================================================
  secao('Trava 2 · consultar fisicamente não escreve');

  await t('rodar ação de escrita pelo caminho de consulta dá 403', async () => {
    await assert.rejects(
      () => executor.rodar('listas.adicionar', { nome: 'x' }, { somenteLeitura: true }),
      (e) => e.status === 403 && /nível 2/.test(e.message));
  });

  await t('a ferramenta de escrita nem está no mapa de leitura', () => {
    // Trava independente da checagem de nível: mesmo que o `if` acima
    // fosse removido, não há função de escrita alcançável por ali.
    assert.equal(executor.registrar('listas.adicionar', ferramentas['listas.adicionar']), 'escrita');
    assert.equal(executor.registrar('agenda.dia', ferramentas['agenda.dia']), 'leitura');
  });

  await t('pedido de ESCRITA que chega pelo consultar não executa — vai para o caminho certo', async () => {
    const escritasAntes = chamadas.escrita;
    const r = await req('POST', '/staff/api/voz/consultar', { corpo: { pergunta: 'cadastra o cliente joao silva' }, chave: true });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(chamadas.escrita, escritasAntes, 'a consulta EXECUTOU uma escrita');
    assert.equal(r.json.status, 'aguardando_aprovacao', `virou ${r.json.status}`);
  });

  // ===================================================================
  secao('Trava 3 · autorização é clique em sessão, uso único');

  let tokenValido = '';
  await t('nível 3 não executa; gera autorização e avisa', async () => {
    const escritasAntes = chamadas.escrita;
    const r = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: 'cadastra o cliente joao silva' }, chave: true });
    assert.equal(r.json.nivel, 3);
    assert.equal(r.json.precisaAprovacao, true);
    assert.equal(chamadas.escrita, escritasAntes, 'executou sem autorização');
    const link = enviadas.map((e) => e.texto).reverse().find((x) => /\/staff\/voz\/aprovar\//.test(x));
    assert.ok(link, 'não saiu link de autorização no WhatsApp');
    tokenValido = link.match(/\/staff\/voz\/aprovar\/([A-Za-z0-9_-]+)/)[1];
  });

  await t('o banco guarda o HASH, nunca o token', () => {
    const { db } = require('./db');
    const linhas = db.prepare('SELECT token_hash FROM aprovacoes').all();
    assert.ok(linhas.length, 'nenhuma aprovação gravada');
    assert.ok(!linhas.some((l) => l.token_hash === tokenValido), 'o token em claro está no banco');
  });

  await t('a CHAVE não aprova — só a sessão (é a linha de que tudo depende)', async () => {
    const r = await req('POST', `/staff/voz/aprovar/${tokenValido}`, { corpo: { decisao: 'aprovar' }, chave: true });
    assert.equal(r.status, 401,
      'a PUBLISH_KEY aprovou um pedido: o agente de voz autorizaria a si mesmo');
  });

  await t('sessão sem ser admin também não aprova', async () => {
    const r = await req('POST', `/staff/voz/aprovar/${tokenValido}`, { corpo: { decisao: 'aprovar' }, staff: 'op' });
    assert.equal(r.status, 403, JSON.stringify(r.json));
  });

  await t('a página de autorização sem sessão devolve HTML de login, não JSON', async () => {
    const r = await req('GET', `/staff/voz/aprovar/${tokenValido}`, { cru: true });
    assert.equal(r.status, 401);
    assert.ok(/Faça login/i.test(r.texto), 'devia ser uma página, não um blob de JSON');
  });

  await t('com sessão de admin, autoriza e só então executa', async () => {
    const escritasAntes = chamadas.escrita;
    const r = await req('POST', `/staff/voz/aprovar/${tokenValido}`, { corpo: { decisao: 'aprovar' }, staff: 'adm' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(chamadas.escrita, escritasAntes, 'executou dentro do clique, sem passar pela fila');
    await rodarFila();
    assert.equal(chamadas.escrita, escritasAntes + 1, 'não executou depois de autorizado');
    assert.equal(chamadas.ultima[0], 'cliente.cadastrar');
  });

  // ---- o que o PRIMEIRO nível 3 real (26/08/2026) expôs ----

  await t('responder "autorizo" NÃO autoriza — mas também não vira comando nem "não entendi"', async () => {
    const escritasAntes = chamadas.escrita;
    await req('POST', '/staff/api/voz/executar', { corpo: { pedido: unico('manda um email pro bruno') }, chave: true });
    const r = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: 'autorizo' }, chave: true });
    assert.ok(r.json.autorizacaoPeloLink, `virou ${r.json.status}/${r.json.acao}: ${JSON.stringify(r.json)}`);
    assert.ok(/link/i.test(r.json.fala), r.json.fala);
    await rodarFila();
    assert.equal(chamadas.escrita, escritasAntes, 'um "autorizo" falado executou a ação');
  });

  await t('e o link é REENVIADO, para a pessoa não ficar procurando', () => {
    const links = enviadas.filter((e) => /\/staff\/voz\/aprovar\//.test(e.texto));
    assert.ok(links.length >= 2, 'devia ter mandado o link de novo');
  });

  await t('repetir o RESUMO do pedido não cria uma segunda autorização', async () => {
    // O gesto que aconteceu de verdade: responder ao pedido de
    // autorização repetindo o que ele dizia. Mesma ação, mesmos
    // parâmetros → é o mesmo pedido, não um novo.
    const a = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: unico('cadastra o cliente maria souza') }, chave: true });
    assert.equal(a.json.status, 'aguardando_aprovacao', JSON.stringify(a.json));
    const b = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: unico('cadastra o cliente maria souza') }, chave: true });
    assert.ok(b.json.jaPendente, `criou uma segunda autorização: ${JSON.stringify(b.json)}`);
    assert.equal(b.json.jaPendente, a.json.pedidoId);
    assert.notEqual(b.json.status, 'aguardando_aprovacao');
  });

  await t('falha PERMANENTE avisa uma vez só e não é reprocessada', async () => {
    // "Ainda não sei fazer" não muda com o tempo. Sem marcar o erro como
    // permanente, a fila reagenda e o usuário leva dois avisos do mesmo
    // erro — foi o que aconteceu no primeiro nível 3 real.
    const antes = enviadas.filter((e) => /Não consegui/i.test(e.texto)).length;
    const dlqAntes = fila.dlq().length;
    const r = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: unico('manda um email pra ana') }, chave: true });
    const link = enviadas.map((e) => e.texto).reverse().find((x) => /\/staff\/voz\/aprovar\//.test(x));
    const tk = link.match(/\/staff\/voz\/aprovar\/([A-Za-z0-9_-]+)/)[1];
    await req('POST', `/staff/voz/aprovar/${tk}`, { corpo: { decisao: 'aprovar' }, staff: 'adm' });
    await rodarFila();
    await rodarFila();   // a segunda volta é onde a reprocessagem apareceria
    const depois = enviadas.filter((e) => /Não consegui/i.test(e.texto)).length;
    assert.equal(depois - antes, 1, `avisou ${depois - antes} vezes o mesmo erro`);
    assert.equal(repo.porId(r.json.pedidoId).status, 'nao_suportado');
    assert.equal(fila.dlq().length, dlqAntes + 1, 'falha permanente vai para a DLQ na primeira, não fica reagendando');
  });

  await t('a mesma autorização não vale duas vezes', async () => {
    const r = await req('POST', `/staff/voz/aprovar/${tokenValido}`, { corpo: { decisao: 'aprovar' }, staff: 'adm' });
    assert.equal(r.status, 409, 'aprovação de uso único foi aceita de novo');
  });

  await t('autorização vencida não vale', async () => {
    const r = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: unico('manda um email pro pedro') }, chave: true });
    const pedidoId = r.json.pedidoId;
    const { db } = require('./db');
    db.prepare("UPDATE aprovacoes SET expira_em = '2000-01-01T00:00:00.000Z' WHERE pedido_id = ?").run(pedidoId);
    const link = enviadas.map((e) => e.texto).reverse().find((x) => /\/staff\/voz\/aprovar\//.test(x));
    const tk = link.match(/\/staff\/voz\/aprovar\/([A-Za-z0-9_-]+)/)[1];
    const d = await req('POST', `/staff/voz/aprovar/${tk}`, { corpo: { decisao: 'aprovar' }, staff: 'adm' });
    assert.equal(d.status, 409, 'link vencido foi aceito');
    assert.equal(aprovacoes.expirarVencidas() >= 0, true);
    assert.equal(repo.porId(pedidoId).status, 'expirado', 'o pedido devia cair junto, não ficar pendente para sempre');
  });

  await t('recusar não executa nada', async () => {
    const escritasAntes = chamadas.escrita;
    await req('POST', '/staff/api/voz/executar', { corpo: { pedido: unico('cadastra o cliente joao silva') }, chave: true });
    const link = enviadas.map((e) => e.texto).reverse().find((x) => /\/staff\/voz\/aprovar\//.test(x));
    const tk = link.match(/\/staff\/voz\/aprovar\/([A-Za-z0-9_-]+)/)[1];
    const d = await req('POST', `/staff/voz/aprovar/${tk}`, { corpo: { decisao: 'recusar' }, staff: 'adm' });
    assert.equal(d.status, 200, JSON.stringify(d.json));
    await rodarFila();
    assert.equal(chamadas.escrita, escritasAntes, 'executou um pedido RECUSADO');
  });

  // ===================================================================
  secao('Trava 4 · dado pessoal e quebra de linha não saem por mensagem');

  await t('CPF, telefone e e-mail viram marcador', () => {
    const s = notificar.umaLinha('Cliente 123.456.789-00, tel (61) 99999-8888, e-mail joao@exemplo.com');
    assert.ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(s), s);
    assert.ok(!/@exemplo\.com/.test(s), s);
    assert.ok(/\[CPF\]/.test(s) && /\[e-mail\]/.test(s), s);
  });

  await t('quebra de linha e tab somem (erro Meta 132018 derruba o canal)', () => {
    const s = notificar.umaLinha('linha 1\nlinha 2\tcom tab\r\nlinha 3');
    assert.ok(!/[\r\n\t]/.test(s), JSON.stringify(s));
  });

  await t('a RESPOSTA vai no corpo da mensagem, não só o link (decisão de 26/08/2026)', async () => {
    const antes = enviadas.length;
    const p = repo.criar({ canal: 'voz', ator: 't', texto: unico('quanto de ocupacao'), idem: '' }).pedido;
    repo.atualizar(p.id, { acao: 'ocupacao.periodo', nivel: 1, status: 'concluido' });
    await notificar.relatorio(repo.porId(p.id), { fala: 'A ocupação está em 45 por cento, nove de vinte.' });
    const m = enviadas[enviadas.length - 1].texto;
    assert.ok(enviadas.length > antes);
    assert.ok(/45 por cento/.test(m), `link sem resposta não é resposta: ${m}`);
    assert.ok(/\/staff\/voz\/pedido\//.test(m), 'o link tem de continuar indo, para o detalhe');
  });

  await t('mas CPF, telefone e e-mail continuam saindo como marcador MESMO dentro da fala', async () => {
    // O afrouxamento é só para NOME. Identificador continua fechado —
    // é a parte da regra 5 que não foi negociada.
    const p = repo.criar({ canal: 'voz', ator: 't', texto: unico('ficha do hospede'), idem: '' }).pedido;
    repo.atualizar(p.id, { acao: 'agenda.dia', nivel: 1, status: 'concluido' });
    await notificar.relatorio(repo.porId(p.id), {
      fala: 'Everson chega hoje, CPF 123.456.789-00, telefone (61) 99999-8888, e-mail e@x.com.',
    });
    const m = enviadas[enviadas.length - 1].texto;
    assert.ok(/Everson/.test(m), 'o nome DEVE passar — foi a decisão');
    assert.ok(!/123\.456\.789-00/.test(m), m);
    assert.ok(!/99999-8888/.test(m), m);
    assert.ok(!/e@x\.com/.test(m), m);
  });

  await t('sem fala, o relatório cai no formato antigo em vez de não sair', async () => {
    const p = repo.criar({ canal: 'voz', ator: 't', texto: unico('coisa qualquer'), idem: '' }).pedido;
    repo.atualizar(p.id, { acao: 'listas.adicionar', parametros: { nome: 'sal' }, nivel: 2 });
    await notificar.relatorio(repo.porId(p.id), { fala: '' });
    const m = enviadas[enviadas.length - 1].texto;
    assert.ok(/lista de compras/.test(m) && /pronto/.test(m), m);
  });

  await t('nenhuma mensagem já enviada carrega quebra de linha', () => {
    const ruins = enviadas.filter((e) => /[\r\n\t]/.test(e.texto));
    assert.equal(ruins.length, 0, JSON.stringify(ruins.slice(0, 2)));
  });

  // ===================================================================
  secao('Trava 5 · leitor ≠ executor (WhatsApp de terceiro não comanda)');

  await t('telefone fora da lista NÃO vira comando', async () => {
    const escritasAntes = chamadas.escrita;
    const r = await req('POST', '/staff/api/voz/whatsapp', {
      corpo: { de: '5511988887777', texto: 'poe champagne na lista de compras' }, chave: true });
    assert.equal(r.status, 200, 'devolver erro ao Make conta para o maxErrors e derruba o cenário');
    assert.equal(r.json.aceito, false);
    assert.equal(r.json.motivo, 'nao_autorizado');
    await rodarFila();
    assert.equal(chamadas.escrita, escritasAntes, 'um estranho conseguiu escrever no sistema');
  });

  await t('o telefone do dono vira comando (inclusive escrito com o 9 e o +55)', async () => {
    const r = await req('POST', '/staff/api/voz/whatsapp', {
      corpo: { de: '+55 61 99211-3000', texto: unico('poe detergente na lista de compras') }, chave: true });
    assert.equal(r.json.aceito, true, JSON.stringify(r.json));
    assert.equal(r.json.resposta.acao, 'listas.adicionar', JSON.stringify(r.json.resposta));
  });

  await t('mensagem ignorada fica registrada — nunca obedecida, sempre auditada', () => {
    const { db } = require('./db');
    const n = db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE evento = 'entrada.ignorada'").get().n;
    assert.ok(n >= 1, 'a mensagem recusada não deixou rastro');
  });

  await t('áudio sem transcritor avisa, em vez de sumir', async () => {
    const r = await req('POST', '/staff/api/voz/whatsapp', {
      corpo: { de: '556192113000', audio: { url: 'x' } }, chave: true });
    assert.equal(r.json.transcricaoIndisponivel, true, JSON.stringify(r.json));
    assert.ok(/escrito/i.test(r.json.resposta.fala));
  });

  // ===================================================================
  secao('Trava 6 · repetir não é pedir de novo');

  await t('a mesma frase na janela devolve o MESMO pedido, e executa uma vez só', async () => {
    // Esvazia a fila ANTES de medir: jobs pendentes de testes anteriores
    // rodariam no mesmo lote e o contador acusaria repetição que não houve.
    await rodarFila();
    const antes = chamadas.escrita;

    const frase = unico('poe fralda na lista de compras');
    const a = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: frase }, chave: true });
    const b = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: frase }, chave: true });
    assert.equal(a.json.pedidoId, b.json.pedidoId, 'duas compras seriam criadas');
    assert.equal(b.json.repetido, true);

    await rodarFila();
    assert.equal(chamadas.escrita - antes, 1, `executou ${chamadas.escrita - antes} vezes`);
    await rodarFila();
    assert.equal(chamadas.escrita - antes, 1, 'a fila reexecutou um pedido já concluído');
  });

  await t('acento e maiúscula não driblam a idempotência', () => {
    assert.equal(repo.chaveIdem('Põe LEITE na lista', 'voz'), repo.chaveIdem('poe leite na lista', 'voz'));
  });

  // ===================================================================
  secao('Trava 7 · interruptor e aviso por fora');

  await t('VOZ_EXECUTAR=off derruba o executar e PRESERVA o consultar', async () => {
    process.env.VOZ_EXECUTAR = 'off';
    try {
      const escritasAntes = chamadas.escrita;
      const e = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: unico('poe cafe na lista de compras') }, chave: true });
      assert.equal(e.json.status, 'recusado', JSON.stringify(e.json));
      await rodarFila();
      assert.equal(chamadas.escrita, escritasAntes, 'escreveu com o interruptor desligado');

      const c = await req('POST', '/staff/api/voz/consultar', { corpo: { pergunta: unico('qual a agenda') }, chave: true });
      assert.equal(c.json.status, 'concluido', 'a consulta caiu junto — o interruptor é só para escrita');
    } finally { process.env.VOZ_EXECUTAR = 'on'; }
  });

  await t('nível 3 avisa por fora ANTES de agir', () => {
    assert.ok(enviadas.some((e) => /nível 3/i.test(e.texto)), JSON.stringify(enviadas.slice(-5)));
  });

  // ===================================================================
  secao('Trava 8 · auditoria com a transcrição original');

  await t('o texto exato fica gravado, mesmo quando não foi entendido', async () => {
    const frase = unico('faz alguma coisa ai');
    const r = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: frase }, chave: true });
    assert.equal(r.json.status, 'nao_entendido', JSON.stringify(r.json));
    const p = repo.porId(r.json.pedidoId);
    assert.equal(p.texto_original, frase, 'sem a transcrição, um erro de fala vira ação inexplicável');
  });

  await t('confiança baixa NÃO vira ação — o palpite fica só na trilha', async () => {
    const escritasAntes = chamadas.escrita;
    const r = await req('POST', '/staff/api/voz/executar', {
      corpo: { pedido: unico('acho que era pra mandar email pro cesar') }, chave: true });
    assert.equal(r.json.status, 'nao_entendido', JSON.stringify(r.json));
    await rodarFila();
    assert.equal(chamadas.escrita, escritasAntes);
    const trilha = repo.auditoriaDo(r.json.pedidoId);
    const ev = trilha.find((x) => x.evento === 'pedido.nao_entendido');
    assert.ok(ev && /email\.enviar/.test(ev.detalhe), 'o palpite descartado devia ficar registrado');
  });

  await t('o nível fica gravado no pedido, não só no catálogo', async () => {
    const r = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: unico('cadastra o cliente joao silva') }, chave: true });
    assert.equal(repo.porId(r.json.pedidoId).nivel, 3,
      'sem o nível gravado, promover uma ação reescreveria o passado');
  });

  // ===================================================================
  secao('Fila · a `codigo` nasce travada, e falha alto');

  await t('enfileirar na fila `codigo` é recusado com motivo', () => {
    assert.equal(fila.codigoLiberado(), false);
    assert.throws(() => fila.enfileirar({ tipo: 'x', fila: 'codigo' }), (e) => e.filaTravada === true);
  });

  await t('pedido de implementação é ANOTADO e responde a verdade', async () => {
    const r = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: 'cria uma tela de relatorio de consumo' }, chave: true });
    assert.equal(r.json.nivel, 4);
    assert.equal(r.json.status, 'nao_suportado', JSON.stringify(r.json));
    assert.ok(/ainda não consigo/i.test(r.json.fala), r.json.fala);
    const p = repo.porId(r.json.pedidoId);
    assert.equal(p.acao, 'codigo.implementar', 'o pedido tem de ficar no painel, não sumir');
  });

  await t('handler ausente vai para a DLQ na PRIMEIRA tentativa', async () => {
    fila.enfileirar({ tipo: 'voz.tipo-que-ninguem-registrou', payload: {} });
    await fila.processarLote(10, 'rapida');
    assert.ok(fila.dlq().some((j) => j.tipo === 'voz.tipo-que-ninguem-registrou'),
      'ficou repetindo em vez de falhar alto');
  });

  await t('ação sem ferramenta responde "ainda não sei fazer", não erro mudo', async () => {
    await assert.rejects(
      () => executor.rodar('whatsapp.enviar', { para: 'x', texto: 'y' }),
      (e) => e.status === 501 && /ainda não sei/i.test(e.message));
  });

  // ===================================================================
  secao('Destinatários · lista fechada de e-mail');

  const dest = require('./destinatarios');

  await t('parser tolerante: aceita : ou =, ; ou vírgula, e espaço sobrando', () => {
    const m = dest.parse('  contador : fulano@x.com ;  Meu Advogado = beltrano@y.com , contadora:ana@z.com  ');
    assert.deepEqual(dest.apelidos(m), ['contador', 'contadora', 'meu advogado']);
  });

  await t('linha malformada é ignorada sem derrubar o resto da lista', () => {
    // Uma vírgula a mais não pode desligar a lista inteira.
    const m = dest.parse('contador: fulano@x.com; isto nao tem email; vazio:; @sem-arroba; ok=b@c.com');
    assert.deepEqual(dest.apelidos(m), ['contador', 'ok']);
  });

  await t('resolve por apelido, ignorando acento e caixa', () => {
    const m = dest.parse('Advogádo: a@x.com');
    assert.equal(dest.resolver(m, 'ADVOGADO'), 'a@x.com');
    assert.equal(dest.resolver(m, 'advogado'), 'a@x.com');
  });

  await t('endereço FORA da lista não passa — é a trava principal', () => {
    // Sem isto, bastaria o modelo produzir um endereço qualquer.
    const m = dest.parse('contador: fulano@x.com');
    assert.equal(dest.resolver(m, 'estranho@dominio.com'), null);
    assert.equal(dest.resolver(m, 'fulano@x.com'), 'fulano@x.com', 'endereço DA lista pode passar');
  });

  await t('apelido AMBÍGUO devolve null em vez de escolher um', () => {
    // Escolher entre dois é como se manda e-mail para a pessoa errada.
    const m = dest.parse('contador rio: a@x.com; contador df: b@x.com');
    assert.equal(dest.resolver(m, 'contador'), null);
    assert.equal(dest.resolver(m, 'contador df'), 'b@x.com');
  });

  await t('a lista de apelidos NUNCA devolve endereços', () => {
    // Ela vai em mensagem de erro, que pode sair por canal aberto.
    const m = dest.parse('contador: sigiloso@x.com');
    assert.deepEqual(dest.apelidos(m), ['contador']);
    assert.ok(!JSON.stringify(dest.apelidos(m)).includes('@'));
  });

  await t('lista vazia resolve para null, nunca para um padrão', () => {
    assert.equal(dest.resolver(dest.parse(''), 'contador'), null);
    assert.equal(dest.resolver(null, 'contador'), null);
  });

  await t('a página de autorização mostra o DESTINO REAL antes do clique', async () => {
    // Sem isto, autorizar "e-mail para o contador" seria confiar numa
    // configuração que talvez tenha erro de digitação.
    require('./paginas').configurar({
      resolverDestino: (acao, p) => (acao === 'email.enviar' && (p || {}).para === 'Carla' ? 'carla@exemplo.test' : null),
    });
    const r = await req('POST', '/staff/api/voz/executar', { corpo: { pedido: unico('manda um email pra carla') }, chave: true });
    assert.equal(r.json.status, 'aguardando_aprovacao', JSON.stringify(r.json));
    const link = enviadas.map((e) => e.texto).reverse().find((x) => /\/staff\/voz\/aprovar\//.test(x));
    const tk = link.match(/\/staff\/voz\/aprovar\/([A-Za-z0-9_-]+)/)[1];
    const pag = await req('GET', `/staff/voz/aprovar/${tk}`, { staff: 'adm', cru: true });
    assert.ok(/destino real/.test(pag.texto), 'a página não mostrou para onde vai');
    assert.ok(/carla@exemplo\.test/.test(pag.texto), pag.texto.slice(0, 200));
    assert.ok(!enviadas.some((e) => /carla@exemplo\.test/.test(e.texto)),
      'o endereço vazou para o WhatsApp — ele só pode aparecer na página autenticada');
  });

  // ===================================================================
  secao('Cérebro · a FORMA do schema, sem rede');

  // Estes testes existem porque um 400 passou para produção: o schema de
  // interpretação usava `additionalProperties: { type: 'string' }`, que a
  // API recusa, e TODA interpretação caía no determinístico em silêncio.
  // O selftest não pegou porque apaga a ANTHROPIC_API_KEY — o caminho do
  // LLM nunca rodava. A regra da API vira invariante local aqui.
  const percorrer = (no, caminho, visita) => {
    if (!no || typeof no !== 'object') return;
    visita(no, caminho);
    for (const [k, v] of Object.entries(no)) {
      if (v && typeof v === 'object') percorrer(v, `${caminho}.${k}`, visita);
    }
  };

  for (const [nome, schema] of [['interpretação', cerebro.SCHEMA_INTERPRETACAO], ['fala', cerebro.SCHEMA_FALA]]) {
    await t(`schema de ${nome}: todo objeto fecha com additionalProperties:false`, () => {
      const faltando = [];
      percorrer(schema, '$', (no, caminho) => {
        if (no.type !== 'object') return;
        if (no.additionalProperties !== false) faltando.push(`${caminho} (additionalProperties=${JSON.stringify(no.additionalProperties)})`);
        if (!no.properties) faltando.push(`${caminho} (sem properties)`);
      });
      assert.deepEqual(faltando, [],
        'a API recusa com 400 e a interpretação cai no determinístico EM SILÊNCIO');
    });

    await t(`schema de ${nome}: required só cita propriedade declarada`, () => {
      const orfas = [];
      percorrer(schema, '$', (no, caminho) => {
        if (no.type !== 'object' || !Array.isArray(no.required)) return;
        for (const r of no.required) if (!no.properties || !(r in no.properties)) orfas.push(`${caminho}.${r}`);
      });
      assert.deepEqual(orfas, []);
    });
  }

  await t('parâmetro fora do catálogo da ação é DESCARTADO', () => {
    // Chave inventada pelo modelo chegaria à ferramenta como se a pessoa
    // a tivesse dito. `nome` existe em listas.adicionar; `rota` não.
    const r = cerebro.limparParametros(
      [{ chave: 'nome', valor: 'leite' }, { chave: 'rota', valor: '/etc/passwd' }, { chave: 'obs', valor: '  ' }],
      'listas.adicionar');
    assert.deepEqual(r, { nome: 'leite' }, JSON.stringify(r));
  });

  await t('o formato de LISTA de pares é o que o schema promete', () => {
    assert.equal(cerebro.SCHEMA_INTERPRETACAO.properties.parametros.type, 'array',
      'objeto de chaves livres é justamente o que a API recusa');
    const item = cerebro.SCHEMA_INTERPRETACAO.properties.parametros.items;
    assert.deepEqual(Object.keys(item.properties).sort(), ['chave', 'valor']);
  });

  // ===================================================================
  secao('Fase 1 · voz em tempo real');

  const realtime = require('./realtime');

  await t('as ferramentas do modelo de voz são DUAS, e só duas', () => {
    assert.deepEqual(realtime.FERRAMENTAS.map((f) => f.name).sort(), ['consultar', 'executar']);
  });

  await t('o schema das ferramentas segue a MESMA regra que derrubou o cérebro', () => {
    // Lá a API recusava com 400 e caía no fallback em silêncio; aqui a
    // sessão simplesmente não abriria. A regra é a mesma, o teste também.
    const faltando = [];
    for (const f of realtime.FERRAMENTAS) {
      percorrer(f.parameters, `$.${f.name}`, (no, caminho) => {
        if (no.type !== 'object') return;
        if (no.additionalProperties !== false) faltando.push(`${caminho} (additionalProperties)`);
        if (!no.properties) faltando.push(`${caminho} (sem properties)`);
      });
    }
    assert.deepEqual(faltando, []);
  });

  await t('as instruções PROÍBEM inventar e mandam repetir a fala', () => {
    // Sem isso o modelo preenche a lacuna com algo plausível — e um
    // número de ocupação inventado é pior que silêncio.
    const i = realtime.instrucoes();
    assert.ok(/NUNCA invente/i.test(i), 'falta a regra de não inventar');
    assert.ok(/`fala`/.test(i), 'falta mandar dizer o texto que a ferramenta devolveu');
    assert.ok(/NÃO SABE NADA/i.test(i), 'o modelo precisa saber que não conhece o negócio');
  });

  await t('a assistente se chama EVA — e o nome vem do prompt, não do acaso', () => {
    assert.ok(/EVA/.test(realtime.instrucoes()), 'a persona precisa se apresentar como Eva');
  });

  await t('as instruções listam o catálogo REAL, não uma lista paralela', () => {
    // Lista paralela é a que ninguém lembra de atualizar.
    const i = realtime.instrucoes();
    for (const a of acoes.paraOCerebro()) {
      assert.ok(i.includes(a.descricao), `faltou no prompt: ${a.acao}`);
    }
  });

  await t('sem OPENAI_API_KEY, a sessão recusa com causa — não 500 mudo', async () => {
    const antes = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await assert.rejects(() => realtime.criarSessao({ ator: 't' }),
        (e) => e.status === 503 && /OPENAI_API_KEY/.test(e.message));
      assert.equal(realtime.disponivel(), false);
    } finally { if (antes) process.env.OPENAI_API_KEY = antes; }
  });

  await t('VOZ_REALTIME=off desliga a voz e PRESERVA o resto', async () => {
    process.env.OPENAI_API_KEY = 'sk-teste';
    process.env.VOZ_REALTIME = 'off';
    try {
      assert.equal(realtime.disponivel(), false);
      await assert.rejects(() => realtime.criarSessao({}), (e) => e.status === 503);
      const c = await req('POST', '/staff/api/voz/consultar', { corpo: { pergunta: unico('qual a agenda') }, chave: true });
      assert.equal(c.json.status, 'concluido', 'o WhatsApp e a consulta não podem cair junto');
    } finally { delete process.env.VOZ_REALTIME; delete process.env.OPENAI_API_KEY; }
  });

  await t('a CHAVE não abre sessão de voz — só sessão de admin', async () => {
    // Chave é do agente, e agente não abre microfone. Além disso cada
    // sessão custa por minuto: quem gasta tem de ser uma pessoa logada.
    const comChave = await req('POST', '/staff/api/voz/sessao', { chave: true });
    assert.equal(comChave.status, 401, 'a PUBLISH_KEY cunhou credencial de voz');
    const semNada = await req('POST', '/staff/api/voz/sessao', {});
    assert.equal(semNada.status, 401);
    const naoAdmin = await req('POST', '/staff/api/voz/sessao', { staff: 'op' });
    assert.equal(naoAdmin.status, 403);
  });

  await t('o histórico é POR USUÁRIO — um não vê a conversa do outro', async () => {
    // Pedido carrega nome de hospede e texto de e-mail. Devolver "tudo"
    // para quem abrir a tela seria vazamento entre pessoas da equipe.
    await req('POST', '/staff/api/voz/consultar', { corpo: { pergunta: unico('qual a agenda') }, staff: 'adm' });
    const doAdm = await req('GET', '/staff/api/voz/historico', { staff: 'adm' });
    const doOp = await req('GET', '/staff/api/voz/historico', { staff: 'op' });
    assert.equal(doAdm.status, 200, JSON.stringify(doAdm.json));
    assert.ok(doAdm.json.turnos.length >= 1, 'o admin devia ver o proprio turno');
    assert.equal(doOp.json.turnos.length, 0, 'o operador viu a conversa do admin');
  });

  await t('a CHAVE não lê histórico — sem sessão não há "seu"', async () => {
    // Com a chave nao existe usuario; devolver algo seria devolver o de
    // todo mundo.
    const r = await req('GET', '/staff/api/voz/historico', { chave: true });
    assert.equal(r.status, 401, JSON.stringify(r.json));
  });

  await t('o histórico vem em ordem de CONVERSA, do mais antigo ao mais novo', async () => {
    const r = await req('GET', '/staff/api/voz/historico', { staff: 'adm' });
    const datas = r.json.turnos.map((t2) => t2.quando);
    assert.deepEqual(datas, [...datas].sort(), 'lista invertida vira conversa de tras para a frente');
  });

  await t('a página do círculo exige sessão e diz o que falta quando não dá', async () => {
    const semSessao = await req('GET', '/staff/voz', { cru: true });
    assert.equal(semSessao.status, 401);
    const comSessao = await req('GET', '/staff/voz', { staff: 'adm', cru: true });
    assert.equal(comSessao.status, 200);
    assert.ok(/OPENAI_API_KEY/.test(comSessao.texto), 'sem chave, a tela tem de dizer o que falta');
    assert.ok(/WhatsApp continua funcionando/.test(comSessao.texto), 'e que o outro canal segue de pé');
  });

  await t('a página NUNCA embute a chave — só busca o segredo efêmero', async () => {
    process.env.OPENAI_API_KEY = 'sk-segredo-que-nao-pode-vazar';
    try {
      const p = await req('GET', '/staff/voz', { staff: 'adm', cru: true });
      assert.ok(!p.texto.includes('sk-segredo-que-nao-pode-vazar'), 'a chave permanente foi para o HTML');
      assert.ok(/\/staff\/api\/voz\/sessao/.test(p.texto), 'a página tem de cunhar pelo servidor');
    } finally { delete process.env.OPENAI_API_KEY; }
  });

  // ===================================================================
  secao('Painel e saúde');

  await t('a saúde diz o que falta, sem enfeitar', async () => {
    const r = await req('GET', '/staff/api/voz/saude', { chave: true });
    assert.equal(r.status, 200);
    assert.equal(r.json.cerebro.llm, false, 'sem chave, tem de admitir que está no determinístico');
    assert.equal(r.json.filaCodigo, false);
    assert.equal(r.json.transcricao.pronta, false, JSON.stringify(r.json.transcricao));
    assert.equal(r.json.whatsapp, true);
  });

  await t('o painel lista os pedidos, inclusive os não entendidos', async () => {
    const r = await req('GET', '/staff/api/voz/pedidos?limite=200', { chave: true });
    assert.ok(r.json.pedidos.length > 5);
    assert.ok(r.json.resumo.nao_entendido >= 1, JSON.stringify(r.json.resumo));
  });

  await t('a página do pedido exige sessão', async () => {
    const p = repo.listar({ limite: 1 })[0];
    const semSessao = await req('GET', `/staff/voz/pedido/${p.id}`, { cru: true });
    assert.equal(semSessao.status, 401);
    const comSessao = await req('GET', `/staff/voz/pedido/${p.id}`, { staff: 'adm', cru: true });
    assert.equal(comSessao.status, 200);
    assert.ok(/O que foi dito/.test(comSessao.texto));
  });

  await t('a página do pedido escapa HTML do texto falado', async () => {
    const r = await req('POST', '/staff/api/voz/executar', {
      corpo: { pedido: unico('<img src=x onerror=alert(1)> faz alguma coisa ai') }, chave: true });
    const pag = await req('GET', `/staff/voz/pedido/${r.json.pedidoId}`, { staff: 'adm', cru: true });
    assert.ok(!/<img src=x/.test(pag.texto), 'HTML do usuário chegou cru na página');
    assert.ok(/&lt;img/.test(pag.texto));
  });

  // ===================================================================
  // ÁUDIO — a partir daqui existe transcritor. Vem por último de
  // propósito: os testes acima provam que o módulo é honesto QUANDO NÃO
  // TEM transcrição, e isso deixaria de ser testável se ligássemos antes.
  // ===================================================================
  secao('Áudio · obter os bytes com trava de tamanho e de tipo');

  const { audio, transcricao } = voz;
  const OGG = Buffer.from('ogg-falso-de-teste');
  const b64 = (buf) => buf.toString('base64');

  await t('base64 vira bytes, com extensão e chave por hash', async () => {
    const a = await audio.obter({ base64: b64(OGG), mime: 'audio/ogg' });
    assert.equal(a.extensao, 'ogg');
    assert.equal(a.tamanho, OGG.length);
    assert.ok(a.chave.startsWith('sha:'), a.chave);
  });

  await t('mime com codecs (o que o WhatsApp manda) é aceito', async () => {
    const a = await audio.obter({ base64: b64(OGG), mime: 'audio/ogg; codecs=opus' });
    assert.equal(a.extensao, 'ogg');
  });

  await t('tipo fora da lista é recusado — allowlist, não blocklist', async () => {
    await assert.rejects(() => audio.obter({ base64: b64(OGG), mime: 'application/pdf' }),
      (e) => e.status === 400 && /não aceito/i.test(e.message));
  });

  await t('áudio acima do teto é recusado antes de qualquer processamento', async () => {
    const grande = Buffer.alloc(audio.MAX_BYTES + 1, 0x41);
    await assert.rejects(() => audio.obter({ base64: b64(grande), mime: 'audio/ogg' }),
      (e) => e.status === 400 && /teto/i.test(e.message));
  });

  await t('só o media id do WhatsApp é recusado COM O MOTIVO (não existe token da Graph)', async () => {
    await assert.rejects(() => audio.obter({ id: 'wamid.abc123' }),
      (e) => e.status === 501 && /Graph API/.test(e.message) && /base64/.test(e.message));
  });

  // ---- servidor de arquivos falso, para as travas de download ----
  const http = require('http');
  const alvo = http.createServer((rq, rs) => {
    if (rq.url === '/ok') {
      rs.writeHead(200, { 'Content-Type': 'audio/ogg', 'Content-Length': OGG.length });
      return rs.end(OGG);
    }
    if (rq.url === '/mente') {
      // Declara pequeno e manda grande: é o caso que só a contagem
      // DURANTE a leitura pega. Sem Content-Length, chunked.
      rs.writeHead(200, { 'Content-Type': 'audio/ogg' });
      return rs.end(Buffer.alloc(audio.MAX_BYTES * 2, 0x42));
    }
    if (rq.url === '/enorme') {
      rs.writeHead(200, { 'Content-Type': 'audio/ogg', 'Content-Length': audio.MAX_BYTES * 3 });
      return rs.end(Buffer.alloc(audio.MAX_BYTES * 3, 0x43));
    }
    rs.writeHead(404); rs.end();
  });
  alvo.listen(0);
  await new Promise((r) => alvo.once('listening', r));
  const ALVO = 'http://127.0.0.1:' + alvo.address().port;

  await t('URL pública baixa e conta os bytes', async () => {
    const a = await audio.obter({ url: `${ALVO}/ok` });
    assert.equal(a.tamanho, OGG.length);
  });

  await t('Content-Length grande é recusado sem baixar', async () => {
    await assert.rejects(() => audio.obter({ url: `${ALVO}/enorme` }),
      (e) => e.status === 400 && /teto/i.test(e.message));
  });

  await t('servidor que MENTE no tamanho é cortado durante o download', async () => {
    // O Content-Length é promessa do outro lado, não fato. Sem esta
    // trava, um arquivo sem cabeçalho entra inteiro na memória.
    await assert.rejects(() => audio.obter({ url: `${ALVO}/mente` }),
      (e) => e.status === 400 && /durante o download/i.test(e.message));
  });

  // ===================================================================
  secao('Áudio · transcrição, cache e custo');

  let transcricoes = 0;
  let proximaFalha = null;
  transcricao.registrar('teste', async ({ bytes }) => {
    transcricoes += 1;
    if (proximaFalha) { const e = proximaFalha; proximaFalha = null; throw e; }
    return `poe manteiga na lista de compras ${bytes.length}`;
  });
  process.env.VOZ_STT_PROVEDOR = 'teste';

  await t('transcreve e devolve o texto', async () => {
    const a = await audio.obter({ base64: b64(Buffer.from('audio-1')), mime: 'audio/ogg' });
    const r = await transcricao.transcrever(a);
    assert.ok(/manteiga/.test(r.texto), r.texto);
    assert.equal(r.doCache, false);
  });

  await t('o MESMO áudio não é transcrito duas vezes (o Make reenvia o webhook)', async () => {
    const antes = transcricoes;
    const a = await audio.obter({ base64: b64(Buffer.from('audio-2')), mime: 'audio/ogg' });
    await transcricao.transcrever(a);
    const b = await audio.obter({ base64: b64(Buffer.from('audio-2')), mime: 'audio/ogg' });
    const r2 = await transcricao.transcrever(b);
    assert.equal(transcricoes - antes, 1, `pagou ${transcricoes - antes} transcrições pelo mesmo áudio`);
    assert.equal(r2.doCache, true);
  });

  await t('o media id é a chave quando existe — dois envios, uma transcrição', async () => {
    const antes = transcricoes;
    // Bytes DIFERENTES, mesmo id: é o que acontece quando o canal
    // reencoda o arquivo no reenvio. O id é a identidade, não os bytes.
    await transcricao.transcrever(await audio.obter({ base64: b64(Buffer.from('v1')), mime: 'audio/ogg', id: 'wamid.X' }));
    await transcricao.transcrever(await audio.obter({ base64: b64(Buffer.from('v2-diferente')), mime: 'audio/ogg', id: 'wamid.X' }));
    assert.equal(transcricoes - antes, 1);
  });

  await t('ERRO não é cacheado — falha de rede não condena o áudio para sempre', async () => {
    const a = await audio.obter({ base64: b64(Buffer.from('audio-3')), mime: 'audio/ogg' });
    proximaFalha = Object.assign(new Error('rede caiu'), { status: 502 });
    await assert.rejects(() => transcricao.transcrever(a), /rede caiu/);
    const r = await transcricao.transcrever(a);   // segunda chance
    assert.ok(r.texto, 'o mesmo áudio nunca mais seria transcrito');
  });

  await t('transcrição vazia é 422, não um pedido em branco', async () => {
    const a = await audio.obter({ base64: b64(Buffer.from('audio-4')), mime: 'audio/ogg' });
    proximaFalha = null;
    const antes = transcricao.MODELO();
    transcricao.registrar('vazio', async () => '   ');
    process.env.VOZ_STT_PROVEDOR = 'vazio';
    try {
      await assert.rejects(() => transcricao.transcrever(a), (e) => e.status === 422);
    } finally { process.env.VOZ_STT_PROVEDOR = 'teste'; assert.ok(antes); }
  });

  // ===================================================================
  secao('Áudio · entrada pelo WhatsApp');

  await t('áudio de telefone NÃO autorizado nem chega ao transcritor', async () => {
    // A ordem é a trava: conferir a lista ANTES de baixar e transcrever.
    // Transcrever primeiro custaria dinheiro por uma mensagem que jamais
    // viraria comando — e ainda abriria o parser a um arquivo de fora.
    const antes = transcricoes;
    const r = await req('POST', '/staff/api/voz/whatsapp', {
      corpo: { de: '5511988887777', audio: { base64: b64(Buffer.from('estranho')), mime: 'audio/ogg' } }, chave: true });
    assert.equal(r.json.aceito, false);
    assert.equal(transcricoes, antes, 'pagou transcrição por áudio de estranho');
  });

  await t('áudio do dono vira pedido, com a transcrição gravada como texto original', async () => {
    const bytes = Buffer.from(`audio-do-dono-${Date.now()}`);
    const r = await req('POST', '/staff/api/voz/whatsapp', {
      corpo: { de: '556192113000', audio: { base64: b64(bytes), mime: 'audio/ogg' } }, chave: true });
    assert.equal(r.json.aceito, true, JSON.stringify(r.json));
    assert.equal(r.json.transcrito, true);
    assert.equal(r.json.resposta.acao, 'listas.adicionar', JSON.stringify(r.json.resposta));
    const p = repo.porId(r.json.resposta.pedidoId);
    assert.ok(/manteiga/.test(p.texto_original), p.texto_original);
    assert.equal(p.transcrito, 1, 'o pedido tem de saber que veio de áudio');
  });

  await t('o áudio também é aceito em campos PLANOS (é o que o Make monta melhor)', async () => {
    const bytes = Buffer.from(`plano-${Date.now()}`);
    const r = await req('POST', '/staff/api/voz/whatsapp', {
      corpo: { de: '556192113000', audio_base64: b64(bytes), audio_mime: 'audio/ogg', audio_id: `wamid.P${Date.now()}` },
      chave: true });
    assert.equal(r.json.aceito, true, JSON.stringify(r.json));
    assert.equal(r.json.transcrito, true);
    assert.equal(r.json.resposta.acao, 'listas.adicionar', JSON.stringify(r.json.resposta));
  });

  await t('reenvio do MESMO áudio não cria um segundo pedido', async () => {
    const bytes = Buffer.from(`reenvio-${Date.now()}`);
    const corpo = { de: '556192113000', audio: { base64: b64(bytes), mime: 'audio/ogg' } };
    const a = await req('POST', '/staff/api/voz/whatsapp', { corpo, chave: true });
    const b = await req('POST', '/staff/api/voz/whatsapp', { corpo, chave: true });
    assert.equal(a.json.resposta.pedidoId, b.json.resposta.pedidoId,
      'o reenvio do Make criaria duas compras');
  });

  await t('a fala de erro muda com a CAUSA', () => {
    assert.ok(/cenário do WhatsApp/.test(entrada.falaDeErro({ status: 501 })));
    assert.ok(/mais curto/.test(entrada.falaDeErro({ status: 504 })));
    assert.ok(/gravar de novo/.test(entrada.falaDeErro({ status: 422 })));
    assert.ok(/longo demais/.test(entrada.falaDeErro({ status: 400, message: 'passa do teto de 4 KB' })));
  });

  // ===================================================================
  secao('Áudio · rota direta (o caminho do app da Fase 1)');

  await t('POST /voz/audio transcreve e despacha, sem Make nem token da Meta', async () => {
    const bytes = Buffer.from(`rota-direta-${Date.now()}`);
    const r = await req('POST', '/staff/api/voz/audio', {
      corpo: { base64: b64(bytes), mime: 'audio/ogg' }, chave: true });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(/manteiga/.test(r.json.transcricao.texto), JSON.stringify(r.json.transcricao));
    assert.equal(r.json.acao, 'listas.adicionar');
    assert.ok(!('resultado' in r.json), 'a rota de áudio devolveu resultado — o contrato vale aqui também');
  });

  await t('a rota de áudio exige chave ou sessão', async () => {
    const r = await req('POST', '/staff/api/voz/audio', { corpo: { base64: b64(OGG), mime: 'audio/ogg' } });
    assert.equal(r.status, 401);
  });

  await t('áudio grande demais na rota devolve o motivo, não 500', async () => {
    const grande = Buffer.alloc(audio.MAX_BYTES + 10, 0x44);
    const r = await req('POST', '/staff/api/voz/audio', {
      corpo: { base64: b64(grande), mime: 'audio/ogg' }, chave: true });
    assert.equal(r.status, 400, JSON.stringify(r.json));
    assert.ok(/teto/i.test(r.json.erro), r.json.erro);
  });

  await t('a saúde passa a admitir que ouve — com provedor e modelo', async () => {
    const r = await req('GET', '/staff/api/voz/saude', { chave: true });
    assert.equal(r.json.transcricao.pronta, true, JSON.stringify(r.json.transcricao));
    assert.equal(r.json.transcricao.provedor, 'teste');
    assert.ok(r.json.transcricao.cache > 0, 'o cache devia ter linhas');
  });

  alvo.close();

  // ===================================================================
  srv.close();
  voz.desligarFila();
  console.log(`\n${ok} ok, ${falhas.length} falha(s).`);
  if (falhas.length) { falhas.forEach((f) => console.log(` - ${f.nome}: ${f.erro}`)); process.exit(1); }
})();
