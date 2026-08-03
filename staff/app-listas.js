'use strict';
// ============================================================================
// Portal Staff — módulo: app-listas
// Listas (compras/manutenção/pendências), Bloco de Notas e Agenda (pedidos de evento).
// Compartilha o escopo global com app-core.js (scripts clássicos, sem import/export).
// ============================================================================
// --------- Listas (Compras / Manutenção / Pendências) ---------
// As listas aparecem em ORDEM ALFABÉTICA pelo nome do item (pt-BR: ignora acento e maiúscula,
// e "10 sabonetes" ordena por número, não por caractere).
const ordemAlfabetica = (itens) => (itens || []).slice().sort((a, b) =>
  String(a.nome || '').localeCompare(String(b.nome || ''), 'pt', { sensitivity: 'base', numeric: true }));
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
    <div id="lista-itens" class="lista-itens"><p class="vazio">Carregando…</p></div>
    ${tipo === 'compras' ? `
    <h2 class="titulo" style="font-size:1.05rem;margin:26px 0 0">✅ Concluídos</h2>
    <p class="sub" style="margin-top:2px">O que você marcou como <b>concluído</b> cai aqui. Use <b>↩︎ Incluir</b> para devolver o item à lista de compras acima.</p>
    <div id="lista-concluidos" class="lista-itens"><p class="vazio">Carregando…</p></div>` : ''}`;
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
  const temConcluidos = tipo === 'compras';   // só compras tem a lista de concluídos abaixo
  try {
    const r0 = await api('GET', '/listas/' + tipo);
    const itens = ordemAlfabetica(r0.itens);
    if (!itens.length) { alvo.innerHTML = `<p class="vazio">Lista vazia. Adicione o primeiro item acima.</p>`; }
    else {
      alvo.innerHTML = `<div class="lista-cab"><span>${itens.length} ${itens.length === 1 ? 'item' : 'itens'}</span><button class="btn peq perigo" id="limpar-lista">Limpar tudo</button></div>` +
        itens.map(i => `
        <div class="linha-item">
          ${semQtd ? '' : `<span class="qtd">${esc(i.quantidade || '—')}</span>`}
          <span class="nome">${esc(i.nome)}${i.obs ? ` <span class="obs">— ${esc(i.obs)}</span>` : ''}</span>
          <span class="quem">${i.origem === 'whatsapp' ? '📱' : '💻'} ${esc(i.quem || '')} · ${dataBr(i.criadoEm)}</span>
          <span class="acoes">
            <button class="btn peq" data-baixa="${i.id}" title="Concluído (vai para a lista de concluídos abaixo)">✓</button>
            <button class="btn peq perigo" data-excluir-item="${i.id}" title="Excluir da lista (não vai para os concluídos)">✕</button>
          </span>
        </div>`).join('');
      alvo.querySelectorAll('[data-baixa]').forEach(b => b.onclick = async () => {
        try { await api('DELETE', '/listas/' + tipo + '/' + b.dataset.baixa); carregarItens(tipo, { semQtd }); } catch (e) { alert(e.message); }
      });
      alvo.querySelectorAll('[data-excluir-item]').forEach(b => b.onclick = async () => {
        if (!confirm('Excluir este item da lista? Ele não vai para os concluídos.')) return;
        try { await api('DELETE', '/listas/' + tipo + '/' + b.dataset.excluirItem + '?arquivar=nao'); carregarItens(tipo, { semQtd }); } catch (e) { alert(e.message); }
      });
      const lb = $('#limpar-lista');
      if (lb) lb.onclick = async () => { if (confirm('Limpar a lista inteira?')) { try { await api('POST', '/listas/' + tipo + '/limpar'); carregarItens(tipo, { semQtd }); } catch (e) { alert(e.message); } } };
    }
    if (temConcluidos) carregarConcluidos(tipo, { semQtd });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
// Lista de CONCLUÍDOS (compras): cada item volta para a lista de cima com ↩︎ Incluir.
async function carregarConcluidos(tipo, opcoes) {
  const semQtd = !!(opcoes && opcoes.semQtd);
  const box = $('#lista-concluidos'); if (!box) return;
  try {
    const r = await api('GET', '/listas/' + tipo + '/concluidos');
    const itens = ordemAlfabetica(r.itens);
    if (!itens.length) { box.innerHTML = `<p class="vazio">Nada concluído ainda.</p>`; return; }
    box.innerHTML = `<div class="lista-cab"><span>${itens.length}${r.total > itens.length ? ' de ' + r.total : ''} concluído(s)</span><button class="btn peq perigo" id="limpar-concluidos">Limpar concluídos</button></div>` +
      itens.map(i => `
      <div class="linha-item concluido">
        ${semQtd ? '' : `<span class="qtd">${esc(i.quantidade || '—')}</span>`}
        <span class="nome">${esc(i.nome)}${i.obs ? ` <span class="obs">— ${esc(i.obs)}</span>` : ''}</span>
        <span class="quem">✅ ${esc((i.concluidoEm || '').slice(0, 10).split('-').reverse().join('/'))} · ${esc(i.concluidoPor || i.quem || '')}</span>
        <span class="acoes">
          <button class="btn peq secund" data-voltar="${i.id}" title="Voltar para a lista de compras">↩︎ Incluir</button>
          <button class="btn peq perigo" data-apagar-conc="${i.id}" title="Excluir dos concluídos (definitivo)">✕</button>
        </span>
      </div>`).join('');
    box.querySelectorAll('[data-voltar]').forEach(b => b.onclick = async () => {
      try { await api('POST', '/listas/' + tipo + '/concluidos/' + b.dataset.voltar + '/restaurar'); carregarItens(tipo, { semQtd }); } catch (e) { alert(e.message); }
    });
    box.querySelectorAll('[data-apagar-conc]').forEach(b => b.onclick = async () => {
      if (!confirm('Excluir dos concluídos? Não dá para desfazer.')) return;
      try { await api('DELETE', '/listas/' + tipo + '/concluidos/' + b.dataset.apagarConc); carregarConcluidos(tipo, { semQtd }); } catch (e) { alert(e.message); }
    });
    const lc = $('#limpar-concluidos');
    if (lc) lc.onclick = async () => { if (confirm('Limpar TODA a lista de concluídos?')) { try { await api('POST', '/listas/' + tipo + '/concluidos/limpar'); carregarConcluidos(tipo, { semQtd }); } catch (e) { alert(e.message); } } };
  } catch (e) { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Pendências (lista do CEO): categorias/áreas + mural de post-its ---------
const PEND_CORES = ['#ffe08a', '#ffd0a6', '#bff0c3', '#a6e6e6', '#c8bdf0', '#f7c0e6', '#f3f0a6', '#a6d8ff', '#ffb3b3', '#c9f0d8', '#e6c9a0', '#d4c5f9'];
let PEND_CATS = [];
let PEND_ITENS = [];
function pendCor(cat) {
  if (!cat) return '#e8e6e0'; // sem categoria — neutro
  let idx = PEND_CATS.findIndex(c => c.toLowerCase() === cat.toLowerCase());
  if (idx < 0) idx = Math.abs([...cat].reduce((a, ch) => a + ch.charCodeAt(0), 0));
  return PEND_CORES[idx % PEND_CORES.length];
}
async function garantirCategoria(cat) {
  if (!cat || PEND_CATS.some(c => c.toLowerCase() === cat.toLowerCase())) return;
  try { const r = await api('POST', '/pendencias/categorias', { categoria: cat }); PEND_CATS = r.categorias || PEND_CATS; } catch (_) {}
}
async function renderPendencias() {
  const c = conteudo();
  c.innerHTML = cabecalho('Pendências', 'Suas pendências e tarefas em aberto, por área. Inclua abaixo ou pelo WhatsApp; o mural colorido agrupa por categoria para achar rápido na primeira tela.');
  c.innerHTML += `
    <div id="pend-mural" class="postit-mural"></div>
    <form id="pend-form" class="barra" style="flex-wrap:wrap">
      <input id="pd-nome" placeholder="Pendência *" style="flex:2;min-width:220px" required aria-label="Pendência">
      <input id="pd-cat" list="pend-cats-dl" placeholder="Área / categoria" style="width:190px" aria-label="Área">
      <input id="pd-obs" placeholder="Observação (opcional)" style="flex:1;min-width:150px" aria-label="Observação">
      <button class="btn" type="submit">+ Adicionar</button>
    </form>
    <datalist id="pend-cats-dl"></datalist>
    <p class="sub" style="margin:-4px 0 10px">Dica: digite uma <b>área nova</b> no campo de categoria para criá-la na hora. Para mudar a área de uma pendência já existente, use o seletor na linha dela.</p>
    <div id="pend-lista" class="lista-itens"><p class="vazio">Carregando…</p></div>
    <details style="margin-top:22px">
      <summary style="cursor:pointer;font-weight:700;color:var(--petroleo)">🗄️ Pendências concluídas (arquivo)</summary>
      <input id="pend-busca" type="search" placeholder="🔎 Buscar no arquivo (texto, área, quem)…" style="width:100%;max-width:520px;margin:12px 0 10px" aria-label="Buscar no arquivo">
      <div id="pend-arquivo"><p class="vazio">Carregando…</p></div>
    </details>`;
  $('#pend-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const nome = $('#pd-nome').value.trim(); if (!nome) return;
    const categoria = $('#pd-cat').value.trim();
    try {
      await api('POST', '/listas/pendencias', { nome, obs: $('#pd-obs').value, categoria });
      await garantirCategoria(categoria);
      $('#pend-form').reset(); $('#pd-nome').focus();
      carregarPendencias();
    } catch (e) { alert(e.message); }
  };
  let bt; $('#pend-busca').oninput = () => { clearTimeout(bt); bt = setTimeout(() => carregarArquivoPend($('#pend-busca').value.trim()), 300); };
  carregarPendencias();
}
async function carregarArquivoPend(busca) {
  const box = $('#pend-arquivo'); if (!box) return;
  try {
    const r = await api('GET', '/pendencias/arquivo' + (busca ? '?busca=' + encodeURIComponent(busca) : ''));
    const itens = r.itens || [];
    if (!itens.length) { box.innerHTML = `<p class="vazio">${busca ? 'Nada encontrado no arquivo.' : 'Nenhuma pendência concluída ainda.'}</p>`; return; }
    const chips = (r.porCategoria || []).map(c => `<span class="cat-badge" style="background:${pendCor(c.cat === 'Sem área' ? '' : c.cat)}">${esc(c.cat)} · ${c.n}</span>`).join('');
    box.innerHTML = `<p class="sub" style="margin:0 0 8px">${r.filtrados}${r.filtrados < r.total ? ' de ' + r.total : ''} concluída(s)${r.filtrados > itens.length ? ' · mostrando ' + itens.length : ''}</p>` +
      (chips ? `<div class="pend-arq-chips" title="Arquivadas por categoria">${chips}</div>` : '') +
      itens.map(i => `
      <div class="pend-linha" style="opacity:.9">
        <span class="cat-badge" style="background:${pendCor(i.categoria)}">${esc(i.categoria || 'sem área')}</span>
        <span class="nome">${esc(i.nome)}${i.obs ? ` <span class="obs">— ${esc(i.obs)}</span>` : ''}</span>
        <span class="quem">✅ ${esc((i.concluidoEm || '').slice(0, 10))} · ${esc(i.concluidoPor || i.quem || '')}</span>
        <button class="btn peq secund" data-restaurar="${i.id}" title="Voltar às pendências ativas">↩︎ Restaurar</button>
        <button class="btn peq perigo" data-arqdel="${i.id}" title="Excluir do arquivo (definitivo)">✕</button>
      </div>`).join('');
    box.querySelectorAll('[data-restaurar]').forEach(b => b.onclick = async () => {
      try { await api('POST', '/pendencias/arquivo/' + b.dataset.restaurar + '/restaurar'); carregarPendencias(); } catch (e) { alert(e.message); }
    });
    box.querySelectorAll('[data-arqdel]').forEach(b => b.onclick = async () => {
      if (!confirm('Excluir do arquivo? Não dá para desfazer.')) return;
      try { await api('DELETE', '/pendencias/arquivo/' + b.dataset.arqdel); carregarArquivoPend($('#pend-busca') ? $('#pend-busca').value.trim() : ''); } catch (e) { alert(e.message); }
    });
  } catch (e) { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
async function carregarPendencias() {
  try {
    const [cats, lista] = await Promise.all([
      api('GET', '/pendencias/categorias'),
      api('GET', '/listas/pendencias'),
    ]);
    PEND_CATS = (cats.categorias || []).slice().sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base' }));
    const itens = lista.itens || [];
    PEND_ITENS = itens;
    const dl = $('#pend-cats-dl'); if (dl) dl.innerHTML = PEND_CATS.map(c => `<option value="${esc(c)}">`).join('');
    // agrupa por categoria; ordem = categorias do store (com itens) + extras + "sem área" por último
    const grupos = {}; itens.forEach(i => { const k = i.categoria || ''; (grupos[k] = grupos[k] || []).push(i); });
    const ordem = PEND_CATS.filter(cat => (grupos[cat] || []).length);
    Object.keys(grupos).forEach(k => { if (k && !ordem.some(o => o.toLowerCase() === k.toLowerCase())) ordem.push(k); });
    if ((grupos[''] || []).length) ordem.push('');
    // ---- Mural de post-its ----
    const mural = $('#pend-mural');
    if (mural) mural.innerHTML = ordem.length ? ordem.map(cat => {
      const its = grupos[cat] || [];
      return `<div class="postit" style="--pcor:${pendCor(cat)}">
        <div class="postit-cab"><span class="postit-tit">${esc(cat || 'Sem área')}</span><span class="postit-n">${its.length}</span></div>
        <ul class="postit-lista">${its.map(i => `<li><button class="postit-check" data-baixa="${i.id}" title="Concluir">✓</button><span>${esc(i.nome)}</span></li>`).join('')}</ul>
      </div>`;
    }).join('') : `<p class="vazio" style="margin:0">Sem pendências no momento. 🎉</p>`;
    // ---- Lista detalhada (seletor de área por item) ----
    const alvo = $('#pend-lista');
    const opcoesCat = (sel) => `<option value="">— sem área —</option>` + PEND_CATS.map(c => `<option value="${esc(c)}"${sel && sel.toLowerCase() === c.toLowerCase() ? ' selected' : ''}>${esc(c)}</option>`).join('');
    if (alvo) alvo.innerHTML = itens.length
      ? `<div class="lista-cab"><span>${itens.length} ${itens.length === 1 ? 'pendência' : 'pendências'}</span><button class="btn peq secund" id="pend-limpar" title="Conclui e arquiva todas">Concluir todas</button></div>` +
        itens.map(i => `
        <div class="pend-linha">
          <span class="cat-badge" style="background:${pendCor(i.categoria)}">${esc(i.categoria || 'sem área')}</span>
          <span class="nome">${esc(i.nome)}${i.obs ? ` <span class="obs">— ${esc(i.obs)}</span>` : ''}</span>
          <span class="quem">${i.origem === 'whatsapp' ? '📱' : '💻'} ${esc(i.quem || '')} · ${dataBr(i.criadoEm)}</span>
          <select class="pend-cat-sel" data-cat="${i.id}" title="Mudar a área">${opcoesCat(i.categoria)}</select>
          <button class="btn peq secund" data-editar="${i.id}" title="Editar o texto">✏️</button>
          <button class="btn peq" data-baixa="${i.id}" title="Concluir (vai para o arquivo)">✓</button>
          <button class="btn peq perigo" data-excluir="${i.id}" title="Excluir sem arquivar">🗑️</button>
        </div>`).join('')
      : `<p class="vazio">Nenhuma pendência. Adicione a primeira acima.</p>`;
    document.querySelectorAll('#pend-mural [data-baixa], #pend-lista [data-baixa]').forEach(b => b.onclick = async () => {
      try { await api('DELETE', '/listas/pendencias/' + b.dataset.baixa); carregarPendencias(); } catch (e) { alert(e.message); }
    });
    document.querySelectorAll('.pend-cat-sel').forEach(s => s.onchange = async () => {
      try { await api('PATCH', '/listas/pendencias/' + s.dataset.cat, { categoria: s.value }); carregarPendencias(); } catch (e) { alert(e.message); }
    });
    // Editar o texto (e observação) da pendência — edição inline na própria linha.
    document.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => {
      const it = PEND_ITENS.find(x => x.id === b.dataset.editar); if (!it) return;
      const row = b.closest('.pend-linha'); if (!row) return;
      row.innerHTML = `
        <input class="pd-ed-nome" value="${esc(it.nome)}" style="flex:2;min-width:180px" aria-label="Texto da pendência">
        <input class="pd-ed-obs" value="${esc(it.obs || '')}" placeholder="Observação (opcional)" style="flex:1;min-width:130px" aria-label="Observação">
        <button class="btn peq" data-salvar="${it.id}">Salvar</button>
        <button class="btn peq secund" data-cancelar="1">Cancelar</button>`;
      const nomeInp = row.querySelector('.pd-ed-nome'); nomeInp.focus(); nomeInp.select();
      const salvar = async () => {
        const nome = row.querySelector('.pd-ed-nome').value.trim(); if (!nome) { nomeInp.focus(); return; }
        try { await api('PATCH', '/listas/pendencias/' + it.id, { nome, obs: row.querySelector('.pd-ed-obs').value }); carregarPendencias(); } catch (e) { alert(e.message); }
      };
      row.querySelector('[data-salvar]').onclick = salvar;
      row.querySelector('[data-cancelar]').onclick = () => carregarPendencias();
      nomeInp.onkeydown = (e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') carregarPendencias(); };
    });
    // Excluir SEM arquivar (não conclui, não vai para o arquivo).
    document.querySelectorAll('[data-excluir]').forEach(b => b.onclick = async () => {
      if (!confirm('Excluir esta pendência SEM arquivar? Ela não vai para o arquivo de concluídas.')) return;
      try { await api('DELETE', '/listas/pendencias/' + b.dataset.excluir + '?arquivar=nao'); carregarPendencias(); } catch (e) { alert(e.message); }
    });
    const lb = $('#pend-limpar');
    if (lb) lb.onclick = async () => { if (confirm('Concluir e ARQUIVAR todas as pendências ativas?')) { try { await api('POST', '/listas/pendencias/limpar'); carregarPendencias(); } catch (e) { alert(e.message); } } };
    // mantém o arquivo em sincronia (uma pendência concluída acabou de entrar nele)
    if ($('#pend-arquivo')) carregarArquivoPend($('#pend-busca') ? $('#pend-busca').value.trim() : '');
  } catch (e) { const a = $('#pend-lista'); if (a) a.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Bloco de Notas (anotações livres, estilo post-it) ---------
// Mesmo espírito das Pendências, mas para texto livre: o "bloco de notas do celular" no portal.
const NOTA_CORES = ['#ffe08a', '#ffd0a6', '#bff0c3', '#a6e6e6', '#c8bdf0', '#f7c0e6', '#f3f0a6', '#a6d8ff', '#ffb3b3', '#c9f0d8', '#e6c9a0', '#d4c5f9'];
let NOTA_COR_NOVA = NOTA_CORES[0];
let NOTAS = [];
function paletaHtml(sel, attr) {
  return `<div class="nota-cores">${NOTA_CORES.map(c => `<button type="button" class="nota-cor" style="background:${c}" ${attr}="${c}" aria-label="Cor da nota" aria-pressed="${c === sel ? 'true' : 'false'}"></button>`).join('')}</div>`;
}
function ligarPaleta(raiz, attr, aoEscolher) {
  raiz.querySelectorAll('[' + attr + ']').forEach(b => b.onclick = () => {
    raiz.querySelectorAll('[' + attr + ']').forEach(o => o.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', 'true');
    aoEscolher(b.getAttribute(attr));
  });
}
async function renderNotas() {
  const c = conteudo();
  c.innerHTML = cabecalho('🗒️ Bloco de Notas', 'Suas anotações livres — o bloco de notas do celular aqui dentro. Escreva, fixe o que importa e edite a qualquer hora. Só você (área CEO) enxerga.');
  c.innerHTML += `
    <form id="nota-form" class="form" style="max-width:640px;background:#fff;border:1px solid var(--borda);border-radius:12px;padding:14px">
      <label>Título (opcional)<input id="nt-titulo" maxlength="120" placeholder="Ex.: Ideias para o Réveillon"></label>
      <label>Anotação<textarea id="nt-texto" rows="4" maxlength="8000" placeholder="Escreva aqui… pode usar várias linhas."></textarea></label>
      <div id="nota-paleta-nova" style="margin:2px 0 10px">${paletaHtml(NOTA_COR_NOVA, 'data-cor-nova')}</div>
      <button class="btn" type="submit">+ Salvar nota</button>
    </form>
    <div class="barra" style="margin:16px 0 4px;flex-wrap:wrap">
      <input id="nota-busca" type="search" placeholder="🔎 Buscar nas notas…" style="flex:1;min-width:220px" aria-label="Buscar nas notas">
    </div>
    <div id="notas-mural" class="postit-mural notas-mural"><p class="vazio">Carregando…</p></div>
    <details style="margin-top:18px">
      <summary style="cursor:pointer;font-weight:700;color:var(--petroleo)">🗄️ Notas arquivadas</summary>
      <input id="nota-arq-busca" type="search" placeholder="🔎 Buscar no arquivo…" style="width:100%;max-width:520px;margin:12px 0 10px" aria-label="Buscar no arquivo de notas">
      <div id="notas-arquivo"><p class="vazio">Carregando…</p></div>
    </details>`;
  ligarPaleta($('#nota-paleta-nova'), 'data-cor-nova', (cor) => { NOTA_COR_NOVA = cor; });
  $('#nota-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const titulo = $('#nt-titulo').value.trim(), texto = $('#nt-texto').value.trim();
    if (!titulo && !texto) { $('#nt-texto').focus(); return; }
    try {
      await api('POST', '/notas', { titulo, texto, cor: NOTA_COR_NOVA });
      $('#nt-titulo').value = ''; $('#nt-texto').value = ''; $('#nt-titulo').focus();
      carregarNotas();
    } catch (e) { alert(e.message); }
  };
  let bt; $('#nota-busca').oninput = () => { clearTimeout(bt); bt = setTimeout(carregarNotas, 250); };
  let ba; $('#nota-arq-busca').oninput = () => { clearTimeout(ba); ba = setTimeout(() => carregarNotasArquivo($('#nota-arq-busca').value.trim()), 300); };
  carregarNotas();
  carregarNotasArquivo('');
}
function notaPostitHtml(n) {
  const quando = n.atualizadoEm && n.atualizadoEm !== n.criadoEm ? 'editada ' + dataBr(n.atualizadoEm) : dataBr(n.criadoEm);
  return `<div class="postit nota-postit${n.fixado ? ' nota-fixada' : ''}" style="--pcor:${esc(n.cor || NOTA_CORES[0])}" data-nota="${esc(n.id)}">
    <div class="postit-cab">
      <span class="postit-tit">${n.fixado ? '📌 ' : ''}${esc(n.titulo || 'Sem título')}</span>
      <span class="nota-acoes">
        <button class="nota-btn" data-fixar="${esc(n.id)}" title="${n.fixado ? 'Desafixar' : 'Fixar no topo'}">${n.fixado ? '📌' : '📍'}</button>
        <button class="nota-btn" data-editar-nota="${esc(n.id)}" title="Editar">✏️</button>
        <button class="nota-btn" data-arquivar-nota="${esc(n.id)}" title="Arquivar (vai para as notas arquivadas)">🗄️</button>
      </span>
    </div>
    ${n.texto ? `<div class="nota-texto">${esc(n.texto)}</div>` : ''}
    <div class="nota-pe">${esc(quando)}</div>
  </div>`;
}
async function carregarNotas() {
  const mural = $('#notas-mural'); if (!mural) return;
  const busca = $('#nota-busca') ? $('#nota-busca').value.trim() : '';
  try {
    const r = await api('GET', '/notas' + (busca ? '?busca=' + encodeURIComponent(busca) : ''));
    NOTAS = r.notas || [];
    mural.innerHTML = NOTAS.length
      ? NOTAS.map(notaPostitHtml).join('')
      : `<p class="vazio" style="margin:0">${busca ? 'Nenhuma nota encontrada para essa busca.' : 'Nenhuma nota ainda. Escreva a primeira acima. 🗒️'}</p>`;
    mural.querySelectorAll('[data-fixar]').forEach(b => b.onclick = async () => {
      const n = NOTAS.find(x => x.id === b.dataset.fixar); if (!n) return;
      try { await api('PATCH', '/notas/' + n.id, { fixado: !n.fixado }); carregarNotas(); } catch (e) { alert(e.message); }
    });
    mural.querySelectorAll('[data-arquivar-nota]').forEach(b => b.onclick = async () => {
      if (!confirm('Arquivar esta nota? Ela sai do mural e fica em "Notas arquivadas".')) return;
      try { await api('DELETE', '/notas/' + b.dataset.arquivarNota); carregarNotas(); carregarNotasArquivo($('#nota-arq-busca') ? $('#nota-arq-busca').value.trim() : ''); } catch (e) { alert(e.message); }
    });
    mural.querySelectorAll('[data-editar-nota]').forEach(b => b.onclick = () => editarNota(b.dataset.editarNota));
  } catch (e) { mural.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
// Edição no próprio post-it: título, texto e cor.
function editarNota(id) {
  const n = NOTAS.find(x => x.id === id); if (!n) return;
  const card = document.querySelector(`.nota-postit[data-nota="${CSS.escape(id)}"]`); if (!card) return;
  let cor = n.cor || NOTA_CORES[0];
  card.innerHTML = `
    <input class="nota-ed-titulo" maxlength="120" value="${esc(n.titulo || '')}" placeholder="Título (opcional)" aria-label="Título da nota">
    <textarea class="nota-ed-texto" rows="5" maxlength="8000" placeholder="Anotação" aria-label="Texto da nota">${esc(n.texto || '')}</textarea>
    ${paletaHtml(cor, 'data-cor-ed')}
    <div class="nota-ed-acoes">
      <button class="btn peq" data-salvar-nota="1">Salvar</button>
      <button class="btn peq secund" data-cancelar-nota="1">Cancelar</button>
      <button class="btn peq perigo" data-excluir-nota="1" title="Excluir de vez, sem arquivar">🗑️ Excluir</button>
    </div>`;
  card.style.setProperty('--pcor', cor);
  ligarPaleta(card, 'data-cor-ed', (c) => { cor = c; card.style.setProperty('--pcor', c); });
  const ti = card.querySelector('.nota-ed-titulo'); ti.focus();
  const salvar = async () => {
    const titulo = card.querySelector('.nota-ed-titulo').value.trim();
    const texto = card.querySelector('.nota-ed-texto').value.trim();
    if (!titulo && !texto) { alert('A nota não pode ficar vazia.'); return; }
    try { await api('PATCH', '/notas/' + id, { titulo, texto, cor }); carregarNotas(); } catch (e) { alert(e.message); }
  };
  card.querySelector('[data-salvar-nota]').onclick = salvar;
  card.querySelector('[data-cancelar-nota]').onclick = () => carregarNotas();
  card.querySelector('[data-excluir-nota]').onclick = async () => {
    if (!confirm('Excluir esta nota DE VEZ? Ela não vai para o arquivo.')) return;
    try { await api('DELETE', '/notas/' + id + '?arquivar=nao'); carregarNotas(); } catch (e) { alert(e.message); }
  };
  ti.onkeydown = (e) => { if (e.key === 'Escape') carregarNotas(); };
}
async function carregarNotasArquivo(busca) {
  const box = $('#notas-arquivo'); if (!box) return;
  try {
    const r = await api('GET', '/notas/arquivo' + (busca ? '?busca=' + encodeURIComponent(busca) : ''));
    const notas = r.notas || [];
    if (!notas.length) { box.innerHTML = `<p class="vazio">${busca ? 'Nada encontrado no arquivo.' : 'Nenhuma nota arquivada.'}</p>`; return; }
    box.innerHTML = `<p class="sub" style="margin:0 0 8px">${r.filtradas}${r.filtradas < r.total ? ' de ' + r.total : ''} nota(s) arquivada(s)</p>` +
      notas.map(n => `
      <div class="pend-linha">
        <span class="cat-badge" style="background:${esc(n.cor || NOTA_CORES[0])}">🗒️</span>
        <span class="nome">${esc(n.titulo || 'Sem título')}${n.texto ? ` <span class="obs">— ${esc(n.texto.slice(0, 140))}${n.texto.length > 140 ? '…' : ''}</span>` : ''}</span>
        <span class="quem">🗄️ ${esc((n.arquivadoEm || '').slice(0, 10))} · ${esc(n.arquivadoPor || n.quem || '')}</span>
        <button class="btn peq secund" data-restaurar-nota="${esc(n.id)}" title="Voltar ao mural">↩︎ Restaurar</button>
        <button class="btn peq perigo" data-apagar-nota="${esc(n.id)}" title="Excluir do arquivo (definitivo)">✕</button>
      </div>`).join('');
    box.querySelectorAll('[data-restaurar-nota]').forEach(b => b.onclick = async () => {
      try { await api('POST', '/notas/arquivo/' + b.dataset.restaurarNota + '/restaurar'); carregarNotas(); carregarNotasArquivo(busca); } catch (e) { alert(e.message); }
    });
    box.querySelectorAll('[data-apagar-nota]').forEach(b => b.onclick = async () => {
      if (!confirm('Excluir do arquivo? Não dá para desfazer.')) return;
      try { await api('DELETE', '/notas/arquivo/' + b.dataset.apagarNota); carregarNotasArquivo(busca); } catch (e) { alert(e.message); }
    });
  } catch (e) { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
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
