// =====================================================================
// Villela Academy — ESTUDO · "MINHA JORNADA" do percurso: diagnóstico de
// entrada e teste final, nível, selos por disciplina, medalhas e os dados
// das Ferramentas do concurseiro (paridade com os outros cursos, etapa 2).
//
// Regra do Estude (ADR-0001): tudo aqui é DERIVADO do que o aluno fez —
// evidências, tentativas, check-ins, pedidos. Não existe tabela de nível,
// de selo nem de conquista: se a evidência muda, o que se mostra muda junto.
// O nível mede DOMÍNIO DEMONSTRADO, não volume: abrir aula, ver vídeo ou
// ler não move nada. E nada aqui promete aprovação.
//
// Os nomes dos níveis são os mesmos dos outros cursos (jornada.js); a
// escada é outra, porque lá o nível sai de XP (volume) e aqui de competência
// demonstrada. O cartão de XP da jornada comum segue fora deste curso.
// =====================================================================
'use strict';
const { db, novoId, j } = require('../db');
const R = require('./repo');
const banco = require('./banco');
const ev = require('./evidencia');
const plano = require('./plano');
const crono = require('./cronograma');
const { somarDias } = require('./agenda');
const A = require('./aluno');
const { erro } = R;

// ---------------------------------------------------------------------
// DIAGNÓSTICO (entrada) e TESTE FINAL (saída): o mesmo molde
// ---------------------------------------------------------------------
const DIAG_QUESTOES_POR_DISCIPLINA = 3;   // 15 disciplinas → cerca de 45 questões
const DIAG_VALIDADE_DIAS = 30;            // sem relógio punitivo: dá para fazer em partes; depois disso vale o que foi salvo
const DIAG_FAIXA_BASE_PCT = 50;           // abaixo disto: "comece por aqui"
const DIAG_FAIXA_FORTE_PCT = 80;          // a partir disto: "ponto forte"; entre as duas: "base razoável"
const TESTE_FINAL_PCT_AULAS = 70;         // % das aulas estudadas (régua de `aulaEstudada`) que libera o teste final
const TESTE_FINAL_INTERVALO_DIAS = 14;    // intervalo mínimo para refazer o teste final
const MODOS = ['diagnostico', 'teste_final'];
const LEITURAS = { comece_por_aqui: 'Comece por aqui', base_razoavel: 'Base razoável', ponto_forte: 'Ponto forte', sem_questoes: 'Sem questões para medir' };
const GERAL = '_geral';

