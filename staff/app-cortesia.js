'use strict';
// ============================================================================
// Portal Staff — módulo: app-cortesia (Acessos de Teste / Cortesia)
// Cria / lista / revoga acessos VITALÍCIOS de cortesia nos SaaS — sem cadastro
// do testador, sem pagamento, com dados de exemplo. Fala o contrato uniforme
// /staff/api/<pref>/cortesia de cada produto. Duas portas para a MESMA coisa:
//   · renderCortesia()            — central única (menu 🎟️ Acessos de Teste)
//   · cortesiaPainel(el, chave)   — aba 🎟️ Cortesia na área de cada sistema
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================
const CORTESIA_PRODUTOS = [
  { chave: 'crm', pref: 'vcrm', converte: true, nome: 'Villela CRM', emoji: '🤝', painel: 'https://crm.villelastay.com.br/crm/app' },
  { chave: 'vsm', pref: 'vsm', converte: true, nome: 'Villela Stay Manager', emoji: '🏨', painel: 'https://manager.villelastay.com.br/gestao/app' },
  { chave: 'legal-saas', pref: 'legal-saas', converte: true, nome: 'Villela Legal SaaS', emoji: '⚖️', painel: 'https://juridico.villelastay.com.br/juridico/app' },
  { chave: 'vdocs', pref: 'vdocs', converte: true, nome: 'Villela Docs', emoji: '🗂️', painel: 'https://docs.villelastay.com.br/vdocs/app' },
  { chave: 'vpe', pref: 'vpe', nome: 'Villela Projects', emoji: '📋', painel: 'https://projetos.villelastay.com.br/vpe/app' },
  { chave: 'academy', pref: 'academy', nome: 'Villela Academy', emoji: '🎓', painel: 'https://academia.villelastay.com.br/academy/app', tipo: 'usuario' },
];
const cortesiaProd = (chave) => CORTESIA_PRODUTOS.find(p => p.chave === chave);

// E-mail que já tem conta no produto: em vez do erro cru, diz o que fazer.
function cortesiaErro(e, p) {
  const m = String((e && e.message) || e || '');
  if (!/UNIQUE|já tem conta/i.test(m)) return m;
  return 'Este e-mail já tem conta neste sistema.' + (p && p.converte ? ' Abra a conta na lista de clientes e use 🎟️ Dar cortesia.' : '');
}
const cortesiaRevogado = (a) => a.status === 'suspensa' || a.status === 'cancelada' || a.ativo === 0 || a.ativo === false || a.revogado === true;

// Linha da tabela de um acesso (as ações são ligadas por cortesiaLigar).
function cortesiaLinha(p, a) {
  const nome = a.nome || a.email || a.email_contato || a.id;
  const email = a.email_dono || a.email_contato || a.email || '';
  const revogado = cortesiaRevogado(a);
  const extra = (a.produtos_liberados != null) ? `<span class="obs"> · ${a.total ? 'acesso total · ' : ''}${esc(String(a.produtos_liberados))} produto(s)</span>` : '';
  const plano = a.plano_nome || a.plano || '';
  return `<tr>
    <td><b>${esc(nome)}</b>${extra}${email ? `<br><span class="obs">${esc(email)}</span>` : ''}</td>
    <td>${revogado ? '<span class="badge st-erro">revogado</span>' : '<span class="badge st-feito">ativo</span>'}${plano ? `<br><span class="obs">${esc(String(plano))}</span>` : ''}</td>
    <td>
      <a class="btn peq secund" href="${esc(p.painel)}" target="_blank" rel="noopener">painel ↗</a>
      ${revogado ? ''
        : `<button class="btn peq secund ct-link" data-pref="${esc(p.pref)}" data-id="${esc(a.id)}">🔑 copiar link</button>`}
      ${revogado
        ? `<button class="btn peq secund ct-reativar" data-pref="${esc(p.pref)}" data-id="${esc(a.id)}">reativar</button>`
        : `<button class="btn peq secund ct-revogar" data-pref="${esc(p.pref)}" data-id="${esc(a.id)}">revogar</button>`}
    </td></tr>`;
}

