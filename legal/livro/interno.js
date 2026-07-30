// =====================================================================
// ONDA LIVRO · 47.3 PORTAL INTERNO DA EQUIPE (Cap. 36) + POPs (7.6/7.7) +
// 47.12 CENTRAL DE AGENTES (10.10 limites de autonomia) +
// 12.8 inventário de sistemas/automações e 12.9 contingência.
// =====================================================================
'use strict';
const B = require('../repo-livro');
const { EL, s, int, bool, valida, hoje, patch, um, todos, novoId, nowISO, j, db, arr } = B;

// ------------------------------------------- AVISOS/COMUNICADOS (36.2)
const Mural = {
  listar({ tipo = '', n = 100, area = '' } = {}) {
    let sql = 'SELECT * FROM internal_posts', w = [], a = [];
    if (tipo) { w.push('tipo = ?'); a.push(tipo); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY fixado DESC, publicado_em DESC LIMIT ?'; a.push(Math.min(int(n, 100), 300));
    let lista = todos(sql, ...a).map(p => ({
      ...p, areas: j.parse(p.areas, []),
      ciencias: um("SELECT COUNT(*) n FROM post_acks WHERE ref_tipo = 'post' AND ref_id = ?", p.id).n,
    }));
    if (area) lista = lista.filter(p => !p.areas.length || p.areas.includes(area));
    return lista;
  },
  criar(d = {}, quem) {
    const id = novoId();
    db.prepare(`INSERT INTO internal_posts (id, tipo, titulo, corpo, areas, exige_ciencia, fixado, autor, publicado_em, expira_em)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, valida(d.tipo, EL.tipoPost, 'tipo'), s(d.titulo, 300), s(d.corpo, 20000),
        j.str(arr(d.areas).map(x => s(x, 40))), bool(d.exige_ciencia), bool(d.fixado),
        s(quem, 120), nowISO(), s(d.expira_em, 20));
    return um('SELECT * FROM internal_posts WHERE id = ?', id);
  },
  remover(id) { return db.prepare('DELETE FROM internal_posts WHERE id = ?').run(id).changes; },
  // 36.2/36.10 confirmação de ciência (e 41.5/42.12 para políticas)
  darCiencia({ ref_tipo = 'post', ref_id }, user) {
    const tipo = ['post', 'pop', 'policy'].includes(ref_tipo) ? ref_tipo : 'post';
    const uid = s(user && user.id, 40);
    if (!uid) throw new Error('Ciência exige usuário identificado.');
    const existe = um('SELECT id FROM post_acks WHERE ref_tipo = ? AND ref_id = ? AND user_id = ?', tipo, s(ref_id, 40), uid);
    if (existe) return existe.id;
    const id = novoId();
    db.prepare('INSERT INTO post_acks (id, ref_tipo, ref_id, user_id, quem, quando) VALUES (?,?,?,?,?,?)')
      .run(id, tipo, s(ref_id, 40), uid, s((user && (user.nome || user.email)) || '', 120), nowISO());
    return id;
  },
  ciencias({ ref_tipo = 'post', ref_id }) {
    return todos('SELECT * FROM post_acks WHERE ref_tipo = ? AND ref_id = ? ORDER BY quando', ref_tipo, s(ref_id, 40));
  },
  // quem ainda não deu ciência no que exige (a lista que a controladoria cobra)
  pendencias(user) {
    const uid = s(user && user.id, 40);
    const posts = todos(`SELECT id, titulo, 'post' ref_tipo FROM internal_posts WHERE exige_ciencia = 1
      AND id NOT IN (SELECT ref_id FROM post_acks WHERE ref_tipo = 'post' AND user_id = ?)`, uid);
    const pol = todos(`SELECT id, titulo, 'policy' ref_tipo FROM policies WHERE exige_ciencia = 1 AND status = 'vigente'
      AND id NOT IN (SELECT ref_id FROM post_acks WHERE ref_tipo = 'policy' AND user_id = ?)`, uid);
    return [...posts, ...pol];
  },
};

// --------------------------------------------------- POPs (7.6 / 36.5)
const POPs = {
  listar({ status = '', area = '', n = 200 } = {}) {
    let sql = 'SELECT * FROM pops', w = [], a = [];
    if (status) { w.push('status = ?'); a.push(status); }
    if (area) { w.push('area = ?'); a.push(area); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY codigo, titulo LIMIT ?'; a.push(Math.min(int(n, 200), 400));
    return todos(sql, ...a).map(p => ({ ...p, passos: j.parse(p.passos, []), checklist: j.parse(p.checklist, []) }));
  },
  obter(id) {
    const p = um('SELECT * FROM pops WHERE id = ?', id);
    if (!p) return null;
    p.passos = j.parse(p.passos, []); p.checklist = j.parse(p.checklist, []);
    p.execucoes = todos('SELECT * FROM pop_runs WHERE pop_id = ? ORDER BY criado_em DESC LIMIT 50', id)
      .map(r => ({ ...r, marcados: j.parse(r.marcados, []) }));
    return p;
  },
  criar(d = {}, quem) {
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO pops (id, codigo, titulo, area, objetivo, gatilho, responsavel, passos, checklist,
      versao, vigente_desde, aprovado_por, status, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,1,'','','rascunho',?,?)`)
      .run(id, s(d.codigo, 40), s(d.titulo, 300), s(d.area, 60), s(d.objetivo, 4000), s(d.gatilho, 1000),
        s(d.responsavel, 120) || s(quem, 120), POPs._passos(d.passos), POPs._check(d.checklist), agora, agora);
    return POPs.obter(id);
  },
  _passos(v) {
    return j.str(arr(v).map((p, i) => ({
      ordem: int(p.ordem, i + 1), acao: s(p.acao, 2000), responsavel: s(p.responsavel, 120), evidencia: s(p.evidencia, 300),
    })));
  },
  _check(v) {
    return j.str(arr(v).map(c => ({ item: s(c.item, 500), obrigatorio: bool(c.obrigatorio) })));
  },
  atualizar(id, d = {}) {
    const p = um('SELECT * FROM pops WHERE id = ?', id);
    if (!p) throw new Error('POP não encontrado.');
    const c = {};
    for (const [k, max] of [['codigo', 40], ['titulo', 300], ['area', 60], ['objetivo', 4000], ['gatilho', 1000], ['responsavel', 120]]) {
      if (d[k] !== undefined) c[k] = s(d[k], max);
    }
    if (d.passos !== undefined) c.passos = POPs._passos(d.passos);
    if (d.checklist !== undefined) c.checklist = POPs._check(d.checklist);
    if (d.status !== undefined) c.status = valida(d.status, EL.statusPop, 'status');
    // 12.4 controle de versões: alterar POP vigente sobe a versão e volta para revisão
    if (p.status === 'vigente' && (c.passos !== undefined || c.checklist !== undefined || c.objetivo !== undefined)) {
      c.versao = (p.versao || 1) + 1;
      if (c.status === undefined) { c.status = 'revisao'; c.aprovado_por = ''; }
    }
    patch('pops', id, c);
    return POPs.obter(id);
  },
  // 7.6/12.6: POP entra em vigor por aprovação nominal
  publicar(id, quem) {
    const p = um('SELECT * FROM pops WHERE id = ?', id);
    if (!p) throw new Error('POP não encontrado.');
    if (!j.parse(p.passos, []).length) throw new Error('POP sem passos — descreva o procedimento antes de publicar.');
    if (!s(quem)) throw new Error('Publicação exige usuário identificado.');
    patch('pops', id, { status: 'vigente', aprovado_por: s(quem, 120), vigente_desde: hoje() });
    return POPs.obter(id);
  },
  // 7.7 execução do checklist (com trava dos itens obrigatórios)
  executar(pop_id, d = {}, quem) {
    const p = um('SELECT * FROM pops WHERE id = ?', pop_id);
    if (!p) throw new Error('POP não encontrado.');
    const definidos = j.parse(p.checklist, []);
    const marcados = arr(d.marcados).map(m => ({ item: s(m.item, 500), ok: bool(m.ok), observacao: s(m.observacao, 500) }));
    const concluir = bool(d.concluido);
    if (concluir) {
      const faltando = definidos.filter(c => c.obrigatorio && !marcados.some(m => m.item === c.item && m.ok));
      if (faltando.length) throw new Error(`Checklist incompleto: ${faltando.length} item(ns) obrigatório(s) sem confirmação.`);
    }
    const id = novoId();
    db.prepare(`INSERT INTO pop_runs (id, pop_id, ref_tipo, ref_id, marcados, concluido, quem, criado_em, concluido_em)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, pop_id, s(d.ref_tipo, 40), s(d.ref_id, 40), j.str(marcados), concluir ? 1 : 0,
        s(quem, 120), nowISO(), concluir ? nowISO() : '');
    return um('SELECT * FROM pop_runs WHERE id = ?', id);
  },
};

// ------------------------------------- DECISÕES E SOLICITAÇÕES (36.8/36.9)
const Interno = {
  decisoes({ n = 100 } = {}) { return todos('SELECT * FROM internal_decisions ORDER BY criado_em DESC LIMIT ?', Math.min(int(n, 100), 300)); },
  addDecisao(d = {}, quem) {
    if (!s(d.decisao)) throw new Error('Descreva a decisão.');
    const id = novoId();
    db.prepare('INSERT INTO internal_decisions (id, assunto, decisao, motivo, participantes, vigencia, revisar_em, quem, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, s(d.assunto, 300), s(d.decisao, 8000), s(d.motivo, 4000), s(d.participantes, 1000),
        s(d.vigencia, 200), s(d.revisar_em, 20), s(quem, 120), nowISO());
    return um('SELECT * FROM internal_decisions WHERE id = ?', id);
  },
  pedidos({ status = '', para_area = '', n = 150 } = {}) {
    let sql = 'SELECT * FROM internal_requests', w = [], a = [];
    if (status) { w.push('status = ?'); a.push(status); }
    if (para_area) { w.push('para_area = ?'); a.push(para_area); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY criado_em DESC LIMIT ?'; a.push(Math.min(int(n, 150), 400));
    return todos(sql, ...a);
  },
  addPedido(d = {}, quem) {
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO internal_requests (id, de_area, para_area, assunto, pedido, prazo, prioridade,
      status, resposta, solicitante, responsavel, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,'aberta','',?,?,?,?)`)
      .run(id, s(d.de_area, 60), s(d.para_area, 60), s(d.assunto, 300), s(d.pedido, 4000), s(d.prazo, 20),
        valida(d.prioridade, EL.prioridade, 'prioridade'), s(quem, 120), s(d.responsavel, 120), agora, agora);
    return um('SELECT * FROM internal_requests WHERE id = ?', id);
  },
  atualizarPedido(id, d = {}) {
    if (!um('SELECT id FROM internal_requests WHERE id = ?', id)) throw new Error('Solicitação não encontrada.');
    const c = {};
    for (const [k, max] of [['resposta', 4000], ['responsavel', 120], ['prazo', 20]]) if (d[k] !== undefined) c[k] = s(d[k], max);
    if (d.status !== undefined) c.status = valida(d.status, EL.statusPedido, 'status');
    if (d.prioridade !== undefined) c.prioridade = valida(d.prioridade, EL.prioridade, 'prioridade');
    patch('internal_requests', id, c);
    return um('SELECT * FROM internal_requests WHERE id = ?', id);
  },
};

// ----------------------- INVENTÁRIO DE SISTEMAS E AUTOMAÇÕES (12.8/12.9)
const Inventario = {
  listar({ tipo = '', ativo = '', n = 300 } = {}) {
    let sql = 'SELECT * FROM system_inventory', w = [], a = [];
    if (tipo) { w.push('tipo = ?'); a.push(tipo); }
    if (ativo !== '') { w.push('ativo = ?'); a.push(bool(ativo)); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY criticidade, nome LIMIT ?'; a.push(Math.min(int(n, 300), 600));
    return todos(sql, ...a);
  },
  salvar(d = {}, quem) {
    const campos = {
      nome: s(d.nome, 200), tipo: valida(d.tipo, EL.tipoInventario, 'tipo'), finalidade: s(d.finalidade, 2000),
      responsavel: s(d.responsavel, 120) || s(quem, 120), fornecedor: s(d.fornecedor, 200),
      dados_tratados: s(d.dados_tratados, 2000), criticidade: valida(d.criticidade, EL.criticidade, 'criticidade'),
      onde_roda: s(d.onde_roda, 300), credencial_onde: s(d.credencial_onde, 300),
      plano_contingencia: s(d.plano_contingencia, 4000), plano_saida: s(d.plano_saida, 4000),
      ultima_revisao: s(d.ultima_revisao, 20) || hoje(), ativo: d.ativo === undefined ? 1 : bool(d.ativo),
    };
    if (!campos.nome) throw new Error('Informe o nome do sistema/automação.');
    // 12.9: item crítico sem plano de contingência é exatamente o que o livro proíbe deixar solto
    if (campos.criticidade === 'critica' && !campos.plano_contingencia) {
      throw new Error('Item crítico exige plano de contingência (Cap. 12.9).');
    }
    if (d.id && um('SELECT id FROM system_inventory WHERE id = ?', d.id)) {
      patch('system_inventory', d.id, campos);
      return um('SELECT * FROM system_inventory WHERE id = ?', d.id);
    }
    const id = novoId(), agora = nowISO();
    const cols = Object.keys(campos);
    db.prepare(`INSERT INTO system_inventory (id, ${cols.join(', ')}, criado_em, atualizado_em)
      VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`)
      .run(id, ...cols.map(c => campos[c]), agora, agora);
    return um('SELECT * FROM system_inventory WHERE id = ?', id);
  },
  remover(id) { return db.prepare('DELETE FROM system_inventory WHERE id = ?').run(id).changes; },
};

// ------------------- CENTRAL DE AGENTES: limites de autonomia (10.10/47.12)
const Agentes = {
  listar() {
    return todos('SELECT * FROM agent_charters ORDER BY nome').map(a => ({
      ...a,
      pode_sozinho: j.parse(a.pode_sozinho, []), exige_aprovacao: j.parse(a.exige_aprovacao, []), proibido: j.parse(a.proibido, []),
      // ai_agent_runs: colunas `agente` e `quando` (ver schema.sql)
      execucoes_30d: um('SELECT COUNT(*) n FROM ai_agent_runs WHERE agente = ? AND quando >= ?', a.agente, B.maisDias(-30)).n,
    }));
  },
  salvar(d = {}, quem) {
    const agente = s(d.agente, 60);
    if (!agente) throw new Error('Informe o identificador do agente.');
    const listas = {
      pode_sozinho: j.str(arr(d.pode_sozinho).map(x => s(x, 300))),
      exige_aprovacao: j.str(arr(d.exige_aprovacao).map(x => s(x, 300))),
      proibido: j.str(arr(d.proibido).map(x => s(x, 300))),
    };
    // 10.10: os TRÊS blocos são obrigatórios. Agente sem "proibido" escrito é
    // agente sem limite — o livro trata isso como falha de governança.
    if (!j.parse(listas.proibido, []).length) throw new Error('Escreva o que o agente NÃO pode fazer (bloco "proibido" do Cap. 10.10).');
    if (!j.parse(listas.exige_aprovacao, []).length) throw new Error('Escreva o que o agente só faz com aprovação humana (Cap. 10.10).');
    const agora = nowISO();
    const existe = um('SELECT id FROM agent_charters WHERE agente = ?', agente);
    if (existe) {
      patch('agent_charters', existe.id, {
        nome: s(d.nome, 200) || agente, escopo: s(d.escopo, 4000), ...listas,
        dados_acessa: s(d.dados_acessa, 2000), responsavel: s(d.responsavel, 120) || s(quem, 120),
        ativo: d.ativo === undefined ? 1 : bool(d.ativo), ultima_revisao: hoje(),
      });
      return um('SELECT * FROM agent_charters WHERE id = ?', existe.id);
    }
    const id = novoId();
    db.prepare(`INSERT INTO agent_charters (id, agente, nome, escopo, pode_sozinho, exige_aprovacao, proibido,
      dados_acessa, responsavel, ativo, ultima_revisao, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, agente, s(d.nome, 200) || agente, s(d.escopo, 4000), listas.pode_sozinho, listas.exige_aprovacao,
        listas.proibido, s(d.dados_acessa, 2000), s(d.responsavel, 120) || s(quem, 120),
        d.ativo === undefined ? 1 : bool(d.ativo), hoje(), agora, agora);
    return um('SELECT * FROM agent_charters WHERE id = ?', id);
  },
  remover(id) { return db.prepare('DELETE FROM agent_charters WHERE id = ?').run(id).changes; },
  // 47.12 "registro de tudo o que cada um fez": junta as cartas com as execuções
  central({ n = 100 } = {}) {
    const cartas = Agentes.listar();
    // ai_agents.id é o slug do especialista (civel, penal, contratual...)
    const agentesIA = todos('SELECT id, nome, especialidade, ativo FROM ai_agents ORDER BY nome');
    const execucoes = todos('SELECT * FROM ai_agent_runs ORDER BY quando DESC LIMIT ?', Math.min(int(n, 100), 300));
    const semCarta = agentesIA.filter(a => !cartas.some(c => c.agente === a.id));
    return { cartas, execucoes, agentes_ia: agentesIA, sem_carta: semCarta };
  },
};

module.exports = { Mural, POPs, Interno, Inventario, Agentes };
