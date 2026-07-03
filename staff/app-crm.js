'use strict';
// ============================================================================
// Portal Staff — módulo: app-crm
// CRM / Funil (kanban, ficha do contato, cotação rápida, métricas).
// Compartilha o escopo global com app-core.js (scripts clássicos, sem import/export).
// ============================================================================
// --------- CRM / Funil (Fase 1) ---------
const CRM = {
  estagios: [
    { id: 'novo', rot: 'Novo' }, { id: 'contato', rot: 'Contato' }, { id: 'orcamento', rot: 'Orçamento' },
    { id: 'negociacao', rot: 'Negociação' }, { id: 'reserva', rot: 'Reserva' }, { id: 'hospedado', rot: 'Hospedado' },
    { id: 'posvenda', rot: 'Pós-venda' }, { id: 'perdido', rot: 'Perdido' },
  ],
  origens: ['site', 'whatsapp-business', 'whatsapp-pessoal', 'airbnb', 'booking', 'decolar', 'instagram', 'indicacao', 'manual'],
  cache: [],
};
const moedaBr = (v) => (v == null || v === '') ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const crmDataCurta = (iso) => { if (!iso) return ''; const [a, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };
function crmPrazoClasse(data) {
  if (!data) return '';
  const hoje = new Date().toISOString().slice(0, 10);
  return data < hoje ? 'atrasado' : (data === hoje ? 'hoje' : 'futuro');
}

async function renderCRM() {
  conteudo().innerHTML = cabecalho('CRM / Funil', 'Do primeiro contato ao pós-venda. Arraste os cartões para mudar de etapa.')
    + `<div class="barra">
        <button class="btn" id="crm-novo">+ Novo contato</button>
        <button class="btn secund" id="crm-metricas">📊 Métricas</button>
        <input id="crm-busca" placeholder="Buscar nome, telefone ou e-mail…" style="flex:1;min-width:200px">
       </div>
       <div id="crm-sla"></div>
       <div id="crm-receita"></div>
       <div id="crm-followups"></div>
       <div id="crm-board" class="kanban"><div class="vazio">Carregando…</div></div>`;
  $('#crm-novo').onclick = () => crmFormContato();
  $('#crm-metricas').onclick = () => renderCRMMetricas();
  let t; $('#crm-busca').oninput = () => { clearTimeout(t); t = setTimeout(crmCarregar, 250); };
  crmCarregar();
  crmCarregarSla();
  crmCarregarReceita();
}

// SLA de 1ª resposta: banner com leads novos parados há mais de 2h sem resposta humana.
async function crmCarregarSla() {
  const box = $('#crm-sla'); if (!box) return;
  try {
    const { atrasados } = await api('GET', '/crm/sla?horas=2');
    if (!atrasados.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="followups" style="border-left-color:var(--alerta);background:#fdf4f3">
      <strong style="color:var(--alerta)">⏱ ${atrasados.length} lead(s) sem 1ª resposta há +2h</strong>
      ${atrasados.slice(0, 12).map(a => `<button class="fu-chip atrasado" data-id="${esc(a.id)}">${esc(a.nome)} · ${a.esperaHoras}h${a.origem ? ' · ' + esc(a.origem) : ''}</button>`).join('')}
    </div>`;
    box.querySelectorAll('.fu-chip').forEach(b => b.onclick = () => crmAbrirContato(b.dataset.id));
  } catch (_) { box.innerHTML = ''; }
}

// Receita prevista por mês (soma de valorEstimado dos negócios em aberto, por mês de check-in).
async function crmCarregarReceita() {
  const box = $('#crm-receita'); if (!box) return;
  try {
    const { meses, semData, total } = await api('GET', '/crm/receita-prevista');
    if (!total) { box.innerHTML = ''; return; }
    const chips = meses.map(m => `<span class="chip">${esc(m.mes)}: <b>${rMoney(m.valor)}</b></span>`).join(' ');
    box.innerHTML = `<div class="followups" style="border-left-color:var(--lago)">
      <strong>💰 Receita prevista no funil: ${rMoney(total)}</strong> ${chips}
      ${semData ? `<span class="chip">sem data: ${rMoney(semData)}</span>` : ''}</div>`;
  } catch (_) { box.innerHTML = ''; }
}

async function renderCRMMetricas() {
  conteudo().innerHTML = `<button class="btn secund peq" id="m-voltar">← Voltar ao funil</button>`
    + cabecalho('CRM — Métricas', 'Visão do funil de vendas.')
    + `<div id="m-corpo"><div class="vazio">Carregando…</div></div>`;
  $('#m-voltar').onclick = () => navegar('crm');
  try {
    const m = await api('GET', '/crm/metricas');
    const card = (n, rot) => `<div class="card"><div class="n">${n}</div><div class="rot">${esc(rot)}</div></div>`;
    const cards = `<div class="cards">
      ${card(m.total, 'Contatos no total')}
      ${card(m.emNegociacao, 'Em negociação')}
      ${card(m.ganhos, 'Ganhos (reserva+)')}
      ${card(m.perdidos, 'Perdidos')}
      ${card(m.taxaConversao + '%', 'Conversão (ganhos / total)')}
      ${card(m.taxaFechamento + '%', 'Fechamento (ganhos / decididos)')}
      ${card(esc(moedaBr(m.pipelineValor) || 'R$ 0'), 'Valor no pipeline')}
      ${card(esc(moedaBr(m.ganhosValor) || 'R$ 0'), 'Valor ganho')}
    </div>`;
    const estagiosTab = `<h2 class="titulo" style="font-size:1.1rem">Por estágio</h2>
      <table><thead><tr><th>Estágio</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>${CRM.estagios.map(e =>
        `<tr><td>${esc(e.rot)}</td><td>${m.porEstagio[e.id].n}</td><td>${esc(moedaBr(m.porEstagio[e.id].valor) || '—')}</td></tr>`).join('')}</tbody></table>`;
    const tabela = (titulo, obj) => {
      const ent = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
      if (!ent.length) return '';
      return `<h2 class="titulo" style="font-size:1.1rem">${esc(titulo)}</h2><table><tbody>${ent.map(([k, v]) =>
        `<tr><td>${esc(k)}</td><td style="text-align:right;width:70px">${v}</td></tr>`).join('')}</tbody></table>`;
    };
    $('#m-corpo').innerHTML = cards + estagiosTab
      + tabela('Por origem', m.porOrigem)
      + tabela('Imóveis mais procurados', Object.fromEntries((m.topImoveis || []).map(x => [x.imovel, x.n])))
      + tabela('Motivos de perda', m.motivosPerda);
  } catch (e) { $('#m-corpo').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

async function crmCarregar() {
  try {
    const busca = ($('#crm-busca') && $('#crm-busca').value.trim()) || '';
    const [c1, c2] = await Promise.all([
      api('GET', '/crm/contatos' + (busca ? '?busca=' + encodeURIComponent(busca) : '')),
      api('GET', '/crm/followups'),
    ]);
    CRM.cache = c1.contatos;
    crmRenderFollowups(c2.followups);
    crmRenderBoard(c1.contatos);
  } catch (e) { if ($('#crm-board')) $('#crm-board').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

function crmRenderFollowups(fu) {
  const box = $('#crm-followups'); if (!box) return;
  if (!fu || !fu.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="followups"><strong>⏰ Follow-ups (${fu.length})</strong>${fu.map(c =>
    `<button class="fu-chip ${crmPrazoClasse(c.proximaAcao && c.proximaAcao.data)}" data-id="${esc(c.id)}">${esc(c.nome || c.telefone || 'sem nome')}: ${esc((c.proximaAcao && c.proximaAcao.descricao) || 'ação')} (${esc(crmDataCurta(c.proximaAcao && c.proximaAcao.data))})</button>`
  ).join('')}</div>`;
  box.querySelectorAll('.fu-chip').forEach(b => b.onclick = () => crmAbrirContato(b.dataset.id));
}

// Link wa.me a partir do telefone salvo (só dígitos); stopPropagation p/ não abrir a ficha junto.
const waLink = (tel) => 'https://wa.me/' + String(tel).replace(/\D/g, '');
function crmCardHtml(c) {
  const pa = c.proximaAcao || {};
  return `<div class="kard" draggable="true" data-id="${esc(c.id)}">
    <div class="kard-nome">${esc(c.nome || c.telefone || 'sem nome')}${c.telefone ? ` <a class="kard-wa" href="${waLink(c.telefone)}" target="_blank" rel="noopener" title="Chamar no WhatsApp" onclick="event.stopPropagation()">💬</a>` : ''}</div>
    <div class="kard-meta">
      ${c.imovelInteresse ? `<span class="chip">${esc(c.imovelInteresse)}</span>` : ''}
      ${c.valorEstimado ? `<span class="chip">${esc(moedaBr(c.valorEstimado))}</span>` : ''}
    </div>
    ${pa.data ? `<div class="kard-acao ${crmPrazoClasse(pa.data)}">⏱ ${esc(pa.descricao || 'ação')} · ${esc(crmDataCurta(pa.data))}</div>` : ''}
    ${c.origem ? `<div class="kard-origem">${esc(c.origem)}</div>` : ''}
  </div>`;
}

function crmRenderBoard(contatos) {
  const board = $('#crm-board'); if (!board) return;
  const porEst = {}; CRM.estagios.forEach(e => porEst[e.id] = []);
  contatos.forEach(c => { (porEst[c.estagio] || porEst['novo']).push(c); });
  board.innerHTML = CRM.estagios.map(e => {
    const lista = porEst[e.id];
    const valor = lista.reduce((s, c) => s + (Number(c.valorEstimado) || 0), 0);
    return `<div class="col">
      <div class="col-head"><span>${esc(e.rot)}</span><span class="col-n">${lista.length}</span></div>
      ${valor ? `<div class="col-valor">${esc(moedaBr(valor))}</div>` : ''}
      <div class="col-cards" data-drop="${e.id}">${lista.map(crmCardHtml).join('') || '<div class="col-vazio">—</div>'}</div>
    </div>`;
  }).join('');
  board.querySelectorAll('.kard').forEach(k => {
    k.onclick = () => crmAbrirContato(k.dataset.id);
    k.ondragstart = (ev) => { ev.dataTransfer.setData('text/plain', k.dataset.id); k.classList.add('arrastando'); };
    k.ondragend = () => k.classList.remove('arrastando');
  });
  board.querySelectorAll('.col-cards').forEach(col => {
    col.ondragover = (ev) => { ev.preventDefault(); col.classList.add('sobre'); };
    col.ondragleave = () => col.classList.remove('sobre');
    col.ondrop = async (ev) => {
      ev.preventDefault(); col.classList.remove('sobre');
      const id = ev.dataTransfer.getData('text/plain'), estagio = col.dataset.drop;
      const c = CRM.cache.find(x => x.id === id);
      if (!c || c.estagio === estagio) return;
      try { await api('PATCH', '/crm/contatos/' + id, { estagio }); crmCarregar(); }
      catch (e) { alert(e.message); }
    };
  });
}

async function crmAbrirContato(id) {
  try {
    const { contato: c, atividades } = await api('GET', '/crm/contatos/' + id);
    const estOpts = CRM.estagios.map(e => `<option value="${e.id}" ${e.id === c.estagio ? 'selected' : ''}>${esc(e.rot)}</option>`).join('');
    const per = c.periodo || {};
    const periodoTxt = (per.checkin || per.checkout) ? `${esc(per.checkin || '?')} → ${esc(per.checkout || '?')} (${esc(per.hospedes || '?')} hósp.)` : '—';
    const tl = (atividades && atividades.length)
      ? atividades.map(a => `<div class="tl-item"><span class="tl-tipo">${esc(a.tipo)}</span>${esc(a.texto)}<div class="tl-data">${dataBr(a.data)} · ${esc(a.autor || '')}</div></div>`).join('')
      : '<div class="vazio">Sem atividades ainda.</div>';
    conteudo().innerHTML = `<button class="btn secund peq" id="crm-voltar">← Voltar ao funil</button>
      ${cabecalho(c.nome || c.telefone || 'Contato', (c.origem || '') + ' · criado em ' + dataBr(c.criadoEm))}
      <div class="ficha">
        <div class="ficha-col">
          <div class="ficha-bloco"><h3>Dados</h3>
            <div class="kv"><span>Telefone</span><b>${esc(c.telefone || '—')}</b></div>
            <div class="kv"><span>E-mail</span><b>${esc(c.email || '—')}</b></div>
            <div class="kv"><span>Imóvel</span><b>${esc(c.imovelInteresse || '—')}</b></div>
            <div class="kv"><span>Valor estimado</span><b>${esc(moedaBr(c.valorEstimado) || '—')}</b></div>
            <div class="kv"><span>Período</span><b>${periodoTxt}</b></div>
            <div class="kv"><span>Preferências</span><b>${esc(c.preferencias || '—')}</b></div>
            ${c.estagio === 'perdido' && c.motivoPerda ? `<div class="kv"><span>Motivo da perda</span><b>${esc(c.motivoPerda)}</b></div>` : ''}
            ${c.telefone ? `<a class="btn peq" style="margin-top:10px" href="${waLink(c.telefone)}" target="_blank" rel="noopener">💬 Chamar no WhatsApp</a>` : ''}
          </div>
          <div class="ficha-bloco"><h3>Ações</h3>
            <label>Etapa <select id="f-estagio">${estOpts}</select></label>
            <label>Próxima ação <input id="f-acao-desc" value="${esc((c.proximaAcao && c.proximaAcao.descricao) || '')}" placeholder="o que fazer"></label>
            <label>Prazo <input id="f-acao-data" type="date" value="${esc((c.proximaAcao && c.proximaAcao.data) || '')}"></label>
            <button class="btn peq" id="f-salvar">Salvar alterações</button>
            <hr>
            <label>Registrar nota / mensagem <textarea id="f-nota" rows="2" placeholder="ex.: liguei, cliente vai pensar"></textarea></label>
            <button class="btn peq secund" id="f-add-nota">Adicionar à timeline</button>
            <hr>
            <button class="btn peq perigo" id="f-perder">Marcar como perdido</button>
            ${ESTADO.me.papel === 'admin' ? `<button class="btn peq perigo" id="f-excluir" style="margin-left:8px">Excluir contato</button>` : ''}
          </div>
        </div>
        <div class="ficha-col">
          <div class="ficha-bloco"><h3>💬 Cotação rápida</h3>
            <label>Imóvel <select id="cot-imovel"><option value="">Carregando…</option></select></label>
            <div class="hi-grid">
              <label>Check-in <input id="cot-in" type="date" value="${esc((per.checkin || ''))}"></label>
              <label>Check-out <input id="cot-out" type="date" value="${esc((per.checkout || ''))}"></label>
            </div>
            <label>Nº de hóspedes <input id="cot-hosp" type="number" min="1" value="${esc(per.hospedes || '')}"></label>
            <button class="btn peq" id="cot-consultar">Consultar preço e gerar cotação</button>
            <div id="cot-saida"></div>
          </div>
          <div class="ficha-bloco"><h3>Histórico Stays</h3><div id="stays-hist" class="vazio">Carregando…</div></div>
          <div class="ficha-bloco"><h3>Linha do tempo</h3><div class="timeline">${tl}</div></div>
        </div>
      </div>`;
    $('#crm-voltar').onclick = () => navegar('crm');
    crmCotacaoInit(c);
    $('#f-salvar').onclick = async () => {
      try {
        await api('PATCH', '/crm/contatos/' + id, { estagio: $('#f-estagio').value, proximaAcao: { descricao: $('#f-acao-desc').value.trim(), data: $('#f-acao-data').value } });
        crmAbrirContato(id);
      } catch (e) { alert(e.message); }
    };
    $('#f-add-nota').onclick = async () => {
      const texto = $('#f-nota').value.trim(); if (!texto) return;
      try { await api('POST', '/crm/contatos/' + id + '/atividade', { tipo: 'nota', texto }); crmAbrirContato(id); }
      catch (e) { alert(e.message); }
    };
    $('#f-perder').onclick = async () => {
      const motivo = prompt('Motivo da perda (opcional):');
      if (motivo === null) return; // cancelou
      try { await api('POST', '/crm/contatos/' + id + '/perder', { motivo }); crmAbrirContato(id); }
      catch (e) { alert(e.message); }
    };
    if ($('#f-excluir')) $('#f-excluir').onclick = async () => {
      if (!confirm('Excluir este contato permanentemente? Esta ação não pode ser desfeita.')) return;
      try { await api('DELETE', '/crm/contatos/' + id); navegar('crm'); }
      catch (e) { alert(e.message); }
    };
    crmCarregarStays(id); // Histórico Stays (assíncrono)
  } catch (e) { alert(e.message); }
}

// Carrega o histórico do cliente na Stays (reservas + gasto) para a ficha.
async function crmCarregarStays(id) {
  const box = document.querySelector('#stays-hist'); if (!box) return;
  try {
    const d = await api('GET', '/crm/contatos/' + id + '/stays');
    if (!d.vinculado) { box.innerHTML = 'Contato ainda não vinculado a um cliente da Stays.'; return; }
    if (!d.reservas || !d.reservas.length) { box.innerHTML = 'Cliente da Stays sem reservas registradas.'; return; }
    const rotuloTipo = { booked: 'Confirmada', reserved: 'Reservada', contract: 'Contrato', canceled: 'Cancelada', blocked: 'Bloqueio' };
    const totais = `<div class="stays-totais"><span><b>${d.totalReservas}</b> reserva(s) efetiva(s)</span><span>Total: <b>${esc(moedaBr(d.totalGasto) || 'R$ 0')}</b></span></div>`;
    const linhas = d.reservas.map(r => `<div class="stays-res">
        <div class="stays-res-top"><b>${esc(r.imovel || r.imovelTitulo || '—')}</b><span class="chip">${esc(rotuloTipo[r.type] || r.type)}</span></div>
        <div class="stays-res-meta">${esc(r.checkin || '?')} → ${esc(r.checkout || '?')}${r.hospedes ? ' · ' + esc(r.hospedes) + ' hósp.' : ''} · ${esc(moedaBr(r.valor) || '—')}</div>
      </div>`).join('');
    box.classList.remove('vazio');
    box.innerHTML = totais + linhas;
  } catch (e) { box.innerHTML = 'Não foi possível carregar o histórico da Stays agora.'; }
}

// Cotação rápida na ficha do CRM: escolhe imóvel + datas, consulta disponibilidade/tarifa (Stays)
// e gera um texto de cotação pronto para colar no WhatsApp (padrão FAQ: sinal 50% + 50%).
let _cotImoveis = null;
async function crmCotacaoInit(contato) {
  const sel = $('#cot-imovel'); if (!sel) return;
  try {
    if (!_cotImoveis) _cotImoveis = (await api('GET', '/stays/imoveis')).imoveis;
    const alvo = normaliza(contato.imovelInteresse || '');
    sel.innerHTML = '<option value="">— escolha o imóvel —</option>' + _cotImoveis.map(im =>
      `<option value="${im.idlisting}" data-cod="${esc(im.codigo)}" data-tit="${esc(im.titulo)}" ${alvo && (normaliza(im.codigo) === alvo || normaliza(im.titulo).includes(alvo) || alvo.includes(normaliza(im.codigo))) ? 'selected' : ''}>${esc(im.codigo)} · ${esc(im.titulo)}</option>`).join('');
  } catch (e) { sel.innerHTML = '<option value="">falha ao carregar imóveis</option>'; }
  $('#cot-consultar').onclick = () => crmCotacaoConsultar(contato);
}
async function crmCotacaoConsultar(contato) {
  const sel = $('#cot-imovel'), saida = $('#cot-saida');
  const idlisting = sel.value, from = $('#cot-in').value, to = $('#cot-out').value;
  const hosp = $('#cot-hosp').value;
  if (!idlisting || !from || !to || to <= from) { saida.innerHTML = '<p class="erro">Escolha o imóvel e datas válidas (check-out após o check-in).</p>'; return; }
  saida.innerHTML = '<p class="sub">Consultando a Stays…</p>';
  try {
    const d = await api('GET', `/stays/disponibilidade?listingId=${encodeURIComponent(idlisting)}&from=${from}&to=${to}`);
    const opt = sel.options[sel.selectedIndex];
    const cod = opt.dataset.cod, tit = opt.dataset.tit;
    const noites = d.noites.length;
    const total = d.totalSugerido || 0;
    const brl = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const fmtData = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
    const disp = d.todasLivres ? '<span style="color:var(--ok);font-weight:700">✅ Disponível</span>' : '<span style="color:var(--alerta);font-weight:700">⚠️ Há noites ocupadas no período</span>';
    const sinal = total / 2;
    const texto = `Olá${contato.nome ? ', ' + contato.nome.split(' ')[0] : ''}! Segue a cotação da ${tit}:\n\n`
      + `📅 ${fmtData(from)} a ${fmtData(to)} (${noites} ${noites === 1 ? 'noite' : 'noites'})\n`
      + `👥 ${hosp || '—'} hóspede(s)\n`
      + `💰 Total: ${brl(total)}\n\n`
      + `Para reservar: sinal de 50% (${brl(sinal)}) e os outros 50% (${brl(sinal)}) até 1 semana antes do check-in.\n\n`
      + `Posso segurar essas datas para você? 😊`;
    saida.innerHTML = `<div class="cr-resumo ${d.todasLivres ? 'ok' : 'bloq'}" style="margin-top:12px">
      <div>${cod} · ${esc(tit)} — ${disp}</div>
      <div>${noites} noite(s) · Total sugerido <b>${brl(total)}</b> · Sinal 50% <b>${brl(sinal)}</b></div>
    </div>
    <textarea id="cot-texto" rows="9" style="margin-top:10px;width:100%">${esc(texto)}</textarea>
    <div class="acoes">
      <button class="btn peq" id="cot-copiar">📋 Copiar texto</button>
      ${contato.telefone ? `<a class="btn peq secund" target="_blank" rel="noopener" href="https://wa.me/${String(contato.telefone).replace(/\D/g, '')}?text=${encodeURIComponent(texto)}">💬 Abrir no WhatsApp</a>` : ''}
      <button class="btn peq secund" id="cot-registrar">Registrar na timeline</button>
    </div>`;
    $('#cot-copiar').onclick = () => { navigator.clipboard.writeText($('#cot-texto').value).then(() => { $('#cot-copiar').textContent = '✓ Copiado'; }); };
    $('#cot-registrar').onclick = async () => {
      try { await api('POST', '/crm/contatos/' + contato.id + '/atividade', { tipo: 'cotacao', texto: `Cotação ${cod} ${fmtData(from)}–${fmtData(to)}: ${brl(total)}` }); alert('Registrado na timeline.'); }
      catch (e) { alert(e.message); }
    };
  } catch (e) { saida.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

function crmFormContato() {
  const ori = CRM.origens.map(o => `<option value="${o}">${o}</option>`).join('');
  conteudo().innerHTML = `<button class="btn secund peq" id="crm-voltar">← Voltar ao funil</button>
    ${cabecalho('Novo contato', '')}
    <form class="form" id="crm-form">
      <label>Nome <input id="n-nome" required></label>
      <label>Telefone (WhatsApp) <input id="n-tel" placeholder="61 9xxxx-xxxx"></label>
      <label>E-mail <input id="n-email" type="email"></label>
      <label>Origem <select id="n-origem">${ori}</select></label>
      <label>Imóvel de interesse <input id="n-imovel" placeholder="ex.: GD01H / Casa Modernista"></label>
      <label>Valor estimado (R$) <input id="n-valor" type="number" min="0" step="50"></label>
      <button class="btn" type="submit">Criar contato</button>
      <p id="n-msg" class="erro"></p>
    </form>`;
  $('#crm-voltar').onclick = () => navegar('crm');
  $('#crm-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const msg = $('#n-msg'); msg.textContent = '';
    try {
      if (!$('#n-nome').value.trim() && !$('#n-tel').value.trim()) throw new Error('Informe ao menos nome e telefone.');
      const { contato } = await api('POST', '/crm/contatos', {
        nome: $('#n-nome').value.trim(), telefone: $('#n-tel').value.trim(), email: $('#n-email').value.trim(),
        origem: $('#n-origem').value, imovelInteresse: $('#n-imovel').value.trim(),
        valorEstimado: $('#n-valor').value ? Number($('#n-valor').value) : null,
      });
      crmAbrirContato(contato.id);
    } catch (e) { msg.textContent = e.message; }
  };
}
