// =====================================================================
// Villela Academy — ESTUDO · TRILHA INICIAL (ADR-0020, 01/11/2026).
// Ordem do Augusto: o aluno novo do TRF-3 começa pela trilha de método, não por Ambiental. A próxima tarefa anda pelas
// COMPETÊNCIAS e só entre as que têm questão; a aula de método não tem questão nem ponto do edital, então nunca chegava
// a vez dela. A trilha é DECLARADA por percurso (`escopo.trilha_inicial`): quem não declara não muda em nada, e quem já
// estudou matéria segue pelo caminho que estava.
// =====================================================================
'use strict';
const assert = require('assert');

async function rodar({ t, req }) {
  const { db } = require('../db');
  const R = require('./repo');
  const A = require('./aluno');

  console.log('\n— estudo/trilha inicial (ADR-0020): o aluno novo começa pelo método, e quem já estudou não muda de caminho —');
  const PROD = 'maria@t.com', GERAIS = 'trilha-gerais', ANALISTA = 'trilha-analista', SEM_TRILHA = 'trilha-sem-declarar';
  let pid = '';
  const E = (extra = {}) => ({ produtor_email: PROD, produto_id: pid, ...extra });
  const importar = (corpo) => req('POST', '/staff/api/academy/estudo/importar', { semUser: true, chave: true, corpo: E(corpo) });
  const esc = (slug) => `/academy/api/aluno/cursos/${pid}/estudo/${slug}`;
  const proxima = async (jar, slug = ANALISTA) => { const r = await req('GET', `${esc(slug)}/painel`, { jar }); assert.equal(r.st, 200, r.texto); return r.json.proxima; };
  const COMP = (codigo) => ({ codigo, resultado: `Diante de um caso de ${codigo}, o aluno aplica a regra e justifica a resposta.` });
  const AULA = (codigo, competencia, itens, ordem) => ({ codigo, titulo: `Aula ${codigo}`, competencias: [competencia], itens, tempo_min: 20, ordem,
    blocos: [{ tipo: 'explicacao', texto: `Explicação da aula ${codigo}, com a regra e o exemplo.` }, { tipo: 'pratica', texto: `Exercício da aula ${codigo}: escreva a sua resposta.`, solucao: 'A solução comentada.' }],
    midias: [], fontes: [{ titulo: 'Fonte de teste', consultado_em: '2026-10-01' }] });
  const Q = (i, competencia) => ({ tipo: 'objetiva', origem: 'autoral', gerada_por_ia: true, enunciado: `Trilha inicial, questão ${i}: qual é a regra aplicável ao ponto?`, competencias: [competencia],
    alternativas: [{ texto: `certa ${i}`, correta: true, explicacao: 'Certa.' }, { texto: `errada ${i}`, correta: false, explicacao: 'Errada.' }] });
  const MET = (codigo, ordem) => ({ origem_produto_id: pid, origem_escopo_slug: GERAIS, unidade_codigo: codigo, itens_destino: [], ordem });
  const ALUNO = async (jar) => {
    const email = `${jar}@t.com`;
    assert.equal((await req('POST', '/academy/api/signup', { corpo: { nome: `Aluno ${jar}`, email, senha: 'senha-forte-trilha', aceite_termos: true }, jar })).st, 200);
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${pid}/matricular`, { jar: 'maria', corpo: { email } })).st, 200);
  };
  const abrirAula = async (jar, codigo) => { const r = await req('GET', `${esc(ANALISTA)}/unidades/${codigo}?aberta=1`, { jar }); assert.equal(r.st, 200, r.texto); };
  const lerAula = async (jar, codigo) => { await abrirAula(jar, codigo); const r = await req('PUT', `${esc(ANALISTA)}/unidades/${codigo}/lida`, { jar, corpo: {} }); assert.equal(r.st, 200, r.texto); };
  const qid = (i) => db.prepare('SELECT id FROM est_questoes WHERE dados LIKE ?').get(`%Trilha inicial, questão ${i}:%`).id;
  const TRILHA = ['met-01', 'met-02'];

  await t('trilha inicial (ADR-0020): monta o caso do TRF-3 — método em Gerais, sem item nem questão, incluído no Analista com ordem negativa; sem declarar a trilha, o aluno novo começa pela matéria (o defeito)', async () => {
    let r = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: { produtor_email: PROD,
      produto: { titulo: 'Curso da Trilha Inicial', tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Só o percurso' },
      modulos: [{ titulo: 'Comece por aqui', aulas: [{ titulo: 'Aula de orientação', tipo: 'texto', conteudo: 'O conteúdo está no Estude.' }] }] } });
    assert.equal(r.st, 200, r.texto);
    pid = r.json.produto.id;
    r = await importar({ escopo: { slug: GERAIS, tipo: 'edital', titulo: 'Conhecimentos gerais' },
      programa: { documento: { nome: 'Edital de teste', tipo: 'edital' }, itens: [{ codigo: 'G1', texto: 'Língua portuguesa' }] },
      competencias: [COMP('met-edital'), COMP('met-ciclo')], unidades: [AULA('met-01', 'met-edital', [], -2), AULA('met-02', 'met-ciclo', [], -1)] });
    assert.equal(r.st, 200, r.texto);
    for (const slug of [ANALISTA, SEM_TRILHA]) {
      r = await importar({ escopo: { slug, tipo: 'edital', titulo: `Percurso ${slug}` },
        programa: { documento: { nome: 'Edital de teste', tipo: 'edital' }, itens: [{ codigo: 'P1', texto: 'Direito ambiental' }, { codigo: 'P2', texto: 'Direito administrativo' }] },
        competencias: [COMP('amb-01'), COMP('adm-01')],
        vinculos: [{ item: 'P1', competencia: 'amb-01', justificativa: 'O item é a própria regra.' }, { item: 'P2', competencia: 'adm-01', justificativa: 'O item é a própria regra.' }],
        unidades: [AULA('amb-01', 'amb-01', ['P1'], 1000), AULA('adm-01', 'adm-01', ['P2'], 2000)],
        inclusoes: [MET('met-01', -2), MET('met-02', -1)] });
      assert.equal(r.st, 200, r.texto);
    }
    r = await importar({ escopo: { slug: ANALISTA }, questoes: [Q(1, 'amb-01'), Q(2, 'adm-01')] });
    assert.equal(r.st, 200, r.texto);
    r = await importar({ escopo: { slug: SEM_TRILHA }, questoes: [Q(3, 'amb-01'), Q(4, 'adm-01')] });
    assert.equal(r.st, 200, r.texto);
    for (const escopo of [GERAIS, ANALISTA, SEM_TRILHA]) {
      r = await req('POST', '/staff/api/academy/estudo/status', { semUser: true, chave: true, corpo: E({ escopo, status: 'publicado', unidades: 'publicado', questoes: 'disponivel' }) });
      assert.equal(r.st, 200, r.texto);
    }
    for (const jar of ['tr-veterano', 'tr-curioso', 'tr-so-sem-declarar']) await ALUNO(jar);
    assert.deepEqual([(await proxima('tr-curioso')).tipo, (await proxima('tr-curioso')).unidade], ['aprender', 'amb-01'], 'sem declarar: a primeira praticável, e nunca o método');
    // quem chega com estudo feito ANTES de a trilha ser declarada
    await abrirAula('tr-curioso', 'adm-01');
    const ver = await req('POST', `${esc(ANALISTA)}/questoes/${qid(1)}/responder`, { jar: 'tr-veterano', corpo: { resposta: 'a' } });
    assert.equal(ver.st, 200, ver.texto);
  });

  let antesVeterano = null, antesCurioso = null, antesSemDeclarar = null;
  await t('trilha inicial (ADR-0020): a declaração é conferida — aula que o percurso não tem é recusada (400, nada gravado), e reenviar o perfil ou o percurso sem o campo não a apaga', async () => {
    antesVeterano = await proxima('tr-veterano'); antesCurioso = await proxima('tr-curioso'); antesSemDeclarar = await proxima('tr-so-sem-declarar', SEM_TRILHA);
    let r = await importar({ escopo: { slug: ANALISTA, trilha_inicial: ['met-01', 'aula-que-nao-existe'] } });
    assert.deepEqual([r.st, /trilha_inicial.*aula-que-nao-existe/.test(r.json.erro)], [400, true], r.texto);
    assert.deepEqual(R.Escopos.porSlug(pid, ANALISTA).trilha_inicial, [], 'a recusa desfaz tudo');
    r = await importar({ escopo: { slug: ANALISTA, trilha_inicial: 'met-01' } });
    assert.deepEqual([r.st, /trilha_inicial/.test(r.json.erro)], [400, true], r.texto);
    r = await importar({ escopo: { slug: ANALISTA, trilha_inicial: TRILHA } });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(R.Escopos.porSlug(pid, ANALISTA).trilha_inicial, TRILHA);
    r = await importar({ escopo: { slug: ANALISTA, perfil: { banca: 'Banca de teste' } } });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(R.Escopos.porSlug(pid, ANALISTA).trilha_inicial, TRILHA, 'reenviar o perfil não apaga a trilha');
    assert.deepEqual(R.Escopos.porSlug(pid, SEM_TRILHA).trilha_inicial, [], 'o vizinho não declarou nada');
  });

  await t('trilha inicial (ADR-0020): o aluno NOVO começa pela primeira aula da trilha e anda por ela; abrir não basta, ler conta, e no fim dela vem a matéria — não fica preso', async () => {
    await ALUNO('tr-novo');
    let p = await proxima('tr-novo');
    assert.deepEqual([p.tipo, p.unidade, p.competencia], ['aprender', 'met-01', 'met-edital'], JSON.stringify(p));
    assert.ok(/método|comece/i.test(p.motivo), 'a recomendação diz o porquê: ' + p.motivo);
    await abrirAula('tr-novo', 'met-01');
    assert.equal((await proxima('tr-novo')).unidade, 'met-01', 'só abriu: continua nela');
    await lerAula('tr-novo', 'met-01');
    p = await proxima('tr-novo');
    assert.deepEqual([p.tipo, p.unidade], ['aprender', 'met-02'], JSON.stringify(p));
    await lerAula('tr-novo', 'met-02');
    p = await proxima('tr-novo');
    assert.deepEqual([p.tipo, p.unidade], ['aprender', 'amb-01'], 'trilha lida: a primeira praticável, como sempre');
  });

  await t('trilha inicial (ADR-0020): quem já estudou NÃO muda de caminho — respondeu questão ou abriu aula de matéria, a próxima tarefa é exatamente a de antes', async () => {
    assert.deepEqual(await proxima('tr-veterano'), antesVeterano, 'respondeu questão');
    assert.deepEqual(await proxima('tr-curioso'), antesCurioso, 'abriu aula de matéria');
    assert.notEqual(antesCurioso.unidade, 'met-01');
    await ALUNO('tr-desvio');
    await lerAula('tr-desvio', 'met-01');
    await abrirAula('tr-desvio', 'amb-01');
    assert.notEqual((await proxima('tr-desvio')).unidade, 'met-02', 'o novo que saiu da trilha para a matéria também escolheu: a trilha não o puxa de volta');
  });

  await t('trilha inicial (ADR-0020): percurso que não declarou não muda em nada, mesmo com aula de ordem negativa; só o diagnóstico de entrada não tira o aluno da trilha', async () => {
    assert.deepEqual(await proxima('tr-so-sem-declarar', SEM_TRILHA), antesSemDeclarar);
    assert.equal(antesSemDeclarar.unidade, 'amb-01');
    const c = { vis: ['publicado'], situacoes: ['disponivel'] };
    const analista = R.Escopos.porSlug(pid, ANALISTA);
    const so = R.competencias(analista.id).map(k => ({ codigo: k.codigo, estado: k.codigo === 'amb-01' ? 'em_pratica' : 'nao_avaliada', so_diagnostico: k.codigo === 'amb-01', depende_de: [], estagnada: false }));
    assert.equal(A.proximaTarefa({ id: 'so-diagnostico' }, analista, c, so).unidade, 'met-01', 'o diagnóstico é ponto de partida, não estudo (a régua única também não o conta)');
    const provou = so.map(e => (e.codigo === 'amb-01' ? { ...e, estado: 'demonstrada_sem_apoio', so_diagnostico: false } : e));
    assert.notEqual(A.proximaTarefa({ id: 'com-prova' }, analista, c, provou).unidade, 'met-01', 'evidência de prova ou prática é progresso');
  });

  await t('trilha inicial (ADR-0020): aula da trilha que o aluno não enxerga é pulada, e `trilha_inicial: []` desfaz a declaração', async () => {
    const analista = R.Escopos.porSlug(pid, ANALISTA);
    const zerada = R.competencias(analista.id).map(k => ({ codigo: k.codigo, estado: 'nao_avaliada', depende_de: [], estagnada: false }));
    db.prepare("UPDATE est_unidades SET status = 'rascunho' WHERE codigo = 'met-01'").run();
    R.limparCache();
    assert.equal(A.proximaTarefa({ id: 'ninguem' }, analista, { vis: ['publicado'], situacoes: ['disponivel'] }, zerada).unidade, 'met-02');
    db.prepare("UPDATE est_unidades SET status = 'publicado' WHERE codigo = 'met-01'").run();
    R.limparCache();
    const r = await importar({ escopo: { slug: ANALISTA, trilha_inicial: [] } });
    assert.equal(r.st, 200, r.texto);
    assert.equal(A.proximaTarefa({ id: 'ninguem' }, R.Escopos.porSlug(pid, ANALISTA), { vis: ['publicado'], situacoes: ['disponivel'] }, zerada).unidade, 'amb-01');
  });
}

module.exports = { rodar };
