// =====================================================================
// Villela Legal Intelligence — repositório (CRUD sobre o SQLite).
// Toda validação de enum/entrada mora aqui; as rotas só orquestram.
// Nenhuma função aqui decide PERMISSÃO (isso é do permissoes.js/rotas).
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { db, transacao, nowISO, novoId, sha256, j, docsDir, DATA_DIR } = require('./db');

// ---- enums (validados na escrita) ----
const E = {
  tipoCliente: ['potencial', 'ativo', 'inativo', 'ex_cliente', 'estrategico'],
  statusCase: ['ativo', 'suspenso', 'arquivado', 'encerrado', 'consultivo'],
  risco: ['provavel', 'possivel', 'remoto', ''],
  classifMov: ['informativo', 'prazo', 'decisao', 'despacho', 'sentenca', 'acordao', 'audiencia', 'intimacao', 'recurso', 'cumprimento', 'execucao', 'baixa', 'arquivamento', ''],
  statusPub: ['nova', 'lida', 'analisada', 'prazo_criado', 'cumprida', 'descartada', 'erro'],
  statusPrazo: ['identificado', 'em_analise', 'distribuido', 'em_elaboracao', 'em_revisao', 'aprovado', 'protocolado', 'cumprido', 'perdido', 'cancelado'],
  prioridade: ['alta', 'media', 'baixa'],
  statusTask: ['aberta', 'em_andamento', 'em_revisao', 'concluida', 'cancelada'],
  statusDoc: ['rascunho', 'revisao_pendente', 'aprovado', 'protocolado', 'enviado_cliente', 'arquivado'],
  sigiloDoc: ['interno', 'restrito', 'cliente'],
  tipoFin: ['honorario_contratual', 'honorario_exito', 'custas', 'diligencia', 'despesa', 'reembolso', 'repasse', 'recebimento_judicial', 'alvara', 'acordo'],
  statusFin: ['previsto', 'faturado', 'pago', 'repassado', 'cancelado'],
  tipoAudiencia: ['conciliacao', 'instrucao', 'julgamento', 'una', 'justificacao', 'custodia', 'outra'],
  statusAudiencia: ['agendada', 'realizada', 'adiada', 'cancelada'],
  modalidade: ['presencial', 'virtual', 'hibrida'],
};
const valida = (valor, lista, campo) => {
  if (valor == null || valor === '') return lista.includes('') ? '' : lista[0];
  if (!lista.includes(valor)) throw new Error(`Valor inválido para ${campo}: ${valor}`);
  return valor;
};
const s = (v, max = 4000) => String(v == null ? '' : v).trim().slice(0, max);
const cent = (v) => Math.round(Number(v || 0)); // já vem em centavos das rotas
// FK opcional: SQLite exige NULL (não '') quando não há vínculo — senão viola a FOREIGN KEY.
const fk = (v) => { const x = s(v, 40); return x === '' ? null : x; };

// Número CNJ: aceita com ou sem máscara; guarda sempre mascarado.
function normCNJ(n) {
  const d = String(n || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length !== 20) return s(n, 40); // fora do padrão: guarda como veio (processos antigos/administrativos)
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}

