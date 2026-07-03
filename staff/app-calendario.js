'use strict';
// ============================================================================
// Portal Staff — módulo: app-calendario
// Calendário (réplica da Stays) e módulos Stays: Hóspedes e Reservas (criar/pesquisar).
// Compartilha o escopo global com app-core.js (scripts clássicos, sem import/export).
// ============================================================================
// --------- Calendário (réplica do calendário da Stays) ---------
const CAL_PLATAFORMAS = { airbnb: 'Airbnb', booking: 'Booking', decolar: 'Decolar', expedia: 'Expedia', vrbo: 'Vrbo', google: 'Google', site: 'Site', direto: 'Direta', outro: 'Outra' };
const calYmd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const calParse = s => { const [a, m, d] = String(s).split('-').map(Number); return new Date(a, m - 1, d); };
const calDiffDias = (a, b) => Math.round((b - a) / 86400000);
const calMesNome = m => ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][m];
const calMoeda = (v, moeda) => (v == null ? '' : (moeda === 'BRL' ? 'R$ ' : (moeda || '') + ' ') + Number(v).toLocaleString('pt-BR'));
// normaliza para busca: minúsculas e SEM acento (ex.: "otavio" casa "Otávio")
const calNorm = s => String(s || '').normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase().trim();

function calEstado() {
  if (!ESTADO.cal) {
    const hoje = new Date();
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    ESTADO.cal = { from: calYmd(ini), to: calYmd(fim), vista: 'timeline', plat: '', status: '', busca: '', ocultas: new Set(), dados: null };
  }
  return ESTADO.cal;
}

async function renderCalendario() {
  const cal = calEstado();
  const c = conteudo();
  c.innerHTML = cabecalho('Calendário (Stays)', 'Réplica do calendário da Stays — ao vivo da mesma API. Somente leitura: para editar, use o painel da Stays.');
  c.innerHTML += `
    <div class="cal-controls">
      <div class="cal-grp">
        <button class="btn peq" id="cal-prev" title="Período anterior">◀</button>
        <button class="btn peq" id="cal-hoje" title="Voltar ao mês atual">Hoje</button>
        <button class="btn peq" id="cal-next" title="Próximo período">▶</button>
      </div>
      <div class="cal-grp">
        <label class="cal-lab">De <input type="date" id="cal-de" value="${cal.from}"></label>
        <label class="cal-lab">Até <input type="date" id="cal-ate" value="${cal.to}"></label>
        <button class="btn peq" id="cal-aplicar">Aplicar</button>
      </div>
      <div class="cal-grp">
        <button class="btn peq ${cal.vista === 'timeline' ? 'ativo' : ''}" id="cal-v-timeline">Linha do tempo</button>
        <button class="btn peq ${cal.vista === 'mes' ? 'ativo' : ''}" id="cal-v-mes">Mês</button>
      </div>
      <div class="cal-grp">
        <input type="search" id="cal-busca" placeholder="🔎 Buscar hóspede" value="${esc(cal.busca)}" style="min-width:150px">
        <select id="cal-plat"><option value="">Todas as plataformas</option></select>
        <select id="cal-status">
          <option value="">Reservas + bloqueios</option>
          <option value="reservas">Só reservas</option>
          <option value="bloqueios">Só bloqueios</option>
        </select>
        <details class="cal-props"><summary id="cal-props-sum">Propriedades</summary><div id="cal-props-lista" class="cal-props-lista"></div></details>
        <button class="btn peq" id="cal-refresh" title="Atualizar da Stays">↻</button>
      </div>
    </div>
    <div class="cal-legenda" id="cal-legenda"></div>
    <div id="cal-area"><p class="vazio">Carregando…</p></div>`;

  const setRange = (de, ate) => { cal.from = de; cal.to = ate; $('#cal-de').value = de; $('#cal-ate').value = ate; carregarCalendario(); };
  const passo = () => { // navega pelo mesmo tamanho de janela (ancorado em meses quando for mês cheio)
    const de = calParse(cal.from), ate = calParse(cal.to);
    return { de, ate, dias: calDiffDias(de, ate) + 1 };
  };
  $('#cal-prev').onclick = () => { const { de, dias } = passo(); const nf = new Date(de); nf.setDate(nf.getDate() - dias); const nt = new Date(de); nt.setDate(nt.getDate() - 1); setRange(calYmd(nf), calYmd(nt)); };
  $('#cal-next').onclick = () => { const { ate, dias } = passo(); const nf = new Date(ate); nf.setDate(nf.getDate() + 1); const nt = new Date(ate); nt.setDate(nt.getDate() + dias); setRange(calYmd(nf), calYmd(nt)); };
  $('#cal-hoje').onclick = () => { const h = new Date(); setRange(calYmd(new Date(h.getFullYear(), h.getMonth(), 1)), calYmd(new Date(h.getFullYear(), h.getMonth() + 1, 0))); };
  $('#cal-aplicar').onclick = () => { const de = $('#cal-de').value, ate = $('#cal-ate').value; if (de && ate && de <= ate) setRange(de, ate); else alert('Escolha um intervalo válido (De ≤ Até).'); };
  $('#cal-refresh').onclick = () => carregarCalendario();
  $('#cal-v-timeline').onclick = () => { cal.vista = 'timeline'; $('#cal-v-timeline').classList.add('ativo'); $('#cal-v-mes').classList.remove('ativo'); calDesenhar(); };
  $('#cal-v-mes').onclick = () => { cal.vista = 'mes'; $('#cal-v-mes').classList.add('ativo'); $('#cal-v-timeline').classList.remove('ativo'); calDesenhar(); };
  $('#cal-busca').oninput = () => { cal.busca = $('#cal-busca').value; calDesenhar(); };
  $('#cal-plat').onchange = () => { cal.plat = $('#cal-plat').value; calDesenhar(); };
  $('#cal-status').onchange = () => { cal.status = $('#cal-status').value; calDesenhar(); };
  carregarCalendario();
}

