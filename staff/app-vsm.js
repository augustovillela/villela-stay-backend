'use strict';
// ============================================================================
// Portal Staff — Villela Stay Manager (administração da plataforma comercial).
// Painel do negócio: operações (tenants), planos, cobrança, tickets, custo por
// cliente, feature flags, leads e logs. Só admin. Reaproveita helpers globais
// (api, esc, conteudo, cabecalho, tabela). API: /staff/api/vsm/*.
// ============================================================================

const VSM = {
  tab: 'painel', modulos: [], limites: [], flags: [],
  api(m, c, b) { return api(m, '/vsm' + c, b); },
  brl(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); },
  dt(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—'; },
  chip(t) { return `<span class="chip">${esc(String(t || '—').replace(/_/g, ' '))}</span>`; },

  async abrir() { VSM.render(); },
  abas() {
    return [['painel', '📊 Painel'], ['tenants', '🏨 Operações'], ['planos', '💳 Planos'],
      ['custo', '💰 Custo/cliente'], ['tickets', '🎧 Suporte'], ['leads', '📩 Leads'], ['logs', '📜 Logs']];
  },
  render() {
    const abas = VSM.abas().map(([id, r]) => `<button class="btn ${VSM.tab === id ? '' : 'secund'} peq" onclick="VSM.ir('${id}')">${r}</button>`).join(' ');
    conteudo().innerHTML = cabecalho('🏨 Villela Stay Manager', 'Plataforma comercial — venda do sistema de gestão de hospedagem a outros anfitriões e gestores. Landing pública em /gestao.')
      + `<div class="card" style="display:flex;flex-wrap:wrap;gap:.4rem">${abas}</div><div id="vsm-body"><p class="sub">Carregando…</p></div>`;
    VSM.pintar();
  },
  ir(t) { VSM.tab = t; VSM.render(); },
  body() { return document.getElementById('vsm-body'); },
  async pintar() {
    try { await ({ painel: VSM.vPainel, tenants: VSM.vTenants, planos: VSM.vPlanos, custo: VSM.vCusto, tickets: VSM.vTickets, leads: VSM.vLeads, logs: VSM.vLogs }[VSM.tab])(); }
    catch (e) { VSM.body().innerHTML = `<div class="card">Erro: ${esc(e.message)}</div>`; }
  },

  // -------------------------------------------------------- PAINEL
  async vPainel() {
    const { resumo: r, catalogo } = await VSM.api('GET', '/dashboard');
    VSM.modulos = catalogo.modulos; VSM.limites = catalogo.limites; VSM.flags = catalogo.flags;
    const kpi = (rot, val, alerta) => `<div class="card" style="min-width:150px;flex:1${alerta && val ? ';border-color:var(--alerta)' : ''}"><div class="sub">${rot}</div><div style="font-size:1.5rem;font-weight:700">${val}</div></div>`;
    let h = `<div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
      ${kpi('MRR', VSM.brl(r.mrr_centavos))}${kpi('ARR', VSM.brl(r.arr_centavos))}${kpi('Custo do mês', VSM.brl(r.custo_mes_centavos))}
      ${kpi('Operações', r.tenants_total)}${kpi('Ativas', r.ativos)}${kpi('Em trial', r.trials)}
      ${kpi('Inadimplentes', r.inadimplentes, true)}${kpi('Suspensas/canceladas', r.suspensos)}
      ${kpi('Trials expirando 7d', r.trials_expirando_7d, true)}${kpi('Tickets abertos', r.tickets_abertos, true)}${kpi('Leads novos', r.leads_novos, true)}</div>
      <div class="card"><h3>Por plano</h3>${tabela(['Plano', 'Operações ativas/trial'], r.por_plano.map(p => [esc(p.nome), p.qtd]))}</div>
      <div class="card"><h3>🚩 Feature flags (catálogo global)</h3>${tabela(['Chave', 'Nome', 'Padrão'], VSM.flags.map(f => [VSM.chip(f.chave), esc(f.nome), f.padrao ? 'ligada' : 'desligada']))}
      <p class="sub">Flags valem por PLANO (aba Planos) e podem ter override por operação (detalhe da operação).</p></div>`;
    VSM.body().innerHTML = h;
  },

  // -------------------------------------------------------- OPERAÇÕES (TENANTS)
  async vTenants() {
    const { tenants } = await VSM.api('GET', '/tenants');
    let h = `<details class="cr-box"><summary class="cr-sum">➕ Nova operação</summary>
      <form class="form" id="vsm-tn-form" style="max-width:660px;margin-top:12px">
        <label>Nome da operação * <input id="vst-nome" required maxlength="200"></label>
        <div class="hi-grid">
          <label>E-mail de acesso * <input id="vst-email" type="email" required></label>
          <label>CNPJ <input id="vst-cnpj" maxlength="20"></label>
          <label>Site / perfil <input id="vst-site" maxlength="200" placeholder="airbnb.com/... ou site próprio"></label>
          <label>Plano <select id="vst-plano">${VSM.planosOptions()}</select></label>
        </div>
        <button class="btn" type="submit">Criar</button><p id="vst-msg" class="erro"></p></form></details>`;
    h += `<div class="card">${tenants.length ? tabela(['Operação', 'Plano', 'Status', 'Criado', ''], tenants.map(t => [
      esc(t.nome), esc(t.plano_nome || '—'), VSM.chip(t.status), VSM.dt(t.criado_em),
      `<button class="btn secund peq" onclick="VSM.verTenant('${t.id}')">Abrir</button>`,
    ])) : '<p class="vazio">Nenhuma operação ainda.</p>'}</div>`;
    VSM.body().innerHTML = h;
    const f = document.getElementById('vsm-tn-form');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault(); const msg = document.getElementById('vst-msg'); msg.textContent = '';
      try {
        const r = await VSM.api('POST', '/tenants', { nome: document.getElementById('vst-nome').value, email: document.getElementById('vst-email').value, cnpj: document.getElementById('vst-cnpj').value, site: document.getElementById('vst-site').value, plano: document.getElementById('vst-plano').value });
        VSM.verTenant(r.tenant.id);
      } catch (e) { msg.textContent = e.message; }
    };
  },
  planosOptions(sel) {
    return (VSM._planos || []).map(p => `<option value="${p.slug}"${p.slug === sel ? ' selected' : ''}>${esc(p.nome)}${p.preco_centavos ? ' (' + VSM.brl(p.preco_centavos) + ')' : ''}</option>`).join('');
  },
  async verTenant(id) {
    if (!VSM._planos) { const { planos } = await VSM.api('GET', '/planos'); VSM._planos = planos; }
    const { tenant: t } = await VSM.api('GET', '/tenants/' + id);
    const ent = t.entitlements;
    const usoLin = (VSM.limites || []).map(([k, rot]) => `<div class="lin">${esc(rot)}: <b>${t.uso[k] || 0}</b> / ${(ent.limites[k] || 0) === 0 ? 'ilimitado' : ent.limites[k]}</div>`).join('');
    VSM.body().innerHTML = `<div class="card"><button class="btn secund peq" onclick="VSM.vTenants()">← Voltar</button>
      <h3 style="margin:.6rem 0 0">${esc(t.nome)} ${VSM.chip(t.status)} ${VSM.chip(ent.plano || '—')}</h3>
      <p class="sub">${esc(t.email_contato)} · ${esc(t.cnpj || '')} · ${esc(t.site || '')} · criado ${VSM.dt(t.criado_em)}${t.trial_expira_em ? ' · trial até ' + VSM.dt(t.trial_expira_em) : ''}</p>
      <p>
        <label>Plano: <select id="vsm-plano-sel">${VSM.planosOptions(ent.plano)}</select></label>
        <button class="btn peq" onclick="VSM.trocarPlano('${id}')">Aplicar plano</button>
        <button class="btn secund peq" onclick="VSM.statusTenant('${id}','ativa')">Ativar</button>
        <button class="btn secund peq" onclick="VSM.statusTenant('${id}','suspensa')">Suspender</button>
        <button class="btn secund peq" onclick="VSM.statusTenant('${id}','cancelada')">Cancelar</button>
        <button class="btn secund peq" onclick="VSM.marcarPago('${id}')">💵 Marcar pago</button>
        <button class="btn secund peq" onclick="VSM.linkAcesso('${id}')">🔑 Link de acesso</button>
      </p><p id="vsm-tn-msg" class="sub"></p></div>
      <div class="card"><h3>Uso do mês</h3>${usoLin || '<p class="vazio">—</p>'}
        <h3 style="margin-top:12px">Módulos liberados</h3><p>${ent.modulos.map(m => VSM.chip(m)).join(' ') || '—'}</p>
        <h3 style="margin-top:12px">Flags</h3><p>${Object.keys(ent.flags).map(k => `${VSM.chip(k)} ${ent.flags[k] ? '✅' : '⛔'}`).join(' ') || '—'}</p></div>
      <div class="card"><h3>💰 Custo do mês</h3>${t.custo.length ? tabela(['Categoria', 'Custo'], t.custo.map(c => [VSM.chip(c.categoria), VSM.brl(c.total)])) : '<p class="vazio">Sem custos lançados.</p>'}
        <p class="sub">Total: <b>${VSM.brl(t.custo_total)}</b> · receita do plano: <b>${VSM.brl(t.plano ? t.plano.preco_centavos : 0)}</b></p>
        <form class="form" id="vsm-custo-form" style="max-width:520px"><div class="hi-grid">
          <label>Categoria <select id="vsc-cat"><option>ia</option><option>armazenamento</option><option>infra</option><option>canais</option><option>suporte</option><option>outro</option></select></label>
          <label>Custo (R$) <input id="vsc-val" type="number" step="0.01"></label></div>
          <label>Detalhe <input id="vsc-det" maxlength="200"></label>
          <button class="btn peq" type="submit">Lançar custo</button></form></div>
      <div class="card"><h3>⚙️ Overrides negociados (Enterprise etc.)</h3>
        <p class="sub">JSON opcional que sobrepõe o plano. Ex. limites: <code>{"imoveis":100}</code></p>
        <label>Limites (JSON) <input id="vsm-ov-lim" placeholder='{}' value='${esc(JSON.stringify((t.settings && JSON.parse(t.settings.limites_over || "{}")) || {}))}'></label>
        <label>Flags (JSON) <input id="vsm-ov-fl" placeholder='{}' value='${esc(JSON.stringify((t.settings && JSON.parse(t.settings.flags_over || "{}")) || {}))}'></label>
        <button class="btn peq" onclick="VSM.salvarOverride('${id}')">Salvar overrides</button></div>
      <div class="card"><h3>Usuários</h3>${tabela(['Nome', 'E-mail', 'Papel', 'Últ. acesso'], t.usuarios.map(u => [esc(u.nome || '—'), esc(u.email), VSM.chip(u.papel), VSM.dt(u.ultimo_login)]))}</div>`;
    document.getElementById('vsm-custo-form').onsubmit = async (ev) => {
      ev.preventDefault();
      await VSM.api('POST', `/tenants/${id}/custo`, { categoria: document.getElementById('vsc-cat').value, custo_centavos: Math.round(Number(document.getElementById('vsc-val').value || 0) * 100), detalhe: document.getElementById('vsc-det').value });
      VSM.verTenant(id);
    };
  },
  async trocarPlano(id) {
    const slug = document.getElementById('vsm-plano-sel').value;
    try { const r = await VSM.api('POST', `/tenants/${id}/plano`, { plano: slug }); document.getElementById('vsm-tn-msg').textContent = `${r.tipo} aplicado.` + (r.exige_reassinar ? ' ⚠️ Assinatura MP ativa: a operação precisa reassinar para a nova cobrança.' : ''); setTimeout(() => VSM.verTenant(id), 1400); } catch (e) { alert(e.message); }
  },
  async statusTenant(id, st) {
    if (!confirm(`Mudar status para "${st}"?`)) return;
    try { await VSM.api('POST', `/tenants/${id}/status`, { status: st }); VSM.verTenant(id); } catch (e) { alert(e.message); }
  },
  async marcarPago(id) {
    try { await VSM.api('POST', `/tenants/${id}/marcar-pago`); VSM.verTenant(id); } catch (e) { alert(e.message); }
  },
  async salvarOverride(id) {
    try {
      const lim = JSON.parse(document.getElementById('vsm-ov-lim').value || '{}');
      const fl = JSON.parse(document.getElementById('vsm-ov-fl').value || '{}');
      await VSM.api('POST', `/tenants/${id}/settings`, { limites_over: lim, flags_over: fl });
      VSM.verTenant(id);
    } catch (e) { alert('JSON inválido ou erro: ' + e.message); }
  },
  async linkAcesso(id) {
    try {
      const r = await VSM.api('POST', `/tenants/${id}/link-acesso`);
      const m = document.getElementById('vsm-tn-msg');
      m.innerHTML = `🔗 Link p/ ${esc(r.email)} definir a senha (validade ${esc(r.validade)}):<br><b>${esc(r.url)}</b>`;
      try { await navigator.clipboard.writeText(r.url); m.innerHTML += '<br>✅ copiado'; } catch (_) {}
    } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- PLANOS
  async vPlanos() {
    const { planos, modulos, limites } = await VSM.api('GET', '/planos');
    VSM._planos = planos; VSM.modulos = modulos; VSM.limites = limites;
    let h = '<div class="aviso">Preços e limites são editáveis — são os números comerciais do produto. Módulos e flags controlam a entrega.</div>';
    for (const p of planos) {
      h += `<div class="card"><h3>${esc(p.nome)} <span class="tag">${esc(p.slug)}</span> ${p.ativo ? '' : '<span class="chip">inativo</span>'}</h3>
        <form class="form" onsubmit="return VSM.salvarPlano(event,'${p.id}')">
          <div class="hi-grid">
            <label>Nome <input name="nome" value="${esc(p.nome)}"></label>
            <label>Preço/mês (R$) <input name="preco" type="number" step="0.01" value="${(p.preco_centavos / 100).toFixed(2)}"></label>
          </div>
          <label>Descrição <input name="descricao" value="${esc(p.descricao)}"></label>
          <div class="hi-grid">${limites.map(([k, rot]) => `<label>${esc(rot)} <input name="lim_${k}" type="number" value="${p.limites[k] || 0}"></label>`).join('')}</div>
          <p class="sub" style="margin:.4rem 0">0 = ilimitado (limites)</p>
          <p><b>Módulos:</b> ${modulos.map(([k, rot]) => `<label class="serv-ativo" style="display:inline-block;margin:2px 8px"><input type="checkbox" name="mod_${k}" ${p.modulos.includes(k) ? 'checked' : ''}> ${esc(rot)}</label>`).join('')}</p>
          <p><b>Flags:</b> ${VSM.flags.map(f => `<label class="serv-ativo" style="display:inline-block;margin:2px 8px"><input type="checkbox" name="flag_${f.chave}" ${p.flags[f.chave] ? 'checked' : ''}> ${esc(f.nome)}</label>`).join('')}</p>
          <label class="serv-ativo"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}> Plano ativo (aparece na landing)</label>
          <button class="btn peq" type="submit">Salvar plano</button></form></div>`;
    }
    VSM.body().innerHTML = h;
  },
  async salvarPlano(ev, id) {
    ev.preventDefault(); const f = ev.target;
    const limites = {}; for (const [k] of VSM.limites) limites[k] = Math.round(Number(f['lim_' + k].value || 0));
    const modulos = VSM.modulos.filter(([k]) => f['mod_' + k] && f['mod_' + k].checked).map(([k]) => k);
    const flags = {}; for (const fl of VSM.flags) flags[fl.chave] = !!(f['flag_' + fl.chave] && f['flag_' + fl.chave].checked);
    try {
      await VSM.api('PATCH', '/planos/' + id, { nome: f.nome.value, descricao: f.descricao.value, preco_centavos: Math.round(Number(f.preco.value || 0) * 100), limites, modulos, flags, ativo: f.ativo.checked });
      VSM.vPlanos();
    } catch (e) { alert(e.message); }
    return false;
  },

  // -------------------------------------------------------- CUSTO POR CLIENTE
  async vCusto() {
    const { linhas } = await VSM.api('GET', '/custo-por-cliente');
    VSM.body().innerHTML = `<div class="card"><h3>Custo × receita por operação (mês atual)</h3>
      ${tabela(['Operação', 'Status', 'Plano', 'Receita', 'Custo', 'Margem'], linhas.map(l => [
        esc(l.nome), VSM.chip(l.status), esc(l.plano || '—'), VSM.brl(l.receita_centavos), VSM.brl(l.custo_centavos),
        `<b style="color:${l.margem_centavos < 0 ? 'var(--alerta)' : 'inherit'}">${VSM.brl(l.margem_centavos)}</b>`,
      ]))}<p class="sub">Custo = lançamentos em cost_records (IA/armazenamento/infra/canais). Receita = preço do plano.</p></div>`;
  },

  // -------------------------------------------------------- TICKETS
  async vTickets() {
    const { tickets } = await VSM.api('GET', '/tickets');
    VSM.body().innerHTML = `<div class="card">${tickets.length ? tabela(['Operação', 'Assunto', 'Prioridade', 'Status', 'Atualizado', ''], tickets.map(t => [
      esc(t.tenant_nome || '—'), esc(t.assunto), VSM.chip(t.prioridade), VSM.chip(t.status), VSM.dt(t.atualizado_em || t.criado_em),
      `<button class="btn secund peq" onclick="VSM.verTicket('${t.id}')">Abrir</button>`,
    ])) : '<p class="vazio">Nenhum chamado.</p>'}</div>`;
  },
  async verTicket(id) {
    const { ticket: t } = await VSM.api('GET', '/tickets/' + id);
    VSM.body().innerHTML = `<div class="card"><button class="btn secund peq" onclick="VSM.vTickets()">← Voltar</button>
      <h3 style="margin:.6rem 0 0">${esc(t.assunto)} ${VSM.chip(t.status)} ${VSM.chip(t.prioridade)}</h3>
      <p class="sub">${esc(t.tenant_nome || '')} · aberto por ${esc(t.aberto_por)} · ${VSM.dt(t.criado_em)}</p>
      ${t.mensagens.map(m => `<div class="lin"><b>${m.lado === 'plataforma' ? '🏢 Plataforma' : '👤 ' + esc(t.tenant_nome || 'Cliente')}</b> <span class="sub">${VSM.dt(m.criado_em)}</span><br>${esc(m.texto)}</div>`).join('')}
      <form class="form" id="vsm-tk-form" style="margin-top:12px"><textarea id="vstk-txt" rows="3" placeholder="Responder à operação"></textarea>
        <button class="btn peq" type="submit">Responder</button>
        <button class="btn secund peq" type="button" onclick="VSM.ticketStatus('${id}','resolvido')">Marcar resolvido</button></form></div>`;
    document.getElementById('vsm-tk-form').onsubmit = async (ev) => {
      ev.preventDefault();
      await VSM.api('POST', `/tickets/${id}/responder`, { texto: document.getElementById('vstk-txt').value });
      VSM.verTicket(id);
    };
  },
  async ticketStatus(id, st) { await VSM.api('POST', `/tickets/${id}/status`, { status: st }); VSM.verTicket(id); },

  // -------------------------------------------------------- LEADS
  async vLeads() {
    const { leads } = await VSM.api('GET', '/leads');
    VSM.body().innerHTML = `<div class="card">${leads.length ? tabela(['Quando', 'Nome', 'Operação', 'E-mail', 'Plano', 'Status'], leads.map(l => [
      VSM.dt(l.criado_em), esc(l.nome), esc(l.empresa), esc(l.email), esc(l.plano || '—'), VSM.chip(l.status),
    ])) : '<p class="vazio">Nenhum lead ainda.</p>'}</div>`;
  },

  // -------------------------------------------------------- LOGS
  async vLogs() {
    const [{ eventos: ev }, { eventos: aud }] = await Promise.all([VSM.api('GET', '/eventos'), VSM.api('GET', '/auditoria')]);
    VSM.body().innerHTML = `<div class="card"><h3>Eventos da plataforma</h3>${ev.length ? tabela(['Quando', 'Tipo', 'Ref'], ev.slice(0, 40).map(e => [new Date(e.quando).toLocaleString('pt-BR'), VSM.chip(e.tipo), esc(e.ref || '')])) : '<p class="vazio">—</p>'}</div>
      <div class="card"><h3>Auditoria administrativa</h3>${aud.length ? tabela(['Quando', 'Quem', 'Ação', 'Detalhe'], aud.slice(0, 40).map(a => [new Date(a.quando).toLocaleString('pt-BR'), esc(a.quem), esc(a.acao), esc(a.detalhe || '')])) : '<p class="vazio">—</p>'}
      <p style="margin-top:10px"><button class="btn secund peq" onclick="VSM.rodarCiclo()">▶️ Rodar ciclo de vida agora (trial/dunning)</button></p></div>`;
  },
  async rodarCiclo() {
    try { const r = await VSM.api('POST', '/ciclo-diario'); alert(`Ciclo: ${r.trials_vencidos} trial(s) vencido(s), ${r.suspensos} suspenso(s).`); } catch (e) { alert(e.message); }
  },
};

function renderVsm() { VSM.abrir(); }
