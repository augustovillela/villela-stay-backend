// =====================================================================
// Villela Academy — ESTUDO · dados e IMPORTAÇÃO do escopo.
//
// Como no interativo e na jornada, o conteúdo entra pela chave de
// publicação, validado, e nasce em RASCUNHO: só o dono do curso e o admin
// veem. Nada aqui gera conteúdo ao vivo nem publica sozinho.
//
// A importação é idempotente: o escopo pelo slug, o item pelo código, a
// competência/unidade/card pelo código e a questão pelo HASH do conteúdo —
// reenviar a mesma prova não infla o banco.
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, j } = require('../db');
const edital = require('./edital');
const banco = require('./banco');
const { ordenar } = require('./plano');
const { normalizarRegra } = require('./pontuacao');

const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const slug = (v) => s(v, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const erro = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };
const lista = (v, max = 40, tam = 300) => (Array.isArray(v) ? v : []).map(x => s(x, tam)).filter(Boolean).slice(0, max);

const TIPOS = ['assunto', 'edital'];
const EXTENSOES = ['micro', 'modulo', 'curso', 'preparacao'];
const STATUS = ['rascunho', 'publicado'];
const REVISAO = ['sugerido', 'revisado'];
// A aula ativa (prompt mestre, 6.1). Unidade sem explicação não ensina;
// sem prática ou aplicação, o aluno só lê — as duas faltas são recusadas.
const BLOCOS = ['desafio', 'explicacao', 'exemplo', 'recordacao', 'pratica', 'aplicacao', 'sintese'];
const BLOCOS_DE_ACAO = ['pratica', 'aplicacao'];
const MIDIAS = ['texto', 'audio', 'video', 'animacao', 'slides', 'imagem', 'diagrama', 'pdf'];
const ESTADOS_MIDIA = ['planejado', 'roteirizado', 'gerado', 'revisado', 'publicado'];

// ---------------------------------------------------------------------
// DESEMPENHO (auditoria de 11/10/2026) — o painel relia tudo várias vezes: as 251 aulas com `JSON.parse` de
// blocos, níveis, véspera e animações (4× por painel), as 1.632 questões, e uma consulta por questão para saber
// a competência dela. O SQLite é síncrono: isso segurava o processo que serve os outros produtos. Duas camadas:
//
// 1. MEMÓRIA DA REQUISIÇÃO (`comCache`): dentro de UMA chamada síncrona, a mesma leitura (aulas, competências,
//    vínculos, itens, cards, questões, mapa questão → competências) é feita uma vez. Acabou a chamada, acabou a
//    memória — nada fica velho entre uma requisição e outra. Quem ESCREVE conteúdo no meio (importar, publicar)
//    chama `limparCache()`; quem grava evidência chama `esquecer('evs:')`.
// 2. LINHA PESADA PELA DIGITAL (`porDigital`): o objeto já aberto de cada aula e de cada questão fica guardado
//    no processo, e só vale enquanto a "digital" da linha for a mesma — versão, situação/status, `atualizado_em`
//    e o tamanho em bytes de cada coluna grande (`octet_length`, que o SQLite lê do cabeçalho da linha, sem
//    carregar o texto). Toda escrita do sistema muda `atualizado_em`; uma escrita direta no banco muda o tamanho
//    ou o status. A digital é lida a CADA chamada: não há prazo de validade nem invalidação para esquecer.
//    Os objetos guardados são CONGELADOS — quem recebe não pode alterá-los.
//    ⚠️ O QUE A DIGITAL NÃO VÊ (segunda revisão, 11/10/2026): uma escrita DIRETA no banco que mantenha o tamanho da
//    coluna e o `atualizado_em` — por exemplo um script que troca qual alternativa é a `correta` com `UPDATE` cru.
//    O processo serviria a versão antiga até reiniciar. Por isso CORREÇÃO DE GABARITO É SEMPRE PELA IMPORTAÇÃO
//    (que sobe a versão e o `atualizado_em`); quem precisar mexer no banco à mão atualiza `atualizado_em` junto.
// ---------------------------------------------------------------------
let MEMO = null;
function comCache(fn) {
  if (MEMO) return fn();
  MEMO = new Map();
  try { return fn(); } finally { MEMO = null; }
}
const memo = (chave, fn) => {
  if (!MEMO) return fn();
  if (!MEMO.has(chave)) MEMO.set(chave, fn());
  return MEMO.get(chave);
};
const limparCache = () => { if (MEMO) MEMO.clear(); };
// quem ESCREVE conteúdo (importar, publicar) trabalha SEM a memória: lê o que acabou de gravar, e ao sair a
// memória de quem chamou volta vazia
function semCache(fn) {
  const antes = MEMO; MEMO = null;
  try { return fn(); } finally { MEMO = antes; limparCache(); }
}
const esquecer = (prefixo) => { if (MEMO) for (const k of [...MEMO.keys()]) if (k.startsWith(prefixo)) MEMO.delete(k); };
const MAX_GUARDADOS = 20000; // teto de objetos por tabela: passou, zera (o cache se refaz na leitura seguinte)
const GUARDADOS = { est_unidades: new Map(), est_questoes: new Map() };
// `leves` = [{ id, digital }] na ordem pedida; devolve os objetos abertos, lendo do banco só os que mudaram
function porDigital(tabela, leves, abrirLinha) {
  const g = GUARDADOS[tabela];
  if (g.size > MAX_GUARDADOS) g.clear();
  const faltam = leves.filter(l => { const c = g.get(l.id); return !c || c.digital !== l.digital; });
  for (let i = 0; i < faltam.length; i += 400) {
    const lote = faltam.slice(i, i + 400), dig = new Map(lote.map(l => [l.id, l.digital]));
    for (const r of db.prepare(`SELECT * FROM ${tabela} WHERE id IN (${lote.map(() => '?').join(',')})`).all(...lote.map(l => l.id))) g.set(r.id, { digital: dig.get(r.id), obj: Object.freeze(abrirLinha(r)) });
  }
  return leves.map(l => (g.get(l.id) || {}).obj).filter(Boolean);
}

