'use strict';
// ============================================================================
// Portal Staff — módulo: app-estrategia
// Metas (OKR), Datas quentes, Acessos do Hóspede, Relatórios & Entregas, Publicar entrega, Painéis operacionais e Usuários.
// Compartilha o escopo global com app-core.js (scripts clássicos, sem import/export).
// ============================================================================
// --------- Metas (OKR) por área, com termômetro ---------
async function renderMetas() {
  const c = conteudo();
  const podeDef = ESTADO.me.papel === 'admin' || ESTADO.areas.includes('*') || ESTADO.areas.includes('ceo');
  c.innerHTML = cabecalho('Metas (OKR)', 'Alvos por área e mês, com termômetro de progresso. Indicadores automáticos puxam o valor atual da operação; os demais você atualiza à mão.') + `
    ${podeDef ? `<details class="cr-box" id="mt-box"><summary class="cr-sum">➕ Nova meta</summary>
      <form class="form" id="mt-form" style="max-width:660px;margin-top:12px">
        <div class="hi-grid">
          <label>Área <select id="mt-area"></select></label>
          <label>Mês <input id="mt-mes" type="month" value="${mesAtual()}"></label>
          <label>Indicador <select id="mt-ind"></select></label>
          <label>Alvo <input id="mt-alvo" type="number" step="0.01" min="0"></label>
        </div>
        <label id="mt-wrap-titulo" class="hidden">Nome do indicador (livre) <input id="mt-titulo" maxlength="80" placeholder="ex.: Taxa de ocupação"></label>
        <label id="mt-wrap-unidade" class="hidden">Unidade <select id="mt-unidade"><option value="nº">nº</option><option value="%">%</option><option value="R$">R$</option></select></label>
        <label id="mt-wrap-atual" class="hidden">Valor atual (manual) <input id="mt-atual" type="number" step="0.01"></label>
        <button class="btn" type="submit">Criar meta</button>
      </form>
    </details>` : ''}
    <div id="mt-lista"><p class="vazio">Carregando…</p></div>`;
  if (podeDef) {
    const { indicadoresAuto, areas } = await api('GET', '/metas');
    $('#mt-area').innerHTML = areas.map(a => `<option value="${a.id}" ${a.id === 'ceo' ? 'selected' : ''}>${esc(a.nome)}</option>`).join('');
    const auto = Object.entries(indicadoresAuto).map(([k, v]) => `<option value="${k}">${esc(v.titulo)} (auto)</option>`).join('');
    $('#mt-ind').innerHTML = auto + '<option value="">Outro (manual)…</option>';
    const ajusta = () => {
      const manual = $('#mt-ind').value === '';
      $('#mt-wrap-titulo').classList.toggle('hidden', !manual);
      $('#mt-wrap-unidade').classList.toggle('hidden', !manual);
      $('#mt-wrap-atual').classList.toggle('hidden', !manual);
    };
    $('#mt-ind').onchange = ajusta; ajusta();
    $('#mt-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const key = $('#mt-ind').value;
      const corpo = { area: $('#mt-area').value, mes: $('#mt-mes').value, alvo: $('#mt-alvo').value };
      if (key) corpo.indicadorKey = key;
      else { corpo.titulo = $('#mt-titulo').value.trim(); corpo.unidade = $('#mt-unidade').value; corpo.atualManual = $('#mt-atual').value; if (!corpo.titulo) { alert('Dê um nome ao indicador.'); return; } }
      try { await api('POST', '/metas', corpo); $('#mt-form').reset(); $('#mt-mes').value = mesAtual(); ajusta(); $('#mt-box').open = false; carregarMetas(); }
      catch (e) { alert(e.message); }
    };
  }
  carregarMetas();
}
function fmtMeta(v, u) { return u === 'R$' ? rMoney(v) : (Number(v).toLocaleString('pt-BR') + (u === '%' ? '%' : '')); }
async function carregarMetas() {
  const alvo = $('#mt-lista'); if (!alvo) return;
  const podeDef = ESTADO.me.papel === 'admin' || ESTADO.areas.includes('*') || ESTADO.areas.includes('ceo');
  try {
    const { metas } = await api('GET', '/metas');
    if (!metas.length) { alvo.innerHTML = '<div class="vazio">Nenhuma meta definida. Crie a primeira acima.</div>'; return; }
    alvo.innerHTML = metas.map(m => {
      const pct = m.pct == null ? 0 : Math.max(0, Math.min(100, m.pct));
      const cor = pct >= 100 ? 'var(--ok)' : pct >= 60 ? 'var(--lago)' : pct >= 30 ? 'var(--cerrado)' : 'var(--alerta)';
      return `<div class="item">
        <div class="meta"><span class="chip">${esc(nomeArea(m.area))}</span><span class="chip">${esc(m.mes)}</span>${m.indicadorKey ? '<span class="chip">auto</span>' : ''}</div>
        <h3 style="margin:6px 0 2px">${esc(m.titulo)}</h3>
        <div style="display:flex;align-items:center;gap:10px;margin:6px 0">
          <div style="flex:1;background:var(--areia);border-radius:20px;height:14px;overflow:hidden;border:1px solid var(--borda)">
            <div style="height:100%;width:${pct}%;background:${cor};transition:width .3s"></div></div>
          <b style="color:${cor};white-space:nowrap">${m.pct == null ? '—' : m.pct + '%'}</b>
        </div>
        <div class="meta"><span>${fmtMeta(m.atual, m.unidade)} de ${fmtMeta(m.alvo, m.unidade)}</span>${m.obs ? `<span>· ${esc(m.obs)}</span>` : ''}</div>
        ${podeDef ? `<div class="acoes">
          ${m.indicadorKey ? '' : `<button class="btn peq secund" data-atual="${m.id}" data-u="${esc(m.unidade)}">Atualizar valor</button>`}
          <button class="btn peq secund" data-alvo="${m.id}" data-u="${esc(m.unidade)}">Editar alvo</button>
          <button class="btn peq perigo" data-del-mt="${m.id}">Excluir</button></div>` : ''}
      </div>`;
    }).join('');
    if (podeDef) {
      alvo.querySelectorAll('[data-atual]').forEach(b => b.onclick = async () => { const v = prompt('Valor atual (' + b.dataset.u + '):'); if (v == null) return; try { await api('PATCH', '/metas/' + b.dataset.atual, { atualManual: v }); carregarMetas(); } catch (e) { alert(e.message); } });
      alvo.querySelectorAll('[data-alvo]').forEach(b => b.onclick = async () => { const v = prompt('Novo alvo (' + b.dataset.u + '):'); if (v == null) return; try { await api('PATCH', '/metas/' + b.dataset.alvo, { alvo: v }); carregarMetas(); } catch (e) { alert(e.message); } });
      alvo.querySelectorAll('[data-del-mt]').forEach(b => b.onclick = async () => { if (!confirm('Excluir esta meta?')) return; try { await api('DELETE', '/metas/' + b.dataset.delMt); carregarMetas(); } catch (e) { alert(e.message); } });
    }
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Datas quentes (alta demanda) ---------
async function renderDatasQuentes() {
  const c = conteudo();
  const podeDef = ESTADO.me.papel === 'admin' || ESTADO.areas.includes('*') || ESTADO.areas.includes('ceo') || ESTADO.areas.includes('revenue');
  c.innerHTML = cabecalho('Datas quentes', 'Períodos de alta demanda em Brasília. Marque "preço ajustado?" para não vender barato nas datas nobres.') + `
    ${podeDef ? `<details class="cr-box" id="dq-box"><summary class="cr-sum">➕ Nova data quente</summary>
      <form class="form" id="dq-form" style="max-width:660px;margin-top:12px">
        <label>Evento / período * <input id="dq-nome" required maxlength="120" placeholder="ex.: Réveillon 2026/2027"></label>
        <div class="hi-grid">
          <label>De <input id="dq-de" type="date"></label>
          <label>Até <input id="dq-ate" type="date"></label>
          <label>Estadia mínima (noites) <input id="dq-minstay" type="number" min="0" step="1"></label>
          <label class="serv-ativo" style="align-self:end"><input type="checkbox" id="dq-preco"> Preço já ajustado</label>
        </div>
        <label>Observação <input id="dq-obs" maxlength="200"></label>
        <button class="btn" type="submit">Adicionar</button>
      </form>
    </details>` : ''}
    <div id="dq-lista"><p class="vazio">Carregando…</p></div>`;
  if (podeDef) {
    $('#dq-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const corpo = { nome: $('#dq-nome').value.trim(), de: $('#dq-de').value, ate: $('#dq-ate').value, minStay: $('#dq-minstay').value, precoAjustado: $('#dq-preco').checked, obs: $('#dq-obs').value.trim() };
      try { await api('POST', '/revenue/datas-quentes', corpo); $('#dq-form').reset(); $('#dq-box').open = false; carregarDatasQuentes(); }
      catch (e) { alert(e.message); }
    };
  }
  carregarDatasQuentes();
}
async function carregarDatasQuentes() {
  const alvo = $('#dq-lista'); if (!alvo) return;
  const podeDef = ESTADO.me.papel === 'admin' || ESTADO.areas.includes('*') || ESTADO.areas.includes('ceo') || ESTADO.areas.includes('revenue');
  try {
    const { datas } = await api('GET', '/revenue/datas-quentes');
    if (!datas.length) { alvo.innerHTML = '<div class="vazio">Nenhuma data quente cadastrada. Adicione as datas nobres (Réveillon, Carnaval, Marcha dos Prefeitos…).</div>'; return; }
    alvo.innerHTML = datas.map(d => {
      const cor = d.precoAjustado ? 'var(--ok)' : 'var(--alerta)';
      const per = [d.de, d.ate].filter(Boolean).map(x => x.slice(8, 10) + '/' + x.slice(5, 7)).join(' a ');
      return `<div class="linha-item" style="border-left:4px solid ${cor};${d.passada ? 'opacity:.55' : ''}">
        <span class="qtd" style="background:${cor};color:#fff">${d.precoAjustado ? '✓' : '!'}</span>
        <span class="nome">${esc(d.nome)} <span class="obs">${per ? per : ''}${d.minStay ? ' · mín. ' + d.minStay + ' noites' : ''}${d.obs ? ' · ' + esc(d.obs) : ''}${d.passada ? ' · (passada)' : ''}</span>
          <br><b style="color:${cor}">${d.precoAjustado ? 'Preço ajustado' : '⚠️ Preço NÃO ajustado'}</b></span>
        ${podeDef ? `<div class="acoes" style="grid-column:2;grid-row:1/span 3">
          <button class="btn peq ${d.precoAjustado ? 'secund' : ''}" data-toggle-dq="${d.id}" data-v="${d.precoAjustado ? 0 : 1}">${d.precoAjustado ? 'Desmarcar' : 'Marcar ajustado'}</button>
          <button class="btn peq perigo" data-del-dq="${d.id}">✕</button></div>` : ''}
      </div>`;
    }).join('');
    if (podeDef) {
      alvo.querySelectorAll('[data-toggle-dq]').forEach(b => b.onclick = async () => { try { await api('PATCH', '/revenue/datas-quentes/' + b.dataset.toggleDq, { precoAjustado: b.dataset.v === '1' }); carregarDatasQuentes(); } catch (e) { alert(e.message); } });
      alvo.querySelectorAll('[data-del-dq]').forEach(b => b.onclick = async () => { if (!confirm('Excluir esta data?')) return; try { await api('DELETE', '/revenue/datas-quentes/' + b.dataset.delDq); carregarDatasQuentes(); } catch (e) { alert(e.message); } });
    }
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Acessos do Hóspede (contas da Área do Hóspede / app) ---------
async function renderAcessosHospede() {
  const c = conteudo();
  c.innerHTML = cabecalho('Acessos do Hóspede', 'Quantas pessoas têm cadastro (login e senha) para acessar a Área do Hóspede e o app — sempre atualizado.') + '<div id="ah-corpo"><p class="vazio">Carregando…</p></div>';
  try {
    const d = await api('GET', '/hospede/acessos-stats');
    const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : 0;
    const cards = `<div class="cards">
      <div class="card"><div class="n">${d.total}</div><div class="rot">👤 Contas cadastradas (login e senha)</div></div>
      <div class="card"><div class="n" style="color:var(--ok)">${d.ativas}</div><div class="rot">✅ Ativas</div></div>
      <div class="card"><div class="n">${d.jaAcessaram}</div><div class="rot">🔓 Já acessaram (${pct(d.jaAcessaram, d.total)}%)</div></div>
      <div class="card"><div class="n" style="color:${d.pendentes1oAcesso ? 'var(--cerrado)' : 'var(--ok)'}">${d.pendentes1oAcesso}</div><div class="rot">⏳ Pendentes de 1º acesso</div></div>
      <div class="card"><div class="n" style="color:var(--lago)">${d.comApp}</div><div class="rot">📱 Com app/notificações ativas</div></div>
      <div class="card"><div class="n">${d.ativos30}</div><div class="rot">🔁 Ativos nos últimos 30 dias</div></div>
      <div class="card"><div class="n">${d.novos30}</div><div class="rot">🆕 Novos nos últimos 30 dias</div></div>
      <div class="card"><div class="n">${d.comVinculoStays}</div><div class="rot">🔗 Vinculadas a cliente da Stays</div></div>
    </div>`;
    const trend = d.meses && d.meses.length ? `<h2 class="titulo" style="font-size:1.15rem">Novos cadastros por mês</h2>
      <div class="lista-itens">${d.meses.map(m => {
        const max = Math.max(...d.meses.map(x => x.n)) || 1;
        return `<div class="linha-item"><span class="nome">${esc(m.mes)}</span><span class="quem" style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;height:10px;width:${Math.round(160 * m.n / max)}px;background:var(--lago);border-radius:5px"></span> ${m.n}</span></div>`;
      }).join('')}</div>` : '';
    const rec = d.recentes && d.recentes.length ? `<h2 class="titulo" style="font-size:1.15rem">Últimos cadastros</h2>
      <div class="lista-itens">${d.recentes.map(r => `<div class="linha-item"><span class="nome">${esc(r.nome)} ${r.app ? '<span class="chip">📱 app</span>' : ''} ${r.acessou ? '<span class="chip">🔓 acessou</span>' : '<span class="chip">⏳ 1º acesso</span>'}</span><span class="quem">${r.criadoEm ? dataBr(r.criadoEm) : ''}</span></div>`).join('')}</div>` : '';
    $('#ah-corpo').innerHTML = cards + trend + rec + `<p class="cal-rodape">Atualizado em ${dataBr(d.geradoEm)}. "Pendentes de 1º acesso" = receberam a senha temporária e ainda não entraram. "Com app" = instalaram o app (PWA) e ativaram notificações. Sem dados pessoais nesta tela (LGPD); a lista completa fica em Área do Hóspede, só admin.</p>`;
  } catch (e) { $('#ah-corpo').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// --------- Relatórios ---------
function itemRelatorioHtml(r) {
  const tipo = r.tipo === 'produto' ? 'Produto' : r.tipo === 'servico' ? 'Serviço' : 'Relatório';
  return `<div class="item">
    <h3>${esc(r.titulo)}</h3>
    <div class="meta">
      <span class="chip">${esc(nomeArea(r.area))}</span>
      <span class="chip tipo-${esc(r.tipo)}">${tipo}</span>
      ${r.periodo ? `<span class="chip">${esc(r.periodo)}</span>` : ''}
      <span>por ${esc(r.autor || '—')} · ${dataBr(r.publicadoEm)}</span>
    </div>
    ${r.resumo ? `<p style="margin:8px 0 0;font-size:.92rem">${esc(limparMd(r.resumo))}</p>` : ''}
    <div class="acoes">
      <button class="btn peq" data-abrir="${r.id}" data-fmt="${esc(r.formato)}">Abrir</button>
      <button class="btn peq perigo" data-excluir="${r.id}">Excluir</button>
    </div>
  </div>`;
}
async function renderRelatorios() {
  conteudo().innerHTML = cabecalho('Relatórios & Entregas', 'Tudo o que os agentes produziram, por área. Use a busca para encontrar rápido.');
  const opcoes = ESTADO.areas.map(a => `<option value="${a}">${esc(nomeArea(a))}</option>`).join('');
  conteudo().innerHTML += `<div class="barra">
    <input id="busca" type="search" placeholder="🔎 Buscar por título, resumo, autor, período…" style="flex:1;min-width:220px" autofocus>
    <label style="flex-direction:row;align-items:center;gap:8px;font-weight:600">Área
      <select id="filtro-area"><option value="">Todas</option>${opcoes}</select></label>
    <select id="filtro-tipo"><option value="">Todos os tipos</option><option value="relatorio">Relatórios</option><option value="produto">Produtos</option><option value="servico">Serviços</option></select>
  </div><div id="lista-rel"></div>`;
  // termo vindo da busca da Visão geral
  if (ESTADO.buscaPrefill) { $('#busca').value = ESTADO.buscaPrefill; ESTADO.buscaPrefill = ''; }
  let cache = [];
  const aplicar = () => {
    const q = normaliza($('#busca').value).trim();
    const tipo = $('#filtro-tipo').value;
    const termos = q ? q.split(/\s+/) : [];
    const filtrados = cache.filter(r => {
      if (tipo && r.tipo !== tipo) return false;
      if (!termos.length) return true;
      const alvo = normaliza([r.titulo, r.resumo, r.autor, nomeArea(r.area), r.periodo].join(' '));
      return termos.every(t => alvo.includes(t));
    });
    $('#lista-rel').innerHTML = filtrados.length
      ? `<p class="sub" style="margin:0 0 10px">${filtrados.length} resultado(s)${q ? ' para “' + esc($('#busca').value) + '”' : ''}</p><div class="lista">${filtrados.map(itemRelatorioHtml).join('')}</div>`
      : `<div class="vazio">Nada encontrado${q ? ' para “' + esc($('#busca').value) + '”' : ''}. Tente outra palavra ou troque a área.</div>`;
    ligarAcoesRelatorio();
  };
  const carregar = async () => {
    const area = $('#filtro-area').value;
    const r = await api('GET', '/relatorios' + (area ? '?area=' + encodeURIComponent(area) : ''));
    cache = r.relatorios;
    aplicar();
  };
  $('#filtro-area').onchange = carregar;
  $('#filtro-tipo').onchange = aplicar;
  $('#busca').oninput = aplicar;
  carregar();
}
// Abre a entrega "FAQ do Claude" (área TI) pelo TÍTULO — robusto a republicações (o id muda no upsert).
async function renderFaqClaude() {
  conteudo().innerHTML = cabecalho('🤖 FAQ do Claude', 'Abrindo…');
  try {
    const r = await api('GET', '/relatorios?area=ti');
    const faq = (r.relatorios || []).find(x => normaliza(x.titulo).startsWith('faq do claude'));
    if (faq) { abrirRelatorio(faq.id, faq.formato === 'arquivo' ? 'arquivo' : undefined); return; }
    ESTADO.buscaPrefill = 'FAQ do Claude';
    navegar('relatorios');
  } catch (e) {
    conteudo().innerHTML = cabecalho('🤖 FAQ do Claude', '') + `<p class="erro">${esc(e.message)}</p>`;
  }
}
function ligarAcoesRelatorio() {
  document.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => abrirRelatorio(b.dataset.abrir, b.dataset.fmt));
  document.querySelectorAll('[data-excluir]').forEach(b => b.onclick = async () => {
    if (!confirm('Excluir esta entrega?')) return;
    try { await api('DELETE', '/relatorios/' + b.dataset.excluir); navegar(ESTADO.secao); } catch (e) { alert(e.message); }
  });
}
async function abrirRelatorio(id, fmt) {
  if (fmt === 'arquivo') {
    // Abre o arquivo (dashboard HTML, PDF, imagem) DENTRO do app, num visor com botão de voltar,
    // em vez de uma aba nova solta (de onde é difícil retornar ao app, sobretudo no celular/PWA).
    const url = '/staff/api/relatorios/' + id + '/arquivo';
    conteudo().innerHTML = `<div class="visor-topo">
        <button class="btn secund peq" id="voltar">← Voltar</button>
        <a class="btn secund peq" href="${url}" target="_blank" rel="noopener">Abrir em nova aba ↗</a>
      </div>
      <iframe class="visor-arquivo" src="${url}" title="Relatório"></iframe>`;
    $('#voltar').onclick = () => navegar('relatorios');
    return;
  }
  try {
    const { relatorio: r } = await api('GET', '/relatorios/' + id);
    let corpo = '';
    if (r.formato === 'url') corpo = `<p><a href="${esc(r.url)}" target="_blank" rel="noopener">Abrir link externo →</a></p>`;
    else corpo = mdParaHtml(r.texto || '');
    conteudo().innerHTML = `<button class="btn secund peq" id="voltar">← Voltar</button>
      ${cabecalho(r.titulo, nomeArea(r.area) + ' · ' + dataBr(r.publicadoEm) + (r.periodo ? ' · ' + r.periodo : ''))}
      <div class="doc">${corpo}</div>`;
    $('#voltar').onclick = () => navegar('relatorios');
  } catch (e) { alert(e.message); }
}

// --------- Publicar entrega ---------
function renderPublicar() {
  const opcoes = ESTADO.areas.map(a => `<option value="${a}">${esc(nomeArea(a))}</option>`).join('');
  conteudo().innerHTML = cabecalho('Publicar entrega', 'Adicione um relatório, produto ou serviço ao portal.') + `
  <form class="form form-painel" id="form-pub">
    <label>Área / agente <select id="p-area" required>${opcoes}</select></label>
    <label>Tipo <select id="p-tipo"><option value="relatorio">Relatório</option><option value="produto">Produto</option><option value="servico">Serviço</option></select></label>
    <label>Título <input id="p-titulo" required maxlength="160"></label>
    <label>Período (opcional) <input id="p-periodo" placeholder="ex.: maio/2026" maxlength="50"></label>
    <label>Resumo (opcional) <textarea id="p-resumo" rows="2" maxlength="1000"></textarea></label>
    <label>Conteúdo em texto (Markdown) <textarea id="p-texto" rows="8" placeholder="# Título&#10;Use **negrito**, listas, tabelas…"></textarea></label>
    <label>…ou link externo (opcional) <input id="p-url" placeholder="https://…"></label>
    <label>…ou anexar arquivo (PDF, etc.) <input id="p-arq" type="file"></label>
    <button class="btn" type="submit">Publicar</button>
    <p id="p-msg" class="erro"></p>
  </form>`;
  $('#form-pub').onsubmit = async (ev) => {
    ev.preventDefault();
    const msg = $('#p-msg'); msg.textContent = ''; msg.className = 'erro';
    const corpo = { area: $('#p-area').value, tipo: $('#p-tipo').value, titulo: $('#p-titulo').value.trim(), periodo: $('#p-periodo').value.trim(), resumo: $('#p-resumo').value.trim() };
    const arq = $('#p-arq').files[0];
    try {
      if (arq) {
        if (arq.size > 12 * 1024 * 1024) throw new Error('Arquivo acima de 12 MB.');
        corpo.nomeArquivo = arq.name;
        corpo.arquivoBase64 = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = no; fr.readAsDataURL(arq); });
      } else if ($('#p-url').value.trim()) { corpo.url = $('#p-url').value.trim(); }
      else { corpo.texto = $('#p-texto').value; if (!corpo.texto.trim()) throw new Error('Informe texto, link ou arquivo.'); }
      if (!corpo.titulo) throw new Error('Título é obrigatório.');
      await api('POST', '/relatorios', corpo);
      msg.className = 'ok-msg'; msg.textContent = 'Publicado! Veja em Relatórios & Entregas.';
      $('#form-pub').reset();
    } catch (e) { msg.textContent = e.message; }
  };
}

// --------- Painéis operacionais ---------
async function renderPainel(painel, titulo) {
  conteudo().innerHTML = cabecalho(titulo, 'Dados coletados pelo site/backend (mais recentes primeiro).');
  try {
    const { itens } = await api('GET', '/dados/' + painel);
    if (!itens.length) { conteudo().innerHTML += `<div class="vazio">Nada registrado ainda.</div>`; return; }
    if (painel === 'eventos') {
      conteudo().innerHTML += `<div class="lista">${itens.map(e => `<div class="item"><div class="meta"><span class="chip">${esc((e.evento && (e.evento.action || e.evento.type)) || 'evento')}</span><span>${dataBr(e._recebido)}</span></div><pre style="white-space:pre-wrap;font-size:.8rem;margin:8px 0 0">${esc(JSON.stringify(e.evento || e, null, 2)).slice(0, 1200)}</pre></div>`).join('')}</div>`;
      return;
    }
    const cols = Array.from(itens.reduce((s, it) => { Object.keys(it).forEach(k => { if (k !== '_recebido') s.add(k); }); return s; }, new Set())).slice(0, 7);
    conteudo().innerHTML += `<table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th>Recebido</th></tr></thead><tbody>${itens.map(it => `<tr>${cols.map(c => `<td>${esc(String(it[c] == null ? '' : it[c])).slice(0, 200)}</td>`).join('')}<td>${dataBr(it._recebido)}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) { conteudo().innerHTML += `<p class="erro">${esc(e.message)}</p>`; }
}

// A tela "Visitas do site" mora em app-visitas.js (renderEstatisticas) — ela
// cobre todos os sites do grupo, origem, localidade e funil, e ficou grande
// demais para conviver aqui.

// --------- Usuários (admin) ---------
async function renderUsuarios() {
  conteudo().innerHTML = cabecalho('Usuários', 'Crie acessos e defina quais áreas cada um enxerga.') +
    `<div class="barra"><button class="btn" id="novo-user">+ Novo usuário</button></div><div id="lista-users"></div>`;
  $('#novo-user').onclick = () => formUsuario(null);
  try {
    const { usuarios } = await api('GET', '/usuarios');
    $('#lista-users').innerHTML = `<table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Áreas</th><th>Status</th><th></th></tr></thead><tbody>${usuarios.map(u => `
      <tr>
        <td>${esc(u.nome)}</td><td>${esc(u.email)}</td>
        <td>${u.papel === 'admin' ? 'Admin' : 'Staff'}</td>
        <td>${u.papel === 'admin' ? 'Todas' : (u.areas.map(nomeArea).join(', ') || '—')}</td>
        <td>${u.ativo ? 'Ativo' : 'Inativo'}${u.precisaTrocarSenha ? ' · trocar senha' : ''}</td>
        <td><button class="btn peq secund" data-edit="${u.id}">Editar</button></td>
      </tr>`).join('')}</tbody></table>`;
    const mapa = Object.fromEntries(usuarios.map(u => [u.id, u]));
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => formUsuario(mapa[b.dataset.edit]));
  } catch (e) { $('#lista-users').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

function formUsuario(u) {
  const ed = !!u;
  const checks = ESTADO.catalogo.map(a => `<label><input type="checkbox" value="${a.id}" ${u && u.areas.includes(a.id) ? 'checked' : ''}> ${esc(a.nome)}</label>`).join('');
  conteudo().innerHTML = cabecalho(ed ? 'Editar usuário' : 'Novo usuário', '') + `
  <form class="form" id="form-user">
    <label>Nome <input id="u-nome" value="${ed ? esc(u.nome) : ''}" required></label>
    <label>E-mail <input id="u-email" type="email" value="${ed ? esc(u.email) : ''}" ${ed ? 'disabled' : 'required'}></label>
    <label>Papel <select id="u-papel">
      <option value="staff" ${ed && u.papel === 'staff' ? 'selected' : ''}>Staff (acesso limitado)</option>
      <option value="admin" ${ed && u.papel === 'admin' ? 'selected' : ''}>Admin (acesso total)</option>
    </select></label>
    <div id="bloco-areas"><label>Áreas liberadas</label><div class="areas-grid">${checks}</div></div>
    <label>${ed ? 'Definir nova senha (opcional)' : 'Senha inicial (mín. 8)'} <input id="u-senha" type="password" ${ed ? '' : 'required minlength=8'} autocomplete="new-password"></label>
    ${ed ? `<label><input type="checkbox" id="u-ativo" ${u.ativo ? 'checked' : ''}> Usuário ativo</label>` : ''}
    <div class="acoes">
      <button class="btn" type="submit">${ed ? 'Salvar' : 'Criar usuário'}</button>
      ${ed ? `<button class="btn secund" type="button" id="u-link">🔗 Link de acesso</button>` : ''}
      ${ed && u.id !== ESTADO.me.id ? `<button class="btn perigo" type="button" id="u-del">Remover</button>` : ''}
      <button class="btn secund" type="button" id="u-cancel">Cancelar</button>
    </div>
    <div id="u-link-box" class="hidden aviso" style="margin-top:10px"></div>
    <p id="u-msg" class="erro"></p>
  </form>`;
  const togglAreas = () => { $('#bloco-areas').style.display = $('#u-papel').value === 'admin' ? 'none' : ''; };
  $('#u-papel').onchange = togglAreas; togglAreas();
  $('#u-cancel').onclick = () => navegar('usuarios');
  if ($('#u-del')) $('#u-del').onclick = async () => { if (!confirm('Remover este usuário?')) return; try { await api('DELETE', '/usuarios/' + u.id); navegar('usuarios'); } catch (e) { $('#u-msg').textContent = e.message; } };
  if ($('#u-link')) $('#u-link').onclick = async () => {
    try {
      const r = await api('POST', '/usuarios/' + u.id + '/link-acesso');
      const url = location.origin + '/staff/?acesso=' + r.token;
      const box = $('#u-link-box'); box.classList.remove('hidden');
      box.innerHTML = `Link de acesso (válido ${r.expiraMin} min) — envie por WhatsApp para <b>${esc(u.nome)}</b>:<br>
        <input value="${esc(url)}" readonly style="width:100%;margin:6px 0" onclick="this.select()">
        <button class="btn peq" id="u-link-copy">📋 Copiar</button>`;
      $('#u-link-copy').onclick = () => navigator.clipboard.writeText(url).then(() => { $('#u-link-copy').textContent = '✓ Copiado'; });
    } catch (e) { $('#u-msg').textContent = e.message; }
  };
  $('#form-user').onsubmit = async (ev) => {
    ev.preventDefault();
    const areas = Array.from(document.querySelectorAll('#bloco-areas input:checked')).map(c => c.value);
    const msg = $('#u-msg'); msg.textContent = '';
    try {
      if (!ed) {
        await api('POST', '/usuarios', { nome: $('#u-nome').value, email: $('#u-email').value, papel: $('#u-papel').value, areas, senha: $('#u-senha').value });
      } else {
        const corpo = { nome: $('#u-nome').value, papel: $('#u-papel').value, areas, ativo: $('#u-ativo').checked };
        if ($('#u-senha').value) corpo.novaSenha = $('#u-senha').value;
        await api('PATCH', '/usuarios/' + u.id, corpo);
      }
      navegar('usuarios');
    } catch (e) { msg.textContent = e.message; }
  };
}
