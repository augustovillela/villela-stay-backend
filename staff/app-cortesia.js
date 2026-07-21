'use strict';
// ============================================================================
// Portal Staff — módulo: app-cortesia (Acessos de Teste / Cortesia)
// Central ÚNICA para criar / listar / revogar acessos VITALÍCIOS de teste
// (beta) nos SaaS — sem cadastro do testador, sem pagamento, com dados de
// exemplo. Fala o contrato uniforme /staff/api/<pref>/cortesia de cada produto.
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================
const CORTESIA_PRODUTOS = [
  { chave: 'crm', pref: 'vcrm', nome: 'Villela CRM', emoji: '🤝', painel: '/crm/app' },
  { chave: 'vsm', pref: 'vsm', nome: 'Villela Stay Manager', emoji: '🏨', painel: '/gestao/app' },
  { chave: 'legal-saas', pref: 'legal-saas', nome: 'Villela Legal SaaS', emoji: '⚖️', painel: '/juridico/app' },
  { chave: 'vdocs', pref: 'vdocs', nome: 'Villela Docs', emoji: '🗂️', painel: '/vdocs/app' },
  { chave: 'vpe', pref: 'vpe', nome: 'Villela Projects', emoji: '📋', painel: '/vpe/app' },
  { chave: 'academy', pref: 'academy', nome: 'Villela Academy', emoji: '🎓', painel: '/academy/app', tipo: 'usuario' },
];
const cortesiaProd = (chave) => CORTESIA_PRODUTOS.find(p => p.chave === chave);

async function renderCortesia() {
  conteudo().innerHTML = cabecalho('🎟️ Acessos de Teste (Cortesia)',
    'Crie logins vitalícios de teste (beta) nos SaaS — sem cadastro, sem pagamento, com dados de exemplo. '
    + 'Para você testar como cliente e para amigos/parentes darem feedback. Revogue quando quiser (reversível).')
    + `<div id="ct-cards" class="cards"></div>
       <details class="cr-box" open><summary class="cr-sum">➕ Novo acesso de cortesia</summary>
         <form class="form" id="ct-form" style="max-width:700px;margin-top:12px">
           <div class="hi-grid">
             <label>Nome <input id="ct-nome" placeholder="Ex.: João (primo)"></label>
             <label>E-mail * <input id="ct-email" type="email" required placeholder="pessoa@exemplo.com"></label>
           </div>
           <fieldset style="border:1px solid var(--linha,#ddd);border-radius:8px;padding:10px;margin:10px 0">
             <legend style="padding:0 6px">Liberar em quais produtos?</legend>
             <label style="display:inline-block;margin:2px 14px 2px 0"><input type="checkbox" class="ct-prod" value="__all" checked> <b>Todos</b></label>
             ${CORTESIA_PRODUTOS.map(p => `<label style="display:inline-block;margin:2px 14px 2px 0"><input type="checkbox" class="ct-prod" value="${esc(p.chave)}" checked> ${p.emoji} ${esc(p.nome)}</label>`).join('')}
           </fieldset>
           <label style="display:block;margin-bottom:8px"><input type="checkbox" id="ct-demo" checked> Popular com dados de exemplo (demo)</label>
           <button class="btn" type="submit">Criar acesso(s)</button><p id="ct-msg" class="erro"></p>
         </form>
       </details>
       <div id="ct-result"></div>
       <div id="ct-corpo"><p class="vazio">Carregando…</p></div>`;

  document.querySelectorAll('.ct-prod').forEach(cb => cb.onchange = () => {
    if (cb.value === '__all') document.querySelectorAll('.ct-prod').forEach(x => { if (x.value !== '__all') x.checked = cb.checked; });
    else if (!cb.checked) { const a = document.querySelector('.ct-prod[value="__all"]'); if (a) a.checked = false; }
  });

  $('#ct-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const msg = $('#ct-msg'); msg.textContent = ''; msg.className = 'erro';
    const email = $('#ct-email').value.trim(), nome = $('#ct-nome').value.trim();
    if (!email) { msg.textContent = 'Informe o e-mail do testador.'; return; }
    const alvos = CORTESIA_PRODUTOS.filter(p => { const cb = document.querySelector(`.ct-prod[value="${p.chave}"]`); return cb && cb.checked; });
    if (!alvos.length) { msg.textContent = 'Selecione ao menos um produto.'; return; }
    const seed = $('#ct-demo').checked;
    const btn = $('#ct-form').querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Criando…';
    const resultados = [];
    for (const p of alvos) {
      try { const r = await api('POST', `/${p.pref}/cortesia`, { nome, email, seed_demo: seed }); resultados.push({ p, r }); }
      catch (e) { resultados.push({ p, erro: e.message }); }
    }
    btn.disabled = false; btn.textContent = 'Criar acesso(s)';
    cortesiaResultados(email, resultados);
    cortesiaCarregar();
  };
  cortesiaCarregar();
}

