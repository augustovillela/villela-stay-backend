// =====================================================================
// Villela Academy — ESTUDO · TRAVA ENTRE CURSOS (ADR-0018, 01/11/2026).
// A questão é uma linha por produtor + hash. Os lotes do TRF-3 reescreveram assim
// 272 questões do TJDFT: gabarito, comentário e bloco de outro curso, sem aviso.
//   · importar questão ligada a escopo de OUTRO produto só soma o vínculo;
//   · `reescrever_compartilhada: true` escreve e diz o que escreveu;
//   · `desvincular_questoes` tira vínculo errado só do escopo que pede;
//   · as leituras com_dados e com_blocos mostram o que está gravado, pela mesma chave.
// =====================================================================
'use strict';
const assert = require('assert');

async function rodar({ t, req }) {
  const { db } = require('../db');
  const R = require('./repo');

  console.log('\n— estudo/trava entre cursos (ADR-0018): importar não reescreve a questão de outro curso —');
  const PROD = 'maria@t.com', SA = 'trava-tjdft', SB = 'trava-trf3', SB2 = 'trava-trf3-oficial', SB3 = 'trava-inclui', SC = 'trava-cobertura', IP = '10.18.0.200';
  let pidA = '', pidB = '';
  const chave = (m, rota, corpo) => req(m, rota, { semUser: true, chave: true, corpo, ip: IP });
  const importar = (pid, corpo) => chave('POST', '/staff/api/academy/estudo/importar', { produtor_email: PROD, produto_id: pid, ...corpo });
  const curso = async (titulo) => {
    const r = await chave('POST', '/staff/api/academy/importar-curso', { produtor_email: PROD,
      produto: { titulo, tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Curso de teste da trava' },
      modulos: [{ titulo: 'Módulo', aulas: [{ titulo: 'Comece por aqui', tipo: 'texto', conteudo: 'Casca.' }] }] });
    assert.equal(r.st, 200, r.texto);
    return r.json.produto.id;
  };
  const ESCOPO = (slug) => ({ slug, tipo: 'edital', titulo: `Percurso ${slug}` });
  const BASE = (slug) => ({ escopo: ESCOPO(slug),
    programa: { documento: { nome: 'Edital de teste', tipo: 'edital' }, itens: [{ codigo: 'P1', texto: 'Ponto um' }, { codigo: 'P2', texto: 'Ponto dois' }] },
    competencias: [{ codigo: 'k1', resultado: 'Diante de um caso concreto, o aluno aplica a regra e justifica a resposta.' }],
    vinculos: [{ item: 'P1', competencia: 'k1', justificativa: 'O item é a própria regra.' }] });
  // o enunciado e as alternativas fazem o hash; o que muda entre os lotes é a chave, a explicação e o uso
  const Q = (n, { certa = 0, comentario = 'Comentário do TJDFT.', item = 'P1', ...extra } = {}) => ({ tipo: 'objetiva', origem: 'autoral', bloco: 'I', comentario,
    enunciado: `Trava, questão ${n}: qual é a regra aplicável ao ponto?`,
    alternativas: ['primeira', 'segunda', 'terceira'].map((x, k) => ({ texto: `${x} ${n}`, correta: k === certa, explicacao: 'Explicação.' })),
    competencias: ['k1'], itens: [{ codigo: item, justificativa: 'Cobre o ponto.' }], ...extra });
  const linha = (n) => db.prepare('SELECT * FROM est_questoes WHERE dados LIKE ?').get(`%Trava, questão ${n}:%`);
  const hash = (n) => linha(n).hash;
  const itens = (id, escopoId) => db.prepare(`SELECT codigo FROM est_questao_vinculos WHERE questao_id = ? AND escopo_id = ? AND alvo = 'item' ORDER BY codigo`).all(id, escopoId).map(x => x.codigo);
  const eA = () => R.Escopos.porSlug(pidA, SA), eB = () => R.Escopos.porSlug(pidB, SB);

  await t('trava entre cursos: a questão de um curso é a mesma linha no outro; importar com outra chave NÃO a reescreve, só soma o vínculo e devolve o hash preservado', async () => {
    pidA = await curso('Curso A da trava'); pidB = await curso('Curso B da trava');
    let r = await importar(pidA, { ...BASE(SA), questoes: [Q(1), Q(2), Q(3)] });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(r.json.importado.questoes, { novas: 3, duplicadas: 0, atualizadas: 0, sem_vinculo: 0, fora_da_correcao: 0 }, 'sem compartilhar, a resposta é a de sempre');
    const antes = linha(1);
    r = await importar(pidB, { ...BASE(SB), questoes: [Q(1, { certa: 1, comentario: 'Comentário do TRF-3.', uso: 'revisao', vigencia_situacao: 'superada', vigencia: 'Mudou a lei de teste.' }), Q(2)] });
    assert.equal(r.st, 200, r.texto);
    const q = r.json.importado.questoes;
    assert.deepEqual(q.preservadas_outro_curso, { n: 1, hashes: [antes.hash] }, 'a que diverge é contada, com o hash');
    assert.deepEqual([q.novas, q.atualizadas, q.duplicadas, q.fora_da_correcao], [0, 0, 1, 0], 'nada escrito; a superada do lote não conta, porque não foi gravada');
    const depois = linha(1);
    assert.deepEqual([depois.dados, depois.uso, depois.corrigivel, depois.versao, depois.atualizado_em, depois.situacao],
      [antes.dados, antes.uso, antes.corrigivel, antes.versao, antes.atualizado_em, antes.situacao], 'gabarito, comentário, uso e corrigível do curso A intactos');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM est_questoes WHERE hash = ?').get(antes.hash).n, 1, 'não duplica');
    assert.deepEqual(itens(antes.id, eB().id), ['P1'], 'o vínculo com o escopo que importa entra mesmo assim');
    assert.deepEqual(itens(antes.id, eA().id), ['P1'], 'o de A fica');
  });

  await t('trava entre cursos: a trava vale nos dois sentidos, e a questão de um curso só continua atualizável como sempre, inclusive entre percursos do MESMO curso', async () => {
    // agora que B também usa a 1, nem A a reescreve sem pedir
    let r = await importar(pidA, { escopo: ESCOPO(SA), questoes: [Q(1, { comentario: 'Corrigido em A.' })] });
    assert.deepEqual(r.json.importado.questoes.preservadas_outro_curso, { n: 1, hashes: [hash(1)] });
    // a 3 só está em A
    r = await importar(pidA, { escopo: ESCOPO(SA), questoes: [Q(3, { certa: 2, comentario: 'Só A usa.' })] });
    assert.deepEqual(r.json.importado.questoes, { novas: 0, duplicadas: 0, atualizadas: 1, sem_vinculo: 0, fora_da_correcao: 0 });
    assert.equal(linha(3).versao, 2);
    // outro percurso do MESMO produto não é fronteira (Analista e Oficial do TRF-3)
    r = await importar(pidA, { ...BASE(SB2), questoes: [Q(3, { certa: 2, comentario: 'Só A usa.' })] });
    assert.equal(r.st, 200, r.texto);
    r = await importar(pidA, { ...BASE(SB2), questoes: [Q(3, { certa: 1, comentario: 'Corrigida no outro percurso de A.' })] });
    assert.deepEqual(r.json.importado.questoes, { novas: 0, duplicadas: 0, atualizadas: 1, sem_vinculo: 0, fora_da_correcao: 0 });
    assert.equal(linha(3).versao, 3);
  });

  await t('trava entre cursos: reescrever_compartilhada é explícito — só true escreve, a resposta lista o que atravessou, a trilha registra, e a questão igual não conta como reescrita', async () => {
    const antes = linha(1);
    let r = await importar(pidA, { escopo: ESCOPO(SA), reescrever_compartilhada: 'true', questoes: [Q(1, { certa: 2, comentario: 'Texto com string.' })] });
    assert.equal(r.json.importado.questoes.preservadas_outro_curso.n, 1, 'string "true" não é o pedido');
    assert.equal(linha(1).versao, antes.versao);
    r = await importar(pidA, { escopo: ESCOPO(SA), reescrever_compartilhada: true, questoes: [Q(1, { certa: 2, comentario: 'Restaurada pelo payload do curso.' }), Q(2)] });
    assert.equal(r.st, 200, r.texto);
    const q = r.json.importado.questoes;
    assert.deepEqual(q.reescritas_outro_curso, { n: 1, hashes: [antes.hash] });
    assert.deepEqual([q.atualizadas, q.duplicadas, q.preservadas_outro_curso], [1, 1, undefined]);
    const depois = linha(1);
    assert.equal(depois.versao, antes.versao + 1);
    assert.equal(JSON.parse(depois.dados).comentario, 'Restaurada pelo payload do curso.');
    const reg = db.prepare(`SELECT detalhe FROM audit_logs WHERE acao = 'estudo.importar.reescrita-compartilhada' ORDER BY rowid DESC LIMIT 1`).get();
    assert.ok(reg && reg.detalhe.includes(antes.hash), 'a escrita entre cursos tem linha própria na auditoria');
    // questão só de um curso, com a flag: atualiza sem anunciar travessia
    r = await importar(pidA, { escopo: ESCOPO(SA), reescrever_compartilhada: true, questoes: [Q(4)] });
    r = await importar(pidA, { escopo: ESCOPO(SA), reescrever_compartilhada: true, questoes: [Q(4, { certa: 1 })] });
    assert.deepEqual(r.json.importado.questoes, { novas: 0, duplicadas: 0, atualizadas: 1, sem_vinculo: 0, fora_da_correcao: 0 });
  });

  await t('trava entre cursos: o lote de situação (Set-AcademyEstudoStatus) também respeita a fronteira, com ou sem questoes_compartilhadas', async () => {
    const st = () => linha(1).situacao, antes = st();
    for (const extra of [{}, { questoes_compartilhadas: true }]) {
      const r = await chave('POST', '/staff/api/academy/estudo/status', { produtor_email: PROD, produto_id: pidB, escopo: SB, questoes: 'disponivel', ...extra });
      assert.equal(r.st, 200, r.texto);
      assert.ok(r.json.alterados.questoes_puladas && r.json.alterados.questoes_puladas.tambem_em.some(o => o.escopo === SA), r.texto);
      assert.equal(st(), antes, 'a situação do curso A não muda pelo lote do curso B');
    }
  });

  await t('desvincular_questoes: tira só o vínculo do escopo que pede, sem apagar a questão nem tocar o outro curso; refazer é seguro; a contagem está na resposta', async () => {
    const q = linha(1), idB = eB().id, idA = eA().id;
    let r = await importar(pidB, { escopo: ESCOPO(SB), questoes: [Q(1, { certa: 2, comentario: 'Restaurada pelo payload do curso.', item: 'P2' })] });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(itens(q.id, idB), ['P1', 'P2']);
    const versao = linha(1).versao;
    r = await importar(pidB, { escopo: ESCOPO(SB), desvincular_questoes: [{ hash: q.hash, itens: ['P2', 'P2', 'NAO-EXISTE'] }] });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(r.json.importado.questoes_desvinculadas, { questoes: 1, removidos: 1, ausentes: [{ hash: q.hash, item: 'NAO-EXISTE' }], sem_item_no_escopo: [] });
    assert.deepEqual(itens(q.id, idB), ['P1']);
    assert.deepEqual(itens(q.id, idA), ['P1'], 'o outro escopo não muda');
    assert.equal(linha(1).versao, versao, 'a questão não muda');
    // o P1 de A tem o mesmo código: pedir em B não pode tirar o de A
    r = await importar(pidB, { escopo: ESCOPO(SB), desvincular_questoes: [{ hash: q.hash, itens: ['P1'] }] });
    assert.deepEqual(r.json.importado.questoes_desvinculadas, { questoes: 1, removidos: 1, ausentes: [], sem_item_no_escopo: [q.hash] }, 'avisa que ficou sem item no escopo');
    assert.deepEqual([itens(q.id, idB), itens(q.id, idA)], [[], ['P1']]);
    assert.ok(linha(1), 'a questão continua existindo');
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM est_questao_vinculos WHERE questao_id = ? AND escopo_id = ? AND alvo = 'competencia'`).get(q.id, idB).n, 1, 'o vínculo de competência não é item: fica');
    // refazer não é erro
    r = await importar(pidB, { escopo: ESCOPO(SB), desvincular_questoes: [{ hash: q.hash, itens: ['P1'] }] });
    assert.deepEqual(r.json.importado.questoes_desvinculadas, { questoes: 0, removidos: 0, ausentes: [{ hash: q.hash, item: 'P1' }], sem_item_no_escopo: [] });
  });

  await t('desvincular_questoes: pedido torto é 400 e a transação desfaz o envio inteiro', async () => {
    const q = linha(2), idB = eB().id, antes = itens(q.id, idB);
    assert.deepEqual(antes, ['P1']);
    for (const [corpo, msg] of [['nao-lista', /deve ser uma lista/], [[{ itens: ['P1'] }], /informe o "hash"/], [[{ hash: q.hash }], /informe "itens"/], [[{ hash: q.hash, itens: [] }], /informe "itens"/], [[{ hash: q.hash, itens: [7] }], /informe "itens"/],
      [[{ hash: q.hash, itens: ['P1'] }, { hash: 'naoexiste', itens: ['P1'] }], /não existe no banco/], [Array(2001).fill({ hash: q.hash, itens: ['P1'] }), /no máximo 2000/]]) {
      const r = await importar(pidB, { escopo: ESCOPO(SB), desvincular_questoes: corpo });
      assert.equal(r.st, 400, r.texto);
      assert.ok(msg.test(r.json.erro), r.texto);
      assert.deepEqual(itens(q.id, idB), antes, 'nada foi retirado');
    }
  });

  await t('leitura para auditoria: com_dados traz o conteúdo gravado e com_blocos o texto das aulas próprias; sem o parâmetro, a resposta é a de sempre; sem chave, 401; sem admin, 403; aula incluída fica só como referência', async () => {
    const aula = { codigo: 'aula-trava', titulo: 'Aula da trava', competencias: ['k1'], itens: ['P1'], tempo_min: 30, fontes: [{ titulo: 'Lei de teste, art. 1º', url: 'https://exemplo.test/lei' }],
      blocos: [{ tipo: 'explicacao', texto: 'Texto próprio da aula, gravado no servidor.' }, { tipo: 'pratica', titulo: 'Exercício', texto: 'Aplique a regra da aula.', solucao: 'Solução.' }] };
    let r = await importar(pidA, { escopo: ESCOPO(SA), unidades: [aula] });
    assert.equal(r.st, 200, r.texto);
    r = await importar(pidB, { escopo: ESCOPO(SB3), programa: BASE(SB3).programa, inclusoes: [{ origem_escopo_slug: SA, origem_produto_id: pidA, unidade_codigo: 'aula-trava', itens_destino: ['P1'] }] });
    assert.equal(r.st, 200, r.texto);
    const q = (pid, slug, extra = '') => `/staff/api/academy/estudo/questoes?produtor_email=${PROD}&produto_id=${pid}&escopo=${slug}${extra}`;
    const u = (pid, slug, extra = '') => `/staff/api/academy/estudo/unidades?produtor_email=${PROD}&produto_id=${pid}&escopo=${slug}${extra}`;

    r = await req('GET', q(pidA, SA, '&com_dados=1'), { semUser: true, chave: true });
    assert.equal(r.st, 200, r.texto);
    const uma = r.json.questoes.find(x => x.hash === hash(1));
    assert.equal(uma.dados.comentario, 'Restaurada pelo payload do curso.');
    assert.deepEqual(uma.dados.alternativas.map(a => a.correta), [false, false, true], 'o gabarito gravado');
    assert.deepEqual([uma.corrigivel, uma.itens, uma.competencias], [true, 'P1', 'k1']);
    r = await req('GET', q(pidA, SA), { semUser: true, chave: true });
    assert.ok(!('dados' in r.json.questoes[0]) && !('corrigivel' in r.json.questoes[0]), 'sem o parâmetro, a lista continua leve');
    r = await req('GET', q(pidA, SA, '&com_dados=0'), { semUser: true, chave: true });
    assert.ok(!('dados' in r.json.questoes[0]), 'só "1" liga');

    r = await req('GET', u(pidA, SA, '&com_blocos=1'), { semUser: true, chave: true });
    assert.equal(r.st, 200, r.texto);
    const a = r.json.unidades.find(x => x.codigo === 'aula-trava');
    assert.equal(a.blocos[0].texto, 'Texto próprio da aula, gravado no servidor.');
    assert.deepEqual(a.itens, ['P1']);
    assert.ok(Array.isArray(a.fontes) && a.fontes.length === 1);
    r = await req('GET', u(pidA, SA), { semUser: true, chave: true });
    assert.ok(!('blocos' in r.json.unidades[0]) && r.json.unidades[0].titulo === 'Aula da trava', 'sem o parâmetro, só a lista');
    r = await req('GET', u(pidB, SB3, '&com_blocos=1'), { semUser: true, chave: true });
    assert.deepEqual([r.json.unidades.length, r.json.incluidas.map(x => [x.codigo, x.origem_escopo])], [0, [['aula-trava', SA]]], 'a incluída mora em A: em B só a referência');
    assert.ok(!/aluno|evidencia|email/i.test(Object.keys(a).join(',')), 'nenhum campo de aluno');

    for (const rota of [q(pidA, SA, '&com_dados=1'), u(pidA, SA, '&com_blocos=1')]) {
      assert.equal((await req('GET', rota, { semUser: true })).st, 401, 'sem chave e sem sessão: ' + rota);
      assert.equal((await req('GET', rota, { user: 'op' })).st, 403, 'staff sem admin: ' + rota);
    }
    assert.equal((await req('GET', u(pidA, 'nao-existe'), { semUser: true, chave: true })).st, 404);
  });

  await t('arquivar_questoes: a questão que outro curso também usa não é arquivada sem reescrever_compartilhada, e a resposta lista as puladas; a de um curso só, inclusive entre percursos dele, segue arquivando', async () => {
    const h = hash(1), so = hash(3);
    const antes = linha(1).situacao;
    let r = await importar(pidB, { escopo: ESCOPO(SB), arquivar_questoes: [h, 'hash-que-nao-existe'] });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.importado.questoes_arquivadas, r.json.importado.arquivar_pulou_outro_curso, linha(1).situacao], [0, { n: 1, hashes: [h] }, antes], 'o lote do B não tira a questão do A');
    r = await importar(pidA, { escopo: ESCOPO(SA), arquivar_questoes: [h] });
    assert.deepEqual([r.json.importado.questoes_arquivadas, r.json.importado.arquivar_pulou_outro_curso.n, linha(1).situacao], [0, 1, antes], 'nem o A tira a questão do B: vale nos dois sentidos');
    r = await importar(pidA, { escopo: ESCOPO(SA), arquivar_questoes: [so] });
    assert.deepEqual([r.json.importado.questoes_arquivadas, r.json.importado.arquivar_pulou_outro_curso, linha(3).situacao], [1, undefined, 'arquivada'], 'dois percursos do MESMO curso não são fronteira');
    r = await importar(pidA, { escopo: ESCOPO(SA), arquivar_questoes: [h], reescrever_compartilhada: true });
    assert.deepEqual([r.json.importado.questoes_arquivadas, r.json.importado.arquivadas_outro_curso, linha(1).situacao], [1, { n: 1, hashes: [h] }, 'arquivada'], 'com o pedido explícito arquiva, e diz');
    const reg = db.prepare(`SELECT detalhe FROM audit_logs WHERE acao = 'estudo.importar.arquivada-compartilhada' ORDER BY rowid DESC LIMIT 1`).get();
    assert.ok(reg && reg.detalhe.includes(h), 'fica na trilha');
    // devolve as duas ao estado de antes para os testes seguintes
    r = await importar(pidA, { escopo: ESCOPO(SA), desarquivar_questoes: [h], desarquivar_situacao: antes, reescrever_compartilhada: true });
    assert.equal(r.json.importado.questoes_desarquivadas.n, 1, r.texto);
  });

  await t('trava entre cursos, o caso real das 912 autorais: A corrige com o pedido explícito e a correção aparece em B; B importa sem o pedido, preserva e liga', async () => {
    const r1 = await importar(pidA, { escopo: ESCOPO(SA), reescrever_compartilhada: true, questoes: [Q(5, { comentario: 'Autoral de A.' })] });
    assert.equal(r1.json.importado.questoes.novas, 1, r1.texto);
    const h = hash(5), id = linha(5).id;
    // B usa a autoral de A com dados idênticos: só liga, sem nada a preservar
    let r = await importar(pidB, { escopo: ESCOPO(SB), questoes: [Q(5, { comentario: 'Autoral de A.' })] });
    assert.deepEqual([r.json.importado.questoes.duplicadas, r.json.importado.questoes.preservadas_outro_curso, itens(id, eB().id)], [1, undefined, ['P1']]);
    // A corrige: sem a flag a correção não entra; com ela, entra e B lê a mesma linha
    r = await importar(pidA, { escopo: ESCOPO(SA), questoes: [Q(5, { comentario: 'Autoral de A, corrigida.' })] });
    assert.deepEqual(r.json.importado.questoes.preservadas_outro_curso, { n: 1, hashes: [h] });
    r = await importar(pidA, { escopo: ESCOPO(SA), reescrever_compartilhada: true, questoes: [Q(5, { comentario: 'Autoral de A, corrigida.' })] });
    assert.deepEqual(r.json.importado.questoes.reescritas_outro_curso, { n: 1, hashes: [h] });
    // B reimporta o arquivo antigo: preserva a correção e mantém o vínculo
    r = await importar(pidB, { escopo: ESCOPO(SB), questoes: [Q(5, { comentario: 'Autoral de A.' })] });
    assert.deepEqual([r.json.importado.questoes.preservadas_outro_curso, JSON.parse(linha(5).dados).comentario, itens(id, eB().id)], [{ n: 1, hashes: [h] }, 'Autoral de A, corrigida.', ['P1']]);
  });

  let pidC = '';
  const cobC = async () => (await req('GET', `/staff/api/academy/estudo/cobertura?produtor_email=${PROD}&produto_id=${pidC}&escopo=${SC}`, { semUser: true, chave: true })).json.cobertura;
  const resumoC = async () => (await req('GET', `/staff/api/academy/estudo/resumo?produtor_email=${PROD}&produto_id=${pidC}`, { semUser: true, chave: true })).json.resumo.find(e => e.slug === SC).cobertura;

  await t('cobertura: só questão DISPONÍVEL conta como avaliação, na rota e no resumo; rascunho e arquivada aparecem como folha sem questão', async () => {
    pidC = await curso('Curso C da trava');
    let r = await importar(pidC, { ...BASE(SC), questoes: [Q(11), Q(12, { item: 'P2' })] });
    assert.equal(r.st, 200, r.texto);
    let c = await cobC();
    assert.deepEqual([c.avaliacao.sem, c.mao_dupla.folhas_sem_questao], [['P1', 'P2'], ['P1', 'P2']], 'rascunho ainda não avalia ninguém');
    r = await chave('POST', '/staff/api/academy/estudo/status', { produtor_email: PROD, produto_id: pidC, escopo: SC, questoes: 'disponivel' });
    assert.equal(r.st, 200, r.texto);
    c = await cobC();
    assert.deepEqual([c.avaliacao.sem, c.mao_dupla.folhas_sem_questao, c.avaliacao.so_sugerida], [[], [], ['P1', 'P2']]);
    r = await importar(pidC, { escopo: ESCOPO(SC), arquivar_questoes: [hash(12)] });
    assert.equal(r.json.importado.questoes_arquivadas, 1, r.texto);
    c = await cobC();
    assert.deepEqual([c.avaliacao.sem, c.mao_dupla.folhas_sem_questao, c.por_item.find(i => i.codigo === 'P2').questoes_sugeridas], [['P2'], ['P2'], 0], 'a arquivada não cobre a folha');
    const res = await resumoC();
    assert.deepEqual([res.avaliacao_sem, res.mao_dupla.folhas_sem_questao, res.mao_dupla.ok], [['P2'], 1, false], 'o resumo diz o mesmo');
  });

  await t('desarquivar_questoes: volta por hash, em rascunho se não disser outra coisa ou na situação pedida; a cobertura acompanha; nada é apagado; hash fora do escopo não muda', async () => {
    const h = hash(12), id = linha(12).id, versao = linha(12).versao;
    let r = await importar(pidC, { escopo: ESCOPO(SC), desarquivar_questoes: [h, h, hash(11), 'hash-que-nao-existe', hash(3)] });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(r.json.importado.questoes_desarquivadas, { n: 1, situacao: 'rascunho', hashes: [h], nao_encontradas: ['hash-que-nao-existe', hash(3)], nao_arquivadas: [hash(11)], preservadas_outro_curso: [], reescritas_outro_curso: [] });
    assert.deepEqual([linha(12).situacao, linha(12).versao, linha(12).id, itens(id, R.Escopos.porSlug(pidC, SC).id)], ['rascunho', versao, id, ['P2']], 'só a situação muda: mesma linha, mesma versão, mesmos vínculos');
    assert.deepEqual((await cobC()).avaliacao.sem, ['P2'], 'em rascunho ainda não é avaliação');
    await importar(pidC, { escopo: ESCOPO(SC), arquivar_questoes: [h] });
    r = await importar(pidC, { escopo: ESCOPO(SC), desarquivar_questoes: [h], desarquivar_situacao: 'disponivel' });
    assert.deepEqual([r.json.importado.questoes_desarquivadas.n, r.json.importado.questoes_desarquivadas.situacao, linha(12).situacao], [1, 'disponivel', 'disponivel']);
    assert.deepEqual((await cobC()).avaliacao.sem, [], 'de volta, cobre a folha');
    const reg = db.prepare(`SELECT detalhe FROM audit_logs WHERE acao = 'estudo.importar.desarquivar' ORDER BY rowid DESC LIMIT 1`).get();
    assert.ok(reg && reg.detalhe.includes(h), 'fica na trilha');
    for (const [corpo, msg] of [[{ desarquivar_questoes: 'texto' }, /lista de hashes/], [{ desarquivar_questoes: [7] }, /lista de hashes/], [{ desarquivar_questoes: [h], desarquivar_situacao: 'arquivada' }, /desarquivar_situacao deve ser/], [{ desarquivar_questoes: [h], desarquivar_situacao: 'qualquer' }, /desarquivar_situacao deve ser/]]) {
      r = await importar(pidC, { escopo: ESCOPO(SC), ...corpo });
      assert.equal(r.st, 400, r.texto);
      assert.ok(msg.test(r.json.erro), r.texto);
    }
  });

  await t('desarquivar_questoes: a questão que outro curso também usa fica como está, salvo reescrever_compartilhada, e a resposta diz qual', async () => {
    const h = hash(2);
    let r = await importar(pidA, { escopo: ESCOPO(SA), arquivar_questoes: [h], reescrever_compartilhada: true });
    assert.equal(r.json.importado.questoes_arquivadas, 1, r.texto);
    r = await importar(pidB, { escopo: ESCOPO(SB), desarquivar_questoes: [h] });
    const des = r.json.importado.questoes_desarquivadas;
    assert.deepEqual([des.n, des.preservadas_outro_curso, linha(2).situacao], [0, [h], 'arquivada']);
    r = await importar(pidB, { escopo: ESCOPO(SB), desarquivar_questoes: [h], reescrever_compartilhada: true });
    const des2 = r.json.importado.questoes_desarquivadas;
    assert.deepEqual([des2.n, des2.reescritas_outro_curso, linha(2).situacao], [1, [h], 'rascunho']);
  });
}

module.exports = { rodar };
