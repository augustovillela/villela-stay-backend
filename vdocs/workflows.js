// =====================================================================
// Villela Docs Intelligence — Fase 6: workflows de aprovação.
//
// DECISÕES (MVP, documentadas no README): etapas SEQUENCIAIS; dentro da
// etapa QUALQUER aprovador listado decide sozinho (modo "qualquer" —
// etapas paralelas/unanimidade ficam p/ evolução); rejeição encerra a
// instância com justificativa obrigatória (reenvio = nova instância);
// as etapas são CONGELADAS na abertura (mudar o modelo não afeta fluxos
// em andamento). Notificação ao aprovador: e-mail best-effort + tela
// Aprovações. Lembrete de atrasadas entra na rotina diária (jobs.js).
// =====================================================================
'use strict';
const { db, transacao, nowISO, novoId, j } = require('./db');
const repo = require('./repo');
const push = require('./push');

const s = repo.s;
let _canais = { enviarEmail: null };
function configurar(canais) { Object.assign(_canais, canais || {}); }

// ------------------------------------------------------------ modelos
function validarEtapas(etapas, tenantId) {
  if (!Array.isArray(etapas) || !etapas.length) throw new Error('Defina pelo menos uma etapa.');
  if (etapas.length > 10) throw new Error('Máximo de 10 etapas.');
  return etapas.map((e, i) => {
    const aprovadores = (Array.isArray(e.aprovadores) ? e.aprovadores : []).map(a => String(a)).slice(0, 20);
    if (!aprovadores.length) throw new Error(`Etapa ${i + 1} sem aprovadores.`);
    for (const uid of aprovadores) {
      const v = repo.vinculo(tenantId, uid);
      if (!v || v.status !== 'ativo') throw new Error(`Etapa ${i + 1}: aprovador não é usuário ativo da empresa.`);
    }
    return { nome: s(e.nome || `Etapa ${i + 1}`, 80), aprovadores, prazo_dias: Math.min(Math.max(0, Math.trunc(Number(e.prazo_dias) || 0)), 90) };
  });
}
const listarModelos = (tenantId, soAtivos = true) =>
  db.prepare(`SELECT * FROM workflows WHERE tenant_id = ? ${soAtivos ? 'AND ativo = 1' : ''} ORDER BY nome`)
    .all(String(tenantId)).map(w => ({ ...w, etapas: j.parse(w.etapas, []) }));
