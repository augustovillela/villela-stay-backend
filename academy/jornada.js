// =====================================================================
// Villela Academy — JORNADA DO ALUNO (fases 2 e 3 da experiência de
// aprendizagem). Tudo o que é do CURSO inteiro, não de uma aula:
//
//   fase 2 · diagnóstico inicial e teste final (antes 42 → depois 86),
//            XP e níveis, selos por competência e medalhas,
//            Villela Lab (missões práticas + projeto final com rubrica),
//            desafio de N dias (21 por padrão);
//   fase 3 · simulações ramificadas (decisão → consequência → nova
//            decisão), recursos (cheat sheets e templates) e o apoio de
//            IA às ferramentas do aluno (Prompt Builder, gerador de agentes).
//
// Regras que não se afrouxam:
//   • conteúdo entra pela chave de publicação em RASCUNHO, por seção; o
//     aluno só vê o publicado (o dono do curso e o admin veem tudo);
//   • gabarito e consequências ficam no servidor — o navegador recebe a
//     pergunta, responde, e só então descobre (avaliação e simulação);
//   • XP, nível e selos são DERIVADOS do que o aluno fez — nada de saldo
//     gravado que possa divergir da realidade;
//   • a avaliação da IA sobre uma missão é INDICAÇÃO, não nota.
// =====================================================================
'use strict';
const crypto = require('crypto');
const { db, nowISO, novoId, j, transacao } = require('./db');
const ct = require('./repo-conteudo');
const it = require('./interativo');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const slug = (v) => s(v, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const erro = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };

const SECOES = ['competencias', 'avaliacao', 'lab', 'desafio', 'simulacoes', 'recursos'];
const STATUS = ['rascunho', 'publicado'];
const MOMENTOS = ['diagnostico', 'final'];
const FINAL_EXIGE_PCT = 70;          // o teste final abre com 70% das aulas concluídas
const QUIZ_APROVA = 70;              // % mínimo para o quiz contar para selo e XP

// níveis da avaliação (diagnóstico/final): a régua pedida pelo Augusto
const NIVEIS_AVALIACAO = [[85, 'Especialista'], [65, 'Avançado'], [40, 'Praticante'], [0, 'Explorador']];
const nivelAvaliacao = (pct) => NIVEIS_AVALIACAO.find(([min]) => pct >= min)[1];
// níveis de XP: proporcionais ao máximo do curso — curso grande não fica impossível, curso pequeno não fica trivial
const NIVEIS_XP = [
  { n: 1, nome: 'Explorador', min: 0 }, { n: 2, nome: 'Praticante', min: 0.12 }, { n: 3, nome: 'Criador', min: 0.30 },
  { n: 4, nome: 'Especialista', min: 0.55 }, { n: 5, nome: 'Mestre', min: 0.80 },
];
const XP = { aula: 10, quiz: 20, quiz_100: 10, caderno: 15, diagnostico: 25, final: 50, missao: 60, projeto: 200, dia: 10, desafio_completo: 100, simulacao: 30, simulacao_otima: 20 };

// data de Brasília (UTC−3, sem horário de verão) — o "dia" do desafio vira à meia-noite do aluno
function hojeBR(d = new Date()) { return new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10); }
function diasEntre(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400e3); }

// ---------------------------------------------------------------------
// ACESSO: mesma regra da fase 1 — quem comprou vê o publicado; dono/admin revisam
// ---------------------------------------------------------------------
function contexto(usuario, produto) {
  const revisor = it.podeRevisar(usuario, produto);
  const acesso = revisor || ct.temAcesso(usuario.id, produto.id);
  return { revisor, acesso, vis: revisor ? STATUS : ['publicado'] };
}
function exigirAcesso(usuario, produto) {
  const c = contexto(usuario, produto);
  if (!c.acesso) throw erro('Esta área é para quem tem acesso ao curso.', 403);
  return c;
}
function secao(productId, nome, vis) {
  const r = db.prepare('SELECT dados, status FROM curso_jornada WHERE product_id = ? AND secao = ?').get(productId, nome);
  if (!r || (vis && !vis.includes(r.status))) return null;
  return { status: r.status, dados: j.parse(r.dados, {}) };
}

