// =====================================================================
// Villela Academy — ESTUDE · testes do CURSO QUE REÚNE AULAS DE OUTRO ESCOPO
// (ADR-0015; leitura em estudo/repo.js, data por escopo em estudo/lei-juris.js,
// vídeo em repo-conteudo.js, Tutor em interativo.js). Chamado pelo selftest.
//   · importação: a lista de inclusões é validada (aula de origem que existe,
//     mesmo produtor, item de destino do programa de B, sem colidir código de
//     aula nem de competência) e pode substituir a lista inteira;
//   · leitura: B vê as próprias + as incluídas (com os itens de B), nunca uma
//     aula de A fora da lista; corrigir em A aparece em B; publicar B não toca A;
//     competências e cards herdados; progresso do aluno gravado em B;
//   · vídeo, página de venda e Tutor de B enxergam as incluídas;
//   · data de referência por escopo na legislação e na jurisprudência — e o
//     curso A lê exatamente o que lia antes.
// =====================================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function rodar({ t, req }) {
  const { db } = require('../db');
  const repo = require('../repo');
  const ct = require('../repo-conteudo');
  const R = require('./repo');
  const it = require('../interativo');

  console.log('\n— estudo/curso que reúne aulas de outro escopo (ADR-0015): inclusões, herança, vídeo, Tutor, venda e data de referência por escopo —');
  const PROD = 'maria@t.com', SA = 'incl-juiz', SB = 'incl-mpt', IP = '10.15.0.';
  let pidA = '', pidB = '', pidX = '', seq = 0;
  const chave = (m, rota, corpo) => req(m, rota, { semUser: true, chave: true, corpo, ip: IP + '200' });
  const importar = (pid, corpo) => chave('POST', '/staff/api/academy/estudo/importar', { produtor_email: PROD, produto_id: pid, ...corpo });
  const status = (pid, corpo) => chave('POST', '/staff/api/academy/estudo/status', { produtor_email: PROD, produto_id: pid, ...corpo });
  const lj = (pid, slug, caminho, corpo) => chave('POST', '/staff/api/academy/estudo/lei-juris/' + caminho, { produtor_email: PROD, produto_id: pid, escopo: slug, ...corpo });
  const eA = () => R.Escopos.porSlug(pidA, SA), eB = () => R.Escopos.porSlug(pidB, SB);
  const uid = (email) => repo.Usuarios.porEmail(email).id;
  async function conta(nome, pids) {
    const n = ++seq, u = { nome, email: `incl-${n}@t.com`, senha: 'senha-forte-incl', aceite_termos: true }, jar = 'incl-' + n;
    assert.equal((await req('POST', '/academy/api/signup', { corpo: u, jar, ip: IP + n })).st, 200);
    for (const pid of pids) assert.equal((await req('POST', `/academy/api/produtor/produtos/${pid}/matricular`, { jar: 'maria', corpo: { email: u.email } })).st, 200);
    const em = (pid, slug) => (rota) => req('GET', `/academy/api/aluno/cursos/${pid}/estudo/${slug}${rota}`, { jar, ip: IP + n });
    return { ...u, jar, id: uid(u.email), A: em(pidA, SA), B: em(pidB, SB) };
  }
  const curso = async (titulo) => {
    const r = await chave('POST', '/staff/api/academy/importar-curso', { produtor_email: PROD,
      produto: { titulo, tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Curso de teste das inclusões' },
      modulos: [{ titulo: 'Módulo', aulas: [{ titulo: 'Comece por aqui', tipo: 'texto', conteudo: 'Casca.' }] }] });
    assert.equal(r.st, 200, r.texto);
    return r.json.produto.id;
  };
  const AULA = (cod, comp, item, extra = {}) => ({ codigo: cod, titulo: `Aula ${cod}`, competencias: [comp], itens: [item], tempo_min: 30,
    blocos: [{ tipo: 'explicacao', texto: `Explicação da ${cod}: a regra geral e a exceção.` }, { tipo: 'pratica', titulo: 'Exercício', texto: `Exercício da ${cod}: aplique a regra.`, solucao: 'Solução.' }], ...extra });
  const COMP = (cod) => ({ codigo: cod, resultado: `Diante de um caso concreto (${cod}), o aluno identifica a regra, aplica a norma e justifica com a fonte.` });
  const DIP = () => ({ id: 'lei-incl', nome: 'Lei das Inclusões', norma: 'Lei de teste', sigla: 'LINC', tipo: 'lei', abrangencia: 'integral',
    fonte_url: 'https://www.planalto.gov.br/inclusoes.htm', consultado_em: '2026-10-17', data_referencia_edital: '2023-01-05',
    dispositivos: [
      { id: 'art-1', rotulo: 'Art. 1º', ordem: 1, texto: 'Regra que nunca mudou.', partes: [], situacao: 'vigente', nota: '', alterado_por: null, texto_na_data_do_edital: null },
      { id: 'art-2', rotulo: 'Art. 2º', ordem: 2, texto: 'Redação de junho de 2023.', partes: [], situacao: 'alterado_apos_edital', nota: '(Redação dada pela Lei nº 14.000, de 2023)', alterado_por: { norma: 'Lei nº 14.000', data: '2023-06-01' }, texto_na_data_do_edital: 'Redação de 2022.' },
      { id: 'art-3', rotulo: 'Art. 3º', ordem: 3, texto: 'Redação de 2025.', partes: [{ id: 'art-3.p1', caminho: '§ 1º', rotulo: '§ 1º', texto: 'Parágrafo de 2025.', situacao: 'alterado_apos_edital', nota: '', alterado_por: { norma: 'Lei nº 15.100', data: '2025-01-01' }, texto_na_data_do_edital: 'Parágrafo de 2022.' }],
        situacao: 'alterado_apos_edital', nota: '(Redação dada pela Lei nº 15.100, de 2025)', alterado_por: { norma: 'Lei nº 15.100', data: '2025-01-01' }, texto_na_data_do_edital: 'Redação de 2022 do art. 3º.' },
    ] });
  const COLECAO = [{ id: 'incl-tst', nome: 'Súmulas de teste das inclusões', tribunal: 'TST', fonte_url: 'https://jurisprudencia.tst.jus.br/', consultado_em: '2026-10-17' }];
  const VERBETES = [
    { id: 'incl-sum-1', colecao: 'incl-tst', tipo: 'sumula', tribunal: 'TST', numero: '9001', texto: 'Súmula que não mudou.', situacao: 'vigente', situacao_na_data_do_edital: 'vigente', fonte_url: 'https://jurisprudencia.tst.jus.br/?s=9001', consultado_em: '2026-10-17' },
    { id: 'incl-sum-2', colecao: 'incl-tst', tipo: 'sumula', tribunal: 'TST', numero: '9002', texto: 'Súmula cancelada em 2024.', situacao: 'cancelado', situacao_na_data_do_edital: 'vigente', situacao_detalhe: 'Cancelada em 2024', fonte_url: 'https://jurisprudencia.tst.jus.br/?s=9002', consultado_em: '2026-10-17' },
  ];

  // ================= os dois cursos =================
  let antesA = null;
  await t('inclusões: o curso A (edital do Juiz) com três aulas, cards e acervo; o curso B (edital do MPT, outra numeração) com uma aula própria e data de referência própria', async () => {
    pidA = await curso('Curso A das inclusões'); pidB = await curso('Curso B das inclusões'); pidX = await curso('Curso de outro produtor');
    let r = await importar(pidA, { escopo: { slug: SA, tipo: 'edital', titulo: 'Juiz (A)' },
      programa: { documento: { nome: 'Edital A', tipo: 'edital' }, itens: [{ codigo: '1', texto: 'Programa A' }, { codigo: '1.1', texto: 'Direito do Trabalho' },
        { codigo: '1.1.1', texto: 'Rescisão' }, { codigo: '1.1.2', texto: 'Jornada' }, { codigo: '1.1.3', texto: 'Férias' }] },
      competencias: [COMP('ca-1'), COMP('ca-2'), COMP('ca-3')],
      vinculos: [['1.1.1', 'ca-1'], ['1.1.2', 'ca-2'], ['1.1.3', 'ca-3']].map(([item, competencia]) => ({ item, competencia, justificativa: 'O item é a própria regra.' })),
      unidades: [AULA('aula-a1', 'ca-1', '1.1.1'), AULA('aula-a2', 'ca-2', '1.1.2'), AULA('aula-a3', 'ca-3', '1.1.3')],
      cards: [{ codigo: 'card-a1', competencia: 'ca-1', frente: 'Qual é a regra da rescisão?', verso: 'A regra A1.' }, { codigo: 'card-a3', competencia: 'ca-3', frente: 'Qual é a regra das férias?', verso: 'A regra A3.' }] });
    assert.equal(r.st, 200, r.texto);
    assert.equal((await status(pidA, { escopo: SA, status: 'publicado', unidades: 'publicado', cards: 'publicado' })).st, 200);
    r = await importar(pidB, { escopo: { slug: SB, tipo: 'edital', titulo: 'Procurador (B)', data_referencia: '2024-04-07', rotulo_data_referencia: 'data de corte da objetiva' },
      programa: { documento: { nome: 'Edital B', tipo: 'edital' }, itens: [{ codigo: '2', texto: 'Programa B' }, { codigo: '2.1', texto: 'Direito do Trabalho (MPT)' },
        { codigo: '2.1.1', texto: 'Extinção do contrato' }, { codigo: '2.1.2', texto: 'Duração do trabalho' }, { codigo: '2.1.9', texto: 'Inquérito civil' }] },
      competencias: [COMP('cb-1')], vinculos: [{ item: '2.1.9', competencia: 'cb-1', justificativa: 'O item é a própria regra.' }],
      unidades: [AULA('aula-b1', 'cb-1', '2.1.9', { ordem: 5 })] });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([eB().data_referencia, eB().rotulo_data_referencia], ['2024-04-07', 'data de corte da objetiva']);
    assert.equal((await importar(pidB, { escopo: { slug: SB, data_referencia: '07/04/2024' } })).st, 400, 'data no formato AAAA-MM-DD');
    // o que o curso A mostra ANTES de existir qualquer inclusão (comparado no fim)
    antesA = { uns: R.unidades(eA().id, ['publicado']).map(u => [u.codigo, u.itens, u.ordem]), comps: R.competencias(eA().id).map(c => c.codigo), cards: R.cards(eA().id, ['publicado']).map(k => k.id),
      vins: R.vinculos(eA().id).length };
  });

  // ================= importação =================
  await t('inclusões: a lista é validada — aula de origem que existe, mesmo produtor, item de destino do programa de B, código que não colide; nada é gravado na recusa', async () => {
    const INC = (extra) => ({ origem_escopo_slug: SA, origem_produto_id: pidA, unidade_codigo: 'aula-a1', itens_destino: ['2.1.1'], ...extra });
    const tentar = (inclusoes) => importar(pidB, { escopo: { slug: SB }, inclusoes });
    let r = await tentar([INC({ unidade_codigo: 'aula-nada' })]);
    assert.equal(r.st, 404, r.texto); assert.ok(/não existe/.test(r.json.erro));
    r = await tentar([INC({ itens_destino: ['1.1.1'] })]);
    assert.equal(r.st, 400, r.texto); assert.ok(/item de destino "1\.1\.1"/.test(r.json.erro), 'o item tem de ser do programa de B, não do de A');
    r = await tentar([INC({ origem_escopo_slug: 'nao-existe' })]);
    assert.equal(r.st, 404, r.texto);
    r = await tentar([INC({ origem_escopo_slug: SB, origem_produto_id: pidB, unidade_codigo: 'aula-b1' })]);
    assert.equal(r.st, 400, r.texto); assert.ok(/si mesmo/.test(r.json.erro));
    // aula própria de A com o mesmo código de aula própria de B
    await importar(pidA, { escopo: { slug: SA }, unidades: [AULA('aula-b1', 'ca-1', '1.1.1')] });
    r = await tentar([INC({ unidade_codigo: 'aula-b1' })]);
    assert.equal(r.st, 409, r.texto); assert.ok(/aula própria deste percurso/.test(r.json.erro));
    db.prepare("DELETE FROM est_unidades WHERE escopo_id = ? AND codigo = 'aula-b1'").run(eA().id);
    // outro produtor: o curso X passa a ser de outra pessoa (a origem é do mesmo produtor, ou nada)
    assert.equal((await importar(pidX, { escopo: { slug: 'incl-x', tipo: 'edital', titulo: 'X' }, programa: { itens: [{ codigo: '9', texto: 'X' }, { codigo: '9.1', texto: 'X1' }] }, competencias: [COMP('cx-1')],
      unidades: [AULA('aula-x1', 'cx-1', '9.1')] })).st, 200);
    const outro = (await conta('Outro Produtor', [])).id;
    db.prepare('UPDATE products SET producer_id = ? WHERE id = ?').run(outro, pidX);
    r = await tentar([INC({ origem_escopo_slug: 'incl-x', origem_produto_id: pidX, unidade_codigo: 'aula-x1' })]);
    assert.equal(r.st, 403, r.texto); assert.ok(/outro produtor/.test(r.json.erro));
    assert.equal(db.prepare('SELECT COUNT(*) n FROM est_escopo_inclusoes WHERE escopo_id = ?').get(eB().id).n, 0, 'nenhuma recusa gravou nada');
    // a lista certa
    r = await tentar([INC({ ordem: 0 }), INC({ unidade_codigo: 'aula-a2', itens_destino: ['2.1.2'], ordem: 1 })]);
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.importado.inclusoes.novas, r.json.importado.inclusoes.total], [2, 2]);
    assert.ok(r.json.resumo.incluidas.some(x => x.status === 'publicado' && x.n === 2), 'o resumo do staff conta as incluídas pelo status da origem');
    // reenviar = upsert (não duplica); a mesma aula duas vezes na lista é recusada
    r = await tentar([INC({ ordem: 0 })]);
    assert.deepEqual([r.json.importado.inclusoes.atualizadas, r.json.importado.inclusoes.total], [1, 2]);
    assert.equal((await tentar([INC(), INC()])).st, 409);
  });

  await t('inclusões: aula PRÓPRIA de B não pode ter o código de uma incluída, nem competência própria o código de uma herdada; "substituir" faz da lista enviada a lista inteira', async () => {
    let r = await importar(pidB, { escopo: { slug: SB }, unidades: [AULA('aula-a1', 'cb-1', '2.1.9')] });
    assert.equal(r.st, 409, r.texto); assert.ok(/aula incluída/.test(r.json.erro));
    r = await importar(pidB, { escopo: { slug: SB }, competencias: [COMP('ca-1')] });
    assert.equal(r.st, 409, r.texto); assert.ok(/herdada/.test(r.json.erro));
    // substituir: manda só a aula-a1 → a aula-a2 sai; depois volta
    r = await importar(pidB, { escopo: { slug: SB }, inclusoes_substituir: true, inclusoes: [{ origem_escopo_slug: SA, origem_produto_id: pidA, unidade_codigo: 'aula-a1', itens_destino: ['2.1.1'], ordem: 0 }] });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.importado.inclusoes.removidas, r.json.importado.inclusoes.total], [1, 1]);
    r = await importar(pidB, { escopo: { slug: SB }, inclusoes: [{ origem_escopo_slug: SA, origem_produto_id: pidA, unidade_codigo: 'aula-a2', itens_destino: ['2.1.2'], ordem: 1 }] });
    assert.equal(r.json.importado.inclusoes.total, 2);
    assert.equal((await status(pidB, { escopo: SB, status: 'publicado', unidades: 'publicado' })).st, 200);
  });

  // ================= leitura =================
  let soB, soA, nenhum;
  await t('inclusões: o aluno de B vê as próprias e as incluídas (com os itens de B, na ordem de B) — NUNCA a aula de A que ficou fora da lista; competências e cards herdados', async () => {
    soB = await conta('Bia do MPT', [pidB]); soA = await conta('Ana do Juiz', [pidA]); nenhum = await conta('Caio sem curso', []);
    const p = await soB.B('/painel');
    assert.equal(p.st, 200, p.texto);
    assert.deepEqual(p.json.unidades.map(u => u.codigo), ['aula-a1', 'aula-a2', 'aula-b1'], 'a ordem é a de B (incluídas 0 e 1, própria 5)');
    assert.equal((await soB.B('/unidades/aula-a3')).st, 404, 'aula de A fora da lista não existe em B');
    const u = await soB.B('/unidades/aula-a1?aberta=1');
    assert.equal(u.st, 200, u.texto);
    assert.deepEqual([u.json.itens, u.json.competencias], [['2.1.1'], ['ca-1']], 'os itens são os do edital B; a competência é a da origem');
    assert.ok(u.json.blocos[0].texto.includes('Explicação da aula-a1'));
    // a cobertura de B conta a incluída no item de B
    const cob = R.cobertura(eB(), { vis: ['publicado'] });
    assert.deepEqual(cob.por_item.find(i => i.codigo === '2.1.1').unidades, ['aula-a1']);
    assert.deepEqual(cob.por_item.find(i => i.codigo === '2.1.1').competencias.map(c => c.codigo), ['ca-1'], 'o item de B herda a competência da aula incluída');
    // competências: as de B + as herdadas das aulas incluídas (a da aula-a3, fora da lista, não vem)
    assert.deepEqual(R.competencias(eB().id).map(c => [c.codigo, !!c.herdada_de]), [['cb-1', false], ['ca-1', true], ['ca-2', true]]);
    assert.deepEqual(p.json.competencias.map(c => c.codigo).sort(), ['ca-1', 'ca-2', 'cb-1']);
    // cards: o card-a1 (competência herdada) vem; o card-a3 (aula fora da lista) não
    const cards = await soB.B('/cards');
    assert.equal(cards.st, 200, cards.texto);
    assert.deepEqual(cards.json.novos.map(k => k.frente), ['Qual é a regra da rescisão?']);
    // o progresso fica em B: abrir a aula-a1 em B não a marca aberta em A
    assert.ok(db.prepare("SELECT 1 FROM est_aula_estado WHERE user_id = ? AND escopo_id = ? AND unidade = 'aula-a1' AND aberta_em != ''").get(soB.id, eB().id));
    assert.ok(!db.prepare('SELECT 1 FROM est_aula_estado WHERE user_id = ? AND escopo_id = ?').get(soB.id, eA().id));
    // quem só tem A não entra em B (e vice-versa)
    assert.equal((await soA.B('/painel')).st, 403);
    assert.equal((await soB.A('/painel')).st, 403);
  });

  await t('inclusões: corrigir a aula em A aparece em B na hora; despublicar a aula em A a tira de B; publicar/despublicar B em lote NÃO toca A', async () => {
    let r = await importar(pidA, { escopo: { slug: SA }, unidades: [AULA('aula-a1', 'ca-1', '1.1.1', { blocos: [{ tipo: 'explicacao', texto: 'Explicação CORRIGIDA da aula-a1, com a súmula nova.' }, { tipo: 'pratica', titulo: 'Exercício', texto: 'Exercício da aula-a1: aplique a regra.', solucao: 'Solução.' }] })] });
    assert.equal(r.st, 200, r.texto);
    let u = await soB.B('/unidades/aula-a1');
    assert.ok(u.json.blocos[0].texto.includes('CORRIGIDA'), 'B lê a linha de A: uma correção só');
    assert.deepEqual(u.json.itens, ['2.1.1'], 'e continua com os itens de B');
    // a origem manda no status
    db.prepare("UPDATE est_unidades SET status = 'rascunho', atualizado_em = ? WHERE escopo_id = ? AND codigo = 'aula-a2'").run(new Date().toISOString(), eA().id);
    try {
      assert.equal((await soB.B('/unidades/aula-a2')).st, 404, 'rascunho em A some de B');
      assert.deepEqual((await soB.B('/painel')).json.unidades.map(x => x.codigo), ['aula-a1', 'aula-b1']);
    } finally { db.prepare("UPDATE est_unidades SET status = 'publicado', atualizado_em = ? WHERE escopo_id = ? AND codigo = 'aula-a2'").run(new Date().toISOString(), eA().id); }
    // B em lote para rascunho: só as aulas PRÓPRIAS de B mudam; as de A ficam publicadas
    r = await status(pidB, { escopo: SB, unidades: 'rascunho', cards: 'rascunho' });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.alterados.unidades, r.json.alterados.cards], [1, 0], 'só a aula-b1 (e nenhum card de A)');
    assert.deepEqual(db.prepare('SELECT DISTINCT status FROM est_unidades WHERE escopo_id = ?').all(eA().id).map(x => x.status), ['publicado']);
    assert.deepEqual(db.prepare('SELECT DISTINCT status FROM est_cards WHERE escopo_id = ?').all(eA().id).map(x => x.status), ['publicado']);
    assert.deepEqual((await soB.B('/painel')).json.unidades.map(x => x.codigo), ['aula-a1', 'aula-a2'], 'a incluída segue a origem, publicada');
    assert.equal((await status(pidB, { escopo: SB, unidades: 'publicado' })).st, 200);
  });

  // ================= vídeo, venda e Tutor =================
  await t('inclusões: o VÍDEO da aula incluída é liberado a quem tem B (ou A) — não a quem não tem nenhum, nem com B em rascunho', async () => {
    const maria = uid(PROD), agora = new Date().toISOString();
    db.prepare("INSERT INTO media_files (id, owner_user_id, nome, mime, tamanho, file_path, storage, confirmado, criado_em) VALUES ('video-incl', ?, 'a1.mp4', 'video/mp4', 10, 'estudo/a1.mp4', 'local', 1, ?)").run(maria, agora);
    db.prepare("UPDATE est_unidades SET video_media_id = 'video-incl', video_duracao_seg = 120, atualizado_em = ? WHERE escopo_id = ? AND codigo = 'aula-a1'").run(agora, eA().id);
    const pode = (u) => ct.Midia.podeAcessar('video-incl', { id: u.id, papeis: [] });
    assert.equal(pode(soB), true, 'quem tem só B assiste à incluída');
    assert.equal(pode(soA), true, 'quem tem A também (como sempre)');
    assert.equal(pode(nenhum), false, 'quem não tem nenhum dos dois, não');
    const u = await soB.B('/unidades/aula-a1');
    assert.deepEqual(u.json.video && u.json.video.media_id, 'video-incl', 'a tela da aula em B mostra a videoaula');
    db.prepare("UPDATE est_escopos SET status = 'rascunho' WHERE id = ?").run(eB().id);
    try { assert.equal(pode(soB), false, 'percurso B em rascunho não libera'); } finally { db.prepare("UPDATE est_escopos SET status = 'publicado' WHERE id = ?").run(eB().id); }
    // o staff que tenta subir o vídeo pela aula incluída em B é mandado para a origem
    const r = await chave('POST', '/staff/api/academy/estudo/video', { produtor_email: PROD, produto_id: pidB, escopo: SB, unidade: 'aula-a1', nome: 'a.mp4', mime: 'video/mp4', tamanho: 4096 });
    assert.equal(r.st, 400, r.texto); assert.ok(/percurso de origem/.test(r.json.erro), r.texto);
  });

  await t('inclusões: a PÁGINA DE VENDA de B soma as aulas incluídas (aulas, vídeos e cards herdados)', async () => {
    const r = ct.Marketplace.resumoDoEstude(pidB);
    assert.ok(r, 'B hospeda o Estude');
    assert.deepEqual([r.aulas, r.videos, r.video_seg, r.cards], [3, 1, 120, 1]);
    const a = ct.Marketplace.resumoDoEstude(pidA);
    assert.deepEqual([a.aulas, a.cards], [3, 2], 'A conta o que sempre contou');
  });

  await t('inclusões: o TUTOR de B acha os trechos das aulas incluídas (consultando o produto de A, sem copiar) — e nada do resto de A', async () => {
    const r = await chave('POST', '/staff/api/academy/interativo/importar', { produtor_email: PROD, produto_id: pidA, trechos: { itens: [
      { fonte: 'artigo', rotulo: `[est:${SA}/aula-a1] Aula A1 · texto`, texto: 'A rescisão indireta ocorre quando o empregador descumpre obrigações do contrato.' },
      { fonte: 'artigo', rotulo: `[est:${SA}/aula-a3] Aula A3 · texto`, texto: 'As férias proporcionais na rescisão indireta são devidas ao empregado.' },
      { fonte: 'livro', rotulo: 'Livro do curso A', texto: 'Capítulo sobre rescisão indireta no livro do curso A.' }] } });
    assert.equal(r.st, 200, r.texto);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM tutor_trechos WHERE product_id = ?').get(pidB).n, 0, 'nada copiado para B');
    assert.equal(it.temBase(pidB), true, 'B tem Tutor pelas aulas incluídas');
    const usuario = repo.Usuarios.porEmail(soB.email), produto = ct.Produtos.obter(pidB);
    const ctx = it.contextoTutor(usuario, produto, 'O que é a rescisão indireta?', '', { escopo: SB, unidade: 'aula-a1' });
    assert.ok(ctx.length && ctx[0].texto.includes('descumpre obrigações'), 'a aula aberta (incluída) vem primeiro');
    assert.deepEqual([ctx[0].est_escopo, ctx[0].est_unidade], [SB, 'aula-a1'], 'o trecho responde pelo percurso B');
    assert.ok(!ctx.some(x => /férias proporcionais|livro do curso A/.test(x.texto)), 'a aula-a3 (fora da lista) e o livro de A não vazam para B');
    // a aula incluída despublicada em A sai do Tutor do aluno de B
    db.prepare("UPDATE est_unidades SET status = 'rascunho', atualizado_em = ? WHERE escopo_id = ? AND codigo = 'aula-a1'").run(new Date().toISOString(), eA().id);
    try { assert.ok(!it.contextoTutor(usuario, produto, 'O que é a rescisão indireta?', '', null).some(x => /descumpre obrigações/.test(x.texto))); }
    finally { db.prepare("UPDATE est_unidades SET status = 'publicado', atualizado_em = ? WHERE escopo_id = ? AND codigo = 'aula-a1'").run(new Date().toISOString(), eA().id); }
  });

  // ================= data de referência por escopo =================
  let antesLeiA = null, antesJurisA = null;
  await t('inclusões/lei-juris: o acervo é UM só; o curso A lê a data do acervo (05/01/2023) como antes, o B a data de corte dele — o que se pode afirmar vem do acervo, o resto fica "não disponível"', async () => {
    for (const [pid, slug, item] of [[pidA, SA, '1.1.1'], [pidB, SB, '2.1.1']]) {
      assert.equal((await lj(pid, slug, 'diploma', { diploma: DIP() })).st, 200);
      assert.equal((await lj(pid, slug, 'jurisprudencia', { colecoes: COLECAO, itens: VERBETES })).st, 200);
      const r = await lj(pid, slug, 'vinculos', { disciplina: item.split('.').slice(0, 2).join('.'), itens: [{ codigo: item,
        legislacao: ['art-1', 'art-2', 'art-3'].map(d => ({ diploma: 'lei-incl', dispositivo: d, origem: 'aula', confianca: 'alta' })),
        jurisprudencia: VERBETES.map(v => ({ id: v.id, origem: 'aula', confianca: 'alta' })) }] });
      assert.equal(r.st, 200, r.texto);
      assert.equal((await lj(pid, slug, 'status', { status: 'publicado' })).st, 200);
    }
    assert.equal(db.prepare("SELECT COUNT(*) n FROM est_lj_diplomas WHERE id = 'lei-incl'").get().n, 1, 'o diploma é um só');
    // A: exatamente o acervo
    const la = await soA.A('/legislacao/vinculada?unidade=aula-a1');
    assert.equal(la.st, 200, la.texto);
    const da = la.json.diplomas[0];
    assert.deepEqual([da.data_referencia_edital, da.rotulo_data_referencia, da.alterados_apos_edital], ['2023-01-05', '', 2]);
    assert.deepEqual(da.dispositivos.map(x => [x.id, x.situacao, x.texto_na_data_do_edital]), [['art-1', 'vigente', null], ['art-2', 'alterado_apos_edital', 'Redação de 2022.'], ['art-3', 'alterado_apos_edital', 'Redação de 2022 do art. 3º.']]);
    antesLeiA = la.json;
    const ja = await soA.A('/jurisprudencia/verbete/incl-sum-2');
    assert.deepEqual([ja.json.verbete.situacao_na_data_do_edital, ja.json.verbete.data_referencia], ['vigente', '2023-01-05']);
    antesJurisA = ja.json;
    // B: a aula incluída aponta para os itens de B — e a data é a de B
    const lb = await soB.B('/legislacao/vinculada?unidade=aula-a1');
    assert.equal(lb.st, 200, lb.texto);
    assert.deepEqual(lb.json.itens.map(i => i.codigo), ['2.1.1']);
    const db_ = lb.json.diplomas[0];
    assert.deepEqual([db_.data_referencia_edital, db_.rotulo_data_referencia, db_.alterados_apos_edital], ['2024-04-07', 'data de corte da objetiva', null], 'a contagem do acervo (de outra data) não é mostrada');
    const porId = Object.fromEntries(db_.dispositivos.map(x => [x.id, x]));
    assert.deepEqual([porId['art-1'].situacao, porId['art-1'].texto_na_data_do_edital], ['vigente', null]);
    assert.deepEqual([porId['art-2'].situacao, porId['art-2'].texto_na_data_do_edital], ['vigente', null], 'alterado em 2023-06-01, antes do corte de B: já vigorava assim');
    assert.deepEqual([porId['art-3'].situacao, porId['art-3'].texto_na_data_do_edital, porId['art-3'].edital_indisponivel], ['alterado_apos_edital', null, true], 'alterado depois do corte: a redação de 2022 NÃO é a de 07/04/2024 — fica não disponível');
    assert.deepEqual([porId['art-3'].partes[0].situacao, porId['art-3'].partes[0].texto_na_data_do_edital, porId['art-3'].partes[0].texto_na_data_do_edital_indisponivel], ['alterado_apos_edital', null, true]);
    const v1 = (await soB.B('/jurisprudencia/verbete/incl-sum-1')).json.verbete, v2 = (await soB.B('/jurisprudencia/verbete/incl-sum-2')).json.verbete;
    assert.deepEqual([v1.situacao_na_data_do_edital, v1.data_referencia, v1.rotulo_data_referencia], ['vigente', '2024-04-07', 'data de corte da objetiva'], 'o que não mudou desde o acervo continua valendo');
    assert.deepEqual([v2.situacao_na_data_do_edital, v2.situacao_na_data_do_edital_inferida], ['', true]);
    assert.ok(/NÃO APURADO para a data de corte da objetiva deste curso \(07\/04\/2024\)/.test(v2.situacao_na_data_do_edital_nota), v2.situacao_na_data_do_edital_nota);
    // a busca dá a situação na data de B
    const bb = await soB.B('/lei-juris/busca?q=' + encodeURIComponent('art. 2 LINC') + '&onde=lei');
    assert.equal(bb.st, 200, bb.texto);
    const achado = bb.json.lei.find(x => x.diploma_id === 'lei-incl' && x.id === 'art-2');
    assert.ok(achado, 'o art. 2º da LINC é achado pelo número: ' + bb.texto.slice(0, 300));
    assert.equal(achado.situacao, 'vigente', 'com a situação na data de B');
  });

  await t('inclusões/lei-juris: o staff manda o texto "na data" PRÓPRIO de B (rota nova) — B passa a mostrá-lo; A não muda nada; percurso sem data própria recusa', async () => {
    let r = await lj(pidA, SA, 'textos-do-escopo', { dispositivos: [{ diploma: 'lei-incl', id: 'art-3', situacao: 'alterado_apos_edital', texto_na_data: 'x' }] });
    assert.equal(r.st, 409, r.texto); assert.ok(/data do acervo/.test(r.json.erro));
    r = await lj(pidB, SB, 'textos-do-escopo', { dispositivos: [{ diploma: 'lei-incl', id: 'art-99', situacao: 'vigente' }] });
    assert.equal(r.st, 400, r.texto); assert.ok(r.json.erros.join(' ').includes('art-99'));
    r = await lj(pidB, SB, 'textos-do-escopo', { dispositivos: [{ diploma: 'lei-incl', id: 'art-3', situacao: 'alterado_apos_edital', texto_na_data: 'Redação de 2023 do art. 3º.', nota: 'Lida no Planalto em 17/10/2026.' },
      { diploma: 'lei-incl', id: 'art-3.p1', situacao: 'alterado_apos_edital', texto_na_data: 'Parágrafo de 2023.' }],
      verbetes: [{ id: 'incl-sum-2', situacao_na_data: 'vigente', nota: 'Vigente em 07/04/2024 (cancelada em 2024 depois do corte).' }] });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.dispositivos, r.json.verbetes], [2, 1]);
    const a3 = (await soB.B('/legislacao/vinculada?unidade=aula-a1')).json.diplomas[0].dispositivos.find(x => x.id === 'art-3');
    assert.deepEqual([a3.texto_na_data_do_edital, a3.edital_indisponivel, a3.nota_na_data_de_referencia, a3.partes[0].texto_na_data_do_edital], ['Redação de 2023 do art. 3º.', false, 'Lida no Planalto em 17/10/2026.', 'Parágrafo de 2023.']);
    const v2 = (await soB.B('/jurisprudencia/verbete/incl-sum-2')).json.verbete;
    assert.deepEqual([v2.situacao_na_data_do_edital, v2.situacao_na_data_do_edital_inferida], ['vigente', false]);
    // A: byte a byte o que lia antes
    assert.deepEqual((await soA.A('/legislacao/vinculada?unidade=aula-a1')).json, antesLeiA, 'o curso A não muda');
    assert.deepEqual((await soA.A('/jurisprudencia/verbete/incl-sum-2')).json, antesJurisA);
    // o resumo do staff de B mostra a data e quantos textos são próprios
    const rs = await chave('GET', `/staff/api/academy/estudo/lei-juris/resumo?produtor_email=${encodeURIComponent(PROD)}&produto_id=${pidB}&escopo=${SB}`);
    assert.deepEqual([rs.json.data_referencia, rs.json.textos_proprios], ['2024-04-07', { dispositivos: 2, verbetes: 1 }]);
  });

  await t('inclusões/tela: a data "na data do edital" vem da API — nenhum "05/01/2023" fixo; o nome da data é o do percurso', async () => {
    const tela = fs.readFileSync(path.join(__dirname, '..', 'app-estudo.js'), 'utf8');
    assert.ok(!tela.includes('05/01/2023'), 'a data do curso de Juiz não está mais fixa na tela');
    assert.ok(/function situacaoDoDispositivo\(x, dataEdital, rotulo\)/.test(tela) && tela.includes('dip.rotulo_data_referencia') && tela.includes('v.data_referencia ? '), 'dispositivo e verbete usam a data e o nome que vêm da API');
  });

  // ================= o curso A, no fim =================
  await t('inclusões: o curso A continua exatamente como era — aulas, itens, ordem, competências, vínculos e cards', async () => {
    const depois = { uns: R.unidades(eA().id, ['publicado']).map(u => [u.codigo, u.itens, u.ordem]), comps: R.competencias(eA().id).map(c => c.codigo), cards: R.cards(eA().id, ['publicado']).map(k => k.id),
      vins: R.vinculos(eA().id).length };
    assert.deepEqual(depois, antesA);
    assert.ok(!R.unidades(eA().id, ['publicado']).some(u => u.origem), 'nenhuma aula de A ganhou marcador de origem');
    // e o painel do aluno de A lista as três aulas dele
    assert.deepEqual((await soA.A('/painel')).json.unidades.map(u => u.codigo), ['aula-a1', 'aula-a2', 'aula-a3']);
  });
}

module.exports = { rodar };
