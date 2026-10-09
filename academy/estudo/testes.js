// =====================================================================
// Villela Academy — ESTUDO · testes. Chamado pelo selftest da Academy
// (npm run test:academy), que entrega o servidor de pé, o curso importado
// (impId, da Maria), a Olga (tem o curso) e o Caio (não tem).
// As datas são calculadas a partir de hoje — nada de dia fixo que vence.
// =====================================================================
'use strict';
const assert = require('assert');
const pontuacao = require('./pontuacao');
const evidencia = require('./evidencia');
const agenda = require('./agenda');
const plano = require('./plano');
const edital = require('./edital');
const banco = require('./banco');

async function rodar({ t, req, EST, impId }) {
  const { db } = require('../db');

  // ================= motores puros =================
  console.log('\n— estudo: motores puros (pontuação, evidência, agenda, plano, programa, banco) —');

  await t('estudo/pontuação: desconto por erro, abstenção ≠ em branco, anulada e denominador', async () => {
    const itens = Array.from({ length: 10 }, (_, i) => ({ id: 'i' + (i + 1), gabarito: 'a', bloco: i < 5 ? 'A' : 'B' }));
    const resp = { i1: 'a', i2: 'a', i3: 'a', i4: 'a', i5: 'a', i6: 'a', i7: 'b', i8: 'b', i10: pontuacao.ABSTENCAO }; // i9 em branco
    const simples = pontuacao.corrigir(itens, resp);
    assert.deepEqual([simples.nota_bruta, simples.nota_liquida, simples.maximo, simples.aprovado], [6, 6, 10, null], 'sem regra: 1 ponto por acerto e nenhum critério inventado');
    assert.deepEqual([simples.certas, simples.erradas, simples.em_branco, simples.abstencoes], [6, 2, 1, 1]);
    const regra = { desconto: { a_cada: 3 }, fonte: 'regulamento de teste' };
    assert.equal(pontuacao.corrigir(itens, resp, regra).nota_liquida, 6, '2 erradas não fecham um conjunto de 3');
    const comBranco = pontuacao.corrigir(itens, resp, { ...regra, em_branco_conta_erro: true });
    assert.deepEqual([comBranco.erradas, comBranco.erros_contados, comBranco.descontados, comBranco.nota_liquida], [2, 3, 1, 5], 'em branco entra no desconto sem virar "errada"; abstenção marcada não entra');
    assert.equal(pontuacao.corrigir(itens, resp, { ...regra, em_branco_conta_erro: true, aprovacao: { min_pontos: 6 } }).aprovado, false);
    const anulada = itens.map(i => (i.id === 'i7' ? { ...i, anulada: true } : i));
    assert.equal(pontuacao.corrigir(anulada, resp).nota_bruta, 7, 'anulada: ponto para todos');
    assert.equal(pontuacao.corrigir(anulada, resp, { anulada: 'excluida' }).maximo, 9, 'ou sai do denominador, se a regra disser');
    assert.equal(pontuacao.corrigir([{ id: 'm', gabarito: ['a', 'c'] }], { m: ['c', 'a'] }).nota_bruta, 1, 'múltipla: o conjunto, não a ordem');
    assert.throws(() => pontuacao.corrigir([{ id: 'x' }], {}), /sem gabarito/);
    assert.deepEqual(pontuacao.corrigir(itens, resp, regra), pontuacao.corrigir(itens, resp, regra), 'reproduzível');
  });

  await t('estudo/evidência: com apoio ≠ sem apoio ≠ retida; questão repetida não prova; falha reabre', async () => {
    const e = (dia, extra) => ({ acerto: true, modo: 'pratica', pistas: 0, inedita: true, criado_em: `2026-01-${String(dia).padStart(2, '0')}T12:00:00.000Z`, ...extra });
    const est = (l) => evidencia.estadoDaCompetencia(l).estado;
    assert.equal(est([]), 'nao_avaliada');
    assert.equal(est([e(1, { pistas: 1 })]), 'demonstrada_com_apoio', 'acerto com pista');
    assert.equal(est([e(1, { modo: 'estudo' })]), 'demonstrada_com_apoio', 'acerto em modo estudo');
    assert.equal(est([e(1, { inedita: false })]), 'demonstrada_com_apoio', 'acertar questão já vista é lembrança da questão');
    assert.equal(est([e(1)]), 'demonstrada_sem_apoio');
    assert.equal(est([e(1), e(3)]), 'demonstrada_sem_apoio', '2 dias depois ainda não é retenção');
    const ret = evidencia.estadoDaCompetencia([e(1), e(9)]);
    assert.deepEqual([ret.estado, ret.intervalo_dias], ['retida', 8]);
    assert.equal(est([e(1), e(9, { inedita: false })]), 'demonstrada_sem_apoio', 'retenção exige item inédito');
    assert.equal(est([e(1), e(9), e(10, { acerto: false })]), 'em_pratica', 'falha sem apoio derruba até a retenção');
    assert.equal(est([e(1), e(2, { acerto: false, modo: 'estudo' })]), 'demonstrada_sem_apoio', 'erro em modo estudo não rebaixa');
    assert.equal(est([e(1, { acerto: false })]), 'em_pratica');
  });

  await t('estudo/agenda: escada, erro volta ao início, ajuda não sobe, prova encurta e fila não some com nada', async () => {
    const p = (x) => agenda.proxima({ hoje: '2026-10-08', ...x });
    assert.deepEqual([p({ passo: -1, resultado: 'acerto' }).passo, p({ passo: -1, resultado: 'acerto' }).vencimento], [0, '2026-10-09']);
    assert.equal(p({ passo: 0, resultado: 'acerto' }).vencimento, '2026-10-11');
    assert.equal(p({ passo: 3, resultado: 'erro' }).passo, 0);
    assert.deepEqual([p({ passo: 2, resultado: 'acerto_com_ajuda' }).passo, p({ passo: 2, resultado: 'acerto_com_ajuda' }).vencimento], [2, '2026-10-15']);
    assert.equal(p({ passo: 9, resultado: 'acerto' }).passo, agenda.ESCADA_PADRAO.length - 1, 'não passa do último degrau');
    assert.equal(p({ passo: 3, resultado: 'acerto', prazo: '2026-10-20' }).vencimento, '2026-10-19', 'cabe antes da prova');
    const sem = p({ passo: -1, resultado: 'acerto', prazo: '2026-10-09' });
    assert.equal(sem.vencimento, ''); assert.ok(/não será verificada/.test(sem.motivo), 'diz que a retenção não será verificada');
    const revs = [{ alvo_id: 'a', vencimento: '2026-10-07' }, { alvo_id: 'b', vencimento: '2026-10-01' }, { alvo_id: 'c', vencimento: '2026-10-08', essencial: true }, { alvo_id: 'd', vencimento: '2026-10-09' }, { alvo_id: 'e', vencimento: '' }];
    const f = agenda.fila(revs, { hoje: '2026-10-08', limite: 2 });
    assert.deepEqual(f.hoje.map(r => r.alvo_id), ['c', 'b'], 'essencial primeiro, depois a mais atrasada');
    assert.deepEqual([f.adiadas, f.total_vencidas], [1, 3], 'o que não coube aparece contado');
  });

  await t('estudo/plano: o exemplo do prompt (42 h para 60–75 h) mostra déficit de 18–33 h e não inventa hora', async () => {
    const itens = Array.from({ length: 10 }, (_, i) => ({ codigo: '1.' + (i + 1), ordem: i, esforco_min: [360, 450] }));
    const seisPorSemana = { seg: 60, ter: 60, qua: 60, qui: 60, sex: 60, sab: 60 };
    const p = plano.planejar({ hoje: '2026-10-05', data_alvo: '2026-11-23', disponibilidade: seisPorSemana, margem_pct: 0, itens });
    assert.equal(p.viabilidade.capacidade_bruta_min, 42 * 60);
    assert.deepEqual(p.viabilidade.esforco_min, [60 * 60, 75 * 60]);
    assert.deepEqual(p.viabilidade.deficit_min, [18 * 60, 33 * 60]);
    assert.equal(p.viabilidade.situacao, 'nao_cabe');
    assert.ok(p.pendentes.length >= 5, 'o que não coube fica listado');
    const usado = p.sessoes.reduce((a, s) => a + s.revisao_min + s.estudo.reduce((b, e) => b + e.minutos, 0), 0);
    assert.ok(usado <= 42 * 60, 'nenhum minuto além do declarado');
    assert.ok(p.sessoes.every(s => new Date(s.data + 'T00:00:00Z').getUTCDay() !== 0), 'domingo não foi declarado: não recebe sessão');
    const comFolga = plano.planejar({ hoje: '2026-10-05', data_alvo: '2026-11-23', disponibilidade: seisPorSemana, indisponiveis: ['2026-10-06'], margem_pct: 0, itens });
    assert.equal(comFolga.viabilidade.capacidade_bruta_min, 41 * 60, 'dia indisponível sai da capacidade');
    const livre = plano.planejar({ hoje: '2026-10-05', disponibilidade: seisPorSemana, itens: [{ codigo: 'a', esforco_min: [60, 120] }, { codigo: 'b', esforco_min: [60, 120] }, { codigo: 'c' }] });
    assert.deepEqual([livre.viabilidade.situacao, livre.conclusao_estimada, livre.pendentes.length], ['sem_prazo', '2026-10-09', 0], 'sem prova marcada: diz quando termina no ritmo declarado');
    assert.deepEqual(livre.viabilidade.sem_estimativa, ['c'], 'item sem estimativa é dito, não chutado');
    assert.deepEqual(plano.ordenar([{ codigo: 'b', depende_de: ['a'], peso: 9 }, { codigo: 'a' }]).map(i => i.codigo), ['a', 'b'], 'pré-requisito antes, mesmo com peso menor');
    assert.throws(() => plano.ordenar([{ codigo: 'a', depende_de: ['b'] }, { codigo: 'b', depende_de: ['a'] }]), /circular/);
    assert.throws(() => plano.planejar({ hoje: '2026-10-05', data_alvo: '2026-11-23', disponibilidade: {}, itens }), /ao menos um dia/);
  });

  await t('estudo/programa: texto numerado vira itens sem perder linha, e retificação é comparada', async () => {
    const { itens, sobras } = edital.extrairDoTexto('CONTEÚDO PROGRAMÁTICO\n1. Direito do Trabalho\n1.1 Prescrição e\ndecadência\n\n1.2) FGTS\n2 Processo');
    assert.deepEqual(sobras, ['CONTEÚDO PROGRAMÁTICO'], 'o que veio antes do primeiro número volta, não some');
    assert.deepEqual(itens.map(i => i.codigo), ['1', '1.1', '1.2', '2']);
    assert.equal(itens[1].texto, 'Prescrição e decadência', 'linha quebrada continua o item');
    const n = edital.normalizarItens(itens);
    assert.deepEqual(n.map(i => [i.codigo, i.pai, i.folha]), [['1', '', false], ['1.1', '1', true], ['1.2', '1', true], ['2', '', true]]);
    assert.throws(() => edital.normalizarItens([{ codigo: '1', texto: 'a' }, { codigo: '1', texto: 'b' }]), /repetido/);
    const v2 = edital.normalizarItens([{ codigo: '1', texto: 'Direito do Trabalho' }, { codigo: '1.1', texto: 'Prescrição e decadência' }, { codigo: '1.2', texto: 'FGTS e contribuições' }, { codigo: '3', texto: 'Novo' }]);
    const d = edital.comparar(n, v2);
    assert.deepEqual([d.mudou, d.adicionados.map(x => x.codigo), d.removidos.map(x => x.codigo), d.alterados.map(x => x.codigo), d.iguais], [true, ['3'], ['2'], ['1.2'], 2]);
    assert.equal(edital.comparar(n, edital.normalizarItens(itens)).mudou, false);
  });

  const ALTS = (i) => [
    { texto: `certa ${i}`, correta: true, explicacao: 'Certa: é a regra do art. 7º, XXIX.' },
    { texto: `errada ${i}a`, correta: false, explicacao: 'Errada: confunde os dois prazos.' },
    { texto: `errada ${i}b`, correta: false, explicacao: 'Errada: soma os prazos.' }];
  const Q = (i, extra = {}) => ({ tipo: 'objetiva', origem: 'autoral', enunciado: `Questão de estudo número ${i} sobre prescrição trabalhista`, alternativas: ALTS(i), competencias: ['prescricao'], ...extra });
  const OFICIAL = { banca: 'Banca Teste', concurso: 'Concurso de Teste', ano: 2023, fonte: 'https://exemplo.test/prova.pdf', caderno: 'Tipo 1', numero_original: '12' };

  await t('estudo/banco: procedência é trava — oficial exige fonte, IA nunca é oficial, autoral não leva banca', async () => {
    const v = (q) => banco.validarQuestao(q);
    assert.throws(() => v(Q(1, { origem: 'oficial', gabarito_situacao: 'definitivo', procedencia: { banca: 'Banca Teste' } })), /exige banca ou órgão, concurso, ano e fonte/);
    assert.throws(() => v(Q(1, { origem: 'oficial', gabarito_situacao: 'definitivo', gerada_por_ia: true, procedencia: OFICIAL })), /IA não pode ter origem oficial/);
    assert.throws(() => v(Q(1, { procedencia: { banca: 'Banca Teste' } })), /autoral não leva banca/);
    assert.ok(v(Q(1, { procedencia: { inspirada_em: 'estilo da Banca Teste' } })), '"inspirada em" é o lugar certo');
    assert.throws(() => v(Q(1, { origem: 'adaptada', procedencia: { adaptada_de: 'Q12 da prova X' } })), /alteracao/);
    assert.throws(() => v(Q(1, { origem: 'relato', procedencia: { fonte: 'fórum' } })), /grau_verificacao/);
    assert.throws(() => v(Q(1, { gabarito_situacao: 'definitivo' })), /só questão oficial tem gabarito de banca/);
    assert.throws(() => v(Q(1, { alternativas: ALTS(1).map(a => ({ ...a, correta: true })) })), /exatamente uma/);
    assert.throws(() => v(Q(1, { alternativas: ALTS(1).map(a => ({ ...a, explicacao: '' })) })), /explicação/);
    assert.throws(() => v({ tipo: 'discursiva', origem: 'autoral', enunciado: 'Disserte sobre a prescrição', rubrica: [{ criterio: 'só um' }] }), /rubrica/);
    const semGab = v(Q(1, { origem: 'oficial', gabarito_situacao: 'sem_gabarito_oficial', procedencia: OFICIAL, alternativas: ALTS(1).map(a => ({ texto: a.texto })) }));
    assert.equal(semGab.corrigivel, false, 'sem gabarito confirmado: fica fora da correção automática');
    const a = v(Q(1)), b = v(Q(1, { alternativas: [...ALTS(1)].reverse() }));
    assert.equal(a.hash, b.hash, 'mesma questão em outro caderno (ordem trocada) = mesma questão');
    assert.notEqual(a.hash, v(Q(2)).hash);
    const pub = JSON.stringify(banco.paraAluno({ ...a, id: 'q1' }, 'semente'));
    assert.ok(!/correta|explicacao|Certa: é a regra/.test(pub), 'o que vai ao navegador não leva gabarito nem explicação');
    assert.deepEqual(banco.embaralhar([1, 2, 3, 4, 5], 's'), banco.embaralhar([1, 2, 3, 4, 5], 's'), 'mesma semente, mesma ordem');
  });

  // ================= pelo servidor =================
  console.log('\n— estudo: importação, cobertura, prática, prova com relógio, cards e plano —');
  const daqui = (dias) => new Date(Date.now() - 3 * 3600e3 + dias * 86400e3).toISOString().slice(0, 10);
  const SLUG = 'concurso-teste';
  const importar = (corpo) => req('POST', '/staff/api/academy/estudo/importar', { semUser: true, chave: true, corpo: EST(corpo) });
  const ESC = (extra = {}) => ({ slug: SLUG, tipo: 'edital', titulo: 'Concurso de Teste — Analista', ...extra });
  const UNIDADE = (extra = {}) => ({ codigo: 'prescricao-base', titulo: 'Prescrição: a regra e o caso', competencias: ['prescricao'], itens: ['1.1'], tempo_min: 30,
    blocos: [
      { tipo: 'explicacao', texto: 'A pretensão trabalhista prescreve em cinco anos, limitada a dois após o fim do contrato.' },
      { tipo: 'pratica', texto: 'O contrato terminou há três anos. O que ainda pode ser cobrado? Escreva a sua resposta.', pistas: ['Comece pelo prazo de dois anos.'], solucao: 'Nada: o prazo bienal já se esgotou.' }],
    midias: [{ tipo: 'video', estado: 'roteirizado' }], fontes: [{ titulo: 'Constituição, art. 7º, XXIX', consultado_em: daqui(0) }], ...extra });
  const COMPLETO = () => ({
    escopo: ESC({ nivel: 'preparação para prova', extensao: 'preparacao', data_alvo: daqui(14),
      regra_pontuacao: { desconto: { a_cada: 3 }, em_branco_conta_erro: true, fonte: 'Regulamento de teste, art. 1º' } }),
    programa: { documento: { nome: 'Edital 1/2026', tipo: 'edital', data: daqui(-30) },
      texto: 'Programa\n1. Direito do Trabalho\n1.1 Prescrição\n1.2 FGTS\n2. Processo do Trabalho\n2.1 Recursos' },
    competencias: [
      { codigo: 'prescricao', resultado: 'Diante de um caso, o aluno identifica o prazo prescricional aplicável e justifica.', criterios: ['Aplica o prazo certo'] },
      { codigo: 'fgts', resultado: 'Diante de depósitos não feitos, o aluno aplica a prescrição do FGTS com o marco temporal.', depende_de: ['prescricao'] },
      { codigo: 'recursos', resultado: 'Diante de uma decisão, o aluno escolhe o recurso cabível e o prazo.' }],
    vinculos: [
      { item: '1.1', competencia: 'prescricao', justificativa: 'O item é a própria regra de prescrição.' },
      { item: '1.2', competencia: 'fgts', justificativa: 'O item cobra a prescrição aplicada ao FGTS.' },
      { item: '2.1', competencia: 'recursos', justificativa: 'O item é o cabimento dos recursos.' }],
    unidades: [UNIDADE()],
    questoes: [
      Q(1, { pistas: ['Lembre do prazo bienal.'] }), Q(2), Q(3), Q(4), Q(5, { competencias: ['fgts'] }),
      Q(6, { origem: 'oficial', gabarito_situacao: 'definitivo', procedencia: OFICIAL, competencias: [], disciplina: 'Processo', bloco: 'II', itens: [{ codigo: '2.1', justificativa: 'Pede o recurso cabível contra sentença.' }] }),
      Q(7, { uso: 'reservada' }),
      { tipo: 'discursiva', origem: 'autoral', enunciado: 'Disserte sobre a prescrição intercorrente no processo do trabalho.', competencias: ['prescricao'], rubrica: [{ criterio: 'Conceito' }, { criterio: 'Aplicação ao caso' }] }],
    cards: [
      { competencia: 'prescricao', frente: 'Qual é o prazo prescricional após o fim do contrato?', verso: 'Dois anos.', fonte: 'CF, art. 7º, XXIX' },
      { competencia: 'prescricao', frente: 'E durante o contrato, até quando se cobra?', verso: 'Os últimos cinco anos.' }],
  });
  const base = `/academy/api/aluno/cursos/${impId}/estudo`;
  const esc = `${base}/${SLUG}`;
  const idDe = (i) => db.prepare("SELECT id FROM est_questoes WHERE dados LIKE ?").get(`%Questão de estudo número ${i} sobre%`).id;

  await t('estudo: importação só com a chave, nasce em rascunho e o aluno não vê; a dona revisa', async () => {
    assert.equal((await req('POST', '/staff/api/academy/estudo/importar', { semUser: true, corpo: EST(COMPLETO()) })).st, 401, 'sem chave');
    assert.equal((await req('POST', '/staff/api/academy/estudo/importar', { user: 'op', corpo: EST(COMPLETO()) })).st, 403, 'staff sem admin');
    const r = await importar(COMPLETO());
    assert.equal(r.st, 200, r.texto);
    const i = r.json.importado;
    assert.deepEqual([i.criado, i.programa.versao, i.programa.itens, i.programa.sobras], [true, 1, 5, ['Programa']]);
    assert.deepEqual(i.questoes, { novas: 8, duplicadas: 0, atualizadas: 0, sem_vinculo: 0, fora_da_correcao: 1 });
    assert.equal(r.json.resumo.status, 'rascunho', 'importar nunca publica');
    assert.deepEqual((await req('GET', base, { jar: 'olga' })).json.escopos, [], 'aluna não enxerga rascunho');
    assert.equal((await req('GET', `${esc}/painel`, { jar: 'olga' })).st, 404);
    const dona = await req('GET', `${esc}/painel`, { jar: 'maria' });
    assert.equal(dona.st, 200, dona.texto);
    assert.equal(dona.json.revisor, true);
  });

  await t('estudo: a importação recusa aula sem ação do aluno, vínculo sem justificativa, regra sem fonte e roteiro com arquivo', async () => {
    const recusa = async (corpo, padrao) => { const r = await importar({ escopo: ESC(), ...corpo }); assert.equal(r.st, 400, r.texto); assert.ok(padrao.test(r.json.erro), r.json.erro); };
    await recusa({ unidades: [UNIDADE({ blocos: [{ tipo: 'explicacao', texto: 'Só explicação, sem nada para o aluno fazer.' }] })] }, /ação do aluno/);
    await recusa({ unidades: [UNIDADE({ midias: [{ tipo: 'video', estado: 'roteirizado', url: 'https://exemplo.test/v.mp4' }] })] }, /não tem arquivo/);
    await recusa({ unidades: [UNIDADE({ itens: ['9.9'] })] }, /não existe no programa/);
    await recusa({ vinculos: [{ item: '1.1', competencia: 'prescricao' }] }, /justifique/);
    await recusa({ escopo: ESC({ regra_pontuacao: { desconto: { a_cada: 3 } } }) }, /fonte/);
    await recusa({ questoes: [Q(90, { procedencia: { banca: 'Banca Teste' } })] }, /autoral não leva banca/);
    await recusa({ competencias: [{ codigo: 'x', resultado: 'Diante de algo, o aluno faz algo observável.', depende_de: ['nao-existe'] }] }, /não existe/);
    await recusa({ cards: [{ competencia: 'prescricao', frente: 'Pergunta enorme?', verso: 'x'.repeat(601) }] }, /divida/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM est_questoes WHERE dados LIKE '%número 90 sobre%'").get().n, 0, 'importação recusada não deixa resto');
  });

  await t('estudo: reimportar não duplica questão nem cria versão do programa', async () => {
    const r = await importar(COMPLETO());
    assert.equal(r.st, 200, r.texto);
    assert.equal(r.json.importado.programa.sem_mudanca, true);
    assert.deepEqual([r.json.importado.questoes.novas, r.json.importado.questoes.duplicadas], [0, 8]);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM est_questoes').get().n, 8);
    const outroCaderno = await importar({ escopo: ESC(), questoes: [Q(2, { alternativas: [...ALTS(2)].reverse() })] });
    assert.deepEqual([outroCaderno.json.importado.questoes.novas, outroCaderno.json.importado.questoes.duplicadas], [0, 1], 'alternativas em outra ordem = a mesma questão');
    const q2 = JSON.parse(db.prepare("SELECT dados FROM est_questoes WHERE dados LIKE '%número 2 sobre%'").get().dados);
    assert.deepEqual(q2.alternativas.map(a => [a.id, a.correta]), [['a', true], ['b', false], ['c', false]], 'a letra de cada alternativa não muda com o caderno');
  });

  await t('estudo: publicado, o painel separa material, avaliação, estudo e domínio — e explica a próxima tarefa', async () => {
    const pub = await req('POST', '/staff/api/academy/estudo/status', { semUser: true, chave: true, corpo: EST({ escopo: SLUG, status: 'publicado', unidades: 'publicado', cards: 'publicado', questoes: 'disponivel' }) });
    assert.equal(pub.st, 200, pub.texto);
    assert.equal((await req('GET', `${esc}/painel`, { jar: 'caio' })).st, 403, 'quem não tem o curso não entra');
    const p = (await req('GET', `${esc}/painel`, { jar: 'olga' })).json;
    assert.deepEqual(p.cobertura.material, { com: 1, sem: 2 }, '1 de 3 folhas tem aula');
    assert.deepEqual(p.cobertura.avaliacao, { com_questao_revisada: 0, so_sugerida: 1, sem: 2 }, 'vínculo sugerido não conta como revisado');
    assert.deepEqual(p.cobertura.dominio, { com_apoio: 0, sem_apoio: 0, retidos: 0 }, 'ter material não é ter aprendido');
    assert.equal(p.cobertura.estudo.estudados, 0);
    assert.deepEqual([p.proxima.tipo, p.proxima.competencia, p.proxima.unidade], ['aprender', 'prescricao', 'prescricao-base']);
    assert.ok(p.proxima.motivo.length > 10, 'toda recomendação diz o porquê');
    const rev = await req('POST', '/staff/api/academy/estudo/status', { semUser: true, chave: true, corpo: EST({ escopo: SLUG, vinculos: 'revisado' }) });
    assert.equal(rev.st, 200, rev.texto);
    assert.equal((await req('GET', `${esc}/painel`, { jar: 'olga' })).json.cobertura.avaliacao.com_questao_revisada, 1);
  });

  await t('estudo: aula ativa — a solução só sai contra uma tentativa escrita', async () => {
    const u = await req('GET', `${esc}/unidades/prescricao-base`, { jar: 'olga' });
    assert.equal(u.st, 200, u.texto);
    assert.ok(!/prazo bienal já se esgotou|Comece pelo prazo/.test(u.texto), 'solução e pista não vão junto com a aula');
    assert.deepEqual(u.json.midias, [{ tipo: 'video', estado: 'roteirizado', url: '', nota: '' }], 'roteiro aparece como roteiro');
    assert.equal((await req('POST', `${esc}/unidades/prescricao-base/blocos/1/solucao`, { jar: 'olga', corpo: { tentativa: 'sei lá' } })).st, 400);
    const sol = await req('POST', `${esc}/unidades/prescricao-base/blocos/1/solucao`, { jar: 'olga', corpo: { tentativa: 'Acho que ainda dá para cobrar os últimos cinco anos.' } });
    assert.ok(/bienal/.test(sol.json.solucao), sol.texto);
  });

  await t('estudo: níveis 50/25/10 derivam do 100 e medem o tamanho; mudou o 100, o resumo fica desatualizado (ADR-0005)', async () => {
    const cheio = UNIDADE().blocos[0].texto; // 93 caracteres
    let r = await importar({ escopo: ESC(), unidades: [UNIDADE({ niveis: { 50: cheio } })] });
    assert.equal(r.st, 400, 'texto inteiro não é resumo de 50 %: ' + r.texto);
    r = await importar({ escopo: ESC(), unidades: [UNIDADE({ niveis: { 50: 'Prescrição: cinco anos, limitados a dois após o fim.' },
      vespera: { objetiva: { fichas: [{ frente: 'Prazo da prescrição trabalhista?', verso: '5 anos, até 2 após o fim do contrato (CF, art. 7º, XXIX).' }], slides: [{ titulo: 'Prescrição', topicos: ['quinquenal', 'bienal'] }] } } })] });
    assert.equal(r.st, 200, r.texto);
    let u = await req('GET', `${esc}/unidades/prescricao-base?nivel=50`, { jar: 'olga' });
    assert.equal(u.json.nivel, 50, u.texto);
    assert.deepEqual(u.json.niveis.map(n => n.nivel), [100, 50], 'do completo ao esqueleto, nessa ordem');
    assert.equal(u.json.tempo_min, Math.round(30 * 0.75), 'o tempo acompanha o nível: só a leitura encolhe');
    assert.ok(/limitados a dois/.test(u.json.blocos[0].texto) && !/pretensão trabalhista/.test(u.json.blocos[0].texto), 'a explicação é a condensada');
    assert.equal(u.json.blocos.length, 2, 'prática não encolhe');
    assert.equal(u.json.vespera.objetiva.fichas.length, 1);
    assert.equal(u.json.vespera.objetiva.desatualizado, false);
    assert.equal((await req('GET', `${esc}/unidades/prescricao-base?nivel=25`, { jar: 'olga' })).json.nivel, 100, 'nível que não existe cai para o 100');
    assert.equal((await importar({ escopo: ESC(), unidades: [UNIDADE({ vespera: { prova: { mapa: 'x' } } })] })).st, 400, 'foco inventado é recusado');
    // o 100 mudou (sem mandar níveis): o 50 continua guardado, mas marcado — e o aluno recebe o 100 com o motivo
    const b = UNIDADE().blocos; b[0] = { ...b[0], texto: b[0].texto + ' A contagem começa na lesão do direito.' };
    r = await importar({ escopo: ESC(), unidades: [UNIDADE({ blocos: b })] });
    assert.equal(r.st, 200, r.texto);
    u = await req('GET', `${esc}/unidades/prescricao-base?nivel=50`, { jar: 'olga' });
    assert.deepEqual([u.json.nivel, u.json.niveis.find(n => n.nivel === 50).desatualizado], [100, true], u.texto);
    assert.ok(/ficou para trás/.test(u.json.nivel_motivo), u.json.nivel_motivo);
    assert.equal((await importar({ escopo: ESC(), unidades: [UNIDADE()] })).st, 200, 'volta ao original para os testes seguintes');
  });

  await t('estudo: importação por partes não embaralha a ordem — novo entra no fim, existente fica, "ordem" explícita vale', async () => {
    const ord = (cod) => db.prepare('SELECT u.ordem FROM est_unidades u JOIN est_escopos e ON e.id = u.escopo_id WHERE e.slug = ? AND u.codigo = ?').get(SLUG, cod).ordem;
    const antes = ord('prescricao-base');
    // segundo envio, só com uma unidade nova (como uma disciplina que chega depois): não pode ocupar a posição 0
    let r = await importar({ escopo: ESC(), unidades: [UNIDADE({ codigo: 'segunda-leva', titulo: 'Unidade que chegou depois', itens: [] })] });
    assert.equal(r.st, 200, r.texto);
    assert.ok(ord('segunda-leva') > antes, 'a unidade nova entra depois das que já existiam');
    assert.equal(ord('prescricao-base'), antes, 'quem já existia não muda de lugar');
    r = await importar({ escopo: ESC(), unidades: [UNIDADE({ codigo: 'segunda-leva', titulo: 'Unidade que chegou depois', itens: [], ordem: -5 })] });
    assert.equal(ord('segunda-leva'), -5, 'ordem explícita vale');
    db.prepare("DELETE FROM est_unidades WHERE codigo = 'segunda-leva'").run(); // não interfere nos testes seguintes
  });

  await t('estudo: competência sem questão praticável não prende a próxima tarefa; questão transversal não fura a mão dupla', async () => {
    const escId = db.prepare('SELECT id FROM est_escopos WHERE slug = ?').get(SLUG).id;
    const cobUrl = `/staff/api/academy/estudo/cobertura?produtor_email=maria@t.com&produto_id=${impId}&escopo=${SLUG}`;
    const semFolhaAntes = (await req('GET', cobUrl, { semUser: true, chave: true })).json.cobertura.mao_dupla.questoes_sem_folha;
    // competência de leitura (método de estudo), posta em PRIMEIRO lugar e sem questão nenhuma
    let r = await importar({ escopo: ESC(), competencias: [{ codigo: 'so-leitura', ordem: -10, resultado: 'Diante do edital, o aluno monta o próprio ciclo de estudo.', criterios: ['monta o ciclo'] }],
      unidades: [UNIDADE({ codigo: 'so-leitura', titulo: 'Como estudar', competencias: ['so-leitura'], itens: [], ordem: -10 })] });
    assert.equal(r.st, 200, r.texto);
    await req('POST', '/staff/api/academy/estudo/status', { semUser: true, chave: true, corpo: EST({ escopo: SLUG, unidades: 'publicado' }) });
    const praticavel = require('./repo').competenciasComPratica(escId, ['disponivel', 'rascunho']);
    assert.ok(!praticavel.has('so-leitura') && praticavel.has('prescricao'), 'só é praticável quem tem questão corrigível fora da reserva');
    const rp = await req('GET', `${esc}/painel`, { jar: 'olga' });
    assert.equal(rp.st, 200, rp.texto);
    const px = rp.json.proxima, naoAvaliadas = rp.json.competencias.filter(k => k.estado === 'nao_avaliada').map(k => k.codigo);
    assert.ok(naoAvaliadas.includes('so-leitura'), 'a competência de leitura está lá, não avaliada');
    // só pode ser a próxima como ÚLTIMO recurso (nada praticável pendente), e aí o motivo diz que falta questão
    if (px.competencia === 'so-leitura') assert.ok(/ainda não tem questões/.test(px.motivo) && !naoAvaliadas.some(k => praticavel.has(k)), JSON.stringify(px));
    // e o motor puro, com aluna que nunca respondeu nada: a primeira da ordem é a de leitura, mas a próxima é a praticável
    const A = require('./aluno'), R2 = require('./repo');
    const escopoObj = R2.Escopos.porSlug(impId, SLUG);
    const zerada = R2.competencias(escopoObj.id).map(k => ({ codigo: k.codigo, estado: 'nao_avaliada', depende_de: [], estagnada: false }));
    assert.equal(zerada[0].codigo, 'so-leitura', 'a de leitura é a primeira da ordem');
    const prox = A.proximaTarefa({ id: 'ninguem' }, escopoObj, { vis: ['publicado'], situacoes: ['disponivel', 'rascunho'] }, zerada);
    assert.ok(prox.competencia && prox.competencia !== 'so-leitura' && praticavel.has(prox.competencia), 'aluna nova não começa presa: ' + JSON.stringify(prox));
    // uma questão só dessa competência transversal não vira "questão sem ponto do edital"
    r = await importar({ escopo: ESC(), questoes: [{ tipo: 'objetiva', origem: 'autoral', gerada_por_ia: true, enunciado: 'No ciclo de estudos, o que se mantém fixo de uma sessão para a outra?',
      alternativas: [{ texto: 'A ordem das disciplinas.', correta: true, explicacao: 'A ordem é mantida; o horário é livre.' }, { texto: 'O horário de cada disciplina.', correta: false, explicacao: 'Isso é cronograma, não ciclo.' }], competencias: ['so-leitura'] }] });
    assert.equal(r.st, 200, r.texto);
    assert.equal((await req('GET', cobUrl, { semUser: true, chave: true })).json.cobertura.mao_dupla.questoes_sem_folha, semFolhaAntes, 'transversal fica fora da conta da mão dupla');
    const qid = db.prepare("SELECT questao_id id FROM est_questao_vinculos WHERE escopo_id = ? AND codigo = 'so-leitura'").get(escId).id;
    db.prepare('DELETE FROM est_questao_vinculos WHERE questao_id = ?').run(qid); db.prepare('DELETE FROM est_questoes WHERE id = ?').run(qid);
    db.prepare("DELETE FROM est_unidades WHERE codigo = 'so-leitura'").run(); db.prepare("DELETE FROM est_competencias WHERE codigo = 'so-leitura'").run();
  });

  await t('estudo: prática — gabarito fica no servidor, pista é contada por ele e questão repetida não vira domínio', async () => {
    const pr = await req('GET', `${esc}/praticar?competencia=prescricao&n=10`, { jar: 'olga' });
    assert.equal(pr.st, 200, pr.texto);
    assert.deepEqual([pr.json.elegiveis, pr.json.ineditas], [4, 4], 'reservada e discursiva ficam fora do treino');
    assert.ok(!/"correta"|"explicacao"|Certa: é a regra/.test(pr.texto), 'nada de gabarito no navegador');
    const estado = async () => (await req('GET', `${esc}/painel`, { jar: 'olga' })).json;
    const resp = (i, resposta, extra = {}) => req('POST', `${esc}/questoes/${idDe(i)}/responder`, { jar: 'olga', corpo: { resposta, ...extra } });
    const pista = await req('POST', `${esc}/questoes/${idDe(1)}/pista`, { jar: 'olga' });
    assert.equal(pista.json.pista, 'Lembre do prazo bienal.');
    assert.equal((await req('POST', `${esc}/questoes/${idDe(1)}/pista`, { jar: 'olga' })).st, 400, 'acabaram as pistas');
    let r = await resp(1, 'a', { modo: 'pratica' }); // pedir "prática" não apaga a pista já tomada
    assert.deepEqual([r.json.acerto, r.json.pistas_usadas, r.json.conta_como], [true, 1, 'prática com apoio'], r.texto);
    assert.ok(r.json.alternativas.every(a => a.explicacao), 'depois de responder, todas as alternativas explicadas');
    let p = await estado();
    assert.equal(p.competencias.find(c => c.codigo === 'prescricao').estado, 'demonstrada_com_apoio');
    assert.equal(p.proxima.tipo, 'pratica_sem_apoio');
    r = await resp(2, 'a');
    assert.equal(r.json.conta_como, 'demonstração sem apoio');
    assert.deepEqual([r.json.retomadas.prescricao.passo, r.json.retomadas.prescricao.vencimento], [1, daqui(3)], 'acerto sem apoio sobe um degrau da escada');
    assert.equal((await resp(2, 'a')).json.conta_como, 'prática (questão já vista)');
    p = await estado();
    assert.equal(p.competencias.find(c => c.codigo === 'prescricao').estado, 'demonstrada_sem_apoio');
    assert.deepEqual([p.cobertura.estudo.estudados, p.cobertura.dominio.sem_apoio], [1, 1]);
    assert.deepEqual([p.desempenho.respostas, p.desempenho.ineditas, p.desempenho.acertos_sem_apoio], [3, 2, 2]);
    assert.equal((await resp(1, '')).st, 400, 'resposta vazia');
    assert.equal((await resp(7, 'a')).st, 403, 'reservada não se gasta na prática');
    assert.equal((await req('POST', `${esc}/questoes/${idDe(1)}/responder`, { jar: 'caio', corpo: { resposta: 'a' } })).st, 403);
  });

  await t('estudo: erro sem apoio reabre a prática; três seguidos pedem troca de estratégia, não mais repetição', async () => {
    const resp = (i, resposta) => req('POST', `${esc}/questoes/${idDe(i)}/responder`, { jar: 'olga', corpo: { resposta } });
    const prox = async () => (await req('GET', `${esc}/painel`, { jar: 'olga' })).json;
    assert.equal((await resp(3, 'b')).json.acerto, false);
    let p = await prox();
    assert.equal(p.competencias.find(c => c.codigo === 'prescricao').estado, 'em_pratica', 'a demonstração anterior não segura o estado');
    assert.deepEqual([p.proxima.tipo, p.proxima.unidade], ['intervencao', 'prescricao-base']);
    await resp(3, 'c'); await resp(4, 'b');
    p = await prox();
    assert.equal(p.proxima.tipo, 'mudar_estrategia');
    assert.ok(p.competencias.find(c => c.codigo === 'prescricao').estagnada);
  });

  let tentativaId = '';
  await t('estudo: prova — faltou questão é dito; a prova é congelada; reentrar não reinicia; enviar duas vezes dá uma nota', async () => {
    const falta = await req('POST', `${esc}/tentativas`, { jar: 'olga', corpo: { modo: 'treino', n: 50 } });
    assert.equal(falta.st, 409, falta.texto);
    assert.deepEqual([falta.json.elegiveis, falta.json.pedido], [6, 50], 'treino: sem a reservada e sem a discursiva');
    const ini = await req('POST', `${esc}/tentativas`, { jar: 'olga', corpo: { modo: 'simulado', n: 50, aceitar_menos: true, duracao_min: 30 } });
    assert.equal(ini.st, 200, ini.texto);
    assert.deepEqual([ini.json.questoes.length, ini.json.faltaram, ini.json.duracao_min], [7, 43, 30], 'simulado inclui a reservada');
    assert.ok(!/"correta"|"gabarito":|"explicacao"/.test(ini.texto), 'a prova não leva gabarito');
    assert.equal(Date.parse(ini.json.prazo_em) - Date.parse(ini.json.inicio_em), 30 * 60e3, 'prazo fixado pelo servidor');
    tentativaId = ini.json.id;
    const de_novo = await req('POST', `${esc}/tentativas`, { jar: 'olga', corpo: { modo: 'treino', n: 2 } });
    assert.deepEqual([de_novo.json.id, de_novo.json.retomada, de_novo.json.prazo_em], [tentativaId, true, ini.json.prazo_em], 'tentativa aberta é retomada com o mesmo prazo');
    const ids = ini.json.questoes.map(q => q.id);
    const respostas = { [ids[0]]: 'a', [ids[1]]: 'a', [ids[2]]: 'a', [ids[3]]: 'b', [ids[4]]: 'b', [ids[5]]: 'c', 'id-de-fora': 'a' }; // ids[6] em branco
    const sv = await req('PUT', `${esc}/tentativas/${tentativaId}/respostas`, { jar: 'olga', corpo: { respostas } });
    assert.deepEqual([sv.json.salvo, sv.json.respondidas, sv.json.total], [true, 6, 7], 'resposta de questão que não é da prova é ignorada');
    assert.equal((await req('GET', `${esc}/tentativas/${tentativaId}`, { jar: 'olga' })).json.respostas[ids[5]], 'c', 'recarregar devolve o que foi salvo');
    assert.equal((await req('GET', `${esc}/tentativas/${tentativaId}`, { jar: 'maria' })).st, 404, 'tentativa é de quem a abriu');
    const env = await req('POST', `${esc}/tentativas/${tentativaId}/enviar`, { jar: 'olga' });
    assert.equal(env.st, 200, env.texto);
    const res = env.json.resultado;
    // regra do escopo: 3 erradas + 1 em branco (conta erro) = 4 erros → 1 conjunto de 3 → desconta 1
    assert.deepEqual([res.certas, res.erradas, res.em_branco, res.erros_contados, res.descontados, res.nota_liquida, res.maximo], [3, 3, 1, 4, 1, 2, 7]);
    // o bloco da pontuação é o campo `bloco` da questão quando ele existe (a Q6 tem disciplina "Processo" e bloco "II")
    const q6 = res.por_bloco.find(b => b.bloco === 'II');
    assert.ok(q6 && q6.maximo === 1, 'a questão com bloco próprio pontua no seu bloco, não na disciplina');
    assert.ok(!res.por_bloco.some(b => b.bloco === 'Processo'), 'a disciplina não vira bloco quando há bloco');
    assert.equal(res.certas + res.erradas + res.em_branco, 7, 'as três contagens somam a prova — nenhuma questão contada duas vezes');
    assert.equal(res.regra.fonte, 'Regulamento de teste, art. 1º', 'a nota diz de qual regra saiu');
    assert.ok(res.itens.every(i => i.alternativas.length === 3 && i.gabarito === 'a'), 'depois de enviar, o gabarito comentado');
    const evid = () => db.prepare('SELECT COUNT(*) n FROM est_evidencias WHERE tentativa_id = ?').get(tentativaId).n;
    assert.equal(evid(), 6, 'branco não vira evidência de que a aluna não sabia');
    const env2 = await req('POST', `${esc}/tentativas/${tentativaId}/enviar`, { jar: 'olga' });
    assert.deepEqual([env2.json.resultado.nota_liquida, evid()], [2, 6], 'reenvio não gera segunda nota nem segunda evidência');
    assert.equal((await req('PUT', `${esc}/tentativas/${tentativaId}/respostas`, { jar: 'olga', corpo: { respostas: { [ids[6]]: 'a' } } })).json.salvo, false);
  });

  await t('estudo: prova que venceu no relógio do servidor vale pelo que estava salvo', async () => {
    const ini = await req('POST', `${esc}/tentativas`, { jar: 'olga', corpo: { modo: 'treino', n: 2 } });
    assert.equal(ini.st, 200, ini.texto);
    assert.notEqual(ini.json.id, tentativaId);
    const [q1, q2] = ini.json.questoes.map(q => q.id);
    await req('PUT', `${esc}/tentativas/${ini.json.id}/respostas`, { jar: 'olga', corpo: { respostas: { [q1]: 'a' } } });
    db.prepare('UPDATE est_tentativas SET prazo_em = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), ini.json.id);
    const tarde = await req('PUT', `${esc}/tentativas/${ini.json.id}/respostas`, { jar: 'olga', corpo: { respostas: { [q2]: 'a' } } });
    assert.deepEqual([tarde.json.salvo, tarde.json.estado], [false, 'expirada'], tarde.texto);
    const g = (await req('GET', `${esc}/tentativas/${ini.json.id}`, { jar: 'olga' })).json;
    assert.deepEqual([g.estado, g.resultado.expirada, g.resultado.certas, g.resultado.em_branco], ['expirada', true, 1, 1], 'a resposta que chegou depois do prazo não entrou');
  });

  await t('estudo: cards — recordar antes de ver; a nota do próprio aluno não vira domínio independente', async () => {
    const c = await req('GET', `${esc}/cards`, { jar: 'olga' });
    assert.equal(c.st, 200, c.texto);
    assert.equal(c.json.novos.length, 2);
    assert.ok(!/Dois anos/.test(c.texto), 'o verso não vem com a frente');
    const id = c.json.novos[0].id;
    assert.equal((await req('POST', `${esc}/cards/${id}/revelar`, { jar: 'olga' })).json.verso, 'Dois anos.');
    assert.equal((await req('POST', `${esc}/cards/${id}/avaliar`, { jar: 'olga', corpo: { resultado: 'talvez' } })).st, 400);
    const av = await req('POST', `${esc}/cards/${id}/avaliar`, { jar: 'olga', corpo: { resultado: 'acerto' } });
    assert.deepEqual([av.json.passo, av.json.vencimento], [0, daqui(1)], av.texto);
    assert.equal((await req('GET', `${esc}/cards`, { jar: 'olga' })).json.novos.length, 1, 'card agendado sai dos novos');
    assert.equal(db.prepare("SELECT modo FROM est_evidencias WHERE ref_id = ?").get(id).modo, 'estudo');
  });

  await t('estudo: plano — 1 hora em 14 dias para 10 horas de programa mostra o déficit e o que fica de fora', async () => {
    assert.equal((await req('GET', `${esc}/plano`, { jar: 'olga' })).json.plano, null);
    const set = (corpo) => req('PUT', `${esc}/plano`, { jar: 'olga', corpo });
    assert.equal((await set({ disponibilidade: {} })).st, 400);
    // esforço declarado nos itens 1.1 e 1.2; o 2.1 fica sem estimativa de propósito
    await importar({ escopo: ESC(), programa: { documento: { nome: 'Edital 1/2026', tipo: 'edital' }, itens: [
      { codigo: '1', texto: 'Direito do Trabalho' }, { codigo: '1.1', texto: 'Prescrição', esforco_min: [300, 400] }, { codigo: '1.2', texto: 'FGTS', esforco_min: [300, 400] },
      { codigo: '2', texto: 'Processo do Trabalho' }, { codigo: '2.1', texto: 'Recursos' }] } });
    const semana = Object.fromEntries(plano.DIAS.map(d => [d, 0]));
    semana[plano.DIAS[new Date(daqui(1) + 'T00:00:00Z').getUTCDay()]] = 30;  // sessões em D+1 e D+8
    semana[plano.DIAS[new Date(daqui(10) + 'T00:00:00Z').getUTCDay()]] = 30; // sessões em D+3 e D+10 (a prova é em D+14)
    const r = await set({ disponibilidade: semana, margem_pct: 0, data_alvo: daqui(300) });
    assert.equal(r.st, 200, r.texto);
    const v = r.json.plano.viabilidade;    assert.equal(r.json.plano.data_alvo, daqui(14), 'a data da prova é a do edital, não a que o aluno digitou');
    // RETA FINAL (ADR-0007): a prova é em 14 dias, então tudo já é revisão geral (D-15) — cada sessão dá só 30 % a
    // matéria nova (9 de 30 min) — e a sessão de D+10 cai nos 5 últimos dias: véspera, sem matéria nova nenhuma
    assert.deepEqual([v.situacao, v.capacidade_bruta_min, v.esforco_min, v.deficit_min, v.sem_estimativa], ['nao_cabe', 27, [600, 800], [573, 773], ['2.1']]);
    const rg = r.json.plano.proximas.filter(s => s.fase === 'revisao_geral');
    assert.deepEqual([rg.length, rg[0].estudo[0].minutos, rg[0].revisao_min], [3, 9, 21], 'revisão geral: a maior parte do dia é do que já foi visto');
    assert.deepEqual([r.json.plano.reta_final.sem_materia_nova_desde, r.json.plano.reta_final.revisao_geral_desde, r.json.plano.reta_final.foco], [daqui(9), daqui(-1), 'objetiva']);
    const vesp = r.json.plano.proximas.filter(s => s.vespera);
    assert.deepEqual([vesp.length, vesp[0].vespera, vesp[0].estudo.length, vesp[0].revisao_min], [1, 'objetiva', 0, 30], 'véspera: só revisão, no foco da 1ª etapa');
    assert.equal(r.json.plano.nivel_recomendado.nivel, 10, 'não cabe nem o 10 %: recomenda o menor e mostra o déficit');
    assert.ok(/déficit/.test(r.json.plano.nivel_recomendado.motivo));
    // puro: com 500 min úteis para [600, 800] no nível 100, o 50 só cabe no mínimo e o 25 cabe inteiro
    const nr = plano.nivelRecomendado({ util_min: 500 }, [{ codigo: 'a', esforco_min: [600, 800] }]);
    assert.deepEqual([nr.nivel, nr.opcoes.find(o => o.nivel === 50).apertado, nr.opcoes.find(o => o.nivel === 25).esforco_min], [25, true, [375, 500]]);
    assert.equal(plano.nivelRecomendado({ util_min: 1000 }, [{ codigo: 'a', esforco_min: [600, 800] }]).nivel, 100);
    assert.deepEqual(r.json.plano.pendentes.map(p => p.codigo), ['1.1', '1.2'], 'nada sai do programa em silêncio');
    assert.equal(r.json.plano.sessoes_total, 4, "três de revisão geral e uma de véspera");
    const r2 = await set({ disponibilidade: semana, margem_pct: 0, motivo: 'faltei ontem' });
    assert.deepEqual([r2.json.versao, r2.json.historico.length, r2.json.historico[1].motivo], [2, 2, 'faltei ontem'], 'replanejar preserva o histórico');
  });

  await t('estudo: a tela do aluno é servida e o painel a carrega antes do estúdio', async () => {
    const js = await req('GET', '/academy/estude.js');
    assert.equal(js.st, 200); assert.ok(/javascript/.test(js.ct) && /window\.AcademyEstude/.test(js.texto));
    const css = await req('GET', '/academy/estude.css');
    assert.equal(css.st, 200); assert.ok(/text\/css/.test(css.ct) && /\.es-proxima/.test(css.texto));
    const app = (await req('GET', '/academy/app')).texto;
    assert.ok(app.indexOf('/academy/estude.js') > 0 && app.indexOf('/academy/estude.js') < app.indexOf('/academy/aluno.js'), 'o estúdio procura window.AcademyEstude ao montar');
    assert.ok(/estude\.css/.test(app));
    const fonte = require('fs').readFileSync(require('path').join(__dirname, '..', 'app-estudo.js'), 'utf8');
    assert.ok(!/localStorage/.test(fonte), 'resposta de prova não mora no navegador: o que vale é o que o servidor confirmou');
  });

  await t('estudo: retificação cria versão nova do programa, guarda a antiga e diz o que mudou', async () => {
    const antes = db.prepare("SELECT versao FROM est_escopos WHERE slug = ?").get(SLUG).versao;
    const r = await importar({ escopo: ESC(), programa: { documento: { nome: 'Retificação 1', tipo: 'retificacao' }, itens: [
      { codigo: '1', texto: 'Direito do Trabalho' }, { codigo: '1.1', texto: 'Prescrição', esforco_min: [300, 400] }, { codigo: '1.2', texto: 'FGTS e contribuições sociais', esforco_min: [300, 400] },
      { codigo: '2', texto: 'Processo do Trabalho' }, { codigo: '2.1', texto: 'Recursos' }, { codigo: '2.2', texto: 'Execução', pendente: 'página 14 ilegível no PDF' }] } });
    assert.equal(r.st, 200, r.texto);
    const p = r.json.importado.programa;
    assert.deepEqual([p.versao, p.adicionados, p.removidos, p.alterados, p.pendentes_de_leitura], [antes + 1, 1, 0, 1, 1]);
    assert.equal(db.prepare('SELECT texto FROM est_itens WHERE escopo_id = ? AND versao = ? AND codigo = ?').get(r.json.importado.escopo_id, antes, '1.2').texto, 'FGTS', 'a versão anterior continua lá');
    const cob = await req('GET', `/staff/api/academy/estudo/cobertura?produtor_email=maria@t.com&produto_id=${impId}&escopo=${SLUG}`, { semUser: true, chave: true });
    assert.equal(cob.st, 200, cob.texto);
    assert.deepEqual([cob.json.cobertura.folhas, cob.json.cobertura.pendentes_de_leitura, cob.json.cobertura.sem_competencia], [4, ['2.2'], ['2.2']], 'o item novo aparece como lacuna, não como coberto');
    // mão dupla: perguntas para todos os pontos e pontos para todas as perguntas
    const md = cob.json.cobertura.mao_dupla;
    assert.equal(md.ok, false, 'programa com folha sem questão não fecha a mão dupla');
    assert.ok(md.folhas_sem_questao.includes('2.2'), 'o item novo entra como folha sem pergunta');
    assert.equal(typeof md.questoes_sem_folha, 'number');
    assert.ok(Array.isArray(md.folhas_com_questao_sem_material));
    const pub = await req('POST', '/staff/api/academy/estudo/status', { semUser: true, chave: true, corpo: EST({ escopo: SLUG, status: 'publicado' }) });
    assert.equal(pub.st, 200, pub.texto);
    assert.ok(JSON.stringify(pub.json).includes('aviso_mao_dupla'), 'publicar com furo avisa o furo em vez de esconder: ' + pub.texto);
    const painel = (await req('GET', `${esc}/painel`, { jar: 'olga' })).json;
    assert.equal(painel.escopo.versao, antes + 1);
    assert.ok(painel.desempenho.respostas > 0, 'o histórico da aluna atravessa a retificação');
  });
  await t('estudo: caderno de erros — entra quem errou por último, sai quem acerta de novo; a anotação é do aluno (ADR-0007)', async () => {
    const jar = 'olga';
    const ids = async () => (await req('GET', `${esc}/erros`, { jar })).json.questoes.map(q => q.id);
    const antes = await ids();
    const lote = (await req('GET', `${esc}/praticar?n=20`, { jar })).json.questoes;
    const pr = lote.find(q => !antes.includes(q.id));
    assert.ok(pr, 'há questão fora do caderno para testar');
    const dados = JSON.parse(db.prepare('SELECT dados FROM est_questoes WHERE id = ?').get(pr.id).dados);
    const gab = dados.alternativas.find(a => a.correta).id, errada = pr.alternativas.find(a => a.id !== gab).id;
    assert.equal((await req('POST', `${esc}/questoes/${pr.id}/responder`, { jar, corpo: { resposta: errada } })).json.acerto, false);
    const cad = (await req('GET', `${esc}/erros`, { jar })).json;
    const linha = cad.questoes.find(q => q.id === pr.id);
    assert.ok(linha && linha.erros >= 1, 'errou por último: está no caderno');
    assert.equal(cad.total, antes.length + 1);
    assert.ok(linha.alternativas.some(a => a.correta && a.explicacao !== undefined), 'no caderno a questão vem com o gabarito');
    assert.equal((await req('GET', `${esc}/painel`, { jar })).json.erros_pendentes, cad.total, 'o painel conta as pendentes');
    const an = await req('PUT', `${esc}/questoes/${pr.id}/anotacao`, { jar, corpo: { texto: 'Confundi o prazo bienal com o quinquenal.' } });
    assert.equal(an.st, 200, an.texto);
    assert.equal((await req('GET', `${esc}/erros`, { jar })).json.questoes.find(q => q.id === pr.id).anotacao, 'Confundi o prazo bienal com o quinquenal.');
    const so = (await req('GET', `${esc}/praticar?n=20&erradas=1`, { jar })).json.questoes.map(q => q.id);
    assert.ok(so.includes(pr.id) && so.every(id => [...antes, pr.id].includes(id)), 'refazer traz só as erradas');
    const de = await req('POST', `${esc}/questoes/${pr.id}/responder`, { jar, corpo: { resposta: gab } });
    assert.deepEqual([de.json.acerto, de.json.inedita, de.json.anotacao], [true, false, 'Confundi o prazo bienal com o quinquenal.'], 'acertar a mesma questão não é demonstração');
    assert.ok(!(await ids()).includes(pr.id), 'acertou de novo: sai do caderno');
    // correção de texto cria questão nova; a versão antiga, arquivada, some do aluno e fica no histórico
    const lista0 = await req('GET', `/staff/api/academy/estudo/questoes?produtor_email=maria@t.com&produto_id=${impId}&escopo=${SLUG}`, { semUser: true, chave: true });
    assert.equal(lista0.st, 200, lista0.texto);
    const alvoQ = lista0.json.questoes.find(x => x.id === pr.id);
    assert.ok(alvoQ && alvoQ.hash && alvoQ.situacao === 'disponivel', 'a listagem traz o hash e a situação');
    const arq = await importar({ escopo: ESC(), arquivar_questoes: [alvoQ.hash, 'hash-que-nao-existe'] });
    assert.equal(arq.st, 200, arq.texto);
    assert.equal(arq.json.importado.questoes_arquivadas, 1, 'só arquiva o que existe e é deste escopo');
    assert.ok(!(await req('GET', `${esc}/praticar?n=20`, { jar })).json.questoes.some(x => x.id === pr.id), 'questão arquivada não é mais servida');
    assert.ok(db.prepare('SELECT 1 FROM est_evidencias WHERE ref_id = ?').get(pr.id), 'a evidência já registrada fica');
    // anotar o que nunca respondeu é recusado
    const nunca = db.prepare("SELECT q.id FROM est_questoes q JOIN est_questao_vinculos v ON v.questao_id = q.id WHERE q.id NOT IN (SELECT ref_id FROM est_evidencias) LIMIT 1").get();
    if (nunca) assert.ok([404, 409].includes((await req('PUT', `${esc}/questoes/${nunca.id}/anotacao`, { jar, corpo: { texto: 'x' } })).st), 'anotação é sobre a resposta dada');
  });
}

module.exports = { rodar };
