'use strict';
// ============================================================================
// Portal Staff — módulo: app-listas
// Listas (compras/manutenção/pendências) e Agenda (pedidos de evento).
// Compartilha o escopo global com app-core.js (scripts clássicos, sem import/export).
// ============================================================================
// --------- Listas (Compras / Manutenção / Pendências) ---------
async function renderLista(tipo, titulo, opcoes) {
  const o = opcoes || {};
  const semQtd = !!o.semQtd;
  const rotuloNome = o.rotuloNome || 'Produto ou serviço *';
  const sub = o.sub || 'Qualquer pessoa da equipe pode incluir e dar baixa. Itens entram aqui e também pelo WhatsApp.';
  const c = conteudo();
  c.innerHTML = cabecalho(titulo, sub);
  c.innerHTML += `
    <form id="form-item" class="barra" style="flex-wrap:wrap">
      ${semQtd ? '' : '<input id="it-qtd" placeholder="Qtd (ex.: 2)" style="width:120px" aria-label="Quantidade">'}
      <input id="it-nome" placeholder="${esc(rotuloNome)}" style="flex:2;min-width:220px" required aria-label="Nome">
      <input id="it-obs" placeholder="Observação (opcional)" style="flex:1;min-width:160px" aria-label="Observação">
      <button class="btn" type="submit">+ Adicionar</button>
    </form>
    <div id="lista-itens" class="lista-itens"><p class="vazio">Carregando…</p></div>`;
  const f = $('#form-item');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const nome = $('#it-nome').value.trim(); if (!nome) return;
    try {
      const qtd = semQtd ? '' : ($('#it-qtd') ? $('#it-qtd').value : '');
      await api('POST', '/listas/' + tipo, { quantidade: qtd, nome, obs: $('#it-obs').value });
      f.reset(); $('#it-nome').focus(); carregarItens(tipo, { semQtd });
    } catch (e) { alert(e.message); }
  };
  carregarItens(tipo, { semQtd });
}
async function carregarItens(tipo, opcoes) {
  const semQtd = !!(opcoes && opcoes.semQtd);
  const alvo = $('#lista-itens'); if (!alvo) return;
  try {
    const { itens } = await api('GET', '/listas/' + tipo);
    if (!itens.length) { alvo.innerHTML = `<p class="vazio">Lista vazia. Adicione o primeiro item acima.</p>`; return; }
    alvo.innerHTML = `<div class="lista-cab"><span>${itens.length} ${itens.length === 1 ? 'item' : 'itens'}</span><button class="btn peq perigo" id="limpar-lista">Limpar tudo</button></div>` +
      itens.map(i => `
      <div class="linha-item">
        ${semQtd ? '' : `<span class="qtd">${esc(i.quantidade || '—')}</span>`}
        <span class="nome">${esc(i.nome)}${i.obs ? ` <span class="obs">— ${esc(i.obs)}</span>` : ''}</span>
        <span class="quem">${i.origem === 'whatsapp' ? '📱' : '💻'} ${esc(i.quem || '')} · ${dataBr(i.criadoEm)}</span>
        <button class="btn peq" data-baixa="${i.id}" title="Marcar como concluída / remover">✓</button>
      </div>`).join('');
    alvo.querySelectorAll('[data-baixa]').forEach(b => b.onclick = async () => {
      try { await api('DELETE', '/listas/' + tipo + '/' + b.dataset.baixa); carregarItens(tipo, { semQtd }); } catch (e) { alert(e.message); }
    });
    const lb = $('#limpar-lista');
    if (lb) lb.onclick = async () => { if (confirm('Limpar a lista inteira?')) { try { await api('POST', '/listas/' + tipo + '/limpar'); carregarItens(tipo, { semQtd }); } catch (e) { alert(e.message); } } };
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Agenda (pedidos de evento → Claude executa) ---------
async function renderAgenda() {
  const c = conteudo();
  c.innerHTML = cabecalho('Agenda — eventos', 'Crie ou peça exclusão de eventos no Google Calendar. A rotina do Claude efetiva no próximo ciclo e marca como feito.');
  c.innerHTML += `
    <form id="form-ev" class="form" style="max-width:580px">
      <label>Ação
        <select id="ev-acao"><option value="criar">➕ Criar evento</option><option value="excluir">🗑️ Excluir evento</option></select>
      </label>
      <label>Título do evento *<input id="ev-titulo" required></label>
      <div class="barra" style="gap:10px;flex-wrap:wrap">
        <label style="flex:1;min-width:150px">Data<input id="ev-data" type="date"></label>
        <label style="width:120px">Hora<input id="ev-hora" type="time"></label>
        <label style="width:130px">Duração (min)<input id="ev-dur" type="number" value="60" min="15" step="15"></label>
      </div>
      <label>Local (opcional)<input id="ev-local"></label>
      <label>Descrição (opcional)<textarea id="ev-desc" rows="2"></textarea></label>
      <button class="btn" type="submit">Enviar pedido</button>
    </form>
    <h2 class="titulo" style="font-size:1.1rem;margin-top:22px">Pedidos e eventos</h2>
    <p class="sub" style="margin-top:-6px">Para <b>remover um registro da lista</b>, use <b>✕ Remover</b> (não altera o Google Calendar). Para <b>excluir do Google um evento já criado</b>, use <b>🗑️ Excluir do Google</b> na linha dele. Pedido que ainda não rodou aparece como <b>✕ Cancelar</b>.</p>
    <div id="ev-lista" class="lista-itens"><p class="vazio">Carregando…</p></div>`;
  $('#form-ev').onsubmit = async (ev) => {
    ev.preventDefault();
    const titulo = $('#ev-titulo').value.trim(); if (!titulo) return;
    try {
      await api('POST', '/agenda/pedidos', { acao: $('#ev-acao').value, titulo, data: $('#ev-data').value, hora: $('#ev-hora').value, duracaoMin: $('#ev-dur').value, local: $('#ev-local').value, descricao: $('#ev-desc').value });
      $('#form-ev').reset(); $('#ev-dur').value = 60; carregarPedidos();
    } catch (e) { alert(e.message); }
  };
  carregarPedidos();
}
async function carregarPedidos() {
  const alvo = $('#ev-lista'); if (!alvo) return;
  try {
    const { pedidos } = await api('GET', '/agenda/pedidos');
    if (!pedidos.length) { alvo.innerHTML = `<p class="vazio">Nenhum pedido ainda.</p>`; return; }
    // eventos que já têm uma exclusão pedida (não oferecer o botão de excluir de novo)
    const jaExcluir = new Set(pedidos.filter(p => p.acao === 'excluir' && p.eventoId).map(p => p.eventoId));
    alvo.innerHTML = pedidos.slice().reverse().map(p => {
      const acoes = [];
      // Excluir o EVENTO do Google Calendar (só p/ criação efetivada e evento ainda existente).
      if (p.acao === 'criar' && p.status === 'feito' && p.eventoId && !jaExcluir.has(p.eventoId)) {
        const dados = esc(JSON.stringify({ id: p.id, eventoId: p.eventoId, titulo: p.titulo, data: p.data, hora: p.hora }));
        acoes.push(`<button class="btn peq perigo" data-excluir-ev="${dados}" title="Pedir a exclusão deste evento do Google Calendar">🗑️ Excluir do Google</button>`);
      }
      // Remover o REGISTRO da lista — SEMPRE disponível (não altera o Google Calendar).
      const rotRem = p.status === 'pendente' ? '✕ Cancelar' : '✕ Remover';
      const titRem = p.status === 'pendente' ? 'Cancelar este pedido (ainda não executado)' : 'Remover este registro da lista (não altera o Google Calendar)';
      acoes.push(`<button class="btn peq secund" data-remover="${p.id}" data-pend="${p.status === 'pendente' ? 1 : 0}" title="${titRem}">${rotRem}</button>`);
      const acao = acoes.join(' ');
      return `<div class="linha-item">
        <span class="qtd">${p.acao === 'excluir' ? '🗑️' : '➕'}</span>
        <span class="nome">${esc(p.titulo)}${p.data ? ` <span class="obs">— ${esc(p.data)}${p.hora ? ' ' + esc(p.hora) : ''}</span>` : ''}</span>
        <span class="quem"><span class="badge st-${esc(p.status)}">${esc(p.status)}</span> ${esc(p.quem || '')} · ${dataBr(p.criadoEm)}${p.resultado ? ' · ' + esc(p.resultado) : ''}</span>
        ${acao}
      </div>`;
    }).join('');
    alvo.querySelectorAll('[data-remover]').forEach(b => b.onclick = async () => {
      if (!confirm(b.dataset.pend === '1' ? 'Cancelar este pedido?' : 'Remover este registro da lista? (não altera o Google Calendar)')) return;
      try { await api('DELETE', '/agenda/pedidos/' + b.dataset.remover); carregarPedidos(); } catch (e) { alert(e.message); }
    });
    alvo.querySelectorAll('[data-excluir-ev]').forEach(b => b.onclick = async () => {
      const ev = JSON.parse(b.dataset.excluirEv);
      if (!confirm('Pedir a exclusão do evento "' + ev.titulo + '" do Google Calendar?')) return;
      try {
        await api('POST', '/agenda/pedidos', { acao: 'excluir', titulo: ev.titulo, data: ev.data, hora: ev.hora, eventoId: ev.eventoId, refPedidoId: ev.id });
        carregarPedidos();
      } catch (e) { alert(e.message); }
    });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
