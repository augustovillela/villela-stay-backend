// =====================================================================
// ONDA LIVRO · PARTE VIII — COMPLIANCE, PROTEÇÃO E RISCOS
// Cap. 41 compliance · 42 LGPD/cibersegurança · 44 investigações/crises ·
// 6.10 política institucional de uso de IA · 8.8/35.11 temporalidade ·
// 31.2 matriz de obrigações legais do cliente.
// =====================================================================
'use strict';
const B = require('../repo-livro');
const { EL, s, int, bool, valida, hoje, maisDias, patch, um, todos, novoId, nowISO, j, db, arr } = B;

// ------------------------------- POLÍTICAS (41.3/41.4 · 6.10 · 42.12)
const Politicas = {
  listar({ tipo = '', status = '' } = {}) {
    let sql = 'SELECT * FROM policies', w = [], a = [];
    if (tipo) { w.push('tipo = ?'); a.push(tipo); }
    if (status) { w.push('status = ?'); a.push(status); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY tipo, titulo';
    return todos(sql, ...a).map(p => ({
      ...p, ciencias: um("SELECT COUNT(*) n FROM post_acks WHERE ref_tipo = 'policy' AND ref_id = ?", p.id).n,
    }));
  },
  obter(id) { return um('SELECT * FROM policies WHERE id = ?', id) || null; },
  criar(d = {}, quem) {
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO policies (id, tipo, titulo, texto, versao, vigente_desde, aprovado_por,
      exige_ciencia, status, revisar_em, criado_em, atualizado_em) VALUES (?,?,?,?,1,'','',?,'rascunho',?,?,?)`)
      .run(id, valida(d.tipo, EL.tipoPolitica, 'tipo'), s(d.titulo, 300), s(d.texto, 60000),
        d.exige_ciencia === undefined ? 1 : bool(d.exige_ciencia), s(d.revisar_em, 20), agora, agora);
    return Politicas.obter(id);
  },
  atualizar(id, d = {}) {
    const p = um('SELECT * FROM policies WHERE id = ?', id);
    if (!p) throw new Error('Política não encontrada.');
    const c = {};
    if (d.titulo !== undefined) c.titulo = s(d.titulo, 300);
    if (d.texto !== undefined) c.texto = s(d.texto, 60000);
    if (d.revisar_em !== undefined) c.revisar_em = s(d.revisar_em, 20);
    if (d.exige_ciencia !== undefined) c.exige_ciencia = bool(d.exige_ciencia);
    if (d.status !== undefined) c.status = valida(d.status, EL.statusPolitica, 'status');
    // 12.4: mudar o texto de política vigente sobe versão e derruba as ciências
    // anteriores (quem deu ciência leu a versão antiga).
    if (p.status === 'vigente' && c.texto !== undefined && c.texto !== p.texto) {
      c.versao = (p.versao || 1) + 1;
      if (c.status === undefined) { c.status = 'revisao'; c.aprovado_por = ''; }
      db.prepare("DELETE FROM post_acks WHERE ref_tipo = 'policy' AND ref_id = ?").run(id);
    }
    patch('policies', id, c);
    return Politicas.obter(id);
  },
  publicar(id, quem) {
    const p = um('SELECT * FROM policies WHERE id = ?', id);
    if (!p) throw new Error('Política não encontrada.');
    if (!s(p.texto)) throw new Error('Política sem texto.');
    if (!s(quem)) throw new Error('Publicação exige aprovação nominal (Cap. 12.6).');
    patch('policies', id, { status: 'vigente', aprovado_por: s(quem, 120), vigente_desde: hoje() });
    return Politicas.obter(id);
  },
};

// ------------------------------------- REGISTRO DE RISCOS (41.2 / 31.8)
const Riscos = {
  listar({ escopo = '', status = '', client_id = '', n = 300 } = {}) {
    let sql = 'SELECT * FROM risk_register', w = [], a = [];
    if (escopo) { w.push('escopo = ?'); a.push(escopo); }
    if (status) { w.push('status = ?'); a.push(status); }
    if (client_id) { w.push('client_id = ?'); a.push(client_id); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ` ORDER BY CASE impacto WHEN 'critico' THEN 1 WHEN 'alto' THEN 2 WHEN 'medio' THEN 3 ELSE 4 END,
      CASE probabilidade WHEN 'provavel' THEN 1 WHEN 'possivel' THEN 2 ELSE 3 END LIMIT ?`;
    a.push(Math.min(int(n, 300), 600));
    return todos(sql, ...a);
  },
  criar(d = {}, quem) {
    const impacto = valida(d.impacto, EL.impacto, 'impacto');
    // 41.10: risco crítico/alto sem plano de correção é achado de auditoria
    if (['critico', 'alto'].includes(impacto) && !s(d.plano_correcao) && !s(d.controles)) {
      throw new Error('Risco de impacto alto/crítico exige controles ou plano de correção (Cap. 41.8/41.10).');
    }
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO risk_register (id, escopo, client_id, case_id, risco, categoria, probabilidade,
      impacto, controles, plano_correcao, dono, prazo, status, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, valida(d.escopo, EL.escopoRisco, 'escopo'), s(d.client_id, 40), s(d.case_id, 40),
        s(d.risco, 2000), valida(d.categoria, EL.categoriaRisco, 'categoria'),
        valida(d.probabilidade, EL.probabilidade, 'probabilidade'), impacto, s(d.controles, 4000),
        s(d.plano_correcao, 4000), s(d.dono, 120) || s(quem, 120), s(d.prazo, 20),
        valida(d.status, EL.statusRisco, 'status'), agora, agora);
    return um('SELECT * FROM risk_register WHERE id = ?', id);
  },
  atualizar(id, d = {}) {
    if (!um('SELECT id FROM risk_register WHERE id = ?', id)) throw new Error('Risco não encontrado.');
    const c = {};
    for (const [k, max] of [['risco', 2000], ['controles', 4000], ['plano_correcao', 4000], ['dono', 120], ['prazo', 20]]) {
      if (d[k] !== undefined) c[k] = s(d[k], max);
    }
    if (d.categoria !== undefined) c.categoria = valida(d.categoria, EL.categoriaRisco, 'categoria');
    if (d.probabilidade !== undefined) c.probabilidade = valida(d.probabilidade, EL.probabilidade, 'probabilidade');
    if (d.impacto !== undefined) c.impacto = valida(d.impacto, EL.impacto, 'impacto');
    if (d.status !== undefined) c.status = valida(d.status, EL.statusRisco, 'status');
    patch('risk_register', id, c);
    return um('SELECT * FROM risk_register WHERE id = ?', id);
  },
  remover(id) { return db.prepare('DELETE FROM risk_register WHERE id = ?').run(id).changes; },
  // 41.2 matriz probabilidade × impacto (o mapa de calor do livro)
  matriz() {
    const out = {};
    for (const p of EL.probabilidade) { out[p] = {}; for (const i of EL.impacto) out[p][i] = 0; }
    for (const r of todos("SELECT probabilidade, impacto, COUNT(*) n FROM risk_register WHERE status NOT IN ('fechado','mitigado') GROUP BY probabilidade, impacto")) {
      if (out[r.probabilidade]) out[r.probabilidade][r.impacto] = r.n;
    }
    return out;
  },
};

// ----------------------------------------- CANAL DE DENÚNCIAS (41.6)
const Denuncias = {
  // protocolo curto para o denunciante acompanhar sem se identificar
  _protocolo() {
    let p; let tent = 0;
    do { p = 'D' + Math.random().toString(36).slice(2, 8).toUpperCase(); tent++; }
    while (um('SELECT id FROM whistleblower_reports WHERE protocolo = ?', p) && tent < 10);
    return p;
  },
  registrar(d = {}) {
    if (!s(d.relato)) throw new Error('Descreva o relato.');
    const anonimo = d.anonimo === undefined ? 1 : bool(d.anonimo);
    const protocolo = Denuncias._protocolo();
    const id = novoId();
    db.prepare(`INSERT INTO whistleblower_reports (id, protocolo, anonimo, relator, contato, categoria, relato,
      status, apuracao, medidas, responsavel, recebido_em, encerrado_em) VALUES (?,?,?,?,?,?,?,'recebida','','','',?,'')`)
      .run(id, protocolo, anonimo, anonimo ? '' : s(d.relator, 200), anonimo ? '' : s(d.contato, 200),
        s(d.categoria, 60) || 'outro', s(d.relato, 20000), nowISO());
    return { protocolo, id };
  },
  listar({ status = '', n = 100 } = {}) {
    const w = status ? ' WHERE status = ?' : '';
    const a = status ? [status] : [];
    return todos('SELECT * FROM whistleblower_reports' + w + ' ORDER BY recebido_em DESC LIMIT ?', ...a, Math.min(int(n, 100), 300));
  },
  porProtocolo(protocolo) {
    const r = um('SELECT protocolo, status, recebido_em, encerrado_em FROM whistleblower_reports WHERE protocolo = ?', s(protocolo, 20));
    return r || null; // consulta pública: só o andamento, nunca o conteúdo
  },
  atualizar(id, d = {}, quem) {
    if (!um('SELECT id FROM whistleblower_reports WHERE id = ?', id)) throw new Error('Denúncia não encontrada.');
    const status = d.status !== undefined ? valida(d.status, EL.statusDenuncia, 'status') : undefined;
    const cols = {
      status, apuracao: d.apuracao !== undefined ? s(d.apuracao, 20000) : undefined,
      medidas: d.medidas !== undefined ? s(d.medidas, 8000) : undefined,
      responsavel: d.responsavel !== undefined ? s(d.responsavel, 120) : s(quem, 120),
      encerrado_em: ['procedente', 'improcedente', 'arquivada'].includes(status) ? nowISO() : undefined,
    };
    const chaves = Object.keys(cols).filter(k => cols[k] !== undefined);
    if (chaves.length) {
      db.prepare(`UPDATE whistleblower_reports SET ${chaves.map(k => k + ' = ?').join(', ')} WHERE id = ?`)
        .run(...chaves.map(k => cols[k]), id);
    }
    return um('SELECT * FROM whistleblower_reports WHERE id = ?', id);
  },
};

// ------------------------------------- DUE DILIGENCE DE TERCEIROS (41.7)
const DueDiligence = {
  listar({ resultado = '', n = 200 } = {}) {
    const w = resultado ? ' WHERE resultado = ?' : '';
    const a = resultado ? [resultado] : [];
    return todos('SELECT * FROM third_party_dd' + w + ' ORDER BY criado_em DESC LIMIT ?', ...a, Math.min(int(n, 200), 400))
      .map(t => ({ ...t, checagens: j.parse(t.checagens, []) }));
  },
  salvar(d = {}, quem) {
    const checagens = j.str(arr(d.checagens).map(c => ({
      fonte: s(c.fonte, 200), resultado: s(c.resultado, 500), data: s(c.data, 20) || hoje(),
    })));
    const resultado = valida(d.resultado, EL.resultadoDD, 'resultado');
    if (resultado === 'aprovado_com_ressalva' && !s(d.ressalvas)) throw new Error('Descreva a ressalva.');
    const campos = {
      terceiro: s(d.terceiro, 300), documento: s(d.documento, 30), tipo: valida(d.tipo, EL.tipoTerceiro, 'tipo'),
      checagens, resultado, ressalvas: s(d.ressalvas, 4000),
      validade: s(d.validade, 20) || maisDias(365), responsavel: s(d.responsavel, 120) || s(quem, 120),
    };
    if (!campos.terceiro) throw new Error('Informe o terceiro avaliado.');
    if (d.id && um('SELECT id FROM third_party_dd WHERE id = ?', d.id)) {
      patch('third_party_dd', d.id, campos);
      return um('SELECT * FROM third_party_dd WHERE id = ?', d.id);
    }
    const id = novoId(), agora = nowISO();
    const cols = Object.keys(campos);
    db.prepare(`INSERT INTO third_party_dd (id, ${cols.join(', ')}, criado_em, atualizado_em)
      VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`).run(id, ...cols.map(c => campos[c]), agora, agora);
    return um('SELECT * FROM third_party_dd WHERE id = ?', id);
  },
};

// ------------------------------------------------------- LGPD (Cap. 42)
const LGPD = {
  // 42.2 inventário de dados + 42.3 bases legais
  inventario({ sensivel = '', n = 300 } = {}) {
    const w = sensivel === '' ? '' : ' WHERE sensivel = ' + bool(sensivel);
    return todos('SELECT * FROM data_inventory' + w + ' ORDER BY tratamento LIMIT ?', Math.min(int(n, 300), 600));
  },
  salvarTratamento(d = {}, quem) {
    const campos = {
      tratamento: s(d.tratamento, 300), dados: s(d.dados, 4000), titulares: s(d.titulares, 300),
      sensivel: bool(d.sensivel), base_legal: valida(d.base_legal, EL.baseLegal, 'base_legal'),
      finalidade: s(d.finalidade, 2000), retencao: s(d.retencao, 500),
      compartilhamentos: s(d.compartilhamentos, 2000), medidas: s(d.medidas, 2000),
      responsavel: s(d.responsavel, 120) || s(quem, 120), revisado_em: hoje(),
    };
    if (!campos.tratamento) throw new Error('Informe o tratamento (ex.: cadastro de cliente).');
    if (!campos.finalidade) throw new Error('Informe a finalidade — base legal sem finalidade não se sustenta (Cap. 42.3).');
    if (d.id && um('SELECT id FROM data_inventory WHERE id = ?', d.id)) {
      patch('data_inventory', d.id, campos);
      return um('SELECT * FROM data_inventory WHERE id = ?', d.id);
    }
    const id = novoId(), agora = nowISO();
    const cols = Object.keys(campos);
    db.prepare(`INSERT INTO data_inventory (id, ${cols.join(', ')}, criado_em, atualizado_em)
      VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`).run(id, ...cols.map(c => campos[c]), agora, agora);
    return um('SELECT * FROM data_inventory WHERE id = ?', id);
  },
  removerTratamento(id) { return db.prepare('DELETE FROM data_inventory WHERE id = ?').run(id).changes; },

  // 42.10 resposta a titulares — prazo de 15 dias (art. 19, II, LGPD)
  pedidos({ status = '', n = 200 } = {}) {
    const w = status ? ' WHERE status = ?' : '';
    const a = status ? [status] : [];
    return todos('SELECT * FROM data_subject_requests' + w + ' ORDER BY prazo_em LIMIT ?', ...a, Math.min(int(n, 200), 400))
      .map(p => ({ ...p, atrasado: p.prazo_em && p.prazo_em < hoje() && !['atendido', 'recusado', 'parcial'].includes(p.status) }));
  },
  criarPedido(d = {}, quem) {
    const recebido = s(d.recebido_em, 20) || hoje();
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO data_subject_requests (id, titular, contato, tipo, pedido, recebido_em, prazo_em,
      status, resposta, respondido_em, responsavel, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,'recebido','','',?,?,?)`)
      .run(id, s(d.titular, 200), s(d.contato, 200), valida(d.tipo, EL.tipoDSR, 'tipo'), s(d.pedido, 4000),
        recebido, s(d.prazo_em, 20) || maisDias(15, recebido), s(d.responsavel, 120) || s(quem, 120), agora, agora);
    return um('SELECT * FROM data_subject_requests WHERE id = ?', id);
  },
  responderPedido(id, d = {}, quem) {
    const p = um('SELECT * FROM data_subject_requests WHERE id = ?', id);
    if (!p) throw new Error('Pedido de titular não encontrado.');
    const status = valida(d.status, EL.statusDSR, 'status');
    if (['atendido', 'parcial', 'recusado'].includes(status) && !s(d.resposta)) {
      throw new Error('Registre a resposta dada ao titular (Cap. 42.10).');
    }
    patch('data_subject_requests', id, {
      status, resposta: d.resposta !== undefined ? s(d.resposta, 8000) : undefined,
      respondido_em: ['atendido', 'parcial', 'recusado'].includes(status) ? nowISO() : '',
      responsavel: s(quem, 120),
    });
    return um('SELECT * FROM data_subject_requests WHERE id = ?', id);
  },

  // 42.9 / 44.7 incidentes
  incidentes({ status = '', n = 100 } = {}) {
    const w = status ? ' WHERE status = ?' : '';
    const a = status ? [status] : [];
    return todos('SELECT * FROM security_incidents' + w + ' ORDER BY detectado_em DESC LIMIT ?', ...a, Math.min(int(n, 100), 300));
  },
  salvarIncidente(d = {}, quem) {
    const gravidade = valida(d.gravidade, EL.gravidade, 'gravidade');
    const campos = {
      titulo: s(d.titulo, 300), descricao: s(d.descricao, 20000),
      detectado_em: s(d.detectado_em, 30) || nowISO(), origem: s(d.origem, 300),
      dados_afetados: s(d.dados_afetados, 2000), titulares_afetados: int(d.titulares_afetados, 0),
      gravidade, contencao: s(d.contencao, 4000), anpd_notificada: bool(d.anpd_notificada),
      anpd_em: s(d.anpd_em, 30), titulares_comunicados: bool(d.titulares_comunicados),
      medidas: s(d.medidas, 8000), status: valida(d.status, EL.statusIncidente, 'status'),
      responsavel: s(d.responsavel, 120) || s(quem, 120),
    };
    if (!campos.titulo) throw new Error('Informe o título do incidente.');
    // 42.9: não se encerra incidente grave sem dizer o que foi feito
    if (campos.status === 'encerrado' && !campos.medidas) throw new Error('Descreva as medidas antes de encerrar o incidente (Cap. 42.9).');
    if (d.id && um('SELECT id FROM security_incidents WHERE id = ?', d.id)) {
      patch('security_incidents', d.id, campos);
      return um('SELECT * FROM security_incidents WHERE id = ?', d.id);
    }
    const id = novoId(), agora = nowISO();
    const cols = Object.keys(campos);
    db.prepare(`INSERT INTO security_incidents (id, ${cols.join(', ')}, criado_em, atualizado_em)
      VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`).run(id, ...cols.map(c => campos[c]), agora, agora);
    return um('SELECT * FROM security_incidents WHERE id = ?', id);
  },
};

