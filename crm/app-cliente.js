// =====================================================================
// Villela CRM — SPA do painel do assinante (/crm/app).
// Script clássico servido em /crm/app.js (sem build). Fala com /crm/api/*.
// Telas: Dashboard · Kanban · Contatos · Tarefas · Templates · Propostas ·
// Campanhas · IA · Conta (equipe/plano/integrações).
// =====================================================================
'use strict';
/* eslint-disable no-alert */
let ME = null, KANBAN_FUNIL = '';

const $ = (q) => document.querySelector(q);
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const dataBr = (iso) => iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : '—';
const waLink = (tel, txt) => 'https://wa.me/' + String(tel || '').replace(/\D/g, '') + (txt ? '?text=' + encodeURIComponent(txt) : '');

async function api(metodo, caminho, corpo) {
  const r = await fetch('/crm/api' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined, credentials: 'same-origin',
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { telaLogin(); throw new Error('Sessão expirada — entre novamente.'); }
  if (!r.ok) throw new Error(d.erro || ('Erro ' + r.status));
  return d;
}

async function bootCRM() {
  try { ME = await api('GET', '/me'); telaApp(); }
  catch (_) { /* telaLogin já chamada no 401 */ }
}

function telaLogin() {
  $('#app').innerHTML = `<div class="card" style="max-width:420px;margin:30px auto">
    <h3>Entrar no Villela CRM</h3>
    <label>E-mail <input id="lg-email" type="email" autocomplete="username"></label>
    <label>Senha <input id="lg-senha" type="password" autocomplete="current-password"></label>
    <button class="btn" id="lg-btn" style="margin-top:8px">Entrar</button>
    <p id="lg-msg" class="erro"></p>
    <p class="sub" style="margin-top:14px;text-align:left">Ainda não tem conta? <a href="/crm/assinar?plano=trial">Teste grátis por 14 dias</a>.</p></div>`;
  const entrar = async () => {
    $('#lg-msg').textContent = '';
    try {
      await api('POST', '/login', { email: $('#lg-email').value.trim(), senha: $('#lg-senha').value });
      ME = await api('GET', '/me'); telaApp();
    } catch (e) { $('#lg-msg').textContent = e.message; }
  };
  $('#lg-btn').onclick = entrar;
  $('#lg-senha').onkeydown = (ev) => { if (ev.key === 'Enter') entrar(); };
}

const MENU = [
  ['dash', '📊 Dashboard', 'dashboard'], ['kanban', '📋 Kanban', 'funis'], ['contatos', '👥 Contatos', 'contatos'],
  ['tarefas', '⏰ Tarefas', 'tarefas'], ['templates', '💬 Templates', 'templates'], ['propostas', '📄 Propostas', 'propostas'],
  ['campanhas', '📣 Campanhas', 'campanhas'], ['ia', '🤖 Agentes', 'ia'], ['conta', '⚙️ Conta', ''],
];
function telaApp() {
  const mods = (ME.entitlements && ME.entitlements.modulos) || [];
  const bloq = ME.entitlements && !ME.entitlements.acesso_liberado;
  const botoes = MENU.filter(([, , mod]) => !mod || mods.includes(mod))
    .map(([id, rot]) => `<button class="btn peq secund" data-v="${id}">${rot}</button>`).join('');
  $('#app').innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
      <div><b>${esc(ME.empresa.nome)}</b> <span class="tag">${esc(ME.entitlements.plano || '')}</span>
        <span class="sub" style="margin:0">· ${esc(ME.usuario.nome || ME.usuario.email)} (${esc(ME.usuario.papel)})</span></div>
      <div style="display:flex;gap:8px"><button class="btn peq secund" id="push-btn" style="display:none" title="Notificações no celular">🔔 Avisos</button><button class="btn peq secund" id="sair">Sair</button></div>
    </div>
    ${bloq ? `<div class="aviso">⚠️ Acesso bloqueado (${esc(ME.empresa.status)}). Regularize o plano na aba Conta.</div>` : ''}
    ${ME.empresa.status === 'trial' && ME.entitlements.trial_expira_em ? `<div class="aviso">🕒 Trial até ${dataBr(ME.entitlements.trial_expira_em)}. Assine na aba Conta para não perder o acesso.</div>` : ''}
    <div class="menu">${botoes}</div><div id="tela"></div>`;
  $('#sair').onclick = async () => { await api('POST', '/logout'); location.reload(); };
  document.querySelectorAll('.menu [data-v]').forEach(b => b.onclick = () => navegar(b.dataset.v));
  pintarBotaoPush();
  navegar(bloq ? 'conta' : 'dash');
}

// ---- notificações push do painel (PWA) — avisos de lead/proposta no celular ----
function pushOk() { return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window); }
function b64ParaU8(b) {
  const pad = '='.repeat((4 - b.length % 4) % 4);
  const s = (b + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s); const a = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i);
  return a;
}
async function pushAssinado() {
  try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); }
  catch (_) { return null; }
}
async function pintarBotaoPush() {
  const btn = $('#push-btn');
  if (!btn || !pushOk()) return;
  const sub = await pushAssinado();
  btn.style.display = '';
  btn.textContent = sub ? '🔔 Avisos ✓' : '🔔 Avisos';
  btn.title = sub ? 'Notificações ativadas — toque para desativar' : 'Receber avisos de leads e propostas no celular';
  btn.onclick = () => alternarPush(btn);
}
async function alternarPush() {
  try {
    const sub = await pushAssinado();
    if (sub) {
      await api('POST', '/app/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    } else {
      const { publicKey } = await api('GET', '/app/push/chave');
      if (!publicKey) return alert('As notificações ainda não estão disponíveis. Tente mais tarde.');
      if ((await Notification.requestPermission()) !== 'granted') return alert('Permissão negada. Libere as notificações deste site nas configurações do navegador.');
      const reg = await navigator.serviceWorker.ready;
      const nova = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ParaU8(publicKey) });
      await api('POST', '/app/push/subscribe', { subscription: nova.toJSON() });
    }
  } catch (e) { alert(e.message); }
  pintarBotaoPush();
}
function navegar(v) {
  const mapa = { dash: vDash, kanban: vKanban, contatos: vContatos, tarefas: vTarefas, templates: vTemplates, propostas: vPropostas, campanhas: vCampanhas, ia: vIA, conta: vConta };
  (mapa[v] || vDash)();
}
const carregando = () => { $('#tela').innerHTML = '<p class="sub">Carregando…</p>'; };
const erroTela = (e) => { $('#tela').innerHTML = `<p class="erro">${esc(e.message)}</p>`; };

// ---------------- DASHBOARD ----------------
async function vDash() {
  carregando();
  try {
    const [{ dashboard: d }, caixa] = await Promise.all([api('GET', '/app/dashboard'), api('GET', '/app/tarefas/caixa').catch(() => null)]);
    const kpi = (n, r) => `<div class="kpi"><div class="n">${n}</div><div class="r">${esc(r)}</div></div>`;
    const tab = (titulo, linhas) => linhas && linhas.length ? `<div class="card" style="margin-top:14px"><b>${esc(titulo)}</b><table>${linhas}</table></div>` : '';
    $('#tela').innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${kpi(d.leads_novos_7d, 'Leads novos (7d)')} ${kpi(d.contatos_total, 'Contatos ativos')} ${kpi(d.leads_quentes, 'Leads quentes')}
        ${kpi(d.leads_sem_acao, 'Sem ação')} ${kpi(d.tarefas_hoje, 'Tarefas hoje')} ${kpi(d.tarefas_atrasadas, 'Atrasadas')}
        ${kpi(d.oportunidades_abertas, 'Negócios abertos')} ${kpi(brl(d.valor_em_negociacao_centavos), 'Em negociação')}
        ${kpi(brl(d.valor_ganho_centavos), 'Ganho (total)')} ${kpi(d.taxa_conversao_pct + '%', 'Conversão')}
        ${d.tempo_medio_fechamento_dias != null ? kpi(d.tempo_medio_fechamento_dias + 'd', 'Tempo médio de fechamento') : ''}
        ${kpi(d.propostas_enviadas, 'Propostas em aberto')} ${kpi(d.propostas_vencidas, 'Propostas vencidas')}
      </div>
      ${caixa ? caixaHTML(caixa) : ''}
      <div class="duas">
        ${tab('Leads e conversão por origem', d.por_origem.map(o => `<tr><td>${esc(o.origem || '—')}</td><td style="text-align:right">${o.leads} leads</td><td style="text-align:right">${o.convertidos} conv.</td></tr>`).join(''))}
        ${tab('Receita ganha por origem', d.receita_por_origem.map(o => `<tr><td>${esc(o.origem || '—')}</td><td style="text-align:right">${brl(o.v)}</td></tr>`).join(''))}
        ${tab('Previsão de receita (negócios abertos)', d.previsao_receita_mes.map(m => `<tr><td>${esc(m.mes)}</td><td style="text-align:right">${brl(m.v)}</td></tr>`).join(''))}
        ${tab('Performance por responsável', d.por_responsavel.map(r => `<tr><td>${esc(r.responsavel)}</td><td style="text-align:right">${r.ganhas}/${r.n}</td><td style="text-align:right">${brl(r.valor_ganho)}</td></tr>`).join(''))}
        ${tab('Motivos de perda', d.motivos_perda.map(m => `<tr><td>${esc(m.motivo)}</td><td style="text-align:right">${m.n}</td></tr>`).join(''))}
        ${tab('Temperatura dos leads', d.score_faixas.map(f => `<tr><td><span class="chip ${esc(f.faixa)}">${esc(f.faixa)}</span></td><td style="text-align:right">${f.n}</td></tr>`).join(''))}
      </div>`;
    ligaCaixa();
  } catch (e) { erroTela(e); }
}
function caixaHTML(cx) {
  const chip = (t, cls) => t.map(x => `<button class="btn peq secund cx-item" data-id="${esc(x.contato_id || x.id)}" style="margin:2px">${cls} ${esc(x.titulo || x.nome || x.contato_nome || '')}${x.vence_em ? ' · ' + dataBr(x.vence_em) : ''}</button>`).join('');
  if (!cx.atrasadas.length && !cx.hoje.length && !cx.leads_parados.length && !cx.propostas_sem_resposta.length) return '';
  return `<div class="card" style="margin-top:14px;border-left:4px solid var(--acento)"><b>🔔 Precisa de ação</b><br>
    ${cx.atrasadas.length ? '<p style="margin:6px 0 2px"><b>Atrasadas:</b><br>' + chip(cx.atrasadas, '🔴') + '</p>' : ''}
    ${cx.hoje.length ? '<p style="margin:6px 0 2px"><b>Hoje:</b><br>' + chip(cx.hoje, '🟡') + '</p>' : ''}
    ${cx.leads_parados.length ? '<p style="margin:6px 0 2px"><b>Leads parados:</b><br>' + chip(cx.leads_parados, '🧊') + '</p>' : ''}
    ${cx.propostas_sem_resposta.length ? '<p style="margin:6px 0 2px"><b>Propostas sem resposta:</b><br>' + chip(cx.propostas_sem_resposta, '📄') + '</p>' : ''}
  </div>`;
}
function ligaCaixa() { document.querySelectorAll('.cx-item').forEach(b => b.onclick = () => abrirContato(b.dataset.id)); }

