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
    // custos de IA (só leitura, lido pela chave no relatório semanal de despesas de sistemas): a cortesia aparece e nada vaza saldo por conta
    const k = await req('GET', '/staff/api/academy/ia-custos?dias=7', { semUser: true, chave: true });
    assert.equal(k.st, 200, k.texto);
    assert.ok(k.json.carteiras.cortesia_dada_total_brl >= 5 && k.json.movimentos.cortesia.n >= 1, 'a cortesia dada entra no relatório');
    assert.ok(k.json.total && typeof k.json.total.bancado_pela_plataforma_usd === 'number' && Array.isArray(k.json.contas_bancadas), 'o total diz quanto a plataforma bancou');
    assert.equal((await req('GET', '/staff/api/academy/ia-custos', { semUser: true })).st, 401, 'sem chave nem sessão não lê');
    // a parte nominal: quem recebeu crédito de cortesia aparece com o valor; a lista de isentos é devolvida mesmo sem uso
    const pp = await req('GET', '/staff/api/academy/ia-custos/pessoas?dias=7', { semUser: true, chave: true });
    assert.equal(pp.st, 200, pp.texto);
    assert.ok(pp.json.credito_de_cortesia.some(x => x.email === NINA.email && x.credito_cortesia_brl === 5), 'a conta com crédito de cortesia aparece com o valor dado');
    assert.ok(Array.isArray(pp.json.isentos) && Array.isArray(pp.json.isentos_sem_conta) && Array.isArray(pp.json.maiores_do_periodo) && typeof pp.json.cortesia_de_curso.contas === 'number');
    assert.equal((await req('GET', '/staff/api/academy/ia-custos/pessoas', { semUser: true })).st, 401);
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

  await t('auditoria 6 e 18: a mensagem do provedor não chega ao aluno (fica no log de uso) — e, se o ACERTO não se grava, a reserva é solta e devolvida na hora', async () => {
    const uid = repo.Usuarios.porEmail(NINA.email).id;
    const saldoAntes = carteira.saldo(uid);
    const ultimoLog = () => db.prepare('SELECT * FROM ai_usage_logs WHERE user_id = ? ORDER BY rowid DESC').get(uid);
    // 18: o provedor caiu com um erro cheio de detalhe técnico
    falhar = true;
    let r = await perguntar('nina', teto);
    falhar = false;
    assert.ok(r.st >= 400 && r.json.erro === ia.FALHA_AO_USUARIO && !/provedor fora do ar|IA falhou|claude|mock/.test(r.texto), 'quem perguntou lê o que houve, sem o texto do provedor: ' + r.texto);
    assert.deepEqual([ultimoLog().status, ultimoLog().detalhe], ['erro', 'IA falhou: provedor fora do ar'], 'o detalhe técnico fica no log de uso');
    assert.equal(carteira.saldo(uid), saldoAntes);
    // 6: a IA respondeu, mas o acerto não pôde ser gravado (banco travado, disco cheio)
    const antes = chamadas;
    db.exec("CREATE TRIGGER teste_sem_acerto BEFORE INSERT ON ia_movimentos WHEN NEW.tipo = 'acerto' BEGIN SELECT RAISE(ABORT, 'disco cheio (teste)'); END");
    try { r = await perguntar('nina', teto); } finally { db.exec('DROP TRIGGER IF EXISTS teste_sem_acerto'); }
    assert.equal(chamadas, antes + 1, 'o provedor foi chamado');
    assert.ok(r.st === 503 && r.json.erro === ia.FALHA_AO_USUARIO && !/disco cheio|SQLITE|constraint/i.test(r.texto), 'sem a resposta e sem o erro do banco: ' + r.texto);
    const ref = db.prepare("SELECT ref FROM ia_movimentos WHERE user_id = ? AND tipo = 'reserva' ORDER BY rowid DESC").get(uid).ref;
    assert.equal(carteira.reservaViva(ref), false, 'a reserva não fica "viva" no processo até o próximo reinício');
    assert.deepEqual(db.prepare('SELECT tipo FROM ia_movimentos WHERE ref = ? ORDER BY rowid').all(ref).map(x => x.tipo), ['reserva', 'estorno'], 'e volta já, sem esperar os 10 minutos da reserva órfã');
    assert.equal(carteira.saldo(uid), saldoAntes, 'não recebeu a resposta, não pagou');
    assert.equal(carteira.devolverReserva(ref), 0, 'a devolução é uma só');
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

  await t('carteira: o aviso "IA paga à parte" aparece na venda e no pagamento quando a cobrança é ligada — e só então', async () => {
    const slug = db.prepare('SELECT slug FROM products WHERE id = ?').get(impId).slug;
    const status = db.prepare('SELECT status FROM products WHERE id = ?').get(impId).status;
    db.prepare("UPDATE products SET status = 'publicado' WHERE id = ?").run(impId); // a página de venda só existe para curso publicado
    try {
      const paginas = async () => [(await req('GET', '/academy/cursos/' + slug)), (await req('GET', '/academy/checkout/' + slug))];
      assert.equal(carteira.cfg().ligada, true);
      for (const pg of await paginas()) {
        assert.equal(pg.st, 200, 'página de ' + slug);
        assert.ok(pg.texto.includes('pagos à parte, por uso') && pg.texto.includes('/academy/creditos-ia'), 'cobrança ligada: a página avisa e aponta os termos');
      }
      const atual = repo.Config.obter('ia_cobranca', {});
      await config({ ...atual, ativa: false });
      for (const pg of await paginas()) assert.ok(!pg.texto.includes('pagos à parte'), 'cobrança desligada: dizer "pago" seria falso');
      await config({ ...atual, ativa: true });
    } finally { db.prepare('UPDATE products SET status = ? WHERE id = ?').run(status, impId); }
    const termos = await req('GET', '/academy/creditos-ia');
    assert.equal(termos.st, 200);
    for (const trecho of ['MINUTA', 'Validade do saldo', 'art. 49', 'chargeback', 'valor máximo']) assert.ok(termos.texto.includes(trecho), 'os termos tratam de: ' + trecho);
    assert.ok(!/30\s*%/.test(termos.texto), 'a margem não é publicada');
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

  // RÉPLICA de 11/10/2026, R4-2: a tentativa que FALHOU não entra na conta do aluno — a plataforma absorve. O 1º
  // modelo corta a resposta do Tutor (e cobra), o de reserva responde: o aluno paga só o que respondeu; o log de
  // uso guarda o custo REAL (os dois), que é o que os tetos de falha e o relatório do dono leem.
  await t('réplica R4-2: tentativa de IA que falhou não entra na conta do aluno — ele paga só a que gerou a resposta; o log guarda o custo total', async () => {
    const nina = repo.Usuarios.porEmail(NINA.email).id;
    assert.equal((await config({ ativa: true, cambio_modo: 'fixo', cambio_brl_usd: 5, margem_pct: 30, isentos: [] })).st, 200);
    assert.equal((await creditar({ email: NINA.email, valor_centavos: 500, motivo: 'saldo para o teste da réplica' })).st, 200);
    const msg = (texto, usage, stop = 'end_turn') => ({ content: [{ type: 'text', text: texto }], stop_reason: stop, usage });
    const BOA = JSON.stringify({ resposta: 'Resposta do tutor.', fontes: [], nao_encontrado: false, sugestoes: [], aula_referencia: '' });
    const fila = [];
    let roteiro = {
      'claude-sonnet-5': msg('{"resposta":"cortou aq', { input_tokens: 1000, output_tokens: 1500 }, 'max_tokens'), // US$ 0,017 — perdida
      'claude-haiku-4-5': msg(BOA, { input_tokens: 1000, output_tokens: 500 }) };                                   // US$ 0,0035 — a que serviu
    ia.__mockParaTeste(async (x) => { fila.push(x.modelo); const r = roteiro[x.modelo]; if (r instanceof Error) throw r; return r; }, { modelos: ['claude-sonnet-5', 'claude-haiku-4-5'] });
    const ultimoLog = () => db.prepare('SELECT * FROM ai_usage_logs WHERE user_id = ? ORDER BY rowid DESC').get(nina);
    try {
      const saldo = carteira.saldo(nina);
      const tr = ia.abrirTrabalho(nina, 'tutor', 0.05, { id: impId }, { aceite: 999999 });
      assert.equal(tr.cobranca, 'paga', 'a Nina se matriculou depois da virada: paga');
      const json = await tr.passo('Pergunta da réplica');
      const f = tr.concluir();
      assert.deepEqual([fila, json.resposta], [['claude-sonnet-5', 'claude-haiku-4-5'], 'Resposta do tutor.'], 'o modelo de reserva respondeu');
      const soAQueServiu = carteira.precoEmMilesimos(0.0035), asDuas = carteira.precoEmMilesimos(0.017 + 0.0035);
      assert.ok(soAQueServiu < asDuas, 'o teste só prova algo se os dois valores forem diferentes');
      assert.equal(f.cobrado_milesimos, soAQueServiu, `o aluno paga ${soAQueServiu} milésimos (só a tentativa que respondeu), não ${asDuas}`);
      assert.equal(carteira.saldo(nina), saldo - soAQueServiu, 'e é isso que sai do saldo');
      assert.ok(Math.abs(f.custo_usd - 0.0205) < 1e-12 && Math.abs(f.absorvido_usd - 0.017) < 1e-12, 'o custo real do trabalho soma as duas: ' + JSON.stringify(f));
      const l = ultimoLog();
      assert.deepEqual([l.status, l.custo_centavos_usd, l.milesimos], ['ok', 2.05, soAQueServiu], 'o log de uso guarda o custo TOTAL (com a falha) e o que foi cobrado');
      // … e NUNCA acima do teto: a tentativa que serviu custou mais que o valor aceito → cobra o teto, e só
      roteiro = { 'claude-sonnet-5': msg('fora do formato', { input_tokens: 50000, output_tokens: 5000 }), 'claude-haiku-4-5': msg(BOA, { input_tokens: 1000, output_tokens: 500 }) };
      const t2 = ia.abrirTrabalho(nina, 'tutor', 0.002, { id: impId }, { aceite: 999999 });
      await t2.passo('Outra pergunta');
      const f2 = t2.concluir();
      assert.equal(f2.cobrado_milesimos, t2.teto_milesimos, 'cobrado = teto');
      // os dois falharam: o aluno não paga nada, e o custo das duas tentativas fica no log como falha (alimenta os tetos)
      roteiro = { 'claude-sonnet-5': msg('nada de JSON', { input_tokens: 2000, output_tokens: 1000 }), 'claude-haiku-4-5': msg('nem aqui', { input_tokens: 2000, output_tokens: 1000 }) };
      const antes = carteira.saldo(nina);
      const t3 = ia.abrirTrabalho(nina, 'tutor', 0.05, { id: impId }, { aceite: 999999 });
      const e3 = await t3.passo('Terceira').then(() => null, (e) => e);
      t3.falhar(e3);
      assert.deepEqual([carteira.saldo(nina), ultimoLog().status, ultimoLog().custo_centavos_usd], [antes, 'erro', 2.1], 'não gerou: volta tudo; a plataforma registra o que absorveu');
      // O QUE A PLATAFORMA ABSORVE TEM TETO POR CONTA, também quando o trabalho DÁ CERTO. Sem isso, quem força o 1º
      // modelo a cortar ou a sair do formato (e recebe a resposta do 2º) faria a plataforma pagar a tentativa perdida
      // sem limite — a falha nunca viraria `status = 'erro'`. A linha 'ok' guarda a parte absorvida, e o teto de
      // VALOR por conta (US$ 0,50 em 24 h) a soma.
      const absorvidas = () => db.prepare("SELECT absorvido_centavos_usd a FROM ai_usage_logs WHERE user_id = ? AND status = 'ok' AND absorvido_centavos_usd > 0 ORDER BY rowid").all(nina).map(x => x.a);
      assert.deepEqual(absorvidas().slice(0, 1), [1.7], 'a linha do trabalho que deu certo diz quanto a plataforma absorveu (US$ 0,017)');
      roteiro = { 'claude-sonnet-5': msg('fora do formato', { input_tokens: 50000, output_tokens: 5000 }), 'claude-haiku-4-5': msg(BOA, { input_tokens: 1000, output_tokens: 500 }) };
      let barrou = null, deramCerto = 0;
      for (let k = 0; k < 8 && !barrou; k++) {
        try { const tx = ia.abrirTrabalho(nina, 'tutor', 0.05, { id: impId }, { aceite: 999999 }); await tx.passo('Pergunta que faz o 1º modelo errar'); tx.concluir(); deramCerto++; }
        catch (e) { barrou = e; }
      }
      const falhasDaNina = db.prepare("SELECT COUNT(*) n FROM ai_usage_logs WHERE user_id = ? AND status = 'erro' AND quando > ?").get(nina, new Date(Date.now() - 864e5).toISOString()).n;
      assert.ok(barrou && barrou.status === 429 && /em pausa para a sua conta/.test(barrou.message), 'o valor absorvido em trabalhos que deram certo alcança o teto e pausa a conta: ' + (barrou && barrou.message));
      assert.ok(deramCerto >= 1 && deramCerto < 8 && falhasDaNina < 5, `quem barrou foi o VALOR absorvido, não a contagem de falhas (${deramCerto} trabalhos, ${falhasDaNina} falha(s))`);
    } finally {
      ia.__mockParaTeste(null);
      // a pausa de 24 h da Nina é deste teste: os seguintes usam a conta dela
      db.prepare("UPDATE ai_usage_logs SET absorvido_centavos_usd = 0 WHERE user_id = ? AND status = 'ok'").run(nina);
      db.prepare("DELETE FROM ai_usage_logs WHERE user_id = ? AND status = 'limite' AND detalhe LIKE 'teto de falhas%'").run(nina);
    }
  });

  // ================= auditoria C de 12/10/2026 — C-21 (teste que só conferia o TIPO), C-07, C-10 e C-11 =================
  await t('auditoria C (custos de IA): Logs.custos e Logs.pessoas com LINHAS PLANTADAS — a divisão por quem pagou (paga, isento, franquia, sem marca, falha total, falha parcial absorvida) e os totais batem; o que não chegou ao provedor não é chamada; o pedido interrompido fica à parte; o dia é o de Brasília; e nada disso varre a tabela na memória', async () => {
    const PIA = { nome: 'Pia Pagante', email: 'pia.audc@t.com', senha: 'senha-forte-7', aceite_termos: true };
    const ISA = { nome: 'Isa Isenta', email: 'isa.audc@t.com', senha: 'senha-forte-7', aceite_termos: true };
    const FRAN = { nome: 'Fran Franquia', email: 'fran.audc@t.com', senha: 'senha-forte-7', aceite_termos: true };
    for (const [k, u] of [PIA, ISA, FRAN].entries()) assert.equal((await req('POST', '/academy/api/signup', { corpo: u, jar: 'audc' + k, ip: '10.0.9.' + (31 + k) })).st, 200);
    const id = (u) => repo.Usuarios.porEmail(u.email).id;
    const pia = id(PIA), isa = id(ISA), fran = id(FRAN);
    const cfgAntes = repo.Config.obter('ia_cobranca', null);
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    const agora = new Date().toISOString();
    const velho = new Date(Date.now() - 40 * 864e5).toISOString();
    // 01:30 em UTC de um dia que já passou: em Brasília ainda era o dia ANTERIOR (22:30)
    const diaUTC = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const naBorda = `${diaUTC}T01:30:00.000Z`, diaDeBrasilia = new Date(Date.parse(naBorda) - 3 * 3600e3).toISOString().slice(0, 10);
    assert.notEqual(diaDeBrasilia, diaUTC);
    const ins = db.prepare(`INSERT INTO ai_usage_logs (id, quando, user_id, agente, modelo, input_tokens, output_tokens, custo_centavos_usd, status, detalhe, cobranca, milesimos, product_id, absorvido_centavos_usd)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, '', ?)`);
    let n = 0;
    const linha = (user, agente, custo, status, cobranca, mil = 0, abs = 0, { quando = agora, modelo = 'audc-modelo', detalhe = '' } = {}) => ins.run('audc-' + (++n), quando, user, agente, modelo, custo, status, detalhe, cobranca, mil, abs);
    const antes = ia.Logs.custos(7).total;
    try {
      repo.Config.salvar('ia_cobranca', { ...(cfgAntes || {}), isentos: [ISA.email.toUpperCase(), 'fantasma.audc@t.com'] });
      // custo em CENTAVOS de dólar; milésimos de real cobrados do aluno
      linha(pia, 'audc-correcao', 210, 'ok', 'paga', 69, 105);        // paga, com falha PARCIAL absorvida (a segunda leitura): 105 úteis + 105 da plataforma
      linha(pia, 'audc-correcao', 105, 'ok', 'paga', 69, 0);          // paga, inteira do aluno
      linha(pia, 'audc-prova', 400, 'erro', 'paga', 0, 0);            // falha TOTAL: tudo da plataforma
      linha(pia, 'audc-correcao', 0, 'sem_saldo', 'paga');            // nunca chegou ao provedor
      linha(pia, 'audc-edital', 170, 'erro', 'paga', 0, 0, { modelo: 'estimado', detalhe: 'interrompido — custo estimado pelo teto aceito' }); // estimativa: fora do total
      linha(pia, 'audc-correcao', 1000, 'ok', 'paga', 600, 0, { quando: velho }); // fora do período: só no "desde sempre"
      linha(isa, 'audc-tutor', 300, 'ok', 'isento', 0, 100);          // isenta, com tentativa perdida: 200 úteis + 100 de falha — tudo da plataforma
      linha(fran, 'audc-tutor', 50, 'ok', 'franquia');                // consulta grátis do dia
      linha(fran, 'audc-tutor', 0, 'em_curso', 'franquia');           // vaga aberta: não é chamada
      linha(fran, 'audc-tutor', 0, 'limite', '');                     // bloqueio pelo limite: não é chamada
      linha(fran, 'audc-tutor', 40, 'ok', '');                        // sem marca de cobrança (cobrança desligada)
      linha(fran, 'audc-borda', 0, 'ok', 'franquia', 0, 0, { quando: naBorda });

      const c = ia.Logs.custos(7), tot = c.total;
      const delta = (k) => r4(tot[k] - antes[k]);
      assert.deepEqual({ chamadas: tot.chamadas - antes.chamadas, custo_usd: delta('custo_usd'), cobrado_dos_alunos_brl: delta('cobrado_dos_alunos_brl'), custo_coberto_por_aluno_usd: delta('custo_coberto_por_aluno_usd'),
        custo_isentos_usd: delta('custo_isentos_usd'), custo_franquia_usd: delta('custo_franquia_usd'), custo_falhas_usd: delta('custo_falhas_usd'), custo_sem_marca_usd: delta('custo_sem_marca_usd'),
        bancado_pela_plataforma_usd: delta('bancado_pela_plataforma_usd'), interrompidos: tot.interrompidos - antes.interrompidos, custo_estimado_interrompidos_usd: delta('custo_estimado_interrompidos_usd') },
      { chamadas: 7, custo_usd: 11.05, cobrado_dos_alunos_brl: 0.138, custo_coberto_por_aluno_usd: 2.1,
        custo_isentos_usd: 2, custo_franquia_usd: 0.5, custo_falhas_usd: 6.05, custo_sem_marca_usd: 0.4,
        bancado_pela_plataforma_usd: 8.95, interrompidos: 1, custo_estimado_interrompidos_usd: 1.7 },
      'sete chamadas chegaram ao provedor (sem_saldo, em_curso e limite não); a estimativa do interrompido (US$ 1,70) não entra em custo, falhas nem bancado');
      assert.equal(r4(delta('custo_coberto_por_aluno_usd') + delta('bancado_pela_plataforma_usd')), delta('custo_usd'), 'pago pelo aluno + bancado pela plataforma = custo total');
      assert.equal(r4(delta('custo_isentos_usd') + delta('custo_franquia_usd') + delta('custo_falhas_usd') + delta('custo_sem_marca_usd')), delta('bancado_pela_plataforma_usd'), 'o bancado é a soma das quatro parcelas');
      const ag = (a) => c.por_agente.find(x => x.agente === a);
      assert.deepEqual([ag('audc-correcao'), ag('audc-prova'), ag('audc-tutor'), ag('audc-borda'), ag('audc-edital')],
        [{ agente: 'audc-correcao', chamadas: 2, custo_usd: 3.15, cobrado_brl: 0.138 }, { agente: 'audc-prova', chamadas: 1, custo_usd: 4, cobrado_brl: 0 }, { agente: 'audc-tutor', chamadas: 3, custo_usd: 3.9, cobrado_brl: 0 },
          { agente: 'audc-borda', chamadas: 1, custo_usd: 0, cobrado_brl: 0 }, undefined], 'por função: só o que chegou ao provedor, sem a linha estimada');
      assert.deepEqual(c.por_modelo.find(x => x.modelo === 'audc-modelo'), { modelo: 'audc-modelo', chamadas: 7, custo_usd: 11.05, cobrado_brl: 0.138 });
      assert.ok(!c.por_modelo.some(x => x.modelo === 'estimado'), 'o "modelo" da linha estimada não aparece como modelo de provedor');
      const conta = (u) => c.contas_bancadas.find(x => x.email === u.email);
      assert.deepEqual([conta(PIA), conta(ISA), conta(FRAN)], [{ email: PIA.email, chamadas: 2, custo_usd: 5.05, tipo: 'falha + tentativa absorvida' }, { email: ISA.email, chamadas: 1, custo_usd: 3, tipo: 'isento' }, { email: FRAN.email, chamadas: 2, custo_usd: 0.9, tipo: 'franquia + sem marca' }],
        'quem a plataforma bancou: a linha paga inteira do aluno não entra; a paga com parte absorvida entra como "tentativa absorvida", não como "paga"');
      assert.ok(c.contas_bancadas.every((x, k, v) => !k || v[k - 1].custo_usd >= x.custo_usd) && c.contas_bancadas.length <= 30, 'maior primeiro, no máximo 30');
      assert.ok(c.por_dia.some(x => x.dia === diaDeBrasilia) && c.por_dia.every((x, k, v) => !k || v[k - 1].dia < x.dia), 'por dia, em ordem');
      const somaDias = c.por_dia.reduce((s, x) => s + x.chamadas, 0);
      assert.equal(somaDias, tot.chamadas, 'a soma dos dias é o total');
      db.prepare("DELETE FROM ai_usage_logs WHERE id LIKE 'audc-%' AND agente = 'audc-borda'").run();
      const semBorda = ia.Logs.custos(7).por_dia.find(x => x.dia === diaDeBrasilia), comBorda = c.por_dia.find(x => x.dia === diaDeBrasilia);
      assert.equal(comBorda.chamadas - (semBorda ? semBorda.chamadas : 0), 1, 'a chamada de 01:30 UTC conta no dia ANTERIOR, que é o de Brasília');

      // ---- Logs.pessoas: as MESMAS linhas, por conta ----
      const p = ia.Logs.pessoas(7);
      const de = (lista, u) => lista.find(x => x.email === u.email);
      const hoje = agora.slice(0, 10);
      assert.deepEqual(de(p.maiores_do_periodo, PIA), { nome: PIA.nome, email: PIA.email, isento: false, cortesia_vitalicia: false, cursos_de_cortesia: 0, credito_cortesia_brl: 0, recargas_brl: 0, saldo_brl: 0,
        chamadas: 3, custo_usd: 7.15, pago_pelo_usuario_usd: 2.1, bancado_usd: 5.05, cobrado_brl: 0.138, chamadas_total: 4, custo_total_usd: 17.15, bancado_total_usd: 5.05, funcoes: 'audc-correcao, audc-prova', ultimo_uso: hoje },
      'a pagante: no período, 3 chamadas (sem a que ficou sem saldo e sem a estimada); desde sempre, 4 — e a linha antiga, paga inteira, não aumenta o bancado');
      assert.deepEqual([de(p.isentos, ISA).isento, de(p.isentos, ISA).chamadas, de(p.isentos, ISA).custo_usd, de(p.isentos, ISA).pago_pelo_usuario_usd, de(p.isentos, ISA).bancado_usd, de(p.isentos, ISA).bancado_total_usd, p.isentos.length, p.isentos_sem_conta],
        [true, 1, 3, 0, 3, 3, 1, ['fantasma.audc@t.com']], 'a isenta entra na lista pelo e-mail (sem diferença de caixa), com TODO o custo bancado; isento sem conta aparece à parte');
      assert.deepEqual([de(p.maiores_do_periodo, FRAN).chamadas, de(p.maiores_do_periodo, FRAN).custo_usd, de(p.maiores_do_periodo, FRAN).bancado_usd, de(p.maiores_do_periodo, FRAN).funcoes], [2, 0.9, 0.9, 'audc-tutor'], 'franquia e sem marca: tudo da plataforma; vaga aberta e bloqueio não contam');
      const ordem = [PIA, ISA, FRAN].map(u => p.maiores_do_periodo.findIndex(x => x.email === u.email));
      assert.ok(ordem[0] >= 0 && ordem[0] < ordem[1] && ordem[1] < ordem[2], 'maiores do período: por custo, maior primeiro');
      assert.ok(de(p.maiores_desde_sempre, PIA) && p.maiores_desde_sempre.every((x, k, v) => !k || v[k - 1].custo_total_usd >= x.custo_total_usd));
      assert.ok(p.credito_de_cortesia.every(x => x.credito_cortesia_brl > 0) && !de(p.credito_de_cortesia, PIA), 'quem não recebeu crédito de cortesia não aparece na lista de crédito');
      assert.ok(!JSON.stringify(c).includes(PIA.nome), 'Logs.custos não leva nome de ninguém (o e-mail das contas bancadas, só para chave ou admin)');

      // ---- C-07: índice por data, e as consultas não trazem a tabela para a memória ----
      assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_ai_quando'").get(), 'o índice de `quando` existe (migração)');
      assert.ok(/idx_ai_quando/.test(db.prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM ai_usage_logs WHERE quando >= ? AND status IN ('ok', 'erro')").all(agora).map(x => x.detail).join(' ')), 'o filtro por data usa o índice');
      // o teto GLOBAL de valor absorvido roda a cada pedido pago: tem de entrar pelo índice de data (e não percorrer o de usuário inteiro)
      const planoDoTeto = db.prepare(`EXPLAIN QUERY PLAN SELECT user_id, COALESCE(SUM(custo_centavos_usd), 0) c FROM ai_usage_logs WHERE status = 'erro' AND quando > ? AND agente IN ('correcao') GROUP BY +user_id`).all(agora).map(x => x.detail).join(' ');
      assert.ok(/idx_ai_quando/.test(planoDoTeto) && !/idx_ai_user/.test(planoDoTeto), planoDoTeto);
      const fonte = require('fs').readFileSync(require('path').join(__dirname, 'ia.js'), 'utf8');
      assert.ok(/GROUP BY \+user_id`\)\.all\(desde, \.\.\.agentes\)/.test(fonte), 'custoDeFalhasGlobalUSD agrupa com `+user_id`');
      assert.ok(Math.abs(ia.custoDeFalhasGlobalUSD({ desde: new Date(Date.now() - 864e5).toISOString(), agentes: ['audc-prova'] }) - 4) < 1e-9 && Math.abs(ia.custoDeFalhasGlobalUSD({ desde: new Date(Date.now() - 864e5).toISOString(), agentes: ['audc-prova', 'audc-correcao', 'audc-tutor'], tetoPorConta: 1.5 }) - (1.5 + 1)) < 1e-9,
        'e soma igual: US$ 4 da falha da Pia; com teto de US$ 1,50 por conta, 1,50 (Pia: 4 + 1,05) + 1 (Isa)');
      const corpo = fonte.slice(fonte.indexOf('  custos(dias) {'), fonte.indexOf('module.exports = {'));
      assert.ok(corpo.length > 2000 && !/FROM ai_usage_logs[^`]*`\)\.all\(\)\) \{\s*const c = Number/.test(corpo) && !/SELECT[^`]*FROM ai_usage_logs l LEFT JOIN users/.test(corpo) && (corpo.match(/GROUP BY/g) || []).length >= 5,
        'custos e pessoas somam no SQL (GROUP BY), não em laço sobre a tabela inteira');
    } finally {
      db.prepare("DELETE FROM ai_usage_logs WHERE id LIKE 'audc-%'").run();
      if (cfgAntes == null) db.prepare("DELETE FROM platform_settings WHERE chave = 'ia_cobranca'").run(); else repo.Config.salvar('ia_cobranca', cfgAntes);
    }
  });

  // desliga a cobrança ao fim (a virada, uma vez marcada, fica)
  await config({ ativa: false });
  ia.__mockParaTeste(null);
  void jars;
}

module.exports = { rodar };