// Liga revogar / reativar / copiar link dentro de `raiz`; `recarregar` redesenha a lista.
function cortesiaLigar(raiz, recarregar) {
  raiz.querySelectorAll('.ct-revogar').forEach(b => b.onclick = async () => {
    if (!confirm(b.dataset.pref === 'academy'
      ? 'Revogar TODAS as cortesias desta pessoa na Academy (inclusive as dadas por curso na área do produtor)? Compras e assinaturas ficam intactas.'
      : 'Revogar este acesso de cortesia? A pessoa perde o acesso imediatamente (reversível pelo botão reativar).')) return;
    try { await api('POST', `/${b.dataset.pref}/cortesia/${encodeURIComponent(b.dataset.id)}/revogar`); recarregar(); }
    catch (e) { alert(e.message); }
  });
  raiz.querySelectorAll('.ct-reativar').forEach(b => b.onclick = async () => {
    // na Academy, reativar por aqui concede TUDO (não só os cursos que a pessoa tinha)
    if (b.dataset.pref === 'academy' && !confirm('Reativar por aqui libera TODOS os cursos publicados para esta pessoa. Para liberar um curso só, use a área do produtor. Continuar?')) return;
    try { await api('POST', `/${b.dataset.pref}/cortesia/${encodeURIComponent(b.dataset.id)}/reativar`); recarregar(); }
    catch (e) { alert(e.message); }
  });
  // regenera um link mágico (branded) para reenviar, sem recriar a conta
  raiz.querySelectorAll('.ct-link').forEach(b => b.onclick = async () => {
    const orig = b.textContent;
    try {
      const r = await api('POST', `/${b.dataset.pref}/cortesia/${encodeURIComponent(b.dataset.id)}/link`);
      const url = r && r.acesso && r.acesso.definir_senha_url;
      if (!url) { alert('Este produto não retornou um link de definição de senha.'); return; }
      try { await navigator.clipboard.writeText(url); b.textContent = 'copiado ✓'; setTimeout(() => b.textContent = orig, 1500); } catch (_) {}
      prompt('Link para a pessoa definir a senha (envie a ela):', url);
    } catch (e) { alert(e.message); }
  });
}