async function carregarCalendario() {
  const cal = calEstado();
  const area = $('#cal-area'); if (area) area.innerHTML = `<p class="vazio">Carregando da Stays…</p>`;
  try {
    const dados = await api('GET', `/calendario?from=${cal.from}&to=${cal.to}`);
    cal.dados = dados;
    // plataformas presentes -> opções do filtro
    const plats = [...new Set(dados.reservas.filter(r => !r.bloqueio && r.plataforma).map(r => r.plataforma))];
    const sel = $('#cal-plat'); if (sel) { const atual = cal.plat; sel.innerHTML = `<option value="">Todas as plataformas</option>` + plats.map(p => `<option value="${p}">${esc(CAL_PLATAFORMAS[p] || p)}</option>`).join(''); sel.value = atual; }
    // painel de propriedades (mostrar/ocultar)
    const pl = $('#cal-props-lista');
    if (pl) {
      pl.innerHTML = `<div class="cal-props-acoes"><button class="btn peq" id="cal-props-todas">Todas</button><button class="btn peq" id="cal-props-nenhuma">Nenhuma</button></div>` +
        dados.propriedades.map(p => `<label class="cal-prop-it"><input type="checkbox" value="${esc(p.idlisting)}" ${cal.ocultas.has(p.idlisting) ? '' : 'checked'}> <b>${esc(p.codigo)}</b> ${esc(p.titulo)}</label>`).join('');
      pl.querySelectorAll('input[type=checkbox]').forEach(ch => ch.onchange = () => { if (ch.checked) cal.ocultas.delete(ch.value); else cal.ocultas.add(ch.value); calDesenhar(); });
      $('#cal-props-todas').onclick = () => { cal.ocultas.clear(); pl.querySelectorAll('input').forEach(c => c.checked = true); calDesenhar(); };
      $('#cal-props-nenhuma').onclick = () => { dados.propriedades.forEach(p => cal.ocultas.add(p.idlisting)); pl.querySelectorAll('input').forEach(c => c.checked = false); calDesenhar(); };
    }
    calDesenhar();
  } catch (e) {
    if (area) area.innerHTML = `<p class="erro">${esc(e.message)}</p>`;
  }
}

function calReservasFiltradas() {
  const cal = calEstado(); const d = cal.dados; if (!d) return [];
  const termo = calNorm(cal.busca);
  return d.reservas.filter(r => {
    if (cal.ocultas.has(r.idlisting)) return false;
    if (cal.status === 'reservas' && r.bloqueio) return false;
    if (cal.status === 'bloqueios' && !r.bloqueio) return false;
    if (cal.plat && r.plataforma !== cal.plat) return false;
    if (termo && !calNorm(r.hospede).includes(termo)) return false;
    return true;
  });
}

function calLegenda() {
  const usados = [...new Set((calEstado().dados?.reservas || []).filter(r => !r.bloqueio && r.plataforma).map(r => r.plataforma))];
  const itens = usados.map(p => `<span class="cal-leg-it"><span class="cal-dot plat-${p}"></span>${esc(CAL_PLATAFORMAS[p] || p)}</span>`).join('');
  return itens + `<span class="cal-leg-it"><span class="cal-dot cal-dot-bloq"></span>Bloqueio</span>`;
}