// ---------------- KANBAN ----------------
async function vKanban() {
  carregando();
  try {
    const { funis } = await api('GET', '/app/funis');
    if (!KANBAN_FUNIL && funis.length) KANBAN_FUNIL = funis[0].id;
    const k = await api('GET', '/app/kanban?funil_id=' + encodeURIComponent(KANBAN_FUNIL));
    const sel = funis.map(f => `<option value="${f.id}" ${f.id === KANBAN_FUNIL ? 'selected' : ''}>${esc(f.nome)}</option>`).join('');
    $('#tela').innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
        <label style="display:flex;align-items:center;gap:6px">Funil <select id="k-funil" style="width:auto;margin:0">${sel}</select></label>
        <button class="btn peq" id="k-novo">+ Nova oportunidade</button>
        <button class="btn peq secund" id="k-novo-funil">+ Novo funil</button>
      </div>
      <div class="kanban">${k.colunas.map(colunaHTML).join('')}</div>`;
    $('#k-funil').onchange = () => { KANBAN_FUNIL = $('#k-funil').value; vKanban(); };
    $('#k-novo').onclick = () => dlgOportunidade();
    $('#k-novo-funil').onclick = async () => {
      const nome = prompt('Nome do novo funil:'); if (!nome) return;
      try { const r = await api('POST', '/app/funis', { nome }); KANBAN_FUNIL = r.funil.id; vKanban(); } catch (e) { alert(e.message); }
    };
    ligaKanban();
  } catch (e) { erroTela(e); }
}
function colunaHTML(c) {
  const cards = c.oportunidades.map(o => `
    <div class="kard ${o.atrasada ? 'atrasada' : ''}" draggable="true" data-id="${o.id}" data-contato="${o.contato_id}">
      <b>${esc(o.contato_nome || o.titulo)}</b>
      <div class="meta">${esc(o.titulo)}${o.valor_centavos ? ' · ' + brl(o.valor_centavos) : ''}</div>
      <div class="meta"><span class="chip ${esc(faixa(o.contato_score))}">${o.contato_score}</span>
        ${o.contato_origem ? '<span class="chip">' + esc(o.contato_origem) + '</span>' : ''}
        ${o.previsao ? '📅 ' + dataBr(o.previsao) : ''}
        ${o.contato_telefone ? `<a href="${waLink(o.contato_telefone)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">💬</a>` : ''}</div>
    </div>`).join('');
  return `<div class="kcol" data-est="${c.id}"><h4><span>${esc(c.nome)}</span><span>${c.oportunidades.length}${c.total_centavos ? ' · ' + brl(c.total_centavos) : ''}</span></h4>${cards || '<div class="sub" style="margin:6px">—</div>'}</div>`;
}
const faixa = (n) => n <= 30 ? 'frio' : n <= 60 ? 'morno' : n <= 80 ? 'quente' : 'muito-quente';
function ligaKanban() {
  document.querySelectorAll('.kard').forEach(kd => {
    kd.onclick = () => abrirContato(kd.dataset.contato);
    kd.ondragstart = (ev) => ev.dataTransfer.setData('text/plain', kd.dataset.id);
  });
  document.querySelectorAll('.kcol').forEach(col => {
    col.ondragover = (ev) => { ev.preventDefault(); col.classList.add('sobre'); };
    col.ondragleave = () => col.classList.remove('sobre');
    col.ondrop = async (ev) => {
      ev.preventDefault(); col.classList.remove('sobre');
      const id = ev.dataTransfer.getData('text/plain');
      try {
        const nome = (col.querySelector('h4 span') || {}).textContent || '';
        const motivo = /perdid/i.test(nome) ? prompt('Motivo da perda (opcional):') || '' : '';
        await api('POST', `/app/oportunidades/${id}/mover`, { estagio_id: col.dataset.est, motivo });
        vKanban();
      } catch (e) { alert(e.message); }
    };
  });
}
async function dlgOportunidade(contatoId) {
  const { funis } = await api('GET', '/app/funis');
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h3>Nova oportunidade</h3>
    ${contatoId ? '' : `<label>Contato (busque pelo nome) <input id="o-busca" placeholder="digite 2+ letras"><div id="o-lista"></div><input type="hidden" id="o-contato"></label>`}
    <label>Título <input id="o-titulo" placeholder="ex.: Hospedagem réveillon"></label>
    <div class="hi-grid">
      <label>Funil <select id="o-funil">${funis.map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select></label>
      <label>Valor (R$) <input id="o-valor" type="number" min="0" step="50"></label>
      <label>Previsão <input id="o-prev" type="date"></label>
    </div>
    <button class="btn" id="o-salvar">Criar</button> <button class="btn secund" id="o-fechar">Cancelar</button><p id="o-msg" class="erro"></p>`;
  document.body.appendChild(dlg); dlg.showModal();
  if (!contatoId) {
    let t; $('#o-busca').oninput = () => { clearTimeout(t); t = setTimeout(async () => {
      const b = $('#o-busca').value.trim(); if (b.length < 2) return;
      const { contatos } = await api('GET', '/app/contatos?busca=' + encodeURIComponent(b) + '&limite=8');
      $('#o-lista').innerHTML = contatos.map(c => `<button class="btn peq secund" data-id="${c.id}" style="margin:2px">${esc(c.nome || c.telefone)}</button>`).join('');
      $('#o-lista').querySelectorAll('button').forEach(bt => bt.onclick = () => { $('#o-contato').value = bt.dataset.id; $('#o-busca').value = bt.textContent; $('#o-lista').innerHTML = ''; });
    }, 300); };
  }
  $('#o-fechar').onclick = () => dlg.remove();
  $('#o-salvar').onclick = async () => {
    try {
      await api('POST', '/app/oportunidades', {
        contato_id: contatoId || $('#o-contato').value, titulo: $('#o-titulo').value.trim(),
        funil_id: $('#o-funil').value, valor_centavos: Math.round(Number($('#o-valor').value || 0) * 100), previsao: $('#o-prev').value,
      });
      dlg.remove(); vKanban();
    } catch (e) { $('#o-msg').textContent = e.message; }
  };
}

// ---------------- CONTATOS ----------------
async function vContatos() {
  carregando();
  try {
    const cfg = await api('GET', '/app/config');
    $('#tela').innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
        <button class="btn peq" id="c-novo">+ Novo contato</button>
        <input id="c-busca" placeholder="Buscar nome, telefone, e-mail, empresa…" style="flex:1;min-width:180px;margin:0;width:auto">
        <select id="c-tipo" style="width:auto;margin:0"><option value="">Todos os tipos</option>${cfg.tipos.map(t => `<option>${t}</option>`).join('')}</select>
        <select id="c-origem" style="width:auto;margin:0"><option value="">Todas as origens</option>${cfg.origens.map(o => `<option>${o}</option>`).join('')}</select>
        <button class="btn peq secund" id="c-importar">⬆ Importar CSV</button>
        <a class="btn peq secund" href="/crm/api/app/contatos/exportar">⬇ Exportar</a>
      </div><div id="c-lista"><p class="sub">Carregando…</p></div>`;
    const carregar = async () => {
      const q = new URLSearchParams();
      if ($('#c-busca').value.trim()) q.set('busca', $('#c-busca').value.trim());
      if ($('#c-tipo').value) q.set('tipo', $('#c-tipo').value);
      if ($('#c-origem').value) q.set('origem', $('#c-origem').value);
      const { contatos } = await api('GET', '/app/contatos?' + q);
      $('#c-lista').innerHTML = contatos.length ? `<div class="card" style="padding:8px;overflow-x:auto"><table>
        <thead><tr><th>Nome</th><th>Contato</th><th>Tipo</th><th>Origem</th><th>Score</th><th>Próx. ação</th><th></th></tr></thead><tbody>
        ${contatos.map(c => `<tr>
          <td><a href="#" class="c-abrir" data-id="${c.id}"><b>${esc(c.nome || '(sem nome)')}</b></a>${c.empresa_nome ? '<br><span class="sub" style="margin:0;text-align:left">' + esc(c.empresa_nome) + '</span>' : ''}</td>
          <td>${c.telefone ? `<a href="${waLink(c.telefone)}" target="_blank" rel="noopener">💬 ${esc(c.telefone)}</a>` : ''}${c.email ? `<br><a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</td>
          <td><span class="chip">${esc(c.tipo)}</span></td><td>${esc(c.origem || '—')}</td>
          <td><span class="chip ${esc(c.score_faixa)}">${c.score}</span></td>
          <td>${c.proxima_acao ? esc(c.proxima_acao) + (c.proxima_acao_em ? ' · ' + dataBr(c.proxima_acao_em) : '') : '—'}</td>
          <td><button class="btn peq secund c-abrir" data-id="${c.id}">Abrir</button></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="card">Nenhum contato ainda. Crie o primeiro ou importe um CSV.</div>';
      document.querySelectorAll('.c-abrir').forEach(a => a.onclick = (ev) => { ev.preventDefault(); abrirContato(a.dataset.id); });
    };
    let t; $('#c-busca').oninput = () => { clearTimeout(t); t = setTimeout(carregar, 300); };
    $('#c-tipo').onchange = carregar; $('#c-origem').onchange = carregar;
    $('#c-novo').onclick = () => dlgContato(cfg);
    $('#c-importar').onclick = () => dlgImportar();
    carregar();
  } catch (e) { erroTela(e); }
}
function dlgContato(cfg) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h3>Novo contato</h3>
    <div class="hi-grid"><label>Nome <input id="n-nome"></label><label>Sobrenome <input id="n-sobre"></label></div>
    <div class="hi-grid"><label>Telefone/WhatsApp <input id="n-tel" placeholder="61 9xxxx-xxxx"></label><label>E-mail <input id="n-email" type="email"></label></div>
    <div class="hi-grid">
      <label>Tipo <select id="n-tipo">${cfg.tipos.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label>Origem <select id="n-origem">${cfg.origens.map(o => `<option>${o}</option>`).join('')}</select></label>
    </div>
    <div class="hi-grid"><label>Interesse/produto <input id="n-prod"></label><label>Ticket potencial (R$) <input id="n-ticket" type="number" min="0"></label></div>
    <label>Primeira mensagem / observação <textarea id="n-obs" rows="2"></textarea></label>
    <label style="font-weight:400"><input type="checkbox" id="n-optin" checked style="width:auto;margin-right:6px">Tenho consentimento para contato (LGPD)</label>
    <button class="btn" id="n-salvar">Criar contato</button> <button class="btn secund" id="n-fechar">Cancelar</button><p id="n-msg" class="erro"></p>`;
  document.body.appendChild(dlg); dlg.showModal();
  $('#n-fechar').onclick = () => dlg.remove();
  $('#n-salvar').onclick = async () => {
    try {
      const r = await api('POST', '/app/contatos', {
        nome: $('#n-nome').value.trim(), sobrenome: $('#n-sobre').value.trim(), telefone: $('#n-tel').value.trim(),
        email: $('#n-email').value.trim(), tipo: $('#n-tipo').value, origem: $('#n-origem').value,
        produto_interesse: $('#n-prod').value.trim(), ticket_centavos: Math.round(Number($('#n-ticket').value || 0) * 100),
        primeira_mensagem: $('#n-obs').value.trim(),
        consentimento: { optIn: $('#n-optin').checked, base: 'cadastro-manual', em: new Date().toISOString() },
      });
      dlg.remove(); abrirContato(r.contato.id);
    } catch (e) { $('#n-msg').textContent = e.message; }
  };
}
function dlgImportar() {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h3>Importar contatos (CSV)</h3>
    <p class="sub" style="text-align:left">Cabeçalhos aceitos: nome, sobrenome, telefone, whatsapp, email, empresa, cargo, cidade, estado, tipo, origem, interesse, obs, tags. Separador ; ou ,. Duplicados (telefone/e-mail) são mesclados.</p>
    <input type="file" id="i-arq" accept=".csv,text/csv">
    <button class="btn" id="i-ok">Importar</button> <button class="btn secund" id="i-fechar">Cancelar</button><p id="i-msg"></p>`;
  document.body.appendChild(dlg); dlg.showModal();
  $('#i-fechar').onclick = () => dlg.remove();
  $('#i-ok').onclick = async () => {
    const f = $('#i-arq').files[0]; if (!f) return;
    try {
      const csv = await f.text();
      const r = await api('POST', '/app/contatos/importar', { csv });
      $('#i-msg').textContent = `✅ ${r.criados} criados, ${r.duplicados} mesclados, ${r.invalidos} inválidos.`;
      setTimeout(() => { dlg.remove(); vContatos(); }, 1500);
    } catch (e) { $('#i-msg').textContent = e.message; }
  };
}

// ---- ficha do contato ----
async function abrirContato(id) {
  try {
    const { contato: c } = await api('GET', '/app/contatos/' + id);
    const tl = (c.atividades || []).map(a => `<div class="lin"><span class="chip">${esc(a.tipo)}</span> ${esc(a.texto)}<br><span class="sub" style="margin:0;text-align:left">${dataBr(a.data)} ${String(a.data).slice(11, 16)} · ${esc(a.autor || '')}</span></div>`).join('') || '<p class="sub" style="text-align:left">Sem atividades.</p>';
    const kv = (r, v) => v ? `<div class="lin"><b>${r}:</b> ${v}</div>` : '';
    $('#tela').innerHTML = `
      <button class="btn peq secund" id="f-voltar">← Voltar</button>
      <div class="duas" style="margin-top:10px">
        <div class="card">
          <h3 style="margin:0">${esc(c.nome || c.telefone || 'Contato')} <span class="chip ${esc(c.score_faixa)}">${c.score} · ${esc(c.score_faixa)}</span></h3>
          <p class="sub" style="text-align:left;margin:4px 0 10px">${esc(c.tipo)} · ${esc(c.origem || 'origem?')}${c.campanha ? ' · ' + esc(c.campanha) : ''} · criado ${dataBr(c.criado_em)}</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            ${c.telefone ? `<a class="btn peq" target="_blank" rel="noopener" href="${waLink(c.telefone)}">💬 WhatsApp</a>` : ''}
            ${c.email ? `<a class="btn peq secund" href="mailto:${esc(c.email)}">✉️ E-mail</a>` : ''}
            ${c.telefone ? `<a class="btn peq secund" href="tel:+${esc(c.telefone)}">📞 Ligar</a>` : ''}
            <button class="btn peq secund" id="f-msg">💬 Mensagem por template</button>
            <button class="btn peq secund" id="f-ia">🤖 Qualificar</button>
          </div>
          ${kv('Telefone', esc(c.telefone))}${kv('E-mail', esc(c.email))}${kv('Empresa', esc(c.empresa_nome))}${kv('Cidade', esc([c.cidade, c.estado].filter(Boolean).join('/')))}
          ${kv('Interesse', esc(c.interesse))}${kv('Produto', esc(c.produto_interesse))}
          ${kv('Ticket potencial', c.ticket_centavos ? brl(c.ticket_centavos) : '')}
          ${kv('UTM', Object.keys(c.utm || {}).length ? esc(JSON.stringify(c.utm)) : '')}
          ${kv('Página de entrada', esc(c.pagina_entrada))}${kv('Primeira mensagem', esc(c.primeira_mensagem))}
          ${kv('Tags', (c.tags || []).map(t => '<span class="chip">' + esc(t) + '</span>').join(' '))}
          ${kv('LGPD', c.consentimento && c.consentimento.optIn === false ? '🚫 OPT-OUT — não contatar' : (c.consentimento && c.consentimento.optIn ? '✅ opt-in (' + esc(c.consentimento.base || '') + ')' : '—'))}
          <div style="margin-top:12px">
            <label>Responsável <input id="f-resp" value="${esc(c.responsavel)}"></label>
            <div class="hi-grid">
              <label>Próxima ação <input id="f-acao" value="${esc(c.proxima_acao)}"></label>
              <label>Prazo <input id="f-prazo" type="date" value="${esc(c.proxima_acao_em)}"></label>
              <label>Prioridade <select id="f-prio">${['alta', 'media', 'baixa'].map(p => `<option ${p === c.prioridade ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
            </div>
            <button class="btn peq" id="f-salvar">Salvar</button>
            <button class="btn peq secund" id="f-oport">+ Oportunidade</button>
            <button class="btn peq secund" id="f-tarefa">+ Tarefa</button>
            <button class="btn peq secund" id="f-proposta">+ Proposta</button>
            <button class="btn peq secund" id="f-optout">🚫 Opt-out</button>
          </div>
          <div style="margin-top:12px"><label>Registrar contato/nota <textarea id="f-nota" rows="2" placeholder="ex.: liguei, cliente vai decidir amanhã"></textarea></label>
            <select id="f-nota-tipo" style="width:auto"><option value="nota">nota</option><option value="mensagem-enviada">mensagem enviada</option><option value="mensagem-recebida">mensagem recebida</option><option value="ligacao">ligação</option><option value="email">e-mail</option></select>
            <button class="btn peq secund" id="f-add">Adicionar à timeline</button></div>
        </div>
        <div>
          ${(c.oportunidades || []).length ? `<div class="card" style="margin-bottom:12px"><b>Oportunidades</b>${c.oportunidades.map(o => `<div class="lin">${esc(o.titulo)} — ${esc(o.funil_nome)} · <span class="chip">${esc(o.estagio_nome)}</span> ${o.valor_centavos ? brl(o.valor_centavos) : ''}</div>`).join('')}</div>` : ''}
          ${(c.propostas || []).length ? `<div class="card" style="margin-bottom:12px"><b>Propostas</b>${c.propostas.map(p => `<div class="lin">${esc(p.titulo)} · ${brl(p.valor_centavos)} · <span class="chip">${esc(p.status)}</span>${p.token ? ` <a href="/crm/p/${esc(p.token)}" target="_blank">link</a>` : ''}</div>`).join('')}</div>` : ''}
          ${(c.tarefas || []).length ? `<div class="card" style="margin-bottom:12px"><b>Tarefas abertas</b>${c.tarefas.map(t => `<div class="lin">${esc(t.titulo)}${t.vence_em ? ' · ' + dataBr(t.vence_em) : ''}</div>`).join('')}</div>` : ''}
          <div class="card"><b>Linha do tempo</b>${tl}</div>
        </div>
      </div><div id="f-saida"></div>`;
    $('#f-voltar').onclick = () => vContatos();
    $('#f-salvar').onclick = async () => {
      try { await api('PATCH', '/app/contatos/' + id, { responsavel: $('#f-resp').value.trim(), proxima_acao: $('#f-acao').value.trim(), proxima_acao_em: $('#f-prazo').value, prioridade: $('#f-prio').value }); abrirContato(id); }
      catch (e) { alert(e.message); }
    };
    $('#f-add').onclick = async () => {
      const texto = $('#f-nota').value.trim(); if (!texto) return;
      try { await api('POST', `/app/contatos/${id}/atividade`, { tipo: $('#f-nota-tipo').value, texto }); abrirContato(id); } catch (e) { alert(e.message); }
    };
    $('#f-oport').onclick = () => dlgOportunidade(id);
    $('#f-tarefa').onclick = async () => {
      const titulo = prompt('Tarefa:'); if (!titulo) return;
      const vence = prompt('Prazo (AAAA-MM-DD, vazio = sem prazo):') || '';
      try { await api('POST', '/app/tarefas', { contato_id: id, titulo, vence_em: vence }); abrirContato(id); } catch (e) { alert(e.message); }
    };
    $('#f-proposta').onclick = () => dlgProposta(id);
    $('#f-optout').onclick = async () => {
      if (!confirm('Marcar opt-out (não contatar mais)?')) return;
      try { await api('PATCH', '/app/contatos/' + id, { consentimento: { optIn: false, base: 'opt-out', em: new Date().toISOString() } }); abrirContato(id); } catch (e) { alert(e.message); }
    };
    $('#f-msg').onclick = () => dlgTemplateEnvio(c);
    $('#f-ia').onclick = async () => {
      $('#f-saida').innerHTML = '<p class="sub">Analisando…</p>';
      try {
        const r = await api('POST', '/app/ia/qualificar/' + id);
        $('#f-saida').innerHTML = `<div class="card" style="margin-top:12px;border-left:4px solid var(--villela-gold)"><b>🤖 Agente de qualificação</b> <span class="sub" style="margin:0">(sugestão — revise antes de agir)</span>
          <div class="lin"><b>Perfil:</b> ${esc(r.perfil)}</div>
          <div class="lin"><b>Prioridade sugerida:</b> ${esc(r.prioridade_sugerida)} · <b>Chance:</b> ${esc(r.chance_conversao)}</div>
          ${r.dados_faltantes.length ? `<div class="lin"><b>Faltam:</b> ${r.dados_faltantes.map(esc).join(', ')}</div>` : ''}
          ${r.perguntas_sugeridas.length ? `<div class="lin"><b>Perguntar:</b> ${r.perguntas_sugeridas.map(esc).join(' · ')}</div>` : ''}
          <div class="lin"><b>Próxima ação:</b> ${esc(r.proxima_acao)}</div></div>`;
      } catch (e) { $('#f-saida').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
    };
  } catch (e) { erroTela(e); }
}
async function dlgTemplateEnvio(c) {
  const { templates } = await api('GET', '/app/templates');
  if (!templates.length) return alert('Nenhum template ativo. Crie na aba Templates.');
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h3>Mensagem por template</h3>
    <label>Template <select id="te-sel">${templates.map(t => `<option value="${t.id}">${esc(t.nome)} (${esc(t.canal)})</option>`).join('')}</select></label>
    <textarea id="te-corpo" rows="6"></textarea>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${c.telefone ? `<a class="btn peq" id="te-wa" target="_blank" rel="noopener">💬 Abrir no WhatsApp</a>` : ''}
      ${c.email ? `<a class="btn peq secund" id="te-mail">✉️ Abrir e-mail</a>` : ''}
      <button class="btn peq secund" id="te-copiar">📋 Copiar</button>
      <button class="btn peq secund" id="te-reg">Registrar como enviada</button>
      <button class="btn peq secund" id="te-fechar">Fechar</button>
    </div>`;
  document.body.appendChild(dlg); dlg.showModal();
  let assunto = '';
  const render = async () => {
    const r = await api('POST', `/app/templates/${$('#te-sel').value}/render`, { contato_id: c.id });
    $('#te-corpo').value = r.corpo; assunto = r.assunto || '';
    const wa = $('#te-wa'); if (wa) wa.href = waLink(c.telefone, r.corpo);
    const ml = $('#te-mail'); if (ml) ml.href = `mailto:${c.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(r.corpo)}`;
  };
  $('#te-sel').onchange = render; await render();
  $('#te-copiar').onclick = () => navigator.clipboard.writeText($('#te-corpo').value).then(() => { $('#te-copiar').textContent = '✓ Copiado'; });
  $('#te-reg').onclick = async () => { await api('POST', `/app/contatos/${c.id}/atividade`, { tipo: 'mensagem-enviada', canal: 'whatsapp', texto: $('#te-corpo').value.slice(0, 500) }); dlg.remove(); abrirContato(c.id); };
  $('#te-fechar').onclick = () => dlg.remove();
}

// ---------------- TAREFAS ----------------
async function vTarefas() {
  carregando();
  try {
    const cx = await api('GET', '/app/tarefas/caixa');
    const bloco = (titulo, lista, cor) => `<div class="card" style="margin-bottom:12px;border-left:4px solid ${cor}"><b>${titulo} (${lista.length})</b>
      ${lista.map(t => `<div class="lin">${esc(t.titulo)}${t.contato_nome ? ' — <a href="#" class="t-c" data-id="' + t.contato_id + '">' + esc(t.contato_nome) + '</a>' : ''}
        ${t.vence_em ? ' · ' + dataBr(t.vence_em) : ''} <span class="chip">${esc(t.origem || t.tipo || '')}</span>
        <button class="btn peq secund t-ok" data-id="${t.id}" style="float:right">✓ Concluir</button></div>`).join('') || '<p class="sub" style="text-align:left">Nada aqui. 🎉</p>'}</div>`;
    $('#tela').innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn peq" id="t-nova">+ Nova tarefa</button>
      <button class="btn peq secund" id="t-auto">⚙️ Rodar automações agora</button></div>
      ${bloco('🔴 Atrasadas', cx.atrasadas, '#b00020')}
      ${bloco('🟡 Para hoje', cx.hoje, '#C9A227')}
      ${bloco('📄 Propostas sem resposta', cx.propostas_sem_resposta.map(p => ({ ...p, titulo: p.titulo + ' · ' + brl(p.valor_centavos) })), '#7C3AED')}
      ${bloco('🧊 Leads parados (7+ dias, negócio aberto)', cx.leads_parados.map(l => ({ titulo: (l.nome || l.telefone) + ' · score ' + l.score, contato_id: l.id, contato_nome: '', id: '' })), '#0E7490')}
      ${bloco('⏭ Próximas', cx.proximas, '#E2E6EC')}`;
    document.querySelectorAll('.t-ok').forEach(b => b.onclick = async () => { if (!b.dataset.id) return; try { await api('POST', `/app/tarefas/${b.dataset.id}/concluir`); vTarefas(); } catch (e) { alert(e.message); } });
    document.querySelectorAll('.t-c').forEach(a => a.onclick = (ev) => { ev.preventDefault(); abrirContato(a.dataset.id); });
    $('#t-nova').onclick = async () => {
      const titulo = prompt('Tarefa:'); if (!titulo) return;
      const vence = prompt('Prazo (AAAA-MM-DD, vazio = sem prazo):') || '';
      try { await api('POST', '/app/tarefas', { titulo, vence_em: vence }); vTarefas(); } catch (e) { alert(e.message); }
    };
    $('#t-auto').onclick = async () => {
      try { const r = await api('POST', '/app/automacoes/rodar'); alert(`Automações: ${r.tarefas_criadas} tarefa(s) criada(s), ${r.propostas_vencidas} proposta(s) vencida(s), ${r.priorizados} lead(s) priorizado(s).`); vTarefas(); }
      catch (e) { alert(e.message); }
    };
  } catch (e) { erroTela(e); }
}

// ---------------- TEMPLATES ----------------
async function vTemplates() {
  carregando();
  try {
    const { templates, variaveis } = await api('GET', '/app/templates?ativo=todos');
    $('#tela').innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn peq" id="tp-novo">+ Novo template</button></div>
      <p class="sub" style="text-align:left">Variáveis: ${variaveis.map(v => `<code>{{${v}}}</code>`).join(' ')}</p>
      <div class="grid">${templates.map(t => `<div class="card">
        <b>${esc(t.nome)}</b> <span class="chip">${esc(t.canal)}</span> ${t.categoria ? `<span class="chip">${esc(t.categoria)}</span>` : ''} ${!t.ativo ? '<span class="chip" style="background:#eee;color:#777">inativo</span>' : ''}
        ${t.assunto ? `<div class="sub" style="text-align:left;margin:4px 0"><b>Assunto:</b> ${esc(t.assunto)}</div>` : ''}
        <p style="white-space:pre-wrap;font-size:.85rem">${esc(t.corpo)}</p>
        <button class="btn peq secund tp-edit" data-id="${t.id}">Editar</button></div>`).join('') || '<div class="card">Nenhum template.</div>'}</div>`;
    const editar = (t) => {
      const dlg = document.createElement('dialog');
      dlg.innerHTML = `<h3>${t ? 'Editar' : 'Novo'} template</h3>
        <div class="hi-grid"><label>Nome <input id="tp-nome" value="${esc(t ? t.nome : '')}"></label>
        <label>Canal <select id="tp-canal">${['whatsapp', 'email', 'sms', 'outro'].map(c => `<option ${t && t.canal === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label>Categoria <input id="tp-cat" value="${esc(t ? t.categoria : '')}" placeholder="followup, orcamento…"></label></div>
        <label>Assunto (e-mail) <input id="tp-ass" value="${esc(t ? t.assunto : '')}"></label>
        <label>Corpo <textarea id="tp-corpo" rows="6">${esc(t ? t.corpo : '')}</textarea></label>
        ${t ? `<label style="font-weight:400"><input type="checkbox" id="tp-ativo" ${t.ativo ? 'checked' : ''} style="width:auto;margin-right:6px">Ativo</label>` : ''}
        <button class="btn" id="tp-salvar">Salvar</button> <button class="btn secund" id="tp-fechar">Cancelar</button><p id="tp-msg" class="erro"></p>`;
      document.body.appendChild(dlg); dlg.showModal();
      $('#tp-fechar').onclick = () => dlg.remove();
      $('#tp-salvar').onclick = async () => {
        const corpo = { nome: $('#tp-nome').value.trim(), canal: $('#tp-canal').value, categoria: $('#tp-cat').value.trim(), assunto: $('#tp-ass').value.trim(), corpo: $('#tp-corpo').value };
        if (t) corpo.ativo = $('#tp-ativo').checked;
        try { await api(t ? 'PATCH' : 'POST', '/app/templates' + (t ? '/' + t.id : ''), corpo); dlg.remove(); vTemplates(); }
        catch (e) { $('#tp-msg').textContent = e.message; }
      };
    };
    $('#tp-novo').onclick = () => editar(null);
    document.querySelectorAll('.tp-edit').forEach(b => b.onclick = () => editar(templates.find(x => x.id === b.dataset.id)));
  } catch (e) { erroTela(e); }
}

// ---------------- PROPOSTAS ----------------
async function vPropostas() {
  carregando();
  try {
    const { propostas } = await api('GET', '/app/propostas');
    $('#tela').innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn peq" id="pp-nova">+ Nova proposta</button></div>
      <div class="card" style="padding:8px;overflow-x:auto"><table>
      <thead><tr><th>Título</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Validade</th><th></th></tr></thead><tbody>
      ${propostas.map(p => `<tr><td><b>${esc(p.titulo)}</b></td><td><a href="#" class="pp-c" data-id="${p.contato_id}">${esc(p.contato_nome || '')}</a></td>
        <td>${brl(p.valor_centavos - (p.desconto_centavos || 0))}</td><td><span class="chip">${esc(p.status)}</span></td><td>${p.validade ? dataBr(p.validade) : '—'}</td>
        <td>${p.status === 'rascunho' ? `<button class="btn peq pp-env" data-id="${p.id}">📤 Enviar</button>` : ''}
        ${p.token ? `<a class="btn peq secund" href="/crm/p/${esc(p.token)}" target="_blank">🔗 Link</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="6">Nenhuma proposta.</td></tr>'}
      </tbody></table></div>`;
    $('#pp-nova').onclick = () => dlgProposta();
    document.querySelectorAll('.pp-c').forEach(a => a.onclick = (ev) => { ev.preventDefault(); abrirContato(a.dataset.id); });
    document.querySelectorAll('.pp-env').forEach(b => b.onclick = async () => { try { await api('POST', `/app/propostas/${b.dataset.id}/enviar`); vPropostas(); } catch (e) { alert(e.message); } });
  } catch (e) { erroTela(e); }
}
async function dlgProposta(contatoId) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h3>Nova proposta</h3>
    ${contatoId ? '' : `<label>Contato <input id="pr-busca" placeholder="busque pelo nome"><div id="pr-lista"></div><input type="hidden" id="pr-contato"></label>`}
    <label>Título <input id="pr-titulo" placeholder="ex.: Hospedagem Villa Kubitschek — 4 noites"></label>
    <label>Descrição do item <input id="pr-item" placeholder="ex.: 4 noites · casa inteira · 12 hóspedes"></label>
    <div class="hi-grid"><label>Valor (R$) <input id="pr-valor" type="number" min="0" step="10"></label>
    <label>Desconto (R$) <input id="pr-desc" type="number" min="0" step="10"></label>
    <label>Validade <input id="pr-val" type="date"></label></div>
    <label>Condições <textarea id="pr-cond" rows="2" placeholder="ex.: sinal de 50% para reservar; saldo até 7 dias antes"></textarea></label>
    <label>Link de pagamento (opcional) <input id="pr-pag"></label>
    <button class="btn" id="pr-salvar">Criar rascunho</button> <button class="btn secund" id="pr-fechar">Cancelar</button><p id="pr-msg" class="erro"></p>`;
  document.body.appendChild(dlg); dlg.showModal();
  if (!contatoId) {
    let t; $('#pr-busca').oninput = () => { clearTimeout(t); t = setTimeout(async () => {
      const b = $('#pr-busca').value.trim(); if (b.length < 2) return;
      const { contatos } = await api('GET', '/app/contatos?busca=' + encodeURIComponent(b) + '&limite=8');
      $('#pr-lista').innerHTML = contatos.map(c => `<button class="btn peq secund" data-id="${c.id}" style="margin:2px">${esc(c.nome || c.telefone)}</button>`).join('');
      $('#pr-lista').querySelectorAll('button').forEach(bt => bt.onclick = () => { $('#pr-contato').value = bt.dataset.id; $('#pr-busca').value = bt.textContent; $('#pr-lista').innerHTML = ''; });
    }, 300); };
  }
  $('#pr-fechar').onclick = () => dlg.remove();
  $('#pr-salvar').onclick = async () => {
    try {
      await api('POST', '/app/propostas', {
        contato_id: contatoId || $('#pr-contato').value, titulo: $('#pr-titulo').value.trim(),
        itens: [{ descricao: $('#pr-item').value.trim() || $('#pr-titulo').value.trim(), qtd: 1, valor_centavos: Math.round(Number($('#pr-valor').value || 0) * 100) }],
        desconto_centavos: Math.round(Number($('#pr-desc').value || 0) * 100),
        validade: $('#pr-val').value, condicoes: $('#pr-cond').value.trim(), link_pagamento: $('#pr-pag').value.trim(),
      });
      dlg.remove(); vPropostas();
    } catch (e) { $('#pr-msg').textContent = e.message; }
  };
}

// ---------------- CAMPANHAS ----------------
async function vCampanhas() {
  carregando();
  try {
    const { campanhas } = await api('GET', '/app/campanhas');
    $('#tela').innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn peq" id="cp-nova">+ Nova campanha</button></div>
      <p class="sub" style="text-align:left">Campanhas semiautomáticas: você define o segmento, o CRM monta a lista com a mensagem pronta e você dispara um a um (opt-out respeitado automaticamente).</p>
      <div class="grid">${campanhas.map(c => `<div class="card"><b>${esc(c.nome)}</b> <span class="chip">${esc(c.tipo)}</span> <span class="chip">${esc(c.status)}</span>
        <p class="sub" style="text-align:left;margin:6px 0">${c.alvos} alvo(s) · ${c.enviados} enviado(s) · ${c.respondidos} respondeu(ram)</p>
        <button class="btn peq secund cp-abrir" data-id="${c.id}" data-msg="${esc(c.mensagem)}">Trabalhar lista</button></div>`).join('') || '<div class="card">Nenhuma campanha.</div>'}</div>
      <div id="cp-alvos"></div>`;
    $('#cp-nova').onclick = () => dlgCampanha();
    document.querySelectorAll('.cp-abrir').forEach(b => b.onclick = () => abrirCampanha(b.dataset.id, b.dataset.msg));
  } catch (e) { erroTela(e); }
}
function dlgCampanha() {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<h3>Nova campanha</h3>
    <label>Nome <input id="ca-nome" placeholder="ex.: Reativação ex-hóspedes julho"></label>
    <div class="hi-grid">
      <label>Tipo <select id="ca-tipo">${['whatsapp', 'email', 'tarefa', 'ligacao'].map(t => `<option>${t}</option>`).join('')}</select></label>
      <label>Tipo de contato <input id="ca-seg-tipo" placeholder="ex.: hospede (vazio = todos)"></label>
      <label>Origem <input id="ca-seg-origem" placeholder="ex.: indicacao"></label>
      <label>Score mínimo <input id="ca-seg-score" type="number" min="0" max="100"></label>
      <label>Dias sem interação <input id="ca-seg-dias" type="number" min="0" placeholder="ex.: 90"></label>
      <label>Cidade <input id="ca-seg-cidade"></label>
    </div>
    <label>Mensagem (use {{nome}} etc.) <textarea id="ca-msg" rows="4"></textarea></label>
    <button class="btn" id="ca-salvar">Gerar lista</button> <button class="btn secund" id="ca-fechar">Cancelar</button><p id="ca-msg2" class="erro"></p>`;
  document.body.appendChild(dlg); dlg.showModal();
  $('#ca-fechar').onclick = () => dlg.remove();
  $('#ca-salvar').onclick = async () => {
    const seg = {};
    if ($('#ca-seg-tipo').value.trim()) seg.tipo = $('#ca-seg-tipo').value.trim();
    if ($('#ca-seg-origem').value.trim()) seg.origem = $('#ca-seg-origem').value.trim();
    if ($('#ca-seg-score').value) seg.score_min = $('#ca-seg-score').value;
    if ($('#ca-seg-dias').value) seg.dias_sem_interacao = $('#ca-seg-dias').value;
    if ($('#ca-seg-cidade').value.trim()) seg.cidade = $('#ca-seg-cidade').value.trim();
    try { await api('POST', '/app/campanhas', { nome: $('#ca-nome').value.trim(), tipo: $('#ca-tipo').value, segmento: seg, mensagem: $('#ca-msg').value }); dlg.remove(); vCampanhas(); }
    catch (e) { $('#ca-msg2').textContent = e.message; }
  };
}
async function abrirCampanha(id, mensagem) {
  const { alvos } = await api('GET', `/app/campanhas/${id}/alvos`);
  $('#cp-alvos').innerHTML = `<div class="card" style="margin-top:14px"><b>Lista da campanha</b> (${alvos.length})
    ${alvos.map(a => {
      const msg = (mensagem || '').replace(/\{\{nome\}\}/g, (a.nome || '').split(' ')[0]);
      return `<div class="lin">${esc(a.nome || a.telefone)} <span class="chip ${faixa(a.score)}">${a.score}</span> <span class="chip">${esc(a.status)}</span>
      ${a.telefone && a.status === 'pendente' ? `<a class="btn peq" target="_blank" rel="noopener" href="${waLink(a.telefone, msg)}">💬 Enviar</a>` : ''}
      ${a.status === 'pendente' ? `<button class="btn peq secund cp-mark" data-id="${a.id}" data-st="enviado">✓ Enviado</button>
      <button class="btn peq secund cp-mark" data-id="${a.id}" data-st="pulado">Pular</button>` : ''}
      ${a.status === 'enviado' ? `<button class="btn peq secund cp-mark" data-id="${a.id}" data-st="respondido">💬 Respondeu</button>` : ''}</div>`;
    }).join('')}</div>`;
  document.querySelectorAll('.cp-mark').forEach(b => b.onclick = async () => {
    try { await api('POST', `/app/campanha-alvos/${b.dataset.id}`, { status: b.dataset.st }); abrirCampanha(id, mensagem); } catch (e) { alert(e.message); }
  });
}

// ---------------- AGENTES (IA) ----------------
async function vIA() {
  carregando();
  try {
    $('#tela').innerHTML = `
      <p class="sub" style="text-align:left">Agentes analisam sua base e devolvem <b>sugestões</b> — nada é enviado sem você. Toda execução fica registrada.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn peq" id="ia-fu">🔁 Follow-ups sugeridos</button>
        <button class="btn peq" id="ia-re">♻️ Reativação</button>
        <button class="btn peq" id="ia-pe">📉 Análise de perdas</button>
      </div><div id="ia-saida"></div><div id="ia-logs"></div>`;
    const saida = $('#ia-saida');
    $('#ia-fu').onclick = async () => {
      saida.innerHTML = '<p class="sub">Analisando…</p>';
      const r = await api('POST', '/app/ia/followups').catch(e => { saida.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return null; });
      if (!r) return;
      saida.innerHTML = `<div class="card"><b>🔁 Follow-ups sugeridos (${r.sugestoes.length})</b>
        ${r.sugestoes.map(sg => `<div class="lin"><b>${esc(sg.nome || sg.telefone)}</b> · parado há ${sg.dias_parado}d · score ${sg.score}<br>
          <span class="sub" style="text-align:left;margin:0">${esc(sg.mensagem)}</span><br>
          ${sg.telefone ? `<a class="btn peq" target="_blank" rel="noopener" href="${waLink(sg.telefone, sg.mensagem)}">💬 Enviar</a>` : ''}
          <a href="#" class="t-c" data-id="${sg.contato_id}">abrir ficha</a></div>`).join('') || '<p class="sub" style="text-align:left">Nenhum lead parado. 🎉</p>'}</div>`;
      document.querySelectorAll('.t-c').forEach(a => a.onclick = (ev) => { ev.preventDefault(); abrirContato(a.dataset.id); });
    };
    $('#ia-re').onclick = async () => {
      saida.innerHTML = '<p class="sub">Analisando…</p>';
      const r = await api('POST', '/app/ia/reativacao').catch(e => { saida.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return null; });
      if (!r) return;
      saida.innerHTML = `<div class="card"><b>♻️ Candidatos à reativação (${r.candidatos.length})</b>
        ${r.candidatos.map(c => `<div class="lin"><b>${esc(c.nome || c.telefone)}</b> · ${esc(c.tipo)} · último contato ${dataBr(c.ultima_interacao)}${c.ticket_centavos ? ' · ' + brl(c.ticket_centavos) : ''}
          <a href="#" class="t-c" data-id="${c.id}">abrir</a></div>`).join('') || '<p class="sub" style="text-align:left">Ninguém para reativar agora.</p>'}</div>`;
      document.querySelectorAll('.t-c').forEach(a => a.onclick = (ev) => { ev.preventDefault(); abrirContato(a.dataset.id); });
    };
    $('#ia-pe').onclick = async () => {
      saida.innerHTML = '<p class="sub">Analisando…</p>';
      const r = await api('POST', '/app/ia/perdas').catch(e => { saida.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return null; });
      if (!r) return;
      saida.innerHTML = `<div class="card"><b>📉 Análise de perdas</b>
        ${r.motivos.map(m => `<div class="lin">${esc(m.motivo)} — ${m.n}×</div>`).join('') || '<p class="sub" style="text-align:left">Sem perdas com motivo registrado.</p>'}
        ${r.sugestoes.map(sg => `<div class="lin">💡 ${esc(sg)}</div>`).join('')}</div>`;
    };
    const { logs } = await api('GET', '/app/ia/logs?n=20').catch(() => ({ logs: [] }));
    $('#ia-logs').innerHTML = logs.length ? `<div class="card" style="margin-top:14px"><b>Execuções recentes</b>
      ${logs.map(l => `<div class="lin"><span class="chip">${esc(l.agente)}</span> ${dataBr(l.criado_em)} ${String(l.criado_em).slice(11, 16)} · motor ${esc(l.motor)} · ${esc(l.status)}</div>`).join('')}</div>` : '';
  } catch (e) { erroTela(e); }
}

// ---------------- CONTA (equipe / plano / integrações) ----------------
async function vConta() {
  carregando();
  try {
    const [cob, eq, cfg] = await Promise.all([
      api('GET', '/cobranca'), api('GET', '/equipe'), api('GET', '/app/config').catch(() => null)]);
    const planoAtual = cob.plano ? cob.plano.slug : '';
    $('#tela').innerHTML = `
      <div class="duas">
        <div class="card"><b>💳 Plano e cobrança</b>
          <div class="lin">Plano atual: <b>${esc(cob.plano ? cob.plano.nome : '—')}</b> · status <span class="chip">${esc(cob.status_tenant)}</span></div>
          ${cob.trial_expira_em ? `<div class="lin">Trial até ${dataBr(cob.trial_expira_em)}</div>` : ''}
          <div class="lin">Assinar/trocar:
            ${cob.planos_disponiveis.map(p => `<button class="btn peq ${p.slug === planoAtual ? 'secund' : ''} cb-plano" data-p="${p.slug}" style="margin:2px">${esc(p.nome)} ${p.preco_centavos ? '· ' + brl(p.preco_centavos) + '/mês' : ''}</button>`).join('')}
          </div>
          ${!cob.mp_ativo ? '<p class="aviso">Pagamento online indisponível — fale com o suporte (aba abaixo) para ativar seu plano.</p>' : ''}
          ${cob.faturas.length ? `<div class="lin"><b>Faturas:</b> ${cob.faturas.map(f => `<span class="chip">${esc(f.competencia)} ${brl(f.valor_centavos)} ${esc(f.status)}</span>`).join(' ')}</div>` : ''}
        </div>
        <div class="card"><b>👥 Equipe</b> <span class="sub" style="margin:0">(papéis: ${esc(eq.papeis.join(', '))})</span>
          ${eq.usuarios.map(u => `<div class="lin">${esc(u.nome || u.email)} · <span class="chip">${esc(u.papel)}</span> ${u.ativo ? '' : '· inativo'}</div>`).join('')}
          <div style="margin-top:8px"><div class="hi-grid">
            <label>Nome <input id="eq-nome"></label><label>E-mail <input id="eq-email" type="email"></label>
            <label>Papel <select id="eq-papel">${eq.papeis.filter(p => p !== 'owner').map(p => `<option>${p}</option>`).join('')}</select></label></div>
          <button class="btn peq" id="eq-add">+ Adicionar usuário</button><p id="eq-msg" class="sub" style="text-align:left"></p></div>
        </div>
        ${cfg ? `<div class="card"><b>🔗 Captação de leads</b>
          <div class="lin"><b>Webhook de entrada</b> (formulários, Make/n8n/Zapier):<br><code style="font-size:.78rem;word-break:break-all">POST ${location.origin}/crm/webhook/${esc(cfg.webhook_token)}</code></div>
          <div class="lin sub" style="text-align:left">Envie JSON com nome, telefone, email, origem, utm, primeira_mensagem… O lead entra deduplicado e com procedência.</div>
          <div class="lin"><b>Chaves de API</b> <button class="btn peq secund" id="ak-nova">+ Gerar chave</button><div id="ak-lista"></div></div>
        </div>` : ''}
        <div class="card"><b>🎫 Suporte</b><div id="tk-lista"></div>
          <label>Assunto <input id="tk-ass"></label><label>Mensagem <textarea id="tk-txt" rows="2"></textarea></label>
          <button class="btn peq" id="tk-abrir">Abrir ticket</button>
        </div>
      </div>`;
    document.querySelectorAll('.cb-plano').forEach(b => b.onclick = async () => {
      if (!confirm(`Assinar o plano ${b.dataset.p}?`)) return;
      try { const r = await api('POST', '/cobranca/assinar', { plano: b.dataset.p }); if (r.link) location.href = r.link; }
      catch (e) { alert(e.message); }
    });
    $('#eq-add').onclick = async () => {
      try {
        const r = await api('POST', '/equipe', { nome: $('#eq-nome').value.trim(), email: $('#eq-email').value.trim(), papel: $('#eq-papel').value });
        $('#eq-msg').innerHTML = `✅ Criado. Link p/ definir senha: <a href="${esc(r.link_setup)}">${esc(r.link_setup)}</a>`;
      } catch (e) { $('#eq-msg').textContent = e.message; }
    };
    const carregarChaves = async () => {
      const { chaves } = await api('GET', '/app/chaves').catch(() => ({ chaves: [] }));
      $('#ak-lista').innerHTML = chaves.map(k => `<div class="lin"><code>${esc(k.chave_mascarada)}</code> ${esc(k.nome)} ${k.ativo ? '' : '· revogada'}</div>`).join('');
    };
    if ($('#ak-nova')) {
      $('#ak-nova').onclick = async () => {
        try { const r = await api('POST', '/app/chaves', { nome: 'painel' }); alert('Chave criada (copie agora, não será exibida de novo):\n\n' + r.chave); carregarChaves(); }
        catch (e) { alert(e.message); }
      };
      carregarChaves();
    }
    const carregarTickets = async () => {
      const { tickets } = await api('GET', '/tickets');
      $('#tk-lista').innerHTML = tickets.map(t => `<div class="lin">${esc(t.assunto)} · <span class="chip">${esc(t.status)}</span></div>`).join('');
    };
    $('#tk-abrir').onclick = async () => {
      try { await api('POST', '/tickets', { assunto: $('#tk-ass').value.trim(), texto: $('#tk-txt').value.trim() }); $('#tk-ass').value = ''; $('#tk-txt').value = ''; carregarTickets(); }
      catch (e) { alert(e.message); }
    };
    carregarTickets();
  } catch (e) { erroTela(e); }
}
