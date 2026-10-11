// =====================================================================
// Villela Academy — ESTUDO · testes da PARIDADE com os outros cursos
// (docs\estudo\paridade-com-os-outros-cursos.md, etapa 1). Chamado pelo
// selftest da Academy logo depois dos testes do Estude.
//
// Monta um curso que SÓ hospeda o Estude — uma aula-casca e um percurso de
// três aulas — com duas alunas: a Nara (faz tudo) e a Lia (não pode ver nada
// da Nara, e no fim exclui a conta). Cobre: as portas da barra do curso, o
// quiz dentro da aula, o caderno (tentativa, nota, "Meu caderno"), o vídeo
// que lembra onde parou, a biblioteca, o certificado pelo critério do Estude,
// o Tutor por aula, a marca das dicas, a guarda de 6 meses do áudio da prova
// oral e a LGPD. Datas calculadas a partir de hoje — nada de dia fixo.
// =====================================================================
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function rodar({ t, req }) {
  const { db, nowISO, novoId, j } = require('../db');
  const ct = require('../repo-conteudo');
  const repo = require('../repo');
  const R = require('./repo');
  const A = require('./aluno');
  const ped = require('./pedidos');
  const gov = require('../governanca');
  const iaM = require('../ia');
  const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  console.log('\n— estudo/paridade: barra do curso, quiz na aula, caderno, vídeo, biblioteca, certificado, Tutor, áudio da oral e LGPD —');
  const PROD = 'maria@t.com', SLUG = 'so-estude';
  const NARA = { nome: 'Nara Concurseira', email: 'nara@t.com', senha: 'senha-forte-nara', aceite_termos: true };
  const LIA = { nome: 'Lia de Saída', email: 'lia@t.com', senha: 'senha-forte-lia', aceite_termos: true };
  let pid = '', cascaId = '';
  const E = (extra = {}) => ({ produtor_email: PROD, produto_id: pid, ...extra });
  const chave = (m, rota, corpo) => req(m, rota, { semUser: true, chave: true, corpo });
  const uid = (email) => repo.Usuarios.porEmail(email).id;
  const ALTS = (i) => [
    { texto: `certa ${i}`, correta: true, explicacao: 'Certa: é o que a regra diz.' },
    { texto: `errada ${i}a`, correta: false, explicacao: 'Errada: troca a regra pela exceção.' },
    { texto: `errada ${i}b`, correta: false, explicacao: 'Errada: confunde os dois institutos.' }];
  const Q = (i, extra = {}) => ({ tipo: 'objetiva', origem: 'autoral', enunciado: `Paridade, questão ${i}: qual é a regra aplicável ao ponto estudado?`, alternativas: ALTS(i), ...extra });
  const UN = (codigo, titulo, comp, item, extra = {}) => ({ codigo, titulo, competencias: [comp], itens: [item], tempo_min: 40,
    blocos: [
      { tipo: 'explicacao', texto: `Explicação da ${titulo}: a regra geral, a exceção e o que a banca costuma trocar.` },
      { tipo: 'pratica', texto: `Prática da ${titulo}: aplique a regra ao caso e escreva a sua resposta.`, solucao: `Solução guardada da ${titulo}.` }], ...extra });
  const base = () => `/academy/api/aluno/cursos/${pid}/estudo`;
  const esc = () => `${base()}/${SLUG}`;
  const idQ = (i) => db.prepare('SELECT id FROM est_questoes WHERE dados LIKE ?').get(`%Paridade, questão ${i}:%`).id;
  const responder = (jar, i, resposta = 'a') => req('POST', `${esc()}/questoes/${idQ(i)}/responder`, { jar, corpo: { resposta } });

  await t('paridade: o curso que só hospeda o Estude — uma aula-casca, três aulas no percurso, duas alunas', async () => {
    let r = await chave('POST', '/staff/api/academy/importar-curso', { produtor_email: PROD,
      produto: { titulo: 'Curso Só Estude', tipo: 'curso', categoria: 'desenvolvimento-pessoal', descricao_curta: 'Só o percurso' },
      modulos: [{ titulo: 'Comece por aqui', aulas: [{ titulo: 'Aula de orientação', tipo: 'texto', conteudo: 'O conteúdo está no Estude.' }] }] });
    assert.equal(r.st, 200, r.texto);
    pid = r.json.produto.id;
    cascaId = db.prepare('SELECT id FROM lessons WHERE product_id = ?').get(pid).id;
    r = await chave('POST', '/staff/api/academy/estudo/importar', E({
      escopo: { slug: SLUG, tipo: 'edital', titulo: 'Percurso do curso só Estude' },
      programa: { documento: { nome: 'Edital de teste', tipo: 'edital' }, texto: '1. Disciplina de Teste\n1.1 Ponto um\n1.2 Ponto dois\n1.3 Ponto três' },
      competencias: ['um', 'dois', 'tres'].map(n => ({ codigo: 'c-' + n, resultado: `Diante de um caso do ponto ${n}, o aluno aplica a regra e justifica a resposta.` })),
      vinculos: [['1.1', 'c-um'], ['1.2', 'c-dois'], ['1.3', 'c-tres']].map(([item, competencia]) => ({ item, competencia, justificativa: 'O item é a própria regra.' })),
      unidades: [UN('aula-um', 'Aula um', 'c-um', '1.1'), UN('aula-dois', 'Aula dois', 'c-dois', '1.2'), UN('aula-tres', 'Aula três', 'c-tres', '1.3', { tempo_min: 100 })],
      // seis questões da aula um (a sexta ligada só ao ITEM), uma da aula dois; a aula três só tem card
      questoes: [1, 2, 3, 4, 5].map(i => Q(i, { competencias: ['c-um'] }))
        .concat([Q(6, { competencias: [], itens: [{ codigo: '1.1', justificativa: 'Cobra o ponto um.' }] }), Q(7, { competencias: ['c-dois'] })]),
      cards: [{ competencia: 'c-tres', frente: 'Qual é a regra do ponto três?', verso: 'A regra geral.' }] }));
    assert.equal(r.st, 200, r.texto);
    r = await chave('POST', '/staff/api/academy/estudo/status', E({ escopo: SLUG, status: 'publicado', unidades: 'publicado', cards: 'publicado', questoes: 'disponivel' }));
    assert.equal(r.st, 200, r.texto);
    for (const [u, jar] of [[NARA, 'nara'], [LIA, 'lia']]) {
      assert.equal((await req('POST', '/academy/api/signup', { corpo: u, jar })).st, 200);
      const m = await req('POST', `/academy/api/produtor/produtos/${pid}/matricular`, { jar: 'maria', corpo: { email: u.email } });
      assert.equal(m.st, 200, m.texto);
    }
    assert.equal((await req('GET', `${esc()}/painel`, { jar: 'nara' })).st, 200);
  });

  // ================= A. PORTAS NA BARRA DO CURSO =================
  await t('paridade/portas: cada botão da barra só existe quando o curso tem aquilo; XP da jornada comum e Ferramentas de IA ficam de fora', async () => {
    const tela = ler('app-aluno.js');
    const ini = tela.indexOf('var PORTAS_DA_JORNADA'), fim = tela.indexOf('function ligarBarraDoEstude');
    assert.ok(ini > 0 && fim > ini, 'a barra do curso existe no app do aluno');
    const barra = (C) => new Function('C', 'esc', 'botaoAudiobook', tela.slice(ini, fim) + ';return barraDoEstude();')(C, (x) => String(x), (fx) => ((fx || []).length ? '<button id="al-ab">audiobook</button>' : ''));
    const portas = (h) => (h.match(/data-porta="([a-z]+)"/g) || []).map(x => x.slice(12, -1));
    const painel = async () => (await req('GET', `/academy/api/aluno/cursos/${pid}/jornada`, { jar: 'nara' })).json;
    const curso = async () => (await req('GET', `/academy/api/aluno/cursos/${pid}`, { jar: 'nara' })).json;
    // curso sem nada: só "Avaliar" (a aluna está matriculada); visitante não vê nem isso
    let d = await curso();
    assert.deepEqual(portas(barra({ d, jr: await painel() })), ['avaliar']);
    assert.equal(barra({ d: { ...d, matriculado: false }, jr: await painel() }), '', 'sem conteúdo e sem matrícula, a barra fica vazia');
    // desafio e folhas de revisão importados: em RASCUNHO a aluna ainda não vê; publicados, aparecem — e só eles
    const jor = E({ desafio: { titulo: 'Largada de 7 dias', dias: [1, 2, 3, 4, 5, 6, 7].map(n => ({ titulo: `Dia ${n}`, tarefa: `Faça a tarefa de estudo do dia ${n} com calma.` })) },
      recursos: { itens: [{ tipo: 'template', titulo: 'Estrutura de sentença', corpo: 'Relatório. Fundamentação. Dispositivo. Confira cada pedido antes de fechar.' }] } });
    let r = await chave('POST', '/staff/api/academy/jornada/importar', jor);
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual(portas(barra({ d, jr: await painel() })), ['avaliar'], 'rascunho não abre porta para a aluna');
    r = await chave('POST', '/staff/api/academy/jornada/status', E({ todas: 'publicado' }));
    assert.equal(r.st, 200, r.texto);
    const h = barra({ d: { ...d, audiobook: [{ id: 'f1' }], materiais_curso: [{ nome: 'Edital.pdf', media_id: 'm1' }] }, jr: await painel() });
    assert.deepEqual(portas(h), ['desafio', 'recursos', 'material', 'avaliar'], 'só o que o curso tem: ' + h);
    assert.ok(h.includes('id="al-ab"') && h.includes('Largada de 7 dias') && h.includes('Material do curso · 1'));
    assert.ok(!/visao|ferramentas|avaliacao|Minha jornada/.test(h), 'o cartão de XP, o diagnóstico da jornada comum e as Ferramentas não entram');
    // a tela da jornada aberta daqui só mostra as abas das portas, e o Voltar devolve ao Estude
    assert.ok(/var PORTAS_DA_JORNADA = \['desafio', 'simulacoes', 'lab', 'recursos'\]/.test(tela) && /\{ so: PORTAS_DA_JORNADA, rotuloVoltar: 'Voltar ao Estude' \}/.test(tela));
    assert.ok(/function \(\) \{ voltarAoEstude\(pid\); \}/.test(tela) && /y: \(document\.scrollingElement/.test(tela), 'toda porta devolve ao lugar do Estude, com a rolagem');
    const jr = ler('app-jornada.js');
    assert.ok(/J\.so = Array\.isArray\(opcoes\.so\)/.test(jr) && /lista = lista\.filter\(function \(x\) \{ return J\.so\.indexOf\(x\[0\]\) >= 0; \}\)/.test(jr), 'com `so`, as outras abas não aparecem');
    // o servidor da jornada serve o produto que hospeda o Estude
    assert.equal((await req('GET', `/academy/api/aluno/cursos/${pid}/desafio`, { jar: 'nara' })).st, 200);
    assert.equal((await req('GET', `/academy/api/aluno/cursos/${pid}/lab`, { jar: 'nara' })).st, 404, 'seção que o curso não tem não existe');
  });

  // ================= B. QUIZ DENTRO DA AULA =================
  await t('paridade/quiz: até 5 questões da aula vindas do banco, sem gabarito; responder registra evidência; a já vista vai para o fim', async () => {
    let qz = await req('GET', `${esc()}/unidades/aula-um/quiz`, { jar: 'nara' });
    assert.equal(qz.st, 200, qz.texto);
    assert.deepEqual([qz.json.total, qz.json.ineditas, qz.json.questoes.length, qz.json.limite, qz.json.competencia], [6, 6, 5, A.QUIZ_DA_AULA, 'c-um'], 'conta a questão ligada à competência e a ligada ao item');
    assert.ok(!/"correta"|"explicacao"|Certa: é o que/.test(qz.texto), 'o quiz não leva gabarito ao navegador');
    assert.ok(qz.json.questoes.every(q => q.ja_vista === false));
    const primeira = qz.json.questoes[0].id;
    const antes = db.prepare('SELECT COUNT(*) n FROM est_evidencias WHERE user_id = ?').get(uid(NARA.email)).n;
    const r = await req('POST', `${esc()}/questoes/${primeira}/responder`, { jar: 'nara', corpo: { resposta: 'a' } });
    assert.equal(r.st, 200, r.texto);
    assert.deepEqual([r.json.acerto, r.json.conta_como], [true, 'demonstração sem apoio'], 'a correção é a do Praticar');
    assert.ok(r.json.alternativas.every(a => a.explicacao), 'e a explicação de cada alternativa vem depois de responder');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM est_evidencias WHERE user_id = ? AND ref_id = ?').get(uid(NARA.email), primeira).n, 1, 'a evidência foi registrada');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM est_evidencias WHERE user_id = ?').get(uid(NARA.email)).n, antes + 1);
    qz = await req('GET', `${esc()}/unidades/aula-um/quiz`, { jar: 'nara' });
    assert.deepEqual([qz.json.total, qz.json.ineditas], [6, 5]);
    assert.ok(!qz.json.questoes.some(q => q.id === primeira), 'as cinco inéditas vêm antes da já respondida');
    for (const q of qz.json.questoes.slice(0, 4)) await req('POST', `${esc()}/questoes/${q.id}/responder`, { jar: 'nara', corpo: { resposta: 'a' } });
    qz = await req('GET', `${esc()}/unidades/aula-um/quiz`, { jar: 'nara' });
    assert.deepEqual(qz.json.questoes.map(q => q.ja_vista), [false, true, true, true, true], 'inédita primeiro, vistas depois');
    // aula sem questão diz que não tem; aula de outro curso ou inexistente não abre
    const vazio = await req('GET', `${esc()}/unidades/aula-tres/quiz`, { jar: 'nara' });
    assert.deepEqual([vazio.json.total, vazio.json.questoes.length], [0, 0]);
    assert.equal((await req('GET', `${esc()}/unidades/nao-existe/quiz`, { jar: 'nara' })).st, 404);
    assert.equal((await req('GET', `${esc()}/unidades/aula-um/quiz`, { jar: 'caio' })).st, 403, 'quem não tem o curso não entra');
    const tela = ler('app-estudo.js');
    assert.ok(tela.includes('<h4>Quiz desta aula</h4>') && tela.includes('Praticar todas') && tela.includes('Esta aula ainda não tem questões no banco'));
    assert.ok((tela.match(/\/responder'/g) || []).length === 1 && tela.includes('function questaoNaTela('), 'o quiz e o Praticar respondem pela MESMA função da tela — uma rota de correção só');
  });

  // ================= C. CADERNO =================
  await t('paridade/caderno: a tentativa do bloco fica guardada e volta preenchida; a nota da aula salva sozinha', async () => {
    const un = `${esc()}/unidades/aula-um`;
    assert.deepEqual((await req('GET', un, { jar: 'nara' })).json.tentativas, {});
    assert.equal((await req('POST', `${un}/blocos/1/solucao`, { jar: 'nara', corpo: { tentativa: 'curta' } })).st, 400, 'continua exigindo a tentativa antes da solução');
    const sol = await req('POST', `${un}/blocos/1/solucao`, { jar: 'nara', corpo: { tentativa: 'TENTATIVA-DA-NARA: aplico a regra geral ao caso.' } });
    assert.ok(/Solução guardada/.test(sol.json.solucao), sol.texto);
    let u = (await req('GET', un, { jar: 'nara' })).json;
    assert.equal(u.tentativas[1].texto, 'TENTATIVA-DA-NARA: aplico a regra geral ao caso.', 'antes o texto era conferido e descartado');
    assert.ok(u.tentativas[1].atualizado_em, 'com a data');
    // salvar sozinho (sem pedir a solução), reescrever e apagar; bloco de explicação não pede tentativa
    let r = await req('PUT', `${un}/blocos/1/tentativa`, { jar: 'nara', corpo: { texto: 'TENTATIVA-DA-NARA: versão dois, mais completa.' } });
    assert.equal(r.st, 200, r.texto);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM est_tentativas_bloco WHERE user_id = ?').get(uid(NARA.email)).n, 1, 'uma linha por (aluno, percurso, aula, bloco)');
    assert.equal((await req('PUT', `${un}/blocos/0/tentativa`, { jar: 'nara', corpo: { texto: 'não cabe aqui' } })).st, 404);
    assert.equal((await req('PUT', `${un}/blocos/9/tentativa`, { jar: 'nara', corpo: { texto: 'bloco que não existe' } })).st, 404);
    r = await req('PUT', `${un}/nota`, { jar: 'nara', corpo: { texto: 'NOTA-DA-NARA: rever a exceção antes da prova.' } });
    assert.deepEqual([r.st, r.json.texto], [200, 'NOTA-DA-NARA: rever a exceção antes da prova.']);
    u = (await req('GET', un, { jar: 'nara' })).json;
    assert.deepEqual([u.tentativas[1].texto, u.nota.texto], ['TENTATIVA-DA-NARA: versão dois, mais completa.', 'NOTA-DA-NARA: rever a exceção antes da prova.']);
    const daLia = (await req('GET', un, { jar: 'lia' })).json;
    assert.deepEqual([daLia.tentativas, daLia.nota.texto], [{}, ''], 'a outra aluna abre a mesma aula em branco');
    assert.ok(!/Solução guardada/.test(JSON.stringify(u)), 'a solução continua fora da aula');
  });

  await t('paridade/caderno: "Meu caderno" reúne tentativas, nota da aula, marcação com nota e anotação de erro — e outra aluna não vê', async () => {
    // marcação COM nota (entra) e sem nota (não entra); anotação do caderno de erros numa questão da aula dois
    const m = await req('POST', `${esc()}/marcacoes`, { jar: 'nara', corpo: { unidade: 'aula-um', bloco: 0, inicio: 0, fim: 10, cor: 'verde', nota: 'MARCA-DA-NARA: cai em prova' } });
    assert.equal(m.st, 200, m.texto);
    await req('POST', `${esc()}/marcacoes`, { jar: 'nara', corpo: { unidade: 'aula-um', bloco: 0, inicio: 12, fim: 20, cor: 'azul' } });
    assert.equal((await responder('nara', 7, 'b')).json.acerto, false);
    assert.equal((await req('PUT', `${esc()}/questoes/${idQ(7)}/anotacao`, { jar: 'nara', corpo: { texto: 'ANOTACAO-DA-NARA: confundi a regra com a exceção.' } })).st, 200);
    const c = await req('GET', `${esc()}/caderno`, { jar: 'nara' });
    assert.equal(c.st, 200, c.texto);
    assert.deepEqual(c.json.total, { tentativas: 1, notas: 1, marcacoes: 1, anotacoes: 1 });
    assert.deepEqual(c.json.disciplinas.map(d => d.aulas.map(a => a.codigo)), [['aula-um', 'aula-dois']], 'por disciplina e aula, só as aulas com algo escrito: ' + JSON.stringify(c.json.disciplinas.map(d => d.nome)));
    const [a1, a2] = c.json.disciplinas[0].aulas;
    assert.deepEqual([a1.nota.texto, a1.tentativas[0].texto, a1.tentativas[0].tipo, a1.marcacoes[0].nota], ['NOTA-DA-NARA: rever a exceção antes da prova.', 'TENTATIVA-DA-NARA: versão dois, mais completa.', 'pratica', 'MARCA-DA-NARA: cai em prova']);
    assert.ok(/Prática da Aula um/.test(a1.tentativas[0].enunciado), 'a tentativa vem com o enunciado do exercício');
    assert.deepEqual([a2.anotacoes.length, a2.anotacoes[0].texto], [1, 'ANOTACAO-DA-NARA: confundi a regra com a exceção.']);
    assert.ok(!/Solução guardada|"correta"/.test(c.texto), 'o caderno é o que ELA escreveu: nem solução nem gabarito');
    const lia = await req('GET', `${esc()}/caderno`, { jar: 'lia' });
    assert.deepEqual([lia.json.total, lia.json.disciplinas], [{ tentativas: 0, notas: 0, marcacoes: 0, anotacoes: 0 }, []]);
    assert.ok(!/DA-NARA/.test(lia.texto), 'nada da Nara no caderno da Lia');
    assert.ok(!/DA-NARA/.test((await req('GET', `${esc()}/caderno`, { jar: 'maria' })).texto), 'nem no da dona do curso');
    assert.equal((await req('GET', `${esc()}/caderno`, { jar: 'caio' })).st, 403);
    // a tela: botão na barra do curso e no Plano, busca, e versão que abre para LER — imprimir é um botão
    const tela = ler('app-estudo.js');
    for (const pedaco of ['📓 Meu caderno', 'id="es-pl-cad"', 'id="es-cad-busca"', 'Minhas anotações desta aula', 'id="cd-imprimir">🖨️ Imprimir ou salvar em PDF', 'caderno: caderno']) assert.ok(tela.includes(pedaco), 'falta na tela: ' + pedaco);
    const i = tela.indexOf('function escreverCaderno'), f = tela.indexOf('function caderno(alvo)');
    assert.ok(i > 0 && f > i && /bi\.onclick = function \(\) \{ w\.print\(\); \}/.test(tela.slice(i, f)) && (tela.slice(i, f).match(/print\(\)/g) || []).length === 1, 'a impressão só acontece no clique do aluno');
  });

  // ================= D4. VÍDEO DA AULA =================
  await t('paridade/vídeo: a posição mora no servidor, por aula; a partir de 90 % conta como assistido e não volta atrás', async () => {
    db.prepare("UPDATE est_unidades SET video_media_id = 'video-de-teste', video_duracao_seg = 200 WHERE codigo = 'aula-um' AND escopo_id = ?").run(R.Escopos.porSlug(pid, SLUG).id);
    const un = `${esc()}/unidades/aula-um`, v = (corpo, jar = 'nara') => req('PUT', `${un}/video`, { jar, corpo });
    assert.deepEqual((await req('GET', un, { jar: 'nara' })).json.video, { media_id: 'video-de-teste', duracao_seg: 200, posicao_seg: 0, assistido: false });
    let r = await v({ posicao_seg: 80, duracao_seg: 9999 });
    assert.deepEqual([r.st, r.json.posicao_seg, r.json.assistido], [200, 80, false], r.texto);
    assert.equal((await req('GET', un, { jar: 'nara' })).json.video.posicao_seg, 80, 'reabrir a aula retoma do ponto');
    assert.equal((await v({ posicao_seg: 179 })).json.assistido, false, '89,5 % ainda não');
    assert.equal((await v({ posicao_seg: 180 })).json.assistido, true, `${A.VIDEO_ASSISTIDO_PCT} % marca como assistido`);
    r = await v({ posicao_seg: 30 });
    assert.deepEqual([r.json.posicao_seg, r.json.assistido], [30, true], 'rever um trecho não desmarca');
    assert.equal((await v({ posicao_seg: 199 })).json.posicao_seg, 0, 'chegou ao fim: da próxima vez começa do início');
    const p = (await req('GET', `${esc()}/painel`, { jar: 'nara' })).json;
    assert.deepEqual(p.unidades.map(u => [u.codigo, u.video_assistido]), [['aula-um', true], ['aula-dois', false], ['aula-tres', false]], 'a lista de aulas sabe quem já foi assistido');
    assert.equal((await req('GET', `${esc()}/painel`, { jar: 'lia' })).json.unidades[0].video_assistido, false, 'é por aluna');
    assert.equal((await v({ posicao_seg: 10 }, 'caio')).st, 403);
    assert.equal((await req('PUT', `${esc()}/unidades/aula-dois/video`, { jar: 'nara', corpo: { posicao_seg: 10 } })).st, 404, 'aula sem videoaula');
    const tela = ler('app-estudo.js');
    assert.ok(tela.includes('function ligarVideoDaAula(') && tela.includes('vídeo ✓ assistido') && tela.includes("'/video', { posicao_seg:"));
  });

  // ================= D3. BIBLIOTECA =================
  await t('paridade/biblioteca: progresso do percurso (aulas estudadas / aulas) no lugar de "0 de 1 conteúdos", e o Continuar leva à última aula aberta', async () => {
    const bib = async (jar) => { const r = await req('GET', '/academy/api/aluno/biblioteca', { jar }); assert.equal(r.st, 200, r.texto); return r.json; };
    let b = await bib('lia');
    let c = b.cursos.find(x => x.product_id === pid);
    assert.deepEqual(c.progresso, { total_aulas: 3, concluidas: 0, pct: 0, estude: true }, 'três aulas do percurso, não a aula-casca');
    assert.deepEqual([c.estude.slug, c.estude.continuar], [SLUG, null], 'quem ainda não abriu aula nenhuma não tem para onde continuar');
    // a Nara respondeu questões das aulas um e dois (critério do painel: "estudados por você")
    b = await bib('nara');
    c = b.cursos.find(x => x.product_id === pid);
    assert.deepEqual(c.progresso, { total_aulas: 3, concluidas: 2, pct: 67, estude: true });
    const painel = (await req('GET', `${esc()}/painel`, { jar: 'nara' })).json;
    assert.deepEqual([painel.cobertura.estudo.estudados, painel.unidades.filter(u => u.estudada).length], [2, 2], 'a mesma régua do painel do Estude');
    // pedir a unidade para o mapa não é "abrir a aula"; a tela da aula é
    assert.equal(c.estude.continuar, null);
    await req('GET', `${esc()}/unidades/aula-dois`, { jar: 'nara' });
    assert.equal((await bib('nara')).cursos.find(x => x.product_id === pid).estude.continuar, null, 'sem `aberta=1` não conta');
    await req('GET', `${esc()}/unidades/aula-um?aberta=1`, { jar: 'nara' });
    await new Promise(ok => setTimeout(ok, 15));
    await req('GET', `${esc()}/unidades/aula-dois?aberta=1`, { jar: 'nara' });
    b = await bib('nara');
    c = b.cursos.find(x => x.product_id === pid);
    assert.deepEqual([c.estude.continuar.slug, c.estude.continuar.unidade, c.estude.continuar.titulo], [SLUG, 'aula-dois', 'Aula dois']);
    assert.deepEqual([b.continuar.product_id, b.continuar.aula_titulo, b.continuar.estude], [pid, 'Aula dois', { slug: SLUG, unidade: 'aula-dois' }], 'o "Continuar de onde parou" aponta a aula do Estude');
    // curso comum continua como era
    const comum = (await bib('ana')).cursos.find(x => !x.estude);
    assert.ok(comum && !('estude' in comum.progresso) && 'total_aulas' in comum.progresso, 'curso sem percurso publicado segue pelo progresso das aulas');
    const tela = ler('app-aluno.js');
    assert.ok(tela.includes("(p.estude ? ' aulas estudadas' : ' conteúdos')") && tela.includes('data-es-slug') && tela.includes("{ estude: { slug: slug, aba: 'unidade', arg: un } }"));
  });

  // ================= D1. CERTIFICADO =================
  await t('paridade/certificado: a casca não conta; falta aula ou simulado, diz o que falta; cumprido, emite — de conclusão, curso livre, sem validade para o MEC', async () => {
    const cert = (jar) => req('POST', `/academy/api/aluno/cursos/${pid}/certificado`, { jar });
    const concl = async (jar) => (await req('GET', `${esc()}/painel`, { jar })).json.conclusao;
    // a Lia conclui a ÚNICA aula do curso (a casca): pelo critério antigo isso era 100 % e certificado na mão
    const pr = await req('POST', `/academy/api/aluno/aulas/${cascaId}/progresso`, { jar: 'lia', corpo: { concluida: true } });
    assert.deepEqual([pr.st, pr.json.progresso.pct], [200, 100], pr.texto);
    let r = await cert('lia');
    assert.equal(r.st, 409, r.texto);
    assert.ok(/falta.* 3 aulas e 1 simulado/.test(r.json.erro), r.json.erro);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM certificates WHERE product_id = ?').get(pid).n, 0, 'concluir a aula-casca não conta para nada');
    // a Nara: duas aulas estudadas; falta a terceira e o simulado
    let k = await concl('nara');
    assert.deepEqual([k.total_aulas, k.estudadas, k.faltam_aulas, k.provas_enviadas, k.faltam_provas, k.cumprido, k.carga_horaria_min], [3, 2, 1, 0, 1, false, 180]);
    r = await cert('nara');
    assert.ok(r.st === 409 && /falta.* 1 aula e 1 simulado/.test(r.json.erro), r.texto);
    // a aula três não tem questão: estuda-se pelo card (resposta de card também é "respondeu algo")
    const cards = (await req('GET', `${esc()}/cards`, { jar: 'nara' })).json;
    assert.equal((await req('POST', `${esc()}/cards/${cards.novos[0].id}/avaliar`, { jar: 'nara', corpo: { resultado: 'acerto' } })).st, 200);
    r = await cert('nara');
    assert.ok(r.st === 409 && /falta 1 simulado/.test(r.json.erro) && !/aula[s]? e/.test(r.json.erro), 'só o simulado: ' + r.texto);
    // treino enviado não é simulado; simulado ABERTO (não enviado) também não
    let tt = await req('POST', `${esc()}/tentativas`, { jar: 'nara', corpo: { modo: 'treino', n: 2 } });
    assert.equal(tt.st, 200, tt.texto);
    await req('POST', `${esc()}/tentativas/${tt.json.id}/enviar`, { jar: 'nara' });
    assert.equal((await concl('nara')).provas_enviadas, 0, 'treino não vale como prova do percurso');
    tt = await req('POST', `${esc()}/tentativas`, { jar: 'nara', corpo: { modo: 'simulado', n: 5 } });
    assert.equal(tt.st, 200, tt.texto);
    assert.equal((await cert('nara')).st, 409, 'simulado aberto ainda não conta');
    assert.equal((await req('POST', `${esc()}/tentativas/${tt.json.id}/enviar`, { jar: 'nara' })).st, 200);
    k = await concl('nara');
    assert.deepEqual([k.estudadas, k.provas_enviadas, k.cumprido, k.falta_txt, k.certificado], [3, 1, true, '', '']);
    r = await cert('nara');
    assert.equal(r.st, 200, r.texto);
    const linha = gov.Certificados.porCodigo(r.json.codigo);
    assert.deepEqual([linha.tipo, linha.total_aulas, linha.carga_horaria_min, linha.aluno_nome], ['estude', 3, 180, NARA.nome], 'as aulas e a carga horária são as do percurso');
    assert.equal((await cert('nara')).json.codigo, r.json.codigo, 'emitir de novo devolve o mesmo');
    assert.equal((await concl('nara')).certificado, r.json.codigo, 'a tela passa a oferecer "ver o meu certificado"');
    const pg = await req('GET', r.json.url);
    assert.equal(pg.st, 200);
    assert.ok(pg.texto.includes('Curso livre. Certificado emitido pela Villela Academy, sem validade para o MEC.'), 'a frase está visível na página do certificado e de verificação');
    assert.ok(pg.texto.includes('Certificado de Conclusão') && pg.texto.includes('carga horária de 3 hora(s)') && pg.texto.includes('3 aula(s)'));
    assert.ok(!/aprova[cç][aã]o|aprovad/i.test(pg.texto), 'é certificado de CONCLUSÃO: a palavra "aprovação" não aparece');
    // os outros cursos continuam como eram: sem a frase, pelo critério de 100 % das aulas
    const outro = db.prepare("SELECT * FROM certificates WHERE tipo = '' LIMIT 1").get();
    assert.ok(outro, 'a suíte emitiu um certificado de curso comum antes');
    const pgOutro = await req('GET', '/academy/certificados/' + outro.id);
    assert.ok(pgOutro.st === 200 && !pgOutro.texto.includes('sem validade para o MEC') && !pgOutro.texto.includes('carga horária'), 'o certificado dos outros cursos não mudou');
    assert.equal(R.Escopos.temDoCurso(outro.product_id), false);
    // percurso em RASCUNHO não emite (e não cai no critério da casca); percurso particular não emite nem soma
    const eid = R.Escopos.porSlug(pid, SLUG).id;
    db.prepare("UPDATE est_escopos SET status = 'rascunho' WHERE id = ?").run(eid);
    r = await cert('lia');
    assert.ok(r.st === 409 && /ainda não emite certificado/.test(r.json.erro), r.texto);
    db.prepare("UPDATE est_escopos SET status = 'publicado' WHERE id = ?").run(eid);
    const part = R.criarParticular(ct.Produtos.obter(pid), repo.Usuarios.porEmail(LIA.email), 'Meu percurso de teste');
    assert.equal((await req('GET', `${base()}/${part.slug}/painel`, { jar: 'lia' })).json.conclusao, null, 'percurso particular não tem certificado');
    assert.equal(A.conclusao(uid(LIA.email), pid).total_aulas, 3, 'e não entra na conta do curso');
    assert.deepEqual([A.CERT_PCT_AULAS_ESTUDADAS, A.CERT_PROVAS_ENVIADAS, A.CERT_MODOS_DE_PROVA], [100, 1, ['simulado']], 'o critério está em constantes com nome');
    const tela = ler('app-estudo.js');
    for (const pedaco of ['function caixaConclusao()', '🎓 Emitir certificado', 'sem validade para o MEC', 'id="es-bar-cert"', "' aulas' : ' aula'", "' simulados' : ' simulado'"]) assert.ok(tela.includes(pedaco), 'falta na tela: ' + pedaco);
  });

  // ================= D1b. AULA SEM QUESTÃO NEM CARD =================
  await t('paridade/aula sem questão nem card: conta como estudada pela leitura ATÉ O FIM (de aula aberta) ou pela videoaula (≥ 90 %) — e só nesse caso; com questão ou card, estudar continua sendo responder', async () => {
    const lia = uid(LIA.email), eid = R.Escopos.porSlug(pid, SLUG).id;
    const concl = async () => (await req('GET', `${esc()}/painel`, { jar: 'lia' })).json.conclusao;
    const estudadas = async () => (await req('GET', `${esc()}/painel`, { jar: 'lia' })).json.unidades.filter(u => u.estudada).map(u => u.codigo);
    const lida = (aula) => req('PUT', `${esc()}/unidades/${aula}/lida`, { jar: 'lia' });
    const abrir = (aula) => req('GET', `${esc()}/unidades/${aula}?aberta=1`, { jar: 'lia' });
    let k = await concl();
    assert.deepEqual([k.total_aulas, k.estudadas, k.aulas_sem_questao], [3, 0, 0], 'as três aulas têm o que responder: duas com questão, a terceira com card');
    assert.ok(!/sem questão nem card/.test(k.falta_txt), k.falta_txt);
    // ler sem ter aberto a aula não é leitura
    let r = await lida('aula-tres');
    assert.equal(r.st, 409, r.texto);
    assert.equal((await lida('nao-existe')).st, 404);
    assert.equal((await req('PUT', `${esc()}/unidades/aula-tres/lida`, { jar: 'caio' })).st, 403, 'quem não tem o curso não registra nada');
    // aula COM card (a três) e aula COM questão (a dois): abrir e ler até o fim fica registrado, mas NÃO é estudar
    for (const aula of ['aula-dois', 'aula-tres']) {
      r = await abrir(aula);
      assert.deepEqual([r.st, r.json.lida, r.json.conta_pela_leitura], [200, false, false], aula);
      r = await lida(aula);
      assert.deepEqual([r.st, r.json.lida, r.json.estudada], [200, true, false], aula + ': ' + r.texto);
      assert.equal((await abrir(aula)).json.lida, true, 'a aula sabe que já foi lida');
    }
    assert.deepEqual(await estudadas(), [], 'havendo questão ou card, só responder conta');
    // o card da aula três sai do ar: agora ela não tem questão nem card — e a leitura feita passa a valer
    db.prepare("UPDATE est_cards SET status = 'rascunho' WHERE escopo_id = ?").run(eid);
    try {
      k = await concl();
      assert.deepEqual([k.aulas_sem_questao, k.estudadas, k.faltam_aulas], [1, 1, 2], 'a contagem informa quantas são; a que foi lida até o fim conta');
      assert.ok(/na aula sem questão nem card, leia até o fim ou assista à videoaula/.test(k.falta_txt), k.falta_txt);
      assert.deepEqual(await estudadas(), ['aula-tres']);
      assert.equal((await abrir('aula-tres')).json.conta_pela_leitura, true, 'a tela pode dizer ao aluno que aqui a leitura conta');
      assert.deepEqual([A.progressoDoCurso(lia, pid).progresso.concluidas, (await req('GET', `${esc()}/ferramentas`, { jar: 'lia' })).json.disciplinas.flatMap(d => d.aulas).filter(a => a.estudada).length], [1, 1], 'biblioteca e cronograma: a mesma régua');
      // só ABRIR não basta: sem a leitura até o fim, não conta
      const marca = db.prepare('SELECT lida_em FROM est_aula_estado WHERE user_id = ? AND escopo_id = ? AND unidade = ?').get(lia, eid, 'aula-tres').lida_em;
      assert.ok(marca, 'o instante da leitura fica registrado');
      db.prepare("UPDATE est_aula_estado SET lida_em = '' WHERE user_id = ? AND escopo_id = ? AND unidade = ?").run(lia, eid, 'aula-tres');
      assert.deepEqual(await estudadas(), [], 'aula aberta e não lida até o fim não é estudada');
      // …ou a VIDEOAULA: 89 % ainda não; 90 %, sim (o registro que já existia)
      db.prepare("UPDATE est_unidades SET video_media_id = 'video-paridade-tres', video_duracao_seg = 100 WHERE codigo = 'aula-tres' AND escopo_id = ?").run(eid);
      assert.equal((await req('PUT', `${esc()}/unidades/aula-tres/video`, { jar: 'lia', corpo: { posicao_seg: 89 } })).json.assistido, false);
      assert.deepEqual(await estudadas(), []);
      assert.equal((await req('PUT', `${esc()}/unidades/aula-tres/video`, { jar: 'lia', corpo: { posicao_seg: 90 } })).json.assistido, true);
      assert.deepEqual(await estudadas(), ['aula-tres'], 'assistiu à videoaula da aula sem questão nem card');
      // a leitura registrada não volta atrás, e registrar de novo não muda a data
      r = await lida('aula-tres');
      const de = db.prepare('SELECT lida_em FROM est_aula_estado WHERE user_id = ? AND escopo_id = ? AND unidade = ?').get(lia, eid, 'aula-tres').lida_em;
      assert.deepEqual([r.json.estudada, (await lida('aula-tres')).st, db.prepare('SELECT lida_em FROM est_aula_estado WHERE user_id = ? AND escopo_id = ? AND unidade = ?').get(lia, eid, 'aula-tres').lida_em], [true, 200, de]);
      // nas aulas que TÊM questão, o vídeo assistido continua não contando (regra de sempre)
      db.prepare("UPDATE est_unidades SET video_media_id = 'video-paridade-dois', video_duracao_seg = 100 WHERE codigo = 'aula-dois' AND escopo_id = ?").run(eid);
      assert.equal((await req('PUT', `${esc()}/unidades/aula-dois/video`, { jar: 'lia', corpo: { posicao_seg: 100 } })).json.assistido, true);
      assert.deepEqual(await estudadas(), ['aula-tres']);
    } finally {
      db.prepare("UPDATE est_cards SET status = 'publicado' WHERE escopo_id = ?").run(eid);
      db.prepare("UPDATE est_unidades SET video_media_id = '', video_duracao_seg = 0 WHERE codigo IN ('aula-dois', 'aula-tres') AND escopo_id = ?").run(eid);
    }
    // o card voltou: a aula três volta a pedir resposta — a leitura e o vídeo deixam de bastar
    k = await concl();
    assert.deepEqual([k.aulas_sem_questao, k.estudadas], [0, 0]);
    // a tela: o marco no fim do TEXTO da aula, o aviso ao servidor uma vez, com tempo mínimo — e a regra dita ao aluno
    const tela = ler('app-estudo.js');
    for (const pedaco of ['<span id="es-un-fim" aria-hidden="true"></span>', "'/lida'", 'function ligarFimDaLeitura(codigo, jaLida)', 'ligarFimDaLeitura(codigo, u.lida);', 'LEITURA_MIN_MS', 'ela conta como estudada quando você lê o texto até o fim ou assiste à videoaula', 'sem questão nem card, lê até o fim ou assiste à videoaula']) assert.ok(tela.includes(pedaco), 'falta na tela: ' + pedaco);
    assert.ok(tela.indexOf('<span id="es-un-fim"') < tela.indexOf('id="es-un-quiz"') && tela.indexOf('<span id="es-un-fim"') > tela.indexOf("'<p class=\"al-rotulo es-un-txt\">Texto da aula</p>'"), 'o marco fica depois do texto e antes do quiz');
  });

  // ================= D5. TUTOR =================
  await t('paridade/Tutor: sem base importada não responde (nem aparece) no Estude; com base, a aula aberta vem primeiro', async () => {
    const perguntar = (corpo, jar = 'nara') => req('POST', '/academy/api/aluno/tutor/perguntar', { jar, corpo: { product_id: pid, ...corpo } });
    const PERGUNTA = 'Como funciona a prescrição intercorrente na execução?';
    let chamadas = 0, ultimo = '';
    iaM.__mockParaTeste(async ({ agente, prompt }) => {
      chamadas++; ultimo = prompt;
      return { json: agente === 'tutor' ? { resposta: 'Veja o trecho [1].', fontes: [1], nao_encontrado: false, sugestoes: [] } : { resposta: 'resposta do agente antigo' } };
    });
    try {
      assert.equal((await req('GET', `/academy/api/aluno/cursos/${pid}/interativo`, { jar: 'nara' })).json.tutor.base_propria, false);
      let r = await perguntar({ pergunta: PERGUNTA, estude: { escopo: SLUG, unidade: 'aula-um' } });
      assert.deepEqual([r.st, chamadas], [409, 0], 'sem base, o agente antigo NÃO é chamado de dentro do Estude: ' + r.texto);
      assert.ok(/ainda não está disponível/.test(r.json.erro));
      // a base entra pela importação de sempre, com o vínculo à aula no PREFIXO do rótulo
      const imp = await chave('POST', '/staff/api/academy/interativo/importar', E({ trechos: { itens: [
        { fonte: 'artigo', rotulo: `[est:${SLUG}/aula-um] Aula um · texto da aula`, texto: 'O ponto um trata do aviso prévio proporcional e de como ele é contado no contrato.' },
        { fonte: 'artigo', rotulo: `[est:${SLUG}/aula-dois] Aula dois · texto da aula`, texto: 'A prescrição intercorrente na execução trabalhista corre quando o exequente deixa de cumprir determinação judicial.' },
        { fonte: 'livro', rotulo: 'Livro, cap. 3', texto: 'Prescrição intercorrente: a execução parada por inércia do credor, no livro do curso.' }] } }));
      assert.equal(imp.st, 200, imp.texto);
      assert.equal((await req('GET', `/academy/api/aluno/cursos/${pid}/interativo`, { jar: 'nara' })).json.tutor.base_propria, true);
      const it = require('../interativo');
      assert.deepEqual(it.rotuloEstude(`[est:${SLUG}/aula-um] Aula um · texto da aula`), { escopo: SLUG, unidade: 'aula-um', rotulo: 'Aula um · texto da aula' });
      assert.deepEqual(it.rotuloEstude('Livro, cap. 3'), { escopo: '', unidade: '', rotulo: 'Livro, cap. 3' });
      // sem aula aberta: vale a busca — a aula um (que não fala do assunto) nem entra
      r = await perguntar({ pergunta: PERGUNTA, estude: { escopo: SLUG, unidade: '' } });
      assert.equal(r.st, 200, r.texto);
      assert.ok(ultimo.includes('deixa de cumprir determinação') && !ultimo.includes('aviso prévio proporcional'), 'fora de aula, só o que casa com a pergunta');
      assert.ok(!ultimo.includes('[est:'), 'o prefixo do rótulo não vai ao modelo');
      // com a aula um aberta: os trechos DELA vêm primeiro, mesmo casando menos com a pergunta
      r = await perguntar({ pergunta: PERGUNTA, estude: { escopo: SLUG, unidade: 'aula-um' } });
      assert.equal(r.st, 200, r.texto);
      const iUm = ultimo.indexOf('aviso prévio proporcional'), iDois = ultimo.indexOf('deixa de cumprir determinação');
      assert.ok(iUm > 0 && iDois > iUm, 'a aula aberta abre o contexto; o resto do curso completa');
      assert.deepEqual([r.json.fontes[0].estude, r.json.fontes[0].rotulo], [{ escopo: SLUG, unidade: 'aula-um' }, 'Aula um · texto da aula'], 'a fonte diz de qual aula saiu, sem o prefixo');
      assert.ok(ultimo.includes('Aula um'), 'e o modelo sabe qual é a aula atual');
      // aula dois aberta: a dela primeiro
      await perguntar({ pergunta: PERGUNTA, estude: { escopo: SLUG, unidade: 'aula-dois' } });
      assert.ok(ultimo.indexOf('deixa de cumprir determinação') < ultimo.indexOf('execução parada por inércia'), 'a aula dois na frente do livro');
      // aula que não existe (ou que ela não vê) não derruba a pergunta: vira pergunta sobre o curso
      assert.equal((await perguntar({ pergunta: PERGUNTA, estude: { escopo: SLUG, unidade: 'nao-existe' } })).st, 200);
      assert.equal((await perguntar({ pergunta: PERGUNTA, estude: { escopo: SLUG, unidade: 'aula-um' } }, 'caio')).st, 403, 'quem não tem o curso não conversa');
    } finally { iaM.__mockParaTeste(null); }
    const tela = ler('app-aluno.js');
    assert.ok(/function tutorNoEstude\(\) \{ if \(temBaseDoTutor\(\)\) montarTutor\(\); else limparTutor\(\); \}/.test(tela) && /if \(noEstude && !temBaseDoTutor\(\)\) return;/.test(tela), 'sem base, a esfera não é montada dentro do Estude');
    assert.ok(tela.includes('if (un) corpo.estude = un;') && tela.includes("unidade: l.aba === 'unidade' ? l.arg : ''"), 'a pergunta leva o código da aula aberta');
  });

  // ================= D6. DICAS =================
  await t('paridade/dicas: dentro do Estude o app pede ao widget só as dicas do curso (marca data-vs-so-curso), e tira a marca ao sair', async () => {
    const tela = ler('app-aluno.js');
    assert.ok(tela.includes("raiz.setAttribute('data-vs-so-curso', '1')") && tela.includes("raiz.removeAttribute('data-vs-so-curso')"));
    assert.ok(/noEstude = true;\s+marcarSoDicasDoCurso\(true\);/.test(tela), 'a marca entra quando o Estude abre');
    assert.ok(/function foraDoEstude\(\) \{ noEstude = false; marcarSoDicasDoCurso\(false\); \}/.test(tela) && (tela.match(/foraDoEstude\(\);/g) || []).length >= 2, 'e sai na biblioteca e na página comum do curso');
  });

  // ================= ÁUDIO DA PROVA ORAL: 6 meses =================
  const diasAtras = (n) => new Date(Date.now() - n * 864e5).toISOString();
  const pedidoOral = async (email, criadoEm, extra = {}) => {
    const u = repo.Usuarios.porEmail(email);
    const m = await ct.Midia.salvarDePedido(u.id, { nome: 'resposta-oral', mime: 'audio/webm', conteudo_base64: Buffer.from('audio-de-teste-' + novoId()).toString('base64') });
    const id = novoId();
    db.prepare(`INSERT INTO est_pedidos (id, user_id, product_id, escopo_id, tipo, estado, questao_id, entrada, resultado, criado_em, atualizado_em) VALUES (?, ?, ?, ?, 'oral', 'pronto', 'q-oral', ?, ?, ?, ?)`)
      .run(id, u.id, pid, R.Escopos.porSlug(pid, SLUG).id, j.str({ questao_id: 'q-oral', media_id: m.id, duracao_seg: 60, ...extra }),
        j.str({ nota: 70, transcricao: 'TRANSCRICAO-GUARDADA', criterios: [{ criterio: 'Conceito', nivel: 2, peso: 1 }] }), criadoEm, criadoEm);
    return { id, media: m.id, arquivo: ct.Midia.caminhoAbsoluto(ct.Midia.obter(m.id)) };
  };
  const linhaPed = (id) => db.prepare('SELECT * FROM est_pedidos WHERE id = ?').get(id);

  await t('paridade/áudio da oral: a tela avisa dos 6 meses antes de gravar e no resultado; baixar é só de quem pediu, por endereço temporário', async () => {
    assert.equal(ped.AUDIO_ORAL_RETENCAO_DIAS, 183);
    // as rotas de pedido ficam atrás da chave geral (estudo_pedidos), que nasce desligada: estes dois testes a ligam
    ped.salvarConfigPedidos({ ativos: true }, { admin: true });
    const p = await pedidoOral(NARA.email, diasAtras(10));
    const o = await req('GET', `${esc()}/pedidos/${p.id}`, { jar: 'nara' });
    assert.equal(o.st, 200, o.texto);
    const a = o.json.pedido.audio;
    assert.deepEqual([a.retencao_dias, a.apagado_em, a.disponivel], [183, '', true]);
    assert.equal(Math.round((Date.parse(a.ate) - Date.parse(o.json.pedido.criado_em)) / 864e5), 183, 'a data-limite é a do pedido mais 183 dias');
    const lista = (await req('GET', `${esc()}/pedidos`, { jar: 'nara' })).json.pedidos.find(x => x.id === p.id);
    assert.equal(lista.audio.ate, a.ate, '"Meus pedidos" sabe até quando o áudio fica');
    const dl = await req('GET', `${esc()}/pedidos/${p.id}/audio`, { jar: 'nara' });
    assert.equal(dl.st, 200, dl.texto);
    assert.ok(/[?&]e=\d+/.test(dl.json.url) && dl.json.expira_epoch > Date.now() / 1000 && dl.json.expira_epoch < Date.now() / 1000 + 3600, 'o endereço é assinado e vence: ' + dl.json.url);
    assert.equal((await req('GET', dl.json.url)).st, 200, 'e entrega o arquivo');
    assert.equal((await req('GET', `${esc()}/pedidos/${p.id}/audio`, { jar: 'lia' })).st, 404, 'outra aluna do mesmo curso recebe 404');
    assert.equal((await req('GET', `${esc()}/pedidos/${p.id}/audio`, { jar: 'caio' })).st, 403);
    assert.equal((await req('GET', `/academy/api/media/${p.media}/link`, { jar: 'lia' })).st, 404, 'nem pela rota genérica de mídia');
    assert.equal((await req('GET', `${esc()}/abertas`, { jar: 'nara' })).json.limites.audio_retencao_dias, 183);
    const tela = ler('app-estudo.js');
    for (const pedaco of ['Guardamos o áudio da sua resposta por 6 meses', 'Guardamos este áudio por 6 meses, até ', 'Se quiser mantê-lo, baixe agora.', '⬇️ Baixar o áudio', "'áudio disponível até '", ' (prazo de 6 meses)', "'/audio'"]) assert.ok(tela.includes(pedaco), 'falta na tela: ' + pedaco);
    assert.ok(/a\.disponivel \? '<div class="es-linha"><button class="al-bt peq fan" id="es-eo-baixar">/.test(tela), 'o botão some quando o áudio não está mais disponível');
  });

  await t('paridade/áudio da oral: o expurgo apaga só o que passou de 183 dias, mantém transcrição e correção, é idempotente e não cai se o armazenamento falhar', async () => {
    const velho = await pedidoOral(NARA.email, diasAtras(184)), novo = await pedidoOral(NARA.email, diasAtras(182));
    assert.ok(fs.existsSync(velho.arquivo) && fs.existsSync(novo.arquivo));
    // armazenamento fora do ar: nada é marcado, nada cai — fica para a próxima passada
    let r = await ped.expurgarAudios({ apagar: async () => false });
    assert.deepEqual([r.vencidos, r.apagados, r.falhas, linhaPed(velho.id).audio_apagado_em, !!ct.Midia.obter(velho.media)], [1, 0, 1, '', true]);
    r = await ped.expurgarAudios({ apagar: async () => { throw new Error('storage caiu'); } });
    assert.deepEqual([r.apagados, r.falhas], [0, 1], 'exceção do armazenamento não sobe');
    r = await ped.expurgarAudios();
    assert.deepEqual([r.vencidos, r.apagados, r.falhas], [1, 1, 0]);
    const v = linhaPed(velho.id);
    assert.ok(v.audio_apagado_em && !fs.existsSync(velho.arquivo) && !ct.Midia.obterMesmoPendente(velho.media), 'saíram o objeto e o registro de mídia; o pedido diz quando');
    assert.equal(j.parse(v.resultado, {}).transcricao, 'TRANSCRICAO-GUARDADA', 'a transcrição continua no pedido');
    assert.equal(j.parse(v.resultado, {}).nota, 70, 'e a correção também');
    assert.ok(linhaPed(novo.id).audio_apagado_em === '' && fs.existsSync(novo.arquivo) && ct.Midia.obter(novo.media), 'o que ainda está no prazo fica');
    r = await ped.expurgarAudios();
    assert.deepEqual([r.vencidos, r.apagados], [0, 0], 'rodar de novo não faz nada');
    assert.equal(linhaPed(velho.id).audio_apagado_em, v.audio_apagado_em);
    const o = (await req('GET', `${esc()}/pedidos/${velho.id}`, { jar: 'nara' })).json.pedido;
    assert.deepEqual([o.audio.disponivel, o.audio.apagado_em, o.resultado.transcricao], [false, v.audio_apagado_em, 'TRANSCRICAO-GUARDADA'], 'a tela recebe "apagado em" e continua mostrando a correção');
    assert.equal((await req('GET', `${esc()}/pedidos/${velho.id}/audio`, { jar: 'nara' })).st, 404, 'depois do expurgo não há o que baixar');
    assert.ok(/expurgarAudios\(\)/.test(ler('index.js')) && /setInterval\(expurgo, 24 \* 3600e3\)/.test(ler('index.js')), 'a rotina roda ao subir e uma vez por dia');
    // a chave geral volta a ser como nasce (sem registro): desligada — e o expurgo NÃO depende dela
    db.prepare("DELETE FROM platform_settings WHERE chave = 'estudo_pedidos'").run();
    assert.equal((await req('GET', `${esc()}/pedidos/${velho.id}`, { jar: 'nara' })).st, 404, 'desligada, a rota de pedido some');
    assert.deepEqual((await ped.expurgarAudios()).falhas, 0, 'a rotina de expurgo roda com a chave desligada');
  });

  // ================= D2. LGPD =================
  await t('paridade/LGPD: a exportação traz o que a aluna escreveu no Estude; excluir a conta apaga tudo — e o áudio sai na hora, antes do prazo', async () => {
    // a Lia escreve em todos os lugares
    const un = `${esc()}/unidades/aula-dois`;
    await req('PUT', `${un}/blocos/1/tentativa`, { jar: 'lia', corpo: { texto: 'TENTATIVA-DA-LIA no exercício.' } });
    await req('PUT', `${un}/nota`, { jar: 'lia', corpo: { texto: 'NOTA-DA-LIA sobre a aula.' } });
    await req('POST', `${esc()}/marcacoes`, { jar: 'lia', corpo: { unidade: 'aula-dois', bloco: 0, inicio: 0, fim: 8, cor: 'rosa', nota: 'MARCA-DA-LIA' } });
    await responder('lia', 7, 'b');
    await req('PUT', `${esc()}/questoes/${idQ(7)}/anotacao`, { jar: 'lia', corpo: { texto: 'ANOTACAO-DA-LIA' } });
    const oral = await pedidoOral(LIA.email, diasAtras(5)); // recente: longe do prazo de 6 meses
    const liaId = uid(LIA.email);
    db.prepare("UPDATE est_pedidos SET contestacao = ?, resultado = ? WHERE id = ?").run(j.str({ motivo: 'CONTESTACAO-DA-LIA', em: nowISO() }), j.str({ nota: 50, transcricao: 'TRANSCRICAO-DA-LIA' }), oral.id);
    const escrito = db.prepare("INSERT INTO est_pedidos (id, user_id, product_id, escopo_id, tipo, estado, questao_id, entrada, cobrado_milesimos, criado_em, atualizado_em) VALUES (?, ?, ?, '', 'correcao', 'pronto', 'q-disc', ?, 127, ?, ?)");
    const idEscrito = novoId();
    escrito.run(idEscrito, liaId, pid, j.str({ resposta: 'RESPOSTA-DISCURSIVA-DA-LIA' }), nowISO(), nowISO());
    const ex = await req('GET', '/academy/api/me/exportar', { jar: 'lia' });
    assert.equal(ex.st, 200, ex.texto);
    const ap = ex.json.aprendizagem;
    assert.deepEqual([ap.est_tentativas_bloco.length, ap.est_notas_aula.length, ap.est_marcacoes.length, ap.est_anotacoes.length, ap.est_pedidos.length], [1, 1, 1, 1, 2]);
    for (const marca of ['TENTATIVA-DA-LIA', 'NOTA-DA-LIA', 'MARCA-DA-LIA', 'ANOTACAO-DA-LIA', 'RESPOSTA-DISCURSIVA-DA-LIA', 'TRANSCRICAO-DA-LIA', 'CONTESTACAO-DA-LIA']) assert.ok(ex.texto.includes(marca), 'falta na exportação: ' + marca);
    assert.ok(!/DA-NARA/.test(ex.texto), 'a exportação é só do titular');
    assert.ok(fs.existsSync(oral.arquivo));
    assert.equal((await req('POST', '/academy/api/me/excluir', { jar: 'lia', corpo: { senha: 'errada' } })).st, 400);
    assert.equal((await req('POST', '/academy/api/me/excluir', { jar: 'lia', corpo: { senha: LIA.senha } })).st, 200);
    const n = (tabela) => db.prepare(`SELECT COUNT(*) n FROM ${tabela} WHERE user_id = ?`).get(liaId).n;
    assert.deepEqual(['est_tentativas_bloco', 'est_notas_aula', 'est_marcacoes', 'est_anotacoes'].map(n), [0, 0, 0, 0], 'o que ela escreveu saiu');
    const tudo = JSON.stringify(db.prepare('SELECT * FROM est_pedidos WHERE user_id = ?').all(liaId));
    assert.ok(!/DA-LIA/.test(tudo), 'resposta, transcrição e contestação saíram dos pedidos');
    assert.equal(n('est_pedidos'), 2, 'os pedidos ficam (têm valor cobrado), sem o texto');
    assert.equal(linhaPed(idEscrito).cobrado_milesimos, 127);
    assert.ok(linhaPed(oral.id).audio_apagado_em && !fs.existsSync(oral.arquivo) && !ct.Midia.obterMesmoPendente(oral.media), 'o áudio foi apagado na hora, 178 dias antes do prazo');
    // a Nara continua com tudo
    assert.equal((await req('GET', `${esc()}/caderno`, { jar: 'nara' })).json.total.tentativas, 1);
  });

  // ================= a tela, por inteiro =================
  await t('paridade/tela: as seções novas estão lá, e o que o aluno escreve não mora no navegador', async () => {
    const tela = ler('app-estudo.js');
    for (const pedaco of ['id="es-un-quiz"', 'id="es-un-nota"', "'?aberta=1'", 'function salvarSozinho(', "'/blocos/' + n + '/tentativa'", "un + '/nota'", 'id="es-barra-es"', 'guardarLugar: guardarLugar', 'function reporRolagem(',
      '✓ estudada', 'o que sobrar fica como saldo de IA na sua conta']) assert.ok(tela.includes(pedaco), 'falta na tela: ' + pedaco);
    // a regra do localStorage do leitor continua valendo: só a posição e as preferências da leitura
    const usos = tela.match(/localStorage\.\w+\([^)]*\)/g) || [];
    assert.ok(usos.length === (tela.match(/localStorage/g) || []).length && usos.every(u => /^localStorage\.(getItem|setItem)\(chave(Pref)?\b/.test(u)), 'nenhum uso novo de localStorage: ' + usos.join(' | '));
    const i = tela.indexOf('// ---- o que a aula ganhou dos outros cursos'), f = tela.indexOf('// ================= PRATICAR =================');
    assert.ok(i > 0 && f > i && !/localStorage|sessionStorage/.test(tela.slice(i, f)), 'tentativa, nota, quiz, posição do vídeo e caderno ficam no servidor');
    const js = await req('GET', '/academy/estude.js');
    assert.ok(js.st === 200 && js.texto.includes('Quiz desta aula') && js.texto.includes('Meu caderno'), 'a tela servida é a nova');
    const css = ler('estude.css');
    assert.ok(css.includes('.es-barra-es') && css.includes('.cad-meu'));
  });

  // os pedidos criados aqui (áudio da oral, LGPD) não são de ninguém nos testes seguintes: saem, para as
  // contagens dos pedidos pagos e o razão da carteira começarem do zero como sempre começaram
  for (const p of db.prepare('SELECT id, entrada FROM est_pedidos WHERE product_id = ?').all(pid)) {
    const m = ct.Midia.obterMesmoPendente(String(j.parse(p.entrada, {}).media_id || ''));
    if (m) await ct.Midia.descartarDePedido(m);
    db.prepare('DELETE FROM est_pedidos WHERE id = ?').run(p.id);
  }
}

module.exports = { rodar };