// ---------------------------------------------------------------------
// leitura
// ---------------------------------------------------------------------
const abrir = (r) => r && { ...r, perfil: j.parse(r.perfil, {}), regra_pontuacao: j.parse(r.regra_pontuacao, {}) };
const Escopos = {
  obter: (id) => abrir(db.prepare('SELECT * FROM est_escopos WHERE id = ?').get(id)),
  porSlug: (productId, sl) => abrir(db.prepare('SELECT * FROM est_escopos WHERE product_id = ? AND slug = ?').get(productId, sl)),
  // os escopos DO CURSO: percurso particular de aluno (dono_user_id) nunca entra aqui — nem para o
  // produtor, nem para o resumo, nem para outro aluno. Quem o lista é `doDono`, e só para o dono.
  doProduto: (productId, vis) => db.prepare(`SELECT * FROM est_escopos WHERE product_id = ? AND dono_user_id = '' AND status IN (${vis.map(() => '?').join(',')}) ORDER BY criado_em`).all(productId, ...vis).map(abrir),
  doDono: (productId, userId) => (userId ? db.prepare('SELECT * FROM est_escopos WHERE product_id = ? AND dono_user_id = ? ORDER BY criado_em').all(productId, userId).map(abrir) : []),
  // o escopo do curso pelo slug, para as rotas do staff: percurso particular responde como escopo que não existe
  doCursoPorSlug(productId, sl) { const e = this.porSlug(productId, sl); return e && !e.dono_user_id ? e : null; },
  // o produto HOSPEDA o Estude? (qualquer escopo do curso, publicado ou não — percurso particular de aluno não conta).
  // Quem pergunta é o certificado: curso assim não se conclui pelas "aulas" da casca.
  temDoCurso: (productId) => !!db.prepare("SELECT 1 FROM est_escopos WHERE product_id = ? AND dono_user_id = '' LIMIT 1").get(productId),
};
function itens(escopo, versao = escopo.versao) {
  return memo(`itens:${escopo.id}:${versao}`, () => db.prepare('SELECT * FROM est_itens WHERE escopo_id = ? AND versao = ? ORDER BY ordem').all(escopo.id, versao)
    .map(i => ({ ...i, folha: !!i.folha, esforco_min: j.parse(i.esforco, null) })));
}
function competencias(escopoId) {
  return memo(`comps:${escopoId}`, () => db.prepare('SELECT * FROM est_competencias WHERE escopo_id = ? ORDER BY ordem').all(escopoId)
    .map(c => ({ ...c, essencial: !!c.essencial, criterios: j.parse(c.criterios, []), depende_de: j.parse(c.depende_de, []), erros_comuns: j.parse(c.erros_comuns, []) })));
}
const vinculos = (escopoId) => memo(`vins:${escopoId}`, () => db.prepare('SELECT * FROM est_vinculos WHERE escopo_id = ?').all(escopoId));
const abrirUnidade = (u) => ({ ...u, competencias: j.parse(u.competencias, []), itens: j.parse(u.itens, []), blocos: j.parse(u.blocos, []), fontes: j.parse(u.fontes, []), midias: j.parse(u.midias, []),
  niveis: j.parse(u.niveis, {}), vespera: j.parse(u.vespera, {}), destaques: j.parse(u.destaques, []), animacoes: j.parse(u.animacoes, {}) });
// a digital da aula: tudo o que muda quando a linha muda, sem ler os textos grandes
const DIGITAL_UNIDADE = `ordem || '|' || status || '|' || versao || '|' || atualizado_em || '|' || tempo_min || '|' || video_media_id || '|' || video_duracao_seg || '|' || codigo || '|' || titulo || '|' || competencias || '|' || itens
  || '|' || octet_length(blocos) || '|' || octet_length(fontes) || '|' || octet_length(midias) || '|' || octet_length(niveis) || '|' || octet_length(vespera) || '|' || octet_length(destaques) || '|' || octet_length(animacoes)`;
function unidades(escopoId, vis) {
  return memo(`uns:${escopoId}:${vis.join(',')}`, () => porDigital('est_unidades',
    db.prepare(`SELECT id, ${DIGITAL_UNIDADE} AS digital FROM est_unidades WHERE escopo_id = ? AND status IN (${vis.map(() => '?').join(',')}) ORDER BY ordem`).all(escopoId, ...vis), abrirUnidade));
}
// UMA aula pelo código: a tela da aula, a nota, a tentativa e o vídeo não precisam das outras 250
function unidadePorCodigo(escopoId, vis, codigo) {
  const l = db.prepare(`SELECT id, ${DIGITAL_UNIDADE} AS digital FROM est_unidades WHERE escopo_id = ? AND codigo = ? AND status IN (${vis.map(() => '?').join(',')})`).get(escopoId, codigo, ...vis);
  return l ? porDigital('est_unidades', [l], abrirUnidade)[0] : null;
}

// Competências que o aluno PODE demonstrar hoje: têm ao menos uma questão corrigível, fora da
// reserva, ligada direto a elas ou a um item que elas cobrem. Competência sem isso (unidade de
// leitura, disciplina ainda sem banco) não pode travar a "próxima tarefa": nunca sairia de "não avaliada".
function competenciasComPratica(escopoId, situacoes = ['disponivel']) {
  const m = situacoes.map(() => '?').join(',');
  return memo(`pratica:${escopoId}:${situacoes.join(',')}`, () => new Set(db.prepare(`
    SELECT v.codigo AS codigo FROM est_questao_vinculos v JOIN est_questoes q ON q.id = v.questao_id
      WHERE v.escopo_id = ? AND v.alvo = 'competencia' AND q.corrigivel = 1 AND q.uso != 'reservada' AND q.situacao IN (${m})
    UNION
    SELECT k.competencia_codigo FROM est_questao_vinculos v JOIN est_questoes q ON q.id = v.questao_id
      JOIN est_vinculos k ON k.escopo_id = v.escopo_id AND k.item_codigo = v.codigo
      WHERE v.escopo_id = ? AND v.alvo = 'item' AND q.corrigivel = 1 AND q.uso != 'reservada' AND q.situacao IN (${m})`)
    .all(escopoId, ...situacoes, escopoId, ...situacoes).map(r => r.codigo)));
}

