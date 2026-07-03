'use strict';
// ============================================================================
// Portal Staff — módulo: app-atendimento
// Mural da equipe, FAQ oficial, Pós-estadia e Central do concierge.
// Compartilha o escopo global com app-core.js (scripts clássicos, sem import/export).
// ============================================================================
// --------- Mural da equipe (comunicação interna) ---------
async function renderMural() {
  const c = conteudo();
  c.innerHTML = cabecalho('Mural da equipe', 'Avisos, recados e coordenação entre a equipe e os agentes. Todos os logados leem e postam; mensagens fixadas ficam no topo.');
  const opcoesArea = '<option value="">Geral (toda a equipe)</option>' + ESTADO.catalogo.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('');
  const ehAdmin = ESTADO.me.papel === 'admin';
  c.innerHTML += `
    <form id="form-mural" class="mural-form">
      <textarea id="mu-texto" rows="3" placeholder="Escreva um aviso ou recado para a equipe…" required maxlength="4000"></textarea>
      <div class="mural-form-linha">
        <label>Para <select id="mu-area">${opcoesArea}</select></label>
        ${ehAdmin ? '<label class="mural-fixar"><input type="checkbox" id="mu-fixado"> 📌 Fixar no topo</label>' : ''}
        <button class="btn" type="submit">Publicar no mural</button>
      </div>
    </form>
    <div id="mural-lista"><p class="vazio">Carregando…</p></div>`;
  $('#form-mural').onsubmit = async (ev) => {
    ev.preventDefault();
    const texto = $('#mu-texto').value.trim(); if (!texto) return;
    try {
      await api('POST', '/mural', { texto, area: $('#mu-area').value, fixado: ehAdmin && $('#mu-fixado') ? $('#mu-fixado').checked : false });
      $('#form-mural').reset();
      carregarMural();
    } catch (e) { alert(e.message); }
  };
  carregarMural();
}

function muralMsgHtml(x) {
  const ehAdmin = ESTADO.me.papel === 'admin';
  const minha = x.autorEmail && ESTADO.me.email && x.autorEmail === ESTADO.me.email;
  const chips = [
    x.fixado ? '<span class="chip mural-chip-fix">📌 Fixado</span>' : '',
    x.agente ? '<span class="chip mural-chip-agente">🤖 Agente</span>' : '',
    x.area ? `<span class="chip">${esc(nomeArea(x.area))}</span>` : '',
  ].filter(Boolean).join(' ');
  const respostas = (x.respostas || []).map(r => `
    <div class="mural-resp">
      <div class="mural-resp-meta"><b>${esc(r.quem)}</b> · ${dataBr(r.criadoEm)}
        ${(ehAdmin || (r.autorEmail && r.autorEmail === ESTADO.me.email)) ? `<button class="mural-x" data-delresp="${x.id}|${r.id}" title="Excluir resposta">✕</button>` : ''}
      </div>
      <div class="mural-texto">${esc(r.texto).replace(/\n/g, '<br>')}</div>
    </div>`).join('');
  return `<div class="mural-msg${x.fixado ? ' fixada' : ''}" data-msg="${x.id}">
    <div class="mural-cab">
      <b>${esc(x.quem)}</b> ${chips}
      <span class="mural-data">${dataBr(x.criadoEm)}</span>
    </div>
    <div class="mural-texto">${esc(x.texto).replace(/\n/g, '<br>')}</div>
    ${respostas ? `<div class="mural-resps">${respostas}</div>` : ''}
    <div class="mural-acoes">
      <button class="btn peq secund" data-resp="${x.id}">↩ Responder</button>
      ${ehAdmin ? `<button class="btn peq secund" data-fixar="${x.id}" data-val="${x.fixado ? 0 : 1}">${x.fixado ? 'Desafixar' : '📌 Fixar'}</button>` : ''}
      ${(ehAdmin || minha) ? `<button class="btn peq perigo" data-delmsg="${x.id}">Excluir</button>` : ''}
    </div>
    <form class="mural-form-resp hidden" data-formresp="${x.id}">
      <input placeholder="Escreva a resposta…" required maxlength="2000">
      <button class="btn peq" type="submit">Enviar</button>
    </form>
  </div>`;
}