// Painel com os links de acesso recém-criados (copiar e enviar ao testador).
function cortesiaResultados(email, resultados) {
  const box = $('#ct-result'); if (!box) return;
  const linha = ({ p, r, erro }) => {
    if (erro) return `<tr><td>${p.emoji} ${esc(p.nome)}</td><td class="erro">${esc(erro)}</td></tr>`;
    const a = (r && r.acesso) || {};
    const painel = a.painel_url || p.painel;
    let acesso;
    if (a.definir_senha_url) acesso = `<input class="ct-copia" readonly value="${esc(a.definir_senha_url)}" style="width:100%;font-size:.82rem"> <button class="btn peq secund ct-btcopia" data-v="${esc(a.definir_senha_url)}">copiar link</button><br><span class="obs">o testador define a própria senha (${esc(a.validade_link || 'validade limitada')})</span>`;
    else if (a.senha_temporaria) acesso = `senha temporária: <code>${esc(a.senha_temporaria)}</code>`;
    else acesso = '<span class="obs">acesso criado</span>';
    return `<tr><td>${p.emoji} <b>${esc(p.nome)}</b><br><span class="obs">painel: <a href="${esc(painel)}" target="_blank" rel="noopener">${esc(painel)}</a></span></td><td>${acesso}</td></tr>`;
  };
  box.innerHTML = `<div class="cr-box" style="margin:12px 0;padding:12px;border-left:4px solid var(--ok,#2e7d32)">
    <b>✅ Acesso(s) criado(s) para ${esc(email)}</b> — copie o link e envie ao testador:
    <table style="margin-top:8px"><tbody>${resultados.map(linha).join('')}</tbody></table></div>`;
  box.querySelectorAll('.ct-btcopia').forEach(b => b.onclick = () => {
    navigator.clipboard.writeText(b.dataset.v).then(() => { b.textContent = 'copiado ✓'; setTimeout(() => b.textContent = 'copiar link', 1500); });
  });
  box.querySelectorAll('.ct-copia').forEach(i => i.onclick = () => i.select());
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function cortesiaCarregar() {
  const corpo = $('#ct-corpo'); if (!corpo) return;
  const listas = await Promise.all(CORTESIA_PRODUTOS.map(async p => {
    try { const r = await api('GET', `/${p.pref}/cortesia`); return { p, acessos: (r && r.acessos) || [] }; }
    catch (e) { return { p, erro: e.message, acessos: [] }; }
  }));
  const total = listas.reduce((n, l) => n + l.acessos.length, 0);
  const card = (n, rot) => `<div class="card"><div class="n">${n}</div><div class="rot">${rot}</div></div>`;
  $('#ct-cards').innerHTML = listas.map(l => card(l.acessos.length, `${l.p.emoji} ${esc(l.p.nome)}`)).join('')
    + card(total, 'Total de acessos');

  corpo.innerHTML = listas.map(({ p, acessos, erro }) => {
    const tit = `<h2 class="titulo" style="font-size:1.02rem">${p.emoji} ${esc(p.nome)}${acessos.length ? ` <span class="obs">(${acessos.length})</span>` : ''}</h2>`;
    if (erro) return tit + `<p class="erro">${esc(erro)}</p>`;
    if (!acessos.length) return tit + '<p class="vazio">Nenhum acesso de cortesia.</p>';
    const linhaA = (a) => {
      const nome = a.nome || a.email || a.email_contato || a.id;
      const email = a.email_contato || a.email || '';
      const revogado = a.status === 'suspensa' || a.status === 'cancelada' || a.ativo === 0 || a.ativo === false || a.revogado === true;
      const extra = (a.produtos_liberados != null) ? `<span class="obs"> · ${esc(String(a.produtos_liberados))} produto(s)</span>` : '';
      return `<tr>
        <td><b>${esc(nome)}</b>${extra}${email ? `<br><span class="obs">${esc(email)}</span>` : ''}</td>
        <td>${revogado ? '<span class="badge st-erro">revogado</span>' : '<span class="badge st-feito">ativo</span>'}</td>
        <td>
          <a class="btn peq secund" href="${esc(p.painel)}" target="_blank" rel="noopener">painel ↗</a>
          ${revogado
            ? `<button class="btn peq secund ct-reativar" data-pref="${esc(p.pref)}" data-id="${esc(a.id)}">reativar</button>`
            : `<button class="btn peq secund ct-revogar" data-pref="${esc(p.pref)}" data-id="${esc(a.id)}">revogar</button>`}
        </td></tr>`;
    };
    return tit + `<table><tbody>${acessos.map(linhaA).join('')}</tbody></table>`;
  }).join('');

  corpo.querySelectorAll('.ct-revogar').forEach(b => b.onclick = async () => {
    if (!confirm('Revogar este acesso de cortesia? O testador perde o acesso imediatamente (reversível pelo botão reativar).')) return;
    try { await api('POST', `/${b.dataset.pref}/cortesia/${encodeURIComponent(b.dataset.id)}/revogar`); cortesiaCarregar(); }
    catch (e) { alert(e.message); }
  });
  corpo.querySelectorAll('.ct-reativar').forEach(b => b.onclick = async () => {
    try { await api('POST', `/${b.dataset.pref}/cortesia/${encodeURIComponent(b.dataset.id)}/reativar`); cortesiaCarregar(); }
    catch (e) { alert(e.message); }
  });
}
