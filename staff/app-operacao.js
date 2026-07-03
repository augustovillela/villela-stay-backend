'use strict';
// ============================================================================
// Portal Staff — módulo: app-operacao
// Visão geral (cockpit), Limpezas de hoje, Fotos (reaproveitável) e Chamados de manutenção.
// Compartilha o escopo global com app-core.js (scripts clássicos, sem import/export).
// ============================================================================
// --------- Visão geral ---------
// Visão geral = COCKPIT do dia: KPIs vivos (Stays + CRM + listas) com cartões clicáveis.
async function renderVisao() {
  const c = conteudo();
  const h = new Date().getHours();
  const sauda = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const nome = String(ESTADO.me.nome || '').split(' ')[0];
  c.innerHTML = cabecalho(`${sauda}, ${nome}!`, 'Cockpit do dia — números ao vivo da operação.');
  c.innerHTML += `<form id="busca-home" class="barra">
    <input id="busca-home-input" type="search" placeholder="🔎 Buscar em todos os relatórios e entregas…" style="flex:1;min-width:220px">
    <button class="btn" type="submit">Buscar</button>
  </form>
  <div id="ck-launcher" class="launcher"></div>
  <div id="ck-cards" class="cards"><div class="card"><div class="n">…</div><div class="rot">Carregando o dia</div></div></div>
  <div id="ck-detalhe"></div>
  <div id="ck-mural"></div>
  <h2 class="titulo" style="font-size:1.15rem">Últimas entregas</h2><div id="ck-entregas" class="vazio">Carregando…</div>`;
  $('#busca-home').onsubmit = (ev) => { ev.preventDefault(); ESTADO.buscaPrefill = $('#busca-home-input').value; navegar('relatorios'); };
  montarLauncher('#ck-launcher');
  atualizarBadgeMural();

  // Entregas (rápido) e cockpit (Stays, pode demorar) carregam em paralelo.
  api('GET', '/visao-geral').then(vg => {
    const alvo = $('#ck-entregas'); if (!alvo) return;
    if (!vg.ultimos.length) { alvo.innerHTML = 'Ainda não há entregas publicadas.'; return; }
    alvo.className = 'lista';
    alvo.innerHTML = vg.ultimos.map(itemRelatorioHtml).join('');
    ligarAcoesRelatorio();
  }).catch(() => {});

  try {
    const ck = await api('GET', '/cockpit');
    const cards = [];
    const card = (n, rot, nav, cor) => cards.push(`<div class="card card-nav" data-nav="${nav}"><div class="n"${cor ? ` style="color:${cor}"` : ''}>${n}</div><div class="rot">${rot}</div></div>`);
    if (ck.hoje) {
      card(ck.hoje.chegadas.length, '🛬 Chegadas hoje', 'calendario');
      card(ck.hoje.saidas.length, '🧳 Saídas hoje', 'calendario');
      card(ck.hoje.ocupacaoPct + '%', `🛏️ Ocupação (${ck.hoje.ocupadas}/${ck.hoje.totalUnidades})`, 'calendario');
      const nLimp = ck.hoje.chegadas.length + ck.hoje.saidas.length;
      card(`${ck.limpezasConfirmadas || 0}/${nLimp}`, '🧹 Limpezas de hoje', 'limpezas', (ck.limpezasConfirmadas || 0) >= nLimp && nLimp > 0 ? 'var(--ok)' : undefined);
    }
    if (ck.mes) card('R$ ' + Number(ck.mes.receitaLiquida).toLocaleString('pt-BR'), `💰 Líquido do mês (${ck.mes.reservas} reservas, por check-in)`, 'relatorios');
    if (ck.followupsVencidos != null) card(ck.followupsVencidos, '⏰ Follow-ups vencidos (CRM)', 'crm', ck.followupsVencidos > 0 ? 'var(--alerta)' : 'var(--ok)');
    if (ck.pedidosHospedeAbertos != null && (ESTADO.me.papel === 'admin' || ESTADO.areas.includes('concierge') || ESTADO.areas.includes('vendas') || ESTADO.areas.includes('*')))
      card(ck.pedidosHospedeAbertos, '📨 Pedidos de hóspedes abertos', 'hospede-pedidos', ck.pedidosHospedeAbertos > 0 ? 'var(--cerrado)' : undefined);
    if (ck.listas) {
      card(ck.listas.compras, '🛒 Itens na lista de compras', 'compras');
      card(ck.listas.manutencao, '🔧 Itens de manutenção', 'manutencao');
      if (ck.listas.pendencias != null) card(ck.listas.pendencias, '✅ Pendências (CEO)', 'pendencias');
    }
    if (ck.chamadosAbertos != null) card(ck.chamadosAbertos, '🛠️ Chamados de manutenção abertos', 'manutencao-chamados', ck.chamadosAbertos > 0 ? 'var(--cerrado)' : 'var(--ok)');
    $('#ck-cards').innerHTML = cards.join('') || '<div class="vazio">Sem dados no momento.</div>';
    document.querySelectorAll('.card-nav').forEach(el => el.onclick = () => navegar(el.dataset.nav));

    // Detalhe de chegadas e saídas do dia
    if (ck.hoje && (ck.hoje.chegadas.length || ck.hoje.saidas.length)) {
      const li = (r) => `<div class="kv"><span>${esc(r.imovel)} · ${esc(r.imovelTitulo)}</span><b>${esc(r.hospede)}${r.hospedes ? ' · ' + r.hospedes + ' hósp.' : ''}</b></div>`;
      $('#ck-detalhe').innerHTML = `<div class="ficha" style="margin-bottom:20px">
        <div class="ficha-col"><div class="ficha-bloco"><h3>🛬 Chegadas de hoje (${ck.hoje.chegadas.length})</h3>${ck.hoje.chegadas.map(li).join('') || '<p class="sub" style="margin:0">Nenhuma chegada hoje.</p>'}</div></div>
        <div class="ficha-col"><div class="ficha-bloco"><h3>🧳 Saídas de hoje (${ck.hoje.saidas.length})</h3>${ck.hoje.saidas.map(li).join('') || '<p class="sub" style="margin:0">Nenhuma saída hoje.</p>'}</div></div>
      </div>`;
    }
    // Avisos fixados do mural
    if (ck.muralFixadas && ck.muralFixadas.length) {
      $('#ck-mural').innerHTML = ck.muralFixadas.map(m => `<div class="mural-msg fixada" style="cursor:pointer" data-nav="mural">
        <div class="mural-cab"><b>${esc(m.quem)}</b> <span class="chip mural-chip-fix">📌 Aviso</span> <span class="mural-data">${dataBr(m.criadoEm)}</span></div>
        <div class="mural-texto">${esc(m.texto)}</div></div>`).join('');
      $('#ck-mural').querySelectorAll('[data-nav]').forEach(el => el.onclick = () => navegar('mural'));
    }
    if (ck.staysIndisponivel) $('#ck-cards').innerHTML += '<div class="vazio">⚠️ Stays indisponível agora — os números do dia voltam sozinhos.</div>';
  } catch (e) { $('#ck-cards').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Limpezas de hoje (espelho do painel de limpeza, com confirmação) ---------
async function renderLimpezas() {
  const c = conteudo();
  c.innerHTML = cabecalho('Limpezas de hoje', 'Faxinas pós-checkout e preparações pré-checkin do dia (ao vivo da Stays). Toque em Concluído ao terminar cada unidade.') + `
    <div class="barra">
      <label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Dia
        <input type="date" id="lp-dia" value="${hojeInput()}"></label>
      <button class="btn secund peq" id="lp-atualizar">Atualizar</button>
    </div>
    <div id="lp-lista"><p class="vazio">Carregando…</p></div>`;
  $('#lp-dia').onchange = carregarLimpezas;
  $('#lp-atualizar').onclick = carregarLimpezas;
  carregarLimpezas();
}
function hojeInput() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
async function carregarLimpezas() {
  const alvo = $('#lp-lista'); if (!alvo) return;
  const dia = $('#lp-dia').value || hojeInput();
  try {
    const { tarefas, concluidas } = await api('GET', '/limpezas?dia=' + dia);
    if (!tarefas.length) { alvo.innerHTML = '<div class="vazio">Sem limpezas neste dia — nenhuma chegada ou saída. 🎉</div>'; return; }
    alvo.innerHTML = `<p class="sub" style="margin:0 0 10px">${concluidas}/${tarefas.length} concluída(s)</p>` + tarefas.map(t => `
      <div class="linha-item" style="${t.concluida ? 'opacity:.65' : ''}">
        <span class="qtd">${t.tipo === 'faxina' ? '🧹 Faxina' : '🛏️ Preparação'}</span>
        <span class="nome">${esc(t.codigo)} · ${esc(t.titulo)} <span class="obs">${t.tipo === 'faxina' ? 'saída' : 'chegada'} de ${esc(t.hospede)}${t.hospedes ? ' (' + t.hospedes + ' hósp.)' : ''}</span></span>
        <span class="quem">${t.concluida ? '✅ ' + esc(t.quem) + ' · ' + dataBr(t.quando) : 'pendente'}</span>
        <div class="acoes" style="grid-column:2;grid-row:1/span 3">
          <button class="btn peq secund" data-fotos="limpeza:${dia}|${esc(t.codigo)}|${t.tipo}" data-tit="${esc(t.codigo)} · ${t.tipo === 'faxina' ? 'faxina' : 'preparação'}">📷</button>
          <button class="btn peq ${t.concluida ? 'secund' : ''}" data-cod="${esc(t.codigo)}" data-tipo="${t.tipo}" data-desfazer="${t.concluida ? 1 : 0}">${t.concluida ? 'Desfazer' : 'Concluído ✓'}</button>
        </div>
      </div>`).join('');
    alvo.querySelectorAll('button[data-cod]').forEach(b => b.onclick = async () => {
      try {
        await api('POST', '/limpezas/confirmar', { dia, codigo: b.dataset.cod, tipo: b.dataset.tipo, desfazer: b.dataset.desfazer === '1' });
        carregarLimpezas();
      } catch (e) { alert(e.message); }
    });
    alvo.querySelectorAll('[data-fotos]').forEach(b => b.onclick = () => { const i = b.dataset.fotos.indexOf(':'); abrirFotosModal(b.dataset.fotos.slice(0, i), b.dataset.fotos.slice(i + 1), b.dataset.tit); });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Fotos (reaproveitável: chamados, obras, limpeza) ---------
// Lê e converte um arquivo de imagem em base64 (sem o prefixo data:).
function arquivoParaBase64(file) {
  return new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = no; fr.readAsDataURL(file); });
}
async function abrirFotosModal(entidade, entidadeId, titulo) {
  const antigo = document.querySelector('.cal-modal'); if (antigo) antigo.remove();
  const modal = document.createElement('div'); modal.className = 'cal-modal';
  modal.innerHTML = `<div class="cal-modal-cx" style="max-width:560px">
    <button class="cal-modal-x" id="ft-x">✕</button>
    <h3>📷 Fotos — ${esc(titulo || '')}</h3>
    <label class="btn peq" style="display:inline-block;cursor:pointer">➕ Adicionar foto<input type="file" id="ft-input" accept="image/*" capture="environment" style="display:none"></label>
    <p id="ft-msg" class="sub" style="margin:8px 0 0"></p>
    <div id="ft-grade" class="ft-grade" style="margin-top:12px"><p class="vazio">Carregando…</p></div>
  </div>`;
  document.body.appendChild(modal);
  const fechar = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) fechar(); };
  $('#ft-x').onclick = fechar;
  const carregar = async () => {
    try {
      const { fotos } = await api('GET', `/fotos?entidade=${encodeURIComponent(entidade)}&entidadeId=${encodeURIComponent(entidadeId)}`);
      const g = $('#ft-grade'); if (!g) return;
      g.innerHTML = fotos.length ? fotos.map(f => `<div class="ft-item">
        <a href="/staff/api/fotos/${f.id}/arquivo" target="_blank" rel="noopener"><img src="/staff/api/fotos/${f.id}/arquivo" alt="${esc(f.legenda || '')}" loading="lazy"></a>
        <button class="ft-del" data-del-ft="${f.id}" title="Excluir">✕</button>
      </div>`).join('') : '<p class="vazio">Sem fotos ainda. Toque em “Adicionar foto”.</p>';
      g.querySelectorAll('[data-del-ft]').forEach(b => b.onclick = async () => { if (!confirm('Excluir esta foto?')) return; try { await api('DELETE', '/fotos/' + b.dataset.delFt); carregar(); atualizarContadorFotos(entidade, entidadeId); } catch (e) { alert(e.message); } });
    } catch (e) { $('#ft-grade').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
  };
  $('#ft-input').onchange = async (ev) => {
    const file = ev.target.files[0]; if (!file) return;
    const msg = $('#ft-msg'); msg.textContent = 'Enviando…';
    try {
      if (file.size > 6 * 1024 * 1024) throw new Error('Imagem acima de 6 MB.');
      const base64 = await arquivoParaBase64(file);
      await api('POST', '/fotos', { entidade, entidadeId, nomeArquivo: file.name, base64 });
      msg.textContent = ''; ev.target.value = ''; carregar(); atualizarContadorFotos(entidade, entidadeId);
    } catch (e) { msg.textContent = e.message; }
  };
  carregar();
}
// Atualiza o rótulo "📷 N" do botão da entidade após adicionar/remover foto.
async function atualizarContadorFotos(entidade, entidadeId) {
  try {
    const { fotos } = await api('GET', `/fotos?entidade=${encodeURIComponent(entidade)}&entidadeId=${encodeURIComponent(entidadeId)}`);
    const b = document.querySelector(`[data-fotos="${entidade}:${entidadeId}"]`);
    if (b) b.textContent = '📷 ' + fotos.length;
  } catch (_) {}
}

// --------- Chamados de manutenção (quadro por status, com técnico e custo) ---------
const CH_COLS = [
  { id: 'aberto', rot: '🔴 Aberto' }, { id: 'agendado', rot: '📅 Agendado' },
  { id: 'em_execucao', rot: '🛠️ Em execução' }, { id: 'concluido', rot: '✅ Concluído' },
];
async function renderChamadosManutencao() {
  const c = conteudo();
  c.innerHTML = cabecalho('Chamados de manutenção', 'Do problema ao conserto: aberto → agendado → em execução → concluído, com técnico e custo.') + `
    <details class="cr-box" id="ch-box"><summary class="cr-sum">➕ Novo chamado</summary>
      <form class="form" id="ch-form" style="max-width:640px;margin-top:12px">
        <input type="hidden" id="ch-id">
        <label>Título * <input id="ch-titulo" required maxlength="160" placeholder="ex.: Chuveiro da Suíte Master pingando"></label>
        <label>Casa / unidade <input id="ch-casa" maxlength="80" placeholder="ex.: Casa Modernista, Villa Kubitschek…"></label>
        <label>Descrição <textarea id="ch-desc" rows="2" maxlength="1000"></textarea></label>
        <label>Técnico / responsável <input id="ch-tecnico" maxlength="80" placeholder="ex.: Rosivaldo, Julio, Antônio…"></label>
        <div class="hi-grid">
          <label>Custo (R$) <input id="ch-custo" type="number" min="0" step="0.01" placeholder="deixe vazio se ainda não sabe"></label>
          <label>Equipamento (opcional) <select id="ch-ativo"><option value="">— nenhum —</option></select></label>
        </div>
        <button class="btn" type="submit" id="ch-salvar">Abrir chamado</button>
      </form>
    </details>
    <div id="ch-board" class="kanban"><p class="vazio">Carregando…</p></div>`;
  try { const { ativos } = await api('GET', '/ativos'); $('#ch-ativo').innerHTML = '<option value="">— nenhum —</option>' + ativos.map(a => `<option value="${a.id}">${esc(a.nome)}${a.casa ? ' · ' + esc(a.casa) : ''}</option>`).join(''); } catch (_) {}
  $('#ch-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { titulo: $('#ch-titulo').value.trim(), casa: $('#ch-casa').value.trim(), descricao: $('#ch-desc').value.trim(), tecnico: $('#ch-tecnico').value.trim(), custo: $('#ch-custo').value, ativoId: $('#ch-ativo').value };
    try {
      const id = $('#ch-id').value;
      if (id) await api('PATCH', '/manutencao/chamados/' + id, corpo);
      else await api('POST', '/manutencao/chamados', corpo);
      $('#ch-form').reset(); $('#ch-id').value = ''; $('#ch-salvar').textContent = 'Abrir chamado'; $('#ch-box').open = false;
      carregarChamados();
    } catch (e) { alert(e.message); }
  };
  carregarChamados();
}
async function carregarChamados() {
  const board = $('#ch-board'); if (!board) return;
  try {
    const { chamados } = await api('GET', '/manutencao/chamados');
    const porCol = {}; CH_COLS.forEach(col => porCol[col.id] = []);
    chamados.forEach(ch => (porCol[ch.status] || porCol.aberto).push(ch));
    const opcoesStatus = (atual) => CH_COLS.map(col => `<option value="${col.id}" ${col.id === atual ? 'selected' : ''}>${col.rot}</option>`).join('');
    board.innerHTML = CH_COLS.map(col => {
      const lista = porCol[col.id];
      const custo = lista.reduce((s, ch) => s + (Number(ch.custo) || 0), 0);
      return `<div class="col">
        <div class="col-head"><span>${col.rot}</span><span class="col-n">${lista.length}</span></div>
        ${custo ? `<div class="col-valor">R$ ${custo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>` : ''}
        <div class="col-cards">${lista.map(ch => `
          <div class="kard" style="cursor:default">
            <div class="kard-nome">${esc(ch.titulo)}</div>
            <div class="kard-meta">${ch.casa ? `<span class="chip">${esc(ch.casa)}</span>` : ''}${ch.custo != null ? `<span class="chip">R$ ${Number(ch.custo).toLocaleString('pt-BR')}</span>` : ''}</div>
            ${ch.tecnico ? `<div class="kard-acao">👷 ${esc(ch.tecnico)}</div>` : ''}
            <div class="kard-origem">${esc(ch.quem)} · ${dataBr(ch.criadoEm)}</div>
            <div class="acoes" style="margin-top:8px">
              <select data-mover="${ch.id}" style="font-size:.78rem;padding:4px 6px">${opcoesStatus(ch.status)}</select>
              <button class="btn peq secund" data-fotos="chamado:${ch.id}" data-tit="${esc(ch.titulo)}">📷</button>
              <button class="btn peq secund" data-editar="${ch.id}">Editar</button>
              <button class="btn peq perigo" data-remover="${ch.id}">✕</button>
            </div>
          </div>`).join('') || '<div class="col-vazio">—</div>'}</div>
      </div>`;
    }).join('');
    board.querySelectorAll('[data-mover]').forEach(s => s.onchange = async () => {
      try { await api('PATCH', '/manutencao/chamados/' + s.dataset.mover, { status: s.value }); carregarChamados(); } catch (e) { alert(e.message); }
    });
    board.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => {
      const ch = chamados.find(x => x.id === b.dataset.editar); if (!ch) return;
      $('#ch-id').value = ch.id; $('#ch-titulo').value = ch.titulo; $('#ch-casa').value = ch.casa || '';
      $('#ch-desc').value = ch.descricao || ''; $('#ch-tecnico').value = ch.tecnico || ''; $('#ch-custo').value = ch.custo != null ? ch.custo : '';
      if ($('#ch-ativo')) $('#ch-ativo').value = ch.ativoId || '';
      $('#ch-salvar').textContent = 'Salvar alterações'; $('#ch-box').open = true; window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    board.querySelectorAll('[data-fotos]').forEach(b => b.onclick = () => { const [ent, eid] = b.dataset.fotos.split(':'); abrirFotosModal(ent, eid, b.dataset.tit); });
    board.querySelectorAll('[data-remover]').forEach(b => b.onclick = async () => {
      if (!confirm('Excluir este chamado?')) return;
      try { await api('DELETE', '/manutencao/chamados/' + b.dataset.remover); carregarChamados(); } catch (e) { alert(e.message); }
    });
  } catch (e) { board.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
