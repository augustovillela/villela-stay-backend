// =====================================================================
// Villela Academy — ESTUDO · TIPO DO ERRO no caderno de erros + ERROS POR TIPO no painel + SEMÁFORO (20/11/2026).
// Piloto de método do TRF-3. O aluno classifica por que errou (7 tipos, lista fechada no servidor); o painel conta só o
// que foi classificado e só aponta prioridade com 5 ou mais; o semáforo usa os limiares que já existiam (50 e 80).
// =====================================================================
'use strict';
const assert = require('assert');

async function rodar({ t, req }) {
  const { db } = require('../db');
  const J = require('./jornada-estude');

  console.log('\n— estudo/tipo do erro: classificar o erro, ver os erros por tipo no painel e o semáforo com os limiares da régua —');
  const PROD = 'maria@t.com', SLUG = 'tipo-erro';
  let pid = '';
  const E = (extra = {}) => ({ produtor_email: PROD, produto_id: pid, ...extra });
  const importar = (corpo) => req('POST', '/staff/api/academy/estudo/importar', { semUser: true, chave: true, corpo: E(corpo) });
  const esc = () => `/academy/api/aluno/cursos/${pid}/estudo/${SLUG}`;
  const COMP = (codigo) => ({ codigo, resultado: `Diante de um caso de ${codigo}, o aluno aplica a regra e justifica a resposta.` });
  const AULA = (codigo, competencia, itens, ordem) => ({ codigo, titulo: `Aula ${codigo}`, competencias: [competencia], itens, tempo_min: 20, ordem,
    blocos: [{ tipo: 'explicacao', texto: `Explicação da aula ${codigo}, com a regra e o exemplo.` }, { tipo: 'pratica', texto: `Exercício da aula ${codigo}: escreva a sua resposta.`, solucao: 'A solução comentada.' }],
    midias: [], fontes: [{ titulo: 'Fonte de teste', consultado_em: '2026-10-01' }] });
  const Q = (i, competencia) => ({ tipo: 'objetiva', origem: 'autoral', gerada_por_ia: true, enunciado: `Tipo do erro, questão ${i}: qual é a regra aplicável ao ponto?`, competencias: [competencia],
    alternativas: [{ texto: `certa ${i}`, correta: true, explicacao: 'Certa.' }, { texto: `errada ${i}`, correta: false, explicacao: 'Errada.' }] });
  const qid = (i) => db.prepare('SELECT id FROM est_questoes WHERE dados LIKE ?').get(`%Tipo do erro, questão ${i}:%`).id;
  const errar = async (jar, i) => { const r = await req('POST', `${esc()}/questoes/${qid(i)}/responder`, { jar, corpo: { resposta: 'b' } }); assert.equal(r.st, 200, r.texto); return r; };
  const anotar = (jar, i, corpo) => req('PUT', `${esc()}/questoes/${qid(i)}/anotacao`, { jar, corpo });
  const painel = async (jar) => { const r = await req('GET', `${esc()}/painel`, { jar }); assert.equal(r.st, 200, r.texto); return r.json; };
  const TIPOS = ['conhecimento', 'confusao', 'desatencao', 'interpretacao', 'banca', 'estrategia', 'tempo_ansiedade'];

  await t('tipo do erro: monta o percurso (2 disciplinas, 8 questões) e a aluna erra 7', async () => {
    let r = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: { produtor_email: PROD,
      produto: { titulo: 'Curso do Tipo do Erro', tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Só o percurso' },
      modulos: [{ titulo: 'Comece por aqui', aulas: [{ titulo: 'Aula de orientação', tipo: 'texto', conteudo: 'O conteúdo está no Estude.' }] }] } });
    assert.equal(r.st, 200, r.texto);
    pid = r.json.produto.id;
    r = await importar({ escopo: { slug: SLUG, tipo: 'edital', titulo: 'Percurso do tipo do erro' },
      programa: { documento: { nome: 'Edital de teste', tipo: 'edital' }, itens: [
        { codigo: 'D.1', texto: 'Direito Um' }, { codigo: 'D.1.1', texto: 'Ponto um' }, { codigo: 'D.2', texto: 'Direito Dois' }, { codigo: 'D.2.1', texto: 'Ponto dois' }] },
      competencias: [COMP('c-um'), COMP('c-dois')],
      vinculos: [{ item: 'D.1.1', competencia: 'c-um', justificativa: 'O item é a própria regra.' }, { item: 'D.2.1', competencia: 'c-dois', justificativa: 'O item é a própria regra.' }],
      unidades: [AULA('u-um', 'c-um', ['D.1.1'], 1), AULA('u-dois', 'c-dois', ['D.2.1'], 2)] });
    assert.equal(r.st, 200, r.texto);
    r = await importar({ escopo: { slug: SLUG }, questoes: [1, 2, 3, 4, 5, 6].map(i => Q(i, i <= 4 ? 'c-um' : 'c-dois')).concat([Q(7, 'c-dois'), Q(8, 'c-dois')]) });
    assert.equal(r.st, 200, r.texto);
    r = await req('POST', '/staff/api/academy/estudo/status', { semUser: true, chave: true, corpo: E({ escopo: SLUG, status: 'publicado', unidades: 'publicado', questoes: 'disponivel' }) });
    assert.equal(r.st, 200, r.texto);
    const email = 'te-aluna@t.com';
    assert.equal((await req('POST', '/academy/api/signup', { corpo: { nome: 'Aluna te', email, senha: 'senha-forte-tipo', aceite_termos: true }, jar: 'te-aluna' })).st, 200);
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${pid}/matricular`, { jar: 'maria', corpo: { email } })).st, 200);
    for (const i of [1, 2, 3, 4, 5, 6, 7]) assert.equal((await errar('te-aluna', i)).json.acerto, false);
  });

  await t('tipo do erro: a lista de 7 tipos vem do servidor (rótulo + o que fazer) no caderno e na resposta; sem classificar, o painel não inventa análise', async () => {
    const r = await req('GET', `${esc()}/erros`, { jar: 'te-aluna' });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(r.json.tipos_de_erro.map(x => x.id), TIPOS);
    assert.ok(r.json.tipos_de_erro.every(x => x.rotulo && x.correcao.length > 20), 'cada tipo traz rótulo e a correção');
    assert.ok(r.json.questoes.every(q => q.tipo_erro === ''), 'nada classificado ainda');
    const x = await errar('te-aluna', 8);
    assert.deepEqual(x.json.tipos_de_erro.map(y => y.id), TIPOS, 'a resposta errada também leva a lista');
    const p = (await painel('te-aluna')).erros_por_tipo;
    assert.deepEqual([p.pendentes, p.classificados, p.por_tipo.length, p.por_disciplina.length, p.atacar_primeiro], [8, 0, 0, 0, null], JSON.stringify(p));
  });

  await t('tipo do erro: valor fora da lista é 400 e nada grava; texto ausente mantém o texto; tipo ausente mantém o tipo; vazio limpa', async () => {
    let r = await anotar('te-aluna', 1, { texto: 'Confundi a regra com a exceção.', tipo_erro: 'inventado' });
    assert.equal(r.st, 400, r.texto);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM est_anotacoes WHERE questao_id = ?').get(qid(1)).n, 0, 'a recusa não grava nada');
    r = await anotar('te-aluna', 1, { texto: 'Confundi a regra com a exceção.', tipo_erro: ['confusao'] });
    assert.equal(r.st, 400, r.texto);
    r = await anotar('te-aluna', 1, { texto: 'Confundi a regra com a exceção.', tipo_erro: 'confusao' });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.tipo_erro, r.json.anotacao, r.json.correcao.length > 20, r.json.tipos_de_erro.length], ['confusao', 'Confundi a regra com a exceção.', true, 7]);
    r = await anotar('te-aluna', 1, { tipo_erro: 'banca' }); // cliente que só classifica: o texto fica
    assert.deepEqual([r.st, r.json.tipo_erro, r.json.anotacao], [200, 'banca', 'Confundi a regra com a exceção.'], r.texto);
    r = await anotar('te-aluna', 1, { texto: 'Texto novo, sem mexer no tipo.' }); // cliente antigo: o tipo fica
    assert.deepEqual([r.st, r.json.tipo_erro, r.json.anotacao], [200, 'banca', 'Texto novo, sem mexer no tipo.'], r.texto);
    r = await anotar('te-aluna', 2, { tipo_erro: 'desatencao' }); // só o tipo, sem texto algum: a linha existe
    assert.deepEqual([r.st, r.json.tipo_erro, r.json.anotacao], [200, 'desatencao', ''], r.texto);
    r = await anotar('te-aluna', 2, { tipo_erro: '' }); // limpou o único conteúdo: a linha some
    assert.deepEqual([r.st, r.json.tipo_erro], [200, ''], r.texto);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM est_anotacoes WHERE questao_id = ?').get(qid(2)).n, 0, 'sem texto e sem tipo, não sobra linha');
    const lista = (await req('GET', `${esc()}/erros`, { jar: 'te-aluna' })).json.questoes.find(q => q.id === qid(1));
    assert.deepEqual([lista.tipo_erro, lista.anotacao], ['banca', 'Texto novo, sem mexer no tipo.'], 'o caderno devolve o tipo junto da anotação');
    assert.equal((await anotar('te-aluna', 1, { texto: 'x', tipo_erro: 'banca' })).st, 200);
  });

  await t('tipo do erro: só classificadas contam; com menos de 5 não há prioridade; com 5 o painel diz qual correção atacar primeiro e o tipo mais frequente por disciplina', async () => {
    const disc = { 1: 'confusao', 2: 'confusao', 3: 'confusao', 4: 'desatencao', 5: 'banca' };
    for (const [i, tp] of Object.entries(disc).slice(0, 4)) assert.equal((await anotar('te-aluna', Number(i), { texto: `anotação ${i}`, tipo_erro: tp })).st, 200);
    let p = (await painel('te-aluna')).erros_por_tipo;
    assert.deepEqual([p.classificados, p.atacar_primeiro, p.minimo_para_prioridade], [4, null, 5], 'com 4 classificados não aponta prioridade: ' + JSON.stringify(p));
    assert.deepEqual(p.por_tipo.map(x => [x.id, x.n]), [['confusao', 3], ['desatencao', 1]]);
    assert.equal((await anotar('te-aluna', 5, { texto: 'anotação 5', tipo_erro: 'banca' })).st, 200);
    p = (await painel('te-aluna')).erros_por_tipo;
    assert.equal(p.classificados, 5);
    assert.deepEqual([p.atacar_primeiro.id, p.atacar_primeiro.n, p.atacar_primeiro.correcao.length > 20], ['confusao', 3, true], JSON.stringify(p.atacar_primeiro));
    const d1 = p.por_disciplina.find(x => x.codigo === 'D.1'), d2 = p.por_disciplina.find(x => x.codigo === 'D.2');
    assert.deepEqual([d1 && d1.tipo, d1 && d1.n], ['confusao', 3], JSON.stringify(p.por_disciplina)); // questões 1, 2, 3 e 4 são da disciplina 1
    assert.deepEqual([d2 && d2.tipo, d2 && d2.n], ['banca', 1], JSON.stringify(p.por_disciplina));
    // acertar de novo tira do caderno: erro resolvido deixa de contar por tipo
    const ok = await req('POST', `${esc()}/questoes/${qid(1)}/responder`, { jar: 'te-aluna', corpo: { resposta: 'a' } });
    assert.equal(ok.json.acerto, true, ok.texto);
    p = (await painel('te-aluna')).erros_por_tipo;
    assert.deepEqual([p.classificados, p.por_tipo.find(x => x.id === 'confusao').n], [4, 2], 'a questão refeita e acertada sai da conta');
  });

  await t('tipo do erro: a anotação é da aluna — outra pessoa matriculada não vê o tipo dela', async () => {
    const email = 'te-outra@t.com';
    assert.equal((await req('POST', '/academy/api/signup', { corpo: { nome: 'Outra te', email, senha: 'senha-forte-tipo', aceite_termos: true }, jar: 'te-outra' })).st, 200);
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${pid}/matricular`, { jar: 'maria', corpo: { email } })).st, 200);
    const p = (await painel('te-outra')).erros_por_tipo;
    assert.deepEqual([p.pendentes, p.classificados], [0, 0]);
    assert.equal((await anotar('te-outra', 3, { tipo_erro: 'banca' })).st, 409, 'sem responder a questão não se anota');
  });

  await t('semáforo: as cores são as da régua que já existia (50 e 80), expostas como configuração ajustável e sem segundo conjunto de números', async () => {
    assert.deepEqual([J.DIAG_FAIXA_BASE_PCT, J.DIAG_FAIXA_FORTE_PCT], [50, 80], 'a régua da casa não mudou');
    const r = await req('GET', `${esc()}/jornada`, { jar: 'te-aluna' });
    assert.equal(r.st, 200, r.texto);
    const s = r.json.criterios.semaforo;
    assert.deepEqual([s.vermelho_abaixo_pct, s.verde_a_partir_pct], [50, 80]);
    assert.deepEqual(s.cores, { comece_por_aqui: 'vermelho', base_razoavel: 'amarelo', ponto_forte: 'verde', sem_questoes: 'cinza' });
    assert.ok(/não é dado científico/.test(s.nota), 'a tela diz que o limiar é padrão inicial');
    assert.equal(r.json.criterios.faixa_base_pct, 50, 'o campo antigo segue igual');
  });
}

module.exports = { rodar };