// ADR-0005 — níveis derivados do nível 100 (a explicação dos blocos) e véspera por foco.
// O tamanho de cada nível é conferido contra a explicação: 50 % com 80 % do texto não é resumo.
const NIVEIS = ['50', '25', '10'];
const FOCOS = ['objetiva', 'escrita', 'oral'];
const TOLERANCIA_PP = 10;
function validarNiveis(u, onde, blocos) {
  const exp = blocos.filter(b => b.tipo === 'explicacao').map(b => b.texto).join('\n');
  const niveis = {};
  const cru = u.niveis && typeof u.niveis === 'object' ? u.niveis : {};
  for (const k of Object.keys(cru)) {
    if (!NIVEIS.includes(String(k))) throw erro(`${onde}: nível "${k}" não existe — use ${NIVEIS.join(', ')} (o 100 são os blocos).`);
    const texto = s(cru[k] && (cru[k].texto != null ? cru[k].texto : cru[k]), 20000);
    if (texto.length < 20) throw erro(`${onde}, nível ${k}: texto muito curto.`);
    const pct = Math.round(100 * texto.length / Math.max(1, exp.length));
    if (Math.abs(pct - Number(k)) > TOLERANCIA_PP) throw erro(`${onde}, nível ${k}: o texto tem ${pct} % da explicação — tolerância de ±${TOLERANCIA_PP} pontos.`);
    niveis[k] = { texto, tamanho_pct: pct };
  }
  const vespera = {};
  const cv = u.vespera && typeof u.vespera === 'object' ? u.vespera : {};
  for (const f of Object.keys(cv)) {
    if (!FOCOS.includes(f)) throw erro(`${onde}: foco de véspera "${f}" não existe — use ${FOCOS.join(', ')}.`);
    const p = cv[f] || {};
    const fichas = (Array.isArray(p.fichas) ? p.fichas : []).map((x, k) => {
      const frente = s(x && x.frente, 300), verso = s(x && x.verso, 600);
      if (!frente || !verso) throw erro(`${onde}, véspera ${f}, ficha ${k + 1}: frente e verso.`);
      return { frente, verso };
    });
    const slides = (Array.isArray(p.slides) ? p.slides : []).map((x, k) => {
      const titulo = s(x && x.titulo, 120), topicos = lista(x && x.topicos, 6, 200);
      if (!titulo || !topicos.length) throw erro(`${onde}, véspera ${f}, slide ${k + 1}: título e tópicos.`);
      return { titulo, topicos };
    });
    const mapa = s(p.mapa, 6000);
    if (!fichas.length && !slides.length && !mapa) throw erro(`${onde}, véspera ${f}: vazia — fichas, slides ou mapa.`);
    vespera[f] = { fichas, slides, mapa };
  }
  return { niveis, vespera };
}
const abrirQuestao = (r) => r && { ...j.parse(r.dados, {}), id: r.id, versao: r.versao, situacao: r.situacao, uso: r.uso, corrigivel: !!r.corrigivel, producer_id: r.producer_id };
const DIGITAL_QUESTAO = `q.versao || '|' || q.situacao || '|' || q.uso || '|' || q.corrigivel || '|' || q.atualizado_em || '|' || q.producer_id || '|' || octet_length(q.dados)`;
const Questoes = {
  obter(id) {
    const l = db.prepare(`SELECT q.id, ${DIGITAL_QUESTAO} AS digital FROM est_questoes q WHERE q.id = ?`).get(id);
    return l ? porDigital('est_questoes', [l], abrirQuestao)[0] : undefined;
  },
  // questões ligadas ao escopo; `competencia` restringe (direto ou pelo item que a competência cobre)
  doEscopo(escopoId, { situacoes = ['disponivel'], competencia = '' } = {}) {
    const linhas = memo(`qs:${escopoId}:${situacoes.join(',')}`, () => porDigital('est_questoes', db.prepare(`SELECT DISTINCT q.id, q.criado_em, ${DIGITAL_QUESTAO} AS digital FROM est_questoes q JOIN est_questao_vinculos v ON v.questao_id = q.id
        WHERE v.escopo_id = ? AND q.situacao IN (${situacoes.map(() => '?').join(',')}) ORDER BY q.criado_em, q.id`).all(escopoId, ...situacoes), abrirQuestao));
    if (!competencia) return linhas;
    const mapa = competenciasDasQuestoes(escopoId);
    return linhas.filter(q => (mapa.get(q.id) || []).includes(competencia));
  },
};
// A competência que cada questão do escopo avalia: a declarada + a dos itens a que ela se liga. DUAS consultas
// para o escopo inteiro (antes era uma consulta por questão, e outra por item de cada questão).
function competenciasDasQuestoes(escopoId) {
  return memo(`qcomps:${escopoId}`, () => {
    const doItem = new Map();
    for (const k of vinculos(escopoId)) { if (!doItem.has(k.item_codigo)) doItem.set(k.item_codigo, []); doItem.get(k.item_codigo).push(k.competencia_codigo); }
    const m = new Map();
    for (const v of db.prepare('SELECT questao_id q, alvo, codigo FROM est_questao_vinculos WHERE escopo_id = ? ORDER BY alvo, codigo').all(escopoId)) {
      if (!m.has(v.q)) m.set(v.q, new Set());
      if (v.alvo === 'competencia') m.get(v.q).add(v.codigo); else for (const c of doItem.get(v.codigo) || []) m.get(v.q).add(c);
    }
    return new Map([...m].map(([q, set]) => [q, [...set]]));
  });
}
// (a ordem — declaradas primeiro, depois as dos itens — é a de sempre: `alvo` 'competencia' vem antes de 'item')
function competenciasDaQuestao(questaoId, escopoId) {
  if (MEMO) return competenciasDasQuestoes(escopoId).get(questaoId) || [];
  const v = db.prepare('SELECT alvo, codigo FROM est_questao_vinculos WHERE questao_id = ? AND escopo_id = ?').all(questaoId, escopoId);
  const diretas = v.filter(x => x.alvo === 'competencia').map(x => x.codigo);
  const pelosItens = v.filter(x => x.alvo === 'item').flatMap(x =>
    db.prepare('SELECT competencia_codigo c FROM est_vinculos WHERE escopo_id = ? AND item_codigo = ?').all(escopoId, x.codigo).map(r => r.c));
  return [...new Set([...diretas, ...pelosItens])];
}
function cards(escopoId, vis) {
  return memo(`cards:${escopoId}:${vis.join(',')}`, () => db.prepare(`SELECT * FROM est_cards WHERE escopo_id = ? AND status IN (${vis.map(() => '?').join(',')}) ORDER BY ordem`).all(escopoId, ...vis));
}

// ---------------------------------------------------------------------
// validação do que entra
// ---------------------------------------------------------------------
const MAX_DESTAQUES = 40, PCT_DESTAQUES = 18;
// AULA ANIMADA: três roteiros opcionais por aula. A animação PERGUNTA — por isso o fluxo tem paradas,
// o caso esconde a solução em passos e o erro da banca vem com o porquê de parecer certo.
function validarAnimacoes(a, onde) {
  if (!a || typeof a !== 'object') return {};
  const r = {}, arr = (v) => (Array.isArray(v) ? v : []);
  if (a.fluxo && typeof a.fluxo === 'object') {
    const etapas = arr(a.fluxo.etapas).map(e => ({ ato: s(e && e.ato, 70), quem: s(e && e.quem, 40), prazo: s(e && e.prazo, 40), fonte: s(e && e.fonte, 80), nota: s(e && e.nota, 160) })).filter(e => e.ato);
    if (etapas.length < 3 || etapas.length > 12) throw erro(`${onde}: o fluxo animado tem de 3 a 12 etapas.`);
    const paradas = arr(a.fluxo.paradas).map(p => ({ depois_da_etapa: Math.round(Number(p && p.depois_da_etapa) || 0), pergunta: s(p && p.pergunta, 160), resposta: s(p && p.resposta, 240) }));
    paradas.forEach(p => { if (p.depois_da_etapa < 1 || p.depois_da_etapa > etapas.length || !p.pergunta || !p.resposta) throw erro(`${onde}: parada do fluxo aponta para etapa que não existe ou está sem pergunta/resposta.`); });
    r.fluxo = { titulo: s(a.fluxo.titulo, 80), etapas, paradas };
  }
  if (a.caso && typeof a.caso === 'object') {
    const passos = arr(a.caso.passos).map(p => ({ rotulo: s(p && p.rotulo, 20), texto: s(p && p.texto, 300) })).filter(p => p.texto);
    const narrativa = s(a.caso.narrativa, 520), pergunta = s(a.caso.pergunta, 160);
    if (!narrativa || !pergunta || passos.length < 2 || passos.length > 6) throw erro(`${onde}: o caso animado pede narrativa, pergunta e de 2 a 6 passos.`);
    r.caso = { narrativa, pergunta, passos };
  }
  const erros = arr(a.erros).map(e => ({ afirmacao: s(e && e.afirmacao, 220), por_que_parece_certa: s(e && e.por_que_parece_certa, 200), onde_esta_o_erro: s(e && e.onde_esta_o_erro, 260), fonte: s(e && e.fonte, 100) }));
  if (erros.some(e => !e.afirmacao || !e.onde_esta_o_erro)) throw erro(`${onde}: erro da banca pede a afirmação e onde está o erro.`);
  if (erros.length > 6) throw erro(`${onde}: no máximo 6 erros da banca por aula.`);
  if (erros.length) r.erros = erros;
  return r;
}
function validarUnidade(u, i, codComp, codItem) {
  const onde = `unidade ${i + 1}`;
  const codigo = slug(u.codigo || u.titulo), titulo = s(u.titulo, 160);
  if (!codigo || !titulo) throw erro(`${onde}: código e título são obrigatórios.`);
  const comps = lista(u.competencias, 12, 60);
  if (!comps.length) throw erro(`${onde}: ligue a ao menos uma competência — unidade sem objetivo não se avalia.`);
  comps.forEach(c => { if (!codComp.has(c)) throw erro(`${onde}: competência "${c}" não existe.`); });
  const its = lista(u.itens, 60, 40);
  its.forEach(c => { if (!codItem.has(c)) throw erro(`${onde}: item "${c}" não existe no programa vigente.`); });
  const blocos = (Array.isArray(u.blocos) ? u.blocos : []).map((b, k) => {
    const tipo = s(b && b.tipo, 20);
    if (!BLOCOS.includes(tipo)) throw erro(`${onde}, bloco ${k + 1}: tipo deve ser ${BLOCOS.join('|')}.`);
    const texto = s(b.texto, 20000);
    if (texto.length < 20) throw erro(`${onde}, bloco ${k + 1} (${tipo}): texto muito curto.`);
    return { tipo, titulo: s(b.titulo, 160), texto, pistas: lista(b.pistas, 5, 600), solucao: s(b.solucao, 8000), criterio: s(b.criterio, 600) };
  });
  if (!blocos.some(b => b.tipo === 'explicacao')) throw erro(`${onde}: falta o bloco de explicação.`);
  if (!blocos.some(b => BLOCOS_DE_ACAO.includes(b.tipo))) throw erro(`${onde}: falta prática ou aplicação — aula ativa exige ação do aluno.`);
  const midias = (Array.isArray(u.midias) ? u.midias : []).map((m, k) => {
    const tipo = s(m && m.tipo, 20), estado = s(m && m.estado, 20);
    if (!MIDIAS.includes(tipo) || !ESTADOS_MIDIA.includes(estado)) throw erro(`${onde}, mídia ${k + 1}: tipo (${MIDIAS.join('|')}) e estado (${ESTADOS_MIDIA.join('|')}) são obrigatórios.`);
    // roteiro não é arquivo: só "gerado" em diante pode apontar para mídia de verdade
    const url = s(m.url, 400);
    if (url && ['planejado', 'roteirizado'].includes(estado)) throw erro(`${onde}, mídia ${k + 1}: ${estado} não tem arquivo — tire a url ou corrija o estado.`);
    return { tipo, estado, url, nota: s(m.nota, 300) };
  });
  const fontes = (Array.isArray(u.fontes) ? u.fontes : []).map(f => ({ titulo: s(f && f.titulo, 300), url: s(f && f.url, 400), consultado_em: s(f && f.consultado_em, 10), sustenta: s(f && f.sustenta, 400) })).filter(f => f.titulo);
  const { niveis, vespera } = validarNiveis(u, onde, blocos);
  // DESTAQUES: cada um tem de ESTAR no texto de exposição, literalmente — destaque que não bate com o
  // texto é de outra versão da aula. E há teto: negrito em tudo é negrito em nada.
  const expo = blocos.filter(b => ['explicacao', 'exemplo', 'sintese'].includes(b.tipo)).map(b => b.texto);
  const destaques = [...new Set((Array.isArray(u.destaques) ? u.destaques : []).map(d => s(d, 220)).filter(d => d.length >= 4))];
  if (destaques.length > MAX_DESTAQUES) throw erro(`${onde}: no máximo ${MAX_DESTAQUES} destaques por aula.`);
  destaques.forEach(d => { if (!expo.some(t => t.includes(d))) throw erro(`${onde}: o destaque "${d.slice(0, 60)}" não está no texto da aula (tem de ser trecho literal).`); });
  const somaD = destaques.reduce((n, d) => n + d.length, 0), somaE = expo.reduce((n, t) => n + t.length, 0);
  if (somaD > somaE * PCT_DESTAQUES / 100) throw erro(`${onde}: os destaques somam ${Math.round(somaD * 100 / somaE)} % do texto — o teto é ${PCT_DESTAQUES} %.`);
  return { codigo, titulo, competencias: comps, itens: its, blocos, midias, fontes, niveis, vespera, destaques, animacoes: validarAnimacoes(u.animacoes, onde), tempo_min: Math.max(0, Math.round(Number(u.tempo_min) || 0)) };
}

