// =====================================================================
// ONDA LIVRO · 47.10 SISTEMA FINANCEIRO (Cap. 38) + 37.5 horas/capacidade
// Contratos de honorários por modalidade (38.2), apontamento de horas
// (37.5), faturamento (38.3), contas a receber (38.4), cobrança
// ESCALONADA (38.5), reembolsáveis (38.6), fluxo de caixa (38.7),
// orçamento (38.9) e rentabilidade por cliente/processo (38.10).
//
// Trava do 47.10: "cobrança a partir do segundo aviso" exige aprovação
// humana. O 1º nível é lembrete; do 2º em diante, ninguém envia sem
// aprovação nominal.
// =====================================================================
'use strict';
const B = require('../repo-livro');
const { EL, s, cent, int, bool, valida, hoje, maisDias, patch, um, todos, novoId, nowISO, j, db } = B;

// ------------------------------------------ HONORÁRIOS (38.1/38.2/17.6)
const Honorarios = {
  listar({ client_id = '', status = '', n = 200 } = {}) {
    let sql = `SELECT f.*, c.nome cliente FROM fee_agreements f LEFT JOIN clients c ON c.id = f.client_id`, w = [], a = [];
    if (client_id) { w.push('f.client_id = ?'); a.push(client_id); }
    if (status) { w.push('f.status = ?'); a.push(status); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY f.criado_em DESC LIMIT ?'; a.push(Math.min(int(n, 200), 500));
    return todos(sql, ...a);
  },
  criar(d = {}, quem) {
    if (!um('SELECT id FROM clients WHERE id = ?', s(d.client_id, 40))) throw new Error('Cliente não encontrado.');
    const modalidade = valida(d.modalidade, EL.modalidadeHon, 'modalidade');
    if (modalidade === 'hora' && !cent(d.valor_hora_centavos)) throw new Error('Honorário por hora exige o valor da hora.');
    if (modalidade === 'exito' && !Number(d.percentual_exito)) throw new Error('Honorário de êxito exige o percentual.');
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO fee_agreements (id, client_id, case_id, modalidade, valor_centavos, valor_hora_centavos,
      percentual_exito, parcelas, dia_vencimento, reajuste, inicio, fim, reembolsaveis, status, contract_id, observacoes, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, s(d.client_id, 40), s(d.case_id, 40), modalidade, cent(d.valor_centavos), cent(d.valor_hora_centavos),
        Number(d.percentual_exito || 0), Math.max(1, int(d.parcelas, 1)), Math.min(28, Math.max(1, int(d.dia_vencimento, 10))),
        s(d.reajuste, 200), s(d.inicio, 20), s(d.fim, 20), s(d.reembolsaveis, 2000),
        valida(d.status, EL.statusFee, 'status'), s(d.contract_id, 40), s(d.observacoes, 2000), agora, agora);
    return um('SELECT * FROM fee_agreements WHERE id = ?', id);
  },
  atualizar(id, d = {}) {
    if (!um('SELECT id FROM fee_agreements WHERE id = ?', id)) throw new Error('Contrato de honorários não encontrado.');
    const c = {};
    for (const [k, max] of [['case_id', 40], ['reajuste', 200], ['inicio', 20], ['fim', 20], ['reembolsaveis', 2000], ['observacoes', 2000], ['contract_id', 40]]) {
      if (d[k] !== undefined) c[k] = s(d[k], max);
    }
    if (d.modalidade !== undefined) c.modalidade = valida(d.modalidade, EL.modalidadeHon, 'modalidade');
    if (d.status !== undefined) c.status = valida(d.status, EL.statusFee, 'status');
    for (const k of ['valor_centavos', 'valor_hora_centavos']) if (d[k] !== undefined) c[k] = cent(d[k]);
    if (d.percentual_exito !== undefined) c.percentual_exito = Number(d.percentual_exito || 0);
    if (d.parcelas !== undefined) c.parcelas = Math.max(1, int(d.parcelas, 1));
    if (d.dia_vencimento !== undefined) c.dia_vencimento = Math.min(28, Math.max(1, int(d.dia_vencimento, 10)));
    patch('fee_agreements', id, c);
    return um('SELECT * FROM fee_agreements WHERE id = ?', id);
  },
};

// --------------------------------------------- APONTAMENTO DE HORAS (37.5)
const Horas = {
  listar({ user_id = '', case_id = '', client_id = '', de = '', ate = '', faturavel = '', n = 500 } = {}) {
    let sql = 'SELECT * FROM time_entries', w = [], a = [];
    if (user_id) { w.push('user_id = ?'); a.push(user_id); }
    if (case_id) { w.push('case_id = ?'); a.push(case_id); }
    if (client_id) { w.push('client_id = ?'); a.push(client_id); }
    if (de) { w.push('data >= ?'); a.push(de); }
    if (ate) { w.push('data <= ?'); a.push(ate); }
    if (faturavel !== '') { w.push('faturavel = ?'); a.push(bool(faturavel)); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY data DESC, criado_em DESC LIMIT ?'; a.push(Math.min(int(n, 500), 2000));
    return todos(sql, ...a);
  },
  criar(d = {}, user) {
    const minutos = int(d.minutos, 0);
    if (minutos <= 0 || minutos > 24 * 60) throw new Error('Informe os minutos apontados (1 a 1440).');
    if (!s(d.atividade)) throw new Error('Descreva a atividade — sem descrição a hora não é faturável nem auditável.');
    // valor da hora: o informado, senão o do contrato de honorários por hora do caso/cliente
    let vh = cent(d.valor_hora_centavos);
    if (!vh) {
      const fee = um(`SELECT valor_hora_centavos FROM fee_agreements WHERE status = 'ativo' AND modalidade IN ('hora','misto')
        AND (case_id = ? OR (case_id = '' AND client_id = ?)) ORDER BY case_id DESC LIMIT 1`, s(d.case_id, 40), s(d.client_id, 40));
      vh = fee ? fee.valor_hora_centavos : 0;
    }
    const id = novoId();
    db.prepare(`INSERT INTO time_entries (id, user_id, quem, case_id, client_id, data, minutos, atividade,
      faturavel, valor_hora_centavos, invoice_id, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,'',?)`)
      .run(id, s((user && user.id) || d.user_id, 40), s((user && (user.nome || user.email)) || d.quem, 120),
        s(d.case_id, 40), s(d.client_id, 40), s(d.data, 20) || hoje(), minutos, s(d.atividade, 1000),
        d.faturavel === undefined ? 1 : bool(d.faturavel), vh, nowISO());
    return um('SELECT * FROM time_entries WHERE id = ?', id);
  },
  remover(id) {
    const t = um('SELECT * FROM time_entries WHERE id = ?', id);
    if (t && t.invoice_id) throw new Error('Hora já faturada — cancele a fatura antes de excluir o apontamento.');
    return db.prepare('DELETE FROM time_entries WHERE id = ?').run(id).changes;
  },
  // 37.6/37.7 capacidade e sobrecarga: horas por pessoa no período + carteira
  capacidade({ de = '', ate = '' } = {}) {
    const d0 = de || maisDias(-30), d1 = ate || hoje();
    const porPessoa = todos(`SELECT user_id, quem, SUM(minutos) minutos,
        SUM(CASE WHEN faturavel = 1 THEN minutos ELSE 0 END) minutos_faturaveis, COUNT(*) lancamentos
      FROM time_entries WHERE data >= ? AND data <= ? GROUP BY user_id, quem ORDER BY minutos DESC`, d0, d1);
    const carteira = todos(`SELECT advogado_resp user_id, COUNT(*) processos FROM cases
      WHERE status = 'ativo' GROUP BY advogado_resp ORDER BY processos DESC`);
    const mapa = new Map(carteira.map(c => [c.user_id, c.processos]));
    return {
      periodo: { de: d0, ate: d1 },
      pessoas: porPessoa.map(p => ({
        ...p, horas: Math.round(p.minutos / 6) / 10, horas_faturaveis: Math.round(p.minutos_faturaveis / 6) / 10,
        aproveitamento_pct: p.minutos ? Math.round((p.minutos_faturaveis / p.minutos) * 100) : 0,
        processos: mapa.get(p.user_id) || 0,
      })),
      sem_apontamento: carteira.filter(c => c.user_id && !porPessoa.some(p => p.user_id === c.user_id)),
    };
  },
};

// -------------------------------------------- FATURAMENTO (38.3/38.4)
const Faturas = {
  listar({ status = '', client_id = '', competencia = '', n = 300 } = {}) {
    let sql = 'SELECT i.*, c.nome cliente FROM invoices i LEFT JOIN clients c ON c.id = i.client_id', w = [], a = [];
    if (status) { w.push('i.status = ?'); a.push(status); }
    if (client_id) { w.push('i.client_id = ?'); a.push(client_id); }
    if (competencia) { w.push('i.competencia = ?'); a.push(competencia); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY i.vencimento DESC, i.criado_em DESC LIMIT ?'; a.push(Math.min(int(n, 300), 800));
    return todos(sql, ...a).map(i => ({ ...i, itens: j.parse(i.itens, []) }));
  },
  obter(id) {
    const i = um('SELECT * FROM invoices WHERE id = ?', id);
    if (!i) return null;
    i.itens = j.parse(i.itens, []);
    i.horas = todos('SELECT * FROM time_entries WHERE invoice_id = ? ORDER BY data', id);
    i.cobrancas = todos('SELECT * FROM collection_actions WHERE invoice_id = ? ORDER BY nivel, criado_em', id);
    return i;
  },
  criar(d = {}, quem) {
    if (!um('SELECT id FROM clients WHERE id = ?', s(d.client_id, 40))) throw new Error('Cliente não encontrado.');
    const itens = (Array.isArray(d.itens) ? d.itens : []).map(it => ({
      descricao: s(it.descricao, 300), quantidade: Number(it.quantidade || 1),
      valor_centavos: cent(it.valor_centavos), tipo: s(it.tipo, 40) || 'honorario',
    }));
    const total = d.valor_centavos !== undefined ? cent(d.valor_centavos)
      : itens.reduce((acc, it) => acc + Math.round(it.valor_centavos * (it.quantidade || 1)), 0);
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO invoices (id, numero, client_id, case_id, competencia, itens, valor_centavos,
      emitida_em, vencimento, status, pago_centavos, pago_em, nota_fiscal, observacoes, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,0,'',?,?,?,?)`)
      .run(id, s(d.numero, 40), s(d.client_id, 40), s(d.case_id, 40), s(d.competencia, 7) || hoje().slice(0, 7),
        j.str(itens), total, s(d.emitida_em, 20), s(d.vencimento, 20),
        valida(d.status, EL.statusInvoice, 'status'), s(d.nota_fiscal, 60), s(d.observacoes, 2000), agora, agora);
    return Faturas.obter(id);
  },
  // 38.3: fatura por horas — puxa os apontamentos faturáveis ainda não faturados
  deHoras({ client_id, case_id = '', de = '', ate = '', competencia = '', vencimento = '' } = {}) {
    if (!um('SELECT id FROM clients WHERE id = ?', s(client_id, 40))) throw new Error('Cliente não encontrado.');
    let sql = "SELECT * FROM time_entries WHERE faturavel = 1 AND invoice_id = '' AND client_id = ?";
    const a = [s(client_id, 40)];
    if (case_id) { sql += ' AND case_id = ?'; a.push(case_id); }
    if (de) { sql += ' AND data >= ?'; a.push(de); }
    if (ate) { sql += ' AND data <= ?'; a.push(ate); }
    const horas = todos(sql, ...a);
    if (!horas.length) throw new Error('Nenhuma hora faturável em aberto para este cliente/período.');
    const semValor = horas.filter(h => !h.valor_hora_centavos);
    if (semValor.length) throw new Error(`${semValor.length} apontamento(s) sem valor/hora — defina o contrato de honorários por hora antes de faturar.`);
    // um item por apontamento, com o valor JÁ total da entrada (quantidade 1)
    const itens = horas.map(h => ({
      descricao: `${h.data} · ${h.quem} · ${Math.round(h.minutos / 6) / 10}h · ${h.atividade}`.slice(0, 300),
      quantidade: 1,
      valor_centavos: Math.round(h.valor_hora_centavos * (h.minutos / 60)),
      tipo: 'hora',
    }));
    const fatura = Faturas.criar({
      client_id, case_id, competencia: competencia || hoje().slice(0, 7), vencimento: vencimento || maisDias(10),
      itens, status: 'rascunho',
      observacoes: `Fatura gerada de ${horas.length} apontamento(s) de hora (Cap. 38.2/38.3).`,
    });
    const marca = db.prepare('UPDATE time_entries SET invoice_id = ? WHERE id = ?');
    for (const h of horas) marca.run(fatura.id, h.id);
    return Faturas.obter(fatura.id);
  },
  atualizar(id, d = {}) {
    const i = um('SELECT * FROM invoices WHERE id = ?', id);
    if (!i) throw new Error('Fatura não encontrada.');
    const c = {};
    for (const [k, max] of [['numero', 40], ['case_id', 40], ['competencia', 7], ['emitida_em', 20],
      ['vencimento', 20], ['nota_fiscal', 60], ['observacoes', 2000]]) if (d[k] !== undefined) c[k] = s(d[k], max);
    if (d.itens !== undefined) {
      const itens = (Array.isArray(d.itens) ? d.itens : []).map(it => ({
        descricao: s(it.descricao, 300), quantidade: Number(it.quantidade || 1),
        valor_centavos: cent(it.valor_centavos), tipo: s(it.tipo, 40) || 'honorario',
      }));
      c.itens = j.str(itens);
      c.valor_centavos = itens.reduce((acc, it) => acc + Math.round(it.valor_centavos * (it.quantidade || 1)), 0);
    }
    if (d.valor_centavos !== undefined) c.valor_centavos = cent(d.valor_centavos);
    if (d.status !== undefined) c.status = valida(d.status, EL.statusInvoice, 'status');
    if (d.pago_centavos !== undefined) {
      c.pago_centavos = cent(d.pago_centavos);
      const total = c.valor_centavos !== undefined ? c.valor_centavos : i.valor_centavos;
      if (c.pago_centavos >= total && total > 0) { c.status = 'paga'; c.pago_em = s(d.pago_em, 20) || hoje(); }
      else if (c.pago_centavos > 0) c.status = 'parcial';
    }
    patch('invoices', id, c);
    return Faturas.obter(id);
  },
  // rotina: vencido e não pago vira inadimplente (38.5)
  marcarInadimplentes() {
    return db.prepare(`UPDATE invoices SET status = 'inadimplente', atualizado_em = ?
      WHERE status IN ('emitida','enviada','parcial') AND vencimento != '' AND vencimento < ?`)
      .run(nowISO(), hoje()).changes;
  },
};

// ------------------------------------------------- COBRANÇA (38.5 / 47.10)
const Cobranca = {
  criar(invoice_id, d = {}, quem) {
    const i = um('SELECT * FROM invoices WHERE id = ?', invoice_id);
    if (!i) throw new Error('Fatura não encontrada.');
    const nivel = Math.max(1, int(d.nivel, (um('SELECT COUNT(*) n FROM collection_actions WHERE invoice_id = ?', invoice_id).n) + 1));
    const id = novoId();
    db.prepare(`INSERT INTO collection_actions (id, invoice_id, nivel, canal, texto, status, aprovada_por, enviada_em, resultado, criado_em)
      VALUES (?,?,?,?,?,'rascunho','','','',?)`)
      .run(id, invoice_id, nivel, valida(d.canal, EL.canalCobranca, 'canal'), s(d.texto, 8000), nowISO());
    return um('SELECT * FROM collection_actions WHERE id = ?', id);
  },
  aprovar(id, quem) {
    const c = um('SELECT * FROM collection_actions WHERE id = ?', id);
    if (!c) throw new Error('Ação de cobrança não encontrada.');
    if (!s(quem)) throw new Error('Aprovação exige usuário identificado.');
    patch('collection_actions', id, { status: 'aprovada', aprovada_por: s(quem, 120) });
    return um('SELECT * FROM collection_actions WHERE id = ?', id);
  },
  // TRAVA DO LIVRO (47.10): do 2º aviso em diante não sai sem aprovação humana.
  marcarEnviada(id, quem) {
    const c = um('SELECT * FROM collection_actions WHERE id = ?', id);
    if (!c) throw new Error('Ação de cobrança não encontrada.');
    if (c.status === 'enviada') throw new Error('Esta cobrança já foi registrada como enviada.');
    if (c.nivel >= 2 && (c.status !== 'aprovada' || !s(c.aprovada_por))) {
      throw new Error('Cobrança de nível 2 ou superior exige aprovação humana antes do envio (Cap. 38.5 / 47.10).');
    }
    db.prepare('UPDATE collection_actions SET status = \'enviada\', enviada_em = ? WHERE id = ?').run(nowISO(), id);
    return um('SELECT * FROM collection_actions WHERE id = ?', id);
  },
  registrarResultado(id, resultado) {
    if (!um('SELECT id FROM collection_actions WHERE id = ?', id)) throw new Error('Ação de cobrança não encontrada.');
    db.prepare('UPDATE collection_actions SET resultado = ? WHERE id = ?').run(s(resultado, 1000), id);
    return um('SELECT * FROM collection_actions WHERE id = ?', id);
  },
  fila() {
    return todos(`SELECT a.*, i.valor_centavos, i.vencimento, c.nome cliente FROM collection_actions a
      JOIN invoices i ON i.id = a.invoice_id LEFT JOIN clients c ON c.id = i.client_id
      WHERE a.status IN ('rascunho','aprovada') ORDER BY a.nivel DESC, a.criado_em`);
  },
};

// ---------------------------------------------- ORÇAMENTO (38.9 / 39.3)
const Orcamento = {
  listar({ competencia = '' } = {}) {
    const w = competencia ? ' WHERE competencia = ?' : '';
    const a = competencia ? [competencia] : [];
    return todos('SELECT * FROM budget_entries' + w + ' ORDER BY competencia DESC, natureza, categoria', ...a);
  },
  salvar(d = {}) {
    const competencia = s(d.competencia, 7), categoria = s(d.categoria, 120);
    if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error('Competência no formato AAAA-MM.');
    if (!categoria) throw new Error('Informe a categoria.');
    const natureza = valida(d.natureza, EL.natureza, 'natureza');
    const centro = s(d.centro_custo, 120);
    const agora = nowISO();
    const existe = um('SELECT id FROM budget_entries WHERE competencia = ? AND categoria = ? AND natureza = ? AND centro_custo = ?',
      competencia, categoria, natureza, centro);
    if (existe) {
      patch('budget_entries', existe.id, {
        previsto_centavos: d.previsto_centavos !== undefined ? cent(d.previsto_centavos) : undefined,
        realizado_centavos: d.realizado_centavos !== undefined ? cent(d.realizado_centavos) : undefined,
        observacao: d.observacao !== undefined ? s(d.observacao, 1000) : undefined,
      });
      return um('SELECT * FROM budget_entries WHERE id = ?', existe.id);
    }
    const id = novoId();
    db.prepare(`INSERT INTO budget_entries (id, competencia, categoria, natureza, previsto_centavos,
      realizado_centavos, centro_custo, observacao, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, competencia, categoria, natureza, cent(d.previsto_centavos), cent(d.realizado_centavos),
        centro, s(d.observacao, 1000), agora, agora);
    return um('SELECT * FROM budget_entries WHERE id = ?', id);
  },
  remover(id) { return db.prepare('DELETE FROM budget_entries WHERE id = ?').run(id).changes; },
};

// ------------------------------- PAINEL FINANCEIRO (38.7 fluxo · 38.10)
const PainelFin = {
  // 38.7 fluxo de caixa projetado: a receber (faturas) × a pagar (financeiro
  // jurídico já existente, tipos de despesa) nos próximos meses.
  fluxo({ meses = 6 } = {}) {
    const n = Math.min(Math.max(int(meses, 6), 1), 12);
    const linhas = [];
    const base = new Date(hoje() + 'T12:00:00Z');
    for (let k = 0; k < n; k++) {
      const d = new Date(base); d.setUTCMonth(d.getUTCMonth() + k);
      const comp = d.toISOString().slice(0, 7);
      const receber = um(`SELECT COALESCE(SUM(valor_centavos - pago_centavos),0) v FROM invoices
        WHERE status IN ('emitida','enviada','parcial','inadimplente') AND substr(vencimento,1,7) = ?`, comp).v;
      // financial_accounts guarda o valor na coluna `valor` (centavos, com sinal)
      const pagar = um(`SELECT COALESCE(SUM(ABS(valor)),0) v FROM financial_accounts
        WHERE status IN ('previsto','faturado') AND tipo IN ('custas','diligencia','despesa','repasse')
          AND substr(vencimento,1,7) = ?`, comp).v;
      linhas.push({ competencia: comp, receber, pagar, saldo: receber - pagar });
    }
    return linhas;
  },
  resumo() {
    const h = hoje();
    const inad = um("SELECT COUNT(*) n, COALESCE(SUM(valor_centavos - pago_centavos),0) v FROM invoices WHERE status = 'inadimplente'");
    const aReceber = um("SELECT COALESCE(SUM(valor_centavos - pago_centavos),0) v FROM invoices WHERE status IN ('emitida','enviada','parcial')");
    const recebido30 = um("SELECT COALESCE(SUM(pago_centavos),0) v FROM invoices WHERE status IN ('paga','parcial') AND pago_em >= ?", maisDias(-30));
    // 38.4 prazo médio de recebimento (dias entre vencimento e pagamento)
    const pagas = todos("SELECT vencimento, pago_em FROM invoices WHERE status = 'paga' AND vencimento != '' AND pago_em != '' ORDER BY pago_em DESC LIMIT 100");
    const pmr = pagas.length
      ? Math.round(pagas.reduce((acc, p) => acc + (new Date(p.pago_em) - new Date(p.vencimento)) / 864e5, 0) / pagas.length)
      : 0;
    return {
      a_receber: aReceber.v, inadimplencia_valor: inad.v, inadimplencia_qtd: inad.n,
      recebido_30d: recebido30.v, prazo_medio_recebimento_dias: pmr,
      cobrancas_aguardando_aprovacao: um("SELECT COUNT(*) n FROM collection_actions WHERE status = 'rascunho' AND nivel >= 2").n,
      horas_nao_faturadas: um("SELECT COALESCE(SUM(minutos),0) m FROM time_entries WHERE faturavel = 1 AND invoice_id = ''").m,
      faturas_vencendo_7d: um("SELECT COUNT(*) n FROM invoices WHERE status IN ('emitida','enviada') AND vencimento != '' AND vencimento <= ?", maisDias(7)).n,
    };
  },
  // 38.10 rentabilidade por cliente: faturado/recebido × horas × despesas
  rentabilidade({ de = '', ate = '' } = {}) {
    const d0 = de || maisDias(-365), d1 = ate || hoje();
    const clientes = todos(`SELECT c.id, c.nome,
        (SELECT COALESCE(SUM(valor_centavos),0) FROM invoices i WHERE i.client_id = c.id AND i.criado_em >= ? AND i.criado_em <= ?) faturado,
        (SELECT COALESCE(SUM(pago_centavos),0) FROM invoices i WHERE i.client_id = c.id AND i.criado_em >= ? AND i.criado_em <= ?) recebido,
        (SELECT COALESCE(SUM(minutos),0) FROM time_entries t WHERE t.client_id = c.id AND t.data >= ? AND t.data <= ?) minutos,
        (SELECT COALESCE(SUM(ABS(valor)),0) FROM financial_accounts f WHERE f.client_id = c.id
           AND f.tipo IN ('custas','diligencia','despesa') AND f.status IN ('pago','faturado')) despesas
      FROM clients c ORDER BY faturado DESC LIMIT 100`, d0, d1 + 'T23:59', d0, d1 + 'T23:59', d0, d1);
    return {
      periodo: { de: d0, ate: d1 },
      clientes: clientes.filter(c => c.faturado || c.minutos || c.despesas).map(c => ({
        ...c, horas: Math.round(c.minutos / 6) / 10,
        margem: c.recebido - c.despesas,
        valor_hora_efetivo: c.minutos ? Math.round(c.recebido / (c.minutos / 60)) : 0,
      })),
    };
  },
};

module.exports = { Honorarios, Horas, Faturas, Cobranca, Orcamento, PainelFin };
