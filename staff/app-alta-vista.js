'use strict';
// ============================================================================
// Portal Staff — módulo: app-alta-vista (Villela Alta Vista 360, o estúdio
// visual: drone, vídeo com IA, foto 360° e tour virtual). Administração:
// leads do orçamento, catálogo/preços, portfólio (com a trava do conceitual),
// FAQ, conteúdos e configuração. Compartilha o escopo global com app-core.js.
// ============================================================================
const avBrl = (c) => 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const avDia = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const avCard = (rot, n, sub) => `<div class="card"><div class="n">${n}</div><div class="rot">${esc(rot)}</div>${sub ? `<div class="obs">${esc(sub)}</div>` : ''}</div>`;
let AV_VISAO = 'leads';

async function renderAltaVista() {
  conteudo().innerHTML = cabecalho('🚁 Alta Vista 360 — estúdio visual',
    'Drone, vídeo com IA, foto 360° e tour virtual. Aqui: leads, preços, portfólio, FAQ, conteúdos e configuração. Site público: /alta-vista.')
    + `<div class="barra">
        <a class="btn secund" href="/alta-vista" target="_blank" rel="noopener">🌐 Site /alta-vista</a>
        <a class="btn secund" href="/alta-vista/precos" target="_blank" rel="noopener">🏷️ Página de preços</a>
        <a class="btn secund" href="/alta-vista/orcamento" target="_blank" rel="noopener">📐 Formulário de orçamento</a>
       </div>
       <div id="av-cards" class="cards"></div>
       <div class="barra" style="margin-top:12px">
         ${['leads', 'propostas', 'projetos', 'operacao', 'tours', 'clientes', 'financeiro', 'lancamento', 'relatorios', 'precos', 'portfolio', 'faqs', 'conteudos', 'config']
      .map((v) => `<button class="btn secund av-nav" data-v="${v}">${{
        leads: '📩 Leads (CRM)', propostas: '📄 Propostas', projetos: '🎬 Projetos', operacao: '🗂 Quadro',
        tours: '🌐 Tours 360°', clientes: '👥 Clientes', financeiro: '💰 Financeiro',
        lancamento: '🚀 Lançamento', relatorios: '📊 Relatórios', precos: '🏷️ Serviços & preços',
        portfolio: '🖼️ Portfólio', faqs: '❓ FAQ', conteudos: '📝 Conteúdos', config: '⚙️ Config',
      }[v]}</button>`).join('')}
       </div>
       <div id="av-corpo"><p class="vazio">Carregando…</p></div>`;
  document.querySelectorAll('.av-nav').forEach((b) => { b.onclick = () => { AV_VISAO = b.dataset.v; avCorpo(); }; });
  avCarregar();
}

