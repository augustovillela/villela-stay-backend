'use strict';
// ============================================================================
// Portal Staff — Villela Legal · ONDA LIVRO
// Extensão do SPA app-legal.js (objeto LG) com as telas que fecham a paridade
// com o livro "Claude AI na Prática Jurídica": os 12 protótipos do Cap. 47 e a
// Parte VIII (compliance/LGPD/riscos).
//
// Carregada DEPOIS de app-legal.js. Não altera o arquivo original: adiciona
// abas em LG.abas() e views no dispatcher LG.pintar(), preservando o
// comportamento anterior. Serve tanto o Portal Staff quanto o workspace do
// assinante (/juridico/app/juridico), que reusa o mesmo SPA.
// ============================================================================

(function () {
  if (typeof LG === 'undefined') return; // sem o SPA base não há o que estender

  // ---------------------------------------------------------------- helpers
  const LGL = {
    // formulário: pega valor por id
    v(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; },
    n(id) { const x = Number(String(LGL.v(id)).replace(/\./g, '').replace(',', '.')); return Number.isFinite(x) ? x : 0; },
    cent(id) { return Math.round(LGL.n(id) * 100); },
    chk(id) { const el = document.getElementById(id); return !!(el && el.checked); },
    brl(c) { return LG.brl(c); },
    // caixa "➕ Novo ..." padrão do SPA
    box(titulo, campos, botao, onsubmit) {
      return `<details class="cr-box"><summary class="cr-sum">${titulo}</summary>
        <div class="form" style="max-width:720px;margin-top:12px">${campos}
        <button class="btn" onclick="${onsubmit}">${botao || 'Salvar'}</button></div></details>`;
    },
    // aviso padronizado com a citação do capítulo (o livro é a régua)
    livro(txt) { return `<div class="aviso">📘 ${txt}</div>`; },
    tag(t, cor) { return `<span class="chip"${cor ? ` style="background:${cor};color:#fff"` : ''}>${esc(String(t || '—').replace(/_/g, ' '))}</span>`; },
    grav(g) { return LGL.tag(g, { critica: '#b3261e', alta: '#c25e00', media: '#7a6a00', baixa: '#4a5a63' }[g] || ''); },
    async post(caminho, corpo, msg) {
      try { const r = await LG.api('POST', caminho, corpo); if (msg !== false) alert(msg || 'Feito.'); LG.pintar(); return r; }
      catch (e) { alert('Erro: ' + e.message); throw e; }
    },
    async patch(caminho, corpo, msg) {
      try { const r = await LG.api('PATCH', caminho, corpo); if (msg !== false) alert(msg || 'Atualizado.'); LG.pintar(); return r; }
      catch (e) { alert('Erro: ' + e.message); throw e; }
    },
    async del(caminho, pergunta) {
      if (!confirm(pergunta || 'Confirma a exclusão?')) return;
      try { await LG.api('DELETE', caminho); LG.pintar(); } catch (e) { alert('Erro: ' + e.message); }
    },
    sel(id, lista, atual) { return LG.sel(id, lista, atual); },
    // <select> a partir de pares [valor, rótulo]
    selPares(id, pares, atual) {
      return `<select id="${id}">${pares.map(([v, r]) => `<option value="${v}"${v === atual ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select>`;
    },
  };
  window.LGL = LGL;

  // ------------------------------------------------- abas novas (por permissão)
  const abasBase = LG.abas.bind(LG);
  LG.abas = function () {
    const t = abasBase();
    const p = LG.perm || {};
    // inseridas na ordem de construção sugerida pelo próprio livro (Cap. 47)
    if (p.gerir_crm) t.push(['crm', '🤝 CRM jurídico']);
    if (p.gerir_pesquisa) t.push(['pesquisa', '🔎 Pesquisa']);
    if (p.ver_processos) t.push(['matrizes', '🧩 Estratégia e provas']);
    if (p.gerir_contratos) t.push(['ciclo', '📜 Ciclo contratual']);
    if (p.ver_financeiro || p.apontar_horas) t.push(['financeiro2', '💼 Financeiro+']);
    if (p.ver_processos) t.push(['interno', '🏛️ Portal interno']);
    if (p.gerir_compliance) t.push(['compliance', '🛡️ Compliance e LGPD']);
    if (p.gerir_conteudo) t.push(['conteudo', '📣 Conteúdo']);
    if (p.ver_controladoria) t.push(['controladoria', '🎛️ Controladoria']);
    if (p.usar_ia) t.push(['agentes', '🤖 Central de agentes']);
    return t;
  };

  // ------------------------------------------------- dispatcher (preserva o base)
  const pintarBase = LG.pintar.bind(LG);
  const VIEWS = {};
  LG.pintar = async function () {
    const v = VIEWS[LG.tab];
    if (!v) return pintarBase();
    try { await v(); } catch (e) { LG.body().innerHTML = `<div class="card">Erro: ${esc(e.message)}</div>`; }
  };

  // =========================================================== 47.1 · CRM
  VIEWS.crm = async function () {
    const [{ painel }, { leads }] = await Promise.all([
      LG.api('GET', '/crm/painel'), LG.api('GET', '/crm/leads?limite=200'),
    ]);
    const kpi = (rot, val, alerta) => `<div class="card" style="min-width:140px;flex:1${alerta && val ? ';border-color:var(--alerta)' : ''}">
      <div class="sub">${rot}</div><div style="font-size:1.4rem;font-weight:700${alerta && val ? ';color:var(--alerta)' : ''}">${val}</div></div>`;
    const estagios = ['novo', 'triagem', 'qualificado', 'proposta', 'contratado', 'perdido'];

    let h = LGL.livro('CRM jurídico (Cap. 16 / protótipo 47.1). O score ordena a fila de atendimento — não decide contratação nem antecipa parecer (Cap. 15.6). Proposta só sai depois de <b>aprovação humana</b>.');
    h += `<div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
      ${kpi('Novos (90d)', painel.novos)}${kpi('Contratados', painel.contratados)}${kpi('Conversão', painel.conversao_pct + '%')}
      ${kpi('1ª resposta (h)', painel.horas_primeira_resposta)}${kpi('Sem resposta', painel.sem_resposta, true)}
      ${kpi('Conflito pendente', painel.conflitos_pendentes, true)}${kpi('Propostas p/ aprovar', painel.propostas.aguardando_aprovacao, true)}</div>`;

    h += LGL.box('➕ Novo lead', `
      <label>Nome * <input id="lgl-l-nome" maxlength="200"></label>
      <div class="hi-grid">
        <label>E-mail <input id="lgl-l-mail" maxlength="160"></label>
        <label>Telefone <input id="lgl-l-fone" maxlength="40"></label>
        <label>Origem ${LGL.sel('lgl-l-orig', ['site', 'indicacao', 'conteudo', 'redes', 'evento', 'parceiro', 'cliente', 'outro'], 'site')}</label>
        <label>Área <input id="lgl-l-area" maxlength="60" placeholder="civel, trabalhista..."></label>
        <label>Urgência ${LGL.sel('lgl-l-urg', ['imediata', 'alta', 'normal', 'baixa'], 'normal')}</label>
        <label>Competência <input id="lgl-l-comp" maxlength="200" placeholder="foro/juízo provável"></label>
      </div>
      <label>Relato do interessado (coleta inicial, sem parecer) <textarea id="lgl-l-fato" rows="3" maxlength="4000"></textarea></label>
      <label>Risco de prescrição/decadência anotado <input id="lgl-l-presc" maxlength="400"></label>`,
      'Registrar lead', 'LGL.crmCriarLead()');

    // funil em colunas
    h += `<div style="display:flex;gap:.5rem;align-items:flex-start;overflow-x:auto;margin:.6rem 0">`
      + estagios.map(e => {
        const doEstagio = leads.filter(l => l.estagio === e);
        return `<div style="flex:1;min-width:210px"><div class="card" style="background:#f7f7f4">
          <b>${e.replace(/_/g, ' ')}</b> <span class="sub">(${doEstagio.length})</span>
          ${doEstagio.slice(0, 12).map(l => `<div class="card" style="padding:.45rem;margin:.35rem 0${l.spam_score >= 60 ? ';border-color:#c25e00' : ''}">
            <b>${esc(l.nome)}</b><br><span class="sub">${LGL.tag(l.origem)} score ${l.score}${l.spam_score >= 60 ? ' · ⚠️ possível spam' : ''}
            ${l.conflito_ok ? ' · ✅ conflito ok' : ' · ⚠️ conflito pendente'}</span><br>
            <button class="btn secund peq" onclick="LGL.crmAbrir('${l.id}')">abrir</button></div>`).join('') || '<p class="vazio">—</p>'}
        </div></div>`;
      }).join('') + `</div>`;

    // conflito de interesses (17.1)
    h += `<div class="card"><h3>🔍 Pesquisa de conflito de interesses (Cap. 17.1)</h3>
      <p class="sub">Varre clientes, partes de processos e leads. O <b>veredito é humano</b> — o sistema só mostra os cruzamentos.</p>
      <div class="hi-grid"><label>Termo (nome ou documento) <input id="lgl-cf-termo" maxlength="200"></label>
      <label>Lead vinculado <select id="lgl-cf-lead"><option value="">—</option>${leads.map(l => `<option value="${l.id}">${esc(l.nome)}</option>`).join('')}</select></label></div>
      <button class="btn peq" onclick="LGL.crmPesquisarConflito()">Pesquisar</button>
      <div id="lgl-cf-res"></div></div>`;

    // origem e motivos de perda (16.3 / 16.7)
    h += `<div class="card"><h3>📈 Conversão por origem e motivos de perda</h3>
      ${tabela(['Origem', 'Leads', 'Contratados', 'Conversão'], painel.por_origem.map(o => [
        esc(o.origem), o.n, o.ganhos, (o.n ? Math.round((o.ganhos / o.n) * 100) : 0) + '%']))}
      ${painel.motivos_perda.length ? '<p class="sub" style="margin-top:.6rem">Motivos de perda mais frequentes</p>'
        + tabela(['Motivo', 'Vezes'], painel.motivos_perda.map(m => [esc(m.m), m.n])) : ''}</div>`;
    LG.body().innerHTML = h;
  };

  LGL.crmCriarLead = async function () {
    if (!LGL.v('lgl-l-nome')) return alert('Informe o nome.');
    await LGL.post('/crm/leads', {
      nome: LGL.v('lgl-l-nome'), email: LGL.v('lgl-l-mail'), telefone: LGL.v('lgl-l-fone'),
      origem: LGL.v('lgl-l-orig'), area: LGL.v('lgl-l-area'), urgencia: LGL.v('lgl-l-urg'),
      competencia: LGL.v('lgl-l-comp'), resumo_fato: LGL.v('lgl-l-fato'), risco_prescricao: LGL.v('lgl-l-presc'),
    }, 'Lead registrado.');
  };

  LGL.crmPesquisarConflito = async function () {
    const termo = LGL.v('lgl-cf-termo');
    if (termo.length < 3) return alert('Informe ao menos 3 caracteres.');
    const { pesquisa } = await LG.api('GET', '/crm/conflitos?termo=' + encodeURIComponent(termo));
    const lead = LGL.v('lgl-cf-lead');
    document.getElementById('lgl-cf-res').innerHTML = `
      <p class="sub" style="margin-top:.6rem">${pesquisa.resultados.length} cruzamento(s). Sugestão do sistema: <b>${pesquisa.sugestao}</b> — a decisão é sua.</p>
      ${pesquisa.resultados.length ? tabela(['Tipo', 'Nome', 'Papel', 'Onde'], pesquisa.resultados.map(r =>
        [LGL.tag(r.tipo), esc(r.nome), esc(r.papel || '—'), esc(r.detalhe || '')])) : ''}
      <div class="hi-grid" style="margin-top:.5rem">
        <label>Veredito ${LGL.sel('lgl-cf-ver', ['livre', 'atencao', 'impedido'], pesquisa.sugestao)}</label>
        <label>Justificativa <input id="lgl-cf-just" maxlength="2000"></label></div>
      <button class="btn peq" onclick="LGL.crmRegistrarConflito('${encodeURIComponent(termo)}','${lead}')">Registrar veredito</button>`;
  };

  LGL.crmRegistrarConflito = async function (termoEnc, lead) {
    await LGL.post('/crm/conflitos', {
      termo: decodeURIComponent(termoEnc), lead_id: lead || '',
      veredito: LGL.v('lgl-cf-ver'), justificativa: LGL.v('lgl-cf-just'),
    }, 'Veredito registrado.');
  };

  LGL.crmAbrir = async function (id) {
    const { lead } = await LG.api('GET', '/crm/leads/' + id);
    const props = (lead.propostas || []).map(p => `<div class="card" style="padding:.5rem">
      <b>${LGL.brl(p.valor_centavos)}</b> ${LGL.tag(p.modalidade)} ${LGL.tag(p.status)}
      ${p.aprovada_por ? `<span class="sub">· aprovada por ${esc(p.aprovada_por)}</span>` : '<span class="sub">· <b>sem aprovação</b></span>'}<br>
      <span class="sub">${esc(String(p.escopo || '').slice(0, 200))}</span><br>
      ${p.status === 'rascunho' ? `<button class="btn peq" onclick="LGL.propAprovar('${p.id}')">✅ Aprovar</button> ` : ''}
      ${p.status === 'aprovada' ? `<button class="btn peq" onclick="LGL.propEnviada('${p.id}')">📤 Marcar enviada</button> ` : ''}
      ${p.status === 'enviada' ? `<button class="btn secund peq" onclick="LGL.propDesfecho('${p.id}','aceita')">Aceita</button>
        <button class="btn secund peq" onclick="LGL.propDesfecho('${p.id}','recusada')">Recusada</button>` : ''}
    </div>`).join('') || '<p class="vazio">Nenhuma proposta.</p>';

    LG.body().innerHTML = `<p><button class="btn secund peq" onclick="LG.ir('crm')">← Funil</button></p>
      <div class="card"><h3>${esc(lead.nome)} ${LGL.tag(lead.estagio)}</h3>
      <p class="sub">${esc(lead.email || '')} ${esc(lead.telefone || '')} · origem ${esc(lead.origem)} · score ${lead.score}
      ${lead.spam_score >= 60 ? ' · ⚠️ spam ' + lead.spam_score : ''} · ${lead.conflito_ok ? '✅ conflito liberado' : '⚠️ conflito pendente (Cap. 17.1)'}</p>
      <p><b>Relato:</b> ${esc(lead.resumo_fato || '—')}</p>
      <p class="sub">Urgência ${esc(lead.urgencia)} · prescrição: ${esc(lead.risco_prescricao || '—')} · competência: ${esc(lead.competencia || '—')}</p>
      <div class="hi-grid"><label>Estágio ${LGL.sel('lgl-ld-est', ['novo', 'triagem', 'qualificado', 'proposta', 'contratado', 'perdido', 'descartado'], lead.estagio)}</label>
      <label>Pode atender ${LGL.sel('lgl-ld-pode', ['sim', 'nao', 'a_avaliar'], lead.pode_atender)}</label>
      <label>Motivo do desfecho <input id="lgl-ld-mot" maxlength="300" value="${esc(lead.motivo_desfecho || '')}"></label></div>
      <button class="btn peq" onclick="LGL.crmSalvarLead('${lead.id}')">Salvar</button></div>

      <div class="card"><h3>💬 Interações</h3>
        <div class="hi-grid"><label>Canal ${LGL.sel('lgl-ld-canal', ['whatsapp', 'email', 'telefone', 'reuniao', 'portal', 'outro'], 'whatsapp')}</label>
        <label>Direção ${LGL.sel('lgl-ld-dir', ['saida', 'entrada'], 'saida')}</label></div>
        <label>Resumo <input id="lgl-ld-res" maxlength="2000"></label>
        <button class="btn peq" onclick="LGL.crmInteragir('${lead.id}')">Registrar</button>
        ${tabela(['Quando', 'Canal', 'Direção', 'Resumo', 'Quem'], (lead.interacoes || []).map(i =>
          [LG.dt(i.quando), esc(i.canal), esc(i.direcao), esc(i.resumo), esc(i.quem || '')]))}</div>

      <div class="card"><h3>📄 Propostas de honorários (Cap. 16.6 / 17.6)</h3>
        <p class="sub">Envio exige aprovação humana registrada — trava do protótipo 47.1.</p>
        ${LGL.box('➕ Nova proposta', `
          <label>Escopo (o que está incluído) <textarea id="lgl-pr-esc" rows="2" maxlength="4000"></textarea></label>
          <label>Fora do escopo (Cap. 17.5) <textarea id="lgl-pr-fora" rows="2" maxlength="2000"></textarea></label>
          <div class="hi-grid"><label>Modalidade ${LGL.sel('lgl-pr-mod', ['fixo', 'mensal', 'hora', 'exito', 'misto'], 'fixo')}</label>
          <label>Valor (R$) <input id="lgl-pr-val" type="number" step="0.01"></label>
          <label>% de êxito <input id="lgl-pr-exi" type="number" step="0.1"></label>
          <label>Parcelas <input id="lgl-pr-par" type="number" value="1" min="1"></label>
          <label>Validade <input id="lgl-pr-valid" type="date"></label></div>
          <label>Texto da proposta <textarea id="lgl-pr-txt" rows="4" maxlength="20000"></textarea></label>`,
          'Criar proposta', `LGL.propCriar('${lead.id}')`)}
        ${props}</div>

      <div class="card"><h3>🪪 KYC e procuração (Cap. 17.3/17.4)</h3>
        <label><input type="checkbox" id="lgl-kyc-doc" ${lead.kyc && lead.kyc.documento_ok ? 'checked' : ''}> Documento de identificação conferido</label><br>
        <label><input type="checkbox" id="lgl-kyc-proc" ${lead.kyc && lead.kyc.procuracao_ok ? 'checked' : ''}> Procuração assinada e arquivada</label>
        <label>Representação (quem assina e com que poderes) <input id="lgl-kyc-rep" maxlength="1000" value="${esc((lead.kyc && lead.kyc.representacao) || '')}"></label>
        <label>Pendências <input id="lgl-kyc-pend" maxlength="1000" value="${esc((lead.kyc && lead.kyc.pendencias) || '')}"></label>
        <button class="btn peq" onclick="LGL.kycSalvar('${lead.id}','${(lead.kyc && lead.kyc.id) || ''}')">Salvar KYC</button></div>

      <div class="card"><h3>⚖️ Abertura formal do caso (Cap. 17.10)</h3>
        <p class="sub">Exige conflito liberado. Informe o cliente já cadastrado (e o processo, se houver).</p>
        <div class="hi-grid"><label>client_id <input id="lgl-ld-cli" maxlength="40" value="${esc(lead.client_id || '')}"></label>
        <label>case_id <input id="lgl-ld-case" maxlength="40" value="${esc(lead.case_id || '')}"></label></div>
        <button class="btn peq" onclick="LGL.crmVincular('${lead.id}')">Vincular e marcar contratado</button></div>`;
  };

  LGL.crmSalvarLead = (id) => LGL.patch('/crm/leads/' + id, {
    estagio: LGL.v('lgl-ld-est'), pode_atender: LGL.v('lgl-ld-pode'), motivo_desfecho: LGL.v('lgl-ld-mot'),
  }, 'Lead atualizado.').then(() => LGL.crmAbrir(id)).catch(() => {});
  LGL.crmInteragir = (id) => LGL.post(`/crm/leads/${id}/interacoes`, {
    canal: LGL.v('lgl-ld-canal'), direcao: LGL.v('lgl-ld-dir'), resumo: LGL.v('lgl-ld-res'),
  }, false).then(() => LGL.crmAbrir(id)).catch(() => {});
  LGL.crmVincular = (id) => LGL.post(`/crm/leads/${id}/vincular`, {
    client_id: LGL.v('lgl-ld-cli'), case_id: LGL.v('lgl-ld-case'),
  }, 'Caso aberto e lead marcado como contratado.').then(() => LGL.crmAbrir(id)).catch(() => {});
  LGL.propCriar = (leadId) => LGL.post(`/crm/leads/${leadId}/propostas`, {
    escopo: LGL.v('lgl-pr-esc'), fora_escopo: LGL.v('lgl-pr-fora'), modalidade: LGL.v('lgl-pr-mod'),
    valor_centavos: LGL.cent('lgl-pr-val'), percentual_exito: LGL.n('lgl-pr-exi'),
    parcelas: LGL.n('lgl-pr-par') || 1, validade: LGL.v('lgl-pr-valid'), texto: LGL.v('lgl-pr-txt'),
  }, 'Proposta criada em rascunho — precisa de aprovação para sair.').then(() => LGL.crmAbrir(leadId)).catch(() => {});
  LGL.propAprovar = (id) => LGL.post(`/crm/propostas/${id}/aprovar`, {}, 'Proposta aprovada.');
  LGL.propEnviada = (id) => LGL.post(`/crm/propostas/${id}/enviada`, {}, 'Registrado o envio.');
  LGL.propDesfecho = (id, status) => LGL.post(`/crm/propostas/${id}/desfecho`, { status, motivo: prompt('Motivo (Cap. 16.7):') || '' }, 'Desfecho registrado.');
  LGL.kycSalvar = (leadId, kycId) => LGL.post('/crm/kyc', {
    id: kycId || undefined, lead_id: leadId, documento_ok: LGL.chk('lgl-kyc-doc'), procuracao_ok: LGL.chk('lgl-kyc-proc'),
    representacao: LGL.v('lgl-kyc-rep'), pendencias: LGL.v('lgl-kyc-pend'),
  }, 'KYC salvo.').then(() => LGL.crmAbrir(leadId)).catch(() => {});

  // ================================================= 47.7/47.8 · PESQUISA
  VIEWS.pesquisa = async function () {
    const [{ projetos }, { normas, desatualizadas }, { monitores, alertas }] = await Promise.all([
      LG.api('GET', '/pesquisa/projetos'), LG.api('GET', '/pesquisa/normas'), LG.api('GET', '/pesquisa/monitores'),
    ]);
    let h = LGL.livro('Protótipos 47.7 e 47.8. A regra estrutural do livro está no código: <b>“localizado e conferido”</b> só recebe achado depois que alguém abre a fonte oficial e confere o inteiro teor. O bloco <b>“hipótese a verificar”</b> não pode ser citado em peça.');

    h += LGL.box('➕ Nova pesquisa (fase 1: plano de busca)', `
      <label>Título * <input id="lgl-pq-tit" maxlength="200"></label>
      <label>Questão jurídica delimitada (Cap. 32.1) <textarea id="lgl-pq-q" rows="2" maxlength="4000"></textarea></label>
      <div class="hi-grid"><label>Área <input id="lgl-pq-area" maxlength="60"></label>
      <label>Tribunais/órgãos <input id="lgl-pq-trib" maxlength="300" placeholder="STJ, TJDFT..."></label>
      <label>Período <input id="lgl-pq-per" maxlength="100" placeholder="2020-2026"></label>
      <label>Processo (case_id) <input id="lgl-pq-case" maxlength="40"></label></div>
      <label>Plano de busca: termos, teses e filtros (Cap. 32.2) <textarea id="lgl-pq-plano" rows="4" maxlength="8000"></textarea></label>`,
      'Criar pesquisa', 'LGL.pqCriar()');

    h += `<div class="card"><h3>📚 Pesquisas</h3>${projetos.length ? tabela(
      ['Título', 'Área', 'Status', 'Conferidos', 'Hipóteses', ''],
      projetos.map(p => [esc(p.titulo), esc(p.area || '—'), LGL.tag(p.status), p.conferidos, p.hipoteses,
        `<button class="btn secund peq" onclick="LGL.pqAbrir('${p.id}')">abrir</button>`])) : '<p class="vazio">Nenhuma pesquisa.</p>'}</div>`;

    h += `<div class="card"><h3>📖 Base normativa interna (Cap. 33.9)</h3>
      ${LGL.box('➕ Nova norma', `
        <div class="hi-grid"><label>Tipo ${LGL.sel('lgl-nm-tipo', ['constituicao', 'lei', 'lc', 'mp', 'decreto', 'resolucao', 'in', 'provimento', 'portaria', 'outro'], 'lei')}</label>
        <label>Âmbito ${LGL.sel('lgl-nm-amb', ['federal', 'estadual', 'municipal', 'distrital'], 'federal')}</label>
        <label>Área <input id="lgl-nm-area" maxlength="60"></label></div>
        <label>Identificação * <input id="lgl-nm-id" maxlength="300" placeholder="Lei 13.105/2015 (CPC)"></label>
        <label>Ementa <input id="lgl-nm-em" maxlength="4000"></label>
        <label>Artigos-chave <input id="lgl-nm-art" maxlength="2000"></label>
        <label>URL da fonte oficial <input id="lgl-nm-url" maxlength="500"></label>`,
        'Cadastrar', 'LGL.nmCriar()')}
      ${desatualizadas.length ? `<div class="aviso">⚠️ ${desatualizadas.length} norma(s) sem conferência de vigência há mais de 180 dias (Cap. 33.4).</div>` : ''}
      ${normas.length ? tabela(['Identificação', 'Âmbito', 'Área', 'Vigente', 'Conferida', ''], normas.map(n => [
        n.fonte_url ? `<a href="${esc(n.fonte_url)}" target="_blank" rel="noopener">${esc(n.identificacao)}</a>` : esc(n.identificacao),
        esc(n.ambito), esc(n.area || '—'), n.vigente ? 'sim' : '<b>não</b>', esc(n.conferida_em || '—'),
        `<button class="btn secund peq" onclick="LGL.nmConferir('${n.id}')">conferir vigência</button>`])) : '<p class="vazio">—</p>'}</div>`;

    h += `<div class="card"><h3>🛰️ Monitoramento normativo (Cap. 33.7 · 31.3/31.4)</h3>
      ${LGL.box('➕ Novo monitor', `
        <label>Título * <input id="lgl-mo-tit" maxlength="200"></label>
        <div class="hi-grid"><label>Área <input id="lgl-mo-area" maxlength="60"></label>
        <label>Setor econômico <input id="lgl-mo-set" maxlength="120"></label>
        <label>Frequência ${LGL.sel('lgl-mo-freq', ['diaria', 'semanal', 'mensal'], 'semanal')}</label></div>
        <label>Termos (separados por vírgula) <input id="lgl-mo-ter" maxlength="1000"></label>
        <label>Fontes <input id="lgl-mo-fon" maxlength="1000" placeholder="DOU, Sinj-DF, ANPD..."></label>`,
        'Criar monitor', 'LGL.moCriar()')}
      ${monitores.length ? tabela(['Monitor', 'Área/Setor', 'Frequência', 'Alertas novos', 'Última revisão'], monitores.map(m => [
        esc(m.titulo), esc([m.area, m.setor].filter(Boolean).join(' / ') || '—'), esc(m.frequencia), m.alertas_novos, esc(m.ultima_revisao || '—')])) : '<p class="vazio">—</p>'}
      ${alertas.length ? '<p class="sub" style="margin-top:.6rem">Alertas novos — analisar antes de comunicar o cliente (Cap. 31.5)</p>'
        + tabela(['Alerta', 'Monitor', 'Fonte', ''], alertas.map(a => [esc(a.titulo), esc(a.monitor || '—'),
          a.fonte_url ? `<a href="${esc(a.fonte_url)}" target="_blank" rel="noopener">abrir</a>` : '—',
          `<button class="btn secund peq" onclick="LGL.moAnalisar('${a.id}')">analisar</button>`])) : ''}</div>`;
    LG.body().innerHTML = h;
  };

  LGL.pqCriar = async function () {
    if (!LGL.v('lgl-pq-tit')) return alert('Informe o título.');
    await LGL.post('/pesquisa/projetos', {
      titulo: LGL.v('lgl-pq-tit'), questao: LGL.v('lgl-pq-q'), area: LGL.v('lgl-pq-area'),
      tribunais: LGL.v('lgl-pq-trib'), periodo: LGL.v('lgl-pq-per'), case_id: LGL.v('lgl-pq-case'),
      plano_busca: LGL.v('lgl-pq-plano'),
    }, 'Pesquisa criada.');
  };

  LGL.pqAbrir = async function (id) {
    const { projeto: p } = await LG.api('GET', '/pesquisa/projetos/' + id);
    const linha = (f, conferido) => `<div class="card" style="padding:.5rem;margin:.35rem 0${conferido ? '' : ';border-color:#c25e00'}">
      <b>${esc(f.identificacao)}</b> ${LGL.tag(f.hierarquia)} ${LGL.tag(f.posicao)}<br>
      <span class="sub">${esc(f.orgao || '')} ${esc(f.data_julgamento || '')}
      ${f.fonte_url ? ` · <a href="${esc(f.fonte_url)}" target="_blank" rel="noopener">fonte oficial</a>` : ' · <b>sem fonte</b>'}
      ${conferido ? ` · ✅ conferido por ${esc(f.verificado_por)} em ${LG.dt(f.verificado_em)}` : ' · ⚠️ hipótese'}</span><br>
      <span class="sub">${esc(String(f.ratio_decidendi || f.ementa || '').slice(0, 300))}</span><br>
      ${conferido ? '' : `<button class="btn peq" onclick="LGL.pqConferir('${p.id}','${f.id}')">✅ Conferi o inteiro teor</button> `}
      <button class="btn secund peq" onclick="LGL.pqRemover('${p.id}','${f.id}')">excluir</button></div>`;

    LG.body().innerHTML = `<p><button class="btn secund peq" onclick="LG.ir('pesquisa')">← Pesquisas</button>
      <a class="btn secund peq" href="${LG.hrefBase}/pesquisa/projetos/${p.id}/relatorio" target="_blank" rel="noopener">📄 Relatório auditável</a></p>
      <div class="card"><h3>${esc(p.titulo)} ${LGL.tag(p.status)}</h3>
      <p><b>Questão:</b> ${esc(p.questao || '—')}</p>
      <p class="sub">${esc(p.area || '')} · ${esc(p.tribunais || '')} · ${esc(p.periodo || '')}</p>
      <label>Plano de busca <textarea id="lgl-pq-plano2" rows="4" maxlength="8000">${esc(p.plano_busca || '')}</textarea></label>
      <label>Conclusão (só do que está conferido) <textarea id="lgl-pq-conc" rows="3" maxlength="8000">${esc(p.conclusao || '')}</textarea></label>
      <div class="hi-grid"><label>Status ${LGL.sel('lgl-pq-st', ['plano', 'coleta', 'analise', 'concluida', 'arquivada'], p.status)}</label></div>
      <button class="btn peq" onclick="LGL.pqSalvar('${p.id}')">Salvar</button></div>

      ${LGL.box('➕ Novo achado (entra como HIPÓTESE)', `
        <div class="hi-grid"><label>Tipo ${LGL.sel('lgl-ac-tipo', ['precedente', 'norma', 'doutrina', 'enunciado'], 'precedente')}</label>
        <label>Hierarquia ${LGL.sel('lgl-ac-hier', ['vinculante', 'persuasivo', 'superado', 'indefinido'], 'persuasivo')}</label>
        <label>Posição ${LGL.sel('lgl-ac-pos', ['favoravel', 'desfavoravel', 'neutro'], 'neutro')}</label></div>
        <label>Identificação * <input id="lgl-ac-id" maxlength="300" placeholder="STJ, REsp 1.234.567/DF, 3ª T., DJe 01/01/2025"></label>
        <div class="hi-grid"><label>Órgão <input id="lgl-ac-org" maxlength="120"></label>
        <label>Julgamento <input id="lgl-ac-data" type="date"></label>
        <label>URL oficial <input id="lgl-ac-url" maxlength="500"></label></div>
        <label>Ementa <textarea id="lgl-ac-em" rows="2" maxlength="8000"></textarea></label>
        <label>Ratio decidendi (Cap. 32.6) <textarea id="lgl-ac-ratio" rows="2" maxlength="4000"></textarea></label>
        <label>Contexto fático <input id="lgl-ac-ctx" maxlength="2000"></label>
        <label>Distinguishing (Cap. 32.7) <input id="lgl-ac-dist" maxlength="2000"></label>`,
        'Registrar achado', `LGL.acCriar('${p.id}')`)}

      <div class="card"><h3>✅ Localizado e conferido (${p.conferidos.length})</h3>
        <p class="sub">Fonte oficial aberta e inteiro teor conferido por pessoa identificada.</p>
        ${p.conferidos.map(f => linha(f, true)).join('') || '<p class="vazio">Nada conferido ainda.</p>'}</div>
      <div class="card" style="border-color:#c25e00"><h3>⚠️ Hipótese a verificar (${p.hipoteses.length})</h3>
        <p class="sub">NÃO citar em peça antes de abrir a fonte oficial (Cap. 5.2/5.4/32.5).</p>
        ${p.hipoteses.map(f => linha(f, false)).join('') || '<p class="vazio">—</p>'}</div>`;
  };

  LGL.pqSalvar = (id) => LGL.patch('/pesquisa/projetos/' + id, {
    plano_busca: LGL.v('lgl-pq-plano2'), conclusao: LGL.v('lgl-pq-conc'), status: LGL.v('lgl-pq-st'),
  }, 'Pesquisa salva.').then(() => LGL.pqAbrir(id)).catch(() => {});
  LGL.acCriar = (pid) => LGL.post(`/pesquisa/projetos/${pid}/achados`, {
    tipo: LGL.v('lgl-ac-tipo'), hierarquia: LGL.v('lgl-ac-hier'), posicao: LGL.v('lgl-ac-pos'),
    identificacao: LGL.v('lgl-ac-id'), orgao: LGL.v('lgl-ac-org'), data_julgamento: LGL.v('lgl-ac-data'),
    fonte_url: LGL.v('lgl-ac-url'), ementa: LGL.v('lgl-ac-em'), ratio_decidendi: LGL.v('lgl-ac-ratio'),
    contexto_fatico: LGL.v('lgl-ac-ctx'), distinguishing: LGL.v('lgl-ac-dist'),
  }, false).then(() => LGL.pqAbrir(pid)).catch(() => {});
  LGL.pqConferir = async function (pid, fid) {
    const url = prompt('URL da fonte OFICIAL (inteiro teor) que você acabou de conferir:');
    if (url === null) return;
    try {
      await LG.api('POST', `/pesquisa/achados/${fid}/conferir`, { fonte_url: url });
      LGL.pqAbrir(pid);
    } catch (e) { alert('Erro: ' + e.message); }
  };
  LGL.pqRemover = async function (pid, fid) {
    if (!confirm('Excluir este achado?')) return;
    await LG.api('DELETE', '/pesquisa/achados/' + fid); LGL.pqAbrir(pid);
  };
  LGL.nmCriar = async function () {
    if (!LGL.v('lgl-nm-id')) return alert('Informe a identificação da norma.');
    await LGL.post('/pesquisa/normas', {
      tipo: LGL.v('lgl-nm-tipo'), ambito: LGL.v('lgl-nm-amb'), area: LGL.v('lgl-nm-area'),
      identificacao: LGL.v('lgl-nm-id'), ementa: LGL.v('lgl-nm-em'), artigos_chave: LGL.v('lgl-nm-art'),
      fonte_url: LGL.v('lgl-nm-url'),
    }, 'Norma cadastrada.');
  };
  LGL.nmConferir = (id) => LGL.post(`/pesquisa/normas/${id}/conferir`, {}, 'Vigência conferida (registrada com seu nome e a data).');
  LGL.moCriar = async function () {
    if (!LGL.v('lgl-mo-tit')) return alert('Informe o título.');
    await LGL.post('/pesquisa/monitores', {
      titulo: LGL.v('lgl-mo-tit'), area: LGL.v('lgl-mo-area'), setor: LGL.v('lgl-mo-set'),
      frequencia: LGL.v('lgl-mo-freq'), fontes: LGL.v('lgl-mo-fon'),
      termos: LGL.v('lgl-mo-ter').split(',').map(t => t.trim()).filter(Boolean),
    }, 'Monitor criado.');
  };
  LGL.moAnalisar = async function (id) {
    const impacto = prompt('Relatório de impacto (Cap. 31.5) — o que muda para o cliente:');
    if (impacto === null) return;
    const comunicar = confirm('Marcar como COMUNICADO ao cliente? (Cancelar = apenas analisado)');
    await LGL.patch('/pesquisa/alertas/' + id, { impacto, status: comunicar ? 'comunicado' : 'analisado' }, 'Alerta atualizado.');
  };

  // ============ ESTRATÉGIA E MATRIZES (Cap. 5.6 · 21 · 23 · 24 · 26 · 30)
  LGL.casoSel = '';
  VIEWS.matrizes = async function () {
    const { processos } = await LG.api('GET', '/processos');
    if (!LGL.casoSel && processos.length) LGL.casoSel = processos[0].id;
    let h = LGL.livro('Estratégia (Cap. 23), matriz de fatos (5.6), matriz de provas (24.1), diagnóstico do processo (21.9) e matriz de recursos (26.3). Tudo aqui é <b>sigiloso</b>: não vai ao portal do cliente nem ao índice de IA.');
    h += `<div class="card"><label>Processo
      <select id="lgl-mx-case" onchange="LGL.casoSel=this.value;LG.pintar()">
        ${processos.map(p => `<option value="${p.id}"${p.id === LGL.casoSel ? ' selected' : ''}>${esc(p.numero_cnj || p.classe || p.id)} — ${esc(p.cliente_nome || '')}</option>`).join('')}
      </select></label></div>`;
    if (!LGL.casoSel) { LG.body().innerHTML = h + '<p class="vazio">Cadastre um processo primeiro.</p>'; return; }

    const cid = LGL.casoSel;
    const [est, fatos, provas, diag] = await Promise.all([
      LG.api('GET', '/estrategia/' + cid).catch(() => ({ estrategia: null, cenarios: [], decisoes: [], recursos: [], negociacao: [] })),
      LG.api('GET', `/matrizes/${cid}/fatos`), LG.api('GET', `/matrizes/${cid}/provas`),
      LG.api('GET', `/matrizes/${cid}/diagnosticos`),
    ]);
    const e = est.estrategia || {};

    h += `<div class="card"><h3>🎯 Estratégia (Cap. 23)</h3>
      <div class="hi-grid">
        <label>Objetivo jurídico <input id="lgl-es-oj" maxlength="4000" value="${esc(e.objetivo_juridico || '')}"></label>
        <label>Objetivo do cliente <input id="lgl-es-oc" maxlength="4000" value="${esc(e.objetivo_cliente || '')}"></label></div>
      <label>Teses principais <textarea id="lgl-es-tp" rows="2" maxlength="8000">${esc(e.teses_principais || '')}</textarea></label>
      <label>Teses subsidiárias <textarea id="lgl-es-ts" rows="2" maxlength="8000">${esc(e.teses_subsidiarias || '')}</textarea></label>
      <label>Provas necessárias (Cap. 23.5) <textarea id="lgl-es-pn" rows="2" maxlength="4000">${esc(e.provas_necessarias || '')}</textarea></label>
      <label>BATNA / melhor alternativa sem acordo (Cap. 30.3) <textarea id="lgl-es-ba" rows="2" maxlength="4000">${esc(e.batna || '')}</textarea></label>
      <div class="hi-grid">
        <label>Acordo mín. (R$) <input id="lgl-es-min" type="number" step="0.01" value="${((e.faixa_acordo_min || 0) / 100).toFixed(2)}"></label>
        <label>Acordo máx. (R$) <input id="lgl-es-max" type="number" step="0.01" value="${((e.faixa_acordo_max || 0) / 100).toFixed(2)}"></label>
        <label>Custo estimado (R$) <input id="lgl-es-cu" type="number" step="0.01" value="${((e.custo_estimado || 0) / 100).toFixed(2)}"></label>
        <label>Duração estimada <input id="lgl-es-du" maxlength="200" value="${esc(e.duracao_estimada || '')}"></label></div>
      <button class="btn peq" onclick="LGL.esSalvar('${cid}')">Salvar estratégia</button></div>

      <div class="card"><h3>🌳 Cenários (Cap. 23.2/23.3)</h3>
      <p class="sub">Cenário exige declarar a <b>incerteza</b> — o que ainda não se sabe.</p>
      <div class="hi-grid"><label>Cenário <input id="lgl-ce-txt" maxlength="2000"></label>
        <label>Probabilidade ${LGL.sel('lgl-ce-prob', ['provavel', 'possivel', 'remoto'], 'possivel')}</label>
        <label>Impacto (R$) <input id="lgl-ce-imp" type="number" step="0.01"></label></div>
      <label>Incerteza * <input id="lgl-ce-inc" maxlength="2000"></label>
      <label>Providência <input id="lgl-ce-prov" maxlength="2000"></label>
      <button class="btn peq" onclick="LGL.ceCriar('${cid}')">Adicionar cenário</button>
      ${est.cenarios.length ? tabela(['Cenário', 'Probab.', 'Impacto', 'Incerteza', ''], est.cenarios.map(c => [
        esc(c.cenario), LGL.tag(c.probabilidade), LGL.brl(c.impacto_centavos), esc(c.incerteza || '—'),
        `<button class="btn secund peq" onclick="LGL.ceRemover('${c.id}')">×</button>`])) : '<p class="vazio">—</p>'}</div>

      <div class="card"><h3>🧾 Decisões estratégicas (Cap. 23.9)</h3>
      <div class="hi-grid"><label>Assunto/decisão <input id="lgl-de-dec" maxlength="4000"></label>
        <label>Alternativas consideradas <input id="lgl-de-alt" maxlength="4000"></label></div>
      <label>Motivo * <input id="lgl-de-mot" maxlength="4000"></label>
      <label><input type="checkbox" id="lgl-de-cli"> Cliente está ciente</label>
      <button class="btn peq" onclick="LGL.deCriar('${cid}')">Registrar decisão</button>
      ${est.decisoes.length ? tabela(['Quando', 'Decisão', 'Motivo', 'Quem', 'Cliente ciente'], est.decisoes.map(d => [
        LG.dt(d.criado_em), esc(d.decisao), esc(d.motivo), esc(d.quem || ''), d.cliente_ciente ? 'sim' : 'não'])) : '<p class="vazio">—</p>'}</div>

      <div class="card"><h3>📋 Matriz de fatos (Cap. 5.6)</h3>
      <p class="sub">Fato <b>comprovado</b> exige apontar a fonte (documento/fls.).</p>
      <div class="hi-grid"><label>Fato <input id="lgl-ft-txt" maxlength="4000"></label>
        <label>Situação ${LGL.sel('lgl-ft-sit', ['comprovado', 'alegado', 'controvertido', 'impugnado'], 'alegado')}</label>
        <label>Fonte (doc/fls.) <input id="lgl-ft-fonte" maxlength="500"></label>
        <label>Quem alega <input id="lgl-ft-quem" maxlength="120"></label></div>
      <button class="btn peq" onclick="LGL.ftCriar('${cid}')">Adicionar fato</button>
      ${fatos.fatos.length ? tabela(['Fato', 'Situação', 'Fonte', 'Quem alega', ''], fatos.fatos.map(f => [
        esc(f.fato), LGL.tag(f.situacao), esc(f.fonte || '—'), esc(f.quem_alega || '—'),
        `<button class="btn secund peq" onclick="LGL.ftRemover('${f.id}')">×</button>`])) : '<p class="vazio">—</p>'}</div>

      <div class="card"><h3>🔬 Matriz de provas (Cap. 24.1)</h3>
      <div class="hi-grid"><label>Prova <input id="lgl-pv-txt" maxlength="2000"></label>
        <label>Tipo ${LGL.sel('lgl-pv-tipo', ['documental', 'testemunhal', 'pericial', 'digital', 'audiovisual', 'outra'], 'documental')}</label>
        <label>Fato vinculado <select id="lgl-pv-fato"><option value="">—</option>${fatos.fatos.map(f => `<option value="${f.id}">${esc(String(f.fato).slice(0, 60))}</option>`).join('')}</select></label>
        <label>Situação ${LGL.sel('lgl-pv-sit', ['a_produzir', 'juntada', 'deferida', 'indeferida', 'impugnada'], 'a_produzir')}</label></div>
      <label>Pedido vinculado (Cap. 24.3) <input id="lgl-pv-ped" maxlength="1000"></label>
      <div class="hi-grid"><label>Autenticidade (Cap. 24.4) <input id="lgl-pv-aut" maxlength="1000"></label>
        <label>Cadeia de custódia (Cap. 24.8) <input id="lgl-pv-cad" maxlength="2000"></label>
        <label>Contradição observada (Cap. 24.9) <input id="lgl-pv-con" maxlength="2000"></label></div>
      <button class="btn peq" onclick="LGL.pvCriar('${cid}')">Adicionar prova</button>
      ${provas.lacunas.length ? `<div class="aviso">⚠️ ${provas.lacunas.length} fato(s) alegado(s)/controvertido(s) SEM prova vinculada — é o furo clássico do Cap. 24.1.</div>` : ''}
      ${provas.provas.length ? tabela(['Prova', 'Tipo', 'Fato', 'Situação', 'Pedido', ''], provas.provas.map(p => [
        esc(p.prova), LGL.tag(p.tipo), esc(String(p.fato || '—').slice(0, 60)), LGL.tag(p.situacao), esc(p.pedido_vinculado || '—'),
        `<button class="btn secund peq" onclick="LGL.pvRemover('${p.id}')">×</button>`])) : '<p class="vazio">—</p>'}</div>

      <div class="card"><h3>🔍 Diagnóstico do processo (Cap. 21.9)</h3>
      ${LGL.box('➕ Novo diagnóstico', `
        <label>Cronologia (Cap. 21.2) <textarea id="lgl-dg-cro" rows="3" maxlength="20000"></textarea></label>
        <label>Peças relevantes <textarea id="lgl-dg-pec" rows="2" maxlength="8000"></textarea></label>
        <label>Alegações das partes <textarea id="lgl-dg-ale" rows="2" maxlength="8000"></textarea></label>
        <label>Pedidos e fundamentos <textarea id="lgl-dg-ped" rows="2" maxlength="8000"></textarea></label>
        <label>Preliminares e prejudiciais <textarea id="lgl-dg-pre" rows="2" maxlength="4000"></textarea></label>
        <label>Pontos controvertidos <textarea id="lgl-dg-ctr" rows="2" maxlength="4000"></textarea></label>
        <label>Riscos, lacunas e documentos faltantes <textarea id="lgl-dg-ris" rows="2" maxlength="4000"></textarea></label>`,
        'Registrar diagnóstico', `LGL.dgCriar('${cid}')`)}
      ${diag.diagnosticos.length ? tabela(['Quando', 'Origem', 'Status', 'Validado por', ''], diag.diagnosticos.map(d => [
        LG.dt(d.criado_em), LGL.tag(d.origem), LGL.tag(d.status), esc(d.validado_por || '—'),
        d.status === 'rascunho' ? `<button class="btn peq" onclick="LGL.dgValidar('${d.id}')">✅ Validar</button>` : ''])) : '<p class="vazio">—</p>'}</div>

      <div class="card"><h3>⚖️ Matriz de recursos cabíveis (Cap. 26.3)</h3>
      <div class="hi-grid"><label>Decisão <input id="lgl-rc-dec" maxlength="1000"></label>
        <label>Recurso <input id="lgl-rc-rec" maxlength="200"></label>
        <label>Prazo (dias) <input id="lgl-rc-pz" type="number"></label>
        <label>Prazo fatal <input id="lgl-rc-pf" type="date"></label>
        <label>Custo (R$) <input id="lgl-rc-cu" type="number" step="0.01"></label>
        <label>Chance ${LGL.sel('lgl-rc-ch', ['provavel', 'possivel', 'remoto'], 'possivel')}</label>
        <label>Efeito <input id="lgl-rc-ef" maxlength="200" placeholder="suspensivo/devolutivo"></label></div>
      <label>Fundamento <input id="lgl-rc-fu" maxlength="4000"></label>
      <button class="btn peq" onclick="LGL.rcCriar('${cid}')">Adicionar opção recursal</button>
      ${est.recursos.length ? tabela(['Recurso', 'Prazo', 'Custo', 'Chance', 'Recomendação', ''], est.recursos.map(r => [
        esc(r.recurso), esc(r.prazo_fatal || (r.prazo_dias + ' dias')), LGL.brl(r.custo_centavos), LGL.tag(r.chance),
        LGL.tag(r.recomendacao) + (r.decidido_por ? `<span class="sub"> ${esc(r.decidido_por)}</span>` : ''),
        r.recomendacao === 'a_decidir' ? `<button class="btn peq" onclick="LGL.rcDecidir('${r.id}','interpor')">interpor</button>
          <button class="btn secund peq" onclick="LGL.rcDecidir('${r.id}','nao_interpor')">não interpor</button>` : ''])) : '<p class="vazio">—</p>'}</div>

      <div class="card"><h3>🤝 Tratativas de negociação (Cap. 30.6)</h3>
      <div class="hi-grid"><label>Rodada <input id="lgl-ng-rod" type="number" value="1" min="1"></label>
        <label>Ponto <input id="lgl-ng-pt" maxlength="1000"></label>
        <label>Resultado ${LGL.sel('lgl-ng-res', ['aberto', 'acordado', 'impasse', 'retirado'], 'aberto')}</label></div>
      <label>Nossa posição <input id="lgl-ng-nos" maxlength="4000"></label>
      <label>Posição da contraparte <input id="lgl-ng-con" maxlength="4000"></label>
      <button class="btn peq" onclick="LGL.ngCriar('${cid}')">Registrar rodada</button>
      ${est.negociacao.length ? tabela(['Rodada', 'Ponto', 'Nossa', 'Contraparte', 'Resultado'], est.negociacao.map(n => [
        n.rodada, esc(n.ponto), esc(n.posicao_nossa || '—'), esc(n.posicao_contraria || '—'), LGL.tag(n.resultado)])) : '<p class="vazio">—</p>'}</div>`;
    LG.body().innerHTML = h;
  };

  LGL.esSalvar = (cid) => LGL.post('/estrategia/' + cid, {
    objetivo_juridico: LGL.v('lgl-es-oj'), objetivo_cliente: LGL.v('lgl-es-oc'),
    teses_principais: LGL.v('lgl-es-tp'), teses_subsidiarias: LGL.v('lgl-es-ts'),
    provas_necessarias: LGL.v('lgl-es-pn'), batna: LGL.v('lgl-es-ba'),
    faixa_acordo_min: LGL.cent('lgl-es-min'), faixa_acordo_max: LGL.cent('lgl-es-max'),
    custo_estimado: LGL.cent('lgl-es-cu'), duracao_estimada: LGL.v('lgl-es-du'),
  }, 'Estratégia salva.');
  LGL.ceCriar = (cid) => LGL.post(`/estrategia/${cid}/cenarios`, {
    cenario: LGL.v('lgl-ce-txt'), probabilidade: LGL.v('lgl-ce-prob'), impacto_centavos: LGL.cent('lgl-ce-imp'),
    incerteza: LGL.v('lgl-ce-inc'), providencia: LGL.v('lgl-ce-prov'),
  }, false);
  LGL.ceRemover = (id) => LGL.del('/estrategia/cenarios/' + id, 'Excluir cenário?');
  LGL.deCriar = (cid) => LGL.post(`/estrategia/${cid}/decisoes`, {
    decisao: LGL.v('lgl-de-dec'), alternativas: LGL.v('lgl-de-alt'), motivo: LGL.v('lgl-de-mot'),
    cliente_ciente: LGL.chk('lgl-de-cli'),
  }, false);
  LGL.ftCriar = (cid) => LGL.post(`/matrizes/${cid}/fatos`, {
    fato: LGL.v('lgl-ft-txt'), situacao: LGL.v('lgl-ft-sit'), fonte: LGL.v('lgl-ft-fonte'), quem_alega: LGL.v('lgl-ft-quem'),
  }, false);
  LGL.ftRemover = (id) => LGL.del('/matrizes/fatos/' + id, 'Excluir fato?');
  LGL.pvCriar = (cid) => LGL.post(`/matrizes/${cid}/provas`, {
    prova: LGL.v('lgl-pv-txt'), tipo: LGL.v('lgl-pv-tipo'), fato_id: LGL.v('lgl-pv-fato'), situacao: LGL.v('lgl-pv-sit'),
    pedido_vinculado: LGL.v('lgl-pv-ped'), autenticidade: LGL.v('lgl-pv-aut'),
    cadeia_custodia: LGL.v('lgl-pv-cad'), contradicao: LGL.v('lgl-pv-con'),
  }, false);
  LGL.pvRemover = (id) => LGL.del('/matrizes/provas/' + id, 'Excluir prova?');
  LGL.dgCriar = (cid) => LGL.post(`/matrizes/${cid}/diagnosticos`, {
    cronologia: LGL.v('lgl-dg-cro'), pecas_relevantes: LGL.v('lgl-dg-pec'), alegacoes: LGL.v('lgl-dg-ale'),
    pedidos_fundamentos: LGL.v('lgl-dg-ped'), preliminares: LGL.v('lgl-dg-pre'),
    controvertidos: LGL.v('lgl-dg-ctr'), riscos_lacunas: LGL.v('lgl-dg-ris'),
  }, 'Diagnóstico registrado como rascunho.');
  LGL.dgValidar = (id) => LGL.post(`/matrizes/diagnosticos/${id}/validar`, {}, 'Diagnóstico validado.');
  LGL.rcCriar = (cid) => LGL.post(`/estrategia/${cid}/recursos`, {
    decisao: LGL.v('lgl-rc-dec'), recurso: LGL.v('lgl-rc-rec'), prazo_dias: LGL.n('lgl-rc-pz'),
    prazo_fatal: LGL.v('lgl-rc-pf'), custo_centavos: LGL.cent('lgl-rc-cu'), chance: LGL.v('lgl-rc-ch'),
    efeito: LGL.v('lgl-rc-ef'), fundamento: LGL.v('lgl-rc-fu'),
  }, false);
  LGL.rcDecidir = (id, recomendacao) => LGL.post(`/estrategia/recursos/${id}/decidir`, {
    recomendacao, fundamento: prompt('Fundamento da decisão:') || '',
  }, 'Decisão registrada.');
  LGL.ngCriar = (cid) => LGL.post('/estrategia/negociacao', {
    case_id: cid, rodada: LGL.n('lgl-ng-rod') || 1, ponto: LGL.v('lgl-ng-pt'),
    posicao_nossa: LGL.v('lgl-ng-nos'), posicao_contraria: LGL.v('lgl-ng-con'), resultado: LGL.v('lgl-ng-res'),
  }, false);

  // ========================================= 47.9 · CICLO CONTRATUAL
  VIEWS.ciclo = async function () {
    const [{ contratos, alertas }, { clausulas }] = await Promise.all([
      LG.api('GET', '/contratos-ciclo'), LG.api('GET', '/clausulas'),
    ]);
    let h = LGL.livro('Protótipo 47.9 — ciclo completo do Cap. 29: solicitação → minuta → negociação → <b>aprovação por alçada</b> → assinatura → obrigações e renovação. Assinatura fica bloqueada sem alçada aprovada.');

    if (alertas.renovacoes.length || alertas.atrasadas.length) {
      h += `<div class="card" style="border-color:var(--alerta)"><h3>🔔 Alertas de renovação e obrigações (Cap. 29.11)</h3>
        ${alertas.renovacoes.length ? tabela(['Contrato', 'Fim da vigência', 'Denunciar até', 'Situação'], alertas.renovacoes.map(c => [
          esc(c.titulo), LG.dt(c.vigencia_fim), LG.dt(c.denuncia_ate),
          c.vencido_aviso ? '<b>janela de denúncia perdida — renova automático</b>' : (c.urgente ? '⚠️ decidir agora' : 'monitorar')])) : ''}
        ${alertas.atrasadas.length ? tabela(['Obrigação atrasada', 'Contrato', 'Vencia em'], alertas.atrasadas.map(o => [
          esc(o.descricao), esc(o.contrato), LG.dt(o.data_limite)])) : ''}</div>`;
    }

    h += LGL.box('➕ Novo contrato (solicitação)', `
      <label>Título * <input id="lgl-ct-tit" maxlength="300"></label>
      <div class="hi-grid"><label>Tipo ${LGL.sel('lgl-ct-tipo', ['servicos', 'nda', 'honorarios', 'locacao', 'fornecimento', 'societario', 'outro'], 'servicos')}</label>
        <label>Contraparte <input id="lgl-ct-cp" maxlength="300"></label>
        <label>client_id <input id="lgl-ct-cli" maxlength="40"></label>
        <label>Valor (R$) <input id="lgl-ct-val" type="number" step="0.01"></label>
        <label>Início <input id="lgl-ct-ini" type="date"></label>
        <label>Fim <input id="lgl-ct-fim" type="date"></label>
        <label>Alçada ${LGL.sel('lgl-ct-alc', ['coordenador', 'socio', 'comite'], 'socio')}</label>
        <label>Aviso prévio (dias) <input id="lgl-ct-avi" type="number" value="30"></label></div>
      <label><input type="checkbox" id="lgl-ct-ren"> Renovação automática</label>
      <label>Objeto <textarea id="lgl-ct-obj" rows="2" maxlength="4000"></textarea></label>`,
      'Criar contrato', 'LGL.ctCriar()');

    h += `<div class="card"><h3>📜 Contratos</h3>${contratos.length ? tabela(
      ['Título', 'Contraparte', 'Tipo', 'Status', 'Vigência', 'Obrig.', ''],
      contratos.map(c => [esc(c.titulo), esc(c.contraparte || '—'), LGL.tag(c.tipo), LGL.tag(c.status),
        `${LG.dt(c.vigencia_inicio)} → ${LG.dt(c.vigencia_fim)}`, c.obrigacoes_pendentes,
        `<button class="btn secund peq" onclick="LGL.ctAbrir('${c.id}')">abrir</button>`])) : '<p class="vazio">Nenhum contrato.</p>'}</div>`;

    const temas = [...new Set(clausulas.map(c => c.tema))];
    h += `<div class="card"><h3>📗 Biblioteca de cláusulas em três níveis (Cap. 29.3)</h3>
      ${LGL.box('➕ Nova cláusula', `
        <div class="hi-grid"><label>Tema * <input id="lgl-cl-tema" maxlength="200" placeholder="limitação de responsabilidade"></label>
          <label>Nível ${LGL.sel('lgl-cl-niv', ['preferencial', 'aceitavel', 'inaceitavel'], 'preferencial')}</label>
          <label>Área <input id="lgl-cl-area" maxlength="60"></label>
          <label>Risco <input id="lgl-cl-risco" maxlength="20" placeholder="alto/medio/baixo"></label></div>
        <label>Texto da cláusula <textarea id="lgl-cl-txt" rows="3" maxlength="20000"></textarea></label>
        <label>Justificativa (obrigatória se INACEITÁVEL) <textarea id="lgl-cl-just" rows="2" maxlength="4000"></textarea></label>
        <label>Posição de recuo / fallback (Cap. 29.8) <textarea id="lgl-cl-fb" rows="2" maxlength="8000"></textarea></label>`,
        'Cadastrar cláusula', 'LGL.clCriar()')}
      ${temas.map(t => `<div style="margin:.5rem 0"><b>${esc(t)}</b>
        ${tabela(['Nível', 'Texto', 'Justificativa', ''], clausulas.filter(c => c.tema === t).map(c => [
          LGL.tag(c.nivel, c.nivel === 'inaceitavel' ? '#b3261e' : (c.nivel === 'preferencial' ? '#14532D' : '')),
          esc(String(c.texto).slice(0, 200)), esc(String(c.justificativa || '—').slice(0, 120)),
          `<button class="btn secund peq" onclick="LGL.clRemover('${c.id}')">×</button>`]))}</div>`).join('') || '<p class="vazio">Nenhuma cláusula cadastrada.</p>'}</div>`;
    LG.body().innerHTML = h;
  };

  LGL.ctCriar = async function () {
    if (!LGL.v('lgl-ct-tit')) return alert('Informe o título.');
    await LGL.post('/contratos-ciclo', {
      titulo: LGL.v('lgl-ct-tit'), tipo: LGL.v('lgl-ct-tipo'), contraparte: LGL.v('lgl-ct-cp'),
      client_id: LGL.v('lgl-ct-cli'), valor_centavos: LGL.cent('lgl-ct-val'),
      vigencia_inicio: LGL.v('lgl-ct-ini'), vigencia_fim: LGL.v('lgl-ct-fim'), alcada: LGL.v('lgl-ct-alc'),
      aviso_previo_dias: LGL.n('lgl-ct-avi') || 30, renovacao_automatica: LGL.chk('lgl-ct-ren'), objeto: LGL.v('lgl-ct-obj'),
    }, 'Contrato criado.');
  };

  LGL.ctAbrir = async function (id) {
    const { contrato: c } = await LG.api('GET', '/contratos-ciclo/' + id);
    const fases = ['solicitado', 'minuta', 'negociacao', 'aprovacao', 'assinatura', 'vigente', 'encerrado', 'rescindido'];
    LG.body().innerHTML = `<p><button class="btn secund peq" onclick="LG.ir('ciclo')">← Contratos</button></p>
      <div class="card"><h3>${esc(c.titulo)} ${LGL.tag(c.status)}</h3>
      <p class="sub">${esc(c.contraparte || '')} · ${LGL.brl(c.valor_centavos)} · vigência ${LG.dt(c.vigencia_inicio)} → ${LG.dt(c.vigencia_fim)}
        · alçada <b>${esc(c.alcada)}</b> · aviso prévio ${c.aviso_previo_dias} dias ${c.renovacao_automatica ? '· 🔁 renova automático' : ''}</p>
      <p>${esc(c.objeto || '')}</p>
      <label>Análise de risco (Cap. 29.5) <textarea id="lgl-ct-risco" rows="2" maxlength="4000">${esc(c.risco || '')}</textarea></label>
      <button class="btn secund peq" onclick="LGL.ctSalvarRisco('${c.id}')">Salvar risco</button>
      <p style="margin-top:.6rem">Mover para: ${fases.filter(f => f !== c.status).map(f =>
        `<button class="btn secund peq" onclick="LGL.ctMover('${c.id}','${f}')">${f}</button>`).join(' ')}</p></div>

      <div class="card"><h3>✅ Aprovação por alçada (Cap. 29.9)</h3>
      <p class="sub">Sem aprovação registrada, o sistema recusa mover para assinatura/vigência.</p>
      <button class="btn peq" onclick="LGL.ctPedirAprov('${c.id}')">Solicitar aprovação (${esc(c.alcada)})</button>
      ${(c.aprovacoes || []).length ? tabela(['Nível', 'Decisão', 'Aprovador', 'Ressalvas', ''], c.aprovacoes.map(a => [
        esc(a.nivel), LGL.tag(a.decisao), esc(a.aprovador || '—'), esc(a.ressalvas || '—'),
        a.decisao === 'pendente' ? `<button class="btn peq" onclick="LGL.ctDecidir('${a.id}','aprovado')">aprovar</button>
          <button class="btn secund peq" onclick="LGL.ctDecidir('${a.id}','com_ressalva')">c/ ressalva</button>
          <button class="btn secund peq" onclick="LGL.ctDecidir('${a.id}','reprovado')">reprovar</button>` : ''])) : '<p class="vazio">Nenhuma aprovação solicitada.</p>'}</div>

      <div class="card"><h3>📌 Obrigações, renovação e denúncia (Cap. 29.11)</h3>
      <div class="hi-grid"><label>Descrição <input id="lgl-ob-desc" maxlength="2000"></label>
        <label>Tipo ${LGL.sel('lgl-ob-tipo', ['obrigacao', 'pagamento', 'entrega', 'renovacao', 'denuncia', 'relatorio'], 'obrigacao')}</label>
        <label>De quem ${LGL.sel('lgl-ob-parte', ['nossa', 'contraparte', 'ambas'], 'nossa')}</label>
        <label>Data limite <input id="lgl-ob-data" type="date"></label>
        <label>Periodicidade ${LGL.sel('lgl-ob-per', ['unica', 'mensal', 'trimestral', 'semestral', 'anual'], 'unica')}</label>
        <label>Alertar (dias antes) <input id="lgl-ob-al" type="number" value="15"></label></div>
      <button class="btn peq" onclick="LGL.obCriar('${c.id}')">Adicionar obrigação</button>
      ${(c.obrigacoes || []).length ? tabela(['Obrigação', 'Tipo', 'De quem', 'Prazo', 'Status', ''], c.obrigacoes.map(o => [
        esc(o.descricao), LGL.tag(o.tipo), esc(o.responsavel_parte), LG.dt(o.data_limite), LGL.tag(o.status),
        o.status !== 'cumprida' ? `<button class="btn peq" onclick="LGL.obCumprir('${o.id}')">cumprida</button>` : ''])) : '<p class="vazio">—</p>'}</div>

      <div class="card"><h3>🤝 Negociação (Cap. 29.8 / 30.6)</h3>
      <div class="hi-grid"><label>Rodada <input id="lgl-cn-rod" type="number" value="1" min="1"></label>
        <label>Ponto <input id="lgl-cn-pt" maxlength="1000"></label>
        <label>Resultado ${LGL.sel('lgl-cn-res', ['aberto', 'acordado', 'impasse', 'retirado'], 'aberto')}</label></div>
      <label>Nossa posição <input id="lgl-cn-nos" maxlength="4000"></label>
      <label>Posição da contraparte <input id="lgl-cn-con" maxlength="4000"></label>
      <button class="btn peq" onclick="LGL.cnCriar('${c.id}')">Registrar rodada</button>
      ${(c.negociacao || []).length ? tabela(['Rodada', 'Ponto', 'Nossa', 'Contraparte', 'Resultado'], c.negociacao.map(n => [
        n.rodada, esc(n.ponto), esc(n.posicao_nossa || '—'), esc(n.posicao_contraria || '—'), LGL.tag(n.resultado)])) : '<p class="vazio">—</p>'}</div>`;
  };

  LGL.ctSalvarRisco = (id) => LGL.patch('/contratos-ciclo/' + id, { risco: LGL.v('lgl-ct-risco') }, 'Risco salvo.').then(() => LGL.ctAbrir(id)).catch(() => {});
  LGL.ctMover = (id, status) => LGL.post(`/contratos-ciclo/${id}/mover`, { status }, 'Fase atualizada.').then(() => LGL.ctAbrir(id)).catch(() => {});
  LGL.ctPedirAprov = (id) => LGL.post(`/contratos-ciclo/${id}/aprovacao`, {}, 'Aprovação solicitada.').then(() => LGL.ctAbrir(id)).catch(() => {});
  LGL.ctDecidir = async function (aprovacaoId, decisao) {
    const ressalvas = decisao === 'com_ressalva' ? (prompt('Descreva a ressalva:') || '') : '';
    if (decisao === 'com_ressalva' && !ressalvas) return alert('Ressalva é obrigatória.');
    try { const r = await LG.api('POST', '/contratos-ciclo/aprovacoes/' + aprovacaoId, { decisao, ressalvas }); LGL.ctAbrir(r.contrato.id); }
    catch (e) { alert('Erro: ' + e.message); }
  };
  LGL.obCriar = (cid) => LGL.post(`/contratos-ciclo/${cid}/obrigacoes`, {
    descricao: LGL.v('lgl-ob-desc'), tipo: LGL.v('lgl-ob-tipo'), responsavel_parte: LGL.v('lgl-ob-parte'),
    data_limite: LGL.v('lgl-ob-data'), periodicidade: LGL.v('lgl-ob-per'), alerta_dias: LGL.n('lgl-ob-al') || 15,
  }, false).then(() => LGL.ctAbrir(cid)).catch(() => {});
  LGL.obCumprir = async function (id) {
    try { const r = await LG.api('PATCH', '/contratos-ciclo/obrigacoes/' + id, { status: 'cumprida' }); LGL.ctAbrir(r.obrigacao.contract_id); }
    catch (e) { alert('Erro: ' + e.message); }
  };
  LGL.cnCriar = (cid) => LGL.post('/estrategia/negociacao', {
    contract_id: cid, rodada: LGL.n('lgl-cn-rod') || 1, ponto: LGL.v('lgl-cn-pt'),
    posicao_nossa: LGL.v('lgl-cn-nos'), posicao_contraria: LGL.v('lgl-cn-con'), resultado: LGL.v('lgl-cn-res'),
  }, false).then(() => LGL.ctAbrir(cid)).catch(() => {});
  LGL.clCriar = async function () {
    if (!LGL.v('lgl-cl-tema')) return alert('Informe o tema.');
    await LGL.post('/clausulas', {
      tema: LGL.v('lgl-cl-tema'), nivel: LGL.v('lgl-cl-niv'), area: LGL.v('lgl-cl-area'),
      risco: LGL.v('lgl-cl-risco'), texto: LGL.v('lgl-cl-txt'), justificativa: LGL.v('lgl-cl-just'), fallback: LGL.v('lgl-cl-fb'),
    }, 'Cláusula cadastrada.');
  };
  LGL.clRemover = (id) => LGL.del('/clausulas/' + id, 'Excluir cláusula?');

  // ================================ 47.10 · FINANCEIRO+ e 37.5 HORAS
  VIEWS.financeiro2 = async function () {
    const podeFin = !!LG.perm.ver_financeiro;
    const [fin, horas, cap] = await Promise.all([
      podeFin ? LG.api('GET', '/fin/painel') : Promise.resolve({ resumo: null, fluxo: [] }),
      LG.api('GET', '/fin/horas?n=200').catch(() => ({ horas: [] })),
      LG.api('GET', '/fin/capacidade').catch(() => ({ pessoas: [], periodo: {} })),
    ]);
    let h = LGL.livro('Protótipo 47.10 (Cap. 38) + apontamento de horas do Cap. 37.5. A cobrança do <b>2º aviso em diante</b> só sai com aprovação humana — trava do próprio livro.');

    if (fin.resumo) {
      const r = fin.resumo;
      const kpi = (rot, val, alerta) => `<div class="card" style="min-width:150px;flex:1${alerta && val ? ';border-color:var(--alerta)' : ''}">
        <div class="sub">${rot}</div><div style="font-size:1.3rem;font-weight:700">${val}</div></div>`;
      h += `<div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
        ${kpi('A receber', LGL.brl(r.a_receber))}${kpi('Inadimplência', LGL.brl(r.inadimplencia_valor) + ` (${r.inadimplencia_qtd})`, true)}
        ${kpi('Recebido 30d', LGL.brl(r.recebido_30d))}${kpi('Prazo médio receb.', r.prazo_medio_recebimento_dias + 'd')}
        ${kpi('Vencendo em 7d', r.faturas_vencendo_7d)}${kpi('Horas não faturadas', (Math.round(r.horas_nao_faturadas / 6) / 10) + 'h', true)}
        ${kpi('Cobranças p/ aprovar', r.cobrancas_aguardando_aprovacao, true)}</div>
        <div class="card"><h3>💵 Fluxo de caixa projetado (Cap. 38.7)</h3>
        ${tabela(['Competência', 'A receber', 'A pagar', 'Saldo'], fin.fluxo.map(f => [
          f.competencia, LGL.brl(f.receber), LGL.brl(f.pagar),
          `<b style="color:${f.saldo < 0 ? '#b3261e' : '#14532D'}">${LGL.brl(f.saldo)}</b>`]))}</div>`;
    }

    h += `<div class="card"><h3>⏱️ Apontamento de horas (Cap. 37.5)</h3>
      <div class="hi-grid"><label>Data <input id="lgl-hr-data" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
        <label>Minutos <input id="lgl-hr-min" type="number" min="1" max="1440"></label>
        <label>case_id <input id="lgl-hr-case" maxlength="40"></label>
        <label>client_id <input id="lgl-hr-cli" maxlength="40"></label>
        <label>Valor/hora (R$) <input id="lgl-hr-vh" type="number" step="0.01" placeholder="usa o do contrato"></label></div>
      <label>Atividade * <input id="lgl-hr-ativ" maxlength="1000"></label>
      <label><input type="checkbox" id="lgl-hr-fat" checked> Faturável</label>
      <button class="btn peq" onclick="LGL.hrCriar()">Apontar</button>
      ${horas.horas.length ? tabela(['Data', 'Quem', 'Tempo', 'Atividade', 'Faturável', 'Faturada', ''], horas.horas.slice(0, 50).map(t => [
        LG.dt(t.data), esc(t.quem || ''), (Math.round(t.minutos / 6) / 10) + 'h', esc(t.atividade),
        t.faturavel ? 'sim' : 'não', t.invoice_id ? 'sim' : '—',
        t.invoice_id ? '' : `<button class="btn secund peq" onclick="LGL.hrRemover('${t.id}')">×</button>`])) : '<p class="vazio">Nenhum apontamento.</p>'}</div>`;

    if (cap.pessoas && cap.pessoas.length) {
      h += `<div class="card"><h3>📊 Capacidade e carga (Cap. 37.6/37.7)</h3>
        ${tabela(['Pessoa', 'Horas', 'Faturáveis', 'Aproveitamento', 'Processos'], cap.pessoas.map(p => [
          esc(p.quem || p.user_id), p.horas + 'h', p.horas_faturaveis + 'h', p.aproveitamento_pct + '%', p.processos]))}</div>`;
    }

    if (podeFin) {
      const [{ faturas }, { honorarios }, { fila }, { linhas }] = await Promise.all([
        LG.api('GET', '/fin/faturas'), LG.api('GET', '/fin/honorarios'),
        LG.api('GET', '/fin/cobrancas'), LG.api('GET', '/fin/orcamento'),
      ]);
      h += `<div class="card"><h3>🧾 Contratos de honorários (Cap. 38.1/38.2)</h3>
        ${LGL.box('➕ Novo contrato de honorários', `
          <div class="hi-grid"><label>client_id * <input id="lgl-fh-cli" maxlength="40"></label>
            <label>case_id <input id="lgl-fh-case" maxlength="40"></label>
            <label>Modalidade ${LGL.sel('lgl-fh-mod', ['fixo', 'mensal', 'hora', 'exito', 'misto'], 'fixo')}</label>
            <label>Valor (R$) <input id="lgl-fh-val" type="number" step="0.01"></label>
            <label>Valor/hora (R$) <input id="lgl-fh-vh" type="number" step="0.01"></label>
            <label>% de êxito <input id="lgl-fh-exi" type="number" step="0.1"></label>
            <label>Parcelas <input id="lgl-fh-par" type="number" value="1" min="1"></label>
            <label>Dia do vencimento <input id="lgl-fh-dia" type="number" value="10" min="1" max="28"></label></div>
          <label>Reembolsáveis (Cap. 38.6) <input id="lgl-fh-reemb" maxlength="2000"></label>`,
          'Cadastrar', 'LGL.fhCriar()')}
        ${honorarios.length ? tabela(['Cliente', 'Modalidade', 'Valor', 'Valor/hora', '% êxito', 'Status'], honorarios.map(f => [
          esc(f.cliente || f.client_id), LGL.tag(f.modalidade), LGL.brl(f.valor_centavos), LGL.brl(f.valor_hora_centavos),
          f.percentual_exito + '%', LGL.tag(f.status)])) : '<p class="vazio">—</p>'}</div>

        <div class="card"><h3>📑 Faturas (Cap. 38.3/38.4)</h3>
        <div class="hi-grid"><label>client_id <input id="lgl-fv-cli" maxlength="40"></label>
          <label>Competência <input id="lgl-fv-comp" maxlength="7" placeholder="2026-07"></label>
          <label>Vencimento <input id="lgl-fv-venc" type="date"></label></div>
        <button class="btn peq" onclick="LGL.fvDeHoras()">Faturar horas em aberto do cliente</button>
        ${faturas.length ? tabela(['Cliente', 'Comp.', 'Valor', 'Pago', 'Vencimento', 'Status', ''], faturas.map(f => [
          esc(f.cliente || f.client_id), esc(f.competencia), LGL.brl(f.valor_centavos), LGL.brl(f.pago_centavos),
          LG.dt(f.vencimento), LGL.tag(f.status),
          `<button class="btn secund peq" onclick="LGL.fvAbrir('${f.id}')">abrir</button>`])) : '<p class="vazio">Nenhuma fatura.</p>'}</div>

        <div class="card"><h3>📣 Cobrança escalonada (Cap. 38.5)</h3>
        <p class="sub">Nível 1 = lembrete. Nível 2+ exige aprovação humana antes de sair.</p>
        ${fila.length ? tabela(['Cliente', 'Nível', 'Canal', 'Status', 'Valor', ''], fila.map(c => [
          esc(c.cliente || ''), c.nivel, esc(c.canal), LGL.tag(c.status), LGL.brl(c.valor_centavos),
          (c.status === 'rascunho' && c.nivel >= 2 ? `<button class="btn peq" onclick="LGL.cbAprovar('${c.id}')">aprovar</button> ` : '')
          + `<button class="btn secund peq" onclick="LGL.cbEnviada('${c.id}')">marcar enviada</button>`])) : '<p class="vazio">Nada na fila.</p>'}</div>

        <div class="card"><h3>🎯 Orçamento (Cap. 38.9 · centro de custo 39.3)</h3>
        <div class="hi-grid"><label>Competência <input id="lgl-or-comp" maxlength="7" placeholder="2026-07"></label>
          <label>Categoria <input id="lgl-or-cat" maxlength="120"></label>
          <label>Natureza ${LGL.sel('lgl-or-nat', ['despesa', 'receita'], 'despesa')}</label>
          <label>Previsto (R$) <input id="lgl-or-prev" type="number" step="0.01"></label>
          <label>Realizado (R$) <input id="lgl-or-real" type="number" step="0.01"></label>
          <label>Centro de custo <input id="lgl-or-cc" maxlength="120"></label></div>
        <button class="btn peq" onclick="LGL.orSalvar()">Salvar linha</button>
        ${linhas.length ? tabela(['Comp.', 'Categoria', 'Natureza', 'Previsto', 'Realizado', 'Desvio', ''], linhas.map(l => [
          esc(l.competencia), esc(l.categoria), esc(l.natureza), LGL.brl(l.previsto_centavos), LGL.brl(l.realizado_centavos),
          LGL.brl(l.realizado_centavos - l.previsto_centavos),
          `<button class="btn secund peq" onclick="LGL.orRemover('${l.id}')">×</button>`])) : '<p class="vazio">—</p>'}</div>

        <div class="card"><h3>💹 Rentabilidade por cliente (Cap. 38.10)</h3>
        <button class="btn secund peq" onclick="LGL.rentabilidade()">Calcular (12 meses)</button>
        <div id="lgl-rent"></div></div>`;
    }
    LG.body().innerHTML = h;
  };

  LGL.hrCriar = async function () {
    if (!LGL.v('lgl-hr-ativ')) return alert('Descreva a atividade.');
    await LGL.post('/fin/horas', {
      data: LGL.v('lgl-hr-data'), minutos: LGL.n('lgl-hr-min'), case_id: LGL.v('lgl-hr-case'),
      client_id: LGL.v('lgl-hr-cli'), valor_hora_centavos: LGL.cent('lgl-hr-vh'),
      atividade: LGL.v('lgl-hr-ativ'), faturavel: LGL.chk('lgl-hr-fat'),
    }, false);
  };
  LGL.hrRemover = (id) => LGL.del('/fin/horas/' + id, 'Excluir apontamento?');
  LGL.fhCriar = async function () {
    if (!LGL.v('lgl-fh-cli')) return alert('Informe o client_id.');
    await LGL.post('/fin/honorarios', {
      client_id: LGL.v('lgl-fh-cli'), case_id: LGL.v('lgl-fh-case'), modalidade: LGL.v('lgl-fh-mod'),
      valor_centavos: LGL.cent('lgl-fh-val'), valor_hora_centavos: LGL.cent('lgl-fh-vh'),
      percentual_exito: LGL.n('lgl-fh-exi'), parcelas: LGL.n('lgl-fh-par') || 1,
      dia_vencimento: LGL.n('lgl-fh-dia') || 10, reembolsaveis: LGL.v('lgl-fh-reemb'),
    }, 'Contrato de honorários cadastrado.');
  };
  LGL.fvDeHoras = async function () {
    if (!LGL.v('lgl-fv-cli')) return alert('Informe o client_id.');
    await LGL.post('/fin/faturas/de-horas', {
      client_id: LGL.v('lgl-fv-cli'), competencia: LGL.v('lgl-fv-comp'), vencimento: LGL.v('lgl-fv-venc'),
    }, 'Fatura gerada a partir das horas em aberto.');
  };
  LGL.fvAbrir = async function (id) {
    const { fatura: f } = await LG.api('GET', '/fin/faturas/' + id);
    LG.body().innerHTML = `<p><button class="btn secund peq" onclick="LG.ir('financeiro2')">← Financeiro+</button></p>
      <div class="card"><h3>Fatura ${esc(f.numero || f.id)} ${LGL.tag(f.status)}</h3>
      <p class="sub">Competência ${esc(f.competencia)} · vencimento ${LG.dt(f.vencimento)} · total <b>${LGL.brl(f.valor_centavos)}</b> · pago ${LGL.brl(f.pago_centavos)}</p>
      ${tabela(['Item', 'Tipo', 'Valor'], (f.itens || []).map(i => [esc(i.descricao), esc(i.tipo), LGL.brl(i.valor_centavos)]))}
      <div class="hi-grid"><label>Status ${LGL.sel('lgl-fv-st', ['rascunho', 'emitida', 'enviada', 'paga', 'parcial', 'inadimplente', 'cancelada'], f.status)}</label>
        <label>Pago (R$) <input id="lgl-fv-pago" type="number" step="0.01" value="${(f.pago_centavos / 100).toFixed(2)}"></label>
        <label>Vencimento <input id="lgl-fv-v2" type="date" value="${esc(f.vencimento || '')}"></label>
        <label>Nota fiscal <input id="lgl-fv-nf" maxlength="60" value="${esc(f.nota_fiscal || '')}"></label></div>
      <button class="btn peq" onclick="LGL.fvSalvar('${f.id}')">Salvar</button></div>
      <div class="card"><h3>📣 Cobranças desta fatura</h3>
      <div class="hi-grid"><label>Nível <input id="lgl-cb-niv" type="number" min="1" value="${(f.cobrancas || []).length + 1}"></label>
        <label>Canal ${LGL.sel('lgl-cb-canal', ['email', 'whatsapp', 'telefone', 'carta', 'juridico'], 'email')}</label></div>
      <label>Texto <textarea id="lgl-cb-txt" rows="3" maxlength="8000"></textarea></label>
      <button class="btn peq" onclick="LGL.cbCriar('${f.id}')">Criar cobrança</button>
      ${(f.cobrancas || []).length ? tabela(['Nível', 'Canal', 'Status', 'Aprovada por', ''], f.cobrancas.map(c => [
        c.nivel, esc(c.canal), LGL.tag(c.status), esc(c.aprovada_por || '—'),
        (c.status === 'rascunho' && c.nivel >= 2 ? `<button class="btn peq" onclick="LGL.cbAprovar('${c.id}')">aprovar</button> ` : '')
        + (c.status !== 'enviada' ? `<button class="btn secund peq" onclick="LGL.cbEnviada('${c.id}')">marcar enviada</button>` : '')])) : '<p class="vazio">—</p>'}</div>`;
  };
  LGL.fvSalvar = (id) => LGL.patch('/fin/faturas/' + id, {
    status: LGL.v('lgl-fv-st'), pago_centavos: LGL.cent('lgl-fv-pago'),
    vencimento: LGL.v('lgl-fv-v2'), nota_fiscal: LGL.v('lgl-fv-nf'),
  }, 'Fatura atualizada.').then(() => LGL.fvAbrir(id)).catch(() => {});
  LGL.cbCriar = (fid) => LGL.post(`/fin/faturas/${fid}/cobrancas`, {
    nivel: LGL.n('lgl-cb-niv'), canal: LGL.v('lgl-cb-canal'), texto: LGL.v('lgl-cb-txt'),
  }, false).then(() => LGL.fvAbrir(fid)).catch(() => {});
  LGL.cbAprovar = (id) => LGL.post(`/fin/cobrancas/${id}/aprovar`, {}, 'Cobrança aprovada.');
  LGL.cbEnviada = (id) => LGL.post(`/fin/cobrancas/${id}/enviada`, {}, 'Envio registrado.');
  LGL.orSalvar = () => LGL.post('/fin/orcamento', {
    competencia: LGL.v('lgl-or-comp'), categoria: LGL.v('lgl-or-cat'), natureza: LGL.v('lgl-or-nat'),
    previsto_centavos: LGL.cent('lgl-or-prev'), realizado_centavos: LGL.cent('lgl-or-real'), centro_custo: LGL.v('lgl-or-cc'),
  }, false);
  LGL.orRemover = (id) => LGL.del('/fin/orcamento/' + id, 'Excluir linha do orçamento?');
  LGL.rentabilidade = async function () {
    const r = await LG.api('GET', '/fin/rentabilidade');
    document.getElementById('lgl-rent').innerHTML = tabela(
      ['Cliente', 'Faturado', 'Recebido', 'Despesas', 'Margem', 'Horas', 'R$/hora efetivo'],
      r.clientes.map(c => [esc(c.nome), LGL.brl(c.faturado), LGL.brl(c.recebido), LGL.brl(c.despesas),
        LGL.brl(c.margem), c.horas + 'h', LGL.brl(c.valor_hora_efetivo)]));
  };

  // ======================== 47.3 · PORTAL INTERNO (mural, POPs, decisões)
  VIEWS.interno = async function () {
    const [mural, pops, dec, ped, planos] = await Promise.all([
      LG.api('GET', '/interno/mural'), LG.api('GET', '/interno/pops'),
      LG.api('GET', '/interno/decisoes'), LG.api('GET', '/interno/pedidos'),
      LG.api('GET', '/crises/planos').catch(() => ({ planos: [] })),
    ]);
    let h = LGL.livro('Protótipo 47.3 (Cap. 36): avisos com <b>confirmação de ciência</b>, POPs versionados com checklist (7.6/7.7), registro de decisões internas (36.8) e solicitações entre áreas (36.9).');

    if (mural.pendencias_ciencia && mural.pendencias_ciencia.length) {
      h += `<div class="card" style="border-color:var(--alerta)"><h3>✋ Você ainda não deu ciência em ${mural.pendencias_ciencia.length} item(ns)</h3>
        ${mural.pendencias_ciencia.map(p => `<p>${esc(p.titulo)} ${LGL.tag(p.ref_tipo)}
          <button class="btn peq" onclick="LGL.ciencia('${p.ref_tipo}','${p.id}')">Dar ciência</button></p>`).join('')}</div>`;
    }

    if (LG.perm.gerir_pops) {
      h += LGL.box('➕ Novo aviso/comunicado', `
        <label>Título * <input id="lgl-mu-tit" maxlength="300"></label>
        <div class="hi-grid"><label>Tipo ${LGL.sel('lgl-mu-tipo', ['aviso', 'comunicado', 'noticia', 'treinamento'], 'aviso')}</label>
          <label>Expira em <input id="lgl-mu-exp" type="date"></label></div>
        <label>Corpo <textarea id="lgl-mu-corpo" rows="4" maxlength="20000"></textarea></label>
        <label><input type="checkbox" id="lgl-mu-cie"> Exige confirmação de ciência</label>
        <label><input type="checkbox" id="lgl-mu-fix"> Fixar no topo</label>`,
        'Publicar aviso', 'LGL.muCriar()');
    }
    h += `<div class="card"><h3>📌 Mural</h3>${mural.posts.length ? mural.posts.map(p => `<div class="card" style="padding:.6rem">
      ${p.fixado ? '📌 ' : ''}<b>${esc(p.titulo)}</b> ${LGL.tag(p.tipo)} <span class="sub">${LG.dt(p.publicado_em)} · ${esc(p.autor || '')}
      ${p.exige_ciencia ? ` · ${p.ciencias} ciência(s)` : ''}</span>
      <div>${esc(p.corpo).replace(/\n/g, '<br>')}</div>
      ${p.exige_ciencia ? `<button class="btn secund peq" onclick="LGL.ciencia('post','${p.id}')">Dar ciência</button> ` : ''}
      ${LG.perm.gerir_pops ? `<button class="btn secund peq" onclick="LGL.muRemover('${p.id}')">excluir</button>` : ''}
      </div>`).join('') : '<p class="vazio">Nenhum aviso.</p>'}</div>`;

    h += `<div class="card"><h3>📗 POPs — Procedimentos Operacionais Padrão (Cap. 7.6)</h3>
      ${LG.perm.gerir_pops ? LGL.box('➕ Novo POP', `
        <div class="hi-grid"><label>Código <input id="lgl-pop-cod" maxlength="40" placeholder="POP-01"></label>
          <label>Título * <input id="lgl-pop-tit" maxlength="300"></label>
          <label>Área <input id="lgl-pop-area" maxlength="60"></label></div>
        <label>Objetivo <input id="lgl-pop-obj" maxlength="4000"></label>
        <label>Gatilho (quando roda) <input id="lgl-pop-gat" maxlength="1000"></label>
        <label>Passos — um por linha, formato <code>ação | responsável | evidência</code>
          <textarea id="lgl-pop-passos" rows="5" maxlength="20000"></textarea></label>
        <label>Checklist — um por linha; termine com <code>*</code> se obrigatório
          <textarea id="lgl-pop-check" rows="4" maxlength="20000"></textarea></label>`,
        'Criar POP', 'LGL.popCriar()') : ''}
      ${pops.pops.length ? tabela(['Código', 'Título', 'Área', 'Versão', 'Status', 'Aprovado por', ''], pops.pops.map(p => [
        esc(p.codigo || '—'), esc(p.titulo), esc(p.area || '—'), 'v' + p.versao, LGL.tag(p.status), esc(p.aprovado_por || '—'),
        `<button class="btn secund peq" onclick="LGL.popAbrir('${p.id}')">abrir</button>`
        + (LG.perm.gerir_pops && p.status !== 'vigente' ? ` <button class="btn peq" onclick="LGL.popPublicar('${p.id}')">publicar</button>` : '')])) : '<p class="vazio">Nenhum POP.</p>'}</div>`;

    h += `<div class="card"><h3>🧭 Decisões internas (Cap. 36.8)</h3>
      ${LG.perm.gerir_pops ? `<div class="hi-grid"><label>Assunto <input id="lgl-di-ass" maxlength="300"></label>
        <label>Participantes <input id="lgl-di-part" maxlength="1000"></label>
        <label>Revisar em <input id="lgl-di-rev" type="date"></label></div>
        <label>Decisão * <input id="lgl-di-dec" maxlength="8000"></label>
        <label>Motivo <input id="lgl-di-mot" maxlength="4000"></label>
        <button class="btn peq" onclick="LGL.diCriar()">Registrar decisão</button>` : ''}
      ${dec.decisoes.length ? tabela(['Quando', 'Assunto', 'Decisão', 'Quem', 'Revisar em'], dec.decisoes.map(d => [
        LG.dt(d.criado_em), esc(d.assunto), esc(d.decisao), esc(d.quem || ''), LG.dt(d.revisar_em)])) : '<p class="vazio">—</p>'}</div>

      <div class="card"><h3>📨 Solicitações entre áreas (Cap. 36.9)</h3>
      <div class="hi-grid"><label>De <input id="lgl-ir-de" maxlength="60"></label>
        <label>Para <input id="lgl-ir-para" maxlength="60"></label>
        <label>Prioridade ${LGL.sel('lgl-ir-pri', ['alta', 'media', 'baixa'], 'media')}</label>
        <label>Prazo <input id="lgl-ir-prazo" type="date"></label></div>
      <label>Assunto * <input id="lgl-ir-ass" maxlength="300"></label>
      <label>Pedido <textarea id="lgl-ir-ped" rows="2" maxlength="4000"></textarea></label>
      <button class="btn peq" onclick="LGL.irCriar()">Abrir solicitação</button>
      ${ped.pedidos.length ? tabela(['Assunto', 'De → Para', 'Prazo', 'Prioridade', 'Status', ''], ped.pedidos.map(p => [
        esc(p.assunto), `${esc(p.de_area || '—')} → ${esc(p.para_area || '—')}`, LG.dt(p.prazo), LGL.tag(p.prioridade), LGL.tag(p.status),
        p.status !== 'concluida' ? `<button class="btn peq" onclick="LGL.irConcluir('${p.id}')">concluir</button>` : ''])) : '<p class="vazio">—</p>'}</div>`;

    if (planos.planos && planos.planos.length) {
      h += `<div class="card"><h3>🧯 Planos de continuidade (Cap. 44.9)</h3>
        ${tabela(['Cenário', 'RTO', 'Responsável', 'Último teste'], planos.planos.map(p => [
          esc(p.cenario), esc(p.rto || '—'), esc(p.responsavel || '—'),
          p.teste_vencido ? `<b style="color:#b3261e">${esc(p.ultimo_teste || 'nunca')}</b>` : esc(p.ultimo_teste)]))}</div>`;
    }
    LG.body().innerHTML = h;
  };

  LGL.ciencia = (ref_tipo, ref_id) => LGL.post('/interno/ciencia', { ref_tipo, ref_id }, 'Ciência registrada.');
  LGL.muCriar = async function () {
    if (!LGL.v('lgl-mu-tit')) return alert('Informe o título.');
    await LGL.post('/interno/mural', {
      titulo: LGL.v('lgl-mu-tit'), tipo: LGL.v('lgl-mu-tipo'), corpo: LGL.v('lgl-mu-corpo'),
      expira_em: LGL.v('lgl-mu-exp'), exige_ciencia: LGL.chk('lgl-mu-cie'), fixado: LGL.chk('lgl-mu-fix'),
    }, 'Aviso publicado.');
  };
  LGL.muRemover = (id) => LGL.del('/interno/mural/' + id, 'Excluir aviso?');
  LGL._passos = (txt) => txt.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
    const [acao, responsavel, evidencia] = l.split('|').map(x => (x || '').trim());
    return { ordem: i + 1, acao, responsavel, evidencia };
  });
  LGL._check = (txt) => txt.split('\n').map(l => l.trim()).filter(Boolean).map(l => ({
    item: l.replace(/\s*\*$/, ''), obrigatorio: /\*$/.test(l),
  }));
  LGL.popCriar = async function () {
    if (!LGL.v('lgl-pop-tit')) return alert('Informe o título.');
    await LGL.post('/interno/pops', {
      codigo: LGL.v('lgl-pop-cod'), titulo: LGL.v('lgl-pop-tit'), area: LGL.v('lgl-pop-area'),
      objetivo: LGL.v('lgl-pop-obj'), gatilho: LGL.v('lgl-pop-gat'),
      passos: LGL._passos(LGL.v('lgl-pop-passos')), checklist: LGL._check(LGL.v('lgl-pop-check')),
    }, 'POP criado em rascunho.');
  };
  LGL.popPublicar = (id) => LGL.post(`/interno/pops/${id}/publicar`, {}, 'POP em vigor (aprovação registrada com seu nome).');
  LGL.popAbrir = async function (id) {
    const { pop } = await LG.api('GET', '/interno/pops/' + id);
    LG.body().innerHTML = `<p><button class="btn secund peq" onclick="LG.ir('interno')">← Portal interno</button></p>
      <div class="card"><h3>${esc(pop.codigo ? pop.codigo + ' · ' : '')}${esc(pop.titulo)} ${LGL.tag(pop.status)} <span class="sub">v${pop.versao}</span></h3>
      <p class="sub">${esc(pop.area || '')} · gatilho: ${esc(pop.gatilho || '—')} · responsável: ${esc(pop.responsavel || '—')}
      ${pop.aprovado_por ? ` · aprovado por ${esc(pop.aprovado_por)} em ${LG.dt(pop.vigente_desde)}` : ''}</p>
      <p>${esc(pop.objetivo || '')}</p>
      ${tabela(['#', 'Ação', 'Responsável', 'Evidência'], (pop.passos || []).map(p => [p.ordem, esc(p.acao), esc(p.responsavel || '—'), esc(p.evidencia || '—')]))}</div>
      <div class="card"><h3>☑️ Executar checklist (Cap. 7.7)</h3>
      <p class="sub">Itens marcados com * são obrigatórios: sem eles o sistema não deixa concluir.</p>
      ${(pop.checklist || []).map((c, i) => `<label><input type="checkbox" id="lgl-pk-${i}"> ${esc(c.item)}${c.obrigatorio ? ' <b>*</b>' : ''}</label><br>`).join('')}
      <div class="hi-grid"><label>Referência (tipo) <input id="lgl-pk-rt" maxlength="40" placeholder="case/deadline/contract"></label>
        <label>Referência (id) <input id="lgl-pk-ri" maxlength="40"></label></div>
      <button class="btn peq" onclick="LGL.popExecutar('${pop.id}',${(pop.checklist || []).length},true)">Concluir execução</button>
      <button class="btn secund peq" onclick="LGL.popExecutar('${pop.id}',${(pop.checklist || []).length},false)">Salvar parcial</button>
      ${(pop.execucoes || []).length ? tabela(['Quando', 'Quem', 'Concluído', 'Referência'], pop.execucoes.map(e => [
        LG.dt(e.criado_em), esc(e.quem || ''), e.concluido ? 'sim' : 'parcial', esc((e.ref_tipo || '') + ' ' + (e.ref_id || ''))])) : ''}</div>`;
  };
  LGL.popExecutar = async function (id, qtd, concluido) {
    const { pop } = await LG.api('GET', '/interno/pops/' + id);
    const marcados = (pop.checklist || []).map((c, i) => ({ item: c.item, ok: LGL.chk('lgl-pk-' + i) }));
    try {
      await LG.api('POST', `/interno/pops/${id}/executar`, {
        marcados, concluido, ref_tipo: LGL.v('lgl-pk-rt'), ref_id: LGL.v('lgl-pk-ri'),
      });
      alert(concluido ? 'Execução concluída.' : 'Parcial salva.');
      LGL.popAbrir(id);
    } catch (e) { alert('Erro: ' + e.message); }
  };
  LGL.diCriar = async function () {
    if (!LGL.v('lgl-di-dec')) return alert('Descreva a decisão.');
    await LGL.post('/interno/decisoes', {
      assunto: LGL.v('lgl-di-ass'), decisao: LGL.v('lgl-di-dec'), motivo: LGL.v('lgl-di-mot'),
      participantes: LGL.v('lgl-di-part'), revisar_em: LGL.v('lgl-di-rev'),
    }, 'Decisão registrada.');
  };
  LGL.irCriar = async function () {
    if (!LGL.v('lgl-ir-ass')) return alert('Informe o assunto.');
    await LGL.post('/interno/pedidos', {
      de_area: LGL.v('lgl-ir-de'), para_area: LGL.v('lgl-ir-para'), assunto: LGL.v('lgl-ir-ass'),
      pedido: LGL.v('lgl-ir-ped'), prazo: LGL.v('lgl-ir-prazo'), prioridade: LGL.v('lgl-ir-pri'),
    }, 'Solicitação aberta.');
  };
  LGL.irConcluir = (id) => LGL.patch('/interno/pedidos/' + id, { status: 'concluida', resposta: prompt('Resposta:') || '' }, 'Concluída.');

  // ================== PARTE VIII · COMPLIANCE, LGPD, RISCOS E CRISES
  VIEWS.compliance = async function () {
    const [{ resumo: r }, pol, ris, den, dd, inv, tit, inc, temp, invg, planos, obg, sysinv] = await Promise.all([
      LG.api('GET', '/compliance/painel'), LG.api('GET', '/compliance/politicas'),
      LG.api('GET', '/compliance/riscos'), LG.api('GET', '/compliance/denuncias'),
      LG.api('GET', '/compliance/dd'), LG.api('GET', '/lgpd/inventario'),
      LG.api('GET', '/lgpd/titulares'), LG.api('GET', '/lgpd/incidentes'),
      LG.api('GET', '/lgpd/temporalidade'), LG.api('GET', '/crises/investigacoes'),
      LG.api('GET', '/crises/planos'), LG.api('GET', '/compliance/obrigacoes'),
      LG.api('GET', '/interno/inventario'),
    ]);
    const kpi = (rot, val, alerta) => `<div class="card" style="min-width:145px;flex:1${alerta && val ? ';border-color:var(--alerta)' : ''}">
      <div class="sub">${rot}</div><div style="font-size:1.3rem;font-weight:700${alerta && val ? ';color:var(--alerta)' : ''}">${val}</div></div>`;

    let h = LGL.livro('Parte VIII do livro: compliance (Cap. 41), LGPD e cibersegurança (42), investigações e continuidade (44), política institucional de uso de IA (6.10/42.12) e tabela de temporalidade (8.8/35.11).');
    h += `<div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
      ${kpi('Riscos abertos', r.riscos_abertos)}${kpi('Riscos alto/crítico', r.riscos_criticos, true)}
      ${kpi('Políticas vigentes', r.politicas_vigentes)}${kpi('Políticas a revisar', r.politicas_sem_revisao, true)}
      ${kpi('Denúncias abertas', r.denuncias_abertas, true)}
      ${kpi('Titulares no prazo', r.titulares_no_prazo)}${kpi('Titulares ATRASADOS', r.titulares_atrasados, true)}
      ${kpi('Incidentes abertos', r.incidentes_abertos, true)}${kpi('Tratamentos mapeados', r.tratamentos)}
      ${kpi('DD vencidas', r.dd_vencidas, true)}${kpi('Planos sem teste', r.planos_teste_vencido, true)}
      ${kpi('Obrigações vencidas', r.obrigacoes_vencidas, true)}</div>`;

    // matriz de riscos (41.2)
    const probs = ['provavel', 'possivel', 'remoto'], imps = ['critico', 'alto', 'medio', 'baixo'];
    h += `<div class="card"><h3>🌡️ Matriz de riscos (Cap. 41.2)</h3>
      ${tabela(['Probabilidade × Impacto', ...imps], probs.map(p => [p, ...imps.map(i => {
        const n = (r.matriz[p] && r.matriz[p][i]) || 0;
        const alto = (p === 'provavel' && i !== 'baixo') || (i === 'critico');
        return n ? `<b style="color:${alto ? '#b3261e' : '#1F2933'}">${n}</b>` : '—';
      })]))}
      ${LGL.box('➕ Novo risco', `
        <label>Risco * <input id="lgl-ri-txt" maxlength="2000"></label>
        <div class="hi-grid"><label>Escopo ${LGL.sel('lgl-ri-esc', ['escritorio', 'cliente', 'caso'], 'escritorio')}</label>
          <label>Categoria ${LGL.sel('lgl-ri-cat', ['juridico', 'operacional', 'financeiro', 'tecnologico', 'reputacional', 'regulatorio', 'etico'], 'operacional')}</label>
          <label>Probabilidade ${LGL.sel('lgl-ri-prob', ['provavel', 'possivel', 'remoto'], 'possivel')}</label>
          <label>Impacto ${LGL.sel('lgl-ri-imp', ['critico', 'alto', 'medio', 'baixo'], 'medio')}</label>
          <label>Dono <input id="lgl-ri-dono" maxlength="120"></label>
          <label>Prazo <input id="lgl-ri-prazo" type="date"></label></div>
        <label>Controles existentes <textarea id="lgl-ri-ctrl" rows="2" maxlength="4000"></textarea></label>
        <label>Plano de correção (obrigatório se alto/crítico) <textarea id="lgl-ri-plano" rows="2" maxlength="4000"></textarea></label>`,
        'Registrar risco', 'LGL.riCriar()')}
      ${ris.riscos.length ? tabela(['Risco', 'Categoria', 'Prob.', 'Impacto', 'Dono', 'Status', ''], ris.riscos.map(x => [
        esc(String(x.risco).slice(0, 160)), LGL.tag(x.categoria), LGL.tag(x.probabilidade), LGL.grav(x.impacto === 'critico' ? 'critica' : x.impacto),
        esc(x.dono || '—'), LGL.tag(x.status),
        `<button class="btn secund peq" onclick="LGL.riStatus('${x.id}')">status</button>`])) : '<p class="vazio">—</p>'}</div>`;

    h += `<div class="card"><h3>📜 Políticas (código de conduta, uso de IA, privacidade, segurança)</h3>
      <p class="sub">A <b>política de uso de IA</b> do Cap. 6.10/42.12 é uma política aqui, com versão e ciência da equipe.</p>
      ${LGL.box('➕ Nova política', `
        <div class="hi-grid"><label>Tipo ${LGL.sel('lgl-po-tipo', ['codigo_conduta', 'politica_ia', 'privacidade', 'seguranca', 'interna', 'retencao'], 'politica_ia')}</label>
          <label>Revisar em <input id="lgl-po-rev" type="date"></label></div>
        <label>Título * <input id="lgl-po-tit" maxlength="300"></label>
        <label>Texto <textarea id="lgl-po-txt" rows="6" maxlength="60000"></textarea></label>
        <label><input type="checkbox" id="lgl-po-cie" checked> Exige ciência da equipe</label>`,
        'Criar política', 'LGL.poCriar()')}
      ${pol.politicas.length ? tabela(['Título', 'Tipo', 'Versão', 'Status', 'Vigente desde', 'Ciências', ''], pol.politicas.map(p => [
        esc(p.titulo), LGL.tag(p.tipo), 'v' + p.versao, LGL.tag(p.status), LG.dt(p.vigente_desde), p.ciencias,
        (p.status !== 'vigente' ? `<button class="btn peq" onclick="LGL.poPublicar('${p.id}')">publicar</button> ` : '')
        + `<button class="btn secund peq" onclick="LGL.ciencia('policy','${p.id}')">dar ciência</button>`])) : '<p class="vazio">—</p>'}</div>`;

    h += `<div class="card"><h3>🕵️ Canal de denúncias (Cap. 41.6)</h3>
      <p class="sub">Aceita relato anônimo com protocolo. Conteúdo visível só para quem tem compliance.</p>
      ${den.denuncias.length ? tabela(['Protocolo', 'Categoria', 'Anônimo', 'Recebida', 'Status', ''], den.denuncias.map(d => [
        esc(d.protocolo), esc(d.categoria), d.anonimo ? 'sim' : 'não', LG.dt(d.recebido_em), LGL.tag(d.status),
        `<button class="btn secund peq" onclick="LGL.denAbrir('${d.id}','${esc(d.protocolo)}')">apurar</button>`])) : '<p class="vazio">Nenhuma denúncia.</p>'}
      <div id="lgl-den-box"></div></div>`;

    h += `<div class="card"><h3>🔐 LGPD — inventário de dados e bases legais (Cap. 42.2/42.3)</h3>
      ${LGL.box('➕ Novo tratamento', `
        <label>Tratamento * <input id="lgl-dv-trat" maxlength="300" placeholder="cadastro de cliente, autos digitalizados..."></label>
        <div class="hi-grid"><label>Base legal ${LGL.sel('lgl-dv-base', ['exercicio_direitos', 'consentimento', 'contrato', 'obrigacao_legal', 'legitimo_interesse', 'outra'], 'exercicio_direitos')}</label>
          <label>Titulares <input id="lgl-dv-tit" maxlength="300" placeholder="clientes, colaboradores..."></label>
          <label>Retenção <input id="lgl-dv-ret" maxlength="500"></label></div>
        <label>Dados tratados <input id="lgl-dv-dados" maxlength="4000"></label>
        <label>Finalidade * <input id="lgl-dv-fin" maxlength="2000"></label>
        <label>Compartilhamentos (inclui plataformas de IA — Cap. 42.5) <input id="lgl-dv-comp" maxlength="2000"></label>
        <label>Medidas de segurança <input id="lgl-dv-med" maxlength="2000"></label>
        <label><input type="checkbox" id="lgl-dv-sens"> Contém dados sensíveis (Cap. 42.4)</label>`,
        'Cadastrar tratamento', 'LGL.dvCriar()')}
      ${inv.tratamentos.length ? tabela(['Tratamento', 'Base legal', 'Titulares', 'Sensível', 'Retenção', ''], inv.tratamentos.map(t => [
        esc(t.tratamento), LGL.tag(t.base_legal), esc(t.titulares || '—'), t.sensivel ? '⚠️ sim' : 'não', esc(t.retencao || '—'),
        `<button class="btn secund peq" onclick="LGL.dvRemover('${t.id}')">×</button>`])) : '<p class="vazio">—</p>'}</div>

      <div class="card"><h3>🙋 Pedidos de titulares (Cap. 42.10 — prazo de 15 dias)</h3>
      <div class="hi-grid"><label>Titular * <input id="lgl-ds-tit" maxlength="200"></label>
        <label>Contato <input id="lgl-ds-cont" maxlength="200"></label>
        <label>Tipo ${LGL.sel('lgl-ds-tipo', ['acesso', 'correcao', 'eliminacao', 'portabilidade', 'revogacao', 'informacao', 'oposicao'], 'acesso')}</label>
        <label>Recebido em <input id="lgl-ds-rec" type="date"></label></div>
      <label>Pedido <textarea id="lgl-ds-ped" rows="2" maxlength="4000"></textarea></label>
      <button class="btn peq" onclick="LGL.dsCriar()">Registrar pedido</button>
      ${tit.pedidos.length ? tabela(['Titular', 'Tipo', 'Recebido', 'Prazo', 'Status', ''], tit.pedidos.map(p => [
        esc(p.titular), LGL.tag(p.tipo), LG.dt(p.recebido_em),
        p.atrasado ? `<b style="color:#b3261e">${LG.dt(p.prazo_em)}</b>` : LG.dt(p.prazo_em), LGL.tag(p.status),
        p.status === 'recebido' || p.status === 'em_analise' ? `<button class="btn peq" onclick="LGL.dsResponder('${p.id}')">responder</button>` : ''])) : '<p class="vazio">—</p>'}</div>

      <div class="card"><h3>🚨 Incidentes de segurança (Cap. 42.9 / 44.7)</h3>
      ${LGL.box('➕ Registrar incidente', `
        <label>Título * <input id="lgl-in-tit" maxlength="300"></label>
        <div class="hi-grid"><label>Gravidade ${LGL.sel('lgl-in-grav', ['critica', 'alta', 'media', 'baixa'], 'media')}</label>
          <label>Titulares afetados <input id="lgl-in-qtd" type="number" value="0"></label>
          <label>Origem <input id="lgl-in-orig" maxlength="300"></label></div>
        <label>Descrição <textarea id="lgl-in-desc" rows="3" maxlength="20000"></textarea></label>
        <label>Dados afetados <input id="lgl-in-dados" maxlength="2000"></label>
        <label>Contenção imediata <textarea id="lgl-in-cont" rows="2" maxlength="4000"></textarea></label>
        <label><input type="checkbox" id="lgl-in-anpd"> ANPD notificada</label>
        <label><input type="checkbox" id="lgl-in-titc"> Titulares comunicados</label>`,
        'Registrar', 'LGL.inCriar()')}
      ${inc.incidentes.length ? tabela(['Título', 'Detectado', 'Gravidade', 'Afetados', 'ANPD', 'Status'], inc.incidentes.map(i => [
        esc(i.titulo), LG.dt(i.detectado_em), LGL.grav(i.gravidade), i.titulares_afetados,
        i.anpd_notificada ? 'sim' : 'não', LGL.tag(i.status)])) : '<p class="vazio">Nenhum incidente.</p>'}</div>

      <div class="card"><h3>🗄️ Tabela de temporalidade e eliminação segura (Cap. 8.8 / 35.11 / 35.12)</h3>
      <div class="hi-grid"><label>Tipo documental * <input id="lgl-tp-tipo" maxlength="200"></label>
        <label>Prazo de guarda * <input id="lgl-tp-prazo" maxlength="200" placeholder="5 anos após o trânsito em julgado"></label>
        <label>Contagem desde <input id="lgl-tp-desde" maxlength="200"></label>
        <label>Destinação ${LGL.sel('lgl-tp-dest', ['eliminacao', 'guarda_permanente', 'devolucao_cliente'], 'eliminacao')}</label>
        <label>Base legal <input id="lgl-tp-base" maxlength="500"></label></div>
      <button class="btn peq" onclick="LGL.tpSalvar()">Salvar linha</button>
      ${temp.tabela.length ? tabela(['Tipo documental', 'Prazo', 'Contagem desde', 'Destinação', ''], temp.tabela.map(t => [
        esc(t.tipo_documental), esc(t.prazo_guarda), esc(t.contagem_desde || '—'), LGL.tag(t.destinacao),
        `<button class="btn secund peq" onclick="LGL.tpRemover('${t.id}')">×</button>`])) : '<p class="vazio">—</p>'}
      <p class="sub" style="margin-top:.6rem">Registrar eliminação (exige autorização nominal e motivo):</p>
      <div class="hi-grid"><label>Descrição do que foi eliminado <input id="lgl-el-desc" maxlength="2000"></label>
        <label>Motivo/base <input id="lgl-el-mot" maxlength="2000"></label>
        <label>Método <input id="lgl-el-met" maxlength="300"></label></div>
      <label><input type="checkbox" id="lgl-el-cli"> Cliente avisado</label>
      <button class="btn peq" onclick="LGL.elCriar()">Registrar eliminação</button>
      ${temp.eliminacoes.length ? tabela(['Quando', 'Descrição', 'Autorizado por'], temp.eliminacoes.slice(0, 20).map(e => [
        LG.dt(e.executado_em), esc(e.descricao), esc(e.autorizado_por)])) : ''}</div>

      <div class="card"><h3>🧰 Due diligence de terceiros (Cap. 41.7)</h3>
      <div class="hi-grid"><label>Terceiro * <input id="lgl-dd-ter" maxlength="300"></label>
        <label>Tipo ${LGL.sel('lgl-dd-tipo', ['fornecedor', 'parceiro', 'correspondente', 'cliente', 'contraparte'], 'fornecedor')}</label>
        <label>Resultado ${LGL.sel('lgl-dd-res', ['pendente', 'aprovado', 'aprovado_com_ressalva', 'reprovado'], 'pendente')}</label>
        <label>Validade <input id="lgl-dd-val" type="date"></label></div>
      <label>Ressalvas <input id="lgl-dd-ress" maxlength="4000"></label>
      <button class="btn peq" onclick="LGL.ddCriar()">Registrar</button>
      ${dd.registros.length ? tabela(['Terceiro', 'Tipo', 'Resultado', 'Validade'], dd.registros.map(t => [
        esc(t.terceiro), LGL.tag(t.tipo), LGL.tag(t.resultado), LG.dt(t.validade)])) : '<p class="vazio">—</p>'}</div>

      <div class="card"><h3>🔧 Inventário de sistemas e automações (Cap. 12.8/12.9)</h3>
      ${LGL.box('➕ Novo item', `
        <label>Nome * <input id="lgl-si-nome" maxlength="200"></label>
        <div class="hi-grid"><label>Tipo ${LGL.sel('lgl-si-tipo', ['sistema', 'automacao', 'agente', 'integracao', 'fornecedor'], 'sistema')}</label>
          <label>Criticidade ${LGL.sel('lgl-si-crit', ['critica', 'alta', 'media', 'baixa'], 'media')}</label>
          <label>Responsável <input id="lgl-si-resp" maxlength="120"></label>
          <label>Fornecedor <input id="lgl-si-forn" maxlength="200"></label>
          <label>Onde roda <input id="lgl-si-onde" maxlength="300"></label>
          <label>Onde fica a credencial (não a credencial!) <input id="lgl-si-cred" maxlength="300"></label></div>
        <label>Finalidade <input id="lgl-si-fin" maxlength="2000"></label>
        <label>Dados tratados <input id="lgl-si-dados" maxlength="2000"></label>
        <label>Plano de contingência (obrigatório se crítico) <textarea id="lgl-si-cont" rows="2" maxlength="4000"></textarea></label>
        <label>Plano de saída — como recuperar os dados (Cap. 12.7) <textarea id="lgl-si-saida" rows="2" maxlength="4000"></textarea></label>`,
        'Cadastrar', 'LGL.siCriar()')}
      ${sysinv.itens.length ? tabela(['Nome', 'Tipo', 'Criticidade', 'Responsável', 'Contingência', ''], sysinv.itens.map(i => [
        esc(i.nome), LGL.tag(i.tipo), LGL.grav(i.criticidade === 'critica' ? 'critica' : i.criticidade), esc(i.responsavel || '—'),
        i.plano_contingencia ? 'sim' : '<b style="color:#b3261e">não</b>',
        `<button class="btn secund peq" onclick="LGL.siRemover('${i.id}')">×</button>`])) : '<p class="vazio">—</p>'}</div>

      <div class="card"><h3>🔍 Investigações internas e continuidade (Cap. 44)</h3>
      ${LGL.box('➕ Nova investigação', `
        <label>Objeto * <input id="lgl-iv-obj" maxlength="500"></label>
        <label>Escopo <textarea id="lgl-iv-esc" rows="2" maxlength="4000"></textarea></label>
        <label>Cronologia dos fatos <textarea id="lgl-iv-cro" rows="3" maxlength="20000"></textarea></label>
        <label>Entrevistas <textarea id="lgl-iv-ent" rows="2" maxlength="20000"></textarea></label>
        <label>Conclusões (obrigatórias para concluir) <textarea id="lgl-iv-con" rows="2" maxlength="20000"></textarea></label>
        <div class="hi-grid"><label>Status ${LGL.sel('lgl-iv-st', ['aberta', 'em_curso', 'concluida', 'arquivada'], 'aberta')}</label>
          <label>Protocolo da denúncia (id) <input id="lgl-iv-rep" maxlength="40"></label></div>`,
        'Salvar investigação', 'LGL.ivCriar()')}
      ${invg.investigacoes.length ? tabela(['Objeto', 'Status', 'Responsável', 'Aberta em'], invg.investigacoes.map(i => [
        esc(i.objeto), LGL.tag(i.status), esc(i.responsavel || '—'), LG.dt(i.criado_em)])) : '<p class="vazio">—</p>'}
      <p class="sub" style="margin-top:.6rem">Planos de continuidade (Cap. 44.9):</p>
      <div class="hi-grid"><label>Cenário * <input id="lgl-pl-cen" maxlength="300"></label>
        <label>RTO <input id="lgl-pl-rto" maxlength="100"></label>
        <label>Último teste <input id="lgl-pl-teste" type="date"></label></div>
      <label>Procedimento * <textarea id="lgl-pl-proc" rows="2" maxlength="8000"></textarea></label>
      <label>Alternativa <input id="lgl-pl-alt" maxlength="4000"></label>
      <button class="btn peq" onclick="LGL.plCriar()">Salvar plano</button>
      ${planos.planos.length ? tabela(['Cenário', 'RTO', 'Último teste'], planos.planos.map(p => [
        esc(p.cenario), esc(p.rto || '—'), p.teste_vencido ? `<b style="color:#b3261e">${esc(p.ultimo_teste || 'nunca')}</b>` : esc(p.ultimo_teste)])) : ''}</div>

      <div class="card"><h3>📋 Matriz de obrigações legais do cliente (Cap. 31.2)</h3>
      <div class="hi-grid"><label>client_id * <input id="lgl-om-cli" maxlength="40"></label>
        <label>Obrigação * <input id="lgl-om-obg" maxlength="500"></label>
        <label>Norma <input id="lgl-om-norma" maxlength="300"></label>
        <label>Órgão <input id="lgl-om-org" maxlength="200"></label>
        <label>Periodicidade ${LGL.sel('lgl-om-per', ['unica', 'mensal', 'trimestral', 'semestral', 'anual', 'eventual'], 'anual')}</label>
        <label>Próximo vencimento <input id="lgl-om-venc" type="date"></label></div>
      <label>Risco do descumprimento <input id="lgl-om-risco" maxlength="2000"></label>
      <button class="btn peq" onclick="LGL.omCriar()">Salvar obrigação</button>
      ${obg.obrigacoes.length ? tabela(['Cliente', 'Obrigação', 'Norma', 'Periodicidade', 'Vencimento', 'Status', ''], obg.obrigacoes.map(o => [
        esc(o.cliente || o.client_id), esc(o.obrigacao), esc(o.norma || '—'), esc(o.periodicidade), LG.dt(o.proximo_vencimento), LGL.tag(o.status),
        `<button class="btn secund peq" onclick="LGL.omRemover('${o.id}')">×</button>`])) : '<p class="vazio">—</p>'}</div>`;
    LG.body().innerHTML = h;
  };

  LGL.riCriar = async function () {
    if (!LGL.v('lgl-ri-txt')) return alert('Descreva o risco.');
    await LGL.post('/compliance/riscos', {
      risco: LGL.v('lgl-ri-txt'), escopo: LGL.v('lgl-ri-esc'), categoria: LGL.v('lgl-ri-cat'),
      probabilidade: LGL.v('lgl-ri-prob'), impacto: LGL.v('lgl-ri-imp'), dono: LGL.v('lgl-ri-dono'),
      prazo: LGL.v('lgl-ri-prazo'), controles: LGL.v('lgl-ri-ctrl'), plano_correcao: LGL.v('lgl-ri-plano'),
    }, 'Risco registrado.');
  };
  LGL.riStatus = async function (id) {
    const st = prompt('Novo status (aberto, tratando, mitigado, aceito, fechado):', 'tratando');
    if (!st) return;
    await LGL.patch('/compliance/riscos/' + id, { status: st }, 'Status atualizado.');
  };
  LGL.poCriar = async function () {
    if (!LGL.v('lgl-po-tit')) return alert('Informe o título.');
    await LGL.post('/compliance/politicas', {
      tipo: LGL.v('lgl-po-tipo'), titulo: LGL.v('lgl-po-tit'), texto: LGL.v('lgl-po-txt'),
      revisar_em: LGL.v('lgl-po-rev'), exige_ciencia: LGL.chk('lgl-po-cie'),
    }, 'Política criada em rascunho.');
  };
  LGL.poPublicar = (id) => LGL.post(`/compliance/politicas/${id}/publicar`, {}, 'Política em vigor.');
  LGL.denAbrir = function (id, protocolo) {
    document.getElementById('lgl-den-box').innerHTML = `<div class="card" style="margin-top:.6rem"><b>${esc(protocolo)}</b>
      <label>Apuração <textarea id="lgl-den-ap" rows="3" maxlength="20000"></textarea></label>
      <label>Medidas <textarea id="lgl-den-med" rows="2" maxlength="8000"></textarea></label>
      <label>Status ${LGL.sel('lgl-den-st', ['recebida', 'em_apuracao', 'procedente', 'improcedente', 'arquivada'], 'em_apuracao')}</label>
      <button class="btn peq" onclick="LGL.denSalvar('${id}')">Salvar apuração</button></div>`;
  };
  LGL.denSalvar = (id) => LGL.patch('/compliance/denuncias/' + id, {
    apuracao: LGL.v('lgl-den-ap'), medidas: LGL.v('lgl-den-med'), status: LGL.v('lgl-den-st'),
  }, 'Apuração registrada.');
  LGL.dvCriar = async function () {
    if (!LGL.v('lgl-dv-trat')) return alert('Informe o tratamento.');
    await LGL.post('/lgpd/inventario', {
      tratamento: LGL.v('lgl-dv-trat'), base_legal: LGL.v('lgl-dv-base'), titulares: LGL.v('lgl-dv-tit'),
      retencao: LGL.v('lgl-dv-ret'), dados: LGL.v('lgl-dv-dados'), finalidade: LGL.v('lgl-dv-fin'),
      compartilhamentos: LGL.v('lgl-dv-comp'), medidas: LGL.v('lgl-dv-med'), sensivel: LGL.chk('lgl-dv-sens'),
    }, 'Tratamento cadastrado.');
  };
  LGL.dvRemover = (id) => LGL.del('/lgpd/inventario/' + id, 'Excluir tratamento do inventário?');
  LGL.dsCriar = async function () {
    if (!LGL.v('lgl-ds-tit')) return alert('Informe o titular.');
    await LGL.post('/lgpd/titulares', {
      titular: LGL.v('lgl-ds-tit'), contato: LGL.v('lgl-ds-cont'), tipo: LGL.v('lgl-ds-tipo'),
      recebido_em: LGL.v('lgl-ds-rec'), pedido: LGL.v('lgl-ds-ped'),
    }, 'Pedido registrado — prazo de 15 dias calculado automaticamente.');
  };
  LGL.dsResponder = async function (id) {
    const resposta = prompt('Resposta dada ao titular:');
    if (!resposta) return;
    const st = prompt('Status (atendido, parcial, recusado):', 'atendido');
    if (!st) return;
    await LGL.patch('/lgpd/titulares/' + id, { status: st, resposta }, 'Resposta registrada.');
  };
  LGL.inCriar = async function () {
    if (!LGL.v('lgl-in-tit')) return alert('Informe o título.');
    await LGL.post('/lgpd/incidentes', {
      titulo: LGL.v('lgl-in-tit'), gravidade: LGL.v('lgl-in-grav'), titulares_afetados: LGL.n('lgl-in-qtd'),
      origem: LGL.v('lgl-in-orig'), descricao: LGL.v('lgl-in-desc'), dados_afetados: LGL.v('lgl-in-dados'),
      contencao: LGL.v('lgl-in-cont'), anpd_notificada: LGL.chk('lgl-in-anpd'), titulares_comunicados: LGL.chk('lgl-in-titc'),
    }, 'Incidente registrado.');
  };
  LGL.tpSalvar = () => LGL.post('/lgpd/temporalidade', {
    tipo_documental: LGL.v('lgl-tp-tipo'), prazo_guarda: LGL.v('lgl-tp-prazo'),
    contagem_desde: LGL.v('lgl-tp-desde'), destinacao: LGL.v('lgl-tp-dest'), base_legal: LGL.v('lgl-tp-base'),
  }, false);
  LGL.tpRemover = (id) => LGL.del('/lgpd/temporalidade/' + id, 'Excluir linha da temporalidade?');
  LGL.elCriar = () => LGL.post('/lgpd/eliminacoes', {
    descricao: LGL.v('lgl-el-desc'), motivo: LGL.v('lgl-el-mot'), metodo: LGL.v('lgl-el-met'),
    cliente_avisado: LGL.chk('lgl-el-cli'),
  }, 'Eliminação registrada com o seu nome.');
  LGL.ddCriar = () => LGL.post('/compliance/dd', {
    terceiro: LGL.v('lgl-dd-ter'), tipo: LGL.v('lgl-dd-tipo'), resultado: LGL.v('lgl-dd-res'),
    validade: LGL.v('lgl-dd-val'), ressalvas: LGL.v('lgl-dd-ress'),
  }, 'Due diligence registrada.');
  LGL.siCriar = () => LGL.post('/interno/inventario', {
    nome: LGL.v('lgl-si-nome'), tipo: LGL.v('lgl-si-tipo'), criticidade: LGL.v('lgl-si-crit'),
    responsavel: LGL.v('lgl-si-resp'), fornecedor: LGL.v('lgl-si-forn'), onde_roda: LGL.v('lgl-si-onde'),
    credencial_onde: LGL.v('lgl-si-cred'), finalidade: LGL.v('lgl-si-fin'), dados_tratados: LGL.v('lgl-si-dados'),
    plano_contingencia: LGL.v('lgl-si-cont'), plano_saida: LGL.v('lgl-si-saida'),
  }, 'Item do inventário salvo.');
  LGL.siRemover = (id) => LGL.del('/interno/inventario/' + id, 'Excluir item do inventário?');
  LGL.ivCriar = () => LGL.post('/crises/investigacoes', {
    objeto: LGL.v('lgl-iv-obj'), escopo: LGL.v('lgl-iv-esc'), cronologia: LGL.v('lgl-iv-cro'),
    entrevistas: LGL.v('lgl-iv-ent'), conclusoes: LGL.v('lgl-iv-con'), status: LGL.v('lgl-iv-st'),
    report_id: LGL.v('lgl-iv-rep'),
  }, 'Investigação salva.');
  LGL.plCriar = () => LGL.post('/crises/planos', {
    cenario: LGL.v('lgl-pl-cen'), rto: LGL.v('lgl-pl-rto'), procedimento: LGL.v('lgl-pl-proc'),
    alternativa: LGL.v('lgl-pl-alt'), ultimo_teste: LGL.v('lgl-pl-teste'),
  }, 'Plano salvo.');
  LGL.omCriar = () => LGL.post('/compliance/obrigacoes', {
    client_id: LGL.v('lgl-om-cli'), obrigacao: LGL.v('lgl-om-obg'), norma: LGL.v('lgl-om-norma'),
    orgao: LGL.v('lgl-om-org'), periodicidade: LGL.v('lgl-om-per'), proximo_vencimento: LGL.v('lgl-om-venc'),
    risco_descumprimento: LGL.v('lgl-om-risco'),
  }, 'Obrigação salva.');
  LGL.omRemover = (id) => LGL.del('/compliance/obrigacoes/' + id, 'Excluir obrigação?');

  // ================================ MARKETING JURÍDICO (Cap. 13/14)
  VIEWS.conteudo = async function () {
    const [{ itens, painel, checklist }, { perguntas }] = await Promise.all([
      LG.api('GET', '/conteudo'), LG.api('GET', '/conteudo-perguntas'),
    ]);
    LGL._checkEtica = checklist;
    let h = LGL.livro('Cap. 13 e 14. Nada vai a “publicado” sem <b>revisão ética aprovada por advogado</b> — o checklist é o do Provimento 205/2021 (Cap. 13.10). Alterar o texto derruba a aprovação anterior.');
    h += `<div class="card"><h3>📅 Calendário editorial</h3>
      <p class="sub">Aguardando revisão ética: <b>${painel.aguardando_etica}</b> · reprovados: ${painel.reprovados} · publicados (90d): ${painel.publicados_periodo}</p>
      ${painel.proximos.length ? tabela(['Data', 'Título', 'Tipo', 'Status'], painel.proximos.map(p => [
        LG.dt(p.data_prevista), esc(p.titulo), esc(p.tipo), LGL.tag(p.status)])) : '<p class="vazio">Nada agendado.</p>'}</div>`;

    h += LGL.box('➕ Nova pauta/conteúdo', `
      <label>Título * <input id="lgl-co-tit" maxlength="300"></label>
      <div class="hi-grid"><label>Tipo ${LGL.sel('lgl-co-tipo', ['artigo', 'post', 'video', 'podcast', 'newsletter', 'pagina'], 'artigo')}</label>
        <label>Área <input id="lgl-co-area" maxlength="60"></label>
        <label>Canal <input id="lgl-co-canal" maxlength="120"></label>
        <label>Data prevista <input id="lgl-co-data" type="date"></label></div>
      <label>Público <input id="lgl-co-pub" maxlength="300"></label>
      <label>Pauta <textarea id="lgl-co-pauta" rows="2" maxlength="4000"></textarea></label>
      <label>Texto <textarea id="lgl-co-txt" rows="5" maxlength="60000"></textarea></label>
      <label>Palavras-chave (SEO — Cap. 14.6) <input id="lgl-co-kw" maxlength="500"></label>`,
      'Criar', 'LGL.coCriar()');

    h += `<div class="card"><h3>📝 Conteúdos</h3>${itens.length ? tabela(
      ['Título', 'Tipo', 'Status', 'Revisão ética', 'Publicado', ''],
      itens.map(i => [esc(i.titulo), LGL.tag(i.tipo), LGL.tag(i.status),
        i.etica_status === 'aprovado' ? `✅ ${esc(i.etica_por || '')}` : (i.etica_status === 'reprovado' ? '⛔ reprovado' : '⏳ pendente'),
        i.url_publicada ? `<a href="${esc(i.url_publicada)}" target="_blank" rel="noopener">link</a>` : '—',
        `<button class="btn secund peq" onclick="LGL.coAbrir('${i.id}')">abrir</button>`])) : '<p class="vazio">—</p>'}</div>`;

    h += `<div class="card"><h3>❓ Dúvidas do público → pauta (Cap. 14.3)</h3>
      <label>Pergunta <input id="lgl-cq-txt" maxlength="1000"></label>
      <div class="hi-grid"><label>Origem <input id="lgl-cq-orig" maxlength="60" placeholder="lead/portal/atendimento/redes"></label>
        <label>Área <input id="lgl-cq-area" maxlength="60"></label></div>
      <button class="btn peq" onclick="LGL.cqCriar()">Registrar dúvida</button>
      ${perguntas.length ? tabela(['Pergunta', 'Origem', 'Área', 'Vezes'], perguntas.map(p => [
        esc(p.pergunta), esc(p.origem || '—'), esc(p.area || '—'), p.frequencia])) : '<p class="vazio">—</p>'}</div>`;
    LG.body().innerHTML = h;
  };

  LGL.coCriar = async function () {
    if (!LGL.v('lgl-co-tit')) return alert('Informe o título.');
    await LGL.post('/conteudo', {
      titulo: LGL.v('lgl-co-tit'), tipo: LGL.v('lgl-co-tipo'), area: LGL.v('lgl-co-area'),
      canal: LGL.v('lgl-co-canal'), data_prevista: LGL.v('lgl-co-data'), publico: LGL.v('lgl-co-pub'),
      pauta: LGL.v('lgl-co-pauta'), texto: LGL.v('lgl-co-txt'), palavras_chave: LGL.v('lgl-co-kw'),
    }, 'Conteúdo criado.');
  };
  LGL.coAbrir = async function (id) {
    const { item: i, checklist } = await LG.api('GET', '/conteudo/' + id);
    const marcados = i.etica_itens || [];
    LG.body().innerHTML = `<p><button class="btn secund peq" onclick="LG.ir('conteudo')">← Conteúdos</button></p>
      <div class="card"><h3>${esc(i.titulo)} ${LGL.tag(i.status)}</h3>
      <p class="sub">${esc(i.tipo)} · ${esc(i.area || '')} · ${esc(i.canal || '')} · previsto ${LG.dt(i.data_prevista)}
      ${i.etica_status === 'aprovado' ? ` · ✅ ética aprovada por ${esc(i.etica_por)} em ${LG.dt(i.etica_em)}` : ` · ⏳ ética ${esc(i.etica_status)}`}</p>
      <label>Texto <textarea id="lgl-co-txt2" rows="10" maxlength="60000">${esc(i.texto || '')}</textarea></label>
      <label>Palavras-chave <input id="lgl-co-kw2" maxlength="500" value="${esc(i.palavras_chave || '')}"></label>
      <div class="hi-grid"><label>Status ${LGL.sel('lgl-co-st', ['ideia', 'producao', 'revisao_etica', 'aprovado', 'publicado', 'arquivado'], i.status)}</label>
        <label>URL publicada <input id="lgl-co-url" maxlength="500" value="${esc(i.url_publicada || '')}"></label></div>
      <button class="btn peq" onclick="LGL.coSalvar('${i.id}')">Salvar</button>
      <button class="btn secund peq" onclick="LGL.coNovaVersao('${i.id}')">Arquivar versão atual (Cap. 14.10)</button></div>

      <div class="card"><h3>⚖️ Revisão ética — Provimento 205/2021 (Cap. 13.10 / 14.5)</h3>
      <p class="sub">Itens em <b>negrito</b> são obrigatórios: qualquer um deles não marcado reprova o conteúdo.</p>
      ${checklist.map((c, k) => {
        const m = marcados.find(x => x.item === c.item);
        return `<label style="display:block;margin:.25rem 0"><input type="checkbox" id="lgl-et-${k}"${m && m.ok ? ' checked' : ''}>
          ${c.obrigatorio ? '<b>' : ''}${esc(c.item)}${c.obrigatorio ? '</b>' : ''}</label>`;
      }).join('')}
      <button class="btn peq" onclick="LGL.coEtica('${i.id}')">Registrar revisão ética</button></div>

      ${(i.versoes || []).length ? `<div class="card"><h3>🗂️ Versões arquivadas</h3>
        ${tabela(['Versão', 'Quando', 'Quem', 'URL'], i.versoes.map(v => [
          'v' + v.versao, LG.dt(v.criado_em), esc(v.quem || ''), esc(v.url || '—')]))}</div>` : ''}`;
  };
  LGL.coSalvar = (id) => LGL.patch('/conteudo/' + id, {
    texto: LGL.v('lgl-co-txt2'), palavras_chave: LGL.v('lgl-co-kw2'),
    status: LGL.v('lgl-co-st'), url_publicada: LGL.v('lgl-co-url'),
  }, 'Conteúdo salvo.').then(() => LGL.coAbrir(id)).catch(() => {});
  LGL.coEtica = async function (id) {
    const { checklist } = await LG.api('GET', '/conteudo/' + id);
    const itens = checklist.map((c, k) => ({ item: c.item, ok: LGL.chk('lgl-et-' + k) }));
    try {
      const r = await LG.api('POST', `/conteudo/${id}/etica`, { itens });
      alert(r.reprovado ? 'REPROVADO. Itens obrigatórios pendentes:\n- ' + r.pendentes.join('\n- ') : 'Revisão ética aprovada — o conteúdo já pode ser publicado.');
      LGL.coAbrir(id);
    } catch (e) { alert('Erro: ' + e.message); }
  };
  LGL.coNovaVersao = async function (id) {
    await LGL.post(`/conteudo/${id}/versoes`, {}, 'Versão arquivada.');
    LGL.coAbrir(id);
  };
  LGL.cqCriar = () => LGL.post('/conteudo-perguntas', {
    pergunta: LGL.v('lgl-cq-txt'), origem: LGL.v('lgl-cq-orig'), area: LGL.v('lgl-cq-area'),
  }, false);

  // ============================ 47.11 · CONTROLADORIA JURÍDICA
  VIEWS.controladoria = async function () {
    const [c, { indicadores: i }] = await Promise.all([
      LG.api('GET', '/controladoria'), LG.api('GET', '/controladoria/indicadores'),
    ]);
    const kpi = (rot, val, alerta) => `<div class="card" style="min-width:145px;flex:1${alerta && val ? ';border-color:var(--alerta)' : ''}">
      <div class="sub">${rot}</div><div style="font-size:1.3rem;font-weight:700${alerta && val ? ';color:var(--alerta)' : ''}">${val}</div></div>`;
    let h = LGL.livro('Protótipo 47.11. As conferências <b>não confiam no status preenchido por quem executou</b>: recalculam a partir dos dados, como o livro exige (“verifica os outros sistemas de forma independente de quem os opera”).');
    h += `<p><button class="btn" onclick="LGL.ctrRodar()">▶️ Rodar conferências agora</button>
      <span class="sub">${c.ultimo ? `Última execução: ${LG.dt(c.ultimo.criado_em)} — ${c.ultimo.achados} achado(s), ${c.ultimo.criticos} crítico(s).` : 'Nunca executada.'}</span></p>`;

    h += `<div style="display:flex;flex-wrap:wrap;gap:.6rem;margin:.6rem 0">
      ${kpi('Achados abertos', i.conferencias.achados_abertos, true)}${kpi('Críticos abertos', i.conferencias.criticos_abertos, true)}
      ${kpi('Prazos cumpridos', i.prazos.cumprimento_pct + '%')}${kpi('Prazos perdidos', i.prazos.perdidos, true)}
      ${kpi('Tarefas concluídas', i.tarefas.conclusao_pct + '%')}${kpi('Retrabalho', i.retrabalho, true)}
      ${kpi('Horas', i.horas.total + 'h')}${kpi('Aproveitamento', i.horas.aproveitamento_pct + '%')}
      ${kpi('Satisfação média', i.satisfacao.media + ' (' + i.satisfacao.respostas + ')')}</div>`;

    h += `<div class="card"><h3>🚩 Achados abertos</h3>${c.achados.length ? tabela(
      ['Gravidade', 'Conferência', 'Descrição', 'Responsável', ''],
      c.achados.map(a => [LGL.grav(a.gravidade), esc(a.regra), esc(a.descricao), esc(a.responsavel || '—'),
        `<button class="btn peq" onclick="LGL.ctrTratar('${a.id}','tratado')">tratado</button>
         <button class="btn secund peq" onclick="LGL.ctrTratar('${a.id}','falso_positivo')">falso positivo</button>`]))
      : '<p class="vazio">Nenhum achado aberto — o sistema está no padrão.</p>'}</div>`;

    h += `<div class="card"><h3>👥 Carteira por advogado (Cap. 40.8)</h3>
      ${tabela(['Responsável', 'Processos ativos', 'Risco provável'], i.carteira.map(x => [
        esc(x.responsavel || '(sem responsável)'), x.processos, x.risco_provavel]))}</div>
      <div class="card"><h3>📚 Resultado por tipo de demanda (Cap. 40.9)</h3>
      ${tabela(['Classe', 'Processos', 'Encerrados'], i.por_classe.map(x => [esc(x.classe), x.n, x.encerrados]))}</div>
      <div class="card"><h3>🕘 Histórico de execuções</h3>
      ${tabela(['Quando', 'Escopo', 'Achados', 'Críticos', 'Quem'], c.runs.map(r => [
        LG.dt(r.criado_em), esc(r.escopo), r.achados, r.criticos, esc(r.quem || '')]))}
      <p class="sub">Conferências ativas: ${c.regras.map(r => esc(r.id)).join(' · ')}</p></div>`;
    LG.body().innerHTML = h;
  };
  LGL.ctrRodar = () => LGL.post('/controladoria/rodar', { escopo: 'manual' }, 'Conferências executadas.');
  LGL.ctrTratar = async function (id, status) {
    const observacao = status === 'falso_positivo' ? (prompt('Justifique o falso positivo:') || '') : (prompt('Observação (opcional):') || '');
    if (status === 'falso_positivo' && !observacao) return alert('Falso positivo exige justificativa.');
    await LGL.patch('/controladoria/achados/' + id, { status, observacao }, 'Achado atualizado.');
  };

  // ======================= 47.12 · CENTRAL DE AGENTES JURÍDICOS
  VIEWS.agentes = async function () {
    const c = await LG.api('GET', '/agentes/central');
    let h = LGL.livro('Protótipo 47.12 com os <b>três blocos do Cap. 10.10</b>: o que o agente faz sozinho, o que só faz com aprovação humana e o que é proibido. Agente sem carta escrita aparece como pendência de governança.');
    if (c.sem_carta.length) {
      h += `<div class="card" style="border-color:var(--alerta)"><h3>⚠️ ${c.sem_carta.length} agente(s) ativo(s) sem carta de limites</h3>
        <p class="sub">${c.sem_carta.map(a => esc(a.nome)).join(' · ')}</p></div>`;
    }
    h += LGL.box('➕ Carta de limites de autonomia', `
      <div class="hi-grid"><label>Identificador do agente * <input id="lgl-ag-id" maxlength="60" placeholder="civel, publicacoes, financeiro..."></label>
        <label>Nome <input id="lgl-ag-nome" maxlength="200"></label>
        <label>Responsável <input id="lgl-ag-resp" maxlength="120"></label></div>
      <label>Escopo <textarea id="lgl-ag-esc" rows="2" maxlength="4000"></textarea></label>
      <label>Faz sozinho (uma ação por linha) <textarea id="lgl-ag-pode" rows="3" maxlength="4000"></textarea></label>
      <label>Só com aprovação humana * (uma por linha) <textarea id="lgl-ag-aprov" rows="3" maxlength="4000"></textarea></label>
      <label>Proibido * (uma por linha) <textarea id="lgl-ag-proib" rows="3" maxlength="4000"></textarea></label>
      <label>Dados que acessa <input id="lgl-ag-dados" maxlength="2000"></label>`,
      'Salvar carta', 'LGL.agSalvar()');

    h += `<div class="card"><h3>🤖 Cartas de autonomia</h3>${c.cartas.length ? c.cartas.map(a => `<div class="card" style="padding:.6rem">
      <b>${esc(a.nome)}</b> <span class="sub">(${esc(a.agente)}) · responsável ${esc(a.responsavel || '—')} · revisada ${LG.dt(a.ultima_revisao)} · ${a.execucoes_30d} execução(ões) em 30d</span>
      <p class="sub">${esc(a.escopo || '')}</p>
      <div class="hi-grid">
        <div><b>Faz sozinho</b><ul>${a.pode_sozinho.map(x => `<li>${esc(x)}</li>`).join('') || '<li>—</li>'}</ul></div>
        <div><b>Só com aprovação</b><ul>${a.exige_aprovacao.map(x => `<li>${esc(x)}</li>`).join('') || '<li>—</li>'}</ul></div>
        <div><b>Proibido</b><ul>${a.proibido.map(x => `<li>${esc(x)}</li>`).join('') || '<li>—</li>'}</ul></div></div>
      <button class="btn secund peq" onclick="LGL.agRemover('${a.id}')">excluir</button></div>`).join('') : '<p class="vazio">Nenhuma carta cadastrada.</p>'}</div>`;

    h += `<div class="card"><h3>📜 Últimas execuções registradas</h3>${c.execucoes.length ? tabela(
      ['Quando', 'Agente', 'Modelo', 'Status', 'Tokens', 'Custo (US¢)', 'Detalhe'],
      c.execucoes.map(e => [LG.dt(e.quando), esc(e.agente || '—'), esc(e.modelo || '—'), LGL.tag(e.status),
        (e.input_tokens || 0) + '/' + (e.output_tokens || 0), e.custo_centavos_usd || 0, esc(String(e.detalhe || '').slice(0, 80))]))
      : '<p class="vazio">Nenhuma execução registrada.</p>'}</div>`;
    LG.body().innerHTML = h;
  };
  LGL.agSalvar = async function () {
    const linhas = (id) => LGL.v(id).split('\n').map(x => x.trim()).filter(Boolean);
    if (!LGL.v('lgl-ag-id')) return alert('Informe o identificador do agente.');
    await LGL.post('/agentes/cartas', {
      agente: LGL.v('lgl-ag-id'), nome: LGL.v('lgl-ag-nome'), responsavel: LGL.v('lgl-ag-resp'),
      escopo: LGL.v('lgl-ag-esc'), pode_sozinho: linhas('lgl-ag-pode'),
      exige_aprovacao: linhas('lgl-ag-aprov'), proibido: linhas('lgl-ag-proib'),
      dados_acessa: LGL.v('lgl-ag-dados'),
    }, 'Carta salva.');
  };
  LGL.agRemover = (id) => LGL.del('/agentes/cartas/' + id, 'Excluir carta de autonomia?');
})();