// =====================================================================
// AUDITORIA — grava quem fez o quê (chamada pelas rotas em toda escrita)
// =====================================================================
const Auditoria = {
  registrar({ user_id, quem, acao, entidade, entidade_id, detalhe, ip }) {
    try {
      db.prepare('INSERT INTO audit_logs (id, quando, user_id, quem, acao, entidade, entidade_id, detalhe, ip) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(novoId(), nowISO(), s(user_id, 40), s(quem, 120), s(acao, 80), s(entidade, 40), s(entidade_id, 40), s(detalhe, 300), s(ip, 60));
    } catch (_) { /* auditoria nunca derruba a operação */ }
  },
  listar({ n = 200, entidade, entidade_id } = {}) {
    let sql = 'SELECT * FROM audit_logs', where = [], args = [];
    if (entidade) { where.push('entidade = ?'); args.push(entidade); }
    if (entidade_id) { where.push('entidade_id = ?'); args.push(entidade_id); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY quando DESC LIMIT ?'; args.push(Math.min(Number(n) || 200, 500));
    return db.prepare(sql).all(...args);
  },
};

// =====================================================================
// CLIENTES
// =====================================================================
const Clientes = {
  listar({ busca = '', tipo = '', limite = 100, pagina = 0 } = {}) {
    let sql = 'SELECT * FROM clients', where = [], args = [];
    if (busca) { where.push('(nome LIKE ? OR email LIKE ? OR cpf_cnpj LIKE ?)'); const b = `%${busca}%`; args.push(b, b, b); }
    if (tipo) { where.push('tipo_cliente = ?'); args.push(tipo); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY nome LIMIT ? OFFSET ?'; args.push(Math.min(Number(limite) || 100, 300), Math.max(Number(pagina) || 0, 0) * (Number(limite) || 100));
    return db.prepare(sql).all(...args);
  },
  obter(id) {
    const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    if (!c) return null;
    c.contatos = db.prepare('SELECT * FROM client_contacts WHERE client_id = ? ORDER BY criado_em').all(id);
    c.consentimentos = db.prepare('SELECT * FROM client_consents WHERE client_id = ? ORDER BY quando DESC').all(id);
    c.notas = db.prepare('SELECT * FROM client_notes WHERE client_id = ? ORDER BY criado_em DESC LIMIT 50').all(id);
    c.processos = db.prepare('SELECT id, numero_cnj, tribunal, classe, status, fase, nucleo FROM cases WHERE client_id = ? ORDER BY atualizado_em DESC').all(id);
    c.preferencias_comunicacao = j.parse(c.preferencias_comunicacao, {});
    return c;
  },
  criar(d, autor) {
    const id = novoId(); const agora = nowISO();
    db.prepare(`INSERT INTO clients (id, tipo_pessoa, nome, cpf_cnpj, rg, estado_civil, profissao, email, whatsapp, endereco,
      tipo_cliente, origem, preferencias_comunicacao, obs, criado_por, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, d.tipo_pessoa === 'PJ' ? 'PJ' : 'PF', s(d.nome, 200) || 'Sem nome', s(d.cpf_cnpj, 20), s(d.rg, 20),
        s(d.estado_civil, 40), s(d.profissao, 80), s(d.email, 120), s(d.whatsapp, 20), s(d.endereco, 300),
        valida(d.tipo_cliente || 'potencial', E.tipoCliente, 'tipo_cliente'), s(d.origem, 80),
        j.str(d.preferencias_comunicacao || {}), s(d.obs, 2000), s(autor, 40), agora, agora);
    return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  },
  atualizar(id, d) {
    const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    if (!c) throw new Error('Cliente não encontrado.');
    const campos = ['tipo_pessoa', 'nome', 'cpf_cnpj', 'rg', 'estado_civil', 'profissao', 'email', 'whatsapp', 'endereco', 'origem', 'obs'];
    for (const campo of campos) if (d[campo] != null) c[campo] = s(d[campo], campo === 'obs' ? 2000 : 300);
    if (d.tipo_cliente != null) c.tipo_cliente = valida(d.tipo_cliente, E.tipoCliente, 'tipo_cliente');
    if (d.preferencias_comunicacao != null) c.preferencias_comunicacao = j.str(d.preferencias_comunicacao);
    db.prepare(`UPDATE clients SET tipo_pessoa=?, nome=?, cpf_cnpj=?, rg=?, estado_civil=?, profissao=?, email=?, whatsapp=?,
      endereco=?, tipo_cliente=?, origem=?, preferencias_comunicacao=?, obs=?, atualizado_em=? WHERE id=?`)
      .run(c.tipo_pessoa, c.nome, c.cpf_cnpj, c.rg, c.estado_civil, c.profissao, c.email, c.whatsapp,
        c.endereco, c.tipo_cliente, c.origem, c.preferencias_comunicacao, c.obs, nowISO(), id);
    return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  },
  addContato(clientId, d) {
    const id = novoId();
    db.prepare('INSERT INTO client_contacts (id, client_id, nome, papel, email, telefone, obs, criado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, clientId, s(d.nome, 120) || 'Contato', s(d.papel, 60), s(d.email, 120), s(d.telefone, 20), s(d.obs, 300), nowISO());
    return id;
  },
  addConsentimento(clientId, d) {
    const id = novoId();
    db.prepare('INSERT INTO client_consents (id, client_id, finalidade, base_legal, concedido, evidencia, quando, revogado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, clientId, s(d.finalidade, 120) || 'geral', s(d.base_legal, 120), d.concedido === false ? 0 : 1, s(d.evidencia, 300), nowISO(), '');
    return id;
  },
  addNota(clientId, d, autor) {
    const id = novoId();
    db.prepare('INSERT INTO client_notes (id, client_id, autor, texto, interna, criado_em) VALUES (?,?,?,?,?,?)')
      .run(id, clientId, s(autor, 120), s(d.texto, 4000), d.interna === false ? 0 : 1, nowISO());
    return id;
  },
};

// =====================================================================
// PROCESSOS
// =====================================================================
const Processos = {
  listar({ busca = '', status = '', nucleo = '', client_id = '', limite = 100, pagina = 0 } = {}) {
    // `andamentos_novos` = o que ainda não foi lido. É o que deixa o processo em
    // destaque na lista até alguém abrir e marcar como lido.
    let sql = `SELECT c.*, cl.nome AS cliente_nome,
      (SELECT COUNT(*) FROM case_movements m WHERE m.case_id = c.id AND m.lido = 0) AS andamentos_novos
      FROM cases c LEFT JOIN clients cl ON cl.id = c.client_id`, where = [], args = [];
    if (busca) { where.push('(c.numero_cnj LIKE ? OR c.assunto LIKE ? OR cl.nome LIKE ?)'); const b = `%${busca}%`; args.push(b, b, b); }
    if (status) { where.push('c.status = ?'); args.push(status); }
    if (nucleo) { where.push('c.nucleo = ?'); args.push(nucleo); }
    if (client_id) { where.push('c.client_id = ?'); args.push(client_id); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY c.atualizado_em DESC LIMIT ? OFFSET ?';
    args.push(Math.min(Number(limite) || 100, 300), Math.max(Number(pagina) || 0, 0) * (Number(limite) || 100));
    return db.prepare(sql).all(...args);
  },
  obter(id, { comSigilo = false } = {}) {
    const c = db.prepare('SELECT c.*, cl.nome AS cliente_nome FROM cases c LEFT JOIN clients cl ON cl.id = c.client_id WHERE c.id = ?').get(id);
    if (!c) return null;
    if (!comSigilo) { c.estrategia = c.estrategia ? '[restrito]' : ''; } // estratégia só p/ quem tem ver_dados_sensiveis
    c.partes = db.prepare('SELECT * FROM case_parties WHERE case_id = ?').all(id);
    c.advogados = db.prepare('SELECT * FROM case_lawyers WHERE case_id = ?').all(id);
    c.movimentos = db.prepare('SELECT id, data, descricao, classificacao, resumo, fonte, coletado_em, lido, lido_em, lido_por FROM case_movements WHERE case_id = ? ORDER BY data DESC LIMIT 30').all(id);
    c.andamentos_novos = Andamentos.naoLidos(id);   // destaque na tela até serem lidos
    c.prazos = db.prepare('SELECT * FROM deadlines WHERE case_id = ? ORDER BY data_fatal, data_interna').all(id);
    c.tarefas = db.prepare('SELECT * FROM tasks WHERE case_id = ? AND status != ? ORDER BY prazo').all(id, 'cancelada');
    c.documentos = db.prepare('SELECT id, titulo, tipo, sigilo, status, versao_atual, atualizado_em FROM documents WHERE case_id = ? ORDER BY atualizado_em DESC').all(id);
    return c;
  },
  criar(d, autor) {
    const id = novoId(); const agora = nowISO();
    const cnj = normCNJ(d.numero_cnj);
    if (cnj && db.prepare('SELECT id FROM cases WHERE numero_cnj = ?').get(cnj)) throw new Error('Já existe processo com esse número CNJ.');
    db.prepare(`INSERT INTO cases (id, numero_cnj, tribunal, instancia, classe, assunto, orgao_julgador, relator, valor_causa,
      status, fase, risco, prognostico, nucleo, advogado_resp, client_id, polo_cliente, estrategia, proximas_acoes, sigiloso,
      criado_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, cnj, s(d.tribunal, 40), s(d.instancia, 40), s(d.classe, 120), s(d.assunto, 300), s(d.orgao_julgador, 120),
        s(d.relator, 120), cent(d.valor_causa), valida(d.status || 'ativo', E.statusCase, 'status'), s(d.fase, 60),
        valida(d.risco || '', E.risco, 'risco'), s(d.prognostico, 300), s(d.nucleo, 30), s(d.advogado_resp, 40),
        fk(d.client_id), s(d.polo_cliente, 20), s(d.estrategia, 4000), s(d.proximas_acoes, 2000),
        d.sigiloso ? 1 : 0, s(autor, 40), agora, agora);
    return db.prepare('SELECT * FROM cases WHERE id = ?').get(id);
  },
  atualizar(id, d) {
    const c = db.prepare('SELECT * FROM cases WHERE id = ?').get(id);
    if (!c) throw new Error('Processo não encontrado.');
    const campos = ['tribunal', 'instancia', 'classe', 'assunto', 'orgao_julgador', 'relator', 'fase', 'prognostico', 'nucleo', 'advogado_resp', 'polo_cliente', 'estrategia', 'proximas_acoes'];
    for (const campo of campos) if (d[campo] != null) c[campo] = s(d[campo], 4000);
    if (d.client_id != null) c.client_id = fk(d.client_id);
    if (d.numero_cnj != null) c.numero_cnj = normCNJ(d.numero_cnj);
    if (d.valor_causa != null) c.valor_causa = cent(d.valor_causa);
    if (d.status != null) c.status = valida(d.status, E.statusCase, 'status');
    if (d.risco != null) c.risco = valida(d.risco, E.risco, 'risco');
    if (d.sigiloso != null) c.sigiloso = d.sigiloso ? 1 : 0;
    db.prepare(`UPDATE cases SET numero_cnj=?, tribunal=?, instancia=?, classe=?, assunto=?, orgao_julgador=?, relator=?,
      valor_causa=?, status=?, fase=?, risco=?, prognostico=?, nucleo=?, advogado_resp=?, client_id=?, polo_cliente=?,
      estrategia=?, proximas_acoes=?, sigiloso=?, atualizado_em=? WHERE id=?`)
      .run(c.numero_cnj, c.tribunal, c.instancia, c.classe, c.assunto, c.orgao_julgador, c.relator, c.valor_causa,
        c.status, c.fase, c.risco, c.prognostico, c.nucleo, c.advogado_resp, c.client_id, c.polo_cliente,
        c.estrategia, c.proximas_acoes, c.sigiloso, nowISO(), id);
    return db.prepare('SELECT * FROM cases WHERE id = ?').get(id);
  },
  addParte(caseId, d) {
    const id = novoId();
    db.prepare('INSERT INTO case_parties (id, case_id, polo, nome, doc, tipo) VALUES (?,?,?,?,?,?)')
      .run(id, caseId, s(d.polo, 20), s(d.nome, 200) || 'Parte', s(d.doc, 20), s(d.tipo, 40));
    return id;
  },
  addAdvogado(caseId, d) {
    const id = novoId();
    db.prepare('INSERT INTO case_lawyers (id, case_id, nome, oab, lado, user_id) VALUES (?,?,?,?,?,?)')
      .run(id, caseId, s(d.nome, 200) || 'Advogado', s(d.oab, 30), s(d.lado, 20), s(d.user_id, 40));
    return id;
  },
};

// =====================================================================
// ANDAMENTOS — dedupe por hash (coleta diária não duplica)
// =====================================================================
const Andamentos = {
  listar({ case_id, desde = '', limite = 100 } = {}) {
    let sql = 'SELECT * FROM case_movements WHERE case_id = ?', args = [case_id];
    if (desde) { sql += ' AND data >= ?'; args.push(desde); }
    sql += ' ORDER BY data DESC LIMIT ?'; args.push(Math.min(Number(limite) || 100, 500));
    return db.prepare(sql).all(...args);
  },
  // `lido`: andamento vindo de coleta nasce NÃO lido (é novidade a tratar); o
  // que o próprio advogado lança à mão nasce lido — ele acabou de escrever.
  criar(caseId, d, autor, { lido = false } = {}) {
    if (!db.prepare('SELECT id FROM cases WHERE id = ?').get(caseId)) throw new Error('Processo não encontrado.');
    const data = s(d.data, 30) || nowISO().slice(0, 10);
    const descricao = s(d.descricao, 4000);
    if (!descricao) throw new Error('Informe a descrição do andamento.');
    const hash = sha256(caseId + '|' + data + '|' + descricao);
    if (db.prepare('SELECT id FROM case_movements WHERE hash_dedupe = ?').get(hash)) return { duplicado: true };
    const id = novoId();
    db.prepare(`INSERT INTO case_movements (id, case_id, data, descricao, classificacao, resumo, fonte, payload_raw, hash_dedupe, coletado_em, criado_por, lido, lido_em, lido_por)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, caseId, data, descricao, valida(d.classificacao || '', E.classifMov, 'classificacao'), s(d.resumo, 2000),
        s(d.fonte, 30) || 'manual', d.payload_raw ? j.str(d.payload_raw) : '', hash, nowISO(), s(autor, 40),
        lido ? 1 : 0, lido ? nowISO() : '', lido ? s(autor, 40) : '');
    db.prepare('UPDATE cases SET atualizado_em = ? WHERE id = ?').run(nowISO(), caseId);
    return { id, duplicado: false };
  },
  // Marca como lido o processo inteiro (padrão) ou um andamento específico.
  // Idempotente: marcar de novo devolve 0 e não mexe em quem já estava lido.
  marcarLidos(caseId, quem, { movement_id = '' } = {}) {
    if (!db.prepare('SELECT id FROM cases WHERE id = ?').get(caseId)) throw new Error('Processo não encontrado.');
    const agora = nowISO(), autor = s(quem, 120);
    const r = movement_id
      ? db.prepare('UPDATE case_movements SET lido=1, lido_em=?, lido_por=? WHERE id=? AND case_id=? AND lido=0').run(agora, autor, s(movement_id, 40), caseId)
      : db.prepare('UPDATE case_movements SET lido=1, lido_em=?, lido_por=? WHERE case_id=? AND lido=0').run(agora, autor, caseId);
    return { marcados: r.changes || 0 };
  },
  // Volta a marcar como NÃO lido (para reabrir a novidade que se tratou por engano).
  marcarNaoLido(caseId, movementId) {
    const r = db.prepare("UPDATE case_movements SET lido=0, lido_em='', lido_por='' WHERE id=? AND case_id=?")
      .run(s(movementId, 40), caseId);
    return { alterados: r.changes || 0 };
  },
  naoLidos(caseId) {
    return db.prepare('SELECT COUNT(*) n FROM case_movements WHERE case_id = ? AND lido = 0').get(caseId).n;
  },
};

// =====================================================================
// PUBLICAÇÕES
// =====================================================================
// Extrai o 1º número CNJ que aparecer no texto da publicação (o DJEN costuma
// trazer o número no corpo). Serve para vincular a publicação ao processo já
// cadastrado quando a coleta não veio com case_id.
function cnjDoTexto(texto) {
  const m = String(texto || '').match(/\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/);
  return m ? normCNJ(m[0]) : '';
}

const Publicacoes = {
  // busca/paginação: o painel precisa mostrar as NOVAS e também as ANTERIORES
  // (a triagem move o status, e o histórico tem que continuar acessível).
  listar({ status = '', case_id = '', fonte = '', busca = '', desde = '', ate = '', limite = 100, pagina = 0 } = {}) {
    const { where, args } = Publicacoes._filtro({ status, case_id, fonte, busca, desde, ate });
    let sql = `SELECT p.*, c.numero_cnj, c.assunto AS case_assunto FROM case_publications p
      LEFT JOIN cases c ON c.id = p.case_id`;
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    const lim = Math.min(Number(limite) || 100, 500);
    const off = Math.max(Number(pagina) || 0, 0) * lim;
    sql += ' ORDER BY p.data_publicacao DESC, p.coletado_em DESC LIMIT ? OFFSET ?';
    return db.prepare(sql).all(...args, lim, off);
  },
  contar({ status = '', case_id = '', fonte = '', busca = '', desde = '', ate = '' } = {}) {
    const { where, args } = Publicacoes._filtro({ status, case_id, fonte, busca, desde, ate });
    let sql = 'SELECT COUNT(*) n FROM case_publications p';
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    return db.prepare(sql).get(...args).n;
  },
  _filtro({ status, case_id, fonte, busca, desde, ate }) {
    const where = [], args = [];
    if (status) { where.push('p.status = ?'); args.push(status); }
    if (case_id) { where.push('p.case_id = ?'); args.push(case_id); }
    if (fonte) { where.push('p.fonte = ?'); args.push(fonte); }
    if (busca) { where.push('(p.texto LIKE ? OR p.orgao LIKE ? OR p.resumo LIKE ?)'); const b = `%${s(busca, 120)}%`; args.push(b, b, b); }
    if (desde) { where.push('p.data_publicacao >= ?'); args.push(s(desde, 10)); }
    if (ate) { where.push('p.data_publicacao <= ?'); args.push(s(ate, 10)); }
    return { where, args };
  },
  // ficha completa: texto INTEGRAL + processo vinculado + andamento gerado +
  // prazos que nasceram desta publicação. É o que a tela abre com um clique.
  obter(id) {
    const p = db.prepare(`SELECT p.*, c.numero_cnj, c.assunto AS case_assunto FROM case_publications p
      LEFT JOIN cases c ON c.id = p.case_id WHERE p.id = ?`).get(id);
    if (!p) throw new Error('Publicação não encontrada.');
    p.payload_raw = j.parse(p.payload_raw, null);
    p.cnj_detectado = p.numero_cnj || cnjDoTexto(p.texto);
    p.andamento = p.movement_id ? db.prepare('SELECT * FROM case_movements WHERE id = ?').get(p.movement_id) || null : null;
    p.prazos = db.prepare('SELECT id, titulo, tipo, data_fatal, data_interna, status, validado_por FROM deadlines WHERE publication_id = ? ORDER BY data_fatal').all(id);
    return p;
  },
  criar(d, autor) {
    const texto = s(d.texto, 20000);
    if (!texto) throw new Error('Informe o texto da publicação.');
    const hash = sha256(s(d.fonte, 30) + '|' + s(d.data_publicacao, 30) + '|' + texto);
    const jaExiste = db.prepare('SELECT id FROM case_publications WHERE hash_dedupe = ?').get(hash);
    if (jaExiste) return { duplicado: true, id: jaExiste.id };
    const id = novoId();
    // vínculo com o processo: o que veio na coleta, ou o CNJ que estiver no texto
    let caseId = fk(d.case_id);
    if (!caseId) {
      const cnj = cnjDoTexto(texto);
      const k = cnj ? db.prepare('SELECT id FROM cases WHERE numero_cnj = ?').get(cnj) : null;
      if (k) caseId = k.id;
    }
    db.prepare(`INSERT INTO case_publications (id, case_id, fonte, data_publicacao, orgao, texto, match_por, tem_prazo, status,
      resumo, payload_raw, hash_dedupe, coletado_em, criado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, caseId, s(d.fonte, 30) || 'manual', s(d.data_publicacao, 30), s(d.orgao, 120), texto,
        s(d.match_por, 40), d.tem_prazo ? 1 : 0, valida(d.status || 'nova', E.statusPub, 'status'),
        s(d.resumo, 2000), d.payload_raw ? j.str(d.payload_raw) : '', hash, nowISO(), s(autor, 40));
    // o conteúdo da publicação vira ANDAMENTO do processo assim que há vínculo
    // (é a linha do tempo do caso). Sem processo vinculado fica para a triagem,
    // que escolhe o processo na tela. `gerar_andamento:false` desliga.
    let andamento = null;
    if (caseId && d.gerar_andamento !== false) {
      try { andamento = Publicacoes.virarAndamento(id, {}, autor); } catch (_) { /* nunca derruba a ingestão */ }
    }
    return { id, duplicado: false, case_id: caseId || '', movement_id: andamento ? andamento.movement_id : '' };
  },
  // Salva o CONTEÚDO da publicação como andamento do processo. Idempotente: o
  // dedupe do andamento é por (processo+data+descrição), então reconverter a
  // mesma publicação devolve o andamento que já existe em vez de duplicar.
  virarAndamento(id, { case_id = '', classificacao = '', data = '' } = {}, autor) {
    return transacao(() => {
      const p = db.prepare('SELECT * FROM case_publications WHERE id = ?').get(id);
      if (!p) throw new Error('Publicação não encontrada.');
      let alvo = fk(case_id) || p.case_id;
      if (!alvo) {
        const cnj = cnjDoTexto(p.texto);
        const k = cnj ? db.prepare('SELECT id FROM cases WHERE numero_cnj = ?').get(cnj) : null;
        if (k) alvo = k.id;
      }
      if (!alvo) throw new Error('Publicação sem processo vinculado — escolha o processo para salvar o andamento.');
      if (!db.prepare('SELECT id FROM cases WHERE id = ?').get(alvo)) throw new Error('Processo não encontrado.');

      const classif = classificacao || (p.tem_prazo ? 'intimacao' : 'informativo');
      const quando = s(data, 30) || p.data_publicacao || nowISO().slice(0, 10);
      const r = Andamentos.criar(alvo, {
        data: quando, descricao: p.texto, classificacao: classif, resumo: p.resumo,
        fonte: p.fonte || 'publicacao',
        payload_raw: { publicacao_id: p.id, orgao: p.orgao, match_por: p.match_por, origem: 'publicacao' },
      }, autor);
      // dedupe devolve {duplicado:true} sem id — recupera o andamento existente
      let movId = r.id;
      if (!movId) {
        const existente = db.prepare('SELECT id FROM case_movements WHERE hash_dedupe = ?')
          .get(sha256(alvo + '|' + quando + '|' + s(p.texto, 4000)));
        movId = existente ? existente.id : '';
      }
      // triagem: publicação com andamento salvo deixa de ser "nova"
      const novoStatus = (p.status === 'nova' || p.status === 'lida') ? 'analisada' : p.status;
      db.prepare('UPDATE case_publications SET case_id=?, movement_id=?, status=? WHERE id=?')
        .run(alvo, movId, novoStatus, id);
      return { movement_id: movId, case_id: alvo, duplicado: !!r.duplicado, status: novoStatus };
    });
  },
  atualizar(id, d) {
    const p = db.prepare('SELECT * FROM case_publications WHERE id = ?').get(id);
    if (!p) throw new Error('Publicação não encontrada.');
    if (d.status != null) p.status = valida(d.status, E.statusPub, 'status');
    if (d.case_id != null) p.case_id = fk(d.case_id);
    if (d.resumo != null) p.resumo = s(d.resumo, 2000);
    if (d.tem_prazo != null) p.tem_prazo = d.tem_prazo ? 1 : 0;
    db.prepare('UPDATE case_publications SET status=?, case_id=?, resumo=?, tem_prazo=? WHERE id=?')
      .run(p.status, p.case_id, p.resumo, p.tem_prazo, id);
    return p;
  },
};

// =====================================================================
// PRAZOS — sugestão de cálculo NUNCA vira prazo válido sem validado_por
// =====================================================================
const Prazos = {
  listar({ status = '', responsavel = '', ate = '', limite = 200 } = {}) {
    let sql = `SELECT d.*, c.numero_cnj FROM deadlines d LEFT JOIN cases c ON c.id = d.case_id`, where = [], args = [];
    if (status) { where.push('d.status = ?'); args.push(status); }
    else { where.push("d.status NOT IN ('cumprido','cancelado')"); }
    if (responsavel) { where.push('d.responsavel = ?'); args.push(responsavel); }
    if (ate) { where.push("(d.data_fatal != '' AND d.data_fatal <= ?)"); args.push(ate); }
    sql += ' WHERE ' + where.join(' AND ');
    sql += " ORDER BY CASE WHEN d.data_fatal = '' THEN 1 ELSE 0 END, d.data_fatal, d.data_interna LIMIT ?";
    args.push(Math.min(Number(limite) || 200, 500));
    return db.prepare(sql).all(...args);
  },
  criar(d, autor) {
    const id = novoId(); const agora = nowISO();
    db.prepare(`INSERT INTO deadlines (id, case_id, publication_id, movement_id, titulo, tipo, data_interna, data_fatal,
      responsavel, revisor, prioridade, status, calculo_sugerido, validado_por, obs, criado_por, criado_em, atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, fk(d.case_id), s(d.publication_id, 40), s(d.movement_id, 40), s(d.titulo, 300) || 'Prazo',
        d.tipo === 'fatal' ? 'fatal' : 'interno', s(d.data_interna, 30), s(d.data_fatal, 30), s(d.responsavel, 40),
        s(d.revisor, 40), valida(d.prioridade || 'media', E.prioridade, 'prioridade'),
        valida(d.status || 'identificado', E.statusPrazo, 'status'), s(d.calculo_sugerido, 2000),
        s(d.validado_por, 40), s(d.obs, 2000), s(autor, 40), agora, agora);
    Prazos._evento(id, autor, 'criado' + (d.calculo_sugerido ? ' (cálculo sugerido — requer validação humana)' : ''));
    return db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id);
  },
  atualizar(id, d, autor) {
    const p = db.prepare('SELECT * FROM deadlines WHERE id = ?').get(id);
    if (!p) throw new Error('Prazo não encontrado.');
    const mudancas = [];
    if (d.status != null && d.status !== p.status) {
      const novo = valida(d.status, E.statusPrazo, 'status');
      // trava de segurança: prazo com cálculo sugerido não avança sem validação humana
      const avancado = ['em_elaboracao', 'em_revisao', 'aprovado', 'protocolado', 'cumprido'];
      const validado = s(d.validado_por, 40) || p.validado_por;
      if (avancado.includes(novo) && p.calculo_sugerido && !validado) {
        throw new Error('Este prazo tem cálculo sugerido automaticamente — informe validado_por (advogado) antes de avançar o status.');
      }
      mudancas.push(`status: ${p.status} → ${novo}`); p.status = novo;
    }
    for (const campo of ['titulo', 'data_interna', 'data_fatal', 'responsavel', 'revisor', 'obs', 'validado_por', 'calculo_sugerido']) {
      if (d[campo] != null && s(d[campo], 2000) !== p[campo]) { mudancas.push(campo + ' alterado'); p[campo] = s(d[campo], 2000); }
    }
    if (d.prioridade != null) p.prioridade = valida(d.prioridade, E.prioridade, 'prioridade');
    if (d.tipo != null) p.tipo = d.tipo === 'fatal' ? 'fatal' : 'interno';
    db.prepare(`UPDATE deadlines SET titulo=?, tipo=?, data_interna=?, data_fatal=?, responsavel=?, revisor=?, prioridade=?,
      status=?, calculo_sugerido=?, validado_por=?, obs=?, atualizado_em=? WHERE id=?`)
      .run(p.titulo, p.tipo, p.data_interna, p.data_fatal, p.responsavel, p.revisor, p.prioridade,
        p.status, p.calculo_sugerido, p.validado_por, p.obs, nowISO(), id);
    if (mudancas.length) Prazos._evento(id, autor, mudancas.join('; '));
    return p;
  },
  eventos(id) { return db.prepare('SELECT * FROM deadline_events WHERE deadline_id = ? ORDER BY quando DESC').all(id); },
  _evento(deadlineId, quem, evento) {
    db.prepare('INSERT INTO deadline_events (id, deadline_id, quando, quem, evento) VALUES (?,?,?,?,?)')
      .run(novoId(), deadlineId, nowISO(), s(quem, 120), s(evento, 500));
  },
};

// =====================================================================
// TAREFAS
// =====================================================================
const Tarefas = {
  listar({ status = '', responsavel = '', case_id = '', limite = 200 } = {}) {
    let sql = `SELECT t.*, c.numero_cnj FROM tasks t LEFT JOIN cases c ON c.id = t.case_id`, where = [], args = [];
    if (status) { where.push('t.status = ?'); args.push(status); }
    else { where.push("t.status NOT IN ('concluida','cancelada')"); }
    if (responsavel) { where.push('t.responsavel = ?'); args.push(responsavel); }
    if (case_id) { where.push('t.case_id = ?'); args.push(case_id); }
    sql += ' WHERE ' + where.join(' AND ') + " ORDER BY CASE WHEN t.prazo = '' THEN 1 ELSE 0 END, t.prazo LIMIT ?";
    args.push(Math.min(Number(limite) || 200, 500));
    return db.prepare(sql).all(...args).map(t => ({ ...t, checklist: j.parse(t.checklist, []) }));
  },
  criar(d, autor) {
    const id = novoId(); const agora = nowISO();
    db.prepare(`INSERT INTO tasks (id, case_id, client_id, deadline_id, titulo, descricao, nucleo, responsavel, prazo,
      prioridade, status, checklist, criado_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, fk(d.case_id), fk(d.client_id), s(d.deadline_id, 40), s(d.titulo, 300) || 'Tarefa',
        s(d.descricao, 4000), s(d.nucleo, 30), s(d.responsavel, 40), s(d.prazo, 30),
        valida(d.prioridade || 'media', E.prioridade, 'prioridade'), valida(d.status || 'aberta', E.statusTask, 'status'),
        j.str(Array.isArray(d.checklist) ? d.checklist : []), s(autor, 40), agora, agora);
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  },
  atualizar(id, d, autor) {
    const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!t) throw new Error('Tarefa não encontrada.');
    for (const campo of ['titulo', 'descricao', 'nucleo', 'responsavel', 'prazo']) {
      if (d[campo] != null) t[campo] = s(d[campo], 4000);
    }
    if (d.case_id != null) t.case_id = fk(d.case_id);
    if (d.client_id != null) t.client_id = fk(d.client_id);
    if (d.prioridade != null) t.prioridade = valida(d.prioridade, E.prioridade, 'prioridade');
    if (d.status != null && d.status !== t.status) {
      const novo = valida(d.status, E.statusTask, 'status');
      db.prepare('INSERT INTO task_status_history (id, task_id, de, para, quem, quando) VALUES (?,?,?,?,?,?)')
        .run(novoId(), id, t.status, novo, s(autor, 120), nowISO());
      t.status = novo;
    }
    if (d.checklist != null) t.checklist = j.str(Array.isArray(d.checklist) ? d.checklist : []);
    db.prepare(`UPDATE tasks SET case_id=?, client_id=?, titulo=?, descricao=?, nucleo=?, responsavel=?, prazo=?,
      prioridade=?, status=?, checklist=?, atualizado_em=? WHERE id=?`)
      .run(t.case_id, t.client_id, t.titulo, t.descricao, t.nucleo, t.responsavel, t.prazo, t.prioridade, t.status, t.checklist, nowISO(), id);
    return t;
  },
  addComentario(taskId, texto, autor) {
    const id = novoId();
    db.prepare('INSERT INTO task_comments (id, task_id, autor, texto, criado_em) VALUES (?,?,?,?,?)')
      .run(id, taskId, s(autor, 120), s(texto, 4000), nowISO());
    return id;
  },
  comentarios(taskId) { return db.prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY criado_em').all(taskId); },
  historico(taskId) { return db.prepare('SELECT * FROM task_status_history WHERE task_id = ? ORDER BY quando DESC').all(taskId); },
  // Kanban: todas as ativas (+ concluídas recentes) agrupadas por status
  kanban() {
    const ativas = db.prepare(`SELECT t.*, c.numero_cnj FROM tasks t LEFT JOIN cases c ON c.id = t.case_id
      WHERE t.status IN ('aberta','em_andamento','em_revisao') ORDER BY CASE WHEN t.prazo = '' THEN 1 ELSE 0 END, t.prazo`).all();
    const concluidas = db.prepare(`SELECT t.*, c.numero_cnj FROM tasks t LEFT JOIN cases c ON c.id = t.case_id
      WHERE t.status = 'concluida' ORDER BY t.atualizado_em DESC LIMIT 15`).all();
    const cols = { aberta: [], em_andamento: [], em_revisao: [], concluida: concluidas };
    for (const t of ativas) cols[t.status].push(t);
    return cols;
  },
};

// =====================================================================
// AUDIÊNCIAS (Fase 2 — Módulo 15)
// =====================================================================
const Audiencias = {
  listar({ case_id = '', status = '', desde = '', ate = '', limite = 200 } = {}) {
    let sql = `SELECT h.*, c.numero_cnj, cl.nome AS cliente_nome FROM hearings h
      LEFT JOIN cases c ON c.id = h.case_id LEFT JOIN clients cl ON cl.id = c.client_id`, where = [], args = [];
    if (case_id) { where.push('h.case_id = ?'); args.push(case_id); }
    if (status) { where.push('h.status = ?'); args.push(status); }
    if (desde) { where.push('h.data_hora >= ?'); args.push(desde); }
    if (ate) { where.push('h.data_hora <= ?'); args.push(ate + 'T23:59'); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY h.data_hora LIMIT ?'; args.push(Math.min(Number(limite) || 200, 500));
    return db.prepare(sql).all(...args);
  },
  obter(id, { comSigilo = false } = {}) {
    const h = db.prepare(`SELECT h.*, c.numero_cnj, cl.nome AS cliente_nome FROM hearings h
      LEFT JOIN cases c ON c.id = h.case_id LEFT JOIN clients cl ON cl.id = c.client_id WHERE h.id = ?`).get(id);
    if (!h) return null;
    if (!comSigilo) h.estrategia = h.estrategia ? '[restrito]' : '';
    h.participantes = db.prepare('SELECT * FROM hearing_participants WHERE hearing_id = ?').all(id);
    h.providencias = db.prepare('SELECT * FROM hearing_followups WHERE hearing_id = ? ORDER BY criado_em').all(id);
    return h;
  },
  criar(d, autor) {
    if (!d.data_hora || !/^\d{4}-\d{2}-\d{2}/.test(String(d.data_hora))) throw new Error('Informe data/hora da audiência.');
    const id = novoId(); const agora = nowISO();
    db.prepare(`INSERT INTO hearings (id, case_id, tipo, data_hora, modalidade, local_link, juizo, status, docs_necessarios,
      roteiro, estrategia, resultado, ata_doc_id, obs, criado_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, fk(d.case_id), valida(d.tipo || 'conciliacao', E.tipoAudiencia, 'tipo'), s(d.data_hora, 20),
        valida(d.modalidade || 'presencial', E.modalidade, 'modalidade'), s(d.local_link, 300), s(d.juizo, 160),
        valida(d.status || 'agendada', E.statusAudiencia, 'status'), s(d.docs_necessarios, 2000),
        s(d.roteiro, 8000), s(d.estrategia, 4000), s(d.resultado, 4000), s(d.ata_doc_id, 40), s(d.obs, 2000),
        s(autor, 40), agora, agora);
    return db.prepare('SELECT * FROM hearings WHERE id = ?').get(id);
  },
  atualizar(id, d) {
    const h = db.prepare('SELECT * FROM hearings WHERE id = ?').get(id);
    if (!h) throw new Error('Audiência não encontrada.');
    for (const campo of ['data_hora', 'local_link', 'juizo', 'docs_necessarios', 'roteiro', 'estrategia', 'resultado', 'ata_doc_id', 'obs']) {
      if (d[campo] != null) h[campo] = s(d[campo], 8000);
    }
    if (d.case_id != null) h.case_id = fk(d.case_id);
    if (d.tipo != null) h.tipo = valida(d.tipo, E.tipoAudiencia, 'tipo');
    if (d.modalidade != null) h.modalidade = valida(d.modalidade, E.modalidade, 'modalidade');
    if (d.status != null) h.status = valida(d.status, E.statusAudiencia, 'status');
    db.prepare(`UPDATE hearings SET case_id=?, tipo=?, data_hora=?, modalidade=?, local_link=?, juizo=?, status=?,
      docs_necessarios=?, roteiro=?, estrategia=?, resultado=?, ata_doc_id=?, obs=?, atualizado_em=? WHERE id=?`)
      .run(h.case_id, h.tipo, h.data_hora, h.modalidade, h.local_link, h.juizo, h.status,
        h.docs_necessarios, h.roteiro, h.estrategia, h.resultado, h.ata_doc_id, h.obs, nowISO(), id);
    return h;
  },
  addParticipante(hearingId, d) {
    if (!db.prepare('SELECT id FROM hearings WHERE id = ?').get(hearingId)) throw new Error('Audiência não encontrada.');
    const id = novoId();
    db.prepare('INSERT INTO hearing_participants (id, hearing_id, tipo, nome, contato, intimado, obs) VALUES (?,?,?,?,?,?,?)')
      .run(id, hearingId, ['parte', 'testemunha', 'advogado', 'preposto', 'perito', 'outro'].includes(d.tipo) ? d.tipo : 'testemunha',
        s(d.nome, 160) || 'Participante', s(d.contato, 60), d.intimado ? 1 : 0, s(d.obs, 300));
    return id;
  },
  rmParticipante(id) { db.prepare('DELETE FROM hearing_participants WHERE id = ?').run(id); },
  addProvidencia(hearingId, d, taskId) {
    if (!db.prepare('SELECT id FROM hearings WHERE id = ?').get(hearingId)) throw new Error('Audiência não encontrada.');
    const id = novoId();
    db.prepare('INSERT INTO hearing_followups (id, hearing_id, descricao, responsavel, prazo, status, task_id, criado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, hearingId, s(d.descricao, 500) || 'Providência', s(d.responsavel, 40), s(d.prazo, 30), 'pendente', s(taskId, 40), nowISO());
    return id;
  },
  providenciaStatus(id, status) {
    if (!['pendente', 'concluida', 'cancelada'].includes(status)) throw new Error('Status inválido.');
    db.prepare('UPDATE hearing_followups SET status = ? WHERE id = ?').run(status, id);
  },
};

// =====================================================================
// AGENDA UNIFICADA (Fase 2) — prazos + audiências dos próximos N dias
// =====================================================================
const Agenda = {
  proxima(dias = 30) {
    const hoje = nowISO().slice(0, 10);
    const ate = new Date(Date.now() + Math.min(Number(dias) || 30, 120) * 86400000).toISOString().slice(0, 10);
    const prazos = db.prepare(`SELECT d.id, d.titulo, d.tipo, d.data_fatal, d.data_interna, d.prioridade, d.status, d.validado_por, d.calculo_sugerido, c.numero_cnj
      FROM deadlines d LEFT JOIN cases c ON c.id = d.case_id
      WHERE d.status NOT IN ('cumprido','cancelado','perdido')
        AND ((d.data_fatal != '' AND d.data_fatal <= ?) OR (d.data_interna != '' AND d.data_interna <= ?))
      ORDER BY CASE WHEN d.data_fatal = '' THEN d.data_interna ELSE d.data_fatal END`).all(ate, ate);
    const audiencias = db.prepare(`SELECT h.id, h.tipo, h.data_hora, h.modalidade, h.local_link, h.juizo, h.status, c.numero_cnj, cl.nome AS cliente_nome
      FROM hearings h LEFT JOIN cases c ON c.id = h.case_id LEFT JOIN clients cl ON cl.id = c.client_id
      WHERE h.status = 'agendada' AND h.data_hora >= ? AND h.data_hora <= ? ORDER BY h.data_hora`).all(hoje, ate + 'T23:59');
    return { hoje, ate, prazos, audiencias };
  },
};

// =====================================================================
// IMPORTAÇÃO DO LEGADO (Fase 2) — prazos-juridicos.json do portal antigo
// Idempotente: cada prazo legado é marcado com [legado:<id>] na obs.
// A tela antiga continua funcionando; isto só ESPELHA para o módulo novo.
// =====================================================================
const Legado = {
  importarPrazos(autor) {
    const f = path.join(DATA_DIR, 'prazos-juridicos.json');
    if (!fs.existsSync(f)) return { encontrados: 0, importados: 0, pulados: 0, detalhe: 'prazos-juridicos.json não existe neste DATA_DIR.' };
    let legado = [];
    try { legado = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error('prazos-juridicos.json inválido: ' + e.message); }
    if (!Array.isArray(legado)) legado = [];
    const mapaStatus = { aberto: 'identificado', cumprido: 'cumprido', cancelado: 'cancelado' };
    let importados = 0, pulados = 0;
    for (const p of legado) {
      const marca = `[legado:${p.id}]`;
      if (db.prepare("SELECT id FROM deadlines WHERE obs LIKE ?").get('%' + marca + '%')) { pulados++; continue; }
      const cnj = normCNJ(p.processo);
      const kase = cnj ? db.prepare('SELECT id FROM cases WHERE numero_cnj = ?').get(cnj) : null;
      const obs = [p.processo && 'Processo: ' + p.processo, p.tribunal && 'Tribunal: ' + p.tribunal,
        p.fonte && 'Fonte: ' + p.fonte, p.link && 'Link: ' + p.link, p.obs, marca].filter(Boolean).join(' · ');
      Prazos.criar({
        case_id: kase ? kase.id : '', titulo: p.descricao || 'Prazo importado', tipo: 'fatal',
        data_fatal: (p.dataLimite || '').slice(0, 10), prioridade: p.prioridade,
        status: mapaStatus[p.status] || 'identificado', obs,
        validado_por: p.quem || 'legado (validado no portal antigo)', // legado era gerido por humano; sem cálculo automático
      }, autor);
      importados++;
    }
    return { encontrados: legado.length, importados, pulados };
  },
};

// =====================================================================
// DOCUMENTOS — arquivo no disco (DATA_DIR/legal/docs), metadados no banco
// =====================================================================
const EXTENSOES_OK = new Set(['.pdf', '.docx', '.doc', '.odt', '.txt', '.md', '.png', '.jpg', '.jpeg', '.webp', '.xlsx', '.csv', '.mp3', '.mp4', '.ogg', '.zip']);
const Documentos = {
  listar({ busca = '', case_id = '', client_id = '', limite = 100 } = {}) {
    let sql = 'SELECT * FROM documents', where = [], args = [];
    if (busca) { where.push('titulo LIKE ?'); args.push(`%${busca}%`); }
    if (case_id) { where.push('case_id = ?'); args.push(case_id); }
    if (client_id) { where.push('client_id = ?'); args.push(client_id); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY atualizado_em DESC LIMIT ?'; args.push(Math.min(Number(limite) || 100, 300));
    return db.prepare(sql).all(...args);
  },
  obter(id) {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!doc) return null;
    doc.versoes = db.prepare('SELECT id, versao, nome_original, mime, tamanho, sha256, motivo, criado_por, criado_em FROM document_versions WHERE document_id = ? ORDER BY versao DESC').all(id);
    return doc;
  },
  // cria documento com a 1ª versão (conteúdo base64) — mesmo fluxo de upload dos contratos do portal
  criar(d, autor) {
    const nome = s(d.nome_original, 200) || 'arquivo';
    const ext = path.extname(nome).toLowerCase();
    if (!EXTENSOES_OK.has(ext)) throw new Error('Extensão não permitida: ' + (ext || '(sem extensão)'));
    const buf = Buffer.from(String(d.base64 || ''), 'base64');
    if (!buf.length) throw new Error('Arquivo vazio.');
    if (buf.length > 10 * 1024 * 1024) throw new Error('Arquivo acima de 10 MB (limite do upload em base64).');
    return transacao(() => {
      const id = novoId(); const agora = nowISO();
      const arquivo = id + '-v1' + ext;
      fs.writeFileSync(path.join(docsDir(),arquivo), buf);
      db.prepare(`INSERT INTO documents (id, client_id, case_id, task_id, titulo, tipo, pasta, sigilo, status, versao_atual,
        criado_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, fk(d.client_id), fk(d.case_id), s(d.task_id, 40), s(d.titulo, 300) || nome, s(d.tipo, 40),
          s(d.pasta, 120), valida(d.sigilo || 'interno', E.sigiloDoc, 'sigilo'),
          valida(d.status || 'rascunho', E.statusDoc, 'status'), 1, s(autor, 40), agora, agora);
      db.prepare(`INSERT INTO document_versions (id, document_id, versao, arquivo, nome_original, mime, tamanho, sha256, motivo, criado_por, criado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(novoId(), id, 1, arquivo, nome, s(d.mime, 100), buf.length, sha256(buf), 'versão inicial', s(autor, 40), agora);
      return id;
    });
  },
  novaVersao(docId, d, autor) {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
    if (!doc) throw new Error('Documento não encontrado.');
    const nome = s(d.nome_original, 200) || 'arquivo';
    const ext = path.extname(nome).toLowerCase();
    if (!EXTENSOES_OK.has(ext)) throw new Error('Extensão não permitida: ' + ext);
    const buf = Buffer.from(String(d.base64 || ''), 'base64');
    if (!buf.length) throw new Error('Arquivo vazio.');
    if (buf.length > 10 * 1024 * 1024) throw new Error('Arquivo acima de 10 MB.');
    return transacao(() => {
      const versao = doc.versao_atual + 1;
      const arquivo = docId + '-v' + versao + ext;
      fs.writeFileSync(path.join(docsDir(),arquivo), buf);
      db.prepare(`INSERT INTO document_versions (id, document_id, versao, arquivo, nome_original, mime, tamanho, sha256, motivo, criado_por, criado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(novoId(), docId, versao, arquivo, nome, s(d.mime, 100), buf.length, sha256(buf), s(d.motivo, 300) || 'nova versão', s(autor, 40), nowISO());
      db.prepare('UPDATE documents SET versao_atual = ?, atualizado_em = ? WHERE id = ?').run(versao, nowISO(), docId);
      return versao;
    });
  },
  atualizar(id, d) {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!doc) throw new Error('Documento não encontrado.');
    for (const campo of ['titulo', 'tipo', 'pasta', 'task_id']) if (d[campo] != null) doc[campo] = s(d[campo], 300);
    if (d.client_id != null) doc.client_id = fk(d.client_id);
    if (d.case_id != null) doc.case_id = fk(d.case_id);
    if (d.sigilo != null) doc.sigilo = valida(d.sigilo, E.sigiloDoc, 'sigilo');
    if (d.status != null) doc.status = valida(d.status, E.statusDoc, 'status');
    db.prepare('UPDATE documents SET titulo=?, tipo=?, pasta=?, client_id=?, case_id=?, task_id=?, sigilo=?, status=?, atualizado_em=? WHERE id=?')
      .run(doc.titulo, doc.tipo, doc.pasta, doc.client_id, doc.case_id, doc.task_id, doc.sigilo, doc.status, nowISO(), id);
    return doc;
  },
  // caminho absoluto de uma versão p/ download (mais recente por padrão)
  caminhoArquivo(docId, versao) {
    const v = versao
      ? db.prepare('SELECT * FROM document_versions WHERE document_id = ? AND versao = ?').get(docId, Number(versao))
      : db.prepare('SELECT * FROM document_versions WHERE document_id = ? ORDER BY versao DESC LIMIT 1').get(docId);
    if (!v) return null;
    const p = path.join(docsDir(),path.basename(v.arquivo)); // basename: nunca sair da pasta
    return fs.existsSync(p) ? { caminho: p, versao: v } : null;
  },
  logAcesso(docId, user, acao, ip) {
    db.prepare('INSERT INTO document_access_logs (id, document_id, user_id, quem, acao, ip, quando) VALUES (?,?,?,?,?,?,?)')
      .run(novoId(), docId, s(user && user.id, 40), s(user && (user.nome || user.email), 120) || 'agente/chave', s(acao, 30), s(ip, 60), nowISO());
  },
  acessos(docId) { return db.prepare('SELECT * FROM document_access_logs WHERE document_id = ? ORDER BY quando DESC LIMIT 100').all(docId); },
};

// =====================================================================
// IA — registro de chamadas (a geração em si chega na Fase 3)
// =====================================================================
const IA = {
  registrar(d, autor) {
    return transacao(() => {
      const qid = novoId(); const agora = nowISO();
      db.prepare('INSERT INTO ai_queries (id, user_id, case_id, client_id, agente, pergunta, contexto, modelo, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(qid, s(autor, 40), s(d.case_id, 40), s(d.client_id, 40), s(d.agente, 60), s(d.pergunta, 8000), j.str(d.contexto || {}), s(d.modelo, 60), agora);
      let rid = '';
      if (d.resposta) {
        rid = novoId();
        db.prepare(`INSERT INTO ai_responses (id, query_id, resposta, riscos, lacunas, nivel_confianca, status, revisado_por, feedback, criado_em)
          VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .run(rid, qid, s(d.resposta, 100000), s(d.riscos, 4000), s(d.lacunas, 4000), s(d.nivel_confianca, 10), 'rascunho', '', '', agora);
        for (const f of (Array.isArray(d.fontes) ? d.fontes : [])) {
          db.prepare(`INSERT INTO ai_sources (id, response_id, tipo, citacao, url, tribunal, processo, orgao_julgador, relator, data_julgado, trecho, data_coleta)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(novoId(), rid, s(f.tipo, 30) || 'legislacao', s(f.citacao, 500) || '(sem citação)', s(f.url, 500),
              s(f.tribunal, 40), s(f.processo, 40), s(f.orgao_julgador, 120), s(f.relator, 120), s(f.data_julgado, 30), s(f.trecho, 4000), agora);
        }
      }
      return { query_id: qid, response_id: rid };
    });
  },
  listar({ limite = 50 } = {}) {
    const qs = db.prepare('SELECT * FROM ai_queries ORDER BY criado_em DESC LIMIT ?').all(Math.min(Number(limite) || 50, 200));
    for (const q of qs) {
      q.respostas = db.prepare('SELECT id, nivel_confianca, status, revisado_por, criado_em FROM ai_responses WHERE query_id = ?').all(q.id);
      q.situacao = q.respostas.length ? 'respondida' : 'pendente'; // fila = consultas sem resposta
    }
    return qs;
  },
  // Fase 3: cria SÓ a consulta (a resposta chega depois — LLM direto ou agente local via fila)
  criarConsulta(d, autor) {
    const qid = novoId();
    db.prepare('INSERT INTO ai_queries (id, user_id, case_id, client_id, agente, pergunta, contexto, modelo, criado_em) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(qid, s(autor, 40), s(d.case_id, 40), s(d.client_id, 40), s(d.agente, 60), s(d.pergunta, 8000), j.str(d.contexto || {}), '', nowISO());
    return qid;
  },
  // Fase 3: anexa a resposta estruturada a uma consulta existente
  responder(queryId, d) {
    const q = db.prepare('SELECT id FROM ai_queries WHERE id = ?').get(queryId);
    if (!q) throw new Error('Consulta não encontrada.');
    return transacao(() => {
      const rid = novoId(); const agora = nowISO();
      if (d.modelo) db.prepare('UPDATE ai_queries SET modelo = ? WHERE id = ?').run(s(d.modelo, 60), queryId);
      db.prepare(`INSERT INTO ai_responses (id, query_id, resposta, riscos, lacunas, nivel_confianca, status, revisado_por, feedback, criado_em)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(rid, queryId, s(d.resposta, 100000), s(d.riscos, 4000), s(d.lacunas, 4000), s(d.nivel_confianca, 10), 'rascunho', '', '', agora);
      for (const f of (Array.isArray(d.fontes) ? d.fontes : [])) {
        db.prepare(`INSERT INTO ai_sources (id, response_id, tipo, citacao, url, tribunal, processo, orgao_julgador, relator, data_julgado, trecho, data_coleta)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(novoId(), rid, s(f.tipo, 30) || 'legislacao', s(f.citacao, 500) || '(sem citação)', s(f.url, 500),
            s(f.tribunal, 40), s(f.processo, 40), s(f.orgao_julgador, 120), s(f.relator, 120), s(f.data_julgado, 30), s(f.trecho, 4000), agora);
      }
      return rid;
    });
  },
  // Fase 3: fila para o agente local (consultas sem resposta)
  pendentes(limite = 20) {
    return db.prepare(`SELECT q.* FROM ai_queries q LEFT JOIN ai_responses r ON r.query_id = q.id
      WHERE r.id IS NULL ORDER BY q.criado_em LIMIT ?`).all(Math.min(Number(limite) || 20, 100))
      .map(q => ({ ...q, contexto: j.parse(q.contexto, {}) }));
  },
  obterResposta(id) {
    const r = db.prepare('SELECT * FROM ai_responses WHERE id = ?').get(id);
    if (!r) return null;
    r.fontes = db.prepare('SELECT * FROM ai_sources WHERE response_id = ?').all(id);
    r.query = db.prepare('SELECT * FROM ai_queries WHERE id = ?').get(r.query_id);
    return r;
  },
  revisar(id, { status, feedback }, revisor) {
    const r = db.prepare('SELECT * FROM ai_responses WHERE id = ?').get(id);
    if (!r) throw new Error('Resposta não encontrada.');
    const novo = ['rascunho', 'revisado', 'aprovado', 'descartado'].includes(status) ? status : r.status;
    db.prepare('UPDATE ai_responses SET status=?, revisado_por=?, feedback=? WHERE id=?')
      .run(novo, s(revisor, 120), s(feedback, 4000) || r.feedback, id);
    return novo;
  },
};

// =====================================================================
// FINANCEIRO JURÍDICO
// =====================================================================
const Financeiro = {
  listar({ client_id = '', case_id = '', status = '', limite = 200 } = {}) {
    let sql = 'SELECT * FROM financial_accounts', where = [], args = [];
    if (client_id) { where.push('client_id = ?'); args.push(client_id); }
    if (case_id) { where.push('case_id = ?'); args.push(case_id); }
    if (status) { where.push('status = ?'); args.push(status); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY vencimento DESC, criado_em DESC LIMIT ?'; args.push(Math.min(Number(limite) || 200, 500));
    return db.prepare(sql).all(...args);
  },
  criar(d, autor) {
    const id = novoId(); const agora = nowISO();
    db.prepare(`INSERT INTO financial_accounts (id, client_id, case_id, tipo, descricao, valor, vencimento, status,
      comprovante_doc_id, visivel_cliente, criado_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, fk(d.client_id), fk(d.case_id), valida(d.tipo, E.tipoFin, 'tipo'), s(d.descricao, 300) || 'Lançamento',
        cent(d.valor), s(d.vencimento, 30), valida(d.status || 'previsto', E.statusFin, 'status'),
        s(d.comprovante_doc_id, 40), d.visivel_cliente === false ? 0 : 1, s(autor, 40), agora, agora);
    return db.prepare('SELECT * FROM financial_accounts WHERE id = ?').get(id);
  },
  atualizar(id, d) {
    const f = db.prepare('SELECT * FROM financial_accounts WHERE id = ?').get(id);
    if (!f) throw new Error('Lançamento não encontrado.');
    if (d.tipo != null) f.tipo = valida(d.tipo, E.tipoFin, 'tipo');
    if (d.status != null) f.status = valida(d.status, E.statusFin, 'status');
    if (d.valor != null) f.valor = cent(d.valor);
    for (const campo of ['descricao', 'vencimento', 'comprovante_doc_id']) if (d[campo] != null) f[campo] = s(d[campo], 300);
    if (d.client_id != null) f.client_id = fk(d.client_id);
    if (d.case_id != null) f.case_id = fk(d.case_id);
    if (d.visivel_cliente != null) f.visivel_cliente = d.visivel_cliente ? 1 : 0;
    db.prepare(`UPDATE financial_accounts SET client_id=?, case_id=?, tipo=?, descricao=?, valor=?, vencimento=?, status=?,
      comprovante_doc_id=?, visivel_cliente=?, atualizado_em=? WHERE id=?`)
      .run(f.client_id, f.case_id, f.tipo, f.descricao, f.valor, f.vencimento, f.status, f.comprovante_doc_id, f.visivel_cliente, nowISO(), id);
    return f;
  },
};

// =====================================================================
// INTEGRAÇÕES + WEBHOOKS + DASHBOARD
// =====================================================================
const Integracoes = {
  log(fonte, operacao, status, detalhe, itens) {
    db.prepare('INSERT INTO integration_logs (id, fonte, operacao, status, detalhe, itens, quando) VALUES (?,?,?,?,?,?,?)')
      .run(novoId(), s(fonte, 30), s(operacao, 80), status === 'erro' ? 'erro' : 'ok', s(detalhe, 500), Number(itens) || 0, nowISO());
  },
  listar(n = 100) { return db.prepare('SELECT * FROM integration_logs ORDER BY quando DESC LIMIT ?').all(Math.min(Number(n) || 100, 500)); },
  webhook(origem, evento, payload) {
    const id = novoId();
    db.prepare('INSERT INTO webhook_events (id, origem, evento, payload, status, detalhe, quando) VALUES (?,?,?,?,?,?,?)')
      .run(id, s(origem, 40), s(evento, 80), j.str(payload || {}).slice(0, 50000), 'recebido', '', nowISO());
    return id;
  },
  webhooks(n = 100) { return db.prepare('SELECT id, origem, evento, status, detalhe, quando FROM webhook_events ORDER BY quando DESC LIMIT ?').all(Math.min(Number(n) || 100, 500)); },
};

const Dashboard = {
  resumo() {
    const um = (sql, ...a) => db.prepare(sql).get(...a);
    const hoje = nowISO().slice(0, 10);
    const em7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    return {
      processos_ativos: um("SELECT COUNT(*) n FROM cases WHERE status = 'ativo'").n,
      clientes_ativos: um("SELECT COUNT(*) n FROM clients WHERE tipo_cliente IN ('ativo','estrategico')").n,
      prazos_hoje: um("SELECT COUNT(*) n FROM deadlines WHERE status NOT IN ('cumprido','cancelado') AND ((data_fatal != '' AND data_fatal <= ?) OR (data_interna != '' AND data_interna <= ?))", hoje, hoje).n,
      prazos_7dias: um("SELECT COUNT(*) n FROM deadlines WHERE status NOT IN ('cumprido','cancelado') AND data_fatal != '' AND data_fatal <= ?", em7).n,
      prazos_sem_validacao: um("SELECT COUNT(*) n FROM deadlines WHERE status NOT IN ('cumprido','cancelado') AND calculo_sugerido != '' AND validado_por = ''").n,
      publicacoes_novas: um("SELECT COUNT(*) n FROM case_publications WHERE status = 'nova'").n,
      audiencias_7dias: um("SELECT COUNT(*) n FROM hearings WHERE status = 'agendada' AND data_hora >= ? AND data_hora <= ?", hoje, em7 + 'T23:59').n,
      tarefas_abertas: um("SELECT COUNT(*) n FROM tasks WHERE status IN ('aberta','em_andamento')").n,
      tarefas_atrasadas: um("SELECT COUNT(*) n FROM tasks WHERE status IN ('aberta','em_andamento') AND prazo != '' AND prazo < ?", hoje).n,
      docs_em_revisao: um("SELECT COUNT(*) n FROM documents WHERE status = 'revisao_pendente'").n,
      pecas_em_revisao: um("SELECT COUNT(*) n FROM legal_drafts WHERE status = 'revisao_pendente'").n,
      ia_sem_revisao: um("SELECT COUNT(*) n FROM ai_responses WHERE status = 'rascunho'").n,
      ia_pendentes: um('SELECT COUNT(*) n FROM ai_queries q LEFT JOIN ai_responses r ON r.query_id = q.id WHERE r.id IS NULL').n,
    };
  },
};

module.exports = {
  E, normCNJ,
  Auditoria, Clientes, Processos, Andamentos, Publicacoes, Prazos, Tarefas, Documentos, IA, Financeiro, Integracoes, Dashboard,
  Audiencias, Agenda, Legado,
};