async function avCarregar() {
  try {
    const d = await api('GET', '/alta-vista/dashboard');
    window._av = d;
    $('#av-cards').innerHTML = [
      avCard('Leads novos', d.leads.novos, `${d.leads.semana} chegaram nos últimos 7 dias`),
      avCard('Em conversa', d.leads.em_contato + d.leads.proposta, `${d.leads.proposta} com proposta enviada`),
      avCard('Propostas aceitas', d.propostas.aceitas, `${avBrl(d.propostas.valor_aceito_centavos)} fechados · ${d.propostas.enviadas} aguardando`),
      avCard('Fechados', d.leads.ganhos, `${d.leads.total} lead(s) no total`),
      avCard('Tarefas pendentes', d.tarefas_pendentes, 'follow-ups e lembretes'),
      avCard('Clientes Fundadores', `${d.fundadores.usadas}/${d.fundadores.vagas_total}`, d.fundadores.ativo ? 'programa ativo' : 'programa encerrado'),
    ].join('');
    window._avOrigem = d.conversao_por_origem || [];
    avCorpo();
  } catch (e) { $('#av-corpo').innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

async function avCorpo() {
  const cx = $('#av-corpo');
  cx.innerHTML = '<p class="vazio">Carregando…</p>';
  document.querySelectorAll('.av-nav').forEach((b) => b.classList.toggle('ativo', b.dataset.v === AV_VISAO));
  try {
    if (AV_VISAO === 'leads') return avLeads(cx);
    if (AV_VISAO === 'propostas') return avPropostas(cx);
    if (AV_VISAO === 'projetos') return avProjetosStaff(cx);
    if (AV_VISAO === 'operacao') return avOperacao(cx);
    if (AV_VISAO === 'lancamento') return avLancamento(cx);
    if (AV_VISAO === 'relatorios') return avRelatorios(cx);
    if (AV_VISAO === 'tours') return avTours(cx);
    if (AV_VISAO === 'clientes') return avClientes(cx);
    if (AV_VISAO === 'financeiro') return avFinanceiro(cx);
    if (AV_VISAO === 'precos') return avPrecos(cx);
    if (AV_VISAO === 'portfolio') return avPortfolio(cx);
    if (AV_VISAO === 'faqs') return avFaqs(cx);
    if (AV_VISAO === 'conteudos') return avConteudos(cx);
    if (AV_VISAO === 'config') return avConfig(cx);
  } catch (e) { cx.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// ---------------- leads (CRM) ----------------
async function avLeads(cx) {
  const d = await api('GET', '/alta-vista/leads');
  const origem = (window._avOrigem || []).map((o) => `<span class="pill">${esc(o.origem)}: ${o.ganhos}/${o.total}</span>`).join(' ');
  if (!d.leads.length) { cx.innerHTML = '<p class="vazio">Nenhum lead ainda. Quando alguém usar o recomendador ou o orçamento, aparece aqui.</p>'; return; }
  const opt = (l) => d.status_possiveis.map((st) => `<option value="${st}"${l.status === st ? ' selected' : ''}>${st.replace('_', ' ')}</option>`).join('');
  cx.innerHTML = `<div class="barra">
      <a class="btn secund" href="/staff/api/alta-vista/leads.csv" download="leads-alta-vista.csv">⬇️ Exportar CSV</a>
      ${origem ? `<span class="sub" style="align-self:center">Conversão por origem (ganhos/total): ${origem}</span>` : ''}
    </div>` + tabela(['Quando', 'Nome', 'Contato', 'Imóvel', 'Pontos', 'Recomendado', 'Responsável', 'Status', ''],
    d.leads.map((l) => [
      avDia(l.criado_em),
      `<b>${esc(l.nome)}</b>${l.cidade ? `<br><small>${esc(l.cidade)}</small>` : ''}`,
      [l.whatsapp && `<a href="https://wa.me/55${esc(l.whatsapp.replace(/^55/, ''))}" target="_blank" rel="noopener">📱 ${esc(l.whatsapp)}</a>`, l.email && esc(l.email)].filter(Boolean).join('<br>') || '—',
      [l.tipo_imovel, l.finalidade].filter(Boolean).map(esc).join('<br>') || '—',
      `<b>${l.pontuacao || 0}</b>/10`,
      l.recomendacao && l.recomendacao.pacote ? `<span class="pill">${esc(l.recomendacao.pacote.nome)}</span>${l.recomendacao.analise_manual ? ' ⚠️' : ''}` : '—',
      esc(l.responsavel || '—'),
      `<select data-lead="${esc(l.id)}" class="av-lead-st">${opt(l)}</select>`,
      `<button class="btn secund peq av-lead-abrir" data-id="${esc(l.id)}">🔎 Abrir</button>`,
    ])) + `<div id="av-lead-detalhe"></div>`;
  document.querySelectorAll('.av-lead-st').forEach((sel) => {
    sel.onchange = async () => {
      let motivo = '';
      if (sel.value === 'perdido') { motivo = prompt('Motivo da perda (obrigatório):') || ''; if (!motivo) { avLeads(cx); return; } }
      try { await api('POST', `/alta-vista/leads/${sel.dataset.lead}/status`, { status: sel.value, motivo }); avCarregar(); }
      catch (e) { alert(e.message); avLeads(cx); }
    };
  });
  document.querySelectorAll('.av-lead-abrir').forEach((b) => { b.onclick = () => avLeadDetalhe(b.dataset.id); });
}

async function avLeadDetalhe(id) {
  const alvo = $('#av-lead-detalhe');
  alvo.innerHTML = '<p class="vazio">Carregando…</p>';
  const d = await api('GET', `/alta-vista/leads/${id}`);
  const cat = await api('GET', '/alta-vista/catalogo');
  const l = d.lead;
  const rec = l.recomendacao;
  const opcoes = [...cat.combos.filter((x) => x.ativo), ...cat.servicos.filter((x) => x.ativo)];
  alvo.innerHTML = `<div class="caixa" style="margin-top:16px">
    <h3 class="titulo-sec">🔎 ${esc(l.nome)} <small style="font-weight:400">· ${esc(l.status)} · ${l.pontuacao}/10</small></h3>
    ${rec ? `<p class="sub">Recomendador: <b>${esc(rec.pacote.nome)}</b> · base ${avBrl(rec.preco_base_centavos)} · ${esc(rec.atendimento)}${rec.analise_manual ? ' · ⚠️ análise manual' : ''}</p>
      ${(rec.motivos || []).map((m) => `<small>— ${esc(m)}</small>`).join('<br>')}` : ''}
    ${l.mensagem ? `<p style="margin-top:8px"><small>💬 ${esc(l.mensagem)}</small></p>` : ''}
    <div class="linha-2col" style="margin-top:10px">
      <label>Responsável<input id="ld-resp" value="${esc(l.responsavel)}"></label>
      <label>Próxima ação<input id="ld-prox" value="${esc(l.proxima_acao)}"></label>
    </div>
    <div class="barra"><button class="btn secund peq" id="ld-salvar">💾 Salvar campos</button></div>

    <h4 class="titulo-sec" style="margin-top:16px">📄 Propostas</h4>
    ${d.propostas.length ? tabela(['Criada', 'Total', 'Status', 'Link', ''], d.propostas.map((p) => [
      avDia(p.criado_em), avBrl(p.total_centavos), esc(p.status),
      `<a href="/alta-vista/proposta/${esc(p.token)}" target="_blank" rel="noopener">abrir ↗</a>`,
      p.status === 'rascunho' ? `<button class="btn peq av-pp-enviar" data-id="${esc(p.id)}">📨 Enviar</button>` : '',
    ])) : '<p class="sub">Nenhuma proposta ainda.</p>'}
    <details style="margin-top:8px"><summary style="cursor:pointer;font-weight:700">➕ Nova proposta</summary>
      <div class="chips" style="margin-top:10px">${opcoes.map((o) => `<label><input type="checkbox" name="pp-item" value="${esc(o.slug)}"> ${esc(o.nome)} (${avBrl(o.preco_centavos)})</label>`).join('')}</div>
      <div class="linha-2col">
        <label>Desconto % (fundadores: até 20)<input id="pp-desc" type="number" min="0" max="50" value="0"></label>
        <label>Validade (dias)<input id="pp-val" type="number" min="1" max="60" value="7"></label>
      </div>
      <label>Motivo do desconto<input id="pp-motivo" placeholder="ex.: Clientes Fundadores — autorização de portfólio"></label>
      <label>Observações ao cliente<input id="pp-nota"></label>
      <div class="barra"><button class="btn peq" id="pp-criar">Criar proposta (rascunho)</button></div>
    </details>

    <h4 class="titulo-sec" style="margin-top:16px">🗒️ Interações</h4>
    <div class="barra"><input id="it-texto" placeholder="registrar nota, ligação, WhatsApp…" style="flex:1;min-width:220px">
      <select id="it-tipo"><option value="nota">nota</option><option value="whatsapp">whatsapp</option><option value="email">e-mail</option><option value="ligacao">ligação</option></select>
      <button class="btn secund peq" id="it-add">➕</button></div>
    ${d.interacoes.length ? d.interacoes.map((i) => `<p style="margin:4px 0"><small><b>${esc(i.tipo)}</b> · ${avDia(i.criado_em)} · ${esc(i.quem)} — ${esc(i.texto)}</small></p>`).join('') : '<p class="sub">Sem interações.</p>'}

    <h4 class="titulo-sec" style="margin-top:16px">✅ Tarefas</h4>
    <div class="barra"><input id="tf-texto" placeholder="ex.: ligar amanhã às 10h" style="flex:1;min-width:220px">
      <input id="tf-data" type="date" style="width:auto"><button class="btn secund peq" id="tf-add">➕</button></div>
    ${d.tarefas.length ? d.tarefas.map((tf) => `<p style="margin:4px 0"><small>${tf.feita ? '☑' : `<button class="btn secund peq av-tf-ok" data-id="${esc(tf.id)}">☐</button>`} ${esc(tf.texto)}${tf.vence_em ? ' · vence ' + avDia(tf.vence_em) : ''}</small></p>`).join('') : '<p class="sub">Sem tarefas.</p>'}
  </div>`;
  $('#ld-salvar').onclick = async () => {
    try { await api('PATCH', `/alta-vista/leads/${id}`, { responsavel: $('#ld-resp').value, proxima_acao: $('#ld-prox').value }); avLeadDetalhe(id); } catch (e) { alert(e.message); }
  };
  $('#pp-criar').onclick = async () => {
    const itens = [].slice.call(document.querySelectorAll('input[name=pp-item]:checked')).map((x) => x.value);
    if (!itens.length) return alert('Escolha ao menos um item do catálogo.');
    try {
      await api('POST', '/alta-vista/propostas', { lead_id: id, itens, desconto_pct: Number($('#pp-desc').value || 0), motivo_desconto: $('#pp-motivo').value, validade_dias: Number($('#pp-val').value || 7), nota: $('#pp-nota').value });
      avLeadDetalhe(id);
    } catch (e) { alert(e.message); }
  };
  document.querySelectorAll('.av-pp-enviar').forEach((b) => {
    b.onclick = async () => {
      try {
        const r = await api('POST', `/alta-vista/propostas/${b.dataset.id}/enviar`, {});
        alert(`Proposta enviada.${r.email_enviado ? '\nE-mail disparado ao cliente.' : '\nLead sem e-mail — copie o link:'}\n${r.link}`);
        avLeadDetalhe(id);
      } catch (e) { alert(e.message); }
    };
  });
  $('#it-add').onclick = async () => {
    try { await api('POST', `/alta-vista/leads/${id}/interacoes`, { tipo: $('#it-tipo').value, texto: $('#it-texto').value }); avLeadDetalhe(id); } catch (e) { alert(e.message); }
  };
  $('#tf-add').onclick = async () => {
    try { await api('POST', '/alta-vista/tarefas', { lead_id: id, texto: $('#tf-texto').value, vence_em: $('#tf-data').value }); avLeadDetalhe(id); } catch (e) { alert(e.message); }
  };
  document.querySelectorAll('.av-tf-ok').forEach((b) => {
    b.onclick = async () => { try { await api('POST', `/alta-vista/tarefas/${b.dataset.id}/concluir`, {}); avLeadDetalhe(id); } catch (e) { alert(e.message); } };
  });
}

// ---------------- projetos (Onda 3) ----------------
async function avProjetosStaff(cx) {
  const d = await api('GET', '/alta-vista/projetos');
  if (!d.projetos.length) { cx.innerHTML = '<p class="vazio">Nenhum projeto ainda. Crie a partir de uma proposta aceita (📄 Propostas → 🎬 Virar projeto).</p>'; return; }
  cx.innerHTML = tabela(['Criado', 'Projeto', 'Cliente', 'Status', 'Responsável', 'Agenda', 'Prazo', ''], d.projetos.map((p) => [
    avDia(p.criado_em),
    `<b>${esc(p.titulo)}</b>${p.total_centavos ? `<br><small>${avBrl(p.total_centavos)}</small>` : ''}`,
    p.cliente ? `${esc(p.cliente.nome)}<br><small>${esc(p.cliente.email)}</small>` : '—',
    `<span class="pill">${esc(d.status_rotulos[p.status] || p.status)}</span>`,
    esc(p.responsavel || '—'),
    p.agenda_em ? esc(p.agenda_em).replace('T', ' ') : '—',
    avDia(p.prazo_em),
    `<button class="btn secund peq av-pj-abrir" data-id="${esc(p.id)}">🔎 Abrir</button>`,
  ])) + '<div id="av-pj-detalhe"></div>';
  document.querySelectorAll('.av-pj-abrir').forEach((b) => { b.onclick = () => avProjetoStaffDetalhe(b.dataset.id); });
}

async function avProjetoStaffDetalhe(id) {
  const alvo = $('#av-pj-detalhe');
  alvo.innerHTML = '<p class="vazio">Carregando…</p>';
  const d = await api('GET', `/alta-vista/projetos/${id}`);
  const p = d.projeto;
  const proximas = (d.transicoes[p.status] || []).concat(d.terminais.includes(p.status) ? [] : ['cancelled']);
  alvo.innerHTML = `<div class="caixa" style="margin-top:16px">
    <h3 class="titulo-sec">🎬 ${esc(p.titulo)} <span class="pill">${esc(d.status_rotulos[p.status] || p.status)}</span></h3>
    <p class="sub">${d.cliente ? `Cliente: <b>${esc(d.cliente.nome)}</b> (${esc(d.cliente.email)}${d.cliente.tem_senha ? '' : ' · ⚠️ sem senha — reenviar convite em 👥 Clientes'})` : ''}
      ${d.imovel ? ` · Imóvel: <b>${esc(d.imovel.nome)}</b>${d.imovel.endereco ? ' — ' + esc(d.imovel.endereco) : ''}` : ' · sem imóvel vinculado'}</p>
    <div class="barra">
      ${proximas.map((st) => `<button class="btn secund peq av-pj-st" data-st="${st}">→ ${esc(d.status_rotulos[st] || st)}</button>`).join('') || '<span class="sub">status terminal</span>'}
    </div>
    <div class="linha-2col" style="margin-top:10px">
      <label>Responsável<input id="pj-resp" value="${esc(p.responsavel)}"></label>
      <label>Prazo de entrega<input id="pj-prazo" type="date" value="${esc(p.prazo_em)}"></label>
      <label>Agenda da captação<input id="pj-agenda" type="datetime-local" value="${esc(p.agenda_em)}"></label>
    </div>
    <div class="barra"><button class="btn secund peq" id="pj-salvar">💾 Salvar campos</button></div>

    <h4 class="titulo-sec" style="margin-top:14px">💰 Cobrança</h4>
    <div id="pj-parcelas"><p class="sub">Carregando…</p></div>

    <h4 class="titulo-sec" style="margin-top:14px">✅ Checklists de execução</h4>
    <div id="pj-checklists"><p class="sub">Carregando…</p></div>

    <h4 class="titulo-sec" style="margin-top:14px">🎞️ Entregas e versões</h4>
    ${d.entregas.length ? d.entregas.map((en) => `<div style="padding:8px 0;border-bottom:1px solid #e5e5e5">
      <b>${esc(en.titulo)}</b> <span class="pill${en.status === 'aprovada' ? ' ok' : ''}">${en.status === 'aprovada' ? `aprovada por ${esc(en.aprovada_por)} em ${avDia(en.aprovada_em)}` : 'em revisão'}</span>
      ${en.versoes.map((v) => `<p style="margin:4px 0"><small>v${v.numero} · ${avDia(v.criado_em)}${v.nota ? ' — ' + esc(v.nota) : ''} · ${(v.tamanho_bytes / 1048576).toFixed(1)} MB
        <button class="btn secund peq av-vs-ver" data-id="${esc(v.id)}">👁 Ver</button></small>
        ${v.comentarios.map((c) => `<br><small style="margin-left:14px">💬 <b>${esc(c.autor === 'cliente' ? c.autor_nome : c.autor_nome + ' (equipe)')}</b>${c.ancora && c.ancora.t != null ? ` [${Math.floor(c.ancora.t / 60)}:${String(Math.round(c.ancora.t % 60)).padStart(2, '0')}]` : ''} ${esc(c.texto)}</small>`).join('')}
        ${v.comentarios.length ? `<br><small style="margin-left:14px"><input data-vresp="${esc(v.id)}" placeholder="responder…" style="width:220px"> <button class="btn secund peq av-vs-resp" data-id="${esc(v.id)}">↩</button></small>` : ''}</p>`).join('')}
      <div class="barra"><input type="file" data-envio="${esc(en.id)}" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" style="max-width:230px">
        <input data-nota="${esc(en.id)}" placeholder="o que mudou nesta versão" style="flex:1;min-width:160px">
        <button class="btn secund peq av-vs-subir" data-id="${esc(en.id)}">⬆ Subir versão</button>
        <span data-prog="${esc(en.id)}" class="sub"></span></div>
    </div>`).join('') : '<p class="sub">Nenhum entregável criado.</p>'}
    <div class="barra" style="margin-top:8px">
      <input id="en-titulo" placeholder="ex.: Vídeo vertical 45s" style="flex:1;min-width:180px">
      <select id="en-tipo">${['video', 'foto', 'panorama', 'outro'].map((t) => `<option>${t}</option>`).join('')}</select>
      <button class="btn secund peq" id="en-criar">➕ Criar entregável</button>
    </div>

    <h4 class="titulo-sec" style="margin-top:14px">📎 Materiais enviados pelo cliente</h4>
    ${d.materiais.length ? d.materiais.map((m) => `<p style="margin:3px 0"><small>${esc(m.nome)} (${(m.tamanho_bytes / 1048576).toFixed(1)} MB) · ${avDia(m.criado_em)}
      <button class="btn secund peq av-mat-ver-st" data-id="${esc(m.id)}">👁 Ver</button></small></p>`).join('') : '<p class="sub">Nada enviado ainda.</p>'}

    <h4 class="titulo-sec" style="margin-top:14px">Briefing do cliente ${p.briefing_em ? `(${avDia(p.briefing_em)})` : '— pendente'}</h4>
    ${p.briefing ? Object.entries(p.briefing).filter(([, v]) => v).map(([k, v]) => `<p style="margin:4px 0"><small><b>${esc(k)}:</b> ${esc(v)}</small></p>`).join('') || '<p class="sub">vazio</p>' : '<p class="sub">O cliente ainda não preencheu.</p>'}

    <h4 class="titulo-sec" style="margin-top:14px">Andamento</h4>
    ${d.eventos.map((e) => `<p style="margin:3px 0"><small>${avDia(e.criado_em)} · <b>${esc(d.status_rotulos[e.para] || e.para)}</b> por ${esc(e.quem)}${e.justificativa ? ' — ' + esc(e.justificativa) : ''}</small></p>`).join('')}

    <h4 class="titulo-sec" style="margin-top:14px">Mensagens</h4>
    ${d.mensagens.map((m) => `<p style="margin:4px 0"><small><b>${m.autor === 'cliente' ? '👤 ' + esc(m.autor_nome) : '🏢 ' + esc(m.autor_nome)}</b> · ${avDia(m.criado_em)} — ${esc(m.texto)}</small></p>`).join('') || '<p class="sub">Sem mensagens.</p>'}
    <div class="barra"><input id="pj-msg" placeholder="responder ao cliente…" style="flex:1;min-width:220px"><button class="btn secund peq" id="pj-msg-env">📨 Enviar (com e-mail)</button></div>
  </div>`;
  document.querySelectorAll('.av-pj-st').forEach((b) => {
    b.onclick = async () => {
      const just = b.dataset.st === 'cancelled' ? (prompt('Justificativa do cancelamento (obrigatória):') || '') : (prompt('Justificativa (opcional):') || '');
      if (b.dataset.st === 'cancelled' && !just) return;
      try { await api('POST', `/alta-vista/projetos/${id}/status`, { status: b.dataset.st, justificativa: just }); avProjetoStaffDetalhe(id); avCarregar(); }
      catch (e) { alert(e.message); }
    };
  });
  $('#pj-salvar').onclick = async () => {
    try { await api('PATCH', `/alta-vista/projetos/${id}`, { responsavel: $('#pj-resp').value, prazo_em: $('#pj-prazo').value, agenda_em: $('#pj-agenda').value }); avProjetoStaffDetalhe(id); } catch (e) { alert(e.message); }
  };
  $('#pj-msg-env').onclick = async () => {
    try { await api('POST', `/alta-vista/projetos/${id}/mensagens`, { texto: $('#pj-msg').value }); avProjetoStaffDetalhe(id); } catch (e) { alert(e.message); }
  };
  // ---- Onda 5: entregas/versões/materiais ----
  $('#en-criar').onclick = async () => {
    try { await api('POST', `/alta-vista/projetos/${id}/entregas`, { titulo: $('#en-titulo').value, tipo: $('#en-tipo').value }); avProjetoStaffDetalhe(id); } catch (e) { alert(e.message); }
  };
  document.querySelectorAll('.av-vs-subir').forEach((b) => {
    b.onclick = async () => {
      const inp = document.querySelector(`input[data-envio="${b.dataset.id}"]`);
      const prog = document.querySelector(`[data-prog="${b.dataset.id}"]`);
      const f = inp.files && inp.files[0];
      if (!f) return alert('Escolha o arquivo da versão.');
      b.disabled = true;
      try {
        const alvo = await api('POST', `/alta-vista/entregas/${b.dataset.id}/upload-url`, { mime: f.type, tamanho: f.size });
        await new Promise((res, rej) => {
          const x = new XMLHttpRequest();
          x.open('PUT', alvo.url);
          Object.entries(alvo.headers || {}).forEach(([k, v]) => x.setRequestHeader(k, v));
          x.upload.onprogress = (ev) => { if (ev.lengthComputable) prog.textContent = Math.round(ev.loaded / ev.total * 100) + '%'; };
          x.onload = () => (x.status < 300 ? res() : rej(new Error('Falha no envio (' + x.status + ')')));
          x.onerror = () => rej(new Error('Falha de conexão no envio.'));
          x.send(f);
        });
        await api('POST', `/alta-vista/entregas/${b.dataset.id}/versoes`, {
          upload_id: alvo.upload_id, nota: (document.querySelector(`input[data-nota="${b.dataset.id}"]`) || {}).value || '',
        });
        avProjetoStaffDetalhe(id);
      } catch (e) { alert(e.message); b.disabled = false; }
    };
  });
  document.querySelectorAll('.av-vs-ver').forEach((b) => {
    b.onclick = async () => {
      try { const r = await api('GET', `/alta-vista/versoes/${b.dataset.id}/ver`); window.open(r.url, '_blank'); } catch (e) { alert(e.message); }
    };
  });
  document.querySelectorAll('.av-vs-resp').forEach((b) => {
    b.onclick = async () => {
      const inp = document.querySelector(`input[data-vresp="${b.dataset.id}"]`);
      if (!inp || !inp.value.trim()) return;
      try { await api('POST', `/alta-vista/versoes/${b.dataset.id}/comentarios`, { texto: inp.value }); avProjetoStaffDetalhe(id); } catch (e) { alert(e.message); }
    };
  });
  document.querySelectorAll('.av-mat-ver-st').forEach((b) => {
    b.onclick = async () => {
      try { const r = await api('GET', `/alta-vista/materiais/${b.dataset.id}/ver`); window.open(r.url, '_blank'); } catch (e) { alert(e.message); }
    };
  });
  avProjetoParcelas(id, p);
  avProjetoChecklists(id);
}

async function avProjetoChecklists(id) {
  const alvo = $('#pj-checklists');
  try {
    const d = await api('GET', `/alta-vista/projetos/${id}/checklists`);
    alvo.innerHTML = `${d.checklists.map((c) => `<div style="padding:8px 0;border-bottom:1px solid #e5e5e5">
      <b>${esc(c.categoria)}</b>
      ${c.categoria === 'drone' ? (c.decisao
        ? ` <span class="pill${c.decisao === 'confirmado' ? ' ok' : ''}">voo ${esc(c.decisao)} por ${esc(c.decisao_quem)}</span>`
        : ` <button class="btn peq av-ckl-dec" data-id="${esc(c.id)}" data-d="confirmado">✅ Confirmar voo</button>
            <button class="btn secund peq av-ckl-dec" data-id="${esc(c.id)}" data-d="reagendado">🌧 Reagendar</button>`) : ''}
      ${c.itens.map((i) => `<label style="display:flex;gap:8px;align-items:flex-start;padding:3px 0;font-size:.88rem">
        <input type="checkbox" class="av-ckl-item" data-cl="${esc(c.id)}" data-item="${esc(i.id)}" ${i.feito ? 'checked' : ''} style="margin-top:3px">
        <span>${i.seguranca ? '🛡 ' : ''}${esc(i.texto)}${i.feito ? ` <small style="color:#166534">✓ ${esc(i.quem)}</small>` : ''}</span></label>`).join('')}
    </div>`).join('') || '<p class="sub">Nenhum checklist criado.</p>'}
    <div class="barra" style="margin-top:6px">
      ${d.templates.map((t2) => `<button class="btn secund peq av-ckl-novo" data-cat="${t2}">➕ ${t2}</button>`).join('')}
    </div>`;
    document.querySelectorAll('.av-ckl-novo').forEach((b) => {
      b.onclick = async () => { try { await api('POST', `/alta-vista/projetos/${id}/checklists`, { categoria: b.dataset.cat }); avProjetoChecklists(id); } catch (e) { alert(e.message); } };
    });
    document.querySelectorAll('.av-ckl-item').forEach((chk) => {
      chk.onchange = async () => {
        try { await api('POST', `/alta-vista/checklists/${chk.dataset.cl}/itens/${chk.dataset.item}`, { feito: chk.checked }); avProjetoChecklists(id); }
        catch (e) { alert(e.message); avProjetoChecklists(id); }
      };
    });
    document.querySelectorAll('.av-ckl-dec').forEach((b) => {
      b.onclick = async () => {
        try { await api('POST', `/alta-vista/checklists/${b.dataset.id}/decisao`, { decisao: b.dataset.d }); avProjetoChecklists(id); }
        catch (e) { alert(e.message); }
      };
    });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

async function avProjetoParcelas(id, projeto) {
  const alvo = $('#pj-parcelas');
  try {
    const d = await api('GET', `/alta-vista/projetos/${id}/parcelas`);
    if (!d.parcelas.length) {
      alvo.innerHTML = `<p class="sub">Sem cobrança gerada.${projeto.total_centavos ? '' : ' ⚠️ Projeto sem valor definido.'}</p>
        <div class="barra">
          <button class="btn peq" id="pj-cob-pres" ${projeto.total_centavos ? '' : 'disabled'}>Gerar cobrança (presencial)</button>
          <button class="btn secund peq" id="pj-cob-rem" ${projeto.total_centavos ? '' : 'disabled'}>Gerar (remoto — integral)</button>
        </div>`;
      const gerar = async (presencial) => {
        try {
          const r = await api('POST', `/alta-vista/projetos/${id}/cobranca`, { presencial });
          alert(`Cobrança gerada: ${r.parcelas.length} parcela(s) (${r.presencial ? 'presencial' : 'remoto'}). O cliente já vê no painel dele.`);
          avProjetoParcelas(id, projeto);
        } catch (e) { alert(e.message); }
      };
      $('#pj-cob-pres').onclick = () => gerar(true);
      $('#pj-cob-rem').onclick = () => gerar(false);
      return;
    }
    alvo.innerHTML = `<p class="sub">${d.saldo_centavos ? `Saldo em aberto: <b>${avBrl(d.saldo_centavos)}</b>` : '✅ Projeto quitado'} · pagamento on-line: ${d.pagamento_online ? 'ativo (Checkout Pro)' : '<b>manual</b> (sem MP_ACCESS_TOKEN)'}</p>`
      + tabela(['Parcela', 'Valor', 'Status', 'Pago', ''], d.parcelas.map((pa) => [
        esc(pa.rotulo), avBrl(pa.valor_centavos),
        `<span class="pill${pa.status === 'aprovado' ? ' ok' : ''}">${esc(pa.status)}</span>`,
        pa.pago_em ? `${avDia(pa.pago_em)}<br><small>${esc(pa.pago_via)}${pa.mp_payment_id ? ' · MP ' + esc(pa.mp_payment_id) : ''}</small>` : '—',
        pa.status === 'aprovado'
          ? `<button class="btn secund peq av-pa-reemb" data-id="${esc(pa.id)}">↩️ Reembolsar</button>`
          : `<button class="btn secund peq av-pa-manual" data-id="${esc(pa.id)}">✔️ Marcar pago (manual)</button>`,
      ]));
    document.querySelectorAll('.av-pa-manual').forEach((b) => {
      b.onclick = async () => {
        const just = prompt('Justificativa da conciliação manual (obrigatória — ex.: "Pix no C6 em 06/08"):');
        if (!just) return;
        try { await api('POST', `/alta-vista/parcelas/${b.dataset.id}/marcar-pago`, { justificativa: just }); avProjetoStaffDetalhe(id); } catch (e) { alert(e.message); }
      };
    });
    document.querySelectorAll('.av-pa-reemb').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('REEMBOLSAR esta parcela? A ação estorna no Mercado Pago (quando pago on-line) e fica auditada.')) return;
        try { await api('POST', `/alta-vista/parcelas/${b.dataset.id}/reembolsar`, { confirmar: true }); avProjetoStaffDetalhe(id); } catch (e) { alert(e.message); }
      };
    });
  } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
}

// ---------------- financeiro (Onda 4) ----------------
async function avFinanceiro(cx) {
  const d = await api('GET', '/alta-vista/financeiro');
  cx.innerHTML = `<p class="sub">${esc(d.aviso)} Pagamento on-line: ${d.pagamento_online ? 'ativo' : '<b>manual</b> (sem MP_ACCESS_TOKEN)'}.</p>
    <div class="cards">
      ${avCard('Recebido', avBrl(d.recebido_centavos), 'parcelas aprovadas')}
      ${avCard('A receber', avBrl(d.a_receber_centavos), 'pendentes + aguardando')}
      ${avCard('Despesas', avBrl(d.despesas_centavos), 'lançadas manualmente')}
      ${avCard('Margem', avBrl(d.margem_centavos), 'recebido − reembolsos − despesas')}
      ${avCard('Reembolsado', avBrl(d.reembolsado_centavos), d.contestado_centavos ? `⚠️ ${avBrl(d.contestado_centavos)} contestado` : 'sem contestação')}
    </div>
    <div class="barra" style="margin-top:12px"><a class="btn secund" href="/staff/api/alta-vista/financeiro.csv" download="financeiro-alta-vista.csv">⬇️ Exportar parcelas (CSV)</a></div>
    <h3 class="titulo-sec" style="margin-top:14px">Por projeto</h3>
    ${d.por_projeto.length ? tabela(['Projeto', 'Recebido', 'Em aberto', 'Despesas', 'Margem'], d.por_projeto.map((p) => [
      esc(p.titulo), avBrl(p.recebido), avBrl(p.em_aberto), avBrl(p.despesas),
      `<b style="color:${p.margem >= 0 ? '#166534' : '#B42318'}">${avBrl(p.margem)}</b>`,
    ])) : '<p class="vazio">Nenhum movimento ainda — os números aparecem quando houver cobrança gerada. Nada aqui é inventado.</p>'}
    <h3 class="titulo-sec" style="margin-top:14px">Despesas</h3>
    ${d.despesas.length ? tabela(['Data', 'Categoria', 'Descrição', 'Valor', ''], d.despesas.map((x) => [
      avDia(x.data), esc(x.categoria), esc(x.descricao), avBrl(x.valor_centavos),
      `<button class="btn secund peq av-desp-rm" data-id="${esc(x.id)}">🗑️</button>`,
    ])) : '<p class="sub">Nenhuma despesa lançada.</p>'}
    <div class="barra" style="margin-top:8px">
      <input id="dp-desc" placeholder="descrição" style="flex:1;min-width:180px">
      <select id="dp-cat">${['equipamento', 'deslocamento', 'software', 'terceiros', 'outros'].map((c) => `<option>${c}</option>`).join('')}</select>
      <input id="dp-valor" type="number" min="0" step="0.01" placeholder="valor R$" style="width:110px">
      <input id="dp-data" type="date" style="width:auto">
      <button class="btn secund peq" id="dp-add">➕ Lançar</button>
    </div>`;
  $('#dp-add').onclick = async () => {
    try {
      await api('POST', '/alta-vista/despesas', {
        descricao: $('#dp-desc').value, categoria: $('#dp-cat').value,
        valor_centavos: Math.round(Number($('#dp-valor').value || 0) * 100), data: $('#dp-data').value,
      });
      avFinanceiro(cx);
    } catch (e) { alert(e.message); }
  };
  document.querySelectorAll('.av-desp-rm').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Remover esta despesa?')) return;
      try { await api('DELETE', `/alta-vista/despesas/${b.dataset.id}`); avFinanceiro(cx); } catch (e) { alert(e.message); }
    };
  });
}

