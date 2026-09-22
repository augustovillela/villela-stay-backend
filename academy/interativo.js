// =====================================================================
// Villela Academy — EXPERIÊNCIA DE APRENDIZAGEM (fase 1).
//
// O curso deixa de ser "vídeo + PDF" e passa a ter prática e interação:
//   • Tutor Villela — responde com a base de conhecimento REAL do curso
//     (transcrição do que foi gravado, livro, tarefas), citando a fonte;
//   • quiz por aula — conhecimento, aplicação e decisão, com a explicação
//     de CADA alternativa; a correção é feita no servidor (o gabarito
//     nunca vai para o navegador antes da resposta);
//   • caderno de trabalho — Aprendi → Pratiquei → Apliquei → Resultado,
//     com as respostas do aluno guardadas;
//   • biblioteca de prompts do curso;
//   • extras "em breve" (ex.: VERIDICA Cases) sem conteúdo exposto.
//
// Todo conteúdo entra pela chave de publicação, nasce em RASCUNHO e só o
// dono do curso (ou admin) o vê até ser publicado — quiz de curso jurídico
// passa por revisão humana antes do aluno. A busca do tutor é BM25 em JS
// (sem FTS, sem serviço externo): o acervo de um curso cabe em memória.
// =====================================================================
'use strict';
const { db, nowISO, novoId, j, transacao } = require('./db');
const ct = require('./repo-conteudo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const chave = (t) => s(t, 200).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

const FONTES = ['transcricao', 'livro', 'artigo', 'tarefas', 'faq'];
const TIPOS_QUESTAO = ['conhecimento', 'aplicacao', 'decisao'];
const STATUS = ['rascunho', 'publicado'];

// ---------------------------------------------------------------------
// Quem vê o quê. O aluno com acesso vê o PUBLICADO; o dono do curso e o
// admin veem também o rascunho (é assim que o produtor revisa na tela).
// Aula de degustação libera quiz e caderno dela para quem não comprou.
// ---------------------------------------------------------------------
function podeRevisar(usuario, produto) {
  return !!usuario && !!produto && (produto.producer_id === usuario.id || (usuario.papeis || []).includes('admin'));
}
function statusVisiveis(usuario, produto) {
  return podeRevisar(usuario, produto) ? ['rascunho', 'publicado'] : ['publicado'];
}
function aulaDoProduto(lessonId) {
  return db.prepare('SELECT id, product_id, titulo, gratuita, module_id FROM lessons WHERE id = ?').get(s(lessonId, 40)) || null;
}
function acessoAula(usuario, lessonId) {
  const aula = aulaDoProduto(lessonId);
  if (!aula) return null;
  const produto = ct.Produtos.obter(aula.product_id);
  if (!produto) return null;
  const revisor = podeRevisar(usuario, produto);
  const liberada = revisor || ct.temAcesso(usuario.id, produto.id) || !!aula.gratuita;
  return liberada ? { aula, produto, revisor } : null;
}

// ---------------------------------------------------------------------
// BUSCA (BM25) sobre os trechos de um curso — índice em memória por
// produto, refeito quando a base muda (contador de versão por produto).
// ---------------------------------------------------------------------
const PARADAS = new Set(('a o os as um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para pra ' +
  'com sem sob sobre e ou mas se que quem qual quais como quando onde porque por que isso isto esse essa este esta aquele ' +
  'aquela ele ela eles elas eu voce voces nos me te lhe seu sua seus suas meu minha nosso nossa ao aos a as ja nao sim mais ' +
  'menos muito muita bem tambem ate entre depois antes ser estar ter haver foi era sao esta estao tem sera pode fazer faz ' +
  'vai vou isso aqui la ai entao so cada todo toda todos todas outro outra mesmo mesma aula aulas curso explique explica ' +
  'explicar novamente sobre fale diga').split(/\s+/));
function tokens(t) {
  return chave(t).replace(/[^a-z0-9 ]+/g, ' ').split(' ')
    .filter(w => w.length > 2 && !PARADAS.has(w))
    .map(w => w.length > 5 ? w.replace(/(oes|aes|coes|mente|s)$/, '') : w); // radical grosseiro: plural/advérbio
}
const _indice = new Map(); // productId → {versao, docs:[{id, tf:Map, len}], df:Map, media}
const _versao = new Map();
function invalidar(productId) { _versao.set(productId, (_versao.get(productId) || 0) + 1); }
function indice(productId) {
  const v = _versao.get(productId) || 0;
  const ja = _indice.get(productId);
  if (ja && ja.versao === v) return ja;
  const linhas = db.prepare('SELECT id, lesson_id, fonte, rotulo, ini_seg, texto FROM tutor_trechos WHERE product_id = ?').all(productId);
  const df = new Map();
  const docs = linhas.map(l => {
    const tf = new Map();
    const tk = tokens(l.rotulo + ' ' + l.texto);
    for (const w of tk) tf.set(w, (tf.get(w) || 0) + 1);
    for (const w of tf.keys()) df.set(w, (df.get(w) || 0) + 1);
    return { ...l, tf, len: tk.length };
  });
  const media = docs.length ? docs.reduce((a, d) => a + d.len, 0) / docs.length : 1;
  const idx = { versao: v, docs, df, media };
  _indice.set(productId, idx);
  return idx;
}
// `permitido(doc)` recorta o acervo ao que o aluno pode ver; `aulaAtual` ganha peso.
function buscar(productId, pergunta, { n = 8, aulaAtual = '', permitido = () => true } = {}) {
  const idx = indice(productId);
  const q = [...new Set(tokens(pergunta))];
  const N = idx.docs.length, k1 = 1.4, b = 0.75;
  const pont = [];
  for (const d of idx.docs) {
    if (!permitido(d)) continue;
    let sc = 0;
    for (const w of q) {
      const f = d.tf.get(w); if (!f) continue;
      const nq = idx.df.get(w) || 0;
      const idf = Math.log(1 + (N - nq + 0.5) / (nq + 0.5));
      sc += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / idx.media));
    }
    if (aulaAtual && d.lesson_id === aulaAtual) sc = sc * 1.6 + 0.4; // "esta aula" pesa mais
    if (sc > 0) pont.push({ d, sc });
  }
  pont.sort((x, y) => y.sc - x.sc);
  // diversidade: no máximo 3 trechos seguidos da mesma fonte+aula
  const out = [], conta = new Map();
  for (const { d } of pont) {
    const k = d.fonte + ':' + d.lesson_id;
    if ((conta.get(k) || 0) >= 3) continue;
    conta.set(k, (conta.get(k) || 0) + 1);
    out.push(d);
    if (out.length >= n) break;
  }
  return out;
}
// quando a pergunta é sobre "esta aula" e a busca não acha nada, o começo da transcrição dela ajuda
function trechosDaAula(productId, lessonId, n = 3) {
  return db.prepare("SELECT id, lesson_id, fonte, rotulo, ini_seg, texto FROM tutor_trechos WHERE product_id = ? AND lesson_id = ? AND fonte = 'transcricao' ORDER BY ordem LIMIT ?")
    .all(productId, lessonId, n);
}

