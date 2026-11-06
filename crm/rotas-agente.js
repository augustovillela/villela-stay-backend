// =====================================================================
// Villela CRM — rotas das AUTOMAÇÕES (scripts, agentes) sobre a empresa interna
// `villela-stay`: o substituto das rotas `/staff/api/crm/*` do CRM legado.
//
// Autenticação: a mesma do legado (x-publish-key OU sessão de admin/vendas) — injetada por
// server.js. Só enxerga a empresa interna (CRM_PONTE_SLUG, padrão villela-stay).
// O FORMATO das respostas é o do legado de propósito: os scripts só trocam o endereço.
//   /staff/api/crm/followups          -> /staff/api/vcrm/agente/followups
//   /staff/api/crm/contatos/:id       -> /staff/api/vcrm/agente/contatos/:id   (GET, PATCH)
//   /staff/api/crm/contatos/:id/atividade -> /staff/api/vcrm/agente/contatos/:id/atividade
//   /staff/api/crm/inbox              -> /staff/api/vcrm/agente/inbox
//   /staff/api/crm/inbox/:id/atendida -> /staff/api/vcrm/agente/inbox/:id/atendida
// Mais /resumo (contagens, para conferir a migração).
// Não apaga nada: tarefa trocada é CONCLUÍDA, nunca excluída.
// =====================================================================
'use strict';
const { db, hojeISO } = require('./db');
const repo = require('./repo');
const appRepo = require('./app-repo');
const imp = require('./importar-legado');

const MARCA_AGENTE = 'Follow-up automático';
const IDX_PARA_LEGADO = ['novo', 'contato', 'contato', 'orcamento', 'negociacao', 'reserva'];
const s = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);