// ---------------- quadro de produção (Onda 7) ----------------
const AV_COLUNAS_QUADRO = [
  ['awaiting_payment', 'briefing_pending'], ['scheduling'], ['production'],
  ['quality_control', 'client_review', 'changes_requested'], ['approved', 'delivered', 'portfolio_consent'], ['completed'],
];
async function avOperacao(cx) {
  const d = await api('GET', '/alta-vista/operacao');
  const cap = d.capacidade;
  const cartao = (p) => `<div style="background:#fff;border:1px solid ${p.atrasado ? '#B42318' : '#e5e5e5'};border-radius:8px;padding:8px 10px;margin-bottom:8px">
    <b style="font-size:.85rem">${esc(p.titulo)}</b><br>
    <small>${p.cliente ? esc(p.cliente.nome) : '—'}${p.responsavel ? ' · ' + esc(p.responsavel) : ''}</small><br>
    <small>${p.agenda_em ? '📅 ' + esc(p.agenda_em).replace('T', ' ') : ''}${p.prazo_em ? ` · ⏱ ${avDia(p.prazo_em)}${p.atrasado ? ' <b style="color:#B42318">ATRASADO</b>' : ''}` : ''}</small><br>
    <button class="btn secund peq av-q-abrir" data-id="${esc(p.id)}" style="margin-top:4px;padding:2px 8px">🔎</button>
  </div>`;
  cx.innerHTML = `<p class="sub">${cap.agenda_cheia ? '🔴' : '🟢'} Capacidade: <b>${cap.ativos}/${cap.limite}</b> projeto(s) ativos — ${esc(cap.recomendacao)}</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;align-items:start">
      ${AV_COLUNAS_QUADRO.map((grupo) => `<div style="background:#f4f4f2;border-radius:10px;padding:10px">
        <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">
          ${grupo.map((st) => esc(d.status_rotulos[st] || st)).join(' / ')}</div>
        ${d.projetos.filter((p) => grupo.includes(p.status)).map(cartao).join('') || '<small style="color:#999">vazio</small>'}
      </div>`).join('')}
    </div>
    <div id="av-lead-detalhe"></div><div id="av-pj-detalhe"></div>`;
  document.querySelectorAll('.av-q-abrir').forEach((b) => { b.onclick = () => avProjetoStaffDetalhe(b.dataset.id); });
}

