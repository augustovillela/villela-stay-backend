'use strict';
// ============================================================================
// Portal Staff — módulo: Villela Legal Intelligence (Fase 1 — fundação)
// Sub-app autocontido dentro de #conteudo, com abas internas (mesmo padrão da
// Gestão de Livros). Reaproveita helpers globais (api, esc, conteudo, cabecalho,
// tabela, arquivoParaBase64). Permissões vêm de /staff/api/legal/eu.
// ============================================================================

const LG = {
  tab: 'painel', perm: {}, perfil: '', nomePerfil: '', enums: {}, nucleos: [],
  // base dos links diretos (download/export). No Portal Staff = /staff/api/legal;
  // servido ao ASSINANTE (painel /juridico) a casca define LEGAL_HREF_BASE.
  hrefBase: (typeof LEGAL_HREF_BASE !== 'undefined' ? LEGAL_HREF_BASE : '/staff/api/legal'),
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
    if (LG.perm.ver_processos) t.push(['agenda', '📅 Agenda']);
    if (LG.perm.ver_processos) t.push(['audiencias', '🏛️ Audiências']);
    if (LG.perm.gerir_publicacoes) t.push(['publicacoes', '📰 Publicações']);
    if (LG.perm.ver_documentos) t.push(['peticionar', '✍️ Peticionar']);
    if (LG.perm.gerir_tarefas) t.push(['tarefas', '✅ Tarefas']);
    if (LG.perm.ver_documentos) t.push(['documentos', '📂 Documentos']);
    if (LG.perm.ver_documentos) t.push(['pecas', '📝 Peças']);
    if (LG.perm.ver_documentos) t.push(['contratos', '📑 Contratos']);
    if (LG.perm.ver_financeiro) t.push(['financeiro', '💰 Financeiro']);
    if (LG.perm.ver_financeiro || LG.perm.exportar_relatorios) t.push(['relatorios', '📊 Relatórios']);
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
      const v = { painel: LG.vPainel, clientes: LG.vClientes, processos: LG.vProcessos, prazos: LG.vPrazos, agenda: LG.vAgenda, audiencias: LG.vAudiencias, publicacoes: LG.vPublicacoes, peticionar: LG.vPeticionar, tarefas: LG.vTarefas, documentos: LG.vDocumentos, pecas: LG.vPecas, contratos: LG.vContratos, financeiro: LG.vFinanceiro, relatorios: LG.vRelatorios, ia: LG.vIA, equipe: LG.vEquipe, auditoria: LG.vAuditoria }[LG.tab];
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
      ${kpi('Prazos até hoje', r.prazos_hoje, true)}${kpi('Prazos em 7 dias', r.prazos_7dias)}${kpi('Audiências em 7 dias', r.audiencias_7dias)}
      ${kpi('Prazos sem validação humana', r.prazos_sem_validacao, true)}${kpi('Publicações novas', r.publicacoes_novas, true)}
      ${kpi('Tarefas abertas', r.tarefas_abertas)}${kpi('Tarefas atrasadas', r.tarefas_atrasadas, true)}
      ${kpi('Docs em revisão', r.docs_em_revisao)}${kpi('Peças em revisão', r.pecas_em_revisao, true)}${kpi('Consultas de IA na fila', r.ia_pendentes, true)}${kpi('Respostas de IA sem revisão', r.ia_sem_revisao, true)}</div>
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
    const [{ cliente: c }, { conta }] = await Promise.all([
      LG.api('GET', '/clientes/' + id), LG.api('GET', `/clientes/${id}/portal-acesso`).catch(() => ({ conta: null })),
    ]);
    LG.body().innerHTML = `<div class="card"><button class="btn secund peq" onclick="LG.pintar()">← Voltar</button>
      <h3 style="margin:.6rem 0 0">${esc(c.nome)} ${LG.chip(c.tipo_cliente)} ${LG.chip(c.tipo_pessoa)}</h3>
      <p class="sub">${esc(c.email || '')} · ${esc(c.whatsapp || '')} · CPF/CNPJ: ${esc(c.cpf_cnpj || '—')}</p>
      ${c.obs ? `<p>${esc(c.obs)}</p>` : ''}</div>
      <div class="card"><h3>🔑 Portal do cliente</h3>
      ${conta ? `<p class="sub">Acesso: <b>${esc(conta.email)}</b> · ${conta.senha_definida ? '✅ senha definida' : '⏳ aguardando definir senha'} ${conta.ultimo_login ? '· último acesso ' + LG.dt(conta.ultimo_login) : ''}</p>` : '<p class="sub">Este cliente ainda não tem acesso ao portal.</p>'}
      <p><button class="btn peq" onclick="LG.gerarAcessoPortal('${id}')">${conta ? '♻️ Gerar novo link (reseta a senha)' : '➕ Criar acesso e gerar link'}</button></p>
      <p id="lg-portal-link" class="sub" style="word-break:break-all"></p></div>
      <div class="card"><h3>⚖️ Processos vinculados</h3>${c.processos.length ? tabela(['CNJ', 'Tribunal', 'Status', 'Fase'], c.processos.map(p => [esc(p.numero_cnj || '(consultivo)'), esc(p.tribunal || '—'), LG.chip(p.status), esc(p.fase || '—')])) : '<p class="vazio">Nenhum.</p>'}</div>
      <div class="card"><h3>🔒 Consentimentos LGPD</h3>${c.consentimentos.length ? tabela(['Finalidade', 'Base legal', 'Concedido', 'Quando'], c.consentimentos.map(x => [esc(x.finalidade), esc(x.base_legal || '—'), x.concedido ? '✅' : '⛔', LG.dt(x.quando)])) : '<p class="vazio">Nenhum registrado.</p>'}
        <form class="form" id="lg-cons-form" style="max-width:560px"><div class="hi-grid">
          <label>Finalidade <input id="lgcs-fin" maxlength="120" placeholder="comunicacao-processual"></label>
          <label>Base legal <input id="lgcs-base" maxlength="120" placeholder="execução de contrato"></label></div>
          <button class="btn peq" type="submit">Registrar consentimento</button></form></div>
      <div class="card"><h3>📝 Notas e mensagens</h3>
        ${c.notas.map(n => `<p>${n.interna ? '🔒' : '💬'} <b>${esc(n.autor)}</b> <span class="sub">${LG.dt(n.criado_em)}${n.interna ? ' · interna' : ' · visível ao cliente'}</span><br>${esc(n.texto)}</p>`).join('') || '<p class="vazio">Sem notas.</p>'}
        <form class="form" id="lg-nota-form"><label>Nova nota/mensagem <input id="lgn-txt" maxlength="2000"></label>
        <label class="serv-ativo"><input type="checkbox" id="lgn-vis"> 💬 Enviar como MENSAGEM ao cliente (visível no portal + notificação)</label>
        <button class="btn peq" type="submit">Adicionar</button></form></div>`;
    document.getElementById('lg-cons-form').onsubmit = async (ev) => {
      ev.preventDefault();
      await LG.api('POST', `/clientes/${id}/consentimentos`, { finalidade: document.getElementById('lgcs-fin').value, base_legal: document.getElementById('lgcs-base').value });
      LG.verCliente(id);
    };
    document.getElementById('lg-nota-form').onsubmit = async (ev) => {
      ev.preventDefault();
      await LG.api('POST', `/clientes/${id}/notas`, { texto: document.getElementById('lgn-txt').value, interna: !document.getElementById('lgn-vis').checked });
      LG.verCliente(id);
    };
  },
  async gerarAcessoPortal(id) {
    if (!confirm('Gerar link de acesso ao portal do cliente? (se já existir conta, a senha será resetada)')) return;
    try {
      const r = await LG.api('POST', `/clientes/${id}/portal-acesso`);
      const alvo = document.getElementById('lg-portal-link');
      alvo.innerHTML = `🔗 Link para o cliente definir a senha (validade ${esc(r.validade)}):<br><b>${esc(r.url)}</b>`;
      try { await navigator.clipboard.writeText(r.url); alvo.innerHTML += '<br>✅ copiado para a área de transferência'; } catch (_) {}
    } catch (e) { alert(e.message); }
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
      ${LG.perm.criar_documentos ? `<button class="btn secund peq" onclick="LG.peticionarDe('processo','${p.id}')">✍️ Peticionar neste processo</button>` : ''}
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
  _calc: null, // último cálculo da calculadora (log_id + memória) p/ amarrar ao prazo criado
  async vPrazos() {
    const { prazos } = await LG.api('GET', '/prazos');
    LG._calc = null;
    let h = '';
    if (LG.perm.gerir_prazos) h += `<details class="cr-box"><summary class="cr-sum">🧮 Calculadora de prazo (sugestão — exige validação)</summary>
      <form class="form" id="lg-calc-form" style="max-width:660px;margin-top:12px">
        <div class="hi-grid">
          <label>Termo inicial (publicação/intimação) <input id="lgk-ini" type="date" required></label>
          <label>Dias <input id="lgk-dias" type="number" min="1" max="400" value="15" required></label>
          <label>Contagem <select id="lgk-modo"><option value="uteis">Dias úteis (art. 219 CPC)</option><option value="corridos">Corridos</option></select></label>
          <label>Âmbito (feriados locais) <input id="lgk-amb" maxlength="20" value="nacional" placeholder="nacional, TJDFT…"></label>
        </div>
        <button class="btn peq" type="submit">Calcular</button>
        <div id="lgk-out"></div>
      </form></details>`;
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
        <p class="sub" id="lgz-calc-aviso"></p>
        <button class="btn" type="submit">Criar</button><p id="lgz-msg" class="erro"></p>
      </form></details>`;
    if (LG.perm.gerir_prazos) h += `<p><button class="btn secund peq" onclick="LG.importarLegado()">📥 Importar prazos do portal antigo</button></p>`;
    h += `<div class="aviso">⚠️ Prazo com cálculo sugerido automaticamente NÃO avança de status sem "validado por" (advogado humano).</div>`;
    h += `<div class="card">${prazos.length ? tabela(['Título', 'CNJ', 'Fatal', 'Interna', 'Prioridade', 'Status', 'Validação', ''], prazos.map(z => [
      esc(z.titulo), esc(z.numero_cnj || '—'), LG.dt(z.data_fatal), LG.dt(z.data_interna), LG.chip(z.prioridade), LG.chip(z.status),
      z.calculo_sugerido && !z.validado_por ? '⚠️ pendente' : (z.validado_por ? '✅ ' + esc(z.validado_por) : '—'),
      (LG.perm.gerir_prazos ? `<button class="btn secund peq" onclick="LG.mudarPrazo('${z.id}','${z.status}')">Status</button> ` : '')
      + (LG.perm.criar_documentos ? `<button class="btn secund peq" onclick="LG.peticionarDe('prazo','${z.id}')">✍️ Peticionar</button>` : ''),
    ])) : '<p class="vazio">Nenhum prazo em aberto.</p>'}</div>`;
    LG.body().innerHTML = h;
    const fc = document.getElementById('lg-calc-form');
    if (fc) fc.onsubmit = async (ev) => {
      ev.preventDefault(); const out = document.getElementById('lgk-out');
      try {
        const r = await LG.api('POST', '/prazos/calcular', {
          termo_inicial: document.getElementById('lgk-ini').value, dias: document.getElementById('lgk-dias').value,
          modo: document.getElementById('lgk-modo').value, ambito: document.getElementById('lgk-amb').value.trim() || 'nacional',
        });
        LG._calc = { log_id: r.log_id, memoria: r.memoria, resultado: r.resultado };
        out.innerHTML = `<div class="aviso">📌 Vencimento sugerido: <b>${LG.dt(r.resultado)}</b><br><span class="sub">${esc(r.memoria)}</span><br>
          <button class="btn peq" type="button" onclick="LG.usarCalculo()">Usar no novo prazo</button></div>`;
      } catch (e) { out.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
    };
    const f = document.getElementById('lg-prz-form');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault(); const msg = document.getElementById('lgz-msg'); msg.textContent = '';
      try {
        const usandoCalc = LG._calc && document.getElementById('lgz-fat').value === LG._calc.resultado;
        await LG.api('POST', '/prazos', {
          titulo: document.getElementById('lgz-tit').value, tipo: document.getElementById('lgz-tipo').value,
          data_interna: document.getElementById('lgz-int').value, data_fatal: document.getElementById('lgz-fat').value,
          prioridade: document.getElementById('lgz-pri').value, case_id: document.getElementById('lgz-case').value.trim(),
          // com cálculo automático: NÃO se auto-valida — a trava exige advogado depois
          calculo_sugerido: usandoCalc ? LG._calc.memoria : '',
          calculo_log_id: usandoCalc ? LG._calc.log_id : '',
          validado_por: usandoCalc ? '' : (ESTADO.me && ESTADO.me.nome),
        });
        LG._calc = null;
        LG.pintar();
      } catch (e) { msg.textContent = e.message; }
    };
  },
  usarCalculo() {
    if (!LG._calc) return;
    const box = document.getElementById('lg-prz-form'); if (box) box.closest('details').open = true;
    document.getElementById('lgz-tipo').value = 'fatal';
    document.getElementById('lgz-fat').value = LG._calc.resultado;
    document.getElementById('lgz-calc-aviso').textContent = '🧮 Data fatal veio da calculadora — o prazo será criado SEM validação (um advogado precisa validar antes de avançar).';
  },
  async importarLegado() {
    if (!confirm('Importar os prazos do portal antigo (prazos-juridicos.json) para o módulo? A operação é idempotente.')) return;
    try {
      const r = await LG.api('POST', '/importar/prazos-legado');
      alert(`Legado: ${r.encontrados} encontrados, ${r.importados} importados, ${r.pulados} já existiam.${r.detalhe ? '\n' + r.detalhe : ''}`);
      LG.pintar();
    } catch (e) { alert(e.message); }
  },
  async mudarPrazo(id, atual) {
    const novo = prompt('Novo status (' + (LG.enums.statusPrazo || []).join(', ') + '):', atual);
    if (!novo || novo === atual) return;
    try {
      await LG.api('PATCH', '/prazos/' + id, { status: novo.trim(), validado_por: ESTADO.me && ESTADO.me.nome });
      LG.pintar();
    } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- AGENDA (prazos + audiências + feriados)
  async vAgenda() {
    const ag = await LG.api('GET', '/agenda?dias=30');
    const { feriados } = await LG.api('GET', '/feriados?ano=' + ag.hoje.slice(0, 4));
    const hoje = ag.hoje;
    const linhaPrazo = (z) => {
      const data = z.data_fatal || z.data_interna;
      const atrasado = data && data < hoje;
      return `<tr${atrasado ? ' style="color:var(--alerta)"' : ''}><td>${LG.dt(data)}</td><td>⏰ ${z.tipo === 'fatal' ? '<b>FATAL</b>' : 'interno'}</td>
        <td>${esc(z.titulo)}${z.calculo_sugerido && !z.validado_por ? ' ⚠️ sem validação' : ''}</td><td>${esc(z.numero_cnj || '—')}</td><td>${LG.chip(z.status)}</td></tr>`;
    };
    const linhaAud = (a) => `<tr><td>${LG.dt(a.data_hora)} ${esc(String(a.data_hora).slice(11, 16))}</td><td>🏛️ audiência</td>
      <td>${esc(a.tipo)} (${esc(a.modalidade)}) — ${esc(a.juizo || a.local_link || '')}</td><td>${esc(a.numero_cnj || '—')}</td><td>${LG.chip(a.status)}</td></tr>`;
    const eventos = [...ag.prazos.map(z => ({ d: z.data_fatal || z.data_interna, html: linhaPrazo(z) })), ...ag.audiencias.map(a => ({ d: String(a.data_hora).slice(0, 10), html: linhaAud(a) }))]
      .sort((x, y) => String(x.d).localeCompare(String(y.d)));
    let h = `<div class="card"><h3>📅 Próximos 30 dias (${LG.dt(ag.hoje)} → ${LG.dt(ag.ate)})</h3>
      ${eventos.length ? `<table class="tabela"><thead><tr><th>Data</th><th>Tipo</th><th>O quê</th><th>CNJ</th><th>Status</th></tr></thead><tbody>${eventos.map(e => e.html).join('')}</tbody></table>` : '<p class="vazio">Nada agendado no período. 🎉</p>'}</div>`;
    h += `<div class="card"><h3>🗓️ Feriados forenses e suspensões (${ag.hoje.slice(0, 4)})</h3>
      <p class="sub">Base do cálculo de prazos. Nacionais + art. 220 CPC já semeados; feriados locais entram por âmbito (ex.: TJDFT).</p>
      ${feriados.length ? tabela(['Data', 'Âmbito', 'Descrição', 'Tipo', ''], feriados.map(f => [LG.dt(f.data), esc(f.ambito), esc(f.descricao), f.tipo === 'suspensao' ? '⏸️ suspensão' : '🎌 feriado',
        LG.perm.gerir_prazos && f.ambito !== 'nacional' ? `<button class="btn secund peq" onclick="LG.rmFeriado('${f.data}','${esc(f.ambito)}')">✕</button>` : ''])) : '<p class="vazio">Nenhum.</p>'}
      ${LG.perm.gerir_prazos ? `<form class="form" id="lg-fer-form" style="max-width:560px"><div class="hi-grid">
        <label>Data <input id="lgh-data" type="date" required></label>
        <label>Âmbito <input id="lgh-amb" maxlength="20" placeholder="TJDFT" required></label>
        <label>Descrição <input id="lgh-desc" maxlength="120" required></label>
        <label>Tipo <select id="lgh-tipo"><option value="feriado">Feriado</option><option value="suspensao">Suspensão</option></select></label></div>
        <button class="btn peq" type="submit">Adicionar feriado local</button></form>` : ''}</div>`;
    LG.body().innerHTML = h;
    const f = document.getElementById('lg-fer-form');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault();
      await LG.api('POST', '/feriados', { data: document.getElementById('lgh-data').value, ambito: document.getElementById('lgh-amb').value.trim(), descricao: document.getElementById('lgh-desc').value, tipo: document.getElementById('lgh-tipo').value });
      LG.pintar();
    };
  },
  async rmFeriado(data, ambito) {
    if (!confirm(`Remover ${data} (${ambito})?`)) return;
    await LG.api('DELETE', `/feriados?data=${encodeURIComponent(data)}&ambito=${encodeURIComponent(ambito)}`);
    LG.pintar();
  },

  // -------------------------------------------------------- AUDIÊNCIAS
  async vAudiencias() {
    const { audiencias } = await LG.api('GET', '/audiencias');
    let h = '';
    if (LG.perm.gerir_prazos) h += `<details class="cr-box"><summary class="cr-sum">➕ Nova audiência</summary>
      <form class="form" id="lg-aud-form" style="max-width:660px;margin-top:12px">
        <div class="hi-grid">
          <label>Data e hora * <input id="lga-dt" type="datetime-local" required></label>
          <label>Tipo ${LG.sel('lga-tipo', LG.enums.tipoAudiencia, 'conciliacao')}</label>
          <label>Modalidade ${LG.sel('lga-mod', LG.enums.modalidade, 'presencial')}</label>
          <label>Juízo <input id="lga-juizo" maxlength="160"></label>
        </div>
        <label>Local ou link <input id="lga-local" maxlength="300"></label>
        <label>ID do processo <input id="lga-case" maxlength="20"></label>
        <label>Roteiro (interno) <input id="lga-rot" maxlength="2000"></label>
        <button class="btn" type="submit">Agendar</button><p id="lga-msg" class="erro"></p>
      </form></details>`;
    h += `<div class="card">${audiencias.length ? tabela(['Quando', 'Tipo', 'Modalidade', 'Juízo', 'CNJ', 'Cliente', 'Status', ''], audiencias.map(a => [
      LG.dt(a.data_hora) + ' ' + esc(String(a.data_hora).slice(11, 16)), esc(a.tipo), esc(a.modalidade), esc(a.juizo || '—'),
      esc(a.numero_cnj || '—'), esc(a.cliente_nome || '—'), LG.chip(a.status),
      `<button class="btn secund peq" onclick="LG.verAudiencia('${a.id}')">Abrir</button>`,
    ])) : '<p class="vazio">Nenhuma audiência.</p>'}</div>`;
    LG.body().innerHTML = h;
    const f = document.getElementById('lg-aud-form');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault(); const msg = document.getElementById('lga-msg'); msg.textContent = '';
      try {
        await LG.api('POST', '/audiencias', {
          data_hora: document.getElementById('lga-dt').value, tipo: document.getElementById('lga-tipo').value,
          modalidade: document.getElementById('lga-mod').value, juizo: document.getElementById('lga-juizo').value,
          local_link: document.getElementById('lga-local').value, case_id: document.getElementById('lga-case').value.trim(),
          roteiro: document.getElementById('lga-rot').value,
        });
        LG.pintar();
      } catch (e) { msg.textContent = e.message; }
    };
  },
  async verAudiencia(id) {
    const { audiencia: a } = await LG.api('GET', '/audiencias/' + id);
    LG.body().innerHTML = `<div class="card"><button class="btn secund peq" onclick="LG.pintar()">← Voltar</button>
      <h3 style="margin:.6rem 0 0">🏛️ ${esc(a.tipo)} — ${LG.dt(a.data_hora)} ${esc(String(a.data_hora).slice(11, 16))} ${LG.chip(a.status)}</h3>
      <p class="sub">${esc(a.modalidade)} · ${esc(a.juizo || '')} · ${esc(a.local_link || '')} · Processo: ${esc(a.numero_cnj || '—')} · Cliente: ${esc(a.cliente_nome || '—')}</p>
      ${a.docs_necessarios ? `<p><b>Documentos necessários:</b> ${esc(a.docs_necessarios)}</p>` : ''}
      ${a.roteiro ? `<div class="aviso">📋 Roteiro (interno): ${esc(a.roteiro)}</div>` : ''}
      ${a.estrategia && a.estrategia !== '[restrito]' ? `<div class="aviso">🧠 Estratégia (sigilosa): ${esc(a.estrategia)}</div>` : ''}
      ${a.resultado ? `<p><b>Resultado:</b> ${esc(a.resultado)}</p>` : ''}
      ${LG.perm.gerir_prazos ? `<p><button class="btn secund peq" onclick="LG.mudarAudiencia('${a.id}','${a.status}')">Mudar status</button>
        <button class="btn secund peq" onclick="LG.resultadoAudiencia('${a.id}')">Registrar resultado</button></p>` : ''}</div>
      <div class="card"><h3>👥 Participantes</h3>
      ${a.participantes.length ? tabela(['Tipo', 'Nome', 'Intimado', 'Obs', ''], a.participantes.map(p => [esc(p.tipo), esc(p.nome), p.intimado ? '✅' : '—', esc(p.obs || ''),
        LG.perm.gerir_prazos ? `<button class="btn secund peq" onclick="LG.rmParticipante('${p.id}','${a.id}')">✕</button>` : ''])) : '<p class="vazio">Nenhum.</p>'}
      ${LG.perm.gerir_prazos ? `<form class="form" id="lg-part-form" style="max-width:560px"><div class="hi-grid">
        <label>Tipo <select id="lgpp-tipo"><option>testemunha</option><option>parte</option><option>advogado</option><option>preposto</option><option>perito</option><option>outro</option></select></label>
        <label>Nome <input id="lgpp-nome" maxlength="160" required></label></div>
        <label class="serv-ativo"><input type="checkbox" id="lgpp-int"> Já intimado</label>
        <button class="btn peq" type="submit">Adicionar</button></form>` : ''}</div>
      <div class="card"><h3>📌 Providências pós-audiência</h3>
      ${a.providencias.length ? tabela(['Descrição', 'Prazo', 'Status', 'Tarefa', ''], a.providencias.map(v => [esc(v.descricao), LG.dt(v.prazo), LG.chip(v.status), v.task_id ? '✅' : '—',
        LG.perm.gerir_prazos && v.status === 'pendente' ? `<button class="btn secund peq" onclick="LG.concluirProvidencia('${v.id}','${a.id}')">Concluir</button>` : ''])) : '<p class="vazio">Nenhuma.</p>'}
      ${LG.perm.gerir_prazos ? `<form class="form" id="lg-prov-form" style="max-width:560px">
        <label>Descrição <input id="lgpv-desc" maxlength="300" required></label>
        <div class="hi-grid"><label>Prazo <input id="lgpv-prazo" type="date"></label></div>
        <label class="serv-ativo"><input type="checkbox" id="lgpv-task" checked> Criar tarefa automaticamente</label>
        <button class="btn peq" type="submit">Registrar providência</button></form>` : ''}</div>`;
    const fp = document.getElementById('lg-part-form');
    if (fp) fp.onsubmit = async (ev) => {
      ev.preventDefault();
      await LG.api('POST', `/audiencias/${id}/participantes`, { tipo: document.getElementById('lgpp-tipo').value, nome: document.getElementById('lgpp-nome').value, intimado: document.getElementById('lgpp-int').checked });
      LG.verAudiencia(id);
    };
    const fv = document.getElementById('lg-prov-form');
    if (fv) fv.onsubmit = async (ev) => {
      ev.preventDefault();
      await LG.api('POST', `/audiencias/${id}/providencias`, { descricao: document.getElementById('lgpv-desc').value, prazo: document.getElementById('lgpv-prazo').value, criar_tarefa: document.getElementById('lgpv-task').checked });
      LG.verAudiencia(id);
    };
  },
  async mudarAudiencia(id, atual) {
    const novo = prompt('Novo status (' + (LG.enums.statusAudiencia || []).join(', ') + '):', atual);
    if (!novo || novo === atual) return;
    try { await LG.api('PATCH', '/audiencias/' + id, { status: novo.trim() }); LG.verAudiencia(id); } catch (e) { alert(e.message); }
  },
  async resultadoAudiencia(id) {
    const r = prompt('Resultado da audiência:');
    if (!r) return;
    try { await LG.api('PATCH', '/audiencias/' + id, { resultado: r, status: 'realizada' }); LG.verAudiencia(id); } catch (e) { alert(e.message); }
  },
  async rmParticipante(pid, hid) {
    await LG.api('DELETE', '/audiencias/participantes/' + pid);
    LG.verAudiencia(hid);
  },
  async concluirProvidencia(vid, hid) {
    await LG.api('PATCH', '/providencias/' + vid, { status: 'concluida' });
    LG.verAudiencia(hid);
  },

  // -------------------------------------------------------- PUBLICAÇÕES
  // Acervo: as NOVAS (sem triagem) em cima e as ANTERIORES logo abaixo, cada
  // uma abrindo a íntegra com UM clique. Nada de texto cortado em 80 caracteres
  // sem jeito de ler o resto.
  pubFiltro: { busca: '', fonte: '', status: '' },
  async vPublicacoes() {
    const f = LG.pubFiltro;
    const qs = new URLSearchParams({ limite: '300' });
    if (f.busca) qs.set('busca', f.busca);
    if (f.fonte) qs.set('fonte', f.fonte);
    if (f.status) qs.set('status', f.status);
    const { publicacoes, total, novas } = await LG.api('GET', '/publicacoes?' + qs.toString());

    const item = (p) => {
      const novo = p.status === 'nova';
      const tags = [LG.chip(p.status)];
      if (p.tem_prazo) tags.unshift('<span class="chip">⚠️ prazo</span>');
      if (p.movement_id) tags.push('<span class="chip">📌 no processo</span>');
      return `<button type="button" class="vx-acervo-item" data-novo="${novo ? 1 : 0}" onclick="LG.verPub('${p.id}')">
        <span class="vx-acervo-data">${LG.dt(p.data_publicacao)}<br><span class="vx-hint">${esc(p.fonte || '—')}</span></span>
        <span class="vx-acervo-corpo">
          <span class="vx-acervo-tit">${esc(p.orgao || 'Órgão não informado')}${p.numero_cnj ? ' · ' + esc(p.numero_cnj) : ''}</span>
          <span class="vx-acervo-txt">${esc(p.texto || '')}</span>
        </span>
        <span class="vx-acervo-tags">${tags.join(' ')}</span>
      </button>`;
    };
    const bloco = (titulo, sub, lista) => `<section class="vx-card">
      <div class="vx-card-head"><div><h2>${titulo} <span class="vx-hint">(${lista.length})</span></h2>
      <p class="vx-hint vx-mb0">${esc(sub)}</p></div></div>
      ${lista.length ? `<div class="vx-acervo">${lista.map(item).join('')}</div>` : '<p class="vazio">Nada aqui.</p>'}</section>`;

    const semTriagem = publicacoes.filter(p => p.status === 'nova');
    const anteriores = publicacoes.filter(p => p.status !== 'nova');
    const filtrando = !!(f.busca || f.fonte || f.status);

    let h = `<div class="aviso">📥 Publicações do DJEN/recortes entram pela coleta diária (ou cadastro manual) e ficam <b>guardadas aqui para sempre</b>.
      Clique em qualquer uma para ler a íntegra, vincular ao processo e salvar como andamento.</div>
      <section class="vx-card"><div class="hi-grid">
        <label>Buscar no texto/órgão <input id="lgp-busca" value="${esc(f.busca)}" placeholder="ex.: intimação, 0700123, TJDFT"></label>
        <label>Fonte <select id="lgp-fonte">${['', 'djen', 'diario-oficial', 'recorte', 'manual'].map(v => `<option value="${v}"${v === f.fonte ? ' selected' : ''}>${v || 'todas'}</option>`).join('')}</select></label>
        <label>Status <select id="lgp-status"><option value="">todos</option>${(LG.enums.statusPub || []).map(v => `<option value="${v}"${v === f.status ? ' selected' : ''}>${v.replace(/_/g, ' ')}</option>`).join('')}</select></label>
      </div>
      <div class="acoes"><button class="btn peq" onclick="LG.filtrarPub()">🔎 Filtrar</button>
        ${filtrando ? '<button class="btn secund peq" onclick="LG.limparFiltroPub()">✕ Limpar</button>' : ''}
        <span class="vx-hint">${total} publicação(ões) no acervo · ${novas} sem triagem</span></div></section>`;

    if (filtrando) {
      h += bloco('🔎 Resultado do filtro', 'Filtro ativo — limpe para voltar ao acervo completo.', publicacoes);
    } else {
      h += bloco('🆕 Novas (sem triagem)', 'Chegaram e ninguém abriu ainda. Abrir e classificar tira daqui.', semTriagem);
      h += bloco('📚 Anteriores', 'Todo o histórico já triado — continua acessível e pesquisável.', anteriores);
    }
    if (publicacoes.length >= 300) h += `<p class="vx-hint">Mostrando as 300 mais recentes. Use a busca para chegar às mais antigas.</p>`;
    LG.body().innerHTML = h;
    const b = document.getElementById('lgp-busca');
    if (b) b.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); LG.filtrarPub(); } };
  },
  filtrarPub() {
    LG.pubFiltro = {
      busca: (document.getElementById('lgp-busca') || {}).value || '',
      fonte: (document.getElementById('lgp-fonte') || {}).value || '',
      status: (document.getElementById('lgp-status') || {}).value || '',
    };
    LG.pintar();
  },
  limparFiltroPub() { LG.pubFiltro = { busca: '', fonte: '', status: '' }; LG.pintar(); },

  // ---- ficha da publicação: íntegra + vínculo + andamento + prazos ----
  async verPub(id) {
    const { publicacao: p } = await LG.api('GET', '/publicacoes/' + id);
    const linhas = [
      ['Data da publicação', LG.dt(p.data_publicacao)],
      ['Fonte', esc(p.fonte || '—')],
      ['Órgão', esc(p.orgao || '—')],
      ['Localizada por', esc(p.match_por || '—')],
      ['Processo vinculado', p.case_id ? `${esc(p.numero_cnj || p.case_id)}${p.case_assunto ? ' — ' + esc(p.case_assunto) : ''}` : (p.cnj_detectado ? `<span class="vx-hint">não vinculada (CNJ no texto: ${esc(p.cnj_detectado)} — processo não cadastrado)</span>` : '<span class="vx-hint">não vinculada</span>')],
      ['Coletada em', LG.dt(p.coletado_em)],
      ['Status', LG.chip(p.status) + (p.tem_prazo ? ' <span class="chip">⚠️ menciona prazo</span>' : '')],
    ];
    const andamento = p.andamento
      ? `<p class="vx-mb0">✅ Salva como andamento do processo em <b>${LG.dt(p.andamento.data)}</b> (${esc(p.andamento.classificacao || 'informativo')}).</p>`
      : `<p class="vx-mb0">Esta publicação ainda <b>não</b> foi salva como andamento.</p>
         <div class="acoes">
           ${p.case_id
             ? `<button class="btn peq" onclick="LG.pubParaAndamento('${p.id}')">📌 Salvar como andamento do processo</button>`
             : `<label style="flex:1;min-width:220px">Processo <select id="lgp-case"><option value="">— escolha o processo —</option></select></label>
                <button class="btn peq" onclick="LG.pubParaAndamento('${p.id}', true)">📌 Vincular e salvar como andamento</button>`}
         </div>`;

    LG.body().innerHTML = `<div class="acoes"><button class="btn secund peq" onclick="LG.pintar()">← Voltar às publicações</button>
      ${LG.perm.criar_documentos ? `<button class="btn peq" onclick="LG.peticionarDe('publicacao','${p.id}')">✍️ Peticionar a partir desta publicação</button>` : ''}</div>
      <section class="vx-card"><div class="vx-card-head"><div>
        <h2>📰 Publicação de ${LG.dt(p.data_publicacao)}</h2>
        <p class="vx-hint vx-mb0">${esc(p.orgao || 'Órgão não informado')}</p></div></div>
        ${linhas.map(([k, v]) => `<div class="kv"><span>${k}</span><div>${v}</div></div>`).join('')}
      </section>
      <section class="vx-card"><div class="vx-card-head"><div><h2>📄 Íntegra</h2>
        <p class="vx-hint vx-mb0">Texto como veio da fonte — é o que vale para conferir o prazo no sistema do tribunal.</p></div></div>
        <div class="vx-integra">${esc(p.texto || '')}</div></section>
      <section class="vx-card"><div class="vx-card-head"><div><h2>📌 Andamento do processo</h2></div></div>${andamento}</section>
      <section class="vx-card"><div class="vx-card-head"><div><h2>⏰ Prazos originados desta publicação</h2></div></div>
        ${p.prazos.length ? tabela(['Título', 'Tipo', 'Data fatal', 'Status', 'Validado por'], p.prazos.map(z => [
          esc(z.titulo), z.tipo === 'fatal' ? '<b>FATAL</b>' : 'interno', LG.dt(z.data_fatal || z.data_interna), LG.chip(z.status),
          z.validado_por ? esc(z.validado_por) : '<span class="chip">⚠️ sem validação</span>',
        ])) : '<p class="vazio">Nenhum prazo criado a partir desta publicação.</p>'}</section>
      <section class="vx-card"><div class="vx-card-head"><div><h2>🗂️ Triagem</h2>
        <p class="vx-hint vx-mb0">A publicação continua guardada em qualquer status — muda só onde ela aparece na lista.</p></div></div>
        <div class="acoes">${(LG.enums.statusPub || []).filter(v => v !== p.status)
          .map(v => `<button class="btn secund peq" onclick="LG.mudarPub('${p.id}','${v}')">${v.replace(/_/g, ' ')}</button>`).join('')}</div>
      </section>`;

    // seletor de processo (só quando falta vincular)
    const sel = document.getElementById('lgp-case');
    if (sel) {
      try {
        const { processos } = await LG.api('GET', '/processos?limite=300');
        sel.innerHTML = '<option value="">— escolha o processo —</option>' + processos.map(k =>
          `<option value="${k.id}"${p.cnj_detectado && k.numero_cnj === p.cnj_detectado ? ' selected' : ''}>${esc(k.numero_cnj || k.id)} — ${esc(k.assunto || k.classe || '')}</option>`).join('');
      } catch (_) { /* sem permissão de processos: o botão avisa ao salvar */ }
    }
  },
  async pubParaAndamento(id, comSelecao) {
    const sel = document.getElementById('lgp-case');
    const caseId = comSelecao ? (sel && sel.value) : '';
    if (comSelecao && !caseId) { LGUI.toast('Escolha o processo antes de salvar.', 'erro'); return; }
    try {
      const r = await LG.api('POST', `/publicacoes/${id}/andamento`, caseId ? { case_id: caseId } : {});
      LGUI.toast(r.duplicado ? 'Este andamento já constava no processo.' : 'Publicação salva como andamento do processo.', 'ok');
      LG.verPub(id);
    } catch (e) { LGUI.toast(e.message, 'erro'); }
  },
  async mudarPub(id, novo) {
    try {
      await LG.api('PATCH', '/publicacoes/' + id, { status: novo });
      LGUI.toast('Status: ' + novo.replace(/_/g, ' '), 'ok');
      LG.verPub(id);
    } catch (e) { LGUI.toast(e.message, 'erro'); }
  },

  // -------------------------------------------------------- PETICIONAR
  // Guia do Contencioso: sobe as cópias dos autos (viram contexto de verdade),
  // informa órgão/número/parte/tipo e manda o advogado sênior de IA redigir.
  async vPeticionar() {
    const e = await LG.api('GET', '/peticionar');
    const podeCriar = !!LG.perm.criar_documentos;
    let h = `<div class="aviso">✍️ <b>Peticionar</b>: anexe as <b>cópias do processo</b> (viram o contexto — o texto é extraído do PDF/DOCX),
      informe órgão, número, parte e tipo de petição, e o <b>agente jurídico especialista</b> redige a minuta.
      ${e.ia_direta ? 'IA no modo <b>direto</b> — a minuta volta na hora.' : 'IA no modo <b>fila</b> — o agente jurídico local devolve a minuta.'}
      Tudo sai carimbado <b>MINUTA</b>: revisão de advogado é obrigatória antes de protocolar.</div>`;
    if (podeCriar) {
      h += `<details class="cr-box" open><summary class="cr-sum">➕ Novo peticionamento</summary>
        <form class="form" id="lg-pet-form" style="max-width:760px;margin-top:12px">
          <label>Processo do sistema (opcional — preenche órgão, número e parte)
            <select id="lgq-case"><option value="">— peticionamento avulso (processo não cadastrado) —</option>
            ${e.processos.map(p => `<option value="${p.id}">${esc(p.numero_cnj || '(sem número)')} — ${esc((p.assunto || '').slice(0, 60))}</option>`).join('')}</select></label>
          <div class="hi-grid">
            <label>Tipo de petição * <select id="lgq-tipo" required><option value="">— escolha —</option>
              ${e.tipos.map(t => `<option value="${t}">${t.replace(/-/g, ' ')}</option>`).join('')}</select></label>
            <label>Número do processo <input id="lgq-num" maxlength="60" placeholder="0700123-45.2026.8.07.0001"></label>
          </div>
          <label>Órgão / juízo * <input id="lgq-orgao" maxlength="200" placeholder="3ª Vara Cível de Brasília — TJDFT"></label>
          <div class="hi-grid">
            <label>Nome da parte representada * <input id="lgq-parte" maxlength="200"></label>
            <label>Polo <select id="lgq-polo"><option value="">—</option><option value="ativo">ativo</option><option value="passivo">passivo</option><option value="terceiro">terceiro</option></select></label>
          </div>
          <label>Objetivo da peça <input id="lgq-obj" maxlength="1000" placeholder="ex.: contestar alegando prescrição e ausência de dano"></label>
          <button class="btn" type="submit">Abrir peticionamento</button><p id="lgq-msg" class="erro"></p>
        </form></details>`;
    }
    h += `<section class="vx-card"><div class="vx-card-head"><div><h2>📋 Peticionamentos</h2>
      <p class="vx-hint vx-mb0">Clique para anexar cópias, ajustar os dados e gerar a minuta.</p></div></div>
      ${e.peticionamentos.length ? `<div class="vx-acervo">${e.peticionamentos.map(p => `
        <button type="button" class="vx-acervo-item" data-novo="${p.status === 'rascunho' && !p.draft_id ? 1 : 0}" onclick="LG.verPeticionamento('${p.id}')">
          <span class="vx-acervo-data">${LG.dt(p.criado_em)}<br><span class="vx-hint">${esc((p.tipo_peca || 'sem tipo').replace(/-/g, ' '))}</span></span>
          <span class="vx-acervo-corpo">
            <span class="vx-acervo-tit">${esc(p.orgao || 'Órgão a definir')}${p.numero_processo || p.numero_cnj ? ' · ' + esc(p.numero_processo || p.numero_cnj) : ''}</span>
            <span class="vx-acervo-txt">${esc(p.parte || 'Parte a definir')} · ${p.copias} cópia(s) de contexto</span>
          </span>
          <span class="vx-acervo-tags">${LG.chip(p.status)}${p.draft_id ? '<span class="chip">📝 minuta</span>' : ''}</span>
        </button>`).join('')}</div>` : '<p class="vazio">Nenhum peticionamento ainda.</p>'}</section>`;
    LG.body().innerHTML = h;
    const f = document.getElementById('lg-pet-form');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault(); const msg = document.getElementById('lgq-msg'); msg.textContent = '';
      try {
        const r = await LG.api('POST', '/peticionar', {
          case_id: document.getElementById('lgq-case').value, tipo_peca: document.getElementById('lgq-tipo').value,
          numero_processo: document.getElementById('lgq-num').value, orgao: document.getElementById('lgq-orgao').value,
          parte: document.getElementById('lgq-parte').value, polo: document.getElementById('lgq-polo').value,
          objetivo: document.getElementById('lgq-obj').value,
        });
        LG.verPeticionamento(r.peticionamento.id);
      } catch (er) { msg.textContent = er.message; }
    };
  },

  async verPeticionamento(id) {
    const { peticionamento: p } = await LG.api('GET', '/peticionar/' + id);
    const e = await LG.api('GET', '/peticionar');
    const podeCriar = !!LG.perm.criar_documentos;
    const copias = p.copias.map(c => {
      const ok = c.caracteres > 0;
      return [
        esc(c.titulo),
        ok ? `${(c.caracteres / 1000).toFixed(1)} mil caracteres` : '<span style="color:var(--vx-danger)">sem texto extraído</span>',
        esc(c.metodo || '—'),
        podeCriar ? `<button class="btn secund peq" onclick="LG.tirarCopia('${p.id}','${c.id}')">✕ tirar do contexto</button>` : '',
      ];
    });
    LG.body().innerHTML = `<div class="acoes"><button class="btn secund peq" onclick="LG.pintar()">← Voltar aos peticionamentos</button></div>
      <section class="vx-card"><div class="vx-card-head"><div>
        <h2>✍️ ${esc((p.tipo_peca || 'petição').replace(/-/g, ' '))} ${LG.chip(p.status)}</h2>
        <p class="vx-hint vx-mb0">${esc(p.orgao || 'órgão a definir')} · ${esc(p.numero_processo || p.numero_cnj || 'sem número')}</p></div></div>
        ${p.detalhe ? `<p class="vx-hint">${esc(p.detalhe)}</p>` : ''}
        <form class="form" id="lg-pet-ed" style="max-width:760px">
          <div class="hi-grid">
            <label>Tipo de petição <select id="lgw-tipo">${e.tipos.map(t => `<option value="${t}"${t === p.tipo_peca ? ' selected' : ''}>${t.replace(/-/g, ' ')}</option>`).join('')}</select></label>
            <label>Número do processo <input id="lgw-num" maxlength="60" value="${esc(p.numero_processo || '')}"></label>
          </div>
          <label>Órgão / juízo <input id="lgw-orgao" maxlength="200" value="${esc(p.orgao || '')}"></label>
          <div class="hi-grid">
            <label>Nome da parte <input id="lgw-parte" maxlength="200" value="${esc(p.parte || '')}"></label>
            <label>Polo <select id="lgw-polo">${['', 'ativo', 'passivo', 'terceiro'].map(v => `<option value="${v}"${v === p.polo ? ' selected' : ''}>${v || '—'}</option>`).join('')}</select></label>
          </div>
          <label>Objetivo da peça <input id="lgw-obj" maxlength="1000" value="${esc(p.objetivo || '')}"></label>
          <label>Advogado sênior (especialista) <select id="lgw-ag"><option value="">— sugerido: ${esc(p.especialista_sugerido || 'processo-civil')} —</option>
            ${e.especialistas.map(a => `<option value="${a.id}"${a.id === p.agente ? ' selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></label>
          ${podeCriar ? '<button class="btn secund peq" type="submit">Salvar dados</button>' : ''}<p id="lgw-msg" class="erro"></p>
        </form></section>

      <section class="vx-card"><div class="vx-card-head"><div><h2>📎 Cópias do processo (contexto)</h2>
        <p class="vx-hint vx-mb0">O texto é extraído na hora e vira a base factual da peça. PDF escaneado não tem texto — nesse caso cole o conteúdo.</p></div></div>
        ${p.copias.length ? tabela(['Arquivo', 'Texto extraído', 'Método', ''], copias) : '<p class="vazio">Nenhuma cópia anexada. Sem cópias, a IA só tem os dados digitados.</p>'}
        <p class="vx-hint">Contexto atual: <b>${(p.contexto_caracteres / 1000).toFixed(1)} mil caracteres</b>.</p>
        ${podeCriar ? `<div class="hi-grid" style="margin-top:10px">
          <label>Anexar cópia (PDF, DOCX, TXT — até 10 MB) <input id="lgw-arq" type="file" accept=".pdf,.docx,.odt,.txt,.md,.csv,.xlsx"></label>
          <label>Título (opcional) <input id="lgw-tit" maxlength="200" placeholder="ex.: petição inicial e documentos"></label>
        </div>
        <div class="acoes"><button class="btn peq" onclick="LG.subirCopia('${p.id}')">📎 Anexar e extrair texto</button></div>
        <details class="cr-box" style="margin-top:10px"><summary class="cr-sum">⌨️ Colar texto (PDF escaneado ou trecho dos autos)</summary>
          <div style="padding:0 16px 16px">
            <label>Título <input id="lgw-ctit" maxlength="200" placeholder="ex.: sentença (fls. 210-218)"></label>
            <label>Texto <textarea id="lgw-ctexto" rows="7" placeholder="Cole aqui o conteúdo da cópia..."></textarea></label>
            <button class="btn peq" onclick="LG.colarCopia('${p.id}')">Adicionar ao contexto</button>
          </div></details>` : ''}
      </section>

      <section class="vx-card"><div class="vx-card-head"><div><h2>🤖 Gerar a minuta</h2>
        <p class="vx-hint vx-mb0">O especialista escolhido redige lendo as cópias. A peça nasce como MINUTA e não pode ser aprovada nem protocolada pela IA.</p></div></div>
        ${p.peca ? (p.peca.versao_atual
          ? `<p class="vx-mb0">📝 Minuta pronta — <b>v${p.peca.versao_atual}</b>, status ${LG.chip(p.peca.status)}.
              <span class="vx-hint">${esc(p.peca.pontos_atencao || '')}</span></p>`
          : `<p class="vx-mb0">⏳ Peça criada e <b>na fila do agente jurídico local</b> — a minuta aparece aqui quando ele responder.</p>`)
          + `<div class="acoes"><button class="btn peq" onclick="LG.verPeca('${p.draft_id}')">Abrir a peça</button>
          ${podeCriar ? `<button class="btn secund peq" onclick="LG.gerarPeticao('${p.id}')">↻ ${p.peca.versao_atual ? 'Gerar nova versão' : 'Reenviar'}</button>` : ''}</div>`
        : (podeCriar ? `<div class="acoes"><button class="btn" onclick="LG.gerarPeticao('${p.id}')">✍️ Redigir minuta com o advogado sênior</button></div>`
          : '<p class="vazio">Sem permissão para gerar peças.</p>')}
        <p id="lgw-ger" class="sub"></p></section>`;

    const fe = document.getElementById('lg-pet-ed');
    if (fe) fe.onsubmit = async (ev) => {
      ev.preventDefault();
      try { await LG.salvarPeticionamento(id); LGUI.toast('Dados salvos.', 'ok'); }
      catch (er) { document.getElementById('lgw-msg').textContent = er.message; }
    };
  },
  _dadosPeticao() {
    return {
      tipo_peca: (document.getElementById('lgw-tipo') || {}).value || '',
      numero_processo: (document.getElementById('lgw-num') || {}).value || '',
      orgao: (document.getElementById('lgw-orgao') || {}).value || '',
      parte: (document.getElementById('lgw-parte') || {}).value || '',
      polo: (document.getElementById('lgw-polo') || {}).value || '',
      objetivo: (document.getElementById('lgw-obj') || {}).value || '',
      agente: (document.getElementById('lgw-ag') || {}).value || '',
    };
  },
  async salvarPeticionamento(id) { await LG.api('PATCH', '/peticionar/' + id, LG._dadosPeticao()); },
  // atalho a partir do ato que gerou a necessidade da peça: publicação, prazo
  // ou processo. Já abre com órgão/número/parte e com o TEXTO do ato no contexto.
  async peticionarDe(tipo, id) {
    try {
      const corpo = tipo === 'processo' ? { case_id: id } : { origem: { tipo, id } };
      const r = await LG.api('POST', '/peticionar', corpo);
      LG.tab = 'peticionar';
      LGUI.toast('Peticionamento aberto — confira os dados e o contexto.', 'ok');
      LG.render();
      LG.verPeticionamento(r.peticionamento.id);
    } catch (e) { LGUI.toast(e.message, 'erro'); }
  },
  async subirCopia(id) {
    const arq = (document.getElementById('lgw-arq') || {}).files && document.getElementById('lgw-arq').files[0];
    if (!arq) { LGUI.toast('Escolha um arquivo.', 'erro'); return; }
    if (arq.size > 10 * 1024 * 1024) { LGUI.toast('Arquivo acima de 10 MB.', 'erro'); return; }
    LGUI.toast('Enviando e extraindo o texto…');
    try {
      const r = await LG.api('POST', `/peticionar/${id}/copias`, {
        titulo: (document.getElementById('lgw-tit') || {}).value || '', nome_original: arq.name,
        mime: arq.type, base64: await arquivoParaBase64(arq),
      });
      LGUI.toast(r.ocr_pendente ? r.detalhe : `Cópia anexada: ${(r.caracteres / 1000).toFixed(1)} mil caracteres de contexto.`, r.ocr_pendente ? 'erro' : 'ok');
      LG.verPeticionamento(id);
    } catch (er) { LGUI.toast(er.message, 'erro'); }
  },
  async colarCopia(id) {
    const texto = (document.getElementById('lgw-ctexto') || {}).value || '';
    try {
      const r = await LG.api('POST', `/peticionar/${id}/texto`, { titulo: (document.getElementById('lgw-ctit') || {}).value || '', texto });
      LGUI.toast(`Texto adicionado: ${(r.caracteres / 1000).toFixed(1)} mil caracteres.`, 'ok');
      LG.verPeticionamento(id);
    } catch (er) { LGUI.toast(er.message, 'erro'); }
  },
  async tirarCopia(id, docId) {
    await LG.api('DELETE', `/peticionar/${id}/copias/${docId}`);
    LGUI.toast('Cópia fora do contexto (o arquivo continua arquivado).', 'ok');
    LG.verPeticionamento(id);
  },
  async gerarPeticao(id) {
    const alvo = document.getElementById('lgw-ger');
    if (alvo) alvo.textContent = '✍️ Redigindo… peça longa pode levar um minuto.';
    try {
      const r = await LG.api('POST', `/peticionar/${id}/gerar`, LG._dadosPeticao());
      LGUI.toast(r.situacao === 'gerada'
        ? `Minuta v${r.versao} redigida por ${r.especialista} (${r.copias_usadas} cópia(s)).`
        : 'Pedido na fila do agente jurídico local.', 'ok');
      LG.verPeticionamento(id);
    } catch (er) {
      if (alvo) alvo.textContent = '';
      LGUI.toast(er.message, 'erro');
    }
  },

  // -------------------------------------------------------- TAREFAS
  async vTarefas() {
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
    // Kanban jurídico (Fase 2): colunas por status, mover com ◀ ▶ (histórico fica em task_status_history)
    const { colunas } = await LG.api('GET', '/tarefas/kanban');
    const ordem = ['aberta', 'em_andamento', 'em_revisao', 'concluida'];
    const rotulos = { aberta: '📥 Abertas', em_andamento: '🔧 Em andamento', em_revisao: '👀 Em revisão', concluida: '✅ Concluídas (últimas 15)' };
    const hoje = new Date().toISOString().slice(0, 10);
    const cartao = (t, col) => {
      const i = ordem.indexOf(col);
      const atrasada = t.prazo && t.prazo < hoje && col !== 'concluida';
      return `<div class="card" style="padding:.5rem;margin:.4rem 0${atrasada ? ';border-color:var(--alerta)' : ''}">
        <b>${esc(t.titulo)}</b><br><span class="sub">${t.prazo ? (atrasada ? '⚠️ ' : '📅 ') + LG.dt(t.prazo) + ' · ' : ''}${esc(t.numero_cnj || '')} ${LG.chip(t.prioridade)}</span><br>
        ${i > 0 ? `<button class="btn secund peq" onclick="LG.moverTarefa('${t.id}','${ordem[i - 1]}')">◀ ${ordem[i - 1].replace(/_/g, ' ')}</button> ` : ''}
        ${i < 3 ? `<button class="btn secund peq" onclick="LG.moverTarefa('${t.id}','${ordem[i + 1]}')">${ordem[i + 1].replace(/_/g, ' ')} ▶</button>` : ''}
      </div>`;
    };
    h += `<div style="display:flex;gap:.6rem;align-items:flex-start;overflow-x:auto">` + ordem.map(col => `
      <div style="flex:1;min-width:220px"><div class="card" style="background:#f7f7f4"><b>${rotulos[col]}</b> <span class="sub">(${colunas[col].length})</span>
        ${colunas[col].map(t => cartao(t, col)).join('') || '<p class="vazio">—</p>'}</div></div>`).join('') + `</div>`;
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
  async moverTarefa(id, novo) {
    try { await LG.api('PATCH', '/tarefas/' + id, { status: novo }); LG.pintar(); } catch (e) { alert(e.message); }
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
      `<a class="btn secund peq" href="${LG.hrefBase}/documentos/${d.id}/download">⬇️</a> ` +
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

  // -------------------------------------------------------- PEÇAS (Fase 4)
  async vPecas() {
    const { pecas, tipos } = await LG.api('GET', '/pecas');
    let h = '';
    if (LG.perm.criar_documentos) h += `<details class="cr-box"><summary class="cr-sum">➕ Nova peça</summary>
      <form class="form" id="lg-pec-form" style="max-width:660px;margin-top:12px">
        <div class="hi-grid">
          <label>Tipo <select id="lgp2-tipo">${tipos.map(t => `<option>${t}</option>`).join('')}</select></label>
          <label>ID do processo (opcional) <input id="lgp2-case" maxlength="20"></label>
        </div>
        <label>Objetivo <input id="lgp2-obj" maxlength="500" placeholder="ex.: contestar ação de despejo alegando..."></label>
        <button class="btn" type="submit">Criar</button></form></details>`;
    h += `<div class="aviso">📝 Peça gerada por IA é sempre MINUTA: não protocola nem vai ao cliente sem aprovação de advogado.</div>`;
    h += `<div class="card">${pecas.length ? tabela(['Tipo', 'Objetivo', 'CNJ', 'Cliente', 'v', 'Status', 'IA', ''], pecas.map(p => [
      esc(p.tipo_peca), esc((p.objetivo || '').slice(0, 50)), esc(p.numero_cnj || '—'), esc(p.cliente_nome || '—'),
      p.versoes ? 'v' + p.versoes : '—', LG.chip(p.status), p.gerado_por_ia ? '🤖' : '—',
      `<button class="btn secund peq" onclick="LG.verPeca('${p.id}')">Abrir</button>`,
    ])) : '<p class="vazio">Nenhuma peça.</p>'}</div>`;
    LG.body().innerHTML = h;
    const f = document.getElementById('lg-pec-form');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault();
      const r = await LG.api('POST', '/pecas', { tipo_peca: document.getElementById('lgp2-tipo').value, objetivo: document.getElementById('lgp2-obj').value, case_id: document.getElementById('lgp2-case').value.trim() });
      LG.verPeca(r.peca.id);
    };
  },
  async verPeca(id) {
    const { peca: p } = await LG.api('GET', '/pecas/' + id);
    const podeAprovar = LG.perm.aprovar_documentos;
    LG.body().innerHTML = `<div class="card"><button class="btn secund peq" onclick="LG.pintar()">← Voltar</button>
      <h3 style="margin:.6rem 0 0">📝 ${esc(p.tipo_peca)} ${LG.chip(p.status)} ${p.gerado_por_ia ? '🤖 assistida por IA' : ''}</h3>
      <p class="sub">${esc(p.objetivo || '')} · ${esc(p.numero_cnj || '')} ${p.cliente_nome ? '· ' + esc(p.cliente_nome) : ''} · ${p.versao_atual ? 'v' + p.versao_atual : 'sem conteúdo'} ${p.aprovado_por ? '· ✅ aprovada por ' + esc(p.aprovado_por) : ''}</p>
      <p>
        ${LG.perm.usar_ia ? `<button class="btn peq" onclick="LG.gerarPeca('${p.id}')">🤖 Gerar minuta com IA</button>` : ''}
        ${p.versao_atual ? `<a class="btn secund peq" href="${LG.hrefBase}/pecas/${p.id}/exportar?formato=html" target="_blank" rel="noopener">🖨️ HTML/PDF</a>
        <a class="btn secund peq" href="${LG.hrefBase}/pecas/${p.id}/exportar?formato=doc">⬇️ Word (.doc)</a>` : ''}
        ${p.status === 'rascunho' || p.status === 'revisao_pendente' ? `
          ${podeAprovar && p.versao_atual ? `<button class="btn peq" onclick="LG.statusPeca('${p.id}','aprovado')">✅ Aprovar</button>` : ''}
          <button class="btn secund peq" onclick="LG.statusPeca('${p.id}','revisao_pendente')">👀 Enviar p/ revisão</button>` : ''}
        ${p.status === 'aprovado' ? `
          ${LG.perm.protocolar ? `<button class="btn peq" onclick="LG.statusPeca('${p.id}','protocolado')">📤 Protocolada</button>` : ''}
          ${LG.perm.enviar_cliente ? `<button class="btn secund peq" onclick="LG.statusPeca('${p.id}','enviado_cliente')">✉️ Enviada ao cliente</button>` : ''}` : ''}
      </p>
      <p class="sub" id="lgp2-msg"></p></div>
      ${p.pontos_atencao ? `<div class="aviso">⚠️ Pontos de atenção: ${esc(p.pontos_atencao)}</div>` : ''}
      <div class="card"><h3>Conteúdo ${p.versao_atual ? '(v' + p.versao_atual + ')' : ''}</h3>
      ${p.conteudo ? `<pre style="white-space:pre-wrap;font-size:.9rem;max-height:420px;overflow:auto;background:#faf9f6;padding:12px;border-radius:8px">${esc(p.conteudo)}</pre>` : '<p class="vazio">Sem conteúdo ainda — gere com IA ou cole uma versão abaixo.</p>'}
      ${LG.perm.editar_documentos ? `<form class="form" id="lg-ver-form">
        <label>Nova versão (colar texto integral) <textarea id="lgv-txt" rows="5" style="width:100%"></textarea></label>
        <button class="btn peq" type="submit">Salvar versão</button></form>` : ''}</div>
      ${(p.fontes || []).length ? `<div class="card"><h3>📚 Fontes</h3>${tabela(['Tipo', 'Referência'], p.fontes.map(f => [esc(f.tipo || '—'), esc(f.citacao || f.titulo || JSON.stringify(f).slice(0, 80))]))}</div>` : ''}
      <div class="card"><h3>Versões</h3>${p.versoes.length ? tabela(['v', 'Por', 'Quando'], p.versoes.map(v => ['v' + v.versao, esc(v.criado_por), LG.dt(v.criado_em)])) : '<p class="vazio">Nenhuma.</p>'}</div>`;
    const f = document.getElementById('lg-ver-form');
    if (f) f.onsubmit = async (ev) => {
      ev.preventDefault();
      await LG.api('POST', `/pecas/${id}/versoes`, { conteudo: document.getElementById('lgv-txt').value });
      LG.verPeca(id);
    };
  },
  async gerarPeca(id) {
    const msg = document.getElementById('lgp2-msg');
    msg.textContent = '🧠 Gerando minuta (modo direto pode levar 1-2 min; sem chave vai para a fila)…';
    try {
      const r = await LG.api('POST', `/pecas/${id}/gerar`);
      if (r.situacao === 'gerada') { LG.verPeca(id); return; }
      msg.textContent = '⏳ ' + (r.detalhe || 'Pedido na fila do agente local.');
    } catch (e) { msg.textContent = '❌ ' + e.message; }
  },
  async statusPeca(id, novo) {
    try { await LG.api('PATCH', '/pecas/' + id, { status: novo }); LG.verPeca(id); } catch (e) { alert(e.message); }
  },

  // -------------------------------------------------------- CONTRATOS (Fase 4)
  async vContratos() {
    const [{ templates }, { analises }] = await Promise.all([
      LG.api('GET', '/contratos/templates'), LG.api('GET', '/contratos/analises'),
    ]);
    LG._tpls = templates;
    let h = `<details class="cr-box" open><summary class="cr-sum">🧙 Gerar contrato (wizard)</summary>
      <form class="form" id="lg-wiz-form" style="max-width:660px;margin-top:12px">
        <label>Modelo <select id="lgw-tpl" onchange="LG.wizardCampos()">${templates.map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('')}</select></label>
        <div id="lgw-campos"></div>
        <button class="btn" type="submit">Gerar minuta</button><p id="lgw-msg" class="erro"></p>
      </form></details>`;
    if (LG.perm.usar_ia) h += `<details class="cr-box"><summary class="cr-sum">🔬 Analisar contrato (documento)</summary>
      <form class="form" id="lg-ana-form" style="max-width:560px;margin-top:12px">
        <label>ID do documento (aba Documentos, tipo contrato) <input id="lga2-doc" required maxlength="20"></label>
        <p class="sub">O documento precisa de texto extraído (o agente local extrai via /ia/extracao).</p>
        <button class="btn peq" type="submit">Analisar</button><p id="lga2-msg" class="sub"></p></form></details>`;
    if (LG.perm.criar_documentos) h += `<p><button class="btn secund peq" onclick="LG.importarContratosLegado()">📥 Importar contratos do portal antigo</button></p>`;
    h += `<div class="card"><h3>Análises de contrato</h3>${analises.length ? tabela(['Documento', 'Partes', 'Nota', 'Status', ''], analises.map(a => [
      esc(a.documento_titulo || a.document_id || '—'), esc((a.partes || '—').slice(0, 40)),
      a.analise ? LG.chip(a.analise.nota_risco) : '—', LG.chip(a.status),
      `<button class="btn secund peq" onclick="LG.verAnalise('${a.id}')">Abrir</button>`,
    ])) : '<p class="vazio">Nenhuma análise.</p>'}</div>`;
    LG.body().innerHTML = h;
    LG.wizardCampos();
    document.getElementById('lg-wiz-form').onsubmit = async (ev) => {
      ev.preventDefault(); const msg = document.getElementById('lgw-msg'); msg.textContent = '';
      const t = LG._tpls.find(x => x.id === document.getElementById('lgw-tpl').value);
      const respostas = {};
      for (const c of t.campos) respostas[c.id] = (document.getElementById('lgw-' + c.id) || {}).value || '';
      const opcionais = [...document.querySelectorAll('.lgw-opc:checked')].map(x => x.value);
      try {
        const r = await LG.api('POST', '/contratos/gerar', { template_id: t.id, respostas, clausulas_opcionais: opcionais });
        LG.verPeca(r.draft_id);
      } catch (e) { msg.textContent = e.message; }
    };
    const fa = document.getElementById('lg-ana-form');
    if (fa) fa.onsubmit = async (ev) => {
      ev.preventDefault(); const msg = document.getElementById('lga2-msg');
      msg.textContent = 'Analisando…';
      try {
        const r = await LG.api('POST', '/contratos/analises', { document_id: document.getElementById('lga2-doc').value.trim() });
        if (r.situacao === 'analisada') { LG.verAnalise(r.review_id); return; }
        msg.textContent = '⏳ ' + (r.detalhe || 'Análise na fila.');
      } catch (e) { msg.textContent = '❌ ' + e.message; }
    };
  },
  wizardCampos() {
    const t = (LG._tpls || []).find(x => x.id === document.getElementById('lgw-tpl').value);
    const alvo = document.getElementById('lgw-campos'); if (!t || !alvo) return;
    alvo.innerHTML = `<p class="sub">${esc(t.descricao)}</p><div class="hi-grid">`
      + t.campos.map(c => `<label>${esc(c.rotulo)}${c.obrigatorio ? ' *' : ''} <input id="lgw-${c.id}" type="${c.tipo === 'date' ? 'date' : 'text'}" maxlength="300"></label>`).join('')
      + `</div>` + (t.clausulas.some(c => !c.obrigatoria) ? `<p><b>Cláusulas opcionais:</b></p>`
      + t.clausulas.filter(c => !c.obrigatoria).map(c => `<label class="serv-ativo"><input type="checkbox" class="lgw-opc" value="${c.id}" checked> ${esc(c.titulo)}</label>`).join('') : '');
  },
  async verAnalise(id) {
    const { analise: a } = await LG.api('GET', '/contratos/analises/' + id);
    const x = a.analise;
    LG.body().innerHTML = `<div class="card"><button class="btn secund peq" onclick="LG.pintar()">← Voltar</button>
      <h3 style="margin:.6rem 0 0">🔬 Análise — ${esc(a.documento_titulo || a.document_id)} ${LG.chip(a.status)} ${x ? LG.chip('risco ' + x.nota_risco) : ''}</h3>
      ${a.revisado_por ? `<p class="sub">✅ revisada por ${esc(a.revisado_por)}</p>` : '<div class="aviso">⚠️ Análise assistida por IA — validação por advogado obrigatória.</div>'}
      ${LG.perm.aprovar_documentos && a.status === 'revisao_pendente' ? `<p><button class="btn peq" onclick="LG.revisarAnalise('${a.id}','aprovado')">✅ Validar análise</button></p>` : ''}</div>
      ${x ? `<div class="card"><p><b>Partes:</b> ${esc((x.partes || []).join(' × '))}</p><p><b>Objeto:</b> ${esc(x.objeto)}</p>
        <p><b>Vigência:</b> ${esc(x.vigencia)} · <b>Valores:</b> ${esc(x.valores)}</p><p><b>Riscos gerais:</b> ${esc(x.riscos_gerais)}</p></div>
      <div class="card"><h3>⚠️ Cláusulas críticas</h3>${(x.clausulas_criticas || []).length ? tabela(['Cláusula', 'Risco', 'Sugestão'], x.clausulas_criticas.map(c => [esc(c.clausula), esc(c.risco), esc(c.sugestao)])) : '<p class="vazio">Nenhuma.</p>'}</div>
      <div class="card"><h3>❌ Cláusulas faltantes</h3>${(x.clausulas_faltantes || []).length ? '<ul>' + x.clausulas_faltantes.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>' : '<p class="vazio">Nenhuma.</p>'}</div>` : '<div class="card"><p class="vazio">Análise ainda pendente (fila do agente local ou documento sem texto extraído).</p></div>'}`;
  },
  async revisarAnalise(id, status) {
    try { await LG.api('PATCH', '/contratos/analises/' + id, { status }); LG.verAnalise(id); } catch (e) { alert(e.message); }
  },
  async importarContratosLegado() {
    if (!confirm('Importar os contratos do portal antigo (contratos.json + arquivos) como documentos? Operação idempotente.')) return;
    try {
      const r = await LG.api('POST', '/importar/contratos-legado');
      alert(`Contratos legado: ${r.encontrados} encontrados, ${r.importados} importados, ${r.pulados} já existiam.${r.detalhe ? '\n' + r.detalhe : ''}`);
      LG.pintar();
    } catch (e) { alert(e.message); }
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

  // -------------------------------------------------------- RELATÓRIOS (Fase 6)
  async vRelatorios() {
    const v = await LG.api('GET', '/relatorios/socio');
    const kpi = (rot, val, alerta) => `<div class="card" style="min-width:150px;flex:1${alerta && val && val !== 'R$ 0,00' ? ';border-color:var(--alerta)' : ''}"><div class="sub">${rot}</div><div style="font-size:1.4rem;font-weight:700">${val}</div></div>`;
    let h = `<div class="card" style="display:flex;flex-wrap:wrap;gap:.4rem;align-items:center">
      <a class="btn peq" href="${LG.hrefBase}/relatorios/socio/exportar" target="_blank" rel="noopener">🖨️ Relatório do sócio (HTML/PDF)</a>
      <select id="lgr-nucleo"><option value="">— núcleo —</option>${LG.nucleos.map(n => `<option>${n}</option>`).join('')}</select>
      <button class="btn secund peq" onclick="LG.verNucleo()">Ver núcleo</button>
      <button class="btn secund peq" onclick="LG.verFinanceiroRel()">💰 Financeiro</button>
      <input id="lgr-cli" placeholder="ID do cliente" maxlength="20" style="width:130px">
      <button class="btn secund peq" onclick="LG.verPrestacao()">Prestação de contas</button>
      <button class="btn secund peq" onclick="LG.verGerados()">🗄️ Gerados</button></div>`;
    h += `<div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
      ${kpi('Processos ativos', v.processos.ativos)}${kpi('Prazos vencidos', v.prazos.vencidos, true)}
      ${kpi('Prazos 7 dias', v.prazos.proximos_7d)}${kpi('A receber', LG.brl(v.financeiro.a_receber))}
      ${kpi('Inadimplência', LG.brl(v.financeiro.inadimplencia), true)}${kpi('Margem', LG.brl(v.financeiro.margem))}</div>`;
    h += `<div id="lgr-corpo">
      <div class="card"><h3>⏰ Prazos críticos (7 dias)</h3>${v.prazos.criticos.length ? tabela(['Fatal', 'Título', 'CNJ', 'Prioridade'], v.prazos.criticos.map(z => [LG.dt(z.data_fatal), esc(z.titulo), esc(z.numero_cnj || '—'), LG.chip(z.prioridade)])) : '<p class="vazio">Nenhum. 🎉</p>'}</div>
      <div class="card"><h3>⚖️ Risco da carteira</h3>${tabela(['Risco', 'Processos', 'Valor em causa'], v.processos.risco_carteira.map(r => [esc(r.risco), r.n, LG.brl(r.valor)]))}</div>
      <div class="card"><h3>🏢 Por núcleo</h3>${tabela(['Núcleo', 'Ativos'], v.processos.por_nucleo.map(x => [esc(x.nucleo), x.n]))}</div>
      <div class="card"><h3>📈 Produtividade (30d)</h3><p class="sub">Andamentos: ${v.produtividade_30d.andamentos_registrados} · Versões de peça: ${v.produtividade_30d.pecas_criadas} · Consultas IA: ${v.produtividade_30d.consultas_ia}</p>
        ${v.produtividade_30d.tarefas_concluidas.length ? tabela(['Quem', 'Tarefas concluídas'], v.produtividade_30d.tarefas_concluidas.map(t => [esc(t.quem), t.n])) : '<p class="vazio">Sem conclusões no período.</p>'}</div>
      <div class="card"><h3>🚧 Gargalos</h3>${v.gargalos.length ? tabela(['Responsável', 'Tarefas atrasadas'], v.gargalos.map(g => [esc(g.responsavel), g.atrasadas])) : '<p class="vazio">Nenhum atraso. 🎉</p>'}</div></div>`;
    LG.body().innerHTML = h;
  },
  async verNucleo() {
    const n = document.getElementById('lgr-nucleo').value;
    if (!n) return alert('Escolha o núcleo.');
    const v = await LG.api('GET', '/relatorios/nucleo/' + encodeURIComponent(n));
    document.getElementById('lgr-corpo').innerHTML = `<div class="card"><h3>🏢 Núcleo ${esc(n)} ${v.atrasos ? `<span class="chip" style="color:var(--alerta)">⚠️ ${v.atrasos} tarefa(s) atrasada(s)</span>` : ''}</h3>
      ${tabela(['Fase', 'Processos'], v.processos_por_fase.map(x => [esc(x.fase), x.qtd]))}</div>
      <div class="card"><h3>✅ Tarefas abertas</h3>${v.tarefas_abertas.length ? tabela(['Título', 'Responsável', 'Prazo', 'Status'], v.tarefas_abertas.map(t => [esc(t.titulo), esc(t.responsavel || '—'), LG.dt(t.prazo), LG.chip(t.status)])) : '<p class="vazio">Nenhuma.</p>'}</div>
      <div class="card"><h3>⏰ Prazos</h3>${v.prazos.length ? tabela(['Fatal', 'Título', 'CNJ', 'Status'], v.prazos.map(z => [LG.dt(z.data_fatal), esc(z.titulo), esc(z.numero_cnj || '—'), LG.chip(z.status)])) : '<p class="vazio">Nenhum.</p>'}</div>
      <div class="card"><h3>🏛️ Audiências (30d)</h3>${v.audiencias_30d.length ? tabela(['Quando', 'Tipo', 'Juízo', 'CNJ'], v.audiencias_30d.map(a => [LG.dt(a.data_hora) + ' ' + String(a.data_hora).slice(11, 16), esc(a.tipo), esc(a.juizo || '—'), esc(a.numero_cnj || '—')])) : '<p class="vazio">Nenhuma.</p>'}</div>`;
  },
  async verFinanceiroRel() {
    const v = await LG.api('GET', '/relatorios/financeiro');
    const r = v.resumo;
    document.getElementById('lgr-corpo').innerHTML = `<div class="card"><h3>💰 Financeiro</h3>
      <p>A receber: <b>${LG.brl(r.a_receber)}</b> · Inadimplência: <b style="color:var(--alerta)">${LG.brl(r.inadimplencia)}</b> · Recebido: <b>${LG.brl(r.receita_recebida)}</b> · Despesas pagas: <b>${LG.brl(r.despesas_pagas)}</b> · Margem: <b>${LG.brl(r.margem)}</b> · Repasses pendentes: <b>${LG.brl(r.repasses_pendentes)}</b></p></div>
      <div class="card"><h3>Por tipo × status</h3>${tabela(['Tipo', 'Status', 'Qtd', 'Total'], v.por_tipo.map(x => [LG.chip(x.tipo), LG.chip(x.status), x.qtd, LG.brl(x.total)]))}</div>
      <div class="card"><h3>🔴 Inadimplentes</h3>${v.inadimplentes.length ? tabela(['Cliente', 'Descrição', 'Valor', 'Venceu em'], v.inadimplentes.map(i => [esc(i.nome || '—'), esc(i.descricao), LG.brl(i.valor), LG.dt(i.vencimento)])) : '<p class="vazio">Nenhum. 🎉</p>'}</div>
      <div class="card"><h3>🏆 Top clientes</h3>${v.top_clientes.length ? tabela(['Cliente', 'Recebido', 'Em aberto'], v.top_clientes.map(c => [esc(c.nome), LG.brl(c.recebido), LG.brl(c.em_aberto)])) : '<p class="vazio">Sem lançamentos.</p>'}</div>`;
  },
  async verPrestacao() {
    const id = document.getElementById('lgr-cli').value.trim();
    if (!id) return alert('Informe o ID do cliente (aba Clientes).');
    const v = await LG.api('GET', '/relatorios/prestacao-contas/' + id);
    document.getElementById('lgr-corpo').innerHTML = `<div class="card"><h3>🧾 Prestação de contas — ${esc(v.cliente.nome)}</h3>
      <p>Recebido: <b>${LG.brl(v.totais.recebido)}</b> · Em aberto: <b>${LG.brl(v.totais.em_aberto)}</b> · Repassado: <b>${LG.brl(v.totais.repassado)}</b></p>
      <p><a class="btn secund peq" href="${LG.hrefBase}/relatorios/prestacao-contas/${id}/exportar?formato=csv">⬇️ CSV (Excel)</a>
      <a class="btn secund peq" href="${LG.hrefBase}/relatorios/prestacao-contas/${id}/exportar" target="_blank" rel="noopener">🖨️ HTML/PDF</a></p>
      ${v.lancamentos.length ? tabela(['Vencimento', 'Tipo', 'Descrição', 'CNJ', 'Valor', 'Status'], v.lancamentos.map(l => [LG.dt(l.vencimento || l.criado_em), LG.chip(l.tipo), esc(l.descricao), esc(l.numero_cnj || '—'), LG.brl(l.valor), LG.chip(l.status)])) : '<p class="vazio">Nenhum lançamento.</p>'}</div>`;
  },
  async verGerados() {
    const { gerados } = await LG.api('GET', '/relatorios/gerados');
    document.getElementById('lgr-corpo').innerHTML = `<div class="card"><h3>🗄️ Relatórios gerados</h3>
      ${gerados.length ? tabela(['Quando', 'Tipo', 'Título', 'Formato', 'Por', ''], gerados.map(g => [
        new Date(g.criado_em).toLocaleString('pt-BR'), LG.chip(g.tipo), esc(g.titulo), g.formato, esc(g.criado_por),
        `<a class="btn secund peq" href="${LG.hrefBase}/relatorios/gerados/${g.id}" target="_blank" rel="noopener">Abrir</a>`,
      ])) : '<p class="vazio">Nenhum relatório exportado ainda.</p>'}</div>`;
  },

  // -------------------------------------------------------- IA JURÍDICA (Fase 3)
  async vIA() {
    const [{ consultas }, st, { agentes }] = await Promise.all([
      LG.api('GET', '/ia'), LG.api('GET', '/ia/status'), LG.api('GET', '/ia/agentes'),
    ]);
    let h = `<div class="aviso">🤖 Modo: <b>${st.modo === 'direto' ? 'direto (API Anthropic — ' + esc(st.modelos[0]) + ')' : 'fila — o agente jurídico local responde as consultas pendentes'}</b>
      · RAG: ${st.rag ? '✅ ativo' : '⛔ indisponível'} · Pendentes: ${st.pendentes}. Toda resposta é MINUTA (revisão de advogado obrigatória).</div>`;
    h += `<details class="cr-box" open><summary class="cr-sum">💬 Nova consulta jurídica</summary>
      <form class="form" id="lg-ia-form" style="max-width:660px;margin-top:12px">
        <label>Consulta * <textarea id="lgi-perg" required rows="3" maxlength="8000" style="width:100%"></textarea></label>
        <div class="hi-grid">
          <label>Especialista <select id="lgi-agente"><option value="">Geral</option>${agentes.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</select></label>
          <label>ID do processo (opcional) <input id="lgi-case" maxlength="20"></label>
        </div>
        <button class="btn" type="submit" id="lgi-enviar">Consultar</button><p id="lgi-msg" class="sub"></p>
      </form></details>`;
    h += `<details class="cr-box"><summary class="cr-sum">🔎 Buscar nas fontes internas (RAG)</summary>
      <div class="barra" style="margin-top:12px"><input id="lgi-busca" type="search" placeholder="ex.: despejo temporada caução" style="flex:1;min-width:220px">
      <button class="btn peq" type="button" onclick="LG.buscarRAG()">Buscar</button>
      ${LG.perfil === 'super_admin' ? `<button class="btn secund peq" type="button" onclick="LG.reindexarRAG()">♻️ Reindexar</button>` : ''}</div>
      <div id="lgi-hits"></div></details>`;
    h += `<details class="cr-box"><summary class="cr-sum">📚 Base de conhecimento (teses, precedentes, legislação)</summary>
      <form class="form" id="lg-kb-form" style="max-width:660px;margin-top:12px"><div class="hi-grid">
        <label>Tipo <select id="lgk-tipo"><option>legislacao</option><option>jurisprudencia</option><option>tese</option><option>parecer</option><option>modelo</option><option>doutrina</option></select></label>
        <label>Título * <input id="lgk-tit" required maxlength="300"></label>
        <label>Citação <input id="lgk-cit" maxlength="500" placeholder="Lei 8.245/91, art. 48"></label>
        <label>URL <input id="lgk-url" maxlength="500"></label></div>
        <label>Conteúdo * <textarea id="lgk-corpo" required rows="3" style="width:100%"></textarea></label>
        <button class="btn peq" type="submit">Adicionar ao conhecimento</button></form>
      <div id="lgi-kb"><p class="sub">Carregando…</p></div></details>`;
    h += `<div class="card"><h3>Consultas</h3>${consultas.length ? consultas.map(q => `
      <div style="border-bottom:1px solid #eee;padding:.5rem 0">
        <b>${esc((q.pergunta || '').slice(0, 120))}</b> <span class="sub">${LG.dt(q.criado_em)} · ${esc(q.agente || 'geral')}</span> ${LG.chip(q.situacao)}<br>
        ${q.respostas.map(r => `${LG.chip(r.status)} confiança: ${esc(r.nivel_confianca || '—')} ${r.revisado_por ? '· revisado por ' + esc(r.revisado_por) : ''}
          <button class="btn secund peq" onclick="LG.verRespostaIA('${r.id}')">Ver</button>`).join(' ')}
      </div>`).join('') : '<p class="vazio">Nenhuma consulta registrada.</p>'}</div>`;
    LG.body().innerHTML = h;
    LG.carregarKB();
    document.getElementById('lg-ia-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const msg = document.getElementById('lgi-msg'); const btn = document.getElementById('lgi-enviar');
      btn.disabled = true; msg.textContent = st.modo === 'direto' ? '🧠 Consultando a IA (pode levar 1-2 min)…' : 'Registrando na fila…';
      try {
        const r = await LG.api('POST', '/ia/consultas', {
          pergunta: document.getElementById('lgi-perg').value, agente: document.getElementById('lgi-agente').value,
          case_id: document.getElementById('lgi-case').value.trim(),
        });
        if (r.situacao === 'respondida') { LG.verRespostaIA(r.response_id); return; }
        msg.textContent = '⏳ ' + (r.detalhe || 'Consulta na fila.');
        btn.disabled = false;
      } catch (e) { msg.textContent = '❌ ' + e.message; btn.disabled = false; }
    };
    document.getElementById('lg-kb-form').onsubmit = async (ev) => {
      ev.preventDefault();
      await LG.api('POST', '/ia/conhecimento', {
        tipo: document.getElementById('lgk-tipo').value, titulo: document.getElementById('lgk-tit').value,
        citacao: document.getElementById('lgk-cit').value, url: document.getElementById('lgk-url').value,
        corpo: document.getElementById('lgk-corpo').value,
      });
      document.getElementById('lg-kb-form').reset(); LG.carregarKB();
    };
  },
  async carregarKB() {
    const alvo = document.getElementById('lgi-kb'); if (!alvo) return;
    try {
      const { itens } = await LG.api('GET', '/ia/conhecimento');
      alvo.innerHTML = itens.length ? tabela(['Tipo', 'Título', 'Citação', ''], itens.map(k => [
        LG.chip(k.tipo), esc(k.titulo), esc(k.citacao || '—'),
        `<button class="btn secund peq" onclick="LG.rmKB('${k.id}')">✕</button>`,
      ])) : '<p class="vazio">Nada curado ainda — adicione teses, precedentes e trechos de lei que o RAG deve priorizar.</p>';
    } catch (e) { alvo.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
  },
  async rmKB(id) {
    if (!confirm('Remover este item do conhecimento?')) return;
    await LG.api('DELETE', '/ia/conhecimento/' + id); LG.carregarKB();
  },
  async buscarRAG() {
    const q = document.getElementById('lgi-busca').value.trim(); const alvo = document.getElementById('lgi-hits');
    if (!q) return;
    alvo.innerHTML = '<p class="sub">Buscando…</p>';
    const r = await LG.api('GET', '/ia/buscar?q=' + encodeURIComponent(q));
    alvo.innerHTML = r.resultados.length ? tabela(['Fonte', 'Título', 'Trecho'], r.resultados.map(x => [
      LG.chip(x.tipo), esc(x.titulo), esc(x.trecho),
    ])) : '<p class="vazio">Nada encontrado nas fontes internas.</p>';
  },
  async reindexarRAG() {
    const r = await LG.api('POST', '/ia/reindexar');
    alert('Reindexado: ' + (r.indexados || 0) + ' itens.');
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
      <p class="sub">Admins do portal continuam Super Admin — cadastre-os aqui apenas para registrar OAB e núcleos (a OAB alimenta a coleta do DJEN).</p>
      <form class="form" id="lg-eq-form" style="max-width:560px"><div class="hi-grid">
        <label>Usuário do portal <select id="lge-user">${d.usuariosPortal.map(u => `<option value="${u.id}">${esc(u.nome)} (${esc(u.email)})${u.papel === 'admin' ? ' 👑' : ''}</option>`).join('')}</select></label>
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

  // -------------------------------------------------------- AUDITORIA + INTEGRAÇÕES
  async vAuditoria() {
    const [{ eventos }, integ] = await Promise.all([
      LG.api('GET', '/auditoria'), LG.api('GET', '/integracoes').catch(() => ({ logs: [], webhooks: [] })),
    ]);
    LG.body().innerHTML = `<div class="card"><h3>🔌 Integrações (DataJud/DJEN) e rotinas</h3>
      <p class="sub">A rotina diária roda sozinha no servidor (~7h de Brasília): coleta andamentos e publicações, envia o digest aos clientes, processa a fila de IA (modo direto) e arquiva o relatório do sócio. Disparo manual:</p>
      <p><button class="btn peq" onclick="LG.coletar('andamentos')">⚖️ Coletar andamentos (DataJud)</button>
      <button class="btn peq" onclick="LG.coletar('publicacoes')">📰 Coletar publicações (DJEN)</button>
      <button class="btn secund peq" onclick="LG.coletar('rotina')">▶️ Rodar rotina diária completa</button></p>
      <p id="lg-col-msg" class="sub"></p>
      <h3 style="margin-top:14px">Últimas execuções</h3>
      ${integ.logs.length ? tabela(['Quando', 'Fonte', 'Operação', 'Status', 'Detalhe'], integ.logs.slice(0, 20).map(l => [
        new Date(l.quando).toLocaleString('pt-BR'), LG.chip(l.fonte), esc(l.operacao), l.status === 'ok' ? '✅' : '❌', esc(l.detalhe || ''),
      ])) : '<p class="vazio">Nenhuma execução ainda.</p>'}</div>
      <div class="card"><h3>📜 Auditoria</h3>${eventos.length ? tabela(['Quando', 'Quem', 'Ação', 'Entidade', 'Detalhe'], eventos.map(e => [
      new Date(e.quando).toLocaleString('pt-BR'), esc(e.quem), esc(e.acao), esc(e.entidade + (e.entidade_id ? ' #' + e.entidade_id.slice(0, 6) : '')), esc(e.detalhe || ''),
    ])) : '<p class="vazio">Nada registrado ainda.</p>'}</div>`;
  },
  async coletar(tipo) {
    const msg = document.getElementById('lg-col-msg');
    msg.textContent = '⏳ Executando (DataJud/DJEN podem levar até 1 min)…';
    try {
      const rota = tipo === 'rotina' ? '/integracoes/rotina-diaria' : '/integracoes/coletar/' + tipo;
      const r = await LG.api('POST', rota, {});
      msg.textContent = '✅ ' + (tipo === 'andamentos' ? `${r.novos} andamento(s) novo(s) em ${r.encontrados}/${r.monitorados} processos (${r.erros} erro(s))`
        : tipo === 'publicacoes' ? `${r.novas || 0} publicação(ões) nova(s) de ${r.comunicacoes || 0} comunicações (${r.oabs} OAB)`
        : 'Rotina completa executada — veja as execuções abaixo.');
      setTimeout(() => LG.pintar(), 1200);
    } catch (e) { msg.textContent = '❌ ' + e.message; }
  },
};

// entrada usada pelo app-core (rotas)
function renderLegal() { LG.abrir(); }
