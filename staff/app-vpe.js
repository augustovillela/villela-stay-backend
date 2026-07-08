'use strict';
// ============================================================================
// Portal Staff — módulo: Villela Projects & Events (administração da PLATAFORMA).
// Aqui o Augusto gerencia o SaaS (tenants, planos, leads) e o botão de seed do
// workspace interno com os 16 projetos. O produto roda em /vpe.
// ============================================================================

const VP = {
  tab: 'visao',
  api(m, c, b) { return api(m, '/vpe' + c, b); },
  brl(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); },
  dt(s) { return s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'; },
  chip(t) { return `<span class="chip">${esc(String(t || '—'))}</span>`; },

  abrir(tab) { if (tab) VP.tab = tab; VP.render(); },
  render() {
    const abas = [['visao', '📊 Visão'], ['tenants', '🏢 Empresas'], ['planos', '📦 Planos'], ['leads', '📥 Leads'], ['auditoria', '📜 Auditoria']]
      .map(([id, rot]) => `<button class="btn ${VP.tab === id ? '' : 'secund'} peq" onclick="VP.ir('${id}')">${rot}</button>`).join(' ');
    conteudo().innerHTML = cabecalho('📋 Villela Projects & Events', 'Administração da plataforma de gestão de projetos e eventos. Produto: <a href="/vpe" target="_blank">/vpe</a> · painel: <a href="/vpe/app" target="_blank">/vpe/app</a>.')
      + `<div class="card" style="display:flex;flex-wrap:wrap;gap:.4rem">${abas}</div><div id="vp-body"><p class="sub">Carregando…</p></div>`;
    VP.pintar();
  },
  ir(tab) { VP.tab = tab; VP.render(); },
  body() { return document.getElementById('vp-body'); },
  async pintar() {
    try {
      const v = { visao: VP.vVisao, tenants: VP.vTenants, planos: VP.vPlanos, leads: VP.vLeads, auditoria: VP.vAuditoria }[VP.tab];
      if (v) await v();
    } catch (e) { VP.body().innerHTML = `<div class="card">Erro: ${esc(e.message)}</div>`; }
  },

  async vVisao() {
    const r = await VP.api('GET', '/resumo');
    const st = r.tenants_por_status || {};
    const kpi = (rot, val) => `<div class="card" style="min-width:150px;flex:1"><div class="sub">${rot}</div><div style="font-size:1.5rem;font-weight:700">${val}</div></div>`;
    VP.body().innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
      ${kpi('Empresas', r.tenants_total)}${kpi('Em trial', st.trial || 0)}${kpi('Ativas', st.ativa || 0)}
      ${kpi('MRR', VP.brl(r.mrr_centavos))}${kpi('Projetos', r.projetos_total)}${kpi('Leads novos', r.leads_novos)}</div>
      <div class="card"><b>🏠 Workspace interno Villela</b>
      <p class="sub">Cria (ou completa) o workspace interno com os 16 projetos da Villela. Idempotente — pode clicar de novo sem duplicar. A senha inicial do dono aparece UMA vez.</p>
      <button class="btn peq" onclick="VP.semearInterno()">Semear workspace interno (16 projetos)</button>
      <div id="vp-seed-out" style="margin-top:.5rem;font-size:.85rem"></div></div>
      <div class="aviso">🧭 Fase 1 (fundação SaaS + portfólio). Tarefas/Kanban, eventos, CRM, financeiro e IA chegam nas próximas fases — ver <code>backend/vpe/README.md</code>.</div>`;
  },
  async semearInterno() {
    if (!confirm('Semear o workspace interno da Villela com os 16 projetos?')) return;
    try {
      const r = await VP.api('POST', '/semear-interno', {});
      document.getElementById('vp-seed-out').innerHTML = `✅ ${r.projetos_criados} projeto(s) criado(s) (total ${r.projetos_total}). `
        + (r.senha_inicial ? `<b>Senha inicial do dono (${'augusto.villela@gmail.com'}) — copie AGORA:</b> <code>${esc(r.senha_inicial)}</code> · <a href="/vpe/login" target="_blank">entrar no painel</a>` : 'Workspace já existia — use sua senha atual.');
    } catch (e) { document.getElementById('vp-seed-out').innerHTML = `<span style="color:var(--alerta)">${esc(e.message)}</span>`; }
  },

  async vTenants() {
    const { tenants } = await VP.api('GET', '/tenants');
    VP.body().innerHTML = `<div class="card"><table class="tabela"><tr><th>Empresa</th><th>Slug</th><th>Status</th><th>Plano</th><th>Usuários</th><th>Projetos</th><th>Criada</th><th></th></tr>
      ${tenants.map(t => `<tr><td><b>${esc(t.nome)}</b>${t.interno ? ' 🏠' : ''}<br><span class="sub">${esc(t.email_contato)}</span></td>
        <td>${esc(t.slug)}</td><td>${VP.chip(t.status)}</td><td>${esc(t.plano || '—')}</td><td>${t.usuarios}</td><td>${t.projetos}</td>
        <td>${VP.dt(t.criado_em)}</td><td><button class="btn secund peq" onclick="VP.detalhe('${t.id}')">Detalhe</button></td></tr>`).join('')}</table></div>
      <div id="vp-det"></div>`;
  },
  async detalhe(id) {
    const d = await VP.api('GET', '/tenants/' + id);
    const t = d.tenant;
    const acao = (rot, status, cls) => `<button class="btn ${cls || 'secund'} peq" onclick="VP.mudarStatus('${t.id}','${status}')">${rot}</button>`;
    document.getElementById('vp-det').innerHTML = `<div class="card"><h3 style="margin-top:0">${esc(t.nome)} ${VP.chip(t.status)}${t.interno ? ' 🏠 interno' : ''}</h3>
      <p class="sub">Plano: <b>${esc(d.plano ? d.plano.nome : '—')}</b> · projetos: ${d.projetos} · uso: ${Object.entries(d.uso).map(([k, v]) => `${esc(k)}=${v}`).join(' · ')}</p>
      ${t.interno ? '<p class="sub">Workspace interno — não pode ser suspenso.</p>' : `<p>${t.status === 'suspensa' ? acao('▶ Reativar', 'ativa') : acao('⏸ Suspender', 'suspensa', 'alerta')}
      Plano: <select id="vp-plano"><option value="">— trocar —</option>${['starter', 'professional', 'business', 'enterprise'].map(p => `<option value="${p}">${p}</option>`).join('')}</select>
      <button class="btn peq" onclick="VP.mudarPlano('${t.id}')">Aplicar</button></p>`}
      <b>Usuários</b><table class="tabela"><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th></tr>
      ${d.usuarios.map(u => `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td><td>${esc(u.papel)}</td><td>${esc(u.status)}</td></tr>`).join('')}</table></div>`;
  },
  async mudarStatus(id, status) {
    if (!confirm(`Mudar status para "${status}"?`)) return;
    await VP.api('PATCH', '/tenants/' + id, { status });
    VP.vTenants();
  },
  async mudarPlano(id) {
    const p = document.getElementById('vp-plano').value;
    if (!p || !confirm(`Trocar o plano para "${p}"?`)) return;
    await VP.api('PATCH', '/tenants/' + id, { plano_slug: p });
    VP.detalhe(id);
  },

  async vPlanos() {
    const { planos } = await VP.api('GET', '/planos');
    VP.body().innerHTML = `<div class="card"><table class="tabela"><tr><th>Plano</th><th>Preço/mês</th><th>Limites</th><th>Ativo</th><th></th></tr>
      ${planos.map(p => `<tr><td><b>${esc(p.nome)}</b><br><span class="sub">${esc(p.descricao)}</span></td>
        <td><input id="vp-preco-${p.id}" type="number" value="${p.preco_centavos}" style="width:90px"> ¢</td>
        <td style="font-size:.8rem">${Object.entries(p.limites).map(([k, v]) => `${esc(k)}=${esc(String(v))}`).join(' · ')}</td>
        <td>${p.ativo ? '✅' : '⛔'}</td>
        <td><button class="btn secund peq" onclick="VP.salvarPlano('${p.id}')">Salvar preço</button></td></tr>`).join('')}</table></div>`;
  },
  async salvarPlano(id) {
    await VP.api('PATCH', '/planos/' + id, { preco_centavos: Number(document.getElementById('vp-preco-' + id).value) });
    VP.vPlanos();
  },

  async vLeads() {
    const { leads } = await VP.api('GET', '/leads');
    const sel = (l) => `<select onchange="VP.leadStatus('${l.id}',this.value)">${['novo', 'contactado', 'convertido', 'descartado'].map(s => `<option${s === l.status ? ' selected' : ''}>${s}</option>`).join('')}</select>`;
    VP.body().innerHTML = `<div class="card"><table class="tabela"><tr><th>Quando</th><th>Nome</th><th>E-mail</th><th>Empresa</th><th>Mensagem</th><th>Status</th></tr>
      ${leads.map(l => `<tr><td>${VP.dt(l.criado_em)}</td><td>${esc(l.nome)}</td><td>${esc(l.email)}</td><td>${esc(l.empresa)}</td><td style="max-width:260px">${esc(l.mensagem)}</td><td>${sel(l)}</td></tr>`).join('') || '<tr><td colspan="6" class="sub">Nenhum lead ainda.</td></tr>'}</table></div>`;
  },
  async leadStatus(id, status) { await VP.api('PATCH', '/leads/' + id, { status }); },

  async vAuditoria() {
    const { eventos } = await VP.api('GET', '/auditoria');
    VP.body().innerHTML = `<div class="card"><p class="sub">Eventos da PLATAFORMA. A auditoria de cada empresa fica no detalhe dela.</p>
      <table class="tabela"><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Entidade</th></tr>
      ${eventos.map(a => `<tr><td>${VP.dt(a.criado_em)}</td><td>${esc(a.usuario_nome)}</td><td>${esc(a.acao)}</td><td>${esc(a.entidade)} ${a.entidade_id ? VP.chip(a.entidade_id) : ''}</td></tr>`).join('')}</table></div>`;
  },
};

function renderVpe() { VP.abrir(); }
