'use strict';
// ============================================================================
// Portal Staff — módulo: app-gestao
// Contas a pagar, Prazos jurídicos, DRE por imóvel, Revenue, Conversão (marketing) e Obras & Decoração.
// Compartilha o escopo global com app-core.js (scripts clássicos, sem import/export).
// ============================================================================
async function renderContasPagar() {
  const c = conteudo();
  c.innerHTML = cabecalho('Contas a pagar', 'Vencimentos, status e alertas de atraso. Marque como pago ao quitar.') + `
    <details class="cr-box" id="cp-box"><summary class="cr-sum">➕ Nova conta</summary>
      <form class="form" id="cp-form" style="max-width:640px;margin-top:12px">
        <input type="hidden" id="cp-id">
        <label>Fornecedor * <input id="cp-fornecedor" required maxlength="120"></label>
        <div class="hi-grid">
          <label>Vencimento <input id="cp-venc" type="date"></label>
          <label>Valor (R$) <input id="cp-valor" type="number" min="0" step="0.01"></label>
          <label>Categoria <input id="cp-cat" maxlength="60" placeholder="ex.: utilidades, marketing…"></label>
          <label>Periodicidade <input id="cp-per" maxlength="30" placeholder="mensal / avulso"></label>
        </div>
        <label>Observação <input id="cp-obs" maxlength="200"></label>
        <button class="btn" type="submit" id="cp-salvar">Adicionar conta</button>
      </form>
    </details>
    <div id="cp-cards" class="cards"></div>
    <div id="cp-lista"><p class="vazio">Carregando…</p></div>`;
  $('#cp-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { fornecedor: $('#cp-fornecedor').value.trim(), vencimento: $('#cp-venc').value, valor: $('#cp-valor').value, categoria: $('#cp-cat').value.trim(), periodicidade: $('#cp-per').value.trim(), obs: $('#cp-obs').value.trim() };
    try {
      const id = $('#cp-id').value;
      if (id) await api('PATCH', '/financeiro/contas/' + id, corpo); else await api('POST', '/financeiro/contas', corpo);
      $('#cp-form').reset(); $('#cp-id').value = ''; $('#cp-salvar').textContent = 'Adicionar conta'; $('#cp-box').open = false;
      carregarContasPagar();
    } catch (e) { alert(e.message); }
  };
  carregarContasPagar();
}
async function carregarContasPagar() {
  const alvo = $('#cp-lista'); if (!alvo) return;
  try {
    const { contas, hoje } = await api('GET', '/financeiro/contas');
    const abertas = contas.filter(c => c.status !== 'pago');
    const em7 = new Date(Date.parse(hoje) + 7 * 86400000).toISOString().slice(0, 10);
    const atrasadas = abertas.filter(c => c.statusEfetivo === 'atrasado');
    const vencendo = abertas.filter(c => c.statusEfetivo !== 'atrasado' && c.vencimento && c.vencimento <= em7);
    const totalAberto = abertas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    $('#cp-cards').innerHTML = `
      <div class="card"><div class="n" style="color:var(--alerta)">${atrasadas.length}</div><div class="rot">Atrasadas</div></div>
      <div class="card"><div class="n" style="color:var(--vx-warn,#8A5A00)">${vencendo.length}</div><div class="rot">Vencendo em 7 dias</div></div>
      <div class="card"><div class="n">R$ ${totalAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div><div class="rot">Total em aberto</div></div>`;
    if (!contas.length) { alvo.innerHTML = '<div class="vazio">Nenhuma conta cadastrada. Adicione acima ou o agente financeiro sincroniza a lista.</div>'; return; }
    const cor = { atrasado: 'var(--alerta)', previsto: 'var(--concreto)', pago: 'var(--ok)' };
    const badge = { atrasado: 'st-erro', previsto: 'st-pendente', pago: 'st-feito' };
    const rot = { atrasado: 'ATRASADO', previsto: 'PREVISTO', pago: 'PAGO' };
    alvo.innerHTML = contas.map(c => `
      <div class="linha-item" style="border-left:3px solid ${cor[c.statusEfetivo] || 'var(--borda)'}">
        <span class="qtd">${c.vencimento ? esc(c.vencimento.slice(8, 10) + '/' + c.vencimento.slice(5, 7)) : '—'}</span>
        <span class="nome"><span class="badge ${badge[c.statusEfetivo]}">${rot[c.statusEfetivo]}</span> ${esc(c.fornecedor)}
          <span class="obs">${c.categoria ? esc(c.categoria) : ''}${c.periodicidade ? ' · ' + esc(c.periodicidade) : ''}${c.obs ? ' · ' + esc(c.obs) : ''}</span></span>
        <span class="quem">R$ ${Number(c.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        <div class="acoes" style="grid-column:2;grid-row:1/span 3">
          ${c.status !== 'pago' ? `<button class="btn peq" data-pago="${c.id}">Pago ✓</button>` : `<button class="btn peq secund" data-reabrir="${c.id}">Reabrir</button>`}
          <button class="btn peq secund" data-editar-cp="${c.id}">✎</button>
          <button class="btn peq perigo" data-del-cp="${c.id}">✕</button>
        </div>
      </div>`).join('');
    alvo.querySelectorAll('[data-pago]').forEach(b => b.onclick = async () => { try { await api('PATCH', '/financeiro/contas/' + b.dataset.pago, { status: 'pago' }); carregarContasPagar(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-reabrir]').forEach(b => b.onclick = async () => { try { await api('PATCH', '/financeiro/contas/' + b.dataset.reabrir, { status: 'previsto' }); carregarContasPagar(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-del-cp]').forEach(b => b.onclick = async () => { if (!confirm('Excluir esta conta?')) return; try { await api('DELETE', '/financeiro/contas/' + b.dataset.delCp); carregarContasPagar(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-editar-cp]').forEach(b => b.onclick = () => {
      const c = contas.find(x => x.id === b.dataset.editarCp); if (!c) return;
      $('#cp-id').value = c.id; $('#cp-fornecedor').value = c.fornecedor; $('#cp-venc').value = c.vencimento || ''; $('#cp-valor').value = c.valor || '';
      $('#cp-cat').value = c.categoria || ''; $('#cp-per').value = c.periodicidade || ''; $('#cp-obs').value = c.obs || '';
      $('#cp-salvar').textContent = 'Salvar alterações'; $('#cp-box').open = true; window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Prazos jurídicos (área jurídico/ceo) ---------
async function renderPrazosJuridicos() {
  const c = conteudo();
  c.innerHTML = cabecalho('Prazos jurídicos', 'Controle preliminar de prazos e atos processuais.') + `
    <div class="aviso">⚠️ <strong>Preliminar</strong> — sempre confira cada prazo no sistema oficial do tribunal (e-SAJ/PJe/eproc). Este quadro é apoio, não substitui o advogado responsável.</div>
    <details class="cr-box" id="pj-box"><summary class="cr-sum">➕ Novo prazo</summary>
      <form class="form" id="pj-form" style="max-width:660px;margin-top:12px">
        <input type="hidden" id="pj-id">
        <label>Descrição do ato/prazo * <input id="pj-desc" required maxlength="200" placeholder="ex.: Contestação, Réplica, Recurso…"></label>
        <div class="hi-grid">
          <label>Data limite <input id="pj-data" type="date"></label>
          <label>Prioridade <select id="pj-prio"><option value="alta">Alta</option><option value="media" selected>Média</option><option value="baixa">Baixa</option></select></label>
          <label>Processo <input id="pj-proc" maxlength="60" placeholder="nº CNJ"></label>
          <label>Tribunal <input id="pj-trib" maxlength="30"></label>
        </div>
        <label>Link de consulta <input id="pj-link" maxlength="300" placeholder="https://…"></label>
        <label>Observação <input id="pj-obs" maxlength="300"></label>
        <button class="btn" type="submit" id="pj-salvar">Adicionar prazo</button>
      </form>
    </details>
    <div id="pj-lista"><p class="vazio">Carregando…</p></div>`;
  $('#pj-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { descricao: $('#pj-desc').value.trim(), dataLimite: $('#pj-data').value, prioridade: $('#pj-prio').value, processo: $('#pj-proc').value.trim(), tribunal: $('#pj-trib').value.trim(), link: $('#pj-link').value.trim(), obs: $('#pj-obs').value.trim() };
    try {
      const id = $('#pj-id').value;
      if (id) await api('PATCH', '/juridico/prazos/' + id, corpo); else await api('POST', '/juridico/prazos', corpo);
      $('#pj-form').reset(); $('#pj-id').value = ''; $('#pj-salvar').textContent = 'Adicionar prazo'; $('#pj-box').open = false;
      carregarPrazos();
    } catch (e) { alert(e.message); }
  };
  carregarPrazos();
}
async function carregarPrazos() {
  const alvo = $('#pj-lista'); if (!alvo) return;
  try {
    const { prazos, hoje } = await api('GET', '/juridico/prazos');
    const abertos = prazos.filter(p => p.status === 'aberto');
    if (!prazos.length) { alvo.innerHTML = '<div class="vazio">Nenhum prazo cadastrado. Adicione acima ou os agentes jurídicos publicam automaticamente.</div>'; return; }
    const diasAte = (d) => d ? Math.round((Date.parse(d) - Date.parse(hoje)) / 86400000) : null;
    const semaforo = (n) => n == null ? { cor: 'var(--concreto-claro)', txt: 'sem data' } : n < 0 ? { cor: 'var(--alerta)', txt: 'venceu há ' + (-n) + 'd' } : n === 0 ? { cor: 'var(--alerta)', txt: 'vence HOJE' } : n <= 3 ? { cor: 'var(--alerta)', txt: 'em ' + n + 'd' } : n <= 7 ? { cor: 'var(--cerrado)', txt: 'em ' + n + 'd' } : { cor: 'var(--ok)', txt: 'em ' + n + 'd' };
    const prioBadge = { alta: 'st-erro', media: 'st-pendente', baixa: 'st-feito' };
    const ordenados = [...abertos].sort((a, b) => String(a.dataLimite || '9999').localeCompare(String(b.dataLimite || '9999')));
    const cumpridos = prazos.filter(p => p.status !== 'aberto');
    const linha = (p) => {
      const n = diasAte(p.dataLimite); const s = semaforo(n);
      return `<div class="linha-item" style="border-left:4px solid ${s.cor};${p.status !== 'aberto' ? 'opacity:.6' : ''}">
        <span class="qtd" style="color:${s.cor};background:none">${p.dataLimite ? esc(p.dataLimite.slice(8, 10) + '/' + p.dataLimite.slice(5, 7)) : '—'}</span>
        <span class="nome"><span class="badge ${prioBadge[p.prioridade]}">${(p.prioridade || '').toUpperCase()}</span> ${esc(p.descricao)}
          <span class="obs">${p.processo ? esc(p.processo) : ''}${p.tribunal ? ' · ' + esc(p.tribunal) : ''}${p.link ? ` · <a href="${esc(p.link)}" target="_blank" rel="noopener">consultar ↗</a>` : ''}${p.obs ? ' · ' + esc(p.obs) : ''}
          <br><b style="color:${s.cor}">${s.txt}</b> · por ${esc(p.quem || '—')}</span></span>
        <div class="acoes" style="grid-column:2;grid-row:1/span 3">
          ${p.status === 'aberto' ? `<button class="btn peq" data-cumprir="${p.id}">Cumprido ✓</button>` : `<button class="btn peq secund" data-reabrir-pj="${p.id}">Reabrir</button>`}
          <button class="btn peq perigo" data-del-pj="${p.id}">✕</button>
        </div></div>`;
    };
    alvo.innerHTML = `<p class="sub" style="margin:0 0 10px">${abertos.length} prazo(s) em aberto</p>` + ordenados.map(linha).join('') +
      (cumpridos.length ? `<h3 style="margin:20px 0 8px;color:var(--concreto-claro)">Concluídos/cancelados (${cumpridos.length})</h3>` + cumpridos.map(linha).join('') : '');
    alvo.querySelectorAll('[data-cumprir]').forEach(b => b.onclick = async () => { try { await api('PATCH', '/juridico/prazos/' + b.dataset.cumprir, { status: 'cumprido' }); carregarPrazos(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-reabrir-pj]').forEach(b => b.onclick = async () => { try { await api('PATCH', '/juridico/prazos/' + b.dataset.reabrirPj, { status: 'aberto' }); carregarPrazos(); } catch (e) { alert(e.message); } });
    alvo.querySelectorAll('[data-del-pj]').forEach(b => b.onclick = async () => { if (!confirm('Excluir este prazo?')) return; try { await api('DELETE', '/juridico/prazos/' + b.dataset.delPj); carregarPrazos(); } catch (e) { alert(e.message); } });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- DRE por imóvel (receita líquida Stays − custos lançados) ---------
const mesAtual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
const rMoney = (v) => 'R$ ' + Math.round(Number(v) || 0).toLocaleString('pt-BR');
const rMoney2 = (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function renderDRE() {
  const c = conteudo();
  c.innerHTML = cabecalho('DRE por imóvel', 'Resultado por casa no mês: receita líquida da Stays (por check-in) menos os custos lançados. Lance os custos abaixo para ver a margem real.') + `
    <div class="barra">
      <label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Mês <input type="month" id="dre-mes" value="${mesAtual()}"></label>
      <button class="btn secund peq" id="dre-atualizar">Atualizar</button>
    </div>
    <div id="dre-tabela"><p class="vazio">Consultando a Stays…</p></div>
    <details class="cr-box" style="margin-top:16px"><summary class="cr-sum">➕ Lançar custo do mês</summary>
      <form class="form" id="dre-form" style="max-width:640px;margin-top:12px">
        <div class="hi-grid">
          <label>Imóvel <select id="dre-imovel"><option value="">Carregando…</option></select></label>
          <label>Categoria <select id="dre-cat"></select></label>
          <label>Valor (R$) <input id="dre-valor" type="number" min="0" step="0.01"></label>
          <label>Observação <input id="dre-obs" maxlength="120"></label>
        </div>
        <button class="btn" type="submit">Lançar custo</button>
      </form>
      <div id="dre-custos" style="margin-top:12px"></div>
    </details>`;
  $('#dre-mes').onchange = carregarDRE;
  $('#dre-atualizar').onclick = carregarDRE;
  // popular selects
  try { if (!_cotImoveis) _cotImoveis = (await api('GET', '/stays/imoveis')).imoveis; } catch (_) { _cotImoveis = []; }
  $('#dre-imovel').innerHTML = '<option value="">— imóvel —</option>' + (_cotImoveis || []).map(im => `<option value="${esc(im.codigo)}">${esc(im.codigo)} · ${esc(im.titulo)}</option>`).join('');
  try {
    const { categorias } = await api('GET', '/financeiro/custos?mes=' + $('#dre-mes').value);
    $('#dre-cat').innerHTML = categorias.map(x => `<option value="${x}">${x}</option>`).join('');
  } catch (_) {}
  $('#dre-form').onsubmit = async (ev) => {
    ev.preventDefault();
    if (!$('#dre-imovel').value) { alert('Escolha o imóvel.'); return; }
    try {
      await api('POST', '/financeiro/custos', { mes: $('#dre-mes').value, imovel: $('#dre-imovel').value, categoria: $('#dre-cat').value, valor: $('#dre-valor').value, obs: $('#dre-obs').value.trim() });
      $('#dre-valor').value = ''; $('#dre-obs').value = '';
      carregarDRE();
    } catch (e) { alert(e.message); }
  };
  carregarDRE();
}
async function carregarDRE() {
  const alvo = $('#dre-tabela'); if (!alvo) return;
  const mes = $('#dre-mes').value || mesAtual();
  alvo.innerHTML = '<p class="vazio">Consultando a Stays…</p>';
  try {
    const { linhas, total } = await api('GET', '/financeiro/dre?mes=' + mes);
    if (!linhas.length) { alvo.innerHTML = '<div class="vazio">Sem reservas nem custos neste mês.</div>'; }
    else {
      const cor = (v) => v > 0 ? 'var(--ok)' : v < 0 ? 'var(--alerta)' : 'inherit';
      alvo.innerHTML = `<table><thead><tr><th>Imóvel</th><th>Receita líq.</th><th>Custos</th><th>Resultado</th><th>Margem</th><th>Reservas</th></tr></thead><tbody>
        ${linhas.map(l => `<tr>
          <td><b>${esc(l.imovel)}</b></td>
          <td>${rMoney(l.receitaLiquida)}</td>
          <td>${l.temCusto ? rMoney(l.custos) : '<span style="color:var(--concreto-claro)">— lançar —</span>'}</td>
          <td style="color:${cor(l.resultado)};font-weight:700">${rMoney(l.resultado)}</td>
          <td>${l.margem == null ? '—' : l.margem + '%'}</td>
          <td>${l.reservas} · ${l.noites}n</td></tr>`).join('')}
        <tr style="background:var(--areia);font-weight:800"><td>TOTAL</td><td>${rMoney(total.receitaLiquida)}</td><td>${rMoney(total.custos)}</td><td style="color:${cor(total.resultado)}">${rMoney(total.resultado)}</td><td>${total.receitaLiquida ? Math.round(1000 * total.resultado / total.receitaLiquida) / 10 + '%' : '—'}</td><td></td></tr>
      </tbody></table>
      <p class="cal-rodape">Receita líquida = total das reservas (por check-in) − comissão da plataforma. "— lançar —" indica imóvel sem custo lançado no mês (resultado ainda sem despesas).</p>`;
    }
    // lista de custos lançados no mês (para remover)
    const box = $('#dre-custos'); if (box) {
      const { custos } = await api('GET', '/financeiro/custos?mes=' + mes);
      box.innerHTML = custos.length ? custos.map(cu => `<div class="linha-item"><span class="qtd">${esc(cu.imovel)}</span><span class="nome">${esc(cu.categoria)} <span class="obs">${cu.obs ? esc(cu.obs) : ''}</span></span><span class="quem">${rMoney(cu.valor)}</span><button class="btn peq perigo" data-del-custo="${cu.id}" style="grid-column:2;grid-row:1/span 3">✕</button></div>`).join('') : '<p class="sub" style="margin:0">Nenhum custo lançado neste mês.</p>';
      box.querySelectorAll('[data-del-custo]').forEach(b => b.onclick = async () => { try { await api('DELETE', '/financeiro/custos/' + b.dataset.delCusto); carregarDRE(); } catch (e) { alert(e.message); } });
    }
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Cockpit de revenue ---------
async function renderRevenue() {
  const c = conteudo();
  c.innerHTML = cabecalho('Revenue', 'Ritmo de vendas (pickup), ocupação futura e diária média — ao vivo da Stays.') + '<div id="rv-corpo"><p class="vazio">Consultando a Stays…</p></div>';
  try {
    const d = await api('GET', '/revenue/cockpit');
    const cards = `<div class="cards">
      <div class="card"><div class="n">${d.pickup7.reservas}</div><div class="rot">🆕 Reservas (7 dias) · ${rMoney(d.pickup7.valor)}</div></div>
      <div class="card"><div class="n">${d.pickup30.reservas}</div><div class="rot">🆕 Reservas (30 dias) · ${rMoney(d.pickup30.valor)}</div></div>
      <div class="card"><div class="n">${d.unidades}</div><div class="rot">🏠 Unidades ativas</div></div>
    </div>`;
    const tabela = `<h2 class="titulo" style="font-size:1.15rem">Ocupação futura e diária média</h2>
      <table><thead><tr><th>Janela</th><th>Ocupação</th><th>Noites vendidas</th><th>Receita prevista</th><th>Diária média (ADR)</th><th>RevPAR</th></tr></thead><tbody>
      ${d.futuro.map(b => `<tr><td><b>${b.dias} dias</b></td><td>${b.ocupacaoPct}%</td><td>${b.noitesVendidas}</td><td>${rMoney(b.receitaPrevista)}</td><td>${rMoney(b.adr)}</td><td>${rMoney(b.revpar)}</td></tr>`).join('')}
      </tbody></table>
      <p class="cal-rodape">Ocupação e ADR aproximados (por anúncio ativo; imóveis interligados têm 2 anúncios). RevPAR = receita ÷ (unidades × dias).</p>`;
    const mix = d.mixCanal.length ? `<h2 class="titulo" style="font-size:1.15rem">Mix de canais (estadias futuras — 90 dias)</h2>
      <div class="lista-itens">${d.mixCanal.map(m => `<div class="linha-item"><span class="nome">${esc(m.canal)}</span><span class="quem">${m.n} reserva(s)</span></div>`).join('')}</div>` : '';
    $('#rv-corpo').innerHTML = cards + tabela + mix + '<div id="rv-porcasa" style="margin-top:24px"><p class="sub">Carregando receita por casa…</p></div>';
    carregarRevenuePorCasa();
  } catch (e) { $('#rv-corpo').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
async function carregarRevenuePorCasa() {
  const box = $('#rv-porcasa'); if (!box) return;
  try {
    const { mes, mesAnterior, linhas, totalAtual, totalAnterior } = await api('GET', '/revenue/por-casa');
    if (!linhas.length) { box.innerHTML = ''; return; }
    const seta = (v) => v == null ? '' : v > 0 ? `<span style="color:var(--ok)">▲ ${v}%</span>` : v < 0 ? `<span style="color:var(--alerta)">▼ ${Math.abs(v)}%</span>` : '0%';
    box.innerHTML = `<h2 class="titulo" style="font-size:1.15rem">Receita líquida por casa — ${esc(mes)} vs ${esc(mesAnterior)}</h2>
      <table><thead><tr><th>Imóvel</th><th>${esc(mes)}</th><th>${esc(mesAnterior)}</th><th>Variação</th><th>Reservas</th></tr></thead><tbody>
      ${linhas.map(l => `<tr><td><b>${esc(l.imovel)}</b></td><td>${rMoney(l.atual)}</td><td>${rMoney(l.anterior)}</td><td>${seta(l.variacao)}</td><td>${l.reservas} · ${l.noites}n</td></tr>`).join('')}
      <tr style="background:var(--areia);font-weight:800"><td>TOTAL</td><td>${rMoney(totalAtual)}</td><td>${rMoney(totalAnterior)}</td><td>${seta(totalAnterior ? Math.round(1000 * (totalAtual - totalAnterior) / totalAnterior) / 10 : null)}</td><td></td></tr>
      </tbody></table><p class="cal-rodape">Receita líquida (total − comissão) por mês de check-in. Compara com o mês anterior.</p>`;
  } catch (e) { box.innerHTML = `<p class="sub">Receita por casa indisponível: ${esc(e.message)}</p>`; }
}

// --------- Conversão por origem (marketing) ---------
async function renderMktConversao() {
  const c = conteudo();
  c.innerHTML = cabecalho('Conversão por origem', 'De onde vêm os leads e qual origem mais converte em reserva (dados do CRM).') + '<div id="mk-corpo"><p class="vazio">Carregando…</p></div>';
  try {
    const { linhas, totalLeads, totalGanhos } = await api('GET', '/marketing/conversao');
    if (!linhas.length) { $('#mk-corpo').innerHTML = '<div class="vazio">Ainda não há contatos no CRM.</div>'; return; }
    const cards = `<div class="cards">
      <div class="card"><div class="n">${totalLeads}</div><div class="rot">Leads no CRM</div></div>
      <div class="card"><div class="n">${totalGanhos}</div><div class="rot">Convertidos em reserva</div></div>
      <div class="card"><div class="n">${totalLeads ? Math.round(1000 * totalGanhos / totalLeads) / 10 : 0}%</div><div class="rot">Conversão geral</div></div>
    </div>`;
    $('#mk-corpo').innerHTML = cards + `<table><thead><tr><th>Origem</th><th>Leads</th><th>Ganhos</th><th>Perdidos</th><th>Conversão</th><th>Valor ganho</th></tr></thead><tbody>
      ${linhas.map(l => `<tr><td><b>${esc(l.origem)}</b></td><td>${l.leads}</td><td style="color:var(--ok)">${l.ganhos}</td><td style="color:var(--concreto-claro)">${l.perdidos}</td><td>${l.conversao}%</td><td>${rMoney(l.valorGanho)}</td></tr>`).join('')}
    </tbody></table>`;
  } catch (e) { $('#mk-corpo').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Obras & Decoração (quadro com ROI) ---------
const OBRA_COLS = [{ id: 'ideia', rot: '💡 Ideia' }, { id: 'orcamento', rot: '📄 Orçamento' }, { id: 'aprovado', rot: '✅ Aprovado' }, { id: 'em_obra', rot: '🏗️ Em obra' }, { id: 'concluido', rot: '🎉 Concluído' }];
async function renderObras() {
  const c = conteudo();
  c.innerHTML = cabecalho('Obras & Decoração', 'Da ideia à entrega, com custo e retorno estimado (payback pela diária extra que a melhoria gera).') + `
    <details class="cr-box" id="ob-box"><summary class="cr-sum">➕ Nova obra/melhoria</summary>
      <form class="form" id="ob-form" style="max-width:660px;margin-top:12px">
        <input type="hidden" id="ob-id">
        <label>Título * <input id="ob-titulo" required maxlength="160" placeholder="ex.: Deck e ofurô na Villa Kubitschek"></label>
        <div class="hi-grid">
          <label>Imóvel <input id="ob-imovel" maxlength="80"></label>
          <label>Custo previsto (R$) <input id="ob-cp" type="number" min="0" step="0.01"></label>
          <label>Custo real (R$) <input id="ob-cr" type="number" min="0" step="0.01"></label>
          <label>Diária extra gerada (R$) <input id="ob-de" type="number" min="0" step="0.01" placeholder="quanto a mais por noite"></label>
          <label>Noites extras/mês <input id="ob-om" type="number" min="0" step="1" placeholder="ex.: 12"></label>
        </div>
        <label>Descrição <textarea id="ob-desc" rows="2" maxlength="1000"></textarea></label>
        <button class="btn" type="submit" id="ob-salvar">Adicionar</button>
      </form>
    </details>
    <div id="ob-board" class="kanban"><p class="vazio">Carregando…</p></div>`;
  $('#ob-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const corpo = { titulo: $('#ob-titulo').value.trim(), imovel: $('#ob-imovel').value.trim(), descricao: $('#ob-desc').value.trim(), custoPrevisto: $('#ob-cp').value, custoReal: $('#ob-cr').value, diariaExtra: $('#ob-de').value, ocupacaoMes: $('#ob-om').value };
    try {
      const id = $('#ob-id').value;
      if (id) await api('PATCH', '/obras/' + id, corpo); else await api('POST', '/obras', corpo);
      $('#ob-form').reset(); $('#ob-id').value = ''; $('#ob-salvar').textContent = 'Adicionar'; $('#ob-box').open = false;
      carregarObras();
    } catch (e) { alert(e.message); }
  };
  carregarObras();
}
function obraPayback(o) {
  const custo = Number(o.custoReal) || Number(o.custoPrevisto) || 0;
  const ganhoMes = (Number(o.diariaExtra) || 0) * (Number(o.ocupacaoMes) || 0);
  if (!custo || !ganhoMes) return null;
  return Math.round(10 * custo / ganhoMes) / 10; // meses
}
async function carregarObras() {
  const board = $('#ob-board'); if (!board) return;
  try {
    const { obras } = await api('GET', '/obras');
    const porCol = {}; OBRA_COLS.forEach(col => porCol[col.id] = []);
    obras.forEach(o => (porCol[o.status] || porCol.ideia).push(o));
    const opc = (atual) => OBRA_COLS.map(col => `<option value="${col.id}" ${col.id === atual ? 'selected' : ''}>${col.rot}</option>`).join('');
    board.innerHTML = OBRA_COLS.map(col => {
      const lista = porCol[col.id];
      return `<div class="col">
        <div class="col-head"><span>${col.rot}</span><span class="col-n">${lista.length}</span></div>
        <div class="col-cards">${lista.map(o => {
          const pb = obraPayback(o);
          const custo = Number(o.custoReal) || Number(o.custoPrevisto) || 0;
          return `<div class="kard" style="cursor:default">
            <div class="kard-nome">${esc(o.titulo)}</div>
            <div class="kard-meta">${o.imovel ? `<span class="chip">${esc(o.imovel)}</span>` : ''}${custo ? `<span class="chip">${rMoney(custo)}</span>` : ''}</div>
            ${pb != null ? `<div class="kard-acao ${pb <= 12 ? 'futuro' : ''}">📈 payback ~${pb} ${pb === 1 ? 'mês' : 'meses'}</div>` : (o.diariaExtra ? '<div class="kard-acao">preencha custo + noites p/ ROI</div>' : '')}
            ${o.descricao ? `<div class="kard-origem">${esc(o.descricao.slice(0, 80))}</div>` : ''}
            <div class="acoes" style="margin-top:8px">
              <select data-mover-ob="${o.id}" style="font-size:.78rem;padding:4px 6px">${opc(o.status)}</select>
              <button class="btn peq secund" data-fotos="obra:${o.id}" data-tit="${esc(o.titulo)}">📷</button>
              <button class="btn peq secund" data-editar-ob="${o.id}">✎</button>
              <button class="btn peq perigo" data-del-ob="${o.id}">✕</button>
            </div></div>`;
        }).join('') || '<div class="col-vazio">—</div>'}</div>
      </div>`;
    }).join('');
    board.querySelectorAll('[data-mover-ob]').forEach(s => s.onchange = async () => { try { await api('PATCH', '/obras/' + s.dataset.moverOb, { status: s.value }); carregarObras(); } catch (e) { alert(e.message); } });
    board.querySelectorAll('[data-del-ob]').forEach(b => b.onclick = async () => { if (!confirm('Excluir esta obra?')) return; try { await api('DELETE', '/obras/' + b.dataset.delOb); carregarObras(); } catch (e) { alert(e.message); } });
    board.querySelectorAll('[data-fotos]').forEach(b => b.onclick = () => { const [ent, eid] = b.dataset.fotos.split(':'); abrirFotosModal(ent, eid, b.dataset.tit); });
    board.querySelectorAll('[data-editar-ob]').forEach(b => b.onclick = () => {
      const o = obras.find(x => x.id === b.dataset.editarOb); if (!o) return;
      $('#ob-id').value = o.id; $('#ob-titulo').value = o.titulo; $('#ob-imovel').value = o.imovel || ''; $('#ob-desc').value = o.descricao || '';
      $('#ob-cp').value = o.custoPrevisto || ''; $('#ob-cr').value = o.custoReal || ''; $('#ob-de').value = o.diariaExtra || ''; $('#ob-om').value = o.ocupacaoMes || '';
      $('#ob-salvar').textContent = 'Salvar alterações'; $('#ob-box').open = true; window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  } catch (e) { board.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}