// ---------------------------------------------------------------------
// VALIDAÇÃO do conteúdo importado — rigorosa: quiz com gabarito ambíguo
// ou sem explicação ensina errado, e isso é pior do que não ter quiz.
// ---------------------------------------------------------------------
function validarQuestoes(qs, onde) {
  if (!Array.isArray(qs) || !qs.length) throw new Error(`${onde}: o quiz precisa de questões.`);
  if (qs.length > 20) throw new Error(`${onde}: no máximo 20 questões por aula.`);
  const ids = new Set();
  return qs.map((q, i) => {
    const tag = `${onde}, questão ${i + 1}`;
    const tipo = s(q && q.tipo, 20);
    if (!TIPOS_QUESTAO.includes(tipo)) throw new Error(`${tag}: tipo deve ser ${TIPOS_QUESTAO.join('|')}.`);
    const enunciado = s(q.enunciado, 1500);
    if (enunciado.length < 10) throw new Error(`${tag}: enunciado curto demais.`);
    const alts = Array.isArray(q.alternativas) ? q.alternativas : [];
    if (alts.length < 2 || alts.length > 5) throw new Error(`${tag}: de 2 a 5 alternativas.`);
    const alternativas = alts.map((a, k) => {
      const texto = s(a && a.texto, 600), explicacao = s(a && a.explicacao, 1200);
      if (!texto) throw new Error(`${tag}: alternativa ${k + 1} sem texto.`);
      if (explicacao.length < 10) throw new Error(`${tag}: alternativa ${k + 1} sem explicação (o aluno precisa saber POR QUÊ).`);
      return { texto, correta: a.correta === true, explicacao };
    });
    const certas = alternativas.filter(a => a.correta).length;
    if (certas !== 1) throw new Error(`${tag}: exatamente UMA alternativa correta (veio ${certas}).`);
    const id = s(q.id, 30) || `q${i + 1}`;
    if (ids.has(id)) throw new Error(`${tag}: id repetido "${id}".`);
    ids.add(id);
    return { id, tipo, enunciado, alternativas };
  });
}
function validarCaderno(c, onde) {
  const lista = (v, max) => (Array.isArray(v) ? v : []).map(x => s(x, 800)).filter(Boolean).slice(0, max);
  const d = {
    aprendi: { resumo: s(c && c.aprendi && c.aprendi.resumo, 2000), pontos: lista(c && c.aprendi && c.aprendi.pontos, 15) },
    pratiquei: {
      checklist: lista(c && c.pratiquei && c.pratiquei.checklist, 12),
      exercicio: s(c && c.pratiquei && c.pratiquei.exercicio, 2000),
      prompt_modelo: s(c && c.pratiquei && c.pratiquei.prompt_modelo, 4000),
    },
    apliquei: { tarefas: lista(c && c.apliquei && c.apliquei.tarefas, 5), desafio: s(c && c.apliquei && c.apliquei.desafio, 2000) },
    resultado: { esperado: s(c && c.resultado && c.resultado.esperado, 2000) },
  };
  if (!d.aprendi.resumo) throw new Error(`${onde}: caderno sem resumo (Aprendi).`);
  if (!d.apliquei.tarefas.length && !d.apliquei.desafio) throw new Error(`${onde}: caderno sem tarefa nem desafio (Apliquei).`);
  return d;
}
// os campos que o aluno preenche — a chave é estável e sai da estrutura do caderno
function camposDoCaderno(d) {
  const c = [];
  (d.pratiquei.checklist || []).forEach((_, i) => c.push('check_' + (i + 1)));
  if (d.pratiquei.exercicio) c.push('exercicio');
  (d.apliquei.tarefas || []).forEach((_, i) => c.push('tarefa_' + (i + 1)));
  if (d.apliquei.desafio) c.push('desafio');
  c.push('resultado');
  return c;
}