// As disciplinas do percurso, na ordem do edital: as disciplinas-mãe das aulas. As aulas de método de estudo
// (transversais) não são disciplina do edital; num programa sem disciplina-mãe, o percurso inteiro é uma só.
function disciplinas(c, pre) {
  const { grupos } = A.aulasPorDisciplina(c, pre);
  const com = grupos.filter(g => g.codigo);
  return (com.length ? com : grupos).map(g => ({ codigo: g.codigo || GERAL, nome: g.codigo ? g.nome : c.escopo.titulo, aulas: g.aulas,
    competencias: [...new Set(g.aulas.flatMap(u => u.competencias))] }));
}
// as tentativas de diagnóstico e de teste final do aluno neste percurso, já consolidadas (a vencida vira resultado)
function tentativas(usuario, escopo) {
  return db.prepare(`SELECT * FROM est_tentativas WHERE user_id = ? AND escopo_id = ? AND modo IN (${MODOS.map(() => '?').join(',')}) ORDER BY inicio_em`).all(usuario.id, escopo.id, ...MODOS)
    .map(A.abrirTentativa).map(t => A.consolidarSeExpirou(usuario, escopo, t));
}
const leituraDoPct = (pct, total) => (!total ? 'sem_questoes' : pct < DIAG_FAIXA_BASE_PCT ? 'comece_por_aqui' : pct < DIAG_FAIXA_FORTE_PCT ? 'base_razoavel' : 'ponto_forte');
// resultado por disciplina de uma tentativa encerrada; questão em branco não é acerto
function porDisciplina(t) {
  const sit = Object.fromEntries(((t.resultado && t.resultado.itens) || []).map(i => [i.id, i.situacao]));
  return (t.congelado.disciplinas || []).map((d, ordem) => {
    const its = t.congelado.itens.filter(i => i.bloco === d.codigo);
    const acertos = its.filter(i => sit[i.id] === 'certa').length, respondidas = its.filter(i => sit[i.id] === 'certa' || sit[i.id] === 'errada').length;
    const pct = its.length ? Math.round(100 * acertos / its.length) : 0, leitura = leituraDoPct(pct, its.length);
    return { codigo: d.codigo, nome: d.nome, ordem, total: its.length, respondidas, acertos, pct, leitura, leitura_txt: LEITURAS[leitura] };
  });
}
// por onde começar: a disciplina mais fraca primeiro; empate, a ordem do edital; sem questão para medir, no fim
const ordemSugerida = (linhas) => [...linhas].sort((a, b) => (a.total ? 0 : 1) - (b.total ? 0 : 1) || a.pct - b.pct || a.ordem - b.ordem);
const resumoDe = (t) => t && { id: t.id, modo: t.modo, estado: t.estado, enviado_em: t.enviado_em, total: t.congelado.itens.length,
  acertos: t.resultado ? t.resultado.certas : 0, respondidas: t.resultado ? t.resultado.certas + t.resultado.erradas : 0, disciplinas: porDisciplina(t) };

// O estado do diagnóstico e do teste final — é o que a aba Hoje, o Plano e "Minha jornada" mostram.
function situacao(usuario, c, { discs = disciplinas(c), comResposta = A.competenciasComResposta(usuario.id, c.escopo.id) } = {}) {
  const todas = tentativas(usuario, c.escopo);
  const aberta = (modo) => todas.find(t => t.modo === modo && t.estado === 'em_andamento') || null;
  const feitas = (modo) => todas.filter(t => t.modo === modo && t.estado !== 'em_andamento');
  const diag = feitas('diagnostico')[0] || null, finais = feitas('teste_final'), ultimo = finais[finais.length - 1] || null;
  const totalAulas = discs.reduce((n, d) => n + d.aulas.length, 0), estudadas = discs.reduce((n, d) => n + d.aulas.filter(u => A.aulaEstudada(u, comResposta)).length, 0);
  const pctAulas = totalAulas ? Math.floor(100 * estudadas / totalAulas) : 0;
  const faltamAulas = Math.max(0, Math.ceil(totalAulas * TESTE_FINAL_PCT_AULAS / 100) - estudadas);
  const hoje = A.hojeBR();
  const podeRefazerEm = ultimo ? somarDias(A.hojeBR(new Date(ultimo.enviado_em || ultimo.inicio_em)), TESTE_FINAL_INTERVALO_DIAS) : '';
  const abertoD = aberta('diagnostico'), abertoF = aberta('teste_final');
  const andamento = (t) => t && { id: t.id, respondidas: Object.keys(t.respostas || {}).length, total: t.congelado.itens.length, inicio_em: t.inicio_em, valido_ate: t.prazo_em };
  const antes = resumoDe(diag), depois = resumoDe(ultimo);
  return {
    disponivel: discs.length > 0 && !c.particular, // o percurso particular do aluno não tem aulas por disciplina: não há o que diagnosticar
    por_disciplina: DIAG_QUESTOES_POR_DISCIPLINA, disciplinas: discs.length,
    diagnostico: { feito: !!diag, aberto: andamento(abertoD), resultado: antes, ordem_sugerida: antes ? ordemSugerida(antes.disciplinas).map(d => ({ codigo: d.codigo, nome: d.nome, leitura: d.leitura, leitura_txt: d.leitura_txt, acertos: d.acertos, total: d.total })) : [] },
    teste_final: { liberado: totalAulas > 0 && !faltamAulas, pct_aulas: pctAulas, pct_exigido: TESTE_FINAL_PCT_AULAS, aulas_estudadas: estudadas, total_aulas: totalAulas, faltam_aulas: faltamAulas,
      aberto: andamento(abertoF), feitos: finais.length, resultado: depois, pode_refazer_em: podeRefazerEm, pode_refazer: !ultimo || hoje >= podeRefazerEm, intervalo_dias: TESTE_FINAL_INTERVALO_DIAS },
    // antes × depois, lado a lado, por disciplina (só quando há os dois)
    evolucao: antes && depois ? antes.disciplinas.map(a => { const d = depois.disciplinas.find(x => x.codigo === a.codigo); return { codigo: a.codigo, nome: a.nome, antes: { acertos: a.acertos, total: a.total, pct: a.pct }, depois: d ? { acertos: d.acertos, total: d.total, pct: d.pct } : null, variacao_pp: d && d.total && a.total ? d.pct - a.pct : null }; }) : [],
  };
}

