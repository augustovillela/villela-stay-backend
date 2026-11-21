// =====================================================================
// Villela Academy — ESTUDO · SEMÁFORO POR ASSUNTO, PROPORÇÕES POR FASE e ORDEM 0 NA TRILHA (21/11/2026).
// Piloto de método v2 (aula "Seu perfil e o seu método"). Limiares e fases são configuração inicial, não ciência.
// =====================================================================
'use strict';
const assert = require('assert');

async function rodar({ t, req }) {
  const S = require('./semaforo');
  console.log('\n— estudo/semáforo por assunto, proporções por fase e unidade de ordem 0 na trilha —');

  const ev = (acerto, criado_em, competencia_codigo = 'c') => ({ acerto, criado_em, competencia_codigo });
  const dias = (n) => `2026-11-${String(n).padStart(2, '0')}T12:00:00.000Z`;

  await t('semáforo: vermelho erra com frequência, amarelo oscila, verde acerta com segurança, cinza com poucos dados (limiares na configuração)', async () => {
    const lim = S.limiares({});
    const J = require('./jornada-estude');
    assert.deepEqual([lim.vermelho_abaixo_pct, lim.verde_a_partir_pct], [J.DIAG_FAIXA_BASE_PCT, J.DIAG_FAIXA_FORTE_PCT], 'uma só régua (50/80) com o diagnóstico por disciplina');
    const cor = (arr, hoje = '2026-11-10') => S.corDoAssunto(arr.map((a, i) => ev(a, dias(i + 1))), hoje).cor;
    assert.equal(cor([true, true]), 'sem_dados', 'duas respostas: não condena nem promove');
    assert.equal(cor([false, false, true]), 'vermelho');
    assert.equal(cor([false, true, false, true]), 'amarelo', '50%: oscila');
    assert.equal(cor([true, true, true, true, true]), 'verde');
    assert.equal(cor([true, true, true, true, false]), 'amarelo', '80% mas errou a última: ainda não é segurança');
    assert.equal(cor([true, true, true, false, true]), 'verde', '80% e a última certa');
    const longa = [...Array(8).fill(false), ...Array(8).fill(true)];
    assert.equal(S.corDoAssunto(longa.map((a, i) => ev(a, dias(i + 1))), '2026-11-17').cor, 'verde', 'só a janela conta');
  });

  await t('semáforo: nunca abandonar o verde — verde parado há abandono_dias volta a amarelo; vermelho parado continua vermelho; o perfil ajusta e valor inválido é ignorado', async () => {
    const verde = [true, true, true, true].map((a, i) => ev(a, dias(i + 1)));
    assert.equal(S.corDoAssunto(verde, '2026-11-20').cor, 'verde');
    const parado = S.corDoAssunto(verde, '2026-12-10');
    assert.deepEqual([parado.cor, parado.abandonado], ['amarelo', true]);
    assert.equal(S.corDoAssunto(verde, '2026-11-24').cor, 'verde', '20 dias: ainda verde');
    assert.equal(S.corDoAssunto(verde, '2026-11-25').cor, 'amarelo', '21 dias: volta');
    const verm = [false, false, false].map((a, i) => ev(a, dias(i + 1)));
    assert.equal(S.corDoAssunto(verm, '2027-03-01').cor, 'vermelho');
    assert.equal(S.limiares({ semaforo: { abandono_dias: 5 } }).abandono_dias, 5);
    assert.equal(S.limiares({ semaforo: { abandono_dias: 'x', janela: -3 } }).abandono_dias, 21);
    assert.equal(S.limiares({ semaforo: { vermelho_abaixo_pct: 90, verde_a_partir_pct: 60 } }).vermelho_abaixo_pct, 50, 'faixa incoerente volta ao padrão');
    assert.equal(S.corDoAssunto(verde, '2026-11-10', S.limiares({ semaforo: { min_respostas: 6 } })).cor, 'sem_dados', '4 respostas < mínimo 6');
  });

  await t('proporções por fase: 40/40/20 até 16/01 e 20/50/30 depois, como ponto de partida; o perfil do curso sobrescreve e fase incoerente é ignorada', async () => {
    const p = (d, perfil) => S.proporcoesPorFase(perfil, d).atual;
    assert.deepEqual([p('2026-11-21').teoria, p('2026-11-21').questoes, p('2026-11-21').revisao], [40, 40, 20]);
    assert.equal(p('2027-01-16').id, 'base', '16/01 ainda é da primeira fase');
    assert.deepEqual([p('2027-01-17').teoria, p('2027-01-17').questoes, p('2027-01-17').revisao], [20, 50, 30]);
    const r = S.proporcoesPorFase({}, '2026-11-21');
    assert.equal(r.ponto_de_partida, true);
    assert.ok(/ponto de partida/i.test(r.nota) && /n[aã]o ci[eê]ncia/i.test(r.nota));
    const propria = { fases: [{ id: 'a', rotulo: 'A', ate: '2026-12-01', teoria: 50, questoes: 30, revisao: 20 }, { id: 'b', rotulo: 'B', teoria: 10, questoes: 60, revisao: 30 }] };
    assert.equal(p('2026-11-30', propria).id, 'a');
    assert.equal(p('2026-12-02', propria).id, 'b');
    assert.equal(p('2026-11-30', { fases: [{ ate: '2026-12-01', teoria: 50, questoes: 50, revisao: 50 }] }).id, 'base', 'não soma 100: volta ao padrão');
  });

  // ---- integração: painel do aluno e a trilha com ordem 0 ----
  const PROD = 'maria@t.com', SLUG = 'semaforo-met', JAR = 'sem-aluno';
  let pid = '';
  const E = (extra = {}) => ({ produtor_email: PROD, produto_id: pid, ...extra });
  const importar = (corpo) => req('POST', '/staff/api/academy/estudo/importar', { semUser: true, chave: true, corpo: E(corpo) });
  const esc = () => `/academy/api/aluno/cursos/${pid}/estudo/${SLUG}`;
  const COMP = (codigo) => ({ codigo, resultado: `Diante de um caso de ${codigo}, o aluno aplica a regra e justifica a resposta.` });
  const AULA = (codigo, competencia, itens, ordem) => ({ codigo, titulo: `Aula ${codigo}`, competencias: [competencia], itens, tempo_min: 20, ordem,
    blocos: [{ tipo: 'explicacao', texto: `Explicação da aula ${codigo}, com a regra e o exemplo.` }, { tipo: 'pratica', texto: `Exercício da aula ${codigo}: escreva a sua resposta.`, solucao: 'A solução comentada.' }],
    midias: [], fontes: [{ titulo: 'Fonte de teste', consultado_em: '2026-10-01' }] });
  const Q = (i, competencia) => ({ tipo: 'objetiva', origem: 'autoral', gerada_por_ia: true, enunciado: `Semáforo, questão ${i}: qual é a regra aplicável ao ponto?`, competencias: [competencia],
    alternativas: [{ texto: `certa ${i}`, correta: true, explicacao: 'Certa.' }, { texto: `errada ${i}`, correta: false, explicacao: 'Errada.' }] });

  await t('semáforo no painel: 3 erros dão vermelho, 4 de 7 dão amarelo, o perfil ajusta a régua; proporções rotuladas; e a aula met-07 de ordem 0 cai em 7º na trilha', async () => {
    const { db } = require('../db');
    let r = await req('POST', '/staff/api/academy/importar-curso', { semUser: true, chave: true, corpo: { produtor_email: PROD,
      produto: { titulo: 'Curso do Semáforo', tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Só o percurso' },
      modulos: [{ titulo: 'Comece por aqui', aulas: [{ titulo: 'Aula de orientação', tipo: 'texto', conteudo: 'O conteúdo está no Estude.' }] }] } });
    assert.equal(r.st, 200, r.texto);
    pid = r.json.produto.id;
    const met = [1, 2, 3, 4, 5, 6, 7].map(n => AULA(`met-0${n}`, `met-c${n}`, [], n - 7)); // ordens -6..-1 e 0
    r = await importar({ escopo: { slug: SLUG, tipo: 'edital', titulo: 'Percurso do semáforo' },
      programa: { documento: { nome: 'Edital de teste', tipo: 'edital' }, itens: [{ codigo: 'P1', texto: 'Direito ambiental' }] },
      competencias: [...[1, 2, 3, 4, 5, 6, 7].map(n => COMP(`met-c${n}`)), COMP('amb-01')],
      vinculos: [{ item: 'P1', competencia: 'amb-01', justificativa: 'O item é a própria regra.' }],
      unidades: [...met, AULA('amb-01', 'amb-01', ['P1'], 1000)],
      questoes: [1, 2, 3, 4, 5, 6, 7].map(n => Q(n, 'amb-01')) });
    assert.equal(r.st, 200, r.texto);
    r = await req('POST', '/staff/api/academy/estudo/status', { semUser: true, chave: true, corpo: E({ escopo: SLUG, status: 'publicado', unidades: 'publicado', questoes: 'disponivel' }) });
    assert.equal(r.st, 200, r.texto);
    const email = `${JAR}@t.com`;
    assert.equal((await req('POST', '/academy/api/signup', { corpo: { nome: 'Aluno Semáforo', email, senha: 'senha-forte-semaforo', aceite_termos: true }, jar: JAR })).st, 200);
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${pid}/matricular`, { jar: 'maria', corpo: { email } })).st, 200);
    const painel = async () => { const x = await req('GET', `${esc()}/painel`, { jar: JAR }); assert.equal(x.st, 200, x.texto); return x.json; };
    const qid = (i) => db.prepare('SELECT id FROM est_questoes WHERE dados LIKE ?').get(`%Semáforo, questão ${i}:%`).id;
    const resp = async (i, certa) => { const x = await req('POST', `${esc()}/questoes/${qid(i)}/responder`, { jar: JAR, corpo: { resposta: certa ? 'a' : 'b' } }); assert.equal(x.st, 200, x.texto); };

    let p = await painel();
    assert.deepEqual(p.semaforo.assuntos, [], 'sem resposta, sem semáforo');
    assert.equal(p.proporcoes_fase.ponto_de_partida, true);
    const at = p.proporcoes_fase.atual;
    assert.equal(at.teoria + at.questoes + at.revisao, 100);
    const cods = p.unidades.map(u => u.codigo);
    assert.deepEqual(cods, ['met-01', 'met-02', 'met-03', 'met-04', 'met-05', 'met-06', 'met-07', 'amb-01'], 'met-07 (ordem 0) é a 7ª da trilha');
    assert.equal(db.prepare("SELECT ordem FROM est_unidades WHERE codigo = 'met-07' AND escopo_id = ?").get(require('./repo').Escopos.porSlug(pid, SLUG).id).ordem, 0, 'ordem 0 explícita gravada como 0');

    await resp(1, false); await resp(2, false);
    assert.equal((await painel()).semaforo.assuntos[0].cor, 'sem_dados', 'duas respostas: poucos dados');
    await resp(3, false);
    p = await painel();
    assert.deepEqual([p.semaforo.assuntos[0].codigo, p.semaforo.assuntos[0].cor, p.semaforo.resumo.vermelho], ['amb-01', 'vermelho', 1]);
    assert.equal(p.semaforo.assuntos[0].nome, 'Aula amb-01', 'o nome do assunto é o da aula que o cobre');
    for (const i of [4, 5, 6, 7]) await resp(i, true);
    p = await painel();
    assert.deepEqual([p.semaforo.assuntos[0].total, p.semaforo.assuntos[0].acertos, p.semaforo.assuntos[0].cor], [7, 4, 'amarelo'], '4 de 7 (57%): oscila');
    r = await importar({ escopo: { slug: SLUG, perfil: { semaforo: { verde_a_partir_pct: 55 }, fases: [{ id: 'unica', rotulo: 'Fase única', ate: '2099-01-01', teoria: 10, questoes: 60, revisao: 30 }, { id: 'resto', rotulo: 'Resto', teoria: 10, questoes: 60, revisao: 30 }] } } });
    assert.equal(r.st, 200, r.texto);
    p = await painel();
    assert.equal(p.semaforo.assuntos[0].cor, 'verde', 'com verde a partir de 55%, a mesma prática vira verde');
    assert.equal(p.semaforo.criterios.verde_a_partir_pct, 55);
    assert.equal(p.proporcoes_fase.atual.id, 'unica');
  });
}

module.exports = { rodar };
