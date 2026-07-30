// =====================================================================
// ONDA LIVRO · 47.9 SISTEMA DE CONTRATOS — ciclo completo (Cap. 29)
// O wizard de minutas e a análise por IA já existiam (contratos.js). Aqui
// entra o que faltava para o ciclo do livro: o CONTRATO como entidade,
// biblioteca de cláusulas em TRÊS NÍVEIS (29.3), aprovação por ALÇADA
// (29.9) e gestão de OBRIGAÇÕES com alerta de renovação/denúncia (29.11).
//
// Trava do 47.9: "aprovação por alçada antes da assinatura".
// =====================================================================
'use strict';
const B = require('../repo-livro');
const { EL, s, cent, int, bool, valida, hoje, maisDias, patch, um, todos, novoId, nowISO, db } = B;

// ---------------------------------------------------- CLÁUSULAS (29.3)
const Clausulas = {
  listar({ tema = '', nivel = '', area = '', n = 300 } = {}) {
    let sql = 'SELECT * FROM clause_library', w = [], a = [];
    if (tema) { w.push('tema LIKE ?'); a.push(`%${tema}%`); }
    if (nivel) { w.push('nivel = ?'); a.push(nivel); }
    if (area) { w.push('area = ?'); a.push(area); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += " ORDER BY tema, CASE nivel WHEN 'preferencial' THEN 1 WHEN 'aceitavel' THEN 2 ELSE 3 END LIMIT ?";
    a.push(Math.min(int(n, 300), 600));
    return todos(sql, ...a);
  },
  // 29.6 comparação com o padrão: agrupa por tema os três níveis
  porTema(tema) {
    const lista = Clausulas.listar({ tema, n: 50 });
    return {
      tema, preferencial: lista.filter(c => c.nivel === 'preferencial'),
      aceitavel: lista.filter(c => c.nivel === 'aceitavel'),
      inaceitavel: lista.filter(c => c.nivel === 'inaceitavel'),
    };
  },
  criar(d = {}, quem) {
    const id = novoId(), agora = nowISO();
    const nivel = valida(d.nivel, EL.nivelClausula, 'nivel');
    // 29.3: cláusula "inaceitável" só serve se disser POR QUE é inaceitável
    if (nivel === 'inaceitavel' && !s(d.justificativa)) {
      throw new Error('Cláusula inaceitável exige justificativa (o negociador precisa saber o porquê) — Cap. 29.3.');
    }
    db.prepare(`INSERT INTO clause_library (id, area, tema, nivel, texto, justificativa, risco, fallback, criado_por, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, s(d.area, 60), s(d.tema, 200), nivel, s(d.texto, 20000), s(d.justificativa, 4000),
        s(d.risco, 20), s(d.fallback, 8000), s(quem, 120), agora, agora);
    return um('SELECT * FROM clause_library WHERE id = ?', id);
  },
  atualizar(id, d = {}) {
    if (!um('SELECT id FROM clause_library WHERE id = ?', id)) throw new Error('Cláusula não encontrada.');
    const c = {};
    for (const [k, max] of [['area', 60], ['tema', 200], ['texto', 20000], ['justificativa', 4000], ['risco', 20], ['fallback', 8000]]) {
      if (d[k] !== undefined) c[k] = s(d[k], max);
    }
    if (d.nivel !== undefined) c.nivel = valida(d.nivel, EL.nivelClausula, 'nivel');
    patch('clause_library', id, c);
    return um('SELECT * FROM clause_library WHERE id = ?', id);
  },
  remover(id) { return db.prepare('DELETE FROM clause_library WHERE id = ?').run(id).changes; },
};

// ------------------------------------------------ CONTRATOS (ciclo 29.1)
const ORDEM = ['solicitado', 'minuta', 'negociacao', 'aprovacao', 'assinatura', 'vigente', 'encerrado', 'rescindido'];

const Contratos = {
  listar({ status = '', client_id = '', busca = '', n = 200 } = {}) {
    let sql = 'SELECT * FROM contract_records', w = [], a = [];
    if (status) { w.push('status = ?'); a.push(status); }
    if (client_id) { w.push('client_id = ?'); a.push(client_id); }
    if (busca) { w.push('(titulo LIKE ? OR contraparte LIKE ?)'); const b = `%${busca}%`; a.push(b, b); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY atualizado_em DESC LIMIT ?'; a.push(Math.min(int(n, 200), 500));
    return todos(sql, ...a).map(c => ({
      ...c,
      obrigacoes_pendentes: um("SELECT COUNT(*) n FROM contract_obligations WHERE contract_id = ? AND status = 'pendente'", c.id).n,
      aprovacao_pendente: um("SELECT COUNT(*) n FROM contract_approvals WHERE contract_id = ? AND decisao = 'pendente'", c.id).n,
    }));
  },
  obter(id) {
    const c = um('SELECT * FROM contract_records WHERE id = ?', id);
    if (!c) return null;
    c.aprovacoes = todos('SELECT * FROM contract_approvals WHERE contract_id = ? ORDER BY criado_em', id);
    c.obrigacoes = todos('SELECT * FROM contract_obligations WHERE contract_id = ? ORDER BY data_limite', id);
    c.negociacao = todos('SELECT * FROM negotiation_rounds WHERE contract_id = ? ORDER BY rodada, quando', id);
    return c;
  },
  criar(d = {}, quem) {
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO contract_records (id, titulo, client_id, contraparte, tipo, objeto, valor_centavos,
      vigencia_inicio, vigencia_fim, renovacao_automatica, aviso_previo_dias, alcada, status, draft_id,
      document_id, responsavel, risco, assinado_em, encerrado_em, observacoes, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'','',?,?,?)`)
      .run(id, s(d.titulo, 300), s(d.client_id, 40), s(d.contraparte, 300), valida(d.tipo, EL.tipoContrato, 'tipo'),
        s(d.objeto, 4000), cent(d.valor_centavos), s(d.vigencia_inicio, 20), s(d.vigencia_fim, 20),
        bool(d.renovacao_automatica), int(d.aviso_previo_dias, 30), valida(d.alcada, EL.alcada, 'alcada'),
        valida(d.status, EL.statusContrato, 'status'), s(d.draft_id, 40), s(d.document_id, 40),
        s(d.responsavel, 120) || s(quem, 120), s(d.risco, 4000), s(d.observacoes, 4000), agora, agora);
    return Contratos.obter(id);
  },
  atualizar(id, d = {}) {
    const c0 = um('SELECT * FROM contract_records WHERE id = ?', id);
    if (!c0) throw new Error('Contrato não encontrado.');
    const c = {};
    for (const [k, max] of [['titulo', 300], ['client_id', 40], ['contraparte', 300], ['objeto', 4000],
      ['vigencia_inicio', 20], ['vigencia_fim', 20], ['draft_id', 40], ['document_id', 40],
      ['responsavel', 120], ['risco', 4000], ['observacoes', 4000]]) if (d[k] !== undefined) c[k] = s(d[k], max);
    if (d.tipo !== undefined) c.tipo = valida(d.tipo, EL.tipoContrato, 'tipo');
    if (d.alcada !== undefined) c.alcada = valida(d.alcada, EL.alcada, 'alcada');
    if (d.valor_centavos !== undefined) c.valor_centavos = cent(d.valor_centavos);
    if (d.renovacao_automatica !== undefined) c.renovacao_automatica = bool(d.renovacao_automatica);
    if (d.aviso_previo_dias !== undefined) c.aviso_previo_dias = int(d.aviso_previo_dias, 30);
    patch('contract_records', id, c);
    return Contratos.obter(id);
  },
  // Mudança de fase com a trava do 47.9: assinatura só depois de alçada aprovada.
  mover(id, status, quem) {
    const c = um('SELECT * FROM contract_records WHERE id = ?', id);
    if (!c) throw new Error('Contrato não encontrado.');
    const novo = valida(status, EL.statusContrato, 'status');
    if (novo === 'assinatura' || novo === 'vigente') {
      const aprovado = um("SELECT COUNT(*) n FROM contract_approvals WHERE contract_id = ? AND decisao IN ('aprovado','com_ressalva')", id).n;
      if (!aprovado) throw new Error(`Assinatura bloqueada: falta aprovação da alçada "${c.alcada}" (Cap. 29.9 / 47.9).`);
    }
    const campos = { status: novo };
    if (novo === 'vigente' && !c.assinado_em) campos.assinado_em = hoje();
    if (novo === 'encerrado' || novo === 'rescindido') campos.encerrado_em = hoje();
    patch('contract_records', id, campos);
    return Contratos.obter(id);
  },
  // 29.9 aprovações internas por alçada
  pedirAprovacao(id, { nivel } = {}) {
    const c = um('SELECT * FROM contract_records WHERE id = ?', id);
    if (!c) throw new Error('Contrato não encontrado.');
    const aid = novoId();
    db.prepare('INSERT INTO contract_approvals (id, contract_id, nivel, decisao, ressalvas, aprovador, quando, criado_em) VALUES (?,?,?,\'pendente\',\'\',\'\',\'\',?)')
      .run(aid, id, valida(nivel, EL.alcada, 'nivel') || c.alcada, nowISO());
    patch('contract_records', id, { status: 'aprovacao' });
    return Contratos.obter(id);
  },
  decidirAprovacao(aprovacao_id, { decisao, ressalvas } = {}, quem) {
    const a = um('SELECT * FROM contract_approvals WHERE id = ?', aprovacao_id);
    if (!a) throw new Error('Aprovação não encontrada.');
    if (a.decisao !== 'pendente') throw new Error('Esta aprovação já foi decidida.');
    const dec = valida(decisao, EL.decisaoAprov, 'decisao');
    if (dec === 'pendente') throw new Error('Escolha aprovado, reprovado ou com_ressalva.');
    if (dec === 'com_ressalva' && !s(ressalvas)) throw new Error('Aprovação com ressalva exige descrever a ressalva.');
    if (!s(quem)) throw new Error('Aprovação exige usuário identificado (Cap. 12.6).');
    db.prepare('UPDATE contract_approvals SET decisao = ?, ressalvas = ?, aprovador = ?, quando = ? WHERE id = ?')
      .run(dec, s(ressalvas, 4000), s(quem, 120), nowISO(), aprovacao_id);
    if (dec === 'reprovado') patch('contract_records', a.contract_id, { status: 'minuta' });
    return Contratos.obter(a.contract_id);
  },
  // 29.11 obrigações, prazos e renovações
  addObrigacao(id, d = {}) {
    if (!um('SELECT id FROM contract_records WHERE id = ?', id)) throw new Error('Contrato não encontrado.');
    const oid = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO contract_obligations (id, contract_id, descricao, responsavel_parte, responsavel_id,
      tipo, data_limite, periodicidade, alerta_dias, status, cumprida_em, task_id, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,'pendente','',?,?,?)`)
      .run(oid, id, s(d.descricao, 2000), valida(d.responsavel_parte, EL.parteObrig, 'responsavel_parte'),
        s(d.responsavel_id, 40), valida(d.tipo, EL.tipoObrig, 'tipo'), s(d.data_limite, 20),
        valida(d.periodicidade, EL.periodicidade, 'periodicidade'), int(d.alerta_dias, 15),
        s(d.task_id, 40), agora, agora);
    return um('SELECT * FROM contract_obligations WHERE id = ?', oid);
  },
  atualizarObrigacao(oid, d = {}) {
    const o = um('SELECT * FROM contract_obligations WHERE id = ?', oid);
    if (!o) throw new Error('Obrigação não encontrada.');
    const c = {};
    if (d.descricao !== undefined) c.descricao = s(d.descricao, 2000);
    if (d.data_limite !== undefined) c.data_limite = s(d.data_limite, 20);
    if (d.alerta_dias !== undefined) c.alerta_dias = int(d.alerta_dias, 15);
    if (d.responsavel_id !== undefined) c.responsavel_id = s(d.responsavel_id, 40);
    if (d.tipo !== undefined) c.tipo = valida(d.tipo, EL.tipoObrig, 'tipo');
    if (d.periodicidade !== undefined) c.periodicidade = valida(d.periodicidade, EL.periodicidade, 'periodicidade');
    if (d.status !== undefined) {
      c.status = valida(d.status, EL.statusObrig, 'status');
      if (c.status === 'cumprida') {
        c.cumprida_em = hoje();
        // periódica cumprida gera a próxima ocorrência (o livro pede controle contínuo)
        const passo = { mensal: 30, trimestral: 91, semestral: 182, anual: 365 }[o.periodicidade];
        if (passo && o.data_limite) {
          Contratos.addObrigacao(o.contract_id, {
            ...o, data_limite: maisDias(passo, o.data_limite), status: 'pendente', id: undefined,
          });
        }
      }
    }
    patch('contract_obligations', oid, c);
    return um('SELECT * FROM contract_obligations WHERE id = ?', oid);
  },
  // 29.11 / 47.9: alerta de renovação e de denúncia. Base do painel e da rotina.
  alertas({ dias = 60 } = {}) {
    const limite = maisDias(Math.abs(int(dias, 60)));
    const h = hoje();
    const renovacoes = todos(`SELECT * FROM contract_records
      WHERE status = 'vigente' AND vigencia_fim != '' AND vigencia_fim <= ? ORDER BY vigencia_fim`, limite)
      .map(c => {
        // data-limite para denunciar sem renovação automática
        const denunciaAte = c.vigencia_fim ? maisDias(-Math.abs(c.aviso_previo_dias || 30), c.vigencia_fim) : '';
        return {
          ...c, denuncia_ate: denunciaAte,
          urgente: !!denunciaAte && denunciaAte <= maisDias(15),
          vencido_aviso: !!denunciaAte && denunciaAte < h && !!c.renovacao_automatica,
        };
      });
    const obrigacoes = todos(`SELECT o.*, c.titulo contrato FROM contract_obligations o
      JOIN contract_records c ON c.id = o.contract_id
      WHERE o.status = 'pendente' AND o.data_limite != '' AND o.data_limite <= ? ORDER BY o.data_limite`, limite);
    const atrasadas = obrigacoes.filter(o => o.data_limite < h);
    return { renovacoes, obrigacoes, atrasadas };
  },
  // marca como atrasada tudo que passou do prazo (chamado pela rotina diária)
  marcarAtrasadas() {
    return db.prepare("UPDATE contract_obligations SET status = 'atrasada', atualizado_em = ? WHERE status = 'pendente' AND data_limite != '' AND data_limite < ?")
      .run(nowISO(), hoje()).changes;
  },
};

module.exports = { Clausulas, ContratosCiclo: Contratos };