// Começa (ou retoma) o diagnóstico ou o teste final. N questões por disciplina, sorteadas entre as disponíveis
// e corrigíveis, NUNCA reservadas; inédita para o aluno primeiro; no teste final, as do diagnóstico ficam por último.
function iniciar(usuario, produto, slugEscopo, { tipo = 'diagnostico' } = {}) {
  const c = A.abrir(usuario, produto, slugEscopo);
  if (!MODOS.includes(tipo)) throw erro(`tipo deve ser ${MODOS.join('|')}.`);
  const discs = disciplinas(c), st = situacao(usuario, c, { discs });
  if (!st.disponivel) throw erro('Este percurso não tem aulas por disciplina: não há diagnóstico a fazer.', 409);
  const ab = tipo === 'diagnostico' ? st.diagnostico.aberto : st.teste_final.aberto;
  if (ab) return { ...A.paraAlunoTentativa(A.tentativaDe(usuario, ab.id)), retomada: true };
  if (tipo === 'diagnostico' && st.diagnostico.feito) throw erro('O diagnóstico de entrada já foi feito: o resultado está em Minha jornada. Para medir a evolução, use o teste final.', 409);
  if (tipo === 'teste_final') {
    const f = st.teste_final;
    if (!f.liberado) throw erro(`O teste final abre quando você tiver estudado ${TESTE_FINAL_PCT_AULAS} % das aulas: ${f.faltam_aulas > 1 ? 'faltam ' + f.faltam_aulas + ' aulas' : 'falta 1 aula'} (${f.aulas_estudadas} de ${f.total_aulas} até aqui).`, 409);
    if (!f.pode_refazer) throw erro(`Você já fez o teste final. Para refazer, espere até ${f.pode_refazer_em.slice(8, 10)}/${f.pode_refazer_em.slice(5, 7)}/${f.pode_refazer_em.slice(0, 4)} (intervalo de ${TESTE_FINAL_INTERVALO_DIAS} dias).`, 409);
  }
  const id = novoId();
  const pool = R.Questoes.doEscopo(c.escopo.id, { situacoes: c.situacoes }).filter(q => q.corrigivel && q.uso !== 'reservada')
    .map(q => ({ q, comps: R.competenciasDaQuestao(q.id, c.escopo.id) }));
  // o que já caiu no diagnóstico (ou num teste final anterior) deste aluno
  const jaCaiu = new Set(tentativas(usuario, c.escopo).flatMap(t => t.congelado.itens.map(i => i.id)));
  const peso = (x) => (jaCaiu.has(x.q.id) ? 4 : 0) + (A.jaViu(usuario.id, x.q.id) ? 2 : 0);
  const tomadas = new Set(), itens = [], resumo = [];
  for (const d of discs) {
    const comps = new Set(d.competencias);
    const dela = pool.filter(x => !tomadas.has(x.q.id) && x.comps.some(k => comps.has(k)));
    const escolhidas = banco.embaralhar(dela, id + ':' + d.codigo).map(x => ({ x, p: peso(x) })).sort((a, b) => a.p - b.p).slice(0, DIAG_QUESTOES_POR_DISCIPLINA).map(y => y.x);
    for (const x of escolhidas) {
      tomadas.add(x.q.id);
      // o "bloco" da correção é a DISCIPLINA: o motor de pontuação devolve o resultado por disciplina sem conta nova
      itens.push({ id: x.q.id, versao: x.q.versao, gabarito: banco.gabaritoDe(x.q), bloco: d.codigo, competencias: x.comps, publico: banco.paraAluno(x.q, id) });
    }
    resumo.push({ codigo: d.codigo, nome: d.nome, questoes: escolhidas.length, disponiveis: dela.length });
  }
  if (!itens.length) throw erro('Este percurso ainda não tem questões de correção automática para montar o diagnóstico.', 409);
  const inicio = new Date();
  // regra vazia = 1 ponto por acerto, sem desconto: o diagnóstico mede a base, não simula a nota do concurso
  const congelado = { modo: tipo, duracao_min: 0, sem_relogio: true, regra: {}, escopo_versao: c.escopo.versao, por_disciplina: DIAG_QUESTOES_POR_DISCIPLINA, disciplinas: resumo, itens };
  db.prepare('INSERT INTO est_tentativas (id, user_id, escopo_id, modo, congelado, inicio_em, prazo_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, usuario.id, c.escopo.id, tipo, j.str(congelado), inicio.toISOString(), new Date(inicio.getTime() + DIAG_VALIDADE_DIAS * 864e5).toISOString());
  return { ...A.paraAlunoTentativa(A.tentativaDe(usuario, id)), disciplinas: resumo, faltaram: discs.length * DIAG_QUESTOES_POR_DISCIPLINA - itens.length };
}

// ---------------------------------------------------------------------
// NÍVEL — os nomes dos outros cursos, a escada do DOMÍNIO DEMONSTRADO.
//
// A conta: das competências do percurso (as que cobrem item do programa; num percurso sem programa, todas),
//   D = % que está "demonstrada" — estado `demonstrada_sem_apoio` ou `retida` (evidencia.js): acerto fora do
//       modo estudo, sem pista, sem ajuda humana, em questão que o aluno ainda não tinha visto;
//   T = % que está "retida" — nova demonstração independente depois de 7 dias.
// O nível é o mais alto cujos dois pisos (D e T) estão cumpridos. Acerto com pista, em questão repetida ou em
// card ("demonstrada com apoio", "em prática") NÃO conta; assistir, ler e abrir aula não geram evidência — quem
// só fez isso fica em Explorador. Falha sem apoio derruba a competência, então o nível também pode descer.
// ---------------------------------------------------------------------
const NOMES_DE_NIVEL = require('../jornada').NIVEIS_XP.map(n => n.nome); // Explorador · Praticante · Criador · Especialista · Mestre
const PISOS_DE_NIVEL = [
  { demonstradas_pct: 0, retidas_pct: 0 },    // 1 Explorador
  { demonstradas_pct: 10, retidas_pct: 0 },   // 2 Praticante
  { demonstradas_pct: 35, retidas_pct: 0 },   // 3 Criador
  { demonstradas_pct: 65, retidas_pct: 0 },   // 4 Especialista
  { demonstradas_pct: 90, retidas_pct: 50 },  // 5 Mestre
];
const NIVEIS = PISOS_DE_NIVEL.map((p, i) => ({ n: i + 1, nome: NOMES_DE_NIVEL[i], ...p }));
const piso = (total, pct) => (pct > 0 ? Math.max(1, Math.ceil(total * pct / 100)) : 0);
const pl = (n, um, muitos) => n + ' ' + (n === 1 ? um : muitos);

function nivelDe(c, est) {
  const comItem = new Set(R.vinculos(c.escopo.id).map(v => v.competencia_codigo));
  const lista = comItem.size ? est.filter(e => comItem.has(e.codigo)) : est;
  const total = lista.length, conta = (f) => lista.filter(f).length;
  const dem = conta(e => ev.demonstrada(e.estado)), ret = conta(e => e.estado === 'retida');
  const atende = (n) => total > 0 && dem >= piso(total, n.demonstradas_pct) && ret >= piso(total, n.retidas_pct);
  const atual = [...NIVEIS].reverse().find(n => n.n === 1 || atende(n));
  const prox = NIVEIS.find(n => n.n === atual.n + 1) || null;
  let falta = null;
  if (prox && total) {
    const fd = Math.max(0, piso(total, prox.demonstradas_pct) - dem), fr = Math.max(0, piso(total, prox.retidas_pct) - ret);
    falta = { nivel: prox.n, nome: prox.nome, demonstrar: fd, reter: fr,
      texto: `Para chegar a ${prox.nome}: ` + [fd ? `demonstre mais ${pl(fd, 'competência', 'competências')} (acerte, sem pista, uma questão que você ainda não viu de cada uma)` : '',
        fr ? `confirme a retenção de mais ${pl(fr, 'competência', 'competências')} (acerte outra questão nova dela ${ev.INTERVALO_RETENCAO_DIAS} dias depois ou mais)` : ''].filter(Boolean).join(' e ') + '.' };
  }
  // competência que hoje não tem questão praticável: dizer, em vez de deixar o aluno procurar o que não existe
  const praticavel = R.competenciasComPratica(c.escopo.id, c.situacoes);
  return { n: atual.n, nome: atual.nome, de: NIVEIS.length, proximo: falta,
    competencias: { total, demonstradas: dem, retidas: ret, com_apoio: conta(e => e.estado === 'demonstrada_com_apoio'), em_pratica: conta(e => e.estado === 'em_pratica'),
      nao_avaliadas: conta(e => e.estado === 'nao_avaliada'), sem_questao: conta(e => !ev.demonstrada(e.estado) && !praticavel.has(e.codigo)) },
    demonstradas_pct: total ? Math.floor(100 * dem / total) : 0, retidas_pct: total ? Math.floor(100 * ret / total) : 0,
    escada: NIVEIS.map(n => ({ n: n.n, nome: n.nome, demonstradas_pct: n.demonstradas_pct, retidas_pct: n.retidas_pct, demonstradas: piso(total, n.demonstradas_pct), retidas: piso(total, n.retidas_pct) })) };
}

// ---------------------------------------------------------------------
// SELOS POR DISCIPLINA — três graus; vale o mais alto que a disciplina cumpre.
//   bronze  todas as aulas da disciplina estudadas (régua única de `aulaEstudada`)
//   prata   ao menos 70 % das competências da disciplina demonstradas (sem apoio ou retidas)
//   ouro    todas as competências da disciplina demonstradas (sem apoio ou retidas)
// "Sem apoio" já está no estado: demonstração é acerto sem pista, em questão nova (evidencia.js).
// ---------------------------------------------------------------------
const SELO_PRATA_PCT = 70;
const SELO_OURO_PCT = 100;
const GRAUS = ['bronze', 'prata', 'ouro'];
function selos(discs, est, comResposta) {
  const por = Object.fromEntries(est.map(e => [e.codigo, e]));
  return discs.map(d => {
    const aulas = d.aulas.length, estudadas = d.aulas.filter(u => A.aulaEstudada(u, comResposta)).length;
    const total = d.competencias.length, dem = d.competencias.filter(k => por[k] && ev.demonstrada(por[k].estado)).length;
    const pct = total ? Math.floor(100 * dem / total) : 0;
    const grau = total && pct >= SELO_OURO_PCT ? 'ouro' : total && pct >= SELO_PRATA_PCT ? 'prata' : aulas && estudadas === aulas ? 'bronze' : '';
    const paraPrata = Math.max(0, Math.ceil(total * SELO_PRATA_PCT / 100) - dem);
    const falta = grau === 'ouro' ? '' : grau === 'prata' ? `Ouro: demonstre mais ${pl(total - dem, 'competência', 'competências')}.`
      : grau === 'bronze' ? `Prata: demonstre mais ${pl(paraPrata, 'competência', 'competências')}.`
      : !total ? 'Esta disciplina ainda não tem competências para demonstrar.'
      : `Bronze: estude mais ${pl(aulas - estudadas, 'aula', 'aulas')} — ou vá direto à prata, demonstrando mais ${pl(paraPrata, 'competência', 'competências')}.`;
    return { codigo: d.codigo, nome: d.nome, grau, aulas, aulas_estudadas: estudadas, competencias: total, demonstradas: dem, demonstradas_pct: pct, falta };
  });
}

// ---------------------------------------------------------------------
// MEDALHAS — marcos, todos derivados do que já está gravado por outros motivos.
// (Audiobook fica de fora: não há registro confiável de escuta.)
// ---------------------------------------------------------------------
const MEDALHA_SEQUENCIA_DIAS = 7;
const PEDIDOS_DE_CORRECAO = ['correcao', 'oral'];                  // escrita (discursiva, peça, sentença) e arguição oral
const PEDIDO_FEITO = ['processando', 'pronto', 'aplicado'];        // confirmado pelo aluno; orçamento, cancelado e falha não contam
// a maior sequência de dias seguidos (data de Brasília) com alguma evidência, e a sequência que está viva hoje
function sequencias(evs, hoje = A.hojeBR()) {
  const dias = [...new Set(evs.map(e => A.hojeBR(new Date(e.criado_em))))].sort();
  let maior = 0, corrida = 0, ant = '';
  for (const d of dias) { corrida = ant && ev.diasEntre(ant, d) === 1 ? corrida + 1 : 1; if (corrida > maior) maior = corrida; ant = d; }
  // a sequência atual continua viva se o último dia de estudo foi hoje ou ontem
  const viva = ant && ev.diasEntre(ant, hoje) <= 1 ? corrida : 0;
  return { dias_com_estudo: dias.length, maior, atual: viva, ultimo_dia: ant };
}
function medalhas(usuario, produto, c, { discs, evs, diag }) {
  const uid = usuario.id, eid = c.escopo.id;
  const n = (sql, ...p) => db.prepare(sql).get(...p).n;
  const simulados = n("SELECT COUNT(*) n FROM est_tentativas WHERE user_id = ? AND escopo_id = ? AND modo = 'simulado' AND estado = 'enviada'", uid, eid);
  const seq = sequencias(evs);
  // caderno de erros zerado numa disciplina: ela JÁ teve erro em questão, e hoje nenhuma questão dela está pendente
  const compsDe = new Map();
  for (const e of evs) if (e.origem === 'questao') { if (!compsDe.has(e.ref_id)) compsDe.set(e.ref_id, new Set()); compsDe.get(e.ref_id).add(e.competencia_codigo); }
  const pendentes = A.errosPendentes(uid, eid).map(x => x.id);
  const zeradas = discs.filter(d => {
    const dela = new Set(d.competencias), toca = (qid) => [...(compsDe.get(qid) || [])].some(k => dela.has(k));
    return evs.some(e => e.origem === 'questao' && !e.acerto && dela.has(e.competencia_codigo)) && !pendentes.some(toca);
  }).map(d => d.nome);
  // Largada: a seção `desafio` da jornada do PRODUTO (publicada), com todos os dias marcados
  const sec = db.prepare("SELECT dados FROM curso_jornada WHERE product_id = ? AND secao = 'desafio' AND status = 'publicado'").get(produto.id);
  const diasDesafio = sec ? (j.parse(sec.dados, {}).dias || []).length : 0, tituloDesafio = sec ? j.parse(sec.dados, {}).titulo || 'Desafio' : '';
  const checkins = diasDesafio ? n('SELECT COUNT(*) n FROM desafio_checkins WHERE user_id = ? AND product_id = ?', uid, produto.id) : 0;
  const correcoes = n(`SELECT COUNT(*) n FROM est_pedidos WHERE user_id = ? AND product_id = ? AND escopo_id = ? AND tipo IN (${PEDIDOS_DE_CORRECAO.map(() => '?').join(',')}) AND estado IN (${PEDIDO_FEITO.map(() => '?').join(',')})`,
    uid, produto.id, eid, ...PEDIDOS_DE_CORRECAO, ...PEDIDO_FEITO);
  return [
    { id: 'diagnostico', icone: '🧭', nome: 'Ponto de partida', desc: 'Fez o diagnóstico de entrada', ok: diag.diagnostico.feito, existe: diag.disponivel, detalhe: '' },
    { id: 'simulado', icone: '⏱️', nome: 'Primeiro simulado', desc: 'Enviou um simulado completo na aba Prova', ok: simulados > 0, existe: true, detalhe: simulados ? pl(simulados, 'simulado enviado', 'simulados enviados') : '' },
    { id: 'sequencia', icone: '📆', nome: `${MEDALHA_SEQUENCIA_DIAS} dias seguidos`, desc: `Estudou ${MEDALHA_SEQUENCIA_DIAS} dias seguidos (respondendo questão ou card)`, ok: seq.maior >= MEDALHA_SEQUENCIA_DIAS, existe: true,
      detalhe: `maior sequência: ${pl(seq.maior, 'dia', 'dias')}` + (seq.atual ? ` · em andamento: ${pl(seq.atual, 'dia', 'dias')}` : '') },
    { id: 'erros', icone: '🧹', nome: 'Caderno de erros zerado', desc: 'Zerou o caderno de erros de uma disciplina (refez e acertou tudo o que tinha errado nela)', ok: zeradas.length > 0, existe: true, detalhe: zeradas.join(' · ') },
    { id: 'largada', icone: '🔥', nome: tituloDesafio || 'Largada', desc: `Concluiu ${diasDesafio ? 'os ' + diasDesafio + ' dias' : 'todos os dias'} do desafio do curso`, ok: diasDesafio > 0 && checkins >= diasDesafio, existe: diasDesafio > 0,
      detalhe: diasDesafio ? `${checkins} de ${diasDesafio} dias` : '' },
    { id: 'correcao', icone: '✍️', nome: 'Primeira correção', desc: 'Pediu a primeira correção de escrita ou de arguição oral', ok: correcoes > 0, existe: true, detalhe: correcoes ? pl(correcoes, 'correção pedida', 'correções pedidas') : '' },
  ].filter(m => m.existe).map(({ existe, ...m }) => m);
}

// ---------------------------------------------------------------------
// As portas: "Minha jornada" inteira, o resumo que vai no painel (aba Hoje) e os dados das Ferramentas
// ---------------------------------------------------------------------
function jornada(usuario, produto, slugEscopo) {
  const c = A.abrir(usuario, produto, slugEscopo);
  const est = A.estadosDoAluno(usuario, c.escopo), evs = A.evidencias(usuario.id, c.escopo.id);
  const discs = disciplinas(c), comResposta = new Set(evs.map(e => e.competencia_codigo));
  const diag = situacao(usuario, c, { discs, comResposta });
  return { escopo: { slug: c.escopo.slug, titulo: c.escopo.titulo, particular: !!c.particular },
    nivel: nivelDe(c, est), selos: selos(discs, est, comResposta), medalhas: medalhas(usuario, produto, c, { discs, evs, diag }),
    sequencia: sequencias(evs), avaliacao: diag,
    criterios: { selo_prata_pct: SELO_PRATA_PCT, selo_ouro_pct: SELO_OURO_PCT, sequencia_dias: MEDALHA_SEQUENCIA_DIAS, retencao_dias: ev.INTERVALO_RETENCAO_DIAS,
      faixa_base_pct: DIAG_FAIXA_BASE_PCT, faixa_forte_pct: DIAG_FAIXA_FORTE_PCT } };
}
// o que o painel leva para a aba Hoje: o nível (cartão compacto) e o diagnóstico (cartão e ordem sugerida).
// Recebe os estados que o painel já calculou — não lê as evidências de novo.
function resumoParaPainel(usuario, c, est, comResposta, pre) {
  const nv = nivelDe(c, est), diag = situacao(usuario, c, { discs: disciplinas(c, pre), comResposta });
  return { nivel: { n: nv.n, nome: nv.nome, de: nv.de, proximo: nv.proximo, competencias: nv.competencias },
    avaliacao: { disponivel: diag.disponivel, por_disciplina: diag.por_disciplina, disciplinas: diag.disciplinas,
      diagnostico: { feito: diag.diagnostico.feito, aberto: diag.diagnostico.aberto, ordem_sugerida: diag.diagnostico.ordem_sugerida },
      teste_final: { liberado: diag.teste_final.liberado, feitos: diag.teste_final.feitos, aberto: diag.teste_final.aberto, faltam_aulas: diag.teste_final.faltam_aulas, pct_exigido: diag.teste_final.pct_exigido } } };
}

// FERRAMENTAS: o que a calculadora e o cronograma precisam do servidor. A conta roda no navegador, com os motores
// puros (motores-navegador.js); daqui saem só os DADOS do percurso e do aluno — a regra de pontuação com a fonte,
// a data da prova, a disponibilidade do Plano dele (se houver) e as aulas que faltam estudar, por disciplina.
function ferramentas(usuario, produto, slugEscopo) {
  const c = A.abrir(usuario, produto, slugEscopo);
  const comResposta = A.competenciasComResposta(usuario.id, c.escopo.id);
  const { grupos } = A.aulasPorDisciplina(c);
  const p = db.prepare('SELECT entrada FROM est_planos WHERE user_id = ? AND escopo_id = ?').get(usuario.id, c.escopo.id);
  const ent = p ? j.parse(p.entrada, {}) : null;
  const regra = c.escopo.regra_pontuacao && Object.keys(c.escopo.regra_pontuacao).length ? c.escopo.regra_pontuacao : null;
  return { hoje: A.hojeBR(), escopo: { slug: c.escopo.slug, titulo: c.escopo.titulo, data_alvo: c.escopo.data_alvo || '' },
    regra_pontuacao: regra,
    plano: ent ? { disponibilidade: ent.disponibilidade, margem_pct: ent.margem_pct, data_alvo: ent.data_alvo || '', indisponiveis: ent.indisponiveis || [] } : null,
    reta_final: A.retaFinalDoEscopo(c.escopo),
    niveis: plano.NIVEIS, reservas: { margem_pct: plano.MARGEM_PADRAO_PCT, revisao_pct: crono.REVISAO_PCT, simulado_pct: crono.SIMULADO_PCT },
    disciplinas: grupos.map(g => ({ codigo: g.codigo || '_metodo', nome: g.nome,
      aulas: g.aulas.map(u => ({ codigo: u.codigo, titulo: u.titulo, tempo_min: u.tempo_min || 0, estudada: A.aulaEstudada(u, comResposta) })) })) };
}

module.exports = {
  iniciar, situacao, jornada, resumoParaPainel, ferramentas, disciplinas, nivelDe, selos, medalhas, sequencias, porDisciplina, ordemSugerida,
  DIAG_QUESTOES_POR_DISCIPLINA, DIAG_VALIDADE_DIAS, DIAG_FAIXA_BASE_PCT, DIAG_FAIXA_FORTE_PCT, TESTE_FINAL_PCT_AULAS, TESTE_FINAL_INTERVALO_DIAS,
  NIVEIS, SELO_PRATA_PCT, SELO_OURO_PCT, GRAUS, MEDALHA_SEQUENCIA_DIAS, MODOS, LEITURAS,
};