// ---------------- lançamento: portão de prontidão + campanha 90 dias (Onda 7) ----------------
async function avLancamento(cx) {
  const [pr, camp] = await Promise.all([api('GET', '/alta-vista/prontidao'), api('GET', '/alta-vista/campanha')]);
  cx.innerHTML = `
    <div class="caixa">
      <h3 class="titulo-sec">🚦 Portão de prontidão para mídia paga</h3>
      <p class="sub">${pr.divulgacao_liberada ? '🟢 <b>DIVULGAÇÃO LIBERADA</b> — mídia paga pode rodar.'
      : pr.apto ? '🟡 Todos os itens OK — falta você liberar formalmente.' : '🔴 Divulgação BLOQUEADA — enquanto houver pendência, só orgânico controlado.'}
      ${pr.capacidade.agenda_cheia ? ' · ⚠️ Agenda cheia: mesmo liberada, PAUSE a aquisição.' : ''}</p>
      ${pr.itens.map((i) => `<label style="display:flex;gap:10px;align-items:flex-start;padding:6px 0;border-bottom:1px solid #eee;font-size:.9rem">
        <input type="checkbox" class="av-pr-item" data-chave="${esc(i.chave)}" ${i.feito ? 'checked' : ''} style="margin-top:3px">
        <span>${esc(i.texto)}${i.feito ? `<br><small style="color:#166534">✓ ${esc(i.quem)} · ${avDia(i.em)}${i.nota ? ' — ' + esc(i.nota) : ''}</small>` : ''}</span>
      </label>`).join('')}
      <div class="barra" style="margin-top:10px">
        ${!pr.divulgacao_liberada ? `<button class="btn" id="av-pr-liberar" ${pr.apto ? '' : 'disabled'}>🚀 Liberar divulgação paga</button>` : ''}
      </div>
    </div>
    <div class="caixa" style="margin-top:14px">
      <h3 class="titulo-sec">📣 Campanha "${esc(camp.campanha.nome)}"</h3>
      <p class="sub">"${esc(camp.campanha.mensagem)}" · CTA: "${esc(camp.campanha.cta)}"</p>
      ${camp.campanha.fases.map((f) => `<p style="margin:3px 0"><small>· ${esc(f)}</small></p>`).join('')}
      <p style="margin-top:10px">Mês ${esc(camp.mes)}: gasto <b>${avBrl(camp.gasto_mes_centavos)}</b> de ${avBrl(camp.campanha.orcamento_mensal_max_centavos)} máx.
        ${camp.estourou_teto ? ' <b style="color:#B42318">⚠️ TETO ESTOURADO</b>' : ''}
        · ${camp.leads_mes} lead(s) · ${camp.ganhos_mes} ganho(s)${camp.custo_por_lead_centavos ? ' · ' + avBrl(camp.custo_por_lead_centavos) + '/lead' : ''}</p>
      ${camp.lancamentos.length ? tabela(['Data', 'Canal', 'Valor', 'Nota', ''], camp.lancamentos.map((c) => [
        avDia(c.data), esc(c.canal), avBrl(c.valor_centavos), esc(c.nota || '—'),
        `<button class="btn secund peq av-ck-rm" data-id="${esc(c.id)}">🗑️</button>`,
      ])) : '<p class="sub">Nenhum custo lançado — os números só existem quando você gastar de verdade.</p>'}
      <div class="barra" style="margin-top:8px">
        <input id="ck-data" type="date" style="width:auto">
        <select id="ck-canal">${['google', 'meta', 'testes', 'outro'].map((c) => `<option>${c}</option>`).join('')}</select>
        <input id="ck-valor" type="number" min="0" step="0.01" placeholder="valor R$" style="width:110px">
        <input id="ck-nota" placeholder="nota (ex.: semana 5, pesquisa)" style="flex:1;min-width:150px">
        <button class="btn secund peq" id="ck-add">➕ Lançar custo</button>
      </div>
    </div>`;
  document.querySelectorAll('.av-pr-item').forEach((chk) => {
    chk.onchange = async () => {
      let nota = '';
      if (chk.checked) nota = prompt('Nota/evidência (opcional — ex.: "pagamento teste MP em 06/08"):') || '';
      try { await api('POST', `/alta-vista/prontidao/${chk.dataset.chave}`, { feito: chk.checked, nota }); avLancamento(cx); }
      catch (e) { alert(e.message); avLancamento(cx); }
    };
  });
  const lib = $('#av-pr-liberar');
  if (lib) lib.onclick = async () => {
    if (!confirm('Liberar formalmente a divulgação paga? Isto fica auditado com seu nome.')) return;
    try { await api('POST', '/alta-vista/prontidao-liberar', {}); avLancamento(cx); } catch (e) { alert(e.message); }
  };
  $('#ck-add').onclick = async () => {
    try {
      await api('POST', '/alta-vista/campanha/custos', { data: $('#ck-data').value, canal: $('#ck-canal').value, valor_centavos: Math.round(Number($('#ck-valor').value || 0) * 100), nota: $('#ck-nota').value });
      avLancamento(cx);
    } catch (e) { alert(e.message); }
  };
  document.querySelectorAll('.av-ck-rm').forEach((b) => {
    b.onclick = async () => { if (!confirm('Remover este custo?')) return; try { await api('DELETE', `/alta-vista/campanha/custos/${b.dataset.id}`); avLancamento(cx); } catch (e) { alert(e.message); } };
  });
}