function registrarRotasAgente(app, { requirePublishOrSession, podeCRM }) {
  const A = [requirePublishOrSession, podeCRM];
  const h = (fn) => (req, res) => { try { fn(req, res); } catch (e) { res.status(e.status || 400).json({ erro: e.message }); } };
  const slug = () => process.env.CRM_PONTE_SLUG || 'villela-stay';
  const tenant = () => {
    const t = repo.Tenants.porSlug(slug());
    if (!t) { const e = new Error(`A empresa "${slug()}" não existe no CRM novo.`); e.status = 404; throw e; }
    return t;
  };
  const naoAchou = () => { const e = new Error('Contato não encontrado.'); e.status = 404; return e; };

  // estágio no vocabulário do legado (os scripts escolhem rascunho/template por ele)
  const estagioLegado = (ctx, c) => {
    const opp = ctx.ultimaOpp.get(ctx.tid, c.id);
    if (!opp) return c.tipo === 'hospede' ? 'posvenda' : 'novo';
    if (opp.status === 'perdida') return 'perdido';
    if (opp.status === 'ganha') return 'posvenda';
    const i = ctx.abertos.findIndex((e) => e.id === opp.estagio_id);
    return IDX_PARA_LEGADO[Math.min(Math.max(i, 0), IDX_PARA_LEGADO.length - 1)];
  };
  // período/imóvel de interesse estão no obs ("período A a B") e em produto_interesse
  const periodoDe = (c) => {
    const m = /período (\S+) a (\S+?)[\s\]·]/.exec(String(c.obs || '') + ' ');
    return m && m[1] !== '?' ? { checkin: m[1], checkout: m[2] === '?' ? '' : m[2] } : { checkin: '', checkout: '' };
  };
  const forma = (ctx, c, tarefa) => ({
    id: c.id, nome: c.nome, telefone: c.telefone, email: c.email, estagio: estagioLegado(ctx, c),
    imovelInteresse: c.produto_interesse || '', periodo: periodoDe(c),
    proximaAcao: tarefa ? { descricao: tarefa.titulo, data: tarefa.vence_em } : { descricao: c.proxima_acao || '', data: c.proxima_acao_em || '' },
  });

  // troca a próxima ação: conclui as tarefas abertas do contato e cria a nova (se vier data)
  const trocarProximaAcao = (t, c, pa, autor) => {
    for (const x of db.prepare("SELECT id FROM crm_tarefas WHERE tenant_id = ? AND contato_id = ? AND status = 'aberta'").all(t.id, c.id)) appRepo.Tarefas.concluir(t.id, x.id, autor);
    const data = s(pa && pa.data, 10);
    appRepo.Contatos.atualizar(t.id, c.id, { proxima_acao: data ? s(pa.descricao, 200) : '', proxima_acao_em: data }, autor);
    if (data) appRepo.Tarefas.criar(t.id, { contato_id: c.id, titulo: s(pa.descricao, 200) || 'Follow-up', vence_em: data, origem: 'automacao', obs: MARCA_AGENTE }, autor);
  };

  // conversas classificadas LOCALMENTE (stays\conversas-leads.mjs): chegam só assunto/razão/contagens, nunca texto
  app.post('/staff/api/vcrm/agente/conversas', ...A, h((req, res) => {
    const t = tenant();
    res.json({ ok: true, ...require('./conversas').ingerir(t.id, (req.body || {}).itens, s((req.body || {}).fonte, 40) || 'local') });
  }));

  app.get('/staff/api/vcrm/agente/resumo', ...A, h((req, res) => {
    const t = tenant(); const hoje = hojeISO();
    const um = (sql, ...a) => db.prepare(sql).get(t.id, ...a).n;
    res.json({
      ok: true, tenant: t.slug,
      contatos: um("SELECT COUNT(*) n FROM crm_contatos WHERE tenant_id = ? AND status = 'ativo'"),
      contatos_legado: um("SELECT COUNT(*) n FROM crm_contatos WHERE tenant_id = ? AND tags LIKE '%\"legado\"%'"),
      oportunidades_abertas: um("SELECT COUNT(*) n FROM crm_oportunidades WHERE tenant_id = ? AND status = 'aberta'"),
      oportunidades_perdidas: um("SELECT COUNT(*) n FROM crm_oportunidades WHERE tenant_id = ? AND status = 'perdida'"),
      atividades: um('SELECT COUNT(*) n FROM crm_atividades WHERE tenant_id = ?'),
      tarefas_abertas: um("SELECT COUNT(*) n FROM crm_tarefas WHERE tenant_id = ? AND status = 'aberta'"),
      tarefas_atrasadas: um("SELECT COUNT(*) n FROM crm_tarefas WHERE tenant_id = ? AND status = 'aberta' AND vence_em != '' AND vence_em < ?", hoje),
      tarefas_hoje: um("SELECT COUNT(*) n FROM crm_tarefas WHERE tenant_id = ? AND status = 'aberta' AND vence_em = ?", hoje),
    });
  }));

  // Follow-ups = contatos com tarefa aberta vencida/para hoje (a mais antiga de cada um), sem os perdidos.
  app.get('/staff/api/vcrm/agente/followups', ...A, h((req, res) => {
    const t = tenant(); const ctx = imp.contexto(t);
    const tarefas = db.prepare(`SELECT tk.* FROM crm_tarefas tk JOIN crm_contatos c ON c.id = tk.contato_id
      WHERE tk.tenant_id = ? AND tk.status = 'aberta' AND tk.vence_em != '' AND tk.vence_em <= ? AND c.status = 'ativo'
      ORDER BY tk.vence_em, tk.criado_em`).all(t.id, ctx.hoje);
    const vistos = new Set(); const followups = [];
    for (const tk of tarefas) {
      if (vistos.has(tk.contato_id)) continue;
      vistos.add(tk.contato_id);
      const c = appRepo.Contatos.obter(t.id, tk.contato_id); if (!c) continue;
      const f = forma(ctx, c, tk);
      if (f.estagio !== 'perdido') followups.push(f);
    }
    res.json({ followups });
  }));

  app.get('/staff/api/vcrm/agente/contatos/:id', ...A, h((req, res) => {
    const t = tenant(); const c = appRepo.Contatos.obter(t.id, req.params.id);
    if (!c) throw naoAchou();
    const atividades = db.prepare('SELECT tipo, texto, canal, autor, data FROM crm_atividades WHERE tenant_id = ? AND contato_id = ? ORDER BY data DESC LIMIT 300').all(t.id, c.id);
    res.json({ contato: forma(imp.contexto(t), c), atividades });
  }));

  app.patch('/staff/api/vcrm/agente/contatos/:id', ...A, h((req, res) => {
    const t = tenant(); const c = appRepo.Contatos.obter(t.id, req.params.id);
    if (!c) throw naoAchou();
    const pa = (req.body || {}).proximaAcao;
    if (!pa) return res.status(400).json({ erro: 'Só proximaAcao pode ser alterada por aqui.' });
    trocarProximaAcao(t, c, pa, 'automacao');
    res.json({ ok: true });
  }));

  app.post('/staff/api/vcrm/agente/contatos/:id/atividade', ...A, h((req, res) => {
    const t = tenant(); const c = appRepo.Contatos.obter(t.id, req.params.id);
    if (!c) throw naoAchou();
    const d = req.body || {};
    const a = imp.normAtividade({ tipo: d.tipo, texto: d.texto, canal: d.canal, autor: 'automacao', data: new Date().toISOString() });
    appRepo.Atividades.registrar(t.id, { contato_id: c.id, tipo: a.tipo, canal: a.canal, texto: a.texto, autor: a.autor });
    res.json({ ok: true });
  }));

  // Caixa de entrada: "não atendida" = mensagem recebida SEM resposta registrada depois dela
  // (mensagem-enviada ou o marcador de "atendida"). Mais antiga primeiro: responder na ordem de chegada.
  const MARCADOR = '[inbox atendida]';
  app.get('/staff/api/vcrm/agente/inbox', ...A, h((req, res) => {
    const t = tenant(); const ctx = imp.contexto(t);
    const horas = Math.min(Math.max(parseInt(req.query.horas, 10) || 72, 1), 24 * 365);
    const todas = req.query.todas === '1';
    const corte = new Date(Date.now() - horas * 3600 * 1000).toISOString();
    const rows = db.prepare(`SELECT a.contato_id, a.texto, a.canal, a.data,
        (SELECT MAX(r.data) FROM crm_atividades r WHERE r.tenant_id = a.tenant_id AND r.contato_id = a.contato_id
           AND (r.tipo = 'mensagem-enviada' OR (r.tipo = 'nota' AND r.texto = ?))) AS respondida_ate
      FROM crm_atividades a WHERE a.tenant_id = ? AND a.tipo = 'mensagem-recebida' AND a.data >= ? ORDER BY a.data`).all(MARCADOR, t.id, corte);
    const mensagens = [];
    for (const r of rows) {
      const atendida = !!r.respondida_ate && r.respondida_ate >= r.data;
      if (atendida && !todas) continue;
      const c = appRepo.Contatos.obter(t.id, r.contato_id); if (!c) continue;
      mensagens.push({ contatoId: c.id, nome: c.nome, telefone: c.telefone, estagio: estagioLegado(ctx, c), texto: r.texto, canal: r.canal, em: r.data, atendida });
    }
    res.json({ mensagens, total: mensagens.length });
  }));

  app.post('/staff/api/vcrm/agente/inbox/:id/atendida', ...A, h((req, res) => {
    const t = tenant(); const c = appRepo.Contatos.obter(t.id, req.params.id);
    if (!c) throw naoAchou();
    const d = req.body || {};
    // o marcador e a resposta ganham datas distintas e posteriores a qualquer mensagem já recebida
    if (d.resposta) {
      const a = imp.normAtividade({ tipo: 'mensagem-enviada', texto: d.resposta, canal: d.canal || 'whatsapp', autor: 'automacao', data: new Date().toISOString() });
      appRepo.Atividades.registrar(t.id, { contato_id: c.id, tipo: a.tipo, canal: a.canal, texto: a.texto, autor: a.autor });
    } else {
      appRepo.Atividades.registrar(t.id, { contato_id: c.id, tipo: 'nota', texto: MARCADOR, autor: 'automacao' });
    }
    trocarProximaAcao(t, c, d.proximaAcao || {}, 'automacao');
    res.json({ ok: true });
  }));
}

module.exports = { registrarRotasAgente };
