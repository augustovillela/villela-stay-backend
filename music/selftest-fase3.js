// =====================================================================
// Musique — testes da FASE 3 (escolas, turmas, presença e boletim).
//
// O QUE ESTES TESTES PROTEGEM, e por que cada um existe:
//
//   · ISOLAMENTO ENTRE ESCOLAS. A proteção aqui é de CÓDIGO, não de
//     banco (ADR-0007) — então cada superfície é testada TENTANDO ler o
//     dado da outra escola. É a contrapartida que torna a guarda por
//     coluna aceitável.
//   · O PORTÃO É ÚNICO. Um teste varre os arquivos da Fase 3 e falha se
//     achar consulta às tabelas de organização fora de
//     `organizacoes.js`. Disciplina que depende de memória não dura.
//   · A ESCOLA NÃO SE APODERA DO ACERVO. Obra de terceiro não entra na
//     biblioteca institucional nem "só para a turma".
//   · O BOLETIM É DERIVADO E EXPLICÁVEL. Não existe nota digitada
//     direto no boletim, e aula sem chamada não vira falta.
// =====================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const org = require('./organizacoes');
const academia = require('./academia');
const { db } = require('./db');

async function rodar({ t, secao, req, assert, PROFESSORES }) {
  // ===================================================================
  secao('Fase 3 · escola, membros e papéis');

  let escolaId, escolaRivalId, turmaId, turmaOutraId;

  await t('qualquer pessoa cria uma escola e vira gestora dela', async () => {
    const r = await req('POST', '/music/api/escolas',
      { como: 'prof', corpo: { nome: 'Escola Villa-Lobos', tipo: 'escola', assentos: 3 } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    escolaId = r.json.escola.id;
    assert.equal(r.json.escola.slug, 'escola-villa-lobos');
    const v = org.escopo('u-prof', escolaId);
    assert.equal(v.papel, 'gestor');
  });

  await t('quem não é membro NÃO alcança a escola, e ouve o motivo', async () => {
    const r = await req('GET', `/music/api/escolas/${escolaId}`, { como: 'bruno' });
    assert.equal(r.status, 403);
    assert.ok(/não faz parte/i.test(r.json.erro), r.json.erro);
  });

  await t('gestor convida professor e secretaria por e-mail', async () => {
    const r = await req('POST', `/music/api/escolas/${escolaId}/membros`,
      { como: 'prof', corpo: { emails: ['bruno@t', 'ninguem@t'], papel: 'professor' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.entraram, 1);
    assert.deepEqual(r.json.nao_encontrados, ['ninguem@t']);
    const sec = await req('POST', `/music/api/escolas/${escolaId}/membros`,
      { como: 'prof', corpo: { emails: ['sec@t'], papel: 'secretaria' } });
    assert.equal(sec.json.entraram, 1);
  });

  await t('professor NÃO convida ninguém — isso é da gestão', async () => {
    const r = await req('POST', `/music/api/escolas/${escolaId}/membros`,
      { como: 'bruno', corpo: { emails: ['ana@t'], papel: 'professor' } });
    assert.equal(r.status, 403);
    assert.ok(/gestão/i.test(r.json.erro), r.json.erro);
  });

  await t('papel desconhecido é recusado', async () => {
    const r = await req('POST', `/music/api/escolas/${escolaId}/membros`,
      { como: 'prof', corpo: { emails: ['ana@t'], papel: 'diretor-supremo' } });
    assert.equal(r.status, 400);
  });

  // ===================================================================
  secao('Fase 3 · turmas');

  await t('professor cria turma e ela nasce dele', async () => {
    const r = await req('POST', `/music/api/escolas/${escolaId}/turmas`,
      { como: 'bruno', corpo: { nome: 'Violão 1 — terças', instrumento: 'violao', periodo: '2026.2' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    turmaId = r.json.turma.id;
    assert.equal(r.json.turma.professor, 'u-bruno');
  });

  await t('professor vê SÓ as turmas dele; a gestão vê todas', async () => {
    const outra = await req('POST', `/music/api/escolas/${escolaId}/turmas`,
      { como: 'prof', corpo: { nome: 'Canto 1' } });
    turmaOutraId = outra.json.turma.id;
    const doBruno = await req('GET', `/music/api/escolas/${escolaId}`, { como: 'bruno' });
    assert.equal(doBruno.json.turmas.length, 1);
    assert.equal(doBruno.json.turmas[0].id, turmaId);
    const daGestao = await req('GET', `/music/api/escolas/${escolaId}`, { como: 'prof' });
    assert.equal(daGestao.json.turmas.length, 2);
  });

  await t('professor não abre a turma de outro professor', async () => {
    const r = await req('GET', `/music/api/turmas/${turmaOutraId}`, { como: 'bruno' });
    assert.equal(r.status, 403);
    assert.ok(/não é sua/i.test(r.json.erro), r.json.erro);
  });

  // ===================================================================
  secao('Fase 3 · matrícula, assentos e menor de idade');

  await t('secretaria matricula por e-mail', async () => {
    const r = await req('POST', `/music/api/turmas/${turmaId}/matriculas`,
      { como: 'sec', corpo: { emails: ['ana@t'] } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.entraram, 1);
  });

  await t('matricular de novo não duplica: avisa que já estava', async () => {
    const r = await req('POST', `/music/api/turmas/${turmaId}/matriculas`,
      { como: 'sec', corpo: { emails: ['ana@t'] } });
    assert.equal(r.json.entraram, 0);
    assert.deepEqual(r.json.ja_estavam, ['ana@t']);
    const n = db.prepare('SELECT COUNT(*) AS n FROM matriculas WHERE turma_id = ? AND aluno = ?')
      .get(turmaId, 'u-ana').n;
    assert.equal(n, 1);
  });

  await t('ALUNO MENOR exige responsável com conta (LGPD art. 14)', async () => {
    const sem = await req('POST', `/music/api/turmas/${turmaId}/matriculas`,
      { como: 'sec', corpo: { emails: ['menor@t'], menor: true } });
    assert.equal(sem.status, 400);
    assert.ok(/art\. 14/.test(sem.json.erro), sem.json.erro);

    const com = await req('POST', `/music/api/turmas/${turmaId}/matriculas`,
      { como: 'sec', corpo: { emails: ['menor@t'], menor: true, responsavel_email: 'resp@t' } });
    assert.equal(com.status, 200, JSON.stringify(com.json));
    const m = db.prepare('SELECT * FROM matriculas WHERE turma_id = ? AND aluno = ?').get(turmaId, 'u-menor');
    assert.equal(m.menor, 1);
    assert.equal(m.responsavel, 'u-resp');
  });

  await t('ASSENTO se conta por ALUNO, não por matrícula', async () => {
    // A escola tem 3 assentos e 2 alunos. Matricular a Ana também em
    // Canto 1 NÃO gasta um segundo assento.
    const r = await req('POST', `/music/api/turmas/${turmaOutraId}/matriculas`,
      { como: 'sec', corpo: { emails: ['ana@t'] } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const alunos = db.prepare("SELECT COUNT(DISTINCT aluno) AS n FROM matriculas WHERE organizacao_id = ? AND status = 'ativa'")
      .get(escolaId).n;
    assert.equal(alunos, 2, 'o mesmo aluno em duas turmas ocupa um assento, não dois');
  });

  await t('estourar os assentos recusa com os números na mensagem', async () => {
    await req('POST', `/music/api/turmas/${turmaId}/matriculas`, { como: 'sec', corpo: { emails: ['prof2@t'] } });
    const r = await req('POST', `/music/api/turmas/${turmaId}/matriculas`,
      { como: 'sec', corpo: { emails: ['forasteiro@t'] } });
    assert.equal(r.status, 400);
    assert.ok(/3 assento\(s\)/.test(r.json.erro), r.json.erro);
    assert.ok(/aumente o plano/.test(r.json.erro));
  });

  await t('o aluno vê onde estuda', async () => {
    const r = await req('GET', '/music/api/minhas-turmas', { como: 'ana' });
    assert.equal(r.status, 200);
    assert.equal(r.json.matriculas.length, 2);
    assert.ok(r.json.matriculas[0].escola_nome);
  });

  await t('aluno abre a turma dele, e NÃO vê a lista de colegas', async () => {
    const r = await req('GET', `/music/api/turmas/${turmaId}`, { como: 'ana' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.como, 'aluno');
    assert.deepEqual(r.json.alunos, [],
      'numa escola com menor de idade, a lista de quem estuda ali é dado de terceiro');
  });

  await t('aluno NÃO abre turma em que não está matriculado', async () => {
    const r = await req('GET', `/music/api/turmas/${turmaOutraId}`, { como: 'menor' });
    assert.equal(r.status, 403);
  });

  // ===================================================================
  secao('Fase 3 · ISOLAMENTO entre escolas (a guarda de coluna se prova aqui)');

  await t('uma segunda escola, de outro dono', async () => {
    const r = await req('POST', '/music/api/escolas', { como: 'ana', corpo: { nome: 'Escola Rival', assentos: 0 } });
    assert.equal(r.status, 200);
    escolaRivalId = r.json.escola.id;
    assert.notEqual(escolaRivalId, escolaId);
  });

  await t('gestor de uma escola não lê NADA da outra', async () => {
    // A Ana é gestora da Rival E aluna da Villa-Lobos. Ser aluna não
    // pode abrir a porta de gestão da outra.
    const escola = await req('GET', `/music/api/escolas/${escolaId}`, { como: 'ana' });
    assert.equal(escola.status, 403, 'aluna não é membro: não vê a escola por dentro');

    const turmas = await req('POST', `/music/api/escolas/${escolaId}/turmas`,
      { como: 'ana', corpo: { nome: 'turma pirata' } });
    assert.equal(turmas.status, 403);

    const boletim = await req('GET', `/music/api/turmas/${turmaId}/boletim`, { como: 'ana' });
    assert.equal(boletim.status, 403);
  });

  await t('membro da escola rival não alcança turma, aula nem matrícula da outra', async () => {
    await req('POST', `/music/api/escolas/${escolaRivalId}/membros`,
      { como: 'ana', corpo: { emails: ['forasteiro@t'], papel: 'gestor' } });
    for (const [metodo, caminho, corpo] of [
      ['GET', `/music/api/escolas/${escolaId}`, null],
      ['GET', `/music/api/turmas/${turmaId}`, null],
      ['POST', `/music/api/turmas/${turmaId}/aulas`, { data: '2026-09-01', tema: 'x' }],
      ['POST', `/music/api/turmas/${turmaId}/matriculas`, { emails: ['bruno@t'] }],
      ['POST', `/music/api/escolas/${escolaId}/turmas`, { nome: 'x' }],
      ['GET', `/music/api/turmas/${turmaId}/boletim`, null],
      ['GET', `/music/api/turmas/${turmaId}/boletim/u-ana`, null],
    ]) {
      const r = await req(metodo, caminho, { como: 'forasteiro', corpo });
      assert.equal(r.status, 403, `${metodo} ${caminho} devia recusar, veio ${r.status}`);
    }
  });

  await t('O PORTÃO É ÚNICO: nenhuma rota da Fase 3 consulta as tabelas de organização', async () => {
    // Guarda por coluna só é aceitável com esta varredura. Sem ela, a
    // primeira consulta escrita fora do portão vaza em silêncio.
    const TABELAS = ['organizacoes', 'org_membros', 'turmas', 'matriculas', 'aulas', 'presencas', 'org_biblioteca'];
    const arquivos = ['rotas-organizacoes.js', 'rotas-academia.js', 'rotas-biblioteca.js', 'rotas-app.js'];
    for (const nome of arquivos) {
      const src = fs.readFileSync(path.join(__dirname, nome), 'utf8');
      for (const tab of TABELAS) {
        const re = new RegExp(`(FROM|INTO|UPDATE|JOIN)\\s+${tab}\\b`, 'i');
        assert.ok(!re.test(src),
          `${nome} consulta a tabela "${tab}" direto. Isso é do portão (organizacoes.js) — ADR-0007.`);
      }
      assert.ok(!/db\.prepare/.test(src), `${nome} fala com o banco direto; rota não faz isso nesta casa.`);
    }
  });

  // ===================================================================
  secao('Fase 3 · aulas e chamada');

  let aulaId;

  await t('professor cria aula com link externo de videoconferência', async () => {
    const r = await req('POST', `/music/api/turmas/${turmaId}/aulas`,
      { como: 'bruno', corpo: { data: '2026-09-01', tema: 'Troca de acordes', link: 'https://meet.example.com/x' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    aulaId = r.json.aula.id;
  });

  await t('chamada vai de uma vez, e recusa quem não está na turma', async () => {
    const errada = await req('POST', `/music/api/aulas/${aulaId}/chamada`,
      { como: 'bruno', corpo: { marcacoes: [{ aluno: 'u-ana', estado: 'presente' }, { aluno: 'u-forasteiro', estado: 'presente' }] } });
    assert.equal(errada.status, 400);
    assert.ok(/não estão matriculadas/i.test(errada.json.erro), errada.json.erro);

    const ok = await req('POST', `/music/api/aulas/${aulaId}/chamada`, {
      como: 'bruno',
      corpo: { marcacoes: [
        { aluno: 'u-ana', estado: 'presente' },
        { aluno: 'u-menor', estado: 'falta', motivo: 'sem aviso' },
        { aluno: 'u-prof2', estado: 'justificada', motivo: 'atestado' },
      ] },
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json.marcados, 3);
  });

  await t('a chamada guarda QUEM marcou — é a primeira pergunta quando alguém reclama', async () => {
    const p = db.prepare('SELECT * FROM presencas WHERE aula_id = ? AND aluno = ?').get(aulaId, 'u-menor');
    assert.equal(p.registrado_por, 'u-bruno');
    assert.ok(p.registrado_em);
    assert.equal(p.motivo, 'sem aviso');
  });

  await t('refazer a chamada CORRIGE, não duplica', async () => {
    await req('POST', `/music/api/aulas/${aulaId}/chamada`,
      { como: 'bruno', corpo: { marcacoes: [{ aluno: 'u-menor', estado: 'justificada', motivo: 'trouxe atestado' }] } });
    const linhas = db.prepare('SELECT * FROM presencas WHERE aula_id = ? AND aluno = ?').all(aulaId, 'u-menor');
    assert.equal(linhas.length, 1);
    assert.equal(linhas[0].estado, 'justificada');
  });

  await t('secretaria não faz chamada — quem esteve na aula foi o professor', async () => {
    const r = await req('POST', `/music/api/aulas/${aulaId}/chamada`,
      { como: 'sec', corpo: { marcacoes: [{ aluno: 'u-ana', estado: 'falta' }] } });
    assert.equal(r.status, 403);
  });

  // ===================================================================
  secao('Fase 3 · biblioteca institucional');

  let obraPropria, obraDeTerceiro;

  await t('professor compartilha com a turma uma música QUE É DELE', async () => {
    const o = await req('POST', '/music/api/obras',
      { como: 'bruno', corpo: { titulo: 'Estudo de troca de acordes', titularidade: 'propria' } });
    obraPropria = o.json.obra.id;
    const r = await req('POST', `/music/api/escolas/${escolaId}/biblioteca`,
      { como: 'bruno', corpo: { obra_id: obraPropria, turma_id: turmaId, nota: 'para a aula de terça' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  });

  await t('OBRA DE TERCEIRO não entra na biblioteca da escola, nem "só para a turma"', async () => {
    const o = await req('POST', '/music/api/obras', { como: 'bruno', corpo: { titulo: 'Sucesso alheio' } });
    obraDeTerceiro = o.json.obra.id;
    const r = await req('POST', `/music/api/escolas/${escolaId}/biblioteca`,
      { como: 'bruno', corpo: { obra_id: obraDeTerceiro, turma_id: turmaId } });
    assert.equal(r.status, 403);
    assert.ok(/também é distribuir/i.test(r.json.erro),
      'distribuir para trinta alunos é distribuir: ' + r.json.erro);
  });

  await t('professor não compartilha música de OUTRA pessoa', async () => {
    const daAna = await req('POST', '/music/api/obras',
      { como: 'ana', corpo: { titulo: 'Minha canção', titularidade: 'propria' } });
    const r = await req('POST', `/music/api/escolas/${escolaId}/biblioteca`,
      { como: 'bruno', corpo: { obra_id: daAna.json.obra.id, turma_id: turmaId } });
    assert.equal(r.status, 403);
    assert.ok(/dono/i.test(r.json.erro), r.json.erro);
  });

  await t('o aluno da turma vê o material da turma', async () => {
    const r = await req('GET', `/music/api/turmas/${turmaId}`, { como: 'ana' });
    assert.equal(r.status, 200);
    assert.ok(r.json.biblioteca.some((b) => b.obra_id === obraPropria));
    assert.ok(!r.json.biblioteca.some((b) => b.obra_id === obraDeTerceiro));
  });

  // ===================================================================
  secao('Fase 3 · boletim');

  await t('a nota da tarefa DA TURMA entra no boletim', async () => {
    const tarefa = await req('POST', '/music/api/prof/tarefas', {
      como: 'bruno',
      corpo: { titulo: 'Escala de dó', turma_id: turmaId, organizacao_id: escolaId,
        nota_maxima: 10, exige_audio: false },
    });
    assert.equal(tarefa.status, 200, JSON.stringify(tarefa.json));
    await req('POST', `/music/api/prof/tarefas/${tarefa.json.tarefa.id}/alunos`,
      { como: 'bruno', corpo: { alunos: ['u-ana'] } });
    const sub = await req('POST', `/music/api/tarefas/${tarefa.json.tarefa.id}/enviar`,
      { como: 'ana', corpo: { texto: 'gravei devagar' } });
    assert.equal(sub.status, 200, JSON.stringify(sub.json));
    await req('POST', `/music/api/prof/submissoes/${sub.json.submissao.id}/feedback`,
      { como: 'bruno', corpo: { texto: 'boa', nota: 8 } });

    const b = await req('GET', `/music/api/turmas/${turmaId}/boletim/u-ana`, { como: 'bruno' });
    assert.equal(b.status, 200, JSON.stringify(b.json));
    assert.equal(b.json.notas.length, 1);
    assert.equal(b.json.notas[0].nota, 8);
    assert.equal(b.json.media_geral, 8);
  });

  await t('AULA SEM CHAMADA não vira falta', async () => {
    await req('POST', `/music/api/turmas/${turmaId}/aulas`,
      { como: 'bruno', corpo: { data: '2026-09-08', tema: 'sem chamada' } });
    const b = await req('GET', `/music/api/turmas/${turmaId}/boletim/u-ana`, { como: 'bruno' });
    assert.equal(b.json.presenca.aulas_registradas, 2);
    assert.equal(b.json.presenca.chamadas_do_aluno, 1);
    assert.equal(b.json.presenca.sem_chamada, 1);
    assert.equal(b.json.presenca.faltas, 0,
      'contar aula sem chamada como falta reprovaria o aluno por descuido do professor');
    assert.equal(b.json.presenca.percentual, 100);
  });

  await t('o boletim DIZ de onde veio cada número', async () => {
    const b = await req('GET', `/music/api/turmas/${turmaId}/boletim/u-ana`, { como: 'bruno' });
    assert.ok(b.json.procedencia.media);
    assert.ok(/não conta como falta/.test(b.json.procedencia.presenca), b.json.procedencia.presenca);
    assert.ok(b.json.procedencia.pratica);
  });

  await t('a REVISÃO de contestação substitui a nota, e o histórico guarda as duas', async () => {
    const sub = db.prepare("SELECT s.id FROM submissoes s JOIN tarefas t ON t.id = s.tarefa_id WHERE t.turma_id = ? AND s.aluno = 'u-ana'")
      .get(turmaId);
    const c = await req('POST', '/music/api/contestacoes',
      { como: 'ana', corpo: { submissao_id: sub.id, motivo: 'o metrônomo estava errado' } });
    await req('POST', `/music/api/prof/contestacoes/${c.json.contestacao.id}`,
      { como: 'bruno', corpo: { acolher: true, resposta: 'confere', nota_nova: 9.5 } });
    const b = await req('GET', `/music/api/turmas/${turmaId}/boletim/u-ana`, { como: 'bruno' });
    assert.equal(b.json.notas.length, 1, 'a tarefa entra uma vez só');
    assert.equal(b.json.notas[0].nota, 9.5, 'vale a mais recente');
    assert.equal(b.json.notas[0].origem, 'revisao');
    assert.equal(b.json.historico_de_notas, 2, 'e as duas continuam no histórico');
  });

  await t('o ALUNO vê o próprio boletim', async () => {
    const r = await req('GET', `/music/api/turmas/${turmaId}/boletim/u-ana`, { como: 'ana' });
    assert.equal(r.status, 200);
    assert.equal(r.json.media_geral, 9.5);
  });

  await t('o RESPONSÁVEL vê o boletim do menor, e mais ninguém vê', async () => {
    const doResp = await req('GET', `/music/api/turmas/${turmaId}/boletim/u-menor`, { como: 'resp' });
    assert.equal(doResp.status, 200, JSON.stringify(doResp.json));
    const deOutro = await req('GET', `/music/api/turmas/${turmaId}/boletim/u-menor`, { como: 'ana' });
    assert.equal(deOutro.status, 403, 'colega não vê boletim de colega');
  });

  await t('o responsável NÃO vê o boletim de um aluno que não é o dele', async () => {
    const r = await req('GET', `/music/api/turmas/${turmaId}/boletim/u-ana`, { como: 'resp' });
    assert.equal(r.status, 403);
  });

  await t('o boletim da turma é da escola, e traz o essencial de cada aluno', async () => {
    const r = await req('GET', `/music/api/turmas/${turmaId}/boletim`, { como: 'bruno' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.boletim.length >= 3);
    const ana = r.json.boletim.find((x) => x.aluno === 'u-ana');
    assert.equal(ana.media_geral, 9.5);
    assert.ok(r.json.boletim.some((x) => x.menor === true), 'a escola precisa saber quem é menor');
  });

  await t('encerrar a matrícula tira o aluno da turma sem apagar o histórico', async () => {
    const m = db.prepare("SELECT * FROM matriculas WHERE turma_id = ? AND aluno = 'u-prof2'").get(turmaId);
    const r = await req('POST', `/music/api/matriculas/${m.id}/encerrar`,
      { como: 'sec', corpo: { motivo: 'mudou de cidade' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const depois = db.prepare('SELECT * FROM matriculas WHERE id = ?').get(m.id);
    assert.equal(depois.status, 'encerrada');
    assert.ok(depois.encerrado_em);
    const pres = db.prepare("SELECT COUNT(*) AS n FROM presencas WHERE aluno = 'u-prof2'").get().n;
    assert.ok(pres > 0, 'a presença registrada continua: é documento da escola');
  });

  // ===================================================================
  secao('Fase 3 · as telas');
  // ===================================================================

  await t('a lista de chamada vem com NOME, não com id de usuário', async () => {
    // Lista de chamada é lista de PESSOAS. Devolver "u-3f9a" e deixar a
    // tela se virar produz uma lista ilegível, que o professor lê como
    // defeito — e não há como marcar falta de alguém que você não
    // reconhece.
    const aula = db.prepare('SELECT * FROM aulas WHERE turma_id = ? ORDER BY criado_em').get(turmaId);
    const r = await req('GET', `/music/api/aulas/${aula.id}/chamada`, { como: 'prof' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.alunos.length > 0);
    for (const a of r.json.alunos) {
      assert.ok(a.nome && !/^u-/.test(a.nome), 'aluno sem nome legível: ' + JSON.stringify(a));
    }
    assert.ok(r.json.alunos.some((a) => a.nome === 'Ana'), 'faltou o nome da Ana');
  });

  await t('a chamada ABRE no que já foi marcado, para corrigir sem recomeçar', async () => {
    const aula = db.prepare('SELECT * FROM aulas WHERE turma_id = ? ORDER BY criado_em').get(turmaId);
    const r = await req('GET', `/music/api/aulas/${aula.id}/chamada`, { como: 'prof' });
    assert.ok(r.json.presencas.length > 0, 'a chamada desta aula já foi feita — tem de vir preenchida');
    const marcada = r.json.presencas[0];
    assert.ok(marcada.estado, 'sem o estado, a tela abriria tudo em branco e remarcaria por engano');
    assert.ok(marcada.registrado_por, 'quem marcou é a primeira pergunta quando alguém reclama');
    assert.ok(marcada.nome, 'a presença também precisa do nome');
  });

  await t('quem não é do ensino não abre a lista de chamada', async () => {
    const aula = db.prepare('SELECT * FROM aulas WHERE turma_id = ? ORDER BY criado_em').get(turmaId);
    const r = await req('GET', `/music/api/aulas/${aula.id}/chamada`, { como: 'sec' });
    assert.equal(r.status, 403, 'a secretaria não esteve na aula');
    const fora = await req('GET', `/music/api/aulas/${aula.id}/chamada`, { como: 'forasteiro' });
    assert.equal(fora.status, 403);
  });

  await t('boletim e equipe também vêm com nome', async () => {
    const b = await req('GET', `/music/api/turmas/${turmaId}/boletim`, { como: 'prof' });
    assert.ok(b.json.boletim.every((x) => x.nome), 'boletim da turma sem nome é uma lista de códigos');
    const um = await req('GET', `/music/api/turmas/${turmaId}/boletim/u-ana`, { como: 'ana' });
    assert.equal(um.json.aluno_nome, 'Ana');
    const e = await req('GET', `/music/api/escolas/${escolaId}`, { como: 'prof' });
    assert.ok(e.json.membros.every((m) => m.nome), 'equipe sem nome');
    assert.ok(e.json.turmas.length > 0);
  });

  await t('o MENU do app só mostra a aba de escola para quem tem escola', async () => {
    // Aba que abre vazia é pior que aba ausente: parece defeito.
    const prof = await req('GET', '/music/api/estudo', { como: 'prof' });
    assert.equal(prof.json.trabalha_em_escola, true);
    // A Tita só estuda: para ela a aba "Escola" não existe.
    const aluno = await req('GET', '/music/api/estudo', { como: 'menor' });
    assert.equal(aluno.json.trabalha_em_escola, false, 'a Tita estuda, não trabalha na escola');
    assert.equal(aluno.json.estuda_em_escola, true);
    // A Ana é os dois: aluna aqui e gestora da escola dela. As duas abas
    // aparecem — o papel é por escola, não por pessoa.
    const ambos = await req('GET', '/music/api/estudo', { como: 'ana' });
    assert.equal(ambos.json.trabalha_em_escola, true);
    assert.equal(ambos.json.estuda_em_escola, true);
    // Quem não tem escola nenhuma não vê aba nenhuma. O `suspenso` não
    // serve aqui (nem entra), então quem prova isto é uma conta limpa.
    // A porta de CRIAR a primeira escola tem de existir para alguem: a
    // aba aparece tambem para quem da aula, ainda sem escola nenhuma.
    const app = await req('GET', '/music/app.js', { cru: true });
    assert.ok(/trabalha_em_escola \|\| estado\.eu\.sou_professor/.test(app.texto),
      'sem isto ninguem teria por onde criar a primeira escola');

    const ninguem = await req('GET', '/music/api/estudo', { como: 'prof2' });
    assert.equal(ninguem.json.estuda_em_escola, false,
      'a matrícula do prof2 foi encerrada — turma encerrada não é turma');
  });

  await t('o RESPONSÁVEL tem por onde chegar no boletim do filho', async () => {
    // A permissão existia desde o começo; a PORTA, não. O responsável
    // via o boletim só se adivinhasse a URL — que é o mesmo que não ver.
    const eu = await req('GET', '/music/api/estudo', { como: 'resp' });
    assert.equal(eu.json.estuda_em_escola, true, 'sem isto a aba não aparece para o responsável');

    const r = await req('GET', '/music/api/minhas-turmas', { como: 'resp' });
    assert.equal(r.status, 200);
    assert.equal(r.json.matriculas.length, 0, 'o responsável não estuda');
    assert.equal(r.json.dependentes.length, 1);
    assert.equal(r.json.dependentes[0].aluno, 'u-menor');
    assert.ok(r.json.dependentes[0].nome, 'lista de dependente sem nome não se usa');
    assert.ok(r.json.dependentes[0].turma_nome && r.json.dependentes[0].escola_nome);

    // E a porta leva exatamente onde a permissão alcança — nada além.
    const b = await req('GET', `/music/api/turmas/${r.json.dependentes[0].turma_id}/boletim/u-menor`,
      { como: 'resp' });
    assert.equal(b.status, 200, JSON.stringify(b.json));
    const outro = await req('GET', '/music/api/minhas-turmas', { como: 'bruno' });
    assert.equal((outro.json.dependentes || []).length, 0, 'quem não responde por ninguém não lista ninguém');
  });

  await t('as telas da Fase 3 são servidas INTEIRAS e compilam', async () => {
    const r = await req('GET', '/music/escolas.js', { cru: true });
    assert.equal(r.status, 200);
    assert.ok(r.texto.length > 9000, 'escolas.js veio com ' + r.texto.length + ' bytes');
    for (const tela of ['verEscolas', 'verEscola', 'verTurma', 'verChamada',
      'verBoletim', 'verBoletimTurma', 'verMinhasTurmas', 'Quem eu acompanho']) {
      assert.ok(r.texto.includes(tela), 'faltou ' + tela);
    }
    try { new Function(r.texto); }
    catch (e) { throw new Error('escolas.js não é JavaScript válido: ' + e.message); }
    const pag = await req('GET', '/music/app', { cru: true });
    assert.ok(pag.texto.includes('/music/escolas.js'), 'a página não carrega as telas de escola');
  });

  await t('a tela diz as três coisas que o boletim NÃO faz', async () => {
    // O texto da tela é parte do contrato honesto (Q5). Se sumir, o
    // produto passa a prometer com o silêncio o que decidiu não fazer.
    const r = await req('GET', '/music/escolas.js', { cru: true });
    assert.ok(/NAO contam como falta/.test(r.texto), 'aula sem chamada não pode virar falta na tela');
    assert.ok(/correcao com autor e data/.test(r.texto), 'a tela tem de dizer de onde vem a nota');
    assert.ok(/So entra musica que e sua/.test(r.texto), 'a trava do acervo precisa aparecer na tela');
    assert.ok(/LGPD, art. 14/.test(r.texto), 'a matrícula de menor tem de explicar o responsável');
  });

  await t('o painel do staff mostra escolas e ASSENTOS usados', async () => {
    // Assento vendido × assento usado é o número comercial da fase.
    const r = await req('GET', '/staff/api/music/painel');
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.numeros.escolas >= 2);
    assert.ok(r.json.numeros.matriculas_ativas >= 1);
    const villa = r.json.escolas.find((e) => e.nome.includes('Villa'));
    assert.ok(villa, 'a escola do teste tinha de aparecer no painel');
    assert.ok(villa.alunos >= 1, 'sem os alunos usados, o assento não se fiscaliza');
    assert.equal(typeof villa.assentos, 'number');
  });

  await t('as ações de escola ficam na auditoria', async () => {
    const acoes = require('./direitos').auditoria(400).map((e) => e.acao);
    for (const a of ['escola.criada', 'escola.membro', 'turma.criada', 'matricula',
      'chamada', 'escola.biblioteca', 'matricula.encerrada']) {
      assert.ok(acoes.includes(a), 'falta na auditoria: ' + a);
    }
  });
}

module.exports = { rodar };
