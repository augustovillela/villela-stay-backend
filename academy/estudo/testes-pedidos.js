// =====================================================================
// Villela Academy — ESTUDO · PEDIDOS PAGOS (ADR-0010) · testes. Chamado
// pelo selftest (npm run test:academy) DEPOIS dos testes da carteira de IA,
// que deixam a virada marcada e a cobrança desligada: aqui ela é ligada com
// câmbio fixo e desligada de novo ao fim.
// A IA e a transcrição são simuladas com consumo fixo, para o valor cobrado
// ser conferível: 1.000 tokens de entrada e 500 de saída = US$ 0,0105
// × câmbio 5,00 × 1,30 = 69 milésimos de real.
// =====================================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function rodar({ t, req, EST, impId, mpFetch }) {
  const { db } = require('../db');
  const ia = require('../ia');
  const carteira = require('../carteira-ia');
  const repo = require('../repo');
  const ct = require('../repo-conteudo');
  const billing = require('../billing');
  const ped = require('./pedidos');

  console.log('\n— estudo/pedidos: orçar, aceitar, reservar, corrigir em segundo plano, acertar; oral, recarga do que falta e staff —');
  const SLUG = 'concurso-teste';
  const base = `/academy/api/aluno/cursos/${impId}/estudo/${SLUG}`;
  const USO = { input_tokens: 1000, output_tokens: 500 };
  const CUSTO = 69;
  const NIVEL3 = 'SEGREDO-DO-NIVEL-TRES: distingue a intercorrente da bienal e cita o marco inicial';
  const CRITICO = 'ERRO-CRITICO-OCULTO: afirmar que a prescrição intercorrente não existe no processo do trabalho';
  const RESPOSTA = 'A prescrição intercorrente ocorre no curso da execução, quando o exequente\ndeixa de cumprir determinação judicial por dois anos. Ela não se confunde com a prescrição bienal. '
    + 'Sustento, porém, que a prescrição intercorrente não existe no processo do trabalho antes da reforma.';
  const TRANSCRICAO = 'Excelência, a prescrição intercorrente corre na execução e exige a intimação prévia do exequente, pelo prazo de dois anos.';
  // o que o "modelo" devolve: níveis 3, 2 e 0; a segunda citação é INVENTADA; e uma nota que ninguém pediu
  const CORRECAO = {
    nota: 100,
    criterios: [
      { n: 1, nivel: 3, trecho: 'ocorre no curso da execução, quando o exequente deixa de cumprir   determinação judicial', faltou: 'nada' },
      { n: 2, nivel: 2, trecho: 'o candidato cita expressamente o art. 11-A da CLT e o marco inicial', faltou: 'Faltou indicar o marco inicial.' },
      { n: 3, nivel: 0, trecho: '', faltou: 'Não aplicou a regra ao caso.' }],
    erros_criticos: [{ n: 1, trecho: 'a prescrição intercorrente não existe no processo do trabalho' }, { n: 9, trecho: 'erro que não está na lista' }],
    comentario: 'Boa definição; faltou aplicar ao caso.',
  };
  let chamadas = [], prompts = [], modo = 'ok', portao = null;
  const mock = async (x) => {
    chamadas.push(x.agente + (x.audio ? ':' + x.audio.mime : ''));
    if (x.prompt) prompts.push(x.prompt);
    if (portao) await portao;
    if (modo === 'falha') throw new Error('provedor fora do ar');
    if (x.agente === 'transcricao') return { texto: TRANSCRICAO, duracao_seg: 90 };
    return { usage: USO, json: modo === 'torto' ? { comentario: 'sem critérios' } : CORRECAO };
  };
  ia.__mockParaTeste(mock);
  const config = (valor) => req('POST', '/staff/api/academy/config', { corpo: { chave: 'ia_cobranca', valor } });
  const LIGADA = { ativa: true, cambio_modo: 'fixo', cambio_brl_usd: 5, margem_pct: 30, isentos: [] };
  const PAULA = { nome: 'Paula Pedidos', email: 'paula@t.com', senha: 'senha-forte-8', aceite_termos: true };
  const RUI = { nome: 'Rui Recarga', email: 'rui@t.com', senha: 'senha-forte-8', aceite_termos: true };
  const uid = (email) => repo.Usuarios.porEmail(email).id;
  const movs = (userId, tipo) => db.prepare('SELECT COUNT(*) n FROM ia_movimentos WHERE user_id = ? AND tipo = ?').get(userId, tipo).n;
  const criar = (jar, corpo) => req('POST', `${base}/pedidos`, { jar, corpo });
  const confirmar = (jar, id, aceite) => req('POST', `${base}/pedidos/${id}/confirmar`, { jar, cab: aceite ? { 'x-ia-aceite': String(aceite) } : {} });
  const obter = (jar, id) => req('GET', `${base}/pedidos/${id}`, { jar });
  const idQ = (trecho) => db.prepare('SELECT id FROM est_questoes WHERE dados LIKE ?').get(`%${trecho}%`).id;
  let qDisc = '', qPeca = '', qOral = '', pedidoPaula = '', midiaPaula = '', teto = 0;

  await t('pedidos: com a cobrança desligada o serviço não existe — a tela avisa e nada é criado', async () => {
    assert.equal(carteira.cfg().ativa, false, 'os testes da carteira deixam a cobrança desligada');
    for (const [u, jar, ip] of [[PAULA, 'paula', '10.0.9.1'], [RUI, 'rui', '10.0.9.2']]) {
      assert.equal((await req('POST', '/academy/api/signup', { corpo: u, jar, ip })).st, 200);
      ct.Matriculas.criar(impId, u.email, 'teste', 'cortesia');
    }
    const rubrica = [{ criterio: 'Conceito de prescrição intercorrente', peso: 3, nivel3: NIVEL3 }, { criterio: 'Fundamento legal', peso: 1, nivel3: 'Cita o art. 11-A da CLT.' }, { criterio: 'Aplicação ao caso', peso: 2, nivel3: 'Aplica a regra e conclui.' }];
    const Q = (tipo, enunciado, extra = {}) => ({ tipo, origem: 'autoral', enunciado, competencias: ['prescricao'], disciplina: 'Direito do Trabalho', rubrica, erros_criticos: [CRITICO], comentario: 'COMENTARIO-INTERNO do professor', ...extra });
    const imp = await req('POST', '/staff/api/academy/estudo/importar', { semUser: true, chave: true, corpo: EST({
      escopo: { slug: SLUG, tipo: 'edital', titulo: 'Concurso de Teste — Analista' },
      questoes: [Q('discursiva', 'Pedido-A: explique a prescrição intercorrente na execução trabalhista e o seu marco inicial.'),
        Q('peca', 'Pedido-B: redija a exceção de pré-executividade que alega a prescrição intercorrente.'),
        Q('oral', 'Pedido-C: o examinador pergunta quando corre a prescrição intercorrente. Responda em voz alta.')] }) });
    assert.equal(imp.st, 200, imp.texto);
    const pub = await req('POST', '/staff/api/academy/estudo/status', { semUser: true, chave: true, corpo: EST({ escopo: SLUG, status: 'publicado', questoes: 'disponivel' }) });
    assert.equal(pub.st, 200, pub.texto);
    [qDisc, qPeca, qOral] = ['Pedido-A:', 'Pedido-B:', 'Pedido-C:'].map(idQ);
    const ab = await req('GET', `${base}/abertas`, { jar: 'paula' });
    assert.equal(ab.st, 200, ab.texto);
    assert.equal(ab.json.disponivel, false);
    assert.ok(/indispon/.test(ab.json.motivo_indisponivel));
    const r = await criar('paula', { tipo: 'correcao', questao_id: qDisc, resposta: RESPOSTA });
    assert.equal(r.st, 503, r.texto);
    assert.ok(/indispon/.test(r.json.erro), 'erro claro: indisponível');
    assert.throws(() => ia.abrirTrabalho(uid(PAULA.email), 'correcao', 0.01, { id: impId }, { aceite: 99999 }), (e) => e.status === 503 && /indispon/.test(e.message), 'a porta também recusa');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM est_pedidos').get().n, 0);
  });

  await t('pedidos: a lista de abertas vai sem o nível 3, sem os erros críticos e sem o comentário — e só para quem tem o curso', async () => {
    assert.equal((await config(LIGADA)).st, 200);
    const ab = await req('GET', `${base}/abertas`, { jar: 'paula' });
    assert.deepEqual([ab.st, ab.json.disponivel, ab.json.cobranca, ab.json.transcricao], [200, true, 'paga', true], ab.texto);
    const q = ab.json.questoes.find(x => x.id === qDisc);
    assert.ok(ab.json.questoes.length >= 3 && q, 'discursiva, peça e oral aparecem');
    assert.deepEqual(q.rubrica_publica[0], { criterio: 'Conceito de prescrição intercorrente', peso: 3 }, 'critério e peso, sem o nível 3');
    assert.deepEqual([q.pede, q.limite_caracteres, q.ultimo_pedido, q.disciplina], ['correcao', 8000, null, 'Direito do Trabalho']);
    assert.deepEqual([ab.json.questoes.find(x => x.id === qPeca).limite_caracteres, ab.json.questoes.find(x => x.id === qOral).pede], [30000, 'oral']);
    for (const segredo of ['SEGREDO-DO-NIVEL-TRES', 'ERRO-CRITICO-OCULTO', 'COMENTARIO-INTERNO', 'nivel3']) assert.ok(!ab.texto.includes(segredo), 'vazou: ' + segredo);
    assert.equal((await req('GET', `${base}/abertas`, { jar: 'caio' })).st, 403, 'quem não tem o curso não entra');
    const pr = await req('GET', `${base}/praticar?competencia=prescricao&n=50`, { jar: 'paula' });
    assert.ok(!pr.json.questoes.some(x => [qDisc, qPeca, qOral].includes(x.id)), 'a questão aberta continua fora da prática com correção automática');
  });

  await t('pedidos: criar só ORÇA — valida a resposta, mostra o teto e o que falta, e não cobra nem chama o provedor', async () => {
    const paula = uid(PAULA.email);
    const recusa = async (corpo, st, padrao) => { const r = await criar('paula', corpo); assert.equal(r.st, st, r.texto); if (padrao) assert.ok(padrao.test(r.json.erro), r.json.erro); };
    await recusa({ tipo: 'correcao', questao_id: qDisc, resposta: 'curta' }, 400, /curta demais/);
    await recusa({ tipo: 'correcao', questao_id: qDisc, resposta: 'x'.repeat(8001) }, 400, /passa de 8\.000/);
    await recusa({ tipo: 'correcao', questao_id: qOral, resposta: RESPOSTA }, 400, /arguição oral/);
    await recusa({ tipo: 'correcao', questao_id: 'nao-existe', resposta: RESPOSTA }, 404);
    await recusa({ tipo: 'prova', questao_id: qDisc }, 501, /ainda não/);
    await recusa({ tipo: 'outro', questao_id: qDisc }, 400);
    assert.equal((await criar('caio', { tipo: 'correcao', questao_id: qDisc, resposta: RESPOSTA })).st, 403);
    const peca = await criar('paula', { tipo: 'correcao', questao_id: qPeca, resposta: 'Excelentíssimo Senhor Juiz. '.repeat(900) });
    assert.equal(peca.st, 200, 'a peça aceita texto maior (até 30.000): ' + peca.texto);
    const r = await criar('paula', { tipo: 'correcao', questao_id: qDisc, resposta: RESPOSTA });
    assert.equal(r.st, 200, r.texto);
    const { pedido, orcamento } = r.json;
    pedidoPaula = pedido.id; teto = orcamento.orcamento_milesimos;
    assert.deepEqual([pedido.estado, pedido.tipo, pedido.cobrado_milesimos, pedido.estimativa], ['orcado', 'correcao', 0, true]);
    assert.ok(teto > CUSTO && /R\$/.test(orcamento.orcamento), 'o teto cobre a entrada estimada e a saída máxima');
    assert.ok(peca.json.orcamento.orcamento_milesimos > teto, 'resposta maior, teto maior');
    assert.deepEqual([orcamento.cobranca, orcamento.saldo_milesimos, orcamento.saldo_suficiente, orcamento.falta_milesimos, orcamento.recarga_centavos, orcamento.recarga],
      ['paga', 0, false, teto, 500, 'R$ 5,00'], 'sem saldo: diz quanto falta e quanto é a recarga (mínimo de R$ 5)');
    assert.deepEqual([carteira.saldo(paula), movs(paula, 'reserva'), chamadas.length], [0, 0, 0], 'orçar não cobra e não gasta');
    // pedir de novo para a mesma questão tira da lista o orçamento largado
    const r2 = await criar('paula', { tipo: 'correcao', questao_id: qDisc, resposta: RESPOSTA });
    assert.equal((await obter('paula', pedidoPaula)).json.pedido.estado, 'cancelado');
    pedidoPaula = r2.json.pedido.id;
    assert.equal(db.prepare("SELECT COUNT(*) n FROM est_pedidos WHERE user_id = ? AND questao_id = ? AND estado = 'orcado'").get(paula, qDisc).n, 1);
  });

  await t('pedidos: confirmar sem saldo ou sem aceitar o VALOR responde 402 com o orçamento — e o provedor não é chamado', async () => {
    const paula = uid(PAULA.email);
    let r = await confirmar('paula', pedidoPaula, teto);
    assert.equal(r.st, 402, r.texto);
    assert.deepEqual([r.json.motivo, r.json.orcamento_milesimos, r.json.falta_milesimos], ['saldo_insuficiente', teto, teto]);
    carteira.creditar({ email: PAULA.email, valor_centavos: 500, motivo: 'saldo para o teste de pedidos', quem: 'teste' });
    r = await confirmar('paula', pedidoPaula);
    assert.deepEqual([r.st, r.json.motivo, r.json.orcamento_milesimos], [402, 'confirmar', teto], r.texto);
    assert.equal((await confirmar('paula', pedidoPaula, teto - 1)).st, 402, 'aceite abaixo do orçamento não vale');
    assert.deepEqual([chamadas.length, carteira.saldo(paula), movs(paula, 'reserva')], [0, 5000, 0], 'nada gerado, nada debitado');
    assert.equal((await obter('paula', pedidoPaula)).json.pedido.estado, 'orcado');
    assert.equal((await obter('paula', pedidoPaula)).json.orcamento.saldo_suficiente, true, 'o orçamento acompanha o saldo de agora');
  });

  await t('pedidos: confirmado, reserva UMA vez, corrige em segundo plano e a reserva de trabalho aberto não é tratada como órfã', async () => {
    const paula = uid(PAULA.email);
    let soltar; portao = new Promise((ok) => { soltar = ok; });
    const r = await confirmar('paula', pedidoPaula, teto);
    assert.deepEqual([r.st, r.json.pedido.estado], [200, 'processando'], r.texto);
    assert.equal(carteira.saldo(paula), 5000 - teto, 'o teto saiu ANTES de o provedor responder');
    // confirmar de novo (clique duplo, tela recarregada) não reserva de novo
    const r2 = await confirmar('paula', pedidoPaula, teto);
    assert.deepEqual([r2.st, r2.json.ja_confirmado, r2.json.pedido.estado], [200, true, 'processando'], r2.texto);
    assert.deepEqual([movs(paula, 'reserva'), chamadas.length], [1, 1], 'idempotência antes do passo caro');
    assert.equal((await req('POST', `${base}/pedidos/${pedidoPaula}/cancelar`, { jar: 'paula' })).st, 409, 'correção em curso não se cancela');
    // o trabalho passou dos 10 minutos: a reserva é antiga, mas está VIVA neste processo
    const ref = db.prepare('SELECT ref FROM est_pedidos WHERE id = ?').get(pedidoPaula).ref;
    db.prepare("UPDATE ia_movimentos SET criado_em = ? WHERE ref = ? AND tipo = 'reserva'").run(new Date(Date.now() - 30 * 60e3).toISOString(), ref);
    assert.equal(carteira.reservaViva(ref), true);
    assert.equal(carteira.saldo(paula), 5000 - teto, 'reserva viva não é devolvida como órfã');
    assert.equal(movs(paula, 'estorno'), 0);
    soltar(); portao = null;
    await ped.aguardar(pedidoPaula);
    assert.equal(carteira.reservaViva(ref), false, 'terminou: sai do conjunto das vivas');
    assert.deepEqual([carteira.saldo(paula), movs(paula, 'reserva'), movs(paula, 'acerto'), movs(paula, 'estorno')], [5000 - CUSTO, 1, 1, 0], 'uma reserva, um acerto; paga o custo real, não o teto');
  });

  await t('pedidos: a NOTA é do servidor (soma ponderada), a citação que não está na resposta é apagada e nada vira evidência', async () => {
    const paula = uid(PAULA.email);
    const r = await obter('paula', pedidoPaula);
    assert.equal(r.st, 200, r.texto);
    const p = r.json.pedido, x = p.resultado;
    assert.deepEqual([p.estado, p.cobrado_milesimos, p.nota], ['pronto', CUSTO, 61], 'níveis 3·2·0 com pesos 3·1·2 = 11 de 18 = 61 — e não o 100 que o modelo mandou');
    assert.deepEqual([x.nota, x.nota_maxima, x.estimativa, x.sem_citacao], [61, 100, true, 1]);
    assert.ok(/estimad/i.test(x.aviso) && /não é a correção da banca/.test(x.aviso), 'o resultado sempre diz que é estimativa');
    assert.deepEqual(x.criterios.map(c => [c.nivel, c.citacao_conferida, c.peso]), [[3, true, 3], [2, false, 1], [0, false, 2]]);
    assert.ok(RESPOSTA.replace(/\s+/g, ' ').includes(x.criterios[0].trecho.replace(/\s+/g, ' ')), 'a citação conferida está na resposta (espaços e quebras não contam)');
    assert.equal(x.criterios[1].trecho, '', 'citação inventada é zerada');
    assert.deepEqual([x.criterios[0].faltou, x.criterios[1].faltou], ['', 'Faltou indicar o marco inicial.'], 'nível 3 não tem "faltou"');
    assert.deepEqual(x.erros_criticos.map(e => e.erro), [CRITICO], 'só erro crítico que está na lista da questão');
    assert.ok(x.erros_criticos[0].trecho.length > 10);
    assert.equal(p.entrada.resposta, RESPOSTA.replace(/\r\n/g, '\n'));
    // o corretor recebeu a rubrica COMPLETA, os erros críticos e a resposta
    const prompt = prompts[prompts.length - 1];
    for (const parte of [NIVEL3, CRITICO, 'Pedido-A:', 'deixa de cumprir determinação judicial', 'peso 3', 'NÃO dê nota']) assert.ok(prompt.includes(parte), 'o pedido ao corretor leva: ' + parte);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM est_evidencias WHERE user_id = ?').get(paula).n, 0, 'correção de IA não vira evidência de competência');
    const log = db.prepare("SELECT * FROM ai_usage_logs WHERE user_id = ? AND agente = 'correcao' ORDER BY quando DESC").get(paula);
    assert.deepEqual([log.status, log.cobranca, log.milesimos, log.product_id, log.input_tokens], ['ok', 'paga', CUSTO, impId, 1000]);
    assert.ok(!JSON.stringify(db.prepare('SELECT * FROM ai_usage_logs WHERE user_id = ?').all(paula)).includes('intercorrente'), 'o texto do aluno não vai para o log');
    const cart = (await req('GET', `/academy/api/ia/carteira?product_id=${impId}`, { jar: 'paula' })).json;
    assert.deepEqual([cart.extrato[0].tipo, cart.extrato[0].milesimos, cart.extrato[0].descricao], ['uso', -CUSTO, 'Correção de resposta escrita'], 'uma linha no extrato, com o nome do serviço');
    const ab = (await req('GET', `${base}/abertas`, { jar: 'paula' })).json.questoes.find(q => q.id === qDisc);
    assert.deepEqual([ab.ultimo_pedido.id, ab.ultimo_pedido.nota], [pedidoPaula, 61], 'a lista mostra a última correção da questão');
    // as peças puras
    assert.equal(ped.citacaoConferida('“DEIXA de cumprir\n determinação judicial”', 'o exequente deixa de cumprir determinação judicial por dois anos'), 'DEIXA de cumprir\n determinação judicial');
    assert.equal(ped.citacaoConferida('prazo', 'o prazo de dois anos'), '', 'uma palavra solta não sustenta nível');
    assert.throws(() => ped.montarResultado({ rubrica: [{ criterio: 'a', peso: 1 }, { criterio: 'b', peso: 1 }] }, 'x', { criterios: [{ n: 1, nivel: 3 }] }), /sem avaliar/, 'critério que o modelo pulou não vira zero em silêncio');
    assert.equal(ped.montarResultado({ rubrica: [{ criterio: 'a', peso: 1 }, { criterio: 'b', peso: 1 }] }, 'x', { criterios: [{ nivel: 9 }, { nivel: -4 }] }).nota, 50, 'nível fora de 0–3 é contido');
  });

  await t('pedidos: o provedor falhou → o pedido fica "falhou", o valor volta inteiro e a tela não recebe um 400 enganoso', async () => {
    const paula = uid(PAULA.email);
    const antes = carteira.saldo(paula);
    for (const m of ['falha', 'torto']) {
      modo = m;
      const c = await criar('paula', { tipo: 'correcao', questao_id: qDisc, resposta: RESPOSTA });
      const r = await confirmar('paula', c.json.pedido.id, c.json.orcamento.orcamento_milesimos);
      assert.equal(r.st, 200, 'a confirmação foi aceita; a falha aparece no estado do pedido: ' + r.texto);
      await ped.aguardar(c.json.pedido.id);
      const p = (await obter('paula', c.json.pedido.id)).json.pedido;
      assert.deepEqual([p.estado, p.cobrado_milesimos, p.resultado], ['falhou', 0, null], m);
      assert.ok(/voltou ao seu saldo/.test(p.erro) && !/provedor fora do ar|JSON/.test(p.erro), 'mensagem para o aluno, sem o erro técnico: ' + p.erro);
      assert.equal(carteira.saldo(paula), antes, 'não gerou, não pagou (' + m + ')');
      assert.equal((await confirmar('paula', c.json.pedido.id, 99999)).st, 409, 'pedido encerrado não roda de novo');
    }
    modo = 'ok';
    assert.equal(movs(paula, 'estorno'), 2);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM ai_usage_logs WHERE user_id = ? AND agente = 'correcao' AND status = 'erro'").get(paula).n, 2);
  });

  await t('pedidos: a franquia NÃO cobre pedido, o isento não paga, e cancelar um orçamento não custa nada', async () => {
    const olga = uid('olga@t.com'), maria = uid('maria@t.com');
    repo.Config.salvar('ia', { consultas_dia: 999 });
    assert.equal(ia.comoCobrar(olga, impId), 'franquia', 'a Olga comprou antes da virada: tem franquia no Tutor');
    assert.equal(ia.comoCobrarPedido(olga), 'paga', 'mas pedido é só pago');
    const c = await criar('olga', { tipo: 'correcao', questao_id: qDisc, resposta: RESPOSTA });
    assert.deepEqual([c.st, c.json.orcamento.cobranca, c.json.orcamento.saldo_suficiente], [200, 'paga', false], c.texto);
    const n = chamadas.length;
    const r = await confirmar('olga', c.json.pedido.id, c.json.orcamento.orcamento_milesimos);
    assert.deepEqual([r.st, r.json.motivo], [402, 'saldo_insuficiente'], r.texto);
    assert.equal(chamadas.length, n);
    const canc = await req('POST', `${base}/pedidos/${c.json.pedido.id}/cancelar`, { jar: 'olga' });
    assert.deepEqual([canc.st, canc.json.pedido.estado], [200, 'cancelado']);
    assert.equal((await confirmar('olga', c.json.pedido.id, 99999)).st, 409);
    // isento: a conta da lista não paga — nem precisa aceitar valor
    assert.equal((await config({ ...LIGADA, isentos: ['maria@t.com'] })).st, 200);
    const antes = movs(maria, 'reserva');
    const cm = await criar('maria', { tipo: 'correcao', questao_id: qDisc, resposta: RESPOSTA });
    assert.deepEqual([cm.st, cm.json.orcamento.cobranca, cm.json.orcamento.saldo_suficiente], [200, 'isento', true], cm.texto);
    const rm = await confirmar('maria', cm.json.pedido.id);
    assert.equal(rm.st, 200, rm.texto);
    await ped.aguardar(cm.json.pedido.id);
    const pm = (await obter('maria', cm.json.pedido.id)).json.pedido;
    assert.deepEqual([pm.estado, pm.cobrado_milesimos, pm.nota, movs(maria, 'reserva')], ['pronto', 0, 61, antes]);
    assert.equal((await config(LIGADA)).st, 200);
    // desligaram a cobrança com um orçamento aberto: confirmar responde indisponível, sem cobrar
    const paula = uid(PAULA.email), saldo = carteira.saldo(paula);
    const cp = await criar('paula', { tipo: 'correcao', questao_id: qPeca, resposta: RESPOSTA });
    await config({ ...LIGADA, ativa: false });
    const off = await confirmar('paula', cp.json.pedido.id, 99999);
    assert.equal(off.st, 503, off.texto);
    await config(LIGADA);
    assert.equal(carteira.saldo(paula), saldo);
    assert.equal((await req('POST', `${base}/pedidos/${cp.json.pedido.id}/cancelar`, { jar: 'paula' })).st, 200);
  });

  await t('porta única: um trabalho de vários passos = UMA reserva e UM acerto; blocos de PDF; teto que soma; saída própria', async () => {
    const paula = uid(PAULA.email);
    const saldo = carteira.saldo(paula), res0 = movs(paula, 'reserva'), ac0 = movs(paula, 'acerto'), est0 = movs(paula, 'estorno'), n0 = chamadas.length;
    const usd = ia.tetoTrabalhoUSD('correcao', { caracteres: 3000, passos: 3 });
    const tr = ia.abrirTrabalho(paula, 'correcao', usd, { id: impId }, { aceite: 999999 });
    assert.equal(tr.teto_milesimos, carteira.precoEmMilesimos(usd));
    assert.equal(carteira.saldo(paula), saldo - tr.teto_milesimos);
    await tr.passo('primeiro passo');
    await tr.passo([{ type: 'text', text: 'leia o documento' }, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from('%PDF-1.4 teste').toString('base64') } }]);
    await tr.passo('terceiro passo', { max_saida: 800 });
    await assert.rejects(() => tr.passo([{ type: 'image', source: {} }]), /não aceito/, 'só texto e PDF');
    const fim = tr.concluir();
    assert.deepEqual([fim.cobranca, fim.cobrado_milesimos], ['paga', carteira.precoEmMilesimos(3 * 0.0105)], 'o custo dos três passos, somado');
    assert.deepEqual([movs(paula, 'reserva') - res0, movs(paula, 'acerto') - ac0, chamadas.length - n0], [1, 1, 3]);
    assert.equal(carteira.saldo(paula), saldo - fim.cobrado_milesimos);
    assert.throws(() => tr.concluir(), /encerrado/);
    await assert.rejects(() => tr.passo('depois de fechar'), /encerrado/);
    const log = db.prepare("SELECT * FROM ai_usage_logs WHERE user_id = ? AND status = 'ok' ORDER BY rowid DESC").get(paula);
    assert.deepEqual([log.input_tokens, log.output_tokens, log.milesimos], [3000, 1500, fim.cobrado_milesimos], 'um log para o trabalho inteiro');
    // falhou no meio: devolve TUDO, mesmo com passo já pago ao provedor
    const t2 = ia.abrirTrabalho(paula, 'correcao', usd, { id: impId }, { aceite: 999999 });
    await t2.passo('um passo que gastou');
    t2.falhar(new Error('quebrou no segundo'));
    t2.falhar(new Error('de novo')); // idempotente
    assert.deepEqual([carteira.saldo(paula), movs(paula, 'estorno') - est0], [saldo - fim.cobrado_milesimos, 1]);
    // o teto soma texto, páginas de PDF (teto fixo por página), passos e áudio
    const um = ia.tetoTrabalhoUSD('correcao', { caracteres: 3000 });
    assert.equal(ia.tetoUSD('correcao', 'x'.repeat(3000)), um, 'tetoUSD é o caso de um passo');
    assert.ok(Math.abs(ia.tetoTrabalhoUSD('correcao', { caracteres: 3000, paginas_pdf: 10 }) - um - 10 * ia.TOKENS_POR_PAGINA_PDF * 3 / 1e6) < 1e-9, 'cada página de PDF entra pelo teto fixo');
    assert.ok(Math.abs(ia.tetoTrabalhoUSD('correcao', { caracteres: 3000, audio_seg: 300 }) - um - 5 * ia.TRANSCRICAO_USD_POR_MIN) < 1e-9, 'o áudio entra pela duração máxima');
    assert.ok(usd > 2.9 * ia.tetoTrabalhoUSD('correcao', { caracteres: 0 }) , 'a saída máxima conta uma vez por passo');
    assert.ok(ia.maxSaida('correcao') > ia.maxSaida('tutor') && ia.maxSaida('edital') >= 16000, 'agente de pedido tem teto de saída próprio, sem o corte global');
    assert.ok(ia.SO_PAGOS.includes('transcricao') && ia.SO_PAGOS.includes('edital') && ia.SO_PAGOS.includes('prova'));
    // a fonte: UMA chamada ao provedor de texto e UMA ao de transcrição, cada uma atrás da sua função
    const fonte = fs.readFileSync(path.join(__dirname, '..', 'ia.js'), 'utf8');
    assert.equal((fonte.match(/messages\.create\(/g) || []).length, 1);
    assert.equal((fonte.match(/await chamar\(/g) || []).length, 1, 'chamar() só dentro de passo()');
    assert.equal((fonte.match(/audio\/transcriptions/g) || []).length, 1, 'a segunda chamada a provedor é uma só');
    assert.equal((fonte.match(/await chamarTranscricao\(/g) || []).length, 1, 'e só o passo transcrever() a usa');
    const outros = fs.readdirSync(path.join(__dirname, '..')).concat(fs.readdirSync(__dirname).map(f => 'estudo/' + f)).filter(f => /\.js$/.test(f) && f !== 'ia.js' && !/testes|selftest/.test(f));
    for (const f of outros) assert.ok(!/api\.openai\.com|messages\.create\(/.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')), 'provedor chamado fora de ia.js: ' + f);
  });

  await t('pedidos/oral: envia o áudio, transcreve e corrige num trabalho só — uma reserva, um acerto, transcrição no resultado', async () => {
    const paula = uid(PAULA.email);
    const audio = Buffer.from('fake-webm-opus-' + 'a'.repeat(4000));
    const enviar = (jar, corpo) => req('POST', `${base}/pedidos/arquivo`, { jar, corpo });
    assert.equal((await enviar('paula', { nome: 'x', mime: 'image/png', conteudo_base64: audio.toString('base64') })).st, 400, 'só PDF e áudio');
    assert.equal((await enviar('paula', { nome: 'x', mime: 'audio/webm', conteudo_base64: '' })).st, 400);
    assert.equal((await enviar('caio', { nome: 'x', mime: 'audio/webm', conteudo_base64: audio.toString('base64') })).st, 403);
    const up = await enviar('paula', { nome: 'resposta-oral', mime: 'audio/webm;codecs=opus', conteudo_base64: audio.toString('base64') });
    assert.deepEqual([up.st, up.json.mime, up.json.tamanho], [200, 'audio/webm', audio.length], up.texto);
    midiaPaula = up.json.media_id;
    const m = ct.Midia.obter(midiaPaula);
    assert.equal(m.owner_user_id, paula, 'o arquivo é de quem enviou');
    assert.ok((await ct.Midia.lerBytes(m)).equals(audio), 'o servidor lê os bytes da mídia');
    await assert.rejects(() => ct.Midia.lerBytes(m, 100), /grande demais/);
    assert.throws(() => ct.Midia.validarArquivoDePedido({ mime: 'application/pdf', tamanho: 41 * 1024 * 1024 }), /40 MB/);
    assert.throws(() => ct.Midia.validarArquivoDePedido({ mime: 'audio/mp4', tamanho: 16 * 1024 * 1024 }), /15 MB/);
    assert.equal((await req('POST', `${base}/pedidos/arquivo-grande`, { jar: 'paula', corpo: { nome: 'prova.pdf', mime: 'application/pdf', tamanho: 5e6 } })).st, 400, 'sem storage externo, o envio grande diz que está indisponível');
    const oral = (jar, extra) => criar(jar, { tipo: 'oral', questao_id: qOral, media_id: midiaPaula, duracao_seg: 95, ...extra });
    assert.equal((await oral('paula', { duracao_seg: 301 })).st, 400, 'até 5 minutos');
    assert.equal((await oral('paula', { questao_id: qDisc })).st, 400, 'gravação é para questão oral');
    assert.equal((await oral('rui')).st, 404, 'áudio de outra pessoa não serve de resposta');
    const c = await oral('paula');
    assert.equal(c.st, 200, c.texto);
    const tetoOral = c.json.orcamento.orcamento_milesimos;
    assert.ok(tetoOral > teto, 'o teto da oral inclui a transcrição pela duração máxima');
    const res0 = movs(paula, 'reserva'), ac0 = movs(paula, 'acerto'), saldo = carteira.saldo(paula);
    chamadas = [];
    const r = await confirmar('paula', c.json.pedido.id, tetoOral);
    assert.equal(r.st, 200, r.texto);
    await ped.aguardar(c.json.pedido.id);
    const p = (await obter('paula', c.json.pedido.id)).json.pedido;
    assert.deepEqual([p.estado, p.tipo, p.nota], ['pronto', 'oral', 61]);
    assert.deepEqual(chamadas, ['transcricao:audio/webm', 'correcao'], 'dois passos, na ordem: transcrever e corrigir');
    assert.deepEqual([p.resultado.transcricao, p.resultado.duracao_seg], [TRANSCRICAO, 90], 'a transcrição vai junto do resultado; a duração é a que o provedor mediu');
    assert.ok(prompts[prompts.length - 1].includes(TRANSCRICAO) && /TRANSCRIÇÃO automática/.test(prompts[prompts.length - 1]), 'o corretor recebe a transcrição e sabe que é fala');
    assert.ok(p.resultado.criterios.every(k => !k.trecho), 'citação que não está na transcrição não fica');
    // 0,0105 do corretor + 1,5 min × US$ 0,006 de transcrição = US$ 0,0195 → 127 milésimos
    const custoOral = carteira.precoEmMilesimos(0.0105 + ia.custoTranscricaoUSD(90));
    assert.deepEqual([custoOral, p.cobrado_milesimos], [127, 127], 'cobrado pela duração real, não pelos 5 minutos orçados');
    assert.deepEqual([movs(paula, 'reserva') - res0, movs(paula, 'acerto') - ac0, carteira.saldo(paula)], [1, 1, saldo - 127]);
    const cart = (await req('GET', `/academy/api/ia/carteira?product_id=${impId}`, { jar: 'paula' })).json;
    assert.equal(cart.extrato[0].descricao, 'Correção de resposta oral (com transcrição)');
    // sem a chave do provedor de transcrição: erro claro ANTES de qualquer reserva
    const [chaveOA, chaveAN] = [process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY];
    ia.__mockParaTeste(null); delete process.env.OPENAI_API_KEY; process.env.ANTHROPIC_API_KEY = 'chave-de-teste-que-nunca-e-usada';
    try {
      assert.deepEqual([ia.ativo(), ia.transcricaoAtiva()], [true, false]);
      const sem = await oral('paula');
      assert.equal(sem.st, 503, sem.texto);
      assert.ok(/transcrição/.test(sem.json.erro) && /Nada foi cobrado/.test(sem.json.erro));
      assert.equal((await req('GET', `${base}/abertas`, { jar: 'paula' })).json.transcricao, false, 'a tela desliga o botão da oral');
      assert.equal(movs(paula, 'reserva') - res0, 1, 'nenhuma reserva nova');
    } finally {
      if (chaveOA) process.env.OPENAI_API_KEY = chaveOA;
      if (chaveAN) process.env.ANTHROPIC_API_KEY = chaveAN; else delete process.env.ANTHROPIC_API_KEY;
      ia.__mockParaTeste(mock);
    }
  });

  await t('pedidos: recarga do valor que falta — para cima até o real, mínimo de R$ 5; creditou, o pedido começa sozinho, uma vez só', async () => {
    const rui = uid(RUI.email);
    const c5 = { recarga_minima_centavos: 500 };
    assert.deepEqual([1, 4999, 5000, 5001, 12345].map(f => carteira.valorDaRecargaQueFalta(f, c5)), [500, 500, 500, 600, 1300], 'o que falta, arredondado para cima ao real inteiro, nunca abaixo do mínimo');
    assert.equal(carteira.valorDaRecargaQueFalta(1, { recarga_minima_centavos: 700 }), 700);
    assert.deepEqual([carteira.RECARGA_MINIMA_PADRAO, carteira.cfg().recarga_minima_centavos], [500, 500]);
    await config({ ...LIGADA, recarga_minima_centavos: 900 });
    assert.equal(carteira.cfg().recarga_minima_centavos, 900, 'o mínimo é configurável em ia_cobranca');
    await config(LIGADA);
    // espia a preferência criada no Mercado Pago (para onde ele devolve o usuário)
    const prefs = [];
    carteira.configurar({ mpFetch: async (p, o) => { if (p === '/checkout/preferences') prefs.push(JSON.parse(o.body)); return mpFetch(p, o); } });
    try {
      const c = await criar('rui', { tipo: 'correcao', questao_id: qDisc, resposta: RESPOSTA });
      const id = c.json.pedido.id, tetoRui = c.json.orcamento.orcamento_milesimos;
      const rec = (corpo) => req('POST', `${base}/pedidos/${id}/recarga`, { jar: 'rui', corpo });
      const sem = await rec({});
      assert.deepEqual([sem.st, sem.json.motivo, sem.json.orcamento_milesimos], [409, 'orcamento_mudou', tetoRui], 'sem aceitar o valor do pedido não se abre pagamento: ' + sem.texto);
      assert.equal((await req('POST', `${base}/pedidos/${id}/recarga`, { jar: 'paula', corpo: { aceite_milesimos: tetoRui } })).st, 404, 'pedido de outro');
      const r = await rec({ aceite_milesimos: tetoRui });
      assert.equal(r.st, 200, r.texto);
      assert.deepEqual([r.json.valor_centavos, r.json.valor, r.json.falta_milesimos, r.json.pedido.aguardando_pagamento], [500, 'R$ 5,00', tetoRui, true]);
      assert.ok(/^https:\/\/mp\.test\//.test(r.json.init_point));
      const pref = prefs[prefs.length - 1];
      assert.deepEqual([pref.items[0].unit_price, pref.external_reference], [5, 'academy-ia:' + r.json.recarga_id]);
      assert.ok(pref.back_urls.success.endsWith(`?recarga=${r.json.recarga_id}#/curso/${impId}/estude/${SLUG}/escrita/${qDisc}`), 'o pagamento devolve o aluno à questão: ' + pref.back_urls.success);
      assert.equal(db.prepare('SELECT pedido_id FROM ia_recargas WHERE id = ?').get(r.json.recarga_id).pedido_id, id, 'a recarga sabe qual pedido destrava');
      assert.equal((await req('POST', '/academy/api/ia/carteira/recarga', { jar: 'rui', corpo: { valor_centavos: 500 } })).st, 400, 'a recarga comum continua só nos pacotes');
      // voltar do navegador não credita nem roda nada; pagamento de valor errado, também não
      const n = chamadas.length;
      const pay = { id: 8801, status: 'approved', external_reference: 'academy-ia:' + r.json.recarga_id, transaction_amount: 5 };
      assert.equal(billing.aplicarPagamento({ ...pay, transaction_amount: 1 }).resultado, 'valor-divergente');
      assert.deepEqual([carteira.saldo(rui), (await obter('rui', id)).json.pedido.estado, chamadas.length], [0, 'orcado', n]);
      // o pagamento confirmou: credita e o pedido começa sozinho, com o aceite gravado
      assert.equal(billing.aplicarPagamento(pay).resultado, 'paga');
      assert.equal(db.prepare('SELECT estado FROM est_pedidos WHERE id = ?').get(id).estado, 'processando', 'começou sem o aluno clicar de novo');
      await ped.aguardar(id);
      const p = (await obter('rui', id)).json.pedido;
      assert.deepEqual([p.estado, p.nota, p.cobrado_milesimos, carteira.saldo(rui)], ['pronto', 61, CUSTO, 5000 - CUSTO], 'o que sobrou da recarga fica no saldo');
      // webhook repetido: não credita de novo, não corrige de novo
      assert.equal(billing.aplicarPagamento(pay).resultado, 'ja-paga');
      assert.equal(ped.aoCreditar(id, rui), false);
      assert.deepEqual([carteira.saldo(rui), movs(rui, 'reserva'), chamadas.length], [5000 - CUSTO, 1, n + 1]);
      // com saldo que já cobre, não se abre pagamento
      const c2 = await criar('rui', { tipo: 'correcao', questao_id: qDisc, resposta: RESPOSTA });
      const sobra = await req('POST', `${base}/pedidos/${c2.json.pedido.id}/recarga`, { jar: 'rui', corpo: { aceite_milesimos: c2.json.orcamento.orcamento_milesimos } });
      assert.equal(sobra.st, 409, sobra.texto);
      // o orçamento subiu depois do aceite (câmbio): o crédito entra, mas o pedido espera a confirmação do aluno
      db.prepare('UPDATE est_pedidos SET aceite_milesimos = 1 WHERE id = ?').run(c2.json.pedido.id);
      assert.equal(ped.aoCreditar(c2.json.pedido.id, rui), false, 'aceite menor que o teto não autoriza');
      assert.equal((await obter('rui', c2.json.pedido.id)).json.pedido.estado, 'orcado');
      assert.equal(movs(rui, 'reserva'), 1);
    } finally { carteira.configurar({ mpFetch }); }
  });

  await t('pedidos: um usuário não lê pedido nem mídia de outro', async () => {
    for (const [m, rota, corpo] of [['GET', `${base}/pedidos/${pedidoPaula}`], ['POST', `${base}/pedidos/${pedidoPaula}/confirmar`], ['POST', `${base}/pedidos/${pedidoPaula}/cancelar`],
      ['POST', `${base}/pedidos/${pedidoPaula}/contestar`, { motivo: 'não é meu, mas discordo mesmo assim' }]]) {
      assert.equal((await req(m, rota, { jar: 'rui', corpo })).st, 404, 'Rui em ' + rota);
      assert.equal((await req(m, rota, { jar: 'caio', corpo })).st, 403, 'Caio (sem o curso) em ' + rota);
    }
    const doRui = (await req('GET', `${base}/pedidos`, { jar: 'rui' })).json.pedidos;
    assert.ok(doRui.length >= 1 && doRui.every(p => p.id !== pedidoPaula), 'a lista é só a dele');
    assert.ok(!JSON.stringify(doRui).includes('deixa de cumprir'), 'e a listagem não carrega o texto das respostas');
    const daPaula = (await req('GET', `${base}/pedidos?questao=${qDisc}`, { jar: 'paula' })).json.pedidos;
    assert.ok(daPaula.length >= 3 && daPaula.every(p => p.questao_id === qDisc) && daPaula.some(p => p.id === pedidoPaula && p.nota === 61), 'histórico da questão');
    assert.equal((await req('GET', `/academy/api/media/${midiaPaula}`, { jar: 'rui' })).st, 404, 'o áudio da Paula não abre para o Rui');
    assert.equal((await req('GET', `/academy/api/media/${midiaPaula}/link`, { jar: 'rui' })).st, 404);
    assert.equal((await req('GET', `/academy/api/media/${midiaPaula}`, { jar: 'paula' })).st, 200, 'abre para ela');
    // outro curso, mesmo id de pedido: 404
    assert.equal((await req('GET', `/academy/api/aluno/cursos/nao-existe/estudo/${SLUG}/pedidos/${pedidoPaula}`, { jar: 'paula' })).st, 404);
  });

  await t('pedidos: "discordo da correção" fica registrado e chega ao staff — que só lê a resposta do aluno com sessão de admin', async () => {
    const cont = (motivo) => req('POST', `${base}/pedidos/${pedidoPaula}/contestar`, { jar: 'paula', corpo: { motivo } });
    assert.equal((await cont('não')).st, 400, 'precisa dizer o motivo');
    const saldo = carteira.saldo(uid(PAULA.email));
    const r = await cont('O critério 2 foi tratado no segundo parágrafo e levou nível 2.');
    assert.deepEqual([r.st, r.json.pedido.contestado, r.json.pedido.contestacao.motivo], [200, true, 'O critério 2 foi tratado no segundo parágrafo e levou nível 2.'], r.texto);
    assert.equal((await cont('de novo, a mesma coisa de antes')).st, 409);
    assert.equal(carteira.saldo(uid(PAULA.email)), saldo, 'contestar não devolve nada sozinho');
    const sem = await req('GET', '/staff/api/academy/estudo/pedidos', { semUser: true });
    assert.equal(sem.st, 401);
    const painel = await req('GET', '/staff/api/academy/estudo/pedidos', { semUser: true, chave: true });
    assert.equal(painel.st, 200, painel.texto);
    const linha = painel.json.contagem.find(x => x.tipo === 'correcao' && x.estado === 'pronto');
    assert.ok(linha && linha.n >= 3 && linha.cobrado >= 2 * CUSTO, JSON.stringify(painel.json.contagem));
    assert.ok(painel.json.contagem.some(x => x.tipo === 'oral' && x.estado === 'pronto' && x.cobrado === 127) && painel.json.contagem.some(x => x.estado === 'falhou' && x.cobrado === 0));
    assert.equal(painel.json.total_cobrado_milesimos, painel.json.contagem.reduce((s, x) => s + x.cobrado, 0));
    assert.equal(painel.json.total_cobrado_milesimos, db.prepare("SELECT -SUM(m.milesimos) n FROM ia_movimentos m WHERE m.ref IN (SELECT ref FROM est_pedidos WHERE ref != '')").get().n, 'o total cobrado bate com o razão da carteira');
    assert.deepEqual(painel.json.contestacoes_abertas.map(c => [c.id, c.email, c.nota]), [[pedidoPaula, PAULA.email, 61]]);
    assert.ok(!painel.texto.includes('deixa de cumprir') && !painel.texto.includes('Excelência'), 'a listagem do staff não leva resposta nem transcrição de aluno');
    // abrir um pedido mostra a resposta: só com SESSÃO de admin — a chave de publicação não lê
    assert.equal((await req('GET', `/staff/api/academy/estudo/pedidos/${pedidoPaula}`, { semUser: true, chave: true })).st, 401);
    assert.equal((await req('GET', `/staff/api/academy/estudo/pedidos/${pedidoPaula}`, { user: 'op' })).st, 403);
    const aberto = await req('GET', `/staff/api/academy/estudo/pedidos/${pedidoPaula}`);
    assert.equal(aberto.st, 200, aberto.texto);
    assert.ok(aberto.json.pedido.entrada.resposta.includes('deixa de cumprir') && aberto.json.questao.rubrica[0].nivel3 === NIVEL3 && aberto.json.pedido.email === PAULA.email);
    assert.equal((await req('POST', `/staff/api/academy/estudo/pedidos/${pedidoPaula}/contestacao`, { semUser: true, chave: true, corpo: { resposta: 'x' } })).st, 401);
    assert.equal((await req('POST', `/staff/api/academy/estudo/pedidos/${pedidoPaula}/contestacao`, { corpo: { resposta: 'Revimos: o nível 2 está correto, faltou o marco inicial.' } })).st, 200);
    assert.deepEqual((await req('GET', '/staff/api/academy/estudo/pedidos')).json.contestacoes_abertas, [], 'respondida, sai das abertas');
    const visto = (await obter('paula', pedidoPaula)).json.pedido.contestacao;
    assert.ok(/marco inicial/.test(visto.resposta) && !('resolvida_por' in visto), 'a aluna lê a resposta, sem o nome de quem respondeu');
  });

  await t('pedidos: "processando" de um processo que morreu vira "falhou" e a reserva volta na hora', async () => {
    const paula = uid(PAULA.email), saldo = carteira.saldo(paula), agora = new Date().toISOString();
    // o serviço caiu entre a reserva e o acerto: sobrou o pedido "processando" e a reserva sem desfecho
    db.prepare("INSERT INTO ia_movimentos (id, user_id, tipo, milesimos, ref, detalhe, quem, criado_em) VALUES ('mv-preso', ?, 'reserva', -400, 'ref-presa', 'correcao', '', ?)").run(paula, agora);
    db.prepare(`INSERT INTO est_pedidos (id, user_id, product_id, escopo_id, tipo, estado, questao_id, entrada, orcamento_milesimos, aceite_milesimos, ref, criado_em, atualizado_em)
      VALUES ('ped-preso', ?, ?, (SELECT id FROM est_escopos WHERE slug = ?), 'correcao', 'processando', ?, '{}', 400, 400, 'ref-presa', ?, ?)`).run(paula, impId, SLUG, qDisc, agora, agora);
    assert.equal(carteira.saldo(paula), saldo - 400, 'reserva recente: a regra dos 10 minutos ainda não a devolveria');
    assert.equal(ped.recuperarInterrompidos(), 1);
    const p = (await obter('paula', 'ped-preso')).json.pedido;
    assert.deepEqual([p.estado, p.erro, p.cobrado_milesimos], ['falhou', 'interrompido — valor devolvido', 0]);
    assert.equal(carteira.saldo(paula), saldo, 'valor devolvido');
    assert.equal(ped.recuperarInterrompidos(), 0, 'e só uma vez');
    assert.equal(carteira.devolverReserva('ref-presa'), 0, 'devolver de novo não credita de novo');
    assert.equal(carteira.saldo(paula), saldo);
    // pedido que está rodando NESTE processo não é "interrompido"
    let soltar; portao = new Promise((ok) => { soltar = ok; });
    const c = await criar('paula', { tipo: 'correcao', questao_id: qDisc, resposta: RESPOSTA });
    await confirmar('paula', c.json.pedido.id, c.json.orcamento.orcamento_milesimos);
    assert.equal(ped.recuperarInterrompidos(), 0);
    assert.equal((await obter('paula', c.json.pedido.id)).json.pedido.estado, 'processando');
    soltar(); portao = null;
    await ped.aguardar(c.json.pedido.id);
    assert.equal((await obter('paula', c.json.pedido.id)).json.pedido.estado, 'pronto');
  });

  await t('pedidos: a tela tem a aba "Escrita e oral", diz "estimativa" junto da nota e trata o orçamento, o pagamento e a espera', async () => {
    const tela = fs.readFileSync(path.join(__dirname, '..', 'app-estudo.js'), 'utf8');
    assert.ok(tela.includes("['escrita', 'Escrita e oral']") && /escrita: escrita/.test(tela) && /LISTAS = \{[^}]*escrita: 1/.test(tela), 'a aba existe, abre e guarda o lugar da lista');
    assert.ok(/<span class="es-selo ambar">estimativa<\/span>/.test(tela) && tela.includes('es-eo-nota'), 'a nota nunca aparece sem o rótulo de estimativa');
    for (const parte of ["'/abertas'", "'/pedidos'", "/confirmar'", "/recarga'", "/contestar'", "/cancelar'", "'/pedidos/arquivo'", 'MediaRecorder', 'Discordo da correção', 'Meus pedidos', 'Regravar', "Pagar ' + esc(o.recarga) + ' e corrigir", 'CONSULTAS_MAX']) {
      assert.ok(tela.includes(parte), 'a tela perdeu: ' + parte);
    }
    assert.ok(/api\('POST', base\(\) \+ '\/pedidos\/' \+ p\.id \+ '\/confirmar', null, o\.orcamento_milesimos/.test(tela), 'o aceite que vai ao servidor é o do valor que a tela mostrou');
    assert.ok(/if \(n >= CONSULTAS_MAX\)/.test(tela) && /E\.aoSair = function/.test(tela), 'a consulta periódica para sozinha e ao sair da tela');
    const i = tela.indexOf('// ================= ESCRITA E ORAL'), f = tela.indexOf('return { cartao: cartao, abrir: abrir }');
    assert.ok(i > 0 && f > i && !/localStorage|sessionStorage/.test(tela.slice(i, f)), 'a resposta do aluno não mora no navegador');
    const cliente = fs.readFileSync(path.join(__dirname, '..', 'app-cliente.js'), 'utf8');
    assert.ok(/\(tutor\|ia\|lab\|ferramentas\|pedidos\)/.test(cliente), 'o aviso de débito também vale para os pedidos');
    const css = await req('GET', '/academy/estude.css');
    assert.ok(/\.es-eo-nota/.test(css.texto) && /\.es-eo-crit/.test(css.texto));
    const js = await req('GET', '/academy/estude.js');
    assert.ok(js.st === 200 && js.texto.includes('Escrita e oral'));
  });

  // desliga a cobrança ao fim, como os testes da carteira a deixaram
  await config({ ativa: false });
  ia.__mockParaTeste(null);
}

module.exports = { rodar };
