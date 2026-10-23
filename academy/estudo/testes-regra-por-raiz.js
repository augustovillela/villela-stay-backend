// =====================================================================
// Villela Academy — ESTUDO · REGRA DE PONTUAÇÃO POR RAIZ DO PROGRAMA (ADR-0016, 20/10/2026).
// O curso do TJDFT tem a trilha ENAM DENTRO do mesmo percurso (raiz "ENAM" do programa): o simulado do ENAM
// (80 questões, 70 % de acerto, 50 % para cotistas, sem mínimo por bloco, repartido por disciplina) não pode
// cair na regra do XLIV (0,10 por questão, mínimos por bloco), onde saía "fora do formato, sem veredito".
// Aqui, em miniatura: raiz BI (regra do percurso) e raiz ENAM (regra própria, por disciplina, duas linhas de corte).
// =====================================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function rodar({ t, req }) {
  const { db } = require('../db');
  const R = require('./repo');
  const pontuacao = require('./pontuacao');
  const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  console.log('\n— estudo/regra por raiz do programa (ADR-0016): a trilha ENAM com a regra dela dentro do percurso do TJDFT —');
  const PROD = 'maria@t.com', SLUG = 'raiz-enam-estude';
  const ALU = { nome: 'Rui da Raiz', email: 'rui.raiz@t.com', senha: 'senha-forte-rui', aceite_termos: true };
  let pid = '';
  const E = (extra = {}) => ({ produtor_email: PROD, produto_id: pid, ...extra });
  const chave = (m, rota, corpo) => req(m, rota, { semUser: true, chave: true, corpo });
  const esc = () => `/academy/api/aluno/cursos/${pid}/estudo/${SLUG}`;
  const eid = () => R.Escopos.porSlug(pid, SLUG).id;
  // regra do percurso: 0,1 por acerto, 4 questões no bloco I, mínimo geral 0,3 (o molde da do XLIV)
  const ENAM = { valor_certa: 1, bloco_por: 'disciplina', formato: { questoes: 5, blocos: { 'Direito Constitucional': 3, 'Direito Administrativo': 2 } },
    aprovacao: { min_pontos: 4, rotulo: 'ampla concorrência' }, cortes_adicionais: [{ rotulo: 'pessoas autodeclaradas negras, indígenas, quilombolas ou com deficiência', min_pontos: 3 }],
    fonte: 'Edital de teste do ENAM, itens 8.6 e 9.2' };
  const REGRA = { valor_certa: 0.1, minimos: [{ bloco: 'I', min_pontos: 0.1 }], aprovacao: { min_pontos: 0.3 }, formato: { questoes: 4, blocos: { I: 4 } },
    fonte: 'Edital de teste do TJ, item 8', regras_por_raiz: { ENAM: ENAM } };
  const ALTS = (i) => [{ texto: `certa ${i}`, correta: true, explicacao: 'Certa.' }, { texto: `errada ${i}a`, correta: false, explicacao: 'Errada.' }, { texto: `errada ${i}b`, correta: false, explicacao: 'Errada.' }];
  const Q = (i, extra) => ({ tipo: 'objetiva', origem: 'autoral', enunciado: `Raiz, questão ${i}: qual é a regra aplicável ao ponto?`, alternativas: ALTS(i), ...extra });
  const PROGRAMA = { documento: { nome: 'Edital de teste', tipo: 'edital' }, itens: [
    { codigo: 'BI', texto: 'Bloco I' }, { codigo: 'BI.1', pai: 'BI', texto: 'Ponto do bloco I' },
    { codigo: 'ENAM', texto: 'Trilha ENAM' }, { codigo: 'ENAM.CF', pai: 'ENAM', texto: 'ENAM — Constitucional' }, { codigo: 'ENAM.CF.1', pai: 'ENAM.CF', texto: 'Ponto de Constitucional' },
    { codigo: 'ENAM.ADM', pai: 'ENAM', texto: 'ENAM — Administrativo' }, { codigo: 'ENAM.ADM.1', pai: 'ENAM.ADM', texto: 'Ponto de Administrativo' }] };
  const importar = (regra, extra = {}) => chave('POST', '/staff/api/academy/estudo/importar', E({ escopo: { slug: SLUG, tipo: 'edital', titulo: 'Percurso com trilha ENAM', regra_pontuacao: regra }, ...extra }));

  await t('regra por raiz (ADR-0016): o motor puro — duas linhas de corte lado a lado, regra da raiz validada, e a regra SEM raiz sai igual', async () => {
    const itens = Array.from({ length: 10 }, (_, k) => ({ id: 'q' + k, gabarito: 'a' }));
    const acerta = (n) => Object.fromEntries(itens.slice(0, n).map(i => [i.id, 'a']));
    const R2 = { aprovacao: { min_pct: 70, rotulo: 'ampla concorrência' }, cortes_adicionais: [{ rotulo: 'cotistas', min_pct: 50 }], fonte: 'f' };
    const seis = pontuacao.corrigir(itens, acerta(6), R2);
    assert.deepEqual([seis.aprovado, seis.cortes.map(c => [c.rotulo, c.atingido])], [false, [['ampla concorrência', false], ['cotistas', true]]], '60 %: não atinge a geral, atinge a do cotista — e o `aprovado` é o da geral');
    assert.deepEqual(pontuacao.corrigir(itens, acerta(7), R2).cortes.map(c => c.atingido), [true, true]);
    assert.deepEqual(pontuacao.corrigir(itens, acerta(4), R2).cortes.map(c => c.atingido), [false, false]);
    // retrocompatível: regra sem as novidades não ganha `cortes`, e o resto do resultado é o de sempre
    const velha = { valor_certa: 0.1, minimos: [{ bloco: '', min_pontos: 0.1 }], aprovacao: { min_pontos: 0.6 }, fonte: 'f' };
    const rv = pontuacao.corrigir(itens, acerta(6), velha);
    assert.deepEqual([rv.aprovado, 'cortes' in rv, rv.nota_liquida, pontuacao.normalizarRegra(velha).raizes, pontuacao.normalizarRegra(velha).bloco_por], [true, false, 0.6, [], 'bloco']);
    assert.equal(pontuacao.regraDaRaiz(velha, 'ENAM'), null);
    assert.equal(pontuacao.regraDaRaiz(REGRA, 'ENAM'), ENAM);
    for (const [torta, msg] of [
      [{ regras_por_raiz: [] }, /deve ser um objeto/], [{ regras_por_raiz: { ENAM: 3 } }, /raiz ENAM deve ser um objeto/],
      [{ regras_por_raiz: { ENAM: { regras_por_raiz: {} } } }, /uma camada só/], [{ regras_por_raiz: { ENAM: { valor_certa: -1 } } }, /valor_certa/],
      [{ cortes_adicionais: [{ rotulo: 'x', min_pct: 50 }] }, /exige a linha geral/], [{ aprovacao: { min_pct: 70 }, cortes_adicionais: [{ min_pct: 50 }] }, /sem "rotulo"/],
      [{ aprovacao: { min_pct: 70 }, cortes_adicionais: [{ rotulo: 'x' }] }, /sem min_pct nem min_pontos/]]) {
      assert.throws(() => pontuacao.normalizarRegra(torta), msg);
    }
  });

  await t('regra por raiz (ADR-0016): a importação recusa raiz que não é raiz do programa, regra da raiz sem fonte e regra torta (400) — e grava a válida', async () => {
    let r = await chave('POST', '/staff/api/academy/importar-curso', { produtor_email: PROD,
      produto: { titulo: 'Curso da Regra por Raiz', tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Só o percurso' },
      modulos: [{ titulo: 'Comece por aqui', aulas: [{ titulo: 'Aula de orientação', tipo: 'texto', conteudo: 'O conteúdo está no Estude.' }] }] });
    assert.equal(r.st, 200, r.texto);
    pid = r.json.produto.id;
    r = await importar({ ...REGRA, regras_por_raiz: { 'ENAM.CF': ENAM } }, { programa: PROGRAMA });
    assert.equal(r.st, 400, r.texto);
    assert.ok(/"ENAM\.CF" não é raiz do programa deste percurso \(raízes: BI, ENAM\)/.test(r.json.erro), r.json.erro);
    assert.equal(R.Escopos.porSlug(pid, SLUG), undefined, 'a recusa desfaz tudo (transação)');
    r = await importar({ ...REGRA, regras_por_raiz: { ENAM: { ...ENAM, fonte: '' } } }, { programa: PROGRAMA });
    assert.deepEqual([r.st, /regras_por_raiz\.ENAM: informe a "fonte"/.test(r.json.erro)], [400, true], r.texto);
    r = await importar({ ...REGRA, regras_por_raiz: { ENAM: { ...ENAM, cortes_adicionais: [{ rotulo: 'x' }] } } }, { programa: PROGRAMA });
    assert.deepEqual([r.st, /sem min_pct nem min_pontos/.test(r.json.erro)], [400, true], r.texto);
    r = await importar(REGRA, { programa: PROGRAMA,
      competencias: [['kI', 'I'], ['kc', 'Constitucional'], ['ka', 'Administrativo']].map(([codigo, n]) => ({ codigo, resultado: `Diante de um caso de ${n}, o aluno aplica a regra e justifica a resposta.` })),
      vinculos: [['BI.1', 'kI'], ['ENAM.CF.1', 'kc'], ['ENAM.ADM.1', 'ka']].map(([item, competencia]) => ({ item, competencia, justificativa: 'O item é a própria regra.' })),
      // bloco I: 1–6 (só pela competência); ENAM: 7–10 de Constitucional e 11–13 de Administrativo, presas ao ITEM do ENAM
      // E ao item equivalente do bloco I — como as 480 do importar-provas do curso C (ENAM.CF.11 + CF.19)
      questoes: [1, 2, 3, 4, 5, 6].map(i => Q(i, { competencias: ['kI'], bloco: 'I', disciplina: 'Direito do Bloco I' }))
        .concat([7, 8, 9, 10].map(i => Q(i, { bloco: 'ENAM', disciplina: 'Direito Constitucional', itens: [{ codigo: 'ENAM.CF.1', justificativa: 'Questão do ENAM.' }, { codigo: 'BI.1', justificativa: 'Equivalente do TJ.' }] })))
        .concat([11, 12, 13].map(i => Q(i, { bloco: 'ENAM', disciplina: 'Direito Administrativo', itens: [{ codigo: 'ENAM.ADM.1', justificativa: 'Questão do ENAM.' }, { codigo: 'BI.1', justificativa: 'Equivalente do TJ.' }] }))) });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(R.Escopos.porSlug(pid, SLUG).regra_pontuacao, REGRA, 'a regra fica gravada como veio, com a da raiz dentro');
    r = await chave('POST', '/staff/api/academy/estudo/status', E({ escopo: SLUG, status: 'publicado', questoes: 'disponivel' }));
    assert.equal(r.st, 200, r.texto);
    assert.equal((await req('POST', '/academy/api/signup', { corpo: ALU, jar: 'rui-r' })).st, 200);
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${pid}/matricular`, { jar: 'maria', corpo: { email: ALU.email } })).st, 200);
  });

  await t('regra por raiz (ADR-0016): o simulado do ENAM sai SÓ com questões da raiz, repartido por disciplina, corrigido pela regra dela — com as duas linhas de corte', async () => {
    const b = (await req('GET', `${esc()}/banco`, { jar: 'rui-r' })).json;
    assert.deepEqual(b.provas_por_raiz.map(x => [x.raiz, x.titulo, x.questoes, x.formato.questoes, x.formato.blocos.join('|')]), [['ENAM', 'Trilha ENAM', 7, 5, 'Direito Constitucional|Direito Administrativo']]);
    assert.equal(b.formato.blocos.join(','), 'I', 'o formato do percurso continua o da regra de cima');
    let r = await req('POST', `${esc()}/tentativas`, { jar: 'rui-r', corpo: { modo: 'simulado', n: 5, raiz: 'ENAM' } });
    assert.equal(r.st, 200, r.texto);
    const id = r.json.id, cong = JSON.parse(db.prepare('SELECT congelado FROM est_tentativas WHERE id = ?').get(id).congelado);
    assert.deepEqual([cong.raiz, cong.regra, cong.itens.map(i => i.bloco).join('|')], ['ENAM', ENAM, 'Direito Constitucional|Direito Constitucional|Direito Constitucional|Direito Administrativo|Direito Administrativo'], 'congela a regra do ENAM e o bloco é a disciplina, 3 + 2 na ordem do quadro');
    assert.deepEqual([r.json.sem_veredito, r.json.por_bloco.map(p => p.questoes)], [false, [3, 2]], 'no formato do ENAM: há veredito');
    // 3 de 5 certas: não atinge a linha geral (4), atinge a de cotista (3)
    const certas = r.json.questoes.slice(0, 3).map(q => [q.id, 'a']), erradas = r.json.questoes.slice(3).map(q => [q.id, 'b']);
    await req('PUT', `${esc()}/tentativas/${id}/respostas`, { jar: 'rui-r', corpo: { respostas: Object.fromEntries(certas.concat(erradas)) } });
    const res = (await req('POST', `${esc()}/tentativas/${id}/enviar`, { jar: 'rui-r' })).json.resultado;
    assert.deepEqual([res.nota_liquida, res.maximo, res.veredito, res.aprovado, res.raiz], [3, 5, 'nao_atingiu', false, 'ENAM']);
    assert.deepEqual(res.cortes.map(c => [c.rotulo, c.min_pontos, c.atingido]), [['ampla concorrência', 4, false], [ENAM.cortes_adicionais[0].rotulo, 3, true]]);
    assert.ok(!/autodeclar|cotista/i.test(db.prepare("SELECT GROUP_CONCAT(sql) s FROM sqlite_master WHERE name LIKE 'est_%'").get().s), 'nenhum campo de dado sensível (forma de concorrer) foi criado');
  });

  await t('regra por raiz (ADR-0016): sem raiz pedida o simulado segue a regra do percurso (sem questão do ENAM); recorte só do ENAM é corrigido pela regra dele; raiz desconhecida é 400', async () => {
    let r = await req('POST', `${esc()}/tentativas`, { jar: 'rui-r', corpo: { modo: 'simulado', n: 4 } });
    assert.equal(r.st, 200, r.texto);
    let cong = JSON.parse(db.prepare('SELECT congelado FROM est_tentativas WHERE id = ?').get(r.json.id).congelado);
    assert.deepEqual([cong.raiz, cong.regra, cong.itens.map(i => i.bloco).join('')], [undefined, REGRA, 'IIII'], 'regra de cima, quatro do bloco I');
    await req('PUT', `${esc()}/tentativas/${r.json.id}/respostas`, { jar: 'rui-r', corpo: { respostas: Object.fromEntries(r.json.questoes.map(q => [q.id, 'a'])) } });
    let res = (await req('POST', `${esc()}/tentativas/${r.json.id}/enviar`, { jar: 'rui-r' })).json.resultado;
    assert.deepEqual([res.nota_liquida, res.veredito, 'cortes' in res && res.cortes !== undefined], [0.4, 'atingiu', false], 'percurso: nada muda');
    // TREINO com matéria do ENAM: a prova saiu só da raiz ENAM → regra do ENAM (nota de 1 por acerto), sem veredito (treino)
    r = await req('POST', `${esc()}/tentativas`, { jar: 'rui-r', corpo: { modo: 'treino', n: 3, competencias: ['kc'] } });
    assert.equal(r.st, 200, r.texto);
    cong = JSON.parse(db.prepare('SELECT congelado FROM est_tentativas WHERE id = ?').get(r.json.id).congelado);
    assert.deepEqual([cong.raiz, cong.regra === null ? null : cong.regra.fonte], ['ENAM', ENAM.fonte]);
    await req('PUT', `${esc()}/tentativas/${r.json.id}/respostas`, { jar: 'rui-r', corpo: { respostas: Object.fromEntries(r.json.questoes.map(q => [q.id, 'a'])) } });
    res = (await req('POST', `${esc()}/tentativas/${r.json.id}/enviar`, { jar: 'rui-r' })).json.resultado;
    assert.deepEqual([res.nota_liquida, res.veredito, res.cortes], [3, 'fora_do_formato', undefined], 'treino: nota pela regra do ENAM, sem veredito e sem linhas de corte');
    // treino da matéria do bloco I: as do ENAM também cobrem o BI.1 e entram — prova MISTA fica na regra do percurso
    r = await req('POST', `${esc()}/tentativas`, { jar: 'rui-r', corpo: { modo: 'treino', n: 13, competencias: ['kI'] } });
    cong = JSON.parse(db.prepare('SELECT congelado FROM est_tentativas WHERE id = ?').get(r.json.id).congelado);
    assert.deepEqual([r.st, cong.itens.length, cong.raiz, cong.regra.fonte], [200, 13, undefined, REGRA.fonte], r.texto);
    await req('POST', `${esc()}/tentativas/${r.json.id}/enviar`, { jar: 'rui-r' });
    r = await req('POST', `${esc()}/tentativas`, { jar: 'rui-r', corpo: { modo: 'simulado', n: 5, raiz: 'BI' } });
    assert.deepEqual([r.st, /"BI" não é uma prova com regra própria/.test(r.json.erro)], [400, true], r.texto);
    // faltou questão de uma disciplina do quadro: avisa pelo nome da disciplina
    r = await req('POST', `${esc()}/tentativas`, { jar: 'rui-r', corpo: { modo: 'simulado', n: 10, raiz: 'ENAM' } });
    assert.equal(r.st, 409, r.texto);
    assert.ok(/no bloco Direito Constitucional há 4 questão\(ões\) elegível\(is\) para 6 pedida\(s\)/.test(r.json.erro), r.json.erro);
    assert.ok(eid());
  });

  await t('regra por raiz (ADR-0016): a tela — seletor de prova com regra própria, a regra escrita com as duas linhas, o resultado com as duas linhas de corte', async () => {
    const tela = ler('app-estudo.js');
    for (const pedaco of ['id="es-pv-raiz"', 'b.provas_por_raiz', "raiz: el('es-pv-raiz')", 'r.cortes_adicionais', 'Linhas de corte desta prova', 'r.rotulo_geral']) assert.ok(tela.includes(pedaco), 'falta na tela: ' + pedaco);
    assert.ok(/estude: (1[2-9]|[2-9][0-9]),/.test(ler('paginas.js')), 'estude.js sobe para v=12 (ou depois)');
  });
}

module.exports = { rodar };
