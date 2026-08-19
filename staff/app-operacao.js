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
      if (ck.listas.notas != null) card(ck.listas.notas, '🗒️ Bloco de Notas', 'notas');
    }
    if (ck.chamadosAbertos != null) card(ck.chamadosAbertos, '🛠️ Manutenção — abertos', 'manutencao-chamados', ck.chamadosAbertos > 0 ? 'var(--cerrado)' : 'var(--ok)');
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

// --------- Limpezas: Hoje / Semana (ao vivo da Stays, com confirmação) ---------
let _lpModo = 'hoje';
const _dataCurta = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—';
const _diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
async function renderLimpezas() {
  const c = conteudo();
  c.innerHTML = cabecalho('Limpezas', 'Faxinas pós-checkout e preparações pré-checkin (ao vivo da Stays). Toque em Concluído ao terminar cada unidade.') + `
    <div class="barra">
      <span id="lp-modo" style="display:inline-flex;gap:6px">
        <button class="btn peq ${_lpModo === 'hoje' ? '' : 'secund'}" data-modo="hoje">Hoje</button>
        <button class="btn peq ${_lpModo === 'semana' ? '' : 'secund'}" data-modo="semana">Semana</button>
      </span>
      <label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Dia
        <input type="date" id="lp-dia" value="${hojeInput()}"></label>
      <button class="btn secund peq" id="lp-atualizar">Atualizar</button>
    </div>
    <div id="lp-lista"><p class="vazio">Carregando…</p></div>`;
  $('#lp-dia').onchange = recarregarLimpezas;
  $('#lp-atualizar').onclick = recarregarLimpezas;
  document.querySelectorAll('#lp-modo [data-modo]').forEach(b => b.onclick = () => {
    _lpModo = b.dataset.modo;
    document.querySelectorAll('#lp-modo [data-modo]').forEach(x => x.classList.toggle('secund', x !== b));
    recarregarLimpezas();
  });
  recarregarLimpezas();
}
function hojeInput() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
function recarregarLimpezas() { return _lpModo === 'semana' ? carregarLimpezasSemana() : carregarLimpezas(); }
// HTML de uma linha de tarefa (reusado por Hoje e Semana; o botão carrega o próprio dia).
function _linhaLimpeza(dia, t) {
  return `<div class="linha-item" style="${t.concluida ? 'opacity:.65' : ''}">
      <span class="qtd">${t.tipo === 'faxina' ? '🧹 Faxina' : '🛏️ Preparação'}</span>
      <span class="nome">${esc(t.codigo)} · ${esc(t.titulo)} <span class="obs">${t.tipo === 'faxina' ? 'saída' : 'chegada'} de ${esc(t.hospede)}${t.hospedes ? ' (' + t.hospedes + ' hósp.)' : ''}</span></span>
      <span class="quem">${t.concluida ? '✅ ' + esc(t.quem) + ' · ' + dataBr(t.quando) : 'pendente'}</span>
      <div class="acoes" style="grid-column:2;grid-row:1/span 3">
        <button class="btn peq secund" data-fotos="limpeza:${dia}|${esc(t.codigo)}|${t.tipo}" data-tit="${esc(t.codigo)} · ${t.tipo === 'faxina' ? 'faxina' : 'preparação'}">📷</button>
        <button class="btn peq ${t.concluida ? 'secund' : ''}" data-dia="${dia}" data-cod="${esc(t.codigo)}" data-tipo="${t.tipo}" data-desfazer="${t.concluida ? 1 : 0}">${t.concluida ? 'Desfazer' : 'Concluído ✓'}</button>
      </div>
    </div>`;
}
function _wireLimpeza(scope, reload) {
  scope.querySelectorAll('button[data-cod]').forEach(b => b.onclick = async () => {
    try {
      await api('POST', '/limpezas/confirmar', { dia: b.dataset.dia, codigo: b.dataset.cod, tipo: b.dataset.tipo, desfazer: b.dataset.desfazer === '1' });
      reload();
    } catch (e) { alert(e.message); }
  });
  scope.querySelectorAll('[data-fotos]').forEach(b => b.onclick = () => { const i = b.dataset.fotos.indexOf(':'); abrirFotosModal(b.dataset.fotos.slice(0, i), b.dataset.fotos.slice(i + 1), b.dataset.tit); });
}
async function carregarLimpezas() {
  const alvo = $('#lp-lista'); if (!alvo) return;
  const dia = $('#lp-dia').value || hojeInput();
  alvo.innerHTML = '<p class="vazio">Carregando…</p>';
  try {
    const { tarefas, concluidas } = await api('GET', '/limpezas?dia=' + dia);
    if (!tarefas.length) { alvo.innerHTML = '<div class="vazio">Sem limpezas neste dia — nenhuma chegada ou saída. 🎉</div>'; return; }
    alvo.innerHTML = `<p class="sub" style="margin:0 0 10px">${concluidas}/${tarefas.length} concluída(s)</p>` + tarefas.map(t => _linhaLimpeza(dia, t)).join('');
    _wireLimpeza(alvo, carregarLimpezas);
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
async function carregarLimpezasSemana() {
  const alvo = $('#lp-lista'); if (!alvo) return;
  const base = $('#lp-dia').value || hojeInput();
  alvo.innerHTML = '<p class="vazio">Carregando a semana…</p>';
  try {
    const r = await api('GET', '/limpezas/semana?dia=' + base);
    const hj = hojeInput();
    let html = `<p class="sub" style="margin:0 0 10px">Semana ${_dataCurta(r.inicio)} a ${_dataCurta(r.fim)} · ${r.totalConcluidas}/${r.totalTarefas} concluída(s)</p>`;
    if (!r.totalTarefas) html += '<div class="vazio">Sem limpezas nesta semana — nenhuma chegada ou saída. 🎉</div>';
    for (const d of r.dias) {
      const marca = d.dia === hj ? ' · hoje' : '';
      html += `<h3 style="margin:16px 0 6px;font-weight:800;font-size:1rem">${_diasSemana[d.dow]} ${_dataCurta(d.dia)}${marca}${d.tarefas.length ? '' : ' <span class="obs" style="font-weight:400">— sem movimento</span>'}</h3>`;
      html += d.tarefas.map(t => _linhaLimpeza(d.dia, t)).join('');
    }
    alvo.innerHTML = html;
    _wireLimpeza(alvo, carregarLimpezasSemana);
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

// --------- Manutenção: HUB único (abertos em quadro + arquivo pesquisável + baixa documentada) ---------
const CH_COLS = [
  { id: 'aberto', rot: '🔴 Aberto' }, { id: 'agendado', rot: '📅 Agendado' }, { id: 'em_execucao', rot: '🛠️ Em execução' },
];
const CH_TIPOS = [
  ['hidraulico', '🚰 Hidráulico'], ['eletrico', '⚡ Elétrico'], ['marcenaria', '🪵 Marcenaria'], ['pintura', '🎨 Pintura'],
  ['reparo', '🔧 Reparo'], ['ar_condicionado', '❄️ Ar-condicionado'], ['concessionaria_agua', '💧 Concessionária de água'], ['concessionaria_luz', '💡 Concessionária de luz'],
];
const chTipoRot = (t) => (CH_TIPOS.find(x => x[0] === t) || [null, ''])[1];
// Códigos de imóvel (o custo entra no DRE por este código; datalist ajuda a acertar).
const CH_CASAS = [
  ['GD01H', 'Casa Modernista'], ['GD03H', 'Gran Villela'], ['GG04I', 'Villa Kubitschek'], ['PL02I', 'Villa Catetinho'],
  ['YV01I', 'Jardim dos Sentidos'], ['GI01I', 'Casa Villela'], ['VH01H', 'Flat da Família'], ['VH02H', 'Flat dos Amigos'],
  ['UF07H', 'Flat do Oscar'], ['UD03H', 'Flat dos Solteiros'], ['UF01H', 'Flat do Burle Marx'], ['UF08H', 'Flat da Cassia Eller'],
  ['UD09H', 'Flat do Renato Russo'], ['UF05H', 'Flat do Chef'], ['UF06H', 'Suíte do Amor'], ['UH01H', 'Suíte do Felipe'],
  ['UH03H', 'Suíte da Família'], ['UH04H', 'Suíte da Sofia'], ['UH05H', 'Suíte Master QI 7'], ['UH06H', 'Suíte do Pedro'],
];
let CH_TECNICOS = [];      // cache do cadastro de técnicos
const chMoney = (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

async function carregarTecnicos() {
  try { CH_TECNICOS = (await api('GET', '/manutencao/tecnicos')).tecnicos || []; } catch (_) { CH_TECNICOS = []; }
  const dl = $('#ch-tecnicos-dl'); if (dl) dl.innerHTML = CH_TECNICOS.map(t => `<option value="${esc(t.nome)}">${esc(t.telefone || '')}${(t.especialidades || []).length ? ' · ' + t.especialidades.map(chTipoRot).filter(Boolean).join(', ') : ''}</option>`).join('');
}
function foneDoTecnico(nome) { const t = CH_TECNICOS.find(x => (x.nome || '').toLowerCase() === String(nome || '').trim().toLowerCase()); return t ? (t.telefone || '') : ''; }

async function renderChamadosManutencao() {
  const c = conteudo();
  c.innerHTML = cabecalho('Manutenção', 'Hub único (WhatsApp, hóspede e portal). Do problema ao conserto documentado — técnico, custos e arquivo pesquisável.') + `
    <details class="cr-box" id="ch-box"><summary class="cr-sum">➕ Novo chamado</summary>
      <form class="form" id="ch-form" style="max-width:660px;margin-top:12px">
        <input type="hidden" id="ch-id">
        <label>Título * <input id="ch-titulo" required maxlength="160" placeholder="ex.: Ar-condicionado da Villa Kubitschek pingando"></label>
        <div class="hi-grid">
          <label>Casa / unidade <input id="ch-casa" list="ch-casas-dl" maxlength="80" placeholder="ex.: GG04I"></label>
          <label>Tipo <select id="ch-tipo"><option value="">—</option>${CH_TIPOS.map(t => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select></label>
        </div>
        <label>Descrição <textarea id="ch-desc" rows="2" maxlength="1000"></textarea></label>
        <div class="hi-grid">
          <label>Técnico <input id="ch-tecnico" list="ch-tecnicos-dl" maxlength="80" placeholder="ex.: Julio César…"></label>
          <label>WhatsApp do técnico <input id="ch-tecfone" maxlength="30" placeholder="ex.: +5561992867402"></label>
        </div>
        <div class="hi-grid">
          <label>Solicitante <input id="ch-solic" maxlength="80" placeholder="quem pediu (hóspede, equipe…)"></label>
          <label>Equipamento (opcional) <select id="ch-ativo"><option value="">— nenhum —</option></select></label>
        </div>
        <button class="btn" type="submit" id="ch-salvar">Abrir chamado</button>
      </form>
    </details>
    <datalist id="ch-tecnicos-dl"></datalist>
    <datalist id="ch-casas-dl">${CH_CASAS.map(x => `<option value="${x[0]}">${esc(x[1])}</option>`).join('')}</datalist>
    <div id="ch-board" class="kanban"><p class="vazio">Carregando…</p></div>
    <h3 style="margin:24px 0 4px">🗄️ Arquivo de manutenções (concluídas)</h3>
    <p class="sub" style="margin:0 0 10px">Ordem cronológica (mais recentes primeiro). Busque por qualquer palavra: problema, técnico, casa, tipo, como resolveu…</p>
    <input id="ch-busca" placeholder="🔎 Buscar no histórico (ex.: ar-condicionado, Julio, vazamento, Villa Kubitschek)" style="width:100%;max-width:660px;margin-bottom:12px;padding:9px 12px;border:1px solid var(--linha);border-radius:8px">
    <div id="ch-arquivo"><p class="vazio">Carregando…</p></div>`;
  await carregarTecnicos();
  $('#ch-tecnico').oninput = () => { const f = foneDoTecnico($('#ch-tecnico').value); if (f && !$('#ch-tecfone').value.trim()) $('#ch-tecfone').value = f; };
  try { const { ativos } = await api('GET', '/ativos'); $('#ch-ativo').innerHTML = '<option value="">— nenhum —</option>' + ativos.map(a => `<option value="${a.id}">${esc(a.nome)}${a.casa ? ' · ' + esc(a.casa) : ''}</option>`).join(''); } catch (_) {}
  $('#ch-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { titulo: $('#ch-titulo').value.trim(), casa: $('#ch-casa').value.trim(), tipo: $('#ch-tipo').value, descricao: $('#ch-desc').value.trim(), tecnico: $('#ch-tecnico').value.trim(), tecnicoTelefone: $('#ch-tecfone').value.trim(), solicitante: $('#ch-solic').value.trim(), ativoId: $('#ch-ativo').value };
    try {
      const id = $('#ch-id').value;
      if (id) await api('PATCH', '/manutencao/chamados/' + id, corpo);
      else await api('POST', '/manutencao/chamados', corpo);
      $('#ch-form').reset(); $('#ch-id').value = ''; $('#ch-salvar').textContent = 'Abrir chamado'; $('#ch-box').open = false;
      carregarChamados();
    } catch (e) { alert(e.message); }
  };
  let bt; $('#ch-busca').oninput = () => { clearTimeout(bt); bt = setTimeout(carregarArquivo, 300); };
  // busca pré-preenchida (ex.: "ver serviços" de um técnico) — filtra o arquivo já na abertura
  if (window.__chBuscaInicial) { $('#ch-busca').value = window.__chBuscaInicial; window.__chBuscaInicial = ''; }
  carregarChamados();
}

// Quadro dos ABERTOS (aberto/agendado/em execução). Concluídos vão para o arquivo (abaixo).
async function carregarChamados() {
  const board = $('#ch-board'); if (!board) return;
  try {
    const { abertos } = await api('GET', '/manutencao/chamados');
    window.__chAbertos = abertos;
    const porCol = {}; CH_COLS.forEach(col => porCol[col.id] = []);
    abertos.forEach(ch => (porCol[ch.status] || porCol.aberto).push(ch));
    const opcoesStatus = (atual) => CH_COLS.map(col => `<option value="${col.id}" ${col.id === atual ? 'selected' : ''}>${col.rot}</option>`).join('');
    board.innerHTML = CH_COLS.map(col => {
      const lista = porCol[col.id];
      return `<div class="col">
        <div class="col-head"><span>${col.rot}</span><span class="col-n">${lista.length}</span></div>
        <div class="col-cards">${lista.map(ch => `
          <div class="kard" style="cursor:default">
            <div class="kard-nome">${esc(ch.titulo)}</div>
            <div class="kard-meta">${ch.casa ? `<span class="chip">${esc(ch.casa)}</span>` : ''}${ch.tipo ? `<span class="chip">${chTipoRot(ch.tipo)}</span>` : ''}${ch.origem && ch.origem !== 'portal' ? `<span class="chip">${esc(ch.origem)}</span>` : ''}</div>
            ${ch.tecnico ? `<div class="kard-acao">👷 ${esc(ch.tecnico)}${ch.tecnicoTelefone ? ' · ' + esc(ch.tecnicoTelefone) : ''}</div>` : ''}
            <div class="kard-origem">${esc(ch.solicitante || ch.quem)} · ${dataBr(ch.criadoEm)}</div>
            <div class="acoes" style="margin-top:8px">
              <select data-mover="${ch.id}" style="font-size:.78rem;padding:4px 6px">${opcoesStatus(ch.status)}</select>
              <button class="btn peq" data-baixar="${ch.id}">✅ Baixar</button>
              <button class="btn peq secund" data-fotos="chamado:${ch.id}" data-tit="${esc(ch.titulo)}">📷</button>
              <button class="btn peq secund" data-editar="${ch.id}">✏️</button>
              <button class="btn peq perigo" data-remover="${ch.id}">✕</button>
            </div>
          </div>`).join('') || '<div class="col-vazio">—</div>'}</div>
      </div>`;
    }).join('');
    board.querySelectorAll('[data-mover]').forEach(s => s.onchange = async () => {
      try { await api('PATCH', '/manutencao/chamados/' + s.dataset.mover, { status: s.value }); if (s.value === 'concluido') { const ch = (window.__chAbertos || []).find(x => x.id === s.dataset.mover); abrirBaixaChamado(Object.assign({}, ch, { status: 'concluido' })); } carregarChamados(); } catch (e) { alert(e.message); }
    });
    board.querySelectorAll('[data-baixar]').forEach(b => b.onclick = () => abrirBaixaChamado((window.__chAbertos || []).find(x => x.id === b.dataset.baixar)));
    board.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => {
      const ch = (window.__chAbertos || []).find(x => x.id === b.dataset.editar); if (!ch) return;
      $('#ch-id').value = ch.id; $('#ch-titulo').value = ch.titulo; $('#ch-casa').value = ch.casa || ''; $('#ch-tipo').value = ch.tipo || '';
      $('#ch-desc').value = ch.descricao || ''; $('#ch-tecnico').value = ch.tecnico || ''; $('#ch-tecfone').value = ch.tecnicoTelefone || ''; $('#ch-solic').value = ch.solicitante || '';
      if ($('#ch-ativo')) $('#ch-ativo').value = ch.ativoId || '';
      $('#ch-salvar').textContent = 'Salvar alterações'; $('#ch-box').open = true; window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    board.querySelectorAll('[data-fotos]').forEach(b => b.onclick = () => { const [ent, eid] = b.dataset.fotos.split(':'); abrirFotosModal(ent, eid, b.dataset.tit); });
    board.querySelectorAll('[data-remover]').forEach(b => b.onclick = async () => {
      if (!confirm('Excluir este chamado?')) return;
      try { await api('DELETE', '/manutencao/chamados/' + b.dataset.remover); carregarChamados(); } catch (e) { alert(e.message); }
    });
    carregarArquivo();
  } catch (e) { board.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// Arquivo (concluídos), ordem cronológica, com busca por palavra em qualquer campo.
async function carregarArquivo() {
  const box = $('#ch-arquivo'); if (!box) return;
  const busca = ($('#ch-busca') && $('#ch-busca').value.trim()) || '';
  try {
    const { arquivados } = await api('GET', '/manutencao/chamados?status=concluido' + (busca ? '&busca=' + encodeURIComponent(busca) : ''));
    window.__chArquivo = arquivados;
    if (!arquivados.length) { box.innerHTML = `<p class="vazio">${busca ? 'Nada encontrado para “' + esc(busca) + '”.' : 'Nenhuma manutenção concluída ainda.'}</p>`; return; }
    box.innerHTML = arquivados.map(ch => {
      const total = (Number(ch.despMaterial) || 0) + (Number(ch.despMaoObra) || 0) + (Number(ch.despDeslocamento) || 0);
      const quando = ch.dataResolucao || (ch.concluidoEm || '').slice(0, 10);
      return `<div class="card-arq">
        <div class="card-arq-top">
          <b>${esc(ch.titulo)}</b>
          <span class="sub">${quando ? dataBr(quando) : '—'}</span>
        </div>
        <div class="kard-meta" style="margin:4px 0">${ch.casa ? `<span class="chip">${esc(ch.casa)}</span>` : ''}${ch.tipo ? `<span class="chip">${chTipoRot(ch.tipo)}</span>` : ''}${!ch.documentado ? '<span class="chip" style="background:var(--cerrado);color:#fff">⚠️ completar dados</span>' : ''}</div>
        ${ch.tecnico ? `<div class="sub">👷 ${esc(ch.tecnico)}${ch.tecnicoTelefone ? ' · ' + esc(ch.tecnicoTelefone) : ''}</div>` : ''}
        ${ch.comoResolvido ? `<div style="margin:4px 0;font-size:.9rem">🛠️ ${esc(ch.comoResolvido)}</div>` : ''}
        <div class="sub">💰 ${chMoney(total)}${total ? ` <span style="opacity:.8">(mat ${chMoney(ch.despMaterial)} · mão ${chMoney(ch.despMaoObra)} · desl ${chMoney(ch.despDeslocamento)})</span>` : ''}</div>
        <div class="acoes" style="margin-top:8px">
          <button class="btn peq" data-arqedit="${ch.id}">${ch.documentado ? '✏️ Editar' : '📝 Completar / arquivar'}</button>
          <button class="btn peq secund" data-fotos="chamado:${ch.id}" data-tit="${esc(ch.titulo)}">📷</button>
          <button class="btn peq secund" data-reabrir="${ch.id}">↩️ Reabrir</button>
          <button class="btn peq perigo" data-remover2="${ch.id}">✕</button>
        </div>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-arqedit]').forEach(b => b.onclick = () => abrirBaixaChamado((window.__chArquivo || []).find(x => x.id === b.dataset.arqedit)));
    box.querySelectorAll('[data-fotos]').forEach(b => b.onclick = () => { const [ent, eid] = b.dataset.fotos.split(':'); abrirFotosModal(ent, eid, b.dataset.tit); });
    box.querySelectorAll('[data-reabrir]').forEach(b => b.onclick = async () => { try { await api('PATCH', '/manutencao/chamados/' + b.dataset.reabrir, { status: 'em_execucao' }); carregarChamados(); } catch (e) { alert(e.message); } });
    box.querySelectorAll('[data-remover2]').forEach(b => b.onclick = async () => { if (!confirm('Excluir do arquivo?')) return; try { await api('DELETE', '/manutencao/chamados/' + b.dataset.remover2); carregarArquivo(); } catch (e) { alert(e.message); } });
  } catch (e) { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// Modal de BAIXA/ARQUIVO: coleta os campos obrigatórios. Dois caminhos:
//  • "Salvar (concluído)" = fecha o chamado, mesmo incompleto (completa depois).
//  • "Arquivar (definitivo)" = exige os campos; lança a despesa no DRE e cadastra o técnico.
function abrirBaixaChamado(ch) {
  if (!ch) return;
  const antigo = document.querySelector('.cal-modal'); if (antigo) antigo.remove();
  const hoje = new Date().toISOString().slice(0, 10);
  const m = document.createElement('div'); m.className = 'cal-modal';
  m.innerHTML = `<div class="cal-modal-cx" style="max-width:600px">
    <button class="cal-modal-x" id="bx-x">✕</button>
    <h3>✅ Baixar manutenção</h3>
    <p class="sub" style="margin:-4px 0 10px">${esc(ch.titulo)}${ch.casa ? ' · ' + esc(ch.casa) : ''}</p>
    <form class="form" id="bx-form">
      <div class="hi-grid">
        <label>Tipo * <select id="bx-tipo"><option value="">—</option>${CH_TIPOS.map(t => `<option value="${t[0]}" ${ch.tipo === t[0] ? 'selected' : ''}>${t[1]}</option>`).join('')}</select></label>
        <label>Data da resolução * <input id="bx-data" type="date" value="${ch.dataResolucao || hoje}"></label>
      </div>
      <div class="hi-grid">
        <label>Técnico * <input id="bx-tec" list="ch-tecnicos-dl" maxlength="80" value="${esc(ch.tecnico || '')}"></label>
        <label>WhatsApp do técnico * <input id="bx-fone" maxlength="30" value="${esc(ch.tecnicoTelefone || '')}" placeholder="+5561…"></label>
      </div>
      <label>Como foi resolvido * <textarea id="bx-como" rows="2" maxlength="1000">${esc(ch.comoResolvido || '')}</textarea></label>
      <div class="hi-grid hi-grid-3">
        <label>Despesa material (R$) <input id="bx-mat" type="number" min="0" step="0.01" value="${ch.despMaterial || ''}"></label>
        <label>Mão de obra (R$) <input id="bx-mao" type="number" min="0" step="0.01" value="${ch.despMaoObra || ''}"></label>
        <label>Deslocamento (R$) <input id="bx-desl" type="number" min="0" step="0.01" value="${ch.despDeslocamento || ''}"></label>
      </div>
      <p class="sub" id="bx-total" style="margin:2px 0">Total: ${chMoney((Number(ch.despMaterial) || 0) + (Number(ch.despMaoObra) || 0) + (Number(ch.despDeslocamento) || 0))}</p>
      <div class="hi-grid">
        <label>Próxima visita (opcional) <input id="bx-prox" type="date" value="${ch.proximaVisita || ''}"></label>
        <label>Repetir a cada (meses) <input id="bx-freq" type="number" min="0" step="1" value="${ch.periodicoFreqMeses || ''}" placeholder="ex.: 3"></label>
      </div>
      <p class="sub" style="margin:0">📅 Próxima visita e periodicidade serão levadas ao Google Calendar / agenda preventiva (Fase 4).</p>
      <p id="bx-msg" class="erro" style="margin:6px 0 0;display:none"></p>
      <div class="acoes" style="margin-top:12px">
        <button class="btn" type="button" id="bx-arquivar">🗄️ Arquivar (definitivo)</button>
        <button class="btn secund" type="button" id="bx-salvar">Salvar (concluído, completar depois)</button>
      </div>
    </form>
  </div>`;
  document.body.appendChild(m);
  const fechar = () => m.remove();
  m.onclick = (e) => { if (e.target === m) fechar(); };
  $('#bx-x').onclick = fechar;
  $('#bx-tec').oninput = () => { const f = foneDoTecnico($('#bx-tec').value); if (f && !$('#bx-fone').value.trim()) $('#bx-fone').value = f; };
  const recalc = () => { $('#bx-total').textContent = 'Total: ' + chMoney((Number($('#bx-mat').value) || 0) + (Number($('#bx-mao').value) || 0) + (Number($('#bx-desl').value) || 0)); };
  ['#bx-mat', '#bx-mao', '#bx-desl'].forEach(s => $(s).oninput = recalc);
  const corpo = () => ({
    tipo: $('#bx-tipo').value, dataResolucao: $('#bx-data').value, tecnico: $('#bx-tec').value.trim(), tecnicoTelefone: $('#bx-fone').value.trim(),
    comoResolvido: $('#bx-como').value.trim(), despMaterial: $('#bx-mat').value, despMaoObra: $('#bx-mao').value, despDeslocamento: $('#bx-desl').value,
    proximaVisita: $('#bx-prox').value, periodicoFreqMeses: $('#bx-freq').value,
  });
  const enviar = async (extra) => {
    const msg = $('#bx-msg'); msg.style.display = 'none';
    try {
      await api('PATCH', '/manutencao/chamados/' + ch.id, Object.assign(corpo(), extra));
      fechar(); await carregarTecnicos(); carregarChamados();
    } catch (e) { msg.textContent = e.message; msg.style.display = 'block'; }
  };
  $('#bx-salvar').onclick = () => enviar({ status: 'concluido' });
  $('#bx-arquivar').onclick = () => enviar({ documentado: true });
}

// --------- Técnicos (cadastro reutilizado na manutenção) ---------
let TEC_LISTA = [];
async function renderTecnicos() {
  const c = conteudo();
  c.innerHTML = cabecalho('Técnicos', 'Cadastro de técnicos e prestadores da manutenção. Entram sozinhos nas baixas de chamados e são reaproveitados no seletor de técnico.') + `
    <details class="cr-box" id="tec-box"><summary class="cr-sum">➕ Novo técnico</summary>
      <form class="form" id="tec-form" style="max-width:640px;margin-top:12px">
        <input type="hidden" id="tec-id">
        <div class="hi-grid">
          <label>Nome * <input id="tec-nome" required maxlength="80" placeholder="ex.: Julio César Rodrigues Martins"></label>
          <label>WhatsApp <input id="tec-fone" maxlength="30" placeholder="+5561992867402"></label>
        </div>
        <label>Especialidades
          <div id="tec-espec" class="tec-espec">${CH_TIPOS.map(t => `<label class="tec-chk"><input type="checkbox" value="${t[0]}"> ${t[1]}</label>`).join('')}</div>
        </label>
        <label>Observações <textarea id="tec-obs" rows="2" maxlength="500"></textarea></label>
        <button class="btn" type="submit" id="tec-salvar">Cadastrar</button>
      </form>
    </details>
    <input id="tec-busca" placeholder="🔎 Buscar técnico (nome, telefone, especialidade)" style="width:100%;max-width:640px;margin-bottom:12px;padding:9px 12px;border:1px solid var(--linha);border-radius:8px">
    <div id="tec-lista"><p class="vazio">Carregando…</p></div>`;
  $('#tec-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const espec = [...document.querySelectorAll('#tec-espec input:checked')].map(x => x.value);
    const corpo = { nome: $('#tec-nome').value.trim(), telefone: $('#tec-fone').value.trim(), especialidades: espec, obs: $('#tec-obs').value.trim() };
    try {
      const id = $('#tec-id').value;
      if (id) await api('PATCH', '/manutencao/tecnicos/' + id, corpo);
      else await api('POST', '/manutencao/tecnicos', corpo);
      $('#tec-form').reset(); $('#tec-id').value = ''; $('#tec-salvar').textContent = 'Cadastrar'; $('#tec-box').open = false;
      carregarTecnicosTela();
    } catch (e) { alert(e.message); }
  };
  let bt; $('#tec-busca').oninput = () => { clearTimeout(bt); bt = setTimeout(carregarTecnicosTela, 300); };
  carregarTecnicosTela();
}
async function carregarTecnicosTela() {
  const box = $('#tec-lista'); if (!box) return;
  const busca = ($('#tec-busca') && $('#tec-busca').value.trim()) || '';
  try {
    const [tRes, chRes] = await Promise.all([
      api('GET', '/manutencao/tecnicos' + (busca ? '?busca=' + encodeURIComponent(busca) : '')),
      api('GET', '/manutencao/chamados').catch(() => ({ abertos: [], arquivados: [] })),
    ]);
    TEC_LISTA = tRes.tecnicos || [];
    // agrega nº de serviços e gasto por técnico (chave = telefone só-dígitos, senão nome)
    const soDig = s => String(s || '').replace(/\D/g, '');
    const todos = [].concat(chRes.abertos || [], chRes.arquivados || []);
    const agg = {};
    todos.forEach(ch => { const k = soDig(ch.tecnicoTelefone) || ('n:' + String(ch.tecnico || '').toLowerCase().trim()); if (!k || k === 'n:') return; const a = agg[k] || (agg[k] = { concl: 0, gasto: 0 }); if (ch.status === 'concluido') { a.concl++; a.gasto += Number(ch.custo) || 0; } });
    if (!TEC_LISTA.length) { box.innerHTML = `<p class="vazio">${busca ? 'Nenhum técnico encontrado.' : 'Nenhum técnico cadastrado ainda. Eles entram sozinhos quando você baixa um chamado com técnico.'}</p>`; return; }
    box.innerHTML = TEC_LISTA.map(t => {
      const k = soDig(t.telefone) || ('n:' + String(t.nome || '').toLowerCase().trim());
      const a = agg[k] || { concl: 0, gasto: 0 };
      const wa = soDig(t.telefone);
      return `<div class="card-arq">
        <div class="card-arq-top"><b>${esc(t.nome)}</b>${wa ? `<a class="sub" href="https://wa.me/${wa}" target="_blank" rel="noopener">💬 ${esc(t.telefone)}</a>` : '<span class="sub">sem WhatsApp</span>'}</div>
        <div class="kard-meta" style="margin:5px 0">${(t.especialidades || []).map(e => `<span class="chip">${chTipoRot(e) || esc(e)}</span>`).join('') || '<span class="sub">sem especialidade</span>'}</div>
        ${t.obs ? `<div class="sub">${esc(t.obs)}</div>` : ''}
        <div class="sub">🔧 ${a.concl} serviço(s) concluído(s) · 💰 ${chMoney(a.gasto)}</div>
        <div class="acoes" style="margin-top:8px">
          <button class="btn peq secund" data-tecserv="${esc(t.nome)}">🔧 Ver serviços</button>
          <button class="btn peq secund" data-tecedit="${t.id}">✏️ Editar</button>
          <button class="btn peq perigo" data-tecdel="${t.id}">✕</button>
        </div>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-tecedit]').forEach(b => b.onclick = () => {
      const t = TEC_LISTA.find(x => x.id === b.dataset.tecedit); if (!t) return;
      $('#tec-id').value = t.id; $('#tec-nome').value = t.nome; $('#tec-fone').value = t.telefone || ''; $('#tec-obs').value = t.obs || '';
      document.querySelectorAll('#tec-espec input').forEach(x => { x.checked = (t.especialidades || []).includes(x.value); });
      $('#tec-salvar').textContent = 'Salvar alterações'; $('#tec-box').open = true; window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    box.querySelectorAll('[data-tecdel]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este técnico do cadastro?')) return; try { await api('DELETE', '/manutencao/tecnicos/' + b.dataset.tecdel); carregarTecnicosTela(); } catch (e) { alert(e.message); } });
    box.querySelectorAll('[data-tecserv]').forEach(b => b.onclick = () => { window.__chBuscaInicial = b.dataset.tecserv; navegar('manutencao-chamados'); });
  } catch (e) { box.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
