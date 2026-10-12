// =====================================================================
// Villela Academy — ESTUDO · testes da AUDITORIA de 11/10/2026 (frentes 1 a 4,
// caminho do aluno). Chamado pelo selftest (npm run test:academy) depois dos
// testes da jornada do Estude. Cada teste trava um achado dos relatórios em
// docs\estudo\auditoria-2026-10-11\ — o que já tinha teste ao lado do assunto
// ficou lá (correção comentada em testes.js; régua, certificado e Tutor em
// testes-paridade.js; diagnóstico esquecido, selos e calculadora em
// testes-jornada-estude.js; pedidos em testes-pedidos/prova/edital).
// =====================================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function rodar({ t, req }) {
  const { db, nowISO } = require('../db');
  const repo = require('../repo');
  const R = require('./repo');
  const A = require('./aluno');
  const banco = require('./banco');
  const pontuacao = require('./pontuacao');
  const ev = require('./evidencia');
  const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  console.log('\n— estudo/auditoria de 11/10/2026: sorteio sem viés, simulado no formato do edital, prova em andamento, questão sem competência, vigência, ordem fixa, desempenho e as baixas —');
  const PROD = 'maria@t.com', SLUG = 'auditoria-estude';
  const IVO = { nome: 'Ivo da Auditoria', email: 'ivo.auditoria@t.com', senha: 'senha-forte-ivo', aceite_termos: true };
  const UGA = { nome: 'Uga da Auditoria', email: 'uga.auditoria@t.com', senha: 'senha-forte-uga', aceite_termos: true };
  let pid = '';
  const E = (extra = {}) => ({ produtor_email: PROD, produto_id: pid, ...extra });
  const chave = (m, rota, corpo) => req(m, rota, { semUser: true, chave: true, corpo });
  const uid = (email) => repo.Usuarios.porEmail(email).id;
  const esc = () => `/academy/api/aluno/cursos/${pid}/estudo/${SLUG}`;
  const eid = () => R.Escopos.porSlug(pid, SLUG).id;
  const painel = async (jar) => { const r = await req('GET', `${esc()}/painel`, { jar }); assert.equal(r.st, 200, r.texto); return r.json; };
  // regra pequena, com o MOLDE da do edital: mínimo por bloco (2 · 1 · 1 → proporção 50/25/25) e mínimo geral
  const REGRA = { valor_certa: 1, minimos: [{ bloco: 'I', min_pontos: 2 }, { bloco: 'II', min_pontos: 1 }, { bloco: 'III', min_pontos: 1 }], aprovacao: { min_pontos: 5 }, fonte: 'Edital de teste da auditoria, item 10' };
  const ALTS = (i) => [
    { texto: `certa ${i}`, correta: true, explicacao: 'Certa: é a regra.' },
    { texto: `errada ${i}a`, correta: false, explicacao: 'Errada: é a exceção.' },
    { texto: `errada ${i}b`, correta: false, explicacao: 'Errada: é outro instituto.' }];
  const Q = (i, comp, bloco, extra = {}) => ({ tipo: 'objetiva', origem: 'autoral', enunciado: `Auditoria, questão ${i}: qual é a regra aplicável ao ponto?`, alternativas: ALTS(i), competencias: comp ? [comp] : [], bloco, ...extra });
  const OFICIAL = (i, comp, bloco, banca, orgao, ano) => Q(i, comp, bloco, { origem: 'oficial', gabarito_situacao: 'definitivo',
    alternativas: ALTS(i).map(a => ({ texto: a.texto, correta: a.correta })), procedencia: { banca, orgao, concurso: `Concurso ${orgao} ${ano}`, ano, fonte: 'caderno oficial de teste' } });
  const UN = (codigo, titulo, comp, item) => ({ codigo, titulo, competencias: [comp], itens: [item], tempo_min: 60,
    blocos: [{ tipo: 'explicacao', texto: `Explicação da ${titulo}: a regra geral e a exceção que a banca troca.` },
      { tipo: 'pratica', titulo: 'Exercício UM', texto: `Exercício UM da ${titulo}: aplique a regra ao primeiro caso.`, solucao: `Solução UM da ${titulo}.` },
      { tipo: 'aplicacao', titulo: 'Exercício DOIS', texto: `Exercício DOIS da ${titulo}: aplique a regra ao segundo caso.`, solucao: `Solução DOIS da ${titulo}.` }] });
  const idQ = (i) => db.prepare('SELECT id FROM est_questoes WHERE dados LIKE ?').get(`%Auditoria, questão ${i}:%`).id;
  const VIGENCIA_LONGA = 'Nota de vigência da questão de teste. ' + 'A súmula citada foi cancelada pelo tribunal em sessão plenária; '.repeat(6) + 'hoje rege a matéria o artigo novo da consolidação, que não tem mais verbete que a sustente no tribunal.';

  await t('auditoria: o percurso — três blocos, três aulas, questões com bloco, uma de ordem fixa, uma só na disciplina, duas provas oficiais e sete cards', async () => {
    let r = await chave('POST', '/staff/api/academy/importar-curso', { produtor_email: PROD,
      produto: { titulo: 'Curso da Auditoria do Estude', tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Só o percurso' },
      modulos: [{ titulo: 'Comece por aqui', aulas: [{ titulo: 'Aula de orientação', tipo: 'texto', conteudo: 'O conteúdo está no Estude.' }] }] });
    assert.equal(r.st, 200, r.texto);
    pid = r.json.produto.id;
    r = await chave('POST', '/staff/api/academy/estudo/importar', E({
      escopo: { slug: SLUG, tipo: 'edital', titulo: 'Percurso da auditoria', regra_pontuacao: REGRA },
      programa: { documento: { nome: 'Edital de teste', tipo: 'edital' }, itens: [
        { codigo: '1', texto: 'Programa' },
        { codigo: '1.1', texto: 'Direito A' }, { codigo: '1.1.1', texto: 'Ponto a' },
        { codigo: '1.2', texto: 'Direito B' }, { codigo: '1.2.1', texto: 'Ponto b' },
        { codigo: '1.3', texto: 'Direito C' }, { codigo: '1.3.1', texto: 'Ponto c' }] },
      competencias: ['a', 'b', 'c'].map(n => ({ codigo: 'k' + n, resultado: `Diante de um caso do ponto ${n}, o aluno aplica a regra e justifica a resposta.` })),
      vinculos: [['1.1.1', 'ka'], ['1.2.1', 'kb'], ['1.3.1', 'kc']].map(([item, competencia]) => ({ item, competencia, justificativa: 'O item é a própria regra.' })),
      unidades: [UN('aud-a', 'Aula A', 'ka', '1.1.1'), UN('aud-b', 'Aula B', 'kb', '1.2.1'), UN('aud-c', 'Aula C', 'kc', '1.3.1')],
      // bloco I: 1–6 (a 1 com ordem fixa; a 2 com vigência longa); bloco II: 7–9 + 10 reservada; bloco III: 11–13
      questoes: [Q(1, 'ka', 'I', { ordem_fixa: true }), Q(2, 'ka', 'I', { vigencia: VIGENCIA_LONGA }), Q(3, 'ka', 'I'), Q(4, 'ka', 'I'),
        OFICIAL(5, 'ka', 'I', 'FGV', 'Tribunal Regional do Trabalho da 10ª Região', 2023), OFICIAL(6, 'ka', 'I', 'FCC', 'TRT 18', 2012),
        Q(7, 'kb', 'II'), Q(8, 'kb', 'II'), Q(9, 'kb', 'II'), Q(10, 'kb', 'II', { uso: 'reservada' }),
        Q(11, 'kc', 'III'), Q(12, 'kc', 'III'), Q(13, 'kc', 'III'),
        // questão presa só à DISCIPLINA (1.2 não é folha): não tem competência
        Q(14, '', 'II', { itens: [{ codigo: '1.2', justificativa: 'A questão cobra a disciplina inteira.' }] })],
      cards: [1, 2, 3, 4, 5, 6, 7].map(i => ({ competencia: 'ka', frente: `Card ${i} da auditoria: qual é a regra?`, verso: `A regra ${i}.` })) }));
    assert.equal(r.st, 200, r.texto);
    r = await chave('POST', '/staff/api/academy/estudo/status', E({ escopo: SLUG, status: 'publicado', unidades: 'publicado', cards: 'publicado', questoes: 'disponivel' }));
    assert.equal(r.st, 200, r.texto);
    for (const [u, jar] of [[IVO, 'ivo-a'], [UGA, 'uga-a']]) {
      assert.equal((await req('POST', '/academy/api/signup', { corpo: u, jar })).st, 200);
      assert.equal((await req('POST', `/academy/api/produtor/produtos/${pid}/matricular`, { jar: 'maria', corpo: { email: u.email } })).st, 200);
    }
  });

  // ================= B. SORTEIO SEM VIÉS =================
  await t('auditoria B: o embaralhamento não tem viés em lista longa (1.630 itens) — e a mesma semente dá a mesma ordem', async () => {
    const N = 1630, PRIMEIRAS = 100, SORTEIOS = 300, lista = Array.from({ length: N }, (_, i) => i);
    assert.deepEqual(banco.embaralhar(lista, 'semente-fixa'), banco.embaralhar(lista, 'semente-fixa'), 'reproduzível: a prova congelada sai igual');
    assert.notDeepEqual(banco.embaralhar(lista, 'semente-1'), banco.embaralhar(lista, 'semente-2'));
    assert.deepEqual([...banco.embaralhar(lista, 'x')].sort((a, b) => a - b), lista, 'é uma permutação: nada some, nada repete');
    // quantas vezes cada FAIXA de 100 posições de origem entra nas 100 primeiras; e a posição média de quem estava no começo e no fim
    const faixas = new Array(Math.ceil(N / 100)).fill(0); let somaPos0 = 0, somaPosFim = 0;
    for (let s = 0; s < SORTEIOS; s++) {
      const r = banco.embaralhar(lista, 'prova-' + s);
      for (let k = 0; k < PRIMEIRAS; k++) faixas[Math.floor(r[k] / 100)]++;
      somaPos0 += r.indexOf(0); somaPosFim += r.indexOf(N - 1);
    }
    // esperado por faixa cheia: 300 sorteios × 100 vagas × (100 / 1630) = 1.840; desvio-padrão ≈ 42. Tolerância de 6 desvios.
    const esperado = SORTEIOS * PRIMEIRAS * 100 / N;
    faixas.slice(0, 16).forEach((n, f) => assert.ok(Math.abs(n - esperado) < 250, `itens ${f * 100} a ${f * 100 + 99}: entraram ${n} vezes nas 100 primeiras; o justo é ~${Math.round(esperado)} (o sorteio antigo dava ~8.100 para a faixa 300–399 e ~90 para a 1.500–1.599)`));
    // posição média ≈ (N − 1) / 2 = 814,5; desvio da média de 300 sorteios ≈ 27
    for (const [nome, soma] of [['o primeiro item', somaPos0], ['o último item', somaPosFim]]) assert.ok(Math.abs(soma / SORTEIOS - (N - 1) / 2) < 150, `${nome} fica, em média, na posição ${Math.round(soma / SORTEIOS)} (o justo é ~815)`);
    // qui-quadrado simples sobre as 16 faixas cheias (15 graus de liberdade: 99,9 % abaixo de 37,7)
    const qui = faixas.slice(0, 16).reduce((a, n) => a + (n - esperado) ** 2 / esperado, 0);
    assert.ok(qui < 45, 'qui-quadrado das faixas: ' + qui.toFixed(1));
    assert.ok(!/const jx = h\[k\] %/.test(ler('estudo/banco.js')) && /v < limite\) return v % max/.test(ler('estudo/banco.js')), 'o sorteio de um byte saiu de cena; no lugar, 32 bits com rejeição');
  });

  // ================= Q. ORDEM FIXA · P/R. VIGÊNCIA =================
  await t('auditoria Q, P e R: questão de ordem fixa nunca é embaralhada (prática, quiz, prova, diagnóstico, correção); a vigência só aparece DEPOIS da resposta; nota longa é cortada na fronteira, com reticências', async () => {
    const q1 = R.Questoes.obter(idQ(1)), q3 = R.Questoes.obter(idQ(3));
    assert.equal(q1.ordem_fixa, true);
    const ordens = (q) => new Set(Array.from({ length: 60 }, (_, s) => banco.paraAluno(q, 'semente-' + s).alternativas.map(a => a.id).join('')));
    assert.deepEqual([...ordens(q1)], ['abc'], 'ordem fixa: a do caderno, com qualquer semente');
    assert.ok(ordens(q3).size > 1, 'as demais continuam embaralhadas');
    // prática e quiz
    const pr = (await req('GET', `${esc()}/praticar?competencia=ka&n=20`, { jar: 'ivo-a' })).json.questoes;
    const qz = (await req('GET', `${esc()}/unidades/aud-a/quiz`, { jar: 'ivo-a' })).json;
    const daUm = (lista) => lista.find(q => q.id === idQ(1));
    assert.deepEqual(daUm(pr).alternativas.map(a => a.id), ['a', 'b', 'c'], 'prática');
    assert.ok(daUm(pr).ordem_fixa === true);
    // (o quiz traz até 5 da aula: a questão 1 pode ou não estar entre elas — conferida quando está)
    if (daUm(qz.questoes)) assert.deepEqual(daUm(qz.questoes).alternativas.map(a => a.id), ['a', 'b', 'c'], 'quiz');
    // VIGÊNCIA: nada antes da resposta — nem na prática, nem no quiz
    const txt = JSON.stringify(pr) + JSON.stringify(qz);
    assert.ok(!/vigencia|súmula citada foi cancelada/.test(txt), 'a nota de vigência não vai ao navegador antes da resposta');
    const guardada = R.Questoes.obter(idQ(2)).vigencia;
    assert.ok(VIGENCIA_LONGA.length > banco.MAX_VIGENCIA && guardada.length <= banco.MAX_VIGENCIA, `nota de ${VIGENCIA_LONGA.length} caracteres guardada com ${guardada.length}`);
    assert.ok(/…$/.test(guardada) && VIGENCIA_LONGA.startsWith(guardada.replace(/\s?…$/, '')), 'cortada com reticências, sem mudar o texto: ' + guardada.slice(-40));
    assert.ok(/[.;!?] …$|\S…$/.test(guardada) && !/\w…$/.test(guardada) || /; …$/.test(guardada), 'o corte cai no fim de uma frase (ou de uma palavra), não no meio dela: ' + guardada.slice(-30));
    assert.equal(banco.cortarNaFronteira('curta', 300), 'curta');
    assert.equal(banco.cortarNaFronteira('palavra '.repeat(60), 300).length <= 300, true);
    assert.ok(/palavra…$/.test(banco.cortarNaFronteira('palavra '.repeat(60), 300)), 'sem frase para fechar, corta na palavra');
    // …depois da resposta, a nota vem junto da explicação
    const resp = await req('POST', `${esc()}/questoes/${idQ(2)}/responder`, { jar: 'ivo-a', corpo: { resposta: 'a' } });
    assert.deepEqual([resp.st, resp.json.vigencia], [200, guardada], resp.texto);
    // a tela: nada de vigência no cabeçalho da questão; ela entra na resposta e na correção comentada
    const tela = ler('app-estudo.js'), proc = tela.slice(tela.indexOf('function procedencia(q) {'), tela.indexOf('function notaDeVigencia('));
    assert.ok(!/partes\.push\(q\.vigencia\)/.test(proc), 'o cabeçalho da questão não imprime a vigência');
    assert.ok(tela.includes('notaDeVigencia(x.vigencia)') && tela.includes('notaDeVigencia(it.vigencia)'), 'ela aparece na resposta (Praticar/quiz) e na correção comentada (prova)');
  });

  // ================= C. SIMULADO × FORMATO DO EDITAL =================
  let simuladoId = '';
  await t('auditoria C: o simulado segue a proporção dos blocos da regra (sorteio POR BLOCO), avisa quando falta questão num bloco — e o veredito só sai de prova no formato', async () => {
    // puro: a proporção sai dos mínimos (12 · 9 · 9 → 40/30/30 em 100) ou do formato cadastrado
    const EDITAL = { valor_certa: 0.1, minimos: [{ bloco: 'I', min_pontos: 1.2 }, { bloco: 'II', min_pontos: 0.9 }, { bloco: 'III', min_pontos: 0.9 }], aprovacao: { min_pontos: 6 }, fonte: 'Edital 1/2023' };
    const partes = (n, regra) => pontuacao.repartirPorBloco(n, pontuacao.blocosDaRegra(regra).blocos).map(p => p.questoes);
    assert.deepEqual([partes(100, EDITAL), partes(10, EDITAL), partes(50, EDITAL), partes(7, EDITAL).reduce((a, b) => a + b, 0)], [[40, 30, 30], [4, 3, 3], [20, 15, 15], 7]);
    assert.deepEqual(partes(100, { ...EDITAL, formato: { questoes: 100, blocos: { I: 50, II: 25, III: 25 } } }), [50, 25, 25], 'formato cadastrado na regra vence a proporção dos mínimos');
    assert.equal(pontuacao.blocosDaRegra({}), null, 'regra sem blocos: nada a repartir');
    const prova = (n1, n2, n3) => [['I', n1], ['II', n2], ['III', n3]].flatMap(([b, n]) => Array.from({ length: n }, (_, k) => ({ id: b + k, gabarito: 'a', bloco: b })));
    assert.deepEqual([pontuacao.formatoDaProva(prova(40, 30, 30), EDITAL).ok, pontuacao.formatoDaProva(prova(4, 3, 3), EDITAL).ok, pontuacao.formatoDaProva(prova(57, 36, 7), EDITAL).ok], [true, false, false], '100 no formato; 10 questões e o simulado torto de 57/36/7 (Bloco III vale 0,7 < 0,9), não');
    assert.ok(/bloco III vale no máximo 0,7 e o mínimo dele é 0,9/.test(pontuacao.formatoDaProva(prova(57, 36, 7), EDITAL).motivos.join('; ')));
    assert.equal(pontuacao.formatoDaProva(prova(40, 30, 29), { ...EDITAL, formato: { questoes: 100, blocos: { I: 40, II: 30, III: 30 } } }).ok, false, 'com formato cadastrado, 99 questões não é a prova do edital');
    assert.equal(pontuacao.formatoDaProva(prova(3, 0, 0), {}).definido, false);
    // na API: 8 questões → 4 · 2 · 2, na ordem dos blocos
    const blocoDe = (id) => R.Questoes.obter(id).bloco;
    let r = await req('POST', `${esc()}/tentativas`, { jar: 'uga-a', corpo: { modo: 'simulado', n: 8 } });
    assert.equal(r.st, 200, r.texto);
    simuladoId = r.json.id;
    assert.deepEqual(r.json.questoes.map(q => blocoDe(q.id)).join(''), 'I'.repeat(4) + 'II'.repeat(2) + 'III'.repeat(2), 'quatro do I, duas do II, duas do III — na ordem do edital');
    assert.deepEqual(r.json.por_bloco, [{ bloco: 'I', pedidas: 4, questoes: 4 }, { bloco: 'II', pedidas: 2, questoes: 2 }, { bloco: 'III', pedidas: 2, questoes: 2 }]);
    assert.equal(r.json.sem_veredito, false, 'no formato: todos os mínimos são alcançáveis');
    assert.ok(r.json.questoes.some(q => q.id === idQ(10)), 'a reservada do bloco II entra primeiro no simulado');
    // certa em tudo: veredito "atingiu"
    await req('PUT', `${esc()}/tentativas/${simuladoId}/respostas`, { jar: 'uga-a', corpo: { respostas: Object.fromEntries(r.json.questoes.map(q => [q.id, 'a'])) } });
    let res = (await req('POST', `${esc()}/tentativas/${simuladoId}/enviar`, { jar: 'uga-a' })).json.resultado;
    assert.deepEqual([res.nota_liquida, res.veredito, res.aprovado, res.no_formato], [8, 'atingiu', true, true]);
    // falta questão num bloco: 16 → 8 · 4 · 4, e o bloco I só tem 6 (o III, 3)
    r = await req('POST', `${esc()}/tentativas`, { jar: 'uga-a', corpo: { modo: 'simulado', n: 16 } });
    assert.equal(r.st, 409, r.texto);
    assert.ok(/formato do edital: no bloco I há 6 questão\(ões\) elegível\(is\) para 8 pedida\(s\); no bloco III há 3 /.test(r.json.erro), r.json.erro);
    assert.deepEqual(r.json.blocos, [{ bloco: 'I', pedidas: 8, elegiveis: 6 }, { bloco: 'III', pedidas: 4, elegiveis: 3 }]);
    r = await req('POST', `${esc()}/tentativas`, { jar: 'uga-a', corpo: { modo: 'simulado', n: 16, aceitar_menos: true } });
    assert.deepEqual([r.st, r.json.questoes.length, r.json.faltaram, r.json.faltas_por_bloco.length], [200, 13, 3, 2], 'com o aceite, sai com o que existe em cada bloco — sem completar com outro bloco');
    await req('POST', `${esc()}/tentativas/${r.json.id}/enviar`, { jar: 'uga-a' });
    // PROVA CURTA: 4 questões (2 · 1 · 1) valem no máximo 4 — o mínimo geral de 5 é inalcançável: nota sim, veredito não
    r = await req('POST', `${esc()}/tentativas`, { jar: 'uga-a', corpo: { modo: 'simulado', n: 4 } });
    assert.deepEqual([r.st, r.json.sem_veredito], [200, true], r.texto);
    await req('PUT', `${esc()}/tentativas/${r.json.id}/respostas`, { jar: 'uga-a', corpo: { respostas: Object.fromEntries(r.json.questoes.map(q => [q.id, 'a'])) } });
    res = (await req('POST', `${esc()}/tentativas/${r.json.id}/enviar`, { jar: 'uga-a' })).json.resultado;
    assert.deepEqual([res.certas, res.nota_liquida, res.veredito, res.aprovado], [4, 4, 'fora_do_formato', null], 'acertou tudo e NÃO recebe "não atingiu o critério"');
    assert.ok(/a prova vale no máximo 4 e o mínimo geral é 5/.test(res.veredito_motivos.join('; ')), res.veredito_motivos.join('; '));
    // TREINO: nunca tem veredito, ainda que grande
    r = await req('POST', `${esc()}/tentativas`, { jar: 'uga-a', corpo: { modo: 'treino', n: 10 } });
    assert.deepEqual([r.st, r.json.sem_veredito, r.json.por_bloco], [200, true, null], 'treino não é repartido por bloco: ' + r.texto);
    res = (await req('POST', `${esc()}/tentativas/${r.json.id}/enviar`, { jar: 'uga-a' })).json.resultado;
    assert.deepEqual([res.veredito, res.aprovado], ['fora_do_formato', null]);
    // simulado com MATÉRIA escolhida é um recorte: não reparte, e sai sem veredito
    r = await req('POST', `${esc()}/tentativas`, { jar: 'uga-a', corpo: { modo: 'simulado', n: 3, competencias: ['ka'] } });
    assert.deepEqual([r.st, r.json.por_bloco, r.json.sem_veredito], [200, null, true], r.texto);
    await req('POST', `${esc()}/tentativas/${r.json.id}/enviar`, { jar: 'uga-a' });
    // o certificado só conta o simulado no formato com 80 % respondido: dos quatro enviados, vale o primeiro (8 de 8)
    const k = A.conclusao(uid(UGA.email), pid);
    assert.deepEqual([k.simulados_enviados, k.provas_enviadas], [4, 1], 'o de 13 foi enviado em branco, o de 4 está fora do formato, o de matéria também');
    // a tela: a frase pedida, o veredito vindo do servidor e o formato oferecido no formulário
    const tela = ler('app-estudo.js');
    for (const pedaco of ['Prova fora do formato do edital: sem veredito.', "r.veredito === 'atingiu'", 'Simulado <b>no formato do edital</b>', '(simulado completo)', 'fmt = b.formato || null']) assert.ok(tela.includes(pedaco), 'falta na tela: ' + pedaco);
    assert.equal((await req('GET', `${esc()}/banco`, { jar: 'uga-a' })).json.formato.blocos.join(','), 'I,II,III');
  });

  // ================= D. PROVA EM ANDAMENTO =================
  await t('auditoria D: a prova em andamento aparece no painel (aba Prova e aba Hoje) com o tempo que resta, e retoma na QUESTÃO em que o aluno estava', async () => {
    assert.equal((await painel('ivo-a')).prova_aberta, null);
    // A prova é das SEIS questões da competência ka (bloco I), e a que o Ivo responde é sempre a questão 3 — não "a primeira
    // das cinco sorteadas". Sorteada entre as 13 do percurso, a primeira era a questão 14 em 1 prova de cada 13; respondida
    // aqui, ela chegava "já vista" ao teste L (logo abaixo), que exige vê-la como INÉDITA no Praticar — e a suíte falhava de
    // vez em quando (12/10/2026; o conserto de 11/10 só tirava a 14 de prova ABERTA). Com as seis da ka, o conjunto é sempre
    // o mesmo (só a ordem muda), a 14 nunca entra e o que o Ivo deixa de evidência é sempre o mesmo.
    const ini = await req('POST', `${esc()}/tentativas`, { jar: 'ivo-a', corpo: { modo: 'treino', n: 6, duracao_min: 30, competencias: ['ka'] } });
    assert.deepEqual(ini.json.questoes.map(q => q.id).sort(), [1, 2, 3, 4, 5, 6].map(idQ).sort(), 'as seis da competência ka, em qualquer ordem — sem a 14, que não tem competência');
    assert.deepEqual([ini.st, ini.json.posicao], [200, 0], ini.texto);
    let pa = (await painel('ivo-a')).prova_aberta;
    assert.deepEqual([pa.id, pa.modo, pa.total, pa.respondidas, pa.posicao, pa.prazo_em], [ini.json.id, 'treino', 6, 0, 0, ini.json.prazo_em]);
    assert.ok(Date.parse(pa.prazo_em) - Date.parse(pa.agora) > 29 * 60e3, 'o tempo que resta sai do relógio do servidor');
    // respondeu uma (a questão 3, esteja onde estiver na prova) e foi para a 4ª (índice 3)
    let r = await req('PUT', `${esc()}/tentativas/${ini.json.id}/respostas`, { jar: 'ivo-a', corpo: { respostas: { [idQ(3)]: 'a' }, posicao: 3 } });
    assert.deepEqual([r.json.salvo, r.json.respondidas], [true, 1]);
    pa = (await painel('ivo-a')).prova_aberta;
    assert.deepEqual([pa.respondidas, pa.posicao], [1, 3]);
    // F5: a tela pede a tentativa — vêm as respostas e a posição
    r = await req('GET', `${esc()}/tentativas/${ini.json.id}`, { jar: 'ivo-a' });
    assert.deepEqual([r.json.posicao, Object.keys(r.json.respostas).length], [3, 1]);
    // só mudar de questão (sem responder) também guarda; posição que não cabe na prova é ignorada
    await req('PUT', `${esc()}/tentativas/${ini.json.id}/respostas`, { jar: 'ivo-a', corpo: { respostas: {}, posicao: 4 } });
    await req('PUT', `${esc()}/tentativas/${ini.json.id}/respostas`, { jar: 'ivo-a', corpo: { respostas: {}, posicao: 99 } });
    await req('PUT', `${esc()}/tentativas/${ini.json.id}/respostas`, { jar: 'ivo-a', corpo: { respostas: {}, posicao: 'x' } });
    r = await req('POST', `${esc()}/tentativas`, { jar: 'ivo-a', corpo: { modo: 'simulado', n: 8 } });
    assert.deepEqual([r.json.id, r.json.retomada, r.json.posicao, Object.keys(r.json.respostas).length], [ini.json.id, true, 4, 1], '"Começar" de novo também retoma no mesmo lugar');
    assert.equal((await painel('uga-a')).prova_aberta, null, 'a prova é de quem a abriu');
    // enviada: some do painel. Vencida no relógio do servidor: vira resultado e também some
    await req('POST', `${esc()}/tentativas/${ini.json.id}/enviar`, { jar: 'ivo-a' });
    assert.equal((await painel('ivo-a')).prova_aberta, null);
    const outra = await req('POST', `${esc()}/tentativas`, { jar: 'ivo-a', corpo: { modo: 'treino', n: 2 } });
    db.prepare('UPDATE est_tentativas SET prazo_em = ? WHERE id = ?').run(new Date(Date.now() - 9000).toISOString(), outra.json.id); // além da tolerância de 5 s do servidor
    assert.equal((await painel('ivo-a')).prova_aberta, null);
    assert.equal(db.prepare('SELECT estado FROM est_tentativas WHERE id = ?').get(outra.json.id).estado, 'expirada');
    // a tela: o cartão nas duas abas, a retomada na posição e a posição enviada com as respostas
    const tela = ler('app-estudo.js');
    for (const pedaco of ['em andamento — continuar', 'cartaoProvaAberta(p) + retaFinal(p)', 'if (E.painel.prova_aberta) {', "ir('prova', { continuar: b.getAttribute('data-pv-continuar') })", 'Number(t.posicao) || 0', '{ respostas: envio, posicao: i }', 'tempo restante: <b>']) assert.ok(tela.includes(pedaco), 'falta na tela: ' + pedaco);
  });

  // ================= L. QUESTÃO SEM COMPETÊNCIA =================
  await t('auditoria L: questão vinculada só à disciplina (sem competência) registra a resposta — deixa de voltar como inédita e entra no caderno de erros', async () => {
    const id = idQ(14), ivo = uid(IVO.email);
    assert.deepEqual(R.competenciasDaQuestao(id, eid()), [], 'o vínculo é com o item 1.2 (disciplina, não folha): nenhuma competência');
    // Prova aberta por um teste anterior pode ter SORTEADO esta questão — e questão em prova aberta não sai no
    // Praticar (segunda revisão). Sem isto o teste falhava de vez em quando, conforme o sorteio (portão de 11/10/2026).
    const abertasDoIvo = db.prepare("SELECT id FROM est_tentativas WHERE user_id = ? AND estado = 'em_andamento'").all(ivo).map(x => x.id);
    abertasDoIvo.forEach(x => db.prepare("UPDATE est_tentativas SET estado = 'enviada' WHERE id = ?").run(x));
    try {
    let pr = (await req('GET', `${esc()}/praticar?n=20`, { jar: 'ivo-a' })).json;
    const antes = pr.questoes.find(q => q.id === id);
    assert.ok(antes && antes.ja_vista === false, 'ela é oferecida no Praticar, como nova');
    const estado = JSON.stringify((await painel('ivo-a')).competencias.map(c => [c.codigo, c.estado, c.tentativas]));
    const r = await req('POST', `${esc()}/questoes/${id}/responder`, { jar: 'ivo-a', corpo: { resposta: 'b' } });
    assert.deepEqual([r.st, r.json.acerto, r.json.inedita, r.json.competencias], [200, false, true, []], r.texto);
    assert.deepEqual(db.prepare('SELECT competencia_codigo c, acerto, origem FROM est_evidencias WHERE user_id = ? AND ref_id = ?').all(ivo, id).map(x => [x.c, x.acerto, x.origem]), [['', 0, 'questao']], 'a resposta fica gravada, numa linha sem competência');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM est_revisoes WHERE user_id = ? AND alvo_id = ''").get(ivo).n, 0, 'sem competência não há retomada a agendar');
    pr = (await req('GET', `${esc()}/praticar?n=20`, { jar: 'ivo-a' })).json;
    assert.equal(pr.questoes.find(q => q.id === id).ja_vista, true, 'não volta mais como inédita');
    assert.ok(pr.questoes.findIndex(q => q.id === id) >= pr.ineditas, 'e vai para o fim da fila, depois das inéditas');
    const er = (await req('GET', `${esc()}/erros`, { jar: 'ivo-a' })).json;
    assert.ok(er.questoes.some(q => q.id === id), 'o erro nela entra no caderno de erros');
    const p = await painel('ivo-a');
    assert.equal(JSON.stringify(p.competencias.map(c => [c.codigo, c.estado, c.tentativas])), estado, 'e não mexe no estado de competência nenhuma');
    assert.equal((await req('POST', `${esc()}/questoes/${id}/responder`, { jar: 'ivo-a', corpo: { resposta: 'a' } })).json.conta_como, 'prática (questão já vista)');
    assert.ok(!(await req('GET', `${esc()}/erros`, { jar: 'ivo-a' })).json.questoes.some(q => q.id === id), 'acertou de novo: sai do caderno');
    // em PROVA a mesma coisa (competências vazias no item congelado)
    assert.doesNotThrow(() => R.comCache(() => A.estadosDoAluno(repo.Usuarios.porEmail(IVO.email), R.Escopos.obter(eid()))));
    } finally { abertasDoIvo.forEach(x => db.prepare("UPDATE est_tentativas SET estado = 'em_andamento' WHERE id = ?").run(x)); }
  });

  // ================= K. MAIS COBRADO =================
  await t('auditoria K: "Mais cobrado" escreve os números reais do banco — quantas questões oficiais, de quantas provas, de que bancas e anos', async () => {
    const b = (await req('GET', `${esc()}/banco`, { jar: 'ivo-a' })).json;
    assert.deepEqual([b.oficiais, b.oficiais_resumo.questoes, b.oficiais_resumo.provas, b.oficiais_resumo.ano_de, b.oficiais_resumo.ano_ate], [2, 2, 2, 2012, 2023]);
    assert.deepEqual(b.oficiais_resumo.bancas.map(x => x.valor).sort(), ['FCC', 'FGV']);
    assert.deepEqual(b.oficiais_resumo.lista_provas, [{ nome: 'TRT-10 · 2023', n: 1 }, { nome: 'TRT-18 · 2012', n: 1 }]);
    const tela = ler('app-estudo.js'), mc = tela.slice(tela.indexOf('function maisCobrado(alvo) {'), tela.indexOf('// ================= PROGRAMA'));
    assert.ok(mc.includes('b.oficiais_resumo') && mc.includes("(uma ? 'prova' : 'provas')") && mc.includes("'× nas ' + nProvas + ' provas'"), 'os textos saem dos números do servidor');
    for (const fixo of ['questões oficiais deste concurso', 'Quanto cada disciplina pesou na prova e', "+ '× na prova</span>"]) assert.ok(!mc.includes(fixo), 'sobrou texto fixo de "uma prova": ' + fixo);
    assert.ok(/uma \? 'É o retrato de uma prova/.test(mc), '"retrato de uma prova" só quando a base É uma prova');
  });

  // ================= N. DESEMPENHO =================
  await t('auditoria N: o painel lê as aulas UMA vez e não consulta questão por questão; a aula sozinha não lê as outras; e escrita direta no banco nunca deixa leitura velha', async () => {
    const contar = (fn) => {
      const antes = db.prepare.bind(db), n = { unidades: 0, porQuestao: 0, pesadas: 0 };
      db.prepare = (sql) => {
        if (/FROM est_unidades/.test(sql)) n.unidades++;
        if (/SELECT \* FROM est_unidades/.test(sql)) n.pesadas++;
        if (/FROM est_questao_vinculos WHERE questao_id = \?/.test(sql) || /FROM est_vinculos WHERE escopo_id = \? AND item_codigo = \?/.test(sql)) n.porQuestao++;
        return antes(sql);
      };
      try { fn(); } finally { delete db.prepare; }
      return n;
    };
    const ivo = repo.Usuarios.porEmail(IVO.email), prod = require('../repo-conteudo').Produtos.obter(pid);
    A.painel(ivo, prod, SLUG); // aquece (a primeira leitura abre as linhas)
    let n = contar(() => R.comCache(() => A.painel(ivo, prod, SLUG)));
    assert.ok(n.unidades <= 2 && n.pesadas === 0, `painel: ${n.unidades} leitura(s) de aulas, ${n.pesadas} com os textos (antes: 4, todas com JSON.parse de blocos, níveis, véspera e animações)`);
    assert.equal(n.porQuestao, 0, 'nenhuma consulta por questão');
    n = contar(() => R.comCache(() => A.quizDaAula(ivo, prod, SLUG, 'aud-a')));
    assert.deepEqual([n.porQuestao, n.pesadas], [0, 0], 'quiz da aula: sem consulta por questão e sem reabrir aulas');
    n = contar(() => R.comCache(() => A.praticar(ivo, prod, SLUG, { n: 20 })));
    assert.equal(n.porQuestao, 0, 'praticar');
    n = contar(() => R.comCache(() => A.anotarAula(ivo, prod, SLUG, 'aud-a', 'nota de medição')));
    assert.ok(n.unidades === 1 && n.pesadas === 0, 'a nota da aula (e o vídeo, a cada ~10 s) lê UMA aula: ' + JSON.stringify(n));
    // o mapa questão → competências é o mesmo da consulta questão a questão
    const mapa = R.comCache(() => R.competenciasDasQuestoes(eid()));
    for (const q of R.Questoes.doEscopo(eid())) assert.deepEqual([...(mapa.get(q.id) || [])].sort(), [...R.competenciasDaQuestao(q.id, eid())].sort());
    // objeto guardado não pode ser alterado por quem o recebe
    assert.throws(() => { R.Questoes.obter(idQ(3)).enunciado = 'adulterado'; }, TypeError);
    // ESCRITA DIRETA no banco (sem passar pela importação) é vista na leitura seguinte: a "digital" da linha mudou
    const estudo = async () => (await painel('ivo-a')).unidades.map(u => u.codigo + ':' + u.status + ':' + (u.video ? 'v' : '-') + ':' + u.animada.join('+'));
    assert.deepEqual(await estudo(), ['aud-a:publicado:-:', 'aud-b:publicado:-:', 'aud-c:publicado:-:']);
    db.prepare("UPDATE est_unidades SET video_media_id = 'video-aud' WHERE codigo = 'aud-b' AND escopo_id = ?").run(eid());
    db.prepare('UPDATE est_unidades SET animacoes = ? WHERE codigo = ? AND escopo_id = ?').run(JSON.stringify({ erros: [{ afirmacao: 'Afirmação errada de teste.', onde_esta_o_erro: 'No prazo.' }] }), 'aud-c', eid());
    assert.deepEqual(await estudo(), ['aud-a:publicado:-:', 'aud-b:publicado:v:', 'aud-c:publicado:-:erros']);
    db.prepare("UPDATE est_unidades SET status = 'rascunho' WHERE codigo = 'aud-c' AND escopo_id = ?").run(eid());
    assert.equal((await estudo()).length, 2, 'aula despublicada some na hora');
    db.prepare("UPDATE est_unidades SET status = 'publicado', video_media_id = '', animacoes = '{}' WHERE escopo_id = ?").run(eid());
    assert.deepEqual(await estudo(), ['aud-a:publicado:-:', 'aud-b:publicado:-:', 'aud-c:publicado:-:']);
    const eleg = async () => (await req('GET', `${esc()}/praticar?competencia=kc&n=20`, { jar: 'ivo-a' })).json.elegiveis;
    assert.equal(await eleg(), 3);
    db.prepare("UPDATE est_questoes SET situacao = 'suspensa' WHERE id = ?").run(idQ(13));
    assert.equal(await eleg(), 2, 'questão suspensa por fora some na hora');
    db.prepare("UPDATE est_questoes SET situacao = 'disponivel' WHERE id = ?").run(idQ(13));
    assert.equal(await eleg(), 3);
    // reimportar muda o conteúdo e a leitura acompanha (a importação trabalha sem a memória da requisição)
    const r = await chave('POST', '/staff/api/academy/estudo/importar', E({ escopo: { slug: SLUG }, unidades: [{ ...UN('aud-b', 'Aula B revista', 'kb', '1.2.1'), ordem: 1 }] }));
    assert.equal(r.st, 200, r.texto);
    assert.equal((await req('GET', `${esc()}/unidades/aud-b`, { jar: 'ivo-a' })).json.titulo, 'Aula B revista');
    // a tela não pede o painel duas vezes ao abrir o curso
    const tela = ler('app-estudo.js');
    // (réplica de 11/10/2026, R3-M9: o painel reaproveitado tem de ser DESTE percurso e sem escrita por conferir)
    assert.ok(tela.includes('if (E.painel && E.painelDe === base() && !E.painelVelho && E.painelEm && Date.now() - E.painelEm < PAINEL_FRESCO_MS) return pintarHoje(alvo);'));
  });

  // ================= O. AS BAIXAS =================
  await t('auditoria O: cards novos param no limite do dia; caderno de erros em páginas e sem questão retirada; alternativa inexistente é 400; regra com mínimo nulo não vira "0 %"; retenção pelo dia de Brasília; data torta no plano é dita', async () => {
    // "5 cards novos por dia" é limite: avaliados os 5, não chegam outros hoje
    let c = (await req('GET', `${esc()}/cards`, { jar: 'ivo-a' })).json;
    assert.deepEqual([c.total, c.novos.length, c.limites.novos_dia, c.novos_hoje], [7, A.CARDS_NOVOS_DIA, 5, 0]);
    for (const k of c.novos) assert.equal((await req('POST', `${esc()}/cards/${k.id}/avaliar`, { jar: 'ivo-a', corpo: { resultado: 'acerto' } })).st, 200);
    c = (await req('GET', `${esc()}/cards`, { jar: 'ivo-a' })).json;
    assert.deepEqual([c.novos.length, c.novos_hoje, c.por_ver], [0, 5, 2], 'os outros dois ficam para amanhã (antes vinham na hora: o acervo inteiro num dia)');
    // …e amanhã chegam: as primeiras avaliações passam a ser de ontem
    db.prepare("UPDATE est_evidencias SET criado_em = ? WHERE user_id = ? AND origem = 'card'").run(new Date(Date.now() - 30 * 3600e3).toISOString(), uid(IVO.email));
    assert.equal((await req('GET', `${esc()}/cards`, { jar: 'ivo-a' })).json.novos.length, 2);
    // próxima tarefa de quem só recordou card não fala em "pista"
    const est = R.comCache(() => A.estadosDoAluno(repo.Usuarios.porEmail(UGA.email), R.Escopos.obter(eid())));
    assert.ok(est.every(e => 'so_cards' in e && 'so_diagnostico' in e));
    // CADERNO DE ERROS em páginas: total do caderno inteiro, fatia da página, e questão retirada do banco fora da conta
    const uga = uid(UGA.email);
    for (const i of [7, 8, 9]) await req('POST', `${esc()}/questoes/${idQ(i)}/responder`, { jar: 'uga-a', corpo: { resposta: 'b' } });
    let e1 = (await req('GET', `${esc()}/erros`, { jar: 'uga-a' })).json;
    const totalAntes = e1.total;
    assert.ok(totalAntes >= 3 && e1.pagina === 1 && e1.paginas === 1 && e1.por_pagina === A.ERROS_POR_PAGINA);
    assert.equal((await painel('uga-a')).erros_pendentes, totalAntes, 'o número da aba Hoje é o do caderno');
    db.prepare("UPDATE est_questoes SET situacao = 'arquivada' WHERE id = ?").run(idQ(9));
    try {
      e1 = (await req('GET', `${esc()}/erros`, { jar: 'uga-a' })).json;
      assert.deepEqual([e1.total, (await painel('uga-a')).erros_pendentes], [totalAntes - 1, totalAntes - 1], 'questão retirada do banco sai do caderno E da contagem (antes: "1 questão no caderno", caderno vazio)');
      assert.equal(A.errosPendentes(uga, eid()).length, totalAntes, '(sem o contexto do aluno, a lista crua continua inteira)');
    } finally { db.prepare("UPDATE est_questoes SET situacao = 'disponivel' WHERE id = ?").run(idQ(9)); }
    assert.equal((await req('GET', `${esc()}/erros?pagina=9`, { jar: 'uga-a' })).json.pagina, 1, 'página além do fim cai na última');
    const telaErros = ler('app-estudo.js');
    assert.ok(telaErros.includes("'/erros?pagina=' + pagina") && telaErros.includes("' de ' + r.total + ' · página '"), 'a tela diz qual pedaço do caderno está à vista e pede a página seguinte');
    // alternativa que não existe: 400, sem evidência
    const antes = db.prepare('SELECT COUNT(*) n FROM est_evidencias WHERE user_id = ?').get(uga).n;
    const torta = await req('POST', `${esc()}/questoes/${idQ(11)}/responder`, { jar: 'uga-a', corpo: { resposta: 'zz' } });
    assert.deepEqual([torta.st, db.prepare('SELECT COUNT(*) n FROM est_evidencias WHERE user_id = ?').get(uga).n], [400, antes], torta.texto);
    // regra com mínimo NULO: sem critério — não "mínimo de 0 %, aprovado"
    const itens = [{ id: 'x', gabarito: 'a', bloco: '' }];
    assert.equal(pontuacao.corrigir(itens, {}, { aprovacao: { min_pct: null }, fonte: 'f' }).aprovado, null, 'aprovação declarada sem número não é critério: nem aprova nem reprova (antes: "Atingiu o critério cadastrado" com zero acerto)');
    assert.deepEqual([pontuacao.normalizarRegra({ aprovacao: { min_pct: null, min_pontos: '' } }).aprovacao, pontuacao.normalizarRegra({ minimos: [{ bloco: 'I', min_pct: null }] }).minimos[0]], [null, { bloco: 'I', min_pct: null, min_pontos: null }], 'o nulo continua nulo (antes virava 0)');
    assert.equal(pontuacao.normalizarRegra({ valor_certa: null }).valor_certa, 1);
    assert.deepEqual([pontuacao.corrigir(itens, {}, { aprovacao: { min_pct: 0 }, fonte: 'f' }).regra.aprovacao.min_pct, pontuacao.corrigir(itens, {}, { aprovacao: { min_pct: 0 }, fonte: 'f' }).aprovado], [0, true], 'zero ESCRITO continua zero');
    // RETENÇÃO pelo dia de Brasília: segunda 21h30 (00h30Z de terça) → segunda seguinte 20h (23hZ) = 7 dias de calendário
    assert.equal(ev.diasEntre('2026-10-06T00:30:00.000Z', '2026-10-12T23:00:00.000Z'), 7, 'em UTC seriam 6, e a retenção não era reconhecida');
    assert.equal(ev.diasEntre('2026-10-05', '2026-10-12'), 7, 'data sem hora continua valendo como está');
    const dem = (criado_em) => ({ acerto: true, modo: 'pratica', pistas: 0, ajuda_humana: false, inedita: true, criado_em });
    assert.equal(ev.estadoDaCompetencia([dem('2026-10-06T00:30:00.000Z'), dem('2026-10-12T23:00:00.000Z')]).estado, 'retida');
    // PLANO: data em formato torto é recusada com a razão (antes era ignorada em silêncio)
    const pl = await req('PUT', `${esc()}/plano`, { jar: 'uga-a', corpo: { disponibilidade: { seg: 60 }, data_alvo: '31/12/2026' } });
    assert.ok(pl.st === 400 && /AAAA-MM-DD/.test(pl.json.erro), pl.texto);
    // certificado de quem não tem o curso: 403 (era 400)
    assert.equal((await req('POST', `/academy/api/aluno/cursos/${pid}/certificado`, { jar: 'caio' })).st, 403);
    // a tela: nota com vírgula, aviso de janela bloqueada, uma camada só, "em prova" limpo ao sair
    const tela = ler('app-estudo.js');
    assert.ok(tela.includes("'<div class=\"es-nota\"><b>' + num(r.nota_liquida) + '</b><span> de ' + num(r.maximo)"), 'nota do resultado com vírgula');
    assert.ok(tela.includes('O navegador bloqueou a nova janela.') && (tela.match(/window\.open\('', '_blank'\)/g) || []).length <= 2, 'toda janela nova passa pelo aviso de bloqueio (sobram a de abrirJanela e a do certificado, que cai no próprio endereço)');
    assert.ok(tela.includes("if (E.abrindoAnimada || document.querySelector('.es-an')) return;"), 'duplo clique não abre duas camadas');
    assert.ok(tela.includes('window.AcademyEstudeSair = sairDoEstude;') && ler('app-cliente.js').includes('window.AcademyEstudeSair()') && ler('app-aluno.js').includes('if (ES && ES.sair) ES.sair();'), 'sair do Estude por qualquer porta limpa a marca "em prova", o relógio e o microfone');
    assert.ok(tela.includes("keepalive: true") && tela.includes("window.addEventListener('pagehide', despejarPendentes);"), 'o que o aluno escreveu sai na hora ao fechar ou recarregar a página');
    // (réplica de 11/10/2026, R3-B11) os motores passaram a ir em ES5: o aviso de "navegador mais recente" saiu — o que
    // garante isso é o verificador de ES5 de testes-auditoria-b2.js
    assert.ok(!tela.includes('precisam de um navegador mais recente') && tela.includes('As ferramentas não carregaram por inteiro'), 'as Ferramentas não pedem mais navegador novo; arquivo que não rodou é falha de carga');
  });

  await t('auditoria B5: a tentativa escrita é do BLOCO, não da posição — reimportar a aula com os exercícios em outra ordem não cola o texto no exercício errado', async () => {
    const un = `${esc()}/unidades/aud-a`;
    let u = (await req('GET', un, { jar: 'ivo-a' })).json;
    const n1 = u.blocos.find(b => /Exercício UM/.test(b.texto)).n, n2 = u.blocos.find(b => /Exercício DOIS/.test(b.texto)).n;
    assert.deepEqual([n1, n2], [1, 2]);
    assert.equal((await req('PUT', `${un}/blocos/${n1}/tentativa`, { jar: 'ivo-a', corpo: { texto: 'MINHA RESPOSTA AO UM' } })).st, 200);
    assert.equal((await req('PUT', `${un}/blocos/${n2}/tentativa`, { jar: 'ivo-a', corpo: { texto: 'MINHA RESPOSTA AO DOIS' } })).st, 200);
    // a aula é reimportada com os dois exercícios em ordem TROCADA
    const nova = UN('aud-a', 'Aula A', 'ka', '1.1.1');
    nova.blocos = [nova.blocos[0], nova.blocos[2], nova.blocos[1]];
    assert.equal((await chave('POST', '/staff/api/academy/estudo/importar', E({ escopo: { slug: SLUG }, unidades: [{ ...nova, ordem: 0 }] }))).st, 200);
    u = (await req('GET', un, { jar: 'ivo-a' })).json;
    const doUm = u.blocos.find(b => /Exercício UM/.test(b.texto)).n, doDois = u.blocos.find(b => /Exercício DOIS/.test(b.texto)).n;
    assert.deepEqual([doUm, doDois], [2, 1], 'os exercícios trocaram de lugar');
    assert.deepEqual([u.tentativas[doUm].texto, u.tentativas[doDois].texto], ['MINHA RESPOSTA AO UM', 'MINHA RESPOSTA AO DOIS'], 'cada resposta foi junto com o exercício dela');
    const cad = (await req('GET', `${esc()}/caderno`, { jar: 'ivo-a' })).json.disciplinas.flatMap(d => d.aulas).find(a => a.codigo === 'aud-a');
    assert.ok(cad.tentativas.every(x => (/UM/.test(x.texto)) === /Exercício UM/.test(x.enunciado)), 'no caderno, o enunciado ao lado é o do exercício certo');
    // salvar de novo no lugar novo não deixa a resposta em dois lugares
    assert.equal((await req('PUT', `${un}/blocos/${doUm}/tentativa`, { jar: 'ivo-a', corpo: { texto: 'MINHA RESPOSTA AO UM, REVISTA' } })).st, 200);
    u = (await req('GET', un, { jar: 'ivo-a' })).json;
    assert.deepEqual([u.tentativas[doUm].texto, u.tentativas[doDois].texto, Object.keys(u.tentativas).length], ['MINHA RESPOSTA AO UM, REVISTA', 'MINHA RESPOSTA AO DOIS', 2]);
    // exercício REESCRITO: a resposta antiga não é colada no exercício novo — fica no caderno, como de versão anterior
    const reescrita = UN('aud-a', 'Aula A', 'ka', '1.1.1');
    reescrita.blocos[1] = { tipo: 'pratica', titulo: 'Exercício NOVO', texto: 'Exercício NOVO da Aula A: um caso completamente diferente.', solucao: 'Solução nova.' };
    assert.equal((await chave('POST', '/staff/api/academy/estudo/importar', E({ escopo: { slug: SLUG }, unidades: [{ ...reescrita, ordem: 0 }] }))).st, 200);
    u = (await req('GET', un, { jar: 'ivo-a' })).json;
    const doNovo = u.blocos.find(b => /Exercício NOVO/.test(b.texto)).n;
    assert.equal(u.tentativas[doNovo], undefined, 'o exercício novo abre em branco');
    assert.equal(u.tentativas[u.blocos.find(b => /Exercício DOIS/.test(b.texto)).n].texto, 'MINHA RESPOSTA AO DOIS');
    const solta = (await req('GET', `${esc()}/caderno`, { jar: 'ivo-a' })).json.disciplinas.flatMap(d => d.aulas).find(a => a.codigo === 'aud-a').tentativas.find(x => /REVISTA/.test(x.texto));
    assert.ok(solta && solta.solta === true && /versão anterior/.test(solta.titulo), 'e o que o aluno escreveu não se perde');
  });

  await t('auditoria B12 e B15: migração é atômica (comandos e registro na mesma transação); certificado antigo da aula-casca de curso que hospeda o Estude ganha a frase do curso livre na exibição', async () => {
    const fonte = ler('db.js'), laco = fonte.slice(fonte.indexOf('for (const m of MIGRACOES) {'), fonte.indexOf('const nowISO ='));
    assert.ok(/db\.exec\('BEGIN'\);\s+try \{\s+db\.exec\(m\.sql\);\s+db\.prepare\('INSERT INTO migrations[^\n]+\n\s+db\.exec\('COMMIT'\);\s+\} catch \(e\) \{ try \{ db\.exec\('ROLLBACK'\)/.test(laco), 'BEGIN … exec … registro … COMMIT, com ROLLBACK na falha');
    // prova viva: dois ALTER, o segundo falha — o primeiro é desfeito
    const { DatabaseSync } = require('node:sqlite');
    const m = new DatabaseSync(':memory:');
    m.exec('CREATE TABLE x (a TEXT); CREATE TABLE migrations (nome TEXT)');
    m.exec('BEGIN');
    try { m.exec('ALTER TABLE x ADD COLUMN b TEXT; ALTER TABLE x ADD COLUMN b TEXT;'); m.exec('COMMIT'); } catch (e) { m.exec('ROLLBACK'); }
    assert.deepEqual(m.prepare('PRAGMA table_info(x)').all().map(c => c.name), ['a'], 'migração que morre no meio não deixa coluna pela metade');
    m.close();
    for (const col of [['est_tentativas', 'posicao'], ['est_tentativas_bloco', 'bloco_ref']]) assert.ok(db.prepare(`PRAGMA table_info(${col[0]})`).all().some(c => c.name === col[1]), col.join('.'));
    // certificado emitido pela casca (tipo vazio) de um curso que hospeda o Estude
    const id = 'CERT-CASCA-AUD', ivo = repo.Usuarios.porEmail(IVO.email), prod = require('../repo-conteudo').Produtos.obter(pid);
    const cols = db.prepare('PRAGMA table_info(certificates)').all().map(c => c.name);
    const base = { id, user_id: ivo.id, product_id: pid, aluno_nome: ivo.nome, produto_titulo: prod.titulo, produtor_nome: '', total_aulas: 1, emitido_em: nowISO(), tipo: '', carga_horaria_min: 0 };
    const usar = cols.filter(k => k in base);
    db.prepare(`INSERT INTO certificates (${usar.join(', ')}) VALUES (${usar.map(() => '?').join(', ')})`).run(...usar.map(k => base[k]));
    try {
      const pg = await req('GET', '/academy/certificados/' + id);
      assert.equal(pg.st, 200, pg.texto.slice(0, 200));
      assert.ok(pg.texto.includes('Curso livre. Certificado emitido pela Villela Academy, sem validade para o MEC.'), 'a frase aparece no certificado antigo');
      assert.ok(!pg.texto.includes('1 aula(s)'), 'e o "1 aula(s)" da casca não é exibido');
    } finally { db.prepare('DELETE FROM certificates WHERE id = ?').run(id); }
  });
}

module.exports = { rodar };
