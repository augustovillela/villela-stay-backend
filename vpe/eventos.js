// =====================================================================
// Villela Projects & Events — Fase 4: gestão de eventos.
// Ciclo lead→pós-evento; briefing estruturado por seções; fornecedores
// do TENANT (reutilizáveis) alocados ao evento com valor e status;
// convidados com RSVP e check-in; checklist e pós-evento embutidos.
// Vínculo opcional a um projeto do portfólio (ex.: "Serviços de buffet").
// Financeiro consolida: receita fechada − custos (evento + fornecedores).
// Layout/gastronomia detalhados e ingressos pagos: fases futuras (README).
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');

const s = repo.s;
const STATUS_EVENTO = ['lead', 'briefing', 'proposta', 'negociacao', 'aprovado', 'confirmado', 'em_preparacao', 'realizado', 'pos_evento', 'cancelado'];
const TIPOS = ['casamento', 'aniversario', 'confraternizacao', 'churrasco', 'corporativo', 'infantil', 'jantar', 'brunch', 'coffee_break', 'curso', 'palestra', 'lancamento', 'hospedagem_evento', 'day_use', 'online', 'hibrido', 'outro'];
const CAT_FORNECEDOR = ['buffet', 'chef', 'garcons', 'decoracao', 'som', 'iluminacao', 'dj', 'fotografo', 'filmagem', 'limpeza', 'transporte', 'mobiliario', 'seguranca', 'cerimonial', 'nautica', 'outro'];
const SECOES_BRIEFING = [
  ['objetivo', 'Objetivo do evento'],
  ['perfil_convidados', 'Perfil dos convidados'],
  ['alimentacao', 'Alimentação e bebidas'],
  ['decoracao', 'Decoração'],
  ['estrutura', 'Som, iluminação, mobiliário e estrutura'],
  ['equipe', 'Equipe necessária'],
  ['restricoes', 'Restrições e regras do local'],
  ['preferencias', 'Preferências e observações'],
];
const CHAVES_BRIEFING = SECOES_BRIEFING.map(([k]) => k);