// ---------------- relatórios (Onda 7) ----------------
async function avRelatorios(cx) {
  const d = await api('GET', '/alta-vista/relatorios');
  cx.innerHTML = `<p class="sub">${esc(d.aviso)}</p>
    <div class="cards">
      ${avCard('Entregues', d.entregues_total, d.tempo_medio_entrega_dias != null ? `tempo médio ${d.tempo_medio_entrega_dias} dia(s)` : 'sem entrega concluída ainda')}
      ${avCard('Atrasos', d.atrasados_em_aberto, `${d.entregues_com_atraso} entregue(s) fora do prazo`)}
      ${avCard('Ticket médio', d.propostas_aceitas ? avBrl(d.ticket_medio_centavos) : '—', `${d.propostas_aceitas} proposta(s) aceita(s)`)}
      ${avCard('Versões/entrega', d.media_versoes_por_entrega != null ? d.media_versoes_por_entrega : '—', 'quanto menor, menos retrabalho')}
      ${avCard('Clientes recorrentes', d.clientes_recorrentes, 'com mais de um projeto')}
      ${avCard('Views de tours', d.tours_views_total, 'todas as visualizações públicas')}
    </div>
    <p class="sub" style="margin-top:10px">${d.capacidade.agenda_cheia ? '🔴' : '🟢'} ${esc(d.capacidade.recomendacao)}</p>
    <h3 class="titulo-sec" style="margin-top:12px">Conversão por origem</h3>
    ${tabela(['Origem', 'Leads', 'Ganhos', 'Conversão'], d.conversao_por_origem.map((o) => [
      esc(o.origem), o.total, o.ganhos, o.total ? Math.round(o.ganhos / o.total * 100) + '%' : '—',
    ]))}`;
}

// ---------------- tours 360° (Onda 6) ----------------
async function avTours(cx) {
  const d = await api('GET', '/alta-vista/tours');
  cx.innerHTML = `${d.tours.length ? tabela(['Tour', 'Cliente', 'Cenas', 'Views', 'Status', 'Visibilidade', 'Validade', ''], d.tours.map((t) => [
    `<b>${esc(t.titulo)}</b><br><small>/t/${esc(t.slug)}</small>`,
    t.cliente ? esc(t.cliente.nome) : '—',
    t.cenas_total, t.views_total,
    `<span class="pill${t.status === 'publicado' ? ' ok' : ''}">${esc(t.status)}</span>`,
    esc(t.visibilidade),
    t.expira_em ? avDia(t.expira_em) : '—',
    `<button class="btn secund peq av-tour-abrir" data-id="${esc(t.id)}">✏️ Editar</button>`,
  ])) : '<p class="vazio">Nenhum tour ainda.</p>'}
  <div class="barra" style="margin-top:10px">
    <input id="tr-titulo" placeholder="título do tour (ex.: Casa do Lago — Tour 360°)" style="flex:1;min-width:220px">
    <input id="tr-projeto" placeholder="id do projeto (vincula cliente e cobrança)" style="min-width:200px">
    <button class="btn" id="tr-criar">➕ Criar tour</button>
  </div>
  <p class="sub">Dica: crie a partir do projeto (🎬 Projetos → copie o id da URL da API) para a renovação cobrar no lugar certo.</p>
  <div id="av-tour-editor"></div>`;
  $('#tr-criar').onclick = async () => {
    try {
      const r = await api('POST', '/alta-vista/tours', { titulo: $('#tr-titulo').value, projeto_id: $('#tr-projeto').value });
      avTours(cx); setTimeout(() => avTourEditor(r.tour.id), 100);
    } catch (e) { alert(e.message); }
  };
  document.querySelectorAll('.av-tour-abrir').forEach((b) => { b.onclick = () => avTourEditor(b.dataset.id); });
}