// ------------------------------- TEMPORALIDADE E ELIMINAÇÃO (8.8/35.11/35.12)
const Temporalidade = {
  tabela() { return todos('SELECT * FROM retention_schedule ORDER BY tipo_documental'); },
  salvar(d = {}) {
    const campos = {
      tipo_documental: s(d.tipo_documental, 200), prazo_guarda: s(d.prazo_guarda, 200),
      contagem_desde: s(d.contagem_desde, 200), destinacao: valida(d.destinacao, EL.destinacao, 'destinacao'),
      base_legal: s(d.base_legal, 500), observacao: s(d.observacao, 1000),
    };
    if (!campos.tipo_documental) throw new Error('Informe o tipo documental.');
    if (!campos.prazo_guarda) throw new Error('Informe o prazo de guarda.');
    if (d.id && um('SELECT id FROM retention_schedule WHERE id = ?', d.id)) {
      patch('retention_schedule', d.id, campos);
      return um('SELECT * FROM retention_schedule WHERE id = ?', d.id);
    }
    const id = novoId(), agora = nowISO();
    const cols = Object.keys(campos);
    db.prepare(`INSERT INTO retention_schedule (id, ${cols.join(', ')}, criado_em, atualizado_em)
      VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`).run(id, ...cols.map(c => campos[c]), agora, agora);
    return um('SELECT * FROM retention_schedule WHERE id = ?', id);
  },
  remover(id) { return db.prepare('DELETE FROM retention_schedule WHERE id = ?').run(id).changes; },
  // 35.12 eliminação segura: registro nominal, irreversível e auditável
  registrarEliminacao(d = {}, quem) {
    if (!s(quem)) throw new Error('Eliminação exige autorização nominal (Cap. 35.12).');
    if (!s(d.descricao)) throw new Error('Descreva o que foi eliminado.');
    if (!s(d.motivo)) throw new Error('Informe o motivo/base da eliminação.');
    const id = novoId();
    db.prepare(`INSERT INTO disposal_records (id, ref_tipo, ref_id, descricao, motivo, metodo, autorizado_por, cliente_avisado, executado_em)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, s(d.ref_tipo, 40) || 'document', s(d.ref_id, 40), s(d.descricao, 2000), s(d.motivo, 2000),
        s(d.metodo, 300), s(quem, 120), bool(d.cliente_avisado), nowISO());
    return um('SELECT * FROM disposal_records WHERE id = ?', id);
  },
  eliminacoes({ n = 200 } = {}) { return todos('SELECT * FROM disposal_records ORDER BY executado_em DESC LIMIT ?', Math.min(int(n, 200), 500)); },
};

// -------------------------- INVESTIGAÇÕES E CONTINUIDADE (44.5 / 44.9)
const Crises = {
  investigacoes({ status = '', n = 100 } = {}) {
    const w = status ? ' WHERE status = ?' : '';
    const a = status ? [status] : [];
    return todos('SELECT * FROM investigations' + w + ' ORDER BY criado_em DESC LIMIT ?', ...a, Math.min(int(n, 100), 300));
  },
  salvarInvestigacao(d = {}, quem) {
    const campos = {
      objeto: s(d.objeto, 500), report_id: s(d.report_id, 40), escopo: s(d.escopo, 4000),
      cronologia: s(d.cronologia, 20000), entrevistas: s(d.entrevistas, 20000),
      conclusoes: s(d.conclusoes, 20000), medidas: s(d.medidas, 8000),
      sigilosa: d.sigilosa === undefined ? 1 : bool(d.sigilosa),
      status: valida(d.status, EL.statusInvestigacao, 'status'), responsavel: s(d.responsavel, 120) || s(quem, 120),
    };
    if (!campos.objeto) throw new Error('Informe o objeto da investigação.');
    if (campos.status === 'concluida' && !campos.conclusoes) throw new Error('Investigação concluída exige conclusões registradas (Cap. 44.5).');
    if (d.id && um('SELECT id FROM investigations WHERE id = ?', d.id)) {
      patch('investigations', d.id, campos);
      return um('SELECT * FROM investigations WHERE id = ?', d.id);
    }
    const id = novoId(), agora = nowISO();
    const cols = Object.keys(campos);
    db.prepare(`INSERT INTO investigations (id, ${cols.join(', ')}, criado_em, atualizado_em)
      VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`).run(id, ...cols.map(c => campos[c]), agora, agora);
    return um('SELECT * FROM investigations WHERE id = ?', id);
  },
  planos() {
    return todos('SELECT * FROM continuity_plans ORDER BY cenario').map(p => ({
      ...p, teste_vencido: !p.ultimo_teste || p.ultimo_teste < maisDias(-365),
    }));
  },
  salvarPlano(d = {}, quem) {
    const campos = {
      cenario: s(d.cenario, 300), impacto: s(d.impacto, 2000), rto: s(d.rto, 100),
      procedimento: s(d.procedimento, 8000), alternativa: s(d.alternativa, 4000),
      responsavel: s(d.responsavel, 120) || s(quem, 120),
      ultimo_teste: s(d.ultimo_teste, 20), resultado_teste: s(d.resultado_teste, 2000),
    };
    if (!campos.cenario) throw new Error('Informe o cenário.');
    if (!campos.procedimento) throw new Error('Plano sem procedimento não é plano (Cap. 44.9).');
    if (d.id && um('SELECT id FROM continuity_plans WHERE id = ?', d.id)) {
      patch('continuity_plans', d.id, campos);
      return um('SELECT * FROM continuity_plans WHERE id = ?', d.id);
    }
    const id = novoId(), agora = nowISO();
    const cols = Object.keys(campos);
    db.prepare(`INSERT INTO continuity_plans (id, ${cols.join(', ')}, criado_em, atualizado_em)
      VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`).run(id, ...cols.map(c => campos[c]), agora, agora);
    return um('SELECT * FROM continuity_plans WHERE id = ?', id);
  },
};

// ------------------ MATRIZ DE OBRIGAÇÕES LEGAIS DO CLIENTE (31.2 / 31.4)
const Obrigacoes = {
  listar({ client_id = '', status = '', n = 300 } = {}) {
    let sql = `SELECT o.*, c.nome cliente FROM obligation_matrix o LEFT JOIN clients c ON c.id = o.client_id`, w = [], a = [];
    if (client_id) { w.push('o.client_id = ?'); a.push(client_id); }
    if (status) { w.push('o.status = ?'); a.push(status); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY o.proximo_vencimento LIMIT ?'; a.push(Math.min(int(n, 300), 600));
    return todos(sql, ...a);
  },
  salvar(d = {}) {
    if (!um('SELECT id FROM clients WHERE id = ?', s(d.client_id, 40))) throw new Error('Cliente não encontrado.');
    const campos = {
      client_id: s(d.client_id, 40), obrigacao: s(d.obrigacao, 500), norma: s(d.norma, 300),
      orgao: s(d.orgao, 200), periodicidade: valida(d.periodicidade, EL.periodicidadeObrig, 'periodicidade'),
      proximo_vencimento: s(d.proximo_vencimento, 20), responsavel_cliente: s(d.responsavel_cliente, 200),
      evidencia: s(d.evidencia, 1000), risco_descumprimento: s(d.risco_descumprimento, 2000),
      status: valida(d.status, EL.statusObrigMatriz, 'status'),
    };
    if (!campos.obrigacao) throw new Error('Informe a obrigação.');
    if (d.id && um('SELECT id FROM obligation_matrix WHERE id = ?', d.id)) {
      patch('obligation_matrix', d.id, campos);
      return um('SELECT * FROM obligation_matrix WHERE id = ?', d.id);
    }
    const id = novoId(), agora = nowISO();
    const cols = Object.keys(campos);
    db.prepare(`INSERT INTO obligation_matrix (id, ${cols.join(', ')}, criado_em, atualizado_em)
      VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`).run(id, ...cols.map(c => campos[c]), agora, agora);
    return um('SELECT * FROM obligation_matrix WHERE id = ?', id);
  },
  remover(id) { return db.prepare('DELETE FROM obligation_matrix WHERE id = ?').run(id).changes; },
  // rotina: obrigação com vencimento passado vira "vencida"
  marcarVencidas() {
    return db.prepare("UPDATE obligation_matrix SET status = 'vencida', atualizado_em = ? WHERE status IN ('em_dia','pendente') AND proximo_vencimento != '' AND proximo_vencimento < ?")
      .run(nowISO(), hoje()).changes;
  },
};

// ---------------------------------------- PAINEL DE COMPLIANCE (41.11)
const PainelCompliance = {
  resumo() {
    const h = hoje();
    return {
      riscos_abertos: um("SELECT COUNT(*) n FROM risk_register WHERE status IN ('aberto','tratando')").n,
      riscos_criticos: um("SELECT COUNT(*) n FROM risk_register WHERE status IN ('aberto','tratando') AND impacto IN ('critico','alto')").n,
      matriz: Riscos.matriz(),
      politicas_vigentes: um("SELECT COUNT(*) n FROM policies WHERE status = 'vigente'").n,
      politicas_sem_revisao: um("SELECT COUNT(*) n FROM policies WHERE status = 'vigente' AND revisar_em != '' AND revisar_em < ?", h).n,
      denuncias_abertas: um("SELECT COUNT(*) n FROM whistleblower_reports WHERE status IN ('recebida','em_apuracao')").n,
      titulares_no_prazo: um("SELECT COUNT(*) n FROM data_subject_requests WHERE status IN ('recebido','em_analise') AND (prazo_em = '' OR prazo_em >= ?)", h).n,
      titulares_atrasados: um("SELECT COUNT(*) n FROM data_subject_requests WHERE status IN ('recebido','em_analise') AND prazo_em != '' AND prazo_em < ?", h).n,
      incidentes_abertos: um("SELECT COUNT(*) n FROM security_incidents WHERE status IN ('aberto','contido')").n,
      tratamentos: um('SELECT COUNT(*) n FROM data_inventory').n,
      tratamentos_sensiveis: um('SELECT COUNT(*) n FROM data_inventory WHERE sensivel = 1').n,
      dd_vencidas: um("SELECT COUNT(*) n FROM third_party_dd WHERE validade != '' AND validade < ?", h).n,
      planos_teste_vencido: um("SELECT COUNT(*) n FROM continuity_plans WHERE ultimo_teste = '' OR ultimo_teste < ?", maisDias(-365)).n,
      obrigacoes_vencidas: um("SELECT COUNT(*) n FROM obligation_matrix WHERE status = 'vencida'").n,
      inventario_critico_sem_plano: um("SELECT COUNT(*) n FROM system_inventory WHERE ativo = 1 AND criticidade = 'critica' AND plano_contingencia = ''").n,
    };
  },
};

module.exports = { Politicas, Riscos, Denuncias, DueDiligence, LGPD, Temporalidade, Crises, Obrigacoes, PainelCompliance };
