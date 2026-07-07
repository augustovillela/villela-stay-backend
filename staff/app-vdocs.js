'use strict';
// ============================================================================
// Portal Staff — módulo: Villela Docs Intelligence (administração da PLATAFORMA).
// Aqui o Augusto gerencia o SaaS: empresas clientes (tenants), planos, leads
// e auditoria da plataforma. O produto em si roda em /vdocs (painel próprio
// de cada empresa cliente). Mesmo padrão de sub-app da Livraria/Legal.
// ============================================================================

const VD = {
  tab: 'visao',
  api(m, c, b) { return api(m, '/vdocs' + c, b); },
  brl(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); },
  dt(s) { return s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'; },
  chip(t) { return `<span class="chip">${esc(String(t || '—'))}</span>`; },

  abrir(tab) { if (tab) VD.tab = tab; VD.render(); },
  render() {
    const abas = [['visao', '📊 Visão'], ['tenants', '🏢 Empresas'], ['planos', '📦 Planos'], ['leads', '📥 Leads'], ['auditoria', '📜 Auditoria']]
      .map(([id, rot]) => `<button class="btn ${VD.tab === id ? '' : 'secund'} peq" onclick="VD.ir('${id}')">${rot}</button>`).join(' ');
    conteudo().innerHTML = cabecalho('🗂️ Villela Docs Intelligence', 'Administração da plataforma SaaS de gestão documental. Produto: <a href="/vdocs" target="_blank">/vdocs</a> · painel do cliente: <a href="/vdocs/app" target="_blank">/vdocs/app</a>.')
      + `<div class="card" style="display:flex;flex-wrap:wrap;gap:.4rem">${abas}</div><div id="vd-body"><p class="sub">Carregando…</p></div>`;
    VD.pintar();
  },
  ir(tab) { VD.tab = tab; VD.render(); },
  body() { return document.getElementById('vd-body'); },
  async pintar() {
    try {
      const v = { visao: VD.vVisao, tenants: VD.vTenants, planos: VD.vPlanos, leads: VD.vLeads, auditoria: VD.vAuditoria }[VD.tab];
      if (v) await v();
    } catch (e) { VD.body().innerHTML = `<div class="card">Erro: ${esc(e.message)}</div>`; }
  },

  async vVisao() {
    const r = await VD.api('GET', '/resumo');
    const kpi = (rot, val) => `<div class="card" style="min-width:150px;flex:1"><div class="sub">${rot}</div><div style="font-size:1.5rem;font-weight:700">${val}</div></div>`;
    const st = r.tenants_por_status || {};
    VD.body().innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
      ${kpi('Empresas', r.tenants_total)}${kpi('Em trial', st.trial || 0)}${kpi('Ativas', st.ativa || 0)}
      ${kpi('Suspensas', st.suspensa || 0)}${kpi('MRR', VD.brl(r.mrr_centavos))}
      ${kpi('Usuários', r.usuarios_total)}${kpi('Leads novos', r.leads_novos)}</div>
      <div class="aviso">🧭 Fase 1 (fundação SaaS). Documentos, OCR, busca, IA e workflows chegam nas próximas fases — ver <code>backend/vdocs/README.md</code>.</div>`;
  },

  async vTenants() {
    const { tenants } = await VD.api('GET', '/tenants');
    VD.body().innerHTML = `<div class="card"><table class="tabela"><tr><th>Empresa</th><th>Slug</th><th>Status</th><th>Plano</th><th>Usuários</th><th>Trial até</th><th>Criada</th><th></th></tr>
      ${tenants.map(t => `<tr><td><b>${esc(t.nome)}</b><br><span class="sub">${esc(t.email_contato)}</span></td>
        <td>${esc(t.slug)}</td><td>${VD.chip(t.status)}</td><td>${esc(t.plano || '—')}</td><td>${t.usuarios}</td>
        <td>${t.trial_expira_em ? VD.dt(t.trial_expira_em) : '—'}</td><td>${VD.dt(t.criado_em)}</td>
        <td><button class="btn secund peq" onclick="VD.detalhe('${t.id}')">Detalhe</button></td></tr>`).join('')}</table></div>
      <div id="vd-det"></div>`;
  },
  async detalhe(id) {
    const d = await VD.api('GET', '/tenants/' + id);
    const t = d.tenant;
    const acao = (rot, status, cls) => `<button class="btn ${cls || 'secund'} peq" onclick="VD.mudarStatus('${t.id}','${status}')">${rot}</button>`;
    document.getElementById('vd-det').innerHTML = `<div class="card"><h3 style="margin-top:0">${esc(t.nome)} ${VD.chip(t.status)}</h3>
      <p class="sub">Plano: <b>${esc(d.plano ? d.plano.nome : '—')}</b> · uso do mês: ${Object.entries(d.uso).map(([k, v]) => `${esc(k)}=${v}`).join(' · ')}</p>
      <p>${t.status === 'suspensa' ? acao('▶ Reativar', 'ativa') : acao('⏸ Suspender', 'suspensa', 'alerta')} ${acao('✖ Cancelar', 'cancelada', 'alerta')}
      Plano: <select id="vd-plano"><option value="">— trocar —</option>${['starter', 'professional', 'business', 'enterprise'].map(p => `<option value="${p}">${p}</option>`).join('')}</select>
      <button class="btn peq" onclick="VD.mudarPlano('${t.id}')">Aplicar</button></p>
      <b>Usuários</b><table class="tabela"><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th></tr>
      ${d.usuarios.map(u => `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td><td>${esc(u.papel)}</td><td>${esc(u.status)}</td></tr>`).join('')}</table>
      <b>Auditoria recente da empresa</b><table class="tabela"><tr><th>Quando</th><th>Quem</th><th>Ação</th></tr>
      ${d.auditoria.slice(0, 15).map(a => `<tr><td>${VD.dt(a.criado_em)}</td><td>${esc(a.usuario_nome)}</td><td>${esc(a.acao)}</td></tr>`).join('')}</table></div>`;
  },
  async mudarStatus(id, status) {
    if (!confirm(`Confirmar mudança de status para "${status}"? A empresa ${status === 'suspensa' || status === 'cancelada' ? 'PERDERÁ o acesso' : 'voltará a acessar'}.`)) return;
    await VD.api('PATCH', '/tenants/' + id, { status });
    VD.vTenants();
  },
  async mudarPlano(id) {
    const p = document.getElementById('vd-plano').value;
    if (!p || !confirm(`Trocar o plano para "${p}"?`)) return;
    await VD.api('PATCH', '/tenants/' + id, { plano_slug: p });
    VD.detalhe(id);
  },

  async vPlanos() {
    const { planos } = await VD.api('GET', '/planos');
    VD.body().innerHTML = `<div class="card"><table class="tabela"><tr><th>Plano</th><th>Preço/mês</th><th>Limites</th><th>Ativo</th><th></th></tr>
      ${planos.map(p => `<tr><td><b>${esc(p.nome)}</b><br><span class="sub">${esc(p.descricao)}</span></td>
        <td><input id="vd-preco-${p.id}" type="number" value="${p.preco_centavos}" style="width:90px"> ¢</td>
        <td style="font-size:.8rem">${Object.entries(p.limites).map(([k, v]) => `${esc(k)}=${esc(String(v))}`).join(' · ')}</td>
        <td>${p.ativo ? '✅' : '⛔'}</td>
        <td><button class="btn secund peq" onclick="VD.salvarPlano('${p.id}')">Salvar preço</button></td></tr>`).join('')}</table>
      <p class="sub">Limites detalhados são editados via API (<code>PATCH /staff/api/vdocs/planos/:id</code>) para evitar erro de digitação — ver README do módulo.</p></div>`;
  },
  async salvarPlano(id) {
    await VD.api('PATCH', '/planos/' + id, { preco_centavos: Number(document.getElementById('vd-preco-' + id).value) });
    VD.vPlanos();
  },

  async vLeads() {
    const { leads } = await VD.api('GET', '/leads');
    const sel = (l) => `<select onchange="VD.leadStatus('${l.id}',this.value)">${['novo', 'contactado', 'convertido', 'descartado'].map(s => `<option${s === l.status ? ' selected' : ''}>${s}</option>`).join('')}</select>`;
    VD.body().innerHTML = `<div class="card"><table class="tabela"><tr><th>Quando</th><th>Nome</th><th>E-mail</th><th>Empresa</th><th>Telefone</th><th>Mensagem</th><th>Status</th></tr>
      ${leads.map(l => `<tr><td>${VD.dt(l.criado_em)}</td><td>${esc(l.nome)}</td><td>${esc(l.email)}</td><td>${esc(l.empresa)}</td><td>${esc(l.telefone)}</td><td style="max-width:260px">${esc(l.mensagem)}</td><td>${sel(l)}</td></tr>`).join('')}</table>
      ${leads.length ? '' : '<p class="sub">Nenhum lead ainda — eles chegam pelo formulário da landing /vdocs.</p>'}</div>`;
  },
  async leadStatus(id, status) { await VD.api('PATCH', '/leads/' + id, { status }); },

  async vAuditoria() {
    const { eventos } = await VD.api('GET', '/auditoria');
    VD.body().innerHTML = `<div class="card"><p class="sub">Eventos da PLATAFORMA (ações do staff sobre o SaaS). A auditoria de cada empresa fica no detalhe da empresa.</p>
      <table class="tabela"><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Entidade</th></tr>
      ${eventos.map(a => `<tr><td>${VD.dt(a.criado_em)}</td><td>${esc(a.usuario_nome)}</td><td>${esc(a.acao)}</td><td>${esc(a.entidade)} ${a.entidade_id ? VD.chip(a.entidade_id) : ''}</td></tr>`).join('')}</table></div>`;
  },
};

function renderVdocs() { VD.abrir(); }
