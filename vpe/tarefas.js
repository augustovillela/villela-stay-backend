// =====================================================================
// Villela Projects & Events — Fase 3: execução.
// Tarefas (com subtarefas, checklist embutido, etiquetas, prazo,
// dependência que TRAVA a conclusão), visão Kanban/lista/agenda e
// riscos por projeto (probabilidade × impacto, prevenção/contingência).
// "Atrasada" é sempre DERIVADO (prazo < hoje e não concluída) — nunca
// um status gravado, para não dessincronizar.
// Gantt/caminho crítico e recorrência: fases futuras (ver README).
// =====================================================================
'use strict';
const { db, nowISO, novoId, j } = require('./db');
const repo = require('./repo');

const s = repo.s;
const STATUS_TAREFA = ['pendente', 'em_andamento', 'aguardando', 'em_revisao', 'concluida', 'cancelada'];
const PRIORIDADES = ['alta', 'media', 'baixa'];
const PROB = ['baixa', 'media', 'alta'];
const IMP = ['baixo', 'medio', 'alto'];
const hoje = () => nowISO().slice(0, 10);

// ------------------------------------------------------------ tarefas
function validarChecklist(v) {
  return (Array.isArray(v) ? v : []).slice(0, 40).map(it => ({ t: s(it && it.t, 200), feito: !!(it && it.feito) })).filter(it => it.t);
}
function criarTarefa(tenantId, projectId, campos, ator, ip) {
  repo.obterProjeto(tenantId, projectId);
  if (!s(campos.titulo, 200)) throw new Error('Dê um título à tarefa.');
  if (campos.parent_id) {
    const pai = db.prepare('SELECT id, parent_id FROM project_tasks WHERE id = ? AND tenant_id = ? AND project_id = ?')
      .get(String(campos.parent_id), String(tenantId), String(projectId));
    if (!pai) throw new Error('Tarefa-mãe não encontrada.');
    if (pai.parent_id) throw new Error('Subtarefa não pode ter subtarefa (máx. 2 níveis).');
  }
  if (campos.dependencia_de) obterTarefa(tenantId, campos.dependencia_de); // valida tenant
  if (campos.responsavel_id) {
    const v = repo.vinculo(tenantId, campos.responsavel_id);
    if (!v || v.status !== 'ativo') throw new Error('Responsável não é usuário ativo da empresa.');
  }
  const id = novoId();
  db.prepare(`INSERT INTO project_tasks (id, tenant_id, project_id, parent_id, titulo, descricao, responsavel_id,
      prioridade, prazo, status, etiquetas, checklist, dependencia_de, ordem, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,'pendente',?,?,?,?,?,?)`)
    .run(id, String(tenantId), String(projectId), s(campos.parent_id, 40), s(campos.titulo, 200), s(campos.descricao, 2000),
      s(campos.responsavel_id, 40), PRIORIDADES.includes(campos.prioridade) ? campos.prioridade : 'media',
      s(campos.prazo, 10), j.str((Array.isArray(campos.etiquetas) ? campos.etiquetas : []).map(t => s(t, 30)).filter(Boolean).slice(0, 10)),
      j.str(validarChecklist(campos.checklist)), s(campos.dependencia_de, 40),
      Math.trunc(Number(campos.ordem) || 0), nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'tarefa.criar', 'project_tasks', id, { projeto: String(projectId), titulo: s(campos.titulo, 120) }, ip);
  return obterTarefa(tenantId, id);
}
function obterTarefa(tenantId, id) {
  const t = db.prepare('SELECT * FROM project_tasks WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!t) throw new Error('Tarefa não encontrada.');
  t.etiquetas = j.parse(t.etiquetas, []);
  t.checklist = j.parse(t.checklist, []);
  t.atrasada = !!(t.prazo && t.prazo < hoje() && !['concluida', 'cancelada'].includes(t.status));
  t.subtarefas = db.prepare('SELECT id, titulo, status, prazo, responsavel_id FROM project_tasks WHERE tenant_id = ? AND parent_id = ? ORDER BY ordem, criado_em')
    .all(String(tenantId), t.id);
  return t;
}
function listarTarefas(tenantId, { project_id = '', responsavel_id = '', status = '', so_atrasadas = false } = {}) {
  let sql = "SELECT * FROM project_tasks WHERE tenant_id = ? AND parent_id = ''";
  const args = [String(tenantId)];
  if (project_id) { sql += ' AND project_id = ?'; args.push(String(project_id)); }
  if (responsavel_id) { sql += ' AND responsavel_id = ?'; args.push(String(responsavel_id)); }
  if (status) { sql += ' AND status = ?'; args.push(s(status, 20)); }
  sql += " ORDER BY CASE status WHEN 'concluida' THEN 1 WHEN 'cancelada' THEN 1 ELSE 0 END, CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, CASE WHEN prazo='' THEN 1 ELSE 0 END, prazo LIMIT 500";
  let ts = db.prepare(sql).all(...args).map(t => ({
    ...t, etiquetas: j.parse(t.etiquetas, []), checklist: j.parse(t.checklist, []),
    atrasada: !!(t.prazo && t.prazo < hoje() && !['concluida', 'cancelada'].includes(t.status)),
    subtarefas_total: db.prepare('SELECT COUNT(*) n FROM project_tasks WHERE tenant_id = ? AND parent_id = ?').get(String(tenantId), t.id).n,
    subtarefas_feitas: db.prepare("SELECT COUNT(*) n FROM project_tasks WHERE tenant_id = ? AND parent_id = ? AND status = 'concluida'").get(String(tenantId), t.id).n,
  }));
  if (so_atrasadas) ts = ts.filter(t => t.atrasada);
  return ts;
}
function atualizarTarefa(tenantId, id, campos, ator, ip) {
  const t = obterTarefa(tenantId, id);
  // conclusão travada por dependência não concluída
  if (campos.status === 'concluida' && t.dependencia_de) {
    const dep = db.prepare('SELECT status, titulo FROM project_tasks WHERE id = ? AND tenant_id = ?').get(t.dependencia_de, String(tenantId));
    if (dep && dep.status !== 'concluida') throw new Error(`Conclua antes a dependência: "${dep.titulo}".`);
  }
  if (campos.status && !STATUS_TAREFA.includes(campos.status)) throw new Error('Status inválido.');
  if (campos.responsavel_id) {
    const v = repo.vinculo(tenantId, campos.responsavel_id);
    if (!v || v.status !== 'ativo') throw new Error('Responsável não é usuário ativo da empresa.');
  }
  const novoStatus = campos.status || t.status;
  db.prepare(`UPDATE project_tasks SET titulo = ?, descricao = ?, responsavel_id = ?, prioridade = ?, prazo = ?,
      status = ?, etiquetas = ?, checklist = ?, dependencia_de = ?, concluida_em = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?`)
    .run(s(campos.titulo || t.titulo, 200), s(campos.descricao ?? t.descricao, 2000),
      campos.responsavel_id !== undefined ? s(campos.responsavel_id, 40) : t.responsavel_id,
      PRIORIDADES.includes(campos.prioridade) ? campos.prioridade : t.prioridade,
      campos.prazo !== undefined ? s(campos.prazo, 10) : t.prazo,
      novoStatus, campos.etiquetas != null ? j.str((Array.isArray(campos.etiquetas) ? campos.etiquetas : []).map(x => s(x, 30)).filter(Boolean).slice(0, 10)) : j.str(t.etiquetas),
      campos.checklist != null ? j.str(validarChecklist(campos.checklist)) : j.str(t.checklist),
      campos.dependencia_de !== undefined ? s(campos.dependencia_de, 40) : t.dependencia_de,
      novoStatus === 'concluida' ? (t.concluida_em || nowISO()) : '',
      nowISO(), t.id, String(tenantId));
  repo.auditar(tenantId, ator, campos.status && campos.status !== t.status ? 'tarefa.mudar_status' : 'tarefa.atualizar',
    'project_tasks', t.id, campos.status && campos.status !== t.status ? { de: t.status, para: campos.status } : { campos: Object.keys(campos) }, ip);
  return obterTarefa(tenantId, t.id);
}
function excluirTarefa(tenantId, id, ator, ip) {
  const t = obterTarefa(tenantId, id);
  db.prepare('DELETE FROM project_tasks WHERE tenant_id = ? AND parent_id = ?').run(String(tenantId), t.id); // subtarefas junto
  db.prepare('DELETE FROM project_tasks WHERE id = ? AND tenant_id = ?').run(t.id, String(tenantId));
  repo.auditar(tenantId, ator, 'tarefa.excluir', 'project_tasks', t.id, { titulo: t.titulo }, ip);
}

// Kanban: colunas por status (tarefas-raiz).
function kanban(tenantId, projectId) {
  const ts = listarTarefas(tenantId, { project_id: projectId });
  const colunas = {};
  for (const st of STATUS_TAREFA) colunas[st] = [];
  for (const t of ts) (colunas[t.status] || colunas.pendente).push(t);
  return { colunas, ordem_colunas: STATUS_TAREFA };
}
// Agenda: tarefas com prazo agrupadas por dia (próximos N dias + atrasadas).
function agenda(tenantId, { dias = 30, responsavel_id = '' } = {}) {
  const ate = new Date(Date.now() + Math.min(Math.max(1, dias), 120) * 86400000).toISOString().slice(0, 10);
  let sql = `SELECT * FROM project_tasks WHERE tenant_id = ? AND prazo != '' AND prazo <= ? AND status NOT IN ('concluida','cancelada')`;
  const args = [String(tenantId), ate];
  if (responsavel_id) { sql += ' AND responsavel_id = ?'; args.push(String(responsavel_id)); }
  const ts = db.prepare(sql + ' ORDER BY prazo').all(...args);
  const porDia = {};
  for (const t of ts) {
    (porDia[t.prazo] = porDia[t.prazo] || []).push({
      id: t.id, titulo: t.titulo, project_id: t.project_id, prioridade: t.prioridade, status: t.status,
      atrasada: t.prazo < hoje(),
      projeto_nome: (db.prepare('SELECT nome FROM projects WHERE id = ? AND tenant_id = ?').get(t.project_id, String(tenantId)) || {}).nome || '',
    });
  }
  return { porDia, dias: Object.keys(porDia).sort() };
}
function resumoExecucao(tenantId) {
  const abertas = db.prepare(`SELECT COUNT(*) n FROM project_tasks WHERE tenant_id = ? AND status NOT IN ('concluida','cancelada')`).get(String(tenantId)).n;
  const atrasadas = db.prepare(`SELECT COUNT(*) n FROM project_tasks WHERE tenant_id = ? AND prazo != '' AND prazo < ? AND status NOT IN ('concluida','cancelada')`).get(String(tenantId), hoje()).n;
  const riscosAltos = db.prepare(`SELECT COUNT(*) n FROM project_risks WHERE tenant_id = ? AND status = 'aberto' AND probabilidade = 'alta' AND impacto = 'alto'`).get(String(tenantId)).n;
  return { tarefas_abertas: abertas, tarefas_atrasadas: atrasadas, riscos_criticos: riscosAltos };
}

// ------------------------------------------------------------ riscos
function criarRisco(tenantId, projectId, campos, ator, ip) {
  repo.obterProjeto(tenantId, projectId);
  if (!s(campos.descricao, 500)) throw new Error('Descreva o risco.');
  const id = novoId();
  db.prepare(`INSERT INTO project_risks (id, tenant_id, project_id, descricao, probabilidade, impacto,
      plano_prevencao, plano_contingencia, responsavel, status, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,'aberto',?,?)`)
    .run(id, String(tenantId), String(projectId), s(campos.descricao, 500),
      PROB.includes(campos.probabilidade) ? campos.probabilidade : 'media',
      IMP.includes(campos.impacto) ? campos.impacto : 'medio',
      s(campos.plano_prevencao, 1000), s(campos.plano_contingencia, 1000), s(campos.responsavel, 120), nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'risco.criar', 'project_risks', id, { projeto: String(projectId), descricao: s(campos.descricao, 120) }, ip);
  return id;
}
function listarRiscos(tenantId, projectId) {
  repo.obterProjeto(tenantId, projectId);
  const nivel = { baixa: 1, media: 2, alta: 3, baixo: 1, medio: 2, alto: 3 };
  return db.prepare('SELECT * FROM project_risks WHERE tenant_id = ? AND project_id = ? ORDER BY status, criado_em DESC')
    .all(String(tenantId), String(projectId))
    .map(r => ({ ...r, severidade: nivel[r.probabilidade] * nivel[r.impacto] })) // 1-9
    .sort((a, b) => (a.status === 'aberto' ? 0 : 1) - (b.status === 'aberto' ? 0 : 1) || b.severidade - a.severidade);
}
function atualizarRisco(tenantId, id, campos, ator, ip) {
  const r = db.prepare('SELECT * FROM project_risks WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!r) throw new Error('Risco não encontrado.');
  if (campos.status && !['aberto', 'mitigado', 'ocorreu', 'encerrado'].includes(campos.status)) throw new Error('Status inválido.');
  db.prepare(`UPDATE project_risks SET descricao = ?, probabilidade = ?, impacto = ?, plano_prevencao = ?,
      plano_contingencia = ?, responsavel = ?, status = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?`)
    .run(s(campos.descricao || r.descricao, 500),
      PROB.includes(campos.probabilidade) ? campos.probabilidade : r.probabilidade,
      IMP.includes(campos.impacto) ? campos.impacto : r.impacto,
      s(campos.plano_prevencao ?? r.plano_prevencao, 1000), s(campos.plano_contingencia ?? r.plano_contingencia, 1000),
      s(campos.responsavel ?? r.responsavel, 120), campos.status || r.status, nowISO(), r.id, String(tenantId));
  repo.auditar(tenantId, ator, 'risco.atualizar', 'project_risks', r.id, { status: campos.status || r.status }, ip);
}

module.exports = {
  STATUS_TAREFA,
  criarTarefa, obterTarefa, listarTarefas, atualizarTarefa, excluirTarefa,
  kanban, agenda, resumoExecucao,
  criarRisco, listarRiscos, atualizarRisco,
};
