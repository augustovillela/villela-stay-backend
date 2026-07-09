'use strict';
// ============================================================================
// Portal Staff — módulo: app-vcrm (Villela CRM, o SaaS de CRM)
// Administração da PLATAFORMA: tenants, planos, leads, tickets, importação do
// CRM legado. O CRM de uso (kanban etc.) fica no painel do assinante /crm/app.
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================
const vcrmBrl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

async function renderVcrm() {
  conteudo().innerHTML = cabecalho('🤝 Villela CRM — plataforma', 'Administração do SaaS de CRM: empresas assinantes, planos, leads e suporte. O painel de uso é /crm/app.')
    + `<div class="barra">
        <a class="btn secund" href="/crm" target="_blank" rel="noopener">🌐 Landing /crm</a>
        <a class="btn secund" href="/crm/app" target="_blank" rel="noopener">🖥️ Painel do assinante</a>
        <button class="btn secund" id="vc-importar">⬆ Importar CRM legado → tenant villela-stay</button>
       </div>
       <div id="vc-cards" class="cards"></div>
       <div id="vc-corpo"><p class="vazio">Carregando…</p></div>`;
  $('#vc-importar').onclick = async () => {
    if (!confirm('Importar contatos.json (CRM legado do staff) para o tenant "villela-stay"? Duplicados são mesclados.')) return;
    try { const r = await api('POST', '/vcrm/importar-legado', { tenant_slug: 'villela-stay' }); alert(`✅ ${r.criados} criados, ${r.existentes} mesclados, ${r.oportunidades} oportunidade(s).`); vcrmCarregar(); }
    catch (e) { alert(e.message + (/(não existe)/.test(e.message) ? '\n\nCrie primeiro a empresa com slug villela-stay no formulário abaixo.' : '')); }
  };
  vcrmCarregar();
}

async function vcrmCarregar() {
  try {
    const [{ resumo }, { tenants }, { leads }, { tickets }] = await Promise.all([
      api('GET', '/vcrm/dashboard'), api('GET', '/vcrm/tenants'), api('GET', '/vcrm/leads'), api('GET', '/vcrm/tickets'),
    ]);
    const card = (n, rot) => `<div class="card"><div class="n">${n}</div><div class="rot">${esc(rot)}</div></div>`;
    $('#vc-cards').innerHTML = card(resumo.tenants_total, 'Empresas') + card(resumo.trials, 'Em trial') + card(resumo.ativos, 'Ativas')
      + card(resumo.inadimplentes + resumo.suspensos, 'Inadimpl./susp.') + card(esc(vcrmBrl(resumo.mrr_centavos)), 'MRR')
      + card(resumo.leads_novos, 'Leads novos') + card(resumo.tickets_abertos, 'Tickets abertos') + card(resumo.contatos_total, 'Contatos (todos os tenants)');

    const linhaT = (t) => `<tr>
      <td><b>${esc(t.nome)}</b><br><span class="obs">${esc(t.slug)} · ${esc(t.email_contato)}</span></td>
      <td><span class="badge ${t.status === 'ativa' ? 'st-feito' : t.status === 'trial' ? 'st-pendente' : 'st-erro'}">${esc(t.status)}</span></td>
      <td>${esc(t.plano_nome || '—')}</td>
      <td>
        <button class="btn peq secund vc-link" data-id="${esc(t.id)}">🔑 Link acesso</button>
        <select class="peq vc-status" data-id="${esc(t.id)}" style="width:auto">
          ${['', 'trial', 'ativa', 'inadimplente', 'suspensa', 'cancelada'].map(st => `<option value="${st}" ${st === '' ? 'selected' : ''}>${st || 'status…'}</option>`).join('')}
        </select>
        <select class="peq vc-plano" data-id="${esc(t.id)}" style="width:auto">
          <option value="">plano…</option>${['trial', 'starter', 'professional', 'business', 'enterprise'].map(p => `<option>${p}</option>`).join('')}
        </select>
      </td></tr>`;
    $('#vc-corpo').innerHTML = `
      <details class="cr-box"><summary class="cr-sum">➕ Nova empresa assinante</summary>
        <form class="form" id="vc-form" style="max-width:640px;margin-top:12px">
          <div class="hi-grid">
            <label>Nome * <input id="vc-nome" required></label>
            <label>E-mail do owner * <input id="vc-email" type="email" required></label>
            <label>Slug (opcional) <input id="vc-slug" placeholder="ex.: villela-stay"></label>
            <label>Plano <select id="vc-plan">${['trial', 'starter', 'professional', 'business', 'enterprise'].map(p => `<option>${p}</option>`).join('')}</select></label>
          </div>
          <button class="btn" type="submit">Criar empresa</button><p id="vc-msg" class="erro"></p>
        </form>
      </details>
      <h2 class="titulo" style="font-size:1.05rem">Empresas assinantes</h2>
      <table><thead><tr><th>Empresa</th><th>Status</th><th>Plano</th><th>Ações</th></tr></thead>
      <tbody>${tenants.map(linhaT).join('') || '<tr><td colspan="4">Nenhuma empresa ainda.</td></tr>'}</tbody></table>
      ${leads.length ? `<h2 class="titulo" style="font-size:1.05rem">Leads da landing</h2>
      <table><tbody>${leads.slice(0, 15).map(l => `<tr><td>${esc(l.nome)} · ${esc(l.empresa)}</td><td>${esc(l.email)} ${esc(l.telefone)}</td><td><span class="badge st-pendente">${esc(l.status)}</span></td></tr>`).join('')}</tbody></table>` : ''}
      ${tickets.length ? `<h2 class="titulo" style="font-size:1.05rem">Tickets</h2>
      <table><tbody>${tickets.slice(0, 15).map(tk => `<tr><td>${esc(tk.tenant_nome || '')}</td><td>${esc(tk.assunto)}</td><td><span class="badge ${['resolvido', 'fechado'].includes(tk.status) ? 'st-feito' : 'st-pendente'}">${esc(tk.status)}</span></td></tr>`).join('')}</tbody></table>` : ''}`;
    $('#vc-form').onsubmit = async (ev) => {
      ev.preventDefault(); $('#vc-msg').textContent = '';
      try {
        await api('POST', '/vcrm/tenants', { nome: $('#vc-nome').value.trim(), email: $('#vc-email').value.trim(), slug: $('#vc-slug').value.trim(), plano: $('#vc-plan').value });
        vcrmCarregar();
      } catch (e) { $('#vc-msg').textContent = e.message; }
    };
    document.querySelectorAll('.vc-link').forEach(b => b.onclick = async () => {
      try { const r = await api('POST', `/vcrm/tenants/${b.dataset.id}/link-acesso`); prompt('Link para o owner definir a senha (7 dias):', r.url); }
      catch (e) { alert(e.message); }
    });
    document.querySelectorAll('.vc-status').forEach(sel => sel.onchange = async () => {
      if (!sel.value) return;
      try { await api('POST', `/vcrm/tenants/${sel.dataset.id}/status`, { status: sel.value }); vcrmCarregar(); } catch (e) { alert(e.message); }
    });
    document.querySelectorAll('.vc-plano').forEach(sel => sel.onchange = async () => {
      if (!sel.value) return;
      try { await api('POST', `/vcrm/tenants/${sel.dataset.id}/plano`, { plano: sel.value }); vcrmCarregar(); } catch (e) { alert(e.message); }
    });
  } catch (e) { $('#vc-corpo').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