// ---------------------------------------------------------------------
// VALIDAÇÃO do conteúdo importado — cada seção tem a sua trava
// ---------------------------------------------------------------------
function validarCompetencias(d, aulaId) {
  const itens = Array.isArray(d && d.itens) ? d.itens : [];
  if (!itens.length || itens.length > 12) throw erro('competencias: de 1 a 12 competências.');
  const ids = new Set();
  return { itens: itens.map((c, i) => {
    const id = slug(c.id || c.nome), nome = s(c.nome, 80);
    if (!id || !nome) throw erro(`competência ${i + 1}: id e nome são obrigatórios.`);
    if (ids.has(id)) throw erro(`competência ${i + 1}: id repetido "${id}".`);
    ids.add(id);
    const aulas = (Array.isArray(c.aulas) ? c.aulas : []).map((a, k) => {
      const lid = aulaId(a, `competência "${nome}", aula ${k + 1}`);
      if (!lid) throw erro(`competência "${nome}", aula ${k + 1}: informe modulo_titulo e aula_titulo.`);
      return lid;
    });
    if (!aulas.length) throw erro(`competência "${nome}": ligue ao menos uma aula (é o quiz dela que dá o selo).`);
    return { id, nome, descricao: s(c.descricao, 300), icone: s(c.icone, 8), aulas };
  }) };
}
function validarAvaliacao(d, competencias) {
  const qs = Array.isArray(d && d.questoes) ? d.questoes : [];
  if (qs.length < 5 || qs.length > 30) throw erro('avaliacao: de 5 a 30 questões.');
  // reaproveita a trava do quiz (uma certa, explicação em todas) — com limite próprio de quantidade
  const base = [];
  for (let i = 0; i < qs.length; i += 20) base.push(...it.validarQuestoes(qs.slice(i, i + 20).map((q, k) => ({ ...q, id: q.id || `a${i + k + 1}` })), 'avaliação'));
  const comp = new Set(((competencias && competencias.itens) || []).map(c => c.id));
  return { titulo: s(d.titulo, 120) || 'Teste o seu nível', descricao: s(d.descricao, 600), questoes: base.map((q, i) => {
    const c = slug(qs[i].competencia);
    if (comp.size && c && !comp.has(c)) throw erro(`avaliação, questão ${i + 1}: competência "${c}" não existe.`);
    return { ...q, competencia: c };
  }) };
}
function validarLab(d) {
  const ms = Array.isArray(d && d.missoes) ? d.missoes : [];
  if (!ms.length || ms.length > 20) throw erro('lab: de 1 a 20 missões.');
  const ids = new Set();
  let projetos = 0;
  const missoes = ms.map((m, i) => {
    const tag = `missão ${i + 1}`;
    const id = slug(m.id || m.titulo), titulo = s(m.titulo, 140);
    if (!id || !titulo) throw erro(`${tag}: id e título são obrigatórios.`);
    if (ids.has(id)) throw erro(`${tag}: id repetido "${id}".`);
    ids.add(id);
    const tipo = m.tipo === 'projeto' ? 'projeto' : 'missao';
    if (tipo === 'projeto') projetos++;
    const entregaveis = (Array.isArray(m.entregaveis) ? m.entregaveis : []).map((e, k) => ({
      id: slug(e.id || e.rotulo) || `e${k + 1}`, rotulo: s(e.rotulo, 160), dica: s(e.dica, 400),
    }));
    if (!entregaveis.length || entregaveis.some(e => !e.rotulo)) throw erro(`${tag}: liste o que o aluno entrega (entregaveis com rótulo).`);
    if (new Set(entregaveis.map(e => e.id)).size !== entregaveis.length) throw erro(`${tag}: entregáveis com id repetido.`);
    const rubrica = (Array.isArray(m.rubrica) ? m.rubrica : []).map(r => ({ criterio: s(r.criterio, 120), descricao: s(r.descricao, 400) })).filter(r => r.criterio);
    if (rubrica.length < 2) throw erro(`${tag}: a rubrica precisa de pelo menos 2 critérios (é com ela que o aluno se avalia).`);
    return { id, tipo, titulo, contexto: s(m.contexto, 2000), objetivo: s(m.objetivo, 600),
      passos: (Array.isArray(m.passos) ? m.passos : []).map(x => s(x, 400)).filter(Boolean).slice(0, 12),
      entregaveis, rubrica, competencia: slug(m.competencia), aula_ref: s(m.aula_ref, 160), tempo: s(m.tempo, 40) };
  });
  if (projetos > 1) throw erro('lab: só um projeto final por curso.');
  return { missoes };
}
function validarDesafio(d) {
  const dias = Array.isArray(d && d.dias) ? d.dias : [];
  if (dias.length < 7 || dias.length > 30) throw erro('desafio: de 7 a 30 dias.');
  return { titulo: s(d.titulo, 120) || `Desafio de ${dias.length} dias`, descricao: s(d.descricao, 800),
    dias: dias.map((x, i) => {
      const titulo = s(x.titulo, 140), tarefa = s(x.tarefa, 1200);
      if (!titulo || tarefa.length < 15) throw erro(`desafio, dia ${i + 1}: título e tarefa são obrigatórios.`);
      return { dia: i + 1, titulo, tarefa, dica: s(x.dica, 500), aula_ref: s(x.aula_ref, 160) };
    }) };
}
// grafo da simulação: todo destino existe, todo nó é alcançável, não há ciclo e todo caminho termina num final
function validarSimulacoes(d) {
  const itens = Array.isArray(d && d.itens) ? d.itens : [];
  if (!itens.length || itens.length > 20) throw erro('simulacoes: de 1 a 20 simulações.');
  const ids = new Set();
  return { itens: itens.map((sim, i) => {
    const tag = `simulação ${i + 1}`;
    const id = slug(sim.id || sim.titulo), titulo = s(sim.titulo, 140);
    if (!id || !titulo) throw erro(`${tag}: id e título são obrigatórios.`);
    if (ids.has(id)) throw erro(`${tag}: id repetido.`);
    ids.add(id);
    const brutos = sim.nos && typeof sim.nos === 'object' ? sim.nos : {};
    const nos = {};
    for (const [nid, n] of Object.entries(brutos)) {
      const k = slug(nid);
      if (!k) throw erro(`${tag}: nó sem id.`);
      const texto = s(n && n.texto, 3000);
      if (texto.length < 10) throw erro(`${tag}, nó "${k}": texto curto demais.`);
      if (n.final) {
        const desfecho = ['otimo', 'bom', 'ruim'].includes(n.final.desfecho) ? n.final.desfecho : '';
        if (!desfecho) throw erro(`${tag}, nó "${k}": o final precisa de desfecho otimo|bom|ruim.`);
        nos[k] = { texto, final: { desfecho, licao: s(n.final.licao, 1500) } };
        continue;
      }
      const ops = Array.isArray(n.opcoes) ? n.opcoes : [];
      if (ops.length < 2 || ops.length > 4) throw erro(`${tag}, nó "${k}": de 2 a 4 opções (ou é um final).`);
      nos[k] = { texto, opcoes: ops.map((o, x) => {
        const t = s(o.texto, 400), fb = s(o.feedback, 1200);
        if (!t || fb.length < 10) throw erro(`${tag}, nó "${k}", opção ${x + 1}: texto e feedback (a consequência) são obrigatórios.`);
        const pts = Math.max(0, Math.min(10, parseInt(o.pontos, 10) || 0));
        return { texto: t, vai_para: slug(o.vai_para), feedback: fb, pontos: pts };
      }) };
    }
    const inicio = slug(sim.inicio);
    if (!nos[inicio]) throw erro(`${tag}: o nó de início "${inicio}" não existe.`);
    for (const [k, n] of Object.entries(nos)) for (const o of (n.opcoes || [])) if (!nos[o.vai_para]) throw erro(`${tag}, nó "${k}": destino "${o.vai_para}" não existe.`);
    // alcançável + sem ciclo (DFS com cores) + pontuação máxima possível
    const cor = {}, melhor = {};
    const visitar = (k) => {
      if (cor[k] === 1) throw erro(`${tag}: há um ciclo passando por "${k}" — a simulação precisa sempre andar para a frente.`);
      if (cor[k] === 2) return melhor[k];
      cor[k] = 1;
      const n = nos[k];
      melhor[k] = n.final ? 0 : Math.max(...n.opcoes.map(o => o.pontos + visitar(o.vai_para)));
      cor[k] = 2;
      return melhor[k];
    };
    const max = visitar(inicio);
    const soltos = Object.keys(nos).filter(k => !cor[k]);
    if (soltos.length) throw erro(`${tag}: nós que ninguém alcança: ${soltos.join(', ')}.`);
    if (!Object.values(nos).some(n => n.final)) throw erro(`${tag}: precisa de pelo menos um final.`);
    return { id, titulo, resumo: s(sim.resumo, 400), contexto: s(sim.contexto, 2500), competencia: slug(sim.competencia),
      papel: s(sim.papel, 160), inicio, nos, pontos_max: max };
  }) };
}
function validarRecursos(d) {
  const itens = Array.isArray(d && d.itens) ? d.itens : [];
  if (!itens.length || itens.length > 40) throw erro('recursos: de 1 a 40 itens.');
  const ids = new Set();
  return { itens: itens.map((r, i) => {
    const tag = `recurso ${i + 1}`;
    const tipo = r.tipo === 'template' ? 'template' : (r.tipo === 'cheatsheet' ? 'cheatsheet' : '');
    if (!tipo) throw erro(`${tag}: tipo deve ser cheatsheet|template.`);
    const id = slug(r.id || r.titulo), titulo = s(r.titulo, 140);
    if (!id || !titulo) throw erro(`${tag}: id e título são obrigatórios.`);
    if (ids.has(id)) throw erro(`${tag}: id repetido.`);
    ids.add(id);
    const secoes = (Array.isArray(r.secoes) ? r.secoes : []).map(x => ({
      titulo: s(x.titulo, 120), itens: (Array.isArray(x.itens) ? x.itens : []).map(y => s(y, 600)).filter(Boolean).slice(0, 20),
    })).filter(x => x.titulo && x.itens.length);
    const corpo = s(r.corpo, 8000);
    if (tipo === 'cheatsheet' && !secoes.length) throw erro(`${tag}: cheat sheet precisa de seções com itens.`);
    if (tipo === 'template' && corpo.length < 30) throw erro(`${tag}: template precisa do corpo (o texto para copiar).`);
    return { id, tipo, titulo, categoria: s(r.categoria, 60), descricao: s(r.descricao, 400), secoes, corpo, como_usar: s(r.como_usar, 1000) };
  }) };
}

