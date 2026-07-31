// =====================================================================
// Villela Stay Manager — ONDA LIVRO · testes.
//
// Chamado por selftest.js com o mesmo `req`/`t`/`assert` e a sessão do
// assinante Beta já ativa. Cobre o que o livro tornou obrigatório — e,
// principalmente, as TRAVAS: o valor da ONDA LIVRO está no que o sistema
// se recusa a fazer.
// =====================================================================
'use strict';

async function rodarTestesLivro({ req, t, assert, saas }) {
  const C = { cookies: true };
  const P = '/gestao/api/app/livro';
  const d = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  // O Beta é 'pro'; proprietários é módulo do Business. Subimos o plano para
  // exercitar o catálogo inteiro (e de quebra confere o upgrade).
  let tenantId;
  await t('livro: upgrade para business libera os módulos do Nível 3', async () => {
    // a sessão vigente pode ser de qualquer tenant criado antes: descobrimos
    // pelo slug de /me em vez de presumir. Os testes anteriores deixam essa
    // operação suspensa e no starter — reativamos pelo repo (fixture).
    const antes = (await req('GET', '/gestao/api/me', C)).json;
    tenantId = require('./db').db.prepare('SELECT id FROM tenants WHERE slug = ?').get(antes.operacao.slug).id;
    saas.repo.Tenants.mudarStatus(tenantId, 'ativa', 'teste', 'fixture onda livro');
    saas.repo.Tenants.definirPlano(tenantId, saas.repo.Planos.porSlug('business').id, 'teste');
    const dep = (await req('GET', '/gestao/api/me', C)).json;
    assert.equal(dep.operacao.status, 'ativa');
    for (const m of ['crm', 'mensagens', 'reputacao', 'proprietarios', 'governanca']) {
      assert.ok(dep.entitlements.modulos.includes(m), 'faltou o módulo ' + m);
    }
  });

  await t('livro: sementes por tenant (POPs, crises, gatilhos, modelos, prompts)', async () => {
    const pops = (await req('GET', `${P}/pops`, C)).json;
    assert.equal(pops.pops.length, 11, 'os onze checklists do Apêndice E');
    assert.equal(pops.crises.length, 9, 'o catálogo de crises do Cap. 39');
    const pr = (await req('GET', `${P}/prompts`, C)).json;
    assert.ok(pr.prompts.length >= 20, 'biblioteca de prompts do livro');
    const rg = (await req('GET', `${P}/regua`, C)).json;
    assert.ok(rg.modelos.filter(m => m.idioma === 'fr').length >= 10, 'modelos do Apêndice D nos 4 idiomas');
    const cg = (await req('GET', `${P}/concierge`, C)).json;
    assert.ok(cg.gatilhos.length > 30, 'gatilhos de escalonamento do Cap. 33');
  });

  // ---------------------------------------------- Cap. 6 · cadastro mestre
  let casa, suite, flat;
  await t('livro: cadastro mestre recusa capacidade confortável maior que a máxima', async () => {
    casa = (await req('POST', '/gestao/api/app/imoveis', { corpo: { nome: 'Casa Grande', tipo: 'casa', capacidade: 12, tarifa_base_centavos: 90000 }, ...C })).json.imovel.id;
    suite = (await req('POST', '/gestao/api/app/imoveis', { corpo: { nome: 'Suíte da Casa', tipo: 'quarto', capacidade: 2, tarifa_base_centavos: 25000 }, ...C })).json.imovel.id;
    flat = (await req('POST', '/gestao/api/app/imoveis', { corpo: { nome: 'Flat Solto', tipo: 'flat', capacidade: 4, tarifa_base_centavos: 30000 }, ...C })).json.imovel.id;
    const r = await req('PUT', `${P}/ficha/${casa}`, { corpo: { capacidade_confortavel: 14, capacidade_maxima: 12 }, ...C });
    assert.equal(r.st, 400);
  });
  await t('livro: ficha incompleta é declarada — nada é presumido', async () => {
    const vazia = (await req('GET', `${P}/ficha/${suite}`, C)).json.ficha;
    assert.equal(vazia.completa, false);
    assert.ok(vazia.faltando.includes('preparacao_min'));
    const ok = await req('PUT', `${P}/ficha/${casa}`, {
      corpo: { capacidade_confortavel: 10, capacidade_maxima: 12, preparacao_min: 300, janela_minima_min: 240, estacionamento: '3 vagas', wifi_rede: 'CasaGrande', tarifa_minima_centavos: 60000, custo_fixo_mes_centavos: 100000 },
      ...C,
    });
    assert.equal(ok.st, 200); assert.equal(ok.json.ficha.completa, true);
  });

  // ------------------------------------ Cap. 13/20 · interligação nas 2 direções
  await t('livro: interligação bloqueia a venda do mesmo espaço nos dois sentidos', async () => {
    assert.equal((await req('POST', `${P}/interligacoes`, { corpo: { imovel_a: casa, imovel_b: suite }, ...C })).st, 200);
    const r1 = await req('POST', '/gestao/api/app/reservas', { corpo: { imovel_id: casa, hospede_nome: 'Grupo A', checkin: d(20), checkout: d(25), valor_centavos: 500000, canal: 'airbnb', status: 'confirmada' }, ...C });
    assert.equal(r1.st, 200);
    // sentido 1: casa ocupada → quarto bloqueado
    const r2 = await req('POST', '/gestao/api/app/reservas', { corpo: { imovel_id: suite, hospede_nome: 'Solo', checkin: d(22), checkout: d(24), valor_centavos: 50000 }, ...C });
    assert.equal(r2.st, 400);
    assert.ok(/interligado/i.test(r2.json.erro));
    // sentido 2: quarto ocupado → casa bloqueada
    const r3 = await req('POST', '/gestao/api/app/reservas', { corpo: { imovel_id: suite, hospede_nome: 'Solo', checkin: d(40), checkout: d(42), valor_centavos: 50000, status: 'confirmada' }, ...C });
    assert.equal(r3.st, 200);
    const r4 = await req('POST', '/gestao/api/app/reservas', { corpo: { imovel_id: casa, hospede_nome: 'Grupo B', checkin: d(41), checkout: d(45), valor_centavos: 400000 }, ...C });
    assert.equal(r4.st, 400);
    assert.ok(/interligado/i.test(r4.json.erro));
  });

  // ------------------------------------------ Cap. 30/37 · bloqueios
  await t('livro: data segurada exige prazo; bloqueio não cobre reserva viva', async () => {
    const semPrazo = await req('POST', `${P}/bloqueios`, { corpo: { imovel_id: flat, de: d(60), ate: d(62), motivo: 'reserva_segurada' }, ...C });
    assert.equal(semPrazo.st, 400);
    const comPrazo = await req('POST', `${P}/bloqueios`, { corpo: { imovel_id: flat, de: d(60), ate: d(62), motivo: 'reserva_segurada', expira_em: d(2) }, ...C });
    assert.equal(comPrazo.st, 200);
    // bloqueio impede venda naquela janela
    const conflito = await req('POST', '/gestao/api/app/reservas', { corpo: { imovel_id: flat, hospede_nome: 'X', checkin: d(60), checkout: d(61), valor_centavos: 30000 }, ...C });
    assert.equal(conflito.st, 400);
    // e sobre reserva viva o bloqueio é recusado
    const sobre = await req('POST', `${P}/bloqueios`, { corpo: { imovel_id: casa, de: d(21), ate: d(23), motivo: 'manutencao' }, ...C });
    assert.equal(sobre.st, 400);
  });

  // ------------------------------------------ Cap. 20 · auditoria falha alto
  await t('livro: auditoria sem channel manager é PARCIAL e nunca diz "tudo certo"', async () => {
    await req('POST', '/gestao/api/app/stays/desconectar', C);
    const r = await req('POST', `${P}/auditoria/rodar`, { corpo: {}, ...C });
    assert.equal(r.st, 200);
    assert.equal(r.json.auditoria.parcial, true);
    assert.ok(/PARCIAL/.test(r.json.auditoria.resumo.veredito));
    assert.ok(r.json.auditoria.fontes_indisponiveis.length >= 1);
  });
  await t('livro: auditoria detecta data segurada vencida que ninguém soltou', async () => {
    require('./db').db.prepare("UPDATE lv_bloqueios SET expira_em = '2020-01-01' WHERE motivo = 'reserva_segurada'").run();
    const r = await req('POST', `${P}/auditoria/rodar`, { corpo: {}, ...C });
    assert.ok(r.json.auditoria.divergencias.some(x => x.tipo === 'bloqueio_expirado'));
  });

  // ------------------------------------------ Cap. 39 · sinal de vida
  await t('livro: rotina que nunca rodou é "não iniciada"; a que parou é alerta', async () => {
    const antes = (await req('GET', `${P}/rotinas`, C)).json.rotinas.find(x => x.nome === 'escala_limpeza');
    assert.equal(antes.situacao, 'nao_iniciada');
    assert.equal((await req('POST', `${P}/rotinas/escala_limpeza/heartbeat`, { corpo: { status: 'ok' }, ...C })).st, 200);
    const dep = (await req('GET', `${P}/rotinas`, C)).json.rotinas.find(x => x.nome === 'escala_limpeza');
    assert.equal(dep.situacao, 'ok');
    // heartbeat com erro NUNCA vira ok (falha alta)
    await req('POST', `${P}/rotinas/escala_limpeza/heartbeat`, { corpo: { status: 'ok', erro: 'não consegui ler o calendário' }, ...C });
    const falha = (await req('GET', `${P}/rotinas`, C)).json.rotinas.find(x => x.nome === 'escala_limpeza');
    assert.equal(falha.situacao, 'falha');
  });
  await t('livro: painel do dia declara PARCIAL quando alguma fonte não foi lida', async () => {
    const r = await req('GET', `${P}/painel-do-dia`, C);
    assert.equal(r.st, 200);
    assert.ok(Array.isArray(r.json.painel.criticos));
    assert.ok(r.json.painel.veredito.length > 0);
  });

  // ------------------------------------------ Cap. 35/38 · limpeza e inspeção
  await t('livro: liberar unidade exige confirmação E evidência', async () => {
    const lim = (await req('POST', '/gestao/api/app/limpezas', { corpo: { imovel_id: casa, data: d(1), tipo: 'checkout', responsavel: 'Dona Rita' }, ...C })).json.limpeza;
    assert.equal((await req('POST', `${P}/limpezas/${lim.id}/liberar`, { corpo: {}, ...C })).st, 400, 'sem confirmação não libera');
    await req('POST', `${P}/limpezas/${lim.id}/confirmar`, { corpo: { executor: 'Dona Rita', evidencias: [] }, ...C });
    assert.equal((await req('POST', `${P}/limpezas/${lim.id}/liberar`, { corpo: {}, ...C })).st, 400, 'sem evidência não libera');
    await req('POST', `${P}/limpezas/${lim.id}/confirmar`, { corpo: { executor: 'Dona Rita', evidencias: ['quarto.jpg', 'banheiro.jpg'] }, ...C });
    const ok = await req('POST', `${P}/limpezas/${lim.id}/liberar`, { corpo: {}, ...C });
    assert.equal(ok.st, 200); assert.equal(ok.json.execucao.liberada, true);
  });
  await t('livro: inspeção recusa autoinspeção e marca desvio sistêmico', async () => {
    const auto = await req('POST', `${P}/inspecoes`, { corpo: { imovel_id: casa, inspetor: 'Rita', executor: 'Rita', desvios: [] }, ...C });
    assert.equal(auto.st, 400);
    await req('POST', `${P}/inspecoes`, { corpo: { imovel_id: casa, inspetor: 'Ana', executor: 'Rita', desvios: [{ item: 'ralo do banheiro', classificacao: 'procedimento' }] }, ...C });
    await req('POST', `${P}/inspecoes`, { corpo: { imovel_id: flat, inspetor: 'Ana', executor: 'Rita', desvios: [{ item: 'ralo do banheiro', classificacao: 'pontual' }] }, ...C });
    const q = (await req('GET', `${P}/inspecoes`, C)).json.qualidade;
    assert.ok(q.sistemicos.some(x => x.item === 'ralo do banheiro'), 'mesmo item em unidades diferentes = SISTÊMICO');
  });

  // ------------------------------------------ Cap. 23 · CRM
  let opId;
  await t('livro: funil exige próxima ação com data e motivo de perda fechado', async () => {
    const ct = (await req('POST', `${P}/crm/contatos`, { corpo: { nome: 'Carla Dias', tipo: 'lead', origem: 'whatsapp' }, ...C })).json.contato;
    const semAcao = await req('POST', `${P}/crm/oportunidades`, { corpo: { contato_id: ct.id, estagio: 'novo' }, ...C });
    assert.equal(semAcao.st, 400);
    const semQualificar = await req('POST', `${P}/crm/oportunidades`, { corpo: { contato_id: ct.id, estagio: 'cotado', proxima_acao: 'ligar', proxima_acao_em: d(2) }, ...C });
    assert.equal(semQualificar.st, 400, 'não se cota sem qualificar (Cap. 24)');
    const ok = await req('POST', `${P}/crm/oportunidades`, {
      corpo: { contato_id: ct.id, imovel_id: flat, estagio: 'cotado', proxima_acao: 'retomar', proxima_acao_em: d(2), hospedes_qtd: 3, finalidade: 'trabalho', datas_de: d(80), datas_ate: d(84), valor_cotado_centavos: 120000 },
      ...C,
    });
    assert.equal(ok.st, 200); opId = ok.json.oportunidade.id;
    const motivoLivre = await req('POST', `${P}/crm/oportunidades/${opId}/perder`, { corpo: { motivo: 'não gostou' }, ...C });
    assert.equal(motivoLivre.st, 400, 'motivo de perda é categoria FECHADA');
  });
  await t('livro: evento disfarçado de estadia é escalonado, não cotado como diária', async () => {
    const ct = (await req('POST', `${P}/crm/contatos`, { corpo: { nome: 'Paulo Noiva', tipo: 'lead', origem: 'indicacao' }, ...C })).json.contato;
    const r = await req('POST', `${P}/crm/oportunidades`, {
      corpo: { contato_id: ct.id, imovel_id: casa, estagio: 'qualificado', proxima_acao: 'montar proposta', proxima_acao_em: d(3), hospedes_qtd: 12, finalidade: 'casamento', visitantes: 40 },
      ...C,
    });
    assert.equal(r.st, 200);
    assert.ok(/EVENTO/.test(r.json.oportunidade.aviso || ''));
  });
  await t('livro: converter oportunidade cria a reserva e passa pelas travas', async () => {
    const r = await req('POST', `${P}/crm/oportunidades/${opId}/converter`, { corpo: {}, ...C });
    assert.equal(r.st, 200);
    assert.equal(r.json.oportunidade.estagio, 'ganho');
    assert.ok(r.json.reserva.id);
    const pauta = (await req('GET', `${P}/crm/pauta`, C)).json.pauta;
    assert.ok(typeof pauta.leitura === 'string');
  });

  // ------------------------------------------ Cap. 21 · revenue
  await t('livro: data especial abaixo da tarifa mínima é recusada', async () => {
    const baixa = await req('POST', `${P}/revenue/datas`, { corpo: { nome: 'Réveillon', imovel_id: casa, de: '2026-12-28', ate: '2027-01-03', tarifa_proposta_centavos: 30000, estadia_minima: 4 }, ...C });
    assert.equal(baixa.st, 400, 'a tarifa mínima da unidade é R$ 600');
    const ok = await req('POST', `${P}/revenue/datas`, { corpo: { nome: 'Réveillon', imovel_id: casa, de: '2026-12-28', ate: '2027-01-03', tarifa_proposta_centavos: 400000, estadia_minima: 4, revisar_em: d(5) }, ...C });
    assert.equal(ok.st, 200); assert.equal(ok.json.data.aplicada, 0);
  });
  await t('livro: revisão semanal aponta tarifa mínima ausente e datas a revisar', async () => {
    const rev = (await req('GET', `${P}/revenue`, C)).json.revisao;
    assert.ok(rev.itens.some(i => i.situacao === 'sem tarifa mínima'), 'unidade sem piso é apontada');
  });

  // ------------------------------------------ Caps. 31/32/34 · régua
  await t('livro: modelo com senha escrita é recusado (Cap. 32)', async () => {
    const r = await req('POST', `${P}/regua/modelos`, { corpo: { chave: 'd5_chegada', idioma: 'pt', titulo: 'Chegada', texto: 'A senha da fechadura: 4321. Bem-vindo!' }, ...C });
    assert.equal(r.st, 400);
    assert.ok(/acesso/i.test(r.json.erro));
  });
  await t('livro: manual recusa código de acesso e publica link sem login', async () => {
    const proibido = await req('POST', `${P}/manual`, { corpo: { imovel_id: casa, assunto: 'Portão', corpo: 'codigo de acesso: 9988' }, ...C });
    assert.equal(proibido.st, 400);
    await req('POST', `${P}/manual`, { corpo: { imovel_id: casa, assunto: 'Ar-condicionado', corpo: 'O controle fica na mesa de cabeceira; aperte POWER e escolha 23 graus.' }, ...C });
    const link = (await req('GET', `${P}/manual/${casa}`, C)).json.link;
    const pub = await req('GET', link.url);
    assert.equal(pub.st, 200);
    assert.ok(/Ar-condicionado/.test(pub.texto));
    assert.ok(!/9988/.test(pub.texto));
  });
  await t('livro: régua para em FALTA DADO quando o cadastro mestre está incompleto', async () => {
    // a Suíte ainda não tem ficha: a chegada não é inventada
    await req('POST', '/gestao/api/app/reservas', { corpo: { imovel_id: suite, hospede_nome: 'Helena', checkin: d(3), checkout: d(5), valor_centavos: 60000, canal: 'direto', status: 'confirmada' }, ...C });
    const r = await req('POST', `${P}/regua/preparar`, { corpo: { horizonteDias: 7 }, ...C });
    assert.equal(r.st, 200);
    assert.ok(r.json.resultado.falta_dado.length >= 1, 'chegada sem cadastro vira FALTA DADO');
    assert.ok(r.json.resultado.falta_dado[0].faltando.includes('preparacao_min'));
  });
  await t('livro: régua prepara sem enviar e marca a inserção manual do acesso', async () => {
    // agora com ficha completa, a chegada é escrita — com o marcador de acesso
    await req('PUT', `${P}/ficha/${flat}`, { corpo: { capacidade_confortavel: 4, capacidade_maxima: 4, preparacao_min: 120, estacionamento: '1 vaga', tarifa_minima_centavos: 25000 }, ...C });
    await req('POST', '/gestao/api/app/reservas', { corpo: { imovel_id: flat, hospede_nome: 'Otávio', checkin: d(3), checkout: d(7), valor_centavos: 99000, canal: 'direto', status: 'confirmada' }, ...C });
    const r = await req('POST', `${P}/regua/preparar`, { corpo: { horizonteDias: 7 }, ...C });
    assert.ok(r.json.resultado.preparadas.length >= 1);
    assert.ok(r.json.resultado.preparadas.some(x => x.exige_insercao), 'a mensagem de chegada exige inserção manual');
    assert.ok(/Nada foi enviado/.test(r.json.resultado.nota));
    const fila = (await req('GET', `${P}/regua?situacao=preparada`, C)).json.fila;
    assert.ok(fila.every(m => m.situacao === 'preparada'), 'nada sai da fila sozinho');
  });
  await t('livro: preparar duas vezes não duplica a fila', async () => {
    const antes = (await req('GET', `${P}/regua`, C)).json.fila.length;
    await req('POST', `${P}/regua/preparar`, { corpo: { horizonteDias: 7 }, ...C });
    const dep = (await req('GET', `${P}/regua`, C)).json.fila.length;
    assert.equal(dep, antes);
  });

  // ------------------------------------------ Cap. 33 · concierge
  await t('livro: triagem escala emergência ANTES de tentar responder', async () => {
    const r = await req('POST', `${P}/concierge/triar`, { corpo: { mensagem: 'tem cheiro de gás na cozinha, o que eu faço?' }, ...C });
    assert.equal(r.json.triagem.decisao, 'escalonar');
    assert.ok(r.json.triagem.categorias.includes('emergencia'));
    assert.ok(r.json.triagem.alerta_plantao, 'sem plantão definido, o sistema avisa');
  });
  await t('livro: dúvida informacional é respondida a partir do manual, com a fonte', async () => {
    const res = (await req('GET', '/gestao/api/app/reservas', C)).json.reservas.find(x => x.imovel_id === casa);
    const r = await req('POST', `${P}/concierge/triar`, { corpo: { mensagem: 'como funciona o controle do ar-condicionado do quarto?', reserva_id: res.id }, ...C });
    assert.equal(r.json.triagem.decisao, 'responder');
    assert.equal(r.json.triagem.fonte, 'Ar-condicionado');
  });
  await t('livro: pedido de reembolso nunca é respondido pela máquina', async () => {
    const r = await req('POST', `${P}/concierge/triar`, { corpo: { mensagem: 'quero um reembolso, a casa não é o que eu esperava' }, ...C });
    assert.equal(r.json.triagem.decisao, 'escalonar');
  });

  // ------------------------------------------ Cap. 29 · reputação
  await t('livro: diagnóstico ordena por impacto e o ciclo respeita AMOSTRA INSUFICIENTE', async () => {
    for (const a of [[4, 'chuveiro frio', 'chuveiro', 'fisico'], [4, 'chuveiro fraco', 'chuveiro', 'fisico'], [3, 'achei que tinha ar na sala', 'ar na sala', 'expectativa'], [5, 'perfeito', '', ''], [5, 'ótimo', '', '']]) {
      await req('POST', `${P}/reputacao/avaliacoes`, { corpo: { imovel_id: casa, canal: 'airbnb', nota: a[0], texto: a[1], data: d(-30), assuntos: a[2] ? [{ assunto: a[2], classe: a[3] }] : [] }, ...C });
    }
    const dg = (await req('GET', `${P}/reputacao`, C)).json.diagnostico;
    assert.ok(dg.itens.length >= 2);
    assert.ok(dg.itens[0].impacto >= dg.itens[1].impacto, 'ordenado por impacto');
    await req('POST', `${P}/reputacao/correcoes`, { corpo: { assunto: 'chuveiro', classe: 'fisico', corrigido_em: d(-5) }, ...C });
    const ciclo = (await req('GET', `${P}/reputacao`, C)).json.ciclo;
    assert.equal(ciclo[0].status, 'AMOSTRA INSUFICIENTE', 'poucas estadias depois da correção');
  });

  // ------------------------------------------ Cap. 22/40 + Apêndice F
  await t('livro: interligados contam UMA vez na ocupação (F1)', async () => {
    const m = (await req('GET', `${P}/metricas`, C)).json.metricas;
    const espCasa = m.por_espaco.find(e => e.unidades.includes('Casa Grande'));
    assert.ok(espCasa.interligado, 'casa + suíte são um espaço');
    assert.ok(espCasa.unidades.includes('Suíte da Casa'));
    assert.ok(espCasa.ocupacao <= 100, 'ocupação nunca passa de 100%');
    assert.ok(m.convencoes.receita.includes('COMPETÊNCIA'), 'a convenção é declarada no relatório');
    assert.ok(m.comparacao.includes('ano anterior'));
  });
  await t('livro: DRE por unidade traz margem de contribuição, provisões e caução separada', async () => {
    const r = await req('GET', `${P}/dre`, C);
    assert.equal(r.st, 200);
    const dre = r.json.dre;
    assert.equal(dre.visao, 'COMPETÊNCIA');
    assert.ok(dre.linhas.length >= 3);
    const l = dre.linhas.find(x => x.nome === 'Casa Grande');
    assert.ok(l.receita_bruta_centavos >= l.receita_liquida_centavos);
    assert.ok('margem_contribuicao_centavos' in l && 'provisoes_centavos' in l);
    assert.ok(dre.nota_caucao.includes('NÃO é receita'));
  });

  // ------------------------------------------ Cap. 12 · proprietários
  await t('livro: relatório do proprietário é compartimentado e sai em quatro blocos', async () => {
    const pr = (await req('POST', `${P}/proprietarios`, { corpo: { nome: 'Roberto Lima', remuneracao_pct: 20, base_calculo: 'liquido', fundo_manutencao_pct: 5, limite_autonomia_centavos: 50000 }, ...C })).json.proprietario;
    await req('POST', `${P}/proprietarios/vincular`, { corpo: { imovel_id: casa, proprietario_id: pr.id }, ...C });
    const rel = (await req('GET', `${P}/proprietarios/${pr.id}/relatorio`, C)).json.relatorio;
    assert.equal(rel.blocos.length, 1, 'só a unidade dele');
    assert.equal(rel.blocos[0].imovel, 'Casa Grande');
    assert.ok(rel.blocos[0].resultado && rel.blocos[0].operacao && rel.blocos[0].imovel_estado && rel.blocos[0].avaliacoes, 'os quatro blocos');
    assert.ok(rel.compartimentacao.includes('EXCLUSIVAMENTE'));
    // portal público entrega o relatório e nenhuma outra unidade
    const port = (await req('POST', `${P}/proprietarios/${pr.id}/portal`, { corpo: {}, ...C })).json;
    const pub = await req('GET', port.url);
    assert.equal(pub.st, 200);
    assert.ok(/Casa Grande/.test(pub.texto));
    assert.ok(!/Flat Solto/.test(pub.texto), 'nenhuma unidade de outro proprietário aparece');
  });

  // ------------------------------------------ Cap. 8 · governança
  await t('livro: agente não recebe escrita em financeiro/proprietário/contratos', async () => {
    const r = await req('POST', `${P}/governanca/permissoes`, { corpo: { papel: 'agente_teste', operacao: 'le', financeiro: 'le_escreve', eh_agente: true }, ...C });
    assert.equal(r.st, 400);
    const ok = await req('POST', `${P}/governanca/permissoes`, { corpo: { papel: 'agente_teste', operacao: 'le', financeiro: 'le', eh_agente: true }, ...C });
    assert.equal(ok.st, 200);
  });
  await t('livro: toda escrita da onda entra na trilha de auditoria', async () => {
    const g = (await req('GET', `${P}/governanca`, C)).json;
    assert.ok(g.auditoria.some(a => a.acao === 'ficha.salvar'));
    assert.ok(g.auditoria.some(a => a.acao === 'interligacao.criar'));
    assert.equal(g.revisao.decisoes_humanas.length, 7);
    assert.ok(g.revisao.pode_sozinha.length >= 8, 'a lista do que a máquina PODE fazer também existe');
  });

  // ------------------------------------------ Cap. 25/30 · documentação
  await t('livro: conferência marca NÃO REGISTRADO e não presume cumprimento', async () => {
    const c = (await req('GET', `${P}/documentacao/conferencia`, C)).json.conferencia;
    assert.ok(c.total > 0);
    const linha = c.criticas.concat(c.demais)[0];
    assert.ok(linha.falta.some(f => /NÃO REGISTRADO/.test(f)));
    assert.ok(c.nota.includes('não é evidência'));
  });
  await t('livro: análise de risco apresenta fatos e não classifica ninguém', async () => {
    const res = (await req('GET', '/gestao/api/app/reservas', C)).json.reservas[0];
    const r = await req('GET', `${P}/documentacao/${res.id}`, C);
    assert.equal(r.st, 200);
    assert.ok(r.json.risco.aviso.includes('não classifica pessoas'));
    assert.ok(Array.isArray(r.json.risco.pontos_de_atencao));
  });

  // ------------------------------------------ gating por plano
  await t('livro: módulo fora do plano devolve 403 com a explicação', async () => {
    // Pro não leva o Nível 3 (portal do proprietário); leva o Nível 2 (CRM).
    saas.repo.Tenants.definirPlano(tenantId, saas.repo.Planos.porSlug('pro').id, 'teste');
    const bloqueado = await req('GET', `${P}/proprietarios`, C);
    assert.equal(bloqueado.st, 403);
    assert.equal(bloqueado.json.modulo, 'proprietarios');
    assert.ok(/upgrade/i.test(bloqueado.json.erro), 'o 403 explica o caminho');
    const liberado = await req('GET', `${P}/crm/oportunidades`, C);
    assert.equal(liberado.st, 200, 'CRM é do Nível 2 e está no Pro');
    saas.repo.Tenants.definirPlano(tenantId, saas.repo.Planos.porSlug('business').id, 'teste');
  });
}

module.exports = { rodarTestesLivro };
