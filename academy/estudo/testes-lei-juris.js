// =====================================================================
// Villela Academy — ESTUDE · testes da LEGISLAÇÃO E JURISPRUDÊNCIA por item
// do edital (ADR-0014; estudo/lei-juris.js, rotas em rotas-estudo.js, tela em
// app-estudo.js). Chamado pelo selftest (npm run test:academy).
//   · importação pela chave: diploma (idempotente, substitui inteiro numa
//     transação, recusa formato errado sem gravar nada), jurisprudência em
//     lotes, vínculos por disciplina (conferidos contra o acervo e o programa);
//   · API do aluno: só com matrícula e com o acervo publicado; o item mostra
//     o que está VINCULADO; situação e redação na data do edital; acervos com
//     filtros, busca e páginas; busca única;
//   · marcação de leitura: de quem marcou, nunca de outro; LGPD;
//   · a tela (conferida no fonte e, onde dá, executada num `vm`).
// =====================================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function rodar({ t, req }) {
  const { db } = require('../db');
  const repo = require('../repo');
  const R = require('./repo');
  const LJ = require('./lei-juris');
  const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

  console.log('\n— estudo/legislação e jurisprudência por item do edital (ADR-0014): importação, acervos, busca, situação, marcação de leitura, LGPD e tela —');
  const PROD = 'maria@t.com', SLUG = 'lei-juris-teste', IP = '10.14.0.';
  let pid = '', seq = 0;
  const chave = (m, rota, corpo) => req(m, rota, { semUser: true, chave: true, corpo, ip: IP + '200' });
  const staff = (caminho, corpo) => chave('POST', '/staff/api/academy/estudo/lei-juris/' + caminho, { produtor_email: PROD, produto_id: pid, escopo: SLUG, ...corpo });
  const esc = () => `/academy/api/aluno/cursos/${pid}/estudo/${SLUG}`;
  const eid = () => R.Escopos.porSlug(pid, SLUG).id;
  const uid = (email) => repo.Usuarios.porEmail(email).id;
  async function conta(nome, { matricular = true } = {}) {
    const n = ++seq, u = { nome, email: `lj-${n}@t.com`, senha: 'senha-forte-lj', aceite_termos: true }, jar = 'lj-' + n;
    assert.equal((await req('POST', '/academy/api/signup', { corpo: u, jar, ip: IP + n })).st, 200);
    if (matricular) assert.equal((await req('POST', `/academy/api/produtor/produtos/${pid}/matricular`, { jar: 'maria', corpo: { email: u.email } })).st, 200);
    return { ...u, jar, id: uid(u.email), get: (rota) => req('GET', esc() + rota, { jar, ip: IP + n }), put: (rota, corpo) => req('PUT', esc() + rota, { jar, corpo, ip: IP + n }) };
  }
  const contar = (sql, ...a) => db.prepare(sql).get(...a).n;

  // ---- o diploma de teste, no formato do contrato (BRIEF-pacote, item 1) ----
  const DIP = (extra = {}) => ({
    id: 'clt-teste', nome: 'Consolidação de Teste', norma: 'Decreto-Lei de teste', sigla: 'CLTT', tipo: 'codigo', abrangencia: 'integral',
    fonte_url: 'https://www.planalto.gov.br/teste.htm', consultado_em: '2026-10-16', data_referencia_edital: '2023-01-05',
    estrutura: [{ tipo: 'titulo', rotulo: 'TÍTULO I', nome: 'DO CONTRATO', ordem: 1 }, { tipo: 'capitulo', rotulo: 'CAPÍTULO I', nome: 'DA RESCISÃO', ordem: 2 }],
    dispositivos: [
      { id: 'art-1', rotulo: 'Art. 1º', ordem: 1, estrutura: 'TÍTULO I — DO CONTRATO', texto: 'Esta Consolidação estatui as normas que regulam o contrato de trabalho.', partes: [], situacao: 'vigente', nota: '', alterado_por: null, texto_na_data_do_edital: null },
      { id: 'art-2', rotulo: 'Art. 2º', ordem: 2, estrutura: 'TÍTULO I — DO CONTRATO > CAPÍTULO I — DA RESCISÃO', texto: 'Na rescisão do contrato de trabalho, o empregador pagará as verbas rescisórias.', situacao: 'vigente', nota: '(Redação dada pela Lei nº 13.467, de 2017)', alterado_por: null, texto_na_data_do_edital: null,
        partes: [
          { id: 'art-2.p1', caminho: '§ 1º', rotulo: '§ 1º', texto: 'O pagamento será feito em dez dias.', situacao: 'vigente', nota: '', alterado_por: null, texto_na_data_do_edital: null },
          { id: 'art-2.p2', caminho: '§ 2º', rotulo: '§ 2º', texto: 'O prazo conta da extinção, salvo acordo homologado.', situacao: 'alterado_apos_edital', nota: '(Redação dada pela Emenda Constitucional nº 141, de 2026)', alterado_por: { norma: 'Emenda Constitucional nº 141', data: '2026-10-16' }, texto_na_data_do_edital: 'O prazo conta da extinção do contrato.' },
          { id: 'art-2.p2.a', caminho: '§ 2º > a)', rotulo: 'a)', texto: '', situacao: 'revogado', nota: '(Revogado pela Lei nº 1, de 2000)', alterado_por: null, texto_na_data_do_edital: null },
        ] },
      { id: 'art-3', rotulo: 'Art. 3º', ordem: 3, estrutura: 'TÍTULO I — DO CONTRATO > CAPÍTULO I — DA RESCISÃO', texto: '', partes: [], situacao: 'revogado', nota: '(Revogado pela Lei nº 2, de 2001)', alterado_por: null, texto_na_data_do_edital: null },
      { id: 'art-4a', rotulo: 'Art. 4º-A', ordem: 4, estrutura: 'TÍTULO I — DO CONTRATO > CAPÍTULO I — DA RESCISÃO', texto: 'A quitação anual é facultativa.', partes: [], situacao: 'incluido_apos_edital', nota: '(Incluído pela Lei nº 15.000, de 2025)', alterado_por: { norma: 'Lei nº 15.000', data: '2025-03-01' }, texto_na_data_do_edital: null },
    ],
    ...extra,
  });
  const COLECOES = [{ id: 'tst-sumulas', nome: 'Súmulas do TST', tribunal: 'TST', fonte_url: 'https://jurisprudencia.tst.jus.br/', consultado_em: '2026-10-16' },
    { id: 'stf-sv', nome: 'Súmulas Vinculantes do STF', tribunal: 'STF', fonte_url: 'https://portal.stf.jus.br/', consultado_em: '2026-10-16' }];
  const VB = (n, extra = {}) => ({ id: `tst-sum-${n}`, colecao: 'tst-sumulas', tipo: 'sumula', tribunal: 'TST', numero: String(n), titulo: `TÍTULO DA SÚMULA ${n}`,
    texto: `Texto oficial da súmula ${n} sobre a jornada de trabalho.`, situacao: 'vigente', situacao_na_data_do_edital: 'vigente', fonte_url: 'https://jurisprudencia.tst.jus.br/?s=' + n, consultado_em: '2026-10-16', ...extra });

  await t('lei-juris: o percurso do teste — programa com duas disciplinas, três aulas publicadas', async () => {
    let r = await chave('POST', '/staff/api/academy/importar-curso', { produtor_email: PROD,
      produto: { titulo: 'Curso de Lei e Jurisprudência', tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Lei seca e verbetes por item' },
      modulos: [{ titulo: 'Módulo A', aulas: [{ titulo: 'Aula A1', tipo: 'texto', conteudo: 'Aula.' }] }] });
    assert.equal(r.st, 200, r.texto);
    pid = r.json.produto.id;
    const UN = (cod, item) => ({ codigo: cod, titulo: `Aula ${cod}`, competencias: ['c-' + item.split('.').join('')], itens: [item], tempo_min: 30,
      blocos: [{ tipo: 'explicacao', texto: `Explicação da ${cod}.` }, { tipo: 'pratica', titulo: 'Exercício', texto: `Exercício da ${cod}.`, solucao: 'Solução.' }] });
    r = await chave('POST', '/staff/api/academy/estudo/importar', { produtor_email: PROD, produto_id: pid,
      escopo: { slug: SLUG, tipo: 'edital', titulo: 'Percurso da lei seca' },
      programa: { documento: { nome: 'Edital de teste', tipo: 'edital' }, itens: [{ codigo: '1', texto: 'Programa' }, { codigo: '1.1', texto: 'Direito do Trabalho' },
        { codigo: '1.1.1', texto: 'Rescisão do contrato' }, { codigo: '1.1.2', texto: 'Jornada' }, { codigo: '1.2', texto: 'Direito Constitucional' }, { codigo: '1.2.1', texto: 'Direitos sociais' }] },
      competencias: ['1.1.1', '1.1.2', '1.2.1'].map(i => ({ codigo: 'c-' + i.split('.').join(''), resultado: `Diante de um caso concreto do ponto ${i}, o aluno identifica a regra, aplica a norma e justifica com a fonte.` })),
      vinculos: ['1.1.1', '1.1.2', '1.2.1'].map(i => ({ item: i, competencia: 'c-' + i.split('.').join(''), justificativa: 'O item é a própria regra.' })),
      unidades: [UN('aula-a', '1.1.1'), UN('aula-b', '1.1.2'), UN('aula-c', '1.2.1')] });
    assert.equal(r.st, 200, r.texto);
    r = await chave('POST', '/staff/api/academy/estudo/status', { produtor_email: PROD, produto_id: pid, escopo: SLUG, status: 'publicado', unidades: 'publicado' });
    assert.equal(r.st, 200, r.texto);
  });

  // ================= IMPORTAÇÃO DO DIPLOMA =================
  await t('lei-juris: importar o diploma — relatório (dispositivos, partes, alterados depois do edital, situação) e o percurso passa a usá-lo; sem a chave, 401', async () => {
    assert.equal((await req('POST', '/staff/api/academy/estudo/lei-juris/diploma', { semUser: true, corpo: { produtor_email: PROD, produto_id: pid, escopo: SLUG, diploma: DIP() } })).st, 401);
    const r = await staff('diploma', { diploma: DIP() });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.diploma, r.json.dispositivos, r.json.partes, r.json.alterados_apos_edital, r.json.inalterado, r.json.substituiu, r.json.ligado_agora], ['clt-teste', 4, 3, 2, false, false, true]);
    assert.equal(r.json.por_situacao.revogado, 1);
    assert.equal(r.json.por_situacao['parte:alterado_apos_edital'], 1);
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_dispositivos WHERE diploma_id = ?', 'clt-teste'), 4);
    assert.ok(contar('SELECT COUNT(*) n FROM est_lj_escopo_diplomas WHERE escopo_id = ? AND diploma_id = ?', eid(), 'clt-teste') === 1);
    assert.equal(LJ.temFTS(), true, 'o node:sqlite do projeto tem FTS5 (sem ele, a busca cai para LIKE)');
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_fts_lei'), 4);
    // o acervo nasce em RASCUNHO
    assert.equal(db.prepare('SELECT status FROM est_lj_estado WHERE escopo_id = ?').get(eid()).status, 'rascunho');
  });

  await t('lei-juris: reenviar o MESMO diploma não regrava nada (idempotente); conteúdo novo SUBSTITUI o diploma inteiro — o que saiu some, o índice acompanha', async () => {
    const antes = db.prepare('SELECT importado_em, hash FROM est_lj_diplomas WHERE id = ?').get('clt-teste');
    let r = await staff('diploma', { diploma: DIP() });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.inalterado, r.json.ligado_agora], [true, false]);
    assert.deepEqual(db.prepare('SELECT importado_em, hash FROM est_lj_diplomas WHERE id = ?').get('clt-teste'), antes, 'nada foi regravado');
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_fts_lei'), 4, 'o índice não duplicou');
    // versão nova: o art. 1º muda de texto e o art. 3º sai
    const nova = DIP(); nova.dispositivos = nova.dispositivos.filter(x => x.id !== 'art-3');
    nova.dispositivos[0] = { ...nova.dispositivos[0], texto: 'Esta Consolidação estatui as normas sobre o teletrabalho.' };
    r = await staff('diploma', { diploma: nova });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.substituiu, r.json.dispositivos], [true, 3]);
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_dispositivos WHERE diploma_id = ?', 'clt-teste'), 3);
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_fts_lei'), 3, 'o índice saiu junto com o dispositivo');
    assert.equal(contar("SELECT COUNT(*) n FROM est_lj_fts_lei WHERE est_lj_fts_lei MATCH 'teletrabalho'"), 1);
    assert.equal(contar("SELECT COUNT(*) n FROM est_lj_fts_lei WHERE est_lj_fts_lei MATCH 'regulam'"), 0, 'o texto antigo não é mais achado');
    // volta à versão do contrato (os testes seguintes contam com o art. 3º)
    assert.equal((await staff('diploma', { diploma: DIP() })).st, 200);
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_dispositivos WHERE diploma_id = ?', 'clt-teste'), 4);
  });

  await t('lei-juris: formato errado é RECUSADO com a lista dos erros e nada é gravado — situação fora do vocabulário, tipo, id repetido, parte que não é do dispositivo, sem fonte; escopo que não existe dá 404', async () => {
    const hash = db.prepare('SELECT hash FROM est_lj_diplomas WHERE id = ?').get('clt-teste').hash;
    const ruim = DIP({ tipo: 'livro', fonte_url: '' });
    ruim.dispositivos[0] = { ...ruim.dispositivos[0], situacao: 'em_vigor', texto: 'Texto que não pode entrar.' };
    ruim.dispositivos.push({ ...ruim.dispositivos[1], ordem: 9 }); // art-2 repetido
    ruim.dispositivos[1] = { ...ruim.dispositivos[1], partes: [{ id: 'art-9.p1', rotulo: '§ 1º', texto: 'x', situacao: 'vigente' }] };
    const r = await staff('diploma', { diploma: ruim });
    assert.equal(r.st, 400, r.texto);
    const erros = r.json.erros.join(' | ');
    for (const k of ['situacao "em_vigor"', 'tipo "livro"', '"art-2" repetido', 'deve começar por "art-2."', 'fonte_url']) assert.ok(erros.includes(k), 'faltou o erro: ' + k + ' — veio: ' + erros);
    assert.ok(/Nada foi gravado/.test(r.json.erro));
    assert.equal(db.prepare('SELECT hash FROM est_lj_diplomas WHERE id = ?').get('clt-teste').hash, hash, 'o diploma guardado continua o mesmo');
    assert.equal(contar("SELECT COUNT(*) n FROM est_lj_dispositivos WHERE texto LIKE '%não pode entrar%'"), 0);
    assert.equal((await staff('diploma', { diploma: { ...DIP(), dispositivos: [] } })).st, 400, 'diploma sem dispositivos');
    assert.equal((await staff('diploma', { escopo: 'nao-existe', diploma: DIP() })).st, 404);
    // a data da norma que alterou pode vir só com o ano (a nota do Planalto às vezes só diz "Lei nº X, de 1966")
    const soAno = LJ.validarDiploma({ ...DIP(), dispositivos: [{ ...DIP().dispositivos[0], situacao: 'alterado_apos_edital', alterado_por: { norma: 'Lei nº 1', data: '2024' } }] });
    assert.equal(soAno.d.dispositivos[0].alterado_por.data, '2024');
    assert.throws(() => LJ.validarDiploma({ ...DIP(), dispositivos: [{ ...DIP().dispositivos[0], alterado_por: { norma: 'Lei', data: '16/10/2026' } }] }), /Diploma recusado/);
  });

  await t('lei-juris: a substituição é UMA transação — falha no meio da gravação desfaz tudo e o diploma anterior fica inteiro (dispositivos e índice)', async () => {
    const hash = db.prepare('SELECT hash FROM est_lj_diplomas WHERE id = ?').get('clt-teste').hash;
    db.exec("CREATE TEMP TRIGGER lj_bomba BEFORE INSERT ON est_lj_dispositivos WHEN NEW.id = 'art-bomba' BEGIN SELECT RAISE(ABORT, 'bomba de teste'); END;");
    try {
      const nova = DIP(); nova.dispositivos.push({ id: 'art-bomba', rotulo: 'Art. 99', ordem: 99, texto: 'Nunca entra.', partes: [], situacao: 'vigente' });
      const r = await staff('diploma', { diploma: nova });
      assert.equal(r.st, 400, r.texto);
      assert.ok(/bomba de teste/.test(r.json.erro));
    } finally { db.exec('DROP TRIGGER IF EXISTS lj_bomba'); }
    assert.equal(db.prepare('SELECT hash FROM est_lj_diplomas WHERE id = ?').get('clt-teste').hash, hash);
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_dispositivos WHERE diploma_id = ?', 'clt-teste'), 4, 'os dispositivos de antes continuam');
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_fts_lei'), 4, 'o índice de antes continua');
  });

  // ================= JURISPRUDÊNCIA EM LOTES =================
  await t('lei-juris: jurisprudência em lotes — coleções e itens, idempotente pelo id; lote acima de 500, situação fora do vocabulário e coleção desconhecida são recusados sem gravar', async () => {
    const itens = [1, 2, 3].map(n => VB(n)).concat([VB(4, { situacao: 'cancelado', situacao_detalhe: 'Cancelada pela Res. 1/2024, DEJT 10/05/2024', situacao_na_data_do_edital: 'vigente', texto: 'Súmula sobre a rescisão do contrato, hoje cancelada.' })],
      [{ id: 'stf-sv-13', colecao: 'stf-sv', tipo: 'sumula_vinculante', tribunal: 'STF', numero: '13', texto: 'A nomeação de cônjuge viola a Constituição.', situacao: 'vigente', fonte_url: 'https://portal.stf.jus.br/13', consultado_em: '2026-10-16' }]);
    let r = await staff('jurisprudencia', { colecoes: COLECOES, itens });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.recebidos, r.json.novos, r.json.atualizados, r.json.inalterados, r.json.ligados_agora], [5, 5, 0, 0, 5]);
    r = await staff('jurisprudencia', { colecoes: COLECOES, itens });
    assert.deepEqual([r.json.novos, r.json.atualizados, r.json.inalterados, r.json.ligados_agora], [0, 0, 5, 0], 'reenviar o mesmo lote não muda nada');
    r = await staff('jurisprudencia', { itens: [VB(1, { texto: 'Texto oficial da súmula 1 sobre o intervalo intrajornada.' })] });
    assert.deepEqual([r.json.atualizados, r.json.novos], [1, 0]);
    assert.equal(contar("SELECT COUNT(*) n FROM est_lj_fts_juris WHERE est_lj_fts_juris MATCH 'intrajornada'"), 1, 'o índice acompanha a atualização');
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_fts_juris'), 5, 'atualizar não duplica o índice');
    // recusas
    const total = contar('SELECT COUNT(*) n FROM est_lj_verbetes');
    assert.equal((await staff('jurisprudencia', { itens: Array.from({ length: 501 }, (_, i) => VB(1000 + i)) })).st, 400, 'lote acima de 500');
    r = await staff('jurisprudencia', { itens: [VB(50), VB(51, { situacao: 'valendo' })] });
    assert.equal(r.st, 400); assert.ok(r.json.erros.join(' ').includes('situacao "valendo"'));
    r = await staff('jurisprudencia', { itens: [VB(52, { colecao: 'trt99-nada' })] });
    assert.equal(r.st, 400); assert.ok(r.json.erros.join(' ').includes('trt99-nada'));
    assert.equal((await staff('jurisprudencia', { itens: [VB(53), VB(53)] })).st, 400, 'id repetido no lote');
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_verbetes'), total, 'nenhum item dos lotes recusados entrou');
    // 31 súmulas a mais, para a paginação do acervo (30 por página)
    r = await staff('jurisprudencia', { itens: Array.from({ length: 31 }, (_, i) => VB(100 + i)) });
    assert.equal(r.json.novos, 31);
  });

  // ================= VÍNCULOS POR DISCIPLINA =================
  await t('lei-juris: vínculos por disciplina — cada referência conferida (item do programa e da disciplina, dispositivo e parte que existem, verbete do percurso, confiança alta|conferida); faltante recusa ou fica de fora com ignorar_faltantes', async () => {
    const ITENS = [
      { codigo: '1.1.1', legislacao: [{ diploma: 'clt-teste', dispositivo: 'art-2', parte: 'art-2.p2', origem: 'aula', confianca: 'alta' }, { diploma: 'clt-teste', dispositivo: 'art-1', origem: 'edital', confianca: 'conferida' }],
        jurisprudencia: [{ id: 'tst-sum-4', origem: 'leitura', confianca: 'conferida', motivo: 'trata da rescisão' }, { id: 'stf-sv-13', origem: 'aula', confianca: 'alta' }] },
      { codigo: '1.1.2', legislacao: [{ diploma: 'clt-teste', dispositivo: 'art-4a', origem: 'questao', confianca: 'alta' }], jurisprudencia: [{ id: 'tst-sum-1', origem: 'aula', confianca: 'alta' }] },
    ];
    let r = await staff('vinculos', { disciplina: '1.1', itens: ITENS });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.itens, r.json.legislacao, r.json.jurisprudencia, r.json.ignorados], [2, 3, 3, 0]);
    // reenviar substitui (não soma)
    r = await staff('vinculos', { disciplina: '1.1', itens: ITENS });
    assert.deepEqual([r.json.substituidos, r.json.legislacao + r.json.jurisprudencia], [6, 6]);
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_vinculos WHERE escopo_id = ?', eid()), 6);
    // recusas de formato
    r = await staff('vinculos', { disciplina: '1.1', itens: [{ codigo: '1.2.1', legislacao: [] }] });
    assert.equal(r.st, 400); assert.ok(r.json.erros.join(' ').includes('não é da disciplina 1.1'));
    r = await staff('vinculos', { disciplina: '1.1', itens: [{ codigo: '1.1.1', legislacao: [{ diploma: 'clt-teste', dispositivo: 'art-1', origem: 'aula', confianca: 'inferida' }] }] });
    assert.equal(r.st, 400); assert.ok(r.json.erros.join(' ').includes('inferida sem conferência não entra'));
    r = await staff('vinculos', { disciplina: '9.9', itens: [{ codigo: '9.9.1' }] });
    assert.equal(r.st, 400);
    // referência que não existe no acervo: recusa e não grava
    const faltante = [{ codigo: '1.1.1', legislacao: [{ diploma: 'clt-teste', dispositivo: 'art-77', origem: 'aula', confianca: 'alta' }, { diploma: 'clt-teste', dispositivo: 'art-1', origem: 'aula', confianca: 'alta' }] }];
    r = await staff('vinculos', { disciplina: '1.1', itens: faltante });
    assert.equal(r.st, 400); assert.ok(r.json.faltantes.join(' ').includes('art-77'));
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_vinculos WHERE escopo_id = ?', eid()), 6, 'nada mudou');
    // …ou, pedido expressamente, entra o resto e o faltante vai no relatório
    r = await staff('vinculos', { disciplina: '1.2', itens: [{ codigo: '1.2.1', legislacao: [{ diploma: 'clt-teste', dispositivo: 'art-2', parte: 'art-2.p9', origem: 'aula', confianca: 'alta' }] }], ignorar_faltantes: true });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.ignorados, r.json.legislacao], [1, 0]);
    assert.deepEqual(r.json.itens_sem_vinculo, ['1.2.1'], 'o item sem nada vinculado vai para leitura humana');
    // o resumo do staff
    const rs = await chave('GET', `/staff/api/academy/estudo/lei-juris/resumo?produtor_email=${encodeURIComponent(PROD)}&produto_id=${pid}&escopo=${SLUG}`);
    assert.equal(rs.st, 200, rs.texto);
    assert.deepEqual([rs.json.status, rs.json.diplomas[0].cobrados, rs.json.vinculos.lei.vinculos, rs.json.vinculos_orfaos], ['rascunho', 3, 3, 0]);
    assert.deepEqual(rs.json.itens_sem_vinculo, ['1.2.1']);
  });

  // ================= ACESSO =================
  let ana, bia, caio;
  await t('lei-juris: acesso — em RASCUNHO só o produtor vê (o aluno recebe 404 e o painel sem as abas); publicado, o aluno com matrícula vê; sem matrícula, 403', async () => {
    ana = await conta('Ana da Lei Seca'); bia = await conta('Bia dos Verbetes'); caio = await conta('Caio sem Curso', { matricular: false });
    assert.equal((await ana.get('/legislacao')).st, 404);
    assert.equal((await ana.get('/legislacao/vinculada?unidade=aula-a')).st, 404);
    let p = await ana.get('/painel');
    assert.equal(p.st, 200, p.texto); assert.equal(p.json.lei_juris, null, 'sem acervo publicado, a tela não desenha as abas');
    const prod = await req('GET', esc() + '/legislacao', { jar: 'maria' });
    assert.equal(prod.st, 200, 'o produtor revisa o rascunho');
    assert.equal((await staff('status', { status: 'publicado' })).st, 200);
    assert.equal((await staff('status', { status: 'aberto' })).st, 400);
    p = await ana.get('/painel');
    assert.deepEqual(p.json.lei_juris, { legislacao: 1, jurisprudencia: 36, status: 'publicado' });
    assert.equal((await ana.get('/legislacao')).st, 200);
    assert.equal((await caio.get('/legislacao')).st, 403);
    assert.equal((await caio.get('/jurisprudencia')).st, 403);
    assert.equal((await req('GET', esc() + '/legislacao')).st, 401, 'sem sessão');
  });

  // ================= O QUE O ITEM MOSTRA =================
  await t('lei-juris: a LEGISLAÇÃO da aula é só o que está vinculado — por diploma, na ordem do diploma, com a parte citada marcada, a situação e a redação na data do edital', async () => {
    const r = await ana.get('/legislacao/vinculada?unidade=aula-a');
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(r.json.itens, [{ codigo: '1.1.1', texto: 'Rescisão do contrato' }]);
    assert.equal(r.json.diplomas.length, 1);
    const d = r.json.diplomas[0];
    assert.deepEqual([d.id, d.data_referencia_edital, d.fonte_url, d.consultado_em], ['clt-teste', '2023-01-05', 'https://www.planalto.gov.br/teste.htm', '2026-10-16']);
    assert.deepEqual(d.dispositivos.map(x => x.id), ['art-1', 'art-2'], 'só os vinculados (o 3º e o 4º-A não), na ordem do diploma');
    const a2 = d.dispositivos[1];
    assert.deepEqual([a2.citado_inteiro, a2.citadas], [false, ['art-2.p2']]);
    const p2 = a2.partes.find(p => p.id === 'art-2.p2');
    assert.deepEqual([p2.situacao, p2.alterado_por, p2.texto_na_data_do_edital], ['alterado_apos_edital', { norma: 'Emenda Constitucional nº 141', data: '2026-10-16' }, 'O prazo conta da extinção do contrato.']);
    assert.equal(a2.partes.find(p => p.id === 'art-2.p2.a').situacao, 'revogado');
    assert.equal(d.dispositivos[0].citado_inteiro, true);
    // a aula de outro item não herda; o ITEM-pai traz o dos filhos
    assert.deepEqual((await ana.get('/legislacao/vinculada?unidade=aula-b')).json.diplomas[0].dispositivos.map(x => [x.id, x.situacao]), [['art-4a', 'incluido_apos_edital']]);
    assert.equal((await ana.get('/legislacao/vinculada?unidade=aula-c')).json.diplomas.length, 0);
    assert.deepEqual((await ana.get('/legislacao/vinculada?item=1.1')).json.diplomas[0].dispositivos.map(x => x.id), ['art-1', 'art-2', 'art-4a']);
    assert.equal((await ana.get('/legislacao/vinculada?unidade=aula-nada')).st, 404);
    assert.equal((await ana.get('/legislacao/vinculada?item=7.7')).st, 404);
  });

  await t('lei-juris: a JURISPRUDÊNCIA da aula — por tribunal (TST antes do STF) e tipo, com a situação, a situação na data do edital, o detalhe com a data e o motivo do vínculo', async () => {
    const r = await ana.get('/jurisprudencia/vinculada?unidade=aula-a');
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(r.json.tribunais.map(x => x.tribunal), ['TST', 'STF']);
    const v4 = r.json.tribunais[0].tipos[0].verbetes[0];
    assert.deepEqual([v4.id, v4.situacao, v4.situacao_na_data_do_edital, v4.situacao_detalhe, v4.motivos], ['tst-sum-4', 'cancelado', 'vigente', 'Cancelada pela Res. 1/2024, DEJT 10/05/2024', ['trata da rescisão']]);
    assert.equal(r.json.tribunais[1].tipos[0].tipo, 'sumula_vinculante');
    assert.deepEqual((await ana.get('/jurisprudencia/vinculada?unidade=aula-b')).json.tribunais[0].tipos[0].verbetes.map(v => v.id), ['tst-sum-1']);
  });

  // ================= ACERVOS =================
  await t('lei-juris: acervo de legislação — a lista (busca pelo nome, com acento ou sem) e o diploma inteiro com o que o edital cobra marcado e as aulas que o usam', async () => {
    let r = await ana.get('/legislacao');
    assert.deepEqual([r.json.total, r.json.diplomas[0].id, r.json.diplomas[0].cobrados, r.json.diplomas[0].alterados_apos_edital], [1, 'clt-teste', 3, 2]);
    assert.equal((await ana.get('/legislacao?q=consolidacao')).json.diplomas.length, 1);
    assert.equal((await ana.get('/legislacao?q=codigo%20penal')).json.diplomas.length, 0);
    r = await ana.get('/legislacao/clt-teste');
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(r.json.dispositivos.map(x => x.id), ['art-1', 'art-2', 'art-3', 'art-4a'], 'o diploma inteiro, na ordem');
    assert.deepEqual(r.json.dispositivos.map(x => !!x.cobrado), [true, true, false, true]);
    assert.deepEqual([r.json.dispositivos[1].itens, r.json.dispositivos[1].aulas, r.json.dispositivos[1].citadas], [['1.1.1'], ['aula-a'], ['art-2.p2']]);
    assert.deepEqual(r.json.aulas, { 'aula-a': 'Aula aula-a', 'aula-b': 'Aula aula-b' });
    assert.equal(r.json.dispositivos[2].situacao, 'revogado');
    assert.equal(r.json.dispositivos[2].texto, '', 'texto riscado de dispositivo revogado não entra');
    assert.deepEqual(r.json.diploma.estrutura.map(x => x.rotulo), ['TÍTULO I', 'CAPÍTULO I']);
    assert.equal((await ana.get('/legislacao/cp-nao-existe')).st, 404);
  });

  await t('lei-juris: acervo de jurisprudência — filtros (tribunal, coleção, situação, disciplina, texto), páginas de 30 e as opções com quantos há em cada', async () => {
    let r = await ana.get('/jurisprudencia');
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.total, r.json.paginas, r.json.itens.length, r.json.por_pagina], [36, 2, 30, 30]);
    assert.deepEqual(r.json.itens.slice(0, 3).map(v => v.id), ['tst-sum-1', 'tst-sum-2', 'tst-sum-3'], 'TST primeiro, pela ordem do número');
    assert.equal(r.json.itens[0].aulas[0], 'aula-b');
    const p2 = await ana.get('/jurisprudencia?pagina=2');
    assert.deepEqual([p2.json.pagina, p2.json.itens.length, p2.json.itens[p2.json.itens.length - 1].id], [2, 6, 'stf-sv-13']);
    assert.equal((await ana.get('/jurisprudencia?pagina=99')).json.pagina, 2, 'página além do fim cai na última');
    assert.deepEqual(r.json.facetas.tribunais, [{ valor: 'TST', n: 35 }, { valor: 'STF', n: 1 }]);
    assert.deepEqual(r.json.facetas.disciplinas, [{ valor: '1.1', nome: 'Direito do Trabalho', n: 3 }]);
    assert.deepEqual((await ana.get('/jurisprudencia?tribunal=STF')).json.itens.map(v => v.id), ['stf-sv-13']);
    assert.deepEqual((await ana.get('/jurisprudencia?situacao=cancelado')).json.itens.map(v => v.id), ['tst-sum-4']);
    assert.deepEqual((await ana.get('/jurisprudencia?colecao=stf-sv')).json.total, 1);
    assert.deepEqual((await ana.get('/jurisprudencia?disciplina=1.1')).json.itens.map(v => v.id).sort(), ['stf-sv-13', 'tst-sum-1', 'tst-sum-4']);
    assert.deepEqual((await ana.get('/jurisprudencia?q=rescisao')).json.itens.map(v => v.id), ['tst-sum-4'], 'busca sem acento acha "rescisão"');
    assert.deepEqual((await ana.get('/jurisprudencia?q=jornada&tribunal=TST&pagina=2')).json.pagina, 2);
    assert.equal((await ana.get('/jurisprudencia?disciplina=1.1%27--')).st, 400);
    const v = await ana.get('/jurisprudencia/verbete/tst-sum-4');
    assert.deepEqual([v.st, v.json.verbete.itens, v.json.verbete.aulas], [200, ['1.1.1'], ['aula-a']]);
    assert.equal((await ana.get('/jurisprudencia/verbete/tst-sum-9999')).st, 404);
  });

  await t('lei-juris: BUSCA ÚNICA nos dois acervos — com acento ou sem, o trecho achado marcado; duas letras no mínimo; páginas', async () => {
    const r = await ana.get('/lei-juris/busca?q=rescisao');
    assert.equal(r.st, 200, r.texto);
    assert.ok(r.json.lei.some(x => x.diploma_id === 'clt-teste' && x.id === 'art-2'), 'achou o art. 2º');
    // o verbete que tem a palavra vem primeiro; o que o item "Rescisão do contrato" cobra entra depois, com o porquê (AL-08)
    assert.deepEqual(r.json.juris.map(x => [x.id, x.pelo_item || []]), [['tst-sum-4', ['1.1.1']], ['stf-sv-13', ['1.1.1']]]);
    assert.ok(r.json.lei[0].trecho.includes(LJ.MARCA_INI) && r.json.lei[0].trecho.includes(LJ.MARCA_FIM), 'o trecho vem marcado');
    assert.equal((await ana.get('/lei-juris/busca?q=a')).st, 400);
    const j1 = await ana.get('/lei-juris/busca?q=jornada&onde=juris');
    assert.deepEqual([j1.json.lei.length, j1.json.total_juris > 20, j1.json.juris.length], [0, true, 20]);
    assert.equal((await ana.get('/lei-juris/busca?q=jornada&onde=juris&pagina=2')).json.juris.length, j1.json.total_juris - 20);
    // aspas e operadores do FTS no texto do aluno não quebram a consulta
    assert.equal((await ana.get('/lei-juris/busca?q=' + encodeURIComponent('"rescisão" OR NEAR(*'))).st, 200);
    assert.equal(LJ.consultaFTS('aviso "prévio" -proporcional'), '"aviso"* "prévio"* "proporcional"*');
  });

  // ================= AUDITORIA AL (17/10/2026): ADCT, ordem da busca, data do edital no verbete =================
  // um segundo código (texto curto, que o bm25 cru punha na frente) e uma Constituição com o ADCT
  const CCT = { id: 'cc-teste', nome: 'Código de Teste', norma: 'Lei de teste', sigla: 'CCT', tipo: 'codigo', abrangencia: 'integral', fonte_url: 'https://www.planalto.gov.br/cc.htm', consultado_em: '2026-10-16',
    estrutura: [], dispositivos: [
      { id: 'art-2', rotulo: 'Art. 2º', ordem: 1, estrutura: '', texto: 'Art. 2 curto.', partes: [], situacao: 'vigente' },
      { id: 'art-5', rotulo: 'Art. 5º', ordem: 2, estrutura: '', texto: 'A rescisão do contrato.', partes: [], situacao: 'vigente' }] };
  const ADCT = 'ATO DAS DISPOSIÇÕES CONSTITUCIONAIS TRANSITÓRIAS';
  const CFT = { id: 'cf-teste', nome: 'Constituição de Teste', norma: 'Constituição', sigla: 'CFT', tipo: 'constituicao', abrangencia: 'integral', fonte_url: 'https://www.planalto.gov.br/cf.htm', consultado_em: '2026-10-16',
    estrutura: [{ tipo: 'titulo', rotulo: 'TÍTULO II', nome: 'DOS DIREITOS', ordem: 1 }, { tipo: 'parte', rotulo: ADCT, nome: ADCT, ordem: 2 }], dispositivos: [
      { id: 'art-7', rotulo: 'Art. 7º', ordem: 1, estrutura: 'TÍTULO II — DOS DIREITOS', texto: 'São direitos dos trabalhadores:', situacao: 'vigente',
        partes: [{ id: 'art-7.inc29', rotulo: 'XXIX', caminho: 'XXIX', texto: 'ação, quanto aos créditos resultantes das relações de trabalho, com prazo prescricional de cinco anos;', situacao: 'vigente' }] },
      { id: 'art-10', rotulo: 'Art. 10', ordem: 2, estrutura: 'TÍTULO II — DOS DIREITOS', texto: 'É assegurada a participação dos trabalhadores nos colegiados.', partes: [], situacao: 'vigente' },
      { id: 'adct-art-10', rotulo: 'Art. 10', ordem: 3, estrutura: ADCT + ' — ' + ADCT, texto: 'Até que seja promulgada a lei complementar, fica vedada a dispensa arbitrária da empregada gestante.', partes: [], situacao: 'vigente' }] };
  await t('lei-juris · AL-05: o artigo do ADCT é "ADCT, art. 10" — na aba da aula, no acervo (com o ADCT como parte própria na navegação) e na busca; o item que cita o diploma sem artigo (AL-14)', async () => {
    for (const d of [CCT, CFT]) assert.equal((await staff('diploma', { diploma: d })).st, 200);
    const r = await staff('vinculos', { disciplina: '1.2', itens: [{ codigo: '1.2.1', legislacao: [{ diploma: 'cf-teste', dispositivo: 'adct-art-10', origem: 'aula', confianca: 'alta' }, { diploma: 'cf-teste', dispositivo: 'art-10', origem: 'aula', confianca: 'alta' }],
      diplomas_citados_no_edital: ['clt-teste', 'diploma-que-nao-existe'] }] });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.diplomas_citados, r.json.diplomas_citados_fora_do_acervo], [1, ['1.2.1: diploma-que-nao-existe']]);
    const a = await ana.get('/legislacao/vinculada?unidade=aula-c');
    const ds = a.json.diplomas[0].dispositivos;
    assert.deepEqual(ds.map(x => [x.id, x.rotulo]), [['art-10', 'Art. 10'], ['adct-art-10', 'ADCT, art. 10']], 'o do ADCT não se confunde com o do corpo permanente');
    assert.equal(ds[1].parte_do_diploma, 'ADCT');
    assert.equal(ds[1].estrutura, ADCT, 'rótulo e nome iguais viram um nível só');
    assert.deepEqual(a.json.citados_no_edital.map(x => [x.id, x.itens, x.na_aba]), [['clt-teste', ['1.2.1'], false]], 'o item cobra também a CLTT (sem artigo)');
    const inteiro = await ana.get('/legislacao/cf-teste');
    assert.equal(inteiro.json.dispositivos.find(x => x.id === 'adct-art-10').rotulo, 'ADCT, art. 10');
    assert.ok(inteiro.json.dispositivos.filter(x => x.estrutura === ADCT).length === 1, 'o ADCT é uma seção própria do "Ir para…"');
    assert.equal(LJ.rotuloCompleto('anexo-i-art-15', 'Artigo 15'), 'Anexo I, artigo 15');
    const b = await ana.get('/lei-juris/busca?q=' + encodeURIComponent('art. 10 do ADCT') + '&onde=lei');
    assert.deepEqual([b.json.lei[0].diploma_id, b.json.lei[0].id, b.json.lei[0].rotulo, b.json.lei[0].exato], ['cf-teste', 'adct-art-10', 'ADCT, art. 10', true]);
    const c2 = await ana.get('/lei-juris/busca?q=' + encodeURIComponent('ADCT, art. 10') + '&onde=lei');
    assert.equal(c2.json.lei[0].id, 'adct-art-10');
  });

  await t('lei-juris · AL-08: a busca reconhece a consulta por NÚMERO ("art. 477", "artigo 477 da CLT", "art 7 XXIX CF", "Súmula 331", "OJ 394", "Tema 1046", "SV 4") e põe o exato no topo', async () => {
    const P = LJ.consultaPorNumero;
    assert.deepEqual(P('art. 477'), { tipo: 'lei', numero: 477, sufixo: '', adct: false, parte: {}, dicas: [] });
    assert.deepEqual(P('artigo 477 da CLT').dicas, ['clt']);
    assert.deepEqual([P('art 7 XXIX CF').numero, P('art 7 XXIX CF').parte, P('art 7 XXIX CF').dicas], [7, { inc: 29 }, ['cf']]);
    assert.deepEqual([P('art. 4º-A da Lei 6.019').sufixo, P('art. 4º-A da Lei 6.019').dicas], ['a', ['6019']]);
    assert.deepEqual(P('art. 477, § 6º, a').parte, { p: 6, al: 'a' });
    assert.deepEqual([P('Súmula 331').tipos, P('Súmula 331').numero, P('súmula 331 do STF').tribunal], [['sumula'], 331, 'STF']);
    assert.deepEqual([P('OJ 394').tipos, P('OJ 4 da SBDI-2').colecao], [['oj'], 'tst-oj-sdi2']);
    assert.deepEqual([P('Tema 1046').tipos.includes('tema_rg'), P('SV 4').tipos, P('súmula vinculante 4').tipos, P('ADI 5766').tipos], [true, ['sumula_vinculante'], ['sumula_vinculante'], ['ADI']]);
    assert.equal(P('justa causa'), null);
    assert.equal(P('arte'), null);
    // "art. 2": o art. 2º da CLTT (o diploma que o edital mais usa) em 1º; o bm25 cru punha o do CCT (texto curto) na frente
    let r = await ana.get('/lei-juris/busca?q=' + encodeURIComponent('art. 2') + '&onde=lei');
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(r.json.lei.slice(0, 2).map(x => [x.diploma_id, x.id, !!x.exato]), [['clt-teste', 'art-2', true], ['cc-teste', 'art-2', true]]);
    assert.equal(r.json.consulta, 'artigo');
    // com o diploma na consulta, ele vem primeiro
    r = await ana.get('/lei-juris/busca?q=' + encodeURIComponent('artigo 2 do CCT') + '&onde=lei');
    assert.deepEqual([r.json.lei[0].diploma_id, r.json.lei[0].id], ['cc-teste', 'art-2']);
    // o inciso pedido vira o trecho
    r = await ana.get('/lei-juris/busca?q=' + encodeURIComponent('art 7 XXIX CF') + '&onde=lei');
    assert.deepEqual([r.json.lei[0].diploma_id, r.json.lei[0].id, r.json.lei[0].parte], ['cf-teste', 'art-7', 'art-7.inc29']);
    assert.ok(r.json.lei[0].trecho.startsWith('XXIX ação'), r.json.lei[0].trecho);
    // Súmula 331: a do TST em 1º (sem tribunal na consulta, a ordem do acervo: TST antes do STF); "do STF" inverte
    assert.equal((await staff('jurisprudencia', { colecoes: [{ id: 'stf-sumulas', nome: 'Súmulas do STF', tribunal: 'STF', fonte_url: 'https://portal.stf.jus.br/', consultado_em: '2026-10-16' }],
      itens: [VB(331, { titulo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS. LEGALIDADE', texto: 'A contratação de trabalhadores por empresa interposta é ilegal, formando-se o vínculo diretamente com o tomador dos serviços.' }),
        { id: 'stf-sum-331', colecao: 'stf-sumulas', tipo: 'sumula', tribunal: 'STF', numero: '331', texto: 'Curta.', situacao: 'vigente', fonte_url: 'https://portal.stf.jus.br/331', consultado_em: '2026-10-16' }] })).st, 200);
    r = await ana.get('/lei-juris/busca?q=' + encodeURIComponent('Súmula 331') + '&onde=juris');
    assert.deepEqual(r.json.juris.slice(0, 2).map(x => [x.id, !!x.exato]), [['tst-sum-331', true], ['stf-sum-331', true]]);
    r = await ana.get('/lei-juris/busca?q=' + encodeURIComponent('súmula 331 do STF') + '&onde=juris');
    assert.equal(r.json.juris[0].id, 'stf-sum-331');
    r = await ana.get('/lei-juris/busca?q=' + encodeURIComponent('SV 13') + '&onde=juris');
    assert.equal(r.json.juris[0].id, 'stf-sv-13');
  });

  await t('lei-juris · AL-08: texto livre — bm25 com peso no título e na frase exata, e o que o edital cobra no ITEM QUE TRATA DO ASSUNTO sobe (e entra mesmo sem a palavra, com "pelo_item")', async () => {
    // "rescisão do contrato" é o texto do item 1.1.1: o art. 2º da CLTT (vinculado ao item) passa o art. 5º do CCT
    // (texto curto, o primeiro do bm25 cru); o art. 1º da CLTT não tem "rescisão", mas é o que o item cobra
    const r = await ana.get('/lei-juris/busca?q=' + encodeURIComponent('rescisão do contrato') + '&onde=lei');
    assert.equal(r.st, 200, r.texto);
    const ids = r.json.lei.map(x => x.diploma_id + '|' + x.id);
    assert.ok(ids.indexOf('clt-teste|art-2') === 0, ids.join(' '));
    assert.ok(ids.indexOf('clt-teste|art-2') < ids.indexOf('cc-teste|art-5'), 'o vinculado ao item do assunto antes do texto curto');
    const a1 = r.json.lei.find(x => x.id === 'art-1' && x.diploma_id === 'clt-teste');
    assert.ok(a1, 'o dispositivo que o item cobra entra mesmo sem a palavra: ' + ids.join(' '));
    assert.deepEqual(a1.pelo_item, ['1.1.1']);
    assert.equal(r.json.total_lei, r.json.lei.length);
    assert.equal(r.json.consulta, undefined, 'texto livre não é consulta por número');
  });

  await t('lei-juris · AL-04/AL-09/AL-15: o verbete guarda e devolve o que a coleta diz da DATA DO EDITAL — nota, situação inferida (não apurada), ressalva (explícita ou da "perda de eficácia" anterior ao edital), redação/título/tese de então e cancelamento parcial', async () => {
    const COLS = [{ id: 'tst-oj-sdi1', nome: 'OJs da SBDI-1', tribunal: 'TST', fonte_url: 'https://jurisprudencia.tst.jus.br/', consultado_em: '2026-10-16' },
      { id: 'trt10-irdr', nome: 'IRDR do TRT-10', tribunal: 'TRT-10', fonte_url: 'https://pje.trt10.jus.br/', consultado_em: '2026-10-16' },
      { id: 'stf-temas', nome: 'Temas do STF', tribunal: 'STF', fonte_url: 'https://portal.stf.jus.br/', consultado_em: '2026-10-16' }];
    const B = (id, colecao, tipo, tribunal, numero, extra) => ({ id, colecao, tipo, tribunal, numero, texto: 'Texto de ' + id + '.', situacao: 'vigente', situacao_na_data_do_edital: 'vigente', fonte_url: 'https://x.jus.br/' + id, consultado_em: '2026-10-16', ...extra });
    const r = await staff('jurisprudencia', { colecoes: COLS, itens: [
      B('tst-oj-sdi1-394', 'tst-oj-sdi1', 'oj', 'TST', '394', { texto: 'A majoração do repouso deve repercutir no cálculo.', situacao_na_data_do_edital_nota: 'redação alterada depois do edital (2023-03-31)',
        titulo_na_data_do_edital: 'RSR. NÃO REPERCUSSÃO', texto_na_data_do_edital: 'A majoração do repouso não repercute no cálculo.' }),
      B('tst-sum-90', 'tst-sumulas', 'sumula', 'TST', '90', { situacao: 'cancelado', situacao_detalhe: 'Cancelada por perda de eficácia a partir de 11.11.2017, pela Lei 13.467/2017. Res. 225/2025' }),
      B('tst-sum-91', 'tst-sumulas', 'sumula', 'TST', '91', { situacao: 'cancelado', ressalva_na_data_do_edital: 'sem eficácia desde 11/11/2017 (Res. 225/2025)' }),
      B('tst-sum-6', 'tst-sumulas', 'sumula', 'TST', '6', { cancelamento_parcial: true, situacao_detalhe: 'Itens I e II cancelados por perda de eficácia a partir de 11.11.2017, Res. 225/2025' }),
      B('trt10-irdr-7', 'trt10-irdr', 'irdr', 'TRT-10', '7', { situacao: 'suspenso', situacao_na_data_do_edital: 'suspenso', situacao_na_data_do_edital_inferida: true,
        situacao_na_data_do_edital_nota: 'NÃO APURADO na data do edital: instauração sem data nas fontes lidas — usada a situação atual' }),
      B('stf-tema-360', 'stf-temas', 'tema_rg', 'STF', '360', { tese: 'Tese de hoje.', tese_na_data_do_edital: { tese: 'Tese de 2018.', data: '2018-09-20', fonte: { url: 'https://portal.stf.jus.br/' } } }),
      B('tst-sum-500', 'tst-sumulas', 'sumula', 'TST', '500', { situacao: 'cancelado', situacao_detalhe: 'Cancelada por perda de eficácia a partir de 10.10.2024.' })] });
    assert.equal(r.st, 200, r.texto);
    assert.ok(db.prepare("SELECT edital_extra FROM est_lj_verbetes WHERE id = 'tst-oj-sdi1-394'").get().edital_extra.includes('não repercute'), 'o campo foi preservado na importação');
    assert.equal(db.prepare("SELECT edital_extra FROM est_lj_verbetes WHERE id = 'tst-sum-500'").get().edital_extra, '', 'sem nada da data do edital, a coluna fica vazia');
    const v = async (id) => (await ana.get('/jurisprudencia/verbete/' + id)).json.verbete;
    const oj = await v('tst-oj-sdi1-394');
    assert.deepEqual([oj.titulo_na_data_do_edital, oj.texto_na_data_do_edital, oj.situacao_na_data_do_edital_nota], ['RSR. NÃO REPERCUSSÃO', 'A majoração do repouso não repercute no cálculo.', 'redação alterada depois do edital (2023-03-31)']);
    assert.equal((await v('tst-sum-90')).ressalva_na_data_do_edital, 'formalmente vigente, mas sem eficácia desde 11/11/2017', 'a ressalva sai da nota oficial quando a coleta não a traz');
    assert.equal((await v('tst-sum-91')).ressalva_na_data_do_edital, 'sem eficácia desde 11/11/2017 (Res. 225/2025)', 'a explícita vale');
    assert.equal((await v('tst-sum-500')).ressalva_na_data_do_edital, '', 'perda de eficácia DEPOIS do edital não vira ressalva');
    const s6 = await v('tst-sum-6');
    assert.deepEqual([s6.cancelamento_parcial, s6.ressalva_na_data_do_edital], [true, 'formalmente vigente; os itens cancelados já estavam sem eficácia desde 11/11/2017']);
    const ir = await v('trt10-irdr-7');
    assert.deepEqual([ir.situacao_na_data_do_edital_inferida, /NÃO APURADO/.test(ir.situacao_na_data_do_edital_nota)], [true, true]);
    assert.deepEqual([(await v('stf-tema-360')).tese_na_data_do_edital, (await v('stf-tema-360')).tese_na_data_do_edital_data], ['Tese de 2018.', '2018-09-20']);
    // na busca, o resultado leva a ressalva junto do selo
    const b = await ana.get('/lei-juris/busca?q=' + encodeURIComponent('Súmula 90') + '&onde=juris');
    assert.deepEqual([b.json.juris[0].id, b.json.juris[0].ressalva_na_data_do_edital], ['tst-sum-90', 'formalmente vigente, mas sem eficácia desde 11/11/2017']);
  });

  // ================= MARCAÇÃO DE LEITURA =================
  // ================= DECLARADO INCONSTITUCIONAL (ADR-0014; varredura de 18/10/2026) =================
  const DEC = (extra = {}) => ({ verbete: 'stf-tema-1075', tecnica: 'inconstitucional', alcance: 'integral (redação da Lei 9.494/1997)', data: '2021-04-08',
    efeito: 'repristina a redação original', texto_repristinado: 'A sentença civil fará coisa julgada erga omnes, exceto se a ação for julgada improcedente por deficiência de provas.',
    trecho: 'I - É inconstitucional a redação do art. 16 da Lei 7.347/1985, alterada pela Lei 9.494/1997, sendo repristinada sua redação original', ...extra });
  const DIP_STF = (dispositivos) => ({ id: 'lei-stf-teste', nome: 'Lei de Teste do STF', norma: 'Lei de teste', sigla: 'LST', tipo: 'lei', abrangencia: 'integral',
    fonte_url: 'https://www.planalto.gov.br/stf-teste.htm', consultado_em: '2026-10-18', data_referencia_edital: '2023-01-05', estrutura: [],
    dispositivos: dispositivos || [
      { id: 'art-1', rotulo: 'Art. 1º', ordem: 1, texto: 'A sentença fará coisa julgada nos limites da competência territorial do órgão prolator.', partes: [], situacao: 'inconstitucional',
        nota: '(Redação dada pela Lei nº 9.494, de 10.9.1997)', alterado_por: null, texto_na_data_do_edital: null, decisao_stf: [DEC()] },
      { id: 'art-2', rotulo: 'Art. 2º', ordem: 2, texto: 'Incide a contribuição sobre:', situacao: 'vigente', nota: '', alterado_por: null, texto_na_data_do_edital: null, partes: [
        { id: 'art-2.p1', caminho: '§ 1º', rotulo: '§ 1º', texto: '', situacao: 'inconstitucional_apos_edital', nota: '(Vide ADI 9999)', alterado_por: null, texto_na_data_do_edital: null,
          decisao_stf: [{ verbete: 'stf-adi-9999', tecnica: 'inconstitucional', alcance: 'integral', data: '2023-06-13', efeito: 'ex tunc', trecho: 'declarar a inconstitucionalidade do § 1º' }] },
        { id: 'art-2.p2', caminho: '§ 2º', rotulo: '§ 2º', texto: 'O salário-maternidade é base de cálculo, salvo o salário-maternidade.', situacao: 'vigente', nota: '', alterado_por: null, texto_na_data_do_edital: null,
          decisao_stf: [{ verbete: 'stf-tema-72', tecnica: 'inconstitucional_parcial', alcance: 'expressão "salvo o salário-maternidade"', data: '2020-08-05', efeito: '', trecho: 'a parte final em que se lê "salvo o salário-maternidade"' },
            { norma: 'Resolução do Senado Federal nº 10/2016', tecnica: 'execucao_suspensa', data: '2016-03-30', trecho: 'Execução suspensa pela Resolução do Senado Federal nº 10, de 2016' }] },
      ] },
      { id: 'art-3', rotulo: 'Art. 3º', ordem: 3, texto: 'Esta Lei entra em vigor na data de sua publicação.', partes: [], situacao: 'vigente', nota: '', alterado_por: null, texto_na_data_do_edital: null },
    ] });

  await t('lei-juris · inconstitucional (ADR-0014): situações novas e decisao_stf aceitas, guardadas e devolvidas (dispositivo e parte); formato errado recusa; verbete fora do acervo é aviso; reenvio idempotente', async () => {
    // formato errado: técnica fora da lista, sem trecho, sem verbete nem norma, data em outro formato, não-lista
    const ruim = DIP_STF([{ id: 'art-1', rotulo: 'Art. 1º', texto: 'x', partes: [{ id: 'art-1.p1', rotulo: '§ 1º', texto: 'y', situacao: 'inconstitucional', decisao_stf: { verbete: 'stf-x' } }], situacao: 'inconstitucional',
      decisao_stf: [{ verbete: 'stf-x', tecnica: 'derrubado', data: '08/04/2021', trecho: '' }, { tecnica: 'inconstitucional', data: '2021-04-08', trecho: 'x' }] }]);
    let r = await staff('diploma', { diploma: ruim });
    assert.equal(r.st, 400, r.texto);
    const errs = r.texto;
    for (const f of ['derrubado', 'decisao_stf[0].data', 'decisao_stf[0].trecho', 'decisao_stf[1]: informe', 'partes[0].decisao_stf: deve ser lista']) assert.ok(errs.includes(f), 'falta o erro: ' + f + ' — ' + errs);
    assert.equal(contar("SELECT COUNT(*) n FROM est_lj_diplomas WHERE id = 'lei-stf-teste'"), 0, 'nada gravado');
    // situação nova sem decisão: aceita, com aviso
    r = await staff('diploma', { diploma: DIP_STF([{ id: 'art-1', rotulo: 'Art. 1º', texto: 'x', partes: [], situacao: 'inconstitucional' }]) });
    assert.equal(r.st, 200, r.texto);
    assert.ok(r.json.avisos.some(a => /art-1: situação "inconstitucional" sem decisao_stf/.test(a)), JSON.stringify(r.json.avisos));
    // o diploma de verdade
    r = await staff('diploma', { diploma: DIP_STF() });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.declarados_inconstitucionais, r.json.com_decisao_stf, r.json.alterados_apos_edital, r.json.por_situacao.inconstitucional, r.json.por_situacao['parte:inconstitucional_apos_edital']], [2, 3, 0, 1, 1],
      'inconstitucional não conta como "alterado depois do edital"');
    assert.ok(r.json.avisos.some(a => /verbete\(s\) fora do acervo de jurisprudência: .*stf-tema-1075/.test(a)), 'verbete que não está no acervo: aviso, não erro');
    assert.ok(!r.json.avisos.some(a => /alterado_por\.data/.test(a)), 'inconstitucional_apos_edital não pede a data da norma que alterou');
    assert.deepEqual(JSON.parse(db.prepare("SELECT decisao_stf FROM est_lj_dispositivos WHERE diploma_id = 'lei-stf-teste' AND id = 'art-1'").get().decisao_stf), [DEC()], 'a coluna nova guarda a lista');
    assert.equal(db.prepare("SELECT decisao_stf FROM est_lj_dispositivos WHERE diploma_id = 'lei-stf-teste' AND id = 'art-3'").get().decisao_stf, '');
    assert.equal((await staff('diploma', { diploma: DIP_STF() })).json.inalterado, true, 'o mesmo conteúdo não regrava');
    assert.ok(LJ.SITUACOES.includes('inconstitucional') && LJ.SITUACOES.includes('inconstitucional_apos_edital'));
    // a API do aluno devolve a decisão — no dispositivo e na parte; sem decisão, sem a chave
    const g = await ana.get('/legislacao/lei-stf-teste');
    assert.equal(g.st, 200, g.texto);
    const pd = Object.fromEntries(g.json.dispositivos.map(x => [x.id, x]));
    assert.deepEqual([pd['art-1'].situacao, pd['art-1'].decisao_stf], ['inconstitucional', [DEC()]]);
    assert.equal(pd['art-1'].texto, DIP_STF().dispositivos[0].texto, 'o texto do Planalto continua guardado e mostrado');
    assert.deepEqual(pd['art-2'].partes.map(p => [p.id, p.situacao, (p.decisao_stf || []).map(z => z.tecnica)]),
      [['art-2.p1', 'inconstitucional_apos_edital', ['inconstitucional']], ['art-2.p2', 'vigente', ['inconstitucional_parcial', 'execucao_suspensa']]]);
    assert.equal(pd['art-2'].partes[1].decisao_stf[1].norma, 'Resolução do Senado Federal nº 10/2016');
    assert.ok(!('decisao_stf' in pd['art-3']) && !('decisao_stf' in pd['art-2']));
  });

  await t('lei-juris · inconstitucional por PERCURSO (ADR-0015): com data própria, a data da 1ª decisão diz se, nela, já era inconstitucional', async () => {
    const naData = async (dataRef) => {
      db.prepare('UPDATE est_escopos SET data_referencia = ? WHERE id = ?').run(dataRef, eid());
      const g = await ana.get('/legislacao/lei-stf-teste');
      assert.equal(g.st, 200, g.texto);
      const pd = Object.fromEntries(g.json.dispositivos.map(x => [x.id, x]));
      return [pd['art-1'].situacao, pd['art-2'].partes[0].situacao, pd['art-2'].partes[1].situacao, pd['art-3'].situacao, !!(pd['art-1'].decisao_stf || []).length];
    };
    try {
      assert.deepEqual(await naData(''), ['inconstitucional', 'inconstitucional_apos_edital', 'vigente', 'vigente', true], 'sem data própria: o acervo como está');
      assert.deepEqual(await naData('2024-02-07'), ['inconstitucional', 'inconstitucional', 'vigente', 'vigente', true], 'corte de B (07/02/2024): a decisão de 13/06/2023 já existia');
      assert.deepEqual(await naData('2020-01-01'), ['inconstitucional_apos_edital', 'inconstitucional_apos_edital', 'vigente', 'vigente', true], 'antes de 08/04/2021: vigorava; a decisão é posterior');
    } finally { db.prepare("UPDATE est_escopos SET data_referencia = '' WHERE id = ?").run(eid()); }
    const r = await staff('remover', { diplomas: ['lei-stf-teste'] });
    assert.deepEqual([r.st, r.json.apagados_do_acervo], [200, 1]);
  });

  await t('lei-juris: marcação de leitura — lido e grifo em duas cores, por dispositivo e por verbete; de quem marcou e de mais ninguém; desmarcar tudo apaga', async () => {
    let r = await ana.put('/lei-juris/marcas', { tipo: 'dispositivo', ref: 'clt-teste|art-2', lido: true, cor: 'amarelo' });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.marca.lido, r.json.marca.cor], [true, 'amarelo']);
    r = await ana.put('/lei-juris/marcas', { tipo: 'dispositivo', ref: 'clt-teste|art-2', cor: 'verde' });
    assert.deepEqual([r.json.marca.lido, r.json.marca.cor], [true, 'verde'], 'trocar a cor não desmarca o lido');
    assert.equal((await ana.put('/lei-juris/marcas', { tipo: 'verbete', ref: 'tst-sum-4', lido: true })).st, 200);
    assert.equal((await ana.put('/lei-juris/marcas', { tipo: 'dispositivo', ref: 'clt-teste|art-2', cor: 'azul' })).st, 400, 'só duas cores');
    assert.equal((await ana.put('/lei-juris/marcas', { tipo: 'dispositivo', ref: 'clt-teste|art-77' })).st, 404);
    assert.equal((await ana.put('/lei-juris/marcas', { tipo: 'verbete', ref: 'verbete-de-outro-curso' })).st, 404);
    assert.equal((await ana.put('/lei-juris/marcas', { tipo: 'aula', ref: 'x' })).st, 400);
    // ela vê as dela, onde quer que leia
    assert.deepEqual((await ana.get('/legislacao/vinculada?unidade=aula-a')).json.marcas['clt-teste|art-2'].cor, 'verde');
    assert.deepEqual((await ana.get('/legislacao/clt-teste')).json.marcas['clt-teste|art-2'], { lido: true, cor: 'verde' });
    assert.equal((await ana.get('/jurisprudencia?situacao=cancelado')).json.marcas['tst-sum-4'].lido, true);
    assert.equal((await ana.get('/lei-juris/marcas')).json.marcas.length, 2);
    // a Bia não vê nada da Ana
    assert.deepEqual((await bia.get('/lei-juris/marcas')).json.marcas, []);
    assert.deepEqual((await bia.get('/legislacao/vinculada?unidade=aula-a')).json.marcas, {});
    assert.deepEqual((await bia.get('/legislacao/clt-teste')).json.marcas, {});
    assert.deepEqual((await bia.get('/jurisprudencia/verbete/tst-sum-4')).json.marcas, {});
    // desmarcar tudo apaga a linha
    r = await ana.put('/lei-juris/marcas', { tipo: 'verbete', ref: 'tst-sum-4', lido: false });
    assert.deepEqual([r.json.marca.lido, r.json.marca.cor], [false, '']);
    assert.equal(contar("SELECT COUNT(*) n FROM est_lj_marcas WHERE user_id = ? AND tipo = 'verbete'", ana.id), 0);
  });

  await t('lei-juris: LGPD — a marcação de leitura sai na exportação do titular e é apagada na exclusão da conta; a do outro aluno fica', async () => {
    await bia.put('/lei-juris/marcas', { tipo: 'dispositivo', ref: 'clt-teste|art-1', lido: true });
    const exp = repo.Usuarios.exportar(ana.id);
    assert.deepEqual(exp.aprendizagem.est_lj_marcas.map(m => [m.tipo, m.ref, m.lido, m.cor]), [['dispositivo', 'clt-teste|art-2', 1, 'verde']]);
    assert.ok(!JSON.stringify(exp).includes(bia.id), 'a exportação da Ana não leva nada da Bia');
    repo.Usuarios.anonimizar(ana.id);
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_marcas WHERE user_id = ?', ana.id), 0);
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_marcas WHERE user_id = ?', bia.id), 1);
  });

  await t('lei-juris: tirar o diploma do percurso — vínculos saem; o texto só sai do acervo quando nenhum percurso o usa; o acervo volta a rascunho pelo status', async () => {
    const r = await staff('remover', { verbetes: ['tst-sum-130'] });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.verbetes, r.json.apagados_do_acervo], [1, 1]);
    assert.equal(contar("SELECT COUNT(*) n FROM est_lj_verbetes WHERE id = 'tst-sum-130'"), 0);
    assert.equal(contar('SELECT COUNT(*) n FROM est_lj_fts_juris'), contar('SELECT COUNT(*) n FROM est_lj_verbetes'), 'o índice acompanha');
    assert.equal((await staff('remover', {})).st, 400);
    assert.equal((await staff('status', { status: 'rascunho' })).st, 200);
    assert.equal((await bia.get('/jurisprudencia')).st, 404, 'de volta a rascunho, o aluno não vê');
    assert.equal((await bia.get('/painel')).json.lei_juris, null);
    assert.equal((await staff('status', { status: 'publicado' })).st, 200);
  });

  // ================= TELA =================
  const TELA = ler('app-estudo.js'), CSS = ler('estude.css');
  function funcaoDoFonte(fonte, nome) {
    const ini = fonte.indexOf('function ' + nome + '(');
    assert.ok(ini >= 0, `app-estudo.js perdeu a função ${nome}`);
    let i = fonte.indexOf('{', fonte.indexOf(')', ini)), n = 0;
    for (; i < fonte.length; i++) {
      const c = fonte[i];
      if (c === '/' && fonte[i + 1] === '/') { i = fonte.indexOf('\n', i); continue; }
      if (c === '\'' || c === '"') { for (i++; fonte[i] !== c; i++) if (fonte[i] === '\\') i++; continue; }
      if (c === '{') n++;
      else if (c === '}' && --n === 0) return fonte.slice(ini, i + 1);
    }
    throw new Error('função sem fim: ' + nome);
  }
  await t('lei-juris · tela: abas "Legislação" e "Jurisprudência" no curso (só com o acervo aberto) e na aula, ao lado do texto; acervos com busca, filtros, navegação e páginas', async () => {
    assert.ok(/\['lei', 'Legislação'\], \['juris', 'Jurisprudência'\]/.test(TELA), 'as duas abas no menu do curso');
    assert.ok(/temLeiJuris\(x\[0\]\)/.test(TELA), 'a aba só aparece com o acervo (painel.lei_juris)');
    assert.ok(/lei: acervoLei, juris: acervoJuris/.test(TELA), 'as abas levam aos acervos');
    assert.ok(/LISTAS = \{[^}]*lei: 1, juris: 1/.test(TELA), 'os acervos lembram rolagem e o que estava aberto');
    assert.ok(/abasDaAula\(\) \+ '<div id="es-un-p-texto"/.test(TELA) && /data-ua="lei">⚖️ Legislação/.test(TELA) && /data-ua="juris">🏛️ Jurisprudência/.test(TELA), 'as abas da aula ao lado do texto');
    assert.ok(TELA.includes("'/legislacao/vinculada?unidade='") && TELA.includes("'/jurisprudencia/vinculada?unidade='"), 'a aula pede o que o item cobra');
    for (const f of ['acervoLei', 'diplomaNaTela', 'acervoJuris', 'verbeteNaTela', 'ligarBusca', 'ligarLeiJuris', 'htmlDispositivo', 'htmlVerbete', 'cabecalhosDaEstrutura']) assert.ok(TELA.includes('function ' + f + '('), 'falta ' + f);
    assert.ok(/id="es-lj-ir"/.test(TELA) && /Só o que o edital cobra/.test(TELA) && /Procurar neste diploma/.test(TELA), 'navegação por título/capítulo, filtro do que é cobrado e procura no diploma');
    assert.ok(/data-jf-pg=/.test(TELA) && /sel\('tribunal'/.test(TELA) && /sel\('disciplina'/.test(TELA) && /sel\('situacao'/.test(TELA) && /sel\('colecao'/.test(TELA), 'filtros e páginas da jurisprudência');
    assert.ok(/'\/lei-juris\/busca\?q='/.test(TELA) && /Buscar nos dois acervos/.test(TELA), 'a busca única');
    assert.ok(/data-lj-aula=/.test(TELA) && /Nas aulas:/.test(TELA), 'cada dispositivo/verbete leva às aulas que o usam');
    assert.ok(/data-lj-lido/.test(TELA) && /data-lj-cor="amarelo"/.test(TELA) && /data-lj-cor="verde"/.test(TELA) && /'\/lei-juris\/marcas'/.test(TELA), 'marcação de leitura: lido e grifo em duas cores');
  });

  await t('lei-juris · tela: "voltar para onde estava" — a aula lembra a aba aberta, o acervo aberto da aula volta a ela (aba e rolagem), e a aula aberta do acervo volta ao diploma', async () => {
    assert.ok(/abaAula: ABA_AULA/.test(TELA) && /acervo: E\.antesDoAcervo/.test(TELA), 'o passo do histórico leva a aba de cada aula e a aula de onde o acervo veio (F5, Voltar)');
    assert.ok(/abrirAbaDaAula\(codigo, ABA_AULA\[codigo\] \|\| 'texto'\)/.test(TELA), 'a aula reabre na aba em que estava');
    assert.ok(/if \(E\.aba === 'unidade'\) E\.antesDoAcervo = \{ aba: 'unidade', arg: onde\.arg, y: yAntes \}/.test(TELA), 'o acervo guarda a aula e a rolagem');
    assert.ok(/E\.veioDeLugar = \{ aba: E\.aba, arg: onde\.aba === E\.aba \? onde\.arg : undefined, y: yAntes, ancora: ancoraAntes \}/.test(TELA) && /\(veio === 'lei' \|\| veio === 'juris'\) && E\.veioDeLugar/.test(TELA), 'a aula volta ao diploma (ou à página da jurisprudência)');
    assert.ok(/ir\(a\.aba \|\| 'hoje', a\.arg, false, \{ voltando: true \}\)/.test(TELA), 'voltar não regrava "de onde vim"');
    assert.ok(/Voltar à aula/.test(TELA), 'o botão de volta à aula');
    // a leitura até o fim não conta com o texto escondido (aba de Legislação aberta)
    assert.ok(/if \(!fim\.offsetParent && fim\.getClientRects\(\)\.length === 0\) return;/.test(funcaoDoFonte(TELA, 'ligarFimDaLeitura')));
  });

  await t('lei-juris · tela: a situação sempre explícita — "Alterado em 16/10/2026 pela Emenda Constitucional nº 141 — na data do edital: …", incluído e revogado depois do edital, e o verbete cancelado com a marca', async () => {
    const ctx = { esc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      dataBR: (d) => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '' };
    vm.createContext(ctx);
    for (const f of ['dataNorma', 'pelaNorma', 'situacaoDoDispositivo', 'tagDoDispositivo']) vm.runInContext(funcaoDoFonte(TELA, f), ctx);
    vm.runInContext("var SIT_DISP = { revogado: 'Revogado', vetado: 'Vetado', alterado_apos_edital: 'x', incluido_apos_edital: 'y', revogado_apos_edital: 'z' };", ctx);
    const alt = ctx.situacaoDoDispositivo({ situacao: 'alterado_apos_edital', alterado_por: { norma: 'Emenda Constitucional nº 141', data: '2026-10-16' }, texto_na_data_do_edital: 'O prazo conta da extinção do contrato.' }, '2023-01-05');
    assert.ok(alt.includes('Alterado em 16/10/2026 pela Emenda Constitucional nº 141') && alt.includes('na data do edital (05/01/2023):') && alt.includes('O prazo conta da extinção do contrato.'), alt);
    assert.ok(ctx.situacaoDoDispositivo({ situacao: 'incluido_apos_edital', alterado_por: { norma: 'Decreto nº 9', data: '2024' } }, '2023-01-05').includes('Incluído em 2024 pelo Decreto nº 9</b> — não existia na data do edital'));
    assert.ok(ctx.situacaoDoDispositivo({ situacao: 'revogado_apos_edital', alterado_por: { norma: 'Lei nº 1', data: '2025-02-03' }, texto_na_data_do_edital: 'antes' }, '2023-01-05').includes('Revogado em 03/02/2025 pela Lei nº 1'));
    assert.ok(ctx.situacaoDoDispositivo({ situacao: 'alterado_apos_edital', alterado_por: null, edital_indisponivel: true }, '2023-01-05').includes('não está disponível na fonte'));
    assert.equal(ctx.situacaoDoDispositivo({ situacao: 'vigente' }, '2023-01-05'), '');
    assert.ok(ctx.tagDoDispositivo('revogado').includes('Revogado'));
    // o texto do aluno (e da fonte) não vira HTML
    assert.ok(!ctx.situacaoDoDispositivo({ situacao: 'alterado_apos_edital', alterado_por: { norma: '<script>x</script>', data: '2026-01-01' } }, '').includes('<script>'));
    // verbete: a situação e a da data do edital, quando diferem
    assert.ok(/function situacaoDoVerbete\(v\)/.test(TELA) && /Na data do edital: /.test(TELA) && /cancelado: 'Cancelado'/.test(TELA) && /v\.situacao_detalhe/.test(TELA));
    // o trecho achado na busca: escapa primeiro, marca depois
    vm.runInContext(funcaoDoFonte(TELA, 'trechoAchado'), ctx);
    assert.equal(ctx.trechoAchado('a \u0002<b>x</b>\u0003 c'), 'a <mark>&lt;b&gt;x&lt;/b&gt;</mark> c');
  });

  await t('lei-juris · tela: declarado inconstitucional — selo vermelho "Declarado inconstitucional (STF)", a nota com o trecho da tese, o botão do verbete, a redação repristinada; parcial em âmbar; parte sem texto nunca em branco', async () => {
    const ctx = { esc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      dataBR: (d) => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '' };
    vm.createContext(ctx);
    vm.runInContext(TELA.slice(TELA.indexOf('    var SIT_DISP = {'), TELA.indexOf('    var SIT_JURIS = {')), ctx);
    for (const f of ['dataNorma', 'pelaNorma', 'situacaoDoDispositivo', 'tagDoDispositivo', 'decisaoDoDispositivo', 'botoesDeLeitura', 'linksDeAulas', 'htmlDispositivo']) vm.runInContext(funcaoDoFonte(TELA, f), ctx);
    const dec = { verbete: 'stf-tema-1075', tecnica: 'inconstitucional', alcance: 'integral', data: '2021-04-08', efeito: 'repristina a redação original', texto_repristinado: 'Redação de 1985.', trecho: 'É inconstitucional a redação <b>' };
    assert.ok(ctx.tagDoDispositivo('inconstitucional').includes('class="es-lj-tag rev">Declarado inconstitucional (STF)'), 'selo vermelho');
    const h = ctx.htmlDispositivo({ id: 'lei-x', data_referencia_edital: '2023-01-05' }, { id: 'art-16', rotulo: 'Art. 16', texto: 'A sentença…', situacao: 'inconstitucional', decisao_stf: [dec],
      partes: [{ id: 'art-16.p1', rotulo: '§ 1º', texto: '', situacao: 'inconstitucional', decisao_stf: [dec] },
        { id: 'art-16.p2', rotulo: '§ 2º', texto: '.', situacao: 'vigente', nota: '(Declarado inconstitucional pela ADI 5766)' },
        { id: 'art-16.p3', rotulo: '§ 3º', texto: 'Texto com a expressão.', situacao: 'vigente', decisao_stf: [{ verbete: 'stf-adi-5492', tecnica: 'inconstitucional_parcial', alcance: 'expressão "de banco oficial"', data: '2023-04-27', trecho: 'declarar inconstitucional a expressão' }] }] }, {}, {});
    assert.ok(h.includes('Declarado inconstitucional (STF)</b> em 08/04/2021') && h.includes('Efeito: repristina a redação original'), h);
    assert.ok(h.includes('<q class="es-lj-ed">É inconstitucional a redação &lt;b&gt;</q>'), 'o trecho da tese, escapado');
    assert.ok(h.includes('Redação que volta a valer:</span> <q class="es-lj-ed">Redação de 1985.</q>'));
    assert.ok(h.includes('data-lj-verb="stf-tema-1075"'), 'o link para o verbete usa o data-lj-verb que o ouvinte da tela já atende');
    assert.ok(h.includes('<i>(Declarado inconstitucional (STF))</i>'), 'parte declarada sem texto');
    assert.ok(h.includes('<b>§ 2º</b> <i>(texto não reproduzido na fonte oficial)</i>'), 'parte vigente sem texto (ou ".") não sai em branco');
    assert.ok(/es-lj-sit alt es-lj-stf[^]*Declarado inconstitucional em parte \(STF\)<\/b> em 27\/04\/2023[^]*expressão &quot;de banco oficial&quot;/.test(h), 'parcial: âmbar, com o alcance');
    // posterior à data de referência do percurso
    const pos = ctx.decisaoDoDispositivo({ situacao: 'inconstitucional_apos_edital', decisao_stf: [{ ...dec, data: '2025-06-17', texto_repristinado: '' }] }, '2024-02-07', 'data de corte da objetiva');
    assert.ok(pos.includes('posterior à data de corte da objetiva (07/02/2024): na data, o texto vigorava.') && !pos.includes('Redação que volta'), pos);
    assert.ok(ctx.tagDoDispositivo('inconstitucional_apos_edital').includes('rev'));
    // vigência RESTABELECIDA depois da data (ADI 7231: o texto estava revogado nela) — não diz que "vigorava"
    const rest = ctx.decisaoDoDispositivo({ situacao: 'alterado_apos_edital', decisao_stf: [{ ...dec, data: '2025-06-17', texto_repristinado: '' }] }, '2023-01-05');
    assert.ok(rest.includes('posterior à data do edital (05/01/2023).') && !rest.includes('vigorava'), rest);
    assert.equal(ctx.decisaoDoDispositivo({ situacao: 'vigente' }, '2023-01-05'), '');
    assert.ok(ctx.situacaoDoDispositivo({ situacao: 'inconstitucional' }, '2023-01-05').includes('Declarado inconstitucional (STF)'), 'sem decisão: o aviso seco');
    assert.equal(ctx.situacaoDoDispositivo({ situacao: 'inconstitucional', decisao_stf: [dec] }, '2023-01-05'), '', 'com decisão: o aviso é o da decisão (não duplica)');
  });

  // a parte da tela que pinta o verbete, executada num `vm` com o que ela usa do resto do arquivo
  function telaDoVerbete() {
    const ctx = { esc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      dataBR: (d) => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '' };
    vm.createContext(ctx);
    const ini = TELA.indexOf('    var SIT_JURIS = {'), fim = TELA.indexOf('    function tipoJuris(');
    vm.runInContext(TELA.slice(ini, fim), ctx);
    for (const f of ['texto', 'rotuloSituacao', 'situacaoDoVerbete', 'redacaoDoEdital', 'notaDoEdital', 'pelaBusca', 'citadosDoItem']) vm.runInContext(funcaoDoFonte(TELA, f), ctx);
    return ctx;
  }
  await t('lei-juris · tela AL-04/AL-09/AL-15/AL-03: o selo "Na data do edital" com a RESSALVA ao lado, "não apurado" quando inferida, "Parcialmente cancelada", a redação de então como nos dispositivos, e o incidente pendente sem o rótulo "Suspenso"', async () => {
    const c = telaDoVerbete();
    const ress = c.situacaoDoVerbete({ situacao: 'cancelado', situacao_na_data_do_edital: 'vigente', ressalva_na_data_do_edital: 'formalmente vigente, mas sem eficácia desde 11/11/2017' });
    assert.ok(ress.includes('Na data do edital: Vigente') && ress.includes('— formalmente vigente, mas sem eficácia desde 11/11/2017'), ress);
    // a ressalva aparece mesmo quando a situação de hoje é igual à da data do edital (cancelamento parcial)
    const parc = c.situacaoDoVerbete({ situacao: 'vigente', situacao_na_data_do_edital: 'vigente', cancelamento_parcial: true, ressalva_na_data_do_edital: 'os itens cancelados já estavam sem eficácia' });
    assert.ok(parc.includes('Parcialmente cancelada') && parc.includes('Na data do edital: Vigente') && parc.includes('os itens cancelados'), parc);
    const nap = c.situacaoDoVerbete({ situacao: 'suspenso', tipo: 'irdr', situacao_na_data_do_edital: 'suspenso', situacao_na_data_do_edital_inferida: true, situacao_na_data_do_edital_nota: 'NÃO APURADO na data do edital: sem data' });
    assert.ok(nap.includes('Na data do edital: não apurado') && nap.includes('Pendente de julgamento (processos suspensos)') && !/>Suspenso</.test(nap), nap);
    const inf = c.situacaoDoVerbete({ situacao: 'pendente', situacao_na_data_do_edital: 'inexistente', situacao_na_data_do_edital_inferida: true, situacao_na_data_do_edital_nota: 'a numeração é sequencial' });
    assert.ok(inf.includes('Na data do edital: Não existia') && inf.includes('não apurado na fonte (inferido)'), inf);
    assert.equal(c.situacaoDoVerbete({ situacao: 'vigente', situacao_na_data_do_edital: 'vigente' }), '<span class="es-selo verde">Vigente</span>', 'sem nada a dizer, um selo só');
    // a OJ 394: as duas redações, como nos dispositivos
    const red = c.redacaoDoEdital({ titulo_na_data_do_edital: 'RSR. NÃO REPERCUSSÃO', texto_na_data_do_edital: 'não repercute <b>', data_referencia: '2023-01-05' }); // a data vem da API (ADR-0015)
    assert.ok(red.includes('Na data do edital (05/01/2023) vigia outra redação') && red.includes('RSR. NÃO REPERCUSSÃO') && red.includes('não repercute &lt;b&gt;'), red);
    assert.equal(c.redacaoDoEdital({ texto: 'só a de hoje' }), '');
    assert.ok(c.redacaoDoEdital({ tese_na_data_do_edital: 'Tese de 2018.', tese_na_data_do_edital_data: '2018-09-20' }).includes('Tese (20/09/2018)'));
    assert.ok(c.notaDoEdital({ situacao_na_data_do_edital_nota: 'redação alterada depois do edital', situacao_detalhe: 'Nova redação' }).includes('redação alterada depois do edital'));
    assert.equal(c.notaDoEdital({ situacao_na_data_do_edital_nota: 'repetida', situacao_detalhe: 'x | repetida' }), '', 'a nota que o detalhe já diz não se repete');
    // o corpo do verbete usa as duas
    assert.ok(/redacaoDoEdital\(v\)/.test(funcaoDoFonte(TELA, 'corpoDoVerbete')) && /notaDoEdital\(v\)/.test(funcaoDoFonte(TELA, 'corpoDoVerbete')));
    // a busca diz por que o resultado está ali; a aba diz o diploma que o item cita sem artigo (AL-14)
    assert.ok(c.pelaBusca({ exato: true }).includes('o número pedido') && c.pelaBusca({ pelo_item: ['1.1.28'] }).includes('cobrado no item 1.1.28 do edital'));
    assert.ok(c.citadosDoItem({ citados_no_edital: [{ id: 'lei-6830-1980', nome: 'Lei de Execuções Fiscais', norma: 'Lei nº 6.830', na_aba: false }] }).includes('O item cobra também:'));
    assert.equal(c.citadosDoItem({ citados_no_edital: [{ id: 'x', nome: 'X', na_aba: true }] }), '', 'o diploma que já está na aba não se repete');
    assert.ok(/\.es-lj-ressalva\{/.test(CSS) && /\.es-lj-vsit \.es-selo[^{]*\{white-space:normal/.test(CSS), 'o selo longo quebra em 375 px');
  });

  await t('lei-juris · tela AL-10: o diploma é desenhado em BLOCOS sob demanda (seção, até 25 dispositivos) e "Só o que o edital cobra" só liga uma classe — sem redesenhar', async () => {
    const ctx = { esc: (x) => String(x == null ? '' : x) };
    vm.createContext(ctx);
    for (const f of ['cabecalhosDaEstrutura', 'blocosDoDiploma', 'alturaEstimada']) vm.runInContext(funcaoDoFonte(TELA, f), ctx);
    vm.runInContext('var BLOCO_MAX = 25;', ctx);
    const D = (n, est, cob) => ({ id: 'art-' + n, estrutura: est, texto: 'x'.repeat(80), cobrado: !!cob, partes: [] });
    const lista = [D(1, 'T1'), D(2, 'T1 > C1', true)].concat(Array.from({ length: 30 }, (_, i) => D(3 + i, 'T1 > C2'))).concat([D(40, 'T2', true)]);
    const bs = ctx.blocosDoDiploma(lista);
    assert.deepEqual(bs.map(b => [b.ini, b.fim, b.cob]), [[0, 1, false], [1, 2, true], [2, 27, false], [27, 32, false], [32, 33, true]], 'um bloco por seção, e a seção grande em blocos de 25');
    assert.deepEqual(bs.map(b => b.hTodos), ['<h4 class="es-lj-sec n0">T1</h4>', '<h4 class="es-lj-sec n1">C1</h4>', '<h4 class="es-lj-sec n1">C2</h4>', '', '<h4 class="es-lj-sec n0">T2</h4>']);
    // com o filtro, os cabeçalhos são os que mudaram desde o ÚLTIMO bloco com algo cobrado
    assert.deepEqual(bs.filter(b => b.cob).map(b => b.hCob), ['<h4 class="es-lj-sec n0">T1</h4><h4 class="es-lj-sec n1">C1</h4>', '<h4 class="es-lj-sec n0">T2</h4>']);
    assert.ok(ctx.alturaEstimada(lista, bs[2], false, 40) > ctx.alturaEstimada(lista, bs[2], true, 40), 'a altura estimada com o filtro é a do que fica');
    const fn = funcaoDoFonte(TELA, 'diplomaNaTela');
    assert.ok(!/function pintar\(/.test(fn), 'nada redesenha o diploma inteiro');
    assert.ok(/data-pend="1"/.test(fn) && /function desenhar\(n\)/.test(fn) && /function encher\(\)/.test(fn) && /addEventListener\('scroll', aoRolar/.test(fn), 'blocos vazios, desenhados quando chegam perto da tela');
    const filtrar = fn.slice(fn.indexOf('function filtrar('), fn.indexOf("el('es-lj-todos')"));
    assert.ok(/tx\.classList\.toggle\('so-cob', sim\)/.test(filtrar) && !/innerHTML/.test(filtrar), 'o filtro esconde e mostra, sem desenhar de novo');
    assert.ok(/\.es-lj-diploma\.so-cob \.es-lj-disp:not\(\.cobrado\)/.test(CSS) && /\.es-lj-bloco\[data-pend\]\{min-height:var\(--h\)\}/.test(CSS) && /\.es-lj-diploma\.so-cob \.h-cob\{display:block\}/.test(CSS));
  });

  await t('lei-juris · tela AL-16: o passo que o aluno deixa guarda o lugar NA HORA (não 700 ms depois), e o diploma volta pela ÂNCORA (o dispositivo no topo da tela), não pelo pixel', async () => {
    const irFn = funcaoDoFonte(TELA, 'ir');
    assert.ok(/var ancoraAntes = ancoraAtual\(\);\s*if \(!como\.reabrindo\) \{ clearTimeout\(rolouTimer\); guardarPassoAgora\(\); \}/.test(irFn), 'guarda antes de trocar de tela');
    assert.ok(/ancoraLei: ancoraAtual\(\)/.test(funcaoDoFonte(TELA, 'lembrancas')), 'o passo do histórico leva a âncora');
    assert.ok(/E\.ancoraRepor = anc;/.test(funcaoDoFonte(TELA, 'voltarPara')) && /!anc\) reporRolagem\(a\.aba, a\.y\)/.test(funcaoDoFonte(TELA, 'voltarPara')), 'a volta da aula usa a âncora');
    assert.ok(/if \(inicio\.aba === 'lei' && inicio\.arg && \(anc \|\| inicio\.y > 0\)\) \{ E\.reposicao = true; E\.ancoraRepor = anc; \}/.test(TELA), 'Voltar do navegador e F5: o dispositivo do endereço não puxa a tela');
    assert.ok(/if \(ancora && blocoDe\[ancora\.id\] != null\) irPara\(ancora\.id, false, ancora\.dy\);/.test(funcaoDoFonte(TELA, 'diplomaNaTela')));
    assert.ok(/data-lj-ref/.test(funcaoDoFonte(TELA, 'ancoraDoTexto')));
  });

  await t('lei-juris · tela: leitura confortável e o celular — a tipografia do "Ler como livro" (.es-ler), texto que quebra, grades que cabem em 375 px; a versão do script e da folha subiu', async () => {
    assert.ok(/class="es-ler es-lj/.test(TELA), 'a leitura usa .es-ler (a mesma do "Ler como livro")');
    assert.ok(/\.es-lj-disp,\.es-lj-verb\{[^}]*overflow-wrap:anywhere/.test(CSS));
    assert.ok(/\.es-lj-filtros\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,140px\),1fr\)\)/.test(CSS), 'os filtros não passam da tela (duas colunas em 375 px)');
    assert.ok(/\.es-lj-resultados\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,300px\),1fr\)\)/.test(CSS));
    assert.ok(/@media \(max-width:640px\)\{\n\s+\.es-lj-parte\.n1/.test(CSS), 'o recuo das partes encolhe no celular');
    const pg = ler('paginas.js');
    assert.ok(/estude: 11,/.test(pg) && /V_FOLHAS = \{ aluno: 5, estude: 6 \}/.test(pg), 'estude.js?v=11 e estude.css?v=6');
  });
}

module.exports = { rodar };