async function avTourEditor(id) {
  const alvo = $('#av-tour-editor');
  alvo.innerHTML = '<p class="vazio">Carregando…</p>';
  const d = await api('GET', `/alta-vista/tours/${id}`);
  const t = d.tour;
  alvo.innerHTML = `<div class="caixa" style="margin-top:16px">
    <h3 class="titulo-sec">🌐 ${esc(t.titulo)} <span class="pill${t.status === 'publicado' ? ' ok' : ''}">${esc(t.status)}</span></h3>
    ${d.problemas.length ? `<p class="erro">⚠ ${d.problemas.map(esc).join('<br>⚠ ')}</p>` : '<p class="sub">✔ Sem problemas de validação.</p>'}
    <div class="barra">
      <a class="btn secund peq" href="${esc(d.preview_url)}" target="_blank" rel="noopener">👁 Prévia</a>
      <a class="btn secund peq" href="${esc(d.editor_url)}" target="_blank" rel="noopener">🎯 Prévia c/ editor visual</a>
      ${t.status === 'publicado' ? `<a class="btn secund peq" href="${esc(d.url)}" target="_blank" rel="noopener">🌐 Ver publicado</a>
        <button class="btn secund peq" id="tr-despub">🙈 Despublicar</button>` : '<button class="btn peq" id="tr-pub">🚀 Publicar</button>'}
      <button class="btn secund peq" id="tr-dup">📄 Duplicar</button>
      <a class="btn secund peq" href="/staff/api/alta-vista/tours/${esc(t.id)}/qr" target="_blank" rel="noopener">🔳 QR</a>
    </div>
    <p class="sub">Views: ${d.stats.total} · Embed: <code style="font-size:.7rem">&lt;iframe src="${esc(d.url)}" …&gt;</code></p>
    <div class="linha-2col">
      <label>Título<input id="tr-e-titulo" value="${esc(t.titulo)}"></label>
      <label>Marca do cliente (nome exibido)<input id="tr-e-marca" value="${esc(t.marca_nome)}"></label>
      <label>Cor da marca<input id="tr-e-cor" type="color" value="${esc(t.marca_cor)}"></label>
      <label>Link de reserva/contato do cliente<input id="tr-e-cta" value="${esc(t.contato_url)}" placeholder="https://…"></label>
      <label>Visibilidade<select id="tr-e-vis">${['publico', 'nao_listado', 'senha'].map((v) => `<option value="${v}"${t.visibilidade === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Senha (só se visibilidade=senha)<input id="tr-e-senha" placeholder="deixe vazio p/ manter"></label>
      <label>Cena inicial<select id="tr-e-inicial"><option value="">1ª da ordem</option>${t.cenas.map((c) => `<option value="${esc(c.id)}"${t.cena_inicial === c.id ? ' selected' : ''}>${esc(c.titulo)}</option>`).join('')}</select></label>
      <label>Validade (hospedagem)<input id="tr-e-exp" type="date" value="${esc(t.expira_em)}"></label>
    </div>
    <div class="barra"><button class="btn secund peq" id="tr-salvar">💾 Salvar configurações</button></div>

    <h4 class="titulo-sec" style="margin-top:14px">Cenas (a ordem é o roteiro da visita)</h4>
    ${t.cenas.map((c) => `<div style="padding:8px 0;border-bottom:1px solid #e5e5e5">
      <b>${esc(c.titulo)}</b> <small>ordem ${c.ordem} · vista ${c.yaw}°/${c.pitch}°/fov ${c.fov}${c.hub ? ' · HUB' : ''}</small>
      <button class="btn secund peq av-cn-ver" data-id="${esc(c.id)}">👁</button>
      <button class="btn secund peq av-cn-rm" data-id="${esc(c.id)}">🗑️</button>
      <div class="barra" style="margin-top:4px">
        <input data-cn-titulo="${esc(c.id)}" value="${esc(c.titulo)}" style="min-width:140px">
        <input data-cn-ordem="${esc(c.id)}" type="number" value="${c.ordem}" style="width:70px" title="ordem">
        <input data-cn-yaw="${esc(c.id)}" type="number" value="${c.yaw}" style="width:70px" title="yaw">
        <input data-cn-pitch="${esc(c.id)}" type="number" value="${c.pitch}" style="width:70px" title="pitch">
        <input data-cn-fov="${esc(c.id)}" type="number" value="${c.fov}" style="width:70px" title="fov">
        <label style="margin:0"><input type="checkbox" data-cn-hub="${esc(c.id)}" ${c.hub ? 'checked' : ''}> hub</label>
        <button class="btn secund peq av-cn-salvar" data-id="${esc(c.id)}">💾</button>
      </div>
      ${c.hotspots.map((h) => `<small style="margin-left:12px">📍 ${esc(h.tipo)} ${h.yaw}°/${h.pitch}° ${esc(h.texto || '')} ${h.destino_cena_id ? '→ ' + esc((t.cenas.find((x) => x.id === h.destino_cena_id) || {}).titulo || '??') : ''}
        <button class="btn secund peq av-hs-rm" data-id="${esc(h.id)}" style="padding:1px 7px">✕</button></small><br>`).join('')}
      <div class="barra" style="margin-top:2px">
        <input data-hs-yaw="${esc(c.id)}" type="number" placeholder="yaw" style="width:70px">
        <input data-hs-pitch="${esc(c.id)}" type="number" placeholder="pitch" style="width:70px">
        <select data-hs-tipo="${esc(c.id)}" style="width:auto"><option value="cena">→ cena</option><option value="info">ℹ info</option></select>
        <select data-hs-dest="${esc(c.id)}" style="min-width:130px"><option value="">destino…</option>${t.cenas.filter((x) => x.id !== c.id).map((x) => `<option value="${esc(x.id)}">${esc(x.titulo)}</option>`).join('')}</select>
        <input data-hs-texto="${esc(c.id)}" placeholder="texto" style="min-width:120px">
        <button class="btn secund peq av-hs-add" data-id="${esc(c.id)}">➕ hotspot</button>
      </div>
    </div>`).join('') || '<p class="sub">Nenhuma cena ainda.</p>'}
    <div class="barra" style="margin-top:8px">
      <input type="file" id="cn-file" accept="image/jpeg,image/png,image/webp" style="max-width:230px">
      <input id="cn-titulo" placeholder="título da cena (ex.: Sala)" style="min-width:160px">
      <button class="btn secund peq" id="cn-subir">⬆ Adicionar cena</button>
      <span id="cn-prog" class="sub"></span>
    </div>
    <details style="margin-top:10px"><summary style="cursor:pointer;font-weight:700">🎯 Importar hotspots do editor visual</summary>
      <p class="sub">Abra a "Prévia c/ editor visual", clique nas portas, use "Exportar tudo" e cole o JSON aqui (substitui os hotspots das cenas presentes no JSON):</p>
      <textarea id="hs-json" rows="4" style="width:100%"></textarea>
      <div class="barra"><button class="btn secund peq" id="hs-importar">Importar</button></div>
    </details>
  </div>`;

  const recarregar = () => avTourEditor(id);
  const pub = $('#tr-pub'); if (pub) pub.onclick = async () => { try { await api('POST', `/alta-vista/tours/${id}/publicar`, {}); recarregar(); } catch (e) { alert(e.message); } };
  const desp = $('#tr-despub'); if (desp) desp.onclick = async () => { try { await api('POST', `/alta-vista/tours/${id}/despublicar`, {}); recarregar(); } catch (e) { alert(e.message); } };
  $('#tr-dup').onclick = async () => { try { const r = await api('POST', `/alta-vista/tours/${id}/duplicar`, {}); alert('Duplicado: ' + r.tour.slug); avTourEditor(r.tour.id); } catch (e) { alert(e.message); } };
  $('#tr-salvar').onclick = async () => {
    try {
      await api('PATCH', `/alta-vista/tours/${id}`, {
        titulo: $('#tr-e-titulo').value, marca_nome: $('#tr-e-marca').value, marca_cor: $('#tr-e-cor').value,
        contato_url: $('#tr-e-cta').value, visibilidade: $('#tr-e-vis').value,
        senha: $('#tr-e-senha').value || undefined, cena_inicial: $('#tr-e-inicial').value, expira_em: $('#tr-e-exp').value,
      });
      recarregar();
    } catch (e) { alert(e.message); }
  };
  $('#cn-subir').onclick = async () => {
    const f = $('#cn-file').files && $('#cn-file').files[0];
    if (!f) return alert('Escolha o panorama (JPG equiretangular 2:1).');
    try {
      const alvo2 = await api('POST', `/alta-vista/tours/${id}/cenas/upload-url`, { mime: f.type, tamanho: f.size });
      await new Promise((res, rej) => {
        const x = new XMLHttpRequest(); x.open('PUT', alvo2.url);
        Object.entries(alvo2.headers || {}).forEach(([k, v]) => x.setRequestHeader(k, v));
        x.upload.onprogress = (ev) => { if (ev.lengthComputable) $('#cn-prog').textContent = Math.round(ev.loaded / ev.total * 100) + '%'; };
        x.onload = () => (x.status < 300 ? res() : rej(new Error('Falha no envio (' + x.status + ')')));
        x.onerror = () => rej(new Error('Falha de conexão.'));
        x.send(f);
      });
      await api('POST', `/alta-vista/tours/${id}/cenas`, { upload_id: alvo2.upload_id, titulo: $('#cn-titulo').value });
      recarregar();
    } catch (e) { alert(e.message); }
  };
  document.querySelectorAll('.av-cn-salvar').forEach((b) => {
    b.onclick = async () => {
      const cid = b.dataset.id;
      const v = (sel) => document.querySelector(`[data-cn-${sel}="${cid}"]`);
      try {
        await api('PATCH', `/alta-vista/tours/cenas/${cid}`, {
          titulo: v('titulo').value, ordem: Number(v('ordem').value), yaw: Number(v('yaw').value),
          pitch: Number(v('pitch').value), fov: Number(v('fov').value), hub: v('hub').checked,
        });
        recarregar();
      } catch (e) { alert(e.message); }
    };
  });
  document.querySelectorAll('.av-cn-ver').forEach((b) => {
    b.onclick = async () => { try { const r = await api('GET', `/alta-vista/tours/cenas/${b.dataset.id}/ver`); window.open(r.url, '_blank'); } catch (e) { alert(e.message); } };
  });
  document.querySelectorAll('.av-cn-rm').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Remover esta cena (e os hotspots que apontam para ela)?')) return;
      try { await api('DELETE', `/alta-vista/tours/cenas/${b.dataset.id}`); recarregar(); } catch (e) { alert(e.message); }
    };
  });
  document.querySelectorAll('.av-hs-add').forEach((b) => {
    b.onclick = async () => {
      const cid = b.dataset.id;
      const v = (sel) => document.querySelector(`[data-hs-${sel}="${cid}"]`);
      try {
        await api('POST', `/alta-vista/tours/cenas/${cid}/hotspots`, {
          yaw: Number(v('yaw').value || 0), pitch: Number(v('pitch').value || 0),
          tipo: v('tipo').value, destino_cena_id: v('dest').value, texto: v('texto').value,
        });
        recarregar();
      } catch (e) { alert(e.message); }
    };
  });
  document.querySelectorAll('.av-hs-rm').forEach((b) => {
    b.onclick = async () => { try { await api('DELETE', `/alta-vista/tours/hotspots/${b.dataset.id}`); recarregar(); } catch (e) { alert(e.message); } };
  });
  $('#hs-importar').onclick = async () => {
    try {
      const dados = JSON.parse($('#hs-json').value);
      const r = await api('POST', `/alta-vista/tours/${id}/hotspots/importar`, { dados });
      alert(r.aplicados + ' hotspot(s) importado(s).');
      recarregar();
    } catch (e) { alert('JSON inválido ou erro: ' + e.message); }
  };
}

// ---------------- clientes (Onda 3) ----------------
async function avClientes(cx) {
  const d = await api('GET', '/alta-vista/clientes');
  if (!d.clientes.length) { cx.innerHTML = '<p class="vazio">Nenhum cliente ainda. Contas nascem no site (criar conta) ou ao virar proposta aceita em projeto.</p>'; return; }
  cx.innerHTML = tabela(['Desde', 'Nome', 'E-mail', 'WhatsApp', 'Status', ''], d.clientes.map((c) => [
    avDia(c.criado_em), `<b>${esc(c.nome)}</b>`, esc(c.email), esc(c.whatsapp || '—'), esc(c.status),
    `<button class="btn secund peq av-cl-convite" data-id="${esc(c.id)}">✉️ (Re)enviar convite</button>`,
  ]));
  document.querySelectorAll('.av-cl-convite').forEach((b) => {
    b.onclick = async () => {
      try { const r = await api('POST', `/alta-vista/clientes/${b.dataset.id}/convite`, {}); alert(r.email_enviado ? 'Convite enviado.' : 'E-mail indisponível — configure GMAIL_USER/GMAIL_APP_PASS.'); }
      catch (e) { alert(e.message); }
    };
  });
}

// ---------------- propostas (visão geral) ----------------
async function avPropostas(cx) {
  const d = await api('GET', '/alta-vista/propostas');
  if (!d.propostas.length) { cx.innerHTML = '<p class="vazio">Nenhuma proposta ainda. Crie a partir de um lead (📩 Leads → 🔎 Abrir → Nova proposta).</p>'; return; }
  cx.innerHTML = tabela(['Criada', 'Itens', 'Subtotal', 'Desc.', 'Total', 'Status', 'Aceite', 'Link', ''], d.propostas.map((p) => [
    avDia(p.criado_em),
    `<small>${p.itens.map((i) => esc(i.nome)).join(' + ')}</small>`,
    avBrl(p.subtotal_centavos),
    p.desconto_pct ? p.desconto_pct + '%' : '—',
    `<b>${avBrl(p.total_centavos)}</b>`,
    `<span class="pill${p.status === 'aceita' ? ' ok' : ''}">${esc(p.status)}</span>`,
    p.aceite ? `<small>${esc(p.aceite.nome)}<br>${avDia(p.aceite.em)} · termos ${esc(p.aceite.termos_versao)}</small>` : '—',
    `<a href="/alta-vista/proposta/${esc(p.token)}" target="_blank" rel="noopener">abrir ↗</a>`,
    p.status === 'enviada' ? `<button class="btn secund peq av-pp-rec" data-id="${esc(p.id)}">Marcar recusada</button>`
      : p.status === 'aceita' ? `<button class="btn peq av-pp-projeto" data-id="${esc(p.id)}">🎬 Virar projeto</button>` : '',
  ]));
  document.querySelectorAll('.av-pp-rec').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Marcar esta proposta como recusada?')) return;
      try { await api('POST', `/alta-vista/propostas/${b.dataset.id}/status`, { status: 'recusada' }); avPropostas(cx); } catch (e) { alert(e.message); }
    };
  });
  document.querySelectorAll('.av-pp-projeto').forEach((b) => {
    b.onclick = async () => {
      try {
        const r = await api('POST', `/alta-vista/projetos/de-proposta/${b.dataset.id}`, {});
        alert(`Projeto criado para ${r.cliente.nome}.${r.cliente_novo ? '\nConta nova criada' : '\nCliente já tinha conta'}${r.convite_enviado ? ' e convite enviado por e-mail.' : '.'}`);
        AV_VISAO = 'projetos'; avCorpo();
      } catch (e) { alert(e.message); }
    };
  });
}

// ---------------- serviços & preços ----------------
async function avPrecos(cx) {
  const d = await api('GET', '/alta-vista/catalogo');
  const linhaSv = (sv) => [
    `<b>${esc(sv.nome)}</b><br><small>${esc(sv.slug)} · ${esc(sv.categoria)}</small>`,
    `<small>${esc(sv.entrega)}</small>`,
    esc(sv.prazo || '—'),
    `<input type="number" style="width:110px" min="0" step="1" value="${(sv.preco_centavos / 100).toFixed(2)}" data-sv="${esc(sv.id)}" class="av-preco-sv" aria-label="Preço de ${esc(sv.nome)} em reais">`,
    `<label><input type="checkbox" data-sv-ativo="${esc(sv.id)}" ${sv.ativo ? 'checked' : ''}> ativo</label>`,
  ];
  const linhaCb = (cb) => [
    `<b>${esc(cb.nome)}</b>${cb.destaque ? ' ⭐' : ''}<br><small>${esc(cb.slug)}</small>`,
    `<small>${esc((cb.itens || []).join(' · '))}</small>`,
    cb.preco_apartir ? 'a partir de' : 'fechado',
    `<input type="number" style="width:110px" min="0" step="1" value="${(cb.preco_centavos / 100).toFixed(2)}" data-cb="${esc(cb.id)}" class="av-preco-cb" aria-label="Preço de ${esc(cb.nome)} em reais">`,
    `<label><input type="checkbox" data-cb-ativo="${esc(cb.id)}" ${cb.ativo ? 'checked' : ''}> ativo</label>`,
  ];
  cx.innerHTML = `<p class="sub">Preço em REAIS (o sistema guarda em centavos). A mudança vale na hora no site público.</p>
    <h3 class="titulo-sec">Serviços</h3>${tabela(['Serviço', 'Entrega', 'Prazo', 'Preço (R$)', 'Situação'], d.servicos.map(linhaSv))}
    <h3 class="titulo-sec" style="margin-top:18px">Pacotes</h3>${tabela(['Pacote', 'Inclui', 'Tipo', 'Preço (R$)', 'Situação'], d.combos.map(linhaCb))}
    <div class="barra"><button class="btn" id="av-salvar-precos">💾 Salvar alterações de preço</button></div>`;
  $('#av-salvar-precos').onclick = async () => {
    const mudancas = [];
    document.querySelectorAll('.av-preco-sv').forEach((i) => mudancas.push(api('PATCH', `/alta-vista/servicos/${i.dataset.sv}`, { preco_centavos: Math.round(Number(i.value || 0) * 100) })));
    document.querySelectorAll('[data-sv-ativo]').forEach((i) => mudancas.push(api('PATCH', `/alta-vista/servicos/${i.dataset.svAtivo}`, { ativo: i.checked })));
    document.querySelectorAll('.av-preco-cb').forEach((i) => mudancas.push(api('PATCH', `/alta-vista/combos/${i.dataset.cb}`, { preco_centavos: Math.round(Number(i.value || 0) * 100) })));
    document.querySelectorAll('[data-cb-ativo]').forEach((i) => mudancas.push(api('PATCH', `/alta-vista/combos/${i.dataset.cbAtivo}`, { ativo: i.checked })));
    try { await Promise.all(mudancas); alert('Preços salvos.'); avPrecos($('#av-corpo')); } catch (e) { alert(e.message); }
  };
}

// ---------------- portfólio ----------------
async function avPortfolio(cx) {
  const d = await api('GET', '/alta-vista/portfolio');
  cx.innerHTML = `<p class="sub">Projeto conceitual exibe SEMPRE o aviso obrigatório no site. Para virar caso real é preciso registrar o consentimento do cliente (quem autorizou, quando e o escopo).</p>
    ${tabela(['Ordem', 'Projeto', 'Tipo', 'Natureza', 'Publicado', 'Ações'], d.itens.map((p) => [
      p.ordem,
      `<b>${esc(p.titulo)}</b><br><small><a href="/alta-vista/portfolio/${esc(p.slug)}" target="_blank" rel="noopener">/${esc(p.slug)}</a></small>`,
      esc(p.tipo_imovel || '—'),
      p.conceitual ? '<span class="pill">conceitual</span>' : '<span class="pill ok">caso real autorizado</span>',
      p.publicado ? 'sim' : 'não',
      `<button class="btn secund peq av-pf-editar" data-id="${esc(p.id)}">✏️ Editar</button>
       <button class="btn secund peq av-pf-pub" data-id="${esc(p.id)}" data-pub="${p.publicado ? 0 : 1}">${p.publicado ? '🙈 Ocultar' : '👁️ Publicar'}</button>`,
    ]))}
    <div class="barra"><button class="btn" id="av-pf-novo">➕ Novo projeto</button></div>
    <div id="av-pf-form"></div>`;
  const abrirForm = (p) => {
    $('#av-pf-form').innerHTML = `<div class="caixa" style="margin-top:14px">
      <h3 class="titulo-sec">${p ? 'Editar' : 'Novo'} projeto</h3>
      <div class="linha-2col">
        <label>Título<input id="pf-titulo" value="${esc(p ? p.titulo : '')}"></label>
        <label>Tipo de imóvel<input id="pf-tipo" value="${esc(p ? p.tipo_imovel : '')}"></label>
      </div>
      <label>Resumo (aparece no card)<input id="pf-resumo" value="${esc(p ? p.resumo : '')}"></label>
      <label>Descrição completa<textarea id="pf-corpo" rows="5">${esc(p ? p.corpo : '')}</textarea></label>
      <div class="linha-2col">
        <label>Serviços demonstrados (slugs, separados por vírgula)<input id="pf-servicos" value="${esc(p ? (p.servicos || []).join(', ') : '')}"></label>
        <label>URL da capa (opcional)<input id="pf-capa" value="${esc(p ? p.capa_url : '')}"></label>
      </div>
      <label><input type="checkbox" id="pf-conceitual" ${!p || p.conceitual ? 'checked' : ''}> Projeto CONCEITUAL (demonstração — exibe o aviso obrigatório)</label>
      <div id="pf-consent" style="${!p || p.conceitual ? 'display:none' : ''}">
        <p class="sub">Caso real: registre o consentimento (obrigatório).</p>
        <div class="linha-2col">
          <label>Autorizado por<input id="pf-c-quem" value="${esc(p && p.consentimento ? p.consentimento.autorizado_por : '')}"></label>
          <label>Data<input id="pf-c-data" type="date" value="${esc(p && p.consentimento ? p.consentimento.data : '')}"></label>
        </div>
        <label>Escopo autorizado<input id="pf-c-escopo" value="${esc(p && p.consentimento ? p.consentimento.escopo : '')}" placeholder="ex.: fotos e tour no portfólio do site, sem endereço"></label>
      </div>
      <div class="barra"><button class="btn" id="pf-salvar">💾 Salvar</button>
        ${p ? `<button class="btn secund" id="pf-excluir">🗑️ Excluir</button>` : ''}</div>
    </div>`;
    $('#pf-conceitual').onchange = () => { $('#pf-consent').style.display = $('#pf-conceitual').checked ? 'none' : ''; };
    $('#pf-salvar').onclick = async () => {
      const corpo = {
        id: p ? p.id : undefined,
        titulo: $('#pf-titulo').value, tipo_imovel: $('#pf-tipo').value, resumo: $('#pf-resumo').value,
        corpo: $('#pf-corpo').value, capa_url: $('#pf-capa').value,
        servicos: $('#pf-servicos').value.split(',').map((x) => x.trim()).filter(Boolean),
        conceitual: $('#pf-conceitual').checked,
      };
      if (!corpo.conceitual) corpo.consentimento = { autorizado_por: $('#pf-c-quem').value, data: $('#pf-c-data').value, escopo: $('#pf-c-escopo').value };
      try { await api('POST', '/alta-vista/portfolio', corpo); avPortfolio($('#av-corpo')); } catch (e) { alert(e.message); }
    };
    if (p) $('#pf-excluir').onclick = async () => {
      if (!confirm(`Excluir "${p.titulo}" do portfólio?`)) return;
      try { await api('DELETE', `/alta-vista/portfolio/${p.id}`); avPortfolio($('#av-corpo')); } catch (e) { alert(e.message); }
    };
  };
  $('#av-pf-novo').onclick = () => abrirForm(null);
  document.querySelectorAll('.av-pf-editar').forEach((b) => { b.onclick = () => abrirForm(d.itens.find((x) => x.id === b.dataset.id)); });
  document.querySelectorAll('.av-pf-pub').forEach((b) => {
    b.onclick = async () => {
      const p = d.itens.find((x) => x.id === b.dataset.id);
      try { await api('POST', '/alta-vista/portfolio', { id: p.id, titulo: p.titulo, publicado: b.dataset.pub === '1' }); avPortfolio($('#av-corpo')); }
      catch (e) { alert(e.message); }
    };
  });
}

// ---------------- FAQ ----------------
async function avFaqs(cx) {
  const d = await api('GET', '/alta-vista/faqs');
  cx.innerHTML = `${tabela(['Ordem', 'Pergunta', 'Resposta', 'Ações'], d.faqs.map((f) => [
    f.ordem, `<b>${esc(f.pergunta)}</b>`, `<small>${esc(f.resposta.slice(0, 260))}</small>`,
    `<button class="btn secund peq av-faq-editar" data-id="${esc(f.id)}">✏️</button>
     <button class="btn secund peq av-faq-excluir" data-id="${esc(f.id)}">🗑️</button>`,
  ]))}
  <div class="barra"><button class="btn" id="av-faq-nova">➕ Nova pergunta</button></div>
  <div id="av-faq-form"></div>`;
  const abrir = (f) => {
    $('#av-faq-form').innerHTML = `<div class="caixa" style="margin-top:14px">
      <label>Pergunta<input id="fq-p" value="${esc(f ? f.pergunta : '')}"></label>
      <label>Resposta<textarea id="fq-r" rows="4">${esc(f ? f.resposta : '')}</textarea></label>
      <label>Ordem<input id="fq-o" type="number" value="${f ? f.ordem : 100}" style="width:110px"></label>
      <div class="barra"><button class="btn" id="fq-salvar">💾 Salvar</button></div></div>`;
    $('#fq-salvar').onclick = async () => {
      try {
        await api('POST', '/alta-vista/faqs', { id: f ? f.id : undefined, pergunta: $('#fq-p').value, resposta: $('#fq-r').value, ordem: Number($('#fq-o').value || 100) });
        avFaqs($('#av-corpo'));
      } catch (e) { alert(e.message); }
    };
  };
  $('#av-faq-nova').onclick = () => abrir(null);
  document.querySelectorAll('.av-faq-editar').forEach((b) => { b.onclick = () => abrir(d.faqs.find((x) => x.id === b.dataset.id)); });
  document.querySelectorAll('.av-faq-excluir').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Excluir esta pergunta?')) return;
      try { await api('DELETE', `/alta-vista/faqs/${b.dataset.id}`); avFaqs($('#av-corpo')); } catch (e) { alert(e.message); }
    };
  });
}

// ---------------- conteúdos ----------------
async function avConteudos(cx) {
  const d = await api('GET', '/alta-vista/conteudos');
  cx.innerHTML = `${d.conteudos.length ? tabela(['Título', 'Slug', 'Status', 'Publicado em', 'Ações'], d.conteudos.map((c) => [
    `<b>${esc(c.titulo)}</b>`, esc(c.slug), c.status === 'publicado' ? '<span class="pill ok">publicado</span>' : '<span class="pill">rascunho</span>',
    avDia(c.publicado_em),
    `<button class="btn secund peq av-ct-editar" data-id="${esc(c.id)}">✏️</button>
     <button class="btn secund peq av-ct-excluir" data-id="${esc(c.id)}">🗑️</button>`,
  ])) : '<p class="vazio">Nenhum conteúdo ainda. O calendário editorial das 12 semanas está no plano de lançamento.</p>'}
  <div class="barra"><button class="btn" id="av-ct-novo">➕ Novo conteúdo</button></div>
  <div id="av-ct-form"></div>`;
  const abrir = (c) => {
    $('#av-ct-form').innerHTML = `<div class="caixa" style="margin-top:14px">
      <div class="linha-2col">
        <label>Título<input id="ct-t" value="${esc(c ? c.titulo : '')}"></label>
        <label>Slug (vazio = gera do título)<input id="ct-s" value="${esc(c ? c.slug : '')}"></label>
      </div>
      <label>Resumo<input id="ct-r" value="${esc(c ? c.resumo : '')}"></label>
      <label>Corpo (HTML simples: p, h3, ul/li, a)<textarea id="ct-c" rows="8">${esc(c ? c.corpo : '')}</textarea></label>
      <label>Status <select id="ct-st"><option value="rascunho"${c && c.status === 'rascunho' ? ' selected' : ''}>rascunho</option><option value="publicado"${c && c.status === 'publicado' ? ' selected' : ''}>publicado</option></select></label>
      <div class="barra"><button class="btn" id="ct-salvar">💾 Salvar</button></div></div>`;
    $('#ct-salvar').onclick = async () => {
      try {
        await api('POST', '/alta-vista/conteudos', { id: c ? c.id : undefined, titulo: $('#ct-t').value, slug: $('#ct-s').value, resumo: $('#ct-r').value, corpo: $('#ct-c').value, status: $('#ct-st').value });
        avConteudos($('#av-corpo'));
      } catch (e) { alert(e.message); }
    };
  };
  $('#av-ct-novo').onclick = () => abrir(null);
  document.querySelectorAll('.av-ct-editar').forEach((b) => { b.onclick = () => abrir(d.conteudos.find((x) => x.id === b.dataset.id)); });
  document.querySelectorAll('.av-ct-excluir').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Excluir este conteúdo?')) return;
      try { await api('DELETE', `/alta-vista/conteudos/${b.dataset.id}`); avConteudos($('#av-corpo')); } catch (e) { alert(e.message); }
    };
  });
}

// ---------------- config ----------------
async function avConfig(cx) {
  const d = await api('GET', '/alta-vista/config');
  cx.innerHTML = `<p class="sub">Configuração da marca e do programa de fundadores. Salva direto no banco do produto.</p>
    ${tabela(['Chave', 'Valor', 'Para que serve'], d.config.map((c) => [
      `<code>${esc(c.chave)}</code>`,
      `<input data-cfg="${esc(c.chave)}" value="${esc(c.valor)}" style="min-width:180px">`,
      `<small>${esc(c.descricao)}</small>`,
    ]))}
    <div class="barra"><button class="btn" id="av-cfg-salvar">💾 Salvar configuração</button></div>`;
  $('#av-cfg-salvar').onclick = async () => {
    const corpo = {};
    document.querySelectorAll('[data-cfg]').forEach((i) => { corpo[i.dataset.cfg] = i.value; });
    try { await api('PATCH', '/alta-vista/config', corpo); alert('Configuração salva.'); avCarregar(); } catch (e) { alert(e.message); }
  };
}
