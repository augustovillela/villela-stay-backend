// =====================================================================
// Villela Academy — ESTUDO · testes da JORNADA do Estude e das FERRAMENTAS
// do concurseiro (paridade com os outros cursos, etapa 2). Chamado pelo
// selftest da Academy com os outros testes do Estude.
//
// Monta um percurso de edital com três disciplinas (A: 2 aulas, B: 2, C: 1)
// e 16 questões, duas delas RESERVADAS, e quatro alunos:
//   Bia  faz o diagnóstico em partes, o teste final e ganha medalhas;
//   Leo  só abre aulas e acerta com pista — fica em Explorador;
//   Dan  demonstra competência por competência — sobe e desce de nível;
//   (o Caio, da suíte, não tem o curso: recebe 403).
// As contas das ferramentas são conferidas contra valores feitos À MÃO
// (datas de calendário conhecidas, notas calculadas no papel) e contra o
// motor de sempre (`pontuacao.corrigir`, `plano.planejar`). Datas de
// evidência são arranjadas no banco a partir de hoje — nada de dia fixo.
// =====================================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function rodar({ t, req }) {
  const { db, nowISO, novoId, j } = require('../db');
  const repo = require('../repo');
  const R = require('./repo');
  const A = require('./aluno');
  const J = require('./jornada-estude');
  const pontuacao = require('./pontuacao');
  const calc = require('./calculadora');
  const prazo = require('./prazo');
  const plano = require('./plano');
  const crono = require('./cronograma');
  const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  console.log('\n— estudo/jornada: diagnóstico e teste final, nível pelo domínio, selos, medalhas e as ferramentas do concurseiro —');
  const PROD = 'maria@t.com', SLUG = 'jornada-estude';
  const BIA = { nome: 'Bia do Diagnóstico', email: 'bia.jornada@t.com', senha: 'senha-forte-bia', aceite_termos: true };
  const LEO = { nome: 'Leo Explorador', email: 'leo.jornada@t.com', senha: 'senha-forte-leo', aceite_termos: true };
  const DAN = { nome: 'Dan que Demonstra', email: 'dan.jornada@t.com', senha: 'senha-forte-dan', aceite_termos: true };
  let pid = '';
  const E = (extra = {}) => ({ produtor_email: PROD, produto_id: pid, ...extra });
  const chave = (m, rota, corpo) => req(m, rota, { semUser: true, chave: true, corpo });
  const uid = (email) => repo.Usuarios.porEmail(email).id;
  const esc = () => `/academy/api/aluno/cursos/${pid}/estudo/${SLUG}`;
  const eid = () => R.Escopos.porSlug(pid, SLUG).id;
  const ALTS = (i) => [
    { texto: `certa ${i}`, correta: true, explicacao: 'Certa: é a regra.' },
    { texto: `errada ${i}a`, correta: false, explicacao: 'Errada: é a exceção.' },
    { texto: `errada ${i}b`, correta: false, explicacao: 'Errada: é outro instituto.' }];
  const Q = (i, comp, extra = {}) => ({ tipo: 'objetiva', origem: 'autoral', enunciado: `Jornada, questão ${i}: qual é a regra aplicável ao ponto?`, alternativas: ALTS(i), competencias: [comp], ...extra });
  const UN = (codigo, titulo, comp, item) => ({ codigo, titulo, competencias: [comp], itens: [item], tempo_min: 60,
    blocos: [{ tipo: 'explicacao', texto: `Explicação da ${titulo}: a regra geral e a exceção que a banca troca.` },
      { tipo: 'pratica', texto: `Prática da ${titulo}: aplique a regra ao caso e escreva a sua resposta.`, solucao: `Solução da ${titulo}.` }] });
  // questão N → id, e de volta; a disciplina sai do número: 1–8 = A, 9–13 = B, 14–16 = C
  const idQ = (i) => db.prepare('SELECT id FROM est_questoes WHERE dados LIKE ?').get(`%Jornada, questão ${i}:%`).id;
  const numQ = (id) => Number(/Jornada, questão (\d+):/.exec(db.prepare('SELECT dados FROM est_questoes WHERE id = ?').get(id).dados)[1]);
  const discDe = (n) => (n <= 8 ? '1.1' : n <= 13 ? '1.2' : '1.3');
  const RESERVADAS = [8, 16];
  const responder = (jar, i, resposta = 'a') => req('POST', `${esc()}/questoes/${idQ(i)}/responder`, { jar, corpo: { resposta } });
  const jornada = async (jar) => { const r = await req('GET', `${esc()}/jornada`, { jar }); assert.equal(r.st, 200, r.texto); return r.json; };
  const painel = async (jar) => (await req('GET', `${esc()}/painel`, { jar })).json;
  const diasAtras = (n) => new Date(Date.now() - n * 864e5).toISOString();
  const REGRA = { valor_certa: 0.1, minimos: [{ bloco: 'I', min_pontos: 1.2 }, { bloco: 'II', min_pontos: 0.9 }, { bloco: 'III', min_pontos: 0.9 }], aprovacao: { min_pontos: 6 }, fonte: 'Edital de teste, item 10' };

  await t('jornada: o percurso — três disciplinas, cinco aulas, 16 questões (duas reservadas) e três alunos', async () => {
    let r = await chave('POST', '/staff/api/academy/importar-curso', { produtor_email: PROD,
      produto: { titulo: 'Curso da Jornada do Estude', tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Só o percurso' },
      modulos: [{ titulo: 'Comece por aqui', aulas: [{ titulo: 'Aula de orientação', tipo: 'texto', conteudo: 'O conteúdo está no Estude.' }] }] });
    assert.equal(r.st, 200, r.texto);
    pid = r.json.produto.id;
    r = await chave('POST', '/staff/api/academy/estudo/importar', E({
      escopo: { slug: SLUG, tipo: 'edital', titulo: 'Percurso da jornada', regra_pontuacao: REGRA },
      programa: { documento: { nome: 'Edital de teste', tipo: 'edital' }, itens: [
        { codigo: '1', texto: 'Bloco I' },
        { codigo: '1.1', texto: 'Direito A' }, { codigo: '1.1.1', texto: 'Ponto a1' }, { codigo: '1.1.2', texto: 'Ponto a2' },
        { codigo: '1.2', texto: 'Direito B' }, { codigo: '1.2.1', texto: 'Ponto b1' }, { codigo: '1.2.2', texto: 'Ponto b2' },
        { codigo: '1.3', texto: 'Direito C' }, { codigo: '1.3.1', texto: 'Ponto c1' }] },
      competencias: ['a1', 'a2', 'b1', 'b2', 'c1'].map(n => ({ codigo: 'c' + n, resultado: `Diante de um caso do ponto ${n}, o aluno aplica a regra e justifica a resposta.` })),
      vinculos: [['1.1.1', 'ca1'], ['1.1.2', 'ca2'], ['1.2.1', 'cb1'], ['1.2.2', 'cb2'], ['1.3.1', 'cc1']].map(([item, competencia]) => ({ item, competencia, justificativa: 'O item é a própria regra.' })),
      unidades: [UN('aula-a1', 'Aula A1', 'ca1', '1.1.1'), UN('aula-a2', 'Aula A2', 'ca2', '1.1.2'), UN('aula-b1', 'Aula B1', 'cb1', '1.2.1'), UN('aula-b2', 'Aula B2', 'cb2', '1.2.2'), UN('aula-c1', 'Aula C1', 'cc1', '1.3.1')],
      questoes: [Q(1, 'ca1'), Q(2, 'ca1'), Q(3, 'ca1'), Q(4, 'ca1', { pistas: ['Lembre da regra geral.'] }), Q(5, 'ca2'), Q(6, 'ca2'), Q(7, 'ca2'), Q(8, 'ca1', { uso: 'reservada' }),
        Q(9, 'cb1'), Q(10, 'cb1'), Q(11, 'cb1'), Q(12, 'cb2'), Q(13, 'cb2'), Q(14, 'cc1'), Q(15, 'cc1'), Q(16, 'cc1', { uso: 'reservada' })] }));
    assert.equal(r.st, 200, r.texto);
    r = await chave('POST', '/staff/api/academy/estudo/status', E({ escopo: SLUG, status: 'publicado', unidades: 'publicado', cards: 'publicado', questoes: 'disponivel' }));
    assert.equal(r.st, 200, r.texto);
    for (const [u, jar] of [[BIA, 'bia-j'], [LEO, 'leo-j'], [DAN, 'dan-j']]) {
      assert.equal((await req('POST', '/academy/api/signup', { corpo: u, jar })).st, 200);
      const m = await req('POST', `/academy/api/produtor/produtos/${pid}/matricular`, { jar: 'maria', corpo: { email: u.email } });
      assert.equal(m.st, 200, m.texto);
    }
    const p = await painel('bia-j');
    assert.deepEqual(RESERVADAS.map(i => db.prepare('SELECT uso FROM est_questoes WHERE id = ?').get(idQ(i)).uso), ['reservada', 'reservada']);
    // o painel já leva o resumo da jornada: Explorador, diagnóstico disponível e ainda não feito
    assert.deepEqual([p.jornada.nivel.n, p.jornada.nivel.nome, p.jornada.avaliacao.disponivel, p.jornada.avaliacao.diagnostico.feito, p.jornada.avaliacao.por_disciplina, p.jornada.avaliacao.disciplinas], [1, 'Explorador', true, false, 3, 3]);
    assert.deepEqual(J.disciplinas(A.abrir(repo.Usuarios.porEmail(BIA.email), require('../repo-conteudo').Produtos.obter(pid), SLUG)).map(d => [d.codigo, d.nome, d.aulas.length, d.competencias]),
      [['1.1', 'Direito A', 2, ['ca1', 'ca2']], ['1.2', 'Direito B', 2, ['cb1', 'cb2']], ['1.3', 'Direito C', 1, ['cc1']]]);
  });

  // ================= 1. DIAGNÓSTICO =================
  let diagId = '', diagQs = [];
  await t('diagnóstico: sorteia N por disciplina, inédita primeiro, NUNCA reservada, sem gabarito; faltou questão, diz quanto', async () => {
    assert.equal(J.DIAG_QUESTOES_POR_DISCIPLINA, 3);
    // a Bia já viu duas questões da disciplina A no Praticar: o diagnóstico tem cinco inéditas dela para escolher
    assert.equal((await responder('bia-j', 1)).json.acerto, true);
    assert.equal((await responder('bia-j', 5)).json.acerto, true);
    assert.equal((await req('POST', `${esc()}/diagnostico`, { jar: 'caio', corpo: {} })).st, 403, 'quem não tem o curso não entra');
    assert.equal((await req('POST', `${esc()}/diagnostico`, { jar: 'bia-j', corpo: { tipo: 'simulado' } })).st, 400, 'só diagnostico | teste_final');
    const r = await req('POST', `${esc()}/diagnostico`, { jar: 'bia-j', corpo: { tipo: 'diagnostico' } });
    assert.equal(r.st, 200, r.texto);
    diagId = r.json.id;
    diagQs = r.json.questoes.map(q => numQ(q.id));
    assert.deepEqual(r.json.disciplinas, [{ codigo: '1.1', nome: 'Direito A', questoes: 3, disponiveis: 7 }, { codigo: '1.2', nome: 'Direito B', questoes: 3, disponiveis: 5 }, { codigo: '1.3', nome: 'Direito C', questoes: 2, disponiveis: 2 }],
      'três por disciplina; a C só tem duas fora da reserva');
    assert.deepEqual([r.json.modo, r.json.estado, r.json.questoes.length, r.json.faltaram, r.json.duracao_min], ['diagnostico', 'em_andamento', 8, 1, 0]);
    assert.deepEqual(diagQs.map(discDe), ['1.1', '1.1', '1.1', '1.2', '1.2', '1.2', '1.3', '1.3'], 'na ordem do edital, disciplina por disciplina');
    assert.ok(!diagQs.some(n => RESERVADAS.includes(n)), 'questão reservada não entra: ' + diagQs.join(','));
    assert.ok(!diagQs.includes(1) && !diagQs.includes(5), 'havendo inéditas, a já vista fica de fora: ' + diagQs.join(','));
    assert.ok(!/"correta"|"explicacao"|"gabarito":|Certa: é a regra/.test(r.texto), 'o diagnóstico não leva gabarito ao navegador');
    assert.ok(Date.parse(r.json.prazo_em) - Date.parse(r.json.inicio_em) === J.DIAG_VALIDADE_DIAS * 864e5, 'sem relógio punitivo: fica aberto por 30 dias');
    assert.equal(new Set(diagQs).size, 8, 'nenhuma questão repetida');
  });

  await t('diagnóstico: faz-se em partes — salva, sai, retoma com as respostas; aberto, não trava o treino; só o envio registra evidência', async () => {
    const ids = diagQs.map(idQ), antes = db.prepare('SELECT COUNT(*) n FROM est_evidencias WHERE user_id = ?').get(uid(BIA.email)).n;
    // 1ª parte: as três da disciplina A, certas
    let r = await req('PUT', `${esc()}/tentativas/${diagId}/respostas`, { jar: 'bia-j', corpo: { respostas: { [ids[0]]: 'a', [ids[1]]: 'a', [ids[2]]: 'a' } } });
    assert.deepEqual([r.st, r.json.salvo, r.json.respondidas, r.json.total], [200, true, 3, 8], r.texto);
    let p = await painel('bia-j');
    assert.deepEqual([p.jornada.avaliacao.diagnostico.feito, p.jornada.avaliacao.diagnostico.aberto.respondidas, p.jornada.avaliacao.diagnostico.aberto.total], [false, 3, 8], 'a aba Hoje sabe que há diagnóstico em andamento');
    // voltar outro dia: o mesmo diagnóstico, com o que já foi respondido
    r = await req('POST', `${esc()}/diagnostico`, { jar: 'bia-j', corpo: { tipo: 'diagnostico' } });
    assert.deepEqual([r.st, r.json.id, r.json.retomada, Object.keys(r.json.respostas).length, r.json.questoes.map(q => q.id)], [200, diagId, true, 3, ids], r.texto);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM est_tentativas WHERE user_id = ? AND modo = 'diagnostico'").get(uid(BIA.email)).n, 1, 'retomar não cria outro');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM est_evidencias WHERE user_id = ?').get(uid(BIA.email)).n, antes, 'salvar não é responder: a evidência só nasce no envio');
    // diagnóstico aberto por dias não pode segurar a aba Prova
    const tr = await req('POST', `${esc()}/tentativas`, { jar: 'bia-j', corpo: { modo: 'treino', n: 2 } });
    assert.ok(tr.st === 200 && tr.json.id !== diagId && !tr.json.retomada && tr.json.modo === 'treino', 'o treino começa mesmo com o diagnóstico aberto: ' + tr.texto);
    assert.equal((await req('POST', `${esc()}/tentativas/${tr.json.id}/enviar`, { jar: 'bia-j' })).st, 200);
    assert.equal((await req('GET', `${esc()}/tentativas/${diagId}`, { jar: 'leo-j' })).st, 404, 'a tentativa é de quem a começou');
    // 2ª parte: B com duas certas e uma errada; C com uma errada e uma em branco
    r = await req('PUT', `${esc()}/tentativas/${diagId}/respostas`, { jar: 'bia-j', corpo: { respostas: { [ids[3]]: 'a', [ids[4]]: 'a', [ids[5]]: 'b', [ids[6]]: 'b' } } });
    assert.deepEqual([r.json.respondidas, r.json.total], [7, 8]);
    const sem = db.prepare('SELECT COUNT(*) n FROM est_evidencias WHERE user_id = ?').get(uid(BIA.email)).n;
    r = await req('POST', `${esc()}/tentativas/${diagId}/enviar`, { jar: 'bia-j' });
    assert.deepEqual([r.st, r.json.estado, r.json.resultado.certas, r.json.resultado.erradas, r.json.resultado.em_branco], [200, 'enviada', 5, 2, 1], r.texto);
    const evs = db.prepare('SELECT * FROM est_evidencias WHERE user_id = ? AND tentativa_id = ?').all(uid(BIA.email), diagId);
    assert.deepEqual([evs.length, db.prepare('SELECT COUNT(*) n FROM est_evidencias WHERE user_id = ?').get(uid(BIA.email)).n - sem, evs.every(e => e.modo === 'avaliacao' && e.origem === 'questao')], [7, 7, true],
      'cada resposta dada vira evidência como qualquer outra; a em branco não');
  });

  await t('diagnóstico: resultado por disciplina com leitura simples, ordem sugerida de estudo — e é feito uma vez só', async () => {
    assert.deepEqual([J.DIAG_FAIXA_BASE_PCT, J.DIAG_FAIXA_FORTE_PCT], [50, 80]);
    const jr = await jornada('bia-j'), d = jr.avaliacao.diagnostico;
    assert.deepEqual(d.resultado.disciplinas.map(x => [x.nome, x.acertos, x.total, x.respondidas, x.pct, x.leitura, x.leitura_txt]), [
      ['Direito A', 3, 3, 3, 100, 'ponto_forte', 'Ponto forte'], ['Direito B', 2, 3, 3, 67, 'base_razoavel', 'Base razoável'], ['Direito C', 0, 2, 1, 0, 'comece_por_aqui', 'Comece por aqui']]);
    assert.deepEqual([d.feito, d.aberto, d.resultado.acertos, d.resultado.total], [true, null, 5, 8]);
    assert.deepEqual(d.ordem_sugerida.map(x => x.nome), ['Direito C', 'Direito B', 'Direito A'], 'a mais fraca primeiro');
    // a aba Hoje e o Plano recebem a mesma ordem pelo painel — e o plano do aluno NÃO é tocado
    const p = await painel('bia-j');
    assert.deepEqual(p.jornada.avaliacao.diagnostico.ordem_sugerida.map(x => x.codigo), ['1.3', '1.2', '1.1']);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM est_planos WHERE user_id = ?').get(uid(BIA.email)).n, 0, 'o diagnóstico só informa: não cria nem reescreve plano');
    const de = await req('POST', `${esc()}/diagnostico`, { jar: 'bia-j', corpo: { tipo: 'diagnostico' } });
    assert.ok(de.st === 409 && /já foi feito/.test(de.json.erro), de.texto);
    // empate na ordem: vale a ordem do edital; disciplina sem questão vai para o fim
    assert.deepEqual(J.ordemSugerida([{ nome: 'x', pct: 50, total: 3, ordem: 0 }, { nome: 'y', pct: 0, total: 0, ordem: 1 }, { nome: 'z', pct: 50, total: 3, ordem: 2 }, { nome: 'w', pct: 10, total: 3, ordem: 3 }]).map(x => x.nome), ['w', 'x', 'z', 'y']);
  });

  await t('régua da aula estudada: o que se responde no DIAGNÓSTICO (e no teste final) não conta como estudo — nem na lista de aulas, na biblioteca, no certificado, no cronograma, no bronze ou na liberação do teste final; como DOMÍNIO, continua valendo', async () => {
    const bia = uid(BIA.email), e = eid();
    // o diagnóstico da Bia deixou evidência nas três disciplinas (sete respostas; quais competências, depende do sorteio)…
    const doDiag = db.prepare('SELECT DISTINCT competencia_codigo c FROM est_evidencias WHERE user_id = ? AND tentativa_id = ? ORDER BY c').all(bia, diagId).map(r => r.c);
    assert.ok(doDiag.includes('cc1') && doDiag.some(k => /^cb/.test(k)) && doDiag.some(k => /^ca/.test(k)), 'o diagnóstico tocou A, B e C: ' + doDiag.join(','));
    // …mas FORA dele ela só respondeu as questões 1 (aula A1) e 5 (aula A2), no Praticar
    const estudadas = (p) => p.unidades.filter(u => u.estudada).map(u => u.codigo);
    let p = await painel('bia-j');
    assert.deepEqual(estudadas(p), ['aula-a1', 'aula-a2'], 'antes da correção, as cinco aulas apareciam estudadas');
    assert.equal(p.cobertura.estudo.estudados, 2, '"Estudados por você" (itens do programa) segue a mesma régua');
    // biblioteca, certificado, cronograma (Ferramentas), teste final e selo bronze: o mesmo número
    assert.deepEqual([A.progressoDoCurso(bia, pid).progresso.concluidas, A.conclusao(bia, pid).estudadas, p.conclusao.estudadas], [2, 2, 2]);
    const fer = (await req('GET', `${esc()}/ferramentas`, { jar: 'bia-j' })).json;
    assert.deepEqual(fer.disciplinas.flatMap(d => d.aulas.filter(a => a.estudada).map(a => a.codigo)), ['aula-a1', 'aula-a2'], 'o cronograma ainda conta as outras três como por estudar');
    const jr = await jornada('bia-j');
    assert.deepEqual([jr.avaliacao.teste_final.aulas_estudadas, jr.avaliacao.teste_final.faltam_aulas, jr.avaliacao.teste_final.liberado], [2, 2, false], '70 % de 5 = 4: faltam duas');
    assert.deepEqual(jr.selos.map(s => [s.nome, s.aulas_estudadas, s.aulas]), [['Direito A', 2, 2], ['Direito B', 0, 2], ['Direito C', 0, 1]]);
    // DOMÍNIO: a evidência do diagnóstico continua valendo — estado da competência, nível e selo por demonstração
    const comp = Object.fromEntries(p.competencias.map(c => [c.codigo, c]));
    assert.ok(comp.cb1.tentativas + comp.cb2.tentativas >= 3 && comp.cc1.tentativas >= 1, 'as respostas do diagnóstico estão no estado das competências');
    assert.ok(comp.cc1.estado !== 'nao_avaliada', 'a C só foi respondida no diagnóstico, e deixou de ser "não avaliada": ' + comp.cc1.estado);
    // B: duas certas em questão nova, sem pista — ao menos uma competência dela foi DEMONSTRADA só pelo diagnóstico
    const demB = ['cb1', 'cb2'].filter(k => ['demonstrada_sem_apoio', 'retida'].includes(comp[k].estado)).length;
    assert.ok(demB >= 1, 'acerto do diagnóstico é demonstração: ' + comp.cb1.estado + ' / ' + comp.cb2.estado);
    assert.deepEqual([jr.selos[1].demonstradas, jr.selos[1].aulas_estudadas], [demB, 0], 'conta para a prata e o ouro de Direito B — sem que nenhuma aula dela esteja estudada');
    assert.ok(jr.nivel.competencias.demonstradas >= 2 + demB, 'e para o nível: ' + JSON.stringify(jr.nivel.competencias));
    // a regra está no MODO da tentativa: o teste final é tratado como o diagnóstico; um simulado, não
    assert.deepEqual(A.MODOS_DE_AFERICAO, ['diagnostico', 'teste_final']);
    const modo = (m) => db.prepare('UPDATE est_tentativas SET modo = ? WHERE id = ?').run(m, diagId);
    try {
      modo('teste_final');
      assert.deepEqual(estudadas(await painel('bia-j')), ['aula-a1', 'aula-a2'], 'teste final também é aferição');
      modo('simulado');
      const comSimulado = [...new Set(['aula-a1', 'aula-a2'].concat(doDiag.map(k => 'aula-' + k.slice(1))))].sort();
      assert.ok(comSimulado.length >= 4 && comSimulado.includes('aula-c1'));
      assert.deepEqual(estudadas(await painel('bia-j')).sort(), comSimulado, 'as mesmas respostas, num simulado, contariam como estudo');
    } finally { modo('diagnostico'); }
    assert.deepEqual(estudadas(await painel('bia-j')), ['aula-a1', 'aula-a2']);
    // um lugar só: ninguém mais consulta as evidências para decidir "estudada"
    const fonte = ler('estudo/aluno.js') + ler('estudo/jornada-estude.js');
    assert.equal((fonte.match(/function aulaEstudada\(|const aulaEstudada =/g) || []).length, 1, 'uma régua só');
    assert.ok(!/competenciasComResposta|new Set\(evs\.map\(e => e\.competencia_codigo\)\)/.test(fonte), 'o atalho antigo (toda evidência conta) saiu de cena');
  });

  // ================= 3. MEDALHAS (as que dependem do diagnóstico da Bia) =================
  await t('medalhas: diagnóstico feito; caderno de erros zerado numa disciplina que JÁ teve erro; primeiro simulado ENVIADO (treino não conta)', async () => {
    const med = async (jar) => Object.fromEntries((await jornada(jar)).medalhas.map(m => [m.id, m]));
    let m = await med('bia-j');
    assert.deepEqual(Object.keys(m), ['diagnostico', 'simulado', 'sequencia', 'erros'], 'sem desafio publicado não há medalha da Largada; audiobook não existe; e a "primeira correção" só existe para quem tem os pedidos pagos (chave geral desligada)');
    assert.deepEqual([m.diagnostico.ok, (await med('leo-j')).diagnostico.ok], [true, false]);
    // B e C têm erro pendente; a A nunca teve erro (não é "zerada": nunca precisou)
    assert.deepEqual([m.erros.ok, m.erros.detalhe], [false, '']);
    const erradaDeB = diagQs[5];
    assert.equal((await responder('bia-j', erradaDeB, 'a')).json.acerto, true);
    m = await med('bia-j');
    assert.deepEqual([m.erros.ok, m.erros.detalhe], [true, 'Direito B'], 'refez e acertou o que tinha errado em B; a C continua pendente');
    // simulado: a Bia já ENVIOU um treino (não conta); simulado aberto também não
    assert.equal(m.simulado.ok, false);
    const s = await req('POST', `${esc()}/tentativas`, { jar: 'bia-j', corpo: { modo: 'simulado', n: 3 } });
    assert.equal(s.st, 200, s.texto);
    assert.equal((await med('bia-j')).simulado.ok, false, 'aberto ainda não é enviado');
    assert.equal((await req('POST', `${esc()}/tentativas/${s.json.id}/enviar`, { jar: 'bia-j' })).st, 200);
    m = await med('bia-j');
    assert.deepEqual([m.simulado.ok, m.simulado.detalhe], [true, '1 simulado enviado']);
  });

  // ================= 1b. TESTE FINAL =================
  await t('teste final: só abre com 70 % das aulas estudadas; usa outras questões quando há; mostra antes × depois; refazer tem intervalo', async () => {
    assert.deepEqual([J.TESTE_FINAL_PCT_AULAS, J.TESTE_FINAL_INTERVALO_DIAS], [70, 14]);
    // o Leo não estudou aula nenhuma: 70 % de 5 aulas = 4
    let r = await req('POST', `${esc()}/diagnostico`, { jar: 'leo-j', corpo: { tipo: 'teste_final' } });
    assert.ok(r.st === 409 && /70 % das aulas: faltam 4 aulas \(0 de 5/.test(r.json.erro), r.texto);
    // a Bia responde algo das duas aulas de B: quatro de cinco. A aula C só foi respondida no DIAGNÓSTICO — não conta
    await responder('bia-j', 9); await responder('bia-j', 12);
    assert.deepEqual((await painel('bia-j')).unidades.filter(u => !u.estudada).map(u => u.codigo), ['aula-c1']);
    assert.equal((await jornada('bia-j')).avaliacao.teste_final.liberado, true, 'quatro de cinco já são 70 %');
    // …e garante as cinco (régua única: respondeu, fora do diagnóstico, algo de cada competência)
    await responder('bia-j', 14);
    const p = await painel('bia-j');
    assert.equal(p.unidades.filter(u => u.estudada).length, 5);
    let f = (await jornada('bia-j')).avaliacao.teste_final;
    assert.deepEqual([f.liberado, f.pct_aulas, f.faltam_aulas, f.feitos, f.pode_refazer], [true, 100, 0, 0, true]);
    r = await req('POST', `${esc()}/diagnostico`, { jar: 'bia-j', corpo: { tipo: 'teste_final' } });
    assert.equal(r.st, 200, r.texto);
    const fin = r.json.questoes.map(q => numQ(q.id)), porD = (lista, d) => lista.filter(n => discDe(n) === d);
    assert.deepEqual([r.json.modo, fin.length, fin.some(n => RESERVADAS.includes(n))], ['teste_final', 8, false]);
    const repetidas = (d) => porD(fin, d).filter(n => diagQs.includes(n)).length;
    assert.deepEqual([repetidas('1.1'), repetidas('1.2'), repetidas('1.3')], [0, 1, 2], 'A tem quatro fora do diagnóstico: nenhuma repete; B só tem duas: a terceira repete; C só tem as mesmas duas');
    // tudo certo desta vez
    await req('PUT', `${esc()}/tentativas/${r.json.id}/respostas`, { jar: 'bia-j', corpo: { respostas: Object.fromEntries(r.json.questoes.map(q => [q.id, 'a'])) } });
    assert.equal((await req('POST', `${esc()}/tentativas/${r.json.id}/enviar`, { jar: 'bia-j' })).st, 200);
    const av = (await jornada('bia-j')).avaliacao;
    assert.deepEqual(av.evolucao.map(x => [x.nome, x.antes.acertos + '/' + x.antes.total, x.depois.acertos + '/' + x.depois.total, x.variacao_pp]),
      [['Direito A', '3/3', '3/3', 0], ['Direito B', '2/3', '3/3', 33], ['Direito C', '0/2', '2/2', 100]], 'lado a lado, por disciplina');
    assert.equal(av.diagnostico.resultado.acertos, 5, 'o diagnóstico de entrada continua sendo o "antes"');
    // refazer: só depois do intervalo
    assert.deepEqual([av.teste_final.feitos, av.teste_final.pode_refazer], [1, false]);
    const de = await req('POST', `${esc()}/diagnostico`, { jar: 'bia-j', corpo: { tipo: 'teste_final' } });
    assert.ok(de.st === 409 && /espere até \d\d\/\d\d\/\d{4} \(intervalo de 14 dias\)/.test(de.json.erro), de.texto);
    db.prepare('UPDATE est_tentativas SET enviado_em = ? WHERE id = ?').run(diasAtras(J.TESTE_FINAL_INTERVALO_DIAS + 1), r.json.id);
    assert.equal((await jornada('bia-j')).avaliacao.teste_final.pode_refazer, true);
    const de2 = await req('POST', `${esc()}/diagnostico`, { jar: 'bia-j', corpo: { tipo: 'teste_final' } });
    assert.ok(de2.st === 200 && de2.json.id !== r.json.id, 'passado o intervalo, um novo teste final: ' + de2.texto);
    assert.equal((await jornada('bia-j')).avaliacao.teste_final.aberto.id, de2.json.id);
    // diagnóstico que venceu sem envio vale pelo que foi salvo (e passa a contar como feito)
    const venc = await req('POST', `${esc()}/diagnostico`, { jar: 'dan-j', corpo: {} });
    await req('PUT', `${esc()}/tentativas/${venc.json.id}/respostas`, { jar: 'dan-j', corpo: { respostas: { [venc.json.questoes[0].id]: 'a' } } });
    db.prepare('UPDATE est_tentativas SET prazo_em = ? WHERE id = ?').run(diasAtras(1), venc.json.id);
    const dv = (await jornada('dan-j')).avaliacao.diagnostico;
    assert.deepEqual([dv.feito, dv.aberto, dv.resultado.estado, dv.resultado.acertos, dv.resultado.respondidas], [true, null, 'expirada', 1, 1]);
    // (o Dan começa os testes de nível do zero: as evidências deste diagnóstico saem)
    db.prepare('DELETE FROM est_evidencias WHERE user_id = ?').run(uid(DAN.email));
    db.prepare('DELETE FROM est_revisoes WHERE user_id = ?').run(uid(DAN.email));
  });

  // ================= 2. NÍVEL =================
  await t('nível: os nomes dos outros cursos, a escada do domínio — quem só abre aula, vê vídeo ou acerta com pista fica em Explorador', async () => {
    assert.deepEqual(J.NIVEIS.map(n => [n.n, n.nome, n.demonstradas_pct, n.retidas_pct]),
      [[1, 'Explorador', 0, 0], [2, 'Praticante', 10, 0], [3, 'Criador', 35, 0], [4, 'Especialista', 65, 0], [5, 'Mestre', 90, 50]]);
    assert.deepEqual(J.NIVEIS.map(n => n.nome), require('../jornada').NIVEIS_XP.map(n => n.nome), 'os MESMOS nomes da jornada dos outros cursos');
    // o Leo abre todas as aulas e "assiste" a uma videoaula inteira
    for (const a of ['aula-a1', 'aula-a2', 'aula-b1', 'aula-b2', 'aula-c1']) assert.equal((await req('GET', `${esc()}/unidades/${a}?aberta=1`, { jar: 'leo-j' })).st, 200);
    db.prepare("UPDATE est_unidades SET video_media_id = 'video-jornada', video_duracao_seg = 100 WHERE codigo = 'aula-a1' AND escopo_id = ?").run(eid());
    assert.equal((await req('PUT', `${esc()}/unidades/aula-a1/video`, { jar: 'leo-j', corpo: { posicao_seg: 95 } })).json.assistido, true);
    let nv = (await jornada('leo-j')).nivel;
    assert.deepEqual([nv.n, nv.nome, nv.de, nv.competencias.total, nv.competencias.demonstradas, nv.competencias.nao_avaliadas], [1, 'Explorador', 5, 5, 0, 5], 'abrir aula e ver vídeo não são evidência');
    assert.ok(/^Para chegar a Praticante: demonstre mais 1 competência \(acerte, sem pista, uma questão que você ainda não viu/.test(nv.proximo.texto), nv.proximo.texto);
    assert.deepEqual([nv.proximo.demonstrar, nv.proximo.reter], [1, 0]);
    // acerto COM pista: "acertou com apoio" — ainda não é domínio
    assert.equal((await req('POST', `${esc()}/questoes/${idQ(4)}/pista`, { jar: 'leo-j' })).st, 200);
    assert.equal((await responder('leo-j', 4)).json.conta_como, 'prática com apoio');
    nv = (await jornada('leo-j')).nivel;
    assert.deepEqual([nv.n, nv.nome, nv.competencias.demonstradas, nv.competencias.com_apoio], [1, 'Explorador', 0, 1], 'acerto com pista não sobe o nível');
    assert.equal((await painel('leo-j')).jornada.nivel.nome, 'Explorador');
    // percurso sem competência nenhuma: Explorador, sem "próximo" inventado
    const vazio = J.nivelDe({ escopo: { id: 'nao-existe' }, situacoes: ['disponivel'] }, []);
    assert.deepEqual([vazio.n, vazio.proximo, vazio.competencias.total], [1, null, 0]);
  });

  await t('nível: sobe SÓ com competência demonstrada (questão nova, sem pista), pede retenção para o topo — e desce quando a demonstração cai', async () => {
    const nivel = async () => { const nv = (await jornada('dan-j')).nivel; return [nv.n, nv.nome, nv.competencias.demonstradas, nv.competencias.retidas]; };
    assert.deepEqual(await nivel(), [1, 'Explorador', 0, 0]);
    // pisos com 5 competências: Praticante 1 (10 %), Criador 2 (35 %), Especialista 4 (65 %), Mestre 5 (90 %) + 3 retidas (50 %)
    assert.deepEqual((await jornada('dan-j')).nivel.escada.map(e => [e.demonstradas, e.retidas]), [[0, 0], [1, 0], [2, 0], [4, 0], [5, 3]]);
    assert.equal((await responder('dan-j', 2)).json.conta_como, 'demonstração sem apoio');
    assert.deepEqual(await nivel(), [2, 'Praticante', 1, 0]);
    // selo da disciplina A neste ponto: uma aula de duas, uma competência de duas — ainda sem selo, e diz o que falta
    let sA = (await jornada('dan-j')).selos[0];
    assert.deepEqual([sA.nome, sA.grau, sA.aulas_estudadas, sA.aulas, sA.demonstradas, sA.competencias], ['Direito A', '', 1, 2, 1, 2]);
    assert.ok(/^Bronze: estude mais 1 aula — ou vá direto à prata, demonstrando mais 1 competência\.$/.test(sA.falta), sA.falta);
    // repetir a MESMA questão não é nova demonstração
    await responder('dan-j', 2);
    assert.deepEqual(await nivel(), [2, 'Praticante', 1, 0]);
    await responder('dan-j', 6); assert.deepEqual(await nivel(), [3, 'Criador', 2, 0]);
    await responder('dan-j', 10); assert.deepEqual(await nivel(), [3, 'Criador', 3, 0], '60 % ainda não é Especialista (65 %)');
    await responder('dan-j', 13); assert.deepEqual(await nivel(), [4, 'Especialista', 4, 0]);
    await responder('dan-j', 14); assert.deepEqual(await nivel(), [4, 'Especialista', 5, 0], 'tudo demonstrado, mas o topo pede retenção');
    let px = (await jornada('dan-j')).nivel.proximo;
    assert.deepEqual([px.nome, px.demonstrar, px.reter], ['Mestre', 0, 3]);
    assert.ok(/^Para chegar a Mestre: confirme a retenção de mais 3 competências \(acerte outra questão nova dela 7 dias depois ou mais\)\.$/.test(px.texto), px.texto);
    // oito dias depois, outra questão NOVA de três competências: retenção confirmada
    db.prepare('UPDATE est_evidencias SET criado_em = ? WHERE user_id = ?').run(diasAtras(8), uid(DAN.email));
    await responder('dan-j', 3); await responder('dan-j', 7);
    assert.deepEqual(await nivel(), [4, 'Especialista', 5, 2]);
    await responder('dan-j', 11);
    assert.deepEqual(await nivel(), [5, 'Mestre', 5, 3]);
    const topo = await jornada('dan-j');
    assert.equal(topo.nivel.proximo, null);
    assert.deepEqual(topo.selos.map(s => [s.nome, s.grau]), [['Direito A', 'ouro'], ['Direito B', 'ouro'], ['Direito C', 'ouro']]);
    // um erro sem apoio em questão nova reabre a competência: 4 de 5 = 80 % → volta a Especialista; a disciplina B cai para bronze
    assert.equal((await responder('dan-j', 12, 'b')).json.acerto, false);
    assert.deepEqual(await nivel(), [4, 'Especialista', 4, 3]);
    const sB = (await jornada('dan-j')).selos[1];
    assert.deepEqual([sB.grau, sB.aulas_estudadas, sB.aulas, sB.demonstradas, sB.demonstradas_pct], ['bronze', 2, 2, 1, 50], 'todas as aulas estudadas, metade demonstrada');
    assert.ok(/^Prata: demonstre mais 1 competência\.$/.test(sB.falta), sB.falta);
  });

  // ================= 2b. SELOS =================
  await t('selos por disciplina: bronze = todas as aulas estudadas; prata = 70 % demonstradas; ouro = todas — vale o grau mais alto', async () => {
    assert.deepEqual([J.SELO_PRATA_PCT, J.SELO_OURO_PCT, J.GRAUS], [70, 100, ['bronze', 'prata', 'ouro']]);
    const comps = Array.from({ length: 10 }, (_, i) => 'k' + i);
    const disc = { codigo: '9.9', nome: 'Disciplina de dez', competencias: comps, aulas: comps.map(k => ({ competencias: [k] })) };
    const est = (n, estado = 'demonstrada_sem_apoio') => comps.map((k, i) => ({ codigo: k, estado: i < n ? estado : 'nao_avaliada' }));
    // a régua de `aulaEstudada`: quem respondeu o quê; todas as competências têm questão (leitura não entra na conta)
    const regua = (respondidas) => ({ comResposta: new Set(respondidas), comMeio: new Set(comps), aulas: new Map() });
    const selo = (n, estudadas, estado) => J.selos([disc], est(n, estado), regua(comps.slice(0, estudadas)))[0];
    assert.deepEqual([selo(0, 0).grau, selo(0, 9).grau, selo(0, 10).grau], ['', '', 'bronze'], 'bronze só com TODAS as aulas estudadas');
    assert.deepEqual([selo(6, 10).grau, selo(7, 10).grau, selo(7, 7).grau, selo(9, 10).grau, selo(10, 10).grau], ['bronze', 'prata', 'prata', 'prata', 'ouro'], '6 de 10 não é prata; 7 é; 10 é ouro');
    assert.equal(selo(10, 10, 'demonstrada_com_apoio').grau, 'bronze', 'acerto com apoio não dá prata nem ouro');
    assert.equal(selo(8, 10, 'retida').grau, 'prata', 'retida também é demonstrada');
    assert.deepEqual([selo(7, 10).falta, selo(10, 10).falta], ['Ouro: demonstre mais 3 competências.', '']);
    assert.equal(J.selos([{ codigo: 'x', nome: 'Sem competência', competencias: [], aulas: [] }], [], regua([]))[0].grau, '');
    // o Leo, que só abriu aulas e acertou uma com pista: nenhum selo (a aula A1 conta como estudada, a A2 não)
    assert.deepEqual((await jornada('leo-j')).selos.map(s => [s.grau, s.aulas_estudadas, s.demonstradas]), [['', 1, 0], ['', 0, 0], ['', 0, 0]]);
    assert.deepEqual((await jornada('bia-j')).selos.map(s => s.nome), ['Direito A', 'Direito B', 'Direito C'], 'um selo por disciplina do edital, na ordem do edital');
  });

  // ================= 3b. MEDALHAS (as demais) =================
  await t('medalhas: sequência de dias derivada das datas das evidências (dia de Brasília); Largada pelos check-ins; primeira correção pedida', async () => {
    assert.equal(J.MEDALHA_SEQUENCIA_DIAS, 7);
    // puro: 02:30Z ainda é o dia anterior em Brasília; buraco de um dia zera a corrida
    const evs = ['2026-01-01T12:00:00Z', '2026-01-02T02:30:00Z', '2026-01-03T02:59:00Z', '2026-01-03T15:00:00Z', '2026-01-06T15:00:00Z', '2026-01-07T15:00:00Z'].map(c => ({ criado_em: c }));
    assert.deepEqual(J.sequencias(evs, '2026-01-07'), { dias_com_estudo: 5, maior: 3, atual: 2, ultimo_dia: '2026-01-07' }, '01, 02 e 03 seguidos; depois 06 e 07');
    assert.equal(J.sequencias(evs, '2026-01-08').atual, 2, 'ontem ainda segura a sequência');
    assert.equal(J.sequencias(evs, '2026-01-09').atual, 0, 'dois dias sem estudar: a sequência em andamento acabou (a maior continua)');
    assert.deepEqual(J.sequencias([], '2026-01-09'), { dias_com_estudo: 0, maior: 0, atual: 0, ultimo_dia: '' });
    // no banco: o Dan tem evidências em dois dias (oito dias atrás e hoje) — sequência de 1
    const med = async (jar) => Object.fromEntries((await jornada(jar)).medalhas.map(m => [m.id, m]));
    let m = await med('dan-j');
    assert.deepEqual([m.sequencia.ok, (await jornada('dan-j')).sequencia.maior], [false, 1]);
    // arranja sete evidências dele em sete dias seguidos, terminando ontem
    const linhas = db.prepare('SELECT id FROM est_evidencias WHERE user_id = ? ORDER BY criado_em, id').all(uid(DAN.email));
    assert.ok(linhas.length >= 9);
    const hojeMeioDia = Date.parse(A.hojeBR() + 'T15:00:00Z'); // 12h em Brasília
    linhas.slice(0, 6).forEach((l, i) => db.prepare('UPDATE est_evidencias SET criado_em = ? WHERE id = ?').run(new Date(hojeMeioDia - (6 - i) * 864e5).toISOString(), l.id));
    m = await med('dan-j');
    assert.equal(m.sequencia.ok, true, 'seis dias arranjados + hoje = sete seguidos: ' + m.sequencia.detalhe);
    assert.ok(/maior sequência: 7 dias · em andamento: 7 dias/.test(m.sequencia.detalhe), m.sequencia.detalhe);
    db.prepare('UPDATE est_evidencias SET criado_em = ? WHERE id = ?').run(new Date(hojeMeioDia - 20 * 864e5).toISOString(), linhas[2].id);
    assert.equal((await med('dan-j')).sequencia.ok, false, 'tirou um dia do meio: a maior sequência volta a ser menor que sete');
    // Largada: só existe com o desafio do curso PUBLICADO; conclui com todos os dias marcados
    let r = await chave('POST', '/staff/api/academy/jornada/importar', E({ desafio: { titulo: 'Largada de 7 dias', dias: [1, 2, 3, 4, 5, 6, 7].map(n => ({ titulo: `Dia ${n}`, tarefa: `Faça a tarefa de estudo do dia ${n} com calma.` })) } }));
    assert.equal(r.st, 200, r.texto);
    assert.ok(!('largada' in (await med('bia-j'))), 'desafio em rascunho: a medalha ainda não existe para a aluna');
    r = await chave('POST', '/staff/api/academy/jornada/status', E({ todas: 'publicado' }));
    assert.equal(r.st, 200, r.texto);
    m = await med('bia-j');
    assert.deepEqual([m.largada.nome, m.largada.ok, m.largada.detalhe], ['Largada de 7 dias', false, '0 de 7 dias']);
    const check = db.prepare('INSERT INTO desafio_checkins (user_id, product_id, dia, nota, criado_em) VALUES (?, ?, ?, ?, ?)');
    for (let d = 1; d <= 6; d++) check.run(uid(BIA.email), pid, d, '', nowISO());
    assert.equal((await med('bia-j')).largada.ok, false, 'seis de sete ainda não');
    check.run(uid(BIA.email), pid, 7, '', nowISO());
    m = await med('bia-j');
    assert.deepEqual([m.largada.ok, m.largada.detalhe, (await med('leo-j')).largada.ok], [true, '7 de 7 dias', false]);
    // primeira correção: a medalha só EXISTE para quem tem os pedidos pagos (chave geral) — aqui, a Bia entra na lista de liberados
    assert.ok(!('correcao' in m), 'com os pedidos desligados, nada aponta para a aba que não existe');
    const pedidos = require('./pedidos');
    pedidos.salvarConfigPedidos({ liberar: BIA.email }, { admin: false });
    m = await med('bia-j');
    assert.ok(!('correcao' in (await med('leo-j'))), 'só ela foi liberada');
    // orçamento não conta; pedido confirmado (processando/pronto), sim
    assert.equal(m.correcao.ok, false);
    const idPed = novoId();
    db.prepare("INSERT INTO est_pedidos (id, user_id, product_id, escopo_id, tipo, estado, questao_id, entrada, criado_em, atualizado_em) VALUES (?, ?, ?, ?, 'correcao', 'orcado', 'q-disc', '{}', ?, ?)").run(idPed, uid(BIA.email), pid, eid(), nowISO(), nowISO());
    assert.equal((await med('bia-j')).correcao.ok, false, 'só orçado não é pedido feito');
    db.prepare("UPDATE est_pedidos SET estado = 'pronto' WHERE id = ?").run(idPed);
    m = await med('bia-j');
    assert.deepEqual([m.correcao.ok, m.correcao.detalhe], [true, '1 correção pedida']);
    db.prepare("UPDATE est_pedidos SET tipo = 'prova' WHERE id = ?").run(idPed);
    assert.equal((await med('bia-j')).correcao.ok, false, 'importar prova não é correção de escrita nem oral');
    db.prepare("UPDATE est_pedidos SET tipo = 'oral' WHERE id = ?").run(idPed);
    assert.equal((await med('bia-j')).correcao.ok, true);
    assert.deepEqual(Object.keys(m), ['diagnostico', 'simulado', 'sequencia', 'erros', 'largada', 'correcao'], 'seis marcos; audiobook não entra');
    db.prepare('DELETE FROM est_pedidos WHERE id = ?').run(idPed); // os testes dos pedidos pagos contam pedidos do zero
    db.prepare("DELETE FROM platform_settings WHERE chave = 'estudo_pedidos'").run(); // …e partem da chave geral como ela nasce: sem registro
    // nada disso está gravado como "conquista": não há tabela nova
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'table' AND (name LIKE '%medalha%' OR name LIKE '%selo%' OR name LIKE '%nivel%' OR name LIKE '%conquista%')").get().n, 0);
  });

  // ================= 4. CALCULADORA DE PONTUAÇÃO =================
  await t('calculadora: é o motor de sempre (pontuacao.corrigir) — bate no mínimo por bloco, no mínimo geral e no desconto, e diz quantos acertos faltam', async () => {
    // conta feita à mão, na regra do curso: 0,1 por acerto; mínimos 1,2 · 0,9 · 0,9; geral 6,0
    let r = calc.calcular(REGRA, [{ bloco: 'I', questoes: 40, acertos: 12 }, { bloco: 'II', questoes: 30, acertos: 9 }, { bloco: 'III', questoes: 30, acertos: 30 }]);
    assert.deepEqual([r.nota_liquida, r.maximo, r.pct_liquido, r.aprovado], [5.1, 10, 51, false], '51 acertos = 5,1 pontos');
    assert.deepEqual(r.blocos.map(b => [b.bloco, b.pontos, b.minimo.atendido, b.faltam_acertos]), [['I', 1.2, true, 0], ['II', 0.9, true, 0], ['III', 3, true, 0]], 'na borda exata: 12 × 0,1 = 1,2 e 9 × 0,1 = 0,9 ATINGEM');
    assert.deepEqual([r.geral.min_pontos, r.geral.faltam_acertos, r.geral.possivel], [6, 9, true], 'faltam 9 acertos para 60');
    // o mesmo caso, direto no motor: nada diverge
    const direto = (blocos, regra) => { const itens = [], resp = {}; for (const b of blocos) for (let k = 0; k < b.questoes; k++) { const id = b.bloco + ':' + k; itens.push({ id, gabarito: 'x', bloco: b.bloco }); if (k < b.acertos) resp[id] = 'x'; else if (k < b.acertos + (b.erros || 0)) resp[id] = 'y'; } return pontuacao.corrigir(itens, resp, regra); };
    const mesma = (blocos, regra) => { const a = calc.calcular(regra, blocos), b = direto(blocos, regra); assert.deepEqual([a.nota_bruta, a.descontados, a.nota_liquida, a.maximo, a.pct_liquido, a.aprovado, a.blocos.map(x => x.minimo && x.minimo.atendido)], [b.nota_bruta, b.descontados, b.nota_liquida, b.maximo, b.pct_liquido, b.aprovado, b.por_bloco.map(x => { const m = b.minimos.find(y => y.bloco === x.bloco); return m ? m.atendido : null; })]); return a; };
    mesma([{ bloco: 'I', questoes: 40, acertos: 12 }, { bloco: 'II', questoes: 30, acertos: 9 }, { bloco: 'III', questoes: 30, acertos: 30 }], REGRA);
    // um a menos que o mínimo do bloco: falta 1; e 60 acertos com um bloco abaixo do mínimo NÃO atinge
    r = mesma([{ bloco: 'I', questoes: 40, acertos: 11 }, { bloco: 'II', questoes: 30, acertos: 8 }, { bloco: 'III', questoes: 30, acertos: 30 }], REGRA);
    assert.deepEqual(r.blocos.map(b => [b.minimo.atendido, b.faltam_acertos]), [[false, 1], [false, 1], [true, 0]]);
    r = mesma([{ bloco: 'I', questoes: 40, acertos: 40 }, { bloco: 'II', questoes: 30, acertos: 8 }, { bloco: 'III', questoes: 30, acertos: 12 }], REGRA);
    assert.deepEqual([r.nota_liquida, r.geral.faltam_acertos, r.aprovado, r.blocos[1].faltam_acertos], [6, 0, false, 1], 'o mínimo geral foi atingido, o do bloco II não');
    r = mesma([{ bloco: 'I', questoes: 40, acertos: 40 }, { bloco: 'II', questoes: 30, acertos: 9 }, { bloco: 'III', questoes: 30, acertos: 11 }], REGRA);
    assert.equal(r.aprovado, true, '60 acertos com todos os mínimos');
    // bloco menor que o mínimo: não alcança nem acertando tudo — dito, não escondido
    r = calc.calcular(REGRA, [{ bloco: 'I', questoes: 10, acertos: 2 }]);
    assert.deepEqual([r.blocos[0].possivel, r.blocos[0].faltam_acertos, r.geral.possivel, r.minimos_sem_bloco], [false, 8, false, ['II', 'III']]);
    // DESCONTO (à mão): 20 questões, cada 3 erros anulam 1 certa, em branco conta como erro, mínimo de 50 %
    const DESC = { desconto: { a_cada: 3 }, em_branco_conta_erro: true, aprovacao: { min_pct: 50 }, fonte: 'Regulamento de teste' };
    r = mesma([{ bloco: '', questoes: 20, acertos: 12, erros: 6 }], DESC);
    assert.deepEqual([r.nota_bruta, r.erros_contados, r.descontados, r.nota_liquida, r.pct_liquido, r.aprovado, r.geral.faltam_acertos], [12, 8, 2, 10, 50, true, 0], '12 − ⌊8/3⌋ = 10 = 50 %');
    r = mesma([{ bloco: '', questoes: 20, acertos: 11, erros: 7 }], DESC);
    assert.deepEqual([r.nota_liquida, r.aprovado, r.geral.faltam_acertos], [8, false, 1], '11 − ⌊9/3⌋ = 8; com mais um acerto no lugar de um erro: 12 − 2 = 10');
    // sem a regra em branco-conta-erro, as em branco não descontam
    r = mesma([{ bloco: '', questoes: 20, acertos: 11, erros: 7 }], { ...DESC, em_branco_conta_erro: false });
    assert.deepEqual([r.erros_contados, r.nota_liquida], [7, 9]);
    // percurso SEM regra: os números do aluno viram a mesma regra, com a fonte dizendo de quem são
    const inf = calc.regraInformada({ blocos: [{ bloco: 'I', minimo: 12 }, { bloco: 'II', minimo: 9 }], minimo_geral: 30, desconto_a_cada: 0 });
    assert.ok(/informados por você \(não são os do edital\)/.test(inf.fonte));
    r = mesma([{ bloco: 'I', questoes: 40, acertos: 20 }, { bloco: 'II', questoes: 30, acertos: 8 }], inf);
    assert.deepEqual([r.nota_liquida, r.aprovado, r.blocos.map(b => b.faltam_acertos), r.geral.faltam_acertos], [28, false, [0, 1], 2]);
    assert.equal(calc.calcular(calc.regraInformada({}), [{ bloco: '', questoes: 10, acertos: 7 }]).aprovado, null, 'sem mínimo informado, não se inventa "atinge" ou "não atinge"');
    // entrada incoerente é recusada
    assert.throws(() => calc.calcular(REGRA, [{ bloco: 'I', questoes: 10, acertos: 8, erros: 5 }]), /somam mais que as 10 questões/);
    assert.throws(() => calc.calcular(REGRA, []), /ao menos um bloco/);
    assert.throws(() => calc.calcular(REGRA, [{ bloco: 'I', questoes: 5, acertos: 1 }, { bloco: 'I', questoes: 5, acertos: 1 }]), /dois blocos/);
    // a calculadora não tem conta própria de nota
    const fonte = ler('estudo/calculadora.js');
    assert.ok(/pontuacao\.corrigir\(/.test(fonte) && !/valor_certa \*|Math\.floor\(|erros \/ /.test(fonte), 'quem calcula é o pontuacao.js');
  });

  await t('pontuação: soma de 0,1 por acerto não cai abaixo do mínimo por ruído de ponto flutuante (9 × 0,1 atinge 0,9)', async () => {
    const itens = Array.from({ length: 30 }, (_, k) => ({ id: 'q' + k, gabarito: 'a', bloco: 'II' })), resp = Object.fromEntries(itens.slice(0, 9).map(i => [i.id, 'a']));
    const r = pontuacao.corrigir(itens, resp, { valor_certa: 0.1, minimos: [{ bloco: 'II', min_pontos: 0.9 }], fonte: 'teste' });
    assert.deepEqual([r.nota_liquida, r.minimos[0].obtido_pontos, r.minimos[0].atendido, r.maximo], [0.9, 0.9, true, 3]);
    const s = pontuacao.corrigir(Array.from({ length: 100 }, (_, k) => ({ id: 'z' + k, gabarito: 'a' })), Object.fromEntries(Array.from({ length: 60 }, (_, k) => ['z' + k, 'a'])), { valor_certa: 0.1, aprovacao: { min_pontos: 6 }, fonte: 'teste' });
    assert.deepEqual([s.nota_liquida, s.aprovado], [6, true]);
  });

  // ================= 5. CONTADOR DE PRAZO =================
  await t('prazo: feriados nacionais fixos em lista explícita; Carnaval, Sexta-feira Santa e Corpus Christi CALCULADOS da Páscoa (anos conhecidos)', async () => {
    assert.deepEqual(prazo.FERIADOS_FIXOS.map(([m, d, nome]) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} ${nome}`), [
      '01/01 Confraternização Universal', '21/04 Tiradentes', '01/05 Dia do Trabalho', '07/09 Independência do Brasil', '12/10 Nossa Senhora Aparecida',
      '02/11 Finados', '15/11 Proclamação da República', '20/11 Dia Nacional de Zumbi e da Consciência Negra', '25/12 Natal']);
    // domingos de Páscoa conhecidos
    assert.deepEqual([2000, 2011, 2019, 2024, 2025, 2026, 2027, 2038].map(prazo.pascoa), ['2000-04-23', '2011-04-24', '2019-04-21', '2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28', '2038-04-25']);
    const moveis = (ano) => Object.fromEntries(prazo.feriadosDoAno(ano).filter(f => f.movel).map(f => [f.nome, f.data]));
    assert.deepEqual(moveis(2024), { 'Carnaval (segunda-feira)': '2024-02-12', 'Carnaval (terça-feira)': '2024-02-13', 'Sexta-feira Santa': '2024-03-29', 'Corpus Christi': '2024-05-30' });
    assert.deepEqual(moveis(2025), { 'Carnaval (segunda-feira)': '2025-03-03', 'Carnaval (terça-feira)': '2025-03-04', 'Sexta-feira Santa': '2025-04-18', 'Corpus Christi': '2025-06-19' });
    assert.deepEqual(moveis(2026), { 'Carnaval (segunda-feira)': '2026-02-16', 'Carnaval (terça-feira)': '2026-02-17', 'Sexta-feira Santa': '2026-04-03', 'Corpus Christi': '2026-06-04' });
    // sem os pontos facultativos, fica só a Sexta-feira Santa entre os móveis
    assert.deepEqual(prazo.feriadosDoAno(2026, { facultativos: false }).filter(f => f.movel).map(f => f.nome), ['Sexta-feira Santa']);
    assert.deepEqual([prazo.feriadosDoAno(2023).some(f => f.data === '2023-11-20'), prazo.feriadosDoAno(2024).some(f => f.data === '2024-11-20')], [false, true], '20/11 só é feriado nacional a partir de 2024');
    assert.equal(prazo.feriadosDoAno(2026).length, 13);
    // nenhuma data móvel está digitada no arquivo: só os deslocamentos em relação à Páscoa
    const fonte = ler('estudo/prazo.js');
    assert.ok(/\[-48, 'Carnaval \(segunda-feira\)', true\]/.test(fonte) && /\[-2, 'Sexta-feira Santa', false\]/.test(fonte) && /\[60, 'Corpus Christi', true\]/.test(fonte) && !/20\d\d-\d\d-\d\d/.test(fonte));
    assert.ok(!/\bart\.|artigo|CPC|CLT|Lei n|\d\.\d{3}\/\d{4}/.test(fonte), 'o contador não cita lei nem diz qual prazo se aplica');
  });

  await t('prazo: dias úteis e corridos — exclui o dia do começo, inclui o do vencimento, pula feriado, prorroga para o primeiro dia útil, passo a passo', async () => {
    const v = (o) => { const r = prazo.contar(o); return r.vencimento + (r.prorrogado ? ' (prorrogado)' : ''); };
    // (calendário de 2026: 05/10 é segunda; 12/10, feriado, é segunda; 21/04, feriado, é terça; 03/04 é a Sexta-feira Santa)
    assert.equal(v({ inicio: '2026-10-05', dias: 1 }), '2026-10-06', 'o dia do começo não conta: 1 dia útil a partir de segunda vence na terça');
    assert.equal(v({ inicio: '2026-10-05', dias: 3 }), '2026-10-08');
    assert.equal(v({ inicio: '2026-04-01', dias: 5 }), '2026-04-09', 'quarta 01/04 + 5 úteis: pula a Sexta-feira Santa (calculada) e o fim de semana');
    assert.equal(v({ inicio: '2026-04-17', dias: 2 }), '2026-04-22', 'sexta 17/04 + 2 úteis: fim de semana, segunda conta, Tiradentes não, quarta vence');
    assert.equal(v({ inicio: '2026-02-13', dias: 1 }), '2026-02-18', 'Carnaval (segunda e terça) sem expediente');
    assert.equal(v({ inicio: '2026-02-13', dias: 1, facultativos: false }), '2026-02-16', 'com o ponto facultativo desligado, a segunda de Carnaval conta');
    // corridos: conta tudo; se o último dia cai em dia sem expediente, prorroga
    assert.equal(v({ inicio: '2026-10-05', dias: 3, modo: 'corridos' }), '2026-10-08');
    assert.equal(v({ inicio: '2026-10-05', dias: 5, modo: 'corridos' }), '2026-10-13 (prorrogado)', 'cai no sábado 10/10; domingo; segunda 12/10 é feriado; vence terça 13/10');
    assert.equal(v({ inicio: '2026-12-22', dias: 3, modo: 'corridos' }), '2026-12-28 (prorrogado)', 'cai no Natal (sexta); vence na segunda');
    assert.equal(v({ inicio: '2026-10-09', dias: 5, modo: 'corridos' }), '2026-10-14', 'sexta + 5 corridos = quarta');
    assert.equal(v({ inicio: '2026-10-09', dias: 5, modo: 'corridos', comeco_em_dia_util: true }), '2026-10-19 (prorrogado)', 'começando a contar só na terça 13/10: 13 a 17 (sábado) → segunda 19');
    // feriado local e recesso informados pelo aluno
    assert.equal(v({ inicio: '2026-10-05', dias: 3, extras: ['2026-10-07'] }), '2026-10-09');
    const lidas = prazo.lerDatas('20/12/2026 a 06/01/2027 - recesso\n08/12/2026\n2026-11-30 - feriado local\nisto não é data\n31/02/2026');
    assert.deepEqual([lidas.datas.length, lidas.datas[0], lidas.datas[17], lidas.datas[18], lidas.datas[19], lidas.ignoradas], [20, { data: '2026-12-20', nome: 'recesso' }, { data: '2027-01-06', nome: 'recesso' }, { data: '2026-12-08', nome: 'informado por você' }, { data: '2026-11-30', nome: 'feriado local' }, ['isto não é data', '31/02/2026']]);
    const rec = prazo.contar({ inicio: '2026-12-17', dias: 5, extras: lidas.datas });
    // quinta 17/12 + 5 úteis, com recesso de 20/12 a 06/01: conta 18/12; depois só 07/01 (quinta), 08/01, 11/01 e 12/01
    assert.equal(rec.vencimento, '2027-01-12');
    assert.deepEqual(rec.passos.filter(p => p.conta).map(p => p.data), ['2026-12-18', '2027-01-07', '2027-01-08', '2027-01-11', '2027-01-12']);
    assert.ok(rec.passos.some(p => p.data === '2026-12-23' && !p.conta && p.motivo === 'sem expediente: recesso'), 'o dia de recesso aparece no passo a passo, com o nome que o aluno deu');
    // passo a passo: o dia do começo aparece e não conta; cada dia contado tem o seu número; o pulado tem o motivo
    const r = prazo.contar({ inicio: '2026-04-01', dias: 5 });
    assert.deepEqual(r.passos.map(p => [p.data.slice(8), p.conta ? p.n : 0]), [['01', 0], ['02', 1], ['03', 0], ['04', 0], ['05', 0], ['06', 2], ['07', 3], ['08', 4], ['09', 5]]);
    assert.deepEqual([r.passos[0].motivo, r.passos[2].motivo, r.passos[3].motivo, r.passos[4].motivo, r.semana, r.contados], ['dia do começo: não entra na contagem', 'feriado: Sexta-feira Santa', 'sábado', 'domingo', 'quinta-feira', 5]);
    assert.deepEqual(r.feriados, [{ data: '2026-04-03', nome: 'Sexta-feira Santa' }]);
    const pr = prazo.contar({ inicio: '2026-12-22', dias: 3, modo: 'corridos' });
    assert.deepEqual(pr.passos.slice(-4).map(p => [p.data, p.conta, p.motivo]), [['2026-12-25', true, 'feriado: Natal — o último dia caiu em dia sem expediente: prorroga'], ['2026-12-26', false, 'sábado — prorroga'], ['2026-12-27', false, 'domingo — prorroga'], ['2026-12-28', false, 'primeiro dia útil seguinte: vencimento']]);
    assert.equal(pr.ultimo_dia_contado, '2026-12-25');
    for (const ruim of [{ dias: 5 }, { inicio: '2026-02-30', dias: 5 }, { inicio: '2026-10-05', dias: 0 }, { inicio: '2026-10-05', dias: 99999 }, { inicio: '2026-10-05', dias: 5, modo: 'lunares' }]) assert.throws(() => prazo.contar(ruim));
  });

  // ================= 6. CRONOGRAMA =================
  await t('cronograma: é o motor do Plano em visão de calendário — cabe/não cabe, respeita as horas declaradas, reserva revisão e simulado, sugere o nível', async () => {
    assert.deepEqual([crono.REVISAO_PCT, crono.SIMULADO_PCT, crono.REVISAO_PCT === plano.REVISAO_PADRAO_PCT], [20, 10, true]);
    const aulas = (n, min) => Array.from({ length: n }, (_, i) => ({ codigo: 'au' + i, titulo: 'Aula ' + i, disciplina: i < n / 2 ? '1.1' : '1.2', disciplina_nome: i < n / 2 ? 'Direito A' : 'Direito B', tempo_min: min }));
    const base = { hoje: '2026-03-02', data_alvo: '2026-06-01', disponibilidade: { seg: 120, ter: 120, qua: 120, qui: 120, sex: 120 }, margem_pct: 15, vespera_dias: 5, revisao_geral_dias: 15, foco: 'objetiva' };
    // CABE: 6 aulas de 1 h em 13 semanas de 10 h
    let r = crono.montar({ ...base, aulas: aulas(6, 60) });
    assert.deepEqual([r.cabe, r.aviso, r.esforco_min, r.alocado_min, r.faltam_min, r.pendentes, r.nivel, r.sugestao_nivel], [true, '', 360, 360, 0, [], 100, null]);
    assert.ok(r.conclusao_estimada >= '2026-03-02' && r.conclusao_estimada < '2026-03-20', 'termina nas primeiras semanas: ' + r.conclusao_estimada);
    assert.deepEqual([r.semanas[0].inicio, r.semanas[0].fim], ['2026-03-02', '2026-03-08'], 'semana de segunda a domingo');
    // nunca cria hora: em cada dia, estudo + retomadas + simulado ≤ o tempo declarado menos a margem; e só nos dias declarados
    const dias = r.semanas.flatMap(s => s.dias);
    for (const d of dias) {
      const usado = d.blocos.reduce((n, b) => n + b.minutos, 0) + d.revisao_min + d.simulado_min, semana = new Date(d.data + 'T00:00:00Z').getUTCDay();
      // (na véspera o Plano usa o dia declarado inteiro para revisão; nos outros dias, o dia menos a margem de 15 %)
      assert.ok(d.minutos === 120 && usado <= (d.fase === 'vespera' ? 120 : Math.floor(120 * 0.85)) && semana >= 1 && semana <= 5 && d.data >= '2026-03-02' && d.data < '2026-06-01', JSON.stringify(d));
    }
    // dia comum de estudo: 102 min úteis → 30 % reservados (30 min) = 20 de retomadas + 10 de simulado; o resto é aula
    assert.deepEqual([dias[0].blocos.reduce((n, b) => n + b.minutos, 0), dias[0].revisao_min, dias[0].simulado_min], [72, 20, 10]);
    assert.deepEqual([r.semanas[0].estudo_min, r.semanas[0].revisao_min, r.semanas[0].simulado_min, r.semanas[0].disciplinas.map(d => [d.nome, d.minutos, d.aulas.length])], [360, 100, 50, [['Direito A', 180, 3], ['Direito B', 180, 3]]]);
    // véspera: nos 5 últimos dias antes da prova não entra aula
    assert.ok(dias.filter(d => d.data >= '2026-05-27').every(d => d.fase === 'vespera' && !d.blocos.length && !d.simulado_min) && r.semanas[r.semanas.length - 1].vespera_min > 0);
    // é o MESMO motor: as sessões de estudo são as do plano.planejar com as mesmas entradas
    const pl = plano.planejar({ ...base, revisao_pct: 30, itens: aulas(6, 60).map((a, i) => ({ codigo: a.codigo, ordem: i, peso: 0, esforco_min: [60, 60] })) });
    assert.deepEqual(dias.filter(d => d.blocos.length).map(d => [d.data, d.blocos.map(b => [b.aula, b.minutos])]), pl.sessoes.filter(s => s.estudo.length).map(s => [s.data, s.estudo.map(b => [b.codigo, b.minutos])]));
    // NÃO CABE: 40 aulas de 5 h; o que foi alocado + o que ficou de fora = o esforço; nada some
    r = crono.montar({ ...base, aulas: aulas(40, 300) });
    assert.deepEqual([r.cabe, r.esforco_min, r.alocado_min + r.faltam_min, r.pendentes.reduce((n, p) => n + p.minutos, 0) === r.faltam_min, r.sugestao_nivel], [false, 12000, 12000, true, null]);
    assert.ok(/^Faltam 200 h de aula e você tem \d+ h( \d+ min)? de estudo até a prova: nem o nível mais curto cabe/.test(r.aviso), r.aviso);
    const capacidade = r.alocado_min; // tudo o que havia para matéria nova foi usado
    // esforço 20 % acima da capacidade: no nível 100 não cabe; no 50 % (fator 0,75) cabe — e é o que a ferramenta sugere
    const quase = aulas(10, Math.round(capacidade * 1.2 / 10));
    r = crono.montar({ ...base, aulas: quase });
    assert.deepEqual([r.cabe, r.sugestao_nivel], [false, 50]);
    assert.ok(/: considere o nível 50 %\.$/.test(r.aviso), r.aviso);
    const em50 = crono.montar({ ...base, aulas: quase, nivel: 50 });
    assert.deepEqual([em50.cabe, em50.nivel, em50.esforco_min], [true, 50, quase.reduce((n, a) => n + Math.round(a.tempo_min * plano.fatorNivel(50)), 0)], 'só a leitura encolhe: o mesmo fator do Plano');
    // sem data de prova: diz quando termina no ritmo informado; aula sem tempo estimado fica fora da conta, e é dita
    r = crono.montar({ ...base, data_alvo: '', vespera_dias: 0, revisao_geral_dias: 0, aulas: aulas(6, 60).concat([{ codigo: 'sem-tempo', titulo: 'Sem tempo', disciplina: '1.2', disciplina_nome: 'Direito B', tempo_min: 0 }]) });
    assert.deepEqual([r.cabe, r.data_alvo, r.sem_estimativa, !!r.conclusao_estimada], [true, '', ['sem-tempo'], true]);
    assert.throws(() => crono.montar({ ...base, disponibilidade: {}, aulas: aulas(2, 60) }), /ao menos um dia da semana/);
    assert.throws(() => crono.montar({ ...base, data_alvo: '2026-03-01', aulas: aulas(2, 60) }), /futura/);
    assert.ok(/plano\.planejar\(/.test(ler('estudo/cronograma.js')), 'quem distribui as horas é o motor do Plano');
  });

  await t('ferramentas: o servidor só entrega os DADOS (regra com a fonte, data, aulas que faltam, horas do Plano); os motores chegam ao navegador idênticos', async () => {
    let r = await req('GET', `${esc()}/ferramentas`, { jar: 'leo-j' });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.regra_pontuacao.fonte, r.json.regra_pontuacao.minimos.length, r.json.plano, r.json.reta_final, r.json.niveis, r.json.reservas],
      ['Edital de teste, item 10', 3, null, { foco: 'objetiva', vespera_dias: plano.VESPERA_PADRAO_DIAS, revisao_geral_dias: plano.REVISAO_GERAL_PADRAO_DIAS }, [100, 50, 25, 10], { margem_pct: 15, revisao_pct: 20, simulado_pct: 10 }]);
    assert.deepEqual(r.json.disciplinas.map(d => [d.nome, d.aulas.map(a => [a.codigo, a.tempo_min, a.estudada])]),
      [['Direito A', [['aula-a1', 60, true], ['aula-a2', 60, false]]], ['Direito B', [['aula-b1', 60, false], ['aula-b2', 60, false]]], ['Direito C', [['aula-c1', 60, false]]]], 'o Leo só respondeu algo da aula A1');
    assert.equal(r.json.hoje, A.hojeBR());
    // com plano salvo, as horas dele vêm junto (o cronograma parte delas)
    const pl = await req('PUT', `${esc()}/plano`, { jar: 'leo-j', corpo: { disponibilidade: { seg: 60, qua: 90 }, margem_pct: 10 } });
    assert.equal(pl.st, 200, pl.texto);
    r = await req('GET', `${esc()}/ferramentas`, { jar: 'leo-j' });
    assert.deepEqual([r.json.plano.disponibilidade, r.json.plano.margem_pct], [[0, 60, 0, 90, 0, 0, 0], 10]);
    // percurso sem regra cadastrada: `null` — a tela passa a pedir os números ao aluno
    db.prepare("UPDATE est_escopos SET regra_pontuacao = '{}' WHERE id = ?").run(eid());
    assert.equal((await req('GET', `${esc()}/ferramentas`, { jar: 'leo-j' })).json.regra_pontuacao, null);
    db.prepare('UPDATE est_escopos SET regra_pontuacao = ? WHERE id = ?').run(j.str(REGRA), eid());
    assert.equal((await req('GET', `${esc()}/ferramentas`, { jar: 'caio' })).st, 403);
    assert.equal((await req('GET', `${esc()}/jornada`, { jar: 'caio' })).st, 403);
    // o pacote do navegador é o MESMO código: roda aqui, numa janela de mentira, e dá os mesmos resultados
    const js = await req('GET', '/academy/estude-motores.js');
    assert.ok(js.st === 200 && js.texto.includes('window.EstudeMotores'), 'os motores são servidos');
    const janela = {};
    vm.runInNewContext(js.texto, { window: janela });
    const M = janela.EstudeMotores;
    assert.deepEqual(Object.keys(M), ['pontuacao', 'calculadora', 'prazo', 'plano', 'cronograma']);
    const blocos = [{ bloco: 'I', questoes: 40, acertos: 11 }, { bloco: 'II', questoes: 30, acertos: 9 }, { bloco: 'III', questoes: 30, acertos: 20 }];
    const igual = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
    igual(M.calculadora.calcular(REGRA, blocos), calc.calcular(REGRA, blocos));
    igual(M.prazo.contar({ inicio: '2026-04-01', dias: 5 }), prazo.contar({ inicio: '2026-04-01', dias: 5 }));
    const ent = { hoje: '2026-03-02', data_alvo: '2026-06-01', disponibilidade: { seg: 120, qui: 120 }, aulas: [{ codigo: 'x', titulo: 'X', disciplina: '1.1', disciplina_nome: 'A', tempo_min: 300 }], vespera_dias: 5, revisao_geral_dias: 15 };
    igual(M.cronograma.montar(ent), crono.montar(ent));
    // só módulo puro entra no pacote: nada de banco, rede ou arquivo
    assert.ok(!/require\('\.\.\/db'\)|require\('fs'\)|require\('crypto'\)/.test(js.texto));
  });

  // ================= a tela =================
  await t('jornada/tela: as portas (barra do curso, aba Hoje, Plano), o diagnóstico sem relógio, as três ferramentas — e nada novo no localStorage', async () => {
    const tela = ler('app-estudo.js');
    for (const pedaco of [
      // portas
      'id="es-bar-jr">🏅 Minha jornada', 'id="es-bar-fer">🧰 Ferramentas', 'jornada: jornada, ferramentas: ferramentas', 'PORTAS = { jornada: 1, ferramentas: 1 }', '← Voltar para onde eu estava',
      'function cartaoDiagnostico(', 'function cartaoJornada(', 'id="es-hj-jr"', 'h += cartaoDiagnostico(E.painel, false);',
      // diagnóstico e teste final
      "base() + '/diagnostico'", 'Começar o diagnóstico', 'Continuar o diagnóstico', 'Salvar e continuar depois', 'sem relógio: responda no seu ritmo', 'Ordem sugerida de estudo', 'Antes × depois, por disciplina', 'o Plano não foi alterado por ela',
      // nível, selos, medalhas, eixos
      'nível pelo domínio demonstrado', 'Assistir, ler e abrir aula não mudam o nível', 'Um selo para cada disciplina do edital', 'Marcos do percurso', 'não viram um percentual só', 'function caixaEixos(',
      // ferramentas
      "'/academy/estude-motores.js?v=1'", 'Calculadora de pontuação da prova', 'não para os do edital', 'M.calculadora.calcular(', 'Confira no edital ou na lei qual é o prazo e se ele corre em dias úteis ou corridos',
      'z.contar(', 'Uma visão de calendário do seu <b>Plano</b>', 'M.cronograma.montar(', 'id="cr-imprimir">🖨️ Imprimir ou salvar em PDF', 'Usar estas horas no meu Plano',
    ]) assert.ok(tela.includes(pedaco), 'falta na tela: ' + pedaco);
    // a regra é dita INTEIRA (valor do acerto, mínimo por bloco, mínimo geral) — a mesma frase na aba Prova e na calculadora
    const ri = tela.indexOf('function regraTxt('), rf = tela.indexOf('function prova(alvo)');
    const regraTxt = new Function('num', tela.slice(ri, rf) + ';return regraTxt;')((x) => String(Math.round(Number(x) * 1000) / 1000).replace('.', ','));
    assert.equal(regraTxt(REGRA), '0,1 ponto por acerto; sem desconto por erro; mínimo no bloco I: 1,2 ponto; mínimo no bloco II: 0,9 ponto; mínimo no bloco III: 0,9 ponto; mínimo geral de 6 pontos (fonte: Edital de teste, item 10)');
    assert.equal(regraTxt({}), '1 ponto por acerto, sem desconto');
    assert.equal(regraTxt({ desconto: { a_cada: 3 }, em_branco_conta_erro: true, aprovacao: { min_pct: 50 }, fonte: 'Regulamento' }), 'cada 3 erradas descontam 1 certa; questão em branco conta como erro; mínimo de 50% (fonte: Regulamento)');
    // a aba Hoje mostra a porta do diagnóstico enquanto ele não foi feito, e a ordem sugerida depois
    assert.ok(/retaFinal\(p\) \+ \(jaFez \? '' : cartaoDiagnostico\(p, true\)\)/.test(tela) && /\(jaFez \? cartaoDiagnostico\(p, true\) : ''\) \+ cartaoJornada\(p\)/.test(tela));
    // o diagnóstico usa a tela da prova sem relógio, e o resultado dele mora em Minha jornada
    // (a prova abre pela própria rota da jornada — abrir a jornada E desenhar a prova, em paralelo, deixava a jornada cobrir a prova)
    assert.ok(tela.includes("ir('jornada', { tentativa: t });") && tela.includes('if (arg && arg.tentativa) return executar(alvo, arg.tentativa);') && !/ir\('jornada'\);\s*executar\(/.test(tela));
    assert.ok(/if \(!aval\) E\.relogio = setInterval\(tique, 500\);/.test(tela) && /if \(ehAvaliacao\(t\)\) \{ carregar\(function \(\) \{ botoesDaBarra\(\); ir\('jornada', 'avaliacao'\); \}\); return; \}/.test(tela));
    const i = tela.indexOf('// ================= MINHA JORNADA (etapa 2)'), meio = tela.indexOf('// ================= FERRAMENTAS DO CONCURSEIRO'), f = tela.indexOf('// ================= PRATICAR =================');
    assert.ok(i > 0 && meio > i && f > meio);
    const nova = tela.slice(i, f), fer = tela.slice(meio, f);
    // a regra do localStorage do arquivo continua valendo: só a posição e as preferências da leitura
    const usos = tela.match(/localStorage\.\w+\([^)]*\)/g) || [];
    assert.ok(usos.length === (tela.match(/localStorage/g) || []).length && usos.every(u => /^localStorage\.(getItem|setItem)\(chave(Pref)?\b/.test(u)), 'nenhum uso novo de localStorage: ' + usos.join(' | '));
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(nova), 'jornada e ferramentas não guardam nada no navegador');
    // as ferramentas não refazem conta na tela: nem data, nem nota — quem calcula são os motores
    assert.ok(!/new Date\(|getUTCDay|getDay\(|valor_certa \*|Math\.floor\(/.test(fer), 'a tela das ferramentas só lê os campos e chama o motor');
    // o cronograma abre para LER; imprimir é um clique do aluno, lá dentro
    const ci = tela.indexOf('function escreverCronograma'), cf = tela.indexOf('function ferCronograma');
    assert.ok(ci > 0 && cf > ci && /bi\.onclick = function \(\) \{ w\.print\(\); \}/.test(tela.slice(ci, cf)) && (nova.match(/print\(\)/g) || []).length === 1, 'a impressão só acontece no clique do aluno');
    // nada promete resultado; o cartão de XP da jornada comum e as ferramentas de curso de IA seguem fora
    assert.ok(!/garant|vai passar|ser[áa] aprovad|aprova[çc][ãa]o certa/i.test(nova), 'nenhuma promessa de aprovação');
    assert.ok(/Nível não é previsão de resultado em prova/.test(nova) && /É uma conta, não um resultado oficial nem uma previsão/.test(nova));
    assert.ok(!/Prompt Builder|gerador de agentes/i.test(tela));
    const aluno = ler('app-aluno.js');
    assert.ok(/var PORTAS_DA_JORNADA = \['desafio', 'simulacoes', 'lab', 'recursos'\]/.test(aluno), 'a barra do produto continua sem o cartão de XP e sem as Ferramentas de IA');
    const js = await req('GET', '/academy/estude.js');
    assert.ok(js.st === 200 && js.texto.includes('Minha jornada') && js.texto.includes('Ferramentas do concurseiro'), 'a tela servida é a nova');
    const css = ler('estude.css');
    for (const c of ['.es-jr-escada', '.es-jr-selos', '.es-jr-med', '.es-crono-sem', '.es-pz-passos']) assert.ok(css.includes(c), 'falta no CSS: ' + c);
  });
}

module.exports = { rodar };