// ---------------------------------------------------------------------
// IMPORTAÇÃO
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// PERCURSO PARTICULAR (ADR-0010, §6) — escopo de UM aluno, hospedado no curso em que ele tem acesso.
// Só o dono o vê; não tem aulas: as questões que ele importa (prova em PDF) ficam no nome dele, o programa
// vem do edital que ele mandou ler (fase 4), e as competências nascem das disciplinas, para Praticar e Prova funcionarem.
// ---------------------------------------------------------------------
const PARTICULARES_MAX = 10; // por aluno, por curso: dá para organizar por concurso e não vira depósito
function criarParticular(produto, usuario, titulo, resumo = '') {
  const t = s(titulo, 120);
  if (t.length < 3) throw erro('Dê um nome ao seu percurso (ao menos 3 letras).');
  if (Escopos.doDono(produto.id, usuario.id).length >= PARTICULARES_MAX) throw erro(`Você já tem ${PARTICULARES_MAX} percursos particulares neste curso — use um dos que existem.`, 409);
  const id = novoId(), agora = nowISO();
  // o slug leva um pedaço do id: não colide com escopo do curso nem com percurso de outro aluno
  const sl = `meu-${slug(t).slice(0, 36).replace(/-$/, '') || 'percurso'}-${id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toLowerCase()}`;
  db.prepare(`INSERT INTO est_escopos (id, product_id, slug, tipo, titulo, extensao, resumo, dono_user_id, criado_em, atualizado_em) VALUES (?, ?, ?, 'assunto', ?, 'modulo', ?, ?, ?, ?)`)
    .run(id, produto.id, sl, t, s(resumo, 2000) || 'Percurso particular: questões de prova importadas por você.', usuario.id, agora, agora);
  return Escopos.obter(id);
}

