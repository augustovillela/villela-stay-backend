// =====================================================================
// Villela Academy — ESTUDO · MÉDIA PONDERADA E BLOCO POR PERCURSO (ADR-0019, 01/11/2026).
// O edital do TRF-3 (Ed. 1/2026, cap. 10) normaliza cada prova para 0–10 e só então pondera (peso 1 em Gerais, 2 em
// Específicos). E as 24 de Gerais moram no percurso irmão: a questão é uma linha só, compartilhada com outros cursos,
// então o bloco não pode morar nela. Aqui o motor puro, com os números do edital, e um simulado de 60 de ponta a ponta.
// =====================================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const CG = 'Conhecimentos Gerais', CE = 'Conhecimentos Específicos';

async function rodar({ t, req }) {
  const { db } = require('../db');
  const R = require('./repo');
  const pontuacao = require('./pontuacao');
  const calculadora = require('./calculadora');
  const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  console.log('\n— estudo/média ponderada e bloco por percurso (ADR-0019): o simulado do TRF-3 no formato do edital —');
  const PROD = 'maria@t.com', S_CG = 'mp-gerais', S_AJ = 'mp-analista', S_OJ = 'mp-oficial';
  const ALU = { nome: 'Lia da Média', email: 'lia.media@t.com', senha: 'senha-forte-lia', aceite_termos: true };
  const COTA = 'pessoas negras ou pardas, indígenas, quilombolas e/ou com deficiência';
  const regraTRF = (proprio) => ({
    modo: 'media_ponderada', escala: 10, pesos: { [CG]: 1, [CE]: 2 }, valor_certa: 1,
    formato: { questoes: 60, blocos: { [CG]: 24, [CE]: 36 } },
    bloco_por: 'escopo', blocos_escopos: { [CG]: S_CG, [CE]: proprio },
    minimos: [{ bloco: CG, min_pontos: 12 }, { bloco: CE, min_pontos: 18 }],
    aprovacao: { min_nota: 6, rotulo: 'ampla concorrência' },
    cortes_adicionais: [{ rotulo: COTA, min_nota: 4.8, minimos: [{ bloco: CG, min_pontos: 10 }, { bloco: CE, min_pontos: 15 }] }],
    fonte: 'Edital de teste, itens 10.2, 10.3 e 10.4.1',
  });
  const SEM_ESCOPO = () => { const r = regraTRF('x'); delete r.bloco_por; delete r.blocos_escopos; return r; };
  // a prova de mentira: g acertos em 24 de Gerais, e em 36 de Específicos
  const prova = (g, e) => {
    const itens = [], resp = {};
    for (let i = 0; i < 24; i++) { itens.push({ id: 'g' + i, gabarito: 'a', bloco: CG }); resp['g' + i] = i < g ? 'a' : 'b'; }
    for (let i = 0; i < 36; i++) { itens.push({ id: 'e' + i, gabarito: 'a', bloco: CE }); resp['e' + i] = i < e ? 'a' : 'b'; }
    return { itens, resp };
  };
  const nota = (g, e) => { const p = prova(g, e); return pontuacao.corrigir(p.itens, p.resp, SEM_ESCOPO()); };
  const duas = (n) => Math.round(n * 100) / 100;

  await t('média ponderada (ADR-0019): os casos do edital — 12+18 = 5,00 eliminado; 12+24 e 20+18 passam; cota 10+15 = 4,17 não passa', async () => {
    let r = nota(12, 18);
    assert.deepEqual([r.nota_liquida, r.maximo, r.aprovado, r.minimos.map(m => m.atendido)], [5, 10, false, [true, true]], 'os dois mínimos atendidos e, ainda assim, eliminado pela média');
    assert.deepEqual(r.cortes.map(c => [c.rotulo, c.atingido]), [['ampla concorrência', false], [COTA, true]], '5,00 passa na linha da cota (mínimos 10 e 15, média 4,80)');
    // ⚠️ 12+24 e 20+18 são os pontos INTEIROS de equilíbrio, e dão 6,11, não 6,00: exatos 6,00 exigiriam 3G + 4E = 129,6 (10.2)
    r = nota(12, 24);
    assert.deepEqual([duas(r.nota_liquida), r.aprovado], [6.11, true], '12+24');
    r = nota(20, 18);
    assert.deepEqual([duas(r.nota_liquida), r.aprovado], [6.11, true], '20+18');
    // um acerto a menos em cada caso já não passa: é por isso que aqueles são os pontos de equilíbrio
    r = nota(12, 23);
    assert.deepEqual([duas(r.nota_liquida), r.aprovado], [5.93, false], '12+23');
    r = nota(19, 18);
    assert.deepEqual([duas(r.nota_liquida), r.aprovado], [5.97, false], '19+18');
    r = nota(10, 15);
    assert.deepEqual([duas(r.nota_liquida), r.aprovado], [4.17, false], '10+15');
    assert.deepEqual(r.cortes.map(c => c.atingido), [false, false], '10+15 atende aos mínimos da cota e cai na média de 4,80');
    r = nota(11, 16);
    assert.deepEqual([duas(r.nota_liquida), r.cortes[1].atingido], [4.49, false], 'mínimos da cota atendidos, média 4,49');
    // a linha da cota usa os mínimos DELA: fora dos 12 da geral, passa
    r = nota(11, 21);
    assert.deepEqual([duas(r.nota_liquida), r.aprovado, r.cortes[1].atingido, r.cortes[1].minimos.map(m => m.atendido)], [5.42, false, true, [true, true]], '11+21');
    r = nota(9, 36);
    assert.deepEqual([r.cortes[1].atingido, r.cortes[1].minimos[0].atendido], [false, false], 'nota boa não supre o mínimo do bloco, nem na cota');
    // normaliza ANTES de ponderar: é aqui que a soma de pontos erraria
    r = nota(24, 0);
    assert.equal(duas(r.nota_liquida), 3.33);
    assert.deepEqual(r.media_ponderada.blocos, [{ bloco: CG, peso: 1, nota: 10 }, { bloco: CE, peso: 2, nota: 0 }]);
    assert.equal(nota(24, 36).nota_liquida, 10);
    assert.equal(nota(0, 0).nota_liquida, 0);
  });

  await t('média ponderada (ADR-0019): é genérica (escala, três blocos, peso de item, anulada) e não muda a regra de soma', async () => {
    const regra = { modo: 'media_ponderada', escala: 100, pesos: { A: 3, B: 1, C: 1 }, anulada: 'excluida', aprovacao: { min_nota: 50 }, fonte: 'f' };
    const itens = [{ id: '1', gabarito: 'a', bloco: 'A' }, { id: '2', gabarito: 'a', bloco: 'A', peso: 3 }, { id: '3', gabarito: 'a', bloco: 'B' }, { id: '4', gabarito: 'a', bloco: 'C' }, { id: '5', bloco: 'C', anulada: true }];
    const r = pontuacao.corrigir(itens, { 1: 'a', 2: 'b', 3: 'a', 4: 'b' }, regra);
    assert.deepEqual([r.media_ponderada.blocos.map(b => b.nota), r.nota_liquida, r.maximo, r.pct_liquido, r.aprovado], [[25, 100, 0], 35, 100, 35, false], 'A = 1 de 4 pontos; B = 100; C = 0, com a anulada fora do denominador; (75+100+0)/5');
    // bloco ponderado sem questão (ou só com anulada excluída): nota do que há, sem veredito
    const curta = pontuacao.corrigir([{ id: '1', gabarito: 'a', bloco: 'A' }], { 1: 'a' }, regra);
    assert.deepEqual([curta.nota_liquida, curta.aprovado, curta.media_ponderada.ausentes], [100, null, ['B', 'C']]);
    assert.deepEqual(pontuacao.corrigir([{ id: '1', bloco: 'B', anulada: true }], {}, regra).media_ponderada.ausentes, ['A', 'B', 'C']);
    assert.ok(/não tem questão nesta prova/.test(pontuacao.formatoDaProva([{ id: '1', bloco: 'A' }], regra).motivos.join()), 'fora do formato');
    assert.ok(/não é bloco da regra/.test(pontuacao.formatoDaProva([{ id: '1', bloco: 'A' }, { id: '2', bloco: 'B' }, { id: '3', bloco: 'C' }, { id: '4', bloco: 'Z' }], regra).motivos.join()));
    assert.equal(pontuacao.formatoDaProva([{ id: '1', bloco: 'A' }, { id: '2', bloco: 'B' }, { id: '3', bloco: 'C' }], regra).ok, true);
    // a regra de soma não ganha campo nenhum
    const soma = { valor_certa: 1, aprovacao: { min_pontos: 1 }, fonte: 'f' };
    const rs = pontuacao.corrigir([{ id: '1', gabarito: 'a' }], { 1: 'a' }, soma), ns = pontuacao.normalizarRegra(soma);
    assert.deepEqual(['media_ponderada' in rs, 'modo' in ns, 'pesos' in ns, 'blocos_escopos' in ns, 'min_nota' in ns.aprovacao, ns.bloco_por], [false, false, false, false, false, 'bloco']);
    for (const [torta, msg] of [
      [{ modo: 'outro' }, /modo deve ser/], [{ modo: 'media_ponderada' }, /exige pesos/], [{ modo: 'media_ponderada', pesos: {} }, /exige pesos/], [{ modo: 'media_ponderada', pesos: { A: 0 } }, /deve ser positivo/],
      [{ modo: 'media_ponderada', pesos: { A: 1 }, escala: -1 }, /escala deve ser positiva/], [{ modo: 'media_ponderada', pesos: { A: 1 }, desconto: { a_cada: 3 } }, /não aceita desconto/],
      [{ modo: 'media_ponderada', pesos: { A: 1 }, aprovacao: { min_pontos: 6 } }, /usa min_nota/], [{ modo: 'media_ponderada', pesos: { A: 1 }, aprovacao: { min_nota: 11 } }, /acima da escala/],
      [{ modo: 'media_ponderada', pesos: { A: 1 }, minimos: [{ bloco: 'Z', min_pontos: 1 }] }, /não está em pesos/],
      [{ modo: 'media_ponderada', pesos: { A: 1 }, aprovacao: { min_nota: 6 }, cortes_adicionais: [{ rotulo: 'x', min_pct: 50 }] }, /usa min_nota/],
      [{ modo: 'media_ponderada', pesos: { A: 1 }, aprovacao: { min_nota: 6 }, cortes_adicionais: [{ rotulo: 'x', min_nota: 5, minimos: [{ bloco: 'Z', min_pontos: 1 }] }] }, /não está em pesos/],
      [{ modo: 'media_ponderada', pesos: { A: 1 }, formato: { questoes: 2, blocos: { A: 1, B: 1 } } }, /formato e os de pesos/],
      [{ aprovacao: { min_nota: 6 } }, /só existe no modo media_ponderada/], [{ aprovacao: { min_pct: 6 }, cortes_adicionais: [{ rotulo: 'x', min_nota: 5 }] }, /só existe no modo media_ponderada/],
      [{ bloco_por: 'escopo' }, /exige blocos_escopos/], [{ bloco_por: 'escopo', blocos_escopos: { A: 'x' } }, /exige formato com os mesmos blocos/],
      [{ bloco_por: 'escopo', blocos_escopos: { A: 'x' }, formato: { questoes: 1, blocos: { B: 1 } } }, /exige formato com os mesmos blocos/],
      [{ bloco_por: 'escopo', blocos_escopos: { A: 'x', B: 'x' }, formato: { questoes: 2, blocos: { A: 1, B: 1 } } }, /em dois blocos/],
      [{ regras_por_raiz: { R: { bloco_por: 'escopo', blocos_escopos: { A: 'x' }, formato: { questoes: 1, blocos: { A: 1 } } } } }, /não pode ter bloco_por/]]) {
      assert.throws(() => pontuacao.normalizarRegra(torta), msg, JSON.stringify(torta));
    }
    // a calculadora é o mesmo motor: "faltam N acertos" para a média, e as duas linhas de corte
    const c = calculadora.calcular(SEM_ESCOPO(), [{ bloco: CG, questoes: 24, acertos: 12, erros: 12 }, { bloco: CE, questoes: 36, acertos: 18, erros: 18 }]);
    assert.deepEqual([c.nota_liquida, c.aprovado, c.geral.min_nota, c.geral.atingido, c.cortes.map(x => x.atingido)], [5, false, 6, false, [false, true]]);
    assert.ok(c.geral.faltam_acertos > 0 && c.geral.possivel);
  });

  let pid = '';
  const E = (extra = {}) => ({ produtor_email: PROD, produto_id: pid, ...extra });
  const chave = (m, rota, corpo) => req(m, rota, { semUser: true, chave: true, corpo });
  const esc = (slug) => `/academy/api/aluno/cursos/${pid}/estudo/${slug}`;
  const congelado = (id) => JSON.parse(db.prepare('SELECT congelado FROM est_tentativas WHERE id = ?').get(id).congelado);
  const ALTS = (i) => [{ texto: `certa ${i}`, correta: true, explicacao: 'Certa.' }, { texto: `errada ${i}a`, correta: false, explicacao: 'Errada.' }, { texto: `errada ${i}b`, correta: false, explicacao: 'Errada.' }];
  // `bloco` herdado de outro curso, de propósito: o bloco da regra NÃO vem deste campo
  const Q = (i, comp, extra) => ({ tipo: 'objetiva', origem: 'autoral', enunciado: `Média, questão ${i}: qual é a regra aplicável ao ponto?`, alternativas: ALTS(i), competencias: [comp], bloco: 'II', ...extra });
  const percurso = (slug, raiz, comp, questoes, regra) => ({ escopo: { slug, tipo: 'edital', titulo: 'Percurso ' + slug, ...(regra ? { regra_pontuacao: regra } : {}) },
    programa: { documento: { nome: 'Edital de teste', tipo: 'edital' }, itens: [{ codigo: raiz, texto: 'Bloco ' + raiz }, { codigo: raiz + '.1', pai: raiz, texto: 'Ponto de ' + raiz }] },
    competencias: [{ codigo: comp, resultado: `Diante de um caso de ${raiz}, o aluno aplica a regra e justifica a resposta.` }],
    vinculos: [{ item: raiz + '.1', competencia: comp, justificativa: 'O item é a própria regra.' }], questoes });
  const faixa = (de, ate, comp) => Array.from({ length: ate - de + 1 }, (_, k) => Q(de + k, comp));
  // responde a prova: g certas em Gerais e e em Específicos, o resto errado
  const responder = async (slug, tent, g, e) => {
    const cong = congelado(tent.id), resp = {}, cont = { [CG]: 0, [CE]: 0 };
    for (const it of cong.itens) { const certa = cont[it.bloco] < (it.bloco === CG ? g : e); cont[it.bloco]++; resp[it.id] = certa ? 'a' : 'b'; }
    assert.equal((await req('PUT', `${esc(slug)}/tentativas/${tent.id}/respostas`, { jar: 'lia-m', corpo: { respostas: resp } })).st, 200);
    return (await req('POST', `${esc(slug)}/tentativas/${tent.id}/enviar`, { jar: 'lia-m' })).json.resultado;
  };
  const iniciar = (slug, corpo) => req('POST', `${esc(slug)}/tentativas`, { jar: 'lia-m', corpo });
  // 30 de Gerais; 40 do Analista, com 26 também no Oficial; a questão 1 de Gerais também é do Analista
  const G = () => faixa(1, 30, 'kg'), A = () => faixa(101, 140, 'ka'), O = () => faixa(115, 140, 'ko').concat(faixa(201, 214, 'ko'));

  await t('bloco por percurso (ADR-0019): a importação recusa percurso que não é do curso e grava a regra; nenhuma questão nasce em dobro', async () => {
    let r = await chave('POST', '/staff/api/academy/importar-curso', { produtor_email: PROD,
      produto: { titulo: 'Curso da Média Ponderada', tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Só o percurso' },
      modulos: [{ titulo: 'Comece por aqui', aulas: [{ titulo: 'Aula de orientação', tipo: 'texto', conteudo: 'O conteúdo está no Estude.' }] }] });
    assert.equal(r.st, 200, r.texto);
    pid = r.json.produto.id;
    r = await chave('POST', '/staff/api/academy/estudo/importar', E(percurso(S_CG, 'CG', 'kg', G())));
    assert.equal(r.st, 200, r.texto);
    // percurso de fora do curso (ou que nem existe): 400, e a recusa desfaz tudo
    r = await chave('POST', '/staff/api/academy/estudo/importar', E(percurso(S_AJ, 'AJ', 'ka', A().concat([Q(1, 'ka')]), { ...regraTRF(S_AJ), blocos_escopos: { [CG]: 'percurso-de-outro-curso', [CE]: S_AJ } })));
    assert.deepEqual([r.st, /"percurso-de-outro-curso" não é percurso deste curso/.test(r.json.erro)], [400, true], r.texto);
    assert.equal(R.Escopos.porSlug(pid, S_AJ), undefined);
    r = await chave('POST', '/staff/api/academy/estudo/importar', E(percurso(S_AJ, 'AJ', 'ka', A(), { ...regraTRF(S_AJ), blocos_escopos: { [CG]: S_CG, [CE]: S_OJ } })));
    assert.deepEqual([r.st, /o percurso "mp-analista" tem de ser um dos blocos/.test(r.json.erro)], [400, true], r.texto);
    // a questão 1 de Gerais também no Analista; 26 do Analista também no Oficial (uma linha só, pelo hash)
    r = await chave('POST', '/staff/api/academy/estudo/importar', E(percurso(S_AJ, 'AJ', 'ka', A().concat([Q(1, 'ka')]), regraTRF(S_AJ))));
    assert.equal(r.st, 200, r.texto);
    r = await chave('POST', '/staff/api/academy/estudo/importar', E(percurso(S_OJ, 'OJ', 'ko', O(), regraTRF(S_OJ))));
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(R.Escopos.porSlug(pid, S_AJ).regra_pontuacao, regraTRF(S_AJ), 'gravada como veio');
    assert.equal(db.prepare(`SELECT COUNT(DISTINCT q.id) n FROM est_questoes q JOIN est_questao_vinculos v ON v.questao_id = q.id JOIN est_escopos e ON e.id = v.escopo_id WHERE e.product_id = ?`).get(pid).n, 30 + 40 + 14, 'sem cópia: 30 + 40 + 14 próprias do Oficial');
    for (const slug of [S_AJ, S_OJ]) {
      r = await chave('POST', '/staff/api/academy/estudo/status', E({ escopo: slug, status: 'publicado', questoes: 'disponivel', questoes_compartilhadas: true }));
      assert.equal(r.st, 200, r.texto);
    }
    assert.equal((await req('POST', '/academy/api/signup', { corpo: ALU, jar: 'lia-m' })).st, 200);
    assert.equal((await req('POST', `/academy/api/produtor/produtos/${pid}/matricular`, { jar: 'maria', corpo: { email: ALU.email } })).st, 200);
  });

  await t('bloco por percurso (ADR-0019): com Gerais fora do ar, a falta é dita (409), nunca preenchida; publicado, o simulado sai com 24 + 36', async () => {
    // Gerais em rascunho: só a questão 1, que o lote do Analista publicou, é do Analista. Do bloco de Gerais não vem nada
    let r = await iniciar(S_AJ, { modo: 'simulado', n: 60 });
    assert.equal(r.st, 409, r.texto);
    assert.ok(/no bloco Conhecimentos Gerais há 0 questão\(ões\) elegível\(is\) para 24 pedida\(s\)/.test(r.json.erro), r.json.erro);
    r = await chave('POST', '/staff/api/academy/estudo/status', E({ escopo: S_CG, status: 'publicado', questoes: 'disponivel', questoes_compartilhadas: true }));
    assert.equal(r.st, 200, r.texto);
    const b = (await req('GET', `${esc(S_AJ)}/banco`, { jar: 'lia-m' })).json;
    assert.deepEqual([b.formato.questoes, b.formato.blocos, b.formato.exemplo.map(x => x.questoes)], [60, [CG, CE], [24, 36]]);
    assert.equal(b.total, 41, 'o banco do percurso continua o do percurso: 40 + a compartilhada, sem as de Gerais');
    r = await iniciar(S_AJ, { modo: 'simulado', n: 60 });
    assert.equal(r.st, 200, r.texto);
    const tentId = r.json.id, cong = congelado(tentId), ids = cong.itens.map(i => i.id);
    assert.equal(new Set(ids).size, 60, 'nenhuma questão repetida');
    assert.deepEqual([cong.itens.filter(i => i.bloco === CG).length, cong.itens.filter(i => i.bloco === CE).length, r.json.sem_veredito], [24, 36, false], 'bloco casa com a regra, mesmo com o campo `bloco` das questões em "II"');
    assert.deepEqual([...new Set(cong.itens.map(i => i.bloco))], [CG, CE], 'na ordem do edital');
    const q1 = R.Questoes.doEscopo(R.Escopos.porSlug(pid, S_CG).id).find(q => q.enunciado.startsWith('Média, questão 1:'));
    assert.ok(cong.itens.every(i => (i.bloco === CG) === !!i.escopo_id), 'só a de Gerais leva o percurso de origem');
    assert.ok(q1 && !cong.itens.some(i => i.id === q1.id && i.bloco === CG), 'a questão dos dois percursos vale pelo próprio');
    // com a prova aberta, o Praticar de Gerais não entrega o gabarito das questões dela (nem por id, nem no sorteio)
    const umaCG = cong.itens.find(i => i.bloco === CG).id;
    r = await req('POST', `${esc(S_CG)}/questoes/${umaCG}/responder`, { jar: 'lia-m', corpo: { resposta: 'a' } });
    assert.equal(r.st, 409, r.texto);
    r = await req('GET', `${esc(S_CG)}/praticar?n=30`, { jar: 'lia-m' });
    assert.equal(r.st, 200, r.texto);
    assert.ok(Array.isArray(r.json.questoes) && !r.json.questoes.some(q => cong.itens.some(i => i.bloco === CG && i.id === q.id)), 'questão da prova aberta fora do Praticar');
    // e o simulado de OUTRO percurso não sorteia o que esta prova ainda vai cobrar
    r = await iniciar(S_OJ, { modo: 'simulado', n: 60, aceitar_menos: true });
    assert.equal(r.st, 200, r.texto);
    const doOficial = congelado(r.json.id).itens.map(i => i.id);
    assert.ok(!doOficial.some(id => ids.includes(id)), 'nenhuma questão em duas provas abertas');
    await req('POST', `${esc(S_OJ)}/tentativas/${r.json.id}/enviar`, { jar: 'lia-m' });
    // a nota: 12 + 18 (os dois mínimos) = 5,00 e eliminado; as duas linhas de corte lado a lado
    const res = await responder(S_AJ, { id: tentId }, 12, 18);
    assert.deepEqual([res.nota_liquida, res.maximo, res.veredito, res.aprovado, res.no_formato], [5, 10, 'nao_atingiu', false, true]);
    assert.deepEqual(res.cortes.map(c => [c.rotulo, c.min_nota, c.atingido]), [['ampla concorrência', 6, false], [COTA, 4.8, true]]);
    assert.deepEqual(res.por_bloco.map(p => [p.bloco, p.certas, p.peso, p.nota]), [[CG, 12, 1, 5], [CE, 18, 2, 5]]);
    assert.ok(!/autodeclar|cotista|forma_de_concorrer/i.test(db.prepare("SELECT GROUP_CONCAT(sql) s FROM sqlite_master WHERE name LIKE 'est_%'").get().s), 'nenhum campo sobre como o aluno concorre');
    // a evidência mora no percurso de onde a questão veio: o erro de Gerais vai ao caderno de Gerais, não ao do Analista
    const uid = db.prepare('SELECT id FROM users WHERE email = ?').get(ALU.email).id;
    const nEv = (slug) => db.prepare(`SELECT COUNT(DISTINCT ref_id) n FROM est_evidencias WHERE user_id = ? AND escopo_id = ? AND tentativa_id = ?`).get(uid, R.Escopos.porSlug(pid, slug).id, tentId).n;
    assert.deepEqual([nEv(S_CG), nEv(S_AJ)], [24, 36]);
  });

  await t('bloco por percurso (ADR-0019): 12+24 atinge; o Oficial usa as mesmas de Gerais; treino e recorte ficam no próprio percurso, sem veredito', async () => {
    let r = await iniciar(S_AJ, { modo: 'simulado', n: 60 });
    assert.equal(r.st, 200, r.texto);
    let res = await responder(S_AJ, r.json, 12, 24);
    assert.deepEqual([duas(res.nota_liquida), res.veredito, res.cortes.map(c => c.atingido)], [6.11, 'atingiu', [true, true]]);
    r = await iniciar(S_OJ, { modo: 'simulado', n: 60 });
    assert.equal(r.st, 200, r.texto);
    const cong = congelado(r.json.id);
    assert.deepEqual([cong.itens.filter(i => i.bloco === CG).length, cong.itens.filter(i => i.bloco === CE).length], [24, 36]);
    res = await responder(S_OJ, r.json, 10, 15);
    assert.deepEqual([duas(res.nota_liquida), res.veredito, res.cortes.map(c => c.atingido)], [4.17, 'nao_atingiu', [false, false]]);
    // treino: só do próprio percurso, nota da média do que há, sem veredito nem linhas de corte
    r = await iniciar(S_AJ, { modo: 'treino', n: 5 });
    assert.equal(r.st, 200, r.texto);
    let c2 = congelado(r.json.id);
    assert.deepEqual([c2.itens.every(i => i.bloco === CE && !i.escopo_id), r.json.sem_veredito], [true, true]);
    await req('PUT', `${esc(S_AJ)}/tentativas/${r.json.id}/respostas`, { jar: 'lia-m', corpo: { respostas: Object.fromEntries(c2.itens.map(i => [i.id, 'a'])) } });
    res = (await req('POST', `${esc(S_AJ)}/tentativas/${r.json.id}/enviar`, { jar: 'lia-m' })).json.resultado;
    assert.deepEqual([res.nota_liquida, res.veredito, res.aprovado, res.cortes], [10, 'fora_do_formato', null, undefined]);
    // simulado de uma matéria é recorte do próprio percurso
    r = await iniciar(S_AJ, { modo: 'simulado', n: 5, competencias: ['ka'] });
    assert.equal(r.st, 200, r.texto);
    c2 = congelado(r.json.id);
    assert.deepEqual([c2.itens.every(i => !i.escopo_id), r.json.sem_veredito], [true, true]);
    await req('POST', `${esc(S_AJ)}/tentativas/${r.json.id}/enviar`, { jar: 'lia-m' });
    // o percurso de Gerais sozinho, sem esta regra, não muda: treina e simula o que é dele
    r = await iniciar(S_CG, { modo: 'treino', n: 3 });
    assert.equal(r.st, 200, r.texto);
    await req('POST', `${esc(S_CG)}/tentativas/${r.json.id}/enviar`, { jar: 'lia-m' });
  });

  await t('média ponderada (ADR-0019): a tela escreve a regra, a média com as notas por bloco e as linhas de corte com os mínimos de cada uma', async () => {
    const tela = ler('app-estudo.js');
    for (const pedaco of ["r.modo === 'media_ponderada'", 'média mínima de', 'function nota2', 'function corteTxt', 'Média ponderada', 'Nota (peso)', "r.bloco_por === 'escopo'", 'r.cortes.map(linhaDeCorte)']) assert.ok(tela.includes(pedaco), 'falta na tela: ' + pedaco);
    assert.ok(/estude: 15,/.test(ler('paginas.js')), 'estude.js?v=15');
  });
}

module.exports = { rodar };
