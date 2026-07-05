'use strict';
// ============================================================================
// Portal Staff — módulo: app-recursos
// Automações, Auditoria, Equipamentos (ativos), Estoque, Materiais de marca, Calendário editorial, Depoimentos e Redes sociais.
// Compartilha o escopo global com app-core.js (scripts clássicos, sem import/export).
// ============================================================================
// --------- Semáforo de automações (admin) ---------
async function renderAutomacoes() {
  const c = conteudo();
  c.innerHTML = cabecalho('Automações', 'Verde = em dia · âmbar = atrasada · vermelho = muito atrasada ou com erro. O monitor local anota o 🔎 motivo (última execução/erro da Tarefa do Windows), 🛠️ tenta corrigir sozinho os casos conhecidos e avisa você no WhatsApp quando algo quebra.') + '<div id="au-lista"><p class="vazio">Carregando…</p></div>';
  try {
    const { itens } = await api('GET', '/automacoes');
    if (!itens.length) { $('#au-lista').innerHTML = '<div class="vazio">Nenhuma automação registrou heartbeat ainda. As rotinas passam a aparecer aqui quando reportarem execução.</div>'; return; }
    const dot = { verde: 'var(--ok)', ambar: 'var(--cerrado)', vermelho: 'var(--alerta)' };
    $('#au-lista').innerHTML = itens.map(a => `<div class="linha-item" style="border-left:4px solid ${dot[a.semaforo]}">
      <span class="qtd" style="background:${dot[a.semaforo]};color:#fff">●</span>
      <span class="nome">${esc(a.tarefa)} ${a.detalhe ? `<span class="obs">${esc(a.detalhe)}</span>` : ''}
        <br><span class="obs">${a.grupo ? esc(a.grupo) + ' · ' : ''}última há ${a.idadeHoras}h${a.status === 'erro' ? ' · ⚠️ reportou ERRO' : ''} · validade ${a.validadeHoras}h</span>
        ${a.diagnostico ? `<br><span class="obs" style="color:var(--alerta)">🔎 ${esc(a.diagnostico)}</span>` : ''}
        ${a.correcao ? `<br><span class="obs" style="color:var(--ok)">🛠️ ${esc(a.correcao)}</span>` : ''}</span>
      <span class="quem">${dataBr(a.ultima)}</span>
      <button class="btn peq perigo" data-del-au="${encodeURIComponent(a.tarefa)}" style="grid-column:2;grid-row:1/span 3">✕</button>
    </div>`).join('');
    $('#au-lista').querySelectorAll('[data-del-au]').forEach(b => b.onclick = async () => { if (!confirm('Remover esta automação do painel?')) return; try { await api('DELETE', '/automacoes/' + b.dataset.delAu); renderAutomacoes(); } catch (e) { alert(e.message); } });
  } catch (e) { $('#au-lista').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Auditoria (admin) ---------
async function renderAuditoria() {
  const c = conteudo();
  c.innerHTML = cabecalho('Auditoria', 'Registro das ações sensíveis (usuários, reservas/bloqueios na Stays, lançamentos em conta corrente).') + '<div id="ad-lista"><p class="vazio">Carregando…</p></div>';
  try {
    const { eventos } = await api('GET', '/auditoria?n=200');
    if (!eventos.length) { $('#ad-lista').innerHTML = '<div class="vazio">Nenhum evento registrado ainda.</div>'; return; }
    $('#ad-lista').innerHTML = `<table><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>
      ${eventos.map(e => `<tr><td>${dataBr(e.quando)}</td><td>${esc(e.quem || '—')}</td><td><span class="chip">${esc(e.acao || '')}</span></td><td>${esc(e.detalhe || '')}</td></tr>`).join('')}
    </tbody></table>`;
  } catch (e) { $('#ad-lista').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Equipamentos (ativos): ficha com histórico e gasto ---------
async function renderAtivos() {
  const c = conteudo();
  c.innerHTML = cabecalho('Equipamentos', 'Ficha de cada ativo (ar-condicionado, aquecedor, piscina…) com histórico de chamados e gasto acumulado. Vincule os chamados ao equipamento para decidir troca × conserto com dado.') + `
    <details class="cr-box" id="at-box"><summary class="cr-sum">➕ Novo equipamento</summary>
      <form class="form" id="at-form" style="max-width:660px;margin-top:12px">
        <input type="hidden" id="at-id">
        <label>Nome * <input id="at-nome" required maxlength="120" placeholder="ex.: Ar-condicionado Sala"></label>
        <div class="hi-grid">
          <label>Casa / unidade <input id="at-casa" maxlength="80"></label>
          <label>Categoria <select id="at-cat"></select></label>
          <label>Marca <input id="at-marca" maxlength="60"></label>
          <label>Modelo <input id="at-modelo" maxlength="60"></label>
          <label>Instalado em <input id="at-data" type="date"></label>
        </div>
        <label>Observação <input id="at-obs" maxlength="200"></label>
        <button class="btn" type="submit" id="at-salvar">Adicionar</button>
      </form>
    </details>
    <div id="at-lista"><p class="vazio">Carregando…</p></div>`;
  try { const { categorias } = await api('GET', '/ativos'); $('#at-cat').innerHTML = categorias.map(x => `<option value="${x}">${x}</option>`).join(''); } catch (_) {}
  $('#at-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { nome: $('#at-nome').value.trim(), casa: $('#at-casa').value.trim(), categoria: $('#at-cat').value, marca: $('#at-marca').value.trim(), modelo: $('#at-modelo').value.trim(), dataInstalacao: $('#at-data').value, obs: $('#at-obs').value.trim() };
    try { const id = $('#at-id').value; if (id) await api('PATCH', '/ativos/' + id, corpo); else await api('POST', '/ativos', corpo); $('#at-form').reset(); $('#at-id').value = ''; $('#at-salvar').textContent = 'Adicionar'; $('#at-box').open = false; carregarAtivos(); }
    catch (e) { alert(e.message); }
  };
  carregarAtivos();
}
async function carregarAtivos() {
  const alvo = $('#at-lista'); if (!alvo) return;
  try {
    const { ativos } = await api('GET', '/ativos');
    if (!ativos.length) { alvo.innerHTML = '<div class="vazio">Nenhum equipamento cadastrado. Adicione os ativos das casas (ar-condicionado, aquecedor, bomba da piscina…).</div>'; return; }
    alvo.innerHTML = ativos.map(a => `<div class="item">
      <h3 style="margin:0 0 4px">${esc(a.nome)}</h3>
      <div class="meta"><span class="chip">${esc(a.categoria)}</span>${a.casa ? `<span class="chip">${esc(a.casa)}</span>` : ''}${a.marca || a.modelo ? `<span>${esc([a.marca, a.modelo].filter(Boolean).join(' '))}</span>` : ''}${a.dataInstalacao ? `<span>instalado ${esc(a.dataInstalacao)}</span>` : ''}</div>
      <div class="meta" style="margin-top:6px"><span>🛠️ ${a.chamados} chamado(s)</span><span>💸 gasto acumulado <b>${rMoney(a.gastoAcumulado)}</b></span></div>
      ${a.obs ? `<p style="margin:6px 0 0;font-size:.9rem">${esc(a.obs)}</p>` : ''}
      <div class="acoes"><button class="btn peq" data-hist="${a.id}" data-n="${esc(a.nome)}">Ver histórico</button><button class="btn peq secund" data-edit-at="${a.id}">Editar</button><button class="btn peq perigo" data-del-at="${a.id}">Excluir</button></div>
    </div>`).join('');
    alvo.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => abrirAtivo(b.dataset.hist, b.dataset.n));
    alvo.querySelectorAll('[data-del-at]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este equipamento? (os chamados não são apagados)')) return; try { await api('DELETE', '/ativos/' + b.dataset.delAt); carregarAtivos(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-edit-at]').forEach(b => b.onclick = async () => {
      const { ativo: a } = await api('GET', '/ativos/' + b.dataset.editAt);
      $('#at-id').value = a.id; $('#at-nome').value = a.nome; $('#at-casa').value = a.casa || ''; $('#at-cat').value = a.categoria; $('#at-marca').value = a.marca || ''; $('#at-modelo').value = a.modelo || ''; $('#at-data').value = a.dataInstalacao || ''; $('#at-obs').value = a.obs || '';
      $('#at-salvar').textContent = 'Salvar alterações'; $('#at-box').open = true; window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
async function abrirAtivo(id, nome) {
  try {
    const { ativo: a, chamados, gastoAcumulado } = await api('GET', '/ativos/' + id);
    const rot = { aberto: 'Aberto', agendado: 'Agendado', em_execucao: 'Em execução', concluido: 'Concluído' };
    conteudo().innerHTML = `<button class="btn secund peq" id="at-voltar">← Voltar aos equipamentos</button>
      ${cabecalho(a.nome, [a.categoria, a.casa].filter(Boolean).join(' · '))}
      <div class="cards"><div class="card"><div class="n">${chamados.length}</div><div class="rot">Chamados</div></div>
        <div class="card"><div class="n">${rMoney(gastoAcumulado)}</div><div class="rot">Gasto acumulado</div></div></div>
      <h2 class="titulo" style="font-size:1.15rem">Histórico de chamados</h2>
      ${chamados.length ? chamados.map(ch => `<div class="linha-item"><span class="qtd">${dataBr(ch.criadoEm).slice(0, 5)}</span><span class="nome">${esc(ch.titulo)} <span class="obs">${rot[ch.status] || ch.status}${ch.tecnico ? ' · ' + esc(ch.tecnico) : ''}</span></span><span class="quem">${ch.custo != null ? rMoney(ch.custo) : '—'}</span></div>`).join('') : '<div class="vazio">Sem chamados vinculados. Ao abrir um chamado, escolha este equipamento no campo “Equipamento”.</div>'}`;
    $('#at-voltar').onclick = () => navegar('ativos');
  } catch (e) { alert(e.message); }
}

// --------- Estoque (enxoval / amenities) com mínimo e reposição ---------
async function renderEstoque() {
  const c = conteudo();
  c.innerHTML = cabecalho('Estoque & enxoval', 'Controle de enxoval e amenities por casa. Itens abaixo do mínimo ficam em destaque; toque em “Repor” para jogar na lista de compras.') + `
    <details class="cr-box" id="es-box"><summary class="cr-sum">➕ Novo item</summary>
      <form class="form" id="es-form" style="max-width:660px;margin-top:12px">
        <input type="hidden" id="es-id">
        <label>Item * <input id="es-item" required maxlength="120" placeholder="ex.: Jogo de toalhas, Shampoo, Papel higiênico"></label>
        <div class="hi-grid">
          <label>Casa <input id="es-casa" maxlength="80"></label>
          <label>Categoria <input id="es-cat" maxlength="60" placeholder="enxoval / amenities / limpeza"></label>
          <label>Quantidade <input id="es-qtd" type="number" min="0" step="1"></label>
          <label>Mínimo <input id="es-min" type="number" min="0" step="1"></label>
          <label>Unidade <input id="es-un" maxlength="12" placeholder="un / jogo / pct"></label>
        </div>
        <label>Observação <input id="es-obs" maxlength="200"></label>
        <button class="btn" type="submit" id="es-salvar">Adicionar</button>
      </form>
    </details>
    <div id="es-lista"><p class="vazio">Carregando…</p></div>`;
  $('#es-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { item: $('#es-item').value.trim(), casa: $('#es-casa').value.trim(), categoria: $('#es-cat').value.trim(), quantidade: $('#es-qtd').value, minimo: $('#es-min').value, unidade: $('#es-un').value.trim(), obs: $('#es-obs').value.trim() };
    try { const id = $('#es-id').value; if (id) await api('PATCH', '/estoque/' + id, corpo); else await api('POST', '/estoque', corpo); $('#es-form').reset(); $('#es-id').value = ''; $('#es-salvar').textContent = 'Adicionar'; $('#es-box').open = false; carregarEstoque(); }
    catch (e) { alert(e.message); }
  };
  carregarEstoque();
}
async function carregarEstoque() {
  const alvo = $('#es-lista'); if (!alvo) return;
  try {
    const { itens } = await api('GET', '/estoque');
    const baixos = itens.filter(i => i.baixo).length;
    if (!itens.length) { alvo.innerHTML = '<div class="vazio">Nenhum item no estoque. Cadastre o enxoval e os amenities por casa.</div>'; return; }
    alvo.innerHTML = (baixos ? `<div class="aviso">⚠️ ${baixos} item(ns) no mínimo ou abaixo — considere repor.</div>` : '') + itens.map(i => `
      <div class="linha-item" style="${i.baixo ? 'border-left:4px solid var(--alerta)' : ''}">
        <span class="qtd" style="${i.baixo ? 'color:var(--alerta)' : ''}">${i.quantidade}${i.unidade ? ' ' + esc(i.unidade) : ''}</span>
        <span class="nome">${esc(i.item)} ${i.casa ? `<span class="obs">${esc(i.casa)}</span>` : ''}${i.categoria ? ` <span class="chip">${esc(i.categoria)}</span>` : ''}
          <br><span class="obs">mínimo ${i.minimo}${i.unidade ? ' ' + esc(i.unidade) : ''}${i.baixo ? ' · ⚠️ repor' : ''}${i.obs ? ' · ' + esc(i.obs) : ''}</span></span>
        <div class="acoes" style="grid-column:2;grid-row:1/span 3">
          <button class="btn peq secund" data-mais="${i.id}">＋</button>
          <button class="btn peq secund" data-menos="${i.id}">－</button>
          <button class="btn peq" data-repor="${i.id}">Repor</button>
          <button class="btn peq perigo" data-del-es="${i.id}">✕</button>
        </div></div>`).join('');
    const ajusta = async (id, delta) => { const it = itens.find(x => x.id === id); if (!it) return; try { await api('PATCH', '/estoque/' + id, { quantidade: Math.max(0, Number(it.quantidade) + delta) }); carregarEstoque(); } catch (e) { alert(e.message); } };
    alvo.querySelectorAll('[data-mais]').forEach(b => b.onclick = () => ajusta(b.dataset.mais, 1));
    alvo.querySelectorAll('[data-menos]').forEach(b => b.onclick = () => ajusta(b.dataset.menos, -1));
    alvo.querySelectorAll('[data-repor]').forEach(b => b.onclick = async () => { try { const r = await api('POST', '/estoque/' + b.dataset.repor + '/repor', {}); alert(r.duplicado ? 'Este item já está na lista de compras.' : 'Adicionado à lista de compras.'); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-del-es]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este item do estoque?')) return; try { await api('DELETE', '/estoque/' + b.dataset.delEs); carregarEstoque(); } catch (e) { alert(e.message); } });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Galeria de materiais de marca ---------
const podeMktFront = () => ESTADO.me.papel === 'admin' || ESTADO.areas.includes('*') || ESTADO.areas.includes('marketing') || ESTADO.areas.includes('ceo');
async function renderMateriais() {
  const c = conteudo();
  c.innerHTML = cabecalho('Materiais de marca', 'Biblioteca de placas, QR codes, iscas, artes, logos e documentos da empresa. Baixe e reutilize.') + `
    ${podeMktFront() ? `<details class="cr-box" id="ma-box"><summary class="cr-sum">➕ Novo material</summary>
      <form class="form" id="ma-form" style="max-width:660px;margin-top:12px">
        <label>Título * <input id="ma-titulo" required maxlength="120"></label>
        <div class="hi-grid">
          <label>Categoria <select id="ma-cat"></select></label>
          <label>Tags <input id="ma-tags" maxlength="120" placeholder="ex.: lago sul, evento"></label>
        </div>
        <label>Arquivo (imagem, PDF, vídeo…) <input id="ma-arq" type="file"></label>
        <label>…ou link externo <input id="ma-url" placeholder="https://…"></label>
        <button class="btn" type="submit" id="ma-salvar">Adicionar</button>
        <p id="ma-msg" class="erro"></p>
      </form>
    </details>` : ''}
    <div class="barra"><label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Filtrar <select id="ma-filtro"><option value="">Todas as categorias</option></select></label></div>
    <div id="ma-grade" class="cards"><p class="vazio">Carregando…</p></div>`;
  let categorias = [];
  try { categorias = (await api('GET', '/materiais')).categorias; } catch (_) {}
  const optsCat = categorias.map(x => `<option value="${x}">${x}</option>`).join('');
  if ($('#ma-cat')) $('#ma-cat').innerHTML = optsCat;
  $('#ma-filtro').innerHTML = '<option value="">Todas as categorias</option>' + optsCat;
  $('#ma-filtro').onchange = () => carregarMateriais($('#ma-filtro').value);
  if (podeMktFront()) $('#ma-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const msg = $('#ma-msg'); msg.textContent = '';
    const corpo = { titulo: $('#ma-titulo').value.trim(), categoria: $('#ma-cat').value, tags: $('#ma-tags').value.trim() };
    const arq = $('#ma-arq').files[0];
    try {
      if (arq) { if (arq.size > 20 * 1024 * 1024) throw new Error('Arquivo acima de 20 MB.'); corpo.nomeArquivo = arq.name; corpo.base64 = await arquivoParaBase64(arq); }
      else if ($('#ma-url').value.trim()) corpo.url = $('#ma-url').value.trim();
      else throw new Error('Envie um arquivo ou um link.');
      await api('POST', '/materiais', corpo);
      $('#ma-form').reset(); $('#ma-box').open = false; carregarMateriais($('#ma-filtro').value);
    } catch (e) { msg.textContent = e.message; }
  };
  carregarMateriais('');
}
async function carregarMateriais(cat) {
  const alvo = $('#ma-grade'); if (!alvo) return;
  try {
    const { materiais } = await api('GET', '/materiais' + (cat ? '?categoria=' + encodeURIComponent(cat) : ''));
    if (!materiais.length) { alvo.className = ''; alvo.innerHTML = '<div class="vazio">Nenhum material ainda. Adicione as artes, placas e QR codes da marca.</div>'; return; }
    alvo.className = 'ma-grade';
    alvo.innerHTML = materiais.map(m => {
      const href = m.tipo === 'link' ? m.url : '/staff/api/materiais/' + m.id + '/arquivo';
      const thumb = m.tipo === 'imagem' ? `<img src="/staff/api/materiais/${m.id}/arquivo" alt="${esc(m.titulo)}" loading="lazy">` : `<div class="ma-ico">${m.tipo === 'link' ? '🔗' : (m.ext === '.pdf' ? '📄' : m.ext === '.mp4' ? '🎬' : '📎')}</div>`;
      return `<div class="ma-card">
        <a href="${esc(href)}" target="_blank" rel="noopener" class="ma-thumb">${thumb}</a>
        <div class="ma-info"><b>${esc(m.titulo)}</b><span class="chip">${esc(m.categoria)}</span>${m.tags ? `<span class="ma-tags">${esc(m.tags)}</span>` : ''}
          <div class="acoes"><a class="btn peq" href="${esc(href)}" target="_blank" rel="noopener" download>${m.tipo === 'link' ? 'Abrir' : 'Baixar'}</a>${podeMktFront() ? `<button class="btn peq perigo" data-del-ma="${m.id}">✕</button>` : ''}</div></div>
      </div>`;
    }).join('');
    alvo.querySelectorAll('[data-del-ma]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este material?')) return; try { await api('DELETE', '/materiais/' + b.dataset.delMa); carregarMateriais(cat); } catch (e) { alert(e.message); } });
  } catch (e) { alvo.className = ''; alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Calendário editorial (quadro por status) ---------
const ED_COLS = [{ id: 'ideia', rot: '💡 Ideia' }, { id: 'producao', rot: '✏️ Produção' }, { id: 'agendado', rot: '📅 Agendado' }, { id: 'publicado', rot: '✅ Publicado' }];
const ED_ICON = { instagram: '📷', facebook: '👍', tiktok: '🎵', linkedin: '💼', blog: '📝', email: '✉️', whatsapp: '💬', b2b: '🤝', outro: '•' };
async function renderEditorial() {
  const c = conteudo();
  let canais = EDIT_CANAIS_FALLBACK;
  c.innerHTML = cabecalho('Calendário editorial', 'Pautas de posts, artigos e campanhas — da ideia à publicação.') + `
    ${podeMktFront() ? `<details class="cr-box" id="ed-box"><summary class="cr-sum">➕ Nova pauta</summary>
      <form class="form" id="ed-form" style="max-width:660px;margin-top:12px">
        <input type="hidden" id="ed-id">
        <label>Título / pauta * <input id="ed-titulo" required maxlength="160"></label>
        <div class="hi-grid">
          <label>Canal <select id="ed-canal"></select></label>
          <label>Data <input id="ed-data" type="date"></label>
          <label>Responsável <input id="ed-resp" maxlength="60"></label>
          <label>Link <input id="ed-link" maxlength="300" placeholder="https://…"></label>
        </div>
        <label>Observação <input id="ed-obs" maxlength="200"></label>
        <button class="btn" type="submit" id="ed-salvar">Adicionar</button>
      </form>
    </details>` : ''}
    <div id="ed-board" class="kanban"><p class="vazio">Carregando…</p></div>`;
  try { canais = (await api('GET', '/marketing/editorial')).canais; } catch (_) {}
  if ($('#ed-canal')) $('#ed-canal').innerHTML = canais.map(x => `<option value="${x}">${x}</option>`).join('');
  if (podeMktFront()) $('#ed-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { titulo: $('#ed-titulo').value.trim(), canal: $('#ed-canal').value, data: $('#ed-data').value, responsavel: $('#ed-resp').value.trim(), link: $('#ed-link').value.trim(), obs: $('#ed-obs').value.trim() };
    try { const id = $('#ed-id').value; if (id) await api('PATCH', '/marketing/editorial/' + id, corpo); else await api('POST', '/marketing/editorial', corpo); $('#ed-form').reset(); $('#ed-id').value = ''; $('#ed-salvar').textContent = 'Adicionar'; $('#ed-box').open = false; carregarEditorial(); }
    catch (e) { alert(e.message); }
  };
  carregarEditorial();
}
async function carregarEditorial() {
  const board = $('#ed-board'); if (!board) return;
  try {
    const { itens } = await api('GET', '/marketing/editorial');
    const porCol = {}; ED_COLS.forEach(col => porCol[col.id] = []);
    itens.forEach(it => (porCol[it.status] || porCol.ideia).push(it));
    const opc = (a) => ED_COLS.map(col => `<option value="${col.id}" ${col.id === a ? 'selected' : ''}>${col.rot}</option>`).join('');
    board.innerHTML = ED_COLS.map(col => `<div class="col">
      <div class="col-head"><span>${col.rot}</span><span class="col-n">${porCol[col.id].length}</span></div>
      <div class="col-cards">${porCol[col.id].map(it => `<div class="kard" style="cursor:default">
        <div class="kard-nome">${ED_ICON[it.canal] || '•'} ${esc(it.titulo)}</div>
        <div class="kard-meta"><span class="chip">${esc(it.canal)}</span>${it.data ? `<span class="chip">${esc(it.data.slice(8, 10) + '/' + it.data.slice(5, 7))}</span>` : ''}</div>
        ${it.responsavel ? `<div class="kard-acao">👤 ${esc(it.responsavel)}</div>` : ''}${it.link ? `<div class="kard-origem"><a href="${esc(it.link)}" target="_blank" rel="noopener">abrir ↗</a></div>` : ''}
        ${podeMktFront() ? `<div class="acoes" style="margin-top:8px"><select data-mover-ed="${it.id}" style="font-size:.78rem;padding:4px 6px">${opc(it.status)}</select><button class="btn peq secund" data-edit-ed="${it.id}">✎</button><button class="btn peq perigo" data-del-ed="${it.id}">✕</button></div>` : ''}
      </div>`).join('') || '<div class="col-vazio">—</div>'}</div></div>`).join('');
    if (podeMktFront()) {
      board.querySelectorAll('[data-mover-ed]').forEach(s => s.onchange = async () => { try { await api('PATCH', '/marketing/editorial/' + s.dataset.moverEd, { status: s.value }); carregarEditorial(); } catch (e) { alert(e.message); } });
      board.querySelectorAll('[data-del-ed]').forEach(b => b.onclick = async () => { if (!confirm('Excluir esta pauta?')) return; try { await api('DELETE', '/marketing/editorial/' + b.dataset.delEd); carregarEditorial(); } catch (e) { alert(e.message); } });
      board.querySelectorAll('[data-edit-ed]').forEach(b => b.onclick = () => { const it = itens.find(x => x.id === b.dataset.editEd); if (!it) return; $('#ed-id').value = it.id; $('#ed-titulo').value = it.titulo; $('#ed-canal').value = it.canal; $('#ed-data').value = it.data || ''; $('#ed-resp').value = it.responsavel || ''; $('#ed-link').value = it.link || ''; $('#ed-obs').value = it.obs || ''; $('#ed-salvar').textContent = 'Salvar alterações'; $('#ed-box').open = true; window.scrollTo({ top: 0, behavior: 'smooth' }); });
    }
  } catch (e) { board.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
const EDIT_CANAIS_FALLBACK = ['instagram', 'facebook', 'tiktok', 'linkedin', 'blog', 'email', 'whatsapp', 'b2b', 'outro'];

// --------- Depoimentos (avaliações 5★ → prova social) ---------
async function renderDepoimentos() {
  const c = conteudo();
  c.innerHTML = cabecalho('Depoimentos', 'Avaliações positivas dos hóspedes prontas para virar prova social no site e nas redes. Marque as aprovadas para publicar (com consentimento).') + `
    <div class="barra"><label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Nota mínima
      <select id="dp-min"><option value="5">5★</option><option value="4" selected>4★+</option><option value="1">Todas</option></select></label></div>
    <div id="dp-lista"><p class="vazio">Carregando…</p></div>`;
  $('#dp-min').onchange = carregarDepoimentos;
  carregarDepoimentos();
}
async function carregarDepoimentos() {
  const alvo = $('#dp-lista'); if (!alvo) return;
  try {
    const { depoimentos, publicados } = await api('GET', '/marketing/depoimentos?min=' + ($('#dp-min').value || 4));
    if (!depoimentos.length) { alvo.innerHTML = '<div class="vazio">Ainda não há avaliações com comentário nessa faixa. As avaliações 5★ da Área do Hóspede aparecem aqui.</div>'; return; }
    alvo.innerHTML = `<p class="sub" style="margin:0 0 10px">${depoimentos.length} depoimento(s) · ${publicados} aprovado(s) para publicar</p>` + depoimentos.map(d => `
      <div class="item" style="${d.publicado ? 'border-left:4px solid var(--ok)' : ''}">
        <div class="meta"><span>${'★'.repeat(Number(d.nota) || 0)}${'☆'.repeat(5 - (Number(d.nota) || 0))}</span>${d.imovel ? `<span class="chip">${esc(d.imovel)}</span>` : ''}<span>· ${esc(d.hospedeNome)} · ${dataBr(d.criadoEm)}</span>${d.publicado ? '<span class="chip" style="background:#e6f4ea;border-color:#bfe3c8">✅ publicar</span>' : ''}</div>
        <p style="margin:8px 0;font-size:.98rem">“${esc(d.comentario)}”</p>
        ${podeMktFront() ? `<div class="acoes">
          <button class="btn peq ${d.publicado ? 'secund' : ''}" data-pub="${d.id}" data-v="${d.publicado ? 0 : 1}">${d.publicado ? 'Remover da vitrine' : '✅ Aprovar p/ publicar'}</button>
          <button class="btn peq secund" data-copy-dp="${d.id}">📋 Copiar</button></div>` : ''}
      </div>`).join('');
    alvo.querySelectorAll('[data-pub]').forEach(b => b.onclick = async () => { try { await api('POST', '/marketing/depoimentos/' + b.dataset.pub, { publicado: b.dataset.v === '1' }); carregarDepoimentos(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-copy-dp]').forEach(b => b.onclick = () => { const d = depoimentos.find(x => x.id === b.dataset.copyDp); const txt = `"${d.comentario}" — ${d.hospedeNome}${d.imovel ? ', ' + d.imovel : ''} (${d.nota}★)`; navigator.clipboard.writeText(txt).then(() => { b.textContent = '✓ Copiado'; }); });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Redes sociais (métricas mensais) ---------
async function renderRedes() {
  const c = conteudo();
  let redes = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'google'];
  c.innerHTML = cabecalho('Redes sociais', 'Métricas mensais por rede (seguidores, alcance, engajamento, posts). Lance à mão ou uma rotina do Metricool preenche.') + `
    <details class="cr-box" id="rd-box"><summary class="cr-sum">➕ Lançar métricas do mês</summary>
      <form class="form" id="rd-form" style="max-width:660px;margin-top:12px">
        <div class="hi-grid">
          <label>Rede <select id="rd-rede"></select></label>
          <label>Mês <input id="rd-mes" type="month" value="${mesAtual()}"></label>
          <label>Seguidores <input id="rd-seg" type="number" min="0"></label>
          <label>Alcance <input id="rd-alc" type="number" min="0"></label>
          <label>Engajamento <input id="rd-eng" type="number" min="0"></label>
          <label>Posts <input id="rd-pos" type="number" min="0"></label>
        </div>
        <button class="btn" type="submit">Salvar</button>
      </form>
    </details>
    <div id="rd-lista"><p class="vazio">Carregando…</p></div>`;
  try { redes = (await api('GET', '/marketing/redes')).redes; } catch (_) {}
  $('#rd-rede').innerHTML = redes.map(x => `<option value="${x}">${x}</option>`).join('');
  $('#rd-form').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('POST', '/marketing/redes', { rede: $('#rd-rede').value, mes: $('#rd-mes').value, seguidores: $('#rd-seg').value, alcance: $('#rd-alc').value, engajamento: $('#rd-eng').value, posts: $('#rd-pos').value }); $('#rd-form').reset(); $('#rd-mes').value = mesAtual(); $('#rd-box').open = false; carregarRedes(); }
    catch (e) { alert(e.message); }
  };
  carregarRedes();
}
async function carregarRedes() {
  const alvo = $('#rd-lista'); if (!alvo) return;
  try {
    const { itens } = await api('GET', '/marketing/redes');
    if (!itens.length) { alvo.innerHTML = '<div class="vazio">Sem métricas lançadas. Registre o resumo mensal de cada rede.</div>'; return; }
    const ico = { instagram: '📷', facebook: '👍', tiktok: '🎵', linkedin: '💼', youtube: '▶️', google: '🔎' };
    const num = (v) => Number(v || 0).toLocaleString('pt-BR');
    alvo.innerHTML = `<table><thead><tr><th>Mês</th><th>Rede</th><th>Seguidores</th><th>Alcance</th><th>Engajamento</th><th>Posts</th><th></th></tr></thead><tbody>
      ${itens.map(i => `<tr><td>${esc(i.mes)}</td><td>${ico[i.rede] || ''} ${esc(i.rede)}</td><td>${num(i.seguidores)}</td><td>${num(i.alcance)}</td><td>${num(i.engajamento)}</td><td>${num(i.posts)}</td><td>${podeMktFront() ? `<button class="btn peq perigo" data-del-rd="${i.id}">✕</button>` : ''}</td></tr>`).join('')}
    </tbody></table>`;
    alvo.querySelectorAll('[data-del-rd]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este lançamento?')) return; try { await api('DELETE', '/marketing/redes/' + b.dataset.delRd); carregarRedes(); } catch (e) { alert(e.message); } });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