function calDesenhar() {
  const cal = calEstado(); const d = cal.dados; const area = $('#cal-area'); if (!area || !d) return;
  const leg = $('#cal-legenda'); if (leg) leg.innerHTML = calLegenda();
  const ps = $('#cal-props-sum'); if (ps) { const vis = d.propriedades.length - cal.ocultas.size; ps.textContent = `Propriedades (${vis}/${d.propriedades.length})`; }
  if (cal.vista === 'mes') return calDesenharMes(area);
  calDesenharTimeline(area);
}

function calDesenharTimeline(area) {
  const cal = calEstado(); const d = cal.dados;
  const from = calParse(cal.from), to = calParse(cal.to);
  const nDias = calDiffDias(from, to) + 1;
  if (nDias < 1 || nDias > 400) { area.innerHTML = `<p class="erro">Intervalo grande demais para a linha do tempo. Reduza o período.</p>`; return; }
  const hojeStr = calYmd(new Date());
  const dias = []; for (let i = 0; i < nDias; i++) { const dt = new Date(from); dt.setDate(dt.getDate() + i); dias.push(dt); }
  // Colunas FLEXÍVEIS (minmax(min, 1fr)): o intervalo se estica para preencher a largura — um mês
  // inteiro cabe na tela sem rolagem; só rola quando há dias demais para a largura mínima.
  const gtc = `var(--cw-label) repeat(${nDias}, minmax(var(--cw), 1fr))`;
  const semana = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  // faixa de meses
  let faixaMes = ''; let i = 0;
  while (i < nDias) { const m = dias[i].getMonth(), y = dias[i].getFullYear(); let len = 0; while (i + len < nDias && dias[i + len].getMonth() === m && dias[i + len].getFullYear() === y) len++; faixaMes += `<div class="cal-mes" style="grid-column:${i + 2} / span ${len}">${calMesNome(m)} ${y}</div>`; i += len; }

  // cabeçalho de dias
  let cab = `<div class="cal-rot cal-rot-cab">Propriedade</div>`;
  dias.forEach((dt, idx) => { const fds = dt.getDay() === 0 || dt.getDay() === 6; const hoje = calYmd(dt) === hojeStr; cab += `<div class="cal-cab-dia${fds ? ' fds' : ''}${hoje ? ' hoje' : ''}" style="grid-column:${idx + 2}"><span class="cal-sem">${semana[dt.getDay()]}</span><span class="cal-num">${dt.getDate()}</span></div>`; });

  const reservas = calReservasFiltradas();
  const porListing = {}; reservas.forEach(r => { (porListing[r.idlisting] = porListing[r.idlisting] || []).push(r); });
  const props = d.propriedades.filter(p => !cal.ocultas.has(p.idlisting));
  if (!props.length) { area.innerHTML = `<p class="vazio">Nenhuma propriedade selecionada. Use o filtro “Propriedades”.</p>`; return; }

  const linhas = props.map(p => {
    let celulas = `<div class="cal-rot" title="${esc(p.codigo)} · ${esc(p.titulo)}"><b>${esc(p.codigo)}</b><span>${esc(p.titulo)}</span></div>`;
    dias.forEach((dt, idx) => { const fds = dt.getDay() === 0 || dt.getDay() === 6; const hoje = calYmd(dt) === hojeStr; celulas += `<div class="cal-cell${fds ? ' fds' : ''}${hoje ? ' hoje' : ''}" style="grid-column:${idx + 2};grid-row:1"></div>`; });
    const barras = (porListing[p.idlisting] || []).map(r => {
      const s = calDiffDias(from, calParse(r.checkIn)), e = calDiffDias(from, calParse(r.checkOut));
      const bs = Math.max(0, Math.min(s, nDias)); const be = Math.max(0, Math.min(e, nDias)); const span = be - bs;
      if (span < 1) return '';
      const aberto = (s < 0 ? ' aberta-esq' : '') + (e > nDias ? ' aberta-dir' : '');
      const cls = r.bloqueio ? 'cal-bar-bloq' : 'plat-' + (r.plataforma || 'outro');
      const det = esc(JSON.stringify(r));
      const rotulo = `${esc(r.hospede)}${r.noites ? ` · ${r.noites}n` : ''}`;
      return `<div class="cal-bar ${cls}${aberto}" style="grid-column:${bs + 2} / span ${span};grid-row:1" data-res='${det}' title="${esc(r.hospede)} — ${esc(r.checkIn)} a ${esc(r.checkOut)}">${rotulo}</div>`;
    }).join('');
    return `<div class="cal-row" style="grid-template-columns:${gtc}">${celulas}${barras}</div>`;
  }).join('');

  area.innerHTML = `<div class="cal-scroll"><div class="cal-grade">
    <div class="cal-faixa-mes" style="grid-template-columns:${gtc}"><div class="cal-rot cal-rot-cab"></div>${faixaMes}</div>
    <div class="cal-row cal-cab-row" style="grid-template-columns:${gtc}">${cab}</div>
    ${linhas}
  </div></div>
  <p class="cal-rodape">${reservas.length} reserva(s)/bloqueio(s) no período · atualizado às ${new Date(d.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · fonte: API Stays</p>`;

  area.querySelectorAll('.cal-bar').forEach(b => b.onclick = () => calAbrirDetalhe(JSON.parse(b.dataset.res)));
}