// ---------------------------------------------------------------------
// IMPORTAÇÃO (pela chave de publicação): tudo é por produto do produtor.
// `aulaPorTitulo` vem de importacao.js (mesma regra de identidade).
// ---------------------------------------------------------------------
function importar(produto, dados, aulaPorTitulo) {
  const r = { trechos: 0, quizzes: 0, cadernos: 0, prompts: 0, extras: 0 };
  const aulaId = (x, onde) => {
    if (!x || (!x.modulo_titulo && !x.aula_titulo)) return '';
    return aulaPorTitulo(produto.id, { modulo_titulo: x.modulo_titulo, aula_titulo: x.aula_titulo }).id;
  };
  transacao(() => {
    // TRECHOS: substitui por FONTE (reimportar a transcrição não apaga o livro)
    if (dados.trechos) {
      const itens = Array.isArray(dados.trechos.itens) ? dados.trechos.itens : [];
      const fontes = new Set();
      const prontos = itens.map((t, i) => {
        const fonte = s(t && t.fonte, 20);
        if (!FONTES.includes(fonte)) throw new Error(`trecho ${i + 1}: fonte deve ser ${FONTES.join('|')}.`);
        const texto = s(t.texto, 6000);
        if (texto.length < 20) throw new Error(`trecho ${i + 1}: texto curto demais.`);
        fontes.add(fonte);
        return { fonte, texto, rotulo: s(t.rotulo, 160), lesson_id: aulaId(t, `trecho ${i + 1}`),
          ini_seg: t.ini_seg == null ? -1 : Math.max(0, parseInt(t.ini_seg, 10) || 0), ordem: i };
      });
      for (const f of (dados.trechos.substituir_fontes || [...fontes])) {
        if (!FONTES.includes(f)) throw new Error(`substituir_fontes: "${f}" não é fonte válida.`);
        db.prepare('DELETE FROM tutor_trechos WHERE product_id = ? AND fonte = ?').run(produto.id, f);
      }
      const ins = db.prepare('INSERT INTO tutor_trechos (id, product_id, lesson_id, fonte, rotulo, ini_seg, ordem, texto, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const t of prontos) { ins.run(novoId(), produto.id, t.lesson_id, t.fonte, t.rotulo, t.ini_seg, t.ordem, t.texto, nowISO()); r.trechos++; }
    }
    for (const q of (Array.isArray(dados.quizzes) ? dados.quizzes : [])) {
      const onde = `quiz "${s(q.aula_titulo, 80)}"`;
      const lid = aulaId(q, onde);
      if (!lid) throw new Error(`${onde}: informe modulo_titulo e aula_titulo.`);
      const status = STATUS.includes(q.status) ? q.status : 'rascunho';
      const questoes = validarQuestoes(q.questoes, onde);
      db.prepare(`INSERT INTO aula_quiz (lesson_id, product_id, questoes, status, atualizado_em) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(lesson_id) DO UPDATE SET questoes = excluded.questoes, status = excluded.status, atualizado_em = excluded.atualizado_em`)
        .run(lid, produto.id, j.str(questoes), status, nowISO());
      r.quizzes++;
    }
    for (const c of (Array.isArray(dados.cadernos) ? dados.cadernos : [])) {
      const onde = `caderno "${s(c.aula_titulo, 80)}"`;
      const lid = aulaId(c, onde);
      if (!lid) throw new Error(`${onde}: informe modulo_titulo e aula_titulo.`);
      const status = STATUS.includes(c.status) ? c.status : 'rascunho';
      db.prepare(`INSERT INTO aula_caderno (lesson_id, product_id, dados, status, atualizado_em) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(lesson_id) DO UPDATE SET dados = excluded.dados, status = excluded.status, atualizado_em = excluded.atualizado_em`)
        .run(lid, produto.id, j.str(validarCaderno(c, onde)), status, nowISO());
      r.cadernos++;
    }
    // PROMPTS: a biblioteca inteira é substituída de uma vez (a ordem é a do payload)
    if (dados.prompts) {
      const itens = Array.isArray(dados.prompts.itens) ? dados.prompts.itens : [];
      const status = STATUS.includes(dados.prompts.status) ? dados.prompts.status : 'rascunho';
      db.prepare('DELETE FROM curso_prompts WHERE product_id = ?').run(produto.id);
      const ins = db.prepare(`INSERT INTO curso_prompts (id, product_id, ordem, categoria, titulo, objetivo, prompt, exemplo, personalizar, aula_ref, status, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      itens.forEach((p, i) => {
        const titulo = s(p && p.titulo, 160), texto = s(p && p.prompt, 6000);
        if (!titulo || texto.length < 20) throw new Error(`prompt ${i + 1}: título e prompt são obrigatórios.`);
        ins.run(novoId(), produto.id, i, s(p.categoria, 60), titulo, s(p.objetivo, 800), texto, s(p.exemplo, 3000),
          s(p.personalizar, 1500), s(p.aula_ref, 160), status, nowISO());
        r.prompts++;
      });
    }
    if (Array.isArray(dados.extras)) {
      db.prepare('DELETE FROM curso_extras WHERE product_id = ?').run(produto.id);
      dados.extras.forEach((x, i) => {
        const titulo = s(x && x.titulo, 120);
        if (!titulo) throw new Error(`extra ${i + 1}: sem título.`);
        const status = x.status === 'disponivel' ? 'disponivel' : 'em_breve';
        const url = s(x.url, 300);
        if (url && !/^(https:\/\/|\/)/.test(url)) throw new Error(`extra ${i + 1}: url deve ser https:// ou relativa.`);
        db.prepare('INSERT INTO curso_extras (id, product_id, ordem, titulo, descricao, status, url, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(novoId(), produto.id, i, titulo, s(x.descricao, 600), status, status === 'disponivel' ? url : '', nowISO());
        r.extras++;
      });
    }
  });
  if (dados.trechos) invalidar(produto.id);
  return r;
}

// publicar/despublicar em lote (depois da revisão do produtor)
function definirStatus(produto, { quizzes, cadernos, prompts } = {}) {
  const r = {};
  const st = (v) => (STATUS.includes(v) ? v : null);
  if (st(quizzes)) r.quizzes = db.prepare('UPDATE aula_quiz SET status = ?, atualizado_em = ? WHERE product_id = ?').run(quizzes, nowISO(), produto.id).changes;
  if (st(cadernos)) r.cadernos = db.prepare('UPDATE aula_caderno SET status = ?, atualizado_em = ? WHERE product_id = ?').run(cadernos, nowISO(), produto.id).changes;
  if (st(prompts)) r.prompts = db.prepare('UPDATE curso_prompts SET status = ? WHERE product_id = ?').run(prompts, produto.id).changes;
  return r;
}

function resumo(productId) {
  const q = (sql) => db.prepare(sql).all(productId);
  return {
    trechos: q('SELECT fonte, COUNT(*) n, SUM(LENGTH(texto)) chars FROM tutor_trechos WHERE product_id = ? GROUP BY fonte'),
    quizzes: q(`SELECT l.titulo aula, z.status, z.questoes FROM aula_quiz z JOIN lessons l ON l.id = z.lesson_id WHERE z.product_id = ? ORDER BY l.ordem`)
      .map(x => ({ aula: x.aula, status: x.status, questoes: j.parse(x.questoes, []).length })),
    cadernos: q(`SELECT l.titulo aula, c.status FROM aula_caderno c JOIN lessons l ON l.id = c.lesson_id WHERE c.product_id = ?`),
    prompts: q('SELECT status, COUNT(*) n FROM curso_prompts WHERE product_id = ? GROUP BY status'),
    extras: q('SELECT titulo, status FROM curso_extras WHERE product_id = ? ORDER BY ordem'),
  };
}

// ---------------------------------------------------------------------
// ALUNO
// ---------------------------------------------------------------------
// o que o estúdio precisa saber para montar as abas (sem conteúdo pesado)
function resumoParaAluno(usuario, produto) {
  const vis = statusVisiveis(usuario, produto);
  const ph = vis.map(() => '?').join(',');
  const aulasQuiz = db.prepare(`SELECT lesson_id, status FROM aula_quiz WHERE product_id = ? AND status IN (${ph})`).all(produto.id, ...vis);
  const aulasCad = db.prepare(`SELECT lesson_id, status FROM aula_caderno WHERE product_id = ? AND status IN (${ph})`).all(produto.id, ...vis);
  const melhor = {};
  for (const t of db.prepare('SELECT lesson_id, MAX(acertos * 100 / total) pct FROM quiz_tentativas WHERE user_id = ? AND product_id = ? GROUP BY lesson_id').all(usuario.id, produto.id)) melhor[t.lesson_id] = t.pct;
  const temTutor = !!db.prepare('SELECT 1 FROM tutor_trechos WHERE product_id = ? LIMIT 1').get(produto.id);
  return {
    quiz: Object.fromEntries(aulasQuiz.map(x => [x.lesson_id, { status: x.status, melhor_pct: melhor[x.lesson_id] == null ? null : melhor[x.lesson_id] }])),
    caderno: Object.fromEntries(aulasCad.map(x => [x.lesson_id, { status: x.status }])),
    prompts: db.prepare(`SELECT COUNT(*) n FROM curso_prompts WHERE product_id = ? AND status IN (${ph})`).get(produto.id, ...vis).n,
    tutor: { base_propria: temTutor, nome: 'Tutor Villela' },
    extras: db.prepare('SELECT titulo, descricao, status, url FROM curso_extras WHERE product_id = ? ORDER BY ordem').all(produto.id),
    revisor: podeRevisar(usuario, produto),
  };
}

// questões SEM gabarito — o navegador só descobre a resposta depois de responder
function quizParaAluno(usuario, lessonId) {
  const ac = acessoAula(usuario, lessonId);
  if (!ac) return null;
  const z = db.prepare('SELECT * FROM aula_quiz WHERE lesson_id = ?').get(ac.aula.id);
  if (!z || !statusVisiveis(usuario, ac.produto).includes(z.status)) return null;
  const tent = db.prepare('SELECT acertos, total, criado_em FROM quiz_tentativas WHERE user_id = ? AND lesson_id = ? ORDER BY criado_em DESC LIMIT 5').all(usuario.id, ac.aula.id);
  return {
    aula: { id: ac.aula.id, titulo: ac.aula.titulo }, status: z.status,
    questoes: j.parse(z.questoes, []).map(q => ({ id: q.id, tipo: q.tipo, enunciado: q.enunciado, alternativas: q.alternativas.map(a => a.texto) })),
    tentativas: tent,
  };
}
function corrigirQuiz(usuario, lessonId, respostas) {
  const ac = acessoAula(usuario, lessonId);
  if (!ac) { const e = new Error('Quiz não disponível para você.'); e.status = 404; throw e; }
  const z = db.prepare('SELECT * FROM aula_quiz WHERE lesson_id = ?').get(ac.aula.id);
  if (!z || !statusVisiveis(usuario, ac.produto).includes(z.status)) { const e = new Error('Quiz não disponível para você.'); e.status = 404; throw e; }
  const qs = j.parse(z.questoes, []);
  const resp = (respostas && typeof respostas === 'object') ? respostas : {};
  let acertos = 0;
  const correcao = qs.map(q => {
    const escolhida = Number.isInteger(resp[q.id]) ? resp[q.id] : (resp[q.id] != null && /^\d+$/.test(String(resp[q.id])) ? Number(resp[q.id]) : -1);
    const certa = q.alternativas.findIndex(a => a.correta);
    const ok = escolhida === certa;
    if (ok) acertos++;
    return { id: q.id, escolhida, correta: certa, acertou: ok, explicacoes: q.alternativas.map(a => a.explicacao) };
  });
  const respondidas = correcao.filter(c => c.escolhida >= 0).length;
  if (respondidas < qs.length) throw new Error(`Responda todas as questões (${respondidas} de ${qs.length}).`);
  db.prepare('INSERT INTO quiz_tentativas (id, user_id, lesson_id, product_id, respostas, acertos, total, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(novoId(), usuario.id, ac.aula.id, ac.produto.id, j.str(resp), acertos, qs.length, nowISO());
  return { acertos, total: qs.length, pct: Math.round(acertos * 100 / qs.length), correcao };
}

function cadernoParaAluno(usuario, lessonId) {
  const ac = acessoAula(usuario, lessonId);
  if (!ac) return null;
  const c = db.prepare('SELECT * FROM aula_caderno WHERE lesson_id = ?').get(ac.aula.id);
  if (!c || !statusVisiveis(usuario, ac.produto).includes(c.status)) return null;
  const respostas = {};
  for (const r of db.prepare('SELECT campo, texto FROM caderno_respostas WHERE user_id = ? AND lesson_id = ?').all(usuario.id, ac.aula.id)) respostas[r.campo] = r.texto;
  return { aula: { id: ac.aula.id, titulo: ac.aula.titulo }, status: c.status, caderno: j.parse(c.dados, {}), respostas };
}
function salvarResposta(usuario, lessonId, campo, texto) {
  const cad = cadernoParaAluno(usuario, lessonId);
  if (!cad) { const e = new Error('Caderno não disponível para você.'); e.status = 404; throw e; }
  const campos = camposDoCaderno(cad.caderno);
  if (!campos.includes(campo)) throw new Error('Campo do caderno inválido.');
  const aula = aulaDoProduto(lessonId);
  db.prepare(`INSERT INTO caderno_respostas (user_id, lesson_id, product_id, campo, texto, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, lesson_id, campo) DO UPDATE SET texto = excluded.texto, atualizado_em = excluded.atualizado_em`)
    .run(usuario.id, aula.id, aula.product_id, campo, s(texto, 8000), nowISO());
  return { ok: true, campo };
}
// o caderno inteiro do curso, com as respostas — alimenta a versão para imprimir/PDF
function cadernoCompleto(usuario, produto) {
  const vis = statusVisiveis(usuario, produto);
  const acesso = ct.temAcesso(usuario.id, produto.id) || podeRevisar(usuario, produto);
  const aulas = [];
  for (const m of ct.Produtos.estrutura(produto.id)) {
    for (const a of m.aulas) {
      if (!acesso && !a.gratuita) continue;
      const c = db.prepare('SELECT dados, status FROM aula_caderno WHERE lesson_id = ?').get(a.id);
      if (!c || !vis.includes(c.status)) continue;
      const respostas = {};
      for (const r of db.prepare('SELECT campo, texto FROM caderno_respostas WHERE user_id = ? AND lesson_id = ?').all(usuario.id, a.id)) respostas[r.campo] = r.texto;
      aulas.push({ modulo: m.titulo, aula: a.titulo, caderno: j.parse(c.dados, {}), respostas });
    }
  }
  return aulas;
}

function promptsParaAluno(usuario, produto) {
  if (!ct.temAcesso(usuario.id, produto.id) && !podeRevisar(usuario, produto)) return null;
  const vis = statusVisiveis(usuario, produto);
  return db.prepare(`SELECT id, categoria, titulo, objetivo, prompt, exemplo, personalizar, aula_ref, status FROM curso_prompts
    WHERE product_id = ? AND status IN (${vis.map(() => '?').join(',')}) ORDER BY ordem`).all(produto.id, ...vis);
}

// ---------------------------------------------------------------------
// TUTOR: contexto recuperado + histórico curto da conversa
// ---------------------------------------------------------------------
function contextoTutor(usuario, produto, pergunta, lessonId) {
  const acesso = ct.temAcesso(usuario.id, produto.id) || podeRevisar(usuario, produto);
  const gratis = new Set(db.prepare('SELECT id FROM lessons WHERE product_id = ? AND gratuita = 1').all(produto.id).map(x => x.id));
  // quem não comprou só conversa sobre as aulas de degustação — livro e aulas pagas ficam fora
  const permitido = (d) => acesso || (d.lesson_id && gratis.has(d.lesson_id));
  let trechos = buscar(produto.id, pergunta, { n: 8, aulaAtual: s(lessonId, 40), permitido });
  if (lessonId && !trechos.some(t => t.lesson_id === lessonId)) {
    const daAula = trechosDaAula(produto.id, lessonId).filter(permitido);
    trechos = daAula.slice(0, 2).concat(trechos).slice(0, 9);
  }
  const titulos = new Map(db.prepare('SELECT id, titulo FROM lessons WHERE product_id = ?').all(produto.id).map(x => [x.id, x.titulo]));
  return trechos.map((t, i) => ({
    n: i + 1, id: t.id, fonte: t.fonte, lesson_id: t.lesson_id || '', aula: titulos.get(t.lesson_id) || '',
    rotulo: t.rotulo || (titulos.get(t.lesson_id) || t.fonte), ini_seg: t.ini_seg, texto: t.texto,
  }));
}
function historico(userId, productId, n = 3) {
  return db.prepare('SELECT pergunta, resposta FROM tutor_conversas WHERE user_id = ? AND product_id = ? ORDER BY criado_em DESC LIMIT ?')
    .all(userId, productId, n).reverse();
}
function registrarConversa(userId, productId, lessonId, pergunta, resposta, fontes) {
  db.prepare('INSERT INTO tutor_conversas (id, user_id, product_id, lesson_id, pergunta, resposta, fontes, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(novoId(), userId, productId, s(lessonId, 40), s(pergunta, 1000), s(resposta, 8000), j.str(fontes || []), nowISO());
}
function conversas(userId, productId, n = 20) {
  return db.prepare('SELECT pergunta, resposta, fontes, lesson_id, criado_em FROM tutor_conversas WHERE user_id = ? AND product_id = ? ORDER BY criado_em DESC LIMIT ?')
    .all(userId, productId, Math.min(parseInt(n, 10) || 20, 50)).reverse().map(c => ({ ...c, fontes: j.parse(c.fontes, []) }));
}

module.exports = {
  FONTES, TIPOS_QUESTAO, podeRevisar, importar, definirStatus, resumo, resumoParaAluno,
  quizParaAluno, corrigirQuiz, cadernoParaAluno, salvarResposta, cadernoCompleto, camposDoCaderno,
  promptsParaAluno, contextoTutor, historico, registrarConversa, conversas, buscar, tokens, validarQuestoes,
};