// ------------------------------------------------------------ fornecedores (tenant)
function criarFornecedor(tenantId, campos, ator, ip) {
  if (!s(campos.nome, 160)) throw new Error('Informe o nome do fornecedor.');
  const id = novoId();
  db.prepare(`INSERT INTO suppliers (id, tenant_id, nome, categoria, telefone, email, observacoes, favorito, bloqueado, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, String(tenantId), s(campos.nome, 160), CAT_FORNECEDOR.includes(campos.categoria) ? campos.categoria : 'outro',
      s(campos.telefone, 30), s(campos.email, 120), s(campos.observacoes, 1000),
      campos.favorito ? 1 : 0, campos.bloqueado ? 1 : 0, nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'fornecedor.criar', 'suppliers', id, { nome: s(campos.nome, 120), categoria: campos.categoria }, ip);
  return id;
}
function listarFornecedores(tenantId, { categoria = '', busca = '' } = {}) {
  let sql = 'SELECT * FROM suppliers WHERE tenant_id = ?';
  const args = [String(tenantId)];
  if (categoria) { sql += ' AND categoria = ?'; args.push(s(categoria, 30)); }
  if (busca) { sql += ' AND nome LIKE ?'; args.push('%' + s(busca, 80) + '%'); }
  sql += ' ORDER BY bloqueado, favorito DESC, nome LIMIT 500';
  return db.prepare(sql).all(...args);
}
function atualizarFornecedor(tenantId, id, campos, ator, ip) {
  const f = db.prepare('SELECT * FROM suppliers WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!f) throw new Error('Fornecedor não encontrado.');
  db.prepare(`UPDATE suppliers SET nome = ?, categoria = ?, telefone = ?, email = ?, observacoes = ?, favorito = ?, bloqueado = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?`)
    .run(s(campos.nome || f.nome, 160), CAT_FORNECEDOR.includes(campos.categoria) ? campos.categoria : f.categoria,
      s(campos.telefone ?? f.telefone, 30), s(campos.email ?? f.email, 120), s(campos.observacoes ?? f.observacoes, 1000),
      campos.favorito != null ? (campos.favorito ? 1 : 0) : f.favorito, campos.bloqueado != null ? (campos.bloqueado ? 1 : 0) : f.bloqueado,
      nowISO(), f.id, String(tenantId));
  repo.auditar(tenantId, ator, 'fornecedor.atualizar', 'suppliers', f.id, {}, ip);
}

// ------------------------------------------------------------ eventos
function criarEvento(tenantId, campos, ator, ip) {
  if (!s(campos.nome, 200)) throw new Error('Dê um nome ao evento.');
  if (campos.project_id) repo.obterProjeto(tenantId, campos.project_id); // valida vínculo
  repo.checarLimite(tenantId, 'eventos', 1);
  const id = novoId();
  db.prepare(`INSERT INTO events (id, tenant_id, project_id, nome, tipo, cliente_nome, cliente_contato, local, data, hora,
      convidados_previstos, orcamento_centavos, receita_centavos, status, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'lead',?,?)`)
    .run(id, String(tenantId), s(campos.project_id, 40), s(campos.nome, 200),
      TIPOS.includes(campos.tipo) ? campos.tipo : 'outro', s(campos.cliente_nome, 160), s(campos.cliente_contato, 120),
      s(campos.local, 200), s(campos.data, 10), s(campos.hora, 10),
      Math.max(0, Math.trunc(Number(campos.convidados_previstos) || 0)),
      Math.max(0, Math.trunc(Number(campos.orcamento_centavos) || 0)),
      Math.max(0, Math.trunc(Number(campos.receita_centavos) || 0)), nowISO(), s(ator && ator.id, 40));
  repo.registrarUso(tenantId, 'eventos', 1);
  repo.auditar(tenantId, ator, 'evento.criar', 'events', id, { nome: s(campos.nome, 120), tipo: campos.tipo }, ip);
  return obterEvento(tenantId, id);
}
function obterEvento(tenantId, id) {
  const e = db.prepare('SELECT * FROM events WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!e) throw new Error('Evento não encontrado.');
  e.briefing = j.parse(e.briefing, {});
  e.checklist = j.parse(e.checklist, []);
  e.pos_evento = j.parse(e.pos_evento, {});
  // fornecedores alocados (com nome resolvido)
  e.fornecedores = db.prepare(`SELECT es.*, sup.nome AS fornecedor_nome FROM event_suppliers es
    LEFT JOIN suppliers sup ON sup.id = es.supplier_id WHERE es.tenant_id = ? AND es.event_id = ? ORDER BY es.categoria`)
    .all(String(tenantId), e.id);
  // convidados agregados
  const g = db.prepare(`SELECT rsvp, COUNT(*) n, COALESCE(SUM(acompanhantes),0) acomp FROM event_guests WHERE tenant_id = ? AND event_id = ? GROUP BY rsvp`)
    .all(String(tenantId), e.id);
  e.convidados = { total: 0, confirmados: 0, recusados: 0, pendentes: 0, checkins: db.prepare("SELECT COUNT(*) n FROM event_guests WHERE tenant_id = ? AND event_id = ? AND checkin_em != ''").get(String(tenantId), e.id).n };
  for (const r of g) {
    e.convidados.total += r.n + r.acomp;
    if (r.rsvp === 'confirmado') e.convidados.confirmados = r.n + r.acomp;
    if (r.rsvp === 'recusado') e.convidados.recusados = r.n;
    if (r.rsvp === 'pendente') e.convidados.pendentes = r.n;
  }
  // financeiro consolidado
  const custoForn = db.prepare("SELECT COALESCE(SUM(valor_centavos),0) v FROM event_suppliers WHERE tenant_id = ? AND event_id = ? AND status != 'cancelado'").get(String(tenantId), e.id).v;
  e.financeiro = {
    receita: e.receita_centavos, custo_evento: e.orcamento_centavos, custo_fornecedores: custoForn,
    custo_total: e.orcamento_centavos + custoForn, margem: e.receita_centavos - (e.orcamento_centavos + custoForn),
  };
  e.catalogo_briefing = SECOES_BRIEFING;
  return e;
}
function listarEventos(tenantId, { status = '', tipo = '', busca = '', projeto = '' } = {}) {
  let sql = 'SELECT id, project_id, nome, tipo, cliente_nome, local, data, status, convidados_previstos, receita_centavos FROM events WHERE tenant_id = ?';
  const args = [String(tenantId)];
  if (status) { sql += ' AND status = ?'; args.push(s(status, 20)); }
  if (tipo) { sql += ' AND tipo = ?'; args.push(s(tipo, 30)); }
  if (projeto) { sql += ' AND project_id = ?'; args.push(s(projeto, 40)); }
  if (busca) { sql += ' AND (nome LIKE ? OR cliente_nome LIKE ?)'; const t = '%' + s(busca, 80) + '%'; args.push(t, t); }
  sql += " ORDER BY CASE WHEN data='' THEN 1 ELSE 0 END, data LIMIT 500";
  return db.prepare(sql).all(...args);
}
function atualizarEvento(tenantId, id, campos, ator, ip) {
  const e = obterEvento(tenantId, id);
  if (campos.status && !STATUS_EVENTO.includes(campos.status)) throw new Error('Status inválido.');
  if (campos.project_id) repo.obterProjeto(tenantId, campos.project_id);
  const brief = campos.briefing ? { ...e.briefing } : e.briefing;
  if (campos.briefing) for (const k of CHAVES_BRIEFING) if (campos.briefing[k] != null) brief[k] = s(campos.briefing[k], 4000);
  const checklist = campos.checklist != null ? (Array.isArray(campos.checklist) ? campos.checklist : []).slice(0, 60).map(it => ({ t: s(it && it.t, 200), feito: !!(it && it.feito) })).filter(it => it.t) : e.checklist;
  const pos = campos.pos_evento ? { ...e.pos_evento, ...campos.pos_evento } : e.pos_evento;
  db.prepare(`UPDATE events SET project_id = ?, nome = ?, tipo = ?, cliente_nome = ?, cliente_contato = ?, local = ?, data = ?, hora = ?,
      convidados_previstos = ?, orcamento_centavos = ?, receita_centavos = ?, status = ?, briefing = ?, checklist = ?, pos_evento = ?, observacoes = ?, atualizado_em = ?
    WHERE id = ? AND tenant_id = ?`)
    .run(campos.project_id !== undefined ? s(campos.project_id, 40) : e.project_id, s(campos.nome || e.nome, 200),
      TIPOS.includes(campos.tipo) ? campos.tipo : e.tipo, s(campos.cliente_nome ?? e.cliente_nome, 160), s(campos.cliente_contato ?? e.cliente_contato, 120),
      s(campos.local ?? e.local, 200), s(campos.data ?? e.data, 10), s(campos.hora ?? e.hora, 10),
      campos.convidados_previstos != null ? Math.max(0, Math.trunc(Number(campos.convidados_previstos) || 0)) : e.convidados_previstos,
      campos.orcamento_centavos != null ? Math.max(0, Math.trunc(Number(campos.orcamento_centavos) || 0)) : e.orcamento_centavos,
      campos.receita_centavos != null ? Math.max(0, Math.trunc(Number(campos.receita_centavos) || 0)) : e.receita_centavos,
      campos.status || e.status, j.str(brief), j.str(checklist), j.str(pos), s(campos.observacoes ?? e.observacoes, 2000), nowISO(), e.id, String(tenantId));
  repo.auditar(tenantId, ator, campos.status && campos.status !== e.status ? 'evento.mudar_status' : 'evento.atualizar', 'events', e.id,
    campos.status && campos.status !== e.status ? { de: e.status, para: campos.status } : { campos: Object.keys(campos) }, ip);
  return obterEvento(tenantId, e.id);
}

// ------------------------------------------------------------ fornecedores do evento
function alocarFornecedor(tenantId, eventId, { supplier_id, valor_centavos, status, observacoes }, ator, ip) {
  obterEvento(tenantId, eventId);
  const sup = db.prepare('SELECT id, categoria, bloqueado FROM suppliers WHERE id = ? AND tenant_id = ?').get(String(supplier_id), String(tenantId));
  if (!sup) throw new Error('Fornecedor não encontrado.');
  if (sup.bloqueado) throw new Error('Fornecedor está bloqueado.');
  const id = novoId();
  db.prepare(`INSERT INTO event_suppliers (id, tenant_id, event_id, supplier_id, categoria, valor_centavos, status, observacoes, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, String(tenantId), String(eventId), sup.id, sup.categoria,
      Math.max(0, Math.trunc(Number(valor_centavos) || 0)), ['cotado', 'confirmado', 'pago', 'cancelado'].includes(status) ? status : 'cotado', s(observacoes, 500), nowISO());
  repo.auditar(tenantId, ator, 'evento.alocar_fornecedor', 'event_suppliers', id, { evento: String(eventId), fornecedor: sup.id }, ip);
  return id;
}
function atualizarAlocacao(tenantId, id, campos, ator, ip) {
  const a = db.prepare('SELECT * FROM event_suppliers WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!a) throw new Error('Alocação não encontrada.');
  db.prepare('UPDATE event_suppliers SET valor_centavos = ?, status = ?, observacoes = ? WHERE id = ? AND tenant_id = ?')
    .run(campos.valor_centavos != null ? Math.max(0, Math.trunc(Number(campos.valor_centavos) || 0)) : a.valor_centavos,
      ['cotado', 'confirmado', 'pago', 'cancelado'].includes(campos.status) ? campos.status : a.status, s(campos.observacoes ?? a.observacoes, 500), a.id, String(tenantId));
  repo.auditar(tenantId, ator, 'evento.fornecedor_atualizar', 'event_suppliers', a.id, { status: campos.status }, ip);
}
function removerAlocacao(tenantId, id, ator, ip) {
  const r = db.prepare('DELETE FROM event_suppliers WHERE id = ? AND tenant_id = ?').run(String(id), String(tenantId));
  if (!r.changes) throw new Error('Alocação não encontrada.');
  repo.auditar(tenantId, ator, 'evento.fornecedor_remover', 'event_suppliers', String(id), {}, ip);
}

// ------------------------------------------------------------ convidados
function listarConvidados(tenantId, eventId) {
  obterEvento(tenantId, eventId);
  return db.prepare('SELECT * FROM event_guests WHERE tenant_id = ? AND event_id = ? ORDER BY nome').all(String(tenantId), String(eventId));
}
function adicionarConvidado(tenantId, eventId, campos, ator, ip) {
  obterEvento(tenantId, eventId);
  if (!s(campos.nome, 160)) throw new Error('Informe o nome do convidado.');
  const id = novoId();
  db.prepare(`INSERT INTO event_guests (id, tenant_id, event_id, nome, contato, acompanhantes, rsvp, restricao_alimentar, categoria, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, String(tenantId), String(eventId), s(campos.nome, 160), s(campos.contato, 120),
      Math.max(0, Math.trunc(Number(campos.acompanhantes) || 0)),
      ['pendente', 'confirmado', 'recusado'].includes(campos.rsvp) ? campos.rsvp : 'pendente',
      s(campos.restricao_alimentar, 200), s(campos.categoria, 60), nowISO());
  return id;
}
function atualizarConvidado(tenantId, id, campos, ator, ip) {
  const g = db.prepare('SELECT * FROM event_guests WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!g) throw new Error('Convidado não encontrado.');
  const checkin = campos.checkin === true ? (g.checkin_em || nowISO()) : (campos.checkin === false ? '' : g.checkin_em);
  db.prepare(`UPDATE event_guests SET nome = ?, contato = ?, acompanhantes = ?, rsvp = ?, restricao_alimentar = ?, categoria = ?, checkin_em = ? WHERE id = ? AND tenant_id = ?`)
    .run(s(campos.nome || g.nome, 160), s(campos.contato ?? g.contato, 120),
      campos.acompanhantes != null ? Math.max(0, Math.trunc(Number(campos.acompanhantes) || 0)) : g.acompanhantes,
      ['pendente', 'confirmado', 'recusado'].includes(campos.rsvp) ? campos.rsvp : g.rsvp,
      s(campos.restricao_alimentar ?? g.restricao_alimentar, 200), s(campos.categoria ?? g.categoria, 60), checkin, g.id, String(tenantId));
}
function removerConvidado(tenantId, id) {
  const r = db.prepare('DELETE FROM event_guests WHERE id = ? AND tenant_id = ?').run(String(id), String(tenantId));
  if (!r.changes) throw new Error('Convidado não encontrado.');
}

// ------------------------------------------------------------ resumo (dashboard)
function resumoEventos(tenantId) {
  const hoje = nowISO().slice(0, 10);
  const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  return {
    eventos_confirmados: db.prepare("SELECT COUNT(*) n FROM events WHERE tenant_id = ? AND status IN ('confirmado','em_preparacao')").get(String(tenantId)).n,
    eventos_negociacao: db.prepare("SELECT COUNT(*) n FROM events WHERE tenant_id = ? AND status IN ('lead','briefing','proposta','negociacao')").get(String(tenantId)).n,
    eventos_proximos_30d: db.prepare(`SELECT COUNT(*) n FROM events WHERE tenant_id = ? AND data != '' AND data >= ? AND data <= ? AND status NOT IN ('cancelado','realizado','pos_evento')`).get(String(tenantId), hoje, em30).n,
  };
}

module.exports = {
  STATUS_EVENTO, TIPOS, CAT_FORNECEDOR, SECOES_BRIEFING,
  criarFornecedor, listarFornecedores, atualizarFornecedor,
  criarEvento, obterEvento, listarEventos, atualizarEvento,
  alocarFornecedor, atualizarAlocacao, removerAlocacao,
  listarConvidados, adicionarConvidado, atualizarConvidado, removerConvidado,
  resumoEventos,
};
