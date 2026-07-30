// =====================================================================
// ONDA LIVRO · ESTRATÉGIA E MATRIZES
// Cap. 5.6 matriz de fatos · 21 diagnóstico do processo · 23 estratégia e
// árvores de decisão · 24 matriz de provas · 26.3 matriz de recursos ·
// 30 negociação (BATNA e tratativas).
//
// Regra transversal: estratégia, prognóstico e cenários são SIGILOSOS —
// nunca vão ao portal do cliente nem ao índice RAG (Cap. 4.7 / 9.8).
// =====================================================================
'use strict';
const B = require('../repo-livro');
const { EL, s, cent, int, bool, valida, hoje, patch, um, todos, novoId, nowISO, db } = B;

const exigeCaso = (case_id) => {
  if (!um('SELECT id FROM cases WHERE id = ?', case_id)) throw new Error('Processo não encontrado.');
};

// ------------------------------------------------- ESTRATÉGIA (Cap. 23)
const Estrategia = {
  obter(case_id) {
    const e = um('SELECT * FROM case_strategies WHERE case_id = ?', case_id) || null;
    return {
      estrategia: e,
      cenarios: todos('SELECT * FROM strategy_scenarios WHERE case_id = ? ORDER BY probabilidade, cenario', case_id),
      decisoes: todos('SELECT * FROM strategy_decisions WHERE case_id = ? ORDER BY criado_em DESC', case_id),
      recursos: todos('SELECT * FROM appeal_options WHERE case_id = ? ORDER BY criado_em DESC', case_id),
      negociacao: todos('SELECT * FROM negotiation_rounds WHERE case_id = ? ORDER BY rodada, quando', case_id),
    };
  },
  salvar(case_id, d = {}, quem) {
    exigeCaso(case_id);
    const atual = um('SELECT * FROM case_strategies WHERE case_id = ?', case_id);
    const campos = {
      objetivo_juridico: s(d.objetivo_juridico, 4000), objetivo_cliente: s(d.objetivo_cliente, 4000),
      teses_principais: s(d.teses_principais, 8000), teses_subsidiarias: s(d.teses_subsidiarias, 8000),
      provas_necessarias: s(d.provas_necessarias, 4000), batna: s(d.batna, 4000),
      faixa_acordo_min: cent(d.faixa_acordo_min), faixa_acordo_max: cent(d.faixa_acordo_max),
      custo_estimado: cent(d.custo_estimado), duracao_estimada: s(d.duracao_estimada, 200),
      sigilosa: d.sigilosa === undefined ? 1 : bool(d.sigilosa), atualizado_por: s(quem, 120),
    };
    if (atual) { patch('case_strategies', atual.id, campos); return Estrategia.obter(case_id); }
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO case_strategies (id, case_id, objetivo_juridico, objetivo_cliente, teses_principais,
      teses_subsidiarias, provas_necessarias, batna, faixa_acordo_min, faixa_acordo_max, custo_estimado,
      duracao_estimada, sigilosa, atualizado_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, case_id, campos.objetivo_juridico, campos.objetivo_cliente, campos.teses_principais,
        campos.teses_subsidiarias, campos.provas_necessarias, campos.batna, campos.faixa_acordo_min,
        campos.faixa_acordo_max, campos.custo_estimado, campos.duracao_estimada, campos.sigilosa,
        campos.atualizado_por, agora, agora);
    return Estrategia.obter(case_id);
  },
  // 23.2/23.3: cenário exige declarar a INCERTEZA (o que não se sabe).
  addCenario(case_id, d = {}) {
    exigeCaso(case_id);
    if (!s(d.incerteza)) throw new Error('Declare a incerteza do cenário — o que ainda não se sabe (Cap. 23.3).');
    const id = novoId();
    db.prepare('INSERT INTO strategy_scenarios (id, case_id, cenario, probabilidade, impacto_centavos, incerteza, providencia, criado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, case_id, s(d.cenario, 2000), valida(d.probabilidade, EL.probabilidade, 'probabilidade'),
        cent(d.impacto_centavos), s(d.incerteza, 2000), s(d.providencia, 2000), nowISO());
    return um('SELECT * FROM strategy_scenarios WHERE id = ?', id);
  },
  removerCenario(id) { return db.prepare('DELETE FROM strategy_scenarios WHERE id = ?').run(id).changes; },
  // 23.9 registro da decisão estratégica: decisão + alternativas + motivo + quem
  addDecisao(case_id, d = {}, quem) {
    exigeCaso(case_id);
    if (!s(d.motivo)) throw new Error('Registre o motivo da decisão estratégica (Cap. 23.9).');
    const id = novoId();
    db.prepare('INSERT INTO strategy_decisions (id, case_id, decisao, alternativas, motivo, quem, cliente_ciente, revisar_em, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, case_id, s(d.decisao, 4000), s(d.alternativas, 4000), s(d.motivo, 4000),
        s(d.quem, 120) || s(quem, 120), bool(d.cliente_ciente), s(d.revisar_em, 20), nowISO());
    return um('SELECT * FROM strategy_decisions WHERE id = ?', id);
  },
  // 26.3 matriz de recursos cabíveis
  addRecurso(case_id, d = {}) {
    exigeCaso(case_id);
    const id = novoId();
    db.prepare(`INSERT INTO appeal_options (id, case_id, decisao, recurso, prazo_dias, prazo_fatal,
      custo_centavos, chance, efeito, recomendacao, fundamento, decidido_por, criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'',?)`)
      .run(id, case_id, s(d.decisao, 1000), s(d.recurso, 200), int(d.prazo_dias, 0), s(d.prazo_fatal, 20),
        cent(d.custo_centavos), valida(d.chance, EL.probabilidade, 'chance'), s(d.efeito, 200),
        valida(d.recomendacao, EL.recomendacaoRec, 'recomendacao'), s(d.fundamento, 4000), nowISO());
    return um('SELECT * FROM appeal_options WHERE id = ?', id);
  },
  decidirRecurso(id, { recomendacao, fundamento } = {}, quem) {
    const r = um('SELECT * FROM appeal_options WHERE id = ?', id);
    if (!r) throw new Error('Opção recursal não encontrada.');
    const rec = valida(recomendacao, EL.recomendacaoRec, 'recomendacao');
    if (rec === 'a_decidir') throw new Error('Escolha interpor ou não interpor.');
    db.prepare('UPDATE appeal_options SET recomendacao = ?, fundamento = ?, decidido_por = ? WHERE id = ?')
      .run(rec, s(fundamento, 4000) || r.fundamento, s(quem, 120), id);
    return um('SELECT * FROM appeal_options WHERE id = ?', id);
  },
  // 30.6 registro das tratativas (confidencial por padrão — 30.9)
  addNegociacao(d = {}, quem) {
    if (!s(d.case_id) && !s(d.contract_id)) throw new Error('Informe o processo ou o contrato da tratativa.');
    const id = novoId();
    db.prepare(`INSERT INTO negotiation_rounds (id, case_id, contract_id, rodada, ponto, posicao_nossa,
      posicao_contraria, resultado, confidencial, quem, quando) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, s(d.case_id, 40), s(d.contract_id, 40), Math.max(1, int(d.rodada, 1)), s(d.ponto, 1000),
        s(d.posicao_nossa, 4000), s(d.posicao_contraria, 4000), valida(d.resultado, EL.resultadoNeg, 'resultado'),
        d.confidencial === undefined ? 1 : bool(d.confidencial), s(quem, 120), nowISO());
    return um('SELECT * FROM negotiation_rounds WHERE id = ?', id);
  },
  negociacoes({ case_id = '', contract_id = '' } = {}) {
    if (case_id) return todos('SELECT * FROM negotiation_rounds WHERE case_id = ? ORDER BY rodada, quando', case_id);
    if (contract_id) return todos('SELECT * FROM negotiation_rounds WHERE contract_id = ? ORDER BY rodada, quando', contract_id);
    return todos('SELECT * FROM negotiation_rounds ORDER BY quando DESC LIMIT 100');
  },
};

// ------------------------------------------ MATRIZ DE FATOS (Cap. 5.6)
const Fatos = {
  listar(case_id) { return todos('SELECT * FROM fact_matrix WHERE case_id = ? ORDER BY situacao, criado_em', case_id); },
  criar(case_id, d = {}) {
    exigeCaso(case_id);
    const situacao = valida(d.situacao, EL.situacaoFato, 'situacao');
    // 5.6: fato só é "comprovado" se apontar a prova/documento que o sustenta
    if (situacao === 'comprovado' && !s(d.fonte) && !s(d.document_id)) {
      throw new Error('Fato comprovado exige a fonte (documento/fls. dos autos) — Cap. 5.6.');
    }
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO fact_matrix (id, case_id, fato, situacao, fonte, document_id, quem_alega, observacao, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, case_id, s(d.fato, 4000), situacao, s(d.fonte, 500), s(d.document_id, 40),
        s(d.quem_alega, 120), s(d.observacao, 2000), agora, agora);
    return um('SELECT * FROM fact_matrix WHERE id = ?', id);
  },
  atualizar(id, d = {}) {
    const f = um('SELECT * FROM fact_matrix WHERE id = ?', id);
    if (!f) throw new Error('Fato não encontrado.');
    const c = {};
    for (const [k, max] of [['fato', 4000], ['fonte', 500], ['document_id', 40], ['quem_alega', 120], ['observacao', 2000]]) {
      if (d[k] !== undefined) c[k] = s(d[k], max);
    }
    if (d.situacao !== undefined) {
      c.situacao = valida(d.situacao, EL.situacaoFato, 'situacao');
      const fonte = c.fonte !== undefined ? c.fonte : f.fonte;
      const doc = c.document_id !== undefined ? c.document_id : f.document_id;
      if (c.situacao === 'comprovado' && !fonte && !doc) throw new Error('Fato comprovado exige a fonte (Cap. 5.6).');
    }
    patch('fact_matrix', id, c);
    return um('SELECT * FROM fact_matrix WHERE id = ?', id);
  },
  remover(id) { return db.prepare('DELETE FROM fact_matrix WHERE id = ?').run(id).changes; },
};

// ----------------------------------------- MATRIZ DE PROVAS (Cap. 24)
const Provas = {
  listar(case_id) {
    return todos(`SELECT e.*, f.fato FROM evidence_matrix e LEFT JOIN fact_matrix f ON f.id = e.fato_id
      WHERE e.case_id = ? ORDER BY e.situacao, e.criado_em`, case_id);
  },
  criar(case_id, d = {}) {
    exigeCaso(case_id);
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO evidence_matrix (id, case_id, fato_id, prova, tipo, document_id, produzida_por,
      pedido_vinculado, autenticidade, cadeia_custodia, contradicao, situacao, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, case_id, s(d.fato_id, 40), s(d.prova, 2000), valida(d.tipo, EL.tipoProva, 'tipo'),
        s(d.document_id, 40), s(d.produzida_por, 120), s(d.pedido_vinculado, 1000),
        s(d.autenticidade, 1000), s(d.cadeia_custodia, 2000), s(d.contradicao, 2000),
        valida(d.situacao, EL.situacaoProva, 'situacao'), agora, agora);
    return um('SELECT * FROM evidence_matrix WHERE id = ?', id);
  },
  atualizar(id, d = {}) {
    if (!um('SELECT id FROM evidence_matrix WHERE id = ?', id)) throw new Error('Prova não encontrada.');
    const c = {};
    for (const [k, max] of [['fato_id', 40], ['prova', 2000], ['document_id', 40], ['produzida_por', 120],
      ['pedido_vinculado', 1000], ['autenticidade', 1000], ['cadeia_custodia', 2000], ['contradicao', 2000]]) {
      if (d[k] !== undefined) c[k] = s(d[k], max);
    }
    if (d.tipo !== undefined) c.tipo = valida(d.tipo, EL.tipoProva, 'tipo');
    if (d.situacao !== undefined) c.situacao = valida(d.situacao, EL.situacaoProva, 'situacao');
    patch('evidence_matrix', id, c);
    return um('SELECT * FROM evidence_matrix WHERE id = ?', id);
  },
  remover(id) { return db.prepare('DELETE FROM evidence_matrix WHERE id = ?').run(id).changes; },
  // 24.1: fato controvertido sem prova vinculada é o furo clássico — a tela mostra
  lacunas(case_id) {
    return todos(`SELECT f.* FROM fact_matrix f
      WHERE f.case_id = ? AND f.situacao IN ('controvertido','alegado')
        AND NOT EXISTS (SELECT 1 FROM evidence_matrix e WHERE e.fato_id = f.id)
      ORDER BY f.situacao`, case_id);
  },
};

// -------------------------------- DIAGNÓSTICO DO PROCESSO (Cap. 21.9)
const Diagnostico = {
  listar(case_id) { return todos('SELECT * FROM case_diagnostics WHERE case_id = ? ORDER BY criado_em DESC', case_id); },
  criar(case_id, d = {}, quem) {
    exigeCaso(case_id);
    const id = novoId(), agora = nowISO();
    const origem = d.origem === 'ia' ? 'ia' : 'humano';
    db.prepare(`INSERT INTO case_diagnostics (id, case_id, cronologia, pecas_relevantes, alegacoes,
      pedidos_fundamentos, preliminares, controvertidos, riscos_lacunas, origem, status, validado_por,
      validado_em, criado_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,'rascunho','','',?,?,?)`)
      .run(id, case_id, s(d.cronologia, 20000), s(d.pecas_relevantes, 8000), s(d.alegacoes, 8000),
        s(d.pedidos_fundamentos, 8000), s(d.preliminares, 4000), s(d.controvertidos, 4000),
        s(d.riscos_lacunas, 4000), origem, s(quem, 120), agora, agora);
    return um('SELECT * FROM case_diagnostics WHERE id = ?', id);
  },
  atualizar(id, d = {}) {
    const g = um('SELECT * FROM case_diagnostics WHERE id = ?', id);
    if (!g) throw new Error('Diagnóstico não encontrado.');
    const c = {};
    for (const k of ['cronologia', 'pecas_relevantes', 'alegacoes', 'pedidos_fundamentos', 'preliminares', 'controvertidos', 'riscos_lacunas']) {
      if (d[k] !== undefined) c[k] = s(d[k], 20000);
    }
    // editar o conteúdo derruba a validação anterior (o que foi validado foi o texto antigo)
    if (Object.keys(c).length && g.status === 'validado') { c.status = 'rascunho'; c.validado_por = ''; c.validado_em = ''; }
    patch('case_diagnostics', id, c);
    return um('SELECT * FROM case_diagnostics WHERE id = ?', id);
  },
  // 21.9 + 6.9: diagnóstico de IA é MINUTA até revisão humana significativa
  validar(id, quem) {
    const g = um('SELECT * FROM case_diagnostics WHERE id = ?', id);
    if (!g) throw new Error('Diagnóstico não encontrado.');
    if (!s(quem)) throw new Error('Validação exige usuário identificado.');
    patch('case_diagnostics', id, { status: 'validado', validado_por: s(quem, 120), validado_em: nowISO() });
    return um('SELECT * FROM case_diagnostics WHERE id = ?', id);
  },
};

module.exports = { Estrategia, Fatos, Provas, Diagnostico };