// ---------------------------------------------------------------------
// IMPORTAÇÃO (chave de publicação) e publicação
// ---------------------------------------------------------------------
function importar(produto, dados, aulaPorTitulo) {
  const aulaId = (x) => (x && (x.modulo_titulo || x.aula_titulo)) ? aulaPorTitulo(produto.id, { modulo_titulo: x.modulo_titulo, aula_titulo: x.aula_titulo }).id : '';
  const prontos = {};
  // competências primeiro: a avaliação confere se a competência de cada questão existe
  const compNova = dados.competencias ? validarCompetencias(dados.competencias, aulaId) : null;
  const compAtual = compNova || (secao(produto.id, 'competencias') || {}).dados;
  if (compNova) prontos.competencias = compNova;
  if (dados.avaliacao) prontos.avaliacao = validarAvaliacao(dados.avaliacao, compAtual);
  if (dados.lab) prontos.lab = validarLab(dados.lab);
  if (dados.desafio) prontos.desafio = validarDesafio(dados.desafio);
  if (dados.simulacoes) prontos.simulacoes = validarSimulacoes(dados.simulacoes);
  if (dados.recursos) prontos.recursos = validarRecursos(dados.recursos);
  const r = {};
  transacao(() => {
    for (const [nome, d] of Object.entries(prontos)) {
      const bruto = dados[nome] || {};
      const status = STATUS.includes(bruto.status) ? bruto.status : 'rascunho';
      db.prepare(`INSERT INTO curso_jornada (product_id, secao, dados, status, atualizado_em) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(product_id, secao) DO UPDATE SET dados = excluded.dados, status = excluded.status, atualizado_em = excluded.atualizado_em`)
        .run(produto.id, nome, j.str(d), status, nowISO());
      r[nome] = status;
    }
  });
  return r;
}
function definirStatus(produto, pedido = {}) {
  const r = {};
  const alvo = pedido.secoes && typeof pedido.secoes === 'object' ? pedido.secoes : {};
  if (STATUS.includes(pedido.todas)) for (const n of SECOES) alvo[n] = pedido.todas;
  for (const [n, st] of Object.entries(alvo)) {
    if (!SECOES.includes(n)) throw erro(`seção "${n}" não existe (${SECOES.join('|')}).`);
    if (!STATUS.includes(st)) throw erro(`status "${st}" inválido.`);
    r[n] = db.prepare('UPDATE curso_jornada SET status = ?, atualizado_em = ? WHERE product_id = ? AND secao = ?').run(st, nowISO(), produto.id, n).changes;
  }
  return r;
}
function resumo(productId) {
  return db.prepare('SELECT secao, status, dados, atualizado_em FROM curso_jornada WHERE product_id = ?').all(productId).map(x => {
    const d = j.parse(x.dados, {});
    const n = { competencias: (d.itens || []).length, avaliacao: (d.questoes || []).length, lab: (d.missoes || []).length,
      desafio: (d.dias || []).length, simulacoes: (d.itens || []).length, recursos: (d.itens || []).length }[x.secao];
    return { secao: x.secao, status: x.status, itens: n, atualizado_em: x.atualizado_em };
  });
}

