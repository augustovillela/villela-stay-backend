// =====================================================================
// Villela Academy — ESTUDO · QUESTÃO SUPERADA (ADR-0017, 20/10/2026).
// Decisão do Augusto para o curso do TJDFT: questão OFICIAL antiga cujo gabarito foi superado por lei ou decisão
// posterior entra no banco com `vigencia_situacao: 'superada'` e fica FORA de toda correção automática — aparece
// para ESTUDO em "O que mudou" (enunciado, gabarito da época, nota de vigência), sem pontuar, sem treino, simulado,
// aferição, estatística de acerto nem retomada. Questão sem o selo continua a de sempre (cursos A e B não mudam).
// =====================================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function rodar({ t, req }) {
  const { db } = require('../db');
  const R = require('./repo');
  const banco = require('./banco');
  const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  console.log('\n— estudo/questão superada (ADR-0017): o gabarito da época fica para estudo, fora da correção —');
  const PROD = 'maria@t.com', SLUG = 'superada-estude';
  const ALU = { nome: 'Sara Superada', email: 'sara.superada@t.com', senha: 'senha-forte-sara', aceite_termos: true };
  let pid = '';
  const E = (extra = {}) => ({ produtor_email: PROD, produto_id: pid, ...extra });
  const chave = (m, rota, corpo) => req(m, rota, { semUser: true, chave: true, corpo });
  const esc = () => `/academy/api/aluno/cursos/${pid}/estudo/${SLUG}`;
  const ALTS = (i) => [{ texto: `certa ${i}`, correta: true, explicacao: 'Certa.' }, { texto: `errada ${i}a`, correta: false, explicacao: 'Errada.' }, { texto: `errada ${i}b`, correta: false, explicacao: 'Errada.' }];
  const Q = (i, extra) => ({ tipo: 'objetiva', origem: 'autoral', enunciado: `Superada, questão ${i}: qual é a regra aplicável ao ponto?`, alternativas: ALTS(i), competencias: ['k1'], bloco: 'I', ...extra });
  const OF = (i, extra) => Q(i, { origem: 'oficial', gabarito_situacao: 'definitivo', disciplina: 'Direito Civil',
    procedencia: { banca: 'Comissão do TJ', orgao: 'Tribunal Superado de Teste', concurso: 'XLII Concurso de teste', ano: 2015, fonte: 'https://exemplo.test/prova.pdf', numero_original: String(i) }, ...extra });
  const NOTA = 'Prova de 2015, sob o CPC/1973: o foro da mulher não existe mais (CPC/2015, art. 53, I).';
  const NORMAIS = [1, 2, 3, 4].map(i => Q(i));
  const SUPERADAS = [5, 6].map(i => OF(i, { vigencia_situacao: 'superada', vigencia: NOTA }));
  const VIGENTE = OF(7, { vigencia_situacao: 'vigente', vigencia: 'Base inalterada.' });
  const importar = (questoes, extra = {}) => chave('POST', '/staff/api/academy/estudo/importar', E({ escopo: { slug: SLUG, tipo: 'edital', titulo: 'Percurso com questões superadas' },
    programa: { documento: { nome: 'Edital de teste', tipo: 'edital' }, itens: [{ codigo: 'P1', texto: 'Foro e competência' }] },
    competencias: [{ codigo: 'k1', resultado: 'Diante de um caso de foro, o aluno aplica a regra e justifica a resposta.' }],
    vinculos: [{ item: 'P1', competencia: 'k1', justificativa: 'O item é a própria regra.' }], questoes, ...extra }));
  const qid = (i) => db.prepare("SELECT id FROM est_questoes WHERE dados LIKE ?").get(`%Superada, questão ${i}:%`).id;

  await t('questão superada (ADR-0017): o motor puro — superada sai da correção sem mudar o hash; valor torto e superada sem nota são recusados; sem o selo, os dados são os de sempre', async () => {
    const sem = banco.validarQuestao(OF(5));
    const sup = banco.validarQuestao(OF(5, { vigencia_situacao: 'superada', vigencia: NOTA }));
    assert.deepEqual([sem.corrigivel, sup.corrigivel, sup.vigencia_situacao, banco.superada(sup), banco.superada(sem)], [true, false, 'superada', true, false]);
    assert.equal(sup.hash, sem.hash, 'o selo não entra no hash: marcar como superada atualiza a questão, não a duplica');
    assert.ok(!('vigencia_situacao' in sem), 'questão sem selo não ganha a chave (reimportar os cursos A e B não gera versão nova)');
    assert.equal(JSON.stringify(banco.validarQuestao(Q(1))), JSON.stringify(banco.validarQuestao({ ...Q(1), vigencia_situacao: '' })), 'selo vazio = sem selo');
    for (const v of ['vigente', 'afetada']) assert.equal(banco.validarQuestao(OF(5, { vigencia_situacao: v, vigencia: NOTA })).corrigivel, true, v + ' continua corrigível');
    assert.throws(() => banco.validarQuestao(OF(5, { vigencia_situacao: 'revogada', vigencia: NOTA })), /vigencia_situacao deve ser vigente\|afetada\|superada/);
    assert.throws(() => banco.validarQuestao(OF(5, { vigencia_situacao: 'superada' })), /superada exige a nota de "vigencia"/);
    assert.ok(!('vigencia_situacao' in banco.paraAluno({ ...sup, id: 'x' }, 's')), 'o selo não vai ao navegador antes da resposta (nada muda no paraAluno)');
  });

  await t('questão superada (ADR-0017): a importação conta as superadas em "fora da correção", recusa valor fora da lista (400, nada gravado) e marcar depois ATUALIZA a mesma questão', async () => {
    let r = await chave('POST', '/staff/api/academy/importar-curso', { produtor_email: PROD,
      produto: { titulo: 'Curso da Questão Superada', tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Só o percurso' },
      modulos: [{ titulo: 'Comece por aqui', aulas: [{ titulo: 'Aula de orientação', tipo: 'texto', conteudo: 'O conteúdo está no Estude.' }] }] });
    assert.equal(r.st, 200, r.texto);
    pid = r.json.produto.id;
    r = await importar([...NORMAIS, OF(5, { vigencia_situacao: 'desatualizada', vigencia: NOTA })]);
    assert.deepEqual([r.st, /questão 5: vigencia_situacao deve ser/.test(r.json.erro)], [400, true], r.texto);
    assert.equal(R.Escopos.porSlug(pid, SLUG), undefined, 'a recusa desfaz tudo (transação)');
    // primeiro sem a 6 marcada (como estava antes da triagem); depois a triagem a marca
    r = await importar([...NORMAIS, SUPERADAS[0], OF(6), VIGENTE]);
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(r.json.importado.questoes, { novas: 7, duplicadas: 0, atualizadas: 0, sem_vinculo: 0, fora_da_correcao: 1 });
    r = await importar([...NORMAIS, ...SUPERADAS, VIGENTE]);
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(r.json.importado.questoes, { novas: 0, duplicadas: 6, atualizadas: 1, sem_vinculo: 0, fora_da_correcao: 2 }, 'a 6 é a MESMA questão, agora superada');
    const linha = db.prepare('SELECT corrigivel, versao FROM est_questoes WHERE id = ?').get(qid(6));
    assert.deepEqual([linha.corrigivel, linha.versao], [0, 2]);
    assert.equal(db.prepare('SELECT corrigivel FROM est_questoes WHERE id = ?').get(qid(7)).corrigivel, 1, 'vigente segue na correção');
    r = await chave('POST', '/staff/api/academy/estudo/status', E({ escopo: SLUG, status: 'publicado', questoes: 'disponivel' }));
    assert.equal(r.st, 200, r.texto);
    assert.equal((await req('POST', '/academy/api/signup', { corpo: ALU, jar: 'sara-s' })).st, 200);
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${pid}/matricular`, { jar: 'maria', corpo: { email: ALU.email } })).st, 200);
  });

  await t('questão superada (ADR-0017): o aluno a LÊ em "O que mudou" (gabarito da época + nota) sem registrar nada — e ela não entra no banco, no Praticar, no responder nem em treino ou simulado', async () => {
    const sup = new Set([qid(5), qid(6)]);
    const b = (await req('GET', `${esc()}/banco`, { jar: 'sara-s' })).json;
    assert.deepEqual([b.total, b.superadas, b.oficiais], [5, 2, 1], 'o banco conta 5 de correção automática (4 + a vigente) e diz que há 2 superadas');
    const evs = () => db.prepare('SELECT COUNT(*) n FROM est_evidencias').get().n, antes = evs();
    let r = await req('GET', `${esc()}/o-que-mudou`, { jar: 'sara-s' });
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.total, 2);
    const q5 = r.json.questoes.find(q => q.id === qid(5));
    assert.deepEqual([q5.vigencia_situacao, q5.vigencia, q5.alternativas.filter(a => a.correta).map(a => a.texto), q5.procedencia.ano, !!q5.alternativas[0].explicacao],
      ['superada', NOTA, ['certa 5'], 2015, true], 'enunciado, gabarito da época, explicações e a nota de vigência');
    assert.equal(evs(), antes, 'ler não registra evidência');
    r = await req('GET', `${esc()}/praticar?n=20`, { jar: 'sara-s' });
    assert.deepEqual([r.json.elegiveis, r.json.questoes.some(q => sup.has(q.id))], [5, false]);
    r = await req('POST', `${esc()}/questoes/${qid(5)}/responder`, { jar: 'sara-s', corpo: { resposta: 'a' } });
    assert.deepEqual([r.st, /superado por norma ou decisão posterior.*"O que mudou"/.test(r.json.erro)], [400, true], r.texto);
    assert.equal(evs(), antes, 'nem a tentativa de responder registra');
    for (const modo of ['treino', 'simulado']) {
      r = await req('POST', `${esc()}/tentativas`, { jar: 'sara-s', corpo: { modo, n: 7, aceitar_menos: true } });
      assert.equal(r.st, 200, modo + ': ' + r.texto);
      const ids = JSON.parse(db.prepare('SELECT congelado FROM est_tentativas WHERE id = ?').get(r.json.id).congelado).itens.map(i => i.id);
      assert.ok(ids.length > 0 && !ids.some(id => sup.has(id)), modo + ': nenhuma superada na prova');
      assert.equal((await req('POST', `${esc()}/tentativas/${r.json.id}/enviar`, { jar: 'sara-s' })).st, 200);
    }
  });

  await t('questão superada (ADR-0017): a questão errada que DEPOIS é marcada superada sai do caderno de erros (não dá para refazê-la) e passa a "O que mudou"', async () => {
    let r = await req('POST', `${esc()}/questoes/${qid(1)}/responder`, { jar: 'sara-s', corpo: { resposta: 'b' } });
    assert.deepEqual([r.st, r.json.acerto], [200, false], r.texto);
    assert.ok((await req('GET', `${esc()}/erros`, { jar: 'sara-s' })).json.questoes.some(q => q.id === qid(1)));
    r = await importar([Q(1, { origem: 'oficial', gabarito_situacao: 'definitivo', procedencia: OF(1).procedencia, vigencia_situacao: 'superada', vigencia: NOTA }), ...NORMAIS.slice(1), ...SUPERADAS, VIGENTE]);
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.importado.questoes.fora_da_correcao, 3);
    assert.ok(!(await req('GET', `${esc()}/erros`, { jar: 'sara-s' })).json.questoes.some(q => q.id === qid(1)), 'saiu do caderno');
    assert.equal((await req('GET', `${esc()}/o-que-mudou`, { jar: 'sara-s' })).json.total, 3);
  });

  await t('questão superada (ADR-0017): a tela — aviso no Praticar com o número, a lista "O que mudou" mostra o gabarito comentado (o desenho do caderno de erros) com a nota de vigência, e estude.js sobe para v=13', async () => {
    const tela = ler('app-estudo.js');
    for (const pedaco of ["'/o-que-mudou'", "competencia === '__mudou__'", 'b.superadas', 'function gabaritoComentado(', "gabaritoComentado(q, 'Ver o gabarito da época e o que mudou', ' · gabarito da época')", 'notaDeVigencia(q.vigencia)', 'não valem ponto']) assert.ok(tela.includes(pedaco), 'falta na tela: ' + pedaco);
    assert.ok(/estude: 13,/.test(ler('paginas.js')), 'estude.js?v=13');
  });
}

module.exports = { rodar };
