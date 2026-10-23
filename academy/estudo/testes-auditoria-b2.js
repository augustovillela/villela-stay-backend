// =====================================================================
// Villela Academy — ESTUDO · testes da RÉPLICA de 11/10/2026 (noite):
// docs\estudo\auditoria-2026-10-11-b\r-replica-regressao.md — os "não
// corrigidos" e "parciais" que são código, e os achados novos (5 médios e
// 12 baixos). Chamado pelo selftest (npm run test:academy) logo depois de
// testes-auditoria-b, ANTES de a carteira de IA ligar a cobrança (o teste
// do R4-2, que precisa dela ligada, mora em testes-carteira-ia.js).
// Cada teste leva no nome o código do achado. O que é tela (app-*.js) é
// conferido no fonte e, onde dá, a função é tirada do fonte e EXECUTADA
// num `vm` com uma página de mentira.
// =====================================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function rodar({ t, req }) {
  const { db } = require('../db');
  const repo = require('../repo');
  const ct = require('../repo-conteudo');
  const R = require('./repo');
  const A = require('./aluno');
  const J = require('./jornada-estude');
  const banco = require('./banco');
  const pontuacao = require('./pontuacao');
  const plano = require('./plano');
  const motores = require('./motores-navegador');
  const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

  console.log('\n— estudo/réplica de 11/10/2026: motores em ES5, veredito pelo formato, rolagem que espera o conteúdo, duas abas, painel enxuto, piso do bloco do plano, degustação sem o mapa do curso e as baixas —');
  const PROD = 'maria@t.com', SLUG = 'replica-b2';
  let pid = '', pid2 = '', seq = 0;
  const chave = (m, rota, corpo) => req(m, rota, { semUser: true, chave: true, corpo });
  const esc = () => `/academy/api/aluno/cursos/${pid}/estudo/${SLUG}`;
  const eid = () => R.Escopos.porSlug(pid, SLUG).id;
  const uid = (email) => repo.Usuarios.porEmail(email).id;
  async function conta(nome, { matricular = true } = {}) {
    const n = ++seq, u = { nome, email: `repb2-${n}@t.com`, senha: 'senha-forte-repb2', aceite_termos: true }, jar = 'repb2-' + n;
    assert.equal((await req('POST', '/academy/api/signup', { corpo: u, jar, ip: '10.8.0.' + n })).st, 200);
    if (matricular) assert.equal((await req('POST', `/academy/api/produtor/produtos/${pid}/matricular`, { jar: 'maria', corpo: { email: u.email } })).st, 200);
    return { ...u, jar, id: uid(u.email) };
  }
  // ---- o que a tela faz, tirado do FONTE: a função `nome` de app-estudo.js, para rodar num vm ----
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
  const TELA = ler('app-estudo.js'), CSS = ler('estude.css');

  // regra com o MOLDE da do edital (mínimo por bloco 2 · 1 · 1 → proporção 50/25/25; mínimo geral 5)
  const REGRA = { valor_certa: 1, minimos: [{ bloco: 'I', min_pontos: 2 }, { bloco: 'II', min_pontos: 1 }, { bloco: 'III', min_pontos: 1 }], aprovacao: { min_pontos: 5 }, fonte: 'Edital de teste da réplica, item 10' };
  const ALTS = (i) => [
    { texto: `certa ${i}`, correta: true, explicacao: 'Certa: é a regra.' },
    { texto: `errada ${i}a`, correta: false, explicacao: 'Errada: é a exceção.' },
    { texto: `errada ${i}b`, correta: false, explicacao: 'Errada: é outro instituto.' }];
  // alternativas com a PONTUAÇÃO DE LISTA do caderno: ";" nas primeiras, "; e" na penúltima e "." na última
  const ALTS_LISTA = (i) => [
    { texto: `I e II, apenas (${i});`, correta: true, explicacao: 'Certa.' },
    { texto: `II, apenas (${i}); e`, correta: false, explicacao: 'Errada.' },
    { texto: `I, II e III (${i}).`, correta: false, explicacao: 'Errada.' }];
  const Q = (i, comp, bloco, extra = {}) => ({ tipo: 'objetiva', origem: 'autoral', enunciado: `Réplica B2, questão ${i}: qual é a regra aplicável ao ponto?`, alternativas: ALTS(i), competencias: [comp], bloco, ...extra });
  const idQ = (i) => db.prepare('SELECT id FROM est_questoes WHERE dados LIKE ?').get(`%Réplica B2, questão ${i}:%`).id;
  const DISC = [1, 2, 3], PONTOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const comp = (d, p) => `rb-${d}-${p}`;
  const UN = (d, p) => ({ codigo: `rb-aula-${d}-${p}`, titulo: `Aula ${d}.${p} — o instituto, a regra geral, as exceções e o que a banca costuma trocar`, competencias: [comp(d, p)], itens: [`1.${d}.${p}`], tempo_min: 55 + ((d * 7 + p * 13) % 40),
    blocos: [{ tipo: 'explicacao', texto: `Explicação da aula ${d}.${p}: a regra geral e a exceção que a banca troca.` },
      { tipo: 'pratica', titulo: 'Exercício', texto: `Exercício da aula ${d}.${p}: aplique a regra ao caso.`, solucao: `Solução da aula ${d}.${p}.` }] });

  await t('réplica: o percurso da bateria — 30 aulas em 3 disciplinas, 24 questões em 3 blocos (12 reservadas), 3 cards; curso com aula gratuita, quiz, prompts e extra com link', async () => {
    let r = await chave('POST', '/staff/api/academy/importar-curso', { produtor_email: PROD,
      produto: { titulo: 'Curso da Réplica B2', tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Percurso e degustação' },
      modulos: [{ titulo: 'Módulo A', aulas: [{ titulo: 'Aula A1', tipo: 'texto', conteudo: 'Aula de degustação.', gratuita: true }, { titulo: 'Aula A2', tipo: 'texto', conteudo: 'Aula de quem comprou.' }] }] });
    assert.equal(r.st, 200, r.texto);
    pid = r.json.produto.id;
    r = await chave('POST', '/staff/api/academy/estudo/importar', { produtor_email: PROD, produto_id: pid,
      escopo: { slug: SLUG, tipo: 'edital', titulo: 'Percurso da réplica', regra_pontuacao: REGRA },
      programa: { documento: { nome: 'Edital de teste', tipo: 'edital' }, itens: [{ codigo: '1', texto: 'Programa' }]
        .concat(...DISC.map(d => [{ codigo: `1.${d}`, texto: `Direito ${'ABC'[d - 1]}` }].concat(PONTOS.map(p => ({ codigo: `1.${d}.${p}`, texto: `Ponto ${d}.${p} do programa do edital` }))))) },
      competencias: DISC.flatMap(d => PONTOS.map(p => ({ codigo: comp(d, p), resultado: `Diante de um caso concreto do ponto ${d}.${p}, o aluno identifica o instituto, aplica a regra geral, reconhece a exceção e justifica a resposta com a norma e o entendimento do tribunal.` }))),
      vinculos: DISC.flatMap(d => PONTOS.map(p => ({ item: `1.${d}.${p}`, competencia: comp(d, p), justificativa: 'O item é a própria regra.' }))),
      unidades: DISC.flatMap(d => PONTOS.map(p => UN(d, p))),
      // bloco I: 1–6 do banco (1 e 2 com pontuação de lista; 3 com pontuação de lista E ordem fixa) e 7–12 reservadas;
      // bloco II: 13–15 do banco e 16–18 reservadas; bloco III: 19–21 e 22–24
      questoes: [Q(1, comp(1, 1), 'I', { alternativas: ALTS_LISTA(1) }), Q(2, comp(1, 1), 'I', { alternativas: ALTS_LISTA(2) }), Q(3, comp(1, 1), 'I', { alternativas: ALTS_LISTA(3), ordem_fixa: true })]
        .concat([4, 5, 6].map(i => Q(i, comp(1, 1), 'I')), [7, 8, 9, 10, 11, 12].map(i => Q(i, comp(1, 1), 'I', { uso: 'reservada' })),
          [13, 14, 15].map(i => Q(i, comp(2, 1), 'II')), [16, 17, 18].map(i => Q(i, comp(2, 1), 'II', { uso: 'reservada' })),
          [19, 20, 21].map(i => Q(i, comp(3, 1), 'III')), [22, 23, 24].map(i => Q(i, comp(3, 1), 'III', { uso: 'reservada' }))),
      cards: [1, 2, 3].map(i => ({ competencia: comp(1, 1), frente: `Card ${i} da réplica: qual é a regra?`, verso: `A regra ${i}.` })) });
    assert.equal(r.st, 200, r.texto);
    r = await chave('POST', '/staff/api/academy/estudo/status', { produtor_email: PROD, produto_id: pid, escopo: SLUG, status: 'publicado', unidades: 'publicado', cards: 'publicado', questoes: 'disponivel' });
    assert.equal(r.st, 200, r.texto);
    // a camada do curso: quiz na aula gratuita e na paga, um prompt, um extra com LINK
    const QUIZ = (tipo, certa = 1) => ({ tipo, enunciado: `Pergunta de ${tipo} sobre a aula`, alternativas: [0, 1, 2].map(k => ({ texto: `alternativa ${k}`, correta: k === certa, explicacao: k === certa ? 'Certa porque segue o método da aula.' : 'Errada porque ignora a revisão humana.' })) });
    r = await chave('POST', '/staff/api/academy/interativo/importar', { produtor_email: PROD, produto_id: pid,
      quizzes: [{ modulo_titulo: 'Módulo A', aula_titulo: 'Aula A1', questoes: [QUIZ('conhecimento')] }, { modulo_titulo: 'Módulo A', aula_titulo: 'Aula A2', questoes: [QUIZ('conhecimento'), QUIZ('aplicacao', 0), QUIZ('decisao', 2)] }],
      prompts: { itens: [{ categoria: 'Pesquisa', titulo: 'Conferir precedente', objetivo: 'Checar', prompt: 'Você é um revisor jurídico. Confira o precedente…', exemplo: 'ex', personalizar: 'troque a área' }] },
      extras: [{ titulo: 'Material de apoio', descricao: 'Planilha do curso.', status: 'disponivel', url: 'https://material-de-quem-comprou.test/planilha' }] });
    assert.equal(r.st, 200, r.texto);
    assert.equal((await chave('POST', '/staff/api/academy/interativo/status', { produtor_email: PROD, produto_id: pid, quizzes: 'publicado', prompts: 'publicado' })).st, 200);
    // um segundo curso, SEM aula gratuita
    r = await chave('POST', '/staff/api/academy/importar-curso', { produtor_email: PROD,
      produto: { titulo: 'Curso da Réplica B2 sem degustação', tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Sem aula gratuita' },
      modulos: [{ titulo: 'Módulo A', aulas: [{ titulo: 'Aula única', tipo: 'texto', conteudo: 'Só para quem comprou.' }] }] });
    assert.equal(r.st, 200, r.texto);
    pid2 = r.json.produto.id;
  });

  // ================= R3-B11 — os motores do navegador em ES5 =================
  await t('réplica R3-B11: o pacote /academy/estude-motores.js é ES5 — nenhum módulo tem sintaxe ou biblioteca de depois do ES5, e a tela não fala mais em "navegador mais recente"', async () => {
    // o verificador ENXERGA o que procura (senão "zero problemas" não provaria nada)
    const amostras = { 'função seta': 'var f = (b) => b;', 'const ou let': 'const a = 1;', 'texto com crase': 'var t = `x${a}`;', 'espalhamento ou resto (...)': 'var c = { ...b };',
      'for…of': 'for (var x of lista) {}', 'desestruturação em var': 'var { a, b } = o;', 'parâmetro com valor padrão ou desestruturado': 'function f(a = 1) {}', 'propriedade abreviada': 'var o = { a, b: 1 };',
      'Map, Set, Promise, Symbol, Proxy, Reflect': 'var m = new Map();', 'Object.entries/values/assign/fromEntries': 'Object.entries(o);', 'Number.isFinite/isInteger/isNaN…': 'Number.isFinite(n);',
      'método de lista ou de texto de depois do ES5': 'lista.includes(1); t.padStart(2, "0");' };
    for (const [regra, fonte] of Object.entries(amostras)) assert.ok(motores.problemasDeES5(fonte).some(p => p.regra === regra), `o verificador tem de acusar "${regra}" em: ${fonte}`);
    // …e não se confunde com o que está dentro de texto, de comentário ou de expressão regular
    assert.deepEqual(motores.problemasDeES5('var a = "const => `x` ..."; // let x = () => 1\nvar r = /=>|const/.test(a); /* class X {} */'), []);
    for (const m of motores.MODULOS) {
      const p = motores.problemasDeES5(fs.readFileSync(path.join(__dirname, m + '.js'), 'utf8'));
      assert.deepEqual(p, [], `estudo/${m}.js vai CRU ao navegador e tem de ser ES5: ${p.slice(0, 3).map(x => `${x.regra} (linha ${x.linha}: ${x.trecho})`).join(' | ')}`);
    }
    const pacote = motores.pacote();
    assert.deepEqual(motores.problemasDeES5(pacote), [], 'o pacote inteiro, com o carregador');
    assert.ok(/window\.EstudeMotores = \{ pontuacao: /.test(pacote));
    const r = await req('GET', '/academy/estude-motores.js');
    assert.equal(r.st, 200); assert.equal(r.texto, pacote, 'a rota serve o mesmo pacote');
    // a tela: sem aviso de navegador não suportado, e pedindo a versão nova do arquivo
    assert.ok(!/navegador mais recente|Chrome ou Edge 79|Atualize o navegador/.test(TELA), 'a tela não avisa mais "navegador não suportado" para as ferramentas');
    assert.ok(/estude-motores\.js\?v=3/.test(TELA));
  });

  await t('réplica R3-B11: o pacote RODA num ambiente sem nada de depois do ES5 (sem Map, Set, Object.entries, includes, padStart…) e dá os MESMOS resultados dos módulos do servidor em casos reais', async () => {
    const ctx = vm.createContext({});
    vm.runInContext(`var window = this;
      ['Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'Proxy', 'Reflect'].forEach(function (n) { delete window[n]; });
      ['entries', 'values', 'assign', 'fromEntries', 'is'].forEach(function (n) { delete Object[n]; });
      delete Array.from; delete Array.of;
      ['isFinite', 'isInteger', 'isNaN', 'isSafeInteger', 'parseFloat', 'parseInt'].forEach(function (n) { delete Number[n]; });
      ['includes', 'find', 'findIndex', 'findLast', 'findLastIndex', 'fill', 'flat', 'flatMap', 'copyWithin', 'entries', 'keys', 'values', 'at'].forEach(function (n) { delete Array.prototype[n]; });
      ['includes', 'padStart', 'padEnd', 'startsWith', 'endsWith', 'repeat', 'at', 'matchAll', 'replaceAll', 'trimStart', 'trimEnd', 'codePointAt', 'normalize'].forEach(function (n) { delete String.prototype[n]; });`, ctx);
    assert.equal(vm.runInContext('typeof Map + typeof Object.entries + typeof [].includes + typeof "".padStart', ctx), 'undefinedundefinedundefinedundefined', 'o ambiente de teste é mesmo ES5');
    vm.runInContext(motores.pacote(), ctx);
    const noNavegador = (expr, ...args) => JSON.parse(vm.runInContext(`JSON.stringify(window.EstudeMotores.${expr}(${args.map(a => JSON.stringify(a === undefined ? null : a)).join(', ')}))`, ctx));
    const igual = (expr, fn, ...args) => assert.deepEqual(noNavegador(expr, ...args), JSON.parse(JSON.stringify(fn(...args))), expr);
    const calculadora = require('./calculadora'), prazo = require('./prazo'), cronograma = require('./cronograma');
    // a regra do edital da magistratura do trabalho: 0,1 por acerto; mínimos 1,2 · 0,9 · 0,9; mínimo geral 6,0
    const EDITAL = { valor_certa: 0.1, minimos: [{ bloco: 'I', min_pontos: 1.2 }, { bloco: 'II', min_pontos: 0.9 }, { bloco: 'III', min_pontos: 0.9 }], aprovacao: { min_pontos: 6 }, fonte: 'edital' };
    for (const blocos of [[{ bloco: 'I', questoes: 40, acertos: 30, erros: 10 }, { bloco: 'II', questoes: 30, acertos: 8, erros: 20 }, { bloco: 'III', questoes: 30, acertos: 20, erros: 5 }],
      [{ bloco: 'I', questoes: 4, acertos: 4, erros: 0 }, { bloco: 'II', questoes: 3, acertos: 3, erros: 0 }, { bloco: 'III', questoes: 3, acertos: 3, erros: 0 }],
      [{ bloco: 'I', questoes: 40, acertos: 30, erros: 0 }]]) igual('calculadora.calcular', calculadora.calcular, EDITAL, blocos);
    igual('calculadora.calcular', calculadora.calcular, calculadora.regraInformada({ blocos: [{ bloco: 'A', minimo: 3 }], minimo_geral: 6, desconto_a_cada: 2 }), [{ bloco: 'A', questoes: 10, acertos: 5, erros: 4 }]);
    igual('pontuacao.formatoDaProva', pontuacao.formatoDaProva, Array.from({ length: 10 }, (_, i) => ({ id: 'q' + i, gabarito: 'a', bloco: i < 4 ? 'I' : i < 7 ? 'II' : 'III' })), EDITAL);
    // 15 dias úteis de 11/10/2026 = 03/11/2026 (a conta que a auditoria conferiu na tela)
    assert.equal(noNavegador('prazo.contar', { inicio: '2026-10-11', dias: 15, modo: 'uteis' }).vencimento, '2026-11-03');
    for (const e of [{ inicio: '2026-10-11', dias: 15, modo: 'uteis' }, { inicio: '2026-12-18', dias: 30, modo: 'corridos', comeco_em_dia_util: true, extras: [{ data: '2026-12-24', nome: 'recesso' }, '2026-12-31'] }, { inicio: '2027-02-05', dias: 5, modo: 'uteis', facultativos: false }]) igual('prazo.contar', prazo.contar, e);
    igual('prazo.lerDatas', prazo.lerDatas, '20/12/2026 a 06/01/2027 - recesso forense\n2026-11-30 — dia do evangélico\nbobagem');
    const aulas = DISC.flatMap(d => PONTOS.map(p => ({ codigo: `a-${d}-${p}`, titulo: `Aula ${d}.${p}`, disciplina: `1.${d}`, disciplina_nome: `Direito ${d}`, tempo_min: 55 + ((d * 7 + p * 13) % 40) })));
    const base = { hoje: '2026-10-12', data_alvo: '2026-12-13', disponibilidade: { seg: 120, ter: 120, qua: 90, qui: 120, sex: 60, sab: 240 }, vespera_dias: 5, revisao_geral_dias: 15, foco: 'objetiva', aulas };
    for (const nivel of [100, 50, 10]) igual('cronograma.montar', cronograma.montar, { ...base, nivel });
    igual('cronograma.montar', cronograma.montar, { ...base, data_alvo: '2026-10-25', nivel: 100 }); // não cabe: a sugestão de nível sai do mesmo motor
    igual('plano.planejar', plano.planejar, { hoje: '2026-10-12', data_alvo: '', disponibilidade: [0, 60, 60, 60, 60, 60, 0], itens: aulas.map((a, i) => ({ codigo: a.codigo, ordem: i, peso: i % 3, esforco_min: [a.tempo_min, a.tempo_min + 20], depende_de: i ? [aulas[i - 1].codigo] : [] })) });
  });

  // ================= M1 — o veredito exige o FORMATO da regra =================
  await t('réplica M1: veredito e certificado só com a prova no FORMATO da regra — 60, 100, 150 e 200 questões, com e sem `formato` cadastrado; nunca em prova maior ou menor que o formato', async () => {
    const EDITAL = { valor_certa: 0.1, minimos: [{ bloco: 'I', min_pontos: 1.2 }, { bloco: 'II', min_pontos: 0.9 }, { bloco: 'III', min_pontos: 0.9 }], aprovacao: { min_pontos: 6 }, fonte: 'edital' };
    const COM = { ...EDITAL, formato: { questoes: 100, blocos: { I: 40, II: 30, III: 30 } } };
    const prova = (i, ii, iii) => [['I', i], ['II', ii], ['III', iii]].flatMap(([b, n]) => Array.from({ length: n }, (_, k) => ({ id: `${b}-${k}`, gabarito: 'a', bloco: b })));
    const f = (itens, regra) => pontuacao.formatoDaProva(itens, regra);
    // ---- COM formato: só a prova de 100, 40/30/30
    assert.equal(f(prova(40, 30, 30), COM).ok, true, '100 questões, 40/30/30: é o formato');
    for (const [i, ii, iii] of [[24, 18, 18], [60, 45, 45], [80, 60, 60]]) {
      const r = f(prova(i, ii, iii), COM), n = i + ii + iii;
      assert.equal(r.ok, false, `${n} questões com formato cadastrado de 100: fora do formato`);
      assert.ok(r.motivos.includes(`a prova tem ${n} questões; a do edital tem 100`), r.motivos.join(' | '));
    }
    assert.ok(f(prova(80, 60, 60), COM).motivos.some(m => /o bloco I tem 80 questões; o do edital tem 40/.test(m)), 'prova MAIOR: dito por bloco');
    assert.ok(f(prova(24, 18, 18), COM).motivos.some(m => /o bloco I tem 24 de 40 questões/.test(m)), 'prova menor: dito por bloco');
    assert.equal(f(prova(50, 25, 25), COM).ok, false, '100 questões fora da divisão do edital');
    assert.equal(f(prova(40, 30, 30).concat([{ id: 'x', gabarito: 'a', bloco: 'IV' }]), COM).ok, false, 'bloco que o edital não tem');
    // ---- SEM formato: a proporção dos mínimos (a mesma repartição que monta o simulado) e todo mínimo alcançável
    assert.equal(f(prova(40, 30, 30), EDITAL).ok, true, '100 em 40/30/30');
    for (const n of [60, 100, 150, 200]) {
      const partes = pontuacao.repartirPorBloco(n, pontuacao.blocosDaRegra(EDITAL).blocos).map(p => p.questoes);
      assert.equal(f(prova(...partes), EDITAL).ok, true, `${n} questões na proporção dos mínimos, todos alcançáveis: sem o total cadastrado não há como dizer que a prova é maior que a do edital`);
    }
    for (const [i, ii, iii] of [[50, 25, 25], [34, 33, 33], [100, 50, 50], [20, 20, 20]]) {
      const r = f(prova(i, ii, iii), EDITAL);
      assert.equal(r.ok, false, `${i}/${ii}/${iii} não segue a proporção dos mínimos`);
      assert.ok(r.motivos.some(m => /na proporção do edital seriam/.test(m)), r.motivos.join(' | '));
    }
    assert.equal(f(prova(4, 3, 3), EDITAL).ok, false, '10 questões: os mínimos são inalcançáveis (como antes)');
    assert.equal(f(prova(40, 30, 30), { valor_certa: 1 }).definido, false, 'regra sem critério: não há veredito a dar');
    // ---- quem USA: o veredito da prova e a contagem para o certificado
    const tent = (id, modo, itens, regra, acertos) => ({ id, modo, estado: 'enviada', congelado: JSON.stringify({ itens, regra }), respostas: JSON.stringify(Object.fromEntries(itens.slice(0, acertos).map(x => [x.id, 'a']).concat(itens.slice(acertos).map(x => [x.id, 'b'])))), resultado: 'null' });
    const veredito = (linha) => A.vereditoDe(A.abrirTentativa(linha));
    // o caso medido: 200 questões (80/60/60) com 60 acertos = 30 % dava "atingiu" — e contava para o certificado
    const de200 = tent('rb2-200', 'simulado', prova(80, 60, 60), COM, 60);
    assert.deepEqual([veredito(de200).veredito, veredito(de200).no_formato, A.simuladoQueConta(de200).conta], ['fora_do_formato', false, false]);
    const de150 = tent('rb2-150', 'simulado', prova(60, 45, 45), COM, 60), de60 = tent('rb2-60', 'simulado', prova(24, 18, 18), COM, 59);
    assert.deepEqual([veredito(de150).veredito, A.simuladoQueConta(de150).conta, veredito(de60).veredito, A.simuladoQueConta(de60).conta], ['fora_do_formato', false, 'fora_do_formato', false], 'nem maior, nem menor');
    const de100 = tent('rb2-100', 'simulado', prova(40, 30, 30), COM, 80);
    assert.deepEqual([veredito(de100).veredito, veredito(de100).no_formato, A.simuladoQueConta(de100).conta], [null, true, true], 'no formato: o veredito sai da regra, e o simulado conta');
    assert.equal(veredito(tent('rb2-tr', 'treino', prova(40, 30, 30), COM, 80)).veredito, 'fora_do_formato', 'treino nunca dá veredito');
    // sem formato cadastrado, a prova fora da proporção também não conta
    assert.equal(A.simuladoQueConta(tent('rb2-prop', 'simulado', prova(50, 25, 25), EDITAL, 90)).conta, false);
    assert.equal(A.simuladoQueConta(tent('rb2-ok', 'simulado', prova(40, 30, 30), EDITAL, 90)).conta, true);
  });

  // ================= R2-B9 — o piso do bloco do plano =================
  await t('réplica R2-B9: plano sem blocos de 2 a 6 minutos — o bloco menor que SESSAO_MIN_MINUTOS é juntado ou empurrado, e a conta "cabe / não cabe" não muda', async () => {
    assert.equal(plano.SESSAO_MIN_MINUTOS, 10);
    const itens = Array.from({ length: 40 }, (_, i) => { const m = 47 + ((i * 37) % 53); return { codigo: '1.1.' + (i + 1), ordem: i, peso: 0, esforco_min: [m, m] }; });
    const porItem = (p) => { const m = {}; p.sessoes.forEach(s => s.estudo.forEach(b => { m[b.codigo] = (m[b.codigo] || 0) + b.minutos; })); return m; };
    const pequenos = (p) => p.sessoes.flatMap(s => s.estudo.filter(b => b.minutos < plano.SESSAO_MIN_MINUTOS).map(b => `${s.data} ${b.codigo} · ${b.minutos} min`));
    let antes = 0, depois = 0;
    for (const [nome, entrada] of [
      ['cabe com folga', { hoje: '2026-10-12', data_alvo: '2027-01-31', disponibilidade: { seg: 120, ter: 90, qua: 120, qui: 75, sex: 60, sab: 180 }, itens, vespera_dias: 5, revisao_geral_dias: 15 }],
      ['não cabe', { hoje: '2026-10-12', data_alvo: '2026-11-08', disponibilidade: { seg: 120, ter: 90, qua: 120, qui: 75, sex: 60, sab: 180 }, itens, vespera_dias: 5, revisao_geral_dias: 15 }],
      ['sem prova marcada', { hoje: '2026-10-12', data_alvo: '', disponibilidade: [0, 100, 100, 100, 100, 100, 0], itens }]]) {
      const a = plano.planejar({ ...entrada, sessao_min: 0 }), b = plano.planejar(entrada);
      antes += pequenos(a).length; depois += pequenos(b).length;
      // a CONTA é a mesma: o que não coube, a viabilidade, o nível recomendado e os minutos de cada item
      assert.deepEqual([b.pendentes, b.viabilidade, b.nivel_recomendado, b.reta_final], [a.pendentes, a.viabilidade, a.nivel_recomendado, a.reta_final], nome + ': a conta "cabe / não cabe" mudou');
      assert.deepEqual(porItem(b), porItem(a), nome + ': os minutos de cada item');
      // nenhuma sessão passa do tempo que o aluno declarou, e a retomada nunca fica negativa
      assert.ok(b.sessoes.every(s => s.revisao_min >= 0 && s.revisao_min + s.estudo.reduce((x, y) => x + y.minutos, 0) <= s.minutos), nome + ': sessão maior que o tempo declarado');
      assert.ok(b.sessoes.length <= a.sessoes.length, nome + ': o plano não fica mais longo');
      assert.deepEqual(pequenos(b), [], nome + ': bloco menor que o piso');
    }
    assert.ok(antes >= 5, `o cenário reproduz o defeito: sem o piso havia ${antes} bloco(s) de menos de 10 minutos`);
    assert.equal(depois, 0);
    // aula cujo esforço INTEIRO é menor que o piso não é "bloco quebrado": continua no plano, inteira
    const curto = plano.planejar({ hoje: '2026-10-12', data_alvo: '', disponibilidade: [0, 60, 60, 60, 60, 60, 0], itens: [{ codigo: 'a', ordem: 0, esforco_min: [6, 6] }, { codigo: 'b', ordem: 1, esforco_min: [30, 30] }] });
    assert.deepEqual(porItem(curto), { a: 6, b: 30 });
    // pelo caminho do aluno: o plano gravado sai do mesmo motor
    const ana = await conta('Ana do Plano');
    const r = await req('PUT', `${esc()}/plano`, { jar: ana.jar, corpo: { disponibilidade: { seg: 120, ter: 90, qua: 120, qui: 75, sex: 60, sab: 180 }, data_alvo: '2027-03-31' } });
    assert.equal(r.st, 200, r.texto);
    const gravado = JSON.parse(db.prepare('SELECT plano FROM est_planos WHERE user_id = ? AND escopo_id = ?').get(ana.id, eid()).plano);
    assert.ok(gravado.sessoes.some(s => s.estudo.length), 'o plano tem sessões de estudo');
    assert.deepEqual(pequenos(gravado), [], 'no plano do aluno, nenhum bloco de menos de 10 minutos');
  });

  // ================= R2-M5 / M2 — a rolagem espera o conteúdo =================
  await t('réplica M2 (R2-M5): no celular, tocar na aba leva o conteúdo à vista mesmo com a página ainda em "Carregando…" — a rolagem é repetida quando o conteúdo chega', async () => {
    // a página de mentira: abas a 703 px do topo; enquanto "carrega" a página não tem altura para rolar
    const pagina = { altura: 760, janela: 812, y: 0 };
    const r = { get scrollTop() { return pagina.y; }, set scrollTop(v) { pagina.y = Math.max(0, Math.min(v, Math.max(0, pagina.altura - pagina.janela))); }, get scrollHeight() { return pagina.altura; } };
    const fila = [];
    const ctx = vm.createContext({ VEZ: 1, Math, rolagem: () => r, el: (id) => (id === 'es-abas' ? { getBoundingClientRect: () => ({ top: 703 - pagina.y }) } : null),
      window: { innerWidth: 375, getComputedStyle: () => ({ position: 'static' }) }, document: { querySelector: () => null }, setTimeout: (fn) => { fila.push(fn); } });
    vm.runInContext('var LARGURA_CELULAR = 760;\n' + funcaoDoFonte(TELA, 'irAoConteudo'), ctx);
    const rodarFila = () => { const agora = fila.splice(0); agora.forEach(fn => fn()); };
    vm.runInContext('irAoConteudo(false)', ctx);
    assert.equal(pagina.y, 0, 'sem altura, o navegador prende em 0 (era aqui que parava)');
    assert.equal(fila.length, 1, '…mas a tela vai tentar de novo');
    rodarFila(); assert.equal(pagina.y, 0); assert.equal(fila.length, 1, 'ainda carregando: segue tentando');
    pagina.altura = 3000; rodarFila(); // o conteúdo chegou
    assert.equal(pagina.y, 697, 'o conteúdo chegou: as abas vão ao topo (703 − 6)');
    assert.equal(fila.length, 0, 'chegou: não tenta mais');
    // o aluno rolou por conta própria no meio da espera: a tela não briga com ele
    pagina.altura = 760; pagina.y = 0; vm.runInContext('irAoConteudo(false)', ctx);
    pagina.altura = 3000; pagina.y = 150; rodarFila();
    assert.equal(pagina.y, 150, 'quem rolou fica onde rolou');
    // trocou de tela: a espera da tela anterior não mexe na nova
    fila.length = 0; pagina.altura = 760; pagina.y = 0; vm.runInContext('irAoConteudo(false)', ctx);
    vm.runInContext('VEZ = 2', ctx); pagina.altura = 3000; rodarFila();
    assert.equal(pagina.y, 0);
    // primeira abertura e tela larga: topo, como sempre
    pagina.y = 500; vm.runInContext('irAoConteudo(true)', ctx); assert.equal(pagina.y, 0);
    // no celular o corpo tem altura mínima de uma tela (a aba de conteúdo CURTO também sobe)…
    assert.ok(/@media \(max-width:760px\)\{[^}]*\n?\s*(?:\/\*[\s\S]*?\*\/\s*)?\.es-corpo\{min-height:100vh;min-height:100dvh\}/.test(CSS), 'estude.css: altura mínima do corpo no celular');
    // …e "Começar" a prova também leva à primeira questão
    assert.ok(/\.then\(function \(t\) \{ executar\(alvo, t\); if \(window\.innerWidth <= LARGURA_CELULAR\) irAoConteudo\(false\); \}\)/.test(TELA));
    assert.ok(/if \(LISTAS\[aba\] && !E\.abaArg\) reporLugar\(aba, alvo, como\.primeira\); else irAoConteudo\(como\.primeira\);/.test(TELA), 'toda troca de aba passa por aqui (Prova, Cards, Erros, Plano, Minha jornada, Meu caderno)');
  });

  // ================= M3 — a tabela da calculadora no celular =================
  await t('réplica M3 e baixa 9: a tabela da calculadora rola dentro da própria faixa e a situação pode quebrar de linha no celular; "falta 1 acerto"; maiúscula depois de "sem veredito."', async () => {
    assert.ok(/<div class="es-tab-rola"><table class="es-tab es-jr-tab es-fer-tab">[\s\S]{0,200}<th class="n">Situação<\/th>/.test(TELA), 'a tabela do resultado mora numa faixa que rola');
    assert.ok(/\}\)\.join\(''\) \+ '<\/table><\/div>' \+/.test(TELA), 'a faixa é fechada');
    assert.ok(/\.es-tab-rola\{overflow-x:auto;/.test(CSS));
    assert.ok(/@media \(max-width:760px\)\{\.es-fer-tab td\.n:last-child\{white-space:normal/.test(CSS));
    // …e CABE no cartão (medido no navegador a 375 px: tabela e faixa com 297 px, também com o selo mais longo): no
    // celular a Situação desce para uma linha própria, com a largura toda; o cabeçalho dela e o "—" de quem não tem mínimo saem
    assert.ok(/\.es-tab\.es-fer-tab tr\{display:grid;grid-template-columns:[^}]+\}/.test(CSS) && /\.es-tab\.es-fer-tab td\.n:last-child\{grid-column:1\/-1;text-align:left;/.test(CSS));
    assert.ok(/\.es-tab\.es-fer-tab th:last-child,\.es-tab\.es-fer-tab \.es-fer-nada\{display:none\}/.test(CSS) && /<span class="es-fer-nada">—<\/span>/.test(TELA));
    // o texto: a frase sai da função da tela, executada
    const falta = new Function('x', 'onde', TELA.match(/var falta = function \(x, onde\) \{([\s\S]*?)\n        \};/)[1]);
    assert.ok(/>falta 1 acerto</.test(falta({ atingido: false, possivel: true, faltam_acertos: 1 }, 'o bloco inteiro')), 'singular');
    assert.ok(/>faltam 3 acertos</.test(falta({ atingido: false, possivel: true, faltam_acertos: 3 }, 'o bloco inteiro')));
    assert.ok(!/faltam ' \+ x\.faltam_acertos \+ ' acerto'/.test(TELA));
    const maiuscula = new Function('return ' + funcaoDoFonte(TELA, 'maiuscula'))();
    assert.equal(maiuscula('o bloco I vale no máximo 0,4 e o mínimo dele é 1,2'), 'O bloco I vale no máximo 0,4 e o mínimo dele é 1,2');
    assert.ok(/sem veredito\.<\/b> ' \+ esc\(maiuscula\(\(r\.veredito_motivos \|\| \[\]\)\.join\('; '\)\)\)/.test(TELA));
  });

  // ================= R2-B7 — o que a rota de quem não comprou devolve =================
  await t('réplica R2-B7: sem matrícula, `…/interativo` devolve só a degustação (aulas gratuitas, extras SEM o link, nenhum prompt) e `…/tutor/:id/conversa` responde 403 em curso sem aula gratuita', async () => {
    const fora = await conta('Caio de Fora', { matricular: false }), dentro = await conta('Dora de Dentro');
    const aulas = db.prepare('SELECT id, titulo, gratuita FROM lessons WHERE product_id = ?').all(pid);
    const a1 = aulas.find(a => a.titulo === 'Aula A1').id, a2 = aulas.find(a => a.titulo === 'Aula A2').id;
    // quem TEM o curso: o resumo inteiro, como sempre
    let r = await req('GET', `/academy/api/aluno/cursos/${pid}/interativo`, { jar: dentro.jar });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.acesso, Object.keys(r.json.quiz).sort(), r.json.prompts, r.json.extras[0].url], [true, [a1, a2].sort(), 1, 'https://material-de-quem-comprou.test/planilha']);
    // quem NÃO tem: só o que a página da degustação usa
    r = await req('GET', `/academy/api/aluno/cursos/${pid}/interativo`, { jar: fora.jar });
    assert.equal(r.st, 200, 'a página de quem não comprou lê esta rota');
    assert.deepEqual([r.json.acesso, r.json.revisor, Object.keys(r.json.quiz), r.json.prompts], [false, false, [a1], 0], 'só a aula gratuita; nem o número de prompts');
    assert.deepEqual(r.json.extras.map(x => [x.titulo, x.url]), [['Material de apoio', '']], 'o cartão do extra é vitrine; o link, não');
    assert.ok(!r.texto.includes('material-de-quem-comprou') && !r.texto.includes(a2), 'nada da aula paga nem do material sai por aqui');
    // o conteúdo de fato segue barrado nas rotas dele
    assert.equal((await req('GET', `/academy/api/aluno/aulas/${a2}/quiz`, { jar: fora.jar })).st, 404);
    assert.equal((await req('GET', `/academy/api/aluno/aulas/${a1}/quiz`, { jar: fora.jar })).st, 200, 'a degustação continua funcionando');
    assert.equal((await req('GET', `/academy/api/aluno/cursos/${pid}/prompts`, { jar: fora.jar })).st, 403);
    // a conversa com o Tutor: curso com degustação → a tela a pede (200); curso sem aula gratuita → 403
    assert.equal((await req('GET', `/academy/api/aluno/tutor/${pid}/conversa`, { jar: fora.jar })).st, 200);
    r = await req('GET', `/academy/api/aluno/tutor/${pid2}/conversa`, { jar: fora.jar });
    assert.equal(r.st, 403, r.texto); assert.ok(/acesso ao curso/.test(r.json.erro));
    assert.equal((await req('GET', `/academy/api/aluno/tutor/${pid}/conversa`, { jar: dentro.jar })).st, 200);
    assert.equal((await req('GET', `/academy/api/aluno/tutor/${pid2}/conversa`, { jar: 'maria' })).st, 200, 'a dona do curso revisa');
    // (o `…/estudo/:percurso/jornada` de quem não tem acesso já responde 403, e o `…/jornada` do curso devolve só { acesso: false })
    assert.equal((await req('GET', `${esc()}/painel`, { jar: fora.jar })).st, 403);
  });

  // ================= R3-M9 — o painel enxuto =================
  let leo = null;
  await t('réplica R3-M9: o painel é pedido INTEIRO uma vez; depois vai o resumo (sem a parte fixa das listas), que a tela junta ao que tem — e responder uma questão traz o resumo na própria resposta, sem outro pedido', async () => {
    leo = await conta('Leo do Painel');
    assert.equal((await req('GET', `${esc()}/unidades/rb-aula-1-1?aberta=1`, { jar: leo.jar })).st, 200);
    const inteiro = await req('GET', `${esc()}/painel`, { jar: leo.jar });
    assert.equal(inteiro.st, 200, inteiro.texto);
    assert.ok(/^[0-9a-f]{16}$/.test(inteiro.json.assinatura), 'o painel leva a assinatura da parte fixa');
    assert.ok(!('resumo' in inteiro.json));
    const resumo = await req('GET', `${esc()}/painel?resumo=1`, { jar: leo.jar });
    assert.equal(resumo.st, 200, resumo.texto);
    assert.deepEqual([resumo.json.resumo, resumo.json.assinatura], [true, inteiro.json.assinatura]);
    // MEDIDA: o resumo não leva enunciado de competência, título de aula nem o texto do programa
    const kb = (x) => Math.round(Buffer.byteLength(x) / 102.4) / 10;
    console.log(`     · painel inteiro ${kb(inteiro.texto)} KB → resumo ${kb(resumo.texto)} KB (${Math.round(100 * resumo.texto.length / inteiro.texto.length)} %) neste percurso de 30 aulas; no curso real (251 aulas, cópia do banco da réplica): 379 KB → 109 KB`);
    assert.ok(resumo.texto.length < inteiro.texto.length * 0.6, `o resumo tem de ser bem menor que o painel: ${resumo.texto.length} de ${inteiro.texto.length} bytes`);
    assert.ok(!/Diante de um caso concreto|o instituto, a regra geral|do programa do edital/.test(resumo.texto), 'nada da parte fixa vai no resumo');
    assert.deepEqual(Object.keys(resumo.json.unidades[0]).sort(), ['aberta', 'codigo', 'estudada', 'video_assistido']);
    assert.deepEqual(Object.keys(resumo.json.itens[0]).sort(), ['codigo', 'dominio', 'estudado']);
    assert.ok(!('resultado' in resumo.json.competencias[0]) && 'estado' in resumo.json.competencias[0]);
    // a tela JUNTA o resumo ao painel que tem — com a função dela, tirada do fonte — e o resultado é o painel inteiro
    const ctx = vm.createContext({ Object });
    vm.runInContext("var PAINEL_LISTAS = ['competencias', 'unidades', 'itens'];\n" + funcaoDoFonte(TELA, 'juntarResumo'), ctx);
    const juntar = (tenho, r) => JSON.parse(vm.runInContext(`JSON.stringify(juntarResumo(${JSON.stringify(tenho)}, ${JSON.stringify(r)}))`, ctx));
    const semRelogio = (p) => { const x = JSON.parse(JSON.stringify(p)); if (x.prova_aberta) delete x.prova_aberta.agora; return x; };
    assert.deepEqual(semRelogio(juntar(inteiro.json, resumo.json)), semRelogio(inteiro.json), 'resumo + painel que a tela tem = painel inteiro');
    // RESPONDER: o resumo vem junto (a tela manda `painel: true`), já com a resposta contada
    const q = (await req('GET', `${esc()}/praticar?n=20`, { jar: leo.jar })).json.questoes.find(x => x.id === idQ(4));
    const certa = R.Questoes.obter(q.id).alternativas.find(a => a.correta).id;
    const resp = await req('POST', `${esc()}/questoes/${q.id}/responder`, { jar: leo.jar, corpo: { resposta: certa, painel: true } });
    assert.equal(resp.st, 200, resp.texto);
    assert.deepEqual([resp.json.acerto, resp.json.painel.resumo, resp.json.painel.assinatura], [true, true, inteiro.json.assinatura]);
    const depois = await req('GET', `${esc()}/painel`, { jar: leo.jar });
    assert.deepEqual(semRelogio(juntar(inteiro.json, resp.json.painel)), semRelogio(depois.json), 'o painel montado da resposta é o MESMO que o servidor daria num pedido novo');
    assert.equal(depois.json.desempenho.respostas, inteiro.json.desempenho.respostas + 1);
    assert.ok(depois.json.unidades.find(u => u.codigo === 'rb-aula-1-1').estudada, 'a aula aberta com questão respondida conta como estudada — e isso chegou pela resposta');
    // sem pedir, a resposta não carrega o painel (cliente antigo, chamada direta)
    const semPedir = await req('POST', `${esc()}/questoes/${idQ(5)}/responder`, { jar: leo.jar, corpo: { resposta: R.Questoes.obter(idQ(5)).alternativas.find(a => a.correta).id } });
    assert.ok(semPedir.st === 200 && !('painel' in semPedir.json));
    // o conteúdo do curso mudou (assinatura outra): a tela NÃO junta — pede o painel inteiro
    assert.equal(juntar({ ...inteiro.json, assinatura: 'outra' }, resumo.json), null);
    assert.equal(juntar(inteiro.json, { ...resumo.json, unidades: resumo.json.unidades.slice(1) }), null, 'lista de tamanho diferente não é juntada');
    // NA TELA — quantos pedidos de painel no fluxo: responder não pede (usa o resumo da resposta); o Voltar do
    // navegador reaproveita o painel recente do mesmo percurso; os demais pedidos vão como resumo
    const questao = funcaoDoFonte(TELA, 'questaoNaTela');
    assert.ok(/painel: pedePainel \}\)/.test(questao) && /var junto = x\.painel && b0 === base\(\) \? juntarResumo\(E\.painel, x\.painel\) : null;\s*if \(junto\) guardarPainel\(junto, b0\); else carregar\(\);/.test(questao), 'responder: o painel vem da resposta; pedir, só se não vier');
    assert.ok(!/el\('es-prox'\)\.onclick = aoProxima;\s*carregar\(\);/.test(questao), 'o pedido de painel a cada questão saiu');
    const carregar = funcaoDoFonte(TELA, 'carregar');
    assert.ok(/apiCru\('GET', b \+ '\/painel' \+ \(tenho \? '\?resumo=1' : ''\)\)/.test(carregar) && /if \(!junto\) return carregar\(depois, true\);/.test(carregar));
    assert.ok(/if \(painelServe\(\)\) \{ pintarCabecalho\(E\.painel\); pronto\(\); \} else carregar\(pronto\);/.test(funcaoDoFonte(TELA, 'abrir')), 'abrir (F5, Voltar): painel recente do mesmo percurso é reaproveitado');
    assert.ok(/E\.painelDe === base\(\) && !E\.painelVelho && E\.painelEm && Date\.now\(\) - E\.painelEm < PAINEL_REAPROVEITA_MS/.test(funcaoDoFonte(TELA, 'painelServe')));
    assert.ok(/if \(m !== 'GET'\) E\.painelVelho = true;/.test(funcaoDoFonte(TELA, 'api')), 'toda escrita marca o painel em memória como "por conferir"');
  });

  await t('réplica baixa 11: `GET …/jornada`, a leitura, os mapas e o caderno não calculam mais a cobertura inteira só para ler o nome das disciplinas', async () => {
    const usuario = db.prepare('SELECT * FROM users WHERE id = ?').get(leo.id), produto = ct.Produtos.obter(pid);
    const original = R.cobertura; let chamadas = 0;
    R.cobertura = (...a) => { chamadas++; return original(...a); };
    try {
      const j1 = R.comCache(() => J.jornada(usuario, produto, SLUG));
      assert.equal(chamadas, 0, 'a jornada não precisa da cobertura');
      assert.ok(j1.selos.length === 3 && j1.selos.every(s => /^Direito [ABC]$/.test(s.nome)), 'e os nomes das disciplinas continuam certos: ' + j1.selos.map(s => s.nome).join(', '));
      R.comCache(() => A.leitura(usuario, produto, SLUG)); R.comCache(() => A.mapas(usuario, produto, SLUG)); R.comCache(() => A.caderno(usuario, produto, SLUG)); R.comCache(() => J.ferramentas(usuario, produto, SLUG));
      assert.equal(chamadas, 0);
      const p = R.comCache(() => A.painel(usuario, produto, SLUG));
      assert.equal(chamadas, 1, 'o painel calcula a cobertura UMA vez (e a passa adiante)');
      assert.deepEqual(R.comCache(() => A.leitura(usuario, produto, SLUG)).disciplinas.map(d => d.nome), ['Direito A', 'Direito B', 'Direito C']);
      assert.ok(p.itens.length === 34);
    } finally { R.cobertura = original; }
  });

  // ================= R3-B5 / M5 — duas abas não se sobrescrevem =================
  await t('réplica M5 (R3-B5): duas abas — a nota da aula, a tentativa do bloco e a anotação da questão conferem o `atualizado_em` lido; texto mais novo no servidor → 409 com o texto atual, e nada é gravado', async () => {
    const mia = await conta('Mia das Duas Abas');
    const un = `${esc()}/unidades/rb-aula-1-2`;
    const aula = async () => (await req('GET', `${un}?aberta=1`, { jar: mia.jar })).json;
    const noBanco = () => (db.prepare('SELECT texto FROM est_notas_aula WHERE user_id = ? AND unidade = ?').get(mia.id, 'rb-aula-1-2') || {}).texto || '';
    // as duas abas abrem a aula: as duas leram "vazio"
    const abaA = await aula(), abaB = await aula();
    assert.deepEqual([abaA.nota, abaB.nota], [{ texto: '', atualizado_em: '' }, { texto: '', atualizado_em: '' }]);
    // A grava a nota longa
    const LONGA = 'Nota longa da aba A: a regra geral, as três exceções e o entendimento do tribunal sobre o prazo.';
    let r = await req('PUT', `${un}/nota`, { jar: mia.jar, corpo: { texto: LONGA, lido_em: abaA.nota.atualizado_em } });
    assert.equal(r.st, 200, r.texto);
    const t1 = r.json.atualizado_em;
    // B, aberta antes, tenta gravar "B": 409, com o texto e a data que estão no servidor — e a nota longa fica
    r = await req('PUT', `${un}/nota`, { jar: mia.jar, corpo: { texto: 'B', lido_em: abaB.nota.atualizado_em } });
    assert.equal(r.st, 409, r.texto);
    assert.deepEqual([r.json.conflito, r.json.texto, r.json.atualizado_em], [true, LONGA, t1]);
    assert.ok(/outra aba/.test(r.json.erro));
    assert.equal(noBanco(), LONGA, 'nada foi gravado por cima');
    // B grava VAZIO (era o caso que apagava a nota): 409 também
    r = await req('PUT', `${un}/nota`, { jar: mia.jar, corpo: { texto: '', lido_em: '' } });
    assert.equal(r.st, 409); assert.equal(noBanco(), LONGA);
    // o aluno escolhe em B "ficar com o que digitei aqui": a tela reenvia com a data que o 409 trouxe → grava
    r = await req('PUT', `${un}/nota`, { jar: mia.jar, corpo: { texto: 'B', lido_em: t1 } });
    assert.equal(r.st, 200, r.texto); assert.equal(noBanco(), 'B');
    const t2 = r.json.atualizado_em;
    // …e agora é a aba A que está desatualizada
    r = await req('PUT', `${un}/nota`, { jar: mia.jar, corpo: { texto: LONGA + ' Mais uma linha.', lido_em: t1 } });
    assert.deepEqual([r.st, r.json.texto, r.json.atualizado_em], [409, 'B', t2]);
    // mesmo texto que já está lá não é conflito (a tela reenviando o que o servidor já tem)
    assert.equal((await req('PUT', `${un}/nota`, { jar: mia.jar, corpo: { texto: 'B', lido_em: 'data-velha' } })).st, 200);
    // ÚLTIMA HORA (fechar a aba, F5): não há a quem perguntar — o servidor JUNTA os dois textos, nenhum some
    const t3 = (db.prepare('SELECT atualizado_em FROM est_notas_aula WHERE user_id = ? AND unidade = ?').get(mia.id, 'rb-aula-1-2')).atualizado_em;
    r = await req('PUT', `${un}/nota`, { jar: mia.jar, corpo: { texto: 'O que a aba A tinha digitado ao fechar.', lido_em: t1, ao_sair: true } });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.juntado, r.json.texto], [true, 'B' + A.SEPARADOR_DE_ABAS + 'O que a aba A tinha digitado ao fechar.']);
    assert.ok(noBanco().includes('B') && noBanco().includes('O que a aba A tinha digitado ao fechar.') && t3);
    // …e se o texto que chega já CONTÉM o do servidor (a mesma aba, com um envio ainda a caminho), não duplica
    r = await req('PUT', `${un}/nota`, { jar: mia.jar, corpo: { texto: noBanco() + ' E mais isto.', lido_em: t1, ao_sair: true } });
    assert.deepEqual([r.st, r.json.juntado, r.json.texto.split('E mais isto.').length], [200, false, 2]);
    // aba fechada com o campo VAZIO não apaga o que a outra escreveu
    r = await req('PUT', `${un}/nota`, { jar: mia.jar, corpo: { texto: '', lido_em: '', ao_sair: true } });
    assert.equal(r.st, 200); assert.ok(noBanco().includes('E mais isto.'), 'o vazio de última hora não apaga');
    // CLIENTE ANTIGO (sem `lido_em`): o comportamento de hoje — vale o que chegou
    r = await req('PUT', `${un}/nota`, { jar: mia.jar, corpo: { texto: 'Cliente antigo.' } });
    assert.equal(r.st, 200); assert.equal(noBanco(), 'Cliente antigo.');
    // ---- TENTATIVA DO BLOCO (o bloco 1 é a prática)
    const tent = () => (db.prepare('SELECT texto FROM est_tentativas_bloco WHERE user_id = ? AND unidade = ? AND bloco = 1').get(mia.id, 'rb-aula-1-2') || {}).texto || '';
    r = await req('PUT', `${un}/blocos/1/tentativa`, { jar: mia.jar, corpo: { texto: 'Tentativa escrita na aba A, com o raciocínio inteiro.', lido_em: '' } });
    assert.equal(r.st, 200, r.texto);
    const tt = r.json.atualizado_em;
    r = await req('PUT', `${un}/blocos/1/tentativa`, { jar: mia.jar, corpo: { texto: 'rascunho da B', lido_em: '' } });
    assert.deepEqual([r.st, r.json.conflito, r.json.texto, r.json.atualizado_em], [409, true, 'Tentativa escrita na aba A, com o raciocínio inteiro.', tt]);
    assert.equal(tent(), 'Tentativa escrita na aba A, com o raciocínio inteiro.');
    assert.equal((await req('PUT', `${un}/blocos/1/tentativa`, { jar: mia.jar, corpo: { texto: 'rascunho da B', lido_em: tt } })).st, 200);
    // "Ver a solução" grava a tentativa e devolve a data nova: o salvamento automático segue dela (sem falso conflito)
    r = await req('POST', `${un}/blocos/1/solucao`, { jar: mia.jar, corpo: { tentativa: 'Minha tentativa final, com mais de quinze caracteres.' } });
    assert.equal(r.st, 200, r.texto);
    assert.ok(r.json.atualizado_em && r.json.texto === 'Minha tentativa final, com mais de quinze caracteres.');
    assert.equal((await req('PUT', `${un}/blocos/1/tentativa`, { jar: mia.jar, corpo: { texto: 'Minha tentativa final, com mais de quinze caracteres. E um reparo.', lido_em: r.json.atualizado_em } })).st, 200);
    // ---- ANOTAÇÃO DA QUESTÃO (caderno de erros)
    const q6 = idQ(6), errada = R.Questoes.obter(q6).alternativas.find(a => !a.correta).id;
    r = await req('POST', `${esc()}/questoes/${q6}/responder`, { jar: mia.jar, corpo: { resposta: errada } });
    assert.deepEqual([r.st, r.json.anotacao, r.json.anotacao_em], [200, '', '']);
    r = await req('PUT', `${esc()}/questoes/${q6}/anotacao`, { jar: mia.jar, corpo: { texto: 'Errei porque confundi a regra com a exceção.', lido_em: '' } });
    assert.equal(r.st, 200, r.texto);
    const ta = r.json.atualizado_em; assert.ok(ta);
    r = await req('PUT', `${esc()}/questoes/${q6}/anotacao`, { jar: mia.jar, corpo: { texto: 'outra', lido_em: '' } });
    assert.deepEqual([r.st, r.json.conflito, r.json.texto, r.json.atualizado_em], [409, true, 'Errei porque confundi a regra com a exceção.', ta]);
    const lista = await req('GET', `${esc()}/erros`, { jar: mia.jar });
    assert.deepEqual([lista.json.questoes[0].anotacao, lista.json.questoes[0].anotacao_em], ['Errei porque confundi a regra com a exceção.', ta], 'o caderno de erros entrega a data lida');
    assert.equal((await req('PUT', `${esc()}/questoes/${q6}/anotacao`, { jar: mia.jar, corpo: { texto: 'outra', lido_em: ta } })).st, 200);
    assert.equal((await req('PUT', `${esc()}/questoes/${q6}/anotacao`, { jar: mia.jar, corpo: { texto: 'sem o campo: como antes' } })).st, 200);
  });

  await t('réplica M5 (R3-B5), na tela: o salvamento manda o `lido_em`, o 409 vira aviso "alterada em outra aba" com o texto de lá, o campo mantém o que o aluno digitou e ele escolhe — e o envio de última hora vai com `ao_sair`', async () => {
    const salvar = funcaoDoFonte(TELA, 'salvarSozinho'), caixa = funcaoDoFonte(TELA, 'caixaDeConflito'), ligar = funcaoDoFonte(TELA, 'ligarCadernoDaAula'), anot = funcaoDoFonte(TELA, 'guardarAnotacao');
    assert.ok(/enviar\(v, lido, semTela\)\.then\(function \(r\) \{ emVoo = false; ultimo = v; leu\(r\);/.test(salvar), 'cada envio leva o que a tela leu, e a resposta atualiza a data');
    assert.ok(/if \(e && e\.status === 409 && e\.dados && e\.dados\.conflito\) return emConflito\(e\.dados, v\);/.test(salvar));
    assert.ok(/if \(conflito && !fora\(\)\) return;/.test(salvar), 'com o conflito aberto, nada é enviado até o aluno escolher');
    assert.ok(/gravarNaSaida\(caminho, \{ texto: v, lido_em: lido, ao_sair: true \}\)/.test(salvar), 'última hora: o servidor junta');
    assert.ok(/Esta anotação foi alterada em outra aba/.test(caixa) && /data-c="juntar"/.test(caixa) && /data-c="meu"/.test(caixa) && /data-c="outro"/.test(caixa));
    assert.ok(/lido_em: lido/.test(ligar) && /\(tent\[n\] \|\| \{\}\)\.atualizado_em \|\| ''/.test(ligar) && /notaLida\.atualizado_em \|\| ''/.test(ligar), 'a aula entrega à tela a data de cada texto');
    assert.ok(/lido_em: lido\.em/.test(anot) && /caixaDeConflito\(campo, e\.dados/.test(anot));
    assert.ok(/falhou\.status = r\.status; falhou\.dados = d \|\| null; throw falhou;/.test(ler('app-cliente.js')), 'o erro da API leva o código e o corpo (é de onde a tela lê o texto do servidor)');
    assert.ok(/\.es-conflito\{/.test(CSS));
    // A CAIXA, executada numa página de mentira: mostra o texto do servidor, NÃO mexe no campo, e cada escolha faz o que diz
    const novoNo = () => ({ filhos: [], attrs: {}, parentNode: null, className: '', _html: '', textContent: '',
      setAttribute(k, v) { this.attrs[k] = v; }, set innerHTML(h) { this._html = h; }, get innerHTML() { return this._html; },
      querySelector(sel) { return sel === '.es-conflito-txt' ? (this._txt = this._txt || { textContent: '' }) : null; },
      insertBefore(no) { no.parentNode = this; this.filhos.push(no); }, removeChild(no) { this.filhos = this.filhos.filter(x => x !== no); no.parentNode = null; } });
    const botoes = {};
    const ctx = vm.createContext({ document: { createElement: novoNo }, cada: (cx, sel, fn) => ['juntar', 'meu', 'outro'].forEach(c => { const b = { getAttribute: () => c, onclick: null }; botoes[c] = b; fn(b); }) });
    vm.runInContext(caixa, ctx);
    for (const [escolha, esperado] of [['juntar', 'Texto da outra aba.\n\nO que eu digitei aqui.'], ['meu', 'O que eu digitei aqui.'], ['outro', 'Texto da outra aba.']]) {
      const pai = novoNo(), campo = { value: 'O que eu digitei aqui.', parentNode: pai, nextSibling: null };
      pai.tagName = 'DIV';
      let escolhido = '';
      ctx.campo = campo; ctx.dados = { texto: 'Texto da outra aba.', atualizado_em: 'T9' }; ctx.aoEscolher = (e) => { escolhido = e; };
      vm.runInContext('caixaDeConflito(campo, dados, aoEscolher)', ctx);
      assert.equal(campo.value, 'O que eu digitei aqui.', 'o aviso aparece e o campo continua com o que o aluno digitou');
      assert.equal(pai.filhos.length, 1); assert.equal(pai.filhos[0]._txt.textContent, 'Texto da outra aba.', 'o texto do servidor é mostrado ao lado');
      assert.equal(pai.filhos[0].attrs.role, 'alert');
      botoes[escolha].onclick();
      assert.deepEqual([escolhido, campo.value, pai.filhos.length], [escolha, esperado, 0], escolha);
    }
  });

  await t('réplica M5, nota da marcação: o grifo guarda `atualizado_em`; a aba aberta antes que grava outra nota (ou vazio) recebe 409 com a nota salva, nada é gravado; trocar só a cor não disputa; a tela manda o `lido_em` e mostra as duas', async () => {
    const lia = await conta('Lia das Marcações');
    // (a migração é só de coluna: marcação antiga fica com '' — "nunca alterada")
    assert.ok(db.prepare("SELECT 1 FROM pragma_table_info('est_marcacoes') WHERE name = 'atualizado_em'").get(), 'coluna criada pela migração');
    let m = null;
    for (let bloco = 0; bloco < 8 && !m; bloco++) {
      const r0 = await req('POST', `${esc()}/marcacoes`, { jar: lia.jar, corpo: { unidade: 'rb-aula-1-2', bloco, inicio: 0, fim: 12, cor: 'amarelo' } });
      if (r0.st === 200) m = r0.json.marcacao;
    }
    assert.ok(m, 'a aula tem um bloco de leitura para grifar');
    assert.equal(m.atualizado_em, '', 'marcação nova: nota nunca alterada');
    const rota = `${esc()}/marcacoes/${m.id}`, noBanco = () => db.prepare('SELECT nota, cor, atualizado_em FROM est_marcacoes WHERE id = ?').get(m.id);
    // as duas abas leram a marcação sem nota; A grava a nota longa
    const NOTA = 'Exceção do § 2º — cai sempre em prova; rever com a súmula.';
    let r = await req('PUT', rota, { jar: lia.jar, corpo: { cor: 'amarelo', nota: NOTA, lido_em: '' } });
    assert.equal(r.st, 200, r.texto);
    const t1 = r.json.marcacao.atualizado_em;
    assert.ok(t1 && noBanco().nota === NOTA);
    // B, aberta antes, grava "B" e depois vazio: 409 nas duas, com a nota e a data do servidor — e a nota de A fica
    for (const nota of ['B', '']) {
      r = await req('PUT', rota, { jar: lia.jar, corpo: { cor: 'amarelo', nota, lido_em: '' } });
      assert.deepEqual([r.st, r.json.conflito, r.json.texto, r.json.atualizado_em], [409, true, NOTA, t1], 'nota ' + JSON.stringify(nota));
      assert.equal(noBanco().nota, NOTA, 'nada foi gravado por cima');
    }
    // trocar só a COR (mesma nota), mesmo com a leitura velha, não é conflito de texto — e não mexe na data da nota
    r = await req('PUT', rota, { jar: lia.jar, corpo: { cor: 'verde', nota: NOTA, lido_em: '' } });
    assert.deepEqual([r.st, noBanco().cor, noBanco().atualizado_em], [200, 'verde', t1]);
    // B escolhe "ficar com a que digitei": reenvia com a data que o 409 informou → grava
    r = await req('PUT', rota, { jar: lia.jar, corpo: { cor: 'verde', nota: 'B', lido_em: t1 } });
    assert.deepEqual([r.st, noBanco().nota], [200, 'B']);
    // sem `lido_em` (tela antiga, chamada direta): o de sempre
    assert.equal((await req('PUT', rota, { jar: lia.jar, corpo: { nota: 'direta' } })).st, 200);
    assert.equal((await req('GET', `${esc()}/marcacoes`, { jar: lia.jar })).json.marcacoes.find(x => x.id === m.id).atualizado_em, noBanco().atualizado_em, 'a lista leva a data que a tela vai mandar de volta');
    // na tela: o PUT leva o que foi lido, o 409 vira aviso com as duas escolhas, e a escolha "outra aba" não grava
    assert.ok(/api\('PUT', base\(\) \+ '\/marcacoes\/' \+ k\.id, \{ cor: cor \|\| k\.cor, nota: minha, lido_em: k\.atualizado_em \|\| '' \}\)/.test(TELA));
    assert.ok(/Esta anotação foi alterada em outra aba\.<\/b> O que está salvo/.test(TELA) && /data-c="meu">Ficar com a que digitei/.test(TELA) && /data-c="outro">Ficar com a da outra aba/.test(TELA));
    assert.ok(/if \(b\.getAttribute\('data-c'\) === 'outro'\) \{ k\.nota = d\.texto \|\| ''; fechar\(\); redesenhar\(\); return; \}/.test(TELA) && /\.es-mt-conflito\{/.test(CSS));
  });

  // ================= as baixas =================
  await t('réplica baixa 8: resposta em LISTA numa questão de uma alternativa só é 400 (e não vai para o caderno de erros); texto que não é texto é 400', async () => {
    const noa = await conta('Noa da Resposta Torta');
    const q = idQ(13), alts = R.Questoes.obter(q).alternativas.map(a => a.id);
    const evid = () => db.prepare('SELECT COUNT(*) n FROM est_evidencias WHERE user_id = ?').get(noa.id).n;
    for (const torta of [alts.slice(0, 2), [alts[0]], { a: 1 }, 7, true]) {
      const r = await req('POST', `${esc()}/questoes/${q}/responder`, { jar: noa.jar, corpo: { resposta: torta } });
      assert.equal(r.st, 400, JSON.stringify(torta) + ' → ' + r.texto);
    }
    assert.equal(evid(), 0, 'pedido torto não vira evidência');
    assert.equal((await req('GET', `${esc()}/erros`, { jar: noa.jar })).json.total, 0, 'nem erro no caderno');
    assert.equal((await req('POST', `${esc()}/questoes/${q}/responder`, { jar: noa.jar, corpo: { resposta: alts[0] } })).st, 200, 'a resposta certa de forma continua valendo');
    // texto do aluno tem de ser texto
    assert.equal((await req('GET', `${esc()}/unidades/rb-aula-2-1?aberta=1`, { jar: noa.jar })).st, 200);
    for (const [rota, corpo] of [[`${esc()}/unidades/rb-aula-2-1/nota`, { texto: { a: 1 } }], [`${esc()}/unidades/rb-aula-2-1/nota`, { texto: ['a'] }], [`${esc()}/unidades/rb-aula-2-1/blocos/1/tentativa`, { texto: { a: 1 } }], [`${esc()}/questoes/${q}/anotacao`, { texto: 12 }]]) {
      const r = await req('PUT', rota, { jar: noa.jar, corpo });
      assert.equal(r.st, 400, rota + ' ' + JSON.stringify(corpo) + ' → ' + r.texto);
      assert.ok(/texto/.test(r.json.erro));
    }
    assert.equal((await req('POST', `${esc()}/unidades/rb-aula-2-1/blocos/1/solucao`, { jar: noa.jar, corpo: { tentativa: { a: 'x'.repeat(40) } } })).st, 400);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM est_notas_aula WHERE user_id = ? AND texto LIKE '%object Object%'").get(noa.id).n, 0);
    assert.equal((await req('PUT', `${esc()}/unidades/rb-aula-2-1/nota`, { jar: noa.jar, corpo: { texto: 'texto de verdade' } })).st, 200);
  });

  await t('réplica baixa 7: card avaliado duas vezes no mesmo instante (duplo clique, duas abas) avança UM degrau — a segunda avaliação do dia devolve a agenda já gravada', async () => {
    const kai = await conta('Kai dos Cards');
    const dia = (await req('GET', `${esc()}/cards`, { jar: kai.jar })).json;
    assert.ok(dia.novos.length >= 2, 'há cards novos');
    const [k1, k2] = dia.novos;
    const evid = (id) => db.prepare("SELECT COUNT(*) n FROM est_evidencias WHERE user_id = ? AND origem = 'card' AND ref_id = ?").get(kai.id, id).n;
    const rev = (id) => db.prepare("SELECT passo, vencimento FROM est_revisoes WHERE user_id = ? AND alvo = 'card' AND alvo_id = ?").get(kai.id, id);
    const amanha = new Date(Date.parse(A.hojeBR() + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
    // em sequência
    const a = await req('POST', `${esc()}/cards/${k1.id}/avaliar`, { jar: kai.jar, corpo: { resultado: 'acerto' } });
    const b = await req('POST', `${esc()}/cards/${k1.id}/avaliar`, { jar: kai.jar, corpo: { resultado: 'acerto' } });
    assert.deepEqual([a.st, a.json.passo, a.json.vencimento, !!a.json.repetida], [200, 0, amanha, false]);
    assert.deepEqual([b.st, b.json.passo, b.json.vencimento, b.json.repetida], [200, 0, amanha, true], 'a segunda devolve a mesma agenda (antes: degrau 1, revisão em 3 dias)');
    assert.deepEqual([evid(k1.id), rev(k1.id)], [1, { passo: 0, vencimento: amanha }]);
    // ao mesmo tempo
    const juntos = await Promise.all([1, 2, 3].map(() => req('POST', `${esc()}/cards/${k2.id}/avaliar`, { jar: kai.jar, corpo: { resultado: 'acerto' } })));
    assert.ok(juntos.every(r => r.st === 200 && r.json.passo === 0 && r.json.vencimento === amanha), JSON.stringify(juntos.map(r => r.json)));
    assert.deepEqual([juntos.filter(r => r.json.repetida).length, evid(k2.id), rev(k2.id).passo], [2, 1, 0]);
    // o card que VENCEU é avaliado normalmente (a trava é só para o mesmo dia)
    db.prepare("UPDATE est_revisoes SET vencimento = ?, atualizado_em = ? WHERE user_id = ? AND alvo = 'card' AND alvo_id = ?").run(A.hojeBR(), new Date(Date.now() - 3 * 864e5).toISOString(), kai.id, k1.id);
    const c = await req('POST', `${esc()}/cards/${k1.id}/avaliar`, { jar: kai.jar, corpo: { resultado: 'acerto' } });
    assert.deepEqual([c.st, c.json.passo, !!c.json.repetida, evid(k1.id)], [200, 1, false, 2], 'no dia da revisão ele sobe o degrau seguinte');
  });

  await t('réplica baixa 6: a pontuação de lista do caderno (";" nas primeiras, "." na última) não denuncia mais a ordem quando a alternativa é embaralhada — na EXIBIÇÃO; o dado e o hash ficam', async () => {
    const lia = await conta('Lia da Pontuação');
    const lote = (await req('GET', `${esc()}/praticar?n=20`, { jar: lia.jar })).json.questoes;
    for (const i of [1, 2]) {
      const q = lote.find(x => x.id === idQ(i)), cru = R.Questoes.obter(idQ(i));
      assert.ok(q.alternativas.every(a => /[^;.]\.$/.test(a.texto)), `questão ${i}: todas terminam em ponto final: ${q.alternativas.map(a => a.texto).join(' | ')}`);
      assert.ok(!q.alternativas.some(a => /;|; e$/.test(a.texto)));
      assert.deepEqual(cru.alternativas.map(a => a.texto), ALTS_LISTA(i).map(a => a.texto), 'o dado do banco não mudou');
      assert.equal(banco.hashQuestao(cru), db.prepare('SELECT hash FROM est_questoes WHERE id = ?').get(cru.id).hash, 'nem o hash');
    }
    // ordem fixa: sai como está no caderno (ordem e pontuação)
    const fixa = lote.find(x => x.id === idQ(3));
    assert.deepEqual(fixa.alternativas.map(a => a.texto), ALTS_LISTA(3).map(a => a.texto));
    // alternativas sem pontuação de lista (frases, ou todas em ponto) não são tocadas
    const igual = (alts) => assert.deepEqual(banco.semPontuacaoDeLista(alts), alts);
    igual([{ id: 'a', texto: 'A regra é a do artigo 1º.' }, { id: 'b', texto: 'A regra é a do artigo 2º.' }, { id: 'c', texto: 'Não há regra.' }]);
    igual([{ id: 'a', texto: 'certa' }, { id: 'b', texto: 'errada; mas com ponto e vírgula no meio' }, { id: 'c', texto: 'outra' }]);
    igual([{ id: 'a', texto: 'só duas;' }, { id: 'b', texto: 'alternativas.' }]);
    assert.deepEqual(banco.semPontuacaoDeLista([{ id: 'a', texto: 'I, apenas;' }, { id: 'b', texto: 'II, apenas; ou' }, { id: 'c', texto: 'III, apenas;  ' }, { id: 'd', texto: 'todas.' }]).map(a => a.texto), ['I, apenas.', 'II, apenas.', 'III, apenas.', 'todas.']);
    // na prova: a exibição congelada também sai padronizada, e a correção continua batendo com o gabarito
    const p = banco.paraAluno(R.Questoes.obter(idQ(1)), 'semente');
    assert.ok(p.alternativas.every(a => /\.$/.test(a.texto)) && !p.ordem_fixa);
  });

  await t('réplica baixas 5 e 10: o simulado MISTURA reservadas e banco desde o primeiro — metade das vagas de cada bloco para reservadas inéditas, metade para questões inéditas do banco; ninguém fica de fora', async () => {
    assert.equal(A.SIMULADO_PCT_RESERVADAS, 50);
    const sol = await conta('Sol do Simulado');
    const usoDe = new Map(db.prepare("SELECT q.id, q.uso FROM est_questoes q JOIN est_questao_vinculos v ON v.questao_id = q.id WHERE v.escopo_id = ?").all(eid()).map(x => [x.id, x.uso]));
    const sairam = new Set();
    async function simulado() {
      const r = await req('POST', `${esc()}/tentativas`, { jar: sol.jar, corpo: { modo: 'simulado', n: 8 } });
      assert.equal(r.st, 200, r.texto);
      const itens = JSON.parse(db.prepare('SELECT congelado FROM est_tentativas WHERE id = ?').get(r.json.id).congelado).itens;
      const porBloco = {};
      for (const i of itens) { const b = porBloco[i.bloco] = porBloco[i.bloco] || { reservadas: 0, banco: 0 }; b[usoDe.get(i.id) === 'reservada' ? 'reservadas' : 'banco']++; sairam.add(i.id); }
      // responde tudo (certo) e envia: as questões passam a ser "já vistas"
      const respostas = Object.fromEntries(itens.map(i => [i.id, i.gabarito]));
      assert.equal((await req('PUT', `${esc()}/tentativas/${r.json.id}/respostas`, { jar: sol.jar, corpo: { respostas } })).st, 200);
      const fim = await req('POST', `${esc()}/tentativas/${r.json.id}/enviar`, { jar: sol.jar });
      assert.equal(fim.st, 200, fim.texto);
      return { porBloco, veredito: fim.json.resultado.veredito, sem_veredito: r.json.sem_veredito };
    }
    const s1 = await simulado();
    assert.deepEqual(s1.porBloco, { I: { reservadas: 2, banco: 2 }, II: { reservadas: 1, banco: 1 }, III: { reservadas: 1, banco: 1 } }, 'o PRIMEIRO simulado já traz questão do banco (antes: só reservadas) — e no formato 4/2/2');
    assert.deepEqual([s1.veredito, s1.sem_veredito], ['atingiu', false], 'simulado na proporção dos mínimos, sem `formato` cadastrado: tem veredito');
    const s2 = await simulado();
    assert.deepEqual(s2.porBloco, s1.porBloco, 'o segundo também (antes: só reservadas de novo)');
    assert.equal(sairam.size, 16, 'e sem repetir questão: inédita primeiro');
    const s3 = await simulado();
    assert.deepEqual(s3.porBloco.I, { reservadas: 2, banco: 2 });
    assert.equal(sairam.size, 24, 'em três simulados as 24 questões do percurso saíram — as do banco (e, no curso real, as de prova oficial) não ficam mais para depois das reservadas');
    // acabaram as inéditas: o quarto completa com as já vistas (reservadas antes das demais), sem faltar questão
    const s4 = await simulado();
    assert.deepEqual(s4.porBloco.I, { reservadas: 4, banco: 0 });
    // o TREINO continua sem reservada nenhuma
    const tr = await req('POST', `${esc()}/tentativas`, { jar: sol.jar, corpo: { modo: 'treino', n: 12 } });
    assert.equal(tr.st, 200, tr.texto);
    assert.ok(JSON.parse(db.prepare('SELECT congelado FROM est_tentativas WHERE id = ?').get(tr.json.id).congelado).itens.every(i => usoDe.get(i.id) !== 'reservada'));
    // e a tela diz o que o simulado usa
    assert.ok(/Simulado \(metade de questões reservadas, que não saem no Praticar; metade do banco\)/.test(TELA));
  });

  await t('réplica R3-M1 e baixas 1 a 4, na tela: o leitor reaberto pelo endereço não grava o corpo vazio; Fechar o leitor VOLTA no histórico em vez de empilhar; F5 numa porta pula o passo fantasma; abas com role e aria-selected; a aula interativa é diálogo com o foco dentro', async () => {
    // ---- baixa 1 (R3-M1): `guardarLugar` executada com a página ainda em "Carregando…" não apaga o lugar lembrado
    const lugar = { aulas: { abertos: [7], y: 1700 } };
    const corpo = { children: { length: 1 }, textContent: 'Carregando…', detalhes: [] };
    const ctx = vm.createContext({ E: { aba: 'aulas', abaArg: '', dentro: '' }, LISTAS: { aulas: 1 }, LUGAR: lugar, el: () => corpo, rolagem: () => ({ scrollTop: 0 }), cada: (c, sel, fn) => c.detalhes.forEach(fn) });
    vm.runInContext(funcaoDoFonte(TELA, 'guardarLugar'), ctx);
    vm.runInContext('guardarLugar()', ctx);
    assert.deepEqual(lugar.aulas, { abertos: [7], y: 1700 }, 'corpo ainda carregando: o lugar lembrado pelo passo do histórico fica (antes virava { abertos: [], y: 0 })');
    corpo.children.length = 12; corpo.textContent = 'Direito A…'; corpo.detalhes = [{ open: false }, { open: true }, { open: true }];
    vm.runInContext('guardarLugar()', ctx);
    assert.deepEqual(JSON.parse(JSON.stringify(lugar.aulas)), { abertos: [1, 2], y: 0 }, 'com a lista na tela, o lugar é guardado como sempre');
    const ler2 = funcaoDoFonte(TELA, 'lerDisciplina'), abrir = funcaoDoFonte(TELA, 'abrir');
    assert.ok(/if \(!pelaRota\) guardarLugar\(\);/.test(ler2) && /if \(!pelaRota\) rota\(\['curso', E\.pid, 'estude', E\.slug, 'aulas', 'ler', cod\]\);/.test(ler2), 'reaberto pelo endereço: nem guarda o lugar, nem empilha outro passo');
    assert.ok(/lerDisciplina\(el\('es-corpo'\), inicio\.extra, null, null, true\);/.test(abrir));
    // ---- baixa 2: o passo do leitor lembra de onde veio, e Fechar volta no histórico
    assert.ok(/leitor: E\.antesDoLeitor \|\| null/.test(funcaoDoFonte(TELA, 'lembrancas')), 'o passo do histórico do leitor leva de onde ele foi aberto');
    assert.ok(/E\.antesDoLeitor = inicio\.aba === 'aulas' && inicio\.arg === 'ler' && lembrado && lembrado\.leitor \? lembrado\.leitor : null;/.test(abrir), 'F5 ou Voltar para dentro do leitor: ele sabe para onde fechar');
    assert.ok(/window\.addEventListener\('popstate', aoVoltar, true\);[\s\S]{0,200}history\.back\(\);/.test(ler2), 'fechar = voltar um passo');
    assert.ok(/ir\(deOnde\.aba, deOnde\.arg, true, \{ reabrindo: true \}\);\s*if \(deOnde\.y > 0 && deOnde\.aba === 'unidade'\) reporRolagem\('unidade', deOnde\.y\);/.test(ler2), '…e a tela de baixo é pintada SUBSTITUINDO o passo (nada é empilhado), na rolagem em que estava');
    assert.ok(/if \(!deOnde \|\| !window\.history \|\| !history\.back\) return porBaixo\(\);/.test(ler2), 'sem passo abaixo (endereço colado noutra aba), fecha pelo caminho de sempre');
    // ---- baixa 3: F5 com uma porta aberta — o passo fantasma é pulado na largada (app-cliente.js)
    const cliente = ler('app-cliente.js');
    assert.ok(/if \(!bootAcademy\.pulou && st0 && \(st0\.esSobreposto \|\| st0\.porta\)\) \{ bootAcademy\.pulou = true; pularPassoFantasma\(\); \}/.test(cliente));
    assert.ok(/empilhar\(\{ porta: 1 \}\)/.test(ler('app-aluno.js')), 'a porta marca o próprio passo');
    // ---- baixa 4: abas para o leitor de tela; a aula interativa e o mapa como diálogo, com o foco dentro
    const abas = funcaoDoFonte(TELA, 'abas'), marcar = funcaoDoFonte(TELA, 'marcarAba');
    assert.ok(/setAttribute\('role', 'tablist'\)/.test(abas) && /role="tab" aria-selected="false" aria-controls="es-corpo"/.test(abas));
    assert.ok(/b\.setAttribute\('aria-selected', on \? 'true' : 'false'\)/.test(marcar));
    assert.ok(/marcarAba\(aba\);/.test(funcaoDoFonte(TELA, 'ir')), 'toda troca de tela atualiza a aba selecionada');
    // executada: a aba aberta fica com aria-selected="true"; numa tela que não é aba (a aula), nenhuma
    const bts = ['hoje', 'aulas', 'prova'].map(a => ({ a, attrs: {}, on: false, getAttribute() { return this.a; }, setAttribute(k, v) { this.attrs[k] = v; }, classList: { toggle() {} } }));
    const cx2 = vm.createContext({ el: () => ({}), cada: (c, sel, fn) => bts.forEach(fn) });
    vm.runInContext(marcar, cx2);
    vm.runInContext("marcarAba('aulas')", cx2);
    assert.deepEqual(bts.map(b => b.attrs['aria-selected']), ['false', 'true', 'false']);
    vm.runInContext("marcarAba('unidade')", cx2);
    assert.deepEqual(bts.map(b => b.attrs['aria-selected']), ['false', 'false', 'false']);
    const dialogo = funcaoDoFonte(TELA, 'comoDialogo');
    assert.ok(/setAttribute\('role', 'dialog'\)/.test(dialogo) && /aria-modal/.test(dialogo) && /\(f\[0\] \|\| ov\)\.focus\(/.test(dialogo), 'aberta (com Enter ou com o mouse), o foco entra na camada');
    assert.ok(/comoDialogo\(/.test(funcaoDoFonte(TELA, 'aulaAnimada')) && /comoDialogo\(/.test(funcaoDoFonte(TELA, 'animarMapa')), 'a aula interativa e o mapa que se desenha passam por ela');
  });
}

module.exports = { rodar };