function calDesenharMes(area) {
  const cal = calEstado(); const d = cal.dados;
  const base = calParse(cal.from); const ano = base.getFullYear(), mes = base.getMonth();
  const primeiro = new Date(ano, mes, 1), ultimo = new Date(ano, mes + 1, 0);
  const reservas = calReservasFiltradas();
  const hojeStr = calYmd(new Date());
  const semana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const propPorId = {}; d.propriedades.forEach(p => propPorId[p.idlisting] = p);
  // células: começa no domingo anterior
  const inicio = new Date(primeiro); inicio.setDate(inicio.getDate() - primeiro.getDay());
  const fim = new Date(ultimo); fim.setDate(fim.getDate() + (6 - ultimo.getDay()));
  let cels = '';
  for (let dt = new Date(inicio); dt <= fim; dt.setDate(dt.getDate() + 1)) {
    const ds = calYmd(dt); const foraMes = dt.getMonth() !== mes; const hoje = ds === hojeStr;
    const ins = reservas.filter(r => r.checkIn === ds);
    const outs = reservas.filter(r => r.checkOut === ds);
    const ocup = reservas.filter(r => r.checkIn <= ds && r.checkOut > ds).length;
    const chip = (r, ico) => `<div class="cal-mes-chip ${r.bloqueio ? 'cal-bar-bloq' : 'plat-' + (r.plataforma || 'outro')}" data-res='${esc(JSON.stringify(r))}' title="${esc(r.hospede)} (${esc((propPorId[r.idlisting] || {}).codigo || '')})">${ico} ${esc((propPorId[r.idlisting] || {}).codigo || '')} ${esc(r.hospede)}</div>`;
    cels += `<div class="cal-mes-cel${foraMes ? ' fora' : ''}${hoje ? ' hoje' : ''}">
      <div class="cal-mes-num">${dt.getDate()}${ocup ? `<span class="cal-mes-ocup" title="${ocup} ocupada(s) nesta noite">${ocup}</span>` : ''}</div>
      ${ins.map(r => chip(r, '▶')).join('')}
      ${outs.map(r => chip(r, '◀')).join('')}
    </div>`;
  }
  area.innerHTML = `<div class="cal-mes-tit">${calMesNome(mes)} ${ano}</div>
    <div class="cal-mes-grade">
      ${semana.map(s => `<div class="cal-mes-dow">${s}</div>`).join('')}
      ${cels}
    </div>
    <p class="cal-rodape">▶ check-in · ◀ check-out · número = noites ocupadas · atualizado às ${new Date(d.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · fonte: API Stays</p>`;
  area.querySelectorAll('.cal-mes-chip').forEach(b => b.onclick = () => calAbrirDetalhe(JSON.parse(b.dataset.res)));
}

