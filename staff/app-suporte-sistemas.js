'use strict';
// ============================================================================
// Portal Staff — módulo: app-suporte-sistemas (💬 Suporte dos sistemas)
// Caixa única das conversas que os clientes abrem pelo botão 💬/🔔 dentro de
// QUALQUER sistema do grupo. A resposta volta para o app do cliente, com push
// (onde o sistema tem) e e-mail. Fala com /staff/api/suporte-sistemas/*.
// Compartilha o escopo global com app-core.js (scripts clássicos).
// ============================================================================
const SUP = { filtro: 'aguardando', produto: '', busca: '', aberta: null, produtos: [], timer: null };
const supStatus = { aberta: ['aguardando resposta', 'st-andamento'], respondida: ['respondida', 'st-feito'], resolvida: ['resolvida', ''] };

async function renderSuporteSistemas() {
  if (SUP.timer) { clearInterval(SUP.timer); SUP.timer = null; }
  conteudo().innerHTML = cabecalho('💬 Suporte dos sistemas',
    'Conversas que alunos, assinantes e clientes abrem pelo botão de suporte dentro de cada sistema. '
    + 'Sua resposta aparece no app do cliente e chega também por e-mail (e no celular, onde o sistema tem push).')
    + `<div id="sup-cards" class="cards"></div>
       <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0">
         <select id="sup-f" style="width:auto">
           <option value="aguardando">Aguardando resposta</option><option value="respondida">Respondidas</option>
           <option value="resolvida">Resolvidas</option><option value="todas">Todas</option></select>
         <select id="sup-p" style="width:auto"><option value="">Todos os sistemas</option></select>
         <input id="sup-b" placeholder="Buscar nome, e-mail ou texto" style="max-width:260px">
       </div>
       <div style="display:grid;grid-template-columns:minmax(0,1fr);gap:14px" id="sup-grade">
         <div id="sup-lista"><p class="vazio">Carregando…</p></div>
         <div id="sup-conv"></div>
       </div>`;
  try { SUP.produtos = (await api('GET', '/comunicados/config')).produtos || []; } catch (_) { SUP.produtos = []; }
  $('#sup-p').innerHTML += SUP.produtos.filter(p => p.tem_app).map(p => `<option value="${esc(p.chave)}">${p.emoji} ${esc(p.nome)}</option>`).join('');
  $('#sup-f').value = SUP.filtro; $('#sup-p').value = SUP.produto; $('#sup-b').value = SUP.busca;
  $('#sup-f').onchange = () => { SUP.filtro = $('#sup-f').value; supLista(); };
  $('#sup-p').onchange = () => { SUP.produto = $('#sup-p').value; supLista(); };
  let t; $('#sup-b').oninput = () => { clearTimeout(t); t = setTimeout(() => { SUP.busca = $('#sup-b').value.trim(); supLista(); }, 350); };
  if (window.matchMedia('(min-width: 1000px)').matches) $('#sup-grade').style.gridTemplateColumns = 'minmax(0,5fr) minmax(0,7fr)';
  await supLista();
  if (SUP.aberta) supAbrir(SUP.aberta);
  // Enquanto a tela está aberta, a fila se atualiza sozinha (cliente escrevendo agora).
  SUP.timer = setInterval(() => { if (ESTADO.secao !== 'suporte-sistemas') { clearInterval(SUP.timer); SUP.timer = null; return; } if (!document.hidden) supLista(true); }, 30000);
}

const supNomeP = (k) => { const p = SUP.produtos.find(x => x.chave === k); return p ? `${p.emoji} ${p.nome}` : k; };

