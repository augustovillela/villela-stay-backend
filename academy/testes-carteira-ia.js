// =====================================================================
// Villela Academy — CARTEIRA DE IA · testes. Chamado por último pelo
// selftest (npm run test:academy), porque LIGA a cobrança. Recebe o curso
// importado (impId, da Maria) e a Olga, matriculada antes da virada.
// A IA é simulada com consumo fixo, para o valor cobrado ser conferível.
// =====================================================================
'use strict';
const assert = require('assert');

async function rodar({ t, req, impId, jars }) {
  const { db } = require('./db');
  const ia = require('./ia');
  const carteira = require('./carteira-ia');
  const repo = require('./repo');
  const ct = require('./repo-conteudo');
  const billing = require('./billing');

  console.log('\n— carteira de IA: orçar, aceitar, cobrar antes, acertar depois; franquia, cortesia e recarga —');
  // 1.000 tokens de entrada e 500 de saída no preço padrão (US$ 3 / 15 por milhão) = US$ 0,0105
  // × câmbio 5,00 × 1,30 de margem = R$ 0,06825 → 69 milésimos (sempre para cima)
  const USO = { input_tokens: 1000, output_tokens: 500 };
  const CUSTO = 69;
  let chamadas = 0, falhar = false;
  ia.__mockParaTeste(async ({ agente }) => {
    chamadas++;
    if (falhar) throw new Error('provedor fora do ar');
    return { usage: USO, json: agente === 'refinar' ? { texto: 'lapidado', mudancas: [] } : { resposta: 'Resposta do tutor.', fontes: [], nao_encontrado: false, sugestoes: [], aula_referencia: '' } };
  });
  const NINA = { nome: 'Nina Nova', email: 'nina@t.com', senha: 'senha-forte-7', aceite_termos: true };
  const perguntar = (jar, aceite) => req('POST', '/academy/api/aluno/tutor/perguntar', { jar, corpo: { product_id: impId, pergunta: 'Como conferir uma citação?' }, cab: aceite ? { 'x-ia-aceite': String(aceite) } : {} });
  const carteiraDe = async (jar) => (await req('GET', `/academy/api/ia/carteira?product_id=${impId}`, { jar })).json;
  const config = (valor) => req('POST', '/staff/api/academy/config', { corpo: { chave: 'ia_cobranca', valor } });
  const creditar = (corpo, opcoes = {}) => req('POST', '/staff/api/academy/ia/creditos', { corpo, ...opcoes });
  let teto = 0;

  await t('carteira: desligada por padrão, e não liga sem câmbio', async () => {
    assert.equal((await carteiraDe('olga')).ativa, false);
    assert.equal((await config({ ativa: true, margem_pct: 30 })).st, 400, 'ligar sem câmbio é recusado');
    assert.equal((await config({ ativa: false, margem_pct: 30 })).st, 200);
    assert.equal(carteira.cfg().ativa, false);
    assert.equal(carteira.cfg().virada_em, '', 'desligada nunca marcou virada');
    assert.deepEqual(carteira.cfg().pacotes_centavos, [2000, 5000, 10000], 'pacotes de R$ 20, 50 e 100');
    assert.equal(carteira.cfg().margem_pct, 30);
    assert.equal(ia.comoCobrar('qualquer', impId), '', 'desligada: vale o limite diário antigo');
  });

  await t('carteira: conta do preço — custo do provedor × câmbio × 1,30, em milésimos, para cima', async () => {
    const c = { cambio_brl_usd: 5, margem_pct: 30 };
    assert.equal(ia.custoUSD('mock', USO), 0.0105);
    assert.equal(carteira.precoEmMilesimos(0.0105, c), CUSTO);
    assert.equal(carteira.precoEmMilesimos(0.0105, { cambio_brl_usd: 5, margem_pct: 0 }), 53, 'sem margem: 52,5 → 53');
    assert.equal(carteira.precoEmMilesimos(0, c), 0);
    assert.ok(ia.tetoUSD('tutor', 'x'.repeat(3000)) > ia.custoUSD('claude-sonnet-5', USO), 'o teto cobre entrada estimada + saída máxima');
    assert.equal(ia.custoUSD('claude-haiku-4-5', { input_tokens: 1e6, cache_read_input_tokens: 1e6, output_tokens: 0 }), 1.1, 'leitura de cache custa um décimo');
  });

  await t('carteira: ligada — quem se matricula DEPOIS da virada paga; sem saldo a IA nem é chamada', async () => {
    assert.equal((await config({ ativa: true, cambio_brl_usd: 5, margem_pct: 30, isentos: [] })).st, 200);
    assert.equal(carteira.cfg().ativa, true);
    const virada = carteira.cfg().virada_em;
    assert.ok(Date.now() - Date.parse(virada) < 5000, 'a virada nasce no momento em que a cobrança é ligada');
    await config({ ativa: true, cambio_brl_usd: 5, margem_pct: 30, isentos: [], virada_em: '2020-01-01T00:00:00.000Z' });
    assert.equal(carteira.cfg().virada_em, virada, 'e não muda mais, nem pedindo');
    await new Promise(r => setTimeout(r, 15));
    assert.equal((await req('POST', '/academy/api/signup', { corpo: NINA, jar: 'nina' })).st, 200);
    ct.Matriculas.criar(impId, NINA.email, 'teste', 'cortesia');
    const c = await carteiraDe('nina');
    assert.deepEqual([c.ativa, c.saldo_milesimos, c.cobranca_agora, c.franquia_neste_curso, c.isento], [true, 0, 'paga', false, false]);
    const antes = chamadas;
    const r = await perguntar('nina');
    assert.equal(r.st, 402, r.texto);
    assert.deepEqual([r.json.motivo, r.json.saldo_milesimos], ['saldo_insuficiente', 0]);
    assert.ok(r.json.orcamento_milesimos > 0 && /R\$/.test(r.json.orcamento), 'o erro traz o valor');
    assert.equal(chamadas, antes, 'sem saldo, nenhum centavo é gasto no provedor');
    teto = r.json.orcamento_milesimos;
  });

  await t('carteira: crédito de cortesia só com sessão de admin — a chave de publicação não dá saldo', async () => {
    const corpo = { email: NINA.email, valor_centavos: 500, motivo: 'cortesia de boas-vindas' };
    assert.equal((await creditar(corpo, { semUser: true })).st, 401);
    assert.equal((await creditar(corpo, { semUser: true, chave: true })).st, 401, 'PUBLISH_KEY não credita');
    assert.equal((await creditar(corpo, { user: 'op' })).st, 403, 'staff sem admin não credita');
    assert.equal((await creditar({ ...corpo, motivo: '' })).st, 400, 'sem motivo não entra');
    assert.equal((await creditar({ ...corpo, email: 'ninguem@t.com' })).st, 404);
    assert.equal((await creditar({ ...corpo, valor_centavos: -100 })).st, 400, 'cortesia negativa não existe');
    assert.equal((await creditar({ ...corpo, valor_centavos: 5000000 })).st, 400, 'valor absurdo é barrado');
    const r = await creditar(corpo);
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.saldo_milesimos, 5000);
    assert.equal((await creditar({ ...corpo, tipo: 'ajuste', valor_centavos: -9999, motivo: 'teste de ajuste' })).st, 400, 'ajuste não deixa saldo negativo');
    const c = await carteiraDe('nina');
    assert.equal(c.extrato[0].descricao, 'Crédito de cortesia — cortesia de boas-vindas', 'o motivo aparece no extrato do usuário');
    const p = (await req('GET', '/staff/api/academy/ia/carteiras')).json;
    assert.ok(p.carteiras.some(x => x.email === NINA.email && x.cortesia === 5000 && x.carregado === 0), 'cortesia não se confunde com recarga');
    assert.equal((await req('GET', '/staff/api/academy/ia/carteiras', { semUser: true, chave: true })).st, 401);
  });

  await t('carteira: com saldo, ainda exige aceitar o VALOR — e cobra o custo real, não o teto', async () => {
    let antes = chamadas;
    let r = await perguntar('nina');
    assert.deepEqual([r.st, r.json.motivo, r.json.orcamento_milesimos], [402, 'confirmar', teto], r.texto);
    r = await perguntar('nina', teto - 1);
    assert.equal(r.st, 402, 'aceite abaixo do orçamento não vale');
    assert.deepEqual([chamadas, carteira.saldo(repo.Usuarios.porEmail(NINA.email).id)], [antes, 5000], 'nada gerado, nada debitado');
    r = await perguntar('nina', teto);
    assert.equal(r.st, 200, r.texto);
    assert.equal(chamadas, antes + 1);
    assert.ok(CUSTO < teto, 'o real fica abaixo do teto');
    const c = await carteiraDe('nina');
    assert.equal(c.saldo_milesimos, 5000 - CUSTO, 'debitou o custo real; a diferença do teto voltou');
    assert.deepEqual([c.extrato[0].tipo, c.extrato[0].milesimos, c.extrato[0].descricao], ['uso', -CUSTO, 'Tutor Villela'], 'uma linha por uso, não duas');
    const log = db.prepare("SELECT cobranca, milesimos, product_id FROM ai_usage_logs WHERE user_id = ? AND status = 'ok' ORDER BY quando DESC").get(repo.Usuarios.porEmail(NINA.email).id);
    assert.deepEqual([log.cobranca, log.milesimos, log.product_id], ['paga', CUSTO, impId]);
    // custo real maior que o teto (estimativa furada): cobra o teto e devolve zero — nunca passa do aceito
    assert.equal(carteira.acertar(repo.Usuarios.porEmail(NINA.email).id, 'ref-teto', 100, 250, 'x'), 100, 'nunca cobra acima do teto aceito');
    db.prepare("DELETE FROM ia_movimentos WHERE ref = 'ref-teto'").run();
  });

  await t('carteira: a IA falhou → o valor volta inteiro; reserva órfã também volta', async () => {
    const uid = repo.Usuarios.porEmail(NINA.email).id;
    const saldoAntes = carteira.saldo(uid);
    falhar = true;
    const r = await perguntar('nina', teto);
    falhar = false;
    assert.equal(r.st, 400, r.texto);
    assert.equal(carteira.saldo(uid), saldoAntes, 'não gerou, não pagou');
    assert.ok(/não gerou, valor devolvido/.test((await carteiraDe('nina')).extrato[0].descricao));
    // o servidor caiu entre a reserva e o acerto: depois de 10 minutos o valor é devolvido
    db.prepare("INSERT INTO ia_movimentos (id, user_id, tipo, milesimos, ref, detalhe, quem, criado_em) VALUES ('orf1', ?, 'reserva', -300, 'ref-orfa', 'tutor', '', ?)").run(uid, new Date(Date.now() - 11 * 60e3).toISOString());
    assert.equal(carteira.saldo(uid), saldoAntes, 'reserva órfã devolvida');
    assert.equal(carteira.saldo(uid), saldoAntes, 'e só uma vez');
    db.prepare("INSERT INTO ia_movimentos (id, user_id, tipo, milesimos, ref, detalhe, quem, criado_em) VALUES ('viva1', ?, 'reserva', -300, 'ref-viva', 'tutor', '', ?)").run(uid, new Date().toISOString());
    assert.equal(carteira.saldo(uid), saldoAntes - 300, 'reserva de uma geração em andamento continua valendo');
    db.prepare("DELETE FROM ia_movimentos WHERE id = 'viva1'").run();
  });

  await t('carteira: quem comprou ANTES da virada mantém a franquia diária naquele curso; acabou, paga', async () => {
    const olga = repo.Usuarios.porEmail('olga@t.com');
    repo.Config.salvar('ia', { consultas_dia: ia.usadasHoje(olga.id) + 1 }); // sobra exatamente uma pergunta grátis hoje
    let c = await carteiraDe('olga');
    assert.deepEqual([c.franquia_neste_curso, c.cobranca_agora, c.saldo_milesimos], [true, 'franquia', 0]);
    const r = await perguntar('olga');
    assert.equal(r.st, 200, r.texto);
    assert.equal(db.prepare("SELECT cobranca FROM ai_usage_logs WHERE user_id = ? AND status = 'ok' ORDER BY quando DESC").get(olga.id).cobranca, 'franquia');
    c = await carteiraDe('olga');
    assert.deepEqual([c.cobranca_agora, c.saldo_milesimos], ['paga', 0], 'franquia do dia esgotada: daqui em diante sai do saldo');
    assert.equal((await perguntar('olga')).st, 402, 'não é mais o 429 do limite: é o pedido de saldo');
    assert.equal(carteira.temFranquia(olga.id, 'outro-curso'), false, 'a franquia é do curso comprado antes, não da conta');
  });

  await t('carteira: isento é só quem está na lista (a conta do dono) — cortesia total não isenta', async () => {
    const maria = repo.Usuarios.porEmail('maria@t.com');
    assert.equal(ia.comoCobrar(maria.id, impId), 'paga', 'nem o produtor no próprio curso é isento');
    const atual = repo.Config.obter('ia_cobranca', {});
    // a lista chega colada como o dono escreve: ponto e vírgula, vírgula, espaço, maiúsculas, repetição
    assert.equal((await config({ ...atual, isentos: ['outra@t.com; MARIA@t.com, maria@t.com', '  terceira@t.com.br'].join(String.fromCharCode(10)) })).st, 200);
    assert.deepEqual(carteira.cfg().isentos, ['outra@t.com', 'maria@t.com', 'terceira@t.com.br']);
    assert.equal(ia.comoCobrar(maria.id, impId), 'isento');
    const torta = await config({ ...atual, isentos: 'maria@t.com; fulano-sem-arroba' });
    assert.equal(torta.st, 400); assert.ok(/não parece um e-mail/.test(torta.json.erro), 'e-mail torto é recusado, não ignorado');
    assert.deepEqual(carteira.cfg().isentos.length, 3, 'a lista anterior fica como estava');
    db.prepare('UPDATE users SET cortesia = 1 WHERE email = ?').run(NINA.email);
    assert.equal(ia.comoCobrar(repo.Usuarios.porEmail(NINA.email).id, impId), 'paga', 'acesso de cortesia aos cursos não é crédito de IA');
    db.prepare('UPDATE users SET cortesia = 0 WHERE email = ?').run(NINA.email);
  });

  await t('carteira: recarga só nos pacotes; o crédito entra por pagamento confirmado, uma vez só', async () => {
    const uid = repo.Usuarios.porEmail(NINA.email).id;
    assert.equal((await req('POST', '/academy/api/ia/carteira/recarga', { jar: 'nina', corpo: { valor_centavos: 1234 } })).st, 400, 'valor fora dos pacotes');
    const r = await req('POST', '/academy/api/ia/carteira/recarga', { jar: 'nina', corpo: { valor_centavos: 2000 } });
    assert.equal(r.st, 200, r.texto);
    assert.ok(/^https:\/\/mp\.test\//.test(r.json.init_point));
    const antes = carteira.saldo(uid);
    assert.equal((await carteiraDe('nina')).recargas_pendentes.length, 1, 'voltar do pagamento não credita: fica pendente');
    const pay = { id: 7771, status: 'approved', external_reference: 'academy-ia:' + r.json.recarga_id, transaction_amount: 20 };
    assert.equal(billing.aplicarPagamento({ ...pay, transaction_amount: 2 }).resultado, 'valor-divergente', 'pagou R$ 2 por uma recarga de R$ 20: não credita');
    assert.equal(carteira.saldo(uid), antes);
    assert.equal(billing.aplicarPagamento(pay).resultado, 'paga');
    assert.equal(carteira.saldo(uid), antes + 20000);
    assert.equal(billing.aplicarPagamento(pay).resultado, 'ja-paga');
    assert.equal(carteira.saldo(uid), antes + 20000, 'webhook repetido não credita de novo');
    assert.equal((await req('POST', `/academy/api/ia/carteira/recarga/${r.json.recarga_id}/conferir`, { jar: 'olga' })).st, 404, 'recarga é de quem a fez');
    assert.equal(billing.aplicarPagamento({ ...pay, status: 'refunded' }).resultado, 'reembolsada');
    assert.equal(carteira.saldo(uid), antes, 'dinheiro devolvido, crédito retirado');
    assert.equal(billing.aplicarPagamento({ ...pay, status: 'refunded' }).resultado, 'sem-acao:refunded');
    // "já paguei": a conferência busca o pagamento no Mercado Pago e credita
    const r2 = await req('POST', '/academy/api/ia/carteira/recarga', { jar: 'nina', corpo: { valor_centavos: 5000 } });
    const conf = await req('POST', `/academy/api/ia/carteira/recarga/${r2.json.recarga_id}/conferir`, { jar: 'nina' });
    assert.deepEqual([conf.json.status, conf.json.saldo_milesimos], ['paga', antes + 50000], conf.texto);
  });

  await t('carteira: toda rota que chama IA devolve o orçamento no 402 (mentor, lapidar e produtor também)', async () => {
    const maria = repo.Usuarios.porEmail('maria@t.com');
    const atual = repo.Config.obter('ia_cobranca', {});
    await config({ ...atual, isentos: [] });
    assert.equal(carteira.saldo(maria.id), 0);
    for (const [rota, corpo] of [
      [`/academy/api/aluno/cursos/${impId}/ferramentas/refinar`, { tipo: 'prompt', texto: 'Você é um assistente jurídico. Analise o contrato abaixo e liste os riscos.' }],
      ['/academy/api/ia/produtor/copy', { product_id: impId }],
      ['/academy/api/ia/produtor/pedagogico', { product_id: impId }],
    ]) {
      const r = await req('POST', rota, { jar: 'maria', corpo });
      assert.equal(r.st, 402, rota + ': ' + r.texto);
      assert.ok(r.json.orcamento_milesimos > 0 && r.json.motivo === 'saldo_insuficiente', rota + ' sem o orçamento no erro');
    }
    // a fonte não pode ter chamada ao provedor fora do executar: é a porta única da cobrança
    const fonte = require('fs').readFileSync(require('path').join(__dirname, 'ia.js'), 'utf8');
    assert.equal((fonte.match(/messages\.create\(/g) || []).length, 1, 'uma só chamada ao provedor, dentro de chamar()');
    assert.equal((fonte.match(/await chamar\(/g) || []).length, 1, 'e chamar() só é usada por executar()');
  });

  await t('carteira: a tela do aceite é carregada ANTES do app, e o app refaz a chamada com o valor aceito', async () => {
    const js = await req('GET', '/academy/carteira.js');
    assert.equal(js.st, 200); assert.ok(js.texto.includes('window.AcademyCarteiraUI'));
    const app = (await req('GET', '/academy/app')).texto;
    assert.ok(app.indexOf('/academy/carteira.js') > 0 && app.indexOf('/academy/carteira.js') < app.indexOf('/academy/app.js'), 'o api() do app procura window.AcademyCarteiraUI');
    const cliente = require('fs').readFileSync(require('path').join(__dirname, 'app-cliente.js'), 'utf8');
    assert.ok(cliente.includes('X-IA-Aceite') && cliente.includes('r.status === 402'), 'o 402 é tratado no api(), uma vez, para todas as telas');
    const staff = require('fs').readFileSync(require('path').join(__dirname, '..', 'staff', 'app-academy.js'), 'utf8');
    assert.ok(staff.includes('/ia/creditos') && staff.includes('ia: ACAD.vIA'), 'o crédito de cortesia tem tela no Portal Staff');
  });

  await t('carteira: câmbio = PTAX do dia + folga; Banco Central fora do ar não vira preço velho em silêncio', async () => {
    const avisos = [];
    let resposta = { ok: true, json: async () => ({ value: [{ cotacaoVenda: 5.0119, dataHoraCotacao: '2026-10-08 13:08:16.814' }] }) };
    const pedidos = [];
    carteira.configurar({ buscar: async (url) => { pedidos.push(url); if (resposta instanceof Error) throw resposta; return resposta; }, notificar: async (m) => { avisos.push(m); } });
    const base = { ativa: true, cambio_modo: 'ptax', cambio_folga_pct: 10, margem_pct: 30, isentos: [] };
    repo.Config.salvar('ia_ptax', null);
    assert.equal((await config(base)).st, 400, 'PTAX ainda não buscado e sem reserva: não liga');
    const r = await req('POST', '/staff/api/academy/ia/ptax');
    assert.deepEqual([r.st, r.json.ok, r.json.valor], [200, true, 5.0119], r.texto);
    assert.ok(pedidos[0].includes('olinda.bcb.gov.br') && pedidos[0].includes('cotacaoVenda'), 'busca a cotação de VENDA no Banco Central');
    assert.equal((await req('POST', '/staff/api/academy/ia/ptax', { semUser: true, chave: true })).st, 401);
    assert.equal((await config(base)).st, 200);
    let c = carteira.cfg();
    assert.deepEqual([c.ativa, c.cambio_origem, c.cambio_brl_usd, c.cambio_aviso], [true, 'ptax', 5.5131, ''], '5,0119 + 10%');
    assert.equal(carteira.precoEmMilesimos(0.0105), 76, 'o preço acompanha o câmbio do dia');
    // cotação absurda não entra: fica a de antes
    resposta = { ok: true, json: async () => ({ value: [{ cotacaoVenda: 501.19, dataHoraCotacao: 'x' }] }) };
    assert.equal((await carteira.atualizarPTAX()).ok, false);
    assert.equal(carteira.cfg().cambio_brl_usd, 5.5131);
    // Banco Central fora do ar há 4 dias: segue com o último PTAX, mas AVISA (na tela e ao dono)
    resposta = new Error('ECONNRESET');
    const envelhecer = (dias) => repo.Config.salvar('ia_ptax', { ...repo.Config.obter('ia_ptax', {}), buscado_em: new Date(Date.now() - dias * 864e5).toISOString(), alertado_em: '' });
    envelhecer(4);
    assert.equal((await carteira.atualizarPTAX()).ok, false);
    c = carteira.cfg();
    assert.deepEqual([c.ativa, c.cambio_origem], [true, 'ptax']);
    assert.ok(/sem atualizar há 4 dia/.test(c.cambio_aviso), c.cambio_aviso);
    assert.equal(avisos.length, 1, 'o dono é avisado');
    await carteira.atualizarPTAX();
    assert.equal(avisos.length, 1, 'uma vez por dia, não a cada tentativa');
    // passou de 7 dias: PTAX vencido. Sem reserva, a cobrança se suspende; com reserva, usa a reserva
    envelhecer(8);
    c = carteira.cfg();
    assert.deepEqual([c.ativa, c.ligada, c.cambio_origem], [false, true, ''], 'suspensa, e a tela do dono mostra que ele a ligou');
    assert.equal(ia.comoCobrar(repo.Usuarios.porEmail(NINA.email).id, impId), '', 'suspensa = ninguém é cobrado com número velho');
    assert.equal((await config({ ...base, cambio_brl_usd: 5.5 })).st, 200);
    c = carteira.cfg();
    assert.deepEqual([c.ativa, c.cambio_origem, c.cambio_brl_usd], [true, 'fixo', 5.5]);
    assert.ok(/reserva/.test(c.cambio_aviso));
    // modo fixo ignora o PTAX
    await config({ ...base, cambio_modo: 'fixo', cambio_brl_usd: 6 });
    assert.deepEqual([carteira.cfg().cambio_origem, carteira.cfg().cambio_brl_usd, carteira.cfg().cambio_aviso], ['fixo', 6, '']);
    carteira.configurar({ buscar: async () => { throw new Error('rede desligada no teste'); }, notificar: null });
  });

  // desliga a cobrança ao fim (a virada, uma vez marcada, fica)
  await config({ ativa: false });
  ia.__mockParaTeste(null);
  void jars;
}

module.exports = { rodar };