// Quadro com os links recém-criados (copiar e enviar). `box` = onde desenhar.
function cortesiaResultados(email, resultados, box) {
  box = box || $('#ct-result'); if (!box) return;
  const linha = ({ p, r, erro }) => {
    if (erro) return `<tr><td>${p.emoji} ${esc(p.nome)}</td><td class="erro">${esc(erro)}</td></tr>`;
    const a = (r && r.acesso) || {};
    const painel = a.painel_url || p.painel;
    let acesso;
    if (a.definir_senha_url) acesso = `<input class="ct-copia" readonly value="${esc(a.definir_senha_url)}" style="width:100%;font-size:.82rem"> <button class="btn peq secund ct-btcopia" data-v="${esc(a.definir_senha_url)}">copiar link</button><br><span class="obs">a pessoa define a própria senha (${esc(a.validade_link || 'validade limitada')})</span>`;
    else if (a.senha_temporaria) acesso = `senha temporária: <code>${esc(a.senha_temporaria)}</code>`;
    else acesso = '<span class="obs">acesso criado</span>';
    return `<tr><td>${p.emoji} <b>${esc(p.nome)}</b><br><span class="obs">painel: <a href="${esc(painel)}" target="_blank" rel="noopener">${esc(painel)}</a></span></td><td>${acesso}</td></tr>`;
  };
  const algumOk = resultados.some(x => !x.erro);
  box.innerHTML = `<div class="cr-box" style="margin:12px 0;padding:12px;border-left:4px solid var(--${algumOk ? 'ok,#2e7d32' : 'alerta,#c62828'})">
    <b>${algumOk ? '✅ Acesso(s) criado(s) para ' + esc(email) + '</b> — copie o link e envie:' : '⚠️ Nenhum acesso criado para ' + esc(email) + '</b>'}
    <table style="margin-top:8px"><tbody>${resultados.map(linha).join('')}</tbody></table></div>`;
  box.querySelectorAll('.ct-btcopia').forEach(b => b.onclick = () => {
    navigator.clipboard.writeText(b.dataset.v).then(() => { b.textContent = 'copiado ✓'; setTimeout(() => b.textContent = 'copiar link', 1500); });
  });
  box.querySelectorAll('.ct-copia').forEach(i => i.onclick = () => i.select());
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ----------------------------------------------------------------------------
// Aba 🎟️ Cortesia de UM produto, dentro da área de administração dele.
// `aoMudar` (opcional) roda depois de criar/revogar/reativar — para o painel
// hospedeiro atualizar a própria lista de clientes.
// ----------------------------------------------------------------------------
async function cortesiaPainel(el, chave, aoMudar) {
  const p = cortesiaProd(chave);
  if (!el || !p) return;
  el.innerHTML = `<div class="card">
      <h3>🎟️ Assinaturas de cortesia — ${esc(p.nome)}</h3>
      <p class="sub">Acesso completo, sem cobrança e sem prazo, até você revogar. A pessoa recebe um link para definir a própria senha.${p.converte ? ' Para dar cortesia a quem <b>já tem conta</b>, abra a conta na lista de clientes e use <b>🎟️ Dar cortesia</b>.' : ''}</p>
      <form class="form ctp-form" style="max-width:700px">
        <div class="hi-grid">
          <label>Nome (pessoa ou empresa) <input class="ctp-nome" maxlength="120" placeholder="Ex.: Silva Advogados"></label>
          <label>E-mail * <input class="ctp-email" type="email" required placeholder="pessoa@exemplo.com"></label>
        </div>
        <label style="display:block;margin-bottom:8px"><input type="checkbox" class="ctp-demo" checked> Popular com dados de exemplo (demo)</label>
        <button class="btn" type="submit">Criar cortesia</button><p class="ctp-msg erro"></p>
      </form>
      <div class="ctp-result"></div>
    </div>
    <div class="card ctp-lista"><p class="vazio">Carregando…</p></div>`;

  const lista = el.querySelector('.ctp-lista');
  const carregar = async () => {
    if (!document.body.contains(lista)) return;
    try {
      const r = await api('GET', `/${p.pref}/cortesia`);
      const acessos = (r && r.acessos) || [];
      const ativos = acessos.filter(a => !cortesiaRevogado(a)).length;
      lista.innerHTML = `<h3>Cortesias deste sistema <span class="obs">(${ativos} ativa(s)${acessos.length - ativos ? `, ${acessos.length - ativos} revogada(s)` : ''})</span></h3>`
        + (acessos.length ? `<table><tbody>${acessos.map(a => cortesiaLinha(p, a)).join('')}</tbody></table>` : '<p class="vazio">Nenhuma cortesia neste sistema ainda.</p>');
      cortesiaLigar(lista, mudou);
    } catch (e) { lista.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
  };
  const mudou = () => { carregar(); if (typeof aoMudar === 'function') { try { aoMudar(); } catch (_) {} } };

  const form = el.querySelector('.ctp-form');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const msg = el.querySelector('.ctp-msg'); msg.textContent = '';
    const email = el.querySelector('.ctp-email').value.trim(), nome = el.querySelector('.ctp-nome').value.trim();
    if (!email) { msg.textContent = 'Informe o e-mail.'; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Criando…';
    let res;
    try { res = { p, r: await api('POST', `/${p.pref}/cortesia`, { nome, email, seed_demo: el.querySelector('.ctp-demo').checked }) }; }
    catch (e) { res = { p, erro: cortesiaErro(e, p) }; }
    btn.disabled = false; btn.textContent = 'Criar cortesia';
    cortesiaResultados(email, [res], el.querySelector('.ctp-result'));
    if (!res.erro) { form.reset(); mudou(); }
  };
  carregar();
}

// ----------------------------------------------------------------------------
// Central única (menu 🎟️ Acessos de Teste): o mesmo acesso em vários produtos.
// ----------------------------------------------------------------------------
async function renderCortesia() {
  conteudo().innerHTML = cabecalho('🎟️ Acessos de Teste (Cortesia)',
    'Crie logins vitalícios de teste (beta) nos SaaS — sem cadastro, sem pagamento, com dados de exemplo. '
    + 'Para você testar como cliente e para amigos/parentes darem feedback. Revogue quando quiser (reversível). '
    + 'A mesma administração existe na aba 🎟️ Cortesia de cada sistema.')
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
      catch (e) { resultados.push({ p, erro: cortesiaErro(e, p) }); }
    }
    btn.disabled = false; btn.textContent = 'Criar acesso(s)';
    cortesiaResultados(email, resultados);
    cortesiaCarregar();
  };
  cortesiaCarregar();
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
    return tit + `<table><tbody>${acessos.map(a => cortesiaLinha(p, a)).join('')}</tbody></table>`;
  }).join('');
  cortesiaLigar(corpo, cortesiaCarregar);
}