async function supLista(silencioso) {
  const box = $('#sup-lista'); if (!box) return;
  const q = new URLSearchParams({ status: SUP.filtro, produto: SUP.produto, busca: SUP.busca });
  let r;
  try { r = await api('GET', '/suporte-sistemas?' + q.toString()); }
  catch (e) { if (!silencioso) box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  const card = (n, rot) => `<div class="card"><div class="n">${n}</div><div class="rot">${rot}</div></div>`;
  $('#sup-cards').innerHTML = card(r.resumo.aguardando, 'Aguardando resposta') + card(r.resumo.nao_lidas, 'Mensagens não lidas')
    + card(r.resumo.respondidas, 'Respondidas') + card(r.resumo.resolvidas, 'Resolvidas');
  if (!r.conversas.length) { box.innerHTML = '<p class="vazio">Nenhuma conversa neste filtro.</p>'; return; }
  box.innerHTML = r.conversas.map(c => {
    const [st, cls] = supStatus[c.status] || [c.status, ''];
    return `<button class="cr-box sup-item" data-id="${esc(c.id)}" style="display:block;width:100%;text-align:left;cursor:pointer;margin:0 0 8px;${SUP.aberta === c.id ? 'outline:2px solid var(--acento,#0E7490)' : ''}">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${esc(c.assunto)}</b>
        <span><span class="badge ${cls}">${esc(st)}</span>${c.nao_lidas_staff ? ` <span class="badge st-erro">${c.nao_lidas_staff} nova(s)</span>` : ''}</span></div>
      <div class="obs">${esc(supNomeP(c.produto))} · ${esc(c.nome || 'Cliente')}${c.email ? ' · ' + esc(c.email) : ''}</div>
      <div class="obs" style="margin-top:4px">${esc(String(c.ultima || '').slice(0, 140))}</div>
      <div class="obs">${dataBr(c.atualizado_em)} · ${c.total} mensagem(ns)</div></button>`;
  }).join('');
  box.querySelectorAll('.sup-item').forEach(b => b.onclick = () => supAbrir(b.dataset.id));
}

async function supAbrir(id) {
  SUP.aberta = id;
  const box = $('#sup-conv'); if (!box) return;
  box.innerHTML = '<p class="vazio">Abrindo…</p>';
  let c;
  try { c = (await api('GET', `/suporte-sistemas/${encodeURIComponent(id)}`)).conversa; }
  catch (e) { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  const [st, cls] = supStatus[c.status] || [c.status, ''];
  const bolha = (m) => `<div style="max-width:85%;padding:9px 12px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word;${m.autor === 'staff'
      ? 'align-self:flex-end;background:#E6F4F1;border-bottom-right-radius:4px'
      : 'align-self:flex-start;background:#F1F3F6;border-bottom-left-radius:4px'}">${esc(m.texto)}
      <div class="obs" style="font-size:.75rem;margin-top:4px">${esc(m.autor === 'staff' ? (m.autor_nome || 'Equipe') : (c.nome || 'Cliente'))} · ${dataBr(m.criado_em)}</div></div>`;
  box.innerHTML = `<div class="cr-box" style="padding:14px">
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
      <h2 class="titulo" style="font-size:1.05rem;margin:0">${esc(c.assunto)}</h2><span class="badge ${cls}">${esc(st)}</span></div>
    <p class="obs" style="margin:4px 0 10px">${esc(supNomeP(c.produto))} · <b>${esc(c.nome || 'Cliente')}</b>${c.email ? ' · ' + esc(c.email) : ''}${c.pagina ? ` · abriu em <code>${esc(c.pagina)}</code>` : ''}</p>
    <div id="sup-msgs" style="display:flex;flex-direction:column;gap:8px;max-height:52vh;overflow:auto;padding:4px">${c.mensagens.map(bolha).join('')}</div>
    <form id="sup-form" class="form" style="margin-top:12px">
      <label>Sua resposta <textarea id="sup-txt" rows="4" maxlength="2000" required placeholder="Escreva como falaria com o cliente."></textarea></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" type="submit">Responder</button>
        <button class="btn secund" type="button" id="sup-resp-res">Responder e marcar resolvida</button>
        ${c.status === 'resolvida'
          ? '<button class="btn secund" type="button" id="sup-reabrir">Reabrir</button>'
          : '<button class="btn secund" type="button" id="sup-resolver">Marcar resolvida (sem responder)</button>'}
      </div><p id="sup-msg" class="erro"></p></form></div>`;
  const msgs = $('#sup-msgs'); msgs.scrollTop = msgs.scrollHeight;
  const responder = async (resolver) => {
    const m = $('#sup-msg'); m.className = 'erro'; m.textContent = '';
    const texto = $('#sup-txt').value.trim();
    if (!texto) { m.textContent = 'Escreva a resposta.'; return; }
    try {
      const r = await api('POST', `/suporte-sistemas/${encodeURIComponent(c.id)}/responder`, { texto, resolver });
      const av = r.conversa.avisos || {};
      await supAbrir(c.id);
      const m2 = $('#sup-msg'); if (m2) { m2.className = 'ok'; m2.textContent = `Enviada. Cliente avisado por: app${av.email ? ', e-mail' : ''}${av.push ? ', celular' : ''}.`; }
      supLista(true);
    } catch (e) { m.textContent = e.message; }
  };
  $('#sup-form').onsubmit = (ev) => { ev.preventDefault(); responder(false); };
  $('#sup-resp-res').onclick = () => responder(true);
  const mudar = async (status) => { try { await api('POST', `/suporte-sistemas/${encodeURIComponent(c.id)}/status`, { status }); await supAbrir(c.id); supLista(true); } catch (e) { $('#sup-msg').textContent = e.message; } };
  if ($('#sup-resolver')) $('#sup-resolver').onclick = () => mudar('resolvida');
  if ($('#sup-reabrir')) $('#sup-reabrir').onclick = () => mudar('aberta');
  supLista(true);
  if (!window.matchMedia('(min-width: 1000px)').matches) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