function salvarModelo(tenantId, { id, nome, descricao, etapas, ativo }, ator, ip) {
  if (!s(nome, 80)) throw new Error('Dê um nome ao fluxo.');
  const et = j.str(validarEtapas(etapas, tenantId));
  if (id) {
    const w = db.prepare('SELECT id FROM workflows WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
    if (!w) throw new Error('Fluxo não encontrado.');
    db.prepare('UPDATE workflows SET nome = ?, descricao = ?, etapas = ?, ativo = ? WHERE id = ?')
      .run(s(nome, 80), s(descricao, 300), et, ativo === false ? 0 : 1, w.id);
    repo.auditar(tenantId, ator, 'workflow.atualizar', 'workflows', w.id, { nome: s(nome, 80) }, ip);
    return w.id;
  }
  const novo = novoId();
  db.prepare('INSERT INTO workflows (id, tenant_id, nome, descricao, etapas, ativo, criado_em, criado_por) VALUES (?,?,?,?,?,1,?,?)')
    .run(novo, String(tenantId), s(nome, 80), s(descricao, 300), et, nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'workflow.criar', 'workflows', novo, { nome: s(nome, 80) }, ip);
  return novo;
}

// ------------------------------------------------------------ instâncias
function notificarAprovadores(tenantId, inst, etapa) {
  // push do painel (PWA) — best-effort, nunca bloqueia o fluxo de aprovação
  const docPush = inst.document_id
    ? db.prepare('SELECT nome FROM documents WHERE id = ? AND tenant_id = ?').get(String(inst.document_id), String(tenantId))
    : null;
  const corpoPush = `${docPush ? docPush.nome : (inst.workflow_nome || 'Documento')} aguarda sua decisão` +
    (etapa && etapa.nome ? ` (etapa: ${etapa.nome})` : '') + '.';
  for (const uid of ((etapa && etapa.aprovadores) || [])) {
    push.notificarUsuario(uid, { title: 'Aprovação pendente', body: corpoPush, url: '/vdocs/app', tag: 'vdocs-aprovacao' }).catch(() => {});
  }
  if (typeof _canais.enviarEmail !== 'function') return;
  for (const uid of etapa.aprovadores) {
    const u = repo.userPorId(uid);
    if (!u || !u.email) continue;
    Promise.resolve(_canais.enviarEmail(u.email,
      `Villela Docs — aprovação pendente: ${inst.workflow_nome}`,
      `<p>Você tem um documento aguardando sua decisão na etapa <b>${s(etapa.nome, 80)}</b>` +
      `${inst.prazo_em ? ` (prazo: ${inst.prazo_em.slice(0, 10).split('-').reverse().join('/')})` : ''}.</p>` +
      `<p><a href="https://villela-stay-backend.onrender.com/vdocs/app">Abrir o painel → Aprovações</a></p>`)).catch(() => {});
  }
}
function prazoDe(etapa) {
  return etapa.prazo_dias ? new Date(Date.now() + etapa.prazo_dias * 24 * 3600 * 1000).toISOString() : '';
}

function iniciar(tenantId, { document_id, workflow_id }, ator, ip) {
  const docs = require('./docs');
  const d = docs.obterDocumento(tenantId, document_id);
  if (d.status !== 'ativo') throw new Error('Documento na lixeira não entra em aprovação.');
  const w = db.prepare('SELECT * FROM workflows WHERE id = ? AND tenant_id = ? AND ativo = 1').get(String(workflow_id), String(tenantId));
  if (!w) throw new Error('Fluxo de aprovação não encontrado.');
  const aberta = db.prepare("SELECT id FROM workflow_instances WHERE tenant_id = ? AND document_id = ? AND status = 'em_andamento'").get(String(tenantId), d.id);
  if (aberta) throw new Error('Este documento já tem uma aprovação em andamento.');
  const etapas = j.parse(w.etapas, []);
  const id = novoId();
  const inst = {
    id, workflow_nome: w.nome, prazo_em: prazoDe(etapas[0]), document_id: d.id,
  };
  db.prepare(`INSERT INTO workflow_instances (id, tenant_id, workflow_id, workflow_nome, etapas, document_id, versao, etapa_atual, status, prazo_em, criado_em, criado_por)
    VALUES (?,?,?,?,?,?,?,0,'em_andamento',?,?,?)`)
    .run(id, String(tenantId), w.id, w.nome, w.etapas, d.id, d.versao_atual, inst.prazo_em, nowISO(), s(ator && ator.id, 40));
  repo.auditar(tenantId, ator, 'aprovacao.iniciar', 'workflow_instances', id, { documento: d.nome, fluxo: w.nome }, ip);
  notificarAprovadores(tenantId, inst, etapas[0]);
  return id;
}

function obterInstancia(tenantId, id) {
  const inst = db.prepare('SELECT * FROM workflow_instances WHERE id = ? AND tenant_id = ?').get(String(id), String(tenantId));
  if (!inst) throw new Error('Aprovação não encontrada.');
  inst.etapas = j.parse(inst.etapas, []);
  inst.decisoes = db.prepare('SELECT * FROM workflow_approvals WHERE tenant_id = ? AND instance_id = ? ORDER BY criado_em').all(String(tenantId), inst.id);
  return inst;
}

// pendentes p/ MIM (sou aprovador da etapa atual) + minhas solicitações
function listar(tenantId, userId) {
  const abertas = db.prepare("SELECT * FROM workflow_instances WHERE tenant_id = ? AND status = 'em_andamento' ORDER BY criado_em DESC LIMIT 200").all(String(tenantId));
  const minhas = db.prepare('SELECT * FROM workflow_instances WHERE tenant_id = ? AND criado_por = ? ORDER BY criado_em DESC LIMIT 50').all(String(tenantId), String(userId));
  const docNome = (docId) => { const d = db.prepare('SELECT nome FROM documents WHERE id = ? AND tenant_id = ?').get(docId, String(tenantId)); return d ? d.nome : '(excluído)'; };
  const expand = (inst) => {
    const etapas = j.parse(inst.etapas, []);
    const etapa = etapas[inst.etapa_atual] || {};
    return { id: inst.id, workflow_nome: inst.workflow_nome, document_id: inst.document_id, documento: docNome(inst.document_id), versao: inst.versao, status: inst.status, etapa_atual: inst.etapa_atual, etapa_nome: etapa.nome || '', total_etapas: etapas.length, prazo_em: inst.prazo_em, atrasada: !!(inst.prazo_em && inst.prazo_em < nowISO() && inst.status === 'em_andamento'), criado_em: inst.criado_em, criado_por: inst.criado_por };
  };
  const pendentes = abertas.filter(inst => {
    const etapa = j.parse(inst.etapas, [])[inst.etapa_atual] || {};
    return (etapa.aprovadores || []).includes(String(userId));
  }).map(expand);
  return { pendentes, minhas: minhas.map(expand) };
}

function decidir(tenantId, instanceId, { decisao, justificativa }, ator, ip) {
  if (!['aprovar', 'rejeitar'].includes(decisao)) throw new Error('Decisão inválida.');
  if (decisao === 'rejeitar' && !s(justificativa, 500)) throw new Error('Rejeição exige justificativa.');
  return transacao(() => {
    const inst = obterInstancia(tenantId, instanceId);
    if (inst.status !== 'em_andamento') throw new Error('Esta aprovação já foi finalizada.');
    const etapa = inst.etapas[inst.etapa_atual] || {};
    if (!(etapa.aprovadores || []).includes(String(ator.id))) throw new Error('Você não é aprovador desta etapa.');
    db.prepare('INSERT INTO workflow_approvals (tenant_id, instance_id, etapa, aprovador_id, decisao, justificativa, criado_em) VALUES (?,?,?,?,?,?,?)')
      .run(String(tenantId), inst.id, inst.etapa_atual, String(ator.id), decisao, s(justificativa, 500), nowISO());
    if (decisao === 'rejeitar') {
      db.prepare("UPDATE workflow_instances SET status = 'rejeitado', finalizado_em = ? WHERE id = ?").run(nowISO(), inst.id);
      repo.auditar(tenantId, ator, 'aprovacao.rejeitar', 'workflow_instances', inst.id, { etapa: etapa.nome, justificativa: s(justificativa, 200) }, ip);
      avisarSolicitante(tenantId, inst, `rejeitado na etapa "${etapa.nome}": ${s(justificativa, 200)}`);
      require('./api-publica').emitir(tenantId, 'aprovacao.finalizada', { instance_id: inst.id, document_id: inst.document_id, fluxo: inst.workflow_nome, resultado: 'rejeitado', justificativa: s(justificativa, 200) });
      return { status: 'rejeitado' };
    }
    const proxima = inst.etapa_atual + 1;
    if (proxima >= inst.etapas.length) {
      db.prepare("UPDATE workflow_instances SET status = 'aprovado', finalizado_em = ? WHERE id = ?").run(nowISO(), inst.id);
      repo.auditar(tenantId, ator, 'aprovacao.aprovar_final', 'workflow_instances', inst.id, { fluxo: inst.workflow_nome }, ip);
      avisarSolicitante(tenantId, inst, 'APROVADO em todas as etapas ✅');
      require('./api-publica').emitir(tenantId, 'aprovacao.finalizada', { instance_id: inst.id, document_id: inst.document_id, fluxo: inst.workflow_nome, resultado: 'aprovado' });
      return { status: 'aprovado' };
    }
    const prazo = prazoDe(inst.etapas[proxima]);
    db.prepare('UPDATE workflow_instances SET etapa_atual = ?, prazo_em = ? WHERE id = ?').run(proxima, prazo, inst.id);
    repo.auditar(tenantId, ator, 'aprovacao.aprovar_etapa', 'workflow_instances', inst.id, { etapa: etapa.nome, proxima: inst.etapas[proxima].nome }, ip);
    notificarAprovadores(tenantId, { ...inst, prazo_em: prazo }, inst.etapas[proxima]);
    return { status: 'em_andamento', etapa_atual: proxima };
  });
}

function cancelar(tenantId, instanceId, ator, ip) {
  const inst = obterInstancia(tenantId, instanceId);
  if (inst.status !== 'em_andamento') throw new Error('Esta aprovação já foi finalizada.');
  if (inst.criado_por !== String(ator.id)) throw new Error('Só quem enviou pode cancelar.');
  db.prepare("UPDATE workflow_instances SET status = 'cancelado', finalizado_em = ? WHERE id = ?").run(nowISO(), inst.id);
  repo.auditar(tenantId, ator, 'aprovacao.cancelar', 'workflow_instances', inst.id, {}, ip);
}

function avisarSolicitante(tenantId, inst, resumo) {
  if (typeof _canais.enviarEmail !== 'function') return;
  const u = repo.userPorId(inst.criado_por);
  if (!u || !u.email) return;
  Promise.resolve(_canais.enviarEmail(u.email, `Villela Docs — resultado da aprovação: ${inst.workflow_nome}`,
    `<p>O fluxo <b>${s(inst.workflow_nome, 80)}</b> foi ${s(resumo, 300)}.</p><p><a href="https://villela-stay-backend.onrender.com/vdocs/app">Abrir o painel</a></p>`)).catch(() => {});
}

// aprovações em andamento de um documento (p/ tela de detalhe)
function doDocumento(tenantId, documentId) {
  return db.prepare('SELECT id, workflow_nome, status, etapa_atual, etapas, prazo_em, criado_em FROM workflow_instances WHERE tenant_id = ? AND document_id = ? ORDER BY criado_em DESC LIMIT 10')
    .all(String(tenantId), String(documentId))
    .map(inst => { const et = j.parse(inst.etapas, []); return { id: inst.id, workflow_nome: inst.workflow_nome, status: inst.status, etapa: (et[inst.etapa_atual] || {}).nome || '', total: et.length, etapa_atual: inst.etapa_atual, prazo_em: inst.prazo_em, criado_em: inst.criado_em }; });
}

// lembrete diário de atrasadas (chamado pela rotina do jobs.js)
async function lembrarAtrasadas() {
  const atrasadas = db.prepare("SELECT * FROM workflow_instances WHERE status = 'em_andamento' AND prazo_em != '' AND prazo_em < ?").all(nowISO());
  for (const inst of atrasadas) {
    const etapas = j.parse(inst.etapas, []);
    notificarAprovadores(inst.tenant_id, inst, etapas[inst.etapa_atual] || { aprovadores: [] });
    repo.auditar(inst.tenant_id, { id: 'sistema', nome: 'Rotina de aprovações' }, 'aprovacao.lembrete_atraso', 'workflow_instances', inst.id, {}, 'rotina');
  }
  return atrasadas.length;
}

module.exports = { configurar, listarModelos, salvarModelo, iniciar, obterInstancia, listar, decidir, cancelar, doDocumento, lembrarAtrasadas };
