'use strict';
// ============================================================================
// Portal Staff — módulo: Villela Legal Intelligence (Fase 1 — fundação)
// Sub-app autocontido dentro de #conteudo, com abas internas (mesmo padrão da
// Gestão de Livros). Reaproveita helpers globais (api, esc, conteudo, cabecalho,
// tabela, arquivoParaBase64). Permissões vêm de /staff/api/legal/eu.
// ============================================================================

const LG = {
  tab: 'painel', perm: {}, perfil: '', nomePerfil: '', enums: {}, nucleos: [],
  api(m, c, b) { return api(m, '/legal' + c, b); },
  brl(c) { return 'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); },
  dt(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—'; },
  chip(t) { return `<span class="chip">${esc(String(t || '—').replace(/_/g, ' '))}</span>`; },

  async abrir(tab) {
    if (tab) LG.tab = tab;
    try {
      const eu = await LG.api('GET', '/eu');
      LG.perm = eu.permissoes || {}; LG.perfil = eu.perfil || ''; LG.nomePerfil = eu.nome || '';
      LG.enums = eu.enums || {}; LG.nucleos = eu.nucleos || [];
    } catch (e) {
      conteudo().innerHTML = cabecalho('⚖️ Villela Legal') + `<div class="card">${esc(e.message)}</div>`;
      return;
    }
    LG.render();
  },
  abas() {
    const t = [['painel', '📊 Painel']];
    if (LG.perm.gerir_clientes) t.push(['clientes', '👥 Clientes']);
    if (LG.perm.ver_processos) t.push(['processos', '⚖️ Processos']);
    if (LG.perm.ver_processos) t.push(['prazos', '⏰ Prazos']);
    if (LG.perm.gerir_publicacoes) t.push(['publicacoes', '📰 Publicações']);
    if (LG.perm.gerir_tarefas) t.push(['tarefas', '✅ Tarefas']);
    if (LG.perm.ver_documentos) t.push(['documentos', '📂 Documentos']);
    if (LG.perm.ver_financeiro) t.push(['financeiro', '💰 Financeiro']);
    if (LG.perm.usar_ia) t.push(['ia', '🤖 IA jurídica']);
    if (LG.perm.gerir_usuarios) t.push(['equipe', '⚙️ Equipe']);
    if (LG.perm.ver_auditoria) t.push(['auditoria', '📜 Auditoria']);
    return t;
  },
  render() {
    const abas = LG.abas().map(([id, rot]) => `<button class="btn ${LG.tab === id ? '' : 'secund'} peq" onclick="LG.ir('${id}')">${rot}</button>`).join(' ');
    conteudo().innerHTML = cabecalho('⚖️ Villela Legal Intelligence', `Gestão jurídica — perfil: ${esc(LG.nomePerfil)}. Conteúdo gerado por IA é sempre MINUTA (revisão de advogado obrigatória).`)
      + `<div class="card" style="display:flex;flex-wrap:wrap;gap:.4rem">${abas}</div><div id="lg-body"><p class="sub">Carregando…</p></div>`;
    LG.pintar();
  },
  ir(tab) { LG.tab = tab; LG.render(); },
  body() { return document.getElementById('lg-body'); },
  async pintar() {
    try {
      const v = { painel: LG.vPainel, clientes: LG.vClientes, processos: LG.vProcessos, prazos: LG.vPrazos, publicacoes: LG.vPublicacoes, tarefas: LG.vTarefas, documentos: LG.vDocumentos, financeiro: LG.vFinanceiro, ia: LG.vIA, equipe: LG.vEquipe, auditoria: LG.vAuditoria }[LG.tab];
      if (v) await v();
    } catch (e) { LG.body().innerHTML = `<div class="card">Erro: ${esc(e.message)}</div>`; }
  },
  sel(id, lista, atual) {
    return `<select id="${id}">${(lista || []).filter(x => x !== '').map(x => `<option value="${x}"${x === atual ? ' selected' : ''}>${x.replace(/_/g, ' ')}</option>`).join('')}</select>`;
  },

  // -------------------------------------------------------- PAINEL
  async vPainel() {
    const { resumo: r } = await LG.api('GET', '/dashboard');
    const kpi = (rot, val, alerta) => `<div class="card" style="min-width:150px;flex:1${alerta && val ? ';border-color:var(--alerta)' : ''}"><div class="sub">${rot}</div><div style="font-size:1.5rem;font-weight:700${alerta && val ? ';color:var(--alerta)' : ''}">${val}</div></div>`;
    LG.body().innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
      ${kpi('Processos ativos', r.processos_ativos)}${kpi('Clientes ativos', r.clientes_ativos)}
      ${kpi('Prazos até hoje', r.prazos_hoje, true)}${kpi('Prazos em 7 dias', r.prazos_7dias)}
      ${kpi('Prazos sem validação humana', r.prazos_sem_validacao, true)}${kpi('Publicações novas', r.publicacoes_novas, true)}
      ${kpi('Tarefas abertas', r.tarefas_abertas)}${kpi('Tarefas atrasadas', r.tarefas_atrasadas, true)}
      ${kpi('Docs em revisão', r.docs_em_revisao)}${kpi('Respostas de IA sem revisão', r.ia_sem_revisao, true)}</div>
      <div class="aviso">🧭 Fase 1 (fundação). Coleta automática DataJud/DJEN, RAG e geração de peças chegam nas próximas fases — ver README do módulo.</div>`;
  },

  // -------------------------------------------------------- CLIENTES
  async vClientes() {
    const { clientes } = await LG.api('GET', '/clientes');
    let h = `<details class="cr-box"><summary class="cr-sum">➕ Novo cliente</summary>
      <form class="form" id="lg-cli-form" style="max-width:660px;margin-top:12px">
        <label>Nome / Razão social * <input id="lgc-nome" required maxlength="200"></label>
        <div class="hi-grid">
          <label>Tipo <select id="lgc-tp"><option value="PF">Pessoa física</option><option value="PJ">Pessoa jurídica</option></select></label>
          <label>Situação ${LG.sel('lgc-sit', LG.enums.tipoCliente, 'potencial')}</label>
          <label>CPF/CNPJ <input id="lgc-doc" maxlength="20"></label>
          <label>E-mail <input id="lgc-email" type="email" maxlength="120"></label>
          <label>WhatsApp <input id="lgc-zap" maxlength="20"></label>
          <label>Origem <input id="lgc-orig" maxlength="80"></label>
        </div>
        <label>Observações <input id="lgc-obs" maxlength="500"></label>
        <button class="btn" type="submit">Salvar</button><p id="lgc-msg" class="erro"></p>
      </form></details>`;
    h += `<div class="card">${clientes.length ? tabela(['Nome', 'Tipo', 'Situação', 'E-mail', 'WhatsApp', ''], clientes.map(c => [
      esc(c.nome), c.tipo_pessoa, LG.chip(c.tipo_cliente), esc(c.email || '—'), esc(c.whatsapp || '—'),
      `<button class="btn secund peq" onclick="LG.verCliente('${c.id}')">Abrir</button>`,
    ])) : '<p class="vazio">Nenhum cliente ainda.</p>'}</div>`;
    LG.body().innerHTML = h;
    const f = document.getElementById('lg-cli-form');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault(); const msg = document.getElementById('lgc-msg'); msg.textContent = '';
      try {
        await LG.api('POST', '/clientes', {
          nome: document.getElementById('lgc-nome').value, tipo_pessoa: document.getElementById('lgc-tp').value,
          tipo_cliente: document.getElementById('lgc-sit').value, cpf_cnpj: document.getElementById('lgc-doc').value,
          email: document.getElementById('lgc-email').value, whatsapp: document.getElementById('lgc-zap').value,
          origem: document.getElementById('lgc-orig').value, obs: document.getElementById('lgc-obs').value,
        });
        LG.pintar();
      } catch (e) { msg.textContent = e.message; }
    };
  },
  async verCliente(id) {
    const { cliente: c } = await LG.api('GET', '/clientes/' + id);
    LG.body().innerHTML = `<div class="card"><button class="btn secund peq" onclick="LG.pintar()">← Voltar</button>
      <h3 style="margin:.6rem 0 0">${esc(c.nome)} ${LG.chip(c.tipo_cliente)} ${LG.chip(c.tipo_pessoa)}</h3>
      <p class="sub">${esc(c.email || '')} · ${esc(c.whatsapp || '')} · CPF/CNPJ: ${esc(c.cpf_cnpj || '—')}</p>
      ${c.obs ? `<p>${esc(c.obs)}</p>` : ''}</div>
      <div class="card"><h3>⚖️ Processos vinculados</h3>${c.processos.length ? tabela(['CNJ', 'Tribunal', 'Status', 'Fase'], c.processos.map(p => [esc(p.numero_cnj || '(consultivo)'), esc(p.tribunal || '—'), LG.chip(p.status), esc(p.fase || '—')])) : '<p class="vazio">Nenhum.</p>'}</div>
      <div class="card"><h3>🔒 Consentimentos LGPD</h3>${c.consentimentos.length ? tabela(['Finalidade', 'Base legal', 'Concedido', 'Quando'], c.consentimentos.map(x => [esc(x.finalidade), esc(x.base_legal || '—'), x.concedido ? '✅' : '⛔', LG.dt(x.quando)])) : '<p class="vazio">Nenhum registrado.</p>'}
        <form class="form" id="lg-cons-form" style="max-width:560px"><div class="hi-grid">
          <label>Finalidade <input id="lgcs-fin" maxlength="120" placeholder="comunicacao-processual"></label>
          <label>Base legal <input id="lgcs-base" maxlength="120" placeholder="execução de contrato"></label></div>
          <button class="btn peq" type="submit">Registrar consentimento</button></form></div>
      <div class="card"><h3>📝 Notas internas (nunca visíveis ao cliente)</h3>
        ${c.notas.map(n => `<p><b>${esc(n.autor)}</b> <span class="sub">${LG.dt(n.criado_em)}</span><br>${esc(n.texto)}</p>`).join('') || '<p class="vazio">Sem notas.</p>'}
        <form class="form" id="lg-nota-form"><label>Nova nota <input id="lgn-txt" maxlength="2000"></label><button class="btn peq" type="submit">Adicionar</button></form></div>`;
    document.getElementById('lg-cons-form').onsubmit = async (ev) => {
      ev.preventDefault();
      await LG.api('POST', `/clientes/${id}/consentimentos`, { finalidade: document.getElementById('lgcs-fin').value, base_legal: document.getElementById('lgcs-base').value });
      LG.verCliente(id);
    };
    document.getElementById('lg-nota-form').onsubmit = async (ev) => {
      ev.preventDefault();
      await LG.api('POST', `/clientes/${id}/notas`, { texto: document.getElementById('lgn-txt').value });
      LG.verCliente(id);
    };
  },

  // -------------------------------------------------------- PROCESSOS
  async vProcessos() {
    const { processos } = await LG.api('GET', '/processos');
    let h = '';
    if (LG.perm.criar_processos) h += `<details class="cr-box"><summary class="cr-sum">➕ Novo processo</summary>
      <form class="form" id="lg-proc-form" style="max-width:660px;margin-top:12px">
        <div class="hi-grid">
          <label>Nº CNJ <input id="lgp-cnj" maxlength="30" placeholder="0000000-00.0000.0.00.0000"></label>
          <label>Tribunal <input id="lgp-trib" maxlength="20" placeholder="TJDFT"></label>
          <label>Classe <input id="lgp-classe" maxlength="120"></label>
          <label>Núcleo <select id="lgp-nucleo"><option value="">—</option>${LG.nucleos.map(n => `<option>${n}</option>`).join('')}</select></label>
          <label>Valor da causa (R$) <input id="lgp-valor" type="number" min="0" step="0.01"></label>
          <label>Risco ${LG.sel('lgp-risco', ['provavel', 'possivel', 'remoto'], 'possivel')}</label>
        </div>
        <label>Assunto * <input id="lgp-assunto" required maxlength="300"></label>
        <label>ID do cliente (aba Clientes) <input id="lgp-cli" maxlength="20"></label>
        <button class="btn" type="submit">Cadastrar</button><p id="lgp-msg" class="erro"></p>
      </form></details>`;
    h += `<div class="card">${processos.length ? tabela(['CNJ', 'Cliente', 'Assunto', 'Núcleo', 'Status', ''], processos.map(p => [
      esc(p.numero_cnj || '(consultivo)'), esc(p.cliente_nome || '—'), esc((p.assunto || '').slice(0, 60)), esc(p.nucleo || '—'), LG.chip(p.status),
      `<button class="btn secund peq" onclick="LG.verProcesso('${p.id}')">Abrir</button>`,
    ])) : '<p class="vazio">Nenhum processo ainda.</p>'}</div>`;
    LG.body().innerHTML = h;
    const f = document.getElementById('lg-proc-form');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault(); const msg = document.getElementById('lgp-msg'); msg.textContent = '';
      try {
        await LG.api('POST', '/processos', {
          numero_cnj: document.getElementById('lgp-cnj').value, tribunal: document.getElementById('lgp-trib').value,
          classe: document.getElementById('lgp-classe').value, nucleo: document.getElementById('lgp-nucleo').value,
          valor_causa: Math.round(Number(document.getElementById('lgp-valor').value || 0) * 100),
          risco: document.getElementById('lgp-risco').value, assunto: document.getElementById('lgp-assunto').value,
          client_id: document.getElementById('lgp-cli').value.trim(),
        });
        LG.pintar();
      } catch (e) { msg.textContent = e.message; }
    };
  },
  async verProcesso(id) {
    const { processo: p } = await LG.api('GET', '/processos/' + id);
    LG.body().innerHTML = `<div class="card"><button class="btn secund peq" onclick="LG.pintar()">← Voltar</button>
      <h3 style="margin:.6rem 0 0">${esc(p.numero_cnj || '(consultivo)')} ${LG.chip(p.status)} ${p.sigiloso ? '🔒' : ''}</h3>
      <p class="sub">${esc(p.tribunal || '')} · ${esc(p.classe || '')} · Núcleo: ${esc(p.nucleo || '—')} · Cliente: ${esc(p.cliente_nome || '—')} · Valor: ${LG.brl(p.valor_causa)} · Risco: ${esc(p.risco || '—')}</p>
      <p>${esc(p.assunto || '')}</p>
      ${p.estrategia && p.estrategia !== '[restrito]' ? `<div class="aviso">🧠 Estratégia (interna): ${esc(p.estrategia)}</div>` : ''}
      ${p.proximas_acoes ? `<p><b>Próximas ações:</b> ${esc(p.proximas_acoes)}</p>` : ''}</div>
      <div class="card"><h3>📜 Andamentos</h3>
      ${p.movimentos.length ? tabela(['Data', 'Descrição', 'Classificação', 'Fonte'], p.movimentos.map(m => [LG.dt(m.data), esc((m.descricao || '').slice(0, 100)), LG.chip(m.classificacao || 'informativo'), esc(m.fonte || '—')])) : '<p class="vazio">Nenhum andamento.</p>'}
      ${LG.perm.editar_processos ? `<form class="form" id="lg-mov-form" style="max-width:660px"><div class="hi-grid">
        <label>Data <input id="lgm-data" type="date"></label>
        <label>Classificação ${LG.sel('lgm-cls', (LG.enums.classifMov || []).filter(Boolean), 'informativo')}</label></div>
        <label>Descrição * <input id="lgm-desc" required maxlength="1000"></label>
        <button class="btn peq" type="submit">Registrar andamento</button></form>` : ''}</div>
      <div class="card"><h3>⏰ Prazos deste processo</h3>${p.prazos.length ? tabela(['Título', 'Fatal', 'Status', 'Validado por'], p.prazos.map(z => [esc(z.titulo), LG.dt(z.data_fatal), LG.chip(z.status), esc(z.validado_por || '⚠️ pendente')])) : '<p class="vazio">Nenhum.</p>'}</div>
      <div class="card"><h3>✅ Tarefas</h3>${p.tarefas.length ? tabela(['Título', 'Prazo', 'Status'], p.tarefas.map(t => [esc(t.titulo), LG.dt(t.prazo), LG.chip(t.status)])) : '<p class="vazio">Nenhuma.</p>'}</div>
      <div class="card"><h3>📂 Documentos</h3>${p.documentos.length ? tabela(['Título', 'Tipo', 'Sigilo', 'Status', 'v'], p.documentos.map(d => [esc(d.titulo), esc(d.tipo || '—'), LG.chip(d.sigilo), LG.chip(d.status), 'v' + d.versao_atual])) : '<p class="vazio">Nenhum.</p>'}</div>`;
    const f = document.getElementById('lg-mov-form');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault();
      await LG.api('POST', `/processos/${id}/andamentos`, { data: document.getElementById('lgm-data').value, classificacao: document.getElementById('lgm-cls').value, descricao: document.getElementById('lgm-desc').value, fonte: 'manual' });
      LG.verProcesso(id);
    };
  },

  // -------------------------------------------------------- PRAZOS
  async vPrazos() {
    const { prazos } = await LG.api('GET', '/prazos');
    let h = '';
    if (LG.perm.gerir_prazos) h += `<details class="cr-box"><summary class="cr-sum">➕ Novo prazo</summary>
      <form class="form" id="lg-prz-form" style="max-width:660px;margin-top:12px">
        <label>Título * <input id="lgz-tit" required maxlength="200"></label>
        <div class="hi-grid">
          <label>Tipo <select id="lgz-tipo"><option value="interno">Interno</option><option value="fatal">Fatal</option></select></label>
          <label>Data interna <input id="lgz-int" type="date"></label>
          <label>Data fatal <input id="lgz-fat" type="date"></label>
          <label>Prioridade ${LG.sel('lgz-pri', LG.enums.prioridade, 'media')}</label>
        </div>
        <label>ID do processo (opcional) <input id="lgz-case" maxlength="20"></label>
        <button class="btn" type="submit">Criar</button><p id="lgz-msg" class="erro"></p>
      </form></details>`;
    h += `<div class="aviso">⚠️ Prazo com cálculo sugerido automaticamente NÃO avança de status sem "validado por" (advogado humano).</div>`;
    h += `<div class="card">${prazos.length ? tabela(['Título', 'CNJ', 'Fatal', 'Interna', 'Prioridade', 'Status', 'Validação', ''], prazos.map(z => [
      esc(z.titulo), esc(z.numero_cnj || '—'), LG.dt(z.data_fatal), LG.dt(z.data_interna), LG.chip(z.prioridade), LG.chip(z.status),
      z.calculo_sugerido && !z.validado_por ? '⚠️ pendente' : (z.validado_por ? '✅ ' + esc(z.validado_por) : '—'),
      LG.perm.gerir_prazos ? `<button class="btn secund peq" onclick="LG.mudarPrazo('${z.id}','${z.status}')">Status</button>` : '',
    ])) : '<p class="vazio">Nenhum prazo em aberto.</p>'}</div>`;
    LG.body().innerHTML = h;
    const f = document.getElementById('lg-prz-form');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault(); const msg = document.getElementById('lgz-msg'); msg.textContent = '';
      try {
        await LG.api('POST', '/prazos', {
          titulo: document.getElementById('lgz-tit').value, tipo: document.getElementById('lgz-tipo').value,
          data_interna: document.getElementById('lgz-int').value, data_fatal: document.getElementById('lgz-fat').value,
          prioridade: document.getElementById('lgz-pri').value, case_id: document.getElementById('lgz-case').value.trim(),
          validado_por: ESTADO.me && ESTADO.me.nome, // criado manualmente = já validado por quem criou
        });
        LG.pintar();
      } catch (e) { msg.textContent = e.message; }
    };
  },
  async mudarPrazo(id, atual) {
    const novo = prompt('Novo status (' + (LG.enums.statusPrazo || []).join(', ') + '):', atual);
    if (!novo || novo === atual) return;
    try {
      await LG.api('PATCH', '/prazos/' + id, { status: novo.trim(), validado_por: ESTADO.me && ESTADO.me.nome });
      LG.pintar();
    } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- PUBLICAÇÕES
  async vPublicacoes() {
    const { publicacoes } = await LG.api('GET', '/publicacoes');
    LG.body().innerHTML = `<div class="aviso">📥 Publicações chegam pela ingestão dos agentes (DJEN/recorte, via PUBLISH_KEY) ou cadastro manual via API. Triagem: nova → lida → analisada → prazo criado / descartada.</div>
      <div class="card">${publicacoes.length ? tabela(['Data', 'Fonte', 'Órgão', 'Texto', 'Prazo?', 'Status', ''], publicacoes.map(p => [
        LG.dt(p.data_publicacao), esc(p.fonte || '—'), esc(p.orgao || '—'), esc((p.texto || '').slice(0, 80)), p.tem_prazo ? '⚠️' : '—', LG.chip(p.status),
        `<button class="btn secund peq" onclick="LG.mudarPub('${p.id}','${p.status}')">Status</button>`,
      ])) : '<p class="vazio">Nenhuma publicação.</p>'}</div>`;
  },
  async mudarPub(id, atual) {
    const novo = prompt('Novo status (' + (LG.enums.statusPub || []).join(', ') + '):', atual);
    if (!novo || novo === atual) return;
    try { await LG.api('PATCH', '/publicacoes/' + id, { status: novo.trim() }); LG.pintar(); } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- TAREFAS
  async vTarefas() {
    const { tarefas } = await LG.api('GET', '/tarefas');
    let h = `<details class="cr-box"><summary class="cr-sum">➕ Nova tarefa</summary>
      <form class="form" id="lg-tar-form" style="max-width:660px;margin-top:12px">
        <label>Título * <input id="lgt-tit" required maxlength="200"></label>
        <div class="hi-grid">
          <label>Prazo <input id="lgt-prazo" type="date"></label>
          <label>Prioridade ${LG.sel('lgt-pri', LG.enums.prioridade, 'media')}</label>
          <label>Núcleo <select id="lgt-nuc"><option value="">—</option>${LG.nucleos.map(n => `<option>${n}</option>`).join('')}</select></label>
        </div>
        <label>Descrição <input id="lgt-desc" maxlength="1000"></label>
        <button class="btn" type="submit">Criar</button></form></details>`;
    h += `<div class="card">${tarefas.length ? tabela(['Título', 'CNJ', 'Prazo', 'Prioridade', 'Status', ''], tarefas.map(t => [
      esc(t.titulo), esc(t.numero_cnj || '—'), LG.dt(t.prazo), LG.chip(t.prioridade), LG.chip(t.status),
      `<button class="btn secund peq" onclick="LG.mudarTarefa('${t.id}','${t.status}')">Status</button>`,
    ])) : '<p class="vazio">Nenhuma tarefa aberta.</p>'}</div>`;
    LG.body().innerHTML = h;
    document.getElementById('lg-tar-form').onsubmit = async (ev) => {
      ev.preventDefault();
      await LG.api('POST', '/tarefas', {
        titulo: document.getElementById('lgt-tit').value, prazo: document.getElementById('lgt-prazo').value,
        prioridade: document.getElementById('lgt-pri').value, nucleo: document.getElementById('lgt-nuc').value,
        descricao: document.getElementById('lgt-desc').value,
      });
      LG.pintar();
    };
  },
  async mudarTarefa(id, atual) {
    const novo = prompt('Novo status (' + (LG.enums.statusTask || []).join(', ') + '):', atual);
    if (!novo || novo === atual) return;
    try { await LG.api('PATCH', '/tarefas/' + id, { status: novo.trim() }); LG.pintar(); } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- DOCUMENTOS
  async vDocumentos() {
    const { documentos } = await LG.api('GET', '/documentos');
    let h = '';
    if (LG.perm.criar_documentos) h += `<details class="cr-box"><summary class="cr-sum">➕ Enviar documento</summary>
      <form class="form" id="lg-doc-form" style="max-width:660px;margin-top:12px">
        <label>Título * <input id="lgd-tit" required maxlength="200"></label>
        <div class="hi-grid">
          <label>Tipo <input id="lgd-tipo" maxlength="40" placeholder="procuracao, prova, peca…"></label>
          <label>Sigilo ${LG.sel('lgd-sig', LG.enums.sigiloDoc, 'interno')}</label>
          <label>ID do processo <input id="lgd-case" maxlength="20"></label>
          <label>ID do cliente <input id="lgd-cli" maxlength="20"></label>
        </div>
        <label>Arquivo * (até 10 MB) <input id="lgd-arq" type="file" required></label>
        <button class="btn" type="submit">Enviar</button><p id="lgd-msg" class="erro"></p>
      </form></details>`;
    h += `<div class="card">${documentos.length ? tabela(['Título', 'Tipo', 'Sigilo', 'Status', 'v', ''], documentos.map(d => [
      esc(d.titulo), esc(d.tipo || '—'), LG.chip(d.sigilo), LG.chip(d.status), 'v' + d.versao_atual,
      `<a class="btn secund peq" href="/staff/api/legal/documentos/${d.id}/download">⬇️</a> ` +
      (LG.perm.editar_documentos ? `<button class="btn secund peq" onclick="LG.mudarDoc('${d.id}','${d.status}')">Status</button>` : ''),
    ])) : '<p class="vazio">Nenhum documento.</p>'}</div>`;
    LG.body().innerHTML = h;
    const f = document.getElementById('lg-doc-form');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault(); const msg = document.getElementById('lgd-msg'); msg.textContent = '';
      try {
        const arq = document.getElementById('lgd-arq').files[0];
        if (!arq) throw new Error('Escolha um arquivo.');
        if (arq.size > 10 * 1024 * 1024) throw new Error('Arquivo acima de 10 MB.');
        await LG.api('POST', '/documentos', {
          titulo: document.getElementById('lgd-tit').value, tipo: document.getElementById('lgd-tipo').value,
          sigilo: document.getElementById('lgd-sig').value, case_id: document.getElementById('lgd-case').value.trim(),
          client_id: document.getElementById('lgd-cli').value.trim(), nome_original: arq.name, mime: arq.type,
          base64: await arquivoParaBase64(arq),
        });
        LG.pintar();
      } catch (e) { msg.textContent = e.message; }
    };
  },
  async mudarDoc(id, atual) {
    const novo = prompt('Novo status (' + (LG.enums.statusDoc || []).join(', ') + '):', atual);
    if (!novo || novo === atual) return;
    try { await LG.api('PATCH', '/documentos/' + id, { status: novo.trim() }); LG.pintar(); } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- FINANCEIRO
  async vFinanceiro() {
    const { lancamentos } = await LG.api('GET', '/financeiro');
    let h = '';
    if (LG.perm.gerir_financeiro) h += `<details class="cr-box"><summary class="cr-sum">➕ Novo lançamento</summary>
      <form class="form" id="lg-fin-form" style="max-width:660px;margin-top:12px">
        <label>Descrição * <input id="lgf-desc" required maxlength="200"></label>
        <div class="hi-grid">
          <label>Tipo ${LG.sel('lgf-tipo', LG.enums.tipoFin, 'honorario_contratual')}</label>
          <label>Valor (R$) * <input id="lgf-valor" type="number" step="0.01" required></label>
          <label>Vencimento <input id="lgf-venc" type="date"></label>
          <label>ID do cliente <input id="lgf-cli" maxlength="20"></label>
        </div>
        <button class="btn" type="submit">Lançar</button></form></details>`;
    h += `<div class="card">${lancamentos.length ? tabela(['Descrição', 'Tipo', 'Valor', 'Vencimento', 'Status'], lancamentos.map(l => [
      esc(l.descricao), LG.chip(l.tipo), LG.brl(l.valor), LG.dt(l.vencimento), LG.chip(l.status),
    ])) : '<p class="vazio">Nenhum lançamento.</p>'}</div>`;
    LG.body().innerHTML = h;
    const f = document.getElementById('lg-fin-form');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault();
      await LG.api('POST', '/financeiro', {
        descricao: document.getElementById('lgf-desc').value, tipo: document.getElementById('lgf-tipo').value,
        valor: Math.round(Number(document.getElementById('lgf-valor').value || 0) * 100),
        vencimento: document.getElementById('lgf-venc').value, client_id: document.getElementById('lgf-cli').value.trim(),
      });
      LG.pintar();
    };
  },

  // -------------------------------------------------------- IA JURÍDICA
  async vIA() {
    const { consultas } = await LG.api('GET', '/ia');
    LG.body().innerHTML = `<div class="aviso">🤖 Fase 1: registro e revisão. Toda resposta é MINUTA (rascunho) até um advogado revisar. A geração assistida (RAG) chega na Fase 3.</div>
      <div class="card">${consultas.length ? consultas.map(q => `
        <div style="border-bottom:1px solid #eee;padding:.5rem 0">
          <b>${esc((q.pergunta || '').slice(0, 120))}</b> <span class="sub">${LG.dt(q.criado_em)} · ${esc(q.agente || 'sem agente')}</span><br>
          ${q.respostas.map(r => `${LG.chip(r.status)} confiança: ${esc(r.nivel_confianca || '—')} ${r.revisado_por ? '· revisado por ' + esc(r.revisado_por) : ''}
            <button class="btn secund peq" onclick="LG.verRespostaIA('${r.id}')">Ver</button>`).join(' ')}
        </div>`).join('') : '<p class="vazio">Nenhuma consulta registrada.</p>'}</div>`;
  },
  async verRespostaIA(id) {
    const { resposta: r, aviso } = await LG.api('GET', '/ia/respostas/' + id);
    LG.body().innerHTML = `<div class="card"><button class="btn secund peq" onclick="LG.pintar()">← Voltar</button>
      <div class="aviso">⚠️ ${esc(aviso)}</div>
      <h3>${esc((r.query && r.query.pergunta) || '')}</h3>
      <p style="white-space:pre-wrap">${esc(r.resposta)}</p>
      ${r.riscos ? `<p><b>Riscos:</b> ${esc(r.riscos)}</p>` : ''}${r.lacunas ? `<p><b>Lacunas:</b> ${esc(r.lacunas)}</p>` : ''}
      <p class="sub">Confiança: ${esc(r.nivel_confianca || '—')} · Status: ${LG.chip(r.status)} ${r.revisado_por ? '· revisado por ' + esc(r.revisado_por) : ''}</p>
      <h3>📚 Fontes</h3>${r.fontes.length ? tabela(['Tipo', 'Citação', 'URL'], r.fontes.map(f => [esc(f.tipo), esc(f.citacao), f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">abrir</a>` : '—'])) : '<p class="vazio">⚠️ Sem fontes — trate como não confiável.</p>'}
      ${LG.perm.aprovar_documentos ? `<p><button class="btn peq" onclick="LG.revisarIA('${r.id}','revisado')">Marcar revisado</button>
        <button class="btn peq" onclick="LG.revisarIA('${r.id}','aprovado')">Aprovar</button>
        <button class="btn secund peq" onclick="LG.revisarIA('${r.id}','descartado')">Descartar</button></p>` : ''}</div>`;
  },
  async revisarIA(id, status) {
    try { await LG.api('POST', `/ia/respostas/${id}/revisar`, { status }); LG.verRespostaIA(id); } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- EQUIPE
  async vEquipe() {
    const d = await LG.api('GET', '/equipe');
    const semPerfil = d.usuariosPortal.filter(u => u.papel !== 'admin' && !d.membros.find(m => m.id === u.id));
    LG.body().innerHTML = `<div class="aviso">👑 Admins do portal são <b>Super Admin</b> automaticamente. Atribua perfil jurídico aos demais usuários do portal.</div>
      <div class="card"><h3>Perfis atribuídos</h3>${d.membros.length ? tabela(['Nome', 'E-mail', 'Perfil', 'OAB', 'Núcleos', 'Ativo'], d.membros.map(m => [
        esc(m.nome), esc(m.email), LG.chip(m.role_id), esc(m.oab || '—'), esc((m.nucleos || []).join(', ') || '—'), m.ativo ? '✅' : '⛔',
      ])) : '<p class="vazio">Nenhum perfil atribuído ainda.</p>'}</div>
      <div class="card"><h3>Atribuir perfil</h3>
      <form class="form" id="lg-eq-form" style="max-width:560px"><div class="hi-grid">
        <label>Usuário do portal <select id="lge-user">${d.usuariosPortal.filter(u => u.papel !== 'admin').map(u => `<option value="${u.id}">${esc(u.nome)} (${esc(u.email)})</option>`).join('')}</select></label>
        <label>Perfil <select id="lge-role">${d.perfis.filter(p => !['super_admin', 'cliente'].includes(p.id)).map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
        <label>OAB <input id="lge-oab" maxlength="30"></label></div>
        <button class="btn" type="submit">Salvar</button><p id="lge-msg" class="erro"></p></form>
      ${semPerfil.length ? `<p class="sub">Sem perfil: ${semPerfil.map(u => esc(u.nome)).join(', ')}</p>` : ''}</div>`;
    document.getElementById('lg-eq-form').onsubmit = async (ev) => {
      ev.preventDefault(); const msg = document.getElementById('lge-msg'); msg.textContent = '';
      try {
        await LG.api('POST', '/equipe', { id: document.getElementById('lge-user').value, role_id: document.getElementById('lge-role').value, oab: document.getElementById('lge-oab').value });
        LG.pintar();
      } catch (e) { msg.textContent = e.message; }
    };
  },

  // -------------------------------------------------------- AUDITORIA
  async vAuditoria() {
    const { eventos } = await LG.api('GET', '/auditoria');
    LG.body().innerHTML = `<div class="card">${eventos.length ? tabela(['Quando', 'Quem', 'Ação', 'Entidade', 'Detalhe'], eventos.map(e => [
      new Date(e.quando).toLocaleString('pt-BR'), esc(e.quem), esc(e.acao), esc(e.entidade + (e.entidade_id ? ' #' + e.entidade_id.slice(0, 6) : '')), esc(e.detalhe || ''),
    ])) : '<p class="vazio">Nada registrado ainda.</p>'}</div>`;
  },
};

// entrada usada pelo app-core (rotas)
function renderLegal() { LG.abrir(); }