function calAbrirDetalhe(r) {
  const linhas = [
    ['Hóspede', r.hospede],
    ['Status', r.statusRotulo],
    !r.bloqueio && ['Plataforma', r.plataformaRotulo],
    ['Check-in', r.checkIn], ['Check-out', r.checkOut],
    r.noites && ['Noites', r.noites],
    r.hospedes && ['Hóspedes', `${r.hospedes}${r.adultos != null ? ` (${r.adultos} ad.${r.criancas ? ' / ' + r.criancas + ' cri.' : ''}${r.bebes ? ' / ' + r.bebes + ' bebê' : ''})` : ''}`],
    !r.bloqueio && r.valorTotal != null && ['Valor total', calMoeda(r.valorTotal, r.moeda)],
    ['Reserva', r.id],
  ].filter(Boolean);
  const corpo = linhas.map(([k, v]) => `<div class="cal-det-l"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('');
  const link = r.reservationUrl ? `<a class="btn peq" href="${esc(r.reservationUrl)}" target="_blank" rel="noopener">Abrir na Stays ↗</a>` : '';
  let ov = $('#cal-modal'); if (ov) ov.remove();
  ov = document.createElement('div'); ov.id = 'cal-modal'; ov.className = 'cal-modal';
  ov.innerHTML = `<div class="cal-modal-cx"><button class="cal-modal-x" aria-label="Fechar">✕</button><h3>${esc(r.bloqueio ? 'Bloqueio' : r.hospede)}</h3>${corpo}<div class="cal-det-acoes">${link}</div></div>`;
  ov.onclick = (e) => { if (e.target === ov || e.target.classList.contains('cal-modal-x')) ov.remove(); };
  document.body.appendChild(ov);
}

// --------- Hóspedes (Stays) ---------
async function renderStaysHospedes() {
  const c = conteudo();
  c.innerHTML = cabecalho('Hóspedes (Stays)', 'Central de hóspedes — dados ao vivo da Stays. Somente leitura.');
  c.innerHTML += `<form id="sh-form" class="barra">
    <input id="sh-q" type="search" placeholder="🔎 Buscar hóspede pelo nome (sem acento funciona)" style="flex:1;min-width:220px">
    <button class="btn" type="submit">Buscar</button>
  </form>
  <div id="sh-det"></div>
  <div id="sh-lista"><p class="vazio">Carregando…</p></div>`;
  let skip = 0;
  const carregar = async () => {
    const q = $('#sh-q').value.trim();
    const alvo = $('#sh-lista'); alvo.innerHTML = `<p class="vazio">Carregando…</p>`;
    try {
      const r = await api('GET', `/stays/clientes?busca=${encodeURIComponent(q)}&skip=${skip}&limit=30`);
      if (!r.clientes.length) { alvo.innerHTML = `<p class="vazio">Nenhum hóspede${q ? ' para “' + esc(q) + '”' : ''}.</p>`; return; }
      const fim = Math.min(r.skip + r.limit, r.total);
      alvo.innerHTML = `<p class="sub" style="margin:0 0 8px">${r.total} hóspede(s)${q ? ' para “' + esc(q) + '”' : ''} · mostrando ${r.skip + 1}–${fim}</p>
        <div class="lista">${r.clientes.map(h => `<div class="item sh-item" data-id="${esc(h.id)}" style="cursor:pointer">
          <h3>${esc(h.nome)}</h3><div class="meta"><span>origem: ${esc(h.origem || '—')}</span>${h.criadoEm ? `<span>desde ${dataBr(h.criadoEm)}</span>` : ''}</div></div>`).join('')}</div>
        <div class="barra" style="justify-content:space-between;margin-top:12px">
          <button class="btn peq" id="sh-prev" ${r.skip <= 0 ? 'disabled' : ''}>← Anteriores</button>
          <button class="btn peq" id="sh-next" ${fim >= r.total ? 'disabled' : ''}>Próximos →</button></div>`;
      alvo.querySelectorAll('.sh-item').forEach(el => el.onclick = () => abrirHospede(el.dataset.id));
      const p = $('#sh-prev'), n = $('#sh-next');
      if (p) p.onclick = () => { skip = Math.max(0, skip - 30); carregar(); };
      if (n) n.onclick = () => { skip += 30; carregar(); };
    } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
  };
  $('#sh-form').onsubmit = (ev) => { ev.preventDefault(); skip = 0; carregar(); };
  carregar();
}

async function abrirHospede(id) {
  const det = $('#sh-det'); if (!det) return;
  det.innerHTML = `<div class="ficha-bloco"><p class="vazio">Carregando ficha…</p></div>`;
  det.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const h = await api('GET', `/stays/cliente/${id}`);
    const contatos = [...(h.telefones || []).map(t => '📞 ' + esc(t)), ...(h.emails || []).map(e => '✉️ ' + esc(e))].join(' · ') || '—';
    const resv = h.reservas.length ? `<table><thead><tr><th>Imóvel</th><th>Check-in</th><th>Check-out</th><th>Status</th><th>Valor</th></tr></thead><tbody>${h.reservas.map(r => `<tr><td><b>${esc(r.imovel || '—')}</b> ${esc(r.imovelTitulo || '')}</td><td>${esc(r.checkIn || '')}</td><td>${esc(r.checkOut || '')}</td><td>${esc(r.statusRotulo)}</td><td>${r.valorTotal != null ? esc(calMoeda(r.valorTotal, r.moeda)) : '—'}</td></tr>`).join('')}</tbody></table>` : `<p class="vazio">Sem reservas registradas.</p>`;
    det.innerHTML = `<div class="ficha-bloco">
      <button class="btn peq" id="sh-fechar" style="float:right">✕ Fechar</button>
      <h3>${esc(h.nome)}</h3>
      <div class="stays-totais"><span><b>${h.totalReservas}</b> reserva(s)</span><span>Gasto total: <b>${esc(calMoeda(h.totalGasto, 'BRL'))}</b></span><span>${contatos}</span></div>
      ${resv}</div>`;
    $('#sh-fechar').onclick = () => { det.innerHTML = ''; };
  } catch (e) { det.innerHTML = `<div class="ficha-bloco"><p class="erro">${esc(e.message)}</p></div>`; }
}

// --------- Reservas (Stays): criar + pesquisar ---------
async function renderStaysReservas() {
  const ehAdmin = ESTADO.me.papel === 'admin';
  const c = conteudo();
  c.innerHTML = cabecalho('Reservas (Stays)', 'Pesquise reservas por hóspede e período — e (admin) crie reservas diretas ou bloqueios. Ao vivo da Stays.');

  if (ehAdmin) {
    c.innerHTML += `<details class="cr-box" open><summary class="cr-sum">➕ Criar reserva ou bloqueio</summary>
      <div class="form" style="max-width:680px;margin-top:12px">
        <div class="barra" style="gap:10px">
          <label style="flex:1;min-width:160px">Tipo
            <select id="cr-tipo"><option value="reserva">Reserva direta (com hóspede)</option><option value="bloqueio">Bloqueio de datas</option></select></label>
          <label style="flex:2;min-width:200px">Imóvel <select id="cr-imovel"><option value="">Carregando…</option></select></label>
        </div>
        <div class="barra" style="gap:10px">
          <label style="flex:1;min-width:140px">Check-in <input type="date" id="cr-in"></label>
          <label style="flex:1;min-width:140px">Check-out <input type="date" id="cr-out"></label>
          <label id="cr-guests-l" style="width:130px">Hóspedes <input type="number" id="cr-guests" min="1" value="2"></label>
        </div>
        <div id="cr-hosp">
          <div class="barra" style="gap:14px">
            <label style="flex-direction:row;align-items:center;gap:6px"><input type="radio" name="cr-modo" value="existente" checked style="width:auto"> Hóspede existente</label>
            <label style="flex-direction:row;align-items:center;gap:6px"><input type="radio" name="cr-modo" value="novo" style="width:auto"> Cadastrar novo</label>
          </div>
          <div id="cr-existente">
            <div class="barra"><input id="cr-busca-h" placeholder="Buscar hóspede pelo nome" style="flex:1;min-width:200px"><button type="button" class="btn peq" id="cr-busca-b">Buscar</button></div>
            <div id="cr-h-result"></div>
            <p id="cr-h-sel" class="ok-msg"></p>
          </div>
          <div id="cr-novo" class="hidden">
            <div class="barra" style="gap:10px"><input id="cr-novo-nome" placeholder="Nome completo do hóspede" style="flex:2;min-width:200px"><input id="cr-novo-contato" placeholder="WhatsApp ou e-mail" style="flex:1;min-width:160px"></div>
          </div>
        </div>
        <div class="barra"><button type="button" class="btn secund" id="cr-conferir">Conferir disponibilidade</button></div>
        <div id="cr-resumo"></div>
        <p id="cr-status" class="erro"></p>
      </div></details>`;
  } else {
    c.innerHTML += `<div class="aviso">Apenas administradores criam reservas/bloqueios. Você pode pesquisar as reservas abaixo.</div>`;
  }

  const hoje = new Date();
  const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  c.innerHTML += `<h2 class="titulo" style="font-size:1.1rem;margin-top:24px">Pesquisar reservas</h2>
    <form id="sr-form" class="barra" style="gap:10px">
      <label class="cal-lab">De <input type="date" id="sr-de" value="${calYmd(ini)}"></label>
      <label class="cal-lab">Até <input type="date" id="sr-ate" value="${calYmd(fim)}"></label>
      <input id="sr-q" type="search" placeholder="🔎 Hóspede, imóvel ou nº da reserva" style="flex:1;min-width:200px">
      <button class="btn" type="submit">Buscar</button>
    </form>
    <div id="sr-lista"><p class="vazio">Escolha o período e busque.</p></div>`;

  if (ehAdmin) ligarCriarReserva();
  $('#sr-form').onsubmit = (ev) => { ev.preventDefault(); buscarReservas(); };
  buscarReservas();
}

async function buscarReservas() {
  const de = $('#sr-de').value, ate = $('#sr-ate').value, q = $('#sr-q').value.trim();
  const alvo = $('#sr-lista'); if (!alvo) return;
  if (!de || !ate || de > ate) { alvo.innerHTML = `<p class="erro">Escolha um período válido (De ≤ Até).</p>`; return; }
  alvo.innerHTML = `<p class="vazio">Buscando…</p>`;
  try {
    const r = await api('GET', `/stays/reservas?from=${de}&to=${ate}&busca=${encodeURIComponent(q)}`);
    if (!r.reservas.length) { alvo.innerHTML = `<p class="vazio">Nenhuma reserva no período${q ? ' para “' + esc(q) + '”' : ''}.</p>`; return; }
    alvo.innerHTML = `<p class="sub" style="margin:0 0 8px">${r.reservas.length} resultado(s)</p>
      <table><thead><tr><th>Imóvel</th><th>Hóspede</th><th>Check-in</th><th>Check-out</th><th>Noites</th><th>Plataforma</th><th>Status</th><th>Valor</th><th></th></tr></thead>
      <tbody>${r.reservas.map(x => `<tr>
        <td><b>${esc(x.imovel || '—')}</b></td>
        <td>${esc(x.hospede)}</td>
        <td>${esc(x.checkIn || '')}</td><td>${esc(x.checkOut || '')}</td><td>${x.noites ?? '—'}</td>
        <td>${esc(x.plataformaRotulo || (x.bloqueio ? '—' : ''))}</td>
        <td>${esc(x.statusRotulo)}</td>
        <td>${x.valorTotal != null ? esc(calMoeda(x.valorTotal, x.moeda)) : '—'}</td>
        <td>${x.reservationUrl ? `<a href="${esc(x.reservationUrl)}" target="_blank" rel="noopener">↗</a>` : ''}</td>
      </tr>`).join('')}</tbody></table>`;
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

function ligarCriarReserva() {
  let clienteId = '', conferido = false;
  api('GET', '/stays/imoveis').then(r => {
    const sel = $('#cr-imovel'); if (sel) sel.innerHTML = `<option value="">Escolha o imóvel…</option>` + r.imoveis.map(i => `<option value="${esc(i.idlisting)}">${esc(i.codigo)} · ${esc(i.titulo)}</option>`).join('');
  }).catch(() => { const sel = $('#cr-imovel'); if (sel) sel.innerHTML = `<option value="">(falha ao carregar imóveis)</option>`; });

  const resumo = $('#cr-resumo'), statusP = $('#cr-status');
  const resetConfere = () => { conferido = false; resumo.innerHTML = ''; statusP.textContent = ''; };
  ['cr-tipo', 'cr-imovel', 'cr-in', 'cr-out', 'cr-guests'].forEach(id => { const el = $('#' + id); if (el) el.onchange = resetConfere; });

  const toggleTipo = () => {
    const bloqueio = $('#cr-tipo').value === 'bloqueio';
    $('#cr-hosp').style.display = bloqueio ? 'none' : '';
    $('#cr-guests-l').style.display = bloqueio ? 'none' : '';
    resetConfere();
  };
  $('#cr-tipo').onchange = () => { toggleTipo(); };
  toggleTipo();

  document.querySelectorAll('input[name=cr-modo]').forEach(r => r.onchange = () => {
    const novo = document.querySelector('input[name=cr-modo]:checked').value === 'novo';
    $('#cr-existente').classList.toggle('hidden', novo);
    $('#cr-novo').classList.toggle('hidden', !novo);
    clienteId = ''; $('#cr-h-sel').textContent = '';
  });

  $('#cr-busca-b').onclick = async () => {
    const q = $('#cr-busca-h').value.trim(); const out = $('#cr-h-result');
    if (!q) return; out.innerHTML = `<p class="vazio">Buscando…</p>`;
    try {
      const r = await api('GET', `/stays/clientes?busca=${encodeURIComponent(q)}&limit=8`);
      if (!r.clientes.length) { out.innerHTML = `<p class="vazio">Nenhum hóspede. Use “Cadastrar novo”.</p>`; return; }
      out.innerHTML = r.clientes.map(h => `<button type="button" class="btn peq secund cr-pick" data-id="${esc(h.id)}" data-nome="${esc(h.nome)}" style="margin:3px 4px 0 0">${esc(h.nome)}</button>`).join('');
      out.querySelectorAll('.cr-pick').forEach(b => b.onclick = () => { clienteId = b.dataset.id; $('#cr-h-sel').textContent = '✓ Hóspede selecionado: ' + b.dataset.nome; out.innerHTML = ''; });
    } catch (e) { out.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
  };

  $('#cr-conferir').onclick = async () => {
    statusP.className = 'erro'; statusP.textContent = '';
    const listingId = $('#cr-imovel').value, ci = $('#cr-in').value, co = $('#cr-out').value;
    if (!listingId || !ci || !co || co <= ci) { statusP.textContent = 'Escolha imóvel e datas válidas (check-out depois do check-in).'; return; }
    resumo.innerHTML = `<p class="vazio">Conferindo disponibilidade…</p>`;
    try {
      const r = await api('GET', `/stays/disponibilidade?listingId=${encodeURIComponent(listingId)}&from=${ci}&to=${co}`);
      const tipo = $('#cr-tipo').value;
      const imovelTxt = $('#cr-imovel').selectedOptions[0].textContent;
      const n = r.noites.length;
      conferido = r.todasLivres;
      resumo.innerHTML = `<div class="cr-resumo ${r.todasLivres ? 'ok' : 'bloq'}">
        <div><b>${tipo === 'bloqueio' ? 'Bloqueio' : 'Reserva direta'}</b> · ${esc(imovelTxt)}</div>
        <div>${esc(ci)} → ${esc(co)} · ${n} noite(s)</div>
        <div>${r.todasLivres ? '✅ Todas as noites livres' : '⛔ Há noite(s) ocupada(s)/fechada(s) no período'}</div>
        ${tipo !== 'bloqueio' && r.totalSugerido ? `<div>Valor sugerido (tarifa): <b>${esc(calMoeda(r.totalSugerido, 'BRL'))}</b> <span class="sub" style="font-size:.8rem">— a Stays calcula o valor final</span></div>` : ''}
        ${r.todasLivres ? `<button type="button" class="btn" id="cr-confirmar" style="margin-top:8px">Confirmar e criar na Stays</button>` : ''}
      </div>`;
      if (r.todasLivres) $('#cr-confirmar').onclick = criar;
    } catch (e) { resumo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
  };

  const criar = async () => {
    if (!conferido) return;
    const tipo = $('#cr-tipo').value;
    const body = { tipo, listingId: $('#cr-imovel').value, checkInDate: $('#cr-in').value, checkOutDate: $('#cr-out').value };
    if (tipo === 'reserva') {
      body.guests = $('#cr-guests').value;
      const novo = document.querySelector('input[name=cr-modo]:checked').value === 'novo';
      if (novo) {
        const nome = $('#cr-novo-nome').value.trim(); if (!nome) { statusP.textContent = 'Informe o nome do novo hóspede.'; return; }
        body.novoCliente = { nome, contato: $('#cr-novo-contato').value.trim() };
      } else {
        if (!clienteId) { statusP.textContent = 'Selecione um hóspede existente (ou cadastre um novo).'; return; }
        body.clienteId = clienteId;
      }
    }
    const btn = $('#cr-confirmar'); if (btn) { btn.disabled = true; btn.textContent = 'Criando…'; }
    statusP.className = 'erro'; statusP.textContent = '';
    try {
      const r = await api('POST', '/stays/reserva', body);
      const rv = r.reserva || {};
      statusP.className = 'ok-msg';
      statusP.textContent = `✅ ${tipo === 'bloqueio' ? 'Bloqueio' : 'Reserva'} criada na Stays (nº ${rv.id || '—'}) — ${esc(rv.checkIn || '')} a ${esc(rv.checkOut || '')}${rv.valorTotal ? ' · ' + calMoeda(rv.valorTotal, rv.moeda) : ''}. O calendário e os canais são atualizados pela Stays.`;
      resumo.innerHTML = ''; conferido = false; clienteId = '';
      $('#cr-in').value = ''; $('#cr-out').value = ''; $('#cr-busca-h').value = ''; $('#cr-novo-nome').value = ''; $('#cr-novo-contato').value = ''; $('#cr-h-sel').textContent = '';
      buscarReservas();
    } catch (e) {
      statusP.className = 'erro'; statusP.textContent = e.message;
      if (btn) { btn.disabled = false; btn.textContent = 'Confirmar e criar na Stays'; }
    }
  };
}
