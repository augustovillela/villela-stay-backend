'use strict';
// ============================================================================
// Portal Staff — Villela Legal SaaS (administração da plataforma comercial).
// Painel do negócio: escritórios (tenants), planos, cobrança, tickets, custo
// por cliente, feature flags, leads e logs. Só admin. Reaproveita helpers
// globais (api, esc, conteudo, cabecalho, tabela). API: /staff/api/legal-saas/*.
// ============================================================================

const LS = {
  tab: 'painel', modulos: [], limites: [], flags: [],
  api(m, c, b) { return api(m, '/legal-saas' + c, b); },
  brl(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); },
  dt(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—'; },
  chip(t) { return `<span class="chip">${esc(String(t || '—').replace(/_/g, ' '))}</span>`; },

  async abrir() { LS.render(); },
  abas() {
    return [['painel', '📊 Painel'], ['tenants', '🏢 Escritórios'], ['planos', '💳 Planos'],
      ['custo', '💰 Custo/cliente'], ['tickets', '🎧 Suporte'], ['leads', '📩 Leads'], ['logs', '📜 Logs']];
  },
  render() {
    const abas = LS.abas().map(([id, r]) => `<button class="btn ${LS.tab === id ? '' : 'secund'} peq" onclick="LS.ir('${id}')">${r}</button>`).join(' ');
    conteudo().innerHTML = cabecalho('⚖️💼 Villela Legal SaaS', 'Plataforma comercial — venda do Villela Legal a outros escritórios. Landing pública em /juridico.')
      + `<div class="card" style="display:flex;flex-wrap:wrap;gap:.4rem">${abas}</div><div id="ls-body"><p class="sub">Carregando…</p></div>`;
    LS.pintar();
  },
  ir(t) { LS.tab = t; LS.render(); },
  body() { return document.getElementById('ls-body'); },
  async pintar() {
    try { await ({ painel: LS.vPainel, tenants: LS.vTenants, planos: LS.vPlanos, custo: LS.vCusto, tickets: LS.vTickets, leads: LS.vLeads, logs: LS.vLogs }[LS.tab])(); }
    catch (e) { LS.body().innerHTML = `<div class="card">Erro: ${esc(e.message)}</div>`; }
  },

  // -------------------------------------------------------- PAINEL
  async vPainel() {
    const { resumo: r, catalogo } = await LS.api('GET', '/dashboard');
    LS.modulos = catalogo.modulos; LS.limites = catalogo.limites; LS.flags = catalogo.flags;
    const kpi = (rot, val, alerta) => `<div class="card" style="min-width:150px;flex:1${alerta && val ? ';border-color:var(--alerta)' : ''}"><div class="sub">${rot}</div><div style="font-size:1.5rem;font-weight:700">${val}</div></div>`;
    let h = `<div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
      ${kpi('MRR', LS.brl(r.mrr_centavos))}${kpi('ARR', LS.brl(r.arr_centavos))}${kpi('Custo do mês', LS.brl(r.custo_mes_centavos))}
      ${kpi('Escritórios', r.tenants_total)}${kpi('Ativos', r.ativos)}${kpi('Em trial', r.trials)}
      ${kpi('Inadimplentes', r.inadimplentes, true)}${kpi('Suspensos/cancelados', r.suspensos)}
      ${kpi('Trials expirando 7d', r.trials_expirando_7d, true)}${kpi('Tickets abertos', r.tickets_abertos, true)}${kpi('Leads novos', r.leads_novos, true)}</div>
      <div class="card"><h3>Por plano</h3>${tabela(['Plano', 'Escritórios ativos/trial'], r.por_plano.map(p => [esc(p.nome), p.qtd]))}</div>
      <div class="card"><h3>🚩 Feature flags (catálogo global)</h3>${tabela(['Chave', 'Nome', 'Padrão'], LS.flags.map(f => [LS.chip(f.chave), esc(f.nome), f.padrao ? 'ligada' : 'desligada']))}
      <p class="sub">Flags valem por PLANO (aba Planos) e podem ter override por escritório (detalhe do escritório).</p></div>`;
    LS.body().innerHTML = h;
  },

  // -------------------------------------------------------- ESCRITÓRIOS (TENANTS)
  async vTenants() {
    const { tenants } = await LS.api('GET', '/tenants');
    let h = `<details class="cr-box"><summary class="cr-sum">➕ Novo escritório</summary>
      <form class="form" id="ls-tn-form" style="max-width:660px;margin-top:12px">
        <label>Nome do escritório * <input id="lst-nome" required maxlength="200"></label>
        <div class="hi-grid">
          <label>E-mail de acesso * <input id="lst-email" type="email" required></label>
          <label>CNPJ <input id="lst-cnpj" maxlength="20"></label>
          <label>OAB seccional <input id="lst-oab" maxlength="20" placeholder="OAB/DF"></label>
          <label>Plano <select id="lst-plano">${LS.planosOptions()}</select></label>
        </div>
        <button class="btn" type="submit">Criar</button><p id="lst-msg" class="erro"></p></form></details>`;
    h += `<div class="card">${tenants.length ? tabela(['Escritório', 'Plano', 'Status', 'Criado', ''], tenants.map(t => [
      esc(t.nome), esc(t.plano_nome || '—'), LS.chip(t.status), LS.dt(t.criado_em),
      `<button class="btn secund peq" onclick="LS.verTenant('${t.id}')">Abrir</button>`,
    ])) : '<p class="vazio">Nenhum escritório ainda.</p>'}</div>`;
    LS.body().innerHTML = h;
    const f = document.getElementById('ls-tn-form');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault(); const msg = document.getElementById('lst-msg'); msg.textContent = '';
      try {
        const r = await LS.api('POST', '/tenants', { nome: document.getElementById('lst-nome').value, email: document.getElementById('lst-email').value, cnpj: document.getElementById('lst-cnpj').value, oab_secional: document.getElementById('lst-oab').value, plano: document.getElementById('lst-plano').value });
        LS.verTenant(r.tenant.id);
      } catch (e) { msg.textContent = e.message; }
    };
  },
  planosOptions(sel) {
    return (LS._planos || []).map(p => `<option value="${p.slug}"${p.slug === sel ? ' selected' : ''}>${esc(p.nome)}${p.preco_centavos ? ' (' + LS.brl(p.preco_centavos) + ')' : ''}</option>`).join('');
  },
  async verTenant(id) {
    if (!LS._planos) { const { planos } = await LS.api('GET', '/planos'); LS._planos = planos; }
    const { tenant: t } = await LS.api('GET', '/tenants/' + id);
    const ent = t.entitlements;
    const usoLin = (LS.limites || []).map(([k, rot]) => `<div class="lin">${esc(rot)}: <b>${t.uso[k] || 0}</b> / ${(ent.limites[k] || 0) === 0 ? 'ilimitado' : ent.limites[k]}</div>`).join('');
    LS.body().innerHTML = `<div class="card"><button class="btn secund peq" onclick="LS.vTenants()">← Voltar</button>
      <h3 style="margin:.6rem 0 0">${esc(t.nome)} ${LS.chip(t.status)} ${LS.chip(ent.plano || '—')}</h3>
      <p class="sub">${esc(t.email_contato)} · ${esc(t.cnpj || '')} · ${esc(t.oab_secional || '')} · criado ${LS.dt(t.criado_em)}${t.trial_expira_em ? ' · trial até ' + LS.dt(t.trial_expira_em) : ''}</p>
      <p>
        <label>Plano: <select id="ls-plano-sel">${LS.planosOptions(ent.plano)}</select></label>
        <button class="btn peq" onclick="LS.trocarPlano('${id}')">Aplicar plano</button>
        <button class="btn secund peq" onclick="LS.statusTenant('${id}','ativa')">Ativar</button>
        <button class="btn secund peq" onclick="LS.statusTenant('${id}','suspensa')">Suspender</button>
        <button class="btn secund peq" onclick="LS.statusTenant('${id}','cancelada')">Cancelar</button>
        <button class="btn secund peq" onclick="LS.marcarPago('${id}')">💵 Marcar pago</button>
        <button class="btn secund peq" onclick="LS.linkAcesso('${id}')">🔑 Link de acesso</button>
      </p><p id="ls-tn-msg" class="sub"></p></div>
      <div class="card"><h3>Uso do mês</h3>${usoLin || '<p class="vazio">—</p>'}
        <h3 style="margin-top:12px">Módulos liberados</h3><p>${ent.modulos.map(m => LS.chip(m)).join(' ') || '—'}</p>
        <h3 style="margin-top:12px">Flags</h3><p>${Object.keys(ent.flags).map(k => `${LS.chip(k)} ${ent.flags[k] ? '✅' : '⛔'}`).join(' ') || '—'}</p></div>
      <div class="card"><h3>💰 Custo do mês</h3>${t.custo.length ? tabela(['Categoria', 'Custo'], t.custo.map(c => [LS.chip(c.categoria), LS.brl(c.total)])) : '<p class="vazio">Sem custos lançados.</p>'}
        <p class="sub">Total: <b>${LS.brl(t.custo_total)}</b> · receita do plano: <b>${LS.brl(t.plano ? t.plano.preco_centavos : 0)}</b></p>
        <form class="form" id="ls-custo-form" style="max-width:520px"><div class="hi-grid">
          <label>Categoria <select id="lsc-cat"><option>ia</option><option>armazenamento</option><option>infra</option><option>suporte</option><option>outro</option></select></label>
          <label>Custo (R$) <input id="lsc-val" type="number" step="0.01"></label></div>
          <label>Detalhe <input id="lsc-det" maxlength="200"></label>
          <button class="btn peq" type="submit">Lançar custo</button></form></div>
      <div class="card"><h3>⚙️ Overrides negociados (Enterprise etc.)</h3>
        <p class="sub">JSON opcional que sobrepõe o plano. Ex. limites: <code>{"processos_ativos":5000}</code></p>
        <label>Limites (JSON) <input id="ls-ov-lim" placeholder='{}' value='${esc(JSON.stringify((t.settings && JSON.parse(t.settings.limites_over || "{}")) || {}))}'></label>
        <label>Flags (JSON) <input id="ls-ov-fl" placeholder='{}' value='${esc(JSON.stringify((t.settings && JSON.parse(t.settings.flags_over || "{}")) || {}))}'></label>
        <button class="btn peq" onclick="LS.salvarOverride('${id}')">Salvar overrides</button></div>
      <div class="card"><h3>Usuários</h3>${tabela(['Nome', 'E-mail', 'Papel', 'Últ. acesso'], t.usuarios.map(u => [esc(u.nome || '—'), esc(u.email), LS.chip(u.papel), LS.dt(u.ultimo_login)]))}</div>`;
    document.getElementById('ls-custo-form').onsubmit = async (ev) => {
      ev.preventDefault();
      await LS.api('POST', `/tenants/${id}/custo`, { categoria: document.getElementById('lsc-cat').value, custo_centavos: Math.round(Number(document.getElementById('lsc-val').value || 0) * 100), detalhe: document.getElementById('lsc-det').value });
      LS.verTenant(id);
    };
  },
  async trocarPlano(id) {
    const slug = document.getElementById('ls-plano-sel').value;
    try { const r = await LS.api('POST', `/tenants/${id}/plano`, { plano: slug }); document.getElementById('ls-tn-msg').textContent = `${r.tipo} aplicado.` + (r.exige_reassinar ? ' ⚠️ Assinatura MP ativa: o escritório precisa reassinar para a nova cobrança.' : ''); setTimeout(() => LS.verTenant(id), 1400); } catch (e) { alert(e.message); }
  },
  async statusTenant(id, st) {
    if (!confirm(`Mudar status para "${st}"?`)) return;
    try { await LS.api('POST', `/tenants/${id}/status`, { status: st }); LS.verTenant(id); } catch (e) { alert(e.message); }
  },
  async marcarPago(id) {
    try { await LS.api('POST', `/tenants/${id}/marcar-pago`); LS.verTenant(id); } catch (e) { alert(e.message); }
  },
  async salvarOverride(id) {
    try {
      const lim = JSON.parse(document.getElementById('ls-ov-lim').value || '{}');
      const fl = JSON.parse(document.getElementById('ls-ov-fl').value || '{}');
      await LS.api('POST', `/tenants/${id}/settings`, { limites_over: lim, flags_over: fl });
      LS.verTenant(id);
    } catch (e) { alert('JSON inválido ou erro: ' + e.message); }
  },
  async linkAcesso(id) {
    try {
      const r = await LS.api('POST', `/tenants/${id}/link-acesso`);
      const m = document.getElementById('ls-tn-msg');
      m.innerHTML = `🔗 Link p/ ${esc(r.email)} definir a senha (validade ${esc(r.validade)}):<br><b>${esc(r.url)}</b>`;
      try { await navigator.clipboard.writeText(r.url); m.innerHTML += '<br>✅ copiado'; } catch (_) {}
    } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- PLANOS
  async vPlanos() {
    const { planos, modulos, limites } = await LS.api('GET', '/planos');
    LS._planos = planos; LS.modulos = modulos; LS.limites = limites;
    let h = '<div class="aviso">Preços e limites são editáveis — são os números comerciais do produto. Módulos e flags controlam a entrega.</div>';
    for (const p of planos) {
      h += `<div class="card"><h3>${esc(p.nome)} <span class="tag">${esc(p.slug)}</span> ${p.ativo ? '' : '<span class="chip">inativo</span>'}</h3>
        <form class="form" onsubmit="return LS.salvarPlano(event,'${p.id}')">
          <div class="hi-grid">
            <label>Nome <input name="nome" value="${esc(p.nome)}"></label>
            <label>Preço/mês (R$) <input name="preco" type="number" step="0.01" value="${(p.preco_centavos / 100).toFixed(2)}"></label>
          </div>
          <label>Descrição <input name="descricao" value="${esc(p.descricao)}"></label>
          <div class="hi-grid">${limites.map(([k, rot]) => `<label>${esc(rot)} <input name="lim_${k}" type="number" value="${p.limites[k] || 0}"></label>`).join('')}</div>
          <p class="sub" style="margin:.4rem 0">0 = ilimitado (limites)</p>
          <p><b>Módulos:</b> ${modulos.map(([k, rot]) => `<label class="serv-ativo" style="display:inline-block;margin:2px 8px"><input type="checkbox" name="mod_${k}" ${p.modulos.includes(k) ? 'checked' : ''}> ${esc(rot)}</label>`).join('')}</p>
          <p><b>Flags:</b> ${LS.flags.map(f => `<label class="serv-ativo" style="display:inline-block;margin:2px 8px"><input type="checkbox" name="flag_${f.chave}" ${p.flags[f.chave] ? 'checked' : ''}> ${esc(f.nome)}</label>`).join('')}</p>
          <label class="serv-ativo"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}> Plano ativo (aparece na landing)</label>
          <button class="btn peq" type="submit">Salvar plano</button></form></div>`;
    }
    LS.body().innerHTML = h;
  },
  async salvarPlano(ev, id) {
    ev.preventDefault(); const f = ev.target;
    const limites = {}; for (const [k] of LS.limites) limites[k] = Math.round(Number(f['lim_' + k].value || 0));
    const modulos = LS.modulos.filter(([k]) => f['mod_' + k] && f['mod_' + k].checked).map(([k]) => k);
    const flags = {}; for (const fl of LS.flags) flags[fl.chave] = !!(f['flag_' + fl.chave] && f['flag_' + fl.chave].checked);
    try {
      await LS.api('PATCH', '/planos/' + id, { nome: f.nome.value, descricao: f.descricao.value, preco_centavos: Math.round(Number(f.preco.value || 0) * 100), limites, modulos, flags, ativo: f.ativo.checked });
      LS.vPlanos();
    } catch (e) { alert(e.message); }
    return false;
  },

  // -------------------------------------------------------- CUSTO POR CLIENTE
  async vCusto() {
    const { linhas } = await LS.api('GET', '/custo-por-cliente');
    LS.body().innerHTML = `<div class="card"><h3>Custo × receita por escritório (mês atual)</h3>
      ${tabela(['Escritório', 'Status', 'Plano', 'Receita', 'Custo', 'Margem'], linhas.map(l => [
        esc(l.nome), LS.chip(l.status), esc(l.plano || '—'), LS.brl(l.receita_centavos), LS.brl(l.custo_centavos),
        `<b style="color:${l.margem_centavos < 0 ? 'var(--alerta)' : 'inherit'}">${LS.brl(l.margem_centavos)}</b>`,
      ]))}<p class="sub">Custo = lançamentos em cost_records (IA/armazenamento/infra). Receita = preço do plano.</p></div>`;
  },

  // -------------------------------------------------------- TICKETS
  async vTickets() {
    const { tickets } = await LS.api('GET', '/tickets');
    LS.body().innerHTML = `<div class="card">${tickets.length ? tabela(['Escritório', 'Assunto', 'Prioridade', 'Status', 'Atualizado', ''], tickets.map(t => [
      esc(t.tenant_nome || '—'), esc(t.assunto), LS.chip(t.prioridade), LS.chip(t.status), LS.dt(t.atualizado_em || t.criado_em),
      `<button class="btn secund peq" onclick="LS.verTicket('${t.id}')">Abrir</button>`,
    ])) : '<p class="vazio">Nenhum chamado.</p>'}</div>`;
  },
  async verTicket(id) {
    const { ticket: t } = await LS.api('GET', '/tickets/' + id);
    LS.body().innerHTML = `<div class="card"><button class="btn secund peq" onclick="LS.vTickets()">← Voltar</button>
      <h3 style="margin:.6rem 0 0">${esc(t.assunto)} ${LS.chip(t.status)} ${LS.chip(t.prioridade)}</h3>
      <p class="sub">${esc(t.tenant_nome || '')} · aberto por ${esc(t.aberto_por)} · ${LS.dt(t.criado_em)}</p>
      ${t.mensagens.map(m => `<div class="lin"><b>${m.lado === 'plataforma' ? '🏢 Plataforma' : '👤 ' + esc(t.tenant_nome || 'Cliente')}</b> <span class="sub">${LS.dt(m.criado_em)}</span><br>${esc(m.texto)}</div>`).join('')}
      <form class="form" id="ls-tk-form" style="margin-top:12px"><textarea id="lstk-txt" rows="3" placeholder="Responder ao escritório"></textarea>
        <button class="btn peq" type="submit">Responder</button>
        <button class="btn secund peq" type="button" onclick="LS.ticketStatus('${id}','resolvido')">Marcar resolvido</button></form></div>`;
    document.getElementById('ls-tk-form').onsubmit = async (ev) => {
      ev.preventDefault();
      await LS.api('POST', `/tickets/${id}/responder`, { texto: document.getElementById('lstk-txt').value });
      LS.verTicket(id);
    };
  },
  async ticketStatus(id, st) { await LS.api('POST', `/tickets/${id}/status`, { status: st }); LS.verTicket(id); },

  // -------------------------------------------------------- LEADS
  async vLeads() {
    const { leads } = await LS.api('GET', '/leads');
    LS.body().innerHTML = `<div class="card">${leads.length ? tabela(['Quando', 'Nome', 'Escritório', 'E-mail', 'Plano', 'Status'], leads.map(l => [
      LS.dt(l.criado_em), esc(l.nome), esc(l.escritorio), esc(l.email), esc(l.plano || '—'), LS.chip(l.status),
    ])) : '<p class="vazio">Nenhum lead ainda.</p>'}</div>`;
  },

  // -------------------------------------------------------- LOGS
  async vLogs() {
    const [{ eventos: ev }, { eventos: aud }] = await Promise.all([LS.api('GET', '/eventos'), LS.api('GET', '/auditoria')]);
    LS.body().innerHTML = `<div class="card"><h3>Eventos da plataforma</h3>${ev.length ? tabela(['Quando', 'Tipo', 'Ref'], ev.slice(0, 40).map(e => [new Date(e.quando).toLocaleString('pt-BR'), LS.chip(e.tipo), esc(e.ref || '')])) : '<p class="vazio">—</p>'}</div>
      <div class="card"><h3>Auditoria administrativa</h3>${aud.length ? tabela(['Quando', 'Quem', 'Ação', 'Detalhe'], aud.slice(0, 40).map(a => [new Date(a.quando).toLocaleString('pt-BR'), esc(a.quem), esc(a.acao), esc(a.detalhe || '')])) : '<p class="vazio">—</p>'}
      <p style="margin-top:10px"><button class="btn secund peq" onclick="LS.rodarCiclo()">▶️ Rodar ciclo de vida agora (trial/dunning)</button></p></div>`;
  },
  async rodarCiclo() {
    try { const r = await LS.api('POST', '/ciclo-diario'); alert(`Ciclo: ${r.trials_vencidos} trial(s) vencido(s), ${r.suspensos} suspenso(s).`); } catch (e) { alert(e.message); }
  },
};

function renderLegalSaas() { LS.abrir(); }
