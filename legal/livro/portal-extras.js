// =====================================================================
// ONDA LIVRO · fechamento dos protótipos já existentes
//  · 47.2 Portal do cliente: tradução do andamento em linguagem simples com
//    APROVAÇÃO HUMANA antes de ficar visível + bloqueio de evento sensível
//    (18.3/18.11), pendências ao cliente (18.5) e avaliação (18.10).
//  · 47.4 Publicações e prazos: alertas ESCALONADOS (19.7) e confirmação
//    de leitura (19.8).
//  · 47.6 Documentos: classificação de BAIXA CONFIANÇA vai para FILA.
// =====================================================================
'use strict';
const B = require('../repo-livro');
const { EL, s, int, bool, valida, hoje, maisDias, patch, um, todos, novoId, nowISO, db } = B;

// ------------------------------------- TRADUÇÃO DE ANDAMENTOS (18.3/47.2)
const Traducoes = {
  listar({ status = 'rascunho', case_id = '', n = 200 } = {}) {
    let sql = `SELECT t.*, m.descricao movimento, m.data data_movimento FROM movement_translations t
      LEFT JOIN case_movements m ON m.id = t.movement_id`, w = [], a = [];
    if (status) { w.push('t.status = ?'); a.push(status); }
    if (case_id) { w.push('t.case_id = ?'); a.push(case_id); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY t.criado_em DESC LIMIT ?'; a.push(Math.min(int(n, 200), 400));
    return todos(sql, ...a);
  },
  // origem 'ia' (fila/direto) ou 'humano'. Nasce rascunho SEMPRE: é a trava do 47.2.
  criar(movement_id, d = {}, quem) {
    const m = um('SELECT * FROM case_movements WHERE id = ?', movement_id);
    if (!m) throw new Error('Andamento não encontrado.');
    if (!s(d.texto_simples)) throw new Error('Informe a tradução em linguagem simples.');
    const existe = um('SELECT id FROM movement_translations WHERE movement_id = ?', movement_id);
    if (existe) {
      patch('movement_translations', existe.id, {
        texto_simples: s(d.texto_simples, 4000), sensivel: bool(d.sensivel),
        status: 'rascunho', aprovada_por: '', aprovada_em: '', publicada_em: '',
      });
      return um('SELECT * FROM movement_translations WHERE id = ?', existe.id);
    }
    const id = novoId();
    db.prepare(`INSERT INTO movement_translations (id, movement_id, case_id, texto_simples, origem, sensivel,
      status, aprovada_por, aprovada_em, publicada_em, criado_em) VALUES (?,?,?,?,?,?,'rascunho','','','',?)`)
      .run(id, movement_id, m.case_id, s(d.texto_simples, 4000), d.origem === 'ia' ? 'ia' : 'humano',
        bool(d.sensivel), nowISO());
    return um('SELECT * FROM movement_translations WHERE id = ?', id);
  },
  aprovar(id, quem) {
    const t = um('SELECT * FROM movement_translations WHERE id = ?', id);
    if (!t) throw new Error('Tradução não encontrada.');
    if (!s(quem)) throw new Error('Aprovação exige usuário identificado.');
    patch('movement_translations', id, { status: 'aprovada', aprovada_por: s(quem, 120), aprovada_em: nowISO() });
    return um('SELECT * FROM movement_translations WHERE id = ?', id);
  },
  reprovar(id, quem) {
    if (!um('SELECT id FROM movement_translations WHERE id = ?', id)) throw new Error('Tradução não encontrada.');
    patch('movement_translations', id, { status: 'reprovada', aprovada_por: s(quem, 120), aprovada_em: nowISO() });
    return um('SELECT * FROM movement_translations WHERE id = ?', id);
  },
  // 47.2: "bloqueio de eventos sensíveis até a comunicação pessoal" — marcado
  // como sensível, só publica quando alguém confirmar que já conversou.
  publicar(id, { conversa_feita } = {}, quem) {
    const t = um('SELECT * FROM movement_translations WHERE id = ?', id);
    if (!t) throw new Error('Tradução não encontrada.');
    if (t.status !== 'aprovada') throw new Error('Tradução exige aprovação humana antes de ficar visível ao cliente (Cap. 18.3 / 47.2).');
    if (t.sensivel && !bool(conversa_feita)) {
      throw new Error('Evento sensível: confirme que o cliente foi comunicado pessoalmente antes de publicar (Cap. 47.2).');
    }
    patch('movement_translations', id, { status: 'publicada', publicada_em: nowISO() });
    return um('SELECT * FROM movement_translations WHERE id = ?', id);
  },
  // o que o portal do cliente pode mostrar: só tradução PUBLICADA
  publicadasDoCaso(case_id) {
    return todos(`SELECT t.movement_id, t.texto_simples, t.publicada_em, m.data FROM movement_translations t
      JOIN case_movements m ON m.id = t.movement_id
      WHERE t.case_id = ? AND t.status = 'publicada' ORDER BY m.data DESC LIMIT 200`, case_id);
  },
};

// ------------------------------------------- PENDÊNCIAS AO CLIENTE (18.5)
const Pendencias = {
  listar({ client_id = '', status = '', n = 200 } = {}) {
    let sql = `SELECT p.*, c.nome cliente FROM client_pendencies p LEFT JOIN clients c ON c.id = p.client_id`, w = [], a = [];
    if (client_id) { w.push('p.client_id = ?'); a.push(client_id); }
    if (status) { w.push('p.status = ?'); a.push(status); }
    if (w.length) sql += ' WHERE ' + w.join(' AND ');
    sql += ' ORDER BY p.status, p.prazo LIMIT ?'; a.push(Math.min(int(n, 200), 400));
    return todos(sql, ...a);
  },
  criar(d = {}, quem) {
    if (!um('SELECT id FROM clients WHERE id = ?', s(d.client_id, 40))) throw new Error('Cliente não encontrado.');
    const id = novoId(), agora = nowISO();
    db.prepare(`INSERT INTO client_pendencies (id, client_id, case_id, titulo, descricao, tipo, prazo, status,
      atendida_em, solicitado_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,'pendente','',?,?,?)`)
      .run(id, s(d.client_id, 40), s(d.case_id, 40), s(d.titulo, 300), s(d.descricao, 2000),
        valida(d.tipo, EL.tipoPendencia, 'tipo'), s(d.prazo, 20), s(quem, 120), agora, agora);
    return um('SELECT * FROM client_pendencies WHERE id = ?', id);
  },
  atualizar(id, d = {}) {
    if (!um('SELECT id FROM client_pendencies WHERE id = ?', id)) throw new Error('Pendência não encontrada.');
    const c = {};
    for (const [k, max] of [['titulo', 300], ['descricao', 2000], ['prazo', 20]]) if (d[k] !== undefined) c[k] = s(d[k], max);
    if (d.tipo !== undefined) c.tipo = valida(d.tipo, EL.tipoPendencia, 'tipo');
    if (d.status !== undefined) {
      c.status = valida(d.status, EL.statusPendencia, 'status');
      if (c.status !== 'pendente') c.atendida_em = nowISO();
    }
    patch('client_pendencies', id, c);
    return um('SELECT * FROM client_pendencies WHERE id = ?', id);
  },
  remover(id) { return db.prepare('DELETE FROM client_pendencies WHERE id = ?').run(id).changes; },
};

// ------------------------------------ AVALIAÇÃO DO ATENDIMENTO (18.10/40.6)
const Satisfacao = {
  registrar(d = {}) {
    if (!um('SELECT id FROM clients WHERE id = ?', s(d.client_id, 40))) throw new Error('Cliente não encontrado.');
    const nota = int(d.nota, -1);
    if (nota < 0 || nota > 10) throw new Error('Nota de 0 a 10.');
    const id = novoId();
    db.prepare('INSERT INTO client_satisfaction (id, client_id, case_id, nota, comentario, momento, respondido_em) VALUES (?,?,?,?,?,?,?)')
      .run(id, s(d.client_id, 40), s(d.case_id, 40), nota, s(d.comentario, 4000),
        valida(d.momento, EL.momentoNPS, 'momento'), nowISO());
    return um('SELECT * FROM client_satisfaction WHERE id = ?', id);
  },
  listar({ client_id = '', n = 200 } = {}) {
    const w = client_id ? ' WHERE s.client_id = ?' : '';
    const a = client_id ? [client_id] : [];
    return todos(`SELECT s.*, c.nome cliente FROM client_satisfaction s LEFT JOIN clients c ON c.id = s.client_id${w}
      ORDER BY s.respondido_em DESC LIMIT ?`, ...a, Math.min(int(n, 200), 400));
  },
  resumo({ dias = 180 } = {}) {
    const desde = maisDias(-Math.abs(int(dias, 180)));
    const r = um('SELECT COUNT(*) n, COALESCE(AVG(nota),0) media FROM client_satisfaction WHERE respondido_em >= ?', desde);
    const dist = todos('SELECT nota, COUNT(*) n FROM client_satisfaction WHERE respondido_em >= ? GROUP BY nota ORDER BY nota', desde);
    // NPS clássico: promotores (9-10) − detratores (0-6)
    const total = r.n || 0;
    const prom = um('SELECT COUNT(*) n FROM client_satisfaction WHERE respondido_em >= ? AND nota >= 9', desde).n;
    const det = um('SELECT COUNT(*) n FROM client_satisfaction WHERE respondido_em >= ? AND nota <= 6', desde).n;
    return {
      respostas: total, media: Math.round(Number(r.media) * 10) / 10, distribuicao: dist,
      nps: total ? Math.round(((prom - det) / total) * 100) : 0,
    };
  },
};

// -------------------------------- ALERTAS ESCALONADOS DE PRAZO (19.7/47.4)
// Escada do livro: aproxima → responsável; encurta → coordenação; véspera → sócio.
const NIVEIS = [
  { nivel: 1, dias_antes: 10 },
  { nivel: 1, dias_antes: 5 },
  { nivel: 2, dias_antes: 2 },
  { nivel: 3, dias_antes: 1 },
  { nivel: 3, dias_antes: 0 },
];

const Escalonamento = {
  // Calcula o que deveria ter sido avisado e ainda não foi. Não envia nada:
  // devolve a lista para a rotina/notificações dispararem (e registra depois).
  pendentes() {
    const h = hoje();
    const out = [];
    const prazos = todos(`SELECT * FROM deadlines WHERE status NOT IN ('cumprido','cancelado','protocolado')
      AND data_fatal != '' AND data_fatal >= ? AND data_fatal <= ?`, h, maisDias(10));
    for (const p of prazos) {
      const faltam = Math.round((new Date(p.data_fatal + 'T12:00:00Z') - new Date(h + 'T12:00:00Z')) / 864e5);
      for (const n of NIVEIS) {
        if (faltam > n.dias_antes) continue;
        const jaFoi = um('SELECT id FROM deadline_escalations WHERE deadline_id = ? AND nivel = ? AND dias_antes = ?', p.id, n.nivel, n.dias_antes);
        if (jaFoi) continue;
        out.push({ deadline: p, nivel: n.nivel, dias_antes: n.dias_antes, faltam });
      }
    }
    return out;
  },
  registrar({ deadline_id, nivel, dias_antes, destino, canal }) {
    if (!um('SELECT id FROM deadlines WHERE id = ?', deadline_id)) throw new Error('Prazo não encontrado.');
    const id = novoId();
    db.prepare(`INSERT INTO deadline_escalations (id, deadline_id, nivel, dias_antes, destino, canal, enviado_em, lido_em, lido_por)
      VALUES (?,?,?,?,?,?,?,'','')`)
      .run(id, deadline_id, Math.max(1, int(nivel, 1)), int(dias_antes, 0), s(destino, 200),
        ['interna', 'email', 'whatsapp'].includes(canal) ? canal : 'interna', nowISO());
    return um('SELECT * FROM deadline_escalations WHERE id = ?', id);
  },
  confirmarLeitura(id, user) {
    if (!um('SELECT id FROM deadline_escalations WHERE id = ?', id)) throw new Error('Alerta não encontrado.');
    db.prepare('UPDATE deadline_escalations SET lido_em = ?, lido_por = ? WHERE id = ?')
      .run(nowISO(), s((user && (user.nome || user.email)) || '', 120), id);
    return um('SELECT * FROM deadline_escalations WHERE id = ?', id);
  },
  doPrazo(deadline_id) { return todos('SELECT * FROM deadline_escalations WHERE deadline_id = ? ORDER BY enviado_em', deadline_id); },
  // 19.8: alerta escalonado enviado e não lido é o que a controladoria cobra
  naoLidos({ n = 100 } = {}) {
    return todos(`SELECT e.*, d.titulo, d.data_fatal FROM deadline_escalations e
      JOIN deadlines d ON d.id = e.deadline_id
      WHERE e.lido_em = '' ORDER BY e.nivel DESC, e.enviado_em DESC LIMIT ?`, Math.min(int(n, 100), 300));
  },
};

// ------------------------- CONFIRMAÇÃO DE LEITURA DE PUBLICAÇÃO (19.8)
const CienciaPublicacao = {
  registrar(publication_id, user) {
    if (!um('SELECT id FROM case_publications WHERE id = ?', publication_id)) throw new Error('Publicação não encontrada.');
    const uid = s(user && user.id, 40);
    if (!uid) throw new Error('Confirmação de leitura exige usuário identificado.');
    const existe = um('SELECT id FROM publication_acks WHERE publication_id = ? AND user_id = ?', publication_id, uid);
    if (existe) return existe.id;
    const id = novoId();
    db.prepare('INSERT INTO publication_acks (id, publication_id, user_id, quem, quando) VALUES (?,?,?,?,?)')
      .run(id, publication_id, uid, s((user && (user.nome || user.email)) || '', 120), nowISO());
    return id;
  },
  de(publication_id) { return todos('SELECT * FROM publication_acks WHERE publication_id = ? ORDER BY quando', publication_id); },
};

// ------------------- FILA DE CLASSIFICAÇÃO DE DOCUMENTOS (47.6 / 35.5)
// Regra do livro: "classificação de baixa confiança vai para fila, não para
// a pasta". O limiar é explícito e configurável por chamada.
const FilaDocs = {
  LIMIAR: 0.8,
  enfileirar(d = {}) {
    if (!um('SELECT id FROM documents WHERE id = ?', s(d.document_id, 40))) throw new Error('Documento não encontrado.');
    const confianca = Math.max(0, Math.min(1, Number(d.confianca || 0)));
    const id = novoId();
    db.prepare(`INSERT INTO doc_classification_queue (id, document_id, sugestao_tipo, sugestao_nome,
      sugestao_case_id, confianca, origem, status, decidido_por, decidido_em, criado_em)
      VALUES (?,?,?,?,?,?,?,'pendente','','',?)`)
      .run(id, s(d.document_id, 40), s(d.sugestao_tipo, 60), s(d.sugestao_nome, 300), s(d.sugestao_case_id, 40),
        confianca, s(d.origem, 40) || 'ia', nowISO());
    return { ...um('SELECT * FROM doc_classification_queue WHERE id = ?', id), exige_revisao: confianca < FilaDocs.LIMIAR };
  },
  fila({ status = 'pendente', n = 200 } = {}) {
    return todos(`SELECT q.*, d.titulo documento, d.tipo tipo_atual FROM doc_classification_queue q
      LEFT JOIN documents d ON d.id = q.document_id
      WHERE q.status = ? ORDER BY q.confianca, q.criado_em LIMIT ?`, status, Math.min(int(n, 200), 400));
  },
  // decidir = aplicar a sugestão (aceita) ou a correção humana (corrigida)
  decidir(id, d = {}, quem) {
    const q = um('SELECT * FROM doc_classification_queue WHERE id = ?', id);
    if (!q) throw new Error('Item da fila não encontrado.');
    if (q.status !== 'pendente') throw new Error('Item já decidido.');
    const status = valida(d.status, EL.statusFila, 'status');
    if (status === 'pendente') throw new Error('Escolha aceita, corrigida ou descartada.');
    if (!s(quem)) throw new Error('Decisão exige usuário identificado.');
    if (status !== 'descartada') {
      const tipo = status === 'aceita' ? q.sugestao_tipo : s(d.tipo, 60);
      const titulo = status === 'aceita' ? q.sugestao_nome : s(d.titulo, 300);
      const campos = {};
      if (tipo) campos.tipo = tipo;
      if (titulo) campos.titulo = titulo;
      const caseId = status === 'aceita' ? q.sugestao_case_id : s(d.case_id, 40);
      if (caseId) campos.case_id = caseId;
      if (Object.keys(campos).length) patch('documents', q.document_id, campos);
    }
    db.prepare('UPDATE doc_classification_queue SET status = ?, decidido_por = ?, decidido_em = ? WHERE id = ?')
      .run(status, s(quem, 120), nowISO(), id);
    return um('SELECT * FROM doc_classification_queue WHERE id = ?', id);
  },
};

module.exports = { Traducoes, Pendencias, Satisfacao, Escalonamento, CienciaPublicacao, FilaDocs };