// `opcoes` só existe para o caminho interno (aplicar uma prova importada por pedido — pedidos.js):
//   dono      o usuário dono do percurso PARTICULAR de destino (sem ele, percurso particular é intocável)
//   autor     de quem são as questões (est_questoes.producer_id); padrão: o produtor do curso
//   situacao  com que situação a questão NOVA nasce; padrão: rascunho, como toda importação
//   tipo      o tipo que o escopo passa a ter (o percurso particular vira "edital" quando ganha o programa de um)
//   preservar questão que já existe (mesmo autor, mesmo hash) NÃO é reescrita — fica byte a byte como está; só
//             ganha vínculo se o destino for percurso particular. `rel.questoes.ids_novas` traz as que nasceram.
function importar(produto, dados = {}, opcoes = {}) { return semCache(() => importar_(produto, dados, opcoes)); }
function importar_(produto, dados = {}, opcoes = {}) {
  const e = dados.escopo || {};
  const sl = slug(e.slug || e.titulo);
  if (!sl) throw erro('Informe "escopo.slug" (ou o título).');
  const dono = s(opcoes.dono, 40), autor = s(opcoes.autor, 40) || produto.producer_id;
  const situacaoNova = banco.SITUACOES.includes(opcoes.situacao) ? opcoes.situacao : 'rascunho';
  const rel = { escopo: sl, criado: false };
  limparCache(); // quem importa lê o que acabou de gravar: nada da memória desta requisição vale daqui em diante
  try { transacao(() => {
    let escopo = Escopos.porSlug(produto.id, sl);
    // percurso particular só é tocado pelo dono, e só por este caminho interno
    if (escopo && (escopo.dono_user_id || '') !== dono) throw erro(dono ? 'Percurso não encontrado.' : 'Este endereço pertence a um percurso particular de aluno — escolha outro slug.', dono ? 404 : 409);
    if (!escopo && dono) throw erro('Percurso não encontrado.', 404);
    const agora = nowISO();
    if (!escopo) {
      const tipo = s(e.tipo, 12), titulo = s(e.titulo, 200);
      if (!TIPOS.includes(tipo)) throw erro(`escopo.tipo deve ser ${TIPOS.join('|')}.`);
      if (!titulo) throw erro('escopo.titulo é obrigatório.');
      db.prepare(`INSERT INTO est_escopos (id, product_id, slug, tipo, titulo, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(novoId(), produto.id, sl, tipo, titulo, agora, agora);
      escopo = Escopos.porSlug(produto.id, sl);
      rel.criado = true;
    }
    // só mexe no campo que veio — reimportar as questões não apaga a regra de pontuação
    const set = (col, val) => db.prepare(`UPDATE est_escopos SET ${col} = ?, atualizado_em = ? WHERE id = ?`).run(val, agora, escopo.id);
    if (e.titulo != null && !rel.criado) set('titulo', s(e.titulo, 200));
    if (TIPOS.includes(opcoes.tipo) && escopo.tipo !== opcoes.tipo) set('tipo', opcoes.tipo);
    if (e.nivel != null) set('nivel', s(e.nivel, 60));
    if (e.extensao != null) { if (!EXTENSOES.includes(e.extensao)) throw erro(`escopo.extensao deve ser ${EXTENSOES.join('|')}.`); set('extensao', e.extensao); }
    if (e.resumo != null) set('resumo', s(e.resumo, 2000));
    if (e.perfil != null) set('perfil', j.str(e.perfil));
    if (e.data_alvo != null) { if (e.data_alvo && !/^\d{4}-\d{2}-\d{2}$/.test(e.data_alvo)) throw erro('escopo.data_alvo deve ser AAAA-MM-DD.'); set('data_alvo', s(e.data_alvo, 10)); }
    if (e.regra_pontuacao != null) {
      const regra = normalizarRegra(e.regra_pontuacao);
      // desconto por erro sem dizer de onde veio a regra é palpite — e palpite muda nota
      if ((regra.desconto || regra.aprovacao || regra.minimos.length) && !regra.fonte) throw erro('escopo.regra_pontuacao: informe a "fonte" (edital/regulamento e artigo) da regra.');
      set('regra_pontuacao', j.str(e.regra_pontuacao));
    }

    // PROGRAMA: versão nova só quando o conteúdo muda (retificação)
    if (dados.programa) {
      const p = dados.programa;
      let crus = p.itens, sobras = [];
      if (!Array.isArray(crus)) ({ itens: crus, sobras } = edital.extrairDoTexto(p.texto));
      const novos = edital.normalizarItens(crus);
      const diff = edital.comparar(escopo.versao ? itens(escopo) : [], novos);
      if (!escopo.versao || diff.mudou) {
        const v = escopo.versao + 1;
        const ins = db.prepare(`INSERT INTO est_itens (escopo_id, versao, codigo, pai, ordem, texto, hash, localizacao, pendente, peso, esforco, folha)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        novos.forEach(i => ins.run(escopo.id, v, i.codigo, i.pai, i.ordem, i.texto, i.hash, i.localizacao, i.pendente, i.peso, i.esforco_min ? j.str(i.esforco_min) : '', i.folha ? 1 : 0));
        const doc = p.documento || {};
        db.prepare('INSERT INTO est_versoes (escopo_id, versao, documento, diff, criado_em) VALUES (?, ?, ?, ?, ?)')
          .run(escopo.id, v, j.str({ nome: s(doc.nome, 200), url: s(doc.url, 400), data: s(doc.data, 10), tipo: s(doc.tipo, 20) }), j.str(diff), agora);
        set('versao', v);
        escopo = Escopos.obter(escopo.id);
        rel.programa = { versao: v, itens: novos.length, pendentes_de_leitura: novos.filter(i => i.pendente).length, sobras,
          adicionados: diff.adicionados.length, removidos: diff.removidos.length, alterados: diff.alterados.length };
      } else {
        // o TEXTO não mudou: não é retificação. Peso, estimativa, origem e pendência
        // de leitura são anotações nossas sobre o item e se atualizam na versão vigente.
        const up = db.prepare('UPDATE est_itens SET localizacao = ?, pendente = ?, peso = ?, esforco = ? WHERE escopo_id = ? AND versao = ? AND codigo = ?');
        novos.forEach(i => up.run(i.localizacao, i.pendente, i.peso, i.esforco_min ? j.str(i.esforco_min) : '', escopo.id, escopo.versao, i.codigo));
        rel.programa = { versao: escopo.versao, sem_mudanca: true, sobras };
      }
    }
    const codItem = new Set(escopo.versao ? itens(escopo).map(i => i.codigo) : []);

    // ORDEM em importação por partes (uma disciplina por envio): o índice dentro do
    // pedido colidiria com o das outras disciplinas e a "próxima tarefa" saltaria de
    // uma para outra. Regra: "ordem" explícita vale; sem ela, quem já existe fica onde
    // está e quem é novo entra depois do último do escopo, na sequência do pedido.
    const ordenador = (tabela) => {
      const m = db.prepare(`SELECT MAX(ordem) m FROM ${tabela} WHERE escopo_id = ?`).get(escopo.id).m;
      let prox = m == null ? 0 : m + 1;
      return (cru, atual) => {
        if (cru != null && cru !== '' && Number.isFinite(Number(cru))) return Math.round(Number(cru));
        return atual ? atual.ordem : prox++;
      };
    };

    if (dados.competencias) {
      const lst = Array.isArray(dados.competencias) ? dados.competencias : [];
      const ordemComp = ordenador('est_competencias');
      const prontas = lst.map((c, i) => {
        const codigo = slug(c.codigo || c.nome), resultado = s(c.resultado, 1000);
        if (!codigo) throw erro(`competência ${i + 1}: sem código.`);
        if (resultado.length < 20) throw erro(`competência ${codigo}: descreva o resultado observável ("Diante de…, o aluno…").`);
        return { codigo, ordem: c.ordem, resultado, criterios: lista(c.criterios, 12, 400), depende_de: lista(c.depende_de, 12, 60).map(slug), erros_comuns: lista(c.erros_comuns, 12, 400), essencial: c.essencial === false ? 0 : 1 };
      });
      const todos = new Set([...competencias(escopo.id).map(c => c.codigo), ...prontas.map(c => c.codigo)]);
      prontas.forEach(c => c.depende_de.forEach(d => { if (!todos.has(d)) throw erro(`competência ${c.codigo}: depende de "${d}", que não existe.`); }));
      ordenar(prontas); // recusa dependência circular
      rel.competencias = { novas: 0, atualizadas: 0 };
      for (const c of prontas) {
        const atual = db.prepare('SELECT * FROM est_competencias WHERE escopo_id = ? AND codigo = ?').get(escopo.id, c.codigo);
        c.ordem = ordemComp(c.ordem, atual);
        if (!atual) {
          db.prepare(`INSERT INTO est_competencias (escopo_id, codigo, ordem, resultado, criterios, depende_de, erros_comuns, essencial) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(escopo.id, c.codigo, c.ordem, c.resultado, j.str(c.criterios), j.str(c.depende_de), j.str(c.erros_comuns), c.essencial);
          rel.competencias.novas++;
        } else {
          // mudou o que se exige → versão nova: a evidência antiga fica presa à versão em que foi obtida
          const mudou = atual.resultado !== c.resultado || atual.criterios !== j.str(c.criterios);
          db.prepare(`UPDATE est_competencias SET ordem = ?, resultado = ?, criterios = ?, depende_de = ?, erros_comuns = ?, essencial = ?, versao = versao + ? WHERE escopo_id = ? AND codigo = ?`)
            .run(c.ordem, c.resultado, j.str(c.criterios), j.str(c.depende_de), j.str(c.erros_comuns), c.essencial, mudou ? 1 : 0, escopo.id, c.codigo);
          rel.competencias.atualizadas++;
        }
      }
    }
    const codComp = new Set(competencias(escopo.id).map(c => c.codigo));

    if (dados.vinculos) {
      rel.vinculos = 0;
      for (const [i, v] of (Array.isArray(dados.vinculos) ? dados.vinculos : []).entries()) {
        const item = s(v.item, 40), comp = slug(v.competencia), just = s(v.justificativa, 600);
        if (!codItem.has(item)) throw erro(`vínculo ${i + 1}: item "${item}" não existe no programa vigente.`);
        if (!codComp.has(comp)) throw erro(`vínculo ${i + 1}: competência "${comp}" não existe.`);
        if (!just) throw erro(`vínculo ${i + 1}: justifique por que a competência cobre o item — nome parecido não é cobertura.`);
        db.prepare(`INSERT INTO est_vinculos (escopo_id, item_codigo, competencia_codigo, justificativa, estado_revisao) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (escopo_id, item_codigo, competencia_codigo) DO UPDATE SET justificativa = excluded.justificativa, estado_revisao = excluded.estado_revisao`)
          .run(escopo.id, item, comp, just, REVISAO.includes(v.estado_revisao) ? v.estado_revisao : 'sugerido');
        rel.vinculos++;
      }
    }

    if (dados.unidades) {
      rel.unidades = { novas: 0, atualizadas: 0 };
      const ordemUn = ordenador('est_unidades');
      for (const [i, cru] of (Array.isArray(dados.unidades) ? dados.unidades : []).entries()) {
        const u = validarUnidade(cru, i, codComp, codItem);
        const atual = db.prepare('SELECT id, ordem, blocos, versao, niveis, vespera, destaques, animacoes FROM est_unidades WHERE escopo_id = ? AND codigo = ?').get(escopo.id, u.codigo);
        const ord = ordemUn(cru.ordem, atual);
        const campos = [u.titulo, j.str(u.competencias), j.str(u.itens), j.str(u.blocos), j.str(u.fontes), j.str(u.midias), u.tempo_min];
        // Derivados (ADR-0005) gravam a versão do nível 100 de que saíram. Quem manda só
        // blocos novos NÃO perde os derivados antigos — eles ficam, marcados desatualizados.
        const derivar = (obj, versao) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { ...v, derivado_de_versao: versao }]));
        const temNiveis = u.niveis && Object.keys(u.niveis).length, temVespera = u.vespera && Object.keys(u.vespera).length;
        if (!atual) {
          db.prepare(`INSERT INTO est_unidades (id, escopo_id, codigo, ordem, titulo, competencias, itens, blocos, fontes, midias, tempo_min, atualizado_em, niveis, vespera, destaques, animacoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(novoId(), escopo.id, u.codigo, ord, ...campos, agora, j.str(derivar(u.niveis, 1)), j.str(derivar(u.vespera, 1)), j.str(u.destaques), j.str(u.animacoes));
          rel.unidades.novas++;
        } else {
          const mudou = atual.blocos !== j.str(u.blocos) ? 1 : 0;
          const versao = (atual.versao || 1) + mudou;
          const niveis = temNiveis ? derivar(u.niveis, versao) : j.parse(atual.niveis, {});
          const vespera = temVespera ? derivar(u.vespera, versao) : j.parse(atual.vespera, {});
          db.prepare(`UPDATE est_unidades SET ordem = ?, titulo = ?, competencias = ?, itens = ?, blocos = ?, fontes = ?, midias = ?, tempo_min = ?, versao = versao + ?, atualizado_em = ?, niveis = ?, vespera = ?, destaques = ?, animacoes = ? WHERE id = ?`)
            // quem não manda destaques NÃO apaga os que existem (igual aos níveis)
            .run(ord, ...campos, mudou, agora, j.str(niveis), j.str(vespera), Array.isArray(cru.destaques) ? j.str(u.destaques) : (atual.destaques || '[]'),
              // idem para a aula animada: só troca quem manda
              cru.animacoes && typeof cru.animacoes === 'object' ? j.str(u.animacoes) : (atual.animacoes || '{}'), atual.id);
          rel.unidades.atualizadas++;
        }
      }
    }

    if (dados.questoes) {
      rel.questoes = { novas: 0, duplicadas: 0, atualizadas: 0, sem_vinculo: 0, fora_da_correcao: 0 };
      for (const [i, cru] of (Array.isArray(dados.questoes) ? dados.questoes : []).entries()) {
        const q = banco.validarQuestao(cru, i);
        const comps = lista(cru.competencias, 12, 60).map(slug);
        comps.forEach(c => { if (!codComp.has(c)) throw erro(`questão ${i + 1}: competência "${c}" não existe.`); });
        const its = (Array.isArray(cru.itens) ? cru.itens : []).map(x => ({ codigo: s(x && x.codigo, 40), justificativa: s(x && x.justificativa, 600), estado: REVISAO.includes(x && x.estado_revisao) ? x.estado_revisao : 'sugerido' }));
        its.forEach(x => {
          if (!codItem.has(x.codigo)) throw erro(`questão ${i + 1}: item "${x.codigo}" não existe no programa vigente.`);
          if (!x.justificativa) throw erro(`questão ${i + 1}: justifique o vínculo com o item ${x.codigo}.`);
        });
        const { hash, uso, corrigivel, tipo, origem, ...resto } = q;
        let atual = db.prepare('SELECT id, dados FROM est_questoes WHERE producer_id = ? AND hash = ?').get(autor, hash);
        if (atual) {
          // A mesma questão vinda de outro caderno traz as alternativas em outra
          // ordem. A letra de cada alternativa é a da PRIMEIRA importação e não
          // muda mais: resposta já dada e prova já congelada apontam para ela.
          const letra = new Map(j.parse(atual.dados, {}).alternativas.map(a => [edital.normal(a.texto), a.id]));
          resto.alternativas = resto.alternativas.map(a => ({ ...a, id: letra.get(edital.normal(a.texto)) || a.id })).sort((a, b) => a.id.localeCompare(b.id));
        }
        const dadosQ = j.str({ ...resto, tipo, origem });
        let ja = false; // (só no caminho do pedido) a questão já existia e foi mantida como estava
        if (!atual) {
          const id = novoId();
          db.prepare(`INSERT INTO est_questoes (id, producer_id, hash, tipo, origem, uso, corrigivel, situacao, dados, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, autor, hash, tipo, origem, uso, corrigivel ? 1 : 0, situacaoNova, dadosQ, agora, agora);
          atual = { id };
          rel.questoes.novas++;
          if (opcoes.preservar) (rel.questoes.ids_novas = rel.questoes.ids_novas || []).push(id);
        } else if (opcoes.preservar) {
          // IMPORTAÇÃO POR PEDIDO (`preservar`): questão que JÁ existe no banco de quem importa fica INTACTA — dados,
          // uso, corrigível, situação e versão. Quem importa pode ser o produtor, e o `(producer_id, hash)` dele é o
          // do banco oficial do curso: a transcrição de um PDF (sem comentário, explicações, pistas, bloco nem uso)
          // sobrescrevia, ao vivo, a questão curada e publicada. Reescrever questão é só pela importação do curso.
          ja = true;
          rel.questoes.duplicadas++;
        } else if (atual.dados !== dadosQ) {
          // gabarito ou comentário mudou: versão nova; a tentativa já feita guarda a versão que usou
          db.prepare('UPDATE est_questoes SET dados = ?, uso = ?, corrigivel = ?, versao = versao + 1, atualizado_em = ? WHERE id = ?').run(dadosQ, uso, corrigivel ? 1 : 0, agora, atual.id);
          rel.questoes.atualizadas++;
        } else rel.questoes.duplicadas++;
        if (!corrigivel) rel.questoes.fora_da_correcao++;
        if (!comps.length && !its.length) rel.questoes.sem_vinculo++; // fica no banco geral, sem contar cobertura
        // A questão que já existia e veio por pedido só ganha vínculo com percurso PARTICULAR (o de quem importou):
        // ligá-la a um escopo do curso poria ali, já "disponível", o que deveria entrar em rascunho.
        if (ja && !dono) continue;
        const vin = db.prepare(`INSERT INTO est_questao_vinculos (questao_id, escopo_id, alvo, codigo, justificativa, estado_revisao) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (questao_id, escopo_id, alvo, codigo) DO UPDATE SET justificativa = excluded.justificativa, estado_revisao = excluded.estado_revisao`);
        comps.forEach(c => vin.run(atual.id, escopo.id, 'competencia', c, '', 'sugerido'));
        its.forEach(x => vin.run(atual.id, escopo.id, 'item', x.codigo, x.justificativa, x.estado));
      }
    }

    // CORREÇÃO DE CONTEÚDO: a questão é identificada pelo texto (hash do enunciado e das alternativas).
    // Corrigir esse texto cria uma questão nova e deixa a antiga publicada ao lado. Quem corrige manda
    // aqui os hashes das versões superadas: elas são ARQUIVADAS (somem do aluno, ficam no histórico —
    // prova já feita e evidência já registrada continuam apontando para elas).
    if (dados.arquivar_questoes) {
      const hashes = lista(dados.arquivar_questoes, 500, 40);
      rel.questoes_arquivadas = 0;
      const arq = db.prepare(`UPDATE est_questoes SET situacao = 'arquivada', atualizado_em = ? WHERE producer_id = ? AND hash = ? AND situacao != 'arquivada'
        AND id IN (SELECT questao_id FROM est_questao_vinculos WHERE escopo_id = ?)`);
      for (const h of hashes) rel.questoes_arquivadas += arq.run(agora, autor, h, escopo.id).changes;
    }

    if (dados.cards) {
      rel.cards = { novos: 0, atualizados: 0 };
      const ordemCard = ordenador('est_cards');
      for (const [i, c] of (Array.isArray(dados.cards) ? dados.cards : []).entries()) {
        const codigo = slug(c.codigo) || `card-${i + 1}`, comp = slug(c.competencia), frente = s(c.frente, 1000), verso = s(c.verso, 2000);
        if (!codComp.has(comp)) throw erro(`card ${i + 1}: competência "${comp}" não existe.`);
        if (frente.length < 8 || verso.length < 2) throw erro(`card ${i + 1}: frente e verso são obrigatórios.`);
        // card enorme vira releitura; a pergunta tem de caber numa recordação
        if (verso.length > 600) throw erro(`card ${i + 1}: verso com mais de 600 caracteres — divida em cards menores.`);
        const atual = db.prepare('SELECT id, ordem FROM est_cards WHERE escopo_id = ? AND codigo = ?').get(escopo.id, codigo);
        const ord = ordemCard(c.ordem, atual);
        if (!atual) {
          db.prepare(`INSERT INTO est_cards (id, escopo_id, codigo, ordem, competencia_codigo, frente, verso, explicacao, fonte) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(novoId(), escopo.id, codigo, ord, comp, frente, verso, s(c.explicacao, 2000), s(c.fonte, 400));
          rel.cards.novos++;
        } else {
          db.prepare('UPDATE est_cards SET ordem = ?, competencia_codigo = ?, frente = ?, verso = ?, explicacao = ?, fonte = ? WHERE id = ?')
            .run(ord, comp, frente, verso, s(c.explicacao, 2000), s(c.fonte, 400), atual.id);
          rel.cards.atualizados++;
        }
      }
    }
    rel.escopo_id = escopo.id;
  }); } finally { limparCache(); }
  return rel;
}

// Publicar é ato separado da importação. Questão sem vínculo com o escopo não muda.
function definirStatus(produto, dados = {}) { return semCache(() => definirStatus_(produto, dados)); }
function definirStatus_(produto, dados = {}) {
  const escopo = Escopos.doCursoPorSlug(produto.id, slug(dados.escopo));
  if (!escopo) throw erro('Escopo não encontrado.', 404);
  const r = {};
  limparCache();
  const st = (v) => (STATUS.includes(v) ? v : null);
  if (st(dados.status)) {
    if (dados.status === 'publicado' && !escopo.versao) throw erro('Escopo sem programa não pode ser publicado.');
    r.escopo = db.prepare('UPDATE est_escopos SET status = ?, atualizado_em = ? WHERE id = ?').run(dados.status, nowISO(), escopo.id).changes;
  }
  if (st(dados.unidades)) r.unidades = db.prepare('UPDATE est_unidades SET status = ?, atualizado_em = ? WHERE escopo_id = ?').run(dados.unidades, nowISO(), escopo.id).changes;
  if (st(dados.cards)) r.cards = db.prepare('UPDATE est_cards SET status = ? WHERE escopo_id = ?').run(dados.cards, escopo.id).changes;
  // publicar em lote não ressuscita questão ARQUIVADA (versão superada por correção): ela só volta por ato próprio
  if (banco.SITUACOES.includes(dados.questoes)) {
    r.questoes = db.prepare(`UPDATE est_questoes SET situacao = ?, atualizado_em = ? WHERE producer_id = ? AND situacao != 'arquivada' AND id IN (SELECT questao_id FROM est_questao_vinculos WHERE escopo_id = ?)`)
      .run(dados.questoes, nowISO(), produto.producer_id, escopo.id).changes;
  }
  if (REVISAO.includes(dados.vinculos)) {
    r.vinculos = db.prepare('UPDATE est_vinculos SET estado_revisao = ? WHERE escopo_id = ?').run(dados.vinculos, escopo.id).changes
      + db.prepare('UPDATE est_questao_vinculos SET estado_revisao = ? WHERE escopo_id = ?').run(dados.vinculos, escopo.id).changes;
  }
  // Publicar com furo na mão dupla não é proibido (o conteúdo entra em etapas),
  // mas o furo volta na resposta — quem publica vê o que ainda falta. Calculado
  // DEPOIS de todas as mudanças de status do pedido, senão conta o que acabou de publicar.
  limparCache();
  if (st(dados.status) === 'publicado') {
    const md = cobertura({ ...escopo, status: 'publicado' }, { vis: ['publicado'], situacoes: ['disponivel'] }).mao_dupla;
    if (!md.ok) r.aviso_mao_dupla = { folhas_sem_questao: md.folhas_sem_questao.length, questoes_sem_folha: md.questoes_sem_folha, folhas_com_questao_sem_material: md.folhas_com_questao_sem_material.length };
  }
  return r;
}

// ---------------------------------------------------------------------
// COBERTURA do programa — o eixo do MATERIAL e o da AVALIAÇÃO.
// (O eixo do aluno — estudou, demonstrou — é somado em aluno.js.)
// Só folha conta: o título "1. Direito Constitucional" não se estuda, se
// estudam os subitens. Item com leitura pendente não conta como coberto.
// ---------------------------------------------------------------------
function cobertura(escopo, { vis = ['publicado'], situacoes = ['disponivel'] } = {}) {
  const its = itens(escopo);
  const vins = vinculos(escopo.id);
  const uns = unidades(escopo.id, vis);
  const qv = db.prepare(`SELECT v.codigo, v.estado_revisao, q.id, q.origem FROM est_questao_vinculos v JOIN est_questoes q ON q.id = v.questao_id
      WHERE v.escopo_id = ? AND v.alvo = 'item' AND q.situacao IN (${situacoes.map(() => '?').join(',')})`).all(escopo.id, ...situacoes);
  // tudo agrupado por item UMA vez (antes: itens × vínculos, itens × aulas e itens × 1.632 questões)
  const agrupar = (linhas, chave) => { const m = new Map(); for (const l of linhas) { const k = chave(l); if (!m.has(k)) m.set(k, []); m.get(k).push(l); } return m; };
  const qvPorItem = agrupar(qv, x => x.codigo), vinsPorItem = agrupar(vins, v => v.item_codigo), unsPorItem = new Map();
  for (const u of uns) for (const cod of u.itens) { if (!unsPorItem.has(cod)) unsPorItem.set(cod, []); unsPorItem.get(cod).push(u.codigo); }
  const porItem = its.map(i => {
    const q = qvPorItem.get(i.codigo) || [];
    return {
      codigo: i.codigo, pai: i.pai, texto: i.texto, folha: i.folha, pendente: i.pendente, localizacao: i.localizacao,
      competencias: (vinsPorItem.get(i.codigo) || []).map(v => ({ codigo: v.competencia_codigo, estado_revisao: v.estado_revisao })),
      unidades: unsPorItem.get(i.codigo) || [],
      questoes_revisadas: q.filter(x => x.estado_revisao === 'revisado').length,
      questoes_sugeridas: q.filter(x => x.estado_revisao !== 'revisado').length,
      // padrão da banca (ADR-0007): quantas questões OFICIAIS já cobraram este ponto
      oficiais: q.filter(x => x.origem === 'oficial').length,
    };
  });
  const folhas = porItem.filter(i => i.folha);
  const cod = (f) => folhas.filter(f).map(i => i.codigo);
  // MÃO DUPLA (regra do Augusto, 09/10/2026): perguntas para todos os pontos e
  // pontos para todas as perguntas — e o material cobre todo ponto que tem
  // pergunta. Questão presa só à disciplina ("1.1") ou só a competência não
  // aponta ponto nenhum que o aluno possa estudar: conta como sem folha.
  const ehFolha = new Set(folhas.map(i => i.codigo));
  const comFolha = new Set(qv.filter(x => ehFolha.has(x.codigo)).map(x => x.id));
  // Questão de competência TRANSVERSAL (método de estudo, técnica de prova: competência que não cobre
  // item nenhum do programa) não tem ponto do edital para apontar — fica fora desta conta.
  const compComItem = new Set(vins.map(v => v.competencia_codigo));
  const todasQ = [...new Set(db.prepare(`SELECT v.questao_id id, v.alvo, v.codigo FROM est_questao_vinculos v JOIN est_questoes q ON q.id = v.questao_id
      WHERE v.escopo_id = ? AND q.situacao IN (${situacoes.map(() => '?').join(',')})`).all(escopo.id, ...situacoes)
    .filter(x => x.alvo === 'item' || compComItem.has(x.codigo)).map(x => x.id))];
  const maoDupla = {
    folhas_sem_questao: cod(i => !i.questoes_revisadas && !i.questoes_sugeridas),
    questoes_sem_folha: todasQ.filter(id => !comFolha.has(id)).length,
    folhas_com_questao_sem_material: cod(i => (i.questoes_revisadas || i.questoes_sugeridas) && !i.unidades.length),
  };
  maoDupla.ok = !maoDupla.folhas_sem_questao.length && !maoDupla.questoes_sem_folha && !maoDupla.folhas_com_questao_sem_material.length;
  return {
    versao: escopo.versao, itens: its.length, folhas: folhas.length,
    pendentes_de_leitura: cod(i => i.pendente),
    material: { com: cod(i => i.unidades.length && !i.pendente).length, sem: cod(i => !i.unidades.length) },
    avaliacao: { com_questao_revisada: cod(i => i.questoes_revisadas).length, so_sugerida: cod(i => !i.questoes_revisadas && i.questoes_sugeridas), sem: cod(i => !i.questoes_revisadas && !i.questoes_sugeridas) },
    sem_competencia: cod(i => !i.competencias.length),
    mao_dupla: maoDupla,
    por_item: porItem,
  };
}

// O que existe no banco para este escopo, questão a questão — para quem importa conferir se sobrou órfã.
// `ordem_fixa` sai junto (auditoria de 11/10/2026, B9): é o que impede o embaralhamento das alternativas, e sem
// ele a conferência produção × local só se fazia por indício (a versão que subiu). Mora dentro de `dados`.
function questoesDoEscopo(escopo) {
  return db.prepare(`SELECT q.id, q.hash, q.origem, q.situacao, q.uso, q.versao, q.atualizado_em,
      COALESCE(json_extract(q.dados, '$.ordem_fixa'), 0) AS ordem_fixa,
      (SELECT group_concat(v.codigo, ',') FROM est_questao_vinculos v WHERE v.questao_id = q.id AND v.escopo_id = ? AND v.alvo = 'item') AS itens
    FROM est_questoes q WHERE q.id IN (SELECT questao_id FROM est_questao_vinculos WHERE escopo_id = ?) ORDER BY q.criado_em, q.id`).all(escopo.id, escopo.id)
    .map(q => ({ ...q, ordem_fixa: !!q.ordem_fixa }));
}

function resumo(productId) {
  return Escopos.doProduto(productId, STATUS).map(e => {
    const c = e.versao ? cobertura(e, { vis: STATUS, situacoes: banco.SITUACOES }) : null;
    const n = (sql) => db.prepare(sql).all(e.id);
    return {
      slug: e.slug, tipo: e.tipo, titulo: e.titulo, status: e.status, versao: e.versao, data_alvo: e.data_alvo,
      versoes: n('SELECT versao, documento, criado_em FROM est_versoes WHERE escopo_id = ? ORDER BY versao').map(v => ({ ...v, documento: j.parse(v.documento, {}) })),
      competencias: competencias(e.id).length,
      unidades: n('SELECT status, COUNT(*) n FROM est_unidades WHERE escopo_id = ? GROUP BY status'),
      questoes: n(`SELECT q.situacao, q.origem, COUNT(DISTINCT q.id) n FROM est_questoes q JOIN est_questao_vinculos v ON v.questao_id = q.id WHERE v.escopo_id = ? GROUP BY q.situacao, q.origem`),
      // videoaulas: quantas aulas têm o vídeo ligado, e se o arquivo está confirmado no storage
      videos: db.prepare(`SELECT u.codigo, u.status, u.video_media_id AS media_id, m.storage, m.confirmado, m.tamanho, m.mime
        FROM est_unidades u LEFT JOIN media_files m ON m.id = u.video_media_id WHERE u.escopo_id = ? AND u.video_media_id != '' ORDER BY u.codigo`).all(e.id),
      cards: n('SELECT status, COUNT(*) n FROM est_cards WHERE escopo_id = ? GROUP BY status'),
      cobertura: c && { folhas: c.folhas, pendentes_de_leitura: c.pendentes_de_leitura.length, material_com: c.material.com, material_sem: c.material.sem,
        avaliacao_com_revisada: c.avaliacao.com_questao_revisada, avaliacao_so_sugerida: c.avaliacao.so_sugerida.length, avaliacao_sem: c.avaliacao.sem, sem_competencia: c.sem_competencia,
        mao_dupla: { ok: c.mao_dupla.ok, folhas_sem_questao: c.mao_dupla.folhas_sem_questao.length, questoes_sem_folha: c.mao_dupla.questoes_sem_folha, folhas_com_questao_sem_material: c.mao_dupla.folhas_com_questao_sem_material.length } },
    };
  });
}

module.exports = {
  Escopos, Questoes, itens, competencias, vinculos, unidades, unidadePorCodigo, cards, competenciasDaQuestao, competenciasDasQuestoes, comCache, memo, limparCache, esquecer,
  importar, criarParticular, PARTICULARES_MAX, validarUnidade, definirStatus, cobertura, resumo, competenciasComPratica, questoesDoEscopo, slug, erro, STATUS, TIPOS, EXTENSOES, BLOCOS,
};