async function carregarMural() {
  const alvo = $('#mural-lista'); if (!alvo) return;
  try {
    const { mensagens } = await api('GET', '/mural');
    alvo.innerHTML = mensagens.length
      ? mensagens.map(muralMsgHtml).join('')
      : '<div class="vazio">Nenhuma mensagem ainda. Publique o primeiro aviso para a equipe!</div>';
    // marcar como visto (badge zera)
    localStorage.setItem('vs_mural_visto', new Date().toISOString());
    atualizarBadgeMural();
    document.querySelectorAll('[data-resp]').forEach(b => b.onclick = () => {
      const f = document.querySelector(`[data-formresp="${b.dataset.resp}"]`);
      f.classList.toggle('hidden'); if (!f.classList.contains('hidden')) f.querySelector('input').focus();
    });
    document.querySelectorAll('[data-formresp]').forEach(f => f.onsubmit = async (ev) => {
      ev.preventDefault();
      const texto = f.querySelector('input').value.trim(); if (!texto) return;
      try { await api('POST', '/mural/' + f.dataset.formresp + '/resposta', { texto }); carregarMural(); } catch (e) { alert(e.message); }
    });
    document.querySelectorAll('[data-fixar]').forEach(b => b.onclick = async () => {
      try { await api('PATCH', '/mural/' + b.dataset.fixar, { fixado: b.dataset.val === '1' }); carregarMural(); } catch (e) { alert(e.message); }
    });
    document.querySelectorAll('[data-delmsg]').forEach(b => b.onclick = async () => {
      if (!confirm('Excluir esta mensagem?')) return;
      try { await api('DELETE', '/mural/' + b.dataset.delmsg); carregarMural(); } catch (e) { alert(e.message); }
    });
    document.querySelectorAll('[data-delresp]').forEach(b => b.onclick = async () => {
      const [msgId, respId] = b.dataset.delresp.split('|');
      try { await api('DELETE', '/mural/' + msgId + '?resposta=' + encodeURIComponent(respId)); carregarMural(); } catch (e) { alert(e.message); }
    });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- FAQ oficial pesquisável ---------
async function renderFAQ() {
  const c = conteudo();
  c.innerHTML = cabecalho('FAQ oficial', 'Respostas padrão da Villela Stay para dúvidas de hóspedes e leads. Busque e copie a resposta para usar em qualquer canal.') + `
    <div class="barra"><input id="fq-busca" type="search" placeholder="🔎 Buscar pergunta ou resposta…" style="flex:1;min-width:220px" autofocus></div>
    <div id="fq-lista"><p class="vazio">Carregando…</p></div>`;
  let itens = [];
  try { itens = (await api('GET', '/faq')).itens; } catch (e) { $('#fq-lista').innerHTML = `<p class="erro">${esc(e.message)}</p>`; return; }
  const render = () => {
    const q = normaliza($('#fq-busca').value).trim();
    const termos = q ? q.split(/\s+/) : [];
    const filtrados = itens.filter(x => { if (!termos.length) return true; const alvo = normaliza(x.pergunta + ' ' + x.resposta + ' ' + x.categoria); return termos.every(t => alvo.includes(t)); });
    if (!filtrados.length) { $('#fq-lista').innerHTML = `<div class="vazio">${itens.length ? 'Nada encontrado.' : 'FAQ ainda não carregado. Peça ao marketing para publicar o FAQ oficial.'}</div>`; return; }
    // agrupa por categoria
    const cats = {}; filtrados.forEach(x => { (cats[x.categoria || 'Geral'] = cats[x.categoria || 'Geral'] || []).push(x); });
    $('#fq-lista').innerHTML = `<p class="sub" style="margin:0 0 10px">${filtrados.length} pergunta(s)</p>` + Object.entries(cats).map(([cat, arr]) => `
      <h3 style="color:var(--petroleo);margin:16px 0 8px">${esc(cat)}</h3>
      ${arr.map(x => `<details class="fq-item"><summary>${esc(x.pergunta)}</summary>
        <div class="fq-resp">${mdParaHtml(x.resposta)}</div>
        <button class="btn peq secund" data-copy-fq="${x.id}">📋 Copiar resposta</button></details>`).join('')}`).join('');
    $('#fq-lista').querySelectorAll('[data-copy-fq]').forEach(b => b.onclick = () => { const x = itens.find(i => i.id === b.dataset.copyFq); navigator.clipboard.writeText(x.resposta).then(() => { b.textContent = '✓ Copiado'; setTimeout(() => b.textContent = '📋 Copiar resposta', 1500); }); });
  };
  $('#fq-busca').oninput = render;
  render();
}

// --------- Pós-estadia (check-outs recentes + status de avaliação) ---------
async function renderPosEstadia() {
  const c = conteudo();
  c.innerHTML = cabecalho('Pós-estadia', 'Check-outs recentes e quem ainda não avaliou — para o concierge pedir a avaliação e estimular o retorno.') + `
    <div class="barra"><label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Últimos
      <select id="pe-dias"><option value="7">7 dias</option><option value="14" selected>14 dias</option><option value="30">30 dias</option></select></label>
      <button class="btn secund peq" id="pe-atualizar">Atualizar</button></div>
    <div id="pe-lista"><p class="vazio">Carregando…</p></div>`;
  $('#pe-dias').onchange = carregarPosEstadia;
  $('#pe-atualizar').onclick = carregarPosEstadia;
  carregarPosEstadia();
}
async function carregarPosEstadia() {
  const alvo = $('#pe-lista'); if (!alvo) return;
  try {
    const { saidas, semAvaliacao } = await api('GET', '/concierge/pos-estadia?dias=' + ($('#pe-dias').value || 14));
    if (!saidas.length) { alvo.innerHTML = '<div class="vazio">Nenhum check-out no período.</div>'; return; }
    alvo.innerHTML = `<p class="sub" style="margin:0 0 10px">${saidas.length} check-out(s) · ${semAvaliacao} sem avaliação</p>` + saidas.map(s => `
      <div class="linha-item" style="${s.avaliou ? '' : 'border-left:3px solid var(--cerrado)'}">
        <span class="qtd">${esc((s.checkOut || '').slice(8, 10) + '/' + (s.checkOut || '').slice(5, 7))}</span>
        <span class="nome">${esc(s.imovel)} · ${esc(s.hospede)} <span class="obs">saída ${esc(s.checkOut || '')}${s.reserva ? ' · ' + esc(s.reserva) : ''}</span></span>
        <span class="quem">${s.avaliou ? '⭐ avaliou' : '⏳ sem avaliação'}</span>
      </div>`).join('');
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Central do concierge (fila única + dossiê de chegadas) ---------
async function renderConcierge() {
  const c = conteudo();
  c.innerHTML = cabecalho('Central do concierge', 'O que precisa de atenção com os hóspedes, num só lugar: chegadas do período e a fila de pedidos, pré-check-ins e avaliações.') + `
    <div class="barra">
      <label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Chegadas nos próximos
        <select id="cg-dias"><option value="1">1 dia</option><option value="3" selected>3 dias</option><option value="7">7 dias</option><option value="14">14 dias</option></select></label>
      <button class="btn secund peq" id="cg-atualizar">Atualizar</button>
    </div>
    <h2 class="titulo" style="font-size:1.15rem">🛬 Chegadas</h2>
    <div id="cg-chegadas"><p class="vazio">Carregando…</p></div>
    <h2 class="titulo" style="font-size:1.15rem;margin-top:24px">📋 Fila de atendimento</h2>
    <div id="cg-fila"><p class="vazio">Carregando…</p></div>`;
  $('#cg-dias').onchange = carregarChegadas;
  $('#cg-atualizar').onclick = () => { carregarChegadas(); carregarFilaConcierge(); };
  carregarChegadas();
  carregarFilaConcierge();
}
async function carregarChegadas() {
  const alvo = $('#cg-chegadas'); if (!alvo) return;
  try {
    const { chegadas } = await api('GET', '/concierge/chegadas?dias=' + ($('#cg-dias').value || 3));
    if (!chegadas.length) { alvo.innerHTML = '<div class="vazio">Nenhuma chegada no período. 🌴</div>'; return; }
    alvo.innerHTML = chegadas.map(a => {
      const sinais = [
        a.preCheckin ? '<span class="chip" style="background:#e6f4ea;border-color:#bfe3c8">✅ pré-check-in</span>' : '<span class="chip" style="background:#fdf3e3;border-color:#f0dca6">⏳ sem pré-check-in</span>',
        a.pedidosAbertos ? `<span class="chip" style="background:#fff4e0;border-color:#f0dca6">📨 ${a.pedidosAbertos} pedido(s)</span>` : '',
        a.aPagar ? `<span class="chip" style="background:#fdecea;border-color:#f3c9c6">💳 a pagar R$ ${Number(a.aPagar).toLocaleString('pt-BR')}</span>` : '',
        a.credito ? `<span class="chip" style="background:#e6f4ea;border-color:#bfe3c8">🎁 crédito R$ ${Number(a.credito).toLocaleString('pt-BR')}</span>` : '',
        a.temConta ? '' : '<span class="chip">sem conta no app</span>',
      ].filter(Boolean).join(' ');
      return `<div class="item">
        <h3>${esc(a.imovel)} · ${esc(a.hospede)}</h3>
        <div class="meta"><span class="chip">${esc(a.imovelTitulo)}</span><span class="chip">${esc(a.plataforma)}</span>
          <span>check-in ${esc(a.checkIn)} → ${esc(a.checkOut)}${a.hospedes ? ' · ' + a.hospedes + ' hósp.' : ''}</span></div>
        <div class="kard-meta" style="margin-top:8px">${sinais}</div>
      </div>`;
    }).join('');
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
async function carregarFilaConcierge() {
  const alvo = $('#cg-fila'); if (!alvo) return;
  try {
    const { itens, abertos } = await api('GET', '/concierge/fila');
    if (!itens.length) { alvo.innerHTML = '<div class="vazio">Nada na fila agora.</div>'; return; }
    const icone = { pedido: '📨', precheckin: '🛬', avaliacao: '⭐', indicacao: '🤝' };
    alvo.innerHTML = `<p class="sub" style="margin:0 0 10px">${abertos} item(ns) aberto(s) de ${itens.length}</p>` + itens.slice(0, 60).map(x => `
      <div class="linha-item" style="${x.aberto ? 'border-left:3px solid var(--cerrado)' : ''}">
        <span class="qtd">${icone[x.fila] || '•'}</span>
        <span class="nome">${esc(x.titulo)} ${x.sub ? `<span class="obs">${esc(x.sub)}</span>` : ''}</span>
        <span class="quem">${esc(x.status)} · ${x.quando ? dataBr(x.quando) : ''}</span>
        ${x.fila === 'pedido' ? '<button class="btn peq secund" data-verpedidos="1">Ver pedidos</button>' : ''}
      </div>`).join('');
    alvo.querySelectorAll('[data-verpedidos]').forEach(b => b.onclick = () => navegar('hospede-pedidos'));
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Contas a pagar (área financeiro/ceo) ---------