// ---------------------------------------------------------------------
// AVALIAÇÃO: diagnóstico (uma vez) e teste final (refazível; vale o melhor)
// A ordem das alternativas é embaralhada por aluno e momento — decorar a
// letra do diagnóstico não ajuda no final — e a correção refaz a mesma ordem.
// ---------------------------------------------------------------------
function ordem(userId, momento, qid, n) {
  const idx = [...Array(n).keys()];
  let h = crypto.createHash('sha256').update(`${userId}|${momento}|${qid}`).digest();
  for (let i = n - 1; i > 0; i--) { const k = h[i % h.length] % (i + 1); [idx[i], idx[k]] = [idx[k], idx[i]]; }
  return idx; // posição exibida → índice original
}
function progressoPct(userId, productId) { return ct.Progresso.doProduto(userId, productId).pct || 0; }
function tentativas(userId, productId) {
  return db.prepare('SELECT momento, pontos, total, pct, nivel, por_competencia, criado_em FROM avaliacao_tentativas WHERE user_id = ? AND product_id = ? ORDER BY criado_em')
    .all(userId, productId).map(t => ({ ...t, por_competencia: j.parse(t.por_competencia, {}) }));
}
function estadoAvaliacao(usuario, produto, c) {
  const sec = secao(produto.id, 'avaliacao', c.vis);
  if (!sec) return null;
  const ts = tentativas(usuario.id, produto.id);
  const diag = ts.find(t => t.momento === 'diagnostico') || null;
  const finais = ts.filter(t => t.momento === 'final');
  const final = finais.length ? finais.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const pct = progressoPct(usuario.id, produto.id);
  return { titulo: sec.dados.titulo, descricao: sec.dados.descricao, questoes: sec.dados.questoes.length, status: sec.status,
    diagnostico: diag, final, final_liberado: c.revisor || pct >= FINAL_EXIGE_PCT, final_exige_pct: FINAL_EXIGE_PCT, progresso_pct: pct,
    diagnostico_feito: !!diag };
}
function avaliacaoParaAluno(usuario, produto, momento) {
  const c = exigirAcesso(usuario, produto);
  if (!MOMENTOS.includes(momento)) throw erro('Momento inválido.');
  const sec = secao(produto.id, 'avaliacao', c.vis);
  if (!sec) throw erro('Este curso ainda não tem a avaliação.', 404);
  const est = estadoAvaliacao(usuario, produto, c);
  if (momento === 'diagnostico' && est.diagnostico_feito && !c.revisor) throw erro('Você já fez o diagnóstico — ele é o seu ponto de partida. No fim do curso, faça o teste final.', 409);
  if (momento === 'final' && !est.final_liberado) throw erro(`O teste final abre quando você concluir ${FINAL_EXIGE_PCT}% das aulas (hoje: ${est.progresso_pct}%).`, 409);
  return { momento, titulo: sec.dados.titulo, descricao: sec.dados.descricao, status: sec.status,
    questoes: sec.dados.questoes.map(q => {
      const o = ordem(usuario.id, momento, q.id, q.alternativas.length);
      return { id: q.id, tipo: q.tipo, enunciado: q.enunciado, alternativas: o.map(k => q.alternativas[k].texto) };
    }) };
}
function corrigirAvaliacao(usuario, produto, momento, respostas) {
  avaliacaoParaAluno(usuario, produto, momento); // mesmas travas (acesso, uma vez, 70%)
  const c = contexto(usuario, produto);
  const qs = secao(produto.id, 'avaliacao', c.vis).dados.questoes;
  const resp = respostas && typeof respostas === 'object' ? respostas : {};
  const faltam = qs.filter(q => !/^\d+$/.test(String(resp[q.id] == null ? '' : resp[q.id]))).length;
  if (faltam) throw erro(`Responda todas as questões (faltam ${faltam}).`);
  const comp = {};
  let acertos = 0;
  const correcao = qs.map(q => {
    const o = ordem(usuario.id, momento, q.id, q.alternativas.length);
    const exibida = Number(resp[q.id]);
    const original = o[exibida] == null ? -1 : o[exibida];
    const certaOriginal = q.alternativas.findIndex(a => a.correta);
    const ok = original === certaOriginal;
    if (ok) acertos++;
    const k = q.competencia || '_geral';
    comp[k] = comp[k] || { acertos: 0, total: 0 };
    comp[k].total++; if (ok) comp[k].acertos++;
    return { id: q.id, escolhida: exibida, correta: o.indexOf(certaOriginal), acertou: ok, explicacoes: o.map(i => q.alternativas[i].explicacao) };
  });
  const pct = Math.round(acertos * 100 / qs.length);
  const nivel = nivelAvaliacao(pct);
  for (const k of Object.keys(comp)) comp[k].pct = Math.round(comp[k].acertos * 100 / comp[k].total);
  db.prepare('INSERT INTO avaliacao_tentativas (id, user_id, product_id, momento, respostas, pontos, total, pct, nivel, por_competencia, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(novoId(), usuario.id, produto.id, momento, j.str(resp), acertos, qs.length, pct, nivel, j.str(comp), nowISO());
  return { momento, acertos, total: qs.length, pct, nivel, por_competencia: comp, correcao,
    recomendacao: recomendar(produto, comp, c), antes: momento === 'final' ? (tentativas(usuario.id, produto.id).find(t => t.momento === 'diagnostico') || null) : null };
}
// trilha recomendada: as competências mais fracas, com as aulas delas
function recomendar(produto, porComp, c) {
  const comps = ((secao(produto.id, 'competencias', c.vis) || {}).dados || {}).itens || [];
  const titulos = new Map(db.prepare('SELECT id, titulo FROM lessons WHERE product_id = ?').all(produto.id).map(x => [x.id, x.titulo]));
  return comps.map(k => ({ ...k, pct: porComp[k.id] ? porComp[k.id].pct : null }))
    .filter(k => k.pct != null && k.pct < 70)
    .sort((a, b) => a.pct - b.pct).slice(0, 3)
    .map(k => ({ competencia: k.id, nome: k.nome, pct: k.pct, aulas: k.aulas.map(id => ({ id, titulo: titulos.get(id) || '' })).filter(a => a.titulo) }));
}

// ---------------------------------------------------------------------
// VILLELA LAB: missões práticas e projeto final
// ---------------------------------------------------------------------
function labParaAluno(usuario, produto) {
  const c = exigirAcesso(usuario, produto);
  const sec = secao(produto.id, 'lab', c.vis);
  if (!sec) throw erro('Este curso ainda não tem o Villela Lab.', 404);
  const minhas = {};
  for (const e of db.prepare('SELECT missao_id, respostas, entregue_em, feedback, avaliado_em, atualizado_em FROM lab_entregas WHERE user_id = ? AND product_id = ?').all(usuario.id, produto.id)) {
    minhas[e.missao_id] = { respostas: j.parse(e.respostas, {}), entregue_em: e.entregue_em, feedback: j.parse(e.feedback, null), avaliado_em: e.avaliado_em, atualizado_em: e.atualizado_em };
  }
  return { status: sec.status, missoes: sec.dados.missoes, entregas: minhas };
}
function missao(usuario, produto, missaoId) {
  const lab = labParaAluno(usuario, produto);
  const m = lab.missoes.find(x => x.id === s(missaoId, 60));
  if (!m) throw erro('Missão não encontrada.', 404);
  return { m, entrega: lab.entregas[m.id] || null };
}
function salvarEntrega(usuario, produto, missaoId, respostas) {
  const { m, entrega } = missao(usuario, produto, missaoId);
  const r = {};
  for (const e of m.entregaveis) r[e.id] = s(respostas && respostas[e.id], 12000);
  const t = nowISO();
  db.prepare(`INSERT INTO lab_entregas (user_id, product_id, missao_id, respostas, entregue_em, feedback, avaliado_em, atualizado_em) VALUES (?, ?, ?, ?, '', '', '', ?)
    ON CONFLICT(user_id, product_id, missao_id) DO UPDATE SET respostas = excluded.respostas, atualizado_em = excluded.atualizado_em`)
    .run(usuario.id, produto.id, m.id, j.str(r), t);
  return { ok: true, entregue: !!(entrega && entrega.entregue_em) };
}
function entregar(usuario, produto, missaoId) {
  const { m, entrega } = missao(usuario, produto, missaoId);
  const r = (entrega && entrega.respostas) || {};
  const vazios = m.entregaveis.filter(e => s(r[e.id], 12000).length < 20).map(e => e.rotulo);
  if (vazios.length) throw erro(`Complete antes de entregar: ${vazios.join('; ')} (pelo menos algumas linhas em cada).`);
  if (entrega.entregue_em) return { ok: true, entregue_em: entrega.entregue_em, ja_entregue: true };
  const t = nowISO();
  db.prepare('UPDATE lab_entregas SET entregue_em = ? WHERE user_id = ? AND product_id = ? AND missao_id = ?').run(t, usuario.id, produto.id, m.id);
  return { ok: true, entregue_em: t };
}
function dadosParaMentor(usuario, produto, missaoId) {
  const { m, entrega } = missao(usuario, produto, missaoId);
  if (!entrega || !entrega.entregue_em) throw erro('Entregue a missão antes de pedir a avaliação do mentor.');
  return { m, respostas: entrega.respostas };
}
function registrarFeedback(usuario, produto, missaoId, fb) {
  db.prepare('UPDATE lab_entregas SET feedback = ?, avaliado_em = ? WHERE user_id = ? AND product_id = ? AND missao_id = ?')
    .run(j.str(fb), nowISO(), usuario.id, produto.id, s(missaoId, 60));
}

// ---------------------------------------------------------------------
// DESAFIO de N dias: o dia N abre N−1 dias depois do início (horário de Brasília)
// ---------------------------------------------------------------------
function desafioParaAluno(usuario, produto) {
  const c = exigirAcesso(usuario, produto);
  const sec = secao(produto.id, 'desafio', c.vis);
  if (!sec) throw erro('Este curso ainda não tem desafio.', 404);
  const ins = db.prepare('SELECT iniciado_em FROM desafio_inscricoes WHERE user_id = ? AND product_id = ?').get(usuario.id, produto.id);
  const feitos = {};
  for (const x of db.prepare('SELECT dia, nota, criado_em FROM desafio_checkins WHERE user_id = ? AND product_id = ?').all(usuario.id, produto.id)) feitos[x.dia] = x;
  const hoje = hojeBR();
  const liberadoAte = ins ? Math.min(sec.dados.dias.length, diasEntre(ins.iniciado_em, hoje) + 1) : 0;
  return { status: sec.status, titulo: sec.dados.titulo, descricao: sec.dados.descricao, iniciado_em: ins ? ins.iniciado_em : null, hoje,
    dia_atual: liberadoAte, feitos: Object.keys(feitos).length, total: sec.dados.dias.length,
    dias: sec.dados.dias.map(d => ({ ...d, liberado: c.revisor || d.dia <= liberadoAte, feito: feitos[d.dia] || null })) };
}
function iniciarDesafio(usuario, produto) {
  desafioParaAluno(usuario, produto);
  db.prepare('INSERT INTO desafio_inscricoes (user_id, product_id, iniciado_em) VALUES (?, ?, ?) ON CONFLICT(user_id, product_id) DO NOTHING')
    .run(usuario.id, produto.id, hojeBR());
  return desafioParaAluno(usuario, produto);
}
function checkin(usuario, produto, dia, nota) {
  const d = desafioParaAluno(usuario, produto);
  if (!d.iniciado_em) throw erro('Comece o desafio primeiro.');
  const alvo = d.dias.find(x => x.dia === parseInt(dia, 10));
  if (!alvo) throw erro('Dia inválido.');
  if (!alvo.liberado) throw erro(`O dia ${alvo.dia} abre em ${alvo.dia - d.dia_atual} dia(s). Um dia de cada vez — é assim que vira hábito.`, 409);
  const texto = s(nota, 3000);
  if (texto.length < 10) throw erro('Conte em uma ou duas frases o que você fez hoje.');
  db.prepare(`INSERT INTO desafio_checkins (user_id, product_id, dia, nota, criado_em) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, product_id, dia) DO UPDATE SET nota = excluded.nota`).run(usuario.id, produto.id, alvo.dia, texto, nowISO());
  return desafioParaAluno(usuario, produto);
}

// ---------------------------------------------------------------------
// SIMULAÇÕES ramificadas — jogadas no servidor, um nó de cada vez
// ---------------------------------------------------------------------
function simulacoes(usuario, produto) {
  const c = exigirAcesso(usuario, produto);
  const sec = secao(produto.id, 'simulacoes', c.vis);
  if (!sec) throw erro('Este curso ainda não tem simulações.', 404);
  const melhores = {};
  for (const p of db.prepare("SELECT simulacao_id, MAX(pontos) pts, COUNT(*) n FROM simulacao_partidas WHERE user_id = ? AND product_id = ? AND final_id != '' GROUP BY simulacao_id").all(usuario.id, produto.id)) melhores[p.simulacao_id] = p;
  return { status: sec.status, itens: sec.dados.itens.map(x => ({ id: x.id, titulo: x.titulo, resumo: x.resumo, papel: x.papel, competencia: x.competencia,
    pontos_max: x.pontos_max, melhor: melhores[x.id] ? melhores[x.id].pts : null, jogadas: melhores[x.id] ? melhores[x.id].n : 0 })) };
}
function noPublico(n) { return { texto: n.texto, opcoes: n.final ? [] : n.opcoes.map(o => o.texto), final: n.final ? { desfecho: n.final.desfecho, licao: n.final.licao } : null }; }
function simulacao(usuario, produto, simId) {
  const c = exigirAcesso(usuario, produto);
  const sec = secao(produto.id, 'simulacoes', c.vis);
  const sim = sec && sec.dados.itens.find(x => x.id === s(simId, 60));
  if (!sim) throw erro('Simulação não encontrada.', 404);
  return sim;
}
function iniciarSimulacao(usuario, produto, simId) {
  const sim = simulacao(usuario, produto, simId);
  const id = novoId();
  db.prepare("INSERT INTO simulacao_partidas (id, user_id, product_id, simulacao_id, no_atual, caminho, pontos, final_id, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, '[]', 0, '', ?, ?)")
    .run(id, usuario.id, produto.id, sim.id, sim.inicio, nowISO(), nowISO());
  return { partida: id, titulo: sim.titulo, contexto: sim.contexto, papel: sim.papel, pontos_max: sim.pontos_max, no: noPublico(sim.nos[sim.inicio]) };
}
function escolher(usuario, produto, partidaId, opcao) {
  const p = db.prepare('SELECT * FROM simulacao_partidas WHERE id = ? AND user_id = ? AND product_id = ?').get(s(partidaId, 40), usuario.id, produto.id);
  if (!p) throw erro('Partida não encontrada.', 404);
  if (p.final_id) throw erro('Esta partida já terminou — comece outra.', 409);
  const sim = simulacao(usuario, produto, p.simulacao_id);
  const no = sim.nos[p.no_atual];
  const k = parseInt(opcao, 10);
  if (!no || !no.opcoes || !(k >= 0 && k < no.opcoes.length)) throw erro('Opção inválida.');
  const o = no.opcoes[k];
  const caminho = j.parse(p.caminho, []);
  caminho.push({ no: p.no_atual, opcao: k, pontos: o.pontos });
  const pontos = p.pontos + o.pontos;
  const prox = sim.nos[o.vai_para];
  const final = prox.final ? o.vai_para : '';
  db.prepare('UPDATE simulacao_partidas SET no_atual = ?, caminho = ?, pontos = ?, final_id = ?, atualizado_em = ? WHERE id = ?')
    .run(o.vai_para, j.str(caminho), pontos, final, nowISO(), p.id);
  return { escolha: o.texto, feedback: o.feedback, pontos_escolha: o.pontos, pontos, pontos_max: sim.pontos_max, no: noPublico(prox), terminou: !!final,
    // no fim, o caminho inteiro com a consequência de cada escolha (é o debriefing)
    caminho: final ? caminho.map(c => ({ texto: sim.nos[c.no].texto, escolha: sim.nos[c.no].opcoes[c.opcao].texto, feedback: sim.nos[c.no].opcoes[c.opcao].feedback, pontos: c.pontos })) : undefined };
}

// ---------------------------------------------------------------------
// RECURSOS: cheat sheets e templates
// ---------------------------------------------------------------------
function recursos(usuario, produto) {
  const c = exigirAcesso(usuario, produto);
  const sec = secao(produto.id, 'recursos', c.vis);
  if (!sec) throw erro('Este curso ainda não tem cheat sheets nem templates.', 404);
  return { status: sec.status, itens: sec.dados.itens };
}

// ---------------------------------------------------------------------
// PAINEL: XP, nível, selos e medalhas — tudo DERIVADO do que o aluno fez
// ---------------------------------------------------------------------
function painel(usuario, produto) {
  const c = contexto(usuario, produto);
  const secs = {};
  for (const n of SECOES) { const x = secao(produto.id, n, c.vis); if (x) secs[n] = x; }
  const uid = usuario.id, pid = produto.id;
  const q1 = (sql, ...a) => db.prepare(sql).get(...a);
  const ph = c.vis.map(() => '?').join(',');

  // aulas
  const prog = ct.Progresso.doProduto(uid, pid); // Express fica fora, como no certificado
  const totalAulas = prog.total_aulas, aulasFeitas = prog.concluidas;
  // quizzes visíveis e o melhor de cada um
  const quizzes = db.prepare(`SELECT lesson_id FROM aula_quiz WHERE product_id = ? AND status IN (${ph})`).all(pid, ...c.vis).map(x => x.lesson_id);
  const melhor = {};
  for (const t of db.prepare('SELECT lesson_id, MAX(acertos * 100.0 / total) pct FROM quiz_tentativas WHERE user_id = ? AND product_id = ? GROUP BY lesson_id').all(uid, pid)) melhor[t.lesson_id] = t.pct;
  const qAprov = quizzes.filter(l => (melhor[l] || 0) >= QUIZ_APROVA).length;
  const q100 = quizzes.filter(l => (melhor[l] || 0) >= 100).length;
  // cadernos com resultado escrito
  const cadernos = db.prepare(`SELECT lesson_id FROM aula_caderno WHERE product_id = ? AND status IN (${ph})`).all(pid, ...c.vis).map(x => x.lesson_id);
  const cadFeitos = cadernos.length ? q1(`SELECT COUNT(*) n FROM caderno_respostas WHERE user_id = ? AND product_id = ? AND campo = 'resultado' AND LENGTH(TRIM(texto)) >= 10
    AND lesson_id IN (${cadernos.map(() => '?').join(',')})`, uid, pid, ...cadernos).n : 0;
  // avaliação
  const ts = secs.avaliacao ? tentativas(uid, pid) : [];
  const diag = ts.find(t => t.momento === 'diagnostico');
  const finais = ts.filter(t => t.momento === 'final');
  const final = finais.length ? finais.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  // lab
  const missoes = secs.lab ? secs.lab.dados.missoes : [];
  const entregues = new Set(db.prepare("SELECT missao_id FROM lab_entregas WHERE user_id = ? AND product_id = ? AND entregue_em != ''").all(uid, pid).map(x => x.missao_id));
  const mFeitas = missoes.filter(m => m.tipo === 'missao' && entregues.has(m.id)).length;
  const projeto = missoes.find(m => m.tipo === 'projeto');
  const projFeito = !!(projeto && entregues.has(projeto.id));
  // desafio
  const diasTot = secs.desafio ? secs.desafio.dados.dias.length : 0;
  const diasFeitos = secs.desafio ? q1('SELECT COUNT(*) n FROM desafio_checkins WHERE user_id = ? AND product_id = ?', uid, pid).n : 0;
  // simulações
  const sims = secs.simulacoes ? secs.simulacoes.dados.itens : [];
  const simMelhor = {};
  for (const p of db.prepare("SELECT simulacao_id, MAX(pontos) pts FROM simulacao_partidas WHERE user_id = ? AND product_id = ? AND final_id != '' GROUP BY simulacao_id").all(uid, pid)) simMelhor[p.simulacao_id] = p.pts;
  const simFeitas = sims.filter(x => simMelhor[x.id] != null).length;
  const simOtimas = sims.filter(x => simMelhor[x.id] != null && x.pontos_max && simMelhor[x.id] >= 0.8 * x.pontos_max).length;

  const fontes = [
    ['Aulas concluídas', aulasFeitas * XP.aula, totalAulas * XP.aula],
    ['Quizzes aprovados', qAprov * XP.quiz + q100 * XP.quiz_100, quizzes.length * (XP.quiz + XP.quiz_100)],
    ['Cadernos com resultado', cadFeitos * XP.caderno, cadernos.length * XP.caderno],
  ];
  if (secs.avaliacao) fontes.push(['Diagnóstico e teste final', (diag ? XP.diagnostico : 0) + (final ? XP.final + Math.max(0, final.pct - (diag ? diag.pct : final.pct)) : 0), XP.diagnostico + XP.final]);
  if (missoes.length) fontes.push(['Villela Lab', mFeitas * XP.missao + (projFeito ? XP.projeto : 0), missoes.filter(m => m.tipo === 'missao').length * XP.missao + (projeto ? XP.projeto : 0)]);
  if (diasTot) fontes.push(['Desafio', diasFeitos * XP.dia + (diasFeitos >= diasTot ? XP.desafio_completo : 0), diasTot * XP.dia + XP.desafio_completo]);
  if (sims.length) fontes.push(['Simulações', simFeitas * XP.simulacao + simOtimas * XP.simulacao_otima, sims.length * (XP.simulacao + XP.simulacao_otima)]);
  const xp = fontes.reduce((a, f) => a + f[1], 0);
  const max = Math.max(1, fontes.reduce((a, f) => a + f[2], 0));
  const nivel = [...NIVEIS_XP].reverse().find(n => xp >= Math.round(n.min * max));
  const prox = NIVEIS_XP.find(n => n.n === nivel.n + 1) || null;

  // selos por competência: todos os quizzes (visíveis) das aulas da competência aprovados
  const comps = secs.competencias ? secs.competencias.dados.itens : [];
  const selos = comps.map(k => {
    const qs = k.aulas.filter(l => quizzes.includes(l));
    const feitos = qs.filter(l => (melhor[l] || 0) >= QUIZ_APROVA).length;
    return { id: k.id, nome: k.nome, descricao: k.descricao, icone: k.icone, total: qs.length, feitos, conquistado: qs.length > 0 && feitos === qs.length };
  });
  const medalhas = [
    { id: 'diagnostico', nome: 'Ponto de partida', desc: 'Fez o diagnóstico inicial', ok: !!diag, existe: !!secs.avaliacao },
    { id: 'evolucao', nome: 'Evolução comprovada', desc: 'Superou o diagnóstico no teste final', ok: !!(diag && final && final.pct > diag.pct), existe: !!secs.avaliacao },
    { id: 'mao-na-massa', nome: 'Mão na massa', desc: 'Entregou a primeira missão do Villela Lab', ok: mFeitas > 0, existe: missoes.some(m => m.tipo === 'missao') },
    { id: 'projeto', nome: 'Projeto final', desc: 'Entregou o projeto final', ok: projFeito, existe: !!projeto },
    { id: 'habito', nome: diasTot ? `${diasTot} dias` : 'Desafio', desc: 'Completou o desafio inteiro', ok: diasTot > 0 && diasFeitos >= diasTot, existe: diasTot > 0 },
    { id: 'estrategista', nome: 'Estrategista', desc: 'Terminou 3 simulações', ok: simFeitas >= 3, existe: sims.length >= 3 },
    { id: 'gabarito', nome: 'Gabarito', desc: 'Acertou 100% em 5 quizzes', ok: q100 >= 5, existe: quizzes.length >= 5 },
    { id: 'conclusao', nome: 'Curso concluído', desc: 'Concluiu todas as aulas', ok: totalAulas > 0 && aulasFeitas >= totalAulas, existe: totalAulas > 0 },
  ].filter(m => m.existe).map(({ existe, ...m }) => m);

  return {
    acesso: c.acesso, revisor: c.revisor,
    secoes: Object.fromEntries(Object.entries(secs).map(([k, v]) => [k, v.status])),
    xp, xp_max: max, nivel: { n: nivel.n, nome: nivel.nome }, proximo: prox ? { n: prox.n, nome: prox.nome, xp: Math.round(prox.min * max) } : null,
    niveis: NIVEIS_XP.map(n => ({ n: n.n, nome: n.nome, xp: Math.round(n.min * max) })),
    fontes: fontes.map(([nome, v, m]) => ({ nome, xp: v, max: m })),
    selos, medalhas,
    avaliacao: secs.avaliacao ? { diagnostico: diag ? { pct: diag.pct, nivel: diag.nivel } : null, final: final ? { pct: final.pct, nivel: final.nivel } : null } : null,
    lab: missoes.length ? { missoes: missoes.filter(m => m.tipo === 'missao').length, entregues: mFeitas, projeto: !!projeto, projeto_entregue: projFeito } : null,
    desafio: diasTot ? { total: diasTot, feitos: diasFeitos, titulo: secs.desafio.dados.titulo } : null,
    simulacoes: sims.length ? { total: sims.length, feitas: simFeitas } : null,
    recursos: secs.recursos ? { total: secs.recursos.dados.itens.length } : null,
  };
}

// selos conquistados — o certificado público mostra (derivado na hora, como tudo aqui)
// (como aluno comum: só o conteúdo PUBLICADO conta para o que vai a público)
function selosDoCertificado(userId, productId) {
  const produto = ct.Produtos.obter(productId);
  if (!produto) return [];
  try {
    return painel({ id: userId, papeis: [] }, produto).selos.filter(x => x.conquistado).map(x => ({ nome: x.nome, icone: x.icone }));
  } catch (_) { return []; }
}

module.exports = {
  SECOES, XP, NIVEIS_XP, nivelAvaliacao, hojeBR, importar, definirStatus, resumo, painel, estadoAvaliacao, contexto,
  avaliacaoParaAluno, corrigirAvaliacao, labParaAluno, salvarEntrega, entregar, dadosParaMentor, registrarFeedback,
  desafioParaAluno, iniciarDesafio, checkin, simulacoes, iniciarSimulacao, escolher, recursos, selosDoCertificado,
  validarSimulacoes,
};